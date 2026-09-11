/**
 * exec-summary.ts — 경영진 일일 요약 API (2026-06-09)
 *
 *   GET  /api/admin/exec/summary          오늘/이번주/이번달 학생수·매출·비용·순익
 *   GET  /api/admin/exec/series?days=30   일별 시계열(신규·누적재원·매출·비용·순익)
 *   GET  /api/admin/exec/detail?date=..   특정일 상세(결제·지출·신규학생)
 *   GET  /api/admin/exec/scopes           (본사 전용) 열람 가능한 대리점/지사 목록
 *   POST /api/admin/exec/send-briefing    알림톡 경영 브리핑 발송(본사 집계)
 *   GET/POST/DELETE /api/admin/exec/recipients[/:id]   알림톡 수신자 관리
 *
 *  대리점 데이터 격리:
 *   - 로그인 계정의 admin_scope(hq|branch|agency)에 따라 학생·매출을 필터링.
 *   - 대리점/지사: 자기 학생·매출만. 비용(지출)은 본사 통합 관리라 0 표기(hq_only).
 *   - 본사(hq): 전체. ?as=agency:<shop> / branch:<지역> / hq 로 특정 대리점 드릴다운 가능(본사만 허용).
 */

import { sendKakaoAlimtalk } from './solapi-client';
import { notSeedSql } from './accounting-reports';   // 🌱 시연용 시드 결제 제외 — 리포트와 같은 조건을 쓴다
import { franchiseInClause } from './d1-chunk';   // 🔒 지사 목록 IN 조각 (D1 바인드 한도 처리 포함)
import { type Scope, getScope, franchiseList } from './scope';   // 🔒 스코프 판정은 scope.ts 한 곳에서만

interface Env {
  DB: D1Database;
  SOLAPI_API_KEY?: string;
  SOLAPI_API_SECRET?: string;
  SOLAPI_PFID?: string;
  SOLAPI_FROM_PHONE?: string;
  SOLAPI_TEMPLATE_EXEC_BRIEFING?: string;
  SOLAPI_TEST_MODE?: string;
}

const KST = 9 * 3600 * 1000;
const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function kstDate(ms: number): string { return new Date(ms + KST).toISOString().slice(0, 10); }
function todayKST(): string { return kstDate(Date.now()); }
function dayStartMs(d: string): number { return Date.parse(d + 'T00:00:00Z') - KST; }
function shift(d: string, days: number): string { return kstDate(dayStartMs(d) + days * 86400000); }
function monthStartMs(d: string): number { const [y, m] = d.split('-').map(Number); return Date.UTC(y, m - 1, 1) - KST; }
function weekStartMon(d: string): string { const day = new Date(dayStartMs(d) + KST).getUTCDay(); return shift(d, -((day + 6) % 7)); }
function trend(cur: number, prev: number): number { if (!prev) return cur > 0 ? 100 : 0; return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10; }
function fmtMan(n: number): string { n = n || 0; if (Math.abs(n) >= 10000) { const m = Math.round((n / 10000) * 10) / 10; return m.toLocaleString('ko-KR') + '만원'; } return n.toLocaleString('ko-KR') + '원'; }
async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

/* ════════ 대리점 스코프 ════════
 * (2026-08-07) 이 파일은 scope.ts 를 **통째로 복제**해 갖고 있었다
 *   (Scope·franchiseList·scopeLabel·ensureScope·autoSeedOne·getScope 6벌).
 *   그중 autoSeedOne 에는 **franchise(지사본사) 분기가 빠져 있어서**,
 *   같은 `capi*` 계정이라도 어느 쪽이 먼저 도느냐에 따라 franchise 로도
 *   branch 로도 심어졌다. 게다가 `INSERT OR IGNORE` 라 **먼저 심은 쪽이 영구히 이긴다**
 *   — 나중에 올바른 쪽이 돌아도 고쳐지지 않는다.
 *   → 스코프 판정은 scope.ts 한 곳만 쓴다. 아래 stuCond 만 이 파일 고유로 남긴다.
 *
 *   ⚠️ 세션 없을 때 «본사 전체»로 보는 동작은 **그대로 살려야 한다** — 경영요약 브리핑을
 *      index.ts 가 세션 없는 가짜 Request 로 부르기 때문(여기서 'none' 으로 바꾸면
 *      매일 나가던 브리핑이 빈 내용으로 조용히 바뀐다). scope.ts 의 noSessionScope 로 넘긴다. */
