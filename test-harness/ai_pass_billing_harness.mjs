#!/usr/bin/env node
/**
 * 🤖 A.i 콘텐츠 이용권(ai_content) — «끝나는 날» 과 «매달 자동결제» 감시 (2026-09-29)
 *
 * 무엇을 지키나
 *   ① 결제하면 끝나는 날이 «1개월 뒤» 로 적힌다. 남은 기간이 있으면 그 끝에 이어 붙인다(한국 달력).
 *   ② A.i 구독은 수업 견적(autoRenewQuote)을 타지 않는다 — 타면 견적 실패로 «스스로 해지» 된다.
 *   ③ A.i 청구는 서버 가격표 금액으로 긁고, 성공하면 끝나는 날을 늘리고 다음 청구를 «끝 3일 전» 으로.
 *   ④ 수업 자동결제와 A.i 자동결제는 서로를 끄지·덮지·가리지 않는다(해지·상태·즉시결제·재등록·관리자 활성화).
 *   ⑤ 명부의 «A.i 단독» 판정은 끝난 이용권을 세지 않는다.
 *
 * 문자열 검사로는 원리상 못 잡는 것들이라(함수도 값도 «있고» 틀린 것은 «무슨 답이 나오는가» 뿐),
 * 정본을 오려 내 **진짜 SQLite** 위에서 실제로 돌린다. 「된다」 옆에 「안 된다」를 짝으로 둔다.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (f) => join(ROOT, 'cloudflare-deploy', 'src', f);
const PAY = readFileSync(process.env.AI_PASS_PAY_SRC || SRC('api-pay.ts'), 'utf8');
const AIP = readFileSync(process.env.AI_PASS_SRC || SRC('ai-pass.ts'), 'utf8');
const ACT = readFileSync(SRC('enroll-activate.ts'), 'utf8');
const ROS = readFileSync(SRC('student-track-roster.ts'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* 아래에서 FAIL 로 알린다 */ }
ok('전제: node:sqlite 를 쓸 수 있다', !!DatabaseSync);
if (!DatabaseSync) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }

/* D1 모양의 얇은 래퍼 — prepare()·prepare().bind() 두 층 모두에 first/all/run (CLAUDE.md 2장 «가짜 DB» 함정). */
function d1(db) {
  const prepare = (sql) => {
    const mk = (a) => ({
      first: async () => db.prepare(sql).get(...a) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...a) }),
      run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    });
    const o = mk([]); o.bind = (...a) => mk(a.map((v) => (v === undefined ? null : v))); return o;
  };
  return { prepare, exec: async (s) => db.exec(s) };
}

/* 함수 몸통 자르기 — TS 반환 타입 안의 `{` 를 몸통으로 잡지 않게 괄호·꺾쇠 깊이 0 인 첫 `{` 부터 짝을 맞춘다. */
function fnText(src, name) {
  const i = src.indexOf('async function ' + name + '(');
  if (i < 0) return '';
  let p = 0, a = 0, j = i + ('async function ' + name).length;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '(') p++; else if (c === ')') p--;
    else if (c === '<') a++; else if (c === '>' && src[j - 1] !== '=') a--;
    else if (c === '{' && p === 0 && a === 0) break;
  }
  let d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
function compile(tsFn, deps) {
  const js = stripTypeScriptTypes(tsFn);
  const names = Object.keys(deps);
  return new Function(...names, 'return (' + js + ');')(...names.map((n) => deps[n]));
}

// ── 정본 모듈(ai-pass.ts) 을 타입만 벗겨 그대로 import ──
const tmp = mkdtempSync(join(tmpdir(), 'aipass-'));
writeFileSync(join(tmp, 'ai-pass.mjs'), stripTypeScriptTypes(AIP));
const M = await import(pathToFileURL(join(tmp, 'ai-pass.mjs')).href);

// PRICES 는 소스에서 읽는다(⛔ 하니스에 금액을 베끼지 않는다)
const pm = PAY.match(/const PRICES[^=]*=\s*(\{[\s\S]*?\n\});/);
const PRICES = pm ? new Function('return ' + pm[1])() : null;
ok('전제: 가격표(PRICES)를 소스에서 읽었다 — ai_content 가 있다', !!(PRICES && PRICES.ai_content && PRICES.ai_content.amount > 0));
const AI_NAME = PRICES ? PRICES.ai_content.name : '';

const DAY = 86400000, KST = 9 * 3600000;
const kst = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h) - KST;
const kday = (ms) => new Date(ms + KST).toISOString().slice(0, 10);

