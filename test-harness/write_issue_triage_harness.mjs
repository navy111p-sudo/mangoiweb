/**
 * write_issue_triage_harness.mjs — AI 영작 첨삭 «고칠 곳» 3단계 판정 감시 (2026-11-01)
 * ════════════════════════════════════════════════════════════════════════
 *  왜: 엘리더잼 원장님 피드백 — 맞게 쓴 표현까지 «이렇게 고치면 더 좋아요» 로 고쳐 보였습니다.
 *      (When the water boils → Once the water has boiled · teach → show · 원문과 똑같은 «수정»)
 *  정본: cloudflare-deploy/src/write-issue-triage.ts  (api-ai.ts 는 «부르기만» 합니다)
 *
 *  A. 원장님 사례 그대로 — 같은 문장·표현 차이는 «고칠 곳» 에 안 나간다
 *  B. 진짜 오류는 그대로 고친다(짝 — 앞만 보면 «전부 버리기» 도 통과합니다)
 *  C. 학생이 안 쓴 말·대소문자 오인용·중복·상한·이상한 입력
 *  D. 퍼즈 — 무작위 입력 수천 건으로 불변식(같은 수정 0건 · 안 쓴 말 0건 · 던지지 않음 · 결정론)
 *  E. 배선 — api-ai.ts 가 정본 결과를 쓰고, 단어장·판단력 기록엔 «오류» 만 들어간다
 *  F. 화면 — ai-write.html 의 «참고» 상자를 오려 내 실제로 그려 본다(취소선 없음 · 이스케이프)
 *  G. 변이시험 — 정본을 일부러 고장 내면 위 검사가 실제로 FAIL 나는가(조건 뒤집기 포함)
 *
 *  ⚠️ 문자열 검사만으로는 «무슨 답이 나오는가» 를 못 봅니다 — 정본을 타입 제거해 실제로 돌립니다.
 *  환경변수 TRIAGE_SEED 로 퍼즈 씨앗을 바꿉니다(반복 실행용). 기본 20261101.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');
const TRI_SRC = readFileSync(join(SRC, 'write-issue-triage.ts'), 'utf8');
const CR_SRC = readFileSync(join(SRC, 'correction-reason.ts'), 'utf8');
const AI_SRC = readFileSync(join(SRC, 'api-ai.ts'), 'utf8');
const HTML = readFileSync(join(PUB, 'ai-write.html'), 'utf8');
const SEED = Number(process.env.TRIAGE_SEED || 20261101) >>> 0;
const QUIET = process.env.TRIAGE_QUIET === '1';

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  if (!QUIET || !cond) console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ' — ' + extra : '')}`);
}
const sec = (t) => { if (!QUIET) console.log('\n' + t); };

// ── 정본 적재: 타입 제거 → 임시 폴더에 .mjs 로 → import ──
const TMP = mkdtempSync(join(tmpdir(), 'wit-'));
let modSeq = 0;
async function loadTriage(triSrc = TRI_SRC) {
  const n = ++modSeq;
  const crPath = join(TMP, `correction-reason-${n}.mjs`);
  const triPath = join(TMP, `write-issue-triage-${n}.mjs`);
  writeFileSync(crPath, stripTypeScriptTypes(CR_SRC));
  const triJs = stripTypeScriptTypes(triSrc).replace(/from '\.\/correction-reason'/, `from './correction-reason-${n}.mjs'`);
  writeFileSync(triPath, triJs);
  return import(pathToFileURL(triPath).href);
}

/** 핵심 판정 시나리오 — 정본(또는 변이본)에 돌려 실패한 이름 목록을 돌려줍니다. */
function coreScenarios(M) {
  const bad = [];
  const t = (name, ok) => { if (!ok) bad.push(name); };
  const tri = (text, issues) => M.triageIssues(text, issues);
  const TXT = "Today, I'll teach you how to make tteokbokki that I usually cook at home for my family. We make it at home with my family. To make tteokbokki, we need Korean rice cakes, green onions, and Korean red chili paste. When the water boils, add the rice cakes, green onions, and red chili paste.";
  // A — 원장님 사례
  let r = tri(TXT, [{ original: 'We make it at home with my family.', suggested: 'We make it at home with my family.', reason: '더 자연스러운 표현으로 바꿨어요.' }]);
  t('A1 같은 문장은 고칠 곳에 안 나간다', r.issues.length === 0 && r.suggestions.length === 0 && r.dropped[0]?.why === 'identical');
  r = tri(TXT, [{ original: 'We make it at home with my family. ', suggested: 'We make it at home with my family', category: 'error' }]);
  t('A2 끝 공백·마침표만 다른 것도 같은 문장(모델이 error 라 해도)', r.issues.length === 0 && r.suggestions.length === 0);
  r = tri("I don't know.", [{ original: 'I don’t know', suggested: "I don't know", category: 'error' }]);
  t('A3 곡선 따옴표만 다른 것도 같은 문장', r.issues.length === 0);
  r = tri(TXT, [{ original: 'When the water boils', suggested: 'Once the water has boiled', reason: '더 자연스러운 표현으로 바꿨어요.' }]);
  t('A4 When the water boils(분류 없음) → 인정(버림)', r.issues.length === 0 && r.suggestions.length === 0 && r.dropped[0]?.why === 'acceptable');
  r = tri(TXT, [{ original: "I'll teach you how to make tteokbokki", suggested: "I'll show you how to make tteokbokki", reason: '더 자연스러운 낱말로 바꿨어요.' }]);
  t('A5 teach → show(분류 없음) → 인정(버림)', r.issues.length === 0 && r.suggestions.length === 0);
  r = tri(TXT, [{ original: 'add the rice cakes, green onions, and red chili paste', suggested: 'add the rice cakes, green onions, and Korean red chili paste' }]);
  t('A6 Korean 덧붙이기(분류 없음) → 인정(버림)', r.issues.length === 0 && r.suggestions.length === 0);
  r = tri(TXT, [{ original: 'When the water boils', suggested: 'Once the water has boiled', category: 'unnatural', reason: '원어민은 이렇게도 자주 말해요.' }]);
  t('A7 모델이 unnatural 이라 하면 «참고» 로만(빨간 줄 아님)', r.issues.length === 0 && r.suggestions.length === 1 && r.suggestions[0].kind === 'suggest');
  r = tri(TXT, [{ original: 'When the water boils', suggested: 'Once the water has boiled', category: 'style' }]);
  t('A8 category=style 은 고칠 근거가 아니다(버림)', r.issues.length === 0 && r.suggestions.length === 0);
  // B — 진짜 오류는 고친다(짝)
  r = tri('I go there yesterday.', [{ original: 'I go there yesterday', suggested: 'I went there yesterday' }]);
  t('B1 시제 오류(분류 없음이어도 규칙으로) → 오류', r.issues.length === 1 && /과거형/.test(r.issues[0].reason));
  r = tri('She go to school every day.', [{ original: 'She go to school', suggested: 'She goes to school' }]);
  t('B2 3인칭 -s → 오류', r.issues.length === 1);
  r = tri('i like it.', [{ original: 'i like it', suggested: 'I like it' }]);
  t('B3 학생이 실제로 쓴 소문자 i → 대문자 오류로 고친다', r.issues.length === 1 && /대문자/.test(r.issues[0].reason));
  r = tri('I like junggle.', [{ original: 'junggle', suggested: 'jungle' }]);
  t('B4 철자 → 오류', r.issues.length === 1 && /철자/.test(r.issues[0].reason));
  r = tri('I watched a book.', [{ original: 'watched a book', suggested: 'read a book', category: 'error', reason: '책은 watch 가 아니라 read 를 써요.' }]);
  t('B5 규칙 밖 낱말 오류는 모델이 error 라 하면 고친다(모델 이유 사용)', r.issues.length === 1 && r.issues[0].reason.includes('read'));
  r = tri('I have many homework.', [{ original: 'many homework', suggested: 'a lot of homework', category: 'grammar', reason: 'x' }]);
  t('B6 category=grammar → 오류, 이유가 짧으면 정본 문구로', r.issues.length === 1 && r.issues[0].reason.length >= 6);
  // C — 안 쓴 말·오인용·중복·상한·이상한 입력
  r = tri('I like apples.', [{ original: 'I likes bananas', suggested: 'I like bananas', category: 'error' }]);
  t('C1 학생이 안 쓴 말을 고친 항목은 버린다', r.issues.length === 0 && r.dropped[0]?.why === 'not_in_text');
  r = tri('Today I went to the park.', [{ original: 'today I went', suggested: 'Today I went' }]);
  t('C2 학생은 대문자로 썼는데 모델이 소문자로 인용 → 버린다', r.issues.length === 0 && r.dropped[0]?.why === 'case_misquote');
  r = tri('I go there yesterday.', [{ original: 'I go there yesterday', suggested: 'I went there yesterday' }, { original: 'I go there yesterday', suggested: 'I went there yesterday' }]);
  t('C3 같은 지적이 두 번 오면 한 번만', r.issues.length === 1);
  const many = Array.from({ length: 8 }, (_, i) => ({ original: 'w' + i + 'x', suggested: 'w' + i + 'y', category: 'error' }));
  r = tri(many.map(m => m.original).join(' '), many);
  t('C4 오류 상한(MAX_ERRORS) 지킴', r.issues.length === M.MAX_ERRORS);
  const manyS = Array.from({ length: 8 }, (_, i) => ({ original: 'q' + i + 'a', suggested: 'q' + i + 'b', category: 'unnatural' }));
  r = tri(manyS.map(m => m.original).join(' '), manyS);
  t('C5 참고 상한(MAX_SUGGESTIONS) 지킴', r.suggestions.length === M.MAX_SUGGESTIONS);
  let threw = false;
  try { for (const x of [null, undefined, 'str', 42, {}, [null, 1, 'a', {}], [{ original: 5, suggested: {} }]]) tri('abc', x); tri(null, null); } catch { threw = true; }
  t('C6 이상한 입력에도 던지지 않는다', !threw);
  r = tri('I go there yesterday.', [{ original: 'I go there yesterday', suggested: 'I went there yesterday', category: 'unnatural' }]);
  t('C7 규칙상 오류면 모델이 unnatural 이라 해도 오류(빨간 줄)', r.issues.length === 1 && r.suggestions.length === 0);
  r = tri('Hello there my friend.', [{ original: 'Hello there', suggested: 'Hi there', category: 'unnatural', reason: '' }]);
  t('C8 참고의 이유가 비면 «지금도 맞다» 문구', r.suggestions.length === 1 && r.suggestions[0].reason === M.SUGGEST_FALLBACK_KO);
  return bad;
}

