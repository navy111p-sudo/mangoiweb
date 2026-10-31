import { dropCafe24SlotDuplicates } from './cafe24-slot-duplicates';
import { recurStartedOn } from './class-start-date';
import { isPostponedOccurrence } from './class-postponed';
import { twinCandidate, normTwinName } from './student-alias';

interface TeacherSchedule {
  user_id?: string | null;
  student_name?: string | null;
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
  student_name?: string | null;
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
 * Compare history independently of the selected calendar week; never match on student names alone
 * (twin rows also need the exact twin id and exact time — see dropTwinDuplicates below).
 */
export function dropTeacherCafe24Duplicates<T extends TeacherCafe24Row>(
  lms: T[], schedules: TeacherSchedule[], todayClasses: TeacherClass[],
  dowMatches: (raw: unknown, dow: number) => boolean,
): { kept: T[]; hidden: number } {
  const slots: NamedSlot[] = todayClasses.filter(c => c.kind === 'class').map(c => ({
    source: 'mangoi', student_uid: c.student_uid, start_ts: c.start_ts, name: c.student_name,
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
      slots.push({ source: 'mangoi', student_uid: uid, name: s.student_name,
        start_ts: Date.parse(date + 'T' + hm[1].padStart(2, '0') + ':' + hm[2] + ':00+09:00'),
        status: 'done' });
    }
  }
  const exact = dropCafe24SlotDuplicates(lms, slots);
  const twin = dropTwinDuplicates(exact.kept, slots);
  return { kept: twin.kept, hidden: exact.hidden + twin.hidden };
}

/* 👥 쌍둥이 계정 중복 줄 (2026-10-28) — 같은 수업이 예약표(`X`)와 옛 LMS(`mangoai_X`) 두 줄로 보이던 것.
   [잰 것] 9/15~10/27 운영 D1: 예약 행과 «정확히 같은 날·같은 분» 에 쌍둥이 계정의 LMS 행이 있는 경우 44줄·학생 6명,
        그중 42줄이 같은 강사(=한 강사 목록에 두 줄). 위 정확일치(아이디가 같아야 함)는 원리상 못 잡았다.
   [규칙] 위 dropCafe24SlotDuplicates 의 열쇠(아이디 + 절대 시각)를 «그대로» 쓰고 아이디만 쌍둥이로 바꿔 대 본다 —
        ① 아이디가 정확히 `X` ↔ `mangoai_X`(twinCandidate) ② 같은 강사 목록(입력이 이미 이 강사로 좁혀져 있다)
        ③ 시작 시각이 밀리초까지 같다 ④ **두 줄의 이름이 둘 다 확인되고 같다**(sameTwinName 과 같은 비교).
   ⛔ 이름이 비었거나 «아이디 그대로» 면 잇지 않는다(student-alias 규칙과 같은 방향 — 모르면 예전 동작).
      잘못 이으면 다른 학생의 LMS 줄이 강사 화면에서 사라진다. 두 줄이 남는 것보다 나쁘다.
   ⛔ 예약(망고아이) 줄은 건드리지 않는다 — 감추는 것은 늘 LMS 줄이다(방·출결이 예약 쪽에 있다).
   감시: test-harness/teacher_cafe24_duplicates_harness.mjs */
interface NamedSlot { source: string; student_uid?: string | null; start_ts?: number; status?: string; name?: string | null }

/** 이름이 «확인된» 값인가 — 비었거나 자기 아이디(또는 쌍둥이 아이디)와 같으면 ''(모름). 순수 함수. */
export function confirmedTwinName(name: unknown, uid: unknown): string {
  const n = normTwinName(name);
  const base = String(uid ?? '').trim().toLowerCase().replace(/^mangoai_/, '');
  if (!n || !base) return '';
  return n.toLowerCase().replace(/^_/, '') === base ? '' : n;   // 비교는 정확일치(대소문자 그대로)
}

function dropTwinDuplicates<T extends TeacherCafe24Row>(lms: T[], slots: NamedSlot[]): { kept: T[]; hidden: number } {
  const byName = new Map<string, NamedSlot[]>();
  for (const s of slots) {
    const uid = typeof s.student_uid === 'string' ? s.student_uid.trim() : '';
    const twin = uid ? twinCandidate(uid) : null;
    const name = confirmedTwinName(s.name, uid);
    if (!twin || !name) continue;
    const list = byName.get(name) || [];
    list.push({ ...s, student_uid: twin });
    byName.set(name, list);
  }
  if (!byName.size) return { kept: lms, hidden: 0 };
  const kept = lms.filter(row => {
    const candidates = byName.get(confirmedTwinName(row.username, row.user_id));
    return !candidates || dropCafe24SlotDuplicates([row], candidates).hidden === 0;
  });
  return { kept, hidden: lms.length - kept.length };
}
