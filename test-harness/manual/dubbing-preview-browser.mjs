// 🎬 A.i영화더빙(/ai-dubbing.html) — 브라우저 하니스 (CDP 직접, 라이브러리 없음) · 2026-10-20
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      node test-harness/manual/dubbing-preview-browser.mjs
// 재는 것:
//   A. 지금 공개 자료(검수 전)로는 «준비 중» 화면이 한 글자도 안 바뀐다 — 장면 칸 6개가 그대로 div, 미리 보기 없음.
//   B. 검수를 통과했다고 «가정한» 시험 자료(서버가 가짜로 돌려줌)로는 그 장면만 버튼이 되고,
//      누르면 미리 보기 창이 맨 위에 뜨고, 영상·배경음·목소리가 함께 재생되고, 자막이 시각에 맞게 바뀌고,
//      🌐 영어로 바꾸면 자막 이름이 따라오고, Esc·✕ 로 닫히면 소리가 멈추고 포커스가 돌아온다.
//   C. 폰(390×844)에서 창이 화면을 넘지 않고 ✕·버튼이 눌린다.
//   D. 변이: 판정을 끈 ai-dubbing.js 를 주면 A 가 실제로 FAIL 한다(이 검사가 헛돌지 않는다).
// ⚠️ 이 컨테이너의 크로미움은 H.264(mp4)를 못 틀어 시험 영상은 ffmpeg 로 만든 VP8 webm 입니다(실제 파일과 무관).
// 실패하면 종료코드 1.
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PUB = path.join(DIR, '..', '..', 'cloudflare-deploy', 'public');
const PORT = 8300 + Math.floor(Math.random() * 400);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dub-browser-'));
const PROF = path.join(TMP, 'prof');
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(CHROME)) { console.log('⏭  건너뜀 — Chromium 이 없습니다'); process.exit(0); }
const ff = spawnSync('ffmpeg', ['-version']);
if (ff.status !== 0) { console.log('⏭  건너뜀 — ffmpeg 가 없습니다(시험 영상을 만들 수 없음)'); process.exit(0); }

