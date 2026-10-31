/**
 * judgment_tts_harness.mjs — 판단력 훈련(judgment.html) 원어민 음성·무음 버튼 (2026-08-26)
 *
 * 왜 필요한가
 *   사장님 지시 「여기도 원어민 음성을 달아 줘. 듣기 연습도 같이 하게. 자연스러운 미국
 *   원어민 여성 음성으로. 무음버튼도.」 — 소리를 붙이는 화면에는 조용히 깨지는 자리가 넷 있다.
 *
 *   ① 보기(.opt)는 그 자체가 <button> 이다. 스피커를 <button> 으로 넣으면 HTML 파서가
 *      «바깥 버튼을 먼저 닫아» 보기 카드가 통째로 무너진다(에러는 안 난다).
 *   ② game-tts.js 는 defer 라 이 화면의 인라인 스크립트보다 **나중에** 온다. 그 사이에
 *      say() 가 불리면 조용히 아무 일도 안 일어난다 → «첫 문제만 소리가 없다».
 *   ③ 🌐 언어 토글이 renderQuestion/renderResult 를 다시 부른다. 조건 없이 자동 낭독하면
 *      언어를 누를 때마다 다시 읽는다(_autoSay 로 «막 도착했을 때» 만 읽는다).
 *   ④ 화자 이름은 Aura-2·Aura-1 «양쪽 목록에 다 있는» 것이어야 한다. 서버가 한 단계
 *      폴백할 때 목소리(성별)가 바뀌면 안 된다 — asteria 가 그 조건을 만족한다.
 *
 * ⚠️ 이 하니스가 못 보는 것: «순서»와 «좌표». 스피커를 눌렀을 때 답까지 골라지지 않는지,
 *    무음이 실제로 재생을 막는지는 브라우저로 재야 한다
 *    → test-harness/manual/judgment-tts-browser.mjs (사람이 직접 부른다)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy', 'public');
const html = readFileSync(join(PUB, 'judgment.html'), 'utf8');
const tts = readFileSync(join(PUB, 'js', 'game-tts.js'), 'utf8');

/** 부정 검사용 — 주석을 벗겨 낸 사본(설명 주석이 자기 검사에 걸리는 것 방지) */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
const bare = strip(html);

let pass = 0, fail = 0;
const ok = m => { pass++; console.log(`  ✅ ${m}`); };
const no = m => { fail++; console.log(`  ❌ ${m}`); };

console.log('judgment_tts_harness — 판단력 훈련 원어민 음성이 «들리는 자리» 에 있는가');

/* ── ① 공용 TTS 모듈을 싣는가 ─────────────────────────────────────────── */
if (/<script src="\/js\/game-tts\.js\?v=\d+" defer><\/script>/.test(html))
  ok('① 공용 원어민 TTS 모듈(game-tts.js)을 defer 로 싣는다');
else no('① game-tts.js 를 싣지 않는다 — 소리를 낼 방법이 없다');

/* ── ② 🔴 미국 원어민 «여성» — 폴백해도 목소리가 안 바뀌는 화자인가 ──── */
const spkCall = bare.match(/MangoiTTS\.setSpeaker\('([a-z]+)'\)/);
const speaker = spkCall && spkCall[1];
if (!speaker) no('② setSpeaker 를 안 부른다 — 서버 기본값에 맡기면 목소리가 언제든 바뀐다');
else {
  // 서버(api-games.ts)의 두 목록에 다 있는 이름이어야 Aura-2 → Aura-1 폴백에서 성별이 유지된다.
  const AURA2_FEMALE = ['amalthea','andromeda','asteria','athena','aurora','callista','cora','cordelia','delia','electra','harmonia','helena','hera','iris','juno','luna','minerva','ophelia','pandora','phoebe','thalia','theia','vesta'];
  const AURA1 = ['angus','asteria','arcas','orion','orpheus','athena','luna','zeus','perseus','helios','hera','stella'];
  if (AURA2_FEMALE.includes(speaker) && AURA1.includes(speaker))
    ok(`② 화자 '${speaker}' — Aura-2·Aura-1 양쪽에 있는 여성 화자(폴백해도 목소리가 안 바뀐다)`);
  else no(`② 화자 '${speaker}' 는 두 목록에 다 있는 여성 화자가 아니다 — 서버가 폴백하면 남자 목소리가 되거나 기본값으로 떨어진다`);
}
if (/MangoiTTS\.setLang\('en'\)/.test(bare)) ok('② 발음 언어를 en 으로 고정한다(보기·상황문이 영어다)');
else no('② setLang(\'en\') 이 없다 — 중국어 설정이 남은 기기에서 영어를 중국어 음성으로 읽는다');

