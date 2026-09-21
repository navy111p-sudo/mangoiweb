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
  .replace(/\(text: string, hist: any\[\]\)/g, '(text, hist)')
  .replace(/\(hist: any\[\]\)/g, '(hist)');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(code + '\n;globalThis.__f = { aiFriendIsRepeat, aiFriendLooksCut, aiFriendIsMetaAsk, aiFriendStripHanzi, aiFriendJustAskedAgain };', sandbox);
const { aiFriendIsRepeat, aiFriendLooksCut, aiFriendIsMetaAsk, aiFriendStripHanzi, aiFriendJustAskedAgain } = sandbox.__f;

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

/* ⚠️ 2026-07-29 학생 제보 (화면녹화 증거) — "또박또박 말하는데 계속 다시 말하래요".
   Whisper 는 아래 두 문장을 **완벽하게** 받아적었는데도 옛 판정이 '잘림'으로 찍어
   네 턴 내리 "Can you say the whole sentence again?" 만 나왔다. 오인식이 아니라
   판정이 진범이었다. 아래가 다시 true 가 되면 그 사고가 그대로 재현된다. */
console.log('\n▶ 되묻기 오탐 (2026-07-29 제보 — 영상에 찍힌 실제 발화)');
check('"…but I don\'t do it." → 정상(꼬리 it)',
      aiFriendLooksCut("I like watching movies, but I don't do it.") === false);
check('"What about you?" → 정상(꼬리 you)',
      aiFriendLooksCut('I like watching movies. What about you?') === false);
check('문장부호 없어도 정상(꼬리 it)',
      aiFriendLooksCut("I like watching movies but I don't do it") === false);
check('"What about you" → 정상(부호 없음)', aiFriendLooksCut('What about you') === false);
check('"Yes." → 정상(짧아도 완결)', aiFriendLooksCut('Yes.') === false);
check('"Movies!" → 정상(한 단어 대답)', aiFriendLooksCut('Movies!') === false);
check('"I like it." → 정상', aiFriendLooksCut('I like it.') === false);
check('"Yes, I can." → 정상', aiFriendLooksCut('Yes, I can.') === false);
check('"Me too" → 정상', aiFriendLooksCut('Me too') === false);
check('"Yes I can" → 정상(부호 없는 짧은 대답)', aiFriendLooksCut('Yes I can') === false);
check('"I am" → 여전히 조각', aiFriendLooksCut('I am') === true);
check('"and my" → 여전히 조각', aiFriendLooksCut('and my') === true);

/* 되묻기는 두 번 연속으로 나오면 안 된다 — 영상에서 네 턴 내리 나와 아이가 포기했다 */
console.log('\n▶ 연속 되묻기 차단');
check('직전 답이 되묻기였으면 감지',
      aiFriendJustAskedAgain([{ role: 'assistant', content: 'Ooh, I only caught a little bit 🙂, can you say the whole sentence again?' }]) === true);
check('한국어 되묻기도 감지',
      aiFriendJustAskedAgain([{ role: 'assistant', content: '다시 말해줄래요?' }]) === true);
check('평범한 답변은 오탐 없음',
      aiFriendJustAskedAgain([{ role: 'assistant', content: 'Nice sentence! Which movie do you like best? 🎬' }]) === false);
check('히스토리가 비면 false', aiFriendJustAskedAgain([]) === false);
check('가장 마지막 AI 발화만 본다',
      aiFriendJustAskedAgain([
        { role: 'assistant', content: 'Can you say the whole sentence again?' },
        { role: 'user', content: 'I like movies' },
        { role: 'assistant', content: 'Cool! Which one? 🎬' },
      ]) === false);

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
/* ⚠️ «temperature: 0.95» 라는 «식 모양» 을 글자 그대로 못 박으면, 호출을 공용 헬퍼로
   묶는 무해한 정리(2026-09-09 runFriend)에 빨간불이 난다 — 보장은 그대로인데 검사만 깨진다.
   물어야 할 것은 «그 글자가 있는가» 가 아니라 **«재생성이 첫 호출보다 뜨거운가»** 다.
   그래서 두 호출의 temperature 를 소스에서 «읽어» 비교한다. */
/* ⚠️ 인자를 정규식으로 세지 않는다 — 호출 안에 messages.concat([...]) 처럼 괄호가 들어 있어
   `[^)]*` 류는 그 자리에서 끊긴다(실제로 NaN 이 나왔다). **괄호 짝으로** 잘라 마지막 인자를 읽는다. */
function _lastArgAt(src, callIdx) {
  const open = src.indexOf('(', callIdx);
  if (open < 0) return NaN;
  let d = 0, i = open, lastComma = -1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { d--; if (d === 0) break; }
    else if (c === ',' && d === 1) lastComma = i;
  }
  if (d !== 0 || lastComma < 0) return NaN;
  return Number(src.slice(lastComma + 1, i).trim());
}
const _temps = (() => {
  const firstIdx = ts.indexOf('runFriend(m, messages');
  const rIdx = ts.indexOf('aiFriendIsRepeat(reply, history)');
  const retryIdx = rIdx > 0 ? ts.indexOf('runFriend(', rIdx) : -1;
  return {
    first: firstIdx >= 0 ? _lastArgAt(ts, firstIdx) : NaN,
    retry: retryIdx >= 0 ? _lastArgAt(ts, retryIdx) : NaN,
  };
})();
check('두 호출의 temperature 를 소스에서 읽어 냈다 (전제)',
  Number.isFinite(_temps.first) && Number.isFinite(_temps.retry),
  '첫 ' + _temps.first + ' · 재생성 ' + _temps.retry);
