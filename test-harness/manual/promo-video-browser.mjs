// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════
   🎬 홍보영상 팝업 — 진짜 브라우저에 그려서 재는 검사 (2026-08-25 신설)

   [왜 필요한가] 문자열을 찾는 하니스(promo_video_popup_harness.mjs)는 «코드가 있는가»
   까지만 본다. 「누르기 전에 영상을 안 받는가」·「팝업이 화면 안에 다 들어오는가」는
   실제로 그려서 재야 한다(CLAUDE.md 2장 「화면 «좌표» 가 틀린 버그를 하니스가 못 잡음」).

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
      promo.html · adm-promo-setup.js · 팝업 렌더러를 건드리면 사람이 직접 부를 것:
        node test-harness/manual/promo-video-browser.mjs
      (playwright 가 필요 없다 — 컨테이너의 크로미움에 CDP 로 직접 말한다)

   ⛔ 「영상이 실제로 재생되는가」는 여기서 확인할 수 없다.
      이 컨테이너의 크로미움은 H.264 를 못 재생한다(CLAUDE.md 2장).
      그래서 ②의 «영상을 받으러 갔는가» 까지만 보고, 재생은 사람이 진짜 브라우저에서 본다.
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8898, DEV = 9338;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 관리자가 만드는 팝업의 «프리셋 값 그대로» — adm-promo-setup.js 와 같아야 한다
const PRESET = {
  id: 9901, title: '망고아이 소개영상', content_type: 'mixed',
  image_url: '/img/promo/mangoi-promo-poster.png', video_url: null,
  link_url: '/promo.html?src=%2Fapi%2Fpopups%2Fmedia%2Fpopup-media%2F1756000000-abc.mp4',
  link_text: '▶ 영상 보기 (1:35)',
  width: 420, height: 420, width_mobile: 320, height_mobile: 380,
  position: 'center', priority: 10, dismiss_options: 'today,7days', enabled: 1,
};

const R = [];
const ok = (n, v, x = '') => { R.push(v); console.log(`  ${v ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`); };

const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${DEV}`, 'about:blank'], { stdio: 'ignore' });
await sleep(2000);

const tabs = await (await fetch(`http://127.0.0.1:${DEV}/json/list`)).json();
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
let id = 0; const waits = new Map(); const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m.result); waits.delete(m.id); }
  if (m.method) events.push(m);
  if (m.method === 'Fetch.requestPaused') {
    const u = m.params.request.url;
    const jsonBody = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
    if (/\/api\/popups(\?|$)/.test(u)) {
      send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: jsonBody({ ok: true, count: 1, rows: [PRESET] }) });
    } else if (/\/api\//.test(u)) {
      send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: jsonBody({ ok: true, rows: [] }) });
    } else send('Fetch.continueRequest', { requestId: m.params.requestId });
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = (x) => send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }).then((r) => r.result?.value);

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
// ⚠️ 서비스워커가 /api 를 가로채면 우리 흉내가 안 먹는다(실제로 밟았다: 404 HTML 을 받아
//    팝업 코드가 조용히 return 했다). 반드시 bypass 를 켠 뒤 Fetch 를 건다.
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });

console.log('\n════════ 🎬 홍보영상 팝업 · 브라우저 실측 ════════');

