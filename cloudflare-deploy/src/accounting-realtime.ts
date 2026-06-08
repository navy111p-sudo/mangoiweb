/**
 * accounting-realtime.ts — 실시간 수입·지출 분석 & 재무 스냅샷 (2026-06-03 추가)
 *
 * 기존 accounting-reports.ts(월/분기/연 12종 보고서) 및 KPI 대시보드와 **중복되지 않는**
 * "일·주 단위 실시간 현금흐름" 영역만 담당한다. 라우트 prefix 가 /api/admin/realtime/ 로
 * 분리되어 기존 /api/admin/reports/* 와 충돌하지 않으며, 모든 핸들러가 자체 try/catch +
 * graceful degradation 으로 동작해 기존 기능에 영향을 주지 않는다(독립 오류 처리).
 *
 *   GET  /api/admin/realtime/summary                오늘·이번주·이번달 수입/지출/순이익 + 전기대비
 *   GET  /api/admin/realtime/daily?days=30          일별 수입/지출/순현금 시계열
 *   GET  /api/admin/realtime/weekly?weeks=12        주별 수입/지출/순현금 집계
 *   GET  /api/admin/realtime/expenses?from=&to=     지출 내역 목록
 *   POST /api/admin/realtime/expenses               지출 1건 등록 {category, amount_krw, spent_at?, memo?}
 *   DELETE /api/admin/realtime/expenses/:id         지출 1건 삭제
 *   GET  /api/admin/realtime/snapshots?limit=60     저장된 일일 재무 스냅샷 목록
 *   POST /api/admin/realtime/snapshot               오늘(또는 ?date=YYYY-MM-DD) 스냅샷 생성/갱신
 *
 *   format=json (기본) | csv  (daily·weekly·expenses 지원)
 *
 * 수입 = student_payments(status='paid') · 지출 = finance_expenses(수동) + payslips(급여, 자동)
 * 신규 테이블 finance_expenses / finance_snapshots 는 IF NOT EXISTS 로 안전 생성한다.
 */

import { getScope, paymentScopeSql, expenseVisible, type Scope } from './scope';

interface Env {
  DB: D1Database;
}

// ── 응답 헬퍼 (모듈 독립; accounting-reports.ts 와 분리) ──────────────────
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const csv = (filename: string, rows: (string | number)[][]): Response => {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = '﻿' + rows.map(r => r.map(esc).join(',')).join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch { return fallback; }
};

// ── KST(UTC+9) 날짜 유틸 ────────────────────────────────────────────────
const KST_OFFSET_MS = 9 * 3600 * 1000;
const SEC_OFFSET = 32400; // 9h in seconds (SQLite unixepoch 보정용)

/** ms(Date.now 기반) → KST 기준 'YYYY-MM-DD' */
function kstDateStr(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}
/** 'YYYY-MM-DD'(KST 자정) → ms */
function kstDayStartMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - KST_OFFSET_MS;
}
/** 오늘(KST) 'YYYY-MM-DD' */
function todayKST(): string {
  return kstDateStr(Date.now());
}
/** 정확한 날짜 가감 (UTC 기반) */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
/** dateStr 이 속한 KST 주의 월요일 'YYYY-MM-DD' */
function weekStartMonday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일..6=토
  const back = (dow + 6) % 7; // 월요일까지 거슬러
  return shiftDate(dateStr, -back);
}

