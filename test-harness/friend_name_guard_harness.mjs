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
   ⛔ 이 문장들을 «비슷한 것» 으로 바꾸지 마세요 — 실제 제보에서 온 형태입니다.

   🔴 2026-09-01 — 첫 판(8/31)을 배포했는데 사장님이 「계속 루이라고 말해」라고 하셨습니다.
      실측하니 열 가지 자기소개 모양 중 «두 가지» 만 잡고 있었고, 제일 흔한 「Hi! I'm Louie.」가
      제가 «일부러 안 잡는다» 고 주석까지 달아 둔 자리였습니다. 근거로 든 "I'm happy" ·
      "I'm a teacher" 는 전부 «소문자» 인데, 그것을 못 보고 그 자리를 통째로 포기했던 것입니다.
      ⟹ 아래 목록에서 한 줄이라도 빼면 그 사고가 그대로 돌아옵니다. */
console.log('\n[ ① 실제 제보 형태 — 전부 잡아야 한다 ]');
const CAUGHT = [
  ["Hi! I'm Louie. How are you today?", 'Louie'],        // ← 8/31 판이 놓쳤던 바로 그 문장
  ["I'm Louie! Nice to meet you.", 'Louie'],
  ['I am Louie, your English friend.', 'Louie'],
  ['My name is Louie.', 'Louie'],
  ['You can call me Louie. Do you have a pet?', 'Louie'],
  ["My name's Roy. Nice to meet you!", 'Roy'],
  ['My name is Roy! Do you like cats?', 'Roy'],
  ['Hello! Louie is my name.', 'Louie'],
  /* 곱슬 따옴표 — 모델이 자주 씁니다. 안 펴면 통째로 놓칩니다. */
  ['Hi! I’m Louie. What do you like?', 'Louie'],
  ['My name’s Roy.', 'Roy'],
  /* 우리 친구 이름·기본 이름(Mango)을 대는 것도 «어긴 것» 입니다 */
  ["Hi! I'm Emma. What do you like?", 'Emma'],
  ['Emma here! Do you like dogs?', 'Emma'],
  ["I'm Mango, your Mangoi friend!", 'Mango'],
];
for (const [sent, want] of CAUGHT) {
  const got = F.wrongSelfName(sent, 'Lily');
  ok(got === want, `잡는다: ${JSON.stringify(sent.slice(0, 40))}`, got);
}

/* ②ⓑ 학생이 «이름» 을 물은 턴 — 그때는 「I'm X」도 이름으로 본다.
   ⚠️ 한국어로 묻는 학생이 훨씬 많다. 영어만 보면 이 신호가 거의 안 켜진다. */
console.log('\n[ ①-2 학생이 이름을 물었을 때 ]');
for (const q of ["What's your name?", 'what is your name', 'Who are you?',
                 '이름이 뭐야?', '너 이름 뭐니', '넌 누구야?']) {
  ok(F.askedOwnName(q) === true, `이름을 물은 것으로 본다: ${JSON.stringify(q)}`);
}
for (const q of ['Do you like cats?', 'I like red', '오늘 뭐 했어?', 'My name is Minsu.']) {
  ok(F.askedOwnName(q) === false, `이름 질문이 아니다: ${JSON.stringify(q)}`, F.askedOwnName(q));
}
ok(F.wrongSelfName("I'm Louie.", 'Lily', { askedName: true }) === 'Louie',
  '이름을 물었으면 「I\'m Louie.」를 잡는다');
ok(F.wrongSelfName("I'm Louie.", 'Lily') === '',
  '안 물었고 뒷받침도 없으면 «모르는 것» 으로 둔다(지어내지 않는다)');

/* ── ② 거짓경보 0 — 이 절이 이 하니스의 핵심 ────────────────────────────
   🔴 ①을 넓힌 대가가 여기서 드러납니다. 멀쩡한 답을 버리면 학생은 자기 질문에 대한 답 대신
      «이름 정정» 을 받습니다 — 이름 한 번 틀린 것보다 나쁩니다.
   ⛔ NOT_A_NAME 을 «흔한 영어 낱말 사전» 으로 키워서 통과시키지 마세요 —
      진짜 사람 이름(Grace·May·Summer·Joy)까지 함께 통과합니다. */
