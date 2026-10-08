/**
 * PR1412 actual-page cancellation/Undo browser coverage.
 * Serve unchanged public/admin/student.html plus its actual assets. Only synthetic
 * intercepted responses; no listener, request passthrough, Worker, D1, or provider.
 * Run ONLY in the existing authorized isolated CI namespace with cleared env and
 * official pinned Playwright 1.63.0.
 * Source-level guard fault inputs below alter data, never shipped functions/HTML.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, NOW, SOURCE_COMMIT, SOURCE_TREE, SOURCE_PAGE_SHA256, PAGE_PATH, seedRows, json, nextSyntheticStatus,
  isPreviewRequest, auxiliaryRead, deferred } from './termination-fixture-data.mjs';

assert(process.env.TERMINATION_BROWSER_OUTPUT, 'TERMINATION_BROWSER_OUTPUT is required');
const ROOT = await realpath(process.env.TERMINATION_SOURCE_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const PUB = await realpath(resolve(ROOT, 'cloudflare-deploy/public'));
const OUT = resolve(process.env.TERMINATION_BROWSER_OUTPUT);
assert(OUT !== ROOT && !OUT.startsWith(ROOT + sep), 'Keep evidence outside the frozen checkout');
await mkdir(OUT, { recursive: true });
let browser, activeCase;
const contexts = new Set();
const report = { baselineCommit: SOURCE_COMMIT, baselineTree: SOURCE_TREE,
  testedCommit: process.env.TERMINATION_SOURCE_COMMIT || null, testedTree: process.env.TERMINATION_SOURCE_TREE || null,
  sourcePage: 'cloudflare-deploy/public/admin/student.html', sourcePageSha256: null,
  reviewedPageSha256: SOURCE_PAGE_SHA256,
  coverage: { browser: 'actual unmodified shipped page and assets; synthetic HTTP only',
    identity: 'native A-to-B navigation, mixed-account rows, and labeled preview-context fault input',
    excluded: ['D1 atomicity', 'Worker authorization', 'live data', 'Cafe24', 'policy changes', 'group acceptance changes'] },
  cases: [], checks: [], requests: [], staticAssets: [], denied: [], unknownReads: [], unexpectedWrites: [],
  routeErrors: [], pageErrors: [], dialogs: [], screenshots: [], browserVersion: null };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webp': 'image/webp' };
function check(name, value, detail) {
  report.checks.push({ case: activeCase?.name, name, passed: !!value, ...(detail === undefined ? {} : { detail }) });
  if (!value) throw new Error(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail)));
  console.log('PASS ' + name);
}
async function bounded(label, promise, ms = 12000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out: ' + label)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function saveReport() {
  report.summary = { passed: report.cases.filter(c => c.status === 'passed').length,
    failed: report.cases.filter(c => c.status === 'failed').length, skipped: 0,
    assertionsPassed: report.checks.filter(c => c.passed).length,
    assertionsFailed: report.checks.filter(c => !c.passed).length };
  await writeFile(resolve(OUT, 'termination-fixture-report.json'), JSON.stringify(report, null, 2) + '\n');
}
async function run(name, fn) {
  activeCase = { name, status: 'running' }; report.cases.push(activeCase);
  try { await bounded(name, fn(), 90000); activeCase.status = 'passed'; }
  catch (error) { activeCase.status = 'failed'; activeCase.error = String(error); throw error; }
  finally { await saveReport(); }
}
function responseHold(value) {
  const started = deferred(), gate = deferred(), sent = deferred();
  return { value, started: started.promise, sent: sent.promise,
    release: () => gate.resolve(), gate: gate.promise, entered: () => started.resolve(), finish: () => sent.resolve() };
}
async function fixture({ width = 1360, language = 'en', journal = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Seoul',
    locale: language === 'ko' ? 'ko-KR' : 'en-US', serviceWorkers: 'block', acceptDownloads: false });
  contexts.add(context); context.setDefaultTimeout(12000);
  await context.clock.setFixedTime(new Date(NOW));
  const local = { rows: seedRows(), previewQueue: [], mutationQueue: [], reads: [], mutations: [],
    accept: true, dialogs: [], restore: { ok: true, restored: true }, restoreStatus: 200 };
  if (journal) for (const row of local.rows) if (journal.some(item => item.id === row.id)) row.status = 'cancelled';
  await context.addInitScript(({ base, language, journal, now }) => {
    if (location.origin !== base) return;
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => true });
    localStorage.setItem('mangoi_lang', language);
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'fixture_admin', role: 'hq_exec', pref_lang: language }));
    localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
    if (journal && !sessionStorage.getItem('termination-journal-seeded')) {
      localStorage.setItem('mgsEndBatch:fixture_A', JSON.stringify({ at: Date.parse(now), items: journal }));
      sessionStorage.setItem('termination-journal-seeded', '1');
    }
  }, { base: BASE, language, journal, now: NOW });
  await context.routeWebSocket('**/*', socket => {
    report.denied.push({ case: activeCase?.name, kind: 'websocket', url: socket.url() });
    socket.close({ code: 1008, reason: 'Synthetic fixture only' });
  });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const record = { case: activeCase?.name, method, path: url.pathname + url.search };
    report.requests.push(record);
    try {
      if (url.origin !== BASE) { report.denied.push(record); return await route.abort('blockedbyclient'); }
      if (url.pathname.startsWith('/api/')) {
        if (isPreviewRequest(url, method)) {
          const value = local.previewQueue.shift() || { body: { ok: true, items: structuredClone(local.rows) }, status: 200 };
          local.reads.push({ ...record, index: local.reads.length + 1 });
          if (value.gate) { value.entered(); await value.gate; }
          await route.fulfill(json(value.body || value.value?.body, value.status || value.value?.status || 200));
          if (value.finish) value.finish();
          return;
        }
        if (method === 'GET' && url.pathname === '/api/admin/class-schedules'
          && ['fixture_A', 'fixture_B'].includes(url.searchParams.get('user_id')) && url.searchParams.has('offset')) {
          const rows = structuredClone(local.rows);
          return await route.fulfill(json({ ok: true, items: rows, count: rows.length, has_more: false, next_offset: null, complete: true }));
        }
        if (method === 'GET') {
          const response = auxiliaryRead(url);
          if (response !== undefined) return await route.fulfill(json(response));
          report.unknownReads.push(record); return await route.fulfill(json({ ok: false, error: 'fixture_read_unconfigured' }, 503));
        }
        // The shipped EN sweep may ask to translate unrelated Korean labels.
        // Its explicit empty synthetic response never calls any translation provider.
        if (method === 'POST' && url.pathname === '/api/i18n/translate') {
          record.kind = 'synthetic-translation'; return await route.fulfill(json({ ok: true, map: {} }));
        }
        const match = url.pathname.match(/^\/api\/admin\/class-schedules\/(\d+)$/);
        if (match && ['DELETE', 'POST'].includes(method)) {
          const id = Number(match[1]), body = req.postDataJSON();
          assert(local.rows.some(row => row.id === id), 'mutation uses known synthetic row');
          assert(method === 'DELETE' ? typeof body.reason === 'string' : JSON.stringify(body) === '{"action":"restore"}', 'only intended mutation body');
          local.mutations.push({ id, method, body }); record.body = body;
          const held = local.mutationQueue.shift();
          if (held) { held.entered(); await held.gate; }
          const value = held?.value || (method === 'DELETE' ? { body: { ok: true }, status: 200 }
            : { body: local.restore, status: local.restoreStatus });
          const row = local.rows.find(row => row.id === id);
          // An unknown restore keeps the prior cancelled state; ok:true alone
          // never makes a row active. Explicit returned statuses remain faithful.
          row.status = nextSyntheticStatus(row.status, method, value.status, value.body);
          await route.fulfill(json(value.body, value.status));
          if (held) held.finish();
          return;
        }
        report.unexpectedWrites.push(record); return await route.abort('blockedbyclient');
      }
      if (method !== 'GET') { report.unexpectedWrites.push(record); return await route.abort('blockedbyclient'); }
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) {
        report.denied.push(record); return await route.abort('blockedbyclient');
      }
      let file;
      try { file = await realpath(resolve(PUB, '.' + decoded)); }
      catch { report.denied.push({ ...record, kind: 'missing-static-asset' }); return await route.fulfill({ status: 404, body: 'Missing fixture asset' }); }
      if (!file.startsWith(PUB + sep)) { report.denied.push(record); return await route.abort('blockedbyclient'); }
      const bytes = await readFile(file);
      report.staticAssets.push({ path: url.pathname, sha256: createHash('sha256').update(bytes).digest('hex') });
      return await route.fulfill({ status: 200, contentType: MIME[extname(file)] || 'application/octet-stream',
        headers: { 'cache-control': 'no-store' }, body: bytes });
    } catch (error) {
      report.routeErrors.push({ ...record, error: String(error) });
      try { await route.abort('failed'); } catch {}
    }
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push({ case: activeCase?.name, error: String(error) }));
  page.on('dialog', async dialog => {
    const record = { case: activeCase?.name, type: dialog.type(), message: dialog.message(), accepted: local.accept };
    local.dialogs.push(record); report.dialogs.push(record);
    await (local.accept ? dialog.accept() : dialog.dismiss());
  });
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setBypassServiceWorker', { bypass: true });
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  const navigate = async student => {
    await page.goto(BASE + PAGE_PATH + '?uid=' + student + '&lang=' + language);
    await page.waitForFunction(student => typeof _state !== 'undefined' && _state.full?.erp?.user_id === student
      && document.getElementById('endFromDate').value !== '', student);
    await page.locator('.tab[data-tab="extension"]').click();
    await page.locator('#endClassCard').waitFor({ state: 'visible' });
  };
  await navigate('fixture_A');
  return { page, local, context, navigate, close: async () => {
    await page.waitForLoadState('networkidle'); await context.close(); contexts.delete(context);
  } };
}
async function preview(f, from = '2026-10-08') {
  await f.page.locator('#endFromDate').fill(from);
  await f.page.locator('#endPreviewBtn').click();
  await f.page.waitForFunction(() => _endPreviewContext && _endPlan.length > 0 && !document.getElementById('endRunBtn').disabled);
}
async function settled(page) {
  // Wait beyond native fetch body consumption, without replacing fetch or handlers.
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => setTimeout(done, 0))));
}
async function releasePreview(f, held) {
  const response = f.page.waitForResponse(r => isPreviewRequest(new URL(r.url()), r.request().method()));
  held.release(); await bounded('held preview fulfilled', held.sent);
  const native = await bounded('held native preview response', response); await native.finished();
  await settled(f.page);
}
async function runAndWait(f) {
  await f.page.locator('#endRunBtn').click();
  await f.page.waitForFunction(() => !_endRunning && /Ended|종료했습니다/.test(document.getElementById('endPreviewBox').innerText));
}
const ids = f => f.local.mutations.map(m => m.id).join(',');
const journal = page => page.evaluate(() => JSON.parse(localStorage.getItem('mgsEndBatch:fixture_A') || 'null'));
async function screenshot(f, name) {
  const path = name + '.png';
  await f.page.locator('#endClassCard').screenshot({ path: resolve(OUT, path) });
  report.screenshots.push({ case: activeCase?.name, path });
}

