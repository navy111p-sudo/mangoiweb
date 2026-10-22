import { briefEval, pickEvals } from './class-today-extras';
import { selectInChunks } from './d1-chunk';

/** Optional calendar metadata. Never turn an unread record into an absence or a missing report. */
export async function attachCalendarRecords(env: any, items: any[]): Promise<void> {
  for (const it of items) { it.report_loaded = false; it.today_eval = null; it.teacher_changed = false; }
  if (!items.length) return;
  const uids = [...new Set(items.map(i => String(i.student_uid || '').trim()).filter(Boolean))];
  try {
    const rows = await selectInChunks<any>(env.DB, uids, ph =>
      `SELECT id, student_uid, room_id, created_at, lesson_date FROM student_evaluations WHERE student_uid IN (${ph})`);
    rows.sort((a, b) => Number(b.created_at) - Number(a.created_at));
    for (const it of items) {
      const date = it.date || it.class_date;
      const candidates = rows.filter(r => String(r.student_uid) === String(it.student_uid));
      const { today } = pickEvals(candidates, it.room_id || '', date, Date.parse(date + 'T00:00:00+09:00'));
      it.today_eval = today ? { id: briefEval(today).id } : null;
      it.report_loaded = true;
    }
  } catch (e) { console.warn('[calendar] reports unavailable'); }
  try {
    const ids = [...new Set(items.map(i => String(i.schedule_id || i.id)).filter(Boolean))];
    const rows = await selectInChunks<any>(env.DB, ids, ph =>
      `SELECT schedule_id, action, teacher_name, lesson_date, detail, created_at FROM class_audit_log WHERE schedule_id IN (${ph}) AND action IN ('reschedule','teacher_change') ORDER BY created_at DESC`);
    for (const it of items) {
      const date = it.date || it.class_date;
      it.teacher_changed = rows.some(r => {
        if (String(r.schedule_id) !== String(it.schedule_id || it.id)) return false;
        let d: any = {}; try { d = JSON.parse(r.detail || '{}'); } catch { /* legacy text below */ }
        const changed = r.action === 'teacher_change' || d.teacher_changed === true
          || /담당 강사 →/.test(String(r.detail || ''));
        // An old audit with only a destination teacher id is not proof of a teacher change.
        if (!changed) return false;
        const effective = d.scheduled_date || r.lesson_date || new Date(Number(r.created_at) + 9 * 3600000).toISOString().slice(0,10);
        return effective === date;
      });
    }
  } catch (e) { console.warn('[calendar] teacher change history unavailable'); }
}
