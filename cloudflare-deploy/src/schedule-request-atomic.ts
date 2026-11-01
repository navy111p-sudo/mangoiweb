/** Schedule requests keep their recorded-only recurring contract. Applied decisions
 * use one D1 transaction: request CAS, validated schedule/availability facts, every
 * schedule mutation, and the decision. Never consume a request after a failed move.
 * CHECK guards fail the transaction rather than allowing a zero-row UPDATE to pass.
 */
type Guard = { sql: string; args: any[] };

const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';
function unchangedRow(table: string, row: any): Guard {
  const keys = Object.keys(row);
  return { sql: `EXISTS (SELECT 1 FROM ${table} WHERE ${keys.map(k => `${quote(k)} IS ?`).join(' AND ')})`,
    args: keys.map(k => row[k] ?? null) };
}
async function unchangedQuery(env: any, select: string, fields: string[], args: any[] = []): Promise<Guard> {
  const sql = `SELECT json_group_array(json_array(${fields.map(quote).join(',')})) AS value FROM (${select})`;
  const row = await env.DB.prepare(sql).bind(...args).first();
  if (!row || typeof row.value !== 'string') throw new Error('request_snapshot_failed');
  return { sql: `(${sql}) IS ?`, args: [...args, row.value] };
}

export async function prepareScheduleRequestGuards(env: any, requestRow: any, schedule?: any, scope?: Guard): Promise<Guard[]> {
  // ⛔ D1 의 exec() 는 «줄마다» 따로 실행해 여러 줄 CREATE 가 실패한다(2026-10-04 실사고:
  //    이 표가 운영 DB 에 한 번도 안 생겨 모든 저장이 503). 한 문장은 prepare().run() 으로.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_request_guard (
    token TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT schedule_request_snapshot CHECK(valid=1))`).run();
  const guards = [unchangedRow('schedule_change_requests', requestRow)];
  if (scope) guards.push(scope);
  if (!schedule) return guards;
  guards.push(unchangedRow('class_schedules', schedule));
  // The schema guard also detects an optional availability table created after the read.
  guards.push(await unchangedQuery(env, `SELECT name, sql FROM sqlite_master WHERE type='table'
    AND name IN ('class_schedules','teacher_unavailability','calendar_events','teachers','admin_scope','teacher_pricing') ORDER BY name`, ['name','sql']));
  const teacherIds = JSON.stringify([...new Set([String(schedule.teacher_id || ''), String(requestRow.new_teacher_id || '')])]);
  for (const [table, where, args] of [
    ['class_schedules', 'WHERE CAST(teacher_id AS TEXT) IN (SELECT value FROM json_each(?)) OR user_id = ? OR id = ?', [teacherIds, schedule.user_id ?? null, schedule.id]],
    ['teacher_unavailability', 'WHERE CAST(teacher_id AS TEXT) IN (SELECT value FROM json_each(?))', [teacherIds]],
    ['calendar_events', "WHERE event_type='vacation'", []],
    ['teachers', 'WHERE CAST(id AS TEXT) IN (SELECT value FROM json_each(?))', [teacherIds]],
    ['teacher_pricing', 'WHERE CAST(teacher_id AS TEXT) IN (SELECT value FROM json_each(?))', [teacherIds]],
    ['admin_scope', '', []],
  ] as Array<[string, string, any[]]>) {
    const exists = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first();
    if (!exists) continue;
    const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    if (info?.success === false || !info?.results?.length) throw new Error('request_schema_failed');
    const fields = info.results.map((c: any) => String(c.name));
    guards.push(await unchangedQuery(env, `SELECT * FROM ${table} ${where} ORDER BY ${fields.map(quote).join(',')}`, fields, args));
  }
  return guards;
}

export async function commitScheduleRequestDecision(env: any, guards: Guard[], mutations: any[], decision: any): Promise<void> {
  const token = crypto.randomUUID();
  const statements = [env.DB.prepare(`INSERT INTO schedule_request_guard(token,valid)
    SELECT ?, CASE WHEN ${guards.map(g => `(${g.sql})`).join(' AND ')} THEN 1 ELSE 0 END`)
    .bind(token, ...guards.flatMap(g => g.args)), ...mutations, decision,
    env.DB.prepare(`DELETE FROM schedule_request_guard WHERE token=?`).bind(token)];
  const results = await env.DB.batch(statements);
  if (!Array.isArray(results) || results.some((r: any) => !r || r.success === false)) throw new Error('request_batch_failed');
}
