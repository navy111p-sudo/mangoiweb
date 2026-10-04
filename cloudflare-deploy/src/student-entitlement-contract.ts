/**
 * PROPOSED CONTRACT ONLY. Imported by offline tests, not routes, billing or cron.
 * No DB / auth / provider calls. Existing diagnostic/roster classification stays intact.
 * All times are UTC epoch milliseconds; end bounds are exclusive. Identity and
 * payment/schedule evidence MUST be resolved by a trusted server adapter first.
 */
import { addMonthsKst } from './ai-pass';

export type EntitlementProduct = 'paid_ai' | 'video_bundle';
export interface PaymentOrigin {
  id: string;
  studentUid: string;
  sourceSystem: 'payment_orders' | 'cafe24_verified' | 'b2b_verified';
  sourceRef: string;
  lineRef: string;
  evidenceRef: string;
  product: EntitlementProduct;
  currency: 'KRW';
  expectedAmount: number;
  paidAmount: number;
  settledAt: number;
  settlementStatus: 'paid';
}
export interface EntitlementClass {
  id: string; // Stable purchased lesson occurrence, not the movable schedule row.
  scheduleId: string;
  startAt: number;
  endAt: number;
  state: 'scheduled' | 'completed' | 'refunded';
  revision: number;
  makeupApprovalRef?: string;
}
export interface PaidAiGrant {
  id: string;
  originId: string;
  purchasedMs: number;
  remainingMs: number;
  revoked: boolean;
}
export interface VideoGrant {
  id: string;
  originId: string;
  startsAt: number;
  classes: EntitlementClass[];
  revoked: boolean;
}
export interface RefundRecord {
  id: string;
  originId: string;
  amount: number;
  at: number;
  classIds: string[];
  mode: 'full' | 'unused_classes';
  evidenceRef: string;
}
export interface EntitlementState {
  version: 1;
  studentUid: string;
  revision: number;
  clock: number;
  origins: PaymentOrigin[];
  paidAi: PaidAiGrant[];
  video: VideoGrant[];
  refunds: RefundRecord[];
}
export interface Transition { type: string; at: number; originId?: string; details?: Record<string, unknown> }
interface Envelope { id: string; studentUid: string; at: number; expectedRevision: number }
export type EntitlementCommand = Envelope & (
  { type: 'grant_paid_ai'; origin: PaymentOrigin; months: number } |
  { type: 'grant_video'; origin: PaymentOrigin; paidClassCount: number; classes: EntitlementClass[] } |
  { type: 'move_class'; originId: string; classId: string; expectedClassRevision: number;
    scheduleId: string; startAt: number; endAt: number; approvalRef: string; makeup: boolean } |
  { type: 'complete_class'; originId: string; classId: string; expectedClassRevision: number } |
  { type: 'refund'; originId: string; refundId: string; amount: number; mode: 'full' | 'unused_classes';
    classIds: string[]; evidenceRef: string;
    unusedEvidence?: Array<{ classId: string; classRevision: number; checkedAt: number; hasStudentAttendance: boolean; reservationRef: string }> } |
  { type: 'cancel_origin'; originId: string; evidenceRef: string } |
  { type: 'reconcile' }
);
export class EntitlementContractError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; this.name = 'EntitlementContractError'; }
}
function requireThat(ok: unknown, code: string): asserts ok {
  if (!ok) throw new EntitlementContractError(code);
}
function textValue(v: unknown): v is string { return typeof v === 'string' && !!v.trim() && v === v.trim() && v.length <= 300; }
function integer(v: unknown, min = 0): v is number { return Number.isSafeInteger(v) && Number(v) >= min; }
function time(v: unknown): v is number { return integer(v) && Number.isFinite(new Date(Number(v)).valueOf()); }
function copy<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
export function newEntitlementState(studentUid: string, at = 0): EntitlementState {
  requireThat(textValue(studentUid) && time(at), 'invalid_subject');
  return { version: 1, studentUid, revision: 0, clock: at, origins: [], paidAi: [], video: [], refunds: [] };
}
function freeEnd(v: VideoGrant): number {
  return Math.max(v.startsAt, ...v.classes.filter(c => c.state !== 'refunded').map(c => c.endAt));
}
function activeVideos(s: EntitlementState, at: number): VideoGrant[] {
  return s.video.filter(v => !v.revoked && v.startsAt <= at && freeEnd(v) > at);
}
function availablePaid(s: EntitlementState): PaidAiGrant[] { return s.paidAi.filter(g => !g.revoked && g.remainingMs > 0); }
function mode(s: EntitlementState, at: number): string {
  return activeVideos(s, at).length ? 'video_included' : availablePaid(s).length ? 'paid_ai' : 'none';
}
function modeEvent(events: Transition[], before: string, after: string, at: number) {
  if (before !== after) events.push({ type: 'access_mode_changed', at, details: { before, after } });
}
/** Consume paid time only outside the union of video benefits, even if the next
 * reconciliation is weeks late. Purchases are FIFO; multiple paid grants do not
 * run down simultaneously. This is duration accounting, not AI usage metering. */
