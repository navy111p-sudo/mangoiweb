/* ═══════════════════════════════════════════════════════════════════════════
   📊 경영 지표의 «분모» 와 «기간» 정본 (2026-10-13)

   왜 만들었나 — 경영 지표 화면이 이렇게 말하고 있었다(2026-10-13 사장님 화면):
     활동 학생 28,825명 · 미납 28,771명(99.8%) · 2주+ 결석 2,806명 ·
     이번 달 매출 −80.1% · 이번 달 출석 −85.7% · AI 브리핑 「123명 중 28825명이 출석」
   원인 셋:
     ① «활동 학생» = students_erp 명부 전체(카페24가 밀어 넣는 29,553행). 실제로 수업이
        있는 학생은 545명이다(2026-10-13 운영 D1 실측, 아래 정의).
     ② «미납» = 그 명부에서 «35일 안에 결제 기록이 없는 사람». 그런데 우리 결제표
        (student_payments)에 결제가 들어오는 학생 자체가 적어서(카페24·대리점 수납은 안 들어옴)
        «결제 기록 없음» 이 «안 냄» 이 아니다. → 결제 기록이 «한 번이라도 있는» 활동 학생만 센다
        (/api/admin/payments/notify-all-overdue 가 2026-08-17 에 이미 그 원칙을 정했다).
     ③ 이번 달(13일치)을 지난달 «한 달 전체» 와 비교 → 매달 초 늘 빨간불. → 지난달 «같은 날수».

   ⛔ 이 파일의 SQL 을 다른 곳에 복제하지 마세요 — KPI 대시보드와 아침 브리핑이 같은 것을 씁니다.
   ⚠️ 활동 학생 정의 (최근 30일, 셋 중 하나라도):
      ⓐ 살아 있는 수업 예약(class_schedules, LMS·시드 자리표시 제외) — 날짜가 30일 안·미래이거나 매주 반복
      ⓑ 카페24 예약 씨앗(attendance 의 c24-* 방) — 30일 안 ~ 내일까지
      ⓒ 실제 화상방 접속(attendance.account_uid + last_seen_at > 0)
   ⚠️ 출석 «회수» 는 attendance 를 (계정, 날짜)로 센다. 카페24 씨앗은 «예약» 이라 결석도 섞일 수
      있어서 화면에서는 «출석» 이 아니라 «수업 기록» 이라고 부른다(측정하지 않은 것을 지어내지 않는다).
   ═══════════════════════════════════════════════════════════════════════════ */

export const ACTIVE_WINDOW_DAYS = 30;
export const OVERDUE_GRACE_DAYS = 35;
export const ABSENT_DAYS = 14;
/** 이 정의가 바뀌면 올린다 — 옛 정의로 만든 브리핑을 «그대로 돌려주지» 않게 하는 표식 */
export const KPI_DEF_VERSION = 'v2';

const KST = 9 * 3600000;
const DAY = 86400000;

/** KST 기준 이번 달·지난달 경계와 «지난달 같은 기간» 끝. 모두 UTC ms. */
export function kstMonthBounds(now: number) {
  const k = new Date(now + KST);
  const y = k.getUTCFullYear(), m = k.getUTCMonth();
  const thisStart = Date.UTC(y, m, 1) - KST;
  const thisEnd = Date.UTC(y, m + 1, 1) - KST;
  const lastStart = Date.UTC(y, m - 1, 1) - KST;
  const elapsed = Math.max(0, now - thisStart);
  const lastSameEnd = Math.min(lastStart + elapsed, thisStart);
  const elapsedDays = Math.max(1, Math.ceil(elapsed / DAY));
  return { thisStart, thisEnd, lastStart, lastEnd: thisStart, lastSameEnd, elapsedDays };
}

/** KST 날짜 문자열(YYYY-MM-DD) */
export function kstDateStr(ms: number): string {
  return new Date(ms + KST).toISOString().slice(0, 10);
}

/** KST 자정(UTC ms) */
export function kstMidnight(ms: number): number {
  return Date.parse(kstDateStr(ms) + 'T00:00:00Z') - KST;
}

/** «활동 학생» CTE — `WITH ${ACTIVE_CTE} …` 로 쓰고 바인드는 activeBinds(now) 를 «맨 앞에» */
export const ACTIVE_CTE = `act(u) AS (
    SELECT user_id FROM class_schedules
     WHERE status = 'active'
       AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed','')
       AND (scheduled_date >= ? OR scheduled_date IS NULL OR scheduled_date = '')
    UNION
    SELECT user_id FROM attendance
     WHERE room_id LIKE 'c24-%' AND joined_at >= ? AND joined_at < ?
    UNION
    SELECT account_uid FROM attendance
     WHERE account_uid IS NOT NULL AND account_uid <> '' AND joined_at >= ? AND last_seen_at > 0
  )`;

