/**
 * 📱 화상수업 세로 "학생 크게(facepip)" / "교재 크게(pip)" 레이아웃 실측 하니스
 * 실행: node test-harness/vc_facepip_layout_harness.mjs
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.resolve(__dirname, '..', 'cloudflare-deploy', 'public', 'index.html');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
// file:// 에서만 터지는 ServiceWorker SecurityError 가 스크립트를 중단시키지 않도록 SW를 stub
await page.evaluateOnNewDocument(() => {
  try {
    const mock = { register: () => Promise.resolve({ update(){}, unregister(){ return Promise.resolve(true); } }),
      getRegistrations: () => Promise.resolve([]), getRegistration: () => Promise.resolve(undefined),
      ready: Promise.resolve({}), addEventListener(){}, controller: null };
    Object.defineProperty(navigator, 'serviceWorker', { get: () => mock, configurable: true });
  } catch (_) {}
});
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto('file:///' + INDEX.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 900));

// 통화 상태 강제 셋업: 뷰 활성 + body.vc-in-call + 원격 참가자 1명 추가(총 2명)
await page.evaluate(() => {
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-videocall-call').classList.add('active');
  document.body.classList.add('vc-in-call');
  const grid = document.getElementById('vc-video-grid');
  // 원격 학생 타일 추가
  if (!document.getElementById('vc-remote-fake')) {
    const b = document.createElement('div');
    b.className = 'video-box'; b.id = 'vc-remote-fake';
    b.innerHTML = '<video autoplay muted playsinline></video><span class="video-label">학생</span>';
    grid.appendChild(b);
  }
  grid.setAttribute('data-count', '2');
});
await new Promise(r => setTimeout(r, 300));

async function measure(mode) {
  // class 를 직접 토글 (vcScreenSet 은 file:// 에서 앞선 스크립트 throw 로 undefined 일 수 있음)
  await page.evaluate(m => {
    const row = document.querySelector('.vc-main-row');
    row.classList.remove('video-quarter','video-half','video-threequarter','video-full','video-pip','video-solo','video-facepip');
    row.classList.add('video-' + m);
  }, mode);
  await new Promise(r => setTimeout(r, 450));
  return await page.evaluate(() => {
    const vh = window.innerHeight, vw = window.innerWidth;
    const R = sel => {
      const el = document.querySelector(sel); if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
               disp: cs.display, pos: cs.position, flexDir: cs.flexDirection };
    };
    const boxes = [...document.querySelectorAll('#vc-video-grid .video-box')].map(el => {
      const r = el.getBoundingClientRect();
      return { id: el.id || '(remote)', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), disp: getComputedStyle(el).display };
    });
    const row = document.getElementById('vc-main-row');
    return {
      vh, vw, rowClass: row ? row.className : '(none)',
      view: R('#view-videocall-call'),
      row: R('#vc-main-row'),
      videoPane: R('#vc-video-pane'),
      contentPane: R('#vc-content-pane'),
      grid: R('#vc-video-grid'),
      boxes,
      phero: R('#vc-phero-ctrl'),
    };
  });
}

for (const mode of ['facepip', 'pip']) {
  const m = await measure(mode);
  console.log(`\n═══════════ MODE: ${mode}  (viewport ${m.vw}x${m.vh}) ═══════════`);
  console.log('rowClass:', m.rowClass);
  const pr = (label, o) => console.log(`  ${label.padEnd(12)}`, o ? `x=${o.x} y=${o.y} w=${o.w} h=${o.h} disp=${o.disp} pos=${o.pos} flex=${o.flexDir}` : 'NULL');
  pr('view', m.view);
  pr('row', m.row);
  pr('videoPane', m.videoPane);
  pr('contentPane', m.contentPane);
  pr('grid', m.grid);
  m.boxes.forEach(b => console.log(`    box ${String(b.id).padEnd(12)} x=${b.x} y=${b.y} w=${b.w} h=${b.h} disp=${b.disp}`));
  pr('phero-ctrl', m.phero);
  // 진단
  if (m.videoPane) {
    const fill = Math.round(m.videoPane.h / m.vh * 100);
    console.log(`  ▶ videoPane가 세로높이의 ${fill}% 차지` + (fill < 70 ? '  ⚠️ 화면을 못 채움(빈 공간 발생)' : '  ✅'));
  }
}

await browser.close();
