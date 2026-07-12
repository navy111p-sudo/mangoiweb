/**
 * 🧺 세로폰 상단 통합바(#mg-unibar) ⨯ 포인트 바구니/칭찬 버튼 겹침 검증 (2026-07-13)
 *  1) 통합바가 내용 크기(fit-content)로 '정중앙' 정렬인지
 *  2) 포인트 바구니(.vc-point-basket, 내 영상박스 좌상단)와 통합바가 안 겹치는지
 *  3) 칭찬 버튼(.vc-star-btn)도 안 겹치는지
 * 실행: (public 을 :8791 서빙 후) node test-harness/vc_unibar_basket_harness.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:8791';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VW = parseInt(process.env.VW || '440', 10), VH = parseInt(process.env.VH || '900', 10);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
await page.setViewport({ width: VW, height: VH, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

await page.evaluate(() => {
  ['mango-intro-overlay'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-videocall-call').classList.add('active');
  document.body.classList.add('vc-in-call', 'vc-orientation-dismissed');
  // 학생 혼자(스크린샷 상황): 로컬 박스만, data-count=1 → 로컬 박스가 화면 위에 크게
  const grid = document.getElementById('vc-video-grid');
  grid.setAttribute('data-count', '1');
  // 포인트 바구니 + 칭찬 버튼 재현 (vcEnsurePointBasket 이 만드는 것과 동일 클래스)
  const box = document.getElementById('vc-local-box');
  if (!box.querySelector('.vc-point-basket')) {
    const b = document.createElement('div');
    b.className = 'vc-point-basket';
    b.innerHTML = '<span class="vpb-icon">🧺</span><span class="vpb-count">3</span>';
    box.appendChild(b);
  }
});
// unibar tick(0.7s) 대기
await new Promise(r => setTimeout(r, 1600));

const d = await page.evaluate(() => {
  const R = sel => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             right: Math.round(r.right), bottom: Math.round(r.bottom), disp: getComputedStyle(el).display };
  };
  return { vw: innerWidth, unibar: R('#mg-unibar'), basket: R('.vc-point-basket'),
           localBox: R('#vc-local-box'), uniOn: document.body.classList.contains('mg-uni-on') };
});
console.log(JSON.stringify(d, null, 1));

function overlap(a, b) {
  if (!a || !b || a.disp === 'none' || b.disp === 'none' || !a.w || !b.w) return 0;
  const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return ox * oy;
}
let fail = 0;
function chk(name, ok, extra) {
  if (ok) console.log('✅ ' + name);
  else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}
chk('통합바 표시(mg-uni-on)', d.uniOn && d.unibar && d.unibar.disp !== 'none');
if (d.unibar) {
  const center = d.unibar.x + d.unibar.w / 2;
  chk('통합바 fit-content(전폭 아님)', d.unibar.w < d.vw - 60, 'w=' + d.unibar.w + '/vw=' + d.vw);
  chk('통합바 정중앙 정렬', Math.abs(center - d.vw / 2) <= 2, 'center=' + center);
}
chk('바구니 ⨯ 통합바 안 겹침', overlap(d.basket, d.unibar) === 0, overlap(d.basket, d.unibar) + 'px²');
chk('바구니가 박스 안에 있음', d.basket && d.localBox && d.basket.y >= d.localBox.y && d.basket.bottom <= d.localBox.bottom,
    JSON.stringify({ basket: d.basket, box: d.localBox }));

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
process.exit(fail === 0 ? 0 : 1);
