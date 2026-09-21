/**
 * 📅 수강신청(enrollments)마다 «그 신청이 만든 수업이 몇 건이고 몇 건이 살아 있나» 를 붙인다.
 *
 * [왜 이 파일이 생겼나 — 2026-09-21 사장님 제보]
 *   「아직도 이게 왜 나타나? 이유가 뭐지??」(학생 상세 › 주간 › 금 14:20 「체험수업」)
 *   학생 상세 화면은 **«신청서»(enrollments)** 를 보고 «매주 N요일» 카드를 그리는데,
 *   실제 수업(class_schedules)을 전부 취소해도 신청서는 `confirmed` 로 남는다
 *   — 두 표 사이에 배선이 없다. 그래서 취소한 수업이 캘린더에만 되살아났다.
 *   실측: enrollments 103 은 confirmed 인데 그것이 만든 class_schedules 2332~2335
 *   네 건이 전부 cancelled. 전수로 신청 14건 중 1건.
 *
 * [이 파일이 정본인 이유]
 *   같은 화면 안에서도 신청서를 받아 가는 통로가 **둘**이다 —
 *     · GET /api/admin/enrollments        (api-admin.ts)  → 주간·월간 캘린더
 *     · GET /api/admin/student/:uid/full  (api-mango.ts)  → 🗓️ 종료·연장 탭의 「활성 패키지」
 *   한쪽만 고치면 **같은 화면이 여전히 두 말을 한다**(실제로 처음에 그렇게 고쳤다가
 *   함정 대조가 잡았다 — 규칙서 「고쳤다를 적기 전에 부르는 곳을 «전부» 세세요」).
 *   ⛔ 이 조회를 각 파일에 복제하지 말 것.
 *
 * [계약]
 *   · 서버는 **«사실» 만** 준다(몇 건 / 그중 살아 있는 건 몇 건).
 *     숨길지 말지는 화면의 `enrCalHidden()` 한 곳이 정한다.
 *   · 못 구하면 **칸을 안 싣는다** → 화면이 예전대로 그린다(fail-open).
 *     반대로 실패했다고 숨기면 멀쩡한 수업이 사라지는데 그쪽이 훨씬 나쁘다.
 *   · 절대 던지지 않는다 — 이 값 때문에 목록 전체가 죽으면 안 된다.
 */

/** `class_schedules.source` 가 신청서를 가리킬 때 쓰는 접두사 (enroll-activate.ts 와 짝) */
export const ENROLL_SOURCE_PREFIX = 'adm-enroll:';

/**
 * ⚠️ `'adm-enroll:'` 이 11글자라 **substr(source, 12)** 부터가 신청 id 다(SQLite 는 1-based).
 *    경계를 한 칸만 틀려도 조용히 안 맞는다.
 * ⛔ `IN (?,?,…)` 목록을 만들지 말 것 — D1 바인드 100개 한도(규칙서 「새 IN (...) 목록」).
 *    콤마 문자열 **한 개**를 `instr` 로 본다.
 * ⚠️ 양쪽에 콤마를 두는 이유: 앞자리가 겹치는 신청(103 대 1031)이 서로 새지 않게.
 */
export const ENROLL_CLASS_COUNT_SQL = `SELECT substr(source, 12) AS enr_id,
        COUNT(*) AS total_n,
        SUM(CASE WHEN status = 'cancelled' THEN 0 ELSE 1 END) AS active_n
   FROM class_schedules
  WHERE source LIKE 'adm-enroll:%'
    AND instr(?, ',' || substr(source, 12) || ',') > 0
  GROUP BY source`;

/**
 * 받은 신청서 배열에 `class_total`·`class_active` 를 «있는 것만» 붙인다(제자리 수정).
 *
 * ℹ️ 성능 — `class_schedules` 는 실측 2,946행(그중 `adm-enroll:%` 304행, 2026-09-21)이라
 *    `source` 인덱스 없이 훑어도 가볍다. attendance(18만 행)와 달리 인덱스를 두지 않는다.
 *    행이 크게 늘면 그때 다시 재고 판단할 것.
 */
export async function attachEnrollmentClassCounts(env: any, items: any[]): Promise<void> {
  try {
    if (!Array.isArray(items) || !items.length) return;
    const enrIds = items.map((r: any) => String(r?.id || '')).filter(Boolean);
    if (!enrIds.length) return;
    const rs = await env.DB.prepare(ENROLL_CLASS_COUNT_SQL)
      .bind(',' + enrIds.join(',') + ',')
      .all();
    const byId = new Map<string, any>();
    for (const r of (rs.results || [])) byId.set(String(r.enr_id), r);
    for (const it of items) {
      const g = byId.get(String(it?.id));
      if (!g) continue;                       // 조회에 안 나온 신청은 칸을 안 만든다
      (it as any).class_total = Number(g.total_n) || 0;
      (it as any).class_active = Number(g.active_n) || 0;
    }
  } catch (e: any) {
    // ⛔ 던지지 않는다 — 칸이 없으면 화면이 예전대로 그린다(fail-open)
    console.warn('[enrollments] 수업 수 조회 실패 — 칸 안 실음:', e?.message);
  }
}

/**
 * 📅 그 신청서를 «화면에 그리면 안 되는가» — 판정 정본.
 *
 * ⚠️ 화면의 `enrCalHidden()`(public/admin/student.html)과 **같은 말을 해야 한다.**
 *    두 화면이 서로 다른 파일이라(admin.html 의 명부 · admin/student.html 의 상세)
 *    한 함수를 공유할 수 없어 «같은 규칙» 을 두 곳에 두고,
 *    `test-harness/enroll_calendar_cancelled_harness.mjs` 가 **둘을 나란히 돌려 답을 대조**한다.
 *    ⛔ 한쪽만 고치지 말 것.
 *
 * 규칙은 둘뿐이다 —
 *   ① 신청서 자체가 끝난 것(취소·반려·종료·만료). 모르는 상태는 **그대로 그린다.**
 *   ② 그 신청이 만든 수업이 «있었는데 전부 취소» 된 것.
 * ⛔ «수업이 0건» 을 숨김으로 읽지 말 것 — 방금 확정해 아직 수업을 안 만든 신청이 사라진다.
 * ⛔ 칸이 없으면(조회 실패·옛 응답) **안 숨긴다** — 숨기는 쪽으로 실패하면 멀쩡한 수업이 사라진다.
 * ⚠️ 그것을 실제로 막는 것은 `total > 0` 한 줄이고, 옆의 `isFinite(...)` 둘은 **지금은 일하지 않는 안전벨트** 입니다
 *    (`Number(undefined)` 는 `NaN` 이라 `NaN > 0` 이 이미 false). ⛔ «지금 일하고 있다» 고 적지 말고, 그렇다고 지우지도
 *    마세요 — 나중에 `class_total` 기본값이 0 으로 바뀌는 날 그 줄이 일합니다.
 */
export function isEnrollmentGone(enr: any): boolean {
  if (!enr) return false;
  const st = String(enr.status || '').toLowerCase().trim();
  if (st === 'cancelled' || st === 'canceled' || st === 'rejected'
      || st === 'ended' || st === 'expired') return true;
  const total = Number(enr.class_total);
  const active = Number(enr.class_active);
  if (isFinite(total) && isFinite(active) && total > 0 && active === 0) return true;
  return false;
}
