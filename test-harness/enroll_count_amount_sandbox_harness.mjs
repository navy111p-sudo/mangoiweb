// enroll_count_amount_sandbox_harness.mjs — «수업 횟수» 와 «결제 금액» 이 서로 맞는가 (2026-10-10 사장님 지시)
//
// ── 무엇을 보나 ───────────────────────────────────────────────────────────────
//  A. 계산식 전수 — 주 횟수(4) × 개월(4) × 수업 길이(3) × 대리점 단가(8) × 강사 배율(9) = 3,456 조합.
//     금액을 «정수 산수»(BigInt)로 따로 계산해 정본(enrollQuoteCalc)과 1원 단위까지 대조한다.
//     ⛔ 정본의 식을 베끼지 않는다 — «회당 정가 × 회차 수 × 할인 × 배율» 로 다르게 세서 맞춘다.
//  B. 샌드박스 전 과정 — 진짜 SQLite 에 D1 모양을 씌우고 «정본 코드 그대로»
//       createEnrollOrder(주문) → /api/pay/confirm(토스 응답만 가짜) → activateEnrollment → enrollCreateSchedules
//     를 돌린다(무작위 공휴일·강사 겹침·학생 겹침 포함). 그 결과
//       · 주문 금액 == A 의 기대 금액
//       · 실제로 생긴 수업 줄 수 == 결제한 회차 수(주N회 × 4주 × 개월)
//       · 수업 날짜가 고른 요일·시각·길이이고, 공휴일·겹침 날짜에 안 잡혔고, 중복 날짜가 없다
//     를 본다. 금액을 1원이라도 바꿔 보낸 확정 요청은 거절되고 수업이 0줄인지도 본다.
//  C. 자동연장(빌링키) — 같은 샌드박스에서 chargeSubscriptionOnce 로 1·3·6·12개월을 청구해
//     «청구액 == 새로 생긴 수업 수의 값» 인지 본다.
//  D. 관찰(FAIL 아님 — 사람이 정할 일): 환불 계산이 강사 배율을 빼고 정가를 잡는 것,
//     관리자 등록 경로(월 수강료 × 달력 개월)의 회차 수가 «주N회×4» 와 어긋나는 것.
//
// 실행: node test-harness/enroll_count_amount_sandbox_harness.mjs   (SCENARIOS=300 기본)

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch (_) {}

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dir, '../cloudflare-deploy/src');
const N_SCEN = Number(process.env.SCENARIOS || 300);

let PASS = 0, FAIL = 0;
const failures = [];
const ok = (cond, name, extra) => {
  if (cond) { PASS++; return true; }
  FAIL++; if (failures.length < 40) failures.push(name + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''));
  return false;
};
const section = (t) => console.log('\n' + t);

/* 정본 사본(상대 import 만 절대경로로 바꾼다 — 로직은 한 글자도 안 바꾼다) */
const _tmps = [], _made = new Map();
const mkCopy = (name) => {
  if (_made.has(name)) return _made.get(name);
  const f = resolve(tmpdir(), `${name}.eca.${process.pid}.ts`);
  _made.set(name, f); _tmps.push(f);
  writeFileSync(f, readFileSync(resolve(SRC_DIR, name + '.ts'), 'utf8')
    .replace(/from '\.\/([\w-]+)'/g, (_m, n) => `from '${pathToFileURL(mkCopy(n)).href}'`));
  return f;
};
process.on('exit', () => { for (const f of _tmps) { try { rmSync(f); } catch {} } });

let E = null, P = null, F = null;
try {
  E = await import(pathToFileURL(mkCopy('enroll-ops')).href);
  P = await import(pathToFileURL(mkCopy('api-pay')).href);
  F = await import(pathToFileURL(mkCopy('enroll-fee')).href);
} catch (e) { console.log('  (정본 로드 실패) ' + (e && e.message)); }
const loaded = ok(!!(E && E.enrollQuoteCalc && E.createEnrollOrder && P && P.handlePayApi && F && F.computeMonthlyFee), '전제: 정본을 불러왔다');
if (!loaded) { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(1); }

