/*!
 * 🗣 ai_friend_answer_first_harness — 「질문과 대답이 서로 맞지 않아」 회귀 감시 (2026-09-09)
 *
 * 발단 — 사장님 화면 실측(S1·A1):
 *   학생 "What is your favorite food?" → AI "Cool! Do you have a favorite food?"
 *   학생 "What did you do yesterday?"  → AI "Ooh nice one! Did you eat food yesterday?"
 *   물어본 것에 «대답» 을 하지 않고 되묻기만 했습니다.
 *
 * 원인은 모델이 아니라 «규격» 이었습니다 — 둘이 겹쳐 있었습니다.
 *   ① 프롬프트: 기초 규칙이 「칭찬 하나 + 질문 하나가 전부」라 대답 자리가 아예 없다.
 *   ② 트리머: 언제나 «칭찬 + 마지막 질문» 만 남겨, 모델이 대답해도 그 대답을 버린다.
 *      실측: "Nice one! I love pizza. What about you?" → "Nice one! What about you?"
 *
 * ⛔ 되묻기 강제를 «없애서» 풀면 안 됩니다 — 기초 학생은 질문이 없으면 대화가 그 자리에서
 *    끝납니다(2026-09-03 결정). 그래서 «되묻기가 남는가» 를 짝으로 못 박습니다.
 *
 * 정본을 **직접 import 해 실제로 돌립니다**.
 * 실행: node test-harness/ai_friend_answer_first_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.MANGOI_SRC || join(ROOT, 'cloudflare-deploy', 'src');
const LV = resolve(SRC, 'ai-friend-level.ts');
const M = await import('file://' + LV.replace(/\\/g, '/'));
const AI = readFileSync(join(SRC, 'api-ai.ts'), 'utf8');

let pass = 0, fail = 0; const failures = [];
const check = (n, ok, x) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); console.log('  ❌ ' + n + (x !== undefined ? ' — ' + JSON.stringify(x) : '')); }
};

console.log('════════ 🗣 AI 친구 — 물으면 대답부터 ════════');

// ═══ A. 「학생이 나에게 물었나」 판정 ═══
console.log('\nA. 학생이 물었나 (물음표가 없어도 잡아야 한다 — 아이들은 안 씁니다)');
{
  const ASK = ['What is your favorite food?', 'What your favorite food', 'What did you do yesterday?',
               'Do you like pizza', 'Is the dog big', 'Can you help me', 'How are you', 'Tell me a fun fact'];
  const NOT = ['I like pizza.', 'My dog is big', 'I ate rice yesterday', 'Yes.', 'Movies!',
               /* ⛔ 문장 «안» 의 의문사까지 잡으면 평범한 대화가 전부 «질문» 이 되어
                  길이 정책이 통째로 느슨해진다 — 그 반대 방향을 짝으로 못 박는다. */
               'I know what you like.', 'She told me how it works.'];
  check('A-1 물음표가 없어도 의문사·조동사로 시작하면 «물음»',
        ASK.every((q) => M.aiFriendStudentAsked(q) === true),
        ASK.filter((q) => M.aiFriendStudentAsked(q) !== true));
  check('A-2 🔴 평서문은 «물음» 이 아니다 (넓히면 길이 정책이 통째로 풀린다)',
        NOT.every((q) => M.aiFriendStudentAsked(q) === false),
        NOT.filter((q) => M.aiFriendStudentAsked(q) !== false));
  check('A-3 빈 값은 «물음» 이 아니다',
        M.aiFriendStudentAsked('') === false && M.aiFriendStudentAsked(null) === false);
}

