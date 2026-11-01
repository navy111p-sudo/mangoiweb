// 🐢🐇 A.i 발음연습(speech-coach.html) 듣기 속도 — 브라우저 샌드박스 검사 (2026-10-12)
//
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//     node test-harness/manual/speech-coach-rate-browser.mjs            # 1회
//     ROUNDS=5 node test-harness/manual/speech-coach-rate-browser.mjs   # 5회 반복(퍼즈 씨앗이 회차마다 다름)
//     SC_PAGE=/경로/변이본.html node …                                   # 변이시험(그 파일을 speech-coach.html 대신 서빙)
//
// playwright 없이 Chromium 을 CDP 로 직접 말합니다(Node 22 의 전역 WebSocket).
// 서버 TTS(/api/voice/tts)는 «진짜로 재생되는» WAV 로 가짜 응답을 주고,
// ttsAudio.playbackRate · speechSynthesis 의 u.rate · 립싱크 클립 호출 · 저장 · 화면 배치를 «실제로» 잽니다.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = path.join(ROOT, 'cloudflare-deploy/public');
const PAGE_SRC = process.env.SC_PAGE || path.join(PUB, 'speech-coach.html');
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find(p => fs.existsSync(p));
const ROUNDS = Math.max(1, parseInt(process.env.ROUNDS || '1', 10));

let pass = 0, fail = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; fails.push(name); console.log('  ❌ FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); }
};

// ── 정적 서버 (변이본을 speech-coach.html 로 서빙할 수 있게 직접 만든다)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webm': 'video/webm', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"ok":false}'); }
  let p = u.pathname === '/speech-coach.html' ? PAGE_SRC : path.join(PUB, decodeURIComponent(u.pathname));
  if (!p.startsWith(PUB) && p !== PAGE_SRC) { res.writeHead(403); return res.end(); }
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
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--remote-debugging-port=' + PORT,
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
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
  new Promise(r => setTimeout(() => r({ result: { exceptionDetails: { exception: { description: 'TIMEOUT ' + method + ' ' + String(params.expression || params.url || '').slice(0, 80) } } } }), 10000))]);
const STEP = (t) => { if (process.env.DEBUG) console.log('   ·', t); };
const ev = async (expr) => {
  const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (m.result && m.result.exceptionDetails) return { __err: m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description };
  return m.result && m.result.result ? m.result.result.value : undefined;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable');
// 대화상자(alert 등)가 뜨면 페이지가 멈춘다 — 닫고 «실패» 로 센다
const dialogs = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); send('Page.handleJavaScriptDialog', { accept: true }); } });
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });

