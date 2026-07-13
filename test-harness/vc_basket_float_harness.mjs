/**
 * 🧺 PIP 모드 '떠 있는 미러 바구니'(#vc-basket-float) 검증 (2026-07-13)
 *  1) 세로폰 video-pip 모드(내 박스 숨김) → 미러 바구니가 좌상단에 뜨고 점수 미러링
 *  2) 점수 오르면 미러 숫자도 갱신
 *  3) 통합바(#mg-unibar)와 안 겹침
 *  4) 👁 내 얼굴 보기(vc-phero-self)로 진짜 바구니가 보이면 미러는 자동 숨김
 *  5) 강사 역할이면 미러 바구니 자체가 안 뜸
 * 실행: (public 을 :8791 서빙 후) node test-harness/vc_basket_float_harness.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:8791';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
await page.setViewport({ width: 440, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

await page.evaluate(() => {
  ['mango-intro-overlay'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  try { localStorage.setItem('mangoi_user_role', 'student'); } catch(e){}
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-videocall-call').classList.add('active');
  document.body.classList.add('vc-in-call', 'vc-orientation-dismissed');
  const row = document.querySelector('.vc-main-row');
  row.classList.add('video-pip');
  // 진짜 바구니 재현 (vcEnsurePointBasket 이 만드는 것과 동일 클래스, 점수 3)
  const box = document.getElementById('vc-local-box');
  if (!box.querySelector('.vc-point-basket')) {
    const b = document.createElement('div');
    b.className = 'vc-point-basket';
    b.innerHTML = '<span class="vpb-icon">🧺</span><span class="vpb-count">3</span>';
    box.appendChild(b);
  }
  window._vcSessionPoints = 3;
});
await new Promise(r => setTimeout(r, 1600));   // tick(0.7s) 2회 대기

const R = sel => `(function(){ const el = document.querySelector('${sel}'); if (!el) return null;
  const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y),
  w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right),
  bottom: Math.round(r.bottom), disp: getComputedStyle(el).display }; })()`;

const d1 = await page.evaluate(() => {
  const g = s => { const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             right: Math.round(r.right), bottom: Math.round(r.bottom), disp: getComputedStyle(el).display }; };
  return {
    float: g('#vc-basket-float'),
    floatCount: (document.querySelector('#vc-basket-float .vpb-count') || {}).textContent || null,
    realBasket: g('#vc-local-box .vc-point-basket'),
    unibar: g('#mg-unibar'),
  };
});
console.log('시나리오1(pip 모드):', JSON.stringify(d1));

let fail = 0;
const chk = (name, ok, extra) => { if (ok) console.log('✅ ' + name); else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); } };
const overlap = (a, b) => {
  if (!a || !b || a.disp === 'none' || b.disp === 'none' || !a.w || !b.w) return 0;
  const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return ox * oy;
};

chk('진짜 바구니는 안 보임(내 박스 숨김)', !d1.realBasket || d1.realBasket.w === 0, JSON.stringify(d1.realBasket));
chk('미러 바구니 표시', d1.float && d1.float.disp !== 'none' && d1.float.w > 0, JSON.stringify(d1.float));
chk('미러 점수 = 3', d1.floatCount === '3', d1.floatCount);
chk('미러 ⨯ 통합바 안 겹침', overlap(d1.float, d1.unibar) === 0, overlap(d1.float, d1.unibar) + 'px²');

// 시나리오 2: 점수 3 → 5 오름 → 미러 갱신
await page.evaluate(() => {
  window._vcSessionPoints = 5;
  const c = document.querySelector('#vc-local-box .vc-point-basket .vpb-count');
  if (c) c.textContent = '5';
});
await new Promise(r => setTimeout(r, 1000));
const d2 = await page.evaluate(() => (document.querySelector('#vc-basket-float .vpb-count') || {}).textContent || null);
console.log('시나리오2(점수 3→5):', JSON.stringify(d2));
chk('미러 점수 갱신 = 5', d2 === '5', d2);

// 시나리오 3: 👁 내 얼굴 보기 → 진짜 바구니 보임 → 미러 자동 숨김
await page.evaluate(() => { document.body.classList.add('vc-phero-self'); });
await new Promise(r => setTimeout(r, 1000));
const d3 = await page.evaluate(() => {
  const g = s => { const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect(); return { w: Math.round(r.width), disp: getComputedStyle(el).display }; };
  return { real: g('#vc-local-box .vc-point-basket'), float: g('#vc-basket-float') };
});
console.log('시나리오3(내 얼굴 보기):', JSON.stringify(d3));
chk('진짜 바구니 다시 보임', d3.real && d3.real.w > 0, JSON.stringify(d3.real));
chk('미러 바구니 자동 숨김', !d3.float || d3.float.disp === 'none', JSON.stringify(d3.float));

// 시나리오 4: 강사 역할 → 미러 안 뜸
await page.evaluate(() => {
  document.body.classList.remove('vc-phero-self');
  try { localStorage.setItem('mangoi_user_role', 'teacher'); } catch(e){}
});
await new Promise(r => setTimeout(r, 1000));
const d4 = await page.evaluate(() => {
  const el = document.querySelector('#vc-basket-float');
  return el ? getComputedStyle(el).display : 'none';
});
console.log('시나리오4(강사 역할):', JSON.stringify(d4));
chk('강사에게는 미러 안 뜸', d4 === 'none', d4);

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
process.exit(fail === 0 ? 0 : 1);
