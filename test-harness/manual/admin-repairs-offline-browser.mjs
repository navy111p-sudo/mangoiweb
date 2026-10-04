/**
 * Real Chromium, shipped HTML/CSS/JS, synthetic fixtures only. See the companion
 * admin-repairs-offline-browser.yml workflow. No HTTP server, Wrangler, bindings,
 * account credentials, production requests, source rewriting, or passing skips.
 * The process MUST be in a fresh network namespace containing only loopback.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = await realpath(resolve(ROOT, 'cloudflare-deploy/public'));
const OUT = resolve(process.env.OFFLINE_BROWSER_OUTPUT || '/tmp/admin-repairs-offline-results');
const BASE = 'http://127.0.0.1:18763'; // Synthetic origin: nothing listens here.
const PIN = '1.63.0';
const NOW = '2026-10-04T15:05:00Z'; // Monday in KST, Sunday in UTC/LA/Manila.
const delay = ms => new Promise(r => setTimeout(r, ms));
async function deadline(label, promise, milliseconds = 12000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Real-time deadline exceeded: ' + label)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
let passes = 0, failures = 0;
const report = { browserVersion: null, assertions: [], cases: [], requests: [], denied: [], pageErrors: [] };
await mkdir(OUT, { recursive: true });
async function writeReport() {
  report.passes = passes; report.failures = failures;
  await deadline('write fixture report', writeFile(resolve(OUT, 'fixture-report.json'), JSON.stringify(report, null, 2) + '\n'), 5000);
}

function check(name, condition, detail) {
  report.assertions.push({ name, passed: !!condition, ...(detail === undefined ? {} : { detail }) });
  if (!condition) { failures++; console.error('FAIL ' + name, detail ?? ''); throw new Error(name); }
  passes++; console.log('PASS ' + name);
}
async function eventually(name, predicate, timeout = 12000) {
  const end = Date.now() + timeout;
  let value;
  do { value = await predicate(); if (value) return value; await delay(40); } while (Date.now() < end);
  throw new Error('Timed out: ' + name);
}
function json(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'cache-control': 'no-store' } };
}
function hold() { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; }
async function waitHeld(latch, request) { latch.request = request; await latch.promise; }
async function releaseResponse(page, latch) {
  assert(latch.request, 'Held request must reach the fixture before release');
  console.log('WAIT held response/body: ' + latch.request.url());
  const responsePromise = page.waitForResponse(response => response.request() === latch.request);
  latch.release();
  const response = await responsePromise;
  const marker = latch.request.headers()['x-offline-fixture-request'];
  assert(marker, 'Held response must have a native-fetch observer marker');
  // load() correctly ignores stale responses before reading r.json(). Chromium
  // need not finish such an unused response body; response.finished() can hang.
  // The observer drains a clone without delaying/replacing the application's
  // original Response, proving the actual response arrived and its bytes were read.
  await deadline('held response clone body: ' + response.url(), eventually('native response clone consumed', () =>
    page.evaluate(id => window.__fixtureResponses[id]?.bodyComplete === true, marker)));
  // Drain renderer work after the complete body arrives. A fixed Node sleep can
  // pass too early; virtual rAF can wait indefinitely. MessageChannel provides
  // actual renderer task turns independent of installed fake clocks/visibility.
  await deadline('held-response renderer drain', page.evaluate(() => new Promise(done => {
    const channel = new MessageChannel(); let turns = 0;
    channel.port1.onmessage = () => {
      if (++turns === 2) { channel.port1.close(); channel.port2.close(); done(); }
      else channel.port2.postMessage(null);
    };
    channel.port2.postMessage(null);
  })));
}
async function advanceClock(page, milliseconds, label) {
  console.log('WAIT clock: ' + label);
  await deadline('clock: ' + label, page.clock.fastForward(milliseconds));
}
function dayPlus(day, count) { return new Date(Date.parse(day + 'T00:00:00Z') + count * 86400000).toISOString().slice(0, 10); }
function monday(instant) {
  const d = new Date(Date.parse(instant) + 9 * 3600000);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
function identity(uid = 'fixture_admin', name = 'Fixture Admin', role = 'hq') {
  // /me uses auth-admin.ts resolveRole: HQ scope => "hq", teacher scope =>
  // "teacher". Login's separately named ui_role is hq_mgr/hq_teacher instead.
  assert(['hq', 'teacher'].includes(role), 'Use an actual /api/admin/me role');
  const label = role === 'teacher' ? '교사' : '본사 · 경영진';
  return { ok: true, role, roleLabel: label, scope: { type: role, value: null, label },
    user: { username: uid, name, email: '', phone: '' }, also_account: null };
}

// Refuse even a local manual run in a network-capable namespace. Reading the
// kernel's interfaces/routes is independent of any test-only environment flag.
// /proc/self/net is attached to this process's network namespace. Do not use
// /sys/class/net: an inherited sysfs mount can describe the original namespace.
const interfaces = (await readFile('/proc/self/net/dev', 'utf8')).trim().split('\n').slice(2)
  .map(line => line.trim().split(':')[0]).sort();
check('namespace contains ONLY loopback', JSON.stringify(interfaces) === '["lo"]', interfaces);
const routes = (await readFile('/proc/net/route', 'utf8')).trim().split('\n').slice(1);
check('namespace has no IPv4 default route', !routes.some(line => line.trim().split(/\s+/)[1] === '00000000'));
const v6routes = (await readFile('/proc/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean);
check('namespace has no usable IPv6 default route', !v6routes.some(line => {
  const f = line.trim().split(/\s+/);
  // Linux has unreachable default sentinels (RTF_REJECT=0x200); these are safe.
  return f[0] === '0'.repeat(32) && f[1] === '00' && !(parseInt(f[8], 16) & 0x200);
}));
assert(process.env.PW_DIR, 'PW_DIR must point to the isolated pinned tool installation');
const require = createRequire(import.meta.url);
const pkg = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core/package.json'));
check('Playwright version is exactly ' + PIN, pkg.version === PIN);
const { chromium } = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core'));
// Missing browser/launch errors intentionally fail; do not import manual/_pw.mjs.
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
report.browserVersion = browser.version();
console.log('Chromium ' + report.browserVersion);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
const openContexts = new Set();
async function fixture(name, api, { width = 1280, timezoneId = 'Asia/Seoul', instant = NOW, clock = false, identityProbe = false, teacherIdentity = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId, locale: 'en-US',
    serviceWorkers: 'block', acceptDownloads: false });
  openContexts.add(context);
  context.setDefaultTimeout(12000);
  if (clock) await context.clock.install({ time: new Date(instant) });
  else await context.clock.setFixedTime(new Date(instant));
  const state = { name, context, page: null, apiRequests: [], unexpectedMethods: [], routeErrors: [], otherMe: 0 };
  await context.addInitScript(({ identityProbe, teacherIdentity, fixtureOrigin }) => {
    // newPage's initial about:blank has an opaque origin and no localStorage.
    // Apply fixtures only to the routed synthetic origin, not opaque documents.
    if (location.origin !== fixtureOrigin) return;
    if (teacherIdentity) {
      // Chromium reports the real loopback-only namespace as offline even after
      // Playwright's offline(false). Model connectivity as fixture input without
      // changing OS networking or production source. Tests also exercise false.
      let online = true;
      Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => online });
      window.__fixtureSetOnline = value => {
        online = !!value;
        window.dispatchEvent(new Event(online ? 'online' : 'offline'));
      };
    }
    // Only synthetic state used to enter the shipped administrator UI. No saved
    // server identity: the identity module must obtain its own fixture response.
    // resolveUiIdentity assigns ordinary synthetic HQ names hq_mgr. Executive
    // hq_exec is reserved for the actual admin/hq_exec/exec username convention.
    const session = teacherIdentity
      ? { uid: 'fixture_teacher', username: 'fixture_teacher', name: 'Fixture Teacher', role: 'hq_teacher', server_role: 'teacher', pref_lang: 'en' }
      : { uid: 'fixture_admin', username: 'fixture_admin', name: 'Fixture Admin', role: 'hq_mgr', server_role: 'hq', pref_lang: 'ko' };
    if (!localStorage.getItem('mangoi_admin_session')) localStorage.setItem('mangoi_admin_session', JSON.stringify(session));
    // adm-q9 otherwise creates this cosmetic key during boot, which changes the
    // identity module's captured stamp. This is explicitly NOT server-verified.
    if (!localStorage.getItem('admin_session')) localStorage.setItem('admin_session', JSON.stringify(session));
    localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
    localStorage.setItem('mangoi_lang', 'ko');
    window.__offlineStorageEvents = [];
    addEventListener('storage', event => window.__offlineStorageEvents.push({ key: event.key, trusted: event.isTrusted }));
    if (identityProbe || teacherIdentity) {
      let requestSequence = 0;
      window.__fixtureResponses = Object.create(null);
      const original = window.fetch;
      window.fetch = function(input, init) {
        const url = typeof input === 'string' ? input : input.url;
        const path = new URL(url, location.href).pathname;
        const identityRequest = identityProbe && path === '/api/admin/me';
        const portalRequest = teacherIdentity && path === '/api/teacher/portal';
        if (!identityRequest && !portalRequest) return original.apply(this, arguments);
        const own = identityRequest && /\/js\/adm-identity\.js(?:\?|:)/.test(new Error().stack || '');
        const options = { ...init, headers: new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)) };
        if (identityRequest) options.headers.set('x-offline-fixture-caller', own ? 'identity' : 'other');
        const marker = String(++requestSequence);
        options.headers.set('x-offline-fixture-request', marker);
        const observed = window.__fixtureResponses[marker] = { received: false, bodyComplete: false };
        // Exercise the documented defense against fetch wrappers that ignore
        // AbortSignal. This still uses native fetch and real routed responses.
        if (own) delete options.signal;
        return original.call(this, input, options).then(response => {
          observed.received = true;
          response.clone().arrayBuffer().then(() => { observed.bodyComplete = true; }, error => { observed.error = String(error); });
          return response; // Do not wait for the clone or change the application's body.
        }, error => { observed.error = String(error); throw error; });
      };
    }
  }, { identityProbe, teacherIdentity, fixtureOrigin: BASE });
  await context.routeWebSocket('**/*', ws => {
    report.denied.push({ case: name, kind: 'websocket', origin: new URL(ws.url()).origin });
    ws.close({ code: 1008, reason: 'Offline fixture: WebSockets forbidden' });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (url.origin !== BASE) {
        report.denied.push({ case: name, kind: 'nonlocal', origin: url.origin });
        return await route.abort('blockedbyclient');
      }
      if (url.pathname.startsWith('/api/')) {
        const record = { case: name, method, path: url.pathname + url.search,
          caller: request.headers()['x-offline-fixture-caller'] || '', body: request.postData() || null };
        state.apiRequests.push(record); report.requests.push(record);
        const response = await api({ request, url, method, record, state });
        if (response) return await route.fulfill(response);
        // Unknown reads fail closed with a fixture error. The large shipped
        // dashboard contains unrelated cards: their denied reads are logged,
        // never answered with invented successful business data.
        report.denied.push({ case: name, kind: 'unconfigured-api', method, path: url.pathname });
        if (method !== 'GET' && method !== 'HEAD') state.unexpectedMethods.push(record);
        return await route.fulfill(json({ ok: false, error: 'offline_fixture_not_configured' }, 503));
      }
      if (method !== 'GET' && method !== 'HEAD') {
        state.unexpectedMethods.push({ method, path: url.pathname });
        return await route.abort('blockedbyclient');
      }
      if (url.pathname === '/__offline_storage.html') return await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Offline storage peer</title>' });
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(part => part === '..')) return await route.abort('blockedbyclient');
      const candidate = resolve(PUBLIC, '.' + decoded);
      if (!candidate.startsWith(PUBLIC + sep)) return await route.abort('blockedbyclient');
      let file;
      try { file = await realpath(candidate); } catch { return await route.fulfill({ status: 404, body: 'Offline static file not found' }); }
      if (!file.startsWith(PUBLIC + sep)) return await route.abort('blockedbyclient');
      // Never route.continue(): every byte comes from this checkout or fixtures.
      return await route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream',
        body: method === 'HEAD' ? '' : await readFile(file), headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      // Closing a context or an intentionally canceled native request may make
      // fulfill fail. All other failures are surfaced by the case's assertions.
      if (!/closed|Target page|Invalid InterceptionId|already handled|canceled/i.test(String(error))) {
        state.routeErrors.push(String(error));
        try { await route.abort('failed'); } catch {}
      }
    }
  });
  context.on('page', page => page.on('pageerror', error => report.pageErrors.push({ case: name, message: String(error) })));
  state.page = await context.newPage();
  state.close = async () => { await deadline('context cleanup: ' + name, context.close(), 10000); openContexts.delete(context); };
  return state;
}
async function screenshot(state, label = state.name) {
  await state.page.screenshot({ path: resolve(OUT, label.replace(/[^\w-]/g, '-') + '.png'), fullPage: false });
}
async function finish(state) {
  check(state.name + ': no unconfigured mutation methods', state.unexpectedMethods.length === 0, state.unexpectedMethods);
  check(state.name + ': no route handler errors', state.routeErrors.length === 0, state.routeErrors);
  await screenshot(state);
  await state.close();
}
async function run(name, fn) {
  console.log('\nCASE ' + name);
  const before = failures;
  try { await deadline('case ' + name, fn(), 90000); report.cases.push({ name, passed: true }); }
  catch (error) {
    if (failures === before) failures++;
    report.cases.push({ name, passed: false, error: String(error), stack: error.stack });
    console.error('CASE FAILED ' + name + '\n' + error.stack);
    await writeReport(); // Persist the failing phase before potentially broken UI cleanup.
    for (const context of openContexts) {
      for (const [i, page] of context.pages().entries()) {
        try { await deadline('failure screenshot: ' + name, page.screenshot({ path: resolve(OUT, 'failure-' + name + '-' + i + '.png'), timeout: 5000 }), 6000); }
        catch (error) { console.error('Failure screenshot unavailable: ' + String(error)); }
      }
      // If cleanup fails, abort this run as failed rather than letting a live
      // previous case mutate state during later cases or hang report delivery.
      await deadline('failed-case context cleanup: ' + name, context.close(), 10000);
    }
    openContexts.clear();
  }
  await writeReport();
}
async function topmost(page, selector) {
  return page.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { hittable: r.width > 0 && r.height > 0 && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && !!top && (top === el || el.contains(top)),
      width: r.width, height: r.height, right: r.right, viewport: innerWidth };
  });
}
async function savedFeedbackLayout(page) {
  return page.evaluate(() => {
    const undo = document.querySelector('.undo-toast.show');
    const message = Array.from(document.querySelectorAll('.dnd-toast.ok.show'))
      .find(el => /이동됨|Moved to/.test(el.textContent || ''));
    if (!undo || !message) return { found: false };
    const a = undo.getBoundingClientRect(), b = message.getBoundingClientRect();
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const rect = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    return { found: true, overlapArea: w * h, gap: b.top - a.bottom,
      undo: rect(a), savedMessage: rect(b), viewport: { width: innerWidth, height: innerHeight } };
  });
}
async function checkSavedFeedback(page, label) {
  let layout;
  // Allow the measured-layout observer one rendering turn, but require both
  // toasts to be present. A toast disappearing cannot turn an overlap into PASS.
  await eventually(label + ': saved feedback layout settles', async () => {
    layout = await savedFeedbackLayout(page);
    return layout.found && layout.overlapArea === 0 && layout.gap >= 0;
  }, 1000);
  check(label + ': undo and saved feedback do not overlap', layout.found && layout.overlapArea === 0 && layout.gap >= 0, layout);
  check(label + ': separated undo button remains unobstructed', (await topmost(page, '.undo-toast.show button')).hittable);
}

