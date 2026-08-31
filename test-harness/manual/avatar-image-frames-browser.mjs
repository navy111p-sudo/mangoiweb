/* avatar-image-frames-browser.mjs — 아바타 «입모양 이미지» 를 진짜 크로미움에 그려서 확인 (2026-08-31)
 *
 *   node test-harness/manual/avatar-image-frames-browser.mjs
 *
 * ⚠️ 자동으로 안 돕니다(파일명이 _harness.mjs 가 아니라 run.mjs 가 안 물어 갑니다). 사람이 부르세요.
 *    아바타(js/mango-avatar.js)·웜업/AI영어친구의 아바타 카드를 건드리면 돌리세요.
 *
 * 왜 필요한가
 *   문자열 하니스(avatar_image_frames_harness.mjs)는 «그 코드가 있는가» 까지만 봅니다.
 *   여기서 진짜로 알고 싶은 것은 «화면에 그려졌는가 · 카드 비율이 맞는가 · 파일이 없을 때
 *   빈 카드로 남지 않는가» 이고, 그건 픽셀을 재야만 알 수 있습니다.
 *
 * 이 파일이 playwright 를 안 쓰는 이유
 *   playwright-core 가 이 저장소의 의존성이 아닙니다. Node 22 는 WebSocket 이 전역이라
 *   CDP 를 직접 말하면 라이브러리가 필요 없습니다.
 *   🔴 함정 둘 (CLAUDE.md 2장) —
 *     · /json/new 로 «새 탭» 을 만들면 이 컨테이너에서는 페이지 스크립트가 한 줄도 안 돕니다.
 *       반드시 /json/list 로 «이미 있는 탭» 을 잡아 Page.navigate 하세요.
 *     · 같은 포트로 두 번째 방문부터는 서비스워커가 끼어 옛 파일이 나옵니다 —
 *       그래서 검사마다 포트를 새로 씁니다.
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, rmSync, mkdtempSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const CHROME = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  process.env.CHROME_PATH,
].find(p => p && existsSync(p));
if (!CHROME) { console.log('⏭  건너뜀 — 크로미움을 찾지 못했습니다 (CHROME_PATH 로 알려 주세요)'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 실제 얼굴 그림은 2026-08-31 부터 저장소에 있다(webp).
   ⚠️ 마지막 «폴백» 절은 «파일이 없는 상태» 를 봐야 하므로, 있으면 잠깐 옆으로 치웠다가 되돌린다.
      치운 파일은 같은 폴더에 .bak 으로 두어(‥/img/lily-closed.webp.bak) 중간에 죽어도
      git status 에 보이게 한다. 다음 실행이 시작할 때 남은 .bak 을 먼저 되돌린다.
   파일이 아예 없을 때는 «같은 비율의 더미 PNG» 로 경로만 확인하고 반드시 지운다. */
const FRAMES = ['lily-closed', 'lily-mid', 'lily-wide', 'noah-closed', 'noah-mid', 'noah-wide'];
const EXT = '.webp';                                  // mango-avatar.js 의 CHARACTERS 와 짝
const framePath = n => join(PUB, 'img', n + EXT);
FRAMES.forEach(n => { const b = framePath(n) + '.bak';   // 앞선 실행이 죽어 남긴 것 복구
  if (existsSync(b)) renameSync(b, framePath(n)); });
const realPresent = FRAMES.every(n => existsSync(framePath(n)));
const hideFrames = () => FRAMES.forEach(n => { if (existsSync(framePath(n))) renameSync(framePath(n), framePath(n) + '.bak'); });
const restoreFrames = () => FRAMES.forEach(n => { const b = framePath(n) + '.bak'; if (existsSync(b)) renameSync(b, framePath(n)); });
/* ⚠️ 더미는 PNG 바이트다 — 파일이 «아예 없는» 비상 경로에서만 쓰며, 이름이 .webp 라도
   브라우저가 내용으로 알아본다. 정상 상태(그림이 저장소에 있음)에서는 한 번도 안 돈다. */
