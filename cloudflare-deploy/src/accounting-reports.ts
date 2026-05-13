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

// 월(YYYY-MM)을 KST 기준 startMs / endMs (Unix seconds) 로 변환
function monthRange(period: string): { startSec: number; endSec: number; label: string } {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error('invalid period (YYYY-MM)');
  const start = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000);
  const end = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000);
  return {
    startSec: Math.floor(start.getTime() / 1000),
    endSec: Math.floor(end.getTime() / 1000),
    label: `${y}년 ${m}월`,
  };
}

function quarterRange(year: number, q: number) {
  const startMonth = (q - 1) * 3 + 1;
  const months = [0, 1, 2].map(i => `${year}-${String(startMonth + i).padStart(2, '0')}`);
  return { months, label: `${year}년 ${q}분기` };
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
  const { startSec, endSec, label } = monthRange(period);

  // 매출 + 결제 건수
  const rev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT
        COALESCE(SUM(amount_krw), 0) AS revenue,
        COUNT(*) AS pay_count,
        COUNT(DISTINCT user_id) AS paying_users
      FROM student_payments
      WHERE status='paid' AND paid_at >= ? AND paid_at < ?
    `).bind(startSec, endSec).first<{ revenue: number; pay_count: number; paying_users: number }>();
    return r || { revenue: 0, pay_count: 0, paying_users: 0 };
  }, { revenue: 0, pay_count: 0, paying_users: 0 });

  // 결제수단별 분포
  const byMethod = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(method,'기타') AS method,
             COUNT(*) AS cnt,
             COALESCE(SUM(amount_krw),0) AS total
      FROM student_payments
      WHERE status='paid' AND paid_at >= ? AND paid_at < ?
      GROUP BY method ORDER BY total DESC
    `).bind(startSec, endSec).all();
    return (r.results || []) as Array<{ method: string; cnt: number; total: number }>;
  }, []);

  // 신규 학생 / 만료 학생
  const stuMv = await safe(async () => {
    const yyyymm = period;
    const r = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM students_erp WHERE substr(COALESCE(signup_date,''),1,7) = ?) AS new_signups,
        (SELECT COUNT(*) FROM students_erp WHERE substr(COALESCE(end_date,''),1,7) = ?) AS expirations,
        (SELECT COUNT(*) FROM students_erp WHERE status='정상') AS active_total
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

  // 추정 비용
  const pgFee = Math.round(rev.revenue * 0.033);  // PG 수수료 약 3.3%
  const opCost = Math.round(rev.revenue * 0.10);  // 운영비 추정 10% (서버·인건비·임대료)
  const totalCost = payroll.total + pgFee + opCost;
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
    },
    cost: {
      teacher_payroll: payroll.total,
      teacher_count: payroll.teachers,
      pg_fee: pgFee,
      op_cost: opCost,
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
      ['강사 급여', payroll.total],
      ['PG 수수료(추정 3.3%)', pgFee],
      ['운영비(추정 10%)', opCost],
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
    const { startSec, endSec } = monthRange(period);
    const r = await safe(async () => {
      const x = await env.DB.prepare(`
        SELECT COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS pays
        FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?
      `).bind(startSec, endSec).first<{ revenue: number; pays: number }>();
      return x || { revenue: 0, pays: 0 };
    }, { revenue: 0, pays: 0 });
    const payroll = await safe(async () => {
      const x = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS p FROM payslips WHERE period=?`)
        .bind(period).first<{ p: number }>();
      return x?.p || 0;
    }, 0);
    const cost = payroll + Math.round(r.revenue * 0.133); // PG 3.3% + 운영 10%
    return { period, revenue: r.revenue, pays: r.pays, payroll, cost, net: r.revenue - cost };
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
    const { startSec, endSec } = monthRange(period);
    const r = await safe(async () => {
      const x = await env.DB.prepare(`
        SELECT COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS pays
        FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?
      `).bind(startSec, endSec).first<{ revenue: number; pays: number }>();
      return x || { revenue: 0, pays: 0 };
    }, { revenue: 0, pays: 0 });
    const payroll = await safe(async () => {
      const x = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS p FROM payslips WHERE period=?`)
        .bind(period).first<{ p: number }>();
      return x?.p || 0;
    }, 0);
    const cost = payroll + Math.round(r.revenue * 0.133);
    return { period, revenue: r.revenue, pays: r.pays, payroll, cost, net: r.revenue - cost };
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
  const { startSec, endSec, label } = monthRange(period);
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
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?
    `).bind(startSec, endSec).first<{ revenue: number }>();
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
  const { startSec, endSec, label } = monthRange(period);

  // 매출
  const rev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue,
             COUNT(DISTINCT user_id) AS paying_users
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?
    `).bind(startSec, endSec).first<{ revenue: number; paying_users: number }>();
    return r || { revenue: 0, paying_users: 0 };
  }, { revenue: 0, paying_users: 0 });

  // 활성 학생
  const active = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS c FROM students_erp WHERE status='정상'`).first<{ c: number }>();
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
        FROM student_payments WHERE status='paid' GROUP BY user_id
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
      FROM student_payments WHERE paid_at>=? AND paid_at<?
    `).bind(startSec, endSec).first<{ ok_cnt: number; all_cnt: number }>();
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
  const cost = payroll + Math.round(rev.revenue * 0.133);
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
  const { startSec, endSec, label } = monthRange(period);

  // 공통: 매출, 강사급여 (모든 재무제표의 핵심 입력)
  const rev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue,
             COUNT(*) AS pay_count
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?
    `).bind(startSec, endSec).first<{ revenue: number; pay_count: number }>();
    return r || { revenue: 0, pay_count: 0 };
  }, { revenue: 0, pay_count: 0 });

  const payroll = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(payment_krw),0) AS total
      FROM payslips WHERE period=?
    `).bind(period).first<{ total: number }>();
    return r?.total || 0;
  }, 0);

  // 추정 비용 (실제 운영 회계 데이터가 없으므로 비율 기반 추정)
  const pgFee = Math.round(rev.revenue * 0.033);   // PG 3.3%
  const opCost = Math.round(rev.revenue * 0.10);   // 운영비 10%
  const tax = Math.round(rev.revenue * 0.03);      // 부가세 등 3% 추정
  const totalCost = payroll + pgFee + opCost + tax;
  const netIncome = rev.revenue - totalCost;
  const grossProfit = rev.revenue - payroll - pgFee;
  const operatingProfit = grossProfit - opCost;

  let data: any;

  if (type === 'pl') {
    // 손익계산서 (Income Statement / Profit & Loss)
    data = {
      ok: true, type: 'pl', period, label: `손익계산서 (P&L) — ${label}`,
      sections: [
        { title: 'I. 매출액 (Revenue)', items: [
          { name: '수업료 매출', amount: rev.revenue },
          { name: '매출 합계', amount: rev.revenue, total: true },
        ]},
        { title: 'II. 매출원가 (COGS)', items: [
          { name: '강사 급여 (직접인건비)', amount: -payroll },
          { name: 'PG 결제 수수료', amount: -pgFee },
          { name: '매출원가 합계', amount: -(payroll + pgFee), total: true },
        ]},
        { title: 'III. 매출총이익 (Gross Profit)', items: [
          { name: '매출 - 매출원가', amount: grossProfit, highlight: true },
        ]},
        { title: 'IV. 판매비와 관리비 (SG&A)', items: [
          { name: '운영비 (서버·임대·기타)', amount: -opCost },
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
      summary: { revenue: rev.revenue, cost: totalCost, net: netIncome, margin_pct: rev.revenue>0?Number(((netIncome/rev.revenue)*100).toFixed(2)):0 },
    };
  }
  else if (type === 'bs') {
    // 재무상태표 (Balance Sheet) — 단순화된 추정
    const cash = Math.round(rev.revenue * 0.7);             // 현금성 자산 (매출의 70%)
    const receivable = Math.round(rev.revenue * 0.15);      // 미수금 (학생 미납)
    const fixed = 50000000;                                 // 고정자산 (장비·집기) 추정
    const totalAssets = cash + receivable + fixed;
    const payable = payroll;                                // 미지급 (강사급여)
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
    const operatingOut = payroll + opCost + pgFee + tax;
    const operatingNet = operatingIn - operatingOut;
    const investingNet = -Math.round(rev.revenue * 0.02);   // 투자활동 (장비) 추정
    const financingNet = 0;                                 // 차입/상환 추정
    const netCashChange = operatingNet + investingNet + financingNet;
    data = {
      ok: true, type: 'cf', period, label: `현금흐름표 (CF) — ${label}`,
      sections: [
        { title: 'I. 영업활동 현금흐름 (Operating)', items: [
          { name: '학생 결제 수금', amount: operatingIn },
          { name: '강사 급여 지급', amount: -payroll },
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
          { name: '미지급금', amount: payroll, credit: true },
          { name: '미지급세금', amount: tax, credit: true },
          { name: '매출', amount: rev.revenue, credit: true },
          { name: '인건비', amount: payroll, debit: true },
          { name: '지급수수료', amount: pgFee, debit: true },
          { name: '운영비', amount: opCost, debit: true },
          { name: '세금과공과', amount: tax, debit: true },
        ],
      }],
      summary: {
        debit_total: cash + receivable + fixed + payroll + pgFee + opCost + tax,
        credit_total: payroll + tax + rev.revenue,
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
  const { startSec, endSec, label } = monthRange(period);

  const rev = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS total, COUNT(*) AS cnt
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?
    `).bind(startSec, endSec).first<{ total: number; cnt: number }>();
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
  const startSec = from ? Math.floor(new Date(from + 'T00:00:00+09:00').getTime() / 1000)
                        : monthRange(period).startSec;
  const endSec   = to   ? Math.floor(new Date(to   + 'T23:59:59+09:00').getTime() / 1000)
                        : monthRange(period).endSec;

  const pays = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT id, paid_at, user_id, amount_krw, method, memo
      FROM student_payments WHERE status='paid' AND paid_at>=? AND paid_at<?
      ORDER BY paid_at DESC LIMIT 200
    `).bind(startSec, endSec).all();
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
    const date = new Date((p.paid_at || 0) * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
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
    // 학생 만료 임박 + 미납 (status='정상' 인데 end_date 가 지났거나, pending 결제)
    rows = await safe(async () => {
      const r = await env.DB.prepare(`
        SELECT user_id, korean_name, end_date,
               (julianday(?) - julianday(end_date)) AS days_overdue
        FROM students_erp
        WHERE status='정상' AND end_date IS NOT NULL AND end_date < ?
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
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

  const where: string[] = ['1=1'];
  const args: unknown[] = [];
  if (from) { where.push('paid_at >= ?'); args.push(Math.floor(new Date(from + 'T00:00:00+09:00').getTime() / 1000)); }
  if (to)   { where.push('paid_at < ?');  args.push(Math.floor(new Date(to   + 'T23:59:59+09:00').getTime() / 1000)); }
  if (method) { where.push('method = ?'); args.push(method); }
  if (status) { where.push('status = ?'); args.push(status); }

  const rows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT id, paid_at, user_id, amount_krw, method, memo, status
      FROM student_payments
      WHERE ${where.join(' AND ')}
      ORDER BY paid_at DESC LIMIT ?
    `).bind(...args, limit).all();
    return (r.results || []) as Array<any>;
  }, []);

  const totals = rows.reduce((a, r) => ({
    count: a.count + 1,
    paid: a.paid + (r.status === 'paid' ? r.amount_krw : 0),
  }), { count: 0, paid: 0 });

  const data = { ok: true, type: 'payments-list', rows, totals };
  if (fmt === 'csv') {
    return csv('payments.csv', [
      ['망고아이 학생 결제 내역'],
      [],
      ['시각(KST)', '주문ID', '학생ID', '금액', '결제수단', '메모', '상태'],
      ...rows.map(r => [
        new Date((r.paid_at || 0) * 1000 + 9*3600*1000).toISOString().slice(0,19).replace('T',' '),
        r.id, r.user_id, r.amount_krw, r.method || '', r.memo || '', r.status,
      ]),
      ['합계', '', '', totals.paid, '', '', `${totals.count}건`],
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

  const where: string[] = ["status IN ('refunded','cancelled','failed','pending')"];
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
        new Date((r.paid_at || 0) * 1000 + 9*3600*1000).toISOString().slice(0,19).replace('T',' '),
        r.id, r.user_id, r.amount_krw, r.status, r.memo || '',
      ]),
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
