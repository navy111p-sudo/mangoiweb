// 강사 화면 「기간별 수업료 조회」 — 진짜 teacher.html + 가짜 API(운영 데이터 안 씀).
// 실행: node test-harness/manual/teacher-fee-summary-browser.mjs   (BROWSER_EXECUTABLE=… 로 크롬 지정 가능)
// 스크린샷: TEACHER_TEST_OUTPUT 폴더(기본: 리포 밖 ../teacher-browser-results)
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const chromium = pw.chromium || pw.default.chromium;   // CJS 판은 default 밑에 온다
const OUT = resolve(process.env.TEACHER_TEST_OUTPUT || resolve(ROOT, '../teacher-browser-results'));
mkdirSync(OUT, { recursive: true });
const html = readFileSync(resolve(ROOT, 'cloudflare-deploy/public/teacher.html'), 'utf8');
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ym = today.slice(0, 7);
const lesson = (d, t, extra = {}) => ({ date: `${ym}-${d}`, start_time: t, end_time: '', student_name: '김규린', user_id: 'kgr0' + d,
  status: 'finish', amount: 50, deduction_total: 0, net_amount: 50, ...extra });
const month = { ok: true, teacher: { english_name: 'Gwenalyn', level_label_en: 'Senior Teacher B', level_label_ko: '시니어 B' },
  summary: { final_amount: 111, pay_amount: 136, deduction_total: 25 }, lessons: [
    lesson('01', '10:00', { end_time: '10:20' }),
    lesson('01', '19:00', { status: 'student_absent', amount: 25, net_amount: 25, student_name: '황주은', user_id: 'hje11' }),
    lesson('01', '21:00', { amount: 61, deduction_total: 25, net_amount: 36, student_name: '수3시그룹', user_id: 'group_wed3' }),
  ] };
const portal = { ok: true, now: Date.now(), today, me: { name: 'Gwenalyn', username: 'fixture-teacher', lang: 'en' },
  classes: [], upcoming: [], notices: [], resources: [], rating: {} };

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
let fails = 0;
const check = (name, c) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fails++; };
try {
  for (const { w, lang } of [{ w: 1280, lang: 'en' }, { w: 390, lang: 'en' }, { w: 390, lang: 'ko' }]) {
    const tag = `${w}/${lang}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const urls = [];
    await page.route('**/api/**', (route) => {
      const u = new URL(route.request().url()); urls.push(u.pathname + u.search);
      const body = u.pathname === '/api/teacher/portal' ? { ...portal, me: { ...portal.me, lang } }
        : u.pathname === '/api/admin/payroll/lessons' ? month : { ok: true };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(BASE + '/teacher.html');
    await page.waitForSelector('#c-feesum', { state: 'attached' });
    await page.evaluate(() => { const d = document.getElementById('c-feesum'); d.open = true; d.scrollIntoView(); });
    await page.waitForSelector('#fs-out table', { timeout: 5000 });
    // KO: 표를 이미 그린 «뒤» 에 🌐 토글 — 언어 전환이 표·입력칸까지 다시 그리는지 본다
    if (lang === 'ko') { await page.click('#lang'); await page.waitForSelector('#fs-out table'); }
    const r = await page.evaluate(() => ({
      from: document.getElementById('fs-from').value, to: document.getElementById('fs-to').value,
      heads: [...document.querySelectorAll('.fs-tbl thead th')].map((t) => t.textContent),
      rows: document.querySelectorAll('.fs-tbl tbody tr').length,
      foot: document.querySelector('.fs-tbl tfoot').textContent,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      summary: document.querySelector('#c-feesum > summary').textContent,
    }));
    check(`${tag} 기본 기간 = 이번 달 1일 ~ 오늘`, r.from === ym + '-01' && r.to === today);
    check(`${tag} 열 8개`, r.heads.length === 8);
    check(`${tag} 3행`, r.rows === 3);
    check(`${tag} 합계 ₱111`, r.foot.includes('₱111'));
    check(`${tag} 페이지 가로 스크롤 없음(표만 밀림)`, !r.pageOverflow);
    check(`${tag} 제목·열 머리 언어`, lang === 'ko'
      ? r.summary.includes('기간별 수업료 조회') && r.heads[0] === '수업 시간' && r.heads[5] === '인센티브'
      : r.summary.includes('Class fee summary') && r.heads[0] === 'Lesson time' && r.heads[5] === 'Incentive');
    await page.locator('#c-feesum').screenshot({ path: resolve(OUT, `fee-summary-${w}-${lang}.png`) });
    // 잘못된 기간 → 글자로 말한다
    await page.fill('#fs-from', today); await page.fill('#fs-to', ym + '-01');
    await page.click('#fs-go');
    const msg = await page.textContent('#fs-out');
    check(`${tag} 시작>종료 안내`, today === ym + '-01' || /after the end|종료일보다 늦/.test(msg));
    check(`${tag} 페이지 오류 0`, errors.length === 0);
    if (errors.length) console.log(errors);
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
console.log(fails ? `FAIL ${fails}` : 'ALL PASS', '· screenshots:', OUT);
assert.equal(fails, 0);
