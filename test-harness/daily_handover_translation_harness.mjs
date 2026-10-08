// Execute the shipped translation, payload renderer, list renderer and refresh
// functions with a synthetic DOM and controlled promises. No browser/providers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../cloudflare-deploy/public/js/daily-handover.js', import.meta.url), 'utf8');
function cut(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'Locate shipped ' + start);
  return source.slice(a, b);
}
const shipped = cut('  function node(', '  function clock(')
  + cut('  function row(', '  function preview(')
  + cut('  var koCache=', '  function notificationLabel(')
  + cut('  var listSequence=', "  $('write-toggle').onclick");
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const copy = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function report(id = 41, version = 1, work = 'Work v1') {
  return { id, version, username: 'author', recipient: 'reader', staff_name: 'Author', status: 'submitted',
    report_date: '2026-10-08', updated_at: 1000, payload: { work, no_issue: true, issue: '', no_open: true,
      open: '', owner: '', deadline: '', student: '', class_info: '', attachments: [], priority: 'normal' } };
}
class Element {
  constructor(tag = 'div') { this.tag = tag; this.style = {}; this.children = []; this.parent = null; this.root = false; this.value = ''; this.disabled = false; this.className = ''; this.text = ''; }
  get isConnected() { return this.root || !!this.parent?.isConnected; }
  set textContent(value) { this.replaceChildren(); this.text = String(value); }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren() { for (const child of this.children) child.parent = null; this.children = []; this.text = ''; }
  setAttribute() {}
  querySelector(selector) { for (const child of this.children) { if (child.className.split(' ').includes(selector.slice(1))) return child; const found = child.querySelector(selector); if (found) return found; } return null; }
}
function fixture(script = shipped) {
  const elements = {}, requests = [], actions = [];
  for (const id of ['reports', 'report-detail', 'filter', 'list-date', 'date', 'reread', 'mine', 'inbox-message', 'errors']) {
    elements[id] = new Element(); elements[id].root = true;
  }
  elements.filter.value = 'unread'; elements.date.value = elements['list-date'].value = '2026-10-08';
  let serverRows = [report()];
  const context = { document: { createElement: tag => new Element(tag) }, $: id => elements[id],
    labels: { work: 'Work', issue: 'Issue', open: 'Open' }, members: [], me: { username: 'reader' },
    root: { dataset: { exec: 'false' } }, selected: null, largeReading: false, inboxTotal: 1,
    reports: [], inbox: [], mine: [], readHistory: [], lastListState: null, readerError: false,
    statusLabel: x => x, mineSummary: () => '', paintReportStatus() {}, paintFollowup() {},
    attachmentLinks: () => new Element(), ownStatusText: () => '', openEditor() {},
    paintOwn() {}, paintRequired() {}, mergeFiles() {},
    act: (row, kind) => actions.push({ id: row.id, version: row.version, kind }),
    call: async path => path.startsWith('/home?')
      ? { reports: copy(serverRows), files: [], required: [], own: null }
      : { reports: copy(serverRows), total: serverRows.length, files: [] },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, body: JSON.parse(options.body), resolve, reject })) };
  context.visibleList = () => context.inbox;
  vm.createContext(context); vm.runInContext(script, context);
  const detail = () => elements['report-detail'];
  const button = pattern => detail().children.find(n => n.tag === 'button' && pattern.test(n.textContent));
  const content = () => detail().querySelector('.mh-reading-text');
  return { context, elements, requests, actions, detail, content,
    work: () => content().children[1].children[1].textContent,
    button: () => button(/Translate to Korean|Original|Translating|Retry/),
    size: () => button(/Larger text|Default text/),
    async refresh(rows = serverRows) { serverRows = copy(rows); await context.loadList(); },
    select(id) { context.selected = id; context.paintList(); },
    success(index, map) { const req = requests[index]; req.resolve({ ok: true, status: 200, json: async () => ({ ok: true, map: map || Object.fromEntries(req.body.texts.map(text => [text, '번역 ' + text])) }) }); },
  };
}

