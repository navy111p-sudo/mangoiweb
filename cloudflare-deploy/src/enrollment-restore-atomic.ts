/** Enrollment reopening keeps its existing saved/source selectors and partial
 * restore/skip contract. All evidence and writes belong to one guarded batch. */
import { ensureClassAuditTable } from './class-audit';
import { kstNow, parseSavedIds, pickClassesToRestore } from './enroll-cancel-cascade';
import { scheduleDays, scheduleRowsOverlap } from './schedule-conflict';

type Snapshot = { sql: string; args: any[]; value: string; rows: any[] };
const MAX_BYTES = 1_500_000;
const MAX_NEIGHBORHOODS = 50; // Bound independent read/proof work; never truncate a plan.
const quote = (field: string) => '"' + field.replace(/"/g, '""') + '"';
const failed = () => new Error('enrollment_restore_lookup_failed');
function bounded(value: string): string {
  if (new TextEncoder().encode(value).byteLength > MAX_BYTES) throw failed();
  return value;
}
function validDate(value: any): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function validSlot(row: any): boolean {
  if (!row || !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(row.start_time || ''))
    || row.duration_min != null && (!Number.isInteger(Number(row.duration_min)) || Number(row.duration_min) <= 0 || Number(row.duration_min) > 240)) return false;
  if (row.scheduled_date) return validDate(row.scheduled_date);
  const days = String(row.day_of_week ?? '').trim().split(/[,\s]+/);
  return days.length > 0 && days.every(day => scheduleDays({ day_of_week: day }).length === 1)
    && (!row.starts_on || validDate(row.starts_on));
}
async function snapshot(env: any, select: string, fields: string[], args: any[]): Promise<Snapshot> {
  // The optional legacy starts_on column is included only when it exists. Never
  // truncate fields or facts to fit D1's 32 function arguments / 100 binds.
  const sql = `SELECT json_group_array(json_array(${fields.map(quote).join(',')})) AS value FROM (${select})`;
  const result = await env.DB.prepare(sql).bind(...args).all();
  if (!result || result.success !== true || !Array.isArray(result.results) || result.results.length !== 1
    || typeof result.results[0]?.value !== 'string') throw failed();
  const value = bounded(result.results[0].value), values = JSON.parse(value);
  if (!Array.isArray(values) || values.some((r: any) => !Array.isArray(r) || r.length !== fields.length
    || r.some((v: any) => v !== null && typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v))))) throw failed();
  return { sql, args, value, rows: values.map((r: any[]) => Object.fromEntries(fields.map((f, i) => [f, r[i]]))) };
}

