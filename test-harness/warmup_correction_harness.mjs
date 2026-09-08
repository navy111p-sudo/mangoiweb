/*!
 * ✏️ warmup_correction_harness — A.i 웜업 «교정 카드» 회귀 감시 (2026-09-08)
 *
 * 왜 문자열 검사로는 모자란가:
 *   이 기능의 결함은 «함수가 있는가» 가 아니라 «무슨 답이 나오는가» 로만 드러난다.
 *   was 검증을 지워도, 세는 줄을 게이트 뒤로 옮겨도, 코드는 멀쩡히 «있습니다».
 *   그래서 B절은 정본을 node 타입 제거로 **실제로 돌린다**.
 *
 * ⚠️ A절의 배선 검사는 «길이» 가 아니라 «앵커» 로 범위를 자른다(CLAUDE.md 2장).
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

console.log('════════ ✏️ 웜업 교정 카드 ════════');

// ═══════════ A. 배선 — /api/warmup/chat 핸들러 안 ═══════════
console.log('\nA. 서버 배선 (index.ts 의 웜업 핸들러 «안» 만 잘라서 본다)');
const INDEX = readFileSync(join(SRC, 'index.ts'), 'utf8');
{
  /* ⚠️ 앵커는 «라우터 분기» 가 아니라 «핸들러 함수» 여야 한다.
     path === '/api/warmup/chat' 은 위쪽 라우터에도 있어서, 그것을 집으면 무관한 3,600줄이
     딸려 들어와 남의 AI.run 까지 세게 된다(만들면서 실제로 밟았다).
     끝은 «다음 함수 선언» 으로 잡는다 — 응답 조립까지 포함해야 fix 필드를 볼 수 있다. */
  const start = INDEX.indexOf('async function handleWarmupChat(');
  const end = INDEX.indexOf('async function handleWarmupQuestions(', start);
  check('A-0 웜업 핸들러 구간을 앵커로 잘라 냈다', start > 0 && end > start,
        'start=' + start + ' end=' + end);
  const H = start > 0 && end > start ? INDEX.slice(start, end) : '';

  check('A-1 [교정] 절을 시스템 프롬프트에 주입한다',
        /sys\s*\+=\s*'\\n'\s*\+\s*WARMUP_CORRECTION_RULE\s*;/.test(H));

  /* 🔴 이 검사가 이 하니스의 핵심이다.
     모델 출력이 JSON 이 된 뒤에도 «날것으로» 꺼내는 자리가 하나라도 남으면,
     그 경로만 조용히 중괄호 덩어리를 무너짐 게이트에 먹여 대화가 안전문구로 떨어진다. */
  /* takeWarmupReply «선언» 안의 추출은 정본이므로 세지 않는다. 그 밖에 하나라도 남으면 결함. */
  const HminusHelper = H.replace(/const takeWarmupReply[\s\S]*?\n    \};\n/, '');
  const rawPicks = HminusHelper.match(/\(\s*\w+\s*&&\s*\(\s*\w+\.response\s*\|\|\s*\w+\.result/g) || [];
  check('A-2 모델 출력을 날것으로 꺼내는 자리가 0건 (전부 takeWarmupReply 를 지난다)',
        rawPicks.length === 0, '남은 자리 ' + rawPicks.length + '건');

  /* ⚠️ 주석을 벗기고 «코드만» 센다. 안 그러면 주석에 적힌 takeWarmupReply() 가 함께 세어져
     «코드는 한 글자도 안 고치고 주석 괄호만 떼도 FAIL» 이 난다(함정 대조가 실측으로 잡았다). */
  const code = H.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const takes = (code.match(/takeWarmupReply\(/g) || []).length;
  const commits = (code.match(/commitFix\(\)/g) || []).length;
  const runs = (code.match(/env\.AI\.run\(WARMUP_MODEL/g) || []).length;
  check('A-3 AI 호출 수와 추출 수가 짝이 맞는다 (새 재시도를 넣고 빠뜨리면 여기서 걸린다)',
        runs > 0 && takes === runs, 'AI.run ' + runs + '회 · takeWarmupReply ' + takes + '회');
  check('A-3b 채택한 답장마다 교정을 확정한다 (버려진 재시도의 교정이 남지 않는다)',
        commits === runs, 'commitFix ' + commits + '회 · AI.run ' + runs + '회');
  check('A-3c 답장을 버리면 그 교정도 버린다', /rawFix = null;/.test(code));

  check('A-4 검증을 «반드시» 지난다 — 모델이 준 fix 를 그대로 응답에 싣지 않는다',
        /verifyWarmupFix\(\s*rawFix\s*,\s*studentInput\s*\)/.test(H) && !/fix:\s*rawFix/.test(H));

  check('A-5 응답에 검증·게이트를 통과한 것만 싣는다', /fix:\s*showFix\s*,\s*repeat:\s*offerRepeat/.test(H));

  check('A-6 게이트가 던져도 대화가 죽지 않는다 (통째로 try/catch)',
        /try\s*\{[\s\S]*verifyWarmupFix[\s\S]*?\}\s*catch/.test(H));

  check('A-7 교정 메모는 히스토리와 같은 6시간 — 발화를 저장하지 않는다',
        /'warmupfix:'\s*\+\s*sessionId/.test(H) && /expirationTtl:\s*6\s*\*\s*3600/.test(H));
}

// ═══════════ B. 정본을 실제로 돌린다 ═══════════
console.log('\nB. 정본 실행 (node 타입 제거 — 컴파일 없이 진짜로 돌린다)');
{
  const tmp = mkdtempSync(join(tmpdir(), 'wfx-'));
  const fixImp = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, 'warmup-correction.ts'), fixImp(readFileSync(join(SRC, 'warmup-correction.ts'), 'utf8')));
  writeFileSync(join(tmp, 'english-only.ts'), fixImp(readFileSync(join(SRC, 'english-only.ts'), 'utf8')));
  const runner = `
import { parseWarmupOutput, verifyWarmupFix, decideWarmupFixShow, warmupShouldOfferRepeat } from './warmup-correction.ts';
const out = [];
const t = (name, ok, extra) => out.push([name, !!ok, extra == null ? '' : String(extra)]);

// ── ① parseWarmupOutput — 파싱이 깨져도 학생에게 중괄호가 안 보인다 ──
{
  const good = JSON.stringify({ reply: 'Nice! What did you do?', fix: { was: 'I go', now: 'I went', why_ko: '어제 일이라 went 야', tag: 'past_tense', severity: 'minor' } });
  const p = parseWarmupOutput(good);
  t('B-1 정상 JSON 에서 reply 와 fix 를 꺼낸다', p.reply === 'Nice! What did you do?' && p.fix && p.fix.was === 'I go');

  const fenced = '\\u0060\\u0060\\u0060json\\n' + good + '\\n\\u0060\\u0060\\u0060';
  t('B-2 코드펜스로 감싸도 읽는다', parseWarmupOutput(fenced).reply === 'Nice! What did you do?');

  const plain = parseWarmupOutput('Hi! How are you today?');
  t('B-3 평문이면 그대로 reply (옛 동작으로 안전하게 떨어진다)', plain.reply === 'Hi! How are you today?' && plain.fix === null);

  const broken = parseWarmupOutput('{"reply":"Great job!","fix":{oops}');
  t('B-4 JSON 이 깨져도 reply 만 건져 낸다', broken.reply === 'Great job!' && broken.fix === null);

  /* 🔴 함정 대조가 잡은 진짜 결함 — max_tokens 안에 교정까지 들어가므로 «잘림» 이 가장 흔한
     실패 모양인데, 잘리면 정의상 닫는 중괄호가 없다. 옛 코드는 그때 원문을 그대로 내보냈다. */
  {
    const cut = '{"reply":"Oh, you went to school yesterday! What did you do there?","fix":{"was":"I go to sch';
    const c = parseWarmupOutput(cut);
    t('B-4b 🔴 잘린 JSON 에서도 reply 를 건져 낸다', c.reply === 'Oh, you went to school yesterday! What did you do there?', c.reply.slice(0, 40));
    t('B-4c 🔴 잘려도 중괄호가 학생 화면으로 안 샌다', !c.reply.includes('{') && !c.reply.includes('"reply"'));
    const cutEarly = parseWarmupOutput('{"reply":"Oh, you went to sch');
    t('B-4d reply 자체가 잘리면 빈 문자열 (딸꾹질 문구가 받는다)', cutEarly.reply === '', JSON.stringify(cutEarly.reply));
    const prefixed = parseWarmupOutput('Here you go: {"reply":"Nice!","fix":');
    t('B-4e JSON 앞에 말이 붙어도 중괄호가 안 샌다', !prefixed.reply.includes('{'), JSON.stringify(prefixed.reply).slice(0, 50));
  }
  const hopeless = parseWarmupOutput('{"nope": 1}');
  t('B-5 못 읽으면 빈 문자열 (잘린 경우는 B-4b~e 가 따로 본다)', hopeless.reply === '' && hopeless.fix === null, JSON.stringify(hopeless.reply));

  t('B-6 빈 응답은 빈 응답', parseWarmupOutput('').reply === '' && parseWarmupOutput(null).reply === '');
}

// ── ② verifyWarmupFix — 모델을 믿지 않는다 ──
{
  const said = 'I go to school yesterday';
  const ok = verifyWarmupFix({ was: 'I go to school yesterday', now: 'I went to school yesterday', why_ko: '어제 일이라 went 를 써', tag: 'past_tense', severity: 'minor' }, said);
  t('B-7 제대로 된 교정은 통과한다 («못 잡는다» 만 검사하면 헛돈다)', ok && ok.now === 'I went to school yesterday' && ok.tag === 'past_tense');

  t('B-8 🔴 was 가 학생 원문에 없으면 버린다 (지어낸 교정)',
    verifyWarmupFix({ was: 'I have a cat', now: 'I have two cats', why_ko: '복수야', tag: 'plural', severity: 'minor' }, said) === null);

  t('B-9 was 와 now 가 같으면 교정이 아니다',
    verifyWarmupFix({ was: 'I go to school', now: 'i go to school', why_ko: '같아', tag: 'other', severity: 'minor' }, said) === null);

  t('B-10 why_ko 가 비면 버린다',
    verifyWarmupFix({ was: 'I go', now: 'I went', why_ko: '', tag: 'past_tense', severity: 'minor' }, said) === null);

  t('B-11 why_ko 가 한국어가 아니면 버린다',
    verifyWarmupFix({ was: 'I go', now: 'I went', why_ko: 'use past tense', tag: 'past_tense', severity: 'minor' }, said) === null);

  t('B-12 교정문에 한글이 섞이면 버린다 (영어 TTS 가 그대로 읽는다)',
    verifyWarmupFix({ was: 'I go', now: 'I went 갔어', why_ko: '과거형', tag: 'past_tense', severity: 'minor' }, said) === null);

  t('B-13 통째로 새 문장을 지어내면 버린다 (낱말이 안 겹침)',
    verifyWarmupFix({ was: 'I go', now: 'Pizza tastes wonderful', why_ko: '더 좋아', tag: 'other', severity: 'minor' }, said) === null);

  const unknownTag = verifyWarmupFix({ was: 'I go', now: 'I went', why_ko: '과거형이야', tag: '내맘대로', severity: '이상함' }, said);
  t('B-13b 형태가 바뀌는 교정은 통과한다 (낱말 겹침만 보면 묻힌다)',
    !!verifyWarmupFix({ was: "I don't went", now: "I didn't go", why_ko: '과거 부정은 didn\u2019t go 예요', tag: 'verb_form', severity: 'major' }, "I don't went to school"));
  t('B-13c 그래도 통째로 다른 문장은 여전히 막힌다',
    verifyWarmupFix({ was: 'I like it', now: 'Do you want to play soccer with me', why_ko: '이렇게 말해요', tag: 'other', severity: 'minor' }, 'I like it') === null);
  t('B-14 모르는 tag·severity 는 안전한 기본값으로 (버리지는 않는다)',
    unknownTag && unknownTag.tag === 'other' && unknownTag.severity === 'minor');

  t('B-15 fix 가 없으면(null) 조용히 없음', verifyWarmupFix(null, said) === null && verifyWarmupFix({}, said) === null);

  t('B-15b 낱말 조각은 통과 못 한다 (부분문자열이 아니라 낱말 경계)',
    verifyWarmupFix({ was: 'o to sch', now: 'o to schoo', why_ko: '이렇게 써', tag: 'other', severity: 'minor' }, 'I go to school') === null);
  t('B-15c 곱슬 아포스트로피가 섞여도 대조가 어긋나지 않는다',
    !!verifyWarmupFix({ was: 'I don\u2019t went', now: 'I didn\u2019t go', why_ko: '과거형은 didn\u2019t go 예요', tag: 'verb_form', severity: 'major' }, "I don't went to school"));
  t('B-16 학생 원문이 비면 아무것도 통과 못 한다',
    verifyWarmupFix({ was: 'I go', now: 'I went', why_ko: '과거형', tag: 'past_tense', severity: 'minor' }, '') === null);

  const mk = (w, n) => ({ was: w, now: n, why_ko: '이렇게 써', tag: 'other', severity: 'minor' });
  t('B-17 짧은 문장의 진짜 교정도 통과한다 (게이트가 너무 조이면 기능이 안 뜬다)',
    !!verifyWarmupFix(mk('me hungry', 'I am hungry'), 'me hungry') &&
    !!verifyWarmupFix(mk('I like apple', 'I like apples'), 'I like apple'));
}

// ── ③ decideWarmupFixShow — «언제 보여 줄 것인가» ──
{
  const F = (sev, tag) => ({ was: 'x', now: 'y', why_ko: '이유', tag: tag || 'past_tense', severity: sev });

  const a = decideWarmupFixShow(F('major'), null, 5);
  t('B-18 뜻이 달라지는 오류(major)는 바로 보여 준다', !!a.show);

  const b = decideWarmupFixShow(F('minor'), null, 5);
  t('B-19 작은 실수(minor)는 처음엔 안 보여 준다 — 매 턴 고치면 말문이 막힌다', b.show === null);
  t('B-20 그래도 «틀린 것» 자체는 센다 (안 세면 두 번째가 영영 안 온다)', b.memo.tags.past_tense === 1);

  const c = decideWarmupFixShow(F('minor'), b.memo, 7);
  t('B-21 같은 실수가 두 번째면 그때 보여 준다', !!c.show && c.memo.tags.past_tense === 2);

  const d = decideWarmupFixShow(F('major'), c.memo, 8);
  t('B-22 바로 앞 턴에 고쳐 줬으면 이번 턴은 쉰다 (연달아 고치지 않는다)', d.show === null);

  const e = decideWarmupFixShow(F('major'), c.memo, 9);
  t('B-23 한 턴 띄우면 다시 고쳐 준다', !!e.show);

  const z = decideWarmupFixShow(null, c.memo, 20);
  t('B-24 교정이 없으면 메모도 안 늘어난다', z.show === null && z.memo.tags.past_tense === 2);
}

// ── ④ warmupShouldOfferRepeat — 「따라 말해 보기」 ──
{
  const F = { was: 'x', now: 'y', why_ko: '이유', tag: 'past_tense', severity: 'major' };
  const memo = { tags: {}, lastShownTurn: 0, lastRepeatTurn: 0, shown: 0 };
  t('B-25 첫 교정에는 따라 말하기를 붙인다', warmupShouldOfferRepeat(F, memo, 4) === true);
  t('B-26 바로 다음 교정에는 안 붙인다 (3턴에 한 번)', warmupShouldOfferRepeat(F, memo, 5) === false);
  t('B-27 세 턴 지나면 다시 붙는다', warmupShouldOfferRepeat(F, memo, 7) === true);
  t('B-28 교정이 없으면 따라 말하기도 없다', warmupShouldOfferRepeat(null, memo, 30) === false);
}
process.stdout.write('@@JSON@@' + JSON.stringify(out));
`;
  writeFileSync(join(tmp, 'run.mjs'), runner);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });
  const marker = (r.stdout || '').indexOf('@@JSON@@');
  if (r.status !== 0 || marker < 0) {
    check('B-0 정본 실행', false, '종료코드 ' + r.status);
    console.log((r.stderr || '').slice(0, 900));
  } else {
    check('B-0 정본 실행', true);
    for (const [name, ok, extra] of JSON.parse(r.stdout.slice(marker + 8))) check(name, ok, extra);
  }
}