// 페이지보다 «먼저» 깔리는 스텁 — 서버 TTS 를 «재생되는» WAV 로, 브라우저 음성을 기록기로.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){
  function wav(sec){ var sr=8000,n=sr*sec,b=new ArrayBuffer(44+n*2),v=new DataView(b);
    function s(o,t){for(var i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i));}
    s(0,'RIFF');v.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);s(36,'data');v.setUint32(40,n*2,true);
    for(var i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/6)*3000,true); return b; }
  window.__tts=[]; window.__said=[];
  var of=window.fetch;
  window.fetch=function(u,o){ var url=String(u&&u.url||u);
    if(url.indexOf('/api/voice/tts')>=0){ var b={}; try{b=JSON.parse(o&&o.body||'{}');}catch(e){}
      window.__tts.push(b);
      return Promise.resolve(new Response(wav(6),{status:200,headers:{'content-type':'audio/wav','X-TTS-Speaker':String(b.speaker||'')}})); }
    return of.apply(this,arguments); };
  try{
    var fakeV=[{lang:'en-US',name:'Fake EN',voiceURI:'fen'},{lang:'ko-KR',name:'Fake KO',voiceURI:'fko'},{lang:'zh-CN',name:'Fake ZH',voiceURI:'fzh'}];
    speechSynthesis.getVoices=function(){return fakeV;};
    // 진짜 SpeechSynthesisVoice 만 받는 setter 를 기록기로 바꾼다(가짜 음성으로 alert 가 떠 멈추던 것 — 검사 쪽 문제)
    Object.defineProperty(SpeechSynthesisUtterance.prototype,'voice',{configurable:true,get:function(){return this.__v||null;},set:function(v){this.__v=v;}});
    speechSynthesis.speak=function(u){ window.__said.push({text:u.text,rate:u.rate,lang:u.lang}); };
    speechSynthesis.cancel=function(){};
  }catch(e){}
})();` });

async function open(w = 1280, h = 900, mobile = false) {
  STEP('open ' + w);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url: ORIGIN + '/speech-coach.html?_nc=' + Date.now() + Math.random() });
  for (let i = 0; i < 60; i++) {
    await sleep(150);
    const ready = await ev(`!!(document.readyState==='complete' && document.getElementById('sc-rate-slider') && typeof scSetRate==='function')`);
    if (ready === true) break;
  }
  await sleep(400);
  await ev(`(function(){ window.__clips=[]; if(window.MangoAvatar){ MangoAvatar.playClip=function(id){ window.__clips.push(id); return Promise.resolve(); }; } return true; })()`);
}
async function clearStorage() {
  // ⚠️ Storage.clearDataForOrigin 은 «이 탭의» sessionStorage 를 안 지운다 — 손님 저장값이 다음 절로 샜다. 페이지에서 직접 지운다.
  await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'local_storage,session_storage' });
  await ev(`(function(){ try{ localStorage.clear(); sessionStorage.clear(); }catch(e){} return true; })()`);
}
const setSlider = (lv) => ev(`(function(){ var s=document.getElementById('sc-rate-slider'); s.value=${lv}; s.dispatchEvent(new Event('input',{bubbles:true})); return s.value; })()`);
const STEPS = { 1: 0.5, 2: 0.65, 3: 0.8, 4: 1.0, 5: 1.25 };
const expectRate = (lv, male, lang) => (lang === 'en' && male && STEPS[lv] < 0.9) ? 0.9 : STEPS[lv];

// 서버 TTS 경로로 한 문장 읽게 하고, 실제 재생 중인 ttsAudio 의 배속을 읽는다.
async function speakAndRead(text, fn = 'speakTarget') {
  STEP('speak ' + fn + ' ' + text);
  return ev(`(async function(){
    window.__clips=[]; window.__said=[];
    ${fn === 'speakTarget'
      ? `var i=document.getElementById('target-input'); i.value=${JSON.stringify(text)}; document.getElementById('target-display').textContent=i.value; await speakTarget();`
      : `await speakWord(${JSON.stringify(text)});`}
    await new Promise(function(r){setTimeout(r,250);});
    var a = (typeof ttsAudio!=='undefined') ? ttsAudio : null;
    return { rate: a ? a.playbackRate : null, playing: a ? !a.paused : false, pitch: a ? a.preservesPitch : null,
             clips: window.__clips.length, said: window.__said.slice(), tts: window.__tts.length };
  })()`);
}

async function round(r) {
  const seed = (Date.now() + r * 7919) >>> 0;
  let st = seed; const rnd = () => ((st = (st * 1103515245 + 12345) >>> 0) / 4294967296);
  console.log(`\n▶ 회차 ${r + 1}/${ROUNDS} (퍼즈 씨앗 ${seed})`);

  // ① 처음 들어오면 «보통»
  await clearStorage(); await open();
  ok(`[${r}] ① 슬라이더 기본 3`, (await ev(`document.getElementById('sc-rate-slider').value`)) === '3');
  ok(`[${r}] ① 표시 «3 · 보통 (0.8배)»`, (await ev(`document.getElementById('sc-rate-val').textContent`)) === '3 · 보통 (0.8배)');

  // ② Emma(여자) 다섯 칸 — 서버 음성의 실제 배속·음높이 유지
  for (let lv = 1; lv <= 5; lv++) {
    await setSlider(lv);
    const res = await speakAndRead('I like apples very much ' + lv + '.');
    ok(`[${r}] ② Emma 칸${lv} 배속 ${STEPS[lv]}`, res.rate === STEPS[lv] && res.playing, res);
    ok(`[${r}] ② 칸${lv} 음높이 유지(preservesPitch)`, res.pitch === true, res.pitch);
  }
  // ②-b 단어 칩(speakWord)도 같은 속도
  await setSlider(2);
  { const res = await speakAndRead('banana', 'speakWord'); ok(`[${r}] ②-b 단어 칩도 0.65`, res.rate === 0.65, res); }

  // ③ 읽는 «도중» 에 바꾸면 그 자리에서 바뀐다
  await setSlider(3);
  await speakAndRead('Long sentence for changing speed mid play.');
  await setSlider(1);
  { const v = await ev(`({rate:ttsAudio.playbackRate, playing:!ttsAudio.paused})`); ok(`[${r}] ③ 재생 중 칸1로 → 0.5`, v.rate === 0.5 && v.playing, v); }
  await setSlider(5);
  { const v = await ev(`ttsAudio.playbackRate`); ok(`[${r}] ③ 재생 중 칸5로 → 1.25`, v === 1.25, v); }

  // ④ 남자(Jake·Noah) — 0.9 밑으로 안 감, 빠른 칸은 그대로
  for (const who of ['jake', 'noah']) {
    await ev(`scSetFriend('${who}', false)`);
    for (const lv of [1, 2, 3, 4, 5]) {
      await setSlider(lv);
      const res = await speakAndRead(`Testing ${who} voice ${lv}.`);
      ok(`[${r}] ④ ${who} 칸${lv} → ${expectRate(lv, true, 'en')}`, res.rate === expectRate(lv, true, 'en'), res);
    }
  }
  // ⑤ 중국어는 남자여도 고른 값 그대로
  await setSlider(1);
  { const res = await speakAndRead('你好，很高兴认识你。'); ok(`[${r}] ⑤ 중국어 칸1 → 0.5(남자 규칙 없음)`, res.rate === 0.5, res); }
  // ⑥ 한국어는 브라우저 음성 — u.rate 에도 고른 속도
  await setSlider(2);
  { const res = await speakAndRead('안녕하세요 반가워요'); STEP(JSON.stringify(res)); ok(`[${r}] ⑥ 한국어(브라우저 음성) u.rate 0.65`, res.said && res.said.length === 1 && Math.abs(res.said[0].rate - 0.65) < 1e-6, res); }

  // ⑦ 립싱크 클립 — Emma·«보통»·커리큘럼 문장일 때만, 다른 칸이면 TTS(속도 적용)
  await ev(`scSetFriend('emma', false)`);
  const clipLine = await ev(`Object.keys(SAY_CLIPS)[0]`);
  await setSlider(3);
  { const res = await speakAndRead(clipLine); ok(`[${r}] ⑦ 보통이면 립싱크 클립`, res.clips === 1, res); }
  await setSlider(2);
  { const res = await speakAndRead(clipLine); ok(`[${r}] ⑦ (짝) 느리게면 클립 대신 TTS 0.65`, res.clips === 0 && res.rate === 0.65, res); }
  await ev(`scSetFriend('jake', false)`); await setSlider(3);
  { const res = await speakAndRead(clipLine); ok(`[${r}] ⑦ (짝) Jake 보통이면 클립 안 씀(Emma 얼굴 전용)`, res.clips === 0 && res.rate === 0.9, res); }
  await ev(`scSetFriend('emma', false)`);

  // ⑧ 저장 — 손님(sessionStorage): 새로고침해도 유지
  await setSlider(4); await sleep(200);
  await open();
  ok(`[${r}] ⑧ 손님 새로고침 뒤에도 칸4`, (await ev(`document.getElementById('sc-rate-slider').value`)) === '4');
  ok(`[${r}] ⑧ 새로고침 뒤 실제 배속 1.0`, (await speakAndRead('After reload check.')).rate === 1);
  // ⑧-b 로그인 학생(localStorage, 서버 저장이 실패해도 기기에 남음)
  await clearStorage();
  await ev(`localStorage.setItem('mango_user', JSON.stringify({uid:'sbx_kid_${r}', name:'sbx'})); true`);
  await open(); await setSlider(1); await sleep(300);
  await open();
  ok(`[${r}] ⑧-b 로그인 학생 새로고침 뒤 칸1`, (await ev(`document.getElementById('sc-rate-slider').value`)) === '1');
  // ⑧-c 다른 학생으로 바꾸면 남의 설정을 안 물려받음
  await ev(`localStorage.setItem('mango_user', JSON.stringify({uid:'sbx_other_${r}'})); true`);
  await open();
  ok(`[${r}] ⑧-c 다른 학생은 기본 3`, (await ev(`document.getElementById('sc-rate-slider').value`)) === '3');
  // ⑧-d 저장값이 엉터리여도 기본으로
  await ev(`(function(){ for (var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k.indexOf('mangoi_speech_rate_v1:')===0 && k.indexOf(':coach')>0) localStorage.setItem(k, '{"level":99}'); } return true; })()`);
  await open();
  ok(`[${r}] ⑧-d 엉터리 저장값 → 3`, (await ev(`document.getElementById('sc-rate-slider').value`)) === '3');
  await clearStorage();

  // ⑨ 영어 화면 표시
  await open();
  await ev(`(function(){ if (window.setLang) setLang('en'); else if (window.toggleLang) toggleLang(); return true; })()`);
  await sleep(300);
  { const t = await ev(`document.getElementById('sc-rate-val').textContent`); ok(`[${r}] ⑨ EN «3 · Normal (0.8x)»`, t === '3 · Normal (0.8x)', t); }
  await setSlider(5);
  { const t = await ev(`document.getElementById('sc-rate-val').textContent`); ok(`[${r}] ⑨ EN 칸5 «Very fast (1.25x)»`, t === '5 · Very fast (1.25x)', t); }
  await ev(`(function(){ if (window.setLang) setLang('ko'); return true; })()`); await sleep(200);
  { const t = await ev(`document.getElementById('sc-rate-val').textContent`); ok(`[${r}] ⑨ KO 로 되돌림`, t === '5 · 아주 빠르게 (1.25배)', t); }

  // ⑩ 키보드(→·←)로도 움직인다
  await setSlider(3);
  await ev(`document.getElementById('sc-rate-slider').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(150);
  ok(`[${r}] ⑩ → 키로 칸4`, (await ev(`document.getElementById('sc-rate-val').textContent`)) === '4 · 빠르게 (1배)');

  // ⑪ 화면 배치 — PC·폰 세로·폰 가로에서 보이고, 눌리고, 가로로 안 넘치고, 한 줄
  for (const [w, h, m] of [[1280, 900, false], [390, 844, true], [844, 390, true], [320, 640, true]]) {
    await clearStorage(); await open(w, h, m);
    const lay = await ev(`(function(){
      var s=document.getElementById('sc-rate-slider'); s.scrollIntoView({block:'center'});
      var row=document.getElementById('sc-rate').getBoundingClientRect(), r=s.getBoundingClientRect();
      var top=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
      var val=document.getElementById('sc-rate-val'), rg=document.createRange(); rg.selectNodeContents(val); var tl=new Set([].slice.call(rg.getClientRects()).map(function(q){return Math.round(q.top);})).size;
      var parts=[].slice.call(document.querySelectorAll('#sc-rate > *')).map(function(e){return e.getBoundingClientRect();});
      var lines = new Set(parts.map(function(p){return Math.round(p.top+p.height/2);})).size;
      return { w:Math.round(r.width), h:Math.round(r.height), onTop: top===s, overflow: document.documentElement.scrollWidth > innerWidth,
               inRow: row.left>=-1 && row.right<=innerWidth+1, valLines: tl, rowLines: lines };
    })()`);
    ok(`[${r}] ⑪ ${w}x${h} 슬라이더 폭 ≥ 50px`, lay.w >= 50, lay);
    ok(`[${r}] ⑪ ${w}x${h} 슬라이더가 맨 위(눌림)`, lay.onTop, lay);
    ok(`[${r}] ⑪ ${w}x${h} 가로 넘침 없음`, !lay.overflow && lay.inRow, lay);
    ok(`[${r}] ⑪ ${w}x${h} 한 줄`, lay.valLines <= 1 && lay.rowLines <= 2, lay);
  }
  // ⑪-b 폰에서 채점 결과를 보는 동안에는 접힘(다른 버튼과 같이)
  await ev(`document.body.classList.add('m-showing-result'); true`);
  ok(`[${r}] ⑪-b 결과 보는 중 폰에서 접힘`, (await ev(`getComputedStyle(document.getElementById('sc-rate')).display`)) === 'none');
  await ev(`document.body.classList.remove('m-showing-result'); true`);

  // ⑫ 퍼즈 — 무작위 조작 150회, 매번 «실제 배속 == 기대값»
  await clearStorage(); await open();
  const friends = ['emma', 'jake', 'lily', 'noah'];
  const texts = [['en', 'Fuzz sentence number'], ['zh', '我喜欢学习中文'], ['ko', '천천히 말해 주세요']];
  let lv = 3, friend = 'emma', bad = 0, firstBad = null;
  for (let i = 0; i < 150; i++) {
    const a = rnd();
    if (a < 0.4) { lv = 1 + Math.floor(rnd() * 5); await setSlider(lv); }
    else if (a < 0.55) { friend = friends[Math.floor(rnd() * 4)]; await ev(`scSetFriend('${friend}', false)`); }
    else {
      const [lang, base] = texts[Math.floor(rnd() * 3)];
      const res = await speakAndRead(base + ' ' + i, rnd() < 0.5 ? 'speakTarget' : 'speakWord');
      const male = friend === 'jake' || friend === 'noah';
      const want = lang === 'ko' ? STEPS[lv] : expectRate(lv, male, lang);
      const got = lang === 'ko' ? (res.said[0] && res.said[0].rate) : res.rate;
      if (!(typeof got === 'number' && Math.abs(got - want) < 1e-6)) { bad++; if (!firstBad) firstBad = { i, lv, friend, lang, want, got, res }; }
    }
  }
  ok(`[${r}] ⑫ 퍼즈 150회 배속 전부 일치`, bad === 0, firstBad);
  ok(`[${r}] ⑬ alert 등 대화상자 0`, dialogs.length === 0, dialogs.splice(0));
  const errs = await ev(`(window.__pageErr||[]).length`);
  ok(`[${r}] ⑬ 페이지 오류 0`, !errs, errs);
}

// 페이지 오류 기록
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pageErr=[]; addEventListener('error',function(e){ if(e && e.message) window.__pageErr.push(e.message); });` });

try {
  for (let r = 0; r < ROUNDS; r++) await round(r);
} catch (e) {
  fail++; fails.push('크래시: ' + (e && e.message)); console.log('  ❌ FAIL 하니스 크래시', e && e.stack);
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}  (회차 ${ROUNDS})`);
if (fail) console.log('실패 목록:', [...new Set(fails.map(f => f.replace(/^\[\d+\] /, '')))].join(' · '));
cleanup();
process.exit(fail ? 1 : 0);
