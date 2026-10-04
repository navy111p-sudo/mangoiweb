/**
 * Daily-handover client regressions against shipped HTML/CSS/JS. Synthetic route
 * fixtures only: no server, credentials, providers, DB, or notification delivery.
 * Run with pinned playwright-core@1.63.0 in a loopback-only network namespace.
 * Missing tooling/isolation/browser is a failure, never a passing skip.
 * Existing happy-path/manual suites remain unchanged.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = await realpath(resolve(ROOT, 'cloudflare-deploy/public'));
const OUT = resolve(process.env.OUTPUT_DIR || '/tmp/daily-handover-races-results');
const BASE = 'http://127.0.0.1:18766'; // Routed synthetic origin. Nothing listens here.
const API = '/api/approval/handover';
const NOW = '2026-10-04T14:59:30Z';
const DAY = '2026-10-04';
const SUITE = 'daily-handover-races-browser';
const report = { suite: SUITE, passed: 0, failed: 0, skipped: 0, skipped0: true, cases: [], assertions: [], requests: [], denied: [], pageErrors: [] };
const contexts = new Set();
let browser;
await mkdir(OUT, { recursive: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
async function bounded(label, work, milliseconds = 15000) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Deadline: ' + label)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function persist() { await bounded('write report', writeFile(resolve(OUT, 'fixture-report.json'), JSON.stringify(report, null, 2) + '\n')); }
function check(name, passed, detail) {
  report.assertions.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
  if (!passed) { report.failed++; throw new Error(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail))); }
  report.passed++; console.log('PASS ' + name);
}
async function eventually(label, predicate) {
  const until = Date.now() + 12000;
  do { const result = await predicate(); if (result) return result; await delay(35); } while (Date.now() < until);
  throw new Error('Timed out: ' + label);
}
const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'cache-control': 'no-store' } });
const copy = value => JSON.parse(JSON.stringify(value));
function hold() { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; }
async function waitHeld(latch, request) { latch.request = request; await latch.promise; }
async function drain(page) {
  await bounded('renderer task drain', page.evaluate(() => new Promise(done => {
    const channel = new MessageChannel(); let count = 0;
    channel.port1.onmessage = () => { if (++count === 3) { channel.port1.close(); channel.port2.close(); done(); } else channel.port2.postMessage(null); };
    channel.port2.postMessage(null);
  })));
}
async function releaseResponse(page, latch) {
  assert(latch.request, 'Held request must have reached the fixture');
  const marker = latch.request.headers()['x-handover-fixture-request'];
  assert(marker, 'Held native fetch has an observer marker');
  const response = page.waitForResponse(response => response.request() === latch.request);
  latch.release(); await bounded('held HTTP response', response);
  await eventually('held response body consumed', () => page.evaluate(id => window.__handoverResponses[id]?.bodyComplete === true, marker));
  await drain(page);
}
const PAYLOAD = { work: 'Fixture completed work', no_issue: true, issue: '', no_open: false, open: 'Fixture remaining task', owner: 'fixture_author', deadline: '2026-10-05T10:00', student: '', class_info: '', priority: 'normal', attachments: [] };
const members = [{ username: 'fixture_author', name: 'Fixture Author' }, { username: 'fixture_reader', name: 'Fixture Reader' }];
function row(id = 41, extra = {}) {
  return { id, username: 'fixture_author', staff_name: 'Fixture Author', recipient: 'fixture_reader', report_date: DAY,
    status: 'submitted', version: 1, submitted_at: Date.parse(NOW) - 60000, updated_at: Date.parse(NOW),
    payload: copy(PAYLOAD), followup: { opened_at: Date.parse(NOW) - 1000 }, ...extra };
}
function home(model, date) {
  return { ok: true, day: date, me: { username: model.reader ? 'fixture_reader' : 'fixture_author', name: model.reader ? 'Fixture Reader' : 'Fixture Author' },
    members, default_recipient: 'fixture_reader', own: model.rows.find(r => r.username === (model.reader ? 'fixture_reader' : 'fixture_author') && r.report_date === date) || null,
    reports: model.rows.filter(r => r.report_date === date), files: [], staged_ids: [], reader_mode: model.reader, can_review_all: false,
    schedule: null, read_schedule: null, required: [], ai_available: false };
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
async function fixture(name, { reader = false, rows = [], instant = NOW, timezoneId = 'UTC', api } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId, locale: 'en-US', serviceWorkers: 'block', acceptDownloads: false });
  contexts.add(context); context.setDefaultTimeout(12000);
  await context.clock.install({ time: new Date(instant) });
  const state = { name, context, page: null, model: { reader, rows: copy(rows), day: DAY }, apiRequests: [], routeErrors: [], unconfigured: [] };
  await context.addInitScript(origin => {
    if (location.origin !== origin) return;
    let sequence = 0;
    window.__handoverResponses = Object.create(null);
    const fetchNative = window.fetch;
    window.fetch = function(input, init) {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.pathname.startsWith('/api/approval/handover/')) return fetchNative.apply(this, arguments);
      const options = { ...init, headers: new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)) };
      const id = String(++sequence); options.headers.set('x-handover-fixture-request', id);
      const observed = window.__handoverResponses[id] = {};
      // Keep native fetch, AbortSignal and original Response. Observe a clone so
      // a deliberately discarded stale response still has a body-completion fence.
      return fetchNative.call(this, input, options).then(response => {
        response.clone().arrayBuffer().then(() => { observed.bodyComplete = true; }, e => { observed.error = String(e); });
        return response;
      }, e => { observed.error = String(e); throw e; });
    };
  }, BASE);
  await context.routeWebSocket('**/*', ws => { report.denied.push({ case: name, kind: 'websocket' }); ws.close({ code: 1008, reason: 'Synthetic fixture only' }); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (url.origin !== BASE) { report.denied.push({ case: name, kind: 'nonlocal', origin: url.origin }); return await route.abort('blockedbyclient'); }
      if (url.pathname.startsWith('/api/')) {
        const body = method === 'POST' ? request.postDataJSON() : null;
        const record = { case: name, method, path: url.pathname + url.search, body };
        state.apiRequests.push(record); report.requests.push(record);
        const custom = api && await api({ route, request, url, method, body, state });
        if (custom === true) return; // A deliberately dropped response was handled.
        if (custom) return await route.fulfill(custom);
        let data;
        if (method === 'GET' && url.pathname === API + '/home') data = home(state.model, url.searchParams.get('date') || state.model.day);
        if (method === 'GET' && url.pathname === API + '/inbox') {
          const inbox = state.model.rows.filter(r => r.status === 'submitted' && r.recipient === (reader ? 'fixture_reader' : 'fixture_author'));
          data = { ok: true, reports: inbox, total: inbox.length, files: [] };
        }
        if (method === 'GET' && url.pathname === API + '/read-history') data = { ok: true, reports: state.model.rows.filter(r => r.status === 'acknowledged'), files: [] };
        if (method === 'GET' && url.pathname === API + '/mine') data = { ok: true, reports: state.model.rows.filter(r => r.username === 'fixture_author'), files: [] };
        if (method === 'POST' && url.pathname === API + '/review') data = { ok: true, check: { ready: !!body.payload.work, missing: body.payload.work ? [] : ['work'] }, ai_state: 'unavailable', suggestion: null };
        if (data) return await route.fulfill(json(data));
        state.unconfigured.push(record); report.denied.push({ ...record, kind: 'unconfigured-api' });
        return await route.fulfill(json({ ok: false, error: 'offline_fixture_not_configured' }, 503));
      }
      if (!['GET', 'HEAD'].includes(method)) { state.unconfigured.push({ method, path: url.pathname }); return await route.abort('blockedbyclient'); }
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) return await route.abort('blockedbyclient');
      const candidate = resolve(PUBLIC, '.' + decoded);
      if (!candidate.startsWith(PUBLIC + sep)) return await route.abort('blockedbyclient');
      let file;
      try { file = await realpath(candidate); } catch { return await route.fulfill({ status: 404, body: 'Fixture asset not found' }); }
      if (!file.startsWith(PUBLIC + sep)) return await route.abort('blockedbyclient');
      // Never route.continue/fetch: every byte is a checkout asset or fixture.
      return await route.fulfill({ contentType: MIME[extname(file)] || 'application/octet-stream', body: method === 'HEAD' ? '' : await readFile(file) });
    } catch (error) {
      if (!/closed|Target page|Invalid InterceptionId|already handled|canceled/i.test(String(error))) {
        state.routeErrors.push(String(error)); try { await route.abort('failed'); } catch {}
      }
    }
  });
  context.on('page', page => page.on('pageerror', error => report.pageErrors.push({ case: name, message: String(error) })));
  state.page = await context.newPage();
  await state.page.goto(BASE + '/daily-handover.html', { waitUntil: 'domcontentloaded' });
  await eventually('editor initialized', () => state.page.locator('#mh-work').isEnabled());
  return state;
}
async function finish(state) {
  check(state.name + ': no unconfigured API/mutation', state.unconfigured.length === 0, state.unconfigured);
  check(state.name + ': no route errors', state.routeErrors.length === 0, state.routeErrors);
  check(state.name + ': no page errors', !report.pageErrors.some(e => e.case === state.name));
  await bounded('screenshot', state.page.screenshot({ path: resolve(OUT, state.name + '.png'), fullPage: false }));
  await bounded('context cleanup', state.context.close()); contexts.delete(state.context);
}
async function run(name, fn) {
  console.log('\nCASE ' + name); const failures = report.failed;
  try { await bounded(name, fn(), 90000); report.cases.push({ name, passed: true }); }
  catch (error) {
    if (report.failed === failures) report.failed++;
    report.cases.push({ name, passed: false, error: String(error), stack: error.stack }); console.error('CASE FAILED ' + name + '\n' + error.stack);
    await persist();
    for (const context of contexts) {
      for (const [i, page] of context.pages().entries()) {
        try { await bounded('failure screenshot', page.screenshot({ path: resolve(OUT, 'failure-' + name + '-' + i + '.png'), timeout: 5000 }), 6000); } catch {}
      }
      await bounded('failed context cleanup', context.close());
    }
    contexts.clear();
  }
  await persist();
}
async function readyToSend(page, text) {
  if (text !== undefined) await page.locator('#mh-work').fill(text);
  await page.locator('#mh-manual').click();
  await eventually('review complete', () => page.locator('#mh-confirm').isEnabled());
  await page.locator('#mh-confirm').check();
  await eventually('send enabled', () => page.locator('#mh-send').isEnabled());
}
const detailText = page => page.locator('#mh-report-detail').textContent();
const ackButton = page => page.getByRole('button', { name: '내용 확인 완료 / Acknowledge', exact: true });
const historyButton = page => page.getByRole('button', { name: /Follow-up history|Refresh history/ });
function saved(body, id = 71) { return row(id, { report_date: body.report_date, recipient: body.recipient, payload: copy(body.payload), version: body.version + 1, status: body.submit ? 'submitted' : 'draft', submitted_at: body.submit ? Date.parse(NOW) : null }); }

