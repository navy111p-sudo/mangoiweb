/**
 * 🏢 대리점 청구서 결제(MGB- AI 컨텐츠 · MGT- 화상영어 수업료) — 이중결제 문지기 + 취소 되돌리기 (2026-10-22)
 *
 * 왜 이 파일이 생겼나 — 결제 코어(api-pay.ts)는 «주문» 단위로만 중복을 막는다.
 *   그런데 대리점 청구서는 «결제」를 누를 때마다 새 주문이 생긴다(탭 두 개·창 닫았다 다시 열기·
 *   공개 링크와 /manager 동시). 그래서 같은 청구서에 주문이 둘이면 토스 승인도 둘 = 카드가 두 번 긁혔다.
 *   그리고 토스에서 취소가 와도 payment_orders 만 바뀌고 청구서·이용권·충전금은 그대로였다.
 *
 * 1) claimB2bInvoiceForConfirm — /api/pay/confirm 이 «토스 승인 요청 직전» 에 부른다.
 *    ⚠️ 토스 승인(confirm) 호출이 곧 실제 청구다. 그 «앞» 에서 막아야 돈이 안 나간다.
 *    · 청구서가 이미 결제됐거나(MGB) 낼 돈이 이 주문보다 적으면(MGT) → 거절(승인을 안 부른다)
 *    · 같은 청구서의 다른 주문이 «지금 승인 중» 이면 → 거절. 조건부 UPDATE 하나로 선점한다
 *      (D1 은 쓰기를 직렬화하므로 둘이 동시에 와도 이기는 쪽은 정확히 하나).
 *    · 선점이 오래됐으면(CLAIM_STALE_MS) 그 주문이 토스에서 정말 승인됐는지 물어본 뒤에만 넘겨받는다.
 *    ⛔ 모르면(조회 실패·칸 없음·예외) «막는다» — 막아도 돈은 안 나가고(승인을 안 불렀으니),
 *       열어 주면 두 번 긁힌다. 되돌릴 수 없는 쪽이 아니라 되돌릴 수 있는 쪽으로 실패한다.
 *
 * 2) revertB2bOnCancel — 웹훅 CANCELED/PARTIAL_CANCELED 와 앱 환불(finishRefund) 둘 다 부른다.
 *    멱등 — 취소 한 건마다 토스 transactionKey 를 ref 로 b2b_payment_cancels 에 INSERT OR IGNORE,
 *    처음 들어간 것만 효과를 낸다(웹훅과 앱 환불이 같은 취소를 두 번 알려도 한 번만).
 *    · MGT: 취소 금액만큼 충전금에서 빼고(ref UNIQUE) 청구서 paid_krw 를 줄인다(issued/partial 로 돌아감).
 *    · MGB 전액 취소: 청구서를 draft 로 되돌리고(그 주문이 청구서의 주문일 때만) 그 주문으로
 *      만든 수강 기록을 refunded 로. ⛔ 부분 취소는 «누구 몫인지» 알 수 없어 자동으로 안 건드린다 —
 *      기록만 남기고(needs_review) 사람이 본다.
 *
 * ⚠️ api-pay.ts·ai-billing.ts·b2b-tuition-load.ts 를 import 하지 않는다 — 순환 참조가 생긴다.
 *    토스 조회는 부르는 쪽이 함수로 넘겨 준다(lookup).
 */

type Env = { DB: any } & Record<string, any>;

export const CLAIM_STALE_MS = 5 * 60 * 1000;   // 토스 승인 요청은 수십 초면 끝난다 — 5분 넘게 쥔 선점은 «죽은» 것으로 본다

export type B2bOrderRef = { kind: 'MGB' | 'MGT'; invoiceId: number; prefix: string };

/** 주문번호에서 «어느 청구서의 주문인가» 를 읽는다. 대리점 주문이 아니면 null. */
export function parseB2bOrder(orderId: any): B2bOrderRef | null {
  const m = /^(MGB|MGT)-(\d+)-/.exec(String(orderId || ''));
  if (!m) return null;
  const id = Number(m[2]);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { kind: m[1] as 'MGB' | 'MGT', invoiceId: id, prefix: `${m[1]}-${id}-` };
}

