// -*- coding: utf-8 -*-
// 🎚 AI 영어친구 «눈높이(레벨)» 하니스 — 의존성 없음 · node 로 바로 실행
//   실행:  node test-harness/ai_friend_level_harness.mjs
//   대상:  cloudflare-deploy/src/ai-friend-level.ts   ← **직접 import 해 실제로 돌립니다**
//          cloudflare-deploy/src/api-ai.ts            ← 배선(그 규격을 정말 쓰는가)
//          cloudflare-deploy/src/index.ts             ← 웜업 WARMUP_LEVELS 와 숫자가 «짝» 인가
//          cloudflare-deploy/public/ai-friend.html    ← 화면 목록·기본값·기억이 서버와 짝인가
//
//   발단(2026-08-31 운영 D1 실측, ai_friend_chats assistant 313건):
//     B1 290건 평균 31.1단어 · A2 13건 17.5단어 · **A1 10건 28.5단어(최대 45)**
//     → A1 이 A2 보다 길었습니다. 사장님 제보 「아주 기초인데 문장이 너무 길고 어렵다」의 정체입니다.
//     원인: 프롬프트의 레벨 지시가 «한 줄» 이고 A1·C1 만 설명이 있었으며(A2·B1·B2 는 없음)
//           숫자 상한이 어디에도 없었습니다. 반대로 길이를 늘리는 규칙은 레벨과 무관하게 전부 걸렸습니다.
//
//   이 하니스가 지키는 것:
//     A. 규격이 실제로 «단계» 다 — 아래 레벨일수록 짧다(문자열이 아니라 실행해서 확인)
//     B. 실측된 진짜 A1 답변 5건이 «넘친다» 고 판정된다
//     C. 줄이기는 문장 «수» 만 줄인다 — 낱말을 자르지 않고, 되묻는 질문을 버리지 않는다
//     D. 한국어 팁(💡)은 길이에서 빼고, 결과에는 도로 붙인다
//     E. 배선 — 프롬프트가 규격을 주입하고, 만든 뒤 재서 넘치면 다시 뽑고 줄인다
//     F. 웜업 레벨 1 과 A1 이 같은 숫자다(사장님 지시)
//     G. 화면과 서버가 짝이다 — 목록·기본값·레벨 기억
//     H. 되돌리면 FAIL — 실제로 소스를 변이시켜 보장이 살아 있는지 확인
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..', 'cloudflare-deploy');
const SRC = (f) => readFileSync(resolve(ROOT, 'src', f), 'utf8');
const LV_PATH = resolve(ROOT, 'src', 'ai-friend-level.ts');
const LV_SRC = readFileSync(LV_PATH, 'utf8');
const M = await import('file://' + LV_PATH.replace(/\\/g, '/'));
const AI = SRC('api-ai.ts');
/* ⚠️ 검사 범위는 «chat-friend 핸들러 안» 으로 좁힙니다 — 길이로 자르지 말고 중괄호 짝으로.
      같은 파일의 AI 영작첨삭 엔드포인트에도 `b.level || 'A2'` 같은 «똑같이 생긴 멀쩡한 줄» 이
      있어서, 파일 전체에 부정 검사를 걸면 무관한 코드를 잡습니다(CLAUDE.md 함정, 실제로 밟음). */
