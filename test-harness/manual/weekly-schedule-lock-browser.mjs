/**
 * Weekly schedule lock, explicit drag confirmation, versioned group save/undo.
 * Real Chromium and unchanged checkout bytes; all APIs and identities synthetic.
 * CI only: pinned Playwright 1.63.0 and a hard loopback-only Linux namespace.
 * No HTTP server, real account/provider/media, source rewriting, or passing skip.
 * OUTPUT_DIR receives fixture-report.json and case screenshots. See README.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = await realpath(resolve(ROOT, 'cloudflare-deploy/public'));
const OUT = resolve(process.env.OUTPUT_DIR || '/tmp/weekly-schedule-lock-results');
const BASE = 'http://127.0.0.1:18767'; // Synthetic origin; no listener exists.
const PIN = '1.63.0';
const SUITE = 'weekly-schedule-lock-browser';
const DAY = '2026-10-06';
const CLASS_TIME = Date.parse(DAY + 'T14:20:00+09:00');
const NOW = '2026-10-05T00:00:00Z';
const MOVE = '/api/admin/class-schedules/move';
const IDS = [90001, 90002];
const TEACHERS = [
  { id: '29', name: '검증 강사 A', name_en: 'Fixture Teacher A', category: 'office' },
  { id: '24', name: '검증 강사 B', name_en: 'Fixture Teacher B', category: 'office' },
];
const SCHEDULES = IDS.map((id, i) => ({
  id, teacher_id: '29', date: DAY, start_time: '14:20', type: '1on1', duration_min: 20,
  origin: 'class', move_field: 'scheduled_date', move_version: `fixture-v0-${id}`,
  students: [{ name: `검증 학생 ${i + 1}`, uid: `fixture_student_${i + 1}` }],
}));
const report = { suite: SUITE, passed: 0, failed: 0, skipped: 0, skipped0: true,
  cases: [], assertions: [], requests: [], denied: [], pageErrors: [] };
const contexts = new Set();
let browser;
await mkdir(OUT, { recursive: true });
const copy = value => JSON.parse(JSON.stringify(value));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = (data, status = 200) => ({ status, contentType: 'application/json',
  body: JSON.stringify(data), headers: { 'cache-control': 'no-store' } });
function check(name, passed, detail) {
  report.assertions.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  if (!passed) { report.failed++; throw new Error(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail))); }
  report.passed++; console.log('PASS ' + name);
}
async function bounded(name, work, ms = 15000) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Deadline: ' + name)), ms);
  })]); } finally { clearTimeout(timer); }
}
async function eventually(name, predicate) {
  const until = Date.now() + 12000;
  do { const value = await predicate(); if (value) return value; await delay(35); } while (Date.now() < until);
  throw new Error('Timed out: ' + name);
}
function hold() { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; }
const cell = (teacher = '29', hour = 14, minute = 20) =>
  `td.slot[data-tid="${teacher}"][data-date="${DAY}"][data-hour="${hour}"][data-min="${minute}"]`;
const MODIFY = '#modal-overlay.show [data-move-mode="change"]';
const POSTPONE = '#modal-overlay.show [data-move-mode="postpone"]';
const CANCEL = '#modal-overlay.show button[onclick="cancelMove()"]';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };

async function open(name, { width = 1600, instant = NOW, role = 'hq_teacher', preview } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, timezoneId: 'Asia/Seoul',
    locale: 'ko-KR', serviceWorkers: 'block', acceptDownloads: false });
  contexts.add(context); context.setDefaultTimeout(12000);
  // Freeze Date only; animations, real pointer events and timers remain native.
  await context.clock.setFixedTime(new Date(instant));
  await context.addInitScript(({ origin, role, preview }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'fixture_schedule',
      name: '검증 사용자', role, pref_lang: 'ko' }));
    if (preview) localStorage.setItem('admin_session', JSON.stringify({ uid: preview }));
    localStorage.setItem('mangoi_lang', 'ko');
    localStorage.setItem('adminLang', 'ko');
  }, { origin: BASE, role, preview });
  const state = { name, context, page: null, schedules: copy(SCHEDULES), moves: [], routeErrors: [],
    unconfigured: [], held: [], holdNext: false, revisions: 0 };
  await context.routeWebSocket('**/*', ws => {
    report.denied.push({ case: name, kind: 'websocket' }); ws.close({ code: 1008, reason: 'Fixture only' });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (url.origin !== BASE) {
        report.denied.push({ case: name, kind: 'nonlocal', origin: url.origin });
        return await route.abort('blockedbyclient');
      }
      if (url.pathname.startsWith('/api/')) {
        const body = ['GET', 'HEAD'].includes(method) ? null : request.postDataJSON();
        const record = { case: name, method, path: url.pathname + url.search, body };
        report.requests.push(record);
        if (method === 'PATCH' && url.pathname === MOVE) {
          state.moves.push(record);
          // Fail closed if any group member or optimistic version is missing.
          const expected = Object.fromEntries(state.schedules.map(row => [String(row.id), row.move_version]));
          assert.deepEqual([...body.ids].sort(), [...IDS].sort(), 'Every group member must move in one batch');
          assert.deepEqual(body.expected, expected, 'Batch must use current returned versions');
          assert.equal(body.scheduled_date, body.destination_date);
          assert.match(body.start_time, /^\d\d:\d\d$/);
          if (state.holdNext) {
            state.holdNext = false;
            const gate = hold(); state.held.push(gate); await gate.promise;
          }
          state.revisions++;
          for (const row of state.schedules) {
            row.date = body.destination_date; row.start_time = body.start_time;
            if (body.teacher_id) row.teacher_id = body.teacher_id;
            row.move_version = `fixture-v${state.revisions}-${row.id}`;
          }
          return await route.fulfill(json({ ok: true,
            move_versions: Object.fromEntries(state.schedules.map(row => [String(row.id), row.move_version])) }));
        }
        if (method === 'GET') {
          if (url.pathname === '/api/admin/teachers') return await route.fulfill(json(TEACHERS));
          if (url.pathname === '/api/admin/schedules') return await route.fulfill(json(state.schedules));
          if (url.pathname === '/api/calendar/events') return await route.fulfill(json({ events: [] }));
          if (url.pathname === '/api/admin/mod/holidays/list') return await route.fulfill(json({ rows: [] }));
          if (url.pathname === '/api/teachers/mbti-list') return await route.fulfill(json({ teachers: [] }));
          if (url.pathname === '/api/admin/unassigned-students') return await route.fulfill(json({ students: [
            { uid: 'fixture_waiting', name: '검증 대기 학생', level: 'A1' },
          ] }));
        }
        state.unconfigured.push(record); report.denied.push({ ...record, kind: 'unconfigured-api' });
        return await route.fulfill(json({ ok: false, error: 'offline_fixture_not_configured' }, 503));
      }
      if (!['GET', 'HEAD'].includes(method)) throw new Error('Unexpected asset method: ' + method);
      if (url.pathname === '/favicon.ico') return await route.fulfill({ status: 204, body: '' });
      const decoded = decodeURIComponent(url.pathname);
      assert(!decoded.includes('\0') && !decoded.includes('\\') && !decoded.split('/').includes('..'), 'Unsafe asset path');
      const candidate = resolve(PUBLIC, '.' + decoded);
      assert(candidate.startsWith(PUBLIC + sep), 'Asset must stay inside checkout public root');
      let file;
      try { file = await realpath(candidate); } catch {
        state.routeErrors.push('Missing checkout asset: ' + decoded);
        return await route.fulfill({ status: 404, body: 'Missing fixture asset' });
      }
      assert(file.startsWith(PUBLIC + sep), 'Asset symlink must stay inside checkout public root');
      // No continue/fetch fallback. Every response is synthetic or exact checkout bytes.
      return await route.fulfill({ contentType: MIME[extname(file)] || 'application/octet-stream',
        body: method === 'HEAD' ? '' : await readFile(file), headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      state.routeErrors.push(String(error));
      try { await route.abort('failed'); } catch { /* already closed; original error retained */ }
    }
  });
  context.on('page', page => page.on('pageerror', error => report.pageErrors.push({ case: name, message: String(error) })));
  state.page = await context.newPage();
  await state.page.goto(BASE + '/admin/weekly-schedule.html', { waitUntil: 'load' });
  await state.page.waitForFunction(() => typeof SLOTS !== 'undefined' && Object.keys(SLOTS).length > 0);
  await state.page.locator('[data-view="day"]').click();
  await state.page.locator('#day-picker [data-dow="1"]').click();
  await state.page.locator('#guide-toast button').click();
  await state.page.locator(cell()).waitFor({ state: 'visible' });
  check(name + ': fixture group has both members', await state.page.evaluate(() => {
    const group = Object.values(SLOTS).find(slot => (slot.ids || []).includes(90001));
    return group?.type === 'group' && group.ids.length === 2 && group.students.length === 2;
  }));
  return state;
}
async function snapshot(page) {
  return page.evaluate(() => JSON.stringify(Object.keys(SLOTS).sort().map(key => ({ key, slot: SLOTS[key] }))));
}
async function drag(state, { teacher = '29', hour = 17, minute = 0 } = {}) {
  const { page } = state, source = page.locator(cell()), target = page.locator(cell(teacher, hour, minute));
  await source.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded();
  const src = await source.boundingBox(), dst = await target.boundingBox();
  check(state.name + ': source and destination have real geometry', !!src && !!dst, { src, dst });
  // Choose the center of the first 10-minute segment, not a colspan midpoint.
  const sx = src.x + Math.min(src.width / 4, 6), sy = src.y + src.height / 2;
  const dx = dst.x + dst.width / 2, dy = dst.y + dst.height / 2;
  const hit = await page.evaluate(({ sx, sy, dx, dy, from, to }) => ({
    source: document.elementFromPoint(sx, sy)?.closest('td.slot')?.matches(from),
    target: document.elementFromPoint(dx, dy)?.closest('td.slot')?.matches(to),
  }), { sx, sy, dx, dy, from: cell(), to: cell(teacher, hour, minute) });
  check(state.name + ': both drag endpoints are topmost cells', hit.source && hit.target, hit);
  await page.mouse.move(sx, sy); await page.mouse.down();
  await page.mouse.move(dx, dy, { steps: 12 }); await page.mouse.up();
  await page.locator(MODIFY).waitFor({ state: 'visible' });
}
async function finish(state) {
  for (const gate of state.held) gate.release();
  check(state.name + ': no unconfigured API requests', state.unconfigured.length === 0, state.unconfigured);
  check(state.name + ': no route errors', state.routeErrors.length === 0, state.routeErrors);
  check(state.name + ': no page errors', !report.pageErrors.some(error => error.case === state.name));
  check(state.name + ': no denied external traffic', !report.denied.some(error => error.case === state.name));
  await bounded('case screenshot', state.page.screenshot({ path: resolve(OUT, state.name + '.png') }));
  await bounded('context cleanup', state.context.close()); contexts.delete(state.context);
}
async function run(name, fn, options) {
  const item = { name, passed: false, assertions: 0 }, start = report.assertions.length;
  report.cases.push(item);
  let state;
  try { state = await open(name, options); await fn(state); await finish(state); item.passed = true; }
  catch (error) { report.failed++; item.error = String(error); console.error(error.stack); }
  finally {
    item.assertions = report.assertions.length - start;
    if (state) {
      for (const gate of state.held) gate.release();
      if (contexts.has(state.context)) { await bounded('failed context cleanup', state.context.close()); contexts.delete(state.context); }
    }
  }
}
/** 그 자리의 «맨 위» 가 내 요소(또는 그 자식)인가 — 「보인다」와 「눌린다」는 다르다. */
const topmostIs = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return { found: true, w: r.width, h: r.height, visible: false };
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    found: true, visible: true, w: Math.round(r.width), h: Math.round(r.height),
    right: Math.round(r.right), vw: window.innerWidth,
    mine: !!top && (top === el || el.contains(top)),
    topTag: top ? (top.tagName + '.' + String(top.className || '').split(' ')[0]) : null,
  };
}, sel);


