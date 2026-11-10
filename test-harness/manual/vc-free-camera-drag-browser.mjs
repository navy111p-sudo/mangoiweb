// vc-free-camera-drag-browser.mjs — 떠 있는(자유 크기) 얼굴 창을 «얼굴 영역» 을 끌어 옮기는지 실제 브라우저로 잰다 (2026-11-10)
// ⚠️ 자동으로 안 돕니다(manual/). 사람이 부릅니다:
//    cd cloudflare-deploy/public && python3 -m http.server 8977 &   (다른 창)
//    node test-harness/manual/vc-free-camera-drag-browser.mjs
// 폭: PC 3종 + 낮은 노트북(높이 560). ⚠️ 폰 가로(844x390)는 뺐다 — 그립을 끌어도 자유 모드에 안 들어간다(기존 동작, 2026-11-10 실측).
// 변이시험: MUTANT_JS=<옛 idx-vc-sizebar.js 사본> 이면 그 파일을 대신 내려준다 → ②③④ 가 FAIL 나야 한다.
import { readFileSync } from 'node:fs';
import { requireBrowser } from './_pw.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8977';
const { chromium, exe } = requireBrowser();
let pass = 0, fail = 0;
const ok = (n, c, i = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (i ? ' — ' + i : '')); } };

const b = await chromium.launch({ executablePath: exe });
for (const vp of [{ width: 1366, height: 650 }, { width: 1920, height: 940 }, { width: 1024, height: 700 }, { width: 1366, height: 560 }]) {
  for (const touch of [false, true]) {
    const tag = `[${vp.width}x${vp.height}${touch ? ' touch' : ''}]`;
    const ctx = await b.newContext({ viewport: vp, hasTouch: touch, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
    if (process.env.MUTANT_JS) await p.route('**/js/idx-vc-sizebar.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(process.env.MUTANT_JS, 'utf8') }));
    await p.goto(BASE + '/index.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    await p.evaluate(() => {
      try { if (window.vcNukeRotationOverlays) vcNukeRotationOverlays(); } catch (e) {}
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-videocall-call').classList.add('active');
      document.body.classList.add('vc-in-call');
      window.__clicks = 0;
      document.getElementById('vc-local-box').addEventListener('click', () => { window.__clicks++; });
    });
    await p.waitForTimeout(1200);
    const rect = sel => p.evaluate(s => { const x = document.querySelector(s).getBoundingClientRect(); return { l: Math.round(x.left), t: Math.round(x.top), w: Math.round(x.width), h: Math.round(x.height) }; }, sel);
    const drag = async (x0, y0, x1, y1) => { await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 }); await p.mouse.move(x1, y1, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(80); };
    const mid = r => [r.l + r.w / 2, r.t + r.h * 0.6];

    // ① 떠 있지 않은 기본 배치에서는 얼굴을 끌어도 안 움직인다(짝)
    const d0 = await rect('#vc-video-pane');
    await drag(...mid(d0), d0.l - 200, d0.t + 100);
    const d1 = await rect('#vc-video-pane');
    ok(`${tag} ① 기본 배치: 얼굴을 끌어도 그대로`, d0.l === d1.l && d0.t === d1.t && !(await p.evaluate(() => document.getElementById('vc-main-row').classList.contains('video-free'))));

    // 제보 상태 만들기 — 우상단 그립을 아래로 끌어 창을 줄인다 → 자유 모드
    const g = await rect('#vc-vp-grip');
    await drag(g.l + 18, g.t + 18, g.l + 18, g.t + 260);
    ok(`${tag} 전제: 그립을 끌면 자유 모드가 된다`, await p.evaluate(() => document.getElementById('vc-main-row').classList.contains('video-free')));
    await p.evaluate(() => { try { mangoToggleToolDock('write'); } catch (e) {} });
    await p.waitForTimeout(400);

    // ② 얼굴 영역을 끌면 창이 그만큼 옮겨진다 (크기는 그대로)
    const a = await rect('#vc-video-pane');
    const [mx, my] = mid(a);
    await drag(mx, my, mx - 420, my - 90);
    const m = await rect('#vc-video-pane');
    ok(`${tag} ② 얼굴을 끌면 창이 따라온다`, Math.abs((m.l - a.l) + 420) <= 2 && Math.abs((m.t - a.t) + 90) <= 2, JSON.stringify([a, m]));
    ok(`${tag} ② 크기는 그대로`, m.w === a.w && m.h === a.h);
    ok(`${tag} ② 끌고 난 뒤 타일이 «눌리지» 않는다`, (await p.evaluate(() => window.__clicks)) === 0);

    // ③ 필기도구가 전부 눌린다 — 버튼 가운데 맨 위 요소가 그 버튼(가려지지 않음)
    const covered = await p.evaluate(() => {
      const bar = document.querySelector('#tab-pdf .pdf-anno-bar'); const out = [];
      if (!bar || bar.getAttribute('data-mango-dock-open') !== 'true') return ['dock-not-open'];
      const pane = document.getElementById('vc-video-pane');
      bar.querySelectorAll('button').forEach(bn => { const r = bn.getBoundingClientRect(); if (!r.width) return; const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (t && pane.contains(t)) out.push(bn.id || bn.textContent.trim().slice(0, 12)); });
      return out;
    });
    ok(`${tag} ③ 옮긴 뒤 필기도구를 얼굴 창이 가리지 않는다`, covered.length === 0, covered.join(','));

    // ④ 위치가 저장된다
    const saved = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('vc_free_box')); } catch (e) { return null; } });
    ok(`${tag} ④ 옮긴 위치가 저장된다`, !!saved && Math.abs(saved.left - m.l) <= 1 && Math.abs(saved.top - m.t) <= 1, JSON.stringify(saved));

    // ⑤ 화면 밖으로는 안 나간다
    await drag(...mid(m), -3000, -3000);
    const c = await rect('#vc-video-pane');
    ok(`${tag} ⑤ 화면 밖으로 끌어도 안에 머문다`, c.l >= 0 && c.t >= 56 && c.l + c.w <= vp.width && c.t + c.h <= vp.height, JSON.stringify(c));

    // ⑥ 짧게 누르기(탭)는 그대로 클릭이다 — 창은 안 움직인다
    const [cx, cy] = mid(c);
    await p.mouse.click(cx, cy); await p.waitForTimeout(60);
    const c2 = await rect('#vc-video-pane');
    ok(`${tag} ⑥ 탭은 클릭으로 통과하고 창은 그대로`, (await p.evaluate(() => window.__clicks)) === 1 && c2.l === c.l && c2.t === c.t);

    // ⑦ 크기바 버튼은 그대로 눌린다 — 「기본」 을 누르면 제자리로 돌아간다
    await p.click('#vc-size-bar .vsb-seg[data-size="half"]');
    await p.waitForTimeout(350);
    const back = await rect('#vc-video-pane');
    ok(`${tag} ⑦ 「기본」 을 누르면 원래 자리로 돌아간다`, !(await p.evaluate(() => document.getElementById('vc-main-row').classList.contains('video-free'))) && back.l === d0.l && back.w === d0.w, JSON.stringify([d0, back]));

    if (touch) {
      const ta = await p.evaluate(() => { vcToggleFreeResize(); return getComputedStyle(document.getElementById('vc-video-grid')).touchAction; });
      ok(`${tag} ⑧ 자유 모드에서 얼굴 영역 touch-action:none (손가락 끌기)`, ta === 'none', ta);
    }
    ok(`${tag} 페이지 오류 0건`, errs.length === 0, errs.slice(0, 2).join(' | '));
    if (process.env.SHOT && !touch && vp.width === 1366) { await p.evaluate(() => { vcToggleFreeResize(); }); await p.screenshot({ path: process.env.SHOT }); }
    await ctx.close();
  }
}
await b.close();
console.log(`\n  ${fail ? '❌' : '🎉'} ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
