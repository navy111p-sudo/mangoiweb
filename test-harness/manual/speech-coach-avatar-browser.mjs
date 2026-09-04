// -*- coding: utf-8 -*-
/**
 * 👩‍🏫 「음성 코칭 아바타 입모양이 실제로 움직이는가」 — 진짜 Chromium 으로 확인 (2026-09-04)
 * ---------------------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   이 결함은 «함수가 있는가» 가 아니라 «캔버스가 실제로 바뀌는가» 였다. 문자열 하니스는
 *   그것을 못 본다 — 수리 전에도 `--fast` 264건이 전부 초록이었다. 그래서 실제로 그려서
 *   캔버스 픽셀 체크섬이 몇 종류나 나오는지를 센다.
 *
 * 무엇을 재나 — 소리가 나는 네 갈래를 각각 판다:
 *   A) Emma + 커리큘럼 문장  → 미리 만든 립싱크 클립(playClip). 원래 되던 길(회귀 감시).
 *   B) Emma + 직접 입력 문장 → 서버 TTS (영상 캐릭터)
 *   C) Lily + 커리큘럼 문장  → 서버 TTS (이미지 캐릭터 — 클립은 Emma 전용이라 안 씀)
 *   D) 단어 하나 듣기        → 서버 TTS
 *   B·C·D 는 2026-09-04 수리 전까지 전부 «멈춤» 이었다(plainStart 를 안 불러 그리기 루프가
 *   시작조차 안 했다). A 만 멀쩡해서 «Emma 로 커리큘럼 문장만 들으면 정상» 으로 보였다.
 *
 * ⚠️ 이 검사는 playwright 를 쓰지 않는다 — CDP 로 직접 말한다(Node 22 는 WebSocket 이 전역).
 *    그래서 node_modules 가 없는 컨테이너에서도 그대로 돈다.
 * ⚠️ 정적 서버는 반드시 **Range(206)** 를 줘야 한다. 안 주면 `<video>` 의 seekable 이
 *    [[0,0]] 이 되어 입모양 타임스탬프 seek 이 통째로 씹히고, **고친 화면이 «안 고쳐진»
 *    것으로 측정된다**(2026-09-04 실제로 그렇게 한 번 오판했다 — CLAUDE.md 2장에 적어 둠).
 *    python3 -m http.server 는 Range 를 안 주므로 여기서는 쓸 수 없다.
 * ⚠️ ttsAudio 는 `let` 이라 window 에 안 붙고, `new Audio()` 는 DOM 에도 없다 —
 *    상태를 보려면 bare 이름으로 읽어야 한다(이 파일은 캔버스만 보므로 해당 없음).
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. speech-coach.html 의 TTS 재생 경로나
 *    js/mango-avatar.js 의 plainStart/loop 를 건드리면 사람이 불러야 한다:
 *      node test-harness/manual/speech-coach-avatar-browser.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = path.join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8941;
const CDP = 9333;

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Chromium 실행 파일 — 이 컨테이너의 표준 위치를 훑는다. */
function findChrome() {
  const cands = [];
  const base = '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      if (!/^chromium/.test(d)) continue;
      cands.push(path.join(base, d, 'chrome-linux', 'chrome'));
      cands.push(path.join(base, d, 'chrome-linux', 'headless_shell'));
    }
  }
  cands.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome');
  return cands.find(p => fs.existsSync(p)) || null;
}