{
  const f = fixture(), original = report(); await f.refresh([original]);
  check('initial report stays original and makes no translation request', () => { assert.equal(f.work(), original.payload.work); assert.equal(f.requests.length, 0); });
  const b = f.button(), work = b.onclick(); await b.onclick();
  check('manual translation disables duplicate clicks and keeps the published endpoint/body', () => { assert(b.disabled); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, '/api/translate'); assert.deepEqual(f.requests[0].body, { texts: ['Work v1'], target: 'ko', mode: 'chat' }); });
  f.success(0); await work;
  check('successful translation renders through shipped showPayload', () => { assert.equal(f.work(), '번역 Work v1'); assert(!b.disabled); assert.match(b.textContent, /Original/); });
  await f.refresh([{ ...original, updated_at: 2000 }]);
  check('unchanged revision/payload keeps translation after refresh', () => assert.equal(f.work(), '번역 Work v1'));
  await f.button().onclick();
  check('Original toggle restores the exact original', () => assert.equal(f.work(), 'Work v1'));
  await f.button().onclick();
  check('same revision reuses the successful cache without provider work', () => { assert.equal(f.work(), '번역 Work v1'); assert.equal(f.requests.length, 1); });
  f.size().onclick(); await f.button().onclick(); await f.button().onclick();
  check('larger reading text survives original/translation toggles', () => assert.equal(f.content().style.fontSize, '26px'));
  check('translation does not mutate the source payload', () => assert.deepEqual(copy(f.context.inbox[0].payload), original.payload));
  await f.refresh([report(41, 2, 'Work v2')]);
  check('new report revision resets translated display', () => { assert.equal(f.work(), 'Work v2'); assert.match(f.button().textContent, /Translate to Korean/); });
  const next = f.button().onclick(); f.success(1); await next;
  check('new report revision translates its own payload', () => assert.equal(f.work(), '번역 Work v2'));
  await f.refresh([report(41, 2, 'Same-time edit')]);
  check('same-version same-timestamp payload edit invalidates the translation', () => assert.equal(f.work(), 'Same-time edit'));
  const edited = f.button().onclick(); f.success(2); await edited;
  check('same-time edit produces its own translation request', () => { assert.equal(f.work(), '번역 Same-time edit'); assert.equal(f.requests.length, 3); });
  await f.refresh([report(41, 3, 'Same-time edit')]);
  check('revision change invalidates even an identical payload', () => assert.equal(f.work(), 'Same-time edit'));
}

for (const edit of ['revision', 'same-time-payload']) {
  for (const oldResult of ['success', 'failure']) {
    const f = fixture(); await f.refresh();
    const oldContent = f.content(), oldText = oldContent.textContent, oldButton = f.button(), old = oldButton.onclick();
    await f.refresh([report(41, edit === 'revision' ? 2 : 1, 'New work')]);
    const next = f.button().onclick(); f.success(1); await next;
    if (oldResult === 'success') f.success(0); else f.requests[0].reject(new Error('old failure'));
    await old;
    check(edit + ': late old ' + oldResult + ' cannot overwrite the new translation', () => { assert.equal(f.work(), '번역 New work'); assert(!f.button().disabled); assert.match(f.button().textContent, /Original/); });
    check(edit + ': removed content is not repainted by old ' + oldResult, () => { assert(!oldContent.isConnected); assert.equal(oldContent.textContent, oldText); });
    await f.refresh([report(41, edit === 'revision' ? 2 : 1, 'New work')]);
    check(edit + ': newer cached translation survives late old ' + oldResult, () => { assert.equal(f.work(), '번역 New work'); assert.equal(f.requests.length, 2); });
    const ack = f.detail().children.find(n => n.className === 'buttons').children[0]; ack.onclick();
    check(edit + ': acknowledgement corresponds to the displayed revision', () => assert.deepEqual(f.actions[0], { id: 41, version: edit === 'revision' ? 2 : 1, kind: 'ack' }));
  }
}

