// 🧩 «조각 질문» 막기 — 아바타가 「like space?」 처럼 앞부분이 빠진 질문을 하지 않게 (2026-10-28)
// 사장님 「아바타가 완전한 문장으로 말하게 만들어줘. 갑자기 질문에 like space? 이런 식으로 나오지 말게 해줘.」
// 정본 src/reply-questions.ts 를 번들해 «실제로 돌리고», 웜업 핸들러(index.ts)의 재시도 블록·미리듣기 차단·
// 엘리더잼 L1 접속사 지시까지 실행해 봅니다.
// ⚠️ 실제 AI 답이 완전한 문장이 되는지는 여기서 못 잽니다 — 배포 뒤 사람이 화면에서 확인합니다.
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(root + '/cloudflare-deploy/package.json');
let build = null;
try { ({ build } = require('esbuild')); } catch { build = null; }

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('❌ FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };

const SRC = process.env.RQ_SRC_DIR || (root + '/cloudflare-deploy');
/* esbuild 가 없어도 «통과로 위장» 하지 않는다 — reply-questions.ts 는 import 가 없어 타입만 벗겨 돌릴 수 있다.
   그때 미리듣기(④)·엘리더잼(⑦)·교재 문장 검사만 건너뛰고, 건너뛴 사실을 출력한다. */
let M, full = true;
if (build) {
  const out = tmpdir() + '/reply-frag-' + process.pid + '.mjs';
  await build({
    stdin: { contents: "export * from './src/reply-questions'; export { createWarmupLive } from './src/warmup-stream'; export { replyRejectReason } from './src/reply-sanity'; export * from './src/eleader-l1'; export { ELEADER_BOOK_UNITS } from './src/eleader-book-pack';", resolveDir: SRC },
    bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
  });
  M = await import(pathToFileURL(out));
} else {
  full = false;
  const { stripTypeScriptTypes } = await import('node:module');
  const js = stripTypeScriptTypes(readFileSync(SRC + '/src/reply-questions.ts', 'utf8'));
  M = await import('data:text/javascript,' + encodeURIComponent(js));
  console.log('⏭ esbuild 없음 — reply-questions.ts 만 타입을 벗겨 돌립니다(④ 미리듣기 · ⑦ 엘리더잼 · 교재 문장 검사는 건너뜀)');
}
const idx = readFileSync(SRC + '/src/index.ts', 'utf8');

// ── ① 조각 질문은 잡는다 ────────────────────────────────────────────────
const FRAGS = [
  'Like space?', 'like space?', 'By the way, like space?', 'So, like space?', 'Oh, and like space?', 'Of course, like dogs?',
  'Great job! Like space?', 'Wow! Space is cool. Like space too?', 'One more thing: like cats?', 'Also, want a dog?',
  'Cats or dogs?', 'Do you like cats? Or dogs?', 'Space?', 'You like space?', 'So you like dogs?', 'Ready to start?',
  'Moreover, big dogs?', 'Nice! Favorite color?', 'Good job, like pizza too?', 'Ed, like space?',
  // 확인말 «뒤에 말이 더 붙은» 것은 do you 가 빠진 조각이다 · 따옴표 «밖» 의 물음표는 판정한다
  'Want to try?', 'Ready to go?', 'Got it now?', 'Say "I like space", like cats?',
];
for (const f of FRAGS) ok('잡는다: ' + f, M.fragmentQuestions(f).length === 1, M.fragmentQuestions(f));
// 여러 문장 중 «조각만» 골라낸다
const mixed = M.fragmentQuestions('Great job! Do you like stars? By the way, like space?');
ok('여러 문장 중 조각 하나만', mixed.length === 1 && /like space/.test(mixed[0]), mixed);

// ── ② 완전한 질문·평서문은 안 잡는다(거짓 경보 0) ─────────────────────────
const GOOD = [
  "What's your name?", "Where's your cat?", "How's your day?", "Who's your friend?", 'Is space big?', 'Do you like space?',
  'By the way, do you like space?', 'So, what is your favorite color?', 'Oh, and do you have a dog?', 'Of course! Can you swim?',
  'And you?', 'You too?', 'Really?', 'Right?', 'Okay?', 'Why?', 'How about you?', 'What about space?', 'Me too! What about you?',
  'Do you like stars, or do you like space?', 'Do you like stars, or like space?', 'Which do you like, cats or dogs?',
  'Cats or dogs, which do you like?', 'Space is big, isn\'t it?', 'Ed, do you like dogs?', 'Can you say "I like space"?',
  'Do you like space? (우주 좋아해?)', 'Great job! I like space too.', 'You did a great job today!', 'Yes or no?',
  "Isn't it fun?", "Don't you love cats?", 'Would you like a snack?', 'Have you seen the moon?', 'What do you think?',
  'Hmm, is it a cat?', 'Well, does your dog bark?', 'Now, can you say it again?', 'sun이라고 말할 수 있나요?',
  'Wow, that is cool! So, do you like big dogs or small dogs?', '', 'I like space.',
  // 따옴표 «안» 의 질문은 따라 말해 볼 예시 — 판정하지 않는다(물음표가 따옴표 안에만 있음)
  'You can ask, "Do you like cats?"', 'Repeat after me: "Can I have one?"', 'Great! Now ask me: "What is your name?"',
  'Say it like this: "Do you like space?"', '"Do you like space?"', "Say 'Ready?' Do you like it?", "Can you say 'Like space?'",
  // 정해진 확인말 — 이 말 «뿐» 일 때만
  'Ready?', 'Got it?', 'Sounds good?', 'Hello? Are you there?', 'Ok, ready?', 'Hi?',
];
for (const g of GOOD) ok('안 잡는다: ' + g, M.fragmentQuestions(g).length === 0, M.fragmentQuestions(g));
// 조합으로 넓게 — 접속사 × 조동사·의문사 × 주어 × 동사
const LEADS = ['', 'So, ', 'By the way, ', 'Oh, and ', 'One more thing: ', 'Of course, ', 'Also, ', 'Great job! ', 'Moreover, ', 'But '];
const STARTS = ['Do you like', 'Does your dog like', 'Can you see', 'Is it', 'Are they', 'Did you see', 'Will you try', 'What is', "What's", 'Where do you see', 'How many', 'Which one is', 'Who likes'];
const ENDS = ['space', 'big dogs', 'the moon', 'your cat', 'a red ball', 'pizza and chicken'];
let combos = 0, comboBad = 0;
for (const l of LEADS) for (const s of STARTS) for (const e of ENDS) { combos++; if (M.fragmentQuestions(l + s + ' ' + e + '?').length) comboBad++; }
ok(`완전한 질문 조합 ${combos}종 거짓 경보 0`, comboBad === 0, comboBad);
// 그 조합에서 «조동사를 뗀» 것은 전부 잡는다(같은 접속사 × 같은 낱말)
let cut = 0, cutMiss = 0;
for (const l of LEADS) for (const e of ENDS) { cut++; if (!M.fragmentQuestions(l + 'like ' + e + '?').length) cutMiss++; }
ok(`조동사 뗀 조합 ${cut}종 전부 잡음`, cutMiss === 0, cutMiss);
// 실제 교재 질문(엘리더잼 22권)·예시답·웜업 준비 질문은 하나도 안 잡는다
if (full) {
  let book = 0, bookBad = [];
  for (const b of M.ELEADER_BOOK_UNITS) for (const q of b.questions) for (const t of [q.question, q.hint, q.model]) {
    if (!t) continue; book++; if (M.fragmentQuestions(String(t)).length) bookBad.push(b.id + ': ' + t);
  }
  ok(`엘리더잼 교재 문장 ${book}개 거짓 경보 0`, book > 400 && bookBad.length === 0, bookBad.slice(0, 5));
}
const fb = (idx.match(/const WARMUP_FALLBACK_QUESTIONS[\s\S]*?\n\};/) || [''])[0].match(/'[^']*\?'|"[^"]*\?"/g) || [];
ok('웜업 준비 질문을 읽었다(전제)', fb.length >= 10, fb.length);
ok('웜업 준비 질문 거짓 경보 0', fb.every((q) => !M.fragmentQuestions(q.slice(1, -1)).length), fb.filter((q) => M.fragmentQuestions(q.slice(1, -1)).length));