/* 🎨 «무슨 색인가» 와 «읽히는가» 는 다른 검사다 (CLAUDE.md).
   ⚠️ 이 화면은 `adm-light-theme.css` 를 싣는 «밝은» 화면이라, 다크 전제로 고른 색
      (연노랑 #fde68a 같은)을 그대로 쓰면 흰 바탕에서 안 읽힌다.
   ⚠️ 반투명·그라데이션은 «불투명한 층을 만날 때까지» 모아 아래에서 위로 합성해야 한다 —
      첫 조상에서 멈추면 멀쩡한 대비를 1점대로 «틀리게» 읽는다. */
const contrastOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return { found: false };
  const parse = (c) => {
    if (!c) return null;
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const firstFromImage = (img) => {
    if (!img || img === 'none') return null;
    const m = String(img).match(/rgba?\([^)]+\)/g);
    if (!m) return null;
    // 여러 stop 중 «가장 나쁜» 것을 쓰려면 전부 봐야 하지만, 여기선 첫 stop 으로 충분하다
    return parse(m[0]);
  };
  // 글자색 — 조상의 opacity 까지 곱한다
  const cs = getComputedStyle(el);
  const fg = parse(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
  let op = 1;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity || '1');
  fg.a = (fg.a == null ? 1 : fg.a) * op;
  // 배경 — 불투명한 층을 만날 때까지 쌓는다
  const layers = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s2 = getComputedStyle(n);
    const bi = firstFromImage(s2.backgroundImage);
    const bc = parse(s2.backgroundColor);
    for (const L of [bi, bc]) {          // 같은 요소에서 «색 위에 이미지» 순서
      if (!L || !L.a) continue;
      layers.push(L);
      if (L.a >= 1) break;
    }
    if (layers.length && layers[layers.length - 1].a >= 1) break;
  }
  layers.push({ r: 255, g: 255, b: 255, a: 1 });   // 최후의 바탕
  let bg = layers[layers.length - 1];
  for (let i = layers.length - 2; i >= 0; i--) {
    const L = layers[i];
    bg = { r: L.r * L.a + bg.r * (1 - L.a), g: L.g * L.a + bg.g * (1 - L.a), b: L.b * L.a + bg.b * (1 - L.a), a: 1 };
  }
  const over = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const l1 = lum(over), l2 = lum(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return { found: true, ratio: Math.round(ratio * 100) / 100, color: cs.color, size: cs.fontSize, weight: cs.fontWeight,
           bg: 'rgb(' + [bg.r, bg.g, bg.b].map((x) => Math.round(x)).join(',') + ')' };
}, sel);

