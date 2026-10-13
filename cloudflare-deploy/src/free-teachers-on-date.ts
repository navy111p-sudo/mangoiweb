/**
 * 👥 «특정 날짜·시각에 빈 강사» — 판정 정본 (2026-10-13 매니저 요청 · 사장님 「특정 날짜 하루 기준」)
 *
 * [왜] 학원이 「10월 15일 오후 5시에 학생 5명 등록하고 싶다」고 물으면, 매니저가 주간 스케줄을
 *      눈으로 훑어 세야 했다. 그 질문에 «숫자로» 바로 답한다.
 *
 * [판정] 세 겹을 «모두» 통과해야 «가능» 이다 — 빈 강사를 늘리는 쪽으로는 절대 실패하지 않는다.
 *   ① moveCandidatesFor(enroll-ops.ts) — 옮기기 승인(/decide)이 쓰는 그 겹침 검사 + 대체 수업 + 근무 불가.
 *      ⛔ 판정을 복제하지 말 것(화면이 «가능» 이라 한 강사가 실제 배정에서 «겹침» 이 되면 안 된다).
 *   ② teacherIntervalsOn — ①이 원리상 못 보는 둘을 막는다:
 *      · «같은 시각·같은 길이» 수업(①은 합반으로 보고 뺀다 → 1:1 수업 중인 강사가 «빈 강사» 로 나옴)
 *      · 날짜 없는 «매주 반복» 행(①의 날짜 조회는 scheduled_date 로만 좁힌다)
 *   ③ 공휴일 휴강(holiday-closure.ts) — 그날 휴강인 강사는 «가능» 이 아니다(예외 강사는 연다).
 *
 * [확인 필요] 카페24 미러를 «안 켠» 강사는 카페24(LMS)에서 잡은 수업이 우리 시간표에 없다
 *      (2026-10-13 실측: 활성 24명 중 19명만 미러 — FAR·JP·KARL·MELCA·MAIMAI 는 아님).
 *      그 강사가 «비어 보이는» 것은 «모름» 이므로 `check` 로 따로 돌려준다.
 *      ⛔ 그들을 «확실히 가능» 숫자에 섞지 말 것 — 학원에 «가능» 이라 답했다가 LMS 수업과 겹친다.
 *
 * [실패] 어느 한 겹이라도 못 읽으면 ok:false — «빈 강사 0명» 과 «못 물어봤다» 를 같은 값으로 만들지 않는다.
 */
import { moveCandidatesFor, teacherIntervalsOn } from './enroll-ops';
import { getMirrorMode, getMirrorTeachers } from './c24-mirror';
import { loadHolidayClosure, isHolidayClosedFor } from './holiday-closure';
import { toMinutes, rowOverlaps } from './schedule-conflict';

export interface FreeTeacher {
  id: string;
  name: string;
  display_name: string;
  photo: string;
  day_count: number | null;
}

export interface FreeTeachersResult {
  ok: boolean;
  error?: string;
  date?: string;
  time?: string;
  duration_min?: number;
  /** 확실히 가능(미러로 LMS 수업까지 보이는 강사) */
  sure?: FreeTeacher[];
  /** 우리 시간표로는 비었지만 LMS 수업이 안 보이는 강사 — 카페24에서 한 번 더 확인 */
  check?: FreeTeacher[];
  /** 그 시간에 안 되는 강사 수 */
  busy_count?: number;
  /** 공휴일 휴강이면 그 이름(아니면 null) */
  holiday?: string | null;
}

export async function freeTeachersOnDate(env: any, date: string, time: string, minutes: number): Promise<FreeTeachersResult> {
  let base: any;
  try {
    base = await moveCandidatesFor(env, {
      id: 0, user_id: '', scheduled_date: date, dm: minutes, teacher_id: null, teacher_name: '', source: '',
    }, date, time, { dayCount: true });
  } catch (e: any) {
    console.warn('[free-teachers-on-date] base:', e?.message || e);
    return { ok: false, error: 'lookup_failed' };
  }
  if (!base || !Array.isArray(base.candidates)) return { ok: false, error: 'lookup_failed' };

  const iv = await teacherIntervalsOn(env, date);
  if (!iv) return { ok: false, error: 'lookup_failed' };   // ⛔ 못 읽었는데 «빈 강사» 를 그대로 내보내지 않는다

  let hol: any = null;
  try { hol = await loadHolidayClosure(env.DB, date); } catch { hol = null; /* 공휴일을 못 읽으면 평소대로(그 판정 정본의 방향) */ }

  const mode = await getMirrorMode(env);
  const mirrored = mode === 'all' ? null : await getMirrorTeachers(env);   // null = 전원 미러

  const startMin = toMinutes(time);
  const endMin = startMin + minutes;
  const sure: FreeTeacher[] = [];
  const check: FreeTeacher[] = [];
  let extraBusy = 0;
  for (const t of base.candidates as any[]) {
    const id = String(t.id);
    const mine = iv.get(id) || [];
    if (mine.some((c) => rowOverlaps(startMin, endMin, c.start, c.dur))) { extraBusy++; continue; }
    if (hol && isHolidayClosedFor(hol, id)) { extraBusy++; continue; }
    const row: FreeTeacher = {
      id, name: String(t.name || ''), display_name: String(t.display_name || t.name || ''),
      photo: String(t.photo || ''), day_count: t.day_count == null ? null : Number(t.day_count),
    };
    if (mirrored && !mirrored.has(id)) check.push(row); else sure.push(row);
  }
  return {
    ok: true, date, time, duration_min: minutes,
    sure, check,
    busy_count: (Number(base.busy_count) || 0) + extraBusy,
    holiday: hol && hol.closed ? (hol.name || '') : null,
  };
}
