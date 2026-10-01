/* ⏸ 「연기된 회차」 판정 정본 (2026-10-01)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 2026-10-01 Farrah(FAR) 14:00 수업을 「⏸ 연기 · 날짜 없이」로 처리했는데
        「오늘 수업」 목록이 계속 「🟢 Open · Join」으로 그렸다. 서버는 그 행을
        status='postponed' 로 바꿨는데(/api/admin/schedule-requests/decide),
        그 값을 읽는 곳이 **한 군데도 없었다** — 다들 `status != 'cancelled'` 만 봤다.
        그래서 연기한 수업도 ① 관리자·매니저·지사 「오늘 수업」 ② 학생 입장
        (/api/class/sessions/today) ③ 30분 전 알림 ④ 결석 감지에 그대로 걸렸다.
        에러는 안 난다 — 화면은 정상이고 «연기» 만 조용히 무시된다.

   [규칙] **날짜가 정해진 행(scheduled_date 있음)** 이면서 status 가 'postponed' 일 때만
          «오늘 열리지 않는 회차» 로 본다.
     ⛔ 매주 반복 행(scheduled_date 없음)에는 적용하지 않는다 — 한 행이 «매주 전부» 라
        status 하나로 거르면 그 주만이 아니라 **모든 주가 사라진다.** 서버의 연기 승인도
        반복 행은 status 를 안 바꾸고 'recorded' 로 남긴다(같은 이유). 다른 경로(AI 명령)가
        반복 행을 'postponed' 로 만들었다면 예전처럼 그대로 보인다 — 새로 잃는 것이 없다.
     ⛔ 'cancelled' 와 합치지 않는다 — 급여는 둘을 다르게 센다(postponed_pay_percent).

   [짝] 연기한 회차를 «다시 잡으면»(날짜·시각을 옮기면) status 를 'active' 로 되돌려야 한다.
        안 그러면 새 날짜에서도 숨는다. → PATCH /api/admin/class-schedules/:id 와
        /schedule-requests/decide 의 'moved' 경로가 `REACTIVATE_POSTPONED_SQL` 를 함께 돌린다.

   감시: test-harness/class_postponed_harness.mjs */

export function isPostponedOccurrence(r: any): boolean {
  if (!r) return false;
  const st = String(r.status ?? r.sched_status ?? '').trim().toLowerCase();
  if (st !== 'postponed') return false;
  return String(r.scheduled_date ?? '').trim() !== '';
}

/** 연기됐던 회차를 다시 잡을 때 «열린 수업» 으로 되돌린다(연기 상태가 아니면 아무것도 안 함). */
export const REACTIVATE_POSTPONED_SQL =
  `UPDATE class_schedules SET status = 'active' WHERE id = ? AND status = 'postponed'`;
