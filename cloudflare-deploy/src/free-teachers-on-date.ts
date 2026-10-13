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
 *      «미러됨» 은 세 조건을 «모두» 만족할 때만이다(2026-10-13 trap-check 지적 반영):
 *        · 미러 모드가 'off' 가 아니다(off 면 카페24를 아예 안 부른다 — 모드를 못 읽어도 off 로 떨어진다)
 *        · 그 강사가 켜져 있다(whitelist 의 enabled=1, 또는 'all' 이면서 «켜지 마라»(enabled=0)가 아님)
 *        · 그 날짜가 미러가 만드는 기간 안이다 — 야간 미러가 «오늘~+14일» 까지만 만든다(index.ts days:14).
 *          그 뒤 날짜는 미러를 켠 강사라도 카페24 수업이 아직 우리 시간표에 없다 ⟹ 전원 «확인 필요».
 *      ⚠️ 오늘·내일도 카페24가 당일에 채운 예약은 최대 15분(감시견 주기) 늦게 들어온다 — 화면이 안내한다.
 *
 * [실패] ok:false 가 되는 것 — 그날 일정(teacherIntervalsOn)·강사 명단·근무 불가 표를 못 읽었을 때.
 *        «빈 강사 0명» 과 «못 물어봤다» 를 같은 값으로 만들지 않는다.
 *        ⚠️ 그 밖은 정본들이 스스로 «없음» 으로 넘긴다(대체 수업·공휴일·미러 설정) — 공휴일·미러를 못 읽으면
 *           각각 «평소대로»·«미러 안 됨(=전원 확인 필요)» 이라 «가능» 을 늘리는 쪽으로는 안 샌다.
 */
import { moveCandidatesFor, teacherIntervalsOn } from './enroll-ops';
import { getMirrorMode, getMirrorTeachers, getMirrorBlocked } from './c24-mirror';
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
  /** 미러가 만드는 기간 밖이라 전원을 «확인 필요» 로 돌렸는가 */
  beyond_mirror?: boolean;
  /** 미러가 꺼져 있어(off) 전원을 «확인 필요» 로 돌렸는가 */
  mirror_off?: boolean;
}

/** 야간 미러가 만드는 기간(오늘부터 며칠 뒤까지) — index.ts 의 runMirrorSweep({ days: 14 }) 와 짝. */
export const MIRROR_HORIZON_DAYS = 14;

function kstYmd(ms: number): string { return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function addDaysYmd(ymd: string, n: number): string {
  return new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

export async function freeTeachersOnDate(env: any, date: string, time: string, minutes: number, nowMs: number = Date.now()): Promise<FreeTeachersResult> {
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

  const iv = await teacherIntervalsOn(env, date, { keepOriginal: true });
  if (!iv) return { ok: false, error: 'lookup_failed' };   // ⛔ 못 읽었는데 «빈 강사» 를 그대로 내보내지 않는다

  /* 근무 불가 표 — 정본(unavailabilityRows)은 실패를 «없음» 으로 삼켜 휴가 중인 강사가 «가능» 이 된다.
     그래서 한 번 직접 읽어 본다: 표가 «없는» 것(아직 아무도 등록 안 함)은 정상, 그 밖의 실패는 ok:false. */
  try { await env.DB.prepare(`SELECT 1 FROM teacher_unavailability LIMIT 1`).all(); }
  catch (e: any) {
    if (!/no such table/i.test(String(e?.message || e))) {
      console.warn('[free-teachers-on-date] unavailability:', e?.message || e);
      return { ok: false, error: 'lookup_failed' };
    }
  }

  let hol: any = null;
  try { hol = await loadHolidayClosure(env.DB, date); } catch { hol = null; /* 공휴일을 못 읽으면 평소대로(그 판정 정본의 방향) */ }

  const mode = await getMirrorMode(env);
  const today = kstYmd(nowMs);
  const beyond = date > addDaysYmd(today, MIRROR_HORIZON_DAYS);
  const mirrorOff = mode === 'off';
  const enabled = mode === 'whitelist' ? await getMirrorTeachers(env) : null;
  const blocked = mode === 'all' ? await getMirrorBlocked(env) : null;
  const isMirrored = (id: string): boolean => {
    if (mirrorOff || beyond) return false;
    if (mode === 'all') return !(blocked && blocked.has(id));
    return !!(enabled && enabled.has(id));
  };

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
    if (isMirrored(id)) sure.push(row); else check.push(row);
  }
  return {
    ok: true, date, time, duration_min: minutes,
    sure, check,
    busy_count: (Number(base.busy_count) || 0) + extraBusy,
    holiday: hol && hol.closed ? (hol.name || '') : null,
    beyond_mirror: beyond && !mirrorOff,
    mirror_off: mirrorOff,
  };
}
