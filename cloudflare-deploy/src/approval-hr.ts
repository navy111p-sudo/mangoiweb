// ────────────────────────────────────────────────────────────────────────────
// 💼 인사·급여 «월 확정» 결재 — /api/approval 의 hr 분류가 쓰는 조각
//
// 왜 별도 파일인가 (2026-08-17):
//   · api-approval.ts 는 이미 1,200줄이다. 여기에 급여까지 넣으면 읽기 어려워진다.
//   · 급여 표(teacher_payroll_auto·payslips)의 **주인은 api-admin.ts** 다.
//     그 파일은 8,400줄이고 공동작업 충돌 반경이 크다(CLAUDE.md 4-2).
//     그래서 이 파일은 **읽기만** 한다 — 급여를 다시 계산하지도, 급여 표에 쓰지도 않는다.
//
// 설계 원칙 — 「가져와서 보여주기만, 저장은 원래 자리에」
//   결재함이 급여를 «다시 계산» 하면 관리자 화면의 숫자와 어긋나는 날이 반드시 온다.
//   그래서 계산은 기존 getPayrollAuto() 를 **그대로 불러 쓴다**. 같은 함수, 같은 숫자.
//   결재함이 남기는 것은 «누가 언제 그 달을 승인했는가» 하나뿐이다.
//
// 🔑 가장 중요한 성질 — **올리는 사람이 숫자를 타이핑하지 않는다.**
//   달과 종류(급여/평가)만 고르면 금액·인원은 **서버가 읽어서** 채운다.
//   그래서 «올릴 때 숫자를 잘못 적는» 사고가 구조적으로 불가능하다.
//   승인 시점의 숫자는 snapshot 으로 통째로 얼려 둔다 — 나중에 원본이 바뀌어도
//   «그때 무엇을 승인했는지» 가 남는다(감사 기록).
// ────────────────────────────────────────────────────────────────────────────

import { getPayrollAuto } from './api-payroll-auto';

interface HrEnv { DB: D1Database; [k: string]: any }

export type HrKind = 'payroll' | 'evaluation';
export const HR_KINDS: HrKind[] = ['payroll', 'evaluation'];

export function isHrKind(v: any): v is HrKind {
  return HR_KINDS.indexOf(String(v) as HrKind) >= 0;
}

