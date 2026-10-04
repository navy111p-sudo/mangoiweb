// Deterministic execution of the shipped list loader. No HTTP, browser, DB or
// providers. Fixture promises model network order; only rendering is stubbed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../cloudflare-deploy/public/js/daily-handover.js', import.meta.url), 'utf8');
const start = source.indexOf('  var listSequence=0;');
const end = source.indexOf("  $('write-toggle').onclick", start);
assert(start >= 0 && end > start, 'Locate shipped list sequencing and loader');
const loader = source.slice(start, end);
let checks = 0;
function ok(label, test) { assert(test, label); checks++; console.log('PASS ' + label); }
function fixture(script = loader) {
  const pending = [], paints = [], own = [], required = [];
  const elements = { date: { value: '2026-10-04' }, 'list-date': { value: '2026-10-04' }, filter: { value: 'unread' }, editor: { hidden: true }, errors: { hidden: true, textContent: '' }, 'inbox-message': { textContent: '' }, 'save-status': { textContent: '' } };
  const state = { $: id => elements[id], reports: [], inbox: [], inboxTotal: 0, readHistory: [], mine: [], lastListState: null, readerError: false,
    call: path => new Promise((resolve, reject) => pending.push({ path, resolve, reject })),
    mergeFiles() {}, paintOwn: row => own.push(row), paintRequired: (rows, date) => required.push({ rows, date }),
    paintList: () => { elements['inbox-message'].textContent = 'Unread: ' + state.inboxTotal; paints.push({ reports: state.reports, inbox: state.inbox, readHistory: state.readHistory, mine: state.mine, mode: elements.filter.value }); },
    JSON, Promise, encodeURIComponent };
  vm.createContext(state); vm.runInContext(source.slice(source.indexOf('  function say('), source.indexOf('  function node(')), state); vm.runInContext(script, state);
  return { state, elements, pending, paints, own, required,
    begin() { const from = pending.length, work = state.loadList(); return { work, requests: pending.slice(from) }; } };
}
function resolve(request, label, { count = 1 } = {}) {
  for (const pending of request.requests) {
    if (pending.path.startsWith('/home?')) pending.resolve({ reports: [{ label }], files: [], own: { label }, required: [{ label }] });
    else pending.resolve({ reports: count ? [{ label, status: 'submitted' }] : [], total: count, files: [] });
  }
}
async function sameDate(script = loader) {
  const f = fixture(script), old = f.begin(), newer = f.begin();
  resolve(newer, 'acknowledged', { count: 0 }); await newer.work;
  resolve(old, 'stale submitted v1'); await old.work;
  return f;
}
let f = await sameDate();
ok('late same-date refresh cannot restore the acknowledged unread row', f.state.inboxTotal === 0 && f.state.inbox.length === 0);
ok('late refresh cannot repaint own status or required overview', f.paints.length === 1 && f.own.length === 1 && f.own[0].label === 'acknowledged' && f.required.length === 1);
// Prove the prior implementation actually loses this race: remove only the
// generation checks in-memory. The date guard remains, as in the shipped bug.
const mutated = loader.replaceAll('request!==listSequence||', '');
const prior = await sameDate(mutated);
ok('negative control: old date-only guard reintroduces submitted v1', prior.state.inboxTotal === 1 && prior.state.inbox[0].label === 'stale submitted v1');

f = fixture(); let old = f.begin(), newer = f.begin();
resolve(newer, 'latest'); await newer.work;
old.requests[0].reject(new Error('obsolete error')); old.requests[1].resolve({ reports: [], total: 0 });
await assert.doesNotReject(old.work);
ok('superseded failure stays silent and keeps latest content', f.paints.length === 1 && f.state.reports[0].label === 'latest');

f = fixture(); const current = f.begin(), failure = new Error('current request failed');
current.requests[0].reject(failure); current.requests[1].resolve({ reports: [], total: 0 });
await assert.rejects(current.work, e => e === failure);
ok('current failure still propagates for existing retry/error UI', f.paints.length === 0);

for (const fail of [false, true]) {
  f = fixture(); old = f.begin(); f.elements['list-date'].value = '2026-10-05';
  if (fail) { old.requests[0].reject(new Error('old-date error')); old.requests[1].resolve({ reports: [], total: 0 }); }
  else resolve(old, 'wrong date');
  await assert.doesNotReject(old.work);
  ok('changed date suppresses older ' + (fail ? 'error' : 'response'), f.paints.length === 0);
}

f = fixture(); old = f.begin();
f.elements['list-date'].value = '2026-10-05'; const middle = f.begin();
f.elements['list-date'].value = '2026-10-04'; newer = f.begin();
resolve(newer, 'new date-A result'); await newer.work;
resolve(middle, 'date-B result'); await middle.work;
resolve(old, 'obsolete date-A result'); await old.work;
ok('date A to B to A cannot revive the first A request', f.paints.length === 1 && f.state.reports[0].label === 'new date-A result');

f = fixture(); f.elements.filter.value = 'read'; old = f.begin();
f.elements.filter.value = 'mine'; newer = f.begin();
resolve(newer, 'mine result'); await newer.work; resolve(old, 'old read result'); await old.work;
ok('history/mine filters keep current request endpoints', old.requests.some(r => r.path === '/read-history') && newer.requests.some(r => r.path === '/mine'));
ok('old filter response cannot repaint the newer mine view', f.paints.length === 1 && f.state.mine[0].label === 'mine result' && f.state.readHistory.length === 0);
// Local-only all/unread changes do not request another load. Preserve the
// original behavior: a still-current request updates data and paints that filter.
f = fixture(); f.elements.filter.value = 'mine'; old = f.begin();
f.elements.filter.value = 'all'; resolve(old, 'current result'); await old.work;
ok('local-only filter change preserves existing current-response behavior', f.paints.length === 1 && f.paints[0].mode === 'all');

// Reader failures must not be trapped inside the hidden composer. These tests
// execute shipped say/loadList with visible-status element stubs; the browser
// suite verifies actual computed visibility and unchanged-data retry recovery.
f = fixture(); old = f.begin(); resolve(old, 'unchanged'); await old.work;
f.state.say('Visible reader retry failure', true);
ok('reader failure uses visible status text while preserving normal error state', f.elements['inbox-message'].textContent === 'Visible reader retry failure' && !f.elements.errors.hidden && f.state.readerError);
newer = f.begin(); resolve(newer, 'unchanged'); await newer.work;
ok('successful identical-data retry clears reader error and repaints status', f.elements.errors.hidden && !f.state.readerError && f.elements['inbox-message'].textContent === 'Unread: 1' && f.paints.length === 2);
f.elements.editor.hidden = false; f.state.say('Editor validation failure', true);
newer = f.begin(); resolve(newer, 'unchanged'); await newer.work;
ok('ordinary list refresh does not erase composer validation error', !f.elements.errors.hidden && f.elements.errors.textContent === 'Editor validation failure' && !f.state.readerError && f.paints.length === 2);

console.log(`daily_handover_client_race: PASS ${checks} / FAIL 0 / SKIP 0`);
