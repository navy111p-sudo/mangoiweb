// 🧑 친구(캐릭터) 고르기 + 💡 도움 칩 + 🎧 자막 없이 듣기 덤 — 2026-08-07
//   배경: 경쟁사(클라우봇) 벤치마킹 P1.
//     · 캐릭터 선택은 «기능이 없어서» 가 아니라 «고른 느낌이 없어서» 문제였다.
//       목소리 3종·실사 아바타 2종·말투 4종이 이미 있었는데 설정 줄에 「목소리 여자/남자」로
//       레벨·속도와 섞여 있었고 이름이 전부 Mango 라 누구와 이야기하는지 구분되지 않았다.
//     · 경쟁사는 «버튼만 눌러» 수업이 굴러가 저학년도 시작할 수 있다. 대신 자유 발화 훈련이 사라진다.
//       우리는 반대로 — 기본은 직접 말하기, **막혔을 때만** 도움 칩.
//
//   이 하니스가 고정하는 것:
//     ① 있지도 않은 얼굴로 캐릭터를 늘리지 않는다.
//        이름만 다른 같은 얼굴은 «고른 느낌» 이 아니라 «속은 느낌» 이 된다.
//        (2026-08-31) 사장님 지시로 친구가 둘 → 넷이 되었다: emma·jake(성인, 기존)
//        + lily·noah(19세, 새 얼굴). 얼굴이 진짜로 넷이므로 이 규칙은 그대로 지켜진다.
//     ② 저장 키를 새로 만들지 않는다(mangoi_aifriend_voice 재사용) — 새 키를 만들면 지금까지
//        고른 목소리가 한 번 리셋된다.
//     ③ 도움 칩은 **눌러야만** 열린다. 늘 떠 있으면 «고르는 학습» 이 되어 자유 발화가 죽는다.
//     ④ ___ 가 있는 칩은 보내지 않고 입력창에 넣는다(문장 완성 연습을 건너뛰지 않게).
//     ⑤ 칩에 한국어 뜻을 같이 적는다 — 영어만 적으면 저학년은 뭘 보내는지 모른 채 누른다.
//     ⑥ 자막 덤은 **끈 쪽에 덤**이지 켠 쪽에 벌점이 아니다. 하루 5회로 묶는다.
//     ⑦ 도움 칩은 서버를 부르지 않는다(비용 0·오프라인 동작).
//
//   실행: node test-harness/ai_friend_character_help_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const aif = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'ai-friend.html'), 'utf8');
const apiAi = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'api-ai.ts'), 'utf8');
const avatarJs = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'js', 'mango-avatar.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}

