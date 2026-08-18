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

import { getScope, type Scope } from './scope';
import { xlsxResponse, type Sheet as XlsxSheet } from './xlsx';   // 📊 진짜 엑셀(.xlsx) 내보내기   // 🔒 마감·해제는 본사(hq)만 — 권한 판정은 scope.ts 한 곳에서

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

/* 📊 내보내기 한 곳 — format=csv 면 CSV, format=xlsx 면 진짜 엑셀 파일(2026-08-17).
   같은 rows 를 쓰므로 두 형식의 내용이 어긋날 수 없다. 엑셀은 숫자가 «숫자» 로 들어가
   합계·정렬이 되고, 상세 내역을 시트로 나눠 담을 수 있다(extra). */
const out = (fmt: string, filename: string, rows: (string | number)[][], extra: XlsxSheet[] = []): Response =>
  fmt === 'xlsx'
    ? xlsxResponse(filename.replace(/\.csv$/, '') + '.xlsx', [{ name: '요약', rows }, ...extra])
    : csv(filename, rows);



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

   [검산] 시드를 빼자 «입금보다 매출이 훨씬 많던» 상태가 사라졌다(제외 전 1억 8,088만).
   ⚠️ 이 절에 적혀 있던 «실매출 1억 222만 vs KCP 입금 9,960만 → 3.3% 로 사실상 일치»
      라는 수치는 2026-08-18 재측정과 맞지 않는다. 같은 기준(2026-03~07, 시드 제외,
      「케이씨피」만)으로 다시 재면 장부 6,152만 vs KCP 입금 5,328만 이라 차이가 13%
      대다. 시드 제외의 «효과» 자체는 유효하지만, 남은 차이는 수수료율로 설명되지
      않는다 — 정산 이월·취소환불이 섞인 것으로 보이며 규명은 아직 안 됐다.

   ⛔ 데이터는 «지우지 않는다» — 리포트에서만 뺀다(사장님 지시, 되돌리기 쉬워야 함).
   ⚠️ 진짜 정기결제 청구는 payment_orders 에 기록되고 빌링키가 반드시 있다
      (api-pay.ts chargeSubscriptionOnce). 즉 지금 이 두 메모를 쓰는 «진짜» 결제는
      없다. 나중에 정기결제를 student_payments 에도 적게 만든다면 **메모 문구를
      반드시 다르게** 쓸 것 — 같게 쓰면 진짜 매출이 조용히 빠진다. */
/* 💳 PG(케이씨피) 수수료율 — 대사·손익·월간·분기·연간·KPI 가 이 하나를 공유한다.
   2026-08-17 사장님 확인: **2.86% 가 실제 PG 수수료율**이다. 그 전까지 3.3% 를
   «추정치» 로 쓰고 있었는데, 3.3% 는 강사 원천징수율(사업소득)과 같은 숫자라
   섞여 들어온 것으로 보인다. 결제관리 화면(payments-board.ts)과 정산 분개
   (modules-ext.ts PG_RATE)가 이미 2.86% 를 쓰고 있어 이제 세 곳이 같아졌다.
   ⛔ 아래 2,100행대의 `payroll.p * 0.033` 은 **강사 원천징수세**다. 같은 숫자였다고
      해서 함께 바꾸지 말 것 — 성격이 전혀 다르다.
   ⚠️ 대사가 이 값으로 «맞아떨어지지는» 않는다 — 2026-08-18 실측으로 장부 매출과
      실제 KCP 입금 사이에 13% 안팎의 차이가 남는다(정산 이월·취소환불로 보이며
      아래 [검산] 주석의 옛 수치와도 안 맞는다). 원인 규명은 별건이다. */
const PG_FEE_RATE = 0.0286;

/* 💳 결제수단 표기 통일 (2026-08-16) — 같은 카드 결제인데 'card' 와 '카드' 가 같이 저장돼
   있어 「결제수단별 분포」 표가 두 줄로 쪼개졌다. 원본은 그대로 두고 «보여 줄 때만» 합친다. */
const METHOD_NORM_SQL = `CASE
  WHEN LOWER(COALESCE(method,'')) IN ('card','카드','신용카드','creditcard') THEN '카드'
  WHEN LOWER(COALESCE(method,'')) IN ('kakaopay','카카오페이') THEN '카카오페이'
  WHEN LOWER(COALESCE(method,'')) IN ('bank','transfer','계좌이체','무통장입금') THEN '계좌이체'
  WHEN LOWER(COALESCE(method,'')) IN ('vbank','가상계좌') THEN '가상계좌'
  WHEN COALESCE(method,'')='' THEN '기타'
  ELSE method END`;

/* 🏷️ 숫자의 «출처» — 화면이 이걸로 신뢰도 배지를 그린다(2026-08-16).
     actual    통장·카드·결제 기록에서 그대로 가져온 값
     estimated 계산식으로 만든 값 (참고용)
     none      아직 가져올 데이터가 없는 값
     review    사람이 한 번 확인해 줘야 하는 값 */
export type FigureSource = 'actual' | 'estimated' | 'none' | 'review';

const SEED_MEMOS = ["'[TESTSEED]%'", "'정기결제 자동청구(cron)'"];
/** 시드 결제를 걸러내는 SQL 조건. a = 테이블 별칭(조인 쿼리에서 컬럼 모호성 방지).
    ⚠️ export 다 — 결제관리 화면(payments-board.ts)도 같은 조건을 써야 «리포트에서는
    뺐는데 결제관리에서는 잡히는» 어긋남이 안 생긴다. 복사하지 말고 이걸 부를 것. */
export function notSeedSql(a = ''): string {
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

/* 🧑‍🏫 시연용 더미 급여명세 제외 (2026-08-16) ────────────────────────────────
   [무슨 일이 있었나] 분기 보고서에서 4·5월 강사 급여가 750만으로 «똑같이» 찍히는데
   6월만 1,019만이라 이상하다는 제보. 파 보니 payslips 의 period 있는 24행이
   **전부** teacher_id 101~104 — 강사 원부(teachers, 29명 id 1~29)에 없는 번호이고,
   2025-12~2026-05 여섯 달 내내 금액도 수업분(1,650분)도 완전히 동일했다.
   = 시연용 더미. 즉 **진짜 급여명세는 한 건도 없다.**

   [그래서] 원부에 없는 강사의 급여명세는 회계에서 뺀다. 그러면 강사 급여는
   신한 계좌의 실제 송금(메트로은행 → 강사급여송금)으로 자동 대체된다
   (monthActualOpex.teacherPayout → payrollEff). 진짜 급여명세가 입력되면
   그때부터 그것이 정본이 된다(코드 수정 불필요). */
function realPayslipSql(a = ''): string {
  const q = a ? a + '.' : '';
  return `EXISTS (SELECT 1 FROM teachers t_rp WHERE t_rp.id = ${q}teacher_id)`;
}

/* 💵 그 달의 «통장 기준» 사실 — 장부(결제기록)가 불완전해도 이건 사실이다.
   월간 회계 리포트와 손익계산서가 둘 다 쓴다(규칙이 갈라지면 화면마다 달라진다). */
async function monthCash(env: Env, period: string) {
  const t = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(CASE WHEN kind='in' THEN amount ELSE 0 END),0) AS cin,
             COALESCE(SUM(CASE WHEN kind='out' THEN amount ELSE 0 END),0) AS cout,
             COUNT(*) AS n
      FROM bankacct_transactions WHERE substr(trans_at,1,7)=?
    `).bind(period).first<{ cin: number; cout: number; n: number }>();
    return { cin: Number(r?.cin) || 0, cout: Number(r?.cout) || 0, n: Number(r?.n) || 0 };
  }, { cin: 0, cout: 0, n: 0 });
  /* ⚠️ PG 입금은 `remark LIKE '%케이씨피%'` 로 세면 안 된다 — 내부 이체(다른 자사 계좌에서
     사람이 보낸 돈)까지 잡혀 «매출 누락» 오경보가 난다. 판정은 classifyDeposit() 한 곳에서. */
  const dep = await monthDeposits(env, period);
  /* 💵 «실제 입금» 에서 **자기 계좌 간 자금 이동은 뺀다**(2026-08-18 사장님 지시).
     회사 밖에서 들어온 돈이 아니라 주머니만 바꾼 돈이라, 여기에 섞이면 현금흐름이
     실제보다 좋아 보인다. 뺀 뒤의 cin 으로 순증감(cin-cout)까지 다시 계산된다.
     ⚠️ 원본 합계가 필요하면 cinAll 을 쓸 것(통장 원장과 대조할 때만). */
  const cin = Math.max(0, t.cin - dep.transferKnown);
  return { ...t, cin, cinAll: t.cin, internalIn: dep.transferKnown, pg: dep.pg, b2b: dep.b2b, transfer: dep.transfer };
}
/* 통장 PG 입금이 장부 매출보다 10% 이상(그리고 50만원 이상) 많으면 «매출 누락 의심».
   ⚠️ 처음엔 25% 로 잡았다가 4월(23%)이 안 걸려 «설명 없는 적자» 로 보였다 → 10% 로 낮춤. */
function revenueGapOf(pgIn: number, revenue: number): number {
  return pgIn > 0 && pgIn > revenue * 1.10 && (pgIn - revenue) > 500000 ? pgIn - revenue : 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   🏷️ 「기타출금」 쪼개기 — 계정과목 붙이기 (2026-08-17 신설)

   [무엇이 문제였나] 통장 출금의 상당 부분이 은행 적요만으로는 분류가 안 돼
   「기타출금」 한 덩어리로 뭉쳐 있었다(2026-07 기준 642만원 · 비용의 25%).
   손익계산서에 «기타출금 642만» 한 줄만 뜨면 무엇에 쓴 돈인지 알 수가 없다.

   [사장님 확인 2026-08-17] 이 돈의 대부분은 **지사 수수료** 다.

   [어떻게 판정하나 — 두 단계]
     ① 사람이 지정한 표(expense_payee_category)에 있으면 그대로 쓴다.
     ② 없으면 적요가 franchises.owner_name(지사 대표자명)과 일치하는지 본다.
        일치하면 「지사수수료」. 241개 지사 전부 대표자명이 채워져 있어 잘 맞는다.
        (은행 적요는 길이가 잘려 「김영진(지성교」 처럼 오므로 '(' 앞까지로 비교한다)
     ③ 둘 다 아니면 「기타출금」 그대로 두고 **화면에서 «분류해 주세요» 라고 요구**한다.

   ⛔ 법인 형태 이름((주)…·주식회사…)은 ②로 자동 분류하지 않는다 — 거래처이지 지사가 아니다.
      실제로 (주)새하컴즈·호스트센터(주)·스파크보험료 같은 진짜 다른 비용이 섞여 있다.
   ═══════════════════════════════════════════════════════════════════════════ */
export const EXPENSE_CATEGORIES = [
  '지사수수료', '광고선전비', '지급수수료', '임대·관리비', '공과금·통신', '세금·보험',
  '소모품비', '여비교통비', '차량유지비', '접대비', '도서인쇄비', '금융비용', '기타출금',
];
const UNCLASSIFIED = '기타출금';

async function ensurePayeeTable(env: Env): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS expense_payee_category (payee TEXT PRIMARY KEY, category TEXT NOT NULL, note TEXT, updated_at INTEGER NOT NULL);`);
}

/** 은행 적요에서 비교용 이름만 남긴다. 「김영진(지성교」 → 「김영진」 */
function payeeBase(remark: string): string {
  const s = String(remark || '').trim();
  const i = s.indexOf('(');
  return (i > 0 ? s.slice(0, i) : s).trim();
}

