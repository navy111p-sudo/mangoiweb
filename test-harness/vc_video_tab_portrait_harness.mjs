/**
 * 📱 화상수업 세로 '동영상 탭' 버튼 겹침 실측 하니스 (2026-07-13)
 * - 상단: #mg-unibar(통합바)가 vp-controls(바로수업으로/YouTube/URL재생/파일/닫기)를 가리는지
 * - 상단: 영상 PIP(video-pane)가 vp-controls·URL입력을 가리는지
 * - 하단: #ml-un(🔊 소리 켜기)가 ☰기능 FAB·유튜브 하단 컨트롤과 겹치는지
 * 실행: node test-harness/vc_video_tab_portrait_harness.mjs
 *   (사전에 cloudflare-deploy/public 을 http://localhost:8791 로 서빙)
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://localhost:8791';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
const VW = parseInt(process.env.VW || '390', 10), VH = parseInt(process.env.VH || '844', 10);
await page.setViewport({ width: VW, height: VH, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

// 통화 상태 강제 셋업 + 동영상 탭 활성 + 유튜브 임베드/소리켜기 버튼 재현
await page.evaluate(() => {
  // 인트로/시계 오버레이 제거 (스크린샷 시야 확보)
  ['mango-intro-overlay', 'mango-dualclock'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-videocall-call').classList.add('active');
  document.body.classList.add('vc-in-call', 'vc-orientation-dismissed');
  const grid = document.getElementById('vc-video-grid');
  if (!document.getElementById('vc-remote-fake')) {
    const b = document.createElement('div');
    b.className = 'video-box'; b.id = 'vc-remote-fake';
    b.innerHTML = '<video autoplay muted playsinline></video><span class="video-label">학생</span>';
    grid.appendChild(b);
  }
  grid.setAttribute('data-count', '2');
  // 세로 기본 모드 = video-pip (교재/콘텐츠 주인공 + 영상 우상단 PIP)
  const row = document.getElementById('vc-main-row');
  row.classList.remove('video-quarter','video-half','video-threequarter','video-full','video-solo','video-facepip');
  row.classList.add('video-pip');
  // 동영상 탭 활성화
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const tv = document.getElementById('tab-video');
  tv.classList.add('active');
  // 유튜브 임베드 + 🔊 소리 켜기 버튼 (mangoiPlayLessonVideo 가 만드는 것과 동일 구조)
  const st = document.getElementById('vp-stage');
  st.innerHTML =
    '<div style="position:absolute;top:8px;left:8px;z-index:2;background:#2563eb;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px">예습 · 테스트영상</div>' +
    '<iframe id="ml-frame" src="about:blank" style="width:100%;height:100%;border:0;border-radius:8px;background:#000"></iframe>' +
    '<button id="ml-un" style="position:absolute;bottom:70px;right:12px;z-index:2;padding:7px 14px;border:0;border-radius:8px;background:#f59e0b;color:#1f2937;font-weight:800;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.45)">🔊 소리 켜기</button>';
});
// unibar tick(0.7s) + phero ctrl 주입 대기
await new Promise(r => setTimeout(r, 1600));

const data = await page.evaluate(() => {
  const R = sel => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             right: Math.round(r.right), bottom: Math.round(r.bottom),
             disp: cs.display, pos: cs.position, z: cs.zIndex, vis: cs.visibility };
  };
  const ctlBtns = [...document.querySelectorAll('#tab-video .vp-controls > *')].map(el => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, txt: (el.textContent || el.placeholder || '').trim().slice(0, 14),
             x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             right: Math.round(r.right), bottom: Math.round(r.bottom), disp: getComputedStyle(el).display };
  });
  return {
    vw: innerWidth, vh: innerHeight,
    unibar: R('#mg-unibar'),
    toolbar: R('.toolbar'),
    contentPane: R('#vc-content-pane'),
    videoPane: R('#vc-video-pane'),       // = PIP
    vpControls: R('#tab-video .vp-controls'),
    vpStage: R('#vp-stage'),
    vpProgress: R('#vp-progress'),
    mlUn: R('#ml-un'),
    pheroBtn: R('#vc-phero-menu-btn'),
    dock: R('#vc-dock') || R('.vc-dock'),
    ctlBtns,
  };
});

console.log(JSON.stringify(data, null, 1));

// 겹침 판정
function overlap(a, b) {
  if (!a || !b || a.disp === 'none' || b.disp === 'none' || !a.w || !b.w) return 0;
  const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return ox * oy;
}
const inPipZone = b => b && data.videoPane && b.disp !== 'none' && overlap(b, data.videoPane) > 0;
const checks = [
  ['unibar ⨯ 컨트롤 버튼들(개별)', data.ctlBtns.reduce((s, b) => s + overlap(data.unibar, b), 0)],
  ['unibar ⨯ 영상 PIP', overlap(data.unibar, data.videoPane)],
  ['영상 PIP ⨯ 컨트롤 버튼들(개별)', data.ctlBtns.reduce((s, b) => s + overlap(data.videoPane, b), 0)],
  ['소리켜기(ml-un) ⨯ ☰기능 FAB', overlap(data.mlUn, data.pheroBtn)],
];
let fail = 0;
for (const [name, area] of checks) { if (area > 0) fail++; console.log((area > 0 ? '❌ 겹침 ' : '✅ 통과 ') + name + ' = ' + area + 'px²'); }
// 유튜브 하단 컨트롤대(스테이지 아래 60px) 침범 여부
if (data.mlUn && data.vpStage) {
  const inYtBar = data.mlUn.bottom > data.vpStage.bottom - 60;
  if (inYtBar) fail++;
  console.log((inYtBar ? '❌ 겹침 ' : '✅ 통과 ') + '소리켜기 ⨯ 유튜브 하단컨트롤대(스테이지 하단 60px)');
}
// 컨트롤 버튼끼리 상호 겹침
let btnPair = 0;
for (let i = 0; i < data.ctlBtns.length; i++)
  for (let j = i + 1; j < data.ctlBtns.length; j++)
    btnPair += overlap(data.ctlBtns[i], data.ctlBtns[j]);
if (btnPair > 0) fail++;
console.log((btnPair > 0 ? '❌ 겹침 ' : '✅ 통과 ') + '컨트롤 버튼 상호 겹침 = ' + btnPair + 'px²');

console.log(fail === 0 ? '\n🎉 ALL PASS' : '\n💥 ' + fail + ' FAIL');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
process.exit(fail === 0 ? 0 : 1);
