/** Offline client-policy regression: execute the shipping drag handlers and policy helpers.
 * No browser, real requests, database, provider, or authorization-gate changes.
 * Run: node test-harness/weekly_drag_change_cutoff_harness.mjs
 * Baseline comparison: append --source=/path/to/unmodified/weekly-schedule.html
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The page's existing cutoff uses browser-local time. Keep that behavior, with a fixed test zone.
process.env.TZ = 'UTC';
const sourceArg = process.argv.find(arg => arg.startsWith('--source='));
const html = readFileSync(sourceArg ? sourceArg.slice('--source='.length)
  : new URL('../cloudflare-deploy/public/admin/weekly-schedule.html', import.meta.url), 'utf8');

function statement(anchor) {
  const start = html.indexOf(anchor);
  assert.notEqual(start, -1, `Missing shipping handler: ${anchor}`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1) + ';';
  }
  throw new Error(`Unterminated shipping handler: ${anchor}`);
}

// Reuse the actual policy, including role previews and manager exceptions; never stub canChange.
const policyStart = html.indexOf('function getClassStartTime(');
const policyEnd = html.indexOf('// 거부 팝업', policyStart);
assert.ok(policyStart >= 0 && policyEnd > policyStart, 'Missing scheduling policy block');
const code = html.slice(policyStart, policyEnd) + '\n' + [
  'function showMoveConfirm(',
  'window.confirmMoveAs=function(',
  'window.cancelMove=function(',
  'async function persistSlotMove(',
  'function slotMoveFailMsg(',
  'window.confirmMoveDo=async function(',
  'function openRescheduleModal(',
].map(statement).join('\n');
const script = new vm.Script(code, { filename: 'weekly-schedule-cutoff-extract.js' });
const START = new Date('2027-01-11T12:20:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function fixture({ remaining = DAY, movedTeacher = false, editing = false,
  role = 'hq_teacher', preview = null, lang = 'en', destinationDate = '2027-01-12',
  replyOk = true } = {}) {
  const state = {
    now: START - remaining, editing, modal: '', requests: [], unlocks: [],
    added: [], toasts: [], rejects: [], timers: [], reloaded: 0, rendered: 0,
    bumps: 0, undos: [], rescheduleRendered: 0,
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  }
  const slot = {
    id: 101, ids: [101], type: '1on1', students: [], duration_min: 20,
    moveField: 'scheduled_date', moveVersions: { '101': 'fixture-version' },
    moveDate: '2027-01-11',
  };
  const srcTeacher = { id: '1', name: 'Fixture teacher A' };
  const dstTeacher = movedTeacher ? { id: '2', name: 'Fixture teacher B' } : srcTeacher;
  const slotKey = (teacher, date, minute) => `${teacher}__${date}__${minute}`;
  const srcKey = slotKey('1', '2027-01-11', 12 * 60 + 20);
  const slots = { [srcKey]: slot };
  const initialSlots = JSON.stringify(slots);
  const session = {
    mangoi_admin_session: JSON.stringify({ role }),
    admin_session: preview === null ? null : JSON.stringify({ uid: preview }),
  };
  const sandbox = {
    window: {}, console, Date: FixedDate, currentLang: lang,
    localStorage: { getItem: key => session[key] ?? null },
    SLOTS: slots, slotKey, TEACHERS: [srcTeacher, dstTeacher],
    wsEditing: () => state.editing,
    wsSetEditing: (value, opts) => { state.unlocks.push({ value, opts }); state.editing = value; },
    wsBumpEdit: () => state.bumps++, wsOfferUndo: value => state.undos.push(value),
    openModal: value => { state.modal = value; }, closeModal: () => { state.modal = ''; },
    showDndToast: (message, kind) => state.toasts.push({ message, kind }),
    showRejectModal: (...args) => state.rejects.push(args),
    setTimeout: (fn, ms) => { state.timers.push({ fn, ms }); return state.timers.length; },
    minLabel: minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    escapeHtml: value => String(value ?? ''),
    addSlot: (teacher, date, hour, value, minute) => {
      state.added.push({ teacher, date, hour, minute });
      slots[slotKey(teacher, date, hour * 60 + (minute || 0))] = value;
    },
    render: () => state.rendered++, reloadAndRender: async () => state.reloaded++,
    getSlot: () => slot, renderRescheduleModal: () => state.rescheduleRendered++,
    fetch: async (url, init) => {
      state.requests.push({ url, method: init.method, body: JSON.parse(init.body) });
      return { ok: replyOk, status: replyOk ? 200 : 409,
        json: async () => replyOk ? { ok: true, move_versions: { '101': 'saved-version' } }
          : { ok: false, message: 'Synthetic conflict' } };
    },
  };
  sandbox.window.confirm = () => true;
  vm.createContext(sandbox);
  script.runInContext(sandbox);
  const ctx = {
    srcTeacher, dstTeacher, srcNm: srcTeacher.name, dstNm: dstTeacher.name,
    srcCoords: { dateISO: '2027-01-11', hour: 12, minute: 20, startMin: 12 * 60 + 20 },
    dstCoords: { dateISO: destinationDate, hour: 13, minute: 10, startMin: 13 * 60 + 10 },
    srcData: { slot }, movedTeacher,
  };
  sandbox.showMoveConfirm(ctx);
  const button = state.modal.match(/<button[^>]*data-move-mode="change"[^>]*onclick="([^"]+)"/);
  assert.equal(button?.[1], 'confirmMoveDo()', 'Preserve the existing direct Modify entry point');
  assert.match(state.modal, /onclick="cancelMove\(\)"/, 'The cancel button must keep its handler');
  // Browser global window members are globals; the VM's window is an explicit test double.
  async function click(entry = 'direct') {
    if (entry === 'direct') return sandbox.window.confirmMoveDo();
    if (entry === 'cancel') return sandbox.window.cancelMove();
    return sandbox.window.confirmMoveAs(entry);
  }
  function drainTimers() {
    for (const timer of state.timers.splice(0)) {
      assert.equal(timer.ms, 150, 'Use the existing delayed rejection UI');
      timer.fn();
    }
  }
  function unchanged() {
    assert.equal(state.requests.length, 0, 'No network request');
    assert.equal(state.unlocks.length, 0, 'No editing unlock');
    assert.equal(state.editing, editing, 'Preserve existing lock state');
    assert.equal(JSON.stringify(slots), initialSlots, 'No schedule or version mutation');
    assert.equal(state.added.length, 0, 'No destination slot');
    assert.equal(state.reloaded, 0, 'No reload');
    assert.equal(state.rendered, 0, 'No schedule render');
    assert.equal(state.bumps, 0, 'No editing timeout extension');
    assert.equal(state.undos.length, 0, 'No undo offer');
    assert.ok(!state.toasts.some(item => item.kind === 'ok'), 'No false success toast');
  }
  function saved() {
    assert.equal(state.requests.length, 1, 'One move request');
    const request = state.requests[0];
    assert.equal(request.url, '/api/admin/class-schedules/move');
    assert.equal(request.method, 'PATCH');
    assert.deepEqual(request.body.ids, [101]);
    assert.deepEqual(request.body.expected, { '101': 'fixture-version' });
    assert.equal(request.body.source_date, '2027-01-11');
    assert.equal(request.body.destination_date, destinationDate);
    assert.equal(request.body.start_time, '13:10');
    assert.equal(request.body.teacher_id, movedTeacher ? '2' : undefined);
    assert.equal(state.unlocks.length, editing ? 0 : 1, 'Only unlock after authorized confirmation');
    assert.equal(state.added.length, 1);
    assert.equal(Object.hasOwn(slots, srcKey), false);
    assert.equal(state.reloaded, 1);
    assert.equal(state.rendered, 1);
    assert.equal(state.rejects.length, 0);
    assert.equal(state.timers.length, 0);
    assert.equal(sandbox.window.__moveCtx, null);
  }
  return { state, sandbox, ctx, click, drainTimers, unchanged, saved, initialSlots, slots };
}

let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

for (const entry of ['direct', 'change']) {
  for (const movedTeacher of [false, true]) {
    for (const editing of [false, true]) {
      for (const remaining of [DAY - 1, DAY, DAY + 1]) {
        await test(`${entry}, teacher move=${movedTeacher}, editing=${editing}, cutoff delta=${remaining - DAY}ms`, async () => {
          const f = fixture({ remaining, movedTeacher, editing });
          await f.click(entry);
          if (remaining >= DAY) f.saved();
          else {
            f.unchanged();
            assert.equal(f.sandbox.window.__moveCtx, null);
            f.drainTimers();
            assert.deepEqual(f.state.rejects, [['change', '2027-01-11', 12, 20]]);
            await f.click(entry);
            f.unchanged();
            assert.equal(f.state.rejects.length, 1, 'Denied context cannot be resubmitted');
          }
        });
      }
    }
  }
}

for (const role of ['hq_mgr', 'hq_exec', 'admin']) {
  for (const movedTeacher of [false, true]) {
    await test(`${role} keeps the existing exception, teacher move=${movedTeacher}`, async () => {
      const f = fixture({ role, movedTeacher, remaining: -MINUTE });
      await f.click();
      f.saved();
    });
  }
}

for (const role of ['hq_teacher', 'branch', 'agency', 'parent', 'student', '']) {
  await test(`${role || 'empty role'} does not gain a manager exception`, async () => {
    const f = fixture({ role, remaining: DAY - 1 });
    await f.click(); f.unchanged(); f.drainTimers();
    assert.equal(f.state.rejects[0]?.[0], 'change');
  });
}

await test('Existing preview role overrides underlying manager role', async () => {
  const f = fixture({ role: 'hq_mgr', preview: 'parent_fixture', remaining: DAY - 1 });
  await f.click(); f.unchanged(); f.drainTimers();
  assert.equal(f.state.rejects[0]?.[0], 'change');
});
await test('Existing manager preview keeps the same exception', async () => {
  const f = fixture({ preview: 'hq_mgr', remaining: -MINUTE });
  await f.click(); f.saved();
});

for (const entry of ['direct', 'change']) {
  await test(`${entry} rechecks the clock at confirmation, after crossing the cutoff`, async () => {
    const f = fixture({ remaining: DAY });
    f.state.now++;
    await f.click(entry); f.unchanged(); f.drainTimers();
    assert.equal(f.state.rejects[0]?.[0], 'change');
  });
  await test(`${entry} uses source time even when destination is far in the future`, async () => {
    const f = fixture({ remaining: MINUTE, destinationDate: '2027-02-01' });
    await f.click(entry); f.unchanged(); f.drainTimers();
    assert.equal(f.state.rejects[0]?.[0], 'change');
  });
}

for (const movedTeacher of [false, true]) {
  for (const editing of [false, true]) {
    for (const remaining of [DAY - 1, DAY + 1]) {
      await test(`Cancel, teacher move=${movedTeacher}, editing=${editing}, eligible=${remaining >= DAY}`, async () => {
        const f = fixture({ movedTeacher, editing, remaining });
        await f.click('cancel'); f.unchanged();
        assert.equal(f.sandbox.window.__moveCtx, null);
        await f.click(); f.unchanged();
        assert.equal(f.state.timers.length, 0);
        assert.equal(f.state.rejects.length, 0);
      });
    }
  }
}

for (const remaining of [30 * MINUTE - 1, 30 * MINUTE, 30 * MINUTE + 1, DAY - 1]) {
  await test(`Postpone keeps its separate 30-minute rule: ${remaining}ms`, async () => {
    const f = fixture({ remaining });
    await f.click('postpone');
    if (remaining >= 30 * MINUTE) f.saved();
    else {
      f.unchanged(); f.drainTimers();
      assert.deepEqual(f.state.rejects, [['postpone', '2027-01-11', 12, 20]]);
    }
  });
}
await test('Postpone still refuses a teacher move without unlocking or changing data', async () => {
  const f = fixture({ movedTeacher: true, remaining: 31 * MINUTE });
  await f.click('postpone'); f.unchanged();
  assert.equal(f.state.rejects.length, 0);
  assert.equal(f.state.timers.length, 0);
});
for (const role of ['hq_mgr', 'hq_exec', 'admin']) {
  await test(`Postpone retains the existing ${role} exception`, async () => {
    const f = fixture({ role, remaining: -MINUTE });
    await f.click('postpone'); f.saved();
  });
}

for (const remaining of [DAY - 1, DAY, DAY + 1]) {
  await test(`Drag and existing Modify modal have the same boundary: ${remaining - DAY}ms`, async () => {
    const drag = fixture({ remaining, editing: true });
    const modal = fixture({ remaining, editing: true });
    await drag.click(); drag.drainTimers();
    modal.sandbox.openRescheduleModal('Fixture teacher A', '2027-01-11', 12, 'change', 20);
    modal.drainTimers();
    assert.equal(drag.state.requests.length === 1, modal.state.rescheduleRendered === 1);
    assert.deepEqual(drag.state.rejects, modal.state.rejects);
  });
}

await test('A valid confirmation can only save once', async () => {
  const f = fixture();
  await f.click(); f.saved();
  await f.click(); f.saved();
});
await test('An eligible request denied by the server still leaves schedule data in place', async () => {
  const f = fixture({ replyOk: false });
  await f.click();
  assert.equal(f.state.requests.length, 1);
  assert.equal(f.state.added.length, 0);
  assert.equal(f.state.rendered, 0);
  assert.equal(f.state.reloaded, 1);
  assert.ok(!f.state.toasts.some(item => item.kind === 'ok'));
  // persistSlotMove's existing transient marker is cleared on all responses.
  const current = JSON.parse(JSON.stringify(f.slots));
  delete Object.values(current)[0]._moving;
  assert.equal(JSON.stringify(current), f.initialSlots);
});
await test('Missing drag context cannot unlock or save', async () => {
  const f = fixture();
  f.sandbox.window.__moveCtx = null;
  await f.click(); f.unchanged();
});

console.log(`weekly_drag_change_cutoff_harness: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
