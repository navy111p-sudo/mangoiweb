// 🤫 A.i 선생님 수업 — «말하지 않았는데 다음 쪽으로 넘어감» 브라우저 하니스 (CDP 직접, 라이브러리 없음) · 2026-10-18
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      REPS=30 node test-harness/manual/ai-class-silence-browser.mjs
// 진짜 페이지에 «아무것도 못 듣는» 가짜 음성인식(no-speech)을 깔고, 실제 버튼을 눌러 봅니다.
//   ① 따라 말하기 차례에서 학생이 조용하면 — 차례가 그대로이고(다음 문장·다음 쪽으로 안 감) 시도로 안 센다
//   ② 두 번째 침묵부터 마이크를 저절로 켜지 않는다(켜진 횟수가 멈춘다) · «기다릴게요» 안내가 보인다
//   ③ 짝: «말하기» 를 누르면 다시 듣는다 · 맞게 말하면 다음으로 간다 · «넘어가기» 는 넘어간다
// 실패하면 종료코드 1.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const REPS = +(process.env.REPS || 20);
const PORT = 8300 + Math.floor(Math.random() * 400);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const PUB = process.env.PUB || path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const PROF = path.join(os.tmpdir(), 'aic-silence-' + process.pid);
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  if (u.pathname.startsWith('/api/')) { r.writeHead(404); return r.end(); }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);
const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-gpu', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) { } await sleep(200); }
  throw new Error('no chrome');
}
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; if (fails.length < 40) fails.push(m); } }

// 가짜 음성인식 — 기본은 «아무것도 못 들음»(no-speech). window.__srSay 에 글자를 넣으면 그 말을 들은 것으로 끝난다
const FAKE_SR = `(function(){
  window.__srStarts = 0; window.__srSay = null;
  function FakeSR(){ this.lang='en-US'; this.interimResults=false; this.continuous=false; this.maxAlternatives=1; }
  FakeSR.prototype.start = function(){ var me=this; window.__srStarts++; me._t = setTimeout(function(){
      if (window.__srSay) { var t = window.__srSay; window.__srSay = null; var res=[{0:{transcript:t},isFinal:true,length:1}]; me.onresult && me.onresult({results:res}); me.onend && me.onend(); }
      else { me.onerror && me.onerror({error:'no-speech'}); me.onend && me.onend(); }
    }, 60); };
  FakeSR.prototype.abort = function(){ clearTimeout(this._t); var me=this; setTimeout(function(){ me.onend && me.onend(); }, 0); };
  FakeSR.prototype.stop = FakeSR.prototype.abort;
  FakeSR.prototype.addEventListener = function(n, f){ if (n === 'end') { var o = this.onend; var me=this; this.onend = function(){ o && o.call(me); f(); }; } };
  window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
  try { localStorage.setItem('aiClassTalk','1'); } catch(e){}
})();`;

const CAT = JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'ai-class-catalog.json'), 'utf8'));
const S = '(window.__aiClass.state)';
async function waitFor(expr, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(40); } return false; }

