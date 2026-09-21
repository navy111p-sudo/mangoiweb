/**
 * api-pay-refund.ts — 환불 «실행»과 «기록» (2026-08-25)
 *
 * ══ 왜 만들었나 ═══════════════════════════════════════════════════════════
 *  2026-08-24 외주 제안서 대조 검토에서 확인된 유일한 실제 결손이다.
 *  그때까지 이 저장소에 있던 것은 **환불 «금액 계산기» 하나뿐**이었다
 *  (`/api/pay/enroll/admin/refund-quote` — enroll-ops.ts, 주석에 「계산만. 실제 환불 실행은 사람이」).
 *  토스 API 를 부르는 곳은 네 군데였는데 전부 승인·빌링키·조회였고
 *  **결제취소(`payments/{key}/cancel`) 호출은 0건**이었다.
 *
 *  그래서 실제 운영은 이랬다 — 담당자가 토스 대시보드에서 직접 취소 → **우리 DB 에는 아무것도 안 남음**
 *  → 나중에 신한 통장 적요를 「학생환불」로 분류해 **금액만 사후 인식**.
 *  「누가·왜·어느 주문을·언제」 환불했는지는 복원할 수 없었다. 환불은 분쟁이 가장 잦은 지점인데
 *  응대와 회계 대사가 모두 사람 기억에 의존하고 있었다.
 *
 * ══ 이 파일의 안전장치 ════════════════════════════════════════════════════
 *  1) 🔴 **기록이 먼저다(write-ahead)** — PG 를 부르기 «전에» payment_refunds 에
 *     status='requested' 행을 먼저 남기고, 응답을 받은 뒤 그 행을 갱신한다.
 *     왜: 호출 도중 워커가 죽거나 타임아웃되면 「PG 에서는 취소됐는데 우리 기록엔 없는」
 *     가장 나쁜 상태가 된다. 먼저 적어 두면 «요청했는데 결과 모름»으로 남아 사람이 찾아갈 수 있다.
 *     ⛔ 이 순서를 뒤집지 말 것. 이 파일이 존재하는 이유 자체다.
 *  2) 🔁 **멱등키** — 위에서 먼저 만든 행의 id 로 `Idempotency-Key: mgi-refund-{id}` 를 만든다.
 *     같은 행으로 다시 시도하면 토스가 같은 요청으로 보고 두 번 취소하지 않는다.
 *  3) ✋ **2단계 확인** — `confirm:true` 가 없으면 계산만 돌려주고 실행하지 않는다
 *     (스케줄 자리표시 정리(purge-placeholders)와 같은 방식).
 *  4) 🚧 **동시 실행 잠금** — 같은 주문에 아직 결과를 못 받은(requested) 행이 있으면 거절한다.
 *     두 사람이 동시에 누르는 것이 이 화면에서 제일 위험하다.
 *  5) 💰 **금액 상한** — (이미 환불된 합계 + 이번 금액) ≤ 결제액. 서버가 다시 계산한다.
 *  6) 📝 **실패도 기록한다** — 실패는 지우는 게 아니라 남긴다. 「왜 안 됐나」가 사라지면
 *     같은 시도를 반복하게 된다.
 *
 * ══ 권한 ══════════════════════════════════════════════════════════════════
 *  ⛔ `canEditOrg()` 하나로 막으면 **강사가 통과한다** — 그 함수는 scope 'none'(=내부직원·교사)에
 *     true 를 준다(CLAUDE.md 2장 함정). 그래서 여기서는 두 겹으로 본다:
 *       ① getAdminActor().isTeacher  → 403 forbidden_teacher
 *       ② scope 가 branch/agency/franchise → 403 forbidden_scope (지사·대리점은 남의 돈이다)
 *     남는 것은 hq 와 none(내부직원)뿐이다.
 *  ⚠️ scope 를 `=== 'hq'` 로만 좁히지 말 것 — admin_scope 행이 아직 없는 본사 직원 계정이
 *     'none' 으로 판정될 수 있고, 그러면 정작 환불해야 할 사람이 막힌다.
 *
 * ══ 토스 결제취소 API ══════════════════════════════════════════════════════
 *   POST https://api.tosspayments.com/v1/payments/{paymentKey}/cancel
 *   headers: Authorization: Basic base64(secret + ':')  ·  Idempotency-Key
 *   body:  { cancelReason, cancelAmount?, refundReceiveAccount? }
 *          · cancelAmount 를 빼면 «전액 취소»
 *          · 가상계좌(await_deposit → 입금완료) 결제는 **돌려줄 계좌**가 필요하다
 *            → refundReceiveAccount { bank, accountNumber, holderName }
 *   응답:  status 가 CANCELED(전액) / PARTIAL_CANCELED(부분), balanceAmount 에 남은 금액.
 *   ⚠️ 이 코드는 응답 «모양»에 기대지 않는다 — 이 작업 환경에서는 토스 문서에 접근할 수 없어
 *      필드 이름을 눈으로 확인하지 못했다(프록시 차단). 그래서 성공 판정은 HTTP 2xx 로 하고,
 *      status·balanceAmount·cancels 는 **있으면 기록**하고 없으면 원문을 통째로 남긴다.
 *      돈이 오가는 코드에서 「내가 아는 필드가 없으면 실패로 친다」는 더 위험하다 —
 *      실제로는 취소됐는데 우리는 실패로 적고, 사람이 한 번 더 누르게 된다.
 */
