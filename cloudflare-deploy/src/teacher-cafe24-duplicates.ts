import { dropCafe24SlotDuplicates } from './cafe24-slot-duplicates';
import { recurStartedOn } from './class-start-date';
import { isPostponedOccurrence } from './class-postponed';

interface TeacherSchedule {
  user_id?: string | null;
  scheduled_date?: string | null;
  day_of_week?: string | number | null;
  start_time?: string | null;
  sched_status?: string | null;
  source?: string | null;
  notes?: string | null;
  starts_on?: string | null;
  skip_dates?: string | null;
}
interface TeacherClass {
  kind?: string;
  student_uid?: string | null;
  start_ts?: number;
  status?: string;
  class_state?: string;
}
interface TeacherCafe24Row {
  user_id?: string | null;
  joined_at?: number | string | null;
  room_id?: string | null;
  left_at?: number | string | null;
  username?: string | null;
  student_en?: string | null;
  level?: string | null;
  textbook?: string | null;
  eval_band?: string | null;
}

/** Use only schedules already scoped to the authenticated teacher. No writes or new queries.
 * Compare history independently of the selected calendar week; never match student names.
 */
export function dropTeacherCafe24Duplicates<T extends TeacherCafe24Row>(
  lms: T[], schedules: TeacherSchedule[], todayClasses: TeacherClass[],
  dowMatches: (raw: unknown, dow: number) => boolean,
): { kept: T[]; hidden: number } {
  const slots = todayClasses.filter(c => c.kind === 'class').map(c => ({
    source: 'mangoi', student_uid: c.student_uid, start_ts: c.start_ts,
    status: c.class_state === 'cancelled' || c.class_state === 'postponed' ? c.class_state : c.status,
  }));
  const dates = new Set<string>();
  for (const row of lms) {
    const ms = Number(row.joined_at);
    if (Number.isSafeInteger(ms) && ms > 0 && ms < 8640000000000000 - 32400000)
      dates.add(new Date(ms + 32400000).toISOString().slice(0, 10));
  }
  for (const s of schedules) {
    const uid = s.user_id;
    if (!uid || !uid.trim() || ['lms', 'type_seed'].includes(uid.toLowerCase())) continue;
    if (s.sched_status === 'cancelled' || isPostponedOccurrence(s)) continue;
    const hm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s.start_time || '');
    if (!hm || Number(hm[1]) > 23 || Number(hm[2]) > 59) continue;
    for (const date of dates) {
      const occurs = s.scheduled_date ? s.scheduled_date.slice(0, 10) === date
        : s.day_of_week != null && s.day_of_week !== ''
          && dowMatches(s.day_of_week, new Date(date + 'T00:00:00Z').getUTCDay())
          && recurStartedOn(s, date);
      if (!occurs) continue;
      slots.push({ source: 'mangoi', student_uid: uid,
        start_ts: Date.parse(date + 'T' + hm[1].padStart(2, '0') + ':' + hm[2] + ':00+09:00'),
        status: 'done' });
    }
  }
  return dropCafe24SlotDuplicates(lms, slots);
}
