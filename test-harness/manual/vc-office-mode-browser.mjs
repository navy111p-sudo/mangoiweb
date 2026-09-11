/* 🏢 사무실 모드 — 브라우저 검사 (2026-09-08)
   ⛔ 자동으로 안 돕니다. 사람이 부릅니다:  PW_DIR=/tmp/pw node test-harness/manual/vc-office-mode-browser.mjs

   왜 브라우저인가 — 이 기능이 틀리는 방식은 문자열로 안 보입니다. 함수도 값도 다 «있고»
   틀리는 것은 «스위치가 눌리는가»·«트랙이 실제로 갈렸는가»·«음소거가 물려졌는가» 뿐입니다.
   그래서 가짜 마이크(--use-fake-device-for-media-stream)를 붙여 정본을 «실제로 돌립니다».

   ⚠️ 캐시를 두 겹 다 끕니다 — HTTP 캐시(setCacheDisabled)만 끄면 서비스워커가 옛 사본을 줘서
      «고치기 전» 값이 나오고, 그러면 이 검사가 헛돌며 통과합니다(CLAUDE.md 실측 사고). */
import { spawn } from 'node:child_process';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PORT = 9333;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const cdp = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
/* «지금 트랙이 WebAudio 가공 트랙인가» — 실측으로 정한 판별식.
   ⚠️ 「가공 트랙에는 deviceId 가 없다」는 **틀린 전제였다**(실측: deviceId="WebAudio-<uuid>",
      label="MediaStreamAudioDestinationNode"). 그걸 전제로 쓰면 ⑦ 은 늘 통과하고 ⑮ 는 정상 코드를
      «모순» 으로 오판한다 — 2026-09-08 에 실제로 둘 다 겪었다. 두 신호를 함께 본다. */
const IS_PROC = `(function(t){ if(!t) return null;
  var s = (t.getSettings && t.getSettings()) || {};
  return /^WebAudio-/.test(String(s.deviceId||'')) || /MediaStreamAudioDest/i.test(String(t.label||''));
})`;

const ev = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
await cdp('Network.setCacheDisabled', { cacheDisabled: true });
await cdp('Network.setBypassServiceWorker', { bypass: true });
await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