/* ═══════════════════════════════════════════════════════════
   ① 친구(캐릭터) — 실제로 있는 얼굴만, 저장 키는 그대로
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ① 친구 고르기 — 있는 얼굴만, 기존 설정 유지 ]');

// FRIENDS 배열을 소스에서 떼어내 실제로 평가한다
const fm = aif.match(/const FRIENDS = (\[[\s\S]*?\n    \]);/);
check('FRIENDS 정의를 찾았다', !!fm);
let FRIENDS = [];
if (fm) FRIENDS = eval(fm[1]);

// 아바타가 실제로 그릴 수 있는 얼굴 목록
const chars = [...avatarJs.matchAll(/^\s{4}(\w+):\s*\{/gm)].map((m) => m[1]);
const faceSet = new Set(chars.length ? chars : ['female', 'male']);
check(`아바타가 가진 얼굴은 ${[...faceSet].join('/')} 이다(전제 확인)`,
  ['emma', 'jake', 'lily', 'noah'].every((k) => faceSet.has(k)), [...faceSet]);
check('친구는 5개 — 얼굴 4개 + 번갈아 1개', FRIENDS.length === 5, FRIENDS.map((f) => f.v));
// ⚠️ v 값이 바뀌면 저장된 설정이 한 번 리셋된다 — 그래서 «옛 값을 이어받는 코드» 를 함께 못 박는다.
//    (옛 값: female·male → 지금: emma·jake)
check('친구의 v 값이 네 사람 + 번갈아다',
  FRIENDS.map((f) => f.v).sort().join() === 'emma,jake,lily,mix,noah', FRIENDS.map((f) => f.v));
check('옛 저장값(female·male)을 이어받는다 — 지금까지 고른 친구가 리셋되지 않게',
  /v === 'female'\) v = 'emma'/.test(aif) && /v === 'male'\) v = 'jake'/.test(aif));
check('친구마다 얼굴이 서로 다르다(이름만 다른 같은 얼굴 금지)',
  new Set(FRIENDS.filter((f) => f.v !== 'mix').map((f) => f.v)).size === FRIENDS.length - 1);
check('없는 얼굴로 캐릭터를 늘리지 않았다',
  FRIENDS.every((f) => f.v === 'mix' || faceSet.has(f.v)));
check('친구마다 이름·설명·기본 말투·인사말이 다 있다',
  FRIENDS.every((f) => f.name && f.ko && f.en && f.persona && f.d_ko && f.d_en && f.hi), FRIENDS);
check('이름이 서로 다르다(전부 Mango 이던 문제)',
  new Set(FRIENDS.map((f) => f.name)).size === FRIENDS.length, FRIENDS.map((f) => f.name));
check('기본 말투가 실제 존재하는 페르소나다',
  FRIENDS.every((f) => new RegExp(`data-persona="${f.persona}"`).test(aif)), FRIENDS.map((f) => f.persona));
check('저장 키를 새로 만들지 않고 기존 mangoi_aifriend_voice 를 쓴다',
  /setItem\('mangoi_aifriend_voice', currentVoice\)/.test(aif) && !/mangoi_aifriend_friend/.test(aif));

console.log('\n[ ①-2 «고른 느낌» 이 실제로 남는가 ]');
check('헤더에 고른 친구 이름이 뜬다', /id="friendName"/.test(aif) && /function syncFriendName/.test(aif));
check('헤더 이름을 누르면 다시 고를 수 있다', /onclick="showFriendPicker\(\)"/.test(aif));
check('이름이 버튼인 줄 알 수 있게 안내가 붙어 있다', /눌러서 친구 바꾸기/.test(aif));
check('설정 줄 라벨이 「목소리」가 아니라 「친구」다', /data-ko="친구:"/.test(aif) && !/data-ko="목소리:"/.test(aif));
check('첫 화면(빈 화면)에서 친구를 먼저 고르게 한다',
  /오늘은 누구랑 이야기할까요\?/.test(aif) && aif.indexOf('friendCards()') < aif.indexOf('모험 주제를 골라볼까요?'));
check('고르면 지금 고른 카드에 표시가 옮겨간다(정적 카드도)',
  /friend-card\[data-v\][\s\S]{0,120}classList\.toggle\('on'/.test(aif));
check('고르면 그 친구가 자기 목소리로 인사한다(귀로도 확인)',
  /if \(greet\) \{ appendMsg\('ai', f\.hi\); if \(isSoundOn\(\)\) speakText/.test(aif));
check('고르면 얼굴도 같이 바뀐다', /setFriend[\s\S]{0,700}?syncAvatarToVoice\(\)/.test(aif));

/* ═══════════════════════════════════════════════════════════
   ② 💡 도움 칩 — 규칙을 실제로 실행해 본다
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ② 💡 도움 칩 — 실제로 실행해 규칙을 확인 ]');

const hm = aif.match(/const HELP_ALWAYS = (\[[\s\S]*?\n    \]);/);
const cm = aif.match(/function helpChipsFor\(q\) \{[\s\S]*?\n    \}/);
check('HELP_ALWAYS / helpChipsFor 를 소스에서 찾았다', !!hm && !!cm);

let helpChipsFor = null, HELP_ALWAYS = [];
if (hm && cm) {
  HELP_ALWAYS = eval(hm[1]);
  helpChipsFor = eval('(' + cm[0].replace(/^function helpChipsFor/, 'function') + ')');
  check('떼어낸 함수가 실제로 돈다', typeof helpChipsFor === 'function');
}

if (helpChipsFor) {
  const en = (q) => helpChipsFor(q).map((c) => c.en);
  check('예/아니오 질문 → 예/아니오 답이 나온다',
    en('Do you like pizza?').some((s) => /^Yes/.test(s)) && en('Do you like pizza?').some((s) => /^No/.test(s)), en('Do you like pizza?'));
  check('Where 질문 → 장소 답', en('Where do you live?').includes('At home.'), en('Where do you live?'));
  check('Why 질문 → 이유 답', en('Why do you like it?').some((s) => /^Because/.test(s)), en('Why do you like it?'));
  check('How are you → 기분 답', en('How are you today?').some((s) => /I'm/.test(s)), en('How are you today?'));
  check('favorite 질문 → «내가 제일 좋아하는 건 ___»', en("What's your favorite animal?").some((s) => /favorite is ___/.test(s)));
  check('How many → 개수 답(How are you 와 헷갈리지 않는다)',
    en('How many pets do you have?').includes('Three.'), en('How many pets do you have?'));
  check('질문이 아니면 대화를 잇는 무난한 답', en('Dinosaurs were huge!').includes('Tell me more!'));
  check('대소문자·앞뒤 공백이 달라도 같게 동작',
    JSON.stringify(en('  DO YOU LIKE PIZZA?  ')) === JSON.stringify(en('do you like pizza?')));
  check('빈 입력에도 터지지 않는다', Array.isArray(helpChipsFor('')) && helpChipsFor(null).length > 0);

  // 모든 갈래가 «한국어 뜻» 을 갖고 있는가 — 하나라도 빠지면 저학년이 모르고 누른다
  const branches = ['How are you?', 'How many?', 'favorite?', 'Do you like it?', 'What did you do?',
    'What is it?', 'Where?', 'Who?', 'When?', 'Why?', 'How?', 'no question here'];
  const missing = branches.filter((q) => helpChipsFor(q).some((c) => !c.ko || !c.en));
  check('모든 갈래의 칩이 영어+한국어 뜻을 다 갖는다', missing.length === 0, missing);
  check('항상 붙는 «다시 말해줘 / 모르겠어» 안전칩이 있다',
    HELP_ALWAYS.length >= 2 && HELP_ALWAYS.every((c) => c.ko && c.en), HELP_ALWAYS);
}

console.log('\n[ ②-2 도움은 «막혔을 때만» — 자유 발화를 죽이지 않는가 ]');
check('도움 줄은 기본으로 닫혀 있다', /id="helpRow" style="display:none"/.test(aif));
check('눌러야만 열린다(토글)', /function toggleHelp\(\)/.test(aif) && /row\.style\.display !== 'none'\) \{ closeHelp\(\); return; \}/.test(aif));
check('기본 입력 동선(직접 쓰기·🎤)이 그대로 남아 있다',
  /id="msgInput"/.test(aif) && /id="micBtn"/.test(aif));
check('___ 가 있는 칩은 보내지 않고 입력창에 넣는다',
  /if \(en\.indexOf\('___'\) >= 0\)[\s\S]{0,260}?setSelectionRange/.test(aif));
check('___ 칩을 눌러도 도움 줄이 닫히지 않는다(다른 칩을 이어 볼 수 있게)',
  /setSelectionRange\(at, at\); \} catch\(e\)\{\}\s*\n\s*return;/.test(aif));
check('완성된 문장 칩은 바로 보내고 도움 줄을 닫는다',
  /closeHelp\(\);\s*\n\s*quickSend\(en\);/.test(aif));
/* 도움 칩이 서버를 부르는지 — «근처에 fetch 가 있나» 로 보면 옆 함수의 fetch 를 잡는다.
   함수 본문을 중괄호 짝으로 정확히 떼어내 그 안만 본다. */