import { json, parseJsonBody } from './api-util';
import { getAdminActor } from './auth-admin';
import { forbiddenTeacherBody } from './forbidden-teacher';   // 🪪 「강사 권한으로는 …」 문구 정본(계정 이름 포함) — 복제 금지
import { getScope } from './scope';
import { sendPlainSms } from './solapi-client';
import { kstToday, enrollRefundCalc, ENROLL_BASE_WEEKLY1 } from './enroll-ops';
// 수업 길이 → 요금 배수는 class-policy 가 정본이다 (enroll-ops 도 여기서 가져다 쓴다 — 복사 금지)
import { classLengthMultiplier } from './class-policy';

const TOSS_CANCEL_URL = (paymentKey: string) =>
  `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`;

/* ═══════════════ 표 ═══════════════ */

export async function ensureRefundTable(env: any): Promise<void> {
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS payment_refunds (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         order_id TEXT NOT NULL,
         payment_key TEXT,
         uid TEXT,
         student_name TEXT,
         paid_amount INTEGER NOT NULL,
         refund_amount INTEGER NOT NULL,
         kind TEXT NOT NULL,
         reason TEXT NOT NULL,
         basis TEXT,
         status TEXT NOT NULL,
         pg_status TEXT,
         pg_code TEXT,
         pg_raw TEXT,
         cancelled_classes INTEGER DEFAULT 0,
         requested_by TEXT NOT NULL,
         requested_at INTEGER NOT NULL,
         done_at INTEGER,
         note TEXT
       )`
    ).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_refunds_order ON payment_refunds(order_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_refunds_at ON payment_refunds(requested_at)`).run();
    // 원 주문에도 결과를 비춰 둔다 (결제 목록에서 바로 보이게). 이미 있으면 조용히 무시.
    try { await env.DB.prepare(`ALTER TABLE payment_orders ADD COLUMN refunded_amount INTEGER DEFAULT 0`).run(); } catch (_) {}
    try { await env.DB.prepare(`ALTER TABLE payment_orders ADD COLUMN refunded_at INTEGER`).run(); } catch (_) {}
  } catch (e) { console.warn('[refund] ensure table:', (e as any)?.message); }
}

/* ═══════════════ 권한 ═══════════════ */

/* 게이트 결과.
   ⚠️ 판별 유니온(`{ok:true,…} | {ok:false,…}`)으로 쓰면 이 저장소에서는 좁혀지지 않는다 —
      tsconfig 의 strictNullChecks 가 꺼져 있어 `if (!g.ok)` 뒤에도 g.res 를 못 찾는다.
      그래서 «한 가지 모양»으로 둔다. */
type Gate = { ok: boolean; username: string; res: Response | null };