async function weekly(width) {
  const ids = [71001, 71002, 71003], day = '2026-10-06';
  let revision = 1, blocked = null, conflict = false;
  const rows = ids.map((id, i) => ({ id, move_version: 'fixture-v1-' + id, teacher_id: '24', date: day,
    start_time: '14:00', type: '1on1', duration_min: 20, origin: 'class', move_field: 'scheduled_date',
    students: [{ name: 'Fixture Student ' + (i + 1), uid: 'fixture_student_' + i }] }));
  const moves = [];
  const state = await fixture('weekly-' + width, async ({ url, method, request }) => {
    if (method === 'GET' && url.pathname === '/api/admin/teachers') return json([
      { id: '24', name: 'Fixture Teacher A', name_en: 'Fixture Teacher A', category: 'office' },
      { id: '25', name: 'Fixture Teacher B', name_en: 'Fixture Teacher B', category: 'office' }
    ]);
    if (method === 'GET' && url.pathname === '/api/admin/schedules') return json(rows);
    if (method === 'GET' && url.pathname === '/api/calendar/events') return json({ events: [] });
    if (method === 'GET' && url.pathname === '/api/admin/mod/holidays/list') return json({ rows: [] });
    if (method === 'GET' && url.pathname === '/api/admin/me') return json(identity());
    if (method === 'PATCH' && url.pathname === '/api/admin/class-schedules/move') {
      const body = request.postDataJSON(); moves.push(body);
      if (blocked) await waitHeld(blocked, request);
      if (conflict) return json({ ok: false, error: 'schedule_conflict', message: 'Fixture conflict: reload and retry' }, 409);
      assert.deepEqual([...body.ids].sort(), ids);
      assert.deepEqual(body.expected, Object.fromEntries(rows.map(row => [String(row.id), row.move_version])));
      revision++;
      rows.forEach(row => { row.date = body.destination_date; row.start_time = body.start_time; if (body.teacher_id) row.teacher_id = body.teacher_id; row.move_version = 'fixture-v' + revision + '-' + row.id; });
      return json({ ok: true, count: ids.length, move_versions: Object.fromEntries(rows.map(row => [String(row.id), row.move_version])) });
    }
  }, { width });
  const { page } = state;
  await page.goto(BASE + '/admin/weekly-schedule.html', { waitUntil: 'domcontentloaded' });
  await eventually('weekly data loaded', () => page.evaluate(() => typeof SLOTS !== 'undefined' && Object.values(SLOTS).some(s => s.ids?.length === 3)));
  check(width + ': fixture uses a recognized manager role without scope restrictions', await page.evaluate(() =>
    schedEffectiveRole() === 'hq_mgr' && canOverrideTimeLimit() && window.__admScopeGuard?.active === false));
  await page.locator('[data-view="day"]').click();
  await page.locator('#day-picker [data-dow="1"]').click();
  const cell = hour => `td.slot[data-tid="${hour === 15 ? '25' : '24'}"][data-date="${day}"][data-hour="${hour}"][data-min="0"]`;
  const group = async hour => page.locator(cell(hour)).getAttribute('data-slot');
  const source = await group(14);
  check(width + ': three fixture rows render as one group', JSON.parse(decodeURIComponent(source)).slot.ids.length === 3);
  const hit = await topmost(page, '#ws-lock-btn');
  check(width + ': lock button has a real unobstructed hit target', hit.hittable && hit.right <= hit.viewport + 1, hit);
  check(width + ': page has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // The first-visit guide intentionally overlays the lower-right grid for 9s.
  // Close it through the shipped control, just as a person can, before hit tests.
  await page.locator('#guide-toast button').click();
  check(width + ': real guide close control reveals the working grid', await page.locator('#guide-toast').count() === 0);
  async function drag() {
    await page.locator(cell(14)).scrollIntoViewIfNeeded();
    await page.locator(cell(15)).scrollIntoViewIfNeeded();
    const a = await page.locator(cell(14)).boundingBox(), b = await page.locator(cell(15)).boundingBox();
    assert(a && b, 'Drag cells have bounds');
    check(width + ': source and target are unobstructed', (await topmost(page, cell(14))).hittable && (await topmost(page, cell(15))).hittable);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await page.mouse.up();
  }
  /* 2026-10-04: a locked drag is no longer silently dropped. It opens the move
     confirm with a lock notice; nothing is saved until a person presses a button
     there, and cancelling keeps the page locked. */
  await drag();
  await page.locator('#modal-overlay.show').waitFor();
  check(width + ': locked mouse drag sends no request but asks in the confirm', moves.length === 0
    && await page.locator('#modal-overlay.show .ws-move-locked').count() === 1);
  await page.locator('button[onclick="cancelMove()"]').click();
  check(width + ': cancelled locked drag stays locked and leaves entire group unchanged',
    moves.length === 0 && !(await page.evaluate(() => wsEditing())) && await group(14) === source && !(await group(15)));
  await page.locator('#ws-lock-btn').click();
  await drag();
  await page.locator('#modal-overlay.show').waitFor();
  await page.locator('button[onclick="cancelMove()"]').click();
  check(width + ': canceled unlocked drag sends no request and preserves group', moves.length === 0 && await group(14) === source && !(await group(15)));

  blocked = hold();
  await drag(); await page.locator('button[onclick="confirmMoveDo()"]').click();
  await eventually('held batch request', () => moves.length === 1);
  check(width + ': confirmed group sends one versioned batch for every row', JSON.stringify(moves[0].ids) === JSON.stringify(ids)
    && JSON.stringify(moves[0].expected) === JSON.stringify(Object.fromEntries(ids.map(id => [String(id), 'fixture-v1-' + id])))
    && moves[0].source_date === day && moves[0].destination_date === day && moves[0].start_time === '15:00' && moves[0].teacher_id === '25', moves[0]);
  check(width + ': held response cannot move UI or show undo/saved success', await group(14) === source && !(await group(15))
    && await page.locator('.undo-toast').count() === 0
    && !(await page.locator('.dnd-toast').allTextContents()).some(text => /이동됨|Moved to|저장했습니다|Saved/.test(text)));
  blocked.release(); blocked = null;
  await eventually('group moved after saved response', async () => !!(await group(15)) && !(await group(14)));
  await page.locator('.undo-toast.show button').waitFor();
  check(width + ': saved group stays intact', JSON.parse(decodeURIComponent(await group(15))).slot.ids.length === 3);
  check(width + ': undo is a real unobstructed hit target', (await topmost(page, '.undo-toast.show button')).hittable);
  await checkSavedFeedback(page, String(width));
  await screenshot(state, 'weekly-' + width + '-saved');
  const resizedWidth = width === 1280 ? 1024 : 1280;
  await page.setViewportSize({ width: resizedWidth, height: 1000 });
  await checkSavedFeedback(page, width + ' resized to ' + resizedWidth);
  await screenshot(state, 'weekly-' + width + '-saved-resized');
  await page.setViewportSize({ width, height: 1000 });
  await page.locator('.undo-toast.show button').click();
  await eventually('undo restored source', async () => moves.length === 2 && !!(await group(14)) && !(await group(15)));
  check(width + ': undo uses returned versions for every row and original position', JSON.stringify(moves[1].ids) === JSON.stringify(ids)
    && JSON.stringify(moves[1].expected) === JSON.stringify(Object.fromEntries(ids.map(id => [String(id), 'fixture-v2-' + id])))
    && moves[1].destination_date === day && moves[1].start_time === '14:00' && moves[1].teacher_id === '24', moves[1]);
  check(width + ': undo restores all three fixture records including teacher', rows.every(row => row.date === day && row.start_time === '14:00' && row.teacher_id === '24'));

  conflict = true;
  await drag(); await page.locator('button[onclick="confirmMoveDo()"]').click();
  await eventually('conflict presented', async () => moves.length === 3 && (await page.locator('.dnd-toast.bad').allTextContents()).some(text => text.includes('Fixture conflict')));
  await eventually('conflict reload complete', () => state.apiRequests.filter(r => r.path.startsWith('/api/admin/schedules?')).length >= 4);
  check(width + ': 409 preserves the complete group and destination is empty', JSON.parse(decodeURIComponent(await group(14))).slot.ids.length === 3 && !(await group(15)) && rows.every(row => row.start_time === '14:00' && row.teacher_id === '24'));
  conflict = false;
  await drag(); await page.locator('button[onclick="confirmMoveDo()"]').click();
  await eventually('retry succeeds', async () => moves.length === 4 && !!(await group(15)) && !(await group(14)));
  check(width + ': retry after conflict moves the complete group once', rows.every(row => row.start_time === '15:00' && row.teacher_id === '25') && moves.length === 4);
  await finish(state);
}

function portal(start, label = start, instant = NOW) {
  const today = new Date(Date.parse(instant) + 9 * 3600000).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = dayPlus(start, i);
    return { date, dow: new Date(date + 'T00:00:00Z').getUTCDay(), is_today: date === today,
      items: i === 0 ? [{ kind: 'class', student_name: 'Fixture ' + label, student_uid: 'fixture_student', start_time: '18:00', duration_min: 20 }] : [] };
  });
  return { ok: true, now: Date.parse(instant), today, me: { username: 'fixture_teacher', name: 'Fixture Teacher', lang: 'en', is_manager: false },
    week: { start, end: days[6].date, days }, classes: [], upcoming: [], notices: [], resources: [], rating: {} };
}
async function teacherFixture(name, opts = {}) {
  const queue = [], requests = [];
  const instant = opts.instant || NOW;
  const state = await fixture(name, async ({ url, method, request }) => {
    if (method === 'GET' && url.pathname === '/api/teacher/portal' && !url.searchParams.has('part')) {
      const plan = queue.shift() || {}, start = url.searchParams.get('week') || monday(instant);
      requests.push({ start, rawWeek: url.searchParams.get('week'), plan });
      if (plan.hold) await waitHeld(plan.hold, request);
      return json(plan.fail ? { ok: false, error: 'fixture_failure' } : portal(plan.start || start, plan.label || start, instant), plan.fail ? 503 : 200);
    }
    if (method === 'GET' && url.pathname === '/api/admin/me') return json(identity('fixture_teacher', 'Fixture Teacher', 'teacher'));
    if (method === 'GET' && url.pathname === '/api/approval/home') return json({ ok: true, items: [] });
    if (method === 'GET' && url.pathname === '/api/outage/mine') return json({ ok: true, items: [], incidents: [] });
    if (method === 'GET' && url.pathname === '/api/admin/payroll/lessons') return json({ ok: true, items: [], lessons: [] });
  }, { ...opts, teacherIdentity: true });
  await state.page.goto(BASE + '/teacher.html', { waitUntil: 'domcontentloaded' });
  await shown(state.page, monday(instant));
  check(name + ': browser online emulation permits polling inside isolated OS network', await state.page.evaluate(() => navigator.onLine === true));
  return Object.assign(state, { queue, requests });
}
async function shown(page, start, label) {
  await eventually('teacher displays ' + start + (label ? '/' + label : ''), async () =>
    (await page.locator('#wk-range').textContent()).startsWith('(' + start + ' ~ ')
    && await page.locator('#wk-date').inputValue() === start
    && (!label || (await page.locator('#week').textContent()).includes('Fixture ' + label)));
}
async function teacher() {
  const state = await teacherFixture('teacher-navigation', { clock: true });
  const { page, queue, requests } = state;
  check('teacher: first request delegates current week to server', requests[0].rawWeek === null);
  const slow = hold(); queue.push({ hold: slow, label: 'older-next' }, { label: 'newer-prev' });
  await page.locator('#wk-next').click();
  await eventually('older next request', () => requests.length === 2);
  await page.locator('#wk-prev').click();
  await shown(page, '2026-09-28', 'newer-prev');
  await releaseResponse(page, slow);
  check('teacher: older out-of-order navigation cannot overwrite new week', (await page.locator('#week').textContent()).includes('Fixture newer-prev') && !(await page.locator('#week').textContent()).includes('Fixture older-next'));
  queue.push({ label: 'picked' });
  await page.locator('#wk-date').fill('2026-11-18');
  await page.locator('#wk-date').press('Tab');
  await shown(page, '2026-11-16', 'picked');
  check('teacher: real date input requests exact KST Monday', requests.at(-1).start === '2026-11-16');
  await page.locator('#lang').click(); await shown(page, '2026-11-16', 'picked');
  check('teacher: language redraw preserves selected week', await page.locator('#wk-date').inputValue() === '2026-11-16');
  queue.push({ label: 'full-refresh' });
  await page.locator('#reload').click(); await shown(page, '2026-11-16', 'full-refresh');
  check('teacher: full Refresh requests selected week', requests.at(-1).start === '2026-11-16');
  queue.push({ fail: true });
  await page.locator('#reload').click();
  await eventually('full refresh error visible', () => page.locator('#wk-error').isVisible());
  check('teacher: failed full refresh retains last valid range/content', await page.locator('#wk-date').inputValue() === '2026-11-16'
    && (await page.locator('#week').textContent()).includes('Fixture full-refresh') && await page.locator('#stale').isVisible());
  queue.push({ label: 'auto-refresh' });
  const count = requests.length;
  await advanceClock(page, 46000, 'teacher selected-week auto refresh');
  await shown(page, '2026-11-16', 'auto-refresh');
  check('teacher: real automatic timer requests selected week once', requests.length === count + 1 && requests.at(-1).start === '2026-11-16');
  queue.push({ fail: true });
  await page.locator('#wk-next').click();
  await eventually('week error visible', () => page.locator('#wk-error').isVisible());
  check('teacher: failed navigation retains last valid range/date/content', await page.locator('#wk-date').inputValue() === '2026-11-16'
    && (await page.locator('#wk-range').textContent()).includes('2026-11-16') && (await page.locator('#week').textContent()).includes('Fixture auto-refresh'));
  // Full refresh pending before newer week navigation must not redraw stale data.
  const oldFull = hold(); queue.push({ hold: oldFull, label: 'stale-full' }, { label: 'new-selection' });
  await page.locator('#reload').click();
  await eventually('held full refresh request', () => requests.at(-1).plan.hold === oldFull);
  await page.locator('#wk-prev').click(); await shown(page, '2026-09-28', 'new-selection');
  await releaseResponse(page, oldFull);
  check('teacher: stale full refresh cannot overwrite newer selection', !(await page.locator('#week').textContent()).includes('stale-full') && await page.locator('#wk-date').inputValue() === '2026-09-28');
  // The same shared sequencing must apply to the automatic timer.
  const oldAuto = hold(); queue.push({ hold: oldAuto, label: 'stale-auto' }, { label: 'newer-than-auto' });
  await advanceClock(page, 46000, 'teacher stale auto request');
  await eventually('held automatic refresh request', () => requests.at(-1).plan.hold === oldAuto);
  await page.locator('#wk-next').click(); await shown(page, '2026-10-12', 'newer-than-auto');
  await releaseResponse(page, oldAuto);
  check('teacher: stale auto refresh cannot overwrite newer selection', !(await page.locator('#week').textContent()).includes('stale-auto') && await page.locator('#wk-date').inputValue() === '2026-10-12');
  queue.push({ fail: true });
  await advanceClock(page, 46000, 'teacher failed auto refresh');
  await eventually('automatic refresh error visible', () => page.locator('#wk-error').isVisible());
  check('teacher: failed auto refresh retains last valid range/content', await page.locator('#wk-date').inputValue() === '2026-10-12'
    && (await page.locator('#week').textContent()).includes('Fixture newer-than-auto'));
  const beforeOffline = requests.length;
  await page.evaluate(() => window.__fixtureSetOnline(false));
  await advanceClock(page, 91000, 'teacher offline guard');
  check('teacher: offline timer guard sends no request and preserves content', requests.length === beforeOffline
    && await page.evaluate(() => navigator.onLine === false)
    && (await page.locator('#week').textContent()).includes('Fixture newer-than-auto'));
  queue.push({ label: 'online-recovery' });
  await page.evaluate(() => window.__fixtureSetOnline(true));
  await advanceClock(page, 1001, 'teacher online recovery');
  await shown(page, '2026-10-12', 'online-recovery');
  check('teacher: online event refreshes selected week exactly once', requests.length === beforeOffline + 1 && requests.at(-1).rawWeek === '2026-10-12');
  await finish(state);
}
async function teacherBoundary(timezoneId, instant, expected) {
  const name = 'teacher-boundary-' + timezoneId.replaceAll('/', '-') + '-' + (instant.includes('14:') ? 'before' : 'after');
  const state = await teacherFixture(name, { timezoneId, instant });
  const initialCount = state.requests.length;
  state.queue.push({ label: 'boundary-current-click' });
  await state.page.locator('#wk-this').click();
  await eventually('explicit current-week request', () => state.requests.length === initialCount + 1);
  await shown(state.page, expected, 'boundary-current-click');
  check(name + ': KST current-week button is timezone independent', state.requests.at(-1).rawWeek === expected);
  state.queue.push({ label: 'boundary-sunday-pick' });
  await state.page.locator('#wk-date').fill('2026-10-04');
  await state.page.locator('#wk-date').press('Tab');
  await eventually('explicit Sunday-picker request', () => state.requests.length === initialCount + 2);
  await shown(state.page, '2026-09-28', 'boundary-sunday-pick');
  check(name + ': Sunday date input stays in preceding calendar week', state.requests.at(-1).rawWeek === '2026-09-28');
  await finish(state);
}