/* ── 말하는 리듬처럼 세기가 오르내리는 톤 WAV — 음량 립싱크(RMS)가 진짜로 돌게 한다 ── */
function toneWav(seconds = 1.6, rate = 16000) {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  // ⚠️ 진폭이 중요하다 — 아바타의 tierFor 는 RMS 0.04 이하 closed · 0.09 이하 medium · 그 위 wide.
  //    26000 으로 만들면 RMS 0.14~0.53 이라 **전부 wide** 가 되어 입모양이 한 번도 안 바뀌고,
  //    그러면 이 검사는 «그리기 루프가 도는가» 까지만 재게 된다(2026-09-04 실제로 그 상태였다).
  //    7000 이면 RMS 0.003~0.151 로 세 단계를 모두 지난다.
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = 0.02 + 0.98 * Math.abs(Math.sin(2 * Math.PI * 1.7 * t));
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * t) * env * 7000), 44 + i * 2);
  }
  return buf;
}
const WAV = toneWav();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p === '/api/voice/tts') {
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'X-TTS-Engine': 'stub',
      'X-TTS-Speaker': String(u.searchParams.get('speaker') || 'asteria') });
    res.end(WAV); return;
  }
  if (p.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, items: [] })); return;
  }
  if (p === '/') p = '/index.html';
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  const stat = fs.statSync(file);
  const type = MIME[path.extname(file)] || 'application/octet-stream';
  const range = req.headers.range;   // ⚠️ 이게 없으면 video.seekable 이 [[0,0]] 이 된다
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
      fs.createReadStream(file, { start, end }).pipe(res); return;
    }
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
    'Content-Length': stat.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

/* ── CDP ── */
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) { const i = ++id;
        ws.send(JSON.stringify({ id: i, method, params }));
        return new Promise((res, rej) => pending.set(i, { res, rej })); },
      close() { try { ws.close(); } catch (_) {} } });
    ws.onerror = reject;
    ws.onmessage = ev => { const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  });
}

const CASES = [
  { id: 'A', friend: 'emma', label: 'Emma + 커리큘럼 문장 → 립싱크 클립(원래 되던 길)',
    setup: `document.getElementById('target-input').value='Thank you very much for your help.';`,
    call: 'speakTarget()' },
  { id: 'B', friend: 'emma', label: 'Emma + 직접 입력 문장 → 서버 TTS(영상 캐릭터)',
    setup: `document.getElementById('target-input').value='I went to the park yesterday.';`,
    call: 'speakTarget()' },
  { id: 'C', friend: 'lily', label: 'Lily + 커리큘럼 문장 → 서버 TTS(이미지 캐릭터)',
    setup: `document.getElementById('target-input').value='Thank you very much for your help.';`,
    call: 'speakTarget()' },
  { id: 'D', friend: 'emma', label: '단어 하나 듣기 → 서버 TTS',
    setup: ``, call: `speakWord('help')` },
];

const exe = findChrome();
if (!exe) { console.log('⏭ Chromium 을 못 찾아 건너뜁니다(이 검사는 브라우저가 필요합니다).'); process.exit(0); }

// ⚠️ 앞 실행이 남아 포트를 쥐고 있으면 «검사 실패» 가 아니라 «환경» 이다 — 그렇게 말하고 끝낸다.
server.on('error', (e) => {
  console.log(e && e.code === 'EADDRINUSE'
    ? `⏭ 포트 ${PORT} 를 이미 누가 쓰고 있어 건너뜁니다(앞 실행이 남았을 수 있습니다: fuser -k -n tcp ${PORT}).`
    : '⏭ 검사 서버를 못 띄워 건너뜁니다: ' + (e && e.message));
  try { chrome && chrome.kill(); } catch (_) {}
  process.exit(0);
});
server.listen(PORT);
await sleep(400);
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--window-size=1280,900',
  `--user-data-dir=/tmp/sc-avatar-${process.pid}`, 'about:blank'], { stdio: 'ignore' });

const cleanup = () => { try { chrome.kill(); } catch (_) {} try { server.close(); } catch (_) {} };
process.on('exit', cleanup);

let c;
try {
  for (let i = 0; i < 30 && !c; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      const t = list.find(x => x.type === 'page');
      if (t) c = await connect(t.webSocketDebuggerUrl);
    } catch (_) {}
  }
} catch (_) {}
if (!c) { console.log('⏭ Chromium 에 붙지 못해 건너뜁니다.'); cleanup(); process.exit(0); }

await c.send('Page.enable'); await c.send('Runtime.enable'); await c.send('Network.enable');
await c.send('Network.setBypassServiceWorker', { bypass: true });   // ⚠️ SW cache-first 를 끄지 않으면 옛 사본을 잰다
await c.send('Network.setCacheDisabled', { cacheDisabled: true });
await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });

