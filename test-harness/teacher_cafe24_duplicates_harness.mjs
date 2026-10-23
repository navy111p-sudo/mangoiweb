import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(new URL('../cloudflare-deploy/package.json', import.meta.url))('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const mod = { exports: {} }; cache.set(name, mod);
  const source = readFileSync(new URL('../cloudflare-deploy/src/' + name + '.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', js)(mod, mod.exports, rel => load(rel.replace('./', '')));
  return mod.exports;
}
const { dropTeacherCafe24Duplicates: drop } = load('teacher-cafe24-duplicates');
const start = Date.parse('2026-10-23T20:00:00+09:00');
const schedule = Object.freeze({ id: 6827, user_id: 'mangoiai_yahee', scheduled_date: '2026-10-23', start_time: '20:00', sched_status: 'active' });
const local = Object.freeze({ kind: 'class', schedule_id: 6827, student_uid: schedule.user_id, start_ts: start, room_id: 'class-6827-20261023', status: 'done', class_state: 'done', join_open: false, attendance: { state: 'late' } });
const lms = Object.freeze({ room_id: 'c24-100', user_id: schedule.user_id, joined_at: start, left_at: start + 1200000 });
const dow = (raw, day) => raw === day || raw === 'Fri' && day === 5;

test('#6827 survives with room and attendance; only its LMS row is hidden', () => {
  assert.deepEqual(drop([lms], [schedule], [local], dow), { kept: [], hidden: 1 });
  assert.equal(local.schedule_id, 6827);
  assert.equal(local.room_id, 'class-6827-20261023');
  assert.equal(local.attendance.state, 'late');
  assert.equal(schedule.sched_status, 'active');
});
test('historical duplicate is hidden even when absent from today or selected week', () => {
  assert.equal(drop([lms], [schedule], [], dow).hidden, 1);
  assert.equal(drop([lms], [], [local], dow).hidden, 1); // cover schedule today
});
test('retain other students, timestamps, dates, missing identities, cancelled and postponed slots', () => {
  for (const patch of [{ user_id: 'other' }, { joined_at: start + 1 }, { joined_at: start + 86400000 }, { user_id: '' }])
    assert.equal(drop([{ ...lms, ...patch }], [schedule], [], dow).hidden, 0);
  for (const sched_status of ['cancelled', 'postponed']) {
    assert.equal(drop([lms], [{ ...schedule, sched_status }], [], dow).hidden, 0);
    assert.equal(drop([lms], [], [{ ...local, class_state: sched_status }], dow).hidden, 0);
  }
});
test('recurrence uses canonical weekday, start date and skipped occurrences', () => {
  const recurring = { ...schedule, scheduled_date: null, day_of_week: 'Fri', starts_on: '2026-10-01' };
  assert.equal(drop([lms], [recurring], [], dow).hidden, 1);
  assert.equal(drop([lms], [{ ...recurring, starts_on: '2026-10-24' }], [], dow).hidden, 0);
  assert.equal(drop([lms], [{ ...recurring, skip_dates: '2026-10-23' }], [], dow).hidden, 0);
  assert.equal(drop([lms], [{ ...recurring, day_of_week: 4 }], [], dow).hidden, 0);
});
test('invalid input and LMS/sample placeholders cannot suppress history', () => {
  for (const patch of [{ start_time: '25:00' }, { start_time: '' }, { user_id: 'lms' }, { user_id: 'type_seed' }])
    assert.equal(drop([lms], [{ ...schedule, ...patch }], [], dow).hidden, 0);
  for (const joined_at of [null, NaN, Infinity, 8640000000000000])
    assert.equal(drop([{ ...lms, joined_at }], [schedule], [], dow).hidden, 0);
  assert.equal(drop([lms], [], [{ ...local, kind: 'sample' }], dow).hidden, 0);
});
test('real portal append block keeps #6827 and retains unrelated LMS history', () => {
  const src = readFileSync(new URL('../cloudflare-deploy/src/api-teacher.ts', import.meta.url), 'utf8');
  const from = src.indexOf('const lmsVisible = dropTeacherCafe24Duplicates(');
  const to = src.indexOf('classes.sort((a, b) => a.start_ts - b.start_ts);', from);
  assert.ok(from > 0 && to > from);
  const js = ts.transpileModule(src.slice(from, to), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const classes = [local];
  const other = { ...lms, room_id: 'c24-101', user_id: 'other' };
  new Function('dropTeacherCafe24Duplicates', 'lmsRs', 'cafe24DedupeSchedules', 'classes', 'dowMatches', 'KST', 'pad', 'studentUidOf', js)
    (drop, { results: [lms, other] }, [schedule], classes, dow, 32400000, n => String(n).padStart(2, '0'), r => r.user_id);
  assert.equal(classes.length, 2);
  assert.equal(classes[0], local);
  assert.equal(classes[1].room_id, 'c24-101');
  assert.equal(classes[1].join_open, false);
});
