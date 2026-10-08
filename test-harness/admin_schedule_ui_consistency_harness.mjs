/* Fresh Oct7 reconstruction: execute shipped functions using synthetic DOM/fetch only.
   Baseline evidence is recorded separately; old results are not reused. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const modalSource = read('cloudflare-deploy/public/js/class-move-modal.js');
const studentSource = read('cloudflare-deploy/public/admin/student.html');
const lessonSource = read('cloudflare-deploy/public/lesson-postpone-demo.html');
let count = 0;
const check = (name, fn) => { fn(); count++; console.log('PASS ' + name); };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function hold() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const response = (j, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => j });
function cut(s, a, b) { const i = s.indexOf(a), j = s.indexOf(b, i); assert(i >= 0 && j > i, a); return s.slice(i, j); }
function fixture() {
  const els = new Map(), timers = new Map(); let tid = 0, act = 'hold';
  const calls = [], confirms = []; let confirmResult = true;
  class Element {
    constructor(id = '') { this.id = id; this.style = {}; this.hidden = false; this.disabled = false; this.value = ''; this.attrs = {}; this.events = {}; this.textContent = ''; this._html = ''; }
    set innerHTML(v) { this._html = v; for (const m of v.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) { const e = new Element(m[1]); e.value = (m[0].match(/\bvalue="([^"]*)"/) || [])[1] || ''; e.hidden = /\bhidden\b/.test(m[0]); els.set(e.id, e); } }
    get innerHTML() { return this._html; }
    setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; }
    addEventListener(k, f) { (this.events[k] ??= []).push(f); }
    querySelector(sel) { if (sel.includes('data-mv-mode')) return { getAttribute: () => act === 'series' ? 'series' : act === 'cancel' ? 'cancel' : 'postpone' }; if (sel.includes('data-mv-sub')) return { getAttribute: () => act }; return null; }
    querySelectorAll() { return []; }
  }
  const document = { getElementById: id => els.get(id) || null, createElement: () => new Element(), body: { appendChild(e) { els.set(e.id, e); e.parentNode = { removeChild() { els.clear(); } }; } } };
  const context = { console, document, fetch: (url, opts = {}) => { const req = { url, body: opts.body ? JSON.parse(opts.body) : null, result: hold() }; calls.push(req); return req.result.promise; }, setTimeout: f => { timers.set(++tid, f); return tid; }, clearTimeout: id => timers.delete(id), window: { confirm: s => { confirms.push(s); return confirmResult; } } };
  const expose = `window.test={mvCompleteSeries,mvSeriesHtml,mvLoadSeries,mvSeriesLater,mvRunSeries,mvLoadTeachers,mvTeachersLater,mvWhenChanged,mvInvalidateReads,mvSeriesBody,mvSerKey,mvRun,mvSync,get:()=>({ser:_mvSer,data:_mvData,pick:_mvPick,busy:_mvBusy,uncertain:_mvUncertain}),setSer:v=>_mvSer=v};`;
  vm.runInNewContext(modalSource.replace('  window.mangoiMoveModal =', expose + '\n  window.mangoiMoveModal ='), context);
  const t = context.window.test;
  const row = { schedule_id: 7, start_time: '16:30', start_ts: Date.parse('2026-12-30T07:30:00Z'), student_name: 'Synthetic Student', student_uid: 'fixture', teacher_name: 'Fixture Teacher', can_move: true };
  const open = () => { context.window.mangoiMoveModal.open(row, { day: '2026-12-30', isEn: () => true }); act = 'series'; els.get('tc-mv-series').hidden = false; els.get('tc-mv-teachers').hidden = false; els.get('tc-mv-date').value = '2027-01-06'; };
  open();
  return { context, t, row, els, calls, confirms, open, setAct: a => { act = a; }, setConfirm: x => confirmResult = x, runTimers: () => { const ts = [...timers.values()]; timers.clear(); ts.forEach(f => f()); } };
}
function preview(n = 12) { return { ok: true, dry_run: true, preview_key: 'exact-snapshot', count: n, items: Array.from({ length: n }, (_, i) => ({ id: i + 7, from_date: new Date(Date.parse('2026-12-30T00:00:00Z') + i * 7 * 864e5).toISOString().slice(0, 10), from_time: '16:30', to_date: new Date(Date.parse('2027-01-06T00:00:00Z') + i * 7 * 864e5).toISOString().slice(0, 10), to_time: '16:30' })), teacher: { from_id: '5', to_id: '5', from_name: 'Fixture Teacher', to_name: 'Fixture Teacher', changed: false } }; }
function accept(f, j = preview(), st = 200) { f.t.setSer({ key: f.t.mvSerKey(f.t.mvSeriesBody(f.row)), st, j }); }
for (const n of [1, 12, 60]) {
  const f = fixture(), j = preview(n);
  check('complete ' + n + ' preview renders every ISO date/time and unchanged teacher', () => { assert(f.t.mvCompleteSeries(j)); const h = f.t.mvSeriesHtml(200, j); assert.equal((h.match(/data-mv-series-id=/g) || []).length, n); for (const it of j.items) assert(h.includes(it.from_date + ' ' + it.from_time + ' → ' + it.to_date + ' ' + it.to_time)); assert(h.includes('Fixture Teacher (unchanged)')); assert(h.includes('overflow-y:auto')); });
}
for (const [label, change] of [['missing key', j => delete j.preview_key], ['wrong count', j => j.count++], ['more than60', j => Object.assign(j, preview(61))], ['duplicate id', j => j.items[1].id = j.items[0].id], ['unsafe id', j => j.items[0].id = 1e100], ['bad date', j => j.items[0].to_date = '2027-02-31'], ['bad time', j => j.items[0].to_time = '99:00'], ['not dry run', j => j.dry_run = false], ['missing teacher', j => delete j.teacher]]) {
  const f = fixture(), j = preview(); change(j); accept(f, j); f.t.mvRunSeries(f.row, '2026-12-30', '');
  check('reject incomplete ' + label, () => { assert.equal(f.confirms.length, 0); assert.equal(f.calls.length, 0); });
}
{ const f = fixture(); accept(f, preview(), 503); f.t.mvRunSeries(f.row, '2026-12-30', ''); check('HTTP failure cannot supply successful preview', () => { assert.equal(f.confirms.length, 0); assert.equal(f.calls.length, 0); }); }
{
  const f = fixture(); accept(f); f.setConfirm(false); f.t.mvRunSeries(f.row, '2026-12-30', '');
  check('Cancel retains preview and writes nothing', () => { assert(f.t.get().ser); assert.equal(f.calls.length, 0); });
  f.setConfirm(true); f.t.mvRunSeries(f.row, '2026-12-30', ''); f.t.mvRunSeries(f.row, '2026-12-30', '');
  check('duplicate Apply produces one exact-preview write', () => { assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body.expected_preview, 'exact-snapshot'); assert(f.confirms[1].includes('2027-01-06 16:30')); assert.equal(f.confirms[1].split('· ').length, 14); });
  f.context.window.mangoiMoveModal.close(); check('in-flight write cannot close/reopen', () => assert(f.els.has('tc-move-modal')));
  f.calls[0].result.resolve(response({ ok: true, applied: true, moved: 12, count: 12 })); await flush();
  check('confirmed exact success stays single-use', () => { assert.equal(f.t.get().busy, false); assert(f.els.get('tc-mv-go').disabled); });
}
for (const error of ['stale_preview', 'schedule_changed']) {
  const f = fixture(); accept(f); f.t.mvRunSeries(f.row, '2026-12-30', ''); f.calls[0].result.resolve(response({ ok: false, error }, 409)); await flush();
  check(error + ' requires refreshed preview/new confirmation', () => { assert.equal(f.t.get().ser, null); assert.equal(f.calls.length, 1); assert.equal(f.confirms.length, 1); });
  f.t.mvRunSeries(f.row, '2026-12-30', ''); check(error + ' cannot reuse old confirmation', () => assert.equal(f.calls.length, 1));
  f.runTimers(); assert.equal(f.calls.length, 2); f.calls[1].result.resolve(response({ ...preview(), preview_key: 'new-snapshot' })); await flush(); f.t.mvRunSeries(f.row, '2026-12-30', '');
  check(error + ' deliberate retry binds new snapshot', () => { assert.equal(f.confirms.length, 2); assert.equal(f.calls.length, 3); assert.equal(f.calls[2].body.expected_preview, 'new-snapshot'); });
}
for (const kind of ['network', 'malformed', 'server', 'partial']) {
  const f = fixture(); accept(f); f.t.mvRunSeries(f.row, '2026-12-30', '');
  if (kind === 'network') f.calls[0].result.reject(new Error('lost')); else f.calls[0].result.resolve(response(kind === 'malformed' ? null : kind === 'server' ? { ok: false, error: 'move_failed' } : { ok: true, applied: true, count: 12, moved: 1 }, kind === 'server' ? 503 : 200));
  await flush(); f.t.mvRunSeries(f.row, '2026-12-30', '');
  check('uncertain ' + kind + ' locks resending', () => { assert(f.t.get().uncertain); assert(f.els.get('tc-mv-go').disabled); assert.equal(f.calls.length, 1); assert(f.els.get('tc-mv-msg').textContent.includes('uncertain')); });
}
for (const action of ['field', 'mode', 'close', 'reopen']) {
  const f = fixture(); f.t.mvLoadSeries(f.row); const old = f.calls[0];
  if (action === 'field') { f.els.get('tc-mv-date').value = '2027-02-03'; f.t.mvWhenChanged(f.row); }
  if (action === 'mode') { f.setAct('hold'); f.t.mvInvalidateReads(); }
  if (action === 'close') f.context.window.mangoiMoveModal.close();
  if (action === 'reopen') { f.context.window.mangoiMoveModal.close(); f.open(); }
  old.result.resolve(response(preview())); await flush(); check('late series response ignored after ' + action, () => assert.equal(f.t.get().ser, null));
}
{ const f = fixture(); f.t.mvLoadTeachers(f.row); const old = f.calls[0]; f.context.window.mangoiMoveModal.close(); f.open(); old.result.resolve(response({ ok: true, current: { id: '99', free: true }, candidates: [] })); await flush(); check('late teacher cannot select in reopened modal', () => { assert.equal(f.t.get().data, null); assert.equal(f.t.get().pick, ''); }); }
const PAGE_SNAPSHOT = 'a'.repeat(64);
const pageResponse = (j, status = 200) => response({ snapshot: PAGE_SNAPSHOT, ...j }, status);
const calendarFns = cut(studentSource, 'async function mgsLoadSchedulePages(query)', 'var _dSchedLoadSeq') + cut(studentSource, 'function mgsEnrHasLiveClass(enr)', '/* 🔕 (2026-09-21 사장님 지시)');
function calendar(fetch) { const c = { fetch, _dSchedState: { aiSchedules: [], aiOk: false, aiComplete: false }, mgsSchedHitsDate: (r, d) => r.scheduled_date === d }; vm.createContext(c); vm.runInContext(calendarFns, c); return c; }
function useResult(c, r) { Object.assign(c._dSchedState, { aiSchedules: r.items, aiOk: r.ok, aiComplete: r.complete }); }
for (const n of [99, 100, 500]) {
  const c = calendar(async () => pageResponse({ ok: true, items: Array.from({ length: n }, (_, i) => ({ id: i + 1, source: i === 0 ? 'adm-enroll:124' : 'other', scheduled_date: '2026-09-30' })), has_more: false, next_offset: null }));
  const r = await c.mgsLoadSchedulePages('user_id=fixture'); useResult(c, r);
  check('complete ' + n + ' never resurrects cancelled October7', () => { assert.equal(c.mgsEnrHasLiveClass({ id: 124 }), true); assert.equal(c.mgsEnrLiveOnDate({ id: 124 }, '2026-10-07'), false); });
}
{
  const calls = []; const c = calendar(async url => { const q = new URL(url, 'http://fixture').searchParams; calls.push(q); return pageResponse(calls.length === 1 ? { ok: true, items: Array.from({ length: 500 }, (_, i) => ({ id: i + 1, source: 'other' })), has_more: true, next_offset: 500 } : { ok: true, items: [{ id: 501, source: 'adm-enroll:124', scheduled_date: '2026-10-07' }], has_more: false, next_offset: null }); });
  const r = await c.mgsLoadSchedulePages('user_id=fixture'); useResult(c, r);
  check('stable snapshot retrieves enrollment beyond first500', () => { assert.equal(calls.length, 2); assert.equal(calls[1].get('expected_snapshot'), PAGE_SNAPSHOT); assert.equal(c.mgsEnrLiveOnDate({ id: 124 }, '2026-10-07'), true); });
}
for (const kind of ['warning', 'malformed', 'nonmonotonic', 'failure', 'cap', 'dedupe', 'oversize', 'offset_mismatch', 'limit_mismatch', 'completeness_mismatch']) {
  let calls = 0; const c = calendar(async () => {
    calls++;
    if (kind === 'oversize') return pageResponse({ ok: true, items: Array.from({ length: 501 }, (_, i) => ({ id: i + 1 })), has_more: false, next_offset: null });
    if (kind === 'offset_mismatch') return pageResponse({ ok: true, items: [], offset: 500, limit: 500, has_more: false, next_offset: null });
    if (kind === 'limit_mismatch') return pageResponse({ ok: true, items: [], offset: 0, limit: 100, has_more: false, next_offset: null });
    if (kind === 'completeness_mismatch') return pageResponse({ ok: true, items: [], complete: false, has_more: false, next_offset: null });
    if (kind === 'failure' && calls === 2) throw new Error('offline');
    if (kind === 'warning') return pageResponse({ ok: true, items: [], warning: 'DB unavailable' });
    if (kind === 'malformed') return pageResponse({ ok: true, items: [] });
    if (kind === 'nonmonotonic') return pageResponse({ ok: true, items: [{ id: 1 }], has_more: true, next_offset: 0 });
    if (kind === 'dedupe' && calls === 2) return pageResponse({ ok: true, items: [{ id: 1 }, { id: 2 }], has_more: false, next_offset: null });
    return pageResponse({ ok: true, items: [{ id: kind === 'dedupe' ? 1 : calls }], has_more: true, next_offset: calls });
  });
  const r = await c.mgsLoadSchedulePages('user_id=fixture'); useResult(c, r);
  check('pagination ' + kind + ' stays bounded/unknown', () => { if (kind === 'dedupe') assert.equal(r.items.length, 2); assert.equal(r.complete, false); assert.equal(c.mgsEnrHasLiveClass({ id: 124 }), null); assert.equal(c.mgsEnrLiveOnDate({ id: 124 }, '2026-10-07'), null); assert(calls <= 20); if (kind === 'cap') assert.equal(calls, 20); });
}
for (const token of [undefined, null, '', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64), 123]) {
  const c = calendar(async () => response({ ok: true, items: [{ id: 1, source: 'adm-enroll:124', scheduled_date: '2026-10-07' }], has_more: false, next_offset: null, ...(token === undefined ? {} : { snapshot: token }) }));
  const r = await c.mgsLoadSchedulePages('user_id=fixture'); useResult(c, r);
  check('first snapshot rejects ' + String(token), () => { assert.equal(r.complete, false); assert.equal(r.items.length, 0); assert.equal(c.mgsEnrHasLiveClass({ id: 124 }), null); });
}
for (const fault of ['missing', 'malformed', 'changed', 'http409']) {
  const calls = []; const c = calendar(async url => {
    const q = new URL(url, 'http://fixture').searchParams; calls.push(q);
    if (calls.length === 1) return pageResponse({ ok: true, items: [{ id: 1, source: 'adm-enroll:124', scheduled_date: '2026-09-30' }], offset: 0, limit: 500, has_more: true, next_offset: 1 });
    if (fault === 'http409') return response({ ok: false, error: 'schedule_changed', complete: false }, 409);
    return response({ ok: true, items: [{ id: 501, source: 'adm-enroll:999', scheduled_date: '2026-10-07' }], offset: 1, limit: 500, has_more: false, next_offset: null, ...(fault === 'missing' ? {} : { snapshot: fault === 'changed' ? 'b'.repeat(64) : 'A'.repeat(64) }) });
  });
  const r = await c.mgsLoadSchedulePages('user_id=fixture&student_name=Synthetic%20Name'); useResult(c, r);
  check('later snapshot ' + fault + ' preserves only earlier confirmed rows', () => { assert.equal(calls.length, 2); assert.equal(calls[0].has('expected_snapshot'), false); assert.equal(calls[1].get('expected_snapshot'), PAGE_SNAPSHOT); assert.equal(calls[1].get('student_name'), 'Synthetic Name'); assert.equal(r.complete, false); assert.equal(r.items.length, 1); assert.equal(r.items[0].id, 1); assert.equal(c.mgsEnrHasLiveClass({ id: 124 }), true); assert.equal(c.mgsEnrHasLiveClass({ id: 999 }), null); assert.equal(c.mgsEnrLiveOnDate({ id: 124 }, '2026-10-07'), null); });
}
{
  let active = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, source: i === 500 ? 'adm-enroll:999' : 'other', scheduled_date: '2026-10-07' }));
  const calls = []; const c = calendar(async url => {
    const q = new URL(url, 'http://fixture').searchParams; calls.push(q); const offset = Number(q.get('offset'));
    if (calls.length === 1) { const first = active.slice(0, 500); active = active.filter(r => r.id !== 1); return pageResponse({ ok: true, items: first, offset, limit: 500, has_more: true, next_offset: 500 }); }
    const current = 'b'.repeat(64);
    if (q.has('expected_snapshot') && q.get('expected_snapshot') !== current) return response({ ok: false, error: 'schedule_changed', snapshot: current, complete: false }, 409);
    return response({ ok: true, items: active.slice(offset, offset + 500), offset, limit: 500, has_more: false, next_offset: null, snapshot: current });
  });
  const r = await c.mgsLoadSchedulePages('user_id=fixture'); useResult(c, r);
  check('cancel ID1 between501-row pages cannot declare ID501 enrollment empty', () => { assert.equal(calls.length, 2); assert.equal(calls[1].get('expected_snapshot'), PAGE_SNAPSHOT); assert.equal(active.length, 500); assert(active.some(r => r.id === 501)); assert.equal(r.complete, false); assert.equal(r.items.length, 500); assert.equal(c.mgsEnrHasLiveClass({ id: 999 }), null); assert.equal(c.mgsEnrLiveOnDate({ id: 999 }, '2026-10-07'), null); });
}
check('Today preserves verified schedule evidence', () => assert(!cut(studentSource, "bind('d-sched-today'", "bind('d-sched-view-week'").includes('aiSchedules = []')));
{
  const events = {}, elements = new Map();
  const element = id => { if (!elements.has(id)) { const classes = new Set(id === '#screen-main' ? ['active'] : []); elements.set(id, { textContent: '', innerHTML: '', classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle() {} }, setAttribute() {}, addEventListener: (name, fn) => { events[id + name] = fn; } }); } return elements.get(id); };
  let confirm = false, asks = 0, entered = 0, back = 0;
  const c = { state: { mode: 'postpone', cart: [{ id: 7 }], tab: 'weekly' }, $: element, $$: () => [], __mobT: (a, b) => b, showToast() {}, location: { href: 'initial' }, setTimeout() {}, window: { confirm: () => { asks++; return confirm; }, mangoiGoBack: () => back++, addEventListener: (name, fn) => events[name] = fn }, document: { addEventListener() {} }, CURRENT_SCHEDULE: [{}], __MOB_REAL: true, enterDetail: () => entered++ };
  vm.createContext(c);
  vm.runInContext(cut(lessonSource, 'function __navHasUnsaved(){', 'function __navLabels(){') + cut(lessonSource, 'function _goMode(mode){', '/* 모바일 탭 보강') + cut(lessonSource, 'function resetToMain(){', '/* ⏩ 탭 3개') + cut(lessonSource, "$('#btn-back').addEventListener", '/* 🧭 위쪽'), c);
  events['#btn-backclick'](); c.__navGoHome(); check('detail Back then Home Cancel preserves pending selection', () => { assert.equal(asks, 1); assert.equal(c.location.href, 'initial'); assert.equal(c.state.cart.length, 1); });
  c.__navGoBack(); check('main Back confirms pending selection', () => { assert.equal(asks, 2); assert.equal(back, 0); });
  c._goMode('postpone'); check('same-mode reopen resumes selection', () => { assert.equal(entered, 1); assert.equal(c.state.cart.length, 1); });
  c._goMode('change'); check('switch-mode Cancel retains mode/cart', () => { assert.equal(c.state.mode, 'postpone'); assert.equal(c.state.cart.length, 1); });
  let prevented = 0; events.beforeunload({ preventDefault: () => prevented++ }); check('browser Back/close gets unsaved safeguard', () => assert.equal(prevented, 1));
  c.state.saveAttempted = true; c.resetToMain(); check('failed-completion retry Cancel retains selection', () => assert.equal(c.state.cart.length, 1));
  c.state.saving = true; confirm = true; c.__navGoHome(); check('in-flight save blocks Home', () => assert.equal(c.location.href, 'initial'));
  c.state.saving = false; c.__navGoHome(); check('confirmed departure goes Home', () => assert.equal(c.location.href, '/'));
  c.location.href = 'initial'; c.state.leaving = false; c.state.completed = true; const before = asks; c.__navGoHome(); check('successful completion is not unsaved', () => assert.equal(asks, before));
}
console.log(`admin_schedule_ui_consistency: PASS ${count} / FAIL 0 / SKIP 0`);
