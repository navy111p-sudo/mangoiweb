/**
 * Atomic group moves: actual production module and SQL, local SQLite only.
 * D1.batch is modelled as one real transaction with rollback, not Promise.all.
 * Race hooks represent a second writer immediately before the transaction or
 * between source reads. One narrow UI integration runs the actual persistSlotMove
 * function against this module. No production HTTP handler or live DB is used.
 * Room checks preserve distinct schedule IDs and existing override records;
 * actual student/teacher entry routing remains covered by the room-sync harness.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

if (process.env.SGM_CHILD === '1') {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: pass ? '' : JSON.stringify(detail) });
  const RealDate = Date;
  const NOW = RealDate.parse('2026-10-04T12:00:00+09:00');
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  };
  globalThis.fetch = async () => { throw new Error('External network is forbidden in this harness'); };
  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  let beforeBatch = null, afterBatch = null, afterRead = null, readFailure = null, writeFailure = null;
  const batches = [], writes = [];
  const norm = v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  const readFault = (sql, method) => {
    if (!readFailure || !readFailure.match(sql, method)) return null;
    if (readFailure.mode === 'throw') throw new Error('injected read failure');
    return readFailure.mode === 'unsuccessful' ? { success: false, results: [] } : { success: true };
  };
  const readHook = (sql, method) => {
    if (afterRead?.match(sql, method)) { const hook = afterRead; afterRead = null; hook.run(); }
  };
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...a) => statement(sql, a.map(norm)),
    async first(col) {
      const failure = readFault(sql, 'first'); if (failure) return failure;
      const row = sq.prepare(sql).get(...args);
      readHook(sql, 'first');
      return row ? col ? row[col] : { ...row } : null;
    },
    async all() {
      const failure = readFault(sql, 'all'); if (failure) return failure;
      const rows = sq.prepare(sql).all(...args).map(r => ({ ...r }));
      readHook(sql, 'all');
      return { success: true, results: rows, meta: {} };
    },
    async run() {
      writes.push({ sql, args });
      if (writeFailure?.match(sql, args)) throw new Error('injected transaction write failure');
      const r = sq.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] };
    }
  });
  const DB = {
    prepare: sql => statement(sql),
    async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(statements) {
      batches.push(statements.map(s => ({ sql: s.sql, args: s.args })));
      if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; hook(); }
      const out = [];
      sq.exec('BEGIN IMMEDIATE');
      try {
        for (const stmt of statements) out.push(await stmt.run());
        sq.exec('COMMIT');
      } catch (e) {
        sq.exec('ROLLBACK');
        throw e;
      }
      if (afterBatch) { const hook = afterBatch; afterBatch = null; hook(); }
      return out;
    }
  };
  const env = { DB };
  const actor = { ok: true, username: 'admin', name: '관리자', isTeacher: false };
  const imp = f => import(pathToFileURL(join(SRC, f)).href);
  const { moveSchedulesAtomically: move, scheduleMoveVersion: version } = await imp('class-schedule-move.ts');
  const { ensureClassAuditTable } = await imp('class-audit.ts');
  const { ensureRoomOverrideTable } = await imp('class-room-override.ts');
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const lessonSrc = readFileSync(join(SRC, 'api-lessons.ts'), 'utf8');
  const scopeSrc = readFileSync(join(SRC, 'scope.ts'), 'utf8');
  const ddl = (src, table, needs = '') => {
    for (const m of src.matchAll(new RegExp('`(CREATE TABLE IF NOT EXISTS ' + table + '\\s*\\([\\s\\S]*?\\);?)`', 'g'))) {
      if (m[1].includes(needs)) return m[1];
    }
    throw new Error('Production DDL not found: ' + table);
  };
  sq.exec(ddl(adminSrc, 'class_schedules', 'duration_min INTEGER DEFAULT 20'));
  sq.exec('ALTER TABLE class_schedules ADD COLUMN starts_on TEXT');
  sq.exec(ddl(scopeSrc, 'admin_scope'));
  const ti = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const te = adminSrc.indexOf("].join(' ')", ti);
  sq.exec([...adminSrc.slice(ti, te).matchAll(/`([^`]*)`/g)].map(m => m[1]).join(' '));
  const blockDDL = ddl(adminSrc, 'teacher_unavailability');
  const vacationDDL = ddl(lessonSrc, 'calendar_events');
  sq.exec(blockDDL); sq.exec(vacationDDL);
  await ensureClassAuditTable(env);
  await ensureRoomOverrideTable(DB);
  const exec = (sql, ...args) => sq.prepare(sql).run(...args);
  const insert = (table, data) => {
    const keys = Object.keys(data);
    return Number(exec(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(data)).lastInsertRowid);
  };
  for (const [id, name] of [[1, 'ALPHA'], [2, 'BETA'], [3, 'GAMMA']]) {
    insert('teachers', { id, name, active: 1, created_at: NOW, updated_at: NOW });
  }
  insert('admin_scope', { username: 'admin', scope_type: 'hq', updated_at: NOW });
  const row = id => ({ ...sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id) });
  const seed = (overrides = {}) => insert('class_schedules', {
    user_id: 'student_a', student_name: 'Student A', schedule_kind: 'dated', class_type: 'regular',
    day_of_week: null, scheduled_date: '2026-10-05', start_time: '09:20', duration_min: 20,
    teacher_id: '1', status: 'active', source: 'harness', created_at: NOW, updated_at: null, starts_on: null,
    ...overrides
  });
  const group = (n = 3) => Array.from({ length: n }, (_, i) => seed({ user_id: 'student_' + i, student_name: 'Student ' + i }));
  const block = (overrides = {}) => insert('teacher_unavailability', {
    teacher_id: '2', kind: 'weekly', day_of_week: 1, start_time: '10:00', end_time: '10:30', created_at: NOW, ...overrides
  });
  const vacation = (overrides = {}) => insert('calendar_events', {
    event_type: 'vacation', title: 'Leave', teacher_name: 'BETA', date: '2026-10-05', created_at: NOW, ...overrides
  });
  const expected = ids => Object.fromEntries(ids.map(id => [String(id), version(row(id))]));
  const input = (ids, patch = {}, extra = {}) => ({ ids, expected: expected(ids), patch: { start_time: '10:00', teacher_id: '2', ...patch }, ...extra });
  const snapshot = () => JSON.stringify(sq.prepare('SELECT * FROM class_schedules ORDER BY id').all());
  const auditCount = () => Number(sq.prepare('SELECT count(*) AS n FROM class_audit_log').get().n);
  const guardEmpty = () => {
    const exists = sq.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schedule_move_guard'").get();
    return !exists || sq.prepare('SELECT count(*) AS n FROM schedule_move_guard').get().n === 0;
  };
  const reset = () => {
    beforeBatch = afterBatch = afterRead = readFailure = writeFailure = null;
    sq.exec('DELETE FROM class_schedules; DELETE FROM teacher_unavailability; DELETE FROM calendar_events; DELETE FROM class_audit_log; DELETE FROM class_room_override;');
    sq.exec("UPDATE teachers SET name=CASE id WHEN 1 THEN 'ALPHA' WHEN 2 THEN 'BETA' ELSE 'GAMMA' END; UPDATE admin_scope SET scope_type='hq';");
    batches.length = writes.length = 0;
  };
  const reject = async (name, request, error = 'schedule_changed', status = 409, acting = actor, originals) => {
    const before = snapshot(), auditBefore = auditCount();
    const result = await move(env, acting, request, originals);
    check(name + ': rejects', result.ok === false && result.status === status && result.error === error, result);
    check(name + ': no partial move or audit', snapshot() === before && auditCount() === auditBefore, { result, before, after: snapshot() });
    check(name + ': guard empty', guardEmpty());
    return result;
  };

  reset(); let ids = group();
  for (const [i, id] of ids.entries()) insert('class_room_override', { schedule_id: id, ymd: '20261005', room_id: 'meet-distinct-' + i, created_by: 'admin', created_at: NOW });
  const roomsBefore = JSON.stringify(sq.prepare('SELECT * FROM class_room_override ORDER BY schedule_id').all());
  const first = await move(env, actor, input(ids, {}, { source_date: '2026-10-05' }));
  check('group success: all members moved in one batch', first.ok && batches.length === 1 && ids.every(id => row(id).teacher_id === '2' && row(id).start_time === '10:00'), { first, batches: batches.length });
  check('group success: IDs and separate room overrides unchanged', ids.every(id => row(id).id === id) && roomsBefore === JSON.stringify(sq.prepare('SELECT * FROM class_room_override ORDER BY schedule_id').all()));
  check('group success: one audit per member and no guard residue', auditCount() === ids.length && guardEmpty());
  check('group success: exact committed versions returned for every member', first.ok && ids.every(id => first.move_versions?.[id] === version(row(id))), first);
  const undo = await move(env, actor, input(ids, { teacher_id: '1', start_time: '09:20' }, { expected: first.move_versions, source_date: '2026-10-05' }));
  check('undo success: all originals restored and distinct rooms preserved', undo.ok && ids.every(id => row(id).teacher_id === '1' && row(id).start_time === '09:20') && roomsBefore === JSON.stringify(sq.prepare('SELECT * FROM class_room_override ORDER BY schedule_id').all()), undo);

  reset(); ids = group(50);
  const maximum = await move(env, actor, input(ids, {}, { source_date: '2026-10-05' }));
  check('maximum 50-member group moves without splitting transaction', maximum.ok && maximum.count === 50 && batches.length === 1 && auditCount() === 50, maximum);
  check('maximum group stays within D1 per-statement bind budget', batches[0]?.every(s => s.args.length <= 100), batches[0]?.map(s => s.args.length));
  reset(); ids = group(2);
  const duplicate = await move(env, actor, input([ids[0], ids[1], ids[0]]));
  check('duplicate IDs are applied and audited only once', duplicate.ok && duplicate.count === 2 && auditCount() === 2, duplicate);

  for (const [name, match] of [
    ['second row update fails', (sql, args, groupIds) => /^UPDATE class_schedules/.test(sql) && Number(args.at(-1)) === groupIds[1]],
    ['second audit insert fails', (sql, args, groupIds) => /^INSERT INTO class_audit_log/.test(sql) && Number(args[0]) === groupIds[1]],
    ['guard deletion fails', sql => /^DELETE FROM schedule_move_guard/.test(sql)],
  ]) {
    reset(); ids = group(); writeFailure = { match: (sql, args) => match(sql, args, ids) };
    await reject('rollback: ' + name, input(ids), 'move_failed', 503);
    check('rollback: ' + name + ' exercised real batch', batches.length === 1 && writes.some(w => /^UPDATE class_schedules/.test(w.sql)), batches);
  }

  reset(); ids = group(); let request = input(ids); request.expected[ids[1]] = 'stale';
  await reject('one stale expected version rejects entire group', request);
  reset(); ids = group(); request = input(ids); exec('DELETE FROM class_schedules WHERE id=?', ids[1]);
  await reject('missing member rejects entire group', request, 'schedule_not_found', 404);
  reset(); ids = group(); request = input(ids, {}, { source_date: '2026-10-05' }); seed({ user_id: 'new_member' });
  await reject('new source group member rejects stale selection', request, 'group_changed');
  reset(); ids = group(); request = input(ids, {}, { source_date: '2026-10-05' }); exec("UPDATE class_schedules SET start_time='09:40' WHERE id=?", ids[1]); request.expected = expected(ids);
  await reject('source group members no longer share slot', request, 'group_changed');

  reset(); ids = [seed({start_time:'9:20'}), seed({user_id:'student_b',start_time:'09:20'})];
  const padded = await move(env, actor, input(ids, {}, {source_date:'2026-10-05'}));
  check('equivalent H:MM and HH:MM source times move as one exact-minute group', padded.ok && ids.every(id => row(id).start_time === '10:00'), padded);
  reset(); ids = [seed({start_time:'09:20'}), seed({user_id:'student_b',start_time:'09:21'})];
  await reject('display bucket cannot broaden exact-minute group identity', input(ids, {}, {source_date:'2026-10-05'}), 'group_changed');
  reset(); ids = [seed({start_time:'invalid'}), seed({user_id:'student_b',start_time:'invalid'})];
  await reject('invalid historical times cannot become an equal midnight group', input(ids, {}, {source_date:'2026-10-05'}), 'group_changed');

  const races = [
    ['teacher conflict inserted', () => seed({ user_id: 'other', teacher_id: '2', start_time: '10:10' })],
    ['student conflict inserted', current => seed({ user_id: row(current[0]).user_id, teacher_id: '3', start_time: '10:10' })],
    ['break inserted', () => block()],
    ['vacation inserted', () => vacation()],
    ['teacher name changes', () => exec("UPDATE teachers SET name='RENAMED' WHERE id=2")],
    ['scope changes', () => exec("UPDATE admin_scope SET scope_type='branch' WHERE username='admin'")],
    ['scope deleted', () => exec("DELETE FROM admin_scope WHERE username='admin'")],
    ['source time changes', current => exec("UPDATE class_schedules SET start_time='11:00' WHERE id=?", current[1])],
    ['source student changes', current => exec("UPDATE class_schedules SET user_id='different' WHERE id=?", current[1])],
    ['source member deleted', current => exec('DELETE FROM class_schedules WHERE id=?', current[1])],
    ['source cancelled', current => exec("UPDATE class_schedules SET status='cancelled' WHERE id=?", current[1])],
    ['new group member inserted', () => seed({ user_id: 'late_member' })],
  ];
  for (const [name, mutate] of races) {
    reset(); exec("INSERT OR IGNORE INTO admin_scope(username,scope_type,updated_at) VALUES ('admin','hq',?)", NOW);
    ids = group(); request = input(ids); let racingState;
    beforeBatch = () => { mutate(ids); racingState = snapshot(); };
    const result = await move(env, actor, request);
    check('snapshot race: ' + name + ' rejects', result.ok === false && result.status === 409 && result.error === 'schedule_changed', result);
    check('snapshot race: ' + name + ' preserves external change and rolls back all ours', racingState === snapshot() && auditCount() === 0 && guardEmpty(), { result, racingState, actual: snapshot() });
    check('snapshot race: ' + name + ' reaches SQL CHECK', batches.length === 1 && !writes.some(w => /^UPDATE class_schedules/.test(w.sql)), batches);
  }
  exec("INSERT OR IGNORE INTO admin_scope(username,scope_type,updated_at) VALUES ('admin','hq',?)", NOW);

  for (const [name, mutate] of [
    ['time edit', current => exec("UPDATE class_schedules SET start_time='09:30' WHERE id=?", current[0])],
    ['student identity edit', current => exec("UPDATE class_schedules SET user_id='new_student' WHERE id=?", current[0])],
    ['recurrence kind edit', current => exec("UPDATE class_schedules SET schedule_kind='one_off' WHERE id=?", current[0])],
    ['recurrence start edit', current => exec("UPDATE class_schedules SET starts_on='2026-10-06' WHERE id=?", current[0])],
  ]) {
    reset(); ids = group(); request = input(ids); let racingState;
    afterRead = { match: (sql, method) => method === 'all' && /^SELECT \* FROM class_schedules WHERE id IN/.test(sql),
      run: () => { mutate(ids); racingState = snapshot(); } };
    const result = await move(env, actor, request);
    check('source read race before snapshot: ' + name + ' rejects', result.ok === false && result.status === 409 && result.error === 'schedule_changed', result);
    check('source read race before snapshot: ' + name + ' leaves only external change', racingState === snapshot() && auditCount() === 0, { result, racingState, actual: snapshot() });
  }
  reset(); ids = group(); const originalRows = ids.map(row); request = input(ids); exec("UPDATE class_schedules SET user_id='changed_before_call' WHERE id=?", ids[0]);
  await reject('caller-provided original rows cannot hide changed student', request, 'schedule_changed', 409, actor, originalRows);

  reset(); ids = group(2);
  const a = await move(env, actor, input(ids, { start_time: '10:00' }));
  const b = await move(env, actor, input(ids, { start_time: '10:20' }));
  const c = await move(env, actor, input(ids, { start_time: '10:00' }));
  check('frozen clock: repeated writes all succeed', a.ok && b.ok && c.ok, { a, b, c });
  check('frozen clock: ABA does not reuse old move version', ids.every(id => a.move_versions?.[id] !== c.move_versions?.[id]), { a, c });
  await reject('frozen clock: stale undo after ABA is rejected', input(ids, { teacher_id: '1', start_time: '09:20' }, { expected: a.move_versions }));

  reset(); ids = group(); const moved = await move(env, actor, input(ids));
  await move(env, actor, input([ids[1]], { start_time: '11:00' }));
  await reject('undo after one group member changed rejects every member', input(ids, { teacher_id: '1', start_time: '09:20' }, { expected: moved.move_versions }));

  reset(); ids = group(); let committedVersions;
  afterBatch = () => { committedVersions = expected(ids); exec("UPDATE class_schedules SET start_time='12:00', updated_at=updated_at+1 WHERE id=?", ids[0]); };
  const response = await move(env, actor, input(ids));
  check('response versions belong to own commit, not a later writer', response.ok && ids.every(id => response.move_versions?.[id] === committedVersions[id]) && response.move_versions?.[ids[0]] !== version(row(ids[0])), response);

  reset(); ids = [seed(), seed({ user_id: 'student_a' })];
  await reject('pairwise destinations: same student exact slot forbidden', input(ids), 'conflict');
  reset(); ids = [seed(), seed({ user_id: 'student_b', duration_min: 30 })];
  await reject('pairwise destinations: unequal duration forbidden', input(ids), 'conflict');
  reset(); ids = group(); seed({ user_id: 'outside_group', teacher_id: '2', start_time: '10:00' });
  const exact = await move(env, actor, input(ids));
  check('existing exact-slot different-student exemption preserved', exact.ok, exact);
  // Frozen undo intentionally omits the source-group membership check: the
  // destination may already have valid same-slot members. Exact returned versions
  // still protect every moved row and the pre-existing member must stay put.
  reset(); ids = group(); const resident = seed({ user_id: 'resident', teacher_id: '2', start_time: '10:00' });
  const joined = await move(env, actor, input(ids, {}, { source_date: '2026-10-05' }));
  const unjoined = joined.ok && await move(env, actor, input(ids, { teacher_id: '1', start_time: '09:20' }, { expected: joined.move_versions }));
  check('undo after allowed existing-group join restores only moved IDs', unjoined?.ok && ids.every(id => row(id).teacher_id === '1' && row(id).start_time === '09:20'), { joined, unjoined });
  check('undo never moves pre-existing destination member', row(resident).teacher_id === '2' && row(resident).start_time === '10:00', row(resident));
  // A narrow integration check executes the actual shared UI persist function,
  // then hands its request directly to the real module and transactional adapter.
  reset(); ids = group(); const uiResident = seed({ user_id: 'ui_resident', teacher_id: '2', start_time: '10:00' });
  const weeklySrc = readFileSync(join(ROOT, 'cloudflare-deploy/public/admin/weekly-schedule.html'), 'utf8');
  const persistStart = weeklySrc.indexOf('async function persistSlotMove(');
  const persistEnd = weeklySrc.indexOf('/** 저장 실패 사유를 사람 말로.', persistStart);
  if (persistStart < 0 || persistEnd < 0) throw new Error('Cannot find production persistSlotMove');
  let offeredUndo = null; const uiRequests = [];
  const uiMove = new Function('fetch', 'wsEditing', 'minLabel', 'wsBumpEdit', 'wsOfferUndo',
    weeklySrc.slice(persistStart, persistEnd) + '\nreturn persistSlotMove;')(
    async (_url, options) => {
      const body = JSON.parse(options.body); uiRequests.push(body);
      const result = await move(env, actor, body);
      return { ok: result.status < 400, status: result.status, json: async () => result };
    },
    () => true, min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'),
    () => {}, info => { offeredUndo = info; }
  );
  const uiSlot = { id: ids[0], ids, type: 'group', moveField: 'scheduled_date', moveDate: '2026-10-05', moveVersions: expected(ids) };
  const uiJoined = await uiMove(uiSlot, '2026-10-05', 600, '2', { dateISO: '2026-10-05', startMin: 560, teacherId: '1' });
  check('UI offers frozen undo after allowed existing-group join', uiJoined.ok && offeredUndo && offeredUndo.slot !== uiSlot, uiJoined);
  const uiUndone = offeredUndo && await uiMove(offeredUndo.slot, offeredUndo.prev.dateISO, offeredUndo.prev.startMin, offeredUndo.prev.teacherId, null, { undo: true });
  check('UI immediate undo after joining existing group succeeds', uiUndone?.ok && ids.every(id => row(id).teacher_id === '1' && row(id).start_time === '09:20'), uiUndone);
  check('UI undo request preserves versions and omits group membership check', uiRequests.length === 2 && uiRequests[1].expected && !Object.hasOwn(uiRequests[1], 'source_date'), uiRequests);
  check('UI undo never moves pre-existing destination member', row(uiResident).teacher_id === '2' && row(uiResident).start_time === '10:00', row(uiResident));
  reset(); ids = group(); seed({ user_id: 'outside_group', teacher_id: '2', start_time: '09:40' });
  const adjacent = await move(env, actor, input(ids));
  check('half-open adjacent destination remains allowed', adjacent.ok, adjacent);
  reset(); ids = group(); seed({ user_id: 'outside_group', teacher_id: '2', start_time: '09:50' });
  await reject('staggered destination overlap rejected', input(ids), 'conflict');
  reset(); ids = group(); block(); await reject('existing unavailability blocks whole group', input(ids), 'teacher_unavailable');
  reset(); ids = group(); vacation(); await reject('existing vacation blocks whole group', input(ids), 'teacher_unavailable');

  reset(); ids = [seed(), seed({ user_id: 'weekly_student', schedule_kind: 'recurring', scheduled_date: null, day_of_week: 'Mon', starts_on: '2026-10-01' })];
  const mixed = await move(env, actor, input(ids, { destination_date: '2026-10-06' }, { source_date: '2026-10-05' }));
  check('mixed dated/weekly group uses each correct move field', mixed.ok && row(ids[0]).scheduled_date === '2026-10-06' && row(ids[1]).scheduled_date === null && row(ids[1]).day_of_week === 'Tue', mixed);
  reset(); ids = [seed({ source: 'c24-mirror' }), seed({ user_id: 'postponed_student', status: 'postponed' })];
  const special = await move(env, actor, input(ids));
  check('mirror stamp and postponed reactivation commit with move', special.ok && row(ids[0]).source === 'c24-mirror:manual' && row(ids[1]).status === 'active', special);

  for (const status of ['cancelled', 'ended', 'completed']) {
    reset(); ids = group(); exec('UPDATE class_schedules SET status=? WHERE id=?', status, ids[1]);
    await reject('unmovable status ' + status, input(ids), 'schedule_not_movable');
  }
  for (const [name, patch] of [['invalid time', { start_time: '99:00' }], ['invalid date', { destination_date: '2026-02-30' }], ['invalid duration', { duration_min: 20.5 }], ['invalid teacher', { teacher_id: 'x' }], ['invalid weekday', { day_of_week: 'oops' }]]) {
    reset(); ids = group(); await reject(name, input(ids, patch), 'invalid_schedule', 400);
  }
  for (const badIds of [[], [0], [-1], ['x'], Array.from({ length: 51 }, (_, i) => i + 1)]) {
    reset(); ids = group(); await reject('invalid ID set ' + JSON.stringify(badIds), { ids: badIds, patch: { start_time: '10:00' } }, 'invalid_ids', 400);
  }
  reset(); ids = group(); await reject('incomplete expected map', input(ids, {}, { expected: { [ids[0]]: version(row(ids[0])) } }), 'invalid_expected', 400);
  reset(); ids = group(); await reject('IDs-only request does not stamp or audit rows', { ids, expected: expected(ids) }, 'no_valid_fields', 400);
  reset(); ids = group(); await reject('unauthenticated actor', input(ids), 'auth_required', 401, { ok: false });
  reset(); ids = group(); await reject('teacher cannot reassign group', input(ids), 'forbidden_teacher', 403, { ...actor, isTeacher: true });
  reset(); ids = group(); exec("UPDATE admin_scope SET scope_type='branch'"); await reject('branch cannot reassign group', input(ids), 'forbidden_scope', 403);

  for (const [name, match] of [
    ['schema lookup', (sql, method) => method === 'all' && /^PRAGMA table_info/.test(sql)],
    ['source lookup', (sql, method) => method === 'all' && /^SELECT \* FROM class_schedules WHERE id IN/.test(sql)],
    ['snapshot read', (sql, method) => method === 'first' && /json_group_array/.test(sql)],
    ['availability lookup', (sql, method) => method === 'all' && /FROM teacher_unavailability/.test(sql)],
    ['teacher lookup', (sql, method) => method === 'all' && /^SELECT id, name FROM teachers/.test(sql)],
  ]) {
    for (const mode of ['throw', 'unsuccessful', 'malformed']) {
      reset(); ids = group(); readFailure = { match, mode };
      await reject('fail closed: ' + name + ' ' + mode, input(ids), 'move_failed', 503);
    }
  }
  reset(); ids = group(); sq.exec('DROP TABLE teacher_unavailability; DROP TABLE calendar_events;');
  const legacy = await move(env, actor, input(ids));
  check('absent optional legacy tables do not block valid move', legacy.ok, legacy);
  sq.exec(blockDDL); sq.exec(vacationDDL);
  reset(); ids = group(); sq.exec('DROP TABLE teacher_unavailability;'); let raceState;
  beforeBatch = () => { sq.exec(blockDDL); block(); raceState = snapshot(); };
  const schemaRace = await move(env, actor, input(ids));
  check('optional table created during move is caught by schema snapshot', schemaRace.ok === false && schemaRace.status === 409 && snapshot() === raceState && auditCount() === 0 && guardEmpty(), schemaRace);
  reset(); ids = group(); sq.exec('ALTER TABLE class_schedules DROP COLUMN starts_on');
  const legacySchema = await move(env, actor, input(ids));
  check('legacy schema without optional starts_on retains atomic movement', legacySchema.ok && ids.every(id => row(id).start_time === '10:00') && guardEmpty(), legacySchema);

  process.stdout.write('\n@@RESULTS@@' + JSON.stringify(results) + '\n');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'schedule-group-move-'));
let pass = 0, fail = 0;
try {
  writeFileSync(join(tmp, 'hooks.mjs'), `import { existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
 if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
  const u = new URL(spec + '.ts', ctx.parentURL); if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
 } return next(spec, ctx);
}`);
  writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF], {
    encoding: 'utf8', env: { ...process.env, SGM_CHILD: '1' }, timeout: 120000, maxBuffer: 16 * 1024 * 1024
  });
  const marker = child.stdout?.lastIndexOf('@@RESULTS@@') ?? -1;
  if (marker < 0 || child.status !== 0) {
    fail++; console.log('FAIL harness child crashed\n' + child.stderr + '\n' + child.stdout);
  } else {
    for (const result of JSON.parse(child.stdout.slice(marker + '@@RESULTS@@'.length).trim())) {
      if (result.pass) { pass++; console.log('PASS ' + result.name); }
      else { fail++; console.log('FAIL ' + result.name + ' — ' + result.detail); }
    }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`\nSchedule group move: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