const TABLE = { MGB: 'ai_billing_invoices', MGT: 'b2b_tuition_invoices' } as const;

/* 선점 칸(confirming_order·confirming_at) — 지연 ALTER.
   ⚠️ «표가 아직 없을 때» 를 «끝났다» 로 기억하면 안 된다 — 나중에 표가 CREATE 로 생기면 그 칸이 없고,
      선점 UPDATE 가 no such column 으로 죽어 그 표의 결제가 전부 막힌다. 두 표 모두 칸을 확인했을 때만 기억한다. */
let _cols = false;
export async function ensureB2bClaimColumns(env: Env): Promise<void> {
  if (_cols) return;
  let done = 0;
  for (const t of [TABLE.MGB, TABLE.MGT]) {
    try {
      const info: any[] = ((await env.DB.prepare(`PRAGMA table_info(${t})`).all())?.results || []) as any[];
      if (!info.length) continue;   // 표가 아직 없음 — 다음에 다시 본다
      const have = new Set(info.map((c: any) => String(c.name)));
      for (const [n, ty] of [['confirming_order', 'TEXT'], ['confirming_at', 'INTEGER']]) {
        if (!have.has(n)) { try { await env.DB.prepare(`ALTER TABLE ${t} ADD COLUMN ${n} ${ty}`).run(); } catch (_) { /* 동시 ALTER — 아래에서 다시 본다 */ } }
      }
      // ALTER 가 «다른 이유로» 실패했을 수 있다 — 다시 재서 두 칸이 정말 있을 때만 끝난 것으로 센다
      const again: any[] = ((await env.DB.prepare(`PRAGMA table_info(${t})`).all())?.results || []) as any[];
      const have2 = new Set(again.map((c: any) => String(c.name)));
      if (have2.has('confirming_order') && have2.has('confirming_at')) done++;
    } catch (_) { /* 다음에 다시 */ }
  }
  if (done === 2) _cols = true;
}
const ensureClaimColumns = ensureB2bClaimColumns;

export type ClaimResult = { ok: boolean; error: string; message: string };
const deny = (error: string, message: string): ClaimResult => ({ ok: false, error, message });
const allow: ClaimResult = { ok: true, error: '', message: '' };

/**
 * 같은 청구서의 «다른» 주문이 승인돼 있나 — DB 의 paid 만 보지 않는다(활성화가 실패했을 수도 있다).
 *   ⚠️ LIKE 대신 instr — 주문번호가 길어도 패턴 한도(50자)에 안 걸린다(CLAUDE.md 2장).
 */
