// 🎤 음성 코칭(speech-coach.html) 서버 Azure 채점 — 브라우저 검사 (2026-11-09)
// Speech coach server-side Azure scoring — real Chromium check
//
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//     node test-harness/manual/speech-coach-server-azure-browser.mjs
//     SC_PAGE=/경로/변이본.html node …     # 변이시험(그 파일을 speech-coach.html 대신 서빙)
//
// 진짜 화면을 크로미움에 띄우고 /api/voice/transcribe · /api/voice/coach 만 가짜로 답한다.
// 화면의 processAudio 를 «실제로» 불러 다음을 잰다:
//   ① 서버가 점수를 주면 → 브라우저 SDK·토큰을 안 부르고, 그 점수(운율 포함)가 화면에 그려진다
//   ② 서버가 Azure 에 못 닿으면(http_401·recog_Error) → 브라우저 SDK 로 한 번 더 잰다(짝)
//   ③ 서버가 «말 없음»(recog_NoMatch) 이면 → SDK 를 안 부르고 운율 표시도 없다
//   ④ 로그인 토큰을 Authorization 으로 싣고 reference 를 보내며 prompt 는 안 보낸다
//   ⑤ 영어 화면이면 운율 표시가 «Prosody N»
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = path.join(ROOT, 'cloudflare-deploy/public');
const PAGE_SRC = process.env.SC_PAGE || path.join(PUB, 'speech-coach.html');
const CHROME = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find(p => fs.existsSync(p));

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300)); }
};

/* ── 가짜 서버: 정적 파일 + 세 창구만 가짜 ── */
const SRV_OK = { ok: true, scoreFieldsPresent: true, accuracy: 98, fluency: 98, completeness: 100, pron: 93, prosody: 83,
  text: 'Hello I am a student.', words: [{ word: 'hello', accuracy: 99, errorType: 'None' }, { word: 'student', accuracy: 52, errorType: 'Mispronunciation' }] };
let scenario = 'ok';
const seen = [];   // 서버가 받은 요청 기록
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const readBody = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/voice/transcribe') {
    const body = (await readBody(req)).toString('latin1');
    const field = n => { const m = body.match(new RegExp('name="' + n + '"\\r\\n\\r\\n([^\\r]*)')); return m ? m[1] : null; };
    seen.push({ p: u.pathname, auth: req.headers.authorization || '', reference: field('reference'), prompt: field('prompt'), lang: field('lang') });
    const base = { ok: true, text: 'hello i am student', segments: [{ avg_logprob: -0.2, start: 0, end: 1, text: 'hello i am student' }] };
    if (scenario === 'ok') return json({ ...base, azure: SRV_OK, azure_diag: 'ok' });
    return json({ ...base, azure: null, azure_diag: scenario });
  }
  if (u.pathname === '/api/voice/coach') {
    const b = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    seen.push({ p: u.pathname, azure: b.azure, azure_diag: b.azure_diag, spoken: b.spoken });
    return json({ ok: true, scores: { overall: 91, accuracy: 95, pronunciation: 93, fluency: 90 }, feedback: 'Nice reading.', suggestion: 'Say student slowly.', tier: { tier: 'A', emoji: '⭐', label_ko: '잘했어요', label_en: 'Great' } });
  }
  if (u.pathname.startsWith('/api/')) { seen.push({ p: u.pathname }); return json({ ok: false, error: 'test_stub' }); }
  const p = u.pathname === '/speech-coach.html' ? PAGE_SRC : path.join(PUB, decodeURIComponent(u.pathname));
  if (!p.startsWith(PUB) && p !== PAGE_SRC) { res.writeHead(403); return res.end(); }
  if (u.pathname.startsWith('/vendor/')) seen.push({ p: u.pathname });
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

if (!CHROME) { console.log('⏭ Chromium 이 없어 건너뜁니다(확인 안 함 ≠ 문제없음)'); process.exit(2); }
const PORT = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--remote-debugging-port=' + PORT, '--mute-audio', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch (_) {} try { server.close(); } catch (_) {} };
process.on('exit', cleanup);

let list = null;
for (let i = 0; i < 50 && !list; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch (_) { await new Promise(r => setTimeout(r, 200)); }
}
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let mid = 0; const pend = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => Promise.race([
  new Promise(r => { const i = ++mid; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); }),
  new Promise(r => setTimeout(() => r({ result: { exceptionDetails: { exception: { description: 'TIMEOUT ' + method } } } }), 20000))]);
const ev = async (expr) => {
  const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (m.result && m.result.exceptionDetails) return { __err: m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description };
  return m.result && m.result.result ? m.result.result.value : undefined;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dialogs = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }); } });
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });

