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
let build;
try { ({ build } = require('esbuild')); }
catch { console.log('⏭ SKIP reply_fragment_question_harness — esbuild 없음'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('❌ FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };

const SRC = process.env.RQ_SRC_DIR || (root + '/cloudflare-deploy');
const out = tmpdir() + '/reply-frag-' + process.pid + '.mjs';
await build({
  stdin: { contents: "export * from './src/reply-questions'; export { createWarmupLive } from './src/warmup-stream'; export { replyRejectReason } from './src/reply-sanity'; export * from './src/eleader-l1'; export { ELEADER_BOOK_UNITS } from './src/eleader-book-pack';", resolveDir: SRC },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
});
const M = await import(pathToFileURL(out));
const idx = readFileSync(SRC + '/src/index.ts', 'utf8');

// ── ① 조각 질문은 잡는다 ────────────────────────────────────────────────
const FRAGS = [
  'Like space?', 'like space?', 'By the way, like space?', 'So, like space?', 'Oh, and like space?', 'Of course, like dogs?',
  'Great job! Like space?', 'Wow! Space is cool. Like space too?', 'One more thing: like cats?', 'Also, want a dog?',
  'Cats or dogs?', 'Do you like cats? Or dogs?', 'Space?', 'You like space?', 'So you like dogs?', 'Ready to start?',
  'Moreover, big dogs?', 'Nice! Favorite color?', 'Good job, like pizza too?', 'Ed, like space?',
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
let book = 0, bookBad = [];
for (const b of M.ELEADER_BOOK_UNITS) for (const q of b.questions) for (const t of [q.question, q.hint, q.model]) {
  if (!t) continue; book++; if (M.fragmentQuestions(String(t)).length) bookBad.push(b.id + ': ' + t);
}
ok(`엘리더잼 교재 문장 ${book}개 거짓 경보 0`, book > 400 && bookBad.length === 0, bookBad.slice(0, 5));
const fb = (idx.match(/const WARMUP_FALLBACK_QUESTIONS[\s\S]*?\n\};/) || [''])[0].match(/'[^']*\?'|"[^"]*\?"/g) || [];
ok('웜업 준비 질문을 읽었다(전제)', fb.length >= 10, fb.length);
ok('웜업 준비 질문 거짓 경보 0', fb.every((q) => !M.fragmentQuestions(q.slice(1, -1)).length), fb.filter((q) => M.fragmentQuestions(q.slice(1, -1)).length));

// ── ③ 어느 단계에서 보나 ─────────────────────────────────────────────────
ok('영어 1~3단계만 본다', [1, 2, 3].every((d) => M.checksFragmentQuestions(d, 'en')));
ok('4~8단계·단계 모름(0)은 안 본다', [0, 4, 5, 6, 7, 8].every((d) => !M.checksFragmentQuestions(d, 'en')));
ok('중국어는 안 본다', !M.checksFragmentQuestions(1, 'zh'));
ok('힌트가 틀린 문장을 그대로 보여 준다', /"By the way, like space\?"/.test(M.fragmentQuestionHint(['By the way, like space?'])));
ok('힌트가 JSON 형식을 지키라고 한다', /JSON/.test(M.fragmentQuestionHint(['x?'])));

// ── ④ 미리듣기(스트리밍) 차단 — 켜졌을 때만 멈추고, 안 켜면 예전 그대로(짝) ────────────────
const mk = (fragQ) => { const sent = []; const live = M.createWarmupLive((o) => sent.push(o), { lang: 'en', cap: 5, friend: 'Lily', studentInput: 'I like stars.', fragQ }); return { live, sent }; };
{ const { live, sent } = mk(true); live.push('Great job!'); live.push('By the way, like space?');
  ok('미리듣기: 조각 질문에서 멈춘다', live.halted() === 'fragment' && sent.length === 1, { h: live.halted(), n: sent.length }); }
{ const { live, sent } = mk(true); live.push('Great job!'); live.push('By the way, do you like space?');
  ok('미리듣기: 완전한 질문은 흘려보낸다', live.halted() === '' && sent.length === 2, { h: live.halted(), n: sent.length }); }
{ const { live, sent } = mk(undefined); live.push('By the way, like space?');
  ok('미리듣기: 검사를 안 켜면 예전 그대로(상급·중국어)', live.halted() === '' && sent.length === 1); }

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
    block + '\nreturn aiText;');
} catch (e) { ok('재시도 블록이 실행 가능', false, String(e)); }
const quiet = { warn() {} };
async function sim({ fragQ = true, first, retry, throws = false, sane = () => '', badName = () => '' }) {
  const calls = []; let committed = 0;
  const runWarmup = async (msgs) => { calls.push(msgs); if (throws) throw new Error('boom'); return { response: retry }; };
  let out;
  try {
    out = await runBlock(fragQ, first, M.fragmentQuestions, M.fragmentQuestionHint, runWarmup, [{ role: 'system', content: 's' }],
      (r) => r.response, sane, 5, badName, 'Lily', () => false, 'I like stars.', () => { committed++; }, 1, quiet);
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
}

// ── ⑥ 배선 — 지시·미리듣기·반복 재시도 ───────────────────────────────────
const strip = (t) => t.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');
const code = strip(idx);
const lvAt = code.indexOf("if (ctxDifficulty) sys += ` [난이도] ");
const ruleAt = code.indexOf("if (checksFragmentQuestions(ctxDifficulty, ctxLang)) sys += ' ' + FULL_QUESTION_RULE;");
ok('기초 단계 지시에 «완전한 질문» 줄을 붙인다(난이도 줄 바로 뒤)', lvAt > 0 && ruleAt > lvAt && ruleAt - lvAt < 600);
ok('fragQ 를 정본 판정에서 만든다', /const fragQ = checksFragmentQuestions\(ctxDifficulty, ctxLang\);/.test(code));
ok('미리듣기에 fragQ 를 넘긴다', /createWarmupLive\(sseSend, \{[^}]*\bfragQ\b[^}]*\}\)/.test(code));
const rep = (code.match(/if \(retryText && !warmupIsRepeat\(retryText, history\)\s*&&([\s\S]*?)\) \{ aiText = retryText; commitFix\(\); \}/) || [])[1];
ok('반복 재시도가 조각 질문을 되살리지 않는다(조건이 있다)', !!rep);
if (rep) {
  const cond = new Function('fragQ', 'fragmentQuestions', 'retryText', 'aiText', 'return (' + rep + ');');
  ok('반복 재시도: 조각을 더 만들면 안 받는다', cond(true, M.fragmentQuestions, 'Like space?', 'Do you like stars?') === false);
  ok('반복 재시도: 완전한 질문이면 받는다', cond(true, M.fragmentQuestions, 'Do you like space?', 'Do you like stars?') === true);
  ok('반복 재시도: 검사를 안 켠 단계면 예전 그대로', cond(false, M.fragmentQuestions, 'Like space?', 'Do you like stars?') === true);
}

// ── ⑦ 엘리더잼 L1 — 접속사 지시가 «완전한 질문» 을 함께 요구한다 ───────────────────
const b0 = M.ELEADER_BOOK_UNITS[0];
const t0 = M.eleaderL1Topic(b0.id, 0, false, 'I like dogs.') || '';
ok('엘리더잼 L1: 접속사 뒤 질문은 완전한 문장이라고 말한다', /must still be a full question/.test(t0) && /never "By the way, like space\?"/.test(t0), t0.slice(-400));
const tAfter = M.eleaderL1Topic(b0.id, b0.questions.length, false, 'I like dogs.') || '';
ok('엘리더잼 L1: 책을 끝낸 뒤에도 같은 줄이 실린다', /must still be a full question/.test(tAfter));

console.log(`reply_fragment_question_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
