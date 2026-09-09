/* AI 영어친구 — 모델이 다 실패했을 때 «답인 척» 하지 않는가.
 *
 * [왜 있나 — 2026-09-09 사장님 「아직도 아바타가 내 말을 이해못하고 이상한 주제로 질문해」]
 * 실측(D1 ai_friend_chats, guest_ce72c9…): 공룡 얘기 중이던 학생에게
 *   22:33:17 "Hey there! 🥭 Try writing one sentence in English about what you ate today!"
 *   22:33:37 "Hi! Tell me about your day in English!"
 * 이 나갔습니다. 둘 다 api-ai.ts 의 «모델이 다 실패했을 때» 고정 문구입니다.
 * 그 문구가 ⓐ ok:true 로 나가 화면이 Lily 말풍선으로 그리고 ⓑ TTS 로 읽히고
 * ⓒ ai_friend_chats 에 «AI 가 한 말» 로 저장됐습니다.
 * ⚠️ ⓒ 가 «실제로 다음 답을 끌었다» 는 관측된 것이 «아닙니다» — 그 세 턴은 정상답→폴백→폴백이라
 *    폴백이 저장된 뒤 모델이 답한 턴이 없었습니다. 다음 정상 턴을 위한 «예방» 입니다.
 *
 * ⚠️ «왜 모델이 실패했나» 는 이 검사의 대상이 아닙니다(Workers 로그가 정본).
 *    여기서 못 박는 것은 «실패했을 때 화면이 거짓말하지 않는가» 뿐입니다.
 */
import { readFileSync } from 'node:fs';

const SRV = readFileSync(new URL('../cloudflare-deploy/src/api-ai.ts', import.meta.url), 'utf8');
const UI  = readFileSync(new URL('../cloudflare-deploy/public/ai-friend.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

/** 여는 중괄호부터 «짝이 맞는» 닫는 중괄호까지 잘라 냅니다.
 *  ⚠️ 길이(slice(i, i+N))로 자르면 옆 블록이 딸려 들어옵니다(CLAUDE.md 2장). */
function blockAt(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}

console.log('\n① 서버 — 폴백을 «밝히는가»');

const fbIdx = SRV.indexOf('all models failed, using fallback');
ok('폴백 블록이 있다', fbIdx > 0);

// 폴백을 감싸는 if 블록을 중괄호 짝으로 잘라 냅니다.
const ifIdx = SRV.lastIndexOf('if (!reply) {', fbIdx);
const fbBlock = ifIdx > 0 ? blockAt(SRV, SRV.indexOf('{', ifIdx)) : '';
ok('전제: 폴백 블록을 잘라 냈다', fbBlock.length > 50 && fbBlock.includes('all models failed'));
ok('폴백이면 표시를 켠다(usedFallback = true)',
   /usedFallback\s*=\s*true/.test(fbBlock));

ok('응답이 ai_unavailable 로 밝힌다',
   /ai_unavailable:\s*true/.test(SRV));
// ⚠️ «그 칸이 있는가» 가 아니라 «폴백일 때만 켜지는가» 로 묻습니다.
/* ⚠️ «식 모양» 을 글자 그대로 못 박지 않습니다 — `usedFallback && { … }` 로 바꾸는
   무해한 리팩터에 거짓 FAIL 이 납니다(CLAUDE.md 2장, 이 저장소가 여러 번 밟은 함정).
   그 자리를 «오려 내 실제로 평가» 해서 답으로 묻습니다. */
const spreadM = SRV.match(/\.\.\.\([^;]*?\busedFallback\b[^;]*?ai_unavailable[^;]*?\),/);
ok('전제: ai_unavailable 을 붙이는 식을 오려 냈다', !!spreadM);
if (spreadM) {
  const evalSpread = (uf) => {
    try { return new Function('usedFallback', 'return ({' + spreadM[0].replace(/,\s*$/, '') + '});')(uf); }
    catch (e) { return { __err: String(e) }; }
  };
  ok('폴백이면 ai_unavailable 이 켜진다', evalSpread(true).ai_unavailable === true,
     JSON.stringify(evalSpread(true)));
  ok('정상 답이면 그 칸이 아예 없다', !('ai_unavailable' in evalSpread(false)),
     JSON.stringify(evalSpread(false)));
}

// 교정 카드·따라말하기는 «AI 가 한 말» 이라는 전제 위에 있습니다.
ok('폴백이면 교정 카드를 안 보낸다', /fix:\s*[^,]*\busedFallback\b[^,]*\bnull\b/.test(SRV));
ok('폴백이면 따라말하기를 안 권한다', /repeat:\s*[^,}]*\busedFallback\b[^,}]*\bfalse\b/.test(SRV));

/* 🔴 표시를 «켜는» 곳만 보면 안 됩니다 — 폴백 블록 «뒤» 에 `usedFallback = false;` 한 줄만
   더해도 ai_unavailable·저장 가드·화면 분기가 «전부» 되돌아가는데, 위 검사들은 그대로 초록입니다
   (2026-09-09 함정 대조가 실제로 그 변이를 통과시켰습니다).
   ✅ 그래서 «false 를 대입하는 곳이 선언 한 줄뿐인가» 를 함께 못 박습니다. */
const falseAssign = (SRV.match(/\busedFallback\s*=\s*false/g) || []).length;
ok('usedFallback 을 false 로 만드는 곳은 «선언» 한 줄뿐이다', falseAssign === 1,
   'false 대입 ' + falseAssign + '곳');