async function health() {
  let held = null;
  const state = await fixture('health', async ({ url, method, request }) => {
    if (method !== 'GET') return;
    if (url.pathname === '/api/admin/health-check' && url.searchParams.get('mode') === 'passive') return json({ ok: true, mode: 'passive', build_stamp: 'offline-fixture', bindings: { DB: true, RECORDINGS: false } });
    if (url.pathname === '/api/health' && !url.search) { if (held) await waitHeld(held, request); return json({ status: 'ok' }); }
    if (url.pathname === '/api/admin/health-check' && !url.search) { if (held) await waitHeld(held, request); return json({ ok: true, db_query_ok: true, bindings: { DB: true } }); }
  }, { clock: true });
  const { page } = state;
  const active = () => state.apiRequests.filter(r => r.path !== '/api/admin/health-check?mode=passive');
  await page.goto(BASE + '/admin/health.html', { waitUntil: 'domcontentloaded' });
  await eventually('passive configuration loaded', async () => (await page.locator('#last-update').textContent()).includes('구성 정보 조회:'));
  check('health: initial load only requests mode=passive', state.apiRequests.length === 1 && active().length === 0);
  await advanceClock(page, 10001, 'health passive timer');
  await eventually('passive timer ran', () => state.apiRequests.length === 2);
  check('health: real timer only requests mode=passive', active().length === 0 && state.apiRequests.every(r => r.method === 'GET'));
  await page.locator('#auto-refresh').uncheck();
  await page.locator('#run-diagnostics').click();
  check('health: no selection sends no active request', active().length === 0 && (await page.locator('#diagnostic-status').textContent()).includes('먼저 선택'));
  await page.locator('#diagnostic-worker').check();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#run-diagnostics').click();
  check('health: canceled confirmation sends no active request', active().length === 0 && (await page.locator('#diagnostic-status').textContent()).includes('새 진단 요청 없음'));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#run-diagnostics').click();
  await eventually('worker result visible', async () => (await page.locator('#endpoints').textContent()).includes('Worker 응답 확인'));
  check('health: explicit worker choice sends only selected safe GET', active().length === 1 && active()[0].path === '/api/health' && active()[0].method === 'GET');
  await page.locator('#diagnostic-worker').uncheck(); await page.locator('#diagnostic-db').check();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#run-diagnostics').click();
  await eventually('D1 result visible', async () => (await page.locator('#endpoints').textContent()).includes('D1 SELECT 1 성공'));
  check('health: explicit D1 choice sends only selected safe GET', active().length === 2 && active()[1].path === '/api/admin/health-check' && active()[1].method === 'GET');
  held = hold(); page.once('dialog', dialog => dialog.accept());
  await page.locator('#run-diagnostics').click(); await eventually('held health request', () => active().length === 3);
  const canceledRequest = page.waitForEvent('requestfailed', request => request === held.request);
  await page.locator('#cancel-diagnostics').click();
  await canceledRequest;
  const canceledText = await page.locator('#diagnostic-status').textContent();
  held.release(); held = null; await delay(150);
  check('health: late canceled response does not paint success', (await page.locator('#diagnostic-status').textContent()) === canceledText
    && canceledText.includes('대기를 취소') && await page.locator('#endpoints .green').count() === 0);
  await finish(state);
}

