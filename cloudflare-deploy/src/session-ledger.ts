/**
 * 📒 회차 원장 — 정본(순수 함수, import 없음)
 *
 * (2026-10-01 사장님 결정) 학생의 수업 «한 번» 에 상태를 «하나만» 붙인다.
 * 본사·대리점이 같은 숫자를 보게 하는 기준이고, 대리점 회차 대사(샘플 3)·A.i 차이 진단(샘플 4)·
 * 월 재등록 초안(샘플 1)이 모두 이 숫자를 쓴다.
 *
 *   · 수업 시작 30분 전까지 연락 없이 안 들어옴  → 학생 결석  (차감)
 *   · 수업 시작 30분 전까지 연락하고 연기 승인   → 연기        (차감 안 함 · 뒤로 이월)
 *   · 30분 안쪽에 연기 요청                      → 늦은 연기 = 결석 처리 (차감)
 *   · 휴원(한 번 최대 4주 · 최근 365일 3번)      → 휴원        (차감 안 함 · 정지)
 *
 * ⚠️ «30분» 경계는 급여 계산과 **같은 기준**이다 — 연기 요청의 fee_type 이
 *    minutes_before > 30 이면 'free'(사전 연기), 아니면 'paid'(api-admin.ts 연기 요청 저장부).
 *    학생 쪽만 다르게 세면 «학생은 차감 안 됐는데 강사는 전액» 처럼 두 장부가 어긋난다.
 *    한쪽을 바꾸면 반드시 둘 다 바꿀 것.
 * ⚠️ 이 파일은 «읽은 기록» 으로 판정만 한다. class_schedules·노쇼·출석 표는 한 줄도 안 고친다.
 * ⚠️ 모르면 «미정»(unknown) — 빈칸을 숫자로 채우지 않는다. 차감도 안 한다.
 */

export const POSTPONE_FREE_MINUTES_GT = 30;   // 이 분보다 «더» 일찍 요청해야 연기(차감 안 함)
export const LEAVE_MAX_DAYS = 28;              // 휴원 한 번 최대 4주
export const LEAVE_MAX_PER_YEAR = 3;           // 최근 365일 안 휴원 횟수
export const LEAVE_WINDOW_DAYS = 365;

export type LedgerState =
  | 'done'            // 완료
  | 'student_absent'  // 학생 결석 (연락 없음)
  | 'late_postpone'   // 30분 안쪽 연기 → 결석 처리
  | 'postponed'       // 연기 (30분 전 연락) · 이월
  | 'teacher_absent'  // 강사 결석 → 보강
  | 'leave'           // 휴원
  | 'absence_hold'    // 연속 결석 보류 (수업을 멈춰 둔 기간)
  | 'holiday'         // 공휴일
  | 'upcoming'        // 아직 안 함
  | 'unknown';        // 기록 없음 — 사람이 확인

export interface LedgerStateDef { ko: string; en: string; deduct: boolean; carry: boolean; }

export const LEDGER_STATES: Record<LedgerState, LedgerStateDef> = {
  done:           { ko: '완료',                 en: 'Done',               deduct: true,  carry: false },
  student_absent: { ko: '학생 결석',            en: 'Student absent',     deduct: true,  carry: false },
  late_postpone:  { ko: '늦은 연기(결석 처리)', en: 'Late postpone',      deduct: true,  carry: false },
  postponed:      { ko: '연기',                 en: 'Postponed',          deduct: false, carry: true  },
  teacher_absent: { ko: '강사 결석',            en: 'Teacher absent',     deduct: false, carry: true  },
  leave:          { ko: '휴원',                 en: 'On leave',           deduct: false, carry: false },
  absence_hold:   { ko: '결석 보류',            en: 'Paused (absences)',  deduct: false, carry: false },
  holiday:        { ko: '공휴일',               en: 'Holiday',            deduct: false, carry: true  },
  upcoming:       { ko: '예정',                 en: 'Upcoming',           deduct: false, carry: false },
  unknown:        { ko: '미정(기록 없음)',      en: 'Unknown',            deduct: false, carry: false },
};

export interface OccurrenceFacts {
  /** class_schedules.status (소문자). 'postponed' 면 연기된 행 */
  schedStatus?: string | null;
  /** 시작 시각이 아직 안 왔나 */
  upcoming: boolean;
  /** 학생 접속 기록: true=들어옴 · false=확인했는데 없음 · null=못 읽음 */
  attended: boolean | null;
  /** 학생 미입장 기록(class_no_show missing_role='student') */
  studentNoShow: boolean;
  /** 강사 미입장 기록 — 오판(출석 대조로 강사가 실제로 있었음)이면 false 로 넘길 것 */
  teacherNoShow: boolean;
  /** 승인된 연기 요청(그 날짜). minutes_before / fee_type 중 아는 것 */
  postponeReq?: { minutes_before?: number | null; fee_type?: string | null } | null;
  /** 그날이 휴원 기간 안인가 */
  onLeave: boolean;
  /** 그날이 연속 결석 보류 기간 안인가 */
  onHold: boolean;
  /** 그날이 공휴일(enroll_holidays)인가 */
  holiday: boolean;
}

