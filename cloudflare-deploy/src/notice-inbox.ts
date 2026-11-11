/**
 * notice-inbox.ts — 🔔 관리자·매니저 화면의 «알림 종» 목록 (2026-11-11, 필리핀 매니저 건의)
 *
 *  [왜] 옛 LMS 상단 종(🔔 MESSAGES)처럼 «강사가 수업에 안 들어왔다» 를 화면에서 바로 보고
 *       «확인(Confirmed)» 을 남기고 싶다는 건의. 망고아이에는 이미 그 사건의 정본 기록이 있다 —
 *       `teacher_missing_alert`(teacher-missing-alert.ts, 결석 감지 크론이 «학생은 들어왔는데 강사가
 *       없다» 로 확정한 방만 한 줄씩 남긴다). 새 감지를 만들지 않고 그 표를 «읽어서» 보여 준다.
 *  ⛔ `class_no_show`(학생 화면이 쓰는 기록)는 쓰지 않는다 — «내 화면에 안 보였다» 라 오판이 많다
 *     (CLAUDE.md 2장 실측 57%). 이 표는 정본 판정(이름 일치·모르면 안 보냄)을 거친 것만 있다.
 *  ✅ «확인» 은 사람끼리 공유한다(누가 언제) — 따로 `teacher_missing_ack` 에 적고 원래 표는 안 건드린다.
 *  ℹ️ import 0 — 하니스가 진짜 SQLite 로 그대로 돌린다. 인증은 부르는 쪽(api-admin-scheduling.ts).
 */

export const INBOX_DAYS = 7;
export const INBOX_LIMIT = 50;

const ALERT_DDL = `CREATE TABLE IF NOT EXISTS teacher_missing_alert (room_id TEXT PRIMARY KEY, schedule_id INTEGER, teacher_id TEXT, created_at INTEGER NOT NULL, result TEXT)`;
const ACK_DDL = `CREATE TABLE IF NOT EXISTS teacher_missing_ack (room_id TEXT PRIMARY KEY, acked_by TEXT, acked_at INTEGER NOT NULL)`;

/** 누가 볼 수 있나 — 본사·내부직원만. 강사·지사·대리점은 막는다(남의 수업·강사 기록). 0 = 통과. */
export function inboxDenied(actor: { ok?: boolean; isTeacher?: boolean; role?: string } | null | undefined): 0 | 401 | 403 {
  if (!actor || actor.ok !== true) return 401;
  const r = String(actor.role || '');
  if (actor.isTeacher === true || r === 'teacher' || r === 'branch' || r === 'agency' || r === 'franchise') return 403;
  return 0;
}

function parseResult(s: any): any {
  try { const o = JSON.parse(String(s || '')); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}

/** 표 한 줄 → 화면 한 줄(한/영 문장 포함). 알림을 보낼 때 적어 둔 이름이 먼저, 없으면 원부·예약에서. */
export function inboxItem(row: any) {
  const r = parseResult(row?.result);
  const teacher = String(r.teacher || row?.t_name || '').trim() || '?';
  const student = String(r.student || row?.cs_student || '').trim() || '?';
  const start = String(r.start || row?.cs_start || '').trim() || '?';
  return {
    id: String(row?.room_id || ''),
    at: Number(row?.created_at) || 0,
    teacher, student, start,
    // 강사에게 푸시·이메일이 하나도 안 닿아 운영자 문자로 넘어간 건 — 매니저가 직접 연락해야 한다
    unreached: r.status === 'owner_escalated',
    acked_by: row?.acked_by || null,
    acked_at: Number(row?.acked_at) || null,
    ko: `${teacher} 강사가 ${start}(${student}) 수업에 입장하지 않았습니다.`,
    en: `${teacher} did not join the ${start} class (${student}).`,
  };
}

let tablesReady = false;   // 한 isolate 에 한 번만 — 종은 화면마다 1분에 한 번 묻는다
async function ensureTables(db: any) {
  if (!tablesReady) { await db.batch([db.prepare(ALERT_DDL), db.prepare(ACK_DDL)]); tablesReady = true; }
}
/** 최근 7일 «강사 미입장» 목록 + 아직 아무도 확인 안 한 개수. 표가 아직 없으면(크론이 한 번도 안 남김) 빈 목록. */
export async function listInbox(db: any, nowMs: number) {
  await ensureTables(db);
  const rs: any = await db.prepare(
    `SELECT a.room_id, a.created_at, a.result, t.name AS t_name, cs.student_name AS cs_student, cs.start_time AS cs_start,
            k.acked_by, k.acked_at
       FROM teacher_missing_alert a
       LEFT JOIN teachers t ON CAST(t.id AS TEXT) = a.teacher_id
       LEFT JOIN class_schedules cs ON cs.id = a.schedule_id
       LEFT JOIN teacher_missing_ack k ON k.room_id = a.room_id
      WHERE a.created_at >= ?
      ORDER BY a.created_at DESC LIMIT ?`
  ).bind(nowMs - INBOX_DAYS * 86400000, INBOX_LIMIT).all();
  const items = (rs?.results || []).map(inboxItem);
  return { ok: true as const, unread: items.filter((i: any) => !i.acked_by).length, items };
}

/** «확인» — 처음 누른 사람이 남는다(LMS 의 Confirmed 와 같다). 없는 방이면 null. */
export async function ackInbox(db: any, roomId: any, who: string, nowMs: number) {
  const id = String(roomId || '').trim();
  if (!id || id.length > 80) return null;
  await ensureTables(db);
  await db.prepare(
    `INSERT OR IGNORE INTO teacher_missing_ack (room_id, acked_by, acked_at)
     SELECT room_id, ?, ? FROM teacher_missing_alert WHERE room_id = ?`
  ).bind(String(who || '?').slice(0, 60), nowMs, id).run();
  return await db.prepare(`SELECT room_id, acked_by, acked_at FROM teacher_missing_ack WHERE room_id = ?`).bind(id).first();
}
