// ✋ A.i 선생님 수업 — «학생 질문 → Lily 즉답» 브라우저 검사 (CDP 직접) · 2026-10-08
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:  node test-harness/manual/ai-class-ask-browser.mjs
// 서버(/api/ai/class-ask)는 가짜로 흉내 냅니다 — 성공 · 실패(503) · 하루 상한(429) 세 가지.
// 보는 것: 버튼·창이 보이고 눌린다 · 물으면 Lily 가 답하고 수업 차례로 돌아온다 · 말로 한 질문도 가로챈다 ·
//          (짝) 따라 말한 대답은 서버로 안 간다 · 실패·상한은 사실대로 말하고 답을 지어내지 않는다.
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PUB = process.env.PUB || path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const PORT = 8300 + Math.floor(Math.random() * 400);
const PROF = path.join(os.tmpdir(), 'ai-class-ask-' + process.pid);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
let MODE = 'ok', asks = [];
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  if (u.pathname === '/api/ai/class-ask') {
    let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch (e) {}
      asks.push(j);
      setTimeout(() => {
        if (MODE === 'fail') { r.writeHead(503, { 'Content-Type': 'application/json' }); return r.end('{"ok":false,"error":"ai_unavailable"}'); }
        if (MODE === 'cap') { r.writeHead(429, { 'Content-Type': 'application/json' }); return r.end('{"ok":false,"error":"daily_cap"}'); }
        r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, en: 'Happy means you feel good.', ko: '«happy» 는 기분이 좋다는 뜻이에요.' }));
      }, 120);
    }); return;
  }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect() { for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) {} await sleep(200); } throw new Error('no chrome'); }
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(50); } return false; };