/** 법인 형태로 보이면 지사 대표자 자동판정에서 뺀다. */
function looksCorporate(remark: string): boolean {
  return /\(주\)|（주）|주식회사|\(유\)|유한회사|㈜|센터|보험|카페24/.test(String(remark || ''));
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
  /* 🏷️ 「기타출금」 덩어리를 계정과목으로 쪼갠다. 판정은 위 주석의 ①②③ 순서.
     ⚠️ 저장된 category 를 덮어쓰지 않고 «읽을 때» 다시 나눈다 — 바로빌 동기화(배포
        권한자만 실행)를 기다리지 않고 지정한 것이 바로 반영되게. */
  const split = await safe(async () => {
    const misc = bankAll.find(b => b.category === UNCLASSIFIED);
    if (!misc) return null;
    await ensurePayeeTable(env);
    const rows = await env.DB.prepare(`
      SELECT COALESCE(remark,'') AS remark, amount FROM bankacct_transactions
      WHERE kind='out' AND COALESCE(category,'기타출금')=? AND substr(trans_at,1,7)=?
    `).bind(UNCLASSIFIED, period).all();
    const map = new Map<string, string>();
    const mp = await env.DB.prepare(`SELECT payee, category FROM expense_payee_category`).all();
    for (const r of ((mp.results || []) as Array<{ payee: string; category: string }>)) map.set(r.payee, r.category);
    const owners = new Set<string>();
    const ow = await env.DB.prepare(`SELECT DISTINCT owner_name FROM franchises WHERE COALESCE(owner_name,'') <> ''`).all();
    for (const r of ((ow.results || []) as Array<{ owner_name: string }>)) owners.add(r.owner_name.trim());

    const byCat = new Map<string, number>();
    let unresolved = 0;
    for (const r of ((rows.results || []) as Array<{ remark: string; amount: number }>)) {
      const amt = Number(r.amount) || 0;
      const base = payeeBase(r.remark);
      let cat = map.get(base) || map.get(r.remark.trim());
      if (!cat && base && owners.has(base) && !looksCorporate(r.remark)) cat = '지사수수료';
      if (!cat) { cat = UNCLASSIFIED; unresolved += amt; }
      byCat.set(cat, (byCat.get(cat) || 0) + amt);
    }
    return { byCat, unresolved };
  }, null);

  if (split) {
    // 기타출금 한 줄을 쪼갠 결과로 갈아 끼운다(합계는 그대로)
    const idx = bankAll.findIndex(b => b.category === UNCLASSIFIED);
    if (idx >= 0) bankAll.splice(idx, 1);
    for (const [cat, total] of split.byCat) bankAll.push({ category: cat, total });
    bankAll.sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
  }

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

/* ═══════════════════════════════════════════════════════════════════════════
   🏦 통장 «입금» 의 성격 판정 (2026-08-16 신설)

   [무엇이 틀렸었나] 대사(reconcile)와 월간 리포트가 PG 정산 입금을
   `remark LIKE '%케이씨피%'` 로 찾고 있었다. 그런데 신한 계좌의 입금 적요에는
   비슷하게 생긴 **두 가지**가 있다(바로빌 원본 raw 로 확인):
     · 「케이씨피」   TransType=타행PC · TransOffice=(기업) · 매주 월요일 자동
                    → 이것이 진짜 KCP 카드 정산금이다.
     · 「케이씨피M」  TransType=타행IB · TransOffice=(하나) · 사람이 인터넷뱅킹으로 송금
                    → 금액이 5,000,000 처럼 딱 떨어지고, 이체한도 때문에 같은 시각에
                      두 건으로 쪼개 들어온다. **PG 정산금이 아니다.**
   LIKE 가 둘 다 잡는 바람에 2026-03~07 누적 4,632만원이 «PG 입금» 으로 잡혔고,
   대사가 «장부 매출이 통장보다 4,000만 적다 = 매출 누락» 이라고 오진했다.
   케이씨피(정산분)만 보면 같은 기간 누적 −9.9% 로 **정상 범위**다.
   ⚠️ 「케이씨피M」의 정체(다른 계좌에서 옮긴 운영자금인지, 제휴사 정산금인지)는
      사람만 알 수 있다. 그래서 지우지도 매출로 잡지도 않고 «확인 필요» 로 따로 센다.

   [B2B 직접입금] JW학원·(주)드림키오·어센틱영어처럼 학원이 통장으로 바로 보내는
   수업료는 카페24를 안 거쳐 student_payments 에 없다 — 실제로 확인했다(그 기간
   method='계좌이체' 결제행은 전부 시연용 시드였고 통장 입금과 한 건도 겹치지 않는다).
   이것을 매출로 잡는다(2026-08-16 사장님 지시). 중복 계상 위험 없음.
   ═══════════════════════════════════════════════════════════════════════════ */
export type DepositKind = 'pg' | 'b2b' | 'transfer' | 'other';

/** 계좌 확인용 «1원 입금»(메트로은행) 처럼 매출로 볼 수 없는 소액의 기준 */
const DEPOSIT_MIN_KRW = 1000;

/* 🏦 정체가 «확인된» 내부 자금이체 (2026-08-17 사장님 확인).
   자기 계좌 간에 옮긴 돈이라 매출이 아니고, 확인이 끝났으므로 «확인 필요» 로도 묻지 않는다.
   ⚠️ 2026-08-18 사장님 지시로 **월간 회계 리포트에서는 이 금액을 아예 보여 주지 않는다**
      (매출·현금흐름 어디에도 넣지 않고, 이걸 설명하던 각주도 전부 뺐다 — 혼동만 준다는 판단).
      판정 자체는 남겨 둬야 한다. 이 규칙이 없으면 대사(reconcile)가 다시 «매출 누락» 오진을 한다.
   ⚠️ 「케이씨피」 로 시작하는 **다른** 변형이 새로 나타나면 그건 여전히 확인 대상이다. */
const KNOWN_TRANSFER_RE = /^케이씨피M$/;
export function isKnownTransfer(remark: string): boolean {
  return KNOWN_TRANSFER_RE.test(String(remark || '').trim());
}

/** 입금 한 건의 성격. ⚠️ 저장된 category 를 쓰지 않고 적요에서 매번 판정한다 —
    바로빌 동기화(배포 권한자만 실행)를 기다리지 않고 규칙 개선이 바로 반영되게. */
export function classifyDeposit(remark: string, amount: number): DepositKind {
  const s = String(remark || '').trim();
  if (s === '케이씨피' || s === 'KCP' || s === '케이씨피(주)') return 'pg';
  if (/케이씨피|KCP/i.test(s)) return 'transfer';            // 변형 표기 → PG 정산이 아님
  if (!amount || amount < DEPOSIT_MIN_KRW) return 'other';   // 계좌확인용 1원
  if (/국세|지방세|환급|이자|보험금|정부지원|고용노동부|공단/.test(s)) return 'other';
  if (/^[\d.]+~[\d.]+$/.test(s)) return 'other';             // 기간 표기만 있는 행
  return 'b2b';                                              // 상호·실명 입금 = 수업료로 본다
}

export interface MonthDeposits {
  pg: number; b2b: number; transfer: number; other: number;
  /** transfer 중 정체가 확인된 내부 자금이체(운영자금 보충) */
  transferKnown: number;
  /** transfer 중 아직 확인 안 된 것 — 이것만 «확인 필요» 로 묻는다 */
  transferUnknown: number;
  b2bRows: Array<{ date: string; remark: string; amount: number }>;
  transferRows: Array<{ date: string; remark: string; amount: number; known: boolean }>;
  hasBank: boolean;
}

/** 그 달 통장 입금을 성격별로 나눈 것. 리포트의 매출·대사가 모두 이 하나를 쓴다. */
async function monthDeposits(env: Env, period: string): Promise<MonthDeposits> {
  const rows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT trans_at, COALESCE(remark,'') AS remark, amount
      FROM bankacct_transactions WHERE kind='in' AND substr(trans_at,1,7)=?
      ORDER BY trans_at
    `).bind(period).all();
    return (r.results || []) as Array<{ trans_at: string; remark: string; amount: number }>;
  }, []);
  const out: MonthDeposits = {
    pg: 0, b2b: 0, transfer: 0, other: 0, transferKnown: 0, transferUnknown: 0,
    b2bRows: [], transferRows: [], hasBank: rows.length > 0,
  };
  for (const r of rows) {
    const amount = Number(r.amount) || 0;
    const kind = classifyDeposit(r.remark, amount);
    out[kind] += amount;
    const item = { date: String(r.trans_at || '').slice(0, 10), remark: r.remark, amount };
    if (kind === 'b2b') out.b2bRows.push(item);
    else if (kind === 'transfer') {
      const known = isKnownTransfer(r.remark);
      if (known) out.transferKnown += amount; else out.transferUnknown += amount;
      out.transferRows.push({ ...item, known });
    }
  }
  out.b2bRows.sort((a, b) => b.amount - a.amount);
  out.transferRows.sort((a, b) => b.amount - a.amount);
  return out;
}

/* 💰 그 달 «매출» 의 정본 — 장부 결제 + 통장 B2B 직접입금.
   모든 리포트(월간·분기·연간·KPI·손익계산서)가 이 함수 하나만 쓴다.
   여기를 고치면 전부 같이 고쳐진다(예전엔 6곳에 같은 식이 복사돼 있었다). */
async function monthRevenue(env: Env, period: string) {
  const { startMs, endMs } = monthRange(period);
  const book = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS pay_count,
             COUNT(DISTINCT user_id) AS paying_users
      FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ revenue: number; pay_count: number; paying_users: number }>();
    return r || { revenue: 0, pay_count: 0, paying_users: 0 };
  }, { revenue: 0, pay_count: 0, paying_users: 0 });
  const dep = await monthDeposits(env, period);
  return {
    book: Number(book.revenue) || 0,          // 카페24 등 결제 장부
    b2b: dep.b2b,                              // 통장 직접입금 (신규 반영)
    total: (Number(book.revenue) || 0) + dep.b2b,
    payCount: Number(book.pay_count) || 0,
    payingUsers: Number(book.paying_users) || 0,
    dep,
  };
}

/* 📊 한 달치 손익을 한 곳에서 계산한다. 분기·연간·KPI 가 각자 복사해 쓰던 식을 합쳤다.
   PG 수수료는 «카드로 들어온 장부 매출» 에만 붙인다 — B2B 계좌이체엔 PG 수수료가 없다. */
async function monthPL(env: Env, period: string) {
  const rev = await monthRevenue(env, period);
  const ax = await monthActualOpex(env, period);
  const payroll = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS p, COUNT(*) AS c FROM payslips WHERE period=? AND ${realPayslipSql()}`)
      .bind(period).first<{ p: number; c: number }>();
    return { total: Number(r?.p) || 0, teachers: Number(r?.c) || 0 };
  }, { total: 0, teachers: 0 });
  const payrollEff = payroll.total > 0 ? payroll.total : ax.teacherPayout;
  const pgFee = Math.round(rev.book * PG_FEE_RATE);
  const opCost = ax.hasActual ? ax.actual : Math.round(rev.total * 0.10);
  const cost = payrollEff + pgFee + opCost + ax.refunds;
  return {
    period, rev, ax, payroll, payrollEff, pgFee, opCost, cost,
    net: rev.total - cost,
    margin: rev.total > 0 ? Number((((rev.total - cost) / rev.total) * 100).toFixed(2)) : 0,
    opCostSource: (ax.hasActual ? 'actual' : 'estimated') as 'actual' | 'estimated',
  };
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
    // 🔒 월 마감 — GET 현황 / POST 마감·해제. index.ts 는 이 prefix 를 통째로 넘겨주므로
    //    라우팅·인증게이트를 건드리지 않고 여기서 받는다(금지구역 회피).
    if (p === 'close' || p === 'reopen') return await closeRouter(env, request, url, p);
    // 🏷️ 지출 계정과목 지정 — 한 번 정하면 다음부터 같은 거래처가 자동으로 그 과목에 들어간다
    if (p === 'payees') return await payeesRouter(env, request, url);
    // 🧾 배정 못 한 결제 아이디 — 목록 + 지사 직접 지정
    if (p === 'payers') return await payersRouter(env, request, url);
    return err('not found: ' + p, 404);
  } catch (e: any) {
    return err(e?.message || 'internal error', 500);
  }
}

// ────────────────────────────────────────────────────────────────────
// 1) 월간 회계 리포트
// ────────────────────────────────────────────────────────────────────
/* 📅 월간 리포트의 «살아 있는» 숫자를 만든다. 마감(close)이 이 결과를 그대로 스냅샷으로
   떠서 저장하므로, 리포트와 마감본이 절대 어긋나지 않는다(2026-08-17). */
async function buildMonthly(env: Env, period: string) {
  const { startMs, endMs, label } = monthRange(period);

  // 💰 매출·비용·손익은 monthPL() 한 곳에서 (분기·연간·KPI 와 같은 규칙을 씀)
  const pl = await monthPL(env, period);
  const rev = { revenue: pl.rev.book, pay_count: pl.rev.payCount, paying_users: pl.rev.payingUsers };

  // 결제수단별 분포 — 'card' 와 '카드' 처럼 같은 수단의 표기 흔들림을 한 줄로 합친다(2026-08-16)
  const byMethod = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT ${METHOD_NORM_SQL} AS method,
             COUNT(*) AS cnt,
             COALESCE(SUM(amount_krw),0) AS total
      FROM student_payments
      WHERE status='paid' AND paid_at >= ? AND paid_at < ? AND ${notSeedSql()}
      GROUP BY method ORDER BY total DESC
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<{ method: string; cnt: number; total: number }>;
  }, []);

  /* 👥 학생 수 — «활성 학생» 은 students_erp 의 status 만 보면 29,398명 중 28,672명이
     active 로 나온다(퇴원 처리가 안 된 옛 학생까지 포함). 그 숫자로 ARPU 를 나누면
     학생 1인당 331원 같은 값이 나온다. 그래서 «그 달에 실제로 움직인 학생»
     (수업에 들어왔거나 결제한 학생)을 따로 세어 지표의 분모로 쓴다(2026-08-16). */
  const stuMv = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM students_erp WHERE substr(COALESCE(signup_date,''),1,7) = ?) AS new_signups,
        (SELECT COUNT(*) FROM students_erp WHERE substr(COALESCE(end_date,''),1,7) = ?) AS expirations,
        (SELECT COUNT(*) FROM students_erp WHERE status IN ('정상','활동','active')) AS active_total
    `).bind(period, period).first<{ new_signups: number; expirations: number; active_total: number }>();
    return r || { new_signups: 0, expirations: 0, active_total: 0 };
  }, { new_signups: 0, expirations: 0, active_total: 0 });
  const activeReal = await monthActiveStudents(env, period);

  // 수업 시간 — total_active_ms 가 비어 있는 기록이 많아 «빈 기록 수» 를 같이 알린다
  const classMin = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_active_ms),0)/60000 AS total_min,
             COUNT(*) AS sessions,
             SUM(CASE WHEN COALESCE(total_active_ms,0)=0 THEN 1 ELSE 0 END) AS zero_sessions
      FROM attendance
      WHERE date BETWEEN ? AND ?
    `).bind(period + '-01', period + '-31').first<{ total_min: number; sessions: number; zero_sessions: number }>();
    return r || { total_min: 0, sessions: 0, zero_sessions: 0 };
  }, { total_min: 0, sessions: 0, zero_sessions: 0 });

  const { ax, payroll, payrollEff, pgFee, opCost } = pl;
  const coverage = coverageOf(period, await syncStarts(env));      // 📅 이 달 자료가 온전한가
  const seedEx = await seedRevenueExcluded(env, startMs, endMs);   // 🌱 리포트에서 뺀 시드 매출
  const rec = reconcileMonth(pl.rev.book, pl.rev.dep);             // 🔍 장부 vs 통장 (한 달치)

  /* 💵 통장 기준 «실제» 현금흐름 — 장부(결제기록)가 불완전해도 이건 사실이다.
     «리포트가 적자라는데 회사는 돌아간다» 는 혼란을 없애려고 나란히 보여 준다.
     매출 누락 경고(revenueGapOf)는 **진짜 PG 정산분(케이씨피)만** 과 **장부 결제 매출**을
     비교한다 — 통장 B2B 직접입금은 PG 를 안 거치므로 이 비교에서 빼야 한다(2026-08-16). */
  const cash = await monthCash(env, period);
  const revenueGap = revenueGapOf(pl.rev.dep.pg, pl.rev.book);
  /* 🏦 성격이 «아직 확인 안 된» 입금만 화면에 남긴다 — 확인이 끝난 내부 자금이체는
     매출에도 현금흐름에도 넣지 않고 목록·각주에서도 뺀다(2026-08-18 사장님 지시). */
  const unknownTransferRows = pl.rev.dep.transferRows.filter(r => !r.known);

  // 🔎 드릴다운용 상세 — «합계 → 내역 → 원본 거래» 로 내려갈 수 있게(2026-08-16)
  const cardRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT used_at, COALESCE(merchant,'') AS merchant, amount FROM corpcard_transactions
      WHERE cancelled=0 AND substr(used_at,1,7)=? ORDER BY amount DESC LIMIT 30
    `).bind(period).all();
    return (r.results || []) as Array<{ used_at: string; merchant: string; amount: number }>;
  }, []);
  const unclassifiedRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT trans_at, COALESCE(remark,'') AS remark, amount FROM bankacct_transactions
      WHERE kind='out' AND COALESCE(category,'기타출금')='기타출금' AND substr(trans_at,1,7)=?
      ORDER BY amount DESC LIMIT 30
    `).bind(period).all();
    return (r.results || []) as Array<{ trans_at: string; remark: string; amount: number }>;
  }, []);
  const unclassified = ax.bankRows.find(b => b.category === '기타출금');
  const unclassifiedTotal = Number(unclassified?.total) || 0;

  const data = {
    ok: true,
    type: 'monthly',
    period, label,
    // 🔍 대사 판정 — 화면 맨 위 배너가 이걸 그린다(따로 안 들어가도 보이게)
    reconcile: rec,
    summary: {
      // 💰 매출 = 장부 결제 + 통장 B2B 직접입금 (2026-08-16 사장님 지시로 B2B 반영)
      revenue: pl.rev.total,
      revenue_book: pl.rev.book,
      revenue_b2b: pl.rev.b2b,
      b2b_count: pl.rev.dep.b2bRows.length,
      pay_count: rev.pay_count,
      paying_users: rev.paying_users,
      avg_per_user: rev.paying_users > 0 ? Math.round(pl.rev.total / rev.paying_users) : 0,
      new_signups: stuMv.new_signups,
      expirations: stuMv.expirations,
      // «status=active» 원본값과 «그 달 실제로 움직인 학생» 을 둘 다 준다
      active_students: stuMv.active_total,
      active_real: activeReal.total,
      active_attended: activeReal.attended,
      active_paid: activeReal.paid,
      class_minutes: classMin.total_min,
      class_sessions: classMin.sessions,
      class_zero_sessions: classMin.zero_sessions,
      // 🌱 시연용 시드 결제를 뺀 사실을 «숨기지 않고» 화면에 그대로 알린다
      seed_excluded_krw: seedEx.amount,
      seed_excluded_count: seedEx.count,
      /* 🏦 통장 입금 성격별. ⚠️ 확인이 끝난 내부 자금이체는 **집계에서 완전히 뺀다**
         (2026-08-18 사장님 지시) — 매출도 현금흐름도 아니고, 설명 각주도 남기지 않는다.
         여기서 «확인 필요» 로 남는 것은 아직 성격을 모르는 입금뿐이다. */
      deposit_pg_krw: pl.rev.dep.pg,
      deposit_transfer_krw: pl.rev.dep.transferUnknown,
      deposit_transfer_count: unknownTransferRows.length,
      deposit_transfer_unknown_krw: pl.rev.dep.transferUnknown,
      // 🚨 장부 결제 매출 < PG 정산 입금 → 매출 누락 의심
      revenue_gap_krw: revenueGap,
      // 💵 통장 기준 «실제» 현금흐름 — 자기 계좌 간 자금 이동은 뺀 금액이다
      cash_in_krw: cash.cin,
      cash_out_krw: cash.cout,
      cash_net_krw: cash.cin - cash.cout,
      cash_has_data: cash.n > 0,
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
      op_cost_source: pl.opCostSource,
      op_card: ax.cardSpend,               // 법인카드 지출 합
      op_bank: ax.bankOpex,                // 계좌 출금 합(중복 제외 후)
      op_bank_rows: ax.bankRows,           // 계좌 출금 분류별 [{category,total}]
      bank_dup_excluded: ax.bankDup,       // 급여이체·카드대금 — 중복이라 뺀 금액
      refunds: ax.refunds,                 // 학생 환불 (신한 실데이터)
      unclassified_krw: unclassifiedTotal, // ⚠️ 계정과목이 안 붙은 출금 — 분류가 필요하다
      unclassified_pct: pl.cost > 0 ? Number(((unclassifiedTotal / pl.cost) * 100).toFixed(1)) : 0,
      total: pl.cost,
    },
    // 📅 이 달 자료가 온전한가 — 연동 이전 달은 비용이 없어 «가짜 흑자» 가 된다
    coverage,
    pl: {
      revenue: pl.rev.total,
      cost: pl.cost,
      net_income: pl.net,
      margin_pct: pl.margin,
      /* ⚠️ 순이익을 «확정» 이라고 말할 수 있는 조건 두 가지 —
         ① 장부와 통장이 맞고 ② 그 달 비용 자료가 온전할 것. 둘 중 하나라도 아니면 참고값이다. */
      confident: (rec.verdict === 'ok' || rec.verdict === 'no_data') && coverage.level === 'full',
    },
    // 🏷️ 숫자별 출처 — 화면이 신뢰도 배지를 이걸로 그린다
    sources: {
      revenue_book: 'actual' as FigureSource,
      revenue_b2b: (pl.rev.b2b > 0 ? 'actual' : 'none') as FigureSource,
      teacher_payroll: (payroll.total > 0 || ax.teacherPayout > 0 ? 'actual' : 'none') as FigureSource,
      pg_fee: 'estimated' as FigureSource,
      op_cost: pl.opCostSource,
      unclassified: (unclassifiedTotal > 0 ? 'review' : 'actual') as FigureSource,
      // 확인된 자금이체는 실데이터, 아직 모르는 것만 «확인 필요»
      deposit_transfer: (pl.rev.dep.transferUnknown > 0 ? 'review' : 'actual') as FigureSource,
      active_students: 'review' as FigureSource,
      class_minutes: (classMin.zero_sessions > 0 ? 'review' : 'actual') as FigureSource,
    },
    // 🔎 눌러서 펼쳐 볼 내역
    detail: {
      b2b_rows: pl.rev.dep.b2bRows,
      transfer_rows: unknownTransferRows,
      card_rows: cardRows.map(c => ({ date: String(c.used_at || '').slice(0, 10), name: c.merchant, amount: Number(c.amount) || 0 })),
      unclassified_rows: unclassifiedRows.map(u => ({ date: String(u.trans_at || '').slice(0, 10), name: u.remark, amount: Number(u.amount) || 0 })),
    },
    by_method: byMethod,
  };

  const csvRows: (string | number)[][] = [
      ['망고아이 월간 회계 리포트', label],
      ['대사 판정', rec.message],
      ['자료 상태', COVERAGE_LABEL[coverage.level] + ' — ' + coverage.note],
      [],
      ['[매출]'],
      ['장부 결제(카페24 등)', pl.rev.book],
      ['통장 직접입금(B2B)', pl.rev.b2b],
      ['매출 합계', pl.rev.total],
      ['결제 건수', rev.pay_count],
      ['결제 학생수', rev.paying_users],
      ['평균 결제액', data.summary.avg_per_user],
      ['신규 가입', stuMv.new_signups],
      ['만료', stuMv.expirations],
      ['그 달 실제 활동 학생수', activeReal.total],
      ['(참고) status=active 학생수', stuMv.active_total],
      ['수업 분', classMin.total_min],
      ['세션 수', classMin.sessions],
      ...(classMin.zero_sessions > 0 ? [[`(주의) 수업시간이 0으로 저장된 기록`, classMin.zero_sessions] as (string | number)[]] : []),
      [],
      ['[비용]'],
      [payroll.total > 0 ? '강사 급여' : '강사 급여(신한 송금 실데이터)', payrollEff],
      [`PG 수수료(${(PG_FEE_RATE * 100).toFixed(2)}%)`, pgFee],
      ...(ax.hasActual
        ? [['법인카드 지출(신한 실데이터)', ax.cardSpend] as (string | number)[],
           ...ax.bankRows.map(b => [`계좌 출금 — ${b.category}(신한 실데이터)`, Number(b.total) || 0] as (string | number)[]),
           ...(ax.bankDup > 0 ? [[`(제외) 계좌 출금 급여이체·카드대금 — 강사급여·카드와 중복`, ax.bankDup] as (string | number)[]] : [])]
        : [['운영비(추정 10%)', opCost] as (string | number)[]]),
      ...(ax.refunds > 0 ? [['학생 환불(신한 실데이터)', ax.refunds] as (string | number)[]] : []),
      ...(unclassifiedTotal > 0 ? [[`(확인 필요) 계정과목 미분류 출금 — 비용의 ${data.cost.unclassified_pct}%`, unclassifiedTotal] as (string | number)[]] : []),
      ['비용 합계', pl.cost],
      [],
      ['[손익]'],
      ['매출', pl.rev.total],
      ['비용', pl.cost],
      ['순이익', pl.net],
      ['이익률(%)', pl.margin],
      ...(data.pl.confident ? [] : [['(주의) 장부와 통장이 어긋나 순이익이 확정치가 아닙니다'] as (string | number)[]]),
      [],
      ['[장부 vs 통장]'],
      ['장부 매출', rec.revenue],
      ['예상 입금(수수료 차감)', rec.expected],
      ['실제 PG 정산 입금', rec.deposit_pg],
      ['차이', rec.diff == null ? '(자료없음)' : rec.diff],
      ...(pl.rev.dep.transferUnknown > 0 ? [[`(확인 필요) 성격이 확인되지 않은 입금`, pl.rev.dep.transferUnknown] as (string | number)[]] : []),
      [],
      ['[통장 직접입금 상세]'],
      ['일자', '보낸 곳', '금액'],
      ...pl.rev.dep.b2bRows.map(b => [b.date, b.remark, b.amount]),
      [],
      ['[결제수단별]'],
      ['수단', '건수', '금액'],
      ...byMethod.map(m => [m.method, m.cnt, m.total]),
  ];
  return { data, csvRows };
}

