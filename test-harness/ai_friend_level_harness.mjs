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
const IDS = ['A1', 'A2', 'B1', 'B2', 'C1'];
check('레벨 5종이 모두 있다', IDS.every((k) => M.AI_FRIEND_LEVELS[k]), Object.keys(M.AI_FRIEND_LEVELS));
for (const k of IDS) {
  const s = M.AI_FRIEND_LEVELS[k];
  check(`${k}: 설명(rule)이 비어 있지 않다`, typeof s.rule === 'string' && s.rule.length > 40);
  check(`${k}: 그 rule 이 레벨 이름을 말한다`, s.rule.includes(k), s.rule.slice(0, 40));
}
// A1·C1 만 설명이 있던 옛 상태로 돌아가지 않게 — 가운데 세 단계도 반드시 «숫자» 를 갖는다
for (const k of ['A1', 'A2', 'B1', 'B2']) {
  check(`${k}: 한 문장 단어 상한이 숫자로 정해져 있다`, M.AI_FRIEND_LEVELS[k].maxWordsPerSentence > 0,
    M.AI_FRIEND_LEVELS[k].maxWordsPerSentence);
}
check('단어 상한이 A1 < A2 < B1 < B2 로 커진다',
  M.AI_FRIEND_LEVELS.A1.maxWordsPerSentence < M.AI_FRIEND_LEVELS.A2.maxWordsPerSentence
  && M.AI_FRIEND_LEVELS.A2.maxWordsPerSentence < M.AI_FRIEND_LEVELS.B1.maxWordsPerSentence
  && M.AI_FRIEND_LEVELS.B1.maxWordsPerSentence < M.AI_FRIEND_LEVELS.B2.maxWordsPerSentence);
check('문장 수 상한이 줄어들지 않는다(A1 ≤ A2 ≤ B1 ≤ B2 ≤ C1)',
  IDS.every((k, i) => i === 0 || M.AI_FRIEND_LEVELS[IDS[i - 1]].maxSentences <= M.AI_FRIEND_LEVELS[k].maxSentences));
check('기초 단계(A1·A2)만 «길이를 늘리는 규칙»을 끈다(plain)',
  M.AI_FRIEND_LEVELS.A1.plain && M.AI_FRIEND_LEVELS.A2.plain
  && !M.AI_FRIEND_LEVELS.B1.plain && !M.AI_FRIEND_LEVELS.B2.plain && !M.AI_FRIEND_LEVELS.C1.plain);
check('모르는 레벨은 기본값으로 떨어진다(조용히 죽지 않는다)',
  M.aiFriendLevelSpec('Z9').maxSentences === M.AI_FRIEND_LEVELS[M.AI_FRIEND_DEFAULT_LEVEL].maxSentences
  && M.aiFriendLevelSpec('').maxSentences === M.AI_FRIEND_LEVELS[M.AI_FRIEND_DEFAULT_LEVEL].maxSentences);
check('대소문자를 가리지 않는다(a1 도 A1)', M.aiFriendLevelSpec('a1').maxWordsPerSentence === M.AI_FRIEND_LEVELS.A1.maxWordsPerSentence);

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
  const m = M.aiFriendMeasureReply(reply, 'A1');
  check(`A1 에서 넘친다고 잡는다 (${m.sentences}문장 / 최장 ${m.worstWords}단어)`, !m.ok);
}
check('A1 눈높이에 맞는 짧은 답은 통과시킨다(멀쩡한 것까지 건드리지 않는다)',
  M.aiFriendMeasureReply('Nice try! 😊 Do you like cats?', 'A1').ok,
  M.aiFriendMeasureReply('Nice try! 😊 Do you like cats?', 'A1'));
check('C1 은 단어 상한이 없다(자유롭게 말한다)',
  M.AI_FRIEND_LEVELS.C1.maxWordsPerSentence === 0
  && M.aiFriendMeasureReply('I genuinely think that documentary changed how I see the whole subject.', 'C1').ok);

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
check('기본 레벨을 하드코딩하지 않고 정본 상수를 쓴다',
  /b\.level \|\| AI_FRIEND_DEFAULT_LEVEL/.test(CF) && !/b\.level \|\| 'A2'/.test(CF));
check('넘친 채로 나가면 조용히 넘기지 않고 로그를 남긴다', /still long/.test(CF));

/* ── F. 웜업과 «짝» 인가 (사장님 지시: A1 = 웜업 레벨 1) ───────────── */
console.log('\n[ F. 웜업 레벨 1 과 같은 숫자인가 ]');
const wl1 = (IDX.match(/1:\s*"레벨 1\(기초\)[^"]*"/) || [''])[0];
const wlRange = (wl1.match(/(\d+)~(\d+)\s*단어/) || []);
check('index.ts 에서 웜업 레벨 1 의 단어 수를 읽었다', wlRange.length === 3, wl1.slice(0, 60));
check(`A1 한 문장 상한이 웜업 레벨 1 과 같다 (${wlRange[2]}단어)`,
  wlRange.length === 3 && M.AI_FRIEND_LEVELS.A1.maxWordsPerSentence === Number(wlRange[2]),
  { aiFriend: M.AI_FRIEND_LEVELS.A1.maxWordsPerSentence, warmup: wlRange[2] });
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
check('저장이 실패해도 쓰는 기본값이 서버와 같다',
  new RegExp("indexOf\\(v\\) >= 0 \\? v : '" + M.AI_FRIEND_DEFAULT_LEVEL + "'").test(HTML));
check('옛 하드코딩(let currentLevel = \'B1\')이 사라졌다', !/let currentLevel = 'B1'/.test(HTML));

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
const loose = { ...M.AI_FRIEND_LEVELS.A1, maxWordsPerSentence: 40, maxSentences: 9 };
check('A1 상한을 느슨하게 하면 실측 답변이 통과해 버린다(그래서 숫자를 못 박는다)',
  REAL_A1.every(([r]) => M.aiFriendSplitSentences(r).length <= loose.maxSentences));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) console.log('  ' + FAILS.join('\n  '));
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
