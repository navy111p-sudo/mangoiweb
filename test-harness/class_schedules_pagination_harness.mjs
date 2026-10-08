// Actual GET handler and SQLite; no network, production data, or auth probes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { ensureStartsOnColumn, startsOnSel } from '../cloudflare-deploy/src/class-start-date.ts';
const source = readFileSync(process.env.PAGINATION_SOURCE || new URL('../cloudflare-deploy/src/api-admin.ts', import.meta.url), 'utf8');
const marker = "if (method === 'GET' && path === '/api/admin/class-schedules') {";
const start = source.indexOf(marker), end = source.indexOf('// 🥭 Phase RM', start);
assert(start > 0 && end > start);
const body = source.slice(start + marker.length, end).trim().replace(/\}\s*$/, '');
const handler = new Function('json', 'ensureStartsOnColumn', 'startsOnSel',
  stripTypeScriptTypes('async function handle(request,env){' + body + '\n}') + ';return handle;')(
  (data, status = 200) => Response.json(data, { status }), ensureStartsOnColumn, startsOnSel);
let passed = 0, failed = 0;
const check = (name, ok, detail) => { if (ok) { passed++; console.log('PASS ' + name); } else { failed++; console.log('FAIL ' + name + ': ' + JSON.stringify(detail)); } };
function fixture(count) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules(id INTEGER PRIMARY KEY,user_id TEXT,student_name TEXT,schedule_kind TEXT,class_type TEXT,day_of_week TEXT,
    scheduled_date TEXT,start_time TEXT,duration_min INTEGER,teacher_id TEXT,status TEXT,source TEXT,created_by TEXT,created_at INTEGER,updated_at INTEGER,notes TEXT,starts_on TEXT);
    CREATE TABLE teachers(id INTEGER PRIMARY KEY,name TEXT,status TEXT,user_id TEXT);
    INSERT INTO teachers VALUES(1,'Pagination Teacher','active','teacher_only');
    CREATE TABLE students_erp(user_id TEXT,login_id TEXT,korean_name TEXT,username TEXT);`);
  const insert = db.prepare(`INSERT INTO class_schedules(id,user_id,student_name,schedule_kind,class_type,scheduled_date,start_time,duration_min,teacher_id,status,source,created_at)
    VALUES(?,'page_student','Fixture Student','one_off','regular','2026-10-13','14:20',20,'1','active','adm-enroll:fixture',1)`);
  for (let id = count; id > 0; id--) insert.run(id);
  db.prepare(`INSERT INTO class_schedules(id,user_id,status,created_at) VALUES(?,'page_student','cancelled',1)`).run(count + 100);
  db.prepare(`INSERT INTO class_schedules(id,user_id,status,created_at) VALUES(?,'other_student','active',1)`).run(count + 101);
  const fault = { join: false, all: false, malformed: false };
  const stmt = (sql, args = []) => ({ bind: (...values) => stmt(sql, values),
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { if (/SELECT cs\.id/.test(sql)) {
      if (fault.all || fault.join && /LEFT JOIN teachers/.test(sql)) throw new Error('synthetic unavailable lookup');
      if (fault.malformed) return { success: false, results: [] };
    } return { success: true, results: db.prepare(sql).all(...args) }; },
    async run() { return { success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; }
  });
  const env = { DB: { prepare: stmt, async exec(sql) { db.exec(sql); } } };
  const get = async query => { const r = await handler(new Request('http://127.0.0.1/api/admin/class-schedules?user_id=page_student&' + query), env); return { status: r.status, ...await r.json() }; };
  return { db, fault, get };
}
for (const count of [0, 99, 100, 101, 500, 501]) {
  const f = fixture(count), limit = count >= 500 ? 500 : 100, p = await f.get('limit=' + limit + '&offset=0');
  check(count + ' rows: returns bounded first page', p.status === 200 && p.ok && p.items.length === Math.min(count, limit));
  check(count + ' rows: exact completeness independent of threshold equality', p.has_more === (count > limit) && p.complete === (count <= limit));
  check(count + ' rows: atomic snapshot token is explicit', /^[a-f0-9]{64}$/.test(p.snapshot || ''));
  check(count + ' rows: next offset is explicit or null', p.next_offset === (count > limit ? limit : null));
  check(count + ' rows: cancelled and foreign rows stay excluded', p.items.every(r => r.user_id === 'page_student' && r.status !== 'cancelled'));
  if (p.has_more === true) {
    const next = await f.get('limit=' + limit + '&offset=' + p.next_offset + '&expected_snapshot=' + p.snapshot);
    const ids = [...p.items, ...next.items].map(r => r.id);
    check(count + ' rows: next page covers each ID once with stable tie ordering', ids.length === count && new Set(ids).size === count && ids.every((id, i) => id === i + 1));
    check(count + ' rows: final page is explicitly complete', next.has_more === false && next.complete === true && next.next_offset === null);
  }
  f.db.close();
}
{
  const f = fixture(101); f.fault.join = true; const p = await f.get('limit=100&offset=0');
  check('legacy no-teacher-JOIN fallback retains pagination', p.ok && p.items.length === 100 && p.has_more === true && p.next_offset === 100);
  f.fault.all = true; const failedPage = await f.get('limit=100&offset=100&expected_snapshot=' + p.snapshot);
  check('read failure is never a complete empty page', failedPage.status === 503 && !failedPage.ok && failedPage.complete === false && failedPage.has_more === null);
  f.fault.all = false; f.fault.join = false; f.fault.malformed = true; const malformed = await f.get('limit=100');
  check('reported failed result is never a complete empty page', malformed.status === 503 && !malformed.ok && malformed.complete === false);
  f.fault.malformed = false; const fresh = await f.get('limit=100&offset=0');
  const retry = await f.get('limit=100&offset=100&expected_snapshot=' + fresh.snapshot);
  check('read recovery returns the last retained row', retry.ok && retry.items.length === 1 && retry.items[0].id === 101 && retry.complete === true);
  f.db.close();
}
for (const query of ['limit=-1', 'limit=NaN', 'limit=1.5', 'offset=-1', 'offset=NaN', 'offset=9007199254740992', 'offset=1', 'offset=0&expected_snapshot=invalid']) {
  const f = fixture(4), p = await f.get(query);
  check('invalid pagination cannot become unbounded: ' + query, p.status === 400 && !p.ok);
  f.db.close();
}
for (const mutation of ['cancel', 'insert', 'source', 'teacher']) {
  const f = fixture(501), first = await f.get('limit=500&offset=0');
  if (mutation === 'cancel') f.db.exec("UPDATE class_schedules SET status='cancelled' WHERE id=1");
  if (mutation === 'insert') f.db.exec("INSERT INTO class_schedules(id,user_id,schedule_kind,status,scheduled_date,start_time) VALUES(0,'page_student','one_off','active','2026-10-13','14:20')");
  if (mutation === 'source') f.db.exec("UPDATE class_schedules SET source='adm-enroll:different' WHERE id=501");
  if (mutation === 'teacher') f.db.exec("UPDATE teachers SET name='Changed Name' WHERE id=1");
  const next = await f.get('limit=500&offset=500&expected_snapshot=' + first.snapshot);
  check(mutation + ' between pages never creates false completeness', next.status === 409 && next.error === 'schedule_changed' && next.complete === false && next.has_more === null && next.items.length === 0);
  const restarted = await f.get('limit=500&offset=0');
  check(mutation + ' retry starts from new revision', restarted.ok && restarted.snapshot !== first.snapshot);
  if (mutation === 'cancel') check('omitted final enrollment still exists after cancellation', !!f.db.prepare("SELECT id FROM class_schedules WHERE id=501 AND status='active'").get());
  f.db.close();
}
{
  const f = fixture(501), p = await f.get('limit=500&offset=0');
  f.db.exec("UPDATE class_schedules SET status='cancelled' WHERE id=1; UPDATE class_schedules SET status='active' WHERE id=1");
  const same = await f.get('limit=500&offset=500&expected_snapshot=' + p.snapshot);
  check('restored identical dataset safely retains final ID', same.status === 200 && same.complete === true && same.items.length === 1 && same.items[0].id === 501);
  f.db.close();
}
{
  const f = fixture(10001), p = await f.get('limit=500&offset=0');
  check('oversize snapshot fails closed instead of truncating', p.status === 503 && p.complete === false && p.error === 'schedule_lookup_failed');
  f.db.close();
}
{
  const f = fixture(1); f.db.prepare('UPDATE class_schedules SET notes=? WHERE id=1').run('x'.repeat(1500001));
  const p = await f.get('limit=500&offset=0');
  check('byte bound fails closed for oversized notes', p.status === 503 && p.complete === false);
  f.db.close();
}
{
  const f = fixture(101), p = await f.get('limit=100');
  check('legacy non-paged caller retains bounded response shape', p.status === 200 && p.items.length === 100 && p.has_more === true && p.snapshot === undefined);
  f.db.close();
}
console.log(`class_schedules_pagination: PASS ${passed} / FAIL ${failed}`);
if (failed) process.exitCode = 1;