async function saveRetry() {
  const writes = []; let committed, commits = 0;
  const state = await fixture('save-response-retry', { api: async ({ route, url, method, body, state }) => {
    if (method !== 'POST' || url.pathname !== API + '/save') return;
    writes.push(copy(body));
    if (!committed) { committed = saved(body); state.model.rows = [committed]; commits++; await route.abort('failed'); return true; }
    assert.deepEqual(body, writes[0], 'Unchanged retry must preserve every save field and request key');
    // The server's exact-key duplicate response deliberately has no push field.
    return json({ ok: true, row: committed, duplicate: true });
  } });
  const { page } = state;
  await readyToSend(page, 'Synthetic dropped-response report');
  await page.locator('#mh-send').click();
  await eventually('save failure retry available', async () => await page.locator('#mh-errors').isVisible() && await page.locator('#mh-send').isEnabled());
  check('failed save keeps text, confirmation and no false success', await page.locator('#mh-work').inputValue() === writes[0].payload.work && await page.locator('#mh-confirm').isChecked() && !await page.locator('#mh-success').isVisible());
  check('failed save preserves device draft', await page.evaluate(key => JSON.parse(localStorage.getItem(key)).payload.work, 'mangoi_handover_v1:fixture_author:' + DAY) === writes[0].payload.work);
  await page.locator('#mh-send').click();
  await eventually('retry success', () => page.locator('#mh-success').isVisible());
  check('retry reuses exact request key and payload', writes.length === 2 && writes[0].request_key === writes[1].request_key && JSON.stringify(writes[0]) === JSON.stringify(writes[1]));
  check('successful unchanged retry leaves one synthetic saved revision', commits === 1 && state.model.rows.length === 1 && state.model.rows[0].version === 1);
  check('duplicate response with no push field reports saved availability, no push receipt', (await page.locator('#mh-success').textContent()).includes('Available in reports') && !(await page.locator('#mh-success').textContent()).includes('Push sent'));
  check('success disables duplicate submit and removes delivered local draft', await page.locator('#mh-send').isDisabled() && await page.evaluate(key => localStorage.getItem(key), 'mangoi_handover_v1:fixture_author:' + DAY) === null);
  await finish(state);
}
async function saveConflict() {
  const writes = [];
  const state = await fixture('save-conflict-preserves-draft', { api: async ({ url, method, body }) => {
    if (method !== 'POST' || url.pathname !== API + '/save') return;
    writes.push(copy(body));
    // Different request key with a stale base version is a current 409, as in
    // daily-handover.ts. It must not masquerade as an idempotent success.
    return json({ ok: false, error: 'conflict' }, 409);
  } });
  const { page } = state;
  await readyToSend(page, 'Local wording to compare with another window');
  await page.locator('#mh-send').click();
  await eventually('conflict visible', async () => await page.locator('#mh-errors').isVisible() && (await page.locator('#mh-errors').textContent()).includes('Reopen and compare'));
  check('conflicting save preserves local text and never displays success', writes.length === 1 && await page.locator('#mh-work').inputValue() === writes[0].payload.work && !await page.locator('#mh-success').isVisible());
  check('conflict leaves a device draft for comparison', await page.evaluate(key => JSON.parse(localStorage.getItem(key))?.payload.work, 'mangoi_handover_v1:fixture_author:' + DAY) === writes[0].payload.work);
  check('conflict retry is not silently sent or treated as a new server revision', writes[0].version === 0 && await page.locator('#mh-send').isEnabled());
  await finish(state);
}
async function editsDuringSave() {
  const latch = hold(), writes = [];
  const state = await fixture('save-edits-in-flight', { api: async ({ url, method, body, request, state }) => {
    if (method !== 'POST' || url.pathname !== API + '/save') return;
    writes.push(copy(body)); const result = saved(body);
    if (writes.length === 1) await waitHeld(latch, request);
    state.model.rows = [result]; return json({ ok: true, row: result, push: 'queued' });
  } });
  const { page } = state;
  await readyToSend(page, 'First submitted wording');
  await page.locator('#mh-send').click({ clickCount: 2, delay: 20 });
  await eventually('save held', () => !!latch.request);
  check('double click submits once while busy', writes.length === 1 && await page.locator('#mh-send').isDisabled());
  await page.locator('#mh-work').fill('New edits remain on this device');
  await releaseResponse(page, latch);
  await eventually('unsent edits warning and list refresh', async () => (await page.locator('#mh-errors').textContent()).includes('New edits remain unsent') && await page.locator('#mh-reports .mh-report-button').count() === 1);
  check('late save cannot mark newer text delivered', await page.locator('#mh-work').inputValue() === 'New edits remain on this device' && !await page.locator('#mh-success').isVisible() && await page.locator('#mh-confirm').isDisabled());
  const draft = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), 'mangoi_handover_v1:fixture_author:' + DAY);
  check('new edits cache adopts committed base version', draft.payload.work === 'New edits remain on this device' && draft.version === 1);
  await readyToSend(page); await page.locator('#mh-send').click();
  await eventually('new revision sent', () => page.locator('#mh-success').isVisible());
  check('changed retry uses new key and committed version', writes.length === 2 && writes[1].version === 1 && writes[1].request_key !== writes[0].request_key && writes[1].payload.work === draft.payload.work);
  await finish(state);
}
async function reviewRace() {
  const latch = hold(); let reviews = 0;
  const state = await fixture('review-delayed-edit', { api: async ({ url, method, request }) => {
    if (method !== 'POST' || url.pathname !== API + '/review' || ++reviews !== 1) return;
    await waitHeld(latch, request);
    return json({ ok: true, check: { ready: true }, ai_state: 'ready', suggestion: { work: 'Obsolete suggestion', issue: '', open: '', tips: [] } });
  } });
  const { page } = state;
  await page.locator('#mh-work').fill('Old review wording'); await page.locator('#mh-review').click();
  await eventually('review held', () => !!latch.request);
  await page.locator('#mh-work').fill('Edited while AI response was pending');
  await releaseResponse(page, latch);
  await eventually('stale review discarded', async () => (await page.locator('#mh-review-status').textContent()).includes('Text changed'));
  check('old review cannot enable confirmation or replace input', await page.locator('#mh-confirm').isDisabled() && !await page.locator('#mh-ai').isVisible() && await page.locator('#mh-work').inputValue() === 'Edited while AI response was pending');
  await readyToSend(page);
  check('manual retry is available without AI and does not submit', reviews === 2 && await page.locator('#mh-send').isEnabled() && !state.apiRequests.some(r => r.path === API + '/save'));
  await finish(state);
}
async function responseRetry(kind) {
  const name = kind + '-response-retry', writes = []; let transitions = 0;
  const state = await fixture(name, { reader: true, rows: [row()], api: async ({ route, url, method, body, state }) => {
    if (method !== 'POST' || url.pathname !== API + '/' + kind) return;
    writes.push(copy(body));
    if (writes.length === 1) {
      const r = state.model.rows[0]; r.status = kind === 'ack' ? 'acknowledged' : 'changes_requested'; r.version++;
      r.acknowledged_by = 'fixture_reader'; r.acknowledged_at = Date.parse(NOW); r.feedback = body.feedback;
      transitions++; await route.abort('failed'); return true;
    }
    assert.deepEqual(body, writes[0], 'Response retry must repeat id/version/action/feedback');
    return json({ ok: true, duplicate: true });
  } });
  const { page } = state;
  const button = kind === 'ack' ? ackButton(page) : page.getByRole('button', { name: '보완 요청 / Request changes', exact: true });
  if (kind === 'return') { page.once('dialog', d => d.dismiss()); await button.click(); check('canceled change request sends no response', writes.length === 0); }
  if (kind === 'return') page.once('dialog', d => d.accept('Please clarify the fixture task'));
  await button.click();
  await eventually('response retry available', async () => !(await page.locator('#mh-errors').evaluate(e => e.hidden)) && (await page.locator('#mh-inbox-message').textContent()) === (await page.locator('#mh-errors').textContent()) && await button.isEnabled());
  check(name + ': reader failure message is visible outside hidden editor', await page.locator('#mh-inbox-message').isVisible() && !await page.locator('#mh-editor').isVisible());
  check(name + ': failed response leaves report readable', (await detailText(page)).includes(PAYLOAD.work) && (await detailText(page)).includes(PAYLOAD.open));
  if (kind === 'return') page.once('dialog', d => d.accept('Please clarify the fixture task'));
  await button.click();
  await eventually('answered report removed from unread', async () => await page.locator('#mh-reports .mh-report-button').count() === 0);
  check(name + ': successful retry clears visible reader error', await page.locator('#mh-errors').evaluate(e => e.hidden) && (await page.locator('#mh-inbox-message').textContent()).includes('My unread: 0'));
  check(name + ': exact retry uses old version only once', writes.length === 2 && transitions === 1 && writes[0].version === 1 && JSON.stringify(writes[0]) === JSON.stringify(writes[1]));
  check(name + ': response does not close open work', state.model.rows[0].payload.no_open === false && state.model.rows[0].payload.open === PAYLOAD.open);
  await page.locator('#mh-list-options summary').click(); await page.locator('#mh-filter').selectOption('all');
  check(name + ': responded state and remaining task are visible together', (await detailText(page)).includes(kind === 'ack' ? 'Acknowledged' : 'Changes requested') && (await detailText(page)).includes(PAYLOAD.open) && (await detailText(page)).includes('Acknowledgement does not close open tasks'));
  await finish(state);
}
async function readerRefreshRetry() {
  let fail = false;
  const state = await fixture('reader-error-unchanged-retry', { reader: true, rows: [row()], api: async ({ url, method }) => {
    if (fail && method === 'GET' && url.pathname === API + '/home') {
      fail = false; return json({ ok: false, error: 'current_fixture_failure' }, 503);
    }
  } });
  const { page } = state;
  const before = await detailText(page);
  fail = true; await page.locator('#mh-refresh').click();
  await eventually('reader error is visible', async () => (await page.locator('#mh-inbox-message').textContent()).includes('current_fixture_failure'));
  check('current reader refresh error is visible with last good report retained', await page.locator('#mh-inbox-message').isVisible() && !await page.locator('#mh-editor').isVisible() && await detailText(page) === before);
  await page.locator('#mh-refresh').click();
  await eventually('same-data retry clears error', async () => await page.locator('#mh-errors').evaluate(e => e.hidden) && (await page.locator('#mh-inbox-message').textContent()).includes('My unread: 1'));
  check('same-data successful retry restores normal reader status and content', await detailText(page) === before);
  await finish(state);
}
async function staleList(afterFailure = false) {
  const name = afterFailure ? 'list-stale-failure' : 'list-stale-after-ack';
  const latch = hold(); let intercept = false;
  const state = await fixture(name, { reader: true, rows: [row()], api: async ({ url, method, request, state }) => {
    if (method === 'GET' && url.pathname === API + '/inbox' && intercept) {
      intercept = false; const stale = copy(state.model.rows);
      await waitHeld(latch, request);
      return afterFailure ? json({ ok: false, error: 'stale_fixture_failure' }, 503) : json({ ok: true, reports: stale, total: stale.length, files: [] });
    }
    if (method === 'POST' && url.pathname === API + '/ack') { state.model.rows[0].status = 'acknowledged'; state.model.rows[0].version++; return json({ ok: true }); }
  } });
  const { page } = state;
  intercept = true; await page.locator('#mh-refresh').click(); await eventually('older refresh pending', () => !!latch.request);
  await ackButton(page).click();
  await eventually('newer ack refresh rendered', async () => await page.locator('#mh-reports .mh-report-button').count() === 0);
  await releaseResponse(page, latch);
  check(name + ': obsolete same-date refresh cannot restore unread report', await page.locator('#mh-reports .mh-report-button').count() === 0 && (await page.locator('#mh-inbox-message').textContent()).includes('My unread: 0'));
  check(name + ': obsolete failure cannot replace successful response with error', await page.locator('#mh-errors').evaluate(e => e.hidden));
  await finish(state);
}
async function historyRace() {
  const queue = [], requests = [];
  const event = { version: 1, actor: 'fixture_reader', kind: 'acknowledged', detail: 'Earlier response fixture', created_at: Date.parse(NOW) };
  const result = (version, filtered_version = null, events = []) => ({ ok: true, current_version: version, filtered_version, limit: 50, has_more: false, events });
  const state = await fixture('history-delayed-filter-and-retry', { reader: true, rows: [row(41, { version: 2, status: 'acknowledged' }), row(42, { payload: { ...PAYLOAD, work: 'Other selected report' }, status: 'acknowledged' })], api: async ({ url, method, request }) => {
    if (method !== 'GET' || url.pathname !== API + '/followup-history') return;
    const plan = queue.shift(); assert(plan, 'Every history request is explicitly planned'); requests.push(url.search);
    if (plan.hold) await waitHeld(plan.hold, request);
    return json(plan.fail ? { ok: false, error: 'fixture_history_failure' } : plan.data, plan.fail ? 503 : 200);
  } });
  const { page } = state;
  await page.locator('#mh-list-options summary').click(); await page.locator('#mh-filter').selectOption('all');
  queue.push({ data: result(2, null, [event]) }); await historyButton(page).click();
  await eventually('history displayed', async () => (await detailText(page)).includes('Earlier response fixture'));
  check('history reports real storage versions and pre-transition response', (await detailText(page)).includes('Current stored version: v2') && (await detailText(page)).includes('pre-transition stored version v1'));
  const slow = hold(); queue.push({ hold: slow, data: result(2, null, [{ ...event, detail: 'Obsolete historical result' }]) });
  await historyButton(page).click(); await eventually('old history held', () => !!slow.request);
  queue.push({ data: result(2, 2) }); await page.locator('#mh-report-detail select').selectOption('current');
  await eventually('current empty history', async () => (await detailText(page)).includes('No events recorded against the current stored version'));
  await releaseResponse(page, slow);
  check('new history scope wins over late older response', requests.at(-1).includes('version=2') && !(await detailText(page)).includes('Obsolete historical result') && (await detailText(page)).includes('No events recorded against the current stored version'));
  queue.push({ fail: true }); await historyButton(page).click();
  await eventually('history error with retry', async () => (await detailText(page)).includes('Could not load history') && await historyButton(page).isEnabled());
  check('history failure clears previous successful content', !(await detailText(page)).includes('No events recorded against the current stored version'));
  queue.push({ data: result(3, 2, [event]) }); await historyButton(page).click();
  await eventually('history concurrent version warning', async () => (await detailText(page)).includes('stored version changed during this lookup'));
  queue.push({ data: result(3, 3) }); await historyButton(page).click();
  await eventually('history retry adopts authoritative version', async () => (await detailText(page)).includes('No events recorded against the current stored version'));
  check('retry sends server current version and never infers submission count', requests.at(-1).includes('version=3') && (await detailText(page)).includes('Stored versions count saves and responses, not submissions'));
  const detached = hold(); queue.push({ hold: detached, data: result(3, 3, [{ ...event, detail: 'Detached report history' }]) });
  await historyButton(page).click(); await eventually('detached history pending', () => !!detached.request);
  await page.locator('#mh-reports .mh-report-button').nth(1).click(); await releaseResponse(page, detached);
  check('report selection discards late history from detached panel', (await detailText(page)).includes('Other selected report') && !(await detailText(page)).includes('Detached report history'));
  await finish(state);
}
async function midnight(timezoneId) {
  const name = 'midnight-' + timezoneId.replaceAll('/', '-'), writes = [];
  const state = await fixture(name, { timezoneId, api: async ({ url, method, body, state }) => {
    if (method !== 'POST' || url.pathname !== API + '/save') return;
    writes.push(copy(body)); const r = saved(body); state.model.rows = [r]; return json({ ok: true, row: r, push: 'not_requested' });
  } });
  const { page } = state;
  check(name + ': server KST date, independent of browser zone', await page.locator('#mh-date').inputValue() === DAY);
  await page.locator('#mh-work').fill('Draft started before KST midnight');
  state.model.day = '2026-10-05';
  await bounded('cross KST midnight', page.clock.fastForward(61000));
  await eventually('minute refresh ran', () => state.apiRequests.filter(r => r.path.startsWith(API + '/home?')).length >= 2);
  check(name + ': browser clock has really crossed KST midnight', await page.evaluate(() => Date.now()) >= Date.parse('2026-10-04T15:00:00Z'));
  check(name + ': automatic refresh preserves explicit editor/list date and draft', await page.locator('#mh-date').inputValue() === DAY && await page.locator('#mh-list-date').inputValue() === DAY && await page.locator('#mh-work').inputValue() === 'Draft started before KST midnight');
  await page.locator('#mh-save').click();
  await eventually('old-date draft saved', async () => (await page.locator('#mh-save-status').textContent()).includes('Draft saved to server'));
  check(name + ': pending draft keeps original report date on save', writes.length === 1 && writes[0].report_date === DAY && !writes[0].submit);
  await page.reload({ waitUntil: 'domcontentloaded' }); await eventually('next day initialized', () => page.locator('#mh-work').isEnabled());
  check(name + ': reopening uses new server day without copying yesterday draft', await page.locator('#mh-date').inputValue() === '2026-10-05' && await page.locator('#mh-work').inputValue() === '');
  check(name + ': yesterday device draft stays separately recoverable', await page.evaluate(key => JSON.parse(localStorage.getItem(key))?.payload.work, 'mangoi_handover_v1:fixture_author:' + DAY) === 'Draft started before KST midnight');
  await finish(state);
}
async function notificationLabels() {
  const states = ['pending', 'queued', 'sent', 'no_subscription', 'failed', 'deferred', 'not_requested'];
  const labels = ['Pending', 'Queued', 'Wakeup accepted', 'No device subscription', 'Queue failed; retry pending', 'Deferred', 'Not requested'];
  const reports = states.map((state, i) => row(100 + i, { payload: { ...PAYLOAD, work: 'Fixture notification ' + state }, notifications: { read: { state }, followup: [] } }));
  const state = await fixture('notification-state-labels', { reader: true, rows: reports });
  const { page } = state;
  for (const [i, label] of labels.entries()) {
    await page.locator('#mh-reports .mh-report-button').nth(i).click();
    const text = await detailText(page);
    check('notification state ' + states[i] + ' is explicit without claiming receipt', text.includes(label) && text.includes('device receipt unverified'));
  }
  check('no fixture roster or default deadline policy is invented', (await page.locator('#mh-required').textContent()) === '' && !state.apiRequests.some(r => /\/(schedule|read-schedule|followup)$/.test(r.path)));
  await finish(state);
}

