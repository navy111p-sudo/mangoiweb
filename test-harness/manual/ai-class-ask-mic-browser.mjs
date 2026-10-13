// ✋🎤 A.i 선생님 수업 — «선생님께 질문» 의 「한국어로 말하기·영어로 말하기」 브라우저 검사 (CDP 직접 · 진짜 마우스) · 2026-10-13 (2차)
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:  node test-harness/manual/ai-class-ask-mic-browser.mjs
// 사고(2차): 「글자를 입력하면 되는데 말하기가 안 돼」 — 브라우저 음성인식이 «시작은 했는데 아무것도 못 듣는» PC 에서
//   「듣고 있어요」에 머물렀다. 질문 마이크는 이제 «녹음 → 서버 Whisper» 만 쓴다(브라우저 음성인식을 안 쓴다).
// 이 검사의 가짜 음성인식은 사장님 PC 처럼 «시작은 하는데 영원히 아무 결과도 안 내는» 것이다 — 그래도 질문이 가야 한다.
// 진짜 마우스(Input.dispatchMouseEvent)로 누른다: 버튼이 «보이고 눌리는가» 까지 본다. PC 두 크기 + 폰.
// 보는 것: 한국어 버튼 → 서버에 lang=ko · 영어 버튼 → lang=en · 받아 적은 글자 그대로 묻는다 · 질문용 음성인식 0회(짝) ·
//          녹음은 수업 마이크가 끝난 뒤 · 버튼이 «⏹ 다 말했어요» 로 바뀌고 다시 돌아온다 · 「⏹ 다 말했어요」로 바로 끝낼 수 있다.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PUB = process.env.PUB || path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const PORT = 8300 + Math.floor(Math.random() * 400);
const PROF = path.join(os.tmpdir(), 'ai-class-askmic-' + process.pid);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
let asks = [], stt = [];
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  if (u.pathname === '/api/voice/transcribe') {
    const ch = []; q.on('data', (c) => ch.push(c)); q.on('end', () => {
      const b = Buffer.concat(ch).toString('latin1'); const m = /name="lang"\r\n\r\n(\w+)/.exec(b); const lang = m ? m[1] : '';
      stt.push(lang);
      const text = lang === 'ko' ? 'happy 가 무슨 뜻이에요' : 'What does happy mean';
      r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, text }));
    }); return;
  }
  if (u.pathname === '/api/ai/class-ask') {
    let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch (e) {}
      asks.push(j);
      setTimeout(() => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, en: 'Happy means you feel good.', ko: '기분이 좋다는 뜻이에요.' })); }, 1500);
    }); return;
  }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

// 사장님 PC 처럼: 시작은 하는데 영원히 아무 결과도 안 내는 음성인식(한 번에 하나 · abort 는 150ms 뒤 end)
const FAKE = `(()=>{
  let active = null; window.__srLog = []; window.__gumLog = [];
  class FakeSR {
    constructor(){ this.lang=''; this.ended=false; this.hung=false; }
    _fire(n, e){ const f = this['on'+n]; if (f) try { f.call(this, e||{}); } catch(x){} (this._ls&&this._ls[n]||[]).forEach(g=>{ try{ g(e||{}); }catch(x){} }); }
    addEventListener(n, g){ (this._ls=this._ls||{}); (this._ls[n]=this._ls[n]||[]).push(g); }
    start(){ const box = document.getElementById('askBox'); window.__srLog.push({ lang: this.lang, askOpen: !!box && !box.hidden });
      if (active && !active.ended) { this.hung = true; return; } active = this;
      setTimeout(()=>{ if (this.ended) return; this._fire('start'); this._fire('audiostart'); }, 40); }
    _end(){ if (this.ended) return; this.ended = true; if (active === this) active = null; this._fire('end'); }
    abort(){ if (this.hung || this.ended) return; setTimeout(()=>this._end(), 150); }
    stop(){ this.abort(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.getUserMedia = function(c){ window.__gumLog.push({ srBusy: !!(active && !active.ended) }); return gum0(c); };
})();`;

const WAV = path.join(os.tmpdir(), 'askmic-' + process.pid + '.wav');
(() => { const sr = 16000, n = Math.floor(sr * 4.5), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / sr; const v = t > 0.3 && t < 1.5 ? Math.round(16000 * Math.sin(2 * Math.PI * 440 * t)) : 0; b.writeInt16LE(v, 44 + i * 2); }
  fs.writeFileSync(WAV, b); })();