async function paidSiblings(env: Env, ref: B2bOrderRef, self: string): Promise<{ n: number; sum: number }> {
  const r: any = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS s FROM payment_orders
      WHERE instr(order_id, ?) = 1 AND order_id <> ? AND status = 'paid'`
  ).bind(ref.prefix, self).first();
  return { n: Number(r?.n || 0), sum: Number(r?.s || 0) };
}

/**
 * 토스 승인 «직전» 문지기. 통과하면 이 주문이 청구서를 쥔다(confirming_order).
 * @param lookup 토스에 그 주문의 진짜 상태를 묻는 함수(api-pay.ts 의 tossOrderLookup). 못 물으면 null.
 */
export async function claimB2bInvoiceForConfirm(env: Env, orderId: string, amount: number,
  lookup: (orderId: string) => Promise<any | null>, now = Date.now(),
  opts: { mgbAmountNow?: (invoiceId: number) => Promise<number | null> } = {}): Promise<ClaimResult> {
  const ref = parseB2bOrder(orderId);
  if (!ref) return allow;   // 대리점 주문이 아니면 이 문지기와 무관
  try {
    await ensureClaimColumns(env);
    const t = TABLE[ref.kind];
    const inv: any = await env.DB.prepare(`SELECT * FROM ${t} WHERE id = ?`).bind(ref.invoiceId).first();
    if (!inv) return deny('invoice_not_found', '청구서를 찾을 수 없습니다. 본사에 문의해 주세요.');
    const sib = await paidSiblings(env, ref, orderId);
    if (ref.kind === 'MGB') {
      if (inv.status === 'paid' || sib.n > 0) return deny('invoice_already_paid', '이 청구서는 이미 결제되었습니다. 결제가 두 번 되지 않도록 이번 결제는 진행하지 않았습니다.');
      if (inv.status !== 'draft') return deny('invoice_not_payable', '지금은 결제할 수 없는 청구서입니다.');
    } else {
      if (inv.status !== 'issued' && inv.status !== 'partial') return deny('invoice_not_payable', inv.status === 'paid' ? '이 청구서는 이미 결제되었습니다. 결제가 두 번 되지 않도록 이번 결제는 진행하지 않았습니다.' : '본사가 거둔 청구서라 결제할 수 없습니다. 새 청구서를 확인해 주세요.');
      // 낸 돈 = 청구서에 적힌 것과 «승인된 주문 합» 중 큰 쪽(활성화가 실패해 paid_krw 가 안 올라간 경우까지 덮는다)
      const paid = Math.max(Number(inv.paid_krw || 0), sib.sum);
      const owed = Number(inv.due_krw || 0) - paid;
      if (!(Number(amount) <= owed)) return deny('invoice_owed_changed', owed > 0
        ? '결제창을 연 뒤 청구 금액이 바뀌었습니다. 창을 닫고 다시 결제해 주세요.'
        : '이 청구서는 이미 결제되었습니다. 결제가 두 번 되지 않도록 이번 결제는 진행하지 않았습니다.');
    }
    // 다른 주문이 쥐고 있나
    const holder = inv.confirming_order ? String(inv.confirming_order) : '';
    if (holder && holder !== orderId) {
      const fresh = now - Number(inv.confirming_at || 0) < CLAIM_STALE_MS;
      const ho: any = await env.DB.prepare(`SELECT status FROM payment_orders WHERE order_id = ?`).bind(holder).first();
      const holderDone = !!ho && (ho.status === 'paid' || ho.status === 'cancelled');
      // MGT 는 앞 주문이 끝났으면(위에서 낼 돈까지 다시 쟀다) 넘겨받아도 된다. MGB 는 paid 면 이미 위에서 막혔다.
      // ⛔ 'failed' 는 «끝남» 이 아니다 — 토스 5xx·응답 깨짐도 failed 로 적힌다(승인됐을 수도). 그래서 토스에 묻는다.
      //    (분명한 거절이면 api-pay.ts 가 이미 선점을 놓았으므로, 선점이 남은 failed 는 «결과를 모르는» 쪽이다)
      if (!holderDone) {
        if (fresh && ho?.status !== 'failed') return deny('invoice_confirm_in_progress', '같은 청구서의 다른 결제가 지금 승인 중입니다. 결제가 두 번 되지 않도록 이번 결제는 진행하지 않았습니다. 잠시 뒤 청구서 상태를 확인해 주세요.');
        // 오래된 선점 — 토스가 그 주문을 정말 승인했는지 물어본다. 모르면 막는다.
        const p = await lookup(holder);
        if (!p) return deny('invoice_confirm_unknown', '같은 청구서의 이전 결제 상태를 확인하지 못했습니다. 결제가 두 번 되지 않도록 이번 결제는 진행하지 않았습니다. 잠시 뒤 다시 시도해 주세요.');
        // 넘겨받아도 되는 것은 «돈이 안 나갔다» 가 확실할 때뿐 — 토스가 모름(NOT_FOUND)·준비만(READY)·중단·만료·전액 취소.
        //   그 밖(DONE·입금대기·승인 진행·부분 취소·처음 보는 상태)은 전부 막는다.
        const SAFE = ['NOT_FOUND', 'READY', 'ABORTED', 'EXPIRED', 'CANCELED'];
        if (!SAFE.includes(String(p.status))) {
          return deny('invoice_already_paid', '같은 청구서의 이전 결제가 이미 승인되어 있습니다. 결제가 두 번 되지 않도록 이번 결제는 진행하지 않았습니다.');
        }
      }
    }
    // 선점 — 쥔 사람이 없거나, 나거나, 위에서 넘겨받아도 된다고 판정한 그 주문일 때만
    //   + 청구서 상태·남은 금액도 «쓰는 순간» DB 가 한 번 더 본다(읽은 뒤 그 사이 다른 결제가 확정됐을 수 있다)
    const stateCond = ref.kind === 'MGB' ? `status = 'draft'` : `status IN ('issued','partial') AND due_krw - paid_krw >= ?`;
    const binds: any[] = [orderId, now, ref.invoiceId, orderId, holder || orderId];
    if (ref.kind === 'MGT') binds.push(Math.round(Number(amount)));
    const r: any = await env.DB.prepare(
      `UPDATE ${t} SET confirming_order = ?, confirming_at = ? WHERE id = ? AND (confirming_order IS NULL OR confirming_order = ? OR confirming_order = ?) AND ${stateCond}`
    ).bind(...binds).run();
    if (!(Number(r?.meta?.changes || 0) > 0)) return deny('invoice_confirm_in_progress', '같은 청구서의 다른 결제가 지금 승인 중입니다. 결제가 두 번 되지 않도록 이번 결제는 진행하지 않았습니다.');
    /* ③ (2026-10-23) AI 컨텐츠는 결제창을 연 «뒤» 에도 학생 체크를 바꿀 수 있다 — 금액은 checkout 순간에 정해지고
       활성화는 «지금 체크된 학생» 에게 이용권을 준다. 그래서 낸 돈과 열린 학생 수가 갈렸다(30명분 내고 50명 활성화).
       ⚠️ 선점을 «쥔 뒤» 에 다시 잰다 — 쥔 동안(5분)은 명단 바꾸기가 막히므로(MGB_UNCLAIMED_SQL) 보통은 여기서 잰 금액이 곧 활성화 금액이다.
       ⚠️ 다만 «항상» 은 아니다: 승인 응답이 끊겨(502) 선점이 5분 뒤 풀린 사이 명단을 바꾸고, 그 뒤 웹훅이 DONE 을 알리면
          활성화는 «그때 체크된 학생» 에게 간다. 그 어긋남은 activateB2bAiInvoicePayment 가 console.error 로만 남긴다(점검 항목 아님).
       ⛔ 못 재면(null·함수 없음) 막는다 — 막아도 돈은 안 나간다. */
    if (ref.kind === 'MGB') {
      let want: number | null = null;
      try { want = opts.mgbAmountNow ? await opts.mgbAmountNow(ref.invoiceId) : null; } catch (_) { want = null; }
      if (want == null || Math.round(Number(want)) !== Math.round(Number(amount))) {
        await releaseB2bInvoiceClaim(env, orderId);
        return deny(want == null ? 'invoice_check_failed' : 'invoice_amount_changed', want == null
          ? '청구서 금액을 확인하지 못해 결제를 진행하지 않았습니다. 잠시 뒤 다시 시도해 주세요.'
          : '결제창을 연 뒤 결제할 학생 명단이 바뀌었습니다(지금 금액 ' + Math.round(Number(want)).toLocaleString('ko-KR') + '원). 창을 닫고 다시 결제해 주세요.');
      }
    }
    return allow;
  } catch (e: any) {
    console.error('[b2b-pay-guard] 선점 실패 — 막는 쪽으로 처리:', e?.message || e, 'order=', orderId);
    return deny('invoice_check_failed', '청구서 상태를 확인하지 못해 결제를 진행하지 않았습니다. 잠시 뒤 다시 시도해 주세요.');
  }
}

/**
 * ③ AI 컨텐츠 명세(학생 체크)를 바꾸는 쓰기에 붙이는 조건 — «지금 승인 중인 주문이 없을 때만».
 *   bind 순서: (invoiceId, now - CLAIM_STALE_MS) → mgbUnclaimedBinds().
 *   ⚠️ 선점 칸은 지연 ALTER 라, 이 조건을 쓰기 전에 ensureB2bClaimColumns 를 부른다(없으면 쓰기가 실패 = 바뀌지 않는 쪽).
 */
export const MGB_UNCLAIMED_SQL = `NOT EXISTS (SELECT 1 FROM ai_billing_invoices zc WHERE zc.id = ? AND zc.confirming_order IS NOT NULL AND zc.confirming_at > ?)`;
export function mgbUnclaimedBinds(invoiceId: number, now = Date.now()): any[] { return [invoiceId, now - CLAIM_STALE_MS]; }
/** 이 청구서가 지금 «승인 중» 인가 — 화면에 먼저 알려 주려는 용도(최종 판정은 위 조건이 DB 에서 한다). 모르면 null. */
export async function mgbClaimedNow(env: Env, invoiceId: number, now = Date.now()): Promise<boolean | null> {
  try {
    await ensureClaimColumns(env);
    const r: any = await env.DB.prepare(`SELECT confirming_order AS o, confirming_at AS t FROM ai_billing_invoices WHERE id = ?`).bind(invoiceId).first();
    if (!r) return false;
    return !!r.o && Number(r.t || 0) > now - CLAIM_STALE_MS;
  } catch (_) { return null; }
}

/**
 * 토스에 «그 주문이 정말 어떻게 됐나» 를 묻는다(confirm 문지기·자동결제 공용 정본, 2026-10-23 api-pay.ts 에서 옮김).
 *   404 = 토스가 모르는 주문(돈 안 나감) → { status: 'NOT_FOUND' }. 그 밖의 실패·예외는 null(=모름 → 부르는 쪽이 막는다).
 */
export async function tossOrderProbe(env: Env, orderId: string): Promise<any | null> {
  try {
    const auth = 'Basic ' + btoa(String(env.TOSS_SECRET_KEY) + ':');
    const r = await fetch(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`, { headers: { 'Authorization': auth } });
    if (r.status === 404) return { status: 'NOT_FOUND' };
    if (!r.ok) return null;
    const j: any = await r.json();
    return j && j.status ? j : null;
  } catch (_) { return null; }
}

