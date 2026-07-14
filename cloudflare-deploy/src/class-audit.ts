// ═══════════════════════════════════════════════════════════════
// 📜 수업 변경 이력(Class Change Audit Log)
//   수업의 '연기(postpone/reschedule)'·'삭제(remove)'·'종료(end)' 작업이 발생하면
//   누가(actor)·언제(created_at)·무엇을 했는지 상세 기록한다. 관리자 조회 전용.
//   그동안 삭제·종료는 어디에도 기록이 남지 않았음(연기·변경만 schedule_change_requests 에 있었음).
//   ⚠️ 기록 실패가 본 작업(삭제/종료 등)을 막으면 안 되므로 항상 best-effort(에러 삼킴).
// ═══════════════════════════════════════════════════════════════

export type ClassAuditAction = 'postpone' | 'reschedule' | 'remove' | 'end' | 'restore';

export interface ClassAuditEntry {
  action: ClassAuditAction | string;
  schedule_id?: number | string | null;
  room_id?: string | null;
  teacher_name?: string | null;
  student_name?: string | null;
  lesson_date?: string | null;
  lesson_time?: string | null;
  actor?: string | null;      // 작업 수행 주체(이름/계정)
  actor_role?: string | null; // admin | teacher | system
  source?: string | null;     // ui | ai-command | schedule-request | api
  reason?: string | null;
  detail?: string | null;     // 자유 텍스트/JSON (예: 새 일시)
}

export async function ensureClassAuditTable(env: any): Promise<void> {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS class_audit_log (` +
    `id INTEGER PRIMARY KEY AUTOINCREMENT, ` +
    `action TEXT NOT NULL, schedule_id INTEGER, room_id TEXT, ` +
    `teacher_name TEXT, student_name TEXT, lesson_date TEXT, lesson_time TEXT, ` +
    `actor TEXT, actor_role TEXT, source TEXT, reason TEXT, detail TEXT, ` +
    `created_at INTEGER NOT NULL)`
  );
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_cal_created ON class_audit_log(created_at)`); } catch {}
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_cal_action ON class_audit_log(action, created_at)`); } catch {}
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_cal_sched ON class_audit_log(schedule_id)`); } catch {}
}

// best-effort: 실패해도 절대 throw 하지 않음(본 작업을 막지 않기 위해)
export async function writeClassAudit(env: any, e: ClassAuditEntry): Promise<void> {
  try {
    await ensureClassAuditTable(env);
    const sid = (e.schedule_id == null || e.schedule_id === '') ? null : parseInt(String(e.schedule_id), 10) || null;
    await env.DB.prepare(
      `INSERT INTO class_audit_log (action, schedule_id, room_id, teacher_name, student_name, lesson_date, lesson_time, actor, actor_role, source, reason, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      String(e.action || 'unknown'),
      sid,
      e.room_id || null,
      e.teacher_name || null,
      e.student_name || null,
      e.lesson_date || null,
      e.lesson_time || null,
      e.actor || null,
      e.actor_role || null,
      e.source || null,
      e.reason || null,
      e.detail || null,
      Date.now()
    ).run();
  } catch (err: any) {
    try { console.warn('[class-audit] write failed:', err?.message); } catch {}
  }
}

export interface ClassAuditFilter {
  action?: string;
  teacher_name?: string;
  from?: number;   // created_at ms 하한
  to?: number;     // created_at ms 상한
  limit?: number;
}

export async function listClassAudit(env: any, f: ClassAuditFilter = {}): Promise<any[]> {
  await ensureClassAuditTable(env);
  const where: string[] = [];
  const args: any[] = [];
  if (f.action && f.action !== 'all') { where.push('action = ?'); args.push(String(f.action)); }
  if (f.teacher_name) { where.push('LOWER(TRIM(teacher_name)) = LOWER(TRIM(?))'); args.push(String(f.teacher_name)); }
  if (f.from) { where.push('created_at >= ?'); args.push(f.from); }
  if (f.to) { where.push('created_at < ?'); args.push(f.to); }
  const limit = Math.max(1, Math.min(1000, f.limit || 300));
  const sql = `SELECT * FROM class_audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ${limit}`;
  const rs: any = await env.DB.prepare(sql).bind(...args).all().catch(() => ({ results: [] }));
  return rs.results || [];
}