export async function restoreEnrollmentAtomically(env: any, id: number, previous: any, status: string,
  actor: string, now: number): Promise<{ restored_classes: number; restore_skipped: number }> {
  if (!previous || previous.status !== 'cancelled' || !Object.prototype.hasOwnProperty.call(previous, 'cancelled_class_ids')
    || typeof previous.updated_at !== 'number' || !Number.isFinite(previous.updated_at)) throw failed();
  const saved = parseSavedIds(previous.cancelled_class_ids), src = 'adm-enroll:' + id;
  bounded(JSON.stringify([previous.status, previous.student_name, previous.cancelled_class_ids, previous.updated_at]));
  const shots: Snapshot[] = [], restore: any[] = [];
  let proofBytes = 0;
  const remember = (shot: Snapshot) => {
    proofBytes += new TextEncoder().encode(shot.value).byteLength;
    if (proofBytes > MAX_BYTES) throw failed();
    shots.push(shot);
  };
  let skipped = 0;
  if (saved.length) {
    remember(await snapshot(env, "SELECT name, sql FROM sqlite_master WHERE type='table' AND name='class_schedules'", ['name','sql'], []));
    const schema = await env.DB.prepare('PRAGMA table_info(class_schedules)').all();
    if (!schema || schema.success !== true || !Array.isArray(schema.results) || !schema.results.length
      || schema.results.length > 32 || !schema.results.every((r: any, i: number) => r && r.cid === i && typeof r.name === 'string' && !!r.name
        && typeof r.type === 'string' && [0, 1].includes(r.notnull) && Number.isInteger(r.pk)
        && Object.prototype.hasOwnProperty.call(r, 'dflt_value'))) throw failed();
    const fields: string[] = schema.results.map((r: any) => r.name);
    if (!['id','user_id','teacher_id','scheduled_date','day_of_week','start_time','duration_min','status','source','updated_at'].every(f => fields.includes(f))) throw failed();
    const source = await snapshot(env, 'SELECT * FROM class_schedules WHERE source = ? ORDER BY id', fields, [src]);
    remember(source);
    const pick = pickClassesToRestore(source.rows, saved, now);
    skipped = pick.skipped;
    const today = kstNow(now).date;
    const neighborhoods = new Map<string, Snapshot>();
    for (const sid of pick.restore) {
      const row = source.rows.find(r => Number(r.id) === sid);
      if (!validSlot(row)) throw failed();
      // Preserve the upstream student/teacher and placeholder selectors. Unknown
      // status is conservatively occupied, matching the single-row restore path.
      // All selected targets are cancelled, hence excluded from every occupied
      // snapshot. Targets sharing a student/teacher can safely reuse that proof.
      const key = JSON.stringify([row.user_id, String(row.teacher_id || '')]);
      let peers = neighborhoods.get(key);
      if (!peers) {
        if (neighborhoods.size >= MAX_NEIGHBORHOODS) throw failed();
        peers = await snapshot(env, `SELECT * FROM class_schedules WHERE id <> ? AND (status IS NULL OR status != 'cancelled')
          AND (user_id = ? OR (? <> '' AND teacher_id = ? AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed'))) ORDER BY id`,
          fields, [sid, row.user_id, String(row.teacher_id || ''), String(row.teacher_id || '')]);
        remember(peers);
        neighborhoods.set(key, peers);
      }
      if (peers.rows.some(peer => !validSlot(peer))) throw failed();
      // Earlier accepted targets will become occupants in this same batch.
      // Same-slot teacher groups remain blocked until a policy is supplied.
      const planned = restore.filter(peer => peer.user_id === row.user_id || String(row.teacher_id || '') !== ''
        && String(peer.teacher_id || '') === String(row.teacher_id || '') && !['lms','type_seed'].includes(String(peer.user_id || '').toLowerCase()));
      if ([...peers.rows, ...planned].some(peer => scheduleRowsOverlap(row, peer, today))) skipped++;
      else restore.push(row);
    }
  }
  const guard = await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_move_guard (
    token TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT schedule_move_snapshot CHECK(valid=1))`).run();
  if (!guard || guard.success !== true) throw new Error('enrollment_restore_guard_failed');
  if (restore.length) await ensureClassAuditTable(env);
  const token = crypto.randomUUID();
  // JSON's invalid-input branch raises an SQL error even when a trigger ignored
  // a write. All counts are asserted before commit, including guard cleanup.
  const changed = (count: number) => env.DB.prepare(`SELECT CASE WHEN changes() = ? THEN 1 ELSE json('enrollment_restore_write_failed') END AS valid`).bind(count);
  const stmts = [env.DB.prepare(`INSERT INTO schedule_move_guard(token,valid) SELECT ?, CASE WHEN
    EXISTS (SELECT 1 FROM enrollments WHERE id=? AND status IS ? AND student_name IS ? AND cancelled_class_ids IS ? AND updated_at IS ?)
    THEN 1 ELSE 0 END`).bind(token, id, previous.status, previous.student_name ?? null, previous.cancelled_class_ids ?? null, previous.updated_at), changed(1)];
  for (const shot of shots) stmts.push(env.DB.prepare(`SELECT CASE WHEN (${shot.sql}) IS ? THEN 1 ELSE json_extract('{}','schedule_move_snapshot') END AS valid`)
    .bind(...shot.args, shot.value));
  if (restore.length) {
    stmts.push(env.DB.prepare(`UPDATE class_schedules SET status='active', updated_at=? WHERE source = ? AND status='cancelled'
      AND id IN (SELECT value FROM json_each(?))`).bind(now, src, JSON.stringify(restore.map(r => r.id))), changed(restore.length));
  }
  stmts.push(env.DB.prepare(saved.length
    ? `UPDATE enrollments SET status=?, cancelled_class_ids=NULL, updated_at=? WHERE id=? AND status='cancelled'`
    : `UPDATE enrollments SET status=?, updated_at=? WHERE id=? AND status='cancelled'`).bind(status, now, id), changed(1));
  if (restore.length) stmts.push(env.DB.prepare(`INSERT INTO class_audit_log (action,student_name,actor,actor_role,source,reason,detail,created_at)
    VALUES ('restore',?,?,'admin','enrollment',?,?,?)`).bind(previous.student_name || null, actor,
      '수강신청 취소 되돌리기 → 수업 되살림', JSON.stringify({ enrollment_id: id, restored: restore.length, skipped }), now), changed(1));
  stmts.push(env.DB.prepare('DELETE FROM schedule_move_guard WHERE token=?').bind(token), changed(1));
  const result = await env.DB.batch(stmts);
  if (!Array.isArray(result) || result.length !== stmts.length || result.some((r: any) => !r || typeof r !== 'object' || Array.isArray(r) || r.success !== true))
    throw new Error('enrollment_restore_batch_unconfirmed');
  return { restored_classes: restore.length, restore_skipped: skipped };
}