/* ═══════════════════════════════════════════════════════════════════════════
   🔒 월 마감 (2026-08-17 신설)

   [왜 필요한가] 지금까지 리포트는 버튼을 누르는 순간 데이터베이스를 새로 훑어
   계산했다. 그래서 뒤늦게 결제가 동기화되거나 카드 내역이 들어오면 **이미 세무사에게
   보낸 7월 숫자가 조용히 바뀌었다.** 회계에서 이걸 막는 장치가 «마감» 이다.

   [어떻게 동작하나]
     · 마감하면 그 달 월간 리포트를 **통째로 스냅샷** 으로 저장한다(JSON 전문).
     · 그 뒤 리포트를 열면 «마감본» 이 정본이다. 살아 있는 숫자는 함께 계산해
       **달라진 것이 있으면 알려 준다** — 조용히 바뀌지 않게 하는 것이 목적이지,
       나중에 들어온 자료를 숨기려는 것이 아니다.
     · 해제(reopen)하면 다시 살아 있는 숫자로 돌아간다. 누가 언제 왜 했는지 남는다.

   [막는 것]
     · 아직 끝나지 않은 달은 마감할 수 없다(다음 달 1일부터 가능).
     · «확인 필요» 가 남아 있으면 기본적으로 거부한다 — 정말 그대로 마감하려면
       force=1 을 줘야 하고, 그 사실이 마감 기록에 남는다.
     · 본사(hq) 계정만 마감·해제할 수 있다.
   ═══════════════════════════════════════════════════════════════════════════ */
async function ensureCloseTables(env: Env): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS accounting_close (period TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'closed', snapshot TEXT NOT NULL, revenue INTEGER NOT NULL DEFAULT 0, cost INTEGER NOT NULL DEFAULT 0, net INTEGER NOT NULL DEFAULT 0, margin_pct REAL NOT NULL DEFAULT 0, warnings TEXT, forced INTEGER NOT NULL DEFAULT 0, closed_at INTEGER NOT NULL, closed_by TEXT, reopened_at INTEGER, reopened_by TEXT, reopen_reason TEXT);`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS accounting_close_log (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT NOT NULL, action TEXT NOT NULL, actor TEXT, reason TEXT, revenue INTEGER, cost INTEGER, net INTEGER, at INTEGER NOT NULL);`);
}

interface CloseRow {
  period: string; status: string; snapshot: string;
  revenue: number; cost: number; net: number; margin_pct: number;
  warnings: string | null; forced: number;
  closed_at: number; closed_by: string | null;
  reopened_at: number | null; reopened_by: string | null; reopen_reason: string | null;
}

async function closeRecord(env: Env, period: string): Promise<CloseRow | null> {
  return await safe(async () => {
    await ensureCloseTables(env);
    return await env.DB.prepare(`SELECT * FROM accounting_close WHERE period=? AND status='closed'`)
      .bind(period).first<CloseRow>();
  }, null);
}

/** 마감을 막을 만한 «확인 필요» 목록. 비어 있으면 깨끗하게 마감할 수 있다. */
function closeWarnings(data: any): string[] {
  const w: string[] = [];
  const rec = data?.reconcile, s = data?.summary, c = data?.cost;
  if (rec && (rec.verdict === 'warn' || rec.verdict === 'alert')) w.push(`장부와 통장이 어긋납니다 — ${rec.message}`);
  // ✅ 정체가 확인된 내부 자금이체(「케이씨피M」)는 더 이상 묻지 않는다. 모르는 것만 묻는다.
  if ((s?.deposit_transfer_unknown_krw || 0) > 0) w.push(`성격이 확인되지 않은 입금이 ₩${Number(s.deposit_transfer_unknown_krw).toLocaleString('ko-KR')} 있습니다 — 매출인지 자금이동인지 확인해 주세요.`);
  if ((c?.unclassified_krw || 0) > 0) w.push(`계정과목이 안 붙은 출금이 ₩${Number(c.unclassified_krw).toLocaleString('ko-KR')} 있습니다(비용의 ${c.unclassified_pct}%).`);
  if (c?.op_cost_source === 'estimated') w.push('운영비가 실지출이 아니라 «매출의 10%» 추정입니다.');
  return w;
}

/** 스냅샷과 지금 숫자가 달라졌는지 — 마감 후 들어온 자료를 «조용히» 넘기지 않기 위해. */
function closeDrift(snap: any, live: any) {
  const f = (o: any) => ({ revenue: o?.pl?.revenue || 0, cost: o?.pl?.cost || 0, net: o?.pl?.net_income || 0 });
  const a = f(snap), b = f(live);
  const changed = a.revenue !== b.revenue || a.cost !== b.cost || a.net !== b.net;
  return {
    changed,
    revenue_diff: b.revenue - a.revenue,
    cost_diff: b.cost - a.cost,
    net_diff: b.net - a.net,
    message: changed
      ? `마감한 뒤에 자료가 더 들어왔습니다 — 지금 계산하면 매출 ${(b.revenue - a.revenue).toLocaleString('ko-KR')}원, 비용 ${(b.cost - a.cost).toLocaleString('ko-KR')}원 차이가 납니다. 아래 숫자는 «마감본» 이며, 반영하려면 마감을 해제하고 다시 마감하세요.`
      : '마감한 뒤로 달라진 자료가 없습니다.',
  };
}