console.log('\n① 끝나는 날 계산(한국 달력)');
ok('9/29 결제 → 10/29 끝', kday(M.addMonthsKst(kst(2026, 9, 29, 14), 1)) === '2026-10-29');
ok('1/31 결제 → 2/28 끝(없는 날은 그 달 마지막 날)', kday(M.addMonthsKst(kst(2027, 1, 31, 10), 1)) === '2027-02-28');
ok('윤년 1/31 → 2/29', kday(M.addMonthsKst(kst(2028, 1, 31, 10), 1)) === '2028-02-29');
ok('12/31 → 다음해 1/31', kday(M.addMonthsKst(kst(2026, 12, 31, 10), 1)) === '2027-01-31');
ok('한국 새벽(UTC 로는 전날)도 한국 날짜로 센다 — 10/1 05시 → 11/1', kday(M.addMonthsKst(kst(2026, 10, 1, 5), 1)) === '2026-11-01');
ok('시각(시·분)은 그대로 둔다', M.addMonthsKst(kst(2026, 9, 29, 14), 1) === kst(2026, 10, 29, 14));
const now = kst(2026, 9, 29, 10);
const p1 = M.aiPassPeriod(now, null);
ok('이용권이 없으면 지금부터 1개월', p1.start === now && kday(p1.end) === '2026-10-29');
const p2 = M.aiPassPeriod(now, kst(2026, 10, 10, 10));
ok('남은 기간이 있으면 그 끝에 이어 붙인다(10/10 → 11/10)', p2.start === kst(2026, 10, 10, 10) && kday(p2.end) === '2026-11-10');
const p3 = M.aiPassPeriod(now, kst(2026, 9, 1, 10));
ok('이미 끝난 이용권은 이어 붙이지 않는다(지금부터)', p3.start === now && kday(p3.end) === '2026-10-29');
ok('다음 자동결제 = 끝 3일 전', M.aiPassNextBilling(kst(2026, 10, 29, 10), now) === kst(2026, 10, 26, 10));
ok('끝 3일 전이 이미 지났으면 지금+3일(사전고지가 먼저 나가게)', M.aiPassNextBilling(now + DAY, now) === now + 3 * DAY);
ok('끝나는 날을 모르면 지금+3일(곧바로 긁지 않는다)', M.aiPassNextBilling(null, now) === now + 3 * DAY);