// ── ① 영상 페이지 (/promo.html) ──
console.log('\n[ ① 영상 페이지 — 폰 390×844 ]');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/promo.html` });
await sleep(2200);

const w = await ev('({sw:document.documentElement.scrollWidth, iw:innerWidth})');
ok('가로로 넘치지 않는다', w.sw <= w.iw, `scrollWidth ${w.sw} / innerWidth ${w.iw}`);
const reqs = (re) => events.filter((e) => e.method === 'Network.requestWillBeSent' && re.test(e.params.request.url)).length;
ok('누르기 전에는 영상을 안 받는다', reqs(/mangoi-promo\.mp4/) === 0, `요청 ${reqs(/mangoi-promo\.mp4/)}건`);
ok('포스터 그림은 받았다', reqs(/mangoi-promo-poster/) >= 1);
const top = await ev(`(function(){var r=document.getElementById('playBtn').getBoundingClientRect();
  var el=document.elementsFromPoint(r.left+r.width/2, r.top+r.height/2)[0];
  return el.closest('#playBtn') ? 'playBtn' : (el.id||el.tagName);})()`);
ok('재생 버튼이 맨 위에 있다(가려지지 않는다)', top === 'playBtn', `맨 위 = ${top}`);
const l0 = await ev("document.getElementById('t-title').textContent.slice(0,8)");
await ev("document.getElementById('langBtn').click()"); await sleep(120);
const l1 = await ev("document.getElementById('t-title').textContent.slice(0,8)");
ok('언어 전환이 먹는다', l0 !== l1, `${l0} → ${l1}`);
await ev("document.getElementById('langBtn').click()"); await sleep(100);

const pos = await ev("(function(){var b=document.getElementById('playBtn').getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)};})()");
for (const type of ['mousePressed', 'mouseReleased'])
  await send('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
await sleep(1500);
ok('누르면 그때 영상을 받으러 간다', reqs(/mangoi-promo\.mp4/) >= 1, `요청 ${reqs(/mangoi-promo\.mp4/)}건`);
const warn = await ev("(function(){var w=document.getElementById('warn');return {shown:getComputedStyle(w).display!=='none',txt:w.textContent.slice(0,24)};})()");
ok('영상이 없으면 검은 화면 대신 안내가 뜬다', warn.shown, warn.txt);
ok('다시 누를 수 있게 재생 버튼이 돌아온다', await ev("getComputedStyle(document.getElementById('playBtn')).display!=='none'"));

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/promo.html?src=//evil.example.com/x.mp4` });
await sleep(1200);
const used = await ev(`(function(){document.getElementById('playBtn').click();
  var v=document.querySelector('#stage video'); return v?v.getAttribute('src'):'(없음)';})()`);
ok('외부 주소(?src=//…)는 무시한다', used === '/video/mangoi-promo.mp4', `src = ${used}`);

// ── ② 홈 팝업이 실제로 어떻게 그려지나 ──
for (const [label, W, H, mobile] of [['폰 390×844', 390, 844, true], ['PC 1280×800', 1280, 800, false]]) {
  console.log(`\n[ ② 홈 팝업 — ${label} ]`);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(1200);
  // 인트로는 첫 방문에만 뜬다 — 팝업을 보려면 «이미 봤음» 으로 표시한다
  await ev("try{sessionStorage.setItem('mango_intro_shown_session','1');localStorage.setItem('mango_intro_shown','1')}catch(e){}");
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await sleep(4500);
  const m = await ev(`(function(){var el=document.querySelector('.pa-modal'); if(!el) return {none:1};
    var r=el.getBoundingClientRect(), img=el.querySelector('img'), a=el.querySelector('.pa-link-btn'), body=el.querySelector('.pa-body');
    return {w:Math.round(r.width), h:Math.round(r.height),
      inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,
      imgH:img?Math.round(img.getBoundingClientRect().height):0,
      btnIn:a?(a.getBoundingClientRect().bottom<=r.bottom+1):false,
      scroll:body?body.scrollHeight>body.clientHeight+2:false,
      href:a?a.getAttribute('href'):'', video:!!el.querySelector('video')};})()`);
  ok('팝업이 떴다', !m.none);
  if (!m.none) {
    ok('화면 안에 다 들어온다', m.inView, `${m.w}×${m.h}`);
    ok('포스터가 그려졌다', m.imgH > 60, `그림 높이 ${m.imgH}px`);
    ok('「영상 보기」 버튼이 상자 안에 있다', m.btnIn);
    ok('본문이 잘려 스크롤되지 않는다', !m.scroll, m.scroll ? '높이를 키우세요' : '');
    ok('팝업 안에 <video> 를 그리지 않는다', !m.video, '그리면 모두가 영상 앞부분을 받는다');
    ok('링크가 /promo.html 로 간다', /^\/promo\.html\?src=/.test(m.href || ''), (m.href || '').slice(0, 40) + '…');
  }
}

const pass = R.filter(Boolean).length;
console.log(`\n─────────────────────────────────────────────`);
console.log(`  ${pass}/${R.length} 통과`);
console.log(`─────────────────────────────────────────────\n`);
ws.close(); chrome.kill(); srv.kill();
process.exit(pass === R.length ? 0 : 1);