async function closeRouter(env: Env, request: Request, url: URL, p: string): Promise<Response> {
  await ensureCloseTables(env);
  const method = request.method.toUpperCase();
  const period = url.searchParams.get('period') || currentMonth();
  if (!/^\d{4}-\d{2}$/.test(period)) return err('invalid period (YYYY-MM)');

  // 📋 현황 조회 — 연도를 주면 12개월 현황, 아니면 그 달 하나
  if (p === 'close' && method === 'GET') {
    const year = url.searchParams.get('year');
    if (year) {
      const rows = await safe(async () => {
        const r = await env.DB.prepare(
          `SELECT period, status, revenue, cost, net, margin_pct, forced, closed_at, closed_by
             FROM accounting_close WHERE substr(period,1,4)=? ORDER BY period`
        ).bind(year).all();
        return (r.results || []) as Array<any>;
      }, []);
      return json({ ok: true, type: 'close-list', year, rows });
    }
    const row = await closeRecord(env, period);
    const log = await safe(async () => {
      const r = await env.DB.prepare(`SELECT action, actor, reason, at FROM accounting_close_log WHERE period=? ORDER BY at DESC LIMIT 20`).bind(period).all();
      return (r.results || []) as Array<any>;
    }, []);
    if (!row) {
      const built = await buildMonthly(env, period);
      return json({
        ok: true, type: 'close', period, closed: false,
        closable: period < currentMonth(),
        closable_reason: period < currentMonth() ? '' : '아직 끝나지 않은 달이라 마감할 수 없습니다. 다음 달 1일부터 가능합니다.',
        warnings: closeWarnings(built.data),
        preview: built.data.pl, log,
      });
    }
    const snap = JSON.parse(row.snapshot);
    const live = (await buildMonthly(env, period)).data;
    return json({
      ok: true, type: 'close', period, closed: true,
      closed_at: row.closed_at, closed_by: row.closed_by, forced: !!row.forced,
      warnings: JSON.parse(row.warnings || '[]'),
      snapshot_pl: snap.pl, drift: closeDrift(snap, live), log,
    });
  }

  // 🔒 마감
  if (p === 'close' && method === 'POST') {
    const scope = await safe(async () => await getScope(env, request), { type: 'none', value: null, label: '권한 없음' } as Scope);
    if (scope.type !== 'hq') return err('마감은 본사 계정만 할 수 있습니다.', 403);
    if (period >= currentMonth()) return err('아직 끝나지 않은 달은 마감할 수 없습니다. 다음 달 1일부터 가능합니다.', 409);
    const already = await closeRecord(env, period);
    if (already) return err(`${period} 는 이미 마감돼 있습니다. 다시 마감하려면 먼저 마감을 해제하세요.`, 409);

    const built = await buildMonthly(env, period);
    const warnings = closeWarnings(built.data);
    const force = url.searchParams.get('force') === '1';
    if (warnings.length && !force) {
      return json({ ok: false, needs_force: true, period, warnings,
        error: '확인이 필요한 항목이 남아 있습니다. 그대로 마감하려면 «확인했습니다» 를 눌러 주세요.' }, 409);
    }

    const now = Date.now();
    const actor = scope.label || 'admin';
    const pl = built.data.pl;
    const ok = await safe(async () => {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO accounting_close (period, status, snapshot, revenue, cost, net, margin_pct, warnings, forced, closed_at, closed_by)
                        VALUES (?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(period) DO UPDATE SET status='closed', snapshot=excluded.snapshot,
                          revenue=excluded.revenue, cost=excluded.cost, net=excluded.net, margin_pct=excluded.margin_pct,
                          warnings=excluded.warnings, forced=excluded.forced, closed_at=excluded.closed_at, closed_by=excluded.closed_by,
                          reopened_at=NULL, reopened_by=NULL, reopen_reason=NULL`)
          .bind(period, JSON.stringify(built.data), pl.revenue, pl.cost, pl.net_income, pl.margin_pct,
                JSON.stringify(warnings), force && warnings.length ? 1 : 0, now, actor),
        env.DB.prepare(`INSERT INTO accounting_close_log (period, action, actor, reason, revenue, cost, net, at) VALUES (?, 'close', ?, ?, ?, ?, ?, ?)`)
          .bind(period, actor, warnings.length ? `확인 필요 ${warnings.length}건을 알고도 마감` : '', pl.revenue, pl.cost, pl.net_income, now),
      ]);
      return true;
    }, false);
    if (!ok) return err('마감 저장에 실패했습니다.', 500);
    return json({ ok: true, period, closed_at: now, closed_by: actor, warnings, forced: force && warnings.length > 0 });
  }

  // 🔓 마감 해제
  if (p === 'reopen' && method === 'POST') {
    const scope = await safe(async () => await getScope(env, request), { type: 'none', value: null, label: '권한 없음' } as Scope);
    if (scope.type !== 'hq') return err('마감 해제는 본사 계정만 할 수 있습니다.', 403);
    const reason = (url.searchParams.get('reason') || '').trim();
    if (!reason) return err('해제 사유를 적어 주세요. (기록에 남습니다)');
    const row = await closeRecord(env, period);
    if (!row) return err(`${period} 는 마감돼 있지 않습니다.`, 409);
    const now = Date.now();
    const actor = scope.label || 'admin';
    const ok = await safe(async () => {
      await env.DB.batch([
        env.DB.prepare(`UPDATE accounting_close SET status='reopened', reopened_at=?, reopened_by=?, reopen_reason=? WHERE period=?`)
          .bind(now, actor, reason, period),
        env.DB.prepare(`INSERT INTO accounting_close_log (period, action, actor, reason, revenue, cost, net, at) VALUES (?, 'reopen', ?, ?, ?, ?, ?, ?)`)
          .bind(period, actor, reason, row.revenue, row.cost, row.net, now),
      ]);
      return true;
    }, false);
    if (!ok) return err('마감 해제에 실패했습니다.', 500);
    return json({ ok: true, period, reopened_at: now, reopened_by: actor, reason });
  }

  return err('not found: ' + p, 404);
}

/* 🏷️ GET  /api/admin/reports/payees[?months=6]  아직 분류 안 된 거래처 + 지금 지정된 규칙
   POST /api/admin/reports/payees?payee=..&category=..  지정(«기타출금» 을 주면 지정 해제)
   한 번 정하면 그 거래처의 과거·미래 출금이 전부 그 과목으로 들어간다. */
async function payeesRouter(env: Env, request: Request, url: URL): Promise<Response> {
  await ensurePayeeTable(env);
  const method = request.method.toUpperCase();

  if (method === 'POST') {
    const scope = await safe(async () => await getScope(env, request), { type: 'none', value: null, label: '권한 없음' } as Scope);
    if (scope.type !== 'hq') return err('계정과목 지정은 본사 계정만 할 수 있습니다.', 403);
    const payee = (url.searchParams.get('payee') || '').trim();
    const category = (url.searchParams.get('category') || '').trim();
    if (!payee) return err('거래처(payee)를 지정해 주세요.');
    if (!EXPENSE_CATEGORIES.includes(category)) return err(`계정과목이 목록에 없습니다: ${category}`);
    const okSet = await safe(async () => {
      if (category === UNCLASSIFIED) {
        await env.DB.prepare(`DELETE FROM expense_payee_category WHERE payee=?`).bind(payee).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO expense_payee_category (payee, category, note, updated_at) VALUES (?,?,?,?)
           ON CONFLICT(payee) DO UPDATE SET category=excluded.category, updated_at=excluded.updated_at`
        ).bind(payee, category, scope.label || 'admin', Date.now()).run();
      }
      return true;
    }, false);
    if (!okSet) return err('저장에 실패했습니다.', 500);
    return json({ ok: true, payee, category });
  }

  // GET — 최근 N개월의 «아직 분류 안 된» 거래처를 금액 큰 순으로
  const months = Math.max(1, Math.min(24, parseInt(url.searchParams.get('months') || '6', 10)));
  const since = (() => {
    const [y, m] = currentMonth().split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - (months - 1), 1));
    return d.toISOString().slice(0, 7);
  })();

  const rules = await safe(async () => {
    const r = await env.DB.prepare(`SELECT payee, category, updated_at FROM expense_payee_category ORDER BY category, payee`).all();
    return (r.results || []) as Array<{ payee: string; category: string; updated_at: number }>;
  }, []);
  const ruleMap = new Map(rules.map(r => [r.payee, r.category]));

  const owners = await safe(async () => {
    const r = await env.DB.prepare(`SELECT DISTINCT owner_name FROM franchises WHERE COALESCE(owner_name,'') <> ''`).all();
    return new Set(((r.results || []) as Array<{ owner_name: string }>).map(x => x.owner_name.trim()));
  }, new Set<string>());

  const rows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(remark,'') AS remark, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total,
             MIN(substr(trans_at,1,10)) AS first_at, MAX(substr(trans_at,1,10)) AS last_at
      FROM bankacct_transactions
      WHERE kind='out' AND COALESCE(category,'기타출금')=? AND substr(trans_at,1,7)>=?
      GROUP BY remark ORDER BY total DESC LIMIT 200
    `).bind(UNCLASSIFIED, since).all();
    return (r.results || []) as Array<{ remark: string; cnt: number; total: number; first_at: string; last_at: string }>;
  }, []);

  const items = rows.map(r => {
    const base = payeeBase(r.remark);
    const rule = ruleMap.get(base) || ruleMap.get(r.remark.trim()) || null;
    const auto = !rule && base && owners.has(base) && !looksCorporate(r.remark) ? '지사수수료' : null;
    return {
      payee: base, remark: r.remark, count: r.cnt, amount: r.total,
      first_at: r.first_at, last_at: r.last_at,
      category: rule || auto || null,
      source: rule ? 'rule' : (auto ? 'auto(지사 대표자명 일치)' : null),
      corporate: looksCorporate(r.remark),
    };
  });
  const unresolved = items.filter(i => !i.category);

  return json({
    ok: true, type: 'payees', since, months,
    categories: EXPENSE_CATEGORIES,
    rules,
    items,
    unresolved_count: unresolved.length,
    unresolved_krw: unresolved.reduce((a, i) => a + (Number(i.amount) || 0), 0),
    note: '한 번 정하면 그 거래처의 지난 출금과 앞으로의 출금이 전부 그 과목으로 들어갑니다. 「기타출금」을 고르면 지정을 지웁니다.',
  });
}

/* 🧾 GET  /api/admin/reports/payers[?months=12]  아직 소속이 안 붙은 결제 아이디 + 지사 목록
   POST /api/admin/reports/payers?payer=..&franchise_id=..  그 아이디를 지사에 직접 붙인다
        (franchise_id=0 이면 지정 해제)
   대리점이 원생 수강료를 자기 계정으로 결제하면 그 아이디는 학생 원부에 없어 소속을
   알 수 없다. 캐피타운 대리점 표에 등록하는 것이 근본이지만, 급하면 여기서 바로 붙인다. */
async function payersRouter(env: Env, request: Request, url: URL): Promise<Response> {
  try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS payer_franchise_override (payer_user_id TEXT PRIMARY KEY, franchise_id INTEGER NOT NULL, note TEXT, updated_at INTEGER NOT NULL);`); } catch {}
  const method = request.method.toUpperCase();

  if (method === 'POST') {
    const scope = await safe(async () => await getScope(env, request), { type: 'none', value: null, label: '권한 없음' } as Scope);
    if (scope.type !== 'hq') return err('결제 아이디 지정은 본사 계정만 할 수 있습니다.', 403);
    const payer = (url.searchParams.get('payer') || '').trim();
    const fid = Number(url.searchParams.get('franchise_id'));
    if (!payer) return err('결제 아이디를 지정해 주세요.');
    const okSet = await safe(async () => {
      if (!fid) {
        await env.DB.prepare(`DELETE FROM payer_franchise_override WHERE payer_user_id=?`).bind(payer).run();
      } else {
        const f = await env.DB.prepare(`SELECT id, name FROM franchises WHERE id=?`).bind(fid).first<{ id: number; name: string }>();
        if (!f) throw new Error('그런 지사가 없습니다: ' + fid);
        await env.DB.prepare(
          `INSERT INTO payer_franchise_override (payer_user_id, franchise_id, note, updated_at) VALUES (?,?,?,?)
           ON CONFLICT(payer_user_id) DO UPDATE SET franchise_id=excluded.franchise_id, note=excluded.note, updated_at=excluded.updated_at`
        ).bind(payer, fid, `${scope.label || 'admin'} 지정`, Date.now()).run();
      }
      return true;
    }, false);
    if (!okSet) return err('저장에 실패했습니다.', 500);
    return json({ ok: true, payer, franchise_id: fid || null });
  }

  // GET — 최근 N개월 중 아직 소속이 안 붙은 결제 아이디
  const months = Math.max(1, Math.min(36, parseInt(url.searchParams.get('months') || '12', 10)));
  const [cy, cm] = currentMonth().split('-').map(Number);
  const sinceMs = monthRange(new Date(Date.UTC(cy, cm - 1 - (months - 1), 1)).toISOString().slice(0, 7)).startMs;

  const rows = await safe(async () => {
    const r = await env.DB.prepare(`
      WITH fmap AS (SELECT name, MIN(id) AS fid, COUNT(*) AS nf FROM franchises WHERE COALESCE(name,'') <> '' GROUP BY name),
      cmap AS (SELECT name, MIN(franchise_id) AS fid, COUNT(DISTINCT franchise_id) AS nf
                 FROM centers WHERE franchise_id IS NOT NULL AND COALESCE(name,'') <> '' GROUP BY name)
      SELECT p.user_id, COUNT(*) AS pays, COALESCE(SUM(p.amount_krw),0) AS amount,
             COUNT(DISTINCT substr(date(p.paid_at/1000,'unixepoch','+9 hours'),1,7)) AS months,
             MIN(date(p.paid_at/1000,'unixepoch','+9 hours')) AS first_at,
             MAX(date(p.paid_at/1000,'unixepoch','+9 hours')) AS last_at,
             CASE WHEN MAX(st.user_id) IS NULL THEN '학생 원부에 없는 아이디' ELSE '소속 라벨 없음' END AS reason
        FROM student_payments p
        LEFT JOIN students_erp st ON st.user_id = p.user_id
       WHERE p.status='paid' AND p.paid_at >= ? AND ${notSeedSql('p')}
         AND (SELECT o.franchise_id FROM payer_franchise_override o WHERE o.payer_user_id = p.user_id) IS NULL
         AND (SELECT ${CAPITOWN_FID} FROM capitown_agencies ca WHERE ca.login_id = p.user_id LIMIT 1) IS NULL
         AND (SELECT m.fid FROM fmap m WHERE m.name = st.franchise  AND m.nf = 1) IS NULL
         AND (SELECT c.fid FROM cmap c WHERE c.name = st.shop_name AND c.nf = 1) IS NULL
       GROUP BY p.user_id ORDER BY amount DESC LIMIT 200
    `).bind(sinceMs).all();
    return (r.results || []) as Array<any>;
  }, []);

  const franchises = await safe(async () => {
    const r = await env.DB.prepare(`SELECT id, name, active FROM franchises ORDER BY (active=1) DESC, name`).all();
    return (r.results || []) as Array<{ id: number; name: string; active: number }>;
  }, []);
  const assigned = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT o.payer_user_id, o.franchise_id, COALESCE(f.name,'?') AS franchise_name, o.note, o.updated_at
        FROM payer_franchise_override o LEFT JOIN franchises f ON f.id = o.franchise_id ORDER BY o.updated_at DESC`).all();
    return (r.results || []) as Array<any>;
  }, []);

  return json({
    ok: true, type: 'payers', months,
    rows, franchises, assigned,
    unresolved_count: rows.length,
    unresolved_krw: rows.reduce((a, r) => a + (Number(r.amount) || 0), 0),
    note: '대리점이 원생 수강료를 자기 계정으로 결제하면 그 아이디는 학생 원부에 없어 소속을 알 수 없습니다. 캐피타운 대리점으로 등록하는 것이 근본 해결이고, 급하면 여기서 지사를 직접 지정할 수 있습니다.',
  });
}

async function monthlyReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();
  const built = await buildMonthly(env, period);

  /* 🔒 마감된 달은 «마감본» 이 정본이다. 다만 지금 계산한 숫자와 달라졌으면 그 사실을
     함께 알려 준다 — 조용히 바뀌지 않게 하는 것이 목적이지, 자료를 숨기려는 게 아니다. */
  const row = await closeRecord(env, period);
  if (row) {
    let snap: any = null;
    try { snap = JSON.parse(row.snapshot); } catch { snap = null; }
    if (snap) {
      snap.closed = {
        is_closed: true, closed_at: row.closed_at, closed_by: row.closed_by,
        forced: !!row.forced, warnings: JSON.parse(row.warnings || '[]'),
        drift: closeDrift(snap, built.data),
      };
      if (fmt === 'csv' || fmt === 'xlsx') {
        return out(fmt, `monthly-${period}-마감본.csv`, [
          ['※ 이 파일은 마감본입니다', `마감 ${new Date(row.closed_at + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')} · ${row.closed_by || ''}`],
          ...(snap.closed.drift.changed ? [['※ ' + snap.closed.drift.message] as (string | number)[]] : []),
          [],
          ...(built.csvRows.length ? [] : []),
          ...snapshotCsvRows(snap),
        ]);
      }
      return json(snap);
    }
  }

  if (fmt === 'csv' || fmt === 'xlsx') return out(fmt, `monthly-${period}.csv`, built.csvRows, monthlyDetailSheets(built.data));
  return json({ ...built.data, closed: { is_closed: false } });
}

/* 📊 엑셀 전용 — 상세 내역을 시트로 나눠 담는다. CSV 는 한 장이라 못 하던 것이다.
   숫자가 진짜 숫자로 들어가므로 받은 쪽에서 바로 정렬·합계·피벗을 할 수 있다. */
function monthlyDetailSheets(data: any): XlsxSheet[] {
  const d = data?.detail || {};
  const money = (rows: any[], nameLabel: string) =>
    [[ '일자', nameLabel, '금액' ], ...rows.map((r: any) => [r.date || '', r.name ?? r.remark ?? '', Number(r.amount) || 0])];
  const sheets: XlsxSheet[] = [];
  if ((d.b2b_rows || []).length) sheets.push({ name: '통장 직접입금(B2B)', headerRows: 1, rows: money(d.b2b_rows, '보낸 곳') });
  if ((d.transfer_rows || []).length) sheets.push({ name: '확인필요 입금', headerRows: 1, rows: money(d.transfer_rows, '적요') });
  if ((d.unclassified_rows || []).length) sheets.push({ name: '미분류 출금', headerRows: 1, rows: money(d.unclassified_rows, '받는 곳') });
  if ((d.card_rows || []).length) sheets.push({ name: '법인카드', headerRows: 1, rows: money(d.card_rows, '가맹점') });
  if ((data?.by_method || []).length) {
    sheets.push({ name: '결제수단별', headerRows: 1,
      rows: [['결제수단', '건수', '금액'], ...data.by_method.map((m: any) => [m.method || '기타', Number(m.cnt) || 0, Number(m.total) || 0])] });
  }
  return sheets;
}

