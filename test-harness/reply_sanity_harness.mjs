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
];
let falseAlarm = 0;
for (const [n, s] of GOOD) {
  const r = M.replyIsSane(s, CAP(n));
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
const SRC = readFileSync(join(SRCDIR, 'reply-sanity.ts'), 'utf8');
const exported = [...SRC.matchAll(/export function (\w+)\(/g)].map((m) => m[1]);
ok(exported.length === 3, '내보내는 함수가 셋이다(판정만)', exported);
ok(exported.every((f) => /^(reply)/.test(f)), '이름이 전부 reply* 다(판정 모듈)', exported);
/* 돌려주는 값이 «문자열 판정» 이지 «고친 문장» 이 아니어야 한다 */
ok(M.replyIsSane('Hi! Are you happy?', 5) === '', '통과하면 빈 문자열만 돌려준다(문장을 안 만든다)');
ok(typeof M.replyBreakReason(BROKEN) === 'string' && M.replyBreakReason(BROKEN).length < 40,
  '잡아도 «이유» 만 돌려준다(고친 문장을 만들지 않는다)');
ok(!/return\s+(t|text)\s*\.\s*(replace|slice|substring)/.test(SRC),
  '소스에 «문장을 잘라 돌려주는» 코드가 없다');

/* ── ⑥ import 가 없어야 한다 — 하니스가 그대로 불러 돌린다 ─────────────── */
ok(!/^\s*import\s/m.test(SRC), 'import 가 없다(하니스가 그대로 불러 실제로 돌릴 수 있다)');

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
if (fail) console.log('  ' + FAILS.join('\n  '));
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