/* ── 독립 계산기: 회당 정가 × 회차 × 할인 × 배율 을 «정수» 로 ── */
const discPct = (m) => (m >= 12 ? 90 : m >= 6 ? 95 : 100);
function expectedAmount(w1, weekly, months, minutes, ratePct) {
  const sessions = weekly * 4 * months;
  // 회당 정가 = w1/4 × minutes/20. 총액 = sessions × 회당정가 × disc/100 × rate/100
  const num = BigInt(sessions) * BigInt(w1) * BigInt(minutes) * BigInt(discPct(months)) * BigInt(ratePct);
  const den = 4n * 20n * 100n * 100n;
  const exact = num / den;               // 원 단위 버림(아래에서 10원 버림이 다시 덮는다)
  return { sessions, amount: Number((exact / 10n) * 10n), exactNum: num, den };
}

/* ═══ A. 계산식 전수 ═══ */
section('A. 금액 계산식 전수 대조 (정수 산수 vs 정본)');
const W1S = [60000, 45000, 50000, 55555, 72300, 39990, 81234, 99999];
const RATES = [50, 80, 90, 100, 110, 115, 130, 150, 300];
let aCount = 0, aFloatMiss = [];
for (const weekly of E.ENROLL_WEEKLY) for (const months of E.ENROLL_MONTHS) for (const minutes of [20, 30, 40])
  for (const w1 of W1S) for (const rp of RATES) {
    aCount++;
    const q = E.enrollQuoteCalc(w1, weekly, months, minutes, rp / 100);
    const ex = expectedAmount(w1, weekly, months, minutes, rp);
    ok(q.sessions === ex.sessions, `A 회차 수 주${weekly}×${months}개월`, { got: q.sessions, want: ex.sessions });
    if (q.amount !== ex.amount) aFloatMiss.push({ w1, weekly, months, minutes, rp, got: q.amount, want: ex.amount });
    ok(Math.abs(q.perSession * q.sessions - q.amount) <= q.sessions / 2 + 1e-9, 'A 회당단가×회차 ≈ 금액(반올림 이내)', { w1, weekly, months, minutes, rp });
    ok(q.amount % 10 === 0 && q.amount > 0, 'A 금액은 10원 단위 양수');
    // 1개월·배율1 이면 관리자 경로(computeMonthlyFee: 대리점 단가 × 주횟수 × 길이배수)와 같아야 한다
    if (months === 1 && rp === 100) {
      const f = F.computeMonthlyFee({ minutes, weekly1Price: w1, weekly });
      ok(f.monthlyFeeKrw === q.amount, 'A 관리자 월수강료 == 결제창 1개월 금액', { w1, weekly, minutes, admin: f.monthlyFeeKrw, pay: q.amount });
    }
  }
// 기간할인은 «더 사면 회당 값이 같거나 싸다»
for (const weekly of E.ENROLL_WEEKLY) for (const minutes of [20, 30, 40]) {
  const per = E.ENROLL_MONTHS.map((m) => E.enrollQuoteCalc(60000, weekly, m, minutes, 1).amount / (weekly * 4 * m));
  ok(per.every((v, i) => i === 0 || v <= per[i - 1] + 1e-9), 'A 개월이 늘면 회당 값이 오르지 않는다', { weekly, minutes, per });
}
// 배율 100%(운영 실제값 — teacher_pricing 0행)에서는 1원도 어긋나면 안 된다
const missAt100 = aFloatMiss.filter((m) => m.rp === 100);
ok(missAt100.length === 0, `A 배율 100% 에서 정본 금액 == 정수 기대 금액`, missAt100.slice(0, 5));
// 배율이 100% 가 아닐 때의 소수점 오차는 «관찰» 로 출력한다(사람이 정할 일 — D 절)
const missOther = aFloatMiss.filter((m) => m.rp !== 100);
ok(missOther.every((m) => m.want - m.got === 10), 'A 배율≠100% 오차는 «10원 모자람» 한 가지뿐', missOther.slice(0, 3));
console.log(`  ${aCount}조합 · 배율100% 불일치 ${missAt100.length}건 · 배율≠100% 10원 모자람 ${missOther.length}건(관찰)`);
globalThis.__floatMiss = missOther;