function blockAt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  if (open < 0) return '';
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return src.slice(i);
}
const CF = blockAt(AI, "path === '/api/ai/chat-friend'");
const IDX = SRC('index.ts');
const HTML = readFileSync(resolve(ROOT, 'public', 'ai-friend.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond, extra) => {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond || extra === undefined ? '' : '  →  ' + JSON.stringify(extra)}`);
};

/* ── A. 규격이 실제로 «단계» 인가 (실행) ───────────────────────────── */
console.log('\n[ A. 레벨 규격 — 아래 단계일수록 짧은가 ]');
const IDS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
check('레벨 8종이 모두 있다', IDS.every((k) => M.AI_FRIEND_LEVELS[k]), Object.keys(M.AI_FRIEND_LEVELS));
for (const k of IDS) {
  const s = M.AI_FRIEND_LEVELS[k];
  check(`${k}: 설명(rule)이 비어 있지 않다`, typeof s.rule === 'string' && s.rule.length > 40);
  check(`${k}: 그 rule 이 CEFR 이름을 말한다 (${M.AI_FRIEND_CEFR[k]})`,
    s.rule.includes(M.AI_FRIEND_CEFR[k]), s.rule.slice(0, 40));
}
// 어느 칸도 «숫자 없이» 남지 않는다 — 옛 상태(A1·C1 만 설명)로 돌아가지 않게
for (const k of IDS.slice(0, -1)) {
  check(`${k}: 한 문장 단어 상한이 숫자로 정해져 있다`, M.AI_FRIEND_LEVELS[k].maxWordsPerSentence > 0,
    M.AI_FRIEND_LEVELS[k].maxWordsPerSentence);
}
check('단어 상한이 S1 → S7 로 «계속» 커진다',
  IDS.slice(0, -1).every((k, i) => i === 0
    || M.AI_FRIEND_LEVELS[IDS[i - 1]].maxWordsPerSentence < M.AI_FRIEND_LEVELS[k].maxWordsPerSentence),
  IDS.map((k) => M.AI_FRIEND_LEVELS[k].maxWordsPerSentence));
check('문장 수 상한이 줄어들지 않는다',
  IDS.every((k, i) => i === 0 || M.AI_FRIEND_LEVELS[IDS[i - 1]].maxSentences <= M.AI_FRIEND_LEVELS[k].maxSentences));
/* 🌱 사장님 지시 「기초단계는 아주 아주 쉽게」 — 아래 세 칸(S1~S3)은 길이를 늘리는 규칙을 끈다.
   재미사실·약점단어가 걸리면 문장이 반드시 길어진다(실측된 A1 답변 45단어가 그 모양이었다). */
check('기초 세 칸(S1~S3)이 «길이를 늘리는 규칙»을 끈다(plain)',
  ['S1', 'S2', 'S3'].every((k) => M.AI_FRIEND_LEVELS[k].plain)
  && ['S4', 'S5', 'S6', 'S7', 'S8'].every((k) => !M.AI_FRIEND_LEVELS[k].plain));
/* 🪜 맨 아래 칸 — 「기초는 아주 아주 쉽게」의 실체가 여기다.
   ⚠️ 쉽게 만드는 것은 «길이» 가 아니라 «질문 형식» 이다. 실측에서 A1 은 이미 3~5단어
      규격이었는데 실제 답변이 28.5단어였다 — 모자랐던 것은 더 낮은 칸이 아니라 지키게 만드는 장치다.
      그래서 여기서는 길이(5단어·2문장)와 «Yes/No 만» 을 함께 못 박는다. */
check('S1 이 가장 쉽다 — 한 문장 5단어 이하 · 2문장 이하',
  M.AI_FRIEND_LEVELS.S1.maxWordsPerSentence <= 5 && M.AI_FRIEND_LEVELS.S1.maxSentences <= 2,
  M.AI_FRIEND_LEVELS.S1);
check('S1 규칙이 «yes/no 만» 을 명시한다 (고를 말이 질문 안에 있어야 한다)',
  /yes\/no/i.test(M.AI_FRIEND_LEVELS.S1.rule) && /never a wh-|no wh-/i.test(M.AI_FRIEND_LEVELS.S1.rule),
  M.AI_FRIEND_LEVELS.S1.rule.slice(0, 90));
check('모르는 레벨은 기본값으로 떨어진다(조용히 죽지 않는다)',
  M.aiFriendLevelSpec('Z9').maxSentences === M.AI_FRIEND_LEVELS[M.AI_FRIEND_DEFAULT_LEVEL].maxSentences
  && M.aiFriendLevelSpec('').maxSentences === M.AI_FRIEND_LEVELS[M.AI_FRIEND_DEFAULT_LEVEL].maxSentences);
check('대소문자를 가리지 않는다(s1 도 S1)', M.aiFriendLevelSpec('s1').maxWordsPerSentence === M.AI_FRIEND_LEVELS.S1.maxWordsPerSentence);
/* 🔑 옛 키 이어받기 — 지우면 학생이 고른 레벨이 전부 리셋된다 */
console.log('\n[ A-2. 옛 키(A1…C1)를 계속 받는가 ]');
for (const [oldK, newK] of Object.entries({ A1: 'S1', A2: 'S2', B1: 'S4', B2: 'S6', C1: 'S8' })) {
  check(`옛 «${oldK}» 가 ${newK} 로 이어진다`, M.aiFriendNormalizeLevel(oldK) === newK, M.aiFriendNormalizeLevel(oldK));
}
check('옛 키의 규격이 값까지 그대로다 (A2 → S2 = 7단어)',
  M.aiFriendLevelSpec('A2').maxWordsPerSentence === M.AI_FRIEND_LEVELS.S2.maxWordsPerSentence
  && M.AI_FRIEND_LEVELS.S2.maxWordsPerSentence === 7);
/* 🔴 이어받기의 «뜻» — 옛 키는 «같은 CEFR 이름을 단 칸» 으로 가야 한다.
   여기가 어긋나면 학생이 고른 난이도가 말없이 바뀐다(값 범위가 유효해 에러도 안 난다). */
for (const oldK of ['A1', 'A2', 'B1', 'B2', 'C1']) {
  check(`옛 «${oldK}» 가 CEFR 이름이 같은 칸으로 간다`,
    M.AI_FRIEND_CEFR[M.aiFriendNormalizeLevel(oldK)] === oldK,
    { 간칸: M.aiFriendNormalizeLevel(oldK), 그칸이름: M.AI_FRIEND_CEFR[M.aiFriendNormalizeLevel(oldK)] });
}
/* 프로토타입 키로 뚫리지 않는가 — 같은 뿌리의 사고를 ai-friends.ts 에서 밟았다 */
for (const bad of ['constructor', '__proto__', 'toString']) {
  check(`프로토타입 키 '${bad}' 도 기본값이 된다`, M.aiFriendNormalizeLevel(bad) === M.AI_FRIEND_DEFAULT_LEVEL,
    M.aiFriendNormalizeLevel(bad));
}

/* ── B. 실측된 진짜 A1 답변이 «넘친다» 고 잡히는가 ─────────────────── */
console.log('\n[ B. 운영 D1 에서 실제로 나갔던 A1 답변 (2026-08-31 실측) ]');
const REAL_A1 = [
  ["Great effort! 🌟 Let's try to say one thing at a time. You like dolls, and that's okay! But can you tell me: Do you like any animals, like a cute kitten? 🐈 (💡 너무 많은 문장을 말할 때는 한 가지씩 말하는 것이 더 쉽습니다)", 45],
  ["Nice sentence! 😊 You really like blueberries with yogurt! Animals like birds like fruits too! Do you have a pet, like a dog or a cat, that likes treats? (💡 나는 likes 대신에 love를 사용해볼 수 있어요)", 37],
  ["Nice try! 🤗 You're saying a lot of things, but let's simplify. You like dolls, that's cool! But today, we're talking about animals. Do you like any animals, like a big elephant? 🐘", 33],
  ["Wow, that's so cool! 🐶🍓 Dogs can be funny animals! Some animals like dogs have best friends, like cats! Does your dog have a best friend, like another animal?", 29],
  ["Great try! 🎉 You're getting excited! You said \"big\", and I think you might be talking about a big animal! Is your favorite animal a big elephant? 🐘", 28],
];
for (const [reply] of REAL_A1) {
  const m = M.aiFriendMeasureReply(reply, 'S1');   // 옛 A1 = 새 S1
  check(`S1(옛 A1) 에서 넘친다고 잡는다 (${m.sentences}문장 / 최장 ${m.worstWords}단어)`, !m.ok);
}
check('S1 눈높이에 맞는 짧은 답은 통과시킨다(멀쩡한 것까지 건드리지 않는다)',
  M.aiFriendMeasureReply('Nice try! 😊 Do you like cats?', 'S1').ok,
  M.aiFriendMeasureReply('Nice try! 😊 Do you like cats?', 'S1'));
/* S1(5단어)과 S2(7단어)의 차이를 «한 문장» 으로 보인다 — 6단어짜리는 S2 는 되고 S1 은 안 된다.
   ⚠️ 예문을 아무거나 쓰면 안 된다. "Do you like cats?" 는 4단어라 S1 도 통과한다(실제로 밟았다). */
const SIX = 'Do you like cats or dogs?';
check('S1 은 S2 보다 한 칸 더 짧다 (6단어짜리가 S2 는 되고 S1 은 안 된다)',
  M.aiFriendMeasureReply(SIX, 'S2').ok && !M.aiFriendMeasureReply(SIX, 'S1').ok,
  { S2: M.aiFriendMeasureReply(SIX, 'S2'), S1: M.aiFriendMeasureReply(SIX, 'S1') });
check('S8(C1) 은 단어 상한이 없다(자유롭게 말한다)',
  M.AI_FRIEND_LEVELS.S8.maxWordsPerSentence === 0
  && M.aiFriendMeasureReply('I genuinely think that documentary changed how I see the whole subject.', 'S8').ok);

/* ── C. 줄이기 — 문장 수만, 질문은 남기고, 낱말은 자르지 않는다 ────── */
console.log('\n[ C. 줄이기는 문장 «수» 만 줄인다 ]');
for (const [reply] of REAL_A1) {
  const out = M.aiFriendTrimSentences(reply, 'A1');
  const after = M.aiFriendMeasureReply(out, 'A1');
  check(`줄인 뒤 문장 수가 상한 이하 (${after.sentences} ≤ ${after.maxSentences})`, after.sentences <= after.maxSentences);
  const hadQ = /\?/.test(reply);
  check('되묻는 질문을 버리지 않는다', !hadQ || /\?/.test(out), out.slice(-60));
  // 낱말을 자르지 않았는가 — 남은 문장이 원문에 «그대로» 있어야 한다
  const sentences = M.aiFriendSplitSentences(out);
  check('남긴 문장이 원문 그대로다(낱말을 자르지 않았다)', sentences.every((x) => reply.includes(x)), sentences);
}
check('상한 이하인 답변은 아예 건드리지 않는다',
  M.aiFriendTrimSentences('Nice try! Do you like cats?', 'A1') === 'Nice try! Do you like cats?');

/* ── D. 한국어 팁은 길이에서 빼고, 결과에는 도로 붙인다 ────────────── */
console.log('\n[ D. 한국어 문법 팁(💡) 취급 ]');
const withTip = 'Nice try! 😊 Do you like cats? (💡 like 뒤에는 복수형이 자연스러워요)';
check('팁은 길이 계산에서 뺀다(팁 단 답변만 억울하게 잘리지 않는다)', M.aiFriendMeasureReply(withTip, 'A1').ok,
  M.aiFriendMeasureReply(withTip, 'A1'));
check('줄이고 나서도 팁이 살아 있다',
  M.aiFriendTrimSentences(REAL_A1[0][0], 'A1').includes('💡'));
check('이모지만 남은 꼬리는 문장으로 세지 않는다',
  M.aiFriendSplitSentences('Nice try! 😊 Do you like cats? 🐈').length === 2,
  M.aiFriendSplitSentences('Nice try! 😊 Do you like cats? 🐈'));
check('마침표가 없는 긴 한 줄도 한 문장으로 세어 «길다»를 놓치지 않는다',
  !M.aiFriendMeasureReply('i really think that you should try eating more fruit every single day my friend', 'A1').ok);
check('다시 뽑기 지시에 «몇 개인지» 숫자가 들어간다',
  /\d/.test(M.aiFriendShortenHint(REAL_A1[0][0], 'A1')) && M.aiFriendShortenHint(REAL_A1[0][0], 'A1').includes('A1'));

/* ── E. 배선 — api-ai.ts 가 그 규격을 정말 쓰는가 ──────────────────── */
console.log('\n[ E. 배선 (api-ai.ts) ]');
check('정본 모듈을 import 한다', /from '\.\/ai-friend-level'/.test(AI));
check('chat-friend 핸들러를 중괄호 짝으로 잘라냈다', CF.length > 2000 && CF.includes('const system ='), CF.length);
check('프롬프트에 레벨 규격을 주입한다', /\$\{lvSpec\.rule\}/.test(CF));
check('옛 «한 줄짜리» 레벨 지시가 사라졌다(A1·C1 만 설명하던 그 줄)',
  !/A1 = very short simple sentences/.test(CF));
check('기초 단계에서 «재미있는 사실»을 끈다', /lvSpec\.plain\s*\?\s*''/.test(CF));
check('기초 단계에서 «최근 틀린 단어 끼워 넣기»를 끈다', /weak\.length\s*&&\s*!lvSpec\.plain/.test(CF));
check('만든 뒤 실제로 재 본다', /aiFriendMeasureReply\(reply,\s*level\)/.test(CF));
check('넘치면 한 번 더 뽑는다', /aiFriendShortenHint\(reply,\s*level\)/.test(CF));
check('그래도 넘치면 문장 수를 줄인다', /aiFriendTrimSentences\(reply,\s*level\)/.test(CF));
check('다시 뽑은 것을 «더 나을 때만» 받는다(빈 답·더 긴 답으로 바꾸지 않는다)',
  /m2\.ok\s*\|\|\s*\(m2\.worstWords\s*<=/.test(CF));
check('기본 레벨을 하드코딩하지 않고 정본을 거친다',
  /aiFriendNormalizeLevel\(b\.level\)/.test(CF) && !/b\.level \|\| '(A2|S3)'/.test(CF));
check('넘친 채로 나가면 조용히 넘기지 않고 로그를 남긴다', /still long/.test(CF));

/* ── F. 웜업과 «짝» 인가 — 여덟 칸 «전부» 를 대조한다 ───────────────
   2026-08-31 사장님 결정으로 두 화면이 같은 여덟 눈금을 쓴다. 한 칸만 어긋나도
   「같은 레벨인데 화면마다 답이 다른」 사고가 시작되므로 전 칸을 센다. */
console.log('\n[ F. 웜업 여덟 칸과 같은 숫자인가 ]');
let wlPaired = 0;
for (let n = 1; n <= 7; n++) {                    // 8단계는 «제한 없음» 이라 숫자가 없다
  const line = (IDX.match(new RegExp('\\n\\s*' + n + ':\\s*"레벨 ' + n + '\\([^"]*"')) || [''])[0];
  const rng = (line.match(/(\d+)~(\d+)\s*단어/) || []);
  const key = 'S' + n;
  if (rng.length !== 3) { check(`index.ts 에서 웜업 레벨 ${n} 의 단어 수를 읽었다`, false, line.slice(0, 70)); continue; }
  wlPaired++;
  check(`${key} 한 문장 상한이 웜업 레벨 ${n} 과 같다 (${rng[2]}단어)`,
    M.AI_FRIEND_LEVELS[key].maxWordsPerSentence === Number(rng[2]),
    { friend: M.AI_FRIEND_LEVELS[key].maxWordsPerSentence, warmup: Number(rng[2]) });
}
check('웜업 일곱 칸을 전부 읽었다', wlPaired === 7, wlPaired);
/* 🔴 눈금을 «밀지» 않았는지 — 웜업 레벨 1 은 판단력 훈련 첫걸음(3~5단어)과 같은 자리여야 한다.
   2026-08-31 에 맨 아래에 더 쉬운 칸을 «끼워 넣어» 전체를 한 칸 밀었다가 되돌렸다.
   밀면 저장된 mangoi_warmup_level 의 «뜻» 이 말없이 바뀌고, 같은 밴드 이름을 두 화면이
   서로 다른 단어 수로 부르게 된다(에러가 안 난다). */
const wl1 = (IDX.match(/1:\s*"레벨 1\([^"]*"/) || [''])[0];
const wlRange = (wl1.match(/(\d+)~(\d+)\s*단어/) || []);
check(`웜업 레벨 1 이 첫걸음 자리 그대로다 (${wlRange[1]}~${wlRange[2]}단어)`,
  wlRange.length === 3 && Number(wlRange[1]) === 3 && Number(wlRange[2]) === 5,
  { aiFriend: M.AI_FRIEND_LEVELS.S1.maxWordsPerSentence, warmup: wl1.slice(0, 40) });
/* 그 «쉽게 하기» 는 길이가 아니라 질문 형식으로 한다 — 서버 규칙에도 그렇게 적혀 있어야 한다 */
check('웜업 레벨 1 이 Yes/No 만 묻게 되어 있다', /Yes\.' 'No\.|wh- 질문이나 'or' 질문은 하지 마/.test(wl1), wl1.slice(0, 120));
check('그 사실이 정본 파일에 «왜» 와 함께 적혀 있다', /WARMUP_LEVELS/.test(LV_SRC) && /짝/.test(LV_SRC));

/* ── G. 화면과 서버가 짝인가 ──────────────────────────────────────── */
console.log('\n[ G. 화면(ai-friend.html) 과 서버가 짝인가 ]');
const htmlLevels = [...HTML.matchAll(/data-level="([A-Z0-9]+)"/g)].map((m) => m[1]);
check('화면 레벨 목록이 서버 목록과 정확히 같다',
  htmlLevels.join(',') === IDS.join(','), { html: htmlLevels, server: IDS });
check('화면이 레벨을 localStorage 에 기억한다(새로고침해도 안 돌아간다)',
  /mangoi_aifriend_level/.test(HTML) && /setItem\(AIF_LEVEL_KEY/.test(HTML));
check('기억해 둔 레벨을 화면 버튼에 다시 입힌다',
  /classList\.toggle\('active',\s*b\.dataset\.level === currentLevel\)/.test(HTML));
const htmlDefault = (HTML.match(/class="opt active" data-level="([A-Z0-9]+)"/) || [])[1];
check(`화면 기본 레벨이 서버 기본값과 같다 (${htmlDefault} / ${M.AI_FRIEND_DEFAULT_LEVEL})`,
  htmlDefault === M.AI_FRIEND_DEFAULT_LEVEL, { html: htmlDefault, server: M.AI_FRIEND_DEFAULT_LEVEL });
/* ⚠️ «그 코드 모양이 있는가» 로 쓰지 말 것 — 표현만 바꿔도 FAIL 난다.
   물어야 할 것은 «화면이 쓰는 기본값이 서버와 같은가» 다. */
const htmlDefConst = (HTML.match(/const AIF_DEFAULT\s*=\s*'([A-Z0-9]+)'/) || [])[1];
check(`저장이 실패해도 쓰는 기본값이 서버와 같다 (${htmlDefConst} / ${M.AI_FRIEND_DEFAULT_LEVEL})`,
  htmlDefConst === M.AI_FRIEND_DEFAULT_LEVEL, { html: htmlDefConst, server: M.AI_FRIEND_DEFAULT_LEVEL });
/* 🔑 옛 저장값 이어받기 — 화면과 서버가 «같은 대응표» 를 써야 한다 */
const htmlLegacy = (HTML.match(/const AIF_LEGACY\s*=\s*\{[^}]*\}/) || [''])[0];
for (const [oldK, newK] of Object.entries({ A1: 'S1', A2: 'S2', B1: 'S4', B2: 'S6', C1: 'S8' })) {
  check(`화면도 옛 «${oldK}» 를 ${newK} 로 이어받는다`,
    new RegExp(oldK + "\\s*:\\s*'" + newK + "'").test(htmlLegacy), htmlLegacy.slice(0, 80));
}
check('옛 하드코딩(let currentLevel = \'B1\')이 사라졌다', !/let currentLevel = 'B1'/.test(HTML));

/* ── G-2. 🆕 CEFR 칸 — 두 화면이 같은 이름을 쓰는가 ────────────────────
   2026-08-31 사장님 결정 「새 칸 만들고 CEFR 이름 함께 보여줘」.
   ⛔ 이 칸으로 웜업의 ko·lv 를 «대체» 하면 안 된다 — 그 둘은 판단력 훈련 BAND_SPECS 와 짝이고
      warmup_age_level_harness C절이 대조한다. 실제로 한 번 갈아 끼웠다가 FAIL 로 잡혔다. */
const WHTML = readFileSync(resolve(ROOT, 'public', 'warmup.html'), 'utf8');
const wCat = (WHTML.match(/var LEVEL_CATALOG\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || '';
const wCefr = [...wCat.matchAll(/cefr:\s*'([^']+)'/g)].map((m) => m[1]);
check('웜업 화면에 CEFR 칸이 여덟 개 있다', wCefr.length === 8, wCefr);
check('웜업 CEFR == 서버 AI_FRIEND_CEFR (순서까지)',
  wCefr.join(',') === IDS.map((k) => M.AI_FRIEND_CEFR[k]).join(','),
  { warmup: wCefr.join(','), server: IDS.map((k) => M.AI_FRIEND_CEFR[k]).join(',') });
// ⛔ CEFR 이 ko·lv 를 «대체» 하지 않았는가 — 교재 Lv 표기가 그대로 남아 있어야 한다
check('웜업이 교재 Lv 구간 칸을 CEFR 로 갈아 끼우지 않았다',
  /lv:\s*'Lv 1-4'/.test(wCat) && /lv:\s*'Lv 31-34'/.test(wCat), wCat.slice(0, 120));
/* 🔴 «지금 몇 단계인가» 를 화면 두 곳이 서로 다르게 말하면 안 된다.
   ⋮ 설정 패널의 첫 표시 글자가 HTML 에 «손으로» 박혀 있어서, 눈금을 손볼 때마다
   그 한 줄만 옛 값으로 남는다(실제로 「3단계 · 초급+」 이 남아 설정 화면과 달랐다).
   JS 가 곧 덮지만 ① 덮기 전에 한 번 보이고 ② JS 가 죽으면 그대로 남는다. */
{
  const names = [...wCat.matchAll(/ko:\s*'([^']+)'/g)].map((m) => m[1]);
  const DEF = 3;   // 기본 단계 — 서버 AI_FRIEND_DEFAULT_LEVEL(S3)·웜업 _warmLevel 과 같은 칸
  const want = `${DEF}단계 · ${names[DEF - 1]} · ${wCefr[DEF - 1]}`;
  const got = (WHTML.match(/id="lvlVal"[^>]*>([^<]*)</) || [])[1] || '';
  check(`⋮ 패널 첫 표시가 목록과 같은 말을 한다 (${want})`, got.trim() === want,
    { html: got.trim(), 목록: want });
  // 이름을 «손으로» 조립하는 자리가 남아 있으면 또 어긋난다 — levelLabel() 한 곳으로 모은다
  check('단계 이름을 손으로 조립하지 않는다(levelLabel 로 모음)',
    !/'단계 · ' \+ LEVEL_NAMES\[|단계\(' \+ LEVEL_NAMES\[/.test(WHTML),
    'LEVEL_NAMES 를 직접 이어 붙이면 CEFR 이 빠진 채로 굳는다');
  check('그 한 곳(levelLabel)이 실재한다', /function levelLabel\(/.test(WHTML));
}

// 화면 버튼의 <i> 라벨도 같은 이름이어야 한다(학생이 보는 글자)
const btnCefr = [...HTML.matchAll(/data-level="(S\d)"[^>]*>\s*\d<i>([^<]+)<\/i>/g)].map((m) => [m[1], m[2].trim()]);
check('AI 영어친구 버튼 여덟 개에 CEFR 이름이 붙어 있다', btnCefr.length === 8, btnCefr);
check('버튼의 CEFR 이름 == 서버 AI_FRIEND_CEFR',
  btnCefr.every(([k, v]) => M.AI_FRIEND_CEFR[k] === v), btnCefr);

/* ── H. 역검증 — 되돌리면 정말 FAIL 나는가 ────────────────────────── */
console.log('\n[ H. 역검증 — 보장을 빼면 검사가 잡는가 ]');
const MUT = [
  ['프롬프트 주입을 빼면', CF.replace('${lvSpec.rule}', ''), (t) => /\$\{lvSpec\.rule\}/.test(t)],
  ['재 보는 단계를 빼면', CF.replace(/aiFriendMeasureReply\(reply, level\)/g, 'null'), (t) => /aiFriendMeasureReply\(reply,\s*level\)/.test(t)],
  ['줄이는 단계를 빼면', CF.replace(/aiFriendTrimSentences\(reply, level\)/g, 'reply'), (t) => /aiFriendTrimSentences\(reply,\s*level\)/.test(t)],
  ['기초 단계 plain 처리를 빼면', CF.replace(/weak\.length && !lvSpec\.plain/, 'weak.length'), (t) => /weak\.length\s*&&\s*!lvSpec\.plain/.test(t)],
  ['화면 레벨 기억을 빼면', HTML.replace(/setItem\(AIF_LEVEL_KEY[^\n]*\n/, '\n'), (t) => /setItem\(AIF_LEVEL_KEY/.test(t)],
];
for (const [label, mutated, probe] of MUT) check(`${label} 검사가 잡는다`, !probe(mutated));
// 규격 자체를 무르게 만들면 A/F 절이 잡는가 (실행 검증)
/* ⚠️ 예전에 여기가 `...M.AI_FRIEND_LEVELS.A1` 이었다 — 그 키는 이제 없고 `{...undefined}` 는
   예외를 안 던져 «검사는 통과하는데 아무것도 안 보는» 줄이 됐다(2026-08-31 trap-check 발견).
   그래서 그 칸이 실제로 있는지 먼저 묻는다. */
check('느슨하게 만들 기준 칸(S1)이 실재한다', !!M.AI_FRIEND_LEVELS.S1);
const loose = { ...M.AI_FRIEND_LEVELS.S1, maxWordsPerSentence: 40, maxSentences: 9 };
check('S1 상한을 느슨하게 하면 실측 답변이 통과해 버린다(그래서 숫자를 못 박는다)',
  REAL_A1.every(([r]) => M.aiFriendSplitSentences(r).length <= loose.maxSentences));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) console.log('  ' + FAILS.join('\n  '));
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