async function scenario(vp) {
  const tag = vp.n;
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.m });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  await waitFor('!!window.__aiClass');
  await ev(`localStorage.setItem('aiClassTalk','0')`);   // 헤드리스에는 음성인식이 없다 — 대답은 «마이크 대신» 창으로
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  ok(await waitFor(`!!(window.__aiClass && !document.getElementById('startBtn').disabled)`), `${tag}: page ready`);
  ok(await ev(`document.getElementById('askBtn').disabled`), `${tag}: (짝) 수업 시작 전에는 질문 버튼이 꺼져 있다`);
  await ev(`(()=>{window.__askLog=[];const a=document.getElementById('ask');new MutationObserver(()=>window.__askLog.push(a.textContent)).observe(a,{childList:true,subtree:true,characterData:true});})()`);
  await ev(`document.getElementById('startBtn').click()`);
  const awaitExpr = `(()=>{const a=window.__aiClass;return a.state.phase==='await'&&!a.busy&&a.state.plan[a.state.i].t!=='find'})()`;
  // 찾기 차례면 넘어가며 대답 차례까지
  for (let i = 0; i < 20; i++) { if (await waitFor(awaitExpr, 1500)) break; await ev(`(()=>{const b=document.getElementById('skipBtn');if(!b.disabled)b.click()})()`); }
  ok(await ev(awaitExpr), `${tag}: 학생 차례에 왔다`);
  ok(!(await ev(`document.getElementById('askBtn').disabled`)), `${tag}: 수업 중에는 질문 버튼이 켜진다`);
  const i0 = await ev(`window.__aiClass.state.i`);
  // ① 버튼으로 묻기
  await ev(`document.getElementById('askBtn').scrollIntoView({block:'center'})`);
  const topBtn = await ev(`(e=>{const r=e.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!t&&(t===e||e.contains(t))})(document.getElementById('askBtn'))`);
  ok(topBtn, `${tag}: 질문 버튼이 맨 위(눌린다)`);
  await ev(`document.getElementById('askBtn').click()`);
  ok(!(await ev(`document.getElementById('askBox').hidden`)), `${tag}: 질문 창이 열린다`);
  const boxVis = await ev(`(()=>{const e=document.getElementById('askInput');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.width>60&&!!t&&(t===e||e.contains(t))})()`);
  ok(boxVis, `${tag}: 질문 입력칸이 보이고 맨 위다`);
  MODE = 'ok'; asks = [];
  await ev(`(()=>{document.getElementById('askInput').value='happy 가 무슨 뜻이에요?';document.getElementById('askForm').requestSubmit();})()`);
  ok(await waitFor(`window.__askLog.some(t=>/Lily: Happy means/.test(t))`), `${tag}: Lily 의 대답이 화면에 나온다`);
  ok(asks.length === 1 && /happy/.test(asks[0].q || '') && Array.isArray(asks[0].lines), `${tag}: 질문과 지금 교재 쪽 문장을 함께 보낸다 ${JSON.stringify(asks[0] || {}).slice(0, 120)}`);
  ok(await ev(`/기분이 좋다/.test(document.getElementById('sub').textContent)`), `${tag}: 한국어 자막이 붙는다`);
  ok(await waitFor(`(()=>{const a=window.__aiClass;return !a.busy&&a.state.phase==='await'&&!/Lily:/.test(document.getElementById('ask').textContent)})()`, 6000), `${tag}: 대답 뒤 하던 차례로 돌아온다`);
  ok((await ev(`window.__aiClass.state.i`)) === i0, `${tag}: 질문으로 수업 차례가 넘어가지 않았다`);
  ok(await ev(`document.getElementById('askBox').hidden`), `${tag}: 물은 뒤 질문 창은 닫힌다`);
  // ② 말로 한 질문(마이크 대신 창으로 같은 길) — 가로채서 서버로
  asks = []; await ev('window.__askLog=[]');
  await ev(`(()=>{document.getElementById('simInput').value='What does tired mean';document.getElementById('simForm').requestSubmit();})()`);
  ok(await waitFor(`window.__askLog.some(t=>/Lily:/.test(t))`), `${tag}: 영어로 말한 질문도 Lily 가 답한다`);
  ok(asks.length === 1 && /tired/.test(asks[0].q), `${tag}: 말한 질문이 서버로 갔다`);
  await waitFor(awaitExpr + `&&!/Lily:/.test(document.getElementById('ask').textContent)`, 6000);
  ok((await ev(`window.__aiClass.state.i`)) === i0, `${tag}: (짝) 질문은 수업 대답으로 세지 않는다`);
  // ③ (짝) 따라 말한 대답은 서버로 안 간다
  asks = [];
  const target = await ev(`(()=>{const t=window.__aiClass.state.plan[window.__aiClass.state.i];return t.say||t.free||'I am happy.'})()`);
  await ev(`(()=>{document.getElementById('simInput').value=${JSON.stringify(target)};document.getElementById('simForm').requestSubmit();})()`);
  await sleep(400);
  ok(asks.length === 0, `${tag}: (짝) 따라 말한 대답은 질문으로 안 보낸다 «${target}»`);
  // ④ 실패 · 상한 — 사실대로 말하고 답을 지어내지 않는다
  for (let i = 0; i < 20; i++) { if (await waitFor(awaitExpr, 1500)) break; await ev(`(()=>{const b=document.getElementById('skipBtn');if(!b.disabled)b.click()})()`); }
  for (const [m, re] of [['fail', /대답하기 어려워요/], ['cap', /내일 다시/]]) {
    MODE = m; asks = []; await ev('window.__askLog=[]');
    await ev(`document.getElementById('askBtn').click()`);
    await ev(`(()=>{document.getElementById('askInput').value='What is this?';document.getElementById('askForm').requestSubmit();})()`);
    ok(await waitFor(`${re}.test(document.getElementById('ask').textContent)`), `${tag}: ${m} — 사실대로 말한다`);
    ok(await waitFor(`(()=>{const a=window.__aiClass;return !a.busy&&a.state.phase==='await'&&!a.state.askBusy})()`, 6000), `${tag}: ${m} — 수업으로 돌아온다`);
    await sleep(300);
    ok(!(await ev(`window.__askLog.some(t=>/Lily:/.test(t))`)), `${tag}: ${m} — (짝) 답을 지어내지 않는다`);
    ok(await ev(`${re}.test(document.getElementById('ask').textContent)&&/🎤/.test(document.getElementById('ask').textContent)`), `${tag}: ${m} — 수업 차례로 돌아온 뒤에도 안내가 남는다`);
  }
  ok(await ev('document.documentElement.scrollWidth <= innerWidth'), `${tag}: 가로 넘침 없음`);
}

(async () => {
  try {
    ws = new WebSocket(await connect());
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
    await new Promise((r) => (ws.onopen = r));
    await send('Page.enable'); await send('Runtime.enable');
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.setBypassServiceWorker', { bypass: true });
    for (const vp of [{ n: 'pc 1440x900', w: 1440, h: 900, m: false }, { n: 'phone 390x844', w: 390, h: 844, m: true }, { n: 'phone-land 844x390', w: 844, h: 390, m: true }]) {
      try { await scenario(vp); } catch (e) { ok(false, vp.n + ': 시나리오 예외 ' + e.message); }
    }
  } catch (e) { ok(false, '실행 실패: ' + e.message); }
  for (const f of fails) console.log('  ❌ ' + f);
  console.log(`결과: PASS ${pass} / FAIL ${fail}`);
  try { chrome.kill(); } catch (e) {} srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