/** 승인이 «확실히 실패» 했을 때만 놓는다(네트워크가 끊겨 결과를 모르면 놓지 않는다 — 오래된 선점 판정이 토스에 다시 묻는다). */
export async function releaseB2bInvoiceClaim(env: Env, orderId: string): Promise<void> {
  const ref = parseB2bOrder(orderId);
  if (!ref) return;
  try {
    await env.DB.prepare(`UPDATE ${TABLE[ref.kind]} SET confirming_order = NULL, confirming_at = NULL WHERE id = ? AND confirming_order = ?`)
      .bind(ref.invoiceId, orderId).run();
  } catch (e: any) { console.warn('[b2b-pay-guard] 선점 해제 실패(5분 뒤 저절로 풀림):', e?.message || e); }
}

// ───────────────────────── 취소 되돌리기 ─────────────────────────

async function ensureCancelTable(env: Env): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS b2b_payment_cancels (ref TEXT PRIMARY KEY, order_id TEXT NOT NULL, kind TEXT NOT NULL, invoice_id INTEGER NOT NULL, amount INTEGER NOT NULL, full_cancel INTEGER NOT NULL DEFAULT 0, applied TEXT, source TEXT, created_at INTEGER NOT NULL)`);
}

export type CancelEvent = { ref: string; amount: number };

/**
 * 토스 결제 객체에서 «취소 한 건 한 건» 을 뽑는다. 취소마다 transactionKey 가 있어 그것을 ref 로 쓴다.
 *   cancels 가 비어 있는데 전액 취소(CANCELED)라고만 오면 «주문 전체 1건» 으로 본다.
 *   부분 취소인데 내역이 없으면 금액을 지어내지 않고 빈 목록(사람이 본다).
 */
export function cancelEventsOf(orderId: string, pay: any, orderAmount: number): CancelEvent[] {
  const list = Array.isArray(pay?.cancels) ? pay.cancels : [];
  const out: CancelEvent[] = [];
  list.forEach((c: any, i: number) => {
    const amt = Math.round(Number(c?.cancelAmount));
    if (!(amt > 0)) return;
    const key = String(c?.transactionKey || '').trim();
    out.push({ ref: key ? `TX-${key}` : `ORD-${orderId}-${i}`, amount: amt });
  });
  if (!out.length && String(pay?.status || '') === 'CANCELED' && orderAmount > 0) out.push({ ref: `ORD-${orderId}-ALL`, amount: Math.round(orderAmount) });
  return out;
}

/** 이 주문이 «전부» 취소됐나 — 토스가 말한 남은 금액(balanceAmount)이 0 이거나 상태가 CANCELED. */
export function isFullCancel(pay: any, orderAmount: number, events: CancelEvent[]): boolean {
  if (String(pay?.status || '') === 'CANCELED') return true;
  const bal = Number(pay?.balanceAmount);
  if (Number.isFinite(bal) && pay?.balanceAmount != null) return bal <= 0;
  return events.reduce((a, e) => a + e.amount, 0) >= orderAmount;
}

/**
 * 취소를 청구서·이용권·충전금에 반영한다. 웹훅·앱 환불 공용, 멱등.
 * 던지지 않는다 — 취소는 이미 토스에서 일어났다. 못 한 것은 돌려주는 값과 로그로 알린다.
 */
export async function revertB2bOnCancel(env: Env, orderId: string, pay: any, source: string, now = Date.now()):
  Promise<{ b2b: boolean; applied: string[]; warnings: string[] }> {
  const ref = parseB2bOrder(orderId);
  const res = { b2b: !!ref, applied: [] as string[], warnings: [] as string[] };
  if (!ref) return res;
  try {
    await ensureClaimColumns(env);
    await ensureCancelTable(env);
    const o: any = await env.DB.prepare(`SELECT amount FROM payment_orders WHERE order_id = ?`).bind(orderId).first();
    const orderAmount = Number(o?.amount || pay?.totalAmount || 0);
    const events = cancelEventsOf(orderId, pay, orderAmount);
    const full = isFullCancel(pay, orderAmount, events);
    if (!events.length) { res.warnings.push('취소 금액을 알 수 없어 청구서를 자동으로 되돌리지 않았습니다 — 토스 상점관리자에서 확인해 주세요.'); return res; }

    /* 멱등 키(b2b_payment_cancels) — 효과가 «성공한 뒤» 에만 남긴다. 키를 먼저 다 먹고 효과가 실패하면
       웹훅 재전송·앱 환불이 다시 와도 «이미 처리» 로 빠져 영영 안 되돌려진다. 실패하면 키를 지운다. */
    const fresh: CancelEvent[] = [];
    const claimKey = async (ev: CancelEvent): Promise<boolean> => {
      const ins: any = await env.DB.prepare(
        `INSERT OR IGNORE INTO b2b_payment_cancels (ref, order_id, kind, invoice_id, amount, full_cancel, source, created_at) VALUES (?,?,?,?,?,?,?,?)`
      ).bind(ev.ref, orderId, ref.kind, ref.invoiceId, ev.amount, full ? 1 : 0, source, now).run();
      return Number(ins?.meta?.changes || 0) > 0;
    };
    const dropKey = async (ev: CancelEvent) => {
      try { await env.DB.prepare(`DELETE FROM b2b_payment_cancels WHERE ref = ? AND applied IS NULL`).bind(ev.ref).run(); }
      catch (e: any) { console.error('[b2b-pay-guard] 🚨 취소 기록을 되돌리지 못함 — 이 취소는 자동으로 다시 안 됨', ev.ref, e?.message || e); }
    };

    if (ref.kind === 'MGT') {
      for (const ev of events) {
        if (!(await claimKey(ev))) continue;   // 이미 처리한 취소
        try {
          const w: any = await env.DB.prepare(
            `INSERT OR IGNORE INTO b2b_wallet_entries (shop_name, kind, amount, memo, ref, created_by, created_at)
             SELECT shop_name, 'invoice_refund', ?, ?, ?, ?, ? FROM b2b_tuition_invoices WHERE id = ?`
          ).bind(-ev.amount, `청구서 #${ref.invoiceId} 결제 취소 (${orderId})`, `REFUND-${ev.ref}`, source, now, ref.invoiceId).run();
          if (!(Number(w?.meta?.changes || 0) > 0)) {
            const had: any = await env.DB.prepare(`SELECT 1 AS x FROM b2b_wallet_entries WHERE ref = ?`).bind(`REFUND-${ev.ref}`).first();
            if (had) { fresh.push(ev); continue; }   // 충전금은 이미 되돌려져 있다(앞 시도가 키만 못 남김) — 청구서는 그때 같이 됐다
            await dropKey(ev);
            res.warnings.push(`청구서 #${ref.invoiceId} 를 찾지 못해 충전금을 되돌리지 못했습니다(${ev.ref}).`);
            continue;
          }
          // 낸 돈을 줄이고 상태를 다시 매긴다 — 거둔(void) 청구서는 그대로 둔다
          await env.DB.prepare(
            `UPDATE b2b_tuition_invoices SET
                paid_krw = MAX(0, paid_krw - ?),
                status = CASE WHEN status = 'void' THEN status
                              WHEN MAX(0, paid_krw - ?) <= 0 THEN 'issued'
                              WHEN MAX(0, paid_krw - ?) < due_krw THEN 'partial' ELSE 'paid' END,
                paid_at = CASE WHEN MAX(0, paid_krw - ?) <= 0 THEN NULL ELSE paid_at END,
                confirming_order = CASE WHEN confirming_order = ? THEN NULL ELSE confirming_order END,
                updated_at = ?
              WHERE id = ?`
          ).bind(ev.amount, ev.amount, ev.amount, ev.amount, orderId, now, ref.invoiceId).run();
          fresh.push(ev);
          res.applied.push(`충전금 −₩${ev.amount.toLocaleString('ko-KR')}`);
        } catch (e: any) {
          // 충전금 원장(REFUND-ref)이 이미 들어갔으면 키를 지우지 않는다 — 다시 와도 충전금은 ref UNIQUE 로 안 겹치지만
          // 청구서 UPDATE 만 다시 돌면 낸 돈이 두 번 줄어든다. 사람이 본다.
          const had: any = await env.DB.prepare(`SELECT 1 AS x FROM b2b_wallet_entries WHERE ref = ?`).bind(`REFUND-${ev.ref}`).first().catch(() => null);
          if (!had) await dropKey(ev);
          res.warnings.push(`취소 반영 중 오류(${ev.ref}) — ${had ? '충전금만 되돌려졌습니다. 청구서 낸 돈을 직접 확인해 주세요' : '다음 알림 때 다시 시도합니다'}: ` + String(e?.message || e));
        }
      }
    } else {
      for (const ev of events) if (await claimKey(ev)) fresh.push(ev);
      if (!full) {
        if (fresh.length) {
          await env.DB.prepare(`UPDATE b2b_payment_cancels SET applied = 'needs_review' WHERE order_id = ? AND applied IS NULL`).bind(orderId).run();
          res.warnings.push('AI 컨텐츠 결제의 «일부» 취소는 어느 학생 몫인지 알 수 없어 청구서·이용권을 자동으로 바꾸지 않았습니다 — 본사가 직접 정리해 주세요.');
        }
        return res;
      }
      if (fresh.length) {
        try {
          // 전액 취소 — 그 주문이 «청구서의» 주문일 때만 청구서를 되돌린다(중복 결제분을 취소한 경우 청구서는 그대로)
          const u: any = await env.DB.prepare(
            `UPDATE ai_billing_invoices SET status = 'draft', paid_at = NULL, order_id = NULL, confirming_order = NULL, confirming_at = NULL
              WHERE id = ? AND status = 'paid' AND order_id = ?`
          ).bind(ref.invoiceId, orderId).run();
          if (Number(u?.meta?.changes || 0) > 0) res.applied.push('청구서를 미결제로 되돌림');
          else await env.DB.prepare(`UPDATE ai_billing_invoices SET confirming_order = NULL, confirming_at = NULL WHERE id = ? AND confirming_order = ?`).bind(ref.invoiceId, orderId).run();
          // 그 주문으로 만든 수강 기록만(주문번호가 notes 에 박혀 있다). ⚠️ instr — LIKE 패턴 한도 회피
          const e: any = await env.DB.prepare(
            `UPDATE enrollments SET status = 'refunded', updated_at = ? WHERE instr(notes, ?) > 0 AND status = 'active'`
          ).bind(now, orderId).run();
          const n = Number(e?.meta?.changes || 0);
          if (n > 0) res.applied.push(`A.i 이용권 ${n}명 종료`);
        } catch (e: any) {
          // 두 UPDATE 다 «다시 돌려도 같은 결과» 라 키를 지워 다음 알림 때 다시 시도하게 한다
          for (const ev of fresh) await dropKey(ev);
          fresh.length = 0;
          res.warnings.push('청구서·이용권을 되돌리지 못했습니다(다음 알림 때 다시 시도): ' + String(e?.message || e));
        }
      }
    }
    if (fresh.length) await env.DB.prepare(`UPDATE b2b_payment_cancels SET applied = COALESCE(applied, ?) WHERE order_id = ?`).bind(res.applied.join(' · ') || 'none', orderId).run();
  } catch (e: any) {
    console.error('[b2b-pay-guard] 취소 되돌리기 실패:', e?.message || e, 'order=', orderId);
    res.warnings.push('청구서를 되돌리지 못했습니다: ' + String(e?.message || e));
  }
  if (res.warnings.length) console.warn('[b2b-pay-guard]', orderId, res.warnings.join(' / '));
  return res;
}