/** 마감본 CSV — 스냅샷 JSON 에서 핵심만 뽑는다(그때의 숫자를 그대로 보여 주는 것이 목적). */
function snapshotCsvRows(snap: any): (string | number)[][] {
  const s = snap.summary || {}, c = snap.cost || {}, p = snap.pl || {};
  return [
    ['망고아이 월간 회계 리포트 (마감본)', snap.label || ''],
    [],
    ['[매출]'],
    ['장부 결제(카페24 등)', s.revenue_book || 0],
    ['통장 직접입금(B2B)', s.revenue_b2b || 0],
    ['매출 합계', p.revenue || 0],
    ['결제 건수', s.pay_count || 0],
    ['결제 학생수', s.paying_users || 0],
    [],
    ['[비용]'],
    ['강사 급여', c.teacher_payroll || 0],
    ['PG 수수료', c.pg_fee || 0],
    ['운영비', c.op_cost || 0],
    ['비용 합계', c.total || 0],
    [],
    ['[손익]'],
    ['매출', p.revenue || 0],
    ['비용', p.cost || 0],
    ['순이익', p.net_income || 0],
    ['이익률(%)', p.margin_pct || 0],
  ];
}

/* 👥 그 달에 «실제로 움직인» 학생 수 — 수업에 들어왔거나(attendance) 결제한(student_payments)
   학생의 합집합. students_erp.status='active' 는 퇴원 처리가 안 된 옛 학생까지 포함해
   지표의 분모로 쓸 수 없다(2026-08-16: active 28,672명 vs 실제 활동 805명). */
async function monthActiveStudents(env: Env, period: string) {
  const { startMs, endMs } = monthRange(period);
  const attended = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) AS c FROM attendance WHERE date BETWEEN ? AND ?
    `).bind(period + '-01', period + '-31').first<{ c: number }>();
    return Number(r?.c) || 0;
  }, 0);
  const paid = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COUNT(DISTINCT user_id) AS c FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ c: number }>();
    return Number(r?.c) || 0;
  }, 0);
  const total = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COUNT(*) AS c FROM (
        SELECT DISTINCT user_id FROM attendance WHERE date BETWEEN ? AND ?
        UNION
        SELECT DISTINCT user_id FROM student_payments
         WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
      )
    `).bind(period + '-01', period + '-31', startMs, endMs).first<{ c: number }>();
    return Number(r?.c) || 0;
  }, 0);
  return { attended, paid, total: total || Math.max(attended, paid) };
}

/* 🔍 한 달치 장부 vs 통장 판정 — reconcileReport() 와 같은 규칙을 한 달에 적용한 것.
   판정 문구도 같은 곳에서 만들어, 월간 리포트 배너와 대사 화면이 어긋나지 않게 한다. */
function reconcileMonth(revenueBook: number, dep: MonthDeposits) {
  const expected = Math.round(revenueBook * (1 - PG_FEE_RATE));
  const hasBank = dep.hasBank;
  const diff = hasBank ? dep.pg - expected : null;
  const pct = expected > 0 && diff != null ? (diff / expected) * 100 : 0;
  let verdict: 'ok' | 'warn' | 'alert' | 'no_data';
  if (!hasBank) verdict = 'no_data';
  else if (Math.abs(pct) <= 15) verdict = 'ok';           // 월 단위는 PG 정산 시차가 커서 여유를 둔다
  else if (Math.abs(pct) <= 30) verdict = 'warn';
  else verdict = 'alert';
  const short = (diff ?? 0) < 0;
  const MSG: Record<typeof verdict, string> = {
    ok: '장부와 통장이 맞습니다(월 단위 오차는 PG 정산 시차 범위).',
    warn: short
      ? 'PG 정산 입금이 장부보다 적습니다. 다음 달 정산으로 넘어간 것인지 확인하세요.'
      : 'PG 정산 입금이 장부보다 많습니다. 지난달 정산분이 이달에 들어왔는지 확인하세요.',
    alert: short
      ? 'PG 정산 입금이 장부보다 크게 적습니다. 정산 시차인지 미수금인지 KCP 정산내역을 확인하세요.'
      : 'PG 정산 입금이 장부보다 크게 많습니다. 장부에 안 잡힌 결제가 있는지 확인하세요.',
    no_data: '이 달은 계좌 입금 자료가 없어 대사를 할 수 없습니다.',
  };
  return {
    revenue: revenueBook, expected, deposit_pg: dep.pg,
    deposit_b2b: dep.b2b, deposit_transfer: dep.transfer, deposit_other: dep.other,
    diff, diff_pct: Number(pct.toFixed(1)), verdict, message: MSG[verdict],
    /* ⚠️ 확인이 끝난 내부 자금이체는 안내하지 않는다(2026-08-18 사장님 지시 — 설명이
       오히려 혼동을 준다). 아직 «모르는» 입금만 묻는다. */
    transfer_note: dep.transferUnknown > 0
      ? `아직 성격이 확인되지 않은 입금이 ₩${dep.transferUnknown.toLocaleString('ko-KR')} 있습니다 — 매출인지 자금이동인지 확인해 주세요.`
      : '',
  };
}

// ────────────────────────────────────────────────────────────────────
// 2) 분기 보고서 — 3개월 트렌드
// ────────────────────────────────────────────────────────────────────
async function quarterlyReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const year = Number(url.searchParams.get('year')) || new Date().getUTCFullYear();
  const q = Number(url.searchParams.get('q')) || 1;
  if (q < 1 || q > 4) return err('q must be 1-4');
  const { months, label } = quarterRange(year, q);

  const starts = await syncStarts(env);
  const monthlies = await Promise.all(months.map(period => periodRow(env, period, starts)));
  const past = pastRows(monthlies);
  const totals = sumRows(past);
  const full = fullRows(monthlies);
  const totalsFull = sumRows(full);

  const data = { ok: true, type: 'quarterly', year, quarter: q, label, monthlies, totals,
    margin_pct: totals.revenue > 0 ? Number(((totals.net / totals.revenue) * 100).toFixed(2)) : 0,
    /* 📅 자료가 온전한 달만의 합계 — 연동 이전 달은 비용이 없어 «가짜 흑자» 가 되므로
       전체 합계만 보면 회사 상태를 잘못 읽는다(2026-08-17). */
    totals_full: totalsFull, full_months: full.map(r => r.period),
    margin_pct_full: totalsFull.revenue > 0 ? Number(((totalsFull.net / totalsFull.revenue) * 100).toFixed(2)) : 0,
    sync_starts: starts,
  };

  if (fmt === 'csv' || fmt === 'xlsx') return out(fmt, `quarterly-${year}-Q${q}.csv`, trendCsv('망고아이 분기 보고서', label, monthlies, totals, totalsFull, starts));
  return json(data);
}

/* ═══════════════════════════════════════════════════════════════════════════
   📅 «그 달 자료가 온전한가» 판정 (2026-08-17 신설)

   [무엇이 잘못이었나] 연간 결산에서 2026-01 이 순이익 +1,100만(이익률 87%),
   2026-02 가 +914만 으로 나왔다. 회사가 그때 잘 벌었던 게 아니라 **비용 자료가
   없었을 뿐**이다. 연동 시작일이 이렇다:
     · 신한 통장  2026-02-19 부터  → 1월은 아예 없고, 2월은 11일치뿐
     · 법인카드   2026-05-15 부터  → 3·4월은 카드 지출이 통째로 빠지고 5월은 절반
   그런데 monthActualOpex 의 hasActual 이 «그 달에 데이터가 한 건이라도 있으면 true»
   였다. 그래서 2월은 11일치 비용만 반영하고 추정 폴백도 안 해 **가짜 흑자**가 됐다.
   1월은 «추정» 배지가 붙긴 했지만 강사급여 0 + 운영비 10% 라 역시 가짜 흑자였다.

   [그래서] 달마다 자료 범위를 셋으로 판정하고, 온전치 않은 달은 순이익을 «참고값»
   으로 못박는다. 연간·분기 합계도 «자료가 온전한 달만» 을 따로 낸다.
   ⛔ 숫자를 지어내 메우지 않는다. 모르는 건 모른다고 하는 것이 이 리포트의 원칙이다.
   ═══════════════════════════════════════════════════════════════════════════ */
export type CoverageLevel = 'full' | 'partial' | 'none' | 'future';
export interface Coverage {
  level: CoverageLevel;
  bank: 'full' | 'partial' | 'none';
  card: 'full' | 'partial' | 'none';
  note: string;
}

/** 통장·카드 연동이 «언제부터» 인지. 리포트당 한 번만 조회해 달마다 돌려 쓴다. */
async function syncStarts(env: Env): Promise<{ bankFrom: string | null; cardFrom: string | null }> {
  const bankFrom = await safe(async () => {
    const r = await env.DB.prepare(`SELECT MIN(substr(trans_at,1,10)) AS d FROM bankacct_transactions`).first<{ d: string }>();
    return r?.d || null;
  }, null as string | null);
  const cardFrom = await safe(async () => {
    const r = await env.DB.prepare(`SELECT MIN(substr(used_at,1,10)) AS d FROM corpcard_transactions WHERE cancelled=0`).first<{ d: string }>();
    return r?.d || null;
  }, null as string | null);
  return { bankFrom, cardFrom };
}

function sourceCoverage(period: string, from: string | null): 'full' | 'partial' | 'none' {
  if (!from) return 'none';
  const fromMonth = from.slice(0, 7);
  if (period < fromMonth) return 'none';
  if (period > fromMonth) return 'full';
  // 연동이 시작된 바로 그 달 — 1일부터가 아니면 부분이다
  return from.slice(8, 10) === '01' ? 'full' : 'partial';
}

function coverageOf(period: string, starts: { bankFrom: string | null; cardFrom: string | null }): Coverage {
  if (period > currentMonth()) {
    return { level: 'future', bank: 'none', card: 'none', note: '아직 오지 않은 달입니다.' };
  }
  const bank = sourceCoverage(period, starts.bankFrom);
  const card = sourceCoverage(period, starts.cardFrom);
  const parts: string[] = [];
  /* 진행 중인 달은 «온전» 이라고 할 수 없다 — 아직 절반만 지났는데 한 달치로 읽으면
     매출도 비용도 실제보다 작다. 자료 연동과 무관한 이유라 따로 먼저 판정한다. */
  if (period === currentMonth()) {
    return { level: 'partial', bank, card,
      note: '아직 진행 중인 달입니다 — 매출도 비용도 한 달치가 아니라 오늘까지의 값입니다.' };
  }
  if (bank === 'none') parts.push(`통장 자료가 없습니다(연동 ${starts.bankFrom || '미연동'}부터)`);
  else if (bank === 'partial') parts.push(`통장 자료가 ${starts.bankFrom}부터라 이 달은 일부만 있습니다`);
  if (card === 'none') parts.push(`법인카드 자료가 없습니다(연동 ${starts.cardFrom || '미연동'}부터)`);
  else if (card === 'partial') parts.push(`법인카드 자료가 ${starts.cardFrom}부터라 이 달은 일부만 있습니다`);
  const level: CoverageLevel = bank === 'none' ? 'none' : (bank === 'partial' || card !== 'full' ? 'partial' : 'full');
  return {
    level, bank, card,
    note: parts.length
      ? parts.join(' · ') + ' → 비용이 실제보다 적게 잡혀 순이익이 좋게 보입니다. 참고값으로만 보세요.'
      : '통장·카드 자료가 이 달 전체에 있습니다.',
  };
}

/* 분기·연간이 같이 쓰는 한 달치 줄. 계산 규칙은 monthPL() 한 곳에만 있다. */
async function periodRow(env: Env, period: string, starts: { bankFrom: string | null; cardFrom: string | null }) {
  const coverage = coverageOf(period, starts);
  // 아직 오지 않은 달은 계산하지 않는다 — 0원 줄을 만들어 합계에 섞으면 안 된다
  if (coverage.level === 'future') {
    return {
      period, revenue: 0, revenue_book: 0, revenue_b2b: 0, pays: 0, payroll: 0, cost: 0, net: 0,
      op_cost_source: 'none' as const, coverage,
    };
  }
  const pl = await monthPL(env, period);
  return {
    period,
    revenue: pl.rev.total,
    revenue_book: pl.rev.book,
    revenue_b2b: pl.rev.b2b,
    pays: pl.rev.payCount,
    payroll: pl.payrollEff,
    cost: pl.cost,
    net: pl.net,
    op_cost_source: pl.opCostSource as 'actual' | 'estimated' | 'none',
    coverage,
  };
}
type PeriodRow = Awaited<ReturnType<typeof periodRow>>;

function sumRows(rows: PeriodRow[]) {
  return rows.reduce((a, m) => ({
    revenue: a.revenue + m.revenue,
    revenue_book: a.revenue_book + m.revenue_book,
    revenue_b2b: a.revenue_b2b + m.revenue_b2b,
    pays: a.pays + m.pays,
    payroll: a.payroll + m.payroll,
    cost: a.cost + m.cost,
    net: a.net + m.net,
  }), { revenue: 0, revenue_book: 0, revenue_b2b: 0, pays: 0, payroll: 0, cost: 0, net: 0 });
}

/** 자료가 온전한 달만 — 「진짜 손익」은 이쪽으로 봐야 한다. */
const fullRows = (rows: PeriodRow[]) => rows.filter(r => r.coverage.level === 'full');
const pastRows = (rows: PeriodRow[]) => rows.filter(r => r.coverage.level !== 'future');

const COVERAGE_LABEL: Record<CoverageLevel, string> = {
  full: '온전', partial: '자료부족', none: '자료없음', future: '아직 안 옴',
};

function trendCsv(title: string, label: string, rows: PeriodRow[],
                  totals: ReturnType<typeof sumRows>, totalsFull: ReturnType<typeof sumRows>,
                  starts: { bankFrom: string | null; cardFrom: string | null }): (string | number)[][] {
  const past = pastRows(rows);
  const full = fullRows(rows);
  return [
    [title, label],
    ['※ 매출 = 장부 결제 + 통장 직접입금(B2B).'],
    [`※ 자료 연동 시작 — 통장 ${starts.bankFrom || '미연동'} · 법인카드 ${starts.cardFrom || '미연동'}. 그 전 달은 비용이 없거나 일부라 순이익이 실제보다 좋게 나옵니다.`],
    [],
    ['월', '매출', '  장부 결제', '  통장 B2B', '결제건수', '강사급여', '비용 합계', '순이익', '자료 상태'],
    ...past.map(m => [m.period, m.revenue, m.revenue_book, m.revenue_b2b, m.pays, m.payroll, m.cost, m.net,
      COVERAGE_LABEL[m.coverage.level]]),
    ['합계(전체)', totals.revenue, totals.revenue_book, totals.revenue_b2b, totals.pays, totals.payroll, totals.cost, totals.net, ''],
    [`합계(자료 온전한 달만 — ${full.map(r => r.period).join(' ') || '없음'})`,
      totalsFull.revenue, totalsFull.revenue_book, totalsFull.revenue_b2b, totalsFull.pays, totalsFull.payroll, totalsFull.cost, totalsFull.net, ''],
    [],
    ['※ 「자료부족」·「자료없음」 달의 순이익은 참고값입니다 — 비용이 덜 잡혀 흑자로 보일 수 있습니다.'],
    ['※ 회사 상태는 «자료 온전한 달만» 합계로 보세요.'],
  ];
}

// ────────────────────────────────────────────────────────────────────
// 3) 연간 결산
// ────────────────────────────────────────────────────────────────────
async function annualReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const year = Number(url.searchParams.get('year')) || new Date().getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  const starts = await syncStarts(env);
  const monthlies = await Promise.all(months.map(period => periodRow(env, period, starts)));
  const past = pastRows(monthlies);
  const totals = sumRows(past);
  const full = fullRows(monthlies);
  const totalsFull = sumRows(full);

  const data = {
    ok: true, type: 'annual', year, label: `${year}년 결산`,
    monthlies, totals,
    margin_pct: totals.revenue > 0 ? Number(((totals.net / totals.revenue) * 100).toFixed(2)) : 0,
    totals_full: totalsFull, full_months: full.map(r => r.period),
    margin_pct_full: totalsFull.revenue > 0 ? Number(((totalsFull.net / totalsFull.revenue) * 100).toFixed(2)) : 0,
    sync_starts: starts,
  };

  if (fmt === 'csv' || fmt === 'xlsx') return out(fmt, `annual-${year}.csv`, trendCsv('망고아이 연간 결산', `${year}년`, monthlies, totals, totalsFull, starts));
  return json(data);
}