function advance(s: EntitlementState, to: number, events: Transition[]) {
  requireThat(time(to) && to >= s.clock, 'backdated_event_requires_reconciliation');
  const points = [...new Set([s.clock, to, ...s.video.filter(v => !v.revoked).flatMap(v => [v.startsAt, freeEnd(v)])])]
    .filter(n => n >= s.clock && n <= to).sort((a, b) => a - b);
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i], end = points[i + 1];
    if (!activeVideos(s, from).length) {
      let elapsed = end - from, cursor = from;
      for (const g of availablePaid(s)) {
        const used = Math.min(elapsed, g.remainingMs);
        if (used) {
          g.remainingMs -= used; elapsed -= used; cursor += used;
          events.push({ type: 'paid_time_consumed', at: cursor, originId: g.originId, details: { milliseconds: used } });
          if (!g.remainingMs) events.push({ type: 'paid_ai_exhausted', at: cursor, originId: g.originId });
        }
        if (!elapsed) break;
      }
    }
    if (activeVideos(s, end - 1).length && !activeVideos(s, end).length) {
      events.push({ type: 'included_ai_ended', at: end });
      if (availablePaid(s).length) events.push({ type: 'paid_ai_resumed', at: end });
    }
    // State snapshot records exact balances; events above explain each change.
  }
  s.clock = to;
}
function validateOrigin(s: EntitlementState, o: PaymentOrigin, product: EntitlementProduct, at: number) {
  requireThat(o && textValue(o.id) && textValue(o.sourceRef) && textValue(o.lineRef) && textValue(o.evidenceRef), 'origin_evidence_required');
  requireThat(o.studentUid === s.studentUid, 'cross_student_origin');
  requireThat(['payment_orders', 'cafe24_verified', 'b2b_verified'].includes(o.sourceSystem), 'unverified_origin_system');
  requireThat(o.product === product && o.currency === 'KRW', 'invalid_product_or_currency');
  requireThat(o.settlementStatus === 'paid' && integer(o.expectedAmount, 1) && o.paidAmount === o.expectedAmount, 'full_payment_required');
  requireThat(time(o.settledAt) && o.settledAt === at, 'settlement_time_requires_reconciliation');
  requireThat(!s.origins.some(x => x.id === o.id || (x.sourceSystem === o.sourceSystem && x.sourceRef === o.sourceRef && x.lineRef === o.lineRef)), 'duplicate_origin');
}
function validateClass(c: EntitlementClass, now: number) {
  requireThat(c && textValue(c.id) && textValue(c.scheduleId) && time(c.startAt) && time(c.endAt) && c.endAt > c.startAt && c.startAt >= now,
    'invalid_or_historical_class');
  requireThat(c.state === 'scheduled' && c.revision === 0 && !c.makeupApprovalRef, 'new_class_must_be_scheduled');
}
/** Trust boundary: execute ONLY after provider settlement, identity and schedule
 * verification. This module never verifies a user-supplied receipt or token. */
