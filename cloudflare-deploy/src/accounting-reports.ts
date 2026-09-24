/**
 * accounting-reports.ts — 회계 리포트 6종
 *
 *   GET /api/admin/reports/monthly?period=YYYY-MM        월간 회계 리포트
 *   GET /api/admin/reports/quarterly?year=YYYY&q=N       분기 보고서 (N: 1-4)
 *   GET /api/admin/reports/annual?year=YYYY              연간 결산
 *   GET /api/admin/reports/franchise?period=YYYY-MM      가맹점별 정산서 (장부 결제 + B2B 직접입금)
 *   GET/POST /api/admin/reports/b2b-payees               B2B 통장 입금 → 지사 지정
 *   GET /api/admin/reports/payslips?period=YYYY-MM       강사별 급여명세서 (전체)
 *   GET /api/admin/reports/kpi?period=YYYY-MM            경영지표 (LTV·CAC·ROI·이익률)
 *   GET /api/admin/reports/statement?type=pl|bs|cf|tb&period=YYYY-MM|YYYY-Qn  재무제표(월·분기)
 *   GET /api/admin/reports/tax?period=YYYY-MM            세무 자료 (부가세·원천세)
 *   GET /api/admin/reports/journal?period=YYYY-MM        회계 전표 / 분개장
 *   GET /api/admin/reports/receivables?kind=receivable|payable|pending  미수금/미지급금
 *   GET /api/admin/reports/payments-list?from=&to=&method=&status=  학생 결제 내역
 *   GET /api/admin/reports/refunds-list?status=          환불/취소 내역 (학생이름·아이디·결제일자 포함)
 *
 *   format=json  (기본)  → JSON
 *   format=csv          → text/csv 다운로드
 *
 * 모든 쿼리는 student_payments / students_erp / attendance / payslips / teachers /
 * franchises / centers / enrollments 등 기존 테이블을 사용. 누락된 테이블이 있어도
 * try/catch 로 0 으로 graceful degradation (api-mango.ts 패턴 동일).
 */

import { getScope, type Scope } from './scope';
import { selectInChunks } from './d1-chunk';   // 🔢 IN 목록은 공용 헬퍼로 — D1 바인드 100개 한도
import { forbiddenTeacherBody } from './forbidden-teacher';   // 🪪 「강사 권한으로는 …」 문구 정본(계정 이름 포함) — 복제 금지
// 🧾 수수료율 판정은 정산관리(org-settlement)와 **같은 것**을 쓴다 — 그 파일 주석 참고
import { loadRateOverrides, resolveHqRate, DEFAULT_HQ_RATE, type RateOverrides } from './org-settlement';
import { xlsxResponse, type Sheet as XlsxSheet } from './xlsx';   // 📊 진짜 엑셀(.xlsx) 내보내기
import { buildScheduleSummary } from './schedule-summary';        // 📅 시간표 카드 숫자(회계 아님 — 라우터만 빌려 씀)
import { sceneHomeworkRouter } from './scene-homework';   // ✍️ 쓰기 숙제 현황·학부모 안내(회계 아님 — 라우터만 빌려 씀)
import { bankacctStatus } from './bankacct-sync';   // 🏦 계좌 연동 상태 한 줄 — «왜 비어 있는지» 를 화면에 그대로 말해 준다   // 🔒 마감·해제는 본사(hq)만 — 권한 판정은 scope.ts 한 곳에서
import { c24MirrorReport, applyMirror, setMirrorMode, setMirrorTeacher, clearMirrorTeacher } from './c24-mirror';  // 🪞 카페24 → 망고아이 시간표 미러
import { getAdminActor, isOrgScopedRole } from './auth-admin';   // 🔐 쓰기 API 는 강사·조직계정을 각각 따로 막는다
import { runCypher } from './teacher-match';        //    ↑ 가 쓰는 Neo4j 조회기 — 주입해서 넘긴다(테스트에서 갈아끼우려고)

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

/* ⏳ PG 정산 시차 (2026-08-18 실측) ─────────────────────────────────────
   케이씨피는 **주 1회**(7~8일 간격) 정산해 넣지만, 결제일부터 입금까지는 그보다 길다.
   그래서 월초 결제분이 그 달 정산에 안 잡히고 다음 회차로 밀린다(2026-04-01·06-01·
   07-01 의 큰 결제가 전부 그랬다). 누적 곡선을 0~35일 시차로 맞춰 본 결과 **2~4주**
   구간에서 가장 잘 겹쳤다. 여기서는 그 중간인 21일을 쓴다.

   [왜 필요한가] 「통장 기준」 으로 바꿔도 이 문제는 안 없어진다. 같은 달끼리 빼면
   창의 양 끝이 서로 **다른 결제**를 보고 있기 때문이다:
     · 창 끝   — 최근 결제는 아직 정산 전이라 통장에 없다(기본값이 «이번 달» 이라 늘 걸린다)
     · 창 시작 — 첫 입금들은 창 이전 결제분이라 장부에 없다
   6개월 창이면 꼬리 한 달이 통째로 «미입금» 으로 잡혀, 매번 한 방향으로 «통장이 적다»
   가 나온다. 이 상수로 양쪽 끝을 잘라 같은 결제를 보는 구간끼리 비교한다.

   ⚠️ 추정치다. KCP 정산명세서를 받으면 실제 시차로 바꿀 것 — 이 한 곳만 고치면
      대사·월간 배너·화면이 함께 따라온다. */
const PG_SETTLE_LAG_DAYS = 21;

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
/* 💳 «KCP 정산 대상 결제» 만 고르는 조건 (2026-08-18 사장님 지시로 신설)

   [왜] 매출–입금 대사의 기준이 **통장의 「케이씨피」 입금** 으로 바뀌었다. 통장에는
   KCP 가 정산해 준 카드 결제분만 「케이씨피」로 찍힌다. 그런데 장부(student_payments)
   에는 계좌이체·가상계좌처럼 **KCP 를 아예 안 거치는 결제**도 섞여 있다. 그걸 함께
   세면 «장부에는 있는데 통장에 안 들어온 돈» 이 구조적으로 생겨 대사가 늘 어긋난다.
   ⚠️ 대사·PG 판정 전용이다. 회사 «매출» 자체(monthRevenue.total, 손익·월간 리포트)는
      여전히 결제수단을 가리지 않는다 — 계좌이체도 매출은 매출이다. 여기를 매출 계산에
      끌어다 쓰면 매출이 통째로 줄어 보인다.
   📌 2026-08-18 실데이터: 시드를 뺀 결제는 method 가 'card'(11,091건)·'카드'(2건)뿐이라
      이 조건으로 빠지는 실매출은 현재 0원이다. 규칙을 명시해 두는 쪽이 안전하다. */
