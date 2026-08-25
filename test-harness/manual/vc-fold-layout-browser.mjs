/**
 * 📱 펼친 폴더블·태블릿 수업화면 + 교재 확대 — 진짜 브라우저로 확인 (2026-08-25)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   이번에 고친 것은 «화면에 무엇이 어디에 얼마만큼 보이는가» 다. 문자열 하니스는
 *   그것을 못 본다(CLAUDE.md 「화면 좌표가 틀린 버그를 하니스가 못 잡음」).
 *   실제로 이 검사가 두 가지를 잡았다 —
 *     · 회전 안내 오버레이가 .vc-wide 만으로는 안 꺼진다(특이도 부족, display:flex 그대로)
 *     · 확대 배율은 올라가는데 캔버스가 화면에서 «도로 줄어든다»
 *       (css/mangoi-layout.css 의 전역 img,canvas{max-width:100%})
 *
 * ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 가 전부 404 다(CLAUDE.md 2장).
 * ⚠️ isMobile:true 를 켜지 않는다 — 폭만 좁히면 되는 검사에서 좌표가 어긋난다(CLAUDE.md).
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. css/vc-fold.css · js/idx-vc-fold.js ·
 *    수업화면 레이아웃(index.html 의 세로/가로 미디어쿼리)을 건드리면 사람이 불러야 한다:
 *      PW_DIR=/tmp/pw node test-harness/manual/vc-fold-layout-browser.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8941;

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail !== undefined ? ' — ' + detail : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
                  { cwd: PUB, stdio: 'ignore' });
await sleep(1200);

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

/** 수업 화면을 «들어간 상태» 로 만들고 얼굴 타일 2개를 세운다.
    ⚠️ 진짜 vcJoinRoom 은 카메라·WebSocket 이 필요해 헤드리스에서 못 돈다.
       여기서 재는 것은 «레이아웃» 이므로 클래스와 DOM 만 같게 맞춘다. */
async function openCall(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await sleep(2600);
  await page.evaluate(async () => {
    document.querySelectorAll('#aw-overlay, #mangoi-widget, #mangoi-toggle').forEach(e => e.remove());
    document.body.classList.add('vc-in-call');
    document.getElementById('view-videocall-call').classList.add('active');
    document.querySelectorAll('.view').forEach(x => { if (x.id !== 'view-videocall-call') x.classList.remove('active'); });
    const g = document.getElementById('vc-video-grid');
    if (g && !document.getElementById('vc-local-box')) {
      const b = document.createElement('div'); b.className = 'video-box'; b.id = 'vc-local-box';
      b.appendChild(document.createElement('video')); g.appendChild(b);
    }
    if (g && !document.getElementById('vc-video-tt')) {
      const a = document.createElement('div'); a.className = 'video-box'; a.id = 'vc-video-tt';
      a.appendChild(document.createElement('video'));
      g.insertBefore(a, document.getElementById('vc-local-box'));
    }
    if (g) g.setAttribute('data-count', '2');
    window.dispatchEvent(new Event('resize'));
    await new Promise(r => setTimeout(r, 700));
  });
  return { ctx, page };
}

