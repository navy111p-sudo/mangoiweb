/**
 * Joined schedule-consumer regression: shipped teacher.html AND my-schedule.html
 * consume a real bundled Worker backed only by ephemeral SQLite/synthetic auth.
 * The production default auto-applies a resolved student change across Sunday -> Monday.
 * A separate transient SQLite decision rollback leaves a real pending request, recovered
 * by existing admin approval, then a versioned admin move. Teacher approval remains403.
 *
 * Run with the existing seven-track CI loopback-only network namespace, cleared
 * environment, pinned Playwright 1.63.0/Chromium, PW_DIR and OUTPUT_DIR. This test
 * fails (never skips) without isolation/dependencies/browser. No listener, real
 * account, provider/media call, deployment, source rewrite, or auth policy change.
 *
 * Evidence boundaries: my-schedule renders date/time/name/count, NOT schedule ID,
 * teacher ID, or room ID. Exact IDs are correlated across native browser response
 * bodies, teacher identity, and Worker admin projections. Room equality is checked
 * with the existing sessions API and the actual teacher Join button navigation;
 * the room document is intercepted before any meeting/media code can execute.
 * Admin mutations exercise the actual Worker, not admin drag UI (covered elsewhere).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScheduleWorkerFixture, BASE, STUDENT, TEACHERS, ADMIN_TOKEN, INITIAL, APPROVED, MOVED } from './schedule-consumer-worker-fixture.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(process.env.OUTPUT_DIR || '/tmp/schedule-consumer-approval-results');
const RealDate = Date;
const report = { passed: 0, failed: 0, skipped: 0, cases: [], assertions: [], requests: [], consumed: [],
  denied: [], routeErrors: [], pageErrors: [], navigations: [], browserVersion: null,
  coverage: { dom: ['student date/time/teacher display name/count', 'teacher identity/date/time/student/count/old-slot absence'],
    response: ['schedule ID', 'teacher ID via linked identity/admin projection', 'room ID via sessions/teacher projection'],
    navigation: ['actual teacher Join button room URL after automatic/manual application'],
    policy: ['current default automatic resolved student change', 'pending on actual decision rollback, then manual recovery'], excluded: ['student room/ID DOM (not shipped)', 'admin drag UI', 'meeting/media/provider execution'] } };
await mkdir(OUT, { recursive: true });
let browser, backend;
const contexts = [];
function check(name, condition, detail) {
  report.assertions.push({ name, passed: !!condition, ...(detail === undefined ? {} : { detail }) });
  if (!condition) { report.failed++; throw new Error(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail))); }
  report.passed++; console.log('PASS ' + name);
}
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function eventually(label, predicate) {
  const end = RealDate.now() + 12000;
  do { if (await predicate()) return; await sleep(40); } while (RealDate.now() < end);
  throw new Error('Timed out: ' + label);
}
async function deadline(label, promise, ms = 12000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Deadline: ' + label)), ms); })]); }
  finally { clearTimeout(timer); }
}
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'cache-control': 'no-store' } });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const allowed = new Set([
  'GET /api/teacher/portal', 'GET /api/class/schedule/mine', 'GET /api/class/sessions/today',
  'GET /api/admin/schedules', 'GET /api/admin/classes/today',
  'POST /api/class/schedule/request', 'POST /api/admin/schedule-requests/decide', 'PATCH /api/admin/class-schedules/move',
]);

async function newConsumer(role, path, publicDir) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, timezoneId: 'Asia/Seoul',
    locale: 'en-US', serviceWorkers: 'block', acceptDownloads: false });
  contexts.push(context);
  context.setDefaultTimeout(12000);
  await context.clock.setFixedTime(new RealDate(backend.now()));
  const teacher = TEACHERS[role];
  const token = teacher?.token || (role === 'admin' ? ADMIN_TOKEN : null);
  if (token) await context.addCookies([{ name: 'mango_admin_session', value: token, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  await context.addInitScript(({ origin, student, studentToken, teacher }) => {
    if (location.origin !== origin) return;
    // A loopback-only namespace reports offline. Connectivity is a fixture input,
    // not a network change; every byte still comes through fail-closed routing.
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => true });
    localStorage.setItem('mangoi_lang', 'en');
    if (student) {
      localStorage.setItem('mangoi_logged_user', JSON.stringify(student));
      localStorage.setItem('mango_token', studentToken);
    }
    if (teacher) localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: teacher.username,
      username: teacher.username, name: teacher.name, role: 'hq_teacher', server_role: 'teacher', pref_lang: 'en' }));
    // Do not clear portal localStorage: reload MUST replace previously rendered
    // stale cache after approval/move with a newly received Worker response.
  }, { origin: BASE, student: role === 'student' ? STUDENT : null, studentToken: backend.studentToken, teacher });
  await context.routeWebSocket('**/*', socket => {
    report.denied.push({ role, kind: 'websocket', url: socket.url() });
    socket.close({ code: 1008, reason: 'Isolated fixture forbids WebSockets' });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (url.origin !== BASE) { report.denied.push({ role, kind: 'external', origin: url.origin }); return await route.abort('blockedbyclient'); }
      if (request.isNavigationRequest() && url.pathname === '/' && url.searchParams.has('vc_room')) {
        report.navigations.push({ role, url: url.href });
        return await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated join destination</title><p id="join-destination">Meeting execution intentionally excluded.</p>' });
      }
      if (url.pathname.startsWith('/api/')) {
        const record = { role, method, path: url.pathname + url.search, body: request.postData() || null };
        report.requests.push(record);
        if (!allowed.has(method + ' ' + url.pathname)) {
          report.denied.push({ ...record, kind: 'unconfigured-api' });
          return await route.fulfill(json({ ok: false, error: 'isolated_fixture_unconfigured' }, 503));
        }
        // Browser cookies/headers travel unchanged through the actual Worker.
        // In particular there is no route-level role injection or successful
        // schedule stub that could conceal a broken student/teacher consumer.
        const response = await backend.fetchWorker(new Request(url.href, { method, headers: await request.allHeaders(),
          body: method === 'GET' || method === 'HEAD' ? undefined : request.postDataBuffer() }));
        const body = Buffer.from(await response.arrayBuffer());
        return await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
      }
      if (method !== 'GET' && method !== 'HEAD') { report.denied.push({ role, kind: 'unexpected-method', method, path: url.pathname }); return await route.abort('blockedbyclient'); }
      if (url.pathname === '/__consumer_control.html') return await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic administrator request client</title>' });
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) return await route.abort('blockedbyclient');
      const candidate = resolve(publicDir, '.' + decoded);
      if (!candidate.startsWith(publicDir + sep)) return await route.abort('blockedbyclient');
      let file;
      try { file = await realpath(candidate); } catch { return await route.fulfill({ status: 404, body: 'Fixture static file not found' }); }
      if (!file.startsWith(publicDir + sep)) return await route.abort('blockedbyclient');
      // Never continue a request into the network; serve unmodified checkout bytes.
      return await route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream',
        headers: { 'cache-control': 'no-store' }, body: method === 'HEAD' ? '' : await readFile(file) });
    } catch (error) {
      if (!/closed|Target page|Invalid InterceptionId|already handled|canceled/i.test(String(error))) {
        report.routeErrors.push({ role, path: url.pathname, error: String(error) });
        try { await route.abort('failed'); } catch {}
      }
    }
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push({ role, error: String(error) }));
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setBypassServiceWorker', { bypass: true });
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  const state = { role, context, page, path, latest: null };
  if (role === 'admin') await page.goto(BASE + path);
  else await readConsumer(state, 'initial load', () => page.goto(BASE + path));
  return state;
}