export function kcpSettledSql(a = ''): string {
  const q = a ? a + '.' : '';
  return `LOWER(COALESCE(${q}method,'')) IN ('card','카드','신용카드','creditcard','credit','kcp','케이씨피','정기결제','자동결제')`;
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

/* 🏷️ 「남궁국화」·「남궁국화A」= 지사수수료 (2026-08-19 사장님 확인).
   전에는 bankacct-sync.ts 의 직원급여 이름 목록에 잘못 들어가 있었다 — 거기서 뺐으니
   이제 「기타출금」으로 내려오는데, franchises.owner_name 자동매칭이 «남궁국화A» 같은
   변형 표기까지 잡아 준다는 보장이 없어 여기 직접 하드코딩해 둔다. */
const KNOWN_FRANCHISE_PAYEE_RE = /^남궁국화A?$/;

/* ── 🧭 계정과목 판정 «한 곳» (2026-08-23) ──────────────────────────────────
   [왜 함수로 뺐나] 이 판정은 원래 monthActualOpex() 안에만 있었다. 그래서 손익계산서는
   계정과목 13종으로 보는데, 계좌 원장을 그리는 화면은 DB 의 category(9종)밖에 못 보아
   **같은 달인데 두 화면의 분류가 어긋나는** 구조였다. 판정을 복제하지 말고 한 함수로
   모은다(같은 뿌리의 선례: src/no-show-truth.ts).
   ⚠️ DB 의 category 를 덮어쓰지 않고 «읽을 때» 판정한다 — 지정한 것이 동기화(배포
      권한자만 실행)를 기다리지 않고 바로 반영되게. 원본(적요·금액)은 절대 안 건드린다. */
export interface ExpenseAccountRules {
  payees: Map<string, string>;   // 사람이 지정한 거래처 → 계정과목 (expense_payee_category)
  owners: Set<string>;           // 지사 대표자명 (franchises.owner_name)
}

/** 판정에 필요한 표 두 개를 한 번에 읽어 둔다. 행마다 쿼리하지 않기 위해 분리했다.
 *  ⛔ 여기서 읽기 실패를 `safe()` 로 삼키지 말 것 — 빈 목록으로 이어가면 **에러 없이**
 *     「지사수수료 0원」이 되어 손익계산서가 틀린 채로 그려진다. 부르는 쪽이 판단하도록
 *     그대로 던진다(`monthActualOpex` 는 쪼개기를 통째로 포기해 「기타출금」 한 덩어리로
 *     남기고, `bankExpensesReport` 는 화면에 숫자 대신 오류를 낸다).
 *     같은 모양의 사고: CLAUDE.md 2장 「`erp-list` 는 어떤 에러든 삼켜 빈 배열을 주므로…」 */
export async function loadExpenseAccountRules(env: Env): Promise<ExpenseAccountRules> {
  await ensurePayeeTable(env);
  const payees = new Map<string, string>();
  const mp: any = await env.DB.prepare(`SELECT payee, category FROM expense_payee_category`).all();
  for (const r of ((mp.results || []) as Array<{ payee: string; category: string }>)) payees.set(r.payee, r.category);
  const owners = new Set<string>();
  const ow: any = await env.DB.prepare(`SELECT DISTINCT owner_name FROM franchises WHERE COALESCE(owner_name,'') <> ''`).all();
  for (const r of ((ow.results || []) as Array<{ owner_name: string }>)) owners.add(String(r.owner_name).trim());
  return { payees, owners };
}

/** 계좌 출금 한 행 → 계정과목.
 *  저장된 category 가 「기타출금」일 때만 쪼개고, 나머지 9종(급여이체·카드대금 등)은 그대로 둔다. */
export function resolveExpenseAccount(rules: ExpenseAccountRules, remark: string, storedCategory?: string): string {
  const stored = String(storedCategory || '') || UNCLASSIFIED;
  if (stored !== UNCLASSIFIED) return stored;
  const base = payeeBase(remark);
  const hit = rules.payees.get(base) || rules.payees.get(String(remark || '').trim());
  if (hit) return hit;
  if (KNOWN_FRANCHISE_PAYEE_RE.test(base)) return '지사수수료';
  if (base && rules.owners.has(base) && !looksCorporate(remark)) return '지사수수료';
  return UNCLASSIFIED;
}

/** 그 계정과목이 판관비 합계에서 어떻게 취급되는가 — 화면과 손익계산서가 같은 말을 하게. */
export type ExpenseRole = 'opex' | 'dup' | 'moved' | 'review';
export function expenseRoleOf(account: string): ExpenseRole {
  if (OPEX_DUP_CATEGORIES.includes(account)) return 'dup';       // 카드·급여명세와 이중계상 → 합계에서 제외
  if (OPEX_MOVED_CATEGORIES.includes(account)) return 'moved';   // 강사급여·매출차감 줄로 간 돈
  if (account === UNCLASSIFIED) return 'review';                 // 아직 계정과목이 없는 돈
  return 'opex';
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
    const rows = await env.DB.prepare(`
      SELECT COALESCE(remark,'') AS remark, amount FROM bankacct_transactions
      WHERE kind='out' AND COALESCE(category,'기타출금')=? AND substr(trans_at,1,7)=?
    `).bind(UNCLASSIFIED, period).all();
    /* 🧭 판정은 resolveExpenseAccount() 한 곳에서 — 계좌 원장 화면
       (/api/admin/reports/bank-expenses)도 같은 함수를 쓴다. 여기서 규칙을 다시 적으면
       두 화면의 분류가 조용히 갈라진다(2026-08-23 에 함수로 뺀 이유). */
    const rules = await loadExpenseAccountRules(env);

    const byCat = new Map<string, number>();
    let unresolved = 0;
    for (const r of ((rows.results || []) as Array<{ remark: string; amount: number }>)) {
      const amt = Number(r.amount) || 0;
      const cat = resolveExpenseAccount(rules, r.remark, UNCLASSIFIED);
      if (cat === UNCLASSIFIED) unresolved += amt;
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
   ⚠️ 「케이씨피M」의 정체는 2026-08-17 에 사장님이 확인해 줬다 — 자기 계좌 간 자금 이동이다.
      2026-08-18 지시로 리포트 어디에도 표시하지 않는다(아래 KNOWN_TRANSFER_RE 참고).
      정체를 모르는 다른 변형이 새로 나타나면 그건 여전히 «확인 필요» 로 따로 센다.

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

/* 🧾 카페24 회계장부(Neo4j AccBook)에서도 같은 「케이씨피M」을 걸러내기 위한 정본 (2026-08-18).

   [무엇이 틀렸었나] 관리자 「정산·매출 > 카페24 회계 실데이터」 화면의 매출·손익 추이는
   AccBook 을 type(1=수입/2=지출)만 보고 통째로 더하고 있었다. 그래서 하나은행에서 옮겨 온
   운영자금(「케이씨피M」)이 그대로 «매출» 로 잡혀 총 매출·순이익·영업이익률이 부풀었다.
   통장(bankacct_transactions) 쪽은 위 classifyDeposit() 이 이미 걸러내고 있었는데
   회계장부 쪽에는 그런 판정이 없었다 — 판정을 여기 한 곳에 두고 양쪽이 같이 쓴다.

   ⚠️ Neo4j 는 TS 정규식을 못 쓰므로 **Cypher(`=~`, Java 정규식) 문자열**을 함께 내보낸다.
      둘은 같은 규칙이어야 한다. **한쪽만 고치지 말 것.**
   ⚠️ 「케이씨피」(= 진짜 PG 정산금)는 절대 걸리면 안 된다. M 이 붙은 것만 제외 대상이다.
      그래서 `M` 뒤에 단어경계(`\b`)를 요구한다 — 「케이씨피MONEY」 같은 엉뚱한 말은 안 걸린다. */
export const KCP_TRANSFER_CYPHER_RE = '(?is).*(케이씨피\\s*M|KCP\\s*M)\\b.*';
const KCP_TRANSFER_TEXT_RE = /(케이씨피\s*M|KCP\s*M)\b/i;

/** 회계장부 한 줄이 「케이씨피M」(= 매출이 아닌 자금이동)인가.
    거래처·적요·계정과목 중 어디에 적혀 있어도 잡는다(카페24 입력자가 자리를 가리지 않는다). */
export function isKcpTransferRow(...fields: Array<string | null | undefined>): boolean {
  return fields.some(f => KCP_TRANSFER_TEXT_RE.test(String(f || '')));
}

/* 🧾 «무엇을 매출로 인정하는가» 정본 (2026-08-18 — 수정사항 5번 블럭 사장님 지시).

   [바뀐 정책] 예전에는 「수입(type=1) 전부 − 케이씨피M」을 매출로 잡았다. 즉 거래처가
   무엇이든 수입이면 매출이었다. 지시는 그 반대다 — **「케이씨피」 거래 내역만 매출로 인식**한다.

   ⚠️ 그래서 거래처·적요·계정과목 어디에도 「케이씨피」가 없는 수입 행은 **매출에서 빠진다.**
      총매출이 예전보다 줄어 보이는 것은 버그가 아니라 이 정책 변경의 결과다.
      되돌리려면 사람에게 먼저 물을 것(임의로 「수입 전부」로 넓히지 말 것).
   ⚠️ 「케이씨피M」은 여기에도 걸리지만(둘 다 「케이씨피」로 시작), 집계에서는
      `isKcp AND NOT isKcpm` 으로 쓴다 — M 은 자금이동이라 매출이 아니다.
      **두 판정은 짝이다. 한쪽만 쓰면 케이씨피M 이 매출로 되살아난다.**
   ⚠️ 위 KCP_TRANSFER 와 같은 이유로 TS·Cypher 두 벌을 내보낸다. 한쪽만 고치지 말 것. */
export const KCP_REVENUE_CYPHER_RE = '(?is).*(케이씨피|KCP).*';
const KCP_REVENUE_TEXT_RE = /(케이씨피|KCP)/i;

/** 회계장부 한 줄이 「케이씨피」 결제분(= 매출로 인정)인가.
    ⚠️ 「케이씨피M」도 true 가 된다 — 매출 판정은 반드시 `isKcpRevenueRow(...) &&
    !isKcpTransferRow(...)` 로 짝지어 쓸 것. */
export function isKcpRevenueRow(...fields: Array<string | null | undefined>): boolean {
  return fields.some(f => KCP_REVENUE_TEXT_RE.test(String(f || '')));
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
  /** transfer 중 정체가 확인된 자기 계좌 간 자금 이동 — 리포트에는 표시하지 않는다 */
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
  /* 💳 그중 «KCP 정산 대상» 만 따로 — 대사(장부 vs 통장) 전용 수치다(2026-08-18).
     매출 합계(total)는 건드리지 않는다. 대사만 통장의 「케이씨피」와 짝이 맞아야 한다. */
  const bookPg = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()} AND ${kcpSettledSql()}
    `).bind(startMs, endMs).first<{ revenue: number }>();
    return Number(r?.revenue) || 0;
  }, 0);
  const dep = await monthDeposits(env, period);
  return {
    book: Number(book.revenue) || 0,          // 카페24 등 결제 장부
    bookPg,                                    // 그중 KCP 정산 대상만 (대사 전용)
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
    // 📅 시간표 요약 — 회계가 아니라 «관리자 대시보드 시간표 카드의 숫자» 다.
    //    여기 얹은 이유는 하나뿐이다: 이 prefix 가 ①인증 ②라우팅 ③강사 차단을 이미 들고 있어
    //    src/index.ts(공동 금지구역)를 한 줄도 안 건드린다(바로 아래 월 마감과 같은 사정).
    //    ⛔ 계산은 이 파일에 적지 말 것 — 정본은 src/schedule-summary.ts 하나다.
    if (p === 'schedule-summary') {
      /* 읽기 전용이다. 메서드를 안 가리면 나중에 이 경로에 다른 뜻이 붙을 때
         «모르는 요청» 이 조용히 흘러 들어간다(CLAUDE.md 「비어 있는 메서드에 얹을 때」). */
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
      const s = await buildScheduleSummary(env as any);
      return new Response(JSON.stringify({ ok: true, ...s }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
      });
    }
    // ✍️ 교재 낱말 쓰기 숙제 — 정본은 src/scene-homework.ts (여기는 부르기만)
    if (p === 'scene-homework' || p === 'scene-homework-notify') {
      const r = await sceneHomeworkRouter(env as any, request, url, p);
      if (r) return r;
    }
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
    // 🏦 신한 계좌 «출금» 원장 — 계정과목·거래처별로 쪼개서 본다(2026-08-23)
    if (p === 'bank-expenses') return await bankExpensesReport(env, request, url, fmt);
    // 🧾 배정 못 한 결제 아이디 — 목록 + 지사 직접 지정
    if (p === 'payers') return await payersRouter(env, request, url);
    // 🏦 배정 못 한 B2B 통장 입금 — 목록 + 지사 직접 지정 (2026-08-18)
    if (p === 'b2b-payees') return await b2bPayeesRouter(env, request, url);
    // 👤 역할별 «실제» 직원 명부 (2026-08-30, v4 제안서 12)
    if (p === 'staff-roles') return await staffRolesReport(env, url);
    // 🧑‍🏫 강사 한 명의 «실제» 수업 기록 (2026-08-30, v4 제안서 15)
    if (p === 'teacher-classes') return await teacherClassesReport(env, url);
    /* 🪞 카페24 → 망고아이 시간표 미러 «그림자 리포트» (2026-08-31)
       읽기만 한다 — 「옮겼다면 어떻게 됐을지」를 세어 보여 줄 뿐 아무것도 만들지 않는다.
       ⚠️ 여기 붙인 이유: `/api/admin/reports/` 는 인증·라우팅·강사차단 게이트에 이미
          등록돼 있어 index.ts(공동 금지구역)를 한 줄도 안 건드려도 된다(CLAUDE.md 2장). */
    if (p === 'c24-mirror') {
      const since = url.searchParams.get('since') || undefined;
      const until = url.searchParams.get('until') || undefined;
      try {
        const r = await c24MirrorReport(env as any, runCypher as any, { since, until });
        return json(r);
      } catch (e: any) {
        // Neo4j 가 안 되면 «리포트를 못 냈다» 고 말한다 — 0건을 «깨끗함» 으로 보고하지 않는다
        return json({ ok: false, error: 'c24_unreachable', message: String(e?.message || e) }, 502);
      }
    }

    /* 🔧 미러 «실행» (쓰기) — 2026-08-31 사장님 승인 「Ana 한 사람만 켜서 실제로 만들어 보자」
         POST /api/admin/reports/c24-mirror/apply     { dry_run?, since?, until?, only_teacher_id? }
         POST /api/admin/reports/c24-mirror/mode      { mode: 'off'|'whitelist'|'all' }
         POST /api/admin/reports/c24-mirror/teacher   { teacher_id, action:'on'|'off'|'block', note? }

       🔐 게이트가 **둘**이다. 하나로 뭉치면 반드시 새어 나간다(CLAUDE.md 2장):
         · 강사      — getAdminActor().isTeacher
         · 지사·대리점 — isOrgScopedRole(role)
       ⛔ canEditOrg() 로 막지 말 것 — 그 함수는 'none'(내부직원·**교사**)에도 true 다. */
    if (p.startsWith('c24-mirror/')) {
      if (request.method.toUpperCase() !== 'POST') return err('method not allowed', 405);
      const actor = await getAdminActor(request, env as any);
      if (actor.isTeacher) return json(forbiddenTeacherBody(actor), 403);
      if (isOrgScopedRole((actor as any).role)) return json({ ok: false, error: 'forbidden_scope' }, 403);
      const body: any = await request.json().catch(() => ({}));

      if (p === 'c24-mirror/mode') {
        const m = String(body?.mode || '');
        if (m !== 'off' && m !== 'whitelist' && m !== 'all') return json({ ok: false, error: 'invalid_mode' }, 400);
        await setMirrorMode(env as any, m);
        return json({ ok: true, mode: m });
      }
      /* 🔴 (2026-09-02) 상태가 «세» 가지다 — action 으로 갈라 받는다.
           'on'    = 켜짐 (enabled = 1)
           'off'   = 꺼짐 (행 삭제 — 아직 안 켬. 언제든 다시 켤 수 있다)
           'block' = 막힘 (enabled = 0 — 전환일 mode='all' 에서도 안 만든다)
         ⚠️ 옛 계약 호환: `{ enabled: false }` 는 **'off'(꺼짐)** 로 받는다.
            화면의 «끄기» 버튼이 그 몸짓이었고, 사람이 기대한 뜻도 «명단에서 빼기» 였다.
            그것을 «막힘» 으로 받았다가 화면에 되돌릴 길이 없어진 것이 이 수리의 발단이다.
            «막기» 는 action:'block' 이라고 **명시할 때만** 한다. */
      if (p === 'c24-mirror/teacher') {
        const tid = String(body?.teacher_id ?? '').trim();
        if (!tid) return json({ ok: false, error: 'teacher_id_required' }, 400);
        const act = String(body?.action ?? (body?.enabled === false ? 'off' : 'on')).toLowerCase();
        if (act !== 'on' && act !== 'off' && act !== 'block') return json({ ok: false, error: 'invalid_action' }, 400);
        if (act === 'off') {
          const removed = await clearMirrorTeacher(env as any, tid);
          return json({ ok: true, teacher_id: tid, action: 'off', removed });
        }
        await setMirrorTeacher(env as any, tid, act === 'on', actor.name || 'admin',
          body?.note == null ? undefined : String(body.note).slice(0, 200));
        return json({ ok: true, teacher_id: tid, action: act, enabled: act === 'on' });
      }
      if (p === 'c24-mirror/apply') {
        try {
          /* ⛔ dry_run 은 «명시적으로 false 일 때만» 실행이다.
             빠뜨리거나 오타가 나면 «세어 보기» 로 안전하게 떨어진다. */
          const r = await applyMirror(env as any, runCypher as any, {
            since: url.searchParams.get('since') || body?.since || undefined,
            until: url.searchParams.get('until') || body?.until || undefined,
            dry_run: body?.dry_run === false ? false : true,
            only_teacher_id: body?.only_teacher_id == null ? undefined : String(body.only_teacher_id),
            actor: actor.name || 'admin',
          });
          return json(r);
        } catch (e: any) {
          return json({ ok: false, error: 'c24_unreachable', message: String(e?.message || e) }, 502);
        }
      }
      return err('not found: ' + p, 404);
    }

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
  /* 🔍 장부 vs 통장 (한 달치) — 기준은 통장의 「케이씨피」 입금이다(2026-08-18).
     장부 쪽도 KCP 정산 대상(bookPg)만 넣는다 — 대사 화면과 규칙이 갈라지면 안 된다. */
  /* ⏳ 그 달 «결제분» 이 들어온 입금 구간 = [월초+시차, 월말+시차]. classifyDeposit 으로
     「케이씨피」 정산분만 센다. 실패하면 null → reconcileMonth 가 종전(같은 달)으로 돈다. */
  const lagPg = await safe(async () => {
    const { startMs, endMs } = monthRange(period);
    // startMs 는 «KST 자정» 의 epoch 라 UTC ISO 로 자르면 하루 이른 날짜가 나온다
    // (실효 시차 20일 — reconcileReport 의 날짜문자열 +21일과 하루 어긋남). +9h 로 맞춘다.
    const shift = (ms: number) => new Date(ms + PG_SETTLE_LAG_DAYS * 86400000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const r = await env.DB.prepare(`
      SELECT COALESCE(remark,'') AS remark, amount FROM bankacct_transactions
       WHERE kind='in' AND substr(trans_at,1,10) >= ? AND substr(trans_at,1,10) < ?
    `).bind(shift(startMs), shift(endMs)).all();
    let pg = 0;
    for (const x of (r.results || []) as Array<{ remark: string; amount: number }>) {
      const amt = Number(x.amount) || 0;
      if (classifyDeposit(x.remark, amt) === 'pg') pg += amt;
    }
    return pg;
  }, null);
  const rec = reconcileMonth(pl.rev.bookPg, pl.rev.dep, lagPg);

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
      ORDER BY amount DESC
    `).bind(period).all();
    /* 🧭 «분류가 필요한 출금» 목록 — DB 의 1차 분류(기타출금)를 그대로 보여 주면,
       resolveExpenseAccount() 가 이미 계정과목을 붙인 행(지사수수료·지정표 등)까지 남아
       머리숫자(unclassified_krw = 판정 후 잔여)보다 목록 합이 커진다 — 사장님이 방금
       분류한 행이 «확인 필요» 목록에 계속 보이는 모양. 같은 판정을 거른 뒤 30건만 남긴다. */
    const rules = await loadExpenseAccountRules(env);
    return ((r.results || []) as Array<{ trans_at: string; remark: string; amount: number }>)
      .filter(row => resolveExpenseAccount(rules, row.remark, '기타출금') === '기타출금')
      .slice(0, 30);
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
      ['[장부 vs 통장] — 기준: 통장 「케이씨피」 입금'],
      ['실제 PG 정산 입금(기준)', rec.deposit_pg],
      ['통장 기준 매출(수수료 역산)', rec.bank_revenue == null ? '(자료없음)' : rec.bank_revenue],
      ['장부 매출(KCP 정산 대상만)', rec.revenue],
      ['예상 입금(수수료 차감)', rec.expected],
      ['차이', rec.diff == null ? '(자료없음)' : rec.diff],
      /* ⛔ «성격 미확인 입금» 줄 제거(2026-08-18 사장님 지시 — 「케이씨피M」 표기 정리의 마지막 단계).
         금액은 payload 의 deposit_transfer_unknown_krw 로 계속 나가지만 화면·CSV 에는 그리지 않는다. */
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
  /* ⛔ «성격이 확인되지 않은 입금» 경고 제거(2026-08-18 지시). 통장 입금 중 성격이 안 잡힌
     돈은 여전히 매출에서 빠져 있고 금액도 payload 에 남지만, 화면 경고로는 띄우지 않는다. */
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

/* ═══════════════════════════════════════════════════════════════════════════
   🏦 GET /api/admin/reports/bank-expenses?month=YYYY-MM   신한 계좌 «출금» 원장

   [왜 만들었나 — 2026-08-23 사장님 요청] 신한카드는 「💳 법인카드 사용내역」 화면이 있어
   가맹점·업종별로 들여다볼 수 있는데, **신한 계좌는 화면이 아예 없었다.** 계좌 데이터는
   2026-08-14 부터 매일 쌓이고 있었지만(bankacct_transactions), 화면에 나오는 곳은
   손익계산서의 「계좌 출금 — ○○」 합계 한 줄뿐이라 «무슨 돈인지» 를 볼 수가 없었다.
   (/api/admin/bankacct/transactions 는 그때 만들어 뒀는데 **부르는 화면이 한 곳도 없었다.**)

   [왜 bankacct 가 아니라 reports 밑인가] 계정과목 판정(resolveExpenseAccount)이 이 파일에
   있기 때문이다. 화면이 DB 의 category(9종)를 그리면 손익계산서(계정과목 13종)와 숫자가
   어긋난다. 같은 파일에서 같은 함수를 쓰게 두면 **어긋날 수가 없다.**
   덤으로 /api/admin/reports/ 는 인증 게이트·강사 차단에 이미 등록돼 있어
   src/index.ts(공동 금지구역)를 건드리지 않는다.

   ⛔ **입금(kind='in')은 내려주지 않는다.** 「케이씨피M」(하나은행 → 신한 자금이체)·
      «운영자금 보충»·«성격 미확인 입금» 은 2026-08-18 사장님 지시로 매출·회계 화면에서
      전부 뺐다. 여기서 입금 표를 그리면 그것이 그대로 되살아난다. 이 화면은 «지출» 전용이다.
   ═══════════════════════════════════════════════════════════════════════════ */
interface BankExpenseRow {
  id: number; trans_at: string; amount: number; balance: number;
  remark: string; category: string; memo: string;
}

async function bankExpensesReport(env: Env, request: Request, url: URL, fmt = 'json'): Promise<Response> {
  const q = String(url.searchParams.get('month') || '');
  const period = /^\d{4}-\d{2}$/.test(q) ? q : currentMonth();
  const { label } = monthRange(period);

  const rules = await loadExpenseAccountRules(env);

  /* 🔁 «4개월 창» 을 한 번에 읽는다 — 고정비 판정(같은 거래처가 반복해서 나오는가)과
     전월 대비 증감이 지난 달들을 필요로 한다. 달마다 따로 조회하면 왕복이 네 배가 된다.
     ⚠️ 화면의 «출금 내역» 표는 이 중 이번 달만 쓴다(아래 detail). */
  const [wy, wm] = period.split('-').map(Number);
  const RECUR_WINDOW = 4;                       // 당월 포함 4개월
  const windowMonths: string[] = [];
  for (let i = RECUR_WINDOW - 1; i >= 0; i--) {
    windowMonths.push(new Date(Date.UTC(wy, wm - 1 - i, 1)).toISOString().slice(0, 7));
  }
  const prevMonth = windowMonths[windowMonths.length - 2];

  const windowRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT id, trans_at, amount, balance, COALESCE(remark,'') AS remark,
             COALESCE(category,'기타출금') AS category, COALESCE(memo,'') AS memo
      FROM bankacct_transactions
      WHERE kind='out' AND substr(trans_at,1,7) >= ? AND substr(trans_at,1,7) <= ?
      ORDER BY trans_at DESC, id DESC
    `).bind(windowMonths[0], period).all();
    return (r.results || []) as unknown as BankExpenseRow[];
  }, [] as BankExpenseRow[]);
  const rows = windowRows.filter(r => String(r.trans_at).slice(0, 7) === period);

  /* 📈 최근 12개월 «총 출금» 추이 — 계정과목 판정 없이 순수 SQL 합계다.
     전월 대비·3개월 평균 KPI 도 이 값으로 낸다(달마다 전건을 다시 판정하지 않기 위해). */
  const [py, pm] = period.split('-').map(Number);
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(new Date(Date.UTC(py, pm - 1 - i, 1)).toISOString().slice(0, 7));
  const histMap = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT substr(trans_at,1,7) AS ym, COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt
      FROM bankacct_transactions
      WHERE kind='out' AND substr(trans_at,1,7) >= ? AND substr(trans_at,1,7) <= ?
      GROUP BY ym
    `).bind(months[0], months[months.length - 1]).all();
    const m = new Map<string, { total: number; cnt: number }>();
    for (const x of ((r.results || []) as Array<{ ym: string; total: number; cnt: number }>)) {
      m.set(x.ym, { total: Number(x.total) || 0, cnt: Number(x.cnt) || 0 });
    }
    return m;
  }, new Map<string, { total: number; cnt: number }>());
  const history = months.map(ym => ({
    month: ym, total: histMap.get(ym)?.total || 0, count: histMap.get(ym)?.cnt || 0,
  }));

  /* 🧭 행마다 계정과목·거래처를 붙인다 — 판정은 손익계산서와 같은 함수. */
  const detail = rows.map(r => {
    const account = resolveExpenseAccount(rules, r.remark, r.category);
    return {
      id: r.id,
      datetime: r.trans_at,
      remark: r.remark,
      payee: payeeBase(r.remark),
      bank_category: r.category,     // 은행 적요로 붙은 1차 분류(9종) — 참고용
      account,                       // 손익계산서가 쓰는 계정과목 — 화면의 기준
      role: expenseRoleOf(account),
      amount: Number(r.amount) || 0,
      balance: Number(r.balance) || 0,
      memo: r.memo,
    };
  });

  // 📊 계정과목별 합계
  const catMap = new Map<string, { total: number; count: number }>();
  for (const d of detail) {
    const cur = catMap.get(d.account) || { total: 0, count: 0 };
    cur.total += d.amount; cur.count++;
    catMap.set(d.account, cur);
  }
  const outTotal = detail.reduce((a, d) => a + d.amount, 0);
  const categories = [...catMap].map(([account, v]) => ({
    account, total: v.total, count: v.count,
    role: expenseRoleOf(account),
    share: outTotal > 0 ? Math.round((v.total / outTotal) * 1000) / 10 : 0,
  })).sort((a, b) => b.total - a.total);

  /* 🏪 거래처별 합계 — 은행 적요는 「김영진(지성교」처럼 잘려 오므로 payeeBase() 로 묶는다.
     카드의 «가맹점» 자리에 해당하는 축이고, 이 화면에서 실제로 제일 쓸모가 많다. */
  const payeeMap = new Map<string, {
    total: number; count: number; accounts: Set<string>; first: string; last: string; assignable: boolean;
  }>();
  for (const d of detail) {
    const key = d.payee || d.remark || '(적요 없음)';
    const cur = payeeMap.get(key)
      || { total: 0, count: 0, accounts: new Set<string>(), first: d.datetime, last: d.datetime, assignable: false };
    cur.total += d.amount; cur.count++; cur.accounts.add(d.account);
    /* 🏷️ «지정해도 소용 있는 거래처인가» — resolveExpenseAccount() 는 저장된 category 가
       「기타출금」일 때만 쪼갠다. 급여이체·카드대금처럼 은행 적요로 이미 분류가 붙은 행은
       지정해도 **안 바뀐다.** 그걸 화면이 모르면 사장님이 지정해 놓고 「저장이 안 된다」고
       읽게 된다(실제로 그렇게 보인다 — 에러도 안 난다). 그래서 서버가 미리 알려 준다. */
    /* ⛔ 적요가 빈 행은 지정 대상에서 뺀다 — 아래 key 가 '(적요 없음)' 이 되는데,
       그 이름으로 저장해 봐야 resolveExpenseAccount() 의 두 조회(payeeBase(remark)·
       remark.trim())가 **둘 다 안 맞아 영영 안 먹는다.** 칸을 내면 지정해 놓고
       「저장이 안 된다」가 된다(2026-08-23 함정 대조에서 지적). */
    if (d.bank_category === UNCLASSIFIED && (d.payee || d.remark)) cur.assignable = true;
    if (d.datetime < cur.first) cur.first = d.datetime;
    if (d.datetime > cur.last) cur.last = d.datetime;
    payeeMap.set(key, cur);
  }
  const payees = [...payeeMap].map(([payee, v]) => ({
    payee, total: v.total, count: v.count,
    /* ⚠️ 한 거래처의 출금이 여러 과목으로 갈릴 수 있다(적요마다 1차 분류가 다르게 붙는 경우).
       첫 줄의 과목을 대표로 쓰면 조용히 틀린 과목이 붙으므로 «여러 과목» 이라고 밝힌다. */
    account: v.accounts.size === 1 ? [...v.accounts][0] : '여러 과목',
    accounts: [...v.accounts],
    first_at: v.first, last_at: v.last,
    // 사람이 직접 지정해 둔 거래처인가 — 화면에서 «지정됨» 표시로 쓴다
    assigned: rules.payees.has(payee),
    assignable: v.assignable,
  })).sort((a, b) => b.total - a.total);

  const idx = months.indexOf(period);
  const prevTotal = idx > 0 ? history[idx - 1].total : 0;
  const prev3 = history.slice(Math.max(0, idx - 3), Math.max(0, idx)).filter(h => h.total > 0);
  const avg3m = prev3.length ? Math.round(prev3.reduce((a, h) => a + h.total, 0) / prev3.length) : 0;
  const pct = (base: number) => (base > 0 ? Math.round(((outTotal - base) / base) * 1000) / 10 : null);

  const sumRole = (role: ExpenseRole) => categories.filter(c => c.role === role).reduce((a, c) => a + c.total, 0);
  const reviewTotal = sumRole('review');

  /* 📣 «왜 비어 있는지» 를 숫자 대신 말해 주는 상태 한 줄 — 법인카드 화면과 같은 원칙.
     연동이 꺼져 있는 것과 «그 달에 출금이 없는 것» 은 완전히 다른 이야기다. */
  const status = await safe(async () => await bankacctStatus(env, { current: rows }), null);

  /* ═══ 🔁 고정비 · 변동비 가르기 (3단계) ════════════════════════════════════
     [왜] 계좌 출금은 임대료·보험·구독료처럼 **매달 같은 곳에 비슷한 금액**이 나가는 것이
     많다. 그걸 갈라 놓으면 「이번 달 왜 늘었나」에 바로 답할 수 있다 — 고정비는 그대로인데
     변동비만 늘었다면 볼 곳이 좁아진다. 카드 화면에는 없는 축이다.

     [판정] 당월 포함 4개월 창에서 그 거래처가 **3개월 이상** 나왔고, 월별 합계의
     **최대/최소 비율이 1.25 이하**면 「고정비」. 3개월 이상 나왔지만 금액이 흔들리면
     「반복(금액 변동)」, 나머지는 「변동비」.
     ⚠️ 이건 «추정»이다. 회계 계정과목이 아니라 «패턴»이라 화면에 근거(몇 달 나왔는지·
        금액 폭)를 함께 내려 준다 — 숫자만 주면 사람이 확인할 방법이 없다.
     ⚠️ 창이 4개월이므로 **자료가 4개월치 없는 초기에는 대부분 «변동비»로 보인다.**
        그건 틀린 게 아니라 «아직 모른다» 는 뜻이다. 화면이 창 기간을 함께 밝힌다. */
  const byPayeeMonth = new Map<string, Map<string, number>>();
  for (const r of windowRows) {
    const key = payeeBase(r.remark) || r.remark || '(적요 없음)';
    const ym = String(r.trans_at).slice(0, 7);
    const m = byPayeeMonth.get(key) || new Map<string, number>();
    m.set(ym, (m.get(ym) || 0) + (Number(r.amount) || 0));
    byPayeeMonth.set(key, m);
  }

  const RECUR_MIN_MONTHS = 3;      // 4개월 중 3개월 이상 나와야 «반복»
  const FIXED_SPREAD_MAX = 1.25;   // 월별 합계 최대/최소가 이 이하면 «금액이 일정하다»
  type RecurKind = 'fixed' | 'recurring' | 'variable';
  const recurOf = (payee: string): { kind: RecurKind; monthsSeen: number; avg: number; spread: number | null } => {
    const m = byPayeeMonth.get(payee);
    if (!m) return { kind: 'variable', monthsSeen: 0, avg: 0, spread: null };
    const vals = [...m.values()].filter(v => v > 0);
    const monthsSeen = vals.length;
    const avg = monthsSeen ? Math.round(vals.reduce((a, b) => a + b, 0) / monthsSeen) : 0;
    const min = monthsSeen ? Math.min(...vals) : 0;
    const max = monthsSeen ? Math.max(...vals) : 0;
    const spread = min > 0 ? Math.round((max / min) * 100) / 100 : null;
    if (monthsSeen < RECUR_MIN_MONTHS) return { kind: 'variable', monthsSeen, avg, spread };
    if (spread != null && spread <= FIXED_SPREAD_MAX) return { kind: 'fixed', monthsSeen, avg, spread };
    return { kind: 'recurring', monthsSeen, avg, spread };
  };

  const recurItems = payees.map(p => {
    const r = recurOf(p.payee);
    return {
      payee: p.payee, account: p.account, current: p.total,
      kind: r.kind, months_seen: r.monthsSeen, avg: r.avg, spread: r.spread,
    };
  });
  const kindSum = (k: RecurKind) => recurItems.filter(i => i.kind === k).reduce((a, i) => a + i.current, 0);

  /* ═══ 📈 전월 대비 증감 (거래처 단위) ══════════════════════════════════════
     ⚠️ **이번 달에 없는 거래처도 넣는다.** 정기결제가 끊긴 것·지사수수료가 안 나간 것은
        «줄었다» 가 아니라 «사라졌다» 인데, 당월 목록만 보면 영영 안 보인다. */
  const prevByPayee = new Map<string, number>();
  for (const [payee, m] of byPayeeMonth) {
    const v = m.get(prevMonth) || 0;
    if (v > 0) prevByPayee.set(payee, v);
  }
  const curByPayee = new Map(payees.map(p => [p.payee, p.total] as [string, number]));
  const moverKeys = new Set<string>([...curByPayee.keys(), ...prevByPayee.keys()]);
  const movers = [...moverKeys].map(payee => {
    const cur = curByPayee.get(payee) || 0;
    const prv = prevByPayee.get(payee) || 0;
    return {
      payee, current: cur, prev: prv, delta: cur - prv,
      delta_pct: prv > 0 ? Math.round(((cur - prv) / prv) * 1000) / 10 : null,
      account: (payees.find(p => p.payee === payee) || { account: '' }).account,
      status: prv === 0 ? 'new' : (cur === 0 ? 'gone' : 'changed'),
    };
  }).filter(m => m.delta !== 0).sort((a, b) => b.delta - a.delta);

  /* 🔐 «이 사람이 계정과목을 지정할 수 있나» — 실제 저장은 payeesRouter 가 `scope.type !== 'hq'`
     로 막는다(403). 화면도 같은 기준으로 지정 칸을 감춘다 — **서버만 있으면 «눌러도 안 되는
     칸»이 남고, 화면만 있으면 URL 로 뚫린다**(CLAUDE.md 2장). 그래서 둘 다 둔다.
     ⛔ `canEditOrg()` 를 쓰지 말 것 — 그 함수는 `'none'`(내부직원·교사)에도 true 를 준다. */
  const canAssign = await safe(async () => (await getScope(env, request)).type === 'hq', false);

  const payload = {
    ok: true, type: 'bank-expenses', period, label,
    summary: {
      out_total: outTotal,
      out_count: detail.length,
      prev_total: prevTotal,
      prev_delta_pct: pct(prevTotal),
      avg3m,
      avg3m_delta_pct: pct(avg3m),
      // 💼 판관비로 실제로 들어가는 금액 — 손익계산서의 「계좌 출금」 줄 합계와 같아야 한다
      opex_total: sumRole('opex') + reviewTotal,
      // ♻️ 다른 줄과 겹쳐 판관비에서 뺀 돈(카드대금·급여이체)
      dup_total: sumRole('dup'),
      // ↪️ 판관비가 아니라 다른 줄로 간 돈(강사급여송금·학생환불)
      moved_total: sumRole('moved'),
      // 🏷️ 아직 계정과목이 없는 돈 — 이 비율을 0 에 가깝게 만드는 것이 이 화면의 목적
      review_total: reviewTotal,
      review_ratio: outTotal > 0 ? Math.round((reviewTotal / outTotal) * 1000) / 10 : 0,
    },
    categories,
    payees,
    rows: detail,
    history,
    account_options: EXPENSE_CATEGORIES,
    can_assign: canAssign,
    /* 🔁 고정비·변동비 — «패턴 추정» 이라 근거(창 기간·몇 달 나왔는지·금액 폭)를 함께 준다 */
    recurring: {
      window: windowMonths,
      /* ⚠️ 조회한 달이 «아직 진행 중» 이면 그 달 합계는 덜 찼다. 한 달에 여러 번 나가는
         거래처는 월 중반에 금액 폭(spread)이 부풀어 「고정비」가 「반복」으로 내려앉는다.
         판정을 흔들지 않고 **사실을 화면에 밝히는 쪽**을 골랐다 — 진행 중인 달을 판정에서
         빼면 창이 3개월로 줄어 「3개월 이상」 조건이 «세 달 모두» 가 되어 더 빡빡해진다. */
      period_in_progress: period === currentMonth(),
      window_months: RECUR_WINDOW,
      min_months: RECUR_MIN_MONTHS,
      spread_max: FIXED_SPREAD_MAX,
      fixed_total: kindSum('fixed'),
      recurring_total: kindSum('recurring'),
      variable_total: kindSum('variable'),
      items: recurItems,
    },
    // 📈 전월 대비 증감 — 늘어난 것부터. «사라진 거래처»(status='gone')도 들어 있다
    movers,
    prev_month: prevMonth,
    status,
    note: '이 화면은 계좌 «출금» 만 봅니다. 계정과목은 손익계산서와 같은 판정(resolveExpenseAccount)을 씁니다.',
  };

  /* 📥 엑셀·CSV 내보내기 — 화면과 «같은 payload» 로 만든다. 따로 계산하면 어긋난다.
     ⛔ 입금 시트를 만들지 말 것(「케이씨피M」 금지가 되살아난다). */
  if (fmt === 'csv' || fmt === 'xlsx') {
    const won = (n: any) => Number(n) || 0;
    const KIND_KO: Record<string, string> = { fixed: '고정비', recurring: '반복(금액 변동)', variable: '변동비' };
    const summaryRows: (string | number)[][] = [
      ['망고아이 신한 계좌 출금 분석', label],
      ['※ 계좌 «출금» 만 담았습니다. 계정과목은 손익계산서와 같은 기준입니다.'],
      [],
      ['이번 달 총 출금', won(payload.summary.out_total)],
      ['건수', won(payload.summary.out_count)],
      ['전월 출금', won(payload.summary.prev_total)],
      ['3개월 평균', won(payload.summary.avg3m)],
      ['판관비에 들어가는 금액', won(payload.summary.opex_total)],
      ['중복이라 뺀 금액(카드대금·급여이체)', won(payload.summary.dup_total)],
      ['다른 줄로 간 금액(강사급여·매출차감)', won(payload.summary.moved_total)],
      ['아직 계정과목 없음', won(payload.summary.review_total)],
      [],
      [`고정비 (최근 ${RECUR_WINDOW}개월 중 ${RECUR_MIN_MONTHS}개월 이상·금액 일정)`, kindSum('fixed')],
      ['반복(금액 변동)', kindSum('recurring')],
      ['변동비', kindSum('variable')],
      [],
      ['계정과목', '금액', '건수', '비중(%)', '손익계산서 취급'],
      ...categories.map(c => [c.account, won(c.total), won(c.count), c.share,
        c.role === 'opex' ? '판관비에 포함' : c.role === 'dup' ? '제외 — 중복'
        : c.role === 'moved' ? '다른 줄로' : '확인 필요'] as (string | number)[]),
    ];
    const sheets: XlsxSheet[] = [
      { name: '거래처별', headerRows: 1, rows: [
        ['거래처', '계정과목', '금액', '건수', '성격', '최근 4개월 중', '월평균', '첫 거래', '마지막 거래'],
        ...payees.map(p => {
          const r = recurItems.find(i => i.payee === p.payee);
          return [p.payee, p.account, won(p.total), won(p.count),
            KIND_KO[r?.kind || 'variable'], `${r?.months_seen || 0}개월`, won(r?.avg),
            p.first_at, p.last_at] as (string | number)[];
        }),
      ] },
      { name: '전월 대비 증감', headerRows: 1, rows: [
        ['거래처', '계정과목', '이번 달', prevMonth, '증감', '증감(%)', '상태'],
        ...movers.map(m => [m.payee, m.account, won(m.current), won(m.prev), won(m.delta),
          m.delta_pct == null ? '' : m.delta_pct,
          m.status === 'new' ? '새로 생김' : m.status === 'gone' ? '사라짐' : ''] as (string | number)[]),
      ] },
      { name: '출금 내역', headerRows: 1, rows: [
        ['일시', '적요', '거래처', '계정과목', '출금액', '잔액'],
        ...detail.map(d => [d.datetime, d.remark, d.payee, d.account, won(d.amount), won(d.balance)] as (string | number)[]),
      ] },
    ];
    return out(fmt, `bank-expenses-${period}.csv`, summaryRows, sheets);
  }

  return json(payload);
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

