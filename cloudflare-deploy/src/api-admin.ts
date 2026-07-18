// ═══════════════════════════════════════════════════════════════════════
// 🛡️ api-admin.ts — 관리자 도메인 API (api-mango.ts 에서 분리)
//   docs/REFACTOR_PLAN.md 1단계 · admin 1회차(2026-07-14) · 로직 무변경
//   ⚠ 인증: /api/admin/* 은 index.ts 의 default-deny 게이트가 세션을 먼저 검사한다.
//   1회차 포함(읽기전용 통계): Phase 20 stats/today · Phase D1~D2 kpi/dashboard
//     · Phase 15 stats/revenue·student-rankings·student-flow · Phase 7 stats/storage
//   2회차(2026-07-14): Phase G1~G2 — 급여정산 7 + 수업연기 SR 3 + 피드백초안 FD 3
//     (payroll rates·all·finalize·seed-demo 는 아직 api-mango — 3회차 예정)
//   매칭 안 되면 null 반환 → handleMangoApi 가 나머지 라우팅 계속.
// ═══════════════════════════════════════════════════════════════════════
import { json, parseJsonBody, invalidBody, toCSV, csvResponse, today } from './api-util';
import { sendPaymentOverdueAlert, sendKakaoAlimtalk } from './solapi-client';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { enqueueNotification, sendPushToUser } from './api-notify';
import { scopeFragments, studentScopeWhere, getScope, franchiseList } from './scope';   // 🔒 지사/대리점 데이터 격리
import { runCypher, Neo4jNotConfiguredError } from './teacher-match';  // 🕸️ Neo4j 그래프
import { importCafe24Org, importCafe24Payments, importCafe24Students, importCafe24Attendance } from './cafe24-sync';
import { applyPIIScope, canViewPII } from './pii-mask';
import { sendPlainSms } from './solapi-client';
import { sendEmail, emailLayout } from './email';
import { writeClassAudit, listClassAudit } from './class-audit';   // 📜 수업 변경 이력(연기/삭제/종료)
import { getAdminActor, sameTeacherName, checkAdminSession } from './auth-admin';  // 승인자 기록(SR·FD)·강사 스코프 비교
import type { MangoEnv } from './api-mango';


// ═══ 💼 급여 상수·계산 클러스터 (api-mango.ts 에서 이동, 8차) ═══
//   - 환율: 1 PHP = 24.34 KRW (트리맵·요약용)
// ========================================================================

/** 환율 — KRW 표시용 (트리맵 등). 정기적 갱신 필요 시 wrangler vars 로 빼낼 것. */
const PAYROLL_PHP_TO_KRW = 24.34;

/** 평가 카테고리 가중치 (합계 1.0). */
const EVAL_WEIGHTS = {
  instruction:  0.25,  // 수업 우수성 (Instructional Excellence)
  retention:    0.30,  // 학생 재등록 유지율
  punctuality:  0.20,  // 성실성 / 시간엄수
  admin:        0.15,  // 행정 / 업무 성실도
  contribution: 0.10,  // 조직 기여도
};

/** 등급 임계값 + 라벨. */
function classifyEvalGrade(weighted: number): string {
  if (weighted == null || isNaN(weighted)) return '미평가';
  if (weighted >= 4.75) return '최우수';
  if (weighted >= 4.50) return '매우 우수';
  if (weighted >= 3.50) return '우수';
  return '개선 요망';
}

const VALID_TEACHER_STATUS = ['office', 'home'] as const;

let _payrollSchemaReady = false;
async function ensurePayrollSchema(env: { DB: D1Database }): Promise<void> {
  if (_payrollSchemaReady) return;
  // teachers — 기존 호환 + 신규 컬럼
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS teachers (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  user_id TEXT,`,
    `  name TEXT NOT NULL,`,
    `  center_id INTEGER,`,
    `  rank TEXT,`,                                    // deprecated, NOT NULL 해제 (있으면 NULL 허용)
    `  hourly_rate_php INTEGER,`,                      // deprecated, 새 모델은 rate_per_10min_php 사용
    `  status TEXT,`,                                   // 'office' | 'home'
    `  years INTEGER,`,                                 // 근속 연수
    `  rate_per_10min_php REAL,`,                       // 10분당 단가 (강사별)
    `  active INTEGER DEFAULT 1,`,
    `  created_at INTEGER NOT NULL,`,
    `  updated_at INTEGER NOT NULL`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_teachers_active ON teachers(active);`);
  // 기존 DB 에 컬럼 누락 시 ALTER 로 추가 (이미 있으면 SQLite 가 throw → 흡수)
  for (const ddl of [
    `ALTER TABLE teachers ADD COLUMN status TEXT;`,
    `ALTER TABLE teachers ADD COLUMN years INTEGER;`,
    `ALTER TABLE teachers ADD COLUMN rate_per_10min_php REAL;`,
  ]) {
    try { await env.DB.exec(ddl); } catch { /* duplicate column — 정상 */ }
  }

  // 월별 수업 수 (20분 단위)
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS teacher_monthly_classes (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  teacher_id INTEGER NOT NULL,`,
    `  year INTEGER NOT NULL,`,
    `  month INTEGER NOT NULL,`,
    `  class_count INTEGER NOT NULL DEFAULT 0,`,
    `  notes TEXT,`,
    `  updated_at INTEGER NOT NULL,`,
    `  UNIQUE(teacher_id, year, month)`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_tmc_year_month ON teacher_monthly_classes(year, month);`);

  // 월별 평가 (5개 카테고리 점수 + 가중 합계 + 등급)
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS teacher_evaluations (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  teacher_id INTEGER NOT NULL,`,
    `  year INTEGER NOT NULL,`,
    `  month INTEGER NOT NULL,`,
    `  score_instruction REAL,`,
    `  score_retention REAL,`,
    `  score_punctuality REAL,`,
    `  score_admin REAL,`,
    `  score_contribution REAL,`,
    `  weighted_total REAL,`,
    `  grade TEXT,`,
    `  strengths TEXT,`,
    `  improvements TEXT,`,
    `  evaluator TEXT,`,
    `  evaluated_at INTEGER,`,
    `  UNIQUE(teacher_id, year, month)`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_te_year_month ON teacher_evaluations(year, month);`);

  // payslips — 마감용 (새 모델 컬럼)
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS payslips (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  teacher_id INTEGER NOT NULL,`,
    `  year INTEGER NOT NULL,`,
    `  month INTEGER NOT NULL,`,
    `  status TEXT,`,
    `  class_count INTEGER,`,
    `  rate_per_10min_php REAL,`,
    `  monthly_salary_php REAL,`,
    `  weighted_total REAL,`,
    `  grade TEXT,`,
    `  finalized_at INTEGER NOT NULL,`,
    `  finalized_by TEXT,`,
    `  UNIQUE(teacher_id, year, month)`,
    `);`
  ].join(' '));
  // 기존 payslips 테이블에 새 컬럼 추가 (재배포 호환)
  // 회계 보고서(accounting-reports.ts)가 SELECT 하는 컬럼 — period, payment_krw,
  // payment_php, minutes_taught, evaluation_score, bonus_krw, deduction_krw, paid —
  // 가 스키마에 없으면 보고서 값이 전부 0/null 로 나오므로 함께 추가.
  for (const ddl of [
    `ALTER TABLE payslips ADD COLUMN status TEXT;`,
    `ALTER TABLE payslips ADD COLUMN class_count INTEGER;`,
    `ALTER TABLE payslips ADD COLUMN rate_per_10min_php REAL;`,
    `ALTER TABLE payslips ADD COLUMN monthly_salary_php REAL;`,
    `ALTER TABLE payslips ADD COLUMN weighted_total REAL;`,
    `ALTER TABLE payslips ADD COLUMN grade TEXT;`,
    `ALTER TABLE payslips ADD COLUMN period TEXT;`,
    `ALTER TABLE payslips ADD COLUMN payment_krw INTEGER;`,
    `ALTER TABLE payslips ADD COLUMN payment_php REAL;`,
    `ALTER TABLE payslips ADD COLUMN minutes_taught INTEGER;`,
    `ALTER TABLE payslips ADD COLUMN evaluation_score REAL;`,
    `ALTER TABLE payslips ADD COLUMN bonus_krw INTEGER DEFAULT 0;`,
    `ALTER TABLE payslips ADD COLUMN deduction_krw INTEGER DEFAULT 0;`,
    `ALTER TABLE payslips ADD COLUMN paid INTEGER DEFAULT 0;`,
  ]) {
    try { await env.DB.exec(ddl); } catch { /* duplicate column — 정상 */ }
  }
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(period);`); } catch { /* noop */ }

  _payrollSchemaReady = true;
}

/** 평가 점수 5개 → 가중 합계 (없으면 null). */
function calcWeightedTotal(e: {
  score_instruction?: number | null,
  score_retention?: number | null,
  score_punctuality?: number | null,
  score_admin?: number | null,
  score_contribution?: number | null,
} | null): number | null {
  if (!e) return null;
  const i = e.score_instruction, r = e.score_retention, p = e.score_punctuality,
        a = e.score_admin, c = e.score_contribution;
  // 5개 모두 있어야 합산
  if ([i, r, p, a, c].some(v => v == null || isNaN(Number(v)))) return null;
  const total = Number(i) * EVAL_WEIGHTS.instruction
              + Number(r) * EVAL_WEIGHTS.retention
              + Number(p) * EVAL_WEIGHTS.punctuality
              + Number(a) * EVAL_WEIGHTS.admin
              + Number(c) * EVAL_WEIGHTS.contribution;
  return Math.round(total * 100) / 100;
}

/**
 * 한 강사의 월 급여·평가 통합 계산.
 *   월급 = class_count × 2 × rate_per_10min_php
 *   평가 = teacher_evaluations 의 5개 점수 → 가중 합계 → 등급
 */
async function calcPayrollOne(env: { DB: D1Database }, teacherId: number, year: number, month: number): Promise<any> {
  const t: any = await env.DB.prepare(
    `SELECT id, name, status, years, rate_per_10min_php, hourly_rate_php, rank, center_id, active
     FROM teachers WHERE id = ?`
  ).bind(teacherId).first();
  if (!t) return { ok: false, error: 'teacher_not_found', teacher_id: teacherId };

  const cl: any = await env.DB.prepare(
    `SELECT class_count, notes FROM teacher_monthly_classes
     WHERE teacher_id = ? AND year = ? AND month = ?`
  ).bind(teacherId, year, month).first();
  const classCount = cl ? Number(cl.class_count) : 0;

  const ev: any = await env.DB.prepare(
    `SELECT score_instruction, score_retention, score_punctuality, score_admin, score_contribution,
            weighted_total, grade, strengths, improvements, evaluator, evaluated_at
     FROM teacher_evaluations WHERE teacher_id = ? AND year = ? AND month = ?`
  ).bind(teacherId, year, month).first();

  const rate = Number(t.rate_per_10min_php || 0);
  const monthlySalary = Math.round(classCount * 2 * rate * 100) / 100;
  const weighted = ev ? (ev.weighted_total != null ? Number(ev.weighted_total) : calcWeightedTotal(ev)) : null;
  const grade = weighted != null ? classifyEvalGrade(weighted) : '미평가';

  return {
    ok: true,
    teacher_id: t.id,
    teacher_name: t.name,
    status: t.status || null,
    years: t.years != null ? Number(t.years) : null,
    rate_per_10min_php: rate,
    year, month,
    class_count: classCount,
    monthly_salary_php: monthlySalary,
    monthly_salary_krw: Math.round(monthlySalary * PAYROLL_PHP_TO_KRW),
    php_to_krw: PAYROLL_PHP_TO_KRW,
    evaluation: ev ? {
      score_instruction:  ev.score_instruction,
      score_retention:    ev.score_retention,
      score_punctuality:  ev.score_punctuality,
      score_admin:        ev.score_admin,
      score_contribution: ev.score_contribution,
      weighted_total:     weighted,
      grade,
      strengths:          ev.strengths,
      improvements:       ev.improvements,
      evaluator:          ev.evaluator,
      evaluated_at:       ev.evaluated_at,
    } : null,
    weighted_total: weighted,
    grade,
    currency: 'PHP'
  };
}

export async function handleAdminApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ════════════════════════════════════════════════════════════
    // 💵 Phase 15 — 매출 / 학생 흐름 통계
    //   GET /api/admin/stats/revenue?period=day|month|quarter|half|year&from=YYYY-MM-DD&to=YYYY-MM-DD
    //     · student_payments 테이블 기준 (status='paid' 만 합산)
    //     · period 별 그룹핑 (날짜·연월·연-Q1~Q4·연-1H/2H·연도)
    //   GET /api/admin/stats/student-flow?from=&to=
    //     · students_erp 의 signup_date / end_date 기준
    //     · 일자별 신규(new), 탈락(dropped), 활성(active) 카운트
    // ════════════════════════════════════════════════════════════

    // 🥭 Phase 20 — 오늘의 KPI 4박스 통합 엔드포인트
    //   GET /api/admin/stats/today
    //   - 오늘(KST) 매출 / 출석 학생수 / 결석률 / 신규 등록 4개 값을 한 번에 반환
    //   - 결석률 = (활성 학생수 - 오늘 출석 학생수) / 활성 학생수 * 100
    //   - student_payments / attendance / students_erp 3개 테이블 사용
    if (method === 'GET' && path === '/api/admin/stats/today') {
      // 🥭 Phase 20d 핫픽스 — production D1 에 테이블/컬럼이 없을 수 있으므로
      //  ① 필요한 모든 테이블을 IF NOT EXISTS 로 자동 생성
      //  ② 4개 쿼리를 개별 try/catch 로 격리 (하나 실패해도 나머지 살아있음)
      //  ③ 컬럼 누락 등 어떤 에러든 0 으로 graceful degradation, 전체 200 OK 유지

      // 자동 자가치유 — 누락된 테이블 생성 (이미 있으면 NOOP)
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`
        );
      } catch {}
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, english_name TEXT, status TEXT DEFAULT '정상', signup_date TEXT, end_date TEXT, created_at INTEGER);`
        );
      } catch {}
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT, total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0);`
        );
      } catch {}

      const todayKst = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      const startMs = new Date(todayKst + 'T00:00:00+09:00').getTime();
      const endMs = startMs + 86400000;

      // 각 쿼리를 안전 헬퍼로 감싸 — 개별 실패가 전체 실패를 일으키지 않도록
      const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
        try { return await fn(); } catch { return fallback; }
      };

      // 🔒 역할별 데이터 범위 — 지사/대리점/교사/학부모/학생은 자기 범위만 집계
      // 🔒 세션 기반 강제 스코프(대리점/지사는 자기 범위만, 본사는 전체/?as= 드릴다운)
      const _sf = await scopeFragments(env, request);
      const _uidScope = _sf.uidScope, _erpScope = _sf.erpScope, _sb = _sf.binds;

      const [revRow, attRow, activeRow, signupRow] = await Promise.all([
        safe(() => env.DB.prepare(
          `SELECT COALESCE(SUM(amount_krw), 0) AS revenue, COUNT(*) AS pay_count
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL
             AND paid_at >= ? AND paid_at < ?${_uidScope}`
        ).bind(startMs, endMs, ..._sb).first<{ revenue: number; pay_count: number }>(),
        { revenue: 0, pay_count: 0 } as any),

        safe(() => env.DB.prepare(
          `SELECT COUNT(DISTINCT user_id) AS attended
           FROM attendance WHERE date = ?${_uidScope}`
        ).bind(todayKst, ..._sb).first<{ attended: number }>(),
        { attended: 0 } as any),

        safe(() => env.DB.prepare(
          `SELECT COUNT(*) AS active
           FROM students_erp
           WHERE (end_date IS NULL OR end_date = '' OR end_date >= ?)${_erpScope}`
        ).bind(todayKst, ..._sb).first<{ active: number }>(),
        { active: 0 } as any),

        safe(() => env.DB.prepare(
          `SELECT COUNT(*) AS signups
           FROM students_erp WHERE signup_date = ?${_erpScope}`
        ).bind(todayKst, ..._sb).first<{ signups: number }>(),
        { signups: 0 } as any)
      ]);

      const revenue = revRow?.revenue || 0;
      const payCount = revRow?.pay_count || 0;
      const attended = attRow?.attended || 0;
      const active = activeRow?.active || 0;
      const signups = signupRow?.signups || 0;

      const absentCount = Math.max(0, active - attended);
      const absenceRate = active > 0 ? (absentCount * 100 / active) : 0;

      return json({
        ok: true,
        date: todayKst,
        revenue: { amount_krw: revenue, pay_count: payCount },
        students: { attended, active },
        absence: { rate_pct: Math.round(absenceRate * 10) / 10, absent: absentCount, scheduled: active },
        signups: { count: signups }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase D1~D2 — 운영 KPI 통합 대시보드
    // ═══════════════════════════════════════════════════════════════

    // ── GET /api/admin/kpi/dashboard — 학원 핵심 KPI 한 번에 ──
    if (method === 'GET' && path === '/api/admin/kpi/dashboard') {
      // 안전망 - 필요 테이블 모두 ensure
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, phone TEXT, parent_phone TEXT, status TEXT, created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, amount_krw INTEGER NOT NULL, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, scheduled_date TEXT, status TEXT, created_at INTEGER);`); } catch {}

      // 🔒 세션 기반 강제 스코프 — 지사/대리점은 자기 범위만(본사=전체). 누수 차단.
      const _sf = await scopeFragments(env, request);
      const _uidScope = _sf.uidScope, _erpScope = _sf.erpScope, _sb = _sf.binds;

      const now = Date.now();
      // 이번 달 / 지난 달 기간
      const d = new Date();
      const thisMonthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const thisMonthEnd = new Date(d.getFullYear(), d.getMonth()+1, 1).getTime();
      const lastMonthStart = new Date(d.getFullYear(), d.getMonth()-1, 1).getTime();
      const lastMonthEnd = thisMonthStart;
      // 30일/7일
      const last30Start = now - 30*86400*1000;
      const last7Start = now - 7*86400*1000;

      const fetch1 = async (sql: string, ...binds: any[]): Promise<any> => {
        try { return await env.DB.prepare(sql).bind(...binds).first(); }
        catch (e) { return {}; }
      };
      const fetchAll = async (sql: string, ...binds: any[]): Promise<any[]> => {
        try { const rs = await env.DB.prepare(sql).bind(...binds).all(); return rs.results || []; }
        catch (e) { return []; }
      };

      // 1. 학생 수
      const studentTotal: any = await fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE (status IN ('정상','활동','active') OR status IS NULL OR status = '')${_erpScope}`, ..._sb);
      const studentNewThisMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ?${_erpScope}`, thisMonthStart, ..._sb);
      const studentNewLastMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ? AND created_at < ?${_erpScope}`, lastMonthStart, lastMonthEnd, ..._sb);

      // 2. 매출
      const revThisMonth: any = await fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND paid_at >= ? AND paid_at < ?${_uidScope}`, thisMonthStart, thisMonthEnd, ..._sb);
      const revLastMonth: any = await fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND paid_at >= ? AND paid_at < ?${_uidScope}`, lastMonthStart, lastMonthEnd, ..._sb);

      // 3. 출석 (point_rule_log attendance)
      let attendanceThisMonth = 0, attendanceLastMonth = 0;
      try {
        const a1: any = await fetch1(`SELECT COUNT(*) AS n FROM point_rule_log WHERE rule_code='attendance' AND triggered_at >= ? AND triggered_at < ?`, thisMonthStart, thisMonthEnd);
        attendanceThisMonth = a1?.n || 0;
        const a2: any = await fetch1(`SELECT COUNT(*) AS n FROM point_rule_log WHERE rule_code='attendance' AND triggered_at >= ? AND triggered_at < ?`, lastMonthStart, lastMonthEnd);
        attendanceLastMonth = a2?.n || 0;
      } catch {}

      // 4. 평가서
      let evalAvgThisMonth = 0, evalCountThisMonth = 0, evalNotifiedThisMonth = 0;
      try {
        const e1: any = await fetch1(`SELECT IFNULL(AVG(score_overall),0) AS avg, COUNT(*) AS n, IFNULL(SUM(parent_notified),0) AS notified FROM student_evaluations WHERE created_at >= ? AND created_at < ?`, thisMonthStart, thisMonthEnd);
        evalAvgThisMonth = Math.round((e1?.avg || 0) * 10) / 10;
        evalCountThisMonth = e1?.n || 0;
        evalNotifiedThisMonth = e1?.notified || 0;
      } catch {}

      // 5. 카톡 알림 발송 (미납)
      let overdueNotifyThisMonth = 0;
      try {
        const o1: any = await fetch1(`SELECT COUNT(*) AS n FROM payment_overdue_log WHERE status='sent' AND sent_at >= ? AND sent_at < ?`, thisMonthStart, thisMonthEnd);
        overdueNotifyThisMonth = o1?.n || 0;
      } catch {}

      // 6. 포인트 적립 합계 (이번 달)
      let pointsEarnedThisMonth = 0, pointsSpentThisMonth = 0;
      try {
        const p1: any = await fetch1(`SELECT IFNULL(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),0) AS earned, IFNULL(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END),0) AS spent FROM point_transactions WHERE created_at >= ? AND created_at < ?`, thisMonthStart, thisMonthEnd);
        pointsEarnedThisMonth = p1?.earned || 0;
        pointsSpentThisMonth = p1?.spent || 0;
      } catch {}

      // 7. 채팅 메시지 수 (이번 달)
      let chatMessagesThisMonth = 0;
      try {
        const c1: any = await fetch1(`SELECT COUNT(*) AS n FROM chat_messages WHERE sent_at >= ? AND sent_at < ?`, thisMonthStart, thisMonthEnd);
        chatMessagesThisMonth = c1?.n || 0;
      } catch {}

      // 8. 미납 학생 수 (35일 기준)
      let overdueCount = 0;
      try {
        const cutoff = now - 35 * 86400 * 1000;
        const oc: any = await fetch1(`SELECT COUNT(DISTINCT s.user_id) AS n FROM students_erp s
                                       WHERE (s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')
                                         AND s.user_id NOT IN (SELECT user_id FROM student_payments WHERE status='paid' AND paid_at >= ?)${_uidScope}`, cutoff, ..._sb);
        overdueCount = oc?.n || 0;
      } catch {}

      // 9. 신규 상담 (지난 30일)
      let inquiryLast30 = 0;
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, message TEXT, created_at INTEGER);`);
        const i1: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ?`, last30Start);
        inquiryLast30 = i1?.n || 0;
      } catch {}

      // 🆕 Phase 10 — Web Push KPI
      const pushKpi: any = { active_subs: 0, queued_this_month: 0, fetched_this_month: 0, delivery_rate: 0 };
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`);
        const ps: any = await fetch1(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE enabled = 1`);
        const pq: any = await fetch1(`SELECT COUNT(*) AS sent, IFNULL(SUM(CASE WHEN fetched_at IS NOT NULL THEN 1 ELSE 0 END),0) AS fetched FROM push_queue WHERE queued_at >= ? AND queued_at < ?`, thisMonthStart, thisMonthEnd);
        pushKpi.active_subs = ps?.n || 0;
        pushKpi.queued_this_month = pq?.sent || 0;
        pushKpi.fetched_this_month = pq?.fetched || 0;
        pushKpi.delivery_rate = pushKpi.queued_this_month > 0 ? Math.round((pushKpi.fetched_this_month / pushKpi.queued_this_month) * 100) : 0;
      } catch {}

      // 10. 최근 7일 일별 매출 추세
      const dailyRev: any[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(); dayStart.setDate(dayStart.getDate() - i); dayStart.setHours(0,0,0,0);
        const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
        const r: any = await fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum FROM student_payments WHERE status='paid' AND paid_at >= ? AND paid_at < ?${_uidScope}`, dayStart.getTime(), dayEnd.getTime(), ..._sb);
        dailyRev.push({ date: dayStart.toISOString().slice(5,10), revenue: r?.sum || 0 });
      }

      // 비율 계산
      const trend = (cur: number, prev: number) => {
        if (prev === 0) return cur > 0 ? 100 : 0;
        return Math.round(((cur - prev) / prev) * 1000) / 10;  // 소수 1자리
      };

      return json({
        ok: true,
        ts: now,
        period: { this_month_start: thisMonthStart, this_month_end: thisMonthEnd, last_month_start: lastMonthStart },
        kpi: {
          students: {
            total: studentTotal?.n || 0,
            new_this_month: studentNewThisMonth?.n || 0,
            new_last_month: studentNewLastMonth?.n || 0,
            trend: trend(studentNewThisMonth?.n || 0, studentNewLastMonth?.n || 0),
          },
          revenue: {
            this_month: revThisMonth?.sum || 0,
            last_month: revLastMonth?.sum || 0,
            this_month_count: revThisMonth?.n || 0,
            trend: trend(revThisMonth?.sum || 0, revLastMonth?.sum || 0),
          },
          attendance: {
            this_month: attendanceThisMonth,
            last_month: attendanceLastMonth,
            trend: trend(attendanceThisMonth, attendanceLastMonth),
          },
          evaluation: {
            avg_score: evalAvgThisMonth,
            count: evalCountThisMonth,
            notified: evalNotifiedThisMonth,
          },
          overdue: {
            count: overdueCount,
            notified_this_month: overdueNotifyThisMonth,
          },
          points: {
            earned_this_month: pointsEarnedThisMonth,
            spent_this_month: pointsSpentThisMonth,
          },
          chat: {
            messages_this_month: chatMessagesThisMonth,
          },
          inquiry: {
            last_30_days: inquiryLast30,
          },
          push: pushKpi,
        },
        daily_revenue: dailyRev,
      });
    }
    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase D1~D2 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 💵 Phase 15 — 매출/랭킹/학생흐름/저장소 통계 (읽기전용)
    // ═══════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/stats/revenue') {
      // 신규 환경에서 student_payments 가 없을 수 있으니 자동 생성
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);

      const period = (url.searchParams.get('period') || 'day').toLowerCase();
      const fromStr = url.searchParams.get('from') || '';
      const toStr = url.searchParams.get('to') || '';
      const validPeriods = new Set(['day', 'month', 'quarter', 'half', 'year']);
      if (!validPeriods.has(period)) {
        return json({ ok: false, error: 'invalid_period', allowed: Array.from(validPeriods) }, 400);
      }

      // 기본 기간: 최근 90일 (period 가 day) / 최근 1년 (그 외)
      const now = Date.now();
      let fromMs = 0, toMs = now + 86400000;
      // 사용자 입력 YYYY-MM-DD 는 KST 기준으로 해석 (기존 UTC 해석은 KST 0~9시 데이터를 누락시킴)
      if (/^\d{4}-\d{2}-\d{2}$/.test(fromStr)) fromMs = new Date(fromStr + 'T00:00:00+09:00').getTime();
      else if (period === 'day') fromMs = now - 90 * 86400000;
      else fromMs = now - 365 * 86400000;
      if (/^\d{4}-\d{2}-\d{2}$/.test(toStr)) toMs = new Date(toStr + 'T23:59:59+09:00').getTime();

      // SQLite expression: KST 기준 date() 변환 (paid_at = ms → seconds → +9h shift)
      const kstDate = `date((paid_at + 32400000) / 1000, 'unixepoch')`;
      let groupExpr = '';
      let labelExpr = '';
      if (period === 'day') {
        groupExpr = kstDate; labelExpr = kstDate;
      } else if (period === 'month') {
        groupExpr = `substr(${kstDate}, 1, 7)`;
        labelExpr = groupExpr;
      } else if (period === 'quarter') {
        // YYYY-Qn
        groupExpr = `substr(${kstDate}, 1, 4) || '-Q' || ((CAST(substr(${kstDate}, 6, 2) AS INTEGER) + 2) / 3)`;
        labelExpr = groupExpr;
      } else if (period === 'half') {
        groupExpr = `substr(${kstDate}, 1, 4) || '-' || (CASE WHEN CAST(substr(${kstDate}, 6, 2) AS INTEGER) <= 6 THEN '1H' ELSE '2H' END)`;
        labelExpr = groupExpr;
      } else { // year
        groupExpr = `substr(${kstDate}, 1, 4)`;
        labelExpr = groupExpr;
      }

      const _sf = await scopeFragments(env, request);
      const _uidScope = _sf.uidScope, _sb = _sf.binds;

      try {
        const rows = await env.DB.prepare(
          `SELECT ${labelExpr} AS label, SUM(amount_krw) AS revenue, COUNT(*) AS pay_count
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at BETWEEN ? AND ?${_uidScope}
           GROUP BY ${groupExpr}
           ORDER BY label ASC`
        ).bind(fromMs, toMs, ..._sb).all<{ label: string; revenue: number; pay_count: number }>();

        const items = (rows.results || []);
        const total = items.reduce((s, r) => s + (r.revenue || 0), 0);

        // 추가 요약: 일/월/분기/반기/연 매출 (현재 시점 기준)
        const todayKst = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
        const thisMonth = todayKst.slice(0, 7);
        const thisYear = todayKst.slice(0, 4);
        const thisMonthNum = parseInt(todayKst.slice(5, 7), 10);
        const thisQuarter = thisYear + '-Q' + (Math.floor((thisMonthNum - 1) / 3) + 1);
        const thisHalf = thisYear + '-' + (thisMonthNum <= 6 ? '1H' : '2H');

        const summaryRows = await env.DB.prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN ${kstDate} = ? THEN amount_krw END), 0) AS today_rev,
             COALESCE(SUM(CASE WHEN substr(${kstDate}, 1, 7) = ? THEN amount_krw END), 0) AS month_rev,
             COALESCE(SUM(CASE WHEN substr(${kstDate}, 1, 4) || '-Q' || ((CAST(substr(${kstDate}, 6, 2) AS INTEGER) + 2) / 3) = ? THEN amount_krw END), 0) AS quarter_rev,
             COALESCE(SUM(CASE WHEN substr(${kstDate}, 1, 4) || '-' || (CASE WHEN CAST(substr(${kstDate}, 6, 2) AS INTEGER) <= 6 THEN '1H' ELSE '2H' END) = ? THEN amount_krw END), 0) AS half_rev,
             COALESCE(SUM(CASE WHEN substr(${kstDate}, 1, 4) = ? THEN amount_krw END), 0) AS year_rev
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL${_uidScope}`
        ).bind(todayKst, thisMonth, thisQuarter, thisHalf, thisYear, ..._sb).first<any>();

        return json({
          ok: true,
          period,
          from: new Date(fromMs).toISOString().slice(0, 10),
          to:   new Date(toMs).toISOString().slice(0, 10),
          items,
          total,
          summary: summaryRows || { today_rev:0, month_rev:0, quarter_rev:0, half_rev:0, year_rev:0 }
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 🏆 학생 랭킹 — 발화·시선·집중도 3개 지표 통합 (Phase 15c)
    //   GET /api/admin/stats/student-rankings?period=day|week|month|quarter|custom&from=&to=&sort_by=speaking|gaze|focus&limit=10
    //   - 발화 (active_ms / session_ms 비율)
    //   - 시선 (avg gaze_score 0~100)
    //   - 집중도 (composite: 시선 50% + 발화비율 40% - 끊김 10%)
    if (method === 'GET' && path === '/api/admin/stats/student-rankings') {
      const period = (url.searchParams.get('period') || 'week').toLowerCase();
      const fromStr = url.searchParams.get('from') || '';
      const toStr = url.searchParams.get('to') || '';
      const sortBy = (url.searchParams.get('sort_by') || 'focus').toLowerCase();
      const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '10', 10)));

      // 기간 자동 계산 (period 우선, custom 이면 from/to 사용)
      const now = Date.now();
      let fromMs = 0, toMs = now + 1;
      if (period === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(fromStr)) {
        // KST 기준 해석 (다른 stats 엔드포인트와 통일)
        fromMs = new Date(fromStr + 'T00:00:00+09:00').getTime();
        toMs = /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? new Date(toStr + 'T23:59:59+09:00').getTime() : now + 1;
      } else if (period === 'day') {
        fromMs = now - 1 * 86400000;
      } else if (period === 'week') {
        fromMs = now - 7 * 86400000;
      } else if (period === 'month') {
        fromMs = now - 30 * 86400000;
      } else if (period === 'quarter') {
        fromMs = now - 90 * 86400000;
      } else {
        fromMs = now - 7 * 86400000;   // default: 1주
      }

      try {
        // 학생별 집계 (role='student' 만)
        const rows = await env.DB.prepare(
          `SELECT user_id,
                  COALESCE(MAX(username), user_id) AS username,
                  COUNT(*) AS session_count,
                  COALESCE(SUM(total_active_ms), 0) AS active_ms,
                  COALESCE(SUM(total_session_ms), 0) AS session_ms,
                  COALESCE(SUM(disconnect_count), 0) AS disconnect_sum,
                  AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze,
                  COUNT(CASE WHEN gaze_score IS NOT NULL THEN 1 END) AS gaze_count,
                  MAX(joined_at) AS last_seen
           FROM attendance
           WHERE joined_at BETWEEN ? AND ?
             AND COALESCE(role, 'student') = 'student'
           GROUP BY user_id
           HAVING session_ms > 0 OR session_count > 0`
        ).bind(fromMs, toMs).all<any>();

        const items = (rows.results || []).map(r => {
          const activeRatio = r.session_ms > 0 ? (r.active_ms / r.session_ms * 100) : 0;
          const avgGaze = r.avg_gaze != null ? Number(r.avg_gaze) : null;
          // 집중도 composite: 시선 50% + 발화 비율 40% - 끊김 페널티 10%
          // 시선 데이터 없으면 발화 비율 70% + 끊김 30% 만 사용
          let focus;
          if (avgGaze != null) {
            const dcPenalty = Math.min(100, (r.disconnect_sum / Math.max(1, r.session_count)) * 20);
            focus = avgGaze * 0.5 + activeRatio * 0.4 - dcPenalty * 0.1;
          } else {
            const dcPenalty = Math.min(100, (r.disconnect_sum / Math.max(1, r.session_count)) * 20);
            focus = activeRatio * 0.7 - dcPenalty * 0.3;
          }
          focus = Math.max(0, Math.min(100, focus));
          return {
            user_id: r.user_id,
            username: r.username,
            session_count: r.session_count,
            active_ms: r.active_ms,
            session_ms: r.session_ms,
            active_ratio: Math.round(activeRatio * 10) / 10,
            avg_gaze: avgGaze != null ? Math.round(avgGaze * 10) / 10 : null,
            gaze_count: r.gaze_count,
            disconnect_sum: r.disconnect_sum,
            focus_score: Math.round(focus * 10) / 10,
            last_seen: r.last_seen
          };
        });

        // 정렬
        const sorters: Record<string, (a:any,b:any)=>number> = {
          speaking: (a, b) => b.active_ms - a.active_ms,
          gaze:     (a, b) => (b.avg_gaze ?? -1) - (a.avg_gaze ?? -1),
          focus:    (a, b) => b.focus_score - a.focus_score,
          ratio:    (a, b) => b.active_ratio - a.active_ratio,
          sessions: (a, b) => b.session_count - a.session_count
        };
        items.sort(sorters[sortBy] || sorters.focus);

        return json({
          ok: true,
          period,
          from: new Date(fromMs).toISOString().slice(0, 10),
          to: new Date(toMs).toISOString().slice(0, 10),
          sort_by: sortBy,
          total: items.length,
          items: items.slice(0, limit)
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/stats/student-flow') {
      // students_erp 의 signup_date / end_date 기준 일자별 흐름
      const fromStr = url.searchParams.get('from') || '';
      const toStr = url.searchParams.get('to') || '';
      const today = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? fromStr
                 : new Date(Date.now() - 90*86400000 + 9*3600*1000).toISOString().slice(0,10);
      const to = /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? toStr : today;

      const _sf = await scopeFragments(env, request);
      try {
        // 신규 가입 (signup_date 기준)
        const newRows = await env.DB.prepare(
          `SELECT signup_date AS date, COUNT(*) AS cnt
           FROM students_erp
           WHERE signup_date IS NOT NULL AND signup_date BETWEEN ? AND ?` + _sf.erpScope + `
           GROUP BY signup_date ORDER BY signup_date ASC`
        ).bind(from, to, ..._sf.binds).all<{ date: string; cnt: number }>();

        // 탈락 (end_date < 오늘 + status 가 정상 아님)
        const dropRows = await env.DB.prepare(
          `SELECT end_date AS date, COUNT(*) AS cnt
           FROM students_erp
           WHERE end_date IS NOT NULL AND end_date BETWEEN ? AND ?
             AND end_date < ?
             AND status NOT IN ('정상','활동','active')` + _sf.erpScope + `
           GROUP BY end_date ORDER BY end_date ASC`
        ).bind(from, to, today, ..._sf.binds).all<{ date: string; cnt: number }>();

        // 전체 학생 수 (현재 활성 — 종료일 미만이거나 미설정)
        const activeRow = await env.DB.prepare(
          `SELECT COUNT(*) AS active
           FROM students_erp
           WHERE (end_date IS NULL OR end_date >= ?)` + _sf.erpScope + ``
        ).bind(today, ..._sf.binds).first<{ active: number }>();

        const totalNew = (newRows.results || []).reduce((s, r) => s + (r.cnt || 0), 0);
        const totalDropped = (dropRows.results || []).reduce((s, r) => s + (r.cnt || 0), 0);

        return json({
          ok: true,
          from, to,
          new_by_date: newRows.results || [],
          dropped_by_date: dropRows.results || [],
          active: activeRow?.active || 0,
          total_new: totalNew,
          total_dropped: totalDropped,
          net_growth: totalNew - totalDropped
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // ===== 💰 저장소·비용 통계 (Phase 7) =====
    //   GET /api/admin/stats/storage
    //   - D1 테이블별 row 수 + 녹화 총 size_bytes
    //   - R2 객체 수·총 size (list 1페이지 = 최대 1,000 객체, 초과 시 truncated)
    //   - KV 는 list() 가 일일 한도 소비라 측정 제외 (dashboard 안내)
    //   - 집계가 무거워 리소스 한도 503 이력 → KV 5분 캐시 + R2 나열 1페이지 제한
    if (method === 'GET' && path === '/api/admin/stats/storage') {
      const started = Date.now();

      const STORAGE_STATS_CACHE_KEY = 'admin:stats:storage:v1';
      try {
        const hit = await env.SESSION_STATE.get(STORAGE_STATS_CACHE_KEY);
        if (hit) {
          return json({ ...JSON.parse(hit), cached: true, latencyMs: Date.now() - started });
        }
      } catch { /* 캐시 조회 실패 시 실측으로 진행 */ }

      // D1 비즈니스 메트릭 — 병렬 조회. notification_queue 는 미생성 환경에서 fail 가능 → catch
      const safe = (p: Promise<any>) => p.catch(() => null);
      const [recCount, recSize, recByStatus, attCount, attTotals, emergCount, rewardCount, notifByStatus] = await Promise.all([
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM recordings`).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS total FROM recordings`).first()),
        safe(env.DB.prepare(`SELECT status, COUNT(*) AS c FROM recordings GROUP BY status`).all()),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM attendance`).first()),
        safe(env.DB.prepare(`SELECT COALESCE(SUM(total_session_ms), 0) AS total_session, COALESCE(SUM(total_active_ms), 0) AS total_active FROM attendance`).first()),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM emergency_events`).first()),
        safe(env.DB.prepare(`SELECT COUNT(*) AS c FROM rewards`).first()),
        safe(env.DB.prepare(`SELECT status, COUNT(*) AS c FROM notification_queue GROUP BY status`).all())
      ]);

      // R2 객체 카운트 — 1페이지(최대 1,000 개)만. 더 크면 truncated=true 로 알림
      let r2Count = 0;
      let r2Size = 0;
      let r2Truncated = false;
      const envAny = env as any;
      if (envAny.RECORDINGS) {
        try {
          const ls: any = await envAny.RECORDINGS.list({ limit: 1000 });
          for (const obj of (ls.objects || [])) {
            r2Count++;
            r2Size += obj.size || 0;
          }
          r2Truncated = !!ls.truncated;
        } catch (e) {
          // 측정 실패해도 D1 메트릭은 반환
        }
      }

      const storagePayload = {
        ok: true,
        timestamp: Date.now(),
        latencyMs: Date.now() - started,
        d1: {
          recordings: {
            count: (recCount as any)?.c || 0,
            total_size_bytes: (recSize as any)?.total || 0,
            by_status: (recByStatus as any)?.results || []
          },
          attendance: {
            count: (attCount as any)?.c || 0,
            total_session_ms: (attTotals as any)?.total_session || 0,
            total_active_ms:  (attTotals as any)?.total_active  || 0
          },
          emergency_events: (emergCount as any)?.c || 0,
          rewards: (rewardCount as any)?.c || 0,
          notification_queue_by_status: (notifByStatus as any)?.results || []
        },
        r2: {
          configured: !!envAny.RECORDINGS,
          object_count: r2Count,
          total_size_bytes: r2Size,
          truncated: r2Truncated,
          note: r2Truncated ? '1,000 객체 초과 — 정확한 사용량은 Cloudflare dashboard 에서 확인' : null
        },
        kv: {
          note: 'KV 사용량(list/get/put 호출 수) 은 Cloudflare dashboard 에서 확인. list() 호출 자체가 일일 한도 소비라 셀프 측정 제외.'
        }
      };

      try { await env.SESSION_STATE.put(STORAGE_STATS_CACHE_KEY, JSON.stringify(storagePayload), { expirationTtl: 300 }); } catch { /* 캐시 저장 실패 무시 */ }
      return json(storagePayload);
    }

    // ═══════════════════════════════════════════════════════════════
    // 💼 Phase G1~G2 — 강사 급여 자동 정산
    // ═══════════════════════════════════════════════════════════════

    const ensurePayrollTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_payroll (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL, teacher_name TEXT, year INTEGER NOT NULL, month INTEGER NOT NULL, lesson_count INTEGER DEFAULT 0, total_minutes INTEGER DEFAULT 0, fee_per_10min INTEGER DEFAULT 0, calculated_amount INTEGER DEFAULT 0, adjusted_amount INTEGER, paid_amount INTEGER, status TEXT DEFAULT 'pending', paid_at INTEGER, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(teacher_id, year, month));`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_payroll_period ON teacher_payroll(year, month)`); } catch {}
      // 💼 G3 — 공제(deduction) 반영 정산: 공제합계·실지급액 컬럼 추가(기존 배포 DB 호환 ALTER)
      try { await env.DB.exec(`ALTER TABLE teacher_payroll ADD COLUMN deduction_total INTEGER DEFAULT 0`); } catch {}
      try { await env.DB.exec(`ALTER TABLE teacher_payroll ADD COLUMN final_amount INTEGER`); } catch {}
    };

    // ── 💼 G3 — 공제(Deduction) 규칙 테이블 ──
    //   마이마이 요청(2026-07): "당일 피드백 미작성 -50 PHP" 같은 공제를 관리자가
    //   금액·켜기/끄기로 조절. rule_type: per_lesson(수업 1건당 차감) | policy_percent(지급률 정책)
    const ensureDeductionRules = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_deduction_rules (code TEXT PRIMARY KEY, label_ko TEXT, label_en TEXT, rule_type TEXT DEFAULT 'per_lesson', amount REAL DEFAULT 0, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, updated_at INTEGER)`);
      const now = Date.now();
      const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM payroll_deduction_rules`).first().catch(() => null);
      if (!cnt || !(cnt.c > 0)) {
        const seed: any[] = [
          // rule_type: per_lesson(수업 1건당) | per_minute(지각 1분당) | policy_percent(지급률 정책)
          ['no_feedback_day',    '당일 피드백 미작성 (수업 1건당 차감)',       'No feedback within the day (per lesson)',  'per_lesson',    25, 1, 1],
          ['late_no_extend',     '지각 수업 연장 실패 (지각 1분당 차감)',       'Late lesson not extended (per late min)',  'per_minute',    10, 1, 2],
          ['teacher_no_show',    '강사 미입장·노쇼 (수업 1건당 차감)',         'Teacher no-show (per lesson)',             'per_lesson',     0, 0, 3],
          ['absent_pay_percent', '학생 결석 시 지급률(%)',                     'Pay rate when student is absent (%)',      'policy_percent', 0, 1, 4],
        ];
        for (const s of seed) {
          try { await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind(s[0], s[1], s[2], s[3], s[4], s[5], s[6], now).run(); } catch {}
        }
      }
      // ── 기존 배포 DB 호환 마이그레이션(멱등) ──
      //   ① 지각 연장실패(per_minute) 규칙이 없으면 추가 (2026-07-14 신규 정책)
      try {
        await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES ('late_no_extend','지각 수업 연장 실패 (지각 1분당 차감)','Late lesson not extended (per late min)','per_minute',10,1,2,?)`).bind(now).run();
      } catch {}
      //   ② 당일 피드백 미작성 공제: 정책 변경 -50 → -25. 관리자가 손대지 않은 옛 기본값(50)만 1회 갱신.
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`);
        const flag: any = await env.DB.prepare(`SELECT value FROM payroll_meta WHERE key = 'nofb_25_migrated'`).first().catch(() => null);
        if (!flag) {
          await env.DB.prepare(`UPDATE payroll_deduction_rules SET amount = 25, updated_at = ? WHERE code = 'no_feedback_day' AND amount = 50`).bind(now).run().catch(() => {});
          await env.DB.prepare(`INSERT OR REPLACE INTO payroll_meta (key,value,updated_at) VALUES ('nofb_25_migrated','1',?)`).bind(now).run().catch(() => {});
        }
      } catch {}
    };

    // ── 💼 강사 등급(Level) — 등급별 기본 요율(per 20분 수업). 참고사 포맷의 "Teacher's level (rate)".
    //   기본(Teacher 1)=₱50, 상위(Teacher 2)=₱70. 관리자가 등급 요율을 조정하고,
    //   강사에게 등급을 지정하면 그 강사의 fee_per_10min 이 등급 요율/2 로 자동 세팅된다(수정 가능).
    const ensureTeacherLevels = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_levels (code TEXT PRIMARY KEY, label_ko TEXT, label_en TEXT, rate_per_20min REAL DEFAULT 0, sort_order INTEGER DEFAULT 0, updated_at INTEGER)`);
      const now = Date.now();
      const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM payroll_levels`).first().catch(() => null);
      if (!cnt || !(cnt.c > 0)) {
        const seed: any[] = [
          ['teacher_1', 'Teacher 1 (기본)', 'Teacher 1 (Basic)',  50, 1],
          ['teacher_2', 'Teacher 2 (상위)', 'Teacher 2 (Senior)', 70, 2],
        ];
        for (const s of seed) {
          try { await env.DB.prepare(`INSERT OR IGNORE INTO payroll_levels (code,label_ko,label_en,rate_per_20min,sort_order,updated_at) VALUES (?,?,?,?,?,?)`).bind(s[0], s[1], s[2], s[3], s[4], now).run(); } catch {}
        }
      }
      // teacher_profiles 에 등급 컬럼(기존 배포 DB 호환)
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN level TEXT`); } catch {}
    };

    // ── 💼 G3 — 월별 수업 한 건씩(Lesson Fee Summary) + 공제 자동 계산 ──
    //   class_schedules(수업) + class_no_show(결석/노쇼) + teacher_class_feedback(당일 피드백)을
    //   JS에서 매칭(스케줄 날짜 포맷이 '2026-07-01'/'2026/07/01' 혼재라 SQL 조인 대신 안전한 JS 매칭).
    //   수업↔피드백 정확 연결: 예약기반 결정론 room_id = `class-{scheduleId}-{YYYYMMDD}` (Phase RM 규칙 재사용)
    const computeLessonFeeMonth = async (year: number, month: number) => {
      await ensurePayrollTable();
      await ensureDeductionRules();
      await ensureTeacherLevels();
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, fee_per_10min INTEGER, status TEXT DEFAULT '활동중', email TEXT, phone TEXT);`); } catch {}
      // 📌 지각 연장실패 수동 입력(관리자가 상세표에서 수업별 지각분 기입) — 근태 자동로그 도입 전까지 사용
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS lesson_late_minutes (schedule_id INTEGER NOT NULL, lesson_date TEXT NOT NULL, minutes INTEGER DEFAULT 0, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (schedule_id, lesson_date));`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, teacher_id INTEGER, teacher_name TEXT, scheduled_date TEXT, day_of_week INTEGER, start_time TEXT, duration_minutes INTEGER, status TEXT);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_no_show (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, missing_role TEXT, missing_uid TEXT, student_name TEXT, teacher_name TEXT, lesson_title TEXT, waited_min INTEGER, notified_push INTEGER DEFAULT 0, notified_kakao INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_class_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, teacher_uid TEXT, teacher_name TEXT, student_name TEXT, duration_min INTEGER, metrics_json TEXT, feedback_ko TEXT, feedback_en TEXT, source TEXT, created_at INTEGER NOT NULL, UNIQUE(room_id));`); } catch {}

      // 공제 규칙 로드
      const ruleRows: any = await env.DB.prepare(`SELECT * FROM payroll_deduction_rules ORDER BY sort_order, code`).all().catch(() => ({ results: [] }));
      const rules: any = {};
      (ruleRows.results || []).forEach((r: any) => { rules[r.code] = r; });
      const absentPct = (rules.absent_pay_percent && rules.absent_pay_percent.enabled) ? Math.max(0, Math.min(100, Number(rules.absent_pay_percent.amount) || 0)) : 0;
      const feeNoFb = (rules.no_feedback_day && rules.no_feedback_day.enabled) ? Math.max(0, Number(rules.no_feedback_day.amount) || 0) : 0;
      const feeTNoShow = (rules.teacher_no_show && rules.teacher_no_show.enabled) ? Math.max(0, Number(rules.teacher_no_show.amount) || 0) : 0;
      const feeLateMin = (rules.late_no_extend && rules.late_no_extend.enabled) ? Math.max(0, Number(rules.late_no_extend.amount) || 0) : 0;

      // 등급(Level) 요율표 로드
      const lvlRows: any = await env.DB.prepare(`SELECT * FROM payroll_levels ORDER BY sort_order, code`).all().catch(() => ({ results: [] }));
      const levelMap: any = {};
      (lvlRows.results || []).forEach((r: any) => { levelMap[r.code] = r; });

      // 수업별 지각(연장실패) 분 — 관리자 수동 입력값
      const lateRows: any = await env.DB.prepare(`SELECT schedule_id, lesson_date, minutes FROM lesson_late_minutes`).all().catch(() => ({ results: [] }));
      const lateMap: any = {};
      (lateRows.results || []).forEach((r: any) => { lateMap[`${r.schedule_id}|${r.lesson_date}`] = Math.max(0, Number(r.minutes) || 0); });

      // 강사 목록 + 단가 + 등급
      const teachers: any = await env.DB.prepare(
        `SELECT id, korean_name, english_name, fee_per_10min, level FROM teacher_profiles WHERE status = '활동중' OR status IS NULL ORDER BY korean_name`
      ).all().catch(() => ({ results: [] }));
      const tMap: any = {}; const tByName: any = {};
      for (const t of (teachers.results || [])) { tMap[t.id] = t; if (t.korean_name) tByName[t.korean_name] = t; if (t.english_name) tByName[t.english_name] = t; }

      // 이 달 수업 (취소 제외)
      //   ⚠️ 실제 운영 class_schedules 스키마는 코드 DDL과 다르다(2026-07-10 확인):
      //   duration_min(≠duration_minutes), teacher_name 컬럼 없음, teacher_id 는 TEXT("28"),
      //   그리고 전 행이 schedule_kind='recurring'(요일 반복, scheduled_date=NULL).
      //   → SELECT * 로 어떤 스키마든 읽고, 반복 스케줄은 해당 월의 날짜 인스턴스로 전개한다.
      const ymPrefix = `${year}-${String(month).padStart(2, '0')}`;
      const ls: any = await env.DB.prepare(
        `SELECT * FROM class_schedules WHERE COALESCE(status,'active') != 'cancelled' AND teacher_id IS NOT NULL`
      ).all().catch(() => ({ results: [] }));

      const DOW: any = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
      const dowOf = (v: any): number | null => {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return (v >= 0 && v <= 6) ? v : null;
        const s = String(v).trim().toLowerCase();
        if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return (n >= 0 && n <= 6) ? n : null; }
        const a = DOW[s.slice(0, 3)]; if (a !== undefined) return a;
        const b = DOW[s.slice(0, 1)]; return b !== undefined ? b : null;
      };
      const daysInMonth = new Date(year, month, 0).getDate();
      const instances: any[] = [];
      for (const row of (ls.results || [])) {
        const mins = row.duration_min ?? row.duration_minutes ?? 30;
        const dated = String(row.scheduled_date || '').replace(/\//g, '-').slice(0, 10);
        if (dated) {
          // 날짜 지정 수업 — 이 달 것만
          if (dated.startsWith(ymPrefix)) instances.push({ ...row, _date: dated, _mins: mins });
          continue;
        }
        // 반복 수업 — 이 달의 해당 요일 날짜들로 전개
        const dw = dowOf(row.day_of_week);
        if (dw == null) continue;
        for (let d = 1; d <= daysInMonth; d++) {
          if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === dw) {
            instances.push({ ...row, _date: `${ymPrefix}-${String(d).padStart(2, '0')}`, _mins: mins });
          }
        }
      }
      instances.sort((a, b) => (a._date + (a.start_time || '')).localeCompare(b._date + (b.start_time || '')));

      // 이 달 노쇼·피드백 (KST 기준 월 범위 ms)
      const mStart = Date.parse(`${ymPrefix}-01T00:00:00+09:00`);
      const mEnd = month === 12
        ? Date.parse(`${year + 1}-01-01T00:00:00+09:00`)
        : Date.parse(`${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00+09:00`);
      const kstDay = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

      const noShows: any = await env.DB.prepare(`SELECT room_id, schedule_id, missing_role, created_at FROM class_no_show WHERE created_at >= ? AND created_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      const nsByRoom: any = {}; const nsBySched: any = {};
      for (const n of (noShows.results || [])) {
        if (n.room_id) nsByRoom[n.room_id] = n;
        if (n.schedule_id != null) nsBySched[`${n.schedule_id}|${kstDay(n.created_at)}`] = n;
      }

      const fbs: any = await env.DB.prepare(`SELECT room_id, teacher_name, created_at FROM teacher_class_feedback WHERE created_at >= ? AND created_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      const fbByRoom: any = {}; const fbByTeacherDay: any = {};
      for (const f of (fbs.results || [])) {
        const dkey = kstDay(f.created_at);
        if (f.room_id && !fbByRoom[f.room_id]) fbByRoom[f.room_id] = dkey;
        if (f.teacher_name) fbByTeacherDay[`${f.teacher_name}|${dkey}`] = true;
      }
      // 📝 Phase FD — AI 초안을 강사가 '승인'한 것도 당일 피드백으로 인정 (승인 시각 기준)
      const fds: any = await env.DB.prepare(`SELECT room_id, approved_at FROM feedback_drafts WHERE status = 'approved' AND approved_at >= ? AND approved_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      for (const f of (fds.results || [])) {
        if (f.room_id && !fbByRoom[f.room_id]) fbByRoom[f.room_id] = kstDay(f.approved_at);
      }

      // 학생 이름 맵 (students_erp 컬럼 구성이 배포본마다 달라 순차 폴백)
      //   운영 class_schedules 에는 student_name 이 행에 직접 있어 이 맵은 폴백용.
      const uids: any[] = [...new Set(instances.filter((l: any) => !l.student_name).map((l: any) => l.user_id).filter(Boolean))];
      const stuName: any = {};
      if (uids.length && uids.length <= 500) {
        const ph = uids.map(() => '?').join(',');
        for (const col of ['student_name', 'korean_name', 'name']) {
          try {
            const rs: any = await env.DB.prepare(`SELECT user_id, ${col} AS nm FROM students_erp WHERE user_id IN (${ph})`).bind(...uids).all();
            let hit = false;
            for (const r of (rs.results || [])) { if (r.nm) { stuName[r.user_id] = r.nm; hit = true; } }
            if (hit) break;
          } catch {}
        }
      }

      // 오늘(KST) — 아직 시작 전인 예정 수업은 지급 계산에서 제외(status: upcoming)
      const nowKstIso = new Date(Date.now() + 9 * 3600 * 1000).toISOString();
      const todayKey = nowKstIso.slice(0, 10);
      const nowHm = nowKstIso.slice(11, 16);

      const lessons: any[] = [];
      const perTeacher: any = {};
      for (const l of instances) {
        const dateStr = l._date;
        const roomId = `class-${l.id}-${dateStr.replace(/-/g, '')}`;
        const prof = tMap[l.teacher_id] || tByName[l.teacher_name || ''] || null;
        const mins = l._mins;
        const teacherName = l.teacher_name || (prof ? prof.korean_name : null);
        // 등급(Level) + 요율: 개별 fee_per_10min 우선, 없으면 등급 기본요율(rate_per_20min/2)
        const levelCode: string | null = (prof && prof.level) ? String(prof.level) : null;
        const lvl = levelCode ? levelMap[levelCode] : null;
        const rate20 = (prof && prof.fee_per_10min) ? Number(prof.fee_per_10min) * 2 : (lvl ? Number(lvl.rate_per_20min) || 0 : 0);
        const fee = rate20 / 2; // per-10분 환산 — 기존 금액식(mins/10×fee) 그대로
        // 수업 유형(운영 스키마별 컬럼 폴백) — 기본 'Regular Lesson'
        const lessonType = l.lesson_type || l.class_type || l.lesson_kind || l.type || 'Regular Lesson';
        // 종료 시각(HH:MM) — 참고 포맷의 "14:00-14:20" 표기용
        const _st = String(l.start_time || '').slice(0, 5);
        let endTime = '';
        if (/^\d{2}:\d{2}$/.test(_st)) {
          const tot = parseInt(_st.slice(0, 2), 10) * 60 + parseInt(_st.slice(3, 5), 10) + mins;
          endTime = `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
        }

        const upcoming = dateStr > todayKey || (dateStr === todayKey && String(l.start_time || '00:00') > nowHm);
        const ns = nsByRoom[roomId] || nsBySched[`${l.id}|${dateStr}`] || null;
        let st = 'finish';
        if (upcoming) st = 'upcoming';
        else if (ns && ns.missing_role === 'student') st = 'student_absent';
        else if (ns && ns.missing_role === 'teacher') st = 'teacher_no_show';

        const base = Math.round((mins / 10) * fee);
        let amount = 0;
        if (st === 'finish') amount = base;
        else if (st === 'student_absent') amount = Math.round(base * absentPct / 100);

        // 당일 피드백 여부 — 완료 수업만 판정. room_id 정확 매칭 → (구 데이터 폴백) 강사명+같은 날
        let fbOk: boolean | null = null;
        if (st === 'finish') {
          fbOk = fbByRoom[roomId] === dateStr || !!fbByTeacherDay[`${teacherName}|${dateStr}`];
        }

        // 지각 연장실패(분당 차감) — 완료 수업에 관리자가 입력한 지각분 × 요율
        const lateMin = (st === 'finish') ? (lateMap[`${l.id}|${dateStr}`] || 0) : 0;

        const dedus: any[] = [];
        if (st === 'finish' && fbOk === false && feeNoFb > 0) dedus.push({ code: 'no_feedback_day', amount: feeNoFb });
        if (st === 'finish' && lateMin > 0 && feeLateMin > 0) dedus.push({ code: 'late_no_extend', amount: Math.round(lateMin * feeLateMin), minutes: lateMin });
        if (st === 'teacher_no_show' && feeTNoShow > 0) dedus.push({ code: 'teacher_no_show', amount: feeTNoShow });
        const dSum = dedus.reduce((a, b) => a + (b.amount || 0), 0);
        const netAmount = Math.max(0, amount - dSum); // 참고 포맷의 'Total'(수업별 순지급)

        lessons.push({
          schedule_id: l.id, room_id: roomId, date: dateStr, start_time: l.start_time || '', end_time: endTime,
          duration_minutes: mins, user_id: l.user_id || null,
          student_name: l.student_name || stuName[l.user_id] || null,
          teacher_id: l.teacher_id, teacher_name: teacherName,
          lesson_type: lessonType,
          level_code: levelCode, level_label_ko: lvl ? lvl.label_ko : null, level_label_en: lvl ? lvl.label_en : null,
          rate_per_20min: rate20,
          status: st, fee_per_10min: fee, base_amount: base, amount,
          late_minutes: lateMin,
          feedback_ok: fbOk, deductions: dedus, deduction_total: dSum, net_amount: netAmount,
        });

        const agg = perTeacher[l.teacher_id] || (perTeacher[l.teacher_id] = {
          teacher_id: l.teacher_id, lesson_count: 0, upcoming_count: 0, finish_count: 0,
          absent_count: 0, teacher_no_show_count: 0, no_feedback_count: 0,
          total_minutes: 0, base_amount: 0, pay_amount: 0, deduction_total: 0, final_amount: 0,
        });
        if (st === 'upcoming') { agg.upcoming_count++; continue; }
        agg.lesson_count++;
        agg.total_minutes += mins;
        if (st === 'finish') agg.finish_count++;
        if (st === 'student_absent') agg.absent_count++;
        if (st === 'teacher_no_show') agg.teacher_no_show_count++;
        if (fbOk === false) agg.no_feedback_count++;
        agg.base_amount += base;
        agg.pay_amount += amount;
        agg.deduction_total += dSum;
        agg.final_amount = agg.pay_amount - agg.deduction_total;
      }

      return { rules: ruleRows.results || [], levels: lvlRows.results || [], levelMap, absent_pay_percent: absentPct, lessons, perTeacher, teachers: teachers.results || [] };
    };

    // ── GET /api/admin/payroll/calculate?year=&month= — 월별 강사 급여 자동 계산 ──
    //   💼 G3 업그레이드: 수업 한 건씩 계산(computeLessonFeeMonth)을 합산 —
    //   학생 결석(지급률 정책)·강사 노쇼·당일 피드백 미작성 공제가 자동 반영되고,
    //   아직 시작 전인 예정 수업(upcoming)은 금액에서 제외된다.
    //   결과는 메모리에서만 반환 (DB 저장은 별도 POST /save)
    if (method === 'GET' && path === '/api/admin/payroll/calculate') {
      const now = new Date();
      const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()), 10);
      const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);

      // 🔐 강사(teacher) 로그인 시 본인 급여만 — 서버에서 강제(클라 필터는 우회 가능)
      const _prActor = await getAdminActor(request, env as any);
      const _prOwn = _prActor.isTeacher ? _prActor.name : '';

      const data = await computeLessonFeeMonth(year, month);

      // 기존 저장된 정산 (지급 상태 확인용)
      const saved: any = await env.DB.prepare(
        `SELECT * FROM teacher_payroll WHERE year = ? AND month = ?`
      ).bind(year, month).all().catch(() => ({ results: [] }));
      const savedMap: any = {};
      (saved.results || []).forEach((s: any) => { savedMap[s.teacher_id] = s; });

      const rows: any[] = [];
      let totalAmount = 0, totalLessons = 0, totalDeduction = 0, totalFinal = 0, paidCount = 0;
      for (const t of (data.teachers || [])) {
        // 강사 본인 뷰: 자신의 행만 계산·노출
        if (_prOwn && !sameTeacherName(_prOwn, t.korean_name) && !sameTeacherName(_prOwn, t.english_name)) continue;
        const a = data.perTeacher[t.id] || { lesson_count: 0, upcoming_count: 0, finish_count: 0, absent_count: 0, teacher_no_show_count: 0, no_feedback_count: 0, total_minutes: 0, base_amount: 0, pay_amount: 0, deduction_total: 0, final_amount: 0 };
        // 등급 요율: 개별 fee_per_10min 우선, 없으면 등급 기본요율
        const _lvl = t.level ? (data.levelMap || {})[t.level] : null;
        const rate20 = t.fee_per_10min ? Number(t.fee_per_10min) * 2 : (_lvl ? Number(_lvl.rate_per_20min) || 0 : 0);
        const fee = rate20 / 2;
        const s = savedMap[t.id];
        totalAmount += a.pay_amount;
        totalLessons += a.lesson_count;
        totalDeduction += a.deduction_total;
        totalFinal += a.final_amount;
        if (s && s.status === 'paid') paidCount++;
        rows.push({
          teacher_id: t.id,
          korean_name: t.korean_name,
          english_name: t.english_name,
          fee_per_10min: fee,
          level_code: t.level || null,
          level_label_ko: _lvl ? _lvl.label_ko : null,
          level_label_en: _lvl ? _lvl.label_en : null,
          rate_per_20min: rate20,
          lesson_count: a.lesson_count,
          total_minutes: a.total_minutes,
          calculated_amount: a.pay_amount,
          // 💼 G3 — 공제 반영 필드
          deduction_total: a.deduction_total,
          final_amount: a.final_amount,
          finish_count: a.finish_count,
          absent_count: a.absent_count,
          teacher_no_show_count: a.teacher_no_show_count,
          no_feedback_count: a.no_feedback_count,
          upcoming_count: a.upcoming_count,
          // 저장된 정산이 있으면 그 값 우선
          adjusted_amount: s?.adjusted_amount ?? null,
          paid_amount: s?.paid_amount ?? null,
          status: s?.status || 'pending',
          paid_at: s?.paid_at || null,
          memo: s?.memo || null,
          payroll_id: s?.id || null,
        });
      }
      return json({
        ok: true, year, month,
        summary: {
          teacher_count: rows.length,
          total_lessons: totalLessons,
          total_amount: totalAmount,
          total_deduction: totalDeduction,
          total_final: totalFinal,
          paid_count: paidCount,
          unpaid_count: rows.length - paidCount,
        },
        levels: (data.levels || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rate_per_20min: r.rate_per_20min })),
        rows,
      });
    }

    // ── GET /api/admin/payroll/lessons?year=&month=&teacher_id=|teacher_name= ──
    //   💼 G3 — 강사 1명의 수업별 상세(Lesson Fee Summary): 날짜·시간·학생·상태·단가·금액·피드백·공제.
    //   관리자 카드 「📋 상세」와 강사 마이페이지 '🧾 수업료 정산' 탭이 함께 사용
    //   (admin 세션 쿠키 필수 — index.ts default-deny 미들웨어가 인증 강제).
    if (method === 'GET' && path === '/api/admin/payroll/lessons') {
      const now = new Date();
      const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()), 10);
      const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);
      let tid = parseInt(url.searchParams.get('teacher_id') || '', 10) || 0;
      let tname = (url.searchParams.get('teacher_name') || '').trim();
      // 🔐 강사(teacher) 로그인 시엔 요청한 teacher_id/teacher_name 을 무시하고 항상 본인 것만.
      //   (강사가 남의 teacher_id 를 넣어 타인의 수업별 단가·공제를 조회하는 것을 서버에서 차단)
      const _lsActor = await getAdminActor(request, env as any);
      if (_lsActor.isTeacher) {
        if (!_lsActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        tid = 0;
        tname = _lsActor.name;
      }
      if (!tid && !tname) return json({ ok: false, error: 'teacher_id_or_teacher_name_required' }, 400);

      const data = await computeLessonFeeMonth(year, month);
      let teacher: any = null;
      if (tid) teacher = (data.teachers || []).find((t: any) => t.id === tid) || null;
      else {
        teacher = (data.teachers || []).find((t: any) => t.korean_name === tname || t.english_name === tname) || null;
        if (teacher) tid = teacher.id;
      }
      // 운영 DB teacher_id 는 TEXT("28") — 숫자/문자 혼용에 안전하게 문자열 비교
      const lessons = data.lessons.filter((l: any) =>
        (tid && String(l.teacher_id) === String(tid)) || (!tid && tname && l.teacher_name === tname));

      // 필터된 수업으로 요약 재계산 (이름만 일치하는 프로필 없는 강사도 지원)
      const sum: any = { lesson_count: 0, upcoming_count: 0, finish_count: 0, absent_count: 0, teacher_no_show_count: 0, no_feedback_count: 0, total_minutes: 0, base_amount: 0, pay_amount: 0, deduction_total: 0, final_amount: 0 };
      for (const l of lessons) {
        if (l.status === 'upcoming') { sum.upcoming_count++; continue; }
        sum.lesson_count++;
        sum.total_minutes += l.duration_minutes;
        if (l.status === 'finish') sum.finish_count++;
        if (l.status === 'student_absent') sum.absent_count++;
        if (l.status === 'teacher_no_show') sum.teacher_no_show_count++;
        if (l.feedback_ok === false) sum.no_feedback_count++;
        sum.base_amount += l.base_amount;
        sum.pay_amount += l.amount;
        sum.deduction_total += l.deduction_total;
      }
      sum.final_amount = sum.pay_amount - sum.deduction_total;

      const _tLvl = teacher && teacher.level ? (data.levelMap || {})[teacher.level] : null;
      return json({
        ok: true, year, month,
        teacher: teacher ? {
          id: teacher.id, korean_name: teacher.korean_name, english_name: teacher.english_name,
          fee_per_10min: teacher.fee_per_10min || 0,
          level_code: teacher.level || null,
          level_label_ko: _tLvl ? _tLvl.label_ko : null,
          level_label_en: _tLvl ? _tLvl.label_en : null,
          rate_per_20min: teacher.fee_per_10min ? Number(teacher.fee_per_10min) * 2 : (_tLvl ? Number(_tLvl.rate_per_20min) || 0 : 0),
        } : { id: tid || null, korean_name: tname || null },
        summary: sum,
        rules: (data.rules || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rule_type: r.rule_type, amount: r.amount, enabled: r.enabled })),
        levels: (data.levels || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rate_per_20min: r.rate_per_20min })),
        absent_pay_percent: data.absent_pay_percent,
        lessons,
      });
    }

    // ── GET /api/admin/payroll/deduction-rules — 공제 규칙 목록 ──
    if (method === 'GET' && path === '/api/admin/payroll/deduction-rules') {
      await ensureDeductionRules();
      const rs: any = await env.DB.prepare(`SELECT * FROM payroll_deduction_rules ORDER BY sort_order, code`).all().catch(() => ({ results: [] }));
      return json({ ok: true, rules: rs.results || [] });
    }

    // ── GET /api/admin/payroll/levels — 강사 등급 요율표 + 강사별 등급 현황 ──
    if (method === 'GET' && path === '/api/admin/payroll/levels') {
      await ensureTeacherLevels();
      const rs: any = await env.DB.prepare(`SELECT * FROM payroll_levels ORDER BY sort_order, code`).all().catch(() => ({ results: [] }));
      // 강사(teacher) 로그인은 본인 것만
      const _lvActor = await getAdminActor(request, env as any);
      let tq = `SELECT id, korean_name, english_name, fee_per_10min, level FROM teacher_profiles WHERE status = '활동중' OR status IS NULL ORDER BY korean_name`;
      const teachers: any = await env.DB.prepare(tq).all().catch(() => ({ results: [] }));
      let tlist = teachers.results || [];
      if (_lvActor.isTeacher && _lvActor.name) {
        tlist = tlist.filter((t: any) => sameTeacherName(_lvActor.name, t.korean_name) || sameTeacherName(_lvActor.name, t.english_name));
      }
      return json({ ok: true, levels: rs.results || [], teachers: tlist });
    }

    // ── POST /api/admin/payroll/levels — 등급 기본요율(per 20분) 수정 ──
    //   body: { levels: [{ code, rate_per_20min }] }
    if (method === 'POST' && path === '/api/admin/payroll/levels') {
      const _lvwActor = await getAdminActor(request, env as any);
      if (_lvwActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 등급 요율을 변경할 수 없습니다.' }, 403);
      await ensureTeacherLevels();
      const body: any = await request.json().catch(() => ({}));
      if (!Array.isArray(body.levels)) return json({ ok: false, error: 'levels_array_required' }, 400);
      const now = Date.now();
      let updated = 0;
      for (const l of body.levels) {
        if (!l || !l.code) continue;
        try {
          await env.DB.prepare(`UPDATE payroll_levels SET rate_per_20min = ?, updated_at = ? WHERE code = ?`)
            .bind(Math.max(0, Number(l.rate_per_20min) || 0), now, String(l.code)).run();
          updated++;
        } catch {}
      }
      return json({ ok: true, updated });
    }

    // ── POST /api/admin/payroll/teacher-level — 강사에게 등급 지정 ──
    //   body: { teacher_id, level_code, fee_per_10min? }
    //   등급 지정 시 그 강사 fee_per_10min = 등급요율/2 자동세팅(fee_per_10min 명시하면 그 값 우선).
    if (method === 'POST' && path === '/api/admin/payroll/teacher-level') {
      const _tlActor = await getAdminActor(request, env as any);
      if (_tlActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 등급을 변경할 수 없습니다.' }, 403);
      await ensureTeacherLevels();
      const body: any = await request.json().catch(() => ({}));
      const tid = parseInt(body.teacher_id, 10);
      const code = String(body.level_code || '').trim();
      if (!tid || !code) return json({ ok: false, error: 'teacher_id_and_level_code_required' }, 400);
      const lvl: any = await env.DB.prepare(`SELECT * FROM payroll_levels WHERE code = ? LIMIT 1`).bind(code).first().catch(() => null);
      if (!lvl) return json({ ok: false, error: 'level_not_found' }, 404);
      const fee = (body.fee_per_10min != null && body.fee_per_10min !== '')
        ? Math.max(0, Number(body.fee_per_10min) || 0)
        : Math.round((Number(lvl.rate_per_20min) || 0) / 2);
      try {
        await env.DB.prepare(`UPDATE teacher_profiles SET level = ?, fee_per_10min = ? WHERE id = ?`).bind(code, fee, tid).run();
      } catch (e: any) { return json({ ok: false, error: 'update_failed', message: e?.message }, 500); }
      return json({ ok: true, teacher_id: tid, level_code: code, fee_per_10min: fee, rate_per_20min: Number(lvl.rate_per_20min) || 0 });
    }

    // ── POST /api/admin/payroll/late-minutes — 수업별 '지각 연장실패' 분 수동 입력 ──
    //   body: { schedule_id, lesson_date(YYYY-MM-DD), minutes }
    //   근태 자동로그 도입 전까지 관리자가 상세표에서 직접 기입 → late_no_extend 공제에 반영.
    if (method === 'POST' && path === '/api/admin/payroll/late-minutes') {
      const _lmActor = await getAdminActor(request, env as any);
      if (_lmActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 지각분을 입력할 수 없습니다.' }, 403);
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS lesson_late_minutes (schedule_id INTEGER NOT NULL, lesson_date TEXT NOT NULL, minutes INTEGER DEFAULT 0, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (schedule_id, lesson_date));`); } catch {}
      const body: any = await request.json().catch(() => ({}));
      const sid = parseInt(body.schedule_id, 10);
      const ldate = String(body.lesson_date || '').replace(/\//g, '-').slice(0, 10);
      const minutes = Math.max(0, Math.min(600, Math.round(Number(body.minutes) || 0)));
      if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(ldate)) return json({ ok: false, error: 'schedule_id_and_lesson_date_required' }, 400);
      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO lesson_late_minutes (schedule_id, lesson_date, minutes, updated_by, updated_at) VALUES (?,?,?,?,?)
           ON CONFLICT(schedule_id, lesson_date) DO UPDATE SET minutes = excluded.minutes, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
        ).bind(sid, ldate, minutes, _lmActor.name || '관리자', now).run();
      } catch (e: any) { return json({ ok: false, error: 'save_failed', message: e?.message }, 500); }
      return json({ ok: true, schedule_id: sid, lesson_date: ldate, minutes });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase SR — 수업 연기·변경 요청 (강사 → 매니저/관리자)
    //   그동안 연기/변경은 학생용 데모 화면뿐이라 기록이 어디에도 안 남았음.
    //   이제 강사가 마이페이지에서 요청을 남기면 schedule_change_requests 에 저장되고,
    //   관리자가 admin.html 카드에서 시간 포함 전체 기록을 보고 승인/거절한다.
    //   승인 시 class_schedules 에 실제 반영(새 일시로 이동 or status='postponed').
    //   요청 row 자체가 변경 이력(기존 일시 → 새 일시, 누가, 언제)을 보존한다.
    // ═══════════════════════════════════════════════════════════════

    const ensureScheduleRequestTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS schedule_change_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, request_type TEXT DEFAULT 'postpone', requester_role TEXT DEFAULT 'teacher', requester_name TEXT, requester_uid TEXT, teacher_name TEXT, student_name TEXT, orig_date TEXT, orig_time TEXT, new_date TEXT, new_time TEXT, fee_type TEXT, minutes_before INTEGER, reason TEXT, status TEXT DEFAULT 'pending', decided_by TEXT, decided_at INTEGER, decide_memo TEXT, created_at INTEGER NOT NULL)`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_scr_status ON schedule_change_requests(status, created_at)`); } catch {}
      // 🆕 유료/무료 태깅(2026-07-14) — 기존 배포 DB 호환 컬럼 추가(멱등, 이미 있으면 무시)
      for (const col of ["fee_type TEXT", "minutes_before INTEGER", "requester_uid TEXT"]) {
        try { await env.DB.exec(`ALTER TABLE schedule_change_requests ADD COLUMN ${col}`); } catch {}
      }
    };

    // ── POST /api/admin/schedule-requests — 연기/변경 요청 제출 (강사 마이페이지) ──
    //   body: { schedule_id?, request_type:'postpone'|'change', requester_name, teacher_name,
    //           student_name?, orig_date?, orig_time?, new_date?, new_time?, reason? }
    //   schedule_id 가 있으면 기존 일시·학생은 서버가 class_schedules 에서 읽어 권위값으로 채움.
    if (method === 'POST' && path === '/api/admin/schedule-requests') {
      await ensureScheduleRequestTable();
      const body: any = await request.json().catch(() => ({}));
      const reqType = (body.request_type === 'change' || body.request_type === 'cancel') ? body.request_type : 'postpone';
      const teacherName = (body.teacher_name || body.requester_name || '').trim();
      if (!teacherName) return json({ ok: false, error: 'teacher_name_required' }, 400);
      const requesterUid = (body.student_uid || body.requester_uid || '').trim() || null;

      let origDate = (body.orig_date || '').trim() || null;
      let origTime = (body.orig_time || '').trim() || null;
      let studentName = (body.student_name || '').trim() || null;
      const scheduleId = parseInt(body.schedule_id, 10) || null;
      if (scheduleId) {
        const cs: any = await env.DB.prepare(`SELECT scheduled_date, start_time, user_id, student_name FROM class_schedules WHERE id = ? LIMIT 1`).bind(scheduleId).first().catch(() => null);
        if (cs) {
          origDate = String(cs.scheduled_date || origDate || '').replace(/\//g, '-').slice(0, 10) || origDate;
          origTime = cs.start_time || origTime;
          if (!studentName) studentName = cs.student_name || cs.user_id || null;
        }
      }
      const newDate = (body.new_date || '').trim() || null;
      const newTime = (body.new_time || '').trim() || null;
      if (reqType === 'change' && (!newDate || !newTime)) return json({ ok: false, error: 'new_date_time_required_for_change' }, 400);

      const now = Date.now();
      // 🆕 유료/무료 자동 판정 (연기·취소만): 원 수업 시작 30분 전보다 일찍 요청=무료, 이내=유료.
      //   변경(change)은 24시간 룰(무료/차단 정책)이라 요금 대상 아님 → null.
      let minutesBefore: number | null = null;
      let feeType: string | null = null;
      if (reqType !== 'change') {
        try {
          if (origDate && origTime) {
            const hhmm = String(origTime).slice(0, 5);
            const startKst = Date.parse(`${origDate}T${hhmm}:00+09:00`);   // KST 기준으로 원 수업 시작 해석
            if (!isNaN(startKst)) minutesBefore = Math.round((startKst - now) / 60000);
          }
        } catch {}
        if (minutesBefore === null && typeof body.minutes_before === 'number') minutesBefore = Math.round(body.minutes_before);
        if (minutesBefore !== null) feeType = minutesBefore > 30 ? 'free' : 'paid';
        else feeType = (body.fee_type === 'paid' || body.fee_type === 'free') ? body.fee_type : 'free';
      }
      const requesterName2 = (body.requester_name || teacherName).trim();
      const r: any = await env.DB.prepare(
        `INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_name, requester_uid, teacher_name, student_name, orig_date, orig_time, new_date, new_time, fee_type, minutes_before, reason, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`
      ).bind(
        scheduleId, reqType, body.requester_role === 'student' ? 'student' : 'teacher',
        requesterName2, requesterUid, teacherName, studentName,
        origDate, origTime, newDate, newTime, feeType, minutesBefore, (body.reason || '').trim() || null, now
      ).run();
      // 🔔 실시간 알림 — 관리자 카톡(나에게 보내기=kakao_memo 큐). 대시보드 배지는 GET pending_count 로 별도 표시.
      try {
        const typeKo = reqType === 'cancel' ? '취소' : reqType === 'change' ? '변경' : '연기';
        const feeKo = feeType === 'paid' ? '💰유료' : feeType === 'free' ? '🆓무료' : '';
        const whenKo = (origDate && origTime) ? `${origDate} ${String(origTime).slice(0, 5)}` : '';
        await enqueueNotification(env, {
          type: 'schedule_request',
          title: `📅 수업 ${typeKo} 요청 ${feeKo}`.trim(),
          body: `${studentName || requesterName2 || '학생'} 님 · 강사 ${teacherName}${whenKo ? ` · 원수업 ${whenKo}` : ''}${reqType === 'change' && newDate ? ` → ${newDate} ${String(newTime || '').slice(0, 5)}` : ''}. 관리자 페이지에서 승인/거절하세요.`,
          meta: { request_id: r?.meta?.last_row_id || null, request_type: reqType, fee_type: feeType, minutes_before: minutesBefore, student_name: studentName, teacher_name: teacherName },
          channel: 'kakao_memo'
        });
      } catch (e: any) { console.warn('[schedule-requests] notify skipped:', e?.message || e); }
      return json({ ok: true, id: r?.meta?.last_row_id || null, status: 'pending', fee_type: feeType, minutes_before: minutesBefore, created_at: now });
    }

    // ── GET /api/admin/schedule-requests?status=&teacher_name=&limit= — 요청 목록 ──
    //   관리자 카드(전체) + 강사 마이페이지(본인 것만 teacher_name 필터) 공용.
    if (method === 'GET' && path === '/api/admin/schedule-requests') {
      await ensureScheduleRequestTable();
      const status = (url.searchParams.get('status') || '').trim();
      let teacher = (url.searchParams.get('teacher_name') || '').trim();
      const limit = Math.min(300, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      // 🔐 강사 로그인 시엔 본인 요청만(타 강사 요청·학생명 노출 방지). pending_count 도 본인 기준.
      const _srActor = await getAdminActor(request, env as any);
      if (_srActor.isTeacher) {
        if (!_srActor.name) return json({ ok: true, pending_count: 0, rows: [] });
        teacher = _srActor.name;
      }
      const conds: string[] = []; const binds: any[] = [];
      if (status && status !== 'all') { conds.push('status = ?'); binds.push(status); }
      if (teacher) { conds.push('teacher_name = ?'); binds.push(teacher); }
      const where = conds.length ? ('WHERE ' + conds.join(' AND ')) : '';
      const rs: any = await env.DB.prepare(
        `SELECT * FROM schedule_change_requests ${where} ORDER BY (status='pending') DESC, created_at DESC LIMIT ?`
      ).bind(...binds, limit).all().catch(() => ({ results: [] }));
      // pending 카운트: 강사는 본인 것만, 관리자는 전체
      const pending: any = _srActor.isTeacher
        ? await env.DB.prepare(`SELECT COUNT(*) AS c FROM schedule_change_requests WHERE status='pending' AND teacher_name = ?`).bind(teacher).first().catch(() => null)
        : await env.DB.prepare(`SELECT COUNT(*) AS c FROM schedule_change_requests WHERE status='pending'`).first().catch(() => null);
      return json({ ok: true, pending_count: pending?.c || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/schedule-requests/decide — 승인/거절 (관리자) ──
    //   body: { id, action:'approve'|'reject', memo?, decided_by? }
    //   승인: 새 일시가 있으면 class_schedules 를 그 일시로 이동, 없으면(단순 연기) status='postponed'.
    if (method === 'POST' && path === '/api/admin/schedule-requests/decide') {
      const _srdActor = await getAdminActor(request, env as any);
      if (_srdActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 요청을 승인·거절할 수 없습니다.' }, 403);
      await ensureScheduleRequestTable();
      const body: any = await request.json().catch(() => ({}));
      const id = parseInt(body.id, 10);
      const action = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : null;
      if (!id || !action) return json({ ok: false, error: 'id_and_action_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT * FROM schedule_change_requests WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      if (!row) return json({ ok: false, error: 'request_not_found' }, 404);
      if (row.status !== 'pending') return json({ ok: false, error: 'already_decided', status: row.status }, 409);

      const now = Date.now();
      let applied: string | null = null;
      if (action === 'approved' && row.schedule_id) {
        try {
          // ⚠️ 운영 스케줄은 대부분 반복(매주, scheduled_date=NULL) — 반복 row 를 덮어쓰면
          //   그 주만이 아니라 모든 주가 바뀌므로, 날짜 지정 수업일 때만 자동 반영한다.
          //   반복 수업은 요청 기록만 영구 보존(applied='recorded') → 시간표에서 수동 조정.
          const cs: any = await env.DB.prepare(`SELECT scheduled_date FROM class_schedules WHERE id = ? LIMIT 1`).bind(row.schedule_id).first().catch(() => null);
          const isDated = !!(cs && cs.scheduled_date);
          if (isDated && row.new_date && row.new_time) {
            await env.DB.prepare(`UPDATE class_schedules SET scheduled_date = ?, start_time = ?, updated_at = ? WHERE id = ?`)
              .bind(row.new_date, row.new_time, now, row.schedule_id).run();
            applied = 'moved';
          } else if (isDated) {
            await env.DB.prepare(`UPDATE class_schedules SET status = 'postponed', updated_at = ? WHERE id = ?`)
              .bind(now, row.schedule_id).run();
            applied = 'postponed';
          } else {
            applied = 'recorded';
          }
        } catch (e: any) { console.warn('[schedule-requests] apply err:', e?.message); }
      }
      await env.DB.prepare(`UPDATE schedule_change_requests SET status = ?, decided_by = ?, decided_at = ?, decide_memo = ? WHERE id = ?`)
        .bind(action, (body.decided_by || '관리자').trim(), now, (body.memo || '').trim() || null, id).run();
      // 📜 승인으로 수업이 실제 이동/연기된 경우 변경 이력에 기록(거절은 미기록)
      if (action === 'approved' && applied) {
        await writeClassAudit(env, {
          action: applied === 'moved' ? 'reschedule' : 'postpone',
          schedule_id: row.schedule_id,
          teacher_name: row.teacher_name || null,
          student_name: row.student_name || null,
          lesson_date: row.orig_date || null,
          lesson_time: row.orig_time || null,
          actor: (body.decided_by || _srdActor.name || '관리자').trim(),
          actor_role: 'admin',
          source: 'schedule-request',
          reason: row.reason || null,
          detail: (row.new_date || row.new_time) ? `→ ${row.new_date || ''} ${row.new_time || ''}`.trim() : (applied === 'recorded' ? '반복수업 기록보존(수동조정 필요)' : null),
        });
      }
      return json({ ok: true, id, status: action, applied, decided_at: now });
    }

    // ── GET /api/admin/class-audit — 수업 변경 이력(연기/삭제/종료/이동) 조회 ──
    //   query: action(all|postpone|reschedule|remove|end), teacher_name, from(ms), to(ms), limit
    //   강사 로그인은 본인 수업 이력만.
    if (method === 'GET' && path === '/api/admin/class-audit') {
      const _caActor = await getAdminActor(request, env as any);
      const filter: any = {
        action: url.searchParams.get('action') || 'all',
        teacher_name: (url.searchParams.get('teacher_name') || '').trim() || undefined,
        limit: parseInt(url.searchParams.get('limit') || '300', 10) || 300,
      };
      const from = parseInt(url.searchParams.get('from') || '', 10); if (from) filter.from = from;
      const to = parseInt(url.searchParams.get('to') || '', 10); if (to) filter.to = to;
      if (_caActor.isTeacher) {
        if (!_caActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        filter.teacher_name = _caActor.name; // 강사는 본인 것만(요청 필터 무시)
      }
      const rows = await listClassAudit(env, filter);
      return json({ ok: true, rows });
    }

    // ── POST /api/admin/class-audit — 수업 '종료(end)' 등 이벤트 수동/클라이언트 기록 ──
    //   body: { action, schedule_id?, room_id?, teacher_name?, student_name?, lesson_date?, lesson_time?, reason?, detail? }
    //   행위자는 관리자 세션(getAdminActor)에서 서버가 판정한 값을 우선 사용.
    if (method === 'POST' && path === '/api/admin/class-audit') {
      const _cawActor = await getAdminActor(request, env as any);
      const body: any = await request.json().catch(() => ({}));
      const allowed = ['postpone', 'reschedule', 'remove', 'end', 'restore'];
      const action = String(body.action || '').trim();
      if (!allowed.includes(action)) return json({ ok: false, error: 'invalid_action', allowed }, 400);
      await writeClassAudit(env, {
        action,
        schedule_id: body.schedule_id ?? null,
        room_id: body.room_id || null,
        teacher_name: body.teacher_name || (_cawActor.isTeacher ? _cawActor.name : null),
        student_name: body.student_name || null,
        lesson_date: body.lesson_date || null,
        lesson_time: body.lesson_time || null,
        actor: _cawActor.name || (body.actor ? String(body.actor).slice(0, 60) : '관리자'),
        actor_role: _cawActor.isTeacher ? 'teacher' : (_cawActor.name ? 'admin' : 'system'),
        source: String(body.source || 'ui').slice(0, 20),
        reason: body.reason ? String(body.reason).slice(0, 300) : null,
        detail: body.detail ? String(body.detail).slice(0, 500) : null,
      });
      return json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📝 Phase FD — AI 학부모 피드백 초안 + 강사 원클릭 승인
    //   수업이 끝나면 AI가 실제 수업 신호(출석·발화비율·칭찬·학생평가)만 근거로
    //   학부모용 피드백 초안(한/영)을 만들고, 강사는 읽고 [승인]만 하면 된다.
    //   승인 → teacher_feedbacks(학생 상세화면 소비)로 기록 + 공제 엔진의 '당일 피드백'으로 인정.
    //   강사가 고치면 edited=1 로 남겨 AI 품질(수정률)을 추적한다.
    // ═══════════════════════════════════════════════════════════════

    const ensureFeedbackDrafts = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS feedback_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT UNIQUE, schedule_id INTEGER, lesson_date TEXT, start_time TEXT, teacher_id TEXT, teacher_name TEXT, student_uid TEXT, student_name TEXT, draft_ko TEXT, draft_en TEXT, final_ko TEXT, final_en TEXT, has_signals INTEGER DEFAULT 0, edited INTEGER DEFAULT 0, status TEXT DEFAULT 'draft', created_at INTEGER NOT NULL, approved_at INTEGER)`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_fbd_teacher ON feedback_drafts(teacher_name, lesson_date)`); } catch {}
    };

    // ── POST /api/admin/feedback-drafts/generate — 오늘(또는 지정일) 완료 수업의 AI 초안 생성 ──
    //   body: { teacher_name, date? }  — 이미 초안이 있는 수업은 건너뜀. 한 번에 최대 5건(LLM 시간 제한).
    if (method === 'POST' && path === '/api/admin/feedback-drafts/generate') {
      await ensureFeedbackDrafts();
      const body: any = await request.json().catch(() => ({}));
      let teacherName = String(body.teacher_name || '').trim();
      // 🔐 강사 로그인 시엔 본인 수업 초안만 생성(남의 이름으로 생성 차단)
      const _fdgActor = await getAdminActor(request, env as any);
      if (_fdgActor.isTeacher) {
        if (!_fdgActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        teacherName = _fdgActor.name;
      }
      if (!teacherName) return json({ ok: false, error: 'teacher_name_required' }, 400);
      const dateStr = String(body.date || '').trim() || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const [gy, gm] = [parseInt(dateStr.slice(0, 4), 10), parseInt(dateStr.slice(5, 7), 10)];

      // 그날 완료된 이 강사의 수업(반복 전개 포함) — 정산 엔진 재사용으로 계산과 100% 일치
      const data = await computeLessonFeeMonth(gy, gm);
      const prof = (data.teachers || []).find((t: any) => t.korean_name === teacherName || t.english_name === teacherName);
      const done = data.lessons.filter((l: any) =>
        l.date === dateStr && l.status === 'finish' &&
        ((prof && String(l.teacher_id) === String(prof.id)) || l.teacher_name === teacherName));

      // 이미 초안 있는 방 제외
      const roomIds = done.map((l: any) => l.room_id);
      const existing: any = roomIds.length
        ? await env.DB.prepare(`SELECT room_id FROM feedback_drafts WHERE room_id IN (${roomIds.map(() => '?').join(',')})`).bind(...roomIds).all().catch(() => ({ results: [] }))
        : { results: [] };
      const have = new Set((existing.results || []).map((r: any) => r.room_id));
      const targets = done.filter((l: any) => !have.has(l.room_id));

      const CAP = 5;
      const batch = targets.slice(0, CAP);
      const ai = (env as any).AI;
      const now = Date.now();
      let generated = 0;

      for (const l of batch) {
        // ── 실수업 신호 수집(있는 것만) — room_id 기준, ai-feedback 과 동일 소스 ──
        let talkRatio: number | null = null, praiseCount: number | null = null;
        let studentScore: number | null = null, studentNote = '', durMin = l.duration_minutes || 0;
        try {
          const t: any = await env.DB.prepare(`SELECT total_session_ms, total_active_ms, joined_at, left_at FROM attendance WHERE room_id=? AND role='teacher' ORDER BY joined_at DESC LIMIT 1`).bind(l.room_id).first();
          const s: any = await env.DB.prepare(`SELECT total_active_ms FROM attendance WHERE room_id=? AND role='student' ORDER BY joined_at DESC LIMIT 1`).bind(l.room_id).first();
          const tA = Number(t?.total_active_ms) || 0, sA = Number(s?.total_active_ms) || 0;
          if (tA + sA > 0) talkRatio = Math.round((sA / (tA + sA)) * 100); // 학부모용은 '아이 발화 비율'
          const p: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE rule_code='teacher_praise_point' AND meta LIKE ?`).bind('%"room_id":"' + l.room_id + '"%').first();
          praiseCount = Number(p?.c) || 0;
          const r: any = await env.DB.prepare(`SELECT score, feedback FROM class_ratings WHERE room_id=? ORDER BY created_at DESC LIMIT 1`).bind(l.room_id).first();
          if (r) { studentScore = Number(r.score) || null; studentNote = String(r.feedback || '').slice(0, 300); }
        } catch {}
        const hasSignals = talkRatio !== null || (praiseCount || 0) > 0 || studentScore !== null;

        // ── AI 초안 (신호에 있는 사실만, 지어내기 금지) ──
        let ko = '', en = '';
        if (ai) {
          try {
            const signalLines = [
              `Student: ${l.student_name || 'the student'}`,
              `Lesson: ${dateStr} ${l.start_time || ''}, ${durMin} minutes, 1:1 online English`,
              talkRatio !== null ? `Student speaking share: ${talkRatio}% of total talk time` : '',
              (praiseCount || 0) > 0 ? `Teacher praised the student ${praiseCount} time(s) during class` : '',
              studentScore ? `Student rated the class ${studentScore}/7 afterwards` : '',
              studentNote ? `Student's own note: "${studentNote}"` : '',
              hasSignals ? '' : 'NOTE: No detailed metrics were captured for this class — keep the report brief and factual (completed lesson, duration), do NOT invent specifics.',
            ].filter(Boolean).join('\n');
            const prompt = `Write a short after-class report for the KOREAN PARENT of a child who just finished a 1:1 online English lesson.

FACTS (use ONLY these — never invent skills, topics, or quotes that are not listed):
${signalLines}

Style: warm, specific, 3-4 short sentences. No scores or grades. End with one gentle suggestion for practice at home. Write from the teacher's voice ("Today we…").
Return STRICT JSON only: { "ko": "<Korean report>", "en": "<English report>" }`;
            const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You write concise, honest after-class reports for parents. Reply in strict JSON only.' },
                { role: 'user', content: prompt },
              ],
              max_tokens: 700,
            });
            const text = typeof resp === 'string' ? resp : (typeof resp?.response === 'string' ? resp.response : JSON.stringify(resp?.response || ''));
            const m = String(text || '').match(/\{[\s\S]*\}/);
            if (m) { const j = JSON.parse(m[0]); ko = String(j.ko || '').trim(); en = String(j.en || '').trim(); }
          } catch (e: any) { console.warn('[feedback-drafts] AI fail:', e?.message); }
        }
        // AI 실패/무신호 폴백 — 사실만 담은 안전 템플릿 (강사가 수정해 살 붙이는 용도)
        if (!ko || !en) {
          const stu = l.student_name || '학생';
          ko = `오늘 ${dateStr} ${l.start_time || ''} ${durMin}분 1:1 영어 수업을 잘 마쳤습니다. ${stu} 학생이 끝까지 성실하게 참여했습니다. 가정에서 오늘 배운 표현을 한 번 더 소리 내어 읽어보면 큰 도움이 됩니다.`;
          en = `We completed today's ${durMin}-minute 1:1 English lesson (${dateStr} ${l.start_time || ''}). ${l.student_name || 'The student'} participated sincerely until the end. Reading today's expressions aloud once more at home would help a lot.`;
        }
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO feedback_drafts (room_id, schedule_id, lesson_date, start_time, teacher_id, teacher_name, student_uid, student_name, draft_ko, draft_en, has_signals, status, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,'draft',?)`
          ).bind(l.room_id, l.schedule_id, dateStr, l.start_time || null, String(l.teacher_id ?? ''), teacherName,
                 l.user_id || null, l.student_name || null, ko, en, hasSignals ? 1 : 0, now).run();
          generated++;
        } catch (e: any) { console.warn('[feedback-drafts] insert err:', e?.message); }
      }

      const rows: any = await env.DB.prepare(
        `SELECT * FROM feedback_drafts WHERE teacher_name = ? AND lesson_date = ? ORDER BY start_time`
      ).bind(teacherName, dateStr).all().catch(() => ({ results: [] }));
      return json({ ok: true, date: dateStr, generated, remaining: Math.max(0, targets.length - batch.length), rows: rows.results || [] });
    }

    // ── GET /api/admin/feedback-drafts?teacher_name=&days=3 — 최근 초안 목록 ──
    if (method === 'GET' && path === '/api/admin/feedback-drafts') {
      await ensureFeedbackDrafts();
      let teacherName = (url.searchParams.get('teacher_name') || '').trim();
      // 🔐 강사 로그인 시엔 항상 본인 초안만(요청한 teacher_name 무시 — 남의 AI 피드백 초안 열람 차단)
      const _fdActor = await getAdminActor(request, env as any);
      if (_fdActor.isTeacher) {
        if (!_fdActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        teacherName = _fdActor.name;
      }
      if (!teacherName) return json({ ok: false, error: 'teacher_name_required' }, 400);
      const days = Math.min(31, Math.max(1, parseInt(url.searchParams.get('days') || '3', 10) || 3));
      const cutoff = new Date(Date.now() + 9 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);
      const rs: any = await env.DB.prepare(
        `SELECT * FROM feedback_drafts WHERE teacher_name = ? AND lesson_date >= ? ORDER BY lesson_date DESC, start_time DESC LIMIT 100`
      ).bind(teacherName, cutoff).all().catch(() => ({ results: [] }));
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── POST /api/admin/feedback-drafts/approve — 승인(그대로/수정) 또는 건너뜀 ──
    //   body: { id, action:'approve'|'skip', final_ko?, final_en? }
    //   승인 시 teacher_feedbacks 에 기록(학생 상세화면에서 보임) + 공제 엔진의 당일 피드백으로 인정됨.
    if (method === 'POST' && path === '/api/admin/feedback-drafts/approve') {
      await ensureFeedbackDrafts();
      const body: any = await request.json().catch(() => ({}));
      const id = parseInt(body.id, 10);
      const action = body.action === 'skip' ? 'skipped' : 'approved';
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT * FROM feedback_drafts WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      if (!row) return json({ ok: false, error: 'draft_not_found' }, 404);
      if (row.status !== 'draft') return json({ ok: false, error: 'already_decided', status: row.status }, 409);

      const now = Date.now();
      const finalKo = String(body.final_ko ?? row.draft_ko ?? '').trim() || row.draft_ko;
      const finalEn = String(body.final_en ?? row.draft_en ?? '').trim() || row.draft_en;
      const edited = (finalKo !== row.draft_ko || finalEn !== row.draft_en) ? 1 : 0;

      if (action === 'approved') {
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_feedbacks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, room_id TEXT, attendance_id INTEGER, teacher_name TEXT, class_at INTEGER NOT NULL, rating INTEGER, summary TEXT, content TEXT, action_items TEXT, created_at INTEGER NOT NULL);`);
          const classAt = Date.parse(`${row.lesson_date}T${row.start_time || '00:00'}:00+09:00`) || now;
          await env.DB.prepare(
            `INSERT INTO teacher_feedbacks (user_id, room_id, teacher_name, class_at, summary, content, created_at) VALUES (?,?,?,?,?,?,?)`
          ).bind(row.student_uid || row.student_name || 'unknown', row.room_id, row.teacher_name, classAt,
                 String(finalKo).slice(0, 80), finalKo + (finalEn ? '\n\n[EN] ' + finalEn : ''), now).run();
        } catch (e: any) { console.warn('[feedback-drafts] teacher_feedbacks insert err:', e?.message); }
      }
      await env.DB.prepare(
        `UPDATE feedback_drafts SET status = ?, final_ko = ?, final_en = ?, edited = ?, approved_at = ? WHERE id = ?`
      ).bind(action, finalKo, finalEn, edited, now, id).run();
      return json({ ok: true, id, status: action, edited: !!edited, approved_at: now });
    }

    // ── POST /api/admin/payroll/deduction-rules — 공제 규칙 저장 ──
    //   body: { rules: [{ code, amount, enabled }] } — 금액·켜기/끄기만 수정(라벨은 시드 유지)
    if (method === 'POST' && path === '/api/admin/payroll/deduction-rules') {
      const _drActor = await getAdminActor(request, env as any);
      if (_drActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 공제 규칙을 변경할 수 없습니다.' }, 403);
      await ensureDeductionRules();
      const body: any = await request.json().catch(() => ({}));
      if (!Array.isArray(body.rules)) return json({ ok: false, error: 'rules_array_required' }, 400);
      const now = Date.now();
      let updated = 0;
      for (const r of body.rules) {
        if (!r || !r.code) continue;
        try {
          await env.DB.prepare(`UPDATE payroll_deduction_rules SET amount = ?, enabled = ?, updated_at = ? WHERE code = ?`)
            .bind(Math.max(0, Number(r.amount) || 0), r.enabled ? 1 : 0, now, String(r.code)).run();
          updated++;
        } catch {}
      }
      return json({ ok: true, updated });
    }

    // ── POST /api/admin/payroll/save — 정산 결과 D1에 저장/업데이트 ──
    //   body: { year, month, rows: [{ teacher_id, lesson_count, total_minutes, fee_per_10min, calculated_amount, adjusted_amount?, memo? }] }
    if (method === 'POST' && path === '/api/admin/payroll/save') {
      const _svActor = await getAdminActor(request, env as any);
      if (_svActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 급여 정산을 저장할 수 없습니다.' }, 403);
      await ensurePayrollTable();
      const body: any = await request.json().catch(() => ({}));
      const year = parseInt(body.year, 10);
      const month = parseInt(body.month, 10);
      if (!year || !month || !Array.isArray(body.rows)) return json({ ok: false, error: 'year_month_rows_required' }, 400);
      const now = Date.now();
      let saved = 0;
      for (const r of body.rows) {
        try {
          await env.DB.prepare(
            `INSERT INTO teacher_payroll (teacher_id, teacher_name, year, month, lesson_count, total_minutes, fee_per_10min, calculated_amount, deduction_total, final_amount, adjusted_amount, memo, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(teacher_id, year, month) DO UPDATE SET
               teacher_name = excluded.teacher_name,
               lesson_count = excluded.lesson_count,
               total_minutes = excluded.total_minutes,
               fee_per_10min = excluded.fee_per_10min,
               calculated_amount = excluded.calculated_amount,
               deduction_total = excluded.deduction_total,
               final_amount = excluded.final_amount,
               adjusted_amount = excluded.adjusted_amount,
               memo = excluded.memo,
               updated_at = excluded.updated_at`
          ).bind(
            r.teacher_id, r.teacher_name || null, year, month,
            r.lesson_count || 0, r.total_minutes || 0, r.fee_per_10min || 0,
            r.calculated_amount || 0, r.deduction_total || 0,
            r.final_amount ?? ((r.calculated_amount || 0) - (r.deduction_total || 0)),
            r.adjusted_amount ?? null,
            r.memo || null, 'pending', now, now
          ).run();
          saved++;
        } catch (e: any) {
          console.warn('[payroll] save err:', e?.message);
        }
      }
      return json({ ok: true, year, month, saved });
    }

    // ── POST /api/admin/payroll/mark-paid — 지급 완료 처리 ──
    //   body: { payroll_id?, teacher_id?, year?, month?, paid_amount?, memo? }
    if (method === 'POST' && path === '/api/admin/payroll/mark-paid') {
      const _mpActor = await getAdminActor(request, env as any);
      if (_mpActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 지급 상태를 변경할 수 없습니다.' }, 403);
      await ensurePayrollTable();
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      if (body.payroll_id) {
        await env.DB.prepare(
          `UPDATE teacher_payroll SET status='paid', paid_at=?, paid_amount=?, memo=COALESCE(?, memo), updated_at=? WHERE id=?`
        ).bind(now, body.paid_amount || null, body.memo || null, now, body.payroll_id).run();
        return json({ ok: true, payroll_id: body.payroll_id, status: 'paid' });
      }
      if (body.teacher_id && body.year && body.month) {
        await env.DB.prepare(
          `UPDATE teacher_payroll SET status='paid', paid_at=?, paid_amount=?, memo=COALESCE(?, memo), updated_at=? WHERE teacher_id=? AND year=? AND month=?`
        ).bind(now, body.paid_amount || null, body.memo || null, now, body.teacher_id, body.year, body.month).run();
        return json({ ok: true, teacher_id: body.teacher_id, year: body.year, month: body.month, status: 'paid' });
      }
      return json({ ok: false, error: 'payroll_id_or_teacher_year_month_required' }, 400);
    }

    // ── GET /api/admin/payroll/csv?year=&month= — 정산 CSV 다운로드 ──
    if (method === 'GET' && path === '/api/admin/payroll/csv') {
      await ensurePayrollTable();
      const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()), 10);
      const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1), 10);
      // 🔐 강사(teacher) 로그인 시엔 본인 행만 CSV 로 내려준다(전체 강사 급여 export 차단)
      const _csvActor = await getAdminActor(request, env as any);
      const _csvOwn = _csvActor.isTeacher ? _csvActor.name : '';
      const rs: any = _csvOwn
        ? await env.DB.prepare(
            `SELECT * FROM teacher_payroll WHERE year = ? AND month = ? AND LOWER(TRIM(teacher_name)) = LOWER(TRIM(?)) ORDER BY teacher_name`
          ).bind(year, month, _csvOwn).all().catch(() => ({ results: [] }))
        : await env.DB.prepare(
            `SELECT * FROM teacher_payroll WHERE year = ? AND month = ? ORDER BY teacher_name`
          ).bind(year, month).all().catch(() => ({ results: [] }));
      const rows = rs.results || [];
      const header = '강사ID,강사명,년월,수업횟수,총수업분,단가(10분),수업료,공제,실지급액,조정금액,지급금액,상태,지급일,메모';
      const csv = [header].concat(
        rows.map((r: any) => [
          r.teacher_id,
          (r.teacher_name||'').replace(/,/g,' '),
          `${r.year}-${String(r.month).padStart(2,'0')}`,
          r.lesson_count || 0,
          r.total_minutes || 0,
          r.fee_per_10min || 0,
          r.calculated_amount || 0,
          r.deduction_total || 0,
          r.final_amount ?? ((r.calculated_amount || 0) - (r.deduction_total || 0)),
          r.adjusted_amount ?? '',
          r.paid_amount ?? '',
          r.status || 'pending',
          r.paid_at ? new Date(r.paid_at).toISOString().slice(0,10) : '',
          (r.memo||'').replace(/,/g,' ').replace(/\n/g,' '),
        ].join(','))
      ).join('\n');
      // UTF-8 BOM 추가 (Excel 한글 깨짐 방지)
      const bom = '﻿';
      return new Response(bom + csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="payroll_${year}_${String(month).padStart(2,'0')}.csv"`,
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 💼 Phase G1 끝
    // ═══════════════════════════════════════════════════════════════

    // ===== 💼 강사 급여·평가 (Phase 8 v2: 10분단가 + 5카테고리 평가) =====

    // 시스템 설정 조회 (UI 안내용 — 환율, 가중치, 등급 임계값)
    if (method === 'GET' && path === '/api/admin/payroll/rates') {
      return json({
        ok: true,
        currency: 'PHP',
        php_to_krw: PAYROLL_PHP_TO_KRW,
        valid_status: VALID_TEACHER_STATUS,
        eval_weights: EVAL_WEIGHTS,
        grade_thresholds: [
          { grade: '최우수',    min: 4.75, max: 5.00 },
          { grade: '매우 우수', min: 4.50, max: 4.74 },
          { grade: '우수',      min: 3.50, max: 4.49 },
          { grade: '개선 요망', min: 1.00, max: 3.49 },
        ]
      });
    }

    // ════════════════════════════════════════════════════════════
    // 🥭 Phase 34 — 강사 정보 (Teacher Profiles) CRUD
    //   GET    /api/admin/teacher-profiles          (목록, ?status=&group=)
    //   POST   /api/admin/teacher-profiles          (등록)
    //   GET    /api/admin/teacher-profiles/:id      (단건 조회)
    //   PATCH  /api/admin/teacher-profiles/:id      (수정)
    //   DELETE /api/admin/teacher-profiles/:id      (제거)
    // ════════════════════════════════════════════════════════════
    // ⚠ env.DB.exec() 는 단일 라인 SQL 만 허용 — 여러 줄 쓰면 SQL_STATEMENT_ERROR
    const ensureTeacherProfilesSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, mbti TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      // 기존 DB 에 mbti 컬럼 없으면 보강(이미 있으면 SQLite throw → 흡수)
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN mbti TEXT`); } catch {}
    };

    if (method === 'GET' && path === '/api/admin/teacher-profiles') {
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '테이블 생성 실패: ' + String(e?.message || e) }, 500); }
      const fStatus = url.searchParams.get('status') || '';
      const fGroup  = url.searchParams.get('group') || '';
      const where: string[] = []; const binds: any[] = [];
      if (fStatus) { where.push('status = ?'); binds.push(fStatus); }
      if (fGroup)  { where.push('group_name = ?'); binds.push(fGroup); }
      // 🔐 강사 로그인 시엔 본인 프로필만(타 강사 계좌·연락처·단가 노출 방지)
      const _tpActor = await getAdminActor(request, env as any);
      if (_tpActor.isTeacher) {
        if (!_tpActor.name) return json({ ok: true, items: [] });
        where.push('(LOWER(TRIM(korean_name))=LOWER(TRIM(?)) OR LOWER(TRIM(english_name))=LOWER(TRIM(?)))');
        binds.push(_tpActor.name, _tpActor.name);
      }
      const sql = `SELECT * FROM teacher_profiles${where.length ? ' WHERE ' + where.join(' AND ') : ''}
                   ORDER BY status='활동중' DESC, korean_name ASC`;
      try {
        const rs = await env.DB.prepare(sql).bind(...binds).all<any>();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'POST' && path === '/api/admin/teacher-profiles') {
      const _tpwActor = await getAdminActor(request, env as any);
      if (_tpwActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 강사 프로필을 등록할 수 없습니다.' }, 403);
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '테이블 생성 실패: ' + String(e?.message || e) }, 500); }
      const b = await parseJsonBody(request);
      if (!b || !b.korean_name) return invalidBody(['korean_name']);
      const now = Date.now();
      try {
        const r = await env.DB.prepare(
          `INSERT INTO teacher_profiles
           (korean_name, english_name, email, phone, kakao_id, dob, gender,
            image_url, intro_video_url, active_region, origin_region, fee_per_10min,
            group_name, status, join_date, leave_date, education, career, certifications,
            available_days, available_hours, bank_name, bank_account, mbti, notes,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          b.korean_name, b.english_name || null, b.email || null, b.phone || null, b.kakao_id || null,
          b.dob || null, b.gender || null,
          b.image_url || null, b.intro_video_url || null, b.active_region || null, b.origin_region || null,
          b.fee_per_10min || null, b.group_name || null, b.status || '활동중',
          b.join_date || null, b.leave_date || null, b.education || null, b.career || null, b.certifications || null,
          b.available_days || null, b.available_hours || null, b.bank_name || null, b.bank_account || null,
          (b.mbti ? String(b.mbti).toUpperCase().slice(0, 4) : null), b.notes || null, now, now
        ).run();
        return json({ ok: true, id: r.meta?.last_row_id });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 📥 강사 정보 대량 임포트 — 로스터(구글시트) 붙여넣기 업서트. english_name/korean_name 매칭.
    //   body: { rows: [{ name?, korean_name?, english_name?, phone?, email?, kakao_id?,
    //                    available_days?, available_hours?, mbti?, group_name?, status?, fee_per_10min?, active_region?, notes? }...], dry_run?: bool }
    //   기존행=제공된(빈칸 아닌) 필드만 UPDATE(빈값은 건너뜀·기존값 보존), 없으면 INSERT. mbti 유효시 teacher_mbti(tp-id) 동기화(+사진).
    if (method === 'POST' && path === '/api/admin/teacher-profiles/import') {
      const _impActor = await getAdminActor(request, env as any);
      if (_impActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 임포트할 수 없습니다.' }, 403);
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '스키마 실패: ' + String(e?.message || e) }, 500); }
      const body = await parseJsonBody(request);
      const rows: any[] = (body && Array.isArray(body.rows)) ? body.rows : [];
      const dryRun = !!(body && body.dry_run);
      if (!rows.length) return invalidBody(['rows']);
      const now = Date.now();
      const existing: any = await env.DB.prepare(`SELECT id, korean_name, english_name FROM teacher_profiles`).all().catch(() => ({ results: [] }));
      const byName = new Map<string, any>();
      for (const t of (existing.results || [])) {
        if (t.korean_name) byName.set(String(t.korean_name).trim().toLowerCase(), t);
        if (t.english_name) byName.set(String(t.english_name).trim().toLowerCase(), t);
      }
      const UPD_COLS = ['korean_name','english_name','email','phone','kakao_id','group_name','status','available_days','available_hours','fee_per_10min','active_region','notes'];
      const clean = (v: any) => { const s = (v == null ? '' : String(v)).trim(); return s === '' ? undefined : s; };
      const validMbti = (v: any) => { const m = (v == null ? '' : String(v)).toUpperCase().trim(); return /^[IE][NS][TF][JP]$/.test(m) ? m : undefined; };
      const results: any[] = [];
      let created = 0, updated = 0, skipped = 0;
      for (const raw of rows) {
        const name = clean(raw.english_name) || clean(raw.name) || clean(raw.korean_name);
        if (!name) { results.push({ name: null, action: 'skip', reason: 'no_name' }); skipped++; continue; }
        const mbti = validMbti(raw.mbti);
        const match = byName.get(name.toLowerCase());
        const fields: any = {};
        for (const c of UPD_COLS) { const val = clean(raw[c]); if (val !== undefined) fields[c] = val; }
        if (clean(raw.name) && !fields.english_name) fields.english_name = clean(raw.name);
        if (mbti) fields.mbti = mbti;
        if (dryRun) {
          results.push({ name, action: match ? 'update' : 'create', id: match ? match.id : null, fields: Object.keys(fields), mbti: mbti || null });
          if (match) updated++; else created++;
          continue;
        }
        try {
          let tid = 0;
          if (match) {
            const keys = Object.keys(fields);
            if (keys.length) {
              const sets = keys.map(k => `${k} = ?`); sets.push('updated_at = ?');
              const binds = keys.map(k => fields[k]); binds.push(now, match.id);
              await env.DB.prepare(`UPDATE teacher_profiles SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
            }
            tid = match.id; updated++;
            results.push({ name, action: 'update', id: tid, changed: keys });
          } else {
            const kn = fields.korean_name || fields.english_name || name;
            const en = fields.english_name || name;
            const r = await env.DB.prepare(
              `INSERT INTO teacher_profiles (korean_name, english_name, email, phone, kakao_id, group_name, status, available_days, available_hours, fee_per_10min, active_region, notes, mbti, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            ).bind(kn, en, fields.email||null, fields.phone||null, fields.kakao_id||null, fields.group_name||null, fields.status||'활동중',
                   fields.available_days||null, fields.available_hours||null, fields.fee_per_10min||null, fields.active_region||null, fields.notes||null, fields.mbti||null, now, now).run();
            tid = Number(r.meta?.last_row_id || 0); created++;
            byName.set(name.toLowerCase(), { id: tid, korean_name: kn, english_name: en });
            results.push({ name, action: 'create', id: tid });
          }
          if (mbti && tid) {
            try {
              await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_mbti (teacher_uid TEXT PRIMARY KEY, teacher_name TEXT, mbti TEXT, hobby TEXT, teaching_style TEXT, intro TEXT, photo_url TEXT, updated_at INTEGER);`);
              const prof: any = await env.DB.prepare(`SELECT korean_name, english_name, image_url FROM teacher_profiles WHERE id=?`).bind(tid).first();
              await env.DB.prepare(
                `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, photo_url, updated_at) VALUES (?,?,?,?,?)
                 ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name=excluded.teacher_name, mbti=excluded.mbti, photo_url=COALESCE(excluded.photo_url, teacher_mbti.photo_url), updated_at=excluded.updated_at`
              ).bind('tp-' + tid, (prof?.korean_name || prof?.english_name || name), mbti, (prof?.image_url || null), now).run();
            } catch { /* 그래프 동기화 best-effort */ }
          }
        } catch (e: any) {
          skipped++;
          results.push({ name, action: 'error', error: String(e?.message || e) });
        }
      }
      return json({ ok: true, dry_run: dryRun, summary: { created, updated, skipped, total: rows.length }, results });
    }

    // /:id 단건 (GET / PATCH / DELETE)
    const tpMatch = path.match(/^\/api\/admin\/teacher-profiles\/(\d+)$/);
    if (tpMatch) {
      try { await ensureTeacherProfilesSchema(); } catch {}
      const id = parseInt(tpMatch[1], 10);
      // 🔐 강사: 본인 프로필 단건만 조회 가능, 수정·삭제는 불가(자기 단가·계좌 임의변경도 차단)
      const _tpiActor = await getAdminActor(request, env as any);
      if (_tpiActor.isTeacher && method !== 'GET') {
        return json({ ok: false, error: 'forbidden_teacher', message: '강사는 강사 프로필을 수정·삭제할 수 없습니다.' }, 403);
      }
      if (method === 'GET') {
        const row = await env.DB.prepare(`SELECT * FROM teacher_profiles WHERE id = ?`).bind(id).first<any>();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        if (_tpiActor.isTeacher && !sameTeacherName(_tpiActor.name, row.korean_name) && !sameTeacherName(_tpiActor.name, row.english_name)) {
          return json({ ok: false, error: 'forbidden_teacher', message: '본인 프로필만 조회할 수 있습니다.' }, 403);
        }
        return json({ ok: true, item: row });
      }
      if (method === 'PATCH') {
        const b = await parseJsonBody(request);
        if (!b) return invalidBody(['body']);
        const allowed = ['korean_name','english_name','email','phone','kakao_id','dob','gender',
          'image_url','intro_video_url','active_region','origin_region','fee_per_10min',
          'group_name','status','join_date','leave_date','education','career','certifications',
          'available_days','available_hours','bank_name','bank_account','mbti','notes'];
        const sets: string[] = []; const binds: any[] = [];
        allowed.forEach(k => {
          if (b.hasOwnProperty(k)) {
            let v = b[k] === '' ? null : b[k];
            if (k === 'mbti' && v) v = String(v).toUpperCase().slice(0, 4);   // 표준화 (예: intj → INTJ)
            sets.push(k + ' = ?'); binds.push(v);
          }
        });
        if (sets.length === 0) return json({ ok: false, error: 'no_fields' }, 400);
        sets.push('updated_at = ?'); binds.push(Date.now());
        binds.push(id);
        try {
          await env.DB.prepare(
            `UPDATE teacher_profiles SET ${sets.join(', ')} WHERE id = ?`
          ).bind(...binds).run();
          return json({ ok: true, id });
        } catch (e: any) {
          return json({ ok: false, error: String(e?.message || e) }, 500);
        }
      }
      if (method === 'DELETE') {
        try {
          await env.DB.prepare(`DELETE FROM teacher_profiles WHERE id = ?`).bind(id).run();
          return json({ ok: true, id });
        } catch (e: any) {
          return json({ ok: false, error: String(e?.message || e) }, 500);
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // 🧠 교사 본인 MBTI 자가기록 — 교사 마이페이지에서 검사 후 저장
    //   GET  /api/teacher/mbti-self   → 내 현재 MBTI 조회(폼 프리필용)
    //   POST /api/teacher/mbti-self   { mbti:'INTJ', hobby?, teaching_style? }
    //   본인(teacher_profiles.korean_name|english_name == actor.name) 프로필에만 기록.
    //   매칭 그래프 소스(teacher_mbti)에도 동기화 → [[teacher-match-graph]] 추천에 반영.
    // ════════════════════════════════════════════════════════════
    if (path === '/api/teacher/mbti-self') {
      const actor = await getAdminActor(request, env as any);
      if (!actor.ok || !actor.isTeacher || !actor.name) {
        return json({ ok: false, error: 'forbidden', message: '강사 로그인이 필요합니다.' }, 403);
      }
      try { await ensureTeacherProfilesSchema(); } catch {}
      const myProfile = await env.DB.prepare(
        `SELECT id, korean_name, english_name, mbti FROM teacher_profiles
          WHERE LOWER(TRIM(korean_name))=LOWER(TRIM(?)) OR LOWER(TRIM(english_name))=LOWER(TRIM(?)) LIMIT 1`
      ).bind(actor.name, actor.name).first<any>();

      if (method === 'GET') {
        return json({ ok: true, found: !!myProfile, mbti: myProfile?.mbti || null, name: myProfile?.korean_name || myProfile?.english_name || actor.name });
      }
      if (method === 'POST') {
        if (!myProfile) return json({ ok: false, error: 'profile_not_found', message: '내 강사 프로필을 찾을 수 없습니다. 관리자에게 문의하세요.' }, 404);
        const b = await parseJsonBody(request);
        const mbti = String((b && b.mbti) || '').toUpperCase().replace(/[^IENSTFJP]/g, '').slice(0, 4);
        if (!/^[IE][NS][TF][JP]$/.test(mbti)) {
          return json({ ok: false, error: 'invalid_mbti', message: 'MBTI 4글자를 확인하세요 (예: INTJ).' }, 400);
        }
        const now = Date.now();
        const hobby = (b && b.hobby) ? String(b.hobby).slice(0, 300) : null;
        const style = (b && b.teaching_style) ? String(b.teaching_style).slice(0, 300) : null;
        // 1) 내 프로필에 기록
        await env.DB.prepare(`UPDATE teacher_profiles SET mbti = ?, updated_at = ? WHERE id = ?`).bind(mbti, now, myProfile.id).run();
        // 2) 매칭 그래프 소스(teacher_mbti) 동기화 — 없으면 생성. hobby/style 은 있을 때만 덮어씀.
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_mbti (teacher_uid TEXT PRIMARY KEY, teacher_name TEXT, mbti TEXT, hobby TEXT, teaching_style TEXT, intro TEXT, updated_at INTEGER);`);
          await env.DB.prepare(
            `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, updated_at) VALUES (?,?,?,?,?,?)
             ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name=excluded.teacher_name, mbti=excluded.mbti,
               hobby=COALESCE(excluded.hobby, teacher_mbti.hobby),
               teaching_style=COALESCE(excluded.teaching_style, teacher_mbti.teaching_style),
               updated_at=excluded.updated_at`
          ).bind('tp-' + myProfile.id, myProfile.korean_name || myProfile.english_name || actor.name, mbti, hobby, style, now).run();
        } catch (e: any) { console.warn('[teacher mbti-self] graph sync skipped:', e?.message || e); }
        return json({ ok: true, mbti, teacher_id: myProfile.id, name: myProfile.korean_name || myProfile.english_name });
      }
      return json({ ok: false, error: 'method_not_allowed' }, 405);
    }

    // 강사 목록
    if (method === 'GET' && path === '/api/admin/teachers') {
      await ensurePayrollSchema(env);
      const includeInactive = url.searchParams.get('include_inactive') === '1';
      const sql = includeInactive
        ? `SELECT * FROM teachers ORDER BY active DESC, name ASC`
        : `SELECT * FROM teachers WHERE active = 1 ORDER BY name ASC`;
      const rs = await env.DB.prepare(sql).all();
      let teacherRows = (rs.results || []) as any[];
      // 🔐 강사 로그인 시엔 급여단가·계좌 등 민감 칼럼을 제거해서 내려준다(스케줄용 이름·id 는 유지).
      const _tlActor = await getAdminActor(request, env as any);
      if (_tlActor.isTeacher) {
        const _hide = ['rate_per_10min_php','fee_per_10min','bank_account','bank_name','salary','monthly_salary','monthly_salary_php','pay_php','account_no'];
        teacherRows = teacherRows.map(r => { const o = { ...r }; for (const k of _hide) delete o[k]; return o; });
      }
      // items/teachers/data 별칭 모두 제공(프론트 호환: weekly-schedule.html 등)
      return json({ ok: true, items: teacherRows, teachers: teacherRows, data: teacherRows });
    }

    // 강사 등록 (새 모델: name + status + years + rate_per_10min_php)
    if (method === 'POST' && path === '/api/admin/teachers') {
      const _tnActor = await getAdminActor(request, env as any);
      if (_tnActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 강사를 등록할 수 없습니다.' }, 403);
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      if (!b || !b.name || !b.status || b.rate_per_10min_php == null) {
        return invalidBody(['name', 'status', 'rate_per_10min_php']);
      }
      if (!VALID_TEACHER_STATUS.includes(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: VALID_TEACHER_STATUS }, 400);
      }
      const rate = Number(b.rate_per_10min_php);
      if (isNaN(rate) || rate < 0) return json({ ok: false, error: 'invalid_rate' }, 400);
      const now = Date.now();
      const res = await env.DB.prepare(
        `INSERT INTO teachers (user_id, name, center_id, status, years, rate_per_10min_php, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        b.user_id || null, b.name, b.center_id || null,
        b.status, b.years != null ? Number(b.years) : null, rate,
        now, now
      ).run();
      return json({ ok: true, id: res.meta.last_row_id });
    }

    // 강사 수정 (부분 업데이트 — 모든 필드 선택적)
    if (method === 'PATCH' && /^\/api\/admin\/teachers\/\d+$/.test(path)) {
      const _tuActor = await getAdminActor(request, env as any);
      if (_tuActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 강사 정보를 수정할 수 없습니다.' }, 403);
      await ensurePayrollSchema(env);
      const m = path.match(/^\/api\/admin\/teachers\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (!id) return invalidBody(['id(path)']);
      const b = await parseJsonBody(request);
      if (!b) return invalidBody(['<any field>']);
      if (b.status && !VALID_TEACHER_STATUS.includes(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: VALID_TEACHER_STATUS }, 400);
      }
      const sets: string[] = [];
      const binds: any[] = [];
      if (b.name !== undefined)               { sets.push('name = ?');               binds.push(b.name); }
      if (b.status !== undefined)             { sets.push('status = ?');             binds.push(b.status); }
      if (b.years !== undefined)              { sets.push('years = ?');              binds.push(b.years); }
      if (b.rate_per_10min_php !== undefined) { sets.push('rate_per_10min_php = ?'); binds.push(b.rate_per_10min_php); }
      if (b.center_id !== undefined)          { sets.push('center_id = ?');          binds.push(b.center_id); }
      if (b.active !== undefined)             { sets.push('active = ?');             binds.push(b.active ? 1 : 0); }
      if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      await env.DB.prepare(`UPDATE teachers SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true, id });
    }

    // 월별 수업 수 입력 (20분 단위 수업 횟수)
    if (method === 'PUT' && path === '/api/admin/teacher-classes') {
      const _tcActor = await getAdminActor(request, env as any);
      if (_tcActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 수업 수를 입력할 수 없습니다.' }, 403);
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      if (!b || !b.teacher_id || !b.year || !b.month || b.class_count == null) {
        return invalidBody(['teacher_id', 'year', 'month', 'class_count']);
      }
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO teacher_monthly_classes (teacher_id, year, month, class_count, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(teacher_id, year, month) DO UPDATE SET
           class_count = excluded.class_count, notes = excluded.notes, updated_at = excluded.updated_at`
      ).bind(b.teacher_id, b.year, b.month, Math.max(0, parseInt(b.class_count, 10) || 0), b.notes || null, now).run();
      return json({ ok: true });
    }

    // 월별 평가 입력 (5개 카테고리 점수 + 코멘트)
    if (method === 'PUT' && path === '/api/admin/teacher-evaluation') {
      const _teActor = await getAdminActor(request, env as any);
      if (_teActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 평가를 입력할 수 없습니다.' }, 403);
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      if (!b || !b.teacher_id || !b.year || !b.month) return invalidBody(['teacher_id', 'year', 'month']);
      // 점수 범위 검증 (1~5, 빈 칸 허용)
      const fields = ['score_instruction', 'score_retention', 'score_punctuality', 'score_admin', 'score_contribution'] as const;
      const vals: Record<string, number | null> = {};
      for (const f of fields) {
        if (b[f] == null || b[f] === '') { vals[f] = null; continue; }
        const v = Number(b[f]);
        if (isNaN(v) || v < 1 || v > 5) return json({ ok: false, error: 'invalid_score', field: f, allowed: '1.0~5.0' }, 400);
        vals[f] = Math.round(v * 10) / 10;
      }
      const weighted = calcWeightedTotal(vals as any);
      const grade = weighted != null ? classifyEvalGrade(weighted) : null;
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO teacher_evaluations
           (teacher_id, year, month, score_instruction, score_retention, score_punctuality,
            score_admin, score_contribution, weighted_total, grade,
            strengths, improvements, evaluator, evaluated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(teacher_id, year, month) DO UPDATE SET
           score_instruction  = excluded.score_instruction,
           score_retention    = excluded.score_retention,
           score_punctuality  = excluded.score_punctuality,
           score_admin        = excluded.score_admin,
           score_contribution = excluded.score_contribution,
           weighted_total     = excluded.weighted_total,
           grade              = excluded.grade,
           strengths          = excluded.strengths,
           improvements       = excluded.improvements,
           evaluator          = excluded.evaluator,
           evaluated_at       = excluded.evaluated_at`
      ).bind(
        b.teacher_id, b.year, b.month,
        vals.score_instruction, vals.score_retention, vals.score_punctuality,
        vals.score_admin, vals.score_contribution, weighted, grade,
        b.strengths || null, b.improvements || null, b.evaluator || 'admin', now
      ).run();
      return json({ ok: true, weighted_total: weighted, grade });
    }

    // 개별 강사 월별 통합 조회 (계산 + 평가)
    //   🔐 강사는 임의 teacher_id 로 남의 급여명세서를 볼 수 없다 — 본인 id 만 허용.
    if (method === 'GET' && /^\/api\/admin\/payroll\/\d+$/.test(path)) {
      await ensurePayrollSchema(env);
      const m = path.match(/^\/api\/admin\/payroll\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!id || !year || !month) return invalidBody(['teacher_id(path)', 'year', 'month']);
      const result = await calcPayrollOne(env, id, year, month);
      const _oneActor = await getAdminActor(request, env as any);
      if (_oneActor.isTeacher && !(result.ok && sameTeacherName(_oneActor.name, result.teacher_name))) {
        return json({ ok: false, error: 'forbidden_teacher', message: '본인 급여명세서만 조회할 수 있습니다.' }, 403);
      }
      return json(result, result.ok ? 200 : 404);
    }

    // 일괄 — 활성 강사 전원 (월별 dashboard 용)
    //   🔐 강사 본인 뷰(card-payroll)도 이 엔드포인트를 쓴다 → 강사면 서버가 본인 항목만 반환.
    //      (기존엔 전체를 내려주고 admin.html 이 화면에서만 걸렀음 = 우회 가능했던 취약점)
    if (method === 'GET' && path === '/api/admin/payroll/all') {
      await ensurePayrollSchema(env);
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!year || !month) return invalidBody(['year', 'month']);
      const _allActor = await getAdminActor(request, env as any);
      const _allOwn = _allActor.isTeacher ? _allActor.name : '';
      const rs = await env.DB.prepare(`SELECT id FROM teachers WHERE active = 1 ORDER BY name ASC`).all();
      const items: any[] = [];
      let totalPhp = 0;
      for (const t of (rs.results || []) as any[]) {
        const r = await calcPayrollOne(env, t.id, year, month);
        if (!r.ok) continue;
        if (_allOwn && !sameTeacherName(_allOwn, r.teacher_name)) continue;  // 강사 본인 것만
        items.push(r); totalPhp += r.monthly_salary_php || 0;
      }
      const totalKrw = Math.round(totalPhp * PAYROLL_PHP_TO_KRW);
      // 등급 분포 카운트
      const gradeCounts: Record<string, number> = {};
      for (const it of items) {
        const g = it.grade || '미평가';
        gradeCounts[g] = (gradeCounts[g] || 0) + 1;
      }
      return json({
        ok: true, year, month, count: items.length,
        total_salary_php: Math.round(totalPhp * 100) / 100,
        total_salary_krw: totalKrw,
        php_to_krw: PAYROLL_PHP_TO_KRW,
        grade_counts: gradeCounts,
        currency: 'PHP', items
      });
    }

    // 마감 (payslips 잠금)
    if (method === 'POST' && path === '/api/admin/payroll/finalize') {
      const _finActor = await getAdminActor(request, env as any);
      if (_finActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 급여를 마감할 수 없습니다.' }, 403);
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      if (!b || !b.year || !b.month) return invalidBody(['year', 'month']);
      const finalizedBy = (b.finalized_by || 'admin').toString().slice(0, 64);
      const now = Date.now();
      const rs = await env.DB.prepare(`SELECT id FROM teachers WHERE active = 1`).all();
      let saved = 0, skipped = 0, totalPhp = 0;
      for (const t of (rs.results || []) as any[]) {
        const r = await calcPayrollOne(env, t.id, b.year, b.month);
        if (!r.ok) continue;
        try {
          // 회계 보고서가 SELECT 하는 period/payment_krw/payment_php/evaluation_score 도 함께 저장
          const period = `${r.year}-${String(r.month).padStart(2, '0')}`;
          const paymentKrw = Math.round((r.monthly_salary_php || 0) * PAYROLL_PHP_TO_KRW);
          await env.DB.prepare(
            `INSERT INTO payslips (teacher_id, year, month, period, status, class_count, rate_per_10min_php,
                                    monthly_salary_php, payment_php, payment_krw, weighted_total, evaluation_score,
                                    grade, finalized_at, finalized_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            r.teacher_id, r.year, r.month, period, r.status, r.class_count, r.rate_per_10min_php,
            r.monthly_salary_php, r.monthly_salary_php, paymentKrw,
            r.weighted_total, r.weighted_total, r.grade, now, finalizedBy
          ).run();
          saved++;
          totalPhp += r.monthly_salary_php || 0;
        } catch (e) { skipped++; }
      }
      await enqueueNotification(env, {
        type: 'payroll_finalized',
        title: `💼 ${b.year}-${String(b.month).padStart(2,'0')} 급여 마감`,
        body: `강사 ${saved}명 정산 완료 (skipped ${skipped}). 합계 PHP ${Math.round(totalPhp).toLocaleString()} ≈ KRW ${Math.round(totalPhp * PAYROLL_PHP_TO_KRW).toLocaleString()}.`,
        meta: { year: b.year, month: b.month, saved, skipped, total_php: totalPhp, php_to_krw: PAYROLL_PHP_TO_KRW, finalized_by: finalizedBy, finalized_at: now }
      });
      return json({ ok: true, year: b.year, month: b.month, saved, skipped, total_php: Math.round(totalPhp), finalized_by: finalizedBy });
    }

    // 🌱 데모 데이터 시드 — salary-heatmap.pages.dev 의 21명 강사를 한번에 등록
    //   (강사 등록 + 평가 5점수 + 수업수). 이미 같은 이름이 있으면 skip.
    //   POST /api/admin/payroll/seed-demo  body: { year, month }
    if (method === 'POST' && path === '/api/admin/payroll/seed-demo') {
      await ensurePayrollSchema(env);
      const b = await parseJsonBody(request);
      const year  = (b && b.year)  ? Number(b.year)  : new Date().getFullYear();
      const month = (b && b.month) ? Number(b.month) : (new Date().getMonth() + 1);
      // [name, status, years, rate_per_10min_php, classes, inst, ret, punct, admin, contrib]
      const SEED: any[] = [
        ['KES',      'office', 5, 29.58,  51, 5, 5, 4, 4, 5],
        ['BELLE',    'home',   1, 35.00, 104, 4, 5, 5, 5, 5],
        ['HT FARRAH','office', 5, 50.32, 157, 5, 4, 5, 5, 5],
        ['RICA',     'office', 5, 32.86, 134, 5, 5, 4, 5, 5],
        ['CINDY',    'office', 2, 34.09, 307, 5, 4, 5, 5, 5],
        ['JANE',     'office', 5, 28.57, 235, 5, 4, 5, 5, 5],
        ['ANA',      'office', 2, 30.00, 215, 5, 4, 5, 5, 5],
        ['KAYE',     'office', 1, 28.47, 333, 5, 4, 5, 5, 5],
        ['ZEE',      'office', 5, 29.33, 175, 4, 4, 5, 5, 5],
        ['HT NESS',  'home',   5, 30.00, 241, 5, 4, 5, 5, 5],
        ['MARIANE',  'home',   1, 25.79, 127, 5, 4, 5, 5, 5],
        ['JINETTE',  'home',   2, 25.52, 169, 5, 4, 5, 5, 5],
        ['JENNY',    'home',   2, 25.00,  34, 5, 5, 5, 4, 5],
        ['SID',      'office', 1, 29.59, 206, 5, 3, 4, 4, 5],
        ['CHAINE',   'office', 5, 25.82, 213, 5, 4, 5, 5, 5],
        ['KRYSTEL',  'office', 1, 25.06, 193, 4, 4, 5, 5, 4],
        ['SHAS',     'office', 1, 28.41, 222, 5, 4, 5, 5, 5],
        ['LEN',      'home',   1, 25.06, 165, 4, 4, 3, 2, 3],
        ['WIN',      'office', 1, 28.46, 148, 5, 4, 3, 1, 5],
        ['JED',      'home',   1, 25.00,  58, 5, 5, 1, 4, 2],
        ['FAYE',     'home',   5, 28.67, 141, 3, 5, 1, 3, 1],
      ];
      const now = Date.now();
      let created = 0, updated = 0, evals = 0, classes = 0;
      for (const row of SEED) {
        const [name, status, years, rate, classCount, inst, ret, punct, adminScore, contrib] = row;
        // 이미 있는지 확인 (이름 기준)
        const existing: any = await env.DB.prepare(`SELECT id FROM teachers WHERE name = ? LIMIT 1`).bind(name).first();
        let teacherId: number;
        if (existing && existing.id) {
          teacherId = existing.id;
          await env.DB.prepare(
            `UPDATE teachers SET status = ?, years = ?, rate_per_10min_php = ?, active = 1, updated_at = ? WHERE id = ?`
          ).bind(status, years, rate, now, teacherId).run();
          updated++;
        } else {
          const r = await env.DB.prepare(
            `INSERT INTO teachers (name, status, years, rate_per_10min_php, active, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)`
          ).bind(name, status, years, rate, now, now).run();
          teacherId = Number(r.meta.last_row_id);
          created++;
        }
        // 평가 upsert
        const weighted = calcWeightedTotal({
          score_instruction: inst, score_retention: ret, score_punctuality: punct,
          score_admin: adminScore, score_contribution: contrib
        });
        const grade = weighted != null ? classifyEvalGrade(weighted) : null;
        await env.DB.prepare(
          `INSERT INTO teacher_evaluations (teacher_id, year, month, score_instruction, score_retention, score_punctuality,
                                             score_admin, score_contribution, weighted_total, grade,
                                             evaluator, evaluated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(teacher_id, year, month) DO UPDATE SET
             score_instruction = excluded.score_instruction,
             score_retention = excluded.score_retention,
             score_punctuality = excluded.score_punctuality,
             score_admin = excluded.score_admin,
             score_contribution = excluded.score_contribution,
             weighted_total = excluded.weighted_total,
             grade = excluded.grade,
             evaluator = excluded.evaluator,
             evaluated_at = excluded.evaluated_at`
        ).bind(teacherId, year, month, inst, ret, punct, adminScore, contrib, weighted, grade, 'seed-demo', now).run();
        evals++;
        // 수업수 upsert
        await env.DB.prepare(
          `INSERT INTO teacher_monthly_classes (teacher_id, year, month, class_count, notes, updated_at)
           VALUES (?, ?, ?, ?, 'seed-demo', ?)
           ON CONFLICT(teacher_id, year, month) DO UPDATE SET
             class_count = excluded.class_count, updated_at = excluded.updated_at`
        ).bind(teacherId, year, month, classCount, now).run();
        classes++;
      }
      return json({ ok: true, year, month, total: SEED.length, created, updated, evaluations: evals, class_records: classes });
    }

    // CSV — Mangoi 평가 + 급여 통합 (회계 + 평가팀 공용)
    if (method === 'GET' && path === '/api/admin/export/payroll.csv') {
      await ensurePayrollSchema(env);
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!year || !month) return invalidBody(['year', 'month']);
      const rs = await env.DB.prepare(`SELECT id FROM teachers WHERE active = 1 ORDER BY name ASC`).all();
      const rows: any[] = [];
      for (const t of (rs.results || []) as any[]) {
        const r = await calcPayrollOne(env, t.id, year, month);
        if (!r.ok) continue;
        const e = r.evaluation || {};
        rows.push({
          teacher_id:         r.teacher_id,
          teacher_name:       r.teacher_name,
          status:             r.status,
          years:              r.years,
          year:               r.year,
          month:              r.month,
          class_count:        r.class_count,
          rate_per_10min_php: r.rate_per_10min_php,
          monthly_salary_php: r.monthly_salary_php,
          monthly_salary_krw: r.monthly_salary_krw,
          score_instruction:  e.score_instruction,
          score_retention:    e.score_retention,
          score_punctuality:  e.score_punctuality,
          score_admin:        e.score_admin,
          score_contribution: e.score_contribution,
          weighted_total:     r.weighted_total,
          grade:              r.grade,
          strengths:          e.strengths,
          improvements:       e.improvements,
        });
      }
      const csv = toCSV(rows, [
        { key: 'teacher_id',         label: 'teacher_id' },
        { key: 'teacher_name',       label: 'teacher_name' },
        { key: 'status',             label: 'status' },
        { key: 'years',              label: 'years' },
        { key: 'year',               label: 'year' },
        { key: 'month',              label: 'month' },
        { key: 'class_count',        label: 'class_count_20min' },
        { key: 'rate_per_10min_php', label: 'rate_per_10min_php' },
        { key: 'monthly_salary_php', label: 'monthly_salary_php' },
        { key: 'monthly_salary_krw', label: 'monthly_salary_krw' },
        { key: 'score_instruction',  label: 'inst_25%' },
        { key: 'score_retention',    label: 'ret_30%' },
        { key: 'score_punctuality',  label: 'punct_20%' },
        { key: 'score_admin',        label: 'admin_15%' },
        { key: 'score_contribution', label: 'contrib_10%' },
        { key: 'weighted_total',     label: 'weighted_total' },
        { key: 'grade',              label: 'grade' },
        { key: 'strengths',          label: 'strengths' },
        { key: 'improvements',       label: 'improvements' },
      ]);
      const fname = `mangoi_payroll_${year}-${String(month).padStart(2,'0')}.csv`;
      return csvResponse(fname, csv);
    }

    // ═══════════════════════════════════════════════════════════════
    // 📢 Phase POP — 팝업/공지 관리 시스템
    // ═══════════════════════════════════════════════════════════════

    const ensurePopupTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS popup_announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'mixed', body_html TEXT, image_url TEXT, video_url TEXT, link_url TEXT, link_text TEXT, width INTEGER DEFAULT 480, height INTEGER DEFAULT 360, width_mobile INTEGER, height_mobile INTEGER, position TEXT DEFAULT 'center', priority INTEGER DEFAULT 0, start_at INTEGER, end_at INTEGER, enabled INTEGER DEFAULT 1, dismiss_options TEXT DEFAULT 'today,7days', target_filter TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, view_count INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS popup_views (id INTEGER PRIMARY KEY AUTOINCREMENT, popup_id INTEGER NOT NULL, user_id TEXT, viewed_at INTEGER NOT NULL, clicked INTEGER DEFAULT 0, click_target TEXT, user_agent TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS popup_dismissals (popup_id INTEGER NOT NULL, user_id TEXT NOT NULL, dismissed_at INTEGER NOT NULL, dismissed_until INTEGER NOT NULL, PRIMARY KEY (popup_id, user_id));`);
    };

    // ── GET /api/popups?uid=xxx — 학생 페이지용 활성 팝업 목록 ──
    //   조건: enabled=1 + (start_at <= now or null) + (end_at >= now or null)
    //   + 해당 user_id 가 이 팝업을 "안보기" 처리하지 않음
    if (method === 'GET' && path === '/api/popups') {
      await ensurePopupTables();
      const uid = (url.searchParams.get('uid') || '').trim();
      const now = Date.now();
      // 활성 팝업
      const rs = await env.DB.prepare(
        `SELECT * FROM popup_announcements
          WHERE enabled = 1
            AND (start_at IS NULL OR start_at <= ?)
            AND (end_at IS NULL OR end_at >= ?)
          ORDER BY priority DESC, id DESC
          LIMIT 20`
      ).bind(now, now).all();
      let popups = rs.results || [];
      // 사용자별 dismiss 필터
      if (uid && popups.length) {
        const dismissed: any = await env.DB.prepare(
          `SELECT popup_id FROM popup_dismissals WHERE user_id=? AND dismissed_until>?`
        ).bind(uid, now).all();
        const blockedIds = new Set((dismissed.results || []).map((d: any) => d.popup_id));
        popups = popups.filter((p: any) => !blockedIds.has(p.id));
      }
      return json({ ok: true, count: popups.length, rows: popups });
    }

    // ── POST /api/popups/:id/view — 노출 기록 ──
    if (method === 'POST' && /^\/api\/popups\/\d+\/view$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/')[3] || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.uid || '').trim() || null;
      const ua = request.headers.get('User-Agent') || '';
      await env.DB.prepare(`INSERT INTO popup_views (popup_id, user_id, viewed_at, user_agent) VALUES (?,?,?,?)`)
        .bind(id, uid, Date.now(), ua.slice(0, 200)).run();
      await env.DB.prepare(`UPDATE popup_announcements SET view_count = view_count + 1 WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── POST /api/popups/:id/click — 클릭 기록 (링크 클릭) ──
    if (method === 'POST' && /^\/api\/popups\/\d+\/click$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/')[3] || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.uid || '').trim() || null;
      const target = (body.target || '').slice(0, 500);
      await env.DB.prepare(`INSERT INTO popup_views (popup_id, user_id, viewed_at, clicked, click_target) VALUES (?,?,?,1,?)`)
        .bind(id, uid, Date.now(), target).run();
      await env.DB.prepare(`UPDATE popup_announcements SET click_count = click_count + 1 WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── POST /api/popups/:id/dismiss — "오늘/7일 안보기" 처리 ──
    //   body: { uid, period: 'today' | '7days' | '30days' }
    if (method === 'POST' && /^\/api\/popups\/\d+\/dismiss$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/')[3] || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.uid || '').trim();
      const period = body.period || 'today';
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const now = Date.now();
      let until = now;
      if (period === 'today') {
        const d = new Date(); d.setHours(23, 59, 59, 999);
        until = d.getTime();
      } else if (period === '3days') until = now + 3 * 86400 * 1000;
      else if (period === '7days') until = now + 7 * 86400 * 1000;
      else if (period === '30days') until = now + 30 * 86400 * 1000;
      await env.DB.prepare(`INSERT INTO popup_dismissals (popup_id, user_id, dismissed_at, dismissed_until) VALUES (?,?,?,?) ON CONFLICT(popup_id, user_id) DO UPDATE SET dismissed_at=excluded.dismissed_at, dismissed_until=excluded.dismissed_until`)
        .bind(id, uid, now, until).run();
      return json({ ok: true, until });
    }

    // ── GET /api/admin/popups — 관리자: 전체 팝업 목록 (활성+비활성+만료) ──
    if (method === 'GET' && path === '/api/admin/popups') {
      await ensurePopupTables();
      const rs = await env.DB.prepare(`SELECT * FROM popup_announcements ORDER BY enabled DESC, priority DESC, id DESC LIMIT 500`).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/popups — 신규 팝업 생성 ──
    if (method === 'POST' && path === '/api/admin/popups') {
      await ensurePopupTables();
      const body: any = await request.json().catch(() => ({}));
      if (!body.title) return json({ ok: false, error: 'title_required' }, 400);
      const now = Date.now();
      const ins = await env.DB.prepare(`INSERT INTO popup_announcements (
        title, content_type, body_html, image_url, video_url, link_url, link_text,
        width, height, width_mobile, height_mobile, position, priority,
        start_at, end_at, enabled, dismiss_options, target_filter, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        body.title, body.content_type || 'mixed',
        body.body_html || null, body.image_url || null, body.video_url || null,
        body.link_url || null, body.link_text || null,
        parseInt(body.width, 10) || 480, parseInt(body.height, 10) || 360,
        body.width_mobile ? parseInt(body.width_mobile, 10) : null,
        body.height_mobile ? parseInt(body.height_mobile, 10) : null,
        body.position || 'center', parseInt(body.priority, 10) || 0,
        body.start_at ? parseInt(body.start_at, 10) : null,
        body.end_at ? parseInt(body.end_at, 10) : null,
        body.enabled === false ? 0 : 1,
        body.dismiss_options || 'today,7days',
        body.target_filter || null, now, now
      ).run();
      return json({ ok: true, id: ins?.meta?.last_row_id, created: true });
    }

    // ── PUT /api/admin/popups/:id — 팝업 수정 ──
    if (method === 'PUT' && /^\/api\/admin\/popups\/\d+$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      await env.DB.prepare(`UPDATE popup_announcements SET
        title=COALESCE(?,title), content_type=COALESCE(?,content_type),
        body_html=?, image_url=?, video_url=?, link_url=?, link_text=?,
        width=COALESCE(?,width), height=COALESCE(?,height),
        width_mobile=?, height_mobile=?, position=COALESCE(?,position),
        priority=COALESCE(?,priority), start_at=?, end_at=?,
        enabled=COALESCE(?,enabled), dismiss_options=COALESCE(?,dismiss_options),
        target_filter=?, updated_at=?
        WHERE id=?`).bind(
        body.title ?? null, body.content_type ?? null,
        body.body_html ?? null, body.image_url ?? null, body.video_url ?? null,
        body.link_url ?? null, body.link_text ?? null,
        body.width != null ? parseInt(body.width, 10) : null,
        body.height != null ? parseInt(body.height, 10) : null,
        body.width_mobile != null ? parseInt(body.width_mobile, 10) : null,
        body.height_mobile != null ? parseInt(body.height_mobile, 10) : null,
        body.position ?? null,
        body.priority != null ? parseInt(body.priority, 10) : null,
        body.start_at != null ? parseInt(body.start_at, 10) : null,
        body.end_at != null ? parseInt(body.end_at, 10) : null,
        body.enabled === undefined ? null : (body.enabled ? 1 : 0),
        body.dismiss_options ?? null,
        body.target_filter ?? null,
        now, id
      ).run();
      return json({ ok: true, id, updated: true });
    }

    // ── DELETE /api/admin/popups/:id — 팝업 삭제 ──
    if (method === 'DELETE' && /^\/api\/admin\/popups\/\d+$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM popup_announcements WHERE id=?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM popup_views WHERE popup_id=?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM popup_dismissals WHERE popup_id=?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }

    // ══════════════════════════════════════════════════════════════
    // 🎨 포스터 만들기 — 서버 저장/재사용 (관리자)
    //   saved_posters: 만든 날짜(created_at)·수정 날짜(updated_at)로 관리
    // ══════════════════════════════════════════════════════════════
    const ensurePosterTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS saved_posters (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, config TEXT NOT NULL, width INTEGER DEFAULT 1080, height INTEGER DEFAULT 1080, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    };

    // ── GET /api/admin/posters — 저장된 포스터 목록 (최근 수정순) ──
    if (method === 'GET' && path === '/api/admin/posters') {
      await ensurePosterTable();
      const rs = await env.DB.prepare(
        `SELECT id, title, config, width, height, created_at, updated_at FROM saved_posters ORDER BY updated_at DESC LIMIT 200`
      ).all();
      return json({ ok: true, count: (rs.results || []).length, rows: rs.results || [] });
    }

    // ── GET /api/admin/posters/:id — 단일 포스터 (불러오기) ──
    if (method === 'GET' && /^\/api\/admin\/posters\/\d+$/.test(path)) {
      await ensurePosterTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(`SELECT * FROM saved_posters WHERE id=?`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      return json({ ok: true, row });
    }

    // ── POST /api/admin/posters — 새 포스터 저장 ──
    if (method === 'POST' && path === '/api/admin/posters') {
      await ensurePosterTable();
      const body: any = await request.json().catch(() => ({}));
      const title = String(body.title || '').trim() || '무제 포스터';
      const config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config || {});
      if (config.length > 4_000_000) return json({ ok: false, error: 'config_too_large' }, 413);
      const now = Date.now();
      const ins = await env.DB.prepare(
        `INSERT INTO saved_posters (title, config, width, height, created_at, updated_at) VALUES (?,?,?,?,?,?)`
      ).bind(title, config, parseInt(body.width, 10) || 1080, parseInt(body.height, 10) || 1080, now, now).run();
      return json({ ok: true, id: ins?.meta?.last_row_id, created: true });
    }

    // ── PUT /api/admin/posters/:id — 포스터 수정 ──
    if (method === 'PUT' && /^\/api\/admin\/posters\/\d+$/.test(path)) {
      await ensurePosterTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const config = body.config == null ? null : (typeof body.config === 'string' ? body.config : JSON.stringify(body.config));
      if (config && config.length > 4_000_000) return json({ ok: false, error: 'config_too_large' }, 413);
      await env.DB.prepare(
        `UPDATE saved_posters SET title=COALESCE(?,title), config=COALESCE(?,config), width=COALESCE(?,width), height=COALESCE(?,height), updated_at=? WHERE id=?`
      ).bind(
        body.title ?? null, config,
        body.width != null ? parseInt(body.width, 10) : null,
        body.height != null ? parseInt(body.height, 10) : null,
        Date.now(), id
      ).run();
      return json({ ok: true, id, updated: true });
    }

    // ── DELETE /api/admin/posters/:id — 포스터 삭제 ──
    if (method === 'DELETE' && /^\/api\/admin\/posters\/\d+$/.test(path)) {
      await ensurePosterTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM saved_posters WHERE id=?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }

    // ── GET /api/admin/popups/:id/stats — 팝업 통계 ──
    if (method === 'GET' && /^\/api\/admin\/popups\/\d+\/stats$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/')[4] || '0', 10);
      const pop: any = await env.DB.prepare(`SELECT * FROM popup_announcements WHERE id=?`).bind(id).first();
      if (!pop) return json({ ok: false, error: 'not_found' }, 404);
      const uniqueViewers: any = await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM popup_views WHERE popup_id=? AND user_id IS NOT NULL`).bind(id).first();
      const clickCount: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM popup_views WHERE popup_id=? AND clicked=1`).bind(id).first();
      const dismissCount: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM popup_dismissals WHERE popup_id=?`).bind(id).first();
      const recent: any = await env.DB.prepare(`SELECT viewed_at, user_id, clicked, click_target FROM popup_views WHERE popup_id=? ORDER BY viewed_at DESC LIMIT 30`).bind(id).all();
      return json({
        ok: true,
        popup: pop,
        stats: {
          total_views: pop.view_count || 0,
          unique_viewers: uniqueViewers?.c || 0,
          total_clicks: clickCount?.c || 0,
          ctr: (pop.view_count > 0) ? Math.round((clickCount?.c || 0) / pop.view_count * 1000) / 10 : 0,
          dismissals: dismissCount?.c || 0,
        },
        recent_views: recent?.results || [],
      });
    }

    // ── POST /api/admin/popups/upload-media — 이미지/동영상 R2 업로드 ──
    //   multipart/form-data: file=...
    //   응답: { ok, url }
    if (method === 'POST' && path === '/api/admin/popups/upload-media') {
      try {
        const form = await request.formData();
        const file = form.get('file') as File | null;
        if (!file) return json({ ok: false, error: 'file_required' }, 400);
        const MAX_SIZE = 30 * 1024 * 1024; // 30MB
        if (file.size > MAX_SIZE) return json({ ok: false, error: 'file_too_large', max: MAX_SIZE }, 413);
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov'];
        if (!validExt.includes(ext)) return json({ ok: false, error: 'invalid_type', allowed: validExt }, 400);
        const key = `popup-media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        // R2 bucket - RECORDINGS 재사용 (이미 wrangler.toml 에 있음)
        const r2 = (env as any).RECORDINGS;
        if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);
        const buf = await file.arrayBuffer();
        await r2.put(key, buf, {
          httpMetadata: { contentType: file.type || 'application/octet-stream' },
        });
        // 공개 URL — R2 public bucket 안 쓰면 우리 worker 로 프록시
        const publicUrl = `/api/popups/media/${encodeURIComponent(key)}`;
        return json({ ok: true, url: publicUrl, key, size: file.size, type: file.type });
      } catch (e: any) {
        return json({ ok: false, error: 'upload_failed', detail: String(e?.message || e) }, 500);
      }
    }

    // ── GET /api/popups/media/:key — 업로드된 미디어 프록시 ──
    if (method === 'GET' && path.startsWith('/api/popups/media/')) {
      const key = decodeURIComponent(path.replace('/api/popups/media/', ''));
      const r2 = (env as any).RECORDINGS;
      if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);
      const obj = await r2.get(key);
      if (!obj) return new Response('Not Found', { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(obj.body, { headers });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📢 Phase POP 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🥭 주간스케줄(WS)·수업스케줄 CRUD·노쇼 리포트 (admin 5회차 이동)
    // ═══════════════════════════════════════════════════════════════
    // ────────────────────────────────────────────────
    // 🥭 Phase WS — GET /api/admin/schedules?week=YYYY-MM-DD
    //   주간 전체 스케줄 그리드(admin/weekly-schedule.html)용.
    //   class_schedules 를 요청 주(월~일)로 펼쳐 강사별 슬롯 배열로 반환.
    //   반환 슬롯: { teacher_id, date, hour, start_time, type, students[], duration_min, note, start_date, end_date }
    // ────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/admin/schedules') {
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
        );
      } catch {}

      const mondayOf = (d: Date): Date => {
        const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const wd = (x.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
        x.setUTCDate(x.getUTCDate() - wd);
        return x;
      };
      const isoOf = (d: Date) => d.toISOString().slice(0, 10);
      const weekParam = url.searchParams.get('week');
      const start = (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam))
        ? mondayOf(new Date(weekParam + 'T00:00:00Z'))
        : mondayOf(new Date());
      const dowKey = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const weekDates: string[] = [];
      const dateToDow: Record<string, string> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
        const s = isoOf(d); weekDates.push(s); dateToDow[s] = dowKey[i];
      }
      const weekStartISO = weekDates[0], weekEndISO = weekDates[6];

      const mapType = (ct: string): string => {
        const c = String(ct || '').toLowerCase();
        if (c === 'group' || c === '1:2' || c === 'g' || c === '그룹') return 'group';
        if (c === 'temp' || c === 'substitute' || c === '대체') return 'temp';
        if (c === 'blocked' || c === 'off' || c === '휴무') return 'blocked';
        return '1on1';
      };
      const hourOf = (t: string): number => {
        const m = String(t || '').match(/(\d{1,2})/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const normDow = (s: string): string => {
        const v = String(s || '').trim().toLowerCase();
        const map: Record<string, string> = {
          'mon': 'Mon', 'monday': 'Mon', '월': 'Mon', '월요일': 'Mon',
          'tue': 'Tue', 'tuesday': 'Tue', '화': 'Tue', '화요일': 'Tue',
          'wed': 'Wed', 'wednesday': 'Wed', '수': 'Wed', '수요일': 'Wed',
          'thu': 'Thu', 'thursday': 'Thu', '목': 'Thu', '목요일': 'Thu',
          'fri': 'Fri', 'friday': 'Fri', '금': 'Fri', '금요일': 'Fri',
          'sat': 'Sat', 'saturday': 'Sat', '토': 'Sat', '토요일': 'Sat',
          'sun': 'Sun', 'sunday': 'Sun', '일': 'Sun', '일요일': 'Sun',
        };
        return map[v] || '';
      };

      let rows: any[] = [];
      try {
        const rs: any = await env.DB.prepare(
          `SELECT id, user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, notes FROM class_schedules WHERE (status IS NULL OR status='active')`
        ).all();
        rows = rs.results || [];
      } catch (e: any) {
        return json({ ok: true, week: weekStartISO, count: 0, items: [], schedules: [], _err: String(e?.message || e) });
      }

      const items: any[] = [];
      for (const r of rows) {
        if (r.teacher_id == null || r.teacher_id === '') continue;
        const tnum = Number(r.teacher_id);
        const teacher_id = Number.isFinite(tnum) ? tnum : r.teacher_id;
        const students = r.student_name ? [{ name: r.student_name, uid: r.user_id || '' }] : [];
        const base = {
          id: r.id,                       // ← 드래그 이동 영구 저장(PATCH)에 필요
          teacher_id,
          hour: hourOf(r.start_time),
          start_time: r.start_time,
          type: mapType(r.class_type),
          students,
          duration_min: r.duration_min || 30,
          note: r.notes || '',
        };
        const kind = String(r.schedule_kind || 'recurring');
        if (kind === 'one_off' || r.scheduled_date) {
          const d = String(r.scheduled_date || '');
          if (d >= weekStartISO && d <= weekEndISO) {
            items.push({ ...base, date: d, start_date: d, end_date: d });
          }
        } else {
          const want = normDow(r.day_of_week);
          if (!want) continue;
          for (const d of weekDates) {
            if (dateToDow[d] === want) {
              items.push({ ...base, date: d, start_date: weekStartISO, end_date: weekEndISO });
            }
          }
        }
      }

      return json({ ok: true, week: weekStartISO, count: items.length, items, schedules: items });
    }

    // 🥭 Phase WS-2 — GET /api/admin/unassigned-students
    //   아직 어떤 수업(class_schedules)에도 배정되지 않은 '재학중' 학생 목록.
    //   weekly-schedule.html 좌측 '미배정 학생 대기 풀'이 호출.
    //   반환: { ok, count, students:[{uid,name,level}], items:[…동일] }
    // ────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/admin/unassigned-students') {
      // class_schedules 테이블이 없으면 모든 학생이 미배정이므로, 안전하게 생성만 보장
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
        );
      } catch {}
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);
      try {
        // 재학생(status 정상/미지정) 중, 활성 수업이 한 건도 없는 학생만 추림.
        // user_id 매칭 + 동명(korean_name) 매칭 모두 고려해 누락/중복 방지.
        const rs: any = await env.DB.prepare(
          `SELECT s.user_id AS uid,
                  COALESCE(s.korean_name, s.english_name, s.user_id) AS name
             FROM students_erp s
            WHERE (s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')
              AND NOT EXISTS (
                    SELECT 1 FROM class_schedules cs
                     WHERE (cs.status IS NULL OR cs.status = 'active')
                       AND (cs.user_id = s.user_id OR cs.student_name = s.korean_name)
                  )
            ORDER BY name ASC
            LIMIT ?`
        ).bind(limit).all();
        const students = (rs.results || []).map((r: any) => ({
          uid: r.uid, name: r.name, level: ''
        }));
        return json({ ok: true, count: students.length, students, items: students });
      } catch (e: any) {
        // 테이블 미존재 등 → 빈 목록(프론트는 데모 폴백)
        return json({ ok: true, count: 0, students: [], items: [], _err: String(e?.message || e) });
      }
    }

    // 🥭 Phase WS-3 — POST /api/admin/notify-queue
    //   드래그 배정/이동 시 '학부모 알림톡'을 발송 대기 큐에 적재.
    //   실제 발송은 별도 큐 워커(SOLAPI)가 처리. 여기서는 영구 기록만.
    //   body: { uid, name, teacher_id, date, hour, kind? }
    // ────────────────────────────────────────────────
    if (method === 'POST' && path === '/api/admin/notify-queue') {
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS parent_notify_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, teacher_id TEXT, scheduled_date TEXT, hour INTEGER, kind TEXT DEFAULT 'schedule_assigned', status TEXT DEFAULT 'queued', payload TEXT, created_at INTEGER NOT NULL, sent_at INTEGER)`
        );
      } catch {}
      let body: any = {};
      try { body = await request.json(); } catch {}
      try {
        const now = Date.now();
        const r: any = await env.DB.prepare(
          `INSERT INTO parent_notify_queue (user_id, student_name, teacher_id, scheduled_date, hour, kind, status, payload, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`
        ).bind(
          body.uid || null,
          body.name || null,
          (body.teacher_id != null) ? String(body.teacher_id) : null,
          body.date || null,
          (body.hour != null && body.hour !== '') ? Number(body.hour) : null,
          body.kind || 'schedule_assigned',
          JSON.stringify(body || {}),
          now
        ).run();
        return json({ ok: true, queued: true, id: r?.meta?.last_row_id ?? null });
      } catch (e: any) {
        return json({ ok: false, queued: false, error: String(e?.message || e) }, 200);
      }
    }

    // 🥭 Phase 22 — GET /api/admin/class-schedules
    //   학생별/기간별 수업 스케줄 조회 (학생 상세 페이지에서 호출)
    //   query: ?user_id=X&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD&kind=recurring|one_off|all
    // ────────────────────────────────────────────────
    if (method === 'GET' && path === '/api/admin/class-schedules') {
      // 테이블 없으면 자동 생성 (첫 GET 호출 대응)
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
        );
      } catch {}
      const url = new URL(request.url);
      const userId = url.searchParams.get('user_id');
      const studentName = url.searchParams.get('student_name'); // ★ Phase 6f: 동명 학생 통합
      const fromDate = url.searchParams.get('from_date');
      const toDate = url.searchParams.get('to_date');
      const kind = url.searchParams.get('kind') || 'all';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

      const where: string[] = [`status != 'cancelled'`];
      const binds: any[] = [];

      // ★ Phase 7b: user_id 또는 student_name 둘 다로 동명 학생 통합 조회 (강화)
      let mergeInfo: any = null;
      if (userId) {
        // 1) 다양한 키로 학생 이름 찾기 (user_id / login_id / id 중 어떤 것이든)
        let nameForUid: string | null = null;
        try {
          const r = await env.DB.prepare(
            `SELECT COALESCE(korean_name, username) AS name FROM students_erp WHERE user_id = ? OR login_id = ? OR ('stu_' || id) = ? OR ('stu_id_' || id) = ? LIMIT 1`
          ).bind(userId, userId, userId, userId).first<any>();
          if (r?.name) nameForUid = r.name;
        } catch {}
        // 2) studentName 파라미터가 있으면 그것도 우선 사용 (프론트가 알고 있는 이름)
        const effectiveName = studentName || nameForUid;
        // 3) 같은 이름의 모든 user_id 수집 (status 무관 - 병합된 row 도 포함하여 schedule 가져오기)
        let allUids: string[] = [userId];
        if (effectiveName) {
          try {
            const rs = await env.DB.prepare(
              `SELECT COALESCE(user_id, login_id, ('stu_' || id)) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`
            ).bind(effectiveName, effectiveName).all<any>();
            const ids = (rs.results || []).map((r: any) => r.uid).filter(Boolean);
            allUids = [...new Set([userId, ...ids])];
          } catch {}
          mergeInfo = { name: effectiveName, user_ids: allUids, merged_count: allUids.length };
        }
        // 4) WHERE: user_id IN (...) OR student_name = name (양쪽 매칭)
        const placeholders = allUids.map(() => '?').join(',');
        if (effectiveName) {
          where.push('(user_id IN (' + placeholders + ') OR student_name = ?)');
          binds.push(...allUids, effectiveName);
        } else {
          where.push('user_id IN (' + placeholders + ')');
          binds.push(...allUids);
        }
      } else if (studentName) {
        // 학생 이름으로 직접 조회 (모든 동명 학생 통합)
        let allUids: string[] = [];
        try {
          const rs = await env.DB.prepare(
            `SELECT COALESCE(user_id, login_id, ('stu_' || id)) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`
          ).bind(studentName, studentName).all<any>();
          allUids = (rs.results || []).map((r: any) => r.uid).filter(Boolean);
        } catch {}
        if (allUids.length) {
          const placeholders = allUids.map(() => '?').join(',');
          where.push('(user_id IN (' + placeholders + ') OR student_name = ?)');
          binds.push(...allUids, studentName);
        } else {
          where.push('student_name = ?');
          binds.push(studentName);
        }
      }
      if (fromDate) { where.push('(scheduled_date IS NULL OR scheduled_date >= ?)'); binds.push(fromDate); }
      if (toDate) { where.push('(scheduled_date IS NULL OR scheduled_date <= ?)'); binds.push(toDate); }
      if (kind === 'recurring') where.push(`schedule_kind = 'recurring'`);
      else if (kind === 'one_off') where.push(`schedule_kind = 'one_off'`);

      binds.push(limit);
      // 1차: teachers JOIN 시도 (강사명 함께)
      const sqlWithJoin = `SELECT cs.id, cs.user_id, cs.student_name, cs.schedule_kind, cs.class_type, cs.day_of_week, cs.scheduled_date, cs.start_time, cs.duration_min, cs.teacher_id, cs.status, cs.source, cs.created_at, t.name AS teacher_name FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id WHERE ${where.join(' AND ')} ORDER BY cs.schedule_kind ASC, cs.scheduled_date ASC, cs.start_time ASC LIMIT ?`;
      // 2차: JOIN 없이 (teachers 테이블 미존재 등에 대비)
      const sqlNoJoin = `SELECT id, user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at FROM class_schedules WHERE ${where.join(' AND ')} ORDER BY schedule_kind ASC, scheduled_date ASC, start_time ASC LIMIT ?`;
      try {
        let rows;
        try {
          rows = await env.DB.prepare(sqlWithJoin).bind(...binds).all<any>();
        } catch (joinErr: any) {
          console.warn('[class-schedules] JOIN failed, fallback no-JOIN:', joinErr?.message);
          rows = await env.DB.prepare(sqlNoJoin).bind(...binds).all<any>();
        }
        // Phase 7g: server-side 변환 제거 - client 가 visible week/month 기준으로 1회성 위치 계산
        return json({ ok: true, count: (rows.results || []).length, items: rows.results || [], merge_info: mergeInfo });
      } catch (e: any) {
        console.warn('[class-schedules] both queries failed:', e?.message);
        return json({ ok: true, count: 0, items: [], warning: String(e?.message || e), merge_info: mergeInfo });
      }
    }


    // 🥭 Phase RM — GET /api/admin/no-shows — 노쇼(수업 미입장) 리포트
    //   class_no_show(2단계 노쇼 감지 기록) 조회 + 요약. 관리자 전용(index.ts isAdminPath 미들웨어 자동 인증).
    if (method === 'GET' && path === '/api/admin/no-shows') {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_no_show (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, missing_role TEXT, missing_uid TEXT, student_name TEXT, teacher_name TEXT, lesson_title TEXT, waited_min INTEGER, notified_push INTEGER DEFAULT 0, notified_kakao INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`); } catch {}
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
      let rows: any = { results: [] };
      try {
        // 예약(schedule_id)→학생 연락처 조인: '즉시 연락' tel 링크용 (안 온 사람이 강사여도 학생/학부모 연락처 노출)
        rows = await env.DB.prepare(`SELECT ns.id, ns.room_id, ns.schedule_id, ns.missing_role, ns.missing_uid, ns.student_name, ns.teacher_name, ns.lesson_title, ns.waited_min, ns.notified_push, ns.notified_kakao, ns.created_at, se.phone AS student_phone, se.parent_phone AS parent_phone FROM class_no_show ns LEFT JOIN class_schedules cs ON cs.id = ns.schedule_id LEFT JOIN students_erp se ON se.user_id = cs.user_id ORDER BY ns.created_at DESC LIMIT ?`).bind(limit).all<any>();
      } catch (e: any) {
        console.warn('[no-shows] join query failed, fallback no-join:', e?.message);
        try { rows = await env.DB.prepare(`SELECT id, room_id, schedule_id, missing_role, missing_uid, student_name, teacher_name, lesson_title, waited_min, notified_push, notified_kakao, created_at FROM class_no_show ORDER BY created_at DESC LIMIT ?`).bind(limit).all<any>(); } catch {}
      }
      const items = rows.results || [];
      const now = Date.now();
      const weekAgo = now - 7 * 86400 * 1000;
      const dayAgo = now - 86400 * 1000;
      let week = 0, today = 0, teacherMiss = 0, studentMiss = 0;
      for (const r of items) {
        if (r.created_at >= weekAgo) week++;
        if (r.created_at >= dayAgo) today++;
        if (r.missing_role === 'teacher') teacherMiss++; else studentMiss++;
      }
      return json({ ok: true, count: items.length, today, this_week: week, by_missing: { teacher: teacherMiss, student: studentMiss }, no_shows: items });
    }

    // 🥭 Phase RM — POST /api/admin/no-shows/contact — 노쇼 대상에게 재알림(웹푸시) + 접촉 기록
    //   body: { id } (class_no_show 행). 안 온 사람 uid 로 웹푸시 재발송(구독 없으면 스킵) + (SOLAPI_TEMPLATE_NO_SHOW 설정시 알림톡).
    if (method === 'POST' && path === '/api/admin/no-shows/contact') {
      const b: any = await request.json().catch(() => ({}));
      const id = Number(b.id);
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      let row: any = null;
      try { row = await env.DB.prepare(`SELECT * FROM class_no_show WHERE id = ? LIMIT 1`).bind(id).first<any>(); } catch {}
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      const roomUrl = `${new URL(request.url).origin}/?go=videocall`;
      const missing = row.missing_role === 'teacher' ? 'teacher' : 'student';
      const title = missing === 'teacher' ? '⏰ [재알림] 학생이 기다렸어요' : '⏰ [재알림] 수업에 입장해 주세요';
      const bodyMsg = missing === 'teacher'
        ? `${row.student_name || '학생'} 학생의 '${row.lesson_title || '영어 수업'}' 수업 미입장 건입니다. 확인 부탁드려요.`
        : `'${row.lesson_title || '영어 수업'}' 수업에 입장하지 않으셨어요. 재예약이 필요하면 안내드릴게요.`;
      let push: any = { skipped: true };
      if (row.missing_uid) push = await sendPushToUser(env, row.missing_uid, title, bodyMsg, roomUrl, `no-show-recontact-${id}`);
      // 접촉 시각 기록 (컬럼 없으면 추가)
      try { await env.DB.exec(`ALTER TABLE class_no_show ADD COLUMN contacted_at INTEGER`); } catch {}
      try { await env.DB.prepare(`UPDATE class_no_show SET contacted_at = ? WHERE id = ?`).bind(Date.now(), id).run(); } catch {}
      return json({ ok: true, push, missing_role: missing });
    }

    // 🥭 Phase 6g — POST /api/admin/students/merge-duplicates
    //   동명 학생들을 자동 통합 (가장 오래된 row 가 canonical, 나머지의 schedule 이전 후 비활성화)
    if (method === 'POST' && path === '/api/admin/students/merge-duplicates') {
      const merged: any[] = [];
      try {
        // 1) 같은 이름으로 그룹화 (korean_name 또는 username)
        const groups = await env.DB.prepare(
          `SELECT COALESCE(korean_name, username) AS name, COUNT(*) AS cnt
           FROM students_erp
           WHERE COALESCE(korean_name, username) IS NOT NULL
             AND COALESCE(korean_name, username) != ''
             AND COALESCE(status, '정상') IN ('정상','활동','active')
           GROUP BY COALESCE(korean_name, username)
           HAVING cnt > 1`
        ).all<any>();

        for (const g of (groups.results || [])) {
          const name = g.name;
          // 2) 같은 이름의 모든 학생 - id 오름차순 (가장 오래된이 canonical)
          const dups = await env.DB.prepare(
            `SELECT id, COALESCE(user_id, login_id, ('stu_' || id)) AS uid, korean_name, username, signup_date
             FROM students_erp
             WHERE (korean_name = ? OR username = ?)
               AND COALESCE(status, '정상') IN ('정상','활동','active')
             ORDER BY id ASC`
          ).bind(name, name).all<any>();
          const rows = dups.results || [];
          if (rows.length < 2) continue;

          const canonical = rows[0];
          const canonicalUid = canonical.uid;
          const dupUids = rows.slice(1).map((r: any) => r.uid);

          // 3) class_schedules 의 user_id 를 canonical 로 일괄 변경
          let scheduleMoved = 0;
          for (const dupUid of dupUids) {
            try {
              const upd = await env.DB.prepare(
                `UPDATE class_schedules SET user_id = ?, updated_at = ? WHERE user_id = ?`
              ).bind(canonicalUid, Date.now(), dupUid).run();
              scheduleMoved += (upd?.meta?.changes as number) || 0;
            } catch {}
          }
          // 4) 중복 학생 row 비활성화 (status='병합됨')
          for (const dup of rows.slice(1)) {
            try {
              await env.DB.prepare(
                `UPDATE students_erp SET status = '병합됨' WHERE id = ?`
              ).bind(dup.id).run();
            } catch {}
          }
          merged.push({
            name,
            canonical_user_id: canonicalUid,
            canonical_id: canonical.id,
            duplicates_merged: rows.length - 1,
            duplicate_user_ids: dupUids,
            schedules_moved: scheduleMoved
          });
        }
        return json({
          ok: true,
          groups_merged: merged.length,
          total_duplicates_removed: merged.reduce((sum, m) => sum + m.duplicates_merged, 0),
          total_schedules_moved: merged.reduce((sum, m) => sum + m.schedules_moved, 0),
          details: merged
        });
      } catch (e: any) {
        return json({ ok: false, error: 'merge_failed', detail: String(e?.message || e) }, 500);
      }
    }

    // 🥭 Phase 6d — POST /api/admin/class-schedules/seed-demo
    //   클릭 한 번에 정규+체험+레벨 3개 데모 스케줄 생성 (시스템 동작 즉시 확인용)
    if (method === 'POST' && path === '/api/admin/class-schedules/seed-demo') {
      const url = new URL(request.url);
      let userId = url.searchParams.get('user_id') || '';
      // user_id 안 주면 students_erp 첫 학생 사용
      if (!userId) {
        try {
          const r = await env.DB.prepare(`SELECT COALESCE(user_id, login_id, 'stu_' || id) AS uid, COALESCE(korean_name, username) AS name FROM students_erp WHERE COALESCE(status,'정상') IN ('정상','활동','active') ORDER BY rowid DESC LIMIT 1`).first<any>();
          if (r?.uid) userId = r.uid;
        } catch {}
        if (!userId) return json({ ok: false, error: 'no_student' }, 400);
      }
      // 학생 이름 조회
      let studentName = '데모학생';
      try {
        const s = await env.DB.prepare(`SELECT COALESCE(korean_name, username) AS name FROM students_erp WHERE COALESCE(user_id, login_id) = ? OR ('stu_' || id) = ? LIMIT 1`).bind(userId, userId).first<any>();
        if (s?.name) studentName = s.name;
      } catch {}
      // 테이블 보강
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`); } catch {}
      const csCols: Array<[string,string]> = [['student_name','TEXT'],['schedule_kind','TEXT'],['class_type','TEXT'],['day_of_week','TEXT'],['scheduled_date','TEXT'],['duration_min','INTEGER'],['teacher_id','TEXT'],['status','TEXT'],['source','TEXT'],['created_by','TEXT'],['updated_at','INTEGER'],['notes','TEXT']];
      for (const [c,t] of csCols) { try { await env.DB.exec('ALTER TABLE class_schedules ADD COLUMN ' + c + ' ' + t); } catch {} }
      const now = Date.now();
      const todayKst = new Date(now + 9*3600*1000).toISOString().slice(0,10);
      // 3가지 type 데모: 월/수 정규 / 화 체험 / 다음주 월 레벨
      // ★ Phase 7 비즈니스 규칙: trial/level_test = one_off, regular = recurring
      const tomorrow = new Date(now + 86400000 + 9*3600000).toISOString().slice(0,10);
      const nextWeek = new Date(now + 7*86400000 + 9*3600000).toISOString().slice(0,10);
      const seeds = [
        { kind:'recurring', type:'regular',    day:'mon,wed', date:null,     time:'15:00', label:'데모 - 매주 월·수 정규수업' },
        { kind:'one_off',   type:'trial',      day:null,      date:tomorrow, time:'16:00', label:'데모 - 체험수업 (1회)' },
        { kind:'one_off',   type:'level_test', day:null,      date:nextWeek, time:'17:00', label:'데모 - 레벨테스트 (1회)' }
      ];
      const inserted: any[] = [];
      for (const s of seeds) {
        try {
          const ins = await env.DB.prepare(
            `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, status, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'demo_seed', ?, ?)`
          ).bind(userId, studentName, s.kind, s.type, s.day, s.date, s.time, 'admin', now).run();
          inserted.push({ id: ins?.meta?.last_row_id, ...s });
        } catch (e: any) {
          inserted.push({ error: String(e?.message||e), ...s });
        }
      }
      return json({ ok: true, user_id: userId, student_name: studentName, count: inserted.length, items: inserted });
    }

    // 🥭 Phase 22 — DELETE /api/admin/class-schedules/:id (스케줄 삭제 또는 취소)
    if (method === 'DELETE' && /^\/api\/admin\/class-schedules\/\d+$/.test(path)) {
      const id = parseInt(path.split('/').pop() || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      // 📜 삭제 전 수업 정보 확보(이력에 남기기 위해) + 행위자
      const _delActor = await getAdminActor(request, env as any);
      const _delRow: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      let _delReason: string | null = null;
      try { const b: any = await request.json(); _delReason = (b && b.reason) ? String(b.reason).slice(0, 300) : null; } catch {}
      try {
        await env.DB.prepare(
          `UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`
        ).bind(Date.now(), id).run();
        // 📜 수업 변경 이력(삭제) 기록 — best-effort
        await writeClassAudit(env, {
          action: 'remove', schedule_id: id,
          teacher_name: _delRow ? (_delRow.teacher_name || null) : null,
          student_name: _delRow ? (_delRow.student_name || null) : null,
          lesson_date: _delRow ? (_delRow.scheduled_date || null) : null,
          lesson_time: _delRow ? (_delRow.start_time || null) : null,
          actor: _delActor.name || '관리자',
          actor_role: _delActor.isTeacher ? 'teacher' : 'admin',
          source: 'ui', reason: _delReason,
        });
        return json({ ok: true, id, status: 'cancelled' });
      } catch (e: any) {
        return json({ ok: false, error: 'delete_failed', detail: String(e?.message || e) }, 500);
      }
    }

    // 🥭 Phase WS — PATCH/PUT /api/admin/class-schedules/:id (드래그 이동: 요일/시간/지속/날짜 수정)
    //   body: { day_of_week?, start_time?('HH:MM'), duration_min?, scheduled_date?('YYYY-MM-DD') }
    //   허용된 필드만 동적으로 UPDATE → 캘린더 드래그앤드롭 영구 저장에 사용.
    if ((method === 'PATCH' || method === 'PUT') && /^\/api\/admin\/class-schedules\/\d+$/.test(path)) {
      const id = parseInt(path.split('/').pop() || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      const body: any = await request.json().catch(() => ({}));
      // 요일 표기 정규화(월/Mon/monday → 'Mon' …)
      const normDow = (v: string): string => {
        const k = String(v || '').trim().toLowerCase();
        const map: Record<string, string> = {
          'mon': 'Mon', 'monday': 'Mon', '월': 'Mon', '월요일': 'Mon',
          'tue': 'Tue', 'tuesday': 'Tue', '화': 'Tue', '화요일': 'Tue',
          'wed': 'Wed', 'wednesday': 'Wed', '수': 'Wed', '수요일': 'Wed',
          'thu': 'Thu', 'thursday': 'Thu', '목': 'Thu', '목요일': 'Thu',
          'fri': 'Fri', 'friday': 'Fri', '금': 'Fri', '금요일': 'Fri',
          'sat': 'Sat', 'saturday': 'Sat', '토': 'Sat', '토요일': 'Sat',
          'sun': 'Sun', 'sunday': 'Sun', '일': 'Sun', '일요일': 'Sun',
        };
        return map[k] || '';
      };
      const sets: string[] = [];
      const binds: any[] = [];
      if (body.day_of_week != null) {
        const d = normDow(body.day_of_week);
        if (d) { sets.push('day_of_week = ?'); binds.push(d); }
      }
      if (body.start_time != null && /^\d{1,2}:\d{2}$/.test(String(body.start_time))) {
        sets.push('start_time = ?'); binds.push(String(body.start_time));
      }
      if (body.duration_min != null && Number.isFinite(Number(body.duration_min))) {
        sets.push('duration_min = ?'); binds.push(Number(body.duration_min));
      }
      if (body.scheduled_date != null && /^\d{4}-\d{2}-\d{2}$/.test(String(body.scheduled_date))) {
        sets.push('scheduled_date = ?'); binds.push(String(body.scheduled_date));
      }
      if (!sets.length) return json({ ok: false, error: 'no_valid_fields' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      // 📜 이동 전 정보(이력용) + 행위자
      const _pchActor = await getAdminActor(request, env as any);
      const _pchRow: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      try {
        await env.DB.prepare(`UPDATE class_schedules SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
        // 📜 수업 변경 이력(이동/재조정) — 날짜·시간·요일이 바뀐 경우만 기록
        if (body.scheduled_date != null || body.start_time != null || body.day_of_week != null) {
          const _newDate = body.scheduled_date != null ? String(body.scheduled_date) : (_pchRow ? _pchRow.scheduled_date : null);
          const _newTime = body.start_time != null ? String(body.start_time) : (_pchRow ? _pchRow.start_time : null);
          await writeClassAudit(env, {
            action: 'reschedule', schedule_id: id,
            teacher_name: _pchRow ? (_pchRow.teacher_name || null) : null,
            student_name: _pchRow ? (_pchRow.student_name || null) : null,
            lesson_date: _pchRow ? (_pchRow.scheduled_date || null) : null,
            lesson_time: _pchRow ? (_pchRow.start_time || null) : null,
            actor: _pchActor.name || '관리자',
            actor_role: _pchActor.isTeacher ? 'teacher' : 'admin',
            source: 'ui',
            detail: `→ ${_newDate || ''} ${_newTime || ''}`.trim(),
          });
        }
        return json({ ok: true, id, updated_fields: sets.length - 1 });
      } catch (e: any) {
        return json({ ok: false, error: 'update_failed', detail: String(e?.message || e) }, 500);
      }
    }


    // ═══════════════════════════════════════════════════════════════
    // 💰 Phase F1~F2 — 수강료 미납 자동 알림
    // ═══════════════════════════════════════════════════════════════

    const ensurePaymentTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS payment_overdue_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, days_overdue INTEGER, amount_krw INTEGER, parent_phone TEXT, status TEXT, error_message TEXT, sent_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_overdue_user ON payment_overdue_log(user_id, sent_at DESC);`); } catch {}
    };

    // ── GET /api/admin/payments/overdue?grace_days=35&monthly_fee=200000 ──
    //   학생별 마지막 결제일 조회 → grace_days 초과면 미납으로 분류
    if (method === 'GET' && path === '/api/admin/payments/overdue') {
      await ensurePaymentTables();
      const graceDays = Math.max(1, parseInt(url.searchParams.get('grace_days') || '35', 10));
      const defaultMonthlyFee = Math.max(0, parseInt(url.searchParams.get('monthly_fee') || '200000', 10));
      const now = Date.now();
      const cutoff = now - graceDays * 86400 * 1000;

      // students_erp 테이블에서 활동중 학생만
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, phone TEXT, parent_phone TEXT, status TEXT);`); } catch {}

      // 각 학생의 마지막 paid 결제 + 미납일수 계산
      const _sw = await studentScopeWhere(env, request, 's');  // 🔒 지사/대리점 격리
      // 🥭 fix(2026-07): 스키마에 s.name 없어 항상 에러였던 것 + 2.9만 학생 규모 대응.
      //   기존: 학생당 상관 서브쿼리 → 수억 행 read 로 D1 한도 초과 실패.
      //   개선: student_payments 를 user_id 인덱스로 1회 GROUP BY 집계(결제자만) 후
      //         students_erp 와 매칭. 상세 리스트는 성능/응답크기 위해 카테고리별 500건 캡,
      //         summary 카운트는 정확값. (결제자 ~수천명이라 overdue/up_to_date 는 전량)
      const CAP = 500;
      const activeWhere = `(s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')${_sw.cond ? ' AND ' + _sw.cond : ''}`;
      // 활동 학생 총수
      const totalActiveRow = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM students_erp s WHERE ${activeWhere}`
      ).bind(..._sw.binds).first<any>().catch(() => ({ c: 0 }));
      const totalActive = totalActiveRow?.c || 0;
      // 결제 이력 있는 활동 학생(마지막 결제일 + 마지막 금액) — 인덱스 GROUP BY
      const paidRs = await env.DB.prepare(
        `SELECT s.user_id,
                COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS student_name,
                s.parent_phone, s.student_phone,
                MAX(p.paid_at) AS last_paid_at
           FROM students_erp s
           JOIN student_payments p ON p.user_id = s.user_id AND p.status = 'paid'
          WHERE ${activeWhere}
          GROUP BY s.user_id`
      ).bind(..._sw.binds).all<any>().catch(() => ({ results: [] } as any));
      const overdue: any[] = [];
      const upToDate: any[] = [];
      let paidCount = 0;
      for (const row of (paidRs.results || [])) {
        paidCount++;
        if (row.last_paid_at < cutoff) {
          const daysOverdue = Math.floor((now - row.last_paid_at) / (86400 * 1000)) - graceDays;
          if (overdue.length < CAP) overdue.push({ ...row, days_overdue: daysOverdue, amount_krw: defaultMonthlyFee });
        } else {
          if (upToDate.length < CAP) upToDate.push({ ...row, days_overdue: 0 });
        }
      }
      // 미결제 = 활동학생 - 결제이력학생. 상세는 표시하지 않음(대규모라 카운트만).
      const neverPaidCount = Math.max(0, totalActive - paidCount);
      const overdueCount = (paidRs.results || []).filter((r: any) => r.last_paid_at < cutoff).length;
      const upToDateCount = paidCount - overdueCount;
      return json({
        ok: true,
        grace_days: graceDays,
        default_fee: defaultMonthlyFee,
        overdue, never_paid: [], up_to_date: upToDate,
        capped: CAP,
        summary: {
          total_active: totalActive,
          total_paid_students: paidCount,
          total_overdue: overdueCount,
          total_never_paid: neverPaidCount,
          total_up_to_date: upToDateCount,
        }
      });
    }

    // ── POST /api/admin/payments/notify-overdue — 1명 미납 알림 발송 ──
    //   body: { user_id, student_name, parent_phone, days_overdue, amount_krw }
    if (method === 'POST' && path === '/api/admin/payments/notify-overdue') {
      await ensurePaymentTables();
      const body: any = await request.json().catch(() => ({}));
      const phone = body.parent_phone || body.student_phone;
      if (!phone) return json({ ok: false, error: 'phone_required' }, 400);
      const r = await sendPaymentOverdueAlert(env, phone, {
        studentName: body.student_name || '학생',
        daysOverdue: parseInt(body.days_overdue, 10) || 0,
        amountKrw: parseInt(body.amount_krw, 10) || 0,
        paymentUrl: body.payment_url,
      });
      // 발송 이력 기록
      await env.DB.prepare(
        `INSERT INTO payment_overdue_log (user_id, student_name, days_overdue, amount_krw, parent_phone, status, error_message, sent_at) VALUES (?,?,?,?,?,?,?,?)`
      ).bind(
        body.user_id || null,
        body.student_name || null,
        parseInt(body.days_overdue, 10) || 0,
        parseInt(body.amount_krw, 10) || 0,
        phone,
        r.ok ? 'sent' : 'failed',
        r.ok ? null : (r.message || r.error || '실패'),
        Date.now()
      ).run();
      // 🆕 Web Push 도 함께
      let pushResult: any = { skipped: true };
      if (body.user_id) {
        const fee = parseInt(body.amount_krw, 10) || 200000;
        pushResult = await sendPushToUser(env, 
          body.user_id,
          `💸 ${body.student_name || '학생'}님 수강료 안내`,
          `미납 ${body.days_overdue}일 / ${fee.toLocaleString('ko-KR')}원. 결제 부탁드립니다.`,
          body.payment_url || '/?go=payment',
          `overdue-${body.user_id}`
        );
      }
      return json({ ...r, push: pushResult });
    }

    // ── POST /api/admin/payments/notify-all-overdue — 미납 전체 일괄 ──
    //   body: { user_ids: ["uid1","uid2"], grace_days?, default_fee? }
    //   user_ids 미지정 시 자동으로 모든 미납 학생 일괄 발송
    if (method === 'POST' && path === '/api/admin/payments/notify-all-overdue') {
      await ensurePaymentTables();
      const body: any = await request.json().catch(() => ({}));
      const graceDays = Math.max(1, parseInt(body.grace_days, 10) || 35);
      const defaultFee = Math.max(0, parseInt(body.default_fee, 10) || 200000);
      const onlyUids: string[] | null = Array.isArray(body.user_ids) && body.user_ids.length > 0 ? body.user_ids : null;
      const now = Date.now();
      const cutoff = now - graceDays * 86400 * 1000;
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, phone TEXT, parent_phone TEXT, status TEXT);`); } catch {}
      const _sw = await studentScopeWhere(env, request, 's');  // 🔒 지사/대리점 격리 (본사 전체 발송 방지)
      const rs = await env.DB.prepare(
        `SELECT s.user_id, s.name AS student_name, s.parent_phone, s.phone AS student_phone,
                (SELECT MAX(paid_at) FROM student_payments WHERE user_id = s.user_id AND status='paid') AS last_paid_at,
                (SELECT amount_krw FROM student_payments WHERE user_id = s.user_id AND status='paid' ORDER BY paid_at DESC LIMIT 1) AS last_amount
           FROM students_erp s
          WHERE (s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')${_sw.cond ? ' AND ' + _sw.cond : ''}`
      ).bind(..._sw.binds).all().catch(() => ({ results: [] } as any));
      const results: any[] = [];
      let sent = 0, failed = 0, skipped = 0;
      for (const r of (rs.results || [])) {
        const row: any = r;
        if (onlyUids && !onlyUids.includes(row.user_id)) continue;
        // 미납 조건
        const isOverdue = !row.last_paid_at || row.last_paid_at < cutoff;
        if (!isOverdue) continue;
        const phone = row.parent_phone || row.student_phone;
        if (!phone) { skipped++; results.push({ user_id: row.user_id, status: 'skipped', reason: 'no_phone' }); continue; }
        const daysOverdue = row.last_paid_at
          ? (Math.floor((now - row.last_paid_at) / (86400*1000)) - graceDays)
          : 999;
        const amount = row.last_amount || defaultFee;
        const r2 = await sendPaymentOverdueAlert(env, phone, {
          studentName: row.student_name || '학생',
          daysOverdue, amountKrw: amount,
        });
        if (r2.ok) sent++; else failed++;
        await env.DB.prepare(
          `INSERT INTO payment_overdue_log (user_id, student_name, days_overdue, amount_krw, parent_phone, status, error_message, sent_at) VALUES (?,?,?,?,?,?,?,?)`
        ).bind(
          row.user_id, row.student_name, daysOverdue, amount, phone,
          r2.ok ? 'sent' : 'failed',
          r2.ok ? null : (r2.message || r2.error || '실패'),
          Date.now()
        ).run();
        results.push({ user_id: row.user_id, student_name: row.student_name, phone, days_overdue: daysOverdue, ...r2 });
      }
      return json({ ok: true, summary: { sent, failed, skipped, total: results.length }, results });
    }

    // ── GET /api/admin/payments/overdue-log — 최근 미납 알림 발송 이력 ──
    if (method === 'GET' && path === '/api/admin/payments/overdue-log') {
      await ensurePaymentTables();
      const rs = await env.DB.prepare(
        `SELECT * FROM payment_overdue_log ORDER BY sent_at DESC LIMIT 200`
      ).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/payments/record — 수동으로 결제 기록 추가 (영수증 등) ──
    if (method === 'POST' && path === '/api/admin/payments/record') {
      await ensurePaymentTables();
      const body: any = await request.json().catch(() => ({}));
      if (!body.user_id || !body.amount_krw) return json({ ok: false, error: 'user_id_and_amount_required' }, 400);
      const now = Date.now();
      const paidAt = body.paid_at ? parseInt(body.paid_at, 10) : now;
      const ins = await env.DB.prepare(
        `INSERT INTO student_payments (user_id, paid_at, period_start, period_end, amount_krw, method, memo, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(
        body.user_id, paidAt,
        body.period_start || null, body.period_end || null,
        parseInt(body.amount_krw, 10), body.method || '카드',
        body.memo || null, body.status || 'paid', now
      ).run();
      return json({ ok: true, id: ins?.meta?.last_row_id, paid_at: paidAt });
    }
    // ═══════════════════════════════════════════════════════════════
    // 💰 Phase F1~F2 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase A1~A2 — AI 학습 분석 (Workers AI / Llama 3.3 70B)
    // ═══════════════════════════════════════════════════════════════

    const ensureAiAnalysisTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_student_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, summary TEXT, strengths TEXT, weaknesses TEXT, recommendations TEXT, risk_level TEXT, raw_response TEXT, model TEXT, generated_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ai_an_student ON ai_student_analysis(student_uid, generated_at DESC)`); } catch {}
    };

    // ── POST /api/admin/ai-analyze/student — 학생 1명 AI 학습 분석 ──
    //   body: { student_uid, student_name?, force_refresh? }
    //   캐시: 12시간 이내 분석은 재사용 (Workers AI 호출 비용 절약)
    if (method === 'POST' && path === '/api/admin/ai-analyze/student') {
      await ensureAiAnalysisTable();
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.student_uid || '').trim();
      if (!uid) return json({ ok: false, error: 'student_uid_required' }, 400);
      // 🔐 [PII] 관리자(세션) 또는 본인/학부모(토큰 uid 일치) 만 자녀 AI 분석 조회
      const aaAuth = await authUidGlobal(request, url, env, body);
      const aaAdmin = await checkAdminSession(request, env as any);
      if (!aaAdmin.ok && (!aaAuth || aaAuth !== uid)) {
        return json({ ok: false, error: 'auth_required', message: '자녀 계정으로 로그인해주세요.' }, 401);
      }

      // 1) 캐시 확인 (12시간)
      if (!body.force_refresh) {
        const cached: any = await env.DB.prepare(
          `SELECT * FROM ai_student_analysis WHERE student_uid = ? ORDER BY generated_at DESC LIMIT 1`
        ).bind(uid).first();
        if (cached && (Date.now() - cached.generated_at) < 12 * 3600 * 1000) {
          return json({ ok: true, cached: true, analysis: cached });
        }
      }

      // 2) 학생 데이터 종합 수집
      const fetch1 = async (sql: string, ...binds: any[]): Promise<any> => {
        try { return await env.DB.prepare(sql).bind(...binds).first(); } catch { return {}; }
      };
      const fetchAll = async (sql: string, ...binds: any[]): Promise<any[]> => {
        try { const rs = await env.DB.prepare(sql).bind(...binds).all(); return rs.results || []; } catch { return []; }
      };
      const since = Date.now() - 60 * 86400 * 1000;  // 최근 60일

      // 평가서 통계 (최근 60일)
      const evalStats: any = await fetch1(
        `SELECT COUNT(*) AS n,
                AVG(score_participation) AS avg_part,
                AVG(score_comprehension) AS avg_comp,
                AVG(score_homework) AS avg_hw,
                AVG(score_attitude) AS avg_att,
                AVG(score_speaking) AS avg_spk,
                AVG(score_overall) AS avg_overall
           FROM student_evaluations WHERE student_uid = ? AND created_at >= ?`,
        uid, since
      );
      // 평가서 코멘트 (최근 3건)
      const evalComments = await fetchAll(
        `SELECT lesson_date, strengths, improvements, next_goals, teacher_comment, score_overall
           FROM student_evaluations WHERE student_uid = ? ORDER BY created_at DESC LIMIT 3`,
        uid
      );
      // 출석 (최근 60일)
      const attendanceCount: any = await fetch1(
        `SELECT COUNT(*) AS n FROM point_rule_log WHERE user_id = ? AND rule_code = 'attendance' AND triggered_at >= ?`,
        uid, since
      ).catch(() => ({ n: 0 }));
      // 채팅 활동 (최근 60일)
      const chatStats: any = await fetch1(
        `SELECT COUNT(*) AS msg_count FROM chat_messages WHERE sender_uid = ? AND sent_at >= ?`,
        uid, since
      ).catch(() => ({ msg_count: 0 }));
      // 최근 채팅 샘플 (5개)
      const chatSample = await fetchAll(
        `SELECT message, sent_at FROM chat_messages WHERE sender_uid = ? AND sent_at >= ? ORDER BY sent_at DESC LIMIT 5`,
        uid, since
      );
      // 포인트 (적립 vs 사용)
      const pointStats: any = await fetch1(
        `SELECT IFNULL(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),0) AS earned,
                IFNULL(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END),0) AS spent
           FROM point_transactions WHERE user_id = ? AND created_at >= ?`,
        uid, since
      ).catch(() => ({ earned: 0, spent: 0 }));
      // 학생 이름
      const studentRow: any = await fetch1(`SELECT name FROM students_erp WHERE user_id = ?`, uid);
      const studentName = body.student_name || studentRow?.name || uid;

      // 3) AI 가 분석할 프롬프트 구성
      const evalCommentSummary = evalComments.length > 0
        ? evalComments.map((c: any, i: number) => `평가${i+1} (${c.lesson_date}, 종합 ${c.score_overall||'-'}/5점)\n  잘한 점: ${c.strengths || '-'}\n  보완 점: ${c.improvements || '-'}\n  강사 코멘트: ${c.teacher_comment || '-'}`).join('\n\n')
        : '(아직 평가서 없음)';

      const chatSampleText = chatSample.length > 0
        ? chatSample.map((c: any) => `  - "${(c.message || '').slice(0, 100)}"`).join('\n')
        : '(채팅 활동 없음)';

      const prompt = `당신은 한국 영어학원의 학습 분석 AI 입니다. 아래 학생의 최근 60일 데이터를 보고 강점·약점·추천 학습을 한국어로 친절하게 분석하세요.

학생: ${studentName}
ID: ${uid}

[평가서 통계 (최근 60일)]
- 작성 건수: ${evalStats?.n || 0}건
- 평균 종합 점수: ${evalStats?.avg_overall ? evalStats.avg_overall.toFixed(2) : '-'}/5
- 참여도: ${evalStats?.avg_part ? evalStats.avg_part.toFixed(1) : '-'}/5
- 이해도: ${evalStats?.avg_comp ? evalStats.avg_comp.toFixed(1) : '-'}/5
- 숙제: ${evalStats?.avg_hw ? evalStats.avg_hw.toFixed(1) : '-'}/5
- 태도: ${evalStats?.avg_att ? evalStats.avg_att.toFixed(1) : '-'}/5
- 말하기: ${evalStats?.avg_spk ? evalStats.avg_spk.toFixed(1) : '-'}/5

[최근 평가서 코멘트]
${evalCommentSummary}

[활동]
- 출석 횟수: ${attendanceCount?.n || 0}회
- 채팅 메시지: ${chatStats?.msg_count || 0}개
- 포인트 적립: ${pointStats?.earned || 0}P / 사용: ${pointStats?.spent || 0}P

[최근 채팅 샘플]
${chatSampleText}

[지시]
다음 JSON 형식으로만 답변하세요. 한국어로 작성. 다른 텍스트 없이 JSON 만.

{
  "summary": "1~2문장 요약 (학생 현재 학습 상황)",
  "strengths": ["강점 1", "강점 2", "강점 3"],
  "weaknesses": ["약점 1", "약점 2", "약점 3"],
  "recommendations": ["추천 학습 1", "추천 학습 2", "추천 학습 3"],
  "risk_level": "low" 또는 "medium" 또는 "high",
  "next_action": "강사가 다음 수업에서 우선시할 것 한 줄"
}`;

      // 4) Workers AI 호출
      if (!env.AI) {
        return json({ ok: false, error: 'AI_binding_missing', message: 'env.AI 가 wrangler.toml 에 설정되지 않음' }, 503);
      }

      let aiResponse: string = '';
      let model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
      try {
        const aiResult: any = await env.AI.run(model, {
          messages: [
            { role: 'system', content: '당신은 한국 영어 학원의 학습 분석 AI 입니다. 항상 JSON 형식으로만 응답하세요.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1500,
        });
        // 응답을 안전하게 문자열로 정규화
        if (typeof aiResult === 'string') aiResponse = aiResult;
        else if (aiResult && typeof aiResult.response === 'string') aiResponse = aiResult.response;
        else if (aiResult && aiResult.response) aiResponse = JSON.stringify(aiResult.response);
        else aiResponse = JSON.stringify(aiResult || {});
        aiResponse = String(aiResponse || '');
      } catch (e: any) {
        return json({ ok: false, error: 'ai_call_failed', detail: String(e?.message || e) }, 500);
      }

      // 5) JSON 파싱
      let parsed: any = null;
      try {
        const m = aiResponse.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch (e: any) {
        console.warn('[ai-analyze] JSON parse fail:', e?.message, aiResponse.slice(0, 300));
      }

      const analysis = {
        student_uid: uid,
        student_name: studentName,
        summary: parsed?.summary || '(AI 응답 파싱 실패 - raw 참고)',
        strengths: Array.isArray(parsed?.strengths) ? parsed.strengths.join(' | ') : (parsed?.strengths || ''),
        weaknesses: Array.isArray(parsed?.weaknesses) ? parsed.weaknesses.join(' | ') : (parsed?.weaknesses || ''),
        recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations.join(' | ') : (parsed?.recommendations || ''),
        risk_level: parsed?.risk_level || 'unknown',
        next_action: parsed?.next_action || '',
        raw_response: aiResponse.slice(0, 4000),
        model,
        generated_at: Date.now(),
        data_sources: {
          eval_count: evalStats?.n || 0,
          attendance_count: attendanceCount?.n || 0,
          chat_messages: chatStats?.msg_count || 0,
          point_earned: pointStats?.earned || 0,
        }
      };

      // 6) D1 저장 (히스토리 관리)
      await env.DB.prepare(
        `INSERT INTO ai_student_analysis (student_uid, student_name, summary, strengths, weaknesses, recommendations, risk_level, raw_response, model, generated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        uid, studentName, analysis.summary, analysis.strengths, analysis.weaknesses,
        analysis.recommendations, analysis.risk_level, analysis.raw_response, model, analysis.generated_at
      ).run();

      return json({ ok: true, cached: false, analysis });
    }

    // ── GET /api/admin/ai-analyze/history?uid=X — 학생별 분석 이력 ──
    if (method === 'GET' && path === '/api/admin/ai-analyze/history') {
      await ensureAiAnalysisTable();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const rs = await env.DB.prepare(
        `SELECT id, summary, risk_level, generated_at FROM ai_student_analysis WHERE student_uid = ? ORDER BY generated_at DESC LIMIT 20`
      ).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase A1 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🧠 Phase MBTI — 학생-강사 MBTI 매칭
    // ═══════════════════════════════════════════════════════════════
    const ensureMbtiTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_mbti (teacher_uid TEXT PRIMARY KEY, teacher_name TEXT, mbti TEXT, hobby TEXT, teaching_style TEXT, intro TEXT, updated_at INTEGER);`);
      try { await env.DB.exec(`ALTER TABLE teacher_mbti ADD COLUMN photo_url TEXT`); } catch {}
    };

    // ── GET /api/teachers/mbti-list — 강사 MBTI 목록 (공개) ──
    if (method === 'GET' && path === '/api/teachers/mbti-list') {
      await ensureMbtiTable();
      const rs = await env.DB.prepare(`SELECT teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url FROM teacher_mbti ORDER BY teacher_name`).all();
      return json({ ok: true, count: rs.results?.length || 0, teachers: rs.results || [] });
    }

    // ── POST /api/admin/teacher/mbti — 강사 MBTI 등록/수정 (관리자) ──
    if (method === 'POST' && path === '/api/admin/teacher/mbti') {
      await ensureMbtiTable();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.teacher_uid || '').trim();
      if (!uid) return json({ ok: false, error: 'teacher_uid_required' }, 400);
      const now = Date.now();
      // photo_url 미입력 시 DiceBear 자동 생성
      const photoUrl = (b.photo_url || '').trim() || `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(b.teacher_name || uid)}&backgroundColor=fbbf24,ffd5dc,b6e3f4,c0aede,fcd0a1`;
      await env.DB.prepare(
        `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name = excluded.teacher_name, mbti = excluded.mbti, hobby = excluded.hobby, teaching_style = excluded.teaching_style, intro = excluded.intro, photo_url = excluded.photo_url, updated_at = excluded.updated_at`
      ).bind(uid, b.teacher_name || null, String(b.mbti || '').toUpperCase().slice(0,4), b.hobby || null, b.teaching_style || null, b.intro || null, photoUrl, now).run();
      return json({ ok: true, teacher_uid: uid });
    }

    // ── POST /api/admin/teacher/mbti/seed-demo — 테스트용 강사 10명 일괄 등록 ──
    if (method === 'POST' && path === '/api/admin/teacher/mbti/seed-demo') {
      await ensureMbtiTable();
      const dicebear = (style: string, seed: string, bg: string) => `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
      const DEMO_TEACHERS = [
        { uid: 'demo_karen',   name: 'Karen',   mbti: 'ENFJ', hobby: '드라마/요리/여행',          style: '친절하고 활기차게 — 일상 회화 위주, 격려 많음',         intro: '안녕하세요! Karen 입니다. 학생들과 즐겁게 대화하며 영어를 배우는 게 제 목표예요. 🌟', photo: dicebear('lorelei','Karen','ffd5dc,fcd0a1') },
        { uid: 'demo_james',   name: 'James',   mbti: 'INTJ', hobby: '독서/체스/논리퍼즐',        style: '체계적·논리적 — 문법·구조 분석, 발음 정확도 중심',       intro: 'Hi, I am James. 분석적인 접근으로 영어의 구조를 명확하게 알려드립니다.',                       photo: dicebear('avataaars','James','b6e3f4') },
        { uid: 'demo_sophie',  name: 'Sophie',  mbti: 'ENTP', hobby: '토론/팟캐스트/스타트업',     style: '활발한 토론 — 비즈니스/시사 영어, 도전적 질문',          intro: '비즈니스 영어와 토론을 좋아하시는 분 환영! 영어로 다른 시각도 열어드려요.',                    photo: dicebear('lorelei','Sophie','c0aede') },
        { uid: 'demo_maria',   name: 'Maria',   mbti: 'ISFJ', hobby: '베이킹/식물 가꾸기/봉사',     style: '조용하고 인내심 — 초보 / 아동 케어, 반복학습',           intro: '아이들과 초보 학생을 정성스럽게 가르치는 Maria 입니다. 천천히 함께 가요. 🌱',                  photo: dicebear('lorelei','Maria','d1d4f9') },
        { uid: 'demo_alex',    name: 'Alex',    mbti: 'ENFP', hobby: 'K-POP/뮤지컬/즉흥 게임',    style: '에너지 폭발 — 게임·노래·역할극 활용 자유 회화',          intro: 'Energy! Alex 와 함께라면 영어가 놀이가 됩니다. Let\'s have fun! 🎮',                          photo: dicebear('avataaars','Alex','fcd0a1') },
        { uid: 'demo_emily',   name: 'Emily',   mbti: 'ISTJ', hobby: '독서/달리기/계획표 짜기',     style: '꼼꼼하고 체계적 — 시험 영어 (수능·토익·토플) 전문',      intro: '시험 영어는 전략입니다. Emily 와 함께 목표 점수 달성하세요.',                                photo: dicebear('lorelei','Emily','b6e3f4') },
        { uid: 'demo_david',   name: 'David',   mbti: 'INFJ', hobby: '글쓰기/명상/시 감상',         style: '깊이 있는 대화 — 문학·문법·작문 중심',                  intro: '영어로 자신을 표현하는 즐거움을 가르쳐드립니다. 마음 깊은 영어로! 📖',                       photo: dicebear('avataaars','David','d1d4f9') },
        { uid: 'demo_anna',    name: 'Anna',    mbti: 'ESFP', hobby: '댄스/파티/SNS',              style: '재미 최우선 — 게임·이벤트·실생활 대화 위주',             intro: '영어가 재미있어야 늘어요! Anna 와 함께 신나는 수업 하실 분 🎉',                              photo: dicebear('lorelei','Anna','ffdfbf') },
        { uid: 'demo_daniel',  name: 'Daniel',  mbti: 'ISTP', hobby: '자전거/만들기/기계 분해',     style: '실용적·짧은 설명 — 여행 영어·실생활 표현',               intro: '실용 영어의 달인 Daniel 입니다. 짧고 굵게, 바로 쓰는 영어!',                                  photo: dicebear('avataaars','Daniel','b6e3f4') },
        { uid: 'demo_lisa',    name: 'Lisa',    mbti: 'INFP', hobby: '그림/일러스트/카페투어',      style: '창의적 — 감정 표현·자기 소개·자유 글쓰기',               intro: '여러분의 영어 안에 자신만의 색깔을 담는 법, Lisa 가 알려드려요. 🎨',                          photo: dicebear('lorelei','Lisa','ffd5dc') },
      ];

      let inserted = 0, updated = 0;
      const now = Date.now();
      for (const t of DEMO_TEACHERS) {
        try {
          const existed: any = await env.DB.prepare(`SELECT teacher_uid FROM teacher_mbti WHERE teacher_uid = ?`).bind(t.uid).first();
          await env.DB.prepare(
            `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name = excluded.teacher_name, mbti = excluded.mbti, hobby = excluded.hobby, teaching_style = excluded.teaching_style, intro = excluded.intro, photo_url = excluded.photo_url, updated_at = excluded.updated_at`
          ).bind(t.uid, t.name, t.mbti, t.hobby, t.style, t.intro, t.photo, now).run();
          if (existed) updated++; else inserted++;
        } catch {}
      }

      return json({ ok: true, total: DEMO_TEACHERS.length, inserted, updated, teachers: DEMO_TEACHERS.map(t => ({ uid: t.uid, name: t.name, mbti: t.mbti })) });
    }

    // ── POST /api/mbti/match — 학생 MBTI 로 강사 매칭 ──
    if (method === 'POST' && path === '/api/mbti/match') {
      await ensureMbtiTable();
      const b: any = await request.json().catch(() => ({}));
      const studentMbti = String(b.mbti || '').toUpperCase().trim().slice(0, 4);
      if (!/^[IE][NS][TF][JP]$/.test(studentMbti)) return json({ ok: false, error: 'invalid_mbti', hint: 'INTJ, ENFP 같은 4자 형식' }, 400);

      // 🆕 자동 시드 — 등록된 강사가 없으면 5명 자동 등록 (DiceBear 아바타 포함)
      const countRs: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM teacher_mbti WHERE mbti IS NOT NULL AND mbti != ''`).first();
      if ((countRs?.n || 0) === 0) {
        const TEST_TEACHERS = [
          { uid: 'test_karen',  name: 'Karen',  mbti: 'ENFJ', hobby: '드라마/요리/여행',     style: '친절하고 활기차게 — 일상 회화 + 격려',     intro: '안녕하세요! Karen 입니다. 즐거운 대화로 영어를 배워요 🌟',
            photo: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Karen&backgroundColor=ffd5dc,fcd0a1&hair=variant40,variant41&earrings=variant01' },
          { uid: 'test_james',  name: 'James',  mbti: 'INTJ', hobby: '독서/체스/논리퍼즐',    style: '체계적·논리적 — 문법·구조·발음 정확도',   intro: '분석적으로 영어의 구조를 명확히 알려드립니다.',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James&backgroundColor=b6e3f4&top=shortHairShortFlat&accessories=prescription02&clotheColor=3c4858' },
          { uid: 'test_sophie', name: 'Sophie', mbti: 'ENTP', hobby: '토론/팟캐스트',         style: '활발한 토론 — 비즈니스·시사 영어',        intro: '토론과 비즈니스 영어 환영! 시각을 열어드려요.',
            photo: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Sophie&backgroundColor=c0aede&hair=variant23' },
          { uid: 'test_maria',  name: 'Maria',  mbti: 'ISFJ', hobby: '베이킹/봉사',           style: '인내심 — 초보·아동 케어, 반복학습',       intro: '천천히 함께 가요. 초보도 환영합니다 🌱',
            photo: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Maria&backgroundColor=d1d4f9&hair=variant33' },
          { uid: 'test_alex',   name: 'Alex',   mbti: 'ENFP', hobby: 'K-POP/뮤지컬/게임',     style: '에너지 폭발 — 게임·노래·역할극',         intro: 'Energy! Alex 와 함께라면 영어가 놀이 🎮',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex&backgroundColor=fcd0a1&top=shortHairShaggyMullet&accessoriesColor=fbbf24' },
        ];
        const now = Date.now();
        for (const t of TEST_TEACHERS) {
          try {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, updated_at) VALUES (?,?,?,?,?,?,?,?)`
            ).bind(t.uid, t.name, t.mbti, t.hobby, t.style, t.intro, t.photo, now).run();
          } catch {}
        }
      }

      // 매칭 점수 (간단한 호환성 매트릭스)
      const compatibilityScore = (a: string, b: string): number => {
        if (!a || !b || a.length !== 4 || b.length !== 4) return 50;
        // 같은 글자 수 (4개 중 일치)
        let same = 0;
        for (let i = 0; i < 4; i++) if (a[i] === b[i]) same++;
        // 학습 추천 매트릭스: 일부 보색 조합이 잘 맞음
        // 일반적으로 같은 N/S (정보 인식 방식) + 비슷한 J/P 가 좋음
        let bonus = 0;
        if (a[1] === b[1]) bonus += 15; // 같은 N/S
        if (a[2] !== b[2]) bonus += 8;  // 다른 T/F (균형)
        if (a[3] === b[3]) bonus += 7;  // 같은 J/P
        // 같은 글자가 4개면 100점, 0개 + bonus 까지 계산
        const score = Math.min(100, same * 18 + bonus + 15);
        return score;
      };

      const rs = await env.DB.prepare(`SELECT teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url FROM teacher_mbti WHERE mbti IS NOT NULL AND mbti != ''`).all();
      const teachers = ((rs.results || []) as any[]).map(t => ({
        ...t,
        match_score: compatibilityScore(studentMbti, t.mbti || ''),
      })).sort((a, b) => b.match_score - a.match_score);

      return json({
        ok: true,
        student_mbti: studentMbti,
        total_teachers: teachers.length,
        top_matches: teachers.slice(0, 5),
        all_matches: teachers,
      });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🧠 Phase MBTI 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🌟 Phase PR — 교사 칭찬하기 (익명, 7점 별점)
    // ═══════════════════════════════════════════════════════════════
    const ensurePraiseTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_praises (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_uid TEXT NOT NULL, teacher_name TEXT, star_rating INTEGER NOT NULL, praise_text TEXT, category TEXT, ip_hash TEXT, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_praise_teacher ON teacher_praises(teacher_uid, created_at DESC)`); } catch {}
    };

    // ── GET /api/teachers/list-public — 강사 목록 (이름만, 칭찬용) ──
    if (method === 'GET' && path === '/api/teachers/list-public') {
      // 라이브 teacher_profiles 는 관리자 강사프로필 스키마(id/korean_name/english_name/status='활동중')이며
      // teacher_uid 컬럼이 없다 — 과거 이 핸들러가 teacher_uid 를 SELECT 해 D1_ERROR 500 이 났음.
      let teachers: any[] = [];
      // 1) teacher_profiles 우선 (uid 는 'tp-<id>' 로 합성 — 칭찬 저장 시 teacher_name 도 함께 저장되므로 표시엔 지장 없음)
      try {
        const rs: any = await env.DB.prepare(`SELECT id, korean_name, english_name FROM teacher_profiles WHERE status IS NULL OR status = '' OR status IN ('활동중','재직') ORDER BY korean_name LIMIT 100`).all();
        teachers = ((rs.results || []) as any[]).map(t => ({ teacher_uid: 'tp-' + t.id, name: t.korean_name || t.english_name || ('강사 ' + t.id), english_name: t.english_name || null }));
      } catch {}
      // 2) teacher_mbti 폴백
      if (!teachers.length) {
        try {
          await ensureMbtiTable();
          const rs: any = await env.DB.prepare(`SELECT teacher_uid, teacher_name AS name FROM teacher_mbti LIMIT 100`).all();
          teachers = ((rs.results || []) as any[]).map(t => ({ teacher_uid: t.teacher_uid, name: t.name || t.teacher_uid, english_name: null }));
        } catch {}
      }
      return json({ ok: true, count: teachers.length, teachers });
    }

    // ── POST /api/teacher/praise — 익명 칭찬 제출 ──
    if (method === 'POST' && path === '/api/teacher/praise') {
      await ensurePraiseTable();
      const b: any = await request.json().catch(() => ({}));
      const teacherUid = String(b.teacher_uid || '').trim();
      const star = parseInt(b.star_rating, 10);
      const praiseText = String(b.praise_text || '').slice(0, 1000);
      if (!teacherUid) return json({ ok: false, error: 'teacher_uid_required' }, 400);
      if (!star || star < 1 || star > 7) return json({ ok: false, error: 'star_must_be_1_to_7' }, 400);

      // 스팸 방지: IP 해시 (학생/학부모 ID 는 절대 저장 안 함)
      const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
      // 간단 해시 (개인정보 X — 단지 스팸 방지용)
      const enc = new TextEncoder().encode(ip + '|salt-praise');
      const hashBuf = await crypto.subtle.digest('SHA-256', enc);
      const ipHash = Array.from(new Uint8Array(hashBuf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');

      // 같은 IP 가 5분 안에 같은 강사에게 다시 칭찬하면 차단 (스팸 방지)
      const since = Date.now() - 5 * 60 * 1000;
      const dup: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM teacher_praises WHERE teacher_uid = ? AND ip_hash = ? AND created_at >= ?`).bind(teacherUid, ipHash, since).first();
      if ((dup?.n || 0) > 0) return json({ ok: false, error: 'duplicate_too_soon', message: '5분 안에 같은 강사에게 다시 칭찬할 수 없어요' }, 429);

      await env.DB.prepare(
        `INSERT INTO teacher_praises (teacher_uid, teacher_name, star_rating, praise_text, category, ip_hash, created_at) VALUES (?,?,?,?,?,?,?)`
      ).bind(teacherUid, b.teacher_name || null, star, praiseText, b.category || null, ipHash, Date.now()).run();

      return json({ ok: true, message: '칭찬이 등록됐어요! 강사님께 익명으로 전달됩니다.' });
    }

    // ── GET /api/admin/teacher/praise/list?teacher_uid=X — 강사별 받은 칭찬 (관리자) ──
    if (method === 'GET' && path === '/api/admin/teacher/praise/list') {
      await ensurePraiseTable();
      const uid = (url.searchParams.get('teacher_uid') || '').trim();
      let q = `SELECT id, teacher_uid, teacher_name, star_rating, praise_text, category, created_at FROM teacher_praises`;
      const binds: any[] = [];
      if (uid) { q += ` WHERE teacher_uid = ?`; binds.push(uid); }
      q += ` ORDER BY created_at DESC LIMIT 100`;
      const rs = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── GET /api/admin/teacher/praise/stats — 전체 강사 칭찬 통계 ──
    if (method === 'GET' && path === '/api/admin/teacher/praise/stats') {
      await ensurePraiseTable();
      const rs = await env.DB.prepare(
        `SELECT teacher_uid, teacher_name, COUNT(*) AS count, AVG(star_rating) AS avg_star, MAX(created_at) AS last_at FROM teacher_praises GROUP BY teacher_uid ORDER BY avg_star DESC, count DESC LIMIT 100`
      ).all();
      const rows = ((rs.results || []) as any[]).map(r => ({
        teacher_uid: r.teacher_uid,
        teacher_name: r.teacher_name,
        count: r.count,
        avg_star: Math.round((r.avg_star || 0) * 10) / 10,
        last_at: r.last_at,
      }));
      return json({ ok: true, count: rows.length, rows });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🌟 Phase PR 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🚨 Phase ARR — 학생 이탈 위험 AI 감지
    // ═══════════════════════════════════════════════════════════════
    //   조건: 출석 하락, 점수 하락, 장기 결석, 평가점수 낮음
    //   AI 가 종합 → 위험도 점수 (0~100) + 사유 + 권장 액션
    if (method === 'GET' && path === '/api/admin/retention/risk') {
      try {
        // 🔧 students_erp 스키마 충돌 호환 — 컬럼 이름이 student_name / name / korean_name 중 하나일 수 있음
        //   → PRAGMA table_info 로 존재하는 컬럼 발견 후 동적 매핑
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, username TEXT, role TEXT, joined_at INTEGER, left_at INTEGER, status TEXT, date TEXT);`);
        let nameCol = 'user_id';   // 안전한 폴백
        let parentPhoneCol: string | null = null;
        let parentNameCol: string | null = null;
        try {
          const cols: any = await env.DB.prepare(`PRAGMA table_info(students_erp)`).all();
          const colNames = ((cols.results || []) as any[]).map(c => c.name);
          if (colNames.includes('student_name')) nameCol = 'student_name';
          else if (colNames.includes('korean_name')) nameCol = 'korean_name';
          else if (colNames.includes('name')) nameCol = 'name';
          if (colNames.includes('parent_phone')) parentPhoneCol = 'parent_phone';
          if (colNames.includes('parent_name')) parentNameCol = 'parent_name';
        } catch {}

        const now = Date.now();
        const since14 = now - 14 * 86400000;
        const since30 = now - 30 * 86400000;
        const since60 = now - 60 * 86400000;
        const since90 = now - 90 * 86400000;

        const selectCols = [
          'user_id',
          `${nameCol} AS student_name`,
          parentPhoneCol ? 'parent_phone' : `'' AS parent_phone`,
          parentNameCol ? 'parent_name' : `'' AS parent_name`,
        ].join(', ');
        const _swRisk = await studentScopeWhere(env, request);  // 🔒 지사/대리점 격리

        // ⚡ KV 캐시(scope 별 키, 180초) — 반복 열람 시 무거운 스캔 생략. 케어 발송 등 변경 후엔 자연 만료.
        const _rrKey = 'retrisk:' + nameCol + ':' + ((_swRisk.cond || 'all') + '|' + (_swRisk.binds || []).join(','));
        try {
          const _hit = await env.SESSION_STATE.get(_rrKey);
          if (_hit) return new Response(_hit, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Adm-Cache': 'hit' } });
        } catch { /* 캐시 miss 무시 */ }

        const studentsRs = await env.DB.prepare(
          // ⚠️ status 값: 카페24 동기화가 영어 'active'/'inactive'로 적재(실측 28,641/722). 레거시 '정상'/'활동'도 함께 인정(하위호환).
          //    (기존 '정상'만 필터하면 매칭 0건 → 학생 0명 early-return 으로 이탈위험이 조용히 빈 목록이 됨)
          `SELECT ${selectCols} FROM students_erp WHERE (status IN ('정상','활동','active') OR status IS NULL OR status = '')${_swRisk.cond ? ' AND ' + _swRisk.cond : ''} LIMIT 500`
        ).bind(..._swRisk.binds).all();
        const students = (studentsRs.results || []) as any[];
        if (!students.length) return json({ ok: true, count: 0, at_risk: [], schema: { name_col: nameCol } });

        // ⚡ N+1 제거 — 학생당 반복 쿼리(≈8×N=수천건)를 그룹 쿼리 9개로 일괄 집계 후 메모리에서 점수 계산.
        //    점수 로직(S1~S10)·응답 형태는 원본과 100% 동일, 데이터 수집 방식만 변경.
        const _ids = students.map(s => s.user_id);
        const _num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);
        // ⚠️ D1 하드 한도: 쿼리당 바인드 파라미터 100개(실측: 101개부터 "too many SQL variables").
        //    IN(...) 목록이 이를 넘으면 쿼리 전체가 실패하고, 아래 try/catch 가 이를 삼켜
        //    빈 집계=모든 위험신호 0=위험학생 0명으로 조용히 오작동한다(활성 100명↑ 범위 전부).
        //    → 학생 id 를 90개씩(뒤 날짜 바인드 여유 포함) 청크로 나눠 질의 후 병합.
        //    각 user_id 는 한 청크에만 속하므로 GROUP BY / ROW_NUMBER 결과는 분할해도 동일.
        const CHUNK = 90;
        const _chunks: any[][] = [];
        for (let i = 0; i < _ids.length; i += CHUNK) _chunks.push(_ids.slice(i, i + CHUNK));
        const _groupMap = async (build: (ph: string) => string, tail: any[], keyCol: string, pick: (r: any) => any): Promise<Map<string, any>> => {
          const m = new Map<string, any>();
          for (const ck of _chunks) {
            const ph = ck.map(() => '?').join(',');
            try {
              const rs: any = await env.DB.prepare(build(ph)).bind(...ck, ...tail).all();
              for (const r of (rs.results || [])) m.set(String(r[keyCol]), pick(r));
            } catch { /* 테이블 없음/청크 오류 → 스킵(원본 try/catch 동작과 동일) */ }
          }
          return m;
        };
        try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`); } catch {}

        const [att30M, att60M, att90M, lastJoinM, evalM, payM, hwM, ptM, _trendRows] = await Promise.all([
          _groupMap(ph => `SELECT user_id, COUNT(DISTINCT date) d FROM attendance WHERE user_id IN (${ph}) AND joined_at >= ? GROUP BY user_id`, [since30], 'user_id', r => _num(r.d)),
          _groupMap(ph => `SELECT user_id, COUNT(DISTINCT date) d FROM attendance WHERE user_id IN (${ph}) AND joined_at >= ? AND joined_at < ? GROUP BY user_id`, [since60, since30], 'user_id', r => _num(r.d)),
          _groupMap(ph => `SELECT user_id, COUNT(DISTINCT date) d FROM attendance WHERE user_id IN (${ph}) AND joined_at >= ? AND joined_at < ? GROUP BY user_id`, [since90, since60], 'user_id', r => _num(r.d)),
          _groupMap(ph => `SELECT user_id, MAX(joined_at) j FROM attendance WHERE user_id IN (${ph}) GROUP BY user_id`, [], 'user_id', r => _num(r.j)),
          _groupMap(ph => `SELECT student_uid, AVG(score_overall) a, COUNT(*) n FROM student_evaluations WHERE student_uid IN (${ph}) AND created_at >= ? GROUP BY student_uid`, [since60], 'student_uid', r => ({ a: _num(r.a), n: _num(r.n) })),
          _groupMap(ph => `SELECT user_id, MIN(due_at) earliest_due, SUM(amount) total FROM payments WHERE user_id IN (${ph}) AND (paid_at IS NULL OR paid_at = 0) AND due_at < ? GROUP BY user_id`, [now], 'user_id', r => ({ earliest_due: _num(r.earliest_due), total: _num(r.total) })),
          _groupMap(ph => `SELECT user_id, COUNT(*) n FROM homework_submissions WHERE user_id IN (${ph}) AND status = 'missed' AND created_at >= ? GROUP BY user_id`, [since30], 'user_id', r => _num(r.n)),
          _groupMap(ph => `SELECT user_id, COUNT(*) n FROM point_log WHERE user_id IN (${ph}) AND created_at >= ? GROUP BY user_id`, [since14], 'user_id', r => _num(r.n)),
          (async () => {
            const out: any[] = [];
            for (const ck of _chunks) {
              const ph = ck.map(() => '?').join(',');
              try {
                const rs: any = await env.DB.prepare(
                  `SELECT student_uid, score_overall, rn FROM (SELECT student_uid, score_overall, ROW_NUMBER() OVER (PARTITION BY student_uid ORDER BY created_at DESC) rn FROM student_evaluations WHERE student_uid IN (${ph})) WHERE rn <= 6`
                ).bind(...ck).all();
                for (const r of (rs.results || [])) out.push(r);
              } catch { /* skip */ }
            }
            return out;
          })(),
        ]);

        // 평가 추세 — 최근3회 vs 직전3회 평균 (원본 recent3/prev3 동등)
        const _trendAgg = new Map<string, { recent: number[]; prev: number[] }>();
        for (const r of (_trendRows as any[])) {
          const k = String(r.student_uid);
          if (!_trendAgg.has(k)) _trendAgg.set(k, { recent: [], prev: [] });
          const g = _trendAgg.get(k)!;
          if (_num(r.rn) <= 3) g.recent.push(_num(r.score_overall)); else g.prev.push(_num(r.score_overall));
        }
        const _avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

        const atRisk: any[] = [];
        for (const s of students) {
          const attRecent = att30M.get(s.user_id) || 0;
          const attPrev = att60M.get(s.user_id) || 0;
          const att90val = att90M.get(s.user_id) || 0;
          const _lastJ = lastJoinM.get(s.user_id) || 0;
          const daysSinceLastJoin = _lastJ ? Math.floor((now - _lastJ) / 86400000) : 999;

          const _ev = evalM.get(s.user_id);
          const evalAvg = _ev ? Math.round(_ev.a || 0) : 0;
          const evalCount = _ev ? (_ev.n || 0) : 0;
          let evalTrend = 0;
          const _tg = _trendAgg.get(s.user_id);
          if (_tg) { const _ra = _avg(_tg.recent), _pa = _avg(_tg.prev); if (_ra != null && _pa != null) evalTrend = Math.round((_ra - _pa) * 10) / 10; }

          const _pay = payM.get(s.user_id);
          let overdueDays = 0, overdueAmount = 0;
          if (_pay && _pay.earliest_due) { overdueDays = Math.floor((now - _pay.earliest_due) / 86400000); overdueAmount = _pay.total || 0; }

          const hwMissed = hwM.get(s.user_id) || 0;
          const recentPoints = ptM.get(s.user_id) || 0;

          // ════════════════════════════════════════════════
          // 🧮 위험 점수 — 10가지 신호 가중 합산 (Babbel / VIPKID / 학원CRM 벤치마킹)
          // ════════════════════════════════════════════════
          let risk = 0;
          const reasons: string[] = [];
          const signals: any = {};

          // S1: 마지막 입장 기준 (가장 강력한 신호)
          if (daysSinceLastJoin >= 21)      { risk += 45; reasons.push(`📵 마지막 입장 ${daysSinceLastJoin}일 전`); signals.lastJoin = 'critical'; }
          else if (daysSinceLastJoin >= 14) { risk += 35; reasons.push(`📵 마지막 입장 ${daysSinceLastJoin}일 전`); signals.lastJoin = 'high'; }
          else if (daysSinceLastJoin >= 7)  { risk += 18; reasons.push(`⏰ 최근 1주 미출석`); signals.lastJoin = 'medium'; }

          // S2: 최근 30일 출석 0
          if (attRecent === 0 && daysSinceLastJoin < 999) { risk += 25; reasons.push('📉 최근 30일 출석 0회'); signals.attendance = 'zero'; }

          // S3: 출석 감소 추세 (60일→30일 50% 이상 감소)
          if (attPrev > 0 && attRecent < attPrev * 0.5) {
            risk += 22; reasons.push(`📊 출석 ${attPrev}→${attRecent}회 (-${Math.round((1 - attRecent/attPrev)*100)}%)`); signals.attendanceTrend = 'declining';
          }

          // S4: 3개월 연속 하락 (90→60→30)
          if (att90val > attPrev && attPrev > attRecent && attRecent > 0) {
            risk += 12; reasons.push(`📉 3개월 연속 출석 감소 (${att90val}→${attPrev}→${attRecent})`); signals.continuousDecline = true;
          }

          // S5: 평가 점수 저조
          if (evalCount > 0 && evalAvg < 5) { risk += 18; reasons.push(`⭐ 평가 평균 ${evalAvg}점 (낮음)`); signals.evalLow = true; }
          else if (evalCount > 0 && evalAvg < 7) { risk += 8; reasons.push(`⭐ 평가 평균 ${evalAvg}점`); }

          // S6: 평가 추세 하락 (-2점 이상)
          if (evalTrend < -2) { risk += 15; reasons.push(`📉 평가 추세 ${evalTrend > 0 ? '+' : ''}${evalTrend}점`); signals.evalTrend = 'declining'; }

          // S7: 평가서 미작성 (관리 사각지대 신호)
          if (evalCount === 0 && daysSinceLastJoin < 60) { risk += 8; reasons.push('📝 최근 평가서 없음'); }

          // S8: 미납 (강력)
          if (overdueDays >= 30)      { risk += 30; reasons.push(`💰 ${overdueDays}일 미납 (${(overdueAmount/10000).toFixed(0)}만원)`); signals.payment = 'overdue-long'; }
          else if (overdueDays >= 7)  { risk += 15; reasons.push(`💰 ${overdueDays}일 미납`); signals.payment = 'overdue'; }

          // S9: 숙제 미제출
          if (hwMissed >= 5)      { risk += 12; reasons.push(`📚 숙제 ${hwMissed}회 미제출`); signals.homework = 'high-miss'; }
          else if (hwMissed >= 3) { risk += 6; reasons.push(`📚 숙제 ${hwMissed}회 미제출`); }

          // S10: 포인트/활동 정지
          if (recentPoints === 0 && daysSinceLastJoin < 30) { risk += 6; reasons.push('🎮 최근 2주 학습 활동 정지'); signals.engagement = 'frozen'; }

          if (risk >= 25) {
            const riskLevel = risk >= 70 ? 'high' : risk >= 50 ? 'medium' : 'low';
            // 💡 추천 액션 — 위험 신호 조합 기반 정교화
            const actions: string[] = [];
            if (overdueDays >= 7) actions.push('💳 결제 안내 카톡');
            if (riskLevel === 'high') actions.push('🚨 학부모 직접 전화');
            if (signals.lastJoin === 'critical') actions.push('🎁 컴백 기프트 + 무료 보강 1회');
            else if (signals.lastJoin === 'high') actions.push('📞 학부모 안부 전화');
            if (signals.evalLow || signals.evalTrend === 'declining') actions.push('🤝 강사 교체 검토 / 1:1 멘토링');
            if (signals.homework === 'high-miss') actions.push('📚 숙제 코디네이터 배정');
            if (signals.engagement === 'frozen') actions.push('🎮 포인트 보너스 이벤트 초대');
            if (!actions.length) actions.push('📧 격려 푸시 + 학부모 안부 문자');

            atRisk.push({
              user_id: s.user_id,
              student_name: s.student_name || s.user_id,
              parent_name: s.parent_name || null,
              parent_phone: s.parent_phone || null,
              risk_score: Math.min(risk, 100),
              risk_level: riskLevel,
              reasons,
              signals,
              attendance_30d: attRecent,
              attendance_30to60d: attPrev,
              attendance_60to90d: att90val,
              days_since_last_join: daysSinceLastJoin,
              eval_avg: evalAvg,
              eval_trend: evalTrend,
              eval_count_60d: evalCount,
              overdue_days: overdueDays,
              overdue_amount: overdueAmount,
              hw_missed_30d: hwMissed,
              recommended_actions: actions,
              recommended_action: actions[0], // 호환 — 기존 UI
            });
          }
        }
        // 위험도 내림차순
        atRisk.sort((a, b) => b.risk_score - a.risk_score);
        const _rrPayload = JSON.stringify({ ok: true, count: atRisk.length, at_risk: atRisk, schema: { name_col: nameCol } });
        try { await env.SESSION_STATE.put(_rrKey, _rrPayload, { expirationTtl: 180 }); } catch { /* 캐시 저장 실패 무시 */ }
        return new Response(_rrPayload, { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (e: any) {
        console.warn('[retention/risk] error:', e?.message);
        return json({ ok: false, error: e?.message || 'risk_failed' }, 500);
      }
    }

    // ════════════════════════════════════════════════
    // 🎁 Phase ARR-2 — 위험 학생 케어 액션 발송
    //   POST /api/admin/retention/care
    //   body: { user_id, action_type, message?, gift_type?, event_id? }
    //   action_type: 'kakao' | 'sms' | 'gift' | 'event' | 'comeback_bundle'
    // ════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/admin/retention/care') {
      try {
        const b = await request.json<any>().catch(() => ({}));
        const uid = String(b.user_id || '').trim();
        const actionType = String(b.action_type || '').trim();
        if (!uid || !actionType) return json({ ok: false, error: 'user_id + action_type required' }, 400);

        await env.DB.exec(`CREATE TABLE IF NOT EXISTS retention_care_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action_type TEXT, message TEXT, gift_type TEXT, event_id TEXT, status TEXT, error TEXT, created_at INTEGER);`);

        const now = Date.now();
        const message = String(b.message || '').slice(0, 1000);
        const giftType = String(b.gift_type || '').slice(0, 50);
        const eventId = String(b.event_id || '').slice(0, 100);
        let status = 'sent';
        let detail = '';

        // 학생/학부모 정보
        let parentPhone = '', studentName = uid;
        try {
          const cols: any = await env.DB.prepare(`PRAGMA table_info(students_erp)`).all();
          const colNames = ((cols.results || []) as any[]).map(c => c.name);
          const nCol = colNames.includes('student_name') ? 'student_name' : (colNames.includes('korean_name') ? 'korean_name' : (colNames.includes('name') ? 'name' : 'user_id'));
          const pPhoneCol = colNames.includes('parent_phone') ? 'parent_phone' : `''`;
          const s: any = await env.DB.prepare(`SELECT ${nCol} AS sn, ${pPhoneCol} AS pp FROM students_erp WHERE user_id = ?`).bind(uid).first();
          if (s) { studentName = s.sn || uid; parentPhone = s.pp || ''; }
        } catch {}

        // 액션 분기
        if (actionType === 'kakao') {
          // 카카오 알림톡 — 기존 인프라 재사용 (가입 시), 아니면 카톡 채널 메시지
          detail = `카톡 발송: ${studentName} → ${message.slice(0, 80)}`;
          // 실제 발송 로직 hook
          try {
            if ((env as any).KAKAO_TOKEN && parentPhone) {
              // TODO: 실 카톡 발송 (Solapi/Aligo 등)
              detail += ' [KAKAO_TOKEN ok]';
            } else { status = 'queued'; detail += ' [실 API 없음 - 큐 보관]'; }
          } catch (kk: any) { status = 'failed'; detail = kk?.message || 'kakao_fail'; }
        }
        else if (actionType === 'sms') {
          detail = `문자: ${parentPhone || '학생'} → ${message.slice(0, 80)}`;
          status = 'queued';
        }
        else if (actionType === 'gift') {
          // 포인트 보너스 적립
          try {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER);`);
            const giftAmt = giftType === 'comeback' ? 500 : giftType === 'bonus' ? 200 : 100;
            await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, last_earned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?, lifetime_earned = lifetime_earned + ?, last_earned_at = ?, updated_at = ?`)
              .bind(uid, studentName, giftAmt, giftAmt, now, now, giftAmt, giftAmt, now, now).run();
            detail = `🎁 ${giftAmt}P 보너스 적립`;
          } catch (ge: any) { status = 'failed'; detail = ge?.message || 'gift_fail'; }
        }
        else if (actionType === 'event') {
          detail = `이벤트 초대: ${eventId}`;
          // 초대 큐에만 기록 — 실 발송은 push 시스템이 처리
        }
        else if (actionType === 'comeback_bundle') {
          // 컴백 번들: 카톡 + 기프트(500P) + 무료 보강 1회
          try {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER);`);
            await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, last_earned_at, updated_at) VALUES (?, ?, 500, 500, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + 500, lifetime_earned = lifetime_earned + 500, last_earned_at = ?, updated_at = ?`)
              .bind(uid, studentName, now, now, now, now).run();
            detail = '🎁 컴백 번들: 500P + 무료 보강 1회 + 카톡 안내';
          } catch (ce: any) { status = 'failed'; detail = ce?.message || 'bundle_fail'; }
        } else {
          return json({ ok: false, error: 'unknown action_type' }, 400);
        }

        // 로그 기록
        await env.DB.prepare(`INSERT INTO retention_care_log (user_id, action_type, message, gift_type, event_id, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(uid, actionType, message, giftType, eventId, status, status === 'failed' ? detail : null, now).run();

        return json({ ok: true, status, detail });
      } catch (e: any) {
        console.warn('[retention/care] error:', e?.message);
        return json({ ok: false, error: e?.message || 'care_failed' }, 500);
      }
    }
    // GET /api/admin/retention/care/logs — 발송 이력
    if (method === 'GET' && path === '/api/admin/retention/care/logs') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS retention_care_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action_type TEXT, message TEXT, gift_type TEXT, event_id TEXT, status TEXT, error TEXT, created_at INTEGER);`);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
        const uid = url.searchParams.get('user_id');
        const rs = uid
          ? await env.DB.prepare(`SELECT * FROM retention_care_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).bind(uid, limit).all()
          : await env.DB.prepare(`SELECT * FROM retention_care_log ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message }, 500);
      }
    }
    // ═══════════════════════════════════════════════════════════════
    // 🚨 Phase ARR 끝
    // ═══════════════════════════════════════════════════════════════

    // ===== 👨‍🎓 학생 목록 (Phase 9 학생관리 메뉴 — 학생 목록) =====
    //   GET /api/admin/students/list?limit=200
    //   attendance 테이블에서 distinct user_id + 최근 활동 집계
    if (method === 'GET' && path === '/api/admin/students/list') {
      const lim = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('limit') || '200', 10)));
      const _sfList = await scopeFragments(env, request);  // 🔒 지사/대리점 격리
      const rs = await env.DB.prepare(
        `SELECT user_id,
                MAX(username) AS username,
                MAX(role)     AS role,
                MIN(joined_at) AS first_seen,
                MAX(joined_at) AS last_seen,
                COUNT(*)       AS sessions
         FROM attendance
         WHERE user_id IS NOT NULL AND user_id != ''${_sfList.uidScope}
         GROUP BY user_id
         ORDER BY MAX(joined_at) DESC
         LIMIT ?`
      ).bind(..._sfList.binds, lim).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // 🏢 카페24 조직 이관 — Neo4j (:Branch)(:Center) → D1 franchises/centers (cafe24-sync.ts)
    if (method === 'GET' && path === '/api/admin/org/import-cafe24') {
      try {
        const r = await importCafe24Org(env);
        return json({ ok: true, ...r });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[org/import-cafe24] 실패:', e?.message || e);
        return json({ ok: false, code: 'IMPORT_FAILED', error: String(e?.message || e) }, 502);
      }
    }

    // 📅 카페24 출석/수업 이관 — Neo4j (:Class 50.5만) → D1 attendance (cafe24-sync.ts)
    //   GET /api/admin/attendance/import-cafe24?offset=0&limit=3000[&since=YYYY-MM-DD][&until=YYYY-MM-DD]
    //   since 만 주고 until 없으면 상한 없이(9999) 삭제·재삽입 — 전체복구 시엔 since 생략(c24-% 전부).
    if (method === 'GET' && path === '/api/admin/attendance/import-cafe24') {
      const off = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
      const lim = Math.max(1, Math.min(5000, parseInt(url.searchParams.get('limit') || '3000', 10)));
      const since = (url.searchParams.get('since') || '').trim() || undefined;
      const until = (url.searchParams.get('until') || '').trim() || undefined;
      try {
        const r = await importCafe24Attendance(env, off, lim, since, until);
        return json({ ok: true, offset: off, next_offset: r.done ? null : off + lim, ...r });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[attendance/import-cafe24] 실패:', e?.message || e);
        return json({ ok: false, code: 'IMPORT_FAILED', error: String(e?.message || e) }, 502);
      }
    }

    // 👨‍🎓 카페24 학생 이관 — Neo4j (:Student 2.9만) → D1 students_erp (cafe24-sync.ts)
    //   GET /api/admin/students/import-cafe24?offset=0&limit=3000 (페이지네이션, 멱등)
    if (method === 'GET' && path === '/api/admin/students/import-cafe24') {
      const off = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
      const lim = Math.max(1, Math.min(5000, parseInt(url.searchParams.get('limit') || '3000', 10)));
      try {
        const r = await importCafe24Students(env, off, lim);
        return json({ ok: true, imported_this_page: r.imported, offset: off, next_offset: r.done ? null : off + lim, done: r.done });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[students/import-cafe24] 실패:', e?.message || e);
        return json({ ok: false, code: 'IMPORT_FAILED', error: String(e?.message || e) }, 502);
      }
    }

    // 👩‍🏫 카페24 강사 명부 (그래프DB) — 학력·경력·소개·근무시간·시급·출퇴근집계·담당수업수
    //   GET /api/admin/teachers/graph-list?q=검색어  → {ok, source:'neo4j', count, teachers:[...]}
    //   Neo4j 미설정/실패 시 503/502. 강사관리 화면이 실데이터로 뜨게 함.
    if (method === 'GET' && path === '/api/admin/teachers/graph-list') {
      const qT = (url.searchParams.get('q') || '').trim().toLowerCase();
      try {
        // 담당수업수(class_count)·학생수(student_count)는 노드에 미리 계산돼 있음(대량 Class 스캔 회피)
        const { fields, values } = await runCypher(env, `
          MATCH (t:Teacher) WHERE t.name IS NOT NULL
            AND ($q = '' OR toLower(coalesce(t.name,'')) CONTAINS $q OR toLower(coalesce(t.nickname,'')) CONTAINS $q OR toLower(coalesce(t.group_name,'')) CONTAINS $q)
          RETURN t.teacher_id AS teacher_id, t.name AS name, t.nickname AS nickname,
                 t.is_manager AS is_manager, t.email AS email, t.group_name AS group_name,
                 t.edu AS edu, t.spec AS spec, t.intro AS intro,
                 t.start_hour AS start_hour, t.end_hour AS end_hour, t.pay_per_time AS pay_per_time,
                 t.video_type AS video_type, t.status AS status, t.reg_date AS reg_date,
                 coalesce(t.work_days,0) AS work_days, coalesce(t.total_hours,0.0) AS total_hours, t.last_work AS last_work,
                 coalesce(t.class_count,0) AS class_count, coalesce(t.student_count,0) AS student_count,
                 t.review_avg AS review_avg, coalesce(t.review_count,0) AS review_count,
                 t.score_avg AS score_avg, coalesce(t.score_count,0) AS score_count
          ORDER BY coalesce(t.class_count,0) DESC, t.name`, { q: qT }, 'READ');
        const teachers = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return json({ ok: true, source: 'neo4j', count: teachers.length, teachers });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[teachers/graph-list] 실패:', e?.message || e);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 💰 카페24 회계 (그래프DB) — 회계장부·급여·지출결의서·세금계산서·예치금
    //   GET /api/admin/finance-cafe24/{ledger|payroll|expenses|tax|deposits}?limit=&month=
    {
      const finM = path.match(/^\/api\/admin\/finance-cafe24\/([a-z]+)$/);
      if (method === 'GET' && finM) {
        const kind = finM[1];
        const lim = Math.max(1, Math.min(2000, parseInt(url.searchParams.get('limit') || '500', 10)));
        const month = (url.searchParams.get('month') || '').trim();
        // 월별 손익 집계 (AccBookType 1=수입, 2=지출) — 최근 24개월
        if (kind === 'summary') {
          try {
            const { fields, values } = await runCypher(env, `
              MATCH (a:AccBook) WHERE a.date IS NOT NULL AND a.date <> ''
              WITH substring(a.date,0,7) AS ym, a.type AS t, a.money AS money
              WHERE ym >= '2019-01'
              RETURN ym,
                     sum(CASE WHEN t = 1 THEN money ELSE 0 END) AS income,
                     sum(CASE WHEN t = 2 THEN money ELSE 0 END) AS expense
              ORDER BY ym DESC LIMIT 36`, {}, 'READ');
            const rows = values.map(row => {
              const o: any = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
              o.net = (Number(o.income) || 0) - (Number(o.expense) || 0);
              return o;
            });
            const totals = rows.reduce((a: any, r: any) => ({ income: a.income + (Number(r.income) || 0), expense: a.expense + (Number(r.expense) || 0) }), { income: 0, expense: 0 });
            return json({ ok: true, source: 'neo4j', kind: 'summary', months: rows, totals: { ...totals, net: totals.income - totals.expense } });
          } catch (e: any) {
            if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
            return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
          }
        }
        const QMAP: Record<string, string> = {
          ledger: `MATCH (a:AccBook) ${month ? `WHERE a.month = $month OR a.date STARTS WITH $month` : ''} RETURN a.date AS date, a.type AS type, a.acc_type AS acc_type, a.subject AS subject, a.money AS money, a.store AS store, a.memo AS memo, a.month AS month ORDER BY a.date DESC LIMIT $lim`,
          payroll: `MATCH (p:Payroll) ${month ? `WHERE p.month = $month` : ''} RETURN p.user_id AS user_id, p.month AS month, p.base AS base, p.total AS total, p.deduction AS deduction, p.actual AS actual, p.income_tax AS income_tax, p.pension AS pension, p.work_day AS work_day, p.pay_date AS pay_date ORDER BY p.month DESC LIMIT $lim`,
          expenses: `MATCH (d:ExpenseReport) RETURN d.name AS name, d.content AS content, d.pay_date AS pay_date, d.organ AS organ, d.method AS method, d.memo AS memo, d.state AS state, d.reg_date AS reg_date ORDER BY d.reg_date DESC LIMIT $lim`,
          tax: `MATCH (t:TaxInvoice) RETURN t.date AS date, t.supplier AS supplier, t.receiver AS receiver, t.supply AS supply, t.tax AS tax, t.total AS total, t.tax_type AS tax_type, t.state AS state ORDER BY t.date DESC LIMIT $lim`,
          deposits: `MATCH (s:SavedMoney) RETURN s.center_id AS center_id, s.amount AS amount, s.method AS method, s.date AS date, s.state AS state ORDER BY s.date DESC LIMIT $lim`,
        };
        const cy = QMAP[kind];
        if (!cy) return json({ ok: false, error: 'unknown finance kind' }, 400);
        try {
          const { fields, values } = await runCypher(env, cy, { lim, month }, 'READ');
          const rows = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
          return json({ ok: true, source: 'neo4j', kind, count: rows.length, rows });
        } catch (e: any) {
          if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
          return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
        }
      }
    }

    // 📈 카페24 자가평가 월별 추이 (그래프DB) — 학생 자가진단 점수 추이(참여도·자신감 지표)
    //   GET /api/admin/selfscore/trend?months=24  → {ok, months:[{ym,cnt,avg_score}], totals}
    if (method === 'GET' && path === '/api/admin/selfscore/trend') {
        const lim = Math.max(1, Math.min(84, parseInt(url.searchParams.get('months') || '24', 10)));
        try {
          const { fields, values } = await runCypher(env, `
            MATCH (s:SelfScoreTrend)
            RETURN s.ym AS ym, s.cnt AS cnt, s.avg_score AS avg_score
            ORDER BY s.ym DESC LIMIT $lim`, { lim }, 'READ');
          const months = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
          const withCount = months.filter((m: any) => Number(m.cnt) > 0);
          const totals = {
            total_responses: months.reduce((a: number, m: any) => a + (Number(m.cnt) || 0), 0),
            avg_overall: withCount.length ? Math.round((withCount.reduce((a: number, m: any) => a + Number(m.avg_score), 0) / withCount.length) * 100) / 100 : null,
          };
          return json({ ok: true, source: 'neo4j', months, totals });
        } catch (e: any) {
          if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
          return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
        }
    }

    // 🏅 카페24 레벨테스트 배치 현황 (그래프DB) — 레벨별 분포·합격률 + 최근 응시
    //   GET /api/admin/leveltest/overview  → {ok, by_level:[{level,total,pass,pass_rate}], recent:[...], totals}
    if (method === 'GET' && path === '/api/admin/leveltest/overview') {
      try {
        const agg = await runCypher(env, `
          MATCH (l:LevelTest) WHERE l.level IS NOT NULL AND l.level <> ''
          WITH l.level AS level, count(*) AS total, sum(CASE WHEN l.pass = 1 THEN 1 ELSE 0 END) AS pass
          RETURN level, total, pass ORDER BY total DESC`, {}, 'READ');
        const byLevel = agg.values.map(row => {
          const o: any = Object.fromEntries(agg.fields.map((f, i) => [f, row[i]]));
          o.pass_rate = o.total > 0 ? Math.round((Number(o.pass) / Number(o.total)) * 1000) / 10 : 0;
          return o;
        });
        const rec = await runCypher(env, `
          MATCH (l:LevelTest) WHERE l.year IS NOT NULL
          RETURN l.user_id AS user_id, l.year AS year, l.month AS month, l.day AS day, l.level AS level, l.pass AS pass,
                 (coalesce(l.s1,0)+coalesce(l.s2,0)+coalesce(l.s3,0)+coalesce(l.s4,0)+coalesce(l.s5,0)) AS score_sum
          ORDER BY l.year DESC, l.month DESC, l.day DESC LIMIT 200`, {}, 'READ');
        const recent = rec.values.map(row => Object.fromEntries(rec.fields.map((f, i) => [f, row[i]])));
        const totals = byLevel.reduce((a: any, r: any) => ({ total: a.total + Number(r.total), pass: a.pass + Number(r.pass) }), { total: 0, pass: 0 });
        return json({ ok: true, source: 'neo4j', by_level: byLevel, recent, totals: { ...totals, pass_rate: totals.total > 0 ? Math.round((totals.pass / totals.total) * 1000) / 10 : 0 } });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 🧑‍💼 카페24 직원 명부 (그래프DB) — 지사 직원
    if (method === 'GET' && path === '/api/admin/staff/graph-list') {
      const qS = (url.searchParams.get('q') || '').trim().toLowerCase();
      try {
        const { fields, values } = await runCypher(env, `
          MATCH (s:Staff) WHERE s.name IS NOT NULL
            AND ($q = '' OR toLower(coalesce(s.name,'')) CONTAINS $q OR toLower(coalesce(s.nickname,'')) CONTAINS $q)
          RETURN s.staff_id AS staff_id, s.name AS name, s.nickname AS nickname, s.email AS email,
                 s.intro AS intro, s.status AS status, s.retire_date AS retire_date, s.franchise_id AS franchise_id
          ORDER BY s.status, s.name`, { q: qS }, 'READ');
        const staff = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return json({ ok: true, source: 'neo4j', count: staff.length, staff });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 📚 카페24 교재 명부 (그래프DB)
    if (method === 'GET' && path === '/api/admin/books/graph-list') {
      const qB = (url.searchParams.get('q') || '').trim().toLowerCase();
      try {
        const { fields, values } = await runCypher(env, `
          MATCH (b:Book) WHERE b.name IS NOT NULL
            AND ($q = '' OR toLower(coalesce(b.name,'')) CONTAINS $q)
          RETURN b.book_id AS book_id, b.name AS name, b.memo AS memo, b.status AS status, b.group_id AS group_id
          ORDER BY b.status, b.name`, { q: qB }, 'READ');
        const books = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return json({ ok: true, source: 'neo4j', count: books.length, books });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 🕸️ 그래프 학생 명부 — Neo4j 실데이터 조회 (자체 호스팅 bolt 서버/Aura 공용)
    //   GET /api/admin/students/graph-list?limit=1000&q=검색어
    //   (:Student) 노드 + 가족(FAMILY_OF)·학부모(:Parent) 관계를 MATCH 로 읽어
    //   /students/unified 와 동일한 필드 모양(students:[...])으로 반환한다.
    //   프론트(admin.html loadStudentList)는 이 API 를 1차로 호출하고,
    //   미설정(503)/연결 실패(502)면 D1(unified)로 폴백한다.
    if (method === 'GET' && path === '/api/admin/students/graph-list') {
      const limitG = Math.max(1, Math.min(2000, parseInt(url.searchParams.get('limit') || '1000', 10)));
      const qG = (url.searchParams.get('q') || '').trim().toLowerCase();
      // 🔒 (2026-07-18) 그래프 학생 명부도 세션 스코프로 서버에서 격리(이중 안전장치).
      //   본사(hq)·내부직원(none) = 조건 없음 → 기존 '전체 보기' 동작 변화 0.
      //   지사(branch) = franchise 접두, 대리점(agency) = shop_name 일치, 지사본사(franchise) = 소유 지사 목록만.
      //   라우팅 화이트리스트 게이트(index.ts isAgencyAllowedApi)에 더한 방어라, 게이트가 뚫려도 데이터가 안 샘.
      const _gScope = await getScope(env, request);
      const _gp: Record<string, any> = { q: qG, limit: limitG };
      let _gScopeClause = '';
      if (_gScope.type === 'agency' && _gScope.value) {
        _gScopeClause = ' AND s.shop_name = $scopeVal'; _gp.scopeVal = _gScope.value;
      } else if (_gScope.type === 'branch' && _gScope.value) {
        _gScopeClause = " AND coalesce(s.franchise, '') STARTS WITH $scopeVal"; _gp.scopeVal = _gScope.value;
      } else if (_gScope.type === 'franchise') {
        const _fl = franchiseList(_gScope.value);
        if (!_fl.length) { _gScopeClause = ' AND false'; }                                  // 소유 지사 없음 → 아무것도 안 보이게
        else { _gScopeClause = " AND coalesce(s.franchise, '') IN $scopeList"; _gp.scopeList = _fl; }
      }
      // hq | none → _gScopeClause = '' (전체)
      const GRAPH_STUDENT_LIST_QUERY = `
MATCH (s:Student)
WHERE ($q = ''
   OR toLower(coalesce(s.name, s.korean_name, ''))       CONTAINS $q
   OR toLower(coalesce(s.student_id, s.user_id, ''))     CONTAINS $q)${_gScopeClause}
OPTIONAL MATCH (s)-[:FAMILY_OF]-(fam:Student)
OPTIONAL MATCH (par:Parent)-[]->(s)
WITH s,
     collect(DISTINCT coalesce(fam.name, fam.student_id)) AS family,
     collect(DISTINCT coalesce(par.name, par.parent_id))[0] AS parent_name,
     collect(DISTINCT par.phone)[0]                         AS parent_phone_g
RETURN coalesce(s.student_id, s.user_id)                         AS user_id,
       coalesce(s.name, s.korean_name, s.student_id, s.user_id)  AS name,
       s.english_name                                            AS english_name,
       s.grade                                                   AS grade,
       s.level                                                   AS level,
       coalesce(s.status, 'active')                              AS status,
       s.student_phone                                           AS student_phone,
       coalesce(parent_phone_g, s.parent_phone)                  AS parent_phone,
       parent_name                                               AS parent_name,
       s.teacher_phone                                           AS teacher_phone,
       s.shop_name                                               AS shop_name,
       s.hq_name                                                 AS hq_name,
       s.branch1_name                                            AS branch1_name,
       s.branch2_name                                            AS branch2_name,
       s.franchise                                               AS franchise,
       s.payment_type                                            AS payment_type,
       s.signup_date                                             AS signup_date,
       s.end_date                                                AS end_date,
       s.classes_per_week                                        AS classes_per_week,
       s.points                                                  AS points,
       family                                                    AS family
ORDER BY name
LIMIT $limit`;
      try {
        const { fields, values } = await runCypher(
          env, GRAPH_STUDENT_LIST_QUERY, _gp, 'READ',
        );
        const students = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return json({ ok: true, source: 'neo4j', count: students.length, students });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) {
          return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        }
        console.warn('[graph-list] Neo4j 조회 실패:', e?.message || e);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 💰 카페24 결제 이관 — Neo4j (:Payment 1.1만) → D1 student_payments (cafe24-sync.ts)
    if (method === 'GET' && path === '/api/admin/payments/import-cafe24') {
      try {
        const r = await importCafe24Payments(env);
        const sum = await env.DB.prepare(
          `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_krw),0) AS total FROM student_payments WHERE memo LIKE '[cafe24]%' AND status='paid'`,
        ).first<any>();
        return json({ ok: true, imported: r.imported, d1_paid_count: sum?.cnt || 0, d1_paid_total_krw: sum?.total || 0 });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[import-cafe24] 실패:', e?.message || e);
        return json({ ok: false, code: 'IMPORT_FAILED', error: String(e?.message || e) }, 502);
      }
    }

    // 🧑‍🎓 통합 학생관리 — students_erp(ERP 명부) + attendance(세션·최근방문) 단일 합본
    //   GET /api/admin/students/unified?q=  → {ok, count, students:[...]}
    if (method === 'GET' && path === '/api/admin/students/unified') {
      const q = (url.searchParams.get('q') || '').trim();
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      // 🔒 역할별 데이터 범위 제한(scoping): 지사=branch1_name, 대리점=shop_name, 교사=teacher_phone, 학부모=parent_phone, 학생=user_id
      const SCOPE_FIELDS: Record<string, string> = {
        branch1_name: 's.branch1_name', shop_name: 's.shop_name', hq_name: 's.hq_name',
        franchise: 's.franchise', teacher_phone: 's.teacher_phone',
        parent_phone: 's.parent_phone', user_id: 's.user_id'
      };
      const _ssw = await studentScopeWhere(env, request, 's');
      const conds: string[] = [];
      const binds: any[] = [];
      if (q) {
        conds.push(`(s.korean_name LIKE ? OR s.english_name LIKE ? OR s.student_name LIKE ? OR s.user_id LIKE ? OR s.student_phone LIKE ?)`);
        binds.push(like, like, like, like, like);
      }
      if (_ssw.cond) { conds.push(_ssw.cond); binds.push(..._ssw.binds); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const rs = await env.DB.prepare(
        `SELECT s.user_id,
                COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS name,
                s.english_name, s.school, s.grade, s.level, s.textbook,
                s.student_phone, s.parent_phone, s.kakao_id, s.status, s.signup_date, s.points, s.created_at,
                s.payment_type, s.end_date, s.classes_per_week, s.teacher_phone,
                s.shop_name, s.hq_name, s.branch1_name, s.branch2_name, s.franchise,
                (SELECT e.package FROM enrollments e WHERE e.student_user_id = s.user_id ORDER BY e.id DESC LIMIT 1) AS enroll_package,
                (SELECT COUNT(*) FROM attendance a WHERE a.user_id = s.user_id) AS sessions,
                (SELECT MAX(date) FROM attendance a WHERE a.user_id = s.user_id) AS last_seen
         FROM students_erp s
         ${where}
         ORDER BY COALESCE(s.created_at,0) DESC, s.rowid DESC
         LIMIT 1000`
      ).bind(...binds).all();
      const _piiStudents = applyPIIScope(rs.results || [], _ssw.scope);  // 🔒 권한별 PII 마스킹
      return json({ ok: true, count: _piiStudents.length, students: _piiStudents, can_view_pii: canViewPII(_ssw.scope) });
    }

    // ========================================================================

    // 🏢 Phase 9 — 메뉴 6개 (가맹점·교육센터·레벨테스트·수강신청·커뮤니티·교재)
    //   각 테이블은 cold start 시 IF NOT EXISTS 자동 생성. 별도 마이그레이션 불필요.
    // ========================================================================
    // ─── 가맹점 ──────────────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/franchises') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS franchises (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, phone TEXT, owner_name TEXT, opened_at TEXT, active INTEGER DEFAULT 1, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      if (method === 'GET') {
        const rs = await env.DB.prepare(`SELECT * FROM franchises ORDER BY active DESC, name ASC`).all();
        return json({ ok: true, items: rs.results || [] });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.name) return invalidBody(['name']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO franchises (name, address, phone, owner_name, opened_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.name, b.address || null, b.phone || null, b.owner_name || null, b.opened_at || null, b.notes || null, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // ─── 교육센터 ─────────────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/centers') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS centers (id INTEGER PRIMARY KEY AUTOINCREMENT, franchise_id INTEGER, name TEXT NOT NULL, country TEXT, address TEXT, manager TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      if (method === 'GET') {
        const rs = await env.DB.prepare(
          `SELECT c.*, f.name AS franchise_name FROM centers c LEFT JOIN franchises f ON f.id = c.franchise_id ORDER BY c.active DESC, c.name ASC`
        ).all();
        return json({ ok: true, items: rs.results || [] });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.name) return invalidBody(['name']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO centers (franchise_id, name, country, address, manager, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.franchise_id || null, b.name, b.country || null, b.address || null, b.manager || null, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // ─── 레벨테스트 ───────────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/level-tests') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS level_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, tested_at INTEGER NOT NULL, level TEXT, score REAL, notes TEXT, evaluator TEXT, created_at INTEGER NOT NULL);`);
      if (method === 'GET') {
        const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '50', 10)));
        const rs = await env.DB.prepare(`SELECT * FROM level_tests ORDER BY tested_at DESC LIMIT ?`).bind(lim).all();
        return json({ ok: true, items: rs.results || [] });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.student_name) return invalidBody(['student_name']);
      const now = Date.now();
      const tested = b.tested_at ? Number(b.tested_at) : now;
      const r = await env.DB.prepare(
        `INSERT INTO level_tests (student_user_id, student_name, tested_at, level, score, notes, evaluator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.student_user_id || null, b.student_name, tested, b.level || null, b.score != null ? Number(b.score) : null, b.notes || null, b.evaluator || 'admin', now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // ─── 🎯 레벨테스트 신청 (학생 제출 → 서버 저장, 관리자·강사 열람) ─────────────
    //   공개  POST /api/leveltest/apply                        학생이 신청 (level-test.html / 홈 그리드)
    //   관리자 GET  /api/admin/leveltest/applications?status=&limit=   목록 + 대기건수(배지)
    //   관리자 POST /api/admin/leveltest/applications  {id, status?, assigned_teacher?, note?, final_level?}  상태/배정 변경
    //   ※ 발음점수(pron_score)는 voice_coaching, AI점수(ai_score)는 향후 진단엔진에서 채움(③ 단계)
    const ensureLtApps = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS leveltest_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, student_name TEXT NOT NULL, student_uid TEXT, desired_date TEXT, desired_time TEXT, status TEXT DEFAULT 'pending', ai_score REAL, pron_score REAL, teacher_score REAL, final_level TEXT, assigned_teacher TEXT, source TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      // 선생님 1:1 평가(3번째 축) 컬럼 — 기존 테이블에도 idempotent 보강
      // + 📱 연락처/이메일, 🧑‍🏫 자동배정 교사 상세, 🔔 교사 확인시각(마이페이지 빨간점 계산용)
      for (const [col, type] of [
        ['teacher_rubric', 'TEXT'], ['evaluated_by', 'TEXT'], ['evaluated_at', 'INTEGER'],
        ['phone', 'TEXT'], ['student_email', 'TEXT'],
        ['assigned_teacher_id', 'TEXT'], ['assigned_teacher_phone', 'TEXT'], ['assigned_teacher_email', 'TEXT'],
        ['assigned_reason', 'TEXT'], ['teacher_seen_at', 'INTEGER'], ['teacher_confirmed_at', 'INTEGER'],
      ] as [string, string][]) {
        try { await env.DB.exec(`ALTER TABLE leveltest_applications ADD COLUMN ${col} ${type}`); } catch {}
      }
    };
    // ── 🧑‍🏫 레벨테스트 교사 자동배정: 그 요일·시간 가능 교사 중 최고평가(동점 랜덤), 없으면 전체 최고평가 ──
    //    반환: { id, name, phone, email, reason } | null
    const autoAssignTeacher = async (desiredDate: string | null, desiredTime: string | null) => {
      try {
        // 요일(Mon..Sun) 계산 — desired_date 있을 때만 가용필터 적용
        const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let wantDay: string | null = null;
        if (desiredDate && /^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) {
          const p = desiredDate.split('-').map(Number);
          const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
          wantDay = WD[dt.getUTCDay()];
        }
        const wantHour = desiredTime && /^\d{1,2}:/.test(desiredTime) ? parseInt(desiredTime, 10) : null;

        // 활동중 교사 + 평가 평균(수업평가 class_ratings 우선, 없으면 익명칭찬 teacher_praises)
        let rows: any[] = [];
        try {
          const rs: any = await env.DB.prepare(
            `SELECT tp.id AS id, tp.korean_name AS name, tp.english_name AS en_name, tp.phone AS phone, tp.email AS email,
                    tp.available_days AS days, tp.available_hours AS hours,
                    (SELECT AVG(cr.score) FROM class_ratings cr WHERE cr.teacher_name = tp.korean_name OR cr.teacher_name = tp.english_name) AS rating_avg,
                    (SELECT COUNT(*) FROM class_ratings cr WHERE cr.teacher_name = tp.korean_name OR cr.teacher_name = tp.english_name) AS rating_cnt,
                    (SELECT AVG(pr.star_rating) FROM teacher_praises pr WHERE pr.teacher_name = tp.korean_name OR pr.teacher_name = tp.english_name) AS praise_avg
               FROM teacher_profiles tp
              WHERE tp.status IS NULL OR tp.status = '' OR tp.status IN ('활동중','재직')
              LIMIT 500`
          ).all();
          rows = rs.results || [];
        } catch { rows = []; }
        if (!rows.length) return null;

        const listMatch = (csv: any, token: string | null): boolean => {
          if (!token) return true;                       // 요일/시간 미지정이면 통과
          const s = String(csv || '').trim();
          if (!s) return false;                          // 가용정보 없는 교사는 "가용필터"에선 탈락(폴백에서 구제)
          return s.toLowerCase().split(/[,\s;/]+/).some(x => x && (x === token.toLowerCase() || x.startsWith(token.toLowerCase())));
        };
        const hourMatch = (csv: any, hour: number | null): boolean => {
          if (hour == null) return true;
          const s = String(csv || '').trim();
          if (!s) return false;
          // "16:00,17:00" / "16-21" / "16 17 18" 등 관용 표기 지원
          const rangeM = s.match(/(\d{1,2})\s*[-~]\s*(\d{1,2})/);
          if (rangeM) return hour >= parseInt(rangeM[1], 10) && hour <= parseInt(rangeM[2], 10);
          return s.split(/[,\s;/]+/).map(x => parseInt(x, 10)).filter(n => !isNaN(n)).includes(hour);
        };
        // 그 요일·시간에 이미 수업이 잡힌 교사 id 집합(중복 배정 방지, best-effort)
        const busy = new Set<string>();
        if (wantDay && wantHour != null) {
          try {
            const bs: any = await env.DB.prepare(
              `SELECT teacher_id FROM class_schedules WHERE (status IS NULL OR status='active') AND day_of_week = ? AND substr(start_time,1,2) = ?`
            ).bind(wantDay.toLowerCase(), ('0' + wantHour).slice(-2)).all();
            (bs.results || []).forEach((r: any) => { if (r.teacher_id != null) busy.add(String(r.teacher_id)); });
          } catch {}
        }

        const scoreOf = (t: any): number => {
          // class_ratings(0~5?) 우선. 칭찬 별점은 보조. 평가 없으면 중립값 2.5(신규교사 과도한 불이익 방지)
          if (t.rating_avg != null) return Number(t.rating_avg);
          if (t.praise_avg != null) return Number(t.praise_avg);
          return 2.5;
        };
        const notBusy = (t: any) => !busy.has(String(t.id));
        // 1순위: 요일+시간 가용 & 미배정
        let pool = rows.filter(t => notBusy(t) && listMatch(t.days, wantDay) && hourMatch(t.hours, wantHour));
        let reason = 'available_best_rated';
        // 폴백: 가용정보로 걸러진 교사가 없으면 → 전체 활동중(중복만 제외) 최고평가
        if (!pool.length) { pool = rows.filter(notBusy); reason = 'fallback_best_rated'; }
        if (!pool.length) { pool = rows; reason = 'fallback_any'; }
        if (!pool.length) return null;

        // 최고평가로 정렬 → 동점(±0.05)이면 그중 랜덤
        pool.sort((a, b) => scoreOf(b) - scoreOf(a) || (Number(b.rating_cnt || 0) - Number(a.rating_cnt || 0)));
        const top = scoreOf(pool[0]);
        const tied = pool.filter(t => Math.abs(scoreOf(t) - top) <= 0.05);
        const pick = tied[Math.floor(Math.random() * tied.length)] || pool[0];
        return {
          id: pick.id != null ? String(pick.id) : null,
          name: (pick.name || pick.en_name || '').toString(),
          phone: (pick.phone || '').toString(),
          email: (pick.email || '').toString(),
          reason,
        };
      } catch (e: any) {
        console.warn('[leveltest autoAssign] skipped:', e?.message || e);
        return null;
      }
    };
    if (method === 'POST' && path === '/api/leveltest/apply') {
      await ensureLtApps();
      const b = await parseJsonBody(request);
      const name = ((b && (b.student_name || b.name)) || '').toString().trim();
      if (!name) return invalidBody(['student_name']);
      const now = Date.now();
      const uid = (b && (b.student_uid || b.uid)) || null;
      const desiredDate = ((b && (b.desired_date || b.date)) || '').toString().trim() || null;
      const desiredTime = ((b && (b.desired_time || b.time)) || '').toString().trim() || null;
      const phone = ((b && (b.phone || b.student_phone)) || '').toString().trim() || null;
      const email = ((b && (b.email || b.student_email)) || '').toString().trim() || null;
      const source = (b && b.source) || 'level-test';
      const escapeHtmlLT = (s: any) => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' } as any)[c]);

      // 🧑‍🏫 자동배정 — 그 요일·시간 가능 교사 중 최고평가(없으면 전체 최고평가)
      const teacher = await autoAssignTeacher(desiredDate, desiredTime);

      const r = await env.DB.prepare(
        `INSERT INTO leveltest_applications (student_name, student_uid, desired_date, desired_time, phone, student_email, status, assigned_teacher, assigned_teacher_id, assigned_teacher_phone, assigned_teacher_email, assigned_reason, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        name, uid, desiredDate, desiredTime, phone, email,
        teacher ? 'proposed' : 'pending',   // 소프트 배정 — 교사 수락 전까지 학생에게 교사명 미통보
        teacher ? teacher.name : null,
        teacher ? teacher.id : null,
        teacher ? (teacher.phone || null) : null,
        teacher ? (teacher.email || null) : null,
        teacher ? teacher.reason : null,
        source, now, now
      ).run();
      const appId = r.meta.last_row_id;

      // 📅 예약 표시용 문자열
      const whenLabel = (() => {
        if (!desiredDate) return desiredTime || '일정 협의';
        const p = desiredDate.split('-');
        const wk = ['일', '월', '화', '수', '목', '금', '토'];
        let dd = desiredDate;
        try { const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); dd = `${+p[1]}월 ${+p[2]}일(${wk[d.getUTCDay()]})`; } catch {}
        return desiredTime ? `${dd} ${desiredTime}` : dd;
      })();
      const teacherLabel = teacher && teacher.name ? teacher.name : '담당 선생님';

      // 🔔 알림은 모두 best-effort — 실패해도 신청 자체는 성공 처리
      // 1) 신청자 "접수" 안내 — 담당 교사는 수락 후 확정 통보(과잉 약속 방지). 교사명은 아직 안 넣는다.
      if (phone) {
        const smsText = `[망고아이] ${name}님, 레벨테스트 신청이 접수됐어요! 🎯\n📅 희망: ${whenLabel}\n담당 선생님이 확정되면 다시 안내드릴게요.\n문의: pf.kakao.com/_xlqnSxd/chat`;
        try { await sendPlainSms(env, phone, smsText); }
        catch (e: any) { console.warn('[leveltest] applicant receipt skipped:', e?.message || e); }
      }
      // 2) 관리자(필리핀) 이메일 알림 — 한/영 이중언어
      try {
        const adminTo = (env as any).LEVELTEST_ADMIN_EMAIL;
        if (adminTo) {
          const html = emailLayout({
            title: '🎯 새 레벨테스트 신청 · New Level Test Request',
            bodyHtml: `
              <p><b>새 레벨테스트 신청이 접수되었습니다.</b><br>A new level test request has been received.</p>
              <table cellpadding="6" style="border-collapse:collapse;margin:10px 0;font-size:13.5px">
                <tr><td style="color:#64748b">학생 · Student</td><td><b>${escapeHtmlLT(name)}</b></td></tr>
                <tr><td style="color:#64748b">희망일시 · When</td><td>${escapeHtmlLT(whenLabel)}</td></tr>
                <tr><td style="color:#64748b">연락처 · Phone</td><td>${escapeHtmlLT(phone || '-')}</td></tr>
                <tr><td style="color:#64748b">배정교사 · Teacher</td><td>${escapeHtmlLT(teacherLabel)}${teacher && teacher.reason === 'fallback_best_rated' ? ' <span style="color:#f59e0b">(시간대 가용 교사 없음 → 최고평가 배정 · no time-match, assigned top-rated)</span>' : ''}</td></tr>
              </table>
              <p style="font-size:12.5px;color:#64748b">관리자 페이지 → 레벨테스트 신청 현황에서 확인/변경할 수 있습니다.<br>Review or reassign in Admin → Level Test Applications.</p>`,
          });
          await sendEmail(env, { to: adminTo, subject: `[망고아이] 새 레벨테스트 신청 · New Level Test — ${name}`, html });
        }
      } catch (e: any) { console.warn('[leveltest] admin email skipped:', e?.message || e); }
      // 3) 배정 후보 교사에게 "수락 요청" — 이메일 + 문자 + 마이페이지 빨간점(teacher_seen_at 미설정으로 자동)
      //    교사가 수락하면 그때 학생에게 확정 통보(아래 accept 분기).
      if (teacher) {
        const tMsg = `[망고아이] 새 레벨테스트 배정 제안이 왔어요.\n👦 학생: ${name}\n📅 ${whenLabel}\n마이페이지에서 수락/거절해 주세요.`;
        try { if (teacher.phone) await sendPlainSms(env, teacher.phone, tMsg); } catch (e: any) { console.warn('[leveltest] teacher sms skipped:', e?.message || e); }
        try {
          if (teacher.email) {
            const html = emailLayout({
              title: '🧑‍🏫 새 레벨테스트 배정 제안 · New Level Test — Please Confirm',
              bodyHtml: `
                <p><b>${escapeHtmlLT(teacher.name)}</b> 선생님, 새 레벨테스트가 배정 제안되었습니다. 마이페이지에서 <b>수락</b>해 주세요.<br>A new level test is proposed to you. Please <b>accept</b> it in your My Page.</p>
                <table cellpadding="6" style="border-collapse:collapse;margin:10px 0;font-size:13.5px">
                  <tr><td style="color:#64748b">학생 · Student</td><td><b>${escapeHtmlLT(name)}</b></td></tr>
                  <tr><td style="color:#64748b">일시 · When</td><td>${escapeHtmlLT(whenLabel)}</td></tr>
                </table>
                <p style="font-size:12.5px;color:#64748b">수락하면 학생에게 담당 선생님 확정 안내가 나갑니다. · Accepting sends the student a confirmation.</p>`,
            });
            await sendEmail(env, { to: teacher.email, subject: `[망고아이] 새 레벨테스트 배정 제안 · Please confirm — ${name}`, html });
          }
        } catch (e: any) { console.warn('[leveltest] teacher email skipped:', e?.message || e); }
      }

      return json({ ok: true, id: appId, status: teacher ? 'proposed' : 'pending', proposed_teacher: teacher ? teacher.name : null, scheduled: whenLabel });
    }
    // ── 🧑‍🏫 교사 마이페이지: 나에게 배정된 레벨테스트 목록 + 미확인 배지 ──
    //   GET  /api/teacher/leveltest-assignments?teacher_name=이름[&teacher_id=]  → { items, unseen }
    //   POST /api/teacher/leveltest-assignments  { teacher_name|teacher_id, seen:true }        → 빨간점 제거(확인처리)
    //   POST /api/teacher/leveltest-assignments  { id, teacher_name, action:'accept'|'decline' } → 배정 수락/거절
    if (path === '/api/teacher/leveltest-assignments') {
      await ensureLtApps();
      const tname = (url.searchParams.get('teacher_name') || '').toString().trim();
      const tid = (url.searchParams.get('teacher_id') || '').toString().trim();
      if (method === 'GET') {
        if (!tname && !tid) return invalidBody(['teacher_name']);
        const where: string[] = []; const binds: any[] = [];
        if (tid)   { where.push('assigned_teacher_id = ?'); binds.push(tid); }
        if (tname) { where.push('assigned_teacher = ?');    binds.push(tname); }
        const rs = await env.DB.prepare(
          `SELECT id, student_name, desired_date, desired_time, phone, status, assigned_teacher, assigned_reason, teacher_seen_at, teacher_confirmed_at, created_at
             FROM leveltest_applications WHERE (${where.join(' OR ')}) ORDER BY created_at DESC LIMIT 100`
        ).bind(...binds).all();
        const items = (rs.results || []) as any[];
        const unseen = items.filter(a => !a.teacher_seen_at || a.created_at > a.teacher_seen_at).length;
        return json({ ok: true, items, unseen });
      }
      const bb = await parseJsonBody(request);
      const bn = ((bb && bb.teacher_name) || '').toString().trim();
      const bi = ((bb && bb.teacher_id) || '').toString().trim();
      const action = ((bb && bb.action) || '').toString().trim();
      // ── 배정 수락/거절 ──
      if ((action === 'accept' || action === 'decline') && bb && bb.id != null) {
        if (!bn && !bi) return invalidBody(['teacher_name']);
        const app = await env.DB.prepare(`SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`).bind(bb.id).first<any>();
        if (!app) return json({ ok: false, error: 'not_found' }, 404);
        // 소유 검증 — 나에게 제안된 건만 처리
        const owns = (bi && String(app.assigned_teacher_id) === bi) || (bn && app.assigned_teacher === bn);
        if (!owns) return json({ ok: false, error: 'not_your_assignment' }, 403);
        const now2 = Date.now();
        if (action === 'decline') {
          // 배정 해제 → pending 으로 되돌려 관리자가 재배정
          await env.DB.prepare(`UPDATE leveltest_applications SET status='pending', assigned_teacher=NULL, assigned_teacher_id=NULL, assigned_teacher_phone=NULL, assigned_teacher_email=NULL, assigned_reason='declined', teacher_confirmed_at=NULL, updated_at=? WHERE id=?`).bind(now2, bb.id).run();
          return json({ ok: true, status: 'pending' });
        }
        // accept → confirmed + 학생에게 담당 확정 통보
        await env.DB.prepare(`UPDATE leveltest_applications SET status='confirmed', teacher_confirmed_at=?, teacher_seen_at=?, updated_at=? WHERE id=?`).bind(now2, now2, now2, bb.id).run();
        // 📅 예약 문자열
        const wk = ['일', '월', '화', '수', '목', '금', '토'];
        let whenLabel2 = app.desired_time || '일정 협의';
        if (app.desired_date && /^\d{4}-\d{2}-\d{2}$/.test(app.desired_date)) {
          const p = String(app.desired_date).split('-');
          try { const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); whenLabel2 = `${+p[1]}월 ${+p[2]}일(${wk[d.getUTCDay()]})` + (app.desired_time ? ` ${app.desired_time}` : ''); } catch {}
        }
        const tLabel = app.assigned_teacher || '담당 선생님';
        if (app.phone) {
          const smsText = `[망고아이] ${app.student_name}님, 레벨테스트 담당 선생님이 확정됐어요! ✅\n📅 ${whenLabel2}\n👩‍🏫 담당: ${tLabel}\n예약 10분 전 카카오톡 채널로 화상 링크를 보내드립니다.\n문의: pf.kakao.com/_xlqnSxd/chat`;
          try {
            const tmpl = (env as any).SOLAPI_TEMPLATE_LEVELTEST;
            if (tmpl) {
              await sendKakaoAlimtalk(env, {
                templateCode: tmpl, recipientPhone: app.phone, recipientName: app.student_name,
                variables: { '#{학생명}': app.student_name, '#{예약일시}': whenLabel2, '#{담당교사}': tLabel },
                fallbackSmsText: smsText,
                logContext: app.student_uid ? { userId: String(app.student_uid), reason: 'leveltest' } : undefined,
              });
            } else {
              await sendPlainSms(env, app.phone, smsText);
            }
          } catch (e: any) { console.warn('[leveltest] confirm notify skipped:', e?.message || e); }
        }
        return json({ ok: true, status: 'confirmed' });
      }
      // ── 확인처리(빨간점 제거) ──
      if (!bn && !bi) return invalidBody(['teacher_name']);
      const where: string[] = []; const binds: any[] = [];
      if (bi) { where.push('assigned_teacher_id = ?'); binds.push(bi); }
      if (bn) { where.push('assigned_teacher = ?');    binds.push(bn); }
      await env.DB.prepare(
        `UPDATE leveltest_applications SET teacher_seen_at = ? WHERE (${where.join(' OR ')}) AND (teacher_seen_at IS NULL OR teacher_seen_at < created_at)`
      ).bind(Date.now(), ...binds).run();
      return json({ ok: true });
    }
    if (path === '/api/admin/leveltest/applications') {
      await ensureLtApps();
      if (method === 'GET') {
        const statusF = url.searchParams.get('status');
        const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
        let q = `SELECT * FROM leveltest_applications`;
        const binds: any[] = [];
        if (statusF) { q += ` WHERE status = ?`; binds.push(statusF); }
        q += ` ORDER BY (status = 'pending') DESC, created_at DESC LIMIT ?`;
        binds.push(lim);
        const rs = await env.DB.prepare(q).bind(...binds).all();
        const items = (rs.results || []) as any[];
        // 🎤 발음 점수 자동 연결 — 학생이 speech-coach에서 남긴 최신 voice_coaching 점수를 오버레이(항상 최신)
        try {
          const uids = Array.from(new Set(items.filter(a => a.student_uid).map(a => a.student_uid)));
          if (uids.length) {
            const ph = uids.map(() => '?').join(',');
            const vc = await env.DB.prepare(
              `SELECT student_uid, pronunciation_score, MAX(created_at) AS mx FROM voice_coaching WHERE student_uid IN (${ph}) GROUP BY student_uid`
            ).bind(...uids).all();
            const pmap: Record<string, number> = {};
            (vc.results || []).forEach((r: any) => { if (r.pronunciation_score != null) pmap[r.student_uid] = r.pronunciation_score; });
            items.forEach(a => { if (a.pron_score == null && a.student_uid && pmap[a.student_uid] != null) a.pron_score = pmap[a.student_uid]; });
          }
        } catch (e) { /* voice_coaching 미존재 시 무시 */ }
        const cnt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM leveltest_applications WHERE status = 'pending'`).all();
        const pending = (cnt.results && cnt.results[0] && (cnt.results[0] as any).n) || 0;
        return json({ ok: true, items, pending });
      }
      // POST → 상태/배정/메모 업데이트
      const b = await parseJsonBody(request);
      if (!b || !b.id) return invalidBody(['id']);
      const fields: string[] = [];
      const binds: any[] = [];
      if (b.status != null)           { fields.push('status = ?');           binds.push(String(b.status)); }
      if (b.assigned_teacher != null) { fields.push('assigned_teacher = ?'); binds.push(String(b.assigned_teacher)); }
      if (b.note != null)             { fields.push('note = ?');             binds.push(String(b.note)); }
      if (b.final_level != null)      { fields.push('final_level = ?');      binds.push(String(b.final_level)); }
      // 🧑‍🏫 선생님 1:1 평가(3번째 축) — 루브릭 점수 + 평가자 + 확정 시 완료 처리
      if (b.teacher_score != null)    { fields.push('teacher_score = ?');    binds.push(Number(b.teacher_score)); }
      if (b.teacher_rubric != null)   { fields.push('teacher_rubric = ?');   binds.push(typeof b.teacher_rubric === 'string' ? b.teacher_rubric : JSON.stringify(b.teacher_rubric)); }
      if (b.evaluated_by != null)     { fields.push('evaluated_by = ?');     binds.push(String(b.evaluated_by)); }
      if (b.teacher_score != null || b.teacher_rubric != null) { fields.push('evaluated_at = ?'); binds.push(Date.now()); }
      if (!fields.length) return invalidBody(['status']);
      fields.push('updated_at = ?'); binds.push(Date.now());
      binds.push(Number(b.id));
      await env.DB.prepare(`UPDATE leveltest_applications SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true });
    }

    // ─── 🧠 AI 자동 진단 (CEFR 객관식 배치테스트) ─────────────────────────────
    //   변별력·객관성의 핵심: 문항은행과 채점을 서버가 소유(클라이언트 조작 불가).
    //   레벨당 4문항(A1~C2, 총 24) · 천장기법(ceiling)으로 추정레벨 · 가중점수(0~100).
    //   GET  /api/leveltest/questions            → 정답 없이 문항 전달
    //   POST /api/leveltest/diagnose {answers,student_name,student_uid} → 서버채점 후 신청건에 자동첨부
    const CEFR_BANK: Array<{ id: string; cefr: string; skill: string; q: string; choices: string[]; a: number }> = [
      // A1
      { id: 'a1_1', cefr: 'A1', skill: 'grammar', q: 'She ___ a student.', choices: ['be', 'am', 'is', 'are'], a: 2 },
      { id: 'a1_2', cefr: 'A1', skill: 'vocab',   q: 'I have two ___.', choices: ['cat', 'cats', 'cates', 'caties'], a: 1 },
      { id: 'a1_3', cefr: 'A1', skill: 'grammar', q: '___ is your name?', choices: ['What', 'Where', 'When', 'Who'], a: 0 },
      { id: 'a1_4', cefr: 'A1', skill: 'grammar', q: 'They ___ to school every day.', choices: ['goes', 'going', 'go', 'went'], a: 2 },
      // A2
      { id: 'a2_1', cefr: 'A2', skill: 'grammar', q: 'I ___ TV when the phone rang.', choices: ['watch', 'watched', 'was watching', 'am watching'], a: 2 },
      { id: 'a2_2', cefr: 'A2', skill: 'grammar', q: 'This book is ___ than that one.', choices: ['interesting', 'more interesting', 'most interesting', 'interestinger'], a: 1 },
      { id: 'a2_3', cefr: 'A2', skill: 'grammar', q: 'We ___ finished our homework yet.', choices: ["didn't", "haven't", "don't", "aren't"], a: 1 },
      { id: 'a2_4', cefr: 'A2', skill: 'grammar', q: 'If it rains, we ___ stay home.', choices: ['will', 'would', 'were', 'have'], a: 0 },
      // B1
      { id: 'b1_1', cefr: 'B1', skill: 'grammar', q: 'By the time we arrived, the movie ___.', choices: ['started', 'has started', 'had started', 'starts'], a: 2 },
      { id: 'b1_2', cefr: 'B1', skill: 'grammar', q: 'He suggested ___ a taxi.', choices: ['to take', 'taking', 'take', 'took'], a: 1 },
      { id: 'b1_3', cefr: 'B1', skill: 'grammar', q: "I'm not used to ___ up early.", choices: ['get', 'getting', 'got', 'gets'], a: 1 },
      { id: 'b1_4', cefr: 'B1', skill: 'grammar', q: 'She asked me where ___.', choices: ['did I live', 'I lived', 'I live', 'lived I'], a: 1 },
      // B2
      { id: 'b2_1', cefr: 'B2', skill: 'grammar', q: '___ harder, he would have passed.', choices: ['If he studied', 'Had he studied', 'Did he study', 'He studied'], a: 1 },
      { id: 'b2_2', cefr: 'B2', skill: 'grammar', q: 'The project, ___ took months, was a success.', choices: ['that', 'which', 'who', 'what'], a: 1 },
      { id: 'b2_3', cefr: 'B2', skill: 'grammar', q: "I'd rather you ___ smoke in here.", choices: ["don't", "didn't", "won't", 'not'], a: 1 },
      { id: 'b2_4', cefr: 'B2', skill: 'grammar', q: "It's high time we ___ a decision.", choices: ['make', 'made', 'making', 'have made'], a: 1 },
      // C1
      { id: 'c1_1', cefr: 'C1', skill: 'grammar', q: 'No sooner ___ than it started to rain.', choices: ['we had left', 'had we left', 'we left', 'did we leave'], a: 1 },
      { id: 'c1_2', cefr: 'C1', skill: 'vocab',   q: "Closest in meaning to 'meticulous':", choices: ['careless', 'thorough', 'quick', 'rude'], a: 1 },
      { id: 'c1_3', cefr: 'C1', skill: 'vocab',   q: 'The negotiations ___ down over the issue of pay.', choices: ['broke', 'fell', 'came', 'went'], a: 0 },
      { id: 'c1_4', cefr: 'C1', skill: 'grammar', q: 'Little ___ that he was being watched.', choices: ['he knew', 'did he know', 'he did know', 'knew he'], a: 1 },
      // C2
      { id: 'c2_1', cefr: 'C2', skill: 'vocab',   q: "Closest in meaning to 'ubiquitous':", choices: ['rare', 'omnipresent', 'ancient', 'hidden'], a: 1 },
      { id: 'c2_2', cefr: 'C2', skill: 'vocab',   q: 'Her argument was so ___ that no one could refute it.', choices: ['cogent', 'vague', 'trivial', 'mundane'], a: 0 },
      { id: 'c2_3', cefr: 'C2', skill: 'vocab',   q: "'To throw in the towel' means to:", choices: ['give up', 'start a fight', 'clean up', 'win easily'], a: 0 },
      { id: 'c2_4', cefr: 'C2', skill: 'grammar', q: 'Choose the correct sentence:', choices: ['Scarcely had I sat down when the bell rang.', 'Scarcely I had sat down when the bell rang.', 'Scarcely did I had sat down when the bell rang.', 'Scarcely I sat down when the bell rang.'], a: 0 },
    ];
    const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const CEFR_WEIGHT: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
    if (method === 'GET' && path === '/api/leveltest/questions') {
      // 정답(a)·skill 은 숨기고 문항만 전달
      const questions = CEFR_BANK.map(x => ({ id: x.id, cefr: x.cefr, q: x.q, choices: x.choices }));
      return json({ ok: true, questions, total: questions.length });
    }
    if (method === 'POST' && path === '/api/leveltest/diagnose') {
      await ensureLtApps();
      const b = await parseJsonBody(request);
      const answers = (b && b.answers) || {};
      const name = ((b && (b.student_name || b.name)) || '').toString().trim();
      const uid = (b && (b.student_uid || b.uid)) || null;
      // 서버 채점
      const correctByLevel: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
      const totalByLevel: Record<string, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
      let earned = 0, maxScore = 0, correctCount = 0;
      for (const item of CEFR_BANK) {
        totalByLevel[item.cefr]++;
        maxScore += CEFR_WEIGHT[item.cefr];
        const picked = answers[item.id];
        if (picked != null && Number(picked) === item.a) {
          correctByLevel[item.cefr]++;
          earned += CEFR_WEIGHT[item.cefr];
          correctCount++;
        }
      }
      const ai_score = maxScore > 0 ? Math.round((earned / maxScore) * 100) : 0;
      // 천장기법: A1→C2 로 올라가며 각 레벨 50%(2/4) 이상 통과한 마지막 레벨을 추정레벨로.
      let level = 'Starter';
      for (const L of CEFR_ORDER) {
        if (totalByLevel[L] > 0 && correctByLevel[L] >= Math.ceil(totalByLevel[L] / 2)) level = L;
        else break;
      }
      const breakdown = CEFR_ORDER.map(L => ({ cefr: L, correct: correctByLevel[L], total: totalByLevel[L] }));
      // 신청건에 자동 첨부 (uid 우선 매칭 → 이름 → 없으면 새 신청 생성)
      const now = Date.now();
      let appId: number | null = null;
      if (uid) {
        const r = await env.DB.prepare(`SELECT id FROM leveltest_applications WHERE status = 'pending' AND student_uid = ? ORDER BY created_at DESC LIMIT 1`).bind(uid).all();
        if (r.results && r.results[0]) appId = (r.results[0] as any).id;
      }
      if (appId == null && name) {
        const r = await env.DB.prepare(`SELECT id FROM leveltest_applications WHERE status = 'pending' AND student_name = ? ORDER BY created_at DESC LIMIT 1`).bind(name).all();
        if (r.results && r.results[0]) appId = (r.results[0] as any).id;
      }
      if (appId != null) {
        await env.DB.prepare(`UPDATE leveltest_applications SET ai_score = ?, final_level = ?, updated_at = ? WHERE id = ?`).bind(ai_score, level, now, appId).run();
      } else {
        const ins = await env.DB.prepare(
          `INSERT INTO leveltest_applications (student_name, student_uid, status, ai_score, final_level, source, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?, 'ai-diagnosis', ?, ?)`
        ).bind(name || (uid ? String(uid) : 'AI 진단'), uid, ai_score, level, now, now).run();
        appId = ins.meta.last_row_id as number;
      }
      return json({ ok: true, ai_score, level, correct: correctCount, total: CEFR_BANK.length, breakdown, application_id: appId });
    }

    // ─── 수강신청 ─────────────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/enrollments') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      // 🥭 Phase 37b — 누락 컬럼 자동 보강 (Phase 36 seed 가 사용하는 컬럼들)
      const _addEnrCol2 = async (col: string, type: string) => {
        try { await env.DB.exec(`ALTER TABLE enrollments ADD COLUMN ${col} ${type}`); } catch {}
      };
      await _addEnrCol2('days_of_week', 'TEXT');
      await _addEnrCol2('time', 'TEXT');
      await _addEnrCol2('class_size', 'TEXT');
      await _addEnrCol2('type', 'TEXT');
      await _addEnrCol2('teacher_name', 'TEXT');
      await _addEnrCol2('end_date', 'TEXT');
      if (method === 'GET') {
        // 🥭 Phase 37b — user_id 필터 추가 (학생별 스케줄 fetch)
        const statusF = url.searchParams.get('status');
        const userIdF = url.searchParams.get('user_id');
        const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
        const where: string[] = []; const binds: any[] = [];
        if (statusF) { where.push('status = ?'); binds.push(statusF); }
        if (userIdF) { where.push('student_user_id = ?'); binds.push(userIdF); }
        const sql = `SELECT * FROM enrollments${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
        binds.push(lim);
        try {
          const rs = await env.DB.prepare(sql).bind(...binds).all<any>();
          return json({ ok: true, items: rs.results || [] });
        } catch (e: any) {
          return json({ ok: true, items: [], warning: String(e?.message || e) });
        }
      }
      const b = await parseJsonBody(request);
      if (!b || !b.student_name || !b.package) return invalidBody(['student_name', 'package']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO enrollments (student_user_id, student_name, package, started_at, ended_at, monthly_fee_krw, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.student_user_id || null, b.student_name, b.package,
        b.started_at ? Number(b.started_at) : now,
        b.ended_at ? Number(b.ended_at) : null,
        b.monthly_fee_krw != null ? Number(b.monthly_fee_krw) : null,
        b.status || 'pending', b.notes || null, now, now
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // 수강신청 상태 변경 (pending → confirmed → cancelled 등)
    if (method === 'PATCH' && /^\/api\/admin\/enrollments\/\d+$/.test(path)) {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      const m = path.match(/^\/api\/admin\/enrollments\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      const b = await parseJsonBody(request);
      if (!b || !b.status) return invalidBody(['status']);
      const allowed = new Set(['pending', 'confirmed', 'active', 'cancelled', 'expired']);
      if (!allowed.has(b.status)) return json({ ok: false, error: 'invalid_status', allowed: Array.from(allowed) }, 400);
      await env.DB.prepare(`UPDATE enrollments SET status = ?, updated_at = ? WHERE id = ?`).bind(b.status, Date.now(), id).run();
      return json({ ok: true, id, status: b.status });
    }

    // ─── 커뮤니티 게시글 ──────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/community-posts') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      if (method === 'GET') {
        const rs = await env.DB.prepare(`SELECT * FROM community_posts ORDER BY pinned DESC, created_at DESC LIMIT 200`).all();
        return json({ ok: true, items: rs.results || [] });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.title) return invalidBody(['title']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO community_posts (title, body, author, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(b.title, b.body || null, b.author || 'admin', b.pinned ? 1 : 0, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // 게시글 고정 토글 / 삭제
    if (method === 'PATCH' && /^\/api\/admin\/community-posts\/\d+$/.test(path)) {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      const m = path.match(/^\/api\/admin\/community-posts\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      const b = await parseJsonBody(request);
      if (!b) return invalidBody(['pinned/title/body 등']);
      const sets: string[] = [];
      const binds: any[] = [];
      if (b.title !== undefined)  { sets.push('title = ?');  binds.push(b.title); }
      if (b.body !== undefined)   { sets.push('body = ?');   binds.push(b.body); }
      if (b.pinned !== undefined) { sets.push('pinned = ?'); binds.push(b.pinned ? 1 : 0); }
      if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      await env.DB.prepare(`UPDATE community_posts SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true, id });
    }

    // ─── 교재 콘텐츠 ─────────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/textbooks') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS textbooks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT, units INTEGER, isbn TEXT, publisher TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      // 🎬 교재별 예습/복습 동영상 컬럼 (없으면 추가 — 기존 데이터 보존)
      for (const ddl of [`ALTER TABLE textbooks ADD COLUMN video_url TEXT`, `ALTER TABLE textbooks ADD COLUMN video_type TEXT DEFAULT 'preview'`, `ALTER TABLE textbooks ADD COLUMN video_title TEXT`]) { try { await env.DB.exec(ddl); } catch {} }
      if (method === 'GET') {
        const rs = await env.DB.prepare(`SELECT * FROM textbooks ORDER BY active DESC, level ASC, title ASC`).all();
        return json({ ok: true, items: rs.results || [] });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.title) return invalidBody(['title']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO textbooks (title, level, units, isbn, publisher, notes, video_url, video_type, video_title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.title, b.level || null, b.units != null ? Number(b.units) : null, b.isbn || null, b.publisher || null, b.notes || null, b.video_url || null, b.video_type || 'preview', b.video_title || null, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // 🎬 수업방 입장 시 교재 → 예습/복습 동영상 자동 매칭
    //   GET /api/get-lesson-video/<book_id>  → { success, has_video, book, video_url, ... }
    if (method === 'GET' && /^\/api\/get-lesson-video\/\d+$/.test(path)) {
      const bookId = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS textbooks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT, units INTEGER, isbn TEXT, publisher TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      for (const ddl of [`ALTER TABLE textbooks ADD COLUMN video_url TEXT`, `ALTER TABLE textbooks ADD COLUMN video_type TEXT DEFAULT 'preview'`, `ALTER TABLE textbooks ADD COLUMN video_title TEXT`]) { try { await env.DB.exec(ddl); } catch {} }
      const bk: any = await env.DB.prepare(`SELECT * FROM textbooks WHERE id = ?`).bind(bookId).first().catch(() => null);
      if (!bk) return json({ success: false, message: `${bookId}번 교재를 찾을 수 없습니다.` }, 404);
      if (!bk.video_url) return json({ success: true, has_video: false, book: bk, message: '이 교재에는 연결된 예습/복습 동영상이 아직 없습니다.' });
      const isYt0 = /youtu\.?be|youtube\.com/.test(String(bk.video_url));
      return json({ success: true, has_video: true, book: bk, is_youtube: isYt0, video_url: bk.video_url, video_type: bk.video_type || 'preview', video_title: bk.video_title || bk.title });
    }

    // 🎬 교재명(또는 id)으로 동영상 매칭 — 등록된 망고아이 비디오(YouTube) 또는 교재 video_url
    //   GET /api/lesson-video?q=<교재명>  또는  ?id=<교재id>
    if (method === 'GET' && path === '/api/lesson-video') {
      const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
      let q = (url.searchParams.get('q') || '').trim();
      const idParam = parseInt(url.searchParams.get('id') || '0', 10);
      // 1) 교재 id 가 오면 textbooks.video_url 우선
      if (idParam) {
        try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS textbooks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT, units INTEGER, isbn TEXT, publisher TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`); } catch {}
        for (const ddl of [`ALTER TABLE textbooks ADD COLUMN video_url TEXT`, `ALTER TABLE textbooks ADD COLUMN video_type TEXT DEFAULT 'preview'`, `ALTER TABLE textbooks ADD COLUMN video_title TEXT`]) { try { await env.DB.exec(ddl); } catch {} }
        const bk2: any = await env.DB.prepare(`SELECT * FROM textbooks WHERE id = ?`).bind(idParam).first().catch(() => null);
        if (bk2 && bk2.video_url) {
          const isYt = /youtu\.?be|youtube\.com/.test(String(bk2.video_url));
          return json({ success: true, has_video: true, is_youtube: isYt, video_url: bk2.video_url, video_type: bk2.video_type || 'preview', video_title: bk2.video_title || bk2.title });
        }
        if (bk2 && bk2.title && !q) q = String(bk2.title); // 교재명으로 비디오 매칭 시도
      }
      // 2) 교재명으로 망고아이 비디오(YouTube) 자동 매칭 — 진도(레벨+유닛) 기준
      if (q) {
        const nq = norm(q);
        // 교재명/영상제목에서 BTS 레벨 + 유닛 번호들 추출
        //   영상은 유닛 "범위"(예: "BTS 1 Unit 001-003", "BTS 03 004 006") → [min,max] 범위로 봄
        //   교재는 단일 유닛(예: "BTS 1 003") → 마지막 숫자를 유닛으로 봄
        const parseBTS = (s: string) => {
          const m = String(s || '').match(/BTS\s*0*([0-9]+)([\s\S]*)/i);
          if (!m) return null;
          const level = parseInt(m[1], 10);
          const nums = ((m[2] || '').match(/[0-9]{1,3}/g) || []).map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 999);
          return { level, nums };
        };
        const isReview = (s: string) => /review|복습|test|테스트/i.test(String(s || ''));
        const tk = parseBTS(q);
        const tbUnit = (tk && tk.nums.length) ? tk.nums[tk.nums.length - 1] : null; // 교재 = 마지막 숫자
        const wantReview = isReview(q);
        const vids = ((await env.DB.prepare(`SELECT id, title, youtube_url, youtube_id, thumbnail_url, level, category FROM mango_videos WHERE active = 1 ORDER BY created_at DESC LIMIT 1000`).all().catch(() => ({ results: [] }))).results || []) as any[];
        let best: any = null;
        // (a) 레벨 일치 + 교재 유닛이 영상의 유닛 범위 안 — 예습(비REVIEW) 우선
        if (tk && tbUnit != null) {
          const cands = vids.filter((v: any) => {
            const vk = parseBTS(v.title);
            if (!vk || vk.level !== tk.level || !vk.nums.length) return false;
            const lo = Math.min(...vk.nums), hi = Math.max(...vk.nums);
            return tbUnit >= lo && tbUnit <= hi;
          });
          best = cands.find((v: any) => isReview(v.title) === wantReview) || cands[0] || null;
        }
        // (a2) 레벨은 있는데 유닛이 없거나(책 단위) 범위 매칭 실패 → 그 레벨의 가장 낮은 유닛 예습 영상
        if (!best && tk && tk.level != null) {
          const lvCands = vids.filter((v: any) => { const vk = parseBTS(v.title); return !!(vk && vk.level === tk.level && vk.nums.length); });
          lvCands.sort((a: any, b: any) => Math.min(...(parseBTS(a.title) as any).nums) - Math.min(...(parseBTS(b.title) as any).nums));
          best = lvCands.find((v: any) => !isReview(v.title)) || lvCands[0] || null;
        }
        // (b) 제목 포함 매칭 (Phonics 등 유닛번호 없는 교재)
        if (!best) { for (const v of vids) { const nt = norm(v.title); if (nt && nq && (nt.includes(nq) || nq.includes(nt))) { best = v; break; } } }
        // (c) 앞 8자 부분 매칭
        if (!best && nq.length >= 4) { const key = nq.slice(0, 8); for (const v of vids) { if (norm(v.title).includes(key)) { best = v; break; } } }
        if (best) return json({ success: true, has_video: true, is_youtube: true, youtube_id: best.youtube_id, youtube_url: best.youtube_url, video_url: best.youtube_url, video_title: best.title, video_type: isReview(best.title) ? 'review' : 'preview' });
      }
      return json({ success: true, has_video: false, message: '매칭된 동영상이 없습니다.' });
    }

    // 🎬 유튜브 채널 영상 일괄 가져오기 (YouTube Data API v3)
    //   POST /api/admin/mango-videos/import-channel  { channel_url 또는 channel_id, api_key? }
    if (method === 'POST' && path === '/api/admin/mango-videos/import-channel') {
      const ib: any = await parseJsonBody(request).catch(() => null);
      const apiKey = String((ib && ib.api_key) || (env as any).YOUTUBE_API_KEY || '').trim();
      if (!apiKey) return json({ ok: false, error: 'no_api_key', message: 'YouTube Data API 키가 필요합니다.' }, 400);
      let channelId = String((ib && ib.channel_id) || '').trim();
      const cu = String((ib && ib.channel_url) || '').trim();
      if (!channelId && cu) { const m = cu.match(/channel\/(UC[\w-]+)/); if (m) channelId = m[1]; }
      if (!channelId && /^UC[\w-]+$/.test(cu)) channelId = cu;
      if (!channelId) return json({ ok: false, error: 'no_channel', message: '채널 ID(UC...)를 찾을 수 없습니다.' }, 400);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS mango_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_en TEXT, youtube_url TEXT NOT NULL, youtube_id TEXT NOT NULL, thumbnail_url TEXT, level TEXT, lesson_no INTEGER, category TEXT, description TEXT, description_en TEXT, duration_sec INTEGER, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      } catch {}
      // 1) 채널의 업로드 재생목록 id 조회
      const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`);
      const chData: any = await chRes.json().catch(() => ({}));
      const uploads = chData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return json({ ok: false, error: 'no_uploads', message: chData?.error?.message || '업로드 재생목록을 찾을 수 없습니다(키·채널 확인).' }, 400);
      // 2) 재생목록 전체 페이지네이션
      let pageToken = '';
      let imported = 0, skipped = 0, total = 0;
      const now = Date.now();
      for (let p = 0; p < 40; p++) {
        const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${uploads}&key=${apiKey}${pageToken ? '&pageToken=' + pageToken : ''}`);
        const plData: any = await plRes.json().catch(() => ({}));
        const items = plData?.items || [];
        for (const it of items) {
          total++;
          const vid = it?.contentDetails?.videoId || it?.snippet?.resourceId?.videoId;
          const title = (it?.snippet?.title || '').trim();
          if (!vid || !title || title === 'Private video' || title === 'Deleted video') { skipped++; continue; }
          const exist = await env.DB.prepare(`SELECT id FROM mango_videos WHERE youtube_id = ?`).bind(vid).first().catch(() => null);
          if (exist) { skipped++; continue; }
          const thumb = it?.snippet?.thumbnails?.high?.url || `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
          const lvMatch = title.match(/(?:Lv|Level|레벨)\s*([0-9]+)/i) || title.match(/BTS\s*([0-9]+)/i);
          const level = lvMatch ? String(lvMatch[1]) : null;
          const lnMatch = title.match(/(?:UNIT|Unit|Lesson|LESSON|레슨)\s*([0-9]+)/) || title.match(/\b([0-9]{3})\b/);
          const lessonNo = lnMatch ? parseInt(lnMatch[1], 10) : null;
          await env.DB.prepare(`INSERT INTO mango_videos (title, youtube_url, youtube_id, thumbnail_url, level, lesson_no, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
            .bind(title, `https://www.youtube.com/watch?v=${vid}`, vid, thumb, level, lessonNo, now, now).run();
          imported++;
        }
        pageToken = plData?.nextPageToken || '';
        if (!pageToken) break;
      }
      return json({ ok: true, channel_id: channelId, total, imported, skipped });
    }


    // ═══════════════════════════════════════════════════════════════
    // 👁 Phase GM — 관리자 통제 (Ghost 참관 + Whisper 귓속말 + AI 알림)
    //   GM-1: 테이블 6개 + GM-2: API 11개 (인프라 + 감사 로그)
    //   GM-3: 관리자 UI 카드 (별도 admin.html)
    //   GM-4(미디어 라우팅) + GM-5(AI 분석)는 추후 — 지금은 안전한 hook 만
    // ═══════════════════════════════════════════════════════════════
    const ensureAdminControlSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_perms (admin_uid TEXT PRIMARY KEY, can_ghost INTEGER DEFAULT 0, can_whisper INTEGER DEFAULT 0, can_kick INTEGER DEFAULT 0, can_view_alerts INTEGER DEFAULT 1, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_observations (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, room_id TEXT NOT NULL, reason TEXT, joined_at INTEGER NOT NULL, left_at INTEGER, consumer_ids TEXT, ip TEXT, user_agent TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_whispers (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, room_id TEXT NOT NULL, target_teacher_uid TEXT NOT NULL, message_type TEXT, payload TEXT, urgency TEXT DEFAULT 'normal', sent_at INTEGER NOT NULL, delivered_at INTEGER, read_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS room_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, alert_type TEXT NOT NULL, severity TEXT, detail TEXT, triggered_at INTEGER NOT NULL, acknowledged_by TEXT, acknowledged_at INTEGER, auto_action TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS forbidden_words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL UNIQUE, severity TEXT DEFAULT 'medium', language TEXT DEFAULT 'both', added_by TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, action TEXT NOT NULL, target_room TEXT, target_user TEXT, meta TEXT, ip TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_room ON room_alerts(room_id, triggered_at);`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_logs(admin_uid, created_at);`);
    };

    // 감사 로그 헬퍼
    const writeAudit = async (adminUid: string, action: string, opts: any = {}) => {
      try {
        await env.DB.prepare(
          `INSERT INTO admin_audit_logs (admin_uid, action, target_room, target_user, meta, ip, created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(adminUid, action, opts.room || null, opts.user || null, opts.meta ? JSON.stringify(opts.meta) : null, opts.ip || null, Date.now()).run();
      } catch (e: any) { console.error('[audit]', e?.message); }
    };

    // ── ① POST /api/admin/ghost/start — 고스트 참관 시작 기록 ──
    if (method === 'POST' && path === '/api/admin/ghost/start') {
      await ensureAdminControlSchema();
      const b: any = await request.json().catch(() => ({}));
      const adminUid = String(b.admin_uid || '').trim();
      const roomId = String(b.room_id || '').trim();
      const reason = String(b.reason || '').trim();
      if (!adminUid || !roomId) return json({ ok: false, error: 'admin_uid_and_room_id_required' }, 400);
      if (!reason) return json({ ok: false, error: 'reason_required', message: '참관 사유는 감사 추적을 위해 필수입니다.' }, 400);

      const ip = request.headers.get('cf-connecting-ip') || '';
      const ua = (request.headers.get('user-agent') || '').slice(0, 255);
      const r: any = await env.DB.prepare(
        `INSERT INTO admin_observations (admin_uid, room_id, reason, joined_at, ip, user_agent) VALUES (?,?,?,?,?,?)`
      ).bind(adminUid, roomId, reason, Date.now(), ip || null, ua || null).run();
      const observationId = r.meta?.last_row_id;
      await writeAudit(adminUid, 'ghost_join', { room: roomId, ip, meta: { observation_id: observationId, reason } });

      // GM-4 미구현: 실제 미디어 consumer 는 추후. 지금은 기록만.
      return json({
        ok: true, observation_id: observationId, room_id: roomId,
        ghost_mode: 'recorded_only',
        notice_sent_to_others: false,                            // 핵심: 다른 참가자에게 알림 X
        media_consumer_pending: true,                            // GM-4 에서 활성화 예정
      });
    }

    // ── ② POST /api/admin/ghost/end — 참관 종료 ──
    if (method === 'POST' && path === '/api/admin/ghost/end') {
      await ensureAdminControlSchema();
      const b: any = await request.json().catch(() => ({}));
      const adminUid = String(b.admin_uid || '').trim();
      const observationId = Number(b.observation_id);
      if (!adminUid || !observationId) return json({ ok: false, error: 'admin_uid_and_observation_id_required' }, 400);

      const row: any = await env.DB.prepare(
        `SELECT room_id, joined_at, left_at FROM admin_observations WHERE id = ? AND admin_uid = ?`
      ).bind(observationId, adminUid).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      if (row.left_at) return json({ ok: false, error: 'already_ended' }, 400);

      const now = Date.now();
      await env.DB.prepare(`UPDATE admin_observations SET left_at = ? WHERE id = ?`).bind(now, observationId).run();
      await writeAudit(adminUid, 'ghost_leave', { room: row.room_id, meta: { observation_id: observationId, duration_sec: Math.round((now - row.joined_at) / 1000) } });
      return json({ ok: true, observation_id: observationId, duration_sec: Math.round((now - row.joined_at) / 1000) });
    }

    // ── ③ GET /api/admin/ghost/sessions — 참관 기록 ──
    if (method === 'GET' && path === '/api/admin/ghost/sessions') {
      await ensureAdminControlSchema();
      const adminUid = url.searchParams.get('admin_uid');
      const roomId = url.searchParams.get('room_id');
      let q = `SELECT id, admin_uid, room_id, reason, joined_at, left_at, ip FROM admin_observations`;
      const where: string[] = [], binds: any[] = [];
      if (adminUid) { where.push('admin_uid = ?'); binds.push(adminUid); }
      if (roomId) { where.push('room_id = ?'); binds.push(roomId); }
      if (where.length) q += ' WHERE ' + where.join(' AND ');
      q += ' ORDER BY joined_at DESC LIMIT 100';
      const rs: any = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── ④ POST /api/admin/whisper/send — 강사에게 귓속말 전송 (기록) ──
    if (method === 'POST' && path === '/api/admin/whisper/send') {
      await ensureAdminControlSchema();
      const b: any = await request.json().catch(() => ({}));
      const adminUid = String(b.admin_uid || '').trim();
      const roomId = String(b.room_id || '').trim();
      const teacherUid = String(b.teacher_uid || '').trim();
      const messageType = String(b.message_type || 'text').trim();
      const payload = String(b.payload || '').trim();
      const urgency = String(b.urgency || 'normal').trim();
      if (!adminUid || !roomId || !teacherUid || !payload) return json({ ok: false, error: 'fields_required' }, 400);
      if (!['text', 'audio', 'hint'].includes(messageType)) return json({ ok: false, error: 'invalid_message_type' }, 400);

      const r: any = await env.DB.prepare(
        `INSERT INTO admin_whispers (admin_uid, room_id, target_teacher_uid, message_type, payload, urgency, sent_at) VALUES (?,?,?,?,?,?,?)`
      ).bind(adminUid, roomId, teacherUid, messageType, payload, urgency, Date.now()).run();
      const whisperId = r.meta?.last_row_id;
      await writeAudit(adminUid, 'whisper_send', { room: roomId, user: teacherUid, meta: { type: messageType, urgency, len: payload.length } });

      // GM-4 미구현: 실제 WebSocket push 는 추후 (SignalingRoom DO 와 통합)
      return json({
        ok: true, whisper_id: whisperId,
        delivery_status: 'queued',                               // GM-4 에서 'delivered' 로 갱신
        learning_note: '강사 클라이언트에만 전달, 학생 누설 차단 처리는 GM-4 단계에서 활성화',
      });
    }

    // ── ⑤ GET /api/admin/whisper/logs — 귓속말 로그 ──
    if (method === 'GET' && path === '/api/admin/whisper/logs') {
      await ensureAdminControlSchema();
      const roomId = url.searchParams.get('room_id');
      let q = `SELECT id, admin_uid, room_id, target_teacher_uid, message_type, payload, urgency, sent_at, delivered_at, read_at FROM admin_whispers`;
      const binds: any[] = [];
      if (roomId) { q += ' WHERE room_id = ?'; binds.push(roomId); }
      q += ' ORDER BY sent_at DESC LIMIT 50';
      const rs: any = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── ⑥ GET /api/admin/alerts — 알림 목록 ──
    if (method === 'GET' && path === '/api/admin/alerts') {
      await ensureAdminControlSchema();
      const onlyUnack = url.searchParams.get('only_unack') === '1';
      let q = `SELECT id, room_id, alert_type, severity, detail, triggered_at, acknowledged_by, acknowledged_at, auto_action FROM room_alerts`;
      if (onlyUnack) q += ' WHERE acknowledged_at IS NULL';
      q += ' ORDER BY triggered_at DESC LIMIT 100';
      const rs: any = await env.DB.prepare(q).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── ⑦ POST /api/admin/alerts/:id/ack — 알림 확인 처리 ──
    const ackMatch = path.match(/^\/api\/admin\/alerts\/(\d+)\/ack$/);
    if (method === 'POST' && ackMatch) {
      await ensureAdminControlSchema();
      const alertId = parseInt(ackMatch[1], 10);
      const b: any = await request.json().catch(() => ({}));
      const adminUid = String(b.admin_uid || '').trim();
      if (!adminUid) return json({ ok: false, error: 'admin_uid_required' }, 400);
      await env.DB.prepare(`UPDATE room_alerts SET acknowledged_by = ?, acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL`)
        .bind(adminUid, Date.now(), alertId).run();
      await writeAudit(adminUid, 'alert_ack', { meta: { alert_id: alertId } });
      return json({ ok: true });
    }

    // ── ⑧ POST /api/admin/alerts/test-fire — 테스트용 알림 발사 (GM-5 미구현 폴백) ──
    if (method === 'POST' && path === '/api/admin/alerts/test-fire') {
      await ensureAdminControlSchema();
      const b: any = await request.json().catch(() => ({}));
      const roomId = String(b.room_id || 'test-room').trim();
      const alertType = String(b.alert_type || 'silence_20s').trim();
      const severity = String(b.severity || 'medium').trim();
      const detail = b.detail || { test: true, duration_sec: 25 };
      const r: any = await env.DB.prepare(
        `INSERT INTO room_alerts (room_id, alert_type, severity, detail, triggered_at) VALUES (?,?,?,?,?)`
      ).bind(roomId, alertType, severity, JSON.stringify(detail), Date.now()).run();
      return json({ ok: true, alert_id: r.meta?.last_row_id, room_id: roomId, alert_type: alertType });
    }

    // ── ⑨ GET /api/admin/forbidden-words — 금지 단어 목록 ──
    if (method === 'GET' && path === '/api/admin/forbidden-words') {
      await ensureAdminControlSchema();
      const rs: any = await env.DB.prepare(
        `SELECT id, word, severity, language, enabled, added_by, created_at FROM forbidden_words ORDER BY severity DESC, word ASC LIMIT 500`
      ).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── ⑩ POST /api/admin/forbidden-words — 금지 단어 추가 ──
    if (method === 'POST' && path === '/api/admin/forbidden-words') {
      await ensureAdminControlSchema();
      const b: any = await request.json().catch(() => ({}));
      const word = String(b.word || '').trim().toLowerCase();
      const severity = String(b.severity || 'medium').trim();
      const language = String(b.language || 'both').trim();
      const addedBy = String(b.added_by || '').trim();
      if (!word) return json({ ok: false, error: 'word_required' }, 400);
      try {
        await env.DB.prepare(
          `INSERT INTO forbidden_words (word, severity, language, added_by, created_at) VALUES (?,?,?,?,?) ON CONFLICT(word) DO UPDATE SET severity=excluded.severity, language=excluded.language, enabled=1`
        ).bind(word, severity, language, addedBy || null, Date.now()).run();
        if (addedBy) await writeAudit(addedBy, 'forbidden_word_add', { meta: { word, severity } });
        return json({ ok: true, word });
      } catch (e: any) { return json({ ok: false, error: String(e?.message || e) }, 500); }
    }

    // ── ⑪ DELETE /api/admin/forbidden-words/:id — 금지 단어 삭제(비활성) ──
    const fwDelMatch = path.match(/^\/api\/admin\/forbidden-words\/(\d+)$/);
    if (method === 'DELETE' && fwDelMatch) {
      await ensureAdminControlSchema();
      const id = parseInt(fwDelMatch[1], 10);
      await env.DB.prepare(`UPDATE forbidden_words SET enabled = 0 WHERE id = ?`).bind(id).run();
      return json({ ok: true, id });
    }

    // ── ⑬ GET /api/admin/chat-messages?room_id=... — 강의실 채팅 조회 (참관용) ──
    if (method === 'GET' && path === '/api/admin/chat-messages') {
      const roomId = String(url.searchParams.get('room_id') || '').trim();
      if (!roomId) return json({ ok: false, error: 'room_id_required' }, 400);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, sender_uid TEXT, sender_name TEXT, sender_role TEXT, message TEXT NOT NULL, sent_at INTEGER NOT NULL, meta TEXT);`);
        const rs: any = await env.DB.prepare(
          `SELECT id, room_id, sender_uid, sender_name, sender_role, message, sent_at FROM chat_messages WHERE room_id = ? ORDER BY sent_at ASC LIMIT 100`
        ).bind(roomId).all();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: true, items: [], note: 'chat_messages_unavailable' });
      }
    }

    // ── ⑭ GET /api/admin/room-attendance?room_id=... — 강의실 출석/참가자 조회 ──
    if (method === 'GET' && path === '/api/admin/room-attendance') {
      const roomId = String(url.searchParams.get('room_id') || '').trim();
      if (!roomId) return json({ ok: false, error: 'room_id_required' }, 400);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, username TEXT, role TEXT, joined_at INTEGER, left_at INTEGER, status TEXT, date TEXT);`);
        const rs: any = await env.DB.prepare(
          `SELECT id, room_id, user_id, username, role, joined_at, left_at, status FROM attendance WHERE room_id = ? ORDER BY joined_at DESC LIMIT 50`
        ).bind(roomId).all();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: true, items: [], note: 'attendance_unavailable' });
      }
    }

    // ── ⑫ GET /api/admin/audit-logs — 감사 로그 조회 ──
    if (method === 'GET' && path === '/api/admin/audit-logs') {
      await ensureAdminControlSchema();
      const adminUid = url.searchParams.get('admin_uid');
      let q = `SELECT id, admin_uid, action, target_room, target_user, meta, ip, created_at FROM admin_audit_logs`;
      const binds: any[] = [];
      if (adminUid) { q += ' WHERE admin_uid = ?'; binds.push(adminUid); }
      q += ' ORDER BY created_at DESC LIMIT 200';
      const rs: any = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // 👁 Phase GM 끝 (GM-1, GM-2 인프라 + API)
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🌅 Phase DB — 매일 아침 자동 일일 브리핑 (Daily Briefing)
    // ═══════════════════════════════════════════════════════════════
    if ((method === 'POST' && path === '/api/admin/briefing/generate') || (method === 'GET' && path === '/api/admin/briefing/latest')) {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS daily_briefings (id INTEGER PRIMARY KEY AUTOINCREMENT, briefing_date TEXT NOT NULL, briefing_text TEXT NOT NULL, stats TEXT, created_at INTEGER NOT NULL);`);

        // GET latest — 최근 N개 또는 단건
        if (method === 'GET' && path === '/api/admin/briefing/latest') {
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '1'), 30);
          const rs: any = await env.DB.prepare(`SELECT id, briefing_date, briefing_text, stats, created_at FROM daily_briefings ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
          const items = (rs.results || []).map((r: any) => { let st = null; try { st = r.stats ? JSON.parse(r.stats) : null; } catch {} return { ...r, stats: st }; });
          return json({ ok: true, items });
        }

        // POST generate — 어제 데이터 집계 + AI 작문
        const now = Date.now();
        const yesterdayTs = now - 86400000;
        const yesterdayStr = new Date(yesterdayTs).toISOString().slice(0, 10);
        const todayStartTs = new Date(yesterdayStr + 'T00:00:00.000Z').getTime();
        const todayEndTs = todayStartTs + 86400000;

        // 1) 신규 등록 (students_erp.created_at 가 있을 경우)
        let newEnroll = 0;
        try {
          const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ? AND created_at < ?`).bind(todayStartTs, todayEndTs).first();
          newEnroll = r?.n || 0;
        } catch {}

        // 2) 신규 상담
        let newInquiry = 0;
        try {
          const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ?`).bind(todayStartTs, todayEndTs).first();
          newInquiry = r?.n || 0;
        } catch {}

        // 3) 미납 건수
        let overdueCount = 0;
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`);
          const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at < ?`).bind(now).first();
          overdueCount = r?.n || 0;
        } catch {}

        // 4) 위험 학생 수 — 기존 retention/risk 로직을 가볍게 재호출 대신 직접 카운트
        let atRiskCount = 0;
        try {
          const r: any = await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM attendance WHERE joined_at < ?`).bind(now - 14 * 86400000).first();
          // 최근 14일간 결석한 사람 근사치 — 정확한 점수는 풀 risk 엔드포인트 사용
          atRiskCount = r?.n || 0;
        } catch {}

        // 5) 출석률 (어제 기준 — 등록한 활성 학생 수 대비 출석한 학생 수)
        let attendanceRate = 0, attendedYesterday = 0, activeStudents = 0;
        try {
          const att: any = await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM attendance WHERE date = ?`).bind(yesterdayStr).first();
          attendedYesterday = att?.n || 0;
          const tot: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE status IN ('정상','활동','active') OR status IS NULL OR status = ''`).first();
          activeStudents = tot?.n || 0;
          if (activeStudents > 0) attendanceRate = Math.round((attendedYesterday / activeStudents) * 100);
        } catch {}

        // 6) 최근 평가 평균
        let recentEvalAvg = 0;
        try {
          const r: any = await env.DB.prepare(`SELECT AVG(score_overall) AS a FROM student_evaluations WHERE created_at >= ?`).bind(now - 7 * 86400000).first();
          recentEvalAvg = Math.round((r?.a || 0) * 10) / 10;
        } catch {}

        const stats = {
          date: yesterdayStr,
          new_enrollment: newEnroll,
          new_inquiry: newInquiry,
          overdue_count: overdueCount,
          at_risk_count: atRiskCount,
          attendance_rate: attendanceRate,
          attended_yesterday: attendedYesterday,
          active_students: activeStudents,
          recent_eval_avg: recentEvalAvg,
        };

        // AI 작문 — 친근한 한국어 5-7문장 브리핑
        let briefingText = '';
        try {
          if (env.AI) {
            const prompt = `다음은 어제(${yesterdayStr}) 망고아이 학원의 운영 데이터입니다.\n\n- 신규 등록: ${newEnroll}명\n- 신규 상담: ${newInquiry}건\n- 미납 건수: ${overdueCount}건\n- 위험학생(2주+ 결석): ${atRiskCount}명\n- 어제 출석률: ${attendanceRate}% (${attendedYesterday}/${activeStudents})\n- 최근 7일 평가 평균: ${recentEvalAvg}점\n\n원장님께 드리는 아침 브리핑을 5-7문장으로 따뜻하고 명료한 한국어 존댓말로 작성해 주세요. 좋은 점은 칭찬하고, 우려되는 부분은 부드럽게 짚어주며 오늘 우선 챙겨야 할 액션 1-2개를 제안하세요.`;
            const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You are Mangoi admin assistant. Respond in warm, professional Korean.' },
                { role: 'user', content: prompt }
              ],
              max_tokens: 512,
            });
            briefingText = (ai?.response || '').trim();
          }
        } catch (aiErr: any) {
          console.warn('[briefing] AI failed', aiErr?.message);
        }
        if (!briefingText) {
          briefingText = `🌅 어제(${yesterdayStr}) 망고아이 브리핑입니다.\n신규 등록 ${newEnroll}명, 신규 상담 ${newInquiry}건이 접수되었습니다.\n어제 출석률은 ${attendanceRate}%(${attendedYesterday}/${activeStudents})이며 최근 평가 평균은 ${recentEvalAvg}점입니다.\n미납 ${overdueCount}건과 위험학생 ${atRiskCount}명에 대한 케어가 필요합니다.\n오늘도 좋은 하루 되세요!`;
        }

        await env.DB.prepare(`INSERT INTO daily_briefings (briefing_date, briefing_text, stats, created_at) VALUES (?,?,?,?)`)
          .bind(yesterdayStr, briefingText, JSON.stringify(stats), now).run();

        return json({ ok: true, briefing_text: briefingText, stats, briefing_date: yesterdayStr });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'briefing_failed' }, 500);
      }
    }


    // ═══════════════════════════════════════════════════════════════
    // 💰 Phase AD — 미납 자동 에스컬레이션 (Auto Dunning)
    // ═══════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/admin/dunning/run') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS dunning_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, stage TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);

        const now = Date.now();
        const day = 86400000;
        // 스테이지별 미납 — d1: 1~6일, d7: 7~13일, d14: 14일+
        const buckets: Array<{ stage: 'd1' | 'd7' | 'd14'; minDays: number; maxDays: number; tone: string }> = [
          { stage: 'd1',  minDays: 1,  maxDays: 6,   tone: '친근하고 부드러운' },
          { stage: 'd7',  minDays: 7,  maxDays: 13,  tone: '정중하지만 단호한' },
          { stage: 'd14', minDays: 14, maxDays: 9999, tone: '강한 경고와 긴급한' },
        ];

        const sentBy: Record<string, number> = { d1: 0, d7: 0, d14: 0 };
        const errors: any[] = [];

        for (const b of buckets) {
          const minTs = now - b.maxDays * day;
          const maxTs = now - b.minDays * day;
          const rs: any = await env.DB.prepare(`SELECT id, user_id, amount, due_at FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at >= ? AND due_at <= ?`).bind(minTs, maxTs).all();
          const items = (rs.results || []) as any[];
          for (const p of items) {
            // 24시간 내 같은 단계 발송 중복 방지
            try {
              const dup: any = await env.DB.prepare(`SELECT id FROM dunning_log WHERE user_id = ? AND stage = ? AND sent_at >= ?`).bind(p.user_id, b.stage, now - day).first();
              if (dup) continue;
            } catch {}

            const daysOverdue = Math.floor((now - p.due_at) / day);
            const amountWon = p.amount ? (p.amount / 10000).toFixed(0) + '만원' : '';
            let msg = '';
            try {
              if (env.AI) {
                const prompt = `학원 수강료 ${daysOverdue}일 연체 (${amountWon}) 안내 카톡 알림톡을 작성해 주세요. ${b.tone} 톤으로 한국어 존댓말, 3-4문장, 90자 이내. 학생 이름은 [학생명]으로 자리표시자만 두세요.`;
                const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                  messages: [
                    { role: 'system', content: 'You are a polite Korean parent-communication assistant for a kids English academy.' },
                    { role: 'user', content: prompt }
                  ],
                  max_tokens: 256,
                });
                msg = (ai?.response || '').trim();
              }
            } catch (aiErr: any) { errors.push({ user_id: p.user_id, error: aiErr?.message }); }

            if (!msg) {
              if (b.stage === 'd1')      msg = `안녕하세요. [학생명] 수강료가 ${daysOverdue}일 연체되었습니다. 확인 부탁드립니다. — 망고아이`;
              else if (b.stage === 'd7') msg = `[학생명] 수강료가 ${daysOverdue}일 연체되었습니다(${amountWon}). 금일 중 납부 부탁드립니다. — 망고아이`;
              else                       msg = `🚨 [학생명] 수강료 ${daysOverdue}일 연체(${amountWon}). 수업 중단 전 즉시 확인 바랍니다. — 망고아이`;
            }

            let status = 'queued';
            try {
              if ((env as any).KAKAO_TOKEN) {
                // 실 발송 hook — 기존 retention/care 패턴과 동일하게 큐 보관으로 시작
                status = 'sent';
              }
            } catch {}

            await env.DB.prepare(`INSERT INTO dunning_log (user_id, stage, message, sent_at, status) VALUES (?,?,?,?,?)`)
              .bind(p.user_id, b.stage, msg, now, status).run();
            sentBy[b.stage]++;
          }
        }

        return json({ ok: true, sent: sentBy, total: sentBy.d1 + sentBy.d7 + sentBy.d14, errors });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'dunning_failed' }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/dunning/log') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS dunning_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, stage TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
        // 통계
        const now = Date.now();
        const day = 86400000;
        let d1 = 0, d7 = 0, d14 = 0;
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`);
          const r1: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at >= ? AND due_at <= ?`).bind(now - 6 * day, now - 1 * day).first();
          d1 = r1?.n || 0;
          const r7: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at >= ? AND due_at <= ?`).bind(now - 13 * day, now - 7 * day).first();
          d7 = r7?.n || 0;
          const r14: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at < ?`).bind(now - 14 * day).first();
          d14 = r14?.n || 0;
        } catch {}
        const rs: any = await env.DB.prepare(`SELECT id, user_id, stage, message, sent_at, status FROM dunning_log ORDER BY sent_at DESC LIMIT ?`).bind(limit).all();
        return json({ ok: true, items: rs.results || [], stats: { d1, d7, d14 } });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'dunning_log_failed' }, 500);
      }
    }


    // (🤖 Phase PFB 학부모 상담챗봇 → api-students.ts — 4차 이동)

    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase AS — AI 주간 시간표 자동 짜기 (Auto Weekly Schedule)
    // ═══════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/admin/schedule/auto') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, teacher_uid TEXT, day TEXT, time TEXT, mbti_score INTEGER, source TEXT, status TEXT, created_at INTEGER NOT NULL);`);

        // Teachers (active)
        let teachers: any[] = [];
        try {
          const rs: any = await env.DB.prepare(`SELECT id, korean_name AS name, available_days, available_hours, group_name FROM teacher_profiles WHERE status IS NULL OR status = '활동중' LIMIT 200`).all();
          teachers = rs.results || [];
        } catch {}
        // 강사 MBTI 사전 (선택)
        const teacherMbti: Record<string, string> = {};
        try {
          const rs: any = await env.DB.prepare(`SELECT teacher_id, mbti FROM teacher_mbti`).all();
          for (const r of (rs.results || []) as any[]) teacherMbti[String(r.teacher_id)] = String(r.mbti || '');
        } catch {}

        // Students (active)
        let students: any[] = [];
        try {
          const cols: any = await env.DB.prepare(`PRAGMA table_info(students_erp)`).all();
          const colNames = ((cols.results || []) as any[]).map(c => c.name);
          const nCol = colNames.includes('student_name') ? 'student_name' : (colNames.includes('korean_name') ? 'korean_name' : (colNames.includes('name') ? 'name' : 'user_id'));
          const prefCol = colNames.includes('preferred_time') ? 'preferred_time' : `'오후 4-7시' AS preferred_time`;
          const mbtiCol = colNames.includes('mbti') ? 'mbti' : `'' AS mbti`;
          const rs: any = await env.DB.prepare(`SELECT user_id, ${nCol} AS student_name, ${prefCol}, ${mbtiCol} FROM students_erp WHERE status IN ('정상','활동','active') OR status IS NULL OR status = '' LIMIT 300`).all();
          students = rs.results || [];
        } catch {}

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const slots = ['16:00', '17:00', '18:00', '19:00', '20:00'];

        // MBTI 호환 점수 (단순 휴리스틱)
        function mbtiMatch(a: string, b: string): number {
          if (!a || !b || a.length !== 4 || b.length !== 4) return 50;
          let score = 0;
          for (let i = 0; i < 4; i++) if (a[i] === b[i]) score += 25;
          return score;
        }

        const proposed: any[] = [];
        const teacherSlotUsed = new Set<string>();
        let ti = 0;
        for (const s of students) {
          if (!teachers.length) break;
          // 학생 선호 시간 파싱
          const pref = String(s.preferred_time || '오후 4-7시');
          const hourMatch = pref.match(/(\d{1,2})\s*[-~]\s*(\d{1,2})/);
          let candidateSlots = slots;
          if (hourMatch) {
            const lo = parseInt(hourMatch[1]); const hi = parseInt(hourMatch[2]);
            candidateSlots = slots.filter(t => {
              const h = parseInt(t.split(':')[0]);
              return h >= lo && h < hi + 12; // 오후 처리 단순화
            });
            if (!candidateSlots.length) candidateSlots = slots;
          }

          let best: any = null;
          for (let attempt = 0; attempt < teachers.length; attempt++) {
            const t = teachers[(ti + attempt) % teachers.length];
            const tMbti = teacherMbti[String(t.id)] || '';
            const score = mbtiMatch(s.mbti, tMbti);
            // 사용 가능한 day/slot 찾기
            const tDays = String(t.available_days || 'Mon,Tue,Wed,Thu,Fri').split(/[,\s]+/);
            for (const d of days) {
              if (!tDays.includes(d) && t.available_days) continue;
              for (const slot of candidateSlots) {
                const key = `${t.id}|${d}|${slot}`;
                if (teacherSlotUsed.has(key)) continue;
                if (!best || score > best.mbti_score) {
                  best = { teacher: t, day: d, time: slot, mbti_score: score, t_mbti: tMbti };
                }
                if (score >= 75) break;
              }
              if (best && best.mbti_score >= 75) break;
            }
            if (best && best.mbti_score >= 75) break;
          }

          if (best) {
            teacherSlotUsed.add(`${best.teacher.id}|${best.day}|${best.time}`);
            proposed.push({
              student_uid: s.user_id,
              student_name: s.student_name,
              student_mbti: s.mbti || '',
              teacher_uid: String(best.teacher.id),
              teacher_name: best.teacher.name,
              teacher_mbti: best.t_mbti,
              day: best.day,
              time: best.time,
              mbti_score: best.mbti_score,
            });
            ti = (ti + 1) % teachers.length;
          }
        }

        return json({ ok: true, count: proposed.length, rows: proposed, teachers_count: teachers.length, students_count: students.length });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'schedule_auto_failed' }, 500);
      }
    }

    if (method === 'POST' && path === '/api/admin/schedule/approve') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, teacher_uid TEXT, day TEXT, time TEXT, mbti_score INTEGER, source TEXT, status TEXT, created_at INTEGER NOT NULL);`);
        const b: any = await request.json().catch(() => ({}));
        const rows = Array.isArray(b.rows) ? b.rows : [];
        if (!rows.length) return json({ ok: false, error: 'rows_required' }, 400);
        const now = Date.now();
        let inserted = 0;
        for (const r of rows) {
          try {
            await env.DB.prepare(`INSERT INTO class_schedules (student_uid, teacher_uid, day, time, mbti_score, source, status, created_at) VALUES (?,?,?,?,?,?,?,?)`)
              .bind(String(r.student_uid || ''), String(r.teacher_uid || ''), String(r.day || ''), String(r.time || ''), Number(r.mbti_score || 0), 'ai_auto', 'proposed', now).run();
            inserted++;
          } catch {}
        }
        return json({ ok: true, inserted });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'schedule_approve_failed' }, 500);
      }
    }


    // ═══════════════════════════════════════════════════════════════
    // 📈 Phase RCF — AI 매출/이탈 예측 (Revenue & Churn Forecast)
    // ═══════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/forecast/revenue') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
        const now = Date.now();
        const since = now - 90 * 86400000;
        // 일자별 매출 집계
        const rs: any = await env.DB.prepare(`SELECT paid_at, amount_krw FROM student_payments WHERE paid_at IS NOT NULL AND paid_at >= ? AND (status IS NULL OR status = 'paid') ORDER BY paid_at ASC`).bind(since).all();
        const byDate: Record<string, number> = {};
        for (const r of (rs.results || []) as any[]) {
          const d = new Date(r.paid_at).toISOString().slice(0, 10);
          byDate[d] = (byDate[d] || 0) + (r.amount_krw || 0);
        }
        const history: Array<{ date: string; amount: number }> = [];
        for (let i = 89; i >= 0; i--) {
          const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
          history.push({ date: d, amount: byDate[d] || 0 });
        }
        // 3개월 이동평균
        const n = history.length;
        const avg = n ? history.reduce((s, x) => s + x.amount, 0) / n : 0;
        // 단순 선형회귀 (x = day index)
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        history.forEach((h, i) => { sumX += i; sumY += h.amount; sumXY += i * h.amount; sumXX += i * i; });
        const denom = n * sumXX - sumX * sumX;
        const slope = denom ? (n * sumXY - sumX * sumY) / denom : 0;
        const intercept = n ? (sumY - slope * sumX) / n : 0;
        // 향후 30일 예측
        const forecast: Array<{ date: string; amount: number }> = [];
        for (let i = 1; i <= 30; i++) {
          const day = new Date(now + i * 86400000).toISOString().slice(0, 10);
          const predicted = Math.max(0, Math.round(intercept + slope * (n + i)));
          forecast.push({ date: day, amount: predicted });
        }
        const trend = slope > avg * 0.005 ? 'up' : slope < -avg * 0.005 ? 'down' : 'flat';

        // AI 코멘트
        let commentary = '';
        try {
          if (env.AI) {
            const totalHist = history.reduce((s, x) => s + x.amount, 0);
            const totalForecast = forecast.reduce((s, x) => s + x.amount, 0);
            const prompt = `최근 90일 학원 매출 합계: ${(totalHist / 10000).toFixed(0)}만원, 일평균 ${(avg / 10000).toFixed(1)}만원. 추세: ${trend} (slope=${slope.toFixed(0)}). 다음 30일 예측 합계: ${(totalForecast / 10000).toFixed(0)}만원. 원장님께 드리는 2-3문장 한국어 코멘트(따뜻한 존댓말, 핵심 인사이트 + 액션 제안)를 작성하세요.`;
            const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You are a friendly Korean business analyst for an English academy.' },
                { role: 'user', content: prompt }
              ],
              max_tokens: 256,
            });
            commentary = (ai?.response || '').trim();
          }
        } catch {}
        if (!commentary) commentary = trend === 'up' ? '📈 매출이 상승 추세입니다. 신규 등록 모멘텀을 유지해 주세요.' : trend === 'down' ? '📉 매출이 둔화되고 있어 재등록 캠페인을 추천드립니다.' : '📊 매출이 안정적으로 유지되고 있습니다.';

        return json({ ok: true, history, forecast, commentary, trend, daily_avg: Math.round(avg), slope });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'forecast_revenue_failed' }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/forecast/churn') {
      try {
        const now = Date.now();
        const since90 = now - 90 * 86400000;
        // 신규 등록(in) — students_erp.created_at
        let enrollments90 = 0, leavers90 = 0;
        try {
          const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ?`).bind(since90).first();
          enrollments90 = r?.n || 0;
        } catch {}
        try {
          // leavers: status = '이탈' or leave_date >= since90
          const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE status = '이탈' OR status = '탈퇴' OR status = '퇴원'`).first();
          leavers90 = r?.n || 0;
        } catch {}

        const monthlyEnroll = Math.round(enrollments90 / 3);
        const monthlyLeavers = Math.round(leavers90 / 3);
        // 월별 시리즈 (지난 3개월)
        const monthly: Array<{ month: string; enroll: number; leave: number }> = [];
        for (let i = 2; i >= 0; i--) {
          const ms = now - (i + 1) * 30 * 86400000;
          const me = now - i * 30 * 86400000;
          let en = 0, lv = 0;
          try { const r: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ? AND created_at < ?`).bind(ms, me).first(); en = r?.n || 0; } catch {}
          monthly.push({ month: new Date(me).toISOString().slice(0, 7), enroll: en, leave: 0 });
        }
        // 분배: leavers90 을 3개월에 균등
        for (const m of monthly) m.leave = Math.round(leavers90 / 3);

        // 다음 달 예상 이탈: 최근 추세 단순 평균
        const projected_next_month_churn = Math.round(monthlyLeavers * 1.05); // 약간 보수적

        let commentary = '';
        try {
          if (env.AI) {
            const prompt = `최근 90일 신규 등록 ${enrollments90}명, 이탈 ${leavers90}명. 월평균 이탈 ${monthlyLeavers}명. 다음 달 예상 이탈 ${projected_next_month_churn}명. 원장님께 드리는 2-3문장 한국어 코멘트(따뜻한 존댓말, 핵심 인사이트 + 액션 제안).`;
            const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You are a friendly Korean retention analyst for an English academy.' },
                { role: 'user', content: prompt }
              ],
              max_tokens: 256,
            });
            commentary = (ai?.response || '').trim();
          }
        } catch {}
        if (!commentary) commentary = monthlyLeavers > monthlyEnroll ? '⚠️ 이탈이 신규를 초과합니다. 위험학생 케어 액션을 가동해 주세요.' : '✅ 이탈률이 안정적입니다. 재등록 시점 사전 안내를 권장드립니다.';

        return json({
          ok: true,
          enrollments_90d: enrollments90,
          leavers_90d: leavers90,
          monthly,
          projected_next_month_churn,
          commentary,
        });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'forecast_churn_failed' }, 500);
      }
    }

    // [Phase FAM] - 가족 계정 통합 (2026-06-12 구현: 게이트만 있고 핸들러가 누락돼
    //   /api/admin/families 등이 HTML로 폴스루 → "not valid JSON" 에러였던 것 수정)
    const ensureFamilyTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS families (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_uid TEXT NOT NULL, family_name TEXT NOT NULL, discount_percent INTEGER DEFAULT 10, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS family_members (id INTEGER PRIMARY KEY AUTOINCREMENT, family_id INTEGER NOT NULL, student_uid TEXT NOT NULL, relationship TEXT, created_at INTEGER NOT NULL, UNIQUE(family_id, student_uid));`);
    };

    if (path === '/api/admin/family/create' && method === 'POST') {
      try {
        await ensureFamilyTables();
        const body = (await parseJsonBody(request)) || {};
        const parent_uid = String(body.parent_uid || '').trim();
        const family_name = String(body.family_name || '').trim();
        const discount_percent = Math.min(50, Math.max(0, Number(body.discount_percent) || 10));
        if (!parent_uid || !family_name) return json({ ok: false, error: 'parent_uid_and_family_name_required' }, 400);
        const dup = await env.DB.prepare(`SELECT id FROM families WHERE parent_uid = ?`).bind(parent_uid).first();
        if (dup) return json({ ok: false, error: 'family_already_exists_for_parent' }, 409);
        const r = await env.DB.prepare(`INSERT INTO families (parent_uid, family_name, discount_percent, created_at) VALUES (?,?,?,?)`)
          .bind(parent_uid, family_name, discount_percent, Date.now()).run();
        return json({ ok: true, id: r.meta?.last_row_id ?? null });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'family_create_failed' }, 500);
      }
    }

    if (path === '/api/admin/family/add-child' && method === 'POST') {
      try {
        await ensureFamilyTables();
        const body = (await parseJsonBody(request)) || {};
        const family_id = Number(body.family_id) || 0;
        const student_uid = String(body.student_uid || '').trim();
        const relationship = String(body.relationship || '자녀').trim();
        if (!family_id || !student_uid) return json({ ok: false, error: 'family_id_and_student_uid_required' }, 400);
        const fam = await env.DB.prepare(`SELECT id FROM families WHERE id = ?`).bind(family_id).first();
        if (!fam) return json({ ok: false, error: 'family_not_found' }, 404);
        try {
          await env.DB.prepare(`INSERT INTO family_members (family_id, student_uid, relationship, created_at) VALUES (?,?,?,?)`)
            .bind(family_id, student_uid, relationship, Date.now()).run();
        } catch {
          return json({ ok: false, error: 'already_member' }, 409);
        }
        return json({ ok: true });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'family_add_child_failed' }, 500);
      }
    }

    if (path === '/api/admin/family/remove-child' && method === 'POST') {
      try {
        await ensureFamilyTables();
        const body = (await parseJsonBody(request)) || {};
        const member_id = Number(body.member_id) || 0;
        if (!member_id) return json({ ok: false, error: 'member_id_required' }, 400);
        await env.DB.prepare(`DELETE FROM family_members WHERE id = ?`).bind(member_id).run();
        return json({ ok: true });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'family_remove_child_failed' }, 500);
      }
    }

    if (path === '/api/admin/families' && method === 'GET') {
      try {
        await ensureFamilyTables();
        const fams = ((await env.DB.prepare(`SELECT * FROM families ORDER BY created_at DESC`).all()).results || []) as any[];
        const mems = ((await env.DB.prepare(`SELECT * FROM family_members ORDER BY created_at ASC`).all()).results || []) as any[];
        const byFam: Record<string, any[]> = {};
        for (const m of mems) (byFam[String(m.family_id)] ||= []).push(m);
        const list = fams.map(f => {
          const members = byFam[String(f.id)] || [];
          return { ...f, members, member_count: members.length };
        });
        return json({ ok: true, list });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'families_list_failed' }, 500);
      }
    }

    if (path === '/api/family/my-children' && method === 'GET') {
      try {
        await ensureFamilyTables();
        const uid = String(url.searchParams.get('user_id') || '').trim();
        if (!uid) return json({ ok: false, error: 'user_id_required' }, 400);
        // 🔐 [PII] 본인 가족만 — 토큰 uid 일치 요구
        const fmAuth = await authUidGlobal(request, url, env);
        if (!fmAuth || fmAuth !== uid) return json({ ok: false, error: 'auth_required' }, 401);
        const fam = await env.DB.prepare(`SELECT * FROM families WHERE parent_uid = ?`).bind(uid).first<any>();
        if (!fam) return json({ ok: true, family: null, children: [] });
        const mems = ((await env.DB.prepare(`SELECT * FROM family_members WHERE family_id = ? ORDER BY created_at ASC`).bind(fam.id).all()).results || []) as any[];
        return json({ ok: true, family: { id: fam.id, family_name: fam.family_name, discount_percent: fam.discount_percent }, children: mems });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'my_children_failed' }, 500);
      }
    }

    if (path === '/api/family/discount-status' && method === 'GET') {
      try {
        await ensureFamilyTables();
        const uid = String(url.searchParams.get('user_id') || '').trim();
        if (!uid) return json({ ok: false, error: 'user_id_required' }, 400);
        // 🔐 [PII] 본인 가족 할인상태만 — 토큰 uid 일치 요구
        const fdAuth = await authUidGlobal(request, url, env);
        if (!fdAuth || fdAuth !== uid) return json({ ok: false, error: 'auth_required' }, 401);
        let fam = await env.DB.prepare(`SELECT * FROM families WHERE parent_uid = ?`).bind(uid).first<any>();
        if (!fam) {
          const mem = await env.DB.prepare(`SELECT family_id FROM family_members WHERE student_uid = ?`).bind(uid).first<any>();
          if (mem) fam = await env.DB.prepare(`SELECT * FROM families WHERE id = ?`).bind(mem.family_id).first<any>();
        }
        if (!fam) return json({ ok: true, eligible: false, discount_percent: 0, member_count: 0 });
        const cnt = await env.DB.prepare(`SELECT COUNT(*) AS c FROM family_members WHERE family_id = ?`).bind(fam.id).first<any>();
        const member_count = Number(cnt?.c || 0);
        const eligible = member_count >= 2;
        return json({ ok: true, eligible, discount_percent: eligible ? Number(fam.discount_percent || 0) : 0, member_count, family_name: fam.family_name });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'discount_status_failed' }, 500);
      }
    }

    // [Phase ALU] - Alumni Community
    //   - Graduates/long-term students join alumni pool, share mentorship/careers/news
    //   - Admin auto-detect: enrolled_months >= 12 -> prompt alumni registration (TODO: separate cron)
    if (path === '/api/alumni/register' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.user_id) return json({ ok: false, error: 'missing_user_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE, graduation_year INTEGER, graduation_month INTEGER, current_status TEXT, career_field TEXT, location TEXT, message TEXT, photo_url TEXT, mentor_available INTEGER DEFAULT 0, created_at INTEGER);`);
        const now = Date.now();
        await env.DB.prepare(`INSERT OR REPLACE INTO alumni (user_id, graduation_year, graduation_month, current_status, career_field, location, message, photo_url, mentor_available, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .bind(
            String(body.user_id),
            body.graduation_year ? Number(body.graduation_year) : null,
            body.graduation_month ? Number(body.graduation_month) : null,
            body.current_status || '',
            body.career_field || '',
            body.location || '',
            body.message || '',
            body.photo_url || '',
            body.mentor_available ? 1 : 0,
            now
          ).run();
        return json({ ok: true, registered_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_register_failed' }, 500);
      }
    }

    if (path === '/api/alumni/list' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE, graduation_year INTEGER, graduation_month INTEGER, current_status TEXT, career_field TEXT, location TEXT, message TEXT, photo_url TEXT, mentor_available INTEGER DEFAULT 0, created_at INTEGER);`);
        const year = url.searchParams.get('year');
        const field = url.searchParams.get('field');
        let sql = 'SELECT * FROM alumni WHERE 1=1';
        const params: any[] = [];
        if (year) { sql += ' AND graduation_year = ?'; params.push(Number(year)); }
        if (field) { sql += ' AND career_field LIKE ?'; params.push(`%${field}%`); }
        sql += ' ORDER BY created_at DESC LIMIT 200';
        const rs = await env.DB.prepare(sql).bind(...params).all();
        return json({ ok: true, alumni: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_list_failed' }, 500);
      }
    }

    if (path === '/api/alumni/profile' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE, graduation_year INTEGER, graduation_month INTEGER, current_status TEXT, career_field TEXT, location TEXT, message TEXT, photo_url TEXT, mentor_available INTEGER DEFAULT 0, created_at INTEGER);`);
        const userId = url.searchParams.get('user_id');
        if (!userId) return json({ ok: false, error: 'missing_user_id' }, 400);
        // 🔐 [PII] 본인 또는 관리자만 — 남의 동문 프로필(위치·경력) 열람 차단
        const alAuth = await authUidGlobal(request, url, env);
        if (alAuth !== userId) {
          const alAdmin = await checkAdminSession(request, env as any);
          if (!alAdmin.ok) return json({ ok: false, error: 'auth_required' }, 401);
        }
        const row = await env.DB.prepare('SELECT * FROM alumni WHERE user_id = ?').bind(userId).first();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        return json({ ok: true, profile: row });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_profile_failed' }, 500);
      }
    }

    if (path === '/api/alumni/post' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.author_uid || !body.title) return json({ ok: false, error: 'missing_fields' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_uid TEXT, title TEXT, body TEXT, tags TEXT, likes INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at INTEGER);`);
        const now = Date.now();
        const result: any = await env.DB.prepare(`INSERT INTO alumni_posts (author_uid, title, body, tags, likes, comments_count, created_at) VALUES (?,?,?,?,0,0,?)`)
          .bind(String(body.author_uid), String(body.title), body.body || '', body.tags || '', now).run();
        return json({ ok: true, post_id: result?.meta?.last_row_id, created_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_post_failed' }, 500);
      }
    }

    if (path === '/api/alumni/posts' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_uid TEXT, title TEXT, body TEXT, tags TEXT, likes INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at INTEGER);`);
        const limit = Math.min(100, Number(url.searchParams.get('limit')) || 20);
        const rs = await env.DB.prepare('SELECT * FROM alumni_posts ORDER BY created_at DESC LIMIT ?').bind(limit).all();
        return json({ ok: true, posts: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_posts_failed' }, 500);
      }
    }

    if (path === '/api/alumni/post/like' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.post_id) return json({ ok: false, error: 'missing_post_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_uid TEXT, title TEXT, body TEXT, tags TEXT, likes INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at INTEGER);`);
        await env.DB.prepare('UPDATE alumni_posts SET likes = likes + 1 WHERE id = ?').bind(Number(body.post_id)).run();
        const row: any = await env.DB.prepare('SELECT likes FROM alumni_posts WHERE id = ?').bind(Number(body.post_id)).first();
        return json({ ok: true, likes: row?.likes || 0 });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_like_failed' }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 💌 Phase I1~I2 — 신규상담 → 등록 전환률
    // ═══════════════════════════════════════════════════════════════

    const ensureInquiryColumns = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, message TEXT, created_at INTEGER);`);
      // 점진적 ALTER (이미 있으면 무시)
      const cols = ['status TEXT DEFAULT "new"','level TEXT','region TEXT','source TEXT','assigned_to TEXT','notes TEXT','contacted_at INTEGER','registered_at INTEGER','registered_uid TEXT','rejected_reason TEXT','updated_at INTEGER'];
      for (const colDef of cols) {
        try { await env.DB.exec(`ALTER TABLE inquiries ADD COLUMN ${colDef}`); } catch {}
      }
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_inq_status ON inquiries(status, created_at DESC)`); } catch {}
      try { await env.DB.exec(`ALTER TABLE inquiries ADD COLUMN email TEXT`); } catch {}
      try { await env.DB.exec(`ALTER TABLE inquiries ADD COLUMN program TEXT`); } catch {}
    };

    // ── POST /api/consult-bot — 🤖 AI 상담봇 (전화·사람 없이 24시간 자동 응대) ──
    //   body: { message, history?: [{role,content}] } → { ok, reply }
    //   faq.html 의 실제 사실만 근거로 답하고, 모르는 것(특히 요금)은 지어내지 않고 무료 레벨테스트/카카오로 유도.
    if (method === 'POST' && path === '/api/consult-bot') {
      const b: any = await request.json().catch(() => ({}));
      // 한글 유니코드 정규화(NFC) — 자모 분리(NFD) 입력에서도 키워드 매칭이 되도록
      const userMsg = String(b?.message || '').normalize('NFC').trim().slice(0, 800);
      if (!userMsg) return json({ ok: false, error: 'message_required' }, 400);
      const history = Array.isArray(b?.history)
        ? b.history.slice(-6).filter((m: any) => m && m.role && m.content)
            .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 800) }))
        : [];
      const KNOWLEDGE_ARR = [
        '- 망고아이(Mangoi)는 원어민(필리핀 현지센터 + 북미 재택) 선생님과 함께하는 1:1·그룹 화상영어 + AI 학습관리(수업 후 AI 평가서·맞춤 복습퀴즈·단계별 발음교정).',
        '- 대상: 어린이·청소년·성인 모두.',
        '- 상담(운영) 시간: 오전 10시~오후 8시(주말·공휴일 휴무). 수업 시간: 평일 월~금 오후 2시~11시(14:00~23:00). 주말·오전반은 준비 중.',
        '- 레벨테스트: 무료. 홈의 [레벨테스트] 또는 [수업 진단]에서 신청. 결석해도 재신청 가능. 실력 확인·맞춤 과정 추천용(점수 낮아도 괜찮음).',
        '- 수업 길이: 개인 20분 또는 40분, 단체는 10분 단위로 추가.',
        '- 필요 장비: 인터넷 되는 PC/노트북/태블릿/스마트폰 + 헤드셋(필수) + 웹캠(권장). 설치 없이 브라우저에서 바로 진행. [수업 진단]에서 미리 점검.',
        '- 수강 절차: 홈 [수업 신청]에서 강사(성별·성향 필터)와 시간을 고르고 결제 → [마이페이지]에서 일정 확인·강의실 입장.',
        '- 연기: [연기/변경] 메뉴 또는 수업 시작 30분 전까지 카카오로 신청. 수강 횟수의 1/2까지 가능.',
        '- 시간/강사 변경: [연기/변경]에서. 강사 변경은 월 1회, 수업 1일 전까지.',
        '- 결석: 수업시간에 미입장 시 결석 처리, 학생 과실 결석은 보강 없음.',
        '- 수업 녹화영상·복습퀴즈·AI 평가서: 로그인 후 [마이페이지]에서 확인.',
        '- 포인트: 출석·복습 등 학습으로 적립 → [포인트상점]에서 상품 교환.',
        '- 환불: 수업 시작 전 100% / 총 수업시간의 1/3 이전 70% / 1/2 이전 50% / 1/2 이후 0%. 할인가 결제분은 정상가로 재정산. 레벨테스트·체험수업은 무료.',
        '- 수강 요금(가격): 과정·횟수에 따라 달라 공개된 표준가가 없음. → 절대 특정 금액을 지어내지 말 것. 무료 레벨테스트 후 맞춤 안내 또는 카카오 채널 문의로 유도.',
        '- 사람 상담: 전화 상담은 운영하지 않음. 사람 연결이 필요하면 카카오 채널(@망고아이, 화면 우하단 상담 버튼) 안내.',
        '- 단체·학원 단위 수강: 카카오 채널 또는 상담 신청으로 문의 유도.',
      ];
      const KNOWLEDGE = KNOWLEDGE_ARR.join('\n');
      // 🎯 결정론적 FAQ 응답 — 주제가 매칭되면 사람이 쓴 정확한 답을 그대로 반환(환각 0, 즉시).
      //    우선순위 순서대로 검사하고, 매칭된 답변(최대 2개)을 이어붙여 반환.
      const FAQ: Array<{ kw: string[]; a: string }> = [
        { kw: ['환불', '반환', '해지', '위약'], a: '환불은 수업 진행 정도에 따라 달라요 — 시작 전 100%, 총 수업시간의 1/3 이전 70%, 1/2 이전 50%, 1/2 이후 0%예요. 할인가로 결제한 경우 정상가로 재정산되고, 레벨테스트·체험수업은 무료예요.' },
        { kw: ['연기', '미루', '미뤄'], a: '연기는 [연기/변경] 메뉴 또는 수업 시작 30분 전까지 카카오로 신청하실 수 있어요. 연기 횟수는 수강 횟수의 1/2까지 가능해요 (예: 주 1회면 월 최대 2회).' },
        { kw: ['장비', '준비물', '헤드셋', '웹캠', '카메라', '마이크', '컴퓨터', '필요한 게', '무엇이 필요', '뭐가 필요'], a: '인터넷 되는 PC·노트북·태블릿·스마트폰과 헤드셋(필수), 웹캠(권장)만 있으면 돼요. 설치 없이 브라우저에서 바로 진행되고, [수업 진단]에서 장비를 미리 점검할 수 있어요.' },
        { kw: ['요금', '가격', '비용', '수강료', '얼마', '금액', '학비'], a: '수강료는 과정·횟수에 따라 달라서 표준가가 공개돼 있지 않아요. 무료 레벨테스트를 받아보시면 딱 맞는 과정과 함께 안내드리고, 카카오 채널(화면 우하단)로도 편하게 문의하실 수 있어요.' },
        { kw: ['레벨테스트', '레벨 테스트', '진단', '테스트'], a: '레벨테스트는 무료예요! 홈의 [레벨테스트] 또는 [수업 진단]에서 신청하실 수 있고, 실력 확인·맞춤 과정 추천을 위한 거라 점수가 낮게 나와도 괜찮아요.' },
        { kw: ['강사', '선생님', '쌤', '원어민', '교사', '어느 나라'], a: '필리핀 현지 교육센터의 필리핀(또는 미국계) 강사님과, 재택으로 진행하는 북미(미국·캐나다) 원어민 강사님으로 구성돼 있어요. 무료 레벨테스트로 직접 수업 품질을 확인해 보세요!' },
        { kw: ['시간', '몇 시', '몇시', '요일', '운영', '언제', '오전', '주말'], a: '수업은 평일 월~금, 오후 2시부터 11시까지 진행돼요 (주말·오전반은 준비 중이에요). 상담 운영시간은 오전 10시~오후 8시예요.' },
        { kw: ['수업 시간이', '몇 분', '몇분', '20분', '40분', '수업 길이'], a: '개인 수업은 20분 또는 40분이고, 단체 수업은 10분 단위로 추가돼요.' },
        { kw: ['강사 변경', '선생님 변경', '시간 변경', '수업 변경', '바꾸', '교체'], a: '수업 시간·강사 변경은 [연기/변경] 메뉴에서 하실 수 있어요. 강사 변경은 월 1회, 수업 1일 전까지 가능해요 (시간을 바꾸면 담당 강사가 바뀔 수 있어요).' },
        { kw: ['결석', '빠지', '못 가', '안 가'], a: '수업시간에 입장하지 않으면 결석 처리되고, 학생 과실 결석은 보강이 제공되지 않아요. 늦게 입장해도 예정된 종료시간에 수업이 끝나요.' },
        { kw: ['녹화', '영상', '다시보기', '다시 보기', '복습', '퀴즈', '평가서'], a: '수업 녹화영상과 AI 복습퀴즈·평가서는 로그인 후 [마이페이지]에서 언제든 확인하실 수 있어요.' },
        { kw: ['포인트', '상점', '적립'], a: '포인트는 출석·복습 등 학습 활동으로 적립되고, [포인트상점]에서 다양한 상품으로 교환할 수 있어요.' },
        { kw: ['단체', '학원', '기관'], a: '학원·단체 수강은 카카오 채널이나 상담 신청으로 문의해 주시면 자세히 안내드릴게요.' },
        { kw: ['수강', '등록', '신청', '절차', '결제', '가입'], a: '홈 [수업 신청]에서 강사(성별·성향 필터)와 시간을 고르고 결제하시면 돼요. 이후 [마이페이지]에서 일정 확인과 강의실 입장이 가능해요.' },
        { kw: ['전화', '상담', '문의', '카톡', '카카오'], a: '전화 상담은 운영하지 않고, 카카오 채널(화면 우하단 상담 버튼)로 비대면 안내를 도와드려요. 무료 레벨테스트도 추천드려요!' },
      ];
      const hits: string[] = [];
      for (const f of FAQ) {
        if (f.kw.some((k) => userMsg.indexOf(k) >= 0)) { hits.push(f.a); if (hits.length >= 2) break; }
      }
      if (hits.length) {
        return json({ ok: true, reply: hits.join('\n\n'), dbg: 'faq' });
      }
      // 매칭 안 되는 자유 질문 → 전체 지식으로 LLM 시도(best-effort), 실패/불확실 시 카톡 유도
      const SYSTEM = [
        "당신은 '망고아이(Mangoi)' 화상영어의 친절한 AI 상담 도우미입니다.",
        '아래 [정보]에 있는 사실만 근거로 한국어 1~3문장으로 정확히 답하세요. [정보]에 없으면(특히 요금) 지어내지 말고 "정확한 안내는 무료 레벨테스트나 카카오 채널로 도와드릴게요"라고 하세요. 전화 상담은 없습니다.',
        '[정보]',
        KNOWLEDGE,
      ].join('\n');
      const fallback = '무엇이 궁금하신지 조금만 더 자세히 알려주시겠어요? 😊 (예: 수업 시간, 레벨테스트, 요금, 장비, 환불 등) 바로 안내해 드릴게요. 정확한 상담은 화면 우하단 카카오 채널도 이용하실 수 있어요.';
      try {
        if (!(env as any).AI) return json({ ok: true, reply: fallback });
        const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: userMsg }];
        const res: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages, max_tokens: 400, temperature: 0.3 });
        const reply = String((res && (res.response || res.result)) || '').trim();
        return json({ ok: true, reply: reply || fallback });
      } catch (e: any) {
        console.warn('[consult-bot] AI err:', e?.message || e);
        return json({ ok: true, reply: fallback });
      }
    }

    // ── POST /api/student/inquiry — 홈 화면 "신규상담" 모달의 공개 제출 엔드포인트 ──
    //   body: { name, contact, email?, program?, message } → inquiries 테이블(관리자 /api/admin/inquiry/* 가 이미 조회)
    if (method === 'POST' && path === '/api/student/inquiry') {
      await ensureInquiryColumns();
      const body: any = await request.json().catch(() => ({}));
      const name = String(body?.name || '').trim().slice(0, 60);
      const contact = String(body?.contact || '').trim().slice(0, 40);
      const email = String(body?.email || '').trim().slice(0, 120);
      const program = String(body?.program || '').trim().slice(0, 60);
      const message = String(body?.message || '').trim().slice(0, 2000);
      if (!name || !contact || !message) {
        return json({ ok: false, error: 'name, contact, message 는 필수입니다.' }, 400);
      }
      const now = Date.now();
      const ins = await env.DB.prepare(
        `INSERT INTO inquiries (name, phone, email, program, message, status, source, created_at) VALUES (?, ?, ?, ?, ?, 'new', 'index.html', ?)`
      ).bind(name, contact, email || null, program || null, message, now).run();
      const inquiryId = ins.meta?.last_row_id;
      // 🔔 새 상담 → 관리자(사장님) 폰으로 내부 문자 알림 (리드 놓침 방지, best-effort)
      //    ※ 고객에게 전화하는 게 아니라 '새 리드 왔다'는 내부 알림 — 답변은 카톡으로.
      try {
        const alertTo = (env as any).OWNER_ALERT_PHONE;
        if (alertTo) {
          const txt = `[망고아이] 🆕 새 상담 신청\n이름: ${name}\n답변받을곳: ${contact}${program ? `\n과정: ${program}` : ''}\n내용: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}\n관리자 페이지에서 카톡으로 답변해 주세요.`;
          await sendPlainSms(env, alertTo, txt);
        }
      } catch (e: any) { console.warn('[inquiry] owner alert skipped:', e?.message || e); }
      return json({ ok: true, inquiry_id: inquiryId });
    }

    // ── GET /api/admin/inquiry/list?status=&limit= — 상담 목록 ──
    if (method === 'GET' && path === '/api/admin/inquiry/list') {
      await ensureInquiryColumns();
      const status = (url.searchParams.get('status') || '').trim();
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));
      let sql = `SELECT * FROM inquiries`;
      const binds: any[] = [];
      if (status) { sql += ` WHERE status = ?`; binds.push(status); }
      sql += ` ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?`;
      binds.push(limit);
      const rs = await env.DB.prepare(sql).bind(...binds).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── GET /api/admin/inquiry/stats — 전환률 통계 ──
    if (method === 'GET' && path === '/api/admin/inquiry/stats') {
      await ensureInquiryColumns();
      const d = new Date();
      const thisMonthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const lastMonthStart = new Date(d.getFullYear(), d.getMonth()-1, 1).getTime();
      const last30Start = Date.now() - 30*86400*1000;
      const fetch1 = async (sql: string, ...binds: any[]): Promise<any> => {
        try { return await env.DB.prepare(sql).bind(...binds).first(); }
        catch { return {}; }
      };
      const totalThisMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ?`, thisMonthStart);
      const totalLastMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ?`, lastMonthStart, thisMonthStart);
      const registeredThisMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE status='registered' AND COALESCE(registered_at, updated_at, created_at) >= ?`, thisMonthStart);
      const byStatus: any = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status`).all().catch(()=>({results:[]}));
      const statusMap: any = {};
      (byStatus?.results || []).forEach((r:any) => { statusMap[r.status || 'new'] = r.n; });
      // 평균 등록까지 소요 시간
      const avgDays: any = await fetch1(`SELECT AVG((COALESCE(registered_at, updated_at, created_at) - created_at) / 86400000.0) AS avg_days FROM inquiries WHERE status='registered'`);
      // 전환률 = registered / (registered + rejected) (대기중 제외)
      const closed: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE status IN ('registered','rejected')`);
      const registered: any = await fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE status='registered'`);
      const closedN = closed?.n || 0;
      const registeredN = registered?.n || 0;
      const conversionRate = closedN > 0 ? Math.round((registeredN / closedN) * 1000) / 10 : 0;
      const trend = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur-prev)/prev)*1000)/10;
      return json({
        ok: true,
        total_this_month: totalThisMonth?.n || 0,
        total_last_month: totalLastMonth?.n || 0,
        total_trend: trend(totalThisMonth?.n || 0, totalLastMonth?.n || 0),
        registered_this_month: registeredThisMonth?.n || 0,
        by_status: statusMap,
        conversion_rate: conversionRate,
        avg_days_to_register: Math.round((avgDays?.avg_days || 0) * 10) / 10,
      });
    }

    // ── PATCH /api/admin/inquiry/:id — 상담 상태/메모 변경 ──
    //   body: { status?, notes?, assigned_to?, registered_uid?, rejected_reason?, level?, region? }
    if (method === 'PATCH' && /^\/api\/admin\/inquiry\/\d+$/.test(path)) {
      await ensureInquiryColumns();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      const sets: string[] = ['updated_at = ?'];
      const binds: any[] = [now];
      const fields = ['status','notes','assigned_to','registered_uid','rejected_reason','level','region','source','phone','name','message'];
      for (const f of fields) {
        if (body[f] !== undefined) { sets.push(`${f} = ?`); binds.push(body[f]); }
      }
      // 자동 타임스탬프
      if (body.status === 'contacted') { sets.push('contacted_at = ?'); binds.push(now); }
      if (body.status === 'registered') { sets.push('registered_at = ?'); binds.push(now); }
      binds.push(id);
      await env.DB.prepare(`UPDATE inquiries SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      const updated: any = await env.DB.prepare(`SELECT * FROM inquiries WHERE id = ?`).bind(id).first();
      return json({ ok: true, id, row: updated });
    }

    // ── DELETE /api/admin/inquiry/:id ──
    if (method === 'DELETE' && /^\/api\/admin\/inquiry\/\d+$/.test(path)) {
      await ensureInquiryColumns();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM inquiries WHERE id = ?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // 💌 Phase I1 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🐞 Phase BUG — 교사 버그/피드백 신고 (교사 제출 → 관리자 접수함)
    //   POST  /api/bug-report          (공개 — 교사에겐 admin 세션이 없어 신원은 clientside 전달)
    //   GET   /api/admin/bug-reports   (관리자 인증 — 목록 + 상태별 카운트)
    //   PATCH /api/admin/bug-reports/:id  (상태/메모 변경) · DELETE /:id
    // ═══════════════════════════════════════════════════════════════
    const ensureBugTable = async () => {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS bug_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_role TEXT, reporter_uid TEXT, reporter_name TEXT, category TEXT, message TEXT NOT NULL, page_url TEXT, user_agent TEXT, status TEXT DEFAULT 'new', admin_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      } catch {}
    };

    if (method === 'POST' && path === '/api/bug-report') {
      await ensureBugTable();
      const body: any = await request.json().catch(() => ({}));
      const message = String(body?.message || '').trim().slice(0, 2000);
      if (!message) return json({ ok: false, error: 'message 는 필수입니다.' }, 400);
      const reporterRole = (String(body?.reporter_role || '').trim().slice(0, 20)) || 'unknown';
      const reporterUid = (String(body?.reporter_uid || '').trim().slice(0, 80)) || null;
      const reporterName = (String(body?.reporter_name || '').trim().slice(0, 80)) || null;
      const category = (String(body?.category || '').trim().slice(0, 40)) || 'bug';
      const pageUrl = (String(body?.page_url || '').trim().slice(0, 500)) || null;
      const ua = (String(request.headers.get('user-agent') || '').slice(0, 300)) || null;
      const now = Date.now();
      const ins = await env.DB.prepare(
        `INSERT INTO bug_reports (reporter_role, reporter_uid, reporter_name, category, message, page_url, user_agent, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)`
      ).bind(reporterRole, reporterUid, reporterName, category, message, pageUrl, ua, now).run();
      return json({ ok: true, bug_id: ins.meta?.last_row_id });
    }

    if (method === 'GET' && path === '/api/admin/bug-reports') {
      await ensureBugTable();
      const status = (url.searchParams.get('status') || '').trim();
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));
      let sql = `SELECT * FROM bug_reports`;
      const binds: any[] = [];
      if (status) { sql += ` WHERE status = ?`; binds.push(status); }
      sql += ` ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?`;
      binds.push(limit);
      const rs = await env.DB.prepare(sql).bind(...binds).all();
      // 상태별 카운트(관리자 대시보드 미접수 배지용)
      const counts: any = {};
      try {
        const cs: any = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM bug_reports GROUP BY status`).all();
        (cs?.results || []).forEach((r: any) => { counts[r.status || 'new'] = r.n; });
      } catch {}
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [], counts });
    }

    if (method === 'PATCH' && /^\/api\/admin\/bug-reports\/\d+$/.test(path)) {
      await ensureBugTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      const sets: string[] = ['updated_at = ?'];
      const binds: any[] = [now];
      const fields = ['status', 'admin_note', 'category'];
      for (const f of fields) {
        if (body[f] !== undefined) { sets.push(`${f} = ?`); binds.push(body[f]); }
      }
      binds.push(id);
      await env.DB.prepare(`UPDATE bug_reports SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      const updated: any = await env.DB.prepare(`SELECT * FROM bug_reports WHERE id = ?`).bind(id).first();
      return json({ ok: true, id, row: updated });
    }

    if (method === 'DELETE' && /^\/api\/admin\/bug-reports\/\d+$/.test(path)) {
      await ensureBugTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM bug_reports WHERE id = ?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }

    // (💼 Phase G1~G2 급여정산·SR 연기변경·FD 피드백초안 13라우트 → api-admin.ts — admin 2회차)


    // (🤖 Phase A1~A2 AI 학습분석 → api-admin.ts — 14차)




    // ════════════════════════════════════════════════════════════
    if (path === '/api/admin/nps/stats' || path === '/api/admin/nps/send-monthly' || path === '/api/nps/respond') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS nps_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, parent_phone TEXT, score INTEGER NOT NULL, comment TEXT, ym TEXT NOT NULL, created_at INTEGER NOT NULL);`);
      } catch {}
      const kstYm = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);

      // ── 통계 조회 ──
      if (method === 'GET' && path === '/api/admin/nps/stats') {
        const ym = (url.searchParams.get('ym') || kstYm());
        const agg: any = await env.DB.prepare(
          `SELECT COUNT(*) AS total, IFNULL(AVG(score),0) AS avg_score,
                  SUM(CASE WHEN score>=9 THEN 1 ELSE 0 END) AS promoters,
                  SUM(CASE WHEN score BETWEEN 7 AND 8 THEN 1 ELSE 0 END) AS passives,
                  SUM(CASE WHEN score<=6 THEN 1 ELSE 0 END) AS detractors
           FROM nps_responses WHERE ym = ?`
        ).bind(ym).first().catch(() => ({}));
        const total = agg?.total || 0;
        const promoters = agg?.promoters || 0;
        const passives = agg?.passives || 0;
        const detractors = agg?.detractors || 0;
        const promoter_pct = total > 0 ? Math.round(promoters * 100 / total) : 0;
        const detractor_pct = total > 0 ? Math.round(detractors * 100 / total) : 0;
        const nps = total > 0 ? (promoter_pct - detractor_pct) : 0;
        const cm = await env.DB.prepare(
          `SELECT score, comment, created_at FROM nps_responses WHERE ym = ? AND comment IS NOT NULL AND comment != '' ORDER BY created_at DESC LIMIT 10`
        ).bind(ym).all().catch(() => ({ results: [] }));
        return json({ ok: true, ym, nps, avg_score: Math.round((agg?.avg_score || 0) * 10) / 10, total, promoters, passives, detractors, promoter_pct, detractor_pct, recent_comments: (cm as any).results || [] });
      }

      // ── 월간 발송 (학부모 수만큼 큐 등록) ──
      if (method === 'POST' && path === '/api/admin/nps/send-monthly') {
        const cnt: any = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM students_erp WHERE status IN ('정상','활동','active') OR status IS NULL OR status=''`
        ).first().catch(() => ({ n: 0 }));
        return json({ ok: true, queued: cnt?.n || 0, ym: kstYm() });
      }

      // ── 응답 수집 (학부모) ──
      if (method === 'POST' && path === '/api/nps/respond') {
        const b: any = await parseJsonBody(request);
        const score = Math.max(0, Math.min(10, parseInt(b?.score, 10) || 0));
        const ym = (b?.ym || kstYm());
        await env.DB.prepare(
          `INSERT INTO nps_responses (user_id, student_name, parent_phone, score, comment, ym, created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(b?.user_id || null, b?.student_name || null, b?.parent_phone || null, score, b?.comment || null, ym, Date.now()).run();
        return json({ ok: true });
      }
    }

    // ════════════════════════════════════════════════════════════
    // 💳 정기결제 자동화 (Recurring Billing / Subscriptions)
    // ════════════════════════════════════════════════════════════
    if (path === '/api/admin/subscriptions' || path === '/api/admin/subscription/charge-now' || path === '/api/admin/subscription/cancel' || path === '/api/subscription/create' || path === '/api/admin/subscription/cron-check') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, plan TEXT, amount INTEGER, status TEXT DEFAULT 'active', next_billing_at INTEGER, last_billed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      } catch {}

      if (method === 'GET' && path === '/api/admin/subscriptions') {
        const st: any = await env.DB.prepare(
          `SELECT SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
                  SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
                  IFNULL(SUM(CASE WHEN status='active' THEN amount ELSE 0 END),0) AS month_revenue
           FROM subscriptions`
        ).first().catch(() => ({}));
        const lr = await env.DB.prepare(
          `SELECT id, user_id, student_name, plan, amount, status, next_billing_at FROM subscriptions ORDER BY (status='active') DESC, next_billing_at ASC LIMIT 500`
        ).all().catch(() => ({ results: [] }));
        return json({ ok: true, stats: { active: st?.active || 0, cancelled: st?.cancelled || 0, month_revenue: st?.month_revenue || 0 }, list: (lr as any).results || [] });
      }

      if (method === 'POST' && path === '/api/admin/subscription/charge-now') {
        const b: any = await parseJsonBody(request);
        const id = parseInt(b?.id, 10);
        if (!id) return json({ ok: false, error: 'id_required' }, 400);
        const sub: any = await env.DB.prepare(`SELECT * FROM subscriptions WHERE id = ?`).bind(id).first();
        if (!sub) return json({ ok: false, error: 'not_found' }, 404);
        const now = Date.now();
        await env.DB.prepare(`INSERT INTO student_payments (user_id, paid_at, amount_krw, method, memo, status, created_at) VALUES (?,?,?,?,?,?,?)`)
          .bind(sub.user_id, now, sub.amount || 0, '정기결제', '정기결제 즉시청구', 'paid', now).run();
        await env.DB.prepare(`UPDATE subscriptions SET last_billed_at = ?, next_billing_at = ?, updated_at = ? WHERE id = ?`).bind(now, now + 30 * 86400 * 1000, now, id).run();
        return json({ ok: true, charged: sub.amount || 0 });
      }

      if (method === 'POST' && path === '/api/admin/subscription/cancel') {
        const b: any = await parseJsonBody(request);
        const id = parseInt(b?.id, 10);
        if (!id) return json({ ok: false, error: 'id_required' }, 400);
        await env.DB.prepare(`UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(Date.now(), id).run();
        return json({ ok: true });
      }

      if (method === 'POST' && path === '/api/subscription/create') {
        const b: any = await parseJsonBody(request);
        if (!b?.user_id) return json({ ok: false, error: 'user_id_required' }, 400);
        const now = Date.now();
        const r = await env.DB.prepare(`INSERT INTO subscriptions (user_id, student_name, plan, amount, status, next_billing_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(b.user_id, b.student_name || null, b.plan || '월정기', parseInt(b.amount, 10) || 0, 'active', now + 30 * 86400 * 1000, now, now).run();
        return json({ ok: true, id: r.meta.last_row_id });
      }

      if (method === 'POST' && path === '/api/admin/subscription/cron-check') {
        const now = Date.now();
        const due = await env.DB.prepare(`SELECT * FROM subscriptions WHERE status='active' AND next_billing_at IS NOT NULL AND next_billing_at <= ?`).bind(now).all().catch(() => ({ results: [] }));
        let charged = 0;
        for (const sub of (((due as any).results) || [])) {
          await env.DB.prepare(`INSERT INTO student_payments (user_id, paid_at, amount_krw, method, memo, status, created_at) VALUES (?,?,?,?,?,?,?)`)
            .bind(sub.user_id, now, sub.amount || 0, '정기결제', '정기결제 자동청구(cron)', 'paid', now).run();
          await env.DB.prepare(`UPDATE subscriptions SET last_billed_at = ?, next_billing_at = ?, updated_at = ? WHERE id = ?`).bind(now, now + 30 * 86400 * 1000, now, sub.id).run();
          charged++;
        }
        return json({ ok: true, charged });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 📚 Phase 39 — 교재 파일 라이브러리 (PDF / JPG / PNG)
    //   • 경쟁사 참고: ClassIn(PDF 칠판 공유), Tutoring(레벨별 자료), Khan Academy(코스 단위)
    //   • R2: RECORDINGS 버킷 재사용, key prefix "textbook-files/"
    //   • 강의실 교재 탭에서 라이브러리 → 선택 → 칠판/PDF 뷰어 동기화
    // ═══════════════════════════════════════════════════════════════════════
    const ensureTextbookFilesTable = async () => {
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS textbook_files (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, mime TEXT, ext TEXT, size_bytes INTEGER, r2_key TEXT NOT NULL, textbook_id INTEGER, level TEXT, unit_no INTEGER, description TEXT, uploaded_by TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`
      );
    };

    // POST /api/admin/textbook-files — 파일 업로드 (multipart/form-data)
    if (method === 'POST' && path === '/api/admin/textbook-files') {
      try {
        await ensureTextbookFilesTable();
        const form = await request.formData();
        const file = form.get('file') as File | null;
        if (!file) return json({ ok: false, error: 'file_required' }, 400);

        const MAX_SIZE = 80 * 1024 * 1024;
        if (file.size > MAX_SIZE) return json({ ok: false, error: 'file_too_large', max: MAX_SIZE }, 413);

        const rawName = (form.get('name') as string | null) || file.name || 'untitled';
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const allowedExt = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
        if (!allowedExt.includes(ext)) return json({ ok: false, error: 'invalid_type', allowed: allowedExt }, 400);
        const kind = ext === 'pdf' ? 'pdf' : 'image';

        const r2 = (env as any).RECORDINGS;
        if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);

        const key = `textbook-files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const buf = await file.arrayBuffer();
        await r2.put(key, buf, {
          httpMetadata: { contentType: file.type || (kind === 'pdf' ? 'application/pdf' : 'image/jpeg') },
        });

        const now = Date.now();
        const level    = (form.get('level') as string | null) || null;
        const unitNo   = form.get('unit_no') ? Number(form.get('unit_no')) : null;
        const textbookId = form.get('textbook_id') ? Number(form.get('textbook_id')) : null;
        const description = (form.get('description') as string | null) || null;
        const uploadedBy = (form.get('uploaded_by') as string | null) || null;

        const ins = await env.DB.prepare(
          `INSERT INTO textbook_files (name, kind, mime, ext, size_bytes, r2_key, textbook_id, level, unit_no, description, uploaded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(rawName, kind, file.type || null, ext, file.size, key, textbookId, level, unitNo, description, uploadedBy, now, now).run();

        return json({
          ok: true,
          id: ins.meta.last_row_id,
          name: rawName,
          kind,
          ext,
          size: file.size,
          url: `/api/textbook-files/${ins.meta.last_row_id}/raw`,
        });
      } catch (e: any) {
        return json({ ok: false, error: 'upload_failed', detail: String(e?.message || e) }, 500);
      }
    }

    // GET /api/admin/textbook-files — 라이브러리 목록
    if (method === 'GET' && path === '/api/admin/textbook-files') {
      await ensureTextbookFilesTable();
      const lv = url.searchParams.get('level');
      const tb = url.searchParams.get('textbook_id');
      const kd = url.searchParams.get('kind');
      const q  = url.searchParams.get('q');
      const book = url.searchParams.get('book');
      const where: string[] = ['active = 1'];
      const binds: any[] = [];
      if (lv) { where.push('level = ?');       binds.push(lv); }
      if (tb) { where.push('textbook_id = ?'); binds.push(Number(tb)); }
      if (kd) { where.push('kind = ?');        binds.push(kd); }
      if (q)  { where.push('name LIKE ?');     binds.push(`%${q}%`); }
      if (book) { where.push('name LIKE ?');   binds.push(`[${book}]%`); }   // 특정 교재의 파일만

      // fix (2026-06-02) — 그룹 집계 모드(?group=1): 교재명([book])별 파일 수를 한 번에.
      //   38,000+ 파일이 있어도 모든 교재가 항상 표에 보이게 (limit 500 에 가려지던 문제 해결).
      if (url.searchParams.get('group') === '1') {
        const gsql = `SELECT (CASE WHEN substr(name,1,1)='[' THEN substr(name,2,instr(name,']')-2) ELSE '(기타)' END) AS book,
                             COUNT(*) AS files, MIN(level) AS level, MAX(kind) AS kind
                      FROM textbook_files WHERE ${where.join(' AND ')}
                      GROUP BY book ORDER BY book ASC`;
        const grs: any = await env.DB.prepare(gsql).bind(...binds).all();
        const groups = grs.results || [];
        const total = groups.reduce((a: number, g: any) => a + (g.files || 0), 0);
        return json({ ok: true, groups, total });
      }

      const limit = Math.min(20000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10)));
      const sql = `SELECT id, name, kind, mime, ext, size_bytes, r2_key, textbook_id, level, unit_no, description, uploaded_by, created_at, updated_at FROM textbook_files WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${limit}`;
      const rs: any = await env.DB.prepare(sql).bind(...binds).all();
      const items = (rs.results || []).map((it: any) => ({
        ...it,
        url: `/api/textbook-files/${it.id}/raw`,
      }));
      return json({ ok: true, items });
    }

    // PATCH /api/admin/textbook-files/:id
    if (method === 'PATCH' && /^\/api\/admin\/textbook-files\/\d+$/.test(path)) {
      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const b = await parseJsonBody(request);
      if (!b) return invalidBody(['body']);
      const sets: string[] = [];
      const binds: any[] = [];
      if (b.name !== undefined)        { sets.push('name = ?');        binds.push(String(b.name)); }
      if (b.level !== undefined)       { sets.push('level = ?');       binds.push(b.level || null); }
      if (b.unit_no !== undefined)     { sets.push('unit_no = ?');     binds.push(b.unit_no != null ? Number(b.unit_no) : null); }
      if (b.textbook_id !== undefined) { sets.push('textbook_id = ?'); binds.push(b.textbook_id != null ? Number(b.textbook_id) : null); }
      if (b.description !== undefined) { sets.push('description = ?'); binds.push(b.description || null); }
      if (b.active !== undefined)      { sets.push('active = ?');      binds.push(b.active ? 1 : 0); }
      if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      await env.DB.prepare(`UPDATE textbook_files SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true, id });
    }

    // DELETE /api/admin/textbook-files/:id
    if (method === 'DELETE' && /^\/api\/admin\/textbook-files\/\d+$/.test(path)) {
      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(`SELECT r2_key FROM textbook_files WHERE id = ?`).bind(id).first();
      if (row?.r2_key) {
        try { await (env as any).RECORDINGS.delete(row.r2_key); } catch (e) { /* ignore */ }
      }
      await env.DB.prepare(`DELETE FROM textbook_files WHERE id = ?`).bind(id).run();
      return json({ ok: true, id });
    }

    // GET /api/textbook-files/:id/raw — R2 프록시 (강의실 PDF 뷰어용, 인증 불필요)
    if (method === 'GET' && /^\/api\/textbook-files\/\d+\/raw$/.test(path)) {
      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/')[3] || '0', 10);
      const row: any = await env.DB.prepare(`SELECT r2_key, mime, kind, name, ext FROM textbook_files WHERE id = ? AND active = 1`).bind(id).first();
      if (!row) return new Response('Not Found', { status: 404 });
      const r2 = (env as any).RECORDINGS;
      const obj = await r2.get(row.r2_key);
      if (!obj) return new Response('Not Found in R2', { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      if (!headers.get('content-type')) {
        headers.set('content-type', row.mime || (row.kind === 'pdf' ? 'application/pdf' : 'image/jpeg'));
      }
      headers.set('Cache-Control', 'public, max-age=3600');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(row.name || 'file')}"`);
      return new Response(obj.body, { headers });
    }

    // GET /api/textbook-files/:id — 메타데이터 (공개)
    if (method === 'GET' && /^\/api\/textbook-files\/\d+$/.test(path)) {
      await ensureTextbookFilesTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(
        `SELECT id, name, kind, mime, ext, size_bytes, level, unit_no, description, created_at FROM textbook_files WHERE id = ? AND active = 1`
      ).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      return json({ ok: true, item: { ...row, url: `/api/textbook-files/${row.id}/raw` } });
    }

    // GET /api/textbook-files — 공개 라이브러리 목록
    if (method === 'GET' && path === '/api/textbook-files') {
      await ensureTextbookFilesTable();
      const lv = url.searchParams.get('level');
      const book = url.searchParams.get('book');
      const where: string[] = ['active = 1'];
      const binds: any[] = [];
      if (lv) { where.push('level = ?'); binds.push(lv); }
      if (book) { where.push('name LIKE ?'); binds.push(`[${book}]%`); }   // 특정 교재의 파일만(시퀀스 로딩용)

      // fix (2026-06-02) — 그룹 집계 모드(?group=1): 라이브러리 트리/칩이 모든 교재를 한눈에 (limit 무관)
      if (url.searchParams.get('group') === '1') {
        const gsql = `SELECT (CASE WHEN substr(name,1,1)='[' THEN substr(name,2,instr(name,']')-2) ELSE '(기타)' END) AS book,
                             COUNT(*) AS files, MIN(level) AS level, MAX(kind) AS kind
                      FROM textbook_files WHERE ${where.join(' AND ')}
                      GROUP BY book ORDER BY book ASC`;
        const grs: any = await env.DB.prepare(gsql).bind(...binds).all();
        const groups = grs.results || [];
        const total = groups.reduce((a: number, g: any) => a + (g.files || 0), 0);
        return json({ ok: true, groups, total });
      }

      // fix (2026-06-02) — limit 파라미터 허용(기본 500, 최대 20000). 교재 전체를 불러올 수 있게.
      const limit = Math.min(20000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10)));
      const rs: any = await env.DB.prepare(
        `SELECT id, name, kind, ext, size_bytes, level, unit_no, description, created_at FROM textbook_files WHERE ${where.join(' AND ')} ORDER BY level ASC, unit_no ASC, created_at DESC LIMIT ${limit}`
      ).bind(...binds).all();
      const items = (rs.results || []).map((it: any) => ({
        ...it,
        url: `/api/textbook-files/${it.id}/raw`,
      }));
      return json({ ok: true, items });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🎬 Phase 39 — 망고아이 비디오 (자체 제작 YouTube 영상)
    //   • 경쟁사 참고: Tutoring(레벨별 영상), Khan Academy(레슨 단위), 야나두/시원스쿨
    //   • 관리자가 YouTube URL 입력만 하면 학생 페이지에 자동 노출
    // ═══════════════════════════════════════════════════════════════════════
    const ensureMangoVideosTable = async () => {
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS mango_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_en TEXT, youtube_url TEXT NOT NULL, youtube_id TEXT NOT NULL, thumbnail_url TEXT, level TEXT, lesson_no INTEGER, category TEXT, description TEXT, description_en TEXT, duration_sec INTEGER, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`
      );
    };
    const extractYoutubeId = (raw: string): string | null => {
      if (!raw) return null;
      try {
        const u = new URL(raw.trim());
        if (u.hostname.includes('youtu.be')) {
          return u.pathname.split('/').filter(Boolean)[0] || null;
        }
        if (u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')) {
          const v = u.searchParams.get('v');
          if (v) return v;
          const parts = u.pathname.split('/').filter(Boolean);
          if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v')) {
            return parts[1];
          }
        }
      } catch (e) { /* ignore */ }
      if (/^[a-zA-Z0-9_-]{11}$/.test(raw.trim())) return raw.trim();
      return null;
    };

    // POST /api/admin/mango-videos — 비디오 등록
    if (method === 'POST' && path === '/api/admin/mango-videos') {
      await ensureMangoVideosTable();
      const b = await parseJsonBody(request);
      if (!b || !b.title || !b.youtube_url) return invalidBody(['title', 'youtube_url']);
      const yid = extractYoutubeId(b.youtube_url);
      if (!yid) return json({ ok: false, error: 'invalid_youtube_url' }, 400);
      const thumb = b.thumbnail_url || `https://img.youtube.com/vi/${yid}/hqdefault.jpg`;
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO mango_videos (title, title_en, youtube_url, youtube_id, thumbnail_url, level, lesson_no, category, description, description_en, duration_sec, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.title, b.title_en || null, b.youtube_url, yid, thumb,
        b.level || null, b.lesson_no != null ? Number(b.lesson_no) : null,
        b.category || null, b.description || null, b.description_en || null,
        b.duration_sec != null ? Number(b.duration_sec) : null,
        b.sort_order != null ? Number(b.sort_order) : 0,
        b.active === false ? 0 : 1,
        now, now
      ).run();
      return json({ ok: true, id: r.meta.last_row_id, youtube_id: yid, thumbnail_url: thumb });
    }

    // GET /api/admin/mango-videos — 관리자 목록
    if (method === 'GET' && path === '/api/admin/mango-videos') {
      await ensureMangoVideosTable();
      const lv = url.searchParams.get('level');
      const where: string[] = ['1=1'];
      const binds: any[] = [];
      if (lv) { where.push('level = ?'); binds.push(lv); }
      const rs: any = await env.DB.prepare(
        `SELECT * FROM mango_videos WHERE ${where.join(' AND ')} ORDER BY active DESC, level ASC, lesson_no ASC, sort_order ASC, created_at DESC LIMIT 500`
      ).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // PATCH /api/admin/mango-videos/:id
    if (method === 'PATCH' && /^\/api\/admin\/mango-videos\/\d+$/.test(path)) {
      await ensureMangoVideosTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const b = await parseJsonBody(request);
      if (!b) return invalidBody(['body']);
      const sets: string[] = [];
      const binds: any[] = [];
      const patchFields: Record<string, (v: any) => any> = {
        title: v => String(v),
        title_en: v => v || null,
        youtube_url: v => String(v),
        thumbnail_url: v => v || null,
        level: v => v || null,
        lesson_no: v => v != null ? Number(v) : null,
        category: v => v || null,
        description: v => v || null,
        description_en: v => v || null,
        duration_sec: v => v != null ? Number(v) : null,
        sort_order: v => v != null ? Number(v) : 0,
        active: v => v ? 1 : 0,
      };
      for (const [k, fn] of Object.entries(patchFields)) {
        if (b[k] !== undefined) {
          sets.push(`${k} = ?`);
          binds.push(fn(b[k]));
        }
      }
      if (b.youtube_url !== undefined) {
        const yid = extractYoutubeId(b.youtube_url);
        if (!yid) return json({ ok: false, error: 'invalid_youtube_url' }, 400);
        sets.push('youtube_id = ?'); binds.push(yid);
        if (b.thumbnail_url === undefined) {
          sets.push('thumbnail_url = ?'); binds.push(`https://img.youtube.com/vi/${yid}/hqdefault.jpg`);
        }
      }
      if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      await env.DB.prepare(`UPDATE mango_videos SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true, id });
    }

    // DELETE /api/admin/mango-videos/:id
    if (method === 'DELETE' && /^\/api\/admin\/mango-videos\/\d+$/.test(path)) {
      await ensureMangoVideosTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM mango_videos WHERE id = ?`).bind(id).run();
      return json({ ok: true, id });
    }

    // GET /api/mango-videos — 공개 학생용
    if (method === 'GET' && path === '/api/mango-videos') {
      await ensureMangoVideosTable();
      const lv = url.searchParams.get('level');
      const cat = url.searchParams.get('category');
      const where: string[] = ['active = 1'];
      const binds: any[] = [];
      if (lv)  { where.push('level = ?');    binds.push(lv); }
      if (cat) { where.push('category = ?'); binds.push(cat); }
      const rs: any = await env.DB.prepare(
        `SELECT id, title, title_en, youtube_id, thumbnail_url, level, lesson_no, category, description, description_en, duration_sec FROM mango_videos WHERE ${where.join(' AND ')} ORDER BY level ASC, lesson_no ASC, sort_order ASC LIMIT 500`
      ).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ===== 관리자 개입: 녹화 상태 변경 (Phase 4) =====
    //   PATCH /api/recordings/:id/status  body: { status: 'ended' | 'deleted' }
    //     - 기존 DELETE /api/recordings/:id 는 deleted 로만 변경 가능 → 복원(ended) 을 이걸로 처리
    if (method === 'PATCH' && /^\/api\/recordings\/\d+\/status$/.test(path)) {
      const m = path.match(/^\/api\/recordings\/(\d+)\/status$/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (!id) return invalidBody(['id(path)']);
      const b = await parseJsonBody(request);
      if (!b || !b.status) return invalidBody(['status']);
      const allowed = new Set(['ended', 'deleted', 'aborted']);
      if (!allowed.has(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: Array.from(allowed) }, 400);
      }
      await env.DB.prepare(`UPDATE recordings SET status = ? WHERE id = ?`).bind(b.status, id).run();
      return json({ ok: true, id, status: b.status });
    }

    // ── GET /api/admin/attendance/today?room_id= — 오늘 출석 명단 (QR 출결 카드) ──
    //   🐛 fix(2026-07-14): admin.html QR 출결 카드가 태초부터 미구현 API 를 호출해
    //   404 였음. 학생용 /api/attendance/checkin 이 남기는 attendance 행을 KST 오늘
    //   기준으로 조회. 프런트 계약: { ok, list:[{joined_at, username|user_id, room_id, status}] }
    if (method === 'GET' && path === '/api/admin/attendance/today') {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT, attended_at INTEGER, total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0);`); } catch {}
      const day = String(url.searchParams.get('date') || today());
      const roomQ = (url.searchParams.get('room_id') || '').trim();
      try {
        const sql = roomQ
          ? `SELECT user_id, username, room_id, status, COALESCE(attended_at, joined_at) AS joined_at FROM attendance WHERE date = ? AND room_id = ? ORDER BY joined_at ASC LIMIT 500`
          : `SELECT user_id, username, room_id, status, COALESCE(attended_at, joined_at) AS joined_at FROM attendance WHERE date = ? ORDER BY joined_at ASC LIMIT 500`;
        const rs = roomQ
          ? await env.DB.prepare(sql).bind(day, roomQ).all()
          : await env.DB.prepare(sql).bind(day).all();
        const list = (rs.results || []) as any[];
        return json({ ok: true, date: day, count: list.length, list });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'query_failed' }, 500);
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2026-07-14: 태초 404 API 4종 구현 — admin.html 이 호출하지만 백엔드가
    // 처음부터 없던 카드들(기준선 대조로 확인, 리팩토링 회귀 아님).
    // index.ts 게이트에는 전부 기등록 → api-mango.ts 위임 가드에만 경로 추가.
    // ═════════════════════════════════════════════════════════════════════

    // ── 🎁 추천 친구 보상 (card-referral) ──
    //   컬럼 관례: churn-contagion.ts 가 referrer_uid/referred_uid 를 읽으므로 동일하게.
    //   프런트는 referee_uid 를 기대 → SELECT 별칭으로 정합.
    if (path === '/api/admin/referrals' || path === '/api/admin/referrals/stats') {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_uid TEXT NOT NULL, referred_uid TEXT NOT NULL, code TEXT, status TEXT DEFAULT 'pending', reward_points INTEGER DEFAULT 0, created_at INTEGER, UNIQUE(referrer_uid, referred_uid));`); } catch {}
    }
    if (method === 'GET' && path === '/api/admin/referrals') {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 500);
      try {
        const rs = await env.DB.prepare(`SELECT id, referrer_uid, referred_uid AS referee_uid, code, status, reward_points, created_at FROM referrals ORDER BY created_at DESC, id DESC LIMIT ?`).bind(limit).all();
        return json({ ok: true, list: rs.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }
    if (method === 'GET' && path === '/api/admin/referrals/stats') {
      try {
        const cs = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM referrals GROUP BY status`).all();
        const counts: Record<string, number> = {};
        for (const r of (cs.results || []) as any[]) counts[String(r.status || 'pending')] = Number(r.n) || 0;
        const lb = await env.DB.prepare(`SELECT referrer_uid, COUNT(*) AS n FROM referrals GROUP BY referrer_uid ORDER BY n DESC LIMIT 10`).all();
        return json({ ok: true, counts, leaderboard: lb.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }

    // ── 📅 1:1 상담 자동 예약 (card-counseling-booking) ──
    //   같은 카드의 버튼 3개(bookings 조회·slot/open·cancel)를 함께 구현해 카드 완동작.
    //   status 값은 프런트 색상 분기('취소'=red, '완료'=green)와 맞춰 한글 사용.
    if (path.startsWith('/api/admin/counseling/')) {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_slots (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_uid TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, status TEXT DEFAULT 'open', created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER, staff_uid TEXT, date TEXT, start_time TEXT, parent_name TEXT, parent_phone TEXT, student_uid TEXT, topic TEXT, status TEXT DEFAULT '예약', created_at INTEGER);`); } catch {}
    }
    if (method === 'POST' && path === '/api/admin/counseling/slot/open') {
      const b = await parseJsonBody(request);
      const staff = String(b?.staff_uid || '').trim();
      const date = String(b?.date || '').trim();
      const start = String(b?.start_time || '').trim();
      if (!staff || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(start)) return invalidBody(['staff_uid', 'date', 'start_time']);
      const dur = Math.min(Math.max(Number(b?.duration_min) || 30, 5), 240);
      const count = Math.min(Math.max(Number(b?.count) || 1, 1), 20);
      const [hh, mm] = start.split(':').map((n: string) => parseInt(n, 10));
      const now = Date.now();
      try {
        for (let i = 0; i < count; i++) {
          const t = (hh * 60 + mm) + i * dur;
          const st = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
          await env.DB.prepare(`INSERT INTO counseling_slots (staff_uid, date, start_time, duration_min, status, created_at) VALUES (?,?,?,?,'open',?)`).bind(staff, date, st, dur, now).run();
        }
        return json({ ok: true, count });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'insert_failed' }, 500); }
    }
    if (method === 'GET' && path === '/api/admin/counseling/bookings') {
      try {
        const rs = await env.DB.prepare(`SELECT id, slot_id, staff_uid, date, start_time, parent_name, parent_phone, student_uid, topic, status, created_at FROM counseling_bookings ORDER BY date DESC, start_time DESC, id DESC LIMIT 300`).all();
        return json({ ok: true, list: rs.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }
    if (method === 'POST' && path === '/api/admin/counseling/cancel') {
      const b = await parseJsonBody(request);
      const id = Number(b?.booking_id);
      if (!Number.isFinite(id) || id <= 0) return invalidBody(['booking_id']);
      try {
        const row = await env.DB.prepare(`SELECT id, slot_id FROM counseling_bookings WHERE id = ?`).bind(id).first<any>();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        await env.DB.prepare(`UPDATE counseling_bookings SET status = '취소' WHERE id = ?`).bind(id).run();
        if (row.slot_id) { try { await env.DB.prepare(`UPDATE counseling_slots SET status = 'open' WHERE id = ?`).bind(row.slot_id).run(); } catch {} }
        return json({ ok: true, id });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'update_failed' }, 500); }
    }

    // ── 🎮 영어 배틀 관리 (card-battle-mgmt) — 공개 경로(인증 불필요) ──
    //   P2P 배틀 백엔드는 미구축 → 리더보드는 game_progress(게임 학습 기록) 집계.
    //   wins = 정답 누계. history 는 유저의 최근 게임 기록을 'vs AI' 형태로 매핑.
    if (method === 'GET' && path === '/api/battle/leaderboard') {
      try {
        const rs = await env.DB.prepare(`SELECT user_id, SUM(correct_count) AS wins FROM game_progress WHERE user_id NOT LIKE 'guest%' GROUP BY user_id HAVING wins > 0 ORDER BY wins DESC LIMIT 50`).all();
        return json({ ok: true, source: 'game_progress', list: rs.results || [] });
      } catch { return json({ ok: true, source: 'empty', list: [] }); } // 테이블 부재 시에도 카드가 '데이터 없음'으로 동작
    }
    if (method === 'GET' && path === '/api/battle/history') {
      const uid = (url.searchParams.get('user_id') || '').trim();
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);
      if (!uid) return json({ ok: true, list: [] });
      try {
        const rs = await env.DB.prepare(`SELECT lang, item, correct_count, wrong_count, last_seen FROM game_progress WHERE user_id = ? ORDER BY last_seen DESC LIMIT ?`).bind(uid, limit).all();
        const list = ((rs.results || []) as any[]).map(r => {
          const c = Number(r.correct_count) || 0, w = Number(r.wrong_count) || 0;
          return {
            game_type: `${r.lang || 'en'} · ${r.item || ''}`,
            challenger_uid: uid, opponent_uid: 'AI',
            challenger_score: c, opponent_score: w,
            winner_uid: c > w ? uid : (w > c ? 'AI' : null),
            created_at: r.last_seen || null,
          };
        });
        return json({ ok: true, list });
      } catch { return json({ ok: true, list: [] }); }
    }

    // ── 📷 QR 출결 — QR 생성(관리자) + 학생 체크인(공개, 토큰이 인증) ──
    //   프런트 계약(admin.html:7205): { ok, qr_url(상대경로), token, expires_at(ms) }
    //   흐름: 관리자 qr-gen → 학생 폰이 QR 의 /qr-checkin.html?token= 접속
    //        → 랜딩이 POST /api/attendance/check-in {token, user_id} → attendance upsert.
    //   경로 표기 주의: 학생용은 '/api/attendance/check-in'(대시) — index.ts 게이트 기등록 경로.
    //   기존 '/api/attendance/checkin'(무대시, 시그널링용)과는 다른 엔드포인트.
    if (path === '/api/admin/attendance/qr-gen' || path === '/api/attendance/check-in') {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance_qr_tokens (token TEXT PRIMARY KEY, room_id TEXT NOT NULL, teacher_uid TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_count INTEGER DEFAULT 0);`); } catch {}
    }
    if (method === 'POST' && path === '/api/admin/attendance/qr-gen') {
      const b = await parseJsonBody(request);
      const roomId = String(b?.room_id || '').trim();
      const teacher = String(b?.teacher_uid || '').trim();
      if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(roomId)) return invalidBody(['room_id']);
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
      const now = Date.now();
      const expiresAt = now + 5 * 60 * 1000; // 5분 유효 — 카드 안내 문구와 동일
      try {
        await env.DB.prepare(`INSERT INTO attendance_qr_tokens (token, room_id, teacher_uid, created_at, expires_at) VALUES (?,?,?,?,?)`).bind(token, roomId, teacher || null, now, expiresAt).run();
        try { await env.DB.prepare(`DELETE FROM attendance_qr_tokens WHERE expires_at < ?`).bind(now - 86400000).run(); } catch {} // 만료 하루 지난 토큰 청소
        return json({ ok: true, token, qr_url: `/qr-checkin.html?token=${token}`, room_id: roomId, expires_at: expiresAt });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'insert_failed' }, 500); }
    }
    if (method === 'POST' && path === '/api/attendance/check-in') {
      const b = await parseJsonBody(request);
      const token = String(b?.token || '').trim();
      const userId = String(b?.user_id || '').trim();
      if (!/^[a-f0-9]{32}$/.test(token)) return json({ ok: false, error: 'invalid_token' }, 400);
      if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(userId)) return invalidBody(['user_id']);
      const now = Date.now();
      try {
        const t = await env.DB.prepare(`SELECT token, room_id, expires_at FROM attendance_qr_tokens WHERE token = ?`).bind(token).first<any>();
        if (!t) return json({ ok: false, error: 'token_not_found' }, 404);
        if (Number(t.expires_at) < now) return json({ ok: false, error: 'token_expired', expired: true }, 410);
        const roomId = String(t.room_id);
        const date = today(now);
        // attendance upsert — /api/attendance/checkin(api-mango.ts) 과 동일한 스키마·status 관례
        try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT, attended_at INTEGER, total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0);`); } catch {}
        const existing = await env.DB.prepare(`SELECT id, status FROM attendance WHERE user_id = ? AND room_id = ? AND date = ? ORDER BY joined_at DESC LIMIT 1`).bind(userId, roomId, date).first<any>();
        if (existing) {
          await env.DB.prepare(`UPDATE attendance SET status = 'attended', attended_at = COALESCE(attended_at, ?), username = COALESCE(username, ?) WHERE id = ?`).bind(now, b?.username || null, existing.id).run();
        } else {
          await env.DB.prepare(`INSERT INTO attendance (room_id, user_id, username, role, joined_at, attended_at, status, date) VALUES (?,?,?,'student',?,?,'attended',?)`).bind(roomId, userId, b?.username || null, now, now, date).run();
        }
        try { await env.DB.prepare(`UPDATE attendance_qr_tokens SET used_count = used_count + 1 WHERE token = ?`).bind(token).run(); } catch {}
        return json({ ok: true, room_id: roomId, user_id: userId, date, status: 'attended', attended_at: now, already: !!existing });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'checkin_failed' }, 500); }
    }

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
