import { buildStudentLedger } from './session-ledger-load';
import { attachCalendarRecords } from './calendar-records';
import { dowList } from './absence-hold';
import { recurStartedOn, normSkipDates } from './class-start-date';
import { loadTeacherNameOf } from './student-schedule-summary';
import { splitPastDay, splitOriginsFromNotes } from './schedule-split';
import { evaluationColumns, evaluationKstDate } from './evaluation-records';

const KST = 9 * 3600000;
const day = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);
const nextDay = (date: string) => new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

/** A cancelled series still owns its earlier occurrences. Never project it into the future. */
export function historyScheduleProjection(rows: any[], observedRooms: string[] = []): any[] {
  const origins = splitOriginsFromNotes(rows), out: any[] = [];
  for (const row of rows) {
    if (row.status === 'proposed') continue;
    if (row.status !== 'cancelled') { out.push(row); continue; }
    const split = splitPastDay(row, origins);
    const cancelled = evaluationKstDate(row.updated_at);
    if (row.scheduled_date) {
      out.push({ ...row, status: 'active', history_cancelled_on: cancelled || String(row.scheduled_date).slice(0,10) });
    } else if (split || cancelled) {
      out.push({ ...row, status: 'active', history_until: split || nextDay(cancelled!), history_cancelled_on: split ? null : cancelled });
    } else {
      // The cancellation date is unknown. Only actual attendance can establish these old occurrences.
      for (const room of observedRooms) {
        const match = /^class-(\d+)-(\d{4})(\d{2})(\d{2})$/.exec(room);
        if (match && Number(match[1]) === Number(row.id)) out.push({ ...row, status:'active', scheduled_date:`${match[2]}-${match[3]}-${match[4]}` });
      }
    }
  }
  return out;
}