const scopeFor = (env: Env, request: Request) =>
  getScope(env as any, request, { noSessionScope: 'hq' });

/* ⚠️⚠️ 재원 학생 판정 — `status='정상'` 은 **한 건도 안 맞는다** (2026-08-09 운영 D1 실측)
 *
 *   students_erp.status 의 실제 값은 **`active` 28,665 · `inactive` 726 두 가지뿐**이다.
 *   카페24 동기화(cafe24-sync.ts)가 영어로 적재한다. `'정상'` 은 옛 수기 입력 시절의 값이고
 *   지금 DB 에 **0건**이다. 그런데 이 파일은 그걸로 학생을 세고 있었다 —
 *   그래서 경영 대시보드의 **재원생·신규·누적·일별 상세가 전부 0** 이었다.
 *   (api-admin.ts 5913줄에 같은 사고를 겪고 남긴 경고 주석이 있다. 이 파일만 안 고쳐져 있었다.)
 *
 *   🔴 「이번달 탈락」은 `status<>'정상'` 이라 **전 학생 29,391명에 걸리는 조건**이었다.
 *      지금은 end_date 가 이번달인 사람이 없어 우연히 0으로 보이지만, 재원 학생 한 명이
 *      이번달 종료일을 받는 순간 **재원 전체가 탈락으로 세어진다.** 터지기 전에 고친다.
 *      없는 값과 비교하면 «아무도 안 맞거나 모두가 맞거나» 둘 중 하나다. 둘 다 틀린다.
 *
 *   그래서 판정을 **여기 한 곳**으로 모은다. 새 조회를 붙일 때 이 함수를 쓰면 같은 실수가 안 난다.
 *   NULL·빈 문자열도 재원으로 본다(수기 등록분이 status 없이 들어오는 경우가 있다).
 */
/* ⚠️ export — 이 판정을 다른 파일이 또 잘못 베낄 위험을 없애려고 내보낸다.
 *   ai-billing.ts(B2B AI 사용료 청구 — 2026-09-10)가 「재원 학생」을 셀 때 이걸 그대로 쓴다.
 *   복사해서 새로 짜지 말 것 — 위 «단독 비교하면 0건» 사고가 그대로 재현된다.
 */
export function activeCond(alias = ''): string {
  const col = (alias ? alias + '.' : '') + 'status';
  return `(${col} IN ('정상','활동','active') OR ${col} IS NULL OR ${col} = '')`;
}
function inactiveCond(alias = ''): string { return `NOT ${activeCond(alias)}`; }

/* 📌 «재원» 은 status 만으로 정하지 않는다 — **종료일도 봐야 한다.**
 *   api-admin.ts 의 오늘 KPI 는 이미 그렇게 센다:
 *     (end_date IS NULL OR '' OR >= 오늘) AND status <> 'inactive'   → 약 7,667명
 *   status 만 보면 28,665명이 된다. 두 화면이 **서로 다른 재원 수**를 말하면 그 자체가 사고다.
 *   실측으로도 종료일은 믿을 만하다 — 종료 1년 지난 14,227명 중 최근 60일 수업자는 22명(0.15%).
 *   🪤 `end_date='0000-00-00'`(MySQL 제로날짜) 6,770명은 «>= 오늘» 에 안 걸려 자동으로 빠진다.
 *      실제로 그들 중 최근 60일 수업자는 0명이라 빠지는 것이 맞다.
 *   🕘 `date('now','+9 hours')` = KST 오늘. 바인드를 늘리지 않으려고 인라인으로 쓴다
 *      (호출부마다 바인드 순서를 맞추다 틀리는 것이 더 위험하다).
 */