/** 환불을 만질 수 있는 사람인가 — 강사 차단 + 지사·대리점 차단 (위 「권한」 주석 참조) */
async function refundGate(request: Request, env: any): Promise<Gate> {
  const deny = (res: Response): Gate => ({ ok: false, username: '', res });
  const actor = await getAdminActor(request, env);
  if (!actor.ok) {
    return deny(json({ ok: false, error: 'auth_required', message: '로그인이 필요합니다.' }, 401));
  }
  if (actor.isTeacher) {
    return deny(json(forbiddenTeacherBody(actor,
      '강사 권한으로는 환불을 볼 수 없습니다.',
      'Refunds are not available with a teacher account.'), 403));
  }
  let scopeType = 'none';
  try { scopeType = (await getScope(env, request)).type; } catch (_) { /* 판정 실패 = 아래에서 none 취급 */ }
  if (scopeType === 'branch' || scopeType === 'agency' || scopeType === 'franchise') {
    return deny(json({
      ok: false, error: 'forbidden_scope', scope: scopeType,
      message: '환불은 본사에서만 처리합니다.',
    }, 403));
  }
  return { ok: true, username: actor.username, res: null };
}

/* ═══════════════ 계산 ═══════════════ */

export type RefundPreview = {
  order_id: string;
  uid: string | null;
  student_name: string | null;
  paid_amount: number;
  status: string;
  payment_key: string | null;
  method: string | null;
  paid_at: number | null;
  already_refunded: number;      // 지금까지 환불한 합계 (done 만 셈)
  pending_refunds: number;       // 결과를 못 받은 행 수 — 있으면 실행을 막는다
  refundable_max: number;        // 이번에 환불할 수 있는 상한
  suggested: number;             // 권장 금액 (수강신청 주문이면 사용분 정산 결과)
  suggest_basis: any;            // 그 근거 (사람이 화면에서 확인)
  remaining_classes: number;     // 남은 수업 수 (환불 시 취소 대상)
  active_subscription: boolean;  // 자동연장이 살아 있는가 — 남겨두면 다음 달 또 청구된다
  history: any[];
};

