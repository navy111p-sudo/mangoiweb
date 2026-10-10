/**
 * 🎲 학생 «수업 등록 · 연장 · 결제» 샌드박스 무작위 반복 검사 (2026-10-10 사장님 「오류가 없을 때까지 수백 번」)
 * ─────────────────────────────────────────────────────────────────────────────
 * ✅ 진짜: handlePayApi(api-pay.ts) — 그 안의 수강신청·연장(enroll-ops.ts)·활성화·웹훅·빌링 — 를
 *          소스 그대로 import 해서, 메모리 SQLite(D1 모양)에 돌린다. 학생 로그인 토큰도 진짜 서명.
 * 🟡 모형: 토스(결제사)·문자 — fetch 를 가로챈 «가짜 토스» 가 실제 토스 규칙대로 답한다
 *          (같은 주문을 두 번 승인하면 ALREADY_PROCESSED_PAYMENT, 웹훅은 «재조회» 로 확인).
 *          시계는 가짜(Date). 외부 네트워크는 한 줄도 안 나간다.
 *
 * 한 «세상» = 새 DB + 강사·학생·공휴일·기존 수업을 무작위로 깔고, 무작위 조작을 이어서 한다:
 *   · 상품 결제(create-order → confirm) · 수강신청(quote → create-order → confirm)
 *   · 연장(my-current → renew-order → confirm) · 1회용 링크 연장 · 가상계좌(입금 대기 → 웹훅)
 *   · 거절·금액 위조·연타(같은 confirm 2번)·confirm 과 웹훅 동시 도착·두 학생이 같은 자리를 동시에 결제
 *   · 시계 앞으로 감기(끝난 학생 연장 포함) · 자동결제(빌링키) 청구
 * 매 조작 뒤 «불변식» 을 전부 다시 잰다:
 *   I1 토스가 승인한(DONE) 주문 ⇔ 우리 DB 가 paid  (돈은 나갔는데 우리는 모름 / 그 반대 = 0건)
 *   I2 paid 주문 하나에 수강 기록(enrollments) 정확히 1줄 (중복 활성화 0)
 *   I3 수강신청 주문은 산 회차 수만큼 수업이 생긴다 (돈 받고 수업 모자람 0)
 *   I4 강사 겹침 0 · I5 학생 겹침 0 · I6 공휴일 수업 0 · I7 과거·시작일 이전 수업 0
 *   I8 주문 금액 == 견적 화면 금액 · I9 연장은 마지막 수업 뒤 · 같은 요일·시간·강사·길이
 *   I10 같은 confirm 을 다시 보내도 ok(멱등) · 실패한 결제는 수업·수강을 안 만든다
 * 실행: node test-harness/enroll_pay_renew_fuzz_harness.mjs   (FUZZ_WORLDS=개수 FUZZ_OPS=조작수 FUZZ_SEED=시드)
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

/* ═════════════════════════════ 자식: 세상을 만들고 돌린다 ═════════════════════════════ */
if (process.env.EPRF_CHILD === '1') {
  const SRC = process.env.EPRF_SRC;
  const WORLDS = Number(process.env.FUZZ_WORLDS || 40);
  const OPS = Number(process.env.FUZZ_OPS || 30);
  const SEED0 = Number(process.env.FUZZ_SEED || 20261010);

  // ── 결정적 난수 ──
  let _s = 1;
  const seed = (n) => { _s = (n >>> 0) || 1; };
  const rnd = () => { _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;

  // ── 시계 ──
  let NOW = 0;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
    static now() { return NOW; }
  }
  globalThis.Date = FakeDate;
  const kstMs = (ymd, hm) => RealDate.parse(`${ymd}T${hm}:00+09:00`);
  const kstToday = () => new RealDate(NOW + 9 * 3600e3).toISOString().slice(0, 10);
  const addDays = (ymd, n) => { const d = new RealDate(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dowOf = (ymd) => new RealDate(ymd + 'T00:00:00Z').getUTCDay();
  const tmin = (t) => { const m = /^(\d\d):(\d\d)$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : -1; };
  const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  const warns = [];
  let warnSeen = 0;
  console.warn = (...a) => warns.push(a.map(String).join(' ').slice(0, 240));
  console.error = (...a) => warns.push('ERR ' + a.map(String).join(' ').slice(0, 240));
  console.log = () => {};

  const { DatabaseSync } = await import('node:sqlite');
  const imp = (f) => import(pathToFileURL(join(SRC, f)).href);
  const { handlePayApi, runAutoRenewChargeSweep, chargeSubscriptionOnce } = await imp('api-pay.ts');
  const { signUidToken } = await imp('auth-token.ts');
  const { issueRenewLink } = await imp('renew-link.ts');
  const { checkAdminSession } = await imp('auth-admin.ts');
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');

  const failures = [];          // { world, op, inv, detail }
  const stats = { ops: 0, kinds: {}, paid: 0, schedules: 0, renewPaid: 0, declined: 0, conflictsRejected: 0, invChecks: 0 };
  const bump = (k) => { stats.kinds[k] = (stats.kinds[k] || 0) + 1; };

  // ── 가짜 토스 · 문자 ──
  let toss = new Map();        // orderId → { status, totalAmount, paymentKey, method }
  let tossPlan = new Map();    // orderId → 'decline' | 'waiting' | 'network'
  let tossCharges = [];        // 실제로 «돈이 나간» 기록 (orderId, amount)
  let smsCount = 0;
  const tick = () => new Promise((r) => setImmediate(r));
  const resp = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    await tick();
    if (url === 'https://api.tosspayments.com/v1/payments/confirm' && method === 'POST') {
      const b = JSON.parse(String(init.body || '{}'));
      const plan = tossPlan.get(b.orderId);
      if (plan === 'network') throw new Error('socket hang up');
      const ex = toss.get(b.orderId);   // ⚠️ 읽고-쓰기 사이에 await 금지 — 진짜 토스는 한 주문을 직렬로 처리한다
      if (ex && (ex.status === 'DONE' || ex.status === 'WAITING_FOR_DEPOSIT')) return resp(400, { code: 'ALREADY_PROCESSED_PAYMENT', message: '이미 처리된 결제 입니다.' });
      if (plan === 'decline') return resp(400, { code: 'REJECT_CARD_COMPANY', message: '카드사에서 거절했습니다.' });
      if (plan === 'waiting') {
        const rec = { status: 'WAITING_FOR_DEPOSIT', totalAmount: b.amount, paymentKey: b.paymentKey, orderId: b.orderId, method: '가상계좌', virtualAccount: { bank: '국민', accountNumber: '000', dueDate: 'x' } };
        toss.set(b.orderId, rec); return resp(200, rec);
      }
      const rec = { status: 'DONE', totalAmount: b.amount, paymentKey: b.paymentKey, orderId: b.orderId, method: '카드' };
      toss.set(b.orderId, rec); tossCharges.push({ orderId: b.orderId, amount: b.amount });
      return resp(200, rec);
    }
    const mOrd = /^https:\/\/api\.tosspayments\.com\/v1\/payments\/orders\/(.+)$/.exec(url);
    if (mOrd && method === 'GET') {
      const rec = toss.get(decodeURIComponent(mOrd[1]));
      return rec ? resp(200, rec) : resp(404, { code: 'NOT_FOUND_PAYMENT' });
    }
    const mBill = /^https:\/\/api\.tosspayments\.com\/v1\/billing\/(.+)$/.exec(url);
    if (mBill && method === 'POST') {
      const b = JSON.parse(String(init.body || '{}'));
      if (tossPlan.get('billing:' + decodeURIComponent(mBill[1])) === 'decline') return resp(400, { code: 'REJECT', message: '한도초과' });
      const rec = { status: 'DONE', totalAmount: b.amount, paymentKey: 'bk_' + b.orderId, orderId: b.orderId, method: '카드' };
      toss.set(b.orderId, rec); tossCharges.push({ orderId: b.orderId, amount: b.amount });
      return resp(200, rec);
    }
    if (/tosspayments\.com/.test(url)) return resp(404, { code: 'UNHANDLED_IN_HARNESS', url });
    smsCount++;
    return resp(200, { ok: true });
  };

  const BASE = 'https://mangoi.ai';
  let env, sq, kvMap;
  const call = async (method, path, { token, body, cookie } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    if (cookie) headers.cookie = 'mango_admin_session=' + cookie;
    const r = new Request(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
    const res = await handlePayApi(r, new URL(r.url), env);
    if (!res) return { status: 0, body: { error: 'no_route' } };
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  // ── 세상 하나 ──
  function newDb() {
    sq = new DatabaseSync(':memory:');
    const norm = (v) => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
    const mkStmt = (sql, args) => ({
      bind: (...b) => mkStmt(sql, b.map(norm)),
      async first(col) { await tick(); const r = sq.prepare(sql).get(...args); if (!r) return null; const o = { ...r }; return col ? o[col] : o; },
      async all() { await tick(); return { results: sq.prepare(sql).all(...args).map((r) => ({ ...r })), success: true, meta: {} }; },
      async run() { await tick(); const r = sq.prepare(sql).run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
      async raw() { await tick(); return sq.prepare(sql).all(...args).map((r) => Object.values(r)); },
    });
    const DB = {
      prepare: (sql) => mkStmt(sql, []),
      async exec(sql) { await tick(); sq.exec(sql); return { count: 1 }; },
      async batch(stmts) {
        await tick();
        // D1 batch = 한 트랜잭션. 안에서는 동기로 돌려 다른 요청이 끼어들지 않게 한다(실제 D1 과 같음).
        sq.exec('BEGIN IMMEDIATE');
        try {
          const out = stmts.map((s) => { const st = s; return st; });
          const res = [];
          for (const s of out) { const r = sq.prepare(s.__sql).run(...s.__args); res.push({ success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }); }
          sq.exec('COMMIT'); return res;
        } catch (e) { sq.exec('ROLLBACK'); throw e; }
      },
      dump: async () => new ArrayBuffer(0),
    };
    // batch 가 쓰도록 문장에 sql·args 를 달아 둔다
    const _mk = mkStmt;
    DB.prepare = (sql) => { const wrap = (args) => { const s = _mk(sql, args); s.__sql = sql; s.__args = args; s.bind = (...b) => wrap(b.map(norm)); return s; }; return wrap([]); };
    kvMap = new Map();
    const KV = {
      async get(k, t) { const v = kvMap.get(k); if (v == null) return null; return t === 'json' ? JSON.parse(v) : v; },
      async put(k, v) { kvMap.set(k, String(v)); },
      async delete(k) { kvMap.delete(k); },
      async list() { return { keys: [...kvMap.keys()].map((name) => ({ name })), list_complete: true }; },
    };
    env = new Proxy({
      DB, ROOM_JWT_SECRET: 'harness-room-secret', ADMIN_PASSWORD: 'harness-pw',
      TOSS_SECRET_KEY: 'test_sk_harnessKey01', TOSS_CLIENT_KEY: 'test_ck_harnessKey01',
    }, { get(t, p) { if (p in t) return t[p]; if (typeof p === 'string' && /^[A-Z_]+$/.test(p) && /KV|STATE|CACHE|SESS/.test(p)) return KV; return undefined; } });
    toss = new Map(); tossPlan = new Map(); tossCharges = [];
  }

  const cutCreate = (src, name, mustContain) => {
    const re = new RegExp('`(CREATE TABLE IF NOT EXISTS ' + name + '\\s*\\([\\s\\S]*?\\);?)`', 'g');
    let m; while ((m = re.exec(src))) { if (!mustContain || m[1].includes(mustContain)) return m[1]; }
    return null;
  };
  const tIdx = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const tEnd = adminSrc.indexOf("].join(' ')", tIdx);
  const teachersDDL = tIdx > 0 && tEnd > tIdx ? [...adminSrc.slice(tIdx, tEnd).matchAll(/`([^`]*)`/g)].map((m) => m[1]).join(' ') : null;
  const erpDDL = cutCreate(adminSrc, 'students_erp', 'user_id TEXT PRIMARY KEY, korean_name');
  const pre = [];
  if (!teachersDDL) pre.push('teachers CREATE 를 소스에서 못 읽음');
  if (!erpDDL) pre.push('students_erp CREATE 를 소스에서 못 읽음');

  // 세상 상태(하니스가 기억하는 «정답»)
  let W;   // { students:[{uid,token,shop}], teachers:[id], holidays:Set, orders: Map(orderId → meta) }

  async function buildWorld(w) {
    newDb();
    NOW = kstMs(addDays('2026-10-12', ri(0, 40)), pick(['09:00', '13:30', '20:10', '23:50']));
    await checkAdminSession(new Request(BASE + '/x', { headers: { cookie: 'mango_admin_session=prime' } }), env).catch(() => {});
    sq.exec(teachersDDL); sq.exec(erpDDL);
    for (const c of ['shop_name TEXT', 'phone TEXT', 'parent_phone TEXT', 'student_phone TEXT']) { try { sq.exec('ALTER TABLE students_erp ADD COLUMN ' + c); } catch (_) {} }
    // enroll-ops 가 쓰는 표들을 미리(핸들러가 스스로 만들지만, 기존 수업을 깔려면 먼저 있어야 한다)
    await call('POST', '/api/pay/enroll/quote', { body: { weekly: 1, months: 1, minutes: 20 } });
    // enrollments 는 첫 결제가 만든다 — 결제가 아직 없는 세상에서도 불변식을 잴 수 있게 같은 모양으로 미리
    sq.exec(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    const T0 = NOW;
    const nT = ri(2, 4), nS = ri(4, 9);
    const teachers = [];
    for (let i = 1; i <= nT; i++) {
      sq.prepare(`INSERT INTO teachers (id, name, active, created_at, updated_at) VALUES (?,?,1,?,?)`).run(i, 'T' + i, T0, T0);
      if (chance(0.35)) sq.prepare(`INSERT OR REPLACE INTO teacher_pricing (teacher_id, rate_pct) VALUES (?,?)`).run(String(i), pick([90, 110, 125, 150]));
      teachers.push(String(i));
    }
    const shops = ['', 'A학원', 'B어학원'];
    sq.prepare(`INSERT OR REPLACE INTO agency_pricing (shop_name, weekly1_price) VALUES ('A학원', ?)`).run(pick([45000, 52000, 70000]));
    const students = [];
    for (let i = 1; i <= nS; i++) {
      const uid = `stu${w}_${i}`;
      const shop = pick(shops);
      sq.prepare(`INSERT INTO students_erp (user_id, korean_name, shop_name, created_at) VALUES (?,?,?,?)`).run(uid, '학생' + i, shop || null, T0);
      students.push({ uid, shop, get token() { return tokNow(uid); } });
    }
    // 공휴일 몇 개
    const holidays = new Set();
    for (let i = 0; i < ri(0, 4); i++) {
      const d = addDays(kstToday(), ri(0, 120)); holidays.add(d);
      sq.prepare(`INSERT OR IGNORE INTO enroll_holidays (day, name, created_at) VALUES (?, '휴일', ?)`).run(d, T0);
    }
    // 기존 수업 — 남의 수업(진짜 막힘) · LMS 자리표시(막으면 안 됨) · 매주 반복(요일)
    for (let i = 0; i < ri(2, 12); i++) {
      const t = pick(teachers), d = addDays(kstToday(), ri(0, 90)), m = ri(36, 138) * 10;
      const placeholder = chance(0.3);
      try {
        sq.prepare(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
          VALUES (?,?, 'one_off','regular', ?, ?, ?, ?, 'active', ?, ?)`).run(placeholder ? 'lms' : 'other_' + i, '기존', d, hm(m), pick([20, 30, 40]), t, placeholder ? 'lms_import_w26' : 'harness-existing', T0);
      } catch (_) {}
    }
    for (let i = 0; i < ri(0, 3); i++) {
      sq.prepare(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
        VALUES (?,?, 'recurring','regular', ?, NULL, ?, 20, ?, 'active', 'harness-recurring', ?)`).run('rec_' + i, '반복', String(ri(0, 6)), hm(ri(36, 138) * 10), pick(teachers), T0);
    }
    W = { w, students, teachers, holidays, orders: new Map(), lastByUid: new Map() };
    tokCache.clear(); await refreshTokens();
  }

  // 로그인 토큰은 30일이면 만료된다 — 시계를 감는 세상이라 «부를 때마다» 새로 서명한다(실제로 학생이 다시 로그인하는 것과 같다)
  const tokCache = new Map();
  function tokNow(uid) { const c = tokCache.get(uid); return c && c.at === NOW ? c.tok : null; }
  async function refreshTokens() { for (const s of W.students) tokCache.set(s.uid, { at: NOW, tok: await signUidToken(s.uid, env) }); }
  const fail = (op, inv, detail) => { failures.push({ world: W.w, op, inv, detail: String(detail).slice(0, 600) }); };

  // ── 결제 «사람 흐름» 하나: 주문 뒤 confirm 의 여러 변형 ──
  async function payOrder(opName, orderId, amount, mode) {
    const pk = 'pk_' + orderId;
    const confirm = (amt = amount) => call('POST', '/api/pay/confirm', { body: { paymentKey: pk, orderId, amount: amt } });
    const webhook = () => call('POST', '/api/pay/webhook', { body: { eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId } } });
    const meta = W.orders.get(orderId);
    meta.mode = mode;
    let r;
    if (mode === 'normal') { r = await confirm(); }
    else if (mode === 'double') {
      const [a, b] = await Promise.all([confirm(), confirm()]);
      r = a.body.ok ? a : b;
      // 사람 눈에 보이는 두 응답 모두 «실패» 라고 하면 안 된다(돈은 나갔다)
      if (toss.get(orderId)?.status === 'DONE' && !(a.body.ok || b.body.ok)) fail(opName, 'I10 연타', '두 응답 모두 실패인데 토스는 승인: ' + JSON.stringify([a.body, b.body]));
      if (toss.get(orderId)?.status === 'DONE' && (!a.body.ok || !b.body.ok)) fail(opName, 'I10 연타', '돈은 나갔는데 한 응답이 «실패» 라고 말함: ' + JSON.stringify([a.body.error || a.body.message, b.body.error || b.body.message]));
    }
    else if (mode === 'retry') { r = await confirm(); const r2 = await confirm(); if (r.body.ok && !r2.body.ok) fail(opName, 'I10 재시도', '같은 confirm 재시도가 실패로 답함: ' + JSON.stringify(r2.body)); }
    else if (mode === 'race_webhook') {
      const [a, b] = await Promise.all([confirm(), (async () => { await tick(); await tick(); await tick(); return webhook(); })()]);
      r = a;
      void b;
    }
    else if (mode === 'decline') { tossPlan.set(orderId, 'decline'); r = await confirm(); meta.expectFail = true; }
    else if (mode === 'network') { tossPlan.set(orderId, 'network'); r = await confirm(); meta.expectFail = true; }
    else if (mode === 'tamper') { r = await confirm(amount - 1000); meta.expectFail = true; if (r.body.ok) fail(opName, '금액 위조', '금액을 바꿔 보낸 confirm 이 성공: ' + JSON.stringify(r.body)); }
    else if (mode === 'vbank') {
      tossPlan.set(orderId, 'waiting'); r = await confirm();
      if (!r.body.ok || !r.body.waitingDeposit) fail(opName, '가상계좌', '입금대기 응답이 아님: ' + JSON.stringify(r.body));
      // 며칠 뒤 입금 — 토스가 DONE 으로 바꾸고 웹훅이 온다(가끔 두 번 온다)
      const rec = toss.get(orderId); if (rec) { rec.status = 'DONE'; tossCharges.push({ orderId, amount: rec.totalAmount }); }
      await webhook(); if (chance(0.4)) await webhook();
      r = { status: 200, body: { ok: true } };
    }
    if (meta.expectFail && r.body.ok) fail(opName, '실패 결제', mode + ' 인데 ok: ' + JSON.stringify(r.body));
    return r;
  }

  const MODES = ['normal', 'normal', 'normal', 'double', 'retry', 'race_webhook', 'decline', 'network', 'tamper', 'vbank'];

  // ── 조작들 ──
  async function opProduct(i) {
    const s = pick(W.students);
    const program = pick(['1on1-4', '1on1-8', '1on1-12', 'group-12', 'kids', 'exam', 'business', 'pron_ai', 'ai_content', 'fixed_teacher']);
    const r = await call('POST', '/api/pay/create-order', { token: s.token, body: { program, uid: s.uid, payer: '부모', student: '학생', method: 'card' } });
    if (!r.body.ok) { fail('product#' + i, '주문 생성', JSON.stringify(r.body)); return; }
    const orderId = r.body.orderId || r.body.order_id;
    const amount = r.body.amount;
    W.orders.set(orderId, { kind: 'product', uid: s.uid, amount, program });
    await payOrder('product#' + i, orderId, amount, pick(MODES));
  }

  function randParams() {
    const weekly = pick([1, 1, 2, 2, 3, 5]);
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    const days = []; while (days.length < weekly) { const d = pick(allDays); if (!days.includes(d)) days.push(d); }
    days.sort();
    const minutes = pick([20, 20, 30, 40]);
    const uniform = chance(0.6);
    const base = ri(36, 138) * 10;
    const times = {}; for (const d of days) times[d] = hm(uniform ? base : ri(36, 138) * 10);
    return { weekly, months: pick([1, 1, 3, 6, 12]), minutes, days, times, teacher_id: pick(W.teachers), start_date: addDays(kstToday(), ri(0, 10)) };
  }

  async function opEnrollNew(i, forced) {
    const s = forced?.s || pick(W.students);
    const p = forced?.p || randParams();
    const body = { uid: s.uid, ...p };
    const q = await call('POST', '/api/pay/enroll/quote', { body: { uid: s.uid, weekly: p.weekly, months: p.months, minutes: p.minutes, teacher_id: p.teacher_id } });
    const r = await call('POST', '/api/pay/enroll/create-order', { token: s.token, body });
    if (r.status === 409) { stats.conflictsRejected++; return null; }
    if (!r.body.ok) { fail('enroll#' + i, '주문 생성', JSON.stringify(r.body) + ' params=' + JSON.stringify(p)); return null; }
    stats.invChecks++;
    if (!q.body.ok || q.body.amount !== r.body.amount) fail('enroll#' + i, 'I8 견적=주문', `견적 ${q.body.amount} ≠ 주문 ${r.body.amount}`);
    if (r.body.summary?.sessions !== p.weekly * 4 * p.months) fail('enroll#' + i, 'I3 회차 수', JSON.stringify(r.body.summary));
    W.orders.set(r.body.orderId, { kind: 'enroll', uid: s.uid, amount: r.body.amount, p, sessions: p.weekly * 4 * p.months });
    if (forced?.noPay) return r.body;
    await payOrder('enroll#' + i, r.body.orderId, r.body.amount, forced?.mode || pick(MODES));
    return r.body;
  }

  async function opRenew(i) {
    // 수업이 있는 학생 중에서 고른다
    const cands = W.students.filter((s) => sq.prepare(`SELECT 1 FROM class_schedules WHERE user_id=? AND status='active' AND scheduled_date IS NOT NULL LIMIT 1`).get(s.uid));
    if (!cands.length) return opEnrollNew(i);
    const s = pick(cands);
    const viaLink = chance(0.3);
    let token = s.token, rt = null;
    if (viaLink) { const L = await issueRenewLink(env, s.uid); rt = L && L.token; token = null; }
    const cur = await call('GET', '/api/pay/enroll/my-current?' + (rt ? 'rt=' + encodeURIComponent(rt) : 'uid=' + s.uid), { token });
    if (!cur.body.ok) { fail('renew#' + i, 'my-current', JSON.stringify(cur.body)); return; }
    const c = cur.body.current;
    const months = pick([1, 3, 6, 12]);
    const before = sq.prepare(`SELECT MAX(scheduled_date) AS m FROM class_schedules WHERE user_id=? AND status='active' AND scheduled_date IS NOT NULL`).get(s.uid).m;
    const body = { uid: s.uid, months }; if (rt) body.renew_token = rt;   // 본문 키는 renew_token(renew-link.ts BODY_KEY)
    const r = await call('POST', '/api/pay/enroll/renew-order', { token, body });
    if (!r.body.ok) {
      const okErr = ['no_active_enrollment', 'weekly_unresolved', 'time_unresolved', 'slot_conflict'];
      if (!okErr.includes(r.body.error)) fail('renew#' + i, '연장 주문', JSON.stringify(r.body) + ' cur=' + JSON.stringify(c));
      if (r.body.error === 'slot_conflict') stats.conflictsRejected++;
      return;
    }
    // 견적(카드에 뜨는 금액) == 주문 금액 — 링크 경로는 uid 없이 rt 로 견적
    const qb = { weekly: c.days.length, months, minutes: c.minutes, teacher_id: c.teacher_id };
    if (rt) qb.renew_token = rt; else qb.uid = s.uid;
    const q = await call('POST', '/api/pay/enroll/quote', { body: qb });
    stats.invChecks++;
    if (!q.body.ok || q.body.amount !== r.body.amount) fail('renew#' + i, 'I8 연장 견적=주문', `견적 ${q.body.amount} ≠ 주문 ${r.body.amount} (link=${viaLink})`);
    W.orders.set(r.body.orderId, { kind: 'renew', uid: s.uid, amount: r.body.amount, cur: c, beforeLast: before, sessions: c.days.length * 4 * months, months });
    if (rt) {
      const again = await call('POST', '/api/pay/enroll/renew-order', { body: { months, renew_token: rt } });
      if (again.body.ok) fail('renew#' + i, '1회용 링크', '같은 링크로 두 번째 연장 주문이 만들어짐');
    }
    await payOrder('renew#' + i, r.body.orderId, r.body.amount, pick(MODES));
  }

  async function opRaceSameSlot(i) {
    // 두 학생이 같은 강사·같은 자리를 «동시에» 주문·결제 — 늦게 온 쪽도 산 회차를 다 받아야 한다(뒤로 밀려서라도)
    if (W.students.length < 2) return;
    const a = W.students[ri(0, W.students.length - 1)];
    let b = a; while (b === a) b = pick(W.students);
    const p = randParams(); p.months = 1;
    const ra = await opEnrollNew(i, { s: a, p, noPay: true });
    const rb = await opEnrollNew(i, { s: b, p: { ...p }, noPay: true });
    if (!ra || !rb) return;
    await Promise.all([
      payOrder('race#' + i + 'a', ra.orderId, ra.amount, 'normal'),
      payOrder('race#' + i + 'b', rb.orderId, rb.amount, 'normal'),
    ]);
  }

  async function opAutoRenew(i) {
    // 연장 대상 학생에게 빌링키 구독을 걸고 스윕을 «라이브» 로 돌린다
    const cands = W.students.filter((s) => sq.prepare(`SELECT 1 FROM class_schedules WHERE user_id=? AND status='active' AND scheduled_date IS NOT NULL LIMIT 1`).get(s.uid));
    if (!cands.length) return;
    const s = pick(cands);
    await call('GET', '/api/pay/billing/status?uid=' + s.uid, { token: s.token });   // 표 보장
    try {
      sq.exec(`CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, plan TEXT, amount INTEGER, status TEXT DEFAULT 'active', next_billing_at INTEGER, last_billed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
      for (const col of ['billing_key TEXT', 'customer_key TEXT', 'fail_count INTEGER DEFAULT 0', 'teacher_id TEXT', 'weekly INTEGER', 'minutes INTEGER', 'charge_lock_at INTEGER']) { try { sq.exec(`ALTER TABLE subscriptions ADD COLUMN ${col}`); } catch (_) {} }
    } catch (_) {}
    if (sq.prepare(`SELECT 1 FROM subscriptions WHERE user_id=? AND status='active'`).get(s.uid)) return;
    sq.prepare(`INSERT INTO subscriptions (user_id, student_name, plan, amount, status, next_billing_at, created_at, updated_at, billing_key, customer_key, fail_count)
      VALUES (?, '학생', 'enroll', 0, 'active', ?, ?, ?, ?, ?, 0)`).run(s.uid, NOW - 1000, NOW, NOW, 'bk_' + s.uid, 'ck_' + s.uid);
    kvMap.set('billing:auto_renew_live', '1');
    const before = new Set(sq.prepare(`SELECT order_id FROM payment_orders`).all().map((r) => r.order_id));
    const c0 = (await call('GET', '/api/pay/enroll/my-current?uid=' + s.uid, { token: s.token })).body.current;
    const beforeLast = sq.prepare(`SELECT MAX(scheduled_date) AS m FROM class_schedules WHERE user_id=? AND status='active' AND scheduled_date IS NOT NULL`).get(s.uid).m;
    // cron 과 관리자 «지금 청구» 가 동시에 — 이중청구 0 이어야 한다
    const staleRow = sq.prepare(`SELECT * FROM subscriptions WHERE user_id=? AND status='active'`).get(s.uid);
    await Promise.all([runAutoRenewChargeSweep(env), runAutoRenewChargeSweep(env)]);
    // 늦게 깬 실행 — 스윕 «전» 에 읽어 둔 낡은 행으로 다시 청구를 시도한다(선점이 이미 풀린 뒤라 선점만으로는 못 막는다)
    if (staleRow) await chargeSubscriptionOnce(env, staleRow);
    kvMap.delete('billing:auto_renew_live');
    const newOrders = sq.prepare(`SELECT order_id, amount, status, enroll_json FROM payment_orders`).all().filter((r) => !before.has(r.order_id) && /^MGA-/.test(r.order_id));
    const mine = newOrders.filter((o) => { try { return JSON.parse(o.enroll_json).uid === s.uid; } catch { return false; } });
    if (mine.filter((o) => o.status === 'paid').length > 1) fail('auto#' + i, '자동결제 이중청구', JSON.stringify(mine.map((o) => o.order_id + ':' + o.status)));
    for (const o of mine) {
      const ej = JSON.parse(o.enroll_json);
      W.orders.set(o.order_id, { kind: 'renew', uid: s.uid, amount: o.amount, cur: c0, beforeLast, sessions: ej.sessions, months: ej.months, auto: true });
    }
  }

  async function opAdvance() { NOW += ri(1, 45) * 86400e3 + ri(0, 23) * 3600e3; }

  // ── 불변식 ──
  function checkInvariants(op) {
    stats.invChecks++;
    const orders = sq.prepare(`SELECT order_id, uid, program, amount, status, enroll_json, paid_at FROM payment_orders`).all();
    const enr = sq.prepare(`SELECT id, notes, student_user_id, monthly_fee_krw FROM enrollments`).all().map((e) => ({ ...e }));
    for (const o of orders) {
      const tk = toss.get(o.order_id);
      // I1 — 돈이 나갔다 ⇔ 우리 장부 paid
      if (tk && tk.status === 'DONE' && o.status !== 'paid') fail(op, 'I1 돈은 나갔는데 paid 아님', `${o.order_id} status=${o.status}`);
      if (o.status === 'paid' && !(tk && tk.status === 'DONE' && Number(tk.totalAmount) === Number(o.amount))) fail(op, 'I1 paid 인데 토스 승인 없음', `${o.order_id} toss=${JSON.stringify(tk)}`);
      // I2 — 수강 기록 1줄
      const n = enr.filter((e) => String(e.notes || '').includes(o.order_id)).length;
      if (o.status === 'paid' && n !== 1) fail(op, 'I2 수강 기록 수', `${o.order_id} enrollments=${n}`);
      if (o.status !== 'paid' && n !== 0) fail(op, 'I2 미결제인데 수강 기록', `${o.order_id} status=${o.status} enrollments=${n}`);
      const nCs = sq.prepare(`SELECT COUNT(*) AS n FROM class_schedules WHERE source = ? AND status='active'`).get('enroll:' + o.order_id).n;
      if (o.status !== 'paid' && nCs) fail(op, 'I10 미결제인데 수업', `${o.order_id} status=${o.status} 수업=${nCs}`);
      if (o.status === 'paid' && o.enroll_json) {
        const ej = JSON.parse(o.enroll_json);
        // I3 — 산 만큼
        if (nCs !== Number(ej.sessions)) fail(op, 'I3 산 회차 = 생긴 수업', `${o.order_id} 산 ${ej.sessions} 생김 ${nCs} (kind=${ej.kind})`);
        const rows = sq.prepare(`SELECT scheduled_date d, start_time t, duration_min m, teacher_id tid, user_id u FROM class_schedules WHERE source=? AND status='active' ORDER BY scheduled_date`).all('enroll:' + o.order_id);
        for (const r of rows) {
          if (W.holidays.has(r.d)) fail(op, 'I6 공휴일 수업', `${o.order_id} ${r.d}`);
          if (r.d < ej.start_date) fail(op, 'I7 시작일 이전 수업', `${o.order_id} ${r.d} < ${ej.start_date}`);
          if (!ej.days.includes(dowOf(r.d))) fail(op, 'I9 요일 밖 수업', `${o.order_id} ${r.d} days=${ej.days}`);
          const want = ej.times[String(dowOf(r.d))];
          if (want && want !== r.t) fail(op, 'I9 시간 다름', `${o.order_id} ${r.d} ${r.t}≠${want}`);
          if (String(r.tid) !== String(ej.teacher_id)) fail(op, 'I9 강사 다름', `${o.order_id}`);
          if (Number(r.m) !== Number(ej.minutes)) fail(op, 'I9 길이 다름', `${o.order_id}`);
          if (r.u !== ej.uid) fail(op, '수업 주인', `${o.order_id} ${r.u}≠${ej.uid}`);
        }
        const meta = W.orders.get(o.order_id);
        if (meta && meta.kind === 'renew' && meta.beforeLast && rows.length) {
          if (rows[0].d <= meta.beforeLast) fail(op, 'I9 연장이 마지막 수업 이전/당일부터', `${o.order_id} first=${rows[0].d} before=${meta.beforeLast}`);
        }
      }
    }
    // I4·I5 — 겹침 (날짜 지정 활성 수업, 자리표시 제외)
    const live = sq.prepare(`SELECT id, user_id u, teacher_id t, scheduled_date d, start_time s, COALESCE(duration_min,20) m, source FROM class_schedules
      WHERE status='active' AND scheduled_date IS NOT NULL AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`).all();
    const byT = new Map(), byU = new Map();
    for (const r of live) {
      const k1 = r.t + '|' + r.d, k2 = r.u + '|' + r.d;
      (byT.get(k1) || byT.set(k1, []).get(k1)).push(r);
      (byU.get(k2) || byU.set(k2, []).get(k2)).push(r);
    }
    const ov = (a, b) => { const as = tmin(a.s), bs = tmin(b.s); return as < bs + b.m && bs < as + a.m; };
    for (const [label, mp] of [['I4 강사 겹침', byT], ['I5 학생 겹침', byU]]) {
      for (const [k, arr] of mp) for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) {
        if (!ov(arr[x], arr[y])) continue;
        // 하니스가 깐 «기존» 수업끼리의 겹침은 시험 대상이 아니다(우리가 만든 수업이 끼었을 때만)
        if (!/^enroll:/.test(arr[x].source || '') && !/^enroll:/.test(arr[y].source || '')) continue;
        fail(op, label, `${k} ${arr[x].s}/${arr[x].m}(${arr[x].source}) vs ${arr[y].s}/${arr[y].m}(${arr[y].source})`);
      }
    }
    // 반복 수업(요일)과 강사 겹침 — 우리가 만든 날짜 수업만
    const recs = sq.prepare(`SELECT teacher_id t, day_of_week dw, start_time s, COALESCE(duration_min,20) m FROM class_schedules WHERE status='active' AND scheduled_date IS NULL AND day_of_week IS NOT NULL AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`).all();
    for (const r of live) {
      if (!/^enroll:/.test(r.source || '')) continue;
      for (const c of recs) if (String(c.t) === String(r.t) && Number(c.dw) === dowOf(r.d) && ov(r, c)) fail(op, 'I4 반복 수업과 강사 겹침', `${r.t} ${r.d} ${r.s} vs 매주 ${c.dw} ${c.s}`);
    }
    // 돈이 두 번 나간 주문 0
    const seen = new Map();
    for (const c of tossCharges) seen.set(c.orderId, (seen.get(c.orderId) || 0) + 1);
    for (const [k, n] of seen) if (n > 1) fail(op, '이중청구', `${k} ×${n}`);
  }

  // ── 실행 ──
  if (!pre.length) {
    for (let w = 0; w < WORLDS; w++) {
      if (process.env.FUZZ_ONLY && String(w) !== process.env.FUZZ_ONLY) continue;
      seed(SEED0 + w * 7919);
      try { await buildWorld(w); } catch (e) { failures.push({ world: w, op: 'build', inv: '세상 만들기', detail: e.stack || e.message }); continue; }
      for (let i = 0; i < OPS; i++) {
        const k = pick(['product', 'enroll', 'enroll', 'enroll', 'renew', 'renew', 'race', 'advance', 'auto']);
        bump(k); stats.ops++;
        try {
          await refreshTokens();
          if (k === 'product') await opProduct(i);
          else if (k === 'enroll') await opEnrollNew(i);
          else if (k === 'renew') await opRenew(i);
          else if (k === 'race') await opRaceSameSlot(i);
          else if (k === 'auto') await opAutoRenew(i);
          else await opAdvance();
        } catch (e) { failures.push({ world: w, op: k + '#' + i, inv: '예외(크래시)', detail: String(e && e.stack || e).slice(0, 600) }); }
        // I11 — 충돌 검사가 예외를 삼키면 «충돌 없음» 으로 통과한다(조용한 오동작) — 한 번이라도 나오면 위반
        for (; warnSeen < warns.length; warnSeen++) if (/\[enroll\] (conflicts|student conflicts):/.test(warns[warnSeen])) failures.push({ world: w, op: k + '#' + i, inv: 'I11 충돌검사 예외', detail: warns[warnSeen] });
        try { checkInvariants(k + '#' + i); } catch (e) { failures.push({ world: w, op: k + '#' + i, inv: '불변식 측정 실패', detail: String(e && e.message || e) }); }
        if (failures.length > 400) break;
      }
      // 끝 정리: 토스가 DONE 인데 우리가 모르는 주문이 있으면 웹훅이 재전송된다(실제 토스 동작)
      for (const [oid, rec] of toss) if (rec.status === 'DONE') await call('POST', '/api/pay/webhook', { body: { data: { orderId: oid } } });
      try { checkInvariants('final'); } catch (e) { failures.push({ world: w, op: 'final', inv: '불변식 측정 실패', detail: String(e && e.message || e) }); }
      stats.paid += sq.prepare(`SELECT COUNT(*) n FROM payment_orders WHERE status='paid'`).get().n;
      stats.renewPaid += sq.prepare(`SELECT COUNT(*) n FROM payment_orders WHERE status='paid' AND (order_id LIKE 'MGR-%' OR order_id LIKE 'MGA-%')`).get().n;
      stats.declined += sq.prepare(`SELECT COUNT(*) n FROM payment_orders WHERE status='failed'`).get().n;
      stats.schedules += sq.prepare(`SELECT COUNT(*) n FROM class_schedules WHERE source LIKE 'enroll:%'`).get().n;
      if (failures.length > 400) break;
    }
  }
  // 같은 종류는 묶어 보여 준다
  const dedup = new Map();
  for (const f of failures) { const k = f.inv; if (!dedup.has(k)) dedup.set(k, { ...f, count: 0 }); dedup.get(k).count++; }
  writeFileSync(process.env.EPRF_RESULT, JSON.stringify({ pre, stats, failures: [...dedup.values()], total: failures.length, warns: process.env.FUZZ_ONLY ? warns.slice(0, Number(process.env.FUZZ_WARNS || 60)) : warns.filter((w) => /ERR|not enough|overlap/.test(w)).slice(0, 8) }));
  process.exit(0);
}

