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
import { checkAdminSession } from './auth-admin';

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

// ════════ 대리점 스코프 ════════
type Scope = { type: 'hq' | 'branch' | 'agency' | 'none' | 'franchise'; value: string | null; label: string };

// 지사본사 소유 지사 목록 + 비용(재무) 노출 여부(본사·지사본사만)
function franchiseList(value: string | null): string[] {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}
function costVisible(scope: Scope): boolean {
  return scope.type === 'hq' || scope.type === 'franchise';
}

// 학생 필터 조건(students_erp 기준). hq → 조건 없음.
function stuCond(scope: Scope): { clause: string; binds: any[] } {
  if (scope.type === 'agency') return { clause: `shop_name = ?`, binds: [scope.value] };
  if (scope.type === 'branch') return { clause: `franchise LIKE ?`, binds: [scope.value + '%'] };
  if (scope.type === 'franchise') {
    const list = franchiseList(scope.value);
    if (!list.length) return { clause: `1=0`, binds: [] };
    return { clause: `franchise IN (${list.map(() => '?').join(',')})`, binds: list };
  }
  if (scope.type === 'none') return { clause: `1=0`, binds: [] }; // 권한 없음 → 빈 결과
  return { clause: '', binds: [] }; // hq
}
function scopeLabel(type: string, value: string | null): string {
  if (type === 'hq') return '본사 (전체)';
  if (type === 'franchise') { const n = franchiseList(value).length; return n ? `지사본사 (${n}개 지사)` : '지사본사'; }
  if (type === 'branch') return `${value} 지사`;
  if (type === 'agency') return String(value || '대리점');
  return '권한 없음';
}

