/*
 * 📊 매출 대시보드 그래프가 «상자 안에» 들어오는가 (8/18 수정사항 PDF ⑥번)
 *
 * [왜 만들었나 — 2026-08-23]
 *   PDF ⑥번: 「그래프가 화면 비율을 벗어나 이상하게 표시된다」.
 *   코드는 2026-08-18 에 고쳐졌지만(높이 래퍼 + 반응형 그리드) **그것을 실제로 그려서
 *   재 본 검사가 하나도 없었다.** CLAUDE.md 가 같은 말을 여러 번 한다 —
 *   「문자열을 찾는 검사로는 «어디에 그려졌나» 를 볼 수 없다」.
 *
 *   특히 이 버그의 진짜 증상은 «한 번 넘친다» 가 아니라 **«창을 건드릴 때마다 누적해서
 *   길어진다»** 였다(실측 690px → 3,070px → 5,758px). 그래서 한 번 재는 것으로는
 *   부족하고, **폭을 여러 번 바꾼 뒤에도 높이가 그대로인지**를 봐야 한다.
 *
 * [무엇을 재나]
 *   ① 캔버스가 자기 카드 상자 밖으로 나가지 않는가 (좌·우·아래)
 *   ② 문서가 가로로 넘치지 않는가 (scrollWidth <= innerWidth)
 *   ③ 🔑 폭을 세 번 흔든 뒤에도 캔버스 높이가 «자라지» 않는가 — 누적 증가 재발 감시
 *   ④ 폭 6가지: 폰 390 · 태블릿 768 · 900/901(미디어쿼리 경계) · PC 1280 · 1920
 *
 * [돌리는 법]  test-harness/manual/README.md 참고
 *     mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *     PW_DIR=/tmp/pw node test-harness/manual/sales-chart-overflow-browser.mjs
 *
 * ⚠️ file:// 로 열면 안 된다 — `<script src="/js/…">` 가 전부 404 가 되어 아무것도 안 돈다.
 * ⚠️ 빈 브라우저는 «첫 방문자» 라 환영 안내(#aw-overlay)가 스크롤을 막는다 → 본 것으로 표시한다.
 * ⚠️ 헤드리스 크로미움의 최소 뷰포트는 500px 이다. 390px 은 «390 으로 잘라 보여 줄» 뿐
 *    레이아웃은 500px 로 잡히므로, 스크린샷 눈대중 대신 scrollWidth 를 잰다.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.CHART_PORT || 8901);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

async function serve() {
  try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return null; } catch {}
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch {}
  }
  p.kill();
  throw new Error(`정적 서버를 못 띄웠습니다 (${PUBLIC})`);
}

/* 연간 리포트 응답 — 실제 모양 그대로. 값은 아무거나여도 «크기» 검사에는 지장이 없다. */
const ANNUAL = {
  ok: true, type: 'annual',
  monthlies: Array.from({ length: 12 }, (_, i) => ({
    period: `2026-${String(i + 1).padStart(2, '0')}`,
    revenue: 9000000 + i * 700000, net: 1200000 + i * 90000,
  })),
  totals: { revenue: 150000000, net: 20000000 },
};