const cases = [
  ['save-response-retry', saveRetry], ['save-conflict-preserves-draft', saveConflict], ['save-edits-in-flight', editsDuringSave], ['review-delayed-edit', reviewRace],
  ['ack-response-retry', () => responseRetry('ack')], ['return-response-retry', () => responseRetry('return')],
  ['reader-error-unchanged-retry', readerRefreshRetry], ['list-stale-after-ack', () => staleList(false)], ['list-stale-failure', () => staleList(true)],
  ['history-delayed-filter-and-retry', historyRace], ['notification-state-labels', notificationLabels],
  ...['UTC', 'America/Los_Angeles', 'Asia/Seoul', 'Asia/Manila'].map(zone => ['midnight-' + zone.replaceAll('/', '-'), () => midnight(zone)]),
];
try {
  const interfaces = (await readFile('/proc/self/net/dev', 'utf8')).trim().split('\n').slice(2).map(line => line.trim().split(':')[0]).sort();
  check('namespace contains only loopback', JSON.stringify(interfaces) === '["lo"]', interfaces);
  const routes = (await readFile('/proc/net/route', 'utf8')).trim().split('\n').slice(1);
  check('namespace has no IPv4 default route', !routes.some(line => line.trim().split(/\s+/)[1] === '00000000'));
  const v6 = (await readFile('/proc/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean);
  check('namespace has no usable IPv6 default route', !v6.some(line => { const f = line.trim().split(/\s+/); return f[0] === '0'.repeat(32) && f[1] === '00' && !(parseInt(f[8], 16) & 0x200); }));
  assert(process.env.PW_DIR, 'PW_DIR must identify the isolated tool installation');
  const require = createRequire(import.meta.url);
  check('Playwright is pinned to 1.63.0', require(resolve(process.env.PW_DIR, 'node_modules/playwright-core/package.json')).version === '1.63.0');
  const { chromium } = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core'));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  report.browserVersion = browser.version();
  for (const [name, fn] of cases) await run(name, fn);
} catch (error) { report.failed++; report.lifecycleError = String(error); console.error(error.stack); }
finally {
  if (browser) { try { await bounded('browser cleanup', browser.close(), 10000); } catch (error) { report.failed++; report.cleanupError = String(error); } }
  if (report.cases.length !== cases.length) { report.failed++; report.incompleteCases = { completed: report.cases.length, required: cases.length }; }
  try { await persist(); } catch (error) { report.failed++; console.error('Report write failed: ' + error); }
  console.log(`${SUITE}: PASS ${report.passed} / FAIL ${report.failed} / SKIP 0`);
}
if (report.failed) process.exit(1);