/** 주문 하나의 환불 가능 상태를 모아 온다. 실행 전 미리보기와 실행 검증이 **같은 함수**를 쓴다. */
export async function refundPreview(env: any, orderId: string): Promise<RefundPreview | { error: string; status?: string }> {
  await ensureRefundTable(env);
  const o: any = await env.DB.prepare(
    `SELECT order_id, uid, amount, status, payment_key, method, paid_at, student_name, payer_name, enroll_json,
            IFNULL(refunded_amount, 0) AS refunded_amount
       FROM payment_orders WHERE order_id = ? LIMIT 1`
  ).bind(orderId).first();
  if (!o) return { error: 'order_not_found' };

  /* 환불은 «돈이 실제로 들어온» 주문에만 성립한다.
     await_deposit(가상계좌 발급했지만 미입금)은 취소가 아니라 «발급 취소» 라 성격이 다르고,
     pending/failed 는 애초에 받은 돈이 없다. 여기서 막고 화면이 이유를 그대로 말하게 한다. */
  if (o.status !== 'paid' && o.status !== 'partial_refunded') {
    return { error: 'not_paid', status: String(o.status || '') };
  }

  const rows = await env.DB.prepare(
    `SELECT id, refund_amount, kind, reason, status, pg_status, pg_code, requested_by, requested_at, done_at, cancelled_classes, note
       FROM payment_refunds WHERE order_id = ? ORDER BY id DESC`
  ).bind(orderId).all();
  const history = (rows.results || []) as any[];
  const already = history.filter(r => r.status === 'done').reduce((s, r) => s + Number(r.refund_amount || 0), 0);
  const pending = history.filter(r => r.status === 'requested').length;

  const paid = Number(o.amount || 0);
  const max = Math.max(0, paid - already);

  // ── 수강신청 주문이면 「사용분 정산 후 잔액」을 권장값으로 계산 (기존 refund-quote 와 같은 규칙) ──
  let suggested = max;
  let basis: any = { rule: 'full', note: '수강신청 주문이 아니어서 사용분 계산 없이 잔액 전액을 권장합니다.' };
  let remainingClasses = 0;
  let ej: any = null;
  try { ej = JSON.parse(String(o.enroll_json || 'null')); } catch (_) {}
  if (ej) {
    const sessions = Number(ej.sessions || 0);
    const today = kstToday();
    const rem: any = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM class_schedules WHERE source = ? AND status = 'active' AND scheduled_date >= ?`
    ).bind(`enroll:${orderId}`, today).first();
    remainingClasses = Number(rem?.n || 0);
    const used = Math.max(0, sessions - remainingClasses);
    const lenMul = classLengthMultiplier(Number(ej.minutes));
    const basePrice = Number(ej.weekly1_price || ENROLL_BASE_WEEKLY1) * Number(ej.weekly || 1) * Number(ej.months || 1) * lenMul;
    const calc = enrollRefundCalc(paid, sessions, used, basePrice);
    /* 이미 일부를 환불했다면 그만큼 빼야 한다 — 계산기는 «결제액 기준» 이라 그대로 쓰면 두 번 준다. */
    suggested = Math.max(0, Math.min(max, calc.refund - already));
    basis = {
      rule: 'enroll_used_settlement',
      sessions, used_sessions: calc.used, remaining_by_schedule: remainingClasses,
      list_per_session: calc.listPerSession, used_value: calc.usedValue,
      base_price_no_discount: basePrice, calc_refund: calc.refund, already_refunded: already,
      policy: '기간할인 취소 후 정가로 사용분 정산 → 잔액 환불 (2026-07-23 확인)',
    };
  }

  let activeSub = false;
  try {
    const s: any = await env.DB.prepare(
      `SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' AND billing_key IS NOT NULL LIMIT 1`
    ).bind(String(o.uid || '')).first();
    activeSub = !!s;
  } catch (_) { /* 표가 없으면 자동연장도 없다 */ }

  return {
    order_id: String(o.order_id), uid: o.uid ? String(o.uid) : null,
    student_name: (o.student_name || o.payer_name) ? String(o.student_name || o.payer_name) : null,
    paid_amount: paid, status: String(o.status), payment_key: o.payment_key ? String(o.payment_key) : null,
    method: o.method ? String(o.method) : null, paid_at: o.paid_at ? Number(o.paid_at) : null,
    already_refunded: already, pending_refunds: pending, refundable_max: max,
    suggested, suggest_basis: basis, remaining_classes: remainingClasses,
    active_subscription: activeSub, history,
  };
}

/* ═══════════════ 라우터 ═══════════════ */