// ── 시험 미디어(8초) ──
const MEDIA = path.join(TMP, 'media'); fs.mkdirSync(MEDIA);
const mk = args => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]); if (r.status !== 0) throw new Error(String(r.stderr)); };
mk(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=24:duration=8', '-c:v', 'libvpx', '-b:v', '400k', path.join(MEDIA, 's1.webm')]);
mk(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=8', '-c:a', 'libopus', path.join(MEDIA, 'bgm.ogg')]);
mk(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:a', 'libopus', path.join(MEDIA, 'voice.ogg')]);

const REAL = JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'dubbing', 'dub-001.json'), 'utf8'));
function fixture() {
  const m = JSON.parse(JSON.stringify(REAL));
  m.qaApproved = true;
  for (const s of m.scenes) {
    if (s.no > 2) continue;                       // 장면 1·2 만 «통과» 로 가정
    s.qaApproved = true; s.linesSynced = true; s.durationSec = 8;
    s.video = '/media/dubbing/dub-001/s1.webm'; s.bgm = '/media/dubbing/dub-001/bgm.ogg'; s.thumb = null;
    s.voices = {};
    let t = 0.5;
    for (const l of s.lines) { s.voices[l.speaker] = '/media/dubbing/dub-001/voice.ogg'; l.start = t; l.end = t + 1; t += 1.2; }
  }
  return m;
}
let MODE = 'real';
const JS_SRC = fs.readFileSync(path.join(PUB, 'js', 'ai-dubbing.js'), 'utf8');
const MUTANT = JS_SRC.replace('if (!probs.length && card) { upgradeCard(card, sc); opened++; }', 'if (card) { upgradeCard(card, sc); opened++; }');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.ogg': 'audio/ogg', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  const send = (type, body) => { r.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' }); r.end(body); };
  if (u.pathname === '/data/dubbing/dub-001.json') return send(MIME['.json'], JSON.stringify(MODE === 'fixture' ? fixture() : REAL));
  if (u.pathname === '/js/ai-dubbing.js' && MODE === 'mutant') return send(MIME['.js'], MUTANT);
  const mm = /^\/media\/dubbing\/dub-001\/([a-z0-9.]+)$/.exec(u.pathname);
  if (mm) {
    const fp = path.join(MEDIA, mm[1]);
    if (!fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
    const buf = fs.readFileSync(fp); const rg = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    if (rg) { const a = +rg[1], b = rg[2] ? +rg[2] : buf.length - 1; r.writeHead(206, { 'Content-Type': MIME[path.extname(fp)], 'Content-Range': `bytes ${a}-${b}/${buf.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 }); return r.end(buf.subarray(a, b + 1)); }
    return send(MIME[path.extname(fp)], buf);
  }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  send(MIME[path.extname(fp)] || 'text/plain', fs.readFileSync(fp));
}).listen(PORT);

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--remote-debugging-port=' + (PORT + 1000), '--user-data-dir=' + PROF, 'about:blank'], { stdio: 'ignore' });
let ws, cid = 0; const pend = new Map(); const errors = [];
async function connect() {
  for (let i = 0; i < 60; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT + 1000}/json/list`)).json(); const t = l.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch { } await sleep(200); }
  throw new Error('no chrome');
}
function cdp(method, params = {}) { return new Promise((res, rej) => { const i = ++cid; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }); }
async function ev(expr) { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error'); return r.result.value; }
async function click(x, y) { for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); }
async function key(k) { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }); }
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ FAIL ${name}${extra != null ? ' — ' + extra : ''}`); } };

async function open(w, h, mobile, lang) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Network.setBypassServiceWorker', { bypass: true });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/about:blank` }).catch(() => {});
  await ev(`(function(){try{localStorage.clear();sessionStorage.clear();${lang ? `localStorage.setItem('mangoi_lang','${lang}');` : ''}}catch(e){}})()`).catch(() => {});
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/ai-dubbing.html?_nc=${Date.now()}` });
  for (let i = 0; i < 50; i++) { await sleep(100); if (await ev(`document.readyState==='complete'`).catch(() => false)) break; }
  await sleep(700);   // fetch → 판정 → 칸 바꾸기
}
const STATE = `(function(){const g=document.querySelector('.scenes');return{divs:g?g.querySelectorAll(':scope > div.scene').length:-1,btns:g?g.querySelectorAll(':scope > button.scene').length:-1,
  notice:(function(){const n=document.querySelector('.notice');return !!n&&getComputedStyle(n).display!=='none';})(),player:!!document.querySelector('.dub-player'),
  thumbs:[...document.querySelectorAll('.scenes .thumb')].map(t=>t.textContent.trim()).join('|'),overflow:document.documentElement.scrollWidth>innerWidth}})()`;

async function main() {
  ws = new WebSocket(await connect());
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails?.exception?.description || 'exception'); };
  await new Promise(r => ws.onopen = r);
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');

  console.log('\nA. 지금 공개 자료(검수 전) — 화면이 그대로인가');
  for (const [w, h, m] of [[1280, 800, false], [390, 844, true]]) {
    MODE = 'real'; errors.length = 0;
    await open(w, h, m);
    const s = await ev(STATE);
    ok(`${w}×${h}: 장면 칸 6개가 그대로 «준비 중» div`, s.divs === 6 && s.btns === 0, JSON.stringify(s));
    ok(`${w}×${h}: 썸네일 글자 «영상 준비 중» 6칸 그대로`, s.thumbs === Array(6).fill('영상 준비 중').join('|'), s.thumbs);
    ok(`${w}×${h}: «준비 중» 안내가 보인다 · 미리 보기 없음`, s.notice && !s.player);
    ok(`${w}×${h}: 가로로 넘치지 않는다`, !s.overflow);
    ok(`${w}×${h}: 스크립트 오류 0건`, errors.length === 0, errors.join(' / '));
  }

  console.log('\nB. 검수 통과를 «가정한» 시험 자료 — 장면 1·2');
  MODE = 'fixture'; errors.length = 0;
  await open(1280, 800, false);
  let s = await ev(STATE);
  ok('통과한 2장면만 버튼, 나머지 4칸은 «준비 중» 그대로', s.btns === 2 && s.divs === 4, JSON.stringify(s));
  ok('일부만 열렸으니 «준비 중» 안내는 그대로 보인다', s.notice);
  const b1 = await ev(`(function(){const b=document.querySelector('button.scene[data-scene="1"]');if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,top:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button.scene')===b,cursor:getComputedStyle(b).cursor,tag:b.querySelector('.tag')?.className,label:b.querySelector('.tag')?.textContent}})()`);
  ok('장면 1 버튼이 보이고 눌린다(맨 위)', !!b1 && b1.top, JSON.stringify(b1));
  ok('장면 1 버튼: 손가락 커서 · 색 표 s1 · 이름', !!b1 && b1.cursor === 'pointer' && /tag s1/.test(b1.tag) && /^1\. /.test(b1.label || ''), JSON.stringify(b1));
  await click(b1.x, b1.y); await sleep(500);
  const p = await ev(`(function(){const p=document.querySelector('.dub-player');if(!p)return null;const cs=getComputedStyle(p);const pr=document.querySelector('.dub-panel').getBoundingClientRect();
    const cx=pr.left+pr.width/2,cy=pr.top+pr.height/2;const t=document.elementFromPoint(cx,cy);
    const v=p.querySelector('video');return{z:+cs.zIndex,pos:cs.position,topIsPanel:!!t&&!!t.closest('.dub-panel'),bodyLock:document.body.classList.contains('dub-open')&&getComputedStyle(document.body).overflow==='hidden',
    vsrc:v&&v.getAttribute('src'),muted:v&&v.muted,rec:(function(){const r=p.querySelector('.dub-rec');return r?{dis:r.disabled,txt:r.textContent}:null})(),
    focus:document.activeElement&&document.activeElement.className}})()`);
  ok('미리 보기 창이 뜬다(fixed · z-index ≥ 100002)', !!p && p.pos === 'fixed' && p.z >= 100002, JSON.stringify(p));
  ok('창 가운데 맨 위가 창 자신(사이드바·공용 바에 안 가림)', !!p && p.topIsPanel);
  ok('뒤 화면 스크롤이 잠긴다', !!p && p.bodyLock);
  ok('영상은 소리를 끈 우리 경로', !!p && p.muted === true && p.vsrc === '/media/dubbing/dub-001/s1.webm');
  ok('«내 목소리로 더빙» 은 잠긴 채 이유를 말한다', !!p && p.rec && p.rec.dis === true && /검증 뒤/.test(p.rec.txt), JSON.stringify(p && p.rec));
  ok('창이 열리면 «원어민 대사로 보기» 에 포커스', !!p && /dub-play/.test(p.focus || ''), p && p.focus);
  const pl = await ev(`(function(){const b=document.querySelector('.dub-play');const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,h:r.height}})()`);
  ok('재생 버튼 높이 ≥ 44px', pl.h >= 44, pl.h);
  await click(pl.x, pl.y);
  // 재생하는 동안 자막을 100ms 마다 훑는다(대사 사이 빈틈이 있어 한 시점만 보면 우연히 빈칸일 수 있다)
  const seenSubs = await ev(`new Promise(res=>{const out=[];let n=0;const t=setInterval(()=>{out.push(document.querySelector('.dub-sub').textContent);if(++n>=22){clearInterval(t);res(out)}},100)})`);
  const play = await ev(`(function(){const v=document.querySelector('.dub-player video');return{vp:v.paused,t:v.currentTime,vw:v.videoWidth,rs:v.readyState}})()`);
  ok('재생: 영상이 실제로 흐른다(일시정지 아님 · 시간 증가 · 화면 크기 있음)', !play.vp && play.t > 0.5 && play.vw > 0, JSON.stringify(play));
  const firstLine = fixture().scenes[0].lines[0];
  ok('재생하는 동안 첫 대사 자막이 뜬다', seenSubs.some(x => x.includes(firstLine.en)), JSON.stringify([...new Set(seenSubs)]));
  ok('대사 사이 빈틈에서는 자막을 비운다(지난 대사를 붙잡고 있지 않음)', seenSubs.some(x => x === ''), JSON.stringify([...new Set(seenSubs)]));
  // 멈춘 채 셋째 대사 시각으로 옮긴다(흐르는 중에 재면 다음 대사로 넘어가 버린다)
  await ev(`(function(){const v=document.querySelector('.dub-player video');v.pause();v.currentTime=${(0.5 + 1.2 * 2 + 0.5).toFixed(2)};})()`); await sleep(500);
  const sub3 = await ev(`document.querySelector('.dub-sub').textContent`);
  const line3 = fixture().scenes[0].lines[2];
  ok('영상을 옮기면 자막도 그 시각의 대사로 바뀐다', sub3.includes(line3.en), `${sub3} / 기대 ${line3.en}`);
  const who3 = REAL.characters[line3.speaker].name;
  const whoKo = await ev(`(document.querySelector('.dub-sub .dub-who')||{}).textContent||''`);
  ok('자막에 말하는 캐릭터 이름(한국어)', whoKo === who3.ko, whoKo);
  await ev(`window.setLang && window.setLang('en','user')`); await sleep(400);
  const en = await ev(`(function(){return{who:(document.querySelector('.dub-sub .dub-who')||{}).textContent||'',play:document.querySelector('.dub-play').textContent,x:document.querySelector('.dub-x').getAttribute('aria-label')}})()`);
  // ⚠️ «자막 전체에 Dino 가 있는가» 로 묻지 말 것 — 대사 자체가 «Hi! My name is Dino.» 라 언제나 참이 된다(실제로 헛돌았다).
  ok('🌐 영어로 바꾸면 자막의 캐릭터 이름 칸이 영어로 따라온다(영상이 멈춘 채 — 언어 이벤트로만)', en.who === who3.en, en.who);
  ok('🌐 영어: 버튼 글자·닫기 이름표도 영어', /Watch with native voices/.test(en.play) && en.x === 'Close', JSON.stringify(en));
  await ev(`window.setLang && window.setLang('ko','user')`); await sleep(200);
  await key('Escape'); await sleep(400);
  const closed = await ev(`(function(){return{player:!!document.querySelector('.dub-player'),lock:document.body.classList.contains('dub-open'),focus:document.activeElement&&document.activeElement.getAttribute('data-scene')}})()`);
  ok('Esc 로 닫힌다 · 스크롤 잠금 풀림 · 포커스가 장면 1 로 돌아온다', !closed.player && !closed.lock && closed.focus === '1', JSON.stringify(closed));
  // ✕ 로 닫기 + 소리 멈춤(창을 다시 열어 재생 후 닫는다)
  const b2 = await ev(`(function(){const b=document.querySelector('button.scene[data-scene="2"]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await ev(`(function(){window.__plays=0;window.__pauses=0;const P=HTMLMediaElement.prototype;const op=P.play,opa=P.pause;P.play=function(){if(this.tagName==='AUDIO')window.__plays++;return op.apply(this,arguments)};P.pause=function(){if(this.tagName==='AUDIO')window.__pauses++;return opa.apply(this,arguments)};})()`);
  await click(b2.x, b2.y); await sleep(400);
  const pl2 = await ev(`(function(){const b=document.querySelector('.dub-play');const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await click(pl2.x, pl2.y); await sleep(900);
  const plays = await ev(`window.__plays`);
  ok('재생하면 배경음·목소리 소리 요소도 함께 재생된다', plays >= 2, plays);
  const xb = await ev(`(function(){const b=document.querySelector('.dub-x');const r=b.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{x:r.left+r.width/2,y:r.top+r.height/2,top:!!t&&t.closest('.dub-x')===b}})()`);
  ok('✕ 가 맨 위에 있어 눌린다', xb.top);
  await click(xb.x, xb.y); await sleep(400);
  const after = await ev(`(function(){return{player:!!document.querySelector('.dub-player'),pauses:window.__pauses}})()`);
  ok('✕ 로 닫히고 소리 요소가 멈춘다', !after.player && after.pauses >= 2, JSON.stringify(after));
  ok('B: 스크립트 오류 0건', errors.length === 0, errors.join(' / '));

  console.log('\nC. 폰 390×844');
  MODE = 'fixture'; errors.length = 0;
  await open(390, 844, true);
  const b1m = await ev(`(function(){const b=document.querySelector('button.scene[data-scene="1"]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await click(b1m.x, b1m.y); await sleep(500);
  const mob = await ev(`(function(){const pr=document.querySelector('.dub-panel').getBoundingClientRect();const x=document.querySelector('.dub-x').getBoundingClientRect();const tx=document.elementFromPoint(x.left+x.width/2,x.top+x.height/2);
    const bs=[...document.querySelectorAll('.dub-bar button')].map(b=>{const r=b.getBoundingClientRect();return{h:r.height,w:r.width,right:r.right}});
    return{left:pr.left,right:pr.right,W:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,xTop:!!tx&&!!tx.closest('.dub-x'),bs}})()`);
  ok('폰: 창이 화면 폭 안', mob.left >= 0 && mob.right <= mob.W && !mob.overflow, JSON.stringify(mob));
  ok('폰: ✕ 가 눌린다', mob.xTop);
  ok('폰: 버튼 높이 ≥ 44px · 화면 밖으로 안 나감', mob.bs.length === 3 && mob.bs.every(b => b.h >= 44 && b.right <= mob.W), JSON.stringify(mob.bs));
  ok('C: 스크립트 오류 0건', errors.length === 0, errors.join(' / '));

  console.log('\nD. 변이 — 판정을 끈 스크립트를 주면 A 가 실제로 FAIL 하는가');
  MODE = 'mutant';
  await open(1280, 800, false);
  const sm = await ev(STATE);
  ok('변이에서는 검수 전 자료인데도 칸이 바뀐다(= A 의 «그대로» 검사가 헛돌지 않는다)', sm.btns > 0, JSON.stringify(sm));
}

try { await main(); }
catch (e) { fail++; console.log('  ❌ FAIL 하니스 실행 오류 — ' + (e && e.stack || e)); }
finally {
  try { ws && ws.close(); } catch { }
  chrome.kill('SIGKILL'); srv.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { }
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