async function adminIdentity() {
  const identityRequests = [], plans = [{ fail: true }];
  const state = await fixture('admin-identity', async ({ url, method, record, request }) => {
    // The shipped dashboard flushes menu telemetry on visibility changes. This
    // known background write is explicitly denied, not mistaken for an identity
    // retry or fulfilled as a successful production write.
    if (method === 'POST' && url.pathname === '/api/admin/menu-hit') {
      report.denied.push({ case: 'admin-identity', kind: 'known-telemetry', method, path: url.pathname });
      return json({ ok: false, error: 'offline_fixture_telemetry_disabled' }, 503);
    }
    if (method !== 'GET' || url.pathname !== '/api/admin/me') return;
    if (record.caller !== 'identity') { state.otherMe++; return json(identity()); }
    const plan = plans.shift(); assert(plan, 'Unexpected duplicate identity request'); identityRequests.push(plan);
    if (plan.hold) await waitHeld(plan.hold, request);
    return json(plan.fail ? { ok: false, error: 'fixture_identity_failure' } : identity(plan.uid, plan.name), plan.fail ? 503 : 200);
  }, { clock: true, identityProbe: true });
  const { page } = state;
  await page.goto(BASE + '/admin.html?full=1', { waitUntil: 'domcontentloaded' });
  await eventually('identity failure', () => page.evaluate(() => window.admIdentityState === 'error'));
  check('identity: recognized manager fixture remains on full-admin page', await page.evaluate(() =>
    location.pathname === '/admin.html' && new URLSearchParams(location.search).get('full') === '1'
    && window._effectiveRole() === 'hq_mgr' && window.__admScopeGuard?.active === false));
  check('identity: failed request exposes visible retry', await page.locator('#adm-identity-status').isVisible() && await page.locator('#adm-identity-retry').isEnabled());
  check('identity: failed identity is not invented', await page.evaluate(() => window.admIdentity() === null));
  check('identity: retry button is unobstructed', (await topmost(page, '#adm-identity-retry')).hittable);
  await screenshot(state, 'admin-identity-failure');
  const stalled = hold(); plans.push({ hold: stalled, uid: 'too_late', name: 'Too Late Fixture' });
  await page.locator('#adm-identity-retry').click({ clickCount: 2, delay: 20 });
  await eventually('identity retry in flight', () => identityRequests.length === 2);
  check('identity: double click creates only one identity request', identityRequests.length === 2 && await page.locator('#adm-identity-retry').isDisabled());
  await advanceClock(page, 8001, 'identity stalled request');
  await eventually('identity timeout visible', () => page.evaluate(() => window.admIdentityState === 'timeout'));
  check('identity: stalled request exposes visible retry', await page.locator('#adm-identity-status').isVisible() && await page.locator('#adm-identity-retry').isEnabled());
  plans.push({ uid: 'recovered_fixture', name: 'Recovered Fixture' });
  await page.locator('#adm-identity-retry').click();
  await eventually('identity recovered', () => page.evaluate(() => window.admIdentityState === 'ready' && window.admIdentity()?.uid === 'recovered_fixture'));
  await releaseResponse(page, stalled);
  check('identity: retry recovers and timed-out late response cannot overwrite it', await page.evaluate(() => window.admIdentity()?.uid === 'recovered_fixture' && document.getElementById('adm-identity-status').hidden));

  // A second same-origin page causes a genuine browser storage event. The pending
  // response remains deliverable because only this fixture's /me ignores abort.
  const peer = await state.context.newPage();
  await peer.goto(BASE + '/__offline_storage.html');
  await peer.evaluate(() => localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'changed_fixture', role: 'hq_mgr', server_role: 'hq', pref_lang: 'ko' })));
  await eventually('real storage event invalidates identity', () => page.evaluate(() => window.admIdentityState === 'changed'));
  const stale = hold(); plans.push({ hold: stale, uid: 'old_account_fixture', name: 'Old Account Fixture' });
  await page.bringToFront(); await page.locator('#adm-identity-retry').click();
  await eventually('old account request in flight', () => identityRequests.length === 4);
  await peer.evaluate(() => {
    localStorage.setItem('admin_session', JSON.stringify({ uid: 'new_account_fixture', name: 'New Account Fixture', __fromServer: true }));
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'new_account_fixture', role: 'hq_mgr', server_role: 'hq', pref_lang: 'ko' }));
  });
  await eventually('second storage event invalidates pending request', () => page.evaluate(() => window.admIdentityState === 'changed'));
  plans.push({ uid: 'new_account_fixture', name: 'New Account Fixture' });
  await page.locator('#adm-identity-retry').click();
  await eventually('new account verified', () => page.evaluate(() => window.admIdentityState === 'ready' && window.admIdentity()?.uid === 'new_account_fixture'));
  await releaseResponse(page, stale);
  check('identity: genuine trusted storage event observed', await page.evaluate(() => window.__offlineStorageEvents.some(e => e.trusted && e.key === 'mangoi_admin_session')));
  check('identity: late stale account cannot overwrite cache/storage/UI identity', await page.evaluate(() =>
    window.admIdentityState === 'ready' && window.admIdentity().uid === 'new_account_fixture'
    && window.__ADM_ME.uid === 'new_account_fixture' && JSON.parse(localStorage.getItem('admin_session')).uid === 'new_account_fixture'));
  check('identity: exact module requests counted separately from other /me callers', identityRequests.length === 5 && state.otherMe > 0, { identity: identityRequests.length, other: state.otherMe });
  await peer.close(); await finish(state);
}

