/**
 * api-pay.ts — 토스페이먼츠 안전 결제 (서버 확정 방식)
 *
 *  ⚠️ 돈이 오가는 코드. 핵심 안전장치 4가지:
 *    1) 서버 확정(confirm): 카드 결제는 프론트에서 "요청"만 하고, 실제 승인은 반드시
 *       서버가 토스 confirm API(시크릿키)를 호출해 완료한다. (프론트만으로는 미완료 → 자동취소)
 *    2) 금액 위변조 방지: 주문 금액을 서버 가격표(PRICES)로 결정·저장하고, 확정 시
 *       토스가 청구한 금액 == 저장된 주문 금액 인지 대조한다.
 *    3) 중복 방지(멱등): 같은 주문을 두 번 확정 요청해도 한 번만 처리(이미 paid면 그대로 성공).
 *    4) 기록: 모든 주문/결제를 payment_orders 에 남겨 나중에 대사(reconcile) 가능.
 *
 *  테스트 모드: TOSS_SECRET_KEY 가 test_sk_* 이면 토스 테스트 환경(실제 청구 없음).
 *  실전 전환: 시크릿을 live_sk_* 로 바꾸고 프론트 클라이언트키도 live_ck_* 로 교체.
 */
import { json, parseJsonBody } from './api-util';

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

// ── 서버 가격표(정본). 프론트 PROG_INFO 와 동기화. 여기 없는 상품은 결제 불가(상담 유도) ──
const PRICES: Record<string, { name: string; amount: number }> = {
  '1on1-4':  { name: '1:1 4회권',   amount: 60000 },
  '1on1-8':  { name: '1:1 8회권',   amount: 120000 },
  '1on1-12': { name: '1:1 12회권',  amount: 180000 },
  '1on1-24': { name: '1:1 24회권',  amount: 360000 },
  'group-12':{ name: '그룹 12회권', amount: 120000 },
  'business':{ name: '비즈니스 영어', amount: 70000 },
  'kids':    { name: '키즈 영어',   amount: 50000 },
  'exam':    { name: '시험 영어',   amount: 80000 },
  // 부가 옵션
  'fixed_teacher':  { name: '강사 고정',        amount: 30000 },
  'prime_time':     { name: '시간대 우선권',    amount: 20000 },
  'writing_review': { name: '1:1 영작 첨삭',    amount: 40000 },
  'manager':        { name: '학습 매니저',      amount: 50000 },
  'group_class':    { name: '원어민 그룹 클래스', amount: 60000 },
  'pron_ai':        { name: 'AI 발음 코치',     amount: 15000 },
};

async function ensurePayTable(env: any): Promise<void> {
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS payment_orders (
         order_id TEXT PRIMARY KEY,
         uid TEXT,
         program TEXT,
         amount INTEGER NOT NULL,
         status TEXT NOT NULL DEFAULT 'pending',
         payment_key TEXT,
         method TEXT,
         payer_name TEXT,
         student_name TEXT,
         created_at INTEGER NOT NULL,
         paid_at INTEGER,
         fail_reason TEXT,
         raw TEXT
       )`
    ).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_payment_orders_uid ON payment_orders(uid, created_at)`).run();
  } catch (e) { console.warn('[pay] ensure table:', (e as any)?.message); }
}

function tossMode(env: any): 'test' | 'live' | 'disabled' {
  const k = String(env.TOSS_SECRET_KEY || '');
  if (!k) return 'disabled';
  return k.startsWith('live_') ? 'live' : 'test';
}

/**
 * 결제 API 라우터. index.ts 에서 /api/pay/* 를 여기로 보낸다.
 */