export function activeBinds(now: number): any[] {
  const c30 = now - ACTIVE_WINDOW_DAYS * DAY;
  return [kstDateStr(c30), c30, kstMidnight(now) + 2 * DAY, c30];
}

/** 활동 학생 수. erpScope 는 scopeFragments().erpScope (students_erp 별칭 없이) */
export function activeCountSql(erpScope = ''): string {
  return `WITH ${ACTIVE_CTE}
    SELECT COUNT(*) AS n FROM students_erp WHERE user_id IN (SELECT u FROM act)${erpScope}`;
}

/** 미납: 결제 기록이 «한 번이라도 있는» 활동 학생 중 마지막 결제가 35일 넘은 사람.
 *  바인드: activeBinds(now), cutoff35, ...scopeBinds
 *  ⚠️ 결제표를 먼저 GROUP BY 로 한 번 묶는다 — 학생마다 상관 서브쿼리로 뒤지면
 *     운영 D1 에서 490만 행을 읽었다(2026-10-13 실측, 묶으면 4.7만 행 · 답 동일 145/91).
 *  ⚠️ JOIN 대신 IN — erpScope 의 별칭 없는 칸(user_id 등)이 ambiguous 로 죽지 않게. */
export function overdueSql(erpScope = ''): string {
  return `WITH ${ACTIVE_CTE},
    pay(pu, lp) AS (SELECT user_id, MAX(paid_at) FROM student_payments WHERE status = 'paid' GROUP BY user_id)
    SELECT COUNT(*) AS paid_ever, IFNULL(SUM(CASE WHEN lp < ? THEN 1 ELSE 0 END),0) AS overdue
      FROM pay WHERE pu IN (SELECT user_id FROM students_erp WHERE user_id IN (SELECT u FROM act)${erpScope})`;
}

/** 2주+ 수업 기록 없음: 활동 학생 중 최근 14일(~지금) attendance 가 한 줄도 없는 사람.
 *  바인드: activeBinds(now), now-14d, now, ...scopeBinds */
export function absentSql(erpScope = ''): string {
  return `WITH ${ACTIVE_CTE}
    SELECT COUNT(*) AS n FROM students_erp
     WHERE user_id IN (SELECT u FROM act)${erpScope}
       AND user_id NOT IN (
         SELECT COALESCE(NULLIF(account_uid,''), user_id) FROM attendance
          WHERE joined_at >= ? AND joined_at <= ?
            AND COALESCE(NULLIF(account_uid,''), user_id) IS NOT NULL)`;
}

/** 기간 안의 수업 기록(학생·날짜 한 번). 바인드: from, to, ...scopeBinds */
export function classDaysSql(erpScope = ''): string {
  return `SELECT COUNT(*) AS n FROM (
      SELECT DISTINCT COALESCE(NULLIF(account_uid,''), user_id) AS x, date FROM attendance
       WHERE joined_at >= ? AND joined_at < ? AND COALESCE(role,'student') = 'student'
    ) WHERE x IN (SELECT user_id FROM students_erp WHERE 1=1${erpScope})`;
}

/** 어제(날짜) 수업 기록이 있는 활동 학생 수. 바인드: activeBinds(now), dateStr */
export const ATTENDED_ON_DATE_SQL = `WITH ${ACTIVE_CTE}
    SELECT COUNT(DISTINCT x) AS n FROM (
      SELECT COALESCE(NULLIF(account_uid,''), user_id) AS x FROM attendance WHERE date = ?
    ) WHERE x IN (SELECT u FROM act)`;

/** 같은 기간끼리의 증감률(소수 1자리). 비교 대상이 0 이면 null(= «비교 불가», 100% 로 지어내지 않음) */
export function trendPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** 브리핑 숫자 상식 검사 — 걸리면 AI 에 넘기지 않는다(틀린 숫자를 AI 가 사실처럼 말한 전력). */
export function briefingSanity(s: { active_students: number; overdue_count: number; at_risk_count: number; attended_yesterday: number }): string[] {
  const bad: string[] = [];
  if (!(s.active_students > 0)) bad.push('활동 학생 0명');
  if (s.overdue_count > s.active_students) bad.push('미납이 활동 학생보다 많음');
  if (s.at_risk_count > s.active_students) bad.push('결석이 활동 학생보다 많음');
  if (s.attended_yesterday > s.active_students) bad.push('어제 수업 학생이 활동 학생보다 많음');
  return bad;
}
