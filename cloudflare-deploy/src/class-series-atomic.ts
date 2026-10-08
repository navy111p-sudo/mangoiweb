/** Route-local integrity for changes to this and following sessions.
 * Shared conflict/group policies stay in schedule-conflict.ts. Initial snapshots
 * and exact authoritative read proofs are checked with all writes in D1.batch. */
import { ensureClassAuditTable } from './class-audit';
import type { SeriesPlan } from './class-series-move';

type Snapshot = { sql: string; args: any[]; value: string };
export type SeriesMoveSnapshot = { shots: Snapshot[]; reads: Map<string, Snapshot>; pricingHasCap: boolean; pricingTablePresent: boolean };
const MAX_SNAPSHOT_BYTES = 1_500_000; // Headroom below D1's 2 MB value/row limit; never truncate a proof.
const badLookup = () => new Error('series_availability_unknown');
const isRow = (r: any) => r !== null && typeof r === 'object' && !Array.isArray(r) && r.success !== false;
function bounded(value: string): string {
  if (new TextEncoder().encode(value).byteLength > MAX_SNAPSHOT_BYTES) throw badLookup();
  return value;
}
async function rows(stmt: any): Promise<any[]> {
  const r = await stmt.all();
  if (!r || r.success === false || !Array.isArray(r.results) || !r.results.every(isRow)) throw badLookup();
  return r.results;
}
async function tableColumns(env: any, table: 'class_schedules' | 'teacher_pricing'): Promise<any[]> {
  const result = await rows(env.DB.prepare(`PRAGMA table_info(${table})`));
  // Absence is meaningful only for a well-formed metadata response. In particular,
  // a malformed {name:'teacher_id'} row must not disable a real daily cap.
  if (!result.length || !result.every((r, i) => r.cid === i && typeof r.name === 'string' && !!r.name
    && typeof r.type === 'string' && [0,1].includes(r.notnull)
    && Object.prototype.hasOwnProperty.call(r, 'dflt_value')
    && (r.dflt_value === null || typeof r.dflt_value === 'string')
    && Number.isInteger(r.pk) && r.pk >= 0)) throw badLookup();
  return result;
}
async function snapshot(env: any, select: string, fields: string[], args: any[] = []): Promise<Snapshot> {
  const sql = `SELECT json_group_array(json_array(${fields.join(',')})) AS value FROM (${select})`;
  const r = await env.DB.prepare(sql).bind(...args).first();
  if (!isRow(r) || typeof r.value !== 'string') throw badLookup();
  return { sql, args, value: bounded(r.value) };
}

export async function captureSeriesMoveSnapshot(env: any, scheduleId: number, teacherId: any): Promise<SeriesMoveSnapshot> {
  // No preliminary anchor read: capture its full student/teacher neighborhood
  // before the route reads the authoritative anchor, members or conflicts.
  const schema = await snapshot(env, `SELECT name, sql FROM sqlite_master WHERE type='table'
    AND name IN ('class_schedules','teachers','teacher_pricing') ORDER BY name`, ['name','sql']);
  const tableNames = new Set(JSON.parse(schema.value).map((r: any[]) => r[0]));
  if (!tableNames.has('class_schedules') || !tableNames.has('teachers')) throw badLookup();
  const columns = await tableColumns(env, 'class_schedules');
  const fields = ['id','user_id','student_name','scheduled_date','day_of_week','start_time','duration_min','teacher_id','status','source','updated_at'];
  if (!fields.every(f => columns.some(c => c.name === f))) throw badLookup();
  if (columns.some(c => c.name === 'starts_on')) fields.push('starts_on');
  const shots = [schema, await snapshot(env, `SELECT * FROM class_schedules
    WHERE id = ? OR user_id = (SELECT user_id FROM class_schedules WHERE id = ?)
      OR CAST(teacher_id AS TEXT) = CAST((SELECT teacher_id FROM class_schedules WHERE id = ?) AS TEXT)
      OR CAST(teacher_id AS TEXT) = ? ORDER BY id`, fields,
    [scheduleId, scheduleId, scheduleId, String(teacherId ?? '').trim()]),
    await snapshot(env, `SELECT id, name FROM teachers ORDER BY id`, ['id','name'])];
  let pricingHasCap = false;
  if (tableNames.has('teacher_pricing')) {
    const pricingColumns = await tableColumns(env, 'teacher_pricing');
    if (!pricingColumns.some(c => c.name === 'teacher_id')) throw badLookup();
    pricingHasCap = pricingColumns.some(c => c.name === 'long_class_daily_cap');
    shots.push(await snapshot(env, `SELECT * FROM teacher_pricing ORDER BY teacher_id`,
      ['teacher_id', pricingHasCap ? 'long_class_daily_cap' : 'NULL']));
  }
  return { shots, reads: new Map(), pricingHasCap, pricingTablePresent: tableNames.has('teacher_pricing') };
}

