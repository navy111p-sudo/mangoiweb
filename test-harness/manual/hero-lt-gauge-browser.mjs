/* hero-lt-gauge-browser.mjs — 홈 「내 레벨테스트」 카드의 C2 게이지가 «실제로 그려지는가» (2026-09-14, B안)
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
 *      cd cloudflare-deploy/public && python3 -m http.server 8877 &
 *      /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *        --remote-debugging-port=9222 --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader about:blank &
 *      node test-harness/manual/hero-lt-gauge-browser.mjs
 *      (SHOT=/경로 를 주면 카드 스크린샷도 남깁니다)
 *
 * ── 왜 브라우저여야 하나 ────────────────────────────────────────────────────
 *   가짜 DOM 하니스(hero_leveltest_card_harness ④)는 «몇 칸이 켜졌나» 까지만 본다.
 *   «켜진 칸이 폭을 가지는가»(2026-09-09 CEFR 막대가 <span> 이라 폭 0 이던 사고) ·
 *   «큰 글자와 아래 줄 사이에 실제로 앉는가» · «폰 폭에서 넘치지 않는가» 는 그려 봐야 안다.
 *
 * ── 여기서 재는 것 ──────────────────────────────────────────────────────────
 *   A. C2: 6칸 전부 폭 > 0 · 높이 8px · 라벨 A1…C2 한 줄 · C2 라벨이 골드
 *   B. B1: 3칸만 «색이 다르다»(켜짐/꺼짐이 눈에 갈린다)
 *   C. 배치: 게이지가 큰 글자 «아래», 아래 줄 «위» · 카드 안 · 390px 에서 가로 넘침 0
 *
 * ⚠️ 응답 모양(level_display)은 손으로 적지 않고 정본(cefrDisplay)을 번들해 만든다.
 * ⚠️ 서비스워커가 cache-first 라 HTTP 캐시만 꺼서는 «고치기 전» 파일이 나옵니다. 둘 다 끕니다.
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CF = join(ROOT, 'cloudflare-deploy');
const BASE = process.env.BASE || 'http://127.0.0.1:8877';

let PASS = 0, FAIL = 0;
const check = (n, c, d = '') => { if (c) PASS++; else FAIL++; console.log(`  ${c ? '✅' : '❌'} ${n}${c || !d ? '' : '  — ' + d}`); };

/* 정본에서 응답 모양을 만든다 — 하니스에 «베낀 상수» 를 두지 않는다 */
const esbuild = createRequire(join(CF, 'package.json'))('esbuild');
const out = join(mkdtempSync(join(tmpdir(), 'ltg-')), 'p.mjs');
esbuild.buildSync({ entryPoints: [join(CF, 'src/student-placement.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
const { cefrDisplay } = await import('file://' + out.replace(/\\/g, '/'));

async function connect() {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('열린 탭이 없습니다 — 크로미움을 about:blank 로 띄우세요');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const w = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; w.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  };
  await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.setBypassServiceWorker', { bypass: true });
  return { send, evalJs, close: () => ws.close() };
}

/** 새 문서마다: 로그인 흉내 + /api/leveltest/my 스텁 (IIFE — 회차마다 쌓여도 최상위 const 재선언이 없다) */
function stubScript(item) {
  return `(function(){
    try { localStorage.setItem('mangoi_uid','lt-test'); localStorage.setItem('mango_token','tok'); localStorage.setItem('mangoi_onboard_v1','skip:0'); } catch(e){}   // 첫 방문 코치마크(idx-onboard.js)를 «본 것» 으로 — 스크린샷을 덮는다
    var _f = window.fetch;
    window.fetch = function(u, o){
      if (String(u).indexOf('/api/leveltest/my') >= 0) return Promise.resolve({ ok:true, json: function(){ return Promise.resolve({ ok:true, items:[${JSON.stringify(item)}] }); } });
      return _f.apply(this, arguments);
    };
  })();`;
}
const aiRow = (lv) => ({ id: 24, status: 'pending', desired_date: null, desired_time: null, final_level: lv, source: 'ai-diagnosis', level_display: cefrDisplay(lv) });

const MEASURE = `(function(){
  var el=document.getElementById('hero-lt'), when=document.getElementById('hero-lt-when'), sub=document.getElementById('hero-lt-sub'), g=document.getElementById('hero-lt-gauge');
  if(!el||!g) return { hidden: !el || el.hidden, gauge:false };
  var r=function(n){ var b=n.getBoundingClientRect(); return {t:b.top,b:b.bottom,l:b.left,r:b.right,w:b.width,h:b.height}; };
  var bars=[].slice.call(g.querySelectorAll('.lt-gauge-bars i')).map(function(i){ var b=r(i); var cs=getComputedStyle(i); return {w:b.w,h:b.h,on:i.className==='on',bg:cs.backgroundImage!=='none'?cs.backgroundImage:cs.backgroundColor, display:cs.display}; });
  var lbls=[].slice.call(g.querySelectorAll('.lt-gauge-lbl span')).map(function(s){ var b=r(s); return {t:s.textContent, top:b.t, color:getComputedStyle(s).color, on:s.className==='on'}; });
  return { hidden: el.hidden, gauge:true, card:r(el), when:r(when), sub:r(sub), g:r(g), bars:bars, lbls:lbls, whenText:when.textContent, subText:sub.textContent,
           scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
})()`;

async function scenario(c, lv, width) {
  await c.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: stubScript(aiRow(lv)) });
  await c.send('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
  await new Promise((r) => setTimeout(r, 3500));
  await c.evalJs(`(function(){ var el=document.getElementById('hero-lt'); if(el) el.scrollIntoView({block:'center'}); return 1; })()`);
  await new Promise((r) => setTimeout(r, 300));
  return c.evalJs(MEASURE);
}

const c = await connect();
try {
  console.log('\n🪜 홈 «내 레벨테스트» 카드 — C2 게이지 (브라우저)\n');

  console.log('[ A. C2 · PC 1280 ]');
  const a = await scenario(c, 'C2', 1280);
  check('카드가 보인다 (hidden 아님)', a.gauge && !a.hidden, JSON.stringify(a).slice(0, 200));
  if (a.gauge) {
    check('큰 글자가 이름이다 — AI 진단 완료 · 최상급', a.whenText === 'AI 진단 완료 · 최상급', a.whenText);
    check('아래 줄 — C2 · 6단계 중 6단계', /^C2 · 6단계 중 6단계/.test(a.subText), a.subText);
    check('칸이 6개', a.bars.length === 6, 'n=' + a.bars.length);
    check('6칸 전부 «폭 > 0» (인라인이라 폭 0 이던 사고 아님)', a.bars.every((b) => b.w > 20 && b.h >= 7), JSON.stringify(a.bars.map((b) => [Math.round(b.w), Math.round(b.h)])));
    check('칸이 인라인이 아니다', a.bars.every((b) => b.display !== 'inline'), a.bars.map((b) => b.display).join(','));
    check('6칸 전부 켜짐(골드 그라데이션)', a.bars.every((b) => b.on && /gradient/.test(b.bg)), a.bars.map((b) => b.bg).join(' | ').slice(0, 160));
    check('라벨 A1…C2 여섯 개가 «한 줄»', a.lbls.length === 6 && Math.max(...a.lbls.map((l) => l.top)) - Math.min(...a.lbls.map((l) => l.top)) < 2, JSON.stringify(a.lbls.map((l) => [l.t, Math.round(l.top)])));
    const c2 = a.lbls.find((l) => l.t === 'C2'), a1 = a.lbls.find((l) => l.t === 'A1');
    check('C2 라벨만 골드 — 다른 라벨과 색이 다르다', !!c2 && !!a1 && c2.on && !a1.on && c2.color !== a1.color, (c2 && c2.color) + ' vs ' + (a1 && a1.color));
    check('배치: 큰 글자 아래 · 아래 줄 위', a.when.b <= a.g.t + 1 && a.g.b <= a.sub.t + 1, `when.b=${a.when.b|0} g=${a.g.t|0}..${a.g.b|0} sub.t=${a.sub.t|0}`);
    check('게이지가 카드 «안» 에 있다', a.g.l >= a.card.l && a.g.r <= a.card.r && a.g.t >= a.card.t && a.g.b <= a.card.b);
    check('가로 넘침 0', a.scrollW <= a.innerW, `${a.scrollW} > ${a.innerW}`);
    if (process.env.SHOT) {
      const sc = await c.evalJs(`(function(){var b=document.getElementById('hero-lt').getBoundingClientRect();return {x:b.left+scrollX-16,y:b.top+scrollY-16,w:b.width+32,h:b.height+32};})()`);
      const shot = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: sc.x, y: sc.y, width: sc.w, height: sc.h, scale: 2 } });
      writeFileSync(process.env.SHOT.replace(/\.png$/, '') + '-pc-c2.png', Buffer.from(shot.result.data, 'base64'));
    }
  }

  console.log('\n[ B. B1 · 폰 390 ]');
  const b = await scenario(c, 'B1', 390);
  check('카드가 보인다', b.gauge && !b.hidden);
  if (b.gauge) {
    check('큰 글자 — AI 진단 완료 · 초중급', b.whenText === 'AI 진단 완료 · 초중급', b.whenText);
    check('3칸만 켜짐 · 나머지 3칸은 «다른 색»', b.bars.filter((x) => x.on).length === 3 && new Set(b.bars.map((x) => x.bg)).size === 2, JSON.stringify(b.bars.map((x) => [x.on, x.bg.slice(0, 30)])));
    check('폰에서도 6칸 전부 폭 > 0', b.bars.every((x) => x.w > 20), JSON.stringify(b.bars.map((x) => Math.round(x.w))));
    check('B1 라벨만 골드', b.lbls.filter((l) => l.on).map((l) => l.t).join(',') === 'B1', JSON.stringify(b.lbls.filter((l) => l.on).map((l) => l.t)));
    check('폰: 게이지가 카드 안 · 가로 넘침 0', b.g.l >= b.card.l && b.g.r <= b.card.r && b.scrollW <= b.innerW, `g=${b.g.l|0}..${b.g.r|0} card=${b.card.l|0}..${b.card.r|0} scrollW=${b.scrollW}/${b.innerW}`);
    check('폰: 배치(큰 글자 아래 · 아래 줄 위)', b.when.b <= b.g.t + 1 && b.g.b <= b.sub.t + 1);
    if (process.env.SHOT) {
      const sc = await c.evalJs(`(function(){var b=document.getElementById('hero-lt').getBoundingClientRect();return {x:b.left+scrollX-8,y:b.top+scrollY-8,w:b.width+16,h:b.height+16};})()`);
      const shot = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: sc.x, y: sc.y, width: sc.w, height: sc.h, scale: 2 } });
      writeFileSync(process.env.SHOT.replace(/\.png$/, '') + '-phone-b1.png', Buffer.from(shot.result.data, 'base64'));
    }
  }
} finally { c.close(); }

console.log(`\n  PASS ${PASS} / FAIL ${FAIL}\n`);
process.exit(FAIL ? 1 : 0);
