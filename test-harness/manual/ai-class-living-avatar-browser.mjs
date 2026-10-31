// 🎓 A.i 선생님(/ai-class.html) 얼굴 = 공용 아바타 — 브라우저 하니스 (CDP 직접, 라이브러리 없음) · 2026-10-18
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:  node test-harness/manual/ai-class-living-avatar-browser.mjs
// 진짜 크로미움에서 «그려지는가»(픽셀) · «쉬는 동안에도 살아 움직이는가» · «입이 바뀌는가» · «서버 음성에 물려
// 말하는 동안 모듈이 말하기 상태가 되는가» 를 잽니다. 서버 음성은 1.6초짜리 소리(사인파)를 돌려줍니다.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PUB = process.env.PUB || path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const PORT = 9300 + Math.floor(Math.random() * 400);
const PROF = path.join(os.tmpdir(), 'ai-class-av-' + process.pid);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
// 1.6초 · 16kHz · 220Hz 사인파(말소리처럼 0.2초마다 켜졌다 꺼짐) — 소리 크기 립싱크가 «실제로» 움직이게
const WAV = (() => { const sr = 16000, n = Math.round(sr * 1.6), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const on = Math.floor(i / (sr * 0.2)) % 2 === 0; b.writeInt16LE(on ? Math.round(Math.sin(2 * Math.PI * 220 * i / sr) * 20000) : 0, 44 + i * 2); }
  return b; })();