/** Bind what was actually read to the commit. An initial A snapshot cannot alone
 * detect A -> B during validation -> A before commit, including cap edits. */
function recordRead(state: SeriesMoveSnapshot, sql: string, args: any[], keys: string[], result: any[]) {
  const valid = (r: any) => isRow(r) && keys.every(k => Object.prototype.hasOwnProperty.call(r, k)
    && (r[k] === null || typeof r[k] === 'string' || typeof r[k] === 'number' && Number.isFinite(r[k])));
  if (!keys.length || !keys.every(k => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) || !result.every(valid)) throw badLookup();
  // Sort outside the original query: its WHERE/ORDER/LIMIT semantics stay intact.
  const ordered = keys.includes('id') ? `SELECT * FROM (${sql}) ORDER BY id` : sql;
  const sorted = keys.includes('id') ? [...result].sort((a, b) => Number(a.id) - Number(b.id)) : result;
  const value = bounded(JSON.stringify(sorted.map(r => keys.map(k => r[k]))));
  const proof = { sql: `SELECT json_group_array(json_array(${keys.map(k => `"${k}"`).join(',')})) AS value FROM (${ordered})`, args, value };
  // Deduplicate identical cap reads, but never overwrite a differing result.
  state.reads.set(JSON.stringify([proof.sql, args, value]), proof);
}
export async function readSeriesMoveFirst(env: any, state: SeriesMoveSnapshot, sql: string, args: any[], keys: string[]): Promise<any> {
  const row = await env.DB.prepare(sql).bind(...args).first();
  if (row !== null && !isRow(row)) throw badLookup();
  recordRead(state, sql, args, keys, row === null ? [] : [row]);
  return row;
}
export async function readSeriesMoveRows(env: any, state: SeriesMoveSnapshot, sql: string, args: any[], keys: string[]): Promise<any[]> {
  const result = await rows(env.DB.prepare(sql).bind(...args));
  recordRead(state, sql, args, keys, result);
  return result;
}

/** The shared conflict helper catches read errors for older callers. Observe only
 * this route so an outage cannot become a successful preview. Optional cap schema
 * absence retains the default only after successful metadata confirmation. */
export function observeSeriesConflictReads(env: any, state: SeriesMoveSnapshot) {
  let failed = false;
  const mark = (e?: any): never => { failed = true; throw e || badLookup(); };
  const readError = (sql: string, error: any): never => {
    // Still attempt the real query when metadata reports optional absence. A
    // full-shaped but incomplete metadata list must not replace an existing cap
    // with the unlimited default. Only the matching missing-schema error is safe.
    const optional = !state.pricingHasCap && /^\s*SELECT long_class_daily_cap AS cap FROM teacher_pricing\b/.test(sql);
    const absent = state.pricingTablePresent
      ? /\bno such column:\s*long_class_daily_cap\b/i : /\bno such table:\s*teacher_pricing\b/i;
    if (optional && absent.test(String(error?.message || error))) throw error;
    return mark(error);
  };
  const wrap = (stmt: any, sql: string, args: any[], keys: string[]): any => ({
    bind: (...values: any[]) => { try { return wrap(stmt.bind(...values), sql, values, keys); } catch (e) { return readError(sql, e); } },
    all: async () => {
      try {
        const r = await stmt.all();
        if (!r || r.success === false || !Array.isArray(r.results)
          || !r.results.every((row: any) => isRow(row) && keys.every(k => Object.prototype.hasOwnProperty.call(row, k)))) return mark();
        recordRead(state, sql, args, keys, r.results);
        return r;
      } catch (e) { return readError(sql, e); }
    },
    first: async () => {
      try {
        const r = await stmt.first();
        if (r !== null && (!isRow(r) || !keys.every(k => Object.prototype.hasOwnProperty.call(r, k)))) return mark();
        recordRead(state, sql, args, keys, r === null ? [] : [r]);
        return r;
      } catch (e) { return readError(sql, e); }
    },
  });
  const db = new Proxy(env.DB, { get(target, prop) {
    if (prop !== 'prepare') { const value = target[prop]; return typeof value === 'function' ? value.bind(target) : value; }
    return (sql: string) => {
      const select = /^\s*SELECT\s+([\s\S]+?)\s+FROM\b/i.exec(sql);
      const keys = select ? select[1].split(',').map(s => s.trim().split(/\s+AS\s+/i).pop()!.trim()) : [];
      try { return wrap(target.prepare(sql), sql, [], keys); } catch (e) { return readError(sql, e); }
    };
  } });
  return { env: { ...env, DB: db }, assertHealthy: () => { if (failed) throw badLookup(); } };
}

