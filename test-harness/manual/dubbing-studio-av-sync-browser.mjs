/* 🎬 A.i 더빙동영상 스튜디오 — «영상이 움직인 뒤에 소리» 를 진짜 브라우저로 잰다
   ───────────────────────────────────────────────────────────────────────
   ⚠️ 자동으로 안 돕니다 — manual/ 은 게이트가 물어 가지 않습니다. 사람이 부릅니다:
        cd cloudflare-deploy/public && python3 -m http.server 8931 &
        /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
          --autoplay-policy=no-user-gesture-required \
          --remote-debugging-port=9231 --user-data-dir=/tmp/pwprof-dub about:blank &
        node test-harness/manual/dubbing-studio-av-sync-browser.mjs
      변이 확인(일부러 «소리를 먼저» 내는 사본을 띄움 — 실제로 FAIL 이 나야 정상):
        DUB_MUTATE=1 node test-harness/manual/dubbing-studio-av-sync-browser.mjs

   🔴 왜 이 파일이 있나 — 2026-10-20 사장님 「소리와 화면이 일치하지 않는 것 같아」.
      자동 하니스(dubbing_studio_av_sync_harness)는 가짜 영상 요소라 «진짜 play/playing 이벤트 순서» 를 못 본다.
   ⚠️ 이 크로미움은 H.264(mp4)를 못 튼다(CLAUDE.md 2장) — 그래서 캔버스로 3초짜리 webm 을 만들어
      mp4 요청을 그것으로 바꿔 준다. MediaRecorder webm 에는 길이가 없어서 Duration 을 끼워 넣는다
      (안 넣으면 duration 이 Infinity 라 «대사 길이에 맞춘 빠르기» 가 예전 값으로 떨어져 아무것도 못 잰다).
   ⚠️ 못 재는 것: 실제 Higgsfield 영상의 입 모양이 그 대사와 맞는가 — 사람이 봐야 한다.
*/
const PORT = Number(process.env.CDP_PORT || 9231), WEB = Number(process.env.WEB_PORT || 8931);
const MUTATE = process.env.DUB_MUTATE === '1';

/* MediaRecorder webm 의 Segment Info 에 Duration(ms) 을 끼워 넣는다 */
function addWebmDuration(buf, ms) {
  const b = Buffer.from(buf);
  const at = b.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66]));
  if (at < 0) throw new Error('webm Info 없음');
  const szAt = at + 4, first = b[szAt];
  let len = 1; while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  let size = first & (0xff >> len);
  for (let k = 1; k < len; k++) size = size * 256 + b[szAt + k];
  const content = b.subarray(szAt + len, szAt + len + size);
  if (content.indexOf(Buffer.from([0x44, 0x89])) >= 0) return b;
  const dur = Buffer.alloc(11); dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88; dur.writeDoubleBE(ms, 3);
  const sz = Buffer.alloc(8); sz[0] = 0x01;
  for (let k = 7, v = size + 11; k >= 1; k--, v = Math.floor(v / 256)) sz[k] = v & 0xff;
  return Buffer.concat([b.subarray(0, szAt), sz, content, dur, b.subarray(szAt + len + size)]);
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const waiters = new Map(); const handlers = [];
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } else handlers.forEach((h) => h(m)); };
const send = (m, p = {}) => new Promise((res) => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); } };

const errors = [];
handlers.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 200));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' ').slice(0, 200));
});
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
// 캐시를 두 겹 다 끈다 — 옛 사본을 재면 변이시험이 조용히 통과한다
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/ai-dubbing-studio.html?_nc=${Date.now()}` });
await wait(1500);

console.log('▶ 준비');
ok(await ev(`typeof showClip === 'function' && typeof EPISODES === 'object'`), '(전제) 스튜디오 스크립트가 실렸다');
ok((await ev(`new Audio().canPlayType('audio/mpeg')`)) !== '', '(전제) 이 브라우저가 mp3 를 튼다');
const b64 = await ev(`(async()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const g=c.getContext('2d');
 const st=c.captureStream(30);const mr=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8'});const ch=[];mr.ondataavailable=e=>ch.push(e.data);
 let f=0;const iv=setInterval(()=>{g.fillStyle='hsl('+(f*9%360)+',70%,45%)';g.fillRect(0,0,320,180);g.fillStyle='#fff';g.fillRect((f*6)%300,70,30,30);f++;},33);
 mr.start(100);await new Promise(r=>setTimeout(r,3000));const stopped=new Promise(r=>mr.onstop=r);mr.stop();await stopped;clearInterval(iv);
 const buf=new Uint8Array(await new Blob(ch,{type:'video/webm'}).arrayBuffer());let s='';
 for(let i=0;i<buf.length;i+=8192)s+=String.fromCharCode.apply(null,buf.subarray(i,i+8192));return btoa(s);})()`);
const webm = addWebmDuration(Buffer.from(b64, 'base64'), 3000).toString('base64');

/* mp4 → 시험 webm · (변이) 페이지 → «소리를 먼저» 내는 사본 */
const FROM = 'showClip(i, true, speechSec).then(() => {';
handlers.push(async (m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  const url = m.params.request.url;
  if (/\.mp4(\?|$)/.test(url)) {
    await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'video/webm' }], body: webm });
    return;
  }
  const r = await fetch(url.replace(/^http:\/\/127\.0\.0\.1:\d+/, `http://127.0.0.1:${WEB}`));
  let html = await r.text();
  if (MUTATE) {
    if (html.split(FROM).length !== 2) console.log('  ❌ 변이 앵커를 못 찾음');
    html = html.replace(FROM, 'showClip(i, true, speechSec); Promise.resolve().then(() => {');
  }
  await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(html).toString('base64') });
});
await send('Fetch.enable', { patterns: [{ urlPattern: '*/media/dubbing/*.mp4*' }, ...(MUTATE ? [{ urlPattern: '*/ai-dubbing-studio.html*' }] : [])] });
if (MUTATE) { await send('Page.navigate', { url: `http://127.0.0.1:${WEB}/ai-dubbing-studio.html?_nc=${Date.now()}` }); await wait(1500); }