/* ═════════════════════════════ 부모 ═════════════════════════════ */
const tmp = mkdtempSync(join(tmpdir(), 'eprf-'));
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

function runChild(srcDir, extraEnv = {}) {
  const out = join(tmp, 'r' + Math.random().toString(36).slice(2) + '.json');
  const r = spawnSync(process.execPath,
    ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF],
    { encoding: 'utf8', env: { ...process.env, ...extraEnv, EPRF_CHILD: '1', EPRF_SRC: srcDir, EPRF_RESULT: out }, maxBuffer: 64 * 1024 * 1024, timeout: 900000 });
  if (!existsSync(out)) return { crashed: true, err: (r.stderr || '').slice(-3000) + String(r.error || '') };
  return JSON.parse(readFileSync(out, 'utf8'));
}

let pass = 0, fail = 0;
const res = runChild(REAL_SRC);
console.log('\n═ 학생 등록·연장·결제 — 샌드박스 무작위 반복 (실제 핸들러 · SQLite · 가짜 토스) ═');
if (res.crashed) { fail++; console.log('  FAIL 자식이 죽었다:\n' + res.err); }
else {
  for (const p of res.pre) { fail++; console.log('  FAIL 전제: ' + p); }
  const s = res.stats;
  console.log(`  조작 ${s.ops}회 (${Object.entries(s.kinds).map(([k, v]) => k + ' ' + v).join(' · ')}) · 불변식 검사 ${s.invChecks}회`);
  console.log(`  결제 완료 ${s.paid}건(그중 연장 ${s.renewPaid}) · 실패 처리 ${s.declined}건 · 생긴 수업 ${s.schedules}회차 · 자리 충돌로 막힌 주문 ${s.conflictsRejected}건`);
  if (s.ops < 50) { fail++; console.log('  FAIL 전제: 조작 수가 너무 적다(' + s.ops + ')'); }
  if (s.paid < 5) { fail++; console.log('  FAIL 전제: 결제 완료가 너무 적다 — 검사가 헛돈다(' + s.paid + ')'); }
  if (s.renewPaid < 1) { fail++; console.log('  FAIL 전제: 연장 결제가 한 번도 안 일어났다 — 연장 불변식이 헛돈다'); }
  if (!res.failures.length && !res.pre.length) { pass++; console.log('  PASS 불변식 위반 0건'); }
  for (const f of res.failures) { fail++; console.log(`  FAIL [${f.inv}] ×${f.count} — 세상 ${f.world} ${f.op}: ${f.detail}`); }
  if (res.warns.length) console.log('  (참고 경고) ' + res.warns.join(' | '));
}
/* 🧪 변이시험(선택) — FUZZ_MUTATE=1 이면 고친 자리를 하나씩 «되돌린» 사본으로 다시 돌려
   그 사본이 실제로 불변식 위반을 내는지 본다. 위반이 안 나오면 그 수리를 이 하니스가 못 지킨다는 뜻.
   ⚠️ 저장소 파일은 건드리지 않는다(임시 사본만 고친다). 무거워서 기본은 꺼 둔다. */