export async function handleRefundApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/pay/admin/refund')) return null;

  /* ── ① 미리보기 — 실행 전 「얼마를 왜」를 화면에 보여 준다 ── */
  if (path === '/api/pay/admin/refund-preview' && method === 'GET') {
    const g = await refundGate(request, env);
    if (!g.ok) return g.res;
    const orderId = String(url.searchParams.get('order_id') || '').trim();
    if (!orderId) return json({ ok: false, error: 'order_id_required' }, 400);
    const p = await refundPreview(env, orderId);
    if ('error' in p) return json({ ok: false, ...p }, p.error === 'order_not_found' ? 404 : 400);
    return json({ ok: true, preview: p });
  }

  /* ── ② 내역 — 환불이 언제 누구에 의해 왜 일어났는지 ── */
  if (path === '/api/pay/admin/refunds' && method === 'GET') {
    const g = await refundGate(request, env);
    if (!g.ok) return g.res;
    await ensureRefundTable(env);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const orderId = String(url.searchParams.get('order_id') || '').trim();
    const rows = orderId
      ? await env.DB.prepare(
          `SELECT * FROM payment_refunds WHERE order_id = ? ORDER BY id DESC LIMIT ?`
        ).bind(orderId, limit).all()
      : await env.DB.prepare(
          `SELECT * FROM payment_refunds ORDER BY id DESC LIMIT ?`
        ).bind(limit).all();
    const list = (rows.results || []) as any[];
    // 원문(pg_raw)은 목록에서 빼고 상세에서만 — 길고, 목록 응답을 무겁게 만든다
    const slim = list.map(r => { const { pg_raw, ...rest } = r; return { ...rest, has_raw: !!pg_raw }; });
    const sum: any = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt, IFNULL(SUM(refund_amount), 0) AS total FROM payment_refunds WHERE status = 'done'`
    ).first();
    const stuck: any = await env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM payment_refunds WHERE status = 'requested'`
    ).first();
    return json({
      ok: true, refunds: slim,
      total: { count: Number(sum?.cnt || 0), amount: Number(sum?.total || 0) },
      /* 🚨 결과를 못 받은 채 남은 행. 0 이 아니면 사람이 토스 대시보드와 대조해야 한다 —
         「PG 에서는 취소됐는데 우리는 모르는」 상태일 수 있다. 화면이 이 숫자를 빨갛게 띄운다. */
      needs_check: Number(stuck?.cnt || 0),
    });
  }

  /* ── ③ 실행 ── */
  if (path === '/api/pay/admin/refund' && method === 'POST') {
    const g = await refundGate(request, env);
    if (!g.ok) return g.res;
    const body = await parseJsonBody(request) || {};
    const orderId = String(body.order_id || '').trim();
    const reason = String(body.reason || '').trim().slice(0, 200);
    const confirm = body.confirm === true;
    /* record_only = PG 를 부르지 않고 «이미 밖에서 처리한 환불»을 장부에만 남긴다.
       왜 필요한가: 지금까지의 환불이 전부 그런 식이었다(토스 대시보드에서 직접).
       그 과거 건들을 시스템에 넣을 길이 없으면 이 기능은 반쪽이다. */
    const recordOnly = body.record_only === true;

    if (!orderId) return json({ ok: false, error: 'order_id_required' }, 400);

    const p = await refundPreview(env, orderId);
    if ('error' in p) return json({ ok: false, ...p }, p.error === 'order_not_found' ? 404 : 400);

    const amount = Number.isFinite(Number(body.amount)) && Number(body.amount) > 0
      ? Math.floor(Number(body.amount))
      : p.suggested;

    // ── 검증 ──
    if (p.pending_refunds > 0) {
      return json({
        ok: false, error: 'refund_in_progress',
        message: '이 주문에 «결과를 확인하지 못한» 환불 요청이 남아 있습니다. 토스에서 실제 처리 여부를 먼저 확인해 주세요.',
        pending: p.pending_refunds,
      }, 409);
    }
    if (amount <= 0) {
      return json({ ok: false, error: 'nothing_to_refund', message: '환불할 금액이 없습니다.', refundable_max: p.refundable_max }, 400);
    }
    if (amount > p.refundable_max) {
      return json({
        ok: false, error: 'amount_exceeds',
        message: `환불 가능한 금액을 넘습니다 (최대 ${p.refundable_max.toLocaleString('ko-KR')}원).`,
        refundable_max: p.refundable_max, already_refunded: p.already_refunded,
      }, 400);
    }
    if (!reason) {
      return json({ ok: false, error: 'reason_required', message: '환불 사유를 적어 주세요. (나중에 이 줄만 남습니다)' }, 400);
    }

    const isFull = amount >= p.refundable_max;
    /* 남은 수업을 함께 끌 것인가.
       기본값: 전액 환불이면 켜고(돈을 돌려줬는데 수업이 남아 있으면 안 된다),
              부분 환불이면 끈다(회차를 몇 개 뺄지는 사람이 정할 일). 화면에서 뒤집을 수 있다. */
    const cancelClasses = body.cancel_remaining_classes === undefined
      ? isFull : body.cancel_remaining_classes === true;

    // ── 2단계: confirm 이 없으면 여기서 멈춘다 ──
    if (!confirm) {
      return json({
        ok: true, dry_run: true,
        will: {
          order_id: orderId, amount, kind: isFull ? 'full' : 'partial',
          mode: recordOnly ? 'record_only' : 'pg_cancel',
          cancel_remaining_classes: cancelClasses,
          remaining_classes: p.remaining_classes,
          active_subscription: p.active_subscription,
        },
        preview: p,
        message: recordOnly
          ? '장부에만 기록합니다 (토스에 취소 요청을 보내지 않습니다). 확인 후 confirm:true 로 다시 요청하세요.'
          : '토스에 실제 취소를 요청합니다. 확인 후 confirm:true 로 다시 요청하세요.',
      });
    }

    await ensureRefundTable(env);
    const now = Date.now();

    /* ── 🔴 기록이 먼저다 — PG 를 부르기 «전에» 남긴다 (파일 머리말 1번) ── */
    let refundId = 0;
    try {
      const ins: any = await env.DB.prepare(
        `INSERT INTO payment_refunds
           (order_id, payment_key, uid, student_name, paid_amount, refund_amount, kind, reason, basis,
            status, requested_by, requested_at, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         RETURNING id`
      ).bind(
        orderId, p.payment_key, p.uid, p.student_name, p.paid_amount, amount,
        isFull ? 'full' : 'partial', reason, JSON.stringify(p.suggest_basis).slice(0, 2000),
        recordOnly ? 'done' : 'requested', g.username, now,
        recordOnly ? '토스 대시보드 등 밖에서 처리한 환불을 장부에만 기록' : null,
      ).first();
      refundId = Number(ins?.id || 0);
    } catch (e) {
      return json({ ok: false, error: 'record_failed', message: '환불 기록을 남기지 못해 중단했습니다. (기록 없이는 실행하지 않습니다)' , detail: String((e as any)?.message || e) }, 500);
    }
    if (!refundId) {
      return json({ ok: false, error: 'record_failed', message: '환불 기록을 남기지 못해 중단했습니다.' }, 500);
    }

    // ── 장부 기록만 하는 모드는 여기서 마무리 ──
    if (recordOnly) {
      await env.DB.prepare(`UPDATE payment_refunds SET done_at = ? WHERE id = ?`).bind(now, refundId).run();
      const done = await finishRefund(env, { orderId, refundId, amount, isFull, cancelClasses, preview: p, now });
      return json({ ok: true, recorded: true, mode: 'record_only', refund_id: refundId, amount, ...done });
    }

    // ── PG 취소 ──
    const secret = String(env.TOSS_SECRET_KEY || '').trim();
    if (!secret) {
      await failRefund(env, refundId, 'pg_not_configured', '결제사 시크릿키가 설정되지 않았습니다.');
      return json({ ok: false, error: 'pg_not_configured', refund_id: refundId,
        message: '결제사 설정이 없어 취소를 보낼 수 없습니다. (요청은 기록에 남았습니다)' }, 503);
    }
    if (!p.payment_key) {
      await failRefund(env, refundId, 'no_payment_key', '이 주문에는 결제키가 없어 자동 취소가 불가능합니다.');
      return json({ ok: false, error: 'no_payment_key', refund_id: refundId,
        message: '이 주문에는 결제키가 없어 토스 자동 취소가 안 됩니다. 토스에서 직접 처리한 뒤 「장부에만 기록」으로 남겨 주세요.' }, 400);
    }

    const payload: any = { cancelReason: reason };
    if (!isFull) payload.cancelAmount = amount;
    /* 가상계좌로 받은 돈은 돌려줄 계좌가 있어야 한다. 화면이 받아서 넘긴다.
       ⚠️ 없으면 토스가 거절한다 — 그 에러 메시지를 그대로 화면에 보여 준다(우리가 지어내지 않는다). */
    if (body.refund_account && body.refund_account.accountNumber) {
      payload.refundReceiveAccount = {
        bank: String(body.refund_account.bank || ''),
        accountNumber: String(body.refund_account.accountNumber || '').replace(/[^0-9]/g, ''),
        holderName: String(body.refund_account.holderName || ''),
      };
    }

    let res: Response, out: any = {};
    try {
      res = await fetch(TOSS_CANCEL_URL(p.payment_key), {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(secret + ':'),
          'Content-Type': 'application/json',
          // 같은 행으로 재시도해도 두 번 취소되지 않게 (파일 머리말 2번)
          'Idempotency-Key': `mgi-refund-${refundId}`,
        },
        body: JSON.stringify(payload),
      });
      out = await res.json().catch(() => ({}));
    } catch (e) {
      /* 🔴 네트워크가 끊긴 경우 — «취소가 됐는지 안 됐는지 모른다».
         그래서 failed 로 확정하지 않고 requested 그대로 두고 사유만 적는다.
         화면의 「확인 필요」 숫자에 잡혀 사람이 토스와 대조하게 된다. */
      await env.DB.prepare(
        `UPDATE payment_refunds SET pg_code = ?, note = ? WHERE id = ?`
      ).bind('network_error', '결제사 연결이 끊겨 결과를 모릅니다. 토스에서 실제 취소 여부를 확인해 주세요.', refundId).run();
      return json({ ok: false, error: 'pg_network', refund_id: refundId, needs_check: true,
        message: '결제사 연결이 끊겨 결과를 확인하지 못했습니다. 토스에서 실제 취소 여부를 확인해 주세요. (요청은 기록에 남았습니다)' }, 502);
    }

    if (!res.ok) {
      const code = String(out?.code || `http_${res.status}`);
      const msg = String(out?.message || '결제사가 취소를 거절했습니다.');
      await failRefund(env, refundId, code, msg, JSON.stringify(out).slice(0, 2000));
      return json({ ok: false, error: code, refund_id: refundId, message: msg }, 400);
    }

    /* 성공 — 응답 «모양»에 기대지 않는다(파일 머리말 참조). 2xx 면 취소된 것으로 보고,
       status·balanceAmount 는 있으면 기록한다. */
    const pgStatus = String(out?.status || '');
    await env.DB.prepare(
      `UPDATE payment_refunds SET status = 'done', pg_status = ?, pg_raw = ?, done_at = ? WHERE id = ?`
    ).bind(pgStatus || null, JSON.stringify(out).slice(0, 4000), Date.now(), refundId).run();

    const done = await finishRefund(env, { orderId, refundId, amount, isFull, cancelClasses, preview: p, now: Date.now() });
    await notifyOwnerRefund(env, { orderId, amount, isFull, reason, who: g.username, student: p.student_name });

    return json({
      ok: true, refund_id: refundId, amount, kind: isFull ? 'full' : 'partial',
      pg_status: pgStatus || null, receipt: out?.receipt?.url || null, ...done,
    });
  }

  return null;
}