try {
  for (const width of [1280, 1024]) await run('weekly-' + width, () => weekly(width));
  await run('teacher-navigation', teacher);
  for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Seoul', 'Asia/Manila']) {
    for (const [instant, expected] of [['2026-10-04T14:59:59Z', '2026-09-28'], ['2026-10-04T15:00:00Z', '2026-10-05']]) {
      await run('boundary-' + zone.replaceAll('/', '-') + '-' + expected, () => teacherBoundary(zone, instant, expected));
    }
  }
  await run('health', health);
  await run('admin-identity', adminIdentity);
} catch (error) {
  failures++;
  report.lifecycleError = String(error);
  console.error('HARNESS FAILED ' + error.stack);
} finally {
  try { await deadline('browser cleanup', browser.close(), 10000); }
  catch (error) { failures++; report.cleanupError = String(error); console.error(String(error)); }
  if (report.cases.length !== 13) { failures++; report.incompleteCases = { completed: report.cases.length, required: 13 }; }
  try { await writeReport(); }
  catch (error) { failures++; console.error('REPORT WRITE FAILED ' + String(error)); }
  console.log(`\nadmin-repairs-offline-browser: PASS ${passes} / FAIL ${failures} / SKIP 0`);
}
// Do not let a failed browser transport/cleanup keep the process alive forever.
if (failures) process.exit(1);
