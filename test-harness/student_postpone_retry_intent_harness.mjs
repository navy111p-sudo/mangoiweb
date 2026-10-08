/** Student request intent regression suite, using PR1411's automatic-apply default.
 * Actual student request handler, signed synthetic UID tokens, auto-approval and
 * SQL on in-memory SQLite. Fixed clock and offline guard; no live/router/browser claim.
 * Mutations use disposable source copies. Crashes never count as caught mutants.
 */
import './helpers/offline-network-guard.cjs';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);
const GUARD = join(ROOT, 'test-harness/helpers/offline-network-guard.cjs');

if (process.env.STUDENT_RETRY_CHILD === '1') {
  const SRC = process.env.STUDENT_RETRY_SRC || REAL_SRC;
  registerHooks({ resolve(spec, ctx, next) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\.(ts|js|mjs|json|cjs)$/.test(spec) && ctx.parentURL) {
      const url = new URL(spec + '.ts', ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  } });
  const RealDate = Date, NOW = RealDate.parse('2026-10-06T09:00:00+09:00');
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  };
  const warnings = [], results = [];
  console.warn = (...args) => warnings.push(args.map(String).join(' ').slice(0, 200));
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, ...(!pass ? { detail } : {}) });
  const { DatabaseSync } = await import('node:sqlite');
  const sql = new DatabaseSync(':memory:');
  let autoReads = 0, teacherLookupIds = [], failTeacherLookup = false, beforeBatch = null, failDecision = false;
  const stmt = (query, args = []) => ({
    query, args,
    bind: (...values) => stmt(query, values.map(value => value ?? null)),
    async first(column) {
      if (/SELECT \* FROM schedule_change_requests WHERE id = \? LIMIT 1/.test(query)) autoReads++;
      if (/SELECT id, name FROM teachers WHERE id = \?/.test(query)) teacherLookupIds.push(args[0]);
      if (failTeacherLookup && /SELECT id, name FROM teachers/.test(query)) throw new Error('synthetic teacher lookup failure');
      const row = sql.prepare(query).get(...args);
      return row ? (column ? row[column] : { ...row }) : null;
    },
    async all() {
      if (failTeacherLookup && /SELECT id, name FROM teachers/.test(query)) throw new Error('synthetic teacher lookup failure');
      return { success: true, results: sql.prepare(query).all(...args).map(row => ({ ...row })) };
    },
    async run() {
      if (failDecision && /UPDATE schedule_change_requests SET status = 'approved'/.test(query)) throw new Error('synthetic decision failure');
      const result = sql.prepare(query).run(...args);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    },
    async raw() { return sql.prepare(query).all(...args).map(Object.values); },
  });
  const DB = {
    prepare: query => stmt(query),
    async exec(query) { sql.exec(query); return { count: 1 }; },
    async batch(statements) {
      if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; hook(); }
      sql.exec('BEGIN IMMEDIATE');
      try {
        const out = [];
        for (const statement of statements) out.push(await statement.run());
        sql.exec('COMMIT'); return out;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const env = { DB, ROOM_JWT_SECRET: 'synthetic-student-retry-secret-no-live-access' };
  const imp = file => import(pathToFileURL(join(SRC, file)).href);
  const { handleMangoApi } = await imp('api-mango.ts');
  const { signUidToken } = await imp('auth-token.ts');
  const { ensureScheduleChangeRequestTable } = await imp('student-schedule-request.ts');
  const { scheduleMoveVersion } = await imp('class-schedule-move.ts');
  const { readWeeklyPostponePlan } = await imp('weekly-postpone.ts');
  // Current schema statements, not a separately maintained test schema.
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const teacherStart = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const teacherEnd = adminSrc.indexOf("].join(' ')", teacherStart);
  if (teacherStart < 0 || teacherEnd < teacherStart) throw new Error('teachers schema anchor missing');
  sql.exec([...adminSrc.slice(teacherStart, teacherEnd).matchAll(/`([^`]*)`/g)].map(m => m[1]).join(' '));
  const prime = new Request('https://retry.invalid/api/class/sessions/today?user_id=synthetic-prime');
  await handleMangoApi(prime, new URL(prime.url), env, {});
  await ensureScheduleChangeRequestTable(env);
  sql.exec("CREATE UNIQUE INDEX retry_unique_teacher_slot ON class_schedules(teacher_id,scheduled_date,start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL");
  for (const [id, name, active] of [[1, 'ALPHA', 1], [2, 'BETA', 1], [3, 'DUPLICATE', 1], [4, 'DUPLICATE', 1], [5, 'INACTIVE', 0]]) {
    sql.prepare('INSERT INTO teachers(id,name,active,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, name, active, NOW, NOW);
  }
  const token = await signUidToken('synthetic-student', env);
  const row = () => ({ ...sql.prepare('SELECT * FROM class_schedules WHERE id=7').get() });
  const pending = () => ({ ...sql.prepare('SELECT * FROM schedule_change_requests WHERE id=14').get() });
  const insert = (table, values) => {
    const keys = Object.keys(values);
    sql.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(key => values[key]));
  };
  const BASE = { schedule_id: 7, request_type: 'postpone', new_date: '2026-10-14', new_time: '18:00' };
  const malformedTeacherIds = ['1junk', 1.5, '1.5', '1e0', '+1', '0x1', '9007199254740992', 9007199254740992, '-1'];
  const seed = (requestValues = {}, scheduleValues = {}) => {
    sql.exec('DELETE FROM schedule_change_requests; DELETE FROM class_schedules');
    autoReads = 0; teacherLookupIds = []; failTeacherLookup = false; beforeBatch = null; failDecision = false;
    insert('class_schedules', { id: 7, user_id: 'synthetic-student', student_name: 'Synthetic Student', schedule_kind: 'one_off',
      class_type: 'regular', scheduled_date: '2026-10-10', start_time: '18:00', duration_min: 20, teacher_id: '1',
      status: 'active', source: 'synthetic-retry', created_at: NOW - 86400000, updated_at: NOW - 86400000, ...scheduleValues });
    insert('schedule_change_requests', { id: 14, schedule_id: 7, request_type: 'postpone', requester_role: 'student',
      requester_name: 'Synthetic Student', requester_uid: 'synthetic-student', teacher_name: 'ALPHA', student_name: 'Synthetic Student',
      orig_date: '2026-10-10', orig_time: '18:00', new_date: '2026-10-14', new_time: '18:00', fee_type: 'free', minutes_before: 600,
      status: 'pending', created_at: NOW - 1000, schedule_snapshot: scheduleMoveVersion(row()), ...requestValues });
  };
  const call = async (body = BASE) => {
    const request = new Request('https://retry.invalid/api/class/schedule/request', { method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const response = await handleMangoApi(request, new URL(request.url), env, {});
    return { status: response?.status || 0, body: response ? await response.json() : null };
  };
  const unchanged = (oldClass, oldRequest) => JSON.stringify(row()) === JSON.stringify(oldClass)
    && JSON.stringify(pending()) === JSON.stringify(oldRequest)
    && sql.prepare('SELECT COUNT(*) AS n FROM schedule_change_requests').get().n === 1;
  const reject = async (name, payload, requestValues = {}, options = {}) => {
    seed(requestValues); failTeacherLookup = !!options.lookupFailure;
    const oldClass = row(), oldRequest = pending(), result = await call({ ...BASE, ...payload });
    check(name + ': 409 without auto-approval or schedule/request change', result.status === 409
      && result.body.error === 'already_pending' && autoReads === 0 && unchanged(oldClass, oldRequest)
      && (!options.noIdLookup || teacherLookupIds.length === 0), { result, autoReads, teacherLookupIds, row: row(), pending: pending() });
  };
  await reject('Changed request type', { request_type: 'change' });
  await reject('Changed request type from pending change', {}, { request_type: 'change' });
  await reject('Changed destination date', { new_date: '2026-10-21' });
  await reject('Changed destination time', { new_time: '19:00' });
  await reject('Changed type and destination', { request_type: 'change', new_date: '2026-10-21' });
  await reject('Date omitted instead of dated move', { new_date: null, new_time: null });
  await reject('Date supplied instead of undated postponement', {}, { new_date: null, new_time: null });
  await reject('Noncanonical stored date', {}, { new_date: '2026/10/14' });
  await reject('Noncanonical stored time', {}, { new_time: '18:00:59' });
  await reject('Changed teacher ID', { teacher_id: 2 });
  await reject('Different resolved teacher than pending request', { teacher_id: 3 }, { new_teacher_id: '2' });
  await reject('Omitted teacher cannot discard pending resolved teacher', {}, { new_teacher_id: '2' });
  await reject('Changed teacher name', { teacher_name: 'beta' });
  await reject('Unknown teacher ID', { teacher_id: 999 });
  await reject('Malformed teacher ID', { teacher_id: 'invalid' });
  for (const teacher_id of malformedTeacherIds) await reject('Exact ID retry rejects ' + JSON.stringify(teacher_id), { teacher_id }, {}, { noIdLookup: true });
  await reject('Inactive teacher ID', { teacher_id: 5 });
  await reject('Unknown teacher name', { teacher_name: 'UNKNOWN' });
  await reject('Ambiguous teacher name', { teacher_name: 'DUPLICATE' });
  await reject('Teacher lookup failure', { teacher_id: 1 }, {}, { lookupFailure: true });
  await reject('Legacy unresolved teacher note', {}, { reason: '희망 강사: UNKNOWN' });
  await reject('Single scope changed to weekly', { request_scope: 'weekly_postpone' });
  await reject('Weekly scope changed to single', {}, { request_scope: 'weekly_postpone', series_snapshot: 'old-series' });
  await reject('Invalid scope', { request_scope: 'unknown' });
  await reject('Identical invalid scope', { request_scope: 'unknown' }, { request_scope: 'unknown' });
  await reject('Weekly snapshot differs', { request_scope: 'weekly_postpone', expected_series_snapshot: 'new-series' },
    { request_scope: 'weekly_postpone', series_snapshot: 'old-series' });
  await reject('Weekly snapshot missing', { request_scope: 'weekly_postpone' }, { request_scope: 'weekly_postpone', series_snapshot: 'old-series' });

  for (const [name, payload] of [
    ['Identical retry', {}], ['Slash date and seconds normalize', { new_date: ' 2026/10/14 ', new_time: ' 18:00:00 ' }],
    ['Current teacher ID', { teacher_id: 1 }], ['Current teacher exact name', { teacher_name: 'ALPHA' }],
    ['Current teacher case-insensitive name', { teacher_name: 'alpha' }], ['Empty single scope', { request_scope: '' }],
    ...['1', '001', ' 001 '].map(teacher_id => ['Full-string teacher ID ' + JSON.stringify(teacher_id), { teacher_id }]),
    ['Malformed ID name fallback', { teacher_id: '1junk', teacher_name: 'alpha' }],
  ]) {
    seed(); const result = await call({ ...BASE, ...payload });
    check(name + ': reuses ID14 and applies intended destination once', result.status === 200 && result.body.id === 14
      && result.body.status === 'approved' && row().scheduled_date === BASE.new_date && row().start_time === BASE.new_time
      && pending().status === 'approved' && autoReads === 1
      && sql.prepare('SELECT COUNT(*) AS n FROM schedule_change_requests').get().n === 1, { result, autoReads, row: row() });
  }
  seed({ new_date: null, new_time: null });
  let result = await call({ schedule_id: 7 });
  check('Identical undated retry postpones original row', result.status === 200 && result.body.id === 14
    && result.body.auto_applied === 'postponed' && row().status === 'postponed' && pending().status === 'approved', result);
  seed(); insert('class_schedules', { ...row(), id: 8, scheduled_date: '2026-10-17' });
  const plan = await readWeeklyPostponePlan(env, row());
  if (!plan.ok) throw new Error('Synthetic weekly plan failed: ' + plan.error);
  sql.prepare("UPDATE schedule_change_requests SET new_date='2026-10-17', request_scope='weekly_postpone', series_snapshot=? WHERE id=14").run(plan.snapshot);
  result = await call({ ...BASE, new_date: '2026-10-17', request_scope: 'weekly_postpone', expected_series_snapshot: plan.snapshot });
  check('Exact weekly retry moves both rows', result.status === 200 && result.body.id === 14
    && row().scheduled_date === '2026-10-17' && sql.prepare('SELECT scheduled_date FROM class_schedules WHERE id=8').get().scheduled_date === '2026-10-24'
    && pending().status === 'approved', result);
  seed({ fee_type: 'paid' }); let originalClass = row(), originalRequest = pending();
  result = await call();
  check('Exact paid retry applies and preserves its fee marker', result.status === 200 && result.body.id === 14
    && result.body.auto_applied === 'moved' && row().scheduled_date === BASE.new_date
    && pending().status === 'approved' && pending().fee_type === 'paid' && autoReads === 1, result);
  seed({ request_type: 'change' });
  result = await call({ ...BASE, request_type: 'change' });
  check('Exact change retry applies the matching request', result.status === 200 && result.body.id === 14
    && result.body.auto_applied === 'moved' && row().scheduled_date === BASE.new_date
    && pending().status === 'approved' && pending().request_type === 'change', result);
  for (const teacher of [{ teacher_id: 2 }, { teacher_id: ' 0002 ' }, { teacher_name: 'beta' }]) {
    seed({ new_teacher_id: '2', reason: '희망 강사: BETA' });
    result = await call({ ...BASE, ...teacher });
    check('Exact teacher-change retry applies date and teacher ' + JSON.stringify(teacher), result.status === 200
      && result.body.id === 14 && result.body.auto_applied === 'moved' && row().scheduled_date === BASE.new_date
      && String(row().teacher_id) === '2' && pending().status === 'approved' && pending().new_teacher_id === '2', result);
  }
  seed(); originalClass = row(); originalRequest = pending(); failDecision = true;
  result = await call();
  check('Decision failure rolls back retry movement', result.status === 409 && unchanged(originalClass, originalRequest), result);
  seed(); beforeBatch = () => sql.prepare("UPDATE class_schedules SET start_time='19:00' WHERE id=7").run();
  result = await call();
  check('Concurrent edit wins and retry remains pending', result.status === 409 && row().start_time === '19:00'
    && row().scheduled_date === '2026-10-10' && pending().status === 'pending', result);
  seed(); sql.exec('DELETE FROM schedule_change_requests'); result = await call();
  check('Fresh free postpone still auto-applies', result.status === 200 && result.body.status === 'approved' && row().scheduled_date === BASE.new_date, result);
  seed(); sql.exec('DELETE FROM schedule_change_requests');
  result = await call({ ...BASE, request_type: 'change', teacher_id: 2 });
  check('Fresh change applies its chosen date and teacher', result.status === 200 && result.body.status === 'approved'
    && result.body.auto_applied === 'moved' && row().scheduled_date === BASE.new_date && String(row().teacher_id) === '2', result);

  for (const [name, teacher, expected, options = {}] of [
    ['Missing teacher', {}, 'approved'], ['Null teacher', { teacher_id: null, teacher_name: null }, 'approved'],
    ['Blank teacher', { teacher_id: '', teacher_name: '' }, 'approved'], ['Whitespace teacher', { teacher_id: '  ', teacher_name: '  ' }, 'approved'],
    ['Unresolved teacher ID', { teacher_id: 999 }, 'teacher_unresolved'], ['Zero teacher ID', { teacher_id: 0 }, 'teacher_unresolved'],
    ['Malformed teacher ID', { teacher_id: 'not-a-number' }, 'teacher_unresolved'],
    ...malformedTeacherIds.map(teacher_id => ['Exact ID rejects ' + JSON.stringify(teacher_id), { teacher_id }, 'teacher_unresolved', { noIdLookup: true }]),
    ['Inactive teacher ID', { teacher_id: 5 }, 'teacher_unresolved'], ['Unresolved teacher name', { teacher_name: 'UNKNOWN' }, 'teacher_unresolved'],
    ['Ambiguous teacher name', { teacher_name: 'DUPLICATE' }, 'teacher_unresolved'],
    ['Unresolved ID and name', { teacher_id: 999, teacher_name: 'UNKNOWN' }, 'teacher_unresolved'],
    ['Unresolved whitespace retained', { teacher_id: ' 999 ', teacher_name: '  UNKNOWN  ' }, 'teacher_unresolved'],
    ['Unresolved long name retained', { teacher_name: 'UNKNOWN'.repeat(12) }, 'teacher_unresolved'],
    ['Failed ID lookup', { teacher_id: 1 }, 'teacher_unresolved', { lookupFailure: true }],
    ['Failed name lookup', { teacher_name: 'beta' }, 'teacher_unresolved', { lookupFailure: true }],
    ['Mapped different teacher ID', { teacher_id: 2 }, 'approved', { teacherId: '2' }], ['Mapped different teacher name', { teacher_name: 'beta' }, 'approved', { teacherId: '2' }],
    ['Unchanged teacher ID', { teacher_id: 1 }, 'approved'], ['Unchanged teacher name', { teacher_name: 'alpha' }, 'approved'],
    ...['1', '001', ' 001 '].map(teacher_id => ['Full-string teacher ID ' + JSON.stringify(teacher_id), { teacher_id }, 'approved']),
    ['Leading-zero different teacher ID', { teacher_id: ' 0002 ' }, 'approved', { teacherId: '2' }],
    ['Malformed ID current name fallback', { teacher_id: '1junk', teacher_name: 'alpha' }, 'approved'],
    ['Malformed ID different name fallback', { teacher_id: '1junk', teacher_name: 'beta' }, 'approved', { teacherId: '2' }],
  ]) {
    seed(); sql.exec('DELETE FROM schedule_change_requests'); originalClass = row(); failTeacherLookup = !!options.lookupFailure;
    const response = await call({ ...BASE, ...teacher, reason: 'Synthetic student reason' });
    const stored = sql.prepare('SELECT * FROM schedule_change_requests WHERE id=?').get(response.body.id);
    const notification = sql.prepare('SELECT * FROM notification_queue ORDER BY id DESC LIMIT 1').get();
    const applied = expected === 'approved';
    const inputRetained = expected !== 'teacher_unresolved' || (stored?.reason?.includes('Synthetic student reason')
      && (teacher.teacher_id == null || stored.reason.includes(String(teacher.teacher_id)))
      && (!teacher.teacher_name || stored.reason.includes(teacher.teacher_name)));
    check('Fresh ' + name + ': explicit response and preserved intent', response.status === 200 && response.body.ok === true
      && response.body.status === (applied ? 'approved' : 'pending')
      && (applied ? response.body.auto_applied === 'moved' : response.body.auto_applied === null && response.body.auto_reason === expected)
      && stored?.status === response.body.status && stored?.teacher_name === 'ALPHA' && inputRetained
      && (!options.noIdLookup || teacherLookupIds.length === 0)
      && (applied ? row().scheduled_date === BASE.new_date && String(row().teacher_id) === (options.teacherId || '1') : JSON.stringify(row()) === JSON.stringify(originalClass))
      && (expected !== 'teacher_unresolved' || (autoReads === 0 && notification?.body?.includes('희망 강사 확인 필요')
        && notification.body.includes('자동으로 옮기지 못했습니다') && notification.body.includes('관리자 페이지에서 확인하세요.'))),
      { response, stored, row: row(), autoReads, teacherLookupIds, notification });
    if (expected === 'teacher_unresolved') {
      // Actual UI response mapper, using an in-process fetch fixture only.
      const html = readFileSync(join(ROOT, 'cloudflare-deploy/public/lesson-postpone-demo.html'), 'utf8');
      const begin = html.indexOf('function __mobPersist(){'), end = html.indexOf('window.__mobLastFee', begin);
      if (begin < 0 || end < begin) throw new Error('UI persistence function anchor missing');
      const original = { schedule_id: 7, date: '2026-10-10' }, next = { date: BASE.new_date, hour: BASE.new_time };
      const saved = await new Function('__MOB_REAL', 'localStorage', 'state', 'CURRENT_SCHEDULE', '__mobPairs', 'fetch',
        html.slice(begin, end) + '\nreturn __mobPersist();')(true, { getItem: () => 'synthetic-ui-token' },
        { mode: 'postpone', cart: [next] }, [original], () => [{ o: original, nw: next }],
        async () => ({ ok: response.status === 200, status: response.status, json: async () => response.body }));
      check('Fresh ' + name + ': UI reports saved pending, not moved', saved.ok && saved.sent === 1 && saved.total === 1 && saved.auto === 0, saved);
      autoReads = 0; failTeacherLookup = false;
      const retry = await call(), retained = sql.prepare('SELECT * FROM schedule_change_requests WHERE id=?').get(stored.id);
      check('Fresh ' + name + ': omitted teacher cannot erase pending choice', retry.status === 409 && retry.body.error === 'already_pending'
        && autoReads === 0 && JSON.stringify(retained) === JSON.stringify(stored) && JSON.stringify(row()) === JSON.stringify(originalClass), { retry, autoReads, retained });
    }
  }
  console.log(JSON.stringify({ results, warnings: warnings.slice(0, 8) }));
  process.exit(0);
}

const temporary = mkdtempSync(join(tmpdir(), 'student-retry-intent-'));
let failed = 0;
const run = source => {
  const result = spawnSync(process.execPath, ['--no-warnings', '--require', GUARD, SELF], {
    env: { ...process.env, STUDENT_RETRY_CHILD: '1', STUDENT_RETRY_SRC: source }, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('Child crashed: ' + result.stderr + result.error);
  return JSON.parse(result.stdout);
};
try {
  const baseline = run(REAL_SRC);
  for (const test of baseline.results) {
    console.log((test.pass ? 'PASS ' : 'FAIL ') + test.name + (!test.pass ? ' ' + JSON.stringify(test.detail) : ''));
    if (!test.pass) failed++;
  }
  if (failed) console.log('Mutations skipped because the baseline is not green.');
  else {
    const mutations = [
      ['Bypass intent match', 'if (sameIntent) {', 'if (true) {'],
      ['Ignore request type', '&& pendingRequest.request_type === reqType', ''],
      ['Ignore destination date', '&& (pendingRequest.new_date || null) === newDate', ''],
      ['Ignore destination time', '&& (pendingRequest.new_time || null) === newTime', ''],
      ['Ignore teacher identity', '&& s10(pendingRequest.new_teacher_id) === newTeacherId', ''],
      ['Ignore scope identity', '&& (pendingRequest.request_scope || null) === (requestScope || null)', ''],
      ['Allow invalid scope', '&& (!requestScope || requestScope === WEEKLY_POSTPONE)', ''],
      ['Ignore weekly snapshot', '&& (requestScope !== WEEKLY_POSTPONE || pendingRequest.series_snapshot === body.expected_series_snapshot)', ''],
      ['Erase unresolved teacher intent', 'const sameIntent = teacherIntentResolved', 'const sameIntent = true'],
      ['Erase pending unresolved teacher choice', '&& !pendingTeacherUnresolved', ''],
      ['Auto-approve unresolved fresh teacher', 'const auto = teacherIntentResolved', 'const auto = true'],
      ['Lose unresolved teacher input', "wishNote = [wish ? `희망 강사: ${rawWish}` : '', wishIdInput ? `희망 강사 번호: ${rawWishId}` : '', '희망 강사 확인 필요']", "wishNote = ['희망 강사 확인 필요']"],
      ['Loosely parse requested teacher ID', 'const wishId = Number.isSafeInteger(wishIdNumber) && wishIdNumber > 0 ? wishIdNumber : 0;', 'const wishId = parseInt(body.teacher_id, 10) || 0;'],
      ['Accept unsafe teacher integer', 'Number.isSafeInteger(wishIdNumber) && wishIdNumber > 0', 'wishIdNumber > 0'],
    ];
    for (const [name, from, to] of mutations) {
      const copy = join(temporary, name.replaceAll(' ', '-')); cpSync(REAL_SRC, copy, { recursive: true });
      const path = join(copy, 'api-mango.ts'), source = readFileSync(path, 'utf8');
      if (!source.includes(from)) throw new Error('Mutation anchor missing: ' + name);
      writeFileSync(path, source.replace(from, to));
      const caught = run(copy).results.filter(test => !test.pass);
      console.log((caught.length ? 'PASS ' : 'FAIL ') + 'mutation ' + name + ': ' + caught.length + ' behavior failures');
      if (!caught.length) failed++;
      rmSync(copy, { recursive: true, force: true });
    }
  }
  console.log('Result: ' + baseline.results.length + ' behavior checks, ' + failed + ' failures');
} finally { rmSync(temporary, { recursive: true, force: true }); }
process.exit(failed ? 1 : 0);