// ────────────────────────────────────────────────────────────────────
// 4) 가맹점별 정산서
// ────────────────────────────────────────────────────────────────────
/* 🏢 가맹점별 정산서 — 「총매출 ÷ 가맹점 수」 균등분배를 버렸다 (2026-08-16).

   [무엇이 문제였나] 활성 가맹점 235개로 그 달 총매출을 똑같이 나눠 줬다.
   학생 한 명 없는 지사와 수백 명 있는 지사가 같은 금액을 받는 표였다.
   이대로 가맹점에 보내면 분쟁이 난다.

   [어떻게 고쳤나] 학생 한 명 한 명을 실제 소속으로 따라가 붙인다:
     students_erp.shop_name → centers.name → centers.franchise_id → franchises
   ⚠️ centers.name 이 유일하지 않다(2026-08-16 기준 5개 이름이 두 지사 이상으로 갈린다 —
      안산SLP·강서SLP·미사용·뮤엠영어학원·진주외국어고등학교, 학생 2,603명).
      이름 하나가 두 지사 이상이면 **아무 데도 배정하지 않고 «배정 불가» 로 따로 센다** —
      아무 쪽에나 몰아주면 그게 또 다른 균등분배다.
   ⚠️ 배정 불가의 **주된 원인은 중복 이름이 아니다**(2026-07 기준 12만원, 1.3%).
      **학생 원부에 아예 없는 아이디로 들어오는 결제**가 진짜 원인이다
      (2026-07 539만원 · 56.8%, 2026년 누계 5,242만원). 대리점·직원이 학생 몫을
      한꺼번에 대신 결제하는 것으로 보인다(예: 「장지웅1」이 3분 동안 13건).
      → 해결은 코드가 아니라 데이터다. student_org_override 에 아이디↔대리점을
        넣으면 그대로 붙는다. 목록은 docs/가맹점_매출배정_미확정_목록_2026-08-16.md.
   ⚠️ 수수료율은 가맹 계약서에 있는 값인데 시스템에 없다. 그래서 화면·CSV 에
      «추정» 이라고 밝히고, ?hq_fee= 로 바꿔 볼 수 있게만 한다. */