async function readConsumer(state, label, action) {
  const pathname = state.role === 'student' ? '/api/class/schedule/mine' : '/api/teacher/portal';
  const pending = state.page.waitForResponse(response => new URL(response.url()).pathname === pathname && response.request().method() === 'GET');
  await action();
  const response = await deadline(label + ' native browser response', pending);
  const body = await deadline(label + ' response body', response.json());
  check(state.role + ' ' + label + ': fresh native Worker response succeeds', response.status() === 200 && body.ok === true, { status: response.status(), body });
  check(state.role + ' ' + label + ': response is not from a service worker', !response.fromServiceWorker());
  state.latest = body;
  report.consumed.push({ role: state.role, label, url: response.url(), body });
  return body;
}
async function browserCall(state, method, path, body) {
  const result = await state.page.evaluate(async ({ method, path, body, student }) => {
    const headers = { 'content-type': 'application/json' };
    if (student) headers.authorization = 'Bearer ' + localStorage.getItem('mango_token');
    const response = await fetch(path, { method, credentials: 'include', headers, body: body == null ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { method, path, body, student: state.role === 'student' });
  report.consumed.push({ role: state.role, label: 'explicit native request', path, method, ...result });
  return result;
}
const shortDate = date => date.split('-').slice(1).map(Number).join('/');
function displayTime(time) { const [h, m] = time.split(':'); return ((Number(h) % 12) || 12) + ':' + m + (Number(h) < 12 ? ' AM' : ' PM'); }
const roomFor = expected => `class-${backend.scheduleId}-${expected.date.replaceAll('-', '')}`;

async function studentPresentation(state, expected, old) {
  const date = shortDate(expected.date), time = displayTime(expected.time), name = TEACHERS[expected.teacher].name;
  return state.page.evaluate(({ date, time, name, old }) => {
    const body = document.querySelector('#body'), rows = [...body.querySelectorAll('.day .row')];
    const next = body.querySelector('.next'), row = rows[0], rect = row?.getBoundingClientRect();
    const style = row && getComputedStyle(row);
    const snapshot = { count: rows.length, date: row?.querySelector('.t')?.textContent,
      who: row?.querySelector('.who')?.textContent, next: next?.innerText.trim(),
      visible: !!rect && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
      oldAbsent: !old || ![old.date, old.time, old.name].some(text => body.innerText.includes(text)) };
    snapshot.matches = snapshot.count === 1 && snapshot.date === date && snapshot.who === time + ' · ' + name
      && snapshot.next === `Next class ${date} ${time} · ${name}` && snapshot.visible && snapshot.oldAbsent;
    return snapshot;
  }, { date, time, name, old: old ? { date: shortDate(old.date), time: displayTime(old.time), name: TEACHERS[old.teacher].name } : null });
}
async function assertStudent(state, expected, label, old) {
  const teacher = TEACHERS[expected.teacher], rows = state.latest.schedules;
  check(label + ': student response contains exactly the same schedule ID', rows.length === 1 && Number(rows[0].schedule_id) === backend.scheduleId, rows);
  const row = rows[0];
  check(label + ': student response exact date/time/teacher display name', row.scheduled_date === expected.date && row.next_date === expected.date && row.start_time === expected.time && row.teacher_name === teacher.name, row);
  await eventually(label + ' student row rendered', () => state.page.locator('#body .day .row .who').allTextContents().then(texts => texts.length === 1 && texts[0] === displayTime(expected.time) + ' · ' + teacher.name));
  check(label + ': student visible single row date/time/name', await state.page.locator('#body .day .row').count() === 1
    && (await state.page.locator('#body .day .row .t').textContent()) === shortDate(expected.date)
    && await state.page.locator('#body .day .row').isVisible());
  check(label + ': student Next class agrees with row', (await state.page.locator('#body .next').innerText()).trim() === `Next class ${shortDate(expected.date)} ${displayTime(expected.time)} · ${teacher.name}`);
  if (old) {
    const text = await state.page.locator('#body').innerText();
    check(label + ': previous student date/time/name disappear', !text.includes(shortDate(old.date)) && !text.includes(displayTime(old.time)) && !text.includes(TEACHERS[old.teacher].name), text);
  }
  const presentation = await studentPresentation(state, expected, old);
  check(label + ': complete student presentation oracle agrees', presentation.matches, presentation);
}
async function presentationNegativeControls(student) {
  // Presentation-only negative controls alter live DOM, never source files,
  // Worker state, API results, permissions, or network routing. The SAME oracle
  // used above must reject both plausible stale renderings; real reload repairs.
  await student.page.locator('#body .day .row .who').evaluate((el, name) => {
    el.textContent = el.textContent.replace('CONSUMER BETA', name);
  }, TEACHERS.alpha.name);
  let snapshot = await studentPresentation(student, APPROVED, INITIAL);
  check('negative control rejects stale visible teacher name with correct API data', !snapshot.matches && snapshot.who.includes(TEACHERS.alpha.name), snapshot);
  await readConsumer(student, 'restore after stale-name negative control', () => student.page.reload());
  await assertStudent(student, APPROVED, 'restored after stale name', INITIAL);
  await student.page.locator('#body .day .row').evaluate((el, old) => {
    const clone = el.cloneNode(true);
    clone.querySelector('.t').textContent = old.date;
    clone.querySelector('.who').textContent = old.time + ' · ' + old.name;
    el.parentElement.appendChild(clone);
  }, { date: shortDate(INITIAL.date), time: displayTime(INITIAL.time), name: TEACHERS.alpha.name });
  snapshot = await studentPresentation(student, APPROVED, INITIAL);
  check('negative control rejects retained old visible slot beside correct new slot', !snapshot.matches && snapshot.count === 2 && !snapshot.oldAbsent, snapshot);
  await readConsumer(student, 'restore after old-slot negative control', () => student.page.reload());
  await assertStudent(student, APPROVED, 'restored after retained slot', INITIAL);
}
async function assertTeacher(state, expected, present, label, today = false) {
  const body = state.latest, teacher = TEACHERS[state.role];
  check(label + ': actual teacher identity ID and display name', body.me.username === teacher.username && body.me.name === teacher.name
    && body.me.linked_teacher_ids.map(String).includes(teacher.id) && body.me.identity_unlinked === false && body.me.identity_ambiguous === false, body.me);
  await eventually(label + ' teacher identity rendered', () => state.page.locator('#hi').innerText().then(text => text.includes(teacher.name)));
  const items = body.week.days.flatMap(day => day.items.map(item => ({ ...item, date: day.date })));
  check(label + ': exact weekly schedule IDs/date/time/count', present
    ? items.length === 1 && Number(items[0].id) === backend.scheduleId && items[0].date === expected.date && items[0].start_time === expected.time
    : items.length === 0, items);
  await eventually(label + ' teacher weekly DOM', async () => {
    if (await state.page.locator('#week .wk-i').count() !== (present ? 1 : 0)) return false;
    if ((await state.page.locator('#wk-range').textContent()) !== `(${body.week.start} ~ ${body.week.end})`) return false;
    return !present || (await state.page.locator('#week .wk-i b').textContent()) === expected.time;
  });
  check(label + ': teacher week visibly shows the exact range', (await state.page.locator('#wk-range').textContent()) === `(${body.week.start} ~ ${body.week.end})`);
  if (present) {
    const day = state.page.locator('#week .wk-day').filter({ has: state.page.locator('.wk-i') });
    check(label + ': visible teacher date/student/time row', (await day.locator('.wk-d').textContent()).startsWith(expected.date.slice(5))
      && (await day.locator('.wk-i').innerText()).includes(STUDENT.name) && await day.locator('.wk-i').isVisible());
  } else check(label + ': old teacher has no visible moved weekly occurrence', await state.page.locator('#week .wk-i').count() === 0);
  if (today) {
    check(label + ': exact today class schedule ID/room/time/name', present
      ? body.classes.length === 1 && Number(body.classes[0].schedule_id) === backend.scheduleId
        && body.classes[0].room_id === roomFor(expected) && body.classes[0].start_time === expected.time && body.classes[0].teacher_name === teacher.name
      : body.classes.length === 0, body.classes);
    await eventually(label + ' today row rendered', async () => (await state.page.locator('#today').textContent()) === body.today + ' (KST)'
      && await state.page.locator('#classes [data-join]').count() === (present ? 1 : 0)
      && await state.page.locator('#classes .cls').count() === (present ? 1 : 0));
    check(label + ': total today rows exclude stale disabled or non-join classes', await state.page.locator('#classes .cls').count() === (present ? 1 : 0));
    if (present) {
      const row = state.page.locator('#classes .cls');
      check(label + ': teacher today visible date/time/student row', await row.isVisible()
        && (await state.page.locator('#today').textContent()) === expected.date + ' (KST)'
        && (await row.locator('.cls-time').textContent()) === expected.time
        && (await row.locator('.cls-name').innerText()).includes(STUDENT.name));
    } else {
      const text = await state.page.locator('#classes').innerText();
      check(label + ': no unwrapped stale student/time in empty today card', !text.includes(STUDENT.name) && !text.includes(expected.time), text);
    }
  }
}
async function adminProjection(admin, expected, label) {
  const response = await browserCall(admin, 'GET', '/api/admin/schedules?week=2026-10-05');
  const rows = Array.isArray(response.body) ? response.body : response.body.items || response.body.schedules || [];
  check(label + ': authoritative admin weekly response matches ID/date/time/teacher ID', response.status === 200 && rows.length === 1
    && Number(rows[0].id) === backend.scheduleId && rows[0].date === expected.date && rows[0].start_time === expected.time
    && String(rows[0].teacher_id) === TEACHERS[expected.teacher].id, response);
}
async function screenshot(state, label) {
  await state.page.screenshot({ path: resolve(OUT, label + '-' + state.role + '.png'), fullPage: true });
}
async function setDay(date, time, states) {
  backend.setNow(date, time);
  for (const state of states) await state.context.clock.setFixedTime(new RealDate(backend.now()));
}
async function joinAndCompare(teacher, student, expected, label) {
  const sessions = await browserCall(student, 'GET', '/api/class/sessions/today?user_id=' + STUDENT.uid);
  const rows = sessions.body.sessions || [];
  check(label + ': student sessions and teacher response share exact schedule/room/timestamp', sessions.status === 200 && rows.length === 1
    && Number(rows[0].schedule_id) === backend.scheduleId && rows[0].room_id === roomFor(expected)
    && rows[0].start_ts === teacher.latest.classes[0].start_ts, sessions);
  await teacher.page.locator('#classes [data-join]').click();
  await teacher.page.waitForURL(url => url.searchParams.get('vc_room') === roomFor(expected));
  const destination = new URL(teacher.page.url());
  check(label + ': actual teacher Join button reaches the same final room and name', destination.searchParams.get('vc_role') === 'teacher'
    && destination.searchParams.get('vc_autojoin') === '1' && destination.searchParams.get('vc_name') === '교사 ' + TEACHERS[expected.teacher].name
    && await teacher.page.locator('#join-destination').isVisible(), destination.href);
  await readConsumer(teacher, label + ' reopen after Join', () => teacher.page.goto(BASE + teacher.path));
  await assertTeacher(teacher, expected, true, label + ' reopened teacher', true);
}

async function automaticStudentConsumerCase(publicDir) {
  const student = await newConsumer('student', '/my-schedule.html', publicDir);
  const alpha = await newConsumer('alpha', '/teacher.html', publicDir);
  const beta = await newConsumer('beta', '/teacher.html', publicDir);
  const admin = await newConsumer('admin', '/__consumer_control.html', publicDir);
  const states = [student, alpha, beta, admin];
  const navigationStart = report.navigations.length;
  await assertStudent(student, INITIAL, 'automatic initial');
  await assertTeacher(alpha, INITIAL, true, 'automatic initial assigned teacher', true);
  await assertTeacher(beta, INITIAL, false, 'automatic initial other teacher', true);
  const submitted = await browserCall(student, 'POST', '/api/class/schedule/request', {
    schedule_id: backend.scheduleId, request_type: 'change', new_date: APPROVED.date,
    new_time: APPROVED.time, teacher_id: TEACHERS.beta.id,
  });
  check('current default immediately approves resolved student change', submitted.status === 200
    && submitted.body.ok === true && Number.isInteger(submitted.body.id)
    && submitted.body.status === 'approved' && submitted.body.auto_applied === 'moved', submitted);
  const request = backend.requestRow(submitted.body.id);
  check('automatic request persisted as approved without injected fault or admin decision', request.status === 'approved'
    && /자동승인/.test(request.decided_by) && backend.faults.length === 0
    && backend.row().scheduled_date === APPROVED.date && backend.row().start_time === APPROVED.time
    && String(backend.row().teacher_id) === TEACHERS.beta.id, request);
  const alphaCache = await alpha.page.evaluate(() => JSON.parse(localStorage.getItem('mangoi_teacher_portal_v1')));
  check('automatic reload starts with old same-Sunday teacher cache', alphaCache.today === INITIAL.date
    && alphaCache.classes.length === 1 && alphaCache.classes[0].room_id === roomFor(INITIAL));
  await readConsumer(alpha, 'reload after automatic application with stale cache', () => alpha.page.reload());
  await assertTeacher(alpha, INITIAL, false, 'automatic application removes cached old slot', true);
  await adminProjection(admin, APPROVED, 'automatic application');
  await readConsumer(student, 'reload after automatic application', () => student.page.reload());
  await assertStudent(student, APPROVED, 'automatic application', INITIAL);
  await readConsumer(beta, 'next week after automatic application', () => beta.page.locator('#wk-next').click());
  await assertTeacher(beta, APPROVED, true, 'automatic application crosses week and teacher');
  await screenshot(student, 'automatic'); await screenshot(alpha, 'automatic-old-slot'); await screenshot(beta, 'automatic-new-week');
  await setDay(APPROVED.date, '09:30', states);
  for (const state of [student, alpha, beta]) await readConsumer(state, 'automatic Monday reload', () => state.page.reload());
  await assertStudent(student, APPROVED, 'automatic Monday student');
  await assertTeacher(alpha, APPROVED, false, 'automatic Monday old teacher', true);
  await assertTeacher(beta, APPROVED, true, 'automatic Monday new teacher', true);
  await joinAndCompare(beta, student, APPROVED, 'automatic room');
  check('automatic student request reaches one exact final-date teacher Join URL', report.navigations.length === navigationStart + 1
    && new URL(report.navigations[navigationStart].url).searchParams.get('vc_room') === roomFor(APPROVED));
  check('automatic consumer flow attempts no provider calls', backend.outbound.length === 0, backend.outbound);
  report.cases.push({ name: 'automatic-student-change-updates-projections-cache-and-room', passed: true });
  for (const state of states) {
    await deadline('automatic context cleanup', state.context.close(), 5000);
    contexts.splice(contexts.indexOf(state.context), 1);
  }
  await backend.close(); backend = null;
}

try {
  // Identical fail-closed safety boundary to admin-repairs-offline-browser.mjs.
  const interfaces = (await readFile('/proc/self/net/dev', 'utf8')).trim().split('\n').slice(2).map(line => line.trim().split(':')[0]).sort();
  check('namespace contains ONLY loopback', JSON.stringify(interfaces) === '["lo"]', interfaces);
  const routes = (await readFile('/proc/net/route', 'utf8')).trim().split('\n').slice(1);
  check('namespace has no IPv4 default route', !routes.some(line => line.trim().split(/\s+/)[1] === '00000000'));
  const v6 = (await readFile('/proc/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean);
  check('namespace has no usable IPv6 default route', !v6.some(line => { const fields = line.trim().split(/\s+/); return fields[0] === '0'.repeat(32) && fields[1] === '00' && !(parseInt(fields[8], 16) & 0x200); }));
  assert(process.env.PW_DIR, 'PW_DIR must identify the existing pinned tool installation');
  const require = createRequire(import.meta.url);
  const pkg = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core/package.json'));
  check('Playwright version is exactly 1.63.0', pkg.version === '1.63.0');
  const { chromium } = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core'));
  const publicDir = await realpath(resolve(ROOT, 'cloudflare-deploy/public'));
  backend = await createScheduleWorkerFixture();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  report.browserVersion = browser.version();
  await automaticStudentConsumerCase(publicDir);
  backend = await createScheduleWorkerFixture();
  const manualNavigationStart = report.navigations.length;
  const student = await newConsumer('student', '/my-schedule.html', publicDir);
  const alpha = await newConsumer('alpha', '/teacher.html', publicDir);
  const beta = await newConsumer('beta', '/teacher.html', publicDir);
  const admin = await newConsumer('admin', '/__consumer_control.html', publicDir);
  const states = [student, alpha, beta, admin];
  await assertStudent(student, INITIAL, 'initial');
  await assertTeacher(alpha, INITIAL, true, 'initial assigned teacher', true);
  await assertTeacher(beta, INITIAL, false, 'initial other teacher', true);

  const initialRow = backend.row();
  backend.failNextDecisionTransaction(); // A real transaction rollback, not an automatic-apply policy override.
  const submitted = await browserCall(student, 'POST', '/api/class/schedule/request', { schedule_id: backend.scheduleId,
    request_type: 'change', new_date: APPROVED.date, new_time: APPROVED.time, teacher_id: TEACHERS.beta.id });
  check('transient decision failure leaves one actual pending student request', submitted.status === 200
    && submitted.body.ok === true && Number.isInteger(submitted.body.id) && submitted.body.status === 'pending'
    && submitted.body.auto_applied === null && submitted.body.auto_reason === 'apply_failed', submitted);
  check('injected decision failure rolled back schedule and was consumed exactly once', JSON.stringify(backend.row()) === JSON.stringify(initialRow)
    && backend.faults.length === 1 && backend.faults[0].stage === 'before_commit', backend.faults);
  const decision = { id: submitted.body.id, action: 'approve' };
  const denied = await browserCall(beta, 'POST', '/api/admin/schedule-requests/decide', decision);
  check('existing teacher approval policy remains HTTP 403', denied.status === 403, denied);
  check('teacher denial leaves schedule unchanged and request pending', JSON.stringify(backend.row()) === JSON.stringify(initialRow) && backend.requestRow(decision.id).status === 'pending');
  const approved = await browserCall(admin, 'POST', '/api/admin/schedule-requests/decide', decision);
  check('existing admin decision actually applies request', approved.status === 200 && approved.body.applied === 'moved' && backend.requestRow(decision.id).status === 'approved', approved);
  const alphaCache = await alpha.page.evaluate(() => JSON.parse(localStorage.getItem('mangoi_teacher_portal_v1')));
  check('approval reload begins with old same-Sunday teacher cache', alphaCache.today === INITIAL.date && alphaCache.classes.length === 1
    && Number(alphaCache.classes[0].schedule_id) === backend.scheduleId && alphaCache.classes[0].room_id === roomFor(INITIAL));
  await readConsumer(alpha, 'same-Sunday reload after approval with stale cache', () => alpha.page.reload());
  await assertTeacher(alpha, INITIAL, false, 'approval removes old cached Sunday slot', true);
  await adminProjection(admin, APPROVED, 'approved');
  await readConsumer(student, 'reload after approval', () => student.page.reload());
  await assertStudent(student, APPROVED, 'approved', INITIAL);
  await readConsumer(beta, 'next week after approval', () => beta.page.locator('#wk-next').click());
  await assertTeacher(beta, APPROVED, true, 'approval appears across week boundary');
  await screenshot(student, 'approved'); await screenshot(alpha, 'approved-old-slot'); await screenshot(beta, 'approved-new-week');
  await presentationNegativeControls(student);
  report.cases.push({ name: 'student-request-existing-admin-approval-crosses-week-and-teacher', passed: true, pendingCause: 'decision-transaction-rollback' });

  await setDay(APPROVED.date, '09:30', states);
  for (const state of [student, alpha, beta]) await readConsumer(state, 'Monday reload', () => state.page.reload());
  await assertStudent(student, APPROVED, 'Monday student');
  await assertTeacher(alpha, APPROVED, false, 'Monday old teacher', true);
  await assertTeacher(beta, APPROVED, true, 'Monday approved teacher', true);
  await joinAndCompare(beta, student, APPROVED, 'approved room');

  const moved = await browserCall(admin, 'PATCH', '/api/admin/class-schedules/move', { ids: [backend.scheduleId],
    expected: { [backend.scheduleId]: backend.version() }, source_date: APPROVED.date,
    destination_date: MOVED.date, start_time: MOVED.time, teacher_id: TEACHERS.alpha.id });
  check('versioned admin move changes the same schedule exactly once', moved.status === 200 && moved.body.count === 1
    && backend.row().scheduled_date === MOVED.date && backend.row().start_time === MOVED.time && String(backend.row().teacher_id) === TEACHERS.alpha.id, moved);
  const betaCache = await beta.page.evaluate(() => JSON.parse(localStorage.getItem('mangoi_teacher_portal_v1')));
  check('admin-move reload begins with old same-Monday teacher cache', betaCache.today === APPROVED.date && betaCache.classes.length === 1
    && Number(betaCache.classes[0].schedule_id) === backend.scheduleId && betaCache.classes[0].room_id === roomFor(APPROVED));
  await readConsumer(beta, 'same-Monday reload after admin move with stale cache', () => beta.page.reload());
  await assertTeacher(beta, APPROVED, false, 'admin move removes old cached Monday slot', true);
  await adminProjection(admin, MOVED, 'admin moved');
  await readConsumer(student, 'reload after admin move', () => student.page.reload());
  await assertStudent(student, MOVED, 'admin moved', APPROVED);
  await readConsumer(alpha, 'Refresh after admin move', () => alpha.page.locator('#reload').click());
  await assertTeacher(alpha, MOVED, true, 'admin move new teacher Tuesday slot');
  await screenshot(student, 'admin-moved'); await screenshot(beta, 'admin-moved-old-slot'); await screenshot(alpha, 'admin-moved-new-slot');

  await setDay(MOVED.date, '11:10', states);
  for (const state of [student, alpha, beta]) await readConsumer(state, 'Tuesday reload with prior cache', () => state.page.reload());
  await assertStudent(student, MOVED, 'Tuesday student');
  await assertTeacher(beta, MOVED, false, 'Tuesday previous teacher remains empty', true);
  await assertTeacher(alpha, MOVED, true, 'Tuesday moved teacher', true);
  await joinAndCompare(alpha, student, MOVED, 'admin-moved room');
  check('approved and moved Join destinations use distinct final-date rooms', report.navigations.length === manualNavigationStart + 2
    && new URL(report.navigations[manualNavigationStart].url).searchParams.get('vc_room') === roomFor(APPROVED)
    && new URL(report.navigations[manualNavigationStart + 1].url).searchParams.get('vc_room') === roomFor(MOVED));
  report.cases.push({ name: 'versioned-admin-move-refresh-reload-old-slot-removal-and-join', passed: true });
  check('no attempted Worker provider or external fetches', backend.outbound.length === 0, backend.outbound);
  check('no unexpected browser mutations', !report.denied.some(item => item.kind === 'unexpected-method' || item.kind === 'unconfigured-api' && !['GET', 'HEAD'].includes(item.method)), report.denied);
  check('no route handler errors', report.routeErrors.length === 0, report.routeErrors);
  check('no uncaught page errors', report.pageErrors.length === 0, report.pageErrors);
} catch (error) {
  if (!report.failed) report.failed++;
  report.cases.push({ name: 'joined-schedule-consumer-flow', passed: false, error: String(error), stack: error.stack });
  console.error(String(error));
  for (const [i, context] of contexts.entries()) for (const [j, page] of context.pages().entries()) {
    try { await deadline('failure screenshot', page.screenshot({ path: resolve(OUT, `failure-${i}-${j}.png`), timeout: 4000 }), 5000); } catch {}
  }
} finally {
  for (const context of contexts) { try { await deadline('context cleanup', context.close(), 5000); } catch (error) { report.failed++; report.routeErrors.push({ cleanup: String(error) }); } }
  if (browser) { try { await deadline('browser cleanup', browser.close(), 5000); } catch (error) { report.failed++; report.routeErrors.push({ cleanup: String(error) }); } }
  if (backend) await backend.close();
  await writeFile(resolve(OUT, 'fixture-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`schedule-consumer-approval-browser: PASS ${report.passed} / FAIL ${report.failed} / SKIP 0`);
  process.exitCode = report.failed ? 1 : 0;
}