async function lockControls(state) {
  const { page } = state;
  const btn = await topmostIs(page, '#ws-lock-btn');
  check('lock button is visible', btn.found && btn.visible, btn);
  check('lock button is topmost at its center', btn.mine === true, btn);
  check('lock button remains inside viewport', btn.right <= btn.vw, btn);
  const initial = await page.evaluate(() => ({ editing: wsEditing(),
    pressed: document.querySelector('#ws-lock-btn').getAttribute('aria-pressed'),
    label: document.querySelector('#ws-lock-label').textContent, icon: document.querySelector('#ws-lock-ico').textContent }));
  check('default editing is locked with aria-pressed=false', !initial.editing && initial.pressed === 'false', initial);
  check('default Korean label and lock icon remain intact', initial.label === '잠김' && initial.icon === '🔒', initial);
  await page.locator('#ws-lock-btn').click();
  const enabled = await page.evaluate(() => ({ editing: wsEditing(),
    pressed: document.querySelector('#ws-lock-btn').getAttribute('aria-pressed'),
    label: document.querySelector('#ws-lock-label').textContent, cd: document.querySelector('#ws-lock-cd').textContent }));
  check('real button click enables editing and updates aria', enabled.editing && enabled.pressed === 'true', enabled);
  check('editing label changes to Korean active label', enabled.label === '편집 중', enabled);
  check('remaining editing time is visible', /^\d+:\d\d$/.test(enabled.cd), enabled);
  await page.evaluate(() => applyLang('en'));
  check('EN switch preserves active editing label', await page.locator('#ws-lock-label').textContent() === 'Editing');
  await page.evaluate(() => applyLang('ko'));
  await page.locator('#ws-lock-btn').click();
  check('second real click locks editing and restores Korean label', !(await page.evaluate(() => wsEditing()))
    && await page.locator('#ws-lock-label').textContent() === '잠김');
}
async function cancelLocked(state) {
  const { page } = state, before = await snapshot(page), rows = copy(state.schedules);
  for (const lang of ['ko', 'en']) {
    await page.evaluate(value => applyLang(value), lang);
    await drag(state);
    const notice = page.locator('#modal-overlay.show .ws-move-locked');
    check(lang + ': locked drag visibly explains unlock and save', await notice.isVisible()
      && (lang === 'ko' ? /편집을 켜고 저장/.test(await notice.innerText()) : /turns editing on and saves/.test(await notice.innerText())));
    const confirm = await topmostIs(page, MODIFY), cancel = await topmostIs(page, CANCEL);
    check(lang + ': affirmative and cancel controls are topmost', confirm.mine && cancel.mine, { confirm, cancel });
    check(lang + ': title offers postpone or modify', /연기할까요, 변경할까요|Postpone or modify/.test(await page.locator('#modal-overlay.show').innerText()));
    check(lang + ': both choices use current visible labels', (lang === 'ko' ? /연기/.test(await page.locator(POSTPONE).innerText())
      && /변경/.test(await page.locator(MODIFY).innerText()) : /Postpone/.test(await page.locator(POSTPONE).innerText())
      && /Modify/.test(await page.locator(MODIFY).innerText())));
    check(lang + ': merely seeing confirmation leaves editing locked and sends no save', !(await page.evaluate(() => wsEditing()))
      && state.moves.length === 0 && await snapshot(page) === before);
    await page.locator(CANCEL).click();
    await page.locator('#modal-overlay').waitFor({ state: 'hidden' });
    check(lang + ': Cancel leaves group, all records and editing lock unchanged', state.moves.length === 0
      && !(await page.evaluate(() => wsEditing())) && await snapshot(page) === before
      && JSON.stringify(state.schedules) === JSON.stringify(rows));
    check(lang + ': Cancel clears pending move and explains cancellation', await page.evaluate(() => window.__moveCtx === null)
      && (await page.locator('.dnd-toast').allTextContents()).some(text => /변경 취소됨|Move cancelled/.test(text)));
  }
}
async function cancelUnlocked(state) {
  const { page } = state, before = await snapshot(page);
  await page.locator('#ws-lock-btn').click(); await drag(state);
  check('unlocked drag still opens the visible affirmative confirmation', await page.locator(MODIFY).isVisible());
  check('unlocked confirmation has no misleading unlock notice', await page.locator('#modal-overlay.show .ws-move-locked').count() === 0);
  check('unlocked drag still cannot save before confirmation', state.moves.length === 0 && await snapshot(page) === before);
  await page.locator(CANCEL).click();
  check('cancelled unlocked drag preserves group and editing state', state.moves.length === 0
    && await snapshot(page) === before && await page.evaluate(() => wsEditing()));
}
async function saveAndUndo(state) {
  const { page } = state, before = await snapshot(page);
  await drag(state, { teacher: '24' });
  check('teacher-change confirmation discloses teacher change and disables time-only postpone',
    /담당 교사도 함께 변경/.test(await page.locator('#modal-overlay.show').innerText()) && await page.locator(POSTPONE).isDisabled());
  check('locked group waits for affirmative unlock confirmation', state.moves.length === 0
    && !(await page.evaluate(() => wsEditing())) && await snapshot(page) === before);
  state.holdNext = true;
  const button = await page.locator(MODIFY).boundingBox(); assert(button);
  // Repeated native pointer clicks at the same confirmed button location. The
  // first click consumes the context synchronously; later clicks cannot resave.
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2, { clickCount: 3, delay: 30 });
  await eventually('held batch arrives', () => state.held.length === 1);
  check('affirmative confirmation enables editing', await page.evaluate(() => wsEditing()));
  check('repeated affirmative clicks emit exactly one versioned group batch', state.moves.length === 1
    && JSON.stringify(state.moves[0].body.ids) === JSON.stringify(IDS)
    && JSON.stringify(state.moves[0].body.expected) === JSON.stringify(Object.fromEntries(SCHEDULES.map(row => [String(row.id), row.move_version]))), state.moves);
  const first = state.moves[0].body;
  check('batch names source, destination, original minutes and new teacher correctly', first.source_date === DAY
    && first.destination_date === DAY && first.scheduled_date === DAY && first.start_time === '17:00' && first.teacher_id === '24', first);
  check('held response cannot optimistically move or split group', await snapshot(page) === before
    && state.schedules.every(row => row.start_time === '14:20' && row.teacher_id === '29'));
  check('held response offers no false saved/undo feedback', await page.locator('.undo-toast').count() === 0
    && !(await page.locator('.dnd-toast').allTextContents()).some(text => /이동됨|Moved to|저장했습니다|Saved/.test(text)));
  state.held[0].release();
  await eventually('group rendered at saved destination', async () => !!await page.locator(cell('24', 17, 0)).getAttribute('data-slot')
    && !await page.locator(cell()).getAttribute('data-slot'));
  await page.locator('.undo-toast.show button').waitFor({ state: 'visible' });
  check('confirmed save moves every group member together', state.schedules.every(row => row.start_time === '17:00' && row.teacher_id === '24')
    && await page.evaluate(() => Object.values(SLOTS).some(slot => slot.ids?.length === 2 && slot.students?.length === 2)));
  await eventually('real saved success toast appears', async () => (await page.locator('.dnd-toast.show').allTextContents()).some(text => /이동됨/.test(text)));
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('.undo-toast.show');
    const b = [...document.querySelectorAll('.dnd-toast.show')].find(node => /이동됨/.test(node.textContent));
    if (!a || !b) return { found: false };
    const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left))
      * Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top));
    return { found: true, area, undo: [r.top, r.bottom], toast: [q.top, q.bottom] };
  });
  check('undo toast does not cover the real saved-success toast', overlap.found && overlap.area === 0, overlap);
  const undo = await topmostIs(page, '.undo-toast.show button');
  check('undo button is visibly rendered', undo.found && undo.visible, undo);
  check('undo button is the real topmost hit target', undo.mine === true, undo);
  await page.screenshot({ path: resolve(OUT, state.name + '-saved.png') });
  await page.locator('.undo-toast.show button').click();
  await eventually('undo restored original group', async () => state.moves.length === 2
    && !!await page.locator(cell()).getAttribute('data-slot') && !await page.locator(cell('24', 17, 0)).getAttribute('data-slot'));
  const reversed = state.moves[1].body;
  check('undo sends exactly one batch with returned versions for both rows', state.moves.length === 2
    && JSON.stringify(reversed.ids) === JSON.stringify(IDS)
    && JSON.stringify(reversed.expected) === JSON.stringify(Object.fromEntries(IDS.map(id => [String(id), `fixture-v1-${id}`]))), reversed);
  check('undo sends original date, minute and teacher values', reversed.start_time === '14:20'
    && reversed.scheduled_date === DAY && reversed.destination_date === DAY && reversed.teacher_id === '29', reversed);
  check('undo restores every synthetic record and cannot be clicked again', state.schedules.every(row => row.date === DAY
    && row.start_time === '14:20' && row.teacher_id === '29') && await page.locator('.undo-toast.show').count() === 0);
}
async function layout(state) {
  const { page } = state;
  const values = await page.evaluate(() => {
    const rect = document.querySelector('#ws-lock-btn').getBoundingClientRect();
    return { doc: document.documentElement.scrollWidth, viewport: innerWidth, right: rect.right, width: rect.width };
  });
  check(state.name + ': document has no horizontal overflow', values.doc <= values.viewport + 1, values);
  check(state.name + ': lock button stays inside viewport', values.width > 0 && values.right <= values.viewport + 1, values);
}
async function contrast(state) {
  const { page } = state;
  await page.waitForTimeout(1200); // Include shipped deferred light-surface painter.
  const locked = await contrastOf(page, '#ws-lock-label');
  check('locked label has contrast >= 4.5:1', locked.found && locked.ratio >= 4.5, locked);
  await page.locator('#ws-lock-btn').click(); await page.waitForTimeout(200);
  const editing = await contrastOf(page, '#ws-lock-label'), countdown = await contrastOf(page, '#ws-lock-cd');
  check('editing label has contrast >= 4.5:1', editing.found && editing.ratio >= 4.5, editing);
  check('remaining-time countdown has contrast >= 4.5:1', countdown.found && countdown.ratio >= 4.5, countdown);
  // Produce the real undo offer from a successful versioned group save.
  await drag(state); await page.locator(MODIFY).click();
  await page.locator('.undo-toast.show button').waitFor(); await page.waitForTimeout(1200);
  const toast = await contrastOf(page, '.undo-toast.show'), button = await contrastOf(page, '.undo-toast.show button');
  check('undo-toast text has contrast >= 4.5:1', toast.found && toast.ratio >= 4.5, toast);
  check('undo button text has contrast >= 4.5:1', button.found && button.ratio >= 4.5, button);
}
async function cutoff(state, { allowed, expectedRole, mode = 'change', helper = false, unlocked = false }) {
  const { page } = state, before = await snapshot(page);
  check(state.name + ': actual effective role and override match existing policy', await page.evaluate(role =>
    schedEffectiveRole() === role && canOverrideTimeLimit() === /^(hq_mgr|hq_exec|admin)$/.test(role)
    && window.__admScopeGuard?.active === false, expectedRole));
  if (unlocked) await page.locator('#ws-lock-btn').click();
  await drag(state);
  check(state.name + ': cutoff case cannot save before affirmative click', state.moves.length === 0 && await snapshot(page) === before);
  if (helper) {
    // The separate public dispatcher must delegate to the same guarded save;
    // still use a real drag and visible confirmation before exercising it.
    await page.evaluate(() => confirmMoveAs('change'));
  } else await page.locator(mode === 'postpone' ? POSTPONE : MODIFY).click();
  if (allowed) {
    await eventually('allowed boundary saves group', () => state.moves.length === 1 && state.revisions === 1);
    await eventually('allowed boundary updates UI', async () => !!await page.locator(cell('29', 17, 0)).getAttribute('data-slot'));
    check(state.name + ': allowed existing-policy path saves one intact group and enables editing', state.moves.length === 1
      && state.schedules.every(row => row.start_time === '17:00') && await page.evaluate(() => wsEditing()));
  } else {
    await page.locator('#modal-overlay.show .reject-modal').waitFor();
    check(state.name + ': existing rejection message states the unchanged cutoff',
      new RegExp(mode === 'postpone' ? '30분' : '24시간').test(await page.locator('#modal-overlay.show').innerText()));
    check(state.name + ': denied move cannot unlock, mutate group, or request save', state.moves.length === 0
      && state.revisions === 0 && await snapshot(page) === before && await page.evaluate(() => wsEditing()) === unlocked);
    check(state.name + ': denied move clears pending context and offers no undo', await page.evaluate(() => window.__moveCtx === null)
      && await page.locator('.undo-toast').count() === 0);
  }
}

