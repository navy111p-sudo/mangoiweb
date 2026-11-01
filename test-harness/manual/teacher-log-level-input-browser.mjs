// 🎚 강사 수업 일지 — 학생 레벨 직접 정하기 (2026-10-27) — 실제 브라우저 · 출하 HTML · 가짜 API(운영 쓰기 없음)
// 자동으로 안 돕니다 — 사람이 부릅니다:
//   PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node test-harness/manual/teacher-log-level-input-browser.mjs
// 폭 1280·390·320 × 한국어/영어 × 라이트/다크 에서:
//   고르기 칸이 보이고·손가락 크기이고·맨 위에 있어 눌리고·가로로 안 넘치는가 /
//   고르면 저장 «전» 에 확인창을 띄우고(누구·무엇에서 무엇으로·판단력 훈련 안내), «취소» 면 요청 0 · 칸 되돌림인가 /
//   골라서 저장하면 서버로 그 값이 가고 수업 줄의 레벨도 바뀌는가 /
//   거절되면 칸이 되돌아가고 빨간 안내가 «읽히는가»(대비) /
//   저장 중에 «보내기» 를 누르면 일지가 안 나가고, 끝나면 나가는가 /
//   (2026-10-28) 서버가 «범위 밖» 이라고 미리 실어 보낸 학생은 고르기 칸 대신 🔒 이유 한 줄만 보이고 확인창·요청이 0 인가.
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright-core');
const OUT = resolve(process.env.TEACHER_TEST_OUTPUT || resolve(ROOT, '../teacher-log-level-shots'));
mkdirSync(OUT, { recursive: true });
const html = readFileSync(resolve(ROOT, process.env.TEACHER_HTML || 'cloudflare-deploy/public/teacher.html'), 'utf8');
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {});
let n = 0;
const check = (name, cond) => { assert.ok(cond, name); n++; console.log('PASS', name); };
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 25)); } return true; };
const ts = Date.now(), today = new Date(ts + 9 * 3600e3).toISOString().slice(0, 10);
const start = ts - 30 * 60000;
// 서버 정본(levelScaleForPortal)과 같은 모양 — 화면은 이 표로만 목록을 그린다.
const SCALE = [
  { band: 1, from: 1, to: 4, ko: '첫걸음', en: 'Starter' }, { band: 2, from: 5, to: 8, ko: '기초', en: 'Basic' },
  { band: 3, from: 9, to: 12, ko: '초급', en: 'Elementary' }, { band: 4, from: 13, to: 17, ko: '초중급', en: 'Pre-Intermediate' },
  { band: 5, from: 18, to: 21, ko: '중급', en: 'Intermediate' }, { band: 6, from: 22, to: 25, ko: '중고급', en: 'Upper-Intermediate' },
  { band: 7, from: 26, to: 30, ko: '고급', en: 'Advanced' }, { band: 8, from: 31, to: 34, ko: '최상급', en: 'Fluent' },
];
function data(lang, scope) {
  return { ok: true, now: ts, today, me: { name: 'Fixture Teacher', username: 'fixture-teacher', lang },
    classes: [{ kind: 'class', schedule_id: 1, room_id: 'class-1-' + today.replace(/-/g, ''), student_uid: 'fixture-1',
      student_name: '지승연', student_name_en: 'Ji Seungyeon', start_time: '12:30', start_ts: start, end_ts: start + 20 * 60000,
      open_at_ts: start - 600000, close_at_ts: start + 35 * 60000, enter_from_ts: ts - 86400000, enter_until_ts: ts + 86400000,
      date: today, class_date: today, duration_min: 20, level: 'Lv 5', class_state: 'done', status: 'done',
      attendance: { state: 'attended', at: start, late_min: 0 }, teacher_entry: { state: 'on_time', at: start, late_min: 0 },
      ...(scope ? { level_scope: scope } : {}) }],
    upcoming: [], notices: [], resources: [], rating: {}, goal_options: [], level_scale: SCALE, level_past_days: 14,
    week: weekOf(today) };
}
function weekOf(date) {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const s = d.toISOString().slice(0, 10), day = (i) => new Date(Date.parse(s) + i * 86400000).toISOString().slice(0, 10);
  return { start: s, end: day(6), days: Array.from({ length: 7 }, (_, i) => ({ date: day(i), items: [] })) };
}
// WCAG 대비 — 반투명 배경은 불투명한 층을 만날 때까지 모아 합성한다.
const CONTRAST = (sel = '#ev-lv-msg') => {
  const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const el = document.querySelector(sel);
  const fg = rgba(getComputedStyle(el).color);
  const layers = [];
  for (let x = el; x; x = x.parentElement) { const b = rgba(getComputedStyle(x).backgroundColor); if (b[3] > 0) { layers.push(b); if (b[3] >= 1) break; } }
  let bg = [255, 255, 255];
  for (let i = layers.length - 1; i >= 0; i--) { const [r, g, b, a] = layers[i]; bg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)]; }
  const a = L(fg), b = L(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
try {
  for (const width of [1280, 390, 320]) for (const lang of ['ko', 'en']) for (const theme of ['light', 'dark']) {
    const tag = `${width}px/${lang}/${theme}`;
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    await ctx.addInitScript((t) => localStorage.setItem('mangoi_teacher_theme', t), theme);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    // 확인창 — Playwright 는 처리기가 없으면 저절로 «취소» 하므로 직접 받는다. 답은 시험마다 정한다.
    let dialogAnswer = true; const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({ type: d.type(), msg: d.message() }); if (dialogAnswer) await d.accept(); else await d.dismiss(); });
    let sentLog = null, levelBodies = [], levelMode = 'ok', releaseLevel = null;
    await page.route('**/api/**', async (route) => {
      const u = new URL(route.request().url());
      const ff = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
      if (u.pathname === '/api/teacher/portal' && u.searchParams.get('part') === 'level') {
        const b = JSON.parse(route.request().postData()); levelBodies.push(b);
        if (levelMode === 'deny') return ff({ ok: false, error: 'not_your_student' }, 403);
        if (levelMode === 'window') return ff({ ok: false, error: 'level_window_closed', past_days: 14 }, 403);   // 2026-10-28 권한 좁힘
        if (levelMode === 'hold') await new Promise((r) => { releaseLevel = r; });
        return ff({ ok: true, level: b.level, previous: levelBodies.length === 1 ? 'Lv 5' : 'Lv 12' });
      }
      if (u.pathname === '/api/teacher/portal' && !u.searchParams.get('part')) return ff(data(lang));
      if (u.pathname === '/api/translate') return ff({ ok: true, en: 'Spoke well today.', ko: '오늘 잘 말했습니다.' });
      if (u.pathname === '/api/eval/manual-create') { sentLog = JSON.parse(route.request().postData()); return ff({ ok: true, id: 9 }); }
      return ff({ ok: true, items: [], rows: [], reports: [], drafts: [], active: [], requests: [], lessons: [] });
    });
    await page.goto(BASE + '/teacher.html');
    await page.locator('#boot').waitFor({ state: 'hidden' });
    await page.locator('#classes [data-eval]').first().click();
    const sel = page.locator('#ev-lv');
    await page.locator('.modal').waitFor();
    await sel.waitFor({ timeout: 8000 }).catch(() => {});   // 없으면 «시간 초과 크래시» 가 아니라 아래 줄이 깔끔하게 FAIL
    check(tag + ' 레벨 고르기 칸이 그려짐', (await sel.count()) === 1);
    const L = lang === 'ko' ? { label: '학생 레벨 — 고르면 한 번 묻고 저장해요', g1: '첫걸음 (Lv 1–4)', saved: '저장했어요: Lv 12', was: '(전: Lv 5)', deny: '내 수업 학생이 아니라', win: '최근 14일 안에 수업했거나 지금 매주 수업 중인 학생만', wait: '레벨을 저장하는 중',
        ask: '이 학생의 레벨을 바꿀까요?', jt: '학생이 다음에 판단력 훈련을 열 때 이 레벨부터 다시 시작해요', who: '지승연' }
      : { label: 'Student level — pick to change (asks before saving)', g1: 'Starter (Lv 1–4)', saved: 'Saved: Lv 12', was: '(was Lv 5)', deny: 'not in your class list', win: 'taught in the last 14 days, or who have a weekly class', wait: 'still saving',
        ask: "Change this student's level?", jt: 'Next time the student opens Judgment training, it restarts at this level', who: 'Ji Seungyeon' };
    const modal = page.locator('.modal');
    check(tag + ' 라벨', (await modal.locator('label[for="ev-lv"]').innerText()).includes(L.label));
    check(tag + ' 지금 값 Lv 5 가 골라져 있음', (await sel.inputValue()) === 'Lv 5');
    const shape = await sel.evaluate((s) => ({ groups: [...s.querySelectorAll('optgroup')].map((g) => g.label), opts: s.querySelectorAll('option').length }));
    check(tag + ' 묶음 8개 · 레벨 34개 · 첫 묶음 이름', shape.groups.length === 8 && shape.opts === 34 && shape.groups[0] === L.g1);
    const box = await sel.evaluate((s) => { s.scrollIntoView({ block: 'center' }); const r = s.getBoundingClientRect(); const m = s.closest('.modal').getBoundingClientRect();
      const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { h: r.height, inside: r.left >= m.left - 0.5 && r.right <= m.right + 0.5, top: t === s }; });
    check(tag + ' 칸 높이 44px 이상', box.h >= 44);
    check(tag + ' 창 안에 들어감 · 맨 위라 눌림', box.inside && box.top);
    check(tag + ' 가로 넘침 없음', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await modal.screenshot({ path: resolve(OUT, `level-${width}-${lang}-${theme}.png`) });

    // 저장 성공 — 먼저 확인창을 띄우고, «확인» 이면 저장한다
    check(tag + ' 창을 연 것만으로는 확인창이 안 뜸', dialogs.length === 0);
    await sel.selectOption('Lv 12');
    await page.waitForFunction(() => /Lv 12/.test((document.querySelector('#ev-lv-msg') || {}).textContent || ''));
    const d1 = dialogs[0] || {};
    check(tag + ' 저장 전에 확인창(confirm) 한 번', dialogs.length === 1 && d1.type === 'confirm');
    check(tag + ' 확인창 글자: 물음 · 누구 · Lv 5 → Lv 12 · 판단력 훈련 안내',
      String(d1.msg).includes(L.ask) && String(d1.msg).includes(L.who) && String(d1.msg).includes('Lv 5  →  Lv 12') && String(d1.msg).includes(L.jt));
    check(tag + ' 서버로 {student_uid, level:"Lv 12"}', levelBodies.length === 1 && levelBodies[0].student_uid === 'fixture-1' && levelBodies[0].level === 'Lv 12');
    const msg1 = await page.locator('#ev-lv-msg').innerText();
    check(tag + ' 저장 안내 ✅ + 전 값', msg1.includes(L.saved) && msg1.includes(L.was) && !(await page.locator('#ev-lv-msg').getAttribute('class')).includes('lv-err'));
    check(tag + ' 수업 줄의 레벨도 Lv 12', await page.evaluate(() => /Lv 12/.test(document.querySelector('#classes').textContent) && !/Lv 5\b/.test(document.querySelector('#classes').textContent)));
    check(tag + ' 칸이 다시 풀림', !(await sel.isDisabled()) && (await sel.inputValue()) === 'Lv 12');

    // 취소 — 요청 0 · 칸이 지금 값(Lv 12)으로 돌아옴 · 안내 줄 그대로(빨간 안내 아님) · 칸 잠기지 않음
    const msgKept = await page.locator('#ev-lv-msg').innerText();
    dialogAnswer = false;
    await sel.selectOption('Lv 30');
    check(tag + ' 취소: 확인창은 떴다', await until(() => dialogs.length === 2));
    await page.waitForTimeout(300);
    check(tag + ' 취소: 저장 요청이 안 나감', levelBodies.length === 1);
    check(tag + ' 취소: 칸이 Lv 12 로 돌아오고 잠기지 않음', (await sel.inputValue()) === 'Lv 12' && !(await sel.isDisabled()));
    check(tag + ' 취소: 안내 줄 그대로 · 빨간 안내 아님', (await page.locator('#ev-lv-msg').innerText()) === msgKept && !(await page.locator('#ev-lv-msg').getAttribute('class')).includes('lv-err'));
    check(tag + ' 취소: 수업 줄 레벨도 그대로 Lv 12', await page.evaluate(() => /Lv 12/.test(document.querySelector('#classes').textContent) && !/Lv 30/.test(document.querySelector('#classes').textContent)));
    dialogAnswer = true;

    // 거절 — 되돌리고 빨간 안내(읽히는가)
    levelMode = 'deny';
    await sel.selectOption('Lv 20');
    await page.waitForFunction(() => /lv-err/.test((document.querySelector('#ev-lv-msg') || {}).className || ''));
    check(tag + ' 거절되면 Lv 12 로 되돌아감', (await sel.inputValue()) === 'Lv 12');
    check(tag + ' 거절 안내 문구', (await page.locator('#ev-lv-msg').innerText()).includes(L.deny));
    const cr = await page.evaluate(CONTRAST);
    check(tag + ` 빨간 안내 대비 ${cr.toFixed(2)} ≥ 4.5`, cr >= 4.5);
    await modal.screenshot({ path: resolve(OUT, `level-deny-${width}-${lang}-${theme}.png`) });

    // 범위 밖(최근 14일·매주 수업이 아님) — 긴 안내가 좁은 폭에서도 칸 안에서 줄바꿈되는가
    levelMode = 'window';
    await page.evaluate(() => { const m = document.querySelector('#ev-lv-msg'); if (m) { m.textContent = ''; m.className = ''; } });
    await sel.selectOption('Lv 21');
    await page.waitForFunction(() => /lv-err/.test((document.querySelector('#ev-lv-msg') || {}).className || ''));
    check(tag + ' 범위 밖 거절도 Lv 12 로 되돌아감', (await sel.inputValue()) === 'Lv 12');
    const winTxt = await page.locator('#ev-lv-msg').innerText();
    check(tag + ' 범위 밖 안내 «최근 14일 … 매주 수업»(내 학생 아님 문구가 아님)', winTxt.includes(L.win) && !winTxt.includes(L.deny));
    const fit = await page.evaluate(() => {
      const m = document.querySelector('#ev-lv-msg'), box = document.querySelector('.modal');
      const a = m.getBoundingClientRect(), b = box.getBoundingClientRect();
      return { inside: a.left >= b.left - 0.5 && a.right <= b.right + 0.5, noScroll: m.scrollWidth <= m.clientWidth + 1, docOk: document.documentElement.scrollWidth <= innerWidth };
    });
    check(tag + ' 범위 밖 안내가 창 안에서 줄바꿈(가로 넘침 없음)', fit.inside && fit.noScroll && fit.docOk);
    await modal.screenshot({ path: resolve(OUT, `level-window-${width}-${lang}-${theme}.png`) });

    // 저장 중 «보내기» 는 기다린다
    levelMode = 'hold';
    await page.locator('#ev-raw').fill('Spoke well today.');
    await page.locator('#ev-tr').click(); await page.locator('#ev-out').waitFor({ state: 'visible' });
    await sel.selectOption('Lv 25');
    await page.waitForFunction(() => document.querySelector('#ev-lv').disabled === true);
    await page.locator('#ev-ok').click();
    await page.waitForFunction(() => (document.querySelector('#ev-msg') || {}).textContent && document.querySelector('#ev-msg').textContent.length > 0);
    check(tag + ' 저장 중엔 일지가 안 나감 + 안내', sentLog === null && (await page.locator('#ev-msg').innerText()).includes(L.wait));
    releaseLevel();
    await page.waitForFunction(() => document.querySelector('#ev-lv').disabled === false);
    await page.locator('#ev-ok').click(); await page.locator('#ev-ok').waitFor({ state: 'detached' });
    check(tag + ' 저장이 끝난 뒤엔 일지가 나감(레벨은 본문에 안 실음)', sentLog && sentLog.student_uid === 'fixture-1' && !('level' in sentLog));
    check(tag + ' 페이지 오류 0', errors.length === 0);
    await ctx.close();
  }

  // ── (2026-10-28 「1번 확인창 전에 범위 밖이면 막아줘」) 서버가 범위 밖이라고 미리 실어 보낸 학생 ─────────────
  for (const scope of ['out_of_window', 'not_your_student'])
  for (const width of [1280, 390, 320]) for (const lang of ['ko', 'en']) for (const theme of ['light', 'dark']) {
    const tag = `${width}px/${lang}/${theme}/${scope}`;
    const ctx = await browser.newContext({ viewport: { width, height: 1000 } });
    await ctx.addInitScript((t) => localStorage.setItem('mangoi_teacher_theme', t), theme);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const dialogs = []; page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
    let sentLog = null; const levelBodies = [];
    await page.route('**/api/**', async (route) => {
      const u = new URL(route.request().url());
      const ff = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
      if (u.pathname === '/api/teacher/portal' && u.searchParams.get('part') === 'level') { levelBodies.push(route.request().postData()); return ff({ ok: false, error: 'not_your_student' }, 403); }
      if (u.pathname === '/api/teacher/portal' && !u.searchParams.get('part')) return ff(data(lang, scope));
      if (u.pathname === '/api/translate') return ff({ ok: true, en: 'Spoke well today.', ko: '오늘 잘 말했습니다.' });
      if (u.pathname === '/api/eval/manual-create') { sentLog = JSON.parse(route.request().postData()); return ff({ ok: true, id: 9 }); }
      return ff({ ok: true, items: [], rows: [], reports: [], drafts: [], active: [], requests: [], lessons: [] });
    });
    await page.goto(BASE + '/teacher.html');
    await page.locator('#boot').waitFor({ state: 'hidden' });
    await page.locator('#classes [data-eval]').first().click();
    const modal = page.locator('.modal'); await modal.waitFor();
    const lock = modal.locator('.lv-lock');
    await lock.waitFor({ timeout: 8000 }).catch(() => {});
    const WANT = scope === 'out_of_window'
      ? (lang === 'ko' ? '🔒 최근 14일 안에 수업했거나 지금 매주 수업 중인 학생만 바꿀 수 있어요 — 본사에 알려 주세요.'
                       : '🔒 You can change the level only for students you taught in the last 14 days, or who have a weekly class with you — please ask the office.')
      : (lang === 'ko' ? '🔒 내 수업 학생이 아니라 바꿀 수 없어요 — 본사에 알려 주세요.' : '🔒 This student is not in your class list — please ask the office.');
    check(tag + ' 고르기 칸(select) 없음', (await page.locator('#ev-lv').count()) === 0);
    check(tag + ' 지금 값 Lv 5 는 글자로 보임', (await modal.locator('.feedback-level').first().innerText()).includes('Lv 5'));
    check(tag + ' 🔒 이유 한 줄(서버가 준 14일)', (await lock.count()) === 1 && (await lock.innerText()).trim() === WANT);
    const fit = await lock.evaluate((el) => { el.scrollIntoView({ block: 'center' }); const a = el.getBoundingClientRect(), b = el.closest('.modal').getBoundingClientRect();
      const cs = getComputedStyle(el); return { inside: a.left >= b.left - 0.5 && a.right <= b.right + 0.5, noScroll: el.scrollWidth <= el.clientWidth + 1, docOk: document.documentElement.scrollWidth <= innerWidth,
        shown: a.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5 }; });
    check(tag + ' 🔒 줄이 보이고 창 안에서 줄바꿈(가로 넘침 없음)', fit.shown && fit.inside && fit.noScroll && fit.docOk);
    const cr = await page.evaluate(CONTRAST, '.lv-lock');
    check(tag + ` 🔒 줄 대비 ${cr.toFixed(2)} ≥ 4.5`, cr >= 4.5);
    await modal.screenshot({ path: resolve(OUT, `level-lock-${scope}-${width}-${lang}-${theme}.png`) });
    // 일지는 그대로 쓰고 보낸다 — 막는 것은 «레벨 바꾸기» 하나뿐
    await page.locator('#ev-raw').fill('Spoke well today.');
    await page.locator('#ev-tr').click(); await page.locator('#ev-out').waitFor({ state: 'visible' });
    await page.locator('#ev-ok').click(); await page.locator('#ev-ok').waitFor({ state: 'detached' });
    check(tag + ' 일지는 그대로 나감', !!sentLog && sentLog.student_uid === 'fixture-1' && !('level' in sentLog));
    check(tag + ' 확인창 0 · 레벨 요청 0', dialogs.length === 0 && levelBodies.length === 0);
    check(tag + ' 페이지 오류 0', errors.length === 0);
    await ctx.close();
  }
  console.log(`\nPASS ${n} · 스크린샷: ${OUT}`);
} finally {
  await browser.close(); server.close();
}