function dummyPng(path, w, h, rgb) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const a = y < h / 2 ? 0 : 255;              // 위 절반 투명 → 투명 PNG 경로까지 확인
    const row = Buffer.alloc(1 + w * 4); let o = 1;
    for (let x = 0; x < w; x++) { row[o++] = rgb[0]; row[o++] = rgb[1]; row[o++] = rgb[2]; row[o++] = a; }
    rows.push(row);
  }
  const chunk = (t, d) => { const c = Buffer.concat([Buffer.from(t), d]); const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(c) >>> 0 : crc32(c)); return Buffer.concat([len, c, crc]); };
  function crc32(buf) { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]));
}

const profile = mkdtempSync(join(tmpdir(), 'avatar-cdp-'));
const CDP = 9411 + (process.pid % 90);
let httpPort = 8910 + (process.pid % 60);
const servers = [], chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank'],
  { stdio: 'ignore' });

function serve() {                                   // 검사마다 새 포트 — 서비스워커 캐시 배제
  const port = httpPort++;
  servers.push(spawn('python3', ['-m', 'http.server', String(port)], { cwd: PUB, stdio: 'ignore' }));
  return port;
}
const cleanup = () => {
  try { chrome.kill(); } catch {}
  servers.forEach(s => { try { s.kill(); } catch {} });
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};

