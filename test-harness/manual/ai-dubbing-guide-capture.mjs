// 📸 A.i영화더빙 «사용방법» 안내창 그림 만들기 (2026-10-26)
//   실제 화면(ai-dubbing.html)을 로컬에서 그대로 띄워 — 장면 고르기 · 역할 고르기 · 연습 중(가짜 마이크) —
//   화살표·번호·상자를 SVG 로 얹고, 폰 폭(390px)으로 잘라 저장한다. 언어별 두 벌(ko/en).
//   · 개인정보 없음: 로그인 안 함, 학생 이름은 화면 기본값(학생 1/Student 1), 모둠 이름 비움.
//   · 다른 업체 그림 없음: 이 저장소의 화면·영상 그림만 찍힌다.
//   · 마이크는 Chromium 가짜 장치(--use-fake-device-for-media-stream)다 — 실제 소리를 받지 않는다.
//   ⚠️ 화면이 바뀌면 이것을 다시 돌려 그림을 갈아 끼우고 js/ai-dubbing-guide.js 의 IMG_V 와
//      STEPS[].size(아래가 찍어 주는 크기)를 함께 고친다.
//   자동으로 안 돈다(manual/) — 사람이 부른다(리포 루트에서):
//       node <정적 서버> cloudflare-deploy/public 8941     (Range 를 받는 서버여야 영상이 돈다)
//       node test-harness/manual/ai-dubbing-guide-capture.mjs cloudflare-deploy/public/img/dubbing-guide
//   playwright 위치: PW_DIR(그 안의 node_modules) → 이 저장소 → /opt/node-tools 순으로 찾는다.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const B = process.env.BASE || 'http://127.0.0.1:8941';
const OUT = process.argv[2];
if (!OUT) { console.error('사용법: node ai-dubbing-guide-capture.mjs <저장 폴더>'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

function loadChromium() {
  const roots = [process.env.PW_DIR && process.env.PW_DIR + '/node_modules/', import.meta.url, '/opt/node-tools/node_modules/'].filter(Boolean);
  for (const r of roots) for (const m of ['playwright', 'playwright-core']) {
    try { return createRequire(r)(m).chromium; } catch (e) {}
  }
  throw new Error('playwright 를 찾지 못했습니다 — PW_DIR 을 지정하세요');
}
const chromium = loadChromium();

/* 표시: { sel, n, from:[dx,dy], pad, box } — 상자 + (번호 + 화살표). spot = 이것만 밝게, 나머지는 어둡게 */
const STEPS = [
  { name: '1-pick',
    clip: { from: 'section[aria-label="장면 고르기"] h2', to: '#dub-scenes .scene:nth-child(1)', padX: 0, padT: 10, padB: 14, full: 'section[aria-label="장면 고르기"]' },
    spot: ['section[aria-label="장면 고르기"] > div:first-child', '#dub-scenes .scene:nth-child(1)'],
    marks: [
      { sel: '#dub-scenes .scene:nth-child(1) [data-watch]', n: 1, from: [92, 0], pad: 4 },
      { sel: '#dub-scenes .scene:nth-child(1) [data-scene]', n: 2, from: [92, 0], pad: 4 }] },
  { name: '2-follow', prepare: 'sheet',
    clip: { from: '#dub-cast .stu', to: '#dub-start', padX: 0, padT: 0, padB: 12, full: '#dub-side' },
    marks: [
      { sel: ['#dub-cast .stu .chip:nth-child(1)', '#dub-cast .stu .chip:last-child'], n: 1, from: [54, 0], pad: 5 },
      { sel: '#dub-mode', n: 2, from: [70, 0], pad: 4 },
      { sel: '#dub-start', n: 3, from: [0, 0], pad: 5, badge: true }] },
  { name: '3-speak', prepare: 'run',
    clip: { from: '#dub-stage', to: '#dub-stop', padX: 0, padT: 10, padB: 12, full: '#dub-player' },
    marks: [
      { sel: '#dub-sub', n: 1, pad: 4, badge: true },
      { sel: '#dub-done', n: 2, from: [0, 44], pad: 5 }] },
];

const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const sizes = {};
for (const lang of ['ko', 'en']) {
  for (const s of STEPS) {
    // 키 큰 화면(390×1300) — 폰 배치 그대로, 고정 바텀시트 내용이 한 화면에 다 들어오게
    const ctx = await b.newContext({ viewport: { width: 390, height: 1300 }, deviceScaleFactor: 2, serviceWorkers: 'block', permissions: ['microphone'], hasTouch: true, isMobile: true });
    await ctx.addInitScript((l) => {
      try { localStorage.clear(); localStorage.setItem('mangoi_lang', l); sessionStorage.setItem('mangoi_dub_guide_seen_v1', '1'); } catch (e) {}
    }, lang);
    const p = await ctx.newPage();
    await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
    await p.goto(B + '/ai-dubbing.html?_nc=' + Date.now(), { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    if (s.prepare === 'sheet' || s.prepare === 'run') {
      await p.click('#dub-scenes .scene:nth-child(1) [data-scene]');
      await p.waitForTimeout(500);
    }
    if (s.prepare === 'run') {
      await p.click('#dub-start');
      await p.waitForFunction(() => !document.getElementById('dub-turn').hidden && !document.getElementById('dub-done').disabled && !document.getElementById('dub-sub').hidden, null, { timeout: 90000 });
      await p.waitForTimeout(700);
    }
    const clip = await p.evaluate(({ s }) => {
      document.querySelectorAll('.__ann').forEach(e => e.remove());
      const q = (sel) => { const e = document.querySelector(sel); if (!e) throw new Error('no ' + sel); return e; };
      /* 고정 시트 밖 요소는 상단바(56px) 아래로 스크롤해 둔다 */
      if (s.prepare !== 'sheet') { q(s.clip.from).scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); }
      const R1 = (sel) => { const r = q(sel).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      /* 여러 요소면 그 전체를 감싸는 상자 */
      const R = (sel) => { if (!Array.isArray(sel)) return R1(sel); const rs = sel.map(R1); const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)); return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y }; };
      const full = R(s.clip.full), a = R(s.clip.from), z = R(s.clip.to);
      const x = Math.max(0, full.x - s.clip.padX), y = Math.max(0, a.y - s.clip.padT);
      const w = Math.min(document.documentElement.clientWidth - x, full.w + s.clip.padX * 2);
      const h = Math.min(innerHeight - y, z.y + z.h + s.clip.padB - y);
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', '__ann');
      svg.setAttribute('style', `position:fixed;left:0;top:0;width:${innerWidth}px;height:${innerHeight}px;z-index:2147483647;pointer-events:none;overflow:visible`);
      document.body.appendChild(svg);
      const add = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); svg.appendChild(e); return e; };
      if (s.spot) {   // 밝게 둘 곳마다 구멍을 뚫은 어두운 막
        const g = 3, holes = [].concat(s.spot).map(R).map(r => `M${r.x - g} ${r.y - g}h${r.w + g * 2}v${r.h + g * 2}h-${r.w + g * 2}Z`).join(' ');
        add('path', { d: `M0 0H${innerWidth}V${innerHeight}H0Z ${holes}`, fill: 'rgba(3,6,12,.62)', 'fill-rule': 'evenodd' });
      }
      const circle = (cx, cy, n) => {
        add('circle', { cx, cy, r: 17, fill: '#ff2d6f', stroke: '#fff', 'stroke-width': 3 });
        const t = add('text', { x: cx, y: cy + 6.5, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 900, fill: '#fff', 'font-family': 'sans-serif' });
        t.textContent = String(n);
      };
      for (const m of s.marks) {
        const r = R(m.sel), pd = m.pad || 4;
        add('rect', { x: r.x - pd, y: r.y - pd, width: r.w + pd * 2, height: r.h + pd * 2, rx: 10, fill: 'none', stroke: '#fff', 'stroke-width': 7, opacity: .9 });
        add('rect', { x: r.x - pd, y: r.y - pd, width: r.w + pd * 2, height: r.h + pd * 2, rx: 10, fill: 'none', stroke: '#ff2d6f', 'stroke-width': 4 });
        if (m.badge) { circle(r.x + 22, r.y + r.h / 2, m.n); continue; }   // 넓은 버튼은 번호를 버튼 왼쪽 안에
        if (m.box || !m.from) continue;
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const [dx, dy] = m.from;
        let sx = cx + (dx > 0 ? r.w / 2 + pd : dx < 0 ? -(r.w / 2 + pd) : 0) + dx, sy = cy + (dy > 0 ? r.h / 2 + pd : dy < 0 ? -(r.h / 2 + pd) : 0) + dy;
        sx = Math.max(22, Math.min(innerWidth - 22, sx));   // 번호 동그라미가 그림 밖으로 잘리지 않게(영어는 버튼이 넓다)
        const qd = pd + 5, cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const ex = cl(sx, r.x - qd, r.x + r.w + qd), ey = cl(sy, r.y - qd, r.y + r.h + qd);
        const ang = Math.atan2(ey - sy, ex - sx), L = 16;
        const hx = ex - Math.cos(ang) * L * .6, hy = ey - Math.sin(ang) * L * .6;
        for (const [col, wd] of [['#fff', 11], ['#ff2d6f', 6]]) {
          add('line', { x1: sx, y1: sy, x2: hx, y2: hy, stroke: col, 'stroke-width': wd, 'stroke-linecap': 'round' });
          const p1 = [ex - Math.cos(ang - .5) * L * 1.4, ey - Math.sin(ang - .5) * L * 1.4], p2 = [ex - Math.cos(ang + .5) * L * 1.4, ey - Math.sin(ang + .5) * L * 1.4];
          add('polygon', { points: `${ex},${ey} ${p1} ${p2}`, fill: col, stroke: col, 'stroke-width': col === '#fff' ? 5 : 0, 'stroke-linejoin': 'round' });
        }
        circle(sx, sy, m.n);
      }
      return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
    }, { s });
    const file = `${OUT}/${s.name}-${lang}.jpg`;
    await p.screenshot({ path: file, type: 'jpeg', quality: 80, clip });
    sizes[s.name] = sizes[s.name] || {};
    sizes[s.name][lang] = [clip.width * 2, clip.height * 2];
    console.log(lang, s.name, JSON.stringify(clip), Math.round(fs.statSync(file).size / 1024) + 'KB');
    await ctx.close();
  }
}
await b.close();
console.log('STEPS[].size =', JSON.stringify(sizes));