/* ═══════════════ 뒷정리 ═══════════════ */

/**
 * 환불이 «성립한 뒤» 딸려 가는 것들.
 *   · payment_orders 에 환불 합계·시각 반영 (전액이면 status='refunded', 일부면 'partial_refunded')
 *   · 남은 수업 취소 (지우지 않는다 — status='cancelled' 라 되돌릴 수 있다)
 *   · enrollments 를 'refunded' 로
 * ⚠️ 여기서 실패해도 환불 자체는 이미 일어났다. 그래서 각각을 try 로 감싸고
 *    실패는 «기록에 적어» 사람이 볼 수 있게 한다 — 던져서 응답을 실패로 만들면
 *    「돈은 돌려줬는데 화면은 실패라고 말하는」 최악이 된다.
 */
async function finishRefund(env: any, a: {
  orderId: string; refundId: number; amount: number; isFull: boolean;
  cancelClasses: boolean; preview: RefundPreview; now: number;
}): Promise<{ cancelled_classes: number; warnings: string[] }> {
  const warnings: string[] = [];
  const totalRefunded = a.preview.already_refunded + a.amount;

  try {
    await env.DB.prepare(
      `UPDATE payment_orders SET status = ?, refunded_amount = ?, refunded_at = ? WHERE order_id = ?`
    ).bind(
      totalRefunded >= a.preview.paid_amount ? 'refunded' : 'partial_refunded',
      totalRefunded, a.now, a.orderId,
    ).run();
  } catch (e) {
    warnings.push('주문 상태를 갱신하지 못했습니다: ' + String((e as any)?.message || e));
  }

  let cancelled = 0;
  if (a.cancelClasses) {
    try {
      const today = kstToday();
      /* ⛔ DELETE 가 아니라 status='cancelled' 다 — 되돌릴 수 있어야 하고,
            「왜 이 수업이 사라졌나」가 남아야 한다. (스케줄 정리와 같은 방식) */
      const r: any = await env.DB.prepare(
        `UPDATE class_schedules SET status = 'cancelled', updated_at = ?,
                notes = COALESCE(notes || ' / ', '') || ?
          WHERE source = ? AND status = 'active' AND scheduled_date >= ?`
      ).bind(a.now, `환불로 취소 (refund #${a.refundId})`, `enroll:${a.orderId}`, today).run();
      cancelled = Number(r?.meta?.changes || 0);
    } catch (e) {
      warnings.push('남은 수업을 취소하지 못했습니다: ' + String((e as any)?.message || e));
    }
  }

  try {
    await env.DB.prepare(
      `UPDATE enrollments SET status = 'refunded', updated_at = ? WHERE notes LIKE ?`
    ).bind(a.now, `%${a.orderId}%`).run();
  } catch (e) {
    // enrollments 표가 없거나 이 주문과 연결된 행이 없는 경우가 정상적으로 있다.
    // 그래도 «조용히» 넘기지는 않는다 — 수강이 살아 있는 채로 남으면 나중에 헷갈린다.
    console.warn('[refund] enrollments 갱신 건너뜀:', (e as any)?.message);
  }

  try {
    await env.DB.prepare(`UPDATE payment_refunds SET cancelled_classes = ? WHERE id = ?`)
      .bind(cancelled, a.refundId).run();
  } catch (e) {
    // 환불 자체는 이미 끝났다 — 여기서 던지면 「돈은 돌려줬는데 화면은 실패」가 된다.
    // 대신 조용히 넘어가지는 않는다: 취소한 수업 수가 기록에 안 남았다는 걸 알려 준다.
    console.warn('[refund] cancelled_classes 기록 실패:', (e as any)?.message);
    warnings.push('환불은 처리됐지만 «취소한 수업 수»를 기록에 남기지 못했습니다.');
  }

  /* 🚨 자동연장이 살아 있으면 다음 달에 또 청구된다 — 여기서 자동으로 끄지는 않는다.
     (구독 해지는 학생 전체 계약에 걸리는 별개 결정이라 사람이 판단해야 한다)
     대신 반드시 «경고»로 올려 화면이 빨갛게 말하게 한다. */
  if (a.isFull && a.preview.active_subscription) {
    warnings.push('⚠️ 이 학생에게 자동연장(정기결제)이 살아 있습니다. 그대로 두면 다음 청구일에 또 결제됩니다 — 자동연장 해지를 함께 확인해 주세요.');
  }

  return { cancelled_classes: cancelled, warnings };
}

