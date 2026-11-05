/**
 * ko_readable_harness.mjs — AI 가 쓴 한국어 «깨짐» 거르기 감시 (2026-11-01)
 * ════════════════════════════════════════════════════════════════════════
 *  왜: AI 영작 첨삭 화면에 「신호 입력를 지도신.」·「지도 알는 어 지도 었다 알 지도 었다.」 같은
 *      뜻 없는 한국어가 나갔습니다(사장님 제보). 같은 모양의 «한글만 있으면 통과» 가 다른 AI 기능에도 있어
 *      공용 정본 src/ko-readable.ts 로 모으고 5곳에 붙였습니다.
 *
 *  A. 정본 판정 — 실사고 문장은 «깨짐», 정상 문장(반말·번역·영어 낱말+조사 포함)은 «정상»(짝)
 *  B. 템플릿 퍼즈 — 받침에 맞는 조사로 만든 정상 문장 수천 개는 거짓 경보 0, 틀린 조사로 만든 문장은 전부 잡음
 *  C. 배선 — 발음 코칭·AI 퀴즈·판단력·수업 중 질문·학부모 번역이 정본을 실제로 쓴다
 *  D. 수업 중 질문 핸들러를 가짜 환경으로 «실제로» 돌림 — 깨진 뜻은 비우고, 멀쩡한 뜻·주입 없음은 그대로(짝)
 *  E. 발음 코칭 두 줄을 오려 내 실제로 돌림 — 깨진 피드백은 기본 문구로
 *  F. 변이시험 — 정본 검사 하나씩 지우면 실제로 FAIL(조건 뒤집기 포함)
 *  환경변수 KO_SEED 로 퍼즈 씨앗을 바꿉니다(반복 실행용).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const rd = (f) => readFileSync(join(SRC, f), 'utf8');
const KO_SRC = rd('ko-readable.ts');
const SEED = Number(process.env.KO_SEED || 20261101) >>> 0;
const QUIET = process.env.KO_QUIET === '1';

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  if (!QUIET || !cond) console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ' — ' + extra : '')}`);
}
const sec = (t) => { if (!QUIET) console.log('\n' + t); };
const load = async (src) => import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(src)).toString('base64'));
/** 주석을 벗긴 사본 — 블록·줄 주석을 문자열 밖에서만 지웁니다(문자열 속 https:// 를 자르지 않음). */
function strip(src) {
  let out = '', inStr = null, inLine = false, inBlock = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { out += c; if (c === '\\') { out += n; i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') inStr = c;
    out += c;
  }
  return out;
}

const REAL_GARBLED = ['신호 입력를 지도신.', '어 신린 있다 없다', '지도 알는 어 지도 었다 알 지도 었다.', '있다 어 알는 사람 었다 알 있다 어 있는 어 알는 사람 었다.'];
const GOOD = [
  '지난 일이니까 과거형으로 써요.', '책은 watch 가 아니라 read 를 써요.', '주어가 he 라서 동사에 -s 를 붙여요.',
  '잘 골랐어! 이유도 멋지게 썼네.', '아, 그렇군요. 다 했어요.', '이 표현은 조금 딱딱하게 들려요.',
  '오늘 민수는 수업에 집중을 잘 했어요. 새로운 단어를 많이 배웠고 발음도 좋아졌어요. 다음 시간에는 읽기를 더 연습할 거예요. 집에서도 단어를 복습해 주세요.',
  '你好(nǐ hǎo)는 «안녕하세요» 라는 뜻이에요.', '정답은 2번이에요. glad 는 «기쁜» 이라는 뜻이에요.', '관사를 넣으면 더 자연스럽습니다.',
];

/** A 절의 판정 시나리오 — 정본(또는 변이본)에 돌려 실패 이름 목록을 돌려줍니다. */
function unitScenarios(K) {
  const bad = []; const t = (n, ok) => { if (!ok) bad.push(n); };
  t('A1 실사고 깨진 문장 4종 → 깨짐', REAL_GARBLED.every((g) => K.looksGarbledKo(g)));
  t('A2 정상 문장 10종(반말·번역·영어+조사·중국어 해설) → 깨짐 아님(짝)', GOOD.every((g) => !K.looksGarbledKo(g)));
  t('A3 틀린 조사 «만» 있는 문장 → 깨짐', K.looksGarbledKo('신호 입력를 지도해요.') && K.looksGarbledKo('사과을 먹어요.'));
  t('A4 반복 «만» 있는 짧은 문장 → 깨짐', K.looksGarbledKo('지도 알는 지도 지도 해요.') && !K.looksGarbledKo('지도 알는 지도 해요.'));
  t('A5 홀로 떨어진 조각 «만» 있는 문장 → 깨짐', K.looksGarbledKo('어 신린 있다 없다') && K.looksGarbledKo('그것은 좋 었다 정말.'));
  t('A6 영어 낱말 바로 뒤 조사는 정상', !K.looksGarbledKo('watch 가 아니라 read 를 써요.'));
  t('A7 한글이 없거나 빈 값은 «깨짐» 아님(판정 대상 아님)', !K.looksGarbledKo('') && !K.looksGarbledKo(null) && !K.looksGarbledKo('Good job!'));
  t('A8 엄격(isReadableKo): 존댓말 끝맺음이 아니면 거절, 맞으면 통과(짝)', !K.isReadableKo('지난 일이라 과거형을 쓴다.') && K.isReadableKo('지난 일이라 과거형을 써요.'));
  t('A9 엄격: 깨진 문장은 «요» 로 끝나도 거절', !K.isReadableKo('신호 입력를 지도해요.'));
  t('A10 엄격: 너무 짧거나 길면 거절', !K.isReadableKo('좋아요') && !K.isReadableKo('가'.repeat(199) + '요'.repeat(5)));
  t('A11 영어 칸: 한글 섞임·깨진 한국어는 거절, 영어는 통과(짝)',
    !K.isEnglishReply(REAL_GARBLED[3]) && !K.isEnglishReply('Nice! 잘했어요') && K.isEnglishReply('Wow, what a great day!'));
  t('A12 keepIfReadableKo: 깨지면 빈 값, 아니면 그대로', K.keepIfReadableKo(REAL_GARBLED[0]) === '' && K.keepIfReadableKo('  잘 골랐어요.  ') === '잘 골랐어요.');
  t('A14 «을» 로 끝나는 진짜 낱말(가을·마을·노을)은 정상, 두 글자 틀린 조사(책를)는 깨짐(짝)', !K.looksGarbledKo('가을 하늘이 맑아요.') && !K.looksGarbledKo('우리 마을 노을 이 예뻐요.') && K.looksGarbledKo('책를 읽어요.'));
  t('A13 긴 글은 흔한 낱말이 여러 번 나와도 정상(문장 15낱말 초과)',
    !K.looksGarbledKo('오늘 수업에서 새 단어를 배웠어요. 오늘 배운 단어는 apple 이에요. 오늘 숙제는 단어 쓰기예요. 다음 시간에도 단어 시험을 볼 거예요. 집에서 꼭 복습해 주세요.'));
  return bad;
}

// ── 템플릿 퍼즈: 받침에 맞는 조사 / 틀린 조사 ──
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const NOUN_J = ['책', '사과나무', '단어', '문장', '발음', '연필', '선생님', '친구', '숙제', '그림', '음악', '학교', '공책', '시간', '이름', '표현', '질문', '대답', '영어', '수업'];
const VERBS = ['읽어요', '써요', '좋아해요', '연습해요', '배워요', '들어요', '외워요', '봐요', '말해요', '고쳐요'];
const SUBJ = ['저는', '우리는', '민수는', '아이들은', '오늘은'];
const hasJ = (w) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c % 28 !== 0; };
function fuzz(K, seed, N) {
  const R = rng(seed); const pick = (a) => a[Math.floor(R() * a.length)];
  let falsePos = 0, missed = 0, threw = 0, exGood = '', exBad = '';
  for (let i = 0; i < N; i++) {
    const n = pick(NOUN_J), right = n + (hasJ(n) ? '을' : '를'), wrong = n + (hasJ(n) ? '를' : '을');
    const tail = R() < 0.5 ? '.' : '!';
    const good = `${pick(SUBJ)} ${right} ${pick(VERBS)}${tail}`;
    const badS = `${pick(SUBJ)} ${wrong} ${pick(VERBS)}${tail}`;
    try {
      if (K.looksGarbledKo(good) || !K.isReadableKo(good)) { falsePos++; exGood = exGood || good; }
      if (!K.looksGarbledKo(badS)) { missed++; exBad = exBad || badS; }
    } catch { threw++; }
  }
  return { falsePos, missed, threw, exGood, exBad };
}

