/**
 * accounting-reports.ts — 회계 리포트 6종
 *
 *   GET /api/admin/reports/monthly?period=YYYY-MM        월간 회계 리포트
 *   GET /api/admin/reports/quarterly?year=YYYY&q=N       분기 보고서 (N: 1-4)
 *   GET /api/admin/reports/annual?year=YYYY              연간 결산
 *   GET /api/admin/reports/franchise?period=YYYY-MM      가맹점별 정산서
 *   GET /api/admin/reports/payslips?period=YYYY-MM       강사별 급여명세서 (전체)
 *   GET /api/admin/reports/kpi?period=YYYY-MM            경영지표 (LTV·CAC·ROI·이익률)
 *   GET /api/admin/reports/statement?type=pl|bs|cf|tb&period=YYYY-MM  재무제표
 *   GET /api/admin/reports/tax?period=YYYY-MM            세무 자료 (부가세·원천세)
 *   GET /api/admin/reports/journal?period=YYYY-MM        회계 전표 / 분개장
 *   GET /api/admin/reports/receivables?kind=receivable|payable|pending  미수금/미지급금
 *   GET /api/admin/reports/payments-list?from=&to=&method=&status=  학생 결제 내역
 *   GET /api/admin/reports/refunds-list?status=          환불/취소 내역
 *
 *   format=json  (기본)  → JSON
 *   format=csv          → text/csv 다운로드
 *
 * 모든 쿼리는 student_payments / students_erp / attendance / payslips / teachers /
 * franchises / centers / enrollments 등 기존 테이블을 사용. 누락된 테이블이 있어도
 * try/catch 로 0 으로 graceful degradation (api-mango.ts 패턴 동일).
 */

interface Env {
  DB: D1Database;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

const csv = (filename: string, rows: (string | number)[][]): Response => {
  // CSV escape (RFC 4180)
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

// 월(YYYY-MM)을 KST 기준 startMs / endMs (Unix milliseconds) 로 변환
// 주의: student_payments.paid_at 은 Date.now() 기반의 ms 단위로 저장되므로 ms 반환
function monthRange(period: string): { startMs: number; endMs: number; label: string } {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error('invalid period (YYYY-MM)');
  const start = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000);
  const end = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000);
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    label: `${y}년 ${m}월`,
  };
}

function quarterRange(year: number, q: number) {
  const startMonth = (q - 1) * 3 + 1;
  const months = [0, 1, 2].map(i => `${year}-${String(startMonth + i).padStart(2, '0')}`);
  return { months, label: `${year}년 ${q}분기` };
}

/* 🏦💳 신한 실지출 (2026-08-15) — 그 달의 법인카드 승인 + 계좌 출금(중복 제외) 합.
   손익계산서(statement)·월간·분기·연간·KPI 가 전부 이걸 쓴다. 규칙은 여기 한 곳에만:
     · 카드: corpcard_transactions (cancelled=0, 부분취소는 음수라 자동 차감)
     · 계좌: bankacct_transactions (kind='out'), 단 «급여이체»(payslips 강사급여와 중복)
       ·«카드대금»(카드 지출과 중복 — 카드값이 계좌에서 빠져나가는 돈)은 제외
   테이블이 아직 없거나 그 달 실데이터가 0이면 hasActual=false → 부르는 쪽이
   기존 «매출 10% 추정» 으로 폴백한다(새 환경에서도 리포트가 죽지 않게). */
/* 🌱 테스트 시드 결제 제외 (2026-08-16) ─────────────────────────────────────
   [무슨 일이 있었나] 시연용으로 만든 가짜 학생 50명(구독 50건이 2026-06-04 하루에
   한꺼번에 생성, 빌링키 없음, 대부분 students_erp 원부에도 없음)의 «결제» 가
   student_payments 에 그대로 쌓여 실매출로 잡혔다. 매달 1,100만~3,000만 규모라
   이익률이 86% 같은 비현실적 숫자로 나왔다(2026-08-15 사장님 제보 → 추적).

   [판별 근거 — 실데이터로 확인] 시드 결제는 메모가 둘 중 하나다:
     · '[TESTSEED] …'            323건 1억 3,106만 — 시드 생성기가 찍은 표식
     · '정기결제 자동청구(cron)'  109건 4,174만    — 같은 배치가 만든 가짜 정기결제
   두 부류 **전부**가 위 시드 계정 소유였고, 진짜 결제([cafe24] 동기화 11,090건
   10억 6,396만)와는 **한 건도 겹치지 않는다.**

   [검산] 2026-03~07 5개월 — 시드 제외 후 실매출 1억 222만 vs 실제 KCP 입금
   9,960만. PG 수수료 3.3% 를 감안하면 사실상 일치한다(제외 전에는 1억 8,088만
   으로 입금보다 8,100만이 많았다).

   ⛔ 데이터는 «지우지 않는다» — 리포트에서만 뺀다(사장님 지시, 되돌리기 쉬워야 함).
   ⚠️ 진짜 정기결제 청구는 payment_orders 에 기록되고 빌링키가 반드시 있다
      (api-pay.ts chargeSubscriptionOnce). 즉 지금 이 두 메모를 쓰는 «진짜» 결제는
      없다. 나중에 정기결제를 student_payments 에도 적게 만든다면 **메모 문구를
      반드시 다르게** 쓸 것 — 같게 쓰면 진짜 매출이 조용히 빠진다. */