/** Read existing columns only; use the canonical lesson_date → eval_at → created_at date precedence. */
export async function historyFeedback(db: D1Database, uid: string): Promise<any[]> {
  const columns = await evaluationColumns(db, 'student_evaluations');
  const identities = ['student_uid', 'user_id'].filter(c => columns.has(c));
  if (!identities.length) throw new Error('history_feedback_identity_unavailable');
  const identity = identities.length === 2 ? "COALESCE(NULLIF(student_uid,''),user_id)" : identities[0];
  const conflict = identities.length === 2 ? " AND (NULLIF(student_uid,'') IS NULL OR NULLIF(user_id,'') IS NULL OR student_uid=user_id COLLATE BINARY)" : '';
  const names = ['id','room_id','lesson_date','eval_at','teacher_name','teacher_uid','created_at','note_en','note_ko','teacher_comment','strengths','evaluator','comment'];
  const rs = await db.prepare(`SELECT ${names.map(c => columns.has(c) ? c : 'NULL AS ' + c).join(',')}
    FROM student_evaluations WHERE ${identity} = ? COLLATE BINARY${conflict} LIMIT 10001`).bind(uid).all<any>();
  if ((rs as any).success === false || !Array.isArray(rs.results)) throw new Error('history_feedback_unavailable');
  if (rs.results.length > 10000) throw new Error('history_too_many_records');
  return rs.results.map(r => ({ id:r.id,room_id:r.room_id,
    lesson_date:evaluationKstDate(r.lesson_date) || evaluationKstDate(r.eval_at) || evaluationKstDate(r.created_at),
    teacher_name:r.teacher_name || r.evaluator || null,created_at:r.created_at,
    note_en:String(r.note_en || r.teacher_comment || r.strengths || r.comment || '').slice(0,1500),
    note_ko:String(r.note_ko || '').slice(0,1500) })).filter(r => r.lesson_date)
    .sort((a,b) => b.lesson_date.localeCompare(a.lesson_date) || (Number(b.created_at)||0)-(Number(a.created_at)||0));
}
export function validHistoryDate(value: string): boolean {
  const ms = Date.parse(value + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(ms)
    && new Date(ms).toISOString().slice(0, 10) === value;
}

/** Closest earlier occurrence, including a class whose feedback was never written. */
export function previousScheduled(rows: any[], before: string): any | null {
  const candidates: any[] = [];
  for (const row of historyScheduleProjection(rows)) {
    const dated = String(row.scheduled_date || '').slice(0, 10);
    let date = '';
    if (dated) { if (dated < before && validHistoryDate(dated)) date = dated; }
    else {
      const dows = dowList(row.day_of_week), skipped = normSkipDates(row.skip_dates);
      const base = Date.parse((row.history_until && row.history_until < before ? row.history_until : before) + 'T00:00:00Z');
      for (let i = 1; i <= (skipped.length + 1) * 7; i++) {
        const d = new Date(base - i * 86400000), ymd = d.toISOString().slice(0, 10);
        if (skipped.includes(ymd)) continue;
        if (!recurStartedOn(row, ymd, { createdFallback: true })) break;
        if (dows.includes(d.getUTCDay()) && !skipped.includes(ymd)) { date = ymd; break; }
      }
    }
    if (date) candidates.push({ date, start: String(row.start_time || ''), schedule_id: Number(row.id),
      teacher_id: row.teacher_id, room_id: `class-${row.id}-${date.replace(/-/g, '')}` });
  }
  candidates.sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  return candidates[0] || null;
}

/** Read only. Student identity must come from an authorized schedule, never the query string. */
export async function loadTeacherStudentHistory(env: any, uid: string, month: string, before: string) {
  const rows = await env.DB.prepare(`SELECT * FROM class_schedules WHERE user_id = ?`).bind(uid).all();
  const from = month + '-01';
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  let observedRooms: string[] = [], observationWarning = false;
  if ((rows.results || []).some((r: any) => r.status === 'cancelled' && !r.scheduled_date && !evaluationKstDate(r.updated_at))) {
    try {
      const attendance = await env.DB.prepare(`SELECT DISTINCT a.room_id FROM attendance a JOIN class_schedules cs
        ON a.room_id GLOB ('class-' || cs.id || '-[0-9]*') WHERE cs.user_id=? AND a.role='student' LIMIT 10001`)
        .bind(uid).all();
      if ((attendance.results || []).length > 10000) throw new Error('history_attendance_limit');
      observedRooms = (attendance.results || []).map((r: any) => String(r.room_id));
    } catch { observationWarning = true; }
  }
  const projected = historyScheduleProjection(rows.results || [], observedRooms);
  const previous = previousScheduled(projected, before);
  const [ledger, allReports]: any[] = await Promise.all([
    buildStudentLedger(env, uid, month, Date.now(), true, projected), historyFeedback(env.DB, uid),
  ]);
  if (!ledger.ok) throw new Error('history_schedule_unavailable');
  if (observationWarning) ledger.warnings.push('historical_attendance');
  const reportDate = (r: any) => r.lesson_date;
  const reports = allReports.filter((r: any) => r.lesson_date >= from && r.lesson_date < end);
  const prior = allReports.find((r: any) => r.lesson_date < before);
  const previousFeedback = previous && allReports.find((r: any) => r.room_id === previous.room_id && r.lesson_date < before);
  const schedules = new Map<number, any>(projected.map((r: any) => [Number(r.id), r]));
  const items: any[] = ledger.items.filter((it: any) => {
    const row = schedules.get(it.schedule_id);
    return row && (row.scheduled_date || recurStartedOn(row, it.date, { createdFallback: true }));
  });
  for (const it of items) it.student_uid = uid;
  await attachCalendarRecords(env, items);
  const used = new Set<number>();
  for (const it of items) {
    const report = reports.find((r: any) => reportDate(r) === it.date && r.room_id === it.room_id)
      || (items.filter(x => x.date === it.date).length === 1
        ? reports.find((r: any) => reportDate(r) === it.date && !r.room_id) : null);
    if (report) {
      used.add(Number(report.id));
      it.feedback = report; it.teacher_name = report.teacher_name || it.teacher_name;
      it.teacher_source = 'feedback';
    } else it.teacher_source = 'schedule';
  }
  for (const report of reports) {
    if (used.has(Number(report.id))) continue;
    // Duplicate revisions of the same room are one occurrence; show its newest report.
    if (report.room_id && items.some(i => i.room_id === report.room_id && i.date === reportDate(report))) continue;
    const rm = /^class-(\d+)-\d{8}$/.exec(String(report.room_id || ''));
    items.push({ date: reportDate(report), start: null, schedule_id: rm ? Number(rm[1]) : null,
      room_id: report.room_id, teacher_name: report.teacher_name || null, teacher_source: 'feedback',
      state: 'unknown', label_en: 'Attendance not recorded', label_ko: '출결 기록 미확인', feedback: report });
  }
  let summary: any = previous;
  const sameDayCount = previous ? projected.filter((r: any) => previousScheduled([r], before)?.date === previous.date).length : 0;
  const matchedFeedback = previousFeedback || (prior && summary && reportDate(prior) === summary.date && !prior.room_id && sameDayCount === 1 ? prior : null);
  const summaryFeedback = prior && (!summary || reportDate(prior) > summary.date) ? prior : matchedFeedback;
  if (summaryFeedback) {
    summary = { ...(summary && summary.date === reportDate(summaryFeedback) ? summary : {}), date: reportDate(summaryFeedback),
      teacher_name: summaryFeedback.teacher_name || (summary?.date === reportDate(summaryFeedback) ? summary.teacher_name : null) || null,
      teacher_source: 'feedback', feedback: summaryFeedback };
  }
  const nameOf = await loadTeacherNameOf(env);
  if (summary && !summary.teacher_name) summary.teacher_name = nameOf(summary.teacher_id) || null;
  // Undo permanent teacher changes when showing dates before their effective day.
  // Old text-only audits cannot prove a teacher identity: leave that value explicitly unknown.
  const audits = await env.DB.prepare(`SELECT a.schedule_id,a.action,a.lesson_date,a.detail,a.created_at
    FROM class_audit_log a JOIN class_schedules cs ON cs.id=a.schedule_id
    WHERE cs.user_id=? AND a.action IN ('teacher_change','reschedule') ORDER BY a.created_at DESC`)
    .bind(uid).all();
  for (const it of [...items, ...(summary ? [summary] : [])]) {
    if (it.teacher_source === 'feedback') continue;
    for (const audit of audits.results || []) {
      if (Number(audit.schedule_id) !== it.schedule_id) continue;
      let detail: any = {}; try { detail = JSON.parse(audit.detail || '{}'); } catch { /* legacy text */ }
      if (detail.via_overlay) continue;
      const effective = detail.date || detail.scheduled_date || audit.lesson_date || day(Number(audit.created_at));
      if (audit.action !== 'teacher_change' && !detail.teacher_changed && !/담당 강사 →/.test(audit.detail || '')) continue;
      if (it.date < effective) { it.teacher_name = nameOf(detail.from_teacher_id) || null; }
      else if (it.date === effective) it.teacher_changed = true;
    }
  }
  // Date-specific substitutes take precedence over the recurring reservation's teacher.
  const subs = await env.DB.prepare(`SELECT s.schedule_id, s.sub_date, s.substitute_teacher_id, t.name AS teacher_name
    FROM class_substitutions s JOIN class_schedules cs ON cs.id=s.schedule_id
    LEFT JOIN teachers t ON CAST(t.id AS TEXT)=CAST(s.substitute_teacher_id AS TEXT)
    WHERE cs.user_id=? AND s.status='active' AND (s.sub_date BETWEEN ? AND ? OR s.sub_date=?)`)
    .bind(uid, from, end, summary?.date || '').all();
  for (const it of [...items, ...(summary ? [summary] : [])]) {
    if (it.teacher_source === 'feedback') continue;
    const sub = (subs.results || []).find((s: any) => Number(s.schedule_id) === it.schedule_id && s.sub_date === it.date);
    if (sub) { it.teacher_name = sub.teacher_name || nameOf(sub.substitute_teacher_id) || null; it.teacher_changed = true; }
  }
  items.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  return { ok: true, month, items, previous: summary, warnings: ledger.warnings || [] };
}