const geom = page => page.evaluate(() => {
  const q = s => document.querySelector(s);
  const r = s => { const e = q(s); if (!e) return null; const b = e.getBoundingClientRect();
                   return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return {
    wide: document.body.classList.contains('vc-wide'),
    dir: getComputedStyle(q('#vc-main-row')).flexDirection,
    content: r('#vc-content-pane'), video: r('#vc-video-pane'),
    teach: r('#vc-video-tt'), local: r('#vc-local-box'),
    wrap: r('#pdf-scroll-wrap'),
    overlay: getComputedStyle(q('#vc-orientation-overlay')).display,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
});

// ── 1부. 펼친 Z 폴드(세로) — 실측 738×830 ────────────────────────────────
console.log('\n① 펼친 Z 폴드 · 세로 (738×830)');
{
  const { ctx, page } = await openCall(738, 830);
  const g = await geom(page);
  ok('넓은 화면으로 인식(vc-wide)', g.wide === true, JSON.stringify(g.wide));
  ok('좌우 배치(가로 방향)', g.dir === 'row', g.dir);
  ok('교재가 «왼쪽»', g.content && g.video && g.content.x < g.video.x, JSON.stringify([g.content, g.video]));
  ok('얼굴이 «오른쪽 기둥»(세로로 길다)', g.video && g.video.h > g.video.w, JSON.stringify(g.video));
  ok('교재 칸이 화면 절반 이상', g.content && g.content.w >= 738 * 0.5, g.content && g.content.w);
  ok('교재 상자가 세로로 500px 이상 (고치기 전 244px)', g.wrap && g.wrap.h >= 500, g.wrap && g.wrap.h);
  ok('교사 타일이 학생 타일 «위»', g.teach && g.local && g.teach.y < g.local.y, JSON.stringify([g.teach && g.teach.y, g.local && g.local.y]));
  ok('교사 타일 ≥ 학생 타일 (넓이×높이, 오차 2%)',
     g.teach && g.local && (g.teach.w * g.teach.h) >= (g.local.w * g.local.h) * 0.98,
     JSON.stringify([g.teach, g.local]));
  ok('「가로로 돌려주세요」 안내 안 뜸', g.overlay === 'none', g.overlay);
  ok('문서가 가로로 안 밀림', g.overflowX === false);
  await ctx.close();
}

// ── 2부. 폰 세로는 «한 글자도» 바뀌면 안 된다 ─────────────────────────────
console.log('\n② 폰 세로 (390×844) — 기존 배치 유지');
{
  const { ctx, page } = await openCall(390, 844);
  const g = await geom(page);
  ok('넓은 화면이 아님', g.wide === false);
  ok('위·아래 배치 유지(column)', g.dir === 'column', g.dir);
  ok('얼굴이 «위»', g.video && g.content && g.video.y < g.content.y, JSON.stringify([g.video, g.content]));
  ok('회전 안내는 그대로 뜬다', g.overlay === 'flex', g.overlay);
  /* ⛔ 폰의 터치 동작은 한 글자도 바꾸지 않는다 — 브라우저가 대신 굴려 주는 것을 끄면
     이동이 전부 JS 몫이 된다. 학생 29,000명이 쓰는 화면에서 질 위험이 아니다. */
  const t = await page.evaluate(() => {
    const w = document.getElementById('pdf-scroll-wrap');
    const c = getComputedStyle(w);
    return { touchAction: c.touchAction, behavior: c.scrollBehavior };
  });
  ok('폰의 touch-action 은 그대로(pan-x pan-y)', t.touchAction === 'pan-x pan-y', t.touchAction);
  ok('끌면 바로 움직이도록 scroll-behavior 만 auto', t.behavior === 'auto', t.behavior);
  await ctx.close();
}

// ── 3부. 폰 가로·PC 도 그대로 ─────────────────────────────────────────────
for (const [w, h, name] of [[844, 390, '폰 가로'], [1440, 900, 'PC']]) {
  console.log(`\n③ ${name} (${w}×${h}) — 기존 배치 유지`);
  const { ctx, page } = await openCall(w, h);
  const g = await geom(page);
  ok('넓은 화면 클래스가 안 붙는다', g.wide === false);
  ok('교재가 왼쪽(기존 mg-vc-right-sidebar 배치)', g.content.x < g.video.x, JSON.stringify([g.content.x, g.video.x]));
  await ctx.close();
}

// ── 4부. 교재 확대 ────────────────────────────────────────────────────────
console.log('\n④ 교재 확대 (펼친 폴드 세로)');
{
  const { ctx, page } = await openCall(738, 830);
  const base = await page.evaluate(async () => {
    window.vcSwitchTab && window.vcSwitchTab('pdf');
    await new Promise(r => setTimeout(r, 300));
    await window.pdfLoad('/img/mango-char.png', 'image');
    await new Promise(r => setTimeout(r, 900));
    const c = document.getElementById('pdf-canvas');
    const w = document.getElementById('pdf-scroll-wrap');
    return { css: Math.round(c.getBoundingClientRect().width), touchAction: getComputedStyle(w).touchAction,
             pinch: !!w.__foldPinch, zoom: window.pdfGetZoom() };
  });
  ok('교재 상자가 브라우저에 제스처를 안 넘긴다(touch-action:none)', base.touchAction === 'none', base.touchAction);
  ok('핀치 확대가 붙어 있다', base.pinch === true);
  ok('처음 배율은 100%', base.zoom === 1, base.zoom);

  const after = await page.evaluate(async () => {
    window.pdfSetZoom(3);
    await new Promise(r => setTimeout(r, 1200));
    const c = document.getElementById('pdf-canvas');
    const w = document.getElementById('pdf-scroll-wrap');
    return { css: Math.round(c.getBoundingClientRect().width), scrollW: w.scrollWidth, clientW: w.clientWidth,
             docOverflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  ok('3배로 키우면 화면에서도 3배 가까이 커진다 (전역 max-width:100% 예외)',
     after.css >= base.css * 2.4, `${base.css} → ${after.css}`);
  ok('넘친 만큼은 교재 상자 «안» 에서 굴러간다', after.scrollW > after.clientW, JSON.stringify(after));
  ok('문서 전체는 옆으로 안 밀린다', after.docOverflow === false);

  // 두 손가락으로 실제 벌리기
  const box = await page.evaluate(() => { const r = document.getElementById('pdf-scroll-wrap').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.evaluate(() => window.pdfSetZoom(1));
  await sleep(600);
  const cdp = await ctx.newCDPSession(page);
  const P = (x, y) => ({ x, y, radiusX: 2, radiusY: 2, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P(box.x - 40, box.y), P(box.x + 40, box.y)] });
  for (let i = 1; i <= 6; i++) {
    const d = 40 + i * 15;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(box.x - d, box.y), P(box.x + d, box.y)] });
    await sleep(60);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
  const pinched = await page.evaluate(() => window.pdfGetZoom());
  ok('손가락으로 벌리면 실제로 커진다', pinched > 1.5, '배율 ' + pinched);

  /* 한 손가락 이동 — touch-action:none 으로 브라우저 스크롤을 껐으므로
     JS 이동이 반드시 살아 있어야 한다(안 그러면 확대한 교재를 볼 방법이 없다). */
  const panned = await page.evaluate(async () => {
    const w = document.getElementById('pdf-scroll-wrap');
    w.scrollLeft = 0; w.scrollTop = 0;
    return { before: w.scrollLeft };
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [P(box.x + 80, box.y + 60)] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [P(box.x + 80 - i * 20, box.y + 60)] });
    await sleep(50);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const panAfter = await page.evaluate(() => document.getElementById('pdf-scroll-wrap').scrollLeft);
  ok('한 손가락으로 끌면 확대한 교재가 움직인다', panAfter > 20, `${panned.before} → ${panAfter}`);
  await ctx.close();
}

// ── 5부. 교사 확대 → 학생에게 전달 ────────────────────────────────────────
console.log('\n⑤ 교재 확대 동기화 (교사 → 학생)');
{
  const { ctx, page } = await openCall(738, 830);
  const r = await page.evaluate(async () => {
    window.vcSwitchTab && window.vcSwitchTab('pdf');
    await new Promise(r => setTimeout(r, 200));
    await window.pdfLoad('/img/mango-char.png', 'image');
    await new Promise(r => setTimeout(r, 600));
    const sent = [];
    window.vcConn = { send: m => sent.push(m) };
    window.vcMyRole = 'teacher';
    window.pdfSetZoom(1.8);
    const teacher = JSON.parse(JSON.stringify(sent));
    window.vcMyRole = 'student'; sent.length = 0;
    window.vcHandleMessage({ type: 'pdf-zoom', data: { zoom: 2.4, role: 'teacher' } });
    const applied = window.pdfGetZoom();
    window.pdfSetZoom(1.2);                       // 학생이 자기 화면을 바꾼 경우
    const studentSent = sent.length;
    window.vcHandleMessage({ type: 'pdf-zoom', data: { zoom: 4, role: 'student' } });
    const afterSpoof = window.pdfGetZoom();
    return { teacher, applied, studentSent, afterSpoof };
  });
  ok('교사가 키우면 방에 보낸다', r.teacher.length === 1 && r.teacher[0].type === 'pdf-zoom' && r.teacher[0].data.zoom === 1.8, JSON.stringify(r.teacher));
  ok('학생 화면에 그 배율이 적용된다', r.applied === 2.4, r.applied);
  ok('학생이 바꾼 배율은 방에 안 보낸다', r.studentSent === 0, r.studentSent);
  ok('학생이 보낸 배율은 무시한다', r.afterSpoof === 1.2, r.afterSpoof);
  await ctx.close();
}

await browser.close();
srv.kill();
console.log(`\n결과: ✅ ${pass} · ❌ ${fail}`);
process.exit(fail ? 1 : 0);