/** 'YYYY-MM' 만 받는다. 이 형식이 아니면 달 잠금이 어긋나므로 입구에서 막는다. */
export function isPeriod(v: any): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));
}
export function splitPeriod(p: string): { year: number; month: number } {
  const [y, m] = String(p).split('-');
  return { year: Number(y), month: Number(m) };
}

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> {
  try { return await fn(); } catch { return fb; }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 달 잠금 — 「이 달은 이미 승인됐다」
 *   ⚠️ 급여 표에 쓰지 않는다. 결재함이 자기 표에만 기록한다.
 *      (payslips.finalized_at 은 api-admin 의 마감 흐름이 쓰는 칸이다 — 건드리면 이중이 된다)
 * ═════════════════════════════════════════════════════════════════════════ */

export async function ensureHrTable(env: HrEnv): Promise<void> {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS approval_period_locks (` +
    `kind TEXT NOT NULL, period TEXT NOT NULL, ` +
    `request_id INTEGER, approved_by TEXT, approved_at INTEGER, ` +
    `snapshot TEXT, ` +
    `PRIMARY KEY (kind, period))`
  );
}

/** 이미 승인된 달인가. 승인됐으면 그 기록을 돌려준다. */
export async function getLock(env: HrEnv, kind: string, period: string): Promise<any | null> {
  return await safe(async () => await env.DB.prepare(
    `SELECT kind, period, request_id, approved_by, approved_at FROM approval_period_locks
      WHERE kind = ? AND period = ? LIMIT 1`
  ).bind(kind, period).first(), null);
}

/**
 * 최종 승인된 순간 달을 잠근다.
 *   ⚠️ 이미 잠겨 있으면 덮어쓰지 않는다 — 먼저 승인한 기록이 정본이다.
 */
export async function lockPeriod(
  env: HrEnv, kind: string, period: string, requestId: number, approvedBy: string, snapshot: any
): Promise<boolean> {
  return await safe(async () => {
    const r = await env.DB.prepare(
      `INSERT INTO approval_period_locks (kind, period, request_id, approved_by, approved_at, snapshot)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, period) DO NOTHING`
    ).bind(kind, period, requestId, approvedBy, Date.now(),
           snapshot ? JSON.stringify(snapshot).slice(0, 20000) : null).run();
    return !!r.meta.changes;
  }, false);
}

/**
 * 🔁 취소 결재가 승인되어 그 달의 확정을 «되돌린다».
 *   ⛔ 아무 잠금이나 지우지 않는다 — **그 결재가 건 잠금일 때만**(request_id 일치).
 *      사람이 따로 확정한 달이나 다른 결재가 건 잠금은 건드리지 않는다.
 *   되돌렸으면 true, 지울 것이 없거나 남의 잠금이면 false.
 */
export async function unlockPeriod(
  env: HrEnv, kind: string, period: string, requestId: number
): Promise<boolean> {
  return await safe(async () => {
    const r = await env.DB.prepare(
      `DELETE FROM approval_period_locks WHERE kind = ? AND period = ? AND request_id = ?`
    ).bind(kind, period, requestId).run();
    return !!r.meta.changes;
  }, false);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 그 달의 숫자 — **서버가 읽는다.** 올리는 사람은 타이핑하지 않는다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface HrSnapshot {
  kind: HrKind;
  period: string;
  /** 화면·알림에 그대로 쓰는 한 줄 */
  title_ko: string;
  title_en: string;
  /** 결재자가 읽을 상세 */
  body_ko: string;
  body_en: string;
  /** 판단에 쓰는 숫자들 (AI 가 만들지 않는다 — 전부 조회 결과다) */
  numbers: Record<string, number | null>;
  /** 사람이 봐야 하는 점 (0명·0원 같은 «아직 안 된 달» 신호) */
  warnings: { ko: string; en: string }[];
}

/** 급여 — 기존 getPayrollAuto 를 그대로 불러 쓴다(같은 함수, 같은 숫자). */
async function payrollSnapshot(env: HrEnv, period: string): Promise<HrSnapshot> {
  const { year, month } = splitPeriod(period);
  const data: any = await safe(async () => await getPayrollAuto(env as any, year, month), null);
  const s = data?.summary || {};
  const teachers = Number(s.teachers || 0);
  const completed = Number(s.total_completed || 0);
  const php = Number(s.total_pay_php || 0);
  const krw = Number(s.total_pay_krw || 0);
  const paid = Number(s.paid_count || 0);

  const warnings: { ko: string; en: string }[] = [];
  if (!teachers) warnings.push({ ko: '이 달에 급여 집계가 없습니다', en: 'No payroll rows for this month' });
  else if (!completed) warnings.push({ ko: '완료 수업이 0회입니다 — 아직 집계 전일 수 있습니다', en: 'Zero completed classes — the month may not be tallied yet' });
  if (teachers && !php) warnings.push({ ko: '지급액 합계가 0원입니다', en: 'Total payout is zero' });
  if (paid) warnings.push({ ko: paid + '명은 이미 지급 완료로 표시돼 있습니다', en: paid + ' teacher(s) are already marked paid' });

  const money = '₱' + php.toLocaleString('en-US') + (krw ? (' (₩' + krw.toLocaleString('en-US') + ')') : '');
  return {
    kind: 'payroll', period,
    title_ko: period + ' 급여 확정',
    title_en: period + ' payroll — confirm',
    body_ko: `강사 ${teachers}명 · 완료 수업 ${completed}회 · 지급액 합계 ${money}\n` +
             `숫자는 관리자 화면의 급여 집계를 그대로 읽은 것입니다(결재함이 다시 계산하지 않습니다).`,
    body_en: `${teachers} teachers · ${completed} completed classes · total ${money}\n` +
             `These figures are read straight from the payroll screen — the approval box does not recompute them.`,
    numbers: { teachers, completed, total_php: php, total_krw: krw, already_paid: paid, php_krw: Number(data?.php_krw || 0) || null },
    warnings,
  };
}

/** 인사평가 — teacher_evaluations 를 읽는다. 점수는 그 표가 정본이다. */
async function evaluationSnapshot(env: HrEnv, period: string): Promise<HrSnapshot> {
  const { year, month } = splitPeriod(period);
  const agg: any = await safe(async () => await env.DB.prepare(
    `SELECT COUNT(*) AS n, AVG(weighted_total) AS avg_total,
            SUM(CASE WHEN weighted_total IS NULL THEN 1 ELSE 0 END) AS no_score
       FROM teacher_evaluations WHERE year = ? AND month = ?`
  ).bind(year, month).first(), null);

  const n = Number(agg?.n || 0);
  const avg = agg?.avg_total != null ? Math.round(Number(agg.avg_total) * 10) / 10 : null;
  const noScore = Number(agg?.no_score || 0);

  // 등급 분포 — 몇 명이 어느 등급인지가 «판단 재료» 다.
  const gr = await safe(async () => (await env.DB.prepare(
    `SELECT IFNULL(grade,'(없음)') AS g, COUNT(*) AS c FROM teacher_evaluations
      WHERE year = ? AND month = ? GROUP BY g ORDER BY c DESC LIMIT 8`
  ).bind(year, month).all<any>()).results || [], [] as any[]);
  const dist = gr.map((r: any) => r.g + ' ' + r.c).join(' · ');

  const warnings: { ko: string; en: string }[] = [];
  if (!n) warnings.push({ ko: '이 달에 작성된 인사평가가 없습니다', en: 'No evaluations recorded for this month' });
  if (noScore) warnings.push({ ko: noScore + '명은 점수가 비어 있습니다', en: noScore + ' teacher(s) have no score' });

  return {
    kind: 'evaluation', period,
    title_ko: period + ' 인사평가 확정',
    title_en: period + ' teacher evaluations — confirm',
    body_ko: `평가 ${n}명` + (avg != null ? ` · 평균 ${avg}점` : '') + (dist ? `\n등급 분포: ${dist}` : '') +
             `\n점수는 인사평가 화면에 저장된 값을 그대로 읽은 것입니다.`,
    body_en: `${n} evaluated` + (avg != null ? ` · average ${avg}` : '') + (dist ? `\nGrades: ${dist}` : '') +
             `\nScores are read straight from the evaluation screen.`,
    numbers: { evaluated: n, avg_total: avg, missing_score: noScore },
    warnings,
  };
}

export async function buildHrSnapshot(env: HrEnv, kind: HrKind, period: string): Promise<HrSnapshot> {
  return kind === 'payroll' ? await payrollSnapshot(env, period) : await evaluationSnapshot(env, period);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 고를 수 있는 달 — 화면이 버튼으로 그린다(타이핑 없음)
 *
 *   ⚠️ 데이터가 있는 달만 내려보낸다. 비어 있는 달까지 보여 주면
 *      «아무것도 없는 달을 확정» 하는 사고가 난다.
 *      (실제로 teacher_payroll_auto 에는 2027·2028·2030 처럼 수업 0회짜리 행이 있다)
 * ═════════════════════════════════════════════════════════════════════════ */

export async function listHrPeriods(env: HrEnv): Promise<any> {
  await ensureHrTable(env);

  const pay = await safe(async () => (await env.DB.prepare(
    `SELECT year, month, COUNT(*) AS teachers, SUM(completed_classes) AS completed, SUM(pay_php) AS php
       FROM teacher_payroll_auto GROUP BY year, month
      HAVING SUM(completed_classes) > 0
      ORDER BY year DESC, month DESC LIMIT 12`
  ).all<any>()).results || [], [] as any[]);

  const ev = await safe(async () => (await env.DB.prepare(
    `SELECT year, month, COUNT(*) AS n FROM teacher_evaluations
      GROUP BY year, month HAVING COUNT(*) > 0
      ORDER BY year DESC, month DESC LIMIT 12`
  ).all<any>()).results || [], [] as any[]);

  const locks = await safe(async () => (await env.DB.prepare(
    `SELECT kind, period, approved_by, approved_at FROM approval_period_locks LIMIT 200`
  ).all<any>()).results || [], [] as any[]);
  const lockOf = (kind: string, period: string) =>
    locks.find((l: any) => String(l.kind) === kind && String(l.period) === period) || null;

  const pad = (m: number) => (m < 10 ? '0' : '') + m;
  const mk = (kind: string) => (r: any) => {
    const period = r.year + '-' + pad(Number(r.month));
    const l = lockOf(kind, period);
    return {
      period,
      label: r.year + '년 ' + Number(r.month) + '월',
      approved: !!l,
      approved_by: l?.approved_by || null,
      approved_at: l?.approved_at || null,
      // 버튼에 곁들일 한 줄 — 사람이 «어느 달인지» 알아보게
      hint: kind === 'payroll'
        ? (Number(r.teachers || 0) + '명 · ₱' + Number(r.php || 0).toLocaleString('en-US'))
        : (Number(r.n || 0) + '명 평가'),
    };
  };

  return { payroll: pay.map(mk('payroll')), evaluation: ev.map(mk('evaluation')) };
}
