import { selectInChunks } from './d1-chunk';

/** Only enrich occurrences already authorized by the teacher portal. */
export async function attachTeacherPreviousLessons(db: any, items: any[], now: number): Promise<void> {
  const groups = new Map<string, any[]>();
  for (const it of items) {
    const date = String(it.class_date || it.date || '');
    if (it.kind !== 'class' || !it.student_uid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const group = groups.get(date) || [];
    group.push(it); groups.set(date, group);
  }
  for (const [date, group] of groups) {
    for (const it of group) { it.prev_lesson = null; it.previous_lesson_loaded = false; }
    const boundary = Math.min(now, Date.parse(date + 'T00:00:00+09:00'));
    if (!Number.isFinite(boundary)) continue;
    try {
      const uids = [...new Set(group.map(it => String(it.student_uid)))];
      const rows = await selectInChunks<any>(db, uids, ph => `
        SELECT * FROM (
          SELECT COALESCE(NULLIF(student_uid, ''), user_id) AS suid,
                 id AS eval_id, teacher_name, lesson_date AS date, score_overall,
                 substr(COALESCE(NULLIF(note_en, ''), teacher_comment, strengths, ''), 1, 400) AS note_en,
                 substr(COALESCE(note_ko, ''), 1, 400) AS note_ko,
                 created_at,
                 ROW_NUMBER() OVER (
                   PARTITION BY COALESCE(NULLIF(student_uid, ''), user_id)
                   ORDER BY COALESCE(NULLIF(lesson_date, ''), date(created_at / 1000, 'unixepoch', '+9 hours')) DESC,
                            created_at DESC, id DESC
                 ) AS rn
          FROM student_evaluations
          WHERE COALESCE(NULLIF(student_uid, ''), user_id) IN (${ph})
            AND created_at < ? AND (lesson_date IS NULL OR lesson_date = '' OR lesson_date < ?)
            AND (note_en IS NOT NULL OR note_ko IS NOT NULL OR room_id IS NOT NULL)
        ) WHERE rn = 1`, { tail: [boundary, date] });
      const byUid = new Map(rows.map(r => [String(r.suid), r]));
      for (const it of group) {
        const r = byUid.get(String(it.student_uid));
        it.previous_lesson_loaded = true;
        if (r) it.prev_lesson = {
          eval_id: Number(r.eval_id) || null,
          date: r.date || new Date(Number(r.created_at) + 9 * 3600000).toISOString().slice(0, 10),
          teacher_name: r.teacher_name || null, note_en: r.note_en || null, note_ko: r.note_ko || null,
          score_overall: r.score_overall != null ? r.score_overall : null,
        };
      }
    } catch { console.warn('[teacher-portal] previous lessons unavailable'); }
  }
}