/* 🏦 GET  /api/admin/reports/b2b-payees[?months=12]  아직 지사가 안 붙은 B2B 통장 입금 + 지사 목록
   POST /api/admin/reports/b2b-payees?payee=..&franchise_id=..  그 입금자를 지사에 직접 붙인다
        (franchise_id=0 이면 지정 해제)
   학원이 수업료를 통장으로 바로 보내는 B2B 결제는 카페24를 안 거쳐 student_payments 에
   없다. 적요가 대리점·지사 이름과 정확히 맞으면 자동으로 붙지만(attributeB2bRows),
   「박선유(에스와이피(SY」 처럼 잘리거나 사람 이름으로 오면 사람이 알려 줘야 한다.
   한 번 지정하면 그 적요의 지난·앞으로의 입금이 전부 그 지사로 잡힌다. */
async function b2bPayeesRouter(env: Env, request: Request, url: URL): Promise<Response> {
  await ensureB2bOverrideTable(env);
  const method = request.method.toUpperCase();

  if (method === 'POST') {
    const scope = await safe(async () => await getScope(env, request), { type: 'none', value: null, label: '권한 없음' } as Scope);
    if (scope.type !== 'hq') return err('B2B 입금 지사 지정은 본사 계정만 할 수 있습니다.', 403);
    const payee = (url.searchParams.get('payee') || '').trim();
    const fid = Number(url.searchParams.get('franchise_id'));
    if (!payee) return err('입금 적요를 지정해 주세요.');
    const okSet = await safe(async () => {
      if (!fid) {
        await env.DB.prepare(`DELETE FROM b2b_payee_franchise_override WHERE payee=?`).bind(payee).run();
      } else {
        const f = await env.DB.prepare(`SELECT id FROM franchises WHERE id=?`).bind(fid).first<{ id: number }>();
        if (!f) throw new Error('그런 지사가 없습니다: ' + fid);
        await env.DB.prepare(
          `INSERT INTO b2b_payee_franchise_override (payee, franchise_id, note, updated_at) VALUES (?,?,?,?)
           ON CONFLICT(payee) DO UPDATE SET franchise_id=excluded.franchise_id, note=excluded.note, updated_at=excluded.updated_at`
        ).bind(payee, fid, `${scope.label || 'admin'} 지정`, Date.now()).run();
      }
      return true;
    }, false);
    if (!okSet) return err('저장에 실패했습니다.', 500);
    return json({ ok: true, payee, franchise_id: fid || null });
  }

  // GET — 최근 N개월의 B2B 입금을 적요별로 묶어, 붙은 것과 못 붙은 것을 모두 보여 준다
  const months = Math.max(1, Math.min(36, parseInt(url.searchParams.get('months') || '12', 10)));
  const [cy, cm] = currentMonth().split('-').map(Number);
  const since = new Date(Date.UTC(cy, cm - 1 - (months - 1), 1)).toISOString().slice(0, 7);

  const deposits = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT trans_at, COALESCE(remark,'') AS remark, amount
        FROM bankacct_transactions
       WHERE kind='in' AND substr(trans_at,1,7) >= ?
       ORDER BY trans_at DESC`).bind(since).all();
    return (r.results || []) as Array<{ trans_at: string; remark: string; amount: number }>;
  }, []);
  // 정산서와 같은 판정을 쓴다 — 화면마다 «B2B 인지» 가 달라지면 안 된다
  const b2bRows = deposits
    .filter(d => classifyDeposit(d.remark, Number(d.amount) || 0) === 'b2b')
    .map(d => ({ date: String(d.trans_at || '').slice(0, 10), remark: d.remark, amount: Number(d.amount) || 0 }));
  const att = await attributeB2bRows(env, b2bRows);

  // 붙은 것도 적요별로 묶어 보여 준다 — 잘못 붙은 것을 사람이 고칠 수 있어야 한다
  const byPayee = new Map<string, { payee: string; count: number; amount: number; first_at: string; last_at: string; franchise_id: number | null; matched_by: string; matched_name: string }>();
  for (const r of att.rows) {
    const key = String(r.remark || '').trim();
    const cur = byPayee.get(key) || {
      payee: key, count: 0, amount: 0, first_at: r.date, last_at: r.date,
      franchise_id: r.franchise_id, matched_by: r.matched_by, matched_name: r.matched_name,
    };
    cur.count += 1; cur.amount += r.amount;
    if (r.date < cur.first_at) cur.first_at = r.date;
    if (r.date > cur.last_at) cur.last_at = r.date;
    byPayee.set(key, cur);
  }
  const items = Array.from(byPayee.values()).sort((a, b) => {
    if (!a.franchise_id !== !b.franchise_id) return a.franchise_id ? 1 : -1;   // 못 붙은 것을 위로
    return b.amount - a.amount;
  });

  const franchises = await safe(async () => {
    const r = await env.DB.prepare(`SELECT id, name, active FROM franchises ORDER BY (active=1) DESC, name`).all();
    return (r.results || []) as Array<{ id: number; name: string; active: number }>;
  }, []);

  const unresolved = items.filter(i => !i.franchise_id);
  return json({
    ok: true, type: 'b2b-payees', months, since,
    items, franchises,
    total_krw: att.total,
    assigned_krw: att.assigned,
    unresolved_count: unresolved.length,
    unresolved_krw: att.unassignedTotal,
    note: '학원이 통장으로 바로 보낸 수업료(B2B)입니다. 적요가 대리점·지사 이름과 맞으면 자동으로 붙고, 아니면 여기서 한 번 지정하면 그 적요의 지난·앞으로의 입금이 전부 그 지사로 잡힙니다.',
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
  /* ⛔ «확인필요 입금» 시트 제거(2026-08-18 지시) — 화면에서 뺀 줄이 엑셀로 다시 나가면 같은 것이 보인다. */
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
   판정 문구도 같은 곳에서 만들어, 월간 리포트 배너와 대사 화면이 어긋나지 않게 한다.
   ⚠️ 2026-08-18 기준 전환: **통장의 「케이씨피」 입금이 기준**이다.
      · revenueBook 에는 KCP 정산 대상 결제만 들어온다(monthRevenue.bookPg)
      · 오차율(pct)의 분모도 장부(expected)가 아니라 통장(dep.pg) 이다
      · 「케이씨피M」·B2B 직접입금·기타 입금은 대사에 넣지 않는다(금액만 따로 밝힌다)

   ⏳ (2026-08-18) lagPg = «그 달 결제분이 실제로 들어온» 입금액. PG 정산이 2~4주 걸려서
      그 달 결제가 그 달 통장에 다 안 들어온다 — 같은 달끼리 빼면 매번 «통장이 적다» 가
      나온다. 호출부가 [월초+시차, 월말+시차] 구간으로 구해 넘긴다. 못 구했으면(자료 부족)
      null 이고, 그때만 종전처럼 같은 달 입금을 쓴다. */
function reconcileMonth(revenueBook: number, dep: MonthDeposits, lagPg: number | null = null) {
  const expected = Math.round(revenueBook * (1 - PG_FEE_RATE));
  const hasBank = dep.hasBank;
  const pgUsed = lagPg == null ? dep.pg : lagPg;      // 시차를 맞춘 입금(있으면)
  const diff = hasBank ? pgUsed - expected : null;
  // 통장이 기준 — 들어온 돈을 100 으로 놓고 장부가 얼마나 벌어졌는지 본다.
  // 통장에 정산금이 한 푼도 없는데 장부엔 매출이 있으면 −100%(= 확인 필요)로 본다.
  const pct = diff == null ? 0 : (pgUsed > 0 ? (diff / pgUsed) * 100 : (expected > 0 ? -100 : 0));
  let verdict: 'ok' | 'warn' | 'alert' | 'no_data';
  if (!hasBank) verdict = 'no_data';
  /* 시차를 맞춘 뒤로는 여유를 좁힌다. 예전 ±15/30% 는 «어차피 시차로 어긋난다» 는
     전제였는데, 맞춘 값이면 그렇게 벌어질 이유가 없다. */
  else if (Math.abs(pct) <= (lagPg == null ? 15 : 10)) verdict = 'ok';
  else if (Math.abs(pct) <= (lagPg == null ? 30 : 25)) verdict = 'warn';
  // ⚠️ else 가 없으면 verdict 가 undefined 로 남아, «가장 크게 어긋난 달» 일수록
  //    배너가 아예 안 뜨고 마감 경고(closeWarnings)도 건너뛰어진다(2026-08-27 발견).
  else verdict = 'alert';
  const short = (diff ?? 0) < 0;
  const MSG: Record<typeof verdict, string> = {
    ok: '장부와 통장이 맞습니다(정산 시차를 맞춘 비교).',
    warn: short
      ? 'PG 정산 입금이 장부보다 적습니다. 다음 달 정산으로 넘어간 것인지 확인하세요.'
      : 'PG 정산 입금이 장부보다 많습니다. 지난달 정산분이 이달에 들어왔는지 확인하세요.',
    alert: short
      ? 'PG 정산 입금이 장부보다 크게 적습니다. 정산 시차인지 미수금인지 KCP 정산내역을 확인하세요.'
      : 'PG 정산 입금이 장부보다 크게 많습니다. 장부에 안 잡힌 결제가 있는지 확인하세요.',
    no_data: '이 달은 계좌 입금 자료가 없어 대사를 할 수 없습니다.',
  };
  return {
    revenue: revenueBook, expected, deposit_pg: pgUsed,
    deposit_pg_same_month: dep.pg,                    // 참고 — 같은 달 통장에 찍힌 값
    lag_days: lagPg == null ? null : PG_SETTLE_LAG_DAYS,
    // 통장 기준 매출 = 실제 들어온 정산금을 수수료만큼 되돌린 값
    bank_revenue: hasBank ? Math.round(pgUsed / (1 - PG_FEE_RATE)) : null,
    // ⚠️ reconcileReport 쪽 deposit_transfer 는 «성격 미확인만» 이다 — 같은 이름에
    //    확인된 자금이체(케이씨피M)까지 실으면 1-3 장 금지(화면 부활)가 되살아난다.
    deposit_b2b: dep.b2b, deposit_transfer: dep.transferUnknown, deposit_other: dep.other,
    diff, diff_pct: Number(pct.toFixed(1)), verdict, message: MSG[verdict],
    /* ⚠️ 확인이 끝난 내부 자금이체는 안내하지 않는다(2026-08-18 사장님 지시 — 설명이
       오히려 혼동을 준다). 아직 «모르는» 입금만 묻는다. */
    /* ⛔ 대사 배너는 타계좌 입금을 더 이상 안내하지 않는다 — 확인된 자금이체도(2026-08-18),
       아직 성격을 모르는 입금도(같은 날 추가 지시) 화면에 띄우지 않는다.
       판정·집계에서 빼는 계산은 그대로다. */
    transfer_note: '',
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

/* ═══════════════════════════════════════════════════════════════════════════
   🏦 B2B 통장 직접입금 → 가맹점 귀속 (2026-08-18 신설)

   [무엇이 문제였나] 가맹점별 정산서는 student_payments(카페24 결제 장부)만 봤다.
   그런데 JW학원·(주)드림키오·어센틱영어처럼 **학원이 수업료를 통장으로 바로 보내는
   B2B 결제**는 카페24를 안 거쳐 student_payments 에 없다(classifyDeposit 의 'b2b').
   그래서 월간 리포트·KPI 의 매출에는 B2B 가 들어 있는데(2026-08-16 반영) 정산서만
   빠져 있었다 — 같은 달인데 화면마다 매출이 달랐고, B2B 로 받는 가맹점은 정산서에
   매출이 0 으로 찍혔다.

   [어떻게 붙이나 — 세 단계, «모르면 안 넣는다»]
     ① b2b_payee_franchise_override — 사람이 «이 입금자는 이 지사» 라고 지정한 것.
        가장 세고, 지정이 있으면 그대로 쓴다.
     ② 대리점(centers) 이름과 정규화 일치. B2B 로 받는 대리점(payment_type='B2B')을
        먼저 보고, 없으면 전체 대리점을 본다. 카페24 원부의 대리점 이름은 「N드림키오」
        처럼 앞에 N 이 붙어 있는 경우가 있어 그 변형도 같은 열쇠로 만든다.
     ③ 지사(franchises) 이름과 정규화 일치.
   위 어느 단계든 **후보 지사가 둘 이상이면 배정하지 않는다** — 아무 쪽에 몰아주면
   그게 또 다른 균등분배다(가맹점별 정산서 본문의 같은 원칙).

   ⚠️ 은행 적요는 길이가 잘리고 사람 이름이 섞인다(「박선유(에스와이피(SY」,
      「어센틱영어 박영선」). 그래서 ②③ 은 «정확히 같은 이름» 과 «적요 안에 대리점
      이름이 통째로 들어 있는 경우»(4글자 이상일 때만) 두 가지만 인정한다.
      그 이상 추측하지 않고 「배정 못 한 B2B 입금」 으로 넘겨 사람에게 묻는다.
   ═══════════════════════════════════════════════════════════════════════════ */

async function ensureB2bOverrideTable(env: Env): Promise<void> {
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS b2b_payee_franchise_override (payee TEXT PRIMARY KEY, franchise_id INTEGER NOT NULL, note TEXT, updated_at INTEGER NOT NULL);`);
  } catch { /* 이미 있으면 그만 */ }
}

