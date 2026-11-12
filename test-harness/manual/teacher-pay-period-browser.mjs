// Payroll date controls: real teacher page, synthetic API data only.
// 실행: node test-harness/manual/teacher-pay-period-browser.mjs   (BROWSER_EXECUTABLE=… 로 크롬 지정 가능)
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

// ⛔ 실제 학생·강사 이름/아이디를 쓰지 않는다(공개 저장소 · 아이디 = 로그인). 전부 «테스트» 표기.
const today = '2026-11-12';   // KST — 화면의 DATA.today 와 같은 기준
const ym = today.slice(0, 7);
const lesson = (d, t, extra = {}) => ({ date: `${ym}-${d}`, start_time: t, end_time: '', student_name: '테스트 학생 A', user_id: 'test_stu_a',
  status: 'finish', amount: 50, deduction_total: 0, net_amount: 50, ...extra });
const month = { ok: true, teacher: { english_name: 'Teacher Test', level_label_en: 'Test Level', level_label_ko: '테스트 등급' },
  summary: { final_amount: 111, pay_amount: 136, deduction_total: 25 }, lessons: [
    lesson('15', '10:00', { amount: 50, deduction_total: 10, net_amount: 40, feedback_ok: false }),
    lesson('16', '19:00', { status: 'student_absent', amount: 25, net_amount: 25 }),
    lesson('30', '21:00', { amount: 61, deduction_total: 25, net_amount: 36 }),
    lesson('20', '09:00', { status: 'upcoming', amount: 1000 }),
  ] };
// portal 은 week 가 있어야 화면이 받아들인다(validWeek) — 없으면 DATA 가 null 로 남아 «진짜 길» 을 안 탄다
const monday = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; })();
const week = { start: monday.toISOString().slice(0, 10), end: new Date(+monday + 6 * 864e5).toISOString().slice(0, 10),
  days: Array.from({ length: 7 }, (_, i) => ({ date: new Date(+monday + i * 864e5).toISOString().slice(0, 10), items: [] })) };
const portal = { ok: true, now: Date.now(), today, week, me: { name: 'Teacher Test', username: 'fixture-teacher', lang: 'en' },
  classes: [], upcoming: [], notices: [], resources: [], rating: {} };

const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
let fails = 0;
const check = (name, c) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fails++; };
try {
  for (const { w, lang } of [{ w: 1280, lang: 'en' }, { w: 768, lang: 'en' }, { w: 390, lang: 'en' }, { w: 390, lang: 'ko' }]) {
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
    const portalSeen = page.waitForResponse((res) => res.url().includes('/api/teacher/portal'));
    await page.goto(BASE + '/teacher.html');
    await portalSeen;
    await page.waitForFunction((l) => document.documentElement.lang === l, lang);
    // 전제: portal 을 받아들였다(못 받으면 DATA 가 없어 기본 기간이 «진짜 길» 을 안 탄다)
    check(`${tag} 전제: portal 로드 성공(load failed 없음)`, !(await page.evaluate(() => document.body.innerText.includes('load failed'))));
    await page.evaluate(() => { const d = document.getElementById('c-pay'); d.open = true; d.scrollIntoView(); });
    await page.waitForSelector('#pay-result .big');
    check(`${tag} full month total`, await page.textContent('#pay-result .big') === '₱101');
    await page.selectOption('#pay-period', 'first');
    check(`${tag} first half dates`, await page.inputValue('#pay-from') === ym + '-01' && await page.inputValue('#pay-to') === ym + '-15');
    await page.click('#pay-go');
    await page.waitForSelector('#pay-result .big');
    check(`${tag} first half total and detail`, await page.textContent('#pay-result .big') === '₱40' && await page.locator('#pay-result .payls').count() === 1);
    await page.selectOption('#pay-period', 'second');
    check(`${tag} second half dates`, await page.inputValue('#pay-from') === ym + '-16' && await page.inputValue('#pay-to') === ym + '-30');
    await page.click('#pay-go');
    await page.waitForSelector('#pay-result .big');
    check(`${tag} second half excludes first half and upcoming`, await page.textContent('#pay-result .big') === '₱61' && await page.locator('#pay-result .payls').count() === 2);
    await page.locator('#pay-result details').evaluate(e => e.open = true);
    check(`${tag} no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#c-pay').screenshot({ path: resolve(OUT, `pay-period-${w}-${lang}.png`) });
    await page.fill('#pay-from', '2026-12-16');
    await page.selectOption('#pay-period', 'second');
    check(`${tag} includes 31st`, await page.inputValue('#pay-to') === '2026-12-31');
    await page.fill('#pay-from', '2028-02-16');
    await page.selectOption('#pay-period', 'second');
    check(`${tag} leap February`, await page.inputValue('#pay-to') === '2028-02-29');
    await page.fill('#pay-from', ym + '-05');
    await page.click('#lang');
    check(`${tag} language switch retains draft`, await page.inputValue('#pay-from') === ym + '-05');
    check(`${tag} language switch retains applied total`, await page.textContent('#pay-result .big') === '₱61');
    await page.fill('#pay-to', ym + '-02');
    await page.click('#pay-go');
    check(`${tag} invalid range hides old total`, await page.locator('#pay-result .big').count() === 0 && /after the end|종료일보다 늦/.test(await page.textContent('#pay-result')));
    check(`${tag} no page errors`, errors.length === 0);
    if (errors.length) console.log(errors);
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
console.log(fails ? `FAIL ${fails}` : 'ALL PASS', '· screenshots:', OUT);
assert.equal(fails, 0);