// ── ③ 어느 단계에서 보나 ─────────────────────────────────────────────────
ok('영어 1~3단계만 본다', [1, 2, 3].every((d) => M.checksFragmentQuestions(d, 'en')));
ok('4~8단계·단계 모름(0)은 안 본다', [0, 4, 5, 6, 7, 8].every((d) => !M.checksFragmentQuestions(d, 'en')));
ok('중국어는 안 본다', !M.checksFragmentQuestions(1, 'zh'));
ok('힌트가 틀린 문장을 그대로 보여 준다', /"By the way, like space\?"/.test(M.fragmentQuestionHint(['By the way, like space?'], 1)));
ok('힌트가 JSON 형식을 지키라고 한다', /JSON/.test(M.fragmentQuestionHint(['x?'], 1)));
// 1·2단계 지시는 «wh- 질문 금지» 다 — 지시·힌트가 의문사를 권하면 그 지시와 어긋난다(짝: 3단계는 권해도 된다)
const WH_RE = /question word|What is your|의문사/;
ok('1·2단계 지시는 의문사를 권하지 않는다', [1, 2].every((d) => !WH_RE.test(M.fullQuestionRule(d))), M.fullQuestionRule(1));
ok('1·2단계 힌트는 의문사를 권하지 않는다', [1, 2].every((d) => !WH_RE.test(M.fragmentQuestionHint(['Like space?'], d))));
ok('3단계 지시·힌트는 의문사도 보인다(짝)', WH_RE.test(M.fullQuestionRule(3)) && WH_RE.test(M.fragmentQuestionHint(['Like space?'], 3)));
ok('지시가 조각 예시와 «완전한 문장» 을 함께 말한다', [1, 2, 3].every((d) => /By the way, like space\?/.test(M.fullQuestionRule(d)) && /완전한 문장/.test(M.fullQuestionRule(d))));
ok('재시도 시간 예산이 있다(화면 20초보다 넉넉히 짧게)', Number.isFinite(M.FRAG_RETRY_BUDGET_MS) && M.FRAG_RETRY_BUDGET_MS > 0 && M.FRAG_RETRY_BUDGET_MS <= 12000, M.FRAG_RETRY_BUDGET_MS);

