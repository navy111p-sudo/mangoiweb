// ✋🎤 A.i 선생님 수업 — «선생님께 질문» 의 「한국어로 말하기·영어로 말하기」 브라우저 검사 (CDP 직접) · 2026-10-13
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:  node test-harness/manual/ai-class-ask-mic-browser.mjs
// 사고: 자동 말하기로 수업 마이크가 듣는 중에 질문 마이크를 누르면, abort() 직후 곧바로 새 음성인식을 start() 해서
//       크롬(음성인식은 한 번에 하나)이 새 것을 이벤트 없이 멈춰 「듣고 있어요」에 영영 머물렀다(사장님 화면).
// 헤드리스에는 진짜 음성인식이 없으므로 «크롬처럼 한 번에 하나만 도는» 가짜 SpeechRecognition 을 심는다:
//   · 앞 인스턴스가 아직 onend 를 안 냈는데 새 것이 start() 하면 → 새 것은 아무 이벤트도 안 낸다(멈춤)
//   · abort() 는 150ms 뒤에야 onend 를 낸다(실제 크롬처럼 비동기)
//   · window.__fakeHear 가 있으면 그 글자로 결과(final)를 낸다, 없으면 조용히 듣기만
// 보는 것: 자동 말하기 중에도 한국어·영어 버튼이 질문을 보낸다 · 언어가 맞다 · (짝) 수업 마이크가 그사이 다시 켜지지 않는다 ·
//          멈춘 마이크는 8초 안에 사실대로 말한다 · (짝) 정상일 때는 그 안내가 안 뜬다.
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
let asks = [];
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  if (u.pathname === '/api/ai/class-ask') {
    let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch (e) {}
      asks.push(j);
      setTimeout(() => {   // 1.5초 늦게 답한다 — 그사이 «질문을 보낸 순간» 의 마이크 기록을 잰다
      r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, en: 'Happy means you feel good.', ko: '기분이 좋다는 뜻이에요.' }));
      }, 1500);
    }); return;
  }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

const FAKE_SR = `(()=>{
  let active = null; window.__srLog = [];
  class FakeSR {
    constructor(){ this.lang=''; this.ended=false; this.hung=false; }
    _fire(n, e){ const f = this['on'+n]; if (f) try { f.call(this, e||{}); } catch(x){} (this._ls&&this._ls[n]||[]).forEach(g=>{ try{ g(e||{}); }catch(x){} }); }
    addEventListener(n, g){ (this._ls=this._ls||{}); (this._ls[n]=this._ls[n]||[]).push(g); }
    start(){
      window.__srLog.push({ lang: this.lang, at: Date.now() });
      if (window.__fakeHang || (active && !active.ended)) { this.hung = true; return; }   // 크롬처럼: 앞의 것이 안 끝났으면 새 것은 멈춘다
      active = this; const h = window.__fakeHear;   // start() 순간에 정한다 — 앞서 켜진 마이크가 나중에 그 글자를 받아 가지 않게
      setTimeout(()=>{ if (this.ended) return; this._fire('start'); this._fire('audiostart');
        if (h) setTimeout(()=>{ if (this.ended) return; this._fire('result', { results: [Object.assign([{ transcript: h }], { isFinal: true })] }); this._end(); }, 120);
      }, 40);
    }
    _end(){ if (this.ended) return; this.ended = true; if (active === this) active = null; this._fire('end'); }
    abort(){ if (this.hung || this.ended) return; setTimeout(()=>this._end(), 150); }
    stop(){ this.abort(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
})();`;

const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect() { for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) {} await sleep(200); } throw new Error('no chrome'); }
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(50); } return false; };
const awaitExpr = `(()=>{const a=window.__aiClass;return a.state.phase==='await'&&!a.busy&&a.state.plan[a.state.i].t!=='find'})()`;

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
  for (const [btn, lang, said] of [['askMicKo', 'ko-KR', 'happy 가 무슨 뜻이에요'], ['askMicEn', 'en-US', 'What does happy mean']]) {
    await toTurn(`${tag} ${btn}`);
    asks = [];
    await ev(`document.getElementById('askBtn').click()`);
    await ev(`window.__fakeHear=${JSON.stringify(said)}; window.__srLog=[]`);
    await ev(`document.getElementById('${btn}').click()`);
    ok(await waitFor(`!window.__aiClass.rec`, 1000), `${tag} ${btn}: 수업 마이크는 꺼진다`);
    ok(await (async () => { const t = Date.now(); while (Date.now() - t < 4000) { if (asks.length) return true; await sleep(50); } return false; })(), `${tag} ${btn}: 말한 질문이 서버로 간다(멈추지 않는다)`);
    ok(asks.length === 1 && (asks[0].q || '').includes(said.split(' ')[0]), `${tag} ${btn}: 들은 글자 그대로 묻는다 ${JSON.stringify(asks[0] || {}).slice(0, 80)}`);
    const langs = await ev(`window.__srLog.map(x=>x.lang)`);   // 질문을 보낸 직후(대답 전)의 기록 — 대답 뒤 수업 마이크가 다시 켜지는 것은 정상
    ok(langs[0] === lang, `${tag} ${btn}: 질문 마이크 언어가 ${lang} ${JSON.stringify(langs)} asks=${JSON.stringify(asks.map(a=>a.q))} hid=${await ev("document.getElementById(\x27askBox\x27).hidden")} phase=${await ev("window.__aiClass.state.phase+\x27/\x27+window.__aiClass.state.plan[window.__aiClass.state.i].mode")} note=${await ev("document.getElementById(\x27askNote\x27).textContent")}`);
    ok(langs.length === 1, `${tag} ${btn}: (짝) 질문 마이크가 듣는 동안 수업 마이크가 다시 켜지지 않았다(start ${langs.length}회)`);
    ok(await ev(`!/마이크가 켜지지 않았어요/.test(document.getElementById('askNote').textContent)`), `${tag} ${btn}: (짝) 정상일 때 «안 켜짐» 안내를 띄우지 않는다`);
    await ev(`window.__fakeHear=''`);
  }
  // 안전망: 그래도 멈추면 8초 안에 사실대로 말한다
  await toTurn(`${tag} hang`);
  await ev(`document.getElementById('askBtn').click()`);
  await ev(`window.__fakeHang=true`);
  await ev(`document.getElementById('askMicKo').click()`);
  ok(await waitFor(`/듣고 있어요/.test(document.getElementById('askNote').textContent)`, 2000), `${tag} hang: 듣기 시작을 알린다`);
  ok(await waitFor(`/마이크가 켜지지 않았어요/.test(document.getElementById('askNote').textContent)`, 10000), `${tag} hang: 멈추면 «안 켜짐» 을 사실대로 말한다`);
  await ev(`window.__fakeHang=false`);
}

(async () => {
  try {
    ws = new WebSocket(await connect());
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
    await new Promise((r) => (ws.onopen = r));
    await send('Page.enable'); await send('Runtime.enable');
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_SR });
    for (const vp of [{ n: 'pc', w: 1440, h: 900, m: false }, { n: 'phone', w: 390, h: 844, m: true }]) {
      try { await scenario(vp); } catch (e) { ok(false, vp.n + ': 시나리오 예외 ' + e.message); }
    }
  } catch (e) { ok(false, '실행 실패: ' + e.message); }
  for (const f of fails) console.log('  ❌ ' + f);
  console.log(`결과: PASS ${pass} / FAIL ${fail}`);
  try { chrome.kill(); } catch (e) {} srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
