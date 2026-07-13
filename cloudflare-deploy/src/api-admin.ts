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
import { json, parseJsonBody, invalidBody, toCSV, csvResponse } from './api-util';
import { enqueueNotification } from './api-notify';
import { scopeFragments } from './scope';   // 🔒 지사/대리점 데이터 격리
import { getAdminActor, sameTeacherName } from './auth-admin';  // 승인자 기록(SR·FD)·강사 스코프 비교
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
      const studentTotal: any = await fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE (status = '정상' OR status = '활동' OR status IS NULL OR status = '')${_erpScope}`, ..._sb);
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
                                       WHERE (s.status = '정상' OR s.status = '활동' OR s.status IS NULL OR s.status = '')
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
             AND status != '정상'` + _sf.erpScope + `
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
    //   - R2 객체 수·총 size (list 페이지 최대 5장 = 5000 객체)
    //   - KV 는 list() 가 일일 한도 소비라 측정 제외 (dashboard 안내)
    if (method === 'GET' && path === '/api/admin/stats/storage') {
      const started = Date.now();

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

      // R2 객체 카운트 (최대 5,000 개) — 더 크면 truncated=true 로 알림
      let r2Count = 0;
      let r2Size = 0;
      let r2Truncated = false;
      const envAny = env as any;
      if (envAny.RECORDINGS) {
        try {
          let cursor: string | undefined = undefined;
          const MAX_PAGES = 5;
          for (let i = 0; i < MAX_PAGES; i++) {
            const ls: any = await envAny.RECORDINGS.list({ limit: 1000, cursor });
            for (const obj of (ls.objects || [])) {
              r2Count++;
              r2Size += obj.size || 0;
            }
            if (ls.truncated && ls.cursor) {
              cursor = ls.cursor;
              if (i === MAX_PAGES - 1) r2Truncated = true;
            } else { break; }
          }
        } catch (e) {
          // 측정 실패해도 D1 메트릭은 반환
        }
      }

      return json({
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
          note: r2Truncated ? '5,000 객체 초과 — 정확한 사용량은 Cloudflare dashboard 에서 확인' : null
        },
        kv: {
          note: 'KV 사용량(list/get/put 호출 수) 은 Cloudflare dashboard 에서 확인. list() 호출 자체가 일일 한도 소비라 셀프 측정 제외.'
        }
      });
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
      const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM payroll_deduction_rules`).first().catch(() => null);
      if (!cnt || !(cnt.c > 0)) {
        const now = Date.now();
        const seed: any[] = [
          ['no_feedback_day',    '당일 피드백 미작성 (수업 1건당 차감)', 'No feedback within the day (per lesson)', 'per_lesson',     50, 1, 1],
          ['teacher_no_show',    '강사 미입장·노쇼 (수업 1건당 차감)',   'Teacher no-show (per lesson)',            'per_lesson',      0, 0, 2],
          ['absent_pay_percent', '학생 결석 시 지급률(%)',               'Pay rate when student is absent (%)',     'policy_percent',  0, 1, 3],
        ];
        for (const s of seed) {
          try { await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind(s[0], s[1], s[2], s[3], s[4], s[5], s[6], now).run(); } catch {}
        }
      }
    };

    // ── 💼 G3 — 월별 수업 한 건씩(Lesson Fee Summary) + 공제 자동 계산 ──
    //   class_schedules(수업) + class_no_show(결석/노쇼) + teacher_class_feedback(당일 피드백)을
    //   JS에서 매칭(스케줄 날짜 포맷이 '2026-07-01'/'2026/07/01' 혼재라 SQL 조인 대신 안전한 JS 매칭).
    //   수업↔피드백 정확 연결: 예약기반 결정론 room_id = `class-{scheduleId}-{YYYYMMDD}` (Phase RM 규칙 재사용)
    const computeLessonFeeMonth = async (year: number, month: number) => {
      await ensurePayrollTable();
      await ensureDeductionRules();
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, fee_per_10min INTEGER, status TEXT DEFAULT '활동중', email TEXT, phone TEXT);`); } catch {}
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

      // 강사 목록 + 단가
      const teachers: any = await env.DB.prepare(
        `SELECT id, korean_name, english_name, fee_per_10min FROM teacher_profiles WHERE status = '활동중' OR status IS NULL ORDER BY korean_name`
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
        const fee = (prof && prof.fee_per_10min) || 0;
        const mins = l._mins;
        const teacherName = l.teacher_name || (prof ? prof.korean_name : null);

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

        const dedus: any[] = [];
        if (st === 'finish' && fbOk === false && feeNoFb > 0) dedus.push({ code: 'no_feedback_day', amount: feeNoFb });
        if (st === 'teacher_no_show' && feeTNoShow > 0) dedus.push({ code: 'teacher_no_show', amount: feeTNoShow });
        const dSum = dedus.reduce((a, b) => a + (b.amount || 0), 0);

        lessons.push({
          schedule_id: l.id, room_id: roomId, date: dateStr, start_time: l.start_time || '',
          duration_minutes: mins, user_id: l.user_id || null,
          student_name: l.student_name || stuName[l.user_id] || null,
          teacher_id: l.teacher_id, teacher_name: teacherName,
          status: st, fee_per_10min: fee, base_amount: base, amount,
          feedback_ok: fbOk, deductions: dedus, deduction_total: dSum,
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

      return { rules: ruleRows.results || [], absent_pay_percent: absentPct, lessons, perTeacher, teachers: teachers.results || [] };
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
        const fee = t.fee_per_10min || 0;
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

      return json({
        ok: true, year, month,
        teacher: teacher ? { id: teacher.id, korean_name: teacher.korean_name, english_name: teacher.english_name, fee_per_10min: teacher.fee_per_10min || 0 } : { id: tid || null, korean_name: tname || null },
        summary: sum,
        rules: (data.rules || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rule_type: r.rule_type, amount: r.amount, enabled: r.enabled })),
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

    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase SR — 수업 연기·변경 요청 (강사 → 매니저/관리자)
    //   그동안 연기/변경은 학생용 데모 화면뿐이라 기록이 어디에도 안 남았음.
    //   이제 강사가 마이페이지에서 요청을 남기면 schedule_change_requests 에 저장되고,
    //   관리자가 admin.html 카드에서 시간 포함 전체 기록을 보고 승인/거절한다.
    //   승인 시 class_schedules 에 실제 반영(새 일시로 이동 or status='postponed').
    //   요청 row 자체가 변경 이력(기존 일시 → 새 일시, 누가, 언제)을 보존한다.
    // ═══════════════════════════════════════════════════════════════

    const ensureScheduleRequestTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS schedule_change_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, request_type TEXT DEFAULT 'postpone', requester_role TEXT DEFAULT 'teacher', requester_name TEXT, teacher_name TEXT, student_name TEXT, orig_date TEXT, orig_time TEXT, new_date TEXT, new_time TEXT, reason TEXT, status TEXT DEFAULT 'pending', decided_by TEXT, decided_at INTEGER, decide_memo TEXT, created_at INTEGER NOT NULL)`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_scr_status ON schedule_change_requests(status, created_at)`); } catch {}
    };

    // ── POST /api/admin/schedule-requests — 연기/변경 요청 제출 (강사 마이페이지) ──
    //   body: { schedule_id?, request_type:'postpone'|'change', requester_name, teacher_name,
    //           student_name?, orig_date?, orig_time?, new_date?, new_time?, reason? }
    //   schedule_id 가 있으면 기존 일시·학생은 서버가 class_schedules 에서 읽어 권위값으로 채움.
    if (method === 'POST' && path === '/api/admin/schedule-requests') {
      await ensureScheduleRequestTable();
      const body: any = await request.json().catch(() => ({}));
      const reqType = body.request_type === 'change' ? 'change' : 'postpone';
      const teacherName = (body.teacher_name || body.requester_name || '').trim();
      if (!teacherName) return json({ ok: false, error: 'teacher_name_required' }, 400);

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
      const r: any = await env.DB.prepare(
        `INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_name, teacher_name, student_name, orig_date, orig_time, new_date, new_time, reason, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?)`
      ).bind(
        scheduleId, reqType, body.requester_role === 'student' ? 'student' : 'teacher',
        (body.requester_name || teacherName).trim(), teacherName, studentName,
        origDate, origTime, newDate, newTime, (body.reason || '').trim() || null, now
      ).run();
      return json({ ok: true, id: r?.meta?.last_row_id || null, status: 'pending', created_at: now });
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
      return json({ ok: true, id, status: action, applied, decided_at: now });
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

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