const ev = async (expr, awaitP = false) => {
  const r = await c.send('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: awaitP, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
};

console.log('\n════════ 음성 코칭 아바타 입모양 (브라우저 실측) ════════\n');

// ① 재는 판이 성립하는가 — 영상이 실제로 탐색 가능한지 먼저 못 박는다(안 그러면 아래가 통째로 헛돈다)
await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/speech-coach.html?_nc=${Date.now()}` });
await sleep(4000);
const env = await ev(`(()=>{ const v=document.getElementById('tavatar-video');
  const s=[]; for(let i=0;i<v.seekable.length;i++) s.push([v.seekable.start(i), v.seekable.end(i)]);
  return { canvas: !!document.getElementById('tavatar-canvas'), avatar: !!window.MangoAvatar,
           rs: v.readyState, seekEnd: s.length ? s[s.length-1][1] : 0 }; })()`);
ok('① 아바타 캔버스와 모듈이 있다', env.canvas && env.avatar, JSON.stringify(env));
ok('① 아바타 영상이 «탐색 가능» 하다(서버가 Range 를 준다)', env.seekEnd > 1,
   `seekable 끝=${env.seekEnd} — 0 이면 서버가 206 을 안 준 것이고, 그러면 아래 판정이 전부 거짓 실패가 된다`);

// ② 네 갈래를 각각 재서 «캔버스가 실제로 바뀌는가» 를 본다
for (const cs of CASES) {
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/speech-coach.html?_nc=${Date.now()}` });
  await sleep(1200);
  await ev(`localStorage.setItem('mangoi_speechcoach_friend', ${JSON.stringify(cs.friend)})`);
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/speech-coach.html?_nc=${Date.now()}` });
  await sleep(3800);
  await ev(`(()=>{
    const cv=document.getElementById('tavatar-canvas');
    const cx=cv.getContext('2d',{willReadFrequently:true});
    window.__shots=[]; window.__speak=[]; clearInterval(window.__probeIv);
    window.__probeIv=setInterval(()=>{ try{
      const d=cx.getImageData(0,0,cv.width,cv.height).data;
      let h=0; for(let i=0;i<d.length;i+=997) h=(h*31+d[i])>>>0;
      window.__shots.push(h);
      window.__speak.push(document.getElementById('tavatar-wrap').classList.contains('speaking'));
    }catch(e){ window.__shots.push('E'); } },80);
    ${cs.setup}
    return true; })()`);
  await sleep(500);
  await ev(`window.__shots=[]; window.__speak=[]; ${cs.call}; true`);
  await sleep(3000);
  const r = await ev(`(()=>{ const s=window.__shots, sp=window.__speak;
    clearInterval(window.__probeIv);
    return { frames:s.length, distinct:[...new Set(s)].length, speaking: sp.filter(Boolean).length }; })()`);
  ok(`② ${cs.id}) ${cs.label} — 입이 움직인다`, r.distinct >= 3,
     `캔버스 변화 ${r.distinct}종 / ${r.frames}프레임 · speaking ${r.speaking}틱`);
  ok(`②-2 ${cs.id}) 말하는 동안 «말하는 중» 표시가 켜진다`, r.speaking >= 3,
     `speaking ${r.speaking}틱 — 0 이면 plainStart 가 아예 안 불린 것이다`);
}

/* ── ③ 「소리 없이 입만 움직인다」 안전망 (2026-09-04) ──
   analyzed:false 분기에는 위쪽 «5초 무음» 안전망이 없다. plainStop 이 유실되면
   (크롬의 speechSynthesis onend 유실은 알려진 문제) 입이 영원히 움직인다 —
   이 파일이 2026-07-26 에 일부러 좁혀 둔 「말은 안 하는데 입만 움직인다」 그 모양이다.
   ⚠️ «멈춘다» 만 재면 반대로 무너진다(전부 멈춰도 통과) — «말하는 중엔 안 멈춘다» 를
      반드시 짝으로 잰다. 그리고 «인자 없이 부른 기존 호출자» 가 영향을 안 받는지도. */
await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/speech-coach.html?_nc=${Date.now()}` });
await sleep(3500);