const SEED_MEMOS = ["'[TESTSEED]%'", "'정기결제 자동청구(cron)'"];
/** 시드 결제를 걸러내는 SQL 조건. a = 테이블 별칭(조인 쿼리에서 컬럼 모호성 방지). */
function notSeedSql(a = ''): string {
  const q = a ? a + '.' : '';
  return `NOT (COALESCE(${q}memo,'') LIKE ${SEED_MEMOS[0]} OR COALESCE(${q}memo,'') = ${SEED_MEMOS[1]})`;
}
/** 그 달에 «리포트에서 뺀» 시드 매출 — 화면에 «얼마를 왜 뺐는지» 밝히기 위한 값. */
async function seedRevenueExcluded(env: Env, startMs: number, endMs: number): Promise<{ amount: number; count: number }> {
  return await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS amount, COUNT(*) AS cnt FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND NOT (${notSeedSql()})
    `).bind(startMs, endMs).first<{ amount: number; cnt: number }>();
    return { amount: Number(r?.amount) || 0, count: Number(r?.cnt) || 0 };
  }, { amount: 0, count: 0 });
}

const OPEX_DUP_CATEGORIES = ['급여이체', '카드대금'];          // 다른 항목과 이중계상 → 제외
const OPEX_MOVED_CATEGORIES = ['강사급여송금', '학생환불'];     // 판관비가 아니라 다른 줄로 가는 돈
async function monthActualOpex(env: Env, period: string) {
  const cardSpend = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount),0) AS t FROM corpcard_transactions
      WHERE cancelled=0 AND substr(used_at,1,7)=?
    `).bind(period).first<{ t: number }>();
    return Number(r?.t) || 0;
  }, 0);
  const bankAll = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(category,'기타출금') AS category, COALESCE(SUM(amount),0) AS total
      FROM bankacct_transactions WHERE kind='out' AND substr(trans_at,1,7)=?
      GROUP BY category ORDER BY total DESC
    `).bind(period).all();
    return (r.results || []) as Array<{ category: string; total: number }>;
  }, [] as Array<{ category: string; total: number }>);
  const catSum = (cats: string[]) => bankAll.filter(b => cats.includes(b.category))
    .reduce((a, b) => a + (Number(b.total) || 0), 0);
  const bankRows = bankAll.filter(b => !OPEX_DUP_CATEGORIES.includes(b.category) && !OPEX_MOVED_CATEGORIES.includes(b.category));
  const bankOpex = bankRows.reduce((a, b) => a + (Number(b.total) || 0), 0);
  const bankDup = catSum(OPEX_DUP_CATEGORIES);
  // 🧑‍🏫 강사급여송금(메트로은행) → 강사 급여 줄로. payslips 가 비어 있을 때의 실데이터 폴백.
  const teacherPayout = catSum(['강사급여송금']);
  // 💸 학생환불 → 비용이 아니라 매출 차감 (2026-08-15 사장님 확인)
  const refunds = catSum(['학생환불']);
  const actual = cardSpend + bankOpex;
  // hasActual 은 «그 달에 신한 실데이터가 있긴 한가» — 송금·환불만 있는 달도 실데이터가 있는 달이다
  const hasActual = actual > 0 || teacherPayout > 0 || refunds > 0 || bankDup > 0;
  return { cardSpend, bankRows, bankOpex, bankDup, teacherPayout, refunds, actual, hasActual };
}

// ────────────────────────────────────────────────────────────────────
// 메인 라우터
// ────────────────────────────────────────────────────────────────────
export async function reportsRouter(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/reports\//, '');
  const fmt = url.searchParams.get('format') || 'json';

  try {
    if (p === 'monthly')   return await monthlyReport(env, url, fmt);
    if (p === 'quarterly') return await quarterlyReport(env, url, fmt);
    if (p === 'annual')    return await annualReport(env, url, fmt);
    if (p === 'franchise') return await franchiseReport(env, url, fmt);
    if (p === 'payslips')  return await payslipsReport(env, url, fmt);
    if (p === 'kpi')       return await kpiReport(env, url, fmt);
    if (p === 'statement')   return await statementReport(env, url, fmt);
    if (p === 'tax')         return await taxReport(env, url, fmt);
    if (p === 'journal')     return await journalReport(env, url, fmt);
    if (p === 'receivables') return await receivablesReport(env, url, fmt);
    if (p === 'payments-list') return await paymentsList(env, url, fmt);
    if (p === 'refunds-list')  return await refundsList(env, url, fmt);
    if (p === 'reconcile')     return await reconcileReport(env, url, fmt);
    return err('not found: ' + p, 404);
  } catch (e: any) {
    return err(e?.message || 'internal error', 500);
  }
}

// ────────────────────────────────────────────────────────────────────
// 1) 월간 회계 리포트
// ────────────────────────────────────────────────────────────────────
async function monthlyReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();
  const { startMs, endMs, label } = monthRange(period);

  // 매출 + 결제 건수
  const rev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(amount_krw), 0) AS revenue,
        COUNT(*) AS pay_count,
        COUNT(DISTINCT user_id) AS paying_users
      FROM student_payments
      WHERE status='paid' AND paid_at >= ? AND paid_at < ? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ revenue: number; pay_count: number; paying_users: number }>();
    return r || { revenue: 0, pay_count: 0, paying_users: 0 };
  }, { revenue: 0, pay_count: 0, paying_users: 0 });

  // 결제수단별 분포
  const byMethod = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(method,'기타') AS method,
             COUNT(*) AS cnt,
             COALESCE(SUM(amount_krw),0) AS total
      FROM student_payments
      WHERE status='paid' AND paid_at >= ? AND paid_at < ? AND ${notSeedSql()}
      GROUP BY method ORDER BY total DESC
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<{ method: string; cnt: number; total: number }>;
  }, []);

  // 신규 학생 / 만료 학생
  const stuMv = await safe(async () => {
    const yyyymm = period;
    const r = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM students_erp WHERE substr(COALESCE(signup_date,''),1,7) = ?) AS new_signups,
        (SELECT COUNT(*) FROM students_erp WHERE substr(COALESCE(end_date,''),1,7) = ?) AS expirations,
        (SELECT COUNT(*) FROM students_erp WHERE status IN ('정상','활동','active')) AS active_total
    `).bind(yyyymm, yyyymm).first<{ new_signups: number; expirations: number; active_total: number }>();
    return r || { new_signups: 0, expirations: 0, active_total: 0 };
  }, { new_signups: 0, expirations: 0, active_total: 0 });

  // 강사 급여 합계 (Phase 8 payslips)
  const payroll = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(payment_krw),0) AS total,
             COUNT(*) AS teachers
      FROM payslips WHERE period = ?
    `).bind(period).first<{ total: number; teachers: number }>();
    return r || { total: 0, teachers: 0 };
  }, { total: 0, teachers: 0 });

  // 수업 시간 (분 단위 합계)
  const classMin = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_active_ms),0)/60000 AS total_min,
             COUNT(*) AS sessions
      FROM attendance
      WHERE date BETWEEN ? AND ?
    `).bind(period + '-01', period + '-31').first<{ total_min: number; sessions: number }>();
    return r || { total_min: 0, sessions: 0 };
  }, { total_min: 0, sessions: 0 });

  // PG 수수료는 요율이라 추정식 유지. 운영비는 신한 실지출(카드+계좌)이 있으면 그걸 쓴다
  const pgFee = Math.round(rev.revenue * 0.033);  // PG 수수료 약 3.3%
  const ax = await monthActualOpex(env, period);
  const seedEx = await seedRevenueExcluded(env, startMs, endMs);   // 🌱 리포트에서 뺀 시드 매출
  const opCost = ax.hasActual ? ax.actual : Math.round(rev.revenue * 0.10);  // 폴백 = 추정 10%
  // 🧑‍🏫 강사 급여 — 급여명세(payslips)가 비어 있으면 신한 계좌의 강사 송금(실데이터)으로 대신
  const payrollEff = payroll.total > 0 ? payroll.total : ax.teacherPayout;
  // 💸 학생 환불 — 손익계산서는 매출 차감으로 두지만 여기서는 나간 돈 줄로 표시(순이익은 동일)
  const totalCost = payrollEff + pgFee + opCost + ax.refunds;
  const netIncome = rev.revenue - totalCost;
  const margin = rev.revenue > 0 ? (netIncome / rev.revenue) * 100 : 0;

  const data = {
    ok: true,
    type: 'monthly',
    period, label,
    summary: {
      revenue: rev.revenue,
      pay_count: rev.pay_count,
      paying_users: rev.paying_users,
      avg_per_user: rev.paying_users > 0 ? Math.round(rev.revenue / rev.paying_users) : 0,
      new_signups: stuMv.new_signups,
      expirations: stuMv.expirations,
      active_students: stuMv.active_total,
      class_minutes: classMin.total_min,
      class_sessions: classMin.sessions,
      // 🌱 시연용 시드 결제를 뺀 사실을 «숨기지 않고» 화면에 그대로 알린다
      seed_excluded_krw: seedEx.amount,
      seed_excluded_count: seedEx.count,
    },
    cost: {
      teacher_payroll: payrollEff,
      teacher_count: payroll.teachers,
      // 강사 급여 출처 — payslips(급여명세) 또는 bank(신한 계좌 강사 송금 실데이터)
      teacher_payroll_source: payroll.total > 0 ? 'payslips' : (ax.teacherPayout > 0 ? 'bank' : 'payslips'),
      teacher_dup_excluded: payroll.total > 0 ? ax.teacherPayout : 0,
      pg_fee: pgFee,
      op_cost: opCost,
      // 🏦💳 운영비 출처 — 화면(adm-core.js renderMonthly)이 라벨·내역을 이걸로 그린다
      op_cost_source: ax.hasActual ? 'actual' : 'estimated',
      op_card: ax.cardSpend,               // 법인카드 지출 합
      op_bank: ax.bankOpex,                // 계좌 출금 합(중복 제외 후)
      op_bank_rows: ax.bankRows,           // 계좌 출금 분류별 [{category,total}]
      bank_dup_excluded: ax.bankDup,       // 급여이체·카드대금 — 중복이라 뺀 금액
      refunds: ax.refunds,                 // 학생 환불 (신한 실데이터)
      total: totalCost,
    },
    pl: {
      revenue: rev.revenue,
      cost: totalCost,
      net_income: netIncome,
      margin_pct: Number(margin.toFixed(2)),
    },
    by_method: byMethod,
  };

  if (fmt === 'csv') {
    return csv(`monthly-${period}.csv`, [
      ['망고아이 월간 회계 리포트', label],
      [],
      ['매출 합계', rev.revenue],
      ['결제 건수', rev.pay_count],
      ['결제 학생수', rev.paying_users],
      ['평균 결제액', data.summary.avg_per_user],
      ['신규 가입', stuMv.new_signups],
      ['만료', stuMv.expirations],
      ['활성 학생수', stuMv.active_total],
      ['수업 분', classMin.total_min],
      ['세션 수', classMin.sessions],
      [],
      ['[비용]'],
      [payroll.total > 0 ? '강사 급여' : '강사 급여(신한 송금 실데이터)', payrollEff],
      ['PG 수수료(추정 3.3%)', pgFee],
      ...(ax.hasActual
        ? [['법인카드 지출(신한 실데이터)', ax.cardSpend] as (string | number)[],
           ...ax.bankRows.map(b => [`계좌 출금 — ${b.category}(신한 실데이터)`, Number(b.total) || 0] as (string | number)[]),
           ...(ax.bankDup > 0 ? [[`(제외) 계좌 출금 급여이체·카드대금 — 강사급여·카드와 중복`, ax.bankDup] as (string | number)[]] : [])]
        : [['운영비(추정 10%)', opCost] as (string | number)[]]),
      ...(ax.refunds > 0 ? [['학생 환불(신한 실데이터)', ax.refunds] as (string | number)[]] : []),
      ['비용 합계', totalCost],
      [],
      ['[손익]'],
      ['매출', rev.revenue],
      ['비용', totalCost],
      ['순이익', netIncome],
      ['이익률(%)', data.pl.margin_pct],
      [],
      ['[결제수단별]'],
      ['수단', '건수', '금액'],
      ...byMethod.map(m => [m.method, m.cnt, m.total]),
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 2) 분기 보고서 — 3개월 트렌드
// ────────────────────────────────────────────────────────────────────
async function quarterlyReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const year = Number(url.searchParams.get('year')) || new Date().getUTCFullYear();
  const q = Number(url.searchParams.get('q')) || 1;
  if (q < 1 || q > 4) return err('q must be 1-4');
  const { months, label } = quarterRange(year, q);

  const monthlies = await Promise.all(months.map(async (period) => {
    const { startMs, endMs } = monthRange(period);
    const r = await safe(async () => {
      const x = await env.DB.prepare(`
        SELECT COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS pays
        FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
      `).bind(startMs, endMs).first<{ revenue: number; pays: number }>();
      return x || { revenue: 0, pays: 0 };
    }, { revenue: 0, pays: 0 });
    const payroll = await safe(async () => {
      const x = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS p FROM payslips WHERE period=?`)
        .bind(period).first<{ p: number }>();
      return x?.p || 0;
    }, 0);
    // PG 3.3% + 운영비(신한 실지출 있으면 실데이터, 없으면 추정 10%)
    // 강사급여는 급여명세 우선, 없으면 신한 계좌 강사송금. 환불도 나간 돈으로 합산.
    const ax = await monthActualOpex(env, period);
    const effPay = payroll > 0 ? payroll : ax.teacherPayout;
    const cost = effPay + Math.round(r.revenue * 0.033) + (ax.hasActual ? ax.actual : Math.round(r.revenue * 0.10)) + ax.refunds;
    return { period, revenue: r.revenue, pays: r.pays, payroll: effPay, cost, net: r.revenue - cost };
  }));

  const totals = monthlies.reduce((a, m) => ({
    revenue: a.revenue + m.revenue,
    pays: a.pays + m.pays,
    payroll: a.payroll + m.payroll,
    cost: a.cost + m.cost,
    net: a.net + m.net,
  }), { revenue: 0, pays: 0, payroll: 0, cost: 0, net: 0 });

  const data = { ok: true, type: 'quarterly', year, quarter: q, label, monthlies, totals,
    margin_pct: totals.revenue > 0 ? Number(((totals.net / totals.revenue) * 100).toFixed(2)) : 0,
  };

  if (fmt === 'csv') {
    return csv(`quarterly-${year}-Q${q}.csv`, [
      ['망고아이 분기 보고서', label],
      [],
      ['월', '매출', '결제건수', '강사급여', '비용 합계', '순이익'],
      ...monthlies.map(m => [m.period, m.revenue, m.pays, m.payroll, m.cost, m.net]),
      ['합계', totals.revenue, totals.pays, totals.payroll, totals.cost, totals.net],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 3) 연간 결산
// ────────────────────────────────────────────────────────────────────
async function annualReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const year = Number(url.searchParams.get('year')) || new Date().getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  const monthlies = await Promise.all(months.map(async (period) => {
    const { startMs, endMs } = monthRange(period);
    const r = await safe(async () => {
      const x = await env.DB.prepare(`
        SELECT COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS pays
        FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
      `).bind(startMs, endMs).first<{ revenue: number; pays: number }>();
      return x || { revenue: 0, pays: 0 };
    }, { revenue: 0, pays: 0 });
    const payroll = await safe(async () => {
      const x = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS p FROM payslips WHERE period=?`)
        .bind(period).first<{ p: number }>();
      return x?.p || 0;
    }, 0);
    // 분기 보고서와 같은 규칙 — PG 3.3% + 운영비(실데이터 우선) + 강사급여 폴백 + 환불
    const ax = await monthActualOpex(env, period);
    const effPay = payroll > 0 ? payroll : ax.teacherPayout;
    const cost = effPay + Math.round(r.revenue * 0.033) + (ax.hasActual ? ax.actual : Math.round(r.revenue * 0.10)) + ax.refunds;
    return { period, revenue: r.revenue, pays: r.pays, payroll: effPay, cost, net: r.revenue - cost };
  }));

  const totals = monthlies.reduce((a, m) => ({
    revenue: a.revenue + m.revenue, pays: a.pays + m.pays,
    payroll: a.payroll + m.payroll, cost: a.cost + m.cost, net: a.net + m.net,
  }), { revenue: 0, pays: 0, payroll: 0, cost: 0, net: 0 });

  const data = {
    ok: true, type: 'annual', year, label: `${year}년 결산`,
    monthlies, totals,
    margin_pct: totals.revenue > 0 ? Number(((totals.net / totals.revenue) * 100).toFixed(2)) : 0,
  };

  if (fmt === 'csv') {
    return csv(`annual-${year}.csv`, [
      ['망고아이 연간 결산', `${year}년`],
      [],
      ['월', '매출', '결제건수', '강사급여', '비용 합계', '순이익'],
      ...monthlies.map(m => [m.period, m.revenue, m.pays, m.payroll, m.cost, m.net]),
      ['합계', totals.revenue, totals.pays, totals.payroll, totals.cost, totals.net],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 4) 가맹점별 정산서
// ────────────────────────────────────────────────────────────────────
async function franchiseReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();
  const { startMs, endMs, label } = monthRange(period);
  const hqFeeRate = Number(url.searchParams.get('hq_fee')) || 0.15; // 본사 수수료 15%

  // 가맹점 목록
  const franchises = await safe(async () => {
    const r = await env.DB.prepare(`SELECT id, name FROM franchises WHERE active=1 ORDER BY name`).all();
    return (r.results || []) as Array<{ id: number; name: string }>;
  }, []);

  // 가맹점별 매출 — students_erp 에 franchise_id 가 있다면 좋지만 없을 수 있음
  // → 대신 가맹점별 결제 분배가 안되어 있으면 전체 매출로 대체
  const totalRev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ revenue: number }>();
    return r?.revenue || 0;
  }, 0);

  // 가맹점이 없으면 본사 단독으로 표시
  const rows = franchises.length > 0
    ? franchises.map((f, i) => {
        // 균등 분배 추정 (실제 환경에선 students_erp.franchise_id 로 정확 계산)
        const share = Math.round(totalRev / franchises.length);
        const fee = Math.round(share * hqFeeRate);
        return {
          franchise_id: f.id,
          franchise_name: f.name,
          gross_revenue: share,
          hq_fee: fee,
          net_settlement: share - fee,
          due_date: nextSettlementDate(period),
          status: 'pending',
        };
      })
    : [{
        franchise_id: 0, franchise_name: '본사 직영',
        gross_revenue: totalRev,
        hq_fee: 0,
        net_settlement: totalRev,
        due_date: nextSettlementDate(period),
        status: 'self',
      }];

  const totals = rows.reduce((a, r) => ({
    gross: a.gross + r.gross_revenue,
    fee: a.fee + r.hq_fee,
    net: a.net + r.net_settlement,
  }), { gross: 0, fee: 0, net: 0 });

  const data = { ok: true, type: 'franchise', period, label, hq_fee_rate: hqFeeRate, rows, totals };

  if (fmt === 'csv') {
    return csv(`franchise-settlement-${period}.csv`, [
      ['망고아이 가맹점 정산서', label],
      [`본사 수수료율: ${(hqFeeRate * 100).toFixed(1)}%`],
      [],
      ['가맹점', '총 매출', '본사 수수료', '정산액', '송금예정일', '상태'],
      ...rows.map(r => [r.franchise_name, r.gross_revenue, r.hq_fee, r.net_settlement, r.due_date, r.status]),
      ['합계', totals.gross, totals.fee, totals.net, '', ''],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 5) 강사별 급여명세서
// ────────────────────────────────────────────────────────────────────
async function payslipsReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();

  const rows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT p.teacher_id, p.period,
             COALESCE(t.name, p.teacher_id) AS teacher_name,
             COALESCE(t.country,'') AS country,
             COALESCE(p.minutes_taught, 0) AS minutes,
             COALESCE(p.payment_php, 0) AS payment_php,
             COALESCE(p.payment_krw, 0) AS payment_krw,
             COALESCE(p.evaluation_score, 0) AS eval_score,
             COALESCE(p.bonus_krw, 0) AS bonus,
             COALESCE(p.deduction_krw, 0) AS deduction,
             COALESCE(p.payment_krw,0) + COALESCE(p.bonus_krw,0) - COALESCE(p.deduction_krw,0) AS net
      FROM payslips p
      LEFT JOIN teachers t ON t.id = p.teacher_id
      WHERE p.period = ?
      ORDER BY net DESC
    `).bind(period).all();
    return (r.results || []) as Array<any>;
  }, []);

  const totals = rows.reduce((a, r) => ({
    minutes: a.minutes + (r.minutes || 0),
    payment: a.payment + (r.payment_krw || 0),
    bonus: a.bonus + (r.bonus || 0),
    deduction: a.deduction + (r.deduction || 0),
    net: a.net + (r.net || 0),
  }), { minutes: 0, payment: 0, bonus: 0, deduction: 0, net: 0 });

  const data = { ok: true, type: 'payslips', period, label: `${period} 강사 급여명세서`,
    rows, totals, teacher_count: rows.length };

  if (fmt === 'csv') {
    return csv(`payslips-${period}.csv`, [
      ['망고아이 강사 급여명세서', period],
      [],
      ['강사ID', '이름', '국가', '수업분', '기본급여(KRW)', '상여', '공제', '실지급'],
      ...rows.map((r: any) => [
        r.teacher_id, r.teacher_name, r.country,
        r.minutes, r.payment_krw, r.bonus, r.deduction, r.net
      ]),
      ['합계', '', '', totals.minutes, totals.payment, totals.bonus, totals.deduction, totals.net],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 6) 경영지표 (KPI)
// ────────────────────────────────────────────────────────────────────
async function kpiReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();
  const { startMs, endMs, label } = monthRange(period);

  // 매출
  const rev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue,
             COUNT(DISTINCT user_id) AS paying_users
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ revenue: number; paying_users: number }>();
    return r || { revenue: 0, paying_users: 0 };
  }, { revenue: 0, paying_users: 0 });

  // 활성 학생
  const active = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS c FROM students_erp WHERE status IN ('정상','활동','active')`).first<{ c: number }>();
    return r?.c || 0;
  }, 0);

  // 신규 학생
  const newSignups = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS c FROM students_erp WHERE substr(COALESCE(signup_date,''),1,7)=?`)
      .bind(period).first<{ c: number }>();
    return r?.c || 0;
  }, 0);

  // 평균 누적 결제액 (LTV proxy) — 학생당 지금까지 결제 합계의 평균
  const ltvProxy = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT AVG(total) AS avg_total FROM (
        SELECT user_id, SUM(amount_krw) AS total
        FROM student_payments WHERE status='paid' AND ${notSeedSql()} GROUP BY user_id
      )
    `).first<{ avg_total: number }>();
    return Math.round(r?.avg_total || 0);
  }, 0);

  // 강사 급여
  const payroll = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS p FROM payslips WHERE period=?`)
      .bind(period).first<{ p: number }>();
    return r?.p || 0;
  }, 0);

  // 결제 성공률 (paid / 전체)
  const successRate = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS ok_cnt,
        COUNT(*) AS all_cnt
      FROM student_payments WHERE paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ ok_cnt: number; all_cnt: number }>();
    if (!r || !r.all_cnt) return 0;
    return Number(((r.ok_cnt / r.all_cnt) * 100).toFixed(1));
  }, 0);

  // 수업 시간 / 학생
  const classMin = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_active_ms),0)/60000 AS total_min,
             COUNT(DISTINCT user_id) AS uniq
      FROM attendance WHERE date BETWEEN ? AND ?
    `).bind(period + '-01', period + '-31').first<{ total_min: number; uniq: number }>();
    return r || { total_min: 0, uniq: 0 };
  }, { total_min: 0, uniq: 0 });

  const arpu = active > 0 ? Math.round(rev.revenue / active) : 0;
  // 이익률·ROI 도 실지출 기준으로 — 규칙은 monthActualOpex 한 곳(2026-08-15)
  const axK = await monthActualOpex(env, period);
  const effPayK = payroll > 0 ? payroll : axK.teacherPayout;
  const cost = effPayK + Math.round(rev.revenue * 0.033) + (axK.hasActual ? axK.actual : Math.round(rev.revenue * 0.10)) + axK.refunds;
  const net = rev.revenue - cost;
  const margin = rev.revenue > 0 ? (net / rev.revenue) * 100 : 0;
  const roi = cost > 0 ? (net / cost) * 100 : 0;
  // CAC: 마케팅비를 알 수 없으므로 순이익의 30% 추정
  const cacEst = Math.round((rev.revenue * 0.05) / Math.max(newSignups, 1));

  const kpis = [
    { key: 'revenue',         label: '월 매출',                 value: rev.revenue,      unit: 'KRW' },
    { key: 'active_students', label: '활성 학생',               value: active,           unit: '명' },
    { key: 'paying_users',    label: '결제 학생',               value: rev.paying_users, unit: '명' },
    { key: 'new_signups',     label: '신규 가입',               value: newSignups,       unit: '명' },
    { key: 'arpu',            label: 'ARPU (학생 1인 평균 매출)', value: arpu,             unit: 'KRW' },
    { key: 'ltv',             label: 'LTV (평균 누적결제)',     value: ltvProxy,         unit: 'KRW' },
    { key: 'cac_est',         label: 'CAC 추정 (마케팅비÷신규)', value: cacEst,           unit: 'KRW' },
    { key: 'ltv_cac',         label: 'LTV/CAC',                value: cacEst > 0 ? Number((ltvProxy / cacEst).toFixed(2)) : 0, unit: '배' },
    { key: 'margin_pct',      label: '이익률',                  value: Number(margin.toFixed(2)), unit: '%' },
    { key: 'roi_pct',         label: 'ROI',                    value: Number(roi.toFixed(2)),    unit: '%' },
    { key: 'success_rate',    label: '결제 성공률',             value: successRate,      unit: '%' },
    { key: 'class_min',       label: '총 수업 시간',            value: classMin.total_min, unit: '분' },
  ];

  const data = { ok: true, type: 'kpi', period, label: `${label} 경영지표 (KPI)`, kpis,
    revenue: rev.revenue, cost, net, payroll };

  if (fmt === 'csv') {
    return csv(`kpi-${period}.csv`, [
      ['망고아이 경영지표 (KPI)', label],
      [],
      ['지표', '값', '단위'],
      ...kpis.map(k => [k.label, k.value, k.unit]),
    ]);
  }
  return json(data);
}