async function main() {
  const interfaces = (await readFile('/proc/self/net/dev', 'utf8')).trim().split('\n').slice(2).map(x => x.trim().split(':')[0]).sort();
  check('only loopback interface', JSON.stringify(interfaces) === '["lo"]');
  check('no IPv4 default route', !(await readFile('/proc/net/route', 'utf8')).trim().split('\n').slice(1).some(x => x.trim().split(/\s+/)[1] === '00000000'));
  check('no usable IPv6 default route', !(await readFile('/proc/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean).some(x => {
    const a = x.trim().split(/\s+/); return a[0] === '0'.repeat(32) && a[1] === '00' && !(parseInt(a[8], 16) & 0x200);
  }));
  assert(process.env.PW_DIR && process.env.PLAYWRIGHT_BROWSERS_PATH, 'Pinned official browser installation is required');
  const require = createRequire(import.meta.url);
  check('Playwright pinned 1.63.0', require(resolve(process.env.PW_DIR, 'node_modules/playwright-core/package.json')).version === '1.63.0');
  report.sourcePageSha256 = createHash('sha256').update(await readFile(resolve(PUB, '.' + PAGE_PATH))).digest('hex');
  const { chromium } = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core'));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  report.browserVersion = browser.version();

  for (const width of [390, 1360]) await run('confirmed-snapshot-and-duplicate-run/' + width, async () => {
    const f = await fixture({ width }); await preview(f);
    const text = await f.page.locator('#endPreviewBox').innerText();
    check(width + ' visible selected own dates and teacher', text.includes('2 class(es) will be ended:')
      && text.includes('2026-10-08 19:00') && text.includes('2026-10-16 19:00') && text.includes('Synthetic Teacher'));
    check(width + ' cross-account and cancelled dates absent', !text.includes('2026-10-17') && !text.includes('2026-10-18'));
    check(width + ' existing repeating-row and Cafe24 guidance retained', text.includes('weekly (repeating)') && text.includes('Cafe24'));
    check(width + ' preview preserves own cross-enrollment identities', await f.page.evaluate(() => _endPlan.map(x => x.source).join(',')) === 'adm-enroll:order_A,adm-enroll:order_B');
    await screenshot(f, 'selected-own-classes-' + width);
    f.local.accept = false; await f.page.locator('#endRunBtn').click();
    check(width + ' dismissed confirmation writes nothing and preserves preview', f.local.mutations.length === 0 && !await f.page.locator('#endRunBtn').isDisabled());
    f.local.accept = true;
    const held = responseHold({ body: { ok: true }, status: 200 }); f.local.mutationQueue.push(held);
    await f.page.locator('#endReason').fill('Synthetic confirmed reason');
    await f.page.locator('#endRunBtn').click(); await bounded('first DELETE held', held.started);
    check(width + ' executing date reason preview and run are disabled', await f.page.locator('#endFromDate').isDisabled()
      && await f.page.locator('#endReason').isDisabled() && await f.page.locator('#endPreviewBtn').isDisabled() && await f.page.locator('#endRunBtn').isDisabled());
    const readCount = f.local.reads.length, confirmations = f.local.dialogs.length;
    f.local.rows.push({ ...seedRows()[1], id: 6, scheduled_date: '2026-10-20' });
    // Labeled adversarial input: disabled DOM fields can still be changed by script.
    // Actual functions must retain the confirmed batch even if such a change occurs.
    await f.page.evaluate(async () => { document.getElementById('endFromDate').value = '2026-10-15';
      endClassesInvalidatePreview(); await endClassesPreview(); await endClassesRun(); });
    check(width + ' reentrant run and preview do not start again', f.local.reads.length === readCount
      && f.local.mutations.length === 1 && f.local.dialogs.length === confirmations);
    held.release(); await bounded('DELETE delivered', held.sent);
    await f.page.waitForFunction(() => !_endRunning && /Ended 2/.test(document.getElementById('endPreviewBox').innerText));
    check(width + ' executes exactly the confirmed row snapshot', ids(f) === '1,2'
      && f.local.mutations.every(x => x.method === 'DELETE' && x.body.reason === 'Synthetic confirmed reason'), f.local.mutations);
    check(width + ' journal stores only successful confirmed rows', (await journal(f.page)).items.map(x => x.id).join(',') === '1,2');
    check(width + ' controls unlock but fresh preview remains required', !await f.page.locator('#endFromDate').isDisabled() && await f.page.locator('#endRunBtn').isDisabled());
    await f.close();
  });

  for (const event of ['input', 'change', 'silent']) await run('date-invalidation/' + event, async () => {
    const f = await fixture(); await preview(f);
    await f.page.locator('#endFromDate').evaluate((el, event) => { el.value = '2026-10-15';
      if (event !== 'silent') el.dispatchEvent(new Event(event, { bubbles: true })); }, event);
    if (event === 'silent') await f.page.locator('#endRunBtn').click();
    else check(event + ' edit immediately disables real run button', await f.page.locator('#endRunBtn').isDisabled());
    await f.page.evaluate(() => endClassesRun());
    check(event + ' changed date never confirms or mutates old selection', f.local.dialogs.length === 0 && f.local.mutations.length === 0 && await f.page.locator('#endRunBtn').isDisabled());
    await f.close();
  });

  await run('pending-repreview-invalidates-prior-plan', async () => {
    const f = await fixture(); await preview(f);
    const held = responseHold({ body: { ok: false, error: 'latest_failed' }, status: 503 }); f.local.previewQueue.push(held);
    await f.page.locator('#endPreviewBtn').click(); await bounded('repreview held', held.started);
    check('pending latest request clears old plan and disables run', await f.page.locator('#endRunBtn').isDisabled()
      && await f.page.evaluate(() => _endPlan.length === 0 && _endPreviewContext === null));
    await f.page.evaluate(() => endClassesRun());
    check('run while new preview is pending never confirms or writes', f.local.dialogs.length === 0 && f.local.mutations.length === 0);
    await releasePreview(f, held); await f.page.evaluate(() => endClassesRun());
    check('latest failure keeps prior IDs unusable and shows load feedback', f.local.mutations.length === 0
      && await f.page.locator('#endRunBtn').isDisabled() && (await f.page.locator('#endPreviewBox').innerText()).includes('latest_failed'));
    await f.close();
  });

  for (const scope of ['same-date-generation', 'changed-date']) for (const oldResult of ['success', 'failure']) {
    await run('out-of-order/' + scope + '/' + oldResult, async () => {
      const f = await fixture();
      const oldBody = oldResult === 'success' ? { ok: true, items: [seedRows()[0]] } : { ok: false, error: 'obsolete_failure' };
      const held = responseHold({ body: oldBody, status: oldResult === 'success' ? 200 : 503 }); f.local.previewQueue.push(held);
      await f.page.locator('#endPreviewBtn').click(); await bounded('old preview held', held.started);
      if (scope === 'changed-date') await f.page.locator('#endFromDate').fill('2026-10-15');
      f.local.previewQueue.push({ body: { ok: true, items: [seedRows()[1]] }, status: 200 });
      await f.page.locator('#endPreviewBtn').click();
      await f.page.waitForFunction(() => _endPlan.length === 1 && _endPlan[0].id === 2);
      const before = await f.page.locator('#endPreviewBox').innerText();
      await releasePreview(f, held);
      check(scope + ' stale ' + oldResult + ' cannot replace newer visible preview', (await f.page.locator('#endPreviewBox').innerText()) === before
        && !await f.page.locator('#endRunBtn').isDisabled());
      await runAndWait(f);
      check(scope + ' stale ' + oldResult + ' cannot change executed ID', ids(f) === '2');
      await f.close();
    });
  }

  await run('date-edited-during-pending-preview', async () => {
    const f = await fixture();
    const held = responseHold({ body: { ok: true, items: seedRows() }, status: 200 }); f.local.previewQueue.push(held);
    await f.page.locator('#endPreviewBtn').click(); await bounded('preview held before date edit', held.started);
    await f.page.locator('#endFromDate').fill('2026-10-15'); await releasePreview(f, held);
    await f.page.evaluate(() => endClassesRun());
    check('date edit leaves late response invalid without new preview', f.local.mutations.length === 0 && f.local.dialogs.length === 0
      && await f.page.locator('#endRunBtn').isDisabled() && await f.page.evaluate(() => _endPlan.length === 0));
    await f.close();
  });

  await run('stale-success-after-newer-failure', async () => {
    const f = await fixture();
    const held = responseHold({ body: { ok: true, items: seedRows() }, status: 200 }); f.local.previewQueue.push(held);
    await f.page.locator('#endPreviewBtn').click(); await bounded('obsolete request held', held.started);
    f.local.previewQueue.push({ body: { ok: false, error: 'latest_failure' }, status: 503 });
    await f.page.locator('#endPreviewBtn').click();
    await f.page.waitForFunction(() => document.getElementById('endPreviewBox').innerText.includes('latest_failure'));
    const before = await f.page.locator('#endPreviewBox').innerText(); await releasePreview(f, held);
    await f.page.evaluate(() => endClassesRun());
    check('old success cannot hide newer failure or restore executability', (await f.page.locator('#endPreviewBox').innerText()) === before
      && await f.page.locator('#endRunBtn').isDisabled() && f.local.mutations.length === 0);
    await f.close();
  });

  await run('student-identity-context-fault', async () => {
    const f = await fixture(); await preview(f);
    // uid is a shipped const. Corrupt only the cached response context to exercise
    // its identity guard; this is not presented as native dynamic student switching.
    await f.page.evaluate(() => { _endPreviewContext.uid = 'fixture_B'; });
    await f.page.locator('#endRunBtn').click();
    check('foreign cached student context cannot confirm or execute', f.local.dialogs.length === 0 && f.local.mutations.length === 0 && await f.page.locator('#endRunBtn').isDisabled());
    await f.close();
  });

  await run('native-student-navigation-isolates-preview-and-journal', async () => {
    const f = await fixture({ journal: [{ id: 1, date: '2026-10-08', time: '19:00' }] });
    await preview(f); check('A journal is visibly available', await f.page.locator('#endUndoBtn').isVisible());
    await f.navigate('fixture_B');
    check('B navigation has no inherited preview or A Undo', await f.page.locator('#endRunBtn').isDisabled() && await f.page.locator('#endUndoBtn').count() === 0);
    await preview(f, '2026-10-15');
    check('B preview request contains B identity', f.local.reads.at(-1).path.includes('user_id=fixture_B'));
    const text = await f.page.locator('#endPreviewBox').innerText();
    check('B visible preview excludes A dates', text.includes('2026-10-17') && !text.includes('2026-10-16') && !text.includes('2026-10-08'));
    await runAndWait(f); check('B executes only its displayed row', ids(f) === '4');
    check('B execution preserves A journal', (await journal(f.page)).items.map(x => x.id).join(',') === '1');
    await f.close();
  });

  const undoCases = [
    { name: 'restored', body: { ok: true, restored: true }, status: 200, success: true, language: 'en' },
    { name: 'not-cancelled-active', body: { ok: false, error: 'not_cancelled', status: 'active' }, status: 409, success: true, language: 'en' },
    { name: 'not-cancelled-completed', body: { ok: false, error: 'not_cancelled', status: 'completed' }, status: 409, success: false, language: 'en' },
    { name: 'not-cancelled-unknown', body: { ok: false, error: 'not_cancelled' }, status: 409, success: false, language: 'en' },
    { name: 'unconfirmed-en', body: { ok: false, error: 'restore_failed' }, status: 503, success: false, language: 'en', refresh: true },
    { name: 'unconfirmed-ko', body: { ok: false, error: 'restore_failed' }, status: 503, success: false, language: 'ko', refresh: true },
  ];
  for (const item of undoCases) await run('undo/' + item.name, async () => {
    const f = await fixture({ language: item.language, journal: [{ id: 1, date: '2026-10-08', time: '19:00' }] });
    f.local.restore = item.body; f.local.restoreStatus = item.status;
    await f.page.locator('#endUndoBtn').click();
    await f.page.waitForFunction(() => !_endRunning && /Restored|되살렸습니다/.test(document.getElementById('endPreviewBox').innerText));
    const text = await f.page.locator('#endPreviewBox').innerText(), saved = await journal(f.page);
    check(item.name + ' actual Undo posts restore for saved row', f.local.mutations.length === 1
      && f.local.mutations[0].id === 1 && f.local.mutations[0].method === 'POST' && f.local.mutations[0].body.action === 'restore');
    check(item.name + ' visible count matches verified restore outcome', item.success ? text.includes('Restored 1') : /Restored 0|0건 되살렸습니다/.test(text));
    check(item.name + ' journal retains only unresolved work', item.success ? saved === null && await f.page.locator('#endUndoBtn').count() === 0
      : saved?.items.length === 1 && saved.items[0].id === 1 && await f.page.locator('#endUndoBtn').isEnabled());
    check(item.name + ' synthetic row preserves returned or unresolved status', f.local.rows.find(row => row.id === 1).status
      === (item.success ? 'active' : item.body.status || 'cancelled'));
    if (item.refresh) check(item.name + ' translated refresh feedback hides raw backend code', /refresh|새로고침/.test(text) && !text.includes('restore_failed'));
    else if (!item.success) check(item.name + ' failure asks to check status', text.includes('not restored 1') && text.includes('check the current status'));
    await screenshot(f, 'undo-' + item.name);
    await f.close();
  });

  await run('undo-serializes-preview-run-and-duplicate-undo', async () => {
    const f = await fixture({ journal: [{ id: 1, date: '2026-10-08', time: '19:00' }] }); await preview(f);
    const held = responseHold({ body: { ok: true, restored: true }, status: 200 }); f.local.mutationQueue.push(held);
    await f.page.locator('#endUndoBtn').click(); await bounded('Undo held', held.started);
    const reads = f.local.reads.length, confirmations = f.local.dialogs.length;
    check('Undo locks preview input and both actions', await f.page.locator('#endFromDate').isDisabled()
      && await f.page.locator('#endPreviewBtn').isDisabled() && await f.page.locator('#endRunBtn').isDisabled() && await f.page.locator('#endUndoBtn').isDisabled());
    await f.page.evaluate(async () => { await endClassesUndo(); await endClassesPreview(); await endClassesRun(); });
    check('overlapping actions do not duplicate reads writes or confirmations', f.local.reads.length === reads && f.local.mutations.length === 1 && f.local.dialogs.length === confirmations);
    held.release(); await bounded('Undo delivered', held.sent);
    await f.page.waitForFunction(() => !_endRunning && document.getElementById('endPreviewBox').innerText.includes('Restored 1'));
    check('Undo unlocks inputs and requires new preview', !await f.page.locator('#endFromDate').isDisabled() && await f.page.locator('#endRunBtn').isDisabled());
    await f.close();
  });

  check('all 21 behavior cases ran', report.cases.length === 21 && report.cases.every(c => c.status === 'passed'));
  check('no unconfigured API read', report.unknownReads.length === 0, report.unknownReads);
  check('no outbound or missing asset request', report.denied.length === 0, report.denied);
  check('no unexpected mutation', report.unexpectedWrites.length === 0, report.unexpectedWrites);
  check('no route handler errors', report.routeErrors.length === 0, report.routeErrors);
  check('no page errors', report.pageErrors.length === 0, report.pageErrors);
  const pages = report.staticAssets.filter(x => x.path === PAGE_PATH);
  check('all served student pages match current checkout bytes', pages.length > 0 && pages.every(x => x.sha256 === report.sourcePageSha256));
  check('checkout page remained unchanged during browser execution', createHash('sha256')
    .update(await readFile(resolve(PUB, '.' + PAGE_PATH))).digest('hex') === report.sourcePageSha256);
  console.log(`student-termination-browser: PASS ${report.checks.length} / FAIL 0 / SKIP 0`);
}
try { await main(); }
catch (error) {
  report.failure = String(error);
  if (!activeCase || activeCase.status === 'passed') report.cases.push({ name: browser ? 'fixture-accounting' : 'browser-preflight', status: 'failed', error: String(error) });
  for (const context of contexts) for (const page of context.pages()) {
    try { await bounded('failure screenshot', page.screenshot({ path: resolve(OUT, 'failure.png'), timeout: 5000 }), 6000); } catch {}
  }
  throw error;
} finally { await saveReport(); if (browser) await browser.close(); }
