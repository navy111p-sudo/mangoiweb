/**
 * exec-summary.ts — 경영진 일일 요약 API (2026-06-08 추가)
 *
 *   GET /api/admin/exec/summary          오늘/이번주/이번달 학생수·매출·비용·순익 (전기대비 추이 포함)
 *   GET /api/admin/exec/series?days=30   일별 시계열(신규학생·누적재원·매출·비용·순익) — 차트용
 *   GET /api/admin/exec/detail?date=YYYY-MM-DD  특정일 상세(결제 내역·지출 내역·신규 학생)
 *
 *  매출 = student_payments(status='paid', paid_at)
 *  비용 = finance_expenses(수동, spent_at) + payslips(급여, paid=1, finalized_at, payment_krw)
 *  학생 = students_erp(status='정상', signup_date 'YYYY-MM-DD')
 *
 *  accounting-realtime.ts 와 독립적으로 동작(자체 try/catch · 자체 KST 헬퍼).
 */

interface Env { DB: D1Database; }

const KST = 9 * 3600 * 1000;
const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function kstDate(ms: number): string {
  return new Date(ms + KST).toISOString().slice(0, 10);
}
function todayKST(): string { return kstDate(Date.now()); }
function dayStartMs(d: string): number { return Date.parse(d + 'T00:00:00Z') - KST; }
function shift(d: string, days: number): string { return kstDate(dayStartMs(d) + days * 86400000); }
function monthStartMs(d: string): number {
  const [y, m] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, 1) - KST;
}
function weekStartMon(d: string): string {
  const day = new Date(dayStartMs(d) + KST).getUTCDay(); // 0=Sun
  return shift(d, -((day + 6) % 7));
}
function trend(cur: number, prev: number): number {
  if (!prev) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> {
  try { return await fn(); } catch { return fb; }
}

// ── 기간 매출 ───────────────────────────────────────────────
async function income(env: Env, a: number, b: number) {
  return safe(async () => {
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_krw),0) s, COUNT(*) c FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?`
    ).bind(a, b).first<{ s: number; c: number }>();
    return { sum: r?.s || 0, count: r?.c || 0 };
  }, { sum: 0, count: 0 });
}
// ── 기간 비용(수동 + 급여) ───────────────────────────────────
async function expense(env: Env, a: number, b: number) {
  const manual = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COALESCE(SUM(amount_krw),0) s FROM finance_expenses WHERE spent_at>=? AND spent_at<?`).bind(a, b).first<{ s: number }>();
    return r?.s || 0;
  }, 0);
  const payroll = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) s FROM payslips WHERE paid=1 AND finalized_at>=? AND finalized_at<?`).bind(a, b).first<{ s: number }>();
    return r?.s || 0;
  }, 0);
  return { manual, payroll, total: manual + payroll };
}
// ── 재원생 수 ────────────────────────────────────────────────
async function activeTotal(env: Env): Promise<number> {
  return safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE status='정상'`).first<{ c: number }>();
    return r?.c || 0;
  }, 0);
}
async function newStudents(env: Env, like: string): Promise<number> {
  return safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE status='정상' AND signup_date LIKE ?`).bind(like).first<{ c: number }>();
    return r?.c || 0;
  }, 0);
}

async function summary(env: Env): Promise<Response> {
  const today = todayKST();
  const tStart = dayStartMs(today), tEnd = tStart + 86400000;
  const yStart = tStart - 86400000;
  const wk = weekStartMon(today), wkStart = dayStartMs(wk), lastWkStart = wkStart - 7 * 86400000;
  const mo = today.slice(0, 7), monStart = monthStartMs(today);
  const [yy, mm] = mo.split('-').map(Number);
  const lastMonStart = Date.UTC(mm === 1 ? yy - 1 : yy, mm === 1 ? 11 : mm - 2, 1) - KST;
  const now = Date.now();

  const pack = async (a: number, b: number) => {
    const inc = await income(env, a, b), exp = await expense(env, a, b);
    return { income: inc.sum, pay_count: inc.count, expense: exp.total, expense_manual: exp.manual, expense_payroll: exp.payroll, net: inc.sum - exp.total };
  };
  const tdy = await pack(tStart, tEnd), yday = await pack(yStart, tStart);
  const week = await pack(wkStart, now), lastWeek = await pack(lastWkStart, wkStart);
  const month = await pack(monStart, now), lastMonth = await pack(lastMonStart, monStart);

  const active = await activeTotal(env);
  const newToday = await newStudents(env, today);
  const newMonth = await newStudents(env, mo + '%');

  return j({
    ok: true,
    as_of: new Date(now).toISOString(),
    students: { active, new_today: newToday, new_this_month: newMonth },
    today: { date: today, ...tdy, income_trend: trend(tdy.income, yday.income), net_trend: trend(tdy.net, yday.net) },
    this_week: { start: wk, ...week, income_trend: trend(week.income, lastWeek.income), net_trend: trend(week.net, lastWeek.net) },
    this_month: { period: mo, ...month, income_trend: trend(month.income, lastMonth.income), net_trend: trend(month.net, lastMonth.net) },
  });
}

async function series(env: Env, url: URL): Promise<Response> {
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 7), 180);
  const today = todayKST();
  const start = shift(today, -(days - 1));
  const startMs = dayStartMs(start);

  // 매출 일별
  const incRows = await safe(async () => (await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', datetime((paid_at/1000)+32400,'unixepoch')) d, COALESCE(SUM(amount_krw),0) s, COUNT(*) c
     FROM student_payments WHERE status='paid' AND paid_at>=? GROUP BY d`).bind(startMs).all()).results as any[], []);
  // 수동지출 일별
  const expRows = await safe(async () => (await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', datetime((spent_at/1000)+32400,'unixepoch')) d, COALESCE(SUM(amount_krw),0) s
     FROM finance_expenses WHERE spent_at>=? GROUP BY d`).bind(startMs).all()).results as any[], []);
  // 급여 일별
  const payRows = await safe(async () => (await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', datetime((finalized_at/1000)+32400,'unixepoch')) d, COALESCE(SUM(payment_krw),0) s
     FROM payslips WHERE paid=1 AND finalized_at>=? GROUP BY d`).bind(startMs).all()).results as any[], []);
  // 신규학생 일별
  const stuRows = await safe(async () => (await env.DB.prepare(
    `SELECT signup_date d, COUNT(*) c FROM students_erp WHERE status='정상' AND signup_date>=? GROUP BY d`).bind(start).all()).results as any[], []);
  // 창 시작 이전 누적 재원
  const baseBefore = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE status='정상' AND signup_date<?`).bind(start).first<{ c: number }>();
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
  return j({ ok: true, days, from: start, to: today, series: out });
}

async function detail(env: Env, url: URL): Promise<Response> {
  const date = url.searchParams.get('date') || todayKST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return j({ ok: false, error: 'bad date' }, 400);
  const a = dayStartMs(date), b = a + 86400000;

  const payments = await safe(async () => (await env.DB.prepare(
    `SELECT sp.id, sp.amount_krw, sp.paid_at, sp.method, COALESCE(se.korean_name, sp.user_id) AS student_name
     FROM student_payments sp LEFT JOIN students_erp se ON se.user_id = sp.user_id
     WHERE sp.status='paid' AND sp.paid_at>=? AND sp.paid_at<? ORDER BY sp.paid_at DESC LIMIT 200`).bind(a, b).all()).results as any[], []);
  const expenses = await safe(async () => (await env.DB.prepare(
    `SELECT id, category, amount_krw, spent_at, memo FROM finance_expenses WHERE spent_at>=? AND spent_at<? ORDER BY amount_krw DESC LIMIT 200`).bind(a, b).all()).results as any[], []);
  const payroll = await safe(async () => (await env.DB.prepare(
    `SELECT COALESCE(SUM(payment_krw),0) s, COUNT(*) c FROM payslips WHERE paid=1 AND finalized_at>=? AND finalized_at<?`).bind(a, b).first<{ s: number; c: number }>()), { s: 0, c: 0 });
  const newStu = await safe(async () => (await env.DB.prepare(
    `SELECT korean_name, english_name, signup_date FROM students_erp WHERE status='정상' AND signup_date=? LIMIT 200`).bind(date).all()).results as any[], []);

  const incomeTotal = payments.reduce((s, r) => s + (r.amount_krw || 0), 0);
  const manualTotal = expenses.reduce((s, r) => s + (r.amount_krw || 0), 0);
  return j({
    ok: true, date,
    income_total: incomeTotal, expense_total: manualTotal + (payroll?.s || 0),
    payroll_total: payroll?.s || 0, payroll_count: payroll?.c || 0,
    payments, expenses, new_students: newStu,
  });
}

export async function execRouter(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const p = url.pathname.replace(/^\/api\/admin\/exec\/?/, '').replace(/\/$/, '');
    if (p === 'summary') return await summary(env);
    if (p === 'series') return await series(env, url);
    if (p === 'detail') return await detail(env, url);
    return j({ ok: false, error: 'not found' }, 404);
  } catch (e: any) {
    return j({ ok: false, error: String(e?.message || e) }, 500);
  }
}
