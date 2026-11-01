/*
 * 🔄 결재함 상단 «새로고침» 버튼이 «눌렸다» 를 화면이 말하는가 (2026-10-09 사장님 「이게 작동안돼」).
 * 원인: 버튼이 load() 만 불러 서버가 304(바뀐 것 없음)를 주면 화면이 그대로라 «안 눌린 것» 처럼 보였다.
 * 확인: 진짜 버튼을 클릭 → 캐시를 건너뛰는 요청(cache:'reload')이 나가는가 · 토스트가 뜨는가 ·
 *       버튼이 다시 풀리는가 · 실패하면 실패라고 말하는가(짝) · 60초 자동 갱신은 캐시를 안 건너뛰는가(짝).
 * 자동으로 안 돕니다 — PW_DIR=/tmp/pw node test-harness/manual/approval-refresh-btn-browser.mjs
 */
import { requireBrowser, fileUrl } from './_pw.mjs';
const { chromium, exe } = requireBrowser();
let PASS = 0, FAIL = 0;
const check = (n, c, x) => { if (c) { PASS++; console.log('  OK   ' + n); } else { FAIL++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.addInitScript(() => {
    window.__calls = []; window.__fail = false;
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        window.__calls.push((o && o.cache) || '');
        if (window.__fail) return Promise.reject(new TypeError('net'));
        return new Promise(r => setTimeout(() => r(new Response(JSON.stringify({
          ok: true, me: { username: 'admin', name: '정우영', is_exec: true }, can_approve: true, pending: 0,
          types: [], hr_periods: null, inbox: [], mine: [], reuse: [], urgent: [], colleagues: [], my_delegate: null, schedule_pending: 0,
        }), { status: 200 })), 300));
      }
      if (u.indexOf('/api/') === 0) return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
      return rf(u, o);
    };
  });
  await page.goto(fileUrl('cloudflare-deploy/public/work.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('첫 로딩은 캐시를 안 건너뛴다(304 로 아낌)', (await page.evaluate(() => window.__calls)).every(c => c !== 'reload'));

  const btn = page.locator('button.tbtn[onclick^="reloadAll"]');
  check('버튼이 보인다', await btn.isVisible());
  const n0 = await page.evaluate(() => window.__calls.length);
  await btn.click();
  await page.waitForTimeout(80);
  check('누르는 동안 버튼이 잠긴다', await btn.isDisabled());
  check('누르자마자 토스트가 뜬다', await page.evaluate(() => document.getElementById('toast').classList.contains('show')));
  await btn.click({ force: true }); // 잠긴 동안 또 눌러도 요청이 한 번만
  await page.waitForTimeout(700);
  const calls = await page.evaluate(() => window.__calls);
  check('캐시를 건너뛰는 요청이 정확히 1번 나갔다', calls.length - n0 === 1 && calls[calls.length - 1] === 'reload', JSON.stringify(calls));
  check('끝나면 버튼이 풀린다', !(await btn.isDisabled()));
  const t1 = await page.evaluate(() => document.getElementById('toast').textContent);
  check('성공하면 «최신 상태» 라고 말한다', /Up to date|최신 상태/.test(t1), t1);

  await page.evaluate(() => { window.__fail = true; });
  await btn.click();
  await page.waitForTimeout(500);
  const t2 = await page.evaluate(() => document.getElementById('toast').textContent);
  check('실패하면 실패라고 말한다(짝)', /Could not refresh|새로 불러오지 못했/.test(t2), t2);
  check('실패해도 버튼이 풀린다', !(await btn.isDisabled()));

  await browser.close();
  console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
})();