async function run(pagePath, mode) {
  const port = serve(); await sleep(1200);
  const url = `http://127.0.0.1:${port}${pagePath}`;
  const tabs = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const page = tabs.find(t => t.type === 'page');
  if (!page) { console.log('  ⏭  붙을 탭이 없습니다'); return; }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiting = new Map(); const net = [];
  const send = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
    if (m.method === 'Network.responseReceived') net.push([m.params.response.url, m.params.response.status]); };
  await new Promise(r => (ws.onopen = r));
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url }); await sleep(6000);
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

  /* ⏳ «고정 대기» 로 재면 파이썬 http.server 가 한 번에 하나씩만 응답하는 탓에
        942KB 영상이 늦어져 «안 그려졌다» 는 거짓 실패가 난다(실제로 한 번 밟았다).
        그려질 때까지 재보고, 그래도 안 되면 그때 실패로 본다. */
  const painted = async () => (await ev(`(function(){var c=document.getElementById('tavatar-canvas');if(!c)return 0;try{var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=0;i<d.length;i+=4)if(d[i+3]>200)n++;return +(n/(d.length/4)).toFixed(3);}catch(e){return 0;}})()`)) || 0;
  for (let t = 0; t < 12 && (await painted()) <= 0.05; t++) await sleep(700);

  const probe = await ev(`(function(){
    var c=document.getElementById('tavatar-canvas'); if(!c) return {err:'no-canvas'};
    var d; try{ d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; }catch(e){ return {err:'no-pixels'}; }
    var n=0; for(var i=0;i<d.length;i+=4) if(d[i+3]>200) n++;
    var r=document.getElementById('tavatar-ring'), rb=r&&r.getBoundingClientRect();
    return { w:c.width, h:c.height, aspect:+(c.width/c.height).toFixed(3), opaque:+(n/(d.length/4)).toFixed(3),
             ringW:rb&&Math.round(rb.width), ringH:rb&&Math.round(rb.height),
             ready: typeof window.MangoAvatar==='object' && !!window.MangoAvatar.setCharacter };
  })()`);
  const asked = u => net.filter(([x]) => x.includes(u));
  const emma0 = asked('lily-'), classic = asked('teacher-avatar.'), good = st => st === 200 || st === 304;

  console.log(`\n── ${pagePath} (${mode}) ──`);
  console.log('   캔버스:', JSON.stringify(probe));
  ok(probe && probe.ready, 'MangoAvatar 가 만들어졌다');
  ok(classic.filter(([, st]) => st === 206).length === 0,
    'HTML 이 옛 영상을 «미리» 받지 않는다 (206 부분요청 없음 — <source> 를 되살리면 여기서 걸린다)');

  /* 기본 친구는 Emma(성인 영상)다. 「어린 쪽을 기본으로」 바꾸면 이 줄이 먼저 걸리므로,
     그때는 여기 기대값도 함께 고쳐야 한다(고치는 것을 잊으면 조용히 지나간다). */
  ok(classic.length > 0, '첫 화면 기본 얼굴이 Emma(성인)다');
  ok(emma0.length === 0, '기본이 Emma 라서 Lily 그림은 아직 안 받는다 (첫 화면 낭비 없음)');
  ok(probe.opaque > 0.05, `기본 얼굴이 실제로 그려졌다 (불투명 ${probe.opaque})`);

  /* 👧 Lily 로 바꿔 «이미지 캐릭터» 경로를 확인 */
  await ev("window.MangoAvatar.setCharacter('lily')"); await sleep(2200);
  const lily = asked('lily-');
  const p2 = await ev(`(function(){var c=document.getElementById('tavatar-canvas');var x=c.getContext('2d');var d=x.getImageData(0,0,c.width,c.height).data;var n=0;for(var i=0;i<d.length;i+=4)if(d[i+3]>200)n++;var r=document.getElementById('tavatar-ring'),rb=r&&r.getBoundingClientRect();return {op:+(n/(d.length/4)).toFixed(3),aspect:+(c.width/c.height).toFixed(3),ringW:rb&&Math.round(rb.width),ringH:rb&&Math.round(rb.height)};})()`);
  ok(lily.length === 3, `Lily 를 고르면 입모양 3장을 요청한다 (${lily.length}건)`);
  console.log('   Lily 전환 후:', JSON.stringify(p2));

  if (mode === 'images') {
    ok(lily.every(([, st]) => good(st)), `3장 모두 정상으로 받았다 (${lily.map(x => x[1]).join(',')})`);
    ok(p2.op > 0.05, `Lily 얼굴이 실제로 그려졌다 (불투명 ${p2.op})`);
    ok(p2.op < 0.98, '투명한 부분이 살아 있다 — 크로마키를 건너뛰어도 알파가 보존된다');
    /* ⚠️ 이 검사를 «선언값 0.8 과 다른가» 로 쓰면 안 된다 — 그림을 카드 비율에 맞춰 만들면
       선언값과 실측이 같아져 멀쩡한 코드가 FAIL 한다(2026-08-31 실제로 밟음).
       물어야 할 것은 «캔버스가 그 그림의 실제 비율을 따라왔는가» 다. */
    const real = await ev(`(async()=>{ const im=new Image(); im.src='/img/lily-closed.webp';
      await im.decode(); return +(im.naturalWidth/im.naturalHeight).toFixed(3); })()`);
    ok(typeof real === 'number' && Math.abs(p2.aspect - real) < 0.02,
      `카드 화면비가 «그림의 실제 비율» 을 따라왔다 (캔버스 ${p2.aspect} / 그림 ${real})`,
      '다른 비율 그림으로 갈아 끼워도 카드가 따라와야 한다 — setAspect 가 그 일을 한다');
    ok(p2.ringH > 0 && Math.abs(p2.ringW / p2.ringH - p2.aspect) < 0.05,
      `보이는 카드 상자도 같은 비율이다 (${p2.ringW}x${p2.ringH})`);
    await ev("window.MangoAvatar.setCharacter('noah')"); await sleep(2000);
    const noah = asked('noah-');
    ok(noah.length === 3 && noah.every(([, st]) => good(st)),
      `Noah 로 바꾸면 noah 3장을 받는다 (${noah.map(x => x[1]).join(',')})`);
  } else {
    ok(lily.every(([, st]) => st === 404), '3장 모두 404 (파일이 없는 상황)');
    ok(asked('teacher-avatar.').length > 0, 'Emma 로 되돌아갔다 — 빈 카드로 안 남는다');
    ok(p2.op > 0.05, `폴백 얼굴이 실제로 그려졌다 (불투명 ${p2.op})`);
  }

  /* 👥 네 친구 고르기 — 화면에서 실제로 눌러 «얼굴·이름표가 그 사람으로 바뀌는가» 를 본다.
     ⚠️ 문자열 하니스가 못 보는 부분이다: 표는 맞는데 «버튼이 그 표를 안 부르는» 경우가 있다. */
  if (mode === 'images' && pagePath.startsWith('/warmup')) {
    const WANT = { emma: 'teacher-avatar.', jake: 'hero-avatar', lily: 'lily-', noah: 'noah-' };
    for (const who of ['emma', 'jake', 'lily', 'noah']) {
      const r = await ev(`(function(){
        var b=document.querySelector('#voiceBtns button[data-v="${who}"]'); if(!b) return {err:'no-button'};
        b.click();
        return { label:(document.getElementById('voiceVal')||{}).textContent, on:b.classList.contains('on') };
      })()`);
      await sleep(1800);
      ok(r && !r.err && r.on, `버튼 「${who}」 이 있고 눌리면 선택 표시가 켜진다`);
      ok(!!r && typeof r.label === 'string' && r.label.toLowerCase().includes(who),
        `이름표가 그 친구로 바뀐다 (${r && r.label})`);
      ok(net.filter(([u]) => u.includes(WANT[who])).length > 0,
        `「${who}」 을 고르면 그 사람의 얼굴 파일을 받는다 (${WANT[who]})`,
        '표는 맞는데 버튼이 setCharacter 를 안 부르면 여기서 걸린다');
    }
    const p3 = await ev(`(function(){var c=document.getElementById('tavatar-canvas');var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=0;i<d.length;i+=4)if(d[i+3]>200)n++;return +(n/(d.length/4)).toFixed(3);})()`);
    ok(p3 > 0.05, `네 명을 다 거친 뒤에도 얼굴이 그려져 있다 (불투명 ${p3})`);
  }

  ws.close();
}