async function franchiseReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();
  const { startMs, endMs, label } = monthRange(period);
  const hqFeeRate = Number(url.searchParams.get('hq_fee')) || 0.15;

  /* 🧾 대리 결제자 → 지사 지정표 (2026-08-16 신설).
     학생이 아니라 **대리점·직원 계정이 여러 학생 몫을 한꺼번에 결제**하는 경우가 있다
     (사장님 확인: 「장지웅1」 = 직원 대리결제). 그 아이디는 students_erp 에 없으니
     소속을 알 수 없어 매출이 통째로 «배정 불가» 가 된다 — 2026년 누계 5,242만원.
     여기에 «이 아이디는 이 지사» 를 한 줄 적어 두면 그 뒤부터 자동으로 붙는다.
     ⛔ 추측해서 채우지 말 것. 사람이 확인해 준 것만 넣는다. */
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS payer_franchise_override (payer_user_id TEXT PRIMARY KEY, franchise_id INTEGER NOT NULL, note TEXT, updated_at INTEGER NOT NULL);`);
  } catch { /* 이미 있으면 그만 */ }

  /* 🔑 소속 판정은 «학생 원부의 지사 라벨» 이 1순위다 (2026-08-16).
     students_erp.franchise 는 카페24가 학생마다 직접 찍어 준 지사 이름이라
     대리점 이름을 거쳐 추론하는 것보다 훨씬 정확하다 — 실측: 학생 29,398명 중
     28,974명(98.6%)이 라벨을 갖고 있고 **전부** franchises.name 과 정확히 일치한다.
     이 방식으로 바꾸면 「같은 대리점 이름이 두 지사에 있어 배정 불가」 문제가
     통째로 사라진다(예: 「미사용」 대리점 학생 229명은 라벨이 이미 셋으로 나뉘어 있다).
     라벨이 없는 학생만 예전처럼 shop_name → centers → 지사 로 폴백한다. */
  const attributed = await safe(async () => {
    const r = await env.DB.prepare(`
      WITH fmap AS (
        SELECT name, MIN(id) AS fid, COUNT(*) AS nf
          FROM franchises WHERE COALESCE(name,'') <> '' GROUP BY name
      ),
      cmap AS (
        SELECT name, MIN(franchise_id) AS fid, COUNT(DISTINCT franchise_id) AS nf
          FROM centers WHERE franchise_id IS NOT NULL AND COALESCE(name,'') <> ''
         GROUP BY name
      ),
      att AS (
        SELECT p.id AS pay_id, p.amount_krw, p.user_id,
               COALESCE(
                 -- ① 사람이 지정해 준 대리 결제자 (학생 원부에 없는 아이디를 구제)
                 (SELECT o.franchise_id FROM payer_franchise_override o WHERE o.payer_user_id = p.user_id),
                 -- ② 캐피타운 대리점 로그인 아이디 → 그 대리점이 속한 지사
                 (SELECT ${CAPITOWN_FID} FROM capitown_agencies ca WHERE ca.login_id = p.user_id LIMIT 1),
                 -- ③ 학생 원부의 지사 라벨
                 (SELECT m.fid FROM fmap m WHERE m.name = st.franchise  AND m.nf = 1),
                 -- ④ 대리점 이름 → 지사 (라벨이 없는 학생용 폴백)
                 (SELECT c.fid FROM cmap c WHERE c.name = st.shop_name AND c.nf = 1)
               ) AS fid
          FROM student_payments p
          LEFT JOIN students_erp st ON st.user_id = p.user_id
         WHERE p.status='paid' AND p.paid_at >= ? AND p.paid_at < ? AND ${notSeedSql('p')}
      )
      SELECT f.id AS franchise_id, f.name AS franchise_name, f.active AS active,
             COALESCE(SUM(a.amount_krw),0) AS gross,
             COUNT(a.pay_id) AS pays,
             COUNT(DISTINCT a.user_id) AS students
        FROM att a JOIN franchises f ON f.id = a.fid
       GROUP BY f.id, f.name, f.active
       HAVING gross > 0
       ORDER BY gross DESC
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<{ franchise_id: number; franchise_name: string; active: number; gross: number; pays: number; students: number }>;
  }, []);

  // 장부 총 매출 — 배정된 합과 비교해 «배정 못 한 돈» 을 정직하게 드러낸다
  const bookTotal = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ revenue: number }>();
    return Number(r?.revenue) || 0;
  }, 0);

  const rows = attributed.map(f => {
    const fee = Math.round(f.gross * hqFeeRate);
    return {
      franchise_id: f.franchise_id,
      franchise_name: f.franchise_name + (Number(f.active) === 1 ? '' : ' (비활성 지사)'),
      students: f.students,
      pay_count: f.pays,
      gross_revenue: f.gross,
      hq_fee: fee,
      net_settlement: f.gross - fee,
      due_date: nextSettlementDate(period),
      status: '정산예정',
    };
  });

  const assigned = rows.reduce((a, r) => a + r.gross_revenue, 0);
  const unassigned = Math.max(0, bookTotal - assigned);

  /* 🔎 «어느 아이디 때문에 못 붙었는지» 를 이름까지 보여 준다 (2026-08-16).
     숫자만 «미배정 539만» 이라고 하면 무엇을 해야 할지 알 수 없다. 목록이 있어야
     사장님이 «아, 이건 어디 대리점» 하고 알려 줄 수 있고, 그러면 바로 붙는다. */
  const unassignedPayers = await safe(async () => {
    const r = await env.DB.prepare(`
      WITH fmap AS (SELECT name, MIN(id) AS fid, COUNT(*) AS nf FROM franchises WHERE COALESCE(name,'') <> '' GROUP BY name),
      cmap AS (SELECT name, MIN(franchise_id) AS fid, COUNT(DISTINCT franchise_id) AS nf
                 FROM centers WHERE franchise_id IS NOT NULL AND COALESCE(name,'') <> '' GROUP BY name)
      SELECT p.user_id,
             COUNT(*) AS pays, COALESCE(SUM(p.amount_krw),0) AS amount,
             CASE WHEN st.user_id IS NULL THEN '학생 원부에 없는 아이디'
                  WHEN COALESCE(st.franchise,'') = '' THEN '지사 라벨 없음'
                  ELSE '지사 이름이 중복' END AS reason
        FROM student_payments p
        LEFT JOIN students_erp st ON st.user_id = p.user_id
       WHERE p.status='paid' AND p.paid_at >= ? AND p.paid_at < ? AND ${notSeedSql('p')}
         AND (SELECT o.franchise_id FROM payer_franchise_override o WHERE o.payer_user_id = p.user_id) IS NULL
         AND (SELECT ${CAPITOWN_FID} FROM capitown_agencies ca WHERE ca.login_id = p.user_id LIMIT 1) IS NULL
         AND (SELECT m.fid FROM fmap m WHERE m.name = st.franchise  AND m.nf = 1) IS NULL
         AND (SELECT c.fid FROM cmap c WHERE c.name = st.shop_name AND c.nf = 1) IS NULL
       GROUP BY p.user_id, reason
       ORDER BY amount DESC LIMIT 50
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<{ user_id: string; pays: number; amount: number; reason: string }>;
  }, []);
  const totals = rows.reduce((a, r) => ({
    gross: a.gross + r.gross_revenue, fee: a.fee + r.hq_fee, net: a.net + r.net_settlement,
  }), { gross: 0, fee: 0, net: 0 });

  const data = {
    ok: true, type: 'franchise', period, label,
    hq_fee_rate: hqFeeRate,
    method: 'attributed',                       // 균등분배(equal)가 아니라 학생 단위 귀속
    rows, totals,
    book_total: bookTotal,
    unassigned_krw: unassigned,
    unassigned_pct: bookTotal > 0 ? Number(((unassigned / bookTotal) * 100).toFixed(1)) : 0,
    unassigned_payers: unassignedPayers,
    sources: {
      gross_revenue: 'actual' as FigureSource,
      hq_fee: 'estimated' as FigureSource,      // 계약서 수수료율이 시스템에 없다
      unassigned: (unassigned > 0 ? 'review' : 'actual') as FigureSource,
    },
    notes: [
      '가맹점별 매출은 학생 한 명씩 실제 소속을 따라가 합산한 값입니다. 균등분배가 아닙니다. 소속은 학생 원부의 지사 라벨을 먼저 쓰고, 라벨이 없으면 대리점 이름으로 찾습니다.',
      `본사 수수료율 ${(hqFeeRate * 100).toFixed(1)}% 는 시스템에 계약 수수료율이 없어 쓴 임시값입니다 — 가맹점에 보내기 전에 계약서로 확인하세요.`,
      ...(unassigned > 0 ? [`소속을 확정하지 못한 매출 ₩${unassigned.toLocaleString('ko-KR')}(${data0Pct(unassigned, bookTotal)}%)은 어느 가맹점에도 넣지 않았습니다. 대부분은 «학생 원부에 없는 아이디로 들어온 결제»입니다 — 대리점·직원이 학생 몫을 대신 결제하면 그 아이디가 학생 원부에 없어 소속을 알 수 없습니다.`] : []),
    ],
  };

  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, `franchise-settlement-${period}.csv`, [
      ['망고아이 가맹점 정산서', label],
      [`본사 수수료율: ${(hqFeeRate * 100).toFixed(1)}% (추정 — 계약서 확인 필요)`],
      ['산출 방식', '학생 단위 실제 귀속 (균등분배 아님)'],
      [],
      ['가맹점', '학생수', '결제건수', '총 매출', '본사 수수료', '정산액', '송금예정일', '상태'],
      ...rows.map(r => [r.franchise_name, r.students, r.pay_count, r.gross_revenue, r.hq_fee, r.net_settlement, r.due_date, r.status]),
      ['합계', '', '', totals.gross, totals.fee, totals.net, '', ''],
      [],
      ['장부 총 매출', bookTotal],
      ['가맹점에 배정된 매출', assigned],
      ['배정하지 못한 매출(확인 필요)', unassigned],
      ...(unassignedPayers.length ? [
        [] as (string | number)[],
        ['[배정 못 한 결제자 — 어느 지사인지 알려 주시면 바로 붙습니다]'] as (string | number)[],
        ['결제 아이디', '건수', '금액', '사유'] as (string | number)[],
        ...unassignedPayers.map(u => [u.user_id, u.pays, u.amount, u.reason] as (string | number)[]),
      ] : []),
    ], [
      // 📊 엑셀에서는 가맹점 표와 «배정 못 한 결제자» 를 시트로 나눈다 — 그대로 정렬·필터할 수 있게
      { name: '가맹점별', headerRows: 1, rows: [
        ['가맹점', '학생수', '결제건수', '총 매출', '본사 수수료', '정산액', '송금예정일', '상태'],
        ...rows.map(r => [r.franchise_name, r.students, r.pay_count, r.gross_revenue, r.hq_fee, r.net_settlement, r.due_date, r.status]),
      ] },
      ...(unassignedPayers.length ? [{ name: '배정 못 한 결제자', headerRows: 1, rows: [
        ['결제 아이디', '건수', '금액', '사유', '지사(적어주세요)'],
        ...unassignedPayers.map(u => [u.user_id, u.pays, u.amount, u.reason, '']),
      ] } as XlsxSheet] : []),
    ]);
  }
  return json(data);
}

/* 🏪 캐피타운 대리점 계정 → 그 대리점이 속한 지사 (2026-08-17).
   학원(대리점)이 원생 수강료를 자기 계정으로 한꺼번에 결제하면, 그 아이디는 학생이
   아니라서 students_erp 에 없다 → 소속을 몰라 매출이 통째로 «배정 불가» 였다.
   그런데 capitown_agencies 에 **login_id 와 branch(지사) 가 이미 들어 있었다.**
   추측할 필요 없이 그대로 이으면 된다(2026-08-17 사장님이 ubckt00·lnct00 을
   «대리점 계정» 이라고 확인해 주면서 찾음).
   ⚠️ branch 이름이 여러 지사와 겹치면 배정하지 않는다 — 여기서도 «모르면 안 넣는다». */
const CAPITOWN_FID = `(SELECT MIN(f.id) FROM franchises f
        WHERE f.name = ca.branch
          AND (SELECT COUNT(*) FROM franchises f2 WHERE f2.name = ca.branch) = 1)`;

/** 0 나눗셈을 피한 퍼센트 문자열 */
function data0Pct(part: number, whole: number): string {
  return whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0';
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
      WHERE p.period = ? AND ${realPayslipSql('p')}
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

  /* 🧑‍🏫 급여명세가 0건일 때 «빈 표» 만 보여 주고 끝내지 않는다 (2026-08-16).
     실제로 그 달 강사에게 나간 돈(신한 → 메트로은행 송금)과 자동 계산된 수업 실적이
     있으면 그것을 «아직 확정되지 않은 값» 으로 함께 알려 준다. */
  const ax = await monthActualOpex(env, period);
  const [y, mo] = period.split('-').map(Number);
  const autoPayroll = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COUNT(*) AS teachers, COALESCE(SUM(completed_classes),0) AS classes, COALESCE(SUM(pay_php),0) AS php
      FROM teacher_payroll_auto WHERE year=? AND month=?
    `).bind(y, mo).first<{ teachers: number; classes: number; php: number }>();
    return { teachers: Number(r?.teachers) || 0, classes: Number(r?.classes) || 0, php: Number(r?.php) || 0 };
  }, { teachers: 0, classes: 0, php: 0 });

  const notes: string[] = [];
  if (rows.length === 0) {
    notes.push('이 달에 확정된 강사 급여명세가 한 건도 없습니다. 아래는 «대신 알 수 있는 것» 입니다.');
    if (ax.teacherPayout > 0) notes.push(`신한 계좌에서 강사에게 실제로 나간 송금은 ₩${ax.teacherPayout.toLocaleString('ko-KR')} 입니다(메트로은행, 실데이터).`);
    if (autoPayroll.teachers > 0) notes.push(`수업 실적으로 자동 계산된 강사는 ${autoPayroll.teachers}명 · 완료 수업 ${autoPayroll.classes}건입니다 — 확정(급여명세 생성)만 하면 이 표가 채워집니다.`);
    notes.push('급여명세가 없으면 원천세(3.3%)도 계산되지 않습니다.');
  }

  const data = { ok: true, type: 'payslips', period, label: `${period} 강사 급여명세서`,
    rows, totals, teacher_count: rows.length,
    fallback: rows.length === 0 ? { bank_payout: ax.teacherPayout, auto: autoPayroll } : null,
    notes };

  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, `payslips-${period}.csv`, [
      ['망고아이 강사 급여명세서', period],
      ...notes.map(n => [n] as (string | number)[]),
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
/* ⭐ 경영지표 — 「분모가 틀린 지표」를 걷어냈다 (2026-08-16).
     · ARPU 분모를 students_erp.status='active'(28,672명)에서 «그 달 실제 활동 학생»
       으로 바꿨다. 예전엔 학생 1인당 331원 같은 값이 나왔다.
     · CAC 는 «매출의 5%를 마케팅비로 친다» 는 근거 없는 식이었다 → 법인카드의
       실제 광고비로 계산하고, 광고비 자료가 없으면 값을 만들지 않고 «자료없음».
     · 결제 성공률은 실패 결제가 저장되지 않아 늘 100%에 가깝게 나왔다 → «자료없음».
   ⛔ 새 규칙: 근거가 없으면 숫자를 지어내지 않고 available:false 로 내려보낸다. */
const AD_MERCHANT_RE = /GOOGLE|META|FACEBOOK|INSTAGRAM|NAVER|네이버|카카오|당근|유튜브|YOUTUBE|광고|ADS?\b/i;

async function kpiReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();
  const { startMs, endMs, label } = monthRange(period);

  const pl = await monthPL(env, period);
  const activeReal = await monthActiveStudents(env, period);

  const active = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS c FROM students_erp WHERE status IN ('정상','활동','active')`).first<{ c: number }>();
    return Number(r?.c) || 0;
  }, 0);

  const newSignups = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS c FROM students_erp WHERE substr(COALESCE(signup_date,''),1,7)=?`)
      .bind(period).first<{ c: number }>();
    return Number(r?.c) || 0;
  }, 0);

  // 평균 누적 결제액 (LTV proxy) — 학생당 지금까지 결제 합계의 평균
  const ltvProxy = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT AVG(total) AS avg_total FROM (
        SELECT user_id, SUM(amount_krw) AS total
        FROM student_payments WHERE status='paid' AND ${notSeedSql()} GROUP BY user_id
      )
    `).first<{ avg_total: number }>();
    return Math.round(Number(r?.avg_total) || 0);
  }, 0);

  // 📣 실제 광고비 — 법인카드에서 광고 가맹점만. 없으면 CAC 를 계산하지 않는다.
  const adSpend = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(merchant,'') AS merchant, COALESCE(SUM(amount),0) AS total
      FROM corpcard_transactions WHERE cancelled=0 AND substr(used_at,1,7)=?
      GROUP BY merchant
    `).bind(period).all();
    return ((r.results || []) as Array<{ merchant: string; total: number }>)
      .filter(m => AD_MERCHANT_RE.test(m.merchant))
      .reduce((a, m) => a + (Number(m.total) || 0), 0);
  }, 0);

  const classMin = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_active_ms),0)/60000 AS total_min,
             SUM(CASE WHEN COALESCE(total_active_ms,0)=0 THEN 1 ELSE 0 END) AS zero_sessions
      FROM attendance WHERE date BETWEEN ? AND ?
    `).bind(period + '-01', period + '-31').first<{ total_min: number; zero_sessions: number }>();
    return r || { total_min: 0, zero_sessions: 0 };
  }, { total_min: 0, zero_sessions: 0 });

  const revenue = pl.rev.total;
  const cost = pl.cost;
  const net = pl.net;
  const roi = cost > 0 ? (net / cost) * 100 : 0;
  const arpuBase = activeReal.total;
  const arpu = arpuBase > 0 ? Math.round(revenue / arpuBase) : 0;
  const cac = adSpend > 0 && newSignups > 0 ? Math.round(adSpend / newSignups) : 0;

  type Kpi = { key: string; label: string; value: number; unit: string; source: FigureSource; available: boolean; note?: string };
  const kpis: Kpi[] = [
    { key: 'revenue', label: '월 매출 (장부+통장 B2B)', value: revenue, unit: 'KRW', source: 'actual', available: true },
    { key: 'revenue_b2b', label: '  └ 통장 직접입금(B2B)', value: pl.rev.b2b, unit: 'KRW', source: pl.rev.b2b > 0 ? 'actual' : 'none', available: true },
    { key: 'active_real', label: '활동 학생 (수업·결제한 학생)', value: activeReal.total, unit: '명', source: 'actual', available: true },
    { key: 'active_students', label: '재적 학생 (원부 status=active)', value: active, unit: '명', source: 'review', available: true,
      note: '퇴원 처리가 안 된 옛 학생까지 포함돼 있어 지표의 분모로는 쓰지 않습니다.' },
    { key: 'paying_users', label: '결제 학생', value: pl.rev.payingUsers, unit: '명', source: 'actual', available: true },
    { key: 'new_signups', label: '신규 가입', value: newSignups, unit: '명', source: 'actual', available: true },
    { key: 'arpu', label: 'ARPU (활동 학생 1인 평균 매출)', value: arpu, unit: 'KRW', source: 'actual', available: arpuBase > 0 },
    { key: 'ltv', label: 'LTV (평균 누적결제)', value: ltvProxy, unit: 'KRW', source: 'actual', available: ltvProxy > 0 },
    { key: 'ad_spend', label: '광고비 (법인카드 실지출)', value: adSpend, unit: 'KRW', source: adSpend > 0 ? 'actual' : 'none', available: adSpend > 0,
      note: adSpend > 0 ? '' : '법인카드에서 광고 가맹점을 찾지 못했습니다. 광고 계정을 연동하거나 카드 내역을 분류해 주세요.' },
    { key: 'cac', label: 'CAC (광고비 ÷ 신규 학생)', value: cac, unit: 'KRW', source: adSpend > 0 ? 'actual' : 'none', available: cac > 0,
      note: cac > 0 ? '' : '광고비 자료가 없어 계산하지 않았습니다(예전에는 매출의 5%로 지어냈습니다).' },
    { key: 'ltv_cac', label: 'LTV/CAC', value: cac > 0 ? Number((ltvProxy / cac).toFixed(2)) : 0, unit: '배',
      source: cac > 0 ? 'actual' : 'none', available: cac > 0 },
    { key: 'margin_pct', label: '이익률', value: pl.margin, unit: '%', source: pl.opCostSource, available: revenue > 0 },
    { key: 'roi_pct', label: 'ROI', value: Number(roi.toFixed(2)), unit: '%', source: pl.opCostSource, available: cost > 0 },
    { key: 'success_rate', label: '결제 성공률', value: 0, unit: '%', source: 'none', available: false,
      note: '실패한 결제가 저장되지 않아 계산할 수 없습니다. 저장하면 바로 나옵니다.' },
    { key: 'class_min', label: '총 수업 시간', value: classMin.total_min, unit: '분',
      source: classMin.zero_sessions > 0 ? 'review' : 'actual', available: true,
      note: classMin.zero_sessions > 0 ? `수업 기록 ${classMin.zero_sessions}건의 수업시간이 0으로 저장돼 있어 실제보다 적게 나옵니다.` : '' },
  ];

  const data = { ok: true, type: 'kpi', period, label: `${label} 경영지표 (KPI)`, kpis,
    revenue, cost, net, payroll: pl.payroll.total, margin_pct: pl.margin };

  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, `kpi-${period}.csv`, [
      ['망고아이 경영지표 (KPI)', label],
      [],
      ['지표', '값', '단위', '출처', '비고'],
      ...kpis.map(k => [k.label, k.available ? k.value : '(자료없음)', k.unit,
        k.source === 'actual' ? '실데이터' : k.source === 'estimated' ? '추정' : k.source === 'review' ? '확인필요' : '자료없음',
        k.note || '']),
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

  /* 💰 매출·비용은 monthPL() 한 곳에서 — 월간 리포트와 숫자가 어긋나지 않게(2026-08-16).
     매출에는 통장 B2B 직접입금이 포함된다. */
  const plM = await monthPL(env, period);
  const rev = { revenue: plM.rev.total, pay_count: plM.rev.payCount };
  const payroll = plM.payroll.total;
  const ax = plM.ax;
  /* 💵 통장 기준 사실 — 손익계산서도 월간 리포트와 똑같이 «매출 누락» 을 밝히고
     실제 현금흐름을 함께 보여 준다. 화면마다 말이 다르면 안 된다(2026-08-16 제보).
     비교 대상은 «진짜 PG 정산분 vs 장부 결제 매출» 이다(B2B 직접입금은 PG 를 안 거친다). */
  const plCash = await monthCash(env, period);
  const plGap = revenueGapOf(plM.rev.dep.pg, plM.rev.book);
  const { cardSpend, bankRows: bankOpexRows, bankOpex, bankDup, hasActual } = ax;
  const opCost = plM.opCost;
  const pgFee = plM.pgFee;

  /* 🧾 부가세 — 예전엔 «매출 × 3%» 라는 근거 없는 식이었다. 우리 매출은 부가세 포함
     금액이므로 예수 부가세 = 매출 ÷ 11 이 정본이다. 매입세액 공제는 세금계산서 자료가
     없어 반영하지 못한다 → 여전히 «추정» 이라고 밝힌다(2026-08-16). */
  const tax = Math.round(rev.revenue / 11);

  const seedEx = await seedRevenueExcluded(env, startMs, endMs);   // 🌱 리포트에서 뺀 시드 매출

  /* 🧑‍🏫 강사 급여 — 급여명세(payslips)가 있으면 그것이 정본. 비어 있으면 신한 계좌의
     강사 송금(메트로은행, 실데이터)으로 대신한다. 둘 다 있으면 급여명세를 쓰고 송금분은
     중복이라 제외(안내 줄 표시). 💸 학생 환불은 비용이 아니라 매출 차감(2026-08-15 확인). */
  const payrollEff = plM.payrollEff;
  const payrollFromBank = payroll <= 0 && ax.teacherPayout > 0;
  const revNet = rev.revenue - ax.refunds;

  const totalCost = payrollEff + pgFee + opCost + tax;
  const netIncome = revNet - totalCost;
  const grossProfit = revNet - payrollEff - pgFee;
  const operatingProfit = grossProfit - opCost;

  /* 🏦 통장 실제 잔액 — 재무상태표의 «현금» 을 «매출 × 70%» 로 지어내던 것을 대체한다.
     그 달 마지막 거래의 balance 가 월말 잔액이다. 마이너스면 마이너스 그대로 쓴다. */
  const cashActual = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT balance FROM bankacct_transactions WHERE substr(trans_at,1,7)<=?
      ORDER BY trans_at DESC, id DESC LIMIT 1
    `).bind(period).first<{ balance: number }>();
    return r ? Number(r.balance) : null;
  }, null as number | null);

  /* 💼 미지급 강사급여 — payslips.paid=0 인 실제 행. 예전엔 «그 달 급여 전액» 을
     미지급금으로 잡아 이미 지급한 돈까지 부채로 세었다. */
  const unpaidPayroll = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(payment_krw),0) AS t FROM payslips
      WHERE COALESCE(paid,0)=0 AND period<=? AND ${realPayslipSql()}
    `).bind(period).first<{ t: number }>();
    return Number(r?.t) || 0;
  }, 0);

  let data: any;

  if (type === 'pl') {
    // 손익계산서 (Income Statement / Profit & Loss)
    data = {
      ok: true, type: 'pl', period, label: `손익계산서 (P&L) — ${label}`,
      sections: [
        { title: 'I. 매출액 (Revenue)', items: [
          { name: '수업료 매출 (카페24 등 결제)', amount: plM.rev.book },
          ...(plM.rev.b2b > 0
            ? [{ name: `통장 직접입금 (B2B ${plM.rev.dep.b2bRows.length}건 · 신한 실데이터)`, amount: plM.rev.b2b }]
            : []),
          ...(ax.refunds > 0 ? [{ name: '학생 환불 (신한 계좌·실데이터)', amount: -ax.refunds }] : []),
          ...(plM.rev.dep.transferKnown > 0
            ? [{ name: `※ 하나은행에서 옮겨 온 운영자금 ₩${plM.rev.dep.transferKnown.toLocaleString('ko-KR')}(「케이씨피M」)은 매출이 아니라 자금 이동이라 제외했습니다`, sub: true }]
            : []),
          ...(plM.rev.dep.transferUnknown > 0
            ? [{ name: `※ 성격이 확인되지 않은 입금 ₩${plM.rev.dep.transferUnknown.toLocaleString('ko-KR')}은 확인될 때까지 매출로 잡지 않았습니다`, sub: true }]
            : []),
          ...(seedEx.amount > 0 ? [{ name: `※ 시연용 테스트 결제 ₩${seedEx.amount.toLocaleString('ko-KR')} (${seedEx.count}건)은 실매출이 아니라 제외했습니다`, sub: true }] : []),
          ...(plGap > 0 ? [{ name: `⚠️ 이 달 통장에 들어온 카드 정산금은 ₩${plCash.pg.toLocaleString('ko-KR')} 인데 장부 매출은 위 금액뿐입니다(차이 ₩${plGap.toLocaleString('ko-KR')}). 매출이 장부에 덜 잡혀 아래 순이익이 실제보다 나쁘게 나옵니다 — 「매출–입금 대사」 카드를 확인하세요.`, sub: true }] : []),
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
          { name: '예수 부가세 (매출 ÷ 11 — 매입세액 공제 전, 추정)', amount: -tax },
        ]},
        { title: 'VII. 당기순이익 (Net Income)', items: [
          { name: '최종 순이익', amount: netIncome, highlight: true, big: true },
        ]},
        /* 💵 장부 손익 «옆에» 통장 사실을 둔다 — 위 순이익은 장부 기준이라 매출
           누락분만큼 나쁘게 나온다. 회사가 실제로 번 돈은 아래 순증감에 가깝다. */
        ...(plCash.n > 0 ? [{ title: '※ 참고 — 통장 기준 실제 현금흐름 (신한 계좌)', items: [
          { name: '실제 입금', amount: plCash.cin },
          { name: '실제 출금', amount: -plCash.cout },
          { name: '순증감 (통장이 실제로 늘거나 준 돈)', amount: plCash.cin - plCash.cout, highlight: true },
          { name: '※ 위 손익은 장부(결제기록) 기준이라 장부에 안 잡힌 매출만큼 나쁘게 나옵니다. 실제로 번 돈은 이 순증감에 가깝습니다.', sub: true },
        ]}] : []),
      ],
      summary: { revenue: rev.revenue, cost: totalCost, net: netIncome, margin_pct: rev.revenue>0?Number(((netIncome/rev.revenue)*100).toFixed(2)):0,
        // 운영비 출처 — actual = 신한 실지출(카드+계좌), estimated = 매출 10% 추정
        opex_source: hasActual ? 'actual' : 'estimated', card_spend: cardSpend, bank_opex: bankOpex, bank_dup_excluded: bankDup,
        seed_excluded_krw: seedEx.amount, seed_excluded_count: seedEx.count,
        deposit_pg_krw: plCash.pg, revenue_gap_krw: plGap,
        cash_in_krw: plCash.cin, cash_out_krw: plCash.cout, cash_net_krw: plCash.cin - plCash.cout },
    };
  }
  else if (type === 'bs') {
    /* 재무상태표 — 예전에는 현금 = 매출×70%, 미수금 = 매출×15%, 고정자산 = 5,000만
       고정값이었다. 셋 다 근거가 없어 «매출이 오르면 자산도 오르는» 표였다.
       이제 있는 것만 넣고, 없는 것은 0 으로 두되 «자료없음» 이라고 밝힌다(2026-08-16). */
    const cash = cashActual ?? 0;
    const totalAssets = cash;
    const payable = unpaidPayroll;
    const taxPayable = tax;
    const totalLiabilities = payable + taxPayable;
    const equity = totalAssets - totalLiabilities;
    const missing = ['미수금(학생 미납)', '유형자산(장비·집기)', '기타 예금·보증금'];
    data = {
      ok: true, type: 'bs', period, label: `재무상태표 (BS) — ${label} 말 기준`,
      partial: true,
      sections: [
        { title: 'I. 자산 (Assets)', items: [
          { name: '1. 유동자산', sub: true },
          { name: cashActual == null ? '  현금 및 현금성자산 (계좌 자료 없음)' : '  현금 및 현금성자산 (신한 계좌 월말 잔액·실데이터)', amount: cash },
          { name: '  미수금 (학생 미납) — 자료없음', amount: 0 },
          { name: '2. 비유동자산', sub: true },
          { name: '  유형자산 (장비·집기) — 자산대장 없음', amount: 0 },
          { name: '자산 총계 (확인된 것만)', amount: totalAssets, total: true, highlight: true },
        ]},
        { title: 'II. 부채 (Liabilities)', items: [
          { name: '1. 유동부채', sub: true },
          { name: '  미지급금 (미지급 강사급여·실데이터)', amount: payable },
          { name: '  예수 부가세 (매출 ÷ 11, 추정)', amount: taxPayable },
          { name: '부채 총계 (확인된 것만)', amount: totalLiabilities, total: true, highlight: true },
        ]},
        { title: 'III. 자본 (Equity)', items: [
          { name: '자산 − 부채', amount: equity, highlight: true, big: true },
        ]},
        { title: '⚠ 아직 담지 못한 항목', items: missing.map(m => ({ name: `  ${m}`, sub: true })) },
      ],
      summary: { assets: totalAssets, liabilities: totalLiabilities, equity,
        cash_source: (cashActual == null ? 'none' : 'actual') as FigureSource, missing },
      notes: ['이 표는 «완전한 재무상태표가 아닙니다». 통장 잔액과 미지급 급여처럼 시스템이 실제로 아는 것만 담았습니다. 자산대장·미수금 명세를 등록하면 그때 완성됩니다.'],
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
    /* 시산표 — 차변 합계와 대변 합계는 «반드시» 같아야 하는 표인데, 예전에는
       서로 상관없는 숫자를 양쪽에 늘어놓아 2026년 7월 기준 6,461만원이나 어긋났다.
       회계에서 이건 «표가 틀렸다» 는 뜻이다.

       이제 그 달의 거래를 실제 분개(전표)로 세우고, 그 잔액을 모아 만든다:
         매출 발생   차) 현금        대) 매출
         강사 급여   차) 인건비      대) 현금
         PG 수수료   차) 지급수수료  대) 현금
         운영비      차) 운영비      대) 현금
         환불        차) 매출환입    대) 현금
         부가세      차) 세금과공과  대) 현금
       이렇게 하면 차변 합 = 대변 합 이 «구조적으로» 보장된다. */
    const cashDelta = rev.revenue - payrollEff - pgFee - opCost - tax - ax.refunds;
    const lines = [
      { name: '현금 (당월 증감)', amount: Math.abs(cashDelta), debit: cashDelta >= 0, credit: cashDelta < 0 },
      { name: '인건비 (강사 급여)', amount: payrollEff, debit: true },
      { name: '지급수수료 (PG)', amount: pgFee, debit: true },
      { name: '운영비 (판관비)', amount: opCost, debit: true },
      { name: '세금과공과 (예수 부가세)', amount: tax, debit: true },
      ...(ax.refunds > 0 ? [{ name: '매출환입 (학생 환불)', amount: ax.refunds, debit: true }] : []),
      { name: '매출', amount: rev.revenue, credit: true },
    ].filter(l => l.amount !== 0);
    const debitTotal = lines.filter(l => l.debit).reduce((a, l) => a + l.amount, 0);
    const creditTotal = lines.filter(l => l.credit).reduce((a, l) => a + l.amount, 0);
    data = {
      ok: true, type: 'tb', period, label: `시산표 (Trial Balance) — ${label}`,
      sections: [{ title: '계정과목별 잔액 (당월 발생분)', items: lines }],
      summary: {
        debit_total: debitTotal,
        credit_total: creditTotal,
        balanced: debitTotal === creditTotal,
        difference: debitTotal - creditTotal,
      },
      notes: [
        '당월에 «발생한» 거래만 담은 시산표입니다(이월 잔액은 포함하지 않습니다).',
        debitTotal === creditTotal ? '차변 합계와 대변 합계가 일치합니다.' : '⚠ 차변과 대변이 어긋납니다 — 개발자에게 알려 주세요.',
      ],
    };
  }
  else {
    return err('unknown type: ' + type + ' (use pl|bs|cf|tb)');
  }

  if (fmt === 'csv' || fmt === 'xlsx') {
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
    return out(fmt, `statement-${type}-${period}.csv`, rows);
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
    const r = await env.DB.prepare(`SELECT COALESCE(SUM(payment_krw),0) AS p, COUNT(*) AS cnt FROM payslips WHERE period=? AND ${realPayslipSql()}`)
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
  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, `tax-${period}.csv`, [
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
      WHERE period=? AND ${realPayslipSql()} ORDER BY payment_krw DESC LIMIT 200
    `).bind(period).first ? await env.DB.prepare(`
      SELECT id, teacher_id, period, payment_krw FROM payslips
      WHERE period=? AND ${realPayslipSql()} ORDER BY payment_krw DESC LIMIT 200
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

  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, `journal-${period}.csv`, [
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
        WHERE COALESCE(p.paid, 0) = 0 AND ${realPayslipSql('p')}
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

  /* 🧾 «200명만 0원으로» 보여 주던 표를 고쳤다 (2026-08-16).
     학생 미수금은 전체 대상 인원이 2만 명이 넘는데 200명만 잘라 보여 주고 금액은 전부
     0원이었다(수강료 단가 자료가 없다). 잘랐다는 사실과 금액을 못 구한 이유를 밝힌다. */
  const rNotes: string[] = [];
  let candidates = totals.count;
  if (kind === 'receivable') {
    candidates = await safe(async () => {
      const r = await env.DB.prepare(`
        SELECT COUNT(*) AS c FROM students_erp
        WHERE status IN ('정상','활동','active') AND end_date IS NOT NULL AND end_date < ?
      `).bind(todayKst).first<{ c: number }>();
      return Number(r?.c) || 0;
    }, totals.count);
    if (candidates > rows.length) rNotes.push(`대상 ${candidates.toLocaleString('ko-KR')}명 중 경과일이 긴 ${rows.length}명만 표시했습니다.`);
    rNotes.push('금액이 모두 0원인 이유: 학생별 수강료 단가가 시스템에 없어 미납액을 계산할 수 없습니다. 수강료 정보를 등록하면 금액이 채워집니다.');
    rNotes.push('원부에 퇴원 처리가 안 된 옛 학생이 섞여 있을 수 있습니다 — 실제 미수금과 다를 수 있습니다.');
  } else if (kind === 'pending') {
    rNotes.push('가맹점 정산 금액은 「🏢 가맹점별 정산서」에서 학생 단위로 정확히 계산합니다.');
  }

  const data = { ok: true, type: 'receivables', kind, label, rows, totals, candidates, notes: rNotes,
    amount_source: (kind === 'receivable' ? 'none' : 'actual') as FigureSource };

  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, `receivables-${kind}.csv`, [
      [label],
      ...rNotes.map(n => [n] as (string | number)[]),
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
  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, 'payments.csv', [
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
  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, 'refunds.csv', [
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
     · 예상 입금 = 장부 매출 × (1 − PG 수수료). 요율은 PG_FEE_RATE 한 곳에서 온다
     · 카드 결제는 PG(케이씨피)가 며칠 뒤 정산해 넣어 주므로 **월 단위로는 어긋나는
       것이 정상**이다. 그래서 «누적 합계» 줄을 함께 준다 — 시차는 누적에서 상쇄된다.
       판정도 누적을 기준으로 본다.
     · 기타 입금(국세 환급·타행 이체 등)은 수업료가 아니라서 «참고» 로만 보여 준다.
   ⚠️ 계좌 연동(바로빌) 이전 달은 입금 데이터 자체가 없다 → 판정하지 않고
      «입금자료 없음» 으로 표시한다(0원을 «미입금» 으로 오해하면 안 된다). */
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

  /* 🏦 통장 입금을 성격별로 나눈다 (2026-08-16 전면 수정).
     ⛔ 예전: `remark LIKE '%케이씨피%'` → 「케이씨피M」(하나은행에서 사람이 보낸 돈)까지
        PG 정산으로 세어, 2026-03~07 누적 4,632만원이 «장부에 없는 매출» 로 오진됐다.
     ✅ 지금: classifyDeposit() 로 pg / b2b(수업료 직접입금) / transfer(확인 필요) / other. */
  const depRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT substr(trans_at,1,7) AS ym, COALESCE(remark,'') AS remark, amount
      FROM bankacct_transactions WHERE kind='in'
    `).all();
    const rows = (r.results || []) as Array<{ ym: string; remark: string; amount: number }>;
    const agg = new Map<string, { ym: string; pg: number; b2b: number; transfer: number; other: number }>();
    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      const cur = agg.get(row.ym) || { ym: row.ym, pg: 0, b2b: 0, transfer: 0, other: 0 };
      cur[classifyDeposit(row.remark, amount)] += amount;
      agg.set(row.ym, cur);
    }
    return [...agg.values()];
  }, [] as Array<{ ym: string; pg: number; b2b: number; transfer: number; other: number }>);
  // 계좌 데이터가 언제부터 있는지 — 그 전 달은 «판정 불가»
  const bankFrom = await safe(async () => {
    const r = await env.DB.prepare(`SELECT MIN(substr(trans_at,1,7)) AS m FROM bankacct_transactions`).first<{ m: string }>();
    return r?.m || '';
  }, '');

  const revMap = new Map(revRows.map(r => [r.ym, r]));
  const depMap = new Map(depRows.map(r => [r.ym, r]));

  let cumRev = 0, cumPg = 0, cumB2b = 0, cumTransfer = 0;
  const rows = list.map(ym => {
    const rv = revMap.get(ym);
    const dp = depMap.get(ym);
    const revenue = Number(rv?.revenue) || 0;
    const pg = Number(dp?.pg) || 0;
    const b2b = Number(dp?.b2b) || 0;
    const transfer = Number(dp?.transfer) || 0;
    const other = Number(dp?.other) || 0;
    const expected = Math.round(revenue * (1 - PG_FEE_RATE));
    const hasBank = !!bankFrom && ym >= bankFrom;
    cumRev += revenue; cumPg += pg; cumB2b += b2b; cumTransfer += transfer;
    return {
      period: ym, revenue, pay_count: Number(rv?.cnt) || 0,
      expected, deposit_pg: pg, deposit_b2b: b2b, deposit_transfer: transfer, deposit_other: other,
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

  /* 차이의 «방향» 에 따라 원인이 정반대다. 한 문구로 뭉뚱그리면 오진한다(2026-08-16):
       · 입금 < 예상 → 장부에만 있는 매출(가짜·미수금) 의심
       · 입금 > 예상 → 통장에 들어왔는데 장부에 안 잡힌 매출(동기화 누락) 의심 */
  const short = cumDiff < 0;
  const MSG: Record<typeof verdict, string> = {
    ok: '장부와 통장이 맞습니다(누적 오차 10% 이내 — PG 정산 시차 범위).',
    warn: short
      ? '통장에 들어온 돈이 장부보다 10% 이상 적습니다. 정산 시차인지 미수금인지 KCP 정산내역을 확인하세요.'
      : '통장에 들어온 돈이 장부보다 10% 이상 많습니다. 장부에 안 잡힌 매출이 있는지(결제 동기화 누락) 확인하세요.',
    alert: short
      ? '통장 입금이 장부보다 25% 이상 적습니다. 장부에만 있는 매출이거나 미수금일 수 있습니다 — 확인이 필요합니다.'
      : '통장 입금이 장부보다 25% 이상 많습니다. **매출이 장부에 덜 잡히고 있습니다**(결제 동기화 누락 의심) — 확인이 필요합니다.',
    no_data: '계좌 연동 이전 기간이라 입금 자료가 없습니다. 「신한 동기화」 후 다시 보세요.',
  };

  const data = {
    ok: true, type: 'reconcile', months, end: endMonth,
    label: `매출–입금 대사 — ${list[0]} ~ ${list[list.length - 1]}`,
    pg_fee_rate: PG_FEE_RATE, bank_data_from: bankFrom || null,
    rows,
    totals: {
      revenue: cumRev, expected: cumExpected, deposit_pg: cumPg,
      deposit_b2b: cumB2b, deposit_transfer: cumTransfer,
      diff: cumDiff, diff_pct: Number(cumPct.toFixed(1)),
    },
    verdict, message: MSG[verdict],
    /* 🔎 «PG 정산이 아닌 타계좌 입금» 은 판정에서 뺐다. 대신 얼마인지 밝혀 사람이 확인하게 한다. */
    transfer_note: cumTransfer > 0
      ? `이 기간 「케이씨피M」처럼 PG 정산이 아닌 타계좌 입금이 ₩${cumTransfer.toLocaleString('ko-KR')} 있습니다(하나은행에서 인터넷뱅킹으로 보낸 돈). 운영자금 이체인지 매출인지 확인이 필요해 대사에서는 제외했습니다.`
      : '',
    b2b_note: cumB2b > 0
      ? `통장으로 직접 들어온 수업료 ₩${cumB2b.toLocaleString('ko-KR')} 는 카페24를 거치지 않아 장부에 없습니다. 월간 리포트에서는 매출로 반영했습니다.`
      : '',
  };

  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, `reconcile-${endMonth}.csv`, [
      ['망고아이 매출–입금 대사', data.label],
      [`PG 수수료 가정 ${(PG_FEE_RATE * 100).toFixed(2)}%`],
      ['※ 「케이씨피」(기업은행 자동정산)만 PG 입금으로 셉니다. 「케이씨피M」(하나은행 수동송금)은 PG 정산이 아니라 제외했습니다.'],
      [],
      ['월', '장부 매출', '결제건수', '예상 입금(수수료 차감)', '실제 PG 정산 입금', '차이', '통장 직접입금(B2B)', '타계좌 입금(확인 필요)', '기타 입금'],
      ...rows.map(r => [r.period, r.revenue, r.pay_count, r.expected, r.has_bank ? r.deposit_pg : '(자료없음)',
        r.diff == null ? '-' : r.diff, r.deposit_b2b, r.deposit_transfer, r.deposit_other]),
      ['누적 합계', cumRev, '', cumExpected, cumPg, cumDiff, cumB2b, cumTransfer, ''],
      [],
      ['판정', data.message],
      ...(data.transfer_note ? [['참고', data.transfer_note]] : []),
      ...(data.b2b_note ? [['참고', data.b2b_note]] : []),
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
