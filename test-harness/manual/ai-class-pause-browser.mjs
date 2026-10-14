// ⏸ A.i 선생님 수업 «잠깐 멈추기» — 브라우저 하니스 (CDP 직접, 라이브러리 없음) · 2026-10-14
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      REPS=100 node test-harness/manual/ai-class-pause-browser.mjs
// 진짜 크로미움에서 실제 ai-class.html 을 «#fast 없이»(소리 켬·실제 타이밍) 돌린다. 음성합성만 가짜(말 한 문장 = 250ms)로 갈아
// «말이 몇 번 나갔나» 를 센다. 매 회차 무작위 시각·무작위 방법(⏸버튼·스페이스바·▶띠 버튼)으로 멈추고 푼다.
//   ① 멈춘 동안: 새 말 0 · 진행(turn/i) 그대로 · 타이머 그대로 · 배경음악·노래 꺼짐 · 마이크 꺼짐 · 띠 보임 · 버튼 잠김
//   ② 짝: 풀면 다시 진행된다(멈추기가 «영영 멈춤» 이 되지 않는다)
//   ③ 짝: 안 멈춘 수업은 예전처럼 저절로 진행된다
//   ④ 멈춘 채 레슨 바꾸기·끝내기 → 멈춤이 풀린다(띠가 남지 않는다)
//   ⑤ 글자 칸에서 스페이스는 멈추기가 아니다
// 실패하면 종료코드 1.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const REPS = +(process.env.REPS || 20);
const PORT = 9300 + Math.floor(Math.random() * 400);
const PUB = process.env.PUB || path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const PROF = path.join(os.tmpdir(), 'ai-class-pause-' + process.pid);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);
const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-gpu', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(); const errors = [];
async function connect() {
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) { } await sleep(200); }
  throw new Error('no chrome');
}
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0, midChecked = 0, lastClick = null; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; if (fails.length < 60) fails.push(m); } }
let rnd = 12345 + (+(process.env.SEED || 0)); const R = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// 가짜 음성합성 — 한 문장 250ms 뒤 onend, cancel 이면 onerror. 말한 횟수를 센다
const FAKE_TTS = `(function(){
  var cur = [];
  window.__spoken = 0; window.__cancels = 0; window.__texts = []; window.__curText = ''; window.__cut = [];
  var fake = { speaking:false, pending:false, paused:false,
    speak: function(u){ window.__spoken++; window.__texts.push(u.text); window.__curText = u.text; var t = { u:u, to: setTimeout(function(){ cur = cur.filter(function(x){ return x !== t; }); fake.speaking = cur.length > 0; u.onend && u.onend({}); }, 250) }; cur.push(t); fake.speaking = true; },
    cancel: function(){ window.__cancels++; var c = cur; cur = []; c.forEach(function(t){ window.__cut.push({ text: t.u.text, n: window.__texts.length }); }); fake.speaking = false; c.forEach(function(t){ clearTimeout(t.to); t.u.onerror && t.u.onerror({ error:'canceled' }); }); },
    pause: function(){}, resume: function(){}, getVoices: function(){ return []; }, addEventListener: function(){}, removeEventListener: function(){} };
  try { Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); } catch(e) {}
  try { localStorage.setItem('aiClassTalk', '0'); } catch(e) {}
})();`;

const S = `(()=>{const a=window.__aiClass,s=a&&a.state;const m=window.AiClassMusic&&AiClassMusic._state();return {
  turn:s&&s.turn,i:s&&s.i,phase:s&&s.phase,stars:s&&s.stars,paused:a&&a.paused,busy:a&&a.busy,rec:a&&a.rec,spoken:window.__spoken,tts:speechSynthesis.speaking,cur:window.__curText,nTexts:window.__texts.length,
  timer:document.getElementById('timer').textContent,band:!document.getElementById('pauseBand').hidden,
  bandVis:(()=>{const b=document.getElementById('pauseBand');const r=b.getBoundingClientRect();return r.width>0&&r.height>0;})(),
  btn:document.getElementById('pauseBtn').textContent.trim(),btnDis:document.getElementById('pauseBtn').disabled,
  mic:document.getElementById('micBtn').disabled,skip:document.getElementById('skipBtn').disabled,
  bgm:m?m.bgmLv:0,sched:m?m.scheduling:false,songSeq:m?m.songSeq:0,
  start:!document.getElementById('startOv').hidden,end:!document.getElementById('endOv').hidden};})()`;

