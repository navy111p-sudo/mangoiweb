import { C24_SOURCE, C24_MANUAL_SOURCE, c24NoteIds, trustworthyC24Identity } from './c24-identity';
/** Atomic schedule movement. D1.batch rolls back every statement on any failure.
 * A CHECK guard compares pre-validation snapshots inside the same transaction as
 * the writes, preventing a concurrent booking, leave edit or stale undo from
 * slipping between the authoritative read and UPDATE. No room identity changes. */
import { findScheduleMoveConflicts, loadScheduleMoveFacts, scheduleDays, toMinutes } from './schedule-conflict';
import { teacherMoveDenyReason, moveFieldConflict } from './class-teacher-move';
import { ensureClassAuditTable } from './class-audit';
import { isPostponedOccurrence } from './class-postponed';

export function scheduleMoveVersion(row: any): string {
  return JSON.stringify([String(row.teacher_id ?? ''), row.scheduled_date ?? null, row.day_of_week ?? null,
    row.start_time ?? null, row.duration_min ?? null, row.status ?? null, row.source ?? null, row.updated_at ?? null,
    row.user_id ?? null, row.schedule_kind ?? null, row.starts_on ?? null]);
}
const fail = (status: number, error: string, message: string) => ({ ok: false as const, status, error, message });
const dateValid = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && Number.isFinite(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const same = (a: any, b: any) => String(a ?? '') === String(b ?? '');
// Calendar grouping uses exact minutes, not the spelling of accepted H:MM / HH:MM.
const groupMinute = (value: any): number | null => /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(value)) ? toMinutes(value) : null;
const occurrenceOn = (row: any, date: string) => row.scheduled_date ? row.scheduled_date === date
  : (!row.starts_on || row.starts_on <= date) && scheduleDays(row).includes(new Date(date + 'T00:00:00Z').getUTCDay());

type Snapshot = { sql: string; args: any[]; value: string };
async function snapshot(env: any, select: string, fields: string[], args: any[] = []): Promise<Snapshot> {
  const sql = `SELECT json_group_array(json_array(${fields.join(',')})) AS value FROM (${select})`;
  const row = await env.DB.prepare(sql).bind(...args).first();
  if (!row || typeof row.value !== 'string') throw new Error('move_snapshot_failed');
  return { sql, args, value: row.value };
}