/* ── 공용 DB ── */
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
           CREATE TABLE payment_orders (order_id TEXT PRIMARY KEY, uid TEXT, program TEXT, amount INTEGER, status TEXT, method TEXT, payer_name TEXT, student_name TEXT, phone TEXT, created_at INTEGER, payment_key TEXT, paid_at INTEGER, raw TEXT, fail_reason TEXT);
           CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, plan TEXT, amount INTEGER, status TEXT DEFAULT 'active', next_billing_at INTEGER, last_billed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, billing_key TEXT, customer_key TEXT, fail_count INTEGER DEFAULT 0, teacher_id TEXT, weekly INTEGER, minutes INTEGER, charge_lock_at INTEGER);`);
  return db;
}

console.log('\n② 지금 이용권이 언제 끝나나 (currentAiPassEnd)');
{
  const db = freshDb(); const env = { DB: d1(db) };
  const ins = db.prepare(`INSERT INTO enrollments (student_user_id, student_name, package, started_at, ended_at, status, created_at, updated_at) VALUES (?,?,?,?,?,?,1,1)`);
  ins.run('kim', 'k', AI_NAME, 1, kst(2026, 10, 5), 'active');
  ins.run('kim', 'k', AI_NAME, 1, kst(2026, 11, 5), 'active');
  ins.run('kim', 'k', AI_NAME, 1, kst(2027, 1, 5), 'cancelled');
  ins.run('kim', 'k', '1:1 8회권', 1, kst(2027, 3, 5), 'active');
  ins.run('kim', 'k', 'AI 콘텐츠 전용 (대리점 일괄)', 1, kst(2027, 4, 5), 'active');
  ins.run('lee', 'l', AI_NAME, 1, kst(2027, 5, 5), 'active');
  const e = await M.currentAiPassEnd(env, 'kim', AI_NAME);
  ok('가장 늦은 «살아 있는» 개인 이용권의 끝을 준다(취소·다른 상품·대리점 일괄·남의 것 제외)', e === kst(2026, 11, 5), kday(e || 0));
  ok('이용권이 없는 학생은 null(0 으로 뭉개지 않는다)', (await M.currentAiPassEnd(env, 'nobody', AI_NAME)) === null);
}

/* 정본 함수들을 오려 낸다 */
const T_ACT = fnText(PAY, 'activateEnrollment');
const T_CHG = fnText(PAY, 'chargeAiPassOnce');
const T_INNER = fnText(PAY, 'chargeSubscriptionOnceInner');
ok('전제: activateEnrollment · chargeAiPassOnce · chargeSubscriptionOnceInner 를 오려 냈다', !!(T_ACT && T_CHG && T_INNER));

function mkActivate(calls) {
  return compile(T_ACT, {
    PRICES, AI_PASS_PLAN: M.AI_PASS_PLAN, currentAiPassEnd: M.currentAiPassEnd, aiPassPeriod: M.aiPassPeriod,
    activateB2bAiInvoicePayment: async () => { calls.b2b = (calls.b2b || 0) + 1; },
    enrollCreateSchedules: async () => { calls.sched = (calls.sched || 0) + 1; },
    syncSubscriptionNextBilling: async () => { calls.sync = (calls.sync || 0) + 1; },
  });
}

console.log('\n③ 결제하면 끝나는 날이 적힌다 (activateEnrollment)');
try {
  const db = freshDb(); const env = { DB: d1(db) }; const calls = {};
  const act = mkActivate(calls);
  const w = kst(2026, 9, 29, 14);
  await act(env, { uid: 'kim', program: 'ai_content', student_name: '김' }, 10000, w, 'MGI-A1');
  const r1 = db.prepare(`SELECT started_at, ended_at FROM enrollments WHERE notes LIKE '%MGI-A1%'`).get();
  ok('첫 결제: 지금부터 1개월 끝이 적힌다(9/29 → 10/29)', r1 && r1.started_at === w && kday(r1.ended_at) === '2026-10-29', JSON.stringify(r1));
  await act(env, { uid: 'kim', program: 'ai_content', student_name: '김' }, 10000, w + DAY, 'MGI-A2');
  const r2 = db.prepare(`SELECT started_at, ended_at FROM enrollments WHERE notes LIKE '%MGI-A2%'`).get();
  ok('남은 기간 중 또 결제: 10/29 끝에 이어 11/29', r2 && r2.started_at === r1.ended_at && kday(r2.ended_at) === '2026-11-29', JSON.stringify(r2));
  await act(env, { uid: 'kim', program: 'ai_content', student_name: '김' }, 10000, w + 2 * DAY, 'MGI-A2');
  ok('같은 주문이 두 번 와도(confirm·webhook 경합) 한 번만 늘린다', db.prepare(`SELECT COUNT(*) n FROM enrollments`).get().n === 2);
  await act(env, { uid: 'kim', program: 'pron_ai', student_name: '김' }, 15000, w, 'MGI-P1');
  const rp = db.prepare(`SELECT ended_at FROM enrollments WHERE notes LIKE '%MGI-P1%'`).get();
  ok('짝: 다른 상품은 예전 그대로 끝나는 날 NULL', rp && rp.ended_at === null, JSON.stringify(rp));
  await act(env, { uid: null, program: 'ai_content', student_name: '익명' }, 10000, w, 'MGI-A3');
  const ra = db.prepare(`SELECT ended_at FROM enrollments WHERE notes LIKE '%MGI-A3%'`).get();
  ok('짝: 학생 아이디가 없는 주문은 이어 붙일 근거가 없어 끝을 지어내지 않는다', ra && ra.ended_at === null);
  ok('활성화 뒤 다음 청구일 맞추기(sync)를 부른다', calls.sync >= 3);
} catch (e) { ok('③ 실행', false, e && e.message); }

console.log('\n④ A.i 구독은 수업 견적을 타지 않는다 (chargeSubscriptionOnceInner)');
try {
  const mkInner = (rec) => compile(T_INNER, {
    AI_PASS_PLAN: M.AI_PASS_PLAN,
    chargeAiPassOnce: async () => { rec.ai = (rec.ai || 0) + 1; return { ok: true, amount: 1 }; },
    autoRenewQuote: async () => { rec.quote = (rec.quote || 0) + 1; return { error: 'no_active_enrollment' }; },
    sendPlainSms: async () => ({ ok: true }),
    createEnrollOrder: async () => { throw new Error('여기까지 오면 안 됨'); },
  });
  const envStub = (rec) => ({ DB: { prepare: (sql) => ({ bind: () => ({ run: async () => { if (/status='cancelled'/.test(sql)) rec.cancel = (rec.cancel || 0) + 1; return { meta: {} }; } }) }) } });
  const a = {}; await mkInner(a)(envStub(a), { id: 1, plan: 'ai_content', user_id: 'kim' });
  ok('ai_content 구독 → A.i 청구로 간다, 수업 견적은 안 부른다, 해지되지 않는다', a.ai === 1 && !a.quote && !a.cancel, JSON.stringify(a));
  const b = {}; await mkInner(b)(envStub(b), { id: 2, plan: 'auto_renew', user_id: 'kim' });
  ok('짝: 수업 구독은 예전처럼 수업 견적을 탄다', b.quote === 1 && !b.ai, JSON.stringify(b));
} catch (e) { ok('④ 실행', false, e && e.message); }

console.log('\n⑤ A.i 청구 (chargeAiPassOnce) — 진짜 SQLite + 가짜 토스');
async function runCharge(tossReply, preEnd) {
  const db = freshDb(); const env = { DB: d1(db), TOSS_SECRET_KEY: 'test_sk' }; const calls = { bump: [] , fetch: [] };
  if (preEnd) db.prepare(`INSERT INTO enrollments (student_user_id, student_name, package, started_at, ended_at, status, created_at, updated_at) VALUES ('kim','김',?,1,?,'active',1,1)`).run(AI_NAME, preEnd);
  db.prepare(`INSERT INTO subscriptions (user_id, student_name, plan, amount, status, next_billing_at, created_at, updated_at, billing_key, customer_key) VALUES ('kim','김','ai_content',1,'active',1,1,1,'bk','mgi_kim_x')`).run();
  const sub = db.prepare(`SELECT * FROM subscriptions WHERE id=1`).get();
  const activateEnrollment = mkActivate({});
  const fakeFetch = async (u, init) => {
    calls.fetch.push({ u, body: JSON.parse(init.body) });
    if (tossReply === 'network') throw new Error('down');
    return { ok: tossReply.ok, json: async () => tossReply.json };
  };
  const charge = compile(T_CHG, {
    PRICES, AI_PASS_PLAN: M.AI_PASS_PLAN, currentAiPassEnd: M.currentAiPassEnd, aiPassNextBilling: M.aiPassNextBilling,
    bytesHex: (u) => Array.from(u).map((x) => x.toString(16).padStart(2, '0')).join(''),
    bumpSubscriptionFailure: async (_e, _s, reason) => { calls.bump.push(reason); },
    activateEnrollment, fetch: fakeFetch,
  });
  const r = await charge(env, sub);
  return { r, db, calls };
}
try {
  const t0 = Date.now();
  const s = await runCharge({ ok: true, json: { status: 'DONE', paymentKey: 'pk1' } }, null);
  const ord = s.db.prepare(`SELECT * FROM payment_orders`).get();
  const en = s.db.prepare(`SELECT * FROM enrollments WHERE package = ?`).get(AI_NAME);
  const sb = s.db.prepare(`SELECT * FROM subscriptions WHERE id=1`).get();
  ok('성공: 서버 가격표 금액으로 긁는다(구독에 적힌 옛 금액 아님)', s.r.ok && s.calls.fetch[0] && s.calls.fetch[0].body.amount === PRICES.ai_content.amount, JSON.stringify(s.calls.fetch[0] && s.calls.fetch[0].body));
  ok('성공: 빌링키·고객키로 청구한다', s.calls.fetch[0] && /\/v1\/billing\/bk$/.test(s.calls.fetch[0].u) && s.calls.fetch[0].body.customerKey === 'mgi_kim_x');
  ok('성공: 주문이 paid 로 남는다(program ai_content)', ord && ord.status === 'paid' && ord.program === 'ai_content' && ord.uid === 'kim');
  ok('성공: 이용권이 생기고 끝나는 날이 적힌다', en && en.ended_at && en.ended_at > t0 + 27 * DAY && en.ended_at < t0 + 32 * DAY, en && kday(en.ended_at));
  ok('성공: 다음 청구 = 새 끝나는 날 3일 전', sb && en && sb.next_billing_at === en.ended_at - 3 * DAY);
  ok('성공: 실패 횟수 0 · 금액은 가격표 값으로 갱신', sb.fail_count === 0 && sb.amount === PRICES.ai_content.amount);

  const pre = Date.now() + 10 * DAY;
  const s2 = await runCharge({ ok: true, json: { status: 'DONE', paymentKey: 'pk2' } }, pre);
  const en2 = s2.db.prepare(`SELECT ended_at FROM enrollments WHERE notes LIKE '%토스%'`).get();
  ok('성공(남은 기간 있음): 그 끝에 1개월을 이어 붙인다', en2 && en2.ended_at === M.addMonthsKst(pre, 1));

  const s3 = await runCharge({ ok: false, json: { code: 'REJECT', message: '한도초과' } }, null);
  ok('짝: 카드 거절 → 실패 처리(bump), 이용권 안 생김, 주문 failed', !s3.r.ok && s3.calls.bump.length === 1
    && s3.db.prepare(`SELECT COUNT(*) n FROM enrollments`).get().n === 0
    && s3.db.prepare(`SELECT status FROM payment_orders`).get().status === 'failed');
  const s4 = await runCharge('network', null);
  ok('짝: 네트워크 오류 → 실패 처리, 이용권 안 생김', !s4.r.ok && s4.r.error === 'network_error' && s4.calls.bump.length === 1
    && s4.db.prepare(`SELECT COUNT(*) n FROM enrollments`).get().n === 0);
} catch (e) { ok('⑤ 실행', false, e && e.message); }

console.log('\n⑥ 수업 자동결제와 A.i 자동결제는 서로를 건드리지 않는다');
function tplBetween(src, startMark, endMark) {
  const i = src.indexOf(startMark); if (i < 0) return '';
  const j = src.indexOf(endMark, i); if (j < 0) return '';
  return src.slice(i, j);
}
try {
  const db = freshDb();
  const addSub = db.prepare(`INSERT INTO subscriptions (user_id, plan, status, created_at, updated_at, billing_key) VALUES (?,?, 'active',1,1,'bk')`);
  const reset = () => { db.exec(`DELETE FROM subscriptions`); addSub.run('kim', 'auto_renew'); addSub.run('kim', 'ai_content'); addSub.run('kim', null); addSub.run('lee', 'ai_content'); };
  const cancelTpl = tplBetween(PAY, "`UPDATE subscriptions SET status='cancelled', updated_at=? WHERE user_id=? AND status='active' AND ${cancelAi", ').bind(Date.now(), authUid)');
  ok('전제: 해지 SQL 을 오려 냈다', !!cancelTpl);
  const cancelSql = (cancelAi) => new Function('cancelAi', 'AI_PASS_PLAN', 'NOT_AI_PASS_PLAN_SQL', 'return ' + cancelTpl)(cancelAi, M.AI_PASS_PLAN, M.NOT_AI_PASS_PLAN_SQL);
  reset(); db.prepare(cancelSql(false)).run(Date.now(), 'kim');
  const left1 = db.prepare(`SELECT plan FROM subscriptions WHERE user_id='kim' AND status='active'`).all().map((r) => r.plan);
  ok('수업 자동결제 해지 → 수업 구독(옛 plan NULL 포함)만 꺼지고 A.i 는 남는다', left1.length === 1 && left1[0] === 'ai_content', JSON.stringify(left1));
  reset(); db.prepare(cancelSql(true)).run(Date.now(), 'kim');
  const left2 = db.prepare(`SELECT plan FROM subscriptions WHERE status='active' ORDER BY id`).all().map((r) => r.plan);
  ok('A.i 자동결제 해지 → 그 학생 A.i 만 꺼진다(수업·남의 A.i 는 그대로)', JSON.stringify(left2) === JSON.stringify(['auto_renew', null, 'ai_content']), JSON.stringify(left2));

  const statusTpl = tplBetween(PAY, '`SELECT id, plan, amount, status, next_billing_at, teacher_id, weekly, minutes FROM subscriptions WHERE user_id=?', '\n    ).bind(authUid)');
  ok('전제: 상태 SQL 을 오려 냈다', !!statusTpl);
  const statusSql = (wantAi) => new Function('wantAi', 'AI_PASS_PLAN', 'NOT_AI_PASS_PLAN_SQL', 'return ' + statusTpl)(wantAi, M.AI_PASS_PLAN, M.NOT_AI_PASS_PLAN_SQL);
  reset(); addSub.run('kim', 'ai_content');   // A.i 구독이 «가장 최근» 인 상태 — 그래야 가리는지가 드러난다
  ok('수강신청 화면(기본) 상태 → A.i 구독이 더 최근이어도 수업 구독만 보인다', (db.prepare(statusSql(false)).get('kim') || {}).plan !== 'ai_content');
  ok('A.i 화면(?plan=ai_content) 상태 → A.i 구독이 보인다', (db.prepare(statusSql(true)).get('kim') || {}).plan === 'ai_content');

  const nowSql = tplBetween(PAY, "`SELECT * FROM subscriptions WHERE user_id=? AND status='active' AND billing_key IS NOT NULL AND ${NOT_AI_PASS_PLAN_SQL}", '\n    ).bind(authUid)');
  ok('전제: 즉시결제(charge-now) SQL 을 오려 냈다', !!nowSql);
  if (nowSql) {
    db.exec(`DELETE FROM subscriptions`); addSub.run('kim', 'ai_content');
    const got = db.prepare(new Function('NOT_AI_PASS_PLAN_SQL', 'return ' + nowSql)(M.NOT_AI_PASS_PLAN_SQL)).get('kim');
    ok('수업 «연장 결제» 버튼은 A.i 구독 카드로 수업을 긁지 않는다(A.i 구독만 있으면 못 찾음)', !got);
  }
  ok('수업 카드 재등록이 A.i 구독을 «replaced» 로 끄지 않는다',
    PAY.includes("UPDATE subscriptions SET status='replaced', updated_at=? WHERE user_id=? AND status='active' AND ${NOT_AI_PASS_PLAN_SQL}"));

  const actSql = (ACT.match(/SELECT id FROM subscriptions WHERE user_id = \? AND status = 'active'[^`]*/) || [])[0];
  ok('전제: 관리자 활성화(enroll-activate)의 구독 조회를 오려 냈다', !!actSql);
  if (actSql) {
    db.exec(`DELETE FROM subscriptions`); addSub.run('kim', 'ai_content');
    ok('관리자 수강 활성화가 A.i 구독을 수업 패키지로 덮지 않는다(A.i 구독만 있으면 못 찾음)', !db.prepare(actSql).get('kim'));
    addSub.run('kim', 'auto_renew');
    const hit = db.prepare(actSql).get('kim');
    ok('짝: 수업 구독은 그대로 찾는다', !!hit && db.prepare(`SELECT plan FROM subscriptions WHERE id=?`).get(hit.id).plan === 'auto_renew');
  }
} catch (e) { ok('⑥ 실행', false, e && e.message); }

console.log('\n⑦ 명부 «A.i 단독» 은 끝난 이용권을 세지 않는다');
try {
  const sql = (ROS.match(/export const PAID_AI_UIDS_SQL = `([\s\S]*?)`;/) || [])[1] || '';
  ok('전제: PAID_AI_UIDS_SQL 을 읽었다', /AI 콘텐츠 전용/.test(sql));
  const db = freshDb();
  const ins = db.prepare(`INSERT INTO enrollments (student_user_id, student_name, package, ended_at, status, created_at, updated_at) VALUES (?,?,?,?, 'active',1,1)`);
  ins.run('old', 'o', AI_NAME, Date.now() - DAY);
  ins.run('live', 'l', AI_NAME, Date.now() + 5 * DAY);
  ins.run('b2b', 'b', 'AI 콘텐츠 전용 (대리점 일괄)', null);
  const got = new Set(db.prepare(sql).all().map((r) => r.student_user_id));
  ok('끝난 이용권은 빠진다', !got.has('old'));
  ok('짝: 쓰는 중인 이용권·끝나는 날 없는 대리점 일괄은 남는다', got.has('live') && got.has('b2b'));
} catch (e) { ok('⑦ 실행', false, e && e.message); }

console.log('\n⑧ 화면(ai-pass.html) 배선');
{
  const H = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'ai-pass.html'), 'utf8');
  ok('상태를 plan=ai_content 로 묻는다(수업 구독을 A.i 로 오인하지 않게)', /billing\/status\?plan=ai_content/.test(H));
  ok('등록·확정·해지 모두 plan: ai_content 를 싣는다', /plan:\s*'ai_content'/.test(H) && (H.match(/body\(/g) || []).length >= 3);
  ok('카드 등록에서 이 화면으로 돌아온다', /successUrl:\s*location\.origin \+ '\/ai-pass\.html\?billing_return=1'/.test(H));
  ok('끝나는 날을 화면에서 다시 계산하지 않는다(서버 값 ai_pass_ends_at 을 그린다)', /ai_pass_ends_at/.test(H) && !/addMonths|setMonth/.test(H));
  ok('사전고지 문자의 해지 링크가 A.i 구독이면 이 화면', /siteUrl\(isAi \? '\/ai-pass\.html' : '\/enroll\.html'\)/.test(PAY));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