{
  const f = fixture(); await f.refresh(); const oldContent = f.content(), old = f.button().onclick();
  await f.refresh([report(41, 2, 'New untranslated work')]); f.success(0); await old;
  check('late old result does not switch a new revision out of Original', () => { assert.equal(f.work(), 'New untranslated work'); assert.match(f.button().textContent, /Translate to Korean/); assert(!oldContent.isConnected); });
}
{
  const f = fixture(); await f.refresh(); const oldContent = f.content(), old = f.button().onclick();
  await f.refresh([{ ...report(), updated_at: 2000 }]); const current = f.button().onclick();
  check('same-payload refresh reuses the in-flight request on a new manual click', () => assert.equal(f.requests.length, 1));
  f.success(0); await Promise.all([old, current]);
  check('shared pending result paints only the attached reading view', () => { assert.equal(f.work(), '번역 Work v1'); assert(!oldContent.isConnected); assert(!oldContent.textContent.includes('번역')); });
}
{
  const f = fixture(); await f.refresh(); const old = f.button().onclick();
  f.context.inbox[0].payload.work = 'In-place edit'; f.context.paintList();
  f.success(0); await old;
  check('in-place payload edit cannot contaminate the pending snapshot or current view', () => { assert.equal(f.work(), 'In-place edit'); assert.deepEqual(f.requests[0].body.texts, ['Work v1']); });
}
{
  const f = fixture(); await f.refresh(); const first = f.button().onclick();
  await f.refresh([report(41, 1, 'Intermediate edit')]); await f.refresh([report()]);
  const current = f.button().onclick(); f.success(1, { 'Work v1': '최신 번역' }); await current;
  f.success(0, { 'Work v1': '오래된 번역' }); await first;
  check('payload A to B to A does not revive the first pending A result', () => { assert.equal(f.work(), '최신 번역'); assert.equal(f.requests.length, 2); });
  await f.refresh([{ ...report(), updated_at: 2000 }]);
  check('A to B to A retains the newest translation in cache', () => assert.equal(f.work(), '최신 번역'));
}
{
  const f = fixture(), a = report(41, 1, 'A work'), b = report(42, 1, 'B work'); await f.refresh([a, b]);
  const first = f.button().onclick(); f.select(42); const second = f.button().onclick();
  f.success(1); await second; f.success(0); await first;
  check('independent report completion never replaces the selected report', () => assert.equal(f.work(), '번역 B work'));
  f.select(41);
  check('detached completion does not force translation display when reopening a report', () => assert.equal(f.work(), 'A work'));
  await f.button().onclick();
  check('independent report caches remain usable without extra requests', () => { assert.equal(f.work(), '번역 A work'); assert.equal(f.requests.length, 2); });
  f.select(42);
  check('each report retains its own display choice', () => assert.equal(f.work(), '번역 B work'));
}

for (const failure of ['network', 'http', 'malformed']) {
  const f = fixture(); await f.refresh(); const pending = f.button().onclick();
  if (failure === 'network') f.requests[0].reject(new Error('offline fixture failure'));
  else f.requests[0].resolve({ ok: failure !== 'http', status: failure === 'http' ? 503 : 200, json: async () => failure === 'malformed' ? null : { ok: true, map: {} } });
  await pending;
  check(failure + ': failure retains original content and enables explicit Retry', () => { assert.equal(f.work(), 'Work v1'); assert(!f.button().disabled); assert.match(f.button().textContent, /Retry/); });
  const retry = f.button().onclick(); f.success(1); await retry;
  check(failure + ': deliberate retry succeeds with a fresh request', () => { assert.equal(f.work(), '번역 Work v1'); assert.equal(f.requests.length, 2); });
}
{
  const f = fixture(), r = report(); r.payload.work = '• Line one\n- Line two\n한국어'; r.payload.student = 'Line one';
  await f.refresh([r]); const pending = f.button().onclick(); f.success(0, { 'Line one': '첫 줄' }); await pending;
  check('line deduplication, bullets and untranslated-line fallback remain intact', () => { assert.deepEqual(f.requests[0].body.texts, ['Line one', 'Line two']); assert.equal(f.work(), '• 첫 줄\n- Line two\n한국어'); assert.match(f.button().textContent, /1줄 번역 실패/); });
  await f.button().onclick(); check('partial translation Original restores all original lines', () => assert.equal(f.work(), r.payload.work));
}
{
  const f = fixture(), r = report(); r.payload.work = Array.from({ length: 41 }, (_, i) => 'Line ' + i).join('\n');
  await f.refresh([r]); const pending = f.button().onclick(); f.success(0); await flush(); f.success(1); await pending;
  check('published forty-line translation batching remains intact', () => { assert.deepEqual(f.requests.map(r => r.body.texts.length), [40, 1]); assert.equal(f.work().split('\n').length, 41); });
}

// Negative controls prove these behavioral checks reject a cache keyed only by
// revision (missing payload) or payload (missing revision), without source edits.
for (const [name, replacement, next] of [
  ['payload omitted', 'JSON.stringify([r.version])', report(41, 1, 'Changed work')],
  ['revision omitted', 'JSON.stringify([r.payload])', report(41, 2, 'Work v1')],
]) {
  const mutant = shipped.replace('return JSON.stringify([r.version,r.payload]);', 'return ' + replacement + ';');
  assert.notEqual(mutant, shipped, 'Locate key mutation'); const f = fixture(mutant); await f.refresh();
  const pending = f.button().onclick(); f.success(0); await pending; await f.refresh([next]);
  check('negative control: ' + name + ' reproduces the stale translated display', () => assert.equal(f.work(), '번역 Work v1'));
}
console.log(`daily_handover_translation: PASS ${checks} / FAIL 0 / SKIP 0`);
