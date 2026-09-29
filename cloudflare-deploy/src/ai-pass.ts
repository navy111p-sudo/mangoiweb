// ═══════════════════════════════════════════════════════════════════════
// 🤖 A.i 콘텐츠 이용권(ai_content) — «끝나는 날» 과 «매달 자동결제» 의 계산 정본 (2026-09-29)
//
// [왜 따로 두나] 수업 자동연장(api-pay.ts 의 autoRenewQuote)은 «지금 듣는 수업의 요일·시간·선생님»
//   을 이어받는 계산이라 수업이 없는 A.i 단독 학생에게는 답이 없다. 그 경로에 이 학생의 구독을 태우면
//   견적이 실패해 **구독이 스스로 해지된다**(chargeSubscriptionOnceInner 의 첫 분기). 그래서 plan 으로
//   갈라 이 파일의 규칙을 쓴다.
//
// [끝나는 날] 결제한 순간부터 1달. 이미 쓰고 있는 이용권이 남아 있으면 **그 끝에 이어 붙인다** —
//   남은 날을 버리면 미리 결제한 학부모가 그만큼 손해를 본다.
//   달력 기준(한국 시각)으로 더하고, 없는 날은 그 달 마지막 날로 당긴다(1/31 → 2/28·2/29).
//
// [다음 자동결제] 끝나는 날 3일 전(수업 자동연장과 같은 규칙 — D-3 사전고지 문자가 나갈 틈).
//   그 시각이 이미 지났으면 3일 뒤로 민다(사전고지 없이 청구하지 않는다).
//   이어 붙이기 때문에 3일 먼저 결제해도 이용 기간이 줄지 않는다.
// ═══════════════════════════════════════════════════════════════════════

/** subscriptions.plan 값이자 PRICES 의 상품 키. */
export const AI_PASS_PLAN = 'ai_content';
/** enrollments.package 에 적히는 이름 — 정본은 api-pay.ts PRICES.ai_content.name 이고 둘이 같은지 하니스가 대조한다
 *  (api-pay-refund.ts 는 api-pay.ts 를 import 할 수 없어 여기서 받는다 — 순환). */
export const AI_PASS_PKG_NAME = 'AI 콘텐츠 전용 (1개월)';
/** 한 번 결제로 늘어나는 달 수. */
export const AI_PASS_MONTHS = 1;
/** subscriptions 조회에서 «수업 자동연장» 만 고를 때 쓰는 조건 조각(plan 이 비어 있는 옛 행은 수업 쪽). */
export const NOT_AI_PASS_PLAN_SQL = `COALESCE(plan,'') <> 'ai_content'`;

const KST = 9 * 3600 * 1000;
const DAY = 86400 * 1000;

/** 한국 시각 달력으로 months 달을 더한다(시·분은 그대로). 없는 날은 그 달 마지막 날. */
export function addMonthsKst(baseMs: number, months: number): number {
  const d = new Date(Number(baseMs) + KST);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const tm = m + Math.trunc(Number(months) || 0);
  const lastDay = new Date(Date.UTC(y, tm + 1, 0)).getUTCDate();
  const t = Date.UTC(y, tm, Math.min(day, lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
  return t - KST;
}

/** 이번 결제로 늘어나는 이용 기간 { start, end }. curEndMs 가 아직 안 지났으면 거기서부터 이어 붙인다. */
export function aiPassPeriod(nowMs: number, curEndMs: number | null | undefined, months = AI_PASS_MONTHS): { start: number; end: number } {
  const cur = Number(curEndMs);
  const start = Number.isFinite(cur) && cur > nowMs ? cur : nowMs;
  return { start, end: addMonthsKst(start, months) };
}

/** 다음 자동결제 시각 = 끝나는 날 3일 전. 이미 지났거나 모르면 지금+3일(사전고지가 먼저 나가게). */
export function aiPassNextBilling(endMs: number | null | undefined, nowMs: number): number {
  const e = Number(endMs);
  if (!Number.isFinite(e) || e <= 0) return nowMs + 3 * DAY;
  const t = e - 3 * DAY;
  return t > nowMs ? t : nowMs + 3 * DAY;
}

/** 이 학생의 개인 A.i 이용권이 끝나는 시각(없으면 null). package 이름은 api-pay.ts 의 PRICES 가 정본이라 인자로 받는다. */
export async function currentAiPassEnd(env: any, uid: string, pkgName: string): Promise<number | null> {
  if (!uid) return null;
  const r: any = await env.DB.prepare(
    `SELECT MAX(ended_at) AS e FROM enrollments WHERE student_user_id = ? AND package = ? AND status = 'active' AND ended_at IS NOT NULL`
  ).bind(String(uid), String(pkgName)).first();
  const e = r ? Number(r.e) : NaN;
  return Number.isFinite(e) && e > 0 ? e : null;
}
