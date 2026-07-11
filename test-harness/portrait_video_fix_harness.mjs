/**
 * 📱 세로 카메라 얼굴 잘림 방지 검증 하니스 (2026-07-12)
 *
 * 검증 대상: cloudflare-deploy/public/index.html
 *  - vcWatchVideoAspect(): 세로(portrait) 스트림 감지 → .video-box에 .vid-portrait 부여
 *  - <style id="vid-portrait-fix">: .vid-portrait video → object-fit: contain
 *  - 가로 스트림으로 바뀌면 클래스 해제 → object-fit: cover 복귀
 *
 * 실행: node test-harness/portrait_video_fix_harness.mjs
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.resolve(__dirname, '..', 'cloudflare-deploy', 'public', 'index.html');
const CHROME = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 850, isMobile: true, hasTouch: true });
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));

  await page.goto('file:///' + INDEX.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#vc-local-video', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500)); // 초기화 스크립트 안정화

  // 하니스 준비: 캔버스 스트림(가짜 카메라)을 만들어 내 비디오에 주입
  const setStream = (w, h) => page.evaluate(async (w, h) => {
    const v = document.getElementById('vc-local-video');
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a6'; ctx.fillRect(0, 0, w, h);
    setInterval(() => { ctx.fillStyle = '#3a6'; ctx.fillRect(0, 0, w, h); }, 200);
    v.srcObject = c.captureStream(5);
    try { await v.play(); } catch (e) {}
    // videoWidth 반영 대기
    for (let i = 0; i < 50 && v.videoWidth === 0; i++) await new Promise(r => setTimeout(r, 100));
    return { vw: v.videoWidth, vh: v.videoHeight };
  }, w, h);

  const inspect = () => page.evaluate(() => {
    const v = document.getElementById('vc-local-video');
    const box = document.getElementById('vc-local-box');
    return {
      hasClass: box.classList.contains('vid-portrait'),
      objectFit: getComputedStyle(v).objectFit,
      wired: !!v.__aspectWatch,
      fnExists: typeof window.vcWatchVideoAspect === 'function',
    };
  });

  // 0) JS가 정상 로드·와이어링 되었는가
  const pre = await inspect();
  check('vcWatchVideoAspect 함수 존재', pre.fnExists);
  check('내 비디오에 감시 리스너 연결됨', pre.wired);

  // 1) 세로(480x640) 스트림 → vid-portrait + contain
  const dim1 = await setStream(480, 640);
  await new Promise(r => setTimeout(r, 800));
  const s1 = await inspect();
  check('세로 스트림 주입', dim1.vw === 480 && dim1.vh === 640, `videoWidth=${dim1.vw}x${dim1.vh}`);
  check('세로 영상 → .vid-portrait 클래스 부여', s1.hasClass);
  check('세로 영상 → object-fit: contain (얼굴 전체 표시)', s1.objectFit === 'contain', `objectFit=${s1.objectFit}`);

  // 2) 가로(640x480) 스트림으로 교체 → 클래스 해제 + cover 복귀
  const dim2 = await setStream(640, 480);
  await new Promise(r => setTimeout(r, 800));
  const s2 = await inspect();
  check('가로 스트림 교체', dim2.vw === 640 && dim2.vh === 480, `videoWidth=${dim2.vw}x${dim2.vh}`);
  check('가로 영상 → .vid-portrait 해제', !s2.hasClass);
  check('가로 영상 → object-fit: cover 복귀', s2.objectFit === 'cover', `objectFit=${s2.objectFit}`);

  // 3) 원격 참가자 박스(동적 추가)도 감시되는가 — MutationObserver 검증
  const s3 = await page.evaluate(async () => {
    const grid = document.getElementById('vc-video-grid');
    const box = document.createElement('div');
    box.className = 'video-box';
    box.id = 'vc-video-testpeer';
    box.innerHTML = '<video autoplay playsinline muted></video><span class="video-label">테스트</span>';
    grid.appendChild(box);
    const v = box.querySelector('video');
    const c = document.createElement('canvas');
    c.width = 360; c.height = 640;
    const ctx = c.getContext('2d');
    ctx.fillRect(0, 0, 360, 640);
    setInterval(() => ctx.fillRect(0, 0, 360, 640), 200);
    v.srcObject = c.captureStream(5);
    try { await v.play(); } catch (e) {}
    for (let i = 0; i < 50 && v.videoWidth === 0; i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 600));
    return {
      wired: !!v.__aspectWatch,
      hasClass: box.classList.contains('vid-portrait'),
      objectFit: getComputedStyle(v).objectFit,
    };
  });
  check('동적 추가된 원격 박스도 자동 감시(MutationObserver)', s3.wired);
  check('원격 세로 영상 → .vid-portrait + contain', s3.hasClass && s3.objectFit === 'contain', `objectFit=${s3.objectFit}`);

  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${fails === 0 ? '🎉 전체 통과' : '⚠️ 실패 ' + fails + '건'} (${results.length}개 검사)`);
  process.exitCode = fails === 0 ? 0 : 1;
} finally {
  await browser.close();
}