if (process.env.FUZZ_MUTATE) {
  /* 한 줄 = 한 변이. 겹겹이 막은 자리(재클릭 조회 + 실패 표시 가드)는 «둘 다» 되돌려야 사고가 난다 —
     하나만 되돌리면 다른 겹이 막아 위반이 안 나오는 것이 정상이라, 짝으로 묶어 되돌린다. */
  const RECLICK = ['api-pay.ts', "if (!tossDone && String(tossJson?.code || '') === 'ALREADY_PROCESSED_PAYMENT') {", 'if (false) {'];
  const FAILGUARD = ['api-pay.ts', "WHERE order_id=? AND status NOT IN ('paid','await_deposit')`).bind(String(code)", 'WHERE order_id=?`).bind(String(code)'];
  const MUTANTS = [
    ['재클릭 조회 + 실패표시 가드 둘 다 제거', [RECLICK, FAILGUARD]],
    ['넣은 뒤 재검사 끄기', [['enroll-ops.ts', 'round < 4; round++', 'round < 0; round++']]],
    ['빈 날짜 창 넓히기 끄기', [['enroll-ops.ts', 'span *= 2;', 'break;']]],
    ['자동연장 timesMin 빼기', [['api-pay.ts', 'timesMin: Object.fromEntries((q.cur.days as number[]).map((d) => [d, enrollTimeToMin(q.cur.times[d])])),', '']]],
    ['낡은 구독 행 검사 끄기', [['api-pay.ts', "return { ok: false, error: 'stale_snapshot' };", ';']]],
  ];
  console.log('\n═ 변이시험 — 고친 자리를 하나씩 되돌려 «잡히는가» ═');
  for (const [name, edits] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'eprf-mut-'));
    cpSync(REAL_SRC, dir, { recursive: true });
    let bad = '';
    for (const [file, find, repl] of edits) {
      const fp = join(dir, file);
      const src = readFileSync(fp, 'utf8');
      const n = src.split(find).length - 1;
      if (n !== 1) { bad = `${file} 앵커 ${n}곳`; break; }
      writeFileSync(fp, src.replace(find, repl));
    }
    if (bad) { fail++; console.log(`  FAIL 변이 «${name}» — ${bad}(앵커가 낡았다)`); rmSync(dir, { recursive: true, force: true }); continue; }
    const r = runChild(dir);
    const caught = r.crashed || (r.failures && r.failures.length > 0);
    if (caught) { pass++; console.log(`  PASS 변이 «${name}» 검출 — ${r.crashed ? '자식이 죽음' : r.failures.map((f) => f.inv + '×' + f.count).join(', ')}`); }
    else { fail++; console.log(`  FAIL 변이 «${name}» 를 못 잡았다(위반 0건)`); }
    rmSync(dir, { recursive: true, force: true });
  }
}
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
