// ✋🎤 A.i 선생님 수업 — 질문 마이크 «수백 번» 반복 검사 (CDP 직접 · 무작위 타이밍) · 2026-10-13 (2차)
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:  ITER=300 node test-harness/manual/ai-class-ask-mic-fuzz-browser.mjs
// 사장님 제보(2차): 「글자를 입력하면 되는데 말하기가 안 돼 — 한국어·영어 둘 다」. 1차(#1542, 브라우저 음성인식을
// 기다렸다 켜기)로도 안 됐다 ⟹ 질문 마이크는 이제 «녹음 → 서버 Whisper» 만 쓴다(브라우저 음성인식을 안 쓴다).
// 진짜 녹음(가짜 마이크 장치 · 말소리 wav) + 가짜 서버 Whisper + 크롬처럼 «한 번에 하나» 인 가짜 음성인식(수업 마이크)으로,
// 매번 아래 중 하나를 무작위로:
//   speak        말한다                         → 그 언어(ko/en)로 받아 적어 묻는다 · (짝) 질문용 음성인식은 안 켠다
//   stopEarly    말하는 도중 «⏹ 다 말했어요»    → 바로 받아 적어 묻는다(한 번만)
//   silent       마이크에 소리가 없다           → 사실대로 말하고 · (짝) 아무것도 안 보낸다
//   hallucinate  소리 없는데 Whisper 가 글자를 지어낸다 → 버린다(묻지 않는다)
//   denied       마이크 권한 거절               → 허용 안내 · (짝) 아무것도 안 보낸다
//   server       받아쓰기 서버 오류              → 사실대로 말한다 · (짝) 묻지 않는다
//   close        녹음 중에 창을 닫는다          → 아무것도 안 보낸다
//   cancelPrep   준비 중에 같은 버튼을 다시 누름 → 취소(아무것도 안 보낸다)
// 수업 마이크(브라우저 음성인식)의 abort 끝나는 시간은 매번 무작위 — 녹음은 반드시 그것이 «끝난 뒤» 시작해야 한다.
// 가끔 두 버튼을 연달아 누른다(마지막 버튼의 언어만 산다 · 받아쓰기 한 번).
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PUB = process.env.PUB || path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const ITER = Number(process.env.ITER || 60);
const SEED0 = Number(process.env.SEED || Date.now() % 100000);
const PORT = 8300 + Math.floor(Math.random() * 600);
const PROF = path.join(os.tmpdir(), 'ai-class-askfuzz-' + process.pid);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
let asks = [], stt = [], sttMode = 'ok';
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  if (u.pathname === '/api/voice/transcribe') {
    const ch = []; q.on('data', (c) => ch.push(c)); q.on('end', () => {
      const b = Buffer.concat(ch).toString('latin1'); const m = /name="lang"\r\n\r\n(\w+)/.exec(b); const lang = m ? m[1] : '';
      stt.push(lang);
      if (sttMode === 'server') { r.writeHead(500, { 'Content-Type': 'application/json' }); return r.end('{"ok":false}'); }
      const text = sttMode === 'hallucinate' ? 'Thank you.' : 'WHISPER ' + lang + ' question';
      setTimeout(() => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, text })); }, 30 + Math.floor(Math.random() * 300));
    }); return;
  }
  if (u.pathname === '/api/ai/class-ask') {
    let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch (e) {}
      asks.push(j);
      setTimeout(() => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, en: 'Good question.', ko: '좋은 질문이에요.' })); }, 200);
    }); return;
  }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

// 크롬처럼 «한 번에 하나» 인 가짜 음성인식(= 수업 마이크). abort 가 끝나는 시간은 window.__fz.abortDelay.
// getUserMedia 를 감싸 «녹음이 열리는 순간 음성인식이 아직 살아 있었나» 를 적는다(동시에 열리면 안드로이드에서 둘 다 죽는다).
// __fz.mic: 'voice'(진짜 가짜장치 wav) · 'silent'(소리 없는 스트림) · 'denied'(권한 거절).
const FAKE = `(()=>{
  let active = null; window.__srLog = []; window.__gumLog = [];
  class FakeSR {
    constructor(){ this.lang=''; this.ended=false; this.hung=false; }
    _fire(n, e){ const f = this['on'+n]; if (f) try { f.call(this, e||{}); } catch(x){} (this._ls&&this._ls[n]||[]).forEach(g=>{ try{ g(e||{}); }catch(x){} }); }
    addEventListener(n, g){ (this._ls=this._ls||{}); (this._ls[n]=this._ls[n]||[]).push(g); }
    start(){
      const box = document.getElementById('askBox');
      window.__srLog.push({ lang: this.lang, askOpen: !!box && !box.hidden, at: Date.now() });
      if (active && !active.ended) { this.hung = true; return; }
      active = this;
      setTimeout(()=>{ if (this.ended) return; this._fire('start'); this._fire('audiostart'); }, 30);   // 수업 마이크는 조용히 듣기만
    }
    _end(){ if (this.ended) return; this.ended = true; if (active === this) active = null; this._fire('end'); }
    abort(){ if (this.hung || this.ended) return; setTimeout(()=>this._end(), (window.__fz||{}).abortDelay || 150); }
    stop(){ this.abort(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.__srBusy = () => !!(active && !active.ended);
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.getUserMedia = function(c){
    const fz = window.__fz || {};
    window.__gumLog.push({ srBusy: window.__srBusy(), mic: fz.mic || 'voice', at: Date.now() });
    if (fz.mic === 'denied') return Promise.reject(new DOMException('no', 'NotAllowedError'));
    if (fz.mic === 'silent') { const ac = new AudioContext(); const d = ac.createMediaStreamDestination(); const o = ac.createOscillator(); const g = ac.createGain(); g.gain.value = 0; o.connect(g).connect(d); o.start(); return Promise.resolve(d.stream); }
    return gum0(c);
  };
})();`;