// ── 퍼즈 ──
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const WORDS = ['i', 'I', 'go', 'went', 'she', 'goes', 'to', 'the', 'a', 'an', 'school', 'park', 'water', 'boils', 'teach', 'show', 'you', 'make', 'made', 'it', 'at', 'home', 'with', 'my', 'family', 'eat', 'ate', 'apple', 'apples', 'happy', 'very', 'yesterday', 'today', 'Korean', 'red', 'paste', "don't", "doesn't", 'is', 'are', 'was', 'were', 'in', 'on', 'for', 'and', 'but'];
const PUNCT = ['', '.', '!', '?', ',', ' ', '  ', ' ', '. '];
function fuzz(M, seed, N) {
  const R = rng(seed); const pick = (a) => a[Math.floor(R() * a.length)];
  const viol = { threw: 0, identical: 0, notInText: 0, overCap: 0, emptyReason: 0, kindMix: 0, nondet: 0 };
  for (let n = 0; n < N; n++) {
    const len = 4 + Math.floor(R() * 14);
    const ws = Array.from({ length: len }, () => pick(WORDS));
    const text = ws.join(' ') + pick(PUNCT);
    const k = Math.floor(R() * 7);
    const issues = [];
    for (let j = 0; j < k; j++) {
      const a = Math.floor(R() * len), b = Math.min(len, a + 1 + Math.floor(R() * 4));
      let orig = ws.slice(a, b).join(' ');
      const mode = R();
      if (mode < 0.15) orig = pick(WORDS) + ' ' + pick(WORDS) + ' zzq';          // 안 쓴 말
      let sug;
      const m2 = R();
      if (m2 < 0.25) sug = orig + pick(PUNCT);                                     // 같은 문장(끝 부호만)
      else if (m2 < 0.35) sug = orig.replace(/'/g, '’');                       // 따옴표만
      else if (m2 < 0.45) sug = orig.toUpperCase();                                 // 대소문자만
      else { const sw = orig.split(' '); sw[Math.floor(R() * sw.length)] = pick(WORDS); sug = sw.join(' '); }
      const cat = pick(['', 'error', 'unnatural', 'style', 'grammar', 'awkward', undefined, 'ok']);
      const reason = pick(['', 'x', '이렇게 쓰면 문법에 맞아요', 'because', '원어민은 이렇게 말해요']);
      issues.push({ original: pick([orig, orig, orig, ' ' + orig + ' ']), suggested: sug, category: cat, reason });
    }
    let r1, r2;
    try { r1 = M.triageIssues(text, issues); r2 = M.triageIssues(text, JSON.parse(JSON.stringify(issues))); }
    catch { viol.threw++; continue; }
    if (JSON.stringify(r1) !== JSON.stringify(r2)) viol.nondet++;
    const tw = M.wordSeq(text);
    const has = (needle) => { const w = M.wordSeq(needle); for (let i = 0; i + w.length <= tw.length; i++) if (w.every((x, j) => tw[i + j] === x)) return w.length > 0; return false; };
    for (const it of [...r1.issues, ...r1.suggestions]) {
      if (M.normForCompare(it.original) === M.normForCompare(it.suggested)) viol.identical++;
      if (!has(it.original)) viol.notInText++;
      if (!/[가-힣]/.test(it.reason) || it.reason.length < 6) viol.emptyReason++;
    }
    if (r1.issues.length > M.MAX_ERRORS || r1.suggestions.length > M.MAX_SUGGESTIONS) viol.overCap++;
    if (r1.issues.some(i => i.kind !== 'error') || r1.suggestions.some(i => i.kind !== 'suggest')) viol.kindMix++;
  }
  return viol;
}

const M = await loadTriage();

sec('[ A·B·C. 원장님 사례 · 진짜 오류(짝) · 경계 — 정본을 실제로 돌림 ]');
{
  const bad = coreScenarios(M);
  const names = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'];
  for (const n of names) check(`시나리오 ${n}`, !bad.some(b => b.startsWith(n + ' ')), bad.find(b => b.startsWith(n + ' ')));
}

sec(`[ D. 퍼즈 — 씨앗 ${SEED}, 3,000건 ]`);
{
  const v = fuzz(M, SEED, 3000);
  check('D1 던지지 않는다', v.threw === 0, `${v.threw}건`);
  check('D2 «같은 문장» 을 고칠 곳으로 내보내지 않는다', v.identical === 0, `${v.identical}건`);
  check('D3 학생이 안 쓴 말을 고칠 곳으로 내보내지 않는다', v.notInText === 0, `${v.notInText}건`);
  check('D4 모든 항목에 한국어 이유(6자 이상)', v.emptyReason === 0, `${v.emptyReason}건`);
  check('D5 상한을 넘지 않는다', v.overCap === 0, `${v.overCap}건`);
  check('D6 오류·참고가 섞이지 않는다', v.kindMix === 0, `${v.kindMix}건`);
  check('D7 같은 입력엔 같은 답(결정론)', v.nondet === 0, `${v.nondet}건`);
}

sec('[ E. 배선 — api-ai.ts ]');
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const AI = strip(AI_SRC);
  check('E1 정본을 import 한다', /import \{ triageIssues \} from '\.\/write-issue-triage'/.test(AI));
  check('E2 모델 issues 를 정본에 넘긴다', /triageIssues\(text, parsed\.issues\)/.test(AI));
  check('E3 ⛔ 프롬프트가 «2-5개» 를 강제하지 않는다', !/List 2-5/.test(AI));
  check('E4 프롬프트가 «빈 목록이 맞다» 를 말한다', /EMPTY list is correct/.test(AI));
  check('E5 프롬프트가 category 를 요구한다', /"category":"error"/.test(AI));
  check('E6 응답에 suggestions 를 싣는다', /corrected, score, issues, suggestions,/.test(AI));
  check('E7 기록(feedback)에도 suggestions 를 남긴다', /JSON\.stringify\(\{ issues, suggestions,/.test(AI));
  check('E8 단어장 저장은 «오류(issues)» 만 돈다', /for \(const iss of issues\.slice\(0, 6\)\)/.test(AI) && !/for \(const iss of suggestions/.test(AI));
  check('E9 판단력 오답 기록도 «오류(issues)» 만', /const jList = issues\.length/.test(AI) && !/suggestions\.slice\(0, 3\)\.map/.test(AI));
  check('E10 ⛔ 옛 «원문과 같은 수정안도 통과» 필터가 남아 있지 않다', !/it\.original && it\.suggested && it\.reason\)/.test(AI));
}

sec('[ F. 화면 — ai-write.html «참고» 상자를 오려 내 실제로 그림 ]');
{
  const i = HTML.indexOf('    function awSuggestHtml(list) {');
  check('F0 awSuggestHtml 이 스크립트 최상위(들여쓰기 4칸)에 있다', i > 0);
  let fnSrc = '';
  if (i > 0) { const end = HTML.indexOf('\n    }\n', i); fnSrc = HTML.slice(i, end + 6); }
  let html = '', empty = 'x', ok = false;
  try {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const f = new Function('escapeHtml', 'awTr', fnSrc + '\nreturn awSuggestHtml;')(esc, (ko) => ko);
    html = f([{ original: 'When the water boils', suggested: '<b>Once</b>', reason: '참고예요' }]);
    empty = f([]) + f(null) + f([{ original: '', suggested: 'x' }]);
    ok = true;
  } catch (e) { ok = false; }
  check('F1 상자 함수를 실제로 돌릴 수 있다', ok);
  check('F2 학생 원문이 그대로 보인다', html.includes('When the water boils'));
  check('F3 ⛔ 취소선·빨간 줄을 쓰지 않는다', !/line-through|var\(--red\)|issue-orig/.test(html));
  check('F4 HTML 을 이스케이프한다', html.includes('&lt;b&gt;Once') && !html.includes('<b>Once'));
  check('F5 KO/EN 라벨이 «글자만 담은 span» 에 달려 있다', /<span data-ko="🟡 참고 · 지금 표현도 맞아요" data-en="🟡 For reference · Yours is fine too">/.test(html));
  check('F6 빈 목록이면 아무것도 안 그린다', empty === '');
  check('F7 결과 화면이 상자를 부른다', /const suggestHtml = awSuggestHtml\(d\.suggestions\)/.test(HTML) && /\$\{suggestHtml\}/.test(HTML));
  check('F8 지난 기록 보기도 같은 함수를 부른다', /awSuggestHtml\(feedback\.suggestions\)/.test(HTML));
}

sec('[ G. 변이시험 — 정본을 일부러 고장 내면 실제로 FAIL 나는가 ]');
{
  const MUT = [
    ['같은 문장 거르기 제거', "if (oN === sN) { drop('identical'); continue; }", ''],
    ['안 쓴 말 거르기 제거', "if (!containsSeq(textWords, wordSeq(original))) { drop('not_in_text'); continue; }", ''],
    ['조건 뒤집기(오류 판정)', 'if (ruleBacked || cat === \'error\') {', 'if (!(ruleBacked || cat === \'error\')) {'],
    ['«인정» 을 «오류» 로(모르면 고친다)', "drop('acceptable');", "out.issues.push({ original, suggested, reason: det || ERROR_FALLBACK_KO, kind: 'error' });"],
    ['표현 차이도 규칙 근거로 보기', 'const ruleBacked = !!det && !styleOnly;', 'const ruleBacked = !!det;'],
    ['정규화 약화(끝 부호 안 벗김)', ".replace(/[\\s.!?,;:]+$/, '')", ''],
    ['대소문자 오인용 거르기 제거', "if (oN.toLowerCase() === sN.toLowerCase() && !textNorm.includes(oN)) { drop('case_misquote'); continue; }", ''],
    ['상한 제거', "if (out.issues.length >= MAX_ERRORS) { drop('over_cap'); continue; }", ''],
  ];
  for (const [name, from, to] of MUT) {
    if (!TRI_SRC.includes(from)) { check(`G 변이 적용 가능: ${name}`, false, '앵커를 못 찾음 — 정본이 바뀌었으면 변이도 맞춰 주세요'); continue; }
    // ⚠️ 변이본이 «적재조차 안 되면» 잡힌 것이 아닙니다(문법 오류는 검사가 아니라 우연) — 못 잡은 것으로 셉니다.
    let caught = false, why = '';
    try {
      const Mm = await loadTriage(TRI_SRC.replace(from, to));
      const bad = coreScenarios(Mm);
      const v = fuzz(Mm, SEED, 600);
      caught = bad.length > 0 || Object.values(v).some(x => x > 0);
      why = caught ? '' : '시나리오·퍼즈가 전부 통과 — 검사가 헛돕니다';
    } catch (e) { caught = false; why = '변이본 적재 실패: ' + (e && e.message); }
    check(`G 변이가 실제로 잡힌다: ${name}`, caught, why);
  }
}

rmSync(TMP, { recursive: true, force: true });
console.log(`\n${FAIL === 0 ? '🎉' : '💥'} write_issue_triage_harness — PASS ${PASS} / FAIL ${FAIL}  (seed ${SEED})`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