export function applyEntitlementCommand(before: EntitlementState, c: EntitlementCommand): { state: EntitlementState; transitions: Transition[] } {
  requireThat(c && textValue(c.id) && c.studentUid === before.studentUid, 'invalid_or_cross_student_command');
  requireThat(c.expectedRevision === before.revision, 'revision_conflict');
  const s = copy(before), transitions: Transition[] = [];
  advance(s, c.at, transitions);
  const priorMode = mode(s, c.at), hadFree = !!activeVideos(s, c.at).length;
  if (c.type === 'grant_paid_ai') {
    validateOrigin(s, c.origin, 'paid_ai', c.at);
    requireThat(integer(c.months, 1) && c.months <= 36, 'invalid_months');
    // Retain the existing KST calendar-month/queue semantics; pauses preserve
    // the bought duration instead of repeatedly rounding remaining days.
    const queueEnd = c.at + availablePaid(s).reduce((n, g) => n + g.remainingMs, 0);
    const purchasedMs = addMonthsKst(queueEnd, c.months) - queueEnd;
    requireThat(integer(purchasedMs, 1), 'invalid_purchased_duration');
    s.origins.push(copy(c.origin));
    s.paidAi.push({ id: 'ai:' + c.origin.id, originId: c.origin.id, purchasedMs, remainingMs: purchasedMs, revoked: false });
    transitions.push({ type: 'paid_ai_granted', at: c.at, originId: c.origin.id, details: { purchasedMs } });
    if (hadFree) {
      transitions.push({ type: 'paid_ai_paused', at: c.at, originId: c.origin.id });
      transitions.push({ type: 'settled_during_free_ai_review', at: c.at, originId: c.origin.id });
    }
  } else if (c.type === 'grant_video') {
    validateOrigin(s, c.origin, 'video_bundle', c.at);
    requireThat(integer(c.paidClassCount, 1) && c.paidClassCount === c.classes.length, 'paid_class_count_mismatch');
    for (const cl of c.classes) validateClass(cl, c.at);
    const all = [...s.video.flatMap(v => v.classes), ...c.classes];
    requireThat(new Set(all.map(cl => cl.id)).size === all.length && new Set(all.map(cl => cl.scheduleId)).size === all.length, 'duplicate_class_or_schedule');
    s.origins.push(copy(c.origin));
    s.video.push({ id: 'video:' + c.origin.id, originId: c.origin.id, startsAt: c.at, classes: copy(c.classes), revoked: false });
    transitions.push({ type: 'video_and_included_ai_granted', at: c.at, originId: c.origin.id });
  } else if (c.type === 'move_class' || c.type === 'complete_class') {
    const v = s.video.find(g => g.originId === c.originId && !g.revoked);
    const cl = v?.classes.find(x => x.id === c.classId);
    requireThat(v && cl && cl.state === 'scheduled', 'class_not_available');
    requireThat(c.expectedClassRevision === cl.revision, 'class_revision_conflict');
    if (c.type === 'move_class') {
      requireThat(textValue(c.approvalRef), 'schedule_approval_required');
      requireThat(textValue(c.scheduleId) && time(c.startAt) && time(c.endAt) && c.startAt >= c.at && c.endAt > c.startAt, 'invalid_move_time');
      requireThat(!s.video.some(g => g.classes.some(x => x.id !== cl.id && x.scheduleId === c.scheduleId)), 'schedule_already_linked');
      // Late makeup approval after benefit expiry requires a retrospective repair,
      // otherwise paid AI already consumed during the gap would be silently lost.
      requireThat(freeEnd(v) >= c.at, 'late_makeup_requires_reconciliation');
      const from = { scheduleId: cl.scheduleId, startAt: cl.startAt, endAt: cl.endAt };
      cl.scheduleId = c.scheduleId; cl.startAt = c.startAt; cl.endAt = c.endAt;
      if (c.makeup) cl.makeupApprovalRef = c.approvalRef;
      transitions.push({ type: c.makeup ? 'approved_makeup_linked' : 'class_moved', at: c.at, originId: c.originId,
        details: { classId: cl.id, from, to: { scheduleId: cl.scheduleId, startAt: cl.startAt, endAt: cl.endAt }, approvalRef: c.approvalRef } });
    } else {
      requireThat(c.at >= cl.endAt, 'class_not_ended');
      cl.state = 'completed';
      transitions.push({ type: 'class_completed', at: c.at, originId: c.originId, details: { classId: cl.id } });
    }
    cl.revision++;
  } else if (c.type === 'cancel_origin') {
    requireThat(textValue(c.evidenceRef), 'cancellation_evidence_required');
    const o = s.origins.find(x => x.id === c.originId);
    requireThat(o, 'unknown_origin');
    const g = [...s.paidAi, ...s.video].find(x => x.originId === o.id);
    requireThat(g && !g.revoked, 'already_cancelled_origin');
    g.revoked = true;
    transitions.push({ type: 'origin_cancelled', at: c.at, originId: o.id, details: { evidenceRef: c.evidenceRef } });
  } else if (c.type === 'refund') {
    const o = s.origins.find(x => x.id === c.originId);
    requireThat(o && textValue(c.refundId) && textValue(c.evidenceRef) && integer(c.amount, 1), 'invalid_refund');
    requireThat(!s.refunds.some(r => r.id === c.refundId), 'duplicate_refund');
    const already = s.refunds.filter(r => r.originId === o.id).reduce((n, r) => n + r.amount, 0);
    requireThat(already + c.amount <= o.paidAmount, 'refund_exceeds_paid');
    requireThat(Array.isArray(c.classIds) && new Set(c.classIds).size === c.classIds.length, 'duplicate_refund_classes');
    if (c.mode === 'full') {
      requireThat(c.classIds.length === 0 && already + c.amount === o.paidAmount, 'full_refund_must_close_balance');
      const ai = s.paidAi.find(g => g.originId === o.id); if (ai) ai.revoked = true;
      const v = s.video.find(g => g.originId === o.id); if (v) v.revoked = true;
    } else {
      requireThat(c.mode === 'unused_classes' && o.product === 'video_bundle' && c.classIds.length > 0, 'partial_refund_needs_video_classes');
      const v = s.video.find(g => g.originId === o.id && !g.revoked);
      requireThat(v, 'refunded_video_origin');
      requireThat(Array.isArray(c.unusedEvidence) && c.unusedEvidence.length === c.classIds.length
        && new Set(c.unusedEvidence.map(e => e.classId)).size === c.classIds.length, 'verified_unused_evidence_required');
      for (const id of c.classIds) {
        const cl = v.classes.find(x => x.id === id);
        requireThat(cl && cl.state === 'scheduled' && cl.startAt > c.at, 'refund_class_not_unused');
        const evidence = c.unusedEvidence.find(e => e.classId === id);
        requireThat(evidence && evidence.classRevision === cl.revision && evidence.checkedAt === c.at
          && evidence.hasStudentAttendance === false && textValue(evidence.reservationRef), 'verified_unused_evidence_required');
        cl.state = 'refunded'; cl.revision++;
      }
      if (already + c.amount === o.paidAmount) requireThat(v.classes.every(x => x.state === 'refunded'), 'partial_refund_exhausts_payment');
    }
    s.refunds.push({ id: c.refundId, originId: o.id, amount: c.amount, at: c.at, classIds: [...c.classIds], mode: c.mode, evidenceRef: c.evidenceRef });
    transitions.push({ type: 'refund_recorded', at: c.at, originId: o.id, details: { refundId: c.refundId, amount: c.amount, classIds: c.classIds, mode: c.mode } });
  } else requireThat(c.type === 'reconcile', 'unknown_command');
  const hasFree = !!activeVideos(s, c.at).length;
  if (!hadFree && hasFree && availablePaid(s).length) transitions.push({ type: 'paid_ai_paused', at: c.at });
  if (hadFree && !hasFree && availablePaid(s).length) transitions.push({ type: 'paid_ai_resumed', at: c.at });
  modeEvent(transitions, priorMode, mode(s, c.at), c.at);
  s.revision++;
  return { state: s, transitions };
}