/** 조직 이름 비교용 열쇠. 「(주)드림키오」·「드림 키오」 → 「드림키오」 */
function orgKey(name: string): string {
  return String(name || '')
    .replace(/\(주\)|（주）|㈜|\(유\)|（유）|주식회사|유한회사/g, '')
    .replace(/[\s·.,\-_'"()（）]/g, '')
    .toLowerCase();
}

/** 대리점 이름의 「N」 접두(카페24 원부 표기)를 뗀 변형까지 열쇠로 만든다 */
function orgKeys(name: string): string[] {
  const k = orgKey(name);
  const keys = [k];
  const stripped = k.replace(/^n/, '');
  if (stripped.length >= 2 && stripped !== k) keys.push(stripped);
  return keys;
}

export interface B2bAttributedRow {
  date: string; remark: string; amount: number;
  franchise_id: number | null;
  /** 어떻게 붙었는지 — 화면·CSV 에 그대로 밝힌다 */
  matched_by: '지정' | '대리점' | '지사' | '';
  matched_name: string;
}

export interface B2bAttribution {
  /** 그 달 B2B 직접입금 전체 (붙은 것 + 못 붙은 것) */
  rows: B2bAttributedRow[];
  /** 지사별 합계 */
  byFranchise: Map<number, { amount: number; count: number }>;
  /** 못 붙인 입금을 적요별로 묶은 것 — 사람이 지사를 알려 주면 바로 붙는다 */
  unassigned: Array<{ payee: string; count: number; amount: number; reason: string }>;
  total: number;
  assigned: number;
  unassignedTotal: number;
}

/** 그 달 B2B 통장 직접입금을 지사에 귀속시킨다. 정산서와 지정 화면이 같은 함수를 쓴다. */
async function attributeB2bDeposits(env: Env, period: string): Promise<B2bAttribution> {
  await ensureB2bOverrideTable(env);
  const dep = await monthDeposits(env, period);
  return await attributeB2bRows(env, dep.b2bRows);
}

/** 입금 행 목록을 지사에 귀속시킨다(기간과 무관 — 지정 화면은 여러 달을 한 번에 본다) */
async function attributeB2bRows(
  env: Env,
  b2bRows: Array<{ date: string; remark: string; amount: number }>,
): Promise<B2bAttribution> {
  const empty: B2bAttribution = {
    rows: [], byFranchise: new Map(), unassigned: [], total: 0, assigned: 0, unassignedTotal: 0,
  };
  if (!b2bRows.length) return empty;

  // ① 사람이 지정한 표
  const overrides = await safe(async () => {
    const r = await env.DB.prepare(
      `SELECT o.payee, o.franchise_id FROM b2b_payee_franchise_override o
        WHERE EXISTS (SELECT 1 FROM franchises f WHERE f.id = o.franchise_id)`).all();
    return (r.results || []) as Array<{ payee: string; franchise_id: number }>;
  }, []);
  const ovMap = new Map<string, number>();
  for (const o of overrides) ovMap.set(String(o.payee || '').trim(), Number(o.franchise_id));

  /* ②③ 이름 → 지사 후보. 값이 «지사 하나» 로 좁혀질 때만 쓴다.
     같은 열쇠가 두 지사 이상을 가리키면 null 로 만들어 «모름» 임을 남긴다. */
  type NameEntry = { fid: number | null; label: string; tier: '대리점' | '지사' };
  const put = (m: Map<string, NameEntry>, key: string, fid: number, label: string, tier: '대리점' | '지사') => {
    if (key.length < 2) return;
    const cur = m.get(key);
    if (!cur) { m.set(key, { fid, label, tier }); return; }
    if (cur.fid !== fid) cur.fid = null;                  // 후보가 갈렸다 → 배정 불가
  };

  const centerMap = new Map<string, NameEntry>();
  await safe(async () => {
    const r = await env.DB.prepare(
      `SELECT name, franchise_id, COALESCE(payment_type,'') AS payment_type FROM centers
        WHERE franchise_id IS NOT NULL AND COALESCE(name,'') <> ''`).all();
    for (const c of (r.results || []) as Array<{ name: string; franchise_id: number; payment_type: string }>) {
      for (const k of orgKeys(c.name)) put(centerMap, k, Number(c.franchise_id), c.name, '대리점');
    }
    return true;
  }, false);

  const franchiseMap = new Map<string, NameEntry>();
  await safe(async () => {
    const r = await env.DB.prepare(`SELECT id, name FROM franchises WHERE COALESCE(name,'') <> ''`).all();
    for (const f of (r.results || []) as Array<{ id: number; name: string }>) {
      for (const k of orgKeys(f.name)) put(franchiseMap, k, Number(f.id), f.name, '지사');
    }
    return true;
  }, false);

  /* 적요 안에 대리점·지사 이름이 통째로 들어 있는 경우(「SYP어학원8월분」 ⊃ 「N SYP어학원」).
     4글자 미만 이름은 우연히 겹치기 쉬워 뺀다(예: 「pdi」 가 「상주pdi2026」 에 걸린다). */
  const containKeys: Array<[string, NameEntry]> = [];
  for (const m of [centerMap, franchiseMap]) {
    for (const [k, v] of m) if (k.length >= 4 && v.fid) containKeys.push([k, v]);
  }

  const lookup = (remark: string): { fid: number | null; by: B2bAttributedRow['matched_by']; name: string; ambiguous: boolean } => {
    const raw = String(remark || '').trim();
    const ov = ovMap.get(raw);
    if (ov) return { fid: ov, by: '지정', name: raw, ambiguous: false };

    // 적요 전체와 「(」 앞까지 두 가지로 찾아본다 — 「박선유(에스와이피(SY」 같은 잘린 적요 때문
    const cands = [orgKey(raw), orgKey(payeeBase(raw))].filter((v, i, a) => v && a.indexOf(v) === i);
    let ambiguous = false;
    for (const key of cands) {
      for (const m of [centerMap, franchiseMap]) {
        const hit = m.get(key);
        if (!hit) continue;
        if (hit.fid) return { fid: hit.fid, by: hit.tier, name: hit.label, ambiguous: false };
        ambiguous = true;                                  // 이름이 갈렸다 — 다음 후보도 보지만 사유는 남긴다
      }
    }
    // 포함 매칭 — 적중이 «하나» 일 때만 인정
    const key0 = cands[0] || '';
    const hits = containKeys.filter(([k]) => key0.includes(k));
    const fids = Array.from(new Set(hits.map(([, v]) => v.fid)));
    if (fids.length === 1 && fids[0]) {
      const h = hits.find(([, v]) => v.fid === fids[0])!;
      return { fid: fids[0], by: h[1].tier, name: h[1].label, ambiguous: false };
    }
    if (fids.length > 1) ambiguous = true;
    return { fid: null, by: '', name: '', ambiguous };
  };

  const out: B2bAttribution = {
    rows: [], byFranchise: new Map(), unassigned: [], total: 0, assigned: 0, unassignedTotal: 0,
  };
  const unmatched = new Map<string, { payee: string; count: number; amount: number; reason: string }>();

  for (const r of b2bRows) {
    const amount = Number(r.amount) || 0;
    const hit = lookup(r.remark);
    out.total += amount;
    out.rows.push({
      date: r.date, remark: r.remark, amount,
      franchise_id: hit.fid, matched_by: hit.by, matched_name: hit.name,
    });
    if (hit.fid) {
      out.assigned += amount;
      const cur = out.byFranchise.get(hit.fid) || { amount: 0, count: 0 };
      cur.amount += amount; cur.count += 1;
      out.byFranchise.set(hit.fid, cur);
    } else {
      out.unassignedTotal += amount;
      const key = String(r.remark || '').trim();
      const cur = unmatched.get(key)
        || { payee: key, count: 0, amount: 0, reason: hit.ambiguous ? '같은 이름이 두 곳 이상' : '대리점·지사 이름과 맞는 것이 없음' };
      cur.count += 1; cur.amount += amount;
      unmatched.set(key, cur);
    }
  }
  out.unassigned = Array.from(unmatched.values()).sort((a, b) => b.amount - a.amount);
  return out;
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
/** ?hq_fee= 값 정규화. 「60」도 「0.6」도 60% 로 읽는다(정산관리 toRate 와 같은 규칙).
    안 넘겼거나 숫자가 아니면 null → 그때는 수동 설정·기본값을 쓴다. */
function toRateParam(v: string | null): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(1, n > 1 ? n / 100 : n);
}

async function franchiseReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const period = url.searchParams.get('period') || currentMonth();
  const { startMs, endMs, label } = monthRange(period);
  /* 🧾 (2026-08-18) 수수료율을 정산관리와 하나로 맞췄다.
     예전엔 여기만 «본사 15%» 가 박혀 있어서, 같은 가맹점을 두고 정산관리 화면은
     60% 를, 이 정산서는 15% 를 뗐다. 정산서는 **가맹점에 실제로 보내는 문서**라
     그 상태로 두면 분쟁이 난다.
     이제 판정은 org-settlement 의 resolveHqRate() 하나뿐이다:
       ① 대리점 수동 설정 → ② 그 대리점이 속한 지사 수동 설정 → ③ 기본값 60%
     ?hq_fee= 를 명시로 넘기면 그때만 전 가맹점에 그 값을 강제한다(«만약» 계산용). */
  const hqFeeParam = toRateParam(url.searchParams.get('hq_fee'));
  const rateOv: RateOverrides = hqFeeParam == null
    ? await safe(async () => await loadRateOverrides(env), { branch: new Map(), agency: new Map() } as RateOverrides)
    : { branch: new Map(), agency: new Map() };

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
  /* 🧾 요율이 대리점마다 다를 수 있으므로 «지사 × 대리점» 으로 쪼개 집계한다 (2026-08-18).
     지사 총매출 × 지사요율 로 계산하면 대리점별 수동 설정이 통째로 무시된다.
     ⚠️ 학생수는 쪼개도 안전하다 — shop_name 은 «학생 원부의 칸» 이라 한 학생은 대리점
        하나에만 속한다. 그래서 대리점별 DISTINCT 를 더해도 겹쳐 세지 않는다. */
  const attributed = await safe(async () => {
    const r = await env.DB.prepare(`
      WITH ${FRANCHISE_FID_CTE},
      att AS (
        SELECT p.id AS pay_id, p.amount_krw, p.user_id,
               ${franchiseFidSql('p', 'st')} AS fid,
               COALESCE(st.shop_name,'') AS agency
          FROM student_payments p
          LEFT JOIN students_erp st ON st.user_id = p.user_id
         WHERE p.status='paid' AND p.paid_at >= ? AND p.paid_at < ? AND ${notSeedSql('p')}
      )
      SELECT f.id AS franchise_id, f.name AS franchise_name, f.active AS active,
             a.agency AS agency_name,
             COALESCE(SUM(a.amount_krw),0) AS gross,
             COUNT(a.pay_id) AS pays,
             COUNT(DISTINCT a.user_id) AS students
        FROM att a JOIN franchises f ON f.id = a.fid
       GROUP BY f.id, f.name, f.active, a.agency
       HAVING gross > 0
       ORDER BY gross DESC
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<{ franchise_id: number; franchise_name: string; active: number; agency_name: string; gross: number; pays: number; students: number }>;
  }, []);

  // 장부 총 매출 — 배정된 합과 비교해 «배정 못 한 돈» 을 정직하게 드러낸다
  const bookTotal = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()}
    `).bind(startMs, endMs).first<{ revenue: number }>();
    return Number(r?.revenue) || 0;
  }, 0);

  /* 🏦 B2B 통장 직접입금도 정산서에 넣는다 (2026-08-18).
     학원이 수업료를 통장으로 바로 보내는 결제는 카페24를 안 거쳐 student_payments 에
     없다. 월간 리포트·KPI 의 매출은 2026-08-16 부터 이미 이것을 포함하는데 정산서만
     빠져 있어서, B2B 로 받는 가맹점은 매출이 0 으로 찍히고 회사 매출도 화면마다 달랐다.
     수수료율은 B2C 와 같은 값을 쓴다(계약이 다르다는 자료가 없다). */
  const b2b = await attributeB2bDeposits(env, period);

  // 가맹점 표는 «장부 결제만 있는 지사» 와 «B2B 만 있는 지사» 를 모두 담아야 한다
  type FrRow = { franchise_id: number; franchise_name: string; active: number; gross: number; pays: number; students: number;
                 b2bGross: number; b2bCount: number; byAgency: Map<string, number> };
  const merged = new Map<number, FrRow>();
  for (const f of attributed) {
    const cur = merged.get(f.franchise_id) || {
      franchise_id: f.franchise_id, franchise_name: f.franchise_name, active: f.active,
      gross: 0, pays: 0, students: 0, b2bGross: 0, b2bCount: 0, byAgency: new Map<string, number>(),
    };
    const amt = Number(f.gross) || 0;
    cur.gross += amt;
    cur.pays += Number(f.pays) || 0;
    cur.students += Number(f.students) || 0;
    // 대리점별 매출을 따로 쥔다 — 요율이 대리점마다 다를 수 있다
    cur.byAgency.set(f.agency_name || '', (cur.byAgency.get(f.agency_name || '') || 0) + amt);
    merged.set(f.franchise_id, cur);
  }
  if (b2b.byFranchise.size) {
    // B2B 만 있는 지사는 위 쿼리에 안 나오므로 이름을 따로 가져온다
    const missing = Array.from(b2b.byFranchise.keys()).filter(id => !merged.has(id));
    if (missing.length) {
      const names = await safe(async () => {
        const r = await selectInChunks<{ id: number; name: string; active: number }>(
          env.DB, missing,
          ph => `SELECT id, name, active FROM franchises WHERE id IN (${ph})`);
        return r;
      }, [] as Array<{ id: number; name: string; active: number }>);
      for (const f of names) {
        merged.set(Number(f.id), {
          franchise_id: Number(f.id), franchise_name: f.name, active: Number(f.active) || 0,
          gross: 0, pays: 0, students: 0, b2bGross: 0, b2bCount: 0, byAgency: new Map<string, number>(),
        });
      }
    }
    for (const [fid, agg] of b2b.byFranchise) {
      const row = merged.get(fid);
      if (!row) continue;                       // 지사 행이 사라진 경우 — 배정 못 한 쪽으로 남는다
      row.b2bGross += agg.amount; row.b2bCount += agg.count;
    }
  }

  /* 수수료는 «지사 총매출 × 지사요율» 이 아니라 «대리점별 수수료의 합» 이다.
     대리점마다 요율이 다를 수 있으므로 한 번에 곱하면 틀린 값이 나온다.
     ⚠️ B2B 통장 입금은 학생·대리점 정보가 없어(적요만 있다) 지사 요율로 뗀다.
        그 지사에 대리점별 설정이 걸려 있어도 B2B 분에는 못 쓴다 — 붙일 근거가 없다. */
  const rateOf = (branch: string, agency: string | null) =>
    hqFeeParam != null ? { rate: hqFeeParam, source: 'param' as const } : resolveHqRate(rateOv, branch, agency);

  const rows = Array.from(merged.values()).map(f => {
    const gross = f.gross + f.b2bGross;
    let fee = 0;
    const usedRates = new Set<number>();
    for (const [agency, amt] of f.byAgency) {
      const { rate } = rateOf(f.franchise_name, agency || null);
      fee += Math.round(amt * rate);
      usedRates.add(rate);
    }
    if (f.b2bGross > 0) {
      const { rate } = rateOf(f.franchise_name, null);
      fee += Math.round(f.b2bGross * rate);
      usedRates.add(rate);
    }
    // 화면에 찍는 요율은 «실제로 떼인 비율»(가중평균)이다. 고정 문구를 쓰면 거짓말이 된다
    const effRate = gross > 0 ? fee / gross : rateOf(f.franchise_name, null).rate;
    return {
      franchise_id: f.franchise_id,
      franchise_name: f.franchise_name + (Number(f.active) === 1 ? '' : ' (비활성 지사)'),
      students: f.students,
      pay_count: f.pays + f.b2bCount,
      book_revenue: f.gross,                    // 카페24 등 결제 장부
      b2b_revenue: f.b2bGross,                  // 통장 직접입금(B2B)
      b2b_count: f.b2bCount,
      gross_revenue: gross,
      hq_fee: fee,
      hq_fee_rate: effRate,                     // 실효 요율(가중평균) — 대리점마다 다르면 섞인 값
      rate_mixed: usedRates.size > 1,           // 한 지사 안에서 요율이 갈렸는지
      net_settlement: gross - fee,
      due_date: nextSettlementDate(period),
      status: '정산예정',
    };
  }).filter(r => r.gross_revenue > 0).sort((a, b) => b.gross_revenue - a.gross_revenue);

  const assigned = rows.reduce((a, r) => a + r.gross_revenue, 0);
  // 「장부 총 매출」의 정본도 월간 리포트와 같게 맞춘다 — 장부 결제 + 통장 B2B
  const revenueTotal = bookTotal + b2b.total;
  const unassigned = Math.max(0, revenueTotal - assigned);

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
    book: a.book + r.book_revenue, b2b: a.b2b + r.b2b_revenue,
  }), { gross: 0, fee: 0, net: 0, book: 0, b2b: 0 });

  // 전체 실효 요율 — 대리점마다 다를 수 있으니 «실제로 뗀 합 ÷ 총매출» 로 낸다
  const effRateAll = totals.gross > 0 ? totals.fee / totals.gross : (hqFeeParam ?? DEFAULT_HQ_RATE);
  const anyMixed = rows.some(r => r.rate_mixed) ||
    new Set(rows.map(r => Number(r.hq_fee_rate.toFixed(6)))).size > 1;

  const data = {
    ok: true, type: 'franchise', period, label,
    hq_fee_rate: effRateAll,                    // 실효(가중평균) — 화면 표기용
    hq_fee_rate_default: DEFAULT_HQ_RATE,       // 수동 설정이 없는 곳에 쓰인 기본값
    hq_fee_rate_forced: hqFeeParam,             // ?hq_fee= 로 강제한 경우만 값이 있다
    hq_fee_rate_mixed: anyMixed,                // 가맹점마다 요율이 갈렸는지
    method: 'attributed',                       // 균등분배(equal)가 아니라 학생 단위 귀속
    rows, totals,
    book_total: bookTotal,                      // 카페24 등 결제 장부만
    b2b_total: b2b.total,                       // 통장 직접입금(B2B) 전체
    b2b_assigned: b2b.assigned,
    b2b_unassigned_krw: b2b.unassignedTotal,
    b2b_count: b2b.rows.length,
    b2b_rows: b2b.rows,                         // 붙은 곳까지 밝힌 원본 입금 내역
    b2b_unassigned: b2b.unassigned,
    revenue_total: revenueTotal,                // 장부 + B2B — 월간 리포트의 매출과 같은 정의
    unassigned_krw: unassigned,
    unassigned_pct: revenueTotal > 0 ? Number(((unassigned / revenueTotal) * 100).toFixed(1)) : 0,
    unassigned_payers: unassignedPayers,
    sources: {
      gross_revenue: 'actual' as FigureSource,
      b2b_revenue: (b2b.total > 0 ? 'actual' : 'none') as FigureSource,
      // 요율은 이제 «추정» 이 아니라 정책값(본사 60%) + 사람이 지정한 수동 설정이다.
      // 다만 ?hq_fee= 로 강제한 «만약» 계산일 때는 추정으로 표시한다.
      hq_fee: (hqFeeParam != null ? 'estimated' : 'actual') as FigureSource,
      unassigned: (unassigned > 0 ? 'review' : 'actual') as FigureSource,
    },
    notes: [
      '가맹점별 매출은 학생 한 명씩 실제 소속을 따라가 합산한 값입니다. 균등분배가 아닙니다. 소속은 학생 원부의 지사 라벨을 먼저 쓰고, 라벨이 없으면 대리점 이름으로 찾습니다.',
      '총 매출 = 카페24 등 «장부 결제» + 학원이 통장으로 바로 보낸 «B2B 직접입금» 입니다(2026-08-18부터 B2B 포함 — 월간 리포트·KPI의 매출과 같은 정의). 본사 수수료율은 B2B·B2C 구분 없이 같은 값을 씁니다.',
      ...(hqFeeParam != null
        ? [`본사 수수료율을 ${(hqFeeParam * 100).toFixed(1)}% 로 «강제 지정»해 계산한 «만약» 값입니다(주소의 ?hq_fee=). 저장된 설정이 아니므로 이대로 가맹점에 보내지 마세요.`]
        : [`본사 수수료율은 정산관리 화면과 같은 기준입니다 — 지사·대리점별 «수수료 비율 설정»이 있으면 그 값, 없으면 기본값 ${(DEFAULT_HQ_RATE * 100).toFixed(0)}%(지점 ${((1 - DEFAULT_HQ_RATE) * 100).toFixed(0)}%). 이 달 실효 요율은 ${(effRateAll * 100).toFixed(1)}% 입니다.`,
           ...(anyMixed ? ['가맹점마다(또는 한 지사 안 대리점마다) 요율이 다릅니다. 표의 요율 칸은 그 가맹점에서 «실제로 떼인 비율»(가중평균)입니다.'] : []),
           'B2B 통장 직접입금은 학생·대리점 정보가 없어 지사 요율로 뗍니다 — 그 지사에 대리점별 설정이 걸려 있어도 B2B 분에는 적용할 근거가 없습니다.']),
      ...(b2b.total > 0 ? [`이 달 B2B 직접입금은 ${b2b.rows.length}건 · ₩${b2b.total.toLocaleString('ko-KR')} 이고, 그중 ₩${b2b.assigned.toLocaleString('ko-KR')} 을 가맹점에 붙였습니다. 입금 적요를 대리점·지사 이름과 맞춰 붙이며, 후보가 둘 이상이면 붙이지 않습니다.`] : []),
      ...(unassigned > 0 ? [`소속을 확정하지 못한 매출 ₩${unassigned.toLocaleString('ko-KR')}(${data0Pct(unassigned, revenueTotal)}%)은 어느 가맹점에도 넣지 않았습니다. 대부분은 «학생 원부에 없는 아이디로 들어온 결제»입니다 — 대리점·직원이 학생 몫을 대신 결제하면 그 아이디가 학생 원부에 없어 소속을 알 수 없습니다.`] : []),
      ...(b2b.unassignedTotal > 0 ? [`그중 B2B 직접입금 ₩${b2b.unassignedTotal.toLocaleString('ko-KR')} 은 입금 적요가 어느 대리점·지사인지 확정되지 않은 것입니다 — 회계관리 화면의 「🏦 배정 못 한 B2B 입금」 에서 한 번 지정하면 그 뒤로 자동으로 붙습니다.`] : []),
    ],
  };

  if (fmt === 'csv' || fmt === 'xlsx') {
    const HEAD = ['가맹점', '학생수', '결제건수', '장부 결제', 'B2B 직접입금', '총 매출', '수수료율', '본사 수수료', '정산액', '송금예정일', '상태'];
    const BODY = rows.map(r => [r.franchise_name, r.students, r.pay_count, r.book_revenue, r.b2b_revenue, r.gross_revenue,
                                `${(r.hq_fee_rate * 100).toFixed(1)}%${r.rate_mixed ? ' (혼합)' : ''}`,
                                r.hq_fee, r.net_settlement, r.due_date, r.status]);
    return out(fmt, `franchise-settlement-${period}.csv`, [
      ['망고아이 가맹점 정산서', label],
      [hqFeeParam != null
        ? `본사 수수료율: ${(hqFeeParam * 100).toFixed(1)}% (?hq_fee= 로 강제 지정한 «만약» 값 — 이대로 보내지 마세요)`
        : `본사 수수료율: 실효 ${(effRateAll * 100).toFixed(1)}% · 기본값 ${(DEFAULT_HQ_RATE * 100).toFixed(0)}%(지점 ${((1 - DEFAULT_HQ_RATE) * 100).toFixed(0)}%) · 지사·대리점별 수동 설정 우선${anyMixed ? ' · 가맹점마다 다름' : ''}`],
      ['산출 방식', '학생 단위 실제 귀속 (균등분배 아님) · 총 매출 = 장부 결제 + B2B 직접입금'],
      [],
      HEAD,
      ...BODY,
      ['합계', '', '', totals.book, totals.b2b, totals.gross, `${(effRateAll * 100).toFixed(1)}%`, totals.fee, totals.net, '', ''],
      [],
      ['매출 총계 (장부 결제 + B2B)', revenueTotal],
      ['  장부 결제 (카페24 등)', bookTotal],
      ['  B2B 직접입금 (통장)', b2b.total],
      ['가맹점에 배정된 매출', assigned],
      ['배정하지 못한 매출(확인 필요)', unassigned],
      ['  그중 B2B 직접입금', b2b.unassignedTotal],
      ...(unassignedPayers.length ? [
        [] as (string | number)[],
        ['[배정 못 한 결제자 — 어느 지사인지 알려 주시면 바로 붙습니다]'] as (string | number)[],
        ['결제 아이디', '건수', '금액', '사유'] as (string | number)[],
        ...unassignedPayers.map(u => [u.user_id, u.pays, u.amount, u.reason] as (string | number)[]),
      ] : []),
      ...(b2b.unassigned.length ? [
        [] as (string | number)[],
        ['[배정 못 한 B2B 직접입금 — 어느 대리점·지사인지 알려 주시면 바로 붙습니다]'] as (string | number)[],
        ['입금 적요', '건수', '금액', '사유'] as (string | number)[],
        ...b2b.unassigned.map(u => [u.payee, u.count, u.amount, u.reason] as (string | number)[]),
      ] : []),
    ], [
      // 📊 엑셀에서는 가맹점 표와 «배정 못 한» 목록들을 시트로 나눈다 — 그대로 정렬·필터할 수 있게
      { name: '가맹점별', headerRows: 1, rows: [HEAD, ...BODY] },
      ...(b2b.rows.length ? [{ name: 'B2B 직접입금', headerRows: 1, rows: [
        ['일자', '입금 적요', '금액', '붙은 곳', '붙인 방법'],
        ...b2b.rows.map(r => [r.date, r.remark, r.amount, r.matched_name || '(배정 못 함)', r.matched_by || '']),
      ] } as XlsxSheet] : []),
      ...(unassignedPayers.length ? [{ name: '배정 못 한 결제자', headerRows: 1, rows: [
        ['결제 아이디', '건수', '금액', '사유', '지사(적어주세요)'],
        ...unassignedPayers.map(u => [u.user_id, u.pays, u.amount, u.reason, '']),
      ] } as XlsxSheet] : []),
      ...(b2b.unassigned.length ? [{ name: '배정 못 한 B2B 입금', headerRows: 1, rows: [
        ['입금 적요', '건수', '금액', '사유', '지사(적어주세요)'],
        ...b2b.unassigned.map(u => [u.payee, u.count, u.amount, u.reason, '']),
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

/* 🏢 «이 결제는 어느 지사인가» 판정 — 가맹점 정산(franchiseReport)과 학생 결제 내역이
   **같은 규칙**을 써야 한다. 두 화면이 서로 다른 지사를 가리키면 대사(對査)가 안 되고,
   「정산표엔 있는데 결제 내역엔 없다」는 제보가 그대로 나온다.
   그래서 판정식을 여기 한 곳에 두고 양쪽이 이것만 부른다. 순서·의미는 franchiseReport
   주석에 상세히 적어 두었다(① 사람이 지정한 대리결제자 → ② 캐피타운 대리점 계정 →
   ③ 학생 원부의 지사 라벨 → ④ 대리점 이름). 어느 것도 못 찾으면 NULL = «배정 불가».
   ⚠️ fmap·cmap CTE(FRANCHISE_FID_CTE)가 같은 쿼리 안에 있어야 한다. */
const FRANCHISE_FID_CTE = `
      fmap AS (
        SELECT name, MIN(id) AS fid, COUNT(*) AS nf
          FROM franchises WHERE COALESCE(name,'') <> '' GROUP BY name
      ),
      cmap AS (
        SELECT name, MIN(franchise_id) AS fid, COUNT(DISTINCT franchise_id) AS nf
          FROM centers WHERE franchise_id IS NOT NULL AND COALESCE(name,'') <> ''
         GROUP BY name
      )`;
/** @param p student_payments 별칭 · @param st students_erp 별칭 */
function franchiseFidSql(p: string, st: string): string {
  return `COALESCE(
                 -- ① 사람이 지정해 준 대리 결제자 (학생 원부에 없는 아이디를 구제)
                 (SELECT o.franchise_id FROM payer_franchise_override o WHERE o.payer_user_id = ${p}.user_id),
                 -- ② 캐피타운 대리점 로그인 아이디 → 그 대리점이 속한 지사
                 (SELECT ${CAPITOWN_FID} FROM capitown_agencies ca WHERE ca.login_id = ${p}.user_id LIMIT 1),
                 -- ③ 학생 원부의 지사 라벨
                 (SELECT m.fid FROM fmap m WHERE m.name = ${st}.franchise  AND m.nf = 1),
                 -- ④ 대리점 이름 → 지사 (라벨이 없는 학생용 폴백)
                 (SELECT c.fid FROM cmap c WHERE c.name = ${st}.shop_name AND c.nf = 1)
               )`;
}

/* 🧑 «이 결제는 누구인가» — 원부의 이름 칸이 여러 개고 원부마다 채워진 자리가 다르다.
   환불/취소 목록(#230)과 학생 결제 내역(#02)이 «같은 이름» 을 보여야 한다. 한쪽만 고치면
   같은 학생이 화면마다 다른 이름(혹은 빈칸)으로 나온다 — 그래서 식을 여기 한 곳에 둔다.
   ⚠️ 공백만 든 칸이 실제로 있어서 TRIM 이 필요하다. 이것들도 다 비면 NULL = «원부 없음».
   ⚠️ 부르는 쪽은 students_erp 를 반드시 **LEFT** JOIN 할 것 — 퇴원 등으로 원부에서 빠진
      결제가 실제로 있고, INNER 로 바꾸면 그 행이 목록에서 통째로 사라진다. */
function studentNameSql(st: string): string {
  return `COALESCE(NULLIF(TRIM(${st}.korean_name),''), NULLIF(TRIM(${st}.student_name),''),
                    NULLIF(TRIM(${st}.english_name),''), NULLIF(TRIM(${st}.username),''))`;
}

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
/* 📅 재무제표 조회 기간 — 월(YYYY-MM) 과 분기(YYYY-Qn) 를 둘 다 받는다 (2026-08-18 신설).
   분기는 «그 분기 3개월치를 합산» 한다. 합산은 월별 계산(monthPL·monthCash)을 그대로
   3번 돌려 더하는 방식이다 — 그래야 월 화면과 분기 화면의 숫자가 구조적으로 어긋날 수 없다.
   ⚠️ 잔액성 항목(통장 잔액·미지급 급여)은 «더하면 안 되는» 값이라 분기 마지막 달 기준으로 본다.
   표기는 사장님 요청대로 «2026 1분기» 형태(20XX N분기). */
const STATEMENT_QUARTER_RE = /^(\d{4})-?[Qq]([1-4])$/;

function statementPeriod(period: string):
  { months: string[]; label: string; endLabel: string; isQuarter: boolean } {
  const q = STATEMENT_QUARTER_RE.exec(String(period).trim());
  if (q) {
    const y = Number(q[1]), n = Number(q[2]);
    const { months } = quarterRange(y, n);
    const sm = (n - 1) * 3 + 1;
    return {
      months,
      label: `${y} ${n}분기 (${sm}~${sm + 2}월 합산)`,
      endLabel: `${y} ${n}분기 말`,
      isQuarter: true,
    };
  }
  let label: string;
  try { label = monthRange(period).label; }
  catch { throw new Error('invalid period (YYYY-MM 또는 YYYY-Qn)'); }
  return { months: [period], label, endLabel: `${label} 말`, isQuarter: false };
}

/* 📊 재무제표가 쓰는 «기간 합계». 달이 하나면 그 달, 분기면 3개월 합.
   숫자의 출처는 여전히 monthPL()/monthCash() 하나뿐이다(규칙이 갈라지지 않게). */
async function statementBasis(env: Env, months: string[]) {
  const parts = await Promise.all(months.map(async m => ({
    pl: await monthPL(env, m),
    cash: await monthCash(env, m),
  })));
  const sum = (f: (p: typeof parts[number]) => number) => parts.reduce((a, p) => a + f(p), 0);
  /* 🏷️ 계좌 출금은 계정과목 이름으로 합친다 — 3개월치가 «임대료» 세 줄로 늘어서면 못 읽는다. */
  const bankMap = new Map<string, number>();
  for (const p of parts) {
    for (const b of p.pl.ax.bankRows) {
      bankMap.set(b.category, (bankMap.get(b.category) || 0) + (Number(b.total) || 0));
    }
  }
  const bankRows = [...bankMap].map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
  return {
    revBook: sum(p => p.pl.rev.book),
    revB2b: sum(p => p.pl.rev.b2b),
    revTotal: sum(p => p.pl.rev.total),
    payCount: sum(p => p.pl.rev.payCount),
    b2bCount: sum(p => p.pl.rev.dep.b2bRows.length),
    depPg: sum(p => p.pl.rev.dep.pg),
    /* 「케이씨피M」(운영자금 이체)은 손익계산서가 한 줄도 쓰지 않으므로 여기서도 세지 않는다.
       ⚠️ 예전 주석은 «그 사실은 월간 회계 리포트의 «운영자금 보충» 줄이 보여 준다» 였는데,
          그 줄은 2026-08-18 사장님 지시로 화면에서 **없앴다**. 이제 어느 화면도 알려 주지 않는다.
       ⛔ 그러니 이 값으로 화면 줄을 다시 만들지 말 것(같은 날 지시). 확인이 필요하면
          D1 `bankacct_transactions` 를 직접 볼 것. */
    transferUnknown: sum(p => p.pl.rev.dep.transferUnknown),
    payroll: sum(p => p.pl.payroll.total),
    payrollEff: sum(p => p.pl.payrollEff),
    pgFee: sum(p => p.pl.pgFee),
    opCost: sum(p => p.pl.opCost),
    /* 🧾 부가세는 달마다 «그 달 매출 ÷ 11» 로 계산해 더한다(월 화면 합과 1원도 안 어긋나게) */
    tax: sum(p => Math.round(p.pl.rev.total / 11)),
    ax: {
      cardSpend: sum(p => p.pl.ax.cardSpend),
      bankRows,
      bankOpex: sum(p => p.pl.ax.bankOpex),
      bankDup: sum(p => p.pl.ax.bankDup),
      teacherPayout: sum(p => p.pl.ax.teacherPayout),
      refunds: sum(p => p.pl.ax.refunds),
      // 한 달이라도 신한 실데이터가 있으면 «추정» 이 아니라 실데이터 기준으로 그린다
      hasActual: parts.some(p => p.pl.ax.hasActual),
    },
    cash: {
      cin: sum(p => p.cash.cin), cout: sum(p => p.cash.cout),
      n: sum(p => p.cash.n), pg: sum(p => p.cash.pg),
    },
  };
}

async function statementReport(env: Env, url: URL, fmt: string): Promise<Response> {
  const type = (url.searchParams.get('type') || 'pl').toLowerCase();
  const period = url.searchParams.get('period') || currentMonth();
  const { months, label, endLabel, isQuarter } = statementPeriod(period);
  const lastMonth = months[months.length - 1];
  const startMs = monthRange(months[0]).startMs;
  const endMs = monthRange(lastMonth).endMs;
  const periodWord = isQuarter ? '당분기' : '당월';

  /* 💰 매출·비용은 monthPL() 한 곳에서 — 월간 리포트와 숫자가 어긋나지 않게(2026-08-16).
     매출에는 통장 B2B 직접입금이 포함된다. 분기면 3개월치를 합산한 값이다(2026-08-18). */
  const B = await statementBasis(env, months);
  const rev = { revenue: B.revTotal, pay_count: B.payCount };
  const payroll = B.payroll;
  const ax = B.ax;
  /* 💵 통장 기준 사실 — 손익계산서도 월간 리포트와 똑같이 «매출 누락» 을 밝히고
     실제 현금흐름을 함께 보여 준다. 화면마다 말이 다르면 안 된다(2026-08-16 제보).
     비교 대상은 «진짜 PG 정산분 vs 장부 결제 매출» 이다(B2B 직접입금은 PG 를 안 거친다). */
  const plCash = B.cash;
  const plGap = revenueGapOf(B.depPg, B.revBook);
  const { cardSpend, bankRows: bankOpexRows, bankOpex, bankDup, hasActual } = ax;
  const opCost = B.opCost;
  const pgFee = B.pgFee;

  /* 🧾 부가세 — 예전엔 «매출 × 3%» 라는 근거 없는 식이었다. 우리 매출은 부가세 포함
     금액이므로 예수 부가세 = 매출 ÷ 11 이 정본이다. 매입세액 공제는 세금계산서 자료가
     없어 반영하지 못한다 → 여전히 «추정» 이라고 밝힌다(2026-08-16). */
  const tax = B.tax;

  const seedEx = await seedRevenueExcluded(env, startMs, endMs);   // 🌱 리포트에서 뺀 시드 매출

  /* 🧑‍🏫 강사 급여 — 급여명세(payslips)가 있으면 그것이 정본. 비어 있으면 신한 계좌의
     강사 송금(메트로은행, 실데이터)으로 대신한다. 둘 다 있으면 급여명세를 쓰고 송금분은
     중복이라 제외(안내 줄 표시). 💸 학생 환불은 비용이 아니라 매출 차감(2026-08-15 확인). */
  const payrollEff = B.payrollEff;
  const payrollFromBank = payroll <= 0 && ax.teacherPayout > 0;
  const revNet = rev.revenue - ax.refunds;

  const totalCost = payrollEff + pgFee + opCost + tax;
  const netIncome = revNet - totalCost;
  const grossProfit = revNet - payrollEff - pgFee;
  const operatingProfit = grossProfit - opCost;

  /* 🏦 통장 실제 잔액 — 재무상태표의 «현금» 을 «매출 × 70%» 로 지어내던 것을 대체한다.
     그 달 마지막 거래의 balance 가 월말 잔액이다. 마이너스면 마이너스 그대로 쓴다.
     분기 조회면 «분기 마지막 달» 의 잔액이다 — 잔액은 더하는 값이 아니다(2026-08-18). */
  const cashActual = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT balance FROM bankacct_transactions WHERE substr(trans_at,1,7)<=?
      ORDER BY trans_at DESC, id DESC LIMIT 1
    `).bind(lastMonth).first<{ balance: number }>();
    return r ? Number(r.balance) : null;
  }, null as number | null);

  /* 💼 미지급 강사급여 — payslips.paid=0 인 실제 행. 예전엔 «그 달 급여 전액» 을
     미지급금으로 잡아 이미 지급한 돈까지 부채로 세었다. */
  const unpaidPayroll = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT COALESCE(SUM(payment_krw),0) AS t FROM payslips
      WHERE COALESCE(paid,0)=0 AND period<=? AND ${realPayslipSql()}
    `).bind(lastMonth).first<{ t: number }>();
    return Number(r?.t) || 0;
  }, 0);

  let data: any;

  if (type === 'pl') {
    // 손익계산서 (Income Statement / Profit & Loss)
    data = {
      ok: true, type: 'pl', period, months, is_quarter: isQuarter,
      label: `손익계산서 (P&L) — ${label}`,
      sections: [
        { title: 'I. 매출액 (Revenue)', items: [
          /* 📅 분기 조회는 «3개월치를 더한 값» 이다. 표만 보고 한 달치로 오해하지 않도록 밝힌다. */
          ...(isQuarter ? [{ name: `※ ${label} — ${months.join(' · ')} 3개월치를 합산한 금액입니다.`, sub: true }] : []),
          { name: '수업료 매출 (카페24 등 결제)', amount: B.revBook },
          ...(B.revB2b > 0
            ? [{ name: `통장 직접입금 (B2B ${B.b2bCount}건 · 신한 실데이터)`, amount: B.revB2b }]
            : []),
          ...(ax.refunds > 0 ? [{ name: '학생 환불 (신한 계좌·실데이터)', amount: -ax.refunds }] : []),
          /* ⛔ 확인이 끝난 자기 계좌 간 자금 이동은 손익계산서에서 **한 줄도 쓰지 않는다**
             (2026-08-18 사장님 지시). 원래도 매출 «금액» 에는 안 들어갔지만, 매출액 칸에
             ₩ 금액이 적힌 안내줄이 있으니 «매출에 섞인 돈» 으로 읽혔다.
             ℹ️ 같은 날 추가 지시로 **월간 회계 리포트에서도** 그 줄과 내역 펼치기를 걷어냈다
                (구 «운영자금 보충» 줄). 세 화면(월간·손익·대사)이 같은 기준이다.
             ⛔ transferUnknown(아직 성격을 모르는 입금)도 같은 날 추가 지시로 **화면에서 뺐다.**
                매출로 잡지 않는 계산은 그대로다 — 금액을 손익계산서에 적지 않을 뿐이다. */
          ...(seedEx.amount > 0 ? [{ name: `※ 시연용 테스트 결제 ₩${seedEx.amount.toLocaleString('ko-KR')} (${seedEx.count}건)은 실매출이 아니라 제외했습니다`, sub: true }] : []),
          ...(plGap > 0 ? [{ name: `⚠️ ${isQuarter ? '이 분기' : '이 달'} 통장에 들어온 카드 정산금은 ₩${plCash.pg.toLocaleString('ko-KR')} 인데 장부 매출은 위 금액뿐입니다(차이 ₩${plGap.toLocaleString('ko-KR')}). 매출이 장부에 덜 잡혀 아래 순이익이 실제보다 나쁘게 나옵니다 — 「매출–입금 대사」 카드를 확인하세요.`, sub: true }] : []),
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
          /* 📅 «실데이터 달 + 추정 달» 이 섞인 분기 — 추정 달의 10% 추정분은 합계(opCost)에는
             들어 있는데 위 내역(전부 실데이터)에는 줄이 없어서 내역 합 ≠ 합계가 됐다.
             그 차액을 줄로 밝힌다(내역 합이 합계와 1원도 안 어긋나게). */
          ...(opCost - (cardSpend + bankOpex) > 0
            ? [{ name: '운영비 추정분 (신한 자료가 없는 달 — 그 달 매출의 10% 추정)', amount: -(opCost - (cardSpend + bankOpex)) }] : []),
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
           누락분만큼 나쁘게 나온다. 통장에는 수업료가 아닌 돈(세금 환급·이자 등)도
           들어오므로 «순증감 = 번 돈» 은 아니다(2026-08-18). */
        ...(plCash.n > 0 ? [{ title: '※ 참고 — 통장 기준 실제 현금흐름 (신한 계좌)', items: [
          { name: '실제 입금', amount: plCash.cin },
          { name: '실제 출금', amount: -plCash.cout },
          { name: '순증감 (통장이 실제로 늘거나 준 돈)', amount: plCash.cin - plCash.cout, highlight: true },
          /* 📌 이 «실제 입금» 은 monthCash 가 내부 자금이체를 이미 뺀 값이다(cin = t.cin − transferKnown).
             2026-08-18 실측: 2026-06 통장 입금 21,480,287 − 자금이체 8,172,004 = 13,308,283 = 화면 값.
             ⚠️ 예전 문구는 «자금이체가 섞여 있다» 고 했는데 **사실과 달랐다**(같은 날 수정).
                남은 «매출 아닌 돈» 은 세금 환급·이자 같은 것들이라 그렇게만 밝힌다.
             ⛔ 여기에 「운영자금」·「케이씨피M」 같은 표현을 다시 쓰지 말 것(사장님 지시). */
          { name: '※ 위 손익은 장부(결제기록) 기준이라 장부에 안 잡힌 매출만큼 나쁘게 나옵니다. 이 «실제 입금» 에는 수업료가 아닌 돈(세금 환급·이자 등)도 섞일 수 있으니, 순증감을 그대로 «번 돈» 으로 보시면 안 됩니다.', sub: true },
        ]}] : []),
      ],
      summary: { revenue: rev.revenue, cost: totalCost, net: netIncome, margin_pct: rev.revenue>0?Number(((netIncome/rev.revenue)*100).toFixed(2)):0,
        // 운영비 출처 — actual = 신한 실지출(카드+계좌), estimated = 매출 10% 추정,
        // mixed = 분기 안에 실데이터 달과 추정 달이 섞임(«전부 실데이터» 로 읽히면 안 된다)
        opex_source: hasActual ? (opCost - (cardSpend + bankOpex) > 0 ? 'mixed' : 'actual') : 'estimated',
        card_spend: cardSpend, bank_opex: bankOpex, bank_dup_excluded: bankDup,
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
      ok: true, type: 'bs', period, months, is_quarter: isQuarter,
      label: `재무상태표 (BS) — ${endLabel} 기준`,
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
      notes: [...(isQuarter ? ['잔액(통장 잔액·미지급 급여)은 더하는 값이 아니라서 «분기 마지막 달» 기준으로 보여 줍니다. 부가세는 3개월치 합계입니다.'] : []),
        '이 표는 «완전한 재무상태표가 아닙니다». 통장 잔액과 미지급 급여처럼 시스템이 실제로 아는 것만 담았습니다. 자산대장·미수금 명세를 등록하면 그때 완성됩니다.'],
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
      ok: true, type: 'cf', period, months, is_quarter: isQuarter,
      label: `현금흐름표 (CF) — ${label}`,
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
      { name: `현금 (${periodWord} 증감)`, amount: Math.abs(cashDelta), debit: cashDelta >= 0, credit: cashDelta < 0 },
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
      ok: true, type: 'tb', period, months, is_quarter: isQuarter,
      label: `시산표 (Trial Balance) — ${label}`,
      sections: [{ title: `계정과목별 잔액 (${periodWord} 발생분)`, items: lines }],
      summary: {
        debit_total: debitTotal,
        credit_total: creditTotal,
        balanced: debitTotal === creditTotal,
        difference: debitTotal - creditTotal,
      },
      notes: [
        `${periodWord}에 «발생한» 거래만 담은 시산표입니다(이월 잔액은 포함하지 않습니다).`,
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
  let b2cExcluded = 0;   // B2C(선불)라서 미수금에서 뺀 학생 수 — 화면 각주용
  if (kind === 'receivable') {
    /* 학생 미수금 — status 는 활동인데 end_date 가 지난 학생.

       🔁 (2026-08-18 사장님 지시) **B2C 학생은 미수금이 아니다.**
          B2C(개인 결제)는 선불이다 — 결제한 만큼만 수업이 나가고 끝난다. 그러니
          수업이 끝나 있는 것은 «못 받은 돈» 이 아니라 «아직 연장을 안 한 것» 이다.
          받을 돈이 없는 사람을 미수금 표에 올려 두면 장부가 거짓말을 한다.
          → 여기서 통째로 뺀다. 그들의 «미연장» 은 회계관리 ▸ 수강료 미연장 자동 알림에서 본다.

          판정 정본은 대리점 지정값 centers.payment_type 이고, 학생 → 대리점 연결은
          students_erp.shop_name = centers.name 이다(결제 목록 paymentsList 와 같은 규칙).
          ⚠️ 상관 서브쿼리(EXISTS)로 쓰면 같은 판정에 1,900만 행을 읽는다(실측).
             NOT IN (SELECT …) 은 부질의를 한 번만 만들어 4만 행이면 끝난다. 이 형태를 유지할 것.
          ⚠️ centers.name 이 유일하지 않아도 «이름 집합에 있나» 만 보므로 행 뻥튀기가 없다. */
    const B2C_EXCLUDE_SQL = `(s.shop_name IS NULL OR s.shop_name NOT IN
        (SELECT name FROM centers WHERE UPPER(COALESCE(payment_type,'')) = 'B2C' AND name IS NOT NULL AND name <> ''))`;
    rows = await safe(async () => {
      const r = await env.DB.prepare(`
        SELECT s.user_id, s.korean_name, s.end_date,
               (julianday(?) - julianday(s.end_date)) AS days_overdue
        FROM students_erp s
        WHERE s.status IN ('정상','활동','active') AND s.end_date IS NOT NULL AND s.end_date < ?
          AND ${B2C_EXCLUDE_SQL}
        ORDER BY days_overdue DESC LIMIT 200
      `).bind(todayKst, todayKst).all();
      return ((r.results || []) as Array<any>).map(s => ({
        target: s.korean_name || s.user_id,
        target_id: s.user_id,
        issued: s.end_date,
        amount: 0, // 실제 미납 금액은 enrollments.monthly_fee_krw 또는 별도 테이블 필요
        days: Math.floor(s.days_overdue || 0),
        note: '수강 만료 후 미납 (B2B)',
      }));
    }, []);
    // 몇 명을 B2C 라서 뺐는지 — 화면에 근거로 적어 준다("갑자기 줄었다"는 오해 방지)
    b2cExcluded = await safe(async () => {
      const r = await env.DB.prepare(`
        SELECT COUNT(*) AS c FROM students_erp s
        WHERE s.status IN ('정상','활동','active') AND s.end_date IS NOT NULL AND s.end_date < ?
          AND NOT ${B2C_EXCLUDE_SQL}
      `).bind(todayKst).first<{ c: number }>();
      return Number(r?.c) || 0;
    }, 0);
    label = '학생 미수금 (B2B 수강 만료 후 미납 · B2C 제외)';
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
        SELECT COUNT(*) AS c FROM students_erp s
        WHERE s.status IN ('정상','활동','active') AND s.end_date IS NOT NULL AND s.end_date < ?
          AND (s.shop_name IS NULL OR s.shop_name NOT IN
               (SELECT name FROM centers WHERE UPPER(COALESCE(payment_type,'')) = 'B2C' AND name IS NOT NULL AND name <> ''))
      `).bind(todayKst).first<{ c: number }>();
      return Number(r?.c) || 0;
    }, totals.count);
    if (candidates > rows.length) rNotes.push(`대상 ${candidates.toLocaleString('ko-KR')}명 중 경과일이 긴 ${rows.length}명만 표시했습니다.`);
    if (b2cExcluded > 0) rNotes.push(`B2C(개인 결제) ${b2cExcluded.toLocaleString('ko-KR')}명은 제외했습니다 — 결제한 만큼만 수업이 나가는 선불 구조라 미수금이 아니라 «미연장»입니다. 「회계관리 ▸ 수강료 미연장 자동 알림」에서 확인하세요.`);
    rNotes.push('금액이 모두 0원인 이유: 학생별 수강료 단가가 시스템에 없어 미납액을 계산할 수 없습니다. 수강료 정보를 등록하면 금액이 채워집니다.');
    rNotes.push('원부에 퇴원 처리가 안 된 옛 학생이 섞여 있을 수 있습니다 — 실제 미수금과 다를 수 있습니다.');
  } else if (kind === 'pending') {
    rNotes.push('가맹점 정산 금액은 「🏢 가맹점별 정산서」에서 학생 단위로 정확히 계산합니다.');
  }

  const data = { ok: true, type: 'receivables', kind, label, rows, totals, candidates, notes: rNotes,
    b2c_excluded: b2cExcluded,
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
  /* 🏢 (2026-08-18 수정요청 #02) 지사 필터 — 결제 행에도 지사 값이 없어서 결제자 아이디로
     지사를 파생한다. 판정은 가맹점 정산(franchiseReport)과 **같은 규칙**을 쓴다
     (franchiseFidSql). 두 화면이 서로 다른 지사를 가리키면 대사가 안 되기 때문이다.
       · franchise_id=<숫자>  : 지사 하나 정확히 (드롭다운에서 고른 경우)
       · franchise=<이름조각> : 이름으로 검색 (직접 타이핑한 경우) */
  const franchiseId = Number(url.searchParams.get('franchise_id')) || 0;
  const franchiseQ = String(url.searchParams.get('franchise') || '').trim();
  const wantFranchise = franchiseId > 0 || franchiseQ !== '';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500);

  // 🌱 시드 결제는 목록에서도 뺀다 — 합계(리포트)와 목록이 다르면 대사(對査)가 안 된다
  const where: string[] = ['1=1', notSeedSql('p')];
  const args: unknown[] = [];
  if (from) { where.push('p.paid_at >= ?'); args.push(new Date(from + 'T00:00:00+09:00').getTime()); }
  if (to)   { where.push('p.paid_at < ?');  args.push(new Date(to   + 'T23:59:59+09:00').getTime()); }
  if (method) { where.push('p.method = ?'); args.push(method); }
  if (status) { where.push('p.status = ?'); args.push(status); }

  // 지사 판정에 쓰는 «사람이 지정한 대리결제자» 표 — 없으면 만든다(franchiseReport 와 동일)
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS payer_franchise_override (payer_user_id TEXT PRIMARY KEY, franchise_id INTEGER NOT NULL, note TEXT, updated_at INTEGER NOT NULL);`);
  } catch { /* 이미 있으면 그만 */ }

  /* 지사 파생이 실패(테이블 없음 등)했는데 «지사로 걸러 달라» 는 요청이었다면
     걸러지지 않은 목록을 그냥 돌려주면 안 된다 — 사용자는 필터가 먹은 줄 안다. */
  let enriched = true;

  const rows = await safe(async () => {
    // centers 이름이 유일하지 않을 수 있어 JOIN 대신 스칼라 서브쿼리(행 뻥튀기 방지)
    const chExpr = `CASE WHEN UPPER(COALESCE(
        (SELECT c.payment_type FROM centers c WHERE c.name = s.shop_name AND c.payment_type IS NOT NULL ORDER BY c.id LIMIT 1),
        CASE WHEN s.payment_type LIKE 'B2B%' THEN 'B2B' ELSE '' END
      )) = 'B2B' THEN 'B2B' ELSE 'B2C' END`;
    /* 🧑 (2026-08-18 수정요청 #02) 학생 «이름» — 아이디만 있으면 누구 결제인지 모른다.
       식은 환불/취소 목록과 공유한다(studentNameSql). 화면마다 이름이 달라지면 안 된다. */
    const nameExpr = studentNameSql('s');
    const outWhere: string[] = ['1=1'];
    const outArgs: unknown[] = [];
    if (channel === 'B2B' || channel === 'B2C') { outWhere.push('channel = ?'); outArgs.push(channel); }
    if (franchiseId > 0) { outWhere.push('franchise_id = ?'); outArgs.push(franchiseId); }
    else if (franchiseQ) { outWhere.push('franchise_name LIKE ?'); outArgs.push('%' + franchiseQ + '%'); }
    try {
      const r = await env.DB.prepare(`
        WITH ${FRANCHISE_FID_CTE}
        SELECT * FROM (
          SELECT b.*, (SELECT f.name FROM franchises f WHERE f.id = b.franchise_id) AS franchise_name
          FROM (
            SELECT p.id, p.paid_at, p.user_id, p.amount_krw, p.method, p.memo, p.status,
                   s.shop_name AS shop_name, ${nameExpr} AS student_name,
                   ${chExpr} AS channel,
                   ${franchiseFidSql('p', 's')} AS franchise_id
            FROM student_payments p
            LEFT JOIN students_erp s ON s.user_id = p.user_id
            WHERE ${where.join(' AND ')}
          ) b
        ) WHERE ${outWhere.join(' AND ')}
        ORDER BY paid_at DESC LIMIT ?
      `).bind(...args, ...outArgs, limit).all();
      return (r.results || []) as Array<any>;
    } catch {
      // centers·students_erp 가 아직 없는 새 환경 — 구분 없이 예전 그대로의 목록이라도 준다
      enriched = false;
      const r = await env.DB.prepare(`
        SELECT p.id, p.paid_at, p.user_id, p.amount_krw, p.method, p.memo, p.status
        FROM student_payments p
        WHERE ${where.join(' AND ')}
        ORDER BY p.paid_at DESC LIMIT ?
      `).bind(...args, limit).all();
      return (r.results || []) as Array<any>;
    }
  }, []);

  if (wantFranchise && !enriched) {
    return json({ ok: false, type: 'payments-list',
      error: '지사 소속 정보를 읽지 못해 지사 필터를 적용할 수 없습니다(franchises·centers·students_erp 확인 필요).' }, 500);
  }

  const totals = rows.reduce((a, r) => ({
    count: a.count + 1,
    paid: a.paid + (r.status === 'paid' ? r.amount_krw : 0),
  }), { count: 0, paid: 0 });

  const data = { ok: true, type: 'payments-list', rows, totals };
  if (fmt === 'csv' || fmt === 'xlsx') {
    const scope = [
      (channel === 'B2B' || channel === 'B2C') ? channel : '',
      franchiseId > 0 ? (String(rows.find(r => r.franchise_name)?.franchise_name || `지사#${franchiseId}`)) : (franchiseQ ? `지사~${franchiseQ}` : ''),
    ].filter(Boolean).join(' · ');
    return out(fmt, 'payments.csv', [
      ['망고아이 학생 결제 내역' + (scope ? ` (${scope})` : '')],
      [],
      ['시각(KST)', '주문ID', '학생ID', '학생이름', '구분', '지사', '가맹점', '금액', '결제수단', '메모', '상태'],
      ...rows.map(r => [
        new Date((r.paid_at || 0) + 9*3600*1000).toISOString().slice(0,19).replace('T',' '),
        r.id, r.user_id, r.student_name || '', r.channel || '', r.franchise_name || '',
        r.shop_name || '', r.amount_krw, r.method || '', r.memo || '', r.status,
      ]),
      ['합계', '', '', '', '', '', '', totals.paid, '', '', `${totals.count}건`],
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

  /* 🧑‍🎓 학생 이름·아이디 (2026-08-18 추가)
     예전에는 user_id 하나만 내려줘서 화면에 「imom0553b」 같은 로그인 아이디만 떴다.
     누구 환불인지 알 수 없어 사장님이 매번 다른 화면에서 아이디를 찾아 대조해야 했다.
     students_erp 를 LEFT JOIN 해 이름을 붙인다 — **LEFT** 인 이유는 퇴원 등으로
     원부에서 빠진 결제가 실제로 있기 때문(실측: 취소 119건 중 이름이 없는 건이 있다).
     INNER JOIN 으로 바꾸면 그 행들이 목록에서 통째로 사라진다.
     이름 컬럼도 원부마다 채워진 자리가 달라(korean_name / student_name / english_name)
     COALESCE 로 차례로 본다. */
  const where: string[] = ["p.status IN ('refunded','cancelled','failed','pending')", notSeedSql('p')];
  if (status) { where.push('p.status = ?'); }
  const stmt = env.DB.prepare(`
    SELECT p.id, p.paid_at, p.created_at, p.user_id, p.amount_krw, p.method, p.memo, p.status,
           ${studentNameSql('s')} AS student_name,
           COALESCE(NULLIF(TRIM(s.login_id),''), p.user_id) AS login_id
    FROM student_payments p
    LEFT JOIN students_erp s ON s.user_id = p.user_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.paid_at DESC LIMIT 200
  `);
  const rows = await safe(async () => {
    const r = status ? await stmt.bind(status).all() : await stmt.all();
    return (r.results || []) as Array<any>;
  }, []);

  const data = { ok: true, type: 'refunds-list', rows, count: rows.length };
  if (fmt === 'csv' || fmt === 'xlsx') {
    const kst = (ms: number) => ms ? new Date(ms + 9*3600*1000).toISOString().slice(0,19).replace('T',' ') : '';
    return out(fmt, 'refunds.csv', [
      ['망고아이 환불/취소 내역'],
      [],
      ['등록일', '결제일자', '주문ID', '학생이름', '아이디', '금액', '상태', '메모'],
      ...rows.map(r => [
        kst(r.created_at || 0), kst(r.paid_at || 0),
        r.id, r.student_name || '', r.login_id || r.user_id, r.amount_krw, r.status, r.memo || '',
      ]),
    ]);
  }
  return json(data);
}

/* ────────────────────────────────────────────────────────────────────
   13) 🔍 매출–입금 대사 (통장 기준)   GET /api/admin/reports/reconcile

   [왜 만들었나] 2026-08 실제로 겪은 일 — 장부 매출이 통장 입금보다 8,100만 많았고
   (시연용 시드 결제가 섞여 있었다) 아무도 몰랐다. 「매출이 잡히는데 이상하다」는
   감을 숫자로 바로 확인할 수 있어야 재발을 막는다.

   [2026-08-18 기준 전환 — 사장님 지시] 예전엔 **장부(카페24·KCP 결제기록)** 가 기준이고
   통장이 «맞는지 보는 쪽» 이었다. 이제 **통장이 기준**이다.
     · 기준 = 신한 통장에 실제로 들어온 「케이씨피」 정산금 (deposit_pg)
     · 통장 기준 매출 = 그 입금 ÷ (1 − PG 수수료)  ← «통장이 말하는 매출»
     · 장부 매출·예상 입금은 그 옆에 놓고 비교하는 참고 수치가 된다
     · 판정(%)의 분모도 장부(예상 입금)가 아니라 **통장 입금**이다
   왜 바꿨나 — 장부는 동기화가 밀리거나 시드가 섞이면 틀리지만, 통장에 찍힌 돈은
   틀릴 수가 없다. 「무엇이 사실인가」를 통장 쪽에 두는 것이 대사의 원래 목적에 맞다.

   [대사 대상에서 빼는 것] «케이씨피 이외의 매출은 모두 제외» (같은 지시)
     · 통장 쪽: 「케이씨피」(기업은행 자동정산) 입금만 센다.
       「케이씨피M」(하나은행에서 사람이 보낸 운영자금)·B2B 직접입금·기타 입금은
       **대사에서 완전히 제외**하고 금액만 «참고» 로 밝힌다.
     · 장부 쪽: KCP 정산 대상 결제(카드·정기결제)만 센다 — kcpSettledSql().
       계좌이체·가상계좌처럼 KCP 를 안 거치는 결제는 통장의 「케이씨피」로 들어올 수가
       없으므로, 함께 세면 차이가 나는 게 당연해져 대사가 의미를 잃는다.

   [읽는 법]
     · 카드 결제는 PG(케이씨피)가 며칠 뒤 정산해 넣어 주므로 **월 단위로는 어긋나는
       것이 정상**이다. 그래서 «누적 합계» 줄을 함께 준다 — 시차는 누적에서 상쇄된다.
       판정도 누적을 기준으로 본다.
     · 누적은 **통장 자료가 있는 달만** 합산한다. 계좌 연동 이전 달의 장부 매출까지
       더하면 «입금이 통째로 비는» 달이 섞여 판정이 무조건 «매출 누락» 으로 기운다.
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

  /* 장부 매출(시드 제외) — KST 월로 묶는다.
     ⚠️ kcpSettledSql() 로 «KCP 정산 대상 결제» 만 센다(2026-08-18). 통장 기준이 된 이상
        KCP 를 안 거치는 결제(계좌이체 등)를 장부에 함께 세면 대사가 성립하지 않는다. */
  const revRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT substr(date(paid_at/1000,'unixepoch','+9 hours'),1,7) AS ym,
             COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS cnt
      FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()} AND ${kcpSettledSql()}
      GROUP BY ym
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<{ ym: string; revenue: number; cnt: number }>;
  }, []);
  /* 장부에는 있지만 KCP 정산 대상이 아니라 대사에서 뺀 매출 — «얼마를 왜 뺐는지» 밝힌다.
     숫자를 조용히 줄이면 다른 화면(월간 리포트)의 매출과 어긋나 보여 또 오해가 생긴다. */
  const nonKcpRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT substr(date(paid_at/1000,'unixepoch','+9 hours'),1,7) AS ym,
             COALESCE(SUM(amount_krw),0) AS revenue
      FROM student_payments
      WHERE status='paid' AND paid_at>=? AND paid_at<? AND ${notSeedSql()} AND NOT (${kcpSettledSql()})
      GROUP BY ym
    `).bind(startMs, endMs).all();
    return (r.results || []) as Array<{ ym: string; revenue: number }>;
  }, []);

  /* 🏦 통장 입금을 성격별로 나눈다 (2026-08-16 전면 수정).
     ⛔ 예전: `remark LIKE '%케이씨피%'` → 내부 이체(자사 계좌에서 사람이 보낸 돈)까지
        PG 정산으로 세어, 2026-03~07 누적 4,632만원이 «장부에 없는 매출» 로 오진됐다.
     ✅ 지금: classifyDeposit() 로 pg / b2b(수업료 직접입금) / transfer(확인 필요) / other.
        이 중 **대사에 쓰는 것은 pg(「케이씨피」) 하나뿐**이다.
     ⚠️ 2026-08-18 사장님 지시 — 성격이 «확인된» 자기 계좌 간 자금 이동은 어느 칸에도
        넣지 않는다(표·엑셀·참고문구 전부). 매출도 아니고 설명할 것도 없는 돈이다.
        transfer 칸에 남는 것은 아직 성격을 모르는 입금뿐이다. */
  const depRows = await safe(async () => {
    const r = await env.DB.prepare(`
      SELECT substr(trans_at,1,7) AS ym, COALESCE(remark,'') AS remark, amount
      FROM bankacct_transactions WHERE kind='in'
    `).all();
    const rows = (r.results || []) as Array<{ ym: string; remark: string; amount: number }>;
    const agg = new Map<string, { ym: string; pg: number; b2b: number; transfer: number; other: number }>();
    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      const kind = classifyDeposit(row.remark, amount);
      if (kind === 'transfer' && isKnownTransfer(row.remark)) continue;   // 확인된 내부 이체 → 통째로 제외
      const cur = agg.get(row.ym) || { ym: row.ym, pg: 0, b2b: 0, transfer: 0, other: 0 };
      cur[kind] += amount;
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
  const nonKcpMap = new Map(nonKcpRows.map(r => [r.ym, Number(r.revenue) || 0]));
  const depMap = new Map(depRows.map(r => [r.ym, r]));

  // 누적은 «통장 자료가 있는 달» 만 — 기준이 통장이므로 통장이 없는 달은 대사 자체가 안 된다
  let cumRev = 0, cumPg = 0, cumB2b = 0, cumTransfer = 0, cumNonKcp = 0, cumRevNoBank = 0;
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
    // 💡 기준이 통장 — 통장에 들어온 정산금을 매출로 되돌린 값(수수료 역산)
    const bankRevenue = Math.round(pg / (1 - PG_FEE_RATE));
    if (hasBank) {
      cumRev += revenue; cumPg += pg; cumB2b += b2b; cumTransfer += transfer;
      cumNonKcp += nonKcpMap.get(ym) || 0;
    } else {
      cumRevNoBank += revenue;
    }
    return {
      period: ym, revenue, pay_count: Number(rv?.cnt) || 0,
      expected, deposit_pg: pg, deposit_b2b: b2b, deposit_transfer: transfer, deposit_other: other,
      bank_revenue: hasBank ? bankRevenue : null,   // 통장 기준 매출(수수료 역산)
      diff: hasBank ? pg - expected : null,
      has_bank: hasBank,
    };
  });

  /* 판정은 «누적» 기준 — 월별 어긋남은 PG 정산 시차라 정상이다.
     ⚠️ 분모가 통장(cumPg)이다(2026-08-18 기준 전환). 통장에 들어온 돈을 100 으로 놓고
        장부(예상 입금)가 얼마나 벌어졌는지를 본다. */
  const cumExpected = Math.round(cumRev * (1 - PG_FEE_RATE));
  const cumBankRevenue = Math.round(cumPg / (1 - PG_FEE_RATE));
  const cumDiff = cumPg - cumExpected;
  const cumPct = cumPg > 0 ? (cumDiff / cumPg) * 100 : (cumExpected > 0 ? -100 : 0);
  const bankMonths = rows.filter(r => r.has_bank).length;

  /* ⏳ 정산 시차를 맞춘 비교 (2026-08-18) ────────────────────────────────
     위 누적은 «같은 달끼리» 라 창의 양 끝이 서로 다른 결제를 본다(PG_SETTLE_LAG_DAYS
     주석 참고). 여기서 양쪽을 시차만큼 잘라 같은 결제를 보는 구간끼리 비교한다.
       결제 구간 = [창시작, 마지막입금일 − 시차]
       입금 구간 = [창시작 + 시차, 마지막입금일]
     ⚠️ 기준·분모는 위와 똑같이 «통장» 이다(2026-08-18 기준 전환). 장부 쪽도 위와 같이
        KCP 정산 대상만 센다(kcpSettledSql) — 규칙이 갈라지면 두 숫자가 어긋난다. */
  const lagMatch = await safe(async () => {
    const lastBank = await env.DB.prepare(
      `SELECT MAX(substr(trans_at,1,10)) AS d FROM bankacct_transactions WHERE kind='in'`
    ).first<{ d: string }>();
    const lastBankDate = String(lastBank?.d || '').slice(0, 10);
    if (!lastBankDate) return null;

    const winStart = list[0] + '-01';
    const shift = (iso: string, days: number) => {
      const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + days);
      return t.toISOString().slice(0, 10);
    };
    const payEnd = shift(lastBankDate, -PG_SETTLE_LAG_DAYS);
    const depStart = shift(winStart, PG_SETTLE_LAG_DAYS);
    if (payEnd <= winStart) return null;            // 창이 시차보다 짧으면 맞출 수 없다

    const rv = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount_krw),0) AS revenue, COUNT(*) AS cnt
        FROM student_payments
       WHERE status='paid' AND ${notSeedSql()} AND ${kcpSettledSql()}
         AND date(paid_at/1000,'unixepoch','+9 hours') BETWEEN ? AND ?
    `).bind(winStart, payEnd).first<{ revenue: number; cnt: number }>();

    const dep = await env.DB.prepare(`
      SELECT COALESCE(remark,'') AS remark, amount
        FROM bankacct_transactions
       WHERE kind='in' AND substr(trans_at,1,10) BETWEEN ? AND ?
    `).bind(depStart, lastBankDate).all();
    let pg = 0;
    for (const r of (dep.results || []) as Array<{ remark: string; amount: number }>) {
      const amt = Number(r.amount) || 0;
      if (classifyDeposit(r.remark, amt) === 'pg') pg += amt;
    }

    const revenue = Number(rv?.revenue) || 0;
    const expected = Math.round(revenue * (1 - PG_FEE_RATE));
    const diff = pg - expected;
    return {
      lag_days: PG_SETTLE_LAG_DAYS,
      pay_from: winStart, pay_to: payEnd,
      deposit_from: depStart, deposit_to: lastBankDate,
      revenue, pay_count: Number(rv?.cnt) || 0,
      expected, deposit_pg: pg,
      bank_revenue: Math.round(pg / (1 - PG_FEE_RATE)),   // 통장이 말하는 매출
      diff,
      // 분모는 통장 — 위 누적 판정과 같은 규칙
      diff_pct: Number((pg > 0 ? (diff / pg) * 100 : (expected > 0 ? -100 : 0)).toFixed(1)),
    };
  }, null);

  /* 판정 기준 = 시차를 맞춘 값. 못 맞추면(자료 부족) 종전대로 누적을 쓴다. */
  const judgePct = lagMatch ? lagMatch.diff_pct : cumPct;
  let verdict: 'ok' | 'warn' | 'alert' | 'no_data';
  if (!bankFrom || bankMonths === 0) verdict = 'no_data';
  else if (Math.abs(judgePct) <= 10) verdict = 'ok';
  else if (Math.abs(judgePct) <= 25) verdict = 'warn';
  else verdict = 'alert';

  /* 차이의 «방향» 에 따라 원인이 정반대다. 한 문구로 뭉뚱그리면 오진한다(2026-08-16):
       · 입금 < 예상 → 장부에만 있는 매출(가짜·미수금) 의심
       · 입금 > 예상 → 통장에 들어왔는데 장부에 안 잡힌 매출(동기화 누락) 의심 */
  const short = (lagMatch ? lagMatch.diff : cumDiff) < 0;
  const MSG: Record<typeof verdict, string> = {
    ok: '통장에 들어온 「케이씨피」 정산금과 장부가 맞습니다(정산 시차를 맞춘 오차 10% 이내).',
    warn: short
      ? '통장에 들어온 「케이씨피」 정산금이 장부보다 10% 이상 적습니다. 정산 시차인지 미수금인지 KCP 정산내역을 확인하세요.'
      : '통장에 들어온 「케이씨피」 정산금이 장부보다 10% 이상 많습니다. 장부에 안 잡힌 매출이 있는지(결제 동기화 누락) 확인하세요.',
    alert: short
      ? '통장 입금이 장부보다 25% 이상 적습니다. 장부에만 있는 매출이거나 미수금일 수 있습니다 — 확인이 필요합니다.'
      : '통장 입금이 장부보다 25% 이상 많습니다. **매출이 장부에 덜 잡히고 있습니다**(결제 동기화 누락 의심) — 확인이 필요합니다.',
    no_data: '계좌 연동 이전 기간이라 입금 자료가 없습니다. 「신한 동기화」 후 다시 보세요.',
  };

  const data = {
    ok: true, type: 'reconcile', months, end: endMonth,
    label: `매출–입금 대사(통장 기준) — ${list[0]} ~ ${list[list.length - 1]}`,
    basis: 'bank' as const,          // 🔑 기준 데이터 = 통장 「케이씨피」 입금
    basis_label: '통장 「케이씨피」 입금',
    pg_fee_rate: PG_FEE_RATE, bank_data_from: bankFrom || null,
    reconciled_months: bankMonths,
    rows,
    totals: {
      revenue: cumRev, expected: cumExpected, deposit_pg: cumPg,
      bank_revenue: cumBankRevenue,
      deposit_b2b: cumB2b, deposit_transfer: cumTransfer,
      diff: cumDiff, diff_pct: Number(cumPct.toFixed(1)),
    },
    settle_lag_days: PG_SETTLE_LAG_DAYS,
    lag_matched: lagMatch,
    verdict, message: MSG[verdict],
    /* 🔎 대사에서 «뺀» 것들 — 숨기지 않고 얼마인지 밝혀 사람이 확인하게 한다.
       단, 성격이 «확인된» 내부 자금이체는 애초에 위 집계에 들어오지 않아 여기서도 안 센다.
       남는 것은 «사람이 판단해야 하는 돈» 뿐이다(2026-08-18 사장님 지시). */
    /* ⛔ 타계좌 입금(성격 미확인 포함)은 대사 화면에 한 줄도 쓰지 않는다(2026-08-18 지시).
       집계에서 빼는 계산은 그대로다 — 금액을 적어 주지 않을 뿐이다. */
    transfer_note: '',
    b2b_note: cumB2b > 0
      ? `통장으로 직접 들어온 수업료 ₩${cumB2b.toLocaleString('ko-KR')} 도 「케이씨피」 정산금이 아니라 대사에서 제외했습니다(월간 리포트에서는 매출로 반영합니다).`
      : '',
    non_kcp_note: cumNonKcp > 0
      ? `장부 결제 중 KCP 정산 대상이 아닌 매출 ₩${cumNonKcp.toLocaleString('ko-KR')} 는 대사에서 제외했습니다(계좌이체 등 — 통장의 「케이씨피」로 들어오지 않습니다).`
      : '',
    no_bank_note: cumRevNoBank > 0
      ? `통장 자료가 없는 달의 장부 매출 ₩${cumRevNoBank.toLocaleString('ko-KR')} 는 누적 합계에서 뺐습니다(대사할 상대가 없는 달입니다).`
      : '',
  };

  if (fmt === 'csv' || fmt === 'xlsx') {
    return out(fmt, `reconcile-${endMonth}.csv`, [
      ['망고아이 매출–입금 대사(통장 기준)', data.label],
      [`기준 = 통장에 들어온 「케이씨피」 정산금 · PG 수수료 가정 ${(PG_FEE_RATE * 100).toFixed(2)}%`],
      ['※ 「케이씨피」(기업은행 자동정산)만 대사 대상입니다. B2B 직접입금·기타 입금·자기 계좌 간 자금 이동은 제외했습니다.'],
      ['※ 장부 매출도 KCP 정산 대상 결제(카드·정기결제)만 셉니다.'],
      [],
      ['월', '실제 PG 입금(기준)', '통장 기준 매출(수수료 역산)', '장부 매출', '결제건수', '예상 입금(수수료 차감)', '차이', '통장 직접입금(B2B·참고)', '성격 미확인 입금(참고)', '기타 입금(참고)'],
      ...rows.map(r => [r.period, r.has_bank ? r.deposit_pg : '(자료없음)', r.bank_revenue == null ? '-' : r.bank_revenue,
        r.revenue, r.pay_count, r.expected, r.diff == null ? '-' : r.diff,
        r.deposit_b2b, r.deposit_transfer, r.deposit_other]),
      ['누적 합계(통장 자료 있는 달만)', cumPg, cumBankRevenue, cumRev, '', cumExpected, cumDiff, cumB2b, cumTransfer, ''],
      [],
      /* ⏳ 월별·누적은 «구간이 어긋난» 비교다. 판정의 근거는 아래 시차 맞춘 줄이다. */
      ...(lagMatch ? [
        [`정산 시차 ${lagMatch.lag_days}일을 맞춘 비교 — 같은 결제를 보는 구간끼리 (판정 근거)`],
        [`결제 ${lagMatch.pay_from} ~ ${lagMatch.pay_to}`, lagMatch.deposit_pg, lagMatch.bank_revenue,
         lagMatch.revenue, lagMatch.pay_count, lagMatch.expected, lagMatch.diff, '', '', ''],
        [`입금 ${lagMatch.deposit_from} ~ ${lagMatch.deposit_to} 기준 · 차이 ${lagMatch.diff_pct}% (통장 기준)`],
      ] as (string | number)[][] : []),
      [],
      ['판정', data.message],
      ...(data.transfer_note ? [['참고', data.transfer_note]] : []),
      ...(data.b2b_note ? [['참고', data.b2b_note]] : []),
      ...(data.non_kcp_note ? [['참고', data.non_kcp_note]] : []),
      ...(data.no_bank_note ? [['참고', data.no_bank_note]] : []),
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


// ────────────────────────────────────────────────────────────────────
// 👤 역할별 «실제» 직원 명부 (2026-08-30, v4 제안서 12)
// ────────────────────────────────────────────────────────────────────
/* [왜] 관리자 › 권한 설정 › 「역할별 사용자 관리」가 **화면에 박아 둔 예시 18명**을
     보여 주고 있었다(홍길동·김민수 …). 실제 조직과 아무 관계가 없어서, 그 표를 근거로
     「누가 무엇을 볼 수 있나」를 판단하면 그대로 오판이 된다.
     (CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」의 같은 뿌리 —
      여기서는 «측정할 수 있는데» 예시를 그리고 있었다.)

   [무엇] admin_account(로그인 계정)를 읽어 **실무 6대 역할** 로 갈라 준다:
     경영진 · 한국 관리자 · 필리핀 관리자 · 대표지사 · 지사 · 대리점.
   ⛔ 학부모·학생은 넣지 않는다 — 관리자 포털에 로그인하지 않는 사람들이고,
      그 둘을 이 표에 섞어 두면 «권한이 있는 것처럼» 읽힌다(사장님 지시 2026-08-30).
   ⛔ 강사(hq_t_* · mangoi_*)도 이 표에서 뺀다 — 강사 관리 카드가 정본이고,
      여기 섞으면 20명이 넘어 실무 역할이 묻힌다. 대신 몇 명인지 숫자만 함께 알려 준다.

   ⚠️ 한국/필리핀 구분은 **추측하지 않는다** — admin_account.nationality 칸을 그대로 쓴다
      (2026-08-30 실측: KR 4명 · PH 다수로 실제 채워져 있다). 값이 비면 «미지정» 으로 두고
      한쪽으로 몰지 않는다. 이름·아이디로 국적을 추측하면 조용히 틀린다.
   ⚠️ 접두사 규칙 자체의 정본은 auth-admin.ts 의 resolveUiIdentity() 다. 여기서는 «표시용»
      으로만 한 겹 더 묶는다 — 권한 판정에 이 함수를 쓰지 말 것.
   ⛔ SELECT 만 한다. 비밀번호 해시는 한 글자도 내보내지 않는다. */
export function classifyStaffRole(username: string, nationality: string): string {
  const u = String(username || '').toLowerCase();
  const nat = String(nationality || '').toUpperCase();
  if (u === 'admin' || u === 'hq_exec' || u === 'exec' || u === 'cfo' || u.indexOf('cfo') === 0) return 'exec';
  if (u === 'capitown') return 'franchise';                       // 대표지사(캐피타운 본사)
  if (u.indexOf('capi') === 0 || u.indexOf('branch_') === 0) return 'branch';
  if (u.indexOf('agency_') === 0) return 'agency';
  if (u.indexOf('hq_t') === 0 || /^mangoi[_-]?\d+$/i.test(u)) return 'teacher';   // 이 표에서는 제외 대상
  if (u.indexOf('mgr_') === 0 || u.indexOf('hq_') === 0 || u === 'ops_lead') {
    if (nat === 'PH') return 'mgr_ph';
    if (nat === 'KR') return 'mgr_kr';
    return 'mgr_unknown';                                          // ⛔ 한쪽으로 몰지 않는다
  }
  return 'other';
}

const STAFF_ROLE_LABELS: Record<string, { ko: string; en: string; icon: string }> = {
  exec:        { ko: '경영진',        en: 'Executive',      icon: '👑' },
  mgr_kr:      { ko: '한국 관리자',   en: 'Manager (KR)',   icon: '🇰🇷' },
  mgr_ph:      { ko: '필리핀 관리자', en: 'Manager (PH)',   icon: '🇵🇭' },
  franchise:   { ko: '대표지사',      en: 'Master Branch',  icon: '🏢' },
  branch:      { ko: '지사',          en: 'Branch',         icon: '🏬' },
  agency:      { ko: '대리점',        en: 'Agency',         icon: '🤝' },
  mgr_unknown: { ko: '관리자(국적 미지정)', en: 'Manager (region unset)', icon: '❓' },
  other:       { ko: '기타',          en: 'Other',          icon: '·' },
};
/** 화면이 카드로 그릴 «6대 실무 역할» 순서. 이 순서 그대로 그린다. */
const STAFF_ROLE_ORDER = ['exec', 'mgr_kr', 'mgr_ph', 'franchise', 'branch', 'agency'];

async function staffRolesReport(env: Env, url: URL): Promise<Response> {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT username, name, email, phone, COALESCE(nationality,'') AS nationality, created_at
         FROM admin_account ORDER BY username ASC`
    ).all<any>();
    rows = rs.results || [];
  } catch (e: any) {
    return err('staff_list_failed: ' + String(e?.message || e), 500);
  }

  let teacherCount = 0;
  let otherCount = 0;
  const users: any[] = [];
  const counts: Record<string, number> = {};
  for (const k of STAFF_ROLE_ORDER) counts[k] = 0;
  counts.mgr_unknown = 0;

  for (const r of rows) {
    const role = classifyStaffRole(r.username, r.nationality);
    if (role === 'teacher') { teacherCount++; continue; }   // ⛔ 강사는 이 표에 넣지 않는다
    if (role === 'other') { otherCount++; continue; }
    counts[role] = (counts[role] || 0) + 1;
    if (q && String(r.username + ' ' + (r.name || '')).toLowerCase().indexOf(q) < 0) continue;
    users.push({
      username: r.username,
      name: r.name || r.username,
      role,
      role_ko: STAFF_ROLE_LABELS[role].ko,
      role_en: STAFF_ROLE_LABELS[role].en,
      role_icon: STAFF_ROLE_LABELS[role].icon,
      nationality: r.nationality || null,
      email: r.email || null,
      created_at: r.created_at || null,
    });
  }

  return json({
    ok: true,
    roles: STAFF_ROLE_ORDER.map(k => ({ key: k, ...STAFF_ROLE_LABELS[k], count: counts[k] || 0 })),
    /* 국적이 비어 관리자 국가를 못 가른 계정 — 숫자로 «모른다» 를 드러낸다. 0 이면 화면이 안 그린다. */
    unassigned_region: counts.mgr_unknown || 0,
    users,
    /* 이 표에서 뺀 사람들 — 왜 합계가 계정 수와 다른지 화면이 설명할 수 있게 함께 준다 */
    excluded: { teachers: teacherCount, other: otherCount },
    total_accounts: rows.length,
    note_ko: '학부모·학생은 관리자 포털에 로그인하지 않으므로 이 표에 넣지 않습니다. 강사는 「강사 관리」가 정본입니다.',
    note_en: 'Parents and students never sign in to the admin portal, so they are not listed here. Teachers are managed in Teacher Management.',
  });
}


// ────────────────────────────────────────────────────────────────────
// 🧑‍🏫 강사 한 명의 «실제» 수업 기록 (2026-08-30, v4 제안서 15)
// ────────────────────────────────────────────────────────────────────
/* [무엇이 문제였나] 「Teacher Janice 수업 데이터가 없다」는 제보. 2026-08-30 운영 D1 실측:
     · teachers.id            = 28  (name 'JANICE')
     · 카페24 강사번호         = 37  (teacher_payroll_auto.teacher_name 'Teacher Janice')
     · teacher_profiles.id    = 26
     즉 **한 사람에게 번호가 셋**이다(CLAUDE.md 2장 「강사 번호가 «세 벌» 입니다」).
     실제 수업은 `attendance.teacher_uid = 37` 에 **64건** 살아 있다(최근 2026-08-27).
     그런데 강사 화면들은 `class_schedules.teacher_id`(= teachers.id = 28)로 조인하는데,
     28 번으로 잡힌 33행은 **전부 status='cancelled' 인 LMS 자리표시**(source='lms_import_w26')다.
     ⟹ 데이터가 «사라진» 것이 아니라 **두 번호가 이어지지 않아 화면이 못 찾는** 것이다.

   [무엇을 하나] 원부 강사(teachers.id)를 받아 ① 망고아이 예약(class_schedules)과
     ② 카페24 실제 수업(attendance.teacher_uid)을 **둘 다** 세어 돌려준다.
     번호를 잇는 근거(how)를 함께 실어, 화면이 «추측인지 확정인지» 를 말할 수 있게 한다.

   ⛔ 아무것도 고치지 않는다(SELECT 전용). 번호를 D1 에 «맞춰 넣는» 것은 사람이 결정할 일이다 —
      개발·운영이 같은 DB라 UPDATE 는 되돌릴 수 없다(CLAUDE.md 1-1).
   ⛔ 이름 부분일치 금지. 정규화(소문자 + 'teacher ' 접두 제거) 완전일치이고, 후보가 둘 이상이면
      **잇지 않는다** — 모르는 것보다 틀린 게 나쁘다(CLAUDE.md 2장).
   ⛔ LMS·시드 자리표시는 «수업» 으로 세지 않는다(다섯 곳과 같은 제외식). */
function normTeacherNameLocal(v: any): string {
  return String(v ?? '').trim().toLowerCase().replace(/^teacher\s*[-·]?\s*/, '').replace(/\s+/g, ' ');
}

async function teacherClassesReport(env: Env, url: URL): Promise<Response> {
  const tid = String(url.searchParams.get('teacher_id') || '').trim();
  if (!tid) return err('teacher_id required', 400);
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '90', 10)));
  const sinceMs = Date.now() - days * 86400000;

  const t: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE CAST(id AS TEXT) = ?`).bind(tid).first();
  if (!t) return err('teacher_not_found', 404);

  // ① 망고아이 예약 — 자리표시(LMS·시드)와 취소분은 빼고 «진짜 수업» 만
  const sched: any = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM class_schedules
      WHERE teacher_id = ? AND status = 'active'
        AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`
  ).bind(tid).first();
  const placeholders: any = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM class_schedules
      WHERE teacher_id = ? AND (status <> 'active' OR LOWER(COALESCE(user_id,'')) IN ('lms','type_seed'))`
  ).bind(tid).first();

  // ② 원부 번호 → 카페24 강사번호 (이름 완전일치, 유일할 때만)
  const key = normTeacherNameLocal(t.name);
  let cafe24Id: string | null = null;
  let how: 'name_unique' | 'ambiguous' | 'not_found' = 'not_found';
  if (key) {
    try {
      const rs = await env.DB.prepare(
        `SELECT DISTINCT CAST(teacher_id AS TEXT) AS c24, teacher_name
           FROM teacher_payroll_auto WHERE teacher_name IS NOT NULL AND teacher_name <> ''`
      ).all<any>();
      const hits: string[] = [];
      for (const r of (rs.results || [])) {
        if (normTeacherNameLocal(r.teacher_name) === key && hits.indexOf(r.c24) < 0) hits.push(r.c24);
      }
      if (hits.length === 1) { cafe24Id = hits[0]; how = 'name_unique'; }
      else if (hits.length > 1) how = 'ambiguous';       // ⛔ 둘 이상이면 잇지 않는다
    } catch { /* 급여 인제스트 표가 없는 옛 DB */ }
  }

  let c24Count = 0, c24Last: string | null = null, c24Students = 0;
  if (cafe24Id) {
    const r: any = await env.DB.prepare(
      `SELECT COUNT(*) AS n, MAX(date) AS last_date, COUNT(DISTINCT user_id) AS students
         FROM attendance WHERE teacher_uid = ? AND joined_at >= ? AND COALESCE(status,'') <> 'scheduled'`
    ).bind(Number(cafe24Id), sinceMs).first();
    c24Count = Number(r?.n) || 0;
    c24Last = r?.last_date || null;
    c24Students = Number(r?.students) || 0;
  }

  return json({
    ok: true,
    teacher: { id: String(t.id), name: t.name },
    window_days: days,
    mangoi_schedules: Number(sched?.n) || 0,
    placeholder_or_cancelled: Number(placeholders?.n) || 0,
    cafe24: {
      teacher_id: cafe24Id,
      resolved_by: how,          // name_unique | ambiguous | not_found — «추측» 을 감추지 않는다
      class_count: c24Count,
      last_date: c24Last,
      student_count: c24Students,
    },
    note_ko: cafe24Id
      ? '카페24 수업은 강사번호가 달라 원부(teachers) 조인만으로는 보이지 않습니다. 이름이 유일하게 맞아 이어 붙였습니다.'
      : (how === 'ambiguous'
          ? '이름이 같은 카페24 강사가 둘 이상이라 잇지 않았습니다. 사람이 확인해야 합니다.'
          : '카페24 급여 표에서 이 이름을 찾지 못했습니다. 카페24 쪽 표기를 확인해 주세요.'),
  });
}