// ── 스키마 보장 (안전, 실패해도 throw 하지 않음) ─────────────────────────
async function ensureTables(env: Env): Promise<void> {
  await safe(async () => {
    await env.DB.exec(
      `CREATE TABLE IF NOT EXISTS finance_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL DEFAULT '기타', amount_krw INTEGER NOT NULL, spent_at INTEGER NOT NULL, memo TEXT, source TEXT DEFAULT 'manual', created_at INTEGER NOT NULL);`
    );
    return true;
  }, false);
  await safe(async () => { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_fexp_spent ON finance_expenses(spent_at);`); return true; }, false);
  await safe(async () => {
    await env.DB.exec(
      `CREATE TABLE IF NOT EXISTS finance_snapshots (snap_date TEXT PRIMARY KEY, income_krw INTEGER NOT NULL DEFAULT 0, expense_krw INTEGER NOT NULL DEFAULT 0, net_krw INTEGER NOT NULL DEFAULT 0, pay_count INTEGER NOT NULL DEFAULT 0, generated_at INTEGER NOT NULL);`
    );
    return true;
  }, false);
}

// ── 핵심 집계: 기간 내 수입 합계 ────────────────────────────────────────
async function incomeBetween(env: Env, startMs: number, endMs: number, scope?: Scope): Promise<{ sum: number; count: number }> {
  return safe(async () => {
    const ps = paymentScopeSql(scope);
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_krw),0) AS sum, COUNT(*) AS count
       FROM student_payments
       WHERE status='paid' AND paid_at >= ? AND paid_at < ?` + ps.sql
    ).bind(startMs, endMs, ...ps.binds).first<{ sum: number; count: number }>();
    return { sum: r?.sum || 0, count: r?.count || 0 };
  }, { sum: 0, count: 0 });
}

// ── 핵심 집계: 기간 내 지출 합계 (수동 + 급여) ──────────────────────────
async function expenseBetween(env: Env, startMs: number, endMs: number, scope?: Scope): Promise<{ manual: number; payroll: number; total: number }> {
  if (!expenseVisible(scope)) return { manual: 0, payroll: 0, total: 0 };
  const manual = await safe(async () => {
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_krw),0) AS s FROM finance_expenses WHERE spent_at >= ? AND spent_at < ?`
    ).bind(startMs, endMs).first<{ s: number }>();
    return r?.s || 0;
  }, 0);
  // payslips: payment_krw 가 ALTER 로 추가됨 / finalized_at(ms) 기준 귀속. 없으면 0.
  const payroll = await safe(async () => {
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(payment_krw),0) AS s FROM payslips WHERE paid=1 AND finalized_at >= ? AND finalized_at < ?`
    ).bind(startMs, endMs).first<{ s: number }>();
    return r?.s || 0;
  }, 0);
  return { manual, payroll, total: manual + payroll };
}

