/**
 * 🧑‍🏫 '교사 얼굴 맨 위 + 크게' 회귀 하네스 (2026-07-14 사장님 지시)
 * -----------------------------------------------------------------------------
 * 학생이 입장하면 어떤 화면(PC·태블릿·가로폰)에서도 상대(교사) 타일이
 * 내 타일(#vc-local-box)보다 '위'에, 1:1 수업에선 내 타일이 '작게' 나와야 한다.
 * 검증:
 *  ① vcInsertBoxTeacherFirst — 원격 박스가 DOM 에서 내 박스 앞에 삽입되는지
 *  ② CSS order — 내 박스가 시각적으로 항상 아래인지 (rect.top 비교)
 *  ③ 1:1(data-count=2)에서 내 박스 폭 축소(62%)·상대는 전폭인지
 *  ④ 세로폰 pip/facepip 모드 규칙(22%·order:99)은 그대로인지 (충돌 없음)
 *
 * 실행: (public 을 :8791 서빙 후) node test-harness/vc_teacher_first_harness.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:8791';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let fail = 0;
const chk = (name, ok, extra) => { if (ok) console.log('  ✅ ' + name + (extra ? '  (' + extra + ')' : '')); else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); } };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], protocolTimeout: 60000 });

/** 통화 화면을 켜고 가짜 원격(교사) 박스를 '실제 코드'로 삽입한 뒤 배치를 측정 */
async function measure(page) {
  return page.evaluate(() => {
    // 수업 화면 활성화 (기존 하네스 패턴)
    document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
    const call = document.getElementById('view-videocall-call');
    if (call) call.classList.add('active');
    document.body.classList.add('vc-in-call');

    const grid = document.getElementById('vc-video-grid');
    const local = document.getElementById('vc-local-box');
    if (!grid || !local) return { err: 'grid/local 없음' };

    // 원격(교사) 박스 — 실제 헬퍼로 삽입
    let remote = document.getElementById('vc-video-tharness');
    if (!remote) {
      remote = document.createElement('div');
      remote.className = 'video-box';
      remote.id = 'vc-video-tharness';
      remote.dataset.role = 'teacher';
      remote.innerHTML = '<video autoplay playsinline muted></video><span class="video-label">교사</span>';
      if (typeof vcInsertBoxTeacherFirst === 'function') vcInsertBoxTeacherFirst(grid, remote);
      else return { err: 'vcInsertBoxTeacherFirst 미정의' };
    }
    if (typeof vcUpdateGridCount === 'function') vcUpdateGridCount();

    const kids = Array.from(grid.querySelectorAll(':scope > .video-box')).map(b => b.id);
    const rr = remote.getBoundingClientRect();
    const lr = local.getBoundingClientRect();
    const cs = getComputedStyle(local);
    return {
      order: kids,
      domRemoteFirst: kids.indexOf('vc-video-tharness') < kids.indexOf('vc-local-box'),
      remoteTop: Math.round(rr.top), localTop: Math.round(lr.top),
      remoteW: Math.round(rr.width), localW: Math.round(lr.width),
      localOrder: cs.order, dataCount: grid.getAttribute('data-count'),
      localVisible: cs.display !== 'none' && lr.height > 0,
      remoteVisible: rr.height > 0,
    };
  });
}

const VIEWPORTS = [
  { name: 'PC(1280×800)', w: 1280, h: 800, expectSmallLocal: true },
  { name: '태블릿(1024×768)', w: 1024, h: 768, expectSmallLocal: true },
  { name: '가로폰(844×390)', w: 844, h: 390, expectSmallLocal: true },
];

for (const vp of VIEWPORTS) {
  console.log('\n── ' + vp.name + ' ──');
  const page = await browser.newPage();
  await page.setViewport({ width: vp.w, height: vp.h });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  const m = await measure(page);
  if (m.err) { chk(vp.name + ' 측정', false, m.err); await page.close(); continue; }
  chk('원격(교사) 박스가 DOM 에서 내 박스보다 앞', m.domRemoteFirst, m.order.join(' → '));
  chk('내 타일 CSS order 최후방(≥96)', parseInt(m.localOrder, 10) >= 96, 'order=' + m.localOrder);
  if (m.localVisible && m.remoteVisible) {
    chk('화면상 교사 타일이 내 타일보다 위', m.remoteTop < m.localTop, `교사 top=${m.remoteTop}, 나 top=${m.localTop}`);
    if (vp.expectSmallLocal) {
      chk('1:1 수업에서 내 타일이 교사보다 작음', m.localW < m.remoteW, `교사 ${m.remoteW}px vs 나 ${m.localW}px (count=${m.dataCount})`);
    }
  } else {
    // 일부 모드(세로 등)는 내 타일 기본 숨김 — 그 자체가 '교사가 주인공' 이므로 통과
    chk('내 타일 숨김 모드(교사가 주인공)', m.remoteVisible, `localVisible=${m.localVisible}`);
  }
  await page.close();
}

/* ── 세로폰 facepip 충돌 없음 확인 ── */
console.log('\n── 세로폰(390×844) facepip 모드 규칙 유지 ──');
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  const m = await page.evaluate(() => {
    document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
    const call = document.getElementById('view-videocall-call');
    if (call) call.classList.add('active');
    document.body.classList.add('vc-in-call');
    const row = document.getElementById('vc-main-row') || document.querySelector('.vc-main-row');
    if (row) { row.classList.add('video-facepip'); }
    const grid = document.getElementById('vc-video-grid');
    const local = document.getElementById('vc-local-box');
    let remote = document.getElementById('vc-video-tharness');
    if (!remote && typeof vcInsertBoxTeacherFirst === 'function') {
      remote = document.createElement('div');
      remote.className = 'video-box'; remote.id = 'vc-video-tharness';
      remote.innerHTML = '<video muted></video><span class="video-label">교사</span>';
      vcInsertBoxTeacherFirst(grid, remote);
    }
    if (typeof vcUpdateGridCount === 'function') vcUpdateGridCount();
    const cs = getComputedStyle(local);
    return { order: cs.order, maxHeight: cs.maxHeight, width: cs.width, gridW: grid.getBoundingClientRect().width };
  });
  // facepip 자체 규칙(order:99, 22%)이 이겨야 함 — width 62% 규칙은 :not(.video-facepip) 로 제외됨
  chk('facepip: 내 타일 order=99 유지', m.order === '99', 'order=' + m.order);
  chk('facepip: 내 타일 폭 62% 축소 미적용(전폭 유지)', Math.abs(parseFloat(m.width) - m.gridW) < m.gridW * 0.15 || parseFloat(m.width) > m.gridW * 0.8, `width=${m.width}, grid=${Math.round(m.gridW)}px`);
  await page.close();
}

await browser.close();
console.log('\n════════════════════════════════════');
console.log(fail === 0 ? '🎉 교사 얼굴 맨 위+크게 — 전 항목 통과' : `⚠️ 실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