async function load(lessonPick) {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}` });
  for (let i = 0; i < 200; i++) { await sleep(60); try { if (await ev('!!(window.__aiClass && !window.__aiClass.loading && window.__aiClass.state && !document.getElementById("startBtn").disabled)')) break; } catch (e) { } }
  if (lessonPick != null) {
    await ev(`(()=>{const s=document.getElementById('lessonSel');const n=s.options.length;s.value=s.options[${lessonPick}%n].value;s.dispatchEvent(new Event('change'));})()`);
    for (let i = 0; i < 200; i++) { await sleep(60); if (await ev('!window.__aiClass.loading && !document.getElementById("startBtn").disabled')) break; }
  }
}
async function click(idSel) {
  const r = await ev(`(()=>{const e=document.getElementById('${idSel}');e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();const x=b.left+b.width/2,y=b.top+b.height/2;const t=document.elementFromPoint(x,y);return [x,y,!!t&&(t===e||e.contains(t)),t?(t.id||t.className||t.tagName)+'':'none',e.disabled];})()`);
  lastClick = { id: idSel, top: r[2], hit: r[3], dis: r[4] };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 });
}
async function space() {
  await ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
}
async function doPause(how) { if (how === 0) await click('pauseBtn'); else await space(); }
async function doResume(how) { if (how === 0) await click('pauseBtn'); else if (how === 1) await space(); else await click('resumeBtn'); }

async function round(k) {
  const lesson = Math.floor(R() * 40), auto = R() < 0.7;
  await load(lesson);
  await click(auto ? 'startAuto' : 'startBtn');
  await sleep(1700 + Math.floor(R() * 4000));
  const pre = await ev(S); const tag = `#${k} L${lesson} ${auto ? 'auto' : 'man'} phase=${pre.phase}`;
  if (pre.phase === 'done') { ok(true, ''); return; }
  ok(!pre.btnDis, tag + ' 수업 중 ⏸ 버튼이 켜져 있다');
  const how = Math.floor(R() * 2);
  // 문장 «도중» 에 멈추는 경우를 일부러 만든다(절반) — 말이 나가는 중이 될 때까지 잠깐 기다린다
  if (R() < 0.5) for (let t = 0; t < 40; t++) { if (await ev('speechSynthesis.speaking')) break; await sleep(25); }
  const mid = await ev(`({tts:speechSynthesis.speaking,cur:window.__curText,n:window.__texts.length})`);
  await doPause(how);
  await sleep(120);
  const a = await ev(S);
  ok(a.paused === true, tag + ' 멈춤 상태가 됐다 (how=' + how + ', 클릭=' + JSON.stringify(how === 0 ? lastClick : null) + ', 직전 phase=' + (await ev(S)).phase + ')');
  ok(a.band && a.bandVis, tag + ' 멈춤 띠가 보인다');
  ok(/계속/.test(a.btn), tag + ' 버튼이 «계속하기» 로 바뀌었다: ' + a.btn);
  ok(a.mic && a.skip, tag + ' 멈춘 동안 말하기·넘어가기 잠김');
  ok(!a.rec, tag + ' 멈추면 마이크가 꺼진다');
  ok(!a.tts, tag + ' 멈추면 말하던 문장이 그 자리에서 끊긴다(speechSynthesis 가 말하는 중이 아니다)');
  const hold = 1500 + Math.floor(R() * 2500); await sleep(hold);
  const b = await ev(S);
  ok(b.spoken === a.spoken, tag + ` 멈춘 ${hold}ms 동안 새 말 0 (${a.spoken}→${b.spoken})`);
  ok(b.turn === a.turn && b.i === a.i && b.phase === a.phase, tag + ` 멈춘 동안 진행 그대로 (turn ${a.turn}→${b.turn}, i ${a.i}→${b.i})`);
  ok(b.timer === a.timer, tag + ` 멈춘 동안 타이머 그대로 (${a.timer}→${b.timer})`);
  ok(b.bgm === 0 && !b.sched, tag + ' 멈춘 동안 배경음악 꺼짐');
  ok(!b.rec, tag + ' 멈춘 동안 마이크 꺼짐');
  const rh = Math.floor(R() * 3); await doResume(rh);
  await sleep(150);
  const c = await ev(S);
  ok(c.paused === false && !c.band, tag + ' 계속하면 띠가 사라진다 (how=' + rh + ')');
  ok(/멈춤/.test(c.btn), tag + ' 버튼이 «잠깐 멈춤» 으로 돌아왔다');
  // 짝: 문장 도중에 멈췄으면 계속할 때 «그 문장» 부터 다시 읽는다(건너뛰지 않는다)
  // «정말로 문장 도중에 끊었나» 는 가짜 음성합성의 cancel 기록으로 판정한다(멈추기 직전에 문장이 저절로 끝났으면 다시 읽을 것이 없다)
  const cut = (await ev('window.__cut')).filter(x => x.n === a.nTexts).pop();
  if (cut) { mid.cur = cut.text; mid.n = cut.n; }
  if (cut) {
    let again = null;
    for (let t = 0; t < 40 && again == null; t++) { const tx = await ev('window.__texts'); if (tx.length > mid.n) again = tx[mid.n]; else await sleep(50); }
    // 노래 줄을 끊었으면 노래를 «처음부터» 다시 부른다(첫 줄) — 그것도 «다시 읽기» 다
    const songFirst = await ev(`(()=>{const p=window.__aiClass.state.plan||[];const L=p.filter(t=>t.t==='song').flatMap(t=>t.lines);return L.includes(${JSON.stringify(mid.cur)})?p.find(t=>t.t==='song').lines[0]:null;})()`);
    ok(again === mid.cur || (songFirst != null && again === songFirst), tag + ` 끊긴 문장을 다시 읽는다 («${String(mid.cur).slice(0, 30)}» → «${String(again).slice(0, 30)}»)`);
    midChecked++;
  }
  // 짝: 계속하면 진행된다 — 말이 다시 나가거나(자동 데모·말하던 중) 학생 차례면 기다린다
  if (auto || a.busy) {
    let moved = false;
    for (let t = 0; t < 60 && !moved; t++) { await sleep(150); const d = await ev(S); moved = d.spoken > b.spoken || d.turn > b.turn || d.phase === 'done'; }
    ok(moved, tag + ' 계속하면 다시 진행된다 (busy=' + a.busy + ')');
    // 타이머가 다시 흐른다
    const t0 = (await ev(S)).timer; await sleep(2500); const t1 = (await ev(S)).timer;
    const ph = (await ev(S)).phase;   // 수업이 끝나면(ending·done) 타이머는 원래 멈춘다(showEnd)
    const z = await ev(S);
    ok(t1 !== t0 || ph === 'done' || ph === 'ending', tag + ` 계속하면 타이머가 다시 흐른다 (phase=${ph} turn=${z.turn} start=${z.start} end=${z.end} paused=${z.paused} t=${t0}/${t1})`);
  } else ok(true, '');
}