// 가짜 마이크 소리: 0.3초 조용 → 1.2초 «말»(440Hz) → 3초 조용. 녹음 경로가 «말이 끝났다» 를 알아채게.
// %noloop 이 아니면 반복 — 매 녹음이 다시 «말» 을 듣도록 반복(loop) 으로 둔다.
const WAV = path.join(os.tmpdir(), 'askfuzz-' + process.pid + '.wav');
(() => { const sr = 16000, n = Math.floor(sr * 4.5), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / sr; const v = t > 0.3 && t < 1.5 ? Math.round(16000 * Math.sin(2 * Math.PI * 440 * t)) : 0; b.writeInt16LE(v, 44 + i * 2); }
  fs.writeFileSync(WAV, b); })();
const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + WAV, '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect() { for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) {} await sleep(200); } throw new Error('no chrome'); }
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0; const fails = []; const tally = {};
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 60) fails.push(m); } };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(40); } return false; };
const waitNode = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(40); } return false; };
const note = () => ev("document.getElementById('askNote').textContent");
const ready = `(()=>{const a=window.__aiClass;return a&&a.state&&a.state.phase==='await'&&!a.busy&&a.state.plan[a.state.i].t!=='find'&&!document.getElementById('askBtn').disabled})()`;
let seed = SEED0; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const idle = `(()=>{const k=document.getElementById('askMicKo'),e=document.getElementById('askMicEn');return /한국어로 말하기/.test(k.textContent)&&/영어로 말하기/.test(e.textContent)})()`;

async function openLesson() {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  await waitFor('!!window.__aiClass');
  await ev(`localStorage.setItem('aiClassTalk','1')`);   // 자동 말하기 켬 — 수업 마이크가 듣는 중인 사장님 화면 상태
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  if (!(await waitFor(`!!(window.__aiClass && !document.getElementById('startBtn').disabled)`))) return false;
  await ev(`document.getElementById('startBtn').click()`);
  for (let i = 0; i < 20; i++) { if (await waitFor(ready, 1500)) break; await ev(`(()=>{const b=document.getElementById('skipBtn');if(!b.disabled)b.click()})()`); }
  return ev(ready);
}