// ── ④ 미리듣기(스트리밍) 차단 — 켜졌을 때만 멈추고, 안 켜면 예전 그대로(짝) ────────────────
if (full) {
const mk = (fragQ) => { const sent = []; const live = M.createWarmupLive((o) => sent.push(o), { lang: 'en', cap: 5, friend: 'Lily', studentInput: 'I like stars.', fragQ }); return { live, sent }; };
{ const { live, sent } = mk(true); live.push('Great job!'); live.push('By the way, like space?');
  ok('미리듣기: 조각 질문에서 멈춘다', live.halted() === 'fragment' && sent.length === 1, { h: live.halted(), n: sent.length }); }
{ const { live, sent } = mk(true); live.push('Great job!'); live.push('By the way, do you like space?');
  ok('미리듣기: 완전한 질문은 흘려보낸다', live.halted() === '' && sent.length === 2, { h: live.halted(), n: sent.length }); }
{ const { live, sent } = mk(undefined); live.push('By the way, like space?');
  ok('미리듣기: 검사를 안 켜면 예전 그대로(상급·중국어)', live.halted() === '' && sent.length === 1); }
}

// ── ⑤ 웜업 핸들러의 재시도 블록을 오려 내 «실제로» 돌린다 ───────────────────
const s0 = idx.indexOf('      const frag = fragQ && aiText ? fragmentQuestions(aiText) : [];');
const s1 = idx.indexOf('      // 🔁 그래도 직전 AI 발화와 (거의) 같은 문장이 나오면 1회 재생성', s0);
ok('재시도 블록을 오려 냈다(전제)', s0 > 0 && s1 > s0);
const block = idx.slice(s0, s1).replace(/:\s*any\b/g, '');   // TS 타입 표기만 벗긴다
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
let runBlock = null;
try {
  runBlock = new AsyncFn('fragQ', 'aiText', 'fragmentQuestions', 'fragmentQuestionHint', 'runWarmup', 'messages', 'takeWarmupReply',
    'replyRejectReason', 'sanityCap', 'wrongSelfName', 'ctxFriend', 'askedOwnName', 'studentInput', 'commitFix', 'ctxDifficulty', 'console',
    'latT0', 'FRAG_RETRY_BUDGET_MS',
    block + '\nreturn aiText;');
} catch (e) { ok('재시도 블록이 실행 가능', false, String(e)); }
const quiet = { warn() {} };
async function sim({ fragQ = true, first, retry, throws = false, sane = () => '', badName = () => '', waited = 0, difficulty = 1 }) {
  const calls = []; let committed = 0;
  const runWarmup = async (msgs) => { calls.push(msgs); if (throws) throw new Error('boom'); return { response: retry }; };
  let out;
  try {
    out = await runBlock(fragQ, first, M.fragmentQuestions, M.fragmentQuestionHint, runWarmup, [{ role: 'system', content: 's' }],
      (r) => r.response, sane, 5, badName, 'Lily', () => false, 'I like stars.', () => { committed++; }, difficulty, quiet,
      Date.now() - waited, M.FRAG_RETRY_BUDGET_MS);
  } catch (e) { return { crash: String(e), calls, committed }; }
  return { out, calls, committed };
}
if (runBlock) {
  let r = await sim({ first: 'Great! By the way, like space?', retry: 'Great! By the way, do you like space?' });
  ok('조각이면 다시 뽑아 완전한 답을 받는다', r.out === 'Great! By the way, do you like space?' && r.calls.length === 1 && r.committed === 1, r);
  ok('다시 뽑을 때 틀린 문장을 보여 준다', r.calls[0] && /like space\?/.test(r.calls[0][r.calls[0].length - 1].content), r.calls[0]);
  ok('다시 뽑을 때 원래 답을 assistant 로 넣는다', r.calls[0] && r.calls[0][r.calls[0].length - 2].role === 'assistant');
  r = await sim({ first: 'Great! Like space?', retry: 'Great! Like stars?' });
  ok('다시 뽑아도 조각이면 원래 답을 둔다(대화를 끊지 않는다)', r.out === 'Great! Like space?' && r.committed === 0, r);
  r = await sim({ first: 'Great! Like space?', retry: 'Great! Do you like space?', sane: () => 'toolong' });
  ok('다시 뽑은 답이 무너졌으면 안 받는다', r.out === 'Great! Like space?', r);
  r = await sim({ first: 'Great! Like space?', retry: 'I am Roy! Do you like space?', badName: () => 'Roy' });
  ok('다시 뽑은 답이 이름을 어기면 안 받는다', r.out === 'Great! Like space?', r);
  r = await sim({ first: 'Great! Like space?', retry: '' });
  ok('다시 뽑은 답이 비면 원래 답을 둔다', r.out === 'Great! Like space?', r);
  r = await sim({ first: 'Great! Like space?', throws: true });
  ok('다시 뽑다 실패해도 던지지 않고 원래 답을 둔다', !r.crash && r.out === 'Great! Like space?', r);
  r = await sim({ first: 'Great! Do you like space?', retry: 'x' });
  ok('완전한 답이면 다시 안 뽑는다(지연 없음)', r.out === 'Great! Do you like space?' && r.calls.length === 0, r);
  r = await sim({ fragQ: false, first: 'Great! Like space?', retry: 'Great! Do you like space?' });
  ok('검사를 안 켠 단계면 다시 안 뽑는다', r.out === 'Great! Like space?' && r.calls.length === 0, r);
  // ⏱ 이미 오래 기다린 턴은 다시 안 뽑는다(화면이 20초에 끊는다) — 짝: 예산 안이면 뽑는다(위 첫 검사)
  r = await sim({ first: 'Great! Like space?', retry: 'Great! Do you like space?', waited: M.FRAG_RETRY_BUDGET_MS + 2000 });
  ok('예산을 넘긴 턴은 다시 안 뽑고 원래 답을 둔다', r.out === 'Great! Like space?' && r.calls.length === 0, r);
  r = await sim({ first: 'Great! Like space?', retry: 'Great! Do you like space?', waited: M.FRAG_RETRY_BUDGET_MS - 3000 });
  ok('예산 안이면 다시 뽑는다(짝)', r.out === 'Great! Do you like space?' && r.calls.length === 1, r);
  // 힌트는 «그 턴의 단계» 를 따른다 — 1단계면 의문사를 권하지 않는다
  r = await sim({ first: 'Great! Like space?', retry: 'Great! Do you like space?', difficulty: 1 });
  const h1 = r.calls[0] ? r.calls[0][r.calls[0].length - 1].content : '';
  r = await sim({ first: 'Great! Like space?', retry: 'Great! Do you like space?', difficulty: 3 });
  const h3 = r.calls[0] ? r.calls[0][r.calls[0].length - 1].content : '';
  ok('재시도 힌트가 그 턴의 단계를 따른다(1단계 의문사 없음 · 3단계 있음)', !WH_RE.test(h1) && WH_RE.test(h3), { h1, h3 });
}