/** window.speechSynthesis 를 가짜로 바꿔 놓고 plainStart 를 부른 뒤, 그리기가 살아 있는지 본다. */
async function speakingAfter(opts, fakeSpeaking, waitMs) {
  return await ev(`(async()=>{
    try{ Object.defineProperty(window,'speechSynthesis',
      { value:{ __fake:true, speaking:${fakeSpeaking}, pending:false, cancel(){}, speak(){} }, configurable:true }); }catch(e){}
    try{ window.MangoAvatar.plainStop(); }catch(e){}
    window.MangoAvatar.plainStart(${opts});
    await new Promise(r=>setTimeout(r, ${waitMs}));
    const on = document.getElementById('tavatar-wrap').classList.contains('speaking');
    try{ window.MangoAvatar.plainStop(); }catch(e){}
    return { on, faked: (()=>{ try{ return window.speechSynthesis && window.speechSynthesis.__fake === true; }catch(e){ return false; } })() };
  })()`, true);
}

const s3a = await speakingAfter('{ analyzed: false }', 'false', 2500);
ok('③ analyzed:false 인데 음성합성이 조용하면 스스로 멈춘다(입만 움직이지 않는다)',
   s3a.on === false, `2.5초 뒤 speaking=${s3a.on} · 가짜설치=${s3a.faked}` +
   (s3a.faked ? ' — 안전망이 안 도는 것이다' : ' — 가짜를 못 심었으니 «검사 환경» 문제다'));
ok('③-2 analyzed:false 라도 «말하는 중» 이면 안 멈춘다',
   (await speakingAfter('{ analyzed: false }', 'true', 2500)).on === true,
   '말하는 동안 끊기면 한국어 발화에서 입이 곧바로 멎는다');
ok('③-3 인자 없이 부른 기존 호출자(warmup·ai-friend)는 영향받지 않는다',
   (await speakingAfter('', 'false', 2500)).on === true,
   '옛 호출이 조용히 멈추면 다른 화면의 아바타가 죽는다');

/* ── ④ 같은 문장을 연달아 두 번 (캐시 적중 — await 가 하나도 없는 경로) ──
   재생 직전 ttsAudio.pause() 가 새로 단 'pause'→plainStop 을 깨우므로, 두 번째 재생에서
   pause 와 playing 의 순서가 어긋나면 입이 죽는다. 1회만 재면 안 보인다. */
await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/speech-coach.html?_nc=${Date.now()}` });
await sleep(3800);
await ev(`document.getElementById('target-input').value='I went to the park yesterday.'; true`);
await ev(`speakTarget(); true`);            // 1회차 — 캐시를 채운다
await sleep(2600);
await ev(`(()=>{
  const cv=document.getElementById('tavatar-canvas');
  const cx=cv.getContext('2d',{willReadFrequently:true});
  window.__shots=[]; clearInterval(window.__probeIv);
  window.__probeIv=setInterval(()=>{ try{
    const d=cx.getImageData(0,0,cv.width,cv.height).data;
    let h=0; for(let i=0;i<d.length;i+=997) h=(h*31+d[i])>>>0;
    window.__shots.push(h);
  }catch(e){ window.__shots.push('E'); } },80);
  return true; })()`);
await ev(`speakTarget(); true`);            // 2회차 — 캐시 적중이라 await 가 없다
await sleep(3000);
const again = await ev(`(()=>{ clearInterval(window.__probeIv);
  return { distinct:[...new Set(window.__shots)].length, frames:window.__shots.length }; })()`);
ok('④ 같은 문장을 연달아 두 번 재생해도 입이 움직인다(캐시 적중 경로)',
   again.distinct >= 3, `캔버스 변화 ${again.distinct}종 / ${again.frames}프레임`);

console.log(`\n${pass} PASS / ${fail} 실패`);
if (fail) {
  console.log('\n💡 되돌려 보면 실제로 FAIL 이 나는지 확인하세요(변이시험):');
  console.log('   speech-coach.html 의 scEnsureTtsAudio() 배선을 빼면 B·C·D 가 «멈춤» 으로 돌아갑니다.');
}
cleanup();
process.exit(fail ? 1 : 0);