export function enrolledCond(alias = ''): string {
  const p = alias ? alias + '.' : '';
  return `(${p}end_date IS NULL OR ${p}end_date = '' OR ${p}end_date >= date('now','+9 hours'))`
       + ` AND ${activeCond(alias)}`;
}

// 비용(재무) 노출 여부 — 본사·지사본사만
function costVisible(scope: Scope): boolean {
  return scope.type === 'hq' || scope.type === 'franchise';
}

// 학생 필터 조건(students_erp 기준). hq → 조건 없음.
function stuCond(scope: Scope): { clause: string; binds: any[] } {
  if (scope.type === 'agency') return { clause: `shop_name = ?`, binds: [scope.value] };
  if (scope.type === 'branch') return { clause: `franchise LIKE ?`, binds: [scope.value + '%'] };
  // 지사 목록 조각은 scope.ts 한 곳에서만 만든다(D1 바인드 한도 처리 포함).
  //  ⚠️ 아래 'none' 분기는 scope.ts 의 stuCond 와 **일부러 다르다** — 경영요약은
  //     권한 없음을 빈 결과로 막고, scope.ts 는 내부직원을 제한 없음으로 둔다. 합치지 말 것.
  if (scope.type === 'franchise') return franchiseInClause(franchiseList(scope.value));
  if (scope.type === 'none') return { clause: `1=0`, binds: [] }; // 권한 없음 → 빈 결과
  return { clause: '', binds: [] }; // hq
}
// ════════ 집계(스코프 반영) ════════
async function income(env: Env, a: number, b: number, scope: Scope) {
  return safe(async () => {
    const c = stuCond(scope);
    let sql = `SELECT COALESCE(SUM(amount_krw),0) s, COUNT(*) c FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at>=? AND paid_at<?`;
    const binds: any[] = [a, b];
    if (c.clause) { sql += ` AND user_id IN (SELECT user_id FROM students_erp WHERE ${c.clause})`; binds.push(...c.binds); }
    const r = await env.DB.prepare(sql).bind(...binds).first<{ s: number; c: number }>();
    return { sum: r?.s || 0, count: r?.c || 0 };
  }, { sum: 0, count: 0 });
}
// 비용은 본사(hq)만. 대리점/지사는 0 + hqOnly 플래그.
async function expense(env: Env, a: number, b: number, scope: Scope) {
  if (!costVisible(scope)) return { manual: 0, payroll: 0, total: 0, hqOnly: true };
  const manual = await safe(async () => { const r = await env.DB.prepare(`SELECT COALESCE(SUM(amount_krw),0) s FROM finance_expenses WHERE spent_at>=? AND spent_at<?`).bind(a, b).first<{ s: number }>(); return r?.s || 0; }, 0);
  const payroll = await safe(async () => { const r = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) s FROM payslips WHERE paid=1 AND finalized_at>=? AND finalized_at<?`).bind(a, b).first<{ s: number }>(); return r?.s || 0; }, 0);
  return { manual, payroll, total: manual + payroll, hqOnly: false };
}
// 본사 수수료율(가맹 정산 기준) — accounting-reports.ts 기본값과 동일
const HQ_FEE_RATE = 0.15;

async function activeTotal(env: Env, scope: Scope): Promise<number> {
  return safe(async () => {
    const c = stuCond(scope);
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE ${enrolledCond()}` + (c.clause ? ` AND ${c.clause}` : '')).bind(...c.binds).first<{ c: number }>();
    return r?.c || 0;
  }, 0);
}
async function newStudents(env: Env, like: string, scope: Scope): Promise<number> {
  return safe(async () => {
    const c = stuCond(scope);
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE ${activeCond()} AND signup_date LIKE ?` + (c.clause ? ` AND ${c.clause}` : '')).bind(like, ...c.binds).first<{ c: number }>();
    return r?.c || 0;
  }, 0);
}

async function summary(env: Env, scope: Scope): Promise<Response> {
  const today = todayKST();
  const tStart = dayStartMs(today), tEnd = tStart + 86400000, yStart = tStart - 86400000;
  const wk = weekStartMon(today), wkStart = dayStartMs(wk), lastWkStart = wkStart - 7 * 86400000;
  const mo = today.slice(0, 7), monStart = monthStartMs(today);
  const [yy, mm] = mo.split('-').map(Number);
  const lastMonStart = Date.UTC(mm === 1 ? yy - 1 : yy, mm === 1 ? 11 : mm - 2, 1) - KST;
  const now = Date.now();

  const pack = async (a: number, b: number) => {
    // ⚡ 속도: 수입·지출 쿼리 병렬 실행
    const [inc, exp] = await Promise.all([income(env, a, b, scope), expense(env, a, b, scope)]);
    const _fee = Math.round(inc.sum * HQ_FEE_RATE);
    return { income: inc.sum, pay_count: inc.count, expense: exp.total, expense_manual: exp.manual, expense_payroll: exp.payroll, net: inc.sum - exp.total, fee: _fee, settle: inc.sum - _fee };
  };
  // ⚡ 속도: 6개 기간 집계 + 학생수 3종을 모두 병렬 실행 (기존 순차 → 병렬)
  const [tdy, yday, week, lastWeek, month, lastMonth, active, newToday, newMonth] = await Promise.all([
    pack(tStart, tEnd), pack(yStart, tStart),
    pack(wkStart, now), pack(lastWkStart, wkStart),
    pack(monStart, now), pack(lastMonStart, monStart),
    activeTotal(env, scope), newStudents(env, today, scope), newStudents(env, mo + '%', scope)
  ]);

  return j({
    ok: true, as_of: new Date(now).toISOString(),
    scope: { type: scope.type, value: scope.value, label: scope.label },
    cost_hq_only: !costVisible(scope), fee_rate: HQ_FEE_RATE,
    students: { active, new_today: newToday, new_this_month: newMonth },
    today: { date: today, ...tdy, income_trend: trend(tdy.income, yday.income), net_trend: trend(tdy.net, yday.net) },
    this_week: { start: wk, ...week, income_trend: trend(week.income, lastWeek.income), net_trend: trend(week.net, lastWeek.net) },
    this_month: { period: mo, ...month, income_trend: trend(month.income, lastMonth.income), net_trend: trend(month.net, lastMonth.net) },
  });
}

async function series(env: Env, url: URL, scope: Scope): Promise<Response> {
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 7), 180);
  const today = todayKST();
  const start = shift(today, -(days - 1));
  const startMs = dayStartMs(start);
  const c = stuCond(scope);
  const inWhere = c.clause ? ` AND user_id IN (SELECT user_id FROM students_erp WHERE ${c.clause})` : '';

  const incRows = await safe(async () => (await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', datetime((paid_at/1000)+32400,'unixepoch')) d, COALESCE(SUM(amount_krw),0) s, COUNT(*) c
     FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at>=?` + inWhere + ` GROUP BY d`).bind(startMs, ...c.binds).all()).results as any[], []);
  // 비용: 본사만
  let expRows: any[] = [], payRows: any[] = [];
  if (costVisible(scope)) {
    expRows = await safe(async () => (await env.DB.prepare(`SELECT strftime('%Y-%m-%d', datetime((spent_at/1000)+32400,'unixepoch')) d, COALESCE(SUM(amount_krw),0) s FROM finance_expenses WHERE spent_at>=? GROUP BY d`).bind(startMs).all()).results as any[], []);
    payRows = await safe(async () => (await env.DB.prepare(`SELECT strftime('%Y-%m-%d', datetime((finalized_at/1000)+32400,'unixepoch')) d, COALESCE(SUM(payment_krw),0) s FROM payslips WHERE paid=1 AND finalized_at>=? GROUP BY d`).bind(startMs).all()).results as any[], []);
  }
  const stuRows = await safe(async () => (await env.DB.prepare(
    `SELECT signup_date d, COUNT(*) c FROM students_erp WHERE ${activeCond()} AND signup_date>=?` + (c.clause ? ` AND ${c.clause}` : '') + ` GROUP BY d`).bind(start, ...c.binds).all()).results as any[], []);
  const baseBefore = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE ${enrolledCond()} AND signup_date<?` + (c.clause ? ` AND ${c.clause}` : '')).bind(start, ...c.binds).first<{ c: number }>();
    return r?.c || 0;
  }, 0);

  const incMap: Record<string, { s: number; c: number }> = {};
  for (const r of incRows) incMap[r.d] = { s: r.s || 0, c: r.c || 0 };
  const expMap: Record<string, number> = {};
  for (const r of expRows) expMap[r.d] = (expMap[r.d] || 0) + (r.s || 0);
  for (const r of payRows) expMap[r.d] = (expMap[r.d] || 0) + (r.s || 0);
  const stuMap: Record<string, number> = {};
  for (const r of stuRows) stuMap[r.d] = r.c || 0;

  const out: any[] = [];
  let cum = baseBefore;
  for (let i = 0; i < days; i++) {
    const d = shift(start, i);
    const inc = incMap[d]?.s || 0, exp = expMap[d] || 0, nw = stuMap[d] || 0;
    cum += nw;
    out.push({ date: d, new_students: nw, cum_students: cum, income: inc, pay_count: incMap[d]?.c || 0, expense: exp, net: inc - exp });
  }
  /* 💰 «비용이 0» 과 «비용을 아직 안 적었다» 는 완전히 다른 말이다. (2026-08-09)
   *   운영 실측: `finance_expenses` 는 **한 행도 없고**(개설 이래 0건),
   *   `payslips paid=1` 은 24건이지만 마지막이 **2026-05-20** 이라 최근 30일에 0건이다.
   *   그 결과 이 화면은 비용 막대가 안 보이고 **순익 선이 매출 막대를 그대로 따라갔다** —
   *   즉 「번 돈이 전부 남는다」고 말하고 있었다. 경영 판단에 쓰는 화면에서 이건 위험하다.
   *   → 숫자를 지어내지 않는다. **«아직 안 적혔다»는 사실을 그대로 실어 보내고**
   *     화면이 순익 대신 그 사실을 말하게 한다. 비용이 한 건이라도 들어오면 자동으로 원상복귀.
   */
  const expenseRowCount = expRows.length + payRows.length;
  return j({
    ok: true, days, from: start, to: today, cost_hq_only: !costVisible(scope),
    expense_recorded: expenseRowCount > 0,
    expense_note: (costVisible(scope) && expenseRowCount === 0)
      ? '이 기간에 입력된 비용이 없습니다 — 순익은 비용을 뺀 값이 아닙니다 / No expenses recorded for this period — "net" does not deduct costs'
      : null,
    series: out,
  });
}

async function detail(env: Env, url: URL, scope: Scope): Promise<Response> {
  const date = url.searchParams.get('date') || todayKST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return j({ ok: false, error: 'bad date' }, 400);
  const a = dayStartMs(date), b = a + 86400000;
  const c = stuCond(scope);
  const inWhere = c.clause ? ` AND sp.user_id IN (SELECT user_id FROM students_erp WHERE ${c.clause})` : '';

  const payments = await safe(async () => (await env.DB.prepare(
    `SELECT sp.id, sp.amount_krw, sp.paid_at, sp.method, COALESCE(se.korean_name, sp.user_id) AS student_name
     FROM student_payments sp LEFT JOIN students_erp se ON se.user_id = sp.user_id
     WHERE sp.status='paid' AND ${notSeedSql('sp')} AND sp.paid_at>=? AND sp.paid_at<?` + inWhere + ` ORDER BY sp.paid_at DESC LIMIT 200`).bind(a, b, ...c.binds).all()).results as any[], []);

  let expenses: any[] = [], payroll: any = { s: 0, c: 0 };
  if (costVisible(scope)) {
    expenses = await safe(async () => (await env.DB.prepare(`SELECT id, category, amount_krw, spent_at, memo FROM finance_expenses WHERE spent_at>=? AND spent_at<? ORDER BY amount_krw DESC LIMIT 200`).bind(a, b).all()).results as any[], []);
    payroll = await safe(async () => await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) s, COUNT(*) c FROM payslips WHERE paid=1 AND finalized_at>=? AND finalized_at<?`).bind(a, b).first<{ s: number; c: number }>(), { s: 0, c: 0 });
  }
  const newStu = await safe(async () => (await env.DB.prepare(
    `SELECT korean_name, english_name, signup_date FROM students_erp WHERE ${activeCond()} AND signup_date=?` + (c.clause ? ` AND ${c.clause}` : '') + ` LIMIT 200`).bind(date, ...c.binds).all()).results as any[], []);

  const incomeTotal = payments.reduce((s, r) => s + (r.amount_krw || 0), 0);
  const manualTotal = expenses.reduce((s, r) => s + (r.amount_krw || 0), 0);
  return j({
    ok: true, date, cost_hq_only: !costVisible(scope),
    income_total: incomeTotal, expense_total: manualTotal + (payroll?.s || 0),
    payroll_total: payroll?.s || 0, payroll_count: payroll?.c || 0,
    payments, expenses, new_students: newStu,
  });
}

