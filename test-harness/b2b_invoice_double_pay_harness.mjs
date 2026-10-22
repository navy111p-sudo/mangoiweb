#!/usr/bin/env node
/**
 * 🏢 대리점 청구서 결제(MGB- AI 컨텐츠 · MGT- 화상영어 수업료) — 이중결제·취소 되돌리기 (2026-10-22)
 *
 * 무엇을 지키나 (정본 cloudflare-deploy/src/b2b-pay-guard.ts · api-pay.ts confirm/webhook · 두 활성화 함수)
 *   ① 같은 청구서에 주문이 둘 생겨도 토스 «승인» 은 한 번만 나간다(차례대로·동시에·옛 선점 넘겨받기)
 *   ② 토스 취소가 오면 청구서·이용권·충전금이 되돌아간다(전액·부분·두 번 와도 한 번만)
 *   그리고 짝 — «막는다» 옆에 «정상 결제는 그대로 된다» 를 둔다(짝이 없으면 «전부 막기» 도 통과한다).
 *
 * 방법: 소스를 그대로 import 해 메모리 SQLite(D1 모양) + 가짜 토스로 «실제 핸들러» 를 돌린다.
 *       표 정의(CREATE)는 소스에서 읽는다 — 하니스에 베끼지 않는다.
 * 변이시험: B2B_MUTATE=1 이면 고친 자리를 하나씩 되돌린 «사본» 으로 다시 돌려 실제로 FAIL 이 나는지 본다
 *           (저장소 파일은 안 건드린다).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

/* ═════════════════════════════ 자식 ═════════════════════════════ */
if (process.env.B2B_CHILD === '1') {
  const SRC = process.env.B2B_SRC;
  const results = [];
  const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail: cond ? '' : String(detail) });
  const fin = () => { writeFileSync(process.env.B2B_RESULT, JSON.stringify(results)); process.exit(0); };
  process.on('uncaughtException', (e) => { results.push({ name: '자식 예외', pass: false, detail: String(e?.stack || e).slice(0, 800) }); fin(); });

  let NOW = Date.parse('2026-10-22T10:00:00+09:00');
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } }
  globalThis.Date = FakeDate;
  console.warn = () => {}; console.error = () => {}; console.log = () => {};

  const { DatabaseSync } = await import('node:sqlite');
  const imp = (f) => import(pathToFileURL(join(SRC, f)).href);
  const { handlePayApi, runPaymentAudit } = await imp('api-pay.ts');
  const { activateB2bAiInvoicePayment } = await imp('ai-billing.ts');
  const { activateB2bTuitionPayment } = await imp('b2b-tuition-load.ts');
  const guard = await imp('b2b-pay-guard.ts');

  // ── 가짜 토스 ──
  const tick = () => new Promise((r) => setImmediate(r));
  const toss = new Map();      // orderId → 결제 객체
  const plan = new Map();      // orderId → 'decline' | 'network' | 'network_after'
  const charges = [];          // 실제로 «돈이 나간» 승인
  const resp = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = String(init.method || 'GET').toUpperCase();
    await tick();
    if (url === 'https://api.tosspayments.com/v1/payments/confirm' && method === 'POST') {
      const b = JSON.parse(String(init.body || '{}'));
      const pl = plan.get(b.orderId);
      if (pl === 'network') throw new Error('socket hang up');
      const ex = toss.get(b.orderId);
      if (ex && ex.status === 'DONE') return resp(400, { code: 'ALREADY_PROCESSED_PAYMENT', message: '이미 처리된 결제' });
      if (pl === 'decline') return resp(400, { code: 'REJECT_CARD_COMPANY', message: '카드사 거절' });
      const rec = { status: 'DONE', totalAmount: b.amount, balanceAmount: b.amount, paymentKey: b.paymentKey, orderId: b.orderId, method: '카드', cancels: [] };
      toss.set(b.orderId, rec); charges.push({ orderId: b.orderId, amount: b.amount });
      if (pl === 'network_after') throw new Error('socket hang up after approve');
      return resp(200, rec);
    }
    const m = /^https:\/\/api\.tosspayments\.com\/v1\/payments\/orders\/(.+)$/.exec(url);
    if (m && method === 'GET') { const rec = toss.get(decodeURIComponent(m[1])); return rec ? resp(200, rec) : resp(404, { code: 'NOT_FOUND_PAYMENT' }); }
    if (/tosspayments\.com/.test(url)) return resp(404, { code: 'UNHANDLED' });
    return resp(200, { ok: true });   // 문자 등
  };

  // ── 메모리 SQLite (D1 모양) ──
  const sq = new DatabaseSync(':memory:');
  const norm = (v) => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const mk = (sql, args) => {
    const st = {
      __sql: sql, __args: args,
      bind: (...b) => mk(sql, b.map(norm)),
      async first(col) { await tick(); const r = sq.prepare(sql).get(...args); if (!r) return null; return col ? r[col] : { ...r }; },
      async all() { await tick(); return { results: sq.prepare(sql).all(...args).map((r) => ({ ...r })), success: true, meta: {} }; },
      async run() { await tick(); const r = sq.prepare(sql).run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    };
    return st;
  };
  const DB = {
    prepare: (sql) => mk(sql, []),
    async exec(sql) { await tick(); sq.exec(sql); return { count: 1 }; },
    async batch(stmts) {
      await tick(); sq.exec('BEGIN IMMEDIATE');
      try { const res = stmts.map((s) => { const r = sq.prepare(s.__sql).run(...s.__args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }); sq.exec('COMMIT'); return res; }
      catch (e) { sq.exec('ROLLBACK'); throw e; }
    },
  };
  const env = { DB, TOSS_SECRET_KEY: 'test_sk_harnessKey01', TOSS_CLIENT_KEY: 'test_ck_harnessKey01', ROOM_JWT_SECRET: 'h' };

  // ── 표 정의는 소스에서 읽는다 ──
  const aiSrc = readFileSync(join(SRC, 'ai-billing.ts'), 'utf8');
  const tuSrc = readFileSync(join(SRC, 'b2b-tuition-load.ts'), 'utf8');
  const ddl = (src, name) => { const m = new RegExp('`(CREATE TABLE IF NOT EXISTS ' + name + '\\s*\\([\\s\\S]*?\\))`').exec(src); return m ? m[1] : null; };
  const need = [[aiSrc, 'ai_billing_invoices'], [aiSrc, 'ai_billing_invoice_items'], [tuSrc, 'b2b_wallet_entries'], [tuSrc, 'b2b_tuition_invoices']];
  for (const [src, n] of need) { const d = ddl(src, n); ok(`전제: ${n} 정의를 소스에서 읽음`, !!d); if (d) sq.exec(d); }
  sq.exec(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);

  const BASE = 'https://mangoi.ai';
  const call = async (path, body) => {
    const r = new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const res = await handlePayApi(r, new URL(r.url), env);
    return { status: res ? res.status : 0, body: res ? await res.json().catch(() => ({})) : {} };
  };
  await call('/api/pay/order/none', {});   // ensurePayTable
  for (const c of ['enroll_json TEXT', 'refunded_amount INTEGER', 'refunded_at INTEGER']) { try { sq.exec(`ALTER TABLE payment_orders ADD COLUMN ${c}`); } catch {} }

  let seq = 0;
  const newOrder = (kind, invId, amount) => {
    const id = `${kind}-${invId}-H${++seq}-aa${seq}`;
    sq.prepare(`INSERT INTO payment_orders (order_id, uid, program, amount, status, method, created_at) VALUES (?, NULL, ?, ?, 'pending', 'card', ?)`).run(id, kind === 'MGB' ? 'b2b_ai_monthly' : 'b2b_tuition', amount, NOW);
    return id;
  };
  const confirm = (orderId, amount) => call('/api/pay/confirm', { paymentKey: 'pk_' + orderId, orderId, amount });
  const webhook = (orderId) => call('/api/pay/webhook', { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId } });
  const chargesOf = (prefix) => charges.filter((c) => c.orderId.startsWith(prefix)).length;
  const mgbInv = (id, shop, n) => {
    sq.prepare(`INSERT INTO ai_billing_invoices (id, shop_name, billing_month, rate_krw, status, generated_at) VALUES (?, ?, '2026-11', 5000, 'draft', ?)`).run(id, shop, NOW);
    for (let i = 0; i < n; i++) sq.prepare(`INSERT INTO ai_billing_invoice_items (invoice_id, student_user_id, student_name, included, created_at) VALUES (?, ?, ?, 1, ?)`).run(id, `${shop}_s${i}`, `학생${i}`, NOW);
  };
  const mgtInv = (id, shop, due, status = 'issued') => sq.prepare(`INSERT INTO b2b_tuition_invoices (id, shop_name, kind, month, seq, status, due_krw, paid_krw, created_at) VALUES (?, ?, 'monthly', '2026-11', 1, ?, ?, 0, ?)`).run(id, shop, status, due, NOW);
  const row = (sql, ...a) => sq.prepare(sql).get(...a);
  const cnt = (sql, ...a) => Number(Object.values(sq.prepare(sql).get(...a))[0]);
  const enrolled = (orderId) => cnt(`SELECT COUNT(*) FROM enrollments WHERE instr(notes, ?) > 0 AND status='active'`, orderId);
  const cancelToss = (orderId, parts) => {   // parts: [[금액, txKey], ...] — 누적
    const rec = toss.get(orderId);
    rec.cancels = parts.map(([a, k]) => ({ cancelAmount: a, transactionKey: k }));
    const sum = parts.reduce((x, [a]) => x + a, 0);
    rec.balanceAmount = rec.totalAmount - sum;
    rec.status = rec.balanceAmount <= 0 ? 'CANCELED' : 'PARTIAL_CANCELED';
  };

  /* ── S1 AI 컨텐츠: 같은 청구서 두 주문, 차례대로 ── */
  mgbInv(101, '학원A', 3);
  const a1 = newOrder('MGB', 101, 15000), a2 = newOrder('MGB', 101, 15000);
  const r1 = await confirm(a1, 15000);
  ok('S1 첫 결제는 성공한다(짝)', r1.body.ok === true, JSON.stringify(r1.body));
  ok('S1 첫 결제로 학생 3명 이용권', enrolled(a1) === 3, enrolled(a1));
  const r2 = await confirm(a2, 15000);
  ok('S1 두 번째 주문은 409 로 막힌다', r2.status === 409 && r2.body.ok === false, JSON.stringify(r2.body));
  ok('S1 토스 승인은 한 번뿐', chargesOf('MGB-101-') === 1, chargesOf('MGB-101-'));
  ok('S1 막힌 주문은 failed', row(`SELECT status FROM payment_orders WHERE order_id=?`, a2)?.status === 'failed');

  /* ── S2 AI 컨텐츠: 두 주문 «동시에» ── */
  mgbInv(102, '학원B', 2);
  const b1 = newOrder('MGB', 102, 10000), b2 = newOrder('MGB', 102, 10000);
  const [q1, q2] = await Promise.all([confirm(b1, 10000), confirm(b2, 10000)]);
  ok('S2 동시에 와도 토스 승인은 한 번', chargesOf('MGB-102-') === 1, chargesOf('MGB-102-'));
  ok('S2 하나는 성공·하나는 막힘', [q1, q2].filter((q) => q.body.ok === true).length === 1, JSON.stringify([q1.body, q2.body]));
  ok('S2 이용권은 두 명 한 벌', cnt(`SELECT COUNT(*) FROM enrollments WHERE instr(notes,'MGB-102-')>0`) === 2);

  /* ── S3 승인 요청이 끊긴 주문의 선점: 5분 안엔 막고, 토스가 그 주문을 모르면 넘겨받는다 ── */
  mgbInv(103, '학원C', 1);
  const c1 = newOrder('MGB', 103, 5000), c2 = newOrder('MGB', 103, 5000);
  plan.set(c1, 'network');
  const n1 = await confirm(c1, 5000);
  ok('S3 끊긴 승인은 502', n1.status === 502, n1.status);
  const n2 = await confirm(c2, 5000);
  ok('S3 5분 안엔 다른 주문이 막힌다(승인 중)', n2.status === 409 && n2.body.error === 'invoice_confirm_in_progress', JSON.stringify(n2.body));
  NOW += 6 * 60 * 1000;
  const c3 = newOrder('MGB', 103, 5000);
  const n3 = await confirm(c3, 5000);
  ok('S3 5분 뒤 토스가 앞 주문을 모르면 넘겨받아 결제된다', n3.body.ok === true && chargesOf('MGB-103-') === 1, JSON.stringify(n3.body));

  /* ── S4 승인은 됐는데 응답만 끊긴 경우: 5분 뒤에도 넘겨주지 않는다 ── */
  mgbInv(104, '학원D', 1);
  const d1 = newOrder('MGB', 104, 5000);
  plan.set(d1, 'network_after');
  await confirm(d1, 5000);
  NOW += 6 * 60 * 1000;
  const d2 = newOrder('MGB', 104, 5000);
  const m2 = await confirm(d2, 5000);
  ok('S4 앞 주문이 토스에서 승인됐으면 막는다', m2.status === 409 && chargesOf('MGB-104-') === 1, JSON.stringify(m2.body) + ' charges=' + chargesOf('MGB-104-'));
  await webhook(d1);
  ok('S4 웹훅이 앞 주문을 확정한다(짝)', row(`SELECT status FROM ai_billing_invoices WHERE id=104`)?.status === 'paid');

  /* ── S5 카드 거절은 선점을 놓아 바로 다시 낼 수 있다 ── */
  mgbInv(105, '학원E', 1);
  const e1 = newOrder('MGB', 105, 5000), e2 = newOrder('MGB', 105, 5000);
  plan.set(e1, 'decline');
  await confirm(e1, 5000);
  const s5 = await confirm(e2, 5000);
  ok('S5 거절 뒤 새 주문은 곧바로 결제된다', s5.body.ok === true, JSON.stringify(s5.body));

  /* ── S6 화상영어 수업료: 두 주문 차례대로·동시에 ── */
  mgtInv(201, '학원F', 100000);
  const f1 = newOrder('MGT', 201, 100000), f2 = newOrder('MGT', 201, 100000);
  const t1 = await confirm(f1, 100000);
  ok('S6 첫 결제 성공(짝)', t1.body.ok === true, JSON.stringify(t1.body));
  const t2 = await confirm(f2, 100000);
  ok('S6 다 낸 청구서의 두 번째 주문은 막힌다', t2.status === 409 && chargesOf('MGT-201-') === 1, JSON.stringify(t2.body));
  ok('S6 충전금은 한 번만', cnt(`SELECT COALESCE(SUM(amount),0) FROM b2b_wallet_entries WHERE shop_name='학원F'`) === 100000);
  mgtInv(202, '학원G', 80000);
  const g1 = newOrder('MGT', 202, 80000), g2 = newOrder('MGT', 202, 80000);
  await Promise.all([confirm(g1, 80000), confirm(g2, 80000)]);
  ok('S6 동시에 와도 승인 한 번', chargesOf('MGT-202-') === 1, chargesOf('MGT-202-'));
  const g = row(`SELECT status, paid_krw FROM b2b_tuition_invoices WHERE id=202`);
  ok('S6 청구서는 완납·낸 돈 = 청구액', g?.status === 'paid' && Number(g.paid_krw) === 80000, JSON.stringify(g));

  /* ── S7 거둔(void) 청구서·금액이 줄어든 청구서는 옛 주문으로 결제되지 않는다 ── */
  mgtInv(203, '학원H', 50000, 'void');
  const h1 = newOrder('MGT', 203, 50000);
  const v = await confirm(h1, 50000);
  ok('S7 거둔 청구서는 막힌다', v.status === 409 && chargesOf('MGT-203-') === 0, JSON.stringify(v.body));
  mgtInv(204, '학원I', 60000);
  const i1 = newOrder('MGT', 204, 60000);
  sq.prepare(`UPDATE b2b_tuition_invoices SET due_krw = 40000 WHERE id = 204`).run();
  const v2 = await confirm(i1, 60000);
  ok('S7 금액이 줄어든 청구서에 옛 금액 결제는 막힌다', v2.status === 409 && chargesOf('MGT-204-') === 0, JSON.stringify(v2.body));

  /* ── S8 활성화 직접 동시 호출: 두 벌 안 생긴다·낸 돈이 사라지지 않는다 ── */
  mgbInv(106, '학원J', 4);
  await Promise.all([activateB2bAiInvoicePayment(env, 'MGB-106-X1-a', 20000, NOW), activateB2bAiInvoicePayment(env, 'MGB-106-X2-b', 20000, NOW)]);
  ok('S8 AI 컨텐츠 동시 확정에도 이용권은 4명 한 벌', cnt(`SELECT COUNT(*) FROM enrollments WHERE instr(notes,'MGB-106-')>0`) === 4, cnt(`SELECT COUNT(*) FROM enrollments WHERE instr(notes,'MGB-106-')>0`));
  mgtInv(205, '학원K', 100000);
  await Promise.all([activateB2bTuitionPayment(env, 'MGT-205-Y1-a', 40000, NOW), activateB2bTuitionPayment(env, 'MGT-205-Y2-b', 40000, NOW)]);
  const k = row(`SELECT status, paid_krw FROM b2b_tuition_invoices WHERE id=205`);
  ok('S8 수업료 동시 확정에도 낸 돈 80,000 이 다 적힌다', Number(k?.paid_krw) === 80000 && k.status === 'partial', JSON.stringify(k));

  /* ── S9 AI 컨텐츠 전액 취소 → 청구서 미결제·이용권 종료 · 두 번 와도 한 번 · 다시 결제 가능 ── */
  cancelToss(a1, [[15000, 'tx-a1']]);
  const w1 = await webhook(a1);
  const inv101 = row(`SELECT status, order_id FROM ai_billing_invoices WHERE id=101`);
  ok('S9 전액 취소면 청구서가 미결제로 돌아간다', inv101?.status === 'draft' && inv101.order_id == null, JSON.stringify(inv101) + JSON.stringify(w1.body));
  ok('S9 그 주문의 이용권 3명이 꺼진다', enrolled(a1) === 0 && cnt(`SELECT COUNT(*) FROM enrollments WHERE instr(notes,?)>0 AND status='refunded'`, a1) === 3);
  await webhook(a1);
  ok('S9 같은 취소가 두 번 와도 기록 한 줄', cnt(`SELECT COUNT(*) FROM b2b_payment_cancels WHERE order_id=?`, a1) === 1);
  const a3 = newOrder('MGB', 101, 15000);
  const re = await confirm(a3, 15000);
  ok('S9 되돌린 청구서는 다시 결제할 수 있다', re.body.ok === true && enrolled(a3) === 3, JSON.stringify(re.body));

  /* ── S10 AI 컨텐츠 «부분» 취소 → 자동으로 안 건드리고 사람이 볼 표시 ── */
  cancelToss(b1, [[3000, 'tx-b1p']]);
  const pc = toss.get(b1) ? b1 : b2;   // S2 에서 이긴 쪽
  if (pc !== b1) cancelToss(b2, [[3000, 'tx-b2p']]);
  await webhook(pc);
  ok('S10 부분 취소는 청구서를 결제됨 그대로 둔다', row(`SELECT status FROM ai_billing_invoices WHERE id=102`)?.status === 'paid');
  ok('S10 이용권도 그대로', cnt(`SELECT COUNT(*) FROM enrollments WHERE instr(notes,'MGB-102-')>0 AND status='active'`) === 2);
  ok('S10 사람이 볼 표시(needs_review)', row(`SELECT applied FROM b2b_payment_cancels WHERE order_id=?`, pc)?.applied === 'needs_review');

  /* ── S11 수업료 부분 → 전액 취소: 충전금이 정확히 되돌아가고 두 번 안 뺀다 ── */
  cancelToss(f1, [[30000, 'tx-f1a']]);
  await webhook(f1);
  let f = row(`SELECT status, paid_krw FROM b2b_tuition_invoices WHERE id=201`);
  ok('S11 3만원 부분 취소 → 낸 돈 7만·partial', Number(f?.paid_krw) === 70000 && f.status === 'partial', JSON.stringify(f));
  cancelToss(f1, [[30000, 'tx-f1a'], [70000, 'tx-f1b']]);
  await webhook(f1); await webhook(f1);
  f = row(`SELECT status, paid_krw FROM b2b_tuition_invoices WHERE id=201`);
  ok('S11 이어진 전액 취소 → 낸 돈 0·issued', Number(f?.paid_krw) === 0 && f.status === 'issued', JSON.stringify(f));
  ok('S11 충전금 합 = 0 (10만 들어오고 10만 빠짐)', cnt(`SELECT COALESCE(SUM(amount),0) FROM b2b_wallet_entries WHERE shop_name='학원F'`) === 0, cnt(`SELECT COALESCE(SUM(amount),0) FROM b2b_wallet_entries WHERE shop_name='학원F'`));

  /* ── S12 앱 환불이 먼저 되돌리고 웹훅이 뒤따라도 한 번만 · refunded 를 cancelled 로 안 덮는다 ── */
  const gw = toss.get(g1) ? g1 : g2;
  cancelToss(gw, [[80000, 'tx-g']]);
  await guard.revertB2bOnCancel(env, gw, toss.get(gw), 'app_refund');
  sq.prepare(`UPDATE payment_orders SET status='refunded' WHERE order_id=?`).run(gw);
  await webhook(gw);
  ok('S12 충전금은 한 번만 빠진다', cnt(`SELECT COALESCE(SUM(amount),0) FROM b2b_wallet_entries WHERE shop_name='학원G'`) === 0, cnt(`SELECT COALESCE(SUM(amount),0) FROM b2b_wallet_entries WHERE shop_name='학원G'`));
  ok('S12 앱 환불 기록(refunded)을 웹훅이 덮지 않는다', row(`SELECT status FROM payment_orders WHERE order_id=?`, gw)?.status === 'refunded');

  /* ── S13 결제 점검이 대리점 이중결제를 잡는다 · 정상은 안 잡는다(짝) ── */
  mgbInv(107, '학원L', 1);
  for (const x of ['MGB-107-Z1-a', 'MGB-107-Z2-b']) sq.prepare(`INSERT INTO payment_orders (order_id, program, amount, status, created_at, paid_at) VALUES (?, 'b2b_ai_monthly', 5000, 'paid', ?, ?)`).run(x, NOW, NOW);
  const au = await runPaymentAudit(env, {});
  const dupIds = (au.b2bDup || []).map((x) => x.invoice_id);
  ok('S13 같은 청구서에 승인 둘이면 점검이 잡는다', dupIds.includes(107), JSON.stringify(au.b2bDup));
  ok('S13 정상 결제 청구서는 안 잡는다(짝)', !dupIds.includes(101) && !dupIds.includes(104), JSON.stringify(dupIds));

  /* ── S14 개인 결제(대리점 아님)는 문지기와 무관 ── */
  ok('S14 개인 주문번호는 대리점 주문이 아니다', guard.parseB2bOrder('MGD-ABC-123') === null && guard.parseB2bOrder('MGB-12-X')?.invoiceId === 12);

  /* ── 배선(앱 환불) — 대리점 주문은 «전원 refunded» 앞에서 정본으로 빠진다 ── */
  const rf = readFileSync(join(SRC, 'api-pay-refund.ts'), 'utf8');
  const fb = rf.slice(rf.indexOf('async function finishRefund'));
  const iB2b = fb.indexOf('if (parseB2bOrder(a.orderId))'), iGen = fb.indexOf("`UPDATE enrollments SET status = 'refunded', updated_at = ? WHERE notes LIKE ?`");
  ok('배선: 앱 환불의 대리점 갈래가 «전원 refunded» 보다 앞', iB2b > 0 && iGen > iB2b, `${iB2b} / ${iGen}`);
  ok('배선: 앱 환불이 토스 응답을 넘긴다', /finishRefund\(env, \{[^}]*pgOut: out/.test(rf));
  fin();
}

/* ═════════════════════════════ 부모 ═════════════════════════════ */
const tmp = mkdtempSync(join(tmpdir(), 'b2bdp-'));
writeFileSync(join(tmp, 'hooks.mjs'), `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
    const u = new URL(spec + '.ts', ctx.parentURL);
    if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
  }
  return next(spec, ctx);
}`);
writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);

