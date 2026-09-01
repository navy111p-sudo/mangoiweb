/* friend_name_guard_harness.mjs — 「AI 가 자기를 다른 이름으로 소개하면 다시 뽑는가」 (2026-08-31)
 *
 * 발단 — 사장님 제보가 두 번 왔고 그때마다 «다른» 이름이었다: 루이(Louie) → 로이(Roy).
 *   즉 모델이 매번 지어내는 것이라, 화면 이름을 바꿔 맞추는 것은 움직이는 과녁을 쫓는 일이다.
 *   이름은 이미 프롬프트에 들어가는데도(resolveFriendName) 가끔 어긴다 —
 *   이 저장소가 오늘만 세 번 확인한 「지시만으로는 안 지켜진다」 그대로다.
 *
 * 🔴 이 검사의 핵심은 «잡는가» 가 아니라 «멀쩡한 답을 안 버리는가» 다.
 *    초보 대화에서 "I'm happy" · "I'm a teacher" 는 «이름» 보다 훨씬 흔하다.
 *    그것까지 잡으면 대화가 끊긴다 — 학생에게는 이름 한 번 틀린 것보다 나쁘다.
 *
 * ⚠️ 문자열 검사가 아니다 — 판정 함수를 실제로 돌린다.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..', 'cloudflare-deploy');
const SRCDIR = join(ROOT, 'src');
const F = await import('file://' + join(SRCDIR, 'ai-friends.ts').replace(/\\/g, '/'));

let pass = 0, fail = 0; const FAILS = [];
const ok = (c, m, x) => { c ? pass++ : (fail++, FAILS.push(m + (x !== undefined ? ` — ${JSON.stringify(x)}` : '')));
  console.log(`  ${c ? '✅' : '❌'} ${m}${c || x === undefined ? '' : ` — ${JSON.stringify(x)}`}`); };

/* ── ① 사장님이 실제로 보신 모양을 잡는가 ──────────────────────────────
   ⛔ 이 문장들을 «비슷한 것» 으로 바꾸지 마세요 — 실제 제보에서 온 형태입니다. */
console.log('\n[ ① 실제 제보 형태 ]');
const CAUGHT = [
  ['My name is Roy! Do you like cats?', 'Roy'],
  ["Hi! I'm Louie. What do you like to do?", ''],          // ← 아래에서 따로 설명
  ['You can call me Louie. Do you have a pet?', 'Louie'],
  ["My name's Roy. Nice to meet you!", 'Roy'],
];
ok(F.wrongSelfName(CAUGHT[0][0], 'Lily') === 'Roy',
  '「My name is Roy」를 잡는다', F.wrongSelfName(CAUGHT[0][0], 'Lily'));
ok(F.wrongSelfName(CAUGHT[2][0], 'Lily') === 'Louie',
  '「You can call me Louie」를 잡는다', F.wrongSelfName(CAUGHT[2][0], 'Lily'));
ok(F.wrongSelfName(CAUGHT[3][0], 'Lily') === 'Roy',
  "「My name's Roy」(줄임표) 도 잡는다", F.wrongSelfName(CAUGHT[3][0], 'Lily'));
/* ⚠️ "I'm Louie" 는 «지어낸 이름» 이라 ②의 좁은 규칙으로는 안 잡힌다 — 의도한 한계다.
      넓히면 "I'm happy" 까지 버리게 된다. 대신 «우리 친구 넷» 은 잡는다(아래 ②). */
ok(F.wrongSelfName("Hi! I'm Louie. What do you like?", 'Lily') === '',
  "「I'm + 지어낸 이름」은 «일부러» 안 잡는다(거짓경보를 막는 쪽을 택함)");
ok(F.wrongSelfName("Hi! I'm Emma. What do you like?", 'Lily') === 'Emma',
  "「I'm + 우리 친구 다른 이름」은 잡는다");
ok(F.wrongSelfName('Emma here! Do you like dogs?', 'Lily') === 'Emma',
  '「Emma here!」도 잡는다');