const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + WAV, '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect() { for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) {} await sleep(200); } throw new Error('no chrome'); }
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(50); } return false; };
const waitNode = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(50); } return false; };
const awaitExpr = `(()=>{const a=window.__aiClass;return a.state.phase==='await'&&!a.busy&&a.state.plan[a.state.i].t!=='find'})()`;
// 진짜 마우스로 누른다 — 먼저 화면 안으로 굴리고, 그 자리 «맨 위» 가 그 버튼인지 잰다
async function realClick(elId, tag) {
  await ev(`document.getElementById('${elId}').scrollIntoView({block:'center'})`); await sleep(120);
  const p = await ev(`(()=>{const e=document.getElementById('${elId}');const r=e.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const t=document.elementFromPoint(x,y);return {x,y,top:!!t&&(t===e||e.contains(t)),who:t?(t.id||t.className||t.tagName):null,inView:y>0&&y<innerHeight&&x>0&&x<innerWidth}})()`);
  ok(p.inView && p.top, `${tag}: ${elId} 가 화면 안에 보이고 맨 위다 ${JSON.stringify(p)}`);
  for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x: p.x, y: p.y, button: 'left', clickCount: 1 });
}

async function toTurn(tag) {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  await waitFor('!!window.__aiClass');
  await ev(`localStorage.setItem('aiClassTalk','1')`);   // 자동 말하기 켬 — 사장님 화면과 같은 상태
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  ok(await waitFor(`!!(window.__aiClass && !document.getElementById('startBtn').disabled)`), `${tag}: page ready`);
  await ev(`document.getElementById('startBtn').click()`);
  for (let i = 0; i < 20; i++) { if (await waitFor(awaitExpr, 1500)) break; await ev(`(()=>{const b=document.getElementById('skipBtn');if(!b.disabled)b.click()})()`); }
  ok(await ev(awaitExpr), `${tag}: 학생 차례에 왔다`);
  ok(await waitFor(`window.__aiClass.talk && window.__aiClass.rec`, 3000), `${tag}: 전제 — 자동 말하기로 수업 마이크가 듣는 중이다`);
}

async function scenario(vp) {
  const tag = vp.n;
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
  for (const [btn, lang, early] of [['askMicKo', 'ko', false], ['askMicEn', 'en', false], ['askMicKo', 'ko', true]]) {
    const t2 = `${tag} ${btn}${early ? ' ⏹' : ''}`;
    await toTurn(t2);
    asks = []; stt = [];
    await realClick('askBtn', t2);
    ok(await waitFor(`!document.getElementById('askBox').hidden`, 1500), `${t2}: 진짜 클릭으로 질문 창이 열린다`);
    await ev(`window.__srLog=[]; window.__gumLog=[]`);
    await realClick(btn, t2);
    ok(await waitFor(`/다 말했어요/.test(document.getElementById('${btn}').textContent)`, 1500), `${t2}: 버튼이 «⏹ 다 말했어요» 로 바뀐다`);
    ok(await waitFor(`!window.__aiClass.rec`, 1000), `${t2}: 수업 마이크는 꺼진다`);
    if (early) { ok(await waitFor(`/듣는 중/.test(document.getElementById('askNote').textContent)`, 4000), `${t2}: 말소리를 듣는다`); await realClick(btn, t2); }
    ok(await waitNode(() => asks.length > 0, early ? 3000 : 10000), `${t2}: 말한 질문이 서버로 간다 — note=${await ev("document.getElementById('askNote').textContent")}`);
    ok(stt.length === 1 && stt[0] === lang, `${t2}: 받아쓰기 언어 ${lang} ${JSON.stringify(stt)}`);
    ok(asks.length === 1 && asks[0].q === (lang === 'ko' ? 'happy 가 무슨 뜻이에요' : 'What does happy mean'), `${t2}: 받아 적은 글자 그대로 묻는다 ${JSON.stringify(asks.map((a) => a.q))}`);
    const g = await ev(`window.__gumLog`);
    ok(g.length === 1 && !g[0].srBusy, `${t2}: 녹음은 수업 마이크가 끝난 뒤 한 번 ${JSON.stringify(g)}`);
    ok((await ev(`window.__srLog.filter(x=>x.askOpen).length`)) === 0, `${t2}: (짝) 질문용 브라우저 음성인식을 켜지 않는다`);
    ok(await ev(`/한국어로 말하기/.test(document.getElementById('askMicKo').textContent)&&/영어로 말하기/.test(document.getElementById('askMicEn').textContent)`), `${t2}: 버튼이 원래대로 돌아온다`);
  }
}

(async () => {
  try {
    ws = new WebSocket(await connect());
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
    await new Promise((r) => (ws.onopen = r));
    await send('Page.enable'); await send('Runtime.enable');
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE });
    for (const vp of [{ n: 'pc1307', w: 1307, h: 865, m: false }, { n: 'pc1920', w: 1920, h: 1080, m: false }, { n: 'phone', w: 390, h: 844, m: false }]) {
      try { await scenario(vp); } catch (e) { ok(false, vp.n + ': 시나리오 예외 ' + e.message); }
    }
  } catch (e) { ok(false, '실행 실패: ' + e.message); }
  for (const f of fails) console.log('  ❌ ' + f);
  console.log(`결과: PASS ${pass} / FAIL ${fail}`);
  try { chrome.kill(); } catch (e) {} srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); fs.rmSync(WAV, { force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
