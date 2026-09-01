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
import { praiseCountForRoom } from './point-policy';   // ⭐ 칭찬 횟수 정본(복제 금지)
import { notSeedSql } from './accounting-reports';   // 🌱 시연용 시드 결제 제외 — 리포트와 같은 조건을 쓴다
import { selectInChunks } from './d1-chunk';   // 🔢 IN(...) 목록을 D1 바인드 100개 한도에 맞춰 분할
import { ensureRateOverrideTable } from './org-settlement';   // 💰 수수료·수강료 설정표 — DDL 정본은 그 파일 한 곳
import { teacherPresenceByRoom } from './no-show-truth';   // 🔎 「강사 미입장」이 오판인지 출석 기록과 대조
import { DEFAULT_CLASS_MINUTES, ALLOWED_CLASS_MINUTES, classTenMinUnits } from './class-policy';  // 기본 20분 · 허용 길이 · 급여용 10분 토막 수
/* 💰 (2026-08-26 사장님 지시) 「수업 시간 배수대로 수강료도 자동 계산」 — 곱하는 곳은 저장하는 순간 딱 한 번이다.
   규칙 정본은 src/enroll-fee.ts 하나뿐(두 곳에 두면 «두 번 곱하기» 로 40분이 4배가 된다). */
import { computeMonthlyFee, weeklyCountFromDays } from './enroll-fee';
import { priceForUid } from './enroll-ops';   // 🏪 대리점 주1회 단가 — 기준가가 없을 때만 쓴다
import { findScheduleConflicts } from './schedule-conflict';  // ⛔ 수업 시간 겹침 판정 (한 곳에서만)
import { sendPaymentOverdueAlert, sendKakaoAlimtalk, sendClassRenewalAlert, buildClassRenewalText, CLASS_RENEWAL_FROM_PHONE } from './solapi-client';
/* 🔗 미연장 안내 문자에 넣는 «그 학생 전용» 1회용 연장 링크. 학부모 폰에 학생 로그인이
      없어도 열리게 하는 좁은 권한이다 — 로그인이 아니다(renew-link.ts 머리말 참고). */
import { issueRenewLink } from './renew-link';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { verifyLtTicket, buildLtTicket, buildLtIcs, ltTicketUrl, ltTicketUrlMap, publicBase, OPEN_BEFORE_MS } from './leveltest-ticket';  // 🎟️ 확인+입장 링크 하나
import { createLeveltestSchedule, autoScheduleOnApply } from './leveltest-schedule';  // 📅 신청 → 실제 수업(자동·수동 공용)
import { enqueueNotification, sendPushToUser } from './api-notify';
import { scopeFragments, studentScopeWhere, getScope, franchiseList, scopeStudentCond, scopeFranchiseCond, scopeCenterCond, canEditOrg } from './scope';   // 🔒 지사/대리점 데이터 격리
import { MANGOI_KNOWLEDGE, matchMangoiFaq } from './mangoi-facts';   // 📚 챗봇 «사실» 정본(학부모봇과 공유)
import { runCypher, Neo4jNotConfiguredError } from './teacher-match';  // 🕸️ Neo4j 그래프
import { KCP_TRANSFER_CYPHER_RE, KCP_REVENUE_CYPHER_RE } from './accounting-reports';  // 🧾 「케이씨피M」(운영자금 이체) = 매출 아님 / 「케이씨피」 = 매출 인정 — 판정 정본
import { c24ExpenseDrop, C24_HANGUL_CYPHER_RE, C24_LETTER_CYPHER_RE } from './c24-expense-filter';  // 🧾 카페24 지출결의 중 «우리 것이 아닌» 건(한글 결재·특정 결재라인) 제외 — 판정 정본
import { importCafe24Org, importCafe24Payments, importCafe24Students, importCafe24Attendance } from './cafe24-sync';
import { applyPIIScope, canViewPII } from './pii-mask';
import { HQ_PROFILE } from './hq-profile';                        // 🏯 본사(법인) 정보 정본 — 사이트 «회사 정보» 푸터와 같은 값
import { sendPlainSms } from './solapi-client';
import { sendEmail, emailLayout } from './email';
import { writeClassAudit, listClassAudit } from './class-audit';   // 📜 수업 변경 이력(연기/삭제/종료)
import { TEACHER_STATUSES, canonTeacherStatus, isTeacherStatus, toTeacherListHidden, teacherVisibleSql } from './teacher-status';   // 🧑‍🏫 강사 상태(활동중·비활동·퇴사) + 명부 숨김 — 판정 정본
import { runAbsentStudentSweep } from './absent-sweep';            // 🚨 결석 위험 자동 알림
import { runRecordingFinalizeSweep } from './recordings-r2';       // 🛟 버려진 녹화 자동 마무리
import { runLessonReminderSweep } from './lesson-reminder';        // 📣 수업 전 리마인더
import { getAdminActor, sameTeacherName, checkAdminSession, hashPassword, FULL_ACCESS_ACCOUNTS } from './auth-admin';  // 승인자 기록(SR·FD)·강사 스코프 비교 · 대리점 로그인 계정 생성
import { corpcardConfigured, runCorpCardSync, corpcardData, corpcardStatus, secretFp8, CODEF_SANDBOX_BASE } from './corpcard-sync';  // 💳 법인카드 CODEF 연동
import { barobillConfigured, baroMissing, runBarobillSync, baroCreds } from './barobill-sync';  // 💳 법인카드 바로빌 연동(2026-08-14 CODEF 월 80만원 → 월 3,300원)
import { bankConfigured, bankMissing, runBankSync, bankacctData, bankacctStatus } from './bankacct-sync';  // 🏦 신한은행 계좌 입출금 — 바로빌 계좌조회(2026-08-14)
import { handleEnrollActivateApi } from './enroll-activate';       // 📚 수강신청 확정 → 계정·강사·시간표·구독·안내
import { chargeSubscriptionOnce, runAutoRenewChargeSweep } from './api-pay';  // ♾️ 자동연장 실청구(제보 #2-2/#3-2)
import { handleTeacherKakaoApi } from './teacher-kakao';                     // 💬 강사 카카오ID 명부 + 전달
import { handlePaymentsBoardApi } from './payments-board';                   // 💳 결제관리 화면(ph106) 실데이터
import { hiddenExcludeCond } from './student-override';                       // 🧹 중복 학생계정 숨김(카페24 덮어쓰기 방지)
import { MIRROR_SOURCE, MIRROR_SOURCE_MANUAL } from './c24-mirror';            // 🪞 카페24 미러 — 「사람 손이 이긴다」 도장
import type { MangoEnv } from './api-mango';
/* ⚠️ selectInChunks 는 위(12행)에서 이미 들여온다 — 병합 때 양쪽이 각각 추가해 둘이 됐다.
   중복 import 는 tsc 가 «Duplicate identifier» 로 잡지만 esbuild 는 그냥 넘어가므로,
   컴파일을 안 돌리면 모르고 지나간다. 여기서 지운다. */

// ═══ ⚡ 관리자 KV 캐시 공용 헬퍼 (2026-07-19 통합) ═══
//   graph-list·finance·selfscore·leveltest 등에서 반복되던
//   "get→hit면 Response 반환 / put 후 Response 반환" 보일러플레이트를 한 곳으로.
//   실패는 조용히 무시(캐시는 최적화일 뿐 정확성 아님). 본사 권한게이트 뒤라 조직공용.
async function admCacheHit(env: any, key: string): Promise<Response | null> {
  try {
    const h = await env.SESSION_STATE.get(key);
    if (h) return new Response(h, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Adm-Cache': 'hit' } });
  } catch { /* miss */ }
  return null;
}
async function admCachePut(env: any, key: string, obj: any, ttl = 120): Promise<Response> {
  const body = JSON.stringify(obj);
  try { await env.SESSION_STATE.put(key, body, { expirationTtl: ttl }); } catch { /* 저장 실패 무시 */ }
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}


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

/* 🗓️ 요일 표기 관용 파서 — /api/admin/classes/today (매니저 '오늘 수업') 용.
 *
 *  [무슨 일이 있었나 — 2026-08-06 마이마이 제보 "no class in manager's page"]
 *   매니저 화면의 '오늘 수업'은 **하루도 빠짐없이 비어 있었다**. 예약이 없어서가 아니다.
 *   여기만 `Number(day_of_week) === kDow` 로 비교하고 있었는데, 운영 D1 의
 *   class_schedules.day_of_week 는 **전부 영문 텍스트**('Wed' 153건·'Fri' 142·'Tue' 123·
 *   'Thu' 108·'Mon' 106·'Sat' 26)로 저장돼 있다. `Number('Thu')` 는 NaN 이고
 *   NaN === 4 는 항상 false → 반복수업 662건이 매일 통째로 걸러졌다.
 *   테이블 DDL 이 `day_of_week INTEGER` 라고 적혀 있어서 숫자일 거라 믿은 것이 화근인데,
 *   SQLite 는 선언 타입을 강제하지 않는다(실제 typeof = 'text').
 *   ⚠️ 에러가 한 줄도 안 난다. 화면은 "오늘 예정된 수업이 없습니다"라는 **정상 문구**를 띄웠고,
 *      그래서 아무도 고장으로 신고하지 않았다.
 *
 *  [왜 다른 화면은 멀쩡했나]
 *   학생·강사 경로(api-mango.ts sessions/today, api-teacher.ts)는 2026-07-24 에 이미
 *   같은 사고를 겪고 관용 파서로 고쳤다. 그때 **매니저 경로만 빠졌다**.
 *   → 세 곳이 같은 규칙이어야 한다. 여기만 좁으면 학생은 수업이 보이는데
 *     대신 들어가 줘야 할 매니저에게만 안 보이는, 가장 나쁜 방향의 엇갈림이 생긴다.
 */
const ADM_DOW_MAP: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};
/** 숫자 '5' · 콤마목록 '1,3' · 영문 'Mon' · 한글 '월' 을 모두 받는다. (매칭을 넓히기만 한다) */
function admDowMatches(raw: any, target: number): boolean {
  for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
    const t = p.trim();
    if (!t) continue;
    if (/^\d+$/.test(t)) { if (Number(t) === target) return true; continue; }
    const k = ADM_DOW_MAP[t.toLowerCase()];
    if (k !== undefined && k === target) return true;
  }
  return false;
}

// ═══ 📊 인사평가 근거 분석 공용 헬퍼 (/api/admin/teacher-hr-analysis) ═══
/** 강사 이름 정규화 — 수업기록 테이블은 teacher_name(자유문자열)만 남기므로 표기 흔들림을 흡수. */
function hrNormName(s: any): string {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/^teacher\s+/, '')      // "Teacher Ana" == "Ana"
    .replace(/[\s._\-]+/g, '')
    .trim();
}
/** 0~100 총점 → 목록·모달 공용 등급 라벨 (adm-core.js _hrGrade 와 동일 임계값). */
function hrGradeLabel(total: number | null): string | null {
  if (total == null || isNaN(total)) return null;
  if (total >= 90) return 'A+';
  if (total >= 85) return 'A';
  if (total >= 80) return 'B+';
  if (total >= 75) return 'B';
  if (total >= 70) return 'C+';
  if (total >= 65) return 'C';
  return 'D';
}

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
    // 🕐 (2026-08-17) 30분 수업 도입 — 급여식이 «class_count × 2» 로 모든 수업을 20분으로
    //   가정하고 있었다. 길이가 섞이면 강사가 30분을 가르치고 20분 값을 받는다.
    //   실제 «10분 토막» 합계를 담는 칸. 비어 있으면 예전대로 class_count×2 로 계산한다
    //   (= 전부 20분이던 과거 달의 값이 바뀌지 않는다).
    `ALTER TABLE teacher_monthly_classes ADD COLUMN total_10min_units INTEGER;`,
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
 *   월급 = «10분 토막 수» × rate_per_10min_php
 *   평가 = teacher_evaluations 의 5개 점수 → 가중 합계 → 등급
 *
 *   🕐 (2026-08-17) 예전 식은 «class_count × 2» 였다. 그 «2» 는 10분 토막 개수인데
 *      모든 수업이 20분이라는 가정이 박혀 있었다. 30분 수업이 생기면 강사가
 *      30분을 가르치고 20분 값을 받는다(임금 삭감 → 강사 이탈).
 *      이제 total_10min_units 가 있으면 그것을 쓰고, 없으면(=과거 달) 예전 식 그대로.
 */
/* ═══ 카페24 급여 인제스트를 «이름으로» 잇는다 (2026-08-18 사장님 요청 3안) ═══
   teacher_payroll_auto 는 카페24 서버가 매달 밀어 넣는 표다(/api/payroll-ingest).
   ⛔ 그 표의 teacher_id 는 **카페24 MySQL 번호**로, D1 의 teachers.id(1~29)·
      teacher_profiles.id(4~37) 와 완전히 다른 번호 체계다. 실측(2026-08-18) 9~196 이고
      겹치는 구간에서 서로 **다른 사람**을 가리킨다:
        카페24 9 =「테스트 강사」 · teachers 9 = ZEE · profiles 9 = Teacher Hannah
        카페24 24 = Teacher Mariane · teachers 24 = HANNAH · profiles 24 = Teacher JP
      번호로 이으면 «남의 급여» 가 된다. 이 파일이 이미 profByTeacherId 다리를 두고
      「번호 직조회는 다른 번호 체계라 남의 프로필이 나온다」고 적어 둔 것과 같은 함정이다.
   ✅ 그래서 **이름**으로 잇는다. 정확 일치가 우선이고, 안 맞으면 «Teacher » 접두사를 뗀
      정규화 이름으로 한 번 더 본다(카페24 «Teacher Faye» ↔ 명부 «FAYE» 같은 경우).
      정규화 후 같은 이름이 둘 이상이면 **잇지 않는다** — 애매한 연결은 틀린 급여보다 낫다.
      (실측: 정규화 후 중복 이름 0건, 32명 중 26명이 정확 일치로 이어진다) */
function normTeacherName(v: any): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/^teacher\s+/, '');
}

/* ═══ 카페24 강사번호 → «이름 · 원부번호» 다리 (2026-08-19) ═══
   attendance.teacher_uid 는 **카페24 강사번호**다(실측 9~196). 그런데 —
     ① 이름 칸(attendance.teacher_name)은 거의 비어 있다. 4주 실측(2026-07-22~08-19)에서
        학생 행 4,084건 중 강사번호는 3,251건(80%)에 있는데 **이름은 243건(6%)** 뿐이었다.
     ② 그 243건은 «비어 있는 것보다 나쁘다» — 옛 동기화가 카페24 번호를 `teachers.id` 로
        오인해 조회한 **남의 이름**이다(카페24 24 = Teacher Mariane 인데 HANNAH 로 적혀 있다).
        동기화 코드는 79aa8ed 에서 고쳤지만 **이미 들어간 행은 그대로**다.
   ⛔ 그래서 attendance.teacher_name 을 읽지 말 것. 번호로 매번 다시 찾는다.
   ✅ 이름 = teacher_payroll_auto. 카페24 서버가 «번호와 이름을 함께» 밀어넣은 유일한 표라
      번호↔이름이 어긋나지 않는다(실측: 4주에 나온 강사번호 27개가 전부 여기서 이름이 나온다).
   ✅ 원부번호 = 그 이름을 normTeacherName 으로 정규화해 teachers 와 **유일하게** 맞을 때만.
      class_schedules.teacher_id 를 읽는 화면들이 `LEFT JOIN teachers` 를 하므로, 여기에
      카페24 번호를 그대로 넣으면 번호가 겹치는 자리에서 조용히 남의 이름이 뜬다(=①과 같은 사고).
      애매하면 **비워 둔다** — 빈 칸은 눈에 띄지만 틀린 이름은 안 띈다.
      (실측: 665건 중 이름 665건 · 원부연결 590건. 못 이은 것은 「HT NESS」·「Wan」과
       사람이 아닌 「스케줄변경중」·「test teacher」다) */
export type Cafe24TeacherInfo = { name: string | null; teacherId: string | null };

async function loadCafe24TeacherMap(
  env: { DB: D1Database }, uids: (string | null | undefined)[],
): Promise<Map<string, Cafe24TeacherInfo>> {
  const out = new Map<string, Cafe24TeacherInfo>();
  const want = new Set(uids.map(u => String(u ?? '').trim()).filter(Boolean));
  if (!want.size) return out;

  // 원부(teachers) 정규화 이름 → id. 같은 이름이 둘 이상이면 «잇지 않음»(null) 으로 못 박는다.
  const tid = new Map<string, string | null>();
  try {
    const rs = await env.DB.prepare(`SELECT id, name FROM teachers`).all();
    for (const t of ((rs.results || []) as any[])) {
      const k = normTeacherName(t.name);
      if (!k) continue;
      tid.set(k, tid.has(k) ? null : String(t.id));
    }
  } catch { /* 원부가 없는 옛 DB — 이름만 준다 */ }

  try {
    // 오름차순이라 같은 번호가 여러 달 있으면 **최근 달 이름**이 남는다(개명·표기변경 반영)
    const rs = await env.DB.prepare(
      `SELECT CAST(teacher_id AS TEXT) AS c24, teacher_name
         FROM teacher_payroll_auto
        WHERE teacher_name IS NOT NULL AND teacher_name <> ''
        ORDER BY year ASC, month ASC`
    ).all();
    for (const r of ((rs.results || []) as any[])) {
      const c24 = String(r.c24 || '');
      if (!want.has(c24)) continue;
      const nm = String(r.teacher_name || '').trim();
      out.set(c24, { name: nm || null, teacherId: (tid.get(normTeacherName(nm)) ?? null) });
    }
  } catch { /* 급여 인제스트 표가 없는 옛 DB — 이름 없이 진행(화면이 «미상» 으로 보여 준다) */ }

  return out;
}

async function loadCafe24PayrollMonth(env: { DB: D1Database }, year: number, month: number) {
  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT teacher_id, teacher_name, completed_classes, total_classes, pay_php, total_minutes
         FROM teacher_payroll_auto WHERE year = ? AND month = ?`
    ).bind(year, month).all();
    rows = (rs.results || []) as any[];
  } catch { /* 표·칸이 없는 옛 DB — 없는 것으로 본다(화면은 종전대로 D1 계산만) */ }

  const byName: Record<string, any> = {};
  const dupe = new Set<string>();
  for (const r of rows) {
    const k = normTeacherName(r.teacher_name);
    if (!k) continue;
    if (byName[k]) dupe.add(k); else byName[k] = r;
  }
  for (const k of dupe) delete byName[k];        // 같은 이름이 둘이면 잇지 않는다
  const matched = new Set<string>();

  return {
    rows,
    /** 명부 이름들(한글명·영문명) 중 하나라도 카페24 행과 이어지면 그 행을 준다. */
    find(...names: any[]): any | null {
      for (const n of names) {
        const k = normTeacherName(n);
        if (k && byName[k]) { matched.add(k); return byName[k]; }
      }
      return null;
    },
    /** 카페24에는 있는데 화면 명부와 못 이은 강사 — 화면이 «몇 명이 빠졌는지» 알려 줄 수 있게. */
    unmatched(): any[] {
      return Object.keys(byName).filter(k => !matched.has(k)).map(k => ({
        teacher_id: byName[k].teacher_id, teacher_name: byName[k].teacher_name,
        completed_classes: byName[k].completed_classes, pay_php: byName[k].pay_php,
      }));
    },
  };
}

/**
 * 🪧 «이 강사는 이번 달 길이를 채워야 한다» 를 화면이 알려 주기 위한 명단 (사장님 요청 C안).
 *
 *   급여 화면에서 「총 수업시간(분)」을 비워 두면 «전부 20분» 으로 계산된다. 20분만 가르친
 *   강사에게는 그게 정답이라 비워 두는 것이 맞다. 문제는 **30·40분을 가르친 강사만** 채워야
 *   하는데, 그걸 사람이 기억해야 한다는 점이다. 빠뜨리면 강사가 조용히 손해를 본다.
 *   그래서 «긴 수업을 가진 강사» 를 서버가 뽑아 화면에 표시한다.
 *
 *   ⚠️ class_schedules 는 깨끗한 표가 아니다. 실측(2026-08-18):
 *      · class_type='blocked' 100건 — 수업이 아니라 «근무 불가» 블록이다
 *      · source='lms_import_w26' 518건 — 옛 LMS 를 옮기며 길이를 60 으로 일괄로 박아 둔 것
 *      · source='type_seed_20260623' — 유형 시드 자료
 *      이것들을 그대로 세면 «전원 긴 수업 있음» 이 되어 경고가 의미를 잃는다(늑대소년).
 *      그래서 위 셋을 뺀다. 지금 이 조건의 결과는 0명이고, 그게 맞다 —
 *      30분 상품이 이제 막 열려서 아직 파는 중이기 때문이다.
 *   ⚠️ teacher_id 는 TEXT 인데 안에 숫자가 들어 있다(실측: '8','5'…). CAST 로 맞춘다.
 *   ⚠️ 이것은 «참고 표시» 일 뿐 급여의 근거가 아니다. 근거는 total_10min_units(사람) 또는
 *      카페24가 보낸 total_minutes 다. 여기서 나온 명단으로 금액을 계산하지 말 것.
 */
async function longClassTeacherIds(env: { DB: D1Database }): Promise<Set<number>> {
  const out = new Set<number>();
  try {
    const rs = await env.DB.prepare(
      `SELECT DISTINCT CAST(teacher_id AS INTEGER) AS tid
         FROM class_schedules
        WHERE status = 'active'
          AND duration_min > ?
          AND COALESCE(class_type, '') NOT IN ('blocked', 'level_test')
          AND COALESCE(source, '') NOT LIKE 'lms_import%'
          AND COALESCE(source, '') NOT LIKE 'type_seed%'`
    ).bind(DEFAULT_CLASS_MINUTES).all();
    for (const r of (rs.results || []) as any[]) {
      const n = Number(r.tid);
      if (n > 0) out.add(n);
    }
  } catch { /* 표가 없거나 칸이 없는 환경 — 명단 없음으로 (경고만 안 뜬다) */ }
  return out;
}

async function calcPayrollOne(env: { DB: D1Database }, teacherId: number, year: number, month: number): Promise<any> {
  const t: any = await env.DB.prepare(
    `SELECT id, name, status, years, rate_per_10min_php, hourly_rate_php, rank, center_id, active
     FROM teachers WHERE id = ?`
  ).bind(teacherId).first();
  if (!t) return { ok: false, error: 'teacher_not_found', teacher_id: teacherId };

  const cl: any = await env.DB.prepare(
    `SELECT class_count, total_10min_units, notes FROM teacher_monthly_classes
     WHERE teacher_id = ? AND year = ? AND month = ?`
  ).bind(teacherId, year, month).first();
  const classCount = cl ? Number(cl.class_count) : 0;

  /* 🕐 (2026-08-18) 길이의 출처를 «셋 중 하나» 로 정리한다. 위에서부터 이긴다.
       ① manual  — 사람이 급여 화면에 넣은 total_10min_units. 사람이 명시한 값이므로 가장 세다.
       ② ingest  — 카페24가 매달 보내 주는 teacher_payroll_auto.total_minutes (사장님 요청 A안).
                   이것이 들어오면 «급여 담당자가 손으로 넣는 일» 자체가 없어진다.
       ③ assumed — 둘 다 없으면 예전 규칙(전부 20분 = class_count × 2).
     ⚠️ ①이 ②를 이기는 순서를 뒤집지 말 것 — 사람이 카페24 값을 고치려고 넣었는데
        다음 인제스트가 덮으면 «고쳤는데 원복됐다» 가 된다. */
  let tenMinUnits = classCount * classTenMinUnits(DEFAULT_CLASS_MINUTES);
  let lengthSource: 'manual' | 'ingest' | 'assumed_20min' = 'assumed_20min';
  if (cl && Number(cl.total_10min_units) > 0) {
    tenMinUnits = Number(cl.total_10min_units);
    lengthSource = 'manual';
  } else {
    let ing: any = null;
    try {
      /* ⛔ 여기서 teacher_id 로 조회하면 안 된다 — teacher_payroll_auto 의 번호는 카페24 번호라
         우리 teachers.id 와 겹치는 구간에서 **다른 사람**을 가리킨다(위 loadCafe24PayrollMonth
         주석의 실측 참고). 2026-08-18 에 번호 조회로 넣었다가 같은 날 바로잡았다.
         지금까지 사고가 안 난 이유는 total_minutes 가 아직 전부 NULL 이라 결과가 없었기 때문이고,
         카페24 가 분을 보내기 시작하는 순간 남의 분으로 급여가 나갔을 자리다. */
      const c24 = await loadCafe24PayrollMonth(env, year, month);
      ing = c24.find(t.name);
    } catch { /* 칸이 아직 없는 옛 DB — 종전대로 ③ */ }
    if (ing && Number(ing.total_minutes) > 0) {
      tenMinUnits = Number(ing.total_minutes) / 10;
      lengthSource = 'ingest';
    }
  }
  // 화면이 «전부 20분으로 가정한 달» 을 구분해 경고할 수 있게 남긴다(①②면 true).
  const lengthRecorded = lengthSource !== 'assumed_20min';

  const ev: any = await env.DB.prepare(
    `SELECT score_instruction, score_retention, score_punctuality, score_admin, score_contribution,
            weighted_total, grade, strengths, improvements, evaluator, evaluated_at
     FROM teacher_evaluations WHERE teacher_id = ? AND year = ? AND month = ?`
  ).bind(teacherId, year, month).first();

  const rate = Number(t.rate_per_10min_php || 0);
  const monthlySalary = Math.round(tenMinUnits * rate * 100) / 100;
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
    total_10min_units: tenMinUnits,      // 급여 근거 — 20분만이면 class_count×2 와 같다
    total_minutes: Math.round(tenMinUnits * 10),
    // false = 그 달의 실제 길이가 입력된 적이 없어 «전부 20분» 으로 계산했다는 뜻.
    // 화면이 이걸 구분해 보여 줘야 30분 수업을 20분 값으로 지급하는 사고를 눈치챌 수 있다.
    length_recorded: lengthRecorded,
    // 'manual'(사람 입력) · 'ingest'(카페24가 보낸 분) · 'assumed_20min'(전부 20분으로 가정)
    length_source: lengthSource,
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

/* 🙈 (2026-08-13) MES 숨김 씨앗을 «이 아이솔레이트에서 이미 확인했는가».
   숨김 목록은 강사가 교재를 열 때마다(공개 라이브러리) 읽히는 뜨거운 길이다.
   플래그 확인 SELECT 를 매 요청 돌리지 않게 여기서 한 번만 본다.
   ⚠️ 이건 «했다» 의 정본이 아니다 — 정본은 DB 의 payroll_meta 플래그다.
      아이솔레이트가 새로 뜨면 한 번 더 확인하고, 이미 돼 있으면 그대로 지나간다. */
let _mesHiddenSeedChecked = false;

export async function handleAdminApi(
  request: Request,
  url: URL,
  env: MangoEnv,
  ctx?: ExecutionContext   // 📚 교재 /raw 엣지 캐시(waitUntil) 전달용 — 선택적(하위호환)
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ════════════════════════════════════════════════════════════
    // 💬 강사 카카오ID 명부 + 강사에게 메시지 전달 (2026-08-13)
    //   ⚠️ 이 위임은 «/api/admin/teachers/:id» PATCH 보다 먼저 와야 한다 —
    //      아래 라우팅은 숫자 id 만 받으므로 'kakao' 와는 겹치지 않지만,
    //      순서를 바꾸면 나중에 와일드카드가 생겼을 때 조용히 가려진다.
    // ════════════════════════════════════════════════════════════
    if (path.startsWith('/api/admin/teachers/kakao')) {
      const r = await handleTeacherKakaoApi(request, url, env as any);
      if (r) return r;
    }

    // ════════════════════════════════════════════════════════════
    // 📶 화상수업 회선품질 — 강사/학생별 손실·RTT 집계 (어느 강사 인터넷이 나쁜지 파악)
    // ════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/vc/quality') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS vc_quality (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, room TEXT, uid TEXT, name TEXT, role TEXT, avg_loss REAL, max_loss REAL, avg_rtt REAL, aao INTEGER, samples INTEGER)`);
        /* 📶 (2026-08-30) live=1 — «지금 이 방» 의 회선 신호. 수업 관제탑이 방마다 신호등으로 그린다.
           [왜 방 단위인가] 위 기본 집계는 «어느 강사 인터넷이 나쁜가»(uid·7일)를 보는 눈이고,
              관제탑은 «지금 이 수업이 흔들리고 있나»(room·최근 몇 분)를 봐야 한다. 같은 표에서
              묶는 축만 다르다 — 새 표를 만들지 않는다.
           ⚠️ avg_loss 가 음수인 행은 «영상이 없던 틱»(loss = -1 로 넘어온 것)이라 평균에서 뺀다.
              넣으면 영상이 죽은 사람이 «회선이 제일 좋은 사람» 으로 뒤집힌다(CLAUDE.md 2장).
           ⚠️ novideo 칸은 ALTER 로 나중에 붙은 것이라 첫 로그 전에는 없다 — 여기서 읽지 않는다. */
        if (url.searchParams.get('live') === '1') {
          const mins = Math.max(1, Math.min(60, parseInt(url.searchParams.get('mins') || '5', 10) || 5));
          const liveSince = Date.now() - mins * 60000;
          const lr: any = await env.DB.prepare(
            `SELECT room, COUNT(*) AS windows,
                    ROUND(AVG(avg_loss), 1) AS avg_loss, ROUND(MAX(max_loss), 1) AS worst_loss,
                    ROUND(AVG(avg_rtt)) AS avg_rtt, MAX(ts) AS last_ts
               FROM vc_quality
              WHERE ts >= ? AND room IS NOT NULL AND room <> '' AND avg_loss >= 0
              GROUP BY room ORDER BY avg_loss DESC LIMIT 200`
          ).bind(liveSince).all();
          return json({ ok: true, mins, rooms: lr.results || [] });
        }
        const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get('days') || '7', 10) || 7));
        const since = Date.now() - days * 86400000;
        const rs: any = await env.DB.prepare(
          `SELECT uid, MAX(name) AS name, role, COUNT(*) AS windows,
                  ROUND(AVG(avg_loss), 1) AS avg_loss, ROUND(MAX(max_loss), 1) AS worst_loss,
                  ROUND(AVG(avg_rtt)) AS avg_rtt, SUM(aao) AS aao_events, MAX(ts) AS last_seen
           FROM vc_quality WHERE ts >= ? GROUP BY uid, role ORDER BY avg_loss DESC LIMIT 200`
        ).bind(since).all();
        return json({ ok: true, days, rows: rs.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'vc_quality_failed' }, 500); }
    }

    // ════════════════════════════════════════════════════════════
    // 🔁 화상수업 «중계(TURN) 강제» — 강사별 on/off
    //   GET  /api/admin/vc/relay            → 지정된 강사 목록
    //   POST /api/admin/vc/relay {teacher_id, enabled, note}
    //
    //   [무엇을 하는 설정인가] 지금은 직접(P2P) 연결이 **실패해야** 릴레이로 넘어간다.
    //   중국 회선처럼 «연결은 되는데 패킷만 흘리는» 경우엔 그 조건에 안 걸려 영영 직접 경로를 쓴다.
    //   여기서 켜 두면 그 강사 수업은 처음부터 Cloudflare TURN 으로 붙는다.
    //   전달 경로는 /api/class/sessions/today 의 net_relay (학생·교사가 같은 값을 받는다).
    //
    //   ⚠️ 켜면 전송량 과금이 늘고 홉이 하나 늘어 RTT 가 조금 오른다. 회선이 나쁜 강사에게만 쓸 것.
    //   ⚠️ 강사 번호는 class_schedules.teacher_id( = teachers.id ) 도메인이다. 카페24 번호가 아니다.
    // ════════════════════════════════════════════════════════════
    if (path === '/api/admin/vc/relay' && (method === 'GET' || method === 'POST')) {
      /* 🔐 강사 전면 차단 — canEditOrg() 는 강사를 «못 막는다»(scope.type==='none' 에 true).
         CLAUDE.md 2장 「관리자 쓰기 API 를 본사 전용으로 막았는데 강사가 그대로 실행됨」. */
      const _vrActor = await getAdminActor(request, env as any);
      if (_vrActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS vc_relay_force (teacher_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, note TEXT, updated_at INTEGER, updated_by TEXT)`);
        if (method === 'GET') {
          const rs: any = await env.DB.prepare(
            `SELECT r.teacher_id, r.enabled, r.note, r.updated_at, r.updated_by, t.name AS teacher_name
             FROM vc_relay_force r LEFT JOIN teachers t ON CAST(t.id AS TEXT) = r.teacher_id
             ORDER BY r.updated_at DESC LIMIT 200`
          ).all();
          return json({ ok: true, rows: rs.results || [] });
        }
        const body: any = await request.json().catch(() => ({}));
        const tid = String(body?.teacher_id ?? '').trim();
        if (!tid || !/^\d+$/.test(tid)) return json({ ok: false, error: 'teacher_id_required' }, 400);
        const on = (body?.enabled === true || body?.enabled === 1 || body?.enabled === '1') ? 1 : 0;
        const note = String(body?.note ?? '').slice(0, 200) || null;
        await env.DB.prepare(
          `INSERT INTO vc_relay_force (teacher_id, enabled, note, updated_at, updated_by) VALUES (?,?,?,?,?)
           ON CONFLICT(teacher_id) DO UPDATE SET enabled=excluded.enabled, note=excluded.note,
             updated_at=excluded.updated_at, updated_by=excluded.updated_by`
        ).bind(tid, on, note, Date.now(), _vrActor?.name || 'admin').run();
        return json({ ok: true, teacher_id: tid, enabled: on });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'vc_relay_failed' }, 500); }
    }

    // ════════════════════════════════════════════════════════════
    // 💵 Phase 15 — 매출 / 학생 흐름 통계
    //   GET /api/admin/stats/revenue?period=day|month|quarter|half|year&from=YYYY-MM-DD&to=YYYY-MM-DD
    //     · student_payments 테이블 기준 (status='paid' 만 합산)
    //     · period 별 그룹핑 (날짜·연월·연-Q1~Q4·연-1H/2H·연도)
    //   GET /api/admin/stats/student-flow?from=&to=
    //     · students_erp 의 signup_date / end_date 기준
    //     · 일자별 신규(new), 탈락(dropped), 활성(active) 카운트
    // ════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════
    // 📊 강사 가동률 (Teacher Utilization) — 2026-08-04 신규
    //   GET /api/admin/stats/teacher-utilization
    //
    //   왜 —
    //     화상수업 사업의 원가는 결국 «강사 시간» 이다. 강사 수·수업 수는 이미 보이지만
    //     "열어둔 시간 중 실제로 얼마나 찼는가" 가 없어서 강사를 더 뽑을지 줄일지 판단할
    //     근거가 없었다. 해외 튜터링 관리 제품이 관리자 지표 1순위로 꼽는 값이다.
    //
    //   정의 (임의 상수를 쓰지 않고 실제 데이터에서 끌어낸다) —
    //     · 운영시간대 = 지금 잡혀 있는 정기수업들의 «가장 이른 시작 ~ 가장 늦은 종료»
    //       (수업이 하나도 없으면 06:00~23:00 으로만 대체)
    //     · 가능시간  = 7일 × 운영시간대 − 그 강사가 등록한 주간 근무불가(teacher_unavailability.kind='weekly')
    //     · 배정시간  = 그 강사의 활성 정기수업 duration 합계
    //     · 가동률    = 배정시간 ÷ 가능시간
    //   ※ 일회성(one_off) 수업은 주간 반복 지표를 왜곡하므로 제외한다.
    // ═══════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════
    // 🎚️ GET /api/admin/stats/judgment-bands — 판단력 훈련 읽기 난이도 분포·적중도
    //   ⚠️ 담당 밖(B) 이 추가한 핸들러입니다 — CLAUDE.md 4-2. 기존 코드는 건드리지 않고
    //      이 블록만 덧붙였습니다. 옮기거나 지우셔도 판단력 기능 자체는 영향받지 않습니다.
    //
    //   이 수치가 이 기능의 유일한 성공 지표입니다. 밴드별 정답률이 목표 85%
    //   (Wilson et al., Nature Comm. 2019 — 학습이 가장 빠른 지점)에서 얼마나 벗어났는지 봅니다.
    //     · 85% 보다 훨씬 높다 → 그 밴드가 너무 쉽다(문장 기준을 올릴 것)
    //     · 85% 보다 훨씬 낮다 → 너무 어렵다(내릴 것)
    //   원천은 judgment_analysis.reasoning_features_json.reading_band — 새 테이블 없음.
    //   ⚠️ 표본이 적으면 정답률은 의미가 없습니다. 그래서 n 을 반드시 함께 내려보냅니다.
    // ═══════════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/stats/judgment-bands') {
      try {
        const rs = await env.DB.prepare(
          `SELECT CAST(json_extract(reasoning_features_json,'$.reading_band') AS INTEGER) AS band,
                  COUNT(*) AS n,
                  ROUND(AVG(is_optimal) * 100, 1) AS pct_correct,
                  COUNT(DISTINCT student_uid) AS students
             FROM judgment_analysis
            WHERE json_extract(reasoning_features_json,'$.reading_band') IS NOT NULL
            GROUP BY band ORDER BY band`
        ).all<any>();
        const rows = (rs.results || []).map((r: any) => ({
          band: Number(r.band), n: Number(r.n) || 0,
          pct_correct: r.pct_correct == null ? null : Number(r.pct_correct),
          students: Number(r.students) || 0,
          // 목표에서 얼마나 떨어졌는지 — 부호까지 봐야 올릴지 내릴지 판단할 수 있습니다
          off_target: r.pct_correct == null ? null : Math.round((Number(r.pct_correct) - 85) * 10) / 10,
        }));
        const total = rows.reduce((s, r) => s + r.n, 0);
        return json({
          ok: true, target_pct: 85, total, bands: rows,
          // 표본이 적을 때 정답률을 근거로 쓰지 않도록 화면에 경고 문구를 띄우기 위한 신호
          enough_data: total >= 100,
          note_ko: total >= 100 ? null : '표본이 적어 정답률은 아직 참고용입니다.',
          note_en: total >= 100 ? null : 'Sample is small — accuracy is indicative only.',
        });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/stats/teacher-utilization') {
      try {
        const toMin = (hhmm: any) => {
          const [h, m] = String(hhmm || '00:00').split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };
        const dowsOf = (v: any): number[] => {
          const out: number[] = [];
          for (const p of String(v ?? '').split(/[,\s]+/)) {
            const q = p.trim(); if (!q) continue;
            const n = /^\d$/.test(q) ? Number(q) : ({ sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as any)[q.toLowerCase()];
            if (n != null && n >= 0 && n <= 6 && !out.includes(n)) out.push(n);
          }
          return out;
        };

        const safeAll = async (sql: string, ...b: any[]): Promise<any[]> => {
          try { const rs = await env.DB.prepare(sql).bind(...b).all<any>(); return rs.results || []; }
          catch { return []; }
        };

        const [scheds, teachers, blocks] = await Promise.all([
          /* 🧹 (2026-08-30) LMS·시드 «자리표시» 행 제외 — 학생이 안 붙은 점유 행이라 진짜 수업이 아니다.
             같은 제외식이 schedule-conflict.ts·api-teacher.ts·churn-graph.ts·enroll-ops.ts 에도 있다
             (CLAUDE.md 2장 「주간 스케줄에서 어떤 요일만 수업이 안 들어감」). 다섯 곳의 문자열을 맞춰 둔다. */
          safeAll(`SELECT teacher_id, day_of_week, start_time, duration_min FROM class_schedules
                    WHERE status = 'active' AND schedule_kind = 'recurring' AND teacher_id IS NOT NULL AND teacher_id <> ''
                      AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`),
          safeAll(`SELECT id, name, COALESCE(active, 1) AS active FROM teachers`),
          safeAll(`SELECT teacher_id, day_of_week, start_time, end_time FROM teacher_unavailability WHERE kind = 'weekly'`),
        ]);

        // ── 운영시간대: 실제 잡힌 수업에서 관측 (없으면 06:00~23:00)
        let openMin = 24 * 60, closeMin = 0;
        for (const s of scheds) {
          const st = toMin(s.start_time);
          const en = st + (Number(s.duration_min) > 0 ? Number(s.duration_min) : DEFAULT_CLASS_MINUTES);
          if (st < openMin) openMin = st;
          if (en > closeMin) closeMin = en;
        }
        if (!scheds.length || closeMin <= openMin) { openMin = 6 * 60; closeMin = 23 * 60; }
        const windowPerDay = closeMin - openMin;

        const nameById = new Map<string, string>();
        for (const t of teachers) nameById.set(String(t.id), String(t.name || ''));

        // ── 강사별 집계
        type Agg = { assigned: number; classes: number; blocked: number; byDow: number[] };
        const agg = new Map<string, Agg>();
        const ensure = (id: string): Agg => {
          if (!agg.has(id)) agg.set(id, { assigned: 0, classes: 0, blocked: 0, byDow: [0, 0, 0, 0, 0, 0, 0] });
          return agg.get(id)!;
        };

        /* 🔴 (2026-08-30 v4 제안서 13) 예전에는 agg 가 «class_schedules 에 나온 강사» 로만 채워져,
           수업이 한 건도 안 잡힌 강사는 목록에서 **통째로 사라졌다.** 그게 「전체 강사가 안 나온다」의
           정체다 — 2026-08-30 운영 D1 실측: 활성 강사 **29명**인데 활성 정기수업에 나오는 강사는 **1명**.
           즉 화면에 한 줄만 떴다. 가동률 0% 인 강사야말로 이 지표로 봐야 할 사람이다.
           ⟹ 먼저 «활성 강사 전원» 을 0으로 깔고, 그 위에 배정을 더한다.
           ⚠️ 퇴사자(active=0)는 넣지 않는다 — 그건 «전수» 가 아니라 «과거» 다. */
        for (const t of teachers) {
          if (Number(t.active) === 0) continue;
          ensure(String(t.id));
        }

        for (const s of scheds) {
          const id = String(s.teacher_id);
          const dur = Number(s.duration_min) > 0 ? Number(s.duration_min) : DEFAULT_CLASS_MINUTES;
          const a = ensure(id);
          const dows = dowsOf(s.day_of_week);
          // 반복 수업은 «요일당 1행» 이 원칙이지만, 한 행에 여러 요일이 담긴 과거 데이터도 있어 요일 수만큼 센다
          const n = dows.length || 1;
          a.assigned += dur * n;
          a.classes += n;
          for (const d of dows) a.byDow[d] += dur;
        }

        for (const b of blocks) {
          const id = String(b.teacher_id || '');
          if (!id) continue;
          const bs = Math.max(openMin, b.start_time ? toMin(b.start_time) : openMin);
          const be = Math.min(closeMin, b.end_time ? toMin(b.end_time) : closeMin);
          if (be <= bs) continue;
          const dows = dowsOf(b.day_of_week);
          ensure(id).blocked += (be - bs) * (dows.length || 1);
        }

        const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
        const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const rows = [...agg.entries()].map(([id, a]) => {
          const available = Math.max(0, windowPerDay * 7 - a.blocked);
          const util = available > 0 ? Math.round((a.assigned / available) * 1000) / 10 : null;
          let top = 0;
          for (let i = 1; i < 7; i++) if (a.byDow[i] > a.byDow[top]) top = i;
          return {
            teacher_id: id,
            name: nameById.get(id) || ('#' + id),
            assigned_min: a.assigned,
            blocked_min: a.blocked,
            available_min: available,
            utilization_pct: util,             // null = 가능시간 0 (전부 근무불가로 막힘)
            class_count: a.classes,
            busiest_dow: a.byDow[top] > 0 ? top : null,
            busiest_dow_ko: a.byDow[top] > 0 ? DOW_KO[top] : null,
            busiest_dow_en: a.byDow[top] > 0 ? DOW_EN[top] : null,
          };
        }).sort((x, y) => ((y.utilization_pct ?? -1) - (x.utilization_pct ?? -1))
                      || String(x.name).localeCompare(String(y.name)));

        const withUtil = rows.filter(r => r.utilization_pct != null);
        const totalAssigned = rows.reduce((s, r) => s + r.assigned_min, 0);
        const totalAvailable = rows.reduce((s, r) => s + r.available_min, 0);

        const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
        return json({
          ok: true,
          window: { open: hhmm(openMin), close: hhmm(closeMin), per_day_min: windowPerDay, days_per_week: 7 },
          summary: {
            teacher_count: rows.length,
            avg_utilization_pct: withUtil.length
              ? Math.round((withUtil.reduce((s, r) => s + (r.utilization_pct || 0), 0) / withUtil.length) * 10) / 10
              : null,
            overall_utilization_pct: totalAvailable > 0 ? Math.round((totalAssigned / totalAvailable) * 1000) / 10 : null,
            total_assigned_min: totalAssigned,
            total_available_min: totalAvailable,
            observed_from_schedules: scheds.length > 0,
          },
          teachers: rows,
          note: '가동률 = 주간 배정 수업시간 ÷ (운영시간대 7일 − 강사가 등록한 주간 근무불가). 일회성 수업과 LMS·시드 자리표시는 제외하고, 활성 강사는 수업이 없어도 0%로 함께 표시합니다.',
          note_en: 'Utilization = weekly assigned class minutes ÷ (operating window × 7 days − the teacher\'s weekly unavailability). One-off classes and LMS/seed placeholders are excluded; active teachers with no class are listed at 0%.',
        });
      } catch (e: any) {
        return json({ ok: false, error: 'utilization_failed', message: String(e?.message || e).slice(0, 300) }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🪑 대기자 명단 (Waitlist) — 2026-08-04 신규
    //   GET  /api/admin/stats/waitlist            목록 + 희망시간에 «여유 있는 강사» 자동 매칭
    //   POST /api/admin/stats/waitlist            {action:'add'|'resolve'|'cancel', ...}
    //
    //   왜 —
    //     지금은 원하는 시간에 자리가 없으면 상담이 그대로 끝난다. 이미 관심을 보인 고객이라
    //     신규 광고보다 회수 단가가 훨씬 싸다. 줄을 세워두고 자리가 나면 연락하기 위한 최소 기능.
    //
    //   ⚠️ 경로가 /stats/ 아래인 이유 —
    //     새 API 경로는 src/index.ts 의 라우팅 게이트 + 인증 게이트 «두 곳» 에 등록해야 동작하는데
    //     index.ts 는 공동 금지구역이다. '/api/admin/stats/' 는 두 게이트에 이미 열려 있어
    //     금지구역을 건드리지 않고 안전하게 붙일 수 있는 유일한 접두사였다.
    //     (index.ts 를 열 수 있게 되면 /api/admin/waitlist 로 옮기는 편이 이름에 맞다)
    // ═══════════════════════════════════════════════════════════════════
    if (path === '/api/admin/stats/waitlist' && (method === 'GET' || method === 'POST')) {
      const WL_DDL = `CREATE TABLE IF NOT EXISTS class_waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT, student_name TEXT, phone TEXT, uid TEXT,
        teacher_pref TEXT, day_pref TEXT, time_pref TEXT, note TEXT,
        status TEXT NOT NULL DEFAULT 'waiting', created_at INTEGER NOT NULL,
        created_by TEXT, resolved_at INTEGER, resolved_by TEXT)`;
      try { await env.DB.exec(WL_DDL.replace(/\s+/g, ' ')); } catch { }
      /* ⚠️ shop_name·franchise 를 위 CREATE 에 **일부러 안 넣었다.**
           CREATE TABLE IF NOT EXISTS 는 표가 이미 있으면 아무것도 안 한다 —
           운영 표에는 그 칸이 안 생기는데 코드만 «있다» 고 적히면 서로 어긋난다
           (schema_drift_harness 가 바로 이걸 잡는다). 이 파일의 teachers·payslips 도
           나중에 생긴 칸은 전부 아래 ALTER 쪽에만 있다. 같은 방식을 따른다. */
      /* 🔒 (2026-08-17 사장님) 대기자도 지사·대리점끼리 격리한다.
           연기·변경 요청을 막고 나서 보니 **대기자만 안 막혀 있었다** — 강남점 원장님이
           서초점·부산지사 대기자 이름과 전화번호까지 그대로 봤다(2026-08-04 신설 이래).

         ⚠️ class_waitlist 에는 소속 칸이 아예 없었다. 그래서 칸을 두 개 새로 만든다.
            이미 있으면 ALTER 가 던지고, 그건 정상이라 삼킨다(이 파일의 기존 방식과 같다).
            **칸을 더하기만 한다 — 기존 행의 값은 건드리지 않는다.**

         ⚠️ 칸 이름을 students_erp 와 **똑같이** shop_name · franchise 로 맞췄다.
            그래야 공용 scopeStudentCond() 가 만든 조건을 이 표에 **그대로** 쓸 수 있다.
            이름을 다르게 지으면 격리 로직을 한 벌 더 쓰게 되고, 한쪽만 고쳐 어긋난다. */
      for (const sql of [`ALTER TABLE class_waitlist ADD COLUMN shop_name TEXT`,
                         `ALTER TABLE class_waitlist ADD COLUMN franchise TEXT`]) {
        try { await env.DB.exec(sql); } catch { }
      }

      /* 누가 어디까지 보는가 —
           본사(hq)·내부직원(none) : 조건이 빈 문자열 → **동작이 하나도 안 바뀐다.**
           대리점(agency)          : shop_name 이 자기 대리점인 것
           지사(branch)            : franchise 가 자기 지역으로 시작하는 것
           지사본사(franchise)     : 자기 소유 지사들

         ⚠️ 옛 행에는 이 칸이 비어 있다(이 변경 이전에 넣은 것). 비었으면 **안 보인다** —
            연기·변경 요청과 같은 «막는 쪽으로 실패» 원칙이다. 다만 그러면 원장님이
            직접 넣어 둔 대기자까지 사라지므로, **created_by 가 나인 행은 계속 보인다.**
            내가 넣은 것을 내가 보는 것이라 새는 것이 없고, 옛 자료도 안 잃는다.
         ⚠️ uid → students_erp 로 잇는 길은 **일부러 안 썼다.** 대기자는 아직 등록 전
            학생이라 uid 가 거의 비어 있어 얻는 것이 적은데, 조건이 두 벌이 되면
            지사본사(지사 80개)에서 바인드가 100개를 넘어 조용히 빈 결과가 된다. */
      const _wlScope = await getScope(env as any, request);
      const _wlC = scopeStudentCond(_wlScope);
      const _wlActor = await getAdminActor(request, env as any);
      const _wlOwn = String(_wlActor?.name || '');
      // 조건 + 바인드를 한 번에 만든다 — 목록·개수·수정이 **같은 것**을 쓰게 하기 위해서다
      const _wlCond = _wlC.cond ? `(${_wlC.cond} OR created_by = ?)` : '';
      const _wlBinds = _wlC.cond ? [..._wlC.binds, _wlOwn] : [];

      if (method === 'POST') {
        const body: any = await parseJsonBody(request) ?? {};
        const action = String(body.action || 'add').toLowerCase();
        let actor = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name) actor = a.name; } catch { }

        if (action === 'add') {
          const name = String(body.student_name || '').trim();
          if (!name) return json({ ok: false, error: 'name_required', message: '학생 이름을 입력해 주세요.', message_en: 'Student name is required.' }, 400);
          /* 넣을 때 소속을 찍는다 — 안 찍으면 아무에게도 안 보이는 행이 된다.
               대리점이 넣으면 그 대리점 + **그 대리점이 속한 지사**까지 찍는다.
               지사 칸을 같이 안 찍으면 지사 원장님은 산하 대리점이 넣은 대기자를 못 본다.
             ⚠️ 본사(hq)가 넣은 것은 비워 둔다 — 본사는 전체를 보므로 막힐 일이 없고,
                엉뚱한 대리점 이름을 찍으면 그 대리점 자료로 굳어 버린다. */
          let wShop: string | null = null, wFran: string | null = null;
          if (_wlScope.type === 'agency' && _wlScope.value) {
            wShop = _wlScope.value;
            const f = await env.DB.prepare(`SELECT franchise FROM students_erp WHERE shop_name = ? AND franchise IS NOT NULL AND franchise <> '' LIMIT 1`)
              .bind(wShop).first<{ franchise: string }>().catch(() => null);
            wFran = f?.franchise || null;
          } else if (_wlScope.type === 'branch' && _wlScope.value) {
            wFran = _wlScope.value;
          }
          try {
            const ins = await env.DB.prepare(
              `INSERT INTO class_waitlist (student_name, phone, uid, teacher_pref, day_pref, time_pref, note, status, created_at, created_by, shop_name, franchise)
               VALUES (?,?,?,?,?,?,?,'waiting',?,?,?,?)`
            ).bind(name, String(body.phone || '').trim() || null, String(body.uid || '').trim() || null,
              String(body.teacher_pref || '').trim() || null, String(body.day_pref ?? '').trim() || null,
              String(body.time_pref || '').trim() || null, String(body.note || '').trim() || null,
              Date.now(), actor, wShop, wFran).run();
            return json({ ok: true, id: (ins?.meta?.last_row_id as number) ?? null });
          } catch (e: any) {
            return json({ ok: false, error: 'insert_failed', message: String(e?.message || e).slice(0, 200) }, 500);
          }
        }

        if (action === 'resolve' || action === 'cancel') {
          const id = Number(body.id);
          if (!Number.isFinite(id)) return json({ ok: false, error: 'id_required' }, 400);
          /* 🔒 처리(등록완료·취소)도 **자기 대기자만.** 목록을 막아도 여기를 안 막으면
                id 만 바꿔 넣어 남의 대리점 대기자를 취소할 수 있다(연기·변경 /decide 와 같은 구멍).
                목록과 **똑같은 조건**을 쓴다 — 한쪽만 고쳐서 어긋나는 것을 막으려고 위에서 한 번만 만들었다. */
          try {
            const upd: any = await env.DB.prepare(
              `UPDATE class_waitlist SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?`
              + (_wlCond ? ` AND ${_wlCond}` : '')
            ).bind(action === 'resolve' ? 'enrolled' : 'cancelled', Date.now(), actor, id, ..._wlBinds).run();
            // 한 줄도 안 바뀌었다 = 내 대기자가 아니거나 없는 id. «없다» 와 «남의 것» 을 구분해 알려주지 않는다.
            if (_wlCond && !(upd?.meta?.changes > 0)) {
              return json({ ok: false, error: 'forbidden_scope', message: '이 대기자를 처리할 권한이 없습니다.', message_en: 'Not allowed for this waitlist entry.' }, 403);
            }
            return json({ ok: true });
          } catch (e: any) {
            return json({ ok: false, error: 'update_failed', message: String(e?.message || e).slice(0, 200) }, 500);
          }
        }
        return json({ ok: false, error: 'unknown_action', message: '알 수 없는 요청입니다.', message_en: 'Unknown action.' }, 400);
      }

      // ── GET: 목록 + «희망 시간에 여유 있는 강사» 자동 매칭 ──
      try {
        const status = String(url.searchParams.get('status') || 'waiting');
        const wConds: string[] = []; const wBinds: any[] = [];
        if (status !== 'all') { wConds.push('status = ?'); wBinds.push(status); }
        if (_wlCond) { wConds.push(_wlCond); wBinds.push(..._wlBinds); }
        const wWhere = wConds.length ? ('WHERE ' + wConds.join(' AND ')) : '';
        const list = (await env.DB.prepare(
          `SELECT * FROM class_waitlist ${wWhere} ORDER BY created_at DESC LIMIT 300`
        ).bind(...wBinds).all<any>()).results || [];

        const toMin2 = (hhmm: any) => { const [h, m] = String(hhmm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
        const dow1 = (v: any): number | null => {
          const q = String(v ?? '').trim();
          if (/^\d$/.test(q)) return Number(q);
          const n = ({ sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as any)[q.toLowerCase()];
          return n == null ? null : n;
        };
        const safeAll2 = async (sql: string): Promise<any[]> => {
          try { const r = await env.DB.prepare(sql).all<any>(); return r.results || []; } catch { return []; }
        };
        const [teachers, scheds, blocks] = await Promise.all([
          safeAll2(`SELECT id, name FROM teachers`),
          safeAll2(`SELECT teacher_id, day_of_week, start_time, duration_min FROM class_schedules
                     WHERE status='active' AND schedule_kind='recurring' AND teacher_id IS NOT NULL AND teacher_id <> ''`),
          safeAll2(`SELECT teacher_id, day_of_week, start_time, end_time FROM teacher_unavailability WHERE kind='weekly'`),
        ]);

        // 희망 요일·시간이 적힌 대기자에 한해, 그 시간이 비어 있는 강사를 계산해 붙인다.
        const withMatch = list.map((w: any) => {
          const d = dow1(w.day_pref);
          const t = String(w.time_pref || '').trim();
          if (d == null || !/^\d{1,2}:\d{2}$/.test(t)) return { ...w, free_teachers: null };
          const s = toMin2(t), e = s + DEFAULT_CLASS_MINUTES;
          const busy = new Set<string>();
          for (const r of scheds) {
            const rd = String(r.day_of_week ?? '').split(/[,\s]+/).map(dow1);
            if (!rd.includes(d)) continue;
            const rs2 = toMin2(r.start_time);
            const re2 = rs2 + (Number(r.duration_min) > 0 ? Number(r.duration_min) : DEFAULT_CLASS_MINUTES);
            if (s < re2 && rs2 < e) busy.add(String(r.teacher_id));
          }
          for (const b of blocks) {
            if (dow1(b.day_of_week) !== d) continue;
            const bs = b.start_time ? toMin2(b.start_time) : 0;
            const be = b.end_time ? toMin2(b.end_time) : 24 * 60;
            if (s < be && bs < e) busy.add(String(b.teacher_id));
          }
          const free = teachers.filter(x => !busy.has(String(x.id))).map(x => ({ id: String(x.id), name: String(x.name || '') }));
          return { ...w, free_teachers: free.slice(0, 8), free_teacher_count: free.length };
        });

        let counts: any = {};
        try {
          // 개수도 같은 조건으로 — 목록은 3명인데 «대기 40명» 이 뜨면 그게 곧 남의 자료를 알려 주는 것이다
          const c = await env.DB.prepare(
            `SELECT status, COUNT(*) AS n FROM class_waitlist ${_wlCond ? 'WHERE ' + _wlCond : ''} GROUP BY status`
          ).bind(..._wlBinds).all<any>();
          for (const r of (c.results || [])) counts[String(r.status)] = Number(r.n) || 0;
        } catch { }

        return json({
          ok: true, rows: withMatch, counts,
          note: '희망 요일·시간이 적힌 대기자는 그 시간에 수업이 없고 근무불가도 아닌 강사를 «지금 배정 가능» 으로 표시합니다.',
          note_en: 'For entries with a preferred weekday and time, teachers with no class and no block at that slot are shown as immediately assignable.',
        });
      } catch (e: any) {
        return json({ ok: false, error: 'waitlist_failed', message: String(e?.message || e).slice(0, 300) }, 500);
      }
    }

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

      // ⚡ KV 캐시(60초, 스코프 격리) — 페이지 진입마다 4쿼리+CREATE 3회 재실행 방지
      const _tf = await scopeFragments(env, request);
      const _tKey = 'admtoday:' + new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10)
                  + ':' + (_tf.erpScope || 'all') + '|' + _tf.binds.join(',');
      const _tHit = await admCacheHit(env, _tKey);
      if (_tHit) return _tHit;

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
      const _sf = _tf;   // 위 캐시 키 계산에서 이미 조회 — 재호출 낭비 방지
      const _uidScope = _sf.uidScope, _erpScope = _sf.erpScope, _sb = _sf.binds;

      const [revRow, attRow, activeRow, signupRow, schedRow] = await Promise.all([
        safe(() => env.DB.prepare(
          `SELECT COALESCE(SUM(amount_krw), 0) AS revenue, COUNT(*) AS pay_count
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL AND ${notSeedSql()}
             AND paid_at >= ? AND paid_at < ?${_uidScope}`
        ).bind(startMs, endMs, ..._sb).first<{ revenue: number; pay_count: number }>(),
        { revenue: 0, pay_count: 0 } as any),

        safe(() => env.DB.prepare(
          // 🪤 (2026-08-08) 예전엔 status 를 안 보고 **그날의 모든 행**을 셌다.
          //    attendance 에는 «예정(scheduled)» 행도 함께 들어온다(카페24 동기화).
          //    그래서 「오늘 출석 8명」이 사실은 «예정 7 + 실제출석 1» 이었다.
          //    실측 08-07: 모든 행 190 · 실제 출석 125 · 예정 92.
          `SELECT COUNT(DISTINCT user_id) AS attended
           FROM attendance
           WHERE date = ? AND status IN ('present','left','attended')${_uidScope}`
        ).bind(todayKst, ..._sb).first<{ attended: number }>(),
        { attended: 0 } as any),

        safe(() => env.DB.prepare(
          // 🧮 (2026-08-08) status 를 함께 본다. 예전엔 end_date 만 봐서
          //    status='inactive' 인 385명이 «재원» 으로 세어지고 있었다(실측).
          `SELECT COUNT(*) AS active
           FROM students_erp
           WHERE (end_date IS NULL OR end_date = '' OR end_date >= ?)
             AND (status IS NULL OR status <> 'inactive')${_erpScope}`
        ).bind(todayKst, ..._sb).first<{ active: number }>(),
        { active: 0 } as any),

        safe(() => env.DB.prepare(
          `SELECT COUNT(*) AS signups
           FROM students_erp WHERE signup_date = ?${_erpScope}`
        ).bind(todayKst, ..._sb).first<{ signups: number }>(),
        { signups: 0 } as any),

        // 📅 오늘 «예정» 과 «그중 안 온 사람» — 결석률의 분모·분자.
        //
        //   🔑 출처는 attendance 다. 카페24 동기화가 예약을 `status='scheduled'` 로 미리 넣어 둔다
        //      (room_id 가 c24-*). 즉 «오늘 누가 수업인지» 는 처음부터 여기 있었다.
        //      ⚠️ class_schedules 를 쓰면 안 된다 — 666행이지만 학생은 6명뿐이고 140행은
        //         type_seed 데모다. 실제 수업과 연결돼 있지 않다(실측 확인).
        //
        //   결석 = «예정된 사람» 중 그날 present/left/attended 기록이 하나도 없는 사람.
        //   실측 08-07: 예정 92 · 출석 125 · 결석 65 → 70.7%.
        //   (출석이 예정보다 많은 것은 예약 없이 들어온 수업이 있기 때문이다. 정상이다.)
        // 📅 카페24 «수업 1건 = 행 1개» 를 상태별로 센다.
        //   cafe24-sync.ts: room_id=`c24-{class_id}`, class_state 2 → 'present'(완료), 그 외 → 'scheduled'(미실시).
        //   즉 한 방에 한 행뿐이라 예정·출석이 «겹치지 않는» 것이 정상이다.
        //   ⚠️ 세는 단위는 **수업(행)** 이지 학생이 아니다. 한 학생이 하루에 여러 수업을 듣는다.
        //   ⚠️ 오늘 값으로 «미실시율» 을 내면 안 된다 — 아침엔 100% 가 나온다(아직 안 했으니까).
        //      그래서 오늘은 «완료/예약» 진행상황만 주고, 비율은 **직전 영업일** 것을 준다.
        //
        //   🪤🪤 그런데 «직전 영업일» 값도 **아직 확정이 아니다.** (2026-08-09 실측)
        //      cafe24-sync 의 야간 증분은 **최근 14일만** 다시 가져온다(nightlyCafe24Refresh).
        //      그래서 어떤 날이든 15일째에 값이 «굳고», 그 전까지는 완료(class_state=2)가 계속 들어온다.
        //      굳은 날 vs 아직 움직이는 날을 요일별로 갈라 재니 **일관되게 +5~8%p** 차이가 났다:
        //        월 21.6 → 28.4 · 화 28.3 → 33.1 · 수 29.8 → 44.3 · 목 33.9 → 40.1 · 금 44.3 → 51.1
        //      즉 어제 숫자만 보면 **항상 실제보다 나쁘게 보인다.** 그 편차를 보정하지는 않는다
        //      (없는 숫자를 지어내는 것이다). 대신 **잣대를 같이 준다** —
        //      `weekday_avg_pct` = 같은 요일의 **굳은 날(15일 이상 지난 날)** 평균. 최근 60일.
        //      화면은 「8-07(금) 51.2% · 금 확정평균 44%」처럼 둘을 나란히 적는다.
        //   📌 요일 편차는 지연이 아니라 진짜다 — 굳은 날 기준으로도 월 21.6% ↔ 금 44.3% 다.
        //
        //   🧹 테스트·교육용 대리점 제외 (2026-08-09 실측) — 이 4곳은 **60일간 169건을 예약하고
        //      완료가 0건**이다. 실수업이 아니라 시연·연습용 계정이 매주 예약을 만드는 것이다.
        //        무료수업(지인) 90건 · 망고아이 기본대리점 43 · 교육용 대리점 27 · 테스트대리점 9  (전부 완료 0)
        //      빼면 미실시율이 월 21.6→21.0 · 금 44.3→42.7 로 내려간다. 크지 않지만 **가짜 숫자**다.
        //      ⚠️ 이름으로 거르지 않는다 — 「라이크테스트프랩어학원」은 이름만 비슷한 **실제 학원**이다
        //         (예약 0건이라 무해하지만, LIKE '%테스트%' 로 걸렀으면 멀쩡한 학원을 지웠을 것이다).
        //         그래서 **대리점 이름 4개를 명시적으로 못박는다.** 새 테스트 대리점이 생기면 여기 추가.
        //      ⚠️ 재원 수(active)에는 적용하지 않는다 — 그건 사장님이 대외적으로 쓰는 숫자라
        //         내 판단으로 정의를 바꾸지 않는다. 여기서 빼는 것은 «미실시율» 하나뿐이다.
        safe(() => env.DB.prepare(
          `WITH ghost AS (
             SELECT user_id FROM students_erp
              WHERE shop_name IN ('무료수업(지인)','망고아이 기본대리점','교육용 대리점','테스트대리점')),
           prev AS (
             SELECT date, COUNT(*) AS n, SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS done
               FROM attendance
              WHERE room_id LIKE 'c24-%' AND date < ? AND date >= date(?, '-14 days')
                AND user_id NOT IN (SELECT user_id FROM ghost)
              GROUP BY date HAVING COUNT(*) >= 20
              ORDER BY date DESC LIMIT 1),
           wd AS (
             SELECT SUM(n) AS n, SUM(done) AS done FROM (
               SELECT COUNT(*) AS n, SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS done
                 FROM attendance
                WHERE room_id LIKE 'c24-%'
                  AND date >= date(?, '-60 days')
                  AND date <= date(?, '-15 days')          -- 굳은 날만
                  AND user_id NOT IN (SELECT user_id FROM ghost)
                  AND strftime('%w', date) = (SELECT strftime('%w', date) FROM prev)
                GROUP BY date HAVING COUNT(*) >= 20))
           SELECT
             (SELECT COUNT(*) FROM attendance
               WHERE room_id LIKE 'c24-%' AND date = ?
                 AND user_id NOT IN (SELECT user_id FROM ghost)${_uidScope}) AS booked_today,
             (SELECT COUNT(*) FROM attendance
               WHERE room_id LIKE 'c24-%' AND date = ? AND status = 'present'
                 AND user_id NOT IN (SELECT user_id FROM ghost)${_uidScope}) AS done_today,
             (SELECT date FROM prev) AS prev_date,
             (SELECT n    FROM prev) AS prev_booked,
             (SELECT done FROM prev) AS prev_done,
             (SELECT n    FROM wd)   AS wd_booked,
             (SELECT done FROM wd)   AS wd_done`
        ).bind(todayKst, todayKst, todayKst, todayKst, todayKst, ..._sb, todayKst, ..._sb)
         .first<{ booked_today: number; done_today: number; prev_date: string | null;
                  prev_booked: number; prev_done: number; wd_booked: number; wd_done: number }>(),
        { booked_today: 0, done_today: 0, prev_date: null, prev_booked: 0, prev_done: 0,
          wd_booked: 0, wd_done: 0 } as any)
      ]);

      const revenue = revRow?.revenue || 0;
      const payCount = revRow?.pay_count || 0;
      const attended = attRow?.attended || 0;
      const active = activeRow?.active || 0;
      const signups = signupRow?.signups || 0;

      // 📉 결석률 — 분모는 «오늘 수업이 예정된 학생» 이어야 한다 (2026-08-08 수정)
      //
      //   무엇이 틀렸었나 — 분모가 **전체 재원 학생**이었다.
      //     absentCount = active - attended  →  8,052 - 8 = 8,044  →  99.9%
      //   오늘 수업이 없는 학생까지 전부 «결석» 으로 셌다. 그래서 화면에는 매일
      //   빨간 글씨로 99.9% 가 떠 있었고, 진짜 결석이 늘어도 아무도 알아챌 수 없었다.
      //   (실측 2026-08-08: 재원 8,052 · 오늘 출석 8 · 오늘 예정 조회 결과는 아래 참고)
      //
      //   그런데 «오늘 예정» 을 정확히 아는 데이터가 아직 없다 —
      //     class_schedules 666행 중 학생은 **6명**(140행은 type_seed 데모)
      //     enrollments 에 요일이 있는 것은 **50명**
      //   즉 8,052명 중 대다수는 «언제 수업인지» 가 기록돼 있지 않다.
      //
      //   그래서 **지어내지 않는다.** 예정 정보가 없으면 비율을 내지 않고 null 을 준다.
      //   화면은 null 을 «–» 로 그린다. 이 저장소에는 같은 이유로 만들어진 하니스가 있다
      //   (attendance_no_fabrication_harness — 없는 기록을 계산식으로 만들어 붙였다가
      //    그 «지어낸 지각» 이 강사 급여를 깎을 뻔했다). 같은 실수를 KPI 에서 반복하지 않는다.
      // 📊 오늘은 «진행상황», 비율은 «직전 영업일» — 이렇게 나눈 이유는 아래 주석 참조.
      const bookedToday = Math.max(0, Number(schedRow?.booked_today || 0));
      const doneToday   = Math.max(0, Number(schedRow?.done_today || 0));
      const prevBooked  = Math.max(0, Number(schedRow?.prev_booked || 0));
      const prevDone    = Math.max(0, Number(schedRow?.prev_done || 0));
      const prevRate    = prevBooked > 0
        ? Math.round(((prevBooked - prevDone) * 1000 / prevBooked)) / 10
        : null;
      // 📏 같은 요일의 «굳은 날» 평균 — 어제 숫자를 재는 잣대.
      //   어제 값은 아직 완료 처리가 덜 들어와 항상 나쁘게 나온다(위 SQL 주석의 실측표).
      //   보정하지 않고 **둘을 나란히 보여 준다.**
      const wdBooked = Math.max(0, Number(schedRow?.wd_booked || 0));
      const wdDone   = Math.max(0, Number(schedRow?.wd_done || 0));
      const wdRate   = wdBooked >= 100      // 표본이 너무 적으면 잣대가 못 된다
        ? Math.round(((wdBooked - wdDone) * 1000 / wdBooked)) / 10
        : null;
      const scheduledToday = Math.max(0, bookedToday - doneToday);   // 오늘 아직 안 한 수업
      const absentCount = scheduledToday;

      // 📌 왜 «오늘의 비율» 을 안 내는가 (2026-08-09, 연동 코드까지 읽고 정리)
      //
      //   앞서 두 번 틀렸다. 기록해 둔다 —
      //     ① 분모가 «전체 재원» 이었다 → 8,052−8 = 99.9%. 오늘 수업 없는 학생까지 결석으로 셌다.
      //     ② 그다음엔 «예정 학생 중 출석 안 한 학생» 으로 고쳤다 → 70.7%. 이것도 틀렸다.
      //        학생 단위로 맞추려 했는데, 한 학생이 하루에 여러 수업을 듣기 때문이다.
      //        «겹치는 방이 0건» 인 것을 «두 피드가 끊겼다» 고 오해하기도 했다.
      //
      //   진실은 cafe24-sync.ts 에 있었다 — 카페24 **수업 1건 = attendance 행 1개**이고,
      //   class_state 2 면 'present'(완료), 아니면 'scheduled'(미실시)로 **같은 행의 상태**만 갈린다.
      //   그러니 한 방에 한 행뿐인 게 정상이고, 세는 단위는 학생이 아니라 **수업(행)** 이다.
      //
      //   그런데 «오늘» 로 비율을 내면 여전히 거짓말이 된다 — 아침 9시엔 오늘 수업이
      //   하나도 안 끝났으니 미실시율 100% 다. 시간이 갈수록 저절로 내려간다.
      //   → 오늘은 «완료 M / 예약 N» 이라는 **진행상황**만 말하고,
      //     판단에 쓸 비율은 **직전 영업일**(수업이 다 끝나 값이 굳은 날) 것을 준다.
      //   실측 미실시율: 08-06 30.1% · 08-05 43.4% · 08-04 32.1% · 08-03 31.2%
      //     (예약 200건이 넘는 금요일만 ~50% 로 튄다 — 그건 들여다볼 «사실» 이다)
      const hasSchedule = false;   // 오늘 비율은 내지 않는다(위 이유). 대신 prev_* 를 쓴다.
      const absenceRate: number | null = hasSchedule
        ? Math.round((absentCount * 100 / scheduledToday) * 10) / 10
        : null;

      return admCachePut(env, _tKey, {
        ok: true,
        date: todayKst,
        revenue: { amount_krw: revenue, pay_count: payCount },
        students: { attended, active },
        // rate_pct 는 «모르면 null». 화면은 null 을 «–» 로 그린다(숫자를 지어내지 않는다).
        //   known=false 면 오늘 예정 정보가 아예 없다는 뜻 — 0% 도 100% 도 사실이 아니다.
        // scheduled·absent 는 «사실» 이므로 그대로 내보낸다. rate_pct 만 null 이다.
        //   reason 은 화면이 «왜 못 내는지» 를 사람 말로 보여주기 위한 것.
        absence: {
          rate_pct: absenceRate, absent: absentCount, scheduled: scheduledToday,
          known: hasSchedule, reason: hasSchedule ? null : 'today_in_progress',
          // 오늘 진행상황(사실) + 직전 영업일 미실시율(판단용)
          booked_today: bookedToday, done_today: doneToday,
          prev_date: schedRow?.prev_date || null, prev_rate_pct: prevRate,
          prev_booked: prevBooked, prev_done: prevDone,
          // 📏 잣대 — 같은 요일 «굳은 날»(15일 이상 지난 날, 최근 60일) 평균 미실시율.
          //    표본 100건 미만이면 null(잣대로 못 씀). 화면은 있을 때만 나란히 그린다.
          weekday_avg_pct: wdRate, weekday_sample: wdBooked,
        },
        signups: { count: signups }
      }, 60);
    }

    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase D1~D2 — 운영 KPI 통합 대시보드
    // ═══════════════════════════════════════════════════════════════

    // ── GET /api/admin/kpi/dashboard — 학원 핵심 KPI 한 번에 ──
    if (method === 'GET' && path === '/api/admin/kpi/dashboard') {
      // 🔒 세션 기반 강제 스코프 — 지사/대리점은 자기 범위만(본사=전체). 누수 차단.
      const _sf = await scopeFragments(env, request);
      const _uidScope = _sf.uidScope, _erpScope = _sf.erpScope, _sb = _sf.binds;

      // ⚡ KV 캐시(180초) — 대시보드 진입마다 20여 개 D1 쿼리를 다시 돌지 않게.
      //   스코프(cond+binds)를 키에 포함해 지사/대리점 크로스테넌트 격리(retrisk 와 동일 원칙).
      const _kpiKey = 'admkpi:' + (_erpScope || 'all') + '|' + _sb.join(',');
      const _kpiHit = await admCacheHit(env, _kpiKey);
      if (_kpiHit) return _kpiHit;

      // 안전망 - 필요 테이블 모두 ensure (캐시 미스일 때만 → 요청당 왕복 절약)
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, phone TEXT, parent_phone TEXT, status TEXT, created_at INTEGER);`); } catch {}
      /* ⚠️ memo 칸이 빠져 있으면 notSeedSql() 이 «no such column: memo» 로 죽는다.
         (지금은 fetch1 이 삼켜서 KPI 가 조용히 0 이 될 뿐이지만, 새 환경에서 매출이
          0 으로 보이는 게 더 나쁘다.) 다른 ensure 문들과 같은 모양으로 맞춘다. */
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, scheduled_date TEXT, status TEXT, created_at INTEGER);`); } catch {}

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

      // 상담/푸시 테이블 안전망 (아래 병렬 배치가 참조)
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, message TEXT, created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`); } catch {}

      // ⚡ 26-07-22 성능: 기존엔 아래 쿼리 20여 개를 전부 직렬 await 로 돌려(7일 매출은
      //   루프로 7번 더) 대시보드 KPI 스피너가 수 초씩 돌았다.
      //   → 독립 쿼리는 전부 Promise.all 병렬 + 7일 매출은 GROUP BY 1쿼리로 배칭.
      //   fetch1/fetchAll 이 내부 try/catch 라 개별 실패는 기존과 동일하게 조용히 0 처리.
      const cutoff35 = now - 35 * 86400 * 1000;
      const day0 = new Date(); day0.setHours(0, 0, 0, 0);
      const revBase = day0.getTime() - 6 * 86400000;   // 6일 전 자정(기존 루프의 첫 버킷)

      const [
        studentTotal, studentNewThisMonth, studentNewLastMonth,
        revThisMonth, revLastMonth,
        a1, a2, e1, o1, p1, c1, oc, i1, ps, pq, revBuckets
      ] = await Promise.all([
        fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE (status IN ('정상','활동','active') OR status IS NULL OR status = '')${_erpScope}`, ..._sb),
        fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ?${_erpScope}`, thisMonthStart, ..._sb),
        fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ? AND created_at < ?${_erpScope}`, lastMonthStart, lastMonthEnd, ..._sb),
        fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at >= ? AND paid_at < ?${_uidScope}`, thisMonthStart, thisMonthEnd, ..._sb),
        fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at >= ? AND paid_at < ?${_uidScope}`, lastMonthStart, lastMonthEnd, ..._sb),
        fetch1(`SELECT COUNT(*) AS n FROM point_rule_log WHERE rule_code='attendance' AND triggered_at >= ? AND triggered_at < ?`, thisMonthStart, thisMonthEnd),
        fetch1(`SELECT COUNT(*) AS n FROM point_rule_log WHERE rule_code='attendance' AND triggered_at >= ? AND triggered_at < ?`, lastMonthStart, lastMonthEnd),
        fetch1(`SELECT IFNULL(AVG(score_overall),0) AS avg, COUNT(*) AS n, IFNULL(SUM(parent_notified),0) AS notified FROM student_evaluations WHERE created_at >= ? AND created_at < ?`, thisMonthStart, thisMonthEnd),
        fetch1(`SELECT COUNT(*) AS n FROM payment_overdue_log WHERE status='sent' AND sent_at >= ? AND sent_at < ?`, thisMonthStart, thisMonthEnd),
        fetch1(`SELECT IFNULL(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),0) AS earned, IFNULL(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END),0) AS spent FROM point_transactions WHERE created_at >= ? AND created_at < ?`, thisMonthStart, thisMonthEnd),
        fetch1(`SELECT COUNT(*) AS n FROM chat_messages WHERE sent_at >= ? AND sent_at < ?`, thisMonthStart, thisMonthEnd),
        fetch1(`SELECT COUNT(DISTINCT s.user_id) AS n FROM students_erp s
                 WHERE (s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')
                   AND s.user_id NOT IN (SELECT user_id FROM student_payments WHERE status='paid' AND paid_at >= ?)${_uidScope}`, cutoff35, ..._sb),
        fetch1(`SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ?`, last30Start),
        fetch1(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE enabled = 1`),
        fetch1(`SELECT COUNT(*) AS sent, IFNULL(SUM(CASE WHEN fetched_at IS NOT NULL THEN 1 ELSE 0 END),0) AS fetched FROM push_queue WHERE queued_at >= ? AND queued_at < ?`, thisMonthStart, thisMonthEnd),
        fetchAll(`SELECT CAST((paid_at - ?) / 86400000 AS INTEGER) AS d, IFNULL(SUM(amount_krw),0) AS sum
                   FROM student_payments WHERE status='paid' AND ${notSeedSql()} AND paid_at >= ? AND paid_at < ?${_uidScope} GROUP BY d`,
                 revBase, revBase, revBase + 7 * 86400000, ..._sb),
      ]) as any[];

      const attendanceThisMonth = a1?.n || 0;
      const attendanceLastMonth = a2?.n || 0;
      const evalAvgThisMonth = Math.round((e1?.avg || 0) * 10) / 10;
      const evalCountThisMonth = e1?.n || 0;
      const evalNotifiedThisMonth = e1?.notified || 0;
      const overdueNotifyThisMonth = o1?.n || 0;
      const pointsEarnedThisMonth = p1?.earned || 0;
      const pointsSpentThisMonth = p1?.spent || 0;
      const chatMessagesThisMonth = c1?.n || 0;
      const overdueCount = oc?.n || 0;
      const inquiryLast30 = i1?.n || 0;

      const pushKpi: any = { active_subs: 0, queued_this_month: 0, fetched_this_month: 0, delivery_rate: 0 };
      pushKpi.active_subs = ps?.n || 0;
      pushKpi.queued_this_month = pq?.sent || 0;
      pushKpi.fetched_this_month = pq?.fetched || 0;
      pushKpi.delivery_rate = pushKpi.queued_this_month > 0 ? Math.round((pushKpi.fetched_this_month / pushKpi.queued_this_month) * 100) : 0;

      // 최근 7일 일별 매출 — GROUP BY 버킷을 7일 배열로 펼침(빈 날=0, 기존 루프와 동일 결과)
      const bucketMap: Record<number, number> = {};
      for (const r of (revBuckets || [])) bucketMap[Number(r.d)] = r.sum || 0;
      const dailyRev: any[] = [];
      for (let i = 0; i < 7; i++) {
        dailyRev.push({ date: new Date(revBase + i * 86400000).toISOString().slice(5, 10), revenue: bucketMap[i] || 0 });
      }

      // 비율 계산
      const trend = (cur: number, prev: number) => {
        if (prev === 0) return cur > 0 ? 100 : 0;
        return Math.round(((cur - prev) / prev) * 1000) / 10;  // 소수 1자리
      };

      return admCachePut(env, _kpiKey, {
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
      }, 180);
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
           WHERE status = 'paid' AND paid_at IS NOT NULL AND ${notSeedSql()} AND paid_at BETWEEN ? AND ?${_uidScope}
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

    // ===== 📊 UX 사용률 통계 =====
    //   GET /api/admin/ux/stats?days=14 — 기능(key)별 클릭수·사용자수 + 일별 추이 (뷰어: /ux-stats.html)
    //   수집원 = POST /api/games/ux-track (ux_events). 테이블 미생성(수집 전)이면 빈 결과.
    if (method === 'GET' && path === '/api/admin/ux/stats') {
      try {
        const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10) || 14));
        const since = new Date(Date.now() + 9 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);
        let byKey: any[] = [], byDay: any[] = [];
        try {
          const rs = await env.DB.prepare(
            `SELECT key, SUM(hits) AS hits, COUNT(DISTINCT uid) AS users, COUNT(DISTINCT day) AS active_days
             FROM ux_events WHERE day >= ? GROUP BY key ORDER BY hits DESC LIMIT 300`
          ).bind(since).all();
          byKey = (rs.results as any[]) || [];
          const rd = await env.DB.prepare(
            `SELECT day, SUM(hits) AS hits, COUNT(DISTINCT uid) AS users
             FROM ux_events WHERE day >= ? GROUP BY day ORDER BY day ASC`
          ).bind(since).all();
          byDay = (rd.results as any[]) || [];
        } catch { /* 수집 전(테이블 없음) → 빈 결과 */ }
        return json({ ok: true, days, since, by_key: byKey, by_day: byDay });
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
      /*   ③ (2026-08-08) 연기된 수업의 지급률 — 마이마이 요청 「수업료 상태에 연기를 넣어 달라」.
             ⚠️ 기본값을 **100** 으로 넣는다. 지금까지 연기된 수업은 그냥 «완료» 로 섞여 전액
             지급돼 왔다 — 여기서 0 으로 시작하면 아무 공지 없이 강사 급여가 깎인다.
             «보이게» 만드는 것과 «금액을 바꾸는» 것은 다른 결정이라 분리한다.
             금액 정책은 관리자 화면의 공제 규칙에서 사장님이 정하면 된다. */
      try {
        await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES ('postponed_pay_percent','연기된 수업 지급률(%)','Pay rate for postponed lessons (%)','policy_percent',100,1,5,?)`).bind(now).run();
      } catch {}
      /*   ④ (2026-08-07) 「30분보다 일찍 연기한 수업」 의 지급률 — 마이마이 문서 ② 의 규칙:
             · 시작 30분 이내 연기 → 전액(위 postponed_pay_percent, 기본 100)
             · 30분보다 이른 연기  → 0
           ✅ (2026-08-13) **사장님이 「30분전 연기는 0으로」 지시하셨다 → 켠다.**
              8/7 에는 «급여를 조용히 깎지 않는다» 는 이유로 enabled=0 으로 넣어 두었고,
              오늘 사람이 결정했으므로 스위치를 올린다. amount 는 그대로 0(%).
              끄고 싶으면 관리자 → 급여 → 공제 규칙에서 [사전 연기 지급률] 을 끄면
              즉시 예전 계산(전액 지급)으로 돌아간다. */
      try {
        await env.DB.prepare(`INSERT OR IGNORE INTO payroll_deduction_rules (code,label_ko,label_en,rule_type,amount,enabled,sort_order,updated_at) VALUES ('postponed_early_pay_percent','사전 연기(시작 30분보다 이전) 지급률(%)','Pay rate when postponed more than 30 min before (%)','policy_percent',0,1,6,?)`).bind(now).run();
      } catch {}
      /*   ④-b (2026-08-13) 이미 배포된 DB 에는 위 행이 **enabled=0 으로 이미 들어가 있다**
             (INSERT OR IGNORE 라 위 문장은 아무 일도 하지 않는다). 그래서 1회 마이그레이션으로
             스위치를 올린다 — 위의 nofb_25 와 같은 방식이다.
           ⚠️ 관리자가 **일부러 꺼 둔 것**까지 되켜면 안 되므로 플래그로 딱 한 번만 돈다.
              amount 는 손대지 않는다(사장님이 0 이외의 값을 넣어 두셨다면 그 값을 지킨다). */
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`);
        const earlyFlag: any = await env.DB.prepare(`SELECT value FROM payroll_meta WHERE key = 'early_postpone_on_260813'`).first().catch(() => null);
        if (!earlyFlag) {
          await env.DB.prepare(`UPDATE payroll_deduction_rules SET enabled = 1, updated_at = ? WHERE code = 'postponed_early_pay_percent'`).bind(now).run().catch(() => {});
          await env.DB.prepare(`INSERT OR REPLACE INTO payroll_meta (key,value,updated_at) VALUES ('early_postpone_on_260813','1',?)`).bind(now).run().catch(() => {});
        }
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
      /* 연기 지급률 — 규칙이 아예 없는 DB(옛 배포)에서는 100 으로 본다.
         «규칙이 없다» 를 «0% 지급» 으로 읽으면, 마이그레이션이 안 돈 순간 급여가 0 이 된다. */
      const postponePct = rules.postponed_pay_percent
        ? (rules.postponed_pay_percent.enabled ? Math.max(0, Math.min(100, Number(rules.postponed_pay_percent.amount) || 0)) : 100)
        : 100;
      /* ⏸⏱ (2026-08-07 마이마이 ② 「수업료 상태를 이렇게 나눠 달라」)
           문서에 적힌 규칙은 «연기 = 얼마» 가 아니라 **언제 연기했느냐로 갈린다**:
             · 시작 30분 이내에 연기 → 50php(=그 수업 전액). 그 시간엔 슬롯을 못 채운다.
             · 30분보다 일찍 연기     → 0php. 다른 수업을 넣을 시간이 있었다.
           우리 DB 는 이미 요청 시점에 그 판정을 해 두었다(schedule_change_requests.fee_type:
           paid=30분 이내 / free=그 이전). 여기서 **다시 계산하지 않고 그 값을 읽는다** —
           양쪽에서 계산하면 화면과 급여가 갈라진다.
         ✅ (2026-08-13) 사장님 지시 「30분전 연기는 0으로」 → 규칙을 **켠 상태**로 바꿨다
            (위 ensureDeductionRules ④·④-b). 이제 사전 연기(30분보다 이른 연기)는 0% 지급이다.
            되돌리려면 관리자 → 급여 → 공제 규칙에서 [사전 연기 지급률] 을 끄면 즉시 전액 지급으로 복귀. */
      const earlyPostponeRule = rules.postponed_early_pay_percent;
      const earlyPostponeOn = !!(earlyPostponeRule && earlyPostponeRule.enabled);
      const earlyPostponePct = earlyPostponeOn
        ? Math.max(0, Math.min(100, Number(earlyPostponeRule.amount) || 0))
        : postponePct;
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
      //   ⚠️ (2026-08-12) 강사 번호 체계가 **둘**이다 — class_schedules.teacher_id 는 원부
      //   teachers.id 인데 단가·등급·이름은 teacher_profiles 에 있고, 두 id 는 서로 다른
      //   일련번호다(예: KAYE = teachers 8 / profiles 11). 예전엔 tMap[l.teacher_id] 로
      //   프로필을 번호 직조회했는데, 라이브 대조 결과 **우연히라도 일치하는 강사가 0명** —
      //   전원이 남의 프로필(=남의 단가·남의 이름)에 붙어 있었다.
      //   → 원부(teachers)를 함께 읽어 ① linked_teacher_id(관리자 「🔗 강사 연결」/auto-match 가
      //     채우는 수동 연결) ② 정규화 이름 «유일» 일치(auto-match 와 같은 규칙) 순서로
      //     «teachers.id → 프로필» 다리를 놓는다. 동명이인·부분일치는 자동 연결하지 않는다
      //     (틀린 연결 = 남의 급여). linked_teacher_id 컬럼이 없는 배포본도 SELECT * 라 안 죽는다.
      const teachers: any = await env.DB.prepare(
        `SELECT * FROM teacher_profiles WHERE status = '활동중' OR status IS NULL ORDER BY korean_name`
      ).all().catch(() => ({ results: [] }));
      const tByName: any = {};
      for (const t of (teachers.results || [])) { if (t.korean_name) tByName[t.korean_name] = t; if (t.english_name) tByName[t.english_name] = t; }
      const tRows: any = await env.DB.prepare(`SELECT id, name FROM teachers`).all().catch(() => ({ results: [] }));
      const normTeacher = (s: any) => String(s || '').trim().toUpperCase().replace(/^TEACHER\s+/, '').replace(/\s+/g, ' ');
      const teacherNameById: any = {};   // String(teachers.id) → 원부 이름 (프로필 미연결 강사 표시용)
      const profByTeacherId: any = {};   // String(teachers.id) → teacher_profiles 행
      {
        const byNorm = new Map<string, any[]>();
        for (const t of (tRows.results || [])) {
          teacherNameById[String(t.id)] = t.name;
          const n = normTeacher(t.name);
          if (!n) continue;
          if (!byNorm.has(n)) byNorm.set(n, []);
          byNorm.get(n)!.push(t);
        }
        // 1패스: 관리자가 손으로 확인한 연결(linked_teacher_id)이 항상 우선
        for (const p of (teachers.results || [])) {
          const linkTid = (p.linked_teacher_id != null && p.linked_teacher_id !== '') ? String(p.linked_teacher_id) : '';
          if (linkTid && !profByTeacherId[linkTid]) profByTeacherId[linkTid] = p;
        }
        // 2패스: 나머지는 정규화 이름이 «유일하게» 일치할 때만
        for (const p of (teachers.results || [])) {
          if (p.linked_teacher_id != null && p.linked_teacher_id !== '') continue;
          const cands = byNorm.get(normTeacher(p.korean_name)) || byNorm.get(normTeacher(p.english_name)) || [];
          if (cands.length === 1 && !profByTeacherId[String(cands[0].id)]) profByTeacherId[String(cands[0].id)] = p;
        }
      }

      // 이 달 수업 (취소 제외)
      //   ⚠️ 실제 운영 class_schedules 스키마는 코드 DDL과 다르다(2026-07-10 확인):
      //   duration_min(≠duration_minutes), teacher_name 컬럼 없음, teacher_id 는 TEXT("28"),
      //   그리고 전 행이 schedule_kind='recurring'(요일 반복, scheduled_date=NULL).
      //   → SELECT * 로 어떤 스키마든 읽고, 반복 스케줄은 해당 월의 날짜 인스턴스로 전개한다.
      const ymPrefix = `${year}-${String(month).padStart(2, '0')}`;
      //   ⚠️ (2026-08-12) user_id 가 'lms'(구 LMS 점유 슬롯 — 수업이 아니라 자리 표시,
      //   운영 667행 중 대부분)·'type_seed'(시드 데이터)인 행은 급여·출석 계산에서 제외한다.
      //   안 거르면 점유 슬롯이 «완료 수업» 으로 잡혀 급여에 그대로 합산된다.
      const ls: any = await env.DB.prepare(
        `SELECT * FROM class_schedules WHERE COALESCE(status,'active') != 'cancelled' AND teacher_id IS NOT NULL
            AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`
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

      // teacher_name·student_name 을 함께 읽는다 — 아래 «오판» 대조(이름 일치 + 학생과의 혼동 배제)에 필요하다.
      const noShows: any = await env.DB.prepare(`SELECT room_id, schedule_id, missing_role, teacher_name, student_name, created_at FROM class_no_show WHERE created_at >= ? AND created_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      const nsByRoom: any = {}; const nsBySched: any = {};
      for (const n of (noShows.results || [])) {
        if (n.room_id) nsByRoom[n.room_id] = n;
        if (n.schedule_id != null) nsBySched[`${n.schedule_id}|${kstDay(n.created_at)}`] = n;
      }
      /* 🔎 (2026-08-19) 「강사 미입장」이 **정말** 미입장이었나를 출석 기록과 대조한다.
         [왜 급여에서까지] 아래 상태 판정이 teacher_no_show 면 그 수업은 **수업료가 0원**이 된다
         (amount 는 finish·student_absent·postponed 에만 붙는다). 그런데 이 행은 학생 브라우저가
         «내 화면에 안 보였다» 로 만드는 것이라, 두 사람이 서로 다른 워커의 방에 있으면
         강사가 멀쩡히 들어와 있어도 쌓인다(CLAUDE.md 2장) — 실측 13건 중 11건이 오판이었다.
         그대로 두면 «들어와서 수업한 강사에게 0원을 주는» 계산이 된다.
         ⚠️ 판정 정본은 노쇼 리포트·강사 지표와 **같은 함수**다(src/no-show-truth.ts).
            세 곳이 다른 답을 내면 「화면엔 오판이라는데 급여는 0원」이 된다.
         ⚠️ «모름»(판정 불가)은 살려 주지 않는다 — 모르는 것을 «있었다» 로 단정하면
            진짜 노쇼에 수업료가 나간다. 확실히 있었을 때만 되돌린다. */
      let nsPresence = new Map<string, any>();
      try { nsPresence = await teacherPresenceByRoom(env.DB, (noShows.results || []) as any[]); }
      catch (e: any) { console.warn('[payroll] 노쇼 대조 생략:', e?.message); }
      const nsIsFalseAlarm = (n: any): boolean => {
        const p = n && n.room_id ? nsPresence.get(String(n.room_id)) : null;
        return !!(p && p.present === true);
      };

      const fbs: any = await env.DB.prepare(`SELECT room_id, teacher_name, created_at FROM teacher_class_feedback WHERE created_at >= ? AND created_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      const fbByRoom: any = {}; const fbByTeacherDay: any = {};
      for (const f of (fbs.results || [])) {
        const dkey = kstDay(f.created_at);
        if (f.room_id && !fbByRoom[f.room_id]) fbByRoom[f.room_id] = dkey;
        if (f.teacher_name) fbByTeacherDay[`${f.teacher_name}|${dkey}`] = true;
      }
      /* ⏸ 승인된 연기·취소 요청 — «언제 요청했나»(fee_type)를 수업 행에 붙이기 위해 읽는다.
         · 월 범위로 자르지 않는다: 요청은 지난달에 하고 수업은 이번 달일 수 있다.
           대신 status='approved' + 연기/취소만이라 행 수가 작다(운영 실측 수십 건).
         · 키는 schedule_id|orig_date — 반복 수업은 같은 schedule_id 가 여러 날짜로 도니
           날짜까지 맞춰야 «그날의» 연기가 된다. */
      const prRows: any = await env.DB.prepare(
        `SELECT schedule_id, orig_date, fee_type, minutes_before, created_at
           FROM schedule_change_requests
          WHERE status = 'approved' AND request_type != 'change'`
      ).all().catch(() => ({ results: [] }));
      const postponeReq: any = {};
      for (const r of (prRows.results || [])) {
        if (r.schedule_id == null) continue;
        const d = String(r.orig_date || '').slice(0, 10);
        if (!d) continue;
        const k = `${r.schedule_id}|${d}`;
        // 같은 수업에 요청이 여러 번이면 **마지막 승인** 이 실제로 적용된 것이다.
        const prev = postponeReq[k];
        if (!prev || (Number(r.created_at) || 0) > (Number(prev.created_at) || 0)) postponeReq[k] = r;
      }

      // 📝 Phase FD — AI 초안을 강사가 '승인'한 것도 당일 피드백으로 인정 (승인 시각 기준)
      const fds: any = await env.DB.prepare(`SELECT room_id, approved_at FROM feedback_drafts WHERE status = 'approved' AND approved_at >= ? AND approved_at < ?`).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      for (const f of (fds.results || [])) {
        if (f.room_id && !fbByRoom[f.room_id]) fbByRoom[f.room_id] = kstDay(f.approved_at);
      }

      /* 📝 (2026-08-09) 강사 화면의 「1분 평가」도 당일 피드백으로 인정한다.
         지금까지 이 판정은 teacher_class_feedback 과 «승인된» feedback_drafts 두 곳만 봤다.
         그런데 강사가 /teacher 에서 실제로 쓰는 평가는 student_evaluations 에 들어간다
         (teacher.html 의 「1분 평가」 → POST /api/eval/create).
         → 성실하게 평가를 쓴 강사도 «미작성» 으로 잡혀 수업 1건당 ₱25 씩 깎이고 있었다.
            강사 화면 맨 위 「⚠ 피드백 미작성」 경고에도 그대로 떴다.
         ⚠️ room_id 정확 매칭만 인정한다 — 위의 «강사명+같은 날» 폴백은 주지 않는다.
            평가 1건으로 그날 수업 전부를 «작성함» 으로 만들면 반대 방향 오류(과소 공제)가 난다.
         ⚠️ 데모/시드 행은 room_id 가 NULL 이라 자연히 걸리지 않는다(운영 104행 중 102행). */
      const evs: any = await env.DB.prepare(
        `SELECT room_id, created_at FROM student_evaluations
          WHERE created_at >= ? AND created_at < ? AND room_id IS NOT NULL AND room_id <> ''`
      ).bind(mStart, mEnd).all().catch(() => ({ results: [] }));
      for (const e of (evs.results || [])) {
        if (e.room_id && !fbByRoom[e.room_id]) fbByRoom[e.room_id] = kstDay(e.created_at);
      }

      // 학생 이름 맵 (students_erp 컬럼 구성이 배포본마다 달라 순차 폴백)
      //   운영 class_schedules 에는 student_name 이 행에 직접 있어 이 맵은 폴백용.
      const uids: any[] = [...new Set(instances.filter((l: any) => !l.student_name).map((l: any) => l.user_id).filter(Boolean))];
      const stuName: any = {};
      // ⚠️ (2026-08-07) 예전엔 uids 를 IN 목록에 통째로 넣고 `<= 500` 으로만 막았습니다.
      //    D1 한도는 100개라 101명부터는 쿼리가 던지고 → 세 컬럼 폴백이 모두 실패 →
      //    이름이 조용히 전부 빈칸이 됐습니다(에러 없이 화면만 비어 보임).
      //    이제 청크로 나눠 질의하므로 인원 수 제한이 필요 없습니다.
      //    컬럼 폴백 동작은 그대로 — 컬럼이 없으면 첫 청크에서 던져 다음 컬럼으로 넘어갑니다.
      if (uids.length) {
        for (const col of ['student_name', 'korean_name', 'name']) {
          try {
            const rows = await selectInChunks<any>(env.DB, uids,
              (ph) => `SELECT user_id, ${col} AS nm FROM students_erp WHERE user_id IN (${ph})`);
            let hit = false;
            for (const r of rows) { if (r.nm) { stuName[r.user_id] = r.nm; hit = true; } }
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
        // teacher_id(원부 teachers.id) → 연결된 프로필. 번호 직조회(tMap[l.teacher_id])는
        // 다른 번호 체계라 남의 프로필이 나온다 — 위 profByTeacherId 다리로만 건넌다.
        const prof = profByTeacherId[String(l.teacher_id)] || tByName[l.teacher_name || ''] || null;
        const mins = l._mins;
        const teacherName = l.teacher_name || (prof ? prof.korean_name : null) || teacherNameById[String(l.teacher_id)] || null;
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
        /* ⏸ (2026-08-08) 연기된 수업 — 매니저가 강사 요청을 승인하면
           class_schedules.status 가 'postponed' 가 된다(위 /schedule-requests/decide).
           그런데 이 계산은 그 값을 **한 번도 보지 않았다**. 결과가 두 가지로 나빴다:
             ① 하지도 않은 수업이 '완료' 로 잡혀 전액 지급됐고,
             ② 그 수업엔 피드백이 있을 리 없어 «당일 피드백 미작성» 공제까지 붙었다.
                (없던 수업 때문에 강사가 벌점을 받고 있었다)
           → 상태로 분리한다. ②는 여기서 바로 사라진다(아래 공제는 finish 에만 붙는다).
              ①의 «얼마를 줄지» 는 정책이라 postponed_pay_percent 로 뺐다(기본 100 = 현행 유지). */
        const schedStatus = String(l.status || 'active').toLowerCase();
        let st = 'finish';
        if (schedStatus === 'postponed') st = 'postponed';
        else if (upcoming) st = 'upcoming';
        else if (ns && ns.missing_role === 'student') st = 'student_absent';
        /* 🔎 오판이면 «미입장» 으로 보지 않는다 — 강사가 실제로 들어와 수업한 건이다.
           그러면 아래 흐름을 그대로 타고 'finish'(정상 수업, 전액)로 남는다. 위 nsIsFalseAlarm 주석 참고. */
        else if (ns && ns.missing_role === 'teacher' && !nsIsFalseAlarm(ns)) st = 'teacher_no_show';

        const base = Math.round((mins / 10) * fee);
        /* ⏸ 연기 수업의 지급률 — 「언제 연기했나」로 갈린다(위 earlyPostponePct 주석 참고).
           요청 기록이 없는 연기(관리자가 직접 상태만 바꾼 경우)는 판정할 근거가 없으므로
           기존 규칙(postponePct)을 그대로 쓴다. 모르는 것을 «사전 연기» 로 단정하지 않는다. */
        const pReq = (st === 'postponed') ? (postponeReq[`${l.id}|${dateStr}`] || null) : null;
        const pFeeType: string | null = pReq ? (pReq.fee_type || null) : null;
        const pPct = (st === 'postponed')
          ? (pFeeType === 'free' ? earlyPostponePct : postponePct)
          : 0;
        let amount = 0;
        if (st === 'finish') amount = base;
        else if (st === 'student_absent') amount = Math.round(base * absentPct / 100);
        else if (st === 'postponed') amount = Math.round(base * pPct / 100);

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
          teacher_id: l.teacher_id, profile_id: prof ? prof.id : null, teacher_name: teacherName,
          lesson_type: lessonType,
          level_code: levelCode, level_label_ko: lvl ? lvl.label_ko : null, level_label_en: lvl ? lvl.label_en : null,
          rate_per_20min: rate20,
          status: st, fee_per_10min: fee, base_amount: base, amount,
          // ⏸ 연기 수업만 채워진다 — 강사 화면이 «왜 이 금액인지» 를 설명할 수 있게.
          postpone_fee_type: pFeeType,                                   // paid=30분 이내 / free=그 이전
          postpone_minutes_before: pReq ? pReq.minutes_before : null,
          postpone_pay_percent: (st === 'postponed') ? pPct : null,
          late_minutes: lateMin,
          feedback_ok: fbOk, deductions: dedus, deduction_total: dSum, net_amount: netAmount,
        });

        // 집계 키: 연결된 프로필 id(급여 화면 로스터·teacher_payroll 저장이 프로필 기준).
        // 프로필 미연결 강사는 't{원부id}' — 원부 번호를 그대로 키로 쓰면 같은 번호의
        // 프로필(=다른 강사) 줄에 합산되는 사고가 나서 접두사로 격리한다.
        const aggKey = prof ? String(prof.id) : ('t' + String(l.teacher_id));
        const agg = perTeacher[aggKey] || (perTeacher[aggKey] = {
          teacher_id: l.teacher_id, profile_id: prof ? prof.id : null, teacher_name: teacherName,
          lesson_count: 0, upcoming_count: 0, finish_count: 0,
          absent_count: 0, postponed_count: 0, teacher_no_show_count: 0, no_feedback_count: 0,
          total_minutes: 0, base_amount: 0, pay_amount: 0, deduction_total: 0, final_amount: 0,
        });
        if (st === 'upcoming') { agg.upcoming_count++; continue; }
        agg.lesson_count++;
        agg.total_minutes += mins;
        if (st === 'finish') agg.finish_count++;
        if (st === 'student_absent') agg.absent_count++;
        if (st === 'postponed') agg.postponed_count++;
        if (st === 'teacher_no_show') agg.teacher_no_show_count++;
        if (fbOk === false) agg.no_feedback_count++;
        agg.base_amount += base;
        agg.pay_amount += amount;
        agg.deduction_total += dSum;
        /* 💸 (2026-08-18 사장님 확인) 0 하한 — 단가 미지정(수업료 0) 강사에게 피드백 미작성
           공제만 붙어 «실지급 -350» 이 화면·CSV 에 그대로 나오던 것. 수업별 순지급(net_amount)은
           이미 Math.max(0,…) 인데 월 합계만 음수가 될 수 있었다. 공제 합계는 그대로 보여 주고
           (얼마가 깎였는지는 사실이므로) 지급액만 음수로 내려가지 않게 한다. */
        agg.final_amount = Math.max(0, agg.pay_amount - agg.deduction_total);
      }

      return { rules: ruleRows.results || [], levels: lvlRows.results || [], levelMap, absent_pay_percent: absentPct, postponed_pay_percent: postponePct, lessons, perTeacher, teachers: teachers.results || [], teacherNames: teacherNameById };
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

      /* 📦 (2026-08-18 사장님 요청 3안) 카페24가 보낸 그 달 급여를 함께 싣는다.
         [왜] 이 화면은 D1 class_schedules(예약표)로만 계산하는데, 실제 수업은 옛 LMS 에서
              이뤄져 예약표에는 «자리 표시»만 들어온다. 실측(2026-08-18): 673행 중 lms·시드를
              빼면 15행·강사 5명뿐이라, 33명 중 28명이 0회로 나왔다(사장님 캡처).
         [무엇] D1 계산이 0회인 강사는 카페24 값으로 채운다. **0회일 때만** 채우는 이유는,
              이 화면의 공제·상세가 전부 예약표 수업 한 건씩에서 나오기 때문이다. 둘을 섞으면
              합계와 상세가 서로 다른 이야기를 하게 된다.
         [공제] 카페24로 채운 줄에는 공제를 붙이지 않는다 — 그 값에는 수업별 피드백·지각
              판정 근거가 없다. 없는 근거로 깎으면 그게 곧 잘못된 임금 삭감이다. */
      const c24 = await loadCafe24PayrollMonth(env, year, month);

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
        // 🎖 단가가 하나도 없는 강사(개별 단가도, 등급도 없음) — 수업이 있어도 수업료가 0 으로
        //    계산된다. 화면이 «금액이 0» 과 «단가가 없어 계산 불가» 를 구분할 수 있게 표시한다.
        const rateMissing = !(rate20 > 0);
        const s = savedMap[t.id];

        /* 📦 카페24 보충 — D1 예약표에 이 달 수업이 한 건도 없을 때만. 이름으로 잇는다(번호 금지). */
        const cf = c24.find(t.korean_name, t.english_name);
        const useC24 = !!cf && a.lesson_count === 0 && Number(cf.completed_classes) > 0;
        const c24Minutes = cf
          ? (Number(cf.total_minutes) > 0
              ? Number(cf.total_minutes)
              // 분을 아직 안 보내면 예전 규칙(전부 20분)으로 «환산해 보여 준다». 정확한 값이
              // 아니라는 것은 c24_minutes_real: false 로 화면이 구분한다.
              : Number(cf.completed_classes || 0) * DEFAULT_CLASS_MINUTES)
          : 0;
        const rowLessons  = useC24 ? Number(cf.completed_classes || 0) : a.lesson_count;
        const rowMinutes  = useC24 ? c24Minutes : a.total_minutes;
        const rowAmount   = useC24 ? Math.round(Number(cf.pay_php) || 0) : a.pay_amount;
        const rowDeduct   = useC24 ? 0 : a.deduction_total;
        const rowFinal    = useC24 ? rowAmount : a.final_amount;

        totalAmount += rowAmount;
        totalLessons += rowLessons;
        totalDeduction += rowDeduct;
        totalFinal += rowFinal;
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
          // 카페24 금액을 쓰는 줄은 «단가 미지정» 경고를 띄우지 않는다 — 금액이 이미 카페24에서 온다
          rate_missing: rateMissing && !useC24,
          lesson_count: rowLessons,
          total_minutes: rowMinutes,
          calculated_amount: rowAmount,
          // 💼 G3 — 공제 반영 필드
          deduction_total: rowDeduct,
          final_amount: rowFinal,
          // 📦 이 줄의 숫자가 어디서 왔나 — 'd1'(예약표 계산) / 'cafe24'(카페24 인제스트)
          amount_source: useC24 ? 'cafe24' : 'd1',
          // 카페24가 «분» 을 보냈나. false 면 «완료 수업 × 20분» 으로 환산한 참고값이다.
          c24_minutes_real: useC24 ? Number(cf.total_minutes) > 0 : null,
          c24_pay_php: cf ? Math.round(Number(cf.pay_php) || 0) : null,
          c24_lessons: cf ? Number(cf.completed_classes || 0) : null,
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
      // 프로필 미연결 강사(원부 teachers 에만 있고 teacher_profiles 연결이 안 된 강사)의 수업 —
      // 예전엔 같은 번호의 «다른 강사» 프로필 줄에 합산됐다. 이제 별도 행으로 분리해 보여 준다.
      // 단가 정보(프로필·등급)가 없어 금액은 0 — 관리자 「🔗 강사 연결」로 프로필을 이으면
      // 다음 계산부터 그 강사 줄에 정상 단가로 붙는다.
      for (const k of Object.keys(data.perTeacher || {})) {
        if (!/^t\d+$/.test(k)) continue;
        const a = (data.perTeacher as any)[k];
        if (_prOwn && !sameTeacherName(_prOwn, a.teacher_name)) continue;
        const s = savedMap[k];
        totalAmount += a.pay_amount;
        totalLessons += a.lesson_count;
        totalDeduction += a.deduction_total;
        totalFinal += a.final_amount;
        if (s && s.status === 'paid') paidCount++;
        rows.push({
          teacher_id: k, korean_name: a.teacher_name, english_name: null,
          unlinked_profile: true,
          fee_per_10min: 0, level_code: null, level_label_ko: null, level_label_en: null, rate_per_20min: 0,
          lesson_count: a.lesson_count, total_minutes: a.total_minutes,
          calculated_amount: a.pay_amount, deduction_total: a.deduction_total, final_amount: a.final_amount,
          finish_count: a.finish_count, absent_count: a.absent_count,
          teacher_no_show_count: a.teacher_no_show_count, no_feedback_count: a.no_feedback_count,
          upcoming_count: a.upcoming_count,
          adjusted_amount: s?.adjusted_amount ?? null, paid_amount: s?.paid_amount ?? null,
          status: s?.status || 'pending', paid_at: s?.paid_at || null, memo: s?.memo || null, payroll_id: s?.id || null,
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
        /* 📦 카페24에는 있는데 화면 명부와 이름이 안 이어진 강사 — 조용히 빠지면 «급여를 안 준»
           사람이 생긴다. 관리자 화면이 몇 명인지 알려 줄 수 있게 함께 내려준다.
           (실측 2026-08-18: 32명 중 「테스트 강사」·「test teacher」·「스케줄변경중」 같은
            실제 강사가 아닌 이름이 섞여 있어, 0 이 아니라고 곧 사고인 것은 아니다)

           🔴 강사 본인 로그인에게는 **빈 배열**을 준다. 위 루프가 «본인이 아니면 continue» 로
              건너뛰므로 matched 에 자기 이름 하나만 담기고, unmatched() 가 **나머지 31명의
              이름·완료수업·pay_php 를 통째로** 실어 보내게 된다(2026-08-18 함정 대조에서 잡음).
              화면(adm-q3)이 강사 뷰에서 안 그리는 것만으로는 부족하다 — CLAUDE.md 의
              「서버 403 과 화면 감추기 둘 다」 그대로, 화면만 막으면 API 를 직접 불러 뚫린다.
              /api/admin/payroll/ 은 강사가 «본인 급여명세» 를 보라고 일부러 열어 둔 경로라
              더더욱 서버에서 잘라야 한다. */
        c24_unmatched: _prOwn ? [] : c24.unmatched(),
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
      const tidParamRaw = (url.searchParams.get('teacher_id') || '').trim();
      let tid = parseInt(tidParamRaw, 10) || 0;
      // 프로필 미연결 강사 행(/calculate 가 만든 합성 키 teacher_id='t{원부id}')의 상세 조회 지원
      let rawTid = /^t\d+$/i.test(tidParamRaw) ? tidParamRaw.slice(1) : '';
      let tname = (url.searchParams.get('teacher_name') || '').trim();
      // 🔐 강사(teacher) 로그인 시엔 요청한 teacher_id/teacher_name 을 무시하고 항상 본인 것만.
      //   (강사가 남의 teacher_id 를 넣어 타인의 수업별 단가·공제를 조회하는 것을 서버에서 차단)
      const _lsActor = await getAdminActor(request, env as any);
      if (_lsActor.isTeacher) {
        if (!_lsActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        tid = 0;
        rawTid = '';
        tname = _lsActor.name;
      }

      // ── all=1 : 강사 구분 없이 그 달 전체 수업 (2026-08-05) ──────────────────
      //   왜 넣었나: 출석현황 카드(adm-p5.js)가 서버 엔드포인트가 없어서
      //   **실제 강사 이름으로 가짜 지각·결강·별점을 지어내고 있었다.** 그 숫자가 엑셀로
      //   빠져나가면 경고 배너가 사라져 실기록처럼 보인다 → 급여 사고로 직결.
      //   여기서 급여와 **같은 계산(computeLessonFeeMonth)** 을 그대로 내려준다.
      //   같은 원천을 쓰므로 출석현황과 급여가 서로 어긋날 수 없다(요청 8·22 «한곳에서»).
      //   🔐 강사는 전면 차단 — 전 강사의 단가·공제가 담긴다.
      if (url.searchParams.get('all') === '1') {
        if (_lsActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
        const dAll = await computeLessonFeeMonth(year, month);
        return json({
          ok: true, year, month, all: true,
          lessons: dAll.lessons,
          rules: (dAll.rules || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rule_type: r.rule_type, amount: r.amount, enabled: r.enabled })),
          absent_pay_percent: dAll.absent_pay_percent,
        });
      }

      if (!tid && !rawTid && !tname) return json({ ok: false, error: 'teacher_id_or_teacher_name_required' }, 400);

      const data = await computeLessonFeeMonth(year, month);
      let teacher: any = null;
      if (tid) teacher = (data.teachers || []).find((t: any) => t.id === tid) || null;
      else if (!rawTid) {
        teacher = (data.teachers || []).find((t: any) => sameTeacherName(t.korean_name, tname) || sameTeacherName(t.english_name, tname)) || null;
        if (teacher) tid = teacher.id;
      }
      /* ⚠️ (2026-08-12) 두 번호 체계 — l.teacher_id 는 원부 teachers.id, tid 는 teacher_profiles.id.
         예전엔 String(l.teacher_id) === String(tid) 로 번호끼리 직접 비교해서, 프로필 번호와
         같은 번호의 «다른 강사» 수업이 나왔다(라이브 대조 결과 우연 일치 0명 — 전원 남의 수업).
         이제 수업 행에 실어 둔 profile_id(연결된 프로필)로 거른다. */
      const lessons = data.lessons.filter((l: any) =>
        (rawTid && String(l.teacher_id) === rawTid) ||
        (tid && String(l.profile_id ?? '') === String(tid)) ||
        (tname && sameTeacherName(l.teacher_name, tname)));

      // 필터된 수업으로 요약 재계산 (이름만 일치하는 프로필 없는 강사도 지원)
      const sum: any = { lesson_count: 0, upcoming_count: 0, finish_count: 0, absent_count: 0, postponed_count: 0, teacher_no_show_count: 0, no_feedback_count: 0, total_minutes: 0, base_amount: 0, pay_amount: 0, deduction_total: 0, final_amount: 0 };
      for (const l of lessons) {
        if (l.status === 'upcoming') { sum.upcoming_count++; continue; }
        sum.lesson_count++;
        sum.total_minutes += l.duration_minutes;
        if (l.status === 'finish') sum.finish_count++;
        if (l.status === 'student_absent') sum.absent_count++;
        if (l.status === 'postponed') sum.postponed_count++;
        if (l.status === 'teacher_no_show') sum.teacher_no_show_count++;
        if (l.feedback_ok === false) sum.no_feedback_count++;
        sum.base_amount += l.base_amount;
        sum.pay_amount += l.amount;
        sum.deduction_total += l.deduction_total;
      }
      // 💸 0 하한 — 목록(/calculate)과 같은 규칙. 상세만 음수면 두 화면이 서로 어긋난다.
      sum.final_amount = Math.max(0, sum.pay_amount - sum.deduction_total);

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
        } : { id: rawTid ? ('t' + rawTid) : (tid || null), korean_name: tname || (rawTid ? ((data as any).teacherNames || {})[rawTid] || null : null) },
        summary: sum,
        rules: (data.rules || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rule_type: r.rule_type, amount: r.amount, enabled: r.enabled })),
        levels: (data.levels || []).map((r: any) => ({ code: r.code, label_ko: r.label_ko, label_en: r.label_en, rate_per_20min: r.rate_per_20min })),
        absent_pay_percent: data.absent_pay_percent,
        postponed_pay_percent: data.postponed_pay_percent,
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

    /* ── GET /api/admin/payroll/late-detect?year=&month= — 지각 «자동 감지» (참고용) ──────
     *
     * [왜] 지각분은 지금까지 관리자가 손으로 세어 넣었다(아래 late-minutes). 강사 20명 × 한 달치를
     *      사람이 세는 일이라 빠지거나 틀리기 쉽다. 원천 데이터(attendance.joined_at)는 이미 있다.
     *
     * ⛔ **자동으로 급여를 깎지 않는다.** 이 창구는 «세어 보니 이렇습니다» 만 돌려준다.
     *    공제에 반영되는 값은 여전히 lesson_late_minutes(사람이 확정한 값)뿐이다.
     *    돈은 사람이 확정한다 — 접속 기록이 곧 지각은 아니다(회선 끊김·재입장·시계 오차).
     *
     * 🔑 방 이름 규약으로 수업과 접속을 잇는다: room_id = class-{schedule_id}-{YYYYMMDD}
     * ⚠️ 강사의 «가장 이른» 입장만 본다. 끊겼다 다시 들어온 것을 지각으로 세면 안 된다.
     */
    if (method === 'GET' && path === '/api/admin/payroll/late-detect') {
      const _ldActor = await getAdminActor(request, env as any);
      if (_ldActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
      const y = parseInt(url.searchParams.get('year') || '', 10);
      const mo = parseInt(url.searchParams.get('month') || '', 10);
      if (!y || !mo || mo < 1 || mo > 12) return invalidBody(['year', 'month']);
      const p2 = (n: number) => String(n).padStart(2, '0');
      const from = `${y}-${p2(mo)}-01`;
      const to = `${y}-${p2(mo)}-31`;
      // 몇 분부터 «지각» 으로 볼지 — 기본 3분(시계 오차·입장 지연을 지각으로 세지 않기 위한 여유)
      const grace = Math.max(0, Math.min(30, parseInt(url.searchParams.get('grace') || '3', 10) || 3));
      try {
        const empty = { results: [] as any[] };
        const [attRs, manRs] = await Promise.all([
          env.DB.prepare(
            `SELECT room_id, user_id, username, MIN(joined_at) AS first_join, date
               FROM attendance
              WHERE role = 'teacher' AND date >= ? AND date <= ? AND room_id LIKE 'class-%'
              GROUP BY room_id`
          ).bind(from, to).all<any>().catch(() => empty),
          env.DB.prepare(
            `SELECT schedule_id, lesson_date, minutes FROM lesson_late_minutes WHERE lesson_date >= ? AND lesson_date <= ?`
          ).bind(from, to).all<any>().catch(() => empty),
        ]);
        const manual: Record<string, number> = {};
        for (const m of (manRs.results || []) as any[]) manual[`${m.schedule_id}|${m.lesson_date}`] = Number(m.minutes) || 0;

        // 방 이름에서 schedule_id 를 뽑아, 그 수업의 예정 시작 시각을 한 번에 읽는다.
        const rows = (attRs.results || []) as any[];
        const sids = Array.from(new Set(rows.map((r) => {
          const m = /^class-(\d+)-\d{8}$/.exec(String(r.room_id || ''));
          return m ? Number(m[1]) : 0;
        }).filter(Boolean)));
        const startById: Record<number, { start: string; teacher: string }> = {};
        // ⚠️ D1 은 쿼리당 바인드 100개 한도 — 손으로 끊지 말고 공용 헬퍼를 쓴다(가드가 지킨다)
        const schedRows = await selectInChunks<any>(
          env.DB, sids, (ph) => `SELECT id, start_time, teacher_id FROM class_schedules WHERE id IN (${ph})`
        );
        for (const s of schedRows) {
          startById[Number(s.id)] = { start: String(s.start_time || ''), teacher: String(s.teacher_id || '') };
        }

        const toMin = (hhmm: string) => {
          const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
          return m ? Number(m[1]) * 60 + Number(m[2]) : null;
        };
        const out: any[] = [];
        for (const r of rows) {
          const m = /^class-(\d+)-\d{8}$/.exec(String(r.room_id || ''));
          if (!m) continue;
          const sid = Number(m[1]);
          const sched = startById[sid];
          if (!sched || !sched.start) continue;
          const planned = toMin(sched.start);
          if (planned == null || !r.first_join) continue;
          // 입장 시각을 KST 분 단위로 (예정 시각도 KST 기준으로 적혀 있다)
          const d = new Date(Number(r.first_join) + 9 * 3600 * 1000);
          const actual = d.getUTCHours() * 60 + d.getUTCMinutes();
          const lateMin = actual - planned;
          if (lateMin <= grace) continue;                       // 여유 안이면 지각 아님
          const key = `${sid}|${r.date}`;
          out.push({
            schedule_id: sid, lesson_date: r.date, room_id: r.room_id,
            teacher: r.username || sched.teacher || '', planned_start: sched.start,
            actual_start: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`,
            detected_minutes: lateMin,
            entered_minutes: manual[key] ?? null,               // 사람이 이미 넣은 값(비교용)
            differs: manual[key] != null && manual[key] !== lateMin,
          });
        }
        out.sort((a, b) => b.detected_minutes - a.detected_minutes);
        return json({
          ok: true, year: y, month: mo, grace_minutes: grace, count: out.length, rows: out,
          note: '참고용입니다. 공제에 반영되는 값은 관리자가 확정한 지각분(late-minutes)뿐입니다.',
          note_en: 'Advisory only. Only the manually confirmed late minutes affect payroll deductions.',
        });
      } catch (e: any) {
        return json({ ok: false, error: 'late_detect_failed', message: String(e?.message || e).slice(0, 200) }, 500);
      }
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
      /* 🔒 (2026-08-17 사장님) 지사·대리점도 연기·변경 요청을 처리한다 —
           «학부모·학생도 하고 학원장님도 한다» 는 확인을 받고 화면을 열었다.
         그런데 이 목록에는 **스코프 필터가 없었다.** 관리자면 전부 돌려줬으므로,
         화면만 켰다면 강남점 원장님이 서초점·부산지사 요청까지 보게 된다(학생 이름 포함).
         그래서 화면보다 **여기를 먼저** 고친다.

         잇는 길 — 요청 → class_schedules.user_id → students_erp → shop_name/franchise.
         schedule_change_requests 에는 지사·대리점 칸이 아예 없어서 이 경로뿐이다.

         ⚠️ **막는 쪽으로 실패한다(fail-closed).** schedule_id 가 비었거나 그 수업이
            students_erp 로 이어지지 않는 요청은 지사·대리점에게 **안 보인다.**
            학생 이름으로 맞추는 방법도 있지만, 동명이인이면 다른 대리점 학생이 새어 나간다 —
            덜 보이는 쪽이 잘못 보이는 쪽보다 낫다. 본사(hq)는 예전처럼 전부 본다.
         ⚠️ hq · none(내부직원) 은 cond 가 빈 문자열이라 **동작이 하나도 안 바뀐다.** */
      const _srScope = await getScope(env as any, request);
      const _srC = scopeStudentCond(_srScope);
      const _srScopeCond = _srC.cond
        ? `schedule_id IN (SELECT id FROM class_schedules WHERE user_id IN (SELECT user_id FROM students_erp WHERE ${_srC.cond}))`
        : '';

      const conds: string[] = []; const binds: any[] = [];
      if (status && status !== 'all') { conds.push('status = ?'); binds.push(status); }
      if (teacher) { conds.push('teacher_name = ?'); binds.push(teacher); }
      if (_srScopeCond) { conds.push(_srScopeCond); binds.push(..._srC.binds); }
      const where = conds.length ? ('WHERE ' + conds.join(' AND ')) : '';
      const rs: any = await env.DB.prepare(
        `SELECT * FROM schedule_change_requests ${where} ORDER BY (status='pending') DESC, created_at DESC LIMIT ?`
      ).bind(...binds, limit).all().catch(() => ({ results: [] }));
      // pending 카운트: 강사는 본인 것만, 지사·대리점은 자기 학생만, 본사는 전체
      const _pendConds: string[] = ["status='pending'"]; const _pendBinds: any[] = [];
      if (_srActor.isTeacher) { _pendConds.push('teacher_name = ?'); _pendBinds.push(teacher); }
      else if (_srScopeCond) { _pendConds.push(_srScopeCond); _pendBinds.push(..._srC.binds); }
      const pending: any = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM schedule_change_requests WHERE ${_pendConds.join(' AND ')}`
      ).bind(..._pendBinds).first().catch(() => null);
      return json({ ok: true, pending_count: pending?.c || 0, rows: rs.results || [], scope: _srScope.type });
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
      /* 🔒 (2026-08-17) 남의 지사·대리점 요청은 승인·거절할 수 없다.
           목록만 걸러 두면 **id 만 알면 남의 요청도 승인**된다(id 는 1,2,3… 순번이다).
           목록과 «같은 조건» 으로 다시 확인한다 — 한쪽만 막으면 어긋난다
           (CLAUDE.md 의 «짝이 되는 API 끼리 판정이 어긋나지 않았는지» 함정). */
      const _sdScope = await getScope(env as any, request);
      const _sdC = scopeStudentCond(_sdScope);
      if (_sdC.cond) {
        const _own: any = await env.DB.prepare(
          `SELECT 1 AS ok FROM schedule_change_requests
            WHERE id = ?
              AND schedule_id IN (SELECT id FROM class_schedules WHERE user_id IN (SELECT user_id FROM students_erp WHERE ${_sdC.cond}))
            LIMIT 1`
        ).bind(id, ..._sdC.binds).first().catch(() => null);
        if (!_own) return json({ ok: false, error: 'forbidden_scope', scope: _sdScope.type,
          message: '이 요청은 다른 지사·대리점 것입니다.' }, 403);
      }
      if (row.status !== 'pending') return json({ ok: false, error: 'already_decided', status: row.status }, 409);

      const now = Date.now();
      let applied: string | null = null;
      let conflictInfo: any = null;   // 겹쳐서 자동 이동을 못 한 경우 사유(한/영)
      if (action === 'approved' && row.schedule_id) {
        try {
          // ⚠️ 운영 스케줄은 대부분 반복(매주, scheduled_date=NULL) — 반복 row 를 덮어쓰면
          //   그 주만이 아니라 모든 주가 바뀌므로, 날짜 지정 수업일 때만 자동 반영한다.
          //   반복 수업은 요청 기록만 영구 보존(applied='recorded') → 시간표에서 수동 조정.
          const cs: any = await env.DB.prepare(
            `SELECT id, scheduled_date, start_time, duration_min, user_id, teacher_id FROM class_schedules WHERE id = ? LIMIT 1`
          ).bind(row.schedule_id).first().catch(() => null);
          const isDated = !!(cs && cs.scheduled_date);
          if (isDated && row.new_date && row.new_time) {
            // ⛔ (2026-08-04) 옮기기 전에 «그 자리가 비어 있는지» 확인한다.
            //   여기엔 겹침 검사가 없어서, 강사 요청을 승인하면 다른 수업과 겹쳐도 그대로 옮겨졌다.
            //   겹치면 옮기지 않고 'conflict' 로 남긴다 — 승인 자체는 그대로 기록되므로
            //   관리자가 시간표에서 자리를 보고 손으로 옮기면 된다. (조용히 겹치게 두는 것보다 낫다)
            const conf = await findScheduleConflicts(env, {
              kind: 'one_off',
              userId: cs.user_id, teacherId: cs.teacher_id,
              schedDate: String(row.new_date), startTime: String(row.new_time),
              durationMin: Number(cs.duration_min) > 0 ? Number(cs.duration_min) : DEFAULT_CLASS_MINUTES,
              excludeId: row.schedule_id,
            });
            if (conf.has) {
              applied = 'conflict';
              conflictInfo = { ko: conf.ko, en: conf.en, student: conf.student.length, teacher: conf.teacher.length };
            } else {
              await env.DB.prepare(`UPDATE class_schedules SET scheduled_date = ?, start_time = ?, updated_at = ? WHERE id = ?`)
                .bind(row.new_date, row.new_time, now, row.schedule_id).run();
              applied = 'moved';
            }
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
      //   'conflict' = 승인은 했으나 그 자리가 겹쳐 «자동 이동을 하지 않은» 상태 → 이력에도 남기지 않는다
      if (action === 'approved' && applied && applied !== 'conflict') {
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
      return json({
        ok: true, id, status: action, applied, decided_at: now,
        // 겹쳐서 자동 이동을 못 했으면 화면이 그 사유를 그대로 보여줄 수 있게 함께 내려준다
        ...(conflictInfo ? { conflict: conflictInfo, message: conflictInfo.ko, message_en: conflictInfo.en } : {}),
      });
    }

    // ── GET /api/admin/classes/today — 📅 오늘 수업 전체 (매니저용) ──
    //   (2026-07-23) 매니저 요청: "오늘의 수업에서 바로 수업에 들어갈 수 있어야 한다.
    //   강사가 못 들어오면 매니저가 최대한 빨리 대신 맡는다."
    //   기존엔 '오늘 수업' 목록이 학생/강사 본인용(/api/class/today)뿐이라 매니저가 볼 방법이 없었다.
    //   room_id 규칙은 예약 기반 결정론 `class-{scheduleId}-{YYYYMMDD}` 로 api-mango.ts 와 동일해야 한다
    //   (다르면 매니저가 학생과 다른 방에 들어가 서로 못 만난다).
    /* 📅 (2026-08-25 8/25 매니저 보고서 ②③) 「오늘 전체 수업」이 늘 비어 있던 이유 — **원인이 둘이었다**
       ═══════════════════════════════════════════════════════════════════════════
       🔴 ① 이 경로가 **줄곧 404 였다.** `index.ts` 라우팅 목록(관문 ②)에는 있었지만
          `api-mango.ts` 위임 가드(관문 ③)에 없어서 `handleAdminApi` 까지 오지 못했다
          (2026-07-23 신설 이래 한 번도 등록된 적이 없다 — `git log -S` 로 확인).
          ⚠️ 화면에는 «고장» 으로 안 보였다: 404 본문 `{error:'Not Found'}` 에는 `ok` 칸이 없어
             `if (d.ok === false)` 를 통과하고 `d.sessions || []` 가 빈 배열이 되어
             **「오늘 예정된 수업이 없습니다」라는 정상 문구**로 그려졌다.
          → 2026-08-25 에 관문 ③에 등록했다. 회귀 감시는 `classes_today_cafe24_harness` ②-1
             (문자열이 아니라 **그 조건식을 실제로 돌려서** 판정한다).

       ② 그리고 관문을 뚫어도 이 API 는 `class_schedules` 만 읽었다. **실제 운영 수업은 카페24가 정본**이고
       카페24 예약은 그 표에 한 줄도 안 들어온다(cafe24-sync 는 `attendance` 에 `c24-{class_id}`
       씨앗으로만 넣는다). 그래서 매니저가 [Load] 를 눌러도 «No classes scheduled for today»
       였다 — 같은 시각 카페24에서는 수업 6건이 돌고 있었다(8/25 보고서 스크린샷 실측).
       → 두 갈래를 **한 목록으로 합쳐서** 준다. 어디서 온 줄인지는 `source` 로 구분한다.

       ⛔ 카페24 줄에는 [입장]·[참관] 버튼을 주지 않는다(`join_open`·`observable` = false).
          카페24 수업은 망고아이 화상방을 거치지 않아 **들어갈 방이 없다** — 버튼을 주면
          아무도 없는 방으로 보낸다(2026-08-24 에 같은 이유로 «오늘 목록에 안 넣는다» 했던 판단).
          동기화가 가져오는 속성에 강의실 URL 이 없어서(cafe24-sync.ts 의 Cypher) 링크도 못 건다.

       🔒 지사·대리점 격리 — 이 목록은 manager.html 도 쓰고, 그 화면은 지사·대리점도 쓴다.
          범위 밖 학생 이름이 나가면 개인정보가 샌다 → `scopeStudentCond` 로 자른다
          (`/api/admin/live-classes`·`classes-now` 와 같은 방식).
       ⛔ 강사는 아예 막는다 — 전사 학생 이름·강사 배정이 한 화면에 모인다. 강사가 볼 것은
          teacher.html 이 이미 준다. `scope.type='none'`(내부직원·교사)은 격리 대상이 아니라
          **스코프로는 못 막는다** → `isTeacher` 로 따로 끊는다(CLAUDE.md 2장 `canEditOrg` 함정과 같은 뿌리).

       🧹 자리표시 행(`user_id` = 'lms'·'type_seed')은 뺀다 — 학생이 안 붙은 «자리만 잡아 둔» 행이라
          매니저 목록에 섞이면 수백 건이 실제 수업처럼 보인다(실측 기준 lms 518·type_seed 140).
          ⚠️ 제외식은 `schedule-conflict.ts` 의 `NOT_PLACEHOLDER`·api-teacher.ts·churn-graph.ts 와
             **글자 하나까지 같게** 유지할 것 — 화면마다 다르게 세기 시작하면 아무도 못 고친다.

       📆 `?date=YYYY-MM-DD` — 없으면 오늘(KST). 「완료된 수업 기록」(보고서 ③)이 같은 API 다.
          날짜만 바꾸면 되므로 조회를 따로 만들지 않는다(둘이 어긋날 일이 없다). */
    if (method === 'GET' && path === '/api/admin/classes/today') {
      const _ctActor = await getAdminActor(request, env as any);
      if (_ctActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, teacher_id TEXT, student_name TEXT, schedule_kind TEXT, day_of_week INTEGER, scheduled_date TEXT, start_time TEXT, duration_min INTEGER, status TEXT);`); } catch {}
      /* 🔄 (2026-08-28) 1회성 대체강사 오버레이 표 — enroll-ops.ts 의 ensureEnrollTables() 와 같은
         정의를 여기서도 방어적으로 한 번 더 만든다(그 핸들러가 먼저 안 돌았을 수도 있어서 —
         위 class_schedules 방어 생성과 같은 이유). */
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_substitutions (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, sub_date TEXT NOT NULL, original_teacher_id TEXT, substitute_teacher_id TEXT NOT NULL, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, status TEXT NOT NULL DEFAULT 'active');`); } catch {}
      /* ⚠️ (2026-08-30) 인덱스도 «같이» 만든다 — CREATE 만 베껴 두면 이 핸들러가 먼저 돌 새 DB 에서는
         (schedule_id, sub_date) UNIQUE 가 없는 표가 만들어져 UPSERT 가 «하루 한 명» 을 못 지킨다. */
      try { await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sub_slot ON class_substitutions(schedule_id, sub_date)`).run(); } catch {}
      /* ⚡ 하루치를 날짜로 집는 인덱스가 없었다(있는 것은 room_id 단독·(user_id,date)·(teacher_uid,date)).
         `date = ?` 로 거르므로 이 인덱스가 없으면 attendance 전체를 훑는다. 인덱스 추가는
         데이터 변경이 아니라 안전하다(CLAUDE.md 1-1 은 DELETE/UPDATE/DROP 금지). */
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_date_room ON attendance(date, room_id)`); } catch {}

      const KST = 9 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const k = new Date(nowMs + KST);                       // KST 벽시계
      const p2 = (n: number) => String(n).padStart(2, '0');
      const todayStr = `${k.getUTCFullYear()}-${p2(k.getUTCMonth() + 1)}-${p2(k.getUTCDate())}`;
      /* 📆 조회할 날짜 — 모양이 안 맞으면 조용히 오늘로 (엉뚱한 문자열이 SQL 비교에 들어가면
         에러 없이 «빈 표» 가 되어 「수업이 없다」로 읽힌다. CLAUDE.md 2장 분기 비교 함정과 같은 뿌리) */
      const qDate = String(url.searchParams.get('date') || '').trim();
      const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? qDate : todayStr;
      const kY = Number(dateStr.slice(0, 4)), kMo = Number(dateStr.slice(5, 7)) - 1, kD = Number(dateStr.slice(8, 10));
      const kDow = new Date(Date.UTC(kY, kMo, kD)).getUTCDay();
      const ymd = `${kY}${p2(kMo + 1)}${p2(kD)}`;
      const OPEN_BEFORE = 10 * 60 * 1000;                    // 정규 수업: 시작 10분 전부터 입장 가능
      // ⏰ 레벨테스트만 30분 (api-mango.ts·leveltest-ticket.ts 와 같은 값 — 셋이 어긋나면 화면끼리 말이 달라진다)
      const OPEN_BEFORE_LEVELTEST = 30 * 60 * 1000;
      const LATE_AFTER = 15 * 60 * 1000;                     // 종료 15분 후까지 지각 입장 허용

      const _ctScope = await getScope(env as any, request);
      const _ctStu = scopeStudentCond(_ctScope, 'se');       // 본사·내부직원은 빈 조건(=전체)

      let rows: any = { results: [] };
      try {
        rows = await env.DB.prepare(
          `SELECT cs.*, t.name AS t_name, se.level AS se_level, se.textbook AS se_textbook
             FROM class_schedules cs
             LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
             LEFT JOIN students_erp se ON se.user_id = cs.user_id
            WHERE COALESCE(cs.status,'active') != 'cancelled'
              AND LOWER(COALESCE(cs.user_id,'')) NOT IN ('lms','type_seed')
              ${_ctStu.cond ? `AND (${_ctStu.cond})` : ''}`
        ).bind(..._ctStu.binds).all<any>();
      } catch {
        /* students_erp 는 스키마 드리프트가 있는 표다 — 조인이 깨지면 조인 없이 다시 한 번.
           ⚠️ 단 **스코프가 걸린 요청은 폴백하지 않는다**: 조건이 사라지면 남의 지사 학생까지 나간다.
              폴백은 조건이 없는 본사·내부직원일 때만 안전하다. */
        if (_ctStu.cond) { rows = { results: [] } as any; }
        else rows = await env.DB.prepare(
          `SELECT * FROM class_schedules
            WHERE COALESCE(status,'active') != 'cancelled'
              AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`
        ).all<any>().catch(() => ({ results: [] } as any));
      }

      /* 🔄 (2026-08-28) 이 날짜의 1회성 대체강사 오버레이 — schedule_id → 대체강사 id/이름.
         recurring 행의 teacher_id 는 그대로(=원래 강사)이므로, 화면에 보일 이름만 여기서 덮는다. */
      const subOverlay = new Map<string, { id: string; name: string | null }>();
      try {
        const subRows: any = await env.DB.prepare(
          `SELECT cs2.schedule_id, cs2.substitute_teacher_id, t2.name AS sub_name
             FROM class_substitutions cs2 LEFT JOIN teachers t2 ON CAST(t2.id AS TEXT) = CAST(cs2.substitute_teacher_id AS TEXT)
            WHERE cs2.sub_date = ? AND cs2.status = 'active'`
        ).bind(dateStr).all();
        for (const r of ((subRows?.results as any[]) || [])) {
          subOverlay.set(String(r.schedule_id), { id: String(r.substitute_teacher_id), name: r.sub_name || null });
        }
      } catch (e: any) { console.warn('[classes/today] substitution overlay:', e?.message); }

      const sessions: any[] = [];
      for (const s of (rows.results || [])) {
        // 오늘 열리는 수업인가? (일회성=날짜 일치 / 반복=요일 일치)
        let occurs = false;
        if (s.scheduled_date) occurs = (String(s.scheduled_date).slice(0, 10) === dateStr);
        // ⚠️ Number() 로 비교하지 말 것 — 운영 값은 'Thu' 같은 문자열이라 NaN 이 된다(admDowMatches 주석 참고).
        else if (s.day_of_week != null && s.day_of_week !== '') occurs = admDowMatches(s.day_of_week, kDow);
        if (!occurs) continue;

        const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
        const start_ts = Date.UTC(kY, kMo, kD, hh || 0, mm || 0, 0) - KST;
        const dur = Number(s.duration_min || s.duration_minutes) || 30;
        const end_ts = start_ts + dur * 60000;
        const open_at_ts = start_ts - (String(s.class_type || '') === 'level_test' ? OPEN_BEFORE_LEVELTEST : OPEN_BEFORE);
        const close_at_ts = end_ts + LATE_AFTER;
        let status: string;
        if (nowMs < open_at_ts) status = 'early';
        else if (nowMs < start_ts) status = 'open';
        else if (nowMs <= close_at_ts) status = 'live';
        else status = 'ended';

        /* 🔄 대체강사가 배정된 회차면 화면에는 대체강사만 보인다 — 원래 강사 이름은
           substituted_from 에 남겨 「오늘 왜 다른 선생님이냐」 물었을 때 바로 답할 수 있게. */
        const sub = subOverlay.get(String(s.id));
        const origTeacherName = s.t_name || s.teacher_name || null;

        sessions.push({
          schedule_id: s.id,
          source: 'mangoi',            // 🏷 망고아이 예약 = 우리 방이 있다 → 입장·참관 가능
          observable: true,
          room_id: `class-${s.id}-${ymd}`,
          student_uid: s.user_id || null,
          student_name: s.student_name || null,
          /* 📚 (2026-08-25 보고서 ①) LMS 한 줄에 있던 「TEXTBOOK 배정 없음」 배지의 우리 쪽 대응.
             정본은 students_erp.textbook — 화상수업의 «배정 교재 자동 로드» 가 읽는 그 칸이다.
             비어 있으면 수업 전에 사람이 손써야 한다는 뜻이라, 강사·매니저가 먼저 봐야 한다. */
          level: s.se_level || null,
          textbook: s.se_textbook || null,
          textbook_assigned: !!String(s.se_textbook || '').trim(),
          teacher_id: sub ? sub.id : (s.teacher_id || null),
          teacher_name: sub ? sub.name : origTeacherName,
          substituted: !!sub,
          substituted_from: sub ? origTeacherName : null,
          start_time: s.start_time || null,
          duration_min: dur,
          start_ts, end_ts, status,
          join_open: nowMs >= open_at_ts && nowMs <= close_at_ts,
          /* 🧪 (2026-08-06 마이마이 요청) "레벨테스트와 일반수업을 한 화면에서 보고 싶다".
             레벨테스트도 예약을 잡는 순간 class_schedules 의 일회성(one_off) 행이 되므로
             목록은 이미 하나다. 다만 **구분이 안 돼서** 따로 있는 것처럼 보였다.
             → 별도 목록을 만들지 않고 종류만 실어 보낸다(화면에서 배지로 구분). */
          schedule_kind: s.schedule_kind || null,
          is_level_test: /leveltest|level_test|level-test/i.test(String(s.source || '') + ' ' + String(s.notes || '')),
        });
      }
      /* ── ② 카페24 예약 수업 (attendance 의 `c24-{class_id}` 씨앗) ──────────────────
         실제 운영 수업이 여기 있다(하루 143건 안팎). 학생 이름은 명부에서 가져오면서
         **같은 조인으로 스코프를 자른다** — 명부에 없는 학생은 «범위를 확인할 수 없음» 이라
         지사·대리점에게는 보이지 않는다(`classes-now` 와 같은 규칙).
         ⛔ `attendance.teacher_name` 은 읽지 않는다 — 옛 동기화가 남의 이름을 넣어 둔 칸이다.
            강사 이름은 `loadCafe24TeacherMap` 을 거쳐 «유일하게 맞을 때만» 붙이고, 아니면 비운다. */
      let c24Rows: any[] = [];
      try {
        const rs: any = await env.DB.prepare(
          `SELECT a.room_id, a.user_id, a.username, a.status, a.joined_at, a.left_at, a.teacher_uid,
                  se.korean_name AS stu_ko, se.english_name AS stu_en,
                  se.level AS se_level, se.textbook AS se_textbook
             FROM attendance a
             LEFT JOIN students_erp se ON se.user_id = a.user_id
            WHERE a.room_id LIKE 'c24-%' AND a.date = ?
              ${_ctStu.cond ? `AND (${_ctStu.cond})` : ''}
            ORDER BY a.joined_at ASC LIMIT 400`
        ).bind(dateStr, ..._ctStu.binds).all();
        c24Rows = (rs.results || []) as any[];
      } catch (e: any) { console.warn('[classes/today] cafe24 rows:', e?.message); }

      if (c24Rows.length) {
        const tmap = await loadCafe24TeacherMap(env as any, c24Rows.map(r => r.teacher_uid));
        for (const r of c24Rows) {
          const start_ts = Number(r.joined_at) || 0;
          const end_ts = Number(r.left_at) || (start_ts + 30 * 60000);
          let status: string;
          if (nowMs < start_ts) status = 'early';
          else if (nowMs <= end_ts + LATE_AFTER) status = 'live';
          else status = 'ended';
          sessions.push({
            schedule_id: null,
            source: 'cafe24',          // 🏷 카페24 수업 = 우리 방이 없다 → 입장·참관 버튼을 주지 않는다
            observable: false,
            room_id: r.room_id,        // 표시용 식별자일 뿐 — 이 번호로 망고아이 방을 열 수 없다
            student_uid: r.user_id || null,
            student_name: r.stu_ko || r.username || r.stu_en || null,
            level: r.se_level || null,
            textbook: r.se_textbook || null,
            textbook_assigned: !!String(r.se_textbook || '').trim(),
            teacher_id: null,
            teacher_name: (tmap.get(String(r.teacher_uid || '')) || {}).name || null,
            start_time: new Date(start_ts + KST).toISOString().slice(11, 16),
            duration_min: Math.max(1, Math.round((end_ts - start_ts) / 60000)),
            start_ts, end_ts, status,
            join_open: false,
            cafe24_status: r.status || null,
            schedule_kind: null,
            is_level_test: false,
          });
        }
      }

      sessions.sort((a, b) => a.start_ts - b.start_ts);
      const c24Count = sessions.filter(x => x.source === 'cafe24').length;
      return json({
        ok: true,
        // 🔁 `today` 는 옛 화면이 읽던 이름이라 그대로 둔다(값은 «조회한 날짜»). `date` 가 새 이름.
        today: dateStr, date: dateStr, is_today: dateStr === todayStr,
        now: nowMs, count: sessions.length, sessions,
        counts: {
          mangoi: sessions.length - c24Count,
          cafe24: c24Count,
          joinable: sessions.filter(x => x.join_open).length,
        },
        level_test_count: sessions.filter(x => x.is_level_test).length,
      });
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

    // ── GET /api/admin/postponed-classes — ⏸ 연기 수업 통합 조회 (매니저 전용 화면) ──
    //   (2026-07-23 매니저 요청) "연기된 수업 목록 / 유료·무료 / 연기한 정확한 시각을 보고 싶다."
    //   데이터는 이미 두 곳에 나뉘어 있었다:
    //     ① schedule_change_requests — 학생·강사가 올린 연기/취소 요청. fee_type·minutes_before 있음.
    //     ② class_audit_log        — 관리자가 직접(화면·AI명령) 연기한 이력. 요금 정보가 없음.
    //   매니저는 둘을 따로 열어 대조해야 했다 → 여기서 하나로 합쳐 준다.
    //   ⚠️ ②는 요금이 저장돼 있지 않으므로 '수업 시작 30분 전' 규칙으로 서버가 되계산하고
    //      fee_estimated=1 로 표시한다(추정치임을 화면에서 숨기지 않기 위함).
    //   ⚠️ ①이 승인되면 ②에 source='schedule-request' 로 한 줄 더 쌓인다 → 중복이므로 제외.
    if (method === 'GET' && path === '/api/admin/postponed-classes') {
      const _pcActor = await getAdminActor(request, env as any);
      await ensureScheduleRequestTable();

      const FREE_IF_MINUTES_BEFORE_GT = 30;   // 정책: 시작 30분 전보다 일찍 = 무료
      const nowMs = Date.now();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const to = parseInt(url.searchParams.get('to') || '', 10) || nowMs + 60000;
      const from = parseInt(url.searchParams.get('from') || '', 10) || (to - days * 86400000);
      const feeQ = (url.searchParams.get('fee') || 'all').trim();          // all|paid|free|unknown
      const kindQ = (url.searchParams.get('kind') || 'postpone').trim();   // postpone|cancel|change|all
      const statusQ = (url.searchParams.get('status') || 'all').trim();    // all|pending|approved|rejected|applied
      const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '300', 10) || 300));
      let teacherQ = (url.searchParams.get('teacher_name') || '').trim();
      // 🔐 강사 로그인은 본인 수업만(타 강사·타 학생 노출 방지)
      if (_pcActor.isTeacher) {
        if (!_pcActor.name) return json({ ok: true, rows: [], summary: { total: 0 } });
        teacherQ = _pcActor.name;
      }

      // 원 수업 시작(KST) 기준으로 "몇 분 전에 연기했나" 계산
      const minsBefore = (d?: string | null, t?: string | null, at?: number | null): number | null => {
        if (!d || !t || !at) return null;
        const ms = Date.parse(`${String(d).slice(0, 10)}T${String(t).slice(0, 5)}:00+09:00`);
        if (isNaN(ms)) return null;
        return Math.round((ms - at) / 60000);
      };
      const feeOf = (m: number | null): string | null => (m === null ? null : (m > FREE_IF_MINUTES_BEFORE_GT ? 'free' : 'paid'));

      const out: any[] = [];

      // ① 연기·취소·변경 요청
      const reqRs: any = await env.DB.prepare(
        `SELECT * FROM schedule_change_requests WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 1000`
      ).bind(from, to).all().catch(() => ({ results: [] }));
      for (const r of (reqRs.results || [])) {
        const kind = r.request_type === 'cancel' ? 'cancel' : r.request_type === 'change' ? 'change' : 'postpone';
        let mb: number | null = (typeof r.minutes_before === 'number') ? r.minutes_before : null;
        if (mb === null) mb = minsBefore(r.orig_date, r.orig_time, r.created_at);
        const fee = (r.fee_type === 'paid' || r.fee_type === 'free') ? r.fee_type : (kind === 'change' ? null : feeOf(mb));
        out.push({
          key: 'req-' + r.id,
          origin: 'request',
          kind,
          postponed_at: r.created_at,                 // ⏱ 연기(요청)한 정확한 시각
          decided_at: r.decided_at || null,
          decided_by: r.decided_by || null,
          lesson_date: r.orig_date || null,
          lesson_time: r.orig_time ? String(r.orig_time).slice(0, 5) : null,
          new_date: r.new_date || null,
          new_time: r.new_time ? String(r.new_time).slice(0, 5) : null,
          teacher_name: r.teacher_name || null,
          student_name: r.student_name || null,
          requested_by: r.requester_name || null,
          requester_role: r.requester_role || null,
          fee_type: fee,
          fee_estimated: (r.fee_type === 'paid' || r.fee_type === 'free') ? 0 : (fee ? 1 : 0),
          minutes_before: mb,
          status: r.status || 'pending',
          reason: r.reason || null,
          note: r.decide_memo || null,
          schedule_id: r.schedule_id || null,
        });
      }

      // ② 관리자가 직접 연기·이동한 이력 (요청 승인분은 중복이라 제외)
      const auditRows = await listClassAudit(env, { from, to, limit: 1000 }).catch(() => [] as any[]);
      for (const a of auditRows) {
        if (a.action !== 'postpone' && a.action !== 'reschedule') continue;
        if (a.source === 'schedule-request') continue;                 // ①과 중복
        const mb = minsBefore(a.lesson_date, a.lesson_time, a.created_at);
        out.push({
          key: 'aud-' + a.id,
          origin: 'audit',
          kind: a.action === 'reschedule' ? 'change' : 'postpone',
          postponed_at: a.created_at,
          decided_at: null,
          decided_by: null,
          lesson_date: a.lesson_date || null,
          lesson_time: a.lesson_time ? String(a.lesson_time).slice(0, 5) : null,
          new_date: null,
          new_time: null,
          teacher_name: a.teacher_name || null,
          student_name: a.student_name || null,
          requested_by: a.actor || null,
          requester_role: a.actor_role || 'admin',
          fee_type: a.action === 'reschedule' ? null : feeOf(mb),
          fee_estimated: 1,                                            // 저장값이 아니라 규칙 되계산
          minutes_before: mb,
          status: 'applied',
          reason: a.reason || null,
          note: a.detail || null,
          schedule_id: a.schedule_id || null,
        });
      }

      // 필터 → 정렬 → 자르기
      let rows = out;
      if (kindQ !== 'all') rows = rows.filter(r => r.kind === kindQ);
      if (feeQ !== 'all') rows = rows.filter(r => (feeQ === 'unknown' ? !r.fee_type : r.fee_type === feeQ));
      if (statusQ !== 'all') rows = rows.filter(r => r.status === statusQ);
      if (teacherQ) {
        const tq = teacherQ.toLowerCase();
        rows = rows.filter(r => String(r.teacher_name || '').toLowerCase().includes(tq));
      }
      rows.sort((a, b) => (b.postponed_at || 0) - (a.postponed_at || 0));
      const matched = rows.length;
      rows = rows.slice(0, limit);

      const summary = {
        total: matched,
        paid: rows.filter(r => r.fee_type === 'paid').length,
        free: rows.filter(r => r.fee_type === 'free').length,
        unknown: rows.filter(r => !r.fee_type).length,
        pending: rows.filter(r => r.status === 'pending').length,
        teachers: new Set(rows.map(r => r.teacher_name).filter(Boolean)).size,
        students: new Set(rows.map(r => r.student_name).filter(Boolean)).size,
      };
      return json({
        ok: true, now: nowMs, from, to, matched, returned: rows.length,
        policy: { free_if_minutes_before_gt: FREE_IF_MINUTES_BEFORE_GT },
        summary, rows,
      });
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
      const prof = (data.teachers || []).find((t: any) => sameTeacherName(t.korean_name, teacherName) || sameTeacherName(t.english_name, teacherName));
      // ⚠️ 두 번호 체계 — l.teacher_id 는 원부 teachers.id 라 프로필 번호와 비교하면 남의 수업이
      //   잡힌다. 수업 행의 profile_id(연결된 프로필)로 거른다(2026-08-12, payroll/lessons 와 동일 수리).
      const done = data.lessons.filter((l: any) =>
        l.date === dateStr && l.status === 'finish' &&
        ((prof && String(l.profile_id ?? '') === String(prof.id)) || sameTeacherName(l.teacher_name, teacherName)));

      /* 🔁 이미 «학부모에게 나간» 수업은 초안을 만들지 않는다 (2026-08-15)
         왜 — 학부모에게 문자가 나가는 길이 두 갈래인데 여기서는 한 갈래만 보고 있었다.
           ① 강사가 수업일지를 쓰면 → /api/eval/create → student_evaluations + 학부모 문자
           ② 이 초안을 승인하면     → approve          → teacher_feedbacks   + 학부모 문자
         예전 코드는 feedback_drafts 만 확인해서, ①을 이미 쓴 수업도 «초안 없음» 으로 보고
         초안을 다시 만들었다. 강사가 그걸 승인하면 같은 수업으로 학부모에게 문자가 두 번 간다.
         ⚠️ 드물게 나는 사고가 아니다 — 경고 카드는 «이번 달 미작성» 이 한 건만 있어도 뜨고,
            「AI 초안 만들기」는 그날 완료 수업 **전체** 를 대상으로 돌기 때문에,
            오늘 일지를 이미 쓴 수업까지 한꺼번에 걸린다.
         그래서 세 테이블을 다 보고 하나라도 있으면 건너뛴다. */
      const roomIds = done.map((l: any) => String(l.room_id || '')).filter(Boolean);
      //   바인드 100개 한도 분할은 공용 selectInChunks 에 맡긴다(직접 자르지 않는다).
      //   swallowErrors — 표가 아직 없는 DB 도 있다. 그 경우는 «없음» 으로 치고 넘어간다.
      const have = new Set<string>();
      for (const table of ['feedback_drafts', 'student_evaluations', 'teacher_feedbacks']) {
        const rows = await selectInChunks<any>(
          env.DB, roomIds,
          (ph) => `SELECT room_id FROM ${table} WHERE room_id IN (${ph})`,
          { swallowErrors: true },
        );
        for (const r of rows) have.add(String(r.room_id));
      }
      const targets = done.filter((l: any) => !have.has(String(l.room_id || '')));

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
          // ⭐ 칭찬 횟수는 정본 하나로 — 그 전에는 이 쿼리가 두 파일에 복사돼 있었고 «둘 다» 키가 틀려
          //    (쓰기는 room, 읽기는 room_id) 모든 방에서 늘 0 이었다(point-policy.ts 주석 참고).
          praiseCount = await praiseCountForRoom(env, l.room_id);
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

      // 📣 (2026-07-22) 학부모 컴플레인 #3: 피드백이 등록돼도 학부모가 알 길이 없던 문제.
      //    승인 즉시 학부모(없으면 학생) 번호로 피드백 본문을 문자 발송. 실패해도 승인 자체는 유지.
      let parentNotify: any = undefined;
      if (action === 'approved') {
        try {
          const stu: any = await env.DB.prepare(
            `SELECT * FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
          ).bind(row.student_uid || '', row.student_uid || '').first();
          const phone = stu && String(stu.parent_phone || stu.student_phone || stu.phone || '').trim();
          if (phone) {
            const stuName = row.student_name || (stu && (stu.korean_name || stu.name)) || '학생';
            const msg = `[망고아이] ${stuName} 학생의 오늘 수업 피드백이 도착했어요 💌\n👩‍🏫 ${row.teacher_name || '담당 선생님'}:\n"${String(finalKo || '').slice(0, 350)}"`;
            const r = await sendPlainSms(env, phone, msg);
            parentNotify = r && r.ok ? 'sent' : (r && (r.error || r.message)) || 'failed';
          } else parentNotify = 'no_phone';
        } catch (e: any) { parentNotify = 'error:' + String(e?.message || e).slice(0, 80); }
      }
      return json({ ok: true, id, status: action, edited: !!edited, approved_at: now, parent_notify: parentNotify });
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
    /* 🔑 강사 → 로그인 아이디 (2026-09-01) — 목록 조회와 단건 조회가 «같은 계정» 을 고르도록
       문장을 한 곳에 둔다. 조인이 아니라 서브쿼리라 링크가 몇 개든 행이 늘지 않는다. */
    const PICK_LOGIN_USERNAME = `(SELECT tal.username FROM teacher_account_links tal
                                   WHERE CAST(tal.teacher_id AS TEXT) = CAST(tp.linked_teacher_id AS TEXT)
                                   ORDER BY COALESCE(tal.linked_at, 0) DESC, tal.username ASC
                                   LIMIT 1) AS login_username`;
    /* 연결이 두 개 이상이면 화면이 그 사실을 말해야 한다 — 골라 보여 주고 «감추지» 않는다. */
    const LOGIN_LINK_COUNT = `(SELECT COUNT(*) FROM teacher_account_links tal2
                                WHERE CAST(tal2.teacher_id AS TEXT) = CAST(tp.linked_teacher_id AS TEXT)) AS login_link_count`;

    // ⚠ env.DB.exec() 는 단일 라인 SQL 만 허용 — 여러 줄 쓰면 SQL_STATEMENT_ERROR
    const ensureTeacherProfilesSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, mbti TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      // 기존 DB 에 mbti 컬럼 없으면 보강(이미 있으면 SQLite throw → 흡수)
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN mbti TEXT`); } catch {}
      // 🌏 (2026-07-23 사장님 지시) 국적 — 이 값이 로그인 계정으로 흘러가 화면 언어를 정한다.
      //   ISO 3166-1 alpha-2 대문자 2글자('KR' | 'PH' | 'US' …). 'KR' 만 한국어, 나머지는 영어.
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN nationality TEXT`); } catch {}
      /* 🔗 (2026-07-30) teachers(급여·스케줄용, 사진/MBTI 없음) ↔ teacher_profiles(사진·MBTI 있음)
         연결 컬럼 — 제보 #2-1. 이름으로 자동 매칭 시도했더니 29명 중 1명만 우연히 일치해서
         자동 조인이 불가능함을 확인(잘못 매칭하면 다른 강사 사진이 나가는 사고가 됨).
         그래서 사람이 직접 확인하며 연결하는 컬럼을 둔다 — 관리자 화면 "강사 사진 연결" 탭에서 채움. */
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN linked_teacher_id INTEGER`); } catch {}
      /* 🙈 (2026-09-01 사장님 「활동, 비활동, 그리고 안보임」) 명부에서 감출지 — status 와 «다른 축».
         ⛔ 「안보임」을 status 값으로 만들면 «퇴사했지만 정산이 남아 명부에 남길 사람» 과
            «활동중인데 감추고 싶은 행»(실측: 테스트강사·파라테스트)을 동시에 표현할 수 없다.
         ⚠️ 지연 ALTER 라 첫 목록 조회가 돌아야 칸이 생긴다 — 배포 직후 SQL 에
            `no such column: list_hidden` 이 나오는 것은 배포 실패가 아니다
            (attendance.host·vc_quality.novideo 와 같은 방식). 읽는 쪽은 COALESCE 로 버틴다. */
      try { await env.DB.exec(`ALTER TABLE teacher_profiles ADD COLUMN list_hidden INTEGER DEFAULT 0`); } catch {}
      // 🔑 (2026-08-24) 로그인 아이디를 강사 프로필 화면에서 보여주려면 이 표가 있어야 한다 —
      //   teacher_account_links(admin_account.username ↔ teachers.id, "강사 계정 연결" 카드가 채움)가
      //   아직 한 번도 안 열렸으면 없을 수 있어 여기서도 보강한다.
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER);`); } catch {}
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
      /* 🙈 (2026-09-01) 명부 숨김 — status 와 «다른 축» 이라 조건도 따로 건다.
           (없음)            → 보이는 행만        ← 기본
           ?hidden=1         → 숨긴 행만          ← 화면 필터의 「🙈 안보임」
           ?include_hidden=1 → 전부
         ⚠️ 숨김은 «삭제» 가 아니다. 위 ensureTeacherProfilesSchema() 가 먼저 돌아
            칸을 만들어 두므로 여기서 COALESCE 로 읽어도 안전하다. */
      const fHidden = url.searchParams.get('hidden') || '';
      if (fHidden === '1') where.push(`COALESCE(tp.list_hidden, 0) = 1`);
      /* ⚠️ 강사 본인 조회에는 걸지 않는다 — 위에서 이미 «자기 행 하나» 로 좁혔으므로,
         관리자가 그 강사를 명부에서 숨긴 순간 본인 화면이 빈손이 된다. 숨김은
         «관리자 목록에서 안 보이게» 하려는 것이지 본인에게 감추려는 것이 아니다. */
      else if (!_tpActor.isTeacher && (url.searchParams.get('include_hidden') || '') !== '1') {
        where.push(teacherVisibleSql('tp'));
      }
      /* 🔑 (2026-08-24) login_username — linked_teacher_id(teachers.id)로 그 강사의 실제
         로그인 아이디를 함께 내려준다(연결이 없으면 NULL, 추측 아님).

         🔴 (2026-09-01) LEFT JOIN 이 아니라 «서브쿼리» 인 이유 — 조인은 행을 늘린다.
            teacher_account_links 에 같은 teacher_id 가 두 줄이면 프로필 하나가
            **두 줄로 그려진다.** 사장님 제보 「왜 Len 이 두 명이나 있지?」가 그것이었다:
            원부 18번(LEN)에 `mangoi_168` 과 `Mangoi_168`(대문자 M) 두 링크가 걸려 있었고
            — 뿌리는 CLAUDE.md 의 「대소문자만 다른 계정이 두 벌 생긴다」 함정 —
            명부에 사진·전화·MBTI 까지 똑같은 줄이 나란히 나왔다.
            ⛔ 「연결 카드에서 둘 다 연결하지 마세요」라는 경고만으로는 못 막는다.
               조인 자체가 행을 못 늘리게 하는 것이 근본이다.
         ⚠️ 어느 계정을 고르나 — «가장 최근에 연결한 것». 실측(2026-09-01)에서도 그쪽이
            실제로 쓰는 계정이었다(Mangoi_168 로그인 26회 대 mangoi_168 3회).
            동점이면 username 으로 갈라 **결과가 매번 같게** 한다.
         ✅ 그렇다고 중복을 «감추지» 는 않는다 — login_link_count 를 함께 내려
            화면이 「연결 2개」라고 말하게 한다(감추면 아무도 정리하지 않는다). */
      const sql = `SELECT tp.*,
                          ${PICK_LOGIN_USERNAME},
                          ${LOGIN_LINK_COUNT}
                   FROM teacher_profiles tp
                   ${where.length ? ' WHERE ' + where.join(' AND ') : ''}
                   ORDER BY tp.status='활동중' DESC, tp.korean_name ASC`;
      try {
        const rs = await env.DB.prepare(sql).bind(...binds).all<any>();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    /* 🔗 (2026-07-31) 제보 #2-1 후속 — "이미 DB에 들어가 있으니 찾아서 자동으로 매칭한 뒤 틀린 것만
       확인하는 게 낫다"는 피드백 반영. 이전엔 원문 그대로("Teacher Belle" vs "BELLE") 비교해서
       29명 중 1명만 우연히 맞았지만, "Teacher " 접두사를 떼고 대소문자를 맞추면 실제로는 대부분
       정확히 일치한다. 정확히 일치하는 것만 자동 연결하고, 애매하거나 안 맞는 것만 관리자가 보게 한다
       (틀리게 매칭되면 다른 강사 사진이 나가는 사고라 fuzzy 매칭은 자동 적용하지 않음). */
    if (method === 'POST' && path === '/api/admin/teacher-profiles/auto-match') {
      const _amActor = await getAdminActor(request, env as any);
      if (_amActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '테이블 생성 실패: ' + String(e?.message || e) }, 500); }

      const norm = (s: any) => String(s || '').trim().toUpperCase().replace(/^TEACHER\s+/, '').replace(/\s+/g, ' ').trim();

      let teachers: any[] = [];
      let profiles: any[] = [];
      try {
        teachers = (await env.DB.prepare(`SELECT id, name FROM teachers`).all<any>()).results || [];
        profiles = (await env.DB.prepare(`SELECT id, korean_name, english_name, linked_teacher_id FROM teacher_profiles`).all<any>()).results || [];
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }

      // 정규화 이름이 겹치는 teacher 가 2명 이상이면 그 이름은 애매한 것으로 취급(자동매칭 제외)
      const byNorm = new Map<string, any[]>();
      for (const t of teachers) {
        const n = norm(t.name);
        if (!n) continue;
        if (!byNorm.has(n)) byNorm.set(n, []);
        byNorm.get(n)!.push(t);
      }

      const usedTeacherIds = new Set<number>(profiles.filter(p => p.linked_teacher_id).map(p => p.linked_teacher_id));
      const matched: any[] = [];
      const unmatched: any[] = [];
      const now = Date.now();

      for (const p of profiles) {
        if (p.linked_teacher_id) continue; // 이미 연결된 건 건드리지 않음(기존 수동 작업 보존)
        const cands = byNorm.get(norm(p.korean_name)) || byNorm.get(norm(p.english_name)) || [];
        const cand = cands.length === 1 ? cands[0] : null;
        if (cand && !usedTeacherIds.has(cand.id)) {
          try {
            await env.DB.prepare(`UPDATE teacher_profiles SET linked_teacher_id = ?, updated_at = ? WHERE id = ?`)
              .bind(cand.id, now, p.id).run();
            usedTeacherIds.add(cand.id);
            matched.push({ profile_id: p.id, profile_name: p.korean_name, teacher_id: cand.id, teacher_name: cand.name });
          } catch (e: any) {
            unmatched.push({ profile_id: p.id, profile_name: p.korean_name, reason: 'update_failed: ' + String(e?.message || e) });
          }
        } else {
          // 참고용 추천(자동 적용 X) — 이름에 서로를 포함하는 정도로만 힌트 제공
          const pn = norm(p.korean_name) || norm(p.english_name);
          const suggestion = teachers.find(t => !usedTeacherIds.has(t.id) && pn && (norm(t.name).includes(pn) || pn.includes(norm(t.name))));
          unmatched.push({
            profile_id: p.id, profile_name: p.korean_name,
            reason: cands.length > 1 ? 'ambiguous(동명이인)' : (cand ? 'teacher_already_linked' : 'no_match'),
            suggested_teacher: suggestion ? { id: suggestion.id, name: suggestion.name } : null,
          });
        }
      }

      return json({ ok: true, matched, unmatched, matched_count: matched.length, unmatched_count: unmatched.length });
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
            available_days, available_hours, bank_name, bank_account, mbti, nationality, notes,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          b.korean_name, b.english_name || null, b.email || null, b.phone || null, b.kakao_id || null,
          b.dob || null, b.gender || null,
          b.image_url || null, b.intro_video_url || null, b.active_region || null, b.origin_region || null,
          b.fee_per_10min || null, b.group_name || null, b.status || '활동중',
          b.join_date || null, b.leave_date || null, b.education || null, b.career || null, b.certifications || null,
          b.available_days || null, b.available_hours || null, b.bank_name || null, b.bank_account || null,
          (b.mbti ? String(b.mbti).toUpperCase().slice(0, 4) : null),
          (b.nationality ? String(b.nationality).toUpperCase().trim().slice(0, 2) : null),
          b.notes || null, now, now
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
        /* 🧑‍🏫 (2026-09-01) 상태는 «아는 값» 만 받는다 — UPD_COLS 에 'status' 가 있어서
           구글시트에 적힌 문자열이 그대로 들어가고 있었다. 「휴직」·「Active」 같은 값이
           저장되면 그 강사는 배정 후보·급여·순위 어디에도 안 잡힌다(전부 '활동중' 으로 거른다).
           ⛔ 한 행 때문에 임포트 전체를 400 으로 막지는 않는다 — 붙여넣기 작업이라 나머지가
              멀쩡하면 넣는 편이 낫다. 대신 **그 칸만 빼고, 뺐다는 사실을 화면에 돌려준다.**
              (조용히 넣지도, 조용히 버리지도 않는다) */
        let statusIgnored: string | null = null;
        if (fields.status !== undefined) {
          const _canon = canonTeacherStatus(fields.status);
          if (_canon) fields.status = _canon;
          else { statusIgnored = String(fields.status); delete fields.status; }
        }
        if (dryRun) {
          results.push({ name, action: match ? 'update' : 'create', id: match ? match.id : null, fields: Object.keys(fields), mbti: mbti || null, status_ignored: statusIgnored });
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
            results.push({ name, action: 'update', id: tid, changed: keys, status_ignored: statusIgnored });
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
            results.push({ name, action: 'create', id: tid, status_ignored: statusIgnored });
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
        /* 🔑 login_username — 목록 조회와 **똑같은 문장**을 쓴다(위 주석 참고).
           ⚠️ 여기만 LEFT JOIN 으로 두면 명부와 수정 모달이 «서로 다른 계정» 을 보여 준다
              (.first() 는 둘 중 아무거나 집는다). 고르는 규칙이 한 곳이어야 한다. */
        const row = await env.DB.prepare(
          `SELECT tp.*,
                  ${PICK_LOGIN_USERNAME},
                  ${LOGIN_LINK_COUNT}
             FROM teacher_profiles tp
            WHERE tp.id = ?`
        ).bind(id).first<any>();
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
          'available_days','available_hours','bank_name','bank_account','mbti','nationality','notes',
          'linked_teacher_id',   // 🔗 (2026-07-30) 제보 #2-1 — 급여용 teachers.id 와 수동 연결
          'list_hidden'];        // 🙈 (2026-09-01) 명부에서 감출지 (0/1) — status 와 다른 축
        /* 🧑‍🏫 (2026-09-01) 상태는 «아는 값» 만 저장한다.
           전에는 어떤 문자열이든 그대로 들어가서, 오타 하나가 조용히 저장되면 그 강사가
           어느 목록에도 안 잡혔다(배정 후보·급여·순위가 전부 '활동중' 으로 거른다).
           ⛔ 모르는 값을 조용히 null 로 눕히지 않는다 — 그러면 「화면에서 골랐는데 그 값만
              저장이 안 됨」(CLAUDE.md 2장)이 된다. 400 으로 되돌려 화면이 말하게 한다.
           ℹ️ 빈 값('')은 종전대로 «미지정»(=활동중으로 읽힘)이라 허용한다. */
        if (b.hasOwnProperty('status')) {
          const _stRaw = b.status;
          const _stEmpty = (_stRaw === null || _stRaw === undefined || String(_stRaw).trim() === '');
          if (!_stEmpty && !isTeacherStatus(_stRaw)) {
            return json({ ok: false, error: 'bad_status',
              message: '모르는 상태값입니다: "' + String(_stRaw) + '" (허용: ' + TEACHER_STATUSES.join(' · ') + ')' }, 400);
          }
          if (!_stEmpty) b.status = canonTeacherStatus(_stRaw);   // '재직' 같은 옛 별칭을 정본으로 눕힌다
        }
        /* 📜 상태·숨김 변경은 배정·급여·학생 홈 노출까지 흔든다 — 바꾸기 «전» 값을 먼저 읽어 둔다.
           ⚠️ 실패해도 수정 자체는 진행한다(기록이 본 작업을 막으면 안 된다). */
        const _tpLogged = b.hasOwnProperty('status') || b.hasOwnProperty('list_hidden');
        let _tpBefore: any = null;
        if (_tpLogged) {
          try {
            _tpBefore = await env.DB.prepare(
              `SELECT korean_name, status, list_hidden FROM teacher_profiles WHERE id = ?`
            ).bind(id).first<any>();
          } catch (e: any) { console.error('[teacher-status] before:', e?.message); }
        }
        const sets: string[] = []; const binds: any[] = [];
        allowed.forEach(k => {
          if (b.hasOwnProperty(k)) {
            let v = b[k] === '' ? null : b[k];
            if (k === 'list_hidden') v = toTeacherListHidden(b[k]);   // 화면 체크 → 0/1
            if (k === 'mbti' && v) v = String(v).toUpperCase().slice(0, 4);   // 표준화 (예: intj → INTJ)
            // 🌏 국적 — ISO 2글자 대문자로 표준화(예: ph → PH). 이 값이 화면 언어를 정한다.
            if (k === 'nationality' && v) v = String(v).toUpperCase().trim().slice(0, 2);
            if (k === 'linked_teacher_id') v = (v === null ? null : (parseInt(v, 10) || null));
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
          /* 📜 「내가 안 바꿨는데?」에 답할 수 있게 한 줄 남긴다. 표는 관리자 통제 로그와 공용.
             ⚠️ 통째로 try/catch — 기록이 던지면 방금 성공한 수정이 실패로 보인다. */
          if (_tpLogged) {
            try {
              await env.DB.exec(`CREATE TABLE IF NOT EXISTS admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, action TEXT NOT NULL, target_room TEXT, target_user TEXT, meta TEXT, ip TEXT, created_at INTEGER NOT NULL);`);
              await env.DB.prepare(
                `INSERT INTO admin_audit_logs (admin_uid, action, target_user, meta, created_at) VALUES (?,?,?,?,?)`
              ).bind(
                String(_tpiActor.username || _tpiActor.name || 'unknown'),
                'teacher_status_change',
                String((_tpBefore && _tpBefore.korean_name) || ('#' + id)),
                JSON.stringify({
                  teacher_profile_id: id,
                  before: { status: (_tpBefore && _tpBefore.status) || null, list_hidden: Number((_tpBefore && _tpBefore.list_hidden) || 0) },
                  after:  {
                    status: b.hasOwnProperty('status') ? (b.status || null) : undefined,
                    list_hidden: b.hasOwnProperty('list_hidden') ? toTeacherListHidden(b.list_hidden) : undefined,
                  },
                }),
                Date.now()
              ).run();
            } catch (e: any) { console.error('[teacher-status] audit:', e?.message); }
          }
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
    // 📊 강사 인사평가 근거 분석 — 목록의 인사평가 점수를 누르면 "왜 이 점수인가"
    //   GET /api/admin/teacher-hr-analysis            → 전체 강사 요약(목록 셀 채우기)
    //   GET /api/admin/teacher-hr-analysis?id=<tp_id> → 단건 상세(근거 + 최근 학생 피드백)
    //
    //   ⚠ 원칙: 점수는 **실제 D1 기록에서만** 계산한다. 근거가 없는 항목은 score:null
    //     ('미측정')로 내려보내고 남은 항목끼리 가중치를 재정규화한다.
    //     인사·급여에 쓰이는 숫자를 추정치로 지어내지 않기 위함.
    //   🔐 강사 로그인은 본인 것만 조회 가능(남의 인사평가 열람 차단).
    // ════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/teacher-hr-analysis') {
      try { await ensureTeacherProfilesSchema(); } catch {}
      const _hrActor = await getAdminActor(request, env as any);
      const oneId = parseInt(url.searchParams.get('id') || '0', 10);

      // 집계는 강사 전원 공통이라 KV 에 5분 캐시 (목록 열 때마다 6개 집계쿼리 도는 것 방지)
      const HR_CACHE_KEY = 'adm:hr-analysis:v1';
      let cachedItems: any[] | null = null;
      try {
        const c = await (env as any).SESSION_STATE.get(HR_CACHE_KEY);
        if (c) cachedItems = JSON.parse(c);
      } catch { /* 캐시는 최적화일 뿐 */ }

      const profRows: any = cachedItems ? { results: [] } : await env.DB.prepare(
        `SELECT id, korean_name, english_name, status, join_date FROM teacher_profiles`
      ).all().catch(() => ({ results: [] }));
      const profiles: any[] = profRows.results || [];
      //   ※ 수업기록 테이블들은 teacher_id 가 아니라 teacher_name(자유문자열)으로 남는다.
      //      그래서 아래 집계는 전부 이름 정규화(hrNormName)로 프로필과 이어붙인다.

      const now = Date.now();
      const D = 86400000;
      const since90ms  = now - 90 * D;
      const since180ms = now - 180 * D;
      const dstr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const since90d = dstr(since90ms);
      const cut30d   = dstr(now - 30 * D);

      const q = async (sql: string, ...binds: any[]): Promise<any[]> => {
        try {
          const r: any = await env.DB.prepare(sql).bind(...binds).all();
          return r?.results || [];
        } catch { return []; }   // 테이블 미생성 등 — 해당 지표만 '미측정'
      };

      // ── 실제 신호 수집 (전부 teacher_name GROUP BY — 파라미터 1개씩이라 D1 100개 제한 무관) ──
      const [rateRows, schedRows, lateRows, noshowRows, evalRows, praiseRows] = cachedItems
        ? [[], [], [], [], [], []] as any[][]
        : await Promise.all([
        // ⭐ 학생이 수업 직후 매긴 별점 (1~7)
        q(`SELECT teacher_name AS tn, AVG(score) AS avg_score, COUNT(*) AS n,
                  SUM(CASE WHEN score <= 3 THEN 1 ELSE 0 END) AS low_n
             FROM class_ratings WHERE created_at >= ? AND teacher_name IS NOT NULL
            GROUP BY teacher_name`, since180ms),
        // 📅 수업 예약 — 학생별 첫/마지막 수업일 (재등록 유지율 + 수업 건수의 분모)
        q(`SELECT teacher_name AS tn, user_id AS uid,
                  MIN(scheduled_date) AS first_d, MAX(scheduled_date) AS last_d, COUNT(*) AS c
             FROM class_schedules
            WHERE scheduled_date >= ? AND teacher_name IS NOT NULL
              AND (status IS NULL OR status NOT IN ('cancelled','canceled','deleted'))
            GROUP BY teacher_name, user_id`, since90d),
        // ⏰ 지각 분 (관리자 입력) — schedule_id 로 강사 연결
        q(`SELECT cs.teacher_name AS tn, COUNT(*) AS n, SUM(lm.minutes) AS mins
             FROM lesson_late_minutes lm JOIN class_schedules cs ON cs.id = lm.schedule_id
            WHERE lm.lesson_date >= ? AND lm.minutes > 0 AND cs.teacher_name IS NOT NULL
            GROUP BY cs.teacher_name`, since90d),
        /* 🚫 강사 노쇼 (수업에 강사가 안 들어옴)
           🔎 (2026-08-19) **오판을 빼고 센다.** 이 행은 학생 브라우저가 «내 화면에 안 보였다» 로
              만드는 것이라, 두 사람이 서로 다른 워커의 방에 있으면 강사가 멀쩡히 들어와 있어도
              쌓인다(CLAUDE.md 2장). 실측 13건 중 11건이 오판이었고, 그대로 세면 잘못이 없는
              강사의 90일 평가가 내려간다. 판정은 노쇼 리포트와 **같은 함수**를 쓴다
              (src/no-show-truth.ts) — 두 벌로 두면 화면마다 다른 답이 나온다.
           ⚠️ GROUP BY 를 서버에서 하지 않고 원본 행을 받아 TS 에서 접는다. 낱말 경계 이름 비교를
              SQL 로 흉내 내면 그게 바로 「이름으로 사람 정하기」 함정이라 정확히 못 한다.
           ⚠️ 판정 불가(모름)는 **빼지 않는다** — 모르는 것을 «오판» 으로 단정하면 진짜 노쇼가 감춰진다. */
        (async () => {
          /* ⚠️ `teacher_name` 을 **별칭 없이도** 실어 보낸다. teacherPresenceByRoom 은 그 이름의
             필드를 읽으므로, `AS tn` 만 두면 이름이 빈 값이 되어 전부 «모름» 이 되고
             **오판이 한 건도 제외되지 않는다**(에러는 안 난다 — 조용히 예전과 같아진다).
             2026-08-19 실제로 밟았고, 아래 GROUP BY 접기가 `tn` 을 쓰기 때문에 둘 다 필요하다. */
          const raw = await q(
            `SELECT teacher_name, teacher_name AS tn, room_id, missing_role, student_name FROM class_no_show
              WHERE created_at >= ? AND missing_role = 'teacher' AND teacher_name IS NOT NULL`, since90ms);
          let pres = new Map<string, any>();
          try { pres = await teacherPresenceByRoom(env.DB, raw as any[]); }
          catch (e: any) { console.warn('[hr-signals] 노쇼 대조 생략:', e?.message); }
          const cnt = new Map<string, number>();
          for (const r of raw) {
            const p = pres.get(String(r.room_id || ''));
            if (p && p.present === true) continue;          // 오판 — 강사는 접속해 있었다
            const k = String(r.tn || '');
            cnt.set(k, (cnt.get(k) || 0) + 1);
          }
          return Array.from(cnt, ([tn, n]) => ({ tn, n }));
        })(),
        // 📝 강사가 작성한 학생 평가서 (행정 성실도)
        q(`SELECT teacher_name AS tn, COUNT(*) AS n FROM student_evaluations
            WHERE created_at >= ? AND teacher_name IS NOT NULL GROUP BY teacher_name`, since90ms),
        // 💛 익명 칭찬 (조직 기여)
        q(`SELECT teacher_name AS tn, AVG(star_rating) AS avg_star, COUNT(*) AS n
             FROM teacher_praises WHERE created_at >= ? AND teacher_name IS NOT NULL
            GROUP BY teacher_name`, since180ms),
      ]);

      // 이름 키로 접기
      const pick = (rows: any[], f: (acc: any, r: any) => any, init: () => any) => {
        const m = new Map<string, any>();
        rows.forEach(r => {
          const k = hrNormName(r.tn);
          if (!k) return;
          m.set(k, f(m.get(k) || init(), r));
        });
        return m;
      };
      const mRate = pick(rateRows,
        (a, r) => ({ sum: a.sum + Number(r.avg_score || 0) * Number(r.n || 0), n: a.n + Number(r.n || 0), low: a.low + Number(r.low_n || 0) }),
        () => ({ sum: 0, n: 0, low: 0 }));
      const mLate = pick(lateRows, (a, r) => ({ n: a.n + Number(r.n || 0), mins: a.mins + Number(r.mins || 0) }), () => ({ n: 0, mins: 0 }));
      const mNoShow = pick(noshowRows, (a, r) => ({ n: a.n + Number(r.n || 0) }), () => ({ n: 0 }));
      const mEval = pick(evalRows, (a, r) => ({ n: a.n + Number(r.n || 0) }), () => ({ n: 0 }));
      const mPraise = pick(praiseRows,
        (a, r) => ({ sum: a.sum + Number(r.avg_star || 0) * Number(r.n || 0), n: a.n + Number(r.n || 0) }),
        () => ({ sum: 0, n: 0 }));
      // 수업 예약: 학생 단위 → 강사 단위로 접기
      const mSched = new Map<string, any>();
      schedRows.forEach(r => {
        const k = hrNormName(r.tn);
        if (!k) return;
        const a = mSched.get(k) || { classes: 0, students: 0, eligible: 0, retained: 0 };
        a.classes += Number(r.c || 0);
        a.students += 1;
        // '유지'의 정의: 30일 이전부터 다니던 학생(eligible)이 최근 30일에도 수업이 있으면 retained
        if (String(r.first_d || '') <= cut30d) {
          a.eligible += 1;
          if (String(r.last_d || '') >= cut30d) a.retained += 1;
        }
        mSched.set(k, a);
      });

      const keyOf = (p: any) => {
        const a = hrNormName(p.korean_name), b = hrNormName(p.english_name);
        return { a, b };
      };
      const get2 = (m: Map<string, any>, p: any) => {
        const { a, b } = keyOf(p);
        return m.get(a) || (b && b !== a ? m.get(b) : null) || null;
      };

      const items = profiles.map(p => {
        const rate = get2(mRate, p), sched = get2(mSched, p), late = get2(mLate, p);
        const noshow = get2(mNoShow, p), evl = get2(mEval, p), praise = get2(mPraise, p);
        const classes = sched ? sched.classes : 0;
        const cats: any[] = [];

        // 🌐 강사 다수가 필리핀·외국인 — 라벨뿐 아니라 **근거 문장까지** 한/영 두 벌로 내려보낸다.
        //    (fact/fact_en, source/source_en. 한쪽만 채우면 영어 화면에 한국어가 남는다)

        // ① 수업 우수성 25% — 학생 별점 (1~7 → 0~100)
        if (rate && rate.n > 0) {
          const avg = Math.round((rate.sum / rate.n) * 10) / 10;
          cats.push({ key: 'cls', label: '수업 우수성', label_en: 'Teaching', weight: 0.25,
            score: Math.max(0, Math.min(100, Math.round((((rate.sum / rate.n) - 1) / 6) * 1000) / 10)),
            fact: `학생 별점 ${avg}/7점 · ${rate.n}건` + (rate.low > 0 ? ` (낮은 평가 ${rate.low}건)` : ''),
            fact_en: `Student rating ${avg}/7 · ${rate.n} reviews` + (rate.low > 0 ? ` (${rate.low} low)` : ''),
            source: '학생 수업평가(class_ratings) · 최근 180일',
            source_en: 'Student class ratings · last 180 days' });
        } else {
          cats.push({ key: 'cls', label: '수업 우수성', label_en: 'Teaching', weight: 0.25, score: null,
            fact: '최근 180일 학생 별점 기록 없음', fact_en: 'No student ratings in the last 180 days',
            source: '학생 수업평가(class_ratings)', source_en: 'Student class ratings' });
        }

        // ② 재등록·유지 30% — 30일 이전부터 다니던 학생이 지금도 남아있는 비율
        if (sched && sched.eligible >= 3) {
          cats.push({ key: 'ret', label: '재등록·유지', label_en: 'Retention', weight: 0.30,
            score: Math.round((sched.retained / sched.eligible) * 1000) / 10,
            fact: `기존 학생 ${sched.eligible}명 중 ${sched.retained}명 유지 · 담당 ${sched.students}명`,
            fact_en: `${sched.retained} of ${sched.eligible} existing students retained · ${sched.students} assigned`,
            source: '수업 예약(class_schedules) · 최근 90일',
            source_en: 'Lesson bookings · last 90 days' });
        } else {
          cats.push({ key: 'ret', label: '재등록·유지', label_en: 'Retention', weight: 0.30, score: null,
            fact: sched ? `기존 학생 ${sched.eligible}명 — 표본 3명 미만이라 계산 안 함` : '최근 90일 수업 예약 기록 없음',
            fact_en: sched ? `Only ${sched.eligible} existing students — fewer than 3, not scored` : 'No lesson bookings in the last 90 days',
            source: '수업 예약(class_schedules)', source_en: 'Lesson bookings' });
        }

        // ③ 근태 20% — 지각 비율 + 강사 노쇼
        if (classes > 0) {
          const lateN = late ? late.n : 0, lateMin = late ? late.mins : 0, nsN = noshow ? noshow.n : 0;
          const penalty = Math.min(100, (lateN / classes) * 100 * 1.5 + nsN * 12);
          cats.push({ key: 'punct', label: '근태·성실', label_en: 'Punctuality', weight: 0.20,
            score: Math.max(0, Math.round((100 - penalty) * 10) / 10),
            fact: `수업 ${classes}회 중 지각 ${lateN}회(${lateMin}분) · 강사 노쇼 ${nsN}회`,
            fact_en: `${lateN} late arrivals (${lateMin} min) in ${classes} lessons · ${nsN} teacher no-shows`,
            source: '지각기록(lesson_late_minutes) + 노쇼(class_no_show) · 최근 90일',
            source_en: 'Late-arrival log + no-show log · last 90 days' });
        } else {
          cats.push({ key: 'punct', label: '근태·성실', label_en: 'Punctuality', weight: 0.20, score: null,
            fact: '최근 90일 수업 기록이 없어 계산 안 함', fact_en: 'No lessons in the last 90 days — not scored',
            source: '지각기록 + 노쇼', source_en: 'Late-arrival + no-show logs' });
        }

        // ④ 행정 15% — 수업 대비 학생 평가서 작성률
        if (classes > 0) {
          const wrote = evl ? evl.n : 0;
          cats.push({ key: 'admin', label: '행정·서류', label_en: 'Admin', weight: 0.15,
            score: Math.max(0, Math.min(100, Math.round((wrote / classes) * 1000) / 10)),
            fact: `수업 ${classes}회 중 평가서 ${wrote}건 작성`,
            fact_en: `${wrote} student reports written for ${classes} lessons`,
            source: '학생 평가서(student_evaluations) · 최근 90일',
            source_en: 'Student reports · last 90 days' });
        } else {
          cats.push({ key: 'admin', label: '행정·서류', label_en: 'Admin', weight: 0.15, score: null,
            fact: '최근 90일 수업 기록이 없어 계산 안 함', fact_en: 'No lessons in the last 90 days — not scored',
            source: '학생 평가서(student_evaluations)', source_en: 'Student reports' });
        }

        // ⑤ 조직 기여 10% — 익명 칭찬 (별점 70% + 건수 30%)
        if (praise && praise.n > 0) {
          const star = Math.round((praise.sum / praise.n) * 10) / 10;
          cats.push({ key: 'contr', label: '조직 기여', label_en: 'Contribution', weight: 0.10,
            score: Math.round((((praise.sum / praise.n) / 5) * 100 * 0.7 + Math.min(praise.n, 10) / 10 * 100 * 0.3) * 10) / 10,
            fact: `칭찬 ${praise.n}건 · 평균 ${star}/5점`,
            fact_en: `${praise.n} praises · ${star}/5 average`,
            source: '익명 칭찬(teacher_praises) · 최근 180일',
            source_en: 'Anonymous praise · last 180 days' });
        } else {
          cats.push({ key: 'contr', label: '조직 기여', label_en: 'Contribution', weight: 0.10, score: null,
            fact: '최근 180일 칭찬 기록 없음', fact_en: 'No praise records in the last 180 days',
            source: '익명 칭찬(teacher_praises)', source_en: 'Anonymous praise' });
        }

        // ── 총점: 측정된 항목만 가중치 재정규화 ──
        const measured = cats.filter(c => c.score != null);
        const wSum = measured.reduce((s, c) => s + c.weight, 0);
        const total = wSum > 0
          ? Math.round((measured.reduce((s, c) => s + c.score * c.weight, 0) / wSum) * 10) / 10
          : null;
        measured.forEach(c => { c.contribution = Math.round((c.score * c.weight / wSum) * 10) / 10; });

        return {
          id: p.id, korean_name: p.korean_name, english_name: p.english_name,
          total, grade: hrGradeLabel(total),
          confidence: Math.round(wSum * 100),          // 몇 %의 가중치가 실제 데이터로 채워졌나
          measured_count: measured.length, categories: cats,
          window: { classes, ratings: rate ? rate.n : 0 },
        };
      });

      // 순위 — 활동중 + 측정된 강사끼리만 (데이터 없는 강사를 꼴찌로 몰지 않는다)
      const activeIds = new Set(profiles
        .filter(p => !p.status || p.status === '활동중')
        .map(p => p.id));
      const ranked = items
        .filter(i => i.total != null && activeIds.has(i.id))
        .sort((a: any, b: any) => b.total - a.total);
      const rankMap = new Map<number, number>();
      ranked.forEach((it: any, i) => rankMap.set(it.id, i + 1));
      items.forEach((it: any) => { it.rank = rankMap.get(it.id) || null; it.ranked_total = ranked.length; });

      const rows: any[] = cachedItems || items;
      if (!cachedItems) {
        try { await (env as any).SESSION_STATE.put(HR_CACHE_KEY, JSON.stringify(items), { expirationTtl: 300 }); }
        catch { /* 캐시 저장 실패 무시 */ }
      }

      // ── 단건 상세: 최근 학생 피드백 + 관리자 수동 평가 첨부 ──
      if (oneId) {
        const it: any = rows.find((x: any) => x.id === oneId);
        if (!it) return json({ ok: false, error: 'not_found' }, 404);
        if (_hrActor.isTeacher &&
            !sameTeacherName(_hrActor.name, it.korean_name) && !sameTeacherName(_hrActor.name, it.english_name)) {
          return json({ ok: false, error: 'forbidden_teacher', message: '본인 인사평가만 조회할 수 있습니다.' }, 403);
        }
        const kn = it.korean_name || '', en = it.english_name || kn;
        it.recent_feedback = await q(
          `SELECT student_name, score, tags, feedback, rated_date FROM class_ratings
            WHERE created_at >= ? AND (LOWER(TRIM(teacher_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(teacher_name)) = LOWER(TRIM(?)))
              AND (feedback IS NOT NULL AND feedback != '')
            ORDER BY created_at DESC LIMIT 5`, since180ms, kn, en);
        const manual = await q(
          `SELECT te.year, te.month, te.score_instruction, te.score_retention, te.score_punctuality,
                  te.score_admin, te.score_contribution, te.weighted_total, te.grade,
                  te.strengths, te.improvements, te.evaluator
             FROM teacher_evaluations te JOIN teachers t ON t.id = te.teacher_id
            WHERE LOWER(TRIM(t.name)) = LOWER(TRIM(?)) OR LOWER(TRIM(t.name)) = LOWER(TRIM(?))
            ORDER BY te.year DESC, te.month DESC LIMIT 1`, kn, en);
        it.manual_evaluation = manual[0] || null;   // 급여·평가 카드에서 사람이 입력한 5점 척도 평가
        if (it.manual_evaluation) {
          // 등급 라벨도 영어 한 벌 (강사가 영어로 볼 수 있어야 함)
          const GRADE_EN: Record<string, string> = {
            '최우수': 'Outstanding', '매우 우수': 'Excellent', '우수': 'Good',
            '개선 요망': 'Needs improvement', '미평가': 'Not evaluated',
          };
          it.manual_evaluation.grade_en = GRADE_EN[String(it.manual_evaluation.grade || '')] || it.manual_evaluation.grade || null;
        }
        return json({ ok: true, item: it, generated_at: now });
      }

      // 목록용 — 강사는 본인 행만
      let out = rows;
      if (_hrActor.isTeacher) {
        out = rows.filter((i: any) => sameTeacherName(_hrActor.name, i.korean_name) || sameTeacherName(_hrActor.name, i.english_name));
      }
      return json({ ok: true, items: out, cached: !!cachedItems, generated_at: now });
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
    /* 🔗 (2026-08-08) 강사 ↔ 로그인 아이디 연결
       왜 필요한가 — 출근/지각을 계산하려면 «출석 기록의 로그인 계정» 과 «강사» 를 이어야 한다.
       라이브 실측: teacher_account_links 0행, teachers 29명 중 user_id 보유 7명,
       최근 30일 출석 4,954행 중 강사와 매칭되는 행 0건. 이 연결이 없으면 근태는 계산 불가.
       ⚠️ 자동 매칭은 «하지 않는다». teacher_legacy_accounts.teacher_name 은 아이디를 그대로
          복사한 값(mangoi_006)이라 이름 근거가 전혀 없다. 추측으로 이으면 엉뚱한 사람의
          근태·급여가 된다. 사람이 화면에서 고른 것만 저장한다.
       경로를 '/api/admin/teachers/…' 로 지은 이유: api-mango 게이트의
       startsWith('/api/admin/teachers') 에 이미 걸려 라우팅 추가가 최소로 끝난다. */
    if (method === 'GET' && path === '/api/admin/teachers/links') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER)`);
      } catch {}
      const tRs = await env.DB.prepare(`SELECT id, name, active FROM teachers ORDER BY active DESC, name ASC`).all();
      const aRs = await env.DB.prepare(
        `SELECT username, last_login_at FROM teacher_legacy_accounts ORDER BY last_login_at DESC`
      ).all();
      const lRs = await env.DB.prepare(
        `SELECT username, teacher_id, teacher_name, linked_by, linked_at FROM teacher_account_links`
      ).all();
      return json({
        ok: true,
        teachers: (tRs.results || []),
        accounts: (aRs.results || []),
        links: (lRs.results || []),
      });
    }

    // 연결 저장 / 해제 — { username, teacher_id }  (teacher_id 가 비면 해제)
    if (method === 'POST' && path === '/api/admin/teachers/links') {
      const _lkActor = await getAdminActor(request, env as any);
      if (_lkActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER)`);
      } catch {}
      const b: any = await request.json().catch(() => null);
      const username = String(b?.username || '').trim();
      const teacherId = String(b?.teacher_id ?? '').trim();
      if (!username) return json({ ok: false, error: 'username_required' }, 400);

      if (!teacherId) {
        await env.DB.prepare(`DELETE FROM teacher_account_links WHERE username = ?`).bind(username).run();
        return json({ ok: true, unlinked: true, username });
      }
      // 존재하는 강사인지 확인 — 오타로 유령 id 가 박히면 조용히 틀린 근태가 된다
      const t = await env.DB.prepare(`SELECT id, name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`)
        .bind(teacherId).first<any>();
      if (!t) return json({ ok: false, error: 'teacher_not_found', teacher_id: teacherId }, 400);

      await env.DB.prepare(
        `INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_by, linked_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(username) DO UPDATE SET teacher_id=excluded.teacher_id,
           teacher_name=excluded.teacher_name, linked_by=excluded.linked_by, linked_at=excluded.linked_at`
      ).bind(username, String(t.id), t.name || null, _lkActor?.username || _lkActor?.role || 'admin', Date.now()).run();
      return json({ ok: true, username, teacher_id: String(t.id), teacher_name: t.name });
    }

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
      // 🕐 (2026-08-17) 길이가 섞이면 «수업 횟수» 만으로는 급여를 못 낸다.
      //   total_minutes(그 달에 실제로 가르친 분 합계)를 함께 받으면 그것으로 계산한다.
      //   안 보내면 예전대로 «전부 20분» 으로 본다 — 기존 호출부가 그대로 돌아간다.
      const _tcCount = Math.max(0, parseInt(b.class_count, 10) || 0);
      const _tcMinutes = Number(b.total_minutes);
      const _tcUnits = _tcMinutes > 0
        ? Math.round(classTenMinUnits(_tcMinutes) * 100) / 100    // 분 → 10분 토막
        : null;
      await env.DB.prepare(
        `INSERT INTO teacher_monthly_classes (teacher_id, year, month, class_count, total_10min_units, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(teacher_id, year, month) DO UPDATE SET
           class_count = excluded.class_count,
           -- ⚠️ COALESCE 필수 — total_minutes 없이 «수업 수만» 다시 저장하는 호출이
           --   기존 길이 합계를 NULL 로 지우면, 급여가 조용히 «전부 20분» 으로 되돌아간다
           total_10min_units = COALESCE(excluded.total_10min_units, teacher_monthly_classes.total_10min_units),
           notes = excluded.notes, updated_at = excluded.updated_at`
      ).bind(b.teacher_id, b.year, b.month, _tcCount, _tcUnits, b.notes || null, now).run();
      return json({ ok: true, class_count: _tcCount, total_10min_units: _tcUnits });
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
      const longIds = await longClassTeacherIds(env);   // 🪧 길이를 채워야 하는 강사 명단(C안)
      const items: any[] = [];
      let totalPhp = 0;
      for (const t of (rs.results || []) as any[]) {
        const r = await calcPayrollOne(env, t.id, year, month);
        if (!r.ok) continue;
        if (_allOwn && !sameTeacherName(_allOwn, r.teacher_name)) continue;  // 강사 본인 것만
        // 참고 표시 — «긴 수업이 있는데 길이가 안 들어온» 줄을 화면이 붉게 띄운다.
        r.has_long_class = longIds.has(Number(t.id));
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
      // 🔐 (2026-08-09) 강사 차단 — 바로 위 finalize 에는 이 가드가 있는데 여기만 없었다.
      //   이 핸들러는 UPDATE teachers SET rate_per_10min_php=… 로 **전 강사의 급여 단가**를
      //   하드코딩된 데모값으로 덮어쓴다. 그런데 /api/admin/payroll/* 는
      //   TEACHER_BLOCKED_PREFIXES(차단 목록)에 없어서 강사도 도달할 수 있다
      //   — 그 목록은 «차단 목록» 이라 새 API 의 기본값이 «강사 허용» 이기 때문이다(index.ts:313).
      //   payroll 의 다른 엔드포인트들은 각자 본인-필터로 막고 있었고, 이것만 빠져 있었다.
      const _seedActor = await getAdminActor(request, env as any);
      if (_seedActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 급여 데모 데이터를 생성할 수 없습니다.' }, 403);
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
    /* ═══════════════════════════════════════════════════════════════════
       🤖 GET /api/admin/payroll/auto-evaluate?year=&month=
          5대 평가 항목을 **LMS 실제 기록에서 계산해 «제안»** 한다 (2026-08-30).

       [왜] 강사 평가 5개 항목을 매달 사람이 손으로 넣어야 했다. 안 넣으면 grade 가
            «미평가» 로 남고, 그 상태가 급여 인센티브 근거가 되지 못한다.

       ⛔ **자동으로 저장하지 않는다.** 이 값은 급여로 이어진다 — 틀리면 곧 임금 사고다.
          화면이 제안값을 채워 주고, 사람이 확인해 [저장] 을 눌러야 teacher_evaluations 에 들어간다.
       ⛔ **표본이 없으면 숫자를 지어내지 않는다.** 못 잰 항목은 null 로 두고 이유를 함께 준다
          (CLAUDE.md 「화면에 «측정할 수 없는 값» 을 그럴듯하게 채우고 싶을 때」).
          지금 잴 수 있는 것은 두 축뿐이다:
            · 수업(instruction)   ← class_ratings 학생 별점 평균
            · 행정/조직(admin)     ← 수업일지(student_evaluations) 작성률
          나머지 셋(유지·근태·기여)은 이 저장소에 «그 달의 사실» 을 담은 표가 아직 없다.
          ⚠️ 근태를 노쇼 기록으로 계산하고 싶어질 텐데, 그 기록은 **학생 브라우저가 만든**
             「내 화면에 안 보였다」이고 실측 13건 중 11건이 오판이었다(CLAUDE.md 2장).
             그대로 감점 근거로 쓰면 멀쩡한 강사의 급여가 깎인다. 그래서 여기서는 안 쓴다.
       ⚠️ 이름으로 잇는다 — 번호로 이으면 **다른 사람**이 걸린다(강사 번호가 세 벌).
          normTeacherName() 으로 정규화해 **후보가 정확히 하나일 때만** 붙이고, 아니면 비운다.
       ═══════════════════════════════════════════════════════════════════ */
    if (method === 'GET' && path === '/api/admin/payroll/auto-evaluate') {
      const _aeActor = await getAdminActor(request, env as any);
      if (_aeActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher', message: '강사는 전체 자동 평가를 조회할 수 없습니다.' }, 403);
      await ensurePayrollSchema(env);
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!year || !month) return invalidBody(['year', 'month']);
      const ym = `${year}-${String(month).padStart(2, '0')}`;

      const safeAllAE = async (sql: string, ...b: any[]): Promise<any[]> => {
        try { const rs = await env.DB.prepare(sql).bind(...b).all<any>(); return rs.results || []; }
        catch { return []; }
      };

      const [tRows, ratingRows, logRows, classRows] = await Promise.all([
        safeAllAE(`SELECT id, name FROM teachers WHERE active = 1 ORDER BY name ASC`),
        // 학생 별점 — rated_date 는 'YYYY-MM-DD'
        safeAllAE(`SELECT teacher_name, COUNT(*) AS n, AVG(score) AS avg_score
                     FROM class_ratings
                    WHERE teacher_name IS NOT NULL AND teacher_name <> ''
                      AND substr(COALESCE(rated_date,''),1,7) = ?
                    GROUP BY teacher_name`, ym),
        /* 수업일지 — ⚠️ student_evaluations 에는 «서로 다른 두 기능» 이 같이 산다(CLAUDE.md).
           강사의 1분 수업일지는 student_uid 가 채워진 행이다. 그 조건이 없으면
           옛 «학생 상세» 월간평가까지 섞여 작성률이 부풀려진다. */
        safeAllAE(`SELECT teacher_name, COUNT(*) AS n
                     FROM student_evaluations
                    WHERE student_uid IS NOT NULL AND teacher_name IS NOT NULL AND teacher_name <> ''
                      AND substr(COALESCE(lesson_date,''),1,7) = ?
                    GROUP BY teacher_name`, ym),
        // 그 달 수업 수 — 급여 계산이 쓰는 것과 같은 표를 본다(둘이 다른 이야기를 하면 안 된다)
        safeAllAE(`SELECT teacher_id, class_count FROM teacher_monthly_classes WHERE year = ? AND month = ?`, year, month),
      ]);

      // 이름 → 값. 같은 이름이 둘이면 «잇지 않는다»(모르는 것이 틀린 것보다 낫다).
      const byName = (rows: any[], key: string) => {
        const m: Record<string, any> = {}; const dupe = new Set<string>();
        for (const r of rows) {
          const k = normTeacherName(r[key]);
          if (!k) continue;
          if (m[k]) dupe.add(k); else m[k] = r;
        }
        for (const k of dupe) delete m[k];
        return m;
      };
      const ratingBy = byName(ratingRows, 'teacher_name');
      const logBy    = byName(logRows, 'teacher_name');
      const classBy: Record<string, number> = {};
      for (const c of classRows) classBy[String(c.teacher_id)] = Number(c.class_count) || 0;

      const MIN_N = 3;   // 표본이 이보다 적으면 «잴 수 없다» 로 둔다
      const rateToScore = (r: number) =>
        r >= 0.95 ? 5 : r >= 0.80 ? 4 : r >= 0.60 ? 3 : r >= 0.40 ? 2 : 1;

      const out = tRows.map((t: any) => {
        const key = normTeacherName(t.name);
        const rt = key ? ratingBy[key] : null;
        const lg = key ? logBy[key] : null;
        const lessons = classBy[String(t.id)] || 0;

        const unmeasured: Array<{ axis: string; reason: string; reason_en: string }> = [];
        let sInst: number | null = null;
        if (rt && Number(rt.n) >= MIN_N) {
          sInst = Math.round(Number(rt.avg_score) * 10) / 10;
        } else {
          unmeasured.push({
            axis: 'score_instruction',
            reason: rt ? `학생 별점이 ${Number(rt.n)}건뿐입니다(최소 ${MIN_N}건).` : '이 달 학생 별점이 없습니다.',
            reason_en: rt ? `Only ${Number(rt.n)} student rating(s) (need ${MIN_N}).` : 'No student ratings this month.',
          });
        }

        let sAdmin: number | null = null;
        let logRate: number | null = null;
        if (lessons >= MIN_N) {
          logRate = Math.min(1, (lg ? Number(lg.n) : 0) / lessons);
          sAdmin = rateToScore(logRate);
        } else {
          unmeasured.push({
            axis: 'score_admin',
            reason: `이 달 수업 수가 ${lessons}건이라 작성률을 낼 수 없습니다(최소 ${MIN_N}건).`,
            reason_en: `Only ${lessons} lesson(s) recorded this month (need ${MIN_N}).`,
          });
        }

        for (const [axis, ko, en] of [
          ['score_retention',    '유지율을 그 달 기준으로 담은 표가 아직 없습니다. 사람이 넣어 주세요.', 'No monthly retention source yet — enter manually.'],
          ['score_punctuality',  '노쇼 기록은 학생 화면이 만든 «안 보였다» 라 감점 근거로 쓰지 않습니다. 사람이 넣어 주세요.', 'No-show records are student-reported and unreliable for scoring — enter manually.'],
          ['score_contribution', '조직 기여는 시스템이 잴 수 있는 값이 아닙니다. 사람이 넣어 주세요.', 'Contribution cannot be measured by the system — enter manually.'],
        ] as const) {
          unmeasured.push({ axis, reason: ko, reason_en: en });
        }

        return {
          teacher_id: t.id,
          teacher_name: t.name,
          matched: !!key && (!!rt || !!lg || lessons > 0),
          suggested: { score_instruction: sInst, score_admin: sAdmin },
          basis: {
            rating_n: rt ? Number(rt.n) : 0,
            rating_avg: rt ? Math.round(Number(rt.avg_score) * 100) / 100 : null,
            lesson_count: lessons,
            lesson_log_n: lg ? Number(lg.n) : 0,
            lesson_log_rate: logRate == null ? null : Math.round(logRate * 1000) / 10,
          },
          unmeasured,
        };
      });

      return json({
        ok: true, year, month,
        min_sample: MIN_N,
        teachers: out,
        measurable_axes: ['score_instruction', 'score_admin'],
        note: '이 값은 «제안» 입니다. 확인하고 저장해야 평가에 반영됩니다. 잴 수 없는 항목은 빈칸으로 두었습니다 — 0 으로 채우지 않습니다(0점과 미평가는 다른 사실이고, 이 점수는 급여 인센티브 근거가 됩니다).',
        note_en: 'These are suggestions only — review and save to apply. Unmeasurable axes are left blank on purpose (a blank is not a zero, and these scores feed pay incentives).',
        weights: { instruction: 25, retention: 30, punctuality: 20, admin: 15, contribution: 10 },
        weights_note: '보고서의 «행정/조직 25%» 는 이 시스템에서 행정 15% + 조직기여 10% 로 나뉘어 있습니다(합계 동일).',
      });
    }

    if (method === 'GET' && path === '/api/admin/export/payroll.csv') {
      await ensurePayrollSchema(env);
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!year || !month) return invalidBody(['year', 'month']);
      const rs = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1 ORDER BY name ASC`).all();
      const rows: any[] = [];
      for (const t of (rs.results || []) as any[]) {
        /* 🛡 (2026-08-30 v4 제안서 08) 한 강사 계산이 터져도 파일 전체를 잃지 않는다.
           예전에는 여기서 예외가 나면 요청이 500 이 되고, 그것을 새 탭으로 열던 화면에는
           «흰 화면» 만 남았다(그게 「CSV 백화」의 정체 절반이다. 나머지 절반은 화면 쪽 —
           adm-core.js downloadPayrollCSV 주석 참고).
           ⚠️ 조용히 빠뜨리지 않는다 — 이름과 사유를 한 줄로 남겨 «왜 이 사람이 비었나» 를 남긴다.
              (CLAUDE.md 2장 「화면이 모르면 모른다고 말하게」) */
        let r: any;
        try {
          r = await calcPayrollOne(env, t.id, year, month);
        } catch (e: any) {
          r = { ok: false, error: String(e?.message || e).slice(0, 120) };
        }
        if (!r || !r.ok) {
          rows.push({
            teacher_id: t.id,
            teacher_name: t.name || ('#' + t.id),
            year, month,
            improvements: '계산 실패: ' + String(r?.error || 'unknown'),
          });
          continue;
        }
        const e = r.evaluation || {};
        rows.push({
          teacher_id:         r.teacher_id,
          teacher_name:       r.teacher_name,
          status:             r.status,
          years:              r.years,
          year:               r.year,
          month:              r.month,
          class_count:        r.class_count,
          total_minutes:      r.total_minutes,        // 🕐 급여 근거 — 30분 수업이 섞이면 회수만으론 못 맞춘다
          length_recorded:    r.length_recorded ? 1 : 0,   // 0 = 길이 미입력(전부 20분으로 계산)
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
          /* ✅ «평가했는가» 를 칸으로 못 박는다.
             ⛔ 미평가를 0 으로 채우지 않는다 — 0점과 «아직 평가 안 함» 은 다른 사실이고,
                이 표는 인센티브 근거로 쓰인다. 0 으로 적으면 안 한 평가가 «최하점» 이 된다.
                대신 이 칸(0/1)과 grade='미평가' 로 화면·엑셀이 갈라 볼 수 있게 한다. */
          evaluated:          r.evaluation ? 1 : 0,
        });
      }
      const csv = toCSV(rows, [
        { key: 'teacher_id',         label: 'teacher_id' },
        { key: 'teacher_name',       label: 'teacher_name' },
        { key: 'status',             label: 'status' },
        { key: 'years',              label: 'years' },
        { key: 'year',               label: 'year' },
        { key: 'month',              label: 'month' },
        { key: 'class_count',        label: 'class_count' },
        { key: 'total_minutes',      label: 'total_minutes' },
        { key: 'length_recorded',    label: 'length_recorded' },
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
        { key: 'evaluated',          label: 'evaluated(1=yes)' },
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

    // ── GET/HEAD /api/popups/media/:key — 업로드된 미디어 프록시 ──
    //   🎬 (2026-08-25) Range(206) 지원 추가 — 여기에 «영상» 을 올릴 수 있게 된 뒤로 필요해졌다.
    //     · iOS 사파리는 <video> 재생을 구간 요청으로 시작한다. 200 + 전체 파일만 돌려주면
    //       큰 영상이 아예 재생되지 않거나 첫 프레임 전에 통째로 버퍼링한다.
    //     · 되감기(seek)도 Accept-Ranges 가 있어야 브라우저가 허용한다.
    //   같은 사정으로 인트로 영상은 src/index.ts 의 /media/intro.mp4 라우트가 이미 206 을 준다 —
    //   그쪽은 키가 고정이고 여기는 업로드된 임의의 키라, 둘을 합치지 않고 같은 규칙만 맞춘다.
    if ((method === 'GET' || method === 'HEAD') && path.startsWith('/api/popups/media/')) {
      const key = decodeURIComponent(path.replace('/api/popups/media/', ''));
      // 🔒 이 경로는 «로그인 없이» 열린다(src/index.ts 의 공개 목록). 그런데 버킷(RECORDINGS)에는
      //    수업 «녹화» 도 같이 들어 있다 — 키를 그대로 받으면 주소만 알면 남의 수업이 열린다.
      //    업로더(/api/admin/popups/upload-media)가 만드는 키는 항상 popup-media/ 로 시작하므로
      //    읽을 수 있는 범위를 거기로 묶는다. (.. 로 위로 올라가는 것도 함께 막는다)
      if (!key.startsWith('popup-media/') || key.includes('..')) {
        return new Response('Not Found', { status: 404 });
      }
      const r2 = (env as any).RECORDINGS;
      if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);

      const rangeHeader = request.headers.get('Range');
      const opts: any = {};
      let wantRange = false;
      if (rangeHeader) {
        const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
        if (m) {
          const start = parseInt(m[1], 10);
          const end = m[2] ? parseInt(m[2], 10) : undefined;
          opts.range = end !== undefined ? { offset: start, length: end - start + 1 } : { offset: start };
          wantRange = true;
        }
      }

      // HEAD 는 본문 없이 헤더만 — 브라우저가 Accept-Ranges·Content-Length 를 먼저 확인할 때 쓴다.
      const obj = method === 'HEAD' ? await r2.head(key) : await r2.get(key, opts);
      if (!obj) return new Response('Not Found', { status: 404 });

      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('Accept-Ranges', 'bytes');
      // 업로드 키에 시각이 박혀 있어 같은 주소의 내용이 바뀌지 않는다 → 길게 캐시해도 안전.
      headers.set('Cache-Control', 'public, max-age=604800, immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      if (obj.httpEtag) headers.set('ETag', obj.httpEtag);

      if (method === 'HEAD') {
        headers.set('Content-Length', String(obj.size));
        return new Response(null, { status: 200, headers });
      }
      const r = (obj as any).range;
      if (wantRange && r) {
        // 끝을 안 적은 요청(bytes=N-)에 R2 가 length 를 안 채워 주면 «본문은 일부인데 길이는 전체»가
        // 되어 되감기가 깨진다. 남은 크기로 직접 계산해 둔다.
        const off = r.offset || 0;
        const len = r.length !== undefined ? r.length : (obj.size - off);
        headers.set('Content-Range', `bytes ${off}-${off + len - 1}/${obj.size}`);
        headers.set('Content-Length', String(len));
        return new Response(obj.body, { status: 206, headers });
      }
      headers.set('Content-Length', String(obj.size));
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
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
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
      /* 🕘 (2026-08-21) `?week=` 없이 열면(기본 = "이번 주") 서버 UTC 시각을 그대로 썼다.
         KST 는 UTC+9 라 UTC 15:00~23:59(=KST 00:00~08:59, 하루 중 9시간)에는 "오늘"이
         이미 KST 로는 다음 날로 넘어갔는데 여기만 하루 전 요일로 주를 나눴다 — 그 창에서는
         매니저 '오늘 수업'(/api/admin/classes/today, KST 로 계산)과 이 강사 스케줄 캘린더가
         서로 다른 요일을 "오늘"로 보고 반복수업(day_of_week)을 서로 다른 칸에 꽂았다.
         2026-08-06 에 매니저 '오늘 수업' 쪽에서 겪은 것과 같은 뿌리(KST 미보정) — 그때 고친
         세 곳(학생·강사·매니저 경로)에 이 강사 스케줄만 빠져 있었다. */
      const KST_MS = 9 * 60 * 60 * 1000;
      const start = (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam))
        ? mondayOf(new Date(weekParam + 'T00:00:00Z'))
        : mondayOf(new Date(Date.now() + KST_MS));
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
        // 🎯 레벨테스트는 정규수업과 성격이 달라 캘린더에서 한눈에 구분돼야 한다.
        //    예전엔 아래 기본값에 걸려 평범한 '1:1' 로 그려졌다 — 있어도 못 알아봤다.
        if (c === 'level_test' || c === 'leveltest' || c === '레벨테스트') return 'leveltest';
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
        // 숫자('0'~'6', 0=일…6=토)도 받는다 — 주간스케줄 마법사(wizFinalize)가 숫자로
        // 저장하고, 학생·강사 화면(dowMatches)은 숫자를 이미 읽는데 이 캘린더만 못 읽어
        // «저장은 됐는데 새로고침하면 사라지는» 반쪽이 됐다(2026-08-27 발견).
        if (/^[0-6]$/.test(v)) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(v)];
        return map[v] || '';
      };

      let rows: any[] = [];
      try {
        const rs: any = await env.DB.prepare(
          `SELECT id, user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, notes, source FROM class_schedules WHERE (status IS NULL OR status='active')`
        ).all();
        rows = rs.results || [];
      } catch (e: any) {
        return json({ ok: true, week: weekStartISO, count: 0, items: [], schedules: [], _err: String(e?.message || e) });
      }

      /* 🗓️ (2026-08-24) 「코스 기간」이 시작일=종료일(그 날 하루)로 뜨는 문제.
         [왜] enroll-activate.ts 가 수강신청을 확정하면 6개월치 화·목 수업을
              **회당 한 행**(schedule_kind='dated', scheduled_date=그날짜)으로 심는다
              (INSERT ... VALUES (…'dated'…scheduled_date…)). 그래서 한 행 = 그 날 하루일 뿐,
              등록 전체 기간이 아니다. 그런데 아래 one-off 분기가 그 한 행의 scheduled_date
              를 그대로 start_date/end_date 로 써서, 모달에 "시작일=종료일=이 날" 로 보였다
              (실제 6개월 신청인데 하루짜리처럼 보이는 것이 바로 이 계산).
         [해법] 같은 신청(class_schedules.source, enroll-activate.ts 의 SRC_PREFIX+id)으로
              생성된 행들의 scheduled_date 중 최소/최대를 실제 코스 기간으로 쓴다.
              DB 를 새로 만들지 않는다 — 위에서 이미 다 읽어 온 rows 를 한 번 더 돈다.
              source 가 없거나(=진짜 하루짜리 대체수업 등) 겹치는 행이 자기 하나뿐이면
              min=max=그날 그대로라 기존 동작과 같다. */
      const sourceRange: Record<string, { min: string; max: string }> = {};
      for (const r of rows) {
        const src = String(r.source || '');
        const sd = String(r.scheduled_date || '');
        if (!src || !sd) continue;
        /* 🪞 (2026-08-31) 카페24 미러 행은 이 «기간 묶기» 에서 뺀다.
           위 계산은 «같은 source = 같은 수강신청» 을 전제로 하는데(enroll-activate 가
           신청마다 source 를 다르게 단다), 미러는 학생·날짜가 달라도 source 가 전부
           'c24-mirror' 로 **하나**다. 그대로 두면 9/1 수업 카드에도 「9/1~9/15」 가 붙어
           «이 학생이 6주짜리 코스를 등록했다» 로 읽힌다. 미러 행은 한 행이 하루 하나다. */
        if (src === MIRROR_SOURCE || src === MIRROR_SOURCE_MANUAL) continue;
        const cur = sourceRange[src];
        if (!cur) sourceRange[src] = { min: sd, max: sd };
        else { if (sd < cur.min) cur.min = sd; if (sd > cur.max) cur.max = sd; }
      }

      const items: any[] = [];
      for (const r of rows) {
        if (r.teacher_id == null || r.teacher_id === '') continue;
        const tnum = Number(r.teacher_id);
        const teacher_id = Number.isFinite(tnum) ? tnum : r.teacher_id;
        const students = r.student_name ? [{ name: r.student_name, uid: r.user_id || '' }] : [];
        /* 🏷 (2026-08-11) 「이 칸이 진짜 망고아이 수업이냐」 를 캘린더가 알 수 있게 내려준다.
           실측(2026-08-11) 활성 667행 중 진짜 수업은 9행뿐이고, 나머지는 학생이 안 붙은 자리표시다:
             · user_id='lms'       518행 (source=lms_import_w26, notes='LMS 수업중')
                 → 강사가 **옛 LMS 에서 수업 중이라 못 쓰는 시간**. 망고아이 수업이 아니다.
             · user_id='type_seed' 140행 (source=type_seed_20260623) → 6월 시연용 시드
           학생이 없으니 카드에 이름이 안 뜨고, 그래서 매니저는 이걸 «누군지 모를 1:1 수업» 으로
           읽어 왔다(2026-08-11 사장님 확인 요청의 발단).
           ⚠️ 판정식은 api-teacher.ts 의 `kind` 와 **글자 하나까지 같게** 유지할 것 —
              두 화면이 같은 행을 다르게 부르기 시작하면 어느 쪽이 맞는지 아무도 모르게 된다. */
        const _uid = String(r.user_id || '').toLowerCase();
        const origin = _uid === 'lms' ? 'lms' : (_uid === 'type_seed' ? 'sample' : 'class');
        const base = {
          id: r.id,                       // ← 드래그 이동 영구 저장(PATCH)에 필요
          teacher_id,
          hour: hourOf(r.start_time),
          start_time: r.start_time,
          type: mapType(r.class_type),
          origin,                         // 'class' | 'lms' | 'sample'
          students,
          duration_min: r.duration_min || DEFAULT_CLASS_MINUTES,
          note: r.notes || '',
        };
        const kind = String(r.schedule_kind || 'recurring');
        if (kind === 'one_off' || r.scheduled_date) {
          const d = String(r.scheduled_date || '');
          if (d >= weekStartISO && d <= weekEndISO) {
            const range = sourceRange[String(r.source || '')];
            items.push({ ...base, date: d, start_date: range ? range.min : d, end_date: range ? range.max : d });
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

      /* 🚫 (2026-08-08 마이마이 요청) 「강사가 언더타임이라 수업을 못 할 때 매니저가 그 시간을
         막을 수 있으면 좋겠다」 — 막는 기능(teacher_unavailability)은 이미 있었는데
         **주간 캘린더가 그걸 안 읽어서**, 막아 놓고도 캘린더에는 빈칸으로 보였다.
         그래서 매니저는 자기가 막은 시간에 또 수업을 넣었다. 여기서 같이 내려준다.

         ⚠️ class_schedules 와 **id 가 겹친다**(둘 다 1,2,3…). 프런트가 드래그 이동에서
            id 로 PATCH 를 쏘므로 그대로 두면 «휴식시간을 드래그 → 엉뚱한 수업이 이동» 한다.
            → id 는 넘기지 않고 source:'unavailability' 로 못박아 프런트가 잠그게 한다. */
      try {
        const tu: any = await env.DB.prepare(
          `SELECT id, teacher_id, teacher_name, kind, start_date, end_date, day_of_week, start_time, end_time, reason FROM teacher_unavailability`
        ).all();
        const dowIdxToKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (const b of (tu.results || [])) {
          if (b.teacher_id == null || b.teacher_id === '') continue;
          const tnum2 = Number(b.teacher_id);
          const st = String(b.start_time || '') || '00:00';
          const et = String(b.end_time || '') || '23:59';
          const mins = (t: string) => { const m = String(t).match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
          const dur = Math.max(10, mins(et) - mins(st));
          const base2 = {
            block_id: b.id,                 // 삭제용. id 로는 넘기지 않는다(위 주석 참고)
            source: 'unavailability',
            origin: 'block',                // 위 class 슬롯의 origin 과 같은 축(정체 표시용)
            teacher_id: Number.isFinite(tnum2) ? tnum2 : b.teacher_id,
            hour: hourOf(st), start_time: st, end_time: et,
            type: 'blocked', students: [], duration_min: dur,
            note: b.reason || '', reason: b.reason || '',
          };
          if (String(b.kind) === 'weekly') {
            const want2 = dowIdxToKey[Number(b.day_of_week)] || '';
            if (!want2) continue;
            for (const d of weekDates) if (dateToDow[d] === want2) items.push({ ...base2, date: d, recurring: true });
          } else {
            const s0 = String(b.start_date || '').slice(0, 10);
            const e0 = String(b.end_date || b.start_date || '').slice(0, 10);
            if (!s0) continue;
            for (const d of weekDates) if (d >= s0 && d <= (e0 || s0)) items.push({ ...base2, date: d, recurring: false });
          }
        }
      } catch { /* 휴식시간 조회 실패가 수업 캘린더 전체를 막지 않게 한다 */ }

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
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
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
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
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
            // ⚠️ (2026-08-27) ('stu_' || id)·('stu_id_' || id) 는 students_erp 에 없는 컬럼이라
            //    `no such column: id` 로 죽어 이 조회가 통째로 무동작이었다(catch 가 삼킴).
            `SELECT COALESCE(korean_name, username) AS name FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
          ).bind(userId, userId).first<any>();
          /* 🔴 (2026-08-27 trap-check) 이 이름은 «uid 에서 유추한» 것이라 근거가 약하다.
             그대로 effectiveName 이 되면 아래 WHERE 가
               (user_id = ? OR user_id IN (같은 이름 전원) OR student_name = ?)
             로 넓어져 **남의 수업**이 섞인다. 화면은 그 목록으로 일정변경(PATCH)·삭제(DELETE)까지
             하므로(admin/student.html) 잘못 섞이면 남의 수업을 지울 수 있다.
             ⚠️ 2026-08-27 까지는 이 조회 자체가 없는 컬럼 id 로 죽어 늘 null 이었다 — 되살리는
                김에 그 시절의 «넓은» 동작을 그대로 켜면 안 된다.
             ✅ 이름이 **한 계정으로만** 떨어질 때만 쓴다(같은 파일 POST 경로·sessions/today 와 같은 규칙).
             ℹ️ 사람이 직접 넣은 studentName 은 «의도한 통합 조회» 이므로 그대로 둔다.
             📌 실측(2026-08-27): 예약이 걸린 학생 중 동명이인 계정을 가진 사람은 0명 —
                지금 사고가 안 나는 것은 «아직» 겹치는 쌍이 없어서일 뿐이다. */
          if (r?.name) {
            const dupN = await env.DB.prepare(
              `SELECT COUNT(*) AS n FROM students_erp WHERE korean_name = ? OR username = ?`
            ).bind(r.name, r.name).first<any>();
            if (Number(dupN?.n || 0) === 1) nameForUid = r.name;
          }
        } catch {}
        // 2) studentName 파라미터가 있으면 그것도 우선 사용 (프론트가 알고 있는 이름)
        const effectiveName = studentName || nameForUid;
        // 3) 같은 이름의 모든 user_id 수집 (status 무관 - 병합된 row 도 포함하여 schedule 가져오기)
        let allUids: string[] = [userId];
        if (effectiveName) {
          try {
            const rs = await env.DB.prepare(
              // ⚠️ (2026-08-27) 없는 컬럼 id 참조로 죽어 있었다 → allUids 가 늘 [userId] 하나였다.
              `SELECT COALESCE(user_id, login_id) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`
            ).bind(effectiveName, effectiveName).all<any>();
            const ids = (rs.results || []).map((r: any) => r.uid).filter(Boolean);
            allUids = [...new Set([userId, ...ids])];
          } catch {}
          mergeInfo = { name: effectiveName, user_ids: allUids, merged_count: allUids.length };
        }
        // 4) WHERE: user_id IN (...) OR student_name = name (양쪽 매칭)
        //    ⚠️ (2026-08-07) 예전엔 allUids 를 통째로 바인드했습니다. 동명이인이 늘면서
        //       한 이름이 이미 71명(운영 DB 실측)이라 D1 바인드 100개 한도에 근접했습니다.
        //       allUids 를 만든 쿼리를 **그대로 서브쿼리로** 넣으면 결과는 같으면서
        //       바인드는 2개로 고정됩니다(이름 수가 아무리 늘어도 안전).
        /* 🔴 (2026-08-27) 여기 있던 ('stu_' || id) 는 students_erp 에 없는 컬럼이다. 단독으로 돌리면
           `no such column: id` 인데, 이 문자열은 class_schedules 를 도는 쿼리 «안» 에 서브쿼리로 들어가서
           SQLite 가 그 id 를 **바깥 class_schedules.id** 로 해석했다 — 죽지 않고 «상관 서브쿼리» 가 되어
           매 행마다 students_erp 를 전수 스캔했다(운영 D1 실측: 4.3초 / 2,348만 행 읽기).
           빼면 상관관계가 끊겨 의미도 정확해지고 빨라진다. */
        const SAME_NAME_UIDS =
          `SELECT COALESCE(user_id, login_id) FROM students_erp WHERE korean_name = ? OR username = ?`;
        if (effectiveName) {
          where.push(`(user_id = ? OR user_id IN (${SAME_NAME_UIDS}) OR student_name = ?)`);
          binds.push(userId, effectiveName, effectiveName, effectiveName);
        } else {
          where.push('user_id = ?');
          binds.push(userId);
        }
      } else if (studentName) {
        // 학생 이름으로 직접 조회 (모든 동명 학생 통합)
        //  ⚠️ (2026-08-07) uid 목록을 따로 조회해 통째로 바인드하던 것을 서브쿼리로 바꿨습니다.
        //     동명이인이 100명을 넘으면 D1 바인드 한도에 걸립니다(현재 최다 71명).
        //     동명이인이 하나도 없으면 IN 이 공집합이라 student_name 조건만 남습니다 — 기존과 동일.
        where.push(
          // ⚠️ (2026-08-27) 위 SAME_NAME_UIDS 와 같은 상관 서브쿼리 문제 — id 제거로 해소.
          `(user_id IN (SELECT COALESCE(user_id, login_id) FROM students_erp WHERE korean_name = ? OR username = ?) OR student_name = ?)`);
        binds.push(studentName, studentName, studentName);
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
      /* 🔎 (2026-08-19) 「강사 미입장」이 정말 미입장이었나 — 출석 기록과 대조한다.
         이 행은 **학생 브라우저가** 만든다: 5분을 기다려도 상대가 안 보이면 신고하는 구조라
         «상대가 안 왔다» 가 아니라 «내 화면에 안 보였다» 가 기록된다. 두 사람이 서로 다른
         워커의 방에 있던 동안(CLAUDE.md 2장) 강사는 매번 들어와 있었는데도 알림이 떴다 —
         실측 13건 중 11건이 오판. ⛔ 기록은 지우지 않는다(학생이 못 본 것은 사실이다).
         대신 «오판» 이라고 화면이 함께 알려 준다. 판정 정본은 src/no-show-truth.ts. */
      let presence = new Map<string, any>();
      try { presence = await teacherPresenceByRoom(env.DB, items); }
      catch (e: any) { console.warn('[no-shows] 강사 출석 대조 생략:', e?.message); }

      const now = Date.now();
      const weekAgo = now - 7 * 86400 * 1000;
      const dayAgo = now - 86400 * 1000;
      let week = 0, today = 0, teacherMiss = 0, studentMiss = 0, teacherFalse = 0, teacherUnknown = 0;
      for (const r of items) {
        if (r.created_at >= weekAgo) week++;
        if (r.created_at >= dayAgo) today++;
        if (r.missing_role === 'teacher') {
          teacherMiss++;
          const p = presence.get(String(r.room_id || ''));
          // present: true=있었음(오판) · false=흔적 없음(진짜) · null/미조회=모름
          r.teacher_present = p ? p.present : null;
          r.teacher_seen_from = p ? p.from : null;
          r.teacher_seen_to = p ? p.to : null;
          r.teacher_seen_min = p ? p.minutes : null;
          r.false_alarm = r.teacher_present === true;
          if (r.false_alarm) teacherFalse++;
          else if (r.teacher_present === null) teacherUnknown++;
        } else studentMiss++;
      }
      return json({
        ok: true, count: items.length, today, this_week: week,
        by_missing: {
          teacher: teacherMiss, student: studentMiss,
          // 「강사 미입장」 중 실제로는 강사가 접속해 있던 건 / 판정할 수 없는 건
          teacher_false_alarm: teacherFalse,
          teacher_unknown: teacherUnknown,
          teacher_real: Math.max(0, teacherMiss - teacherFalse - teacherUnknown),
        },
        no_shows: items,
      });
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
          /* 🔴 (2026-08-27) 이 쿼리는 students_erp 에 없는 컬럼 id 를 SELECT·ORDER BY 하므로
             `no such column: id` 로 죽는다 = 이 병합 API 는 지금 아무 일도 하지 않는다.
             ⛔ 일부러 안 고쳤다 — 되살리는 순간 실제 학생 계정을 «병합» 하기 시작하는데,
                개발·운영이 같은 D1 이라 되돌릴 수 없다(CLAUDE.md 1-1). 고치려면 rowid 로 바꾸고
                dry_run → 사람 확인 2단계를 함께 붙여야 한다. 사장님 판단이 필요한 별건. */
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
          /* 📜 (2026-08-12) 여기에 감사 기록이 없었다 — 수업 주인을 «통째로» 옮기는 자리인데
             누가·언제·어느 계정에서 어느 계정으로 옮겼는지 어디에도 안 남았다.
             병합은 되돌리기 어려운 작업이라 기록이 특히 필요하다.
             ⚠️ 실제로 옮겨진 행이 있을 때만 남긴다 — 0건 로그가 쌓이면 진짜 사건이 묻힌다. */
          let mergeActor = 'admin';
          try { const _ma = await getAdminActor(request, env as any); if (_ma?.name) mergeActor = _ma.name; }
          catch (e) { console.warn('[student-merge] actor 조회 실패 — 감사기록에 이름 대신 admin 이 남습니다:', (e as any)?.message); }
          let scheduleMoved = 0, scheduleFailed = 0;
          for (const dupUid of dupUids) {
            try {
              const upd = await env.DB.prepare(
                `UPDATE class_schedules SET user_id = ?, updated_at = ? WHERE user_id = ?`
              ).bind(canonicalUid, Date.now(), dupUid).run();
              const movedNow = (upd?.meta?.changes as number) || 0;
              scheduleMoved += movedNow;
              if (movedNow > 0) {
                await writeClassAudit(env, {
                  action: 'owner_merge', student_name: name || null,
                  actor: mergeActor, actor_role: 'admin', source: 'student-merge',
                  reason: '중복 학생 계정 병합',
                  detail: JSON.stringify({ from: dupUid, to: canonicalUid, schedules_moved: movedNow }),
                });
              }
            } catch (e) {
              /* ⚠️ 여기가 조용히 죽으면 scheduleMoved 가 0 인 채로 «병합 성공» 이 응답에 실린다.
                 관리자는 옮겨진 줄 알고 넘어가고, 학생 수업은 옛 계정에 남는다. 반드시 남긴다. */
              scheduleFailed++;
              console.warn('[student-merge] 수업 주인 이동 실패', dupUid, '→', canonicalUid, ':', (e as any)?.message);
            }
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
            schedules_moved: scheduleMoved,
            /* ⚠️ 실패 건수를 응답에 싣는다 — 0 이 아니면 그 학생 수업은 옛 계정에 남아 있다.
               화면이 «병합 완료» 만 보여주면 관리자가 그대로 넘어간다. */
            schedules_failed: scheduleFailed
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


    /* ─── 🗓 지난 수업에서 «수업 일정» 만들기 (2026-08-19 사장님 A안) ─────────────────
       왜 —
         학생 상세보기의 「📅 일정변경」 버튼도, 주간 시간표도 class_schedules 를 본다.
         그런데 운영 D1 실측(2026-08-18) 결과 그 표에 **진짜 학생 것은 6명 15건뿐**이었다
         (673행 중 658행이 user_id='lms'·'type_seed' 자리표시자). 학생 29,398명 중 6명이다.
         반면 **실제 수업 기록은 attendance 에 182,612건** 있다. 즉 자료가 없는 게 아니라
         «앞으로의 일정» 칸으로 옮겨지지 않았을 뿐이다.
         → 지난 기록에서 «매주 화 19:00, 강사 KES» 같은 주간 패턴을 뽑아 일정으로 만든다.

       ⚠️ 왜 «미리보기» 가 따로 있나 (사장님 A안) —
          실서비스 학생 데이터다. 조건을 잘못 잡으면 그만둔 학생에게 수업이 잡히고,
          「내 일정에 왜 이게 있냐」 가 수백 건 들어온다. 그래서 **읽기(preview)와
          쓰기(apply)를 나누고, 쓰기는 사람이 화면에서 고른 것만** 받는다.
          ⛔ apply 가 스스로 패턴을 다시 뽑아 «전부» 넣게 고치지 말 것. 그러면 A안이 B안이 된다.

       ⚠️ 요일 번호 — attendance 는 strftime('%w') = 0(일)~6(토) 이고 class_schedules 도
          같은 체계다(POST /api/admin/class-schedules 의 DOW_IN 참고). 여기서는 변환이 없다.
          화면(주간 시간표)만 0=월 이라 거기서 바꾼다 — 헷갈리면 «월요일로 골랐는데 일요일» 사고가 난다.

       ⚠️ 되돌리기 — 만든 행에 source='attendance_seed' 를 찍는다.
          잘못 들어갔을 때 그 표시로만 골라낼 수 있다(사람이 판단해서 지운다). */
    if (path === '/api/admin/schedule-seed/preview' && method === 'GET') {
      const _seedSc = await getScope(env as any, request);
      if (!canEditOrg(_seedSc)) {
        return json({ ok: false, error: 'forbidden_scope', message: '본사만 사용할 수 있습니다.' }, 403);
      }
      const to = (url.searchParams.get('to') || today()).slice(0, 10);
      const fromRaw = url.searchParams.get('from');
      const from = (fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw))
        ? fromRaw
        : new Date(Date.parse(to + 'T00:00:00Z') - 56 * 86400000).toISOString().slice(0, 10);  // 기본 8주
      const minSeen = Math.max(2, Math.min(20, parseInt(url.searchParams.get('min_seen') || '3', 10) || 3));

      /* 10분 격자로 스냅해서 묶는다 — 접속 시각은 19:03·19:05 처럼 흔들려서, 분까지 그대로
         묶으면 같은 수업이 여러 패턴으로 쪼개진다(최빈값이 1이 되어 아무것도 안 걸린다). */
      const rs = await env.DB.prepare(
        `SELECT a.user_id                                             AS user_id,
                CAST(strftime('%w', a.date) AS INTEGER)               AS dow,
                printf('%02d:%02d',
                       CAST(strftime('%H', datetime(a.joined_at/1000,'unixepoch','+9 hours')) AS INTEGER),
                       (CAST(strftime('%M', datetime(a.joined_at/1000,'unixepoch','+9 hours')) AS INTEGER)/10)*10
                )                                                     AS start_time,
                COUNT(*)                                              AS seen,
                MAX(a.date)                                           AS last_date,
                AVG(COALESCE(a.total_session_ms, 0))                   AS avg_ms,
                MAX(a.teacher_uid)                                    AS teacher_uid
           FROM attendance a
          WHERE a.role = 'student' AND a.joined_at IS NOT NULL
            AND a.date BETWEEN ? AND ?
          GROUP BY a.user_id, dow, start_time
         HAVING COUNT(*) >= ?
          ORDER BY seen DESC, a.user_id`
      ).bind(from, to, minSeen).all().catch(() => ({ results: [] as any[] }));
      const rows: any[] = (rs.results || []) as any[];

      // 학생 이름·수강 상태 — 없는 학생(퇴원·명부 밖)은 화면에서 기본 해제로 보여 준다
      const uids = Array.from(new Set(rows.map(r => String(r.user_id))));
      const stuMap = new Map<string, any>();
      for (const r of await selectInChunks<any>(env.DB, uids,
        ph => `SELECT user_id, korean_name, student_name, status, shop_name FROM students_erp WHERE user_id IN (${ph})`,
        { swallowErrors: true })) stuMap.set(String(r.user_id), r);

      // 이미 같은 (학생·요일·시각) 일정이 있으면 또 만들지 않는다 — 두 번 눌러도 안 늘어난다
      const haveKey = new Set<string>();
      for (const r of await selectInChunks<any>(env.DB, uids,
        ph => `SELECT user_id, day_of_week, start_time FROM class_schedules WHERE status <> 'cancelled' AND user_id IN (${ph})`,
        { swallowErrors: true })) {
        for (const d of String(r.day_of_week || '').split(',').filter(Boolean)) {
          haveKey.add(`${r.user_id}|${d}|${String(r.start_time || '').slice(0, 5)}`);
        }
      }
      const DOW_TXT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      /* 👩‍🏫 강사 — 번호(카페24)로 이름·원부번호를 다시 찾는다.
         ⛔ attendance.teacher_name 은 읽지 않는다(옛 동기화가 남의 이름을 넣어 둔 칸이다).
            자세한 이유는 loadCafe24TeacherMap 주석. */
      const tMapSeed = await loadCafe24TeacherMap(env, rows.map(r => r.teacher_uid));

      const items = rows.map(r => {
        const uid = String(r.user_id);
        const st = stuMap.get(uid);
        const dow = Number(r.dow);
        const startTime = String(r.start_time);
        const tInfo = r.teacher_uid ? tMapSeed.get(String(r.teacher_uid)) : undefined;
        // 수업 길이 — 접속 시간 평균을 10분 단위로. 기록이 없으면 기본 20분(class-policy).
        const mins = Math.round(Number(r.avg_ms || 0) / 60000 / 10) * 10;
        return {
          user_id: uid,
          student_name: (st && (st.korean_name || st.student_name)) || null,
          shop_name: (st && st.shop_name) || null,
          in_roster: !!st,
          active: !!st && String(st.status || '') === 'active',
          dow, dow_text: DOW_TXT[dow] || '',
          start_time: startTime,
          duration_min: Math.max(10, Math.min(60, mins || DEFAULT_CLASS_MINUTES)),
          teacher_uid: r.teacher_uid || null,
          teacher_name: tInfo?.name || null,
          teacher_id: tInfo?.teacherId || null,      // 원부(teachers.id) — 못 이으면 null 로 둔다
          teacher_linked: !!tInfo?.teacherId,
          seen: Number(r.seen || 0),
          last_date: r.last_date || null,
          already: haveKey.has(`${uid}|${DOW_TXT[dow]}|${startTime}`),
        };
      });

      /* ✅ 기본 체크 규칙 — 명부에 있고, 수강 중이고, 아직 일정이 없는 것만.
         화면은 이 값을 그대로 체크박스 초기값으로 쓴다(규칙을 화면에 또 적지 않는다). */
      const recommended = items.filter(i => i.in_roster && i.active && !i.already);
      return json({
        ok: true, from, to, min_seen: minSeen,
        items,
        totals: {
          patterns: items.length,
          students: new Set(items.map(i => i.user_id)).size,
          recommended: recommended.length,
          skip_already: items.filter(i => i.already).length,
          skip_not_active: items.filter(i => i.in_roster && !i.active).length,
          skip_not_in_roster: items.filter(i => !i.in_roster).length,
          /* 강사가 안 붙는 것도 숫자로 보여 준다 — 「일정은 생겼는데 강사가 없다」를 미리 알린다 */
          no_teacher: recommended.filter(i => !i.teacher_name).length,
          teacher_unlinked: recommended.filter(i => i.teacher_name && !i.teacher_id).length,
        },
      });
    }

    /* ── POST /api/admin/schedule-seed/apply — 사람이 고른 것만 만든다 ──
       body: { items:[{ user_id, dow, start_time, duration_min?, teacher_uid?, teacher_name? }, …] }
       ⛔ 여기서 패턴을 다시 뽑지 않는다. 화면이 보여 준 것 중 «사람이 고른 것» 만 받는다. */
    if (path === '/api/admin/schedule-seed/apply' && method === 'POST') {
      const _seedSc = await getScope(env as any, request);
      if (!canEditOrg(_seedSc)) {
        return json({ ok: false, error: 'forbidden_scope', message: '본사만 사용할 수 있습니다.' }, 403);
      }
      const b: any = await parseJsonBody(request);
      const list: any[] = Array.isArray(b?.items) ? b.items : [];
      if (!list.length) return invalidBody(['items']);
      if (list.length > 500) return json({ ok: false, error: 'too_many', message: '한 번에 500건까지만 만듭니다. 나눠서 눌러 주세요.' }, 400);

      const DOW_TXT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const now = Date.now();
      const actor = await getAdminActor(request, env as any);
      let created = 0; const skipped: any[] = [];

      /* 👩‍🏫 강사 칸 — 화면이 보내 준 번호를 그대로 쓰지 않고 **서버가 다시 찾는다.**
         ⛔ class_schedules.teacher_id 는 원부(teachers.id) 번호다. 카페24 번호를 그대로
            넣으면 겹치는 자리에서 남의 이름이 뜬다(이 표를 읽는 화면들이 LEFT JOIN teachers 를 한다).
         못 이으면 **비워 둔다** — 「강사 미배정」은 눈에 띄지만 틀린 강사는 안 띈다. */
      const tMapApply = await loadCafe24TeacherMap(env, list.map((it: any) => it?.teacher_uid));
      let withTeacher = 0;

      for (const it of list) {
        const uid = String(it?.user_id || '').trim();
        const dow = Number(it?.dow);
        const startTime = String(it?.start_time || '').slice(0, 5);
        if (!uid || !(dow >= 0 && dow <= 6) || !/^\d{2}:\d{2}$/.test(startTime)) {
          skipped.push({ user_id: uid, reason: 'invalid' }); continue;
        }
        const dowTxt = DOW_TXT[dow];
        // 같은 것이 이미 있으면 건너뛴다 — 두 번 눌러도 안 늘어난다(멱등)
        const dup: any = await env.DB.prepare(
          `SELECT id FROM class_schedules WHERE user_id = ? AND day_of_week = ? AND start_time = ? AND status <> 'cancelled' LIMIT 1`
        ).bind(uid, dowTxt, startTime).first().catch(() => null);
        if (dup) { skipped.push({ user_id: uid, reason: 'already' }); continue; }

        const stu: any = await env.DB.prepare(
          `SELECT korean_name, student_name, status FROM students_erp WHERE user_id = ? LIMIT 1`
        ).bind(uid).first().catch(() => null);
        // 명부에 없거나 수강 중이 아니면 만들지 않는다 — 화면이 실수로 보내도 서버가 막는다
        if (!stu) { skipped.push({ user_id: uid, reason: 'not_in_roster' }); continue; }
        if (String(stu.status || '') !== 'active') { skipped.push({ user_id: uid, reason: 'not_active' }); continue; }

        const dur = Math.max(10, Math.min(60, Number(it?.duration_min) || DEFAULT_CLASS_MINUTES));
        const teacherId = (it?.teacher_uid ? tMapApply.get(String(it.teacher_uid))?.teacherId : null) || null;
        await env.DB.prepare(
          `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, start_time, duration_min, teacher_id, status, source, created_by, created_at, updated_at)
           VALUES (?,?,'recurring','regular',?,?,?,?,'active','attendance_seed',?,?,?)`
        ).bind(uid, stu.korean_name || stu.student_name || null, dowTxt, startTime, dur,
               teacherId, actor.name || 'admin', now, now).run();
        created++;
        if (teacherId) withTeacher++;
      }
      return json({
        ok: true, created, with_teacher: withTeacher, without_teacher: created - withTeacher,
        skipped_count: skipped.length, skipped: skipped.slice(0, 50),
      });
    }

    // 🥭 Phase 6d — POST /api/admin/class-schedules/seed-demo
    //   클릭 한 번에 정규+체험+레벨 3개 데모 스케줄 생성 (시스템 동작 즉시 확인용)
    //   (2026-07-24 강사 피드백) "오늘 수업이 없어서 교재/영상/퀴즈·레벨테스트·피드백 화면을 못 본다" →
    //   ?teacher_id= 를 함께 주면 그 강사 담당으로, 오늘 바로 입장 가능한 수업도 하나 추가로 만든다.
    if (method === 'POST' && path === '/api/admin/class-schedules/seed-demo') {
      const url = new URL(request.url);
      let userId = url.searchParams.get('user_id') || '';
      let seedTeacherId = (url.searchParams.get('teacher_id') || '').trim() || null;
      const seedTeacherNameQ = (url.searchParams.get('teacher_name') || '').trim();
      if (!seedTeacherId && seedTeacherNameQ) {
        try {
          const tName = seedTeacherNameQ.replace(/(선생님?|쌤)$/, '').trim() || seedTeacherNameQ;
          const t = await env.DB.prepare(`SELECT id FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`).bind(seedTeacherNameQ, '%' + tName + '%').first<any>();
          if (t?.id) seedTeacherId = String(t.id);
        } catch {}
      }
      /* 🔴 (2026-08-27) 아래 두 조회도 없는 컬럼 id 를 참조해 죽는다(catch 가 삼킴) →
         user_id 를 안 주면 이 API 는 no_student 로 끝난다 = 데모 시드가 만들어지지 않는다.
         ⛔ 일부러 안 고쳤다 — 되살리면 class_schedules 에 시드 행이 다시 생기는데, 6월 시드
            140행이 «이미 예약된» 자리표시로 배정을 막던 사고가 이미 있었다(CLAUDE.md 2장).
            지금은 죽어 있는 편이 안전하다. 필요해지면 그때 사람이 판단해서 되살릴 것. */
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
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`); } catch {}
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
      // 🎯 오늘 바로 입장해볼 수 있는 데모 수업 — KST 기준 지금부터 5분 뒤 (join_open 창 30분전~40분후에 걸리도록)
      const kstNow = new Date(now + 9*3600000);
      const soon = new Date(kstNow.getTime() + 5*60000);
      const soonTime = String(soon.getUTCHours()).padStart(2,'0') + ':' + String(soon.getUTCMinutes()).padStart(2,'0');
      seeds.push({ kind:'one_off', type:'regular', day:null, date:todayKst, time:soonTime, label:'데모 - 오늘 바로 입장 테스트용' });
      const inserted: any[] = [];
      for (const s of seeds) {
        try {
          const ins = await env.DB.prepare(
            `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'demo_seed', ?, ?)`
          ).bind(userId, studentName, s.kind, s.type, s.day, s.date, s.time, DEFAULT_CLASS_MINUTES, seedTeacherId, 'admin', now).run();
          inserted.push({ id: ins?.meta?.last_row_id, ...s });
        } catch (e: any) {
          inserted.push({ error: String(e?.message||e), ...s });
        }
      }
      return json({ ok: true, user_id: userId, student_name: studentName, count: inserted.length, items: inserted });
    }


    // 🥭 (2026-07-24) POST /api/admin/class-schedules — 수업 예약 신규 등록
    //   ▸ 왜 지금 만드나: 지금까지 예약을 '만드는' 경로가 관리자 AI 명령(ai-command.ts) 하나뿐이었다.
    //     화면에 등록 폼이 없어 담당자가 예약을 직접 잡을 수 없었고, 그래서 교사·학생이 방 코드를
    //     손으로 주고받다 서로 다른 방에 들어가는 사고가 반복됐다(2026-07-23 실수업 12분 손실).
    //     예약이 있으면 room_id 가 class-{id}-{YYYYMMDD} 로 결정돼 엇갈림이 원천 차단된다.
    //   body: { student_name(필수), user_id?, teacher_name?|teacher_id?,
    //           schedule_kind:'recurring'|'one_off', days:[0-6]|day_of_week, scheduled_date:'YYYY-MM-DD',
    //           start_time:'HH:MM'(필수), duration_min?, class_type?, notes?, force? }
    //   ⚠️ day_of_week 는 반드시 '숫자 0=일~6=토' 로 저장한다 — /api/class/sessions/today 가
    //      그 형식을 기준으로 오늘 수업을 계산한다. 반복 수업이 여러 요일이면 요일당 1행.
    if (method === 'POST' && path === '/api/admin/class-schedules') {
      try {
        await env.DB.exec(
          `CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`
        );
      } catch {}
      const body: any = await request.json().catch(() => ({}));
      const bad = (error: string, ko: string, en: string, extra: any = {}, code = 400) =>
        json({ ok: false, error, message: ko, message_en: en, ...extra }, code);

      // ── 학생 신원 (uid 우선, 없으면 이름으로 조회) ──
      const studentName = String(body.student_name || '').trim();
      let userId = String(body.user_id || '').trim();
      if (!userId && studentName) {
        try {
          /* ⚠️ (2026-08-27) 여기 있던 ('stu_' || id) 는 students_erp 에 없는 컬럼이라 죽어 있었고
             (catch 가 삼킴) 그래서 «이름만 주고 등록» 은 늘 student_not_found 로 끝났다.
             ⛔ 되살릴 때 옛 `LIMIT 1` 을 그대로 두면 안 된다 — 동명이인이 실재하므로(김민서 71명)
                «아무나» 집어 남의 계정에 수업이 등록된다. 이름이 **정확히 한 계정으로만** 떨어질
                때만 쓰고, 아니면 안 채운다(아래에서 student_not_found 로 사람에게 되묻는다).
             — sessions/today 의 이름 구제와 같은 규칙(CLAUDE.md 2장 «모르는 것보다 틀린 게 나쁘다»). */
          const rs = await env.DB.prepare(
            `SELECT COALESCE(user_id, login_id) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`
          ).bind(studentName, studentName).all<any>();
          const uids = Array.from(new Set((rs.results || []).map((x: any) => x.uid).filter(Boolean)));
          if (uids.length === 1) userId = String(uids[0]);
        } catch {}
      }
      if (!userId) return bad('student_not_found', '학생을 찾지 못했습니다. 이름을 확인하거나 user_id 를 함께 보내주세요.', 'Student not found. Check the name or send user_id as well.');

      // ── 강사 매칭 (teachers 테이블 기준. '선생님/쌤' 접미사 제거 후 부분일치) ──
      //   ⚠️ teacher_profiles 에만 있고 teachers 에 없는 강사는 여기서 안 잡힌다 →
      //      teacher_matched:false 로 돌려줘 화면이 경고할 수 있게 한다(등록 자체는 진행).
      let teacherId = String(body.teacher_id || '').trim();
      let teacherName: string | null = null;
      let teacherMatched = !!teacherId;
      const tRaw = String(body.teacher_name || '').trim();
      if (!teacherId && tRaw) {
        const tName = tRaw.replace(/(선생님?|쌤)$/, '').trim() || tRaw;
        try {
          const t = await env.DB.prepare(`SELECT id, name FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`)
            .bind(tRaw, '%' + tName + '%').first<any>();
          if (t?.id) { teacherId = String(t.id); teacherName = String(t.name); teacherMatched = true; }
        } catch {}
      }

      // ── 시간 ──
      const rawTime = String(body.start_time || '').trim();
      if (!/^\d{1,2}:\d{2}$/.test(rawTime)) return bad('invalid_time', '시작 시간을 HH:MM 형식으로 입력해 주세요.', 'Enter start time as HH:MM.');
      const [rh, rm] = rawTime.split(':');
      if (Number(rh) > 23 || Number(rm) > 59) return bad('invalid_time', '시작 시간이 올바르지 않습니다.', 'Start time is out of range.');
      const startTime = String(Number(rh)).padStart(2, '0') + ':' + rm;
      // ⏱ (2026-08-26) 안 보내면 30분이 아니라 정책 기본값(20분) — class-policy.ts 머리말이
      //   경고하는 «운영 DB 옛 스키마 DEFAULT 30» 이 여기로 새어 들어오지 않게 명시적으로 20을 쓴다.
      //   명시된 값은 그대로 존중한다(주간 스케줄 화면은 20/30/40 만 보내지만, 이 API 자체는
      //   그 세 값으로 좁히지 않는다 — 기존에 열려 있던 상한 240분은 그대로 유지).
      const durationMin = Number.isFinite(Number(body.duration_min)) && Number(body.duration_min) > 0 ? Math.min(Number(body.duration_min), 240) : DEFAULT_CLASS_MINUTES;
      const classType = ['regular', 'trial', 'level_test', 'makeup'].includes(String(body.class_type || '')) ? String(body.class_type) : 'regular';
      const notes = body.notes ? String(body.notes).slice(0, 500) : null;

      // ── 반복(요일) / 일회성(날짜) ──
      const DOW_IN: Record<string, number> = {
        sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
        tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
        thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
        sat: 6, saturday: 6, '토': 6, '토요일': 6,
      };
      const toDow = (v: any): number | null => {
        const q = String(v ?? '').trim();
        if (!q) return null;
        if (/^\d$/.test(q)) { const n = Number(q); return (n >= 0 && n <= 6) ? n : null; }
        const x = DOW_IN[q.toLowerCase()];
        return x == null ? null : x;
      };
      const kind = String(body.schedule_kind || '').toLowerCase() === 'one_off' ? 'one_off' : 'recurring';
      const rawDays: any[] = Array.isArray(body.days) ? body.days
        : (body.day_of_week != null ? String(body.day_of_week).split(/[,\s]+/) : []);
      const days: number[] = [];
      for (const d of rawDays) { const n = toDow(d); if (n != null && !days.includes(n)) days.push(n); }
      const schedDate = String(body.scheduled_date || '').trim();

      if (kind === 'recurring' && !days.length) return bad('day_required', '반복 수업은 요일을 하나 이상 선택해 주세요.', 'Pick at least one weekday for a recurring class.');
      if (kind === 'one_off' && !/^\d{4}-\d{2}-\d{2}$/.test(schedDate)) return bad('date_required', '일회성 수업은 날짜(YYYY-MM-DD)를 입력해 주세요.', 'Enter a date (YYYY-MM-DD) for a one-off class.');

      // ── ⛔ 시간 겹침 검사 (2026-08-04 보강) ─────────────────────────────
      //   [기존 문제 1] `start_time = ?` 로 '시작 시각이 완전히 같은' 예약만 잡았다.
      //     → 09:00 (50분) 수업이 있는데 09:30 수업을 넣으면 20분이 겹치는데도 그냥 통과했다.
      //     이제 duration_min 을 반영한 '구간 겹침' 으로 판정한다.
      //   [기존 문제 2] user_id(학생) 기준만 봤다. 같은 강사가 같은 시간에 다른 학생 수업을
      //     이미 갖고 있어도 아무도 막지 않았다 = 강사가 동시에 두 방에 들어가야 하는 상태.
      //     화상수업에서는 물리적으로 불가능해 수업 당일 사고로 직결된다.
      //   ⚠️ 단, '같은 시각·같은 길이' 는 합반(그룹) 수업이 정상적으로 만들어내는 모양이므로
      //     강사 겹침에서 제외한다. 막으면 멀쩡한 합반 등록이 깨진다.
      //   응답 코드는 기존과 같은 'conflict' 를 유지한다 → 화면(admin/student.html)이
      //     이미 409+conflict 를 확인창으로 처리하고 있어 프론트 수정이 필요 없다.
      //   판정은 schedule-conflict.ts 한 곳에만 둔다 — 경로마다 복사하면 또 어긋난다.
      const conf = await findScheduleConflicts(env, {
        kind, userId, teacherId, days, schedDate, startTime, durationMin,
      });
      if (conf.has && !body.force) {
        return bad('conflict', conf.ko + ' 그래도 등록하려면 다시 확인해 주세요.', conf.en + ' Confirm again to register anyway.',
          { conflicts: conf.student, teacher_conflicts: conf.teacher }, 409);
      }

      // ── 🚫 강사 근무불가(휴가·휴식시간) 검사 — 강사 피드백(2026-07-24):
      //   "강사가 휴가일 때 그 시간에 학생이 예약 못 하게 막아야 한다." force:true 로도 우회 못 하게
      //   (강사가 실제로 없는 시간에 등록되면 수업 진행 자체가 불가능해 conflict 와는 성격이 다르다)
      const teacherBlocks: any[] = [];
      if (teacherId) {
        try {
          await env.DB.exec(
            `CREATE TABLE IF NOT EXISTS teacher_unavailability (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT NOT NULL, teacher_name TEXT, kind TEXT NOT NULL DEFAULT 'date_range', start_date TEXT, end_date TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL)`
          );
          const toMin = (hhmm: string) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
          const classStartMin = toMin(startTime);
          const classEndMin = classStartMin + durationMin;
          const rs = await env.DB.prepare(`SELECT * FROM teacher_unavailability WHERE teacher_id = ?`).bind(teacherId).all<any>();
          const overlaps = (b: any) => {
            const bStart = b.start_time ? toMin(b.start_time) : 0;
            const bEnd = b.end_time ? toMin(b.end_time) : 24 * 60;
            return classStartMin < bEnd && bStart < classEndMin;
          };
          for (const b of (rs.results || [])) {
            if (kind === 'one_off') {
              if (b.kind === 'date_range' && b.start_date && b.end_date && schedDate >= b.start_date && schedDate <= b.end_date && overlaps(b)) teacherBlocks.push(b);
              else if (b.kind === 'weekly' && b.day_of_week != null) {
                const dow = new Date(schedDate + 'T00:00:00').getDay();
                if (Number(b.day_of_week) === dow && overlaps(b)) teacherBlocks.push(b);
              }
            } else {
              if (b.kind === 'weekly' && b.day_of_week != null && days.includes(Number(b.day_of_week)) && overlaps(b)) teacherBlocks.push(b);
            }
          }
        } catch {}
      }
      // ── 🏖 기존 "캘린더 관리(휴가·공휴일)" 카드에 등록된 종일 휴가와도 충돌 검사 ──
      //   calendar_events 는 teacher_id 를 저장하지 않아(항상 NULL) teacher_name 문자열로만 대조 가능.
      //   (일회성 예약만 검사 — 반복 예약은 특정 날짜가 없어 종일 휴가와 대조할 기준일이 없음)
      if (kind === 'one_off' && teacherName) {
        try {
          const vac = await env.DB.prepare(
            `SELECT id, title, date, end_date FROM calendar_events WHERE event_type = 'vacation' AND teacher_name = ? AND date <= ? AND COALESCE(end_date, date) >= ? LIMIT 1`
          ).bind(teacherName, schedDate, schedDate).first<any>();
          if (vac) teacherBlocks.push({ kind: 'calendar_vacation', ...vac });
        } catch {}
      }
      if (teacherBlocks.length) {
        return bad('teacher_unavailable', '이 시간은 강사가 근무 불가(휴가/휴식시간)로 등록되어 있어 예약할 수 없습니다.', 'The teacher is marked unavailable (time off / break) during this time — booking is blocked.', { teacher_blocks: teacherBlocks }, 409);
      }

      // ── 등록 (반복 수업은 요일당 1행 — sessions/today 가 요일 1개를 전제로 계산) ──
      const now = Date.now();
      let actorName = 'admin';
      try { const a = await getAdminActor(request, env as any); if (a?.name) actorName = a.name; } catch {}
      const created: any[] = [];
      const failed: any[] = [];
      const targets = kind === 'recurring'
        ? days.map(d => ({ dow: String(d), date: null as string | null }))
        : [{ dow: null as string | null, date: schedDate }];
      for (const t of targets) {
        try {
          const ins = await env.DB.prepare(
            `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'admin_ui', ?, ?, ?)`
          ).bind(userId, studentName || null, kind, classType, t.dow, t.date, startTime, durationMin, teacherId || null, actorName, now, notes).run();
          created.push({ id: (ins?.meta?.last_row_id as number) ?? null, day_of_week: t.dow, scheduled_date: t.date, start_time: startTime });
        } catch (e: any) {
          failed.push({ day_of_week: t.dow, scheduled_date: t.date, detail: String(e?.message || e).slice(0, 200) });
        }
      }
      if (!created.length) return bad('insert_failed', '예약 등록에 실패했습니다.', 'Failed to create the schedule.', { failed }, 500);

      // 📜 수업 변경 이력 — best-effort
      for (const c of created) {
        try {
          await writeClassAudit(env, {
            action: 'add', schedule_id: c.id,
            teacher_name: teacherName, student_name: studentName || null,
            lesson_date: c.scheduled_date || null, lesson_time: startTime,
            actor: actorName, actor_role: 'admin', source: 'ui', reason: null,
          });
        } catch {}
      }

      return json({
        ok: true, created, failed,
        // force:true 로 겹침을 무릅쓰고 등록한 경우, 무엇과 겹쳤는지 그대로 돌려준다
        conflicts: conf.student, teacher_conflicts: conf.teacher,
        user_id: userId, student_name: studentName || null,
        teacher_id: teacherId || null, teacher_name: teacherName, teacher_matched: teacherMatched,
        schedule_kind: kind, start_time: startTime, duration_min: durationMin,
        // 강사가 teachers 에 없으면 교사 쪽 '오늘 내 수업' 조회가 비게 된다 → 화면이 경고하도록
        warning: (!teacherMatched && tRaw) ? '강사 "' + tRaw + '" 를 강사 명단(teachers)에서 찾지 못해 담당 강사 없이 등록했습니다. 강사 명단에 등록한 뒤 다시 지정해 주세요.' : null,
        warning_en: (!teacherMatched && tRaw) ? 'Teacher "' + tRaw + '" was not found in the teacher list, so the class was created without an assigned teacher. Add the teacher first, then reassign.' : null,
      });
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
        /* 🪞 (2026-08-31) 지우는 것도 «사람 손» 이다 — 도장을 함께 찍는다.
           안 찍으면 미러가 다음 실행에서 그 수업을 «없네?» 하고 다시 만든다. */
        const _delMirror = _delRow && String(_delRow.source || '') === MIRROR_SOURCE;
        await env.DB.prepare(
          _delMirror
            ? `UPDATE class_schedules SET status='cancelled', source='${MIRROR_SOURCE_MANUAL}', updated_at=? WHERE id=?`
            : `UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`
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

    // 🚫 강사 근무불가(휴가·휴식시간) 관리 — 강사 피드백(2026-07-24):
    //   "강사 스케줄/휴식시간 관리를 찾을 수 없다. 휴가일 때 학생이 예약 못 하게 막아야 한다."
    //   등록해두면 위 /api/admin/class-schedules 등록 시 자동으로 막힌다(teacher_unavailable 409).
    const TU_TABLE_SQL = `CREATE TABLE IF NOT EXISTS teacher_unavailability (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT NOT NULL, teacher_name TEXT, kind TEXT NOT NULL DEFAULT 'date_range', start_date TEXT, end_date TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL)`;

    /* 🧹 LMS·시드 «자리표시» 일괄 정리 — 2026-08-24 사장님 지시
     * ═══════════════════════════════════════════════════════════════════════
     * [무엇인가] class_schedules 활성 행의 대부분은 진짜 수업이 아니라 자리표시다:
     *     · user_id='lms'       — 옛 LMS 점유 (source=lms_import_w26, notes='LMS 수업중')
     *     · user_id='type_seed' — 6월 시연용 시드 (source=type_seed_20260623)
     *   학생이 안 붙어 있어 화면엔 「LMS」·「시드」 배지로만 보인다.
     *
     * [왜 지우나] 2026-08-24 에 먼저 «판정만 바꿔» 그 칸에도 배정할 수 있게 했지만,
     *   칸이 화면에 그대로 남아 실제 운영에서는 달라진 게 없다는 판단(사장님).
     *   → 「실제 데이터가 아니고 지워도 망고아이 데이터에 영향이 없다」는 확인 아래 정리한다.
     *
     * [어떻게 지우나] **status='cancelled'** 로 내린다 — 이 저장소에서 «삭제» 는 이미
     *   그 뜻이다(DELETE /api/admin/class-schedules/:id 가 같은 방식). 화면은 전부
     *   `status='active'` 만 읽으므로 즉시 사라지고, 잘못됐을 때 되돌릴 수 있다.
     *   ⛔ 행을 물리적으로 지우지 않는다 — 개발·운영이 같은 DB라 되돌릴 방법이 없어진다.
     *
     * ⚠️ 학생이 붙어 있는 행은 **절대** 건드리지 않는다. user_id 가 정확히 그 둘일 때만.
     * ⚠️ 강사·지사·대리점은 실행할 수 없다(아래 게이트). 본사만.
     * ℹ️ dry_run=true 면 «몇 건인지» 만 세어 돌려준다 — 화면이 먼저 보여 주고 묻는다.
     * 📜 감사 로그는 **요약 한 줄**만 남긴다(수백 줄을 남기면 이력이 그것으로 덮인다).
     */
    if (method === 'POST' && path === '/api/admin/class-schedules/purge-placeholders') {
      const _pActor = await getAdminActor(request, env as any);
      if (_pActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
      const _pScope = await getScope(env as any, request);
      if (!canEditOrg(_pScope)) return json({ ok: false, error: 'forbidden_scope' }, 403);

      const body: any = await request.json().catch(() => ({}));
      const which = String(body?.which || 'both');
      /* 지울 대상은 «표시자 목록» 으로만 정한다 — 조건을 자유 문자열로 받지 않는다.
         (자유 조건을 받으면 언젠가 진짜 수업까지 지우는 요청이 만들어진다) */
      const UIDS = which === 'lms' ? ['lms'] : which === 'seed' ? ['type_seed'] : ['lms', 'type_seed'];
      const ph = UIDS.map(() => '?').join(',');
      const WHERE = `WHERE LOWER(COALESCE(user_id,'')) IN (${ph})
                       AND (status IS NULL OR status = 'active')`;
      try {
        const cnt: any = await env.DB.prepare(
          `SELECT COUNT(*) AS n,
                  SUM(CASE WHEN LOWER(COALESCE(user_id,'')) = 'lms' THEN 1 ELSE 0 END) AS lms,
                  SUM(CASE WHEN LOWER(COALESCE(user_id,'')) = 'type_seed' THEN 1 ELSE 0 END) AS seed
             FROM class_schedules ${WHERE}`
        ).bind(...UIDS).first();
        const total = Number(cnt?.n || 0);
        if (body?.dry_run) {
          return json({ ok: true, dry_run: true, count: total,
            lms: Number(cnt?.lms || 0), seed: Number(cnt?.seed || 0) });
        }
        if (!total) return json({ ok: true, count: 0, message: '정리할 자리표시가 없습니다.' });

        await env.DB.prepare(
          `UPDATE class_schedules SET status = 'cancelled', updated_at = ? ${WHERE}`
        ).bind(Date.now(), ...UIDS).run();

        await writeClassAudit(env, {
          action: 'remove', schedule_id: null,
          actor: _pActor.name || '관리자', actor_role: 'admin', source: 'ui',
          reason: `LMS·시드 자리표시 일괄 정리 (${which}) — ${total}건`,
        }).catch(() => {});

        return json({ ok: true, count: total,
          lms: Number(cnt?.lms || 0), seed: Number(cnt?.seed || 0), status: 'cancelled' });
      } catch (e: any) {
        return json({ ok: false, error: 'purge_failed', detail: String(e?.message || e) }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/teacher-unavailability') {
      try { await env.DB.exec(TU_TABLE_SQL); } catch {}
      const teacherIdQ = (url.searchParams.get('teacher_id') || '').trim();
      try {
        const rs = teacherIdQ
          ? await env.DB.prepare(`SELECT * FROM teacher_unavailability WHERE teacher_id = ? ORDER BY created_at DESC`).bind(teacherIdQ).all<any>()
          : await env.DB.prepare(`SELECT * FROM teacher_unavailability ORDER BY created_at DESC LIMIT 500`).all<any>();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: 'list_failed', detail: String(e?.message || e) }, 500);
      }
    }

    if (method === 'POST' && path === '/api/admin/teacher-unavailability') {
      try { await env.DB.exec(TU_TABLE_SQL); } catch {}
      const body: any = await request.json().catch(() => ({}));
      const bad = (error: string, ko: string, en: string, code = 400) => json({ ok: false, error, message: ko, message_en: en }, code);

      // 강사 지정 — id 를 직접 주거나(선택), 기존 캘린더 휴가 폼과 같은 UX 로 이름만 입력해도 teachers 테이블에서 매칭.
      let teacherId = String(body.teacher_id || '').trim();
      let teacherName: string | null = body.teacher_name ? String(body.teacher_name).slice(0, 100) : null;
      if (!teacherId && teacherName) {
        try {
          const tName = teacherName.replace(/(선생님?|쌤)$/, '').trim() || teacherName;
          const t = await env.DB.prepare(`SELECT id, name FROM teachers WHERE name = ? OR name LIKE ? LIMIT 1`).bind(teacherName, '%' + tName + '%').first<any>();
          if (t?.id) { teacherId = String(t.id); teacherName = String(t.name); }
        } catch {}
      }
      if (!teacherId) return bad('teacher_required', '강사 명단(teachers)에서 이름을 찾지 못했습니다. 강사 명단에 먼저 등록해 주세요.', 'Could not find this teacher in the teacher list. Add them there first.');
      const kind = body.kind === 'weekly' ? 'weekly' : 'date_range';
      const timeRe = /^\d{1,2}:\d{2}$/;
      const startTime = body.start_time && timeRe.test(String(body.start_time)) ? String(body.start_time) : null;
      const endTime = body.end_time && timeRe.test(String(body.end_time)) ? String(body.end_time) : null;
      if ((startTime && !endTime) || (!startTime && endTime)) return bad('time_range_incomplete', '시작/종료 시간은 둘 다 입력하거나 둘 다 비워주세요(비우면 하루 종일 차단).', 'Enter both start and end time, or leave both empty to block the whole day.');

      if (!teacherName) {
        try { const t = await env.DB.prepare(`SELECT name FROM teachers WHERE id = ? LIMIT 1`).bind(teacherId).first<any>(); if (t?.name) teacherName = String(t.name); } catch {}
      }

      let startDate: string | null = null, endDate: string | null = null, dayOfWeek: number | null = null;
      if (kind === 'date_range') {
        startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.start_date || '')) ? String(body.start_date) : null;
        endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.end_date || '')) ? String(body.end_date) : startDate;
        if (!startDate) return bad('date_required', '휴가 시작 날짜(YYYY-MM-DD)를 입력해 주세요.', 'Enter a start date (YYYY-MM-DD).');
        if (endDate! < startDate) return bad('date_range_invalid', '종료 날짜가 시작 날짜보다 빠릅니다.', 'End date is before start date.');
      } else {
        const n = Number(body.day_of_week);
        if (!Number.isFinite(n) || n < 0 || n > 6) return bad('day_required', '반복 휴식시간은 요일(0~6)을 지정해 주세요.', 'Pick a weekday (0-6) for the recurring block.');
        dayOfWeek = n;
      }

      const actor = await getAdminActor(request, env as any);
      const now = Date.now();
      try {
        const ins = await env.DB.prepare(
          `INSERT INTO teacher_unavailability (teacher_id, teacher_name, kind, start_date, end_date, day_of_week, start_time, end_time, reason, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(teacherId, teacherName, kind, startDate, endDate, dayOfWeek, startTime, endTime, body.reason ? String(body.reason).slice(0, 300) : null, actor.name || 'admin', now).run();
        return json({ ok: true, id: (ins?.meta?.last_row_id as number) ?? null });
      } catch (e: any) {
        return json({ ok: false, error: 'insert_failed', detail: String(e?.message || e) }, 500);
      }
    }

    if (method === 'DELETE' && /^\/api\/admin\/teacher-unavailability\/\d+$/.test(path)) {
      const id = parseInt(path.split('/').pop() || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      try {
        await env.DB.prepare(`DELETE FROM teacher_unavailability WHERE id = ?`).bind(id).run();
        return json({ ok: true, id });
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
      // 📜 이동 전 정보(이력용) + 행위자
      const _pchActor = await getAdminActor(request, env as any);
      const _pchRow: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      /* 🪞 (2026-08-31) 「사람 손이 이긴다」 도장 — 사장님 결정.
         카페24 미러가 만든 행(source='c24-mirror')을 사람이 고치면 그 자리에서
         'c24-mirror:manual' 로 바꾼다. 그 뒤로 미러는 그 행을 **영영 안 건드린다**
         (c24-mirror.ts 의 UPDATE 가 WHERE source='c24-mirror' 라 0행이 된다).
         ⛔ 도장을 나중에 «따로» 찍는 방식으로 바꾸지 말 것 — 그 사이에 야간 미러가 돌면
            사람이 고친 값이 카페24 값으로 되돌아간다. 같은 UPDATE 안에서 찍어야 한다. */
      if (_pchRow && String(_pchRow.source || '') === MIRROR_SOURCE) {
        sets.push('source = ?'); binds.push(MIRROR_SOURCE_MANUAL);
      }
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
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
      // 🔁 (2026-08-18) B2C «미연장» 분리 — 이력에서도 미납/미연장을 구분해 보여 준다.
      //    ALTER 는 이미 있으면 에러라 통째로 삼킨다(추가만 하므로 기존 행은 그대로).
      try { await env.DB.exec(`ALTER TABLE payment_overdue_log ADD COLUMN channel TEXT`); } catch {}
      try { await env.DB.exec(`ALTER TABLE payment_overdue_log ADD COLUMN last_class_at INTEGER`); } catch {}
    };

    /* ═══════════════════════════════════════════════════════════════
       🔁 B2C «미연장» 판정 도우미 (2026-08-18 사장님 지시)

       사장님 말씀: 「B2C(개인 결제) 회원은 결제한 만큼만 수업이 나가는 구조라
                    «미납» 이 아니라 «미연장» 이 맞는 표현이다.」

       그래서 이 아래 세 가지가 필요하다.
        ① 학생이 B2C 인지 아는 법
           결제 행에는 구분값이 없다. 정본은 «대리점 관리»의 지정값 centers.payment_type 이고,
           학생 → 대리점 연결은 students_erp.shop_name = centers.name 이다.
           (payments-board.ts·accounting-reports.ts 의 결제 목록이 쓰는 것과 같은 규칙.)
           ⚠️ students_erp.payment_type 은 2026-08-18 기준 29,398행 **전부 NULL** 이라
              혼자서는 못 쓴다. 그래도 나중에 채워질 수 있으니 보조 판정으로 남긴다.
           ⚠️ centers.name 은 유일하지 않다(2장 함정). 그래서 JOIN 대신 «B2C 대리점 이름 집합»
              을 한 번 받아 와 메모리에서 맞춘다 — 행 뻥튀기도 없고 D1 읽기도 싸다.
              (상관 서브쿼리로 하면 같은 판정에 1,900만 행을 읽는다. 실측함.)

        ② 마지막 수업일
           «결제한 만큼 수업이 나간다» 니까 마지막 결제일 + 한 달이 수업 종료일이다.
           원부의 end_date 가 그보다 뒤면 그쪽이 더 정확하므로 그걸 쓴다
           (실측: end_date 는 2020년에 멈춘 옛 값이 많아 그냥 믿으면 안 된다).

        ③ 「1개월 넘게 안 돌아온 사람은 빼기」
           수업이 끝난 지 RENEW_WINDOW_DAYS(기본 30일)를 넘으면 연장 가능성이 낮다고 보고
           명단에서 제외한다. 세어서 보여는 주되, 문자는 보내지 않는다.
       ═══════════════════════════════════════════════════════════════ */
    const CLASS_TERM_DAYS = 30;          // 1회 결제로 나가는 수업 기간(한 달)
    const DEFAULT_RENEW_WINDOW_DAYS = 30; // 수업 종료 후 이 기간 안쪽만 연장 안내 대상

    /** B2C 로 지정된 대리점 이름 집합. 실패하면 빈 집합(=아무도 B2C 로 안 봄 → 종전 동작). */
    const loadB2cCenterNames = async (): Promise<Set<string>> => {
      const set = new Set<string>();
      try {
        const rs = await env.DB.prepare(
          `SELECT name FROM centers WHERE UPPER(COALESCE(payment_type,'')) = 'B2C' AND name IS NOT NULL AND name <> ''`
        ).all<any>();
        for (const r of (rs.results || [])) set.add(String(r.name).trim());
      } catch {}
      return set;
    };

    /** 이 학생이 B2C(개인 결제)인가 — 대리점 지정이 정본, 없으면 학생 원부의 표기. */
    const isB2cStudent = (row: any, b2cNames: Set<string>): boolean => {
      const shop = String(row?.shop_name || '').trim();
      if (shop && b2cNames.has(shop)) return true;
      const pt = String(row?.payment_type || '').toUpperCase();
      if (pt.startsWith('B2B')) return false;
      return pt.startsWith('B2C');
    };

    /** 마지막 수업일(ms). end_date 가 마지막 결제일보다 뒤면 그쪽이 정확하다. */
    const resolveLastClassAt = (lastPaidAt: number, endDate: any): number => {
      const derived = Number(lastPaidAt) + CLASS_TERM_DAYS * 86400 * 1000;
      const ed = String(endDate || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
        const ms = Date.parse(ed + 'T23:59:59+09:00');
        if (Number.isFinite(ms) && ms > Number(lastPaidAt)) return ms;
      }
      return derived;
    };

    /* ── 💳 결제관리 화면(ph106) — /api/admin/payments/b2b · /b2c ──
       B2B 는 통장 직접입금, B2C 는 카드결제로 «보는 표가 서로 다르다». 왜 그런지는
       payments-board.ts 머리말에 적어 뒀다. 인증은 index.ts 의 default-deny 게이트가
       '/api/admin/payments' 접두사로 이미 덮고 있어 별도 등록이 필요 없다. */
    {
      const pb = await handlePaymentsBoardApi(request, url, env as any);
      if (pb) return pb;
    }

    /* ── GET /api/admin/payments/overdue?grace_days=35&monthly_fee=200000&renew_days=30 ──
         학생별 마지막 결제일 조회 → grace_days 초과면 «안 낸/안 늘린» 상태로 분류.

       🔁 (2026-08-18) B2C 는 «미납» 이 아니라 «미연장» 이다.
          행마다 channel(B2B/B2C)·term_label(미납/미연장)·last_class_at(마지막 수업일)·
          lapse_days(수업 종료 후 경과일)를 함께 준다. 화면은 이 값으로만 라벨을 쓴다 —
          화면이 자기 나름대로 다시 판정하면 두 화면 숫자가 갈린다.

       🚫 그리고 수업이 끝난 지 renew_days(기본 30일)를 넘긴 학생은 «연장 가능성 낮음»
          으로 보고 명단에서 뺀다(not_renewable 로 따로 세어서 보여만 준다).
          그래야 「이미 마음 떠난 사람에게 계속 결제 문자」가 안 나간다. */
    if (method === 'GET' && path === '/api/admin/payments/overdue') {
      await ensurePaymentTables();
      const graceDays = Math.max(1, parseInt(url.searchParams.get('grace_days') || '35', 10));
      const defaultMonthlyFee = Math.max(0, parseInt(url.searchParams.get('monthly_fee') || '200000', 10));
      const renewWindowDays = Math.max(1, parseInt(url.searchParams.get('renew_days') || String(DEFAULT_RENEW_WINDOW_DAYS), 10));
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
                s.shop_name, s.payment_type, s.end_date,
                MAX(p.paid_at) AS last_paid_at
           FROM students_erp s
           JOIN student_payments p ON p.user_id = s.user_id AND p.status = 'paid'
          WHERE ${activeWhere}
          GROUP BY s.user_id`
      ).bind(..._sw.binds).all<any>().catch(() => ({ results: [] } as any));
      const b2cNames = await loadB2cCenterNames();
      const overdue: any[] = [];        // 안내 대상
      const notRenewable: any[] = [];   // 수업 종료 후 renew_days 초과 → 안내 제외
      const upToDate: any[] = [];
      let paidCount = 0, overdueCount = 0, notRenewableCount = 0;
      let b2cCount = 0;
      for (const row of (paidRs.results || [])) {
        paidCount++;
        if (!(row.last_paid_at < cutoff)) {
          if (upToDate.length < CAP) upToDate.push({ ...row, days_overdue: 0 });
          continue;
        }
        const isB2c = isB2cStudent(row, b2cNames);
        const lastClassAt = resolveLastClassAt(row.last_paid_at, row.end_date);
        const lapseDays = Math.floor((now - lastClassAt) / (86400 * 1000));
        const daysOverdue = Math.floor((now - row.last_paid_at) / (86400 * 1000)) - graceDays;
        const enriched = {
          ...row,
          days_overdue: daysOverdue,
          amount_krw: defaultMonthlyFee,
          channel: isB2c ? 'B2C' : 'B2B',
          // 🏷 라벨의 정본은 여기다. 화면은 이 문자열을 그대로 쓴다.
          term_label: isB2c ? '미연장' : '미납',
          last_class_at: lastClassAt,
          lapse_days: lapseDays,
        };
        if (isB2c) b2cCount++;
        if (lapseDays > renewWindowDays) {
          notRenewableCount++;
          if (notRenewable.length < CAP) notRenewable.push({ ...enriched, excluded_reason: 'renew_window_passed' });
          continue;
        }
        overdueCount++;
        if (overdue.length < CAP) overdue.push(enriched);
      }
      // 미결제 = 활동학생 - 결제이력학생. 상세는 표시하지 않음(대규모라 카운트만).
      const neverPaidCount = Math.max(0, totalActive - paidCount);
      const upToDateCount = paidCount - overdueCount - notRenewableCount;
      return json({
        ok: true,
        grace_days: graceDays,
        default_fee: defaultMonthlyFee,
        renew_days: renewWindowDays,
        overdue, never_paid: [], up_to_date: upToDate,
        not_renewable: notRenewable,
        capped: CAP,
        summary: {
          total_active: totalActive,
          total_paid_students: paidCount,
          total_overdue: overdueCount,          // 안내 대상(미연장+미납)
          total_b2c: b2cCount,
          total_not_renewable: notRenewableCount, // 수업 종료 1개월 초과 → 제외
          total_never_paid: neverPaidCount,
          total_up_to_date: upToDateCount,
        }
      });
    }

    /* ── POST /api/admin/payments/notify-overdue — 1명 안내 발송 ──
         body: { user_id, student_name, parent_phone, days_overdue, amount_krw,
                 channel?, last_class_at? }

       🔁 (2026-08-18) B2C 는 «미연장» 문구로 나간다. 금액·미납일수를 말하지 않는다 —
          선불이라 받을 돈이 없는데 「N일 미납 20만원」 이라고 보내면 사실이 아니다.
          channel 은 화면이 스캔 결과에서 받은 값을 그대로 실어 준다. 안 실려 오면
          여기서 다시 원부를 보고 판정한다(화면 말만 믿지 않는다). */
    if (method === 'POST' && path === '/api/admin/payments/notify-overdue') {
      await ensurePaymentTables();
      const body: any = await request.json().catch(() => ({}));
      const phone = body.parent_phone || body.student_phone;
      if (!phone) return json({ ok: false, error: 'phone_required' }, 400);

      // 채널 확정 — 화면이 준 값이 없거나 이상하면 원부에서 다시 본다
      let channel = String(body.channel || '').toUpperCase();
      let lastClassAt = parseInt(body.last_class_at, 10) || 0;
      if (channel !== 'B2B' && channel !== 'B2C') {
        const b2cNames = await loadB2cCenterNames();
        const srow = body.user_id ? await env.DB.prepare(
          `SELECT shop_name, payment_type, end_date,
                  (SELECT MAX(paid_at) FROM student_payments WHERE user_id = ? AND status='paid') AS last_paid_at
             FROM students_erp WHERE user_id = ? LIMIT 1`
        ).bind(body.user_id, body.user_id).first<any>().catch(() => null) : null;
        channel = srow && isB2cStudent(srow, b2cNames) ? 'B2C' : 'B2B';
        if (!lastClassAt && srow?.last_paid_at) lastClassAt = resolveLastClassAt(srow.last_paid_at, srow.end_date);
      }
      if (!lastClassAt) {
        // 마지막 수업일을 못 구했으면 경과일수로 되짚는다(= 지금 - 미납일수)
        lastClassAt = Date.now() - (parseInt(body.days_overdue, 10) || 0) * 86400 * 1000;
      }

      const isB2c = channel === 'B2C';
      /* 🔗 이 학생 전용 링크를 새로 발급한다. 실패하면 null 이고, 그때는 문자에
            공용 /enroll.html 링크가 들어간다(문자를 아예 못 보내는 것보다 낫다). */
      const renewLink = isB2c && body.user_id ? await issueRenewLink(env, body.user_id) : null;
      const r = isB2c
        ? await sendClassRenewalAlert(env, phone, {
            studentName: body.student_name || '회원',
            lastClassAt,
            paymentUrl: body.payment_url || renewLink?.url,
          })
        : await sendPaymentOverdueAlert(env, phone, {
            studentName: body.student_name || '학생',
            daysOverdue: parseInt(body.days_overdue, 10) || 0,
            amountKrw: parseInt(body.amount_krw, 10) || 0,
            paymentUrl: body.payment_url,
          });
      // 발송 이력 기록
      await env.DB.prepare(
        `INSERT INTO payment_overdue_log (user_id, student_name, days_overdue, amount_krw, parent_phone, status, error_message, sent_at, channel, last_class_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        body.user_id || null,
        body.student_name || null,
        parseInt(body.days_overdue, 10) || 0,
        isB2c ? 0 : (parseInt(body.amount_krw, 10) || 0),   // 미연장은 청구액이 없다
        phone,
        r.ok ? 'sent' : 'failed',
        r.ok ? null : (r.message || r.error || '실패'),
        Date.now(),
        channel,
        lastClassAt
      ).run();
      // 🆕 Web Push 도 함께 — 문자와 같은 말을 해야 한다
      let pushResult: any = { skipped: true };
      if (body.user_id) {
        const fee = parseInt(body.amount_krw, 10) || 200000;
        pushResult = isB2c
          ? await sendPushToUser(env,
              body.user_id,
              `🔁 ${body.student_name || '회원'}님 수강 연장 안내`,
              buildClassRenewalText(body.student_name || '회원', lastClassAt, null).replace('[망고아이] ', ''),
              body.payment_url || '/?go=payment',
              `renewal-${body.user_id}`
            )
          : await sendPushToUser(env,
              body.user_id,
              `💸 ${body.student_name || '학생'}님 수강료 안내`,
              `미납 ${body.days_overdue}일 / ${fee.toLocaleString('ko-KR')}원. 결제 부탁드립니다.`,
              body.payment_url || '/?go=payment',
              `overdue-${body.user_id}`
            );
      }
      return json({ ...r, channel, term_label: isB2c ? '미연장' : '미납', last_class_at: lastClassAt,
                    renew_link: renewLink ? { expires_at: renewLink.expires_at } : null,  // 🔒 토큰 원문은 안 돌려준다
                    push: pushResult });
    }

    /* ── POST /api/admin/payments/notify-all-overdue — 미납 전체 일괄 ──
         body: { user_ids?: ["uid1",...], grace_days?, default_fee?, dry_run?, confirm_send_over? }

       🚨 (2026-08-17) 이 자리는 **눌리면 되돌릴 수 없는 버튼**이다. 실제 학부모에게 돈 얘기
          문자가 나간다. 확인해 보니 지금 조건이 위험해서 세 가지를 막았다.

       ① «결제 이력이 없음» 을 «미납» 으로 보지 않는다  ← 가장 중요
          원래는 last_paid_at 이 비면 미납으로 치고 daysOverdue=999 로 보냈다.
          그런데 운영 자료가 이렇다(2026-08-17 실측):
            활동 학생 28,672명 · student_payments 에 결제 이력이 있는 학생 1,345명
          나머지 약 27,300명은 «안 낸 사람» 이 아니라 **결제가 이 표에 안 들어오는 사람**
          이다(카페24·대리점 수납). 그들에게 「999일 미납」 문자를 보내면 안 된다.
          지금 사고가 안 난 유일한 이유는 전화번호가 비어 있어서다 —
          students_erp 29,398행 중 parent_phone 3개 · phone 9개.
          **누군가 카페24에서 번호를 채워 넣는 순간 이 버튼은 2만 7천 명짜리 오발송이 된다.**
          그래서 «이력이 없으면 보내지 않고 건너뛴다»(reason: no_payment_record).

       ② dry_run — 기본이 «미리보기» 다.
          실제로 보내려면 dry_run:false 를 **명시**해야 한다. 누가 실수로 눌러도
          누구에게 무슨 문구가 갈지 목록만 돌려주고 끝난다.

       ③ 인원 상한 — 한 번에 CAP 명을 넘으면 보내지 않고 막는다.
          정말 그만큼 보내려면 confirm_send_over 에 그 수를 적어야 한다.
          «전체 일괄» 이 조용히 수천 건이 되는 것을 막는 마지막 빗장이다.

       ④ (2026-08-18) B2C 는 «미납» 이 아니라 «미연장» 이다 — 문구가 갈린다.
          B2C 는 선불이라 받을 돈이 없다. sendClassRenewalAlert 로 「수업이 O월 O일자로
          종료되었습니다 / 연장을 원하시면 결제 부탁드립니다」만 보낸다(발신 1644-0561).
          B2B 만 종전의 미납 독촉(금액·미납일수)이 나간다.

       ⑤ (2026-08-18) 수업 종료 후 1개월(renew_days, 기본 30일)이 지난 학생은 대상에서 뺀다.
          연장 가능성이 낮은 사람에게 계속 결제 문자를 보내지 않기 위함이다.
          건너뛴 사유는 no_renewal_window 로 남는다.

       ⚠️ B2B 문구는 solapi 템플릿(SOLAPI_TEMPLATE_PAYMENT_OVERDUE)이 정본이다. 여기서 안 만든다.
       ⚠️ 이 경로는 지사·대리점에게 열려 있지 않다(index.ts isAgencyAllowedApi 에 없음).
          여는 것은 공동 금지구역 수정이라 사람이 결정할 일이다. */
    if (method === 'POST' && path === '/api/admin/payments/notify-all-overdue') {
      await ensurePaymentTables();
      const body: any = await request.json().catch(() => ({}));
      const graceDays = Math.max(1, parseInt(body.grace_days, 10) || 35);
      const defaultFee = Math.max(0, parseInt(body.default_fee, 10) || 200000);
      const renewWindowDays = Math.max(1, parseInt(body.renew_days, 10) || DEFAULT_RENEW_WINDOW_DAYS);
      // 기본이 미리보기 — «보낸다» 고 적어야만 보낸다
      const dryRun = body.dry_run !== false;
      const SEND_CAP = 50;
      const onlyUids: string[] | null = Array.isArray(body.user_ids) && body.user_ids.length > 0 ? body.user_ids : null;
      const now = Date.now();
      const cutoff = now - graceDays * 86400 * 1000;
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, username TEXT, name TEXT, phone TEXT, parent_phone TEXT, status TEXT);`); } catch {}
      const _sw = await studentScopeWhere(env, request, 's');  // 🔒 지사/대리점 격리 (본사 전체 발송 방지)
      /* 🪤 (2026-08-18) 여기 «s.name» 이라고 적혀 있었다. students_erp 에 name 칸은 없다.
            그래서 이 쿼리는 항상 예외 → .catch 가 빈 배열로 삼켜서, 「전체 일괄」이 조용히
            0명이었다. 스캔 화면(GET /overdue)이 쓰는 것과 같은 COALESCE 로 맞춘다.
            전화번호 칸도 마찬가지다 — 원부의 칸 이름은 student_phone·phone 둘 다 있다. */
      const rs = await env.DB.prepare(
        `SELECT s.user_id,
                COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS student_name,
                s.parent_phone, COALESCE(s.student_phone, s.phone) AS student_phone,
                s.shop_name, s.payment_type, s.end_date,
                (SELECT MAX(paid_at) FROM student_payments WHERE user_id = s.user_id AND status='paid') AS last_paid_at,
                (SELECT amount_krw FROM student_payments WHERE user_id = s.user_id AND status='paid' ORDER BY paid_at DESC LIMIT 1) AS last_amount
           FROM students_erp s
          WHERE (s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')${_sw.cond ? ' AND ' + _sw.cond : ''}`
      ).bind(..._sw.binds).all().catch(() => ({ results: [] } as any));
      const b2cNamesBulk = await loadB2cCenterNames();
      const results: any[] = [];
      let sent = 0, failed = 0, skipped = 0;
      // ① 먼저 «누구에게 갈지» 를 전부 확정한다. 세어 보기 전에는 한 통도 안 보낸다.
      const targets: any[] = [];
      for (const r of (rs.results || [])) {
        const row: any = r;
        if (onlyUids && !onlyUids.includes(row.user_id)) continue;
        /* ⛔ 결제 이력이 아예 없으면 «미납» 이 아니라 «모름» 이다 — 보내지 않는다.
              카페24·대리점 수납은 이 표에 안 들어온다. 여기를 !last_paid_at → 미납 으로
              되돌리면 2만 7천 명에게 「999일 미납」 문자가 나간다(위 주석 ① 참고). */
        if (!row.last_paid_at) {
          skipped++; results.push({ user_id: row.user_id, status: 'skipped', reason: 'no_payment_record' });
          continue;
        }
        if (row.last_paid_at >= cutoff) continue;   // 유예 안이면 미납·미연장 아님
        const phone = row.parent_phone || row.student_phone;
        if (!phone) { skipped++; results.push({ user_id: row.user_id, status: 'skipped', reason: 'no_phone' }); continue; }
        const daysOverdue = Math.floor((now - row.last_paid_at) / (86400 * 1000)) - graceDays;
        const isB2c = isB2cStudent(row, b2cNamesBulk);
        const lastClassAt = resolveLastClassAt(row.last_paid_at, row.end_date);
        const lapseDays = Math.floor((now - lastClassAt) / (86400 * 1000));
        /* ⛔ 수업 끝난 지 한 달이 넘었으면 보내지 않는다(위 주석 ⑤). 연장 가능성이 낮다. */
        if (lapseDays > renewWindowDays) {
          skipped++; results.push({ user_id: row.user_id, status: 'skipped', reason: 'no_renewal_window', lapse_days: lapseDays });
          continue;
        }
        targets.push({
          row, phone, daysOverdue,
          amount: isB2c ? 0 : (row.last_amount || defaultFee),   // 미연장은 청구액이 없다
          isB2c, channel: isB2c ? 'B2C' : 'B2B',
          termLabel: isB2c ? '미연장' : '미납',
          lastClassAt, lapseDays,
        });
      }

      // ③ 상한 — 정말 이만큼 보낼 것인지 사람이 그 수를 적어 확인해야 한다
      if (!dryRun && targets.length > SEND_CAP && Number(body.confirm_send_over) !== targets.length) {
        return json({
          ok: false, error: 'too_many_recipients',
          message: `${targets.length}명에게 발송하려고 합니다. 정말 보내려면 confirm_send_over 에 ${targets.length} 을 넣어 다시 요청하세요.`,
          message_en: `About to message ${targets.length} people. Pass confirm_send_over=${targets.length} to proceed.`,
          would_send: targets.length, cap: SEND_CAP,
          preview: targets.slice(0, 20).map(t => ({ user_id: t.row.user_id, student_name: t.row.student_name, channel: t.channel, term_label: t.termLabel, days_overdue: t.daysOverdue, amount_krw: t.amount })),
        }, 409);
      }

      // ② 미리보기가 기본 — 누구에게 무엇이 갈지만 돌려준다
      if (dryRun) {
        return json({
          ok: true, dry_run: true,
          summary: { would_send: targets.length, skipped, sent: 0, failed: 0 },
          skipped_reasons: results.reduce((m: any, x: any) => { m[x.reason] = (m[x.reason] || 0) + 1; return m; }, {}),
          note: '미리보기입니다. 실제로 보내려면 dry_run:false 를 넣어 다시 요청하세요.',
          note_en: 'Preview only. Pass dry_run:false to actually send.',
          by_channel: {
            B2C: targets.filter(t => t.isB2c).length,   // 미연장 안내
            B2B: targets.filter(t => !t.isB2c).length,  // 미납 독촉
          },
          would_send_to: targets.map(t => ({ user_id: t.row.user_id, student_name: t.row.student_name,
                                             channel: t.channel, term_label: t.termLabel,
                                             days_overdue: t.daysOverdue, amount_krw: t.amount,
                                             last_class_at: t.lastClassAt,
                                             // 실제로 나갈 문장 그대로(문구는 solapi-client 가 정본)
                                             /* 미리보기에서는 토큰을 발급하지 않는다 — 보내지도 않을 링크를
                                                미리 만들면 옛 링크가 그때마다 죽는다. 실제 발송 때
                                                학생마다 다른 1회용 주소가 들어간다. */
                                             text: t.isB2c ? buildClassRenewalText(t.row.student_name || '회원', t.lastClassAt) : null })),
        });
      }

      for (const t of targets) {
        const row = t.row, phone = t.phone, daysOverdue = t.daysOverdue, amount = t.amount;
        const link2 = t.isB2c ? await issueRenewLink(env, row.user_id) : null;
        const r2 = t.isB2c
          ? await sendClassRenewalAlert(env, phone, {
              studentName: row.student_name || '회원',
              lastClassAt: t.lastClassAt,
              paymentUrl: link2?.url,
            })
          : await sendPaymentOverdueAlert(env, phone, {
              studentName: row.student_name || '학생',
              daysOverdue, amountKrw: amount,
            });
        if (r2.ok) sent++; else failed++;
        await env.DB.prepare(
          `INSERT INTO payment_overdue_log (user_id, student_name, days_overdue, amount_krw, parent_phone, status, error_message, sent_at, channel, last_class_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          row.user_id, row.student_name, daysOverdue, amount, phone,
          r2.ok ? 'sent' : 'failed',
          r2.ok ? null : (r2.message || r2.error || '실패'),
          Date.now(), t.channel, t.lastClassAt
        ).run();
        results.push({ user_id: row.user_id, student_name: row.student_name, phone,
                       channel: t.channel, term_label: t.termLabel, days_overdue: daysOverdue, ...r2 });
      }
      return json({
        ok: true,
        summary: { sent, failed, skipped, total: results.length },
        skipped_reasons: results.filter((x: any) => x.status === 'skipped')
          .reduce((m: any, x: any) => { m[x.reason] = (m[x.reason] || 0) + 1; return m; }, {}),
        from_phone: CLASS_RENEWAL_FROM_PHONE,
        results,
      });
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
      // 🎯 게임 학습기록 (피드백 루프 연결): 정오답 합계 + 취약 단어 상위 5 + 게임 내 발음 평균
      const gameAgg: any = await fetch1(
        `SELECT SUM(correct_count) AS c, SUM(wrong_count) AS w,
                AVG(CASE WHEN pron_count > 0 THEN pron_last END) AS p
           FROM game_progress WHERE user_id = ? AND last_seen >= ?`, uid, since);
      const gameWeak = await fetchAll(
        `SELECT item, ko, wrong_count FROM game_progress
          WHERE user_id = ? AND wrong_count > 0 AND wrong_count >= correct_count
          ORDER BY wrong_count DESC LIMIT 5`, uid);
      // 🎤 스피치코치 발음/정확도/유창성 평균 (최근 10회)
      const coachAgg: any = await fetch1(
        `SELECT COUNT(*) AS n, AVG(pronunciation_score) AS p, AVG(accuracy_score) AS a, AVG(fluency_score) AS f FROM (
           SELECT pronunciation_score, accuracy_score, fluency_score FROM voice_coaching
           WHERE student_uid = ? ORDER BY created_at DESC LIMIT 10)`, uid);

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

[학습 게임 기록 (최근 60일)]
- 문제 풀이: 정답 ${gameAgg?.c || 0} / 오답 ${gameAgg?.w || 0}${(Number(gameAgg?.c || 0) + Number(gameAgg?.w || 0)) > 0 ? ` (정답률 ${Math.round(Number(gameAgg.c || 0) / (Number(gameAgg.c || 0) + Number(gameAgg.w || 0)) * 100)}%)` : ''}
- 게임 내 발음 점수 평균: ${gameAgg?.p != null ? Math.round(Number(gameAgg.p)) + '/100' : '-'}
- 자주 틀리는 단어: ${gameWeak.length ? gameWeak.map((g: any) => `${g.item}${g.ko ? `(${g.ko})` : ''} ${g.wrong_count}회` ).join(', ') : '(없음)'}

[스피치코치 발음 연습 (최근 10회)]
${Number(coachAgg?.n || 0) > 0 ? `- 연습 ${coachAgg.n}회 · 발음 ${coachAgg.p != null ? Math.round(Number(coachAgg.p)) : '-'}/100 · 정확도 ${coachAgg.a != null ? Math.round(Number(coachAgg.a)) : '-'}/100 · 유창성 ${coachAgg.f != null ? Math.round(Number(coachAgg.f)) : '-'}/100` : '(연습 기록 없음)'}

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
          game_correct: gameAgg?.c || 0,
          game_wrong: gameAgg?.w || 0,
          voice_coach_count: coachAgg?.n || 0,
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
      /* 🙂 (2026-08-18 사장님 수정요청 #02 후속) 강사 «성향».
         신규 학생 등록 마법사가 «원하는 선생님 성향»(상냥한·재미있는·교육적인·진지한·웃음많은)을
         물어보게 됐는데, 정작 **강사 쪽에 성향 자료가 없어서** 추천에 못 쓰고 메모로만 남았다.
         그 반쪽을 여기에 채운다 — 이미 매칭용으로 쓰는 표(teacher_mbti)에 칸 하나를 더 단다.
         ⚠️ CREATE 문에 넣지 않고 멱등 ALTER 로 붙인다 — schema_drift 하니스가
            «운영 실제에 없는 CREATE 컬럼» 을 막는다(payment_type 과 같은 방식). */
      try { await env.DB.exec(`ALTER TABLE teacher_mbti ADD COLUMN personality TEXT`); } catch {}
    };

    /* 🙂 성향 값 정본 — 화면(마법사·MBTI 카드)과 서버가 같은 다섯 개를 쓴다.
       모르는 값이 들어오면 조용히 버린다(오타로 «kindd» 가 저장되면 매칭에서 영영 안 걸린다). */
    const PERSONALITY_IDS = ['kind', 'fun', 'edu', 'serious', 'laugh'];
    const normPersonality = (v: any): string | null => {
      const raw = Array.isArray(v) ? v : String(v ?? '').split(/[,\s]+/);
      const out: string[] = [];
      for (const x of raw) {
        const k = String(x || '').trim().toLowerCase();
        if (PERSONALITY_IDS.includes(k) && !out.includes(k)) out.push(k);
      }
      return out.length ? out.join(',') : null;
    };

    // ── GET /api/teachers/mbti-list — 강사 MBTI 목록 (공개) ──
    if (method === 'GET' && path === '/api/teachers/mbti-list') {
      await ensureMbtiTable();
      const rs = await env.DB.prepare(`SELECT teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, personality FROM teacher_mbti ORDER BY teacher_name`).all();
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
      const pers = normPersonality(b.personality);
      await env.DB.prepare(
        `INSERT INTO teacher_mbti (teacher_uid, teacher_name, mbti, hobby, teaching_style, intro, photo_url, personality, updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(teacher_uid) DO UPDATE SET teacher_name = excluded.teacher_name, mbti = excluded.mbti, hobby = excluded.hobby, teaching_style = excluded.teaching_style, intro = excluded.intro, photo_url = excluded.photo_url, personality = excluded.personality, updated_at = excluded.updated_at`
      ).bind(uid, b.teacher_name || null, String(b.mbti || '').toUpperCase().slice(0,4), b.hobby || null, b.teaching_style || null, b.intro || null, photoUrl, pers, now).run();
      return json({ ok: true, teacher_uid: uid, personality: pers });
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
        //    → 청크 분할은 공용 selectInChunks(src/d1-chunk.ts)로 일원화(2026-08-07).
        //      청크 크기는 tail 바인드 개수를 세서 정하므로 매직넘버 90이 필요 없습니다.
        const _groupMap = async (build: (ph: string) => string, tail: any[], keyCol: string, pick: (r: any) => any): Promise<Map<string, any>> => {
          const m = new Map<string, any>();
          // 테이블이 없을 수 있는 선택적 집계 → 청크 오류는 스킵(원본 try/catch 동작과 동일)
          const rows = await selectInChunks<any>(env.DB, _ids, build, { tail, swallowErrors: true });
          for (const r of rows) m.set(String(r[keyCol]), pick(r));
          return m;
        };
        try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`); } catch {}

        const [att30M, att60M, att90M, lastJoinM, evalM, payM, hwM, ptM, _trendRows, absentStreakM] = await Promise.all([
          _groupMap(ph => `SELECT user_id, COUNT(DISTINCT date) d FROM attendance WHERE user_id IN (${ph}) AND joined_at >= ? GROUP BY user_id`, [since30], 'user_id', r => _num(r.d)),
          _groupMap(ph => `SELECT user_id, COUNT(DISTINCT date) d FROM attendance WHERE user_id IN (${ph}) AND joined_at >= ? AND joined_at < ? GROUP BY user_id`, [since60, since30], 'user_id', r => _num(r.d)),
          _groupMap(ph => `SELECT user_id, COUNT(DISTINCT date) d FROM attendance WHERE user_id IN (${ph}) AND joined_at >= ? AND joined_at < ? GROUP BY user_id`, [since90, since60], 'user_id', r => _num(r.d)),
          _groupMap(ph => `SELECT user_id, MAX(joined_at) j FROM attendance WHERE user_id IN (${ph}) GROUP BY user_id`, [], 'user_id', r => _num(r.j)),
          _groupMap(ph => `SELECT student_uid, AVG(score_overall) a, COUNT(*) n FROM student_evaluations WHERE student_uid IN (${ph}) AND created_at >= ? GROUP BY student_uid`, [since60], 'student_uid', r => ({ a: _num(r.a), n: _num(r.n) })),
          _groupMap(ph => `SELECT user_id, MIN(due_at) earliest_due, SUM(amount) total FROM payments WHERE user_id IN (${ph}) AND (paid_at IS NULL OR paid_at = 0) AND due_at < ? GROUP BY user_id`, [now], 'user_id', r => ({ earliest_due: _num(r.earliest_due), total: _num(r.total) })),
          _groupMap(ph => `SELECT user_id, COUNT(*) n FROM homework_submissions WHERE user_id IN (${ph}) AND status = 'missed' AND created_at >= ? GROUP BY user_id`, [since30], 'user_id', r => _num(r.n)),
          _groupMap(ph => `SELECT user_id, COUNT(*) n FROM point_log WHERE user_id IN (${ph}) AND created_at >= ? GROUP BY user_id`, [since14], 'user_id', r => _num(r.n)),
          // ROW_NUMBER 의 PARTITION 키가 IN 목록과 같은 student_uid → 청크로 나눠도 순위는 동일
          selectInChunks<any>(env.DB, _ids,
            (ph) => `SELECT student_uid, score_overall, rn FROM (SELECT student_uid, score_overall, ROW_NUMBER() OVER (PARTITION BY student_uid ORDER BY created_at DESC) rn FROM student_evaluations WHERE student_uid IN (${ph})) WHERE rn <= 6`,
            { swallowErrors: true }),
          /* 🚷 (2026-08-30 v4 제안서 17) 연속 결석 횟수 — 「3회 이상이면 위험도를 심각으로 올려 달라」.
             ⚠️ 「최근 30일 출석 0」(S2)과는 **다른 사실**이다. 수업이 원래 드문 학생은 S2 만으로는
                안 걸리고, 반대로 방학처럼 수업 자체가 없던 기간은 «연속 결석» 이 아니다.
             🧮 판정은 「장기 결석생」 화면(/api/admin/attendance/long-absent)과 **같은 식**이다 —
                최신 수업일부터 거꾸로 세다가 출석(present)을 만나면 멈춘다. 두 화면이 다른 숫자를
                말하면 그 자체가 사고이므로 식을 복제하지 말고 같은 모양을 유지할 것.
             ⚠️ 미래 예약(status='scheduled', joined_at 이 2030년까지 있다)을 결석으로 세지 않도록
                date <= 오늘(KST) 로 자른다. */
          _groupMap(
            (ph) => `WITH ranked AS (
                       SELECT user_id, date, status,
                              ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date DESC, id DESC) AS rn
                         FROM attendance
                        WHERE COALESCE(role,'student') = 'student' AND user_id IN (${ph})
                          AND date IS NOT NULL AND date <= ?
                     )
                     SELECT user_id,
                            COALESCE(MIN(CASE WHEN status = 'present' THEN rn END) - 1, MAX(rn)) AS streak
                       FROM ranked GROUP BY user_id`,
            [today()], 'user_id', r => _num(r.streak)),
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
          const absentStreak = absentStreakM.get(s.user_id) || 0;   // 🚷 연속 결석 (v4 제안서 17)

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

          /* S11: 🚷 연속 결석 (2026-08-30 v4 제안서 17)
             「연속 3회 이상이면 이탈 위험도를 HIGH(심각)로 자동 승격」이 지시다.
             ⚠️ 점수만 올리면 승격이 «가끔» 된다 — 다른 신호가 없는 학생은 합계가 70에 못 미친다.
                그래서 점수와 **별개로** 등급을 못 박는다(아래 forcedHigh).
             ⚠️ 그래도 점수는 함께 올린다 — 목록이 위험도 내림차순 정렬이라, 점수를 안 올리면
                «심각» 인데 목록 아래쪽에 묻힌다. */
          const forcedHigh = absentStreak >= 3;
          if (absentStreak >= 5)      { risk += 40; reasons.push(`🚷 연속 결석 ${absentStreak}회`); signals.absentStreak = 'critical'; }
          else if (forcedHigh)        { risk += 30; reasons.push(`🚷 연속 결석 ${absentStreak}회`); signals.absentStreak = 'high'; }
          else if (absentStreak === 2) { risk += 10; reasons.push('🚷 연속 결석 2회'); signals.absentStreak = 'watch'; }

          if (risk >= 25 || forcedHigh) {
            const riskLevel = (forcedHigh || risk >= 70) ? 'high' : risk >= 50 ? 'medium' : 'low';
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
              absent_streak: absentStreak,                 // 🚷 연속 결석 (v4 제안서 17)
              promoted_by_absence: forcedHigh,             // «점수가 아니라 결석 때문에 심각» 임을 화면이 말할 수 있게
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
    /* 📵 로그·화면에 전화번호를 통째로 남기지 않는다 — 케어 기록은 관리자 여럿이 본다. */
    const maskPhoneForLog = (v: any) => {
      const d = String(v || '').replace(/[^0-9]/g, '');
      if (!d) return '';
      return d.length <= 4 ? d : d.slice(0, d.length - 4).replace(/\d/g, '*') + d.slice(-4);
    };
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
        let parentPhone = '', studentPhone = '', studentName = uid;
        try {
          const cols: any = await env.DB.prepare(`PRAGMA table_info(students_erp)`).all();
          const colNames = ((cols.results || []) as any[]).map(c => c.name);
          const nCol = colNames.includes('student_name') ? 'student_name' : (colNames.includes('korean_name') ? 'korean_name' : (colNames.includes('name') ? 'name' : 'user_id'));
          const pPhoneCol = colNames.includes('parent_phone') ? 'parent_phone' : `''`;
          // 학부모 번호가 없을 때 학생 번호로 떨어질 수 있게 함께 읽는다 — 없는 번호로 «보냈다» 고 하면 안 된다
          const sPhoneCol = colNames.includes('student_phone') ? 'student_phone' : (colNames.includes('phone') ? 'phone' : `''`);
          const s: any = await env.DB.prepare(`SELECT ${nCol} AS sn, ${pPhoneCol} AS pp, ${sPhoneCol} AS sp FROM students_erp WHERE user_id = ?`).bind(uid).first();
          if (s) { studentName = s.sn || uid; parentPhone = s.pp || ''; studentPhone = s.sp || ''; }
        } catch {}

        /* 📮 액션 분기 — 2026-08-30 수리: 카톡·문자가 **실제로 나가게** 했다.
           [무엇이 틀렸었나] 예전에는 둘 다 로그 한 줄만 남기고 status='queued' 로 응답했고,
           화면은 `if (!d.ok) throw` 만 보고 «✅ 발송됨» 을 띄웠다. 그런데 그 큐를 읽어
           보내는 코드는 저장소에 없다 — 즉 아무 데도 안 가는데 화면은 보냈다고 말하고 있었다
           (CLAUDE.md 「그럴듯한 거짓말」·「시연 껍데기」와 같은 종류).
           이제 solapi 로 실제로 보내고, 못 보내면 **못 보냈다고** 말한다.
           ⚠️ 자유 문구는 **알림톡으로 못 보낸다** — 알림톡은 사전 승인 템플릿만 나간다.
              그래서 [카톡] 버튼도 문자(LMS)로 보내고, 그 사실을 detail 에 적는다.
           ℹ️ 「장기 결석생」 화면의 퀵케어는 이 경로가 아니라 sms:·tel: 링크라 손대지 않았다
              (그쪽은 폰의 문자앱을 열어 줄 뿐이라 «보냈다» 고 말하지 않는다). */
        const _careTo = parentPhone || studentPhone || '';
        if (actionType === 'kakao' || actionType === 'sms') {
          if (!message) { status = 'failed'; detail = '보낼 내용이 비어 있습니다.'; }
          else if (!_careTo) {
            status = 'failed';
            detail = '보낼 번호가 없습니다 — 학부모·학생 연락처가 모두 비어 있습니다.';
          } else {
            const r = await sendPlainSms(env as any, _careTo, message, { subject: '망고아이 안내' });
            if (r.ok) {
              status = (r.mode === 'mock') ? 'mock' : 'sent';
              detail = (actionType === 'kakao'
                ? '카톡 자유문구는 알림톡으로 못 보내 문자(LMS)로 보냈습니다 → '
                : '문자 발송 → ') + maskPhoneForLog(_careTo)
                + (r.mode === 'mock' ? ' [테스트 모드 — 실제로는 안 나갔습니다]' : '');
            } else {
              status = 'failed';
              detail = '발송 실패: ' + (r.message || r.error || 'unknown') + ' (' + r.mode + ')';
            }
          }
        }
        /* 📞 전화 — «보내는» 것이 아니라 «사람이 한 일» 을 적는 것이다.
           그래서 status 를 sent 로 쓰지 않는다. 통화 내용은 message 로 함께 남긴다. */
        else if (actionType === 'call') {
          status = 'logged';
          detail = '📞 통화 기록: ' + (maskPhoneForLog(_careTo) || '번호 없음')
                 + (message ? ' — ' + message.slice(0, 120) : '');
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
        /* 🎪 이벤트 초대 — 기록만 남는다. 이 저장소에 이 큐를 읽어 보내는 코드는 없다.
           그래서 status 를 sent 로 두지 않는다(그게 카톡·문자가 오래 하던 거짓말이었다). */
        else if (actionType === 'event') {
          status = 'queued';
          detail = `이벤트 초대 기록: ${eventId} — 안내는 아직 자동으로 나가지 않습니다(문자 버튼으로 따로 보내 주세요).`;
        }
        else if (actionType === 'comeback_bundle') {
          // 컴백 번들: 카톡 + 기프트(500P) + 무료 보강 1회
          try {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER);`);
            await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, last_earned_at, updated_at) VALUES (?, ?, 500, 500, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + 500, lifetime_earned = lifetime_earned + 500, last_earned_at = ?, updated_at = ?`)
              .bind(uid, studentName, now, now, now, now).run();
            /* ⚠️ 실제로 일어난 일만 적는다 — 이 갈래는 포인트만 적립한다.
               카톡 안내도, 보강 예약도 여기서 하지 않는다(보내는 코드가 없다).
               ⛔ 여기에 문자 발송을 붙이지 말 것 — 이 액션에는 «일괄» 버튼이 있어
                  그 순간 학부모 전원 대량 발송이 된다. 안내는 [문자] 로 한 명씩. */
            status = 'sent';
            detail = '🎁 컴백 보너스 500P 적립 완료 — 안내 문자와 보강 배정은 따로 해 주세요.';
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
      // ⚡ KV 캐시(120초) — Neo4j(카페24 8880) 외부 홉을 반복 열람마다 왕복하지 않도록. 원본은 야간 cron 동기화라 분단위 신선도면 충분. 조직 공용 명부라 scope 무관(q만).
      const _glKeyT = 'gl:teachers:' + qT;
      { const _hit = await admCacheHit(env, _glKeyT); if (_hit) return _hit; }
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
        return admCachePut(env, _glKeyT, { ok: true, source: 'neo4j', count: teachers.length, teachers });
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
        // ⚡ KV 캐시(120초) — 카페24 Neo4j(8880) 외부 홉 절감. 회계 원본은 야간 cron 동기화라 분단위 신선도 충분. 본사 전용(권한게이트 뒤)이라 조직공용 키.
        const _finKey = 'fin:' + kind + ':' + month + ':' + lim;
        { const _hit = await admCacheHit(env, _finKey); if (_hit) return _hit; }
        // 월별 손익 집계 (AccBookType 1=수입, 2=지출) — 최근 24개월
        if (kind === 'summary') {
          /* 🧾 매출 인식 범위 (2026-08-18 — 수정사항 5번 블럭 사장님 지시)
             income = 「케이씨피」 결제분만. 「케이씨피M」(하나은행 → 신한 운영자금 이체)은
             같은 「케이씨피」로 시작하지만 매출이 아니므로 `isKcp AND NOT isKcpm` 으로 짝지어 뺀다.
             ⚠️ 그래서 거래처·적요·계정과목 어디에도 「케이씨피」가 없는 수입 행은 매출에서 빠진다 —
                총매출이 예전(수입 전부 − 케이씨피M)보다 줄어 보이는 것은 이 정책의 결과다.
             ⚠️ expense 는 지시 대상이 아니므로 예전 그대로(지출 전부 − 케이씨피M)다. */
          try {
            const { fields, values } = await runCypher(env, `
              MATCH (a:AccBook) WHERE a.date IS NOT NULL AND a.date <> ''
              WITH substring(a.date,0,7) AS ym, a.type AS t, a.money AS money,
                   (coalesce(a.store,'')   =~ $kcpmRe
                 OR coalesce(a.memo,'')    =~ $kcpmRe
                 OR coalesce(a.subject,'') =~ $kcpmRe) AS isKcpm,
                   (coalesce(a.store,'')   =~ $kcpRe
                 OR coalesce(a.memo,'')    =~ $kcpRe
                 OR coalesce(a.subject,'') =~ $kcpRe) AS isKcp
              WHERE ym >= '2019-01'
              RETURN ym,
                     sum(CASE WHEN t = 1 AND isKcp AND NOT isKcpm THEN money ELSE 0 END) AS income,
                     sum(CASE WHEN t = 2 AND NOT isKcpm THEN money ELSE 0 END) AS expense
              ORDER BY ym DESC LIMIT 36`, { kcpmRe: KCP_TRANSFER_CYPHER_RE, kcpRe: KCP_REVENUE_CYPHER_RE }, 'READ');
            const rows = values.map(row => {
              const o: any = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
              o.net = (Number(o.income) || 0) - (Number(o.expense) || 0);
              return o;
            });
            const totals = rows.reduce((a: any, r: any) => ({
              income: a.income + (Number(r.income) || 0),
              expense: a.expense + (Number(r.expense) || 0),
            }), { income: 0, expense: 0 });
            /* 🧾 ⛔ 「케이씨피M」의 이름·사유·금액을 응답에 담지 않는다 (2026-08-18 사장님 지시).
             *   예전에는 «왜 숫자가 줄었나» 를 설명하려고 excluded: { rule:'케이씨피M', reason, amount, count }
             *   와 월별 excluded_transfer/excluded_count 를 함께 내려줬다. 화면은 그리지 않았지만
             *   API 주소를 열면 그 이름과 금액이 그대로 보였다(사장님이 직접 확인).
             *   「제외했습니다」라고 적어 주는 것 자체가 「아직 남아 있다」로 읽힌다는 것이 지시의 요지다.
             *   ⚠️ 매출·지출에서 빼는 계산(위 Cypher 의 isKcpm + NOT isKcpm)은 그대로다 — 그건 정확성 문제다.
             *   ⚠️ 이 값으로 화면 줄을 다시 만들지 말 것. 되살리려면 사람에게 먼저 물을 것
             *      (회귀 감시: test-harness/c24_finance_kcpm_harness.mjs ③). */
            return admCachePut(env, _finKey, {
              ok: true, source: 'neo4j', kind: 'summary', months: rows,
              totals: { ...totals, net: totals.income - totals.expense },
            });
          } catch (e: any) {
            if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
            return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
          }
        }
        const QMAP: Record<string, string> = {
          /* 🧾 「케이씨피M」(하나은행 → 신한 운영자금 이체) 행은 **목록에서 아예 뺀다**
             (2026-08-18 사장님 지시). 매출·손익 집계에서 빼는 것으로는 부족하고,
             그 이름·금액이 화면에 남아 있는 것 자체를 원치 않으신다.
             ⚠️ 그래서 이 목록은 «카페24 원본 그대로» 가 아니다 — 자금이체 행이 빠진 장부다.
                원본 대조가 필요하면 카페24에서 봐야 한다.
             excluded_from_revenue 는 계속 내려보낸다(항상 false 가 된다). 화면·하니스가
             그 값으로 합계에서 빼는 안전망을 유지하고 있어, 이 WHERE 가 언젠가 느슨해져도
             숫자는 틀어지지 않는다. */
          ledger: `MATCH (a:AccBook) WHERE NOT (coalesce(a.store,'') =~ $kcpmRe OR coalesce(a.memo,'') =~ $kcpmRe OR coalesce(a.subject,'') =~ $kcpmRe)${month ? ` AND (a.month = $month OR a.date STARTS WITH $month)` : ''} RETURN a.date AS date, a.type AS type, a.acc_type AS acc_type, a.subject AS subject, a.money AS money, a.store AS store, a.memo AS memo, a.month AS month, (coalesce(a.store,'') =~ $kcpmRe OR coalesce(a.memo,'') =~ $kcpmRe OR coalesce(a.subject,'') =~ $kcpmRe) AS excluded_from_revenue, ((coalesce(a.store,'') =~ $kcpRe OR coalesce(a.memo,'') =~ $kcpRe OR coalesce(a.subject,'') =~ $kcpRe) AND NOT (coalesce(a.store,'') =~ $kcpmRe OR coalesce(a.memo,'') =~ $kcpmRe OR coalesce(a.subject,'') =~ $kcpmRe)) AS counts_as_revenue ORDER BY a.date DESC LIMIT $lim`,
          payroll: `MATCH (p:Payroll) ${month ? `WHERE p.month = $month` : ''} RETURN p.user_id AS user_id, p.month AS month, p.base AS base, p.total AS total, p.deduction AS deduction, p.actual AS actual, p.income_tax AS income_tax, p.pension AS pension, p.work_day AS work_day, p.pay_date AS pay_date ORDER BY p.month DESC LIMIT $lim`,
          /* 🧾 지출결의 — 카페24 `ExpenseReport` 에는 **망고아이와 무관한 다른 조직의 지출품의서가 함께 쌓인다.**
             그래서 우리 화면에서는 그 건을 뺀다(2026-08-24 사장님 지시). 판정 정본은 `src/c24-expense-filter.ts`.
             ⚠️ 아래 WHERE 는 «먼저 덜어내기»(전송량·8초 타임아웃 방어)일 뿐이고, **최종 판정은 TS** 가 한다
                (`c24ExpenseDrop`, 아래 rows 필터). 그래서 이 정규식이 언젠가 헛돌아도 결과는 안 틀린다.
             ⚠️ `properties(d) AS props` 를 함께 받는 이유: **결재라인이 어느 속성에 들어 있는지 카페24가 정한다.**
                우리가 이름을 모르므로 통째로 받아서 훑는다. 응답에 담기 전에 지운다(용량). */
          expenses: `MATCH (d:ExpenseReport)
            WHERE NOT ((CASE WHEN coalesce(d.name,'') =~ $c24LetterRe THEN coalesce(d.name,'') ELSE coalesce(d.content,'') END) =~ $c24HangulRe)
            RETURN d.name AS name, d.content AS content, d.pay_date AS pay_date, d.organ AS organ, d.method AS method, d.memo AS memo, d.state AS state, d.reg_date AS reg_date, d.doc_id AS doc_id, properties(d) AS props ORDER BY d.reg_date DESC LIMIT $lim`,
          tax: `MATCH (t:TaxInvoice) RETURN t.date AS date, t.supplier AS supplier, t.receiver AS receiver, t.supply AS supply, t.tax AS tax, t.total AS total, t.tax_type AS tax_type, t.state AS state ORDER BY t.date DESC LIMIT $lim`,
          deposits: `MATCH (s:SavedMoney) RETURN s.center_id AS center_id, s.amount AS amount, s.method AS method, s.date AS date, s.state AS state ORDER BY s.date DESC LIMIT $lim`,
        };
        const cy = QMAP[kind];
        if (!cy) return json({ ok: false, error: 'unknown finance kind' }, 400);
        try {
          /* 🧾 counts_as_revenue = 「케이씨피」이면서 「케이씨피M」이 아닌 행.
             장부 탭의 «매출» 합계가 위 summary(KPI·추이)와 **같은 규칙**을 쓰게 하려고 서버가
             판정해 내려준다. ⚠️ 한쪽만 바꾸면 같은 화면에서 「매출 ₩A」와 「총매출 ₩B」가
             서로 다르게 찍힌다 — 그 불일치를 잡으려고 만든 화면에서 그러면 안 된다. */
          /* 🧾 지출결의는 Cypher 가 «한글 제목» 을 이미 덜어냈지만, TS 가 한 번 더 판정하면서
             결재라인(「Joy」·「박상인」)까지 본다. 그만큼 줄어드니 조금 넉넉히 읽어 온다.
             ⚠️ Neo4j 호출은 8초 타임아웃이라 무작정 키우면 화면이 통째로 비어 버린다 — 20% 여유까지만. */
          const fetchLim = (kind === 'expenses') ? Math.min(2000, Math.ceil(lim * 1.2)) : lim;
          const { fields, values } = await runCypher(env, cy, { lim: fetchLim, month, kcpmRe: KCP_TRANSFER_CYPHER_RE, kcpRe: KCP_REVENUE_CYPHER_RE, c24HangulRe: C24_HANGUL_CYPHER_RE, c24LetterRe: C24_LETTER_CYPHER_RE }, 'READ');
          let rows = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
          let filteredOut = 0;
          let propKeys: string[] = [];
          if (kind === 'expenses') {
            /* 🧾 «우리 것이 아닌» 지출품의서를 뺀다 — 판정 정본 src/c24-expense-filter.ts.
               ⛔ 여기에 판정 규칙을 복사해 쓰지 말 것(같은 규칙이 두 벌이 되는 순간 어긋나기 시작한다).
               ℹ️ prop_keys 는 **속성 «이름» 만** 모은 것이다(값이 아니다). 결재라인이 실제로 어느 칸에
                  들어 있는지 사람이 한 번 확인하려고 남긴다 — 카페24가 정한 이름을 우리가 모르기 때문. */
            const seenKeys = new Set<string>();
            const kept: typeof rows = [];
            for (const r of rows) {
              const props = (r.props && typeof r.props === 'object') ? r.props as Record<string, unknown> : {};
              Object.keys(props).forEach(k => seenKeys.add(k));
              const verdict = c24ExpenseDrop({ ...props, name: r.name, content: r.content });
              delete (r as Record<string, unknown>).props;   // 화면이 안 쓰는 원본 뭉치는 응답에서 뺀다
              if (verdict.drop) { filteredOut++; continue; }
              kept.push(r);
            }
            rows = kept.slice(0, lim);
            propKeys = [...seenKeys].sort();
          }
          return admCachePut(env, _finKey, { ok: true, source: 'neo4j', kind, count: rows.length, rows,
            ...(kind === 'expenses' ? { filtered_out: filteredOut, prop_keys: propKeys } : {}) });
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
        // ⚡ KV 캐시(120초) — Neo4j 외부 홉 절감(야간 동기화 데이터).
        const _sstKey = 'selfscore:trend:' + lim;
        { const _hit = await admCacheHit(env, _sstKey); if (_hit) return _hit; }
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
          return admCachePut(env, _sstKey, { ok: true, source: 'neo4j', months, totals });
        } catch (e: any) {
          if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
          return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
        }
    }

    // 🏅 카페24 레벨테스트 배치 현황 (그래프DB) — 레벨별 분포·합격률 + 최근 응시
    //   GET /api/admin/leveltest/overview  → {ok, by_level:[{level,total,pass,pass_rate}], recent:[...], totals}
    if (method === 'GET' && path === '/api/admin/leveltest/overview') {
      // ⚡ KV 캐시(120초) — Neo4j 외부 홉 2회(agg+recent) 절감(야간 동기화 데이터).
      const _ltKey = 'leveltest:overview';
      { const _hit = await admCacheHit(env, _ltKey); if (_hit) return _hit; }
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
        return admCachePut(env, _ltKey, { ok: true, source: 'neo4j', by_level: byLevel, recent, totals: { ...totals, pass_rate: totals.total > 0 ? Math.round((totals.pass / totals.total) * 1000) / 10 : 0 } });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 🧑‍💼 카페24 직원 명부 (그래프DB) — 지사 직원
    if (method === 'GET' && path === '/api/admin/staff/graph-list') {
      const qS = (url.searchParams.get('q') || '').trim().toLowerCase();
      // ⚡ KV 캐시(120초) — 위 teachers/graph-list 와 동일 패턴(Neo4j 외부 홉 절감).
      const _glKeyS = 'gl:staff:' + qS;
      { const _hit = await admCacheHit(env, _glKeyS); if (_hit) return _hit; }
      try {
        const { fields, values } = await runCypher(env, `
          MATCH (s:Staff) WHERE s.name IS NOT NULL
            AND ($q = '' OR toLower(coalesce(s.name,'')) CONTAINS $q OR toLower(coalesce(s.nickname,'')) CONTAINS $q)
          RETURN s.staff_id AS staff_id, s.name AS name, s.nickname AS nickname, s.email AS email,
                 s.intro AS intro, s.status AS status, s.retire_date AS retire_date, s.franchise_id AS franchise_id
          ORDER BY s.status, s.name`, { q: qS }, 'READ');
        const staff = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return admCachePut(env, _glKeyS, { ok: true, source: 'neo4j', count: staff.length, staff });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 📚 카페24 교재 명부 (그래프DB)
    if (method === 'GET' && path === '/api/admin/books/graph-list') {
      const qB = (url.searchParams.get('q') || '').trim().toLowerCase();
      // ⚡ KV 캐시(120초) — 위 graph-list 들과 동일 패턴(Neo4j 외부 홉 절감).
      const _glKeyB = 'gl:books:' + qB;
      { const _hit = await admCacheHit(env, _glKeyB); if (_hit) return _hit; }
      try {
        const { fields, values } = await runCypher(env, `
          MATCH (b:Book) WHERE b.name IS NOT NULL
            AND ($q = '' OR toLower(coalesce(b.name,'')) CONTAINS $q)
          RETURN b.book_id AS book_id, b.name AS name, b.memo AS memo, b.status AS status, b.group_id AS group_id
          ORDER BY b.status, b.name`, { q: qB }, 'READ');
        const books = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return admCachePut(env, _glKeyB, { ok: true, source: 'neo4j', count: books.length, books });
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
      // ⚡ KV 캐시(120초) — Neo4j 외부 홉 절감. ⚠️ 학부모전화 등 PII 포함이므로 scope(type:value)를 키에 넣어 크로스테넌트 격리(retention/risk 캐시와 동일 원칙). q·limit 도 키에 포함.
      const _glKeyStu = 'gl:students:' + (_gScope.type || 'all') + ':' + (_gScope.value || '') + ':' + limitG + ':' + qG;
      { const _hit = await admCacheHit(env, _glKeyStu); if (_hit) return _hit; }
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
        return admCachePut(env, _glKeyStu, { ok: true, source: 'neo4j', count: students.length, students });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) {
          return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        }
        console.warn('[graph-list] Neo4j 조회 실패:', e?.message || e);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 💰 카페24 결제 이관 — Neo4j (:Payment 1.1만) → D1 student_payments (cafe24-sync.ts)
    // 🔎 (2026-07-19) 결제 미매칭 진단 — 특정 회원ID가 Neo4j 그래프에 어떤 노드/결제/관계로 존재하는지 원자료 확인.
    //   지사 대시보드 매출 미집계(결제자 user_id가 students_erp에 없음, 7월 기준 금액 79% 미매칭) 원인 추적용.
    //   /api/admin/* default-deny + 비본사 403 게이트 뒤라 본사(hq)/내부직원만 호출 가능.
    if (method === 'GET' && path === '/api/admin/payments/cafe24-diag') {
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid required' }, 400);
      try {
        const pay = await runCypher(env, `MATCH (p:Payment {user_id:$uid}) RETURN properties(p) AS props LIMIT 3`, { uid }, 'READ');
        const node = await runCypher(env,
          `MATCH (n) WHERE n.user_id = $uid OR n.member_id = $uid OR n.login_id = $uid OR n.student_id = $uid
           RETURN labels(n) AS labels, properties(n) AS props LIMIT 6`, { uid }, 'READ');
        const rel = await runCypher(env,
          `MATCH (p:Payment {user_id:$uid})-[r]-(x) RETURN type(r) AS rel, labels(x) AS labels, properties(x) AS props LIMIT 6`, { uid }, 'READ');
        return json({
          ok: true,
          payments: pay.values.map(v => v[0]),
          nodes: node.values.map(v => ({ labels: v[0], props: v[1] })),
          rels: rel.values.map(v => ({ rel: v[0], labels: v[1], props: v[2] })),
        });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED' }, 503);
        return json({ ok: false, error: String(e?.message || e) }, 502);
      }
    }

    // 🚨 결석 위험 자동 알림 수동 실행/진단 — cron(15분)과 동일 로직.
    //   ?dry=1 이면 발송·기록 없이 감지 결과만 반환. /api/admin/* default-deny + 비본사 403 뒤.
    if (method === 'GET' && path === '/api/admin/absent-sweep/run') {
      const dry = url.searchParams.get('dry') === '1';
      try {
        const out = await runAbsentStudentSweep(env as any, { dry });
        return json(out);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 🛟 버려진 녹화 자동 마무리 수동 실행 — cron(15분)과 동일 로직.
    //   브라우저가 complete 를 못 보내고 죽어 조각만 R2 에 떠 있는 녹화를 서버가 대신 마무리한다.
    //   ?min_age_min= 시작 후 최소 경과(기본 240=4시간, 진행 중 수업 보호), ?quiet_min= 마지막
    //   조각 후 조용한 시간(기본 30), ?limit= 건수 제한(최대 50). 빈 껍데기 정리도 함께 수행.
    if (method === 'GET' && path === '/api/admin/recordings/finalize/run') {
      const ageMin = parseInt(url.searchParams.get('min_age_min') || '', 10);
      const quietMin = parseInt(url.searchParams.get('quiet_min') || '', 10);
      const lim = parseInt(url.searchParams.get('limit') || '', 10);
      try {
        const out = await runRecordingFinalizeSweep(env as any, {
          minAgeMs: Number.isFinite(ageMin) && ageMin >= 0 ? ageMin * 60000 : undefined,
          quietMs: Number.isFinite(quietMin) && quietMin >= 0 ? quietMin * 60000 : undefined,
          limit: Number.isFinite(lim) && lim > 0 ? Math.min(lim, 50) : undefined,
        });
        return json(out);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 📣 수업 전 리마인더 수동 실행/진단 — cron(15분)과 동일 로직. ?dry=1 = 감지만.
    if (method === 'GET' && path === '/api/admin/lesson-reminder/run') {
      const dry = url.searchParams.get('dry') === '1';
      try {
        const out = await runLessonReminderSweep(env as any, { dry });
        return json(out);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 📚 학생 교재 일괄 배정 — 학생관리 카드 '일괄 교재 배정' 모달용 (adm-bulkbook.js).
    //   body: { textbook_title, level?, q?, only_empty?(기본 true), dry?, force? }
    //   대상 = 스코프(본사/지사/대리점) 내 학생 ∩ (q=이름·아이디 검색) ∩ (only_empty=교재 미배정만).
    //   dry=true → 대상 인원수만 반환(실행 전 미리보기). 2000명 초과는 force=true 필요(오배정 방지).
    //   students_erp.textbook/level 이 화상수업 '배정 교재 자동 로드'가 읽는 정본이며,
    //   student_textbook_assignments 에 이력도 남긴다.
    if (method === 'POST' && path === '/api/admin/students/bulk-assign-textbook') {
      const b: any = await parseJsonBody(request);
      if (!b || !String(b.textbook_title || '').trim()) return invalidBody(['textbook_title']);
      const title = String(b.textbook_title).trim();
      const level = String(b.level || '').trim();
      const q = String(b.q || '').trim();
      const onlyEmpty = b.only_empty !== false;   // 기본 = 미배정 학생만 (기존 배정 실수 덮어쓰기 방지)
      const dry = !!b.dry;

      // textbook/level 컬럼은 기본 DDL 에 없음(운영 DB엔 있을 수 있음) → 멱등 보강
      for (const ddl of [`ALTER TABLE students_erp ADD COLUMN textbook TEXT`, `ALTER TABLE students_erp ADD COLUMN level TEXT`]) {
        try { await env.DB.exec(ddl); } catch {}
      }

      const sw: any = await studentScopeWhere(env, request);
      if (sw?.scope?.type === 'none') return json({ ok: false, error: 'no_scope' }, 403);
      const conds: string[] = [];
      const binds: any[] = [];
      if (sw.cond) { conds.push(sw.cond); binds.push(...sw.binds); }
      if (q) {
        conds.push(`(korean_name LIKE ? OR english_name LIKE ? OR username LIKE ? OR user_id LIKE ? OR login_id LIKE ?)`);
        const like = `%${q}%`;
        binds.push(like, like, like, like, like);
      }
      if (onlyEmpty) conds.push(`(textbook IS NULL OR textbook = '')`);
      const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

      const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp ${where}`).bind(...binds).first();
      const targets = Number(cnt?.n || 0);
      if (dry) return json({ ok: true, dry: true, targets, textbook_title: title, level: level || null, only_empty: onlyEmpty, q: q || null });
      if (!targets) return json({ ok: true, updated: 0, targets: 0 });
      if (targets > 2000 && !b.force) return json({ ok: false, error: 'too_many_targets', targets, hint: 'force=true 로 재요청하면 실행합니다' }, 400);

      const now = Date.now();
      // 이력 먼저 (UPDATE 후엔 only_empty 조건이 더 이상 같은 대상을 가리키지 않음)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_textbook_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, textbook_id INTEGER, textbook_name TEXT, level TEXT, started_at INTEGER, ended_at INTEGER, progress_pct REAL, status TEXT DEFAULT 'active', created_at INTEGER)`);
        await env.DB.prepare(
          `INSERT INTO student_textbook_assignments (user_id, textbook_name, level, started_at, status, created_at)
           SELECT COALESCE(user_id, login_id), ?, CASE WHEN ? = '' THEN level ELSE ? END, ?, 'active', ? FROM students_erp ${where}`
        ).bind(title, level, level, now, now, ...binds).run();
      } catch (e: any) { console.warn('[bulk-assign-textbook] history insert skipped:', e?.message); }
      const upd: any = await env.DB.prepare(
        `UPDATE students_erp SET textbook = ?, level = CASE WHEN ? = '' THEN level ELSE ? END ${where}`
      ).bind(title, level, level, ...binds).run();
      const updated = Number(upd?.meta?.changes ?? targets);
      return json({ ok: true, updated, targets, textbook_title: title, level: level || null });
    }

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
        // 🔍 (2026-08-12 수정요청 #02) 이름·아이디뿐 아니라 가맹점(학원)명·지사명, 그리고
        //    원장·담당자 이름(centers.manager / franchises.owner_name)으로도 학생을 찾을 수 있게.
        //    centers·franchises 는 운영 D1 에 이미 존재(schema-live.sql 확인).
        //    🐢 (2026-08-13 수정요청 #01) 이 두 줄이 원래 EXISTS 상관 서브쿼리였다.
        //       «학생 한 명마다» centers 921행·franchises 241행을 새로 훑어서, 검색 한 번에
        //       D1 이 2,690만 행을 읽고 1,361ms 를 썼다(실측). 검색창은 500ms 디바운스 뒤
        //       매번 이걸 부르므로 «타자를 치면 화면이 느려지는» 것의 정체가 이것이다.
        //       IN (비상관 서브쿼리) 로 바꾸면 SQLite 가 목록을 **한 번만** 만들어 재사용한다.
        //       → 2,690만 행 → 9.6만 행 · 1,361ms → 48ms (실측, 같은 검색어 '김').
        //       ⚠️ 의미는 완전히 같다 — EXISTS(c.name = s.shop_name AND c.manager LIKE ?)
        //          와 s.shop_name IN (SELECT name FROM centers WHERE manager LIKE ?) 는
        //          바깥 컬럼이 등호 하나로만 묶여 있어 서로 바꿔 쓸 수 있다.
        //          운영 D1 에서 두 형태의 결과 집합을 대조 확인했다(양방향 차집합 0건):
        //            · '임창문'(centers.manager 경로) 10건 = 10건
        //            · '지사'(franchises.owner_name 경로) 7,742건 = 7,742건
        conds.push(`(s.korean_name LIKE ? OR s.english_name LIKE ? OR s.student_name LIKE ? OR s.user_id LIKE ? OR s.student_phone LIKE ?
          OR s.shop_name LIKE ? OR s.franchise LIKE ?
          OR s.shop_name IN (SELECT c.name FROM centers c WHERE c.manager LIKE ?)
          OR s.franchise IN (SELECT f.name FROM franchises f WHERE f.owner_name LIKE ?))`);
        binds.push(like, like, like, like, like, like, like, like, like);
      }
      if (_ssw.cond) { conds.push(_ssw.cond); binds.push(..._ssw.binds); }
      /* 🧹 (2026-08-20) 숨김 지정한 중복 계정은 명부에서 뺀다.
         students_erp 는 카페24가 정본이라 지워도 밤에 되살아나므로 «읽을 때» 거른다.
         표가 없으면 빈 문자열이 와서 아무것도 안 거른다(fail-open) — 이유는 student-override.ts. */
      const _hideEx = await hiddenExcludeCond(env as any, 's');
      if (_hideEx) conds.push(_hideEx);
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      /* 🐢 (2026-08-13 수정요청 #01) 「학생 목록을 누르면 한참 걸린다」
         원인은 위 SELECT 목록에 매달려 있던 «상관 서브쿼리 3개» 였다. 학생 한 줄을 만들 때마다
         attendance(18.3만행)를 두 번, enrollments 를 한 번 다시 뒤졌다.
           실측(운영 D1, students_erp 29,397 / attendance 183,074):
             · 옛 형태 그대로            → 183만 행 읽기 · 294ms
             · attendance 를 통짜 GROUP BY 로 조인 → 27만 행 · 79ms
             · ↓ 아래처럼 «뽑은 1000명 것만» 집계     → 12.5만 행 · 63ms   ← 14.7배 · 4.7배
         핵심은 «먼저 1000명을 확정하고, 그 1000명 것만 집계한다» 이다. 그래서 CTE(page)를
         먼저 만들고 attendance 집계에도 그 목록을 그대로 물려 준다.
         ⚠️ 돌려주는 값·컬럼 이름·정렬·건수는 종전과 100% 같다. 화면·CSV 는 손댈 필요가 없다.
         ⚠️ sessions 는 예전에 COUNT(*) 라 «없으면 0» 이었다. LEFT JOIN 은 없으면 NULL 이므로
            COALESCE 로 0 을 유지한다. last_seen 은 예전에도 NULL 이었으니 그대로 둔다.
         ⚠️ enrollments 조인의 MAX(id) 는 장식이 아니다 — SQLite 는 GROUP BY 에
            MAX() 가 있으면 함께 적은 «맨몸 컬럼»(package)을 그 최대 행에서 가져온다.
            즉 옛 `ORDER BY e.id DESC LIMIT 1` 과 같은 값이다(lemuel: id 54·55 중 55 = '정규수업' 로 대조 확인).
            빼면 아무 행이나 집히므로 지우지 말 것. */
      const rs = await env.DB.prepare(
        `WITH page AS (
           SELECT s.user_id,
                  COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS name,
                  s.english_name, s.school, s.grade, s.level, s.textbook,
                  s.student_phone, s.parent_phone, s.kakao_id, s.status, s.signup_date, s.points, s.created_at,
                  s.payment_type, s.end_date, s.classes_per_week, s.teacher_phone,
                  s.shop_name, s.hq_name, s.branch1_name, s.branch2_name, s.franchise,
                  s.rowid AS _rid
             FROM students_erp s
             ${where}
            ORDER BY COALESCE(s.created_at,0) DESC, s.rowid DESC
            LIMIT 1000
         )
         SELECT p.user_id, p.name,
                p.english_name, p.school, p.grade, p.level, p.textbook,
                p.student_phone, p.parent_phone, p.kakao_id, p.status, p.signup_date, p.points, p.created_at,
                p.payment_type, p.end_date, p.classes_per_week, p.teacher_phone,
                p.shop_name, p.hq_name, p.branch1_name, p.branch2_name, p.franchise,
                e.package               AS enroll_package,
                COALESCE(a.sessions, 0) AS sessions,
                a.last_seen             AS last_seen
           FROM page p
           LEFT JOIN (SELECT user_id, COUNT(*) AS sessions, MAX(date) AS last_seen
                        FROM attendance
                       WHERE user_id IN (SELECT user_id FROM page)
                       GROUP BY user_id) a ON a.user_id = p.user_id
           LEFT JOIN (SELECT student_user_id, MAX(id) AS _latest_id, package
                        FROM enrollments
                       GROUP BY student_user_id) e ON e.student_user_id = p.user_id
          ORDER BY COALESCE(p.created_at,0) DESC, p._rid DESC`
      ).bind(...binds).all();
      const _piiStudents = applyPIIScope(rs.results || [], _ssw.scope);  // 🔒 권한별 PII 마스킹
      return json({ ok: true, count: _piiStudents.length, students: _piiStudents, can_view_pii: canViewPII(_ssw.scope) });
    }

    // ➕ 학생 수동 등록 — 카페24 명부에 없는 학생(체험·특수 케이스)을 관리자가 직접 만든다.
    //   POST /api/admin/students/create  body:{ user_id, name, student_phone?, parent_phone?, shop_name?, notes? }
    //   ⚠️ students_erp 는 카페24가 매일 밤 DELETE+INSERT 로 갈아엎지만(CLAUDE.md 2장 「학생 이름·계정을
    //      D1 에서 고치거나 지웠는데 다음날 원복됨」), 그 삭제 조건은 created_at = CAFE24_STUDENT_SENTINEL
    //      (1751500000000) 인 행만이다. 여기서는 Date.now() 로 넣으므로 야간 동기화에서 지워지지 않는다
    //      (self_signup·레벨테스트 체험계정과 같은 검증된 패턴 — api-students.ts:399, leveltest-schedule.ts:83).
    //   본사·직원만 — 강사·지사·대리점은 막는다(staff-create 와 같은 기준. index.ts 라우팅 허용목록에도 등록 필요).
    if (method === 'POST' && path === '/api/admin/students/create') {
      const actor = await getAdminActor(request, env as any);
      if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
      if (actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
        return json({ ok: false, error: 'forbidden',
          message: '본사 관리자만 학생을 등록할 수 있습니다.',
          message_en: 'Only head-office admins can register students.' }, 403);
      }

      let body: any;
      try { body = await request.json(); } catch { body = null; }
      const uid = String(body?.user_id || '').trim();
      const name = String(body?.name || '').trim();
      // 🔑 (2026-08-25 사장님 요청) 관리자가 비밀번호를 직접 정할 수 있게 — 비우면 예전처럼
      //   서버가 임시 비밀번호를 만든다(아래). 기준은 자가등록·재설정과 같다(4자 이상,
      //   api-students.ts 참고 — 「관리자 수동 등록과 짝」이라 적힌 그 규칙).
      const customPwd = String(body?.password || '').trim();
      const studentPhone = String(body?.student_phone || '').trim() || null;
      const parentPhone = String(body?.parent_phone || '').trim() || null;
      const shopName = String(body?.shop_name || '').trim() || null;
      const notes = String(body?.notes || '').trim() || null;

      // 검증 — 홈 회원가입(/api/student/register)과 동일 규칙
      if (!uid || uid.length < 4 || uid.length > 20) {
        return json({ ok: false, error: 'invalid_user_id', message: '아이디는 4~20자여야 합니다.' }, 400);
      }
      if (!/^[a-zA-Z0-9_]+$/.test(uid)) {
        return json({ ok: false, error: 'invalid_user_id', message: '아이디는 영문/숫자/밑줄(_)만 가능합니다.' }, 400);
      }
      if (!name) return json({ ok: false, error: 'name_required', message: '학생 이름을 입력하세요.' }, 400);
      if (customPwd && customPwd.length < 4) {
        return json({ ok: false, error: 'weak_password', message: '비밀번호는 4자 이상이어야 합니다.' }, 400);
      }

      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      for (const [col, type] of [['korean_name', 'TEXT'], ['username', 'TEXT'], ['student_phone', 'TEXT'], ['notes', 'TEXT'],
                                  ['shop_name', 'TEXT'], ['source', 'TEXT'], ['password_hash', 'TEXT'], ['last_login_at', 'INTEGER'],
                                  ['updated_at', 'INTEGER']] as [string, string][]) {
        try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${col} ${type}`); } catch {}
      }

      /* 🔤 (2026-08-25) 중복 검사는 **대소문자를 무시**한다 — `/api/student/login` 이
         `WHERE user_id = ? COLLATE NOCASE` 로 찾기 때문이다. 여기서만 구분하면
         `jeong` 이 있는데 `Jeong` 이 그대로 만들어지고(PK 는 BINARY 라 UNIQUE 에 안 걸린다),
         로그인은 둘 중 «아무 행이나» 집는다. 계정이 두 벌로 갈리면 출석·포인트·수업이
         함께 쪼개진다(CLAUDE.md 2장 「같은 사람인데 계정이 두 개」 — admin_account 판과 같은 뿌리).
         ⛔ 스키마를 COLLATE NOCASE 로 바꿔서 풀지 말 것 — 운영 DB 에 이미 그런 행이
            있으면 표를 다시 만들어야 한다. 찾는 쪽만 맞춘다.
         무엇과 부딪혔는지 그대로 알려 준다(대소문자만 다르면 사람이 눈으로 못 찾는다). */
      const dup = await env.DB.prepare(
        `SELECT user_id FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`
      ).bind(uid).first<{ user_id: string }>();
      if (dup) {
        const caseOnly = String(dup.user_id) !== uid;
        return json({ ok: false, error: 'exists',
          message: caseOnly
            ? `이미 «${dup.user_id}» 가 있습니다(대소문자만 다릅니다). 학생 로그인은 대소문자를 구분하지 않으니 다른 아이디를 쓰세요.`
            : '이미 사용 중인 아이디입니다.',
          existing: dup.user_id }, 409);
      }

      // 비밀번호 — 직접 입력했으면 그대로, 아니면 임시 비밀번호를 만든다.
      //   해시는 /api/student/login 이 검증하는 것과 같은 방식(SHA-256 + salt).
      //   ⚠️ auth-admin.ts 의 hashPassword() 는 관리자 계정용 다른 솔트라 여기 쓰면 학생이 로그인하지 못한다.
      let tempPw = customPwd;
      if (!tempPw) {
        const ALPHA = 'abcdefghijkmnpqrstuvwxyz23456789';
        const rnd = crypto.getRandomValues(new Uint8Array(12));
        tempPw = '';
        for (let i = 0; i < rnd.length; i++) tempPw += ALPHA[rnd[i] % ALPHA.length];
        tempPw = tempPw.slice(0, 4) + '-' + tempPw.slice(4, 8) + '-' + tempPw.slice(8, 12);
      }
      const pwdBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tempPw + '|mangoi-salt-2026'));
      const pwdHash = Array.from(new Uint8Array(pwdBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO students_erp (user_id, korean_name, student_name, username, status, signup_date,
           student_phone, parent_phone, shop_name, notes, source, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, '정상', ?, ?, ?, ?, ?, 'admin_manual', ?, ?, ?)`
      ).bind(uid, name, name, name, today(), studentPhone, parentPhone, shopName, notes, pwdHash, now, now).run();

      return json({
        ok: true, user_id: uid, name,
        temp_password: tempPw,
        message: '학생을 등록했습니다. 아래 임시 비밀번호는 지금 이 화면에서만 보입니다 — 학생·학부모에게 전달하세요.',
      });
    }

    // ========================================================================

    // 🏢 Phase 9 — 메뉴 6개 (지사·대리점학원·레벨테스트·수강신청·커뮤니티·교재)
    //   ⚠️ 테이블명 franchises=지사 / centers=대리점·학원 (이름이 한 칸 밀려 있음. 아래 주석 참고)
    //   각 테이블은 cold start 시 IF NOT EXISTS 자동 생성. 별도 마이그레이션 불필요.
    // ========================================================================
    // ─── 지사 (테이블명은 franchises 지만 실제 내용은 «지사» 241건) ──────────────
    //   ⚠️ 이름이 한 칸 밀려 있다. cafe24-sync 가 Neo4j (:Branch)=지사 → franchises,
    //      (:Center)=대리점·학원 → centers 로 넣는다. 테이블명을 지금 바꾸면 정산·회계까지
    //      번지므로 «화면 라벨만» 바로잡았다(2026-08-08). 테이블명 변경은 별도 작업.
    //   📦 fields=min → 드롭다운용 {id,name} 만(241건 25KB → 6KB)
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/franchises') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS franchises (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, phone TEXT, owner_name TEXT, opened_at TEXT, active INTEGER DEFAULT 1, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);

      /* 🏛️ 대표지사 (2026-08-18 사장님 수정요청 #03) — 조직을 «대표지사 › 지사 › 대리점» 으로 세운다.
         화면(조직 관리 카드)에는 2026-07 부터 «🏛️ 대표지사» 칸이 있었지만 **배선이 하나도 없어서**
         열면 «데이터 없음» 만 뜨는 껍데기였고, 그래서 display:none 으로 감춰 둔 상태였다.

         ⚠️ 왜 franchises 에 컬럼을 안 붙이고 별도 표를 쓰나 —
            franchises·centers 는 **카페24가 정본**이라 매일 밤 03:45 KST 동기화가 UPSERT 로 덮는다
            (CLAUDE.md 「대리점의 지사 소속을 D1에서 고쳤는데 다음날 원복됨」). 대표지사는 카페24에
            없는 «우리만의 묶음» 이라, 같은 표에 넣으면 하룻밤 만에 사라진다.
            그래서 매핑을 franchise_master_map 에 따로 둔다 — center_franchise_override 와 같은 방식.

         ⚠️ 왜 새 경로(/api/admin/master-branches)를 안 만들었나 —
            새 /api 경로는 src/index.ts 의 라우팅 게이트·인증 게이트를 둘 다 통과해야 하는데
            index.ts 는 공동 금지구역이다. 이미 세 관문이 다 열려 있는 이 경로에 붙인다. */
      const ensureMaster = async () => {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS master_branches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, region TEXT, tier TEXT, owner_name TEXT, phone TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS franchise_master_map (franchise_id INTEGER PRIMARY KEY, master_id INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      };

      /* 🔒 (2026-08-18) 지사·대리점 계정에게 이 API 를 열면서 «자기 것만» 으로 자른다.
         index.ts 의 isAgencyAllowedApi 가 이 경로를 열어 주는 근거가 **바로 이 조건절**이다.
         이 줄을 지우면 전국 지사 241건이 모든 지사장·학원장에게 통째로 나간다. */
      const _fSc = await getScope(env as any, request);
      const _fCond = scopeFranchiseCond(_fSc, 'f');
      const _fWhere = _fCond.cond ? ` WHERE ${_fCond.cond}` : '';

      if (method === 'GET') {
        // 🏛️ view=master → 대표지사 목록 (+ 산하 지사 수)
        if (url.searchParams.get('view') === 'master') {
          await ensureMaster();
          /* 지사·대리점에게는 «자기가 속한» 대표지사만. 전국 권역표를 그대로 주면
             남의 권역·대표자·전화가 그대로 보인다. */
          const mWhere = _fCond.cond
            ? ` WHERE m.id IN (SELECT mm2.master_id FROM franchise_master_map mm2
                                 JOIN franchises f ON f.id = mm2.franchise_id WHERE ${_fCond.cond})`
            : '';
          const rs = await env.DB.prepare(
            `SELECT m.*, (SELECT COUNT(*) FROM franchise_master_map mm WHERE mm.master_id = m.id) AS branch_count
               FROM master_branches m${mWhere} ORDER BY m.active DESC, m.name ASC`
          ).bind(..._fCond.binds).all();
          return json({ ok: true, items: rs.results || [], scoped: !!_fCond.cond });
        }
        const cols = url.searchParams.get('fields') === 'min' ? 'id, name' : '*';
        if (cols === 'id, name') {
          // 드롭다운용 짧은 목록도 같이 자른다 — 여기만 빼먹으면 «선택칸» 으로 전국이 샌다
          const rs = await env.DB.prepare(
            `SELECT f.id, f.name FROM franchises f${_fWhere} ORDER BY f.active DESC, f.name ASC`
          ).bind(..._fCond.binds).all();
          return json({ ok: true, items: rs.results || [] });
        }
        // 전체 목록에는 «어느 대표지사 소속인지» 를 함께 실어 준다(표에 컬럼 하나가 는다).
        await ensureMaster();
        const rs = await env.DB.prepare(
          `SELECT f.*, mm.master_id AS master_branch_id, m.name AS master_branch_name
             FROM franchises f
             LEFT JOIN franchise_master_map mm ON mm.franchise_id = f.id
             LEFT JOIN master_branches m ON m.id = mm.master_id${_fWhere}
            ORDER BY f.active DESC, f.name ASC`
        ).bind(..._fCond.binds).all();
        return json({ ok: true, items: rs.results || [], scope: { type: _fSc.type, label: _fSc.label }, can_edit: canEditOrg(_fSc) });
      }

      /* ✍️ 고치는 것은 본사만 — 등록·대표지사 지정·비활성 전부. 화면에서 버튼을 감추는 것만으로는
         URL 로 그대로 뚫린다(지사장이 남의 지사를 자기 대표지사에 붙일 수 있게 된다). */
      if (!canEditOrg(_fSc)) {
        return json({ ok: false, error: 'forbidden_scope', scope: _fSc.type, message: '조직 정보 수정은 본사만 할 수 있습니다.' }, 403);
      }
      const b = await parseJsonBody(request);
      const now = Date.now();

      // 🏛️ 대표지사 등록
      if (b && b.kind === 'master') {
        if (!b.name) return invalidBody(['name']);
        await ensureMaster();
        const r = await env.DB.prepare(
          `INSERT INTO master_branches (name, region, tier, owner_name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(String(b.name).trim(), b.region || null, b.tier || null, b.owner_name || null, b.phone || null, now, now).run();
        return json({ ok: true, id: r.meta.last_row_id });
      }
      // 🏛️ 지사 → 대표지사 배정 (master_id 가 비면 배정 해제)
      if (b && b.kind === 'master_assign') {
        const fid = parseInt(String(b.franchise_id || ''), 10);
        if (!fid) return invalidBody(['franchise_id']);
        await ensureMaster();
        const mid = parseInt(String(b.master_id || ''), 10);
        if (mid) {
          await env.DB.prepare(
            `INSERT INTO franchise_master_map (franchise_id, master_id, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(franchise_id) DO UPDATE SET master_id = excluded.master_id, updated_at = excluded.updated_at`
          ).bind(fid, mid, now).run();
        } else {
          await env.DB.prepare(`DELETE FROM franchise_master_map WHERE franchise_id = ?`).bind(fid).run();
        }
        return json({ ok: true, franchise_id: fid, master_id: mid || null });
      }
      // 🏛️ 대표지사 «비활성» — 지우지 않는다. 산하 지사 매핑이 통째로 끊기면 되돌릴 길이 없다.
      if (b && b.kind === 'master_active') {
        const mid = parseInt(String(b.id || ''), 10);
        if (!mid) return invalidBody(['id']);
        await ensureMaster();
        await env.DB.prepare(`UPDATE master_branches SET active = ?, updated_at = ? WHERE id = ?`)
          .bind(b.active ? 1 : 0, now, mid).run();
        return json({ ok: true, id: mid, active: b.active ? 1 : 0 });
      }

      if (!b || !b.name) return invalidBody(['name']);
      const r = await env.DB.prepare(
        `INSERT INTO franchises (name, address, phone, owner_name, opened_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.name, b.address || null, b.phone || null, b.owner_name || null, b.opened_at || null, b.notes || null, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    /* ─── 🏯 본사 관리 (2026-08-18 수정요청 #13) ─────────────────────────────────
       조직 순서는 🏯 본사 › 🏢 지사 › 🏪 대리점(학원) 인데, 맨 위 «본사» 한 칸만
       화면(껍데기)만 있고 표를 채우는 코드가 저장소에 0곳이라 늘 «데이터 없음» 이었다.
       → hq_orgs 표 + 목록·검색·등록·수정·삭제를 여기서 실제로 붙인다.

       ⚠️ 경로를 «/api/admin/org/hq» 로 잡은 것은 우연이 아니다.
          index.ts 의 TEACHER_BLOCKED_PREFIXES 에 이미 '/api/admin/org' 가 있어서
          **강사에게는 자동으로 닫힌다.** 사업자등록번호·대표이사 같은 법인정보라
          열려 있는 다른 접두사(예: /api/admin/stats/) 밑에 얹으면 강사에게 그대로 열린다.

       ℹ️ 첫 조회 때 표가 비어 있으면 운영 사이트 «회사 정보» 푸터의 값을 한 번만 심는다
          (src/hq-profile.ts). 그 뒤로는 D1 이 정본이라 화면에서 고친 값을 덮어쓰지 않는다. */
    if (path === '/api/admin/org/hq' &&
        (method === 'GET' || method === 'POST' || method === 'PATCH' || method === 'DELETE')) {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS hq_orgs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ceo_name TEXT, business_no TEXT, address TEXT, phone TEXT, email TEXT, ecommerce_no TEXT, privacy_officer TEXT, memo TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);

      const HQ_FIELDS = ['name', 'ceo_name', 'business_no', 'address', 'phone', 'email', 'ecommerce_no', 'privacy_officer', 'memo'] as const;
      const _hqStr = (v: any): string | null => {
        const s = (v == null ? '' : String(v)).trim();
        return s ? s.slice(0, 200) : null;     // 화면 입력이 정본이라 길이만 자른다
      };

      if (method === 'GET') {
        /* 🌱 이관 — «비어 있을 때만» 한 번. COUNT 로 먼저 확인하므로 두 번 심지 않는다.
              (사장님 요청: 「기존 홈페이지에 등록된 것처럼 본사 정보를 등록해 줘」) */
        const n0: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM hq_orgs`).first();
        if (Number(n0?.n || 0) === 0) {
          const now0 = Date.now();
          await env.DB.prepare(
            `INSERT INTO hq_orgs (name, ceo_name, business_no, address, phone, email, ecommerce_no, privacy_officer, memo, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            HQ_PROFILE.name, HQ_PROFILE.ceo_name, HQ_PROFILE.business_no, HQ_PROFILE.address,
            HQ_PROFILE.phone, HQ_PROFILE.email, HQ_PROFILE.ecommerce_no, HQ_PROFILE.privacy_officer,
            HQ_PROFILE.memo, now0, now0
          ).run();
        }
        // 🔎 검색 — 이름·대표이사·전화·주소·사업자번호. 건수가 적어(본사) 페이징은 두지 않는다.
        const q = (url.searchParams.get('q') || '').trim();
        let rs;
        if (q) {
          const like = `%${q}%`;
          rs = await env.DB.prepare(
            `SELECT * FROM hq_orgs
              WHERE name LIKE ? OR ceo_name LIKE ? OR phone LIKE ? OR address LIKE ? OR business_no LIKE ?
              ORDER BY active DESC, id ASC`
          ).bind(like, like, like, like, like).all();
        } else {
          rs = await env.DB.prepare(`SELECT * FROM hq_orgs ORDER BY active DESC, id ASC`).all();
        }
        const items = rs.results || [];
        const tot: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM hq_orgs`).first();
        return json({ ok: true, items, count: items.length, total: Number(tot?.n || 0), q });
      }

      if (method === 'POST') {
        const b = await parseJsonBody(request);
        if (!b || !_hqStr(b.name)) return invalidBody(['name']);
        const now = Date.now();
        const vals = HQ_FIELDS.map(f => _hqStr((b as any)[f]));
        const r = await env.DB.prepare(
          `INSERT INTO hq_orgs (${HQ_FIELDS.join(', ')}, created_at, updated_at)
           VALUES (${HQ_FIELDS.map(() => '?').join(', ')}, ?, ?)`
        ).bind(...vals, now, now).run();
        return json({ ok: true, id: r.meta.last_row_id });
      }

      if (method === 'PATCH') {
        const b = await parseJsonBody(request);
        const hid = parseInt(String((b as any)?.id || ''), 10);
        if (!hid) return invalidBody(['id']);
        if (!_hqStr((b as any)?.name)) return invalidBody(['name']);
        const now = Date.now();
        const vals = HQ_FIELDS.map(f => _hqStr((b as any)[f]));
        await env.DB.prepare(
          `UPDATE hq_orgs SET ${HQ_FIELDS.map(f => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`
        ).bind(...vals, now, hid).run();
        return json({ ok: true, id: hid });
      }

      /* DELETE — ?id= . 실제 행을 지운다(본사는 몇 건 안 되고, 잘못 등록한 것을 못 지우면
         화면에 영원히 남는다). 화면 쪽에서 «두 번 눌러야 확인창» 으로 한 번 더 막는다. */
      const delId = parseInt(url.searchParams.get('id') || '', 10);
      if (!delId) return invalidBody(['id']);
      await env.DB.prepare(`DELETE FROM hq_orgs WHERE id = ?`).bind(delId).run();
      return json({ ok: true, id: delId, deleted: true });
    }

    // ─── 대리점·학원 (테이블명은 centers 지만 실제 내용은 «대리점/학원» 921건) ──────
    //   🔎 실측(2026-08-08): 921건 중 744건이 students_erp.shop_name 과 글자 그대로 일치.
    //      «교육센터»(=필리핀 직영 센터, 홈페이지 문구)와는 전혀 다른 것이다.
    //   🐢 예전엔 921건을 «한 번에 전부» 돌려줬고(약 130KB), 그걸 부팅 때 두 번 받았다.
    //      → 기본 50건 + 검색(q) + total. limit=0 이면 전체(하위호환·CSV 용).
    if ((method === 'GET' || method === 'POST' || method === 'PATCH') && path === '/api/admin/centers') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS centers (id INTEGER PRIMARY KEY AUTOINCREMENT, franchise_id INTEGER, name TEXT NOT NULL, country TEXT, address TEXT, manager TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      // 💳 (2026-08-12 수정요청 #05) 대리점별 결제 유형(B2B/B2C) — 멱등 ALTER.
      //    CREATE 에 넣지 않는 이유: schema_drift 하니스가 «운영 실제에 없는 CREATE 컬럼» 을 막는다.
      //    NULL = 미지정. #03 의 B2B/B2C 결제 리스트 분리가 이 값을 필터 기준으로 쓴다.
      try { await env.DB.exec(`ALTER TABLE centers ADD COLUMN payment_type TEXT`); } catch {}
      /* 💰 (2026-08-22) 아래 목록이 대리점별 수강료를 함께 내려준다. 그 표가 없는
         환경에서 조인이 실패하면 **대리점 목록이 통째로 안 뜬다** — 표를 먼저 보장한다.
         DDL 정본은 org-settlement.ts 한 곳이다(복사하지 말 것). */
      await ensureRateOverrideTable(env);
      const _normPayType = (v: any): string | null => {
        const s = String(v || '').trim().toUpperCase();
        return s === 'B2B' || s === 'B2C' ? s : null;
      };

      /* 🔒 (2026-08-18) 지사·대리점 계정에게 이 API 를 열면서 «자기 것만» 으로 자른다.
         지사 = 자기 지사 소속 대리점 전부, 대리점(학원) = 자기 한 칸.
         index.ts 의 isAgencyAllowedApi 가 이 경로를 열어 주는 근거가 **바로 이 조건절**이다.
         이 줄을 지우면 전국 대리점 921건이 모든 지사장·학원장에게 통째로 나간다. */
      const _cSc = await getScope(env as any, request);
      const _cCond = scopeCenterCond(_cSc, 'c');

      // ✍️ 등록(POST)·결제유형 수정(PATCH)은 본사만. 화면에서 폼을 감추는 것만으로는 URL 로 뚫린다.
      if ((method === 'POST' || method === 'PATCH') && !canEditOrg(_cSc)) {
        return json({ ok: false, error: 'forbidden_scope', scope: _cSc.type, message: '대리점 정보 수정은 본사만 할 수 있습니다.' }, 403);
      }

      if (method === 'PATCH') {
        // 기존 대리점의 결제유형 지정 — centers 에는 수정 API 가 없었어서 이번에 신설(경로 재사용).
        const b = await parseJsonBody(request);
        const cid = parseInt(String(b?.id || ''), 10);
        if (!cid) return invalidBody(['id']);
        const pt = _normPayType(b?.payment_type);
        await env.DB.prepare(`UPDATE centers SET payment_type = ?, updated_at = ? WHERE id = ?`)
          .bind(pt, Date.now(), cid).run();
        return json({ ok: true, id: cid, payment_type: pt });
      }
      if (method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim();
        // 💳 (2026-08-14) 결제유형 필터 — 'B2B' | 'B2C' | 'NONE'(미지정). 그 밖의 값은 «전체».
        //    921건을 50개씩 넘겨 보는 구조라, 이게 없으면 미지정 대리점을 눈으로 찾아야 했다.
        const _ptRaw = (url.searchParams.get('payment_type') || '').trim().toUpperCase();
        const pt = (_ptRaw === 'B2B' || _ptRaw === 'B2C' || _ptRaw === 'NONE') ? _ptRaw : '';
        const rawLimit = url.searchParams.get('limit');
        const limit = rawLimit === '0' ? 0 : Math.max(1, Math.min(500, parseInt(rawLimit || '50', 10) || 50));
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
        const min = url.searchParams.get('fields') === 'min';
        const where: string[] = [];
        const binds: any[] = [];
        // 🔒 스코프가 맨 앞 — 아래 검색어·결제유형·지사 필터가 무엇이든 이 울타리 안에서만 논다
        if (_cCond.cond) { where.push(_cCond.cond); binds.push(..._cCond.binds); }
        if (q) {
          where.push(`(c.name LIKE ? OR c.manager LIKE ? OR c.address LIKE ? OR f.name LIKE ?)`);
          const like = `%${q}%`;
          binds.push(like, like, like, like);
        }
        /* 🏢 (2026-08-18 사장님 수정요청 #05) 「지사에 소속된 대리점 찾기」 —
           지금까지는 q 로 지사 «이름» 을 흉내내 찾는 수밖에 없었는데, 이름이 유일하지 않아서
           (CLAUDE.md 「centers.name 이 유일하지 않습니다」) 엉뚱한 지사 것이 섞여 나왔다.
           id 로 거르면 그 사고가 없다. */
        const fidRaw = url.searchParams.get('franchise_id');
        const fid = fidRaw ? parseInt(fidRaw, 10) : 0;
        if (fid) { where.push(`c.franchise_id = ?`); binds.push(fid); }
        const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        // 미지정 = NULL 뿐 아니라 '' 같은 쓰레기값도 포함해야 «전체 = B2B+B2C+미지정» 이 맞는다.
        const IS_NONE = `(c.payment_type IS NULL OR c.payment_type NOT IN ('B2B','B2C'))`;
        // 유형별 건수 — 검색어(q)까지만 반영하고 «결제유형 필터는 일부러 빼서», 버튼마다 몇 건인지 보이게 한다.
        // COUNT 쿼리 하나로 전체·B2B·B2C·미지정을 다 구하므로 왕복이 늘지 않는다.
        const cnt: any = await env.DB.prepare(
          `SELECT COUNT(*) AS n,
                  SUM(CASE WHEN c.payment_type = 'B2B' THEN 1 ELSE 0 END) AS b2b,
                  SUM(CASE WHEN c.payment_type = 'B2C' THEN 1 ELSE 0 END) AS b2c,
                  SUM(CASE WHEN ${IS_NONE} THEN 1 ELSE 0 END) AS none_ct
             FROM centers c LEFT JOIN franchises f ON f.id = c.franchise_id${whereSql}`
        ).bind(...binds).first();
        const counts: Record<string, number> = {
          all: Number(cnt?.n || 0), B2B: Number(cnt?.b2b || 0),
          B2C: Number(cnt?.b2c || 0), NONE: Number(cnt?.none_ct || 0),
        };
        // 목록에만 결제유형 조건을 더한다(건수 요약은 위에서 이미 계산됨).
        const listWhere = [...where];
        const listBinds = [...binds];
        if (pt === 'NONE') listWhere.push(IS_NONE);
        else if (pt) { listWhere.push(`c.payment_type = ?`); listBinds.push(pt); }
        const listWhereSql = listWhere.length ? ` WHERE ${listWhere.join(' AND ')}` : '';
        /* 💰 (2026-08-22) 대리점별 «주 1회 수강료» 를 함께 내려준다.
           안 정한 곳은 NULL 로 오고 화면이 표준값(30,000원)을 보여 준다 — 여기서
           표준값을 채워 보내면 «사람이 정한 값» 과 «기본값» 을 구분할 수 없어진다.
           ⚠️ 정본은 settlement_rate_override 다(정산 계산이 보는 그 표). centers 에
              칸을 새로 만들지 않는다 — 두 벌이 되면 어느 쪽이 맞는지 알 수 없다. */
        const cols = min ? 'c.id, c.name'
          : `c.*, f.name AS franchise_name,
             (SELECT o.tuition_krw FROM settlement_rate_override o
               WHERE o.scope_type='agency' AND o.scope_key = c.name) AS tuition_krw`;
        const pageSql = limit === 0 ? '' : ` LIMIT ? OFFSET ?`;
        const pageBinds = limit === 0 ? listBinds : [...listBinds, limit, offset];
        const rs = await env.DB.prepare(
          `SELECT ${cols} FROM centers c LEFT JOIN franchises f ON f.id = c.franchise_id${listWhereSql} ORDER BY c.active DESC, c.name ASC${pageSql}`
        ).bind(...pageBinds).all();
        return json({ ok: true, items: rs.results || [], total: pt ? counts[pt] : counts.all, counts, limit, offset,
                      scope: { type: _cSc.type, label: _cSc.label }, can_edit: canEditOrg(_cSc) });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.name) return invalidBody(['name']);
      const now = Date.now();

      /* 🔑 (2026-08-19 사장님 요청) 대리점 등록과 함께 로그인 계정도 만든다.
         지금까지는 대리점(학원)을 등록해도 로그인 계정을 만드는 자리가 없어서, 필요하면
         admin_account 에 손으로 심어야 했다 — CLAUDE.md 「직원을 등록했는데 로그인이 안 돼요」와
         같은 뿌리(«등록» 화면이 실제 로그인 계정 생성과 분리돼 있던 문제).
         아이디·비번을 «둘 다» 채웠을 때만 계정을 만든다. 하나만 채우면 400 — 대리점만 만들어지고
         로그인은 없는 «반쪽» 상태를 피한다. scope_value 는 반드시 centers.name 과 똑같아야 한다
         (scope.ts scopeCenterCond 가 id 가 아니라 «이름» 으로 대리점 계정을 가른다). */
      const loginUsername = String(b.login_username || '').trim();
      const loginPassword = String(b.login_password || '');
      if (loginUsername || loginPassword) {
        if (!loginUsername || !loginPassword) {
          return json({ ok: false, error: 'login_fields_incomplete',
            message: '대리점 로그인 아이디와 비밀번호를 함께 입력하세요.' }, 400);
        }
        if (!/^[a-zA-Z0-9_]{3,32}$/.test(loginUsername)) {
          return json({ ok: false, error: 'bad_username',
            message: '아이디는 영문·숫자·밑줄(_)로 3~32자여야 합니다.' }, 400);
        }
        if (loginPassword.length < 6) {
          return json({ ok: false, error: 'too_short',
            message: '비밀번호는 6자 이상이어야 합니다.' }, 400);
        }
        if (FULL_ACCESS_ACCOUNTS.has(loginUsername.toLowerCase())) {
          return json({ ok: false, error: 'reserved_username',
            message: '이 아이디는 시스템 전체권한 계정이라 쓸 수 없습니다.' }, 403);
        }
        // NOCASE — 로그인이 대소문자를 무시하므로(staff-create 와 같은 규칙) 여기만
        // 구분하면 Busan_Agency/busan_agency 두 벌이 생겨 «계정이 두 개» 사고가 재현된다.
        const dup = await env.DB.prepare(
          `SELECT username FROM admin_account WHERE username = ? COLLATE NOCASE LIMIT 1`)
          .bind(loginUsername).first<{ username: string }>();
        if (dup) {
          return json({ ok: false, error: 'already_exists',
            message: '이미 있는 아이디입니다. 다른 아이디를 쓰세요.' }, 409);
        }
        // ⚠️ centers.name 은 유일하지 않다(CLAUDE.md 「가맹점 정산에서 특정 지사 매출이 통째로
        //    안 잡힘」과 같은 뿌리). scope_value 를 이름으로 매칭하는 구조라, 이미 같은 이름의
        //    대리점이 있으면 이 로그인이 «그 대리점 자료까지» 함께 보게 된다. 등록 자체는 막지
        //    않고(대리점만 먼저 등록하는 기존 동작은 유지) 로그인 계정만 막는다.
        const nameDup = await env.DB.prepare(`SELECT id FROM centers WHERE name = ? LIMIT 1`)
          .bind(b.name).first<{ id: number }>();
        if (nameDup) {
          return json({ ok: false, error: 'duplicate_center_name',
            message: '이미 같은 이름의 대리점이 있어 로그인 계정을 만들 수 없습니다 — 이름으로 접근 범위를 가르기 때문에 ' +
                      '다른 대리점 자료가 섞여 보일 수 있습니다. 대리점 이름을 구분되게 바꾸거나, ' +
                      '로그인 계정 없이 먼저 등록한 뒤 본사에 문의하세요.' }, 409);
        }
      }

      const r = await env.DB.prepare(
        `INSERT INTO centers (franchise_id, name, country, address, manager, payment_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.franchise_id || null, b.name, b.country || null, b.address || null, b.manager || null, _normPayType(b.payment_type), now, now).run();

      let loginCreated = false;
      if (loginUsername && loginPassword) {
        await env.DB.prepare(
          `INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
        ).bind(loginUsername, await hashPassword(loginPassword), b.name, now, now).run();
        await env.DB.prepare(
          `INSERT INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?, 'agency', ?, ?)
           ON CONFLICT(username) DO UPDATE SET scope_type = excluded.scope_type, scope_value = excluded.scope_value, updated_at = excluded.updated_at`
        ).bind(loginUsername, b.name, now).run();
        loginCreated = true;
      }

      return json({ ok: true, id: r.meta.last_row_id, login_created: loginCreated });
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
        // 📚 (2026-07-22) 학부모 컴플레인 #6: 결과에 '추천 교재/다음 수업 안내'가 없던 문제
        ['recommended_textbook', 'TEXT'], ['next_class_guide', 'TEXT'], ['result_notified_at', 'INTEGER'],
        // 🔗 (2026-08-05) 신청 ↔ 실제 수업예약 연결고리. 이게 없어서 «완료» 처리를 해도 수업은
        //    한 건도 안 생겼고, 반대로 예약을 만들어도 신청서엔 아무 표시가 남지 않았다.
        ['schedule_id', 'INTEGER'],
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
        /* 그 요일·시간에 이미 수업이 잡힌 교사(중복 배정 방지).
           🔴 (2026-08-06) 이 검사는 **한 번도 동작한 적이 없었다** — 이유가 둘이다.
             ① `day_of_week = 'fri'` 로 물었는데 운영 값은 `'Fri'` 다. SQLite 의 `=` 는
                대소문자를 가리므로 **항상 0건** → busy 가 늘 비어 있었다.
             ② 설령 걸렸어도 담은 값은 `class_schedules.teacher_id`(= teachers.id)인데
                비교 대상은 `teacher_profiles.id` 다. **번호 체계가 달라** 엉뚱한 교사를
                제외했을 것이다(Teacher Kaye = profiles 11 / teachers 8).
           → 요일은 표기를 전부 받아들이고, 일회성 수업(scheduled_date)도 함께 보고,
             비교는 번호가 아니라 **이름**으로 한다. 금요일 18시처럼 이미 17명이 차 있는
             슬롯에서 «찬 교사»가 배정되면, 뒤의 겹침 검사에 걸려 수업이 조용히 안 생긴다. */
        const busyNames = new Set<string>();
        const normT = (x: any) => String(x || '').toLowerCase().replace(/teacher/g, '').replace(/[^a-z0-9가-힣]/g, '');
        if (wantHour != null && (wantDay || desiredDate)) {
          try {
            const DOW_FORMS: Record<string, string[]> = {
              Sun: ['sun', 'sunday', '0', '7', '일', '일요일'], Mon: ['mon', 'monday', '1', '월', '월요일'],
              Tue: ['tue', 'tuesday', '2', '화', '화요일'], Wed: ['wed', 'wednesday', '3', '수', '수요일'],
              Thu: ['thu', 'thursday', '4', '목', '목요일'], Fri: ['fri', 'friday', '5', '금', '금요일'],
              Sat: ['sat', 'saturday', '6', '토', '토요일'],
            };
            const conds: string[] = []; const bind: any[] = [];
            const forms = wantDay ? (DOW_FORMS[wantDay] || []) : [];
            if (forms.length) {
              conds.push(`lower(COALESCE(cs.day_of_week,'')) IN (${forms.map(() => '?').join(',')})`);
              bind.push(...forms);
            }
            if (desiredDate) { conds.push(`cs.scheduled_date = ?`); bind.push(desiredDate); }
            if (conds.length) {
              const bs: any = await env.DB.prepare(
                `SELECT t.name AS name FROM class_schedules cs
                   JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
                  WHERE (cs.status IS NULL OR cs.status = 'active')
                    AND substr(cs.start_time, 1, 2) = ? AND (${conds.join(' OR ')})`
              ).bind(('0' + wantHour).slice(-2), ...bind).all();
              (bs.results || []).forEach((r: any) => { if (r.name) busyNames.add(normT(r.name)); });
            }
          } catch {}
        }

        const scoreOf = (t: any): number => {
          // class_ratings(0~5?) 우선. 칭찬 별점은 보조. 평가 없으면 중립값 2.5(신규교사 과도한 불이익 방지)
          if (t.rating_avg != null) return Number(t.rating_avg);
          if (t.praise_avg != null) return Number(t.praise_avg);
          return 2.5;
        };
        const notBusy = (t: any) => !busyNames.has(normT(t.name)) && !busyNames.has(normT(t.en_name));
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
      /* 🔑 uid 붙이기 — 이게 비면 나중에 학생이 «내 신청»을 못 찾는다(마이페이지가 uid 로만 조회).
         프론트가 보낸 값을 우선 쓰되, 비어 있으면 로그인 토큰에서 직접 꺼낸다.
         프론트는 localStorage 키를 하나라도 놓치면 uid 를 못 실어 보내지만(실제로 그래서
         신청 13건 중 7건이 uid 없이 저장됐다), 토큰은 서명이 검증되므로 위조가 안 된다. */
      let uid = ((b && (b.student_uid || b.uid)) || '').toString().trim() || null;
      if (!uid) {
        try { uid = await authUidGlobal(request, url, env, b); } catch { uid = null; }
      }
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

      /* 📅 (2026-08-06) 신청 즉시 «실제 수업» 까지 만든다.
         [왜] 예전엔 관리자가 「📅 수업 만들기」를 손으로 눌러야만 방이 생겼다. 안 누르면
              학생 티켓엔 입장 버튼이 안 생기고, 강사 화면·주간 캘린더 어디에도 안 뜬다.
              신청서만 쌓이고 아무도 못 들어가는 상태가 «에러 없이» 남는다.
              그런데 그 버튼이 하는 일은 신청서에 이미 있는 값(날짜·시간·배정교사)을
              옮겨 적는 것뿐이라 사람이 판단할 여지가 거의 없다.
         ⚠️ best-effort — 만들 수 없는 상황(과거 날짜·겹침·강사 미배정)이면 조용히 넘기고
            신청 자체는 성공시킨다. 그 경우는 관리자가 기존 버튼으로 처리하면 된다. */
      /* 🎟️ 티켓 주소는 응답에도 실어 준다. 문자만 믿으면 «문자가 늦거나 안 오는» 사람은
         자기 신청을 확인할 길이 사라진다. 신청한 본인에게 주는 것이라 노출 문제도 없다. */
      let ticketUrl = '';
      let autoSched: any = null;
      try {
        const appRowNew: any = await env.DB.prepare(
          `SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`).bind(appId).first();
        if (appRowNew) autoSched = await autoScheduleOnApply(env, appRowNew);
      } catch (e: any) { console.warn('[leveltest] auto-schedule skipped:', e?.message || e); }

      // 전화번호가 없어 문자를 못 보낸 경우에도 화면에는 링크를 줘야 한다
      if (!ticketUrl) { try { ticketUrl = await ltTicketUrl(Number(appId), env); } catch {} }

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
        /* 🎟️ 접수 문자에 «티켓 링크» 를 넣는다. 이전엔 문의 카톡 주소만 있어서, 신청자가
           자기 신청을 확인할 방법이 문자 한 통의 기억뿐이었다. 이 링크 하나가 확인·일정·
           장비점검·당일 입장까지 전부 담당한다(로그인 불필요). */
        let ticketLine = '';
        try { ticketUrl = await ltTicketUrl(Number(appId), env); ticketLine = `
▶ 확인·입장: ${ticketUrl}`; } catch {}
        const smsText = `[망고아이] ${name}님, 레벨테스트 신청이 접수됐어요! 🎯\n📅 희망: ${whenLabel}\n담당 선생님이 확정되면 다시 안내드릴게요.${ticketLine}\n문의: pf.kakao.com/_xlqnSxd`;
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

      return json({
        ok: true, id: appId,
        status: teacher ? 'proposed' : 'pending',
        proposed_teacher: teacher ? teacher.name : null,
        scheduled: whenLabel,
        // 📅 자동으로 수업까지 잡혔으면 그 사실을 알려 준다(화면이 «예약 완료» 라고 말할 근거)
        schedule_id: (autoSched && autoSched.schedule_id) || null,
        // 🎟️ 이 링크 하나가 «확인 + 입장» 이다. 로그인·계정 없이 열린다.
        ticket_url: ticketUrl || null,
      });
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
          /* 🎟️ 예전엔 "예약 10분 전 카카오톡 채널로 화상 링크를 보내드립니다" 라고 «약속만» 했다.
             그 링크를 보내는 코드는 전화번호를 students_erp 에서만 찾아, 계정이 없는 신청자에겐
             구조적으로 못 갔다 — 지키지 못할 약속이었다. 이제는 링크를 «지금» 준다.
             수업 전엔 일정 확인, 10분 전부터 입장 버튼으로 바뀌는 같은 주소다. */
          // ⏰ 분 수는 상수에서 꺼낸다 — 문자에 숫자를 적어 두면 창을 늘렸을 때 문자만 거짓말을 한다
          const openMin = Math.round(OPEN_BEFORE_MS / 60000);
          let ticketLine2 = `\n※ 시작 ${openMin}분 전부터 입장할 수 있어요.`;
          try { ticketLine2 = `\n▶ 확인·입장: ${await ltTicketUrl(Number(app.id), env)}\n※ 시작 ${openMin}분 전부터 입장 버튼이 열려요.`; } catch {}
          const smsText = `[망고아이] ${app.student_name}님, 레벨테스트 담당 선생님이 확정됐어요! ✅\n📅 ${whenLabel2}\n👩‍🏫 담당: ${tLabel}${ticketLine2}\n문의: pf.kakao.com/_xlqnSxd`;
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
    /* ═══════════════════════════════════════════════════════════════════════
       🎟️ 티켓 — 「확인」과 「입장」을 링크 하나로  (leveltest-ticket.ts 참고)
         GET /api/leveltest/ticket?k=<토큰>      → 지금 보여줄 것 전부(JSON)
         GET /api/leveltest/ticket.ics?k=<토큰>  → 「내 캘린더에 추가」
       계정이 없어도 동작한다 — 서명 토큰이 곧 신원이다. 신청번호를 바꿔치기하면
       서명이 깨져 남의 티켓은 열리지 않는다.
       ═══════════════════════════════════════════════════════════════════════ */
    if (method === 'GET' && (path === '/api/leveltest/ticket' || path === '/api/leveltest/ticket.ics')) {
      await ensureLtApps();
      const k = (url.searchParams.get('k') || '').trim();
      const appId = await verifyLtTicket(k, env);
      if (!appId) {
        return json({ ok: false, error: 'invalid_ticket', message: '링크가 만료되었거나 올바르지 않습니다.', message_en: 'This link is expired or invalid.' }, 404);
      }
      // 🔒 p = 전화번호 뒷 4자리. 결과(점수·레벨·교재) 열람에만 쓰인다 —
      //    없거나 틀려도 일정·입장은 그대로 열린다(수업에 못 들어가는 일을 만들지 않는다).
      const pin = (url.searchParams.get('p') || '').trim();
      const t = await buildLtTicket(env, appId, k, pin);
      if (!t) return json({ ok: false, error: 'not_found' }, 404);
      if (path === '/api/leveltest/ticket.ics') {
        if (!t.start_ts) return json({ ok: false, error: 'no_schedule', message: '아직 일정이 확정되지 않았습니다.', message_en: 'The schedule is not confirmed yet.' }, 409);
        return new Response(buildLtIcs(t, `${publicBase(env)}/t.html?k=${k}`), {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="mangoi-leveltest.ics"',
            'Cache-Control': 'no-store',
          },
        });
      }
      return json({ ok: true, ticket: t });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       🙋 «내 레벨테스트» — 학생/학부모 본인 조회  GET /api/leveltest/my?uid=&token=
       ───────────────────────────────────────────────────────────────────────
       [왜] 신청은 저장되는데 «학생이 자기 신청을 읽는» 경로가 아예 없었다.
            읽기 API 는 관리자용·강사용 둘뿐이라, 마이페이지(parent.html)에서
            신청 현황을 보여줄 방법이 없었고 «신청했는데 안 보인다» 문의가 났다.
       [보안] 🔐 본인 것만. mango_token(uid 서명) 의 uid 와 요청 uid 가 같아야 함.
              이름(student_name)으로는 절대 매칭하지 않는다 — 동명이인이 많아
              (김민서 71명) 남의 신청·점수가 새어나간다.
              단 하나의 예외: student_uid 가 비어 있고 student_name 이 «내 uid 와
              문자열이 같은» 경우. 로그인 없이 신청하면서 이름칸에 자기 아이디를
              적은 흔한 케이스인데, uid 는 유일하므로 동명이인 위험이 없다.
       [노출범위] 교사명은 교사가 «수락»(confirmed/done)한 뒤에만 알려준다.
                  proposed(소프트 배정) 단계에서 이름이 새면 교사가 거절했을 때
                  «담당이 바뀌었다»는 혼선이 생긴다 — 2단계 승인 설계와 동일.
       ═══════════════════════════════════════════════════════════════════════ */
    if (method === 'GET' && path === '/api/leveltest/my') {
      await ensureLtApps();
      const myUid = (url.searchParams.get('uid') || '').trim();
      if (!myUid) return invalidBody(['uid']);
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid || authUid !== myUid) {
        return json({ ok: false, error: 'auth_required', message: '로그인이 필요합니다.', message_en: 'Please sign in.' }, 401);
      }

      /* ═══════════════════════════════════════════════════════════════════════
         🔗 (2026-08-11) «PC 에서 신청한 것이 폰에서도 보이게» — 티켓 + 로그인 = 스스로 잇기
         ───────────────────────────────────────────────────────────────────────
         [왜] 비로그인으로 낸 신청은 서버가 만든 체험 계정 `lt{번호}` 에 붙는다(createTrialStudent).
              그 계정으로 로그인하는 사람은 세상에 없으므로, 자기 예약을 찾는 길이
              «신청한 그 브라우저에 남은 티켓» 하나뿐이 된다. 기기를 옮기면 통째로 사라진다.
              실사고: 신청 #17(pauljeong) — PC 에서는 티켓으로 보였는데 폰에서는 아무것도 없었다.
              계정은 `jeong`, 신청 주인은 `lt17_1` 이라 uid 조회가 영원히 0건이었다.
         [무엇] 티켓 서명(k) = «신청자 본인» 증명, mango_token = «계정 주인» 증명.
              **둘 다 가진 사람만** 자기 신청을 자기 계정으로 가져온다.
              한 번 이으면 그 뒤로는 로그인만 하면 어느 기기에서나 보인다.
         ⛔ 남의 신청을 뺏지 않는다 — 주인이 «없거나 체험 계정(lt*)» 인 건만 옮긴다.
            진짜 계정이 이미 붙어 있으면 서명이 맞아도 손대지 않는다.
         ⚠️ 수업 주인(class_schedules.user_id)도 반드시 같이 옮긴다. 신청서만 옮기면
            «연결은 됐는데 오늘 수업엔 안 뜨는» 반쪽이 된다 — link_student 가 밟았던 함정과 같다.
         ⚠️ 잇기가 실패해도 조회는 그대로 진행한다. 부가 기능이 본 기능을 막으면 안 된다.
         ═══════════════════════════════════════════════════════════════════════ */
      const claimK = (url.searchParams.get('k') || '').trim();
      if (claimK) {
        try {
          const claimId = await verifyLtTicket(claimK, env);
          if (claimId) {
            const row = await env.DB.prepare(
              `SELECT id, student_uid, schedule_id FROM leveltest_applications WHERE id = ? LIMIT 1`
            ).bind(claimId).first<any>();
            const owner = row ? String(row.student_uid || '') : '';
            const ownerIsTrial = /^lt\d+(_\d+)?$/i.test(owner);
            if (row && owner !== myUid && (!owner || ownerIsTrial)) {
              const claimAt = Date.now();
              await env.DB.prepare(`UPDATE leveltest_applications SET student_uid = ?, updated_at = ? WHERE id = ?`)
                .bind(myUid, claimAt, Number(row.id)).run();
              if (row.schedule_id) {
                try {
                  await env.DB.prepare(`UPDATE class_schedules SET user_id = ?, updated_at = ? WHERE id = ?`)
                    .bind(myUid, claimAt, Number(row.schedule_id)).run();
                } catch { /* 수업 이동 실패 — 신청서는 이미 이어졌다. 관리자 link_student 로 마저 옮길 수 있다 */ }
              }
              try {
                await writeClassAudit(env, {
                  action: 'leveltest_self_claim', schedule_id: row.schedule_id || null,
                  actor: myUid, actor_role: 'student', source: 'leveltest_ticket',
                  detail: JSON.stringify({ app_id: row.id, from: owner || null, to: myUid, from_was_trial: ownerIsTrial }),
                });
              } catch {}
            }
          }
        } catch { /* 잇기 실패는 조용히 넘긴다 — 아래 목록 조회는 그대로 */ }
      }

      const rs = await env.DB.prepare(
        `SELECT id, student_name, desired_date, desired_time, status, assigned_teacher, teacher_confirmed_at,
                ai_score, pron_score, teacher_score, final_level,
                recommended_textbook, next_class_guide, schedule_id, created_at, updated_at
           FROM leveltest_applications
          WHERE student_uid = ? OR (student_uid IS NULL AND student_name = ?)
          ORDER BY created_at DESC LIMIT 20`
      ).bind(myUid, myUid).all();
      const mine = (rs.results || []) as any[];
      // 🎤 발음 점수는 관리자 목록과 같은 원천(voice_coaching 최신)으로 오버레이 — 두 화면 숫자가 어긋나지 않게
      try {
        const vc = await env.DB.prepare(
          `SELECT pronunciation_score FROM voice_coaching WHERE student_uid = ? ORDER BY created_at DESC LIMIT 1`
        ).bind(myUid).first<any>();
        if (vc && vc.pronunciation_score != null) {
          mine.forEach(a => { if (a.pron_score == null) a.pron_score = vc.pronunciation_score; });
        }
      } catch { /* voice_coaching 미존재 시 무시 */ }
      const items = mine.map(a => ({
        ...a,
        assigned_teacher: (a.status === 'confirmed' || a.status === 'done') ? a.assigned_teacher : null,
      }));
      return json({ ok: true, items });
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
            // ⚠️ (2026-08-07) limit 이 최대 500 이라 uids 가 100개를 넘으면 D1 이 던지고,
            //    아래 catch 가 삼켜 발음 점수가 통째로 안 붙었습니다(빈 칸으로만 보임).
            //    GROUP BY 키가 IN 목록과 같은 student_uid 라 청크로 나눠도 결과는 동일합니다.
            const vcRows = await selectInChunks<any>(env.DB, uids,
              (ph) => `SELECT student_uid, pronunciation_score, MAX(created_at) AS mx FROM voice_coaching WHERE student_uid IN (${ph}) GROUP BY student_uid`);
            const pmap: Record<string, number> = {};
            vcRows.forEach((r: any) => { if (r.pronunciation_score != null) pmap[r.student_uid] = r.pronunciation_score; });
            items.forEach(a => { if (a.pron_score == null && a.student_uid && pmap[a.student_uid] != null) a.pron_score = pmap[a.student_uid]; });
          }
        } catch (e) { /* voice_coaching 미존재 시 무시 */ }
        /* 🎟️ (2026-08-07) 티켓 링크를 목록에 함께 내려준다.
           [왜] 링크는 지금까지 ①신청 직후 응답·문자 ②확정 문자 ③10분 전 리마인더,
                이 세 곳에서만 만들어졌다. 그래서 신청자가 문자를 못 찾으면 상담직원도
                꺼내 줄 데가 없었다 — 실제로 오늘 그 상황이 났다(신청 #15).
                링크 하나가 확인·일정·장비점검·당일 입장을 전부 담당하는데,
                운영자가 그걸 다시 건네줄 방법이 없던 것이다.
           [노출] 이 API 는 관리자 인증 게이트 뒤에 있다. 링크는 신청자 본인에게 주라고
                  만든 것이고, 운영자가 대신 전달하는 것이 이 기능의 목적이다.
           ⚠️ 행마다 서명하므로 키 import 는 한 번만 한다(ltTicketUrlMap). */
        try {
          const tmap = await ltTicketUrlMap(items.map(a => Number(a.id)), env);
          items.forEach(a => { a.ticket_url = tmap[Number(a.id)] || null; });
        } catch (e) { items.forEach(a => { a.ticket_url = null; }); }
        const cnt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM leveltest_applications WHERE status = 'pending'`).all();
        const pending = (cnt.results && cnt.results[0] && (cnt.results[0] as any).n) || 0;
        return json({ ok: true, items, pending });
      }
      /* 🗑️ DELETE — 신청 삭제 (2026-08-21, 사장님 지시: 레벨테스트 신청현황의 데모 항목 정리)
         ⛔ 본사만. `canEditOrg()` 는 강사(scope 'none')까지 통과시키는 함정이 있어(CLAUDE.md
            trap) 쓰지 않는다 — 다른 "본사만" 엔드포인트와 같은 role==='hq'|'staff' 패턴.
         ⚠️ 되돌릴 수 없다. 연결된 수업(schedule_id)이 있으면 삭제 전에 먼저 cancelled 로
            정리한다 — 신청서만 지우면 강사·학생 달력에 담당 없는 유령 수업이 남는다
            (위 「취소했는데 수업은 살아 있다」 사고와 같은 뿌리). */
      if (method === 'DELETE') {
        const actor = await getAdminActor(request, env as any);
        if (!actor.ok || actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
          return json({ ok: false, error: 'forbidden_scope', message: '레벨테스트 신청 삭제는 본사만 할 수 있습니다.', message_en: 'Only HQ accounts can delete level-test applications.' }, 403);
        }
        const delBody: any = await parseJsonBody(request).catch(() => null);
        const idsParam = url.searchParams.get('ids') || url.searchParams.get('id');
        let ids: number[] = [];
        if (delBody && Array.isArray(delBody.ids)) ids = delBody.ids.map((x: any) => Number(x));
        else if (delBody && delBody.id != null) ids = [Number(delBody.id)];
        else if (idsParam) ids = idsParam.split(',').map((s: string) => Number(s.trim()));
        ids = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));
        if (!ids.length) return invalidBody(['ids']);
        if (ids.length > 90) return json({ ok: false, error: 'too_many', message: '한 번에 최대 90건까지 삭제할 수 있습니다.' }, 400);

        let actorName = 'admin';
        try { if (actor.name) actorName = actor.name; } catch {}
        const deleted: number[] = [];
        const notFound: number[] = [];
        for (const id of ids) {
          const appRow: any = await env.DB.prepare(
            `SELECT id, schedule_id, student_name, desired_date, desired_time, assigned_teacher FROM leveltest_applications WHERE id = ? LIMIT 1`
          ).bind(id).first();
          if (!appRow) { notFound.push(id); continue; }
          if (appRow.schedule_id) {
            try {
              const sched: any = await env.DB.prepare(
                `SELECT id, status FROM class_schedules WHERE id = ? LIMIT 1`
              ).bind(Number(appRow.schedule_id)).first();
              if (sched && String(sched.status || 'active') !== 'cancelled') {
                await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`)
                  .bind(Date.now(), Number(sched.id)).run();
              }
            } catch (e: any) { console.warn('[leveltest delete] schedule cancel skipped:', e?.message || e); }
          }
          try {
            await writeClassAudit(env, {
              action: 'delete', schedule_id: appRow.schedule_id || null,
              teacher_name: appRow.assigned_teacher || null,
              student_name: appRow.student_name || null,
              lesson_date: appRow.desired_date || null, lesson_time: appRow.desired_time || null,
              actor: actorName, actor_role: 'admin', source: 'leveltest_app',
              reason: '레벨테스트 신청 삭제 (연결 수업 취소 처리)',
              detail: JSON.stringify({ app_id: id }),
            });
          } catch {}
          await env.DB.prepare(`DELETE FROM leveltest_applications WHERE id = ?`).bind(id).run();
          deleted.push(id);
        }
        return json({ ok: true, deleted, not_found: notFound });
      }
      // POST → 상태/배정/메모 업데이트
      const b = await parseJsonBody(request);
      if (!b || !b.id) return invalidBody(['id']);

      /* ═══════════════════════════════════════════════════════════════════════
         🔗 1단계 (2026-08-05 사장님 지시) — 신청 → «실제 수업 예약» 만들기
         ───────────────────────────────────────────────────────────────────────
         [왜] 지금까지 신청을 «완료» 처리해도 수업은 한 건도 생기지 않았다.
              사장님 테스트 건(#13)은 사람이 D1 에 직접 넣어야 했다.
              두 표가 서로를 모르니 «달력에 뜬 것이 확정인지 희망인지» 도 구분이 안 됐다.
         [무엇] 희망일·희망시간·담당강사로 class_schedules 를 만들고,
              신청서에 schedule_id 를 박아 둘을 잇는다.
              예약이 있으면 방 번호가 class-{id}-{YYYYMMDD} 로 자동 결정되므로,
              강사·학생이 방 코드를 주고받다 엇갈리는 사고가 원천 차단된다.
         ⚠️ 새 라우트를 만들지 않고 «이미 열려 있는 이 POST» 에 action 으로 얹는다.
            새 경로는 src/index.ts 의 라우팅+인증게이트에 등록해야 하는데, 그 파일은
            사고 반경이 서비스 전체다. 여기 얹으면 인증은 이미 통과한 뒤다.
         ⚠️ 조용한 실패를 만들지 않는다 — 학생 계정·강사를 못 찾으면 «만들어 두고 모른 척»
            하지 않고 이유를 돌려준다. 계정 없는 예약은 학생 화면에 영영 안 뜬다.
         ═══════════════════════════════════════════════════════════════════════ */
      if (String(b.action || '') === 'create_schedule') {
        /* 🔗 신청 → «실제 수업». 로직은 leveltest-schedule.ts 한 곳에만 있다.
           같은 일을 신청 직후 자동으로도 하기 때문에(autoScheduleOnApply), 두 경로가
           서로 다르게 동작하면 «자동으로 만든 수업»과 «손으로 만든 수업»이 미묘하게
           달라져 나중에 아무도 원인을 못 찾는다. */
        const appRow: any = await env.DB.prepare(
          `SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`
        ).bind(Number(b.id)).first();
        if (!appRow) return json({ ok: false, error: 'not_found', message: '신청 건을 찾을 수 없습니다.', message_en: 'Application not found.' }, 404);

        let actorName = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name) actorName = a.name; } catch {}

        const res = await createLeveltestSchedule(env, appRow, {
          userId: b.user_id, scheduledDate: b.scheduled_date, startTime: b.start_time,
          durationMin: b.duration_min, force: !!b.force, actor: actorName,
          /* 관리자가 직접 누른 경우에도 계정이 없으면 만들어 준다 — 되묻는 순간 관리자는
             «아무 계정이나» 넣게 되고(실제로 그렇게 남의 학생 기록이 오염될 뻔했다),
             그 판단은 사람이 할 만한 일이 아니다. */
          allowCreateStudent: b.create_student !== false,
        });
        if (!res.ok) {
          const { status, ...rest } = res;
          return json(rest, status);
        }
        // 수업이 잡혔으면 신청 상태도 확정으로 올린다(대기 중이던 건만)
        await env.DB.prepare(
          `UPDATE leveltest_applications SET status = CASE WHEN status IN ('pending','proposed') THEN 'confirmed' ELSE status END, updated_at = ? WHERE id = ?`
        ).bind(Date.now(), Number(b.id)).run();
        return json(res);
      }

      /* ═══════════════════════════════════════════════════════════════════════
         🔗 신청 ↔ «진짜 학생 계정» 연결 (2026-08-07, 실사고에서 나옴)
         ───────────────────────────────────────────────────────────────────────
         [왜] 비로그인으로 낸 신청은 진짜 계정에 붙지 못한다. 서버가 대신
              체험 계정 `lt{신청번호}`(createTrialStudent)를 만들어 붙이는데,
              그 계정으로 로그인하는 사람은 세상에 없다. 그래서
                · 마이페이지 「내 레벨테스트」 — 안 뜸(조회는 uid 로만 한다)
                · 홈 「🎟️ 내 레벨테스트」 — 안 뜸
                · 그 학생의 «오늘 수업» — 수업 주인이 lt15 라 안 뜸
              전부 «에러 없이» 안 보인다. 실제 사고: 신청 #15(paul710619) —
              사장님이 자기 예약을 못 찾았다. #13 은 student_uid 가 아예 NULL.
              사람이 «이 신청 = 이 계정» 이라고 정해 주는 길이 아예 없었다.
         [무엇] ① link_candidates — 전화번호·이름으로 후보 계정을 찾아 준다.
                   ⚠️ 관리자가 손으로 아이디를 치게 하면 오타 한 번에 **남의 학생**
                      기록이 오염된다. 후보를 보여 주고 고르게 한다.
                ② link_student  — 신청서 uid 를 바꾸고, **이미 만들어진 수업의
                   주인(class_schedules.user_id)도 같이 바꾼다.**
                   ⚠️ 신청서만 바꾸면 화면엔 연결된 것처럼 보이는데 수업은 여전히
                      lt15 것이라 학생 화면에 안 뜬다 — 강사 동기화에서 똑같은
                      함정을 이미 한 번 밟았다(바로 아래 teacherSync 주석 참조).
         ⚠️ 새 라우트를 만들지 않는다 — src/index.ts 는 사고 반경이 서비스 전체다.
         ⛔ 체험 계정(lt*) 행 자체는 지우지 않는다. 되돌릴 수 없는 일은 하지 않는다.
         ═══════════════════════════════════════════════════════════════════════ */
      if (String(b.action || '') === 'link_candidates' || String(b.action || '') === 'link_student') {
        const appRow: any = await env.DB.prepare(
          `SELECT id, student_name, student_uid, phone, schedule_id, desired_date, desired_time FROM leveltest_applications WHERE id = ? LIMIT 1`
        ).bind(Number(b.id)).first();
        if (!appRow) return json({ ok: false, error: 'not_found', message: '신청 건을 찾을 수 없습니다.', message_en: 'Application not found.' }, 404);

        const digits = (s: any) => String(s || '').replace(/[^0-9]/g, '');
        const isTrial = (u: any) => /^lt\d+(_\d+)?$/i.test(String(u || ''));

        if (String(b.action) === 'link_candidates') {
          const ph = digits(appRow.phone);
          const nm = String(appRow.student_name || '').trim();
          const rows: any[] = [];
          const seen = new Set<string>();
          const push = (r: any, why: string) => {
            const uid = String(r.user_id || '');
            if (!uid || seen.has(uid)) return;
            seen.add(uid);
            rows.push({
              user_id: uid,
              name: r.student_name || r.korean_name || r.english_name || r.username || uid,
              phone: r.student_phone || r.parent_phone || r.phone || null,
              status: r.status || null,
              is_trial: isTrial(uid),
              why,
            });
          };
          // ① 전화번호 — 가장 강한 단서. 하이픈 차이를 무시하려고 숫자만 비교한다.
          if (ph.length >= 9) {
            try {
              const rs = await env.DB.prepare(
                `SELECT user_id, student_name, korean_name, english_name, username, student_phone, parent_phone, phone, status
                   FROM students_erp
                  WHERE REPLACE(REPLACE(COALESCE(student_phone,''),'-',''),' ','') = ?
                     OR REPLACE(REPLACE(COALESCE(parent_phone,''),'-',''),' ','') = ?
                     OR REPLACE(REPLACE(COALESCE(phone,''),'-',''),' ','') = ?
                  LIMIT 20`
              ).bind(ph, ph, ph).all();
              (rs.results || []).forEach((r: any) => push(r, 'phone'));
            } catch {}
          }
          // ② 이름·아이디 — 정확히 같은 것만. 부분일치는 «Anna 가 HANNAH 에 붙는» 사고를 낸다.
          if (nm) {
            try {
              const rs = await env.DB.prepare(
                `SELECT user_id, student_name, korean_name, english_name, username, student_phone, parent_phone, phone, status
                   FROM students_erp
                  WHERE user_id = ? OR login_id = ? OR student_name = ? OR korean_name = ? OR english_name = ?
                  LIMIT 20`
              ).bind(nm, nm, nm, nm, nm).all();
              (rs.results || []).forEach((r: any) => push(r, 'name'));
            } catch {}
          }
          // ③ 관리자가 직접 친 아이디 — 있으면 그것도 확인해 준다(없으면 없다고 말한다)
          const typed = String(b.q || '').trim();
          let typedFound: any = null;
          if (typed) {
            try {
              const r: any = await env.DB.prepare(
                `SELECT user_id, student_name, korean_name, english_name, username, student_phone, parent_phone, phone, status
                   FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
              ).bind(typed, typed).first();
              if (r) { push(r, 'typed'); typedFound = String(r.user_id); }
            } catch {}
          }
          return json({
            ok: true,
            application: { id: appRow.id, student_name: appRow.student_name, student_uid: appRow.student_uid,
                           is_trial: isTrial(appRow.student_uid), phone: appRow.phone, schedule_id: appRow.schedule_id },
            typed_found: typed ? typedFound : undefined,
            candidates: rows,
          });
        }

        // ── 실제 연결 ──
        const newUid = String(b.student_uid || '').trim();
        if (!newUid) return invalidBody(['student_uid']);
        const target: any = await env.DB.prepare(
          `SELECT user_id, student_name, korean_name FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
        ).bind(newUid, newUid).first();
        if (!target) {
          return json({ ok: false, error: 'student_not_found',
            message: `«${newUid}» 계정을 찾지 못했습니다. 아이디를 확인해 주세요.`,
            message_en: `Account "${newUid}" was not found. Please check the ID.` }, 404);
        }
        const prevUid = appRow.student_uid || null;
        const now2 = Date.now();
        await env.DB.prepare(`UPDATE leveltest_applications SET student_uid = ?, updated_at = ? WHERE id = ?`)
          .bind(String(target.user_id), now2, Number(appRow.id)).run();
        // 수업 주인도 같이 옮긴다 — 안 옮기면 «연결됐는데 수업은 안 보이는» 상태가 된다
        let scheduleMoved: any = null;
        if (appRow.schedule_id) {
          try {
            await env.DB.prepare(`UPDATE class_schedules SET user_id = ?, updated_at = ? WHERE id = ?`)
              .bind(String(target.user_id), now2, Number(appRow.schedule_id)).run();
            scheduleMoved = { schedule_id: appRow.schedule_id, user_id: String(target.user_id) };
          } catch (e: any) { scheduleMoved = { schedule_id: appRow.schedule_id, error: String(e?.message || e).slice(0, 80) }; }
        }
        let actorName2 = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name) actorName2 = a.name; } catch {}
        try {
          await writeClassAudit(env, {
            action: 'leveltest_link_student', schedule_id: appRow.schedule_id || null,
            student_name: appRow.student_name || null,
            lesson_date: appRow.desired_date || null, lesson_time: appRow.desired_time || null,
            actor: actorName2, actor_role: 'admin', source: 'leveltest_app',
            detail: JSON.stringify({ app_id: appRow.id, from: prevUid, to: String(target.user_id), from_was_trial: isTrial(prevUid) }),
          });
        } catch {}
        return json({
          ok: true, app_id: appRow.id, from: prevUid, to: String(target.user_id),
          student_name: target.student_name || target.korean_name || String(target.user_id),
          schedule: scheduleMoved,
          prev_was_trial: isTrial(prevUid),
        });
      }

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
      // 📚 (2026-07-22) 추천 교재 / 다음 수업 안내 — 학부모 컴플레인 #6
      if (b.recommended_textbook != null) { fields.push('recommended_textbook = ?'); binds.push(String(b.recommended_textbook)); }
      if (b.next_class_guide != null)     { fields.push('next_class_guide = ?');     binds.push(String(b.next_class_guide)); }
      // 결과 확정(final_level)인데 추천 교재가 함께 오지 않으면 누락 경고를 응답에 실어 UI가 재확인하게 함
      if (!fields.length) return invalidBody(['status']);
      /* 🧹 (2026-08-13 사장님 지시) 취소·되돌리기 동기화를 위해 «바꾸기 전» 상태를 먼저 읽어 둔다 */
      let stPrev: any = null;
      if (b.status != null) {
        try {
          stPrev = await env.DB.prepare(
            `SELECT id, status, student_name, student_uid, desired_date, desired_time, assigned_teacher, schedule_id FROM leveltest_applications WHERE id = ? LIMIT 1`
          ).bind(Number(b.id)).first();
        } catch {}
      }
      fields.push('updated_at = ?'); binds.push(Date.now());
      binds.push(Number(b.id));
      await env.DB.prepare(`UPDATE leveltest_applications SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();

      /* ═══════════════════════════════════════════════════════════════════════
         🧹 (2026-08-13 사장님 지시) 「취소했는데 수업은 살아 있다 + 누가 했는지 기록이 없다」
         ───────────────────────────────────────────────────────────────────────
         실사례: 신청 #19(paul7038) 를 취소했는데
           · 연결 수업 #862 는 status='active' 그대로 → 강사 주간표·달력에 유령 수업
           · 취소가 어디에도 안 남아 「누가 했나」 를 DB 로도 답할 수 없었다
         [무엇]
           ① 취소(cancelled)      → 연결 수업도 status='cancelled' 로 함께 정리
           ② 되돌리기(→ pending·proposed·confirmed) → 취소해 뒀던 수업을 다시 active 로
           ③ 두 경우 모두 class_audit_log 에 누가·언제·왜 를 남긴다 (best-effort)
         ⚠️ done 으로의 변경은 수업을 되살리지 않는다 — 이미 지나간 수업이다. */
      let scheduleSync: any = undefined;
      if (b.status != null && stPrev) {
        try {
          const newSt = String(b.status);
          const prevSt = String(stPrev.status || '');
          const toCancel  = newSt === 'cancelled' && prevSt !== 'cancelled';
          const toRestore = prevSt === 'cancelled' && ['pending', 'proposed', 'confirmed'].includes(newSt);
          if (toCancel || toRestore) {
            let actorName = 'admin';
            try { const a = await getAdminActor(request, env as any); if (a?.name) actorName = a.name; } catch {}
            if (stPrev.schedule_id) {
              const sched: any = await env.DB.prepare(
                `SELECT id, status, scheduled_date, start_time FROM class_schedules WHERE id = ? LIMIT 1`
              ).bind(Number(stPrev.schedule_id)).first();
              if (sched && toCancel && String(sched.status || 'active') !== 'cancelled') {
                await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`)
                  .bind(Date.now(), Number(sched.id)).run();
                scheduleSync = { schedule_id: Number(sched.id), status: 'cancelled' };
              } else if (sched && toRestore && String(sched.status || '') === 'cancelled') {
                await env.DB.prepare(`UPDATE class_schedules SET status='active', updated_at=? WHERE id=?`)
                  .bind(Date.now(), Number(sched.id)).run();
                scheduleSync = { schedule_id: Number(sched.id), status: 'active' };
              }
            }
            await writeClassAudit(env, {
              action: toCancel ? 'cancel' : 'restore',
              schedule_id: stPrev.schedule_id || null,
              teacher_name: stPrev.assigned_teacher || null,
              student_name: stPrev.student_name || null,
              lesson_date: stPrev.desired_date || null,
              lesson_time: stPrev.desired_time || null,
              actor: actorName, actor_role: 'admin', source: 'leveltest_app',
              reason: toCancel ? '레벨테스트 신청 취소 (연결 수업 함께 정리)' : '레벨테스트 신청 되돌리기 (연결 수업 복구)',
              detail: JSON.stringify({ app_id: Number(b.id), from: prevSt, to: newSt, schedule_sync: scheduleSync || null }),
            });
          }
        } catch (e: any) { scheduleSync = { error: String(e?.message || e).slice(0, 80) }; }
      }

      /* 🔗 (2026-08-06) 강사를 바꿨으면 «이미 만들어진 수업»의 담당도 같이 바꾼다.
         [왜] 신청 즉시 수업이 자동으로 만들어지게 된 뒤로, 관리자가 목록에서 강사 드롭다운만
              바꾸면 **신청서와 수업의 담당이 어긋난다**. 화면에는 바꾼 이름이 보이니 바뀐 줄 알지만
              실제 수업은 옛 강사에게 남아, 새 강사 화면에는 영영 안 뜬다. 에러는 0.
              실제로 그렇게 됐다: 신청 #15 를 'Teacher Maimai' 로 바꿨는데 수업 #854 의 담당은
              BELLE 그대로였다 → 마이마이가 로그인해도 그 수업이 없다.
         ⚠️ 강사 번호는 신청서의 assigned_teacher_id(=teacher_profiles)를 쓰지 않는다. 그 번호는
            class_schedules 의 번호 체계(teachers.id)와 다른 사람을 가리킨다. 이름으로 되찾는다. */
      let teacherSync: any = undefined;
      if (b.assigned_teacher != null) {
        try {
          const appT: any = await env.DB.prepare(
            `SELECT id, schedule_id, assigned_teacher FROM leveltest_applications WHERE id = ? LIMIT 1`
          ).bind(Number(b.id)).first();
          if (appT?.schedule_id) {
            const normT = (s: any) => String(s || '').toLowerCase().replace(/teacher/g, '').replace(/[^a-z0-9가-힣]/g, '');
            const want = normT(appT.assigned_teacher);
            const ts: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE COALESCE(active,1) = 1`).all();
            const hit = (ts.results || []).find((r: any) => normT(r.name) === want);
            if (hit) {
              await env.DB.prepare(`UPDATE class_schedules SET teacher_id = ?, updated_at = ? WHERE id = ?`)
                .bind(String(hit.id), Date.now(), Number(appT.schedule_id)).run();
              teacherSync = { schedule_id: appT.schedule_id, teacher_id: String(hit.id), teacher: hit.name };
              /* 📜 (2026-08-12) 강사 교체가 이력에 안 남던 자리 —
                 「내 수업 강사가 언제 왜 바뀌었나」를 학생도 강사도 되짚을 수 없었다. */
              let _tsActor = 'admin';
              try { const _a = await getAdminActor(request, env as any); if (_a?.name) _tsActor = _a.name; }
              catch (e) { console.warn('[leveltest teacherSync] actor 조회 실패 — 감사기록에 이름 대신 admin 이 남습니다:', (e as any)?.message); }
              await writeClassAudit(env, {
                action: 'teacher_change', schedule_id: appT.schedule_id,
                teacher_name: hit.name || null,
                actor: _tsActor, actor_role: 'admin', source: 'leveltest_app',
                reason: '레벨테스트 신청서의 담당 강사 변경을 수업에 반영',
                detail: JSON.stringify({ app_id: appT.id, to_teacher_id: String(hit.id), to_teacher: hit.name }),
              });
            } else {
              // 못 찾으면 조용히 넘기지 않는다 — 화면은 «바뀐 것처럼» 보이는데 수업은 안 바뀐 상태다
              teacherSync = { schedule_id: appT.schedule_id, error: 'teacher_not_in_roster', candidate: appT.assigned_teacher };
            }
          }
        } catch (e: any) { teacherSync = { error: String(e?.message || e).slice(0, 80) }; }
      }

      // 📣 결과 확정 통보 — final_level 이 채워지는 순간 학부모/학생 번호로 1회 통보 (result_notified_at 으로 dedup)
      //    기존엔 접수/교사확정 알림만 있고 '결과' 통보가 없어 학부모가 결과·추천교재를 알 수 없었음.
      let resultNotify: any = undefined;
      if (b.final_level != null || b.recommended_textbook != null || b.next_class_guide != null) {
        try {
          const app2: any = await env.DB.prepare(`SELECT * FROM leveltest_applications WHERE id = ? LIMIT 1`).bind(Number(b.id)).first();
          // 레벨 + 추천 교재가 모두 채워진 시점에 1회만 발송 — 교재 없는 반쪽 결과 문자는 보내지 않는다
          if (app2 && app2.phone && !app2.result_notified_at && app2.final_level && String(app2.recommended_textbook || '').trim()) {
            const book = String(app2.recommended_textbook || '').trim();
            const guide = String(app2.next_class_guide || '').trim();
            const lines = [
              `[망고아이] ${app2.student_name}님 레벨테스트 결과가 나왔어요! 🎉`,
              `📊 레벨: ${app2.final_level}`,
            ];
            if (book) lines.push(`📚 추천 교재: ${book}`);
            if (guide) lines.push(`▶ 다음 단계: ${guide}`);
            lines.push(`정규 수업 상담: pf.kakao.com/_xlqnSxd`);
            const r = await sendPlainSms(env, app2.phone, lines.join('\n'));
            resultNotify = r && r.ok ? 'sent' : (r && (r.error || r.message)) || 'failed';
            if (r && r.ok) {
              await env.DB.prepare(`UPDATE leveltest_applications SET result_notified_at = ? WHERE id = ?`).bind(Date.now(), Number(b.id)).run();
            }
          }
        } catch (e: any) { resultNotify = 'error:' + String(e?.message || e).slice(0, 80); }
      }
      const missingBook = (b.final_level != null) && !String(b.recommended_textbook || '').trim();
      return json({ ok: true, result_notify: resultNotify, teacher_sync: teacherSync, schedule_sync: scheduleSync, warn: missingBook ? 'recommended_textbook_missing' : undefined });
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
    // 📚 확정 파이프라인 (.../:id/plan · .../:id/activate) — 아래 단순 CRUD 보다 먼저 잡는다
    //   ⚠️ 경로가 맞을 때만 actor 를 조회한다 — 여기는 관리자 API 가 전부 지나가는 길목이라
    //      무조건 getAdminActor() 를 부르면 호출마다 DB 왕복이 한 번씩 더 붙는다.
    if (/^\/api\/admin\/enrollments\/\d+\/(plan|activate)$/.test(path)) {
      const _actor = await getAdminActor(request, env).catch(() => null);
      const _act = await handleEnrollActivateApi(request, url, env, (_actor && _actor.username) || 'admin');
      if (_act) return _act;
    }
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
      // 🧑‍🏫 (2026-08-12) 등록 화면에서 «강사 이름 지정» 칸을 없애는 대신 남기는 값.
      //   'schedule' = 요일·시간 우선 / 'teacher' = 강사 적합도 우선. 「▸ 처리」 단계가 읽는다.
      await _addEnrCol2('assign_priority', 'TEXT');
      // 🗓️ (2026-08-14) ⑥ 수업 기간(회차) — '1' | '3' | '6' | '12' | 'unlimited'.
      //   숫자 개월이면 클라이언트가 시작일 + N개월을 end_date/ended_at 으로 같이 보내 온다.
      //   TEXT 인 이유: 'unlimited' 를 0·NULL 로 눌러 두면 «안 고른 것» 과 구분이 안 된다.
      await _addEnrCol2('duration_months', 'TEXT');
      // ⏱ (2026-08-26 사장님 지시) 수업 시간(분) — 20/30/40 중 선택, 안 고르면 기본 20분.
      //   enroll-activate.ts 의 buildEnrollPlan() 이 이 컬럼을 읽어 class_schedules.duration_min 을 정한다.
      await _addEnrCol2('duration_min', 'INTEGER');
      // 💰 (2026-08-26 사장님 지시) 곱하기 «전» 20분 기준가. `monthly_fee_krw` 는 «이미 곱해진 최종값» 이라
      //   되돌아볼 근거가 사라진다 — 그래서 기준가를 따로 남긴다(감사·재계산용).
      await _addEnrCol2('base_fee_krw', 'INTEGER');
      // 그 기준가를 «사람이 적었는지 · 대리점 단가로 자동으로 세웠는지». 후자는 아무도 치지 않은
      //   금액이라 확정 화면이 그렇게 말해 줘야 한다 — 추측하지 않도록 저장해 둔다.
      await _addEnrCol2('fee_source', 'TEXT');
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
      // 🥭 2026-08-08 — 요일·시간·인원방식·수업유형·강사를 여기서 «버리고» 있었다.
      //   등록 폼(Phase 24 다중 등록표)과 파일/카톡 import 는 이 값들을 다 받아 CSV 로
      //   내보내기까지 했는데, INSERT 목록에 없어서 DB 에는 한 번도 들어간 적이 없다.
      //   그래서 목록 표가 «패키지» 말고는 보여줄 것이 없었다. (컬럼은 위에서 이미 보강함)
      const _prio = b.assign_priority === 'teacher' ? 'teacher' : 'schedule';
      // 🗓️ (2026-08-14) ⑥ 수업 기간 — 화면이 보내는 값만 받는다. 모르는 값은 저장하지 않는다
      //   (오타·옛 폼이 보낸 쓰레기가 그대로 남으면 나중에 회차 계산이 조용히 틀어진다).
      //   🗓️ (2026-08-20 사장님 지시) 1·3·6·12 «수강권 단위» 만 받던 것을 **1~12** 로 넓혔다.
      //     2개월·4개월·5개월짜리를 넣을 방법이 아예 없었고, 화면에서 골라도 여기서 걸려
      //     **에러 없이 null** 이 되므로 「분명 골랐는데 기간이 비어 있다」가 된다.
      //   ⚠️ 화면 목록(`adm-core.js` 의 `durOptionsList`)과 **짝**이다. 한쪽만 넓히면 그 조용한 null 이 그대로 재현된다.
      const _durRaw = b.duration_months == null ? '' : String(b.duration_months).trim();
      const _dur = (_durRaw === 'unlimited' || /^([1-9]|1[0-2])$/.test(_durRaw)) ? _durRaw : null;
      // ⏱ (2026-08-26 사장님 지시) 수업 시간(분) — 화면 목록(adm-core.js 의 classMinOptionsList)과 짝.
      //   모르는 값은 저장하지 않는다(null) — enroll-activate.ts 의 buildEnrollPlan() 이 null 이면
      //   기본 20분(DEFAULT_CLASS_MINUTES)으로 읽으므로 «안 고름» 과 «모르는 값» 이 같은 결과가 된다.
      const _classMin = ALLOWED_CLASS_MINUTES.includes(Number(b.duration_min)) ? Number(b.duration_min) : null;
      /* 💰 (2026-08-26 사장님 지시) 월 수강료 = 20분 기준가 × 길이배수 (10원 절사).
         ⛔ **여기가 곱하는 유일한 자리다.** 저장 뒤 `monthly_fee_krw` 는 이미 곱해진 최종값이라
            확정 단계·정기결제 예약·CSV·워드 요약 어디서도 다시 곱하지 않는다.
         ⚠️ 기준가가 없으면 대리점 단가(`priceForUid`) × 주 횟수로 세운다. 그것도 못 구하면
            **지어내지 않고 null** — 확정 단계가 예전 그대로 「월 수강료가 0원입니다」 로 멈춘다.
         ⚠️ 단가 조회는 try/catch 로 감싼다: 요금을 못 구한다고 등록 자체가 막히면 안 된다. */
      let _w1 = 0;
      if (!(Number(b.monthly_fee_krw) > 0) && b.student_user_id) {
        try { _w1 = Number((await priceForUid(env, String(b.student_user_id)))?.weekly1Price) || 0; }
        catch (e: any) { console.warn('[enroll fee] 대리점 단가 조회 실패:', e?.message || e); }
      }
      const _fee = computeMonthlyFee({
        baseFeeKrw: b.monthly_fee_krw,
        minutes: _classMin,
        weekly1Price: _w1,
        weekly: weeklyCountFromDays(b.days_of_week),
      });
      const r = await env.DB.prepare(
        `INSERT INTO enrollments (student_user_id, student_name, package, started_at, ended_at, monthly_fee_krw, status, notes, created_at, updated_at, days_of_week, time, class_size, type, teacher_name, end_date, assign_priority, duration_months, duration_min, base_fee_krw, fee_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.student_user_id || null, b.student_name, b.package,
        b.started_at ? Number(b.started_at) : now,
        b.ended_at ? Number(b.ended_at) : null,
        _fee.monthlyFeeKrw,
        b.status || 'pending', b.notes || null, now, now,
        b.days_of_week || null, b.time || null, b.class_size || null,
        b.type || null, b.teacher_name || null, b.end_date || null,
        _prio, _dur, _classMin, _fee.baseFeeKrw, _fee.source
      ).run();
      // 화면이 «얼마로 잡혔는지» 를 그 자리에서 보여 줄 수 있게 계산 결과를 함께 돌려준다
      return json({ ok: true, id: r.meta.last_row_id, fee: _fee });
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

    /* 🗑️ DELETE — 수강신청 삭제 (2026-08-21, 사장님 지시: 수강신청 목록의 데모 항목 정리)
       ⛔ 본사만. `canEditOrg()`는 강사(scope 'none')까지 통과시키는 함정이 있어(CLAUDE.md
          trap) 쓰지 않는다 — 위 leveltest_applications 삭제와 같은 role==='hq'|'staff' 패턴.
       ⚠️ 되돌릴 수 없다. 확정·활성화된 신청은 enroll-activate.ts 가
          `class_schedules.source = 'adm-enroll:<id>'` 로 실제 수업을 만든다 — 신청서만
          지우면 강사·학생 달력에 담당 없는 유령 수업이 남는다. 삭제 전에 그 수업들을
          먼저 cancelled 로 정리한다(위 레벨테스트 삭제와 같은 이유). */
    if (method === 'DELETE' && (path === '/api/admin/enrollments' || /^\/api\/admin\/enrollments\/\d+$/.test(path))) {
      const actor = await getAdminActor(request, env as any);
      if (!actor.ok || actor.isTeacher || !(actor.role === 'hq' || actor.role === 'staff')) {
        return json({ ok: false, error: 'forbidden_scope', message: '수강신청 삭제는 본사만 할 수 있습니다.', message_en: 'Only HQ accounts can delete enrollments.' }, 403);
      }
      const pathId = path.match(/^\/api\/admin\/enrollments\/(\d+)$/);
      const delBody: any = await parseJsonBody(request).catch(() => null);
      const idsParam = url.searchParams.get('ids') || url.searchParams.get('id');
      let ids: number[] = [];
      if (pathId) ids = [Number(pathId[1])];
      else if (delBody && Array.isArray(delBody.ids)) ids = delBody.ids.map((x: any) => Number(x));
      else if (delBody && delBody.id != null) ids = [Number(delBody.id)];
      else if (idsParam) ids = idsParam.split(',').map((s: string) => Number(s.trim()));
      ids = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));
      if (!ids.length) return invalidBody(['id']);
      if (ids.length > 90) return json({ ok: false, error: 'too_many', message: '한 번에 최대 90건까지 삭제할 수 있습니다.' }, 400);

      let actorName = 'admin';
      try { if (actor.name) actorName = actor.name; } catch {}
      const deleted: number[] = [];
      const notFound: number[] = [];
      for (const id of ids) {
        const row: any = await env.DB.prepare(`SELECT id, student_name FROM enrollments WHERE id = ? LIMIT 1`).bind(id).first();
        if (!row) { notFound.push(id); continue; }
        try {
          await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=? WHERE source = ? AND status != 'cancelled'`)
            .bind(Date.now(), 'adm-enroll:' + id).run();
        } catch (e: any) { console.warn('[enrollments delete] schedule cancel skipped:', e?.message || e); }
        try {
          await writeClassAudit(env, {
            action: 'delete', student_name: row.student_name || null,
            actor: actorName, actor_role: 'admin', source: 'enrollment',
            reason: '수강신청 삭제 (연결 수업 취소 처리)',
            detail: JSON.stringify({ enrollment_id: id }),
          });
        } catch {}
        await env.DB.prepare(`DELETE FROM enrollments WHERE id = ?`).bind(id).run();
        deleted.push(id);
      }
      return json({ ok: true, deleted, not_found: notFound });
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
      /* 🎯 (2026-08-26) 학생에게도 보낼 수 있게 되면서 «누구에게 갔나» 가 두 종류가 됐다.
         target_teacher_uid 칸은 이름과 달리 학생 uid 도 담는다(NOT NULL 이라 비울 수 없고,
         이미 쌓인 기록의 뜻을 바꾸지 않으려고 칸을 새로 만들지 않았다). 대신 역할을 옆에 적는다.
         ⚠️ 이미 있으면 ALTER 가 에러를 내므로 삼킨다 — «배포 실패» 가 아니다. */
      try { await env.DB.exec(`ALTER TABLE admin_whispers ADD COLUMN target_role TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE admin_whispers ADD COLUMN target_name TEXT;`); } catch {}
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

    // ── ④ POST /api/admin/whisper/send — 귓속말 전송 (강사 전원 · 또는 콕 집은 한 사람) ──
    if (method === 'POST' && path === '/api/admin/whisper/send') {
      await ensureAdminControlSchema();
      const b: any = await request.json().catch(() => ({}));
      const adminUid = String(b.admin_uid || '').trim();
      const roomId = String(b.room_id || '').trim();
      const teacherUid = String(b.teacher_uid || '').trim();
      const messageType = String(b.message_type || 'text').trim();
      const payload = String(b.payload || '').trim();
      const urgency = String(b.urgency || 'normal').trim();
      /* 🎯 (2026-08-26 사장님 지시) 학생에게도 보낼 수 있게 — 화면이 참가자를 콕 집으면 온다.
         ⚠️ 비어 있으면 지금까지와 «한 글자도 다르지 않게» 강사 전원에게 간다(옛 화면 호환). */
      const targetUid  = String(b.target_uid || '').trim();
      const targetName = String(b.target_name || '').trim();
      const targetRole = String(b.target_role || '').trim().toLowerCase() === 'teacher' ? 'teacher' : 'student';
      const directed = !!(targetUid || targetName);
      /* 기록의 «누구에게» 칸 — 대상을 골랐으면 그 사람, 아니면 지금까지처럼 강사. */
      const logUid = directed ? (targetUid || targetName) : teacherUid;
      if (!adminUid || !roomId || !logUid || !payload) return json({ ok: false, error: 'fields_required' }, 400);
      if (!['text', 'audio', 'hint'].includes(messageType)) return json({ ok: false, error: 'invalid_message_type' }, 400);

      const r: any = await env.DB.prepare(
        `INSERT INTO admin_whispers (admin_uid, room_id, target_teacher_uid, target_role, target_name, message_type, payload, urgency, sent_at) VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(adminUid, roomId, logUid, directed ? targetRole : 'teacher', targetName || null, messageType, payload, urgency, Date.now()).run();
      const whisperId = r.meta?.last_row_id;
      await writeAudit(adminUid, 'whisper_send', { room: roomId, user: logUid, meta: { type: messageType, urgency, len: payload.length, directed, role: directed ? targetRole : 'teacher' } });

      /* 📢 실제 전달  (2026-08-19 Melca 8/19 제보 2-③)
         ═══════════════════════════════════════════════════════════════════════
         [전에는] 여기 `// GM-4 미구현: 실제 WebSocket push 는 추후` 라는 주석과 함께
            D1 기록만 하고 끝났다. 응답은 늘 delivery_status:'queued' 였고 **강사 화면에는
            한 번도 도착하지 않았다.** 화면에는 보내기 버튼이 있어 «보냈다» 로 보였다.
            (제보 원문: "Chat is not visible as observer send message at the classroom")
         [이제] 그 방의 VideoCallRoom DO 로 밀어 넣는다. DO 가 staff 소켓에만 보낸다.
         ⚠️ 실패해도 **기록은 남긴다** — 위 INSERT 는 이미 끝났다. 「보내려 했다」는 사실은
            감사 로그의 값어치가 있고, 전달 여부는 delivery_status 로 정직하게 구분한다.
         ⚠️ 방이 비어 있으면 delivered:0 이다. 그때는 'queued' 로 답한다 —
            «보낸 척» 하면 관리자가 강사가 받은 줄 알고 기다린다. */
      let delivered = 0, deliverErr: string | null = null, resolvedBy = '';
      try {
        const doId = (env as any).VIDEO_CALL_ROOM.idFromName(roomId);
        const stub = (env as any).VIDEO_CALL_ROOM.get(doId);
        const resp = await stub.fetch(`https://internal/whisper?roomId=${encodeURIComponent(roomId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload, message_type: messageType, urgency, from: adminUid,
            /* 대상을 골랐을 때만 싣는다 — 비면 DO 가 지금까지처럼 강사 전원에게 보낸다.
               ⚠️ 번호(to)와 이름(to_name)을 둘 다 넘긴다: 번호는 재접속하면 죽고
                  이름은 겹칠 수 있어서, DO 가 번호 → 이름(유일할 때만) 순으로 찾는다. */
            ...(directed ? { to: targetUid, to_name: targetName } : {}),
          }),
        });
        const d: any = await resp.json().catch(() => null);
        delivered = Number(d?.delivered || 0);
        resolvedBy = String(d?.resolved_by || '');
      } catch (e: any) {
        deliverErr = String(e?.message || e);
        console.warn('[whisper] DO push 실패:', deliverErr);
      }

      if (delivered > 0) {
        try {
          await env.DB.prepare(`UPDATE admin_whispers SET delivered_at = ? WHERE id = ?`)
            .bind(Date.now(), whisperId).run();
        } catch { /* 기록 갱신 실패가 «전달됐다» 를 뒤집지는 않는다 */ }
      }

      return json({
        ok: true, whisper_id: whisperId,
        delivery_status: delivered > 0 ? 'delivered' : 'queued',
        delivered,
        ...(deliverErr ? { deliver_error: deliverErr } : {}),
        ...(directed ? { directed: true, target_role: targetRole, resolved_by: resolvedBy } : {}),
        /* «보낸 척» 하지 않는다 — 왜 못 갔는지까지 말해 준다.
           특히 ambiguous_name 은 «같은 이름이 둘» 이라 일부러 안 보낸 것이다.
           이때 관리자가 「전달됐겠지」 로 읽으면 학생은 영영 못 받는다. */
        note: delivered > 0
          ? (directed
              ? ((targetName || logUid) + ' 님 화면에 전달했습니다.')
              : '강사 화면에 전달했습니다.')
          : (directed
              ? (resolvedBy === 'ambiguous_name'
                  ? '같은 이름이 둘 이상이라 잘못 보낼 위험이 있어 보내지 않았습니다(기록은 남았습니다).'
                  : (targetName || logUid) + ' 님이 지금 그 방에 접속해 있지 않아 전달되지 않았습니다(기록은 남았습니다).')
              : '지금 그 방에 강사가 접속해 있지 않아 전달되지 않았습니다(기록은 남았습니다).'),
      });
    }

    // ── ⑤ GET /api/admin/whisper/logs — 귓속말 로그 ──
    if (method === 'GET' && path === '/api/admin/whisper/logs') {
      await ensureAdminControlSchema();
      const roomId = url.searchParams.get('room_id');
      let q = `SELECT id, admin_uid, room_id, target_teacher_uid, target_role, target_name, message_type, payload, urgency, sent_at, delivered_at, read_at FROM admin_whispers`;
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

    /* ═══════════════════════════════════════════════════════════════════════
       🎙 강사가 «이 수업 AI 리포트 만들어 주세요» 하고 요청하는 창구 (2026-08-15)

       왜 이렇게 만들었나 —
         AI 학습 리포트는 녹음을 60초 조각으로 잘라 전사해야 하는데, 그 일은 **브라우저**
         가 한다(adm-r4.js). 45분 수업이면 업로드가 약 86MB 라 강사 회선(필리핀·정전·태풍)
         에서는 사실상 못 돌린다. 서버가 대신 하는 길도 지금은 막혀 있다:
           · 녹화본은 R2 에 video/webm 으로 있고 Whisper 는 webm 영상을 못 받는다
           · Worker 에는 오디오 디코더가 없다(브라우저의 OfflineAudioContext 에 해당하는 것이 없다)
         그래서 «강사는 요청만, 실행은 회선 좋은 사무실» 로 나눴다. 요청 본문은 200바이트 안쪽이라
         회선이 나빠도 나간다. 사무실은 관리자 화면의 기존 [🚀 AI 리포트 자동 생성] 을 그대로 쓴다
         (그 카드는 이미 R2 녹음ID 를 받아 브라우저에서 조각내 전사한다).

       ⚠️ 왜 새 표를 안 만들었나 — 요청을 보여 줄 화면이 필요한데, admin.html 은 공동작업 충돌
          반경이 커서 손대지 않기로 했다. 대신 **이미 있는 room_alerts + 실시간 알림 센터**에 얹는다.
          알림 목록은 모르는 alert_type 도 그대로 렌더하고, 「✓ 확인」 처리도 이미 있다.
       ⚠️ severity 는 반드시 'low' — adm-core.js 의 「진행 중인 수업」 표가 **미확인 알림**을
          room_id 로 매핑해 «이상감지» 표시에 쓴다. 끝난 수업은 그 목록에 없어 보통은 안 걸리지만,
          수업 직후 방이 남아 있으면 잠깐 뜰 수 있다. 색이라도 낮춰 둔다.
       ═══════════════════════════════════════════════════════════════════════ */
    // ── POST /api/admin/feedback-drafts/report-request — 강사가 리포트 요청 ──
    //   ℹ️ 경로를 /api/admin/feedback-drafts/ 아래에 둔 것은 우연이 아니다. index.ts 인증게이트와
    //      api-mango 위임가드가 **둘 다 startsWith('/api/admin/feedback-drafts')** 라,
    //      여기 붙이면 금지구역(src/index.ts)을 한 줄도 안 고치고 새 API 가 산다.
    if (method === 'POST' && path === '/api/admin/feedback-drafts/report-request') {
      await ensureAdminControlSchema();
      const b: any = await request.json().catch(() => ({}));
      const roomId = String(b.room_id || '').trim();
      if (!roomId) return json({ ok: false, error: 'room_id_required' }, 400);

      // 🔐 강사 로그인이면 남의 이름으로 요청하지 못하게 본인 것으로 강제(초안 생성과 같은 규칙)
      const _rrActor = await getAdminActor(request, env as any);
      let teacherName = String(b.teacher_name || '').trim();
      if (_rrActor.isTeacher) {
        if (!_rrActor.name) return json({ ok: false, error: 'teacher_identity_missing' }, 403);
        teacherName = _rrActor.name;
      }

      // 같은 수업을 두 번 요청해도 알림이 두 줄 쌓이지 않게 — 아직 «확인» 안 된 요청이 있으면 그걸 돌려준다.
      //   (강사가 회선이 끊긴 줄 알고 다시 누르는 일이 실제로 잦다)
      const dup: any = await env.DB.prepare(
        `SELECT id FROM room_alerts WHERE room_id = ? AND alert_type = 'report_request' AND acknowledged_at IS NULL ORDER BY triggered_at DESC LIMIT 1`
      ).bind(roomId).first().catch(() => null);
      if (dup) return json({ ok: true, already: true, alert_id: dup.id, room_id: roomId });

      const detail = {
        kind: 'AI 학습 리포트 요청',
        teacher: teacherName || null,
        student: String(b.student_name || '').trim() || null,
        student_uid: String(b.student_uid || '').trim() || null,
        lesson_date: String(b.lesson_date || '').trim() || null,
        start_time: String(b.start_time || '').trim() || null,
        recording_id: String(b.recording_id || '').trim() || null,
        note: String(b.note || '').trim().slice(0, 300) || null,
      };
      const r: any = await env.DB.prepare(
        `INSERT INTO room_alerts (room_id, alert_type, severity, detail, triggered_at) VALUES (?,?,?,?,?)`
      ).bind(roomId, 'report_request', 'low', JSON.stringify(detail), Date.now()).run();
      return json({ ok: true, already: false, alert_id: r.meta?.last_row_id, room_id: roomId });
    }

    // ── GET /api/admin/feedback-drafts/report-requests — 요청 목록 ──
    //   강사는 «자기 것만», 본사·매니저는 전부 본다(강사가 자기 요청 상태를 확인할 수 있어야 한다).
    if (method === 'GET' && path === '/api/admin/feedback-drafts/report-requests') {
      await ensureAdminControlSchema();
      const rs: any = await env.DB.prepare(
        `SELECT id, room_id, severity, detail, triggered_at, acknowledged_by, acknowledged_at
           FROM room_alerts WHERE alert_type = 'report_request'
          ORDER BY triggered_at DESC LIMIT 100`
      ).all().catch(() => ({ results: [] }));

      const _rlActor = await getAdminActor(request, env as any);
      const rows = ((rs.results || []) as any[]).map((row) => {
        let d: any = {};
        try { d = JSON.parse(String(row.detail || '{}')) || {}; } catch { d = {}; }
        return {
          id: row.id, room_id: row.room_id,
          teacher: d.teacher || null, student: d.student || null,
          lesson_date: d.lesson_date || null, start_time: d.start_time || null,
          recording_id: d.recording_id || null, note: d.note || null,
          requested_at: row.triggered_at,
          done_at: row.acknowledged_at || null, done_by: row.acknowledged_by || null,
          status: row.acknowledged_at ? 'done' : 'pending',
        };
      });
      const mine = _rlActor.isTeacher
        ? rows.filter((x) => x.teacher && sameTeacherName(String(x.teacher), String(_rlActor.name || '')))
        : rows;
      return json({ ok: true, rows: mine });
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
        // GET latest — 최근 N개 또는 단건
        //   ⚡ (2026-08-08) 조회 경로에서 CREATE TABLE 을 걷어냈다. 읽을 때마다 DDL 왕복을 한 번 더 하고 있었고,
        //      표가 없으면 아래 SELECT 가 알아서 실패하므로 빈 목록으로 돌려주면 된다.
        if (method === 'GET' && path === '/api/admin/briefing/latest') {
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '1'), 30);
          let rs: any = { results: [] };
          try {
            rs = await env.DB.prepare(`SELECT id, briefing_date, briefing_text, stats, created_at FROM daily_briefings ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
          } catch { /* 표가 아직 없음 → 빈 목록 */ }
          const items = (rs.results || []).map((r: any) => { let st = null; try { st = r.stats ? JSON.parse(r.stats) : null; } catch {} return { ...r, stats: st }; });
          return json({ ok: true, items });
        }

        await env.DB.exec(`CREATE TABLE IF NOT EXISTS daily_briefings (id INTEGER PRIMARY KEY AUTOINCREMENT, briefing_date TEXT NOT NULL, briefing_text TEXT NOT NULL, stats TEXT, created_at INTEGER NOT NULL);`);

        // POST generate — 어제 데이터 집계 + AI 작문
        //
        // 🕒 (2026-08-08 수정) 날짜가 이틀 밀리던 것 —
        //   cron 은 "0 18 * * *"(UTC) = KST 03:00 에 돈다. 그런데 여기서 `now - 24h` 를 UTC 로 잘라 쓰니,
        //   KST 8일 새벽에 돌면 UTC 로는 아직 7일 18시 → 하루 빼면 6일 → "어제"가 그저께가 됐다.
        //   (화면에 오늘이 08-08 인데 브리핑 날짜가 08-06 으로 찍히던 원인)
        //   → KST(UTC+9) 로 옮겨 놓고 날짜를 자른 뒤, 집계 구간도 KST 하루로 잡는다.
        const KST = 9 * 3600000;
        const now = Date.now();
        const kstNow = now + KST;
        const kstTodayStr = new Date(kstNow).toISOString().slice(0, 10);
        const yesterdayStr = new Date(kstNow - 86400000).toISOString().slice(0, 10);
        // KST 하루의 시작/끝을 UTC 타임스탬프로 (KST 00:00 = 그 날짜의 UTC 00:00 − 9h)
        const todayStartTs = new Date(yesterdayStr + 'T00:00:00.000Z').getTime() - KST;
        const todayEndTs = todayStartTs + 86400000;

        // 🔁 같은 날짜 브리핑이 이미 있으면 그대로 돌려준다 (force=1 이면 새로 만든다).
        //   지금까지 「지금 생성」을 누를 때마다 Llama 70B 를 호출하고 D1 에 행을 새로 쌓았다.
        //   자동 cron 이 하루 두 번 불려도 중복 생성되지 않게 하는 안전장치이기도 하다.
        const force = url.searchParams.get('force') === '1';
        if (!force) {
          try {
            const dup: any = await env.DB.prepare(
              `SELECT briefing_date, briefing_text, stats FROM daily_briefings WHERE briefing_date = ? ORDER BY created_at DESC LIMIT 1`
            ).bind(yesterdayStr).first();
            if (dup) {
              let st = null; try { st = dup.stats ? JSON.parse(dup.stats) : null; } catch {}
              return json({ ok: true, cached: true, briefing_text: dup.briefing_text, stats: st, briefing_date: dup.briefing_date });
            }
          } catch {}
        }

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

        // 3) 미납 «학생 수»
        //   ⚠️ (2026-08-08 수정) 여기만 `payments` 라는 별개 표를 보고 있었다. 심지어 없으면 만들어서
        //      거의 빈 표를 세고 있었다. 운영 KPI 대시보드(/api/admin/kpi/dashboard)는 `student_payments`
        //      기준으로 «35일 넘게 결제 기록이 없는 활성 학생 수» 를 미납으로 센다.
        //      같은 «미납» 이라는 말이 두 화면에서 다른 숫자였다 → KPI 쪽 정의로 통일한다.
        let overdueCount = 0;
        try {
          const cutoff35 = now - 35 * 86400000;
          const r: any = await env.DB.prepare(
            `SELECT COUNT(DISTINCT s.user_id) AS n FROM students_erp s
              WHERE (s.status IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')
                AND s.user_id NOT IN (SELECT user_id FROM student_payments WHERE status='paid' AND paid_at >= ?)`
          ).bind(cutoff35).first();
          overdueCount = r?.n || 0;
        } catch {}

        // 4) 2주 이상 결석한 학생 수
        //   🔴 (2026-08-08 수정) 원래 쿼리는 `WHERE joined_at < (now-14일)` 이었다.
        //      이건 «14일 전에 한 번이라도 출석한 적 있는 모든 사람» 이라, 그 뒤 매일 나와도 포함된다.
        //      즉 사실상 전교생 수가 나왔다(화면에 2,809 로 찍히던 값). 주석은 «최근 14일간 결석» 이었지만
        //      정작 그 조건이 쿼리에 없었다.
        //      → 사람마다 «마지막 출석» 을 구한 뒤, 그게 14일보다 오래된 사람만 센다.
        let atRiskCount = 0;
        try {
          const r: any = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM (
               SELECT user_id, MAX(joined_at) AS last_at
                 FROM attendance
                WHERE role = 'student' OR role IS NULL
                GROUP BY user_id
             ) WHERE last_at < ?`
          ).bind(now - 14 * 86400000).first();
          atRiskCount = r?.n || 0;
        } catch {}

        // 5) 출석률 (어제 기준 — 활성 학생 수 대비 출석한 학생 수)
        //   분자는 `attendance.date`(KST 'YYYY-MM-DD') 기준. 위 KST 보정으로 이제 진짜 «어제» 를 본다.
        //   분모(활성 학생)는 KPI 대시보드의 «활동 학생» 과 같은 조건을 그대로 쓴다 — 두 화면이 어긋나지 않게.
        let attendanceRate: number | null = null;
        let attendedYesterday = 0, activeStudents = 0;
        try {
          const att: any = await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM attendance WHERE date = ?`).bind(yesterdayStr).first();
          attendedYesterday = att?.n || 0;
          const tot: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE status IN ('정상','활동','active') OR status IS NULL OR status = ''`).first();
          activeStudents = tot?.n || 0;
          if (activeStudents > 0) attendanceRate = Math.round((attendedYesterday / activeStudents) * 100);
        } catch {}

        // 6) 최근 7일 평가 평균
        //   🔴 (2026-08-08 수정) 평가가 한 건도 없으면 AVG 가 NULL 인데 `|| 0` 으로 0 을 넣고 있었다.
        //      «0점» 과 «자료 없음» 은 완전히 다른 말인데, AI 가 이걸 «평균 0점으로 낮다» 고 보고했다.
        //      → 자료가 없으면 null 로 둔다. 아래 프롬프트·화면은 null 을 «자료 없음» 으로 다룬다.
        let recentEvalAvg: number | null = null;
        let recentEvalCount = 0;
        try {
          const r: any = await env.DB.prepare(
            `SELECT AVG(score_overall) AS a, COUNT(*) AS n FROM student_evaluations WHERE created_at >= ?`
          ).bind(now - 7 * 86400000).first();
          recentEvalCount = r?.n || 0;
          if (recentEvalCount > 0 && r?.a != null) recentEvalAvg = Math.round(r.a * 10) / 10;
        } catch {}

        const stats = {
          date: yesterdayStr,
          generated_for_kst: kstTodayStr,
          new_enrollment: newEnroll,
          new_inquiry: newInquiry,
          overdue_count: overdueCount,          // 미납 «학생 수» (KPI 대시보드와 같은 정의)
          at_risk_count: atRiskCount,           // 마지막 출석이 14일 이전인 학생 수
          attendance_rate: attendanceRate,      // null = 산출 불가
          attended_yesterday: attendedYesterday,
          active_students: activeStudents,
          recent_eval_avg: recentEvalAvg,       // null = 최근 7일 평가 없음
          recent_eval_count: recentEvalCount,
        };

        // AI 작문 — 친근한 한국어 5-7문장 브리핑
        //
        // 🔴 (2026-08-08) 여기가 가장 위험한 자리였다.
        //   위 집계에 «자료 없음» 이 섞여도 프롬프트는 그걸 숫자 0 으로 넘겼고, 지시문이
        //   «우려되는 부분은 부드럽게 짚어주세요» 였다. 그래서 AI 는 «평가 평균 0점으로 낮습니다»,
        //   «출석률 1%로 낮게 유지되고 있습니다» 같은 문장을 아주 차분하게 써 냈다.
        //   숫자가 틀린 줄 모르는 사람이 읽으면 학원이 무너지는 줄 안다.
        //   → 자료가 없는 항목은 아예 «자료 없음» 이라고 적어 보내고, 그 항목은 평가하지 말라고 못 박는다.
        const evalLine = (recentEvalAvg == null)
          ? `- 최근 7일 평가 평균: 자료 없음 (7일 내 작성된 평가서 0건)`
          : `- 최근 7일 평가 평균: ${recentEvalAvg}점 (${recentEvalCount}건)`;
        const attLine = (attendanceRate == null)
          ? `- 어제 출석률: 자료 없음`
          : `- 어제 출석률: ${attendanceRate}% (${attendedYesterday}/${activeStudents}명)`;
        let briefingText = '';
        try {
          if (env.AI) {
            const prompt = `다음은 어제(${yesterdayStr}, 한국시간) 망고아이 학원의 운영 데이터입니다.\n\n`
              + `- 신규 등록: ${newEnroll}명\n`
              + `- 신규 상담: ${newInquiry}건\n`
              + `- 미납 학생: ${overdueCount}명 (35일 넘게 결제 기록이 없는 활성 학생)\n`
              + `- 2주 이상 결석한 학생: ${atRiskCount}명\n`
              + `${attLine}\n`
              + `${evalLine}\n\n`
              + `원장님께 드리는 아침 브리핑을 5-7문장으로 따뜻하고 명료한 한국어 존댓말로 작성해 주세요.\n`
              + `좋은 점은 칭찬하고, 우려되는 부분은 부드럽게 짚어주며 오늘 우선 챙겨야 할 액션 1-2개를 제안하세요.\n\n`
              + `[반드시 지킬 것]\n`
              + `1. 위에 적힌 숫자만 사용하세요. 없는 숫자를 지어내지 마세요.\n`
              + `2. "자료 없음"이라고 적힌 항목은 0이나 낮은 값으로 해석하지 마세요. 그 항목은 평가하지 말고, 필요하면 "아직 집계된 자료가 없습니다"라고만 적으세요.\n`
              + `3. 추측한 원인·전망을 사실처럼 단정하지 마세요.`;
            const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You are Mangoi admin assistant. Respond in warm, professional Korean. Never invent numbers that were not given to you, and never treat "자료 없음" as zero.' },
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
          briefingText = `🌅 어제(${yesterdayStr}) 망고아이 브리핑입니다.\n`
            + `신규 등록 ${newEnroll}명, 신규 상담 ${newInquiry}건이 접수되었습니다.\n`
            + (attendanceRate == null ? `어제 출석 자료는 아직 집계되지 않았습니다.\n`
                                      : `어제 출석률은 ${attendanceRate}%(${attendedYesterday}/${activeStudents}명)입니다.\n`)
            + (recentEvalAvg == null ? `최근 7일 안에 작성된 평가서는 없습니다.\n`
                                     : `최근 7일 평가 평균은 ${recentEvalAvg}점(${recentEvalCount}건)입니다.\n`)
            + `미납 학생 ${overdueCount}명, 2주 이상 결석 ${atRiskCount}명에 대한 케어가 필요합니다.\n`
            + `오늘도 좋은 하루 되세요!`;
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
    /* ⏹ 껐습니다 (2026-08-17 사장님 지시) — 지운 것이 아니라 «끈» 것입니다.
         아래 DUNNING_RUN_ENABLED 를 true 로 바꾸면 예전 동작 그대로 돌아옵니다.

       왜 껐나 —
         이 경로는 매일 03:00(KST) cron 이 사람 없이 돌렸습니다(index.ts). 그런데
           · 읽는 표가 `payments` 인데 **17행짜리 껍데기**입니다.
             진짜 결제는 `student_payments`(11,643행)에 있고 둘은 이어져 있지 않습니다.
           · 스코프 필터가 없어 지사·대리점 구분 없이 전부 훑습니다.
           · 문구의 `[학생명]` 자리표시자가 **끝까지 안 채워집니다.**
           · 실제 발송 호출이 없습니다 — `dunning_log` 에 문구만 적습니다.
         그 결과 30일에 489번 돌며 로그만 1,065행 쌓였고(대상자는 28명),
         화면에는 「독촉이 돌고 있다」고 보였습니다. **실제로는 아무에게도 안 갔습니다.**
         돌지도 않는 것이 돌고 있는 것처럼 보이는 편이 더 위험합니다.

       ⚠️ 다시 켜기 전에 반드시 —
         ① `payments` 가 아니라 `student_payments` 를 읽게 고칠 것
         ② 스코프(getScope + scopeStudentCond)를 걸 것
         ③ `[학생명]` 을 실제 이름으로 채울 것
         ④ 학부모 전화번호를 확보할 것 — 지금 students_erp 29,398행 중 3개뿐입니다
         ⑤ **이미 보내는 경로(payments/notify-overdue)와 겹치지 않게** 할 것.
            둘 다 켜면 CLAUDE.md 의 「학부모에게 문자가 두 번 감」 그대로입니다.
       ⚠️ 기록 조회(GET /api/admin/dunning/log)는 그대로 둡니다 — 지난 이력은 봐야 합니다. */
    const DUNNING_RUN_ENABLED = false;
    if (method === 'POST' && path === '/api/admin/dunning/run') {
      if (!DUNNING_RUN_ENABLED) {
        return json({
          ok: false, error: 'dunning_disabled', disabled: true,
          message: '자동 독촉은 꺼져 있습니다. 실제로 보내지 않고 기록만 쌓던 기능이라 2026-08-17 에 껐습니다. 미납·미연장 안내는 「회계관리 → 수강료 미연장 자동 알림」을 쓰세요.',
          message_en: 'Auto-dunning is turned off. It logged messages without ever sending them; disabled 2026-08-17. Use Payments → overdue notice instead.',
        }, 503);
      }
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
        // ⚠️ (2026-08-09) 여기 있던 CREATE TABLE class_schedules (student_uid, teacher_uid, day, time, mbti_score …) 를 지웠다.
        //   그 표는 이미 다른 모양으로 존재한다(user_id · teacher_id · day_of_week · start_time …).
        //   IF NOT EXISTS 라 아무 일도 안 일어나면서, 「이 표는 이런 모양」이라는 **거짓 설명**만 남아
        //   아래 /schedule/approve 의 INSERT 가 그 거짓을 믿고 짜여 매번 실패했다.

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
        // 🔧 (2026-08-09) 이 기능은 «한 건도 저장하지 않으면서 성공했다고» 답하고 있었다.
        //   사슬:
        //     ① 여기서 class_schedules 를 student_uid/teacher_uid/day/time/mbti_score 로 만들려 했다
        //     ② 그런데 그 표는 이미 있다 → IF NOT EXISTS 라 **아무 일도 안 일어난다**
        //        운영 실제 컬럼: user_id · teacher_id · day_of_week · start_time · scheduled_date …
        //     ③ 아래 INSERT 가 「no such column: student_uid」 로 매번 실패
        //     ④ 그 실패를 catch {} 가 조용히 삼킴 → inserted 는 0
        //     ⑤ return { ok:true, inserted:0 } — 화면엔 성공으로 보인다
        //   ①의 CREATE 를 지우고, INSERT 를 **운영 실제 컬럼**에 맞춘다.
        //   (mbti_score 는 표에 자리가 없어 notes 에 남긴다 — 값을 버리지 않기 위해)
        const b: any = await request.json().catch(() => ({}));
        const rows = Array.isArray(b.rows) ? b.rows : [];
        if (!rows.length) return json({ ok: false, error: 'rows_required' }, 400);
        const now = Date.now();
        let inserted = 0;
        const failures: string[] = [];
        for (const r of rows) {
          try {
            await env.DB.prepare(
              `INSERT INTO class_schedules (user_id, teacher_id, day_of_week, start_time, duration_min, schedule_kind, source, status, notes, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)`
            ).bind(
              String(r.student_uid || ''), String(r.teacher_uid || ''),
              String(r.day || ''), String(r.time || ''),
              // ⚠️ duration_min 은 반드시 명시한다 — 운영 표의 DEFAULT 가 옛 정책(30분)이라
              //   생략하면 30 이 들어간다(class-policy.ts 주석). 하니스가 이 누락을 잡는다.
              Number(r.duration_min) || DEFAULT_CLASS_MINUTES,
              'weekly', 'ai_auto', 'proposed',
              `mbti_score=${Number(r.mbti_score || 0)}`, now
            ).run();
            inserted++;
          } catch (e: any) {
            // ⚠️ 조용히 삼키지 않는다 — 위 ④가 이 기능을 죽여 놓고도 성공으로 보이게 한 원인이다.
            if (failures.length < 5) failures.push(String(e?.message || e));
          }
        }
        if (!inserted && failures.length) {
          console.warn('[schedule/approve] 전건 실패:', failures[0]);
          return json({ ok: false, error: 'insert_failed', inserted: 0, detail: failures[0] }, 500);
        }
        return json({ ok: true, inserted, failed: rows.length - inserted, ...(failures.length ? { errors: failures } : {}) });
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
      // 📚 사실·FAQ 정본은 src/mangoi-facts.ts 하나뿐입니다.
      //    학부모 상담봇(/api/parent/chat, api-students.ts)이 같은 파일을 씁니다 — 여기에 복사해 두지 마세요.
      const KNOWLEDGE = MANGOI_KNOWLEDGE;
      // 🎯 결정론적 FAQ 응답 — 주제가 매칭되면 사람이 쓴 정확한 답을 그대로 반환(환각 0, 즉시).
      //    우선순위 순서대로 검사하고, 매칭된 답변(최대 2개)을 이어붙여 반환.
      const hits = matchMangoiFaq(userMsg);
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
    if (path === '/api/admin/subscriptions' || path === '/api/admin/subscription/charge-now' || path === '/api/admin/subscription/cancel' || path === '/api/subscription/create' || path === '/api/admin/subscription/cron-check'
        || path === '/api/admin/billing/auto-renew-live' || path === '/api/admin/billing/auto-renew-due') {
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

      /* 🔴🔴 (2026-07-31) 이전 구현은 실제로 토스에 청구하지 않고 student_payments 에
         '성공'만 써넣는 가짜였다(카드가 진짜로 청구된 적이 한 번도 없음). 제보 #2-2/#3-2
         (자동연장 정식 개발) 작업 중 발견 — 이제 billing_key 로 실제 청구한다.
         카드 등록(billing_key 발급)은 학생이 /api/pay/billing/register+confirm 로 직접 진행하며,
         billing_key 가 없는 구독행은 절대 '성공'으로 표시되지 않는다(chargeSubscriptionOnce 참고). */
      if (method === 'POST' && path === '/api/admin/subscription/charge-now') {
        const b: any = await parseJsonBody(request);
        const id = parseInt(b?.id, 10);
        if (!id) return json({ ok: false, error: 'id_required' }, 400);
        const sub: any = await env.DB.prepare(`SELECT * FROM subscriptions WHERE id = ?`).bind(id).first();
        if (!sub) return json({ ok: false, error: 'not_found' }, 404);
        const r = await chargeSubscriptionOnce(env, sub);
        if (!r.ok) return json({ ok: false, error: r.error || 'charge_failed' }, 402);
        return json({ ok: true, charged: r.amount || 0 });
      }

      if (method === 'POST' && path === '/api/admin/subscription/cancel') {
        const b: any = await parseJsonBody(request);
        const id = parseInt(b?.id, 10);
        if (!id) return json({ ok: false, error: 'id_required' }, 400);
        await env.DB.prepare(`UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(Date.now(), id).run();
        return json({ ok: true });
      }

      // ⚠️ 이 엔드포인트로 만든 행은 billing_key 가 없어 실제 청구가 불가능하다(항상 no_billing_key 로 실패).
      //   실제 자동연장 등록은 학생이 enroll.html 에서 /api/pay/billing/register+confirm 로 진행해야 한다.
      if (method === 'POST' && path === '/api/subscription/create') {
        const b: any = await parseJsonBody(request);
        if (!b?.user_id) return json({ ok: false, error: 'user_id_required' }, 400);
        const now = Date.now();
        const r = await env.DB.prepare(`INSERT INTO subscriptions (user_id, student_name, plan, amount, status, next_billing_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(b.user_id, b.student_name || null, b.plan || '월정기', parseInt(b.amount, 10) || 0, 'active', now + 30 * 86400 * 1000, now, now).run();
        return json({ ok: true, id: r.meta.last_row_id, warning: 'billing_key 없이 생성됨 — 카드 등록 전까지 실제 청구 불가' });
      }

      if (method === 'POST' && path === '/api/admin/subscription/cron-check') {
        const result = await runAutoRenewChargeSweep(env);
        return json(result);
      }

      /* ♾️ (2026-08-23) 자동청구 킬스위치(KV billing:auto_renew_live) — 사장님이 화면에서 켜고 끈다.
         지금까지는 wrangler CLI 로만 만질 수 있어 스위치가 영영 dry-run 이었다.
         ⚠️ 실돈 스위치: 변경(POST)은 본사(hq) 스코프만. 강사는 scope 'none' 이라 canEditOrg 를
            통과해 버리는 함정(CLAUDE.md 2장)이 있으므로 isTeacher 를 따로 막는다. */
      if (path === '/api/admin/billing/auto-renew-live') {
        const a = await getAdminActor(request, env as any);
        if (!a.ok) return json({ ok: false, error: 'auth_required' }, 401);
        if (a.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
        let live = false;
        try { live = (await (env as any).SESSION_STATE.get('billing:auto_renew_live')) === '1'; } catch {}
        if (method === 'GET') return json({ ok: true, live });
        if (method === 'POST') {
          const sc = await getScope(env as any, request);
          if (sc.type !== 'hq' && !FULL_ACCESS_ACCOUNTS.has(a.username)) {
            return json({ ok: false, error: 'forbidden_hq_only', message: '자동청구 스위치는 본사만 변경할 수 있습니다.' }, 403);
          }
          const b: any = await parseJsonBody(request);
          const want = b?.live === true || b?.live === 1 || b?.live === '1';
          try { await (env as any).SESSION_STATE.put('billing:auto_renew_live', want ? '1' : '0'); }
          catch (e) { return json({ ok: false, error: 'kv_write_failed', message: String((e as any)?.message || e) }, 500); }
          console.log('[billing] auto_renew_live ->', want ? '1' : '0', 'by', a.username);
          return json({ ok: true, live: want, by: a.username });
        }
        return json({ ok: false, error: 'method_not_allowed' }, 405);
      }

      /* ♾️ 청구 예정 목록(읽기 전용) — 스위치를 켜기 «전에» 누가 얼마 청구될지 보는 미리보기.
         cron-check(POST)는 스위치가 켜져 있으면 그 자리에서 실청구가 나가므로 미리보기로 쓰면 안 된다. */
      if (method === 'GET' && path === '/api/admin/billing/auto-renew-due') {
        const now = Date.now();
        const rs: any = await env.DB.prepare(
          `SELECT id, user_id, student_name, amount, next_billing_at, fail_count
           FROM subscriptions WHERE status='active' AND billing_key IS NOT NULL
           ORDER BY next_billing_at ASC LIMIT 200`
        ).all().catch(() => ({ results: [] }));
        const rows = ((rs as any)?.results as any[]) || [];
        const dueNow = rows.filter((r) => Number(r.next_billing_at || 0) <= now);
        return json({
          ok: true, total: rows.length,
          due_now: dueNow.length,
          due_now_amount: dueNow.reduce((s, r) => s + Number(r.amount || 0), 0),
          list: rows.map((r) => ({ ...r, due: Number(r.next_billing_at || 0) <= now })),
        });
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

    /* 🙈 (2026-08-13 마이마이 8/13 ①) 「라이브러리에 MES 교재가 아직 보입니다 — server textbooks」
       ═══════════════════════════════════════════════════════════════════════════════
       [왜 8/11 의 숨김이 안 통했나] 그때 넣은 필터(idx-x3.js __libIsRetiredCourse)는
          교재 **이름에 'MES' 라는 글자가 들어 있는지**만 본다. 그런데 서버 교재의 묶음 이름은
          파일명 앞의 [대괄호]에서 나온다(_serverFilesToBooks) — 실제 이름은
          「LEVEL 1」~「LEVEL 7」 · 「Mangoi Books」 · 「004. I visited my grandparents」 처럼
          **어디에도 MES 가 없다.** 그래서 필터를 그대로 통과했다.
          (참고: 8/11 주석의 «MES 파일 325개» 도 오탐이었다 — 'Computer GAMES' 안의 'MES' 였다.
           낱말경계 정규식이 그걸 걸러 주므로 실제로 숨겨진 서버 교재는 **0개**였다.)
       [그래서 이름으로 맞히지 않는다] 어느 묶음이 MES 인지는 **사람이 안다.**
          코드가 「LEVEL 1~7 이 MES 겠지」 하고 찍으면, 틀렸을 때 강사가 쓰는 교재가 사라진다.
          → 숨길 묶음을 **관리자가 목록에서 골라** 저장한다. 배포 없이 즉시 켜고 끌 수 있다.
       [지우지 않는다] 파일·수업기록은 그대로다. 목록에서 안 보이게만 한다(8/11 결정과 동일). */
    const ensureTextbookHiddenTable = async () => {
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS textbook_hidden_books (book TEXT PRIMARY KEY, hidden_by TEXT, created_at INTEGER NOT NULL);`
      );
      /* ✅ (2026-08-13) 마이마이 답변: **"Yes, Level 1 to 7 are MES"**
         ─────────────────────────────────────────────────────────────────
         위에서 «코드가 찍지 않는다» 고 한 그 답을 사람에게 받았다 → 이제 넣어도 된다.
         ⚠️ 1회만 넣는다. 관리자가 나중에 «역시 보이게» 체크를 풀면 그 뜻을 지켜야 하는데,
            매 요청마다 넣으면 푼 것이 되살아난다(플래그로 딱 한 번).
         ⚠️ LEVEL 2 는 지금 운영 DB 에 없다 — 넣어도 해가 없고, 나중에 올라오면 자동으로 숨겨진다. */
      if (_mesHiddenSeedChecked) return;
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS payroll_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`);
        const seeded: any = await env.DB.prepare(`SELECT value FROM payroll_meta WHERE key = 'mes_hidden_seed_260813'`).first().catch(() => null);
        _mesHiddenSeedChecked = true;
        if (!seeded) {
          const now2 = Date.now();
          for (let lv = 1; lv <= 7; lv++) {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO textbook_hidden_books (book, hidden_by, created_at) VALUES (?,?,?)`
            ).bind(`LEVEL ${lv}`, 'maimai-260813', now2).run().catch(() => {});
          }
          await env.DB.prepare(`INSERT OR REPLACE INTO payroll_meta (key,value,updated_at) VALUES ('mes_hidden_seed_260813','1',?)`).bind(now2).run().catch(() => {});
        }
      } catch { /* 씨앗이 안 들어가도 화면에서 직접 체크하면 된다 */ }
    };
    const loadHiddenBooks = async (): Promise<Set<string>> => {
      try {
        await ensureTextbookHiddenTable();
        const rs: any = await env.DB.prepare(`SELECT book FROM textbook_hidden_books`).all();
        return new Set((rs.results || []).map((r: any) => String(r.book || '')));
      } catch { return new Set<string>(); }
    };

    // GET /api/admin/textbook-hidden-books — 묶음 전체 + 숨김 여부(관리자 화면의 체크박스 목록)
    if (method === 'GET' && path === '/api/admin/textbook-hidden-books') {
      await ensureTextbookFilesTable();
      const hidden = await loadHiddenBooks();
      const rs: any = await env.DB.prepare(
        `SELECT (CASE WHEN substr(name,1,1)='[' THEN substr(name,2,instr(name,']')-2) ELSE '(기타)' END) AS book,
                COUNT(*) AS files
         FROM textbook_files WHERE active = 1 GROUP BY book ORDER BY book ASC`
      ).all().catch(() => ({ results: [] }));
      const books = (rs.results || []).map((g: any) => ({
        book: g.book, files: g.files, hidden: hidden.has(String(g.book)),
      }));
      return json({ ok: true, books, hidden_count: hidden.size });
    }

    // POST /api/admin/textbook-hidden-books — { book, hidden } 한 묶음을 숨기거나 되살린다
    if (method === 'POST' && path === '/api/admin/textbook-hidden-books') {
      await ensureTextbookHiddenTable();
      const b: any = await request.json().catch(() => ({}));
      const book = String(b?.book || '').trim();
      if (!book) return json({ ok: false, error: 'book_required' }, 400);
      const who = String(b?.by || 'admin').slice(0, 80);
      if (b?.hidden === false) {
        await env.DB.prepare(`DELETE FROM textbook_hidden_books WHERE book = ?`).bind(book).run();
        return json({ ok: true, book, hidden: false });
      }
      await env.DB.prepare(
        `INSERT OR REPLACE INTO textbook_hidden_books (book, hidden_by, created_at) VALUES (?,?,?)`
      ).bind(book, who, Date.now()).run();
      return json({ ok: true, book, hidden: true });
    }

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

        /* 🔁 (2026-08-14 마이마이) 「같은 책이 여러 번 올라가 페이지가 2~3배가 됐다」
           ═══════════════════════════════════════════════════════════════════════
           [실측] 운영 DB 38,922행 중 고유 페이지는 17,170개 — **평균 2.3배**,
              BTS 1 은 5배였다(115장짜리 책의 실제 내용은 23장). R2 오브젝트도 38,922개라
              약 3.3GB 가 같은 그림의 사본이었다.
           [원인] 이 API 는 **같은 파일을 또 올려도 그냥 새 행 + 새 R2 오브젝트를 만들었다.**
              업로드를 두 번 하면 책이 두 배가 된다 — 사람이 조심하는 것으로 막을 수 없다.
           [고침] 이름과 크기가 똑같은 파일이 이미 있으면 **올리지 않고 건너뛴다.**
              R2 에도 쓰지 않으므로 저장공간도 안 늘어난다.
           ⚠️ 실패가 아니라 «건너뜀» 이다 — 화면이 오류로 오해하지 않게 ok:true 로 답하고
              skipped 를 함께 준다(업로더가 이 값을 세어 «N개는 이미 있어 건너뜀» 이라고 알린다).
           ⚠️ 이름+크기가 같아도 내용이 다를 가능성은 남는다. 그래도 «같은 책을 두 번 올리는»
              실제 사고를 막는 편이 이득이 훨씬 크다(교재는 덮어쓸 일이 거의 없다). */
        const dupRow: any = await env.DB.prepare(
          `SELECT id FROM textbook_files WHERE active = 1 AND name = ? AND size_bytes = ? LIMIT 1`
        ).bind(rawName, file.size).first().catch(() => null);
        if (dupRow && dupRow.id) {
          return json({ ok: true, skipped: true, reason: 'duplicate', id: dupRow.id, name: rawName });
        }

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

    /* 👥 GET /api/admin/live-classes?rooms=a,b,c   (2026-08-19 Melca 8/19 제보 ①·2-①)
       ═══════════════════════════════════════════════════════════════════════════
       「지금 진행 중인 수업」 목록에 **누구 수업인지**가 없었다. 화면에 뜨는 것은
       방 번호와 인원수뿐이라(`meet-123 · 2 participants`) 급히 참관해야 할 때
       어느 수업인지 알 수 없었다.

       [왜 별도 엔드포인트인가] 방 목록 자체는 `/api/active-rooms` 가 이미 준다.
          그 핸들러는 index.ts 에 있고 KV 정리·반환순서 같은 미묘한 동작을 가지고 있다
          (CLAUDE.md 4-2 공동 금지구역). **거기는 건드리지 않고**, 이미 받은 방 번호를
          받아 «이름만 붙여» 돌려주는 창구를 따로 둔다. 화면은 두 번 부르지만 이쪽은 작다.

       [방 번호 → 수업] room_id 는 `class-{예약id}-{YYYYMMDD}` 로 결정론적이다
          (api-mango.ts·absent-sweep.ts 와 같은 규칙). 그 규칙에 안 맞는 방
          (임시 회의방 `meet-123` 등)은 **비워서** 돌려준다 — 추측하지 않는다.

       🔴 강사 이름 — 번호가 세 벌인 함정을 여기서 다시 밟지 않는다.
          class_schedules.teacher_id 는 **원부번호**(teachers.id, 1~29)다.
          카페24 강사번호(9~196)를 여기 넣던 사고는 schedule-seed 쪽에서 이미 고쳐
          (loadCafe24TeacherMap 을 거쳐 원부번호로 변환해 넣는다) 지금은 이 칸이
          일관되게 원부번호다 → `LEFT JOIN teachers` 가 맞다.
          ⛔ attendance.teacher_name 은 여기서도 쓰지 않는다(남의 이름이 들어 있다).

       🔒 지사·대리점 격리 — 이 화면(manager.html)은 지사·대리점도 쓴다.
          자기 범위 밖 수업의 **학생 이름을 보여 주면 개인정보가 샌다.**
          scopeStudentCond 로 잘라, 범위 밖이면 이름 없이 «해당 없음» 으로만 답한다. */
    if (method === 'GET' && path === '/api/admin/live-classes') {
      const raw = String(url.searchParams.get('rooms') || '').trim();
      if (!raw) return json({ ok: true, rooms: {} });
      // 한 번에 200개까지 — 방이 그보다 많을 일은 없고, 넘으면 조용히 자르지 않고 자른 사실을 알린다
      const MAX_ROOMS = 200;
      const all = raw.split(',').map(x => x.trim()).filter(Boolean);
      const roomIds = all.slice(0, MAX_ROOMS);

      // class-{id}-{YYYYMMDD} 만 해석한다. 나머지는 «수업 방이 아님» 으로 그대로 둔다.
      const byScheduleId = new Map<string, string[]>();   // 예약id → [roomId,...]
      for (const rid of roomIds) {
        const m = rid.match(/^class-(\d+)-(\d{8})$/);
        if (!m) continue;
        const sid = m[1];
        if (!byScheduleId.has(sid)) byScheduleId.set(sid, []);
        byScheduleId.get(sid)!.push(rid);
      }

      const out: Record<string, any> = {};
      for (const rid of roomIds) out[rid] = null;         // 못 찾으면 null — 화면이 «미상» 으로 그린다

      const ids = [...byScheduleId.keys()];
      if (ids.length) {
        const sc = await getScope(env as any, request);
        const stuCond = scopeStudentCond(sc, 'se');
        try {
          const rows = await selectInChunks<any>(
            env.DB, ids,
            (ph) => `SELECT cs.id, cs.student_name, cs.user_id, cs.start_time, cs.duration_min,
                            cs.class_type, cs.teacher_id,
                            t.name  AS teacher_name,
                            se.korean_name AS stu_ko, se.english_name AS stu_en
                       FROM class_schedules cs
                       LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
                       LEFT JOIN students_erp se ON se.user_id = cs.user_id
                      WHERE CAST(cs.id AS TEXT) IN (${ph})
                        ${stuCond.cond ? `AND (${stuCond.cond})` : ''}`,
            { tail: stuCond.binds, swallowErrors: true },
          );
          for (const r of rows) {
            const rids = byScheduleId.get(String(r.id)) || [];
            for (const rid of rids) {
              out[rid] = {
                schedule_id: Number(r.id),
                // 이름은 명부(students_erp) 를 먼저 — class_schedules.student_name 은 옛 스냅샷일 수 있다
                student_name: r.stu_ko || r.student_name || r.stu_en || null,
                student_name_en: r.stu_en || null,
                // 못 이었으면 **비운다.** 모르는 것보다 틀린 이름이 나쁘다.
                teacher_name: r.teacher_name || null,
                start_time: r.start_time || null,
                duration_min: Number(r.duration_min) || null,
                class_type: r.class_type || null,
              };
            }
          }
        } catch (e: any) {
          return json({ ok: false, error: 'live_classes_failed', detail: String(e?.message || e) }, 500);
        }
      }
      return json({
        ok: true, rooms: out,
        ...(all.length > roomIds.length ? { truncated: all.length - roomIds.length } : {}),
      });
    }

    /* 🔴 GET /api/admin/classes-now   (2026-08-20 사장님 「지금 수업이 없어?」)
       ═══════════════════════════════════════════════════════════════════════════
       [무엇이 문제였나] 관리자 「🔴 실시간 수업 현황」 표는 **망고아이 화상방에 지금
          붙어 있는 사람**만 센다(`/api/active-rooms` → KV + Durable Object). 그런데
          카페24 예약 수업은 그 방을 거치지 않는다 — 실측(2026-08-20): `c24-*` 방에
          실접속(`last_seen_at > 0`)이 남은 행은 **전 기간 0건**이다.
          그래서 수업 4건이 진행 중이던 15:08 에도 화면은 «지금 진행 중인 수업이
          없습니다» 라고 말했다. 같은 사실인데 «오늘 한가하다» 로 읽힌다.

       [여기서 하는 일] «예약 기준으로 지금 진행 중이어야 할 수업» 을 돌려준다.
          화면은 이것을 «방에 붙어 있는 사람» 과 나란히 그려서
          「수업 4건 · 화상방 접속 0건」 으로 보여 준다.

       [접속 여부를 어떻게 아나] 같은 학생의 **실접속 행**(`last_seen_at > 0`)이 그 수업
          시간과 겹치는지로만 판정한다.
          ⛔ 방 번호로 잇지 않는다 — 카페24 방(`c24-…`)과 망고아이 방
             (`class-{예약id}-{YYYYMMDD}`)은 번호 체계가 아예 다르다.
          ⛔ 이름이 비슷하다고 잇지 않는다. `user_id` 완전일치, 아니면 학생 이름
             완전일치(공백·대소문자만 정규화)뿐이고 후보가 둘 이상이면 잇지 않는다.
          ✅ 못 이으면 `connected:false` 로 둔다. 화면 문구도 «미접속» 이 아니라
             **«접속 기록 없음»** 이다 — 우리가 아는 것은 딱 그만큼이다.

       🔴 강사 이름 — `attendance.teacher_name` 은 **읽지 않는다.** 옛 동기화가 카페24
          강사번호를 원부번호로 오인해 넣은 **남의 이름**이 섞여 있다(CLAUDE.md 2장,
          카페24 24 = Teacher Mariane 인데 HANNAH 로 적힌 행이 실재한다).
          번호(`teacher_uid`) → `loadCafe24TeacherMap()` 으로 매번 다시 찾고,
          못 찾으면 **비운다**(화면은 «미상»).

       🔒 지사·대리점 격리 — 학생 이름이 나가므로 `scopeStudentCond()` 로 자른다.
          범위 밖 수업은 목록에서 **빼고 건수에도 넣지 않는다**(건수만으로도 남의 지사
          규모가 새기 때문). 🔒 강사에게는 닫는다 — 전사 학생 이름이 한 화면에 모인다
          (`index.ts` 의 `TEACHER_BLOCKED_PREFIXES` 에도 함께 등록했다. 이중 방어).

       ⛔ SELECT 만 한다. 이 API 는 아무것도 고치지 않는다. */
    if (method === 'GET' && path === '/api/admin/classes-now') {
      const _actor = await getAdminActor(request, env as any);
      if (_actor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);

      const now = Date.now();
      const AHEAD_MS = 15 * 60 * 1000;        // 곧 시작(15분 앞)까지 함께 보여 준다
      const GRACE_MS = 5 * 60 * 1000;         // 끝난 직후 5분은 «방금 끝남» 으로 남긴다
      const SCAN_MS = 6 * 60 * 60 * 1000;     // joined_at 인덱스 구간 — 6시간 넘는 수업은 없다
      const DEFAULT_LEN_MS = 30 * 60 * 1000;  // 끝시각이 없는 행의 길이 가정
      const kstHM = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(11, 16);

      try {
        const sc = await getScope(env as any, request);
        const stu = scopeStudentCond(sc, 'se');
        /* 예약(카페24) 행. 학생 이름을 명부에서 가져오면서 같은 조인으로 스코프를 자른다 —
           명부에 없는 학생은 «범위를 확인할 수 없음» 이므로 지사·대리점에게는 안 보인다. */
        const rs: any = await env.DB.prepare(
          `SELECT a.room_id, a.user_id, a.username, a.status, a.joined_at, a.left_at, a.teacher_uid,
                  se.korean_name AS stu_ko, se.english_name AS stu_en
             FROM attendance a
             LEFT JOIN students_erp se ON se.user_id = a.user_id
            WHERE a.room_id LIKE 'c24-%'
              AND a.joined_at >= ? AND a.joined_at <= ?
              AND COALESCE(a.left_at, a.joined_at + ?) >= ?
              ${stu.cond ? `AND (${stu.cond})` : ''}
            ORDER BY a.joined_at ASC LIMIT 200`
        ).bind(now - SCAN_MS, now + AHEAD_MS, DEFAULT_LEN_MS, now - GRACE_MS, ...stu.binds).all();
        const rows = ((rs.results || []) as any[]);

        /* 실접속 행 — 오늘 «정말로 화상방에 붙은» 사람. 하루 수십 건이라 통째로 읽어도 가볍다.
           (`last_seen_at > 0` 이 카페24 씨앗과 실접속을 가르는 유일하게 확실한 표시다) */
        const liveRows = await (async () => {
          try {
            const r: any = await env.DB.prepare(
              `SELECT user_id, username, room_id, joined_at, left_at, last_seen_at
                 FROM attendance
                WHERE joined_at >= ? AND last_seen_at IS NOT NULL AND last_seen_at > 0
                LIMIT 500`
            ).bind(now - SCAN_MS - AHEAD_MS).all();
            return (r.results || []) as any[];
          } catch { return [] as any[]; }
        })();
        const normName = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        // 이름 → 실접속 행. 같은 이름이 둘 이상이면 «누구인지 모름» 이므로 잇지 않는다.
        const liveByName = new Map<string, any | null>();
        for (const lr of liveRows) {
          const k = normName(lr.username);
          if (!k) continue;
          liveByName.set(k, liveByName.has(k) ? null : lr);
        }

        const tmap = await loadCafe24TeacherMap(env as any, rows.map(r => r.teacher_uid));

        const classes = rows.map(r => {
          const start = Number(r.joined_at) || 0;
          const end = Number(r.left_at) || (start + DEFAULT_LEN_MS);
          const student = r.stu_ko || r.username || r.stu_en || null;
          // 접속 대조 — ① 계정 완전일치 ② 이름 완전일치(유일할 때만). 겹치는 시간대만 인정한다.
          const overlaps = (lr: any) => {
            const ls = Number(lr.joined_at) || 0;
            const le = Number(lr.left_at) || Number(lr.last_seen_at) || ls;
            return ls <= end + GRACE_MS && le >= start - GRACE_MS;
          };
          let hit: any = null;
          for (const lr of liveRows) {
            if (String(lr.user_id || '') === String(r.user_id || '') && overlaps(lr)) { hit = lr; break; }
          }
          if (!hit && student) {
            const cand = liveByName.get(normName(student));
            if (cand && overlaps(cand)) hit = cand;
          }
          return {
            room_id: r.room_id,
            start_kst: kstHM(start), end_kst: kstHM(end),
            start_ms: start, end_ms: end,
            student_name: student,
            // 못 이었으면 비운다 — 모르는 것보다 틀린 이름이 나쁘다
            teacher_name: (tmap.get(String(r.teacher_uid || '')) || {}).name || null,
            cafe24_status: r.status || null,
            phase: start > now ? 'soon' : (end < now ? 'ended' : 'now'),
            connected: !!hit,
            live_room: hit ? String(hit.room_id || '') : null,
          };
        });

        return json({
          ok: true,
          now_kst: kstHM(now),
          counts: {
            now: classes.filter(c => c.phase === 'now').length,
            soon: classes.filter(c => c.phase === 'soon').length,
            ended: classes.filter(c => c.phase === 'ended').length,
            connected: classes.filter(c => c.connected).length,
          },
          classes,
        });
      } catch (e: any) {
        return json({ ok: false, error: 'classes_now_failed', detail: String(e?.message || e) }, 500);
      }
    }

    /* 🔍 GET /api/admin/textbook-files/dup-report   (2026-08-19 Melca 8/19 제보 ⑥)
       ═══════════════════════════════════════════════════════════════════════════
       「교재가 200페이지가 넘는다 / BTS 1 은 115쪽인데 실제 내용은 23쪽」의 정체는
       **같은 파일이 여러 번 올라간 것**이다. 새 중복은 2026-08-14 에 막혔지만
       (아래 POST 의 dupRow 검사) 그 전에 쌓인 것은 그대로 남아 있다.

       ⛔ 이 API 는 **SELECT 만** 한다. 지우지도 고치지도 않는다.
          D1 은 개발·운영이 같은 DB 이고 실제 학생 29,000명이 쓴다 —
          «무엇을 지울지» 는 숫자를 눈으로 본 사람이 정한다(CLAUDE.md 1-1).

       판정 기준은 업로드 차단과 **같은 기준**(name + size_bytes)이다.
       두 기준이 어긋나면 「진단은 중복이라는데 업로드는 통과」 같은 모순이 생긴다. */
    if (method === 'GET' && path === '/api/admin/textbook-files/dup-report') {
      await ensureTextbookFilesTable();
      try {
        const rs: any = await env.DB.prepare(
          `WITH f AS (
             SELECT (CASE WHEN substr(name,1,1)='[' THEN substr(name,2,instr(name,']')-2) ELSE '(기타)' END) AS book,
                    name AS nm, COALESCE(size_bytes,0) AS sz
               FROM textbook_files WHERE active = 1
           ), u AS (
             SELECT book, nm, sz, COUNT(*) AS n FROM f GROUP BY book, nm, sz
           )
           SELECT book,
                  SUM(n)            AS files,
                  COUNT(*)          AS uniq_files,
                  SUM(n) - COUNT(*) AS dup_files,
                  SUM(n * sz)       AS bytes,
                  SUM((n - 1) * sz) AS dup_bytes
             FROM u GROUP BY book ORDER BY dup_files DESC, files DESC`
        ).all();
        const books = (rs.results || []).map((r: any) => ({
          book: r.book,
          files: Number(r.files) || 0,
          uniq_files: Number(r.uniq_files) || 0,
          dup_files: Number(r.dup_files) || 0,
          bytes: Number(r.bytes) || 0,
          dup_bytes: Number(r.dup_bytes) || 0,
          // 몇 배로 부풀었는지 — 「115쪽인데 실제는 23쪽」을 한 숫자로 보여 준다
          ratio: Number(r.uniq_files) > 0 ? Math.round((Number(r.files) / Number(r.uniq_files)) * 100) / 100 : 1,
        }));
        const sum = (k: string) => books.reduce((a: number, b: any) => a + (b[k] || 0), 0);
        return json({
          ok: true,
          books,
          total: {
            books: books.length,
            files: sum('files'), uniq_files: sum('uniq_files'), dup_files: sum('dup_files'),
            bytes: sum('bytes'), dup_bytes: sum('dup_bytes'),
          },
          note: '판정 기준은 업로드 중복차단과 같다(name + size_bytes). 이 API 는 읽기 전용이다.',
        });
      } catch (e: any) {
        return json({ ok: false, error: 'dup_report_failed', detail: String(e?.message || e) }, 500);
      }
    }

    /* ✏️ POST /api/admin/textbook-files/rebook   (2026-08-19 Melca 8/19 제보 ④⑦)
       ═══════════════════════════════════════════════════════════════════════════
       「파닉스 A~Z 를 따로 나눠 달라 / BTS 2 는 762쪽이니 유닛별로 나눠 달라」

       [왜 이름만 바꾸면 되나] 라이브러리의 «묶음» 은 파일 이름 앞의 [대괄호] 로만
          정해진다(public/js/idx-x3.js _serverFilesToBooks). 즉 R2 파일을 다시 올릴
          필요가 전혀 없다 — textbook_files.name 만 바꾸면 그 자리에서 갈라진다.
       [왜 API 가 필요한가] 지금은 파일 하나씩 고치는 PATCH 뿐이다. 파닉스는 26묶음이고
          BTS 2 는 762개 파일이다. 손으로 할 수 있는 일이 아니다.

       모드 두 가지 — 둘 다 이름만 바꾼다. R2 오브젝트는 건드리지 않는다.
         · rename       : [A] … → [B] …            (묶음 이름만 갈아 끼움)
         · split-lesson : [A] X/f.jpg → [A X] f.jpg (레슨 칸을 묶음 이름으로 올림)
                          파닉스(`[Mangoi Phonics] A/1.jpg`)·BTS 유닛이 정확히 이 모양이다.

       ⛔ dry_run 이 **기본값**이다. 무엇이 어떻게 바뀌는지 먼저 보여 주고,
          사람이 확인한 뒤에만 진짜로 바꾼다. dry_run 없이 바로 바꾸는 경로는 만들지 않았다.
       ⛔ 본사(hq)만. 핸들러에서 canEditOrg() 로 막는다(화면만 감추면 URL 로 뚫린다).
       ⚠️ 한 번에 5,000행까지. 넘으면 거절하고 몇 건인지 알려 준다 —
          말없이 일부만 바꾸면 «반만 갈라진» 라이브러리가 남는다. */
    if (method === 'POST' && path === '/api/admin/textbook-files/rebook') {
      /* 🔒 강사 차단 — canEditOrg() 만으로는 **못 막는다.**
         canEditOrg 는 type==='hq' 와 type==='none' 에 true 를 주는데,
         그 'none' 이 «내부직원·교사» 다(src/scope.ts 주석). 즉 강사가 그대로 통과한다.
         admin_write_guard_harness 가 이 구멍을 잡아 줬다 — 가드를 한 줄 더 둔다. */
      const _rbActor = await getAdminActor(request, env as any);
      if (_rbActor.isTeacher) return json({ ok: false, error: 'forbidden_teacher' }, 403);
      const _rbScope = await getScope(env as any, request);
      if (!canEditOrg(_rbScope)) return json({ ok: false, error: 'forbidden' }, 403);
      await ensureTextbookFilesTable();
      const b: any = await request.json().catch(() => ({}));
      const match = String(b?.match || '').trim();
      const mode = String(b?.mode || 'rename').trim();
      const replace = String(b?.replace ?? '').trim();
      const dryRun = b?.dry_run !== false;      // 기본 true — 명시적으로 false 를 줘야 바꾼다
      if (!match) return json({ ok: false, error: 'match_required' }, 400);
      if (mode !== 'rename' && mode !== 'split-lesson') return json({ ok: false, error: 'invalid_mode', allowed: ['rename', 'split-lesson'] }, 400);
      if (mode === 'rename' && !replace) return json({ ok: false, error: 'replace_required' }, 400);

      const MAX_ROWS = 5000;
      const rs: any = await env.DB.prepare(
        `SELECT id, name FROM textbook_files WHERE active = 1 AND name LIKE ? ORDER BY id LIMIT ?`
      ).bind(`[${match}]%`, MAX_ROWS + 1).all().catch(() => ({ results: [] }));
      const rows: any[] = rs.results || [];
      if (rows.length > MAX_ROWS) {
        return json({ ok: false, error: 'too_many_rows', max: MAX_ROWS,
          hint: `[${match}] 로 시작하는 파일이 ${MAX_ROWS}개를 넘습니다. 더 좁은 묶음 이름으로 나눠서 실행하세요.` }, 400);
      }

      /* 새 이름 계산 — 규칙이 한 곳에만 있어야 미리보기와 실제 적용이 어긋나지 않는다. */
      const newNameOf = (nm: string): string | null => {
        const m = nm.match(/^\[([^\]]+)\]\s*(.*)$/);
        if (!m || m[1].trim() !== match) return null;      // 정확히 그 묶음만 — 부분일치 금지
        const rest = m[2] || '';
        if (mode === 'rename') return `[${replace}] ${rest}`.trim();
        // split-lesson — 레슨 칸(첫 '/' 앞)을 묶음 이름 뒤에 붙인다
        const slash = rest.indexOf('/');
        if (slash < 0) return null;                        // 레슨 칸이 없으면 건드리지 않는다
        const lesson = rest.slice(0, slash).trim();
        const file = rest.slice(slash + 1).trim();
        if (!lesson || !file) return null;
        const head = replace ? `${replace} ${lesson}` : `${match} ${lesson}`;
        return `[${head}] ${file}`;
      };

      const plan: { id: number; from: string; to: string }[] = [];
      let skipped = 0;
      for (const r of rows) {
        const to = newNameOf(String(r.name || ''));
        if (to == null || to === r.name) { skipped++; continue; }
        plan.push({ id: Number(r.id), from: String(r.name), to });
      }

      // 바뀐 뒤 묶음이 몇 개로 갈라지는지 — 미리보기에서 이것부터 본다
      const booksAfter: Record<string, number> = {};
      for (const p2 of plan) {
        const mm = p2.to.match(/^\[([^\]]+)\]/);
        const k = mm ? mm[1] : '(기타)';
        booksAfter[k] = (booksAfter[k] || 0) + 1;
      }

      if (dryRun) {
        return json({
          ok: true, dry_run: true, matched: rows.length, will_change: plan.length, skipped,
          books_after: booksAfter,
          sample: plan.slice(0, 20),
          note: '아무것도 바꾸지 않았습니다. 적용하려면 dry_run:false 로 다시 호출하세요.',
        });
      }

      if (!plan.length) return json({ ok: true, dry_run: false, changed: 0, note: '바꿀 파일이 없습니다.' });

      /* D1 배치 — 한 문장에 바인드 2개(name, id)라 100개 한도에는 여유가 있지만,
         배치 자체를 크게 만들면 한 건 실패에 전부 말린다. 200개씩 끊는다. */
      const now = Date.now();
      let changed = 0;
      for (let i = 0; i < plan.length; i += 200) {
        const chunk = plan.slice(i, i + 200);
        const stmts = chunk.map((c) =>
          env.DB.prepare(`UPDATE textbook_files SET name = ?, updated_at = ? WHERE id = ?`).bind(c.to, now, c.id)
        );
        try { await env.DB.batch(stmts); changed += chunk.length; }
        catch (e: any) {
          return json({ ok: false, error: 'partial_failure', changed, failed_at: i,
            detail: String(e?.message || e) }, 500);
        }
      }
      await writeAudit(String(b?.by || 'admin'), 'textbook_rebook',
        { meta: { match, mode, replace, changed } });
      return json({ ok: true, dry_run: false, changed, books_after: booksAfter });
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
      /* 📕 (2026-08-10 마이마이 「시스템 PDF 가 안 넘어간다 / 내 컴퓨터 jpg 가 훨씬 빠르다」)
         [원인] 여기서 Range 헤더를 통째로 무시하고 R2 객체 «전부» 를 돌려주고 있었다.
                Accept-Ranges 도 없으니 pdf.js 는 부분 요청을 포기하고 파일 전체를 받는다.
                교재 PDF 평균 6.3MB(최대 9.3MB) → 필리핀 회선에서 1페이지가 뜨기까지 수십 초.
                강사에게는 「안 넘어간다」로 보인다(실은 아직 받는 중).
         [수정] R2 바인딩에 Range 헤더를 그대로 넘겨 206 부분응답을 지원한다.
                pdf.js 가 필요한 페이지 조각만 받아 첫 페이지가 즉시 뜬다.
         ⚠️ r2_key 는 업로드마다 새로 만들어지므로 내용이 바뀌지 않는다 → immutable 캐시 가능.
            (기존 max-age=3600 은 매 수업마다 6MB 를 다시 받게 하고 있었다) */
      /* ⚡ (2026-08-13 마이마이 「No, still lag, they are slow」 — 5번째 반복 신고)
         ═══════════════════════════════════════════════════════════════════════
         [측정] 교재 이미지 38,860장 평균 143.8KB(최대 1.7MB). 파일이 작다 —
                «파일이 커서» 느린 게 아니다.
         [남은 원인] 이 응답에 Cache-Control: immutable 을 달아도 그건 **브라우저 캐시**다.
                Worker 가 만든 응답은 클라우드플레어 엣지에 자동으로 담기지 않는다.
                그래서 «처음 보는 장» 은 강사마다·기기마다 매번
                   마닐라 → (D1 조회) → R2(서울 ICN) → 마닐라
                를 왕복했다. 한 반이 같은 교재를 봐도 캐시를 나눠 쓰지 못했다.
         [수정] Cache API 로 엣지에 담는다. 마닐라 엣지가 한 번 데워지면 그 다음부터는
                같은 도시의 모든 강사가 R2 왕복 없이 받는다 — 필리핀에서 체감이 가장 크다.
         ⚠️ Range(206) 요청은 담지 않는다 — Cache API 는 206 을 못 담고, 조각마다 키가
            달라 캐시를 오염시킨다. PDF(62개)만 Range 를 쓰므로 이미지 99.8% 는 그대로 이득.
         ⚠️ r2_key 는 업로드마다 새로 만들어져 내용이 안 바뀐다 → 엣지에 오래 둬도 안전하다.
            교재를 지우면 id 가 404 가 되므로 «지운 교재가 계속 보이는» 일도 없다. */
      const rangeHeader = request.headers.get('range');
      const edgeCache: any = (globalThis as any).caches?.default;
      if (!rangeHeader && edgeCache) {
        try {
          const hit = await edgeCache.match(request);
          if (hit) return hit;
        } catch { /* 캐시가 막혀 있어도 원본 경로로 계속 간다 */ }
      }
      const obj = rangeHeader
        ? await r2.get(row.r2_key, { range: request.headers })
        : await r2.get(row.r2_key);
      if (!obj) return new Response('Not Found in R2', { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      if (!headers.get('content-type')) {
        headers.set('content-type', row.mime || (row.kind === 'pdf' ? 'application/pdf' : 'image/jpeg'));
      }
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(row.name || 'file')}"`);
      const rng: any = (obj as any).range;
      if (rangeHeader && rng && typeof rng.offset === 'number') {
        const start = rng.offset;
        const end = start + (rng.length ?? ((obj as any).size - start)) - 1;
        headers.set('Content-Range', `bytes ${start}-${end}/${(obj as any).size}`);
        headers.set('Content-Length', String(end - start + 1));
        return new Response(obj.body, { status: 206, headers });
      }
      headers.set('Content-Length', String((obj as any).size));
      const full = new Response(obj.body, { headers });
      /* 엣지에 담는다. 응답 본문은 한 번만 읽을 수 있으므로 clone() 을 넣고 원본을 돌려준다.
         waitUntil 이 있으면 담기를 기다리지 않고 강사에게 먼저 보낸다(첫 요청도 안 느려진다). */
      if (!rangeHeader && edgeCache) {
        try {
          const put = edgeCache.put(request, full.clone());
          if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
          else await put;
        } catch { /* 못 담아도 응답은 정상이다 */ }
      }
      return full;
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
        /* 🙈 (2026-08-13 마이마이 8/13 ①) 관리자가 숨긴 묶음은 강사·학생 라이브러리에서 뺀다.
           여기 한 곳에서 거르면 트리·카드·검색이 저절로 일치한다(화면이 이 응답 하나를 본다).
           ⚠️ 파일 자체는 그대로다 — 이미 열려 있는 수업(?book= 로드)은 계속 동작한다. */
        const hidden = await loadHiddenBooks();
        const groups = (grs.results || []).filter((g: any) => !hidden.has(String(g.book || '')));
        const total = groups.reduce((a: number, g: any) => a + (g.files || 0), 0);
        return json({ ok: true, groups, total, hidden_count: hidden.size });
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
    //   PATCH /api/recordings/:id/status  body: { status: 'completed' | 'deleted' | 'aborted' }  ('ended' 는 옛 이름)
    //     - 기존 DELETE /api/recordings/:id 는 deleted 로만 변경 가능 → 복원(ended) 을 이걸로 처리
    if (method === 'PATCH' && /^\/api\/recordings\/\d+\/status$/.test(path)) {
      const m = path.match(/^\/api\/recordings\/(\d+)\/status$/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (!id) return invalidBody(['id(path)']);
      const b = await parseJsonBody(request);
      if (!b || !b.status) return invalidBody(['status']);
      const allowed = new Set(['ended', 'completed', 'deleted', 'aborted']);
      if (!allowed.has(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: Array.from(allowed) }, 400);
      }
      /* 🔴 2026-08-28 두 가지를 함께 고쳤다.
         ① 「복원」이 status='ended' 를 썼는데 **저장소 어디도 그 값을 모른다** — D1 실측
            2,022행의 상태는 completed·deleted·aborted·upload_failed·recording 다섯뿐이고
            'ended' 는 0건이다. 복원하면 배지 자리에 영문 코드가 날것으로 뜨고 「완료」
            집계에서도 빠졌다. → 'completed' 로 옮겨 적는다(옛 이름도 계속 받아 준다).
         ② 보관기간이 끝난 녹화는 R2 파일이 이미 지워졌다. 그걸 그대로 「완료」로 되돌리면
            **«완료인데 영상 없음»** — 이 저장소가 8/26 에 고친 바로 그 사고를 다시 만든다.
            → 되살릴 때는 실물을 head() 로 «봤을 때만» 완료로 올린다.
         ⚠️ 조회 자체가 실패하면(예외) 막지 않는다 — 통과시키는 쪽으로 실패한다. */
      let nextStatus = b.status === 'ended' ? 'completed' : b.status;
      if (nextStatus === 'completed') {
        const cur = await env.DB.prepare(`SELECT file_url FROM recordings WHERE id = ?`)
          .bind(id).first<{ file_url: string | null }>();
        const key = String(cur?.file_url || '');
        /* ⚠️ 키가 «아예 없는» 행(옛 local 저장분 등)은 확인할 대상조차 없다 —
           그대로 「완료」로 올리면 «완료인데 영상 없음» 이 새로 생긴다. 그건 막는다.
           반대로 외부 http(s) 주소는 우리가 확인할 수 없으니 예전처럼 통과시킨다. */
        const isExternal = /^https?:\/\//.test(key);
        const isJunk = key.startsWith('CLIENT_ERR:') || key.startsWith('DEBUG:');
        if (!key || isJunk) {
          return json({
            ok: false, error: 'file_gone',
            message: '이 녹화에는 영상 파일 위치가 남아 있지 않아 복원할 수 없습니다. 기록만 남아 있습니다.',
            message_en: 'This recording has no stored file location, so it cannot be restored.',
          }, 409);
        }
        const looksLikeKey = !isExternal;
        const bucket = (env as any).RECORDINGS as R2Bucket | undefined;
        if (looksLikeKey && bucket) {
          let proven = false, checked = false;
          try { proven = !!(await bucket.head(key)); checked = true; } catch { checked = false; }
          if (checked && !proven) {
            return json({
              ok: false, error: 'file_gone',
              message: '영상 파일이 이미 지워져 복원할 수 없습니다(보관기간 3개월 경과). 기록만 남아 있습니다.',
              message_en: 'The video file is already deleted (3-month retention passed), so it cannot be restored.',
            }, 409);
          }
        }
      }
      await env.DB.prepare(`UPDATE recordings SET status = ? WHERE id = ?`).bind(nextStatus, id).run();
      return json({ ok: true, id, status: nextStatus });
    }

    /* ── 🚷 GET /api/admin/attendance/long-absent — 장기 결석생 (2026-08-13 수정요청 #05) ──
     *   「연속 3회 이상 결석한 학생을 모아서 보고 싶다」
     *
     *   🔑 출처는 attendance 다. class_schedules 를 쓰면 안 된다 —
     *      673행뿐이고 학생은 6명, 대부분 type_seed 데모라 실수업과 연결돼 있지 않다
     *      (같은 함정을 오늘 KPI 쪽에서 이미 겪었다. 이 파일 위쪽 '결석률' 주석 참고).
     *      카페24 동기화가 «수업 1건 = 행 1개» 로 넣고 class_state=2 → 'present'(완료),
     *      그 외 → 'scheduled'(미실시) 다. 즉 미실시 = 그날 안 온 것.
     *
     *   🧮 연속 횟수 — 최신 수업일부터 거꾸로 세다가 «출석» 을 만나면 멈춘다.
     *      ROW_NUMBER() 로 학생별 역순 번호를 매기고, 첫 출석 행의 번호 - 1 이 곧 연속 결석 수다.
     *      중간에 출석이 있으면 거기서 번호가 끊기므로 리셋이 «저절로» 된다(요구사항 4).
     *
     *   🪤 함정 셋 — 전부 실측으로 확인하고 막았다(2026-08-13, 운영 D1):
     *      ① 미래 수업이 섞인다. attendance.date 최대값이 **2030-02-20** 이다(예약이 미리 들어온다).
     *         date <= 오늘(KST) 로 자르지 않으면 «아직 오지도 않은 수업» 을 결석으로 센다.
     *      ② «출석 기록이 아예 없는» 학생이 압도적으로 많다. 연속 3회 이상 후보 207명 중
     *         **132명은 students_erp 명부에 아예 없고**(테스트·구데이터 uid), 13명은 명부엔 있지만
     *         이 기간에 present 가 한 번도 없다. 그런 사람은 «결석» 이 아니라 «데이터가 없는» 것이다.
     *         → 기본 목록에서 빼되 **숫자로 같이 돌려준다**(요구사항의 «제외하거나 별도 표기»).
     *      ③ 수강이 끝난 학생(end_date 지남)·비활성 학생도 당연히 안 나온다. 결석이 아니다.
     *      실측 정리: 후보 207 → 명부없음 132 · 출석기록없음 13 · 수강종료 8 · 비활성 1
     *                 → **실제 챙겨야 할 학생 53명**
     *
     *   ⏳ 최근 며칠은 아직 «확정» 이 아니다. cafe24 야간 증분이 최근 14일만 다시 가져오므로
     *      (nightlyCafe24Refresh) 그 사이 'scheduled' 는 «완료 신호가 아직 안 온 것» 일 수 있다.
     *      숫자를 임의로 깎지 않는다 — 대신 recent_unsettled 로 «그중 몇 건이 확정 전인지» 같이 준다.
     *
     *   👨‍🏫 담당 강사 — class_schedules → teachers 로 잇는다. 다만 **지금은 거의 다 빈다**:
     *      실측상 이 후보들 중 class_schedules 행이 있는 학생이 0명이고, students_erp.teacher_phone 은
     *      29,398명 **전원이 비어 있다**. 그래서 화면에는 대리점(학원)·지사를 함께 보여 준다
     *      (연락은 그쪽으로 한다). 새 수강신청이 enroll-activate 로 시간표를 만들면 자동으로 채워진다.
     */
    if (method === 'GET' && path === '/api/admin/attendance/long-absent') {
      const _laToday = today();
      const _laMin   = Math.max(2, Math.min(50, parseInt(url.searchParams.get('min') || '3', 10) || 3));
      const _laDays  = Math.max(30, Math.min(730, parseInt(url.searchParams.get('days') || '180', 10) || 180));
      const _laLimit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '300', 10) || 300));
      const _laAll   = url.searchParams.get('include') === 'all';   // 제외된 것까지 보고 싶을 때
      const _laQ     = (url.searchParams.get('q') || '').trim();
      const _laLike  = '%' + _laQ.replace(/[%_]/g, '') + '%';
      const _laSince = new Date(Date.parse(_laToday + 'T00:00:00Z') - _laDays * 86400000).toISOString().slice(0, 10);
      const _laSettleCut = new Date(Date.parse(_laToday + 'T00:00:00Z') - 14 * 86400000).toISOString().slice(0, 10);
      // 🔒 지사/대리점은 자기 학생만 (본사·내부직원은 조건 없음)
      const _laScope = await scopeFragments(env, request);
      const _laSort = ({
        streak:       'k.streak DESC, k.last_present ASC',
        last_present: 'k.last_present ASC, k.streak DESC',
        name:         'name ASC',
      } as Record<string, string>)[url.searchParams.get('sort') || 'streak'] || 'k.streak DESC, k.last_present ASC';

      const _laSql =
        `WITH ranked AS (
           SELECT a.user_id, a.date, a.status,
                  ROW_NUMBER() OVER (PARTITION BY a.user_id ORDER BY a.date DESC, a.id DESC) AS rn
             FROM attendance a
            WHERE COALESCE(a.role,'student') = 'student'
              AND a.date IS NOT NULL AND a.date <= ? AND a.date >= ?${_laScope.uidScope}
         ),
         agg AS (
           SELECT user_id,
                  MIN(CASE WHEN status = 'present' THEN rn END)   AS fp,
                  MAX(rn)                                          AS rows_n,
                  MAX(CASE WHEN status = 'present' THEN date END)  AS last_present,
                  MAX(date)                                        AS last_class
             FROM ranked GROUP BY user_id
         ),
         streaks AS (
           SELECT user_id, fp, last_present, last_class, COALESCE(fp - 1, rows_n) AS streak
             FROM agg WHERE COALESCE(fp - 1, rows_n) >= ?
         )
         SELECT k.user_id, k.streak, k.last_present, k.last_class,
                COALESCE(s.korean_name, s.student_name, s.username, k.user_id) AS name,
                s.student_phone, s.parent_phone, s.shop_name, s.franchise, s.classes_per_week,
                tj.teacher_name,
                COALESCE(ru.n, 0) AS recent_unsettled,
                CASE WHEN s.user_id IS NULL                       THEN 'no_roster'
                     WHEN k.fp IS NULL                            THEN 'never_present'
                     WHEN COALESCE(s.status,'active') <> 'active' THEN 'inactive'
                     WHEN s.end_date IS NOT NULL AND s.end_date <> '' AND s.end_date < ? THEN 'ended'
                     ELSE NULL END AS exclude_reason
           FROM streaks k
           LEFT JOIN students_erp s ON s.user_id = k.user_id
           LEFT JOIN (SELECT cs.user_id AS uid, MAX(cs.id) AS _latest, t.name AS teacher_name
                        FROM class_schedules cs
                        JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
                       GROUP BY cs.user_id) tj ON tj.uid = k.user_id
           LEFT JOIN (SELECT r.user_id AS uid, COUNT(*) AS n
                        FROM ranked r JOIN agg g ON g.user_id = r.user_id
                       WHERE r.status <> 'present' AND r.date > ?
                         AND (g.fp IS NULL OR r.rn < g.fp)  /* 연속 구간 안의 것만 */
                       GROUP BY r.user_id) ru ON ru.uid = k.user_id
          WHERE (? = '' OR COALESCE(s.korean_name, s.student_name, s.username, k.user_id) LIKE ?
                        OR k.user_id LIKE ? OR s.shop_name LIKE ?)
          ORDER BY ${_laSort}
          LIMIT ?`;

      const _laRs = await env.DB.prepare(_laSql).bind(
        _laToday, _laSince, ..._laScope.binds,
        _laMin, _laToday, _laSettleCut,
        _laQ, _laLike, _laLike, _laLike,
        _laLimit
      ).all<any>();

      const _laRows = (_laRs.results || []) as any[];
      const _laExcluded = { no_roster: 0, never_present: 0, inactive: 0, ended: 0 };
      const _laItems: any[] = [];
      for (const r of _laRows) {
        const why = r.exclude_reason as keyof typeof _laExcluded | null;
        if (why) { if (why in _laExcluded) _laExcluded[why]++; if (!_laAll) continue; }
        _laItems.push(r);
      }
      return json({
        ok: true,
        as_of: _laToday, min: _laMin, days: _laDays, since: _laSince,
        settle_cut: _laSettleCut,           // 이 날짜 이후는 카페24 동기화가 아직 «확정 전»
        count: _laItems.length,
        candidates: _laRows.length,         // 걸러내기 «전» 후보 수
        excluded: _laExcluded,              // 왜 몇 명이 빠졌는지 (요구사항의 «별도 표기»)
        included_excluded: _laAll,
        students: applyPIIScope(_laItems, _laScope.scope),   // 🔒 권한별 전화번호 마스킹
        can_view_pii: canViewPII(_laScope.scope),
      });
    }

    /* ── 📊 GET /api/admin/attendance/school-stats — 학원별 학생 수업현황 (SLP 출석 통계) ──
     *   (2026-08-19) admin.html 이 카드를 만들 때 데모 16행(데모지사1·데모학당A~F·DEMOID_01…)을
     *   그대로 하드코딩해 둔 채 실서비스에 배포돼 있었다. 실제 지사·학당·학생으로 바꾼다.
     *
     *   🔑 출처는 attendance 다 — class_schedules 는 안 쓴다. 바로 위 long-absent 주석에서
     *      이미 확인한 이유와 같다(673행뿐이고 대부분 데모 시드라 실수업과 안 이어진다).
     *      카페24 동기화는 room_id=`c24-{class_id}` 로 «수업 1건 = 행 1개» 를 넣고
     *      class_state 2 → 'present'(출석), 그 외 → 'scheduled'(미실시=결석)로 채운다.
     *   🧹 ghost 학원(무료수업(지인)·망고아이 기본대리점·교육용 대리점·테스트대리점)은
     *      명부(students_erp) 단계에서 뺀다 — 화면에 데모/테스트 지사가 다시 보이지 않게 하는 것이
     *      이번 요청의 핵심이다.
     *   🔒 지사·대리점 로그인은 scopeStudentCond 로 자기 범위만 본다(다른 화면과 동일 규칙).
     *   ⏳ 아직 오지 않은 날은 «결석» 이 아니라 «미실시» 일 뿐이므로 오늘(KST)까지만 센다.
     *
     *   ?meta=1 이면 무거운 출결 집계 없이, 드롭다운(지사·학당)용 실제 (지사,학당) 조합만 돌려준다
     *   — adm-core.js 의 smFillAgencyFilter() 와 같은 원칙: 서버가 스코프로 이미 자른 실데이터에서
     *   목록을 만들어야 지사 계정에 다른 지사 학원이 섞여 나오지 않는다.
     */
    if (method === 'GET' && path === '/api/admin/attendance/school-stats') {
      const _saToday = today();
      const _saNow = new Date();
      const _saYearIn = parseInt(url.searchParams.get('year') || '', 10);
      const _saYear = (_saYearIn >= 2020 && _saYearIn <= 2100) ? _saYearIn : _saNow.getUTCFullYear();
      const _saMonthIn = parseInt(url.searchParams.get('month') || '', 10);
      const _saMonth = (_saMonthIn >= 1 && _saMonthIn <= 12) ? _saMonthIn : 0;
      const _pad2 = (n: number) => String(n).padStart(2, '0');
      const _saFrom = _saMonth ? `${_saYear}-${_pad2(_saMonth)}-01` : `${_saYear}-01-01`;
      const _saToExcl = _saMonth
        ? new Date(Date.UTC(_saYear, _saMonth, 1)).toISOString().slice(0, 10)
        : `${_saYear + 1}-01-01`;
      const _saToCap = _saToExcl < _saToday ? _saToExcl : _saToday; // 미래분은 안 센다

      const _saScope = await getScope(env as any, request);
      const _saCond = scopeStudentCond(_saScope, 's');
      const GHOST_SHOPS = ['무료수업(지인)', '망고아이 기본대리점', '교육용 대리점', '테스트대리점'];

      const _saMetaWhere: string[] = [
        `s.shop_name NOT IN (${GHOST_SHOPS.map(() => '?').join(',')})`,
        `s.franchise IS NOT NULL AND s.franchise <> ''`,
        `s.shop_name IS NOT NULL AND s.shop_name <> ''`,
      ];
      const _saMetaBinds: any[] = [...GHOST_SHOPS];
      if (_saCond.cond) { _saMetaWhere.push(_saCond.cond); _saMetaBinds.push(..._saCond.binds); }

      if (url.searchParams.get('meta') === '1') {
        const rs = await env.DB.prepare(
          `SELECT DISTINCT s.franchise AS franchise, s.shop_name AS shop_name
             FROM students_erp s WHERE ${_saMetaWhere.join(' AND ')}
            ORDER BY s.franchise, s.shop_name LIMIT 4000`
        ).bind(..._saMetaBinds).all<any>().catch(() => ({ results: [] }));
        return json({ ok: true, pairs: rs.results || [], scope: { type: _saScope.type, label: _saScope.label } });
      }

      const _saFranchise = (url.searchParams.get('franchise') || '').trim();
      const _saShop = (url.searchParams.get('shop_name') || url.searchParams.get('academy') || '').trim();
      const _saQ = (url.searchParams.get('q') || '').trim();
      const _saLike = '%' + _saQ.replace(/[%_]/g, '') + '%';
      const _saResult = (url.searchParams.get('result') || '').trim();
      const _saLimit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      const _saOffset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

      const _saWhere: string[] = [
        `s.shop_name NOT IN (${GHOST_SHOPS.map(() => '?').join(',')})`,
        `(COALESCE(s.status,'정상') IN ('정상','활동','active') OR s.status IS NULL OR s.status = '')`,
      ];
      const _saBinds: any[] = [...GHOST_SHOPS];
      if (_saCond.cond) { _saWhere.push(_saCond.cond); _saBinds.push(..._saCond.binds); }
      if (_saFranchise) { _saWhere.push('s.franchise = ?'); _saBinds.push(_saFranchise); }
      if (_saShop) { _saWhere.push('s.shop_name = ?'); _saBinds.push(_saShop); }
      if (_saQ) {
        _saWhere.push(`(COALESCE(s.korean_name, s.student_name, s.username, '') LIKE ? OR s.english_name LIKE ? OR s.user_id LIKE ? OR s.login_id LIKE ?)`);
        _saBinds.push(_saLike, _saLike, _saLike, _saLike);
      }

      const _saResultCond =
        _saResult === 'excellent' ? `AND rate >= 90` :
        _saResult === 'warning'   ? `AND rate >= 70 AND rate < 90` :
        _saResult === 'fail'      ? `AND rate IS NOT NULL AND rate < 70` : '';

      const _saCte =
        `WITH base AS (
           SELECT s.user_id AS user_id,
                  COALESCE(s.korean_name, s.student_name, s.username, s.user_id) AS name,
                  s.english_name AS english_name, s.shop_name AS shop_name, s.franchise AS franchise
             FROM students_erp s WHERE ${_saWhere.join(' AND ')}
         ),
         att AS (
           SELECT a.user_id AS user_id,
                  SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS attended_n,
                  COUNT(*) AS total_n
             FROM attendance a
            WHERE a.room_id LIKE 'c24-%'
              AND COALESCE(a.role,'student') = 'student'
              AND a.date >= ? AND a.date < ?
              AND a.user_id IN (SELECT user_id FROM base)
            GROUP BY a.user_id
         ),
         merged AS (
           SELECT b.user_id, b.name, b.english_name, b.shop_name, b.franchise,
                  COALESCE(att.attended_n, 0) AS attended_n,
                  COALESCE(att.total_n, 0)    AS total_n,
                  CASE WHEN COALESCE(att.total_n, 0) = 0 THEN NULL
                       ELSE ROUND(100.0 * COALESCE(att.attended_n, 0) / att.total_n) END AS rate
             FROM base b LEFT JOIN att ON att.user_id = b.user_id
         ) `;
      const _saDateBinds = [_saFrom, _saToCap];

      const _saKpiRow = await env.DB.prepare(
        `${_saCte}
         SELECT COUNT(*) AS n,
                SUM(total_n) AS total_classes, SUM(attended_n) AS total_attended,
                COUNT(DISTINCT shop_name) AS schools,
                SUM(CASE WHEN rate IS NOT NULL AND rate <= 70 THEN 1 ELSE 0 END) AS risk
           FROM merged WHERE 1=1 ${_saResultCond}`
      ).bind(..._saBinds, ..._saDateBinds).first<any>().catch(() => null);

      const _saRows = await env.DB.prepare(
        `${_saCte}
         SELECT * FROM merged WHERE 1=1 ${_saResultCond}
          ORDER BY franchise, shop_name, name LIMIT ? OFFSET ?`
      ).bind(..._saBinds, ..._saDateBinds, _saLimit, _saOffset).all<any>().catch(() => ({ results: [] }));

      return json({
        ok: true,
        year: _saYear, month: _saMonth || null, from: _saFrom, to_excl: _saToExcl, counted_to: _saToCap,
        total: Number(_saKpiRow?.n || 0),
        limit: _saLimit, offset: _saOffset,
        kpi: {
          rate: _saKpiRow?.total_classes ? Math.round(100 * Number(_saKpiRow.total_attended || 0) / Number(_saKpiRow.total_classes)) : null,
          schools: Number(_saKpiRow?.schools || 0),
          students: Number(_saKpiRow?.n || 0),
          risk: Number(_saKpiRow?.risk || 0),
        },
        items: _saRows.results || [],
        scope: { type: _saScope.type, label: _saScope.label },
      });
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

    /* ── 🔗 강사 계정 ↔ 강사 원부 연결 (card-teacher-link) ──────────────────────
     *
     * [왜] 로그인 계정(admin_account)과 수업 배정(class_schedules.teacher_id → teachers.id)은
     *      **이름 문자열**로만 이어져 있었다. 계정 20개 중 18개가 name 을 한 번도 안 바꿔
     *      name === username('mangoi_033') 이라 원부에서 못 찾고, 강사 화면은 «수업이 없다»고
     *      말한다. 실제로는 수업이 있는데 «누구인지 모르는» 것이다.
     *      반대로 'Anna' 가 'H·ANNA·H' 안에 들어가 **남의 수업**이 붙은 사고도 났다.
     *
     * [해법] 이름 추측을 그만두고 **사람이 한 번 정해 주는 정답표**를 둔다.
     *        여기 연결이 있으면 이름 매칭은 아예 건너뛴다(api-teacher.ts 1순위).
     *
     * ⛔ 계정·원부 행 자체는 절대 고치지 않는다. 연결표에만 쓴다 — 되돌리기가 쉬워야 한다.
     */
    if (path.startsWith('/api/admin/teacher-links')) {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER);`);
      } catch {}
    }

    /* ── 💳 법인카드(신한) — CODEF 연동 (corpcard-sync.ts) ──────────────────────
       admin.html 「법인카드 사용내역」 카드가 부른다. CODEF 키(secret) 3개가 없으면
       ok:false + codef_not_configured 로 답하고 화면은 «미연동» 을 그대로 보여 준다.
       ⚠️ 새 API 등록 3종 세트를 잊지 말 것: index.ts 게이트 + api-mango 위임 가드
          + (재무 데이터라) index.ts TEACHER_BLOCKED_PREFIXES — 셋 다 했다(2026-08-13). */
    if (method === 'POST' && path === '/api/admin/corpcard/sync') {
      /* 🔀 프로바이더 선택 (2026-08-14) — 바로빌 키가 있으면 바로빌, 없으면 기존 CODEF.
         CODEF 정식 견적이 월 80만원이라 바로빌(월 3,300원)로 옮기는 중이다. 두 경로를
         함께 두는 이유: 시크릿만 넣으면 전환되고, 문제가 생겨도 되돌릴 자리가 남는다. */
      /* 🏦 계좌도 같이 — «신한 동기화» 버튼 하나로 카드+계좌를 함께 당긴다(2026-08-14).
         계좌번호 시크릿이 없으면 조용히 건너뛰지 않고 결과에 «왜 안 했는지» 를 싣는다. */
      const bank = bankConfigured(env)
        ? await runBankSync(env).catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }))
        : { ok: false, error: 'bankacct_not_configured', missing: bankMissing(env) };
      if (barobillConfigured(env)) {
        const sync = await runBarobillSync(env).catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
        const data = await corpcardData(env, url.searchParams.get('month') || undefined);
        const status = await corpcardStatus(env, data).catch(() => null);
        return json({ ok: true, provider: 'barobill', sync, bank, data, status });
      }
      if (!corpcardConfigured(env)) {
        return json({
          ok: false, error: 'not_configured',
          missing_barobill: baroMissing(env),
          bank,
          message: '카드사 연동 키가 등록되지 않았습니다. 바로빌 시크릿 4개(BAROBILL_CERTKEY/CORPNUM/ID/CARDNUM)를 등록하면 바로 동작합니다.',
          message_en: 'No card provider keys configured. Set the four BAROBILL_* secrets.',
        });
      }
      const sync = await runCorpCardSync(env).catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
      const data = await corpcardData(env, url.searchParams.get('month') || undefined);
      const status = await corpcardStatus(env, data).catch(() => null);
      return json({ ok: true, sync, bank, data, status });
    }

    /* ── 🏦 신한은행 계좌 입출금 (bankacct-sync.ts) ────────────────────────────
       급여 이체·임대료처럼 계좌에서 바로 나가는 돈. 손익계산서(reports/statement)가
       이 테이블(bankacct_transactions)의 출금분을 실지출로 읽는다.
       ⚠️ 새 API 등록 3종 세트: index.ts 게이트 + api-mango 위임 가드
          + (재무 데이터라) TEACHER_BLOCKED_PREFIXES — 셋 다 했다(2026-08-14). */
    if (method === 'POST' && path === '/api/admin/bankacct/sync') {
      if (!bankConfigured(env)) {
        return json({
          ok: false, error: 'not_configured', missing: bankMissing(env),
          message: '계좌 연동 키가 없습니다. BAROBILL_BANK_ACCTNUM(계좌번호)을 등록하면 켜집니다(CERTKEY·CORPNUM·ID 는 카드 연동과 공유).',
          message_en: 'Bank sync not configured. Set BAROBILL_BANK_ACCTNUM.',
        });
      }
      const sync = await runBankSync(env).catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
      const data = await bankacctData(env, url.searchParams.get('month') || undefined);
      const status = await bankacctStatus(env, data).catch(() => null);
      return json({ ok: true, provider: 'barobill-bank', sync, data, status });
    }
    /* 🧪 자가진단 — 실제 조회하되 dryRun 으로 적재만 안 한다(카드 selftest 와 같은 방식) */
    if (method === 'POST' && path === '/api/admin/bankacct/selftest') {
      if (!bankConfigured(env)) {
        return json({ ok: false, error: 'not_configured', missing: bankMissing(env) });
      }
      const result = await runBankSync(env, { dryRun: true })
        .catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
      return json({ ok: true, provider: 'barobill-bank', demo: false, result });
    }
    if (method === 'GET' && path === '/api/admin/bankacct/transactions') {
      const data = await bankacctData(env, url.searchParams.get('month') || undefined);
      const status = await bankacctStatus(env, data).catch(() => null);
      return json({ ok: true, configured: bankConfigured(env), missing: bankMissing(env), data, status });
    }

    /* 🧪 연동 자가진단  POST /api/admin/corpcard/selftest
       «키가 맞나 / CODEF 가 응답하나 / 파싱이 되나» 를 샌드박스 호스트로 확인한다.
       ⛔ 돌아오는 건 CODEF 의 데모 거래다. 그래서 dryRun 고정 — D1 에 한 줄도 안 쓰고,
          «마지막 동기화» 기록도 안 덮는다. 화면에서도 회계 표가 아니라 진단 상자에만 뜬다. */
    if (method === 'POST' && path === '/api/admin/corpcard/selftest') {
      /* 바로빌은 «연습용 응답» 이라는 개념이 없다(실계정 = 실데이터). 그래서 자가진단도
         실제 조회를 하되 dryRun 으로 **적재만 안 한다** — 접속·인증·파싱까지 확인된다. */
      if (barobillConfigured(env)) {
        const result = await runBarobillSync(env, { dryRun: true })
          .catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
        return json({ ok: true, provider: 'barobill', demo: false, result });
      }
      if (!corpcardConfigured(env)) {
        return json({ ok: false, error: 'not_configured', missing_barobill: baroMissing(env) });
      }
      const result = await runCorpCardSync(env, { base: CODEF_SANDBOX_BASE, dryRun: true })
        .catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
      return json({ ok: true, demo: true, result });
    }
    if (method === 'GET' && path === '/api/admin/corpcard/transactions') {
      const configured = corpcardConfigured(env);
      // 🔬 진단(2026-08-13): 시크릿 4개를 등록했는데 런타임이 codef_not_configured 를 돌려줘,
      //    «활성 배포판에 어떤 키가 보이는지» 를 불리언으로만 노출한다(값은 절대 노출 금지).
      const have = {
        client_id: !!(env as any).CODEF_CLIENT_ID,
        client_secret: !!(env as any).CODEF_CLIENT_SECRET,
        connected_id: !!(env as any).CODEF_CONNECTED_ID,
        api_base: (env as any).CODEF_API_BASE || null,
        // env 에 실린 바인딩 «이름» 전부(값 없음) — 시크릿이 env 로 안 오는 계층을 찾는 중
        env_keys: Object.keys(env as any).sort(),
        // 길이만(값 미노출): 원본 vs ASCII 소독 후 — 붙여넣기 오염(제어문자·CR) 판정용
        id_len: [String((env as any).CODEF_CLIENT_ID || '').length, String((env as any).CODEF_CLIENT_ID || '').replace(/[^\x20-\x7E]/g, '').trim().length],
        secret_len: [String((env as any).CODEF_CLIENT_SECRET || '').length, String((env as any).CODEF_CLIENT_SECRET || '').replace(/[^\x20-\x7E]/g, '').trim().length],
        // 지문(SHA-256 앞 8자리, 값 미노출) — 로컬에서 성공한 키와 «같은 값»인지 대조용
        id_fp: await secretFp8((env as any).CODEF_CLIENT_ID),
        secret_fp: await secretFp8((env as any).CODEF_CLIENT_SECRET),
      };
      // 💳 바로빌 진단 — 값은 절대 노출하지 않고 «어느 항목이 비었는지» 이름만 (2026-08-14)
      const barobill = {
        configured: barobillConfigured(env),
        missing: baroMissing(env),
        ws: baroCreds(env).ws,          // 접속 주소는 값이 아니라 설정이라 그대로 보여 준다
      };
      const data = await corpcardData(env, url.searchParams.get('month') || undefined);
      const status = await corpcardStatus(env, data).catch(() => null);
      /* ⚠️ (2026-08-13) 예전엔 여기서 «적재분이 없으면 codef_not_configured» 로 답했다.
         그래서 키가 멀쩡한데도(=샌드박스 계정이라 조회만 막힌 상태) 화면은 «연동 안 됨» 이라고
         말했고, 진짜 원인(CF-00017)은 아무 데도 안 보였다. 이제는 항상 ok:true 로 답하고
         «무엇이 왜 비었는지» 는 status 가 설명한다. */
      return json({ ok: true, configured, have, barobill, data, status });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       📇 강사 «연락처» 연결  GET/POST /api/admin/teacher-contacts
       ───────────────────────────────────────────────────────────────────────
       [왜] 8/7 결석 알림을 만들다 «강사에게 닿을 방법이 없다» 는 걸 알았다.
            · `teachers`(수업 배정의 기준)에는 연락처 컬럼이 **아예 없다**
            · `teacher_profiles`(연락처가 있는 곳)의 `linked_teacher_id` 는 **전 행 NULL**
            → 수업 → 담당 강사 → 연락처로 가는 다리가 끊겨 있었다. 그래서 8/7 18:00
              레벨테스트에서 강사가 빈 방을 30분 지켰는데 아무 알림도 못 갔다.
       [무엇] 사람이 한 번 «이 원부 강사 = 이 프로필» 을 정한다. `linked_teacher_id` 에만 쓴다.
              (계정↔원부는 teacher_account_links 가 담당 — 이건 원부↔연락처로 서로 다른 다리다)

       🌏 [연락 수단의 현실] 실측: 프로필 30건 중 전화 22(그중 **21건이 필리핀 09xx**, 한국 0),
           이메일 22, 카톡ID 20.  SOLAPI 클라이언트에는 국제 발송 처리가 없고, 카카오 알림톡은
           «한국 번호» 기반이라 kakao_id 로는 못 보낸다.
           → **지금 자동으로 닿는 국제 수단은 이메일뿐**이다. 화면이 그 사실을 숨기지 않고
             행마다 «자동 알림 가능/불가»를 그대로 보여 준다. 안 그러면 연결해 놓고도
             왜 안 가는지 아무도 모른다(=오늘 겪은 그 상황).
       ═══════════════════════════════════════════════════════════════════════ */
    if (path === '/api/admin/teacher-contacts') {
      const normName = (s: any) => String(s || '').toUpperCase().trim();
      const wordsOf = (s: any) => normName(s).split(/[\s·・,/()[\]-]+/).filter(Boolean);
      const isPhPhone = (p: any) => /^(\+?63|0)9\d/.test(String(p || '').replace(/[\s-]/g, ''));
      const isKrPhone = (p: any) => /^(\+?82|0)10/.test(String(p || '').replace(/[\s-]/g, ''));

      if (method === 'GET') {
        const [rosterRs, profRs] = await Promise.all([
          env.DB.prepare(`SELECT id, name FROM teachers WHERE COALESCE(active,1) = 1 ORDER BY name`).all(),
          env.DB.prepare(
            `SELECT id, korean_name, english_name, phone, email, kakao_id, status, linked_teacher_id
               FROM teacher_profiles ORDER BY COALESCE(english_name, korean_name)`
          ).all(),
        ]);
        const roster = (rosterRs.results || []) as any[];
        const profiles = (profRs.results || []) as any[];

        const items = roster.map((t: any) => {
          const target = normName(t.name);
          const linked = profiles.find((p: any) => String(p.linked_teacher_id || '') === String(t.id)) || null;
          /* 후보는 «낱말 경계» 로만 — 'Anna' 가 'HANNAH' 안에 우연히 들어간 것은 후보가 아니다.
             (같은 규칙이 api-teacher.ts·absent-sweep.ts 에도 있다. 세 곳이 어긋나면 사고다) */
          const cands = linked ? [] : profiles.filter((p: any) => {
            if (p.linked_teacher_id) return false;               // 이미 남에게 연결된 프로필은 후보 아님
            for (const nm of [p.english_name, p.korean_name]) {
              const a = normName(nm);
              if (!a) continue;
              if (a === target) return true;
              if (wordsOf(a).indexOf(target) >= 0 || wordsOf(target).indexOf(a) >= 0) return true;
            }
            return false;
          });
          const src = linked;
          const email = src?.email || null;
          const phone = src?.phone || null;
          const kakao = src?.kakao_id || null;
          return {
            teacher_id: String(t.id), teacher_name: t.name,
            linked_profile_id: linked ? String(linked.id) : null,
            linked_profile_name: linked ? (linked.english_name || linked.korean_name) : null,
            email, phone, kakao_id: kakao,
            phone_region: phone ? (isPhPhone(phone) ? 'PH' : isKrPhone(phone) ? 'KR' : 'other') : null,
            /* 🔔 «자동 알림이 실제로 가는가» — 화면에 그대로 보여 준다.
               email 이면 국제 가능, 한국 번호면 문자도 가능, 필리핀 번호·카톡ID 뿐이면 자동은 불가. */
            reachable: !!email || (phone ? isKrPhone(phone) : false),
            reach_by: email ? 'email' : (phone && isKrPhone(phone) ? 'sms' : null),
            candidates: cands.map((p: any) => ({
              id: String(p.id), name: p.english_name || p.korean_name,
              email: p.email || null, phone: p.phone || null, kakao_id: p.kakao_id || null,
            })),
          };
        });
        const reachable = items.filter(i => i.reachable).length;
        return json({ ok: true, items, summary: { total: items.length, linked: items.filter(i => i.linked_profile_id).length, reachable } });
      }

      if (method === 'POST') {
        const b = await parseJsonBody(request);
        if (!b || !b.teacher_id) return invalidBody(['teacher_id']);
        const tid = String(b.teacher_id).trim();
        const pid = String(b.profile_id ?? '').trim();
        let actor = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name) actor = a.name; } catch {}

        if (!pid) {   // 해제 — 이 원부에 붙은 프로필의 연결만 푼다
          await env.DB.prepare(`UPDATE teacher_profiles SET linked_teacher_id = NULL, updated_at = ? WHERE CAST(linked_teacher_id AS TEXT) = ?`)
            .bind(Date.now(), tid).run();
          return json({ ok: true, unlinked: true, teacher_id: tid });
        }
        const prof: any = await env.DB.prepare(
          `SELECT id, korean_name, english_name, phone, email, kakao_id FROM teacher_profiles WHERE CAST(id AS TEXT) = ? LIMIT 1`
        ).bind(pid).first();
        if (!prof) return json({ ok: false, error: 'profile_not_found', message: '프로필을 찾을 수 없습니다.', message_en: 'Profile not found.' }, 404);
        // 한 원부에 두 프로필이 붙지 않게 — 먼저 기존 연결을 푼다
        await env.DB.prepare(`UPDATE teacher_profiles SET linked_teacher_id = NULL, updated_at = ? WHERE CAST(linked_teacher_id AS TEXT) = ?`)
          .bind(Date.now(), tid).run();
        await env.DB.prepare(`UPDATE teacher_profiles SET linked_teacher_id = ?, updated_at = ? WHERE CAST(id AS TEXT) = ?`)
          .bind(Number(tid), Date.now(), pid).run();
        try {
          await writeClassAudit(env, {
            action: 'teacher_contact_link', actor, actor_role: 'admin', source: 'admin_ui',
            teacher_name: String(prof.english_name || prof.korean_name || ''),
            detail: JSON.stringify({ teacher_id: tid, profile_id: pid, has_email: !!prof.email, has_phone: !!prof.phone }),
          });
        } catch {}
        return json({
          ok: true, teacher_id: tid, profile_id: pid,
          name: prof.english_name || prof.korean_name,
          email: prof.email || null, phone: prof.phone || null, kakao_id: prof.kakao_id || null,
          reachable: !!prof.email || isKrPhone(prof.phone),
        });
      }
    }

    // 목록 — 강사 계정 + 지금 연결 상태 + 원부 후보. 화면 한 장에 필요한 것만 한 번에.
    if (method === 'GET' && path === '/api/admin/teacher-links') {
      try {
        const [accRs, rosterRs, linkRs] = await Promise.all([
          env.DB.prepare(
            `SELECT username, name, role FROM admin_account
              WHERE role LIKE '%teacher%' OR username LIKE 'mangoi_%' OR username LIKE 'hq_t_%'
              ORDER BY username`
          ).all<any>().catch(() => ({ results: [] as any[] })),
          env.DB.prepare(`SELECT CAST(id AS TEXT) AS id, name FROM teachers ORDER BY name`)
            .all<any>().catch(() => ({ results: [] as any[] })),
          env.DB.prepare(`SELECT username, teacher_id, teacher_name, linked_by, linked_at FROM teacher_account_links`)
            .all<any>().catch(() => ({ results: [] as any[] })),
        ]);
        const roster = (rosterRs.results || []) as any[];
        const linkBy: Record<string, any> = {};
        for (const l of (linkRs.results || []) as any[]) linkBy[String(l.username)] = l;

        // 이름으로 «지금은» 어디에 붙는지 — 연결하기 전에 무엇이 틀렸는지 눈으로 보라고 같이 준다.
        const nrm = (s: any) => String(s || '').toUpperCase().trim();
        const words = (s: any) => nrm(s).split(/[\s·・,/()[\]-]+/).filter(Boolean);
        const accounts = ((accRs.results || []) as any[]).map((a) => {
          const uname = String(a.username || '');
          const tname = String(a.name || '').trim();
          const exact = roster.filter((r) => nrm(r.name) === nrm(tname));
          const word = roster.filter((r) => {
            const x = nrm(r.name), y = nrm(tname);
            return !!x && !!y && x !== y && (words(x).indexOf(y) >= 0 || words(y).indexOf(x) >= 0);
          });
          const auto = exact.length ? exact : (word.length === 1 ? word : []);
          const link = linkBy[uname] || null;
          return {
            username: uname,
            name: tname,
            role: a.role || '',
            // 이름이 계정 아이디 그대로면 «아직 아무도 이름을 안 넣은» 계정이다.
            name_is_username: nrm(tname) === nrm(uname),
            linked_teacher_id: link ? String(link.teacher_id) : null,
            linked_teacher_name: link ? String(link.teacher_name || '') : null,
            linked_at: link ? Number(link.linked_at) || null : null,
            auto_match: auto.length === 1 ? { id: String(auto[0].id), name: String(auto[0].name) } : null,
            auto_candidates: auto.length > 1 ? auto.map((r) => ({ id: String(r.id), name: String(r.name) })) : [],
            status: link ? 'linked' : (auto.length === 1 ? 'auto' : (auto.length > 1 ? 'ambiguous' : 'unlinked')),
          };
        });
        return json({ ok: true, accounts, roster });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'query_failed' }, 500);
      }
    }

    // 연결 / 해제 — teacher_id 를 비우면 해제.
    if (method === 'POST' && path === '/api/admin/teacher-links') {
      const b = await parseJsonBody(request);
      const uname = String(b?.username || '').trim();
      const tid = String(b?.teacher_id ?? '').trim();
      if (!uname) return invalidBody(['username']);
      try {
        if (!tid) {
          await env.DB.prepare(`DELETE FROM teacher_account_links WHERE username = ?`).bind(uname).run();
          return json({ ok: true, unlinked: true, username: uname });
        }
        // 원부에 실제로 있는 id 인지 확인한다 — 오타로 존재하지 않는 사람에게 묶이면 또 «수업 없음»이다.
        const row = await env.DB.prepare(`SELECT CAST(id AS TEXT) AS id, name FROM teachers WHERE CAST(id AS TEXT) = ?`)
          .bind(tid).first<any>();
        if (!row) return json({ ok: false, error: 'teacher_not_found' }, 404);
        let actorName = 'admin';
        try { const a = await getAdminActor(request, env as any); if (a?.name || a?.username) actorName = String(a.name || a.username); } catch {}
        await env.DB.prepare(
          `INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_by, linked_at)
             VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(username) DO UPDATE SET
             teacher_id = excluded.teacher_id, teacher_name = excluded.teacher_name,
             linked_by = excluded.linked_by, linked_at = excluded.linked_at`
        ).bind(uname, String(row.id), String(row.name || ''), actorName, Date.now()).run();
        return json({ ok: true, username: uname, teacher_id: String(row.id), teacher_name: String(row.name || '') });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'save_failed' }, 500);
      }
    }

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

    /* ── 🎁 학생측 추천 코드 (홈 '내 추천 코드' 칩이 부르는 경로) ─────────────────
     * [왜] 관리자 카드(/api/admin/referrals)는 있는데 **학생이 코드를 받을 곳이 없었다.**
     *      그래서 표가 영영 비어 있었다. 홈 화면은 이미 이 경로를 부르고 있었다(index.html).
     * ⚠️ 코드는 uid 로부터 **항상 같은 값**이 나오게 만든다 — 새로고침마다 코드가 바뀌면
     *    친구에게 이미 보낸 코드가 죽는다.
     */
    if (path.startsWith('/api/referral/')) {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS referral_codes (code TEXT PRIMARY KEY, uid TEXT NOT NULL UNIQUE, created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_uid TEXT NOT NULL, referred_uid TEXT NOT NULL, code TEXT, status TEXT DEFAULT 'pending', reward_points INTEGER DEFAULT 0, created_at INTEGER, UNIQUE(referrer_uid, referred_uid));`); } catch {}
    }
    if (method === 'GET' && path === '/api/referral/my-code') {
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      try {
        const has: any = await env.DB.prepare(`SELECT code FROM referral_codes WHERE uid = ? COLLATE NOCASE`).bind(uid).first();
        if (has?.code) return json({ ok: true, code: String(has.code) });
        // uid 로 결정적 코드 생성(같은 사람 = 항상 같은 코드). 충돌하면 뒤에 한 글자씩 붙여 피한다.
        let h = 0;
        for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
        const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 헷갈리는 0/O/1/I 제외
        const make = (seed: number, len: number) => {
          let s = '', v = seed;
          for (let i = 0; i < len; i++) { s += AB[v % AB.length]; v = Math.floor(v / AB.length) + 7; }
          return s;
        };
        let code = 'MG' + make(h, 4);
        for (let t = 1; t <= 8; t++) {
          const dup: any = await env.DB.prepare(`SELECT 1 AS x FROM referral_codes WHERE code = ?`).bind(code).first();
          if (!dup) break;
          code = 'MG' + make(h + t * 977, 4);
        }
        await env.DB.prepare(`INSERT OR IGNORE INTO referral_codes (code, uid, created_at) VALUES (?, ?, ?)`)
          .bind(code, uid, Date.now()).run();
        const now2: any = await env.DB.prepare(`SELECT code FROM referral_codes WHERE uid = ? COLLATE NOCASE`).bind(uid).first();
        return json({ ok: true, code: String(now2?.code || code) });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }
    if (method === 'POST' && path === '/api/referral/use') {
      const b = await parseJsonBody(request);
      const code = String(b?.code || '').trim().toUpperCase();
      const uid = String(b?.uid || '').trim();
      if (!code || !uid) return invalidBody(['code', 'uid']);
      try {
        const owner: any = await env.DB.prepare(`SELECT uid FROM referral_codes WHERE code = ?`).bind(code).first();
        if (!owner?.uid) return json({ ok: false, error: 'code_not_found' }, 404);
        if (String(owner.uid).toLowerCase() === uid.toLowerCase()) return json({ ok: false, error: 'self_referral' }, 400);
        /* ⛔ 포인트를 여기서 바로 주지 않는다. 적립 규칙(얼마·언제·회수 조건)이 아직 확정 전이고,
         *    uid 만으로 호출되는 경로에서 자동 지급하면 코드만 알면 무한 적립이 된다.
         *    'pending' 으로 남기고 관리자 카드에서 확인 후 지급한다. */
        await env.DB.prepare(
          `INSERT OR IGNORE INTO referrals (referrer_uid, referred_uid, code, status, reward_points, created_at)
             VALUES (?, ?, ?, 'pending', 500, ?)`
        ).bind(String(owner.uid), uid, code, Date.now()).run();
        return json({ ok: true, status: 'pending', referrer_uid: String(owner.uid),
                      message_ko: '추천이 접수되었습니다. 확인 후 포인트가 지급됩니다.',
                      message_en: 'Referral received. Points will be granted after review.' });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'save_failed' }, 500); }
    }

    /* ── 📅 학생·학부모측 1:1 상담 예약 ────────────────────────────────────────
     * 관리자 쪽(슬롯 열기·목록·취소)은 이미 라이브인데 **학부모가 예약할 창구가 없었다.**
     * 그래서 상담 슬롯을 열어도 아무도 잡을 수 없었다. 그 반쪽을 잇는다. */
    if (path.startsWith('/api/counseling/')) {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_slots (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_uid TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, status TEXT DEFAULT 'open', created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER, staff_uid TEXT, date TEXT, start_time TEXT, parent_name TEXT, parent_phone TEXT, student_uid TEXT, topic TEXT, status TEXT DEFAULT '예약', created_at INTEGER);`); } catch {}
      /* 🪤 `CREATE TABLE IF NOT EXISTS` 는 **표가 이미 있으면 아무것도 안 한다** — 컬럼이 모자라도 그대로 둔다.
       *    실제로 운영 DB 의 counseling_slots 에는 `status` 컬럼이 없어서 조회가 통째로 500 이었다
       *    (라이브 확인: "D1_ERROR: no such column: status"). 그래서 빠진 칸을 멱등하게 보강한다.
       *    ⚠️ 새 컬럼을 쓰는 코드를 올릴 때는 DDL 뿐 아니라 **ALTER 도 같이** 넣을 것. */
      for (const ddl of [
        `ALTER TABLE counseling_slots ADD COLUMN status TEXT DEFAULT 'open'`,
        `ALTER TABLE counseling_slots ADD COLUMN duration_min INTEGER DEFAULT 30`,
        `ALTER TABLE counseling_slots ADD COLUMN staff_uid TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN status TEXT DEFAULT '예약'`,
        `ALTER TABLE counseling_bookings ADD COLUMN slot_id INTEGER`,
        `ALTER TABLE counseling_bookings ADD COLUMN parent_phone TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN student_uid TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN topic TEXT`,
      ]) { try { await env.DB.exec(ddl); } catch {} }   // 이미 있으면 에러 → 무시가 정상
    }
    if (method === 'GET' && path === '/api/counseling/available-slots') {
      const from = String(url.searchParams.get('from') || today()).trim();
      const to = String(url.searchParams.get('to') || '').trim();
      try {
        const rs = to
          ? await env.DB.prepare(
              `SELECT id, date, start_time, duration_min FROM counseling_slots
                WHERE status = 'open' AND date >= ? AND date <= ? ORDER BY date, start_time LIMIT 200`).bind(from, to).all()
          : await env.DB.prepare(
              `SELECT id, date, start_time, duration_min FROM counseling_slots
                WHERE status = 'open' AND date >= ? ORDER BY date, start_time LIMIT 200`).bind(from).all();
        return json({ ok: true, slots: rs.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }
    if (method === 'POST' && path === '/api/counseling/book') {
      const b = await parseJsonBody(request);
      const slotId = Number(b?.slot_id) || 0;
      const name = String(b?.parent_name || '').trim();
      const phone = String(b?.parent_phone || '').trim();
      if (!slotId || !name || !phone) return invalidBody(['slot_id', 'parent_name', 'parent_phone']);
      try {
        const slot: any = await env.DB.prepare(`SELECT id, staff_uid, date, start_time, status FROM counseling_slots WHERE id = ?`).bind(slotId).first();
        if (!slot) return json({ ok: false, error: 'slot_not_found' }, 404);
        // ⚠️ 이미 잡힌 자리면 거절한다 — 둘이 같은 시간에 잡히면 한 명은 헛걸음한다.
        if (String(slot.status) !== 'open') return json({ ok: false, error: 'slot_taken' }, 409);
        const upd: any = await env.DB.prepare(`UPDATE counseling_slots SET status = 'booked' WHERE id = ? AND status = 'open'`).bind(slotId).run();
        if (!Number(upd?.meta?.changes)) return json({ ok: false, error: 'slot_taken' }, 409);  // 동시 예약 경합
        await env.DB.prepare(
          `INSERT INTO counseling_bookings (slot_id, staff_uid, date, start_time, parent_name, parent_phone, student_uid, topic, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, '예약', ?)`
        ).bind(slotId, slot.staff_uid, slot.date, slot.start_time, name, phone,
               String(b?.student_uid || '').trim() || null, String(b?.topic || '').trim() || null, Date.now()).run();
        return json({ ok: true, booked: { date: slot.date, start_time: slot.start_time },
                      message_ko: '상담이 예약되었습니다.', message_en: 'Your counseling session is booked.' });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'save_failed' }, 500); }
    }

    // ── 📅 1:1 상담 자동 예약 (card-counseling-booking) ──
    //   같은 카드의 버튼 3개(bookings 조회·slot/open·cancel)를 함께 구현해 카드 완동작.
    //   status 값은 프런트 색상 분기('취소'=red, '완료'=green)와 맞춰 한글 사용.
    if (path.startsWith('/api/admin/counseling/')) {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_slots (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_uid TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, status TEXT DEFAULT 'open', created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS counseling_bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER, staff_uid TEXT, date TEXT, start_time TEXT, parent_name TEXT, parent_phone TEXT, student_uid TEXT, topic TEXT, status TEXT DEFAULT '예약', created_at INTEGER);`); } catch {}
      /* 🪤 위 `/api/counseling/` 블록과 같은 함정 — CREATE TABLE IF NOT EXISTS 는 표가 이미 있으면
       *    컬럼이 모자라도 그대로 둔다. 이 블록만 ALTER 가 빠져 있어서 슬롯 생성이 항상
       *    "no such column: staff_uid" 로 500 이었다(2026-08-19 실측). */
      for (const ddl of [
        `ALTER TABLE counseling_slots ADD COLUMN status TEXT DEFAULT 'open'`,
        `ALTER TABLE counseling_slots ADD COLUMN duration_min INTEGER DEFAULT 30`,
        `ALTER TABLE counseling_slots ADD COLUMN staff_uid TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN status TEXT DEFAULT '예약'`,
        `ALTER TABLE counseling_bookings ADD COLUMN slot_id INTEGER`,
        `ALTER TABLE counseling_bookings ADD COLUMN parent_phone TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN student_uid TEXT`,
        `ALTER TABLE counseling_bookings ADD COLUMN topic TEXT`,
      ]) { try { await env.DB.exec(ddl); } catch {} }   // 이미 있으면 에러 → 무시가 정상
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

    // 🎮 (2026-08-11 삭제) 영어 배틀 leaderboard/history 핸들러 제거 — 카드·게이트째 삭제.
    //   game_progress(살아있는 게임 기록 테이블)는 건드리지 않는다 — 여기선 읽기만 했다.

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