(async () => {
  try {
    ws = new WebSocket(await connect());
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
    await new Promise((r) => (ws.onopen = r));
    await send('Page.enable'); await send('Runtime.enable');
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE });
    let inPage = 99;
    for (let it = 0; it < ITER; it++) {
      if (inPage >= 20) { const okp = await openLesson(); ok(okp, `#${it}: 수업 화면 준비`); if (!okp) { inPage = 99; continue; } inPage = 0; }
      inPage++;
      if (!(await waitFor(ready, 12000))) { ok(false, `#${it}: 학생 차례로 돌아오지 않음`); inPage = 99; continue; }
      await waitFor(`window.__aiClass.talk && window.__aiClass.rec`, 2500);   // 수업 마이크가 듣는 중일 때 누른다(가능하면)
      const mode = pick(['speak', 'speak', 'speak', 'stopEarly', 'silent', 'hallucinate', 'denied', 'server', 'close', 'cancelPrep']);
      const btn = pick(['askMicKo', 'askMicEn']); const lang = btn === 'askMicKo' ? 'ko' : 'en';
      const other = btn === 'askMicKo' ? 'askMicEn' : 'askMicKo';
      const twice = ['speak', 'silent'].includes(mode) && rnd() < 0.25;
      const fz = { mic: mode === 'silent' || mode === 'hallucinate' ? 'silent' : mode === 'denied' ? 'denied' : 'voice', abortDelay: 20 + Math.floor(rnd() * 700) };
      sttMode = mode === 'hallucinate' ? 'hallucinate' : mode === 'server' ? 'server' : 'ok';
      tally[mode] = (tally[mode] || 0) + 1;
      if (await ev(`document.getElementById('askBox').hidden`)) await ev(`document.getElementById('askBtn').click()`);
      await ev(`window.__fz=${JSON.stringify(fz)}; window.__srLog=[]; window.__gumLog=[]`);
      asks = []; stt = [];
      const tag = `#${it} ${mode}/${btn}${twice ? '/twice' : ''} abort=${fz.abortDelay}`;
      if (twice) { await ev(`document.getElementById('${other}').click()`); await sleep(Math.floor(rnd() * 1500)); }
      await ev(`document.getElementById('${btn}').click()`);
      ok(await waitFor(`/다 말했어요/.test(document.getElementById('${btn}').textContent)`, 1500) || mode === 'denied', `${tag}: 누른 버튼이 «⏹ 다 말했어요» 로 바뀐다 — ${await ev(`document.getElementById('${btn}').textContent`)}`);
      if (mode === 'cancelPrep') {
        await ev(`document.getElementById('${btn}').click()`);
        await sleep(2500);
        ok(asks.length === 0 && stt.length === 0, `${tag}: 준비 중 다시 누르면 아무것도 안 보낸다 asks=${asks.length} stt=${stt.length}`);
        ok(await ev(idle), `${tag}: 버튼이 원래대로 돌아온다`);
        await ev(`document.getElementById('askClose').click()`); continue;
      }
      if (mode === 'close') {
        await waitFor(`window.__gumLog.length>0`, 3000); await sleep(200 + Math.floor(rnd() * 400));
        await ev(`document.getElementById('askClose').click()`);
        await sleep(2500);
        ok(asks.length === 0 && stt.length === 0, `${tag}: 닫으면 아무것도 안 보낸다 asks=${asks.length} stt=${stt.length}`);
        await ev(`document.getElementById('askBtn').click()`);
        ok(await ev(idle), `${tag}: 다시 열면 버튼이 원래대로`);
        await ev(`document.getElementById('askClose').click()`); continue;
      }
      if (mode === 'stopEarly') {
        await waitFor(`/듣는 중/.test(document.getElementById('askNote').textContent)`, 4000); await sleep(150);
        await ev(`document.getElementById('${btn}').click()`);   // ⏹ 다 말했어요
      }
      const gum = await (async () => { await waitFor(`window.__gumLog.length>0`, 4000); return ev(`window.__gumLog`); })();
      ok(gum.length >= 1 && gum.every((g) => !g.srBusy), `${tag}: 녹음은 수업 마이크가 «끝난 뒤» 열린다 ${JSON.stringify(gum.map((g) => g.srBusy))}`);
      if (mode === 'speak' || mode === 'stopEarly') {
        const sent = await waitNode(() => asks.length > 0, mode === 'stopEarly' ? 4000 : 12000);
        ok(sent, `${tag}: 말한 질문이 서버로 갔다 — note=${await note()}`);
        if (!sent) { await ev(`document.getElementById('askClose').click()`); continue; }
        await sleep(150);
        ok(asks.length === 1, `${tag}: 질문은 한 번만 간다 (${asks.length})`);
        ok(stt.length === 1 && stt[0] === lang, `${tag}: 받아쓰기는 한 번, 마지막 버튼 언어(${lang}) stt=${JSON.stringify(stt)}`);
        ok(asks[0].q === 'WHISPER ' + lang + ' question', `${tag}: 받아 적은 글자 그대로 묻는다 «${asks[0].q}»`);
        const srAsk = await ev(`window.__srLog.filter(x=>x.askOpen).length`);
        ok(srAsk === 0, `${tag}: (짝) 질문하는 동안 브라우저 음성인식을 켜지 않는다 (${srAsk})`);
        continue;
      }
      // 묻지 않는 경우들 — 사실대로 말하고, 버튼이 원래대로 돌아온다
      const want = { silent: /소리가 (들어오지 않았어요|작게)/, hallucinate: /소리가 (작게|들어오지 않았어요)/, denied: /마이크를 쓸 수 없어요/, server: /받아 적지 못했어요/ }[mode];
      ok(await waitFor(`${want}.test(document.getElementById('askNote').textContent)`, 14000), `${tag}: 사실대로 말한다 — note=${await note()}`);
      await sleep(400);
      ok(asks.length === 0, `${tag}: (짝) 질문을 보내지 않는다 asks=${JSON.stringify(asks.map((a) => a.q))}`);
      ok(await ev(idle), `${tag}: 버튼이 원래대로 돌아온다`);
      await ev(`document.getElementById('askClose').click()`);
    }
  } catch (e) { ok(false, '실행 실패: ' + e.message); }
  for (const f of fails) console.log('  ❌ ' + f);
  console.log(`모드별 시도: ${JSON.stringify(tally)} · seed=${SEED0}`);
  console.log(`결과: PASS ${pass} / FAIL ${fail}`);
  try { chrome.kill(); } catch (e) {} srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); fs.rmSync(WAV, { force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