/* 화면 하나를 열고 processAudio 를 실제로 부른다. 브라우저 SDK(SpeechAzure.assess)는 스파이로 감싸 «불렸는가» 만 센다 */
async function runCase(name, opts) {
  scenario = opts.scenario; seen.length = 0;
  await send('Page.navigate', { url: ORIGIN + '/speech-coach.html?_nc=' + Date.now() + '-' + name });
  for (let i = 0; i < 60; i++) { await sleep(150); if (await ev("typeof processAudio === 'function' && !!window.SpeechAzure && document.readyState === 'complete'")) break; }
  await ev(`(function(){
    try { localStorage.setItem('mango_token', ${JSON.stringify(opts.token || '')}); if (!${JSON.stringify(!!opts.token)}) localStorage.removeItem('mango_token'); } catch(e){}
    if (${JSON.stringify(opts.lang || 'ko')} === 'en') { try { (window.setLang || function(){})('en'); } catch(e){} }
    window.__sdkCalls = 0;
    var orig = SpeechAzure.assess;
    SpeechAzure.assess = function(o){ window.__sdkCalls++; return Promise.resolve({ ok: false, reason: 'test_sdk' }); };
    document.getElementById('target-display').textContent = 'Hello, I am a student.';
    return true; })()`);
  const r = await ev(`(async function(){
    var n = 16000, buf = new ArrayBuffer(44 + n*2), v = new DataView(buf), s = function(o,t){ for (var i=0;i<t.length;i++) v.setUint8(o+i, t.charCodeAt(i)); };
    s(0,'RIFF'); v.setUint32(4, 36+n*2, true); s(8,'WAVE'); s(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,16000,true); v.setUint32(28,32000,true); v.setUint16(32,2,true); v.setUint16(34,16,true); s(36,'data'); v.setUint32(40,n*2,true);
    await processAudio(new Blob([buf], { type: 'audio/wav' }));
    var wm = document.getElementById('wordmap');
    return { status: document.getElementById('rec-status').textContent, transcript: document.getElementById('transcript-text').textContent,
      feedback: document.getElementById('feedback-text').textContent, overall: document.getElementById('sc-overall').textContent,
      resultShown: getComputedStyle(document.getElementById('result')).display !== 'none',
      wordmapShown: !!wm && getComputedStyle(wm).display !== 'none', wordmapText: wm ? wm.textContent : '', sdk: window.__sdkCalls };
  })()`);
  return { r, seen: seen.slice() };
}
const tr = s => s.find(x => x.p === '/api/voice/transcribe') || {};
const co = s => s.find(x => x.p === '/api/voice/coach') || {};
const hit = (s, p) => s.some(x => x.p === p);

console.log('① 서버가 점수를 줌 (로그인)');
{
  const { r, seen: s } = await runCase('ok', { scenario: 'ok', token: 'tok-abc' });
  ok('전제: 화면이 끝까지 돌았다(결과 영역이 보인다)', r && !r.__err && r.resultShown, r);
  ok('reference 로 모범 문장을 보낸다', tr(s).reference === 'Hello, I am a student.', tr(s));
  ok('prompt(Whisper 힌트)는 안 보낸다', tr(s).prompt === null, tr(s));
  ok('로그인 토큰을 Authorization 으로 싣는다', tr(s).auth === 'Bearer tok-abc', tr(s).auth);
  ok('브라우저 SDK 를 안 부른다', r && r.sdk === 0, r && r.sdk);
  ok('  SDK 파일·Azure 토큰도 안 받는다', !hit(s, '/vendor/azure-speech-sdk.js') && !hit(s, '/api/voice/azure-token'), s.map(x => x.p));
  ok('코치에 서버 점수를 넘긴다(운율 83)', co(s).azure && co(s).azure.prosody === 83 && co(s).azure.accuracy === 98, co(s).azure);
  ok('  기록 사유는 ok(server)+text', co(s).azure_diag === 'ok(server)+text', co(s).azure_diag);
  ok('  채점 글자는 Azure 가 들은 글자', co(s).spoken === SRV_OK.text, co(s).spoken);
  ok('화면에 운율 표시 «🎵 운율 83점»', r && /^🎵 운율 83점 · 💡 /.test(r.feedback), r && r.feedback);
  ok('단어 지도가 서버 낱말로 그려진다', r && r.wordmapShown && /student/i.test(r.wordmapText), r && r.wordmapText.slice(0, 80));
  ok('들은 글자가 화면에 나온다', r && r.transcript === SRV_OK.text, r && r.transcript);
}
console.log('② 서버가 Azure 에 못 닿음 → 브라우저 SDK 폴백');
for (const reason of ['http_401', 'recog_Error', 'timeout']) {
  const { r, seen: s } = await runCase('fb-' + reason, { scenario: reason, token: '' });
  ok(`(${reason}) 브라우저 SDK 로 한 번 더 잰다`, r && r.sdk === 1, r && (r.__err || r.sdk));
  ok(`(${reason})   기록 사유에 서버·SDK 둘 다`, co(s).azure_diag === 'server:' + reason + '|sdk:test_sdk', co(s).azure_diag);
  ok(`(${reason})   비로그인은 Authorization 을 안 싣는다`, tr(s).auth === '', tr(s).auth);
  ok(`(${reason})   점수 없으니 운율 표시도 없다`, r && /^💡 /.test(r.feedback), r && r.feedback);
}
console.log('③ 서버가 «말 없음» → SDK 다시 안 부름');
for (const reason of ['recog_NoMatch', 'too_long']) {
  const { r, seen: s } = await runCase('skip-' + reason, { scenario: reason, token: '' });
  ok(`(${reason}) 브라우저 SDK 를 안 부른다`, r && r.sdk === 0, r && (r.__err || r.sdk));
  ok(`(${reason})   기록 사유 server:${reason}|sdk:skip`, co(s).azure_diag === 'server:' + reason + '|sdk:skip', co(s).azure_diag);
  ok(`(${reason})   Whisper 글자로 채점`, co(s).spoken === 'hello i am student' && co(s).azure === null, co(s));
  ok(`(${reason})   단어 지도는 감춘다`, r && !r.wordmapShown, r);
}
console.log('④ 영어 화면');
{
  const { r } = await runCase('en', { scenario: 'ok', token: '', lang: 'en' });
  const isEn = await ev("typeof getLang === 'function' && getLang()");
  if (isEn === 'en') ok('영어 화면이면 «🎵 Prosody 83»', r && /^🎵 Prosody 83 · 💡 /.test(r.feedback), r && r.feedback);
  else console.log('  ⏭ 영어로 못 바꿔 건너뜀(getLang=' + isEn + ')');
}
ok('대화상자(alert)가 한 번도 안 떴다', dialogs.length === 0, dialogs);

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
cleanup();
process.exit(fail ? 1 : 0);