export async function applySeriesMoveAtomically(env: any, state: SeriesMoveSnapshot, row: any, plan: SeriesPlan,
  actor: any, input: { swap: boolean; teacherId: string; teacherName: string | null; reason: any }): Promise<void> {
  // Reuse exactly the existing class-schedule-move.ts guard definition. D1 CREATE
  // must be one prepared statement, not a multiline exec().
  const guardTable = await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_move_guard (
      token TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT schedule_move_snapshot CHECK(valid=1))`).run();
  if (!guardTable || guardTable.success === false) throw new Error('series_move_guard_failed');
  await ensureClassAuditTable(env);
  const token = crypto.randomUUID(), now = Date.now();
  const guardSql = state.shots.map(s => `(${s.sql}) = ?`).join(' AND ');
  const args = state.shots.flatMap(s => [...s.args, s.value]);
  // SELECT assertions cannot be skipped by table RAISE(IGNORE) triggers. Errors
  // occur inside the transaction and roll back guards, writes and audits together.
  const changed = () => env.DB.prepare(`SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('series_move_write_failed') END AS valid`);
  const stmts = [env.DB.prepare(`INSERT INTO schedule_move_guard(token,valid) SELECT ?, CASE WHEN ${guardSql} THEN 1 ELSE 0 END`).bind(token, ...args), changed()];
  for (const read of state.reads.values()) {
    // SQLite includes this invalid-path marker in the error, yielding route409.
    stmts.push(env.DB.prepare(`SELECT CASE WHEN (${read.sql}) = ? THEN 1 ELSE json_extract('{}','schedule_move_snapshot') END AS valid`)
      .bind(...read.args, read.value));
  }
  // Vacate later unique teacher/date/time slots before moving earlier members
  // forward. Response order and canonical plan membership remain unchanged.
  const writeItems = plan.delta_days > 0 ? [...plan.items].reverse() : plan.items;
  for (const it of writeItems) {
    stmts.push(env.DB.prepare(input.swap
      ? `UPDATE class_schedules SET scheduled_date = ?, start_time = ?, teacher_id = ?, updated_at = ?
          WHERE id = ? AND status = 'active' AND EXISTS (SELECT 1 FROM schedule_move_guard WHERE token = ?)`
      : `UPDATE class_schedules SET scheduled_date = ?, start_time = ?, updated_at = ?
          WHERE id = ? AND status = 'active' AND EXISTS (SELECT 1 FROM schedule_move_guard WHERE token = ?)`)
      .bind(...(input.swap ? [it.to_date,it.to_time,input.teacherId,now,it.id,token] : [it.to_date,it.to_time,now,it.id,token])), changed());
    stmts.push(env.DB.prepare(`INSERT INTO class_audit_log
      (action,schedule_id,teacher_name,student_name,lesson_date,lesson_time,actor,actor_role,source,reason,detail,created_at)
      VALUES ('reschedule',?,?,?,?,?,?,'admin','series-move',?,?,?)`)
      .bind(it.id,row.teacher_name || null,row.student_name || row.user_id || null,it.from_date,it.from_time,
        String(actor.name || actor.username || '관리자'),String(input.reason || '').trim().slice(0,200) || null,
        `→ ${it.to_date} ${it.to_time}` + (input.swap ? ` · 강사 ${row.teacher_name || row.teacher_id} → ${input.teacherName || input.teacherId}` : '')
          + ` (변경·앞으로 계속 ${plan.items.length}회)`,now), changed());
  }
  stmts.push(env.DB.prepare(`DELETE FROM schedule_move_guard WHERE token = ?`).bind(token), changed());
  const result = await env.DB.batch(stmts);
  if (!Array.isArray(result) || result.length !== stmts.length || result.some((r: any) => !r || r.success === false))
    throw new Error('series_move_batch_failed');
}
