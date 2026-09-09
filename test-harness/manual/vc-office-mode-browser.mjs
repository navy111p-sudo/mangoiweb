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

console.log(`\n════════════════════════════════\n  PASS ${pass}  FAIL ${fail}\n════════════════════════════════`);
try { ws.close(); } catch (e) {}
chrome.kill();
process.exit(fail ? 1 : 0);
