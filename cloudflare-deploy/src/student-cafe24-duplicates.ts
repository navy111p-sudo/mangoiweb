import { dropCafe24SlotDuplicates } from './cafe24-slot-duplicates';

/** Use only the authenticated student's real Mangoi classes already selected for today.
 * This changes the learning-plan input, never schedules or attendance records.
 */
export function dropStudentCafe24Duplicates<T extends { user_id?: unknown; joined_at?: unknown }>(
  uid: string, today: string,
  classes: Array<{ start: string; source: string }>, cafe24: T[],
): { kept: T[]; hidden: number } {
  const slots = classes.filter(c => c.source === 'mangoi').map(c => {
    const hm = /^(\d{1,2}):(\d{2})$/.exec(c.start);
    const valid = hm && Number(hm[1]) <= 23 && Number(hm[2]) <= 59;
    return {
      source: 'mangoi', student_uid: uid,
      start_ts: valid && /^\d{4}-\d{2}-\d{2}$/.test(today)
        ? Date.parse(today + 'T' + hm[1].padStart(2, '0') + ':' + hm[2] + ':00+09:00') : NaN,
    };
  });
  return dropCafe24SlotDuplicates(cafe24, slots);
}
