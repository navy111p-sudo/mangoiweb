/**
 * Ephemeral Worker/SQLite backend for schedule-consumer-approval-browser.mjs.
 * Bootstrap follows student_schedule_lifecycle_sync_harness.mjs. No Wrangler,
 * production bindings, real identities, provider calls, or source rewriting.
 * Node-only sanity run (does NOT claim browser coverage):
 *   node test-harness/manual/schedule-consumer-worker-fixture.mjs --self-check
 * ESBUILD_DIR may point to an existing, read-only dependency installation.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
export const BASE = 'http://127.0.0.1:18767'; // Routed synthetic origin; no listener.
export const STUDENT = { uid: 'consumer_fixture_student', name: 'Consumer Fixture Student' };
export const TEACHERS = {
  alpha: { id: '1', username: 'consumer_fixture_alpha', name: 'CONSUMER ALPHA', token: 'consumer_fixture_alpha_session' },
  beta: { id: '2', username: 'consumer_fixture_beta', name: 'CONSUMER BETA', token: 'consumer_fixture_beta_session' },
};
export const ADMIN_TOKEN = 'consumer_fixture_admin_session';
export const INITIAL = { date: '2026-10-04', time: '15:00', teacher: 'alpha' };
export const APPROVED = { date: '2026-10-05', time: '09:40', teacher: 'beta' };
export const MOVED = { date: '2026-10-06', time: '11:20', teacher: 'alpha' };

export async function createScheduleWorkerFixture() {
  const RealDate = globalThis.Date, originalFetch = globalThis.fetch;
  let now = RealDate.parse('2026-10-04T10:00:00+09:00');
  class FixtureDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  globalThis.Date = FixtureDate;
  const outbound = [];
  globalThis.fetch = async input => {
    const url = String(input?.url || input);
    outbound.push(url);
    throw new Error('External network forbidden in isolated schedule consumer fixture');
  };
  const sql = new DatabaseSync(':memory:');
  const norm = value => value === undefined ? null : typeof value === 'boolean' ? Number(value) : value;
  function statement(query, args = []) {
    return {
      query, args,
      bind: (...values) => statement(query, values.map(norm)),
      async first(column) { const row = sql.prepare(query).get(...args); return row ? column ? row[column] : { ...row } : null; },
      async all() { return { results: sql.prepare(query).all(...args).map(row => ({ ...row })), success: true, meta: {} }; },
      async run() {
        const result = sql.prepare(query).run(...args);
        return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
      async raw() { return sql.prepare(query).all(...args).map(row => Object.values(row)); },
    };
  }
  const DB = {
    prepare: query => statement(query),
    async exec(query) { sql.exec(query); return { count: 1 }; },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try { const results = []; for (const st of statements) results.push(await st.run()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const values = new Map(), tasks = new Set();
  const KV = {
    async get(key, type) { const value = values.get(key); return value == null ? null : type === 'json' ? JSON.parse(value) : value; },
    async put(key, value) { values.set(key, String(value)); },
    async delete(key) { values.delete(key); },
    async list() { return { keys: [...values.keys()].map(name => ({ name })), list_complete: true }; },
  };
  const env = new Proxy({ DB, ADMIN_PASSWORD: 'local-consumer-fixture-only', ROOM_JWT_SECRET: 'synthetic-consumer-fixture-secret-not-a-real-credential' }, {
    get(target, key) { if (key in target) return target[key]; return typeof key === 'string' && /^[A-Z_]+$/.test(key) && /KV|STATE|CACHE|SESS/.test(key) ? KV : undefined; },
  });
  const ctx = { waitUntil(promise) { const task = Promise.resolve(promise); tasks.add(task); task.finally(() => tasks.delete(task)).catch(() => {}); }, passThroughOnException() {} };
  const require = createRequire(resolve(ROOT, 'cloudflare-deploy/package.json'));
  const esbuild = process.env.ESBUILD_DIR ? require(resolve(process.env.ESBUILD_DIR, 'node_modules/esbuild')) : require('esbuild');
  const entry = [
    `export { default as worker } from ${JSON.stringify(resolve(SRC, 'index.ts'))};`,
    `export { checkAdminSession } from ${JSON.stringify(resolve(SRC, 'auth-admin.ts'))};`,
    `export { getScope } from ${JSON.stringify(resolve(SRC, 'scope.ts'))};`,
    `export { handleMangoApi } from ${JSON.stringify(resolve(SRC, 'api-mango.ts'))};`,
    `export { signUidToken } from ${JSON.stringify(resolve(SRC, 'auth-token.ts'))};`,
    `export { scheduleMoveVersion } from ${JSON.stringify(resolve(SRC, 'class-schedule-move.ts'))};`,
  ].join('\n');
  let bundle;
  try {
    bundle = esbuild.buildSync({ stdin: { contents: entry, resolveDir: SRC, loader: 'ts' }, bundle: true,
      write: false, format: 'esm', platform: 'node', logLevel: 'silent' }).outputFiles[0].text;
  } catch (error) { sql.close(); globalThis.Date = RealDate; globalThis.fetch = originalFetch; throw error; }
  // A temp file keeps optional-table warning stacks small; data: URLs would
  // otherwise print the entire multi-megabyte Worker bundle for each warning.
  const temp = mkdtempSync(resolve(tmpdir(), 'schedule-consumer-worker-'));
  const bundlePath = resolve(temp, 'worker.mjs');
  writeFileSync(bundlePath, bundle);
  const mod = await import(pathToFileURL(bundlePath).href);
  const request = (method, path, { token, bearer, body, headers = {} } = {}) => new Request(BASE + path, {
    method, headers: { 'content-type': 'application/json', ...headers, ...(token ? { cookie: 'mango_admin_session=' + token } : {}),
      ...(bearer ? { authorization: 'Bearer ' + bearer } : {}) }, body: body == null ? undefined : JSON.stringify(body),
  });
  // The real handlers create their own auth and schedule tables.
  await mod.checkAdminSession(request('GET', '/x', { token: 'prime' }), env);
  await mod.getScope(env, request('GET', '/x'));
  const prime = request('GET', '/api/class/sessions/today?user_id=fixture_prime');
  await mod.handleMangoApi(prime, new URL(prime.url), env, ctx);
  const source = readFileSync(resolve(SRC, 'api-admin.ts'), 'utf8');
  const start = source.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const end = source.indexOf("].join(' ')", start);
  assert(start >= 0 && end > start, 'Source teachers schema must be present');
  sql.exec([...source.slice(start, end).matchAll(/`([^`]*)`/g)].map(match => match[1]).join(' '));
  for (const [table, marker] of [['students_erp', 'user_id TEXT PRIMARY KEY, korean_name'], ['teacher_account_links', null]]) {
    const matches = [...source.matchAll(new RegExp('`(CREATE TABLE IF NOT EXISTS ' + table + '\\s*\\([\\s\\S]*?\\);?)`', 'g'))];
    const ddl = matches.find(match => !marker || match[1].includes(marker))?.[1];
    assert(ddl, 'Source schema must be present: ' + table); sql.exec(ddl);
  }
  const ins = (query, ...args) => sql.prepare(query).run(...args);
  const expiry = RealDate.parse('2030-01-01T00:00:00Z');
  ins("INSERT OR REPLACE INTO admin_scope (username,scope_type,scope_value,updated_at) VALUES ('admin','hq',NULL,?)", now);
  ins('INSERT INTO admin_sessions (token,username,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)', ADMIN_TOKEN, 'admin', now, expiry, now);
  for (const teacher of Object.values(TEACHERS)) {
    ins('INSERT INTO teachers (id,name,active,created_at,updated_at) VALUES (?,?,1,?,?)', Number(teacher.id), teacher.name, now, now);
    ins("INSERT INTO admin_account (username,password_hash,name,created_at,updated_at) VALUES (?,'synthetic-unused',?,?,?)", teacher.username, teacher.name, now, now);
    ins("INSERT INTO admin_scope (username,scope_type,scope_value,updated_at) VALUES (?,'teacher',NULL,?)", teacher.username, now);
    ins("INSERT INTO teacher_account_links (username,teacher_id,teacher_name,linked_by,linked_at) VALUES (?,?,?,'fixture',?)", teacher.username, teacher.id, teacher.name, now);
    ins('INSERT INTO admin_sessions (token,username,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)', teacher.token, teacher.username, now, expiry, now);
  }
  ins('INSERT INTO students_erp (user_id,korean_name,created_at) VALUES (?,?,?)', STUDENT.uid, STUDENT.name, now);
  const scheduleId = Number(ins(`INSERT INTO class_schedules
    (user_id,student_name,schedule_kind,class_type,scheduled_date,start_time,duration_min,teacher_id,status,source,created_at)
    VALUES (?,?,'one_off','regular',?,?,20,'1','active','isolated_consumer_fixture',?)`,
  STUDENT.uid, STUDENT.name, INITIAL.date, INITIAL.time, now).lastInsertRowid);
  const studentToken = await mod.signUidToken(STUDENT.uid, env, 60 * 86400000);
  const fetchWorker = req => mod.worker.fetch(req, env, ctx);
  const call = async (method, path, opts) => {
    const response = await fetchWorker(request(method, path, opts));
    return { status: response.status, body: await response.json() };
  };
  return {
    scheduleId, studentToken, outbound, fetchWorker, call,
    now: () => now,
    setNow(date, time) { now = RealDate.parse(`${date}T${time}:00+09:00`); assert(Number.isFinite(now)); },
    row: () => ({ ...sql.prepare('SELECT * FROM class_schedules WHERE id=?').get(scheduleId) }),
    requestRow: id => ({ ...sql.prepare('SELECT * FROM schedule_change_requests WHERE id=?').get(id) }),
    version: () => mod.scheduleMoveVersion(sql.prepare('SELECT * FROM class_schedules WHERE id=?').get(scheduleId)),
    async close() { await Promise.allSettled([...tasks]); sql.close(); rmSync(temp, { recursive: true, force: true }); globalThis.Date = RealDate; globalThis.fetch = originalFetch; },
  };
}

if (process.argv.includes('--self-check') && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const fixture = await createScheduleWorkerFixture();
  try {
    const submitted = await fixture.call('POST', '/api/class/schedule/request', { bearer: fixture.studentToken,
      body: { schedule_id: fixture.scheduleId, request_type: 'change', new_date: APPROVED.date, new_time: APPROVED.time, teacher_id: TEACHERS.beta.id } });
    assert.equal(submitted.status, 200, JSON.stringify(submitted)); assert.equal(submitted.body.ok, true);
    const before = fixture.row(), decision = { id: submitted.body.id, action: 'approve' };
    const denied = await fixture.call('POST', '/api/admin/schedule-requests/decide', { token: TEACHERS.beta.token, body: decision });
    assert.equal(denied.status, 403); assert.deepEqual(fixture.row(), before); assert.equal(fixture.requestRow(decision.id).status, 'pending');
    const approved = await fixture.call('POST', '/api/admin/schedule-requests/decide', { token: ADMIN_TOKEN, body: decision });
    assert.equal(approved.status, 200, JSON.stringify(approved)); assert.equal(approved.body.applied, 'moved');
    for (const expected of [APPROVED, MOVED]) {
      if (expected === MOVED) {
        const moved = await fixture.call('PATCH', '/api/admin/class-schedules/move', { token: ADMIN_TOKEN, body: {
          ids: [fixture.scheduleId], expected: { [fixture.scheduleId]: fixture.version() }, source_date: APPROVED.date,
          destination_date: MOVED.date, start_time: MOVED.time, teacher_id: TEACHERS.alpha.id,
        } });
        assert.equal(moved.status, 200, JSON.stringify(moved)); assert.equal(moved.body.count, 1);
      }
      fixture.setNow(expected.date, '09:30');
      const teacher = TEACHERS[expected.teacher];
      const portal = await fixture.call('GET', '/api/teacher/portal', { token: teacher.token });
      const mine = await fixture.call('GET', '/api/class/schedule/mine?user_id=' + STUDENT.uid);
      const sessions = await fixture.call('GET', '/api/class/sessions/today?user_id=' + STUDENT.uid, { bearer: fixture.studentToken });
      assert.equal(portal.status, 200, JSON.stringify(portal)); assert.equal(portal.body.classes.length, 1);
      assert.equal(mine.body.schedules.length, 1); assert.equal(mine.body.schedules[0].teacher_name, teacher.name);
      assert.equal(mine.body.schedules[0].scheduled_date, expected.date); assert.equal(mine.body.schedules[0].start_time, expected.time);
      assert.equal(String(fixture.row().teacher_id), teacher.id); assert.equal(portal.body.me.name, teacher.name);
      assert.equal(portal.body.classes[0].schedule_id, fixture.scheduleId);
      assert.equal(portal.body.classes[0].room_id, `class-${fixture.scheduleId}-${expected.date.replaceAll('-', '')}`);
      assert.equal(sessions.body.sessions[0].room_id, portal.body.classes[0].room_id);
      const old = await fixture.call('GET', '/api/teacher/portal', { token: TEACHERS[expected.teacher === 'alpha' ? 'beta' : 'alpha'].token });
      assert.equal(old.body.classes.length, 0); assert.equal(old.body.week.days.flatMap(day => day.items).length, 0);
    }
    assert.equal(fixture.outbound.length, 0, 'No attempted provider calls');
    console.log('schedule-consumer-worker-fixture: PASS request / teacher 403 / admin approval / versioned move / role projections (Node only; browser NOT RUN)');
  } finally { await fixture.close(); }
}