/* 계측: play() 호출 · playing 이벤트(영상·음성 모두) */
await ev(`(()=>{window.__L=[];const T0=performance.now();const vid=document.getElementById('vid');
 const nm=(el)=>{const s=el===vid?(vid.dataset.clip||''):(el.currentSrc||el.src||'');return (s.match(/([a-z]+-\\d\\d)\\.(mp3|mp4)/)||[])[1]||'?';};
 const op=HTMLMediaElement.prototype.play;
 HTMLMediaElement.prototype.play=function(){__L.push({t:performance.now()-T0,k:'play',tag:this.tagName,n:nm(this),rate:this.playbackRate,loop:this.loop});return op.apply(this,arguments);};
 document.addEventListener('playing',e=>__L.push({t:performance.now()-T0,k:'playing',tag:e.target.tagName,n:nm(e.target),rate:e.target.playbackRate,dur:e.target.duration,loop:e.target.loop}),true);})()`);
const setup = await ev(`(()=>{state.ep=EPISODES.findIndex(e=>e.media==='/media/dubbing/bday-');state.mode='dub';state.speed=1;
 const cast=castOf(episode());const w=lines().slice(0,3).map(l=>l.who);const pick=cast.find(c=>!w.includes(c))||cast.find(c=>c!==w[0]);
 state.roles=new Set([pick]);resetEpisode();renderAll();
 const exp=lines().slice(0,4).map((l,i)=>({i,n:'bday-'+String(i+1).padStart(2,'0'),mine:state.roles.has(l.who),sec:lineSec(l,i)}));
 play();return {pick,exp};})()`);
ok(setup && setup.exp.some((x) => !x.mine), '(전제) 원어민 목소리로 나오는 대사가 앞쪽에 있다', setup);
await wait(14000);
const L = await ev('window.__L');
const vs = await ev(`(()=>{const v=document.getElementById('vid');return {loop:v.loop,hidden:v.hidden,cv:document.getElementById('vid-fade').style.opacity};})()`);
// 대사 길이는 «다 받은 뒤» 의 음성 길이로 다시 잰다 — 처음엔 아직 안 받아 어림값(estSec)이라 기대값이 틀린다(실제로 밟음)
const secs = await ev(`lines().slice(0,4).map((l,i)=>lineSec(l,i))`);
setup.exp.forEach((x) => { x.sec = secs[x.i]; });
await ev('pause()');

console.log('▶ 순서·빠르기');
const clamp = (x) => Math.min(2, Math.max(0.6, x));
let checked = 0;
for (const x of setup.exp) {
  const vp = L.find((e) => e.k === 'playing' && e.tag === 'VIDEO' && e.n === x.n);
  if (!vp) continue;
  ok(vp.loop === false, `${x.n} 영상을 반복하지 않는다`, vp);
  ok(Math.abs(vp.rate - clamp(3 / x.sec)) < 0.02, `${x.n} 영상 빠르기가 대사 길이(${x.sec.toFixed(2)}초)에 맞다`, { rate: vp.rate, want: clamp(3 / x.sec) });
  if (x.mine) continue;
  const ap = L.find((e) => e.k === 'play' && e.tag === 'AUDIO' && e.n === x.n);
  ok(ap && ap.t >= vp.t, `${x.n} 소리는 영상이 움직이기 시작한 «뒤» 에 난다`, { video: vp && Math.round(vp.t), audio: ap && Math.round(ap.t) });
  ok(ap && ap.t - vp.t < 400, `${x.n} 그 사이가 0.4초 안이다(너무 늦지도 않다)`, ap && Math.round(ap.t - vp.t));
  checked++;
}
ok(checked >= 2, '(전제) 원어민 대사 두 줄 이상을 실제로 쟀다', checked);
ok(vs.loop === false && vs.hidden === false, '재생 뒤에도 영상은 반복 꺼짐 · 보이는 상태', vs);
ok(errors.length === 0, '페이지 오류가 없다', errors);
console.log(`\n결과: PASS ${pass} / FAIL ${fail}${MUTATE ? '   (변이 모드 — FAIL 이 나와야 정상)' : ''}`);
ws.close();
process.exit(fail > 0 ? 1 : 0);
