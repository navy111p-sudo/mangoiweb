/* reply_korean_gloss_harness.mjs — 「영어 말풍선에 한국어가 섞여 나온다」 (2026-09-01)
 *
 * 발단 — 사장님 제보. AI 영어친구 화면에 이런 답이 그대로 떴다:
 *   Wow! What's your favorite kind of candy? «너의 가장 좋아하는 캔디는?»
 *   「한국어는 뜻 버튼을 눌러야 나오는데 이유가 뭐지?」
 *
 * 실측으로 확인한 것
 *   ① 화면(ai-friend.html)은 서버가 준 글자를 escapeHtml 해서 «그대로» 그린다 —
 *      즉 화면이 붙인 것이 아니라 모델 답변 자체에 들어 있었다.
 *   ② chat-friend 프롬프트에서 한국어가 허용된 자리는 문법 팁 하나뿐이다.
 *      «번역해 주라» 는 지시는 어디에도 없다. 모델이 스스로 덧붙인 것이다.
 *
 * 🔴 웜업은 «다르다» — src/index.ts 의 warmupSystem 은 「한국어가 꼭 필요하면 괄호 안에만」을
 *    일부러 허용하고, 그 화면 TTS 는 괄호를 안 읽는다. 그래서 이 제거를 웜업에 적용하면
 *    «일부러 만든 기능» 을 죽인다. 이 하니스가 그 경계도 함께 못 박는다.
 *
 * ⚠️ 문자열 검사가 아니다 — 판정 함수를 실제로 돌린다.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..', 'cloudflare-deploy');
const SRCDIR = join(ROOT, 'src');
const K = await import('file://' + join(SRCDIR, 'reply-korean.ts').replace(/\\/g, '/'));

let pass = 0, fail = 0; const FAILS = [];
const ok = (c, m, x) => {
  c ? pass++ : (fail++, FAILS.push(m + (x !== undefined ? ` — ${JSON.stringify(x)}` : '')));
  console.log(`  ${c ? '✅' : '❌'} ${m}${c || x === undefined ? '' : ` — ${JSON.stringify(x)}`}`);
};
const HAN = /[가-힣]/;

/* ── ① 사장님 화면에 실제로 뜬 문장 ────────────────────────────────────
   ⛔ 이 세 줄을 «비슷한 것» 으로 바꾸지 마세요 — 제보 스크린샷에서 그대로 옮긴 것입니다. */
console.log('\n[ ① 제보 문장 — 한국어가 떨어지고 영어는 온전한가 ]');
const REPORTED = [
  ["Wow! What's your favorite kind of candy? «너의 가장 좋아하는 캔디는?»",
    "Wow! What's your favorite kind of candy?"],
  ['Yay! Me too! Do you have a favorite color? «너의 가장 좋아하는 색깔은?»',
    'Yay! Me too! Do you have a favorite color?'],
  ['I said do you have a favorite color? You can say "I like red" or "I like blue"! «빨강» «파랑»',
    'I said do you have a favorite color? You can say "I like red" or "I like blue"!'],
];
for (const [inp, want] of REPORTED) {
  const got = K.stripAddedKorean(inp);
  ok(got === want, `떼어낸다: ${JSON.stringify(inp.slice(0, 42))}`, got);
}

/* ── ② 다른 모양으로 덧붙여도 떨어지는가 ──────────────────────────────── */
console.log('\n[ ② 감싸는 모양이 달라도 ]');
const MORE = [
  ['Nice! I like candy too. (사탕)', 'Nice! I like candy too.'],
  ['Nice! I like candy too. [사탕]', 'Nice! I like candy too.'],
  ['Great try! Do you have a dog? 개를 좋아하나요?', 'Great try! Do you have a dog?'],
  ['Do you like red? "빨간색을 좋아하나요?"', 'Do you like red?'],
  ['Hello! ‹안녕하세요› How are you?', 'Hello! How are you?'],
];
for (const [inp, want] of MORE) {
  const got = K.stripAddedKorean(inp);
  ok(got === want, `떼어낸다: ${JSON.stringify(inp.slice(0, 42))}`, got);
}

/* ── ③ 손대면 안 되는 것 — 이 절이 핵심 ────────────────────────────────
   🔴 문법 팁은 2026-08-07 에 «일부러» 넣은 기능이다. 함께 떼면 그 기능이 조용히 사라진다.
      화면은 그 팁을 노란 카드로 분리해 그리고 TTS 는 영어 본문만 읽는다. */
console.log('\n[ ③ 멀쩡한 답을 건드리지 않는가 ]');
const KEEP = [
  'Great try! Do you have a dog?',
  'I like red. Do you?',
  "Wow! That's a great sentence! What else do you like?",
  'Nice sentence! Do you like dogs? (💡 나는 개를 좋아해요 가 더 자연스러워요)',
  'Great try! Is the dog big? (💡 그 개는 커요 가 더 자연스러워요)',
];
for (const s of KEEP) {
  const got = K.stripAddedKorean(s);
  ok(got === s, `그대로 둔다: ${JSON.stringify(s.slice(0, 46))}`, got);
}
ok(K.hasAddedKorean('Nice! Do you like dogs? (💡 개를 좋아해요 가 더 자연스러워요)') === false,
  '문법 팁만 있는 답은 «덧붙은 한국어» 로 세지 않는다');