/** 연기 요청이 «30분 전» 이었나. 모르면 null. */
export function postponeWasEarly(req: OccurrenceFacts['postponeReq']): boolean | null {
  if (!req) return null;
  const mb = req.minutes_before;
  if (mb !== null && mb !== undefined && mb !== ('' as any) && Number.isFinite(Number(mb))) {
    return Number(mb) > POSTPONE_FREE_MINUTES_GT;
  }
  if (req.fee_type === 'free') return true;
  if (req.fee_type === 'paid') return false;
  return null;
}

/**
 * 한 회차의 상태. 우선순위가 곧 규칙이다 — 순서를 바꾸면 숫자가 바뀐다.
 *   1 실제로 들어왔으면 무엇이 적혀 있든 «완료» (수업은 했다)
 *   2 연기 행 → 30분 기준으로 연기 / 늦은 연기
 *   3 아직 안 왔으면 예정
 *   4 휴원 · 보류 · 공휴일 (학생 사정으로 멈춘 기간)
 *   5 강사 결석 → 학생 결석 → 기록 없음
 */
export function classifyOccurrence(f: OccurrenceFacts): LedgerState {
  const st = String(f.schedStatus || 'active').toLowerCase();
  if (f.attended === true) return 'done';
  if (st === 'postponed') {
    const early = postponeWasEarly(f.postponeReq);
    // 요청 기록이 없는 연기(관리자가 상태만 바꾼 경우)는 «언제» 를 모른다 → 결석으로 단정하지 않는다.
    return early === false ? 'late_postpone' : 'postponed';
  }
  if (f.upcoming) return 'upcoming';
  if (f.onLeave) return 'leave';
  if (f.onHold) return 'absence_hold';
  if (f.holiday) return 'holiday';
  if (f.teacherNoShow) return 'teacher_absent';
  if (f.studentNoShow) return 'student_absent';
  return 'unknown';
}

export interface LedgerSummary {
  total: number;
  deducted: number;
  carried: number;
  byState: Record<string, number>;
}
export function summarize(states: LedgerState[]): LedgerSummary {
  const byState: Record<string, number> = {};
  let deducted = 0, carried = 0;
  for (const s of states) {
    byState[s] = (byState[s] || 0) + 1;
    const d = LEDGER_STATES[s];
    if (d && d.deduct) deducted++;
    if (d && d.carry) carried++;
  }
  return { total: states.length, deducted, carried, byState };
}

// ───────────────────────── 휴원 규칙 ─────────────────────────
const YMD = /^\d{4}-\d{2}-\d{2}$/;
function dayNum(ymd: string): number { return Math.round(Date.parse(ymd + 'T00:00:00Z') / 86400000); }

export interface LeaveRow { id?: number; start_date: string; end_date: string; status?: string | null; created_at?: number | null; }

export function leaveDays(start: string, end: string): number { return dayNum(end) - dayNum(start) + 1; }

export function isOnLeave(leaves: LeaveRow[], ymd: string): LeaveRow | null {
  for (const l of leaves || []) {
    if (String(l.status || 'active') !== 'active') continue;
    if (l.start_date <= ymd && ymd <= l.end_date) return l;
  }
  return null;
}

/**
 * 휴원 신청 검사. 통과면 null, 아니면 사유 코드.
 *   · 날짜 형식 · 끝 ≥ 시작
 *   · 한 번 최대 4주(28일)
 *   · 최근 365일(신청 시각 기준) 안 휴원이 이미 3번이면 막음 — 취소한 것은 안 셈
 *   · 이미 있는 휴원과 겹치면 막음
 */
export function validateLeave(
  req: { start_date: string; end_date: string },
  existing: LeaveRow[],
  nowMs: number,
): null | 'bad_date' | 'end_before_start' | 'too_long' | 'yearly_limit' | 'overlap' {
  const s = String(req.start_date || ''), e = String(req.end_date || '');
  if (!YMD.test(s) || !YMD.test(e) || isNaN(Date.parse(s)) || isNaN(Date.parse(e))) return 'bad_date';
  if (e < s) return 'end_before_start';
  if (leaveDays(s, e) > LEAVE_MAX_DAYS) return 'too_long';
  const active = (existing || []).filter(l => String(l.status || 'active') === 'active');
  const since = nowMs - LEAVE_WINDOW_DAYS * 86400000;
  const recent = active.filter(l => (Number(l.created_at) || 0) > since).length;
  if (recent >= LEAVE_MAX_PER_YEAR) return 'yearly_limit';
  for (const l of active) if (!(e < l.start_date || s > l.end_date)) return 'overlap';
  return null;
}

export const LEAVE_ERROR_TEXT: Record<string, { ko: string; en: string }> = {
  bad_date:         { ko: '날짜 형식이 맞지 않습니다 (YYYY-MM-DD).', en: 'Dates must be YYYY-MM-DD.' },
  end_before_start: { ko: '끝나는 날이 시작일보다 앞입니다.',         en: 'End date is before the start date.' },
  too_long:         { ko: '휴원은 한 번에 최대 4주(28일)입니다.',     en: 'A leave can be at most 4 weeks (28 days).' },
  yearly_limit:     { ko: '최근 1년 동안 휴원을 이미 3번 했습니다.',  en: 'This student already took 3 leaves in the past year.' },
  overlap:          { ko: '이미 등록된 휴원 기간과 겹칩니다.',        en: 'This overlaps an existing leave.' },
};