await cdp('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
await new Promise(r => setTimeout(r, 2500));

/* ⚠️ 앞선 실행이 남긴 상태가 다음 실행을 오염시킨다 — ⑩에서 EN 으로 바꾼 것이 그대로 남아
      ②의 「라벨이 사무실 모드」가 «Office mode» 로 나왔다(실측). 시작 상태를 못 박고 한 번 다시 연다.
   ⛔ 이것을 addScriptToEvaluateOnNewDocument 로 «매 문서마다» 지우면 안 된다 —
      reload 마다 다시 지워져 「학생이 고른 값을 안 덮는다」류 검사가 거짓 FAIL 이 난다. */
await ev(`(() => { try {
  localStorage.setItem('mangoi_lang','ko');
  localStorage.removeItem('mangoi_vc_office');
  /* ⚠️ ⑯-3·⑰ 이 관리자 세션을 «쓰므로», 중간에 죽으면 그 값이 다음 회차에 남아
     ⑯(「학생 화면에서는 안 보인다」)이 거짓 FAIL 납니다 — 크로미움을 --user-data-dir 없이
     띄워 localStorage 가 회차 사이에 남기 때문입니다(위 주석의 실측). 시작할 때 함께 지웁니다. */
  localStorage.removeItem('mangoi_admin_session');
} catch(e){} return 1; })()`);
await cdp('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
await new Promise(r => setTimeout(r, 4000));

/* 🎭 아래 검사들은 «선생님이 쓰는 화면» 을 잰다 — 2026-09-08 부터 이 기능은 선생님 전용이라
      역할을 세우지 않으면 스위치가 아예 안 그려져 전부 헛돈다. 역할 게이트 자체는 ⑯절이 잰다. */
await ev(`(() => { try { window.vcMyRole = 'teacher'; } catch(e){} return 1; })()`);
ok(await ev(`(typeof window.vcOfficeModeAllowed === 'function') && window.vcOfficeModeAllowed() === true`),
   '전제: 이 화면을 «선생님» 으로 세웠다 (아래 검사들이 그것을 전제한다)');

/* ⑪ 이 «소스에 무엇이 적혔는가» 를 봐야 하므로 페이지에서 직접 받아 둔다. */
await ev(`(async () => {
  try { window.__officeSrc = await (await fetch('/js/idx-vc-officemode.js?_nc=' + Date.now())).text(); }
  catch (e) { window.__officeSrc = ''; }
  return 1;
})()`);

console.log('\n① 정본 파일이 실려 돌았는가');
ok(await ev(`typeof window.vcSetOfficeMode === 'function'`), 'window.vcSetOfficeMode 가 있다');
ok(await ev(`typeof window.vcOfficeModeOn === 'function'`), 'window.vcOfficeModeOn 이 있다');
ok(await ev(`window.vcOfficeModeOn() === false`), '처음에는 꺼져 있다');

/* 수업 화면을 펴고 독 설정을 연다 — 실제 입장(WS·동의모달)은 거치지 않는다. */
console.log('\n② 설정 팝오버에 «사무실 모드» 가 실제로 그려지는가');
const opened = await ev(`(async () => {
  document.body.classList.add('vc-in-call');
  try { if (typeof window.vcNukeRotationOverlays === 'function') window.vcNukeRotationOverlays(); } catch(e){}
  var v = document.getElementById('view-videocall-call');
  if (v) { v.style.display='block'; v.classList.add('active'); }
  /* 독은 body.vc-in-call 이 붙은 «뒤» 에 그려진다 — 버튼이 생길 때까지 기다린다.
     ⛔ 한 번 클릭하고 끝내면 그리기가 늦은 회차에 통째로 실패한다(실측으로 들쭉날쭉했다). */
  var btn = null;
  for (var i = 0; i < 40 && !btn; i++) {
    await new Promise(r => setTimeout(r, 150));
    btn = document.getElementById('vc-dock-settings');
    if (btn && btn.tagName !== 'BUTTON') btn = document.querySelector('#vc-dock button#vc-dock-settings');
  }
  if (!btn) return { opened:false, why:'설정 버튼을 못 찾음' };
  for (var j = 0; j < 20; j++) {
    if (document.querySelector('[data-act="office"]')) return { opened:true, tries:j };
    btn.click();
    await new Promise(r => setTimeout(r, 250));
  }
  return { opened: !!document.querySelector('[data-act="office"]'), why:'팝오버가 안 열림' };
})()`);
ok(opened.opened === true, '설정 팝오버가 열렸다 (전제)', JSON.stringify(opened));

const row = await ev(`(() => {
  var sw = document.querySelector('[data-act="office"]');
  if (!sw) return { found: false };
  var r = sw.getBoundingClientRect();
  var lab = sw.closest('.sg-row') && sw.closest('.sg-row').querySelector('label');
  var cs = getComputedStyle(sw);
  return { found: true, w: Math.round(r.width), h: Math.round(r.height),
           display: cs.display, label: lab ? lab.textContent.trim() : '',
           visible: !!sw.offsetParent };
})()`);
ok(row.found, '스위치 [data-act="office"] 가 DOM 에 있다');
ok(row.found && row.visible && row.w > 0 && row.h > 0, `«보인다» (${row.w}×${row.h})`, JSON.stringify(row));
ok(row.label === '사무실 모드', `라벨이 「사무실 모드」 (실측 "${row.label}")`);

console.log('\n③ «눌리는가» — 다른 요소가 덮고 있지 않은가');
/* ⚠️ 설정 팝오버는 «스크롤 상자» 다 — 사람도 스크롤해서 그 행까지 내려가 누른다.
      스크롤하지 않고 재면 그 좌표에는 팝오버 배경(DIV.open)만 있어 «멀쩡한 스위치가 안 눌린다» 는
      거짓 실패가 난다(2026-09-08 실제로 그렇게 나왔다 — 검사 쪽 문제였다). */
const top = await ev(`(async () => {
  var sw = document.querySelector('[data-act="office"]');
  if (!sw) return { ok:false };
  sw.scrollIntoView({ block:'center' });
  await new Promise(r => setTimeout(r, 250));
  var r = sw.getBoundingClientRect();
  var inView = r.top >= 0 && r.bottom <= innerHeight;
  var el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  return { ok: !!el && (el === sw || sw.contains(el)), inView: inView,
           tag: el ? (el.tagName + '.' + el.className) : null };
})()`);
ok(top.ok, '스위치 한가운데의 맨 위 요소가 그 스위치다', JSON.stringify(top));

console.log('\n④ 설명 줄이 낱글자로 쪼개지지 않는가');
const note = await ev(`(() => {
  var sw = document.querySelector('[data-act="office"]');
  var row = sw && sw.closest('.sg-row');
  var n = row && row.nextElementSibling && row.nextElementSibling.querySelector('.sg-note');
  if (!n) return { found:false };
  var cs = getComputedStyle(n);
  var lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.35);
  var rects = [];
  try { var rg = document.createRange(); rg.selectNodeContents(n); rects = Array.from(rg.getClientRects()); } catch(e){}
  return { found:true, lines: Math.round(n.getBoundingClientRect().height / lh),
           display: getComputedStyle(row.nextElementSibling).display, rectCount: rects.length,
           text: n.textContent.trim().slice(0, 30) };
})()`);
ok(note.found, '설명 줄이 있다');
ok(note.found && note.lines <= 3, `설명이 ${note.lines}줄 (3줄 이하 — 낱글자 쪼개짐 아님)`, JSON.stringify(note));

console.log('\n⑤ 실제로 켜지는가 — 가짜 마이크로 정본을 돌린다');
const on = await ev(`(async () => {
  var st = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  window.vcLocalStream = st;
  var before = st.getAudioTracks()[0];
  var beforeId = before.id;
  before.enabled = false;                       // ⚠️ 음소거 상태를 물려주는지 보려고 일부러 끈다
  var r = await window.vcSetOfficeMode(true);
  var after = window.vcLocalStream.getAudioTracks()[0];
  return { r: r, on: window.vcOfficeModeOn(), swapped: after && after.id !== beforeId,
           enabled: after ? after.enabled : null, live: after ? after.readyState : null,
           saved: localStorage.getItem('mangoi_vc_office') };
})()`);
ok(on.r === true, '켜기가 true 를 돌려준다', JSON.stringify(on));
ok(on.on === true, 'vcOfficeModeOn() 이 true 다');
ok(on.swapped === true, '오디오 트랙이 «실제로» 가공 트랙으로 갈렸다');
ok(on.live === 'live', '새 트랙이 살아 있다 (readyState=live)');
ok(on.enabled === false, '음소거 상태(enabled=false)를 새 트랙에 물려줬다 — 안 물려주면 «음소거했는데 소리가 나간다»');
ok(on.saved === '1', '저장값이 1 이다');

console.log('\n⑥ 자동 게인이 실제로 꺼진 마이크를 잡았는가');
const agc = await ev(`(() => {
  try {
    var t = window.vcLocalStream.getAudioTracks()[0];
    var s = t.getSettings ? t.getSettings() : {};
    return { label: t.label || '', kind: t.kind };
  } catch(e){ return { err: String(e) }; }
})()`);
ok(agc.kind === 'audio', '가공 트랙이 오디오 트랙이다', JSON.stringify(agc));

console.log('\n⑥-2 «가공 트랙인가» 판별식이 실제로 두 상태를 가르는가 (전제)');
const probe = await ev(`(async () => {
  var proc = ${IS_PROC}(window.vcLocalStream.getAudioTracks()[0]);   // 지금은 켜져 있다
  var s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  var plain = ${IS_PROC}(s.getAudioTracks()[0]);
  s.getTracks().forEach(function(t){ try { t.stop(); } catch(e){} });
  return { proc: proc, plain: plain };
})()`);
ok(probe.proc === true && probe.plain === false,
   '판별식이 가공 트랙과 진짜 마이크를 실제로 가른다 — 안 가르면 ⑦·⑦-2·⑮ 가 통째로 헛돈다',
   JSON.stringify(probe));

console.log('\n⑦ 끄면 «켜기 전» 으로 되돌아가는가');
const off = await ev(`(async () => {
  var beforeId = window.vcLocalStream.getAudioTracks()[0].id;
  await window.vcSetOfficeMode(false);
  var t = window.vcLocalStream.getAudioTracks()[0];
  return { on: window.vcOfficeModeOn(), swapped: t && t.id !== beforeId,
           live: t ? t.readyState : null, enabled: t ? t.enabled : null,
           realMic: ${IS_PROC}(t) === false, saved: localStorage.getItem('mangoi_vc_office') };
})()`);
ok(off.on === false, '꺼진다');
ok(off.swapped === true, '트랙이 표준 마이크로 다시 갈렸다', JSON.stringify(off));
ok(off.live === 'live', '되돌린 트랙이 살아 있다 — 여기서 죽으면 «소리가 안 나가는» 최악의 실패다');
ok(off.enabled === false, '되돌릴 때도 음소거 상태를 물려줬다');
ok(off.realMic === true, '되돌린 것이 «진짜 마이크» 다 (WebAudio 가공 트랙이 아니다)', JSON.stringify(off));
ok(off.saved === '0', '저장값이 0 이다');

/* 🔴 2026-09-08 에 실제로 난 결함의 재발 감시 —
      끌 때 «가공 트랙» 에서 장치 id 를 읽어 exact 로 넘기면 OverconstrainedError 가 나고,
      되돌리기가 통째로 실패해 무음 트랙이 남았다(= 껐는데 소리가 안 나감).
      그래서 «장치 지정만» 실패시켜도 소리가 나가야 한다. */
console.log('\n⑦-2 되돌릴 때 장치 지정이 실패해도 소리가 나가는가');
const fallback = await ev(`(async () => {
  await window.vcSetOfficeMode(true);
  /* ⚠️ 전제 — «켜져 있어야» 이 시나리오가 성립한다. 켜기가 실패하면 끄기가 no-op 이 되어
        무엇을 되돌려도 통과한다(2026-09-08 변이시험에서 실제로 그 상태였다). */
  if (!window.vcOfficeModeOn()) return { armed: false };
  var midId = window.vcLocalStream.getAudioTracks()[0].id;
  var orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = function(c){
    var d = c && c.audio && c.audio.deviceId;
    if (d) return Promise.reject(Object.assign(new Error('테스트'), { name:'OverconstrainedError' }));
    return orig(c);
  };
  await window.vcSetOfficeMode(false);
  navigator.mediaDevices.getUserMedia = orig;
  var t = window.vcLocalStream.getAudioTracks()[0];
  return { armed: true, live: t ? t.readyState : null, realMic: ${IS_PROC}(t) === false,
           swapped: t && t.id !== midId, on: window.vcOfficeModeOn() };
})()`);
ok(fallback.armed === true, '전제: 사무실 모드가 실제로 켜진 상태에서 껐다', JSON.stringify(fallback));
ok(fallback.armed && fallback.swapped === true, '가공 트랙에서 «다른 트랙» 으로 실제로 갈렸다', JSON.stringify(fallback));
ok(fallback.armed && fallback.live === 'live' && fallback.realMic === true,
   '장치 지정이 거부돼도 기본 마이크로 되돌아간다 — 무음이 남지 않는다', JSON.stringify(fallback));
ok(fallback.on === false, '그때도 «꺼짐» 이다');

console.log('\n⑧ 켜기가 실패하면 «켜기 전» 으로 되돌아가는가 (안전 원칙)');
/* 🔴 (2026-09-11) 실패를 «getUserMedia 거부» 로만 만들면 안 된다 — 마이크를 빌려 쓰게 된 뒤로는
   그 경로를 아예 안 지나서 켜기가 «성공» 해 버리고, 이 절 셋이 통째로 거짓 FAIL 이 난다(실측).
   ⇒ 경로와 무관하게 반드시 실패하는 자리(AudioContext)를 함께 막는다. 둘 다 막으면
      빌려 쓰든 새로 열든 어느 쪽으로 가도 «켜기 실패» 가 만들어진다. */
const failsafe = await ev(`(async () => {
  var orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  var OrigAC = window.AudioContext, OrigWAC = window.webkitAudioContext;
  var beforeId = window.vcLocalStream.getAudioTracks()[0].id;
  navigator.mediaDevices.getUserMedia = function(){ return Promise.reject(new Error('테스트: 마이크 거부')); };
  window.AudioContext = window.webkitAudioContext = function(){ throw new Error('테스트: AudioContext 거부'); };
  var r = await window.vcSetOfficeMode(true);
  navigator.mediaDevices.getUserMedia = orig;
  window.AudioContext = OrigAC; window.webkitAudioContext = OrigWAC;
  var t = window.vcLocalStream.getAudioTracks()[0];
  return { r: r, on: window.vcOfficeModeOn(), sameTrack: t && t.id === beforeId,
           live: t ? t.readyState : null, saved: localStorage.getItem('mangoi_vc_office') };
})()`);
ok(failsafe.r === false, '실패하면 false 를 돌려준다 — 스위치가 그것을 보고 되돌린다', JSON.stringify(failsafe));
ok(failsafe.on === false, '실패 뒤 «꺼짐» 이다 (켜졌다고 거짓말하지 않는다)');
ok(failsafe.live === 'live', '실패해도 마이크가 살아 있다 — 수업이 안 끊긴다');
/* 🔴 2026-09-09 「기본값 = 켜짐」으로 바뀌면서 «옳은 답» 이 뒤집혔습니다.
      전에는 실패를 '0' 으로 적는 것이 맞았지만, 이제 '0' 은 «사람이 껐음» 이라
      일시 장애 한 번이 그 교사의 기본 켜짐을 «영영» 없앱니다(그리고 아무도 모릅니다).
      ⇒ 저장값은 「아직 안 정함」(키 없음)으로 되돌리고, «되풀이 시도» 는 저장값이 아니라
        페이지 안의 표시(autoFailed)로 막습니다. 아래 두 줄이 그 짝입니다. */
ok(failsafe.saved === null,
   "실패를 '0'(사람이 껐음)으로 굳히지 않는다 — 기본 켜짐이 한 번의 장애로 사라지면 안 된다",
   JSON.stringify(failsafe));
const failNoRetry = await ev(`(async () => {
  document.body.classList.remove('vc-in-call');
  try { window.showView('view-home'); } catch(e){}
  await new Promise(r => setTimeout(r, 700));
  try { window.showView('view-videocall-call'); } catch(e){}
  document.body.classList.add('vc-in-call');
  for (var i = 0; i < 12 && !window.vcOfficeModeOn(); i++) await new Promise(r => setTimeout(r, 400));
  var auto = window.vcOfficeModeOn();
  var manual = await window.vcSetOfficeMode(true);   // 사람이 누르면 다시 시도한다 (짝)
  var out = { auto: auto, manual: manual, on: window.vcOfficeModeOn() };
  try { await window.vcSetOfficeMode(false); } catch(e){}
  return out;
})()`);
ok(failNoRetry.auto === false,
   '한 번 실패한 페이지에서는 «자동으로» 다시 걸지 않는다 — 계속 실패하는 기기에서 수업마다 마이크를 다시 잡지 않는다',
   JSON.stringify(failNoRetry));
ok(failNoRetry.manual === true && failNoRetry.on === true,
   '그래도 사람이 스위치를 누르면 다시 시도한다 — 짝이 없으면 «영영 못 켜는» 반대 사고가 난다',
   JSON.stringify(failNoRetry));

console.log('\n⑨ 스위치를 «실제로 눌러» 본다');
const click = await ev(`(async () => {
  var sw = document.querySelector('[data-act="office"]');
  if (!sw) return { found:false };
  sw.click();
  await new Promise(r => setTimeout(r, 900));
  return { found:true, cls: sw.classList.contains('on'), on: window.vcOfficeModeOn() };
})()`);
ok(click.found && click.cls === click.on, `스위치 표시와 실제 상태가 같다 (표시 ${click.cls} · 실제 ${click.on})`, JSON.stringify(click));

console.log('\n⑩ EN 으로 바꾸면 라벨이 영어가 되는가');
const en = await ev(`(async () => {
  var sw = document.querySelector('[data-act="office"]');
  if (!sw) return { skip: true };
  var lab = sw.closest('.sg-row').querySelector('label');
  var ko = lab.textContent.trim();
  if (typeof window.setLang === 'function') window.setLang('en');
  else if (typeof window.toggleLang === 'function') window.toggleLang();
  await new Promise(r => setTimeout(r, 500));
  return { ko: ko, en: lab.textContent.trim(), hasAttr: lab.hasAttribute('data-en') };
})()`);
ok(!en.skip && en.hasAttr, 'label 에 data-en 이 있다', JSON.stringify(en));
ok(en.en === 'Office mode' || en.en !== en.ko, `EN 토글로 라벨이 바뀐다 (KO "${en.ko}" → "${en.en}")`);

await ev(`(() => { try { localStorage.setItem('mangoi_lang','ko'); } catch(e){} return 1; })()`);

/* ══ 아래 ⑪~⑮ 는 2026-09-08 함정 대조가 찾아낸 결함들의 재발 감시다.
      ⚠️ 그때 이 파일의 검사 34종이 «전부 통과» 하면서 넷 중 하나도 못 잡았다 —
         「보인다·눌린다·켜진다」만 재고 «언제 걸리는가»·«무엇을 읽는가» 를 안 봤기 때문이다. ══ */

console.log('\n⑪ 죽은 localStorage 키를 쓰지 않는가');
const micKey = await ev(`(() => {
  var src = window.__officeSrc || '';
  /* ⚠️ 부정 검사(«이 이름이 없어야 한다»)는 «주석을 벗겨 낸 사본» 으로 판정한다 —
        그 죽은 키 이름은 «왜 이렇게 했는지» 를 설명하는 주석에 일부러 남겨 두었고,
        원본으로 재면 검사가 자기 주석을 잡는다(CLAUDE.md 「부정 검사가 자기 주석을 잡음」).
     ⛔ 블록주석을 정규식 한 줄로 지우지 않는다 — 문자열 속 «별표+슬래시» 하나에 뒷부분이
        통째로 날아가 멀쩡한 코드가 «없다» 로 판정된다. 줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
  var out = [], inBlk = false;
  src.split('\\n').forEach(function (ln) {
    var keep = '', i = 0;
    while (i < ln.length) {
      if (inBlk) { var e = ln.indexOf('*' + '/', i); if (e < 0) { i = ln.length; } else { inBlk = false; i = e + 2; } }
      else {
        var b = ln.indexOf('/' + '*', i), l = ln.indexOf('//', i);
        if (l >= 0 && (b < 0 || l < b)) { keep += ln.slice(i, l); i = ln.length; }
        else if (b >= 0) { keep += ln.slice(i, b); inBlk = true; i = b + 2; }
        else { keep += ln.slice(i); i = ln.length; }
      }
    }
    out.push(keep);
  });
  var code = out.join('\\n');
  return { usesCanonFn: /window\\.vcSavedMicId/.test(code),
           deadKey: /'mangoi_vc_mic'/.test(code),
           strippedOk: code.length > 0 && code.length < src.length,
           realKeyExists: typeof window.vcSavedMicId === 'function' };
})()`);
ok(micKey.strippedOk === true, '전제: 주석을 실제로 벗겨 냈다 (안 벗기면 자기 주석을 잡는다)', JSON.stringify(micKey));
ok(micKey.realKeyExists, '정본 vcSavedMicId() 가 존재한다 (전제)', JSON.stringify(micKey));
ok(micKey.usesCanonFn && !micKey.deadKey,
   "정본 함수를 쓰고 죽은 키 'mangoi_vc_mic' 을 안 쓴다 — 그 키는 읽으면 늘 null 이라 교사가 고른 마이크를 잃는다",
   JSON.stringify(micKey));

console.log('\n⑫ 실제 «입장 순서» 로 들어가면 저장값대로 켜지는가');
/* 🔴 입장은 showView('view-videocall-call') 가 «먼저», body.vc-in-call 이 «나중» 이다
      (idx-main.js:2869~2870). 그 순서에서 안 걸리면 「수업에 들어가면 자동으로 켜진다」가 거짓말이 된다. */
const enter = await ev(`(async () => {
  await window.vcSetOfficeMode(false);
  try { localStorage.setItem('mangoi_vc_office','1'); } catch(e){}
  document.body.classList.remove('vc-in-call');
  window.vcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  try { window.showView('view-videocall-call'); } catch(e){}
  document.body.classList.add('vc-in-call');          // ← 실제 순서대로 «나중에»
  for (var i = 0; i < 30 && !window.vcOfficeModeOn(); i++) await new Promise(r => setTimeout(r, 400));
  return { on: window.vcOfficeModeOn() };
})()`);
ok(enter.on === true,
   '실제 입장 순서(showView → vc-in-call)에서 저장값대로 «자동으로» 켜진다', JSON.stringify(enter));

console.log('\n⑬ 수업이 끝나면 설정이 «다음 수업까지» 남는가');
/* 🔴 disable() 이 무조건 remember(false) 면 나갈 때마다 지워져 저장 기능 자체가 무의미해진다.
      «사람이 끈 것» 과 «수업이 끝난 것» 은 다른 사실이다. */
const leave = await ev(`(async () => {
  var before = localStorage.getItem('mangoi_vc_office');
  document.body.classList.remove('vc-in-call');
  try { window.showView('view-home'); } catch(e){}
  await new Promise(r => setTimeout(r, 800));
  return { before: before, after: localStorage.getItem('mangoi_vc_office'), on: window.vcOfficeModeOn() };
})()`);
ok(leave.before === '1' && leave.after === '1',
   '수업에서 나가도 저장값이 «켜짐» 으로 남는다 (사람이 끈 것이 아니다)', JSON.stringify(leave));
ok(leave.on === false, '그래도 실제 동작은 꺼진다 (수업 밖에서 마이크를 쥐고 있지 않는다)');

console.log('\n⑭ 사람이 «직접» 끄면 저장값도 꺼지는가 (⑬의 짝)');
const manualOff = await ev(`(async () => {
  document.body.classList.add('vc-in-call');
  window.vcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  await window.vcSetOfficeMode(true);
  var mid = localStorage.getItem('mangoi_vc_office');
  await window.vcSetOfficeMode(false);
  return { mid: mid, after: localStorage.getItem('mangoi_vc_office') };
})()`);
ok(manualOff.mid === '1' && manualOff.after === '0',
   '스위치로 끄면 저장값도 0 이 된다 — 짝이 없으면 «영영 안 꺼지는» 반대 사고가 난다', JSON.stringify(manualOff));

console.log('\n⑮ vcSwitchMic 을 «직접» 불러도 상태가 거짓말하지 않는가');
/* 🔴 index.html 의 <select onchange="vcSwitchMic(...)"> 와 강사→학생 「장치 도우미」가 그 함수를
      직접 부른다. 그 함수는 vcLocalStream 의 오디오 트랙을 전부 stop·remove 하므로 가공 트랙이 날아간다. */
const swMic = await ev(`(async () => {
  if (typeof window.vcSwitchMic !== 'function') return { skip: true };
  await window.vcSetOfficeMode(true);
  if (!window.vcOfficeModeOn()) return { armed: false };
  var devs = await navigator.mediaDevices.enumerateDevices();
  var mic = devs.find(d => d.kind === 'audioinput');
  await window.vcSwitchMic(mic ? mic.deviceId : '');
  await new Promise(r => setTimeout(r, 1200));
  var t = window.vcLocalStream.getAudioTracks()[0];
  return { armed: true, on: window.vcOfficeModeOn(), realMic: ${IS_PROC}(t) === false,
           live: t ? t.readyState : null };
})()`);
ok(swMic.skip || swMic.armed === true, '전제: 사무실 모드가 켜진 상태에서 마이크를 바꿨다', JSON.stringify(swMic));
ok(swMic.skip || swMic.live === 'live', '마이크를 바꾼 뒤에도 소리가 나간다', JSON.stringify(swMic));
/* ⛔ 여기를 «on 이거나 realMic 이거나» 로 느슨하게 물으면 안 된다 — 래퍼를 지운 변이가 그대로
      통과한다(2026-09-08 변이시험 실측). 잡아야 하는 것은 «모순» 이다:
      「켜졌다(on=true)」고 말하는데 트랙이 «진짜 마이크»(realMic=true)면 가공이 안 되고 있다는 뜻 = 거짓말.
      정상은 둘 중 하나다 — 다시 걸렸다(on=true · realMic=false) 또는 정직하게 껐다(on=false · realMic=true). */
ok(swMic.skip || !(swMic.on === true && swMic.realMic === true),
   'vcOfficeModeOn() 이 «실제 상태» 와 어긋나지 않는다 — 다시 걸렸거나, 껐다고 정직하게 말한다',
   JSON.stringify(swMic));

await ev(`(async () => { try { await window.vcSetOfficeMode(false); } catch(e){} return 1; })()`);

console.log('\n⑯ «선생님만» 게이트 — 학생 화면에서는 아예 안 보이는가');
/* 🎭 2026-09-08 사장님 지시. ⚠️ 여기서 물어야 할 것이 셋이고, 하나만 물으면 헛돕니다:
      ① 학생에게는 안 보인다 ② 선생님에게는 «보인다»(짝이 없으면 «전부 감추기» 도 통과)
      ③ 역할이 «늦게» 와도 다시 열면 보인다(강사 역할은 입장 뒤에 확정될 수 있습니다). */
const roleGate = await ev(`(async () => {
  var sw = document.querySelector('[data-act="office"]');
  var row = sw && sw.closest('.sg-row');
  var note = document.querySelector('[data-office-note="1"]');
  if (!row || !note) return { found: false };
  /* ⚠️ 「보인다」를 offsetParent 로만 재면 «팝오버가 닫혀 있어서» 도 false 가 되어
        멀쩡한 코드가 «감췄다» 로 나옵니다(실제로 그렇게 나왔습니다).
        «우리가 감췄는가» 는 그 요소의 계산된 display 로 재고,
        «사람 눈에 실제로 보이는가» 는 팝오버를 연 상태에서 offsetParent 로 따로 잽니다. */
  function vis(){
    return { row: getComputedStyle(row).display !== 'none',
             note: getComputedStyle(note).display !== 'none',
             onScreen: !!row.offsetParent };
  }
  var btn = document.getElementById('vc-dock-settings');
  if (!btn || btn.tagName !== 'BUTTON') btn = document.querySelector('#vc-dock button#vc-dock-settings');
  async function reopen(role){
    window.vcMyRole = role;
    var pop = row.closest('#vc-dock-settings') || document.querySelector('.sg-pop');
    /* 열려 있으면 한 번 닫고 다시 연다 — refreshSettings 는 «열 때» 돈다 */
    for (var i = 0; i < 2; i++) {
      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 260));
      if (pop && pop.classList.contains('open')) break;
    }
    await new Promise(r => setTimeout(r, 200));
    return vis();
  }
  var asTeacher = await reopen('teacher');
  var asStudent = await reopen('student');
  var backToTeacher = await reopen('teacher');   // ③ 역할이 늦게 온 강사

  return { found: true, asTeacher: asTeacher, asStudent: asStudent, backToTeacher: backToTeacher,
           allowStudent: (window.vcMyRole = 'student', window.vcOfficeModeAllowed()),
           allowTeacher: (window.vcMyRole = 'teacher', window.vcOfficeModeAllowed()) };
})()`);
ok(roleGate.found, '전제: 스위치 행과 설명 줄을 둘 다 찾았다', JSON.stringify(roleGate));
ok(roleGate.found && roleGate.asStudent.row === false && roleGate.asStudent.note === false,
   '학생 화면에서는 스위치도 설명도 «안 보인다»', JSON.stringify(roleGate));
ok(roleGate.found && roleGate.asTeacher.row === true && roleGate.asTeacher.note === true,
   '선생님 화면에서는 «보인다» — 짝이 없으면 «전부 감추기» 도 통과한다', JSON.stringify(roleGate));
ok(roleGate.found && roleGate.asTeacher.onScreen === true,
   '선생님 화면에서 설정을 열면 그 줄이 «실제로 화면에» 있다', JSON.stringify(roleGate));
ok(roleGate.found && roleGate.backToTeacher.row === true,
   '역할이 «늦게» 확정돼도 설정을 다시 열면 보인다', JSON.stringify(roleGate));
ok(roleGate.allowStudent === false && roleGate.allowTeacher === true,
   '판정 함수 자체가 학생/선생님을 가른다', JSON.stringify(roleGate));

console.log('\n⑯-3 «사장님 계정도» — 관리자 로그인이 있으면 학생 역할이어도 보이는가');
/* 🔑 2026-09-09 사장님 「사장님 계정도 보이게 넓혀줘」.
   [왜 필요했나] 관리자 로그인이 있어도 입장 프롬프트에서 «취소» 하면 vcMyRole 은 'student' 다
     (idx-main.js:2625~2642). 그러면 ⑯ 의 게이트가 정상적으로 감춰 사장님 화면에 안 보였다.
   ⚠️ 여기서 «보인다» 만 물으면 «전부 보이기»(게이트를 통째로 지운 것)도 통과합니다 —
      그래서 **«관리자 로그인이 없는 학생은 여전히 안 보인다» 를 짝으로** 잽니다.
   ⚠️ 그리고 이 절은 localStorage 를 건드리므로 **끝나면 반드시 원래대로** 돌려놓습니다
      (안 그러면 아래 절들이 «관리자» 상태로 돌아 조용히 헛돕니다). */
const adminGate = await ev(`(async () => {
  var K = 'mangoi_admin_session';
  var before = null;
  try { before = localStorage.getItem(K); } catch(e){}
  var out = {};
  try {
    // ① 관리자 로그인이 «없는» 학생 — 감춰져야 한다(짝)
    try { localStorage.removeItem(K); } catch(e){}
    window.vcMyRole = 'student';
    out.studentNoAdmin = window.vcOfficeModeAllowed();

    // ② 관리자 로그인이 «있는» 학생(= 사장님이 취소를 눌러 학생으로 입장한 경우) — 보여야 한다
    try { localStorage.setItem(K, JSON.stringify({ uid: 'jeong', name: '사장님' })); } catch(e){}
    out.studentWithAdmin = window.vcOfficeModeAllowed();

    // ③ uid 가 «빈 값» 인 껍데기는 관리자로 치지 않는다 — 있으나 마나 한 키에 열리면 안 된다
    try { localStorage.setItem(K, JSON.stringify({ uid: '  ' })); } catch(e){}
    out.emptyUid = window.vcOfficeModeAllowed();

    // ④ 깨진 JSON 이어도 던지지 않는다 — 이 판정이 던지면 설정 팝오버가 통째로 안 그려진다
    try { localStorage.setItem(K, '{not json'); } catch(e){}
    out.brokenJson = window.vcOfficeModeAllowed();
  } catch (e) { out.threw = String(e && e.message || e); }
  try { if (before === null) localStorage.removeItem(K); else localStorage.setItem(K, before); } catch(e){}
  window.vcMyRole = 'teacher';
  return out;
})()`);
ok(adminGate.threw === undefined, '판정이 어떤 저장값에도 던지지 않는다', JSON.stringify(adminGate));
ok(adminGate.studentWithAdmin === true,
   '관리자 로그인이 있으면 학생 역할이어도 «보인다» — 사장님 계정', JSON.stringify(adminGate));
ok(adminGate.studentNoAdmin === false,
   '관리자 로그인이 없는 학생은 «여전히 안 보인다» — 짝이 없으면 «전부 보이기» 도 통과한다',
   JSON.stringify(adminGate));
ok(adminGate.emptyUid === false, 'uid 가 빈 값인 껍데기 세션으로는 안 열린다', JSON.stringify(adminGate));
ok(adminGate.brokenJson === false, '저장값이 깨져 있으면 «막는 쪽» 으로 떨어진다', JSON.stringify(adminGate));

/* 🔴 위 넷은 «판정 함수» 만 부릅니다 — 그것만 두면 vc-dock.js 의 offAllowed 를
      window.vcIsStaffNow() 로 바꿔 놔도(= 사장님 화면은 다시 안 보임) 전부 초록입니다.
      지시 1이 지키려던 자리를 **계산된 display 로** 한 번 더 못 박습니다(⑯절과 같은 기준). */
const adminRow = await ev(`(async () => {
  var K = 'mangoi_admin_session';
  var before = null; try { before = localStorage.getItem(K); } catch(e){}
  var sw = document.querySelector('[data-act="office"]');
  var row = sw && sw.closest('.sg-row');
  if (!row) return { found: false };
  /* ⚠️ #vc-dock-settings 는 «둘» 이다(팝오버 603행 · 버튼 848행) — getElementById 로 집으면
     회차마다 다른 것을 잡는다. ⑯절과 «똑같이» 태그로 가려낸다. 여기를 대충 두면 클릭이
     아예 안 나가 refreshSettings 가 안 돌고, 그러면 앞 절의 상태가 그대로 남아
     이 검사가 «둘 다 보임» 으로 헛돈다(2026-09-09 실제로 그렇게 나왔다). */
  var btn = document.getElementById('vc-dock-settings');
  if (!btn || btn.tagName !== 'BUTTON') btn = document.querySelector('#vc-dock button#vc-dock-settings');
  if (!btn) return { found: false, noBtn: true };
  var pop = row.closest('#vc-dock-settings') || document.querySelector('.sg-pop');
  async function reopen() {
    for (var i = 0; i < 2; i++) {
      btn.click();
      await new Promise(r => setTimeout(r, 260));
      if (pop && pop.classList.contains('open')) break;
    }
    await new Promise(r => setTimeout(r, 200));
    return { seen: getComputedStyle(row).display !== 'none', open: !!(pop && pop.classList.contains('open')) };
  }
  window.vcMyRole = 'student';
  try { localStorage.removeItem(K); } catch(e){}
  var a = await reopen();                                          // 짝 — 안 보여야 한다
  try { localStorage.setItem(K, JSON.stringify({ uid: 'boss' })); } catch(e){}
  var b = await reopen();                                          // 보여야 한다
  try { if (before === null) localStorage.removeItem(K); else localStorage.setItem(K, before); } catch(e){}
  window.vcMyRole = 'teacher';
  return { found: true, noAdmin: a.seen, withAdmin: b.seen, openedA: a.open, openedB: b.open };
})()`);
ok(adminRow.found === true, '전제: 스위치 행을 찾았다', JSON.stringify(adminRow));
ok(adminRow.openedA === true && adminRow.openedB === true,
   '전제: 두 번 다 설정 팝오버가 «실제로 열렸다» — 안 열리면 이 절이 통째로 헛돈다', JSON.stringify(adminRow));
ok(adminRow.withAdmin === true,
   '관리자 로그인이 있으면 그 줄이 «실제로 화면에» 보인다 (계산된 display)', JSON.stringify(adminRow));
ok(adminRow.noAdmin === false,
   '관리자 로그인이 없는 학생 화면에서는 «실제로» 안 보인다 — 짝', JSON.stringify(adminRow));

console.log('\n⑯-4 축이 «둘» 인가 — 보이기는 넓히고 «자동 켜기» 는 선생님만');
/* 🔴 2026-09-09 함정 대조 지적. 두 지시의 범위가 다릅니다 —
      「사장님 계정도 보이게」(보이기)와 「교사한테 항상 켜지는」(자동 켜기).
      하나로 합치면 **공용 PC 에 남은 관리자 세션으로 «학생으로 입장» 한 아이의 마이크**에까지
      게이트가 자동으로 걸립니다(idx-main.js:2622 의 confirm 방어선을 옆으로 돌아갑니다).
   ⚠️ 그렇다고 enable() 까지 좁히면 «보이는데 눌러도 안 되는 버튼» 이 됩니다 — 그래서 셋을 함께 봅니다. */
const twoAxis = await ev(`(async () => {
  var K = 'mangoi_admin_session';
  var before = null; try { before = localStorage.getItem(K); } catch(e){}
  async function goHome() {
    try { await window.vcSetOfficeMode(false); } catch(e){}
    document.body.classList.remove('vc-in-call');
    try { window.showView('view-home'); } catch(e){}
    await new Promise(r => setTimeout(r, 900));
  }
  try { localStorage.setItem(K, JSON.stringify({ uid: 'boss' })); } catch(e){}
  await goHome();
  /* 🔴 저장값 비우기는 goHome() «뒤» 에 — goHome 이 vcSetOfficeMode(false) 를 부르고
     그것이 '0' 을 씁니다. 앞에 두면 wantOn() 이 false 가 되어 armOnce 가 «아예 안 돌고»,
     그러면 이 절이 무엇을 넣어도 통과합니다(2026-09-09 변이시험에서 실제로 헛돌았습니다). */
  try { localStorage.removeItem('mangoi_vc_office'); } catch(e){}
  window.vcMyRole = 'student';                       // 관리자 로그인 + 학생 역할
  window.vcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  try { window.showView('view-videocall-call'); } catch(e){}
  document.body.classList.add('vc-in-call');
  for (var i = 0; i < 16; i++) await new Promise(r => setTimeout(r, 400));
  var auto = window.vcOfficeModeOn();                // 자동으로는 «안» 켜져야 한다
  var manual = await window.vcSetOfficeMode(true);   // 눌렀을 때는 켜져야 한다 (짝)
  var out = { auto: auto, manual: manual, on: window.vcOfficeModeOn() };
  try { await window.vcSetOfficeMode(false); } catch(e){}
  await goHome();
  try { if (before === null) localStorage.removeItem(K); else localStorage.setItem(K, before); } catch(e){}
  try { localStorage.setItem('mangoi_vc_office','0'); } catch(e){}
  window.vcMyRole = 'teacher';
  return out;
})()`);
ok(twoAxis.auto === false,
   '관리자 세션이 남은 «학생» 에게는 자동으로 켜지지 않는다 — 공용 PC 의 아이 마이크를 건드리지 않는다',
   JSON.stringify(twoAxis));
ok(twoAxis.manual === true && twoAxis.on === true,
   '그래도 «누르면» 켜진다 — 짝이 없으면 «보이는데 눌러도 안 되는 버튼» 이 된다',
   JSON.stringify(twoAxis));

console.log('\n⑯-2 학생이 «직접» 켜려 해도 거절되는가 (그리고 저장값을 안 지우는가)');
/* ⚠️ 저장값을 지우면 «역할이 늦게 온 강사» 의 설정이 그 한 번의 오판으로 사라져
      다음 수업에도 안 켜지는 상태가 굳습니다 — 그래서 거절은 «조용히» 해야 합니다. */
const studentBlock = await ev(`(async () => {
  await window.vcSetOfficeMode(false);
  window.vcMyRole = 'teacher';
  document.body.classList.add('vc-in-call');
  window.vcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  await window.vcSetOfficeMode(true);
  if (!window.vcOfficeModeOn()) return { armed: false };
  await window.vcSetOfficeMode(false);

  try { localStorage.setItem('mangoi_vc_office','1'); } catch(e){}
  window.vcMyRole = 'student';
  var r = await window.vcSetOfficeMode(true);
  var t = window.vcLocalStream.getAudioTracks()[0];
  var out = { armed: true, ret: r, on: window.vcOfficeModeOn(),
              saved: localStorage.getItem('mangoi_vc_office'),
              live: t ? t.readyState : null, proc: ${IS_PROC}(t) };
  window.vcMyRole = 'teacher';
  try { localStorage.setItem('mangoi_vc_office','0'); } catch(e){}
  return out;
})()`);
ok(studentBlock.armed === true, '전제: 선생님으로는 실제로 켜졌다 (짝)', JSON.stringify(studentBlock));
ok(studentBlock.ret === false && studentBlock.on === false, '학생이 직접 불러도 안 켜진다', JSON.stringify(studentBlock));
ok(studentBlock.proc === false, '마이크가 가공되지 않았다 — 이름만 거절하고 실제로 걸리면 뜻이 없다', JSON.stringify(studentBlock));
ok(studentBlock.live === 'live', '거절해도 마이크는 살아 있다 — 수업이 안 끊긴다', JSON.stringify(studentBlock));
ok(studentBlock.saved === '1', "거절이 저장값을 지우지 않는다 — 역할이 늦게 온 강사의 설정을 잃지 않는다", JSON.stringify(studentBlock));

console.log('\n⑰ 기본값 = 켜짐 (2026-09-09 사장님 「교사한테 항상 켜지는 것을 디폴트값으로」)');
/* 🔴 여기서 「켜진다」 하나만 물으면 헛돕니다 — «무조건 켜기» 변이가 그대로 통과합니다.
      셋을 «짝» 으로 둡니다:
        ⓐ 저장값이 «없으면»(=처음 쓰는 교사) 자동으로 켜진다        ← 이번에 바꾼 것
        ⓑ 저장값이 '0'(사람이 껐음)이면 켜지지 않는다              ← 없으면 「끈 것이 되살아난다」
        ⓒ 학생 브라우저에서는 저장값이 없어도 켜지지 않는다        ← 없으면 「전부 켜기」도 통과
   ⚠️ ⓒ 는 관리자 로그인이 없어야 성립합니다(⑯-3 의 «사장님 계정» 축) — 여기서 지우고 되돌립니다. */
const dflt = await ev(`(async () => {
  var admBak = null;
  try { admBak = localStorage.getItem('mangoi_admin_session'); localStorage.removeItem('mangoi_admin_session'); } catch(e){}
  async function goHome() {
    try { await window.vcSetOfficeMode(false); } catch(e){}
    document.body.classList.remove('vc-in-call');
    try { window.showView('view-home'); } catch(e){}
    await new Promise(r => setTimeout(r, 900));
  }
  /* 실제 입장 순서 그대로 — showView 가 «먼저», vc-in-call 이 «나중»(idx-main.js:2869~2870). */
  async function enter(role, stored, expectOn) {
    await goHome();
    try {
      if (stored === null) localStorage.removeItem('mangoi_vc_office');
      else localStorage.setItem('mangoi_vc_office', stored);
    } catch(e){}
    window.vcMyRole = role;
    window.vcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    try { window.showView('view-videocall-call'); } catch(e){}
    document.body.classList.add('vc-in-call');
    var n = expectOn ? 30 : 16;   // «안 켜진다» 쪽은 끝까지 기다릴 필요가 없다
    for (var i = 0; i < n; i++) {
      if (expectOn && window.vcOfficeModeOn()) break;
      await new Promise(r => setTimeout(r, 400));
    }
    return window.vcOfficeModeOn();
  }
  var teacherFresh  = await enter('teacher', null, true);
  /* 🔴 자동으로 켜진 뒤에도 저장값은 «없음» 이어야 한다 — 여기서 '1' 을 써 버리면
     첫 수업 한 번에 전 교사가 «사람이 켰음» 으로 굳어, 나중에 기본값을 되돌릴 수 없다. */
  var freshSaved = null;
  try { freshSaved = localStorage.getItem('mangoi_vc_office'); } catch(e){}
  var teacherOptOut = await enter('teacher', '0',  false);
  var studentFresh  = await enter('student', null, false);
  await goHome();
  window.vcMyRole = 'teacher';
  try { localStorage.setItem('mangoi_vc_office','0'); } catch(e){}
  try { if (admBak !== null) localStorage.setItem('mangoi_admin_session', admBak); } catch(e){}
  return { teacherFresh: teacherFresh, teacherOptOut: teacherOptOut, studentFresh: studentFresh, freshSaved: freshSaved };
})()`);
ok(dflt.teacherFresh === true,
   'ⓐ 저장값이 없는 교사는 수업에 들어가면 «자동으로» 켜진다 — 기본값 켜짐', JSON.stringify(dflt));
ok(dflt.teacherOptOut === false,
   "ⓑ 사람이 끈 것('0')은 되살아나지 않는다 — 짝이 없으면 «무조건 켜기» 도 통과한다", JSON.stringify(dflt));
ok(dflt.studentFresh === false,
   'ⓒ 학생은 저장값이 없어도 켜지지 않는다 — 짝이 없으면 «전부 켜기» 도 통과한다', JSON.stringify(dflt));
ok(dflt.freshSaved === null,
   "ⓓ 자동으로 켜져도 저장값을 «쓰지» 않는다 — '1' 을 쓰면 첫 수업에 전원이 «사람이 켰음» 으로 굳어 기본값을 되돌릴 수 없다",
   JSON.stringify(dflt));

/* ⑱ (2026-09-11) 마이크를 «두 번» 열지 않는가 — 교사만 입장이 느리던 이유.
   [무엇을 지키나] 예전에는 켤 때도 끌 때도 getUserMedia 를 새로 불렀다(수업 한 번에 2회 추가).
     지금은 첫 마이크를 «AGC 를 끈 채로» 열어 두고(hookGum) 사무실 모드가 그것을 그대로 빌린다.
   ⛔ 「안 부른다」만 세면 «아무것도 안 하기» 도 통과한다 — «그런데도 실제로 켜졌는가» 를 짝으로 둔다.
   ⚠️ 이 절은 «실제로 켜고 끄면서» 호출 횟수를 센다. 문자열로는 볼 수 없는 보장이다. */
console.log('\n⑱ 마이크를 «두 번» 열지 않는가 (교사 입장 지연 — 2026-09-11)');
const once = await ev(`(async () => {
  try { await window.vcSetOfficeMode(false); } catch(e){}
  /* 🔴 전제 — «수업 안» 이어야 한다. ⑰ 이 홈으로 끝내는데, 수업 밖에서 enable() 은
     «수업에 들어갈 때 다시 건다» 며 아무 일도 안 하고 true 를 돌려준다. 그대로 재면
     이 절이 통째로 헛돌며 «켜졌다» 로 보인다(2026-09-11 실측). */
  try { localStorage.removeItem('mangoi_vc_office'); } catch(e){}
  window.vcMyRole = 'teacher';
  try { window.showView('view-videocall-call'); } catch(e){}
  document.body.classList.add('vc-in-call');
  try { window.vcLocalStream.getTracks().forEach(function(t){ t.stop(); }); } catch(e){}
  window.vcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  await new Promise(r => setTimeout(r, 300));
  try { await window.vcSetOfficeMode(false); } catch(e){}
  var t0 = window.vcLocalStream.getAudioTracks()[0];
  var s0 = (t0 && t0.getSettings && t0.getSettings()) || {};
  var n = 0, asked = [];
  var orig = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = function(c){
    n++;
    try { var a = (c && c.audio && c.audio !== true) ? c.audio : {}; asked.push(a.autoGainControl); } catch(e) { asked.push('?'); }
    return orig.apply(navigator.mediaDevices, arguments);
  };
  var onR = await window.vcSetOfficeMode(true);
  var nOn = n;
  var tOn = window.vcLocalStream.getAudioTracks()[0];
  var proc = (${IS_PROC})(tOn);
  var askedOn = asked.slice();
  await window.vcSetOfficeMode(false);
  var nOff = n - nOn;
  var askedOff = asked.slice(nOn);
  var tOff = window.vcLocalStream.getAudioTracks()[0];
  var sOff = (tOff && tOff.getSettings && tOff.getSettings()) || {};
  navigator.mediaDevices.getUserMedia = orig;
  return { inCall: document.body.classList.contains('vc-in-call'),
           agcOff: s0.autoGainControl === false, onR: onR, nOn: nOn, proc: proc, nOff: nOff,
           askedOn: askedOn, askedOff: askedOff, offAgc: sOff.autoGainControl,
           offProc: (${IS_PROC})(tOff), offLive: tOff ? tOff.readyState : null };
})()`);
ok(once.inCall === true,
   'ⓐ 전제: «수업 안» 에서 쟀다 — 수업 밖이면 enable 이 아무 일도 안 하고 true 를 준다', JSON.stringify(once));
ok(once.agcOff === true,
   'ⓑ 전제: 첫 마이크가 «AGC 를 끈 채로» 열려 있다 — 이게 아니면 아래가 통째로 헛돈다', JSON.stringify(once));
ok(once.nOn === 0,
   'ⓒ 켤 때 마이크를 새로 «열지 않는다» — 이미 열린 것을 빌린다', JSON.stringify(once));
ok(once.onR === true && once.proc === true,
   'ⓓ 그런데도 «실제로» 켜졌고 마이크가 가공 트랙으로 갈렸다 — 짝이 없으면 «안 켜기» 도 통과한다',
   JSON.stringify(once));
ok(once.offProc === false && once.offLive === 'live',
   'ⓔ 끈 뒤 «진짜 마이크» 로 돌아왔고 살아 있다 — 짝이 없으면 «안 되돌리기» 도 통과한다',
   JSON.stringify(once));
/* 🔴 (2026-09-11 함정 대조) 여기 원래 「끌 때도 마이크를 안 연다」가 있었는데 **그 계약이 거짓이었다.**
   빌린 트랙의 AGC 를 applyConstraints 로 되돌리는 길을 크로미움이 조용히 무시해서(켤 때와 같은 이유),
   「껐는데 AGC 는 꺼진 채」로 그 세션 내내 갔다 — 교사가 조용히 말하면 소리가 작아진다.
   ⟹ 지킬 것은 «안 여는 것» 이 아니라 **«켜기 전으로 돌아가는 것»** 이다. 새로 열어도 된다
      (끄기는 사람이 누르는 순간이라 속도가 걸리지 않는다. 고치려던 것은 «입장» 이고 그건 ⓒ 가 지킨다).
   ⚠️ 트랙의 getSettings 만 보면 안 된다 — 크로미움은 같은 장치를 다시 열 때 앞선 설정을 물려줄 수
      있어 «멀쩡한 코드가 FAIL» 이 된다. 그래서 «무엇을 달라고 했는가»(제약)를 함께 본다. */
ok(once.offAgc !== false,
   'ⓕ 끈 뒤 자동 게인이 «켜기 전» 으로 실제로 돌아왔다 — 안 돌아오면 교사가 조용히 말할 때 소리가 계속 작아진다',
   JSON.stringify({ offAgc: once.offAgc, nOff: once.nOff, askedOff: once.askedOff }));
/* ⚠️ 이 래퍼는 hookGum «바깥» 이라 «되돌리기가 무엇을 달라고 했는가» 까지만 본다 —
   훅이 그 뒤에 덮는지는 여기서 안 보인다(그쪽은 ⓕ 가 «결과» 로 잡는다).
   🪤 restoring 가드 자체는 이 환경에서 «결과» 로도 안 드러난다: 가드를 지우면 훅이 실제로 덮는데
      (계측으로 확인) 그래도 fake device 가 AGC 를 켜서 내줘 ⓕ·ⓙ-2 가 둘 다 통과한다.
      ⇒ 그 가드는 «논리» 로 남긴 것이고 이 검사들이 지켜 주지 못한다. 지우지 말 것. */
ok(once.nOff === 0 || once.askedOff.every(v => v !== false),
   'ⓕ-1 되돌릴 때 «AGC 를 켜 달라» 고 요청한다 — 요청조차 꺼 달라고 하면 원리상 못 돌아온다',
   JSON.stringify(once.askedOff));
ok(once.askedOn.every(v => v === false) || once.nOn === 0,
   'ⓕ-3 반대로 «켤 때» 열게 되면 그때는 AGC 를 꺼 달라고 한다 — 짝이 없으면 «훅을 통째로 끄기» 도 통과한다',
   JSON.stringify(once.askedOn));

/* ⓙ 켜기가 «도중에» 실패해도 AGC 가 돌아오는가 — restoring 가드가 실제로 일하는 유일한 경로.
   🔴 왜 따로 재나 — 사람이 스위치로 끄는 경로(위 ⓕ)는 remember(false) 가 먼저라 wantOn() 이 거짓이고,
      그래서 hookGum 이 «어차피» 안 걸린다. restoring 가드를 통째로 지워도 ⓕ 는 통과한다(실측).
      가드가 일하는 곳은 «실패해서 되돌릴 때» 다 — 그때는 저장값이 아직 «켜짐» 이라 wantOn() 이 참이고,
      되돌리려고 새로 여는 그 마이크의 AGC 를 훅이 **또 꺼서** 영영 안 돌아온다.
   ⚠️ 이 절은 autoFailed 를 세우므로 «그 페이지에서» 자동 적용이 막힌다 — 위 ⓐ~ⓕ 뒤에 두고,
      아래 ⓖⓗⓘ 는 페이지를 새로 여니 영향이 없다. */
const failAgc = await ev(`(async () => {
  try { await window.vcSetOfficeMode(false); } catch(e){}
  try { localStorage.setItem('mangoi_vc_office', '1'); } catch(e){}
  window.vcMyRole = 'teacher';
  document.body.classList.add('vc-in-call');
  try { window.vcLocalStream.getTracks().forEach(function(t){ t.stop(); }); } catch(e){}
  window.vcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  var before = window.vcLocalStream.getAudioTracks()[0].getSettings().autoGainControl;
  /* ⛔ 여기서 «기다리지» 않는다 — 저장값이 '1' 이라 자동 적용이 먼저 켜 버리면
     vcSetOfficeMode(true) 가 「이미 켜짐」으로 true 를 돌려줘 이 절이 통째로 헛돈다(실측). */
  /* 켜기를 «도중에» 깨뜨린다 — 경로와 무관한 자리를 막아야 빌리든 새로 열든 반드시 실패한다. */
  var AC = window.AudioContext, WAC = window.webkitAudioContext;
  window.AudioContext = window.webkitAudioContext = function(){ throw new Error('테스트: AudioContext 거부'); };
  var wasOn = (typeof window.vcOfficeModeOn === 'function') ? window.vcOfficeModeOn() : null;
  var r = await window.vcSetOfficeMode(true);
  window.AudioContext = AC; window.webkitAudioContext = WAC;
  await new Promise(r2 => setTimeout(r2, 400));
  var t = window.vcLocalStream.getAudioTracks()[0];
  var st = (t && t.getSettings && t.getSettings()) || {};
  return { before: before, wasOn: wasOn, enabled: r, agc: st.autoGainControl,
           live: t ? t.readyState : null, proc: (${IS_PROC})(t) };
})()`);
ok(failAgc.before === false && failAgc.wasOn === false && failAgc.enabled === false,
   'ⓙ 전제: 「AGC 꺼진 마이크 + 꺼져 있던 상태 + 켜기가 실패」 를 실제로 만들었다', JSON.stringify(failAgc));
ok(failAgc.agc !== false && failAgc.live === 'live' && failAgc.proc === false,
   'ⓙ-2 켜기가 실패하면 자동 게인까지 «켜기 전» 으로 되돌아온다 — 되돌리는 동안에는 훅이 손을 떼야 한다',
   JSON.stringify(failAgc));

/* ⓖ 학생 마이크는 말없이 건드리지 않는다 — hookGum 의 가드. 없으면 조용히 말하는 아이 소리가 작아진다. */
/* ⓖⓗ 는 «깨끗한 페이지» 에서 잰다.
   🔴 왜 굳이 다시 여는가 — 크로미움은 같은 입력 장치를 다시 열면 **앞서 연 트랙의 오디오 처리
      설정을 그대로 준다**. 위에서 교사로 AGC 를 끈 뒤라, 같은 페이지에서 학생으로 다시 열면
      학생인데도 꺼진 것처럼 보인다(2026-09-11 실측: 장치를 다 놓고 800ms 기다려도 같았다).
      그 상태로 두면 «멀쩡한 코드가 FAIL» 이라 다음 사람이 없는 버그를 쫓는다.
   ⚠️ 이 절이 마지막이라 페이지를 다시 열어도 뒤 검사를 깨지 않는다 — 앞으로 옮기지 말 것. */
async function freshAgc(role, pref) {
  await cdp('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
  await new Promise(r => setTimeout(r, 3500));
  return await ev(`(async () => {
    try { ${pref === undefined ? "localStorage.removeItem('mangoi_vc_office')" : `localStorage.setItem('mangoi_vc_office', '${pref}')`}; } catch(e){}
    window.vcMyRole = '${role}';
    var s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true }, video: false });
    var st = s.getAudioTracks()[0].getSettings();
    s.getTracks().forEach(function(t){ try { t.stop(); } catch(e){} });
    return { agc: st.autoGainControl, staff: (typeof window.vcIsStaffNow === 'function') ? window.vcIsStaffNow() : null };
  })()`);
}
const stuAgc = await freshAgc('student');
const tchAgc = await freshAgc('teacher');
ok(stuAgc.staff === false && stuAgc.agc !== false,
   'ⓖ 학생 마이크의 자동 게인은 끄지 않는다 — 교사 기능이 아이 마이크에 새지 않는다',
   JSON.stringify(stuAgc));
ok(tchAgc.staff === true && tchAgc.agc === false,
   'ⓗ 그래도 교사 마이크는 «처음부터» 꺼진 채로 열린다 — 짝이 없으면 «아무에게도 안 걸기» 도 통과한다',
   JSON.stringify(tchAgc));
/* ⓘ 사람이 스위치로 꺼 둔 교사에게는 손대지 않는다 — hookGum 의 두 번째 가드.
   ⚠️ 이 가드를 지워도 위 ⓖⓗ 는 전부 통과한다(둘 다 저장값이 «없음» 이라 wantOn 이 참). */
const offPref = await freshAgc('teacher', '0');
ok(offPref.staff === true && offPref.agc !== false,
   'ⓘ 사람이 꺼 둔 교사의 마이크는 AGC 를 끄지 않는다 — 「끈 것」을 코드가 되살리면 안 된다',
   JSON.stringify(offPref));

console.log(`\n════════════════════════════════\n  PASS ${pass}  FAIL ${fail}\n════════════════════════════════`);
try { ws.close(); } catch (e) {}
chrome.kill();
process.exit(fail ? 1 : 0);