async function runOne(rep) {
  const li = rep === 0 ? CAT.findIndex(c => /^BTS 1 001\b/.test(c.book)) : (rep * 97 + 13) % CAT.length;
  const tag = `#${rep} L${li} ${CAT[li].title}`;
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  ok(await waitFor('!!(window.__aiClass && document.getElementById("lessonSel").options.length && !document.getElementById("startBtn").disabled)'), `${tag}: page not ready`);
  await ev(`(async()=>{const s=document.getElementById('lessonSel');s.value='${li}';s.dispatchEvent(new Event('change'));for(let k=0;k<200;k++){const a=window.__aiClass;if(a&&!a.loading&&a.state)break;await new Promise(r=>setTimeout(r,20));}})()`);
  await ev(`document.getElementById('startBtn').click()`);
  // 첫 «따라 말하기» 차례까지 — 인사·그림 질문은 조용해도 원래 넘어가고, 찾기 놀이는 «넘어가기» 로
  let reached = false;
  for (let k = 0; k < 400; k++) {
    const s = await ev(`(s=>s?{ph:s.phase,i:s.i,t:(s.plan[s.i]||{}).t,busy:window.__aiClass.busy}:null)${S}`);
    if (!s) { await sleep(40); continue; }
    if (s.ph === 'done') break;
    if (s.ph === 'await' && !s.busy && s.t === 'repeat') { reached = true; break; }
    if (s.ph === 'await' && !s.busy && s.t === 'find') await ev(`document.getElementById('skipBtn').click()`);
    await sleep(40);
  }
  ok(reached, `${tag}: never reached a repeat turn`);
  if (!reached) return;
  const i0 = await ev(`${S}.i`);
  // 조용히 기다린다 — 가짜 마이크는 계속 «아무것도 못 들음»
  await sleep(2500);
  const a = await ev(`(s=>({i:s.i,ph:s.phase,tries:s.tries,quiet:s.quietRun,starts:window.__srStarts,rec:window.__aiClass.rec,chip:[...document.querySelectorAll('#ask .res.miss')].map(x=>x.textContent).join(' | '),mic:!document.getElementById('micBtn').disabled}))${S}`);
  ok(a.i === i0 && a.ph !== 'done', `${tag}: silence moved the lesson (${i0}→${a.i}, ${a.ph})`);
  ok(a.tries === 0, `${tag}: silence counted as tries (${a.tries})`);
  ok(a.quiet >= 2, `${tag}: expected at least 2 silences (${a.quiet})`);
  ok(/기다릴게요/.test(a.chip), `${tag}: «기다릴게요» note not shown (${a.chip})`);
  ok(a.mic && !a.rec, `${tag}: mic button must be enabled and idle while holding (mic ${a.mic} rec ${a.rec})`);
  await sleep(1500);
  const b = await ev(`({starts:window.__srStarts,i:${S}.i})`);
  ok(b.starts === a.starts && b.i === i0, `${tag}: mic kept auto-starting while holding (${a.starts}→${b.starts})`);
  // 짝 ①: «말하기» 를 누르면 다시 듣는다(그래도 조용하면 여전히 제자리)
  await ev(`document.getElementById('micBtn').click()`);
  await sleep(900);
  const c = await ev(`({starts:window.__srStarts,i:${S}.i,ph:${S}.phase})`);
  ok(c.starts === b.starts + 1, `${tag}: pressing «말하기» must start the mic once (${b.starts}→${c.starts})`);
  ok(c.i === i0 && c.ph !== 'done', `${tag}: silence after pressing mic moved the lesson (${i0}→${c.i})`);
  // 짝 ②: 맞게 말하면 다음으로 간다
  ok(await waitFor(`${S}.phase==='await' && !window.__aiClass.busy`), `${tag}: did not come back to the student's turn`);
  const say = await ev(`(t=>t.say)(${S}.plan[${S}.i])`);
  await ev(`window.__srSay = ${JSON.stringify(say)}; document.getElementById('micBtn').click()`);
  ok(await waitFor(`${S}.i > ${i0} || ${S}.phase==='done'`, 6000), `${tag}: correct answer did not move on`);
  // 짝 ③: 다음 따라 말하기에서 «넘어가기» 는 넘어간다
  if (await waitFor(`${S}.phase==='await' && !window.__aiClass.busy && (${S}.plan[${S}.i]||{}).t==='repeat'`, 6000)) {
    const i1 = await ev(`${S}.i`);
    await ev(`document.getElementById('skipBtn').click()`);
    ok(await waitFor(`${S}.i > ${i1} || ${S}.phase==='done'`, 4000), `${tag}: skip did not move on`);
  }
}

(async () => {
  ws = new WebSocket(await connect());
  await new Promise(r => ws.onopen = r);
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_SR });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  for (let rep = 0; rep < REPS; rep++) { try { await runOne(rep); } catch (e) { ok(false, `#${rep}: ${e.message}`); } }
  console.log(`반복 ${REPS}회`);
  fails.forEach(f => console.log('❌ FAIL ' + f));
  console.log(`결과: PASS ${pass} / FAIL ${fail}`);
  try { ws.close(); } catch (e) { }
  chrome.kill(); srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch (e) { }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('❌ FAIL crash: ' + e.message); try { chrome.kill(); } catch (x) { } process.exit(1); });