/* 🎙 음성코치 — 이 화면은 2026-08-31 까지 «아바타 코드를 자기 것으로 한 벌 더» 갖고 있었다.
   공용 모듈로 갈아탄 뒤에도 (ㄱ) 얼굴이 그려지는가 (ㄴ) 카드 크기가 자기 CSS 대로인가
   (ㄷ) 햄버거에서 네 친구를 고를 수 있는가 를 실제로 눌러 본다. */
async function runSpeechCoach() {
  const port = serve(); await sleep(1200);
  const tabs = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const page = tabs.find(t => t.type === 'page');
  if (!page) { console.log('  ⏭  붙을 탭이 없습니다'); return; }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const waiting = new Map(); const net = [];
  const send = (m, p2 = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p2 })); });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
    if (m.method === 'Network.responseReceived') net.push([m.params.response.url, m.params.response.status]); };
  await new Promise(r => (ws.onopen = r));
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/speech-coach.html` });
  await sleep(5000);
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  const paint = async () => (await ev(`(function(){var c=document.getElementById('tavatar-canvas');if(!c)return 0;try{var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;var n=0;for(var i=0;i<d.length;i+=4)if(d[i+3]>200)n++;return +(n/(d.length/4)).toFixed(3);}catch(e){return 0;}})()`)) || 0;
  for (let t = 0; t < 12 && (await paint()) <= 0.05; t++) await sleep(700);

  console.log('\n── /speech-coach.html ──');
  const st = await ev(`(function(){
    var r=document.getElementById('tavatar-ring'), rb=r&&r.getBoundingClientRect();
    return { ready: typeof window.MangoAvatar==='object' && !!window.MangoAvatar.setCharacter,
             ringW: rb&&Math.round(rb.width), ringH: rb&&Math.round(rb.height),
             btn: !!document.getElementById('sc-friend-btn'),
             menuHidden: (document.getElementById('sc-friend-menu')||{}).hidden };
  })()`);
  console.log('   ', JSON.stringify(st), '| 그려짐', await paint());
  ok(st.ready, '공용 아바타 모듈이 실렸다 (인라인 복제본을 걷어낸 뒤에도)');
  ok((await paint()) > 0.05, '얼굴이 실제로 그려졌다');
  ok([150, 260, 118, 92].includes(st.ringW),
    `카드 크기가 이 화면 자기 CSS 대로다 (${st.ringW}x${st.ringH})`,
    '136px 이 나오면 공용 mango-avatar.css 를 잘못 실은 것이다');
  ok(st.ringH > 0 && Math.abs(st.ringW / st.ringH - 0.8) < 0.02, '카드 비율 4:5 유지');
  ok(st.btn, '☰ 햄버거 버튼이 있다');
  ok(st.menuHidden === true, '메뉴는 처음에 닫혀 있다');

  const opened = await ev(`(function(){ document.getElementById('sc-friend-btn').click();
    var m=document.getElementById('sc-friend-menu');
    return { hidden:m.hidden, n:m.querySelectorAll('button[data-p]').length,
             names:[...m.querySelectorAll('button[data-p]')].map(b=>b.dataset.p) };
  })()`);
  ok(opened.hidden === false, '☰ 를 누르면 메뉴가 열린다');
  ok(opened.n === 4 && ['emma','lily','noah','jake'].every(k => opened.names.includes(k)),
    `네 친구가 다 있다 (${opened.names.join(', ')})`);

  await ev(`document.querySelector('#sc-friend-menu button[data-p="lily"]').click()`);
  await sleep(2200);
  const lily = net.filter(([u]) => u.includes('lily-'));
  const after = await ev(`(function(){var m=document.getElementById('sc-friend-menu');
    return { hidden:m.hidden, on:[...m.querySelectorAll('button.on')].map(b=>b.dataset.p) };})()`);
  ok(lily.length === 3, `Lily 를 고르면 입모양 3장을 요청한다 (${lily.length}건)`);
  ok(after.hidden === true, '고르면 메뉴가 닫힌다');
  ok(after.on.join() === 'lily', `고른 친구에 선택 표시가 남는다 (${after.on.join()})`);
  ok((await paint()) > 0.05, 'Lily 로 바꾼 뒤에도 얼굴이 그려져 있다');

  await ev(`document.getElementById('sc-friend-btn').click()`); await sleep(300);
  const outside = await ev(`(function(){ document.body.click();
    return (document.getElementById('sc-friend-menu')||{}).hidden; })()`);
  ok(outside === true, '바깥을 누르면 메뉴가 닫힌다');
  ws.close();
}

try {
  await sleep(3500);
  if (!realPresent) {
    console.log('ℹ️  실제 얼굴 그림이 /img 에 없어 «같은 비율의 더미» 로 이미지 경로를 확인합니다.');
    console.log('   (그림은 저장소에 있어야 정상입니다 — avatar_image_frames_harness 가 그것을 감시합니다)');
    const C = [[220,120,60],[120,220,60],[60,120,220],[200,200,60],[200,60,200],[60,200,200]];
    FRAMES.forEach((n, i) => dummyPng(framePath(n), 464, 576, C[i]));
  }
  await run('/warmup.html?setup=0', 'images');
  await run('/ai-friend.html', 'images');
  await runSpeechCoach();
  // 폴백 절은 «파일이 없는 상태» 를 봐야 한다 — 진짜 그림은 치우고, 더미는 지운다
  if (realPresent) hideFrames();
  else FRAMES.forEach(n => rmSync(framePath(n), { force: true }));
  await run('/warmup.html?setup=0', 'fallback');
} finally {
  if (realPresent) restoreFrames();
  else FRAMES.forEach(n => rmSync(framePath(n), { force: true }));
  cleanup();
}
console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
