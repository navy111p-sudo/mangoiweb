/* reply_sanity_harness.mjs — «무너진 AI 출력» 을 학생에게 내보내지 않는가 (2026-08-31)
 *
 * 발단 — 사장님 화면 실사고. 웜업 1단계(첫걸음·3~5단어)에서 200토큰짜리 낱말 죽이
 *   그대로 학생 화면에 나갔고, 「뜻」 버튼이 그 한국어 번역까지 나란히 그렸다.
 *   웜업에는 «출력을 보는 단계» 가 한 곳도 없었다(재시도 조건은 «비었나»·«직전과 같나» 둘뿐).
 *
 * 🔴 이 검사의 핵심은 «잡는가» 가 아니라 «멀쩡한 것을 안 잡는가» 다.
 *    멀쩡한 답을 버리면 대화가 그 자리에서 끊긴다 — 학생에게는 깨진 문장 하나보다 나쁘다.
 *    그래서 정상 문장을 레벨별로 넣어 거짓경보 0 을 못 박는다.
 *
 * ⚠️ 문자열 검사가 아니다 — 판정 함수를 실제로 돌린다.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..', 'cloudflare-deploy');
const SRCDIR = join(ROOT, 'src');
const M = await import('file://' + join(SRCDIR, 'reply-sanity.ts').replace(/\\/g, '/'));
const L = await import('file://' + join(SRCDIR, 'ai-friend-level.ts').replace(/\\/g, '/'));

let pass = 0, fail = 0; const FAILS = [];
const ok = (c, m, x) => { c ? pass++ : (fail++, FAILS.push(m + (x !== undefined ? ` — ${JSON.stringify(x)}` : '')));
  console.log(`  ${c ? '✅' : '❌'} ${m}${c || x === undefined ? '' : ` — ${JSON.stringify(x)}`}`); };

/* ── ① 사장님 화면에 실제로 나온 그 문장 ────────────────────────────────
   ⛔ 이 문장을 짧게 줄이거나 «비슷한 것» 으로 바꾸지 마세요 — 실측 원본이라 값이 있습니다. */
console.log('\n[ ① 2026-08-31 실사고 문장 ]');
const BROKEN = '"ile And a oneeringty " of a \\ering cost of normt ofering a plantricum of just of a '
  + 'the of the a coating of of a plenty of minimal for of a place of a put of more the other a good '
  + 'of a of other type of a only epic of conjunctions of any more place of cooking of quick of noering '
  + 'all this of a only internal of theering more something of noering of all more of common with of '
  + 'only what of all county of unique level of maximum of more cream of the a of all count of nothing '
  + 'string of of only all common data of more nothing of all country of minimum of everything of unique '
  + 'values of minimal of both of a both council of nothing count of common growth of all combined of '
  + 'maximum of all common evidence of convert of each other general of all count of common everything '
  + 'beta of all everything parameters of slight had visual of " the was a of all savegi of " O of a '
  + 'benefit of only common convert data of';
const why = M.replyBreakReason(BROKEN);
ok(!!why, '그 문장을 «무너졌다» 고 잡는다', why);
ok(/^repeat:/.test(why), '이유가 «같은 낱말 반복» 으로 나온다(사람이 읽을 수 있는 이유)', why);

