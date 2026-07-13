/**
 * ⭐ 강사 '칭찬 주기' 로스터 겹침 검증 (2026-07-13)
 *  로스터를 오버레이(absolute) → 사이즈바와 영상 그리드 사이 일반 줄(flow)로 바꾼 뒤:
 *  1) 강사+학생 2명일 때 로스터 표시 + 학생 칩 2개
 *  2) 로스터 ⨯ 모든 영상 박스(학생 얼굴) 안 겹침
 *  3) 영상 그리드가 로스터 '아래'에서 시작 (겹침 원천 차단)
 *  4) 로스터 ⨯ 사이즈바 안 겹침
 *  5) 좁은 폭(1/4)에서도 영상 박스와 안 겹침 (vpr-narrow 축소)
 * 실행: (public 을 :8791 서빙 후) node test-harness/vc_praise_roster_overlap_harness.mjs
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
await page.setViewport({ width: 1280, height: 800 });
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

async function setup(sizeClass) {
  await page.evaluate((sizeClass) => {
    ['mango-intro-overlay'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
    try { localStorage.setItem('mangoi_user_role', 'teacher'); } catch(e){}
    document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
    document.getElementById('view-videocall-call').classList.add('active');
    document.body.classList.add('vc-in-call', 'vc-orientation-dismissed');
    const row = document.querySelector('.vc-main-row');
    row.classList.remove('video-quarter','video-half','video-threequarter','video-full','video-pip','video-solo');
    row.classList.add(sizeClass);
    // 학생 원격 박스 2개 시뮬레이션
    const grid = document.getElementById('vc-video-grid');
    ['stu1','stu2'].forEach((uid, i) => {
      if (document.getElementById('vc-video-' + uid)) return;
      const b = document.createElement('div');
      b.className = 'video-box'; b.id = 'vc-video-' + uid; b.dataset.role = 'student';
      b.innerHTML = '<span class="video-label">' + (i === 0 ? '김민수' : '이서연') + '</span>';
      grid.appendChild(b);
    });
    grid.dataset.count = String(grid.querySelectorAll('.video-box').length);
    vcRefreshPraiseUI();
  }, sizeClass);
  await new Promise(r => setTimeout(r, 700));
  return page.evaluate(() => {
    const g = s => { const el = document.querySelector(s); if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
               right: Math.round(r.right), bottom: Math.round(r.bottom), disp: getComputedStyle(el).display,
               pos: getComputedStyle(el).position }; };
    const boxes = Array.from(document.querySelectorAll('#vc-video-grid .video-box')).map(el => {
      const r = el.getBoundingClientRect();
      return { id: el.id, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
               right: Math.round(r.right), bottom: Math.round(r.bottom), disp: getComputedStyle(el).display };
    });
    const chipRects = Array.from(document.querySelectorAll('#vc-praise-roster .vc-roster-chip')).map(el => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
               right: Math.round(r.right), bottom: Math.round(r.bottom), disp: getComputedStyle(el).display };
    });
    return {
      roster: g('#vc-praise-roster'),
      grip: g('.video-pane .vp-free-grip'),
      chipRects,
      chips: document.querySelectorAll('#vc-praise-roster .vc-roster-chip').length,
      chipNames: Array.from(document.querySelectorAll('#vc-praise-roster .vrc-name')).map(e => e.textContent),
      sizebar: g('.video-pane .video-size-bar'),
      grid: g('#vc-video-grid'),
      boxes,
      narrow: (document.getElementById('vc-praise-roster') || {className:''}).className.includes('vpr-narrow'),
    };
  });
}

let fail = 0;
const chk = (name, ok, extra) => { if (ok) console.log('✅ ' + name); else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); } };
const overlap = (a, b) => {
  if (!a || !b || a.disp === 'none' || b.disp === 'none' || !a.w || !b.w) return 0;
  const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return ox * oy;
};

// ── 시나리오 1: 기본(1/2) 폭 ──
const d1 = await setup('video-half');
console.log('시나리오1(1/2 폭):', JSON.stringify({ roster: d1.roster, chips: d1.chips, grid: d1.grid, boxes: d1.boxes }));
chk('로스터 표시', d1.roster && d1.roster.disp !== 'none' && d1.roster.w > 0, JSON.stringify(d1.roster));
chk('로스터가 오버레이 아님(absolute X)', d1.roster && d1.roster.pos !== 'absolute', d1.roster && d1.roster.pos);
chk('학생 칩 2개(김민수·이서연)', d1.chips === 2 && d1.chipNames.join(',').includes('김민수'), d1.chips + ' / ' + d1.chipNames.join(','));
const ovBoxes1 = d1.boxes.reduce((s, b) => s + overlap(d1.roster, b), 0);
chk('로스터 ⨯ 영상 박스 안 겹침', ovBoxes1 === 0, ovBoxes1 + 'px²');
chk('그리드가 로스터 아래에서 시작', d1.grid && d1.roster && d1.grid.y >= d1.roster.bottom - 1, 'grid.y=' + (d1.grid && d1.grid.y) + ' roster.bottom=' + (d1.roster && d1.roster.bottom));
chk('로스터 ⨯ 사이즈바 안 겹침', overlap(d1.roster, d1.sizebar) === 0, overlap(d1.roster, d1.sizebar) + 'px²');
const ovGrip1 = d1.chipRects.reduce((s, c) => s + overlap(c, d1.grip), 0);
chk('학생 칩 ⨯ 크기조절 그립 안 겹침', ovGrip1 === 0, ovGrip1 + 'px²');

// ── 시나리오 2: 좁은(1/4) 폭 ──
const d2 = await setup('video-quarter');
console.log('시나리오2(1/4 폭):', JSON.stringify({ roster: d2.roster, narrow: d2.narrow, boxes: d2.boxes }));
chk('좁은 폭에서도 로스터 표시', d2.roster && d2.roster.disp !== 'none' && d2.roster.w > 0, JSON.stringify(d2.roster));
chk('좁은 폭 vpr-narrow(제목 축소) 적용', d2.narrow === true, String(d2.narrow));
const ovBoxes2 = d2.boxes.reduce((s, b) => s + overlap(d2.roster, b), 0);
chk('좁은 폭에서도 영상 박스와 안 겹침', ovBoxes2 === 0, ovBoxes2 + 'px²');
const ovGrip2 = d2.chipRects.reduce((s, c) => s + overlap(c, d2.grip), 0);
chk('좁은 폭에서도 칩 ⨯ 그립 안 겹침', ovGrip2 === 0, ovGrip2 + 'px²');

await page.screenshot({ path: 'test-harness/vc_praise_roster_overlap.png' });
await browser.close();
console.log(fail === 0 ? '\n🎉 전부 통과' : '\n💥 실패 ' + fail + '건');
process.exit(fail === 0 ? 0 : 1);
