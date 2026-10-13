// ✋🎤 A.i 선생님 수업 — 질문 마이크 «수백 번» 반복 검사 (CDP 직접 · 무작위 타이밍) · 2026-10-13
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:  ITER=300 node test-harness/manual/ai-class-ask-mic-fuzz-browser.mjs
// 사장님 제보: 「한국어로 말하기·영어로 말하기」를 누르면 「듣고 있어요」에서 멈추고 아무 일도 없다.
// 가짜 음성인식(크롬처럼 «한 번에 하나») + 진짜 녹음(가짜 마이크 장치) + 가짜 서버 Whisper 로, 매번 아래 중 하나를 무작위로:
//   ok        브라우저 음성인식이 정상으로 듣는다                    → 그 글자로 묻는다 · (짝) 서버 Whisper 를 안 부른다
//   hang      음성인식이 시작 신호 없이 멈춘다(사장님 화면)          → 4초 뒤 녹음+Whisper 로 묻는다
//   neterr    음성인식이 network 오류                                → 녹음+Whisper 로 묻는다
//   deadend   음성인식이 아무 신호 없이 끝난다                        → 녹음+Whisper 로 묻는다
//   nospeech  듣기는 시작했는데 말이 없었다                          → 사실대로 말하고 · (짝) 아무것도 안 보낸다
// abort 가 끝나는 시간·시작 신호 시간은 매번 무작위(경합을 흔든다). 가끔 두 버튼을 연달아 누른다(마지막 것만 산다).
// 불변식: 언제나 끝에는 «물었거나» «사실대로 말했거나» — 「듣고 있어요」에 머문 채 끝나지 않는다. 언어가 버튼과 맞다.
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
let asks = [], stt = [];
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  if (u.pathname === '/api/voice/transcribe') {
    const ch = []; q.on('data', (c) => ch.push(c)); q.on('end', () => {
      const b = Buffer.concat(ch).toString('latin1'); const m = /name="lang"\r\n\r\n(\w+)/.exec(b); const lang = m ? m[1] : '';
      stt.push(lang);
      r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ ok: true, text: 'WHISPER ' + lang + ' question' }));
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

// 크롬처럼 «한 번에 하나» 인 가짜 음성인식. 모드·지연은 window.__fz 에서 start() 순간에 읽는다.
const FAKE_SR = `(()=>{
  if (sessionStorage.getItem('__noSR') === '1') { try { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; } catch(e){} window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; return; }
  let active = null; window.__srLog = [];
  class FakeSR {
    constructor(){ this.lang=''; this.ended=false; this.hung=false; }
    _fire(n, e){ const f = this['on'+n]; if (f) try { f.call(this, e||{}); } catch(x){} (this._ls&&this._ls[n]||[]).forEach(g=>{ try{ g(e||{}); }catch(x){} }); }
    addEventListener(n, g){ (this._ls=this._ls||{}); (this._ls[n]=this._ls[n]||[]).push(g); }
    start(){
      const fz = window.__fz || {}; const askNote = (document.getElementById('askNote')||{}).textContent || '';
      const isAsk = !!document.getElementById('askBox') && !document.getElementById('askBox').hidden && /듣고 있어요/.test(askNote);
      const mode = isAsk ? (fz.mode || 'ok') : 'idle';
      window.__srLog.push({ lang: this.lang, ask: isAsk, at: Date.now() });
      if (active && !active.ended) { this.hung = true; return; }   // 앞의 것이 안 끝났으면 새 것은 멈춘다
      if (mode === 'hang') { this.hung = true; return; }
      active = this;
      const d = fz.startDelay || 30;
      if (mode === 'deadend') { setTimeout(()=>this._end(), d); return; }
      if (mode === 'neterr') { setTimeout(()=>{ if (this.ended) return; this._fire('error', { error: 'network' }); this._end(); }, d); return; }
      setTimeout(()=>{ if (this.ended) return; this._fire('start'); this._fire('audiostart');
        if (mode === 'nospeech') setTimeout(()=>{ if (this.ended) return; this._fire('error', { error: 'no-speech' }); this._end(); }, 200);
        else if (mode === 'ok') setTimeout(()=>{ if (this.ended) return; this._fire('speechstart'); this._fire('result', { results: [Object.assign([{ transcript: fz.text + ' [' + this.lang + ']' }], { isFinal: true })] }); this._end(); }, 80);
      }, d);
    }
    _end(){ if (this.ended) return; this.ended = true; if (active === this) active = null; this._fire('end'); }
    abort(){ if (this.hung || this.ended) return; setTimeout(()=>this._end(), (window.__fz||{}).abortDelay || 150); }
    stop(){ this.abort(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
})();`;

// 가짜 마이크 소리: 0.3초 조용 → 1.2초 «말»(440Hz) → 3초 조용. 녹음 경로가 «말이 끝났다» 를 알아채게.
const WAV = path.join(os.tmpdir(), 'askfuzz-' + process.pid + '.wav');
(() => { const sr = 16000, n = Math.floor(sr * 4.5), b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / sr; const v = t > 0.3 && t < 1.5 ? Math.round(16000 * Math.sin(2 * Math.PI * 440 * t)) : 0; b.writeInt16LE(v, 44 + i * 2); }
  fs.writeFileSync(WAV, b); })();
