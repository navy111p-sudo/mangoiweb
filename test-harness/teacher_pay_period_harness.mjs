// Execute the actual period calculation with synthetic lessons, including asynchronous races.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../cloudflare-deploy/public/teacher.html', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('  function payStatusPill(l){'), html.indexOf('  function paintPay(){'));
assert.ok(block.includes('function searchPayRange'));
function make(get, me) {
  const state = { MY: {}, me };
  return new Function('state', 'myGet', `
    var MY = state.MY, DATA = { me: state.me }, window = {};
    function paintPay() { state.result = MY.payPeriod; }
    ${block}
    return { state, preset: payPresetRange, error: feeRangeError,
      search(from, to) { MY.payRange = { from, to }; searchPayRange(); } };
  `)(state, get);
}
const tick = () => new Promise(r => setImmediate(r));
const lesson = (date, extra = {}) => ({ date, status: 'finish', amount: 50, deduction_total: 0, ...extra });
const response = lessons => ({ ok: true, lessons, teacher: {} });
const api = make(async () => response([
  lesson('2026-11-01'), lesson('2026-11-15', { deduction_total: 10, feedback_ok: false }),
  lesson('2026-11-16', { status: 'student_absent', amount: 25 }),
  lesson('2026-11-30', { status: 'postponed', amount: 0 }),
  lesson('2026-11-20', { status: 'upcoming', amount: 1000 }), lesson('2026-12-01')
]));
assert.deepEqual(api.preset('2026-11-12', 'first'), { from: '2026-11-01', to: '2026-11-15' });
assert.deepEqual(api.preset('2026-12-12', 'second'), { from: '2026-12-16', to: '2026-12-31' });
assert.equal(api.preset('2028-02-01', 'second').to, '2028-02-29');
assert.equal(api.preset('2027-02-01', 'second').to, '2027-02-28');
assert.equal(api.error({ from: '2026-02-30', to: '2026-03-01' }), 'dates');
api.search('2026-11-01', '2026-11-15'); await tick();
assert.equal(api.state.result.summary.final_amount, 90);
assert.equal(api.state.result.summary.no_feedback_count, 1);
assert.equal(api.state.result.lessons.length, 2);
api.search('2026-11-16', '2026-11-30'); await tick();
assert.equal(api.state.result.summary.final_amount, 25);
assert.equal(api.state.result.summary.absent_count, 1);
assert.equal(api.state.result.summary.postponed_count, 1);
assert.equal(api.state.result.lessons.length, 2);
api.state.MY.pay = { summary: { final_amount: 99999 } };
assert.equal(api.state.result.summary.final_amount, 25, 'monthly stats cannot overwrite period');
api.search('2026-11-20', '2026-11-01');
assert.equal(api.state.result.err, 'order');
api.search('', '2026-11-30'); assert.equal(api.state.result.err, 'dates');
api.search('2026-01-01', '2026-11-30'); assert.equal(api.state.result.err, 'span');
const calls = [];
const cross = make(async (key, url) => {
  calls.push(url);
  return response([lesson(url.includes('month=12') ? '2026-12-31' : '2027-01-01')]);
});
cross.search('2026-12-16', '2027-01-15'); await tick();
assert.equal(cross.state.result.summary.final_amount, 100);
assert.equal(calls.length, 2);
assert.ok(calls.every(u => !u.includes('teacher_name') && !u.includes('teacher_id')));
const manager = make(async (key, url) => {
  assert.match(url, /&teacher_id=t27$/);
  return response([lesson('2026-11-15')]);
}, { is_manager: true, linked_teacher_ids: ['27'] });
manager.search('2026-11-01', '2026-11-15'); await tick();
assert.equal(manager.state.result.summary.final_amount, 50);
for (const ids of [[], ['27', '28']]) {
  const unlinked = make(() => assert.fail('must not request pay without a unique teacher'), {
    is_manager: true, linked_teacher_ids: ids
  });
  unlinked.search('2026-11-01', '2026-11-15');
  assert.equal(unlinked.state.result.err, 'identity');
}
const floor = make(async () => response([lesson('2026-11-15', { amount: 0, deduction_total: 100 }), lesson('2026-11-16')]));
floor.search('2026-11-01', '2026-11-30'); await tick();
assert.equal(floor.state.result.summary.final_amount, 0);
const pending = [];
const race = make(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
race.search('2026-10-01', '2026-10-15');
race.search('2026-11-01', '2026-11-15');
pending[1].resolve(response([lesson('2026-11-15')])); await tick();
pending[0].reject(new Error('late failure')); await tick();
assert.equal(race.state.result.from, '2026-11-01');
const bad = make(async () => ({ ok: true }));
bad.search('2026-11-01', '2026-11-15'); await tick();
assert.equal(bad.state.result.err, 'load', 'missing data is not a zero-pay result');
const empty = make(async () => response([]));
empty.search('2026-11-01', '2026-11-15'); await tick();
assert.equal(empty.state.result.summary.final_amount, 0);
console.log('PASS teacher payroll periods: boundaries, leap years, cross-year, deductions, validation, races, monthly isolation and failures');