const WIDTHS = [390, 768, 900, 901, 1280, 1920];

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    for (const w of WIDTHS) {
      console.log(`\n── 폭 ${w}px ─────────────────────────────`);
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const page = await ctx.newPage();

      // 로그인·API 는 전부 스텁 — 운영 서버에 붙지 않는다(파일만 서빙 중이다)
      await page.route('**/api/**', async route => {
        const u = route.request().url();
        if (u.includes('/reports/annual')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANNUAL) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], rows: [] }) });
      });
      await page.addInitScript(() => {
        try {
          localStorage.setItem('mangoi_admin_welcome_v1_done', '1');   // 환영 안내가 스크롤을 막는다
          localStorage.setItem('admin_session', JSON.stringify({ username: 'admin', scope: 'hq' }));
        } catch {}
      });
      await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      /* 매출 대시보드 카드를 «실제로 보이게» 연 뒤 차트를 그린다.
         ⚠️ 관리자 카드는 기본이 숨김(.ia6-hide)이라 그냥 details.open 만 켜면
            상자가 접힌 채라 캔버스 높이가 0 으로 잡힌다 — 그러면 «안 넘쳤다» 는
            거짓 통과가 된다(이 검사를 처음 돌렸을 때 실제로 그렇게 나왔다).
            CLAUDE.md 대로 jumpToMenu(카드id) 로 그 카드만 화면에 띄운다. */
      const drew = await page.evaluate(async () => {
        const sub = document.getElementById('sub-acc-11');
        if (!sub) return 'no-sub';
        const card = sub.closest('[id^="card-"]');
        if (card && typeof window.jumpToMenu === 'function') {
          try { window.jumpToMenu(card.id); } catch (e) { /* 아래에서 손으로 연다 */ }
        }
        if (card) card.classList.remove('ia6-hide', 'rbac-hide');
        let p = sub; while (p) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
        await new Promise(r => setTimeout(r, 250));
        if (typeof window.accLoadSalesChart !== 'function') return 'no-fn';
        try { await window.accLoadSalesChart(); } catch (e) { return 'threw: ' + e.message; }
        return 'ok';
      });
      check(`${w}px · 차트 그리기 호출`, drew === 'ok', String(drew));
      await page.waitForTimeout(900);

      const m0 = await page.evaluate(() => {
        const c = document.getElementById('acc-sales-canvas');
        if (!c) return null;
        const cr = c.getBoundingClientRect();
        const box = c.closest('div[style*="border"]') || c.parentElement.parentElement;
        const br = box.getBoundingClientRect();
        return {
          visible: cr.width > 0 && cr.height > 0,
          canvas: { w: Math.round(cr.width), h: Math.round(cr.height), l: Math.round(cr.left), r: Math.round(cr.right), b: Math.round(cr.bottom) },
          box: { l: Math.round(br.left), r: Math.round(br.right), b: Math.round(br.bottom) },
          docW: document.documentElement.scrollWidth, winW: window.innerWidth,
        };
      });
      if (!m0) { check(`${w}px · 캔버스 존재`, false, '캔버스를 못 찾음'); await ctx.close(); continue; }

      /* 🔑 «보인다» 부터 확인한다 — 숨은 상자에서 잰 0px 은 «안 넘쳤다» 가 아니다 */
      check(`${w}px · 캔버스가 실제로 그려짐(높이>0)`, m0.visible, `${m0.canvas.w}×${m0.canvas.h}`);
      check(`${w}px · 캔버스가 카드 «안»(좌우)`,
        m0.canvas.l >= m0.box.l - 2 && m0.canvas.r <= m0.box.r + 2,
        `캔버스 ${m0.canvas.l}~${m0.canvas.r} vs 상자 ${m0.box.l}~${m0.box.r}`);
      check(`${w}px · 캔버스가 카드 «안»(아래)`,
        m0.canvas.b <= m0.box.b + 2, `캔버스 아래끝 ${m0.canvas.b} vs 상자 ${m0.box.b}`);
      check(`${w}px · 문서가 가로로 안 넘침`,
        m0.docW <= m0.winW + 1, `scrollWidth ${m0.docW} > innerWidth ${m0.winW}`);
      check(`${w}px · 캔버스 높이가 상식적(<=600px)`,
        m0.canvas.h > 0 && m0.canvas.h <= 600, `높이 ${m0.canvas.h}px`);

      /* 🔑 누적 증가 재발 감시 — 예전 버그는 «리사이즈할 때마다» 자랐다
         (690 → 3,070 → 5,758px). 폭을 흔들었다가 **원래 폭으로 되돌아왔을 때**
         높이가 처음과 같아야 한다.
         ⚠️ 폭이 다르면 높이가 달라지는 것은 정상이다(반응형). 그래서 «다른 폭끼리»
            비교하면 안 된다 — 이 검사를 처음 그렇게 짰다가 390px 에서 거짓 실패가 났다.
         ⚠️ 헤드리스 크로미움의 최소 뷰포트는 500px 이라 390 을 넣어도 500 으로 잡힌다.
            그래서 흔드는 폭도 500 아래로는 내려가지 않는다(CLAUDE.md 함정). */
      const measure = async () => await page.evaluate(() => {
        const c = document.getElementById('acc-sales-canvas');
        return c ? Math.round(c.getBoundingClientRect().height) : -1;
      });
      const seen = [m0.canvas.h];
      for (const w2 of [Math.max(500, Math.round(w * 0.7)), Math.max(500, Math.round(w * 1.3)), Math.max(500, Math.round(w * 0.55))]) {
        await page.setViewportSize({ width: w2, height: 900 });
        await page.waitForTimeout(450);
        seen.push(await measure());
      }
      await page.setViewportSize({ width: w, height: 900 });   // 원래 폭으로 복귀
      await page.waitForTimeout(500);
      const back = await measure();
      seen.push(back);
      check(`${w}px · 🔑 흔들었다 돌아오면 높이가 처음과 같다(누적 증가 없음)`,
        Math.abs(back - m0.canvas.h) <= 8, `처음 ${m0.canvas.h}px → 돌아온 뒤 ${back}px (추이 ${seen.join(' → ')})`);
      check(`${w}px · 흔드는 동안에도 높이가 터지지 않음(<=600px)`,
        Math.max(...seen) <= 600, `최대 ${Math.max(...seen)}px (추이 ${seen.join(' → ')})`);

      await ctx.close();
    }
  } finally {
    await browser.close();
    if (srv) srv.kill();
  }
  console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
  if (FAIL) process.exit(1);
  console.log('✅ 전부 통과 — 그래프가 상자 안에 들어오고, 흔들어도 안 자랍니다\n');
})();
