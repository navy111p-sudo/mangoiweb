/* ═══════════════════════════════════════════════════════════════════════
   🧹 지난 «대기» 연기·변경 요청 자동 정리 (2026-11-02 사장님)
   ───────────────────────────────────────────────────────────────────────
   [왜] 「연기·변경 요청은 승인 자체가 필요 없어」 — 학생·강사 요청은 접수 즉시 반영되고,
        관리자 창은 누르면 바로 반영된다. 그래도 «못 옮긴» 요청(겹침·담당 아님 등)은 대기로 남는데,
        원래 수업 시각이 지나면 그 요청은 더 이상 반영할 수 없어 대기열에만 영영 쌓였다
        (2026-11-02 화면: 10/22·10/23 요청 3건이 «대기 3» 으로 남아 있었다).
   [무엇] 원래 수업 시각(KST)이 지난 «pending» 요청을 'rejected' + decided_by «자동정리(수업 시각 지남)» 로 닫는다.
        ⛔ 새 상태값('expired')을 만들지 않는다 — 요청 목록·매니저 화면·연기 현황이 모르는 값이 된다.
           'rejected' 는 «반영 안 됨» 이라 뜻이 맞고, 누가 닫았는지는 decided_by·decide_memo='expired' 로 가른다.
        ⛔ 수업표(class_schedules)는 건드리지 않는다 — 요청만 닫는다.
        ⛔ 원래 일시를 모르는 요청(orig_date 없음)은 안 건드린다(모르면 그대로).
   ⛔ 이 함수는 던지지 않는다 — 15분 감시견에 얹혀 돈다(함께 죽이면 안 된다).
   ═══════════════════════════════════════════════════════════════════════ */

export const EXPIRE_DECIDER = '자동정리(수업 시각 지남)';

/** KST «YYYY-MM-DD HH:MM» — 순수 함수(하니스가 시각을 넣어 돌린다). */
export function kstStamp(nowMs: number): string {
  const d = new Date(nowMs + 9 * 3600 * 1000).toISOString();
  return d.slice(0, 10) + ' ' + d.slice(11, 16);
}

/* 원래 수업 시작(KST) 문자열 — 날짜의 '/' 는 '-' 로, 시각이 없으면 그날 23:59 로 본다(하루가 다 지나야 닫음). */
export const EXPIRE_SQL =
  `UPDATE schedule_change_requests
      SET status = 'rejected', decided_by = ?, decided_at = ?, decide_memo = 'expired'
    WHERE status = 'pending'
      AND orig_date IS NOT NULL AND TRIM(orig_date) <> ''
      AND (replace(substr(TRIM(orig_date), 1, 10), '/', '-') || ' ' || COALESCE(NULLIF(substr(TRIM(COALESCE(orig_time, '')), 1, 5), ''), '23:59')) < ?`;

export async function runScheduleRequestExpire(env: any, nowMs: number = Date.now()): Promise<{ ok: boolean; closed: number; error?: string }> {
  try {
    const r: any = await env.DB.prepare(EXPIRE_SQL).bind(EXPIRE_DECIDER, nowMs, kstStamp(nowMs)).run();
    return { ok: true, closed: Number(r?.meta?.changes || 0) };
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/no such table/i.test(msg)) return { ok: true, closed: 0 };   // 아직 요청이 한 번도 없던 DB
    return { ok: false, closed: 0, error: msg };
  }
}