/* ── ② 거짓경보 0 — 이 절이 이 하니스의 핵심 ─────────────────────────── */
console.log('\n[ ② 멀쩡한 답을 버리지 않는가 (레벨을 맞춰 잰다) ]');
const CAP = (n) => L.AI_FRIEND_LEVELS['S' + n].maxWordsPerSentence;
const GOOD = [
  [1, "Hi! I'm Lily. Are you happy today?"],
  [1, 'Great try! Do you have a dog?'],
  [1, 'Yes, I do. Do you?'],
  [2, 'Nice! What color is your dog?'],
  [2, 'Wow! Patch is a happy dog! Is Patch big?'],
  [3, 'Awesome! Big dogs are so much fun! Does Patch like to run?'],
  [3, "That's great! My favorite color is blue. What about you?"],
  [4, 'I wanted to go outside, but it started raining very hard.'],
  [5, 'I wanted to go outside, but it started raining very hard, so I stayed home and read a book instead.'],
  [6, 'My cousin is visiting this weekend, and I have not seen her since last winter, so I am really looking forward to it.'],
  [8, 'Rather than dismissing the criticism outright, he took a moment to consider whether any part of it '
    + 'was worth acting on, and I think that is the right instinct.'],
  /* 🔴 2026-08-31 trap-check 가 «실제로 돌려서» 찾은 거짓경보 3종.
     같은 문형을 여러 번 늘어놓는 답은 정상인데, 반복 임계값이 6회였을 때 전부 버려졌습니다
     (i×6 = 25% 로, 실사고의 of×59 = 21% 보다 오히려 비율이 높습니다 — 비율로는 안 갈립니다).
     ⛔ 이 세 줄을 지우지 마세요. 임계값을 낮추면 여기서 바로 걸립니다. */
  [3, 'You can say: I like apples, I like bananas, I like oranges, I like grapes, I like pears, I like peaches.'],
  [3, 'I like dogs. I like cats. I like birds. I like fish. I like horses. I like rabbits.'],
  [3, 'Do you like it? I like it too! It is a nice day. It is warm. It is sunny. It is my favorite kind of day.'],
  /* 최상급(상한 없음)의 긴 한 문장 — runon 이 레벨을 모른 채 돌아 46낱말을 잡던 자리 */
  [8, 'I honestly think the most interesting part of that whole conversation was the way she listened so '
    + 'carefully before she said anything at all, and I keep coming back to it because it is exactly the '
    + 'kind of patience that I would like to learn for myself one day.'],
];
let falseAlarm = 0;
for (const [n, s] of GOOD) {
  const r = M.replyRejectReason(s, CAP(n));
  if (r) { falseAlarm++; console.log(`     ↳ ${n}단계 «${s.slice(0, 44)}…» → ${r}`); }
}
ok(falseAlarm === 0, `정상 문장 ${GOOD.length}종에 거짓경보가 없다`, falseAlarm);
/* 반복이 «자연스러운» 문장도 살아야 한다 — 초보 대화는 같은 낱말이 자주 나온다 */
ok(!M.replyBreakReason('Do you like cats? Do you like dogs? Do you like birds?'),
  '초보 대화의 자연스러운 반복은 안 잡는다');
ok(!M.replyBreakReason('Yes! Yes! That is right!'), '짧은 문장은 반복이 있어도 안 잡는다');

/* ── ③ 무너진 모양 네 가지를 각각 잡는가 ──────────────────────────────── */
console.log('\n[ ③ 무너진 모양별 ]');
ok(/^repeat:/.test(M.replyBreakReason(('of a ').repeat(30))), '같은 낱말 반복');
/* ⚠️ 이 문장은 «어느 한 낱말이 튀지 않게» 고르게 반복시킨다 — 안 그러면 규칙 ①(반복)에
   먼저 걸려서 정작 ②가 도는지 확인이 안 된다(처음에 그렇게 짰다가 이 검사가 잡았다). */