// ── 일별 그룹 집계 맵 (KST 날짜 → 합계) ────────────────────────────────
async function dailyIncomeMap(env: Env, startMs: number, endMs: number, scope?: Scope): Promise<Record<string, { sum: number; count: number }>> {
  return safe(async () => {
    const ps = paymentScopeSql(scope);
    const rs = await env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', (paid_at/1000 + ${SEC_OFFSET}), 'unixepoch') AS d,
              COALESCE(SUM(amount_krw),0) AS sum, COUNT(*) AS count
       FROM student_payments
       WHERE status='paid' AND paid_at >= ? AND paid_at < ?` + ps.sql + `
       GROUP BY d`
    ).bind(startMs, endMs, ...ps.binds).all<{ d: string; sum: number; count: number }>();
    const map: Record<string, { sum: number; count: number }> = {};
    for (const row of (rs.results || [])) map[row.d] = { sum: row.sum || 0, count: row.count || 0 };
    return map;
  }, {} as Record<string, { sum: number; count: number }>);
}

async function dailyExpenseMap(env: Env, startMs: number, endMs: number, scope?: Scope): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  if (!expenseVisible(scope)) return map;
  await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', (spent_at/1000 + ${SEC_OFFSET}), 'unixepoch') AS d, COALESCE(SUM(amount_krw),0) AS sum
       FROM finance_expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY d`
    ).bind(startMs, endMs).all<{ d: string; sum: number }>();
    for (const row of (rs.results || [])) map[row.d] = (map[row.d] || 0) + (row.sum || 0);
    return true;
  }, false);
  await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', (finalized_at/1000 + ${SEC_OFFSET}), 'unixepoch') AS d, COALESCE(SUM(payment_krw),0) AS sum
       FROM payslips WHERE paid=1 AND finalized_at >= ? AND finalized_at < ? GROUP BY d`
    ).bind(startMs, endMs).all<{ d: string; sum: number }>();
    for (const row of (rs.results || [])) map[row.d] = (map[row.d] || 0) + (row.sum || 0);
    return true;
  }, false);
  return map;
}

// ── 증감률 계산 ──────────────────────────────────────────────────────────
function trend(cur: number, prev: number): { diff: number; pct: number | null } {
  const diff = cur - prev;
  const pct = prev === 0 ? (cur === 0 ? 0 : null) : Math.round((diff / prev) * 1000) / 10;
  return { diff, pct };
}

// ════════════════════════════════════════════════════════════════════════
// 라우터
// ════════════════════════════════════════════════════════════════════════
export async function realtimeRouter(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/realtime\/?/, '');
  const fmt = url.searchParams.get('format') || 'json';
  const method = request.method.toUpperCase();

  try {
    await ensureTables(env);
    const scope = await getScope(env, request);

    if (p === 'summary' && method === 'GET') return await summary(env, scope);
    if (p === 'daily' && method === 'GET') return await daily(env, url, fmt, scope);
    if (p === 'weekly' && method === 'GET') return await weekly(env, url, fmt, scope);

    if (p === 'expenses' && method === 'GET') return await listExpenses(env, url, fmt, scope);
    if (p === 'expenses' && method === 'POST') return await addExpense(env, request);
    const expDel = p.match(/^expenses\/(\d+)$/);
    if (expDel && method === 'DELETE') return await deleteExpense(env, Number(expDel[1]));

    if (p === 'snapshots' && method === 'GET') return await listSnapshots(env, url, scope);
    if (p === 'expense-breakdown' && method === 'GET') return await expenseBreakdown(env, url, scope);
    if (p === 'snapshot' && method === 'POST') {
      const date = url.searchParams.get('date') || todayKST();
      const r = await runFinanceSnapshot(env, date);
      return json({ ok: true, snapshot: r });
    }

    return err('not found: ' + p, 404);
  } catch (e: any) {
    // 독립 오류 처리: 어떤 예외도 500 JSON 으로 격리, 기존 라우트엔 영향 없음
    return err(e?.message || 'realtime internal error', 500);
  }
}

// ── 1) 실시간 요약 ────────────────────────────────────────────────────────
async function summary(env: Env, scope?: Scope): Promise<Response> {
  const today = todayKST();
  const todayStart = kstDayStartMs(today);
  const tomorrowStart = kstDayStartMs(shiftDate(today, 1));
  const ydayStart = kstDayStartMs(shiftDate(today, -1));

  const wkStart = weekStartMonday(today);
  const wkStartMs = kstDayStartMs(wkStart);
  const lastWkStartMs = kstDayStartMs(shiftDate(wkStart, -7));

  const mo = today.slice(0, 7);
  const [yy, mm] = mo.split('-').map(Number);
  const monStartMs = Date.UTC(yy, mm - 1, 1) - KST_OFFSET_MS;
  const lastMonStartMs = Date.UTC(yy, mm - 2, 1) - KST_OFFSET_MS;

  const now = Date.now();

  const pack = async (startMs: number, endMs: number) => {
    const inc = await incomeBetween(env, startMs, endMs, scope);
    const exp = await expenseBetween(env, startMs, endMs, scope);
    return { income: inc.sum, pay_count: inc.count, expense: exp.total, expense_manual: exp.manual, expense_payroll: exp.payroll, net: inc.sum - exp.total };
  };

  const tdy = await pack(todayStart, tomorrowStart);
  const yday = await pack(ydayStart, todayStart);
  const wk = await pack(wkStartMs, now);
  const lastWk = await pack(lastWkStartMs, wkStartMs);
  const month = await pack(monStartMs, now);
  const lastMonth = await pack(lastMonStartMs, monStartMs);

  return json({
    ok: true,
    scope: scope ? { type: scope.type, value: scope.value, label: scope.label } : null,
    cost_hq_only: !!(scope && scope.type !== 'hq'),
    as_of: new Date(now).toISOString(),
    today: { date: today, ...tdy, income_trend: trend(tdy.income, yday.income), net_trend: trend(tdy.net, yday.net) },
    this_week: { start: wkStart, ...wk, income_trend: trend(wk.income, lastWk.income), net_trend: trend(wk.net, lastWk.net) },
    this_month: { period: mo, ...month, income_trend: trend(month.income, lastMonth.income), net_trend: trend(month.net, lastMonth.net) },
  });
}

// ── 2) 일별 시계열 ────────────────────────────────────────────────────────
async function daily(env: Env, url: URL, fmt: string, scope?: Scope): Promise<Response> {
  const days = Math.min(180, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
  const today = todayKST();
  const startDate = shiftDate(today, -(days - 1));
  const startMs = kstDayStartMs(startDate);
  const endMs = kstDayStartMs(shiftDate(today, 1));

  const incMap = await dailyIncomeMap(env, startMs, endMs, scope);
  const expMap = await dailyExpenseMap(env, startMs, endMs, scope);

  const series: { date: string; income: number; expense: number; net: number; pay_count: number }[] = [];
  let cumNet = 0;
  for (let i = 0; i < days; i++) {
    const d = shiftDate(startDate, i);
    const income = incMap[d]?.sum || 0;
    const expense = expMap[d] || 0;
    const net = income - expense;
    cumNet += net;
    series.push({ date: d, income, expense, net, pay_count: incMap[d]?.count || 0 });
  }
  const totIncome = series.reduce((a, b) => a + b.income, 0);
  const totExpense = series.reduce((a, b) => a + b.expense, 0);

  if (fmt === 'csv') {
    const rows: (string | number)[][] = [['날짜', '수입(원)', '지출(원)', '순이익(원)', '결제건수']];
    for (const s of series) rows.push([s.date, s.income, s.expense, s.net, s.pay_count]);
    rows.push(['합계', totIncome, totExpense, totIncome - totExpense, '']);
    return csv(`finance-daily-${startDate}_${today}.csv`, rows);
  }
  return json({
    ok: true, range: { from: startDate, to: today, days },
    totals: { income: totIncome, expense: totExpense, net: totIncome - totExpense, cumulative_net: cumNet },
    series,
  });
}

// ── 3) 주별 집계 ──────────────────────────────────────────────────────────
async function weekly(env: Env, url: URL, fmt: string, scope?: Scope): Promise<Response> {
  const weeks = Math.min(52, Math.max(1, parseInt(url.searchParams.get('weeks') || '12', 10)));
  const today = todayKST();
  const curWkStart = weekStartMonday(today);
  const firstWkStart = shiftDate(curWkStart, -(weeks - 1) * 7);
  const startMs = kstDayStartMs(firstWkStart);
  const endMs = kstDayStartMs(shiftDate(today, 1));

  // 일별 맵을 받아 주 단위로 합산 (쿼리 1~2회로 처리)
  const incMap = await dailyIncomeMap(env, startMs, endMs, scope);
  const expMap = await dailyExpenseMap(env, startMs, endMs, scope);

  const series: { week_start: string; label: string; income: number; expense: number; net: number }[] = [];
  for (let w = 0; w < weeks; w++) {
    const ws = shiftDate(firstWkStart, w * 7);
    let income = 0, expense = 0;
    for (let dd = 0; dd < 7; dd++) {
      const d = shiftDate(ws, dd);
      if (d > today) break;
      income += incMap[d]?.sum || 0;
      expense += expMap[d] || 0;
    }
    const we = shiftDate(ws, 6);
    series.push({ week_start: ws, label: `${ws.slice(5)} ~ ${we.slice(5)}`, income, expense, net: income - expense });
  }
  const totIncome = series.reduce((a, b) => a + b.income, 0);
  const totExpense = series.reduce((a, b) => a + b.expense, 0);

  if (fmt === 'csv') {
    const rows: (string | number)[][] = [['주 시작', '구간', '수입(원)', '지출(원)', '순이익(원)']];
    for (const s of series) rows.push([s.week_start, s.label, s.income, s.expense, s.net]);
    rows.push(['합계', '', totIncome, totExpense, totIncome - totExpense]);
    return csv(`finance-weekly-${firstWkStart}_${today}.csv`, rows);
  }
  return json({ ok: true, weeks, totals: { income: totIncome, expense: totExpense, net: totIncome - totExpense }, series });
}

// ── 4) 지출 목록 ──────────────────────────────────────────────────────────
async function listExpenses(env: Env, url: URL, fmt: string, scope?: Scope): Promise<Response> {
  if (!expenseVisible(scope)) return json({ ok: true, count: 0, total_krw: 0, expenses: [], hq_only: true });
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));
  const fromStr = url.searchParams.get('from'); // YYYY-MM-DD
  const toStr = url.searchParams.get('to');
  let where = '1=1';
  const binds: number[] = [];
  if (fromStr) { where += ' AND spent_at >= ?'; binds.push(kstDayStartMs(fromStr)); }
  if (toStr) { where += ' AND spent_at < ?'; binds.push(kstDayStartMs(shiftDate(toStr, 1))); }

  const rows = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT id, category, amount_krw, spent_at, memo, source FROM finance_expenses WHERE ${where} ORDER BY spent_at DESC LIMIT ?`
    ).bind(...binds, limit).all<{ id: number; category: string; amount_krw: number; spent_at: number; memo: string; source: string }>();
    return rs.results || [];
  }, [] as any[]);

  if (fmt === 'csv') {
    const out: (string | number)[][] = [['ID', '날짜', '분류', '금액(원)', '메모', '출처']];
    for (const r of rows) out.push([r.id, kstDateStr(r.spent_at), r.category, r.amount_krw, r.memo || '', r.source || '']);
    return csv('finance-expenses.csv', out);
  }
  const total = rows.reduce((a, b) => a + (b.amount_krw || 0), 0);
  return json({ ok: true, count: rows.length, total_krw: total, expenses: rows.map(r => ({ ...r, date: kstDateStr(r.spent_at) })) });
}