function runChild(srcDir) {
  const out = join(tmp, 'r' + Math.random().toString(36).slice(2) + '.json');
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF],
    { encoding: 'utf8', env: { ...process.env, B2B_CHILD: '1', B2B_SRC: srcDir, B2B_RESULT: out }, maxBuffer: 32 * 1024 * 1024, timeout: 300000 });
  if (!existsSync(out)) return { crashed: true, err: (r.stderr || '').slice(-2000) + String(r.error || '') };
  return { results: JSON.parse(readFileSync(out, 'utf8')) };
}

let pass = 0, fail = 0;
console.log('\n═ 대리점 청구서 결제 — 이중결제·취소 되돌리기 (실제 핸들러 · SQLite · 가짜 토스) ═');
const res = runChild(REAL_SRC);
if (res.crashed) { fail++; console.log('  FAIL 자식이 죽었다:\n' + res.err); }
else for (const t of res.results) { if (t.pass) { pass++; console.log('  PASS ' + t.name); } else { fail++; console.log('  FAIL ' + t.name + (t.detail ? ' — ' + t.detail : '')); } }

if (process.env.B2B_MUTATE) {
  const MUT = [
    ['confirm 문지기 제거', [['api-pay.ts', 'if (parseB2bOrder(orderId)) {\n      const gate', 'if (false) {\n      const gate']]],
    /* 겹겹이 막은 자리는 «둘 다» 되돌려야 사고가 난다 — 하나만 되돌리면 다른 겹이 막아 통과하는 것이 정상(등가 변이) */
    ['문지기 조건 뒤집기(MGB paid·not-draft 둘 다 통과)', [['b2b-pay-guard.ts', "if (inv.status === 'paid' || sib.n > 0) return deny", "if (inv.status !== 'paid' && sib.n < 0) return deny"], ['b2b-pay-guard.ts', "if (inv.status !== 'draft') return deny", "if (false) return deny"]]],
    ['선점 UPDATE 무력화', [['b2b-pay-guard.ts', 'WHERE id = ? AND (confirming_order IS NULL OR confirming_order = ? OR confirming_order = ?)`', 'WHERE id = ? OR ? OR ?`']]],
    ['거절 때 선점 안 놓기 + 끝난 주문 넘겨받기 끄기', [['api-pay.ts', 'if (failRes?.meta?.changes) await releaseB2bInvoiceClaim(env, orderId);', ''], ['b2b-pay-guard.ts', "ho.status === 'paid' || ho.status === 'failed' || ho.status === 'cancelled'", "ho.status === 'paid'"]]],
    ['404 를 «모름» 으로 되돌리기', [['api-pay.ts', "if (r.status === 404) return { status: 'NOT_FOUND' };", '']]],
    ['MGB 활성화 changes 무시', [['ai-billing.ts', "if (!(Number(won?.meta?.changes || 0) > 0)) {", 'if (false) {']]],
    ['MGT 낸 돈 옛 방식(읽고 덮기)', [['b2b-tuition-load.ts', 'SET paid_krw = paid_krw + ?,', 'SET paid_krw = ? + 0 * paid_krw,']]],
    ['웹훅 되돌리기 제거', [['api-pay.ts', "const rv = await revertB2bOnCancel(env, orderId, pay, 'toss_webhook');", "const rv = { applied: [], warnings: [] };"]]],
    ['취소 멱등 제거(INSERT OR IGNORE → 매번 새 ref)', [['b2b-pay-guard.ts', ").bind(ev.ref, orderId, ref.kind", ").bind(ev.ref + Math.random(), orderId, ref.kind"]]],
    ['부분 취소도 전액처럼', [['b2b-pay-guard.ts', "if (String(pay?.status || '') === 'CANCELED') return true;", 'return true;']]],
    ['점검에서 대리점 이중결제 빼기', [['api-pay.ts', 'out.b2bDup = await findB2bDoublePaid(env, Date.now() - 30 * 86400 * 1000);', 'out.b2bDup = [];']]],
  ];
  console.log('\n═ 변이시험 — 고친 자리를 되돌려 «잡히는가» ═');
  for (const [name, edits] of MUT) {
    const dir = mkdtempSync(join(tmpdir(), 'b2bdp-mut-'));
    cpSync(REAL_SRC, dir, { recursive: true });
    let bad = '';
    for (const [file, find, repl] of edits) {
      const fp = join(dir, file); const src = readFileSync(fp, 'utf8'); const n = src.split(find).length - 1;
      if (n !== 1) { bad = `${file} 앵커 ${n}곳`; break; }
      writeFileSync(fp, src.replace(find, repl));
    }
    if (bad) { fail++; console.log(`  FAIL 변이 «${name}» — ${bad}`); rmSync(dir, { recursive: true, force: true }); continue; }
    const r = runChild(dir);
    const failed = r.crashed ? ['자식 죽음'] : r.results.filter((t) => !t.pass).map((t) => t.name);
    if (failed.length) { pass++; console.log(`  PASS 변이 «${name}» 검출 — ${failed.length}건 (${failed.slice(0, 2).join(' / ')})`); }
    else { fail++; console.log(`  FAIL 변이 «${name}» 를 못 잡았다`); }
    rmSync(dir, { recursive: true, force: true });
  }
}
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