const cases = [
  ['lock-controls-and-language', lockControls],
  ['locked-group-cancel-ko-en', cancelLocked],
  ['unlocked-group-cancel', cancelUnlocked],
  ['locked-group-save-and-undo', saveAndUndo],
  ['layout-1280', layout, { width: 1280 }],
  ['layout-1024', layout, { width: 1024 }],
  ['light-theme-contrast', contrast],
];
// Millisecond boundaries use the unchanged canChange/canPostpone policy and
// real Date input in Asia/Seoul. No production function/role is replaced.
for (const [name, minutes, offset, allowed, extra = {}] of [
  ['restricted-change-just-outside', 1440, -1, true],
  ['restricted-change-exact-24h', 1440, 0, true],
  ['restricted-change-just-inside', 1440, 1, false],
  ['restricted-change-helper-inside', 1440, 1, false, { helper: true }],
  ['restricted-change-unlocked-inside', 1440, 1, false, { unlocked: true }],
  ['restricted-postpone-exact-30m', 30, 0, true, { mode: 'postpone' }],
  ['restricted-postpone-just-inside', 30, 1, false, { mode: 'postpone' }],
]) cases.push([name, state => cutoff(state, { allowed, expectedRole: 'hq_teacher', ...extra }),
  { instant: new Date(CLASS_TIME - minutes * 60000 + offset).toISOString() }]);
