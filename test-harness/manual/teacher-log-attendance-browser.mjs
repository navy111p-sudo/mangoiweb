// 🗓 강사 수업 일지 — 학생 레벨 · 수업 출결 (2026-10-27) — 실제 브라우저 · 출하 HTML · 가짜 API(운영 쓰기 없음)
// 자동으로 안 돕니다 — 사람이 부릅니다:
//   PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node test-harness/manual/teacher-log-attendance-browser.mjs
// 폭 1280·390·320 × 한국어/영어 × 라이트/다크 에서: 창이 열리고 · 입장 기록대로 미리 골라지고 ·
// 칩이 손가락 크기(44px)이고 · 가로로 안 넘치고 · 바꾼 값이 /api/eval/manual-create 로 나가는지 본다.
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright-core');
const OUT = resolve(process.env.TEACHER_TEST_OUTPUT || resolve(ROOT, '../teacher-log-attendance-shots'));
mkdirSync(OUT, { recursive: true });
const html = readFileSync(resolve(ROOT, 'cloudflare-deploy/public/teacher.html'), 'utf8');
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
let n = 0;
const check = (name, cond) => { assert.ok(cond, name); n++; console.log('PASS', name); };
const ts = Date.now(), today = new Date(ts + 9 * 3600e3).toISOString().slice(0, 10);
const start = ts - 30 * 60000;
function data(lang) {
  return { ok: true, now: ts, today, me: { name: 'Fixture Teacher', username: 'fixture-teacher', lang },
    classes: [{ kind: 'class', schedule_id: 1, room_id: 'class-1-' + today.replace(/-/g, ''), student_uid: 'fixture-1',
      student_name: '지승연', student_name_en: 'Ji Seungyeon', start_time: '12:30', start_ts: start, end_ts: start + 20 * 60000,
      open_at_ts: start - 600000, close_at_ts: start + 35 * 60000, enter_from_ts: ts - 86400000, enter_until_ts: ts + 86400000,
      date: today, class_date: today, duration_min: 20, level: 'Lv 5', class_state: 'done', status: 'done',
      attendance: { state: 'late', at: start + 8 * 60000, late_min: 8 }, teacher_entry: { state: 'on_time', at: start, late_min: 0 } }],
    upcoming: [], notices: [], resources: [], rating: {}, goal_options: [],
    week: weekOf(today) };
}
// 화면은 «그 주 월요일부터 7칸» 이 아니면 응답을 거절한다(validWeek) — 주간 자료를 그 모양으로 만든다.
function weekOf(date) {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const s = d.toISOString().slice(0, 10), day = (i) => new Date(Date.parse(s) + i * 86400000).toISOString().slice(0, 10);
  return { start: s, end: day(6), days: Array.from({ length: 7 }, (_, i) => ({ date: day(i), items: [] })) };
}
try {
  for (const width of [1280, 390, 320]) for (const lang of ['ko', 'en']) for (const theme of ['light', 'dark']) {
    const tag = `${width}px/${lang}/${theme}`;
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    await ctx.addInitScript((t) => localStorage.setItem('mangoi_teacher_theme', t), theme);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    let sent = null;
    await page.route('**/api/**', async (route) => {
      const u = new URL(route.request().url());
      const ff = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      if (u.pathname === '/api/teacher/portal' && !u.searchParams.get('part')) return ff(data(lang));
      if (u.pathname === '/api/translate') return ff({ ok: true, en: 'Arrived late but spoke well.', ko: '조금 늦었지만 잘 말했습니다.' });
      if (u.pathname === '/api/eval/manual-create') { sent = JSON.parse(route.request().postData()); return ff({ ok: true, id: 9 }); }
      return ff({ ok: true, items: [], rows: [], reports: [], drafts: [], active: [], requests: [], lessons: [] });
    });
    await page.goto(BASE + '/teacher.html');
    await page.locator('#boot').waitFor({ state: 'hidden' });
    await page.locator('#classes [data-eval]').first().click();
    await page.locator('#ev-att').waitFor();
    const L = lang === 'ko' ? { late: '지각', absent: '결석', title: '수업 출결', lv: '학생 레벨' } : { late: 'Late', absent: 'Absent', title: 'Class status', lv: 'Student level' };
    const modal = page.locator('.modal');
    check(tag + ' 레벨 줄', (await modal.locator('.feedback-level').innerText()).includes(L.lv) && (await modal.locator('.feedback-level').innerText()).includes('Lv 5'));
    check(tag + ' 출결 칸 제목', (await modal.innerText()).includes(L.title));
    const on = modal.locator('#ev-att .tchip.on');
    check(tag + ' 입장 기록(지각)대로 미리 골라짐', (await on.count()) === 1 && (await on.innerText()).includes(L.late));
    check(tag + ' 근거 안내(+8)', (await modal.locator('#ev-att-auto').innerText()).includes('+8'));
    const boxes = await modal.locator('#ev-att .tchip').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, over: b.scrollWidth > b.clientWidth + 1 }; }));
    check(tag + ' 칩 3개 · 44px 이상 · 글자 안 넘침', boxes.length === 3 && boxes.every((b) => b.h >= 44 && b.w >= 44 && !b.over));
    check(tag + ' 가로 넘침 없음', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const topEl = await page.evaluate(() => { const b = document.querySelector('#ev-att .tchip'); const r = b.getBoundingClientRect(); b.scrollIntoView({ block: 'center' }); const r2 = b.getBoundingClientRect(); const t = document.elementFromPoint(r2.x + r2.width / 2, r2.y + r2.height / 2); return !!(t && t.closest('#ev-att')); });
    check(tag + ' 칩이 맨 위에 있어 눌린다(가려지지 않음)', topEl);
    await modal.screenshot({ path: resolve(OUT, `modal-${width}-${lang}-${theme}.png`) });
    await modal.locator('#ev-att [data-att="absent"]').click();
    check(tag + ' 결석으로 바꾸면 그 칩 하나만 켜짐', (await modal.locator('#ev-att .tchip.on').count()) === 1 && (await modal.locator('#ev-att .tchip.on').innerText()).includes(L.absent));
    await page.locator('#ev-raw').fill('Arrived late but spoke well.');
    await page.locator('#ev-tr').click(); await page.locator('#ev-out').waitFor({ state: 'visible' });
    await page.locator('#ev-ok').click(); await page.locator('#ev-ok').waitFor({ state: 'detached' });
    check(tag + ' 보낸 값 attendance_status=absent', sent && sent.attendance_status === 'absent');
    check(tag + ' 페이지 오류 0', errors.length === 0);
    await ctx.close();
  }
  console.log(`\nPASS ${n} · 스크린샷: ${OUT}`);
} finally {
  await browser.close(); server.close();
}