/* ── ② 거짓경보 0 — 이 절이 이 하니스의 핵심 ──────────────────────────── */
console.log('\n[ ② 멀쩡한 답을 버리지 않는가 ]');
const GOOD = [
  "Hi! I'm Lily. Nice to meet you!",
  'My name is Lily! Do you like cats?',
  "You're right, my name is Lily! I'm so happy you remembered! Do you like cats?",
  'I know, my name is Lily! Thank you for correcting me! Do you like playing with friends?',
  /* 🔴 초보 대화에서 압도적으로 흔한 "I'm ~" — 여기가 무너지면 대화가 통째로 끊긴다 */
  "I'm happy today! Are you happy?",
  "I'm so glad you asked! Do you like pizza?",
  "I'm a teacher. What do you do?",
  "I'm good, thank you! And you?",
  "I'm from Korea. Where are you from?",
  "I'm Korean. Are you Korean too?",
  "I'm ready! Are you ready?",
  "I'm sorry. Can you say that again?",
  "I'm not sure. What do you think?",
  /* 학생 이름을 부르는 것은 «자기 소개» 가 아니다 */
  'Your name is Minsu! That is a nice name.',
  'Nice to meet you, Minsu! Do you like soccer?',
  'This is a dog. Do you like dogs?',
  /* 부정문 — 「내 이름은 Emma 가 아니야」는 오히려 맞는 말이다 */
  "My name is not Emma. My name is Lily!",
  /* 대문자 문장 시작이 이름처럼 보이는 자리 */
  'I am Lily. What is your name?',
  'Lily here! Ready to practice?',
];
let falseAlarm = 0;
for (const s of GOOD) {
  const r = F.wrongSelfName(s, 'Lily');
  if (r) { falseAlarm++; console.log(`     ↳ «${s.slice(0, 46)}…» → ${r}`); }
}
ok(falseAlarm === 0, `정상 답변 ${GOOD.length}종에 거짓경보가 없다`, falseAlarm);

/* 다른 친구를 골랐을 때도 같은 규칙이 돌아야 한다 */
console.log('\n[ ③ 네 친구 모두에게 같은 규칙 ]');
const NAMES = ['Emma', 'Jake', 'Lily', 'Noah'];
for (const me of NAMES) {
  ok(F.wrongSelfName(`Hi! I'm ${me}. Let's talk!`, me) === '', `${me}: 자기 이름은 통과`);
  const other = NAMES.filter((n) => n !== me)[0];
  ok(F.wrongSelfName(`Hi! I'm ${other}. Let's talk!`, me) === other,
    `${me}: 남의 이름(${other})은 잡는다`);
}

/* ── ④ 망가진 입력에도 죽지 않는다 ────────────────────────────────────── */
console.log('\n[ ④ 망가진 입력 ]');
ok(F.wrongSelfName(null, 'Lily') === '' && F.wrongSelfName('', 'Lily') === '', '빈 답변');
ok(F.wrongSelfName('My name is Roy.', '') === '', '기대 이름이 비면 판정하지 않는다');
ok(F.wrongSelfName('My name is Roy.', null) === '', '기대 이름이 null 이어도 안 죽는다');

/* ── ⑤ 고쳐 쓰지 않는다 — «이름» 만 돌려준다 ──────────────────────────── */
console.log('\n[ ⑤ 문장을 고쳐 쓰지 않는가 ]');
const strip = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const SRC = readFileSync(join(SRCDIR, 'ai-friends.ts'), 'utf8');
const got = F.wrongSelfName('My name is Roy! Do you like cats?', 'Lily');
ok(got === 'Roy' && got.length < 20, '잡아도 «그 이름» 만 돌려준다(고친 문장을 만들지 않는다)', got);
ok(!/\.replace\(\s*\/[^/]*name/i.test(strip(SRC)),
  '소스에 «이름만 바꿔치기» 하는 코드가 없다',
  '이름을 갈아 끼우면 뒤따르는 말과 앞뒤가 안 맞는다 — 다시 뽑게만 한다');

/* ── ⑥ 배선 — 두 화면이 «실제로» 이 판정을 거치는가 ─────────────────────
   🔴 모듈만 만들고 안 부르면 아무것도 안 막힌다. 이번 사고의 모양이 그것이었다. */
console.log('\n[ ⑥ 배선 ]');
const block = (src, head) => {
  const i = src.indexOf(head);
  if (i < 0) return '';
  let d = 0; const st = src.indexOf('{', i);
  for (let j = st; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(st, j + 1);
  }
  return '';
};
const IDX = readFileSync(join(SRCDIR, 'index.ts'), 'utf8');
const AI = readFileSync(join(SRCDIR, 'api-ai.ts'), 'utf8');

const warm = block(IDX, 'async function handleWarmupChat');
ok(warm.length > 1000, '웜업 대화 본문을 읽었다', warm.length);
ok(/wrongSelfName\(/.test(IDX), 'index.ts 가 판정을 불러온다');
ok(/wrongSelfName\(\s*aiText/.test(warm), '웜업이 «모델이 준 답» 을 그 판정에 넣는다');

const friend = block(AI, "case 'chat-friend'") || AI;
ok(/wrongSelfName\(/.test(AI), 'api-ai.ts 가 판정을 불러온다');

/* 두 화면 모두 «다시 뽑는» 자리여야 한다 — 그냥 버리면 대화가 끊긴다 */
ok(/wrongSelfName[\s\S]{0,900}env\.AI\.run/.test(warm),
  '웜업: 이름을 어기면 «다시 뽑는다»(그냥 버리지 않는다)');

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
if (fail) console.log('  ' + FAILS.join('\n  '));
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