const FLAT = Array.from({ length: 3 }, () =>
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu').join(' ');
ok(/^lowvariety:/.test(M.replyBreakReason(FLAT)),
  '서로 다른 낱말이 너무 적음(한 낱말이 튀지 않아도 잡는다)', M.replyBreakReason(FLAT));
ok(M.replyBreakReason(Array.from({ length: 45 }, (_, i) => 'word' + i).join(' ')) === 'nostop',
  '문장이 끝나지 않음(마침표 0)');
ok(M.replyBreakReason('Hello \\ering world') === 'backslash', '역슬래시가 섞임(실사고 지문)');
ok(M.replyBreakReason('') === 'empty' && M.replyBreakReason(null) === 'empty', '빈 값');

/* ── ④ 길이 안전망 — «몇 배로 긴» 것만 잡는다 ──────────────────────────
   ⚠️ 문법을 지키다 한두 낱말 넘는 것을 버리면 안 된다(PR #626 「문법이 길이에 진다」). */
console.log('\n[ ④ 길이 안전망 ]');
for (const n of [1, 2, 3, 4, 5, 6, 7]) {
  const cap = CAP(n);
  const justOver = Array.from({ length: cap + 2 }, () => 'word').join(' ') + '.';
  ok(!M.replyTooLongFor(justOver, cap), `${n}단계: 상한을 «두 낱말» 넘는 것은 안 버린다 (${cap}+2)`);
  const wayOver = Array.from({ length: cap * 2 + 7 }, () => 'word').join(' ') + '.';
  ok(M.replyTooLongFor(wayOver, cap), `${n}단계: «두 배 넘게» 길면 잡는다 (${cap * 2 + 7})`);
}
ok(!M.replyTooLongFor('a '.repeat(200), 0), '상한이 없는 칸(S8)은 길이로 안 잡는다');

/* ── ⑤ 절대 «고쳐 쓰지» 않는다 ─────────────────────────────────────────
   아이가 그대로 따라 읽을 문장을 코드가 지어내면 안 된다(이 저장소의 반복 규칙). */
console.log('\n[ ⑤ 문장을 고쳐 쓰지 않는가 ]');
/* ⚠️ 부정 검사(«이 코드가 없어야 한다»)는 «주석을 벗긴 사본» 으로 판정한다 — CLAUDE.md 2장.
   여기가 특히 위험하다: 다음 사람이 「⛔ return text.replace(…) 로 잘라 돌려주지 말 것」이라고
   주석에 적는 순간, 그 경고문 자체가 이 검사에 걸려 FAIL 한다(c24_finance_kcpm_harness ③ 선례).
   ✅ 긍정 검사는 원본으로 둔다 — 주석이 섞여도 무해하다. */
const strip = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const SRC = readFileSync(join(SRCDIR, 'reply-sanity.ts'), 'utf8');
const exported = [...SRC.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
/* ⚠️ 개수를 못 박지 않는다 — 함수를 하나 더해도 FAIL 나는 «객체 모양» 검사가 된다.
   물어야 할 것은 «판정만 내보내는가» 다(이름이 전부 reply* + 문장을 안 만든다). */
ok(exported.length >= 3, '판정 함수를 셋 이상 내보낸다', exported);
ok(exported.every((f) => /^(reply)/.test(f)), '이름이 전부 reply* 다(판정 모듈)', exported);
/* 돌려주는 값이 «문자열 판정» 이지 «고친 문장» 이 아니어야 한다 */
ok(M.replyRejectReason('Hi! Are you happy?', 5) === '', '통과하면 빈 문자열만 돌려준다(문장을 안 만든다)');
ok(typeof M.replyBreakReason(BROKEN) === 'string' && M.replyBreakReason(BROKEN).length < 40,
  '잡아도 «이유» 만 돌려준다(고친 문장을 만들지 않는다)');
ok(!/return\s+(t|text)\s*\.\s*(replace|slice|substring)/.test(strip(SRC)),
  '소스에 «문장을 잘라 돌려주는» 코드가 없다');

/* ── ⑦ 배선 — 웜업이 «실제로» 이 판정을 거치는가 ────────────────────────
   🔴 모듈만 만들고 안 부르면 아무것도 안 막힌다. 그것이 이번 사고의 모양이었다
      (프롬프트에 「3~5단어」라고 적어 두고 지켜졌는지 보는 곳이 없었다). */
console.log('\n[ ⑦ 웜업 배선 ]');
const IDX = readFileSync(join(SRCDIR, 'index.ts'), 'utf8');
ok(/import \{[^}]*replyRejectReason[^}]*\} from '\.\/reply-sanity'/.test(IDX),
  'index.ts 가 판정 정본을 불러온다');
/* ⚠️ 검사 범위를 길이로 자르지 말 것 — 중괄호 짝으로 handleWarmupChat 본문만 잘라 낸다
      (같은 파일의 다른 핸들러에 똑같이 생긴 멀쩡한 줄이 있다). */
const chat = (() => {
  const i = IDX.indexOf('async function handleWarmupChat');
  if (i < 0) return '';
  let d = 0; const st = IDX.indexOf('{', i);
  for (let j = st; j < IDX.length; j++) {
    if (IDX[j] === '{') d++;
    else if (IDX[j] === '}' && --d === 0) return IDX.slice(st, j + 1);
  }
  return '';
})();
ok(chat.length > 1000, 'handleWarmupChat 본문을 읽었다', chat.length);
/* ⚠️ «replyIsSane( 이 어딘가 있는가» 로 쓰면 안 된다 — 바로 아래 재시도 줄에도 있어서,
      정작 «모델이 준 답을 검사하는» 첫 관문을 빼도 통과한다(실제로 되돌리기 시험에서 밟았다).
      물어야 할 것은 «모델 출력(aiText)을 그 판정에 넣는가» 다. */