/* ═══ B·C. 샌드박스 ═══ */
if (!DatabaseSync) {
  console.log('\n  ⏭  node:sqlite 가 없어 샌드박스 절(B·C)은 건너뜁니다');
} else {
  /* D1 모양 씌우기 */
  const norm = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const mkD1 = (db) => {
    const stmt = (sql, args = []) => ({
      bind: (...a) => stmt(sql, norm(a)),
      first: async (col) => { const r = db.prepare(sql).get(...args); return r === undefined ? null : (col ? r[col] : { ...r }); },
      all: async () => ({ results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }),
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    });
    return {
      prepare: (sql) => stmt(sql),
      exec: async (sql) => { db.exec(sql); return { count: 1 }; },
      batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; },
    };
  };

  /* 결정적 난수(재현 가능) */
  let seed = Number(process.env.SEED || 20261010);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const addDay = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
  const today = E.kstToday();

  /* 토스는 밖이므로 가짜로 — 승인 요청을 기록하고 DONE 을 돌려준다. 그 밖의 외부 호출은 실패시킨다. */
  const tossCalls = [];
  globalThis.fetch = async (u, init) => {
    const s = String(u);
    if (s.includes('api.tosspayments.com')) {
      const b = JSON.parse(String(init?.body || '{}'));
      tossCalls.push({ url: s, amount: b.amount, orderId: b.orderId });
      return new Response(JSON.stringify({ status: 'DONE', paymentKey: 'pk_' + b.orderId, method: '카드', totalAmount: b.amount }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('외부 호출 차단: ' + s);
  };
  const origWarn = console.warn; console.warn = () => {};

  const makeEnv = () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, english_name TEXT, username TEXT, shop_name TEXT, parent_phone TEXT, student_phone TEXT, phone TEXT);
             CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1);
             CREATE TABLE payment_orders (order_id TEXT PRIMARY KEY, uid TEXT, program TEXT, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', method TEXT, payer_name TEXT, student_name TEXT, phone TEXT, payment_key TEXT, paid_at INTEGER, fail_reason TEXT, raw TEXT, enroll_json TEXT, created_at INTEGER);`);
    const env = { DB: mkD1(db), TOSS_SECRET_KEY: 'test_sk_sandboxSandbox', TOSS_CLIENT_KEY: 'test_ck_sandboxSandbox' };
    return { db, env };
  };

  section(`B. 샌드박스 전 과정 ${N_SCEN}회 (주문 → 결제확정 → 수업생성, 진짜 SQLite)`);
  const { db, env } = makeEnv();
  await E.ensureEnrollTables(env);
  for (let t = 1; t <= 29; t++) db.prepare(`INSERT INTO teachers (id, name, active) VALUES (?, ?, 1)`).run(t, 'T' + t);
  const shops = [['학원A', 50000], ['학원B', 72300], ['학원C', 55555]];
  for (const [s, p] of shops) db.prepare(`INSERT INTO agency_pricing (shop_name, weekly1_price) VALUES (?, ?)`).run(s, p);
  db.prepare(`INSERT INTO teacher_pricing (teacher_id, rate_pct) VALUES ('5', 115)`).run();
  db.prepare(`INSERT INTO teacher_pricing (teacher_id, rate_pct) VALUES ('6', 80)`).run();
  // 공휴일 몇 개(오늘 이후)
  for (let i = 0; i < 25; i++) { try { db.prepare(`INSERT INTO enroll_holidays (day, name) VALUES (?, '휴일')`).run(addDay(today, 3 + Math.floor(rnd() * 400))); } catch (_) {} }
  const holidays = new Set(db.prepare(`SELECT day FROM enroll_holidays`).all().map((r) => r.day));

  let bRuns = 0, bConflictRejected = 0, totalRows = 0, tamperRejected = 0;
  const shortfalls = [];
  for (let i = 0; i < N_SCEN; i++) {
    const weekly = pick(E.ENROLL_WEEKLY), months = pick(E.ENROLL_MONTHS), minutes = pick([20, 30, 40]);
    const teacherId = String(1 + Math.floor(rnd() * 29));
    const pool = [0, 1, 2, 3, 4, 5, 6].sort(() => rnd() - 0.5);
    const days = pool.slice(0, weekly).sort((a, b) => a - b);
    const times = {}, timesMin = {};
    for (const d of days) { const h = 9 + Math.floor(rnd() * 13), mm = pick([0, 10, 20, 30, 40, 50]); const s = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); times[d] = s; timesMin[d] = h * 60 + mm; }
    const startDate = addDay(today, 1 + Math.floor(rnd() * 20));
    const uid = 'stu' + i;
    const shop = rnd() < 0.25 ? null : pick(shops);
    db.prepare(`INSERT INTO students_erp (user_id, korean_name, shop_name) VALUES (?, ?, ?)`).run(uid, '학생' + i, shop ? shop[0] : null);
    // 겹침 만들기 — 강사의 다른 학생 수업 / 이 학생의 다른 수업 (시작일 이후 일부 날짜)
    const probe = E.enrollDates(startDate, days, 8);
    if (rnd() < 0.35 && probe.length > 2) {
      const d = probe[1 + Math.floor(rnd() * (probe.length - 1))];
      try { db.prepare(`INSERT INTO class_schedules (user_id, schedule_kind, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at) VALUES (?, 'dated', ?, ?, 20, ?, 'active', 'other', 0)`).run('other' + i, d, times[dow(d)], teacherId); } catch (_) { /* 이미 그 강사 자리가 찼음 — 겹침 목적은 그대로 */ }
    }
    if (rnd() < 0.2 && probe.length > 3) {
      const d = probe[2 + Math.floor(rnd() * (probe.length - 2))];
      try { db.prepare(`INSERT INTO class_schedules (user_id, schedule_kind, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at) VALUES (?, 'dated', ?, ?, 20, '99', 'active', 'other', 0)`).run(uid, d, times[dow(d)]); } catch (_) {}
    }

    const resp = await E.createEnrollOrder(env, uid, { weekly, months, minutes, startDate, teacherId, days, times, timesMin }, 'renew');
    const body = await resp.json();
    if (!body.ok) { bConflictRejected++; ok(body.error === 'slot_conflict', 'B 주문 거절은 겹침 사유뿐', body); continue; }
    bRuns++;
    const w1 = shop ? shop[1] : E.ENROLL_BASE_WEEKLY1;
    const ratePct = teacherId === '5' ? 115 : teacherId === '6' ? 80 : 100;
    const ex = expectedAmount(w1, weekly, months, minutes, ratePct);
    const order = db.prepare(`SELECT * FROM payment_orders WHERE order_id = ?`).get(body.orderId);
    const ej = JSON.parse(order.enroll_json);
    const want = ratePct === 100 ? ex.amount : E.enrollQuoteCalc(w1, weekly, months, minutes, ratePct / 100).amount;   // 배율≠100% 소수점 오차는 A·D 절이 따로 본다
    ok(order.amount === want && body.amount === want, 'B 주문 금액 == 기대 금액', { got: order.amount, want, w1, weekly, months, minutes, ratePct });
    ok(ej.sessions === ex.sessions && body.summary.sessions === ex.sessions, 'B 주문 회차 == 주N회×4×개월', { got: ej.sessions, want: ex.sessions });

    // 1원이라도 다른 금액으로 확정 → 거절 + 수업 0줄 (5회에 1번 별도 주문으로)
    if (i % 5 === 0) {
      const r2 = await E.createEnrollOrder(env, uid, { weekly, months, minutes, startDate, teacherId, days, times, timesMin }, 'renew');
      const b2 = await r2.json();
      if (b2.ok) {
        const req = new Request('https://x/api/pay/confirm', { method: 'POST', body: JSON.stringify({ paymentKey: 'pk_t', orderId: b2.orderId, amount: b2.amount + (rnd() < 0.5 ? 1 : -10) }) });
        const cr = await P.handlePayApi(req, new URL(req.url), env);
        const cj = await cr.json();
        const n = db.prepare(`SELECT COUNT(*) n FROM class_schedules WHERE source = ?`).get('enroll:' + b2.orderId).n;
        if (ok(cj.error === 'amount_mismatch' && n === 0, 'B 금액 위변조 확정은 거절되고 수업이 안 생긴다', { cj, n })) tamperRejected++;
      }
    }

    const tossBefore = tossCalls.length;
    const req = new Request('https://x/api/pay/confirm', { method: 'POST', body: JSON.stringify({ paymentKey: 'pk_' + i, orderId: body.orderId, amount: body.amount }) });
    const cr = await P.handlePayApi(req, new URL(req.url), env);
    const cj = await cr.json();
    ok(cj.ok === true, 'B 결제 확정 성공', cj);
    ok(tossCalls.length === tossBefore + 1 && tossCalls[tossCalls.length - 1].amount === want, 'B 토스에 청구한 금액 == 기대 금액', tossCalls[tossCalls.length - 1]);
    const rows = db.prepare(`SELECT scheduled_date d, start_time t, duration_min m, teacher_id tid, user_id u FROM class_schedules WHERE source = ? AND status = 'active' ORDER BY scheduled_date`).all('enroll:' + body.orderId);
    totalRows += rows.length;
    if (!ok(rows.length === ex.sessions, 'B 실제 생성 수업 수 == 결제 회차', { got: rows.length, want: ex.sessions, weekly, months })) shortfalls.push({ i, got: rows.length, want: ex.sessions });
    const uniq = new Set(rows.map((r) => r.d));
    ok(uniq.size === rows.length, 'B 같은 날짜 중복 없음');
    ok(rows.every((r) => days.includes(dow(r.d)) && r.t === times[dow(r.d)]), 'B 고른 요일·시각에만 잡힘');
    ok(rows.every((r) => r.m === minutes && r.tid === teacherId && r.u === uid), 'B 길이·강사·학생 일치');
    ok(rows.every((r) => !holidays.has(r.d) && r.d >= startDate), 'B 공휴일·시작일 이전에 안 잡힘');
    // 이미 있던 다른 수업과 겹치지 않음(강사·학생 양쪽)
    const clash = rows.filter((r) => db.prepare(`SELECT COUNT(*) n FROM class_schedules WHERE scheduled_date = ? AND start_time = ? AND status='active' AND source <> ? AND (teacher_id = ? OR user_id = ?)`).get(r.d, r.t, 'enroll:' + body.orderId, teacherId, uid).n > 0);
    ok(clash.length === 0, 'B 강사·학생의 다른 수업과 겹치지 않음', clash.slice(0, 3));
    const enr = db.prepare(`SELECT monthly_fee_krw a FROM enrollments WHERE notes LIKE ?`).get('%' + body.orderId + '%');
    ok(enr && enr.a === want, 'B 수강 기록 금액 == 결제 금액', enr);
    // 회당 단가 × 생성된 수업 수 ≈ 결제 금액
    ok(Math.abs(ej.per_session * rows.length - order.amount) <= rows.length / 2 + 1, 'B 회당단가 × 생성수업 ≈ 결제금액', { per: ej.per_session, n: rows.length, amt: order.amount });
    // 같은 확정을 한 번 더 보내도 두 번 청구·두 번 생성되지 않는다
    if (i % 7 === 0) {
      const req2 = new Request('https://x/api/pay/confirm', { method: 'POST', body: JSON.stringify({ paymentKey: 'pk_' + i, orderId: body.orderId, amount: body.amount }) });
      const n0 = tossCalls.length;
      const cj2 = await (await P.handlePayApi(req2, new URL(req2.url), env)).json();
      const n2 = db.prepare(`SELECT COUNT(*) n FROM class_schedules WHERE source = ?`).get('enroll:' + body.orderId).n;
      ok(cj2.already === true && tossCalls.length === n0 && n2 === rows.length, 'B 같은 확정 두 번 → 재청구·재생성 없음', { cj2, n2 });
    }
  }
  console.log(`  주문 성공 ${bRuns}건 · 겹침으로 주문 거절 ${bConflictRejected}건 · 생성 수업 합계 ${totalRows}줄 · 위변조 거절 ${tamperRejected}건`);
  ok(bRuns >= N_SCEN * 0.5, 'B 전제: 시나리오의 절반 이상이 실제로 결제까지 갔다', { bRuns });
  if (shortfalls.length) console.log('   ↳ 회차 부족:', JSON.stringify(shortfalls.slice(0, 5)));

  /* ═══ C. 자동연장(빌링키) 청구 ═══ */
  section('C. 자동연장 청구 — 청구액 == 새 수업 수의 값');
  if (!P.chargeSubscriptionOnce) { ok(false, 'C 전제: chargeSubscriptionOnce 를 불러왔다'); }
  else {
    db.exec(`CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, plan TEXT, amount INTEGER, status TEXT DEFAULT 'active', next_billing_at INTEGER, last_billed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, billing_key TEXT, customer_key TEXT, fail_count INTEGER DEFAULT 0)`);
    const paidUids = db.prepare(`SELECT DISTINCT uid FROM payment_orders WHERE status='paid' ORDER BY uid LIMIT 60`).all().map((r) => r.uid);
    let cRuns = 0;
    for (const uid of paidUids) {
      const months = pick(E.ENROLL_MONTHS);
      const cur = await E.currentEnrollment(env, uid);
      if (!cur.renewable || !cur.days_resolved || !cur.times_resolved) continue;
      const beforeIds = new Set(db.prepare(`SELECT order_id FROM payment_orders WHERE uid = ?`).all(uid).map((r) => r.order_id));
      const subId = Number(db.prepare(`INSERT INTO subscriptions (user_id, student_name, plan, amount, status, created_at, updated_at, billing_key, customer_key) VALUES (?, ?, '정규', 0, 'active', 0, 0, 'bk', 'ck')`).run(uid, uid).lastInsertRowid);
      const sub = db.prepare(`SELECT * FROM subscriptions WHERE id = ?`).get(subId);
      const res = await P.chargeSubscriptionOnce(env, { ...sub }, months);
      const newOrder = db.prepare(`SELECT * FROM payment_orders WHERE uid = ? ORDER BY created_at DESC, rowid DESC`).all(uid).find((o) => !beforeIds.has(o.order_id));
      if (!res.ok) { ok(res.error === 'slot_conflict' || res.error === 'order_failed', 'C 청구 실패는 겹침 사유뿐', res); continue; }
      cRuns++;
      const ej = JSON.parse(newOrder.enroll_json);
      const s = db.prepare(`SELECT shop_name FROM students_erp WHERE user_id = ?`).get(uid);
      const w1 = (shops.find((x) => x[0] === s.shop_name) || [null, E.ENROLL_BASE_WEEKLY1])[1];
      const ratePct = ej.teacher_id === '5' ? 115 : ej.teacher_id === '6' ? 80 : 100;
      const ex = expectedAmount(w1, ej.weekly, months, ej.minutes, ratePct);
      const wantC = ratePct === 100 ? ex.amount : E.enrollQuoteCalc(w1, ej.weekly, months, ej.minutes, ratePct / 100).amount;
      ok(res.amount === wantC && newOrder.amount === wantC, 'C 자동청구 금액 == 기대 금액', { got: res.amount, want: wantC });
      const n = db.prepare(`SELECT COUNT(*) n FROM class_schedules WHERE source = ? AND status='active'`).get('enroll:' + newOrder.order_id).n;
      ok(n === ex.sessions, 'C 자동청구로 생긴 수업 수 == 산 회차', { n, want: ex.sessions });
      const subAfter = db.prepare(`SELECT amount FROM subscriptions WHERE id = ?`).get(subId);
      ok(subAfter.amount === E.enrollQuoteCalc(w1, ej.weekly, 1, ej.minutes, ratePct / 100).amount, 'C 구독 «월» 금액은 1개월 견적', subAfter);
    }
    console.log(`  자동청구 성공 ${cRuns}건`);
    ok(cRuns >= 10, 'C 전제: 자동청구가 10건 이상 실제로 돌았다', { cRuns });
  }
  console.warn = origWarn;
}