const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + WAV + '%noloop', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
async function connect() { for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) {} await sleep(200); } throw new Error('no chrome'); }
function send(method, params = {}) { return new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
let pass = 0, fail = 0; const fails = []; const tally = {};
const ok = (c, m) => { if (c) pass++; else { fail++; if (fails.length < 60) fails.push(m); } };
const waitFor = async (expr, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(40); } return false; };
const waitNode = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(40); } return false; };
const ready = `(()=>{const a=window.__aiClass;return a&&a.state&&a.state.phase==='await'&&!a.busy&&a.state.plan[a.state.i].t!=='find'&&!document.getElementById('askBtn').disabled})()`;
let seed = SEED0; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

async function openLesson(noSR) {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-class.html?r=${Date.now()}#fast` });
  await waitFor('!!window.__aiClass');
  await ev(`localStorage.setItem('aiClassTalk','1'); sessionStorage.setItem('__noSR', ${noSR ? "'1'" : "'0'"})`);
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
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_SR });
    let inPage = 99, noSR = false;
    for (let it = 0; it < ITER; it++) {
      // 한 페이지에서 최대 20번 묻고 새로 연다(수업당 질문 상한 30). 가끔은 음성인식이 아예 없는 브라우저로.
      if (inPage >= 20) { noSR = rnd() < 0.15; const okp = await openLesson(noSR); ok(okp, `#${it}: 수업 화면 준비(noSR=${noSR})`); if (!okp) { inPage = 99; continue; } inPage = 0; }
      inPage++;
      if (!(await waitFor(ready, 10000))) { ok(false, `#${it}: 학생 차례로 돌아오지 않음`); inPage = 99; continue; }
      const mode = noSR ? 'nosr' : pick(['ok', 'ok', 'hang', 'neterr', 'deadend', 'nospeech']);
      const btn = pick(['askMicKo', 'askMicEn']); const lang = btn === 'askMicKo' ? 'ko' : 'en';
      const twice = !noSR && rnd() < 0.15;
      const text = 'Q' + it + ' ' + (lang === 'ko' ? '무슨 뜻이에요' : 'what does it mean');
      const fz = { mode, text, abortDelay: 20 + Math.floor(rnd() * 600), startDelay: 5 + Math.floor(rnd() * 300) };
      tally[mode] = (tally[mode] || 0) + 1;
      asks = []; stt = [];
      if (await ev(`document.getElementById('askBox').hidden`)) await ev(`document.getElementById('askBtn').click()`);
      await ev(`window.__fz=${JSON.stringify(fz)}; window.__srLog=[]`);
      if (twice) { await ev(`document.getElementById('${btn === 'askMicKo' ? 'askMicEn' : 'askMicKo'}').click()`); await sleep(Math.floor(rnd() * 400)); }
      await ev(`document.getElementById('${btn}').click()`);
      const tag = `#${it} ${mode}/${btn}${twice ? '/twice' : ''} abort=${fz.abortDelay} start=${fz.startDelay}`;
      if (mode === 'nospeech') {
        ok(await waitFor(`/소리가 들어오지 않았어요/.test(document.getElementById('askNote').textContent)`, 5000), `${tag}: 사실대로 말한다 — note=${await ev("document.getElementById('askNote').textContent")}`);
        await sleep(300);
        ok(asks.length === 0 && stt.length === 0, `${tag}: (짝) 아무것도 보내지 않는다 asks=${asks.length} stt=${stt.length}`);
        await ev(`document.getElementById('askClose').click()`);
        continue;
      }
      const sent = await waitNode(() => asks.length > 0, mode === 'ok' ? 5000 : 15000);
      ok(sent, `${tag}: 질문이 서버로 갔다(멈추지 않았다) — note=${await ev("document.getElementById('askNote').textContent")}`);
      if (!sent) { await ev(`document.getElementById('askClose').click()`); continue; }
      await sleep(100);
      ok(asks.length === 1, `${tag}: 질문은 한 번만 간다 (${asks.length})`);
      if (mode === 'ok') {
        // 연타면 첫 누름이 두 번째 누름 «전에» 이미 정상으로 끝났을 수 있다 — 그때는 첫 버튼 언어가 맞다
        const want = lang === 'ko' ? 'ko-KR' : 'en-US', other = lang === 'ko' ? 'en-US' : 'ko-KR';
        const m = /^(.*) \[(\w\w-\w\w)\]$/.exec(asks[0].q || '');
        ok(!!m && m[1] === text && (m[2] === want || (twice && m[2] === other)), `${tag}: 들은 글자·언어 그대로 «${asks[0].q}»`);
        ok(stt.length === 0, `${tag}: (짝) 정상일 때 서버 Whisper 를 안 부른다`);
        const log = await ev(`window.__srLog.filter(x=>x.ask).map(x=>x.lang)`);
        ok(!!m && log.includes(m[2]) && (twice || log[log.length - 1] === want), `${tag}: 음성인식 언어 ${JSON.stringify(log)}`);
      } else {
        ok(stt.length === 1 && stt[0] === lang, `${tag}: 녹음+Whisper 로 받았다, 언어=${lang} stt=${JSON.stringify(stt)}`);
        ok(asks[0].q === 'WHISPER ' + lang + ' question', `${tag}: Whisper 글자로 묻는다 «${asks[0].q}»`);
      }
    }
  } catch (e) { ok(false, '실행 실패: ' + e.message); }
  for (const f of fails) console.log('  ❌ ' + f);
  console.log(`모드별 시도: ${JSON.stringify(tally)} · seed=${SEED0}`);
  console.log(`결과: PASS ${pass} / FAIL ${fail}`);
  try { chrome.kill(); } catch (e) {} srv.close(); try { fs.rmSync(PROF, { recursive: true, force: true }); fs.rmSync(WAV, { force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