// ═══ B. 트리머 — 대답을 버리지 않는가 ═══
console.log('\nB. 트리머 (정본을 실제로 돌린다)');
{
  const CASES = [
    ['Nice one! I love pizza. What about you?', 'i love pizza'],
    ['Cool! My favorite is pizza. It is yummy. Do you like it?', 'my favorite is pizza'],
    ['Well said! I ate rice yesterday. It was good. Did you eat rice?', 'i ate rice yesterday'],
  ];
  for (const [src, mustKeep] of CASES) {
    const out = M.aiFriendTrimSentences(src, 'S1', { answering: true });
    const low = out.toLowerCase();
    check('B «' + mustKeep + '» 이 살아남는다', low.includes(mustKeep), out);
    /* ⛔ 되묻기를 버리면 기초 학생의 대화가 그 자리에서 끝난다 — 짝으로 본다. */
    check('B 되묻기도 함께 남는다 («대답만» 남기면 대화가 끊긴다)', /\?/.test(out), out);
    /* 🔴 고른 문장을 «고른 순서» 로 이으면 앞뒤가 뒤엉킨다(만들면서 실제로 밟았다). */
    check('B 🔴 원래 순서를 지킨다 (질문이 맨 뒤)', /\?\s*$/.test(out.trim()), out);
  }
  /* 🔴 위 세 케이스는 «문장 자리 +1» 만으로도 통과한다 — 트리머의 «우선순위» 분기는
     한 번도 안 재진다(만들고 나서 변이시험으로 확인했다: 분기를 꺼도 전부 초록이었다).
     그 분기가 실제로 일하는 자리는 «자리보다 문장이 더 많을 때» 다 — 그때 칭찬을 버리고
     학생이 물어본 것에 대한 «대답» 을 한 줄 더 남긴다. 그것을 콕 집어 잰다. */
  {
    const five = 'Cool! My favorite is pizza. It is yummy. I eat it often. Do you like it?';
    const on = M.aiFriendTrimSentences(five, 'S1', { answering: true });
    check('B-우선순위 🔴 자리가 모자라면 «칭찬» 을 버리고 대답을 한 줄 더 남긴다',
          !/^Cool!/.test(on) && /my favorite is pizza/i.test(on) && /it is yummy/i.test(on), on);
    /* ⚠️ 짝 — 안 물은 턴에는 칭찬이 남아야 한다(기초 학생 동기부여). */
    const off = M.aiFriendTrimSentences(five, 'S1');
    check('B-우선순위 짝: 안 물은 턴에는 칭찬이 남는다', /^Cool!/.test(off), off);
  }
  /* ⚠️ 짝 검사 — 안 물었을 때까지 바뀌면 그건 «길이 정책을 통째로 바꾼 것» 이다. */
  check('B-끝 🔴 학생이 «안» 물은 턴은 옛 동작 그대로 (칭찬 + 되묻기)',
        M.aiFriendTrimSentences(CASES[0][0], 'S1') === 'Nice one! What about you?',
        M.aiFriendTrimSentences(CASES[0][0], 'S1'));
}

// ═══ C. 규격 — 문장 한 칸만 늘리고 낱말은 안 늘린다 ═══
console.log('\nC. 규격 (길이 정책을 흔들지 않았는가)');
{
  const base = M.aiFriendLevelSpec('S1');
  const ans = M.aiFriendLevelSpec('S1', { answering: true });
  check('C-1 대답 자리는 «문장 한 칸» 뿐', ans.maxSentences === base.maxSentences + 1,
        { base: base.maxSentences, answering: ans.maxSentences });
  /* 🔴 낱말 상한을 늘리면 모델이 문법 낱말(a·is·do)부터 버린다 — 이 저장소의 반복 실측. */
  check('C-2 🔴 낱말 상한은 «그대로» (늘리면 문법이 깨진다)',
        ans.maxWordsPerSentence === base.maxWordsPerSentence
        && ans.hardMaxWordsPerSentence === base.hardMaxWordsPerSentence);
  check('C-3 인자를 안 주면 옛 규격 그대로', M.aiFriendLevelSpec('S1').maxSentences === 2);
  check('C-4 길이 판정도 그 자리를 안다',
        M.aiFriendMeasureReply('Hi! I like pizza. Do you?', 'S1').ok === false
        && M.aiFriendMeasureReply('Hi! I like pizza. Do you?', 'S1', { answering: true }).ok === true);
}

// ═══ D. 배선 — 프롬프트가 «먼저 답하라» 고 말하는가 ═══
console.log('\nD. 배선 (api-ai.ts 의 chat-friend 핸들러 «안» 만)');
{
  const s = AI.indexOf("path === '/api/ai/chat-friend'");
  const e = AI.indexOf("path === '/api/ai/chat-history'", s);
  check('D-0 핸들러 구간을 앵커로 잘라 냈다 (전제)', s > 0 && e > s);
  const H = s > 0 && e > s ? AI.slice(s, e) : '';
  check('D-1 학생이 물었는지 정본으로 판정한다', /aiFriendStudentAsked\(msg\)/.test(H));
  check('D-2 🔴 물었으면 «먼저 답하라» 를 프롬프트에 넣는다',
        /answerRule/.test(H) && /Answer it first/.test(H) && /\$\{answerRule\}/.test(H));
  check('D-3 ⛔ 되묻기 자체를 없애지 않았다 (기초 학생은 질문이 없으면 대화가 끝난다)',
        /follow-up question/.test(H));
  /* 길이 판정·트리밍이 그 자리를 모르면, 프롬프트가 시킨 대답을 코드가 도로 버린다. */
  const wired = (H.match(/answering: studentAsked/g) || []).length;
  check('D-4 🔴 길이 판정·트리밍이 «전부» 그 자리를 안다 (하나라도 빠지면 대답이 도로 버려진다)',
        wired >= 5, wired + '회');
  check('D-5 트리밍이 그 인자를 받는다',
        /aiFriendTrimSentences\(reply, level, \{ answering: studentAsked \}\)/.test(H));
}

console.log('\n════════════════════════════════════════════');
console.log('  결과: PASS ' + pass + ' · FAIL ' + fail);
if (failures.length) { console.log('  실패 목록:'); for (const f of failures) console.log('   - ' + f); }
console.log('════════════════════════════════════════════');
if (fail > 0) process.exit(1);