let ttsCalls = 0;
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  if (u.pathname === '/api/voice/tts') { let b = ''; q.on('data', c => b += c); q.on('end', () => { ttsCalls++; let spk = ''; try { spk = JSON.parse(b).speaker || ''; } catch {} r.writeHead(200, { 'Content-Type': 'audio/wav', 'X-TTS-Speaker': spk }); r.end(WAV); }); return; }
  if (u.pathname.startsWith('/api/')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":false}'); }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect(){ for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch {} await sleep(200); } throw new Error('no chrome'); }
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ❌ ' + m); } };

// 캔버스 한 구역의 픽셀 «지문»(합) — 바뀌었는지만 본다
const SIG = `window.__sig=function(x0,y0,x1,y1){const c=document.getElementById('tavatar-canvas');const g=c.getContext('2d');const W=c.width,H=c.height;
  const d=g.getImageData(Math.round(x0*W),Math.round(y0*H),Math.max(1,Math.round((x1-x0)*W)),Math.max(1,Math.round((y1-y0)*H))).data;let s=0,a=0;for(let i=0;i<d.length;i+=4){s+=d[i]*3+d[i+1]*5+d[i+2]*7;if(d[i+3]>8)a++;}return s+':'+a;}`;

try {
  ws = new WebSocket(await connect());
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await new Promise(r => ws.onopen = r);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.setBypassServiceWorker', { bypass: true });
  for (const vp of [{ n: 'pc', w: 1440, h: 900, m: false }, { n: 'phone', w: 390, h: 844, m: true }]) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}` });
    let ready = false;
    for (let i = 0; i < 150; i++) { await sleep(100); try { if (await ev(`!!(window.MangoAvatar && typeof MangoAvatar.mouth==='function' && document.getElementById('tavatar-canvas'))`)) { ready = true; break; } } catch {} }
    ok(ready, `${vp.n}: 공용 아바타 모듈이 실렸다`);
    await ev(SIG);
    // 얼굴이 그려질 때까지(그림 받기)
    let drawn = '0:0';
    for (let i = 0; i < 60; i++) { drawn = await ev(`__sig(0,0,1,1)`); if (+drawn.split(':')[1] > 1000) break; await sleep(100); }
    ok(+drawn.split(':')[1] > 1000, `${vp.n}: 캔버스에 얼굴이 그려졌다(불투명 픽셀 ${drawn})`);
    const box = await ev(`(()=>{const c=document.getElementById('tavatar-canvas'),t=document.getElementById('tTile'),f=document.getElementById('face');const cr=c.getBoundingClientRect(),tr=t.getBoundingClientRect();
      return {cw:c.width,ch:c.height,fit:getComputedStyle(c).objectFit,fill:Math.abs(cr.width-tr.width)<6&&Math.abs(cr.height-tr.height)<6,faceShown:getComputedStyle(f).display!=='none',
      off:document.getElementById('faceBox').classList.contains('av-off'),alive:c.classList.contains('mg-alive'),tw:tr.width,th:tr.height}})()`);
    ok(box.cw === 512 && box.ch === 640, `${vp.n}: 캔버스 512x640 (큰 칸에서도 선명) ${box.cw}x${box.ch}`);
    ok(box.fit === 'cover' && box.fill, `${vp.n}: 얼굴이 칸을 꽉 채운다 ${JSON.stringify(box)}`);
    ok(!box.faceShown && !box.off, `${vp.n}: 정지 사진(대체)은 숨어 있다 — 머리가 기울 때 밑에서 비치지 않게`);
    // 눈 그림을 받으면 mg-alive(숨쉬기·깜빡임)가 켜진다
    let alive = box.alive; for (let i = 0; i < 40 && !alive; i++) { await sleep(100); alive = await ev(`document.getElementById('tavatar-canvas').classList.contains('mg-alive')`); }
    ok(alive, `${vp.n}: 눈 깜빡임·숨쉬기(mg-alive)가 켜졌다`);
    // 쉬는 동안에도 살아 움직인다(머리 움직임·깜빡임) — 3초 동안 얼굴 구역 지문이 바뀌는가
    const seen = new Set(); for (let i = 0; i < 30; i++) { seen.add(await ev(`__sig(.25,.1,.75,.55)`)); await sleep(100); }
    ok(seen.size >= 3, `${vp.n}: 말하지 않을 때도 얼굴이 움직인다(3초 동안 서로 다른 모습 ${seen.size}개)`);
    // 입: 화면이 정한 입 단계(wide ↔ closed)에 따라 입 구역이 바뀐다
    const mouthAt = async t => { await ev(`MangoAvatar.mouth('${t}')`); await sleep(260); return ev(`__sig(.3,.42,.7,.62)`); };
    const w1 = await mouthAt('wide'), c1 = await mouthAt('closed');
    await ev(`MangoAvatar.plainStop()`);
    ok(w1 !== c1, `${vp.n}: mouth("wide") 와 mouth("closed") 의 입이 다르다`);
    // 서버 음성에 물려 말한다 — 첫 터치로 물리고(avBind) 수업을 시작하면 모듈이 «말하는 중» 이 된다
    await ev(`document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
    await ev(`document.getElementById('startBtn').disabled || document.getElementById('startBtn').click()`);
    let spoke = false, ttsSeen = 0;
    for (let i = 0; i < 120; i++) { await sleep(100); if (await ev(`document.getElementById('tavatar-wrap').classList.contains('speaking')`)) { spoke = true; break; } }
    ttsSeen = ttsCalls;
    ok(ttsSeen > 0, `${vp.n}: 서버 음성을 불렀다(${ttsSeen}회)`);
    ok(spoke, `${vp.n}: 서버 음성이 재생되는 동안 아바타가 «말하는 중» 이 됐다(소리에 물림)`);
    if (spoke) {
      const ms = new Set(); for (let i = 0; i < 14; i++) { ms.add(await ev(`__sig(.3,.42,.7,.62)`)); await sleep(80); }
      ok(ms.size >= 3, `${vp.n}: 말하는 동안 입 구역이 바뀐다(${ms.size}개)`);
    }
    await ev(`document.getElementById('pauseBtn').disabled || document.getElementById('pauseBtn').click()`);
  }
} catch (e) { ok(false, 'crash: ' + (e && e.stack || e)); }
finally { try { chrome.kill('SIGKILL'); } catch {} srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch {} }
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