/* ── ③ 🔴 스피커는 <button> 이 아니어야 한다 (보기 자체가 button) ────── */
const spkFn = bare.match(/function spk\(text, cls\)\{[\s\S]*?\n  \}/);
if (!spkFn) no('③ spk() 헬퍼가 없다 — 스피커 markup 의 단일 출처가 사라졌다');
else if (/<button/.test(spkFn[0]))
  no('③ 스피커를 <button> 으로 만든다 — 보기(.opt) 안에 들어가면 파서가 바깥 버튼을 먼저 닫아 카드가 무너진다');
else if (/<span class="spk/.test(spkFn[0]) && /role="button"/.test(spkFn[0]) && /tabindex="0"/.test(spkFn[0]))
  ok('③ 스피커는 <span role="button" tabindex="0"> 이다 (보기 버튼 안에서도 안전)');
else no('③ 스피커 markup 이 span+role=button 이 아니다');

/* ── ④ 상황문·보기·결과표에 스피커가 붙는가 ──────────────────────────── */
const spots = [
  [/spk\(scenario\.situation, 'sit-spk'\)/, '문제 화면 상황문'],
  [/'<\/span>'\+spk\(o\)\+'<\/button>'/, '문제·레벨찾기 보기'],
  [/spk\(plQ\.situation, 'sit-spk'\)/, '레벨 찾기 상황문'],
  [/spk\(o,'sm'\)/, '채점 결과 표현별 표'],
  [/spk\(d\.best_option,'sm'\)/, '가장 자연스러운 표현'],
];
const missing = spots.filter(([re]) => !re.test(bare)).map(([, n]) => n);
if (!missing.length) ok('④ 상황문·보기·결과표 다섯 자리에 모두 스피커가 붙는다');
else no(`④ 스피커가 빠진 자리: ${missing.join(', ')}`);

/* ── ⑤ 🔴 모듈이 늦게 와도 첫 문제를 읽어 주는가 ─────────────────────── */
if (/if\(!window\.MangoiTTS\)\{ _pending = /.test(bare) && /addEventListener\('DOMContentLoaded', flushPending\)/.test(bare))
  ok('⑤ 모듈이 아직 없으면 적어 뒀다가(_pending) 로드된 뒤 마저 읽는다 — 첫 문제만 무음이 되는 것 방지');
else no('⑤ 늦게 오는 game-tts.js 대비가 없다 — 서버가 문제를 즉시(캐시) 주면 첫 문제가 무음이 된다');

/* ── ⑥ 🔴 언어 토글 재렌더에는 다시 읽지 않는가 ──────────────────────── */
const autoGuards = (bare.match(/if\(_autoSay\)\{?\s*_autoSay = false;/g) || []).length;
const autoSets = (bare.match(/_autoSay = true;/g) || []).length;
if (autoGuards >= 3 && autoSets >= 4)
  ok(`⑥ 자동 낭독은 «막 도착했을 때» 만 (_autoSay 설정 ${autoSets}곳 / 소비 ${autoGuards}곳)`);
else no(`⑥ 자동 낭독 조건이 헐겁다 (_autoSay 설정 ${autoSets} / 소비 ${autoGuards}) — 🌐 를 누를 때마다 다시 읽는다`);

/* ── ⑦ 무음 버튼 — 아이콘 자리에 문장이 들어앉지 않는가 ─────────────── */
const muteTag = html.match(/<button id="muteBtn"[^>]*>/);
if (!muteTag) no('⑦ 무음 버튼(#muteBtn)이 없다');
else if (/data-(ko|en)=/.test(muteTag[0]))
  no('⑦ 무음 버튼에 data-ko/data-en 을 달았다 — i18n 엔진이 아이콘을 문장으로 갈아끼운다(CLAUDE.md 2장)');
else if (/aria-pressed/.test(muteTag[0])) ok('⑦ 무음 버튼은 아이콘만 — 뜻은 title·aria-label·aria-pressed 로 전달한다');
else no('⑦ 무음 버튼에 aria-pressed 가 없다');

if (/muteBtn\.title = lb;/.test(bare) && /applyMuteUI\(\);/.test(bare) && (bare.match(/applyMuteUI\(\)/g) || []).length >= 3)
  ok('⑦ 언어를 바꾸면 무음 버튼의 툴팁도 따라간다(applyStatic 에서 다시 그린다)');
else no('⑦ 언어 전환 때 무음 버튼 툴팁이 첫 언어로 굳는다');

/* ── ⑧ 무음이 «지금 소리를 낼 것인가» 한 값으로만 결정되는가 ──────────── */
if (/if\(MUTED\) return;/.test(bare) && /localStorage\.setItem\(MUTE_KEY/.test(bare) && /if\(MUTED\) sayStop\(\);/.test(bare))
  ok('⑧ 무음이면 새 재생을 막고, 켜는 즉시 나던 소리도 끊고, 다음 방문까지 기억한다');
else no('⑧ 무음 처리에 구멍이 있다(막기·끊기·기억 중 빠진 것)');

/* ── ⑨ 화면을 옮길 때 소리가 따라다니지 않는가 ───────────────────────── */
if (/function loading\(msg\)\{ sayStop\(\);/.test(bare) && /addEventListener\('pagehide', sayStop\)/.test(bare))
  ok('⑨ 채점·이동·뒤로가기에서 읽던 소리를 끊는다');
else no('⑨ 화면이 바뀌어도 이전 문장이 계속 읽힌다');

/* ── ⑩ 전제 확인 — 공용 모듈의 창구가 그대로인가 ─────────────────────── */
if (/window\.MangoiTTS = \{[^}]*speak:[^}]*prefetch:[^}]*setLang:[^}]*setSpeaker:[^}]*stop:/.test(tts))
  ok('⑩ 전제 확인 — game-tts.js 가 speak·prefetch·setLang·setSpeaker·stop 을 그대로 내보낸다');
else no('⑩ game-tts.js 의 창구가 바뀌었다 — 이 화면의 호출이 조용히 헛돈다(사람이 다시 읽을 것)');

/* ── ⑪ 🐢 읽기 속도 — 고른 속도가 «모든» 낭독에 붙는가 (2026-08-26) ────── */
//   「조금 빠르다」는 제보로 넣었다. 속도를 바꾸는 자리가 아니라 «쓰는 자리» 가 하나여야
//   「바꾼 그때만 느리고 다음 문장은 다시 빠른」 어긋남이 안 생긴다.
if (/MangoiTTS\.speak\(text, rate\(\)/.test(bare))
  ok('⑪ 낭독은 언제나 지금 고른 속도로 나간다(speak 에 rate() 를 넘긴다)');
else no('⑪ speak 에 고정 속도를 넘긴다 — 속도 버튼이 다음 문장부터 무시된다');

/* 눈금은 두 번 내려갔다: 0.75/0.9/1.0 → 0.6/0.75/0.9 (「0.75 도 빠르다」 2026-08-26).
   ⛔ 0.5 아래는 playbackRate 가 소리를 뭉갠다 — 더 느려야 하면 화자·엔진을 바꾸는 별건이다. */
const ratesLine = bare.match(/var RATES = \[([^\]]+)\]/);
const rateVals = ratesLine ? ratesLine[1].split(',').map(Number) : [];
if (rateVals.length === 3 && rateVals.every(v => v >= 0.5 && v <= 1) && rateVals[0] < rateVals[1] && rateVals[1] < rateVals[2])
  ok(`⑪ 세 단계로만, 느린 것부터 (${rateVals.join(' · ')}) — 폰에서 슬라이더보다 집기 쉽다`);
else no(`⑪ 속도 단계가 이상하다 (${ratesLine ? ratesLine[1] : '목록 없음'}) — 0.5~1.0 안에서 오름차순 세 개여야 한다`);

// 기본은 «제일 느린 단계». 두 번 연속 「빠르다」였으므로 아무것도 안 눌러도 느린 쪽에서 시작한다.
if (/return 0;\s*\/\/ 기본 = /.test(bare))
  ok('⑪ 기본은 제일 느린 단계 — 빠르게 듣고 싶으면 한 번 누르면 된다');
else no('⑪ 기본 속도가 바뀌었다 — 「빠르다」 제보로 내려 둔 값이니 사람이 정할 일이다');

if (/localStorage\.setItem\(RATE_KEY/.test(bare) && /localStorage\.getItem\(RATE_KEY\)/.test(bare))
  ok('⑪ 고른 속도를 기억한다(다음 방문에도)');
else no('⑪ 속도를 기억하지 않는다 — 올 때마다 다시 눌러야 한다');

const speedTag = html.match(/<button id="speedBtn"[^>]*>/);
if (!speedTag) no('⑪ 속도 버튼(#speedBtn)이 없다');
else if (/data-(ko|en)=/.test(speedTag[0]))
  no('⑪ 속도 버튼에 data-ko/data-en 을 달았다 — i18n 엔진이 글자를 통째로 갈아끼운다(CLAUDE.md 2장)');
else ok('⑪ 속도 버튼은 자기 글자를 스스로 그린다(엔진이 덮어쓰지 않는다)');

if ((bare.match(/applySpeedUI\(\)/g) || []).length >= 3 && /speedBtn\.textContent = ic \+ ' ' \+ speedLabel/.test(bare))
  ok('⑪ 지금 속도를 «글자로» 보여 주고, 언어를 바꾸면 함께 다시 그린다');
else no('⑪ 속도가 아이콘으로만 표시되거나 언어 전환 때 굳는다');

console.log(`\n${fail === 0 ? '✅' : '🚨'} judgment_tts_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