check('재생성은 temperature 를 올린다', _temps.retry > _temps.first,
  '첫 ' + _temps.first + ' → 재생성 ' + _temps.retry);
check('잘린 발화·속도 요청 힌트를 모델에 전달', /cutHint/.test(ts) && /metaHint/.test(ts));
check('DB 에는 원문 msg 만 저장(힌트 섞이지 않음)',
      /VALUES \(\?,\?,\?,\?,\?\)`\)\.bind\(uid, 'user', msg, level, now\)/.test(ts));
check('프롬프트에 반복 금지 규칙', /NEVER repeat a reply you already gave/.test(ts));
check('프롬프트에 "짧은 답도 좋은 답" 규칙', /A short answer is a GOOD answer/.test(ts));
check('프롬프트에 속도 요청 응대 규칙', /asks you to slow down/.test(ts));
// 2026-07-29 제보 — 되묻기가 연달아 나오면 학생이 포기한다
check('두 번 연속 되묻기 금지 배선', /aiFriendJustAskedAgain\(history\)/.test(ts));
check('프롬프트에도 연속 되묻기 금지', /NEVER ask twice in a row/.test(ts));
/* 🗺 주제 규칙 — 방향이 «반대» 인 제보 둘을 동시에 지켜야 한다. 한쪽만 보면 다른 쪽이 재발한다.
     2026-07-29 「영화 주제로 들어왔는데 동물 얘기를 물어봤어요」
       → AI 가 «스스로» 딴 주제로 갈아타면 안 된다.
     2026-09-03 「대화가 매끄럽게 이어지지 않고, 정해진 문장 안에서만 하는 느낌」(벨잉글리시 원장님)
       → 학생이 꺼낸 얘기는 «따라가야» 한다. 옛 문구는 금지 세 겹이라 이쪽이 통째로 막혔다.
   ⛔ 옛 문구(Stay on THIS topic / Do NOT switch)로 되돌리지 말 것.
   ⚠️ 검사를 «그 영어 문장이 있는가» 로 쓰면 문구만 다듬어도 FAIL 난다 — 그래서 topicCtx 블록을
      잘라 내 «무엇을 시키는가» 로 묻는다. */
check('주제(topic)를 요청에서 받는다', /b\.topic/.test(ts));
const topicCtxSrc = (ts.match(/const topicCtx = topic[\s\S]*?: '';/) || [''])[0];
check('주제를 시스템 프롬프트에 싣는다', /\$\{topic\}/.test(topicCtxSrc), topicCtxSrc.slice(0, 80));
check('학생이 다른 얘기를 꺼내면 따라간다', /FOLLOW THE STUDENT/i.test(topicCtxSrc));
check('AI 가 스스로 갈아타지는 않는다(대화가 멈췄을 때만 주제로 되돌아간다)',
  /Only steer back/i.test(topicCtxSrc));
check('옛 «주제 감옥» 문구로 되돌아가지 않았다',
  !/Stay on THIS topic|Do NOT switch to another subject/.test(topicCtxSrc));
check('재미난 사실 예시에서 animals 고정 제거', !/fun facts kids enjoy \(animals/.test(ts));

/* ══ 5. 한자 섞임 정리 (2026-07-27 사장님 신고 "한국말 팁에 중국어") ══ */
console.log('\n▶ 한자(중국어) 섞임 정리');
const hanTip = 'Nice sentence! 🐒 Monkeys love bananas! (💡猴子들은 바나나와 많은 과일들을 좋아해요)';
const cleanTip = 'Great try! 😊 (💡 원숭이들은 바나나를 좋아해요~가 더 자연스러워요)';
check('한자 섞인 💡팁은 통째로 제거', !/[一-鿿]/.test(aiFriendStripHanzi(hanTip)) && !/💡/.test(aiFriendStripHanzi(hanTip)),
      JSON.stringify(aiFriendStripHanzi(hanTip)));
check('영어 본문은 그대로 유지', /Monkeys love bananas!/.test(aiFriendStripHanzi(hanTip)));
check('한글 팁은 건드리지 않음', aiFriendStripHanzi(cleanTip) === cleanTip, JSON.stringify(aiFriendStripHanzi(cleanTip)));
check('본문에 흘러든 한자 낱글자 제거', aiFriendStripHanzi('I like 猴子 monkeys!') === 'I like monkeys!',
      JSON.stringify(aiFriendStripHanzi('I like 猴子 monkeys!')));
check('괄호 없는 💡팁도 처리', !/[一-鿿]/.test(aiFriendStripHanzi('Good job! 💡猴子는 원숭이라는 뜻이에요')),
      JSON.stringify(aiFriendStripHanzi('Good job! 💡猴子는 원숭이라는 뜻이에요')));
check('프롬프트에 한자 금지 규칙 추가됨', /NEVER use Chinese characters/.test(ts));

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
