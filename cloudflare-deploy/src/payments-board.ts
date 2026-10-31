// ═══════════════════════════════════════════════════════════════════════
// 💳 payments-board.ts — 관리자 «결제관리» 화면(ph106)의 실데이터 API
//   GET /api/admin/payments/b2b   학원 → 본사/대리점  (통장 직접입금)
//   GET /api/admin/payments/b2c   학부모 → 학원       (카드/PG 결제)
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ 왜 두 API 가 «서로 다른 표» 를 보는가 (2026-08-17)
//
//   이 화면은 원래 adm-q7.js 가 고정 숫자를 찍는 데모였다. 실데이터를 붙이려고
//   파 보니 화면의 전제가 틀려 있었다 — **B2B 돈은 student_payments 에 없다.**
//
//   accounting-reports.ts 의 주석이 이미 그렇게 적고 있었고(«학원이 통장으로 바로
//   보내는 수업료는 카페24를 안 거쳐 student_payments 에 없다»), D1 실측도 같았다:
//   전체 기간 결제 11,525건을 학당 → centers 로 매핑했을 때
//     · 원부에 없는 결제자  9,006건  ₩1,123,012,131
//     · B2C                2,514건  ₩113,853,200
//     · payment_type 미지정     5건  ₩300,000
//     · **B2B                  0건  ₩0**        ← B2B 센터가 446곳인데도 0건
//
//   그래서 B2B 는 bankacct_transactions(신한 계좌 입금) 에서 classifyDeposit() 이
//   'b2b' 로 판정한 것만 본다. 회계 리포트의 «매출» 정본(monthRevenue)이 쓰는 것과
//   같은 함수라 두 화면의 숫자가 어긋나지 않는다.
//
//   ⛔ B2B 에 PG 수수료를 붙이지 말 것 — 통장 이체는 PG 를 안 거친다. 데모 화면에는
//      「💸 수수료 합계 · 평균율 2.86%」 칸이 있었지만 실제로는 항상 0원이 맞다.
//      그래서 그 칸은 「입금처 수」로 바꿨다(admin.html ph106).
//
// 💰 PG 수수료율 — 2.86% (2026-08-17 사장님 확인: «2.86% 는 PG 수수료율이야»)
//   modules-ext.ts 의 PG_RATE 와 같은 값을 쓴다. 그쪽을 정본으로 삼아 들여온다.
//   ✅ (2026-08-18) accounting-reports.ts 의 PG_FEE_RATE 도 3.3% → 2.86% 로 맞췄다.
//      이제 이 파일·modules-ext.ts·accounting-reports.ts 세 곳이 같은 값을 쓴다.
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { classifyDeposit, notSeedSql } from './accounting-reports';

type Env = { DB: D1Database };

/** PG 수수료율 2.86% — modules-ext.ts 의 PG_RATE 와 같은 값(정본은 그쪽). */
const PG_RATE = 0.0286;

/** 목록 한 페이지 크기. 화면 페이지네이션이 이 값을 전제한다. */
const PAGE_SIZE = 50;

/** 화면이 한 번에 그릴 수 있는 최대 일수 — 30일 추이 차트용. */
const TREND_DAYS = 30;

/* 실패해도 화면 전체가 죽지 않게 — 회계 리포트의 safe() 와 같은 뜻. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

/** KST 기준 오늘 날짜(YYYY-MM-DD). D1 은 UTC 라 +9h 를 명시해야 한다. */
async function kstToday(env: Env): Promise<string> {
  const r = await env.DB.prepare(`SELECT date('now','+9 hours') AS d`).first<{ d: string }>();
  return String(r?.d || '').slice(0, 10);
}

/** 증감률(%). 이전 값이 0이면 «비교 불가» 라 null 을 준다 — 0에서 늘어난 걸
    +100% 라고 쓰면 화면이 거짓말을 한다. */
function delta(now: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((now - prev) / prev) * 1000) / 10;
}