// ═══════════ C. 화면 배선 ═══════════
console.log('\nC. 화면 배선 (warmup.html)');
{
  const W = readFileSync(join(PUB, 'warmup.html'), 'utf8');
  check('C-1 서버가 준 fix 를 그린다', /showFixCard\(\s*d\.fix\s*,\s*d\.repeat\s*\)/.test(W));
  /* ⚠️ «선언» 이 함께 매치되면 호출을 전부 지워도 통과한다 — 이 저장소에서 세 번째 밟은 함정이다.
     선언은 정확히 1개, «부르는 곳» 은 2곳 이상(보낼 때 + 그릴 때)이어야 한다. */
  const decl = (W.match(/function fixCardClear\(\)/g) || []).length;
  const calls = (W.replace(/function fixCardClear\(\)/g, '').match(/fixCardClear\(\)/g) || []).length;
  check('C-2 보낼 때 이전 교정 카드를 걷는다 (선언 1개 · 부르는 곳 2곳 이상)',
        decl === 1 && calls >= 2, '선언 ' + decl + ' · 호출 ' + calls);
  check('C-3 서버가 «교정 없음» 이면 아무것도 안 그린다',
        /if\(!fix \|\| !fix\.was \|\| !fix\.now\) return;/.test(W));
  /* ⛔ 학생·모델이 만든 «값» 에 data-ko/data-en 을 달면 i18n 엔진이 textContent 를 통째로
     갈아끼워 문장이 사라진다. 라벨에만 달아야 한다(CLAUDE.md 2장). */
  const fixBlock = W.slice(W.indexOf('function showFixCard('), W.indexOf('function fixSpeakThenMic('));
  /* ⚠️ 「_fixLabel(v,…)」 한 모양만 보면 v.setAttribute('data-ko', …) 로 직접 달았을 때 통과한다.
     값을 만드는 그 줄을 «잘라서» data-ko/data-en 이 아예 없는지 본다. */
  const mkStart = fixBlock.indexOf('var mk = function(');
  const mkEnd = fixBlock.indexOf('card.appendChild(mk(', mkStart);
  const mkBody = mkStart >= 0 && mkEnd > mkStart ? fixBlock.slice(mkStart, mkEnd) : '';
  check('C-4-0 값을 만드는 블록을 잘라 냈다 (전제)', mkBody.length > 120, mkBody.length + '자');
  check('C-4 was/now 를 담는 칸에는 data-ko/data-en 을 안 단다',
        mkBody.length > 120 && !/data-ko|data-en|_fixLabel\(\s*v\b/.test(mkBody) && /v\.textContent\s*=\s*val;/.test(mkBody));
  check('C-5 따라 말하기는 서버가 켜 줄 때만 그린다', /if\(offerRepeat\)\{/.test(fixBlock));
  check('C-6 소리가 끝난 뒤 마이크를 연다 (안전망 포함)',
        /function fixSpeakThenMic/.test(W) && /classList\.contains\('playing'\)/.test(W) && /15000/.test(W));
  check('C-7 교정 카드 색이 «대답 보기»(초록)·«질문 추천»(노랑)과 다르다',
        /\.fix-card\{[\s\S]*?rgba\(56,189,248/.test(W));
}

console.log('\n──────── 결과: PASS ' + pass + ' · FAIL ' + fail + ' ────────');
process.exit(fail ? 1 : 0);
