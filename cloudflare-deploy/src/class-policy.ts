/**
 * class-policy.ts — 수업 공통 정책 상수 (2026-07-23 / 2026-08-17 개편)
 *   기본 수업 길이는 영어·중국어 모두 20분입니다(사장님 확정 2026-07-23).
 *   ⚠️ 이 값을 파일마다 복사해 두면 반드시 어긋납니다. 반드시 여기서 import 하세요.
 *   ⚠️ 운영 DB 의 class_schedules 는 예전 스키마(DEFAULT 30)로 이미 만들어져 있습니다.
 *      따라서 INSERT 에서 duration_min 을 생략하면 30 이 들어갑니다 — 반드시 명시하세요.
 *
 * ── (2026-08-17) 30분 수업 추가 — «A안: 10분 격자 · 20/30/40분» 확정 ──────────
 *   왜 10분 격자인가 —
 *     20·30·40 이 전부 10 의 배수라, 수업을 이어 붙이면 강사 시간표에 빈틈이 «0» 이다.
 *     빈틈은 «길이를 섞어서» 생기는 게 아니라 «격자를 크게 잡아서» 생긴다.
 *     (30분 격자로 고정하면 20분 수업이 30분 자리를 먹어 19% 를 버린다 — 실측)
 *   왜 25분을 빼 두었나 —
 *     25 는 10 의 배수가 아니라, 넣는 순간 격자를 5분으로 내려야 한다. 그러면
 *     주간 스케줄 화면의 칸이 시간당 6칸 → 12칸으로 촘촘해져 관리자 오조작이 는다.
 *     «20분은 짧고 30분은 부담» 은 25분 없이도 풀린다 —
 *     주3회×20분(월 18만) = 주2회×30분(월 18만) 으로 값이 정확히 같기 때문이다.
 */

/** 기본 수업 길이(분) */
export const DEFAULT_CLASS_MINUTES = 20;

/**
 * 🔌 25분 수업 스위치 — 지금은 꺼 둔다.
 *   ⚠️ 켤 때 반드시 함께 해야 하는 것:
 *     ① 이 값을 true 로 (그러면 격자가 자동으로 5분으로 내려간다)
 *     ② public/admin/weekly-schedule.html 의 SLOT_STEP 을 5 로
 *        (그 파일의 격자는 화면 렌더링이라 여기서 못 가져간다)
 *     ③ test-harness/schedule_10min_manager_harness.mjs 의 기대값(10분·6칸)도 함께
 *     ④ public/js/adm-core.js 의 `classMinOptionsList` (수강신청 등록 표의 「수업 시간」 칸)
 *        — 화면 코드라 이 상수를 import 할 수 없어 «같은 말» 을 손으로 적어 둔 자리다.
 *        여기만 켜면 서버는 25 를 받는데 화면에는 25 가 없어, 아무도 못 고르는 값이 된다.
 *        (그 짝이 어긋나면 test-harness/enroll_class_minutes_harness.mjs ① 이 FAIL 낸다)
 *   한 달 시범 뒤 «30분은 너무 길다» 는 소리가 실제로 나오면 그때 켠다.
 */
export const ENABLE_25MIN: boolean = false;

/**
 * 예약 시작 시각 격자(분).
 *   모든 수업 길이가 이 값의 배수여야 이어 붙였을 때 빈틈이 0 이 된다.
 */
export const CLASS_TIME_STEP_MIN: number = ENABLE_25MIN ? 5 : 10;

/** 선택 가능한 수업 길이 (짧은 것부터) */
export const ALLOWED_CLASS_MINUTES: number[] = ENABLE_25MIN ? [20, 25, 30, 40] : [20, 30, 40];

/**
 * 수업 길이 요금 배수 = 길이 ÷ 기본길이. 즉 «분에 정확히 비례».
 *   20분 1.0 / 25분 1.25 / 30분 1.5 / 40분 2.0 → 어느 길이든 분당 단가가 같다.
 *
 *   ⛔ 여기서 «조금 깎아 주기» 를 하면 그 순간 손해로 바뀐다.
 *      강사 1시간 매출 = (60÷길이)명 × 회당단가 인데, 배수가 정비례일 때만 길이와
 *      무관하게 일정하다. 30분을 1.5 가 아니라 1.4 로 두면 강사 시간당 매출 −7%,
 *      1.25 로 두면 −17% 다. 강사가 부족한 상황에서는 그대로 매출 감소다.
 *      할인은 «길이» 가 아니라 «기간»(6개월 5% · 12개월 10%) 으로만 한다.
 *
 *   ⚠️ 수업료(enroll-ops)와 강사료(api-admin 급여)가 반드시 같은 배수를 써야 한다.
 *      한쪽만 바꾸면 강사가 30분을 가르치고 20분 값을 받는다.
 */
export function classLengthMultiplier(minutes: number): number {
  const m = Number(minutes) > 0 ? Number(minutes) : DEFAULT_CLASS_MINUTES;
  return m / DEFAULT_CLASS_MINUTES;
}

/**
 * 급여 계산용 «10분 토막» 개수 — teachers.rate_per_10min_php 와 곱하는 단위.
 *   20분=2 · 30분=3 · 40분=4. 예전 급여식이 쓰던 «class_count × 2» 의 2 가 이 값이고,
 *   그것은 «모든 수업이 20분» 이라는 가정이었다.
 */
export function classTenMinUnits(minutes: number): number {
  const m = Number(minutes) > 0 ? Number(minutes) : DEFAULT_CLASS_MINUTES;
  return m / 10;
}

/** 고를 수 있는 길이인가 */
export function isAllowedClassMinutes(minutes: any): boolean {
  return ALLOWED_CLASS_MINUTES.includes(Number(minutes));
}

/**
 * 「긴 수업」 = 기본 길이(20분)를 넘는 수업. 30분·40분이 여기 해당한다.
 *   ⚠️ 정원제가 30분만 세면 40분이 그대로 빠져나간다 — 강사 시간을 먹는 건 똑같으므로
 *      «기본보다 긴 수업» 을 하나로 묶어 센다.
 */
export function isLongClass(minutes: any): boolean {
  return Number(minutes) > DEFAULT_CLASS_MINUTES;
}

/**
 * 🪑 강사 1인당 «하루에 받을 수 있는 긴 수업» 기본 정원.
 *   0 = 무제한(=지금까지의 동작). 강사별 값은 teacher_pricing.long_class_daily_cap 이
 *   정본이고, 거기에 값이 없을 때 이 기본값을 쓴다.
 *
 *   왜 필요한가 — 강사가 적은데 30분을 무제한으로 열면 한 강사의 하루가 긴 수업으로
 *   차서 20분 학생이 들어갈 자리가 사라진다. 「빈틈」이 아니라 「자리 부족」 문제라
 *   격자로는 못 막고 정원으로 막아야 한다.
 *
 *   ⛔ 기본값을 0 이 아닌 수로 바꾸면 «설정한 적 없는 모든 강사» 에게 일제히 적용된다.
 *      운영 중에 바꾸려면 강사별 값으로 넣을 것.
 */
export const DEFAULT_LONG_CLASS_DAILY_CAP = 0;

/** 정원 판정 — cap 이 0 이하이면 무제한 */
export function longClassCapReached(currentCount: number, cap: number): boolean {
  const c = Number(cap);
  if (!(c > 0)) return false;
  return Number(currentCount) >= c;
}