/** Prospective, read-only view. Never use diagnostic history or recent room joins
 * as a grant. A failed/unknown mapping stays unknown in the adapter, not 'unpaid'. */
export function entitlementView(state: EntitlementState, at: number) {
  const s = copy(state); advance(s, at, []);
  const videos = activeVideos(s, at), paid = availablePaid(s), included = videos.length > 0;
  const aiAllowed = included || paid.length > 0;
  return {
    studentUid: s.studentUid, at, revision: s.revision,
    track: included ? 'live_ai' : paid.length ? 'ai_only' : 'none',
    label: included ? '화상수업 + AI 무료 포함' : paid.length ? 'AI 전용' : '활성 이용권 없음',
    aiAllowed, videoAllowed: included,
    aiSource: included ? 'video_included' : paid.length ? 'paid_ai' : 'none',
    aiOriginIds: included ? videos.map(v => v.originId) : paid.slice(0, 1).map(g => g.originId),
    videoOriginIds: videos.map(v => v.originId),
    paidRemainingMs: paid.reduce((n, g) => n + g.remainingMs, 0),
    paidPaused: included && paid.length > 0,
    includedUntil: included ? Math.max(...videos.map(freeEnd)) : null,
    paidEndsAt: !included && paid.length ? at + paid.reduce((n, g) => n + g.remainingMs, 0) : null,
    evaluationBasis: included ? 'teacher_and_ai' : paid.length ? 'ai_learning' : 'no_current_entitlement',
    // Joining a particular class STILL requires its own identity/time/room gate.
    scheduledClassIds: videos.flatMap(v => v.classes.filter(c => c.state === 'scheduled' && c.endAt > at).map(c => c.id)),
  };
}
/** Advisory only. Caller must recheck atomically with a shared learner lock before
 * an external charge. No billing/resume mutation is performed here. */