export async function handlePayApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/pay/')) return null;

  await ensurePayTable(env);

  // ── 1) 주문 생성: 서버가 금액을 결정(위변조 방지)하고 pending 주문을 만든다 ──
  if (path === '/api/pay/create-order' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const program = String(body.program || '').trim();
    const uid = String(body.uid || '').trim() || null;
    const payer = String(body.payer || '').slice(0, 40) || null;
    const student = String(body.student || '').slice(0, 40) || null;
    const method_ = String(body.method || 'card').slice(0, 20);

    const priced = PRICES[program];
    // 서버 가격표에 있으면 그 금액을 강제(클라이언트가 보낸 금액 무시). 없으면 결제 불가.
    if (!priced) {
      return json({ ok: false, error: 'unknown_program', message: '결제 가능한 상품이 아닙니다. 상담을 이용해 주세요.' }, 400);
    }
    const amount = priced.amount;
    if (amount <= 0) {
      return json({ ok: false, error: 'not_payable', message: '이 상품은 온라인 결제 대상이 아닙니다.' }, 400);
    }

    // 서버 생성 주문번호(추측 어렵게). 시각은 요청 헤더 기반이 아닌 Date.now() 사용.
    const rnd = bytesHex(crypto.getRandomValues(new Uint8Array(6)));
    const orderId = `MGI-${Date.now().toString(36).toUpperCase()}-${rnd}`;
    try {
      await env.DB.prepare(
        `INSERT INTO payment_orders (order_id, uid, program, amount, status, method, payer_name, student_name, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
      ).bind(orderId, uid, program, amount, method_, payer, student, Date.now()).run();
    } catch (e) {
      return json({ ok: false, error: 'order_create_failed', message: String((e as any)?.message || e) }, 500);
    }
    return json({ ok: true, orderId, amount, orderName: priced.name });
  }

  // ── 2) 결제 확정: 프론트 성공콜백이 호출. 서버가 토스에 최종 승인 요청 ──
  if (path === '/api/pay/confirm' && method === 'POST') {
    const mode = tossMode(env);
    if (mode === 'disabled') {
      return json({ ok: false, error: 'pg_not_configured', message: '결제가 아직 설정되지 않았습니다(관리자 문의).' }, 503);
    }
    const body = await parseJsonBody(request) || {};
    const paymentKey = String(body.paymentKey || '').trim();
    const orderId = String(body.orderId || '').trim();
    const amount = Number(body.amount || 0);
    if (!paymentKey || !orderId || !amount) {
      return json({ ok: false, error: 'missing_params', message: '결제 정보가 올바르지 않습니다.' }, 400);
    }

    const order = await env.DB.prepare(
      `SELECT order_id, amount, status FROM payment_orders WHERE order_id = ? LIMIT 1`
    ).bind(orderId).first();
    if (!order) {
      return json({ ok: false, error: 'order_not_found', message: '주문을 찾을 수 없습니다.' }, 404);
    }
    // 멱등: 이미 확정된 주문이면 다시 청구하지 않고 성공으로 응답.
    if (order.status === 'paid') {
      return json({ ok: true, already: true, orderId, amount: order.amount, message: '이미 결제 완료된 주문입니다.' });
    }
    // 🔒 금액 위변조 방지: 요청 금액 == 저장된 주문 금액 이어야 확정 진행.
    if (Number(order.amount) !== amount) {
      await env.DB.prepare(`UPDATE payment_orders SET status='failed', fail_reason='amount_mismatch' WHERE order_id=?`).bind(orderId).run();
      return json({ ok: false, error: 'amount_mismatch', message: '결제 금액이 주문과 일치하지 않습니다.' }, 400);
    }

    // 토스 confirm 호출 (시크릿키 Basic 인증). 여기서 실제 승인이 완료된다.
    const auth = 'Basic ' + btoa(String(env.TOSS_SECRET_KEY) + ':');
    let tossRes: Response, tossJson: any;
    try {
      tossRes = await fetch(TOSS_CONFIRM_URL, {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      });
      tossJson = await tossRes.json().catch(() => ({}));
    } catch (e) {
      return json({ ok: false, error: 'pg_network', message: '결제사 연결 오류. 잠시 후 다시 시도해 주세요.' }, 502);
    }

    if (tossRes.ok && (tossJson?.status === 'DONE' || tossJson?.status === 'PAID')) {
      await env.DB.prepare(
        `UPDATE payment_orders SET status='paid', payment_key=?, paid_at=?, raw=? WHERE order_id=?`
      ).bind(paymentKey, Date.now(), JSON.stringify(tossJson).slice(0, 4000), orderId).run();
      return json({
        ok: true, orderId, amount,
        method: tossJson?.method || null,
        receipt: tossJson?.receipt?.url || null,
        approvedAt: tossJson?.approvedAt || null,
        orderName: tossJson?.orderName || null,
      });
    }

    // 실패 — 토스 에러코드/메시지를 그대로 담아 프론트가 친절히 안내
    const code = tossJson?.code || ('http_' + tossRes.status);
    const msg = tossJson?.message || '결제 승인에 실패했습니다.';
    await env.DB.prepare(`UPDATE payment_orders SET status='failed', fail_reason=? WHERE order_id=?`).bind(String(code).slice(0, 100), orderId).run();
    return json({ ok: false, error: code, message: msg }, 400);
  }

  // ── 3) 주문 상태 조회 (성공 페이지 표시용) ──
  if (path.startsWith('/api/pay/order/') && method === 'GET') {
    const orderId = decodeURIComponent(path.split('/api/pay/order/')[1] || '');
    if (!orderId) return json({ ok: false, error: 'no_order' }, 400);
    const order = await env.DB.prepare(
      `SELECT order_id, program, amount, status, method, paid_at, fail_reason FROM payment_orders WHERE order_id = ? LIMIT 1`
    ).bind(orderId).first();
    if (!order) return json({ ok: false, error: 'order_not_found' }, 404);
    return json({ ok: true, order });
  }

  return null;
}

function bytesHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}
