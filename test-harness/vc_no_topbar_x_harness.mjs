/**
 * ✕ 상단 나가기 버튼 제거 검증 (2026-07-14)
 *  - 상단 통합바(#mg-unibar)의 ✕(.uni-close) 삭제 확인 (세로폰/가로폰)
 *  - PC 상단 툴바의 ✕(#vc-exit-btn-v34) 삭제 확인
 *  - 나가기는 하단 독(vc-dock)의 '나가기' 버튼만 존재해야 함
 * 실행: (public 을 :8791 서빙 후) node test-harness/vc_no_topbar_x_harness.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:8791';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const VIEWPORTS = [
  { name: '세로폰(440x900)', width: 440, height: 900, isMobile: true, expectUnibar: true },
  { name: '가로폰(844x390)', width: 844, height: 390, isMobile: true, expectUnibar: true },
  { name: 'PC(1280x800)',   width: 1280, height: 800, isMobile: false, expectUnibar: false },
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

let fail = 0;
function chk(name, ok, extra) {
  if (ok) console.log('✅ ' + name);
  else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

for (const vp of VIEWPORTS) {
  console.log('\n── ' + vp.name + ' ──');
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
  await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile, hasTouch: vp.isMobile, deviceScaleFactor: vp.isMobile ? 2 : 1 });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    ['mango-intro-overlay'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
    document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
    document.getElementById('view-videocall-call').classList.add('active');
    document.body.classList.add('vc-in-call', 'vc-orientation-dismissed');
  });
  // unibar tick(0.7s) + dock 초기화 대기
  await new Promise(r => setTimeout(r, 1600));

  const d = await page.evaluate(() => {
    const vis = el => { if (!el) return false; const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const uniClose = document.querySelector('#mg-unibar .uni-close');
    const exitV34 = document.getElementById('vc-exit-btn-v34');
    // 상단 툴바/통합바 안에 ✕ 텍스트를 가진 보이는 나가기류 요소가 있는지 전수 검사
    const topXs = [...document.querySelectorAll('.toolbar a, .toolbar button, #mg-unibar a, #mg-unibar button')]
      .filter(el => (el.textContent || '').trim() === '✕' && vis(el))
      .map(el => el.id || el.className);
    const dockLeave = document.querySelector('#vc-dock button.leave');
    return {
      uniOn: document.body.classList.contains('mg-uni-on'),
      unibarVisible: vis(document.getElementById('mg-unibar')),
      uniCloseExists: !!uniClose,
      exitV34Exists: !!exitV34,
      topXs,
      dockLeaveExists: !!dockLeave,
    };
  });
  console.log('  ' + JSON.stringify(d));

  chk(vp.name + ': 통합바 ✕(.uni-close) 없음', !d.uniCloseExists);
  chk(vp.name + ': 상단 ✕(#vc-exit-btn-v34) 없음', !d.exitV34Exists);
  chk(vp.name + ': 상단바 어디에도 보이는 ✕ 없음', d.topXs.length === 0, JSON.stringify(d.topXs));
  chk(vp.name + ': 하단 독 나가기 버튼 존재', d.dockLeaveExists);
  if (vp.expectUnibar) chk(vp.name + ': 통합바 정상 표시(기능 유지)', d.uniOn && d.unibarVisible);

  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace('.png', '_' + vp.width + 'x' + vp.height + '.png') });
  await page.close();
}

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