async function sanity() {
  // ③ 안 멈추면 자동 데모가 저절로 진행된다
  await load(3); await click('startAuto'); await sleep(2500);
  const a = await ev(S); await sleep(4000); const b = await ev(S);
  ok(b.turn > a.turn || b.spoken > a.spoken, `③ 안 멈춘 자동 데모는 진행된다 (turn ${a.turn}→${b.turn}, spoken ${a.spoken}→${b.spoken})`);
  ok(!b.paused && !b.band, '③ 안 멈추면 띠가 없다');
  // 시작 전에는 ⏸ 잠김 · 스페이스 무반응
  await load(0); const s0 = await ev(S); ok(s0.btnDis, '시작 전에는 ⏸ 버튼이 잠겨 있다'); await space(); ok(!(await ev(S)).paused, '시작 전 스페이스는 멈추기가 아니다');
  // ⑤ 글자 칸 스페이스
  await click('startBtn'); await sleep(2500);
  await ev(`(()=>{const s=document.getElementById('sim');s.hidden=false;const i=document.getElementById('simInput');i.focus();})()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  ok(!(await ev(S)).paused, '⑤ 글자 칸에서 스페이스는 멈추기가 아니다');
  await ev(`document.getElementById('simInput').value='';document.getElementById('sim').hidden=true;`);
  // ⑥ 시작 징글(1.6초) 도중에 멈춰도 먹는다 — 수업 첫 말이 멈춘 동안 나가지 않는다(짝: 풀면 첫 말이 나간다)
  await load(5); await click('startAuto'); await sleep(150);
  const j0 = await ev(S); ok(!j0.btnDis, '⑥ 시작 직후(징글 중)에도 ⏸ 버튼이 켜져 있다');
  await click('pauseBtn'); await sleep(2600);
  const j1 = await ev(S); ok(j1.paused && j1.spoken === 0 && j1.turn <= 1, `⑥ 징글 중에 멈추면 첫 말이 안 나간다 (spoken ${j1.spoken}, turn ${j1.turn})`);
  ok(j1.bgm === 0 && j1.turn === 0, `⑥ 징글이 끝나도 멈춘 동안은 첫 차례·배경음악으로 넘어가지 않는다 (bgm ${j1.bgm}, turn ${j1.turn})`);
  await click('resumeBtn'); let jm = false; for (let t = 0; t < 40 && !jm; t++) { await sleep(100); jm = (await ev(S)).spoken > 0; }
  ok(jm, '⑥ (짝) 풀면 첫 말이 나간다');
  // ④-1 멈춘 채 레슨 바꾸기
  await click('pauseBtn'); await sleep(100); ok((await ev(S)).paused, '④ 멈춤 걸림');
  await ev(`(()=>{const s=document.getElementById('lessonSel');s.value=s.options[(s.selectedIndex+1)%s.options.length].value;s.dispatchEvent(new Event('change'));})()`);
  for (let i = 0; i < 100; i++) { await sleep(60); if (await ev('!window.__aiClass.loading')) break; }
  const c = await ev(S); ok(!c.paused && !c.band, '④ 멈춘 채 레슨을 바꾸면 멈춤이 풀린다'); ok(c.start, '④ 새 레슨은 시작 창부터');
  const sp = c.spoken; await sleep(1500); ok((await ev(S)).spoken === sp, '④ 레슨을 바꾼 뒤 옛 문장을 다시 읽지 않는다');
  // ④-2 멈춘 채 끝내기
  await click('startAuto'); await sleep(2500); await click('pauseBtn'); await sleep(100);
  await click('endBtn'); await sleep(2500);
  const e = await ev(S); ok(!e.paused && !e.band, '④ 멈춘 채 끝내면 멈춤이 풀린다'); ok(e.end, '④ 끝 창이 뜬다');
  const sp2 = e.spoken; await sleep(1200); ok((await ev(S)).spoken === sp2, '④ 끝낸 뒤 더 말하지 않는다');
}

(async () => {
  try {
    ws = new WebSocket(await connect());
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
    await new Promise(r => ws.onopen = r);
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_TTS });
    const vps = [[1440, 900, false], [390, 844, true], [1920, 1080, false], [844, 390, true]];
    await sanity();
    // ⑦ 화면 배치 — 멈춘 상태에서 가로 넘침이 없고, ▶ 계속하기·⏸ 버튼이 «맨 위» 라 실제로 눌린다(휴대폰 포함)
    for (const v of vps) {
      await send('Emulation.setDeviceMetricsOverride', { width: v[0], height: v[1], deviceScaleFactor: 1, mobile: v[2] });
      await load(3); await click('startAuto'); await sleep(2500); await click('pauseBtn'); await sleep(200);
      const L = await ev(`(()=>{const top=id=>{const e=document.getElementById(id);e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();const h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!h&&(h===e||e.contains(h));};
        return {over:document.documentElement.scrollWidth-innerWidth,resume:top('resumeBtn'),pause:top('pauseBtn'),bandH:document.getElementById('pauseBand').getBoundingClientRect().height};})()`);
      const tg = '⑦ ' + v[0] + '×' + v[1];
      ok(L.over <= 0, tg + ' 멈춘 화면에 가로 넘침이 없다 (' + L.over + 'px)');
      ok(L.resume, tg + ' ▶ 계속하기 버튼이 가려지지 않고 눌린다');
      ok(L.pause, tg + ' ⏸ 버튼이 가려지지 않고 눌린다');
      ok(L.bandH > 0 && L.bandH < v[1] * 0.4, tg + ' 멈춤 띠가 화면을 너무 많이 덮지 않는다 (' + Math.round(L.bandH) + 'px)');
      if (process.env.SHOT) { const sh = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(process.env.SHOT + '-' + v[0] + 'x' + v[1] + '.png', Buffer.from(sh.data, 'base64')); }
      await click('pauseBtn'); await sleep(100);
    }
    for (let k = 0; k < REPS; k++) {
      const v = vps[k % vps.length];
      await send('Emulation.setDeviceMetricsOverride', { width: v[0], height: v[1], deviceScaleFactor: 1, mobile: v[2] });
      try { await round(k); } catch (e) { ok(false, `#${k} 예외: ${e.message}`); }
      if (k % 10 === 9) console.log(`… ${k + 1}/${REPS} PASS ${pass} FAIL ${fail}`);
    }
    ok(midChecked >= Math.min(3, Math.floor(REPS / 6)), '전제: «문장 도중 멈춤» 시나리오가 실제로 일어났다 (' + midChecked + '회)');
    ok(errors.length === 0, '페이지 예외 0건: ' + errors.slice(0, 3).join(' | '));
  } catch (e) { ok(false, '하니스 예외: ' + e.message); }
  for (const f of fails) console.log('❌ ' + f);
  console.log(`결과: PASS ${pass} / FAIL ${fail}`);
  try { chrome.kill(); } catch (e) { } srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch (e) { }
  process.exit(fail ? 1 : 0);
})();
