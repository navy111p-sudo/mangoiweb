/* Fresh Oct7 reconstruction: real shipped manager + student UI, synthetic responses only.
   Requires a loopback-only network namespace and pinned Playwright. No source rewriting,
   live server, bindings, credentials, passthrough requests, or missing-browser skips. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = await realpath(resolve(ROOT, 'cloudflare-deploy/public'));
const OUT = resolve(process.env.OFFLINE_BROWSER_OUTPUT || '/tmp/admin-schedule-consistency-browser');
const BASE = 'http://127.0.0.1:18764';
await mkdir(OUT, { recursive: true });
let passes = 0, failures = 0, activeCase = null, browser = null;
const contexts = new Set();
const report = { cases: [], checks: [], requests: [], denied: [], unknownReads: [], unexpectedWrites: [], routeErrors: [], pageErrors: [] };
function check(name, value) { report.checks.push({ name, passed: !!value }); if (!value) { failures++; throw new Error(name); } passes++; console.log('PASS ' + name); }
async function bounded(label, promise, ms = 12000) { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out: ' + label)), ms); })]); } finally { clearTimeout(timer); } }
async function saveReport() { report.summary = { passed: report.cases.filter(c => c.status === 'passed').length, failed: report.cases.filter(c => c.status === 'failed').length, skipped: 0, assertionsPassed: passes, assertionsFailed: failures }; await writeFile(resolve(OUT, 'schedule-fixture-report.json'), JSON.stringify(report, null, 2)); }
async function run(name, fn) {
  activeCase = { name, status: 'running' }; report.cases.push(activeCase);
  try { await bounded(name, fn(), 90000); activeCase.status = 'passed'; activeCase = null; }
  catch (error) { activeCase.status = 'failed'; activeCase.error = String(error); activeCase.stack = error.stack; throw error; }
}
const json = (j, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(j), headers: { 'cache-control': 'no-store' } });
const plus = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
function preview(body, n, key) { return { ok: true, dry_run: true, count: n, preview_key: key, items: Array.from({ length: n }, (_, i) => ({ id: 7 + i, from_date: plus('2026-12-30', i * 7), from_time: '16:30', to_date: plus(body.new_date, i * 7), to_time: body.new_time })), teacher: { from_id: '5', to_id: body.teacher_id || '5', from_name: 'Fixture Teacher', to_name: body.teacher_id ? 'Alternate Teacher' : 'Fixture Teacher', changed: !!body.teacher_id } }; }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webm': 'video/webm', '.mp4': 'video/mp4' };
async function fixture(width, mode = 'success', n = 12, student = false) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Seoul', locale: 'en-US', serviceWorkers: 'block', acceptDownloads: false });
  contexts.add(context); context.setDefaultTimeout(12000); await context.clock.setFixedTime(new Date('2026-12-30T00:00:00Z'));
  const local = { writes: [], previews: [], revision: 1, hold: null, mode, n, dialogs: [] };
  await context.addInitScript(student => {
    localStorage.setItem('mangoi_lang', student ? 'ko' : 'en');
    localStorage.setItem('mangoi_logged_user', JSON.stringify(student ? { uid: 'fixture_student', name: 'Synthetic Student', role: 'student' } : { uid: 'fixture_admin', name: 'Fixture Admin', role: 'hq_mgr' }));
    if (student) localStorage.setItem('mango_token', 'synthetic-token');
  }, student);
  await context.routeWebSocket('**/*', ws => { report.denied.push(ws.url()); ws.close({ code: 1008, reason: 'Synthetic fixture only' }); });
  await context.route('**/*', async route => {
    try {
      const req = route.request(), url = new URL(req.url()), method = req.method();
      report.requests.push({ case: activeCase?.name, method, path: url.pathname });
      if (url.origin !== BASE) { report.denied.push(url.origin + url.pathname); return await route.abort('blockedbyclient'); }
      if (url.pathname === '/' && method === 'GET') return await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic Home</title><p>Navigation destination fixture</p>' });
      if (url.pathname.startsWith('/api/')) {
        const reads = {
          '/api/admin/me': { ok: true, role: 'hq', roleLabel: 'HQ', scope: { type: 'hq', value: null }, user: { username: 'fixture_admin', name: 'Fixture Admin' }, name: 'Fixture Admin' },
          '/api/admin/exec/summary': { ok: true, scope: { type: 'hq' } },
          '/api/admin/stats/today': { ok: true, date: '2026-12-30', revenue: { amount_krw: 0, pay_count: 0 }, students: { attended: 0, active: 0 }, signups: { count: 0 }, absence: { booked_today: 0, done_today: 0 } },
          '/api/admin/schedule-requests': { ok: true, items: [] },
          '/api/admin/stats/waitlist': { ok: true, rows: [], items: [] },
          '/api/approval/home': { ok: true, pending: 0 },
          '/api/approval/handover/inbox': { ok: true, reports: [], total: 0, reader_mode: false, writer: { required: false }, missed_staff: [], me: { username: 'fixture_admin' } },
          '/api/approval/handover/mine': { ok: true, reports: [] },
          '/api/teacher/portal': { ok: true, next: null, now: Date.parse('2026-12-30T00:00:00Z') },
          '/api/teacher-profiles': { ok: true, items: [{ id: 5, english_name: 'Fixture Teacher', origin_region: 'Philippines', image_url: '' }] },
          '/api/class/schedule/mine': { ok: true, schedules: [0, 1, 2].map(i => ({ schedule_id: 7 + i, scheduled_date: plus('2026-12-30', i * 7), next_date: plus('2026-12-30', i * 7), start_time: '16:30', teacher_name: 'Fixture Teacher' })) },
          '/api/class/schedule/weekly-postpone': { ok: true, items: preview({ new_date: '2027-01-06', new_time: '16:30' }, 3, 'student-preview').items, count: 3, snapshot: 'synthetic-student-snapshot' },
          '/api/admin/classes/today': { ok: true, date: '2026-12-30', counts: { joinable: 0, cafe24: 0 }, sessions: [{ schedule_id: 7, source: 'mangoi', can_move: true, student_name: 'Synthetic Student', student_uid: 'fixture_student', teacher_name: 'Fixture Teacher', academy: 'Synthetic Academy', start_time: '16:30', start_ts: Date.parse('2026-12-30T07:30:00Z'), join_open: false, textbook_assigned: true, textbook: 'Fixture Book' }] }
        };
        if (method === 'GET' && Object.hasOwn(reads, url.pathname)) return await route.fulfill(json(reads[url.pathname]));
        if (method === 'GET' && url.pathname === '/api/pay/enroll/admin/move-candidates') return await route.fulfill(json({ ok: true, date: url.searchParams.get('date'), time: url.searchParams.get('time'), current: { id: '5', name: 'Fixture Teacher', free: true }, candidates: [{ id: '8', name: 'Alternate Teacher' }], teacher_change_ok: true, busy_count: 0 }));
        if (student && method === 'POST' && url.pathname === '/api/class/schedule/request') {
          local.writes.push(req.postDataJSON());
          return await route.fulfill(local.mode === 'student_fail' ? json({ ok: false, error: 'fixture_failure' }, 503) : json({ ok: true, id: 1, auto_applied: 'moved' }));
        }
        if (method === 'POST' && url.pathname === '/api/pay/enroll/admin/series-move') {
          const body = req.postDataJSON();
          if (!body.apply) {
            local.previews.push(body); const value = preview(body, local.n, 'fixture-' + local.revision); local.lastPreviewKey = value.preview_key;
            if (local.mode === 'missing_key') delete value.preview_key;
            if (local.hold) { const held = local.hold; local.hold = null; held.started(); await held.promise; }
            return await route.fulfill(json(value));
          }
          local.writes.push(body);
          if (local.mode === 'uncertain') return await route.abort('failed');
          if (['stale_preview', 'schedule_changed'].includes(local.mode) && local.writes.length === 1) { local.revision++; return await route.fulfill(json({ ok: false, error: local.mode }, 409)); }
          if (body.expected_preview !== 'fixture-' + local.revision) return await route.fulfill(json({ ok: false, error: 'stale_preview' }, 409));
          return await route.fulfill(json({ ok: true, applied: true, moved: local.n, count: local.n }));
        }
        if (method === 'GET') { report.unknownReads.push(url.pathname); return await route.fulfill(json({ ok: false, error: 'fixture_read_unconfigured' }, 503)); }
        report.unexpectedWrites.push({ method, path: url.pathname }); return await route.abort('blockedbyclient');
      }
      if (method !== 'GET') { report.unexpectedWrites.push({ method, path: url.pathname }); return await route.abort('blockedbyclient'); }
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) { report.denied.push(url.pathname); return await route.abort('blockedbyclient'); }
      let path; try { path = await realpath(resolve(PUB, '.' + decoded)); } catch { return await route.fulfill({ status: 404, body: 'Fixture asset missing' }); }
      if (!path.startsWith(PUB + sep)) { report.denied.push(path); return await route.abort('blockedbyclient'); }
      return await route.fulfill({ status: 200, contentType: MIME[extname(path)] || 'application/octet-stream', body: await readFile(path) });
    } catch (error) { report.routeErrors.push(String(error)); try { await route.abort('failed'); } catch {} }
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push({ case: activeCase?.name, message: String(error) }));
  page.on('dialog', async dialog => { local.dialogs.push(dialog.message()); await (local.accept === false ? dialog.dismiss() : dialog.accept()); });
  const close = async () => { await context.close(); contexts.delete(context); };
  if (student) { await page.goto(BASE + '/lesson-postpone-demo.html'); await page.waitForFunction(() => typeof __MOB_REAL !== 'undefined' && __MOB_REAL === true); return { context, page, local, close }; }
  await page.goto(BASE + '/manager.html'); await page.locator('#c-today').evaluate(e => e.open = true);
  await page.locator('#todayAllBody .ta-mode').waitFor({ state: 'visible' });
  check('manager starts in simple view', await page.locator('[data-ta="7"]').count() === 0);
  await page.locator('#todayAllBody .ta-mode').click();
  await page.locator('[data-ta="7"]').click();
  await page.locator('[data-mv-mode="series"]').click(); await page.locator('#tc-mv-date').fill('2027-01-06');
  await page.waitForFunction(() => { const t = document.getElementById('tc-mv-series'); return t && /classes move|회를 옮깁니다|complete preview|전체 미리보기/.test(t.innerText); });
  return { context, page, local, close };
}
async function main() {
  const interfaces = (await readFile('/proc/self/net/dev', 'utf8')).trim().split('\n').slice(2).map(x => x.trim().split(':')[0]).sort();
  check('only loopback interface', JSON.stringify(interfaces) === '["lo"]');
  check('no IPv4 default route', !(await readFile('/proc/net/route', 'utf8')).trim().split('\n').slice(1).some(x => x.trim().split(/\s+/)[1] === '00000000'));
  check('no usable IPv6 default route', !(await readFile('/proc/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean).some(x => { const a = x.trim().split(/\s+/); return a[0] === '0'.repeat(32) && a[1] === '00' && !(parseInt(a[8], 16) & 0x200); }));
  assert(process.env.PW_DIR, 'PW_DIR must identify pinned official tooling'); const require = createRequire(import.meta.url);
  check('Playwright pinned1.63.0', require(resolve(process.env.PW_DIR, 'node_modules/playwright-core/package.json')).version === '1.63.0');
  const { chromium } = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core'));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  report.browserVersion = browser.version();
  for (const width of [390, 1360]) await run('manager complete60/' + width, async () => {
    const f = await fixture(width, 'success', 60), { page, local } = f;
    check(width + ' all60 rows rendered', await page.locator('[data-mv-series-id]').count() === 60);
    const text = await page.locator('#tc-mv-series').innerText();
    check(width + ' full ISO dates/time and unchanged teacher', text.includes('2026-12-30 16:30 → 2027-01-06 16:30') && text.includes('Fixture Teacher (unchanged)'));
    check(width + ' preview scrolls', await page.locator('[data-mv-series-list]').evaluate(e => e.scrollHeight > e.clientHeight && getComputedStyle(e).overflowY === 'auto'));
    await page.locator('[data-mv-series-id="66"]').scrollIntoViewIfNeeded(); check(width + ' last row reachable', await page.locator('[data-mv-series-id="66"]').isVisible());
    await page.screenshot({ path: resolve(OUT, 'chain60-' + width + '.png') });
    local.accept = false; await page.locator('#tc-mv-go').click(); check(width + ' Cancel writes0', local.writes.length === 0);
    local.accept = true; await page.locator('#tc-mv-go').evaluate(e => { e.click(); e.click(); });
    await page.waitForFunction(() => /Moved 60/.test(document.getElementById('tc-mv-msg').innerText));
    check(width + ' duplicate Apply writes1 exactkey', local.writes.length === 1 && local.writes[0].expected_preview === 'fixture-1');
    check(width + ' confirmation contains last row', local.dialogs.at(-1).includes(plus('2027-01-06', 59 * 7) + ' 16:30')); await f.close();
  });
  for (const mode of ['stale_preview', 'schedule_changed']) await run('manager ' + mode, async () => {
    const f = await fixture(390, mode), { page, local } = f;
    const refreshed = page.waitForResponse(async r => r.url().includes('/series-move') && !r.request().postDataJSON()?.apply && r.status() === 200 && (await r.json()).preview_key === 'fixture-2');
    await page.locator('#tc-mv-go').click(); await page.waitForFunction(() => /timetable changed/.test(document.getElementById('tc-mv-msg').innerText)); await refreshed;
    await page.waitForFunction(() => document.querySelectorAll('[data-mv-series-id]').length === 12);
    check(mode + ' new revision received', local.lastPreviewKey === 'fixture-2');
    check(mode + ' refresh has no automatic write', local.writes.length === 1 && local.dialogs.length === 1);
    await page.locator('#tc-mv-go').click(); await page.waitForFunction(() => /Moved 12/.test(document.getElementById('tc-mv-msg').innerText));
    check(mode + ' deliberate retry binds newkey', local.writes.length === 2 && local.writes[1].expected_preview === 'fixture-2' && local.dialogs.length === 2); await f.close();
  });
  await run('manager uncertain result', async () => {
    const f = await fixture(390, 'uncertain'), { page, local } = f;
    await page.locator('#tc-mv-go').click(); await page.waitForFunction(() => /uncertain/.test(document.getElementById('tc-mv-msg').innerText));
    check('uncertain write locks resend', await page.locator('#tc-mv-go').isDisabled() && local.writes.length === 1);
    await page.locator('#tc-mv-go').evaluate(e => e.click()); check('uncertain click sends no duplicate', local.writes.length === 1);
    await page.locator('#tc-mv-close').click(); check('uncertain result closes for reload', await page.locator('#tc-move-modal').count() === 0); await f.close();
  });
  await run('manager missing key', async () => {
    const f = await fixture(1360, 'missing_key'), { page, local } = f;
    await page.locator('#tc-mv-go').click(); check('missing key cannot confirm/apply', local.writes.length === 0 && local.dialogs.length === 0); await f.close();
  });
  for (const action of ['field', 'mode', 'reopen']) await run('manager late preview/' + action, async () => {
    const f = await fixture(1360), { page, local } = f;
    let release, started; const promise = new Promise(r => release = r), ready = new Promise(r => started = r); local.hold = { promise, started };
    await page.locator('#tc-mv-date').fill('2027-02-03'); await bounded('held preview reaches fixture', ready);
    if (action === 'field') await page.locator('#tc-mv-date').fill('2027-02-10');
    else if (action === 'mode') await page.locator('[data-mv-mode="postpone"]').click();
    else { await page.locator('#tc-mv-close').click(); await page.locator('[data-ta="7"]').click(); }
    const received = page.waitForResponse(r => r.url().includes('/series-move') && r.request().postDataJSON()?.new_date === '2027-02-03'); release(); await received;
    await page.evaluate(() => new Promise(done => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); c.port2.close(); done(); }; c.port2.postMessage(0); }));
    if (action === 'field') {
      await page.waitForFunction(() => document.getElementById('tc-mv-series').innerText.includes('2027-02-10 16:30'));
      await page.locator('#tc-mv-go').click(); await page.waitForFunction(() => /Moved 12/.test(document.getElementById('tc-mv-msg').innerText));
      check('late field cannot replace destination', local.writes.length === 1 && local.writes[0].new_date === '2027-02-10');
    } else {
      check('late ' + action + ' cannot show old plan', !(await page.locator('#tc-mv-series').innerText()).includes('2027-02-03'));
      check('late ' + action + ' makes no write', local.writes.length === 0);
    }
    await f.close();
  });
  for (const width of [390, 1360]) await run('student unsaved navigation/' + width, async () => {
    const f = await fixture(width, 'student_fail', 3, true), { page, local } = f;
    await page.locator('.main-card[data-mode="postpone"]').click(); await page.locator('#pushBtn').click(); await page.waitForFunction(() => state.cart.length === 1 && state.cart[0].seriesItems.length === 3);
    await page.locator('#btn-back').click(); local.accept = false; await page.locator('#screen-main .nav-home').click();
    check(width + ' student Home Cancel preserves selection', await page.evaluate(() => state.cart.length === 1 && document.getElementById('screen-main').classList.contains('active')) && page.url().includes('lesson-postpone-demo.html'));
    await page.locator('#nav-back-main').click(); check(width + ' main Back Cancel stays', page.url().includes('lesson-postpone-demo.html'));
    await page.locator('.main-card[data-mode="postpone"]').click(); check(width + ' reopen preserves full selection', await page.evaluate(() => state.cart[0].seriesItems.length === 3));
    await page.screenshot({ path: resolve(OUT, 'student-unsaved-' + width + '.png') });
    await page.locator('#confirm-btn').click(); await page.waitForFunction(() => !state.saving && document.getElementById('screen-done').classList.contains('active'));
    check(width + ' failed save is explicit', /저장되지/.test(await page.locator('#done-title').innerText()) && local.writes.length === 1);
    await page.locator('#done-again').click(); check(width + ' retry Cancel retains cart', await page.evaluate(() => state.cart.length === 1 && document.getElementById('screen-done').classList.contains('active')));
    await page.locator('#done-home').click(); check(width + ' failed Home Cancel stays', page.url().includes('lesson-postpone-demo.html'));
    local.accept = true; await page.locator('#done-again').click(); local.mode = 'student_success';
    await page.locator('.main-card[data-mode="postpone"]').click(); await page.locator('#pushBtn').click(); await page.waitForFunction(() => state.cart.length === 1);
    await page.locator('#confirm-btn').click(); await page.waitForFunction(() => !state.saving && state.completed === true);
    check(width + ' deliberate fresh retry writes once more', local.writes.length === 2);
    const dialogs = local.dialogs.length; await page.locator('#done-home').click(); await page.waitForURL(BASE + '/');
    check(width + ' success leaves without false warning', local.dialogs.length === dialogs); await f.close();
  });
  check('all11 behavior cases ran', report.cases.length === 11 && report.cases.every(c => c.status === 'passed'));
  check('no unconfigured read endpoint', report.unknownReads.length === 0);
  check('no denied outbound request', report.denied.length === 0);
  check('no unexpected mutation endpoint', report.unexpectedWrites.length === 0);
  check('no route handler errors', report.routeErrors.length === 0);
  check('no page errors', report.pageErrors.length === 0);
  console.log(`admin-schedule-consistency-browser: PASS ${passes} / FAIL 0 / SKIP 0`);
}
try { await main(); }
catch (error) {
  if (!activeCase) report.cases.push({ name: browser ? 'fixture accounting' : 'browser preflight', status: 'failed', error: String(error), stack: error.stack });
  report.failure = String(error);
  for (const context of contexts) for (const [i, page] of context.pages().entries()) {
    try { await bounded('failure screenshot', page.screenshot({ path: resolve(OUT, 'failure-' + (activeCase?.name || 'preflight').replace(/[^\w-]/g, '-') + '-' + i + '.png'), timeout: 5000 }), 6000); } catch {}
  }
  throw error;
} finally { await saveReport(); if (browser) await browser.close(); }