// ── 5) 지출 등록 ──────────────────────────────────────────────────────────
async function addExpense(env: Env, request: Request): Promise<Response> {
  let body: any = {};
  try { body = await request.json(); } catch { return err('invalid json body'); }
  const amount = Math.round(Number(body.amount_krw));
  if (!Number.isFinite(amount) || amount <= 0) return err('amount_krw must be a positive number');
  const category = String(body.category || '기타').slice(0, 40);
  const memo = body.memo ? String(body.memo).slice(0, 300) : null;
  // spent_at: ms | 'YYYY-MM-DD' | 미지정(now)
  let spentAt = Date.now();
  if (typeof body.spent_at === 'number' && Number.isFinite(body.spent_at)) spentAt = body.spent_at;
  else if (typeof body.spent_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.spent_at)) spentAt = kstDayStartMs(body.spent_at) + 12 * 3600 * 1000; // 정오로 귀속

  const now = Date.now();
  const res = await safe(async () => {
    const r = await env.DB.prepare(
      `INSERT INTO finance_expenses (category, amount_krw, spent_at, memo, source, created_at) VALUES (?,?,?,?, 'manual', ?)`
    ).bind(category, amount, spentAt, memo, now).run();
    return r;
  }, null);
  if (!res) return err('insert failed (DB)', 500);
  return json({ ok: true, id: (res as any)?.meta?.last_row_id ?? null, category, amount_krw: amount, date: kstDateStr(spentAt) });
}