for (const role of ['hq_mgr', 'hq_exec', 'admin']) cases.push([
  'manager-change-inside-' + role, state => cutoff(state, { allowed: true, expectedRole: role }),
  { role, instant: new Date(CLASS_TIME - 60000).toISOString() },
]);
cases.push(['preview-role-restricts-manager', state => cutoff(state, { allowed: false, expectedRole: 'hq_teacher' }),
  { role: 'hq_mgr', preview: 'hq_t_fixture', instant: new Date(CLASS_TIME - 60000).toISOString() }]);

try {
  const interfaces = (await readFile('/proc/self/net/dev', 'utf8')).trim().split('\n').slice(2)
    .map(line => line.trim().split(':')[0]).sort();
  check('namespace contains ONLY loopback', JSON.stringify(interfaces) === '["lo"]', interfaces);
  const routes = (await readFile('/proc/net/route', 'utf8')).trim().split('\n').slice(1);
  check('namespace has no IPv4 default route', !routes.some(line => line.trim().split(/\s+/)[1] === '00000000'));
  const v6 = (await readFile('/proc/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean);
  check('namespace has no usable IPv6 default route', !v6.some(line => {
    const f = line.trim().split(/\s+/); return f[0] === '0'.repeat(32) && f[1] === '00' && !(parseInt(f[8], 16) & 0x200);
  }));
  assert(process.env.PW_DIR, 'PW_DIR must identify the isolated pinned tool installation');
  const require = createRequire(import.meta.url);
  check('Playwright is exactly ' + PIN, require(resolve(process.env.PW_DIR, 'node_modules/playwright-core/package.json')).version === PIN);
  const { chromium } = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core'));
  browser = await chromium.launch({ headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  report.browserVersion = browser.version();
  for (const [name, fn, options] of cases) await run(name, fn, options);
} catch (error) { report.failed++; report.lifecycleError = String(error); console.error(error.stack); }
finally {
  if (browser) {
    try { await bounded('browser cleanup', browser.close(), 10000); }
    catch (error) { report.failed++; report.cleanupError = String(error); }
  }
  if (report.cases.length !== cases.length) { report.failed++; report.incompleteCases = { completed: report.cases.length, required: cases.length }; }
  try { await bounded('write report', writeFile(resolve(OUT, 'fixture-report.json'), JSON.stringify(report, null, 2) + '\n')); }
  catch (error) { report.failed++; console.error('Report write failed: ' + error); }
  console.log(`${SUITE}: PASS ${report.passed} / FAIL ${report.failed} / SKIP 0`);
}
if (report.failed) process.exit(1);
