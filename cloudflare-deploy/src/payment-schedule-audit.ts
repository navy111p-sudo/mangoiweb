/** Read-only payment/schedule reconciliation. No quota policy, repair, or schema changes.
 * Historical cancellations/makeups need human review: source row count is lineage evidence,
 * never a substitute for the session ledger's chargeable-occurrence rules.
 */
import { selectInChunks } from './d1-chunk';

export interface PaymentScheduleIssue {
  order_id: string; uid: string; student_name: string; payment_status: string;
  expected_sessions: number | null; actual_rows: number; active_rows: number;
  verified_refunded_amount: number | null; allocated_refund_amount: number;
  schedule_ids: number[]; reasons: string[];
}
export async function auditPaymentSchedules(env: any): Promise<{ issues: PaymentScheduleIssue[]; checked: number; truncated: boolean }> {
  // Audit paid and non-paid orders alike: schedules linked to a failed/cancelled order matter too.
  const orders: any = await env.DB.prepare(`SELECT order_id, uid, student_name, status, enroll_json
    FROM payment_orders WHERE enroll_json IS NOT NULL AND TRIM(enroll_json) <> ''
    ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 501`).all();
  const selected = (orders.results || []) as any[];
  const issues: PaymentScheduleIssue[] = [];
  const bySource = new Map<string, any[]>();
  const rows = await selectInChunks<any>(env.DB, selected.slice(0, 500).map(o => `enroll:${o.order_id}`),
    ph => `SELECT id, user_id, status, source FROM class_schedules WHERE source IN (${ph}) ORDER BY id`);
  for (const r of rows) {
    const list = bySource.get(String(r.source)) || [];
    list.push(r); bySource.set(String(r.source), list);
  }
  const allocated = new Map<string, Set<number>>();
  const allocatedMoney = new Map<string, number>();
  const verifiedMoney = new Map<string, number>();
  const unknownMoney = new Set<string>();
  try {
    const money = await selectInChunks<any>(env.DB, selected.slice(0,500).filter(o => o.status === 'partial_refunded').map(o => String(o.order_id)),
      ph => `SELECT order_id, refunded_amount, fail_reason FROM payment_orders WHERE order_id IN (${ph})`);
    for (const r of money) {
      verifiedMoney.set(String(r.order_id), Number(r.refunded_amount || 0));
      if (r.fail_reason === 'external_refund_amount_unknown') unknownMoney.add(String(r.order_id));
    }
    const refunds = await selectInChunks<any>(env.DB, selected.slice(0, 500).filter(o => o.status === 'partial_refunded').map(o => String(o.order_id)),
      ph => `SELECT order_id, basis, refund_amount FROM payment_refunds WHERE status='done' AND order_id IN (${ph})`);
    for (const r of refunds) {
      let basis: any; try { basis = JSON.parse(String(r.basis)); } catch { continue; }
      if (!Array.isArray(basis?.refund_schedule_ids)) continue;
      const ids = allocated.get(String(r.order_id)) || new Set<number>();
      for (const id of basis.refund_schedule_ids) if (Number.isSafeInteger(id) && id > 0) ids.add(id);
      allocated.set(String(r.order_id), ids);
      if (basis.refund_schedule_ids.length && basis.refund_schedule_ids.every((id: any) => Number.isSafeInteger(id) && id > 0))
        allocatedMoney.set(String(r.order_id), (allocatedMoney.get(String(r.order_id)) || 0) + Number(r.refund_amount || 0));
    }
  } catch { /* old stores may have no refund ledger: partial refunds remain review-needed */ }
  for (const o of selected.slice(0, 500)) {
    let ej: any; const reasons: string[] = [];
    try { ej = JSON.parse(String(o.enroll_json)); } catch { reasons.push('invalid_enrollment_snapshot'); }
    const expected = Number(ej?.sessions);
    if (!Number.isInteger(expected) || expected <= 0) reasons.push('invalid_session_count');
    if (ej && String(ej.uid || '') !== String(o.uid || '')) reasons.push('order_enrollment_student_mismatch');
    const schedules = bySource.get(`enroll:${o.order_id}`) || [];
    const active = schedules.filter(r => String(r.status || 'active') === 'active').length;
    if (schedules.some(r => String(r.user_id || '') !== String(o.uid || ''))) reasons.push('schedule_student_mismatch');
    if (o.status === 'paid' && Number.isInteger(expected) && expected > 0 && schedules.length !== expected)
      reasons.push(schedules.length === 0 ? 'paid_without_schedules' : 'schedule_count_mismatch_review');
    if (['pending', 'failed', 'await_deposit'].includes(String(o.status)) && schedules.length)
      reasons.push('unpaid_order_has_schedules');
    if (['cancelled', 'refunded'].includes(String(o.status)) && active)
      reasons.push('cancelled_order_has_active_schedules');
    // Partial-refund allocation is not guessed; the administrator must check the agreed quota.
    if (o.status === 'partial_refunded') {
      const ids = allocated.get(String(o.order_id));
      const accounted = ids && ids.size > 0 && [...ids].every(id => schedules.some(r => Number(r.id) === id && r.status === 'cancelled'));
      if (!accounted) reasons.push('partial_refund_quota_review');
      if (unknownMoney.has(String(o.order_id)) || !verifiedMoney.has(String(o.order_id)) ||
          (allocatedMoney.get(String(o.order_id)) || 0) !== verifiedMoney.get(String(o.order_id)))
        reasons.push('unallocated_refund_amount_review');
    }
    if (reasons.length) issues.push({ order_id: String(o.order_id), uid: String(o.uid || ''),
      student_name: String(o.student_name || ''), payment_status: String(o.status),
      expected_sessions: Number.isInteger(expected) && expected > 0 ? expected : null,
      actual_rows: schedules.length, active_rows: active,
      verified_refunded_amount: verifiedMoney.get(String(o.order_id)) ?? null, allocated_refund_amount: allocatedMoney.get(String(o.order_id)) || 0, schedule_ids: schedules.map(r => Number(r.id)), reasons });
  }
  return { issues, checked: Math.min(selected.length, 500), truncated: selected.length > 500 };
}
