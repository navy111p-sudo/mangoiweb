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

// ⛔ 실제 학생·강사 이름/아이디를 쓰지 않는다(공개 저장소 · 아이디 = 로그인). 전부 «테스트» 표기.
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // KST — 화면의 DATA.today 와 같은 기준
const ym = today.slice(0, 7);
const lesson = (d, t, extra = {}) => ({ date: `${ym}-${d}`, start_time: t, end_time: '', student_name: '테스트 학생 A', user_id: 'test_stu_a',
  status: 'finish', amount: 50, deduction_total: 0, net_amount: 50, ...extra });
const month = { ok: true, teacher: { english_name: 'Teacher Test', level_label_en: 'Test Level', level_label_ko: '테스트 등급' },
  summary: { final_amount: 111, pay_amount: 136, deduction_total: 25 }, lessons: [
    lesson('01', '10:00', { end_time: '10:20' }),
    lesson('01', '19:00', { status: 'student_absent', amount: 25, net_amount: 25, student_name: '테스트 학생 B', user_id: 'test_stu_b' }),
    lesson('01', '21:00', { amount: 61, deduction_total: 25, net_amount: 36, student_name: 'Test Group C', user_id: 'test_group_c' }),
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
    const portalSeen = page.waitForResponse((res) => res.url().includes('/api/teacher/portal'));
    await page.goto(BASE + '/teacher.html');
    await portalSeen;
    await page.waitForFunction((l) => document.documentElement.lang === l, lang);
    // 전제: portal 을 받아들였다(못 받으면 DATA 가 없어 기본 기간이 «진짜 길» 을 안 탄다)
    check(`${tag} 전제: portal 로드 성공(load failed 없음)`, !(await page.evaluate(() => document.body.innerText.includes('load failed'))));
    await page.evaluate(() => { const d = document.getElementById('c-feesum'); d.open = true; d.scrollIntoView(); });
    await page.waitForSelector('#fs-out table', { timeout: 5000 });
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
    if (w === 1280) {
      // 🌐 토글(EN→KO): 표가 한국어로 다시 그려지고, 고르고 아직 조회 안 한 날짜는 남는다
      await page.fill('#fs-from', ym + '-03');
      await page.click('#lang');
      await page.waitForFunction(() => document.documentElement.lang === 'ko');
      const t = await page.evaluate(() => ({ h: document.querySelector('.fs-tbl thead th').textContent, from: document.getElementById('fs-from').value }));
      check(`${tag} 토글 → 열 머리 한국어 + 입력값 유지`, t.h === '수업 시간' && t.from === ym + '-03');
    }
    // 잘못된 기간(날짜 고정 — 매달 1일에도 헛돌지 않게) → 글자로 말한다
    await page.fill('#fs-from', ym + '-05'); await page.fill('#fs-to', ym + '-02');
    await page.click('#fs-go');
    const msg = await page.textContent('#fs-out');
    check(`${tag} 시작>종료 안내`, /after the end|종료일보다 늦/.test(msg));
    check(`${tag} 페이지 오류 0`, errors.length === 0);
    if (errors.length) console.log(errors);
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
console.log(fails ? `FAIL ${fails}` : 'ALL PASS', '· screenshots:', OUT);
assert.equal(fails, 0);
