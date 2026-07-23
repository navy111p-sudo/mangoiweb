/**
 * 🗣 AI 영어친구 답변 품질 회귀 하니스
 *
 * 2026-07-23 실기기 제보(사장님 시연):
 *   ① "I(아이) 한 단어만 말했는데 지난번 답을 그대로 똑같이 길게 한다"
 *   ② "천천히 말해달라고 해도 본인 말만 한다"
 *
 * 웜업(handleWarmupChat)에는 반복 감지 후 재생성(warmupIsRepeat)이 있었지만
 * AI 친구(chat-friend)에는 아예 없었다. 그래서 세 가지 판정 함수를 넣었고,
 * 이 하니스는 **api-ai.ts 원문에서 그 함수들을 그대로 추출**해 검증한다.
 * 원본이 되돌아가면 즉시 실패한다.
 *
 * 실행: node test-harness/ai_friend_reply_quality_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.MANGOI_SRC || join(ROOT, 'cloudflare-deploy', 'src');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

/* ── api-ai.ts 에서 판정 함수 3종을 원문 그대로 잘라내 실행 ───────────────── */
const ts = readFileSync(join(SRC, 'api-ai.ts'), 'utf8');
const s = ts.indexOf('const aiFriendNorm =');
const e = ts.indexOf('// ── POST /api/ai/chat-guest-token', s);
if (s < 0 || e < 0) {
  console.log('❌ api-ai.ts 에서 판정 함수 블록을 못 찾음 (aiFriendNorm ~ chat-guest-token)');
  process.exit(1);
}
// 타입 표기만 걷어내고(런타임 동작은 그대로) 실행한다
const code = ts.slice(s, e)
  .replace(/\(s: string\)/g, '(s)')
  .replace(/\(text: string, hist: any\[\]\)/g, '(text, hist)');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(code + '\n;globalThis.__f = { aiFriendIsRepeat, aiFriendLooksCut, aiFriendIsMetaAsk };', sandbox);
const { aiFriendIsRepeat, aiFriendLooksCut, aiFriendIsMetaAsk } = sandbox.__f;

/* ══ 1. 지난 답을 그대로 다시 하는가 판정 ══ */
console.log('\n▶ 직전 답변 반복 감지 (제보 ①)');
const prev = "Nice try! I love pizza too. What is your favorite food, Minsu? 🍕";
const hist = [
  { role: 'user', content: 'I like pizza' },
  { role: 'assistant', content: prev },
];
check('똑같은 답변 → 반복으로 잡힘', aiFriendIsRepeat(prev, hist) === true);
check('앞부분만 같아도 반복으로 잡힘',
      aiFriendIsRepeat(prev + ' Tell me more!', hist) === true);
check('이모지·문장부호만 달라도 반복으로 잡힘',
      aiFriendIsRepeat('Nice try! I love pizza too. What is your favorite food, Minsu?', hist) === true);
check('완전히 다른 답변 → 통과',
      aiFriendIsRepeat('Wow, a dinosaur! Which one is the biggest? 🦖', hist) === false);
check('짧은 리액션은 반복 허용', aiFriendIsRepeat('Great job!', [{ role: 'assistant', content: 'Great job!' }]) === false);
check('히스토리가 비면 반복 아님', aiFriendIsRepeat(prev, []) === false);

/* ══ 2. 마이크가 잘라먹은 조각인가 판정 ══ */
console.log('\n▶ 잘린 발화 감지 (제보 ① 의 원인 — "I" 한 단어)');
check('"I" → 잘린 조각', aiFriendLooksCut('I') === true);
check('"I like" → 잘린 조각(2단어)', aiFriendLooksCut('I like') === true);
check('"I want to" → 잘린 조각(꼬리가 to)', aiFriendLooksCut('I want to') === true);
check('"My favorite food is" → 잘린 조각(꼬리가 is)', aiFriendLooksCut('My favorite food is') === true);
check('"I like blue cars" → 정상 문장', aiFriendLooksCut('I like blue cars') === false);
check('"Tell me a fun fact" → 정상 문장', aiFriendLooksCut('Tell me a fun fact') === false);
check('빈 문자열은 조각 아님(별도 처리)', aiFriendLooksCut('') === false);

/* ══ 3. "천천히 말해줘" 같은 부탁인가 판정 ══ */
console.log('\n▶ 속도·되묻기 요청 감지 (제보 ②)');
check('"천천히 말해줘"', aiFriendIsMetaAsk('천천히 말해줘') === true);
check('"너무 빠르게 말해요"', aiFriendIsMetaAsk('너무 빠르게 말해요') === true);
check('"다시 말해줘"', aiFriendIsMetaAsk('다시 말해줘') === true);
check('"Can you speak slowly?"', aiFriendIsMetaAsk('Can you speak slowly?') === true);
check('"You talk too fast"', aiFriendIsMetaAsk('You talk too fast') === true);
check('"Say that again please"', aiFriendIsMetaAsk('Say that again please') === true);
check('일반 대화는 오탐 없음(1)', aiFriendIsMetaAsk('I like blue cars') === false);
check('일반 대화는 오탐 없음(2)', aiFriendIsMetaAsk('My dog is very cute') === false);

/* ══ 4. 재생성·힌트 배선이 실제로 붙어 있는가 (원문 확인) ══ */
console.log('\n▶ chat-friend 배선 확인');
check('반복이면 1회 재생성한다', /aiFriendIsRepeat\(reply, history\)/.test(ts));
check('재생성은 temperature 를 올린다', /temperature:\s*0\.95/.test(ts));
check('잘린 발화·속도 요청 힌트를 모델에 전달', /cutHint/.test(ts) && /metaHint/.test(ts));
check('DB 에는 원문 msg 만 저장(힌트 섞이지 않음)',
      /VALUES \(\?,\?,\?,\?,\?\)`\)\.bind\(uid, 'user', msg, level, now\)/.test(ts));
check('프롬프트에 반복 금지 규칙', /NEVER repeat a reply you already gave/.test(ts));
check('프롬프트에 잘린 발화 되묻기 규칙', /looks cut off/.test(ts));
check('프롬프트에 속도 요청 응대 규칙', /asks you to slow down/.test(ts));

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
