/**
 * 🖼️ PIP '상대방 1명만' 검증 (2026-07-13)
 *  세로폰 video-pip 모드의 PIP 창과 데스크톱 오버레이 PIP 에 참가자 비디오가
 *  전부 쌓여 나오지 않고, 대표 상대방(선생님 역할 우선) 1명만 보이는지 확인.
 *  1) 원격 3명(선생님1+학생2) → 선생님 박스만 표시, 학생 박스 숨김
 *  2) 선생님 박스 제거 → 첫 학생 박스가 대표로 승격되어 표시
 *  3) 오버레이 PIP(vcSyncPipVideos) → 복제 비디오가 대표 1개만
 * 실행: (public 을 :8791 서빙 후) node test-harness/vc_pip_single_counterpart_harness.mjs
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
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-videocall-call').classList.add('active');
  document.body.classList.add('vc-in-call', 'vc-orientation-dismissed');
  // 세로폰 PIP 모드 진입
  const row = document.querySelector('.vc-main-row');
  row.classList.add('video-pip');
  // 원격 참가자 3명 재현: 선생님 1 + 학생 2 (vcAddRemoteVideo 가 만드는 것과 동일 구조)
  const grid = document.getElementById('vc-video-grid');
  [['t1','teacher'],['s1','student'],['s2','student']].forEach(([uid, role]) => {
    const b = document.createElement('div');
    b.className = 'video-box';
    b.id = 'vc-video-' + uid;
    b.dataset.role = role;
    b.innerHTML = '<video autoplay playsinline muted></video><span class="video-label">' + uid + '</span>';
    grid.appendChild(b);
  });
  vcUpdateGridCount();
});
await new Promise(r => setTimeout(r, 300));

const disp = sel => `(getComputedStyle(document.querySelector('${sel}')).display)`;
const d1 = await page.evaluate(() => {
  const g = s => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'MISSING'; };
  return {
    teacher: g('#vc-video-t1'), s1: g('#vc-video-s1'), s2: g('#vc-video-s2'), local: g('#vc-local-box'),
    primaryId: (document.querySelector('#vc-video-grid .vc-pip-primary') || {}).id || null,
  };
});
console.log('시나리오1(선생님+학생2):', JSON.stringify(d1));

let fail = 0;
const chk = (name, ok, extra) => { if (ok) console.log('✅ ' + name); else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); } };

chk('대표=선생님 박스', d1.primaryId === 'vc-video-t1', d1.primaryId);
chk('선생님 박스 표시', d1.teacher !== 'none', d1.teacher);
chk('학생1 박스 숨김', d1.s1 === 'none', d1.s1);
chk('학생2 박스 숨김', d1.s2 === 'none', d1.s2);
chk('내 박스 기본 숨김 유지', d1.local === 'none', d1.local);

// 시나리오 2: 선생님 퇴장 → 첫 학생이 대표 승격
const d2 = await page.evaluate(() => {
  document.getElementById('vc-video-t1').remove();
  vcUpdateGridCount();
  const g = s => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'MISSING'; };
  return { s1: g('#vc-video-s1'), s2: g('#vc-video-s2'),
           primaryId: (document.querySelector('#vc-video-grid .vc-pip-primary') || {}).id || null };
});
console.log('시나리오2(선생님 퇴장):', JSON.stringify(d2));
chk('대표=첫 학생 승격', d2.primaryId === 'vc-video-s1', d2.primaryId);
chk('학생1 표시', d2.s1 !== 'none', d2.s1);
chk('학생2 여전히 숨김', d2.s2 === 'none', d2.s2);

// 시나리오 3: 오버레이 PIP 복제도 대표 1개만
const d3 = await page.evaluate(() => {
  vcSyncPipVideos();
  const body = document.getElementById('vc-pip-body');
  const boxes = body ? Array.from(body.querySelectorAll('.video-box')) : [];
  return { n: boxes.length, srcs: boxes.map(b => b.dataset.src) };
});
console.log('시나리오3(오버레이 PIP):', JSON.stringify(d3));
chk('오버레이 PIP 비디오 1개', d3.n === 1, 'n=' + d3.n);
chk('오버레이 PIP = 대표 상대방', d3.srcs[0] === 'vc-video-s1', JSON.stringify(d3.srcs));

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
process.exit(fail === 0 ? 0 : 1);
