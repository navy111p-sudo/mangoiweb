import { loadTeacherStudentHistory } from './teacher-student-history';
import { ATTENDANCE_BY_UID, attUidBinds } from './attendance-uid';
import { judgeStudentAttendance } from './class-today-extras';

export function summarizeParentClasses(items: any[], month: string, now: number, joins: Map<string, number>) {
  const excluded = new Set(['cancelled', 'postponed', 'leave', 'absence_hold', 'holiday']);
  // History keeps conflicting LMS/reservation cards visible; count that slot once as unconfirmed.
  const slots = new Map<string, any>();
  for (const item of items) {
    const key = item.date + '|' + (item.start || item.room_id);
    const prior = slots.get(key);
    if (!prior) slots.set(key, item);
    else if (prior.room_id !== item.room_id) slots.set(key, { ...prior, state: 'unknown', on_leave: false, holiday: false });
  }
  const classes = [...slots.values()].filter(i => !excluded.has(i.state) && !i.on_leave && !i.holiday)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const current = classes.filter(i => i.date.startsWith(month));
  const done = current.filter(i => i.state === 'done');
  const past = classes.filter(i => Date.parse(i.date + 'T' + (i.start || '00:00') + ':00+09:00') <= now);
  let streak = 0;
  for (const item of past.slice().reverse()) {
    if (item.state !== 'done') break;
    streak++;
  }
  const absent = current.filter(i => i.state === 'student_absent' || i.state === 'late_postpone').length;
  let late = 0, unmeasured = 0;
  for (const item of done) {
    const at = joins.get(item.room_id);
    if (!at || item.attendance_source === 'lms' || item.teacher_source === 'lms') { unmeasured++; continue; }
    const start = Date.parse(item.date + 'T' + item.start + ':00+09:00');
    if (judgeStudentAttendance('mangoi', start, '', at, 0).state === 'late') late++;
  }
  const next = classes.find(i => i.state === 'upcoming' && Date.parse(i.date + 'T' + i.start + ':00+09:00') > now);
  return { month, completed: done.length, scheduled: current.length, streak,
    absent, late, late_unmeasured: unmeasured, unknown: current.filter(i => i.state === 'unknown').length,
    next: next ? { date: next.date, start: next.start, teacher: next.teacher_name || '' } : null,
    days: current.map(i => ({ date: i.date, start: i.start, state: i.state })) };
}

export async function readParentClasses(env: any, uid: string, now = Date.now()) {
  const kst = new Date(now + 9 * 3600000);
  const month = kst.toISOString().slice(0, 7), today = kst.toISOString().slice(0, 10);
  const months = [-1, 0, 1].map(offset => new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + offset, 1)).toISOString().slice(0, 7));
  const histories = await Promise.all(months.map(m => loadTeacherStudentHistory(env, uid, m, today)));
  // Only aggregate fields leave this endpoint; teacher notes stay in the authorized history service.
  const rows = await env.DB.prepare(`SELECT room_id, MIN(joined_at) AS first_join FROM attendance
    WHERE ${ATTENDANCE_BY_UID} AND role='student' AND status <> 'scheduled'
      AND joined_at >= ? AND joined_at <= ? GROUP BY room_id`)
    .bind(...attUidBinds(uid), Date.parse(months[0] + '-01T00:00:00+09:00'), now).all();
  const joins = new Map<string, number>((rows.results || []).map((r: any) => [String(r.room_id), Number(r.first_join)]));
  const warnings = [...new Set(histories.flatMap(h => h.warnings))];
  return { ...summarizeParentClasses(histories.flatMap(h => h.items), month, now, joins),
    partial: warnings.length > 0, streak_since: months[0] + '-01', next_until: months[2], warnings };
}