// ────────────────────────────────────────────────────────────────────
// 7) 재무제표 (손익계산서·재무상태표·현금흐름표·시산표)
// ────────────────────────────────────────────────────────────────────
async function statementReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const type = (url.searchParams.get('type') || 'pl').toLowerCase();
  const period = url.searchParams.get('period') || currentMonth();
  const { startMs, endMs, label } = monthRange(period);

  // 공통: 매출, 강사급여 (모든 재무제표의 핵심 입력)
  const rev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue,
             COUNT(*) AS pay_count
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ revenue: number; pay_count: number }>();
    return r || { revenue: 0, pay_count: 0 };
  }, { revenue: 0, pay_count: 0 });

  const payroll = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(payment_krw),0) AS total
      FROM payslips WHERE period=?
    `).bind(period).first<{ total: number }>();
    return r?.total || 0;
  }, 0);

  // 추정 비용 — PG 수수료·세금은 요율이라 계속 추정식
  const pgFee = Math.round(rev.revenue * 0.033);   // PG 3.3%
  const tax = Math.round(rev.revenue * 0.03);      // 부가세 등 3% 추정

  /* 🏦💳 신한 실지출 — 규칙·쿼리는 monthActualOpex() 한 곳에만 있다(2026-08-15 통합).
     실데이터가 있으면 운영비를 «추정 10%» 대신 실지출로. 제외분(급여이체·카드대금)은
     화면에 안내 줄로 «얼마를 왜 뺐는지» 보여 준다(조용히 빼지 않는다). */
  const ax = await monthActualOpex(env, period);
  const seedEx = await seedRevenueExcluded(env, startMs, endMs);   // 🌱 리포트에서 뺀 시드 매출
  const { cardSpend, bankRows: bankOpexRows, bankOpex, bankDup, hasActual } = ax;
  const opCost = hasActual ? ax.actual : Math.round(rev.revenue * 0.10);   // 폴백 = 기존 추정 10%

  /* 🧑‍🏫 강사 급여 — 급여명세(payslips)가 있으면 그것이 정본. 비어 있으면 신한 계좌의
     강사 송금(메트로은행, 실데이터)으로 대신한다. 둘 다 있으면 급여명세를 쓰고 송금분은
     중복이라 제외(안내 줄 표시). 💸 학생 환불은 비용이 아니라 매출 차감(2026-08-15 확인). */
  const payrollEff = payroll > 0 ? payroll : ax.teacherPayout;
  const payrollFromBank = payroll <= 0 && ax.teacherPayout > 0;
  const revNet = rev.revenue - ax.refunds;

  const totalCost = payrollEff + pgFee + opCost + tax;
  const netIncome = revNet - totalCost;
  const grossProfit = revNet - payrollEff - pgFee;
  const operatingProfit = grossProfit - opCost;

  let data: any;

  if (type === 'pl') {
    // 손익계산서 (Income Statement / Profit & Loss)
    data = {
      ok: true, type: 'pl', period, label: `손익계산서 (P&L) — ${label}`,
      sections: [
        { title: 'I. 매출액 (Revenue)', items: [
          { name: '수업료 매출', amount: rev.revenue },
          ...(ax.refunds > 0 ? [{ name: '학생 환불 (신한 계좌·실데이터)', amount: -ax.refunds }] : []),
          ...(seedEx.amount > 0 ? [{ name: `※ 시연용 테스트 결제 ₩${seedEx.amount.toLocaleString('ko-KR')} (${seedEx.count}건)은 실매출이 아니라 제외했습니다`, sub: true }] : []),
          { name: '매출 합계', amount: revNet, total: true },
        ]},
        { title: 'II. 매출원가 (COGS)', items: [
          { name: payrollFromBank ? '강사 급여 (신한 계좌 송금·실데이터)' : '강사 급여 (직접인건비)', amount: -payrollEff },
          ...(payroll > 0 && ax.teacherPayout > 0
            ? [{ name: `※ 계좌의 강사급여 송금 ₩${ax.teacherPayout.toLocaleString('ko-KR')} 은 급여명세와 중복이라 제외`, sub: true }] : []),
          { name: 'PG 결제 수수료', amount: -pgFee },
          { name: '매출원가 합계', amount: -(payrollEff + pgFee), total: true },
        ]},
        { title: 'III. 매출총이익 (Gross Profit)', items: [
          { name: '매출 - 매출원가', amount: grossProfit, highlight: true },
        ]},
        { title: 'IV. 판매비와 관리비 (SG&A)', items: hasActual ? [
          // 실데이터 — 법인카드 + 계좌 출금 (신한 연동)
          ...(cardSpend > 0 ? [{ name: '법인카드 지출 (신한·실데이터)', amount: -cardSpend }] : []),
          ...bankOpexRows.map(b => ({ name: `계좌 출금 — ${b.category} (신한·실데이터)`, amount: -(Number(b.total) || 0) })),
          ...(bankDup > 0 ? [{ name: `※ 계좌 출금 중 급여이체·카드대금 ₩${bankDup.toLocaleString('ko-KR')} 은 강사급여·법인카드 항목과 중복이라 제외`, sub: true }] : []),
          { name: '판관비 합계', amount: -opCost, total: true },
        ] : [
          { name: '운영비 (서버·임대·기타, 추정 10%)', amount: -opCost },
          { name: '판관비 합계', amount: -opCost, total: true },
        ]},
        { title: 'V. 영업이익 (Operating Income)', items: [
          { name: '매출총이익 - 판관비', amount: operatingProfit, highlight: true },
        ]},
        { title: 'VI. 세금 등 (Taxes)', items: [
          { name: '부가세 등 (추정)', amount: -tax },
        ]},
        { title: 'VII. 당기순이익 (Net Income)', items: [
          { name: '최종 순이익', amount: netIncome, highlight: true, big: true },
        ]},
      ],
      summary: { revenue: rev.revenue, cost: totalCost, net: netIncome, margin_pct: rev.revenue>0?Number(((netIncome/rev.revenue)*100).toFixed(2)):0,
        // 운영비 출처 — actual = 신한 실지출(카드+계좌), estimated = 매출 10% 추정
        opex_source: hasActual ? 'actual' : 'estimated', card_spend: cardSpend, bank_opex: bankOpex, bank_dup_excluded: bankDup,
        seed_excluded_krw: seedEx.amount, seed_excluded_count: seedEx.count },
    };
  }
  else if (type === 'bs') {
    // 재무상태표 (Balance Sheet) — 단순화된 추정
    const cash = Math.round(rev.revenue * 0.7);             // 현금성 자산 (매출의 70%)
    const receivable = Math.round(rev.revenue * 0.15);      // 미수금 (학생 미납)
    const fixed = 50000000;                                 // 고정자산 (장비·집기) 추정
    const totalAssets = cash + receivable + fixed;
    const payable = payrollEff;                             // 미지급 (강사급여 — 급여명세 없으면 계좌 송금)
    const taxPayable = tax;                                 // 미지급 세금
    const totalLiabilities = payable + taxPayable;
    const equity = totalAssets - totalLiabilities;
    data = {
      ok: true, type: 'bs', period, label: `재무상태표 (BS) — ${label} 말 기준`,
      sections: [
        { title: 'I. 자산 (Assets)', items: [
          { name: '1. 유동자산', sub: true },
          { name: '  현금 및 현금성자산', amount: cash },
          { name: '  미수금 (학생 미납)', amount: receivable },
          { name: '2. 비유동자산', sub: true },
          { name: '  유형자산 (장비·집기 추정)', amount: fixed },
          { name: '자산 총계', amount: totalAssets, total: true, highlight: true },
        ]},
        { title: 'II. 부채 (Liabilities)', items: [
          { name: '1. 유동부채', sub: true },
          { name: '  미지급금 (강사급여)', amount: payable },
          { name: '  미지급 세금', amount: taxPayable },
          { name: '부채 총계', amount: totalLiabilities, total: true, highlight: true },
        ]},
        { title: 'III. 자본 (Equity)', items: [
          { name: '자본금 + 이익잉여금', amount: equity, highlight: true, big: true },
        ]},
        { title: 'IV. 부채 + 자본', items: [
          { name: '합계 (= 자산 총계와 일치)', amount: totalLiabilities + equity, total: true },
        ]},
      ],
      summary: { assets: totalAssets, liabilities: totalLiabilities, equity },
    };
  }
  else if (type === 'cf') {
    // 현금흐름표 (Cash Flow Statement)
    const operatingIn = rev.revenue;
    const operatingOut = payrollEff + opCost + pgFee + tax + ax.refunds;
    const operatingNet = operatingIn - operatingOut;
    const investingNet = -Math.round(rev.revenue * 0.02);   // 투자활동 (장비) 추정
    const financingNet = 0;                                 // 차입/상환 추정
    const netCashChange = operatingNet + investingNet + financingNet;
    data = {
      ok: true, type: 'cf', period, label: `현금흐름표 (CF) — ${label}`,
      sections: [
        { title: 'I. 영업활동 현금흐름 (Operating)', items: [
          { name: '학생 결제 수금', amount: operatingIn },
          { name: '강사 급여 지급', amount: -payrollEff },
          ...(ax.refunds > 0 ? [{ name: '학생 환불 지급 (신한·실데이터)', amount: -ax.refunds }] : []),
          { name: '운영비 지급', amount: -opCost },
          { name: 'PG 수수료 지급', amount: -pgFee },
          { name: '세금 지급', amount: -tax },
          { name: '영업활동 순현금흐름', amount: operatingNet, total: true, highlight: true },
        ]},
        { title: 'II. 투자활동 현금흐름 (Investing)', items: [
          { name: '장비 구매 (추정)', amount: investingNet },
          { name: '투자활동 순현금흐름', amount: investingNet, total: true, highlight: true },
        ]},
        { title: 'III. 재무활동 현금흐름 (Financing)', items: [
          { name: '차입/상환', amount: financingNet },
          { name: '재무활동 순현금흐름', amount: financingNet, total: true, highlight: true },
        ]},
        { title: 'IV. 현금 순증감', items: [
          { name: '당기 현금 변동', amount: netCashChange, highlight: true, big: true },
        ]},
      ],
      summary: { operating: operatingNet, investing: investingNet, financing: financingNet, net_change: netCashChange },
    };
  }
  else if (type === 'tb') {
    // 시산표 (Trial Balance) — 간소화 버전
    const cash = Math.round(rev.revenue * 0.7);
    const receivable = Math.round(rev.revenue * 0.15);
    const fixed = 50000000;
    data = {
      ok: true, type: 'tb', period, label: `시산표 (Trial Balance) — ${label}`,
      sections: [{
        title: '계정과목별 잔액',
        items: [
          { name: '현금', amount: cash, debit: true },
          { name: '매출채권', amount: receivable, debit: true },
          { name: '유형자산', amount: fixed, debit: true },
          { name: '미지급금', amount: payrollEff, credit: true },
          { name: '미지급세금', amount: tax, credit: true },
          { name: '매출', amount: rev.revenue, credit: true },
          { name: '인건비', amount: payrollEff, debit: true },
          { name: '지급수수료', amount: pgFee, debit: true },
          { name: '운영비', amount: opCost, debit: true },
          { name: '세금과공과', amount: tax, debit: true },
        ],
      }],
      summary: {
        debit_total: cash + receivable + fixed + payrollEff + pgFee + opCost + tax,
        credit_total: payrollEff + tax + rev.revenue,
      },
    };
  }
  else {
    return err('unknown type: ' + type + ' (use pl|bs|cf|tb)');
  }

  if (fmt === 'csv') {
    const rows: (string | number)[][] = [
      [data.label],
      [],
    ];
    for (const sec of data.sections) {
      rows.push([sec.title]);
      for (const item of sec.items) {
        if (item.debit !== undefined || item.credit !== undefined) {
          rows.push([item.name, item.debit ? item.amount : '', item.credit ? item.amount : '']);
        } else {
          rows.push([item.name, item.amount ?? '']);
        }
      }
      rows.push([]);
    }
    return csv(`statement-${type}-${period}.csv`, rows);
  }
  return json(data);
}


// ────────────────────────────────────────────────────────────────────
// 8) 세무 (부가세·세금계산서·현금영수증·원천세)
// ────────────────────────────────────────────────────────────────────
async function taxReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();
  const kind = (url.searchParams.get('kind') || 'vat').toLowerCase();
  const { startMs, endMs, label } = monthRange(period);

  const rev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS total, COUNT(*) AS cnt
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ total: number; cnt: number }>();
    return r || { total: 0, cnt: 0 };
  }, { total: 0, cnt: 0 });

  // 부가세 = 매출의 10% (부가세 포함 금액에서 1/11)
  const vat = Math.round(rev.total / 11);
  const supply = rev.total - vat;

  const payroll = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS p, COUNT(*) AS cnt FROM payslips WHERE period=?`)
      .bind(period).first<{ p: number; cnt: number }>();
    return r || { p: 0, cnt: 0 };
  }, { p: 0, cnt: 0 });

  // 원천세 = 강사 인건비의 3.3% (사업소득)
  const withholding = Math.round(payroll.p * 0.033);

  const rows = [
    { kind: '매출 (공급가액)', supply, vat, total: rev.total, count: rev.cnt },
    { kind: '매출 부가세 (10%)', supply: 0, vat, total: vat, count: rev.cnt },
    { kind: '강사 인건비 (지급액)', supply: payroll.p, vat: 0, total: payroll.p, count: payroll.cnt },
    { kind: '원천징수 (3.3%)', supply: 0, vat: 0, total: withholding, count: payroll.cnt },
  ];

  const data = { ok: true, type: 'tax', kind, period, label,
    summary: { revenue: rev.total, supply, vat, withholding, net_vat_payable: vat },
    rows,
  };
  if (fmt === 'csv') {
    return csv(`tax-${period}.csv`, [
      ['망고아이 세무 자료', label],
      [],
      ['구분', '공급가액', '부가세', '합계', '건수'],
      ...rows.map(r => [r.kind, r.supply, r.vat, r.total, r.count]),
      [],
      ['납부할 부가세 (개략)', vat],
      ['원천징수 신고분', withholding],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 9) 회계 전표 / 분개장
// ────────────────────────────────────────────────────────────────────
async function journalReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const from = url.searchParams.get('from'); // YYYY-MM-DD
  const to   = url.searchParams.get('to');
  const period = url.searchParams.get('period') || currentMonth();

  // student_payments 와 payslips 에서 자동 분개 (실제 journal_entries 테이블이 비어있을 가능성 높음)
  const startMs = from ? new Date(from + 'T00:00:00+09:00').getTime()
                        : monthRange(period).startMs;
  const endMs   = to   ? new Date(to   + 'T23:59:59+09:00').getTime()
                        : monthRange(period).endMs;

  const pays = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT id, paid_at, user_id, amount_krw, method, memo
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
      ORDER BY paid_at DESC LIMIT 200
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<any>;
  }, []);

  const slips = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT id, teacher_id, period, payment_krw FROM payslips
      WHERE period=? ORDER BY payment_krw DESC LIMIT 200
    `).bind(period).first ? await env.DB.prepare(`
      SELECT id, teacher_id, period, payment_krw FROM payslips
      WHERE period=? ORDER BY payment_krw DESC LIMIT 200
    `).bind(period).all() : { results: [] };
    return (r.results || []) as Array<any>;
  }, []);

  // 자동 분개 생성
  const entries: any[] = [];
  let docNo = 1;
  for (const p of pays) {
    const date = new Date((p.paid_at || 0) + 9 * 3600 * 1000).toISOString().slice(0, 10);
    entries.push({
      doc_no: 'J-' + String(docNo++).padStart(4, '0'),
      date,
      desc: `학생 결제 (${p.user_id || ''})`,
      debit_account: '현금',
      credit_account: '매출',
      amount: p.amount_krw,
      ref: `pay#${p.id}`,
    });
  }
  for (const s of slips) {
    entries.push({
      doc_no: 'J-' + String(docNo++).padStart(4, '0'),
      date: period + '-25',
      desc: `강사 급여 지급 (${s.teacher_id || ''})`,
      debit_account: '인건비',
      credit_account: '미지급금',
      amount: s.payment_krw,
      ref: `slip#${s.id}`,
    });
  }
  entries.sort((a, b) => (b.date + b.doc_no).localeCompare(a.date + a.doc_no));

  const totals = entries.reduce((a, e) => ({ debit: a.debit + e.amount, credit: a.credit + e.amount }), { debit: 0, credit: 0 });

  const data = { ok: true, type: 'journal', period, label: `회계 전표 / 분개장 — ${period}`, entries, totals };

  if (fmt === 'csv') {
    return csv(`journal-${period}.csv`, [
      ['망고아이 회계 전표 / 분개장', period],
      [],
      ['전표번호', '일자', '적요', '차변', '대변', '금액', '참조'],
      ...entries.map(e => [e.doc_no, e.date, e.desc, e.debit_account, e.credit_account, e.amount, e.ref]),
      ['합계', '', '', '', '', totals.debit, ''],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 10) 미수금 / 미지급금 / 미정산
// ────────────────────────────────────────────────────────────────────
async function receivablesReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const kind = (url.searchParams.get('kind') || 'receivable').toLowerCase();
  // receivable: 학생 미납 / payable: 강사 미지급 / pending: 가맹점 미정산
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  let rows: any[] = [];
  let label = '';
  if (kind === 'receivable') {
    // 학생 만료 임박 + 미납 (status IN ('정상','활동','active') 인데 end_date 가 지났거나, pending 결제)
    rows = await safe(async () => {
      const r = await env.DB.prepare(`
        SELECT user_id, korean_name, end_date,
               (julianday(?) - julianday(end_date)) AS days_overdue
        FROM students_erp
        WHERE status IN ('정상','활동','active') AND end_date IS NOT NULL AND end_date < ?
        ORDER BY days_overdue DESC LIMIT 200
      `).bind(todayKst, todayKst).all();
      return ((r.results || []) as Array<any>).map(s => ({
        target: s.korean_name || s.user_id,
        target_id: s.user_id,
        issued: s.end_date,
        amount: 0, // 실제 미납 금액은 enrollments.monthly_fee_krw 또는 별도 테이블 필요
        days: Math.floor(s.days_overdue || 0),
        note: '수강 만료 후 미연장',
      }));
    }, []);
    label = '학생 미수금 (수강 만료 후 미연장)';
  } else if (kind === 'payable') {
    // 강사 미지급 (payslips 에서 paid=0 인 것)
    rows = await safe(async () => {
      const r = await env.DB.prepare(`
        SELECT p.teacher_id, COALESCE(t.name, p.teacher_id) AS name, p.period, p.payment_krw
        FROM payslips p LEFT JOIN teachers t ON t.id = p.teacher_id
        WHERE COALESCE(p.paid, 0) = 0
        ORDER BY p.period DESC, p.payment_krw DESC LIMIT 200
      `).all();
      return ((r.results || []) as Array<any>).map(s => {
        const issued = s.period + '-25';
        const days = Math.floor((Date.parse(todayKst) - Date.parse(issued)) / 86400000);
        return {
          target: s.name || s.teacher_id,
          target_id: s.teacher_id,
          issued,
          amount: s.payment_krw,
          days: Math.max(0, days),
          note: `${s.period} 강사 급여 미지급`,
        };
      });
    }, []);
    label = '강사 미지급금 (payslips.paid=0)';
  } else if (kind === 'pending') {
    // 가맹점 미정산 — franchises 목록 + 매출 분배 추정
    rows = await safe(async () => {
      const r = await env.DB.prepare(`SELECT id, name FROM franchises WHERE active=1 LIMIT 50`).all();
      return ((r.results || []) as Array<any>).map(f => ({
        target: f.name,
        target_id: 'F#' + f.id,
        issued: currentMonth() + '-15',
        amount: 0,
        days: 0,
        note: '월별 정산 대기',
      }));
    }, []);
    label = '가맹점 미정산';
  }

  const totals = rows.reduce((a, r) => ({ count: a.count + 1, amount: a.amount + (r.amount || 0) }), { count: 0, amount: 0 });
  const data = { ok: true, type: 'receivables', kind, label, rows, totals };

  if (fmt === 'csv') {
    return csv(`receivables-${kind}.csv`, [
      [label],
      [],
      ['대상', '발생일', '금액', '경과일', '사유'],
      ...rows.map(r => [r.target, r.issued, r.amount, r.days, r.note]),
      ['합계', '', totals.amount, '', `${totals.count}건`],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 11) 학생 결제 내역 조회
// ────────────────────────────────────────────────────────────────────
async function paymentsList(env: Env, url: URL, fmt: string): Promise<Response> {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const method = url.searchParams.get('method');
  const status = url.searchParams.get('status');
  // 💳 (2026-08-12 수정요청 #03) B2B/B2C 구분 — 결제 행엔 구분값이 없어서
  //    학생(students_erp.shop_name) → 대리점(centers.payment_type) 으로 파생한다.
  //    대리점에 지정이 없으면 학생의 payment_type('B2B 결제'류), 그마저 없으면 B2C(기본값).
  const channel = String(url.searchParams.get('channel') || '').trim().toUpperCase();
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

  // 🌱 시드 결제는 목록에서도 뺀다 — 합계(리포트)와 목록이 다르면 대사(對査)가 안 된다
  const where: string[] = ['1=1', notSeedSql('p')];
  const args: unknown[] = [];
  if (from) { where.push('p.paid_at >= ?'); args.push(new Date(from + 'T00:00:00+09:00').getTime()); }
  if (to)   { where.push('p.paid_at < ?');  args.push(new Date(to   + 'T23:59:59+09:00').getTime()); }
  if (method) { where.push('p.method = ?'); args.push(method); }
  if (status) { where.push('p.status = ?'); args.push(status); }

  const rows = await safe(async () => {
    // centers 이름이 유일하지 않을 수 있어 JOIN 대신 스칼라 서브쿼리(행 뻥튀기 방지)
    const chExpr = `CASE WHEN UPPER(COALESCE(
        (SELECT c.payment_type FROM centers c WHERE c.name = s.shop_name AND c.payment_type IS NOT NULL ORDER BY c.id LIMIT 1),
        CASE WHEN s.payment_type LIKE 'B2B%' THEN 'B2B' ELSE '' END
      )) = 'B2B' THEN 'B2B' ELSE 'B2C' END`;
    const chFilter = (channel === 'B2B' || channel === 'B2C') ? ` AND channel = ?` : '';
    const binds = (channel === 'B2B' || channel === 'B2C') ? [...args, channel, limit] : [...args, limit];
    try {
      const r = await env.DB.prepare(`
        SELECT * FROM (
          SELECT p.id, p.paid_at, p.user_id, p.amount_krw, p.method, p.memo, p.status,
                 s.shop_name AS shop_name, ${chExpr} AS channel
          FROM student_payments p
          LEFT JOIN students_erp s ON s.user_id = p.user_id
          WHERE ${where.join(' AND ')}
        ) WHERE 1=1${chFilter}
        ORDER BY paid_at DESC LIMIT ?
      `).bind(...binds).all();
      return (r.results || []) as Array<any>;
    } catch {
      // centers·students_erp 가 아직 없는 새 환경 — 구분 없이 예전 그대로의 목록이라도 준다
      const r = await env.DB.prepare(`
        SELECT p.id, p.paid_at, p.user_id, p.amount_krw, p.method, p.memo, p.status
        FROM student_payments p
        WHERE ${where.join(' AND ')}
        ORDER BY p.paid_at DESC LIMIT ?
      `).bind(...args, limit).all();
      return (r.results || []) as Array<any>;
    }
  }, []);

  const totals = rows.reduce((a, r) => ({
    count: a.count + 1,
    paid: a.paid + (r.status === 'paid' ? r.amount_krw : 0),
  }), { count: 0, paid: 0 });

  const data = { ok: true, type: 'payments-list', rows, totals };
  if (fmt === 'csv') {
    return csv('payments.csv', [
      ['망고아이 학생 결제 내역' + (channel === 'B2B' || channel === 'B2C' ? ` (${channel})` : '')],
      [],
      ['시각(KST)', '주문ID', '학생ID', '구분', '가맹점', '금액', '결제수단', '메모', '상태'],
      ...rows.map(r => [
        new Date((r.paid_at || 0) + 9*3600*1000).toISOString().slice(0,19).replace('T',' '),
        r.id, r.user_id, r.channel || '', r.shop_name || '', r.amount_krw, r.method || '', r.memo || '', r.status,
      ]),
      ['합계', '', '', '', '', totals.paid, '', '', `${totals.count}건`],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 12) 환불 / 취소 조회
// ────────────────────────────────────────────────────────────────────
async function refundsList(env: Env, url: URL, fmt: string): Promise<Response> {
  // student_payments 에서 status != 'paid' 인 것을 환불/취소로 간주
  const status = url.searchParams.get('status') || '';

  const where: string[] = ["status IN ('refunded','cancelled','failed','pending')", notSeedSql()];
  if (status) { where.push('status = ?'); }
  const stmt = env.DB.prepare(`
    SELECT id, paid_at, user_id, amount_krw, method, memo, status
    FROM student_payments WHERE ${where.join(' AND ')}
    ORDER BY paid_at DESC LIMIT 200
  `);
  const rows = await safe(async () => {
    const r = status ? await stmt.bind(status).all() : await stmt.all();
    return (r.results || []) as Array<any>;
  }, []);

  const data = { ok: true, type: 'refunds-list', rows, count: rows.length };
  if (fmt === 'csv') {
    return csv('refunds.csv', [
      ['망고아이 환불/취소 내역'],
      [],
      ['시각', '주문ID', '학생ID', '금액', '상태', '메모'],
      ...rows.map(r => [
        new Date((r.paid_at || 0) + 9*3600*1000).toISOString().slice(0,19).replace('T',' '),
        r.id, r.user_id, r.amount_krw, r.status, r.memo || '',
      ]),
    ]);
  }
  return json(data);
}

/* ────────────────────────────────────────────────────────────────────
   13) 🔍 매출–입금 대사 (장부 vs 통장)   GET /api/admin/reports/reconcile

   [왜 만들었나] 2026-08 실제로 겪은 일 — 장부 매출이 통장 입금보다 8,100만 많았고
   (시연용 시드 결제가 섞여 있었다) 아무도 몰랐다. 「매출이 잡히는데 이상하다」는
   감을 숫자로 바로 확인할 수 있어야 재발을 막는다.

   [읽는 법]
     · 예상 입금 = 장부 매출 × (1 − PG 수수료 3.3%)
     · 카드 결제는 PG(케이씨피)가 며칠 뒤 정산해 넣어 주므로 **월 단위로는 어긋나는
       것이 정상**이다. 그래서 «누적 합계» 줄을 함께 준다 — 시차는 누적에서 상쇄된다.
       판정도 누적을 기준으로 본다.
     · 기타 입금(국세 환급·타행 이체 등)은 수업료가 아니라서 «참고» 로만 보여 준다.
   ⚠️ 계좌 연동(바로빌) 이전 달은 입금 데이터 자체가 없다 → 판정하지 않고
      «입금자료 없음» 으로 표시한다(0원을 «미입금» 으로 오해하면 안 된다). */
const PG_FEE_RATE = 0.033;
async function reconcileReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const months = Math.max(1, Math.min(24, parseInt(url.searchParams.get('months') || '6', 10)));
  const endMonth = /^\d{4}-\d{2}$/.test(String(url.searchParams.get('end') || '')) ? String(url.searchParams.get('end')) : currentMonth();
  const [ey, em] = endMonth.split('-').map(Number);

  // 조회 구간 = endMonth 포함 최근 months 개월
  const list: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    list.push(d.toISOString().slice(0, 7));
  }
  const startMs = monthRange(list[0]).startMs;
  const endMs = monthRange(list[list.length - 1]).endMs;

  // 장부 매출(시드 제외) — KST 월로 묶는다
  const revRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT substr(date(paid_at/1000,'unixepoch','+9 hours'),1,7) AS ym,
             COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS cnt
      FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
      GROUP BY ym
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<{ ym: string; revenue: number; cnt: number }>;
  }, []);

  // 통장 입금 — PG(케이씨피)와 그 외를 나눈다
  const depRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT substr(trans_at,1,7) AS ym,
             COALESCE(SUM(CASE WHEN remark LIKE '%케이씨피%' THEN amount ELSE 0 END),0) AS pg,
             COALESCE(SUM(CASE WHEN remark NOT LIKE '%케이씨피%' THEN amount ELSE 0 END),0) AS other
      FROM bankacct_transactions WHERE kind='in' GROUP BY ym
    `).all();
    return (r.results || []) as Array<{ ym: string; pg: number; other: number }>;
  }, []);
  // 계좌 데이터가 언제부터 있는지 — 그 전 달은 «판정 불가»
  const bankFrom = await safe(async () => {
    const r = await env.DB.prepare(`SELECT MIN(substr(trans_at,1,7)) AS m FROM bankacct_transactions`).first<{ m: string }>();
    return r?.m || '';
  }, '');

  const revMap = new Map(revRows.map(r => [r.ym, r]));
  const depMap = new Map(depRows.map(r => [r.ym, r]));

  let cumRev = 0, cumPg = 0;
  const rows = list.map(ym => {
    const rv = revMap.get(ym);
    const dp = depMap.get(ym);
    const revenue = Number(rv?.revenue) || 0;
    const pg = Number(dp?.pg) || 0;
    const other = Number(dp?.other) || 0;
    const expected = Math.round(revenue * (1 - PG_FEE_RATE));
    const hasBank = !!bankFrom && ym >= bankFrom;
    cumRev += revenue; cumPg += pg;
    return {
      period: ym, revenue, pay_count: Number(rv?.cnt) || 0,
      expected, deposit_pg: pg, deposit_other: other,
      diff: hasBank ? pg - expected : null,
      has_bank: hasBank,
    };
  });

  // 판정은 «누적» 기준 — 월별 어긋남은 PG 정산 시차라 정상이다
  const cumExpected = Math.round(cumRev * (1 - PG_FEE_RATE));
  const cumDiff = cumPg - cumExpected;
  const cumPct = cumExpected > 0 ? (cumDiff / cumExpected) * 100 : 0;
  const bankMonths = rows.filter(r => r.has_bank).length;
  let verdict: 'ok' | 'warn' | 'alert' | 'no_data';
  if (!bankFrom || bankMonths === 0) verdict = 'no_data';
  else if (Math.abs(cumPct) <= 10) verdict = 'ok';
  else if (Math.abs(cumPct) <= 25) verdict = 'warn';
  else verdict = 'alert';

  const MSG: Record<typeof verdict, string> = {
    ok: '장부와 통장이 맞습니다(누적 오차 10% 이내 — PG 정산 시차 범위).',
    warn: '누적 차이가 10%를 넘습니다. 정산 시차인지, 실제로 안 들어온 돈인지 KCP 정산내역을 확인하세요.',
    alert: '누적 차이가 25%를 넘습니다. 장부에만 있는 매출이거나 미수금일 수 있습니다 — 확인이 필요합니다.',
    no_data: '계좌 연동 이전 기간이라 입금 자료가 없습니다. 「신한 동기화」 후 다시 보세요.',
  };

  const data = {
    ok: true, type: 'reconcile', months, end: endMonth,
    label: `매출–입금 대사 — ${list[0]} ~ ${list[list.length - 1]}`,
    pg_fee_rate: PG_FEE_RATE, bank_data_from: bankFrom || null,
    rows,
    totals: { revenue: cumRev, expected: cumExpected, deposit_pg: cumPg, diff: cumDiff, diff_pct: Number(cumPct.toFixed(1)) },
    verdict, message: MSG[verdict],
  };

  if (fmt === 'csv') {
    return csv(`reconcile-${endMonth}.csv`, [
      ['망고아이 매출–입금 대사', data.label],
      [`PG 수수료 가정 ${(PG_FEE_RATE * 100).toFixed(1)}%`],
      [],
      ['월', '장부 매출', '결제건수', '예상 입금(수수료 차감)', '실제 PG 입금', '차이', '기타 입금(참고)'],
      ...rows.map(r => [r.period, r.revenue, r.pay_count, r.expected, r.has_bank ? r.deposit_pg : '(자료없음)',
        r.diff == null ? '-' : r.diff, r.deposit_other]),
      ['누적 합계', cumRev, '', cumExpected, cumPg, cumDiff, ''],
      [],
      ['판정', data.message],
    ]);
  }
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// utils
// ────────────────────────────────────────────────────────────────────
function currentMonth(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // KST
  return d.toISOString().slice(0, 7);
}

function nextSettlementDate(period: string): string {
  // 매월 15일 송금 가정
  const [y, m] = period.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 15));
  return next.toISOString().slice(0, 10);
}