/** 결제 점검용 — 같은 청구서에 승인된 주문이 둘 이상(MGB) 이거나, 낸 돈이 청구액을 넘는(MGT) 청구서. */
export async function findB2bDoublePaid(env: Env, sinceMs: number): Promise<any[]> {
  const rows: any[] = ((await env.DB.prepare(
    `SELECT order_id, amount FROM payment_orders WHERE status = 'paid' AND paid_at >= ? AND (instr(order_id,'MGB-') = 1 OR instr(order_id,'MGT-') = 1)`
  ).bind(sinceMs).all())?.results || []) as any[];
  const g = new Map<string, { kind: string; invoice_id: number; orders: string[]; total: number }>();
  for (const r of rows) {
    const ref = parseB2bOrder(r.order_id);
    if (!ref) continue;
    const k = ref.prefix;
    const x = g.get(k) || { kind: ref.kind, invoice_id: ref.invoiceId, orders: [], total: 0 };
    x.orders.push(String(r.order_id)); x.total += Number(r.amount || 0);
    g.set(k, x);
  }
  const out: any[] = [];
  for (const x of g.values()) {
    if (x.kind === 'MGB' && x.orders.length >= 2) out.push(x);
    if (x.kind === 'MGT' && x.orders.length >= 2) {
      const inv: any = await env.DB.prepare(`SELECT due_krw FROM b2b_tuition_invoices WHERE id = ?`).bind(x.invoice_id).first().catch(() => null);
      if (inv && x.total > Number(inv.due_krw || 0)) out.push({ ...x, due_krw: Number(inv.due_krw) });
    }
  }
  return out;
}
