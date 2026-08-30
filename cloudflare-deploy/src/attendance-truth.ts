/* attendance-truth.ts — 「출석 몇 번 했나」 판정 정본 (2026-08-30, v4 제안서 02)
 * ═══════════════════════════════════════════════════════════════════════════
 * [왜 만들었나] 마이페이지 출석률이 «출석 기록이 있는데도 0%» 로 나온다는 제보.
 *   원인을 코드 추측이 아니라 **운영 D1 실측**으로 확인했다(2026-08-30, SELECT 만):
 *
 *     attendance 전체 181,983행의 status 분포
 *       present  121,735   ← 실제 입장(카페24 동기화 class_state=2 포함)
 *       scheduled 58,246   ← «아직 안 한 예약». joined_at 이 미래다(최대 2030-02-20)
 *       left       1,893   ← 퇴장 기록이 남은 실제 입장
 *       attended     109   ← 예약 수업 «시간 안» 입장으로 확정된 행
 *
 *   ⟹ ① 「제시간율」이 `status='attended'` 하나로만 세어져 있었다. 그 값은 전체의
 *        **0.06%** 다. 최근 30일 출석 상위 학생들(18일 출석)조차 attended 가 **0건**이라
 *        분자가 늘 0 → 화면은 언제나 «0%». 화면이 «측정 실패» 를 «성적 0» 으로 말하고 있었다.
 *      ② 반대로 「출석 일수」에는 **미래 예약(scheduled)까지** 들어갔다. `joined_at >= since`
 *        는 미래 방향으로도 참이라 아직 오지 않은 수업이 출석으로 잡힌다.
 *        (같은 함정을 /api/dashboard 는 2026-08-15 에 이미 NOT_SCHEDULED 로 막아 두었다.)
 *
 * [무엇을 정본으로 삼나]
 *   · 출석한 날      = status 가 'scheduled' 가 **아니고**, joined_at 이 **지금 이전**인 날
 *   · 예정된 수업날  = 지금 이전의 모든 행(예약 포함) — 출석률의 분모
 *   · 출석률(%)      = 출석한 날 ÷ 예정된 수업날. 분모가 0이면 **null**(«—» 로 그린다)
 *   · 제시간 입장    = attended_at 이 있거나 status='attended' 인 날.
 *                     ⚠️ 카페24 동기화 행에는 attended_at 이 아예 없다 — 그런 학생은
 *                        «잴 수 없음»(null)이지 «0%» 가 아니다. 지어내지 않는다
 *                        (CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」).
 *
 * ⛔ 이 규칙을 화면이나 다른 파일에 복제하지 말 것. 복제하면 「화면마다 답이 다른」 사고가 난다.
 */

/** 「실제로 일어난 출석」 조건 — 미래 예약(scheduled)과 아직 오지 않은 행을 뺀다. */
export const ATT_REAL_COND = `COALESCE(status,'') <> 'scheduled' AND joined_at <= ?`;

/** 「예정까지 포함하되 미래는 뺀」 조건 — 출석률의 분모. */
export const ATT_DUE_COND = `joined_at <= ?`;

export interface AttendanceSummary {
  /** 실제로 출석한 날 수 (기존 키 이름 유지 — 화면 호환) */
  last_30d_days: number;
  /** 그 기간에 예정돼 있던 수업 날 수 (분모) */
  scheduled_days: number;
  /** 출석률 % — 분모가 0이면 null(«—») */
  attendance_rate: number | null;
  /** 입장 시각이 남아 «제시간 판정이 가능한» 날 수 */
  on_time_measurable_days: number;
  /** 그중 수업 시간 안에 들어온 날 수 */
  on_time_days: number;
  /** 제시간율 % — 잴 수 있는 날이 0이면 null(«—») */
  on_time_rate: number | null;
  /** 출석한 날짜(YYYY-MM-DD) 오름차순 — 30일 그리드용 */
  days: string[];
}

export function summarizeAttendance(
  rows: Array<{ date?: any; status?: any; attended_at?: any; joined_at?: any }>,
  nowMs: number = Date.now()
): AttendanceSummary {
  const due = new Set<string>();
  const real = new Set<string>();
  const measurable = new Set<string>();
  const onTime = new Set<string>();

  for (const r of rows || []) {
    const d = r && r.date ? String(r.date) : '';
    if (!d) continue;
    const joined = Number(r.joined_at);
    if (Number.isFinite(joined) && joined > nowMs) continue;   // 아직 오지 않은 수업
    due.add(d);
    const st = String(r.status || '');
    if (st === 'scheduled') continue;
    real.add(d);
    // 제시간 판정은 «입장 시각이 남은 행» 에서만 할 수 있다
    if (r.attended_at != null || st === 'attended') { measurable.add(d); onTime.add(d); }
  }

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  return {
    last_30d_days: real.size,
    scheduled_days: due.size,
    attendance_rate: pct(real.size, due.size),
    on_time_measurable_days: measurable.size,
    on_time_days: onTime.size,
    on_time_rate: pct(onTime.size, measurable.size),
    days: Array.from(real).sort(),
  };
}
