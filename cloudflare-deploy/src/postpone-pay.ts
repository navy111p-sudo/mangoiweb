/* 💰 연기 수업 지급률(%) — 강사 화면 «오늘의 수업» 연기 줄의 «Paid / Unpaid» 표시용 (2026-11-11 필리핀 매니저 maimai 요청)
   (강사 «알림» 에는 싣지 않는다 — 사장님 결정 «시간만 표시», teacher-change-alert.ts 머리말)
   ⚠️ 급여 정본은 admin-lesson-fees.ts 의 postponePct·earlyPostponePct 이고, 이 함수는 «같은 식» 이다.
      한쪽을 바꾸면 둘 다 — teacher_change_alert_harness 가 두 식을 같은 입력으로 돌려 대조한다.
   import 0 — 강사 화면 API(api-teacher.ts)도 부른다. */

/** 규칙(code → {amount, enabled}) + 요청의 fee_type('paid'=시작 30분 이내 / 'free'=그 전 / 없음) → 지급률 0~100. */
export function postponePayPercent(rules: any, feeType: string | null | undefined): number {
  const pct = (r: any) => Math.max(0, Math.min(100, Number(r.amount) || 0));
  const base = rules && rules.postponed_pay_percent;
  const basePct = base ? (base.enabled ? pct(base) : 100) : 100;   // 규칙이 없는 옛 DB = 100 (급여와 같음)
  const early = rules && rules.postponed_early_pay_percent;
  return feeType === 'free' && early && early.enabled ? pct(early) : basePct;
}

/** 급여와 같은 표(payroll_deduction_rules)에서 연기 규칙 둘만 읽는다. 못 읽으면 던진다 — 부르는 쪽이 «표시 안 함» 으로. */
export async function loadPostponePayRules(db: any): Promise<any> {
  const r: any = await db.prepare(
    `SELECT code, amount, enabled FROM payroll_deduction_rules WHERE code IN ('postponed_pay_percent','postponed_early_pay_percent')`
  ).all();
  const out: any = {};
  for (const x of ((r && r.results) || [])) out[x.code] = x;
  return out;
}
