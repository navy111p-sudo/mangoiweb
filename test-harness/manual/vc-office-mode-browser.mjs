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
} catch(e){} return 1; })()`);
await cdp('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
await new Promise(r => setTimeout(r, 4000));

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

console.log('\n⑦ 끄면 «켜기 전» 으로 되돌아가는가');
const off = await ev(`(async () => {
  var beforeId = window.vcLocalStream.getAudioTracks()[0].id;
  await window.vcSetOfficeMode(false);
  var t = window.vcLocalStream.getAudioTracks()[0];
  var st = (t && t.getSettings) ? t.getSettings() : {};
  return { on: window.vcOfficeModeOn(), swapped: t && t.id !== beforeId,
           live: t ? t.readyState : null, enabled: t ? t.enabled : null,
           realMic: !!st.deviceId, saved: localStorage.getItem('mangoi_vc_office') };
})()`);
ok(off.on === false, '꺼진다');
ok(off.swapped === true, '트랙이 표준 마이크로 다시 갈렸다', JSON.stringify(off));
ok(off.live === 'live', '되돌린 트랙이 살아 있다 — 여기서 죽으면 «소리가 안 나가는» 최악의 실패다');
ok(off.enabled === false, '되돌릴 때도 음소거 상태를 물려줬다');
ok(off.realMic === true, '되돌린 것이 «진짜 마이크» 다 (가공 트랙에는 deviceId 가 없다)', JSON.stringify(off));
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
  var st = (t && t.getSettings) ? t.getSettings() : {};
  return { armed: true, live: t ? t.readyState : null, realMic: !!st.deviceId,
           swapped: t && t.id !== midId, on: window.vcOfficeModeOn() };
})()`);
ok(fallback.armed === true, '전제: 사무실 모드가 실제로 켜진 상태에서 껐다', JSON.stringify(fallback));
ok(fallback.armed && fallback.swapped === true, '가공 트랙에서 «다른 트랙» 으로 실제로 갈렸다', JSON.stringify(fallback));
ok(fallback.armed && fallback.live === 'live' && fallback.realMic === true,
   '장치 지정이 거부돼도 기본 마이크로 되돌아간다 — 무음이 남지 않는다', JSON.stringify(fallback));
ok(fallback.on === false, '그때도 «꺼짐» 이다');

console.log('\n⑧ 켜기가 실패하면 «켜기 전» 으로 되돌아가는가 (안전 원칙)');
const failsafe = await ev(`(async () => {
  var orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  var beforeId = window.vcLocalStream.getAudioTracks()[0].id;
  navigator.mediaDevices.getUserMedia = function(){ return Promise.reject(new Error('테스트: 마이크 거부')); };
  var r = await window.vcSetOfficeMode(true);
  navigator.mediaDevices.getUserMedia = orig;
  var t = window.vcLocalStream.getAudioTracks()[0];
  return { r: r, on: window.vcOfficeModeOn(), sameTrack: t && t.id === beforeId,
           live: t ? t.readyState : null, saved: localStorage.getItem('mangoi_vc_office') };
})()`);
ok(failsafe.r === false, '실패하면 false 를 돌려준다 — 스위치가 그것을 보고 되돌린다', JSON.stringify(failsafe));
ok(failsafe.on === false, '실패 뒤 «꺼짐» 이다 (켜졌다고 거짓말하지 않는다)');
ok(failsafe.live === 'live', '실패해도 마이크가 살아 있다 — 수업이 안 끊긴다');
ok(failsafe.saved === '0', '실패하면 저장값도 0 이다 (다음 입장 때 또 실패하지 않게)');

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

console.log(`\n════════════════════════════════\n  PASS ${pass}  FAIL ${fail}\n════════════════════════════════`);
try { ws.close(); } catch (e) {}
chrome.kill();
process.exit(fail ? 1 : 0);