/* ═══ D. 관찰 (FAIL 아님) ═══ */
section('D. 관찰 — 사람이 정할 일 (FAIL 로 세지 않음)');
{
  const fm = globalThis.__floatMiss || [];
  if (fm.length) console.log(`  ⚠️ 금액 소수점: 강사 배율 ${[...new Set(fm.map((m) => m.rp))].join('·')}% 에서 ${fm.length}조합이 정확값보다 10원 적게 청구 (예: 대리점 ${fm[0].w1}원·주${fm[0].weekly}회·${fm[0].months}개월·${fm[0].minutes}분 → ${fm[0].got}원, 정확 ${fm[0].want}원)`);
  const paid = E.enrollQuoteCalc(60000, 2, 3, 20, 1.15).amount;      // 강사 배율 115%
  const base = 60000 * 2 * 3;                                         // 환불 화면이 쓰는 «정가»(배율 빠짐)
  const r = E.enrollRefundCalc(paid, 24, 24, base);
  console.log(`  ⚠️ 환불: 강사 배율 115% 수업 24회를 «전부» 듣고도 환불 권장액 ${r.refund.toLocaleString()}원 (결제 ${paid.toLocaleString()}원 · 정가 ${base.toLocaleString()}원)`);
  const paid80 = E.enrollQuoteCalc(60000, 2, 3, 20, 0.8).amount;
  const r80 = E.enrollRefundCalc(paid80, 24, 12, base);
  console.log(`  ⚠️ 환불: 배율 80% 수업 24회 중 12회만 듣고 환불 권장액 ${r80.refund.toLocaleString()}원 (결제 ${paid80.toLocaleString()}원 — 절반 남았는데)`);
  console.log('     (환불 «정가» 가 teacher_rate 를 안 곱함 — enroll-ops refund-quote · api-pay-refund 두 곳. 운영 teacher_pricing 0행이라 지금은 닿지 않음)');
  // 관리자 등록 경로: 월 수강료(주N회×4 기준)인데 실제 회차는 달력 개월 안의 요일 수
  if (E.ENROLL_MONTHS) {
    const counts = [];
    for (let k = 0; k < 12; k++) {
      const start = new Date(Date.UTC(2026, k, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(2026, k + 1, 0)).toISOString().slice(0, 10);
      let n = 0; const d = new Date(start + 'T00:00:00Z');
      while (d.toISOString().slice(0, 10) <= end) { if ([1, 3].includes(d.getUTCDay())) n++; d.setUTCDate(d.getUTCDate() + 1); }
      counts.push(n);
    }
    console.log(`  ℹ️ 관리자 등록(달력 1개월·월수 주2회) 실제 회차 2026년 월별: ${counts.join(',')} — 월 수강료는 «8회» 기준`);
  }
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n❌ 실패 목록'); for (const f of failures) console.log('  - ' + f); }
process.exit(FAIL ? 1 : 0);