/** YYYY-MM-DD 형식만 통과. 사용자 입력을 SQL 에 넣기 전 검사. */
function safeDate(s: string | null): string | null {
  const v = String(s || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/* ═══════════════════════════════════════════════════════════════════════
   B2B — 학원이 통장으로 바로 보낸 돈
   ═══════════════════════════════════════════════════════════════════════ */
async function handleB2B(url: URL, env: Env): Promise<Response> {
  const today = await kstToday(env);
  const month = today.slice(0, 7);
  const from = safeDate(url.searchParams.get('from'));
  const to = safeDate(url.searchParams.get('to'));
  const q = String(url.searchParams.get('q') || '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);

  /* 통장 입금 전체를 가져와 JS 에서 분류한다. classifyDeposit 은 적요 문자열
     규칙이라 SQL 로 못 옮긴다(그리고 옮기면 두 벌이 되어 갈라진다).
     월 입금이 6~20건 수준이라 전량 로드해도 부담이 없다. */
  const all = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT trans_at, COALESCE(remark,'') AS remark, amount
        FROM bankacct_transactions
       WHERE kind='in'
       ORDER BY trans_at DESC
    `).all();
    return (r.results || []) as Array<{ trans_at: string; remark: string; amount: number }>;
  }, []);

  const b2b = all
    .map(r => ({ date: String(r.trans_at || '').slice(0, 10), remark: r.remark, amount: Number(r.amount) || 0 }))
    .filter(r => classifyDeposit(r.remark, r.amount) === 'b2b');

  const sum = (rows: Array<{ amount: number }>) => rows.reduce((a, b) => a + b.amount, 0);

  // ── KPI ──
  const todayRows = b2b.filter(r => r.date === today);
  const monthRows = b2b.filter(r => r.date.slice(0, 7) === month);

  const yd = new Date(`${today}T00:00:00Z`); yd.setUTCDate(yd.getUTCDate() - 1);
  const yesterday = yd.toISOString().slice(0, 10);
  const pm = new Date(`${month}-01T00:00:00Z`); pm.setUTCMonth(pm.getUTCMonth() - 1);
  const prevMonth = pm.toISOString().slice(0, 7);

  const prevDayRows = b2b.filter(r => r.date === yesterday);
  const prevMonthRows = b2b.filter(r => r.date.slice(0, 7) === prevMonth);

  // ── 30일 추이 ──
  const dayStart = new Date(`${today}T00:00:00Z`); dayStart.setUTCDate(dayStart.getUTCDate() - (TREND_DAYS - 1));
  const daily: Array<{ date: string; amount: number }> = [];
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = new Date(dayStart); d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key, amount: sum(b2b.filter(r => r.date === key)) });
  }

  // ── 목록(필터 적용) ──
  let rows = b2b;
  if (from) rows = rows.filter(r => r.date >= from);
  if (to) rows = rows.filter(r => r.date <= to);
  if (q) rows = rows.filter(r => r.remark.includes(q));
  const total = rows.length;
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* 🏦 통장은 «바로빌 동기화» 를 배포 권한자가 돌려야 채워진다. 안 돌리면 며칠 전에
     멈춰 있는데, 그걸 모르고 보면 「이번달 입금이 이것뿐」 으로 오해한다.
     마지막 입금일을 함께 줘서 화면이 «○○까지 반영» 이라고 밝히게 한다. */
  const lastBankAt = all.length ? String(all[0].trans_at || '').slice(0, 10) : null;

  return json({
    ok: true,
    source: 'bankacct',
    today, month,
    hasBank: all.length > 0,
    lastBankAt,
    stale: !!(lastBankAt && lastBankAt < today),
    kpi: {
      today: { amount: sum(todayRows), count: todayRows.length },
      month: { amount: sum(monthRows), count: monthRows.length },
      dayDelta: delta(sum(todayRows), sum(prevDayRows)),
      monthDelta: delta(sum(monthRows), sum(prevMonthRows)),
      count: monthRows.length,
      avgPerCase: monthRows.length ? Math.round(sum(monthRows) / monthRows.length) : 0,
      // 데모 화면의 「수수료 합계」 자리를 대신한다 — 통장 이체엔 PG 수수료가 없다.
      payers: new Set(monthRows.map(r => r.remark)).size,
    },
    daily,
    rows: paged,
    total,
    page, pageSize: PAGE_SIZE,
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   B2C — 학부모 카드결제(카페24/PG)
   ═══════════════════════════════════════════════════════════════════════ */
async function handleB2C(url: URL, env: Env): Promise<Response> {
  const today = await kstToday(env);
  const month = today.slice(0, 7);
  const from = safeDate(url.searchParams.get('from'));
  const to = safeDate(url.searchParams.get('to'));
  const agency = String(url.searchParams.get('agency') || '').trim();
  const q = String(url.searchParams.get('q') || '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);

  /* KST 로 환산한 결제일. paid_at 은 ms 라 /1000 후 +9h. */
  const D = `date(p.paid_at/1000,'unixepoch','+9 hours')`;
  const BASE = `p.status='paid' AND ${notSeedSql('p')}`;

  // ── KPI ──
  const kpi = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN ${D} = date('now','+9 hours')                              THEN p.amount_krw END),0) AS today_amt,
        COUNT(CASE WHEN ${D} = date('now','+9 hours')                                     THEN 1 END)               AS today_cnt,
        COALESCE(SUM(CASE WHEN ${D} = date('now','-1 day','+9 hours')                     THEN p.amount_krw END),0) AS yday_amt,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m',${D}) = strftime('%Y-%m',date('now','+9 hours'))            THEN p.amount_krw END),0) AS month_amt,
        COUNT(CASE WHEN strftime('%Y-%m',${D}) = strftime('%Y-%m',date('now','+9 hours'))                   THEN 1 END)               AS month_cnt,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m',${D}) = strftime('%Y-%m',date('now','-1 month','+9 hours')) THEN p.amount_krw END),0) AS pmonth_amt
      FROM student_payments p
      WHERE ${BASE}
    `).first<any>();
    return r || {};
  }, {} as any);

  const todayAmt = Number(kpi.today_amt) || 0;
  const monthAmt = Number(kpi.month_amt) || 0;
  const monthCnt = Number(kpi.month_cnt) || 0;

  // ── 30일 추이 ──
  const daily = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT ${D} AS date, COALESCE(SUM(p.amount_krw),0) AS amount
        FROM student_payments p
       WHERE ${BASE} AND ${D} >= date('now','-${TREND_DAYS - 1} day','+9 hours')
       GROUP BY date ORDER BY date
    `).all();
    return (r.results || []) as Array<{ date: string; amount: number }>;
  }, []);

  /* ── 목록 ──
     학생 원부(students_erp)를 LEFT JOIN 해서 학생명·대리점을 붙인다.
     ⚠️ 결제 금액의 91% 는 «원부에 없는 결제자»(학부모가 자기 아이디로 결제) 라
        대리점을 특정할 수 없다. 그래서 대리점 필터를 걸면 대부분이 빠진다 —
        화면이 그 사실을 숨기지 않도록 unattributed 를 함께 돌려준다. */
  const where: string[] = [BASE];
  const binds: any[] = [];
  if (from) { where.push(`${D} >= ?`); binds.push(from); }
  if (to) { where.push(`${D} <= ?`); binds.push(to); }
  if (agency) { where.push(`st.shop_name = ?`); binds.push(agency); }
  if (q) {
    where.push(`(COALESCE(st.korean_name,'') LIKE ? OR p.user_id LIKE ? OR COALESCE(p.memo,'') LIKE ?)`);
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const WHERE = where.join(' AND ');

  const total = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COUNT(*) AS n FROM student_payments p
      LEFT JOIN students_erp st ON st.user_id = p.user_id
      WHERE ${WHERE}
    `).bind(...binds).first<{ n: number }>();
    return Number(r?.n) || 0;
  }, 0);

  const rows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT p.id, ${D} AS date, p.user_id,
             COALESCE(st.korean_name,'') AS student_name,
             COALESCE(st.shop_name,'')  AS agency,
             COALESCE(p.method,'')      AS method,
             p.amount_krw               AS amount,
             p.status
        FROM student_payments p
        LEFT JOIN students_erp st ON st.user_id = p.user_id
       WHERE ${WHERE}
       ORDER BY p.paid_at DESC
       LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `).bind(...binds).all();
    return (r.results || []) as Array<any>;
  }, []);

  /* 같은 필터 범위에서 «대리점을 못 붙인» 몫 — 화면 경고 띠가 이걸 쓴다. */
  const unattributed = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COUNT(*) AS n, COALESCE(SUM(p.amount_krw),0) AS amount
        FROM student_payments p
        LEFT JOIN students_erp st ON st.user_id = p.user_id
       WHERE ${WHERE} AND st.user_id IS NULL
    `).bind(...binds).first<{ n: number; amount: number }>();
    return { count: Number(r?.n) || 0, amount: Number(r?.amount) || 0 };
  }, { count: 0, amount: 0 });

  // 대리점 드롭다운 — 실제 결제가 있는 곳만
  const agencies = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT DISTINCT st.shop_name AS name
        FROM student_payments p JOIN students_erp st ON st.user_id = p.user_id
       WHERE ${BASE} AND COALESCE(st.shop_name,'') <> ''
       ORDER BY name
    `).all();
    return ((r.results || []) as Array<{ name: string }>).map(x => x.name);
  }, []);

  return json({
    ok: true,
    source: 'student_payments',
    today, month,
    feeRate: PG_RATE,
    kpi: {
      today: { amount: todayAmt, count: Number(kpi.today_cnt) || 0 },
      month: { amount: monthAmt, count: monthCnt },
      dayDelta: delta(todayAmt, Number(kpi.yday_amt) || 0),
      monthDelta: delta(monthAmt, Number(kpi.pmonth_amt) || 0),
      count: monthCnt,
      avgPerCase: monthCnt ? Math.round(monthAmt / monthCnt) : 0,
      fee: Math.round(monthAmt * PG_RATE),
    },
    daily,
    rows,
    total,
    page, pageSize: PAGE_SIZE,
    unattributed,
    agencies,
  });
}

/** ph106 결제관리 라우터. 매칭 안 되면 null → 상위가 라우팅을 계속한다. */
export async function handlePaymentsBoardApi(
  request: Request, url: URL, env: Env,
): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  if (url.pathname === '/api/admin/payments/b2b') return handleB2B(url, env);
  if (url.pathname === '/api/admin/payments/b2c') return handleB2C(url, env);
  return null;
}