function bodyOf(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const s = src.indexOf('{', i);
  let d = 0;
  for (let j = s; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(s, j + 1); }
  }
  return null;
}
const helpFns = ['helpChipsFor', 'toggleHelp', 'helpPick', 'closeHelp', 'lastAiText'];
const bodies = helpFns.map((n) => [n, bodyOf(aif, n)]);
check('도움 칩 함수 5개를 모두 찾았다', bodies.every(([, b]) => !!b), bodies.filter(([, b]) => !b).map(([n]) => n));
const callsFetch = bodies.filter(([, b]) => b && /\bfetch\s*\(/.test(b)).map(([n]) => n);
check('도움 칩은 서버를 부르지 않는다(비용 0·오프라인 동작)', callsFetch.length === 0, callsFetch);

/* ═══════════════════════════════════════════════════════════
   ③ 🎧 자막 없이 듣기 덤 — 끈 쪽에 덤, 켠 쪽에 벌점 아님
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ③ 🎧 자막 덤 — 끈 쪽에 덤이지 켠 쪽에 벌점이 아니다 ]');

check('화면이 지금 자막 단계를 서버로 보낸다', /sub: currentSub/.test(aif));
check('서버가 blur/off 일 때만 덤을 준다',
  /const wantListen = \['blur', 'off'\]\.includes\(String\(b\.sub \|\| ''\)\)/.test(apiAi));
/* ⚠️ (2026-09-01) 이 부정 검사는 **주석을 벗긴 사본**으로 해야 한다 — 원본으로 보면
   근처 주석에 적힌 날짜(2026-09-01)의 «빼기+숫자» 가 걸려 거짓 FAIL 이 난다. 실제로 그렇게 났다.
   규칙서 2장 「부정 검사는 반드시 주석을 벗겨 낸 사본으로 판정하세요」. */
const apiAiCode = (() => {
  const OPEN = String.fromCharCode(47, 42), CLOSE = String.fromCharCode(42, 47), LINE = String.fromCharCode(47, 47);
  let inBlk = false;
  return apiAi.split(/\r?\n/).filter((raw) => {
    const t = raw.trim();
    if (inBlk) { if (t.includes(CLOSE)) inBlk = false; return false; }
    if (t.startsWith(OPEN)) { if (!t.includes(CLOSE)) inBlk = true; return false; }
    return !t.startsWith(LINE);
  }).join('\n');
})();
check('«on»(자막 켬)에는 감점이 없다 — 코드에 감점 자체가 없다',
  !/ai_friend_listen[\s\S]{0,200}?-\d/.test(apiAiCode) && !/penalt/i.test(apiAiCode));
check('하루 5회로 묶여 있다(무한 적립 방지)', /wantListen && listenUsed < 5/.test(apiAi));
check('덤은 1P 다(과보상 방지)', /logAward\('ai_friend_listen', 1,/.test(apiAi));
check('안 쓸 땐 조회조차 안 한다(불필요한 D1 읽기 방지)',
  /wantListen \? usedToday\('ai_friend_listen'\) : Promise\.resolve\(Infinity\)/.test(apiAi));
check('화면이 덤을 포인트에 반영한다', /g\.listen_bonus[\s\S]{0,120}?listenDone = true/.test(aif));
check('퀘스트 줄에 «자막 없이 듣기» 가 보인다', /id="qListen"/.test(aif) && /자막 없이 듣기/.test(aif));
check('퀘스트 완료 표시가 실제로 갱신된다', /getElementById\('qListen'\)\.classList\.toggle\('done'/.test(aif));

/* ═══════════════════════════════════════════════════════════
   ④ 잔소리 — 이모지·폰트 함정
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ④ 이모지·폰트 함정 ]');
const styleOf = (t) => (t.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n');
check('<style> 안에 CJK 홑낫표가 없다(한자 폰트 983KB 방지)',
  (styleOf(aif).match(/[「」『』]/g) || []).length === 0);
const mine = aif.split('\n').filter((l) => /(friend-card|help-btn|help-row|qListen|FRIENDS|HELP_ALWAYS|friendName)/.test(l)).join('\n');
check('새로 넣은 친구/도움 UI 에 국기 이모지가 없다', !/[\u{1F1E6}-\u{1F1FF}]{2}/u.test(mine));

/* ═══════════════════════════════════════════════════════════
   ⑤ 역검증 — 기능을 도로 빼면 검사가 실패하는가
      (git HEAD 와 비교하지 않는다 — 커밋하는 순간 스스로 무너진다)
   ═══════════════════════════════════════════════════════════ */
console.log('\n[ ⑤ 역검증 — 기능을 도로 빼면 검사가 실패하는가 ]');

const strip = (t) => t.split('\n')
  .filter((l) => !/(FRIENDS|friendName|friend-card|friendCards|showFriendPicker|setFriend|syncFriendName|helpChipsFor|HELP_ALWAYS|helpRow|helpBtn|toggleHelp|helpPick|closeHelp|qListen|listen_bonus|listenDone|sub: currentSub)/.test(l))
  .join('\n');
const stripSrv = (t) => t.split('\n').filter((l) => !/(wantListen|listenUsed|ai_friend_listen|listen_bonus)/.test(l)).join('\n');

const core = (t) => [/const FRIENDS = \[/.test(t), /id="friendName"/.test(t), /function helpChipsFor/.test(t), /id="qListen"/.test(t), /sub: currentSub/.test(t)];
const coreSrv = (t) => [/wantListen/.test(t), /ai_friend_listen/.test(t)];

{
  const now = core(aif), before = core(strip(aif));
  check('화면: 지금은 핵심 5개가 모두 참이다', now.every(Boolean), now);
  check('화면: 기능을 빼면 핵심 5개가 모두 거짓이 된다', before.every((v) => v === false), before);
  const nowS = coreSrv(apiAi), beforeS = coreSrv(stripSrv(apiAi));
  check('서버: 지금은 2개가 모두 참이다', nowS.every(Boolean), nowS);
  check('서버: 기능을 빼면 2개가 모두 거짓이 된다', beforeS.every((v) => v === false), beforeS);
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