/* 팁과 덧붙은 번역이 «함께» 있으면 번역만 떨어져야 한다 */
{
  const got = K.stripAddedKorean('Wow! «정말요?» Do you like it? (💡 좋아해요 가 더 자연스러워요)');
  ok(got === 'Wow! Do you like it? (💡 좋아해요 가 더 자연스러워요)',
    '팁은 남기고 덧붙은 번역만 뗀다', got);
}

/* ── ④ 느슨한 쪽으로 실패하는가 ────────────────────────────────────────
   영어가 하나도 안 남으면 «원문 그대로» 를 돌려준다. 빈 말풍선이 더 나쁘다. */
console.log('\n[ ④ 빈 말풍선을 만들지 않는가 ]');
for (const s of ['안녕! 영어로 말해 볼까요?', '몰라요', '한국어로만 답한 경우예요.']) {
  ok(K.stripAddedKorean(s) === s, `영어가 없으면 손대지 않는다: ${JSON.stringify(s)}`, K.stripAddedKorean(s));
}
ok(K.stripAddedKorean('') === '' && K.stripAddedKorean(null) === '' && K.stripAddedKorean(undefined) === '',
  '빈 입력에도 죽지 않는다');
for (const s of REPORTED.map((r) => r[0]).concat(MORE.map((m) => m[0]))) {
  ok(!HAN.test(K.stripAddedKorean(s)), `결과에 한글이 남지 않는다: ${JSON.stringify(s.slice(0, 34))}`);
  ok(/[A-Za-z]/.test(K.stripAddedKorean(s)), `영어는 살아 있다: ${JSON.stringify(s.slice(0, 34))}`);
}

/* ── ⑤ 배선 — AI 영어친구가 «실제로» 이 판정을 거치는가 ────────────────
   🔴 모듈만 만들고 안 부르면 아무것도 안 막힌다. 이번 사고 직전의 이름 방어가 그 모양이었다. */
console.log('\n[ ⑤ 배선 ]');
const AI = readFileSync(join(SRCDIR, 'api-ai.ts'), 'utf8');
const blockAt = (src, head) => {
  const i = src.indexOf(head);
  if (i < 0) return '';
  let d = 0; const st = src.indexOf('{', i);
  for (let j = st; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(st, j + 1);
  }
  return '';
};
const friend = blockAt(AI, "case 'chat-friend'") || AI;
ok(/from '\.\/reply-korean'/.test(AI), 'api-ai.ts 가 판정을 불러온다');
ok(/stripAddedKorean\(\s*reply/.test(friend), 'AI 영어친구가 «모델이 준 답» 을 그 판정에 넣는다');
/* ⚠️ 문구를 «글자 그대로» 못 박지 않는다 — 2026-09-09 에 이 화면이 교정 카드를 받으면서
   그 줄이 「NEVER write Korean inside "reply" …」 로 «더 세게» 바뀌었는데, 옛 정규식은
   보장이 세진 그 수리에 빨간불을 냈다(CLAUDE.md 「보장은 세졌는데 검사만 깨졌습니다」).
   물어야 할 것은 «그 문장이 있는가» 가 아니라 «답장에 한국어를 넣지 말라고 했는가» 다. */
ok(/(NEVER|Never|Do not|do not)[^\n]{0,90}(translate your own English|Korean inside "reply")/.test(friend),
  '프롬프트에도 «네 영어를 한국어로 옮기지 마라» 를 적어 둔다',
  '지시만으로는 안 지켜지지만, 안 적으면 모델이 그것을 «해도 되는 일» 로 본다');

/* ── ⑥ 웜업에는 «적용하면 안 된다» ─────────────────────────────────────
   🔴 웜업은 「한국어가 꼭 필요하면 괄호 안에만」을 일부러 허용하고, 그 화면 TTS 는 괄호를
      읽지 않는다. 여기에 같은 제거를 걸면 그 기능이 조용히 사라진다.
   ⚠️ 이 절은 «안 한 일» 을 못 박는 검사다 — 다음 사람이 「빠뜨렸네」 하고 넣지 않게. */
console.log('\n[ ⑥ 웜업은 일부러 제외 ]');
const IDX = readFileSync(join(SRCDIR, 'index.ts'), 'utf8');
ok(!/stripAddedKorean/.test(IDX),
  '웜업(index.ts)에는 이 제거를 걸지 않는다',
  '웜업은 괄호 안 한국어를 일부러 허용한다 — warmupSystem 의 [언어] 규칙');
ok(/괄호 안[^\n]*짧게 덧붙여/.test(IDX),
  '그 허용 규칙이 아직 살아 있다(이 예외의 근거)',
  '규칙이 사라졌다면 ⑥의 전제가 깨진 것이니 사람이 다시 판단할 것');

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
if (fail) console.log('  ' + FAILS.join('\n  '));
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