// ── ⑥ 배선 — 각 자리를 오려 내 «실제로» 돌린다 ─────────────────────────────
// ⚠️ 글자로 묻지 않는다: 값만 바꾸거나(`fragQ: false`) 블록주석으로 막아도 «그 글자» 는 남는다(2026-10-28 함정 대조 실측).
//    실행하면 주석은 JS 가 알아서 무시하고, 바뀐 값은 결과로 드러난다.
function braceBlock(text, from) {
  const open = text.indexOf('{', from); if (open < 0) return '';
  let d = 0, q = '';
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return text.slice(from, i + 1);
  }
  return '';
}
const untype = (t) => t.replace(/:\s*any\b/g, '');
// 6-1 시스템 지시 — 기초 단계에만, 그 단계의 줄이, 난이도 줄 뒤에 실린다
{
  const i = idx.indexOf("    let sys = ctxLang === 'zh' ? warmupZhSystem(ctxFriend) : warmupSystem(ctxFriend);");
  const j = i < 0 ? -1 : idx.indexOf('    if (lessonTopic) sys +=', i);
  const region = i > 0 && j > i ? idx.slice(i, j) : '';
  ok('시스템 지시 앞부분을 오려 냈다(전제)', !!region);
  let sysOf = null;
  try { sysOf = new Function('ctxLang', 'ctxFriend', 'ctxAge', 'ctxDifficulty', 'warmupZhSystem', 'warmupSystem', 'warmupAgeLine',
    'WARMUP_ZH_LEVELS', 'WARMUP_LEVELS', 'checksFragmentQuestions', 'fullQuestionRule', untype(region) + '\nreturn sys;'); }
  catch (e) { ok('시스템 지시 앞부분이 실행된다', false, String(e)); }
  if (sysOf) {
    const LV = { 1: '<L1>', 2: '<L2>', 3: '<L3>', 5: '<L5>' };
    const run = (lang, d) => { try { return sysOf(lang, 'Lily', 'kid', d, () => 'ZH', () => 'EN', () => 'AGE', LV, LV,
      M.checksFragmentQuestions, M.fullQuestionRule); } catch (e) { return 'CRASH ' + e; } };
    for (const d of [1, 2, 3]) {
      const t = run('en', d), rule = M.fullQuestionRule(d);
      ok(`${d}단계 지시에 그 단계의 «완전한 질문» 줄이 난이도 줄 뒤에 실린다`, t.includes(rule) && t.indexOf(rule) > t.indexOf('<L' + d + '>'), t.slice(-160));
    }
    ok('4단계 이상·중국어에는 안 실린다(짝)', !/\[완전한 질문\]/.test(run('en', 5)) && !/\[완전한 질문\]/.test(run('zh', 1)));
  }
}
// 6-2 fragQ 를 정본 판정에서 만들고 미리듣기에 «그 값» 을 넘긴다
{
  const i = idx.indexOf('    const sanityCap = ');
  const j = i < 0 ? -1 : idx.indexOf('const live = ', i);
  const k = j < 0 ? -1 : idx.indexOf(';\n', j);
  const region = i > 0 && j > i && k > j ? idx.slice(i, k + 1) : '';
  ok('fragQ·미리듣기 자리를 오려 냈다(전제)', !!region);
  let liveOf = null;
  try { liveOf = new Function('ctxLang', 'WARMUP_WORD_CAP', 'ctxDifficulty', 'checksFragmentQuestions', 'sseSend', 'createWarmupLive',
    'ctxFriend', 'studentInput', untype(region) + '\nreturn { fragQ, live };'); }
  catch (e) { ok('fragQ·미리듣기 자리가 실행된다', false, String(e)); }
  if (liveOf) {
    const run = (lang, d) => { let got = null; try { const r = liveOf(lang, { 1: 5, 2: 7, 3: 9, 5: 15 }, d, M.checksFragmentQuestions, () => {},
      (send, o) => { got = o; return { o }; }, 'Lily', 'I like stars.'); return { ...r, got }; } catch (e) { return { crash: String(e), got }; } };
    const r1 = run('en', 1), r5 = run('en', 5), rz = run('zh', 1);
    ok('1단계: fragQ 가 켜지고 미리듣기에 true 가 간다', r1.fragQ === true && r1.got && r1.got.fragQ === true, r1);
    ok('5단계·중국어: 꺼지고 미리듣기에도 false 가 간다(짝)', r5.fragQ === false && r5.got && r5.got.fragQ === false && rz.got && rz.got.fragQ === false, { r5, rz });
  }
}
// 6-3 반복 재시도가 조각 질문을 되살리지 않는다 — 그 if 블록을 통째로 돌린다
{
  const i = idx.indexOf('      if (aiText && warmupIsRepeat(aiText, history)) {');
  const block = i > 0 ? braceBlock(idx, i) : '';
  ok('반복 재시도 블록을 오려 냈다(전제)', !!block);
  let repOf = null;
  try { repOf = new AsyncFn('aiText', 'warmupIsRepeat', 'history', 'runWarmup', 'messages', 'takeWarmupReply', 'fragQ', 'fragmentQuestions',
    'commitFix', untype(block) + '\nreturn aiText;'); }
  catch (e) { ok('반복 재시도 블록이 실행된다', false, String(e)); }
  if (repOf) {
    const first = 'Do you like stars?';
    const run = async (fragQ, retry) => { try { return await repOf(first, (t) => t === first, [], async () => ({ response: retry }), [],
      (r) => r.response, fragQ, M.fragmentQuestions, () => {}); } catch (e) { return 'CRASH ' + e; } };
    ok('반복 재시도: 조각을 더 만들면 안 받는다', (await run(true, 'Like space?')) === first);
    ok('반복 재시도: 완전한 질문이면 받는다(짝)', (await run(true, 'Do you like space?')) === 'Do you like space?');
    ok('반복 재시도: 검사를 안 켠 단계면 예전 그대로', (await run(false, 'Like space?')) === 'Like space?');
  }
}

// ── ⑦ 엘리더잼 L1 — 접속사 지시가 «완전한 질문» 을 함께 요구한다 ───────────────────
if (full) {
const b0 = M.ELEADER_BOOK_UNITS[0];
const t0 = M.eleaderL1Topic(b0.id, 0, false, 'I like dogs.') || '';
ok('엘리더잼 L1: 접속사 뒤 질문은 완전한 문장이라고 말한다', /must still be a full question/.test(t0) && /never "By the way, like space\?"/.test(t0), t0.slice(-400));
const tAfter = M.eleaderL1Topic(b0.id, b0.questions.length, false, 'I like dogs.') || '';
ok('엘리더잼 L1: 책을 끝낸 뒤에도 같은 줄이 실린다', /must still be a full question/.test(tAfter));
}

console.log(`reply_fragment_question_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