// ── 6) 지출 삭제 ──────────────────────────────────────────────────────────
async function deleteExpense(env: Env, id: number): Promise<Response> {
  const ok = await safe(async () => {
    await env.DB.prepare(`DELETE FROM finance_expenses WHERE id=?`).bind(id).run();
    return true;
  }, false);
  return ok ? json({ ok: true, id }) : err('delete failed', 500);
}

// ── 7) 스냅샷 목록 ────────────────────────────────────────────────────────
async function listSnapshots(env: Env, url: URL, scope?: Scope): Promise<Response> {
  const limit = Math.min(366, Math.max(1, parseInt(url.searchParams.get('limit') || '60', 10)));
  if (scope && scope.type !== 'hq') {
    const today = todayKST();
    const startMs = kstDayStartMs(shiftDate(today, -(limit - 1)));
    const endMs = kstDayStartMs(shiftDate(today, 1));
    const incMap = await dailyIncomeMap(env, startMs, endMs, scope);
    const out: any[] = [];
    for (let i = 0; i < limit; i++) {
      const d = shiftDate(today, -i);
      const inc = incMap[d] || { sum: 0, count: 0 };
      out.push({ snap_date: d, income_krw: inc.sum, expense_krw: 0, net_krw: inc.sum, pay_count: inc.count, generated_at: null });
    }
    return json({ ok: true, count: out.length, cost_hq_only: true, snapshots: out });
  }
  const rows = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT snap_date, income_krw, expense_krw, net_krw, pay_count, generated_at FROM finance_snapshots ORDER BY snap_date DESC LIMIT ?`
    ).bind(limit).all();
    return rs.results || [];
  }, [] as any[]);
  return json({ ok: true, count: rows.length, snapshots: rows });
}

// ── 8) 스냅샷 생성/갱신 (라우터 + cron 공용) ───────────────────────────────
// ── 지출 카테고리별 분석 (도넛/구성비) ─────────────────────────────────────
async function expenseBreakdown(env: Env, url: URL, scope?: Scope): Promise<Response> {
  if (!expenseVisible(scope)) return json({ ok: true, range_days: 0, total: 0, breakdown: [], hq_only: true });
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
  const sinceMs = Date.now() - days * 86400000;
  const cats = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT COALESCE(category,'기타') AS category, COALESCE(SUM(amount_krw),0) AS amount
       FROM finance_expenses WHERE spent_at >= ? GROUP BY category ORDER BY amount DESC`
    ).bind(sinceMs).all<{ category: string; amount: number }>();
    return rs.results || [];
  }, [] as { category: string; amount: number }[]);
  const payroll = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS s FROM payslips WHERE paid=1 AND finalized_at >= ?`).bind(sinceMs).first<{ s: number }>();
    return r?.s || 0;
  }, 0);
  const list = cats.map(c => ({ category: c.category, amount: c.amount }));
  if (payroll > 0) list.push({ category: '급여', amount: payroll });
  list.sort((a, b) => b.amount - a.amount);
  const total = list.reduce((s, x) => s + x.amount, 0);
  const breakdown = list.map(x => ({ ...x, pct: total ? Math.round((x.amount / total) * 1000) / 10 : 0 }));
  return json({ ok: true, range_days: days, total, breakdown });
}

export async function runFinanceSnapshot(env: Env, date?: string): Promise<{ snap_date: string; income_krw: number; expense_krw: number; net_krw: number; pay_count: number }> {
  await ensureTables(env);
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKST();
  const startMs = kstDayStartMs(d);
  const endMs = kstDayStartMs(shiftDate(d, 1));
  const inc = await incomeBetween(env, startMs, endMs);
  const exp = await expenseBetween(env, startMs, endMs);
  const income = inc.sum, expense = exp.total, net = income - expense;
  const now = Date.now();
  await safe(async () => {
    await env.DB.prepare(
      `INSERT INTO finance_snapshots (snap_date, income_krw, expense_krw, net_krw, pay_count, generated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(snap_date) DO UPDATE SET income_krw=excluded.income_krw, expense_krw=excluded.expense_krw, net_krw=excluded.net_krw, pay_count=excluded.pay_count, generated_at=excluded.generated_at`
    ).bind(d, income, expense, net, inc.count, now).run();
    return true;
  }, false);
  return { snap_date: d, income_krw: income, expense_krw: expense, net_krw: net, pay_count: inc.count };
}