const K = await load(KO_SRC);

sec('[ A. 정본 판정 — 실사고 문장 · 정상 문장(짝) ]');
{
  const bad = unitScenarios(K);
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14'])
    check(`시나리오 ${n}`, !bad.some((b) => b.startsWith(n + ' ')), bad.find((b) => b.startsWith(n + ' ')));
  const garbledGood = GOOD.filter((g) => K.looksGarbledKo(g));
  if (garbledGood.length) console.log('   ↳ 거짓 경보:', garbledGood);
}

sec(`[ B. 템플릿 퍼즈 — 씨앗 ${SEED}, 4,000쌍 ]`);
{
  const v = fuzz(K, SEED, 4000);
  check('B1 받침에 맞는 조사로 만든 정상 문장 — 거짓 경보 0', v.falsePos === 0, `${v.falsePos}건 · 예: ${v.exGood}`);
  check('B2 받침과 안 맞는 조사 문장 — 전부 깨짐으로 잡음', v.missed === 0, `${v.missed}건 · 예: ${v.exBad}`);
  check('B3 던지지 않는다', v.threw === 0, `${v.threw}건`);
}

sec('[ C. 배선 — 다섯 기능이 정본을 실제로 쓴다(주석 벗긴 사본) ]');
{
  const games = strip(rd('api-games.ts')), jud = strip(rd('api-judgment.ts')), ai = strip(rd('api-ai.ts')),
        mango = strip(rd('api-translate.ts')), ask = rd('class-ask.ts');
  check('C1 발음 코칭: 정본 import', /import \{[^}]*\bisReadableKo\b[^}]*\} from '\.\/ko-readable'/.test(games));
  check('C2 발음 코칭: 피드백·제안 둘 다 엄격 판정', /if \(j\.feedback && isReadableKo\(j\.feedback\)\)/.test(games) && /if \(j\.suggestion && isReadableKo\(j\.suggestion\)\)/.test(games));
  check('C3 AI 퀴즈: 문제 글이 깨진 문항은 빼고, 해설만 깨졌으면 비운다',
    /parsed\.list = parsed\.list\.filter\(\(q: any\) => !looksGarbledKo\(q && q\.q\)\)/.test(games) && /if \(q && looksGarbledKo\(q\.explain\)\) q\.explain = ''/.test(games));
  const gi = games.indexOf('const parsed = rqParseQuestions(arr);'), fi = games.indexOf('parsed.list = parsed.list.filter((q: any) => !looksGarbledKo');
  check('C4 AI 퀴즈: 거르기는 «AI 생성» 갈래(rqParseQuestions(arr) 바로 뒤)에만', gi > 0 && fi > gi && fi - gi < 1200);
  check('C5 판단력: feedback_ko·why_chosen_ko 둘 다 느슨 판정', /feedbackKo = keepIfReadableKo\(cleanKo\(/.test(jud) && /whyChosenKo = keepIfReadableKo\(cleanKo\(/.test(jud));
  check('C6 판단력: 비면 폴백 문구가 그대로 있다', /if \(!feedbackKo\) feedbackKo = isOptimal \?/.test(jud));
  check('C7 수업 중 질문: api-ai.ts 가 koOk 로 정본을 넘긴다', /koOk: \(s: string\) => !looksGarbledKo\(s\)/.test(ai));
  check('C8 수업 중 질문: class-ask.ts 는 여전히 import 0(class_ask_harness 전제)', !/^\s*import\s/m.test(ask));
  check('C9 학부모 번역: 깨지면 «못 만들었다» 갈래로', /const hasKo = \/\[가-힣\]\/\.test\(outKo\) && !looksGarbledKo\(outKo\)/.test(mango));
  check('C10 학부모 번역: 정본 import', /import \{ looksGarbledKo \} from '\.\/ko-readable'/.test(mango));
  check('C11 영작 첨삭: 판정 정본이 공용 정본을 쓴다', (() => { const m = rd('write-issue-triage.ts').match(/import \{([^}]*)\} from '\.\/ko-readable'/); return !!m && /\bisReadableKo\b/.test(m[1]) && /\bisEnglishReply\b/.test(m[1]); })());
  check('C12 정본은 import 0(하니스가 그대로 돌림)', !/^\s*import\s/m.test(KO_SRC));
}

sec('[ D. 수업 중 질문 핸들러를 가짜 환경으로 실제로 돌림 ]');
{
  const M = await load(rd('class-ask.ts'));
  const jsonF = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
  const req = (b) => new Request('https://x/api/ai/class-ask', { method: 'POST', body: JSON.stringify(b), headers: { 'cf-connecting-ip': '1.2.3.4' } });
  const env = (resp) => ({ SESSION_STATE: { get: async () => null, put: async () => {} }, AI: { run: async () => ({ response: resp }) } });
  const koOk = (s) => !K.looksGarbledKo(s);
  const r1 = await (await M.handleClassAsk(req({ q: 'What does glad mean?' }), env('EN: Glad means happy.\nKO: 지도 알는 어 지도 었다 알 지도 었다.'), { json: jsonF, koOk })).json();
  check('D1 깨진 한국어 뜻은 비우고 영어 답은 그대로', r1.ok === true && r1.en === 'Glad means happy.' && r1.ko === '', JSON.stringify(r1));
  const r2 = await (await M.handleClassAsk(req({ q: 'What does glad mean?' }), env('EN: Glad means happy.\nKO: glad 는 «기쁜» 이라는 뜻이에요.'), { json: jsonF, koOk })).json();
  check('D2 멀쩡한 뜻은 그대로(짝)', r2.ok === true && /기쁜/.test(r2.ko), JSON.stringify(r2));
  const r3 = await (await M.handleClassAsk(req({ q: 'What does glad mean?' }), env('EN: Glad means happy.\nKO: 지도 알는 어 지도 었다.'), { json: jsonF })).json();
  check('D3 koOk 를 안 넘기면 예전 동작 그대로(하위 호환)', r3.ok === true && r3.ko !== '', JSON.stringify(r3));
}

sec('[ E. 발음 코칭 두 줄을 오려 내 실제로 돌림 ]');
{
  const games = rd('api-games.ts');
  const m = games.match(/ {14}if \(j\.feedback && isReadableKo\(j\.feedback\)\)[^\n]*\n {14}if \(j\.suggestion && isReadableKo\(j\.suggestion\)\)[^\n]*/);
  check('E0 두 줄을 오려 냈다', !!m);
  if (m) {
    const run = new Function('j', 'isReadableKo', `let aiFeedback = '', suggestion = '';\n${m[0]}\nreturn { aiFeedback, suggestion };`);
    const a = run({ feedback: '어 신린 있다 없다', suggestion: '지도 알는 어 지도 었다 알 지도 었다.' }, K.isReadableKo);
    check('E1 깨진 피드백·제안은 받지 않는다(→ 아래 기본 문구)', a.aiFeedback === '' && a.suggestion === '', JSON.stringify(a));
    const b = run({ feedback: 'th 발음이 정확해졌어요.', suggestion: '모범 음성을 세 번 따라 해 보세요.' }, K.isReadableKo);
    check('E2 멀쩡한 피드백·제안은 받는다(짝)', !!b.aiFeedback && !!b.suggestion, JSON.stringify(b));
  }
}

sec('[ F. 변이시험 — 정본 검사를 하나씩 지우면 실제로 FAIL 나는가 ]');
{
  const MUT = [
    ['틀린 조사(를) 검사 제거', "if (m[2] === '를' && hasJong(m[1])) return true;", ''],
    ['틀린 조사(을) 검사 제거', "if (m[2] === '을' && !hasJong(m[1]) && !EUL_WORDS.test(t)) return true;", ''],
    ['«을» 낱말 예외 제거(거짓 경보)', ' && !EUL_WORDS.test(t)', ''],
    ['두 글자 낱말 건너뛰기 되살리기', 'if (!m) continue;', 'if (!m || t.length < 3) continue;'],
    ['반복 검사 제거', 'if (cnt[t] >= limit) return true;', ''],
    ['조각 검사 제거', '    return true;\n  }\n  return false;\n}', '  }\n  return false;\n}'],
    ['영어 뒤 조사 예외 제거(거짓 경보)', "if (/[A-Za-z0-9']$/.test(prev)) continue;", ''],
    ['끝맺음 검사 제거', "if (!/(요|니다)[.!?~\\s]*$/.test(s)) return false;", ''],
    ['조건 뒤집기(엄격 판정)', 'return !looksGarbledKo(s);', 'return looksGarbledKo(s);'],
    ['긴 글 반복 한도 제거(거짓 경보)', 'const limit = toks.length <= 15 ? 3 : Math.max(4, Math.ceil(toks.length / 4));', 'const limit = 3;'],
  ];
  for (const [name, from, to] of MUT) {
    if (!KO_SRC.includes(from)) { check(`F 변이 적용 가능: ${name}`, false, '앵커를 못 찾음 — 정본이 바뀌었으면 변이도 맞춰 주세요'); continue; }
    let caught = false, why = '';
    try {
      const Km = await load(KO_SRC.replace(from, to));
      const bad = unitScenarios(Km); const v = fuzz(Km, SEED, 800);
      caught = bad.length > 0 || v.falsePos > 0 || v.missed > 0 || v.threw > 0;
      why = caught ? '' : '시나리오·퍼즈가 전부 통과 — 검사가 헛돕니다';
    } catch (e) { caught = false; why = '변이본 적재 실패: ' + (e && e.message); }
    check(`F 변이가 실제로 잡힌다: ${name}`, caught, why);
  }
}

console.log(`\n${FAIL === 0 ? '🎉' : '💥'} ko_readable_harness — PASS ${PASS} / FAIL ${FAIL}  (seed ${SEED})`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