export async function moveSchedulesAtomically(env: any, actor: any, input: any, originalRows?: any[]) {
  if (!actor?.ok) return fail(401, 'auth_required', '로그인이 필요합니다.');
  const raw = input.ids;
  if (!Array.isArray(raw) || !raw.length || raw.length > 50 || raw.some((id: any) => !/^\d+$/.test(String(id)) || Number(id) <= 0))
    return fail(400, 'invalid_ids', '옮길 수업을 다시 선택해 주세요.');
  const ids = [...new Set(raw.map(String))] as string[];
  const p = input.patch || input;
  if (!['destination_date','scheduled_date','day_of_week','start_time','duration_min','teacher_id'].some(k => p[k] != null)) return fail(400,'no_valid_fields','변경할 날짜·시간·강사를 선택해 주세요.');
  if (p.destination_date != null && !dateValid(p.destination_date) || p.scheduled_date != null && !dateValid(p.scheduled_date)
    || p.start_time != null && !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(p.start_time))
    || p.duration_min != null && (!Number.isInteger(Number(p.duration_min)) || Number(p.duration_min) <= 0 || Number(p.duration_min) > 240)
    || p.teacher_id != null && !/^\d+$/.test(String(p.teacher_id))
    || p.day_of_week != null && scheduleDays({ day_of_week: p.day_of_week }).length !== 1)
    return fail(400, 'invalid_schedule', '수업 날짜·시간·길이를 확인해 주세요.');
  if (input.source_date != null && !dateValid(input.source_date)) return fail(400, 'invalid_source_date', '원래 수업 날짜를 확인해 주세요.');
  if (input.expected != null && (typeof input.expected !== 'object' || ids.some(id => typeof input.expected[id] !== 'string')))
    return fail(400, 'invalid_expected', '수업 정보를 새로고침한 뒤 다시 시도해 주세요.');
  try {
    // This table is empty outside a batch. Failed guards/updates roll back together.
    // ⛔ D1 의 exec() 는 «줄마다» 따로 실행해 여러 줄 CREATE 가 실패한다(2026-10-04 실사고:
    //    이 표가 운영 DB 에 한 번도 안 생겨 모든 저장이 503). 한 문장은 prepare().run() 으로.
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_move_guard (
      token TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT schedule_move_snapshot CHECK(valid=1))`).run();
    await ensureClassAuditTable(env);
    const schema = await snapshot(env, `SELECT name, sql FROM sqlite_master WHERE type='table'
      AND name IN ('class_schedules','teacher_unavailability','calendar_events','teachers','admin_scope') ORDER BY name`, ['name','sql']);
    const columns = await env.DB.prepare(`PRAGMA table_info(class_schedules)`).all();
    if (!Array.isArray(columns?.results) || columns.success === false || !['id','user_id','teacher_id','start_time','updated_at'].every(name => columns.results.some((c: any) => c.name === name))) throw new Error('move_schema_failed');
    const hasStarts = columns.results.some((c: any) => c.name === 'starts_on');
    let rows = originalRows || [];
    if (!rows.length) {
      const rs = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id`).bind(JSON.stringify(ids)).all();
      if (!Array.isArray(rs?.results) || rs.success === false) throw new Error('schedule_lookup_failed');
      rows = rs.results;
    }
    if (rows.length !== ids.length) return fail(404, 'schedule_not_found', '수업을 찾을 수 없습니다. 새로고침해 주세요.');
    const teacherIds = [...new Set(rows.map(r => String(r.teacher_id || '')).concat(p.teacher_id != null ? [String(p.teacher_id)] : []))];
    const userIds = [...new Set(rows.map(r => String(r.user_id || '')))];
    const csSelect = `SELECT * FROM class_schedules WHERE CAST(teacher_id AS TEXT) IN (SELECT value FROM json_each(?))
      OR user_id IN (SELECT value FROM json_each(?)) OR id IN (SELECT value FROM json_each(?)) ORDER BY id`;
    const csArgs = [JSON.stringify(teacherIds), JSON.stringify(userIds), JSON.stringify(ids)];
    const shots: Snapshot[] = [schema, await snapshot(env, csSelect,
      ['id','user_id','teacher_id','schedule_kind','scheduled_date','day_of_week','start_time','duration_min','status','source','updated_at',hasStarts?'starts_on':'NULL'], csArgs)];
    for (const [table, fields, where] of [
      ['teacher_unavailability', ['id','teacher_id','kind','start_date','end_date','day_of_week','start_time','end_time'], ''],
      ['calendar_events', ['id','event_type','teacher_name','date','end_date'], "WHERE event_type='vacation'"],
      ['teachers', ['id','name'], ''],
      ['admin_scope', ['username','scope_type'], ''],
    ] as Array<[string, string[], string]>) {
      const exists = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first();
      if (exists) shots.push(await snapshot(env, `SELECT * FROM ${table} ${where} ORDER BY ${fields[0]}`, fields));
    }
    // Re-read after the snapshot: old caller rows and stale UI must both match it.
    const fresh = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id`).bind(JSON.stringify(ids)).all();
    if (!Array.isArray(fresh?.results) || fresh.success === false) throw new Error('schedule_lookup_failed');
    if (fresh.results.length !== ids.length) return fail(409, 'schedule_changed', '수업이 변경되었습니다. 새로고침해 주세요.');
    for (const row of fresh.results) {
      const previous = rows.find(r => String(r.id) === String(row.id));
      if (!previous || scheduleMoveVersion(previous) !== scheduleMoveVersion(row)
        || input.expected && input.expected[String(row.id)] !== scheduleMoveVersion(row))
        return fail(409, 'schedule_changed', '다른 변경이 있어 저장하지 않았습니다. 새로고침한 뒤 다시 시도해 주세요.');
    }
    rows = fresh.results;
    const facts = await loadScheduleMoveFacts(env);
    if (input.source_date) {
      const first = rows[0], start = groupMinute(first.start_time), teacher = String(first.teacher_id);
      const members = facts.rows.filter(r => String(r.teacher_id) === teacher && groupMinute(r.start_time) === start && occurrenceOn(r, input.source_date));
      if (start === null || rows.some(r => !occurrenceOn(r,input.source_date) || String(r.teacher_id)!==teacher || groupMinute(r.start_time)!==start)
        || members.length !== ids.length || members.some(r => !ids.includes(String(r.id))))
        return fail(409, 'group_changed', '수업 묶음의 구성원이 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요.');
    }
    const teachers = await env.DB.prepare(`SELECT id, name FROM teachers`).all();
    if (!Array.isArray(teachers?.results) || teachers.success === false) throw new Error('teacher_lookup_failed');
    const names = new Map(teachers.results.map((t: any) => [String(t.id), String(t.name || '')]));
    const scope: any = await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`).bind(actor.username).first();
    const now = Math.max(Date.now(), ...rows.map(r => (Number(r.updated_at) || 0) + 1)), destinations: any[] = [];
    for (const row of rows) {
      if (['cancelled','ended','completed'].includes(String(row.status || '')) || ['lms','type_seed'].includes(String(row.user_id).toLowerCase()))
        return fail(409, 'schedule_not_movable', '취소·종료 또는 자리표시 수업은 옮길 수 없습니다.');
      const patch = { ...p };
      if (patch.destination_date != null) {
        delete patch.scheduled_date; delete patch.day_of_week;
        if (row.scheduled_date || row.schedule_kind === 'one_off') patch.scheduled_date = patch.destination_date;
        else patch.day_of_week = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(patch.destination_date+'T00:00:00Z').getUTCDay()];
      }
      const fieldDeny = moveFieldConflict(row, patch);
      if (fieldDeny) return { ok: false as const, ...fieldDeny };
      const dest = { ...row };
      for (const field of ['scheduled_date','day_of_week','start_time','duration_min','teacher_id']) if (patch[field] != null) dest[field] = patch[field];
      if (patch.day_of_week != null) dest.day_of_week = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][scheduleDays({day_of_week:patch.day_of_week})[0]];
      if (patch.duration_min != null) dest.duration_min = Number(patch.duration_min);
      if (patch.teacher_id != null) dest.teacher_id = String(patch.teacher_id);
      if ((row.source === C24_SOURCE || row.source === C24_MANUAL_SOURCE)
        && (!same(dest.scheduled_date, row.scheduled_date) || c24NoteIds(row.notes).length > 0)
        && !trustworthyC24Identity(row))
        return fail(409, 'mirror_identity_missing', '카페24 원본 수업 번호를 확인할 수 없어 날짜를 변경하지 않았습니다. 원본 정보를 확인해 주세요.');
      if (!same(dest.teacher_id,row.teacher_id)) {
        const deny = teacherMoveDenyReason({ ok: actor.ok, isTeacher: actor.isTeacher, scopeType: scope?.scope_type || null });
        if (deny) return { ok: false as const, ...deny };
      }
      if (dest.teacher_id && !names.has(String(dest.teacher_id))) return fail(400, 'teacher_not_found', '그 번호의 강사를 찾을 수 없습니다.');
      const conflict = await findScheduleMoveConflicts(env, dest, String(names.get(String(dest.teacher_id)) || ''), ids, facts);
      if (conflict) return { ok: false as const, ...conflict };
      if (row.source === 'c24-mirror') dest.source = 'c24-mirror:manual';
      if (isPostponedOccurrence(row) && (!same(dest.scheduled_date,row.scheduled_date) || !same(dest.start_time,row.start_time) || !same(dest.day_of_week,row.day_of_week))) dest.status = 'active';
      dest.updated_at = now;
      destinations.push(dest);
    }
    // Excluding the source group must not hide collisions among its proposed rows.
    for (const dest of destinations) {
      const conflict = await findScheduleMoveConflicts(env, dest, String(names.get(String(dest.teacher_id)) || ''), [dest.id],
        { ...facts, rows: destinations.filter(r => String(r.id) !== String(dest.id)) });
      if (conflict) return { ok: false as const, ...conflict };
    }
    const token = crypto.randomUUID();
    const guardSql = shots.map(s => `(${s.sql}) = ?`).join(' AND ');
    const guardArgs = shots.flatMap(s => [...s.args, s.value]);
    const statements = [env.DB.prepare(`INSERT INTO schedule_move_guard(token,valid) SELECT ?, CASE WHEN ${guardSql} THEN 1 ELSE 0 END`).bind(token,...guardArgs)];
    for (let i=0;i<rows.length;i++) {
      const row=rows[i], dest=destinations[i];
      statements.push(env.DB.prepare(`UPDATE class_schedules SET teacher_id=?, scheduled_date=?, day_of_week=?, start_time=?, duration_min=?, source=?, status=?, updated_at=? WHERE id=?`)
        .bind(dest.teacher_id ?? null,dest.scheduled_date ?? null,dest.day_of_week ?? null,dest.start_time,dest.duration_min ?? null,dest.source ?? null,dest.status ?? null,now,row.id));
      statements.push(env.DB.prepare(`INSERT INTO class_audit_log (action,schedule_id,teacher_name,student_name,lesson_date,lesson_time,actor,actor_role,source,detail,created_at) VALUES ('reschedule',?,?,?,?,?,?,?,'ui',?,?)`)
        .bind(row.id,names.get(String(row.teacher_id)) || null,row.student_name || null,row.scheduled_date || null,row.start_time || null,actor.name || actor.username || '관리자',actor.isTeacher?'teacher':'admin',
          JSON.stringify({ids,scheduled_date:dest.scheduled_date,day_of_week:dest.day_of_week,start_time:dest.start_time,teacher_id:dest.teacher_id}),now));
    }
    statements.push(env.DB.prepare(`DELETE FROM schedule_move_guard WHERE token=?`).bind(token));
    const results = await env.DB.batch(statements);
    if (!Array.isArray(results) || results.some((r: any) => !r || r.success === false)) throw new Error('move_batch_failed');
    return { ok: true as const, status: 200, ids, count: ids.length,
      move_versions: Object.fromEntries(destinations.map(r => [String(r.id), scheduleMoveVersion(r)])) };
  } catch (e: any) {
    const conflict = /schedule_move_snapshot/.test(String(e?.message || e));
    return conflict ? fail(409,'schedule_changed','확인 중 수업·휴가 정보가 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요.')
      : fail(503,'move_failed','수업을 저장하지 못했습니다. 전체 묶음을 새로고침한 뒤 다시 시도해 주세요.');
  }
}