async function ensureScope(env: Env): Promise<void> {
  await safe(async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_scope (username TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_value TEXT, updated_at INTEGER);`);
    return true;
  }, false);
}

// 미등록 계정을 이름 규칙으로 자동 매핑
async function autoSeedOne(env: Env, username: string): Promise<Scope> {
  const acc = await safe(async () => await env.DB.prepare(`SELECT name FROM admin_account WHERE username=? LIMIT 1`).bind(username).first<{ name: string }>(), null as any);
  const name = acc?.name || '';
  let type = 'none', value: string | null = null;
  if (username === 'admin' || /본사/.test(name)) { type = 'hq'; }
  else if (/지사/.test(name)) { type = 'branch'; value = name.replace('지사', '').trim().split(/\s+/)[0] || null; }
  else if (/대리점/.test(name)) {
    type = 'agency';
    const core = name.replace('대리점', '').trim();
    const shop = await safe(async () => await env.DB.prepare(`SELECT shop_name FROM students_erp WHERE shop_name LIKE ? LIMIT 1`).bind('%' + core + '%').first<{ shop_name: string }>(), null as any);
    value = shop?.shop_name || ('망고아이 ' + core + ' 대리점');
  }
  await safe(async () => { await env.DB.prepare(`INSERT OR IGNORE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?,?,?,?)`).bind(username, type, value, Date.now()).run(); return true; }, false);
  return { type: type as any, value, label: scopeLabel(type, value) };
}

// 현재 요청의 스코프 결정(세션 + ?as 오버라이드[본사만])
async function getScope(env: Env, request: Request): Promise<Scope> {
  await ensureScope(env);
  const sess = await safe(async () => await checkAdminSession(request, env as any), { ok: false } as any);
  // 세션 없음(내부 cron 호출 등) → 본사 전체
  if (!sess?.ok || !sess.username) return { type: 'hq', value: null, label: scopeLabel('hq', null) };

  let row = await safe(async () => await env.DB.prepare(`SELECT scope_type, scope_value FROM admin_scope WHERE username=? LIMIT 1`).bind(sess.username).first<{ scope_type: string; scope_value: string | null }>(), null as any);
  let base: Scope = row ? { type: row.scope_type as any, value: row.scope_value, label: scopeLabel(row.scope_type, row.scope_value) }
                        : await autoSeedOne(env, sess.username);

  // 본사만 ?as= 로 특정 대리점/지사 드릴다운 허용
  if (base.type === 'hq') {
    const as = new URL(request.url).searchParams.get('as');
    if (as) {
      const [t, ...rest] = as.split(':');
      const v = rest.join(':') || null;
      if (t === 'hq') return { type: 'hq', value: null, label: scopeLabel('hq', null) };
      if (t === 'agency' && v) return { type: 'agency', value: v, label: scopeLabel('agency', v) };
      if (t === 'branch' && v) return { type: 'branch', value: v, label: scopeLabel('branch', v) };
    }
  }
  return base;
}

// ════════ 집계(스코프 반영) ════════
async function income(env: Env, a: number, b: number, scope: Scope) {
  return safe(async () => {
    const c = stuCond(scope);
    let sql = `SELECT COALESCE(SUM(amount_krw),0) s, COUNT(*) c FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?`;
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
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE status='정상'` + (c.clause ? ` AND ${c.clause}` : '')).bind(...c.binds).first<{ c: number }>();
    return r?.c || 0;
  }, 0);
}
async function newStudents(env: Env, like: string, scope: Scope): Promise<number> {
  return safe(async () => {
    const c = stuCond(scope);
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE status='정상' AND signup_date LIKE ?` + (c.clause ? ` AND ${c.clause}` : '')).bind(like, ...c.binds).first<{ c: number }>();
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
     FROM student_payments WHERE status='paid' AND paid_at>=?` + inWhere + ` GROUP BY d`).bind(startMs, ...c.binds).all()).results as any[], []);
  // 비용: 본사만
  let expRows: any[] = [], payRows: any[] = [];
  if (costVisible(scope)) {
    expRows = await safe(async () => (await env.DB.prepare(`SELECT strftime('%Y-%m-%d', datetime((spent_at/1000)+32400,'unixepoch')) d, COALESCE(SUM(amount_krw),0) s FROM finance_expenses WHERE spent_at>=? GROUP BY d`).bind(startMs).all()).results as any[], []);
    payRows = await safe(async () => (await env.DB.prepare(`SELECT strftime('%Y-%m-%d', datetime((finalized_at/1000)+32400,'unixepoch')) d, COALESCE(SUM(payment_krw),0) s FROM payslips WHERE paid=1 AND finalized_at>=? GROUP BY d`).bind(startMs).all()).results as any[], []);
  }
  const stuRows = await safe(async () => (await env.DB.prepare(
    `SELECT signup_date d, COUNT(*) c FROM students_erp WHERE status='정상' AND signup_date>=?` + (c.clause ? ` AND ${c.clause}` : '') + ` GROUP BY d`).bind(start, ...c.binds).all()).results as any[], []);
  const baseBefore = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) c FROM students_erp WHERE status='정상' AND signup_date<?` + (c.clause ? ` AND ${c.clause}` : '')).bind(start, ...c.binds).first<{ c: number }>();
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
  return j({ ok: true, days, from: start, to: today, cost_hq_only: !costVisible(scope), series: out });
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
     WHERE sp.status='paid' AND sp.paid_at>=? AND sp.paid_at<?` + inWhere + ` ORDER BY sp.paid_at DESC LIMIT 200`).bind(a, b, ...c.binds).all()).results as any[], []);

  let expenses: any[] = [], payroll: any = { s: 0, c: 0 };
  if (costVisible(scope)) {
    expenses = await safe(async () => (await env.DB.prepare(`SELECT id, category, amount_krw, spent_at, memo FROM finance_expenses WHERE spent_at>=? AND spent_at<? ORDER BY amount_krw DESC LIMIT 200`).bind(a, b).all()).results as any[], []);
    payroll = await safe(async () => await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) s, COUNT(*) c FROM payslips WHERE paid=1 AND finalized_at>=? AND finalized_at<?`).bind(a, b).first<{ s: number; c: number }>(), { s: 0, c: 0 });
  }
  const newStu = await safe(async () => (await env.DB.prepare(
    `SELECT korean_name, english_name, signup_date FROM students_erp WHERE status='정상' AND signup_date=?` + (c.clause ? ` AND ${c.clause}` : '') + ` LIMIT 200`).bind(date, ...c.binds).all()).results as any[], []);

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
  const shops = await safe(async () => (await env.DB.prepare(`SELECT shop_name, franchise, COUNT(*) c FROM students_erp WHERE status='정상' AND shop_name IS NOT NULL GROUP BY shop_name ORDER BY shop_name`).all()).results as any[], []);
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
     FROM student_payments WHERE status='paid' AND paid_at>=?` + inPay + ` GROUP BY method ORDER BY s DESC`
  ).bind(monStart, ...c.binds).all()).results as any[], []);

  // 재원 상태 분포 (정상/휴원/퇴원 등)
  const statusRows = await safe(async () => (await env.DB.prepare(
    `SELECT COALESCE(NULLIF(status,''),'미상') status, COUNT(*) c FROM students_erp WHERE 1=1` + stuClause + ` GROUP BY status ORDER BY c DESC`
  ).bind(...c.binds).all()).results as any[], []);

  // 이번달 탈락(퇴원/휴원) — status<>'정상' AND end_date 이번달
  const dropMonth = await safe(async () => {
    const r = await env.DB.prepare(
      `SELECT COUNT(*) c FROM students_erp WHERE status<>'정상' AND end_date LIKE ?` + stuClause
    ).bind(mo + '%', ...c.binds).first<{ c: number }>();
    return r?.c || 0;
  }, 0);

  // 수납 현황: 재원생 중 이번달 결제 학생 수
  const active = await activeTotal(env, scope);
  const paidStudents = await safe(async () => {
    const r = await env.DB.prepare(
      `SELECT COUNT(DISTINCT user_id) c FROM student_payments WHERE status='paid' AND paid_at>=?` + inPay
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
       WHERE se.status IN ('정상','active') AND se.shop_name IS NOT NULL AND se.shop_name<>''` + bWhere + `
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
    const scope = await getScope(env, request);
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