export function aiRenewalDecision(state: EntitlementState, at: number, priorNoticeAt: number | null) {
  const view = entitlementView(state, at), notice = 3 * 86400000;
  if (view.aiSource === 'video_included') return { charge: false, reason: 'included_ai', notBefore: view.includedUntil };
  const desired = view.paidEndsAt == null ? at : view.paidEndsAt - notice;
  if (priorNoticeAt == null || priorNoticeAt > at || !time(priorNoticeAt)) return { charge: false, reason: 'notice_required', notBefore: Math.max(at + notice, desired) };
  const notBefore = Math.max(priorNoticeAt + notice, desired);
  return { charge: at >= notBefore, reason: at >= notBefore ? 'eligible_after_notice' : 'not_due', notBefore };
}
export function entitlementRevenue(state: EntitlementState) {
  const result = { paidAiGross: 0, paidAiRefunded: 0, videoGross: 0, videoRefunded: 0, includedAiRevenue: 0 };
  for (const o of state.origins) {
    const refunded = state.refunds.filter(r => r.originId === o.id).reduce((n, r) => n + r.amount, 0);
    if (o.product === 'paid_ai') { result.paidAiGross += o.paidAmount; result.paidAiRefunded += refunded; }
    else { result.videoGross += o.paidAmount; result.videoRefunded += refunded; }
  }
  return { ...result, paidAiNet: result.paidAiGross - result.paidAiRefunded, videoNet: result.videoGross - result.videoRefunded };
}
