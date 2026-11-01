/**
 * Stage 1: teacher reassignment availability, through the real admin handler.
 * Real TypeScript imports, real SQLite, real authentication and SQL. No live APIs.
 * D1 reads can be failed/malformed independently to prove fail-closed behavior.
 * Time-only moves are intentionally outside this stage's contract.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

if (process.env.SMAV_CHILD === '1') {
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
  let fault = null;
  const writes = [];
  const norm = v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  const injected = (sql, method, args) => {
    if (!fault || fault.method !== method || !fault.match(sql, args)) return null;
    if (fault.mode === 'throw') throw new Error('injected availability read failure');
    return fault.mode === 'unsuccessful' ? { success: false, results: [] } : { success: true };
  };
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a.map(norm)),
    async first(col) {
      const bad = injected(sql, 'first', args); if (bad) return bad;
      const row = sq.prepare(sql).get(...args); return row ? (col ? row[col] : { ...row }) : null;
    },
    async all() {
      const bad = injected(sql, 'all', args); if (bad) return bad;
      return { success: true, results: sq.prepare(sql).all(...args).map(r => ({ ...r })), meta: {} };
    },
    async run() {
      writes.push({ sql, args });
      const r = sq.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    async raw() { return sq.prepare(sql).all(...args).map(Object.values); }
  });
  const DB = { prepare: sql => stmt(sql), async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(stmts) { sq.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of stmts)out.push(await s.run());sq.exec('COMMIT');return out;}catch(e){sq.exec('ROLLBACK');throw e;} } };
  const mem = new Map();
  const KV = { async get(k, type) { const v = mem.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { mem.set(k, String(v)); }, async delete(k) { mem.delete(k); },
    async list() { return { keys: [], list_complete: true }; } };
  const env = new Proxy({ DB, ADMIN_PASSWORD: 'availability-harness-only' }, {
    get(t, p) { return p in t ? t[p] : typeof p === 'string' && /KV|STATE|CACHE|SESS/.test(p) ? KV : undefined; }
  });
  const imp = file => import(pathToFileURL(join(SRC, file)).href);
  const { handleAdminApi } = await imp('api-admin.ts');
  const { checkAdminSession } = await imp('auth-admin.ts');
  const { getScope } = await imp('scope.ts');
  const { ensureClassAuditTable } = await imp('class-audit.ts');
  const req = (method, path, body, token = 'tok_admin') => new Request('https://mangoi.ai' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { cookie: 'mango_admin_session=' + token } : {}) },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const call = async (method, path, body, token) => {
    const r = req(method, path, body, token);
    const res = await handleAdminApi(r, new URL(r.url), env, { waitUntil() {}, passThroughOnException() {} });
    return res ? { status: res.status, body: await res.json() } : { status: 0, body: { error: 'no_route' } };
  };
  await checkAdminSession(req('GET', '/prime', null, 'prime'), env);
  await getScope(env, req('GET', '/prime', null, null));
  await ensureClassAuditTable(env);
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const lessonSrc = readFileSync(join(SRC, 'api-lessons.ts'), 'utf8');
  const ddl = (src, table, needs = '') => {
    const re = new RegExp('`(CREATE TABLE IF NOT EXISTS ' + table + '\\s*\\([\\s\\S]*?\\);?)`', 'g');
    for (const m of src.matchAll(re)) if (m[1].includes(needs)) return m[1];
    throw new Error('Production DDL not found: ' + table);
  };
  sq.exec(ddl(adminSrc, 'class_schedules', 'duration_min INTEGER DEFAULT 20'));
  sq.exec('ALTER TABLE class_schedules ADD COLUMN starts_on TEXT');
  const ti = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const te = adminSrc.indexOf("].join(' ')", ti);
  sq.exec([...adminSrc.slice(ti, te).matchAll(/`([^`]*)`/g)].map(m => m[1]).join(' '));
  const blockDDL = ddl(adminSrc, 'teacher_unavailability');
  const vacationDDL = ddl(lessonSrc, 'calendar_events');
  sq.exec(blockDDL); sq.exec(vacationDDL);
  const insert = (sql, ...args) => sq.prepare(sql).run(...args);
  for (const [id, name] of [[1, 'ALPHA'], [2, 'BETA'], [3, 'GAMMA']]) {
    insert('INSERT INTO teachers (id,name,active,created_at,updated_at) VALUES (?,?,1,?,?)', id, name, NOW, NOW);
  }
  for (const [username, name, scope] of [
    ['admin', '관리자', 'hq'], ['mgr_karl', 'Karl (본사 매니저)', 'hq'],
    ['hq_t_alpha', 'ALPHA', 'teacher'], ['branch_test', 'Branch', 'branch'], ['unknown_scope', 'Staff', '']
  ]) {
    insert('INSERT OR IGNORE INTO admin_account (username,password_hash,name,created_at,updated_at) VALUES (?,?,?,?,?)', username, 'x', name, NOW, NOW);
    if (scope !== null) insert('INSERT OR REPLACE INTO admin_scope (username,scope_type,updated_at) VALUES (?,?,?)', username, scope, NOW);
    insert('INSERT INTO admin_sessions (token,username,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)', 'tok_' + username, username, NOW, NOW + 86400000, NOW);
  }
  const seed = (overrides = {}) => {
    const row = { user_id: 'student_a', student_name: 'Student A', schedule_kind: 'dated', class_type: 'regular',
      day_of_week: null, scheduled_date: '2026-10-05', start_time: '09:20', duration_min: 20,
      teacher_id: '1', status: 'active', source: 'harness', created_at: NOW, starts_on: null, ...overrides };
    const keys = Object.keys(row);
    return Number(insert(`INSERT INTO class_schedules (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(row)).lastInsertRowid);
  };
  const other = overrides => seed({ user_id: 'student_b', teacher_id: '2', start_time: '09:00', duration_min: 30, ...overrides });
  const block = (overrides = {}) => {
    const row = { teacher_id: '2', kind: 'weekly', day_of_week: 1, start_date: null, end_date: null,
      start_time: '09:00', end_time: '09:30', created_at: NOW, ...overrides };
    const keys = Object.keys(row); insert(`INSERT INTO teacher_unavailability (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(row));
  };
  const vacation = (overrides = {}) => {
    const row = { event_type: 'vacation', title: 'Vacation', teacher_name: 'BETA', date: '2026-10-05', end_date: null, created_at: NOW, ...overrides };
    const keys = Object.keys(row); insert(`INSERT INTO calendar_events (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(row));
  };
  const reset = () => { fault = null; sq.exec('DELETE FROM class_schedules; DELETE FROM teacher_unavailability; DELETE FROM calendar_events; DELETE FROM class_audit_log;'); writes.length = 0; };
  const snapshot = () => JSON.stringify(sq.prepare('SELECT * FROM class_schedules ORDER BY id').all());
  const classWrites = () => writes.filter(x => /UPDATE\s+class_schedules|INSERT\s+INTO\s+class_audit_log/i.test(x.sql));
  const patch = async (id, body = {}, token = 'tok_admin', method = 'PATCH') => call(method, '/api/admin/class-schedules/' + id, { teacher_id: '2', ...body }, token);
  const preview = (ids, token = 'tok_admin') => call('GET', '/api/admin/class-schedules/teacher-options?ids=' + ids.join(','), null, token);
  const reject = async (name, id, body = {}, error = 'conflict', status = 409, token = 'tok_admin') => {
    const before = snapshot(); writes.length = 0;
    const result = await patch(id, body, token);
    check(name + ': rejected', result.status === status && result.body.error === error && result.body.ok === false, result);
    check(name + ': schedule/audit untouched', snapshot() === before && classWrites().length === 0, classWrites());
    return result;
  };
  const allow = async (name, id, body = {}, token = 'tok_admin', method = 'PATCH') => {
    writes.length = 0;
    const result = await patch(id, body, token, method);
    const row = sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id);
    check(name + ': applied', result.status === 200 && result.body.ok === true && row.teacher_id === '2', { result, row });
    check(name + ': audited once', sq.prepare('SELECT COUNT(*) AS n FROM class_audit_log WHERE schedule_id=?').get(id).n === 1, classWrites());
    return row;
  };

  reset(); let id = seed(); other(); await reject('dated staggered overlap even force', id, { force: true });
  reset(); id = seed(); other({ teacher_id: '3', user_id: 'student_a' }); await reject('same student other teacher', id);
  reset(); id = seed(); other({ start_time: '09:20', duration_min: 20 }); await allow('exact-slot group exemption', id);
  reset(); id = seed(); other({ user_id: 'student_a', start_time: '09:20', duration_min: 20 }); await reject('exact-slot same student still blocked', id);
  reset(); id = seed(); other({ start_time: '09:20', duration_min: 30 }); await reject('same start unequal duration', id);
  reset(); id = seed(); other({ start_time: '09:00', duration_min: 20 }); await allow('half-open adjacency', id);
  for (const user of ['lms', 'type_seed', 'LMS']) {
    reset(); id = seed(); other({ user_id: user }); await allow('placeholder ignored ' + user, id);
  }
  reset(); id = seed(); other({ status: 'cancelled' }); await allow('cancelled blocker ignored', id);
  reset(); id = seed(); other({ status: null }); await reject('null-status blocker remains active', id);
  reset(); id = seed({ source: 'c24-mirror' }); const moved = await allow('mirror manual stamping', id);
  check('mirror stamp preserved atomically', moved.source === 'c24-mirror:manual', moved);
  reset(); id = seed({ status: 'postponed' }); const resumed = await allow('postponed occurrence can be re-timed', id, { start_time: '10:00' });
  check('postponed re-timed occurrence reactivated', resumed.status === 'active', resumed);
  reset(); id = seed(); other({ scheduled_date: '2026-10-06', start_time: '11:00' });
  await reject('combined destination date/time actually validated', id, { scheduled_date: '2026-10-06', start_time: '11:20' });
  reset(); id = seed(); other({ start_time: '09:45' }); await reject('combined destination duration actually validated', id, { duration_min: 40 });
  reset(); id = seed(); await allow('PUT shares reassignment guard happy path', id, {}, 'tok_mgr_karl', 'PUT');

  const recurring = { schedule_kind: 'recurring', scheduled_date: null, day_of_week: 'Mon', starts_on: '2026-10-05' };
  reset(); id = seed(); other({ ...recurring }); await reject('dated target against recurring', id);
  reset(); id = seed(); other({ ...recurring, starts_on: '2026-10-12' }); await allow('dated target before recurring starts_on', id);
  reset(); id = seed({ scheduled_date: '2026-10-12' }); other({ ...recurring, starts_on: '2026-10-12' }); await reject('dated target on recurring starts_on', id);
  reset(); id = seed({ ...recurring }); other({ scheduled_date: '2026-10-12' }); await reject('recurring target against future dated', id);
  reset(); id = seed({ ...recurring, starts_on: '2026-10-12' }); other(); await allow('recurring target ignores dated before starts_on', id);
  reset(); id = seed({ ...recurring }); other({ ...recurring, starts_on: '2026-12-07' }); await reject('recurring series eventually overlap', id);
  reset(); id = seed({ ...recurring }); other({ ...recurring, day_of_week: 'Tue' }); await allow('different recurring weekdays', id);
  reset(); id = seed(); other({ ...recurring, day_of_week: '1' }); await reject('numeric weekday compatibility', id);
  for (const day_of_week of ['monday', '월', '월요일']) {
    reset(); id = seed(); other({ ...recurring, day_of_week }); await reject('legacy weekday compatibility ' + day_of_week, id);
  }
  reset(); id = seed(); other({ schedule_kind: 'recurring', scheduled_date: '2026-10-06', day_of_week: 'Mon' }); await allow('explicit date overrides kind and weekday', id);
  reset(); id = seed({ ...recurring, day_of_week: 'Tue' }); other({ scheduled_date: '2026-10-12' }); await reject('changed recurring weekday checked', id, { day_of_week: 'Mon' });

  reset(); id = seed(); block(); await reject('weekly break', id, {}, 'teacher_unavailable');
  reset(); id = seed(); block({ end_time: '09:20' }); await allow('break adjacency', id);
  reset(); id = seed(); block({ kind: 'date_range', start_date: '2026-10-05', end_date: null }); await reject('date block missing end uses start', id, {}, 'teacher_unavailable');
  reset(); id = seed(); block({ kind: 'date_range', start_date: '2026-10-05', end_date: '2026-10-05', start_time: null, end_time: null }); await reject('all-day date block', id, {}, 'teacher_unavailable');
  reset(); id = seed(); vacation(); await reject('canonical teacher vacation ignores client alias', id, { teacher_name: 'NOT BETA', force: true }, 'teacher_unavailable');
  reset(); id = seed(); vacation({ teacher_name: 'GAMMA' }); await allow('unrelated teacher vacation ignored', id);
  reset(); id = seed({ ...recurring }); block({ kind: 'date_range', start_date: '2026-10-11', end_date: '2026-10-13' }); await reject('recurring intersects date range', id, {}, 'teacher_unavailable');
  reset(); id = seed({ ...recurring }); vacation({ date: '2026-10-11', end_date: '2026-10-13' }); await reject('recurring intersects vacation', id, {}, 'teacher_unavailable');
  reset(); id = seed({ ...recurring }); vacation({ date: '2026-10-06', end_date: '2026-10-07' }); await allow('recurring vacation on other weekdays', id);
  reset(); id = seed({ ...recurring, starts_on: '2026-10-12' }); vacation(); await allow('recurring vacation before starts_on', id);
  reset(); id = seed({ ...recurring, starts_on: null }); vacation({ date: '2026-09-28' }); await allow('old vacation does not block future recurring forever', id);

  for (const body of [{ start_time: '99:99' }, { duration_min: 0 }, { duration_min: -10 }, { duration_min: 20.5 }, { scheduled_date: '2026-02-30' }, { day_of_week: 'garbage' }]) {
    reset(); id = seed(); await reject('invalid input ' + JSON.stringify(body), id, body, 'invalid_schedule', 400);
  }
  for (const [token, status, error] of [['tok_hq_t_alpha', 403, 'forbidden_teacher'], ['tok_branch_test', 403, 'forbidden_scope'], ['tok_unknown_scope', 403, 'scope_unknown'], ['', 401, 'auth_required']]) {
    reset(); id = seed(); await reject('reassignment authorization ' + (token || 'anonymous'), id, {}, error, status, token);
    const result = await preview([id], token);
    check('preview authorization ' + (token || 'anonymous'), result.status === status && result.body.error === error, result);
  }
  for (const token of ['tok_admin', 'tok_mgr_karl']) {
    reset(); id = seed(); other(); const before = snapshot(); writes.length = 0;
    const result = await preview([id], token);
    check('preview ' + token + ' busy teacher disabled and free teacher enabled', result.status === 200 && result.body.ok === true && result.body.options?.['2']?.available === false && result.body.options?.['3']?.available === true, result);
    check('preview ' + token + ' makes no schedule/audit writes', snapshot() === before && classWrites().length === 0, classWrites());
  }
  reset(); id = seed(); const second = seed({ user_id: 'student_c' }); other({ user_id: 'student_c', teacher_id: '3' });
  const groupPreview = await preview([id, second]);
  check('preview validates every underlying group student', groupPreview.status === 200 && groupPreview.body.options?.['2']?.available === false, groupPreview);
  reset(); id = seed(); other({ start_time: '09:20', duration_min: 20 });
  const exactPreview = await preview([id]); check('preview preserves exact-slot group exemption', exactPreview.body.options?.['2']?.available === true, exactPreview);
  reset(); id = seed(); vacation(); const vacationPreview = await preview([id]);
  check('preview includes vacations absent from calendar slots', vacationPreview.body.options?.['2']?.available === false && vacationPreview.body.options?.['2']?.error === 'teacher_unavailable', vacationPreview);

  const faults = [
    ['source lookup throws', 'first', sql => /SELECT \* FROM class_schedules WHERE id/.test(sql), 'throw', 'schedule_read_failed'],
    ['overlap lookup throws', 'all', sql => /FROM class_schedules/.test(sql), 'throw', 'availability_check_failed'],
    ['overlap unsuccessful', 'all', sql => /FROM class_schedules/.test(sql), 'unsuccessful', 'availability_check_failed'],
    ['overlap malformed', 'all', sql => /FROM class_schedules/.test(sql), 'malformed', 'availability_check_failed'],
    ['block lookup throws', 'all', sql => /FROM teacher_unavailability/.test(sql), 'throw', 'availability_check_failed'],
    ['vacation lookup throws', 'all', sql => /FROM calendar_events/.test(sql), 'throw', 'availability_check_failed'],
    ['table existence lookup throws', 'first', sql => /FROM sqlite_master/.test(sql), 'throw', 'availability_check_failed'],
  ];
  for (const [name, method, match, mode, error] of faults) {
    reset(); id = seed(); fault = { method, match, mode }; await reject(name, id, {}, error, 503);
    if (error !== 'schedule_read_failed') {
      const result = await preview([id]); check('preview fails closed: ' + name, result.status === 503 && result.body.ok === false, result);
    }
  }
  reset(); id = seed(); fault = { method: 'all', match: sql => /SELECT id, name FROM teachers/.test(sql), mode: 'malformed' };
  const teachersFailed = await preview([id]); check('preview teacher list malformed fails closed', teachersFailed.status === 503 && teachersFailed.body.ok === false, teachersFailed);
  reset(); id = seed(); sq.exec("UPDATE teachers SET name='' WHERE id=2");
  await reject('blank canonical teacher name fails closed', id, {}, 'availability_unknown', 503);
  const unnamed = await preview([id]);
  check('preview blank canonical name stays disabled', unnamed.status === 200 && unnamed.body.options?.['2']?.available === false, unnamed);
  sq.exec("UPDATE teachers SET name='BETA' WHERE id=2");

  reset(); id = seed(); sq.exec('DROP TABLE teacher_unavailability; DROP TABLE calendar_events;');
  await allow('proven absent optional legacy tables are empty', id); sq.exec(blockDDL); sq.exec(vacationDDL);

  reset(); id = seed({ start_time: '23:50' }); other({ scheduled_date: '2026-10-06', start_time: '00:00', duration_min: 20 }); await reject('overnight target crosses into next-day class', id);
  reset(); id = seed({ start_time: '00:05', scheduled_date: '2026-10-06' }); other({ start_time: '23:50', duration_min: 20 }); await reject('previous-day overnight class crosses target', id);
  reset(); id = seed({ start_time: '23:50' }); block({ day_of_week: 2, start_time: '00:00', end_time: '00:30' }); await reject('overnight target crosses into next-day weekly block', id, {}, 'teacher_unavailable');
  reset(); id = seed({ start_time: '23:50' }); vacation({ date: '2026-10-06' }); await reject('overnight target crosses into next-day vacation', id, {}, 'teacher_unavailable');
  reset(); id = seed({ start_time: '23:50' }); other({ scheduled_date: '2026-10-06', start_time: '00:10', duration_min: 20 }); await allow('overnight half-open next-day adjacency', id);

  // Exercise the outer Worker router too: direct handler tests cannot detect its allowlist.
  reset(); id = seed();
  const { createRequire } = await import('node:module');
  const require = createRequire(join(ROOT, 'cloudflare-deploy/package.json'));
  const compiled = require('esbuild').buildSync({ entryPoints:[join(SRC,'index.ts')],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent' }).outputFiles[0].text;
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))).default;
  const routed = await worker.fetch(req('GET', '/api/admin/class-schedules/teacher-options?ids=' + id, null), env, { waitUntil() {} });
  const routedBody = await routed.json();
  check('Worker router reaches authenticated teacher-options', routed.status === 200 && routedBody.ok === true && routedBody.options?.['2']?.available === true, {status:routed.status,body:routedBody});
  const unauthenticated = await worker.fetch(req('GET', '/api/admin/class-schedules/teacher-options?ids=' + id, null, 'invalid'), env, { waitUntil() {} });
  check('Worker router still enforces authentication', [401,403].includes(unauthenticated.status), unauthenticated.status);
  const { scheduleMoveVersion } = await imp('class-schedule-move.ts');
  const expected = { [id]: scheduleMoveVersion(sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id)) };
  const movedByRouter = await worker.fetch(req('PATCH','/api/admin/class-schedules/move',{ids:[id],expected,destination_date:'2026-10-05',start_time:'10:00',teacher_id:'2'}),env,{waitUntil(){}});
  const movedBody = await movedByRouter.json();
  check('Worker router reaches atomic batch move and returns committed version',movedByRouter.status===200&&movedBody.ok&&typeof movedBody.move_versions?.[id]==='string',{status:movedByRouter.status,body:movedBody});
  const orgDenied = await worker.fetch(req('PATCH','/api/admin/class-schedules/move',{ids:[id],expected,start_time:'10:20'},'tok_branch_test'),env,{waitUntil(){}});
  check('Worker router preserves organization schedule denial',orgDenied.status===403,orgDenied.status);
  const teacherDenied = await worker.fetch(req('PATCH','/api/admin/class-schedules/move',{ids:[id],expected,start_time:'10:20',teacher_id:'1'},'tok_hq_t_alpha'),env,{waitUntil(){}});
  check('Worker router preserves teacher reassignment denial',teacherDenied.status===403,teacherDenied.status);



  process.stdout.write('\n@@RESULTS@@' + JSON.stringify(results) + '\n');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'smav-'));
let pass = 0, fail = 0;
try {
  writeFileSync(join(tmp, 'hooks.mjs'), `import { existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
 if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
  const u = new URL(spec + '.ts', ctx.parentURL); if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
 } return next(spec, ctx);
}`);
  writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF],
    { encoding: 'utf8', env: { ...process.env, SMAV_CHILD: '1' }, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  const marker = child.stdout?.lastIndexOf('@@RESULTS@@') ?? -1;
  if (marker < 0) { fail++; console.log('FAIL harness child crashed\n' + child.stderr + '\n' + child.stdout); }
  else {
    for (const result of JSON.parse(child.stdout.slice(marker + '@@RESULTS@@'.length).trim())) {
      if (result.pass) { pass++; console.log('PASS ' + result.name); }
      else { fail++; console.log('FAIL ' + result.name + ' — ' + result.detail); }
    }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`\nSchedule move availability: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