// 본사: 드릴다운용 대리점/지사 목록
async function scopes(env: Env, scope: Scope): Promise<Response> {
  if (scope.type !== 'hq') return j({ ok: true, hq: false, options: [] });
  const shops = await safe(async () => (await env.DB.prepare(`SELECT shop_name, franchise, COUNT(*) c FROM students_erp WHERE ${enrolledCond()} AND shop_name IS NOT NULL GROUP BY shop_name ORDER BY shop_name`).all()).results as any[], []);
  const regions = await safe(async () => (await env.DB.prepare(`SELECT DISTINCT substr(franchise,1,instr(franchise||' ',' ')-1) region FROM students_erp WHERE franchise IS NOT NULL`).all()).results as any[], []);
  return j({
    ok: true, hq: true,
    agencies: shops.map(s => ({ value: 'agency:' + s.shop_name, label: s.shop_name, students: s.c })),
    branches: regions.filter(r => r.region).map(r => ({ value: 'branch:' + r.region, label: r.region + ' 지사' })),
  });
}

// ════════ 알림톡 경영 브리핑 (본사 집계, cron) ════════
async function ensureRecip(env: Env): Promise<void> {
  await safe(async () => { await env.DB.exec(`CREATE TABLE IF NOT EXISTS exec_recipients (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL UNIQUE, name TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL);`); return true; }, false);
}
async function briefingData(env: Env) {
  const hq: Scope = { type: 'hq', value: null, label: '본사' };
  const today = todayKST(), yday = shift(today, -1);
  const yStart = dayStartMs(yday), yEnd = yStart + 86400000;
  const monStart = monthStartMs(today), now = Date.now();
  const active = await activeTotal(env, hq);
  const newMonth = await newStudents(env, today.slice(0, 7) + '%', hq);
  const incY = await income(env, yStart, yEnd, hq), expY = await expense(env, yStart, yEnd, hq);
  const incM = await income(env, monStart, now, hq), expM = await expense(env, monStart, now, hq);
  return { date: today, active, newMonth, revYday: incY.sum, revYdayCnt: incY.count, costYday: expY.total, netYday: incY.sum - expY.total, revMonth: incM.sum, costMonth: expM.total, netMonth: incM.sum - expM.total };
}
async function sendBriefing(env: Env): Promise<Response> {
  await ensureRecip(env);
  const d = await briefingData(env);
  const dateLabel = d.date.slice(5).replace('-', '/');
  const recips = await safe(async () => (await env.DB.prepare(`SELECT phone, name FROM exec_recipients WHERE enabled=1`).all()).results as any[], []);
  const variables: Record<string, string> = {
    '#{날짜}': dateLabel, '#{재원생}': String(d.active), '#{신규}': String(d.newMonth),
    '#{어제매출}': fmtMan(d.revYday), '#{어제비용}': fmtMan(d.costYday), '#{어제순익}': fmtMan(d.netYday),
    '#{월매출}': fmtMan(d.revMonth), '#{월비용}': fmtMan(d.costMonth), '#{월순익}': fmtMan(d.netMonth),
  };
  const smsText = `[망고아이 경영브리핑] ${dateLabel}\n재원생 ${d.active}명(월신규+${d.newMonth})\n어제 매출 ${fmtMan(d.revYday)}/비용 ${fmtMan(d.costYday)}/순익 ${fmtMan(d.netYday)}\n이달 매출 ${fmtMan(d.revMonth)}/순익 ${fmtMan(d.netMonth)}\n대시보드 https://webrtc-unified-platform.navy111p.workers.dev/admin/exec`;
  const templateCode = (env as any).SOLAPI_TEMPLATE_EXEC_BRIEFING || '';
  const results: any[] = [];
  for (const r of recips) {
    const res = await safe(async () => await sendKakaoAlimtalk(env as any, { templateCode, recipientPhone: r.phone, recipientName: r.name || undefined, variables, fallbackSmsText: smsText }), { ok: false, status: 'error', mode: 'error' } as any);
    results.push({ phone: r.phone, ok: (res as any).ok, status: (res as any).status, mode: (res as any).mode });
    await safe(async () => { await env.DB.prepare(`INSERT INTO notification_queue (type, title, body, meta, channel, status, created_at, sent_at) VALUES ('exec_briefing', ?, ?, ?, 'alimtalk', ?, ?, ?)`).bind('경영 브리핑 ' + dateLabel, smsText, JSON.stringify({ phone: r.phone }), (res as any).ok ? 'sent' : 'failed', Date.now(), (res as any).ok ? Date.now() : null).run(); return true; }, false);
  }
  return j({ ok: true, mode: recips.length ? (results[0]?.mode || 'unknown') : 'no-recipient', recipients: recips.length, sent: results.filter(r => r.ok).length, results, data: d });
}
async function listRecip(env: Env): Promise<Response> {
  await ensureRecip(env);
  const rows = await safe(async () => (await env.DB.prepare(`SELECT id, phone, name, enabled FROM exec_recipients ORDER BY id`).all()).results as any[], []);
  return j({ ok: true, recipients: rows });
}
async function addRecip(env: Env, request: Request): Promise<Response> {
  await ensureRecip(env);
  const body = await safe(async () => await request.json() as any, {} as any);
  const phone = String(body.phone || '').replace(/[^0-9]/g, '');
  if (phone.length < 10) return j({ ok: false, error: 'invalid_phone' }, 400);
  await env.DB.prepare(`INSERT OR REPLACE INTO exec_recipients (phone, name, enabled, created_at) VALUES (?,?,?,?)`).bind(phone, body.name || null, body.enabled === false ? 0 : 1, Date.now()).run();
  return j({ ok: true, phone });
}
async function delRecip(env: Env, id: number): Promise<Response> {
  await ensureRecip(env);
  await safe(async () => { await env.DB.prepare(`DELETE FROM exec_recipients WHERE id=?`).bind(id).run(); return true; }, false);
  return j({ ok: true });
}