console.log('\n[ ② 멀쩡한 답을 버리지 않는가 ]');
const GOOD = [
  "Hi! I'm Lily. Nice to meet you!",
  'My name is Lily! Do you like cats?',
  "You're right, my name is Lily! I'm so happy you remembered! Do you like cats?",
  'I know, my name is Lily! Thank you for correcting me! Do you like playing with friends?',
  'Hi! I’m Lily. How are you?',
  /* 🔴 초보 대화에서 압도적으로 흔한 "I'm ~" — 여기가 무너지면 대화가 통째로 끊긴다 */
  "I'm happy today! Are you happy?",
  "I'm so glad you asked! Do you like pizza?",
  "I'm a teacher. What do you do?",
  "I'm good, thank you! And you?",
  "I'm from Korea. Where are you from?",
  "I'm ready! Are you ready?",
  "I'm sorry. Can you say that again?",
  "I'm not sure. What do you think?",
  "I'm learning too! Let's practice together.",
  "I'm excited! Do you like games?",
  'Wow! I’m so proud of you!',
  /* 🔴 국적·언어 — 대문자로 오지만 이름이 아니다. 필리핀·중국 강사가 있어 실제로 나온다. */
  "I'm Korean. Are you Korean too?",
  "I'm Filipino. Do you know the Philippines?",
  "I'm American, but I love kimchi!",
  "I'm English and I love teaching!",
  "I'm OK! How about you?",
  /* 호칭이 앞에 붙은 자기소개 — 같은 문장에 기대 이름이 있으므로 어긴 것이 아니다 */
  "I'm Teacher Lily. Let's start!",
  "I'm your friend Lily!",
  'I’m Lily, your English friend. Do you like cats?',
  /* 학생 이름을 부르거나 사물을 가리키는 것은 «자기 소개» 가 아니다 */
  'Your name is Minsu! That is a nice name.',
  'Nice to meet you, Minsu! Do you like soccer?',
  'This is a dog. Do you like dogs?',
  'Come here and look! Do you see it?',
  'Right here! Can you find it?',
  /* 부정문 — 「내 이름은 Emma 가 아니야」는 오히려 맞는 말이다 */
  'My name is not Emma. My name is Lily!',
  /* 대문자 문장 시작이 이름처럼 보이는 자리 */
  'I am Lily. What is your name?',
  'Lily here! Ready to practice?',
  'Great try! Do you have a dog?',
  /* 🔴 2026-09-01 함정 대조가 실측한 거짓경보 갈래 — 이 줄들을 빼면 그 사고가 안 보이게 된다.
     ⚠️ 「I'm Taiwanese.」는 「I'm Louie.」와 문장 구조가 «완전히 같다» — 낱말을 모르면 못 가른다.
        그래서 판정은 허용목록이 아니라 «뒷받침»(아는 이름·이름 질문·인사말·동격)으로 한다. */
  "I'm Taiwanese.", "I'm Singaporean.", "I'm Malaysian.", "I'm Indonesian.",
  "I'm Cebuano.", "I'm Bisaya.", "I'm Ilocano.", "I'm Tagalog.",
  "I'm Turkish.", "I'm Dutch.", "I'm Irish.", "I'm Portuguese.", "I'm Nigerian.",
  "I'm Vietnamese, and I love teaching!",
  /* 종교 — 국적과 같은 자리에 같은 모양으로 온다 */
  "I'm Christian.", "I'm Catholic.", "I'm Buddhist.", "I'm Muslim.", "I'm Jewish.",
  /* 소유격 */
  "I'm Mangoi's English friend!", "I'm Mom's helper!", "I'm Monday's biggest fan!",
  /* 전부 대문자 강조 */
  "I'm SLEEPY.", "I'm COOL!", 'WOW! I’m AMAZED!',
  /* 고유명사가 «꾸미는 말» 로 온 자리 — 뒤에 말이 이어지면 이름이 아니다 */
  "I'm Seoul born!", "I'm Zoom ready!", "I'm January born!", "I'm Disney crazy!",
  /* 🔴 위 갈래를 «인사말이 함께 있는» 문장으로 다시 한 번 — 뒷받침 관문이 열린 상태에서도
     소유격·전부대문자·꾸미는 말 거름망이 살아 있어야 한다. 이 줄들이 없으면 그 셋을 지워도
     하니스가 초록이다(2026-09-01 되돌리기 검증에서 실제로 그랬다). */
  "Hi! I'm Mangoi's English friend!",
  "Hello! I'm Mom's helper today.",
  "Hey! I'm SLEEPY.",
  "Hi! I'm Seoul born!",
  "Hello! I'm Zoom ready!",
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
/* ⚠️ «식 모양» 을 글자 그대로 못 박지 말 것 — 2026-09-08 에 모델 호출이
      env.AI.run(...) 에서 헬퍼 runWarmup(...) 으로 모이자 보장은 그대로인데
      이 검사만 빨간불이 났다. 물어야 할 것은 «어떤 함수를 부르는가» 가 아니라
      «다시 뽑는가» 다. */
ok(/wrongSelfName[\s\S]{0,900}(?:env\.AI\.run|runWarmup\()/.test(warm),
  '웜업: 이름을 어기면 «다시 뽑는다»(그냥 버리지 않는다)');

/* ── ⑦ 구조적 원인 — 모델이 «자기가 한 인사» 를 보는가 ────────────────────
   🔴 2026-09-01 실측. 화면 인사(BEGINNER_GREETINGS)는 여덟 칸 중 «다섯 칸» 이 "Hi! I'm {name}." 이고
      나머지 셋은 "Hey, I'm {name}!"(6단계)·"{name} here."(7·8단계) 다 — 이름은 어느 쪽이든 같다.
      그것은 «화면에서만» 그려지고 KV 히스토리에는 안 들어간다. 그래서 모델은 자기가 이름을
      말한 적이 없는 상태에서 첫 답을 만들고, 학생이 이름을 물으면 그 자리에서 지어냈다.
      위 ①의 판정은 «안전망» 이고, 이 절이 «원인» 이다 — 둘 다 있어야 한다. */
console.log('\n[ ⑦ 첫 턴 문맥에 인사말이 들어가는가 ]');
const WARM_HTML = readFileSync(resolve(ROOT, 'public', 'warmup.html'), 'utf8');
const greetHits = (WARM_HTML.match(/Hi[,!] I'm \{name\}/g) || []).length;
ok(greetHits >= 3, '화면 인사가 «I\'m {name}» 모양이다(그 문장을 모델에게 넣는 근거)', greetHits);
ok(/history\.length \?\s*history\s*:/.test(warm),
  '웜업: 히스토리가 비면 «인사 한 턴» 을 대신 넣는다',
  '이 줄이 없으면 모델은 자기 이름을 한 번도 못 보고 첫 답을 만든다');
ok(/role: 'assistant', content: `Hi! I'm \$\{ctxFriend\}/.test(warm),
  '그 인사가 «고른 친구 이름» 을 담는다(고정 문자열이 아니다)');

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
if (fail) console.log('  ' + FAILS.join('\n  '));
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