async function failRefund(env: any, refundId: number, code: string, message: string, raw?: string): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE payment_refunds SET status = 'failed', pg_code = ?, note = ?, pg_raw = ?, done_at = ? WHERE id = ?`
    ).bind(String(code).slice(0, 100), String(message).slice(0, 500), raw || null, Date.now(), refundId).run();
  } catch (e) { console.warn('[refund] mark failed:', (e as any)?.message); }
}

/** 사장님 폰으로 환불 사실을 알린다 (실패해도 환불 응답에는 영향 없음) */
async function notifyOwnerRefund(env: any, a: {
  orderId: string; amount: number; isFull: boolean; reason: string; who: string; student: string | null;
}): Promise<void> {
  try {
    const to = (env as any).OWNER_ALERT_PHONE;
    if (!to) return;
    const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16);
    const txt = `[망고아이] 💸 환불 처리\n${a.student ? a.student + ' · ' : ''}${a.amount.toLocaleString('ko-KR')}원 (${a.isFull ? '전액' : '부분'})\n사유: ${a.reason}\n처리: ${a.who}\n주문: ${a.orderId}\n시각: ${kst} (KST)`;
    await sendPlainSms(env, to, txt);
  } catch (e) { console.warn('[refund] owner sms:', (e as any)?.message); }
}