// ════════ 추가 분석: 대리점 비교·결제수단·수납·유지 ════════
async function breakdown(env: Env, url: URL, scope: Scope): Promise<Response> {
  const today = todayKST();
  const mo = today.slice(0, 7);
  const monStart = monthStartMs(today);
  const c = stuCond(scope);
  const inPay = c.clause ? ` AND user_id IN (SELECT user_id FROM students_erp WHERE ${c.clause})` : '';
  const stuClause = c.clause ? ` AND ${c.clause}` : '';

  // 결제수단 비중 (이번달, 스코프 반영)
  const methods = await safe(async () => (await env.DB.prepare(
    `SELECT COALESCE(method,'기타') method, COUNT(*) c, COALESCE(SUM(amount_krw),0) s
     FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at>=?` + inPay + ` GROUP BY method ORDER BY s DESC`
  ).bind(monStart, ...c.binds).all()).results as any[], []);

  // 재원 상태 분포 (정상/휴원/퇴원 등)
  const statusRows = await safe(async () => (await env.DB.prepare(
    `SELECT COALESCE(NULLIF(status,''),'미상') status, COUNT(*) c FROM students_erp WHERE 1=1` + stuClause + ` GROUP BY status ORDER BY c DESC`
  ).bind(...c.binds).all()).results as any[], []);

  // 이번달 탈락(퇴원/휴원) — status<>'정상' AND end_date 이번달
  const dropMonth = await safe(async () => {
    const r = await env.DB.prepare(
      `SELECT COUNT(*) c FROM students_erp WHERE ${inactiveCond()} AND end_date LIKE ?` + stuClause
    ).bind(mo + '%', ...c.binds).first<{ c: number }>();
    return r?.c || 0;
  }, 0);

  // 수납 현황: 재원생 중 이번달 결제 학생 수
  const active = await activeTotal(env, scope);
  const paidStudents = await safe(async () => {
    const r = await env.DB.prepare(
      `SELECT COUNT(DISTINCT user_id) c FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at>=?` + inPay
    ).bind(monStart, ...c.binds).first<{ c: number }>();
    return r?.c || 0;
  }, 0);

  // 대리점별 비교 — 본사(전체) + 지사(자기 지역 대리점들로 구분). 대리점(단일매장)은 미표시.
  let branches: any[] = [];
  if (scope.type === 'hq' || scope.type === 'branch' || scope.type === 'franchise') {
    const bc = stuCond(scope); // hq→조건없음, branch→franchise LIKE '지역%'
    const bWhere = bc.clause ? ` AND ${bc.clause}` : '';
    branches = await safe(async () => (await env.DB.prepare(
      `SELECT se.shop_name shop, se.franchise region,
              COUNT(DISTINCT se.user_id) students,
              COALESCE(SUM(CASE WHEN sp.status='paid' AND sp.paid_at>=? THEN sp.amount_krw ELSE 0 END),0) rev_month
       FROM students_erp se
       LEFT JOIN student_payments sp ON sp.user_id = se.user_id
       WHERE ${enrolledCond('se')} AND se.shop_name IS NOT NULL AND se.shop_name<>''` + bWhere + `
       GROUP BY se.shop_name ORDER BY rev_month DESC`
    ).bind(monStart, ...bc.binds).all()).results as any[], []);
  }

  const unpaid = Math.max(active - paidStudents, 0);
  const collectRate = active ? Math.round((paidStudents / active) * 1000) / 10 : 0;

  return j({
    ok: true, period: mo, cost_hq_only: !costVisible(scope),
    methods: methods.map((m: any) => ({ method: m.method, count: m.c, sum: m.s })),
    status_breakdown: statusRows.map((s: any) => ({ status: s.status, count: s.c })),
    billing: { active, paid: paidStudents, unpaid, collect_rate: collectRate },
    retention: { active, drop_this_month: dropMonth },
    fee_rate: HQ_FEE_RATE,
    branches: branches.map((b: any) => ({ shop: b.shop, region: b.region, students: b.students, rev_month: b.rev_month, fee_month: Math.round((b.rev_month||0) * HQ_FEE_RATE) })),
  });
}

export async function execRouter(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const p = url.pathname.replace(/^\/api\/admin\/exec\/?/, '').replace(/\/$/, '');
    const method = request.method;

    // 발송/수신자 관리는 스코프 무관(본사 운영)
    if (p === 'send-briefing' && method === 'POST') return await sendBriefing(env);
    if (p === 'recipients' && method === 'GET') return await listRecip(env);
    if (p === 'recipients' && method === 'POST') return await addRecip(env, request);
    const rdel = p.match(/^recipients\/(\d+)$/);
    if (rdel && method === 'DELETE') return await delRecip(env, Number(rdel[1]));

    // 조회는 스코프 격리
    const scope = await scopeFor(env, request);
    if (p === 'summary') return await summary(env, scope);
    if (p === 'series') return await series(env, url, scope);
    if (p === 'detail') return await detail(env, url, scope);
    if (p === 'scopes') return await scopes(env, scope);
    if (p === 'breakdown') return await breakdown(env, url, scope);
    return j({ ok: false, error: 'not found' }, 404);
  } catch (e: any) {
    return j({ ok: false, error: String(e?.message || e) }, 500);
  }
}
