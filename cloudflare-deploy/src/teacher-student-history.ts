import { buildStudentLedger } from './session-ledger-load';
import { attachCalendarRecords } from './calendar-records';
import { dowList } from './absence-hold';
import { recurStartedOn, normSkipDates } from './class-start-date';
import { loadTeacherNameOf } from './student-schedule-summary';

const KST = 9 * 3600000;
const day = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);
export function validHistoryDate(value: string): boolean {
  const ms = Date.parse(value + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(ms)
    && new Date(ms).toISOString().slice(0, 10) === value;
}

/** Closest earlier occurrence, including a class whose feedback was never written. */
export function previousScheduled(rows: any[], before: string): any | null {
  const candidates: any[] = [];
  for (const row of rows) {
    if (row.status === 'cancelled' || row.status === 'proposed') continue;
    const dated = String(row.scheduled_date || '').slice(0, 10);
    let date = '';
    if (dated) { if (dated < before && validHistoryDate(dated)) date = dated; }
    else {
      const dows = dowList(row.day_of_week), skipped = normSkipDates(row.skip_dates);
      const base = Date.parse(before + 'T00:00:00Z');
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
  const ledger: any = await buildStudentLedger(env, uid, month, Date.now(), true);
  if (!ledger.ok) throw new Error('history_schedule_unavailable');
  const rows = await env.DB.prepare(`SELECT * FROM class_schedules WHERE user_id = ?`).bind(uid).all();
  const previous = previousScheduled(rows.results || [], before);
  const from = month + '-01';
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  // Include legacy user_id rows, historical records without a surviving reservation and unwritten classes.
  const select = `SELECT id, room_id, lesson_date, teacher_name, teacher_uid, created_at,
    substr(COALESCE(NULLIF(note_en,''), teacher_comment, strengths, ''),1,1500) AS note_en,
    substr(COALESCE(note_ko,''),1,1500) AS note_ko FROM student_evaluations
    WHERE COALESCE(NULLIF(student_uid,''), user_id) = ?`;
  const [evals, prior] = await Promise.all([
    env.DB.prepare(select + ` AND COALESCE(NULLIF(lesson_date,''),date(created_at/1000,'unixepoch','+9 hours')) >= ?
      AND COALESCE(NULLIF(lesson_date,''),date(created_at/1000,'unixepoch','+9 hours')) < ? ORDER BY created_at DESC LIMIT 1001`)
      .bind(uid, from, end).all(),
    env.DB.prepare(select + ` AND COALESCE(NULLIF(lesson_date,''),date(created_at/1000,'unixepoch','+9 hours')) < ?
      ORDER BY COALESCE(NULLIF(lesson_date,''),date(created_at/1000,'unixepoch','+9 hours')) DESC, created_at DESC LIMIT 1`)
      .bind(uid, before).first(),
  ]);
  if ((evals.results || []).length > 1000) throw new Error('history_too_many_records');
  const schedules = new Map<number, any>((rows.results || []).map((r: any) => [Number(r.id), r]));
  const items: any[] = ledger.items.filter((it: any) => {
    const row = schedules.get(it.schedule_id);
    return row && (row.scheduled_date || recurStartedOn(row, it.date, { createdFallback: true }));
  });
  for (const it of items) it.student_uid = uid;
  await attachCalendarRecords(env, items);
  const reports = evals.results || [];
  const used = new Set<number>();
  const reportDate = (r: any) => String(r.lesson_date || day(Number(r.created_at))).slice(0, 10);
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
  if (prior && (!summary || reportDate(prior) >= summary.date)) {
    summary = { ...(summary && summary.date === reportDate(prior) ? summary : {}), date: reportDate(prior),
      teacher_name: prior.teacher_name || null, teacher_source: 'feedback', feedback: prior };
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