ok('전제: 선언이 let 이다', /let\s+usedFallback\s*=\s*false/.test(SRV));
const trueAssign = (SRV.match(/\busedFallback\s*=\s*true/g) || []).length;
ok('true 로 켜는 곳도 한 곳뿐이다', trueAssign === 1, 'true 대입 ' + trueAssign + '곳');

console.log('\n② 서버 — 폴백을 «기록에 안 남기는가»');

const insIdx = SRV.indexOf("INSERT INTO ai_friend_chats");
ok('전제: 저장 코드를 찾았다', insIdx > 0);
// user·assistant 두 INSERT 를 담은 try 블록만 잘라서 봅니다.
const tryIdx = SRV.lastIndexOf('try {', insIdx);
const saveBlock = tryIdx > 0 ? blockAt(SRV, SRV.indexOf('{', tryIdx)) : '';
ok('전제: 저장 블록을 잘라 냈다', saveBlock.includes("'user'") && saveBlock.includes("'assistant'"));

// assistant INSERT 가 «폴백이 아닐 때만» 도는가 — 위치로 묻습니다.
const guardIdx = saveBlock.indexOf('if (!usedFallback)');
const asstIdx  = saveBlock.indexOf("'assistant'");
const userIdx  = saveBlock.indexOf("'user'");
ok('assistant 저장에 폴백 가드가 있다', guardIdx > 0);
ok('가드가 assistant 저장 «앞» 이다', guardIdx > 0 && guardIdx < asstIdx);
// ⛔ 짝: 학생 발화까지 막으면 «말한 것» 이 사라집니다.
ok('학생 발화는 가드 밖이다(그대로 저장)', userIdx > 0 && (guardIdx < 0 || userIdx < guardIdx));

console.log('\n③ 화면 — 폴백을 «Lily 말» 로 그리지 않는가');

ok('화면이 ai_unavailable 을 본다', /d\.ai_unavailable/.test(UI));

const uiIdx = UI.indexOf('d.ai_unavailable');
const uiIf  = uiIdx > 0 ? UI.lastIndexOf('if (', uiIdx) : -1;
const uiBlock = uiIf > 0 ? blockAt(UI, UI.indexOf('{', uiIdx)) : '';
ok('전제: 그 분기 블록을 잘라 냈다', uiBlock.length > 40);
ok('그 분기가 안내 문구를 그린다', /답을 만들지 못했어요/.test(uiBlock));
// ⛔ 이 셋이 핵심 — 폴백을 «답» 으로 다루면 안 됩니다.
ok('그 분기는 교정 카드를 안 붙인다', !/showFixCard/.test(uiBlock));
ok('그 분기는 소리로 읽지 않는다', !/speakText/.test(uiBlock));
ok('그 분기는 고정 문구(d.reply)를 안 그린다', !/appendMsg\([^)]*d\.reply/.test(uiBlock));

/* 🚨 안내를 «말풍선»(appendMsg)으로 그리면 안 됩니다 — 본문이 .ai-text 안에 들어가
   ⓐ 자막 «가리기/끄기» 에서 흐려지거나 사라지고(하필 서버가 +1P 로 권하는 모드)
   ⓑ 🔊·뜻 버튼이 붙어 «영어 TTS 가 한국어를 읽습니다».
   2026-09-09 함정 대조가 실측으로 잡았습니다. */
ok('안내를 말풍선(appendMsg)으로 그리지 않는다', !/appendMsg\(/.test(uiBlock));
ok('안내는 전용 알림(appendNotice)으로 그린다', /appendNotice\(/.test(uiBlock));
ok('그 알림은 .ai-text 밖이다(자막 모드에 안 숨는다)',
   /function appendNotice[\s\S]*?className\s*=\s*'ai-notice'/.test(UI)
   && !/\.chat\[data-sub=[^\]]*\][^{]*\.ai-notice/.test(UI));
ok('그 알림에는 🔊·뜻 버튼이 없다',
   !/function appendNotice[\s\S]{0,600}?(replay-btn|mean-btn)/.test(UI));

// 짝 — 정상 답은 «여전히» 그려져야 합니다(안 그러면 «전부 안내로» 도 통과합니다).
// ⚠️ 정확일치로 찾으면 `d?.ok` 같은 무해한 정리에 거짓 FAIL 이 납니다 — 뜻으로 찾습니다.
const normIdx = UI.search(/\}\s*else\s+if\s*\([^)]*\breply\b[^)]*\)\s*\{/);
ok('짝: 정상 답 경로가 살아 있다', normIdx > uiIdx);
const normBlock = normIdx > 0 ? blockAt(UI, UI.indexOf('{', normIdx)) : '';
ok('짝: 정상 답은 교정 카드를 붙인다', /showFixCard/.test(normBlock));
ok('짝: 정상 답은 소리로 읽는다', /speakText/.test(normBlock));

// ⚠️ 맨이름 getLang 은 없을 때 ReferenceError (CLAUDE.md 2장).
ok('언어 판정을 맨이름 getLang 으로 하지 않는다',
   !/[^.\w]getLang\s*&&\s*getLang\(\)/.test(uiBlock));

console.log('\n결과: PASS ' + pass + ' · FAIL ' + fail);
if (fail) process.exit(1);