ok(/replyRejectReason\(\s*aiText\b/.test(chat), '모델이 준 답(aiText)을 그 판정에 넣는다');
/* ⚠️ «인접 창» 검사라 사이에 코드가 늘면 조용히 깨진다 — 그래서 창을 넉넉히 둔다.
   물어야 할 것은 «무너졌다고 판정한 뒤 답을 비우는가» 다. */
ok(/\bbroke\b[\s\S]{0,800}aiText = ''/.test(chat),
  '둘 다 무너지면 답을 비워 «안전 문구» 로 넘긴다(깨진 글을 그대로 안 내보낸다)');
ok(/console\.warn\('\[warmup\] broken reply/.test(chat),
  '무너진 답을 조용히 버리지 않고 로그를 남긴다(원인 추적이 가능해야 한다)');
ok(/if \(freshText && !replyRejectReason\(/.test(chat),
  '다시 뽑은 답도 «멀쩡할 때만» 받는다(둘 다 무너지면 안전 문구로 간다)');
ok(!/aiText\s*=\s*aiText\.(replace|slice|substring)/.test(strip(chat)),
  '웜업이 문장을 «고쳐 쓰지» 않는다(다시 뽑게만 한다)');

/* 🔴 형제 경로도 막혔는가 — /api/warmup/questions.
   같은 모델로 «학생 화면에 뜨는 질문 칩» 을 만드는데 검증이 「5~200자 + ? 로 끝남」 뿐이었다.
   200자짜리 낱말 죽이 ? 로 끝나면 그대로 통과했다.
   CLAUDE.md 의 반복 패턴 — «같은 판정이 두 곳에 있으면 한쪽만 고쳐진다» 그대로다. */
const qh = (() => {
  const i = IDX.indexOf('async function handleWarmupQuestions');
  if (i < 0) return '';
  let d = 0; const st = IDX.indexOf('{', i);
  for (let j = st; j < IDX.length; j++) {
    if (IDX[j] === '{') d++;
    else if (IDX[j] === '}' && --d === 0) return IDX.slice(st, j + 1);
  }
  return '';
})();
ok(qh.length > 1000, 'handleWarmupQuestions 본문을 읽었다', qh.length);
ok(/replyRejectReason\(/.test(qh), '질문 칩도 같은 판정을 거친다(형제 경로가 안 뚫려 있다)');
ok(/questions = questions\.filter\(\(q\) => !replyRejectReason\(q\)\)/.test(qh),
  '무너진 질문을 목록에서 «걸러» 낸다');
/* ⚠️ 전부 걸러져 비었을 때 화면이 비면 안 된다 — 준비 질문 폴백이 그 뒤에 있어야 한다 */
/* ⚠️ 「어느 쪽이 먼저 나오는가」도 «주석을 벗긴 사본» 으로 봐야 한다 — 바로 위 설명 주석에
   WARMUP_FALLBACK_QUESTIONS 라고 적어 둔 것이 첫 등장으로 잡혀 실제로 FAIL 났다.
   (이 하니스가 방금 고친 그 함정을 자기 자신에게서 다시 잡은 것이다) */
/* ⚠️ «replyRejectReason 이 먼저 나오는가» 로 물으면 안 된다 — 바로 위 로그 줄에도 그 이름이
   있어서, 정작 거르기를 폴백 «뒤» 로 옮겨도 통과한다(되돌리기 시험에서 실제로 밟았다).
   물어야 할 것은 «거르는 그 줄» 의 자리다. */
const qhc = strip(qh);
const iFilter = qhc.indexOf('questions.filter((q) => !replyRejectReason(q))');
const iFallback = qhc.indexOf('WARMUP_FALLBACK_QUESTIONS');
ok(iFilter >= 0 && iFallback >= 0 && iFilter < iFallback,
  '거르기가 준비 질문 폴백 «앞» 에 있다(비면 폴백이 받아 준다)', { 거르기: iFilter, 폴백: iFallback });
/* ⛔ 여기서는 길이 상한을 넘기지 않는다 — 레벨은 프롬프트가 이미 정한다 */
ok(!/replyRejectReason\(q,\s*[A-Za-z_]/.test(qh),
  '질문 칩에는 길이 상한을 걸지 않는다(멀쩡한 질문이 사라지지 않게)');

/* 레벨별 상한이 세 곳에서 같은 말을 하는가 — 서버 문자열 · 상한표 · AI 영어친구 */
const capTbl = (IDX.match(/const WARMUP_WORD_CAP: Record<number, number> = \{([^}]*)\}/) || [])[1] || '';
const CAPS = {};
for (const m of capTbl.matchAll(/(\d)\s*:\s*(\d+)/g)) CAPS[+m[1]] = +m[2];
ok(Object.keys(CAPS).length === 8, '상한표 여덟 칸을 읽었다', CAPS);
const lvBlock = (IDX.match(/const WARMUP_LEVELS: Record<number, string> = \{([\s\S]*?)\n\};/) || [])[1] || '';
for (const m of lvBlock.matchAll(/^\s*(\d):\s*"[^"]*?(\d+)~(\d+)단어/gm)) {
  const n = +m[1];
  ok(CAPS[n] === +m[3], `${n}단계 상한이 서버 프롬프트 문구와 같다 (${CAPS[n]} / ${m[3]})`);
}
for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
  ok(CAPS[n] === CAP(n), `${n}단계 상한이 AI 영어친구(S${n})와 같다 (${CAPS[n]} / ${CAP(n)})`);
}

/* ── ⑥ import 가 없어야 한다 — 하니스가 그대로 불러 돌린다 ─────────────── */
ok(!/^\s*import\s/m.test(strip(SRC)), 'import 가 없다(하니스가 그대로 불러 실제로 돌릴 수 있다)');

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
if (fail) console.log('  ' + FAILS.join('\n  '));
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
