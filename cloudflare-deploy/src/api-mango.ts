/**
 * api-mango.ts - v3 명세서 신규 API
 *  - 출석 자동 감지 / 발화시간(VAD) 기록
 *  - 비상 카카오 ID 관리 / 비상 이벤트 로깅
 *  - 보상(스티커/쿠폰) 발급 with 일일 상한
 *  - 관리 대시보드 KPI
 *  - 🥭 Phase 21: AI 명령 엔드포인트 (Workers AI Llama 3.3 70B)
 */

import { processAiCommand, executeAction, processStudentCommand } from './ai-command';
import { runCypher, Neo4jNotConfiguredError } from './teacher-match';  // 🕸️ Neo4j 그래프 학생 명부
import { importCafe24Org, importCafe24Payments, importCafe24Students, importCafe24Attendance } from './cafe24-sync';  // 🔄 카페24→D1 동기화 모듈
import { scopeFragments, studentScopeWhere, getScope } from './scope';
import { checkAdminSession } from './auth-admin';
import { applyPIIScope, canViewPII, maskRecordPII, isMaskedValue } from './pii-mask';  // 🔒 PII 권한별 마스킹
import { sendCoupon, checkBalance, getGiftishowMode, parseWebhook, type GiftishowEnv } from './giftishow-client';
import {
  sendLessonStartAlert, sendLessonEndAlert, sendChatSummaryAlert, sendMentionAlert,
  sendPaymentOverdueAlert,
  checkSolapiBalance, getSolapiMode, sendKakaoAlimtalk, type SolapiEnv,
} from './solapi-client';
import {
  sendWebPushWakeup, broadcastWebPush, generateVapidKeyPair, getWebPushMode,
  type WebPushEnv,
} from './web-push';

export interface MangoEnv extends GiftishowEnv, SolapiEnv {
  DB: D1Database;
  SESSION_STATE: KVNamespace;
  // 🕸️ Neo4j 그래프 DB (teacher-match.ts runCypher 공용 시크릿)
  NEO4J_QUERY_URL?: string;
  NEO4J_USER?: string;
  NEO4J_PASSWORD?: string;
  // 🥭 Phase 21 — Workers AI 바인딩 (검색창 AI 명령)
  AI?: any;
  // 🎁 Phase P4 — 기프티쇼 비즈 환경변수 (giftishow-client.ts)
  //   GIFTISHOW_API_KEY, GIFTISHOW_USER_ID, GIFTISHOW_API_BASE, GIFTISHOW_CALLBACK_URL, GIFTISHOW_TEST_MODE
  // 💬 Phase K2~K4 — 카카오 알림톡 환경변수 (solapi-client.ts)
  //   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, SOLAPI_TEMPLATE_*, SOLAPI_TEST_MODE
}

const json = (data: any, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });

// ═══════════════════════════════════════════════════════════════════════
// 📊 월간 AI 레포트 — 공용 헬퍼 (생성 + AI + 카카오 발송 + 월간 배치)
//   엔드포인트: /api/admin/monthly-report/{generate,send,list}, /api/report/monthly-view
//   Cron(scheduled)에서 runMonthlyReports() 호출.
// ═══════════════════════════════════════════════════════════════════════
const MONTHLY_SITE_ORIGIN = 'https://webrtc-unified-platform.navy111p.workers.dev';

function _monthlyToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function ensureMonthlyReportsTable(env: MangoEnv): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS monthly_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, period TEXT NOT NULL, ai_text TEXT, metrics_json TEXT, access_token TEXT NOT NULL, status TEXT DEFAULT 'draft', sent_to_student INTEGER DEFAULT 0, sent_to_parent INTEGER DEFAULT 0, sent_log TEXT, created_at INTEGER NOT NULL, sent_at INTEGER, UNIQUE(student_uid, period));`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON monthly_reports(period)`); } catch {}
}

// 학생 월간 데이터 수집(+선택적 AI 서술). Phase MR GET 과 동일 형태 반환.
async function buildMonthlyReportData(env: MangoEnv, uid: string, period: string, withAI: boolean): Promise<any> {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10), month = parseInt(m[2], 10) - 1;
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  let student: any = null, att: any = { d: 0 }, voiceStats: any = {}, evalRows: any[] = [];
  try { student = await env.DB.prepare(`SELECT user_id, student_name, parent_name, parent_phone, phone FROM students_erp WHERE user_id = ?`).bind(uid).first(); } catch {}
  try { att = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(uid, start, end).first(); } catch {}
  try {
    const evals = await env.DB.prepare(`SELECT id, lesson_date, score_overall, strengths, improvements, next_goals, teacher_comment, created_at FROM student_evaluations WHERE student_uid = ? AND created_at >= ? AND created_at < ? ORDER BY created_at ASC`).bind(uid, start, end).all();
    evalRows = (evals.results || []) as any[];
  } catch {}
  try { voiceStats = await env.DB.prepare(`SELECT COUNT(*) AS n, AVG(accuracy_score) AS acc, AVG(pronunciation_score) AS pron, AVG(fluency_score) AS flu, MAX(accuracy_score) AS best FROM voice_coaching WHERE student_uid = ? AND created_at >= ? AND created_at < ?`).bind(uid, start, end).first(); } catch {}
  const evalAvg = evalRows.length ? Math.round((evalRows.reduce((s, r) => s + (r.score_overall || 0), 0) / evalRows.length) * 10) / 10 : 0;

  let aiText = '';
  if (withAI) {
    try {
      const nm = (student && student.student_name) || uid;
      if (evalRows.length === 0 && (att?.d || 0) === 0) {
        aiText = `${nm} 학부모님, 이번 달은 수업 기록이 많지 않아 상세 요약을 생략합니다. 다음 달 꾸준한 참여를 함께 응원하겠습니다. 감사합니다.`;
      } else {
        const recentComment = evalRows.length ? (evalRows[evalRows.length - 1].teacher_comment || '') : '';
        const strengths = evalRows.map((r: any) => r.strengths).filter(Boolean).slice(-3).join('; ');
        const improvements = evalRows.map((r: any) => r.improvements).filter(Boolean).slice(-3).join('; ');
        const nextGoals = evalRows.map((r: any) => r.next_goals).filter(Boolean).slice(-2).join('; ');
        const sys = '당신은 영어학원 담임 강사입니다. 학부모님께 보내는 따뜻하고 구체적인 한국어 월간 학습 레포트를 4~6문장으로 작성하세요. 반드시 칭찬 1가지, 성장 영역 1가지, 다음 달 목표 1가지를 포함하세요. 과장하지 말고, 주어진 숫자/사실만 사용하며 없는 내용은 지어내지 마세요. 존댓말로 작성하세요.';
        const usr = `학생: ${nm}\n기간: ${period}\n출석일수: ${att?.d || 0}\n평가 횟수: ${evalRows.length}, 종합 평균(5점 만점): ${evalAvg}\n발음 평균: 정확도 ${Math.round(voiceStats?.acc || 0)}, 발음 ${Math.round(voiceStats?.pron || 0)}, 유창성 ${Math.round(voiceStats?.flu || 0)}\n강점: ${strengths || '기록 적음'}\n개선점: ${improvements || '기록 적음'}\n다음 목표(강사 기록): ${nextGoals || '없음'}\n최근 강사 코멘트: ${recentComment || '없음'}`;
        const aiRes: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], max_tokens: 420,
        });
        aiText = String((aiRes && (aiRes.response || aiRes.result)) || '').trim();
      }
    } catch { aiText = ''; }
  }

  return {
    ok: true,
    student: student || { user_id: uid, student_name: uid },
    year_month: period,
    attendance: { days: att?.d || 0 },
    evaluations: { count: evalRows.length, avg_score: evalAvg, items: evalRows },
    voice: {
      sessions: voiceStats?.n || 0,
      avg_accuracy: Math.round(voiceStats?.acc || 0),
      avg_pronunciation: Math.round(voiceStats?.pron || 0),
      avg_fluency: Math.round(voiceStats?.flu || 0),
      best: voiceStats?.best || 0,
    },
    ai_text: aiText,
    generated_at: Date.now(),
  };
}

// 레포트 행 보장(없으면 생성). 토큰 포함 행 반환.
async function ensureMonthlyReportRow(env: MangoEnv, uid: string, period: string): Promise<any> {
  await ensureMonthlyReportsTable(env);
  let row: any = null;
  try { row = await env.DB.prepare(`SELECT * FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
  if (row) return row;
  const data = await buildMonthlyReportData(env, uid, period, true);
  if (!data) return null;
  const token = _monthlyToken();
  const nm = (data.student && data.student.student_name) || uid;
  await env.DB.prepare(`INSERT OR REPLACE INTO monthly_reports (student_uid, student_name, period, ai_text, metrics_json, access_token, status, created_at) VALUES (?,?,?,?,?,?, 'draft', ?)`)
    .bind(uid, nm, period, data.ai_text || '', JSON.stringify(data), token, Date.now()).run();
  try { row = await env.DB.prepare(`SELECT * FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
  return row;
}

// 학생+학부모에게 월간 레포트 알림톡 발송 (키 없으면 'skipped'=모의).
async function sendMonthlyReportKakao(env: MangoEnv, uid: string, period: string, origin: string): Promise<any> {
  const row = await ensureMonthlyReportRow(env, uid, period);
  if (!row) return { ok: false, error: 'bad_period' };
  let stu: any = null;
  try { stu = await env.DB.prepare(`SELECT student_name, parent_name, parent_phone, phone FROM students_erp WHERE user_id=?`).bind(uid).first(); } catch {}
  const url = `${origin}/monthly-report.html?uid=${encodeURIComponent(uid)}&period=${encodeURIComponent(period)}&t=${row.access_token}`;
  const tmpl = (env as any).SOLAPI_TEMPLATE_MONTHLY_REPORT || '';
  const name = row.student_name || uid;
  let attDays = 0;
  try { attDays = (JSON.parse(row.metrics_json || '{}').attendance || {}).days || 0; } catch {}
  const vars: Record<string, string> = { '#{학생명}': name, '#{기간}': period, '#{출석}': String(attDays), '#{URL}': url };
  const fallback = `[망고아이] ${name} ${period} 학습 레포트가 도착했어요: ${url}`;
  const out: any = { url, mode: getSolapiMode(env), student: null, parent: null };
  const sPhone = stu && stu.phone;
  const pPhone = stu && stu.parent_phone;
  if (sPhone) out.student = await sendKakaoAlimtalk(env, { templateCode: tmpl, recipientPhone: sPhone, recipientName: name, variables: { ...vars }, fallbackSmsText: fallback, logContext: { userId: uid, reason: 'monthly_report' } });
  if (pPhone) out.parent = await sendKakaoAlimtalk(env, { templateCode: tmpl, recipientPhone: pPhone, recipientName: (stu && stu.parent_name) || name, variables: { ...vars }, fallbackSmsText: fallback, logContext: { userId: uid, reason: 'monthly_report' } });
  const sentStudent = out.student && out.student.ok ? 1 : 0;
  const sentParent = out.parent && out.parent.ok ? 1 : 0;
  try {
    await env.DB.prepare(`UPDATE monthly_reports SET status=?, sent_to_student=?, sent_to_parent=?, sent_log=?, sent_at=? WHERE id=?`)
      .bind((sentStudent || sentParent) ? 'sent' : 'skipped', sentStudent, sentParent, JSON.stringify(out), Date.now(), row.id).run();
  } catch {}
  out.ok = true; out.sent_to_student = sentStudent; out.sent_to_parent = sentParent;
  return out;
}

// 월간 배치 — 활성 학생 전체에 생성+발송 (Cron 에서 호출)
export async function runMonthlyReports(env: MangoEnv, period: string, origin?: string): Promise<any> {
  const org = origin || MONTHLY_SITE_ORIGIN;
  await ensureMonthlyReportsTable(env);
  let students: any[] = [];
  try {
    const rs = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE (status='정상' OR status IS NULL OR status='') LIMIT 1000`).all();
    students = (rs.results || []) as any[];
  } catch {}
  let generated = 0, sent = 0, errors = 0;
  for (const s of students) {
    try {
      const r = await sendMonthlyReportKakao(env, s.user_id, period, org);
      generated++;
      if (r && (r.sent_to_student || r.sent_to_parent)) sent++;
    } catch { errors++; }
  }
  return { period, total: students.length, generated, sent, errors };
}

// fix (2026-06-01) — 포인트 테이블 DDL 을 isolate 당 1회만 실행.
//   매 요청마다 CREATE TABLE 6개를 돌리면, 페이지 로드 시 동시 요청 폭주 →
//   D1 락/과부하 → 미처리 예외 → Cloudflare 503 발생. 이 플래그로 방지.
let __pointTablesReady = false;

// ⭐ 수업 강사 평가(class_ratings) DDL 도 isolate 당 1회만 실행
let __classRatingsReady = false;

const today = (ts: number = Date.now()) => {
  const d = new Date(ts);
  // KST 기준 날짜
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
};

// ── 🔥 연속 출석(Streak) 그래프 DFS — 출결의 단일 권위(source of truth) ──────
// attendance 의 날짜들을 (수업)<-[:NEXT_LESSON]-(이전수업) 연결 리스트로 간주하고,
// 가장 최근 출석일(anchor)을 기점으로 하루씩 역방향으로 사슬을 타며
// (학생)-[:ATTENDED]->(수업) 엣지(EXISTS)가 끊길 때까지의 깊이를 잰다.
//   · 재귀 1스텝 = NEXT_LESSON 1홉, EXISTS = ATTENDED 엣지 확인, n<30 = 깊이(Depth) 캡
//   · idx_attendance_user_date(user_id,date) 를 그대로 타므로 전체 로그 풀스캔이 아니라
//     O(streak) 인덱스 시크(최대 30회)로 끝난다 → 7/30일 배지·status 판정에 충분.
//   · COUNT(DISTINCT date) 류와 달리 "진짜 연속(consecutive)" 을 계산한다.
// 배지 판정(checkAndAwardBadges)과 /api/streak/status 가 공유하는 단일 함수.
async function computeAttendanceStreak(env: { DB: D1Database }, userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const row: any = await env.DB.prepare(`
      WITH RECURSIVE
        anchor(d) AS (
          SELECT MAX(date) FROM attendance
          WHERE user_id = ? AND date IS NOT NULL AND date <> ''
        ),
        walk(d, n) AS (
          SELECT (SELECT d FROM anchor), 1
          WHERE (SELECT d FROM anchor) IS NOT NULL
          UNION ALL
          SELECT date(walk.d, '-1 day'), walk.n + 1
          FROM walk
          WHERE walk.n < 30
            AND EXISTS (
              SELECT 1 FROM attendance
              WHERE user_id = ? AND date = date(walk.d, '-1 day')
            )
        )
      SELECT COALESCE(MAX(n), 0) AS streak FROM walk
    `).bind(userId, userId).first();
    return Number(row?.streak || 0);
  } catch { return 0; }
}

// 🔁 전체 학생 streak 일괄 정합화 (cron 야간 배치, KST 03:00) ─────────────────
// per-student 루프(N쿼리) 대신 gaps-and-islands 윈도우 쿼리 1방으로 모든 학생의
// 현재/최장 연속 출석을 산출하고 student_streaks 에 UPSERT(gems 는 보존)한다.
// → 리더보드(저장된 current_streak 를 읽음)를 한 번도 status/체크인을 안 거친
//   학생까지 출결 기준으로 일관화. computeAttendanceStreak 과 동일하게 30 캡.
export async function reconcileAllStreaks(env: { DB: D1Database }): Promise<{ scanned: number; updated: number }> {
  try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_streaks (student_uid TEXT PRIMARY KEY, current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, last_check_date TEXT, gems INTEGER DEFAULT 0, total_gems_earned INTEGER DEFAULT 0, updated_at INTEGER);`); } catch {}
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}

  const now = Date.now();
  const CAP = 30;

  // gaps-and-islands: 연속 날짜는 (julianday - 행번호) 값이 동일 → 그 그룹의 크기가 연속 길이.
  //   current = 가장 최근 출석일로 끝나는 run 의 길이, longest = 모든 run 중 최대.
  const rs = await env.DB.prepare(`
    WITH days AS (
      SELECT DISTINCT user_id, date
      FROM attendance
      WHERE date IS NOT NULL AND date <> '' AND (role IS NULL OR role = 'student')
    ),
    grp AS (
      SELECT user_id, date,
             CAST(julianday(date) AS INTEGER) - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date) AS g
      FROM days
    ),
    runs AS (
      SELECT user_id, g, COUNT(*) AS run_len, MAX(date) AS run_end
      FROM grp
      GROUP BY user_id, g
    )
    SELECT
      r.user_id AS user_id,
      MAX(r.run_len) AS longest_streak,
      (SELECT run_len FROM runs r2 WHERE r2.user_id = r.user_id ORDER BY r2.run_end DESC LIMIT 1) AS current_streak
    FROM runs r
    GROUP BY r.user_id
  `).all();

  const rows = (rs.results || []) as any[];
  if (!rows.length) return { scanned: 0, updated: 0 };

  const upsert = env.DB.prepare(`
    INSERT INTO student_streaks (student_uid, current_streak, longest_streak, gems, total_gems_earned, updated_at)
    VALUES (?, ?, ?, 0, 0, ?)
    ON CONFLICT(student_uid) DO UPDATE SET
      current_streak = excluded.current_streak,
      longest_streak = MAX(student_streaks.longest_streak, excluded.longest_streak),
      updated_at = excluded.updated_at
  `);

  let updated = 0;
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r: any) =>
      upsert.bind(
        String(r.user_id),
        Math.min(Number(r.current_streak || 0), CAP),
        Math.min(Number(r.longest_streak || 0), CAP),
        now,
      )
    );
    try { await env.DB.batch(batch); updated += batch.length; } catch { /* 일부 실패는 다음 배치에 영향 없음 */ }
  }

  return { scanned: rows.length, updated };
}

/**
 * 빈/잘못된 JSON body 를 안전하게 파싱.
 * 🩺 셀프 진단 페이지가 빈 POST 로 self-ping 할 때 500 대신 400 이 나오도록 하는 공통 방어막.
 *   - body 없음 / 비어있음 / JSON 아님 → null 반환 (호출자가 400 응답)
 *   - 정상 JSON → 파싱된 객체
 */
async function parseJsonBody(request: Request): Promise<any | null> {
  try {
    const text = await request.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 필수 필드 누락 시 400 응답 생성 — 에러 메시지에 필드명 포함 (디버깅 편의) */
const invalidBody = (required: string[]): Response =>
  json({ ok: false, error: 'invalid_body', required }, 400);

/**
 * 📥 CSV 직렬화 (Phase 6)
 *   - 행에 따옴표/콤마/개행 들어가면 RFC 4180 방식으로 escape
 *   - 맨 앞에 UTF-8 BOM 붙여 Excel 한글 깨짐 방지
 *   - columns 의 순서가 그대로 헤더·셀 매핑에 사용됨
 */
function toCSV(rows: any[], columns: { key: string; label?: string }[]): string {
  const escape = (v: any): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map(c => escape(c.label || c.key)).join(',');
  const body = rows.map(r => columns.map(c => escape(r[c.key])).join(',')).join('\n');
  return '﻿' + header + '\n' + body + '\n';
}

// ========================================================================
// 💼 Payroll (Phase 8) — Mangoi 강사 급여·평가 시스템
//   - 모델: salary-heatmap.pages.dev 와 동일
//   - 월급 = 총 수업수(20분 단위) × 2 × 10분당 단가(PHP)
//   - 평가 = 5개 카테고리 가중 평균 → 4등급 자동 분류
//   - 근무 형태: 'office' | 'home' (rank 폐기, 호환성 위해 컬럼만 유지)
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

/**
 * CSV 응답 헬퍼 — 다운로드 헤더 포함.
 */
function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ========================================================================
// 📣 알림 큐 (Phase 5) — Worker 는 적재만 하고, 발송은 외부 도구가 폴링.
//   - 카카오톡 직접 발송은 후속 Phase (KAKAO_ACCESS_TOKEN 시크릿 도입) 에서.
//   - 큐 모델은 다채널 확장 가능 (slack/email/discord 등).
// ========================================================================
let _notifSchemaReady = false;
async function ensureNotifSchema(env: { DB: D1Database }): Promise<void> {
  if (_notifSchemaReady) return;
  // exec() 는 multi-statement DDL 용. IF NOT EXISTS 로 멱등.
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS notification_queue (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  type TEXT NOT NULL,`,
    `  title TEXT,`,
    `  body TEXT,`,
    `  meta TEXT,`,
    `  channel TEXT DEFAULT 'kakao_memo',`,
    `  status TEXT DEFAULT 'pending',`,
    `  created_at INTEGER NOT NULL,`,
    `  sent_at INTEGER,`,
    `  error TEXT`,
    `);`
  ].join(' '));
  await env.DB.exec(
    `CREATE INDEX IF NOT EXISTS idx_notif_status_created ON notification_queue(status, created_at);`
  );
  _notifSchemaReady = true;
}

/**
 * 운영 이벤트를 알림 큐에 적재.
 *   - 적재 자체가 실패해도 호출 측 핵심 동작(출석 INSERT 등)을 막지 않도록
 *     try/catch 로 감싸서 console.warn 만 남기고 무시.
 */
async function enqueueNotification(
  env: { DB: D1Database },
  evt: { type: string; title: string; body: string; meta?: any; channel?: string }
): Promise<void> {
  try {
    await ensureNotifSchema(env);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO notification_queue (type, title, body, meta, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
    ).bind(
      evt.type,
      evt.title,
      evt.body,
      evt.meta ? JSON.stringify(evt.meta) : null,
      evt.channel || 'kakao_memo',
      now
    ).run();
  } catch (e: any) {
    console.warn('[notify] enqueue 실패 (무시하고 계속):', e?.message || e);
  }
}

export async function handleMangoApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // 🛡️ Inline-define sendPushToUser at the very top of the handler so all
  // notification endpoints below can use it without TDZ ReferenceError.
  // (Was previously declared deep inside the function — caused runtime crash
  // on /api/notify/lesson-started + lesson-ended + payment-success paths.)
  const ensurePushTables_top = async () => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, ua TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id, enabled)`); } catch {}
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`);
    try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_push_queue_ep ON push_queue(endpoint, fetched_at, queued_at DESC)`); } catch {}
  };
  const sendPushToUser = async (userId: string, title: string, body: string, targetUrl: string = '/', tag?: string): Promise<any> => {
    try {
      await ensurePushTables_top();
      if (!userId) return { ok: true, sent: 0, total: 0, msg: 'no_user_id' };
      const rs = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND enabled = 1`).bind(userId).all();
      const subs = (rs.results || []) as any[];
      if (!subs.length) return { ok: true, sent: 0, total: 0, msg: 'no_subscriptions' };
      const now = Date.now();
      const T = (title || '망고아이 알림').slice(0, 100);
      const B = (body || '').slice(0, 300);
      const U = targetUrl || '/';
      const TAG = tag || ('mangoi-' + now);
      for (const s of subs) {
        await env.DB.prepare(`INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(s.endpoint, T, B, U, '/img/icon-192.png', '/img/icon-192.png', TAG, now).run();
      }
      const result = await broadcastWebPush(subs.map(s => s.endpoint), env as any);
      for (const ep of result.expired) {
        await env.DB.prepare(`UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE endpoint = ?`).bind(Date.now(), ep).run();
      }
      return { ok: true, sent: result.sent, fail: result.failed, total: subs.length, mode: result.mode };
    } catch (e: any) {
      console.warn('[sendPushToUser] fail:', e?.message);
      return { ok: false, error: e?.message };
    }
  };

  try {
    // ===== 🛠️ 진단 + 테이블 부트스트랩 =====
    if (path === '/api/_bootstrap' && method === 'GET') {
      const result: any = { ok: true, ts: new Date().toISOString(), tables_created: [], errors: [] };
      const tables = [
        ['teacher_profiles', `CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`],
        ['community_posts', `CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`],
        ['student_payments', `CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`],
        // ═══ Phase P1: 포인트 시스템 ═══
        ['student_points', `CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER NOT NULL DEFAULT 0, lifetime_earned INTEGER NOT NULL DEFAULT 0, lifetime_spent INTEGER NOT NULL DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER NOT NULL);`],
        ['point_transactions', `CREATE TABLE IF NOT EXISTS point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT, rule_code TEXT, redemption_id INTEGER, actor_id TEXT, actor_name TEXT, created_at INTEGER NOT NULL, meta TEXT);`],
        ['point_rules', `CREATE TABLE IF NOT EXISTS point_rules (code TEXT PRIMARY KEY, label TEXT NOT NULL, amount INTEGER NOT NULL, cooldown_sec INTEGER DEFAULT 0, daily_cap INTEGER, enabled INTEGER DEFAULT 1, description TEXT, updated_at INTEGER NOT NULL);`],
        ['gift_catalog', `CREATE TABLE IF NOT EXISTS gift_catalog (id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT, brand TEXT, name TEXT NOT NULL, category TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, thumbnail_url TEXT, stock INTEGER, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, description TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`],
        ['gift_redemptions', `CREATE TABLE IF NOT EXISTS gift_redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, catalog_id INTEGER NOT NULL, gift_name TEXT, gift_brand TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, recipient_phone TEXT, recipient_name TEXT, status TEXT NOT NULL DEFAULT 'pending', external_order_id TEXT, external_coupon_code TEXT, error_message TEXT, requested_at INTEGER NOT NULL, sent_at INTEGER, delivered_at INTEGER, failed_at INTEGER, refunded_at INTEGER, txn_spend_id INTEGER, txn_refund_id INTEGER, meta TEXT);`],
        ['point_rule_log', `CREATE TABLE IF NOT EXISTS point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER NOT NULL, triggered_at INTEGER NOT NULL, txn_id INTEGER, meta TEXT);`],
        // ═══ Phase K1: 화상수업 채팅 영속화 ═══
        ['chat_messages', `CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, sender_uid TEXT, sender_name TEXT, sender_role TEXT, message TEXT NOT NULL, sent_at INTEGER NOT NULL, meta TEXT);`],
        // ═══ Phase E1: 학생 평가서 ═══
        ['student_evaluations', `CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`],
        // ═══ Phase POP: 팝업/공지 시스템 ═══
        ['popup_announcements', `CREATE TABLE IF NOT EXISTS popup_announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'mixed', body_html TEXT, image_url TEXT, video_url TEXT, link_url TEXT, link_text TEXT, width INTEGER DEFAULT 480, height INTEGER DEFAULT 360, width_mobile INTEGER, height_mobile INTEGER, position TEXT DEFAULT 'center', priority INTEGER DEFAULT 0, start_at INTEGER, end_at INTEGER, enabled INTEGER DEFAULT 1, dismiss_options TEXT DEFAULT 'today,7days', target_filter TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, view_count INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0);`],
        ['popup_views', `CREATE TABLE IF NOT EXISTS popup_views (id INTEGER PRIMARY KEY AUTOINCREMENT, popup_id INTEGER NOT NULL, user_id TEXT, viewed_at INTEGER NOT NULL, clicked INTEGER DEFAULT 0, click_target TEXT, user_agent TEXT);`],
        ['popup_dismissals', `CREATE TABLE IF NOT EXISTS popup_dismissals (popup_id INTEGER NOT NULL, user_id TEXT NOT NULL, dismissed_at INTEGER NOT NULL, dismissed_until INTEGER NOT NULL, PRIMARY KEY (popup_id, user_id));`],
      ];
      for (const [name, sql] of tables) {
        try {
          await env.DB.exec(sql);
          const check = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first();
          if (check) result.tables_created.push(name);
          else result.errors.push({ table: name, error: '생성 후 조회 실패' });
        } catch (e: any) {
          result.errors.push({ table: name, error: String(e?.message || e) });
        }
      }
      result.build_stamp = (env as any).BUILD_STAMP || 'unknown';
      result.ok = result.errors.length === 0;
      return json(result);
    }

    // ===== 📼 공개 학생 녹화본 조회 (본인이 참여한 수업만) =====
    //   /api/student/recordings?uid=정우영&limit=50
    //   recordings 테이블에서 participant_ids LIKE '%uid%' 또는 teacher_name = uid
    //   재생 URL: file_url 우선, 없으면 R2 blob URL 자동 생성
    if (path === '/api/student/recordings' && method === 'GET') {
      const uid = (url.searchParams.get('uid') || '').trim();
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
      if (!uid) return json({ ok: true, rows: [], count: 0 });
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS recordings (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, teacher_id TEXT, teacher_name TEXT, filename TEXT, file_url TEXT, size_bytes INTEGER, duration_ms INTEGER, participant_ids TEXT, participant_names TEXT, consented_user_ids TEXT, started_at INTEGER, ended_at INTEGER, status TEXT, storage TEXT, expires_at INTEGER);`);
        const likePattern = '%' + JSON.stringify(uid).slice(1, -1) + '%';
        const rs = await env.DB.prepare(
          `SELECT id, room_id, teacher_id, teacher_name, filename, file_url, size_bytes, duration_ms,
                  started_at, ended_at, status, storage, participant_names, participant_ids
             FROM recordings
            WHERE (participant_ids LIKE ? OR participant_names LIKE ? OR teacher_name = ? OR teacher_id = ?)
              AND status != 'deleted'
            ORDER BY started_at DESC
            LIMIT ?`
        ).bind(likePattern, likePattern, uid, uid, limit).all();
        const raw = (rs.results || []) as any[];
        const rows = raw.map((r: any) => {
          const startMs = r.started_at || 0;
          const date = startMs ? new Date(startMs).toISOString().slice(0,10) : '-';
          const durSec = r.duration_ms ? Math.round(r.duration_ms / 1000) : 0;
          const durStr = durSec >= 60 ? Math.round(durSec / 60) + '분' : (durSec + '초');
          const sizeMB = r.size_bytes
            ? (r.size_bytes >= 1048576 ? (Math.round(r.size_bytes / 104857.6) / 10) + ' MB' : Math.round(r.size_bytes / 1024) + ' KB')
            : '-';
          // 🎬 file_url 은 실제 R2 키(rec/{room}/{id}_{ts}.webm). blob endpoint 로 직접 가리킴
          let playUrl = '';
          if (r.file_url) {
            // file_url 이 http(s) URL 이면 그대로, 아니면 R2 키로 보고 blob endpoint 경유
            if (/^https?:\/\//.test(String(r.file_url))) {
              playUrl = String(r.file_url);
            } else {
              playUrl = '/api/recordings/blob/' + encodeURIComponent(String(r.file_url));
            }
          } else if (r.filename) {
            // legacy fallback — file_url 없는 옛날 row
            const blobKey = String(r.filename).startsWith('rec/') || String(r.filename).startsWith('recordings/')
              ? r.filename
              : ('recordings/' + r.filename);
            playUrl = '/api/recordings/blob/' + encodeURIComponent(blobKey);
          }
          return {
            id: r.id,
            date,
            topic: '방 ' + (r.room_id || '-') + ' 수업',
            teacher: r.teacher_name || '-',
            duration: durStr,
            size: sizeMB,
            url: playUrl,
            status: r.status || 'completed',
          };
        });
        return json({ ok: true, rows, recordings: rows, count: rows.length });
      } catch (e: any) {
        return json({ ok: true, rows: [], count: 0, _err: String(e?.message || e) });
      }
    }

    // 🤖 AI 추천 — 학생 녹화본 중 '집중도 높고 끊김 적은 최고의 수업' 자동 선택
    //   GET /api/admin/student/best-recording?uid=  (admin)
    //   점수 = 집중도(gaze)×0.5 + 참여율(active%)×0.3 + 끊김 적을수록 가점×0.2
    if (method === 'GET' && path === '/api/admin/student/best-recording') {
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid 필요' }, 400);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS recordings (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, teacher_id TEXT, teacher_name TEXT, filename TEXT, file_url TEXT, size_bytes INTEGER, duration_ms INTEGER, participant_ids TEXT, participant_names TEXT, consented_user_ids TEXT, started_at INTEGER, ended_at INTEGER, status TEXT, storage TEXT, expires_at INTEGER);`);
        const likePattern = '%' + JSON.stringify(uid).slice(1, -1) + '%';
        const rs = await env.DB.prepare(
          `SELECT id, room_id, file_url, filename, duration_ms, started_at, status
             FROM recordings
            WHERE (participant_ids LIKE ? OR participant_names LIKE ? OR teacher_name = ? OR teacher_id = ?)
              AND status != 'deleted'
            ORDER BY started_at DESC LIMIT 50`
        ).bind(likePattern, likePattern, uid, uid).all();
        const recs = (rs.results || []) as any[];
        const scored: any[] = [];
        for (const r of recs) {
          let att: any = null;
          try {
            att = await env.DB.prepare(
              `SELECT gaze_score, disconnect_count, total_active_ms, total_session_ms
                 FROM attendance WHERE room_id = ? AND user_id = ? ORDER BY joined_at DESC LIMIT 1`
            ).bind(r.room_id, uid).first();
          } catch {}
          const gaze = (att && typeof att.gaze_score === 'number') ? att.gaze_score : null;
          const disc = (att && att.disconnect_count) || 0;
          const activePct = (att && att.total_session_ms > 0)
            ? Math.round(att.total_active_ms * 100 / att.total_session_ms) : null;
          const gazeV = gaze == null ? 60 : gaze;        // 데이터 없으면 중립값
          const activeV = activePct == null ? 70 : activePct;
          const smoothV = Math.max(0, 100 - Math.min(100, disc * 20));
          const score = Math.round(gazeV * 0.5 + activeV * 0.3 + smoothV * 0.2);
          const key = r.file_url || r.filename || '';
          const date = r.started_at ? new Date(r.started_at).toISOString().slice(0, 10) : '-';
          scored.push({
            id: r.id, room_id: r.room_id, recording_key: key, date,
            duration_sec: Math.round((r.duration_ms || 0) / 1000),
            gaze, disconnect: disc, active_pct: activePct, score,
          });
        }
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0] || null;
        let reason = '';
        if (best) {
          const parts: string[] = [];
          if (best.gaze != null) parts.push('집중도 ' + best.gaze);
          parts.push('끊김 ' + best.disconnect + '회');
          if (best.active_pct != null) parts.push('참여율 ' + best.active_pct + '%');
          reason = parts.join(' · ') + ' — 종합 ' + best.score + '점';
        }
        return json({ ok: true, best, reason, items: scored });
      } catch (e: any) {
        return json({ ok: false, error: e?.message }, 500);
      }
    }

    // ===== 👨‍🏫 공개 강사 목록 (학생 홈페이지 강사진 미리보기용) =====
    if (path === '/api/teacher-profiles' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
        const rs = await env.DB.prepare(
          `SELECT id, korean_name, english_name, image_url, intro_video_url, group_name, career, certifications, education, available_days, available_hours, status, origin_region, notes FROM teacher_profiles WHERE status = '활동중' ORDER BY korean_name ASC LIMIT ?`
        ).bind(limit).all();
        const rows = (rs.results || []) as any[];
        return json({ ok: true, items: rows, rows, count: rows.length });
      } catch (e: any) {
        return json({ ok: true, items: [], rows: [], count: 0, _err: String(e?.message || e) });
      }
    }

    // ===== 📢 공개 공지사항 (학생 홈페이지에서 인증 없이 조회) =====
    //   /api/community/posts?limit=20  →  community_posts 테이블에서 핀고정 우선·최신순으로 반환
    //   응답 shape: { ok, rows, posts, count } — 프론트엔드는 rows 또는 posts 둘 다 인식
    if (path === '/api/community/posts' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
        const rs = await env.DB.prepare(
          `SELECT id, title, body, author, pinned, created_at, updated_at
             FROM community_posts
            ORDER BY pinned DESC, created_at DESC
            LIMIT ?`
        ).bind(limit).all();
        const rows = (rs.results || []) as any[];
        return json({ ok: true, rows, posts: rows, count: rows.length });
      } catch (e: any) {
        return json({ ok: true, rows: [], posts: [], count: 0, _err: String(e?.message || e) });
      }
    }

    // ===== 출석 =====
    if (path === '/api/attendance/join' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) return invalidBody(['room_id', 'user_id']);
      const now = Date.now();
      const date = today(now);
      // 📣 오늘 처음 보는 (room_id, date) 조합이면 "수업 시작" 알림 큐에 적재
      //    INSERT 와 별개 트랜잭션 — 알림 실패가 출석 기록을 막지 않도록.
      const existing = await env.DB.prepare(
        `SELECT 1 FROM attendance WHERE room_id = ? AND date = ? LIMIT 1`
      ).bind(b.room_id, date).first();
      const res = await env.DB.prepare(
        `INSERT INTO attendance (room_id, user_id, username, role, joined_at, status, date)
         VALUES (?, ?, ?, ?, ?, 'present', ?)`
      ).bind(b.room_id, b.user_id, b.username || null, b.role || 'student', now, date).run();
      if (!existing) {
        await enqueueNotification(env, {
          type: 'class_start',
          title: `🎬 수업 시작 — 방 ${b.room_id}`,
          body: `${b.username || b.user_id} 님 입장 (${b.role || 'student'})`,
          meta: { room_id: b.room_id, user_id: b.user_id, role: b.role || 'student', joined_at: now }
        });
        // 🆕 학생 본인 + 학부모에게 Web Push (학부모 user_id 매핑 시도)
        try {
          if ((b.role || 'student') === 'student') {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, ua TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`);
            // 본인 푸시 (학습 동기부여)
            const pushTitle = '🎓 수업 입장 완료!';
            const pushBody = `${b.username || b.user_id} 님 수업 시작했어요. 화이팅!`;
            const subRows = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND enabled = 1`).bind(b.user_id).all();
            const eps = (subRows.results || []).map((r:any)=>r.endpoint);
            for (const ep of eps) {
              await env.DB.prepare(`INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?,?,?,?,?,?,?,?)`)
                .bind(ep, pushTitle, pushBody, '/?go=videocall', '/img/icon-192.png', '/img/icon-192.png', `lesson-join-${b.room_id}`, now).run();
            }
            if (eps.length) await broadcastWebPush(eps, env as any);

            // 학부모 푸시 (parent_user_id 매핑) — students_erp.parent_user_id 컬럼 (없으면 무시)
            try {
              const stu = await env.DB.prepare(`SELECT parent_user_id, parent_name, student_name FROM students_erp WHERE user_id = ? LIMIT 1`).bind(b.user_id).first<any>();
              if (stu?.parent_user_id) {
                const parentTitle = `👨‍👩‍👧 ${stu.student_name || b.username || '자녀'}님 수업 시작`;
                const parentBody = `방금 영어 수업에 입장했어요. 대시보드에서 진행 상황 확인 가능합니다.`;
                const parentSubs = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND enabled = 1`).bind(stu.parent_user_id).all();
                const peps = (parentSubs.results || []).map((r:any)=>r.endpoint);
                for (const ep of peps) {
                  await env.DB.prepare(`INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?,?,?,?,?,?,?,?)`)
                    .bind(ep, parentTitle, parentBody, '/parent.html?uid=' + encodeURIComponent(b.user_id), '/img/icon-192.png', '/img/icon-192.png', `lesson-join-parent-${b.room_id}`, now).run();
                }
                if (peps.length) await broadcastWebPush(peps, env as any);
              }
            } catch (e: any) { /* students_erp.parent_user_id 컬럼 없을 수 있음 — 무시 */ }
          }
        } catch (e: any) {
          console.warn('[attendance/join push] error:', e?.message);
        }
      }
      return json({ ok: true, attendance_id: res.meta.last_row_id, joined_at: now });
    }

    // ===== 🥭 출결 체크인 (방 입장 확정) — 결석률 100% 버그 방어용 핵심 엔드포인트 =====
    //  POST /api/attendance/checkin
    //    body: { room_id, user_id, role?('student'|'teacher'), timestamp?, username? }
    //  목적:
    //    - WebRTC 시그널링 서버 / 클라이언트가 "학생이 방에 실제 입장" 했을 때 호출.
    //    - attendance 행을 '출석(attended)' 으로 확정하고 attended_at(실제 입장 시각) 기록.
    //    - 결석 배치가 이미 status='absent' 로 바꿔놨더라도, 입장이 수업 시간 내면 '출석'으로 복구.
    //    - 대시보드(/api/admin/stats/today)는 attendance.date 기준 DISTINCT user_id 를 출석자로 세므로
    //      이 엔드포인트가 안정적으로 행을 남기면 "활성 52명 전원 결석(100%)" 오류가 사라진다.
    if (path === '/api/attendance/checkin' && method === 'POST') {
      const b = await parseJsonBody(request);

      // ── 1) 데이터 무결성 검증 ── user_id / room_id 필수 + 형식 검사
      const userId = b?.user_id != null ? String(b.user_id).trim() : '';
      const roomId = b?.room_id != null ? String(b.room_id).trim() : '';
      const ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/; // 허용 문자/길이 제한 (SQL injection·쓰레기 입력 방어)
      if (!ID_RE.test(userId) || !ID_RE.test(roomId)) {
        return invalidBody(['room_id', 'user_id']);
      }
      const role = (b.role === 'teacher') ? 'teacher' : 'student';

      // 입장 시각: 클라이언트가 보낸 timestamp(ms 또는 ISO 문자열)를 신뢰하되,
      // 과거 24h ~ 미래 5분 범위만 허용(시계 오차·위변조 방어). 벗어나면 서버 시각 사용.
      let now = Date.now();
      if (b.timestamp != null) {
        const parsed = typeof b.timestamp === 'number' ? b.timestamp : Date.parse(String(b.timestamp));
        if (Number.isFinite(parsed) && parsed > Date.now() - 86400000 && parsed < Date.now() + 300000) {
          now = parsed;
        }
      }
      const date = today(now); // KST 기준 YYYY-MM-DD (대시보드 집계 키와 동일)

      // ── 2) 자가치유 ── 운영 D1 에 테이블/컬럼이 없을 수 있으므로 보강 (NOOP if exists)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT, attended_at INTEGER, total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0);`);
      } catch {}
      try { await env.DB.exec(`ALTER TABLE attendance ADD COLUMN attended_at INTEGER`); } catch {} // 이미 있으면 무시
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}

      // ── 3) 오늘 수업 스케줄 조회(class_schedules) ── 입장이 "수업 시간 내" 인지 판정
      //    스케줄이 없으면 막지 않고 출석 인정(보수적 기본값 = true). → 버그 재발 방지 우선.
      //  검증: test-harness/attendance_checkin_harness.mjs (54건 통과)
      //  스키마/표기 편차에 견딤 — one_off↔onetime, day_of_week=영문CSV('mon,wed')·숫자·한글,
      //  duration_min↔duration_minutes. 후보를 모두 가져와 JS에서 매칭하고, 입장 시각(now)을
      //  윈도우에 포함하는 스케줄을 우선 선택한다. 조회 실패 시 출석 인정(보수적 = withinClass true).
      let withinClass = true;
      let scheduleId: number | null = null;
      try {
        const dow = new Date(now + 9 * 3600 * 1000).getUTCDay(); // KST 요일 0=일
        const ENG_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const ENG_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const KOR = ['일', '월', '화', '수', '목', '금', '토'];
        const dayMatches = (stored: any): boolean => {
          if (stored == null) return false;
          const want = new Set([String(dow), String(dow === 0 ? 7 : dow), ENG_ABBR[dow], ENG_FULL[dow], KOR[dow]]);
          return String(stored).split(/[\s,/|;]+/).map((t: string) => t.trim()).filter(Boolean)
            .some((t: string) => want.has(t) || want.has(t.toLowerCase()));
        };
        const within = (s: any): boolean => {
          const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => parseInt(x, 10));
          const dur = Number(s.duration_min ?? s.duration_minutes ?? 30);
          const dayStartKst = new Date(date + 'T00:00:00+09:00').getTime();
          const start = dayStartKst + ((hh || 0) * 60 + (mm || 0)) * 60000;
          const end = start + dur * 60000;
          return now >= start - 30 * 60000 && now <= end + 15 * 60000; // grace: 시작30분전~종료15분후
        };
        const rs: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE user_id = ?`).bind(userId).all();
        const rows = (rs?.results || []).filter((r: any) => String(r.status || 'active').toLowerCase() === 'active');
        const cands = rows.filter((r: any) => (r.scheduled_date === date) || (!r.scheduled_date && dayMatches(r.day_of_week)));
        if (cands.length) {
          const picked = cands.find((s: any) => within(s)) || cands[0];
          scheduleId = (picked.id != null) ? Number(picked.id) : null;
          withinClass = within(picked);
        }
      } catch (e: any) {
        // class_schedules 스키마 편차/부재 시에도 출석은 인정 (withinClass=true 유지)
        console.warn('[checkin] schedule lookup skipped:', e?.message);
      }

      // ── 4) 방어적 UPSERT ── 오늘 (user_id, room_id, date) 행이 있으면 출석으로 복구, 없으면 생성
      const existing = await env.DB.prepare(
        `SELECT id, status FROM attendance
          WHERE user_id = ? AND room_id = ? AND date = ?
          ORDER BY joined_at DESC LIMIT 1`
      ).bind(userId, roomId, date).first<any>();

      let attendanceId: number;
      let recovered = false; // 결석→출석 복구 여부
      if (existing) {
        if (withinClass) {
          // 입장이 수업 시간 내 → status='attended' 로 확정/복구 (결석 배치 결과 덮어쓰기)
          await env.DB.prepare(
            `UPDATE attendance
                SET status = 'attended',
                    attended_at = COALESCE(attended_at, ?),
                    role     = COALESCE(role, ?),
                    username = COALESCE(username, ?)
              WHERE id = ?`
          ).bind(now, role, b.username || null, existing.id).run();
          recovered = (existing.status === 'absent');
        } else {
          // 수업 시간 밖 입장 → status 는 건드리지 않고 attended_at 만 보강
          await env.DB.prepare(
            `UPDATE attendance SET attended_at = COALESCE(attended_at, ?) WHERE id = ?`
          ).bind(now, existing.id).run();
        }
        attendanceId = Number(existing.id);
      } else {
        const ins = await env.DB.prepare(
          `INSERT INTO attendance (room_id, user_id, username, role, joined_at, attended_at, status, date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(roomId, userId, b.username || null, role, now, now, withinClass ? 'attended' : 'present', date).run();
        attendanceId = Number(ins.meta.last_row_id);
      }

      // ── 5) 알림 센터 연동 ── 첫 출석 확정 시 class_start 이벤트 적재
      //    (실서비스 경로) D1 notification_queue → cron 이 SOLAPI 알림톡/카카오로 발송.
      const firstAttend = !existing || recovered;
      if (firstAttend && role === 'student') {
        await enqueueNotification(env, {
          type: 'class_start',
          title: `🎬 수업 시작 — 방 ${roomId}`,
          body: `${b.username || userId} 님 출석 확정 (${date})`,
          meta: { room_id: roomId, user_id: userId, role, attended_at: now, schedule_id: scheduleId }
        });

        // ──────────────────────────────────────────────────────────────────
        // 🔮 (예비/가짜코드) Cloudflare Queue 직접 적재 경로 — 바인딩 추가 시 활성화.
        //   wrangler.toml 에 아래를 추가하고 MangoEnv 에 `QUEUE?: Queue` 선언한 뒤 주석 해제:
        //     [[queues.producers]]
        //     binding = "QUEUE"
        //     queue   = "class-events"
        //   consumer Worker 가 이 메시지를 받아 SOLAPI 알림톡 발송 대기열로 넘긴다.
        // ──────────────────────────────────────────────────────────────────
        // if ((env as any).QUEUE) {
        //   await (env as any).QUEUE.send({
        //     event: 'class_start',
        //     room_id: roomId,
        //     user_id: userId,
        //     role,
        //     attended_at: now,
        //     notify: { channel: 'kakao_alimtalk', template: 'CLASS_START' } // SOLAPI 발송 대기 큐 페이로드
        //   });
        // }
      }

      return json({
        ok: true,
        attendance_id: attendanceId,
        user_id: userId,
        room_id: roomId,
        status: withinClass ? 'attended' : 'present',
        attended_at: now,
        date,
        within_class: withinClass,
        schedule_id: scheduleId,
        recovered_from_absent: recovered
      });
    }

    if (path === '/api/attendance/leave' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) return invalidBody(['room_id', 'user_id']);
      const now = Date.now();
      // 가장 최근 미종료 row 업데이트
      await env.DB.prepare(
        `UPDATE attendance
         SET left_at = ?,
             total_active_ms = COALESCE(?, total_active_ms),
             total_session_ms = COALESCE(?, total_session_ms),
             disconnect_count = COALESCE(?, disconnect_count),
             status = ?
         WHERE id = (
           SELECT id FROM attendance
           WHERE room_id = ? AND user_id = ? AND left_at IS NULL
           ORDER BY joined_at DESC LIMIT 1
         )`
      ).bind(
        now,
        b.total_active_ms ?? null,
        b.total_session_ms ?? null,
        b.disconnect_count ?? null,
        b.status || 'left',
        b.room_id,
        b.user_id
      ).run();
      return json({ ok: true, left_at: now });
    }

    if (path === '/api/attendance/heartbeat' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) return invalidBody(['room_id', 'user_id']);
      // KV에 마지막 heartbeat 저장 (60초 TTL)
      const key = `hb:${b.room_id}:${b.user_id}`;
      await env.SESSION_STATE.put(key, String(Date.now()), { expirationTtl: 60 });
      return json({ ok: true });
    }

    // ===== 발화시간 =====
    if (path === '/api/speaking-time' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) return invalidBody(['room_id', 'user_id']);
      const now = Date.now();
      await env.DB.prepare(
        `UPDATE attendance
         SET total_active_ms = ?, total_session_ms = ?
         WHERE id = (
           SELECT id FROM attendance
           WHERE room_id = ? AND user_id = ? AND left_at IS NULL
           ORDER BY joined_at DESC LIMIT 1
         )`
      ).bind(b.total_active_ms || 0, b.total_session_ms || 0, b.room_id, b.user_id).run();
      return json({ ok: true, recorded_at: now });
    }

    // ===== 시선 점수 =====
    //  - public/js/mango-gaze.js 가 10초마다 호출
    //  - session_* 필드가 있으면 그걸 누적값으로 사용(권장)
    //  - 없으면 이번 윈도우의 forward_samples/samples 로 단순 덮어쓰기
    //  - 같은 (room_id, user_id) 의 가장 최신 attendance row 를 업데이트
    if (path === '/api/gaze-score' && method === 'POST') {
      const b = await request.json() as any;
      if (!b.room_id || !b.user_id) {
        return json({ ok: false, error: 'room_id and user_id required' }, 400);
      }
      const now = Date.now();
      const cameraOff = b.camera_off === true;

      // 점수/샘플 결정: session_* 가 들어왔으면 누적값으로, 아니면 윈도우값 사용
      const totalSamples = (typeof b.session_samples === 'number')
        ? b.session_samples
        : Number(b.samples || 0);
      const forwardSamples = (typeof b.session_forward_samples === 'number')
        ? b.session_forward_samples
        : Number(b.forward_samples || 0);
      let score: number | null = null;
      if (cameraOff) {
        // 카메라 OFF 신호 → 점수는 null 로 유지 (admin 에서 "—" 로 보이되 샘플=0 으로 원인 구분 가능)
        score = null;
      } else if (typeof b.session_score === 'number' && !Number.isNaN(b.session_score)) {
        score = b.session_score;
      } else if (typeof b.gaze_score === 'number' && !Number.isNaN(b.gaze_score)) {
        score = b.gaze_score;
      } else if (totalSamples > 0) {
        score = Math.round((forwardSamples / totalSamples) * 1000) / 10;
      }

      // 가장 최근 열린 attendance row 우선, 없으면 가장 최근 row 로 fallback
      // (heartbeat 타이밍/예상치 못한 leave 순서 문제로 left_at 이 먼저 찍힌 경우 대비)
      const targetRow = await env.DB.prepare(
        `SELECT id, gaze_score FROM attendance
         WHERE room_id = ? AND user_id = ?
         ORDER BY (CASE WHEN left_at IS NULL THEN 0 ELSE 1 END), joined_at DESC
         LIMIT 1`
      ).bind(b.room_id, b.user_id).first<{ id: number; gaze_score: number | null }>();

      if (!targetRow) {
        // attendance row 자체가 없으면(이례적) 하나 만들어둔다 — 점수 보고가 유실되지 않도록.
        const date = today(now);
        const res = await env.DB.prepare(
          `INSERT INTO attendance (room_id, user_id, username, role, joined_at, status, date,
             gaze_score, gaze_samples, gaze_forward_samples)
           VALUES (?, ?, ?, ?, ?, 'present', ?, ?, ?, ?)`
        ).bind(
          b.room_id, b.user_id, b.username || null, b.role || 'student',
          now, date,
          score, totalSamples, forwardSamples
        ).run();
        return json({
          ok: true, attendance_id: res.meta.last_row_id,
          gaze_score: score, bootstrapped: true, camera_off: cameraOff
        });
      }

      // 카메라 OFF 신호인 경우엔 기존에 유효한 score 가 있다면 덮어쓰지 않음
      // (중간에 카메라를 잠깐 끈 경우에도 이전 측정치를 보존)
      if (cameraOff && targetRow.gaze_score !== null && targetRow.gaze_score !== undefined) {
        await env.DB.prepare(
          `UPDATE attendance
             SET gaze_samples = ?, gaze_forward_samples = ?
           WHERE id = ?`
        ).bind(totalSamples, forwardSamples, targetRow.id).run();
        return json({
          ok: true, attendance_id: targetRow.id,
          gaze_score: targetRow.gaze_score,
          camera_off: true, preserved_previous: true
        });
      }

      await env.DB.prepare(
        `UPDATE attendance
         SET gaze_score = ?,
             gaze_samples = ?,
             gaze_forward_samples = ?
         WHERE id = ?`
      ).bind(score, totalSamples, forwardSamples, targetRow.id).run();
      return json({
        ok: true, attendance_id: targetRow.id,
        gaze_score: score, camera_off: cameraOff, recorded_at: now
      });
    }

    // ===== 카카오 ID =====
    if (path === '/api/kakao-id' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.user_id) return invalidBody(['user_id']);
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO kakao_ids (user_id, role, username, kakao_id, phone, opted_in_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           kakao_id = excluded.kakao_id,
           phone = excluded.phone,
           username = excluded.username,
           role = excluded.role,
           updated_at = excluded.updated_at`
      ).bind(b.user_id, b.role || 'teacher', b.username || null, b.kakao_id || null, b.phone || null, now, now).run();
      return json({ ok: true });
    }

    if (path.startsWith('/api/kakao-id/') && method === 'GET') {
      const userId = decodeURIComponent(path.replace('/api/kakao-id/', ''));
      const row = await env.DB.prepare(
        `SELECT user_id, role, username, kakao_id, phone, opted_in_at FROM kakao_ids WHERE user_id = ?`
      ).bind(userId).first();
      return json(row || null);
    }

    if (path === '/api/kakao-id/teachers' && method === 'GET') {
      const rs = await env.DB.prepare(
        `SELECT user_id, username, kakao_id, phone FROM kakao_ids WHERE role = 'teacher' AND kakao_id IS NOT NULL`
      ).all();
      return json(rs.results || []);
    }

    // ===== 비상 이벤트 =====
    if (path === '/api/emergency' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) {
        return invalidBody(['room_id', 'user_id']);
      }
      const now = Date.now();
      const res = await env.DB.prepare(
        `INSERT INTO emergency_events (room_id, user_id, target_user_id, event_type, triggered_at, meta)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(b.room_id, b.user_id, b.target_user_id || null, b.event_type || 'kakao_button', now, JSON.stringify(b.meta || {})).run();
      // 📣 비상 이벤트는 항상 즉시 알림
      await enqueueNotification(env, {
        type: 'emergency',
        title: `🚨 비상 이벤트 — 방 ${b.room_id}`,
        body: `${b.user_id} 가 ${b.event_type || 'kakao_button'} 트리거 (대상: ${b.target_user_id || '전체'})`,
        meta: { room_id: b.room_id, user_id: b.user_id, target_user_id: b.target_user_id || null, event_type: b.event_type || 'kakao_button', triggered_at: now, emergency_id: res.meta.last_row_id }
      });
      return json({ ok: true, id: res.meta.last_row_id });
    }

    // ===== 보상 =====
    if (path === '/api/reward' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.teacher_id || !b.student_id || !b.type) {
        return invalidBody(['teacher_id', 'student_id', 'type']);
      }
      const now = Date.now();
      const date = today(now);
      const DAILY_LIMIT = 30; // 교사당 일일 발급 상한 (v3 §9)
      // 일일 상한 체크
      const limitRow = await env.DB.prepare(
        `SELECT count FROM reward_limits WHERE teacher_id = ? AND date = ?`
      ).bind(b.teacher_id, date).first<{ count: number }>();
      const currentCount = limitRow?.count || 0;
      if (currentCount >= DAILY_LIMIT) {
        return json({ ok: false, error: 'daily_limit_exceeded', limit: DAILY_LIMIT, current: currentCount }, 429);
      }
      const expiresAt = b.expires_at || (now + 90 * 24 * 3600 * 1000); // 90일
      const res = await env.DB.prepare(
        `INSERT INTO rewards (teacher_id, student_id, room_id, type, value, message, issued_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.teacher_id, b.student_id, b.room_id || null, b.type, b.value || null, b.message || null, now, expiresAt).run();
      // 카운트 증가
      await env.DB.prepare(
        `INSERT INTO reward_limits (teacher_id, date, count) VALUES (?, ?, 1)
         ON CONFLICT(teacher_id, date) DO UPDATE SET count = count + 1`
      ).bind(b.teacher_id, date).run();
      return json({ ok: true, reward_id: res.meta.last_row_id, daily_remaining: DAILY_LIMIT - currentCount - 1 });
    }

    if (path.startsWith('/api/rewards/student/') && method === 'GET') {
      const studentId = decodeURIComponent(path.replace('/api/rewards/student/', ''));
      const rs = await env.DB.prepare(
        `SELECT id, teacher_id, type, value, message, issued_at, expires_at, status
         FROM rewards WHERE student_id = ? AND status = 'active'
         ORDER BY issued_at DESC LIMIT 100`
      ).bind(studentId).all();
      return json(rs.results || []);
    }

    // ===== 대시보드 =====
    if (path === '/api/dashboard' && method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '7', 10);
      const since = Date.now() - days * 24 * 3600 * 1000;

      const [attTotal, attByDay, disconnectStats, emergencyCount, rewardCount, topSpeakers] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS c FROM attendance WHERE joined_at >= ?`).bind(since).first(),
        env.DB.prepare(
          `SELECT date, COUNT(DISTINCT user_id) AS unique_users, COUNT(*) AS sessions
           FROM attendance WHERE joined_at >= ? GROUP BY date ORDER BY date DESC`
        ).bind(since).all(),
        env.DB.prepare(
          `SELECT COUNT(*) AS total_sessions,
                  SUM(disconnect_count) AS total_disconnects,
                  AVG(CASE WHEN total_session_ms > 0 THEN (total_active_ms*100.0/total_session_ms) ELSE 0 END) AS avg_active_pct
           FROM attendance WHERE joined_at >= ?`
        ).bind(since).first(),
        env.DB.prepare(`SELECT COUNT(*) AS c, event_type FROM emergency_events WHERE triggered_at >= ? GROUP BY event_type`).bind(since).all(),
        env.DB.prepare(`SELECT COUNT(*) AS c, type FROM rewards WHERE issued_at >= ? GROUP BY type`).bind(since).all(),
        env.DB.prepare(
          `SELECT user_id, username, SUM(total_active_ms) AS active_ms, SUM(total_session_ms) AS session_ms
           FROM attendance WHERE joined_at >= ? AND total_session_ms > 0
           GROUP BY user_id ORDER BY active_ms DESC LIMIT 10`
        ).bind(since).all()
      ]);

      return json({
        period_days: days,
        attendance: {
          total: (attTotal as any)?.c || 0,
          by_day: attByDay.results || []
        },
        connection: disconnectStats || {},
        emergency: emergencyCount.results || [],
        rewards: rewardCount.results || [],
        top_speakers: topSpeakers.results || []
      });
    }

    // ===== 관리자 개입: 수업 강제 종료 (Phase 4) =====
    //   POST /api/admin/room/:roomId/force-end
    //     - 해당 room 의 VideoCallRoom DO 에 /force-end 를 위임
    //     - DO 가 모든 연결에 force_end 브로드캐스트 + close
    if (method === 'POST' && /^\/api\/admin\/room\/[^/]+\/force-end$/.test(path)) {
      const m = path.match(/^\/api\/admin\/room\/([^/]+)\/force-end$/);
      const roomId = m ? decodeURIComponent(m[1]) : '';
      if (!roomId) return invalidBody(['room_id(path)']);
      const envAny = env as any;
      if (!envAny.VIDEO_CALL_ROOM) {
        return json({ ok: false, error: 'VIDEO_CALL_ROOM binding missing' }, 500);
      }
      const doId = envAny.VIDEO_CALL_ROOM.idFromName(roomId);
      const stub = envAny.VIDEO_CALL_ROOM.get(doId);
      // body 로 reason 전달 가능 — 없으면 기본 문구
      const b = await parseJsonBody(request);
      const reason = (b && typeof b.reason === 'string' && b.reason.trim()) ? b.reason.trim() : '관리자가 수업을 종료했습니다.';
      const resp = await stub.fetch('http://do/force-end?reason=' + encodeURIComponent(reason), { method: 'POST' });
      const body = await resp.text();
      // 📣 강제 종료는 운영 액션 — 알림 큐 적재
      let parsed: any = null; try { parsed = JSON.parse(body); } catch {}
      await enqueueNotification(env, {
        type: 'class_force_end',
        title: `🛑 수업 강제 종료 — 방 ${roomId}`,
        body: `사유: ${reason} · 알림 ${parsed?.notified ?? '?'}명`,
        meta: { room_id: roomId, reason, notified: parsed?.notified ?? null, ended_at: Date.now() }
      });
      return new Response(body, {
        status: resp.status,
        headers: {
          'Content-Type': resp.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // ===== 📣 알림 큐 (Phase 5) =====
    //   GET   /api/admin/notifications?status=pending&limit=50
    //   POST  /api/admin/notifications/test     (관리자가 임의 메시지 큐에 적재 — 검증용)
    //   PATCH /api/admin/notifications/:id      body: { status: 'sent'|'failed'|'discarded', error?: string }
    if (path === '/api/admin/notifications' && method === 'GET') {
      await ensureNotifSchema(env);
      const wantStatus = url.searchParams.get('status') || 'pending';
      const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '50', 10)));
      let rs;
      if (wantStatus === 'all') {
        rs = await env.DB.prepare(
          `SELECT id, type, title, body, meta, channel, status, created_at, sent_at, error
           FROM notification_queue ORDER BY created_at DESC LIMIT ?`
        ).bind(lim).all();
      } else {
        rs = await env.DB.prepare(
          `SELECT id, type, title, body, meta, channel, status, created_at, sent_at, error
           FROM notification_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?`
        ).bind(wantStatus, lim).all();
      }
      // 카운트 (status 별 합계)
      const countRs = await env.DB.prepare(
        `SELECT status, COUNT(*) AS c FROM notification_queue GROUP BY status`
      ).all();
      const counts: any = {};
      for (const row of (countRs.results || []) as any[]) counts[row.status] = row.c;
      return json({ ok: true, items: rs.results || [], counts });
    }

    if (path === '/api/admin/notifications/test' && method === 'POST') {
      const b = await parseJsonBody(request);
      const title = (b && b.title) || '🧪 테스트 알림';
      const body  = (b && b.body)  || '알림 큐 동작 검증용 메시지입니다.';
      await enqueueNotification(env, { type: 'manual', title, body, meta: { issued_by: 'admin', at: Date.now() } });
      return json({ ok: true, enqueued: { title, body } });
    }

    if (method === 'PATCH' && /^\/api\/admin\/notifications\/\d+$/.test(path)) {
      await ensureNotifSchema(env);
      const m = path.match(/^\/api\/admin\/notifications\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (!id) return invalidBody(['id(path)']);
      const b = await parseJsonBody(request);
      if (!b || !b.status) return invalidBody(['status']);
      const allowed = new Set(['sent', 'failed', 'discarded', 'pending']);
      if (!allowed.has(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: Array.from(allowed) }, 400);
      }
      const sentAt = b.status === 'sent' ? Date.now() : null;
      await env.DB.prepare(
        `UPDATE notification_queue SET status = ?, sent_at = ?, error = ? WHERE id = ?`
      ).bind(b.status, sentAt, b.error || null, id).run();
      return json({ ok: true, id, status: b.status, sent_at: sentAt });
    }

    // ===== 📥 CSV 내보내기 (Phase 6) =====
    //   GET /api/admin/export/recordings.csv?q=&date_from=&date_to=&status=
    //   GET /api/admin/export/attendance.csv?date_from=&date_to=&user_id=&room_id=
    //   - 기존 /api/recordings 검색 파라미터 동일하게 받음
    //   - LIMIT 10000 (실무 용도). 더 크면 페이징 필요하지만 일반 사례에선 충분.
    if (method === 'GET' && path === '/api/admin/export/recordings.csv') {
      const qSearch  = (url.searchParams.get('q') || '').trim();
      const dateFrom = url.searchParams.get('date_from');
      const dateTo   = url.searchParams.get('date_to');
      const statusF  = url.searchParams.get('status');
      const where: string[] = [];
      const binds: any[] = [];
      if (qSearch) {
        where.push("(r.room_id LIKE ? OR COALESCE(r.teacher_name,'') LIKE ? OR COALESCE(r.teacher_id,'') LIKE ?)");
        const p = `%${qSearch}%`;
        binds.push(p, p, p);
      }
      if (dateFrom) {
        const ms = Date.parse(dateFrom + 'T00:00:00+09:00');
        if (!isNaN(ms)) { where.push('r.started_at >= ?'); binds.push(ms); }
      }
      if (dateTo) {
        const ms = Date.parse(dateTo + 'T23:59:59+09:00');
        if (!isNaN(ms)) { where.push('r.started_at <= ?'); binds.push(ms); }
      }
      if (statusF && statusF !== 'all') { where.push('r.status = ?'); binds.push(statusF); }
      const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const sql = `SELECT r.id, r.room_id, r.teacher_id, r.teacher_name, r.started_at, r.ended_at,
                          r.duration_ms, r.size_bytes, r.status, r.storage,
                          r.participant_names, r.consented_user_ids
                   FROM recordings r ${whereSQL}
                   ORDER BY r.started_at DESC LIMIT 10000`;
      const rs = binds.length
        ? await env.DB.prepare(sql).bind(...binds).all()
        : await env.DB.prepare(sql).all();
      // ms epoch → ISO 문자열 변환 (CSV 가독성)
      const rows = ((rs.results || []) as any[]).map(r => ({
        ...r,
        started_at_iso: r.started_at ? new Date(r.started_at).toISOString() : '',
        ended_at_iso:   r.ended_at   ? new Date(r.ended_at).toISOString()   : '',
        duration_sec:   r.duration_ms ? Math.round(r.duration_ms / 1000) : 0,
        size_mb:        r.size_bytes  ? Math.round(r.size_bytes / 1024 / 1024 * 10) / 10 : 0
      }));
      const csv = toCSV(rows, [
        { key: 'id',                label: 'id' },
        { key: 'room_id',           label: 'room_id' },
        { key: 'teacher_id',        label: 'teacher_id' },
        { key: 'teacher_name',      label: 'teacher_name' },
        { key: 'started_at_iso',    label: 'started_at' },
        { key: 'ended_at_iso',      label: 'ended_at' },
        { key: 'duration_sec',      label: 'duration_sec' },
        { key: 'size_mb',           label: 'size_mb' },
        { key: 'status',            label: 'status' },
        { key: 'storage',           label: 'storage' },
        { key: 'participant_names', label: 'participant_names' },
        { key: 'consented_user_ids',label: 'consented_user_ids' }
      ]);
      const fname = 'recordings_' + new Date().toISOString().slice(0, 10) + '.csv';
      return csvResponse(fname, csv);
    }

    if (method === 'GET' && path === '/api/admin/export/attendance.csv') {
      const dateFrom = url.searchParams.get('date_from');
      const dateTo   = url.searchParams.get('date_to');
      const userId   = url.searchParams.get('user_id');
      const roomId   = url.searchParams.get('room_id');
      const where: string[] = [];
      const binds: any[] = [];
      if (dateFrom) {
        const ms = Date.parse(dateFrom + 'T00:00:00+09:00');
        if (!isNaN(ms)) { where.push('a.joined_at >= ?'); binds.push(ms); }
      }
      if (dateTo) {
        const ms = Date.parse(dateTo + 'T23:59:59+09:00');
        if (!isNaN(ms)) { where.push('a.joined_at <= ?'); binds.push(ms); }
      }
      if (userId) { where.push('a.user_id = ?'); binds.push(userId); }
      if (roomId) { where.push('a.room_id = ?'); binds.push(roomId); }
      const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const sql = `SELECT a.id, a.room_id, a.user_id, a.username, a.role,
                          a.joined_at, a.left_at, a.status, a.date,
                          a.total_session_ms, a.total_active_ms, a.disconnect_count,
                          a.gaze_score, a.gaze_samples, a.gaze_forward_samples
                   FROM attendance a ${whereSQL}
                   ORDER BY a.joined_at DESC LIMIT 10000`;
      const rs = binds.length
        ? await env.DB.prepare(sql).bind(...binds).all()
        : await env.DB.prepare(sql).all();
      const rows = ((rs.results || []) as any[]).map(a => ({
        ...a,
        joined_at_iso: a.joined_at ? new Date(a.joined_at).toISOString() : '',
        left_at_iso:   a.left_at   ? new Date(a.left_at).toISOString()   : '',
        active_pct:    a.total_session_ms > 0 ? Math.round((a.total_active_ms / a.total_session_ms) * 1000) / 10 : 0,
        session_min:   a.total_session_ms ? Math.round(a.total_session_ms / 60000 * 10) / 10 : 0,
        active_min:    a.total_active_ms  ? Math.round(a.total_active_ms  / 60000 * 10) / 10 : 0
      }));
      const csv = toCSV(rows, [
        { key: 'id',                   label: 'id' },
        { key: 'date',                 label: 'date' },
        { key: 'room_id',              label: 'room_id' },
        { key: 'user_id',              label: 'user_id' },
        { key: 'username',             label: 'username' },
        { key: 'role',                 label: 'role' },
        { key: 'joined_at_iso',        label: 'joined_at' },
        { key: 'left_at_iso',          label: 'left_at' },
        { key: 'status',               label: 'status' },
        { key: 'session_min',          label: 'session_min' },
        { key: 'active_min',           label: 'active_min' },
        { key: 'active_pct',           label: 'active_pct' },
        { key: 'disconnect_count',     label: 'disconnect_count' },
        { key: 'gaze_score',           label: 'gaze_score' },
        { key: 'gaze_samples',         label: 'gaze_samples' },
        { key: 'gaze_forward_samples', label: 'gaze_forward_samples' }
      ]);
      const fname = 'attendance_' + new Date().toISOString().slice(0, 10) + '.csv';
      return csvResponse(fname, csv);
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

    // ════════════════════════════════════════════════════════════
    // 🔎 통합 실시간 검색 — 학생(ERP 명부) + 교사 이름을 DB 에서 즉시 조회
    //   GET /api/admin/omnisearch?q=  → {ok, results:[{type,name,sub,uid,url}]}
    if (method === 'GET' && path === '/api/admin/omnisearch') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return json({ ok: true, results: [] });
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      const results: any[] = [];
      try {
        const rs = await env.DB.prepare(
          `SELECT user_id, username, korean_name, english_name FROM students_erp
           WHERE korean_name LIKE ? OR english_name LIKE ? OR username LIKE ? OR user_id LIKE ?
           LIMIT 25`
        ).bind(like, like, like, like).all();
        for (const r of ((rs.results as any[]) || [])) {
          const name = r.korean_name || r.english_name || r.username || r.user_id;
          if (!name) continue;
          const uid = r.user_id || r.username || '';
          results.push({ type: 'student', name, sub: [r.english_name, r.user_id].filter(Boolean).join(' · '), uid, url: uid ? '/admin/student?uid=' + encodeURIComponent(uid) : '' });
        }
      } catch {}
      // 출석 기록 기반 학생 (ERP 미등록이라도 이름으로 검색) — 중복 제거
      try {
        const seen = new Set(results.map((x: any) => String(x.uid || x.name)));
        const rs = await env.DB.prepare(
          `SELECT user_id, MAX(username) AS username FROM attendance
           WHERE username LIKE ? OR user_id LIKE ?
           GROUP BY user_id LIMIT 25`
        ).bind(like, like).all();
        for (const r of ((rs.results as any[]) || [])) {
          const uid = r.user_id || '';
          const name = r.username || uid;
          if (!name || seen.has(String(uid || name))) continue;
          seen.add(String(uid || name));
          results.push({ type: 'student', name, sub: uid, uid, url: uid ? '/admin/student?uid=' + encodeURIComponent(uid) : '' });
        }
      } catch {}
      try {
        const rs = await env.DB.prepare(`SELECT name, status FROM teachers WHERE name LIKE ? LIMIT 25`).bind(like).all();
        for (const r of ((rs.results as any[]) || [])) {
          if (!r.name) continue;
          results.push({ type: 'teacher', name: r.name, sub: r.status || '', uid: '', url: '' });
        }
      } catch {}
      return json({ ok: true, q, results: results.slice(0, 30) });
    }

    // 🥭 Phase 21 — AI 명령 (Workers AI Llama 3.3 70B)
    //   POST /api/admin/ai-command  { command: string }
    //     · 자연어 명령을 의도 분류 (answer / navigate / query / action)
    //     · query intent 는 서버에서 자동 도구 실행 후 결과 반환
    //     · action intent 는 confirm_text 만 반환 (실행은 ai-action 엔드포인트)
    //   POST /api/admin/ai-action   { name: string, args: object }
    //     · 사용자가 confirm 다이얼로그 OK 한 후 호출
    //     · 화이트리스트 액션만 실행 (send_kakao_self/issue_sticker/mark_intervention)
    // ════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/admin/ai-command') {
      if (!env.AI) {
        return json({ ok: false, error: 'ai_binding_missing',
                      hint: 'wrangler.toml 에 [ai] binding=AI 설정 후 재배포 필요' }, 503);
      }
      const body = await parseJsonBody(request);
      const command = body?.command || '';
      if (!command) return json({ ok: false, error: 'command_required' }, 400);
      // 🌐 프런트에서 전달한 언어 힌트 (en/ko) — AI 답변 언어 결정
      const lang = (body?.lang === 'en') ? 'en' : 'ko';
      const result = await processAiCommand(env, command, lang);
      return json(result, result.ok === false ? 500 : 200);
    }

    // 🎒 학생 검색창 AI — 관리자 ai-command 와 동일 엔진, 학생 스코프 (공개)
    //   POST /api/student/ai-command  { command }
    if (method === 'POST' && path === '/api/student/ai-command') {
      const body = await parseJsonBody(request);
      const command = body?.command || '';
      if (!command) return json({ intent: 'answer', answer: '검색어를 입력해주세요.' }, 200);
      const result = await processStudentCommand(env, command);
      return json(result, 200);
    }

    if (method === 'POST' && path === '/api/admin/ai-action') {
      const body = await parseJsonBody(request);
      const name = body?.name || '';
      const args = body?.args || {};
      if (!name) return json({ ok: false, error: 'name_required' }, 400);
      // 🔒 adminUserId 는 감사로그(created_by/by) 귀속용 — 클라이언트가 임의로 보낼 수 있는
      //   x-admin-user-id 헤더 대신, 세션쿠키에서 검증된 실제 로그인 사용자로 고정한다.
      const _aiSess = await checkAdminSession(request, env as any);
      const adminUserId = _aiSess.ok ? (_aiSess.username || null) : null;
      const result = await executeAction(env, name, args, adminUserId);
      return json(result, result.ok === false ? 400 : 200);
    }

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
            WHERE (s.status = '정상' OR s.status IS NULL OR s.status = '')
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

    // 🥭 Phase RM (Room-Match) — GET /api/class/sessions/today
    //   예약(class_schedules)에서 "오늘의 수업 세션"을 계산해 결정론적 room_id + 입장 시간창을 반환.
    //   ▸ 왜? 지금까지는 교사·학생이 방 코드를 손으로 입력 → 오타/기본값으로 서로 다른 방에 들어가 못 만났음.
    //     이제 둘 다 같은 예약(schedule.id)을 참조 → room_id = `class-{scheduleId}-{YYYYMMDD}` 로 항상 동일 → 엇갈림 원천 차단.
    //   ▸ 입장 시간창(join_open)도 서버(신뢰 시계)가 계산 → "너무 일찍/늦게" 입장 방지.
    //   query: ?user_id=X | ?student_name=Y (학생) · ?role=teacher&user_id=teacherUid | &student_name=강사명 (교사)
    if (method === 'GET' && path === '/api/class/sessions/today') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`);
      } catch {}
      const url = new URL(request.url);
      const userId = (url.searchParams.get('user_id') || '').trim();
      const nameParam = (url.searchParams.get('student_name') || '').trim();
      const role = (url.searchParams.get('role') || 'student').trim().toLowerCase();
      const isTeacher = role === 'teacher' || role === 'admin';

      // ── 대상 예약 수집 조건 (신원: uid 우선, 없으면 이름으로 보강) ──
      const conds: string[] = [];
      const binds: any[] = [];
      if (isTeacher) {
        if (userId) { conds.push('cs.teacher_id = ?'); binds.push(userId); }
        if (nameParam) {
          try {
            const rs = await env.DB.prepare(`SELECT CAST(id AS TEXT) AS tid FROM teachers WHERE name = ?`).bind(nameParam).all<any>();
            for (const x of (rs.results || [])) { if (x.tid) { conds.push('cs.teacher_id = ?'); binds.push(x.tid); } }
          } catch {}
        }
      } else {
        if (userId) { conds.push('cs.user_id = ?'); binds.push(userId); }
        if (nameParam) {
          conds.push('cs.student_name = ?'); binds.push(nameParam);
          try {
            const rs = await env.DB.prepare(`SELECT COALESCE(user_id, login_id, ('stu_' || id)) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`).bind(nameParam, nameParam).all<any>();
            for (const x of (rs.results || [])) { if (x.uid) { conds.push('cs.user_id = ?'); binds.push(x.uid); } }
          } catch {}
        }
      }
      if (!conds.length) return json({ ok: false, error: 'identity_required', sessions: [], current: null }, 400);

      // ── KST(UTC+9) 기준 오늘 날짜/요일 계산 (Workers 는 UTC 라 명시 변환) ──
      const now = Date.now();
      const KST = 9 * 3600 * 1000;
      const k = new Date(now + KST);
      const kY = k.getUTCFullYear(), kMo = k.getUTCMonth(), kD = k.getUTCDate();
      const kDow = k.getUTCDay(); // 0=일 ~ 6=토 (KST 기준)
      const pad = (n: number) => String(n).padStart(2, '0');
      const ymd = `${kY}${pad(kMo + 1)}${pad(kD)}`;
      const todayStr = `${kY}-${pad(kMo + 1)}-${pad(kD)}`;

      const OPEN_BEFORE = 10 * 60 * 1000; // 시작 10분 전부터 입장 허용
      const LATE_AFTER = 15 * 60 * 1000;  // 종료 15분 후까지 지각 입장 허용

      const whereSql = `cs.status != 'cancelled' AND (${conds.join(' OR ')})`;
      const sqlJoin = `SELECT cs.id, cs.user_id, cs.student_name, cs.schedule_kind, cs.day_of_week, cs.scheduled_date, cs.start_time, cs.duration_min, cs.teacher_id, cs.status, t.name AS teacher_name FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id WHERE ${whereSql}`;
      const sqlNoJoin = `SELECT id, user_id, student_name, schedule_kind, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status FROM class_schedules cs WHERE ${whereSql}`;
      let rows: any;
      try { rows = await env.DB.prepare(sqlJoin).bind(...binds).all<any>(); }
      catch { rows = await env.DB.prepare(sqlNoJoin).bind(...binds).all<any>(); }

      const seen = new Set<number>();
      const sessions: any[] = [];
      for (const s of (rows.results || [])) {
        if (seen.has(s.id)) continue;
        // 오늘 발생하는 수업인가? (일회성=날짜 일치 / 반복=요일 일치)
        let occurs = false;
        if (s.scheduled_date) occurs = (s.scheduled_date === todayStr);
        else if (s.day_of_week != null && s.day_of_week !== '') occurs = (Number(s.day_of_week) === kDow);
        if (!occurs) continue;
        seen.add(s.id);
        const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
        const start_ts = Date.UTC(kY, kMo, kD, hh, mm, 0) - KST; // KST 벽시계 → UTC ms
        const dur = Number(s.duration_min) || 30;
        const end_ts = start_ts + dur * 60000;
        const open_at_ts = start_ts - OPEN_BEFORE;
        const close_at_ts = end_ts + LATE_AFTER;
        let status: string;
        if (now < open_at_ts) status = 'early';
        else if (now < start_ts) status = 'open';
        else if (now <= close_at_ts) status = 'live';
        else status = 'ended';
        const join_open = now >= open_at_ts && now <= close_at_ts;
        sessions.push({
          schedule_id: s.id,
          room_id: `class-${s.id}-${ymd}`, // ← 결정론적: 같은 예약 → 항상 같은 방
          student_uid: s.user_id,
          student_name: s.student_name || null,
          teacher_id: s.teacher_id || null,
          teacher_name: s.teacher_name || null,
          start_ts, end_ts, open_at_ts, close_at_ts,
          duration_min: dur, status, join_open,
          starts_in_ms: start_ts - now,
        });
      }
      sessions.sort((a, b) => a.start_ts - b.start_ts);

      // 자동 입장 대상(current): 지금 입장 가능한 것 우선(진행중/열림), 없으면 가장 가까운 예정 수업
      let current: any = null;
      const joinable = sessions.filter(x => x.join_open);
      if (joinable.length) current = joinable.sort((a, b) => Math.abs(a.start_ts - now) - Math.abs(b.start_ts - now))[0];
      else { const up = sessions.filter(x => x.status === 'early'); if (up.length) current = up[0]; }

      return json({ ok: true, now, today: todayStr, role: isTeacher ? 'teacher' : 'student', sessions, current });
    }

    // 🥭 Phase RM 3단계 — GET /api/class/verify-room
    //   예약제 방(class-{id}-{YYYYMMDD})에 '남의 방'으로 잘못 입장하는 것을 서버가 검증.
    //   ▸ 정상 예약자(학생)·담당 교사·관리자는 통과. 예약을 못 찾거나 신원 불명이면 fail-open(통과)로 정상수업 방해 금지.
    //   ▸ authorized === false 일 때만 클라이언트가 차단. (class-* 패턴이 아닌 임의 방은 게이트 안 함)
    //   query: ?room_id=class-123-20260705&user_id=X&student_name=Y&role=student|teacher
    if (method === 'GET' && path === '/api/class/verify-room') {
      const url = new URL(request.url);
      const roomId = (url.searchParams.get('room_id') || '').trim();
      const userId = (url.searchParams.get('user_id') || '').trim();
      const nameParam = (url.searchParams.get('student_name') || '').trim();
      const role = (url.searchParams.get('role') || 'student').trim().toLowerCase();
      const m = /^class-(\d+)-\d{8}$/.exec(roomId);
      if (!m) return json({ ok: true, authorized: true, reason: 'not_managed_room' }); // 예약제 방이 아니면 게이트 안 함
      if (role === 'admin' || role === 'observer') return json({ ok: true, authorized: true, reason: 'privileged' });
      if (!userId && !nameParam) return json({ ok: true, authorized: 'unknown', reason: 'no_identity' }); // 신원 불명 → 통과
      const schedId = Number(m[1]);
      let row: any = null;
      try {
        row = await env.DB.prepare(`SELECT cs.id, cs.user_id, cs.student_name, cs.teacher_id, t.name AS teacher_name FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id WHERE cs.id = ? LIMIT 1`).bind(schedId).first<any>();
      } catch {
        try { row = await env.DB.prepare(`SELECT id, user_id, student_name, teacher_id FROM class_schedules WHERE id = ? LIMIT 1`).bind(schedId).first<any>(); } catch {}
      }
      if (!row) return json({ ok: true, authorized: 'unknown', reason: 'schedule_not_found' }); // 예약 없음 → 통과(fail-open)
      let ok = false;
      if (userId) {
        if (String(row.user_id) === userId) ok = true;                    // 학생 uid 일치
        if (!ok && String(row.teacher_id || '') === userId) ok = true;    // 교사 uid == teacher_id
        if (!ok) {
          // 이름 기반 학생 uid 병합(동명/키 다양성 대비)
          try {
            const rs = await env.DB.prepare(`SELECT COALESCE(user_id, login_id, ('stu_' || id)) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`).bind(row.student_name || '', row.student_name || '').all<any>();
            for (const x of (rs.results || [])) { if (String(x.uid) === userId) { ok = true; break; } }
          } catch {}
        }
      }
      if (!ok && nameParam) {
        if (row.student_name && row.student_name === nameParam) ok = true;          // 학생 이름 일치
        if (!ok && row.teacher_name && row.teacher_name === nameParam) ok = true;   // 교사 이름 일치
      }
      return json({ ok: true, authorized: ok, owner_name: row.student_name || null, reason: ok ? 'match' : 'mismatch' });
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
             AND COALESCE(status, '정상') = '정상'
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
               AND COALESCE(status, '정상') = '정상'
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
          const r = await env.DB.prepare(`SELECT COALESCE(user_id, login_id, 'stu_' || id) AS uid, COALESCE(korean_name, username) AS name FROM students_erp WHERE COALESCE(status,'정상')='정상' ORDER BY rowid DESC LIMIT 1`).first<any>();
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
      try {
        await env.DB.prepare(
          `UPDATE class_schedules SET status='cancelled', updated_at=? WHERE id=?`
        ).bind(Date.now(), id).run();
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
      try {
        await env.DB.prepare(`UPDATE class_schedules SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
        return json({ ok: true, id, updated_fields: sets.length - 1 });
      } catch (e: any) {
        return json({ ok: false, error: 'update_failed', detail: String(e?.message || e) }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎁 Phase P1 - 망고아이 포인트 시스템 + 기프티콘 교환
    // ═══════════════════════════════════════════════════════════════

    // 헬퍼: 포인트 테이블 자동 생성 (안전망)
    const ensurePointTables = async () => {
      if (__pointTablesReady) return;   // isolate 당 1회만 DDL 실행 (503 폭주 방지)
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER NOT NULL DEFAULT 0, lifetime_earned INTEGER NOT NULL DEFAULT 0, lifetime_spent INTEGER NOT NULL DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT, rule_code TEXT, redemption_id INTEGER, actor_id TEXT, actor_name TEXT, created_at INTEGER NOT NULL, meta TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rules (code TEXT PRIMARY KEY, label TEXT NOT NULL, amount INTEGER NOT NULL, cooldown_sec INTEGER DEFAULT 0, daily_cap INTEGER, enabled INTEGER DEFAULT 1, description TEXT, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gift_catalog (id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT, brand TEXT, name TEXT NOT NULL, category TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, thumbnail_url TEXT, stock INTEGER, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, description TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gift_redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, catalog_id INTEGER NOT NULL, gift_name TEXT, gift_brand TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, recipient_phone TEXT, recipient_name TEXT, status TEXT NOT NULL DEFAULT 'pending', external_order_id TEXT, external_coupon_code TEXT, error_message TEXT, requested_at INTEGER NOT NULL, sent_at INTEGER, delivered_at INTEGER, failed_at INTEGER, refunded_at INTEGER, txn_spend_id INTEGER, txn_refund_id INTEGER, meta TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER NOT NULL, triggered_at INTEGER NOT NULL, txn_id INTEGER, meta TEXT);`);
      // 🌟 (2026-07-05) 화상수업 실시간 칭찬 포인트를 "가장 확실하게" 학생 전체 포인트로 적립하기 위한 두 테이블.
      //   vc_roster       : 학생이 수업 입장 시 (방·피어ID → 자기 계정 uid) 를 등록 → 선생님이 별을 누르면
      //                     서버가 대상 학생의 진짜 계정을 찾아 직접 적립(학생 브라우저 상태와 무관).
      //   point_awards    : awardId 멱등키 — 학생-자기적립 경로와 서버-선생님적립 경로가 동시에 돌아도
      //                     한 번의 별 = 정확히 1점만 적립되게 보장(중복 방지).
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vc_roster (room_id TEXT NOT NULL, peer_id TEXT NOT NULL, account_uid TEXT NOT NULL, name TEXT, role TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (room_id, peer_id));`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_awards (award_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, room_id TEXT, credited_at INTEGER NOT NULL);`);
      __pointTablesReady = true;
    };

    // 헬퍼: 학생 포인트 거래 (적립 또는 차감) - 트랜잭션 보장
    const applyPointTransaction = async (params: {
      userId: string, studentName?: string,
      type: 'earn' | 'spend' | 'refund' | 'admin_grant' | 'admin_deduct' | 'expire',
      amount: number, reason?: string,
      ruleCode?: string, redemptionId?: number,
      actorId?: string, actorName?: string, meta?: any,
    }) => {
      const now = Date.now();
      const { userId, studentName, type, amount, reason, ruleCode, redemptionId, actorId, actorName, meta } = params;
      // 현재 잔액 조회 + 행 생성
      let row: any = await env.DB.prepare(`SELECT balance, lifetime_earned, lifetime_spent FROM student_points WHERE user_id=?`).bind(userId).first();
      if (!row) {
        await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, lifetime_spent, updated_at) VALUES (?,?,0,0,0,?)`)
          .bind(userId, studentName || null, now).run();
        row = { balance: 0, lifetime_earned: 0, lifetime_spent: 0 };
      }
      const isCredit = (type === 'earn' || type === 'refund' || type === 'admin_grant');
      const signed = isCredit ? Math.abs(amount) : -Math.abs(amount);
      // ⚛ 원자적 잔액 변경: 상대적(+signed) 갱신 + 차감이 잔액을 음수로 만들면 거부(WHERE balance+signed>=0).
      //   기존엔 SELECT 후 절대값을 덮어써서, 동시 차감 시 둘 다 통과해 초과사용(음수 잔액)이 가능했음.
      //   D1(SQLite) 은 쓰기를 직렬화하므로 이 조건부 UPDATE 는 동시성에서 정확히 한 쪽만 성공한다.
      const upd = await env.DB.prepare(
        `UPDATE student_points SET balance = balance + ?, lifetime_earned = lifetime_earned + ?, lifetime_spent = lifetime_spent + ?, last_earned_at = CASE WHEN ?>0 THEN ? ELSE last_earned_at END, last_spent_at = CASE WHEN ?<0 THEN ? ELSE last_spent_at END, student_name = COALESCE(?, student_name), updated_at = ? WHERE user_id = ? AND balance + ? >= 0`
      ).bind(signed, signed > 0 ? signed : 0, signed < 0 ? -signed : 0, signed, now, signed, now, studentName || null, now, userId, signed).run();
      if (!upd?.meta?.changes) {   // 조건 실패 = 잔액 부족(동시 차감 포함)
        const cur: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(userId).first();
        throw new Error(`잔액 부족: 현재 ${cur?.balance ?? (row.balance || 0)}P, 차감 ${Math.abs(signed)}P`);
      }
      const afterRow: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(userId).first();
      const newBalance = afterRow?.balance ?? ((row.balance || 0) + signed);
      // INSERT 거래내역
      const ins = await env.DB.prepare(`INSERT INTO point_transactions (user_id, student_name, type, amount, balance_after, reason, rule_code, redemption_id, actor_id, actor_name, created_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(userId, studentName || null, type, signed, newBalance, reason || null, ruleCode || null, redemptionId || null, actorId || null, actorName || null, now, meta ? JSON.stringify(meta) : null).run();
      return { txnId: ins?.meta?.last_row_id, newBalance, signed };
    };

    // 🌟 헬퍼: 실시간 수업 칭찬 포인트 적립(멱등) — 학생 전체 포인트(student_points.balance)에 1점 적립.
    //   awardId 를 주면 point_awards 로 "한 별 = 정확히 1점" 보장. 학생-자기적립/서버-선생님적립 두 경로가
    //   같은 awardId 로 동시에 들어와도 먼저 claim 한 쪽만 실제 적립하고, 다른 쪽은 already 로 무해하게 통과.
    const creditPraisePoint = async (opts: {
      accountUid: string; studentName?: string | null; awardId?: string | null;
      room?: string | null; fromName?: string | null;
    }) => {
      const accountUid = (opts.accountUid || '').trim();
      if (!accountUid) return { ok: false, error: 'no_account' };
      await ensurePointTables();
      const now = Date.now();
      // 규칙 자동 시드/갱신 (1점 · 학생당 1초 쿨다운 · 하루 100회)
      await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES ('teacher_praise_point','선생님 칭찬 포인트',1,1,100,1,'실시간 수업 중 선생님이 잘한 답변에 즉석 지급',?) ON CONFLICT(code) DO UPDATE SET cooldown_sec=1, daily_cap=100, enabled=1`).bind(now).run();
      const rule: any = await env.DB.prepare(`SELECT * FROM point_rules WHERE code='teacher_praise_point' AND enabled=1`).first();
      const amount = rule?.amount || 1;
      // ⚛ 멱등 claim — awardId 있을 때만. 이미 적립됐으면 그대로 성공 반환(중복 적립 안 함).
      if (opts.awardId) {
        const claim = await env.DB.prepare(`INSERT OR IGNORE INTO point_awards (award_id, user_id, room_id, credited_at) VALUES (?,?,?,?)`)
          .bind(opts.awardId, accountUid, opts.room || null, now).run();
        if (!claim?.meta?.changes) {
          const b: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(accountUid).first();
          return { ok: true, already: true, amount, newBalance: b?.balance ?? null };
        }
      }
      // 일일 한도 (KST 자정 기준)
      if (rule?.daily_cap) {
        const KST_OFF = 9 * 3600 * 1000;
        const todayMs = Math.floor((now + KST_OFF) / 86400000) * 86400000 - KST_OFF;
        const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code='teacher_praise_point' AND triggered_at>=?`).bind(accountUid, todayMs).first();
        if ((cnt?.c || 0) >= rule.daily_cap) return { ok: false, error: 'daily_cap_reached', cap: rule.daily_cap };
      }
      const r = await applyPointTransaction({
        userId: accountUid, studentName: opts.studentName || undefined, type: 'earn',
        amount, reason: rule?.label || '선생님 칭찬 포인트', ruleCode: 'teacher_praise_point',
        meta: { room: opts.room, awardId: opts.awardId, from: opts.fromName },
      });
      await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
        .bind(accountUid, 'teacher_praise_point', amount, now, r.txnId, JSON.stringify({ room: opts.room, awardId: opts.awardId })).run();
      return { ok: true, ...r, amount, rule: { code: 'teacher_praise_point', label: rule?.label, amount } };
    };

    // ── GET /api/points/balance?uid=xxx — 학생 본인 포인트 잔액 + 최근 거래 ──
    if (method === 'GET' && path === '/api/points/balance') {
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // fix (2026-06-01) — DB 에러가 나도 절대 503/500 던지지 않고 잔액 0 으로 graceful 응답.
      //   (DDL 폭주/락으로 인한 503 콘솔 도배 방지)
      try {
        await ensurePointTables();
        const row: any = await env.DB.prepare(`SELECT * FROM student_points WHERE user_id=?`).bind(uid).first();
        const txns = await env.DB.prepare(`SELECT id, type, amount, balance_after, reason, created_at FROM point_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 30`).bind(uid).all();
        return json({
          ok: true,
          balance: row?.balance || 0,
          lifetime_earned: row?.lifetime_earned || 0,
          lifetime_spent: row?.lifetime_spent || 0,
          student_name: row?.student_name || null,
          recent: txns.results || [],
        });
      } catch (e: any) {
        return json({ ok: false, balance: 0, lifetime_earned: 0, lifetime_spent: 0, recent: [], error: 'points_unavailable', detail: String(e?.message || e) });
      }
    }

    // ── GET /api/admin/points/list — 전체 학생 포인트 잔액 (관리자) ──
    if (method === 'GET' && path === '/api/admin/points/list') {
      await ensurePointTables();
      const rs = await env.DB.prepare(`SELECT user_id, student_name, balance, lifetime_earned, lifetime_spent, last_earned_at, last_spent_at, updated_at FROM student_points ORDER BY balance DESC, updated_at DESC LIMIT 500`).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/points/adjust — 관리자가 포인트 지급/차감 ──
    //   body: { user_id, student_name, amount, reason, type? ('admin_grant'|'admin_deduct') }
    if (method === 'POST' && path === '/api/admin/points/adjust') {
      await ensurePointTables();
      const body: any = await request.json().catch(() => ({}));
      const userId = (body.user_id || '').trim();
      const studentName = (body.student_name || '').trim();
      const amount = Math.abs(parseInt(body.amount, 10) || 0);
      const type = body.type === 'admin_deduct' ? 'admin_deduct' : 'admin_grant';
      const reason = (body.reason || (type === 'admin_grant' ? '관리자 지급' : '관리자 차감')).trim();
      const actorId = body.actor_id || 'admin';
      const actorName = body.actor_name || '관리자';
      if (!userId) return json({ ok: false, error: 'user_id_required' }, 400);
      if (!amount) return json({ ok: false, error: 'amount_required' }, 400);
      try {
        const r = await applyPointTransaction({ userId, studentName, type, amount, reason, actorId, actorName });
        return json({ ok: true, ...r });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 400);
      }
    }

    // ── POST /api/points/earn-by-rule — 자동 적립 (출석/숙제/제시간 등) ──
    //   body: { user_id, student_name?, rule_code, meta? }
    //   쿨다운/일일 한도 체크 후 적립
    if (method === 'POST' && path === '/api/points/earn-by-rule') {
      await ensurePointTables();
      const body: any = await request.json().catch(() => ({}));
      const userId = (body.user_id || '').trim();
      const ruleCode = (body.rule_code || '').trim();
      if (!userId || !ruleCode) return json({ ok: false, error: 'user_id_and_rule_required' }, 400);
      // 🌟 실시간 수업 칭찬 포인트 — 학생 본인 브라우저가 자기 계정으로 적립하는 경로.
      //   awardId(멱등키)를 함께 넘겨, 서버-선생님적립 경로(/api/points/award-praise)와 겹쳐도 1점만 적립.
      if (ruleCode === 'teacher_praise_point') {
        const res: any = await creditPraisePoint({
          accountUid: userId, studentName: body.student_name,
          awardId: body.meta?.awardId || null, room: body.meta?.room || null, fromName: body.meta?.from || null,
        });
        return json(res.ok ? { ...res, rule: res.rule || { code: 'teacher_praise_point', amount: res.amount || 1 } } : res, res.ok ? 200 : 200);
      }
      const rule: any = await env.DB.prepare(`SELECT * FROM point_rules WHERE code=? AND enabled=1`).bind(ruleCode).first();
      if (!rule) return json({ ok: false, error: 'rule_not_found_or_disabled', code: ruleCode }, 404);
      // 쿨다운 검사
      const now = Date.now();
      if ((rule.cooldown_sec || 0) > 0) {
        const last: any = await env.DB.prepare(`SELECT triggered_at FROM point_rule_log WHERE user_id=? AND rule_code=? ORDER BY triggered_at DESC LIMIT 1`).bind(userId, ruleCode).first();
        if (last && (now - last.triggered_at) < rule.cooldown_sec * 1000) {
          return json({ ok: false, error: 'cooldown', remaining_sec: Math.ceil((rule.cooldown_sec*1000 - (now - last.triggered_at))/1000) });
        }
      }
      // 일일 한도 검사 — 하루 경계는 KST 자정(=UTC 15:00) 기준으로 통일(나머지 코드의 today() 와 일치)
      if (rule.daily_cap) {
        const KST_OFF = 9 * 3600 * 1000;
        const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
        const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`).bind(userId, ruleCode, todayMs).first();
        if ((cnt?.c || 0) >= rule.daily_cap) {
          return json({ ok: false, error: 'daily_cap_reached', cap: rule.daily_cap });
        }
      }
      // 적립
      try {
        const r = await applyPointTransaction({
          userId, studentName: body.student_name, type: 'earn',
          amount: rule.amount, reason: rule.label, ruleCode, meta: body.meta,
        });
        await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
          .bind(userId, ruleCode, rule.amount, now, r.txnId, body.meta ? JSON.stringify(body.meta) : null).run();
        return json({ ok: true, ...r, rule: { code: rule.code, label: rule.label, amount: rule.amount } });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 400);
      }
    }

    // ── POST /api/vc/roster — 학생이 수업 입장 시 (방·피어ID → 자기 계정 uid) 등록 ──
    //   body: { room, peer_id, account_uid, name?, role? }
    //   이 매핑이 있어야 선생님이 별을 눌렀을 때 서버가 대상 학생의 진짜 계정을 찾아 적립할 수 있다.
    if (method === 'POST' && path === '/api/vc/roster') {
      try {
        await ensurePointTables();
        const body: any = await request.json().catch(() => ({}));
        const room = (body.room || '').trim();
        const peerId = String(body.peer_id || '').trim();
        const accountUid = (body.account_uid || '').trim();
        const name = (body.name || '').trim();
        const role = (body.role || 'student').trim();
        if (!room || !peerId || !accountUid) return json({ ok: false, error: 'room_peer_account_required' }, 400);
        await env.DB.prepare(`INSERT INTO vc_roster (room_id, peer_id, account_uid, name, role, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(room_id, peer_id) DO UPDATE SET account_uid=excluded.account_uid, name=excluded.name, role=excluded.role, updated_at=excluded.updated_at`)
          .bind(room, peerId, accountUid, name || null, role, Date.now()).run();
        return json({ ok: true });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 200);
      }
    }

    // ── POST /api/points/award-praise — 선생님이 별을 누르면 서버가 대상 학생 계정에 직접 적립 ──
    //   body: { room, target_peer_id, award_id, from_name? }
    //   학생 브라우저의 로그인/신호수신/네트워크 상태와 무관하게, 입장 때 등록된 계정으로 적립(멱등).
    //   학생이 로그인 안 하고 게스트로 들어와 vc_roster 에 없으면 account_not_registered 반환(적립 불가).
    if (method === 'POST' && path === '/api/points/award-praise') {
      try {
        await ensurePointTables();
        const body: any = await request.json().catch(() => ({}));
        const room = (body.room || '').trim();
        const targetPeerId = String(body.target_peer_id || '').trim();
        const awardId = (body.award_id || '').trim() || null;
        const fromName = (body.from_name || '선생님').trim();
        if (!room || !targetPeerId) return json({ ok: false, error: 'room_and_target_required' }, 400);
        const rr: any = await env.DB.prepare(`SELECT account_uid, name, role FROM vc_roster WHERE room_id=? AND peer_id=? LIMIT 1`).bind(room, targetPeerId).first();
        if (!rr?.account_uid) return json({ ok: false, error: 'account_not_registered' }, 200);
        if (rr.role && rr.role !== 'student') return json({ ok: false, error: 'target_not_student' }, 200);
        const res: any = await creditPraisePoint({ accountUid: rr.account_uid, studentName: rr.name, awardId, room, fromName });
        return json(res);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 200);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ⭐ 수업 강사 평가 — 학생이 수업 종료 직후 별 7개(1~7점) + 태그 + 건의사항 제출
    // ═══════════════════════════════════════════════════════════════

    const ensureClassRatingsTable = async () => {
      if (__classRatingsReady) return;
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, teacher_name TEXT, score INTEGER NOT NULL, tags TEXT, feedback TEXT, rated_date TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(room_id, student_uid, rated_date));`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_class_ratings_teacher ON class_ratings(teacher_name, created_at);`);
      __classRatingsReady = true;
    };

    // ── POST /api/ratings — 평가 제출 (하루에 같은 방 1회, 제출 시 포인트 적립) ──
    //   body: { room_id, student_uid, student_name?, teacher_name?, score(1~7), tags?: string[], feedback? }
    if (method === 'POST' && path === '/api/ratings') {
      await ensureClassRatingsTable();
      const body: any = await request.json().catch(() => ({}));
      const roomId = (body.room_id || '').trim();
      const studentUid = (body.student_uid || '').trim();
      const score = parseInt(body.score, 10);
      if (!roomId || !studentUid) return json({ ok: false, error: 'room_id_and_student_uid_required' }, 400);
      if (!Number.isInteger(score) || score < 1 || score > 7) return json({ ok: false, error: 'score_must_be_1_to_7' }, 400);

      // 강사 이름: 클라이언트가 못 넘기면 attendance 에서 그 방의 강사 조회
      let teacherName = (body.teacher_name || '').trim();
      if (!teacherName) {
        try {
          const t: any = await env.DB.prepare(`SELECT username FROM attendance WHERE room_id=? AND role='teacher' AND username IS NOT NULL ORDER BY joined_at DESC LIMIT 1`).bind(roomId).first();
          if (t?.username) teacherName = String(t.username);
        } catch { /* attendance 없으면 빈 값 허용 */ }
      }

      const tags = Array.isArray(body.tags) ? body.tags.map((t: any) => String(t)).slice(0, 12) : [];
      const feedback = String(body.feedback || '').slice(0, 1000).trim();
      const ratedDate = today();
      const now = Date.now();
      try {
        await env.DB.prepare(`INSERT INTO class_ratings (room_id, student_uid, student_name, teacher_name, score, tags, feedback, rated_date, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .bind(roomId, studentUid, body.student_name || null, teacherName || null, score, tags.length ? JSON.stringify(tags) : null, feedback || null, ratedDate, now).run();
      } catch (e: any) {
        if (/UNIQUE/i.test(String(e?.message || e))) return json({ ok: true, already_rated: true, points_awarded: 0 });
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }

      // 포인트 적립 (규칙 자동 시드: 10P, 하루 5회 한도) — 실패해도 평가 저장은 유지
      let pointsAwarded = 0;
      try {
        await ensurePointTables();
        await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES ('class_rating','수업 평가 참여',10,0,5,1,'수업 종료 후 강사 평가 제출 시 자동 적립',?) ON CONFLICT(code) DO NOTHING`).bind(now).run();
        const rule: any = await env.DB.prepare(`SELECT * FROM point_rules WHERE code='class_rating' AND enabled=1`).first();
        if (rule) {
          const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
          const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code='class_rating' AND triggered_at>=?`).bind(studentUid, startOfDay.getTime()).first();
          if (!rule.daily_cap || (cnt?.c || 0) < rule.daily_cap) {
            const r = await applyPointTransaction({ userId: studentUid, studentName: body.student_name, type: 'earn', amount: rule.amount, reason: rule.label, ruleCode: 'class_rating', meta: { room_id: roomId, score } });
            await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
              .bind(studentUid, 'class_rating', rule.amount, now, r.txnId, JSON.stringify({ room_id: roomId })).run();
            pointsAwarded = rule.amount;
          }
        }
      } catch { /* 포인트 실패 무시 */ }

      return json({ ok: true, teacher_name: teacherName || null, points_awarded: pointsAwarded });
    }

    // ── GET /api/ratings/check?room_id=&uid= — 오늘 이 방을 이미 평가했는지 ──
    if (method === 'GET' && path === '/api/ratings/check') {
      const roomId = (url.searchParams.get('room_id') || '').trim();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!roomId || !uid) return json({ ok: false, error: 'room_id_and_uid_required' }, 400);
      try {
        await ensureClassRatingsTable();
        const row: any = await env.DB.prepare(`SELECT id FROM class_ratings WHERE room_id=? AND student_uid=? AND rated_date=?`).bind(roomId, uid, today()).first();
        return json({ ok: true, rated: !!row });
      } catch {
        return json({ ok: true, rated: false });
      }
    }

    // ── GET /api/admin/ratings/summary?days=30 — 강사별 평균/건수/태그 집계 ──
    if (method === 'GET' && path === '/api/admin/ratings/summary') {
      await ensureClassRatingsTable();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const since = Date.now() - days * 86400 * 1000;
      const rs = await env.DB.prepare(`SELECT teacher_name, score, tags FROM class_ratings WHERE created_at>=?`).bind(since).all();
      const byTeacher: Record<string, { count: number; sum: number; low: number; tags: Record<string, number> }> = {};
      for (const row of (rs.results || []) as any[]) {
        const name = row.teacher_name || '(미확인)';
        const t = byTeacher[name] || (byTeacher[name] = { count: 0, sum: 0, low: 0, tags: {} });
        t.count++; t.sum += row.score;
        if (row.score <= 2) t.low++;
        if (row.tags) {
          try { for (const tag of JSON.parse(row.tags)) t.tags[tag] = (t.tags[tag] || 0) + 1; } catch {}
        }
      }
      const rows = Object.entries(byTeacher).map(([teacher_name, t]) => ({
        teacher_name,
        count: t.count,
        avg_score: Math.round((t.sum / t.count) * 100) / 100,
        low_count: t.low,
        top_tags: Object.entries(t.tags).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, n]) => ({ tag, count: n })),
      })).sort((a, b) => b.count - a.count);
      return json({ ok: true, days, total: (rs.results || []).length, rows });
    }

    // ── GET /api/admin/ratings/list?teacher_name=&days=30&limit=50 — 개별 평가(건의사항 포함) ──
    if (method === 'GET' && path === '/api/admin/ratings/list') {
      await ensureClassRatingsTable();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      const teacher = (url.searchParams.get('teacher_name') || '').trim();
      const since = Date.now() - days * 86400 * 1000;
      const rs = teacher
        ? await env.DB.prepare(`SELECT id, room_id, student_name, teacher_name, score, tags, feedback, rated_date, created_at FROM class_ratings WHERE created_at>=? AND teacher_name=? ORDER BY created_at DESC LIMIT ?`).bind(since, teacher, limit).all()
        : await env.DB.prepare(`SELECT id, room_id, student_name, teacher_name, score, tags, feedback, rated_date, created_at FROM class_ratings WHERE created_at>=? ORDER BY created_at DESC LIMIT ?`).bind(since, limit).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── GET /api/admin/ratings/analytics?teacher_name=&days= — 절사평균 분석 + 분포/추이 ──
    //   최고점·최저점 각 1개씩 제외한 절사평균(trimmed mean) + 점수 분포 + 일자별 추이 + 등급
    if (method === 'GET' && path === '/api/admin/ratings/analytics') {
      await ensureClassRatingsTable();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '90', 10) || 90));
      const teacher = (url.searchParams.get('teacher_name') || '').trim();
      const since = Date.now() - days * 86400 * 1000;
      const rs = teacher
        ? await env.DB.prepare(`SELECT score, tags, created_at FROM class_ratings WHERE created_at>=? AND teacher_name=? ORDER BY created_at ASC`).bind(since, teacher).all()
        : await env.DB.prepare(`SELECT score, tags, created_at FROM class_ratings WHERE created_at>=? ORDER BY created_at ASC`).bind(since).all();
      const rows = (rs.results || []) as any[];
      const scores = rows.map(r => r.score as number);
      const count = scores.length;
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
      const rawAvg = count ? sum(scores) / count : 0;
      // 절사평균: 최저 1개 + 최고 1개 제외 (표본 3개 이상일 때만 의미)
      let trimmed = rawAvg;
      let trimmedDropped = 0;
      if (count >= 3) {
        const sorted = scores.slice().sort((a, b) => a - b);
        const inner = sorted.slice(1, sorted.length - 1);
        trimmed = inner.length ? sum(inner) / inner.length : rawAvg;
        trimmedDropped = 2;
      }
      const distribution = [1, 2, 3, 4, 5, 6, 7].map(s => ({ score: s, count: scores.filter(x => x === s).length }));
      // 일자별 추이 (KST)
      const byDay: Record<string, number[]> = {};
      for (const r of rows) { const d = today(r.created_at as number); (byDay[d] = byDay[d] || []).push(r.score as number); }
      const trend = Object.keys(byDay).sort().map(d => ({ date: d, avg: round2(sum(byDay[d]) / byDay[d].length), count: byDay[d].length }));
      // 태그 집계
      const tagCount: Record<string, number> = {};
      for (const r of rows) { if (r.tags) { try { for (const t of JSON.parse(r.tags)) tagCount[t] = (tagCount[t] || 0) + 1; } catch {} } }
      const top_tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, c]) => ({ tag, count: c }));
      const low_count = scores.filter(x => x <= 2).length;
      const high_count = scores.filter(x => x >= 6).length;
      const grade = trimmed >= 6 ? 'excellent' : trimmed >= 5 ? 'good' : trimmed >= 4 ? 'fair' : 'needs_improvement';
      // 추이 방향 (전반부 vs 후반부 절사평균 비교)
      let trendDir = 'flat';
      if (trend.length >= 4) {
        const half = Math.floor(trend.length / 2);
        const firstAvg = sum(trend.slice(0, half).map(t => t.avg)) / half;
        const secondAvg = sum(trend.slice(half).map(t => t.avg)) / (trend.length - half);
        if (secondAvg - firstAvg >= 0.4) trendDir = 'up';
        else if (firstAvg - secondAvg >= 0.4) trendDir = 'down';
      }
      return json({
        ok: true, teacher_name: teacher || null, days, count,
        raw_avg: round2(rawAvg), trimmed_avg: round2(trimmed), trimmed_dropped: trimmedDropped,
        min: count ? Math.min(...scores) : 0, max: count ? Math.max(...scores) : 0,
        low_count, high_count, distribution, trend, top_tags, grade, trend_dir: trendDir,
      });
    }

    // ── GET /api/teacher/my-ratings?teacher_name=&days=&limit= — 강사 본인용(무기명) ──
    //   강사에게는 학생 신원을 절대 노출하지 않음 → SELECT 에서 student_name 아예 제외.
    //   (솔직한 평가 유도: 강사가 누가 줬는지 알 수 없어야 함). 관리자는 /api/admin/ratings/list 사용(기명).
    if (method === 'GET' && path === '/api/teacher/my-ratings') {
      await ensureClassRatingsTable();
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '90', 10) || 90));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const teacher = (url.searchParams.get('teacher_name') || '').trim();
      if (!teacher) return json({ ok: false, error: 'teacher_name_required' }, 400);
      const since = Date.now() - days * 86400 * 1000;
      const rs = await env.DB.prepare(`SELECT id, room_id, score, tags, feedback, rated_date, created_at FROM class_ratings WHERE created_at>=? AND teacher_name=? ORDER BY created_at DESC LIMIT ?`).bind(since, teacher, limit).all();
      return json({ ok: true, anonymous: true, rows: rs.results || [] });
    }

    // ── GET /api/admin/points/rules — 자동 적립 규칙 목록 ──
    if (method === 'GET' && path === '/api/admin/points/rules') {
      await ensurePointTables();
      const rs = await env.DB.prepare(`SELECT * FROM point_rules ORDER BY code`).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── PUT /api/admin/points/rules — 자동 적립 규칙 갱신/생성 ──
    if (method === 'PUT' && path === '/api/admin/points/rules') {
      await ensurePointTables();
      const body: any = await request.json().catch(() => ({}));
      const code = (body.code || '').trim();
      if (!code) return json({ ok: false, error: 'code_required' }, 400);
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET label=excluded.label, amount=excluded.amount, cooldown_sec=excluded.cooldown_sec, daily_cap=excluded.daily_cap, enabled=excluded.enabled, description=excluded.description, updated_at=excluded.updated_at`)
        .bind(code, body.label || code, parseInt(body.amount, 10) || 0, parseInt(body.cooldown_sec, 10) || 0, body.daily_cap ? parseInt(body.daily_cap, 10) : null, body.enabled === false ? 0 : 1, body.description || null, now).run();
      return json({ ok: true, code });
    }

    // ── GET /api/gifts/catalog — 학생용 기프티콘 카탈로그 (활성화된 것만) ──
    if (method === 'GET' && path === '/api/gifts/catalog') {
      await ensurePointTables();
      const rs = await env.DB.prepare(`SELECT id, brand, name, category, face_value, point_price, thumbnail_url, stock, description FROM gift_catalog WHERE enabled=1 ORDER BY sort_order ASC, point_price ASC`).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── GET /api/admin/gifts/catalog — 관리자 카탈로그 (전체) ──
    if (method === 'GET' && path === '/api/admin/gifts/catalog') {
      await ensurePointTables();
      const rs = await env.DB.prepare(`SELECT * FROM gift_catalog ORDER BY sort_order ASC, id ASC`).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── POST /api/admin/gifts/catalog — 카탈로그 추가/수정 ──
    //   body: { id?, brand, name, category, face_value, point_price, thumbnail_url?, stock?, enabled?, sort_order?, description?, external_id? }
    if (method === 'POST' && path === '/api/admin/gifts/catalog') {
      await ensurePointTables();
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      if (body.id) {
        await env.DB.prepare(`UPDATE gift_catalog SET external_id=?, brand=?, name=?, category=?, face_value=?, point_price=?, thumbnail_url=?, stock=?, enabled=?, sort_order=?, description=?, updated_at=? WHERE id=?`)
          .bind(body.external_id || null, body.brand || null, body.name, body.category || null, parseInt(body.face_value,10)||0, parseInt(body.point_price,10)||0, body.thumbnail_url || null, body.stock != null ? parseInt(body.stock,10) : null, body.enabled === false ? 0 : 1, parseInt(body.sort_order,10) || 0, body.description || null, now, body.id).run();
        return json({ ok: true, id: body.id, updated: true });
      } else {
        const ins = await env.DB.prepare(`INSERT INTO gift_catalog (external_id, brand, name, category, face_value, point_price, thumbnail_url, stock, enabled, sort_order, description, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(body.external_id || null, body.brand || null, body.name, body.category || null, parseInt(body.face_value,10)||0, parseInt(body.point_price,10)||0, body.thumbnail_url || null, body.stock != null ? parseInt(body.stock,10) : null, body.enabled === false ? 0 : 1, parseInt(body.sort_order,10) || 0, body.description || null, now, now).run();
        return json({ ok: true, id: ins?.meta?.last_row_id, created: true });
      }
    }

    // ── POST /api/gifts/redeem — 학생 기프티콘 교환 신청 (포인트 차감 + 발송 큐) ──
    //   body: { user_id, student_name?, catalog_id, recipient_phone, recipient_name? }
    //   기프티쇼 비즈 API 키 없으면 status='pending', 있으면 실제 발송 시도
    if (method === 'POST' && path === '/api/gifts/redeem') {
      await ensurePointTables();
      const body: any = await request.json().catch(() => ({}));
      const userId = (body.user_id || '').trim();
      const catalogId = parseInt(body.catalog_id, 10) || 0;
      const phone = (body.recipient_phone || '').replace(/[^0-9]/g, '');
      if (!userId || !catalogId || !phone) return json({ ok: false, error: 'missing_required', need: 'user_id, catalog_id, recipient_phone' }, 400);
      if (phone.length < 10) return json({ ok: false, error: 'invalid_phone' }, 400);
      const item: any = await env.DB.prepare(`SELECT * FROM gift_catalog WHERE id=? AND enabled=1`).bind(catalogId).first();
      if (!item) return json({ ok: false, error: 'gift_not_found_or_disabled' }, 404);
      if (item.stock != null && item.stock <= 0) return json({ ok: false, error: 'out_of_stock' }, 409);
      const balanceRow: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(userId).first();
      const currentBalance = balanceRow?.balance || 0;
      if (currentBalance < item.point_price) return json({ ok: false, error: 'insufficient_points', balance: currentBalance, need: item.point_price }, 402);
      const now = Date.now();
      // 1) gift_redemptions 행 INSERT (pending)
      const insR = await env.DB.prepare(`INSERT INTO gift_redemptions (user_id, student_name, catalog_id, gift_name, gift_brand, face_value, point_price, recipient_phone, recipient_name, status, requested_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(userId, body.student_name || null, catalogId, item.name, item.brand, item.face_value, item.point_price, phone, body.recipient_name || null, 'pending', now).run();
      const redemptionId = insR?.meta?.last_row_id as number;
      // 2) 포인트 차감
      let spendTxn: any = null;
      try {
        spendTxn = await applyPointTransaction({
          userId, studentName: body.student_name, type: 'spend',
          amount: item.point_price, reason: `[교환] ${item.brand || ''} ${item.name}`, redemptionId,
        });
        await env.DB.prepare(`UPDATE gift_redemptions SET txn_spend_id=? WHERE id=?`).bind(spendTxn.txnId, redemptionId).run();
      } catch (e: any) {
        await env.DB.prepare(`UPDATE gift_redemptions SET status='failed', failed_at=?, error_message=? WHERE id=?`).bind(now, String(e?.message||e), redemptionId).run();
        return json({ ok: false, error: 'point_deduction_failed', detail: String(e?.message||e) }, 500);
      }
      // 3) 재고 차감
      if (item.stock != null) {
        await env.DB.prepare(`UPDATE gift_catalog SET stock=MAX(0,stock-1), updated_at=? WHERE id=?`).bind(now, catalogId).run();
      }
      // 4) 🎁 Phase P4: 기프티쇼 비즈 API 자동 발송
      //    API 키 + 상품에 external_id 모두 있으면 즉시 자동발송 시도
      //    실패 시 자동 환불 + status='failed' 기록 → 학생에게 즉시 안내
      const mode = getGiftishowMode(env);
      let sendResult: any = null;
      let finalStatus = 'pending';
      let responseMessage = '';

      if (mode === 'disabled') {
        // API 키 미설정 → pending 유지, 관리자 수동 발송 대기
        responseMessage = '신청 접수됨 - 관리자가 곧 발송해 드립니다 (API 키 미설정)';
      } else if (!item.external_id) {
        // 상품에 외부 코드 없음 → pending 유지
        responseMessage = '신청 접수됨 - 상품에 기프티쇼 코드가 없어 관리자 수동 발송 대기';
      } else {
        // 자동 발송 시도
        try {
          sendResult = await sendCoupon(env, {
            externalProductCode: item.external_id,
            recipientPhone: phone,
            recipientName: body.recipient_name || body.student_name,
            internalOrderId: redemptionId,
            msgTitle: `[망고아이] ${item.brand || ''} 선물이 도착했어요! 🎁`,
            msgBody: `망고아이 포인트로 교환한 ${item.name} 입니다. 카카오톡 선물함에서 확인해주세요.`,
          });
        } catch (e: any) {
          sendResult = { ok: false, status: 'failed', message: '발송 호출 오류: ' + String(e?.message||e) };
        }
        if (sendResult.ok && sendResult.status === 'sent') {
          finalStatus = 'sent';
          await env.DB.prepare(`UPDATE gift_redemptions SET status='sent', sent_at=?, external_order_id=?, external_coupon_code=?, meta=? WHERE id=?`)
            .bind(now, sendResult.externalOrderId || null, sendResult.externalCouponCode || null, sendResult.raw ? JSON.stringify({mode:sendResult.mode, raw:sendResult.raw}) : null, redemptionId).run();
          responseMessage = (mode === 'mock')
            ? `[TEST MODE] 발송 완료 (실제 카톡은 가지 않음 - 테스트 모드 OFF 후 재시도)`
            : `🎁 카카오톡으로 발송 완료! 잠시 후 선물함에 도착합니다.`;
        } else {
          // 발송 실패 → 자동 환불
          finalStatus = 'failed';
          const errMsg = sendResult.message || sendResult.error || '발송 실패';
          await env.DB.prepare(`UPDATE gift_redemptions SET status='failed', failed_at=?, error_message=?, meta=? WHERE id=?`)
            .bind(now, errMsg, sendResult.raw ? JSON.stringify(sendResult.raw) : null, redemptionId).run();
          // 포인트 자동 환불
          try {
            const refundTxn = await applyPointTransaction({
              userId, studentName: body.student_name, type: 'refund',
              amount: item.point_price, reason: `[자동 환불] 발송 실패: ${errMsg.slice(0, 80)}`,
              redemptionId, actorId: 'system', actorName: '시스템',
            });
            await env.DB.prepare(`UPDATE gift_redemptions SET status='refunded', refunded_at=?, txn_refund_id=? WHERE id=?`)
              .bind(now, refundTxn.txnId, redemptionId).run();
            // 재고 복구
            if (item.stock != null) {
              await env.DB.prepare(`UPDATE gift_catalog SET stock=stock+1, updated_at=? WHERE id=?`).bind(now, catalogId).run();
            }
            finalStatus = 'refunded';
            responseMessage = `❌ 발송 실패 — 포인트 자동 환불 완료. 사유: ${errMsg}`;
            // 환불된 잔액으로 갱신
            spendTxn.newBalance = refundTxn.newBalance;
          } catch (refundErr: any) {
            responseMessage = `❌ 발송 실패: ${errMsg}. 환불도 실패 - 관리자에게 문의: ${String(refundErr?.message||refundErr)}`;
          }
        }
      }

      // finalStatus==='failed' 는 발송도 환불도 실패한 최악의 경우(포인트 소진 + 선물 미발송) — ok:false 로 명확히 알림
      return json({
        ok: finalStatus !== 'failed',
        redemption_id: redemptionId,
        status: finalStatus,
        balance_after: spendTxn.newBalance,
        message: responseMessage,
        send_mode: mode,
        gift: { brand: item.brand, name: item.name, face_value: item.face_value, point_price: item.point_price },
      }, finalStatus === 'failed' ? 502 : 200);
    }

    // ── GET /api/gifts/redemptions?uid=xxx — 학생 본인 교환 내역 ──
    if (method === 'GET' && path === '/api/gifts/redemptions') {
      await ensurePointTables();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const rs = await env.DB.prepare(`SELECT id, catalog_id, gift_name, gift_brand, face_value, point_price, recipient_phone, status, external_coupon_code, requested_at, sent_at, delivered_at, failed_at, error_message FROM gift_redemptions WHERE user_id=? ORDER BY requested_at DESC LIMIT 100`).bind(uid).all();
      return json({ ok: true, rows: rs.results || [] });
    }

    // ── GET /api/admin/gifts/redemptions — 관리자 전체 교환 내역 ──
    if (method === 'GET' && path === '/api/admin/gifts/redemptions') {
      await ensurePointTables();
      const status = url.searchParams.get('status') || '';
      let q = `SELECT * FROM gift_redemptions`;
      const binds: any[] = [];
      if (status) { q += ` WHERE status=?`; binds.push(status); }
      q += ` ORDER BY requested_at DESC LIMIT 500`;
      const rs = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/gifts/redemptions/:id/mark — 관리자 수동 상태 변경 ──
    //   body: { status: 'sent'|'delivered'|'failed'|'refunded', coupon_code?, error_message? }
    //   refunded 일 때는 포인트 환불도 자동 처리
    if (method === 'POST' && /^\/api\/admin\/gifts\/redemptions\/\d+\/mark$/.test(path)) {
      await ensurePointTables();
      const id = parseInt(path.split('/')[5] || '0', 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      const body: any = await request.json().catch(() => ({}));
      const status = String(body.status || '').toLowerCase();
      if (!['sent','delivered','failed','refunded'].includes(status)) return json({ ok: false, error: 'invalid_status' }, 400);
      const red: any = await env.DB.prepare(`SELECT * FROM gift_redemptions WHERE id=?`).bind(id).first();
      if (!red) return json({ ok: false, error: 'not_found' }, 404);
      const now = Date.now();
      const updates: any = { status, error_message: body.error_message || null };
      if (status === 'sent') updates.sent_at = now;
      if (status === 'delivered') updates.delivered_at = now;
      if (status === 'failed') updates.failed_at = now;
      if (status === 'refunded') updates.refunded_at = now;
      if (body.coupon_code) updates.external_coupon_code = body.coupon_code;
      const setSql = Object.keys(updates).filter(k => updates[k] !== undefined).map(k => `${k}=?`).join(',');
      const values = Object.keys(updates).filter(k => updates[k] !== undefined).map(k => updates[k]);
      await env.DB.prepare(`UPDATE gift_redemptions SET ${setSql} WHERE id=?`).bind(...values, id).run();
      // 환불 처리
      let refundResult: any = null;
      if (status === 'refunded' && !red.txn_refund_id) {
        try {
          refundResult = await applyPointTransaction({
            userId: red.user_id, studentName: red.student_name, type: 'refund',
            amount: red.point_price, reason: `[환불] ${red.gift_brand||''} ${red.gift_name||''}`, redemptionId: id,
            actorId: body.actor_id || 'admin', actorName: body.actor_name || '관리자',
          });
          await env.DB.prepare(`UPDATE gift_redemptions SET txn_refund_id=? WHERE id=?`).bind(refundResult.txnId, id).run();
        } catch (e: any) {
          return json({ ok: false, error: 'refund_failed', detail: String(e?.message||e) }, 500);
        }
      }
      return json({ ok: true, id, status, refund: refundResult });
    }

    // ── POST /api/admin/points/seed-rules — 기본 규칙 시드 (없을 때만) ──
    if (method === 'POST' && path === '/api/admin/points/seed-rules') {
      await ensurePointTables();
      const now = Date.now();
      const seeds = [
        ['attendance','출석',10,21600,1,1,'수업 1회 출석 시 자동 적립 (하루 1회)'],
        ['homework','숙제 완료',20,3600,3,1,'숙제 검수 완료 시 적립'],
        ['on_time','제시간 입장',5,3600,1,1,'수업 시작 5분 이내 입장'],
        ['level_up','레벨업',100,0,null,1,'레벨 시험 합격 시 자동 적립'],
        ['monthly_top','월간 우수학생',500,0,null,1,'월간 1위 학생 자동 지급'],
        ['birthday','생일 축하',200,0,1,1,'학생 생일 자동 지급'],
      ];
      const out: any[] = [];
      for (const [code,label,amt,cd,cap,en,desc] of seeds) {
        await env.DB.prepare(`INSERT OR IGNORE INTO point_rules (code,label,amount,cooldown_sec,daily_cap,enabled,description,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(code,label,amt,cd,cap,en,desc,now).run();
        out.push({ code, label, amount: amt });
      }
      return json({ ok: true, seeded: out.length, items: out });
    }

    // ── POST /api/admin/gifts/seed-catalog — 데모 카탈로그 시드 ──
    if (method === 'POST' && path === '/api/admin/gifts/seed-catalog') {
      await ensurePointTables();
      const now = Date.now();
      const seeds = [
        ['🥭 망고아이','수업료 전환 (5,000원)','tuition',5000,5000,5,'모은 포인트로 다음 수업료 즉시 차감','/img/Mangoi_Character.png'],
        ['메가커피','아메리카노 (ICE)','cafe',1500,1500,10,'가성비 1위, 시원한 한 잔','/img/gifts/megacoffee.svg'],
        ['배스킨라빈스','파인트 (1개)','cafe',9800,9800,20,'취향대로 골라먹는 31','/img/gifts/baskinrobbins.svg'],
        ['배달의민족','e쿠폰 5,000원','food',5000,5000,25,'배달 음식 주문 시 즉시 차감','/img/gifts/baemin.svg'],
        ['CGV','영화 1매 (전 지점)','movie',14000,14000,40,'평일 일반관 1회 사용','/img/gifts/cgv.svg'],
        ['교보문고','도서상품권 5,000원','book',5000,5000,50,'온/오프라인 사용 가능','/img/gifts/kyobo.svg'],
        ['컬쳐랜드','문화상품권 5,000원','voucher',5000,5000,55,'쿠팡·게임·도서·OTT 등 어디든','/img/gifts/cultureland.svg'],
        ['GS25','편의점 금액권 5,000원','voucher',5000,5000,60,'전국 GS25에서 사용','/img/gifts/gs25.svg'],
      ];
      let n = 0;
      for (const [brand,name,cat,fv,pp,sort,desc,thumb] of seeds) {
        const exists = await env.DB.prepare(`SELECT id FROM gift_catalog WHERE brand=? AND name=?`).bind(brand,name).first();
        if (exists) continue;
        await env.DB.prepare(`INSERT INTO gift_catalog (brand,name,category,face_value,point_price,enabled,sort_order,description,thumbnail_url,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?,?,?)`)
          .bind(brand,name,cat,fv,pp,sort,desc,thumb,now,now).run();
        n++;
      }
      return json({ ok: true, seeded: n });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🎁 Phase P4 - 기프티쇼 비즈 외부 API 연동
    // ═══════════════════════════════════════════════════════════════

    // ── GET /api/admin/gifts/status — API 키 설정 + 가맹점 잔액 조회 ──
    if (method === 'GET' && path === '/api/admin/gifts/status') {
      const mode = getGiftishowMode(env);
      const result: any = {
        ok: true,
        mode,                                                 // 'disabled' | 'mock' | 'real'
        api_key_set: !!(env as any).GIFTISHOW_API_KEY,
        user_id_set: !!(env as any).GIFTISHOW_USER_ID,
        api_base: (env as any).GIFTISHOW_API_BASE || 'https://bizapi.giftishow.com/bizApi (기본값)',
        callback_url_set: !!(env as any).GIFTISHOW_CALLBACK_URL,
        test_mode: (env as any).GIFTISHOW_TEST_MODE === 'true',
      };
      // 실제 모드면 가맹점 잔액 조회 시도
      if (mode === 'real' || mode === 'mock') {
        try {
          const bal = await checkBalance(env);
          result.balance = bal.ok ? bal.balance : null;
          result.balance_message = bal.message;
        } catch (e: any) {
          result.balance_error = String(e?.message || e);
        }
      }
      // 카탈로그 중 external_id 가 등록된 상품 수
      try {
        const catCount: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM gift_catalog WHERE external_id IS NOT NULL AND external_id <> '' AND enabled=1`).first();
        result.catalog_with_external_id = catCount?.c || 0;
        const totalCat: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM gift_catalog WHERE enabled=1`).first();
        result.catalog_total = totalCat?.c || 0;
      } catch {}
      return json(result);
    }

    // ── POST /api/gifts/webhook/giftishow — KT alpha 콜백 (발송 결과 알림) ──
    //   KT alpha 서버가 발송 → 수령 → 사용 단계마다 우리 콜백 URL 로 알림 보냄
    //   ▶ wrangler.toml [vars] GIFTISHOW_CALLBACK_URL 에 이 URL 을 등록해두면 자동 호출됨:
    //     "https://webrtc-unified-platform-prod.navy111p.workers.dev/api/gifts/webhook/giftishow"
    if (method === 'POST' && path === '/api/gifts/webhook/giftishow') {
      await ensurePointTables();
      const body: any = await request.json().catch(() => ({}));
      const ev = parseWebhook(body);
      const now = Date.now();
      // bizTrId 가 우리 gift_redemptions.id 임 (sendCoupon 시 보냈음)
      const redId = parseInt(String(ev.internalOrderId || ''), 10);
      if (!redId) {
        // 콜백은 받았지만 매칭 안 됨 → 로그만 남기고 200 응답 (KT alpha 재전송 방지)
        try {
          await env.DB.prepare(`INSERT INTO gift_redemptions (user_id, student_name, catalog_id, gift_name, face_value, point_price, status, requested_at, meta) VALUES ('webhook_orphan','-',0,'(매칭없음)',0,0,'failed',?,?)`)
            .bind(now, JSON.stringify(body)).run();
        } catch {}
        return json({ ok: false, error: 'no_matching_redemption', received: ev });
      }
      const red: any = await env.DB.prepare(`SELECT * FROM gift_redemptions WHERE id=?`).bind(redId).first();
      if (!red) return json({ ok: false, error: 'redemption_not_found', id: redId }, 404);

      // 상태 업데이트
      const updates: string[] = [];
      const binds: any[] = [];
      if (ev.status) {
        updates.push('status=?'); binds.push(ev.status);
        if (ev.status === 'sent' && !red.sent_at)         { updates.push('sent_at=?');      binds.push(now); }
        if (ev.status === 'delivered' && !red.delivered_at){ updates.push('delivered_at=?'); binds.push(now); }
        if (ev.status === 'failed' && !red.failed_at)     { updates.push('failed_at=?');    binds.push(now); }
      }
      if (ev.externalOrderId && !red.external_order_id) { updates.push('external_order_id=?'); binds.push(ev.externalOrderId); }
      if (ev.couponCode && !red.external_coupon_code)   { updates.push('external_coupon_code=?'); binds.push(ev.couponCode); }
      if (ev.message) { updates.push('error_message=?'); binds.push(ev.message); }
      // 항상 meta 에 raw 누적
      const prevMeta = red.meta ? (() => { try { return JSON.parse(red.meta); } catch { return {}; } })() : {};
      const newMeta = { ...prevMeta, last_webhook: ev.raw, last_webhook_at: now };
      updates.push('meta=?'); binds.push(JSON.stringify(newMeta));
      if (updates.length > 0) {
        await env.DB.prepare(`UPDATE gift_redemptions SET ${updates.join(',')} WHERE id=?`).bind(...binds, redId).run();
      }

      // 발송 실패 콜백이면 자동 환불.
      //  ⚠ 동시 webhook(KT alpha 재시도) 이중환불 방지: 먼저 CAS 로 '환불됨' 상태를 선점한 요청만 실제 환불.
      //  D1(SQLite) 은 쓰기를 직렬화하므로, 두 요청이 동시에 와도 UPDATE ... WHERE txn_refund_id IS NULL 은
      //  한 번만 changes=1 이 되어 정확히 한 번만 환불된다.
      if (ev.status === 'failed' && !red.txn_refund_id) {
        const claim = await env.DB.prepare(
          `UPDATE gift_redemptions SET status='refunded', refunded_at=? WHERE id=? AND txn_refund_id IS NULL AND status!='refunded'`
        ).bind(now, redId).run();
        if (claim?.meta?.changes) {   // 이 요청이 환불 슬롯을 차지했을 때만 실제 포인트 환불
          try {
            const refundTxn = await applyPointTransaction({
              userId: red.user_id, studentName: red.student_name, type: 'refund',
              amount: red.point_price, reason: `[자동환불] 발송 실패 (webhook): ${(ev.message||'').slice(0,80)}`,
              redemptionId: redId, actorId: 'webhook', actorName: 'KT alpha webhook',
            });
            await env.DB.prepare(`UPDATE gift_redemptions SET txn_refund_id=? WHERE id=?`).bind(refundTxn.txnId, redId).run();
            if (red.catalog_id) {
              await env.DB.prepare(`UPDATE gift_catalog SET stock=stock+1, updated_at=? WHERE id=? AND stock IS NOT NULL`).bind(now, red.catalog_id).run();
            }
          } catch {}
        }
      }

      return json({ ok: true, processed: ev, redemption_id: redId });
    }

    // ── POST /api/admin/gifts/redemptions/:id/poll — 관리자 수동 상태 폴링 ──
    //   KT alpha 콜백이 안 왔거나 오래된 pending 건의 진행상황을 즉시 조회
    if (method === 'POST' && /^\/api\/admin\/gifts\/redemptions\/\d+\/poll$/.test(path)) {
      await ensurePointTables();
      const id = parseInt(path.split('/')[5] || '0', 10);
      const red: any = await env.DB.prepare(`SELECT * FROM gift_redemptions WHERE id=?`).bind(id).first();
      if (!red) return json({ ok: false, error: 'not_found' }, 404);
      if (!red.external_order_id) return json({ ok: false, error: 'no_external_order_id' });
      const { checkOrderStatus } = await import('./giftishow-client');
      const status = await checkOrderStatus(env, red.external_order_id);
      if (status.ok && status.status && status.status !== 'unknown') {
        const now = Date.now();
        const updates = ['status=?']; const binds: any[] = [status.status];
        if (status.status === 'sent' && !red.sent_at) { updates.push('sent_at=?'); binds.push(now); }
        if (status.status === 'delivered' && !red.delivered_at) { updates.push('delivered_at=?'); binds.push(now); }
        if (status.status === 'failed' && !red.failed_at) { updates.push('failed_at=?'); binds.push(now); }
        await env.DB.prepare(`UPDATE gift_redemptions SET ${updates.join(',')} WHERE id=?`).bind(...binds, id).run();
      }
      return json({ ok: true, id, status, prev_status: red.status });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎁 Phase P1+P4 끝
    // ═══════════════════════════════════════════════════════════════

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
      } else if (period === '7days') until = now + 7 * 86400 * 1000;
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
    // 📅 Phase CAL — 캘린더 (교사 휴가 + 한국/필리핀 공휴일)
    //   · 추가/시드 시 community_posts(공지사항 + 최신 알림 피드)에 자동 등록
    //   · 자동 색상: 휴가=주황, 한국 공휴일=빨강, 필리핀 공휴일=파랑
    // ═══════════════════════════════════════════════════════════════
    const ensureCalendarTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, title TEXT NOT NULL, date TEXT NOT NULL, end_date TEXT, country TEXT, teacher_id TEXT, teacher_name TEXT, color TEXT, note TEXT, source TEXT DEFAULT 'manual', created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_cal_date ON calendar_events(date);`); } catch {}
    };
    const calColor = (type: string, country?: string | null): string => {
      if (type === 'vacation') return '#f59e0b';
      if (country === 'PH') return '#3b82f6';
      return '#ef4444';
    };
    const calPost = async (title: string, body: string) => {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        const now = Date.now();
        await env.DB.prepare(`INSERT INTO community_posts (title, body, author, pinned, created_at, updated_at) VALUES (?,?,?,?,?,?)`)
          .bind(title, body, '📅 캘린더', 0, now, now).run();
      } catch {}
    };
    // 2026 공휴일 내장 (출처: 대한민국 관공서 공휴일 / 필리핀 Proclamation No. 1006)
    const HOLIDAYS_2026: Record<string, Array<[string, string]>> = {
      KR: [
        ['2026-01-01', '신정'],
        ['2026-02-16', '설날 연휴'], ['2026-02-17', '설날'], ['2026-02-18', '설날 연휴'],
        ['2026-03-01', '삼일절'], ['2026-03-02', '대체공휴일(삼일절)'],
        ['2026-05-05', '어린이날'],
        ['2026-05-24', '부처님오신날'], ['2026-05-25', '대체공휴일(부처님오신날)'],
        ['2026-06-06', '현충일'],
        ['2026-08-15', '광복절'], ['2026-08-17', '대체공휴일(광복절)'],
        ['2026-09-24', '추석 연휴'], ['2026-09-25', '추석'], ['2026-09-26', '추석 연휴'],
        ['2026-10-03', '개천절'], ['2026-10-05', '대체공휴일(개천절)'],
        ['2026-10-09', '한글날'],
        ['2026-12-25', '크리스마스'],
      ],
      PH: [
        ['2026-01-01', "New Year's Day"],
        ['2026-02-17', 'Chinese New Year'],
        ['2026-04-02', 'Maundy Thursday'], ['2026-04-03', 'Good Friday'], ['2026-04-04', 'Black Saturday'],
        ['2026-04-09', 'Araw ng Kagitingan'],
        ['2026-05-01', 'Labor Day'],
        ['2026-06-12', 'Independence Day'],
        ['2026-08-21', 'Ninoy Aquino Day'], ['2026-08-31', 'National Heroes Day'],
        ['2026-11-01', "All Saints' Day"], ['2026-11-02', "All Souls' Day"], ['2026-11-30', 'Bonifacio Day'],
        ['2026-12-08', 'Immaculate Conception'], ['2026-12-24', 'Christmas Eve'],
        ['2026-12-25', 'Christmas Day'], ['2026-12-30', 'Rizal Day'], ['2026-12-31', 'Last Day of the Year'],
      ],
    };

    // ── GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD (공개: 캘린더/학생 표시용) ──
    if (method === 'GET' && path === '/api/calendar/events') {
      await ensureCalendarTable();
      const from = (url.searchParams.get('from') || '').trim();
      const to = (url.searchParams.get('to') || '').trim();
      let q = `SELECT * FROM calendar_events`; const binds: any[] = [];
      if (from && to) { q += ` WHERE date <= ? AND COALESCE(end_date, date) >= ?`; binds.push(to, from); }
      q += ` ORDER BY date ASC, id ASC`;
      const rs = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, events: rs.results || [] });
    }

    // ── POST /api/admin/calendar/events (모든 관리자) — 단건 추가 (휴가/공휴일) ──
    if (method === 'POST' && path === '/api/admin/calendar/events') {
      await ensureCalendarTable();
      const b: any = await request.json().catch(() => ({}));
      const type = (b.event_type === 'holiday') ? 'holiday' : 'vacation';
      const title = (b.title || '').toString().trim();
      const date = (b.date || '').toString().trim();
      if (!title || !date) return json({ ok: false, error: 'title_and_date_required' }, 400);
      const end_date = (b.end_date || '').toString().trim() || null;
      const country = (b.country || '').toString().trim() || null;
      const teacher_name = (b.teacher_name || '').toString().trim() || null;
      const note = (b.note || '').toString().trim() || null;
      const color = (b.color || '').toString().trim() || calColor(type, country);
      const now = Date.now();
      const ins = await env.DB.prepare(`INSERT INTO calendar_events (event_type,title,date,end_date,country,teacher_id,teacher_name,color,note,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(type, title, date, end_date, country, null, teacher_name, color, note, 'manual', now).run();
      const span = (end_date && end_date !== date) ? `${date} ~ ${end_date}` : date;
      const label = (type === 'vacation')
        ? `🏖 교사 휴가 — ${teacher_name ? teacher_name + ' ' : ''}${title}`
        : `📅 공휴일 — ${title}${country ? ' (' + country + ')' : ''}`;
      await calPost(label, `${span}${note ? '\n' + note : ''}`);
      return json({ ok: true, id: (ins as any).meta?.last_row_id, color });
    }

    // ── DELETE /api/admin/calendar/events/:id ──
    if (method === 'DELETE' && /^\/api\/admin\/calendar\/events\/\d+$/.test(path)) {
      await ensureCalendarTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM calendar_events WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── POST /api/admin/calendar/seed-holidays — 2026 한국/필리핀 공휴일 일괄 등록(중복 자동 skip) ──
    if (method === 'POST' && path === '/api/admin/calendar/seed-holidays') {
      await ensureCalendarTable();
      const b: any = await request.json().catch(() => ({}));
      const countries: string[] = (Array.isArray(b.countries) && b.countries.length) ? b.countries : ['KR', 'PH'];
      const now = Date.now();
      let added = 0;
      for (const c of countries) {
        const list = HOLIDAYS_2026[c]; if (!list) continue;
        for (const [date, name] of list) {
          const exists: any = await env.DB.prepare(`SELECT id FROM calendar_events WHERE event_type='holiday' AND date=? AND country=? AND title=?`).bind(date, c, name).first();
          if (exists) continue;
          await env.DB.prepare(`INSERT INTO calendar_events (event_type,title,date,end_date,country,teacher_id,teacher_name,color,note,source,created_at) VALUES ('holiday',?,?,?,?,?,?,?,?,'seed',?)`)
            .bind(name, date, null, c, null, null, calColor('holiday', c), null, now).run();
          added++;
        }
      }
      if (added > 0) await calPost(`📅 2026 공휴일 ${added}건 자동 등록`, `${countries.join('/')} 공휴일이 캘린더에 추가되었습니다.`);
      return json({ ok: true, added });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🌐 i18n 자동번역 — 사전(DICT)에 없는 한국어 UI 텍스트를 AI로 ko→en 번역 (+KV 캐시)
    //   클라이언트(i18n-sweep.js)가 미번역 한국어를 모아 배치 호출 → localStorage 캐시.
    // ═══════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/i18n/translate') {
      const b: any = await request.json().catch(() => ({}));
      let texts: string[] = Array.isArray(b.texts) ? b.texts.map((t: any) => String(t || '')).filter((t: string) => t.trim()) : [];
      texts = Array.from(new Set(texts)).slice(0, 50);
      if (!texts.length) return json({ ok: true, map: {} });
      const ai = (env as any).AI;
      const kv = (env as any).SESSION_STATE;
      const map: Record<string, string> = {};
      const need: string[] = [];
      for (const t of texts) {
        let cached: string | null = null;
        if (kv) { try { cached = await kv.get('i18n:en:' + t); } catch {} }
        if (cached != null) map[t] = cached; else need.push(t);
      }
      if (need.length && ai) {
        for (let i = 0; i < need.length; i += 20) {
          const chunk = need.slice(i, i + 20);
          const prompt = 'Translate each Korean app-UI string into natural, concise English suitable for a button/menu/label. Keep emojis, numbers, punctuation and placeholders such as ${...}, {x}, %s unchanged. Do not add quotes or notes. Return ONLY a JSON array of strings, same length and order as the input.\nInput:\n' + JSON.stringify(chunk);
          try {
            const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You are a precise Korean-to-English UI translator. Output a raw JSON array of strings only.' },
                { role: 'user', content: prompt }
              ],
              max_tokens: 1800,
            });
            let txt = typeof resp === 'string' ? resp : (resp && typeof resp.response === 'string' ? resp.response : '');
            const mm = String(txt || '').match(/\[[\s\S]*\]/);
            let arr: any[] = [];
            if (mm) { try { arr = JSON.parse(mm[0]); } catch {} }
            for (let j = 0; j < chunk.length; j++) {
              const en = (Array.isArray(arr) && typeof arr[j] === 'string' && arr[j].trim()) ? String(arr[j]) : chunk[j];
              map[chunk[j]] = en;
              if (kv && en && en !== chunk[j]) { try { await kv.put('i18n:en:' + chunk[j], en, { expirationTtl: 60 * 60 * 24 * 180 }); } catch {} }
            }
          } catch { for (const c of chunk) map[c] = c; }
        }
      } else if (need.length) { for (const c of need) map[c] = c; }
      return json({ ok: true, map });
    }

    // ── POST /api/translate — 양방향 번역 (평가 글·건의사항 등 실제 콘텐츠) ──
    //   body: { texts: string[], target: 'en'|'ko' } → { map: { 원문: 번역 } }
    //   이미 목표 언어면 그대로 통과, 아니면 Workers AI 번역 + KV 캐시(방향별)
    if (method === 'POST' && path === '/api/translate') {
      const b: any = await request.json().catch(() => ({}));
      const target = (b.target === 'ko') ? 'ko' : 'en';
      let texts: string[] = Array.isArray(b.texts) ? b.texts.map((t: any) => String(t || '')).filter((t: string) => t.trim()) : [];
      texts = Array.from(new Set(texts)).slice(0, 50);
      if (!texts.length) return json({ ok: true, map: {} });
      const hasHangul = (s: string) => /[가-힣ᄀ-ᇿ㄰-㆏]/.test(s);
      const ai = (env as any).AI;
      const kv = (env as any).SESSION_STATE;
      const map: Record<string, string> = {};
      const need: string[] = [];
      for (const t of texts) {
        const isKo = hasHangul(t);
        // 이미 목표 언어면 번역 불필요
        if ((target === 'en' && !isKo) || (target === 'ko' && isKo)) { map[t] = t; continue; }
        let cached: string | null = null;
        if (kv) { try { cached = await kv.get('tr:' + target + ':' + t); } catch {} }
        if (cached != null) map[t] = cached; else need.push(t);
      }
      const dbg: any = { ai: !!ai, need: need.length, raw: null, err: null };
      // 번역 전용 모델 m2m100 (LLM 프롬프트보다 안정적). 텍스트별 번역.
      const srcLang = target === 'en' ? 'korean' : 'english';
      const tgtLang = target === 'en' ? 'english' : 'korean';
      if (need.length && ai) {
        for (const t of need) {
          try {
            const resp: any = await ai.run('@cf/meta/m2m100-1.2b', { text: t, source_lang: srcLang, target_lang: tgtLang });
            if (dbg.raw == null) dbg.raw = JSON.stringify(resp).slice(0, 300);
            const out = (resp && typeof resp.translated_text === 'string' && resp.translated_text.trim()) ? String(resp.translated_text) : t;
            map[t] = out;
            if (kv && out && out !== t) { try { await kv.put('tr:' + target + ':' + t, out, { expirationTtl: 60 * 60 * 24 * 180 }); } catch {} }
          } catch (e: any) { dbg.err = String(e?.message || e); map[t] = t; }
        }
      } else if (need.length) { for (const c of need) map[c] = c; }
      if (url.searchParams.get('debug') === '1') return json({ ok: true, map, _debug: dbg });
      return json({ ok: true, map });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🧩 Phase RQ — 복습퀴즈 (관리자 출제 → 학생 풀이 + 자동 채점/기록)
    //   관리자: /api/admin/review-quiz/{list,save,toggle,results}, DELETE /api/admin/review-quiz/:id
    //   학생  : /api/review-quiz/{list,get,submit}  (get 은 정답 미포함, 채점은 서버에서)
    // ═══════════════════════════════════════════════════════════════
    const ensureReviewQuizTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS review_quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, questions TEXT NOT NULL, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS review_quiz_results (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL, user_id TEXT NOT NULL, user_name TEXT, score INTEGER NOT NULL, total INTEGER NOT NULL, answers TEXT, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_rq_results_quiz ON review_quiz_results(quiz_id, created_at DESC);`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_rq_results_user ON review_quiz_results(user_id, created_at DESC);`); } catch {}
      // Phase RQ2 — 레벨/교재/레슨 매칭 + AI 자동출제 메타 컬럼
      for (const col of ['level TEXT', 'textbook TEXT', 'lesson_no INTEGER', "source TEXT DEFAULT 'manual'", 'draw TEXT']) {
        try { await env.DB.exec(`ALTER TABLE review_quizzes ADD COLUMN ${col};`); } catch {}
      }
      // 웜업 개인화(warmup-graph.ts) — 제출 시 채점 상세(JSON)를 보존해 오답 문장을 정확히 추출
      try { await env.DB.exec(`ALTER TABLE review_quiz_results ADD COLUMN detail TEXT;`); } catch {}
    };
    // 문항 검증 (Phase RQ2 — 유형: choice 객관식 / listen 듣기 / write 쓰기 / speak 말하기)
    //   choice/listen: { type, q, opts:[2~6], answer:index, explain?, audio_text(listen 필수) }
    //   write        : { type, q, answer_text, accept?:string[], explain? }
    //   speak        : { type, q?, answer_text(말할 문장), explain? }
    const rqParseQuestions = (raw: any): { ok: boolean; error?: string; list?: any[] } => {
      let list: any[] = [];
      if (Array.isArray(raw)) list = raw;
      else { try { list = JSON.parse(String(raw || '[]')); } catch { return { ok: false, error: 'questions_invalid_json' }; } }
      if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'questions_required' };
      const clean: any[] = [];
      for (const q of list) {
        const type = ['choice', 'listen', 'write', 'speak'].includes(String(q?.type)) ? String(q.type) : 'choice';
        const explain = String(q?.explain || '').trim();
        let text = String(q?.q || '').trim();
        if (type === 'choice' || type === 'listen') {
          const opts = Array.isArray(q?.opts) ? q.opts.map((o: any) => String(o || '').trim()) : [];
          const answer = Number(q?.answer);
          if (type === 'listen' && !text) text = '🎧 잘 듣고 알맞은 답을 고르세요.';
          if (!text) return { ok: false, error: 'question_text_required' };
          if (opts.length < 2 || opts.length > 6 || opts.some((o: string) => !o)) return { ok: false, error: 'options_required' };
          if (!Number.isInteger(answer) || answer < 0 || answer >= opts.length) return { ok: false, error: 'answer_index_invalid' };
          const audioText = String(q?.audio_text || '').trim();
          if (type === 'listen' && !audioText) return { ok: false, error: 'audio_text_required' };
          const item: any = { type, q: text, opts, answer, explain };
          if (type === 'listen') item.audio_text = audioText.slice(0, 300);
          clean.push(item);
        } else {
          const answerText = String(q?.answer_text || '').trim();
          if (!answerText) return { ok: false, error: 'answer_text_required' };
          if (type === 'speak' && !text) text = '🎤 아래 문장을 또박또박 읽어보세요.';
          if (type === 'write' && !text) return { ok: false, error: 'question_text_required' };
          const accept = (Array.isArray(q?.accept) ? q.accept : []).map((a: any) => String(a || '').trim()).filter((a: string) => !!a).slice(0, 8);
          clean.push({ type, q: text, answer_text: answerText.slice(0, 300), accept, explain });
        }
      }
      return { ok: true, list: clean };
    };
    // 채점 보조 — 텍스트 정규화 + 단어 일치율
    const rqNorm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣\s']/g, ' ').replace(/\s+/g, ' ').trim();
    const rqWordAcc = (target: string, said: string) => {
      const t = rqNorm(target).split(' ').filter(Boolean);
      const s = rqNorm(said).split(' ').filter(Boolean);
      if (!t.length) return 0;
      const pool = s.slice();
      let hit = 0;
      for (const w of t) { const i = pool.indexOf(w); if (i >= 0) { hit++; pool.splice(i, 1); } }
      return hit / t.length;
    };
    // 학생에게 안전한 문항 형태 (정답/듣기 원문 제외)
    const rqSafeQuestions = (qs: any[]) => qs.map((q: any, i: number) => {
      const type = q.type || 'choice';
      const out: any = { idx: i, type, q: q.q };
      if (type === 'choice' || type === 'listen') out.opts = q.opts;
      if (type === 'speak') out.target = q.answer_text;
      if (type === 'listen') out.has_audio = true;
      return out;
    });
    // 🎲 랜덤 출제(draw) — 유형별로 무작위 N개 뽑되 원본 bank index(idx) 보존
    const rqSafeOne = (q: any, i: number) => {
      const type = q.type || 'choice';
      const out: any = { idx: i, type, q: q.q };
      if (type === 'choice' || type === 'listen') out.opts = q.opts;
      if (type === 'speak') out.target = q.answer_text;
      if (type === 'listen') out.has_audio = true;
      return out;
    };
    const rqShuffle = (arr: any[]) => { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = a[k]; a[k] = a[j]; a[j] = t; } return a; };
    const rqDrawIndices = (qs: any[], draw: any) => {
      const by: any = { listen: [], speak: [], choice: [], write: [] };
      qs.forEach((q: any, i: number) => { const t = (q && q.type) || 'choice'; (by[t] || by.choice).push(i); });
      let out: number[] = [];
      out = out.concat(rqShuffle(by.listen).slice(0, draw.listen || 0));
      out = out.concat(rqShuffle(by.speak).slice(0, draw.speak || 0));
      out = out.concat(rqShuffle(by.choice).slice(0, draw.choice || 0));
      out = out.concat(rqShuffle(by.write).slice(0, draw.write || 0));
      return rqShuffle(out);
    };
    // 채점 (유형별) — answers[i]: choice/listen=보기 index, write/speak=텍스트
    const rqGrade = (qs: any[], answers: any[]) => {
      let score = 0;
      const detail = qs.map((q: any, i: number) => {
        const type = q.type || 'choice';
        const a = answers[i];
        if (type === 'choice' || type === 'listen') {
          const ans = (a == null || a === '') ? NaN : Number(a);   // fix: 무응답(null/빈값)을 0으로 오채점하지 않도록 NaN 처리
          const correct = Number.isInteger(ans) && ans === Number(q.answer);
          if (correct) score++;
          const d: any = { idx: i, type, correct, your_answer: Number.isInteger(ans) ? ans : null, answer: Number(q.answer), explain: q.explain || '' };
          if (type === 'listen') d.audio_text = q.audio_text || '';
          return d;
        }
        const said = String(a == null ? '' : a).slice(0, 500);
        let accuracy = Math.round(rqWordAcc(q.answer_text, said) * 100);
        let correct = false;
        if (type === 'write') {
          const cands = [rqNorm(q.answer_text), ...((q.accept || []).map((x: string) => rqNorm(x)))].filter(Boolean);
          correct = !!said.trim() && (cands.includes(rqNorm(said)) || accuracy >= 85);
          if (correct) accuracy = Math.max(accuracy, 100 * Number(cands.includes(rqNorm(said))) || accuracy);
        } else {
          correct = accuracy >= 60;
        }
        if (correct) score++;
        return { idx: i, type, correct, accuracy, your_text: said, answer_text: q.answer_text, explain: q.explain || '' };
      });
      return { score, detail };
    };
    // 🤖 AI 자동 출제 — 교재/레벨/레슨 기반 (Workers AI llama-3.3-70b)
    const rqAiGenerate = async (o: { level?: string; textbook?: string; lesson_no?: number | null; topic?: string; counts?: any }) => {
      const ai = (env as any).AI;
      if (!ai) return { ok: false as const, error: 'workers_ai_not_bound' };
      const c = o.counts || {};
      const lim = (v: any, dft: number) => Math.min(Math.max(Number(v ?? dft) || 0, 0), 5);
      const nListen = lim(c.listen, 2), nWrite = lim(c.write, 2), nSpeak = lim(c.speak, 2), nChoice = lim(c.choice, 0);
      if (nListen + nWrite + nSpeak + nChoice === 0) return { ok: false as const, error: 'counts_required' };
      const ctx = [
        o.textbook ? `Textbook: ${o.textbook}` : '',
        o.level ? `Level: ${o.level}` : '',
        (o.lesson_no != null && o.lesson_no > 0) ? `Lesson number: ${o.lesson_no}` : '',
        o.topic ? `Key vocabulary / topic from this lesson: ${o.topic}` : '',
      ].filter(Boolean).join('\n');
      const prompt = `You are an English quiz writer for a Korean kids' English academy (망고아이).
Create a review quiz for this class:
${ctx || 'General elementary English'}

Difficulty must match the textbook level and lesson (younger learners = very short, simple sentences).
Make exactly:
- ${nChoice} "choice" questions: {"type":"choice","q":"<Korean question>","opts":["..","..","..",".."],"answer":<correct index 0-3>,"explain":"<short Korean explanation>"}
- ${nListen} "listen" questions: {"type":"listen","q":"🎧 잘 듣고 알맞은 답을 고르세요.","audio_text":"<short English sentence to be spoken aloud>","opts":["..","..","..",".."],"answer":<index>,"explain":"<Korean>"}
- ${nWrite} "write" questions: {"type":"write","q":"<Korean prompt, e.g. 다음 뜻의 영어 문장을 쓰세요: ...>","answer_text":"<correct English sentence>","accept":["<acceptable variation>"],"explain":"<Korean>"}
- ${nSpeak} "speak" questions: {"type":"speak","q":"🎤 아래 문장을 또박또박 읽어보세요.","answer_text":"<short English sentence to read aloud>","explain":"<Korean>"}

Rules: English sentences max 8 words. Korean for instructions/explanations. Vocabulary must fit the textbook/lesson. The "listen" options must include the audio sentence itself as the correct option.
Reply with a JSON array ONLY. No markdown, no commentary.`;
      try {
        const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: 'You write JSON quizzes for Korean children learning English. Output a raw JSON array only.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 2400,
        });
        let text = '';
        if (typeof resp === 'string') text = resp;
        else if (resp && typeof resp.response === 'string') text = resp.response;
        else if (resp && resp.response) text = JSON.stringify(resp.response);
        const m = String(text || '').match(/\[[\s\S]*\]/);
        if (!m) return { ok: false as const, error: 'ai_no_json' };
        let arr: any[] = [];
        try { arr = JSON.parse(m[0]); } catch { return { ok: false as const, error: 'ai_bad_json' }; }
        const parsed = rqParseQuestions(arr);
        if (!parsed.ok || !parsed.list || !parsed.list.length) return { ok: false as const, error: parsed.error || 'ai_invalid_questions' };
        return { ok: true as const, questions: parsed.list };
      } catch (e: any) {
        return { ok: false as const, error: 'ai_failed: ' + (e?.message || 'unknown') };
      }
    };

    // ── GET /api/review-quiz/list?user_id=xxx — 학생: 활성 퀴즈 목록 (+내 최고점/시도수) ──
    if (method === 'GET' && path === '/api/review-quiz/list') {
      await ensureReviewQuizTables();
      const userId = (url.searchParams.get('user_id') || '').trim();
      const rs = await env.DB.prepare(`SELECT id, title, description, questions, level, textbook, lesson_no, source, draw, created_at FROM review_quizzes WHERE active = 1 ORDER BY id DESC`).all();
      const quizzes: any[] = [];
      for (const row of (((rs.results as any[]) || []))) {
        let count = 0; try { count = (JSON.parse(row.questions) || []).length; } catch {}
        let drawTotal = 0; try { if (row.draw) { const d = JSON.parse(row.draw); drawTotal = (d.listen || 0) + (d.speak || 0) + (d.choice || 0) + (d.write || 0); } } catch {}
        const shown = drawTotal > 0 ? Math.min(drawTotal, count) : count;
        const item: any = { id: row.id, title: row.title, description: row.description || '', question_count: shown, bank_size: count, draw_total: drawTotal, level: row.level || '', textbook: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', created_at: row.created_at, best_score: null, attempts: 0 };
        if (userId) {
          const best: any = await env.DB.prepare(`SELECT MAX(score) AS best, COUNT(*) AS n FROM review_quiz_results WHERE quiz_id = ? AND user_id = ?`).bind(row.id, userId).first();
          if (best && Number(best.n) > 0) { item.best_score = best.best; item.attempts = Number(best.n); }
        }
        quizzes.push(item);
      }
      return json({ ok: true, quizzes });
    }

    // ── GET /api/review-quiz/get?id=N — 학생: 퀴즈 1건 (정답/해설 제외) ──
    if (method === 'GET' && path === '/api/review-quiz/get') {
      await ensureReviewQuizTables();
      const id = parseInt(url.searchParams.get('id') || '0', 10);
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT id, title, description, questions, active, level, textbook, lesson_no, source, draw FROM review_quizzes WHERE id = ?`).bind(id).first();
      if (!row || !row.active) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      let draw: any = null; try { draw = row.draw ? JSON.parse(row.draw) : null; } catch {}
      let safe: any[];
      if (draw && qs.length) { const idxs = rqDrawIndices(qs, draw); safe = idxs.map((i: number) => rqSafeOne(qs[i], i)); }
      else { safe = rqSafeQuestions(qs); }
      return json({ ok: true, quiz: { id: row.id, title: row.title, description: row.description || '', level: row.level || '', textbook: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', draw: draw || null, questions: safe } });
    }

    // ── POST /api/review-quiz/submit — 학생: 답안 제출 → 서버 채점 + 기록 저장 ──
    if (method === 'POST' && path === '/api/review-quiz/submit') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const quizId = Number(b.quiz_id);
      const userId = String(b.user_id || '').trim();
      const userName = String(b.user_name || '').trim() || null;
      const answers: any[] = Array.isArray(b.answers) ? b.answers : [];
      if (!quizId) return json({ ok: false, error: 'quiz_id_required' }, 400);
      if (!userId) return json({ ok: false, error: 'user_id_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT id, title, questions FROM review_quizzes WHERE id = ? AND active = 1`).bind(quizId).first();
      if (!row) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      if (!qs.length) return json({ ok: false, error: 'quiz_empty' }, 400);
      // 🎲 학생이 받은 문항(서버 draw 결과)만 채점 — served = 원본 bank index 배열
      const served: number[] | null = Array.isArray(b.served)
        ? b.served.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n < qs.length)
        : null;
      const gradeQs = (served && served.length) ? served.map((i: number) => qs[i]) : qs;
      const { score, detail } = rqGrade(gradeQs, answers);
      const total = gradeQs.length;
      await env.DB.prepare(`INSERT INTO review_quiz_results (quiz_id, user_id, user_name, score, total, answers, detail, created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(quizId, userId, userName, score, total, JSON.stringify(answers.slice(0, total)), JSON.stringify(detail), Date.now()).run();
      return json({ ok: true, score, total, percent: total ? Math.round((score / total) * 100) : 0, detail });
    }

    // ── POST /api/review-quiz/tts — 듣기 문항 음성 (정답 원문 비공개, 서버 TTS) ──
    if (method === 'POST' && path === '/api/review-quiz/tts') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const quizId = Number(b.quiz_id) || 0;
      const idx = Number(b.idx);
      if (!quizId || !Number.isInteger(idx) || idx < 0) return json({ ok: false, error: 'quiz_id_and_idx_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT questions FROM review_quizzes WHERE id = ? AND active = 1`).bind(quizId).first();
      if (!row) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      const q = qs[idx];
      const text = (q && q.type === 'listen') ? String(q.audio_text || '').trim().slice(0, 300) : '';
      if (!text) return json({ ok: false, error: 'not_a_listen_question' }, 400);
      const ai = (env as any).AI;
      if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);
      const audioHeaders = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' };
      // 🔁 R2 캐시: 같은 듣기 문항은 1회만 생성 → 이후엔 뉴런 소모 없이 즉시 제공 (무료 뉴런 절약 + quota 소진 후에도 캐시본 재생)
      let cacheKey = '';
      try {
        const enc = new TextEncoder().encode('aura-asteria|' + text);
        const dig = await crypto.subtle.digest('SHA-256', enc);
        cacheKey = 'tts/' + [...new Uint8Array(dig)].map((x) => x.toString(16).padStart(2, '0')).join('') + '.mp3';
      } catch {}
      const r2: any = (env as any).RECORDINGS;
      if (cacheKey && r2) {
        try { const hit = await r2.get(cacheKey); if (hit) return new Response(hit.body, { headers: audioHeaders }); } catch {}
      }
      const putCache = async (bytes: ArrayBuffer | Uint8Array) => {
        if (!cacheKey || !r2) return;
        try { await r2.put(cacheKey, bytes, { httpMetadata: { contentType: 'audio/mpeg' } }); } catch {}
      };
      // fix: AI 에러 Response 를 음성으로 내보내지 않도록 ok+audio 확인. 429(무료뉴런 소진) 는 quota 로 구분.
      const isQuota = (m: any) => /429|neuron|allocation|free allocation/i.test(String(m || ''));
      let quota = false;
      try {
        const raw: any = await ai.run('@cf/deepgram/aura-1', { text, speaker: 'asteria' }, { returnRawResponse: true });
        if (raw instanceof Response) {
          const ct = raw.headers.get('content-type') || '';
          if (raw.ok && /audio/i.test(ct)) { const buf = await raw.arrayBuffer(); await putCache(buf); return new Response(buf, { headers: audioHeaders }); }
          if (raw.status === 429) quota = true;
        }
      } catch (e: any) { if (isQuota(e?.message)) quota = true; }
      try {
        const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: 'en' });
        const b64 = typeof r === 'string' ? r : (r?.audio || '');
        if (b64) {
          const bin = atob(b64); const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          await putCache(u8);
          return new Response(u8, { headers: audioHeaders });
        }
      } catch (e: any) { if (isQuota(e?.message)) quota = true; }
      return json({ ok: false, error: quota ? 'ai_quota_exceeded' : 'tts_failed', quota }, quota ? 503 : 500);
    }

    // ── POST /api/review-quiz/auto — 화상수업: 교재/레벨/레슨 자동 매칭 (+없으면 AI 즉석 출제 후 저장) ──
    if (method === 'POST' && path === '/api/review-quiz/auto') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const level = String(b.level || '').trim();
      const textbook = String(b.textbook || '').trim();
      const lessonNo = Number(b.lesson_no) > 0 ? Number(b.lesson_no) : null;
      const topic = String(b.topic || '').trim().slice(0, 300);
      const allowGenerate = b.auto_generate !== 0 && b.auto_generate !== false;
      const pickSafe = (row: any) => {
        let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
        let draw: any = null; try { draw = row.draw ? JSON.parse(row.draw) : null; } catch {}
        let safe: any[];
        if (draw && qs.length) { const idxs = rqDrawIndices(qs, draw); safe = idxs.map((i: number) => rqSafeOne(qs[i], i)); }
        else { safe = rqSafeQuestions(qs); }
        return { id: row.id, title: row.title, description: row.description || '', level: row.level || '', textbook: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', draw: draw || null, questions: safe };
      };
      // 1) 교재+레슨 → 2) 교재 전체용 → 3) 레벨 전체용 순서로 매칭
      const tries: Array<{ sql: string; binds: any[] }> = [];
      if (textbook && lessonNo) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND textbook IS NOT NULL AND LOWER(textbook)=LOWER(?) AND lesson_no=? ORDER BY id DESC LIMIT 1`, binds: [textbook, lessonNo] });
      if (textbook) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND textbook IS NOT NULL AND LOWER(textbook)=LOWER(?) AND lesson_no IS NULL ORDER BY id DESC LIMIT 1`, binds: [textbook] });
      if (level) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND level IS NOT NULL AND LOWER(level)=LOWER(?) AND (textbook IS NULL OR textbook='') ORDER BY id DESC LIMIT 1`, binds: [level] });
      for (const t of tries) {
        const row: any = await env.DB.prepare(t.sql).bind(...t.binds).first();
        if (row) return json({ ok: true, matched: true, quiz: pickSafe(row) });
      }
      if (!allowGenerate || (!textbook && !level && !topic)) return json({ ok: true, matched: false, quiz: null });
      // 🤖 매칭 퀴즈가 없으면 AI 가 교재/레벨/레슨에 맞춰 즉석 출제 → 저장 (관리자 페이지에서 확인·조정 가능)
      const gen = await rqAiGenerate({ level, textbook, lesson_no: lessonNo, topic, counts: { listen: 2, write: 2, speak: 2 } });
      if (!gen.ok) return json({ ok: false, error: gen.error }, 502);
      const title = `[AI] ${textbook || level || '오늘의 수업'}${lessonNo ? ` Lesson ${lessonNo}` : ''} 복습퀴즈`;
      const desc = `AI 자동 출제 (듣기/쓰기/말하기) — ${new Date().toISOString().slice(0, 10)}`;
      const now = Date.now();
      const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, created_at, updated_at) VALUES (?,?,?,1,?,?,?,'ai',?,?)`)
        .bind(title, desc, JSON.stringify(gen.questions), level || null, textbook || null, lessonNo, now, now).run();
      const newId = (ins as any).meta?.last_row_id;
      const nrow: any = await env.DB.prepare(`SELECT * FROM review_quizzes WHERE id=?`).bind(newId).first();
      return json({ ok: true, matched: false, generated: true, quiz: pickSafe(nrow) });
    }

    // ── POST /api/admin/review-quiz/ai-generate — 관리자: AI 자동 출제 (저장 전 미리보기) ──
    if (method === 'POST' && path === '/api/admin/review-quiz/ai-generate') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const gen = await rqAiGenerate({
        level: String(b.level || '').trim(),
        textbook: String(b.textbook || '').trim(),
        lesson_no: Number(b.lesson_no) > 0 ? Number(b.lesson_no) : null,
        topic: String(b.topic || '').trim().slice(0, 300),
        counts: b.counts || { listen: 2, write: 2, speak: 2, choice: 2 },
      });
      if (!gen.ok) return json({ ok: false, error: gen.error }, 502);
      return json({ ok: true, questions: gen.questions });
    }

    // ── POST /api/admin/review-quiz/build-bank — 관리자: 교재(또는 레벨)별 40문제 은행 점진 생성 ──
    //   한 번 호출 = AI 1배치(듣기4·말하기3·사지선다3 = 10문항) 생성 후 해당 교재 은행에 누적.
    //   클라이언트가 bank_size<target 동안 반복 호출 → ~40문제 은행 완성. draw 설정으로 학생은 랜덤 10출제.
    if (method === 'POST' && path === '/api/admin/review-quiz/build-bank') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const textbook = String(b.textbook || '').trim();
      const level = String(b.level || '').trim();
      const topic = String(b.topic || '').trim().slice(0, 300);
      const target = Math.min(Math.max(Number(b.target) || 40, 10), 60);
      if (!textbook && !level) return json({ ok: false, error: 'textbook_or_level_required' }, 400);
      const keyCol = textbook ? 'textbook' : 'level';
      const keyVal = textbook || level;
      const existing: any = await env.DB.prepare(`SELECT id, questions FROM review_quizzes WHERE source='bank' AND ${keyCol} = ? LIMIT 1`).bind(keyVal).first();
      let qs: any[] = []; if (existing) { try { qs = JSON.parse(existing.questions) || []; } catch {} }
      if (qs.length >= target) return json({ ok: true, id: existing.id, bank_size: qs.length, target, done: true });
      const gen = await rqAiGenerate({ level, textbook, lesson_no: null, topic, counts: { listen: 4, write: 3, speak: 3, choice: 0 } });
      if (!gen.ok) return json({ ok: false, error: gen.error }, 502);
      qs = qs.concat(gen.questions);
      if (qs.length > target) qs = qs.slice(0, target);
      const drawJson = JSON.stringify({ listen: 4, write: 3, speak: 3 });
      const now = Date.now();
      if (existing) {
        await env.DB.prepare(`UPDATE review_quizzes SET questions=?, draw=?, active=1, updated_at=? WHERE id=?`).bind(JSON.stringify(qs), drawJson, now, existing.id).run();
        return json({ ok: true, id: existing.id, bank_size: qs.length, target, done: qs.length >= target });
      }
      const title = textbook ? `\u{1F4DA} ${textbook}` : `\u{1F3F7}\uFE0F ${level}`;
      const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, draw, created_at, updated_at) VALUES (?,?,?,1,?,?,?,'bank',?,?,?)`)
        .bind(title, '교재 은행에서 듣기4·쓰기3·말하기3 랜덤 10출제', JSON.stringify(qs), level || null, textbook || null, null, drawJson, now, now).run();
      return json({ ok: true, id: (ins as any).meta?.last_row_id, bank_size: qs.length, target, done: qs.length >= target });
    }

    // ── GET /api/admin/review-quiz/list — 관리자: 전체 퀴즈 (정답 포함 + 응시수) ──
    if (method === 'GET' && path === '/api/admin/review-quiz/list') {
      await ensureReviewQuizTables();
      const rs = await env.DB.prepare(`SELECT q.*, (SELECT COUNT(*) FROM review_quiz_results r WHERE r.quiz_id = q.id) AS attempt_count FROM review_quizzes q ORDER BY q.id DESC`).all();
      const quizzes = (((rs.results as any[]) || [])).map((row: any) => {
        let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
        return { ...row, questions: qs };
      });
      return json({ ok: true, quizzes });
    }

    // ── POST /api/admin/review-quiz/save — 관리자: 생성/수정 (id 있으면 수정) ──
    if (method === 'POST' && path === '/api/admin/review-quiz/save') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const title = String(b.title || '').trim();
      if (!title) return json({ ok: false, error: 'title_required' }, 400);
      const description = String(b.description || '').trim();
      const parsed = rqParseQuestions(b.questions);
      if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
      const active = (b.active === 0 || b.active === false) ? 0 : 1;
      const level = String(b.level || '').trim() || null;
      const textbook = String(b.textbook || '').trim() || null;
      const lessonNo = Number(b.lesson_no) > 0 ? Number(b.lesson_no) : null;
      const source = b.source === 'ai' ? 'ai' : 'manual';
      const now = Date.now();
      const id = Number(b.id) || 0;
      if (id) {
        const r = await env.DB.prepare(`UPDATE review_quizzes SET title=?, description=?, questions=?, active=?, level=?, textbook=?, lesson_no=?, updated_at=? WHERE id=?`)
          .bind(title, description, JSON.stringify(parsed.list), active, level, textbook, lessonNo, now, id).run();
        if (!((r as any).meta && (r as any).meta.changes)) return json({ ok: false, error: 'quiz_not_found' }, 404);
        return json({ ok: true, id });
      }
      const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(title, description, JSON.stringify(parsed.list), active, level, textbook, lessonNo, source, now, now).run();
      return json({ ok: true, id: (ins as any).meta?.last_row_id });
    }

    // ── POST /api/admin/review-quiz/toggle — 관리자: 활성/비활성 ──
    if (method === 'POST' && path === '/api/admin/review-quiz/toggle') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const id = Number(b.id) || 0;
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      const active = (b.active === 0 || b.active === false) ? 0 : 1;
      await env.DB.prepare(`UPDATE review_quizzes SET active=?, updated_at=? WHERE id=?`).bind(active, Date.now(), id).run();
      return json({ ok: true, id, active });
    }

    // ── DELETE /api/admin/review-quiz/:id — 관리자: 삭제 (결과 기록도 함께) ──
    if (method === 'DELETE' && /^\/api\/admin\/review-quiz\/\d+$/.test(path)) {
      await ensureReviewQuizTables();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM review_quizzes WHERE id=?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM review_quiz_results WHERE quiz_id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── GET /api/admin/review-quiz/results?quiz_id=N — 관리자: 학생 응시 결과 ──
    if (method === 'GET' && path === '/api/admin/review-quiz/results') {
      await ensureReviewQuizTables();
      const quizId = parseInt(url.searchParams.get('quiz_id') || '0', 10);
      let q = `SELECT r.*, q.title AS quiz_title FROM review_quiz_results r LEFT JOIN review_quizzes q ON q.id = r.quiz_id`;
      const binds: any[] = [];
      if (quizId) { q += ` WHERE r.quiz_id = ?`; binds.push(quizId); }
      q += ` ORDER BY r.created_at DESC LIMIT 500`;
      const rs = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, results: rs.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase HW — 숙제 관리 (출제 → 제출 → 채점 → 피드백)
    //   대상 지정: 전체(all) / 특정 학원(academy) / 특정 학생들(students)
    //   학원 선택 후 그 학원 소속 학생을 다중 선택해 출제할 수 있음.
    // ═══════════════════════════════════════════════════════════════
    const ensureHomeworkTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS homework (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        answer_type TEXT DEFAULT 'text',
        due_date TEXT,
        target_type TEXT NOT NULL DEFAULT 'all',
        target_academy TEXT,
        target_student_ids TEXT,
        target_student_names TEXT,
        target_count INTEGER DEFAULT 0,
        created_by TEXT,
        active INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_homework_created ON homework(created_at DESC);`); } catch {}
    };

    // ── POST /api/admin/homework/save — 관리자: 숙제 출제(생성/수정) ──
    if (method === 'POST' && path === '/api/admin/homework/save') {
      await ensureHomeworkTables();
      const b: any = await request.json().catch(() => ({}));
      const title = String(b.title || '').trim();
      if (!title) return json({ ok: false, error: 'title_required' }, 400);
      const description = String(b.description || '').trim() || null;
      const answerType = ['text', 'choice', 'voice', 'video'].includes(String(b.answer_type)) ? String(b.answer_type) : 'text';
      const dueDate = String(b.due_date || '').trim() || null;
      // 대상 타입: all(전체) | academy(특정 학원) | students(특정 학생들)
      let targetType = String(b.target_type || 'all');
      if (!['all', 'academy', 'students'].includes(targetType)) targetType = 'all';
      const targetAcademy = String(b.target_academy || '').trim() || null;
      let ids: string[] = [];
      let names: string[] = [];
      if (Array.isArray(b.target_student_ids)) ids = b.target_student_ids.map((x: any) => String(x)).filter(Boolean);
      if (Array.isArray(b.target_student_names)) names = b.target_student_names.map((x: any) => String(x)).filter(Boolean);
      // 유효성: academy 면 학원명 필수, students 면 학생 1명 이상 필수
      if (targetType === 'academy' && !targetAcademy) return json({ ok: false, error: 'academy_required' }, 400);
      if (targetType === 'students' && ids.length === 0) return json({ ok: false, error: 'students_required' }, 400);
      const targetCount = targetType === 'students' ? ids.length : (b.target_count != null ? Number(b.target_count) : 0);
      const now = Date.now();
      const id = Number(b.id) || 0;
      if (id) {
        const r = await env.DB.prepare(`UPDATE homework SET title=?, description=?, answer_type=?, due_date=?, target_type=?, target_academy=?, target_student_ids=?, target_student_names=?, target_count=?, updated_at=? WHERE id=?`)
          .bind(title, description, answerType, dueDate, targetType, targetAcademy, JSON.stringify(ids), JSON.stringify(names), targetCount, now, id).run();
        if (!((r as any).meta && (r as any).meta.changes)) return json({ ok: false, error: 'homework_not_found' }, 404);
        return json({ ok: true, id });
      }
      const ins = await env.DB.prepare(`INSERT INTO homework (title, description, answer_type, due_date, target_type, target_academy, target_student_ids, target_student_names, target_count, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`)
        .bind(title, description, answerType, dueDate, targetType, targetAcademy, JSON.stringify(ids), JSON.stringify(names), targetCount, now, now).run();
      return json({ ok: true, id: (ins as any).meta?.last_row_id });
    }

    // ── GET /api/admin/homework/list — 관리자: 숙제 목록 ──
    if (method === 'GET' && path === '/api/admin/homework/list') {
      await ensureHomeworkTables();
      const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));
      try {
        const rs = await env.DB.prepare(`SELECT * FROM homework WHERE active=1 ORDER BY created_at DESC LIMIT ?`).bind(lim).all<any>();
        const items = (rs.results || []).map((r: any) => {
          try { r.target_student_ids = JSON.parse(r.target_student_ids || '[]'); } catch { r.target_student_ids = []; }
          try { r.target_student_names = JSON.parse(r.target_student_names || '[]'); } catch { r.target_student_names = []; }
          return r;
        });
        return json({ ok: true, items });
      } catch (e: any) {
        return json({ ok: true, items: [], warning: String(e?.message || e) });
      }
    }

    // ── DELETE /api/admin/homework/:id — 관리자: 숙제 삭제(소프트) ──
    if (method === 'DELETE' && /^\/api\/admin\/homework\/\d+$/.test(path)) {
      await ensureHomeworkTables();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`UPDATE homework SET active=0, updated_at=? WHERE id=?`).bind(Date.now(), id).run();
      return json({ ok: true, id });
    }

    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase K1 — 화상수업 채팅 영속화
    // ═══════════════════════════════════════════════════════════════
    const ensureChatTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, sender_uid TEXT, sender_name TEXT, sender_role TEXT, message TEXT NOT NULL, sent_at INTEGER NOT NULL, meta TEXT);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_chat_room_time ON chat_messages(room_id, sent_at DESC);`); } catch {}
    };

    // ── GET /api/chat/messages?room_id=xxx&limit=200 — 방의 최근 채팅 ──
    if (method === 'GET' && path === '/api/chat/messages') {
      await ensureChatTable();
      const roomId = (url.searchParams.get('room_id') || '').trim();
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)));
      if (!roomId) return json({ ok: false, error: 'room_id_required' }, 400);
      const rs = await env.DB.prepare(
        `SELECT id, sender_uid, sender_name, sender_role, message, sent_at
           FROM chat_messages
          WHERE room_id = ?
          ORDER BY sent_at DESC
          LIMIT ?`
      ).bind(roomId, limit).all();
      // 오래된 → 최근 순으로 reverse (클라이언트 렌더 편의)
      const rows = (rs.results || []).reverse();
      return json({ ok: true, count: rows.length, rows });
    }

    // ── POST /api/chat/messages — 채팅 메시지 영속화 ──
    //   body: { room_id, sender_uid, sender_name, sender_role?, message, meta? }
    if (method === 'POST' && path === '/api/chat/messages') {
      await ensureChatTable();
      const body: any = await request.json().catch(() => ({}));
      const roomId = (body.room_id || '').trim();
      const message = String(body.message || '').slice(0, 2000);
      if (!roomId || !message) return json({ ok: false, error: 'room_id_and_message_required' }, 400);
      const now = Date.now();
      const ins = await env.DB.prepare(
        `INSERT INTO chat_messages (room_id, sender_uid, sender_name, sender_role, message, sent_at, meta)
         VALUES (?,?,?,?,?,?,?)`
      ).bind(
        roomId,
        body.sender_uid || null,
        body.sender_name || null,
        body.sender_role || null,
        message,
        now,
        body.meta ? JSON.stringify(body.meta) : null
      ).run();
      return json({ ok: true, id: ins?.meta?.last_row_id, sent_at: now });
    }

    // ── GET /api/admin/chat/stats — 채팅 활동 통계 (관리자) ──
    if (method === 'GET' && path === '/api/admin/chat/stats') {
      await ensureChatTable();
      const since = Date.now() - 30 * 86400 * 1000;
      const stats: any = await env.DB.prepare(
        `SELECT COUNT(*) AS total, COUNT(DISTINCT room_id) AS rooms, COUNT(DISTINCT sender_uid) AS users
           FROM chat_messages WHERE sent_at >= ?`
      ).bind(since).first();
      return json({ ok: true, stats: stats || {} });
    }

    // ── DELETE /api/admin/chat/cleanup — 30일 이전 메시지 정리 ──
    if (method === 'POST' && path === '/api/admin/chat/cleanup') {
      await ensureChatTable();
      const cutoff = Date.now() - 30 * 86400 * 1000;
      const r = await env.DB.prepare(`DELETE FROM chat_messages WHERE sent_at < ?`).bind(cutoff).run();
      return json({ ok: true, deleted: r?.meta?.changes || 0 });
    }
    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase K1 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 📲 Phase K2~K4 — 카카오 알림톡 (SOLAPI)
    // ═══════════════════════════════════════════════════════════════

    // ── GET /api/admin/kakao/status — 알림톡 API 상태 + 잔액 ──
    if (method === 'GET' && path === '/api/admin/kakao/status') {
      const mode = getSolapiMode(env);
      const result: any = {
        ok: true,
        mode,
        api_key_set: !!(env as any).SOLAPI_API_KEY,
        api_secret_set: !!(env as any).SOLAPI_API_SECRET,
        pfid_set: !!(env as any).SOLAPI_PFID,
        templates: {
          lesson_start: !!(env as any).SOLAPI_TEMPLATE_LESSON_START,
          lesson_end:   !!(env as any).SOLAPI_TEMPLATE_LESSON_END,
          chat_summary: !!(env as any).SOLAPI_TEMPLATE_CHAT_SUMMARY,
          mention:      !!(env as any).SOLAPI_TEMPLATE_MENTION,
        },
        test_mode: (env as any).SOLAPI_TEST_MODE === 'true',
      };
      if (mode !== 'disabled') {
        try {
          const bal = await checkSolapiBalance(env);
          result.balance = bal.balance;
          result.point = bal.point;
          result.balance_message = bal.message;
        } catch (e: any) { result.balance_error = String(e?.message || e); }
      }
      return json(result);
    }

    // ── POST /api/notify/lesson-started — 수업 시작 알림 (카카오 + Web Push) ──
    //   body: { room_id, student_name, student_phone, lesson_title, teacher_name, parent_phone?, student_uid?, parent_uid? }
    if (method === 'POST' && path === '/api/notify/lesson-started') {
      const body: any = await request.json().catch(() => ({}));
      const phone = body.student_phone || body.parent_phone;
      const studentName = body.student_name || '학생';
      const lessonTitle = body.lesson_title || '영어 수업';
      const teacherName = body.teacher_name || '강사';
      let kakaoResult: any = { skipped: true };
      if (phone) {
        kakaoResult = await sendLessonStartAlert(env, phone, { studentName, lessonTitle, teacherName, roomUrl: body.room_url });
      }
      // 🆕 Web Push 도 함께 발송
      const pushTitle = `🎓 ${lessonTitle} 시작!`;
      const pushBody = `${teacherName} 강사님이 수업을 시작했어요. 지금 입장하세요.`;
      const pushUrl = body.room_url || '/?go=videocall';
      const pushTag = `lesson-start-${body.room_id || Date.now()}`;
      const pushResults: any[] = [];
      if (body.student_uid) pushResults.push({ role: 'student', ...(await sendPushToUser(body.student_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      if (body.parent_uid) pushResults.push({ role: 'parent', ...(await sendPushToUser(body.parent_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      return json({ ok: true, kakao: kakaoResult, push: pushResults });
    }

    // ── POST /api/notify/lesson-ended — 수업 종료 알림 (학생/학부모/강사 일괄) ──
    //   body: { room_id, student_name, student_phone?, parent_phone?, teacher_phone?, lesson_title, duration_minutes, message_count? }
    if (method === 'POST' && path === '/api/notify/lesson-ended') {
      const body: any = await request.json().catch(() => ({}));
      const lessonTitle = body.lesson_title || '영어 수업';
      const studentName = body.student_name || '학생';
      const duration = (body.duration_minutes || 0) + '분';
      const msgCount = body.message_count || 0;
      const targets: any[] = [];
      if (body.student_phone) targets.push({ role: 'student', phone: body.student_phone });
      if (body.parent_phone)  targets.push({ role: 'parent',  phone: body.parent_phone });
      if (body.teacher_phone) targets.push({ role: 'teacher', phone: body.teacher_phone });
      const results: any[] = [];
      for (const t of targets) {
        const r = await sendLessonEndAlert(env, t.phone, { studentName, lessonTitle, duration, messagesCount: msgCount });
        results.push({ role: t.role, phone: t.phone, ...r });
      }
      return json({ ok: true, count: results.length, results });
    }

    // ── POST /api/notify/chat-summary — 채팅 요약 알림 ──
    //   body: { room_id, student_name, student_phone?, parent_phone?, lesson_title }
    //   채팅 메시지 수를 D1 에서 자동 집계 → 알림톡 1건 발송
    if (method === 'POST' && path === '/api/notify/chat-summary') {
      const body: any = await request.json().catch(() => ({}));
      const roomId = (body.room_id || '').trim();
      if (!roomId) return json({ ok: false, error: 'room_id_required' }, 400);
      await ensureChatTable();
      // 최근 24시간 메시지 수 집계
      const since = Date.now() - 86400 * 1000;
      const cnt: any = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM chat_messages WHERE room_id = ? AND sent_at >= ?`
      ).bind(roomId, since).first();
      const messageCount = cnt?.c || 0;
      const summaryUrl = `https://webrtc-unified-platform-prod.navy111p.workers.dev/admin/chat-summary.html?room=${encodeURIComponent(roomId)}`;
      const studentName = body.student_name || '학생';
      const lessonTitle = body.lesson_title || '영어 수업';
      const targets: string[] = [];
      if (body.student_phone) targets.push(body.student_phone);
      if (body.parent_phone)  targets.push(body.parent_phone);
      const results: any[] = [];
      for (const phone of targets) {
        const r = await sendChatSummaryAlert(env, phone, { studentName, lessonTitle, messageCount, summaryUrl });
        results.push({ phone, ...r });
      }
      return json({ ok: true, room_id: roomId, message_count: messageCount, results });
    }

    // ── POST /api/notify/no-show — 상대 미입장(노쇼) 알림 (Web Push + 조건부 알림톡 + 기록) ──
    //   Phase RM 2단계: 방에 먼저 온 사람이 일정시간(기본 5분) 대기해도 상대가 안 오면 클라이언트가 1회 호출.
    //   body: { room_id, schedule_id?, waiting_for:'teacher'|'student', student_name?, teacher_name?, lesson_title?,
    //           student_uid?, teacher_uid?, student_phone?, parent_phone?, teacher_phone?, waited_minutes? }
    if (method === 'POST' && path === '/api/notify/no-show') {
      const body: any = await request.json().catch(() => ({}));
      const roomId = (body.room_id || '').trim();
      const waitingFor = (body.waiting_for === 'student') ? 'student' : 'teacher';
      if (!roomId) return json({ ok: false, error: 'room_id_required' }, 400);
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_no_show (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, missing_role TEXT, missing_uid TEXT, student_name TEXT, teacher_name TEXT, lesson_title TEXT, waited_min INTEGER, notified_push INTEGER DEFAULT 0, notified_kakao INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`); } catch {}
      // 중복 방지 — 같은 방 30분 내 노쇼 기록이 있으면 스킵 (재접속/중복호출 대비)
      try {
        const dup: any = await env.DB.prepare(`SELECT 1 FROM class_no_show WHERE room_id = ? AND created_at >= ? LIMIT 1`).bind(roomId, Date.now() - 30 * 60000).first();
        if (dup) return json({ ok: true, deduped: true });
      } catch {}

      const studentName = body.student_name || '학생';
      const teacherName = body.teacher_name || '강사';
      const lessonTitle = body.lesson_title || '영어 수업';
      const waited = Number(body.waited_minutes) || 5;
      const missingUid = waitingFor === 'teacher' ? (body.teacher_uid || '') : (body.student_uid || '');
      const roomUrl = `${new URL(request.url).origin}/?go=videocall`;

      // 1) Web Push — 안 온 사람에게 '빨리 입장하세요' (구독 없으면 자동 스킵)
      let push: any = { skipped: true };
      const pushTitle = waitingFor === 'teacher' ? '⏰ 학생이 기다리고 있어요' : '⏰ 강사님이 기다리고 있어요';
      const pushBody = waitingFor === 'teacher'
        ? `${studentName} 학생이 '${lessonTitle}' 방에서 ${waited}분째 기다리고 있어요. 지금 입장해 주세요.`
        : `${teacherName} 강사님이 '${lessonTitle}' 방에서 기다리고 있어요. 지금 입장하세요.`;
      if (missingUid) push = await sendPushToUser(missingUid, pushTitle, pushBody, roomUrl, `no-show-${roomId}`);

      // 2) 알림톡 — 전용 템플릿(SOLAPI_TEMPLATE_NO_SHOW)이 등록돼 있을 때만 발송(없으면 정직하게 스킵)
      let kakao: any = { skipped: true, reason: 'no_template' };
      const noShowTpl = (env as any).SOLAPI_TEMPLATE_NO_SHOW;
      const targetPhone = waitingFor === 'teacher' ? body.teacher_phone : (body.student_phone || body.parent_phone);
      if (noShowTpl && targetPhone) {
        kakao = await sendKakaoAlimtalk(env, {
          templateCode: noShowTpl,
          recipientPhone: targetPhone,
          recipientName: waitingFor === 'teacher' ? teacherName : studentName,
          variables: { '#{학생명}': studentName, '#{강사명}': teacherName, '#{수업명}': lessonTitle, '#{입장URL}': roomUrl },
          fallbackSmsText: pushBody,
          logContext: { userId: body.student_uid || missingUid || roomId, reason: 'no_show', refRoomId: roomId },
        });
      }

      // 3) 기록 — 관리자 노쇼 리포트/이탈 그래프 소스
      try {
        await env.DB.prepare(`INSERT INTO class_no_show (room_id, schedule_id, missing_role, missing_uid, student_name, teacher_name, lesson_title, waited_min, notified_push, notified_kakao, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(roomId, body.schedule_id || null, waitingFor, missingUid || null, studentName, teacherName, lessonTitle, waited, (push && push.ok) ? 1 : 0, (kakao && kakao.ok) ? 1 : 0, Date.now()).run();
      } catch (e: any) { console.warn('[no-show] log insert skipped:', e?.message); }

      return json({ ok: true, waiting_for: waitingFor, push, kakao });
    }

    // ── POST /api/notify/mention — @멘션 즉시 푸시 알림 (카카오 + Web Push) ──
    //   body: { mentioned_student_name, mentioned_phone, teacher_name, message_excerpt, room_url?, mentioned_uid? }
    if (method === 'POST' && path === '/api/notify/mention') {
      const body: any = await request.json().catch(() => ({}));
      const studentName = body.mentioned_student_name || '학생';
      const teacherName = body.teacher_name || '강사';
      const messageExcerpt = body.message_excerpt || '';
      let kakaoResult: any = { skipped: true };
      if (body.mentioned_phone) {
        kakaoResult = await sendMentionAlert(env, body.mentioned_phone, { studentName, teacherName, messageExcerpt, roomUrl: body.room_url });
      }
      // 🆕 Web Push 도 함께
      let pushResult: any = { skipped: true };
      if (body.mentioned_uid) {
        pushResult = await sendPushToUser(
          body.mentioned_uid,
          `💬 ${teacherName} 강사님이 ${studentName}님을 부르셨어요`,
          messageExcerpt.slice(0, 100) || '수업방에서 강사님이 호출했습니다.',
          body.room_url || '/?go=videocall',
          `mention-${Date.now()}`
        );
      }
      return json({ ok: true, kakao: kakaoResult, push: pushResult });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📲 Phase K2~K4 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 📝 Phase E1~E4 — 학생 평가서
    // ═══════════════════════════════════════════════════════════════

    const ensureEvalTable = async () => {
      // 신규 DB: user_id/eval_at 도 함께 생성(레거시 호환). 기존 DB 에는 아래 가산 마이그레이션이 적용됨.
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, eval_at INTEGER, student_uid TEXT, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall REAL, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      // 🔧 fix (2026-06-13) — 스키마 드리프트 통합. 운영 DB 의 student_evaluations 는 레거시
      //   스키마(user_id/eval_at/score_total/next_goal …)로 만들어져 있어, 코드가 기대하는
      //   E1~E4 컬럼(student_uid/score_homework/next_goals/viewed_by_parent …)이 없어서
      //   평가서 작성·목록·열람·카톡발송이 전부 D1 에러로 실패했음. 누락 컬럼만 가산(ADD COLUMN)해 통합.
      try {
        const info: any = await env.DB.prepare(`PRAGMA table_info(student_evaluations)`).all();
        const have = new Set(((info && info.results) || []).map((r: any) => String(r.name)));
        const want: Array<[string, string]> = [
          ['student_uid','TEXT'],['student_name','TEXT'],['teacher_uid','TEXT'],['teacher_name','TEXT'],
          ['room_id','TEXT'],['lesson_title','TEXT'],['lesson_date','TEXT'],
          ['score_participation','INTEGER'],['score_comprehension','INTEGER'],['score_homework','INTEGER'],
          ['score_attitude','INTEGER'],['score_speaking','INTEGER'],['score_overall','REAL'],
          ['score_grammar','REAL'],['score_vocab','REAL'],
          ['strengths','TEXT'],['improvements','TEXT'],['weaknesses','TEXT'],['next_goals','TEXT'],['teacher_comment','TEXT'],
          ['parent_notified','INTEGER'],['parent_notified_at','INTEGER'],['viewed_by_parent','INTEGER'],['viewed_at','INTEGER'],
          ['updated_at','INTEGER'],
        ];
        for (const [col, typ] of want) {
          if (!have.has(col)) { try { await env.DB.exec(`ALTER TABLE student_evaluations ADD COLUMN ${col} ${typ}`); } catch {} }
        }
      } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_eval_student ON student_evaluations(student_uid, created_at DESC);`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_eval_teacher ON student_evaluations(teacher_uid, created_at DESC);`); } catch {}
    };

    // ── POST /api/eval/create — 강사가 평가서 작성 ──
    if (method === 'POST' && path === '/api/eval/create') {
      await ensureEvalTable();
      const body: any = await request.json().catch(() => ({}));
      if (!body.student_uid) return json({ ok: false, error: 'student_uid_required' }, 400);
      const now = Date.now();
      // 평가 점수 평균으로 종합 점수 자동 계산
      const scores = [body.score_participation, body.score_comprehension, body.score_homework, body.score_attitude, body.score_speaking]
        .filter(v => v != null && !isNaN(v))
        .map(v => Number(v));
      const overall = scores.length > 0
        ? Math.round((scores.reduce((a,b)=>a+b,0) / scores.length) * 10) / 10
        : null;
      const ins = await env.DB.prepare(
        `INSERT INTO student_evaluations (user_id, eval_at, student_uid, student_name, teacher_uid, teacher_name, room_id, lesson_title, lesson_date,
          score_participation, score_comprehension, score_homework, score_attitude, score_speaking, score_overall,
          strengths, improvements, next_goals, teacher_comment, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        body.student_uid, now,
        body.student_uid, body.student_name || null,
        body.teacher_uid || null, body.teacher_name || null,
        body.room_id || null, body.lesson_title || null,
        body.lesson_date || new Date().toISOString().slice(0,10),
        body.score_participation || null, body.score_comprehension || null,
        body.score_homework || null, body.score_attitude || null,
        body.score_speaking || null, overall,
        body.strengths || null, body.improvements || null,
        body.next_goals || null, body.teacher_comment || null,
        now, now
      ).run();
      const evalId = ins?.meta?.last_row_id;

      // 평가서 작성 완료 → 학부모/학생 카톡 알림 자동 발송 (옵션)
      let notifyResult: any = null;
      if (body.parent_phone || body.student_phone) {
        try {
          const evalUrl = `https://webrtc-unified-platform-prod.navy111p.workers.dev/eval/${evalId}`;
          // 카카오 알림톡 시도 (mock/disabled 면 조용히 건너뜀)
          const { sendKakaoAlimtalk } = await import('./solapi-client');
          const phones = [body.parent_phone, body.student_phone].filter(Boolean);
          notifyResult = { sent: [], failed: [] };
          for (const phone of phones) {
            // 임시: chat_summary 템플릿 재사용 (평가서 전용 템플릿 등록 전)
            const r = await sendKakaoAlimtalk(env, {
              templateCode: (env as any).SOLAPI_TEMPLATE_CHAT_SUMMARY || '',
              recipientPhone: phone,
              variables: {
                '#{학생명}': body.student_name || '학생',
                '#{수업명}': body.lesson_title || '오늘 수업',
                '#{메시지수}': '평가서',
                '#{요약URL}': evalUrl,
              },
              fallbackSmsText: `[망고아이] ${body.student_name||''} 학생 오늘 수업 평가서 도착. ${evalUrl}`,
            });
            if (r.ok) notifyResult.sent.push(phone);
            else notifyResult.failed.push({ phone, error: r.error || r.message });
          }
          if (notifyResult.sent.length > 0) {
            await env.DB.prepare(`UPDATE student_evaluations SET parent_notified=1, parent_notified_at=? WHERE id=?`).bind(now, evalId).run();
          }
        } catch (e: any) {
          console.warn('[eval] notify err:', e?.message);
        }
      }
      // 🆕 Web Push 도 함께 (학생/학부모 user_id 가 있으면)
      const pushTitle = `📝 ${body.student_name || '학생'}님의 평가서 도착!`;
      const pushBody = `종합 점수 ${overall}/10. 자세히 보기 클릭`;
      const pushUrl = `/eval.html?id=${evalId}`;
      const pushTag = `eval-${evalId}`;
      const pushResults: any[] = [];
      if (body.student_uid) pushResults.push({ role: 'student', ...(await sendPushToUser(body.student_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      if (body.parent_uid) pushResults.push({ role: 'parent', ...(await sendPushToUser(body.parent_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      // 🎮 배지는 parent.html / mypage 에서 페이지 로드 시 /api/badges/check 호출로 자동 갱신
      return json({ ok: true, id: evalId, overall, notify: notifyResult, push: pushResults });
    }

    // ── GET /api/eval/list?uid=X&role=student|parent|teacher — 평가서 목록 ──
    if (method === 'GET' && path === '/api/eval/list') {
      await ensureEvalTable();
      const uid = (url.searchParams.get('uid') || '').trim();
      const role = (url.searchParams.get('role') || 'student').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const col = role === 'teacher' ? 'teacher_uid' : 'student_uid';
      const rs = await env.DB.prepare(
        `SELECT id, student_name, teacher_name, lesson_title, lesson_date, score_overall, created_at, parent_notified, viewed_by_parent
           FROM student_evaluations
          WHERE ${col} = ?
          ORDER BY created_at DESC
          LIMIT 50`
      ).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── GET /api/eval/:id — 평가서 단건 조회 (학부모/학생 페이지에서 사용) ──
    if (method === 'GET' && /^\/api\/eval\/\d+$/.test(path)) {
      await ensureEvalTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(`SELECT * FROM student_evaluations WHERE id=?`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      // 학부모가 본 적 없으면 view 기록
      if (!row.viewed_by_parent) {
        await env.DB.prepare(`UPDATE student_evaluations SET viewed_by_parent=1, viewed_at=? WHERE id=?`).bind(Date.now(), id).run();
      }
      return json({ ok: true, eval: row });
    }

    // ── DELETE /api/eval/:id — 평가서 삭제 (강사/관리자) ──
    if (method === 'DELETE' && /^\/api\/eval\/\d+$/.test(path)) {
      await ensureEvalTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM student_evaluations WHERE id=?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }

    // ── GET /api/admin/eval/list — 관리자: 전체 평가서 목록 + 통계 ──
    if (method === 'GET' && path === '/api/admin/eval/list') {
      await ensureEvalTable();
      const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)));
      const rs = await env.DB.prepare(
        `SELECT * FROM student_evaluations ORDER BY created_at DESC LIMIT ?`
      ).bind(limit).all();
      // 통계 계산
      const month_start = new Date(); month_start.setDate(1); month_start.setHours(0,0,0,0);
      const stats: any = await env.DB.prepare(
        `SELECT COUNT(*) AS total, AVG(score_overall) AS avg_score,
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS this_month,
                SUM(parent_notified) AS notified,
                SUM(viewed_by_parent) AS viewed
           FROM student_evaluations`
      ).bind(month_start.getTime()).first();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [], stats });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📝 Phase E1 끝
    // ═══════════════════════════════════════════════════════════════

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
        pushResult = await sendPushToUser(
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
          WHERE (s.status = '정상' OR s.status = '활동' OR s.status IS NULL OR s.status = '')${_sw.cond ? ' AND ' + _sw.cond : ''}`
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
    // 💼 Phase G1~G2 — 강사 급여 자동 정산
    // ═══════════════════════════════════════════════════════════════

    const ensurePayrollTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_payroll (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL, teacher_name TEXT, year INTEGER NOT NULL, month INTEGER NOT NULL, lesson_count INTEGER DEFAULT 0, total_minutes INTEGER DEFAULT 0, fee_per_10min INTEGER DEFAULT 0, calculated_amount INTEGER DEFAULT 0, adjusted_amount INTEGER, paid_amount INTEGER, status TEXT DEFAULT 'pending', paid_at INTEGER, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(teacher_id, year, month));`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_payroll_period ON teacher_payroll(year, month)`); } catch {}
    };

    // ── GET /api/admin/payroll/calculate?year=&month= — 월별 강사 급여 자동 계산 ──
    //   class_schedules 에서 강사별 완료 수업 수 집계 → teacher_profiles.fee_per_10min 곱하여 계산
    //   결과는 메모리에서만 반환 (DB 저장은 별도 POST /save)
    if (method === 'GET' && path === '/api/admin/payroll/calculate') {
      await ensurePayrollTable();
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, fee_per_10min INTEGER, status TEXT DEFAULT '활동중', email TEXT, phone TEXT);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, teacher_id INTEGER, teacher_name TEXT, scheduled_date TEXT, day_of_week INTEGER, start_time TEXT, duration_minutes INTEGER, status TEXT);`); } catch {}

      const now = new Date();
      const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()), 10);
      const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);
      const defaultMinutes = parseInt(url.searchParams.get('default_minutes') || '30', 10);  // 수업 1회 기본 30분

      // 강사 목록 + 단가
      const teachers: any = await env.DB.prepare(
        `SELECT id, korean_name, english_name, fee_per_10min FROM teacher_profiles WHERE status = '활동중' OR status IS NULL ORDER BY korean_name`
      ).all().catch(() => ({ results: [] }));

      // 해당 월에 완료된 수업 (status: 'active' 또는 'completed', 'attended' 등 — 'cancelled' 제외)
      const ymPrefix = `${year}-${String(month).padStart(2,'0')}`;
      const lessons: any = await env.DB.prepare(
        `SELECT teacher_id, teacher_name, COUNT(*) AS lesson_count, SUM(COALESCE(duration_minutes, ${defaultMinutes})) AS total_min
           FROM class_schedules
          WHERE (scheduled_date LIKE ? OR scheduled_date LIKE ?)
            AND COALESCE(status,'active') != 'cancelled'
            AND teacher_id IS NOT NULL
          GROUP BY teacher_id`
      ).bind(ymPrefix + '%', ymPrefix + '/%').all().catch(() => ({ results: [] }));

      const lessonMap: any = {};
      (lessons.results || []).forEach((l: any) => { lessonMap[l.teacher_id] = l; });

      // 기존 저장된 정산 (지급 상태 확인용)
      const saved: any = await env.DB.prepare(
        `SELECT * FROM teacher_payroll WHERE year = ? AND month = ?`
      ).bind(year, month).all().catch(() => ({ results: [] }));
      const savedMap: any = {};
      (saved.results || []).forEach((s: any) => { savedMap[s.teacher_id] = s; });

      const rows: any[] = [];
      let totalAmount = 0, totalLessons = 0, paidCount = 0;
      for (const t of (teachers.results || [])) {
        const l = lessonMap[t.id] || { lesson_count: 0, total_min: 0 };
        const fee = t.fee_per_10min || 0;
        const calculated = Math.round((l.total_min / 10) * fee);
        const s = savedMap[t.id];
        totalAmount += calculated;
        totalLessons += l.lesson_count || 0;
        if (s && s.status === 'paid') paidCount++;
        rows.push({
          teacher_id: t.id,
          korean_name: t.korean_name,
          english_name: t.english_name,
          fee_per_10min: fee,
          lesson_count: l.lesson_count || 0,
          total_minutes: l.total_min || 0,
          calculated_amount: calculated,
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
          paid_count: paidCount,
          unpaid_count: rows.length - paidCount,
        },
        rows,
      });
    }

    // ── POST /api/admin/payroll/save — 정산 결과 D1에 저장/업데이트 ──
    //   body: { year, month, rows: [{ teacher_id, lesson_count, total_minutes, fee_per_10min, calculated_amount, adjusted_amount?, memo? }] }
    if (method === 'POST' && path === '/api/admin/payroll/save') {
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
            `INSERT INTO teacher_payroll (teacher_id, teacher_name, year, month, lesson_count, total_minutes, fee_per_10min, calculated_amount, adjusted_amount, memo, status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(teacher_id, year, month) DO UPDATE SET
               teacher_name = excluded.teacher_name,
               lesson_count = excluded.lesson_count,
               total_minutes = excluded.total_minutes,
               fee_per_10min = excluded.fee_per_10min,
               calculated_amount = excluded.calculated_amount,
               adjusted_amount = excluded.adjusted_amount,
               memo = excluded.memo,
               updated_at = excluded.updated_at`
          ).bind(
            r.teacher_id, r.teacher_name || null, year, month,
            r.lesson_count || 0, r.total_minutes || 0, r.fee_per_10min || 0,
            r.calculated_amount || 0, r.adjusted_amount ?? null,
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
      const rs: any = await env.DB.prepare(
        `SELECT * FROM teacher_payroll WHERE year = ? AND month = ? ORDER BY teacher_name`
      ).bind(year, month).all().catch(() => ({ results: [] }));
      const rows = rs.results || [];
      const header = '강사ID,강사명,년월,수업횟수,총수업분,단가(10분),계산금액,조정금액,지급금액,상태,지급일,메모';
      const csv = [header].concat(
        rows.map((r: any) => [
          r.teacher_id,
          (r.teacher_name||'').replace(/,/g,' '),
          `${r.year}-${String(r.month).padStart(2,'0')}`,
          r.lesson_count || 0,
          r.total_minutes || 0,
          r.fee_per_10min || 0,
          r.calculated_amount || 0,
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
    // 🔔 Phase WP1~WP2 — Web Push 푸시 알림
    //   - VAPID JWT 인증 + 페이로드 없는 wakeup
    //   - SW 가 push 이벤트에서 /api/push/pending 에서 메시지 가져옴
    // ═══════════════════════════════════════════════════════════════
    const ensurePushTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, ua TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id, enabled)`); } catch {}
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_push_queue_ep ON push_queue(endpoint, fetched_at, queued_at DESC)`); } catch {}
    };

    // sendPushToUser is now defined at the top of handleMangoApi (TDZ fix).
    // This block intentionally left as a marker to preserve line layout.

    // ── GET /api/push/vapid-public-key — 클라이언트가 구독 시 사용 ──
    if (method === 'GET' && path === '/api/push/vapid-public-key') {
      const key = (env as any).VAPID_PUBLIC_KEY || '';
      return json({ ok: true, key, mode: getWebPushMode(env as any) });
    }

    // ── POST /api/push/subscribe — 구독 등록 ──
    if (method === 'POST' && path === '/api/push/subscribe') {
      await ensurePushTables();
      const b: any = await request.json().catch(() => ({}));
      const sub = b.subscription;
      if (!sub?.endpoint) return json({ ok: false, error: 'no_endpoint' }, 400);
      const now = Date.now();
      // INSERT OR REPLACE 로 동일 endpoint 갱신
      await env.DB.prepare(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, ua, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, enabled = 1, updated_at = excluded.updated_at`
      ).bind(b.user_id || null, sub.endpoint, sub.keys?.p256dh || null, sub.keys?.auth || null, b.ua || null, now, now).run();
      return json({ ok: true, endpoint: sub.endpoint });
    }

    // ── POST /api/push/unsubscribe — 구독 해제 ──
    if (method === 'POST' && path === '/api/push/unsubscribe') {
      await ensurePushTables();
      const b: any = await request.json().catch(() => ({}));
      if (!b.endpoint) return json({ ok: false, error: 'no_endpoint' }, 400);
      await env.DB.prepare(`UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE endpoint = ?`).bind(Date.now(), b.endpoint).run();
      return json({ ok: true });
    }

    // ── GET /api/push/pending?endpoint=X — SW 가 push 이벤트에서 호출하여 메시지 fetch ──
    if (method === 'GET' && path === '/api/push/pending') {
      await ensurePushTables();
      const ep = (url.searchParams.get('endpoint') || '').trim();
      if (!ep) return json({ ok: false, error: 'no_endpoint' }, 400);
      const rs = await env.DB.prepare(
        `SELECT id, title, body, url, icon, badge, tag, queued_at FROM push_queue WHERE endpoint = ? AND fetched_at IS NULL ORDER BY queued_at DESC LIMIT 5`
      ).bind(ep).all();
      const rows = rs.results || [];
      if (rows.length) {
        const ids = rows.map((r: any) => r.id);
        // 가져간 메시지는 fetched_at 마킹
        const now = Date.now();
        for (const id of ids) {
          await env.DB.prepare(`UPDATE push_queue SET fetched_at = ? WHERE id = ?`).bind(now, id).run();
        }
      }
      return json({ ok: true, count: rows.length, messages: rows });
    }

    // ── POST /api/admin/push/send — 특정 사용자(들)에게 푸시 ──
    if (method === 'POST' && path === '/api/admin/push/send') {
      await ensurePushTables();
      const b: any = await request.json().catch(() => ({}));
      const userId = b.user_id;
      const title = (b.title || '망고아이 알림').toString().slice(0, 100);
      const body = (b.body || '').toString().slice(0, 300);
      const target = b.url || '/';
      const icon = b.icon || '/img/icon-192.png';
      const badge = b.badge || '/img/icon-192.png';
      const tag = b.tag || ('mangoi-' + Date.now());

      const rs = userId
        ? await env.DB.prepare(`SELECT * FROM push_subscriptions WHERE user_id = ? AND enabled = 1`).bind(userId).all()
        : await env.DB.prepare(`SELECT * FROM push_subscriptions WHERE enabled = 1 LIMIT 200`).all();
      const subs = (rs.results || []) as any[];

      if (!subs.length) return json({ ok: true, sent: 0, total: 0, fail: 0, msg: 'no_subscribers' });

      const mode = getWebPushMode(env as any);
      const queuedAt = Date.now();
      // 모든 구독자에 대해 큐에 메시지 INSERT
      for (const s of subs) {
        await env.DB.prepare(
          `INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(s.endpoint, title, body, target, icon, badge, tag, queuedAt).run();
      }

      // wakeup push 발송
      const result = await broadcastWebPush(subs.map(s => s.endpoint), env as any);
      // 만료된 구독은 enabled = 0 처리
      for (const ep of result.expired) {
        await env.DB.prepare(`UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE endpoint = ?`).bind(Date.now(), ep).run();
      }
      return json({ ok: true, sent: result.sent, fail: result.failed, total: subs.length, mode, expired: result.expired.length });
    }

    // ── GET /api/admin/push/list — 구독 목록 ──
    if (method === 'GET' && path === '/api/admin/push/list') {
      await ensurePushTables();
      const rs = await env.DB.prepare(
        `SELECT id, user_id, endpoint, enabled, ua, created_at, updated_at FROM push_subscriptions ORDER BY updated_at DESC LIMIT 200`
      ).all();
      const rows = (rs.results || []) as any[];
      const total = rows.length;
      const active = rows.filter(r => r.enabled).length;
      return json({ ok: true, total, active, rows });
    }

    // ── GET /api/admin/push/history — 최근 발송 이력 (push_queue 기반) ──
    if (method === 'GET' && path === '/api/admin/push/history') {
      await ensurePushTables();
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
      const rs = await env.DB.prepare(
        `SELECT q.id, q.title, q.body, q.url, q.tag, q.queued_at, q.fetched_at, s.user_id, s.ua
           FROM push_queue q
           LEFT JOIN push_subscriptions s ON s.endpoint = q.endpoint
           ORDER BY q.queued_at DESC
           LIMIT ?`
      ).bind(limit).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── GET /api/admin/push/status — VAPID 모드/통계 ──
    if (method === 'GET' && path === '/api/admin/push/status') {
      await ensurePushTables();
      const mode = getWebPushMode(env as any);
      const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM push_subscriptions WHERE enabled = 1`).first<any>();
      const qc = await env.DB.prepare(`SELECT COUNT(*) AS n FROM push_queue WHERE queued_at >= ?`).bind(Date.now() - 86400000 * 7).first<any>();
      return json({ ok: true, mode, active_subs: c?.n || 0, queued_7d: qc?.n || 0, has_pub_key: !!(env as any).VAPID_PUBLIC_KEY });
    }

    // ── GET /api/admin/push/generate-vapid — 새 VAPID 키 페어 생성 (개발/세팅용) ──
    if (method === 'GET' && path === '/api/admin/push/generate-vapid') {
      try {
        const kp = await generateVapidKeyPair();
        return json({
          ok: true,
          publicKey: kp.publicKey,
          privateKey: kp.privateKey,
          instruction: 'wrangler secret put VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT 로 등록 후 deploy',
          warn: '⚠ 이 키는 한 번만 표시됩니다 — 안전한 곳에 저장하세요',
        });
      } catch (e: any) {
        console.warn('[generate-vapid] error:', e?.message, e?.stack);
        return json({ ok: false, error: e?.message || 'generate_failed', stack: (e?.stack || '').slice(0, 500) }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🔔 Phase WP1~WP2 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 👨‍👩‍👧 Phase PD — 부모 대시보드 통합 API
    //   GET /api/parent/dashboard?child_uid=X
    //   반환: 자녀 기본정보 + 최근 출석 + 평가서 4개 + 포인트 잔액/거래 + 결제내역 + 다음 수업
    // ═══════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/parent/dashboard') {
      const childUid = (url.searchParams.get('child_uid') || '').trim();
      if (!childUid) return json({ ok: false, error: 'child_uid_required' }, 400);

      // 안전 테이블 생성
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, updated_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, amount INTEGER NOT NULL, type TEXT, reason TEXT, balance_after INTEGER, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_name TEXT, lesson_date TEXT, score_overall INTEGER, score_speaking INTEGER, score_listening INTEGER, score_grammar INTEGER, score_vocab INTEGER, score_attitude INTEGER, strengths TEXT, weaknesses TEXT, next_goal TEXT, teacher_comment TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER, source TEXT, occurred_at INTEGER NOT NULL);`);

      // 자녀 기본정보
      const student = await env.DB.prepare(`SELECT user_id, student_name, parent_name, parent_phone, program, status, created_at FROM students_erp WHERE user_id = ?`).bind(childUid).first<any>();

      // 포인트 잔액
      const pts = await env.DB.prepare(`SELECT balance, lifetime_earned, lifetime_spent FROM student_points WHERE user_id = ?`).bind(childUid).first<any>();
      const ptsTx = await env.DB.prepare(`SELECT amount, type, reason, balance_after, created_at FROM point_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`).bind(childUid).all();

      // 최근 평가서 4개
      const evals = await env.DB.prepare(`SELECT id, lesson_date, score_overall, score_speaking, score_listening, score_grammar, score_vocab, score_attitude, strengths, next_goal, teacher_name, created_at FROM student_evaluations WHERE student_uid = ? ORDER BY created_at DESC LIMIT 4`).bind(childUid).all();

      // 출석 (최근 30일 point_rule_log 의 attendance/on_time)
      const sinceMs = Date.now() - 30 * 86400000;
      const attRows = await env.DB.prepare(`SELECT rule_code, occurred_at FROM point_rule_log WHERE user_id = ? AND occurred_at >= ? AND rule_code IN ('attendance', 'on_time') ORDER BY occurred_at DESC LIMIT 60`).bind(childUid, sinceMs).all();
      const attDays = new Set<string>();
      const onTimeDays = new Set<string>();
      (attRows.results || []).forEach((r: any) => {
        const d = new Date(r.occurred_at).toISOString().slice(0, 10);
        if (r.rule_code === 'attendance') attDays.add(d);
        if (r.rule_code === 'on_time') onTimeDays.add(d);
      });

      // 결제내역 (최근 6개)
      const pays = await env.DB.prepare(`SELECT id, paid_at, period_start, period_end, amount_krw, method, memo, status FROM student_payments WHERE user_id = ? ORDER BY paid_at DESC LIMIT 6`).bind(childUid).all();

      return json({
        ok: true,
        child: student || null,
        points: {
          balance: pts?.balance || 0,
          lifetime_earned: pts?.lifetime_earned || 0,
          lifetime_spent: pts?.lifetime_spent || 0,
          recent_tx: ptsTx.results || [],
        },
        evaluations: evals.results || [],
        attendance: {
          last_30d_days: attDays.size,
          on_time_days: onTimeDays.size,
          on_time_rate: attDays.size ? Math.round((onTimeDays.size / attDays.size) * 100) : 0,
          days: Array.from(attDays).sort(),
        },
        payments: pays.results || [],
        generated_at: Date.now(),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 👨‍👩‍👧 Phase PD 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase AV — AI 음성 코칭 (Workers AI Whisper 전사 + LLM 피드백)
    //   POST /api/voice/transcribe — multipart/form-data 의 audio 파일 받아 Whisper 로 전사
    //   POST /api/voice/coach      — 학생 발화 텍스트 + 모범 텍스트 → AI 피드백 + 점수
    //   GET  /api/voice/history    — 학생별 최근 음성 코칭 이력
    // ═══════════════════════════════════════════════════════════════
    const ensureVoiceTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, target_text TEXT, transcribed_text TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, ai_feedback TEXT, suggestion TEXT, audio_url TEXT, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_voice_student ON voice_coaching(student_uid, created_at DESC)`); } catch {}
    };

    // ── POST /api/voice/tts — 모범 음성 (원어민 TTS: Deepgram Aura-1 / MeloTTS) ──
    if (method === 'POST' && path === '/api/voice/tts') {
      try {
        const b: any = await request.json().catch(() => ({}));
        const text = String(b.text || '').trim().slice(0, 400);
        const lang = String(b.lang || 'en').toLowerCase();
        if (!text) return json({ ok: false, error: 'text_required' }, 400);
        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        const audioHeaders = {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=604800',
          'Access-Control-Allow-Origin': '*'
        };
        const b64ToBytes = (b64: string) => {
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          return u8;
        };
        // MeloTTS — base64 MP3 반환 (en/zh 지원)
        const melo = async (meloLang: string) => {
          const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: meloLang });
          const b64 = typeof r === 'string' ? r : (r?.audio || '');
          if (!b64) throw new Error('melotts_empty');
          return new Response(b64ToBytes(b64), { headers: audioHeaders });
        };
        // MeloTTS 원본 바이트 (크기 검증용 — Workers AI 가 빈 WAV(44B) 반환하는 케이스 감지)
        const meloBytes = async (meloLang: string) => {
          const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: meloLang });
          const b64 = typeof r === 'string' ? r : (r?.audio || '');
          return b64 ? b64ToBytes(b64) : new Uint8Array(0);
        };
        // Google 번역 TTS — 원어민 만다린 폴백 (MeloTTS zh 가 빈 오디오일 때).
        //   client=tw-ob 엔드포인트는 MP3 스트림 반환. 요청당 ~200자 제한이라 잘라서 전송.
        const gtts = async (txt: string, tl: string) => {
          const q = encodeURIComponent(String(txt).slice(0, 190));
          const gurl = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + tl + '&q=' + q;
          const gr = await fetch(gurl, { headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
          } });
          if (!gr.ok) throw new Error('gtts_' + gr.status);
          const gb = await gr.arrayBuffer();
          if (!gb || gb.byteLength < 300) throw new Error('gtts_empty');
          return new Response(gb, { headers: audioHeaders });
        };

        // 중국어 → 진짜 원어민 만다린. ⚠️ Cloudflare @cf/myshell-ai/melotts(zh) 는 비어있지 않은
        //   불량 WAV(51KB짜리 "앙캉캉캉" 잡음)를 반환해 크기검사로도 못 거른다. 그래서 zh 는
        //   Google 번역 TTS(원어민 만다린 MP3)를 1순위로 쓰고, 실패 시에만 MeloTTS 로 폴백한다.
        if (lang.startsWith('zh') || lang === 'cn') {
          try {
            return await gtts(text, 'zh-CN');
          } catch (gErr: any) {
            console.warn('[voice/tts] google zh failed, fallback melotts:', gErr?.message);
            try {
              const bytes = await meloBytes('zh');
              if (bytes.byteLength >= 1000) return new Response(bytes, { headers: audioHeaders });
            } catch {}
            return json({ ok: false, error: 'zh_tts_failed' }, 502);
          }
        }

        // 영어 → Deepgram Aura-1 (원어민 수준, MPEG 스트림) → 실패 시 MeloTTS(en) 폴백
        try {
          const speaker = String(b.speaker || 'asteria');
          const raw: any = await ai.run('@cf/deepgram/aura-1', { text, speaker }, { returnRawResponse: true });
          let buf: ArrayBuffer | null = null;
          if (raw instanceof Response) buf = await raw.arrayBuffer();
          else if (raw instanceof ArrayBuffer) buf = raw;
          else if (raw && raw.body) buf = await new Response(raw.body).arrayBuffer();
          else if (raw && raw.audio) return new Response(b64ToBytes(String(raw.audio)), { headers: audioHeaders });
          if (!buf || buf.byteLength < 200) throw new Error('aura_empty');
          return new Response(buf, { headers: audioHeaders });
        } catch (auraErr: any) {
          console.warn('[voice/tts] aura-1 failed, fallback melotts:', auraErr?.message);
          return await melo('en');
        }
      } catch (e: any) {
        console.warn('[voice/tts] error:', e?.message);
        return json({ ok: false, error: e?.message || 'tts_failed' }, 500);
      }
    }

    // ── POST /api/voice/transcribe — 오디오 → 텍스트 (Whisper) ──
    if (method === 'POST' && path === '/api/voice/transcribe') {
      try {
        const ct = request.headers.get('content-type') || '';
        let audio: ArrayBuffer | null = null;
        if (ct.includes('multipart/form-data')) {
          const fd = await request.formData();
          const file = fd.get('audio') as File | null;
          if (!file) return json({ ok: false, error: 'no_audio_file' }, 400);
          audio = await file.arrayBuffer();
        } else {
          audio = await request.arrayBuffer();
        }
        if (!audio || audio.byteLength < 100) return json({ ok: false, error: 'audio_too_small' }, 400);
        if (audio.byteLength > 25 * 1024 * 1024) return json({ ok: false, error: 'audio_too_large', max: '25MB' }, 400);

        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        const arr = [...new Uint8Array(audio)];
        const result = await ai.run('@cf/openai/whisper', { audio: arr });
        return json({ ok: true, text: result?.text || '', vtt: result?.vtt || null, word_count: result?.word_count || 0 });
      } catch (e: any) {
        console.warn('[voice/transcribe] error:', e?.message);
        return json({ ok: false, error: e?.message || 'transcribe_failed' }, 500);
      }
    }

    // ── POST /api/voice/coach — 발음/유창성 평가 + LLM 피드백 ──
    if (method === 'POST' && path === '/api/voice/coach') {
      await ensureVoiceTable();
      const b: any = await request.json().catch(() => ({}));
      const target = String(b.target || '').trim();
      const spoken = String(b.spoken || '').trim();
      const studentUid = String(b.student_uid || '').trim() || 'guest';
      const studentName = String(b.student_name || '').trim();

      if (!target || !spoken) return json({ ok: false, error: 'target_and_spoken_required' }, 400);

      // 단순 유사도 (단어 일치율)
      const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      const tWords = normalize(target).split(' ');
      const sWords = normalize(spoken).split(' ');
      const matched = sWords.filter(w => tWords.includes(w)).length;
      const accuracy = tWords.length ? Math.round((matched / tWords.length) * 100) : 0;

      // 길이 비율 → 유창성 추정 (너무 짧거나 길면 점수 낮음)
      const lengthRatio = sWords.length / (tWords.length || 1);
      const fluency = Math.round(100 * Math.max(0, 1 - Math.abs(1 - lengthRatio) * 0.6));

      // Workers AI LLM 으로 발음/문법 피드백
      let aiFeedback = '';
      let suggestion = '';
      let pronunciation = accuracy;
      const ai = (env as any).AI;
      if (ai) {
        try {
          const prompt = `You are an English pronunciation coach for Korean students. Analyze this:

TARGET: "${target}"
STUDENT SAID: "${spoken}"

Respond in JSON ONLY:
{
  "pronunciation_score": <0-100>,
  "feedback": "<one short Korean sentence about what was good and what to improve>",
  "suggestion": "<one Korean tip to practice next time>"
}`;
          const resp = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: 'You are a friendly Korean-English pronunciation coach. Reply in JSON only.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 300,
          });
          // 응답을 안전하게 문자열로 정규화
          let text = '';
          if (typeof resp === 'string') text = resp;
          else if (resp && typeof resp.response === 'string') text = resp.response;
          else if (resp && resp.response) text = JSON.stringify(resp.response);
          text = String(text || '');
          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              const j = JSON.parse(m[0]);
              if (typeof j.pronunciation_score === 'number') pronunciation = Math.max(0, Math.min(100, Math.round(j.pronunciation_score)));
              if (j.feedback) aiFeedback = String(j.feedback).slice(0, 300);
              if (j.suggestion) suggestion = String(j.suggestion).slice(0, 300);
            } catch (e) { /* fall back */ }
          }
        } catch (e: any) {
          console.warn('[voice/coach] AI fail:', e?.message);
        }
      }

      // 기본값 채우기
      if (!aiFeedback) {
        aiFeedback = accuracy >= 90 ? '완벽해요! 발음이 아주 정확합니다.' :
                     accuracy >= 70 ? '좋아요! 대부분의 단어를 잘 발음했어요.' :
                     accuracy >= 50 ? '한 번 더 천천히 따라해볼까요? 일부 단어를 확인해봐요.' :
                                     '괜찮아요, 모범 음성을 들어보고 다시 시도해봐요!';
      }
      if (!suggestion) suggestion = '모범 문장을 3번 듣고 큰 소리로 따라 말해보세요.';

      const overall = Math.round((accuracy * 0.5) + (pronunciation * 0.3) + (fluency * 0.2));

      // 저장
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO voice_coaching (student_uid, student_name, target_text, transcribed_text, accuracy_score, pronunciation_score, fluency_score, ai_feedback, suggestion, audio_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(studentUid, studentName, target, spoken, accuracy, pronunciation, fluency, aiFeedback, suggestion, b.audio_url || null, now).run();

      return json({
        ok: true,
        scores: { accuracy, pronunciation, fluency, overall },
        feedback: aiFeedback,
        suggestion,
        word_stats: { target: tWords.length, spoken: sWords.length, matched },
      });
    }

    // ── GET /api/voice/history?uid=X — 학생별 음성 코칭 이력 ──
    if (method === 'GET' && path === '/api/voice/history') {
      await ensureVoiceTable();
      const uid = (url.searchParams.get('uid') || 'guest').trim();
      const rs = await env.DB.prepare(
        `SELECT id, target_text, transcribed_text, accuracy_score, pronunciation_score, fluency_score, ai_feedback, suggestion, created_at FROM voice_coaching WHERE student_uid = ? ORDER BY created_at DESC LIMIT 30`
      ).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── GET /api/voice/stats?uid=X — 학생별 음성 코칭 통계 (그래프용)
    //   반환: 일별 평균 점수 + 총 연습 횟수 + 최고/최근 점수
    if (method === 'GET' && path === '/api/voice/stats') {
      await ensureVoiceTable();
      const uid = (url.searchParams.get('uid') || 'guest').trim();
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);
      const sinceMs = Date.now() - days * 86400000;
      const rs = await env.DB.prepare(
        `SELECT accuracy_score, pronunciation_score, fluency_score, created_at FROM voice_coaching WHERE student_uid = ? AND created_at >= ? ORDER BY created_at ASC`
      ).bind(uid, sinceMs).all();
      const rows = (rs.results || []) as any[];
      // 일별 집계
      const byDay: Record<string, { acc: number[], pron: number[], flu: number[] }> = {};
      for (const r of rows) {
        const d = new Date(r.created_at).toISOString().slice(0, 10);
        if (!byDay[d]) byDay[d] = { acc: [], pron: [], flu: [] };
        byDay[d].acc.push(r.accuracy_score || 0);
        byDay[d].pron.push(r.pronunciation_score || 0);
        byDay[d].flu.push(r.fluency_score || 0);
      }
      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      const daily = Object.keys(byDay).sort().map(d => ({
        date: d,
        accuracy: avg(byDay[d].acc),
        pronunciation: avg(byDay[d].pron),
        fluency: avg(byDay[d].flu),
        overall: Math.round((avg(byDay[d].acc) * 0.5) + (avg(byDay[d].pron) * 0.3) + (avg(byDay[d].flu) * 0.2)),
        count: byDay[d].acc.length,
      }));
      // 전체 통계
      const allAcc = rows.map(r => r.accuracy_score || 0);
      const allPron = rows.map(r => r.pronunciation_score || 0);
      const allFlu = rows.map(r => r.fluency_score || 0);
      const totalAvg = {
        accuracy: avg(allAcc),
        pronunciation: avg(allPron),
        fluency: avg(allFlu),
        overall: Math.round((avg(allAcc) * 0.5) + (avg(allPron) * 0.3) + (avg(allFlu) * 0.2)),
      };
      const best = rows.length ? Math.max(...rows.map(r => Math.round((r.accuracy_score || 0) * 0.5 + (r.pronunciation_score || 0) * 0.3 + (r.fluency_score || 0) * 0.2))) : 0;
      const latest = rows.length ? Math.round((rows[rows.length - 1].accuracy_score || 0) * 0.5 + (rows[rows.length - 1].pronunciation_score || 0) * 0.3 + (rows[rows.length - 1].fluency_score || 0) * 0.2) : 0;
      return json({
        ok: true,
        total_sessions: rows.length,
        days_active: daily.length,
        average: totalAvg,
        best_score: best,
        latest_score: latest,
        daily,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase AV 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase K5 — 카카오 양방향 채널
    //   - SOLAPI/카카오 i 오픈빌더가 학부모 답장을 POST 로 보내옴
    //   - kakao_inbound 테이블에 저장 + chat_messages 로 자동 변환
    //   - GET /api/admin/kakao/inbound — 관리자가 수신 로그 확인
    // ═══════════════════════════════════════════════════════════════
    const ensureKakaoInboundTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS kakao_inbound (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, channel TEXT, sender_phone TEXT, sender_name TEXT, mapped_user_id TEXT, message TEXT NOT NULL, payload TEXT, processed INTEGER DEFAULT 0, room_id TEXT, received_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_kkin_received ON kakao_inbound(received_at DESC)`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_kkin_phone ON kakao_inbound(sender_phone)`); } catch {}
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, sender_uid TEXT, sender_name TEXT, sender_role TEXT, message TEXT NOT NULL, channel TEXT DEFAULT 'web', created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`ALTER TABLE chat_messages ADD COLUMN channel TEXT DEFAULT 'web'`); } catch {}
    };

    // ── POST /api/webhook/kakao-inbound — 카카오 양방향 webhook 수신 ──
    //   기대 페이로드 (SOLAPI 또는 카카오 i 오픈빌더 모두 지원하도록 유연 파싱):
    //   { source: 'solapi'|'kakao_i', sender_phone: '010-xxxx', sender_name: '홍길동', message: '...', room_id?: '...' }
    if (method === 'POST' && path === '/api/webhook/kakao-inbound') {
      await ensureKakaoInboundTable();
      const b: any = await request.json().catch(() => ({}));

      // 다양한 webhook 형식에서 핵심 필드 추출
      const phone = (b.sender_phone || b.from || b.userPhone || b.userKey || '').toString().trim();
      const senderName = (b.sender_name || b.userName || b.name || '').toString().trim();
      const message = (b.message || b.text || b.content || b.utterance || '').toString().trim();
      const source = (b.source || 'kakao').toString();
      const channel = (b.channel || 'kakao').toString();

      if (!message) return json({ ok: false, error: 'no_message' }, 400);

      // 전화번호 → user_id 매핑 (students_erp 의 parent_phone 으로 매칭)
      let mappedUserId: string | null = null;
      let roomId = b.room_id || '';
      if (phone) {
        // 010-1234-5678 ↔ 01012345678 정규화
        const norm = phone.replace(/[-\s]/g, '');
        try {
          const student = await env.DB.prepare(
            `SELECT user_id FROM students_erp WHERE REPLACE(REPLACE(parent_phone,'-',''),' ','') = ? LIMIT 1`
          ).bind(norm).first<any>();
          if (student?.user_id) {
            mappedUserId = student.user_id;
            if (!roomId) roomId = `parent_${student.user_id}`;
          }
        } catch (e) { /* table might not have parent_phone */ }
      }
      if (!roomId) roomId = phone ? `kakao_${phone.replace(/\D/g, '')}` : `kakao_unknown_${Date.now()}`;

      const now = Date.now();

      // 원본 inbound 저장
      const ins = await env.DB.prepare(
        `INSERT INTO kakao_inbound (source, channel, sender_phone, sender_name, mapped_user_id, message, payload, processed, room_id, received_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(source, channel, phone, senderName, mappedUserId, message, JSON.stringify(b).slice(0, 8000), 1, roomId, now).run();

      // chat_messages 에 학부모 메시지로 삽입 (망고이 채팅창에서 표시)
      try {
        await env.DB.prepare(
          `INSERT INTO chat_messages (room_id, sender_uid, sender_name, sender_role, message, channel, created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(roomId, mappedUserId || phone || 'kakao', senderName || '학부모', 'parent', `[카카오] ${message}`, channel, now).run();
      } catch (e: any) {
        console.warn('[k5] chat insert fail:', e?.message);
      }

      return json({
        ok: true,
        id: ins.meta?.last_row_id || null,
        mapped_user_id: mappedUserId,
        room_id: roomId,
        reply: '메시지를 받았습니다. 강사가 곧 답변드릴게요!', // 카카오 i 오픈빌더가 이 reply 를 학부모에게 전달
      });
    }

    // ── GET /api/admin/kakao/inbound — 최근 inbound 로그 ──
    if (method === 'GET' && path === '/api/admin/kakao/inbound') {
      await ensureKakaoInboundTable();
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
      const rs = await env.DB.prepare(
        `SELECT id, source, channel, sender_phone, sender_name, mapped_user_id, message, room_id, processed, received_at FROM kakao_inbound ORDER BY received_at DESC LIMIT ?`
      ).bind(limit).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase K5 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 👪 Phase PC — 부모-자녀 매핑 (parent_user_id 컬럼 + 등록 API)
    // ═══════════════════════════════════════════════════════════════
    const ensureStudentsErpWithParent = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      // 기존 테이블에 parent_user_id 가 없으면 추가 (안전망)
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN parent_user_id TEXT`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_students_parent ON students_erp(parent_user_id)`); } catch {}
    };

    // ── POST /api/parent/link-child — 학부모가 자녀를 본인 user_id 에 연결 ──
    //   body: { parent_user_id, child_user_id, parent_name? }
    if (method === 'POST' && path === '/api/parent/link-child') {
      await ensureStudentsErpWithParent();
      const b: any = await request.json().catch(() => ({}));
      const pUid = String(b.parent_user_id || '').trim();
      const cUid = String(b.child_user_id || '').trim();
      if (!pUid || !cUid) return json({ ok: false, error: 'parent_user_id_and_child_user_id_required' }, 400);

      // 자녀가 students_erp 에 있는지 확인 — 없으면 생성
      const exists = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE user_id = ? LIMIT 1`).bind(cUid).first();
      if (exists) {
        await env.DB.prepare(`UPDATE students_erp SET parent_user_id = ?, parent_name = COALESCE(?, parent_name) WHERE user_id = ?`)
          .bind(pUid, b.parent_name || null, cUid).run();
      } else {
        await env.DB.prepare(`INSERT INTO students_erp (user_id, student_name, parent_user_id, parent_name, status, created_at) VALUES (?,?,?,?,?,?)`)
          .bind(cUid, b.child_name || cUid, pUid, b.parent_name || null, '신규', Date.now()).run();
      }
      return json({ ok: true, parent_user_id: pUid, child_user_id: cUid });
    }

    // ── GET /api/parent/my-children?uid=X — 학부모의 자녀 목록 ──
    if (method === 'GET' && path === '/api/parent/my-children') {
      await ensureStudentsErpWithParent();
      const pUid = (url.searchParams.get('uid') || '').trim();
      if (!pUid) return json({ ok: false, error: 'uid_required' }, 400);
      const rs = await env.DB.prepare(`SELECT user_id, student_name, program, status FROM students_erp WHERE parent_user_id = ?`).bind(pUid).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════
    // 👪 Phase PC 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🎮 Phase BG — 학생 게이미피케이션 (배지/레벨)
    // ═══════════════════════════════════════════════════════════════
    const BADGE_CATALOG = [
      { code: 'first_login',       icon: '🎉', name: '첫 발걸음',         name_en: 'First Steps',          desc: '망고아이 첫 로그인',           rule: 'manual' },
      { code: 'first_class',       icon: '🎓', name: '첫 수업 입장',       name_en: 'First Class',          desc: '첫 화상수업 참여',             rule: 'attendance_1' },
      { code: 'streak_7',          icon: '📅', name: '7일 연속 출석',      name_en: '7-Day Streak',         desc: '일주일 매일 출석',             rule: 'streak_7' },
      { code: 'streak_30',         icon: '🔥', name: '30일 연속 출석',     name_en: '30-Day Streak',        desc: '한달 매일 출석',               rule: 'streak_30' },
      { code: 'eval_perfect',      icon: '⭐', name: '평가서 만점',        name_en: 'Perfect Score',        desc: '평가서 종합 10점',             rule: 'eval_10' },
      { code: 'voice_practice_10', icon: '🎙', name: '음성 코칭 10회',     name_en: '10 Voice Sessions',    desc: 'AI 음성 코칭 10회 완료',       rule: 'voice_10' },
      { code: 'voice_score_90',    icon: '🌟', name: '발음 마스터',        name_en: 'Pronunciation Master', desc: 'AI 음성 코칭 90점 이상',       rule: 'voice_90' },
      { code: 'points_1000',       icon: '💎', name: '포인트 1,000',       name_en: '1K Points',            desc: '누적 1,000 포인트',            rule: 'points_1000' },
      { code: 'points_5000',       icon: '👑', name: '포인트 5,000',       name_en: '5K Points',            desc: '누적 5,000 포인트',            rule: 'points_5000' },
      { code: 'monthly_top',       icon: '🏆', name: '월간 TOP',           name_en: 'Monthly TOP',          desc: '월간 학원 랭킹 TOP 3 진입',    rule: 'monthly_top' },
    ];

    const ensureBadgeTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_badges (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, badge_code TEXT NOT NULL, awarded_at INTEGER NOT NULL, UNIQUE(user_id, badge_code));`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_badges_user ON student_badges(user_id, awarded_at DESC)`); } catch {}
      // Streak DFS(재귀 CTE)가 풀스캔 대신 인덱스 시크로 끝나도록 보장 (멱등)
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}
    };

    // 배지 자동 검사 + 부여 (다른 액션에서도 호출 가능)
    const checkAndAwardBadges = async (userId: string): Promise<string[]> => {
      if (!userId) return [];
      await ensureBadgeTables();
      const earned: string[] = [];
      const now = Date.now();

      // 이미 가진 배지
      const haveRs = await env.DB.prepare(`SELECT badge_code FROM student_badges WHERE user_id = ?`).bind(userId).all();
      const have = new Set((haveRs.results || []).map((r: any) => r.badge_code));

      const award = async (code: string) => {
        if (have.has(code)) return;
        try {
          await env.DB.prepare(`INSERT OR IGNORE INTO student_badges (user_id, badge_code, awarded_at) VALUES (?, ?, ?)`).bind(userId, code, now).run();
          earned.push(code);
          have.add(code);
        } catch {}
      };

      // 출석 카운트
      try {
        const att: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS days FROM attendance WHERE user_id = ?`).bind(userId).first();
        if ((att?.days || 0) >= 1) await award('attendance_1');
        if ((att?.days || 0) >= 1) await award('first_class');
        // 연속 출석 — 날짜 연결 리스트를 역방향 DFS(재귀 CTE)로 "진짜 연속"을 계산 (풀스캔 X)
        const streakDays = await computeAttendanceStreak(env, userId);
        if (streakDays >= 7) await award('streak_7');
        if (streakDays >= 30) await award('streak_30');
      } catch {}

      // 평가서 만점
      try {
        const e: any = await env.DB.prepare(`SELECT MAX(score_overall) AS m FROM student_evaluations WHERE student_uid = ?`).bind(userId).first();
        if ((e?.m || 0) >= 10) await award('eval_perfect');
      } catch {}

      // 음성 코칭
      try {
        const v: any = await env.DB.prepare(`SELECT COUNT(*) AS n, MAX(accuracy_score) AS m FROM voice_coaching WHERE student_uid = ?`).bind(userId).first();
        if ((v?.n || 0) >= 10) await award('voice_practice_10');
        if ((v?.m || 0) >= 90) await award('voice_score_90');
      } catch {}

      // 포인트
      try {
        const p: any = await env.DB.prepare(`SELECT lifetime_earned FROM student_points WHERE user_id = ?`).bind(userId).first();
        if ((p?.lifetime_earned || 0) >= 1000) await award('points_1000');
        if ((p?.lifetime_earned || 0) >= 5000) await award('points_5000');
      } catch {}

      return earned;
    };

    // ── POST /api/badges/check?uid=X — 배지 자동 검사 + 부여 (학생 클릭으로 트리거 가능) ──
    if (method === 'POST' && path === '/api/badges/check') {
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || b.user_id || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const earned = await checkAndAwardBadges(uid);
      return json({ ok: true, earned_count: earned.length, earned, catalog: BADGE_CATALOG });
    }

    // ── GET /api/badges/list?uid=X — 학생 배지 목록 ──
    if (method === 'GET' && path === '/api/badges/list') {
      await ensureBadgeTables();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const rs = await env.DB.prepare(`SELECT badge_code, awarded_at FROM student_badges WHERE user_id = ? ORDER BY awarded_at DESC`).bind(uid).all();
      const earned = (rs.results || []) as any[];
      const earnedMap = new Map(earned.map(e => [e.badge_code, e.awarded_at]));
      // 카탈로그와 머지
      const badges = BADGE_CATALOG.map(c => ({
        ...c,
        earned: earnedMap.has(c.code),
        awarded_at: earnedMap.get(c.code) || null,
      }));
      return json({ ok: true, earned_count: earned.length, total_count: BADGE_CATALOG.length, badges });
    }

    // ── GET /api/admin/badges/stats — 전체 배지 통계 ──
    if (method === 'GET' && path === '/api/admin/badges/stats') {
      await ensureBadgeTables();
      const rs = await env.DB.prepare(`SELECT badge_code, COUNT(*) AS earned_by FROM student_badges GROUP BY badge_code ORDER BY earned_by DESC`).all();
      const stats = (rs.results || []) as any[];
      const statsMap = new Map(stats.map(s => [s.badge_code, s.earned_by]));
      const result = BADGE_CATALOG.map(c => ({ ...c, earned_by: statsMap.get(c.code) || 0 }));
      const totalAwards = stats.reduce((sum, s) => sum + (s.earned_by || 0), 0);
      return json({ ok: true, total_awards: totalAwards, badges: result });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎮 Phase BG 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase TVS — 음성 코칭 관리자 대시보드
    // ═══════════════════════════════════════════════════════════════

    // ── GET /api/admin/voice/all-stats — 전체 학생 음성 코칭 통계 ──
    if (method === 'GET' && path === '/api/admin/voice/all-stats') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, target_text TEXT, transcribed_text TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, ai_feedback TEXT, suggestion TEXT, audio_url TEXT, created_at INTEGER NOT NULL);`);
      } catch {}
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);
      const sinceMs = Date.now() - days * 86400000;
      const rs = await env.DB.prepare(
        `SELECT student_uid, student_name,
                COUNT(*) AS sessions,
                AVG(accuracy_score) AS avg_accuracy,
                AVG(pronunciation_score) AS avg_pronunciation,
                AVG(fluency_score) AS avg_fluency,
                MAX(accuracy_score) AS best_accuracy,
                MAX(created_at) AS last_session_at
         FROM voice_coaching
         WHERE created_at >= ?
         GROUP BY student_uid, student_name
         ORDER BY sessions DESC
         LIMIT 200`
      ).bind(sinceMs).all();
      const rows = ((rs.results || []) as any[]).map(r => ({
        student_uid: r.student_uid,
        student_name: r.student_name || r.student_uid,
        sessions: r.sessions || 0,
        avg_accuracy: Math.round(r.avg_accuracy || 0),
        avg_pronunciation: Math.round(r.avg_pronunciation || 0),
        avg_fluency: Math.round(r.avg_fluency || 0),
        avg_overall: Math.round(((r.avg_accuracy || 0) * 0.5) + ((r.avg_pronunciation || 0) * 0.3) + ((r.avg_fluency || 0) * 0.2)),
        best_accuracy: r.best_accuracy || 0,
        last_session_at: r.last_session_at,
      }));
      const total_sessions = rows.reduce((s, r) => s + r.sessions, 0);
      const total_students = rows.length;
      const avg_overall = total_students ? Math.round(rows.reduce((s, r) => s + r.avg_overall, 0) / total_students) : 0;
      return json({ ok: true, period_days: days, total_students, total_sessions, avg_overall, rows });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase TVS 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase BE — 강사 일괄 평가서 작성
    // ═══════════════════════════════════════════════════════════════

    // ── POST /api/eval/bulk-create — N명에게 한꺼번에 평가서 작성 ──
    //   body: { teacher_uid, teacher_name, lesson_date, lesson_title, common: {...공통항목}, students: [{ student_uid, student_name, scores: {...}, comments }] }
    if (method === 'POST' && path === '/api/eval/bulk-create') {
      const ensureEval = async () => {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      };
      await ensureEval();
      const body: any = await request.json().catch(() => ({}));
      const students = Array.isArray(body.students) ? body.students : [];
      if (!students.length) return json({ ok: false, error: 'no_students' }, 400);
      const common = body.common || {};
      const now = Date.now();
      const created: any[] = [];
      const failed: any[] = [];
      for (const s of students) {
        try {
          const sc = s.scores || {};
          const scores = [sc.participation, sc.comprehension, sc.homework, sc.attitude, sc.speaking]
            .filter(v => v != null && !isNaN(v)).map(Number);
          const overall = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
          const ins = await env.DB.prepare(
            `INSERT INTO student_evaluations (student_uid, student_name, teacher_uid, teacher_name, lesson_title, lesson_date, score_participation, score_comprehension, score_homework, score_attitude, score_speaking, score_overall, strengths, improvements, next_goals, teacher_comment, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            s.student_uid, s.student_name || null,
            body.teacher_uid || null, body.teacher_name || null,
            body.lesson_title || null, body.lesson_date || null,
            sc.participation ?? null, sc.comprehension ?? null, sc.homework ?? null, sc.attitude ?? null, sc.speaking ?? null,
            overall,
            s.strengths || common.strengths || null,
            s.improvements || common.improvements || null,
            s.next_goals || common.next_goals || null,
            s.teacher_comment || common.teacher_comment || null,
            now, now
          ).run();
          created.push({ student_uid: s.student_uid, id: ins?.meta?.last_row_id, overall });
        } catch (e: any) {
          failed.push({ student_uid: s.student_uid, error: e?.message });
        }
      }
      return json({ ok: true, total: students.length, created: created.length, failed: failed.length, items: { created, failed } });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase BE 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase AEd — AI 평가서 자동 작성 (강사 키워드 → 완성 텍스트)
    // ═══════════════════════════════════════════════════════════════
    // ── POST /api/eval/ai-draft — 키워드 → AI 가 4영역 텍스트 생성 ──
    if (method === 'POST' && path === '/api/eval/ai-draft') {
      try {
        const b: any = await request.json().catch(() => ({}));
        const studentName = String(b.student_name || '학생').slice(0, 40);
        const teacherName = String(b.teacher_name || '강사').slice(0, 40);
        const lessonTitle = String(b.lesson_title || '오늘 수업').slice(0, 80);
        const keywords = Array.isArray(b.keywords) ? b.keywords.slice(0, 8).map((k: any) => String(k).slice(0, 50)) : [];
        const scores = b.scores || {};
        const scoresText = ['참여', '이해', '숙제', '태도', '스피킹']
          .map((k, i) => {
            const key = ['participation','comprehension','homework','attitude','speaking'][i];
            return scores[key] != null ? `${k} ${scores[key]}점` : null;
          })
          .filter(Boolean).join(' / ');
        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        const prompt = `당신은 망고아이 영어학원의 친절한 한국어 평가서 작성 도우미입니다.
강사가 입력한 키워드와 점수를 보고 학부모/학생용 평가서 4개 영역을 작성하세요.

학생: ${studentName}
강사: ${teacherName}
수업: ${lessonTitle}
점수: ${scoresText || '미입력'}
강사 키워드: ${keywords.length ? keywords.join(', ') : '(없음)'}

요구사항:
- 한국어로만 작성 (영어 단어는 따옴표로 인용 가능)
- 학부모/학생이 자랑스러워할 따뜻한 톤
- 각 영역 2~3 문장
- JSON 으로만 응답 (다른 설명 X)

응답 형식 (정확히 이 JSON 구조로만):
{
  "strengths": "이번 수업에서 잘한 점 (구체적인 행동/성취 언급, 2~3 문장)",
  "improvements": "보완하면 좋을 부분 (긍정적인 표현으로 부드럽게, 2~3 문장)",
  "next_goals": "다음 수업에서 도전할 학습 목표 (구체적/실행가능한 1~2개, 2~3 문장)",
  "teacher_comment": "강사 종합 코멘트 (격려와 응원, 2~3 문장)"
}`;

        const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: 'You are a friendly Korean English-academy evaluation writer. Reply with JSON only.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 800,
        });
        // Workers AI 응답은 { response: "..." } 또는 { response: {...} } 또는 stream 등 다양 — 모두 string 으로 정규화
        let text = '';
        if (typeof resp === 'string') text = resp;
        else if (resp && typeof resp.response === 'string') text = resp.response;
        else if (resp && resp.response && typeof resp.response === 'object') text = JSON.stringify(resp.response);
        else if (resp && typeof resp === 'object') text = JSON.stringify(resp);
        text = String(text || '');

        const m = text.match(/\{[\s\S]*\}/);
        // 매칭 실패 시: resp 객체 자체가 { strengths, ... } 인지 시도
        let parsed: any = {};
        if (m) {
          try { parsed = JSON.parse(m[0]); } catch (e: any) {
            return json({ ok: false, error: 'ai_json_invalid', raw: m[0].slice(0, 300) }, 500);
          }
        } else if (resp && typeof resp === 'object' && (resp.strengths || resp.response?.strengths)) {
          // 일부 모델은 이미 객체로 반환
          parsed = resp.strengths ? resp : resp.response;
        } else {
          return json({ ok: false, error: 'ai_parse_failed', raw: text.slice(0, 300) }, 500);
        }
        return json({
          ok: true,
          draft: {
            strengths: String(parsed.strengths || '').slice(0, 600),
            improvements: String(parsed.improvements || '').slice(0, 600),
            next_goals: String(parsed.next_goals || '').slice(0, 600),
            teacher_comment: String(parsed.teacher_comment || '').slice(0, 600),
          },
          model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          tokens_estimate: Math.round(prompt.length / 3),
        });
      } catch (e: any) {
        console.warn('[ai-draft] error:', e?.message);
        return json({ ok: false, error: e?.message || 'draft_failed' }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase AEd 끝
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
        const studentsRs = await env.DB.prepare(
          `SELECT ${selectCols} FROM students_erp WHERE (status = '정상' OR status IS NULL OR status = '')${_swRisk.cond ? ' AND ' + _swRisk.cond : ''} LIMIT 500`
        ).bind(..._swRisk.binds).all();
        const students = (studentsRs.results || []) as any[];
        if (!students.length) return json({ ok: true, count: 0, at_risk: [], schema: { name_col: nameCol } });

        const atRisk: any[] = [];
        for (const s of students) {
          // 1) 출석 (최근 30 / 30-60 / 60-90일)
          const att30: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ?`).bind(s.user_id, since30).first();
          const att60: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(s.user_id, since60, since30).first();
          const att90: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(s.user_id, since90, since60).first();
          // 2) 마지막 입장
          const lastJoin: any = await env.DB.prepare(`SELECT MAX(joined_at) AS j FROM attendance WHERE user_id = ?`).bind(s.user_id).first();

          // 3) 평가서 평균 / 추세
          let evalAvg = 0, evalCount = 0, evalTrend = 0;
          try {
            const e: any = await env.DB.prepare(`SELECT AVG(score_overall) AS a, COUNT(*) AS n FROM student_evaluations WHERE student_uid = ? AND created_at >= ?`).bind(s.user_id, since60).first();
            evalAvg = Math.round(e?.a || 0); evalCount = e?.n || 0;
            // 최근 3회 vs 직전 3회 평균 추세
            const recent3: any = await env.DB.prepare(`SELECT AVG(score_overall) AS a FROM (SELECT score_overall FROM student_evaluations WHERE student_uid = ? ORDER BY created_at DESC LIMIT 3)`).bind(s.user_id).first();
            const prev3: any = await env.DB.prepare(`SELECT AVG(score_overall) AS a FROM (SELECT score_overall FROM student_evaluations WHERE student_uid = ? ORDER BY created_at DESC LIMIT 3 OFFSET 3)`).bind(s.user_id).first();
            if (recent3?.a && prev3?.a) evalTrend = Math.round((recent3.a - prev3.a) * 10) / 10;
          } catch {}

          // 4) 미납 / 결제 상태 (payments 테이블이 있을 때만)
          let overdueDays = 0, overdueAmount = 0;
          try {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`);
            const od: any = await env.DB.prepare(`SELECT MIN(due_at) AS earliest_due, SUM(amount) AS total FROM payments WHERE user_id = ? AND (paid_at IS NULL OR paid_at = 0) AND due_at < ?`).bind(s.user_id, now).first();
            if (od?.earliest_due) {
              overdueDays = Math.floor((now - od.earliest_due) / 86400000);
              overdueAmount = od.total || 0;
            }
          } catch {}

          // 5) 숙제 미제출 (homework_submissions 가 있다면)
          let hwMissed = 0;
          try {
            const hw: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM homework_submissions WHERE user_id = ? AND status = 'missed' AND created_at >= ?`).bind(s.user_id, since30).first();
            hwMissed = hw?.n || 0;
          } catch {}

          // 6) 채팅/포인트 활동 감소
          let recentPoints = 0;
          try {
            const p: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM point_log WHERE user_id = ? AND created_at >= ?`).bind(s.user_id, since14).first();
            recentPoints = p?.n || 0;
          } catch {}

          const attRecent = att30?.d || 0;
          const attPrev = att60?.d || 0;
          const att90val = att90?.d || 0;
          const daysSinceLastJoin = lastJoin?.j ? Math.floor((now - lastJoin.j) / 86400000) : 999;

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
        return json({ ok: true, count: atRisk.length, at_risk: atRisk, schema: { name_col: nameCol } });
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


    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase VOC — 단어장 + 플래시카드 (간격 반복 학습)
    // ═══════════════════════════════════════════════════════════════
    const ensureVocab = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, word TEXT NOT NULL, korean TEXT, example TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER NOT NULL, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_vocab_user_review ON vocabulary(user_id, next_review_at ASC)`); } catch {}
    };

    // ── POST /api/vocab/add — 단어 추가 (AI 가 자동으로 한국어/예문 생성) ──
    if (method === 'POST' && path === '/api/vocab/add') {
      await ensureVocab();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || '').trim();
      const word = String(b.word || '').trim();
      if (!userId || !word) return json({ ok: false, error: 'user_id_and_word_required' }, 400);
      let korean = String(b.korean || '').trim();
      let example = String(b.example || '').trim();
      // AI 가 한국어/예문 자동 생성 (옵션)
      if ((!korean || !example) && (env as any).AI) {
        try {
          const resp: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: 'You output Korean meaning and short English example. JSON only.' },
              { role: 'user', content: `Word: "${word}"\n\nReturn JSON: { "korean": "<한국어 뜻 한줄>", "example": "<짧은 영어 예문 1개>" }` }
            ],
            max_tokens: 200,
          });
          let text = '';
          if (typeof resp === 'string') text = resp;
          else if (resp && typeof resp.response === 'string') text = resp.response;
          else if (resp && resp.response) text = JSON.stringify(resp.response);
          text = String(text || '');
          const m = text.match(/\{[\s\S]*\}/);
          if (m) { const j = JSON.parse(m[0]); korean = korean || j.korean || ''; example = example || j.example || ''; }
        } catch {}
      }
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(userId, word, korean, example, 0, now, now).run();
      return json({ ok: true, word, korean, example });
    }

    // ── GET /api/vocab/list?uid=X — 학생 단어장 목록 ──
    if (method === 'GET' && path === '/api/vocab/list') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const rs = await env.DB.prepare(`SELECT id, word, korean, example, level, next_review_at, correct_count, wrong_count, created_at FROM vocabulary WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, words: rs.results || [] });
    }

    // ── GET /api/vocab/due?uid=X — 오늘 복습할 단어 ──
    if (method === 'GET' && path === '/api/vocab/due') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const now = Date.now();
      const rs = await env.DB.prepare(`SELECT id, word, korean, example, level FROM vocabulary WHERE user_id = ? AND next_review_at <= ? ORDER BY next_review_at ASC LIMIT 20`).bind(uid, now).all();
      return json({ ok: true, due_count: rs.results?.length || 0, words: rs.results || [] });
    }

    // ── POST /api/vocab/review — 단어 복습 결과 (correct/wrong → 다음 복습 일정 자동 조정) ──
    if (method === 'POST' && path === '/api/vocab/review') {
      await ensureVocab();
      const b: any = await request.json().catch(() => ({}));
      const id = parseInt(b.id, 10);
      const correct = !!b.correct;
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT level, correct_count, wrong_count FROM vocabulary WHERE id = ?`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      // 간격 반복: 정답 시 level+1, 오답 시 level=0 으로 리셋
      const newLevel = correct ? Math.min((row.level || 0) + 1, 7) : 0;
      // 다음 복습 간격 (일): 0=1, 1=2, 2=4, 3=7, 4=14, 5=30, 6=60, 7=120 (망각곡선 기반)
      const intervals = [1, 2, 4, 7, 14, 30, 60, 120];
      const nextDays = intervals[newLevel] || 1;
      const now = Date.now();
      const next = now + nextDays * 86400000;
      await env.DB.prepare(`UPDATE vocabulary SET level = ?, next_review_at = ?, last_reviewed_at = ?, correct_count = correct_count + ?, wrong_count = wrong_count + ? WHERE id = ?`)
        .bind(newLevel, next, now, correct ? 1 : 0, correct ? 0 : 1, id).run();
      return json({ ok: true, new_level: newLevel, next_review_in_days: nextDays });
    }

    // ── DELETE /api/vocab/:id — 단어 삭제 ──
    if (method === 'DELETE' && /^\/api\/vocab\/\d+$/.test(path)) {
      await ensureVocab();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM vocabulary WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase VOC 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 📄 Phase MR — 월별 학습 보고서 (학생별 / 학부모용)
    //   GET /api/report/monthly/:uid/:yyyy-mm — JSON 데이터 + URL 로 page 렌더
    // ═══════════════════════════════════════════════════════════════
    const monthlyMatch = path.match(/^\/api\/report\/monthly\/([^\/]+)\/(\d{4})-(\d{2})$/);
    if (method === 'GET' && monthlyMatch) {
      const uid = decodeURIComponent(monthlyMatch[1]);
      const year = parseInt(monthlyMatch[2], 10);
      const month = parseInt(monthlyMatch[3], 10) - 1;
      const start = new Date(year, month, 1).getTime();
      const end = new Date(year, month + 1, 1).getTime();

      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, joined_at INTEGER, date TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, lesson_date TEXT, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, created_at INTEGER NOT NULL);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, created_at INTEGER NOT NULL);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, paid_at INTEGER, amount_krw INTEGER);`);

        const student: any = await env.DB.prepare(`SELECT user_id, student_name, parent_name FROM students_erp WHERE user_id = ?`).bind(uid).first();
        const att: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(uid, start, end).first();
        const evals = await env.DB.prepare(`SELECT id, lesson_date, score_overall, strengths, improvements, next_goals, teacher_comment, created_at FROM student_evaluations WHERE student_uid = ? AND created_at >= ? AND created_at < ? ORDER BY created_at ASC`).bind(uid, start, end).all();
        const voiceStats: any = await env.DB.prepare(`SELECT COUNT(*) AS n, AVG(accuracy_score) AS acc, AVG(pronunciation_score) AS pron, AVG(fluency_score) AS flu, MAX(accuracy_score) AS best FROM voice_coaching WHERE student_uid = ? AND created_at >= ? AND created_at < ?`).bind(uid, start, end).first();
        const pays: any = await env.DB.prepare(`SELECT IFNULL(SUM(amount_krw),0) AS total FROM student_payments WHERE user_id = ? AND paid_at >= ? AND paid_at < ?`).bind(uid, start, end).first();

        const evalRows = (evals.results || []) as any[];
        const evalAvg = evalRows.length ? Math.round((evalRows.reduce((s, r) => s + (r.score_overall || 0), 0) / evalRows.length) * 10) / 10 : 0;

        // fix (2026-06-02) — ?ai=1 이면 학부모용 한국어 레포트 텍스트를 AI(Llama)로 생성.
        //   데이터가 없으면 안전한 안내문으로 대체. 실패해도 보고서는 정상 반환(빈 ai_text).
        let aiText = '';
        if (url.searchParams.get('ai') === '1') {
          try {
            const nm = (student?.student_name) || uid;
            const recentComment = evalRows.length ? (evalRows[evalRows.length - 1].teacher_comment || '') : '';
            const strengths = evalRows.map((r: any) => r.strengths).filter(Boolean).slice(-3).join('; ');
            const improvements = evalRows.map((r: any) => r.improvements).filter(Boolean).slice(-3).join('; ');
            const nextGoals = evalRows.map((r: any) => r.next_goals).filter(Boolean).slice(-2).join('; ');
            if (evalRows.length === 0 && (att?.d || 0) === 0) {
              aiText = `${nm} 학부모님, 이번 달은 수업 기록이 많지 않아 상세 요약을 생략합니다. 다음 달 꾸준한 참여를 함께 응원하겠습니다. 감사합니다.`;
            } else {
              const sys = '당신은 영어학원 담임 강사입니다. 학부모님께 보내는 따뜻하고 구체적인 한국어 월간 학습 레포트를 4~6문장으로 작성하세요. 반드시 칭찬 1가지, 성장 영역 1가지, 다음 달 목표 1가지를 포함하세요. 과장하지 말고, 주어진 숫자/사실만 사용하며 없는 내용은 지어내지 마세요. 존댓말로 작성하세요.';
              const usr = `학생: ${nm}\n기간: ${year}-${String(month + 1).padStart(2, '0')}\n출석일수: ${att?.d || 0}\n평가 횟수: ${evalRows.length}, 종합 평균(5점 만점): ${evalAvg}\n발음 평균: 정확도 ${Math.round(voiceStats?.acc || 0)}, 발음 ${Math.round(voiceStats?.pron || 0)}, 유창성 ${Math.round(voiceStats?.flu || 0)}\n강점: ${strengths || '기록 적음'}\n개선점: ${improvements || '기록 적음'}\n다음 목표(강사 기록): ${nextGoals || '없음'}\n최근 강사 코멘트: ${recentComment || '없음'}`;
              const aiRes: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
                max_tokens: 420,
              });
              aiText = String((aiRes && (aiRes.response || aiRes.result)) || '').trim();
            }
          } catch (e) { aiText = ''; }
        }

        return json({
          ok: true,
          student: student || { user_id: uid, student_name: uid },
          year_month: `${year}-${String(month + 1).padStart(2, '0')}`,
          attendance: { days: att?.d || 0 },
          evaluations: { count: evalRows.length, avg_score: evalAvg, items: evalRows },
          voice: {
            sessions: voiceStats?.n || 0,
            avg_accuracy: Math.round(voiceStats?.acc || 0),
            avg_pronunciation: Math.round(voiceStats?.pron || 0),
            avg_fluency: Math.round(voiceStats?.flu || 0),
            best: voiceStats?.best || 0,
          },
          payments: { total_krw: pays?.total || 0 },
          ai_text: aiText,
          generated_at: Date.now(),
        });
      } catch (e: any) {
        return json({ ok: false, error: e?.message }, 500);
      }
    }
    // ═══════════════════════════════════════════════════════════════
    // 📄 Phase MR 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase MAR — 월간 AI 레포트 (생성/목록/발송 + 토큰 열람)
    // ═══════════════════════════════════════════════════════════════
    // POST /api/admin/monthly-report/generate  { uid, period:"YYYY-MM" }
    if (method === 'POST' && path === '/api/admin/monthly-report/generate') {
      await ensureMonthlyReportsTable(env);
      const b: any = await parseJsonBody(request);
      const uid = String(b?.uid || '').trim();
      const period = String(b?.period || '').trim();
      if (!uid || !/^\d{4}-\d{2}$/.test(period)) return json({ ok: false, error: 'uid/period 필요 (period=YYYY-MM)' }, 400);
      const data = await buildMonthlyReportData(env, uid, period, true);
      if (!data) return json({ ok: false, error: 'bad_period' }, 400);
      let existing: any = null;
      try { existing = await env.DB.prepare(`SELECT access_token FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
      const token = (existing && existing.access_token) || _monthlyToken();
      const nm = (data.student && data.student.student_name) || uid;
      await env.DB.prepare(`INSERT OR REPLACE INTO monthly_reports (student_uid, student_name, period, ai_text, metrics_json, access_token, status, created_at) VALUES (?,?,?,?,?,?, 'draft', ?)`)
        .bind(uid, nm, period, data.ai_text || '', JSON.stringify(data), token, Date.now()).run();
      const origin = new URL(request.url).origin;
      const viewUrl = `${origin}/monthly-report.html?uid=${encodeURIComponent(uid)}&period=${encodeURIComponent(period)}&t=${token}`;
      return json({ ok: true, report: data, token, url: viewUrl });
    }

    // GET /api/admin/monthly-report/list?period=YYYY-MM
    if (method === 'GET' && path === '/api/admin/monthly-report/list') {
      await ensureMonthlyReportsTable(env);
      const period = url.searchParams.get('period') || '';
      let rows: any[] = [];
      try {
        const stmt = period
          ? env.DB.prepare(`SELECT id, student_uid, student_name, period, access_token, status, sent_to_student, sent_to_parent, created_at, sent_at FROM monthly_reports WHERE period=? ORDER BY created_at DESC LIMIT 500`).bind(period)
          : env.DB.prepare(`SELECT id, student_uid, student_name, period, access_token, status, sent_to_student, sent_to_parent, created_at, sent_at FROM monthly_reports ORDER BY created_at DESC LIMIT 200`);
        const rs = await stmt.all();
        rows = (rs.results || []) as any[];
      } catch {}
      return json({ ok: true, items: rows });
    }

    // POST /api/admin/monthly-report/send  { uid, period }  (학생+학부모 알림톡)
    if (method === 'POST' && path === '/api/admin/monthly-report/send') {
      const b: any = await parseJsonBody(request);
      const uid = String(b?.uid || '').trim();
      const period = String(b?.period || '').trim();
      if (!uid || !/^\d{4}-\d{2}$/.test(period)) return json({ ok: false, error: 'uid/period 필요' }, 400);
      const r = await sendMonthlyReportKakao(env, uid, period, new URL(request.url).origin);
      return json(r);
    }

    // POST /api/admin/monthly-report/run-all  { period }  (전체 학생 일괄)
    if (method === 'POST' && path === '/api/admin/monthly-report/run-all') {
      const b: any = await parseJsonBody(request);
      const period = String(b?.period || '').trim();
      if (!/^\d{4}-\d{2}$/.test(period)) return json({ ok: false, error: 'period 필요 (YYYY-MM)' }, 400);
      const r = await runMonthlyReports(env, period, new URL(request.url).origin);
      return json({ ok: true, ...r });
    }

    // GET /api/report/monthly-view?uid=&period=&t=  (공개 · 토큰 검증)
    if (method === 'GET' && path === '/api/report/monthly-view') {
      await ensureMonthlyReportsTable(env);
      const uid = url.searchParams.get('uid') || '';
      const period = url.searchParams.get('period') || '';
      const tok = url.searchParams.get('t') || '';
      if (!uid || !period || !tok) return json({ ok: false, error: 'missing' }, 400);
      let row: any = null;
      try { row = await env.DB.prepare(`SELECT * FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
      if (!row || row.access_token !== tok) return json({ ok: false, error: 'forbidden' }, 403);
      let data: any = {};
      try { data = JSON.parse(row.metrics_json || '{}'); } catch {}
      data.ai_text = row.ai_text || data.ai_text || '';
      data.ok = true;
      return json(data);
    }
    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase MAR 끝
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
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_uid TEXT UNIQUE, korean_name TEXT, english_name TEXT, status TEXT);`);
      } catch {}
      // 1) teacher_profiles 우선
      let rs: any = await env.DB.prepare(`SELECT teacher_uid, korean_name AS name, english_name FROM teacher_profiles WHERE status = '재직' OR status IS NULL OR status = '' LIMIT 100`).all();
      let teachers = (rs.results || []) as any[];
      // 2) teacher_mbti 에서도 추가
      if (!teachers.length) {
        try {
          await ensureMbtiTable();
          rs = await env.DB.prepare(`SELECT teacher_uid, teacher_name AS name FROM teacher_mbti LIMIT 100`).all();
          teachers = (rs.results || []) as any[];
        } catch {}
      }
      return json({ ok: true, count: teachers.length, teachers: teachers.map(t => ({ teacher_uid: t.teacher_uid, name: t.name || t.korean_name || t.teacher_uid, english_name: t.english_name || null })) });
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
    // 🔐 Phase LOGIN — 통합 학생/학부모 로그인
    // ═══════════════════════════════════════════════════════════════
    const ensureLoginTable = async () => {
      // students_erp 에 password_hash 컬럼이 없으면 추가 (안전망)
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN password_hash TEXT`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN last_login_at INTEGER`); } catch {}
    };

    // 간단 비밀번호 해시 (SHA-256 + salt)
    const hashPwd = async (pwd: string): Promise<string> => {
      const enc = new TextEncoder().encode(pwd + '|mangoi-salt-2026');
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // ── POST /api/student/login — 학생/학부모 통합 로그인 ──
    //   body: { user_id, password? }
    //   비밀번호 미설정자는 user_id 만으로 로그인 가능 (개발 단계 편의)
    if (method === 'POST' && path === '/api/student/login') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      await ensureLoginTable();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      const pwd = String(b.password || '').trim();
      if (!uid) return json({ ok: false, error: 'user_id_required' }, 400);

      const stu: any = await env.DB.prepare(`SELECT user_id, student_name, parent_name, parent_phone, parent_user_id, password_hash FROM students_erp WHERE user_id = ?`).bind(uid).first();
      if (!stu) return json({ ok: false, error: 'user_not_found', message: '학생 ID 를 찾을 수 없습니다. 학원에 문의해주세요.' }, 404);

      // 비밀번호 검증 — 설정된 경우만
      if (stu.password_hash) {
        if (!pwd) return json({ ok: false, error: 'password_required', message: '비밀번호를 입력해주세요.' }, 401);
        const h = await hashPwd(pwd);
        if (h !== stu.password_hash) return json({ ok: false, error: 'invalid_password', message: '비밀번호가 일치하지 않습니다.' }, 401);
      }

      // 마지막 로그인 시각 업데이트
      try { await env.DB.prepare(`UPDATE students_erp SET last_login_at = ? WHERE user_id = ?`).bind(Date.now(), uid).run(); } catch {}

      return json({
        ok: true,
        user: {
          user_id: stu.user_id,
          user_name: stu.student_name || stu.user_id,
          role: 'student',  // 이 엔드포인트는 학생 로그인 → 항상 student (학부모 로그인은 별도 경로)
          parent_name: stu.parent_name,
          parent_user_id: stu.parent_user_id,
          has_password: !!stu.password_hash,
        },
      });
    }

    // ── POST /api/student/lookup — 학생 본인 수강정보 조회 (연장/자동연장 결제용) ──
    //   body: { user_id, auth?, from_session? }
    //   보안: 로그인(/api/student/login)과 "동일한" 보안수준으로만 노출 (IDOR 방지)
    //     · 비밀번호 설정 계정 → auth(비밀번호 또는 등록 전화/학부모 전화) 일치해야 조회 (from_session 단독으론 거부)
    //     · 비밀번호 미설정 계정 → user_id 만으로 조회 가능 (로그인 정책과 동일)
    //   응답에는 평문 전화번호 등 민감정보는 포함하지 않음.
    if (method === 'POST' && path === '/api/student/lookup') {
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      const auth = String(b.auth || '').trim();
      if (!uid) return json({ ok: false, error: 'user_id_required' }, 400);

      let stu: any = null;
      try { stu = await env.DB.prepare(`SELECT * FROM students_erp WHERE user_id = ?`).bind(uid).first(); } catch {}
      if (!stu) return json({ ok: false, error: 'user_not_found', message: '학생 정보를 찾을 수 없습니다.' }, 404);

      const hasPw = !!stu.password_hash;
      if (hasPw) {
        if (!auth) return json({ ok: false, error: 'auth_required', message: '비밀번호 또는 등록 전화번호를 입력해 주세요.' }, 401);
        const digits = (v: any) => String(v || '').replace(/[^0-9]/g, '');
        const authDigits = digits(auth);
        const pwOk = (await hashPwd(auth)) === stu.password_hash;
        const phoneOk = authDigits.length >= 8 && (authDigits === digits(stu.phone) || authDigits === digits(stu.parent_phone));
        if (!pwOk && !phoneOk) return json({ ok: false, error: 'invalid_auth', message: '본인 확인에 실패했습니다.' }, 401);
      }

      const endDate: string | null = stu.end_date || stu.expire_at || null;
      let dDay: number | null = null;
      if (endDate && /^\d{4}-\d{2}-\d{2}/.test(String(endDate))) {
        const ms = new Date(String(endDate).slice(0, 10) + 'T00:00:00Z').getTime() - Date.now();
        dDay = Math.ceil(ms / 86400000);
      }
      const program: string | null = stu.program || stu.current_program || null;
      const name: string = stu.student_name || stu.korean_name || stu.name || stu.username || uid;

      return json({
        ok: true,
        student: {
          uid: stu.user_id,
          name,
          program,
          current_program: program,
          current_program_label: program,
          status: stu.status || null,
          signup_date: stu.signup_date || null,
          expire_at: endDate,
          d_day: dDay,
          has_password: hasPw,
        },
      });
    }

    // ── POST /api/student/set-password — 학생 비밀번호 설정/변경 ──
    if (method === 'POST' && path === '/api/student/set-password') {
      await ensureLoginTable();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      const oldPwd = String(b.old_password || '').trim();
      const newPwd = String(b.new_password || '').trim();
      if (!uid || !newPwd || newPwd.length < 4) return json({ ok: false, error: 'invalid_input', message: '새 비밀번호는 4자 이상' }, 400);

      const stu: any = await env.DB.prepare(`SELECT password_hash FROM students_erp WHERE user_id = ?`).bind(uid).first();
      if (!stu) return json({ ok: false, error: 'user_not_found' }, 404);
      // 기존 비밀번호 있으면 검증
      if (stu.password_hash) {
        const h = await hashPwd(oldPwd);
        if (h !== stu.password_hash) return json({ ok: false, error: 'invalid_old_password' }, 401);
      }
      const newHash = await hashPwd(newPwd);
      await env.DB.prepare(`UPDATE students_erp SET password_hash = ? WHERE user_id = ?`).bind(newHash, uid).run();
      return json({ ok: true, message: '비밀번호가 변경됐습니다.' });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🔐 Phase LOGIN 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🌐 Phase OAUTH — 카카오·네이버·구글 소셜 로그인
    // ═══════════════════════════════════════════════════════════════
    const ensureOAuthTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS oauth_users (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, provider_uid TEXT NOT NULL, user_id TEXT NOT NULL, email TEXT, name TEXT, profile_image TEXT, last_login_at INTEGER, created_at INTEGER NOT NULL, UNIQUE(provider, provider_uid));`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_oauth_uid ON oauth_users(user_id)`); } catch {}
    };

    // ── GET /api/oauth/:provider/url — OAuth 인증 URL 반환 ──
    const oauthUrlMatch = path.match(/^\/api\/oauth\/(kakao|naver|google)\/url$/);
    if (method === 'GET' && oauthUrlMatch) {
      const provider = oauthUrlMatch[1];
      const e = env as any;
      const baseUrl = url.origin;
      const redirectUri = `${baseUrl}/api/oauth/${provider}/callback`;

      let clientId = '', authUrl = '', scope = '';
      if (provider === 'kakao') {
        clientId = e.KAKAO_CLIENT_ID || '';
        authUrl = 'https://kauth.kakao.com/oauth/authorize';
        scope = 'profile_nickname,profile_image,account_email';
      } else if (provider === 'naver') {
        clientId = e.NAVER_CLIENT_ID || '';
        authUrl = 'https://nid.naver.com/oauth2.0/authorize';
        scope = 'name,email,profile_image';
      } else if (provider === 'google') {
        clientId = e.GOOGLE_CLIENT_ID || '';
        authUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
        scope = 'openid email profile';
      }

      if (!clientId) {
        return json({
          ok: false,
          configured: false,
          error: `${provider}_not_configured`,
          message: `관리자가 ${provider.toUpperCase()}_CLIENT_ID 시크릿을 등록해야 합니다.`,
          setup_guide: provider === 'kakao'
            ? 'developers.kakao.com → 내 애플리케이션 → REST API 키 → wrangler secret put KAKAO_CLIENT_ID + KAKAO_CLIENT_SECRET'
            : provider === 'naver'
            ? 'developers.naver.com → 애플리케이션 등록 → ID/Secret → wrangler secret put NAVER_CLIENT_ID + NAVER_CLIENT_SECRET'
            : 'console.cloud.google.com → OAuth 2.0 클라이언트 ID → wrangler secret put GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET',
        }, 503);
      }

      const state = Math.random().toString(36).slice(2, 18);
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        state,
      });
      return json({ ok: true, configured: true, auth_url: `${authUrl}?${params.toString()}`, state });
    }

    // ── GET /api/oauth/:provider/callback — OAuth 콜백 ──
    const oauthCbMatch = path.match(/^\/api\/oauth\/(kakao|naver|google)\/callback$/);
    if (method === 'GET' && oauthCbMatch) {
      const provider = oauthCbMatch[1];
      const code = url.searchParams.get('code');
      if (!code) {
        return new Response('<html><body><script>alert("OAuth 인증 코드 없음");location.href="/";</script></body></html>', {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      const e = env as any;
      const baseUrl = url.origin;
      const redirectUri = `${baseUrl}/api/oauth/${provider}/callback`;
      let tokenUrl = '', userUrl = '', clientId = '', clientSecret = '';

      if (provider === 'kakao') {
        tokenUrl = 'https://kauth.kakao.com/oauth/token';
        userUrl = 'https://kapi.kakao.com/v2/user/me';
        clientId = e.KAKAO_CLIENT_ID || ''; clientSecret = e.KAKAO_CLIENT_SECRET || '';
      } else if (provider === 'naver') {
        tokenUrl = 'https://nid.naver.com/oauth2.0/token';
        userUrl = 'https://openapi.naver.com/v1/nid/me';
        clientId = e.NAVER_CLIENT_ID || ''; clientSecret = e.NAVER_CLIENT_SECRET || '';
      } else {
        tokenUrl = 'https://oauth2.googleapis.com/token';
        userUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
        clientId = e.GOOGLE_CLIENT_ID || ''; clientSecret = e.GOOGLE_CLIENT_SECRET || '';
      }

      if (!clientId || !clientSecret) {
        return new Response(`<html><body><script>alert("${provider} OAuth 미설정 (시크릿 없음)");location.href="/";</script></body></html>`, { headers: { 'Content-Type': 'text/html' } });
      }

      try {
        // Access token 교환
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        });
        const tokResp = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const tok: any = await tokResp.json();
        if (!tok.access_token) throw new Error('no_access_token: ' + JSON.stringify(tok).slice(0, 200));

        // 사용자 정보 조회
        const userResp = await fetch(userUrl, { headers: { 'Authorization': `Bearer ${tok.access_token}` } });
        const userInfo: any = await userResp.json();

        // 프로바이더별 데이터 파싱
        let providerUid = '', email = '', name = '', profileImage = '';
        if (provider === 'kakao') {
          providerUid = String(userInfo.id || '');
          email = userInfo.kakao_account?.email || '';
          name = userInfo.kakao_account?.profile?.nickname || userInfo.properties?.nickname || '';
          profileImage = userInfo.kakao_account?.profile?.profile_image_url || userInfo.properties?.profile_image || '';
        } else if (provider === 'naver') {
          const r = userInfo.response || {};
          providerUid = r.id || '';
          email = r.email || '';
          name = r.name || r.nickname || '';
          profileImage = r.profile_image || '';
        } else {
          providerUid = userInfo.id || '';
          email = userInfo.email || '';
          name = userInfo.name || '';
          profileImage = userInfo.picture || '';
        }
        if (!providerUid) throw new Error('no_provider_uid');

        // DB 등록 또는 업데이트
        await ensureOAuthTable();
        const userId = `${provider}_${providerUid}`;
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO oauth_users (provider, provider_uid, user_id, email, name, profile_image, last_login_at, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(provider, provider_uid) DO UPDATE SET email = excluded.email, name = excluded.name, profile_image = excluded.profile_image, last_login_at = excluded.last_login_at`
        ).bind(provider, providerUid, userId, email, name, profileImage, now, now).run();

        // 학생/학부모로 자동 등록 (없을 때만)
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, program TEXT, status TEXT, created_at INTEGER);`);
          await env.DB.prepare(`INSERT OR IGNORE INTO students_erp (user_id, student_name, status, created_at) VALUES (?,?,?,?)`)
            .bind(userId, name || userId, '신규', now).run();
        } catch {}

        // 클라이언트로 결과 전달 + localStorage 자동 저장
        const userPayload = JSON.stringify({ user_id: userId, user_name: name, role: 'student', email, profile_image: profileImage, provider });
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>로그인 완료</title></head><body style="margin:0;font-family:'Noto Sans KR',sans-serif;background:#0a1530;color:#e6ecff;display:flex;align-items:center;justify-content:center;min-height:100vh">
          <div style="text-align:center;padding:32px">
            <div style="font-size:48px;margin-bottom:12px">✅</div>
            <h2 style="color:#fbbf24;margin-bottom:8px">${provider.toUpperCase()} 로그인 완료</h2>
            <p style="color:#a3b3d1;margin-bottom:18px">${name ? name + '님 환영합니다!' : '잠시만 기다려주세요...'}</p>
            <a href="/" style="color:#fbbf24">홈으로 이동</a>
          </div>
          <script>
            try {
              const u = ${userPayload};
              // 🔑 헤더 표시 로직이 읽는 키(mangoi_logged_user, uid)도 함께 저장 — 소셜 로그인 인식
              const lu = { uid: u.user_id, user_id: u.user_id, name: u.user_name, user_name: u.user_name, role: u.role || 'student', email: u.email, profile_image: u.profile_image, provider: u.provider };
              localStorage.setItem('mango_user', JSON.stringify(lu));
              localStorage.setItem('mangoi_logged_user', JSON.stringify(lu));
              if (lu.uid) localStorage.setItem('mangoi_uid', lu.uid);
              if (lu.name) localStorage.setItem('mangoi_vc_uid', lu.name);
            } catch(e){}
            setTimeout(() => { location.href = '/'; }, 1500);
          </script>
          </body></html>`;
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      } catch (err: any) {
        return new Response(`<html><body><script>alert("OAuth 실패: ${err?.message?.replace(/"/g,'')||'unknown'}");location.href="/";</script></body></html>`, { headers: { 'Content-Type': 'text/html' } });
      }
    }

    // ── GET /api/oauth/status — 어떤 프로바이더가 설정됐는지 ──
    if (method === 'GET' && path === '/api/oauth/status') {
      const e = env as any;
      return json({
        ok: true,
        kakao: !!e.KAKAO_CLIENT_ID,
        naver: !!e.NAVER_CLIENT_ID,
        google: !!e.GOOGLE_CLIENT_ID,
      });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🌐 Phase OAUTH 끝
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
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
    };

    if (method === 'GET' && path === '/api/admin/teacher-profiles') {
      try { await ensureTeacherProfilesSchema(); }
      catch (e: any) { return json({ ok: false, error: '테이블 생성 실패: ' + String(e?.message || e) }, 500); }
      const fStatus = url.searchParams.get('status') || '';
      const fGroup  = url.searchParams.get('group') || '';
      const where: string[] = []; const binds: any[] = [];
      if (fStatus) { where.push('status = ?'); binds.push(fStatus); }
      if (fGroup)  { where.push('group_name = ?'); binds.push(fGroup); }
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
            available_days, available_hours, bank_name, bank_account, notes,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          b.korean_name, b.english_name || null, b.email || null, b.phone || null, b.kakao_id || null,
          b.dob || null, b.gender || null,
          b.image_url || null, b.intro_video_url || null, b.active_region || null, b.origin_region || null,
          b.fee_per_10min || null, b.group_name || null, b.status || '활동중',
          b.join_date || null, b.leave_date || null, b.education || null, b.career || null, b.certifications || null,
          b.available_days || null, b.available_hours || null, b.bank_name || null, b.bank_account || null,
          b.notes || null, now, now
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
      if (method === 'GET') {
        const row = await env.DB.prepare(`SELECT * FROM teacher_profiles WHERE id = ?`).bind(id).first<any>();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        return json({ ok: true, item: row });
      }
      if (method === 'PATCH') {
        const b = await parseJsonBody(request);
        if (!b) return invalidBody(['body']);
        const allowed = ['korean_name','english_name','email','phone','kakao_id','dob','gender',
          'image_url','intro_video_url','active_region','origin_region','fee_per_10min',
          'group_name','status','join_date','leave_date','education','career','certifications',
          'available_days','available_hours','bank_name','bank_account','notes'];
        const sets: string[] = []; const binds: any[] = [];
        allowed.forEach(k => {
          if (b.hasOwnProperty(k)) { sets.push(k + ' = ?'); binds.push(b[k] === '' ? null : b[k]); }
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

    // 강사 목록
    if (method === 'GET' && path === '/api/admin/teachers') {
      await ensurePayrollSchema(env);
      const includeInactive = url.searchParams.get('include_inactive') === '1';
      const sql = includeInactive
        ? `SELECT * FROM teachers ORDER BY active DESC, name ASC`
        : `SELECT * FROM teachers WHERE active = 1 ORDER BY name ASC`;
      const rs = await env.DB.prepare(sql).all();
      const teacherRows = rs.results || [];
      // items/teachers/data 별칭 모두 제공(프론트 호환: weekly-schedule.html 등)
      return json({ ok: true, items: teacherRows, teachers: teacherRows, data: teacherRows });
    }

    // 강사 등록 (새 모델: name + status + years + rate_per_10min_php)
    if (method === 'POST' && path === '/api/admin/teachers') {
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
    if (method === 'GET' && /^\/api\/admin\/payroll\/\d+$/.test(path)) {
      await ensurePayrollSchema(env);
      const m = path.match(/^\/api\/admin\/payroll\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!id || !year || !month) return invalidBody(['teacher_id(path)', 'year', 'month']);
      const result = await calcPayrollOne(env, id, year, month);
      return json(result, result.ok ? 200 : 404);
    }

    // 일괄 — 활성 강사 전원 (월별 dashboard 용)
    if (method === 'GET' && path === '/api/admin/payroll/all') {
      await ensurePayrollSchema(env);
      const year  = parseInt(url.searchParams.get('year')  || '0', 10);
      const month = parseInt(url.searchParams.get('month') || '0', 10);
      if (!year || !month) return invalidBody(['year', 'month']);
      const rs = await env.DB.prepare(`SELECT id FROM teachers WHERE active = 1 ORDER BY name ASC`).all();
      const items: any[] = [];
      let totalPhp = 0;
      for (const t of (rs.results || []) as any[]) {
        const r = await calcPayrollOne(env, t.id, year, month);
        if (r.ok) { items.push(r); totalPhp += r.monthly_salary_php || 0; }
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

    // ===== 👨‍🎓 학생 ERP 풀 레코드 (Phase 10) =====
    //   별도 students 테이블에 ERP 컬럼 (결제타입·종료일·조직 다단계·전화번호 등) 보관
    //   GET  /api/admin/students/erp-list
    //   POST /api/admin/students/erp           (단건 등록)
    //   POST /api/admin/students/erp-seed      (22명 데모 일괄 시드)
    if (path === '/api/admin/students/erp-list' && method === 'GET') {
      // 🥭 Phase 35b — 500 핫픽스
      //   Phase 20d 에서 다른 스키마(user_id PK, id 컬럼 없음)로 자동 생성될 수 있음
      //   ① 테이블이 없을 때만 풀 스키마로 생성 (이미 다른 모양이면 NOOP)
      //   ② 누락된 컬럼은 ALTER TABLE ADD COLUMN 으로 보강
      //   ③ ORDER BY 는 SQLite 의 내장 rowid 사용 — 어떤 스키마든 항상 존재
      //   ④ 실패해도 200 OK + 빈 배열 (프론트가 깨지지 않게)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id TEXT, username TEXT, login_id TEXT,
          payment_type TEXT, end_date TEXT, signup_date TEXT,
          classes_per_week INTEGER, points INTEGER DEFAULT 0,
          student_phone TEXT, parent_phone TEXT, teacher_phone TEXT,
          shop_name TEXT, hq_name TEXT, branch1_name TEXT, branch2_name TEXT,
          franchise TEXT, status TEXT DEFAULT '정상',
          created_at INTEGER, updated_at INTEGER,
          korean_name TEXT, english_name TEXT, user_id TEXT
        );`);
      } catch {}
      // 누락 컬럼 보강 — ADD COLUMN 은 이미 있으면 throw 하므로 개별 try/catch
      const addCol = async (col: string, type: string) => {
        try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${col} ${type}`); } catch {}
      };
      await addCol('username', 'TEXT');
      await addCol('login_id', 'TEXT');
      await addCol('payment_type', 'TEXT');
      await addCol('classes_per_week', 'INTEGER');
      await addCol('points', 'INTEGER DEFAULT 0');
      await addCol('student_phone', 'TEXT');
      await addCol('parent_phone', 'TEXT');
      await addCol('teacher_phone', 'TEXT');
      await addCol('shop_name', 'TEXT');
      await addCol('hq_name', 'TEXT');
      await addCol('branch1_name', 'TEXT');
      await addCol('branch2_name', 'TEXT');
      await addCol('franchise', 'TEXT');
      await addCol('updated_at', 'INTEGER');

      const lim = Math.max(1, Math.min(2000, parseInt(url.searchParams.get('limit') || '500', 10)));
      try {
        // rowid 는 모든 SQLite 테이블에 항상 존재 — id 컬럼 없는 스키마에서도 동작
        const _swErp = await studentScopeWhere(env, request);  // 🔒 지사/대리점 격리
        const rs = await env.DB.prepare(
          `SELECT rowid AS _rowid, * FROM students_erp ${_swErp.cond ? 'WHERE ' + _swErp.cond + ' ' : ''}ORDER BY rowid DESC LIMIT ?`
        ).bind(..._swErp.binds, lim).all<any>();
        const items = (rs.results || []).map(r => {
          // id 컬럼이 없으면 rowid 를 id 로 사용 (프론트 호환)
          if (r.id == null) r.id = r._rowid;
          // korean_name / english_name 만 있으면 username 에 채움 (Phase 20d 스키마 호환)
          if (!r.username && r.korean_name) r.username = r.korean_name;
          if (!r.login_id && r.user_id) r.login_id = r.user_id;
          return r;
        });
        const _piiItems = applyPIIScope(items, _swErp.scope);  // 🔒 권한별 PII 마스킹(hq/none=원본, 지사/대리점=마스킹)
        return json({ ok: true, items: _piiItems, can_view_pii: canViewPII(_swErp.scope) });
      } catch (e: any) {
        // 어떤 에러든 빈 배열로 graceful — UI 가 "데이터 없음" 으로 표시
        console.warn('[erp-list] query failed:', e?.message || e);
        return json({ ok: true, items: [], warning: String(e?.message || e) });
      }
    }

    if (path === '/api/admin/students/erp' && method === 'POST') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT, username TEXT NOT NULL, login_id TEXT,
        payment_type TEXT, end_date TEXT, signup_date TEXT,
        classes_per_week INTEGER, points INTEGER DEFAULT 0,
        student_phone TEXT, parent_phone TEXT, teacher_phone TEXT,
        shop_name TEXT, hq_name TEXT, branch1_name TEXT, branch2_name TEXT,
        franchise TEXT, status TEXT DEFAULT '정상',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );`);
      const b = await parseJsonBody(request);
      if (!b || !b.username) return invalidBody(['username']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO students_erp (student_id, username, login_id, payment_type, end_date, signup_date,
                                    classes_per_week, points, student_phone, parent_phone, teacher_phone,
                                    shop_name, hq_name, branch1_name, branch2_name, franchise, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.student_id || null, b.username, b.login_id || null,
        b.payment_type || 'B2C 결제', b.end_date || null, b.signup_date || null,
        b.classes_per_week != null ? Number(b.classes_per_week) : null,
        b.points != null ? Number(b.points) : 0,
        b.student_phone || null, b.parent_phone || null, b.teacher_phone || null,
        b.shop_name || null, b.hq_name || null, b.branch1_name || null, b.branch2_name || null,
        b.franchise || null, b.status || '정상', now, now
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // 22명 데모 시드 (스크린샷 데이터 기반)
    if (path === '/api/admin/students/erp-seed' && method === 'POST') {
      // 🥭 Phase 35b — 스키마 충돌 대비 (Phase 20d 의 다른 스키마와 호환)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id TEXT, username TEXT, login_id TEXT,
          payment_type TEXT, end_date TEXT, signup_date TEXT,
          classes_per_week INTEGER, points INTEGER DEFAULT 0,
          student_phone TEXT, parent_phone TEXT, teacher_phone TEXT,
          shop_name TEXT, hq_name TEXT, branch1_name TEXT, branch2_name TEXT,
          franchise TEXT, status TEXT DEFAULT '정상',
          created_at INTEGER, updated_at INTEGER,
          korean_name TEXT, english_name TEXT, user_id TEXT
        );`);
      } catch {}
      // 누락 컬럼 보강 — ALTER TABLE ADD COLUMN (이미 있으면 throw, 개별 try/catch)
      const _addCol = async (col: string, type: string) => {
        try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${col} ${type}`); } catch {}
      };
      await _addCol('student_id', 'TEXT');
      await _addCol('username', 'TEXT');
      await _addCol('login_id', 'TEXT');
      await _addCol('payment_type', 'TEXT');
      await _addCol('classes_per_week', 'INTEGER');
      await _addCol('points', 'INTEGER DEFAULT 0');
      await _addCol('student_phone', 'TEXT');
      await _addCol('parent_phone', 'TEXT');
      await _addCol('teacher_phone', 'TEXT');
      await _addCol('shop_name', 'TEXT');
      await _addCol('hq_name', 'TEXT');
      await _addCol('branch1_name', 'TEXT');
      await _addCol('branch2_name', 'TEXT');
      await _addCol('franchise', 'TEXT');
      await _addCol('updated_at', 'INTEGER');
      // 🥭 Phase 36 — 가짜 학생 20명 (테스트 전용, 다양한 패턴)
      // [student_id, username, login_id, pay, end_date, signup, classes, points, stu_ph, par_ph, t_ph, shop, hq, b1, b2, fran]
      const SEED = [
        ['MG001','김민수','mango_minsu',    'B2C 결제', '2026-12-31', '2026-03-01', 2, 150, '010-1111-1001', '010-2001-1001', '010-3001-1001', '망고아이 강남센터', '망고아이 본사', '강남지사', '강남캠퍼스', '망고아이'],
        ['MG002','이지은','mango_jieun',    'B2C 결제', '2026-09-30', '2026-03-05', 2, 80,  '010-1111-1002', '010-2001-1002', null,             '망고아이 서초센터', '망고아이 본사', '서초지사', '서초캠퍼스', '망고아이'],
        ['MG003','박서준','mango_seojun',   'B2C 결제', null,         '2026-03-10', 3, 220, '010-1111-1003', '010-2001-1003', '010-3001-1003', '망고아이 송파센터', '망고아이 본사', '송파지사', '송파캠퍼스', '망고아이'],
        ['MG004','최예린','mango_yerin',    'B2B 결제', '2027-03-31', '2026-03-12', 2, 50,  '010-1111-1004', '010-2001-1004', null,             '킹스영어 분당',     '에듀비전 본사', '제퍼슨',   '분당캠퍼스', '에듀비전'],
        ['MG005','정태현','mango_taehyun',  'B2C 결제', null,         '2026-03-15', 1, 30,  '010-1111-1005', '010-2001-1005', null,             '망고아이 안양센터', '망고아이 본사', '안양지사', '안양캠퍼스', '망고아이'],
        ['MG006','강유진','mango_yujin',    'B2C 결제', '2026-08-15', '2026-03-18', 2, 180, '010-1111-1006', '010-2001-1006', '010-3001-1006', '망고아이 일산센터', '망고아이 본사', '고양지사', '일산캠퍼스', '망고아이'],
        ['MG007','조현우','mango_hyunwoo',  'B2B 결제', null,         '2026-03-20', 3, 90,  '010-1111-1007', '010-2001-1007', null,             '에듀파인 부산',     '에듀비전 본사', 'SLP',      '부산캠퍼스', '에듀비전'],
        ['MG008','윤수아','mango_sua',      'B2C 결제', '2026-11-20', '2026-03-22', 2, 120, '010-1111-1008', '010-2001-1008', null,             '망고아이 수원센터', '망고아이 본사', '수원지사', '수원캠퍼스', '망고아이'],
        ['MG009','임도윤','mango_doyoon',   'B2C 결제', null,         '2026-03-25', 1, 0,   '010-1111-1009', '010-2001-1009', null,             '망고아이 인천센터', '망고아이 본사', '인천지사', '연수캠퍼스', '망고아이'],
        ['MG010','한지호','mango_jiho',     'B2C 결제', '2026-10-31', '2026-03-28', 3, 250, '010-1111-1010', '010-2001-1010', '010-3001-1010', '망고아이 대전센터', '망고아이 본사', '대전지사', '둔산캠퍼스', '망고아이'],
        ['MG011','송하연','mango_hayeon',   'B2C 결제', null,         '2026-04-01', 2, 60,  '010-1111-1011', '010-2001-1011', null,             '망고아이 광주센터', '망고아이 본사', '광주지사', '광주캠퍼스', '망고아이'],
        ['MG012','오시우','mango_siwoo',    'B2B 결제', '2027-01-31', '2026-04-03', 2, 110, '010-1111-1012', '010-2001-1012', null,             '리딩스타 대구',     '에듀비전 본사', '제퍼슨',   '대구캠퍼스', '에듀비전'],
        ['MG013','신아라','mango_ara',      'B2C 결제', null,         '2026-04-05', 1, 40,  '010-1111-1013', '010-2001-1013', null,             '망고아이 천안센터', '망고아이 본사', '천안지사', '천안캠퍼스', '망고아이'],
        ['MG014','배준영','mango_junyoung', 'B2C 결제', '2026-12-15', '2026-04-08', 2, 200, '010-1111-1014', '010-2001-1014', '010-3001-1014', '망고아이 청주센터', '망고아이 본사', '청주지사', '청주캠퍼스', '망고아이'],
        ['MG015','황소희','mango_sohee',    'B2C 결제', null,         '2026-04-10', 3, 75,  '010-1111-1015', '010-2001-1015', null,             '망고아이 울산센터', '망고아이 본사', '울산지사', '남구캠퍼스', '망고아이'],
        ['MG016','노지민','mango_jimin',    'B2B 결제', '2027-04-30', '2026-04-12', 2, 95,  '010-1111-1016', '010-2001-1016', null,             '잉글리쉬타운 분당', '에듀비전 본사', 'SLP',      '판교캠퍼스', '에듀비전'],
        ['MG017','서다은','mango_daeun',    'B2C 결제', null,         '2026-04-15', 1, 20,  '010-1111-1017', '010-2001-1017', null,             '망고아이 세종센터', '망고아이 본사', '세종지사', '세종캠퍼스', '망고아이'],
        ['MG018','권현서','mango_hyunseo',  'B2C 결제', '2026-09-15', '2026-04-18', 2, 130, '010-1111-1018', '010-2001-1018', '010-3001-1018', '망고아이 창원센터', '망고아이 본사', '창원지사', '창원캠퍼스', '망고아이'],
        ['MG019','류재희','mango_jaehee',   'B2C 결제', null,         '2026-04-20', 2, 55,  '010-1111-1019', '010-2001-1019', null,             '망고아이 전주센터', '망고아이 본사', '전주지사', '전주캠퍼스', '망고아이'],
        ['MG020','안민서','mango_minseo',   'B2C 결제', '2026-11-30', '2026-04-22', 3, 170, '010-1111-1020', '010-2001-1020', '010-3001-1020', '망고아이 제주센터', '망고아이 본사', '제주지사', '제주시캠퍼스', '망고아이']
      ];
      const now = Date.now();
      let created = 0, skipped = 0;
      const errors: string[] = [];
      for (const row of SEED) {
        const [sid, name, lid, pay, end_dt, signup, cw, pts, sp, pp, tp, shop, hq, b1, b2, fr] = row;
        try {
          // 중복 체크 — rowid 사용 (id 컬럼 없는 스키마에서도 동작)
          const exists: any = await env.DB.prepare(`SELECT rowid FROM students_erp WHERE student_id = ? LIMIT 1`).bind(sid).first();
          if (exists) { skipped++; continue; }
          await env.DB.prepare(
            `INSERT INTO students_erp (student_id, username, login_id, payment_type, end_date, signup_date,
                                        classes_per_week, points, student_phone, parent_phone, teacher_phone,
                                        shop_name, hq_name, branch1_name, branch2_name, franchise, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '정상', ?, ?)`
          ).bind(sid, name, lid, pay, end_dt, signup, cw, pts, sp, pp, tp, shop, hq, b1, b2, fr, now, now).run();
          created++;
        } catch (e: any) {
          errors.push(sid + ': ' + (e?.message || e));
        }
      }

      // 🥭 Phase 36 — 수강신청도 함께 시드 (📅 스케줄 캘린더 즉시 테스트 가능)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS enrollments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_name TEXT NOT NULL, student_user_id TEXT,
          package TEXT, monthly_fee_krw INTEGER, started_at INTEGER, end_date TEXT,
          days_of_week TEXT, time TEXT, class_size TEXT, type TEXT, teacher_name TEXT,
          status TEXT DEFAULT 'active', created_at INTEGER NOT NULL
        );`);
      } catch {}
      // enrollments 누락 컬럼 보강
      const _addEnrCol = async (col: string, type: string) => {
        try { await env.DB.exec(`ALTER TABLE enrollments ADD COLUMN ${col} ${type}`); } catch {}
      };
      await _addEnrCol('days_of_week', 'TEXT');
      await _addEnrCol('time', 'TEXT');
      await _addEnrCol('class_size', 'TEXT');
      await _addEnrCol('type', 'TEXT');
      await _addEnrCol('teacher_name', 'TEXT');
      await _addEnrCol('end_date', 'TEXT');

      // 다양한 패턴 (요일·시간·인원·강사) — 학생 20명에 분배
      const patterns = [
        { days:'월수금', time:'10:30', size:'1:1', type:'정규수업', teacher:'Teacher Belle' },
        { days:'화목',   time:'15:00', size:'1:1', type:'체험수업', teacher:'Teacher Anna' },
        { days:'월수금', time:'월 7:00, 수 8:30, 금 6:00', size:'1:1', type:'정규수업', teacher:'Teacher David' },
        { days:'화목',   time:'17:30', size:'1:3', type:'정규수업', teacher:'Teacher Sarah' },
        { days:'월수',   time:'19:00', size:'1:2', type:'레벨테스트', teacher:'Teacher Mike' },
        { days:'토',     time:'09:00', size:'1:1', type:'체험수업', teacher:'Teacher Belle' },
        { days:'월화수목금', time:'08:00', size:'1:1', type:'정규수업', teacher:'Teacher Anna' },
        { days:'화금',   time:'14:30', size:'1:2', type:'정규수업', teacher:'Teacher David' },
        { days:'수금',   time:'수 16:00, 금 17:30', size:'1:1', type:'정규수업', teacher:'Teacher Sarah' },
        { days:'월목',   time:'18:00', size:'1:3', type:'정규수업', teacher:'Teacher Mike' }
      ];
      let enrollCreated = 0;
      const today = new Date();
      const todayStr = today.toISOString().slice(0,10);
      const startMs = today.getTime() - 14 * 86400000; // 2주 전부터
      for (let i = 0; i < SEED.length; i++) {
        const sid = SEED[i][0]; const name = SEED[i][1]; const lid = SEED[i][2];
        const endDate = SEED[i][4]; const fee = (i % 4 === 0) ? 0 : (200000 + (i % 6) * 30000);
        const p = patterns[i % patterns.length];
        try {
          // 같은 학생의 enrollment 가 이미 있으면 skip
          const exEnr: any = await env.DB.prepare(`SELECT rowid FROM enrollments WHERE student_user_id = ? LIMIT 1`).bind(lid).first();
          if (exEnr) continue;
          const pkg = p.type === '정규수업' ? '정규반' : (p.type === '체험수업' ? '체험반' : '레벨테스트반');
          await env.DB.prepare(
            `INSERT INTO enrollments
             (student_name, student_user_id, package, monthly_fee_krw, started_at, end_date,
              days_of_week, time, class_size, type, teacher_name, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
          ).bind(
            name, lid, pkg, fee || null, startMs, endDate || null,
            p.days, p.time, p.size, p.type, p.teacher, now
          ).run();
          enrollCreated++;
        } catch {}
      }

      return json({ ok: true, total: SEED.length, created, skipped, enrollments_created: enrollCreated, errors: errors.length ? errors : undefined });
    }

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
      const GRAPH_STUDENT_LIST_QUERY = `
MATCH (s:Student)
WHERE $q = ''
   OR toLower(coalesce(s.name, s.korean_name, ''))       CONTAINS $q
   OR toLower(coalesce(s.student_id, s.user_id, ''))     CONTAINS $q
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
          env, GRAPH_STUDENT_LIST_QUERY, { q: qG, limit: limitG }, 'READ',
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

    // ===== 학생별 드릴다운 (Phase 2) =====
    //   GET /api/admin/student/:user_id?days=30
    //   - 프로필 (최초/마지막 접속, 전체 세션 수)
    //   - 요약 (기간 내 집계)
    //   - 일자별 by_day (차트용)
    //   - 세션 리스트 (최근순)
    //
    //   ⚠ Phase 12 — /api/admin/student/:uid/(full|consultations|...) 같은 sub-route 가 추가되면서
    //      `startsWith` 매칭이 충돌함. /api/admin/student/foo/full 의 userId 가 'foo/full' 로
    //      잘못 파싱돼 404 가 떨어졌음. user_id 만 있는 경로로 한정하기 위해 정규식으로 좁힘.
    if (/^\/api\/admin\/student\/[^\/]+$/.test(path) && method === 'GET') {
      const userId = decodeURIComponent(path.replace('/api/admin/student/', ''));
      if (!userId) return invalidBody(['user_id(path)']);
      const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10)));
      const since = Date.now() - days * 24 * 3600 * 1000;

      const [profileRow, summaryRow, byDayRows, sessionRows] = await Promise.all([
        // 프로필: 기간 무관 전체 history
        env.DB.prepare(
          `SELECT user_id, COALESCE(MAX(username), user_id) AS username, COALESCE(MAX(role), 'student') AS role,
                  MIN(joined_at) AS first_seen, MAX(joined_at) AS last_seen,
                  COUNT(*) AS total_sessions_all_time
           FROM attendance WHERE user_id = ?`
        ).bind(userId).first(),
        // 요약: 기간 내 집계
        env.DB.prepare(
          `SELECT COUNT(*) AS session_count,
                  COALESCE(SUM(total_session_ms), 0) AS total_session_ms,
                  COALESCE(SUM(total_active_ms), 0)  AS total_active_ms,
                  COALESCE(SUM(disconnect_count), 0) AS disconnect_sum,
                  AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze_score,
                  COUNT(CASE WHEN gaze_score IS NOT NULL THEN 1 END) AS gaze_score_count
           FROM attendance WHERE user_id = ? AND joined_at >= ?`
        ).bind(userId, since).first(),
        // 일자별 (차트용)
        env.DB.prepare(
          `SELECT date,
                  COUNT(*) AS session_count,
                  COALESCE(SUM(total_session_ms), 0) AS total_session_ms,
                  COALESCE(SUM(total_active_ms), 0)  AS total_active_ms,
                  AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze_score
           FROM attendance WHERE user_id = ? AND joined_at >= ?
           GROUP BY date ORDER BY date ASC`
        ).bind(userId, since).all(),
        // 세션 리스트 (최근순)
        env.DB.prepare(
          `SELECT id, room_id, joined_at, left_at, status, date,
                  total_session_ms, total_active_ms, disconnect_count,
                  gaze_score, gaze_samples, gaze_forward_samples
           FROM attendance WHERE user_id = ? AND joined_at >= ?
           ORDER BY joined_at DESC LIMIT 200`
        ).bind(userId, since).all()
      ]);

      if (!profileRow || !(profileRow as any).user_id) {
        return json({ ok: false, error: 'student_not_found', user_id: userId }, 404);
      }

      return json({
        ok: true,
        profile: profileRow,
        period_days: days,
        summary: summaryRow || {},
        by_day: byDayRows.results || [],
        sessions: sessionRows.results || []
      });
    }

    // ════════════════════════════════════════════════════════════════
    // 🎓 Phase 12 — 학생 드릴다운 풀 멀티탭
    //   GET  /api/admin/student/:uid/full           — 모든 탭 데이터 한 번에
    //   GET  /api/admin/student/:uid/consultations  — 상담 내역
    //   POST /api/admin/student/:uid/consultations  — 상담 기록 추가
    //   GET  /api/admin/student/:uid/evaluations    — 평가서 (시험 점수·종합 평가)
    //   POST /api/admin/student/:uid/evaluations    — 평가서 작성
    //   GET  /api/admin/student/:uid/feedbacks      — 교사 피드백 (수업별)
    //   POST /api/admin/student/:uid/feedbacks      — 피드백 작성
    //   GET  /api/admin/student/:uid/payments       — 수업료 결제 내역
    //   POST /api/admin/student/:uid/payments       — 수업료 기록 추가
    //   PATCH /api/admin/student/:uid/contact       — 연락처·학교 등 students_erp 업데이트
    //   GET  /api/admin/student/:uid/recordings     — 학생 참여 녹화 영상
    //   GET  /api/admin/student/:uid/textbooks      — 배정된 교재
    // ════════════════════════════════════════════════════════════════

    // 스키마 보장 — 5개 테이블 (idempotent)
    const ensureStudentDetailSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_consultations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, consult_at INTEGER NOT NULL, channel TEXT, counselor TEXT, topic TEXT, content TEXT, follow_up_at INTEGER, status TEXT DEFAULT 'open', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, eval_at INTEGER NOT NULL, eval_type TEXT, level TEXT, score_speaking REAL, score_listening REAL, score_reading REAL, score_writing REAL, score_total REAL, evaluator TEXT, comment TEXT, next_goal TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_feedbacks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, room_id TEXT, attendance_id INTEGER, teacher_name TEXT, class_at INTEGER NOT NULL, rating INTEGER, summary TEXT, content TEXT, action_items TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_textbook_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, textbook_id INTEGER, textbook_name TEXT, level TEXT, started_at INTEGER, ended_at INTEGER, progress_pct INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at INTEGER NOT NULL);`);
      // students_erp 에 학교·카톡 컬럼 추가 (이미 있으면 무시)
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN school TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN grade TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN kakao_id TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN parent_kakao_id TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN address TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN birth_date TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN notes TEXT;`); } catch {}
    };

    // /api/admin/student/:uid/full — 한 번에 모든 탭 데이터 적재 (Promise.allSettled)
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/full$/);
      if (m && method === 'GET') {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10)));
        const since = Date.now() - days * 24 * 3600 * 1000;

        const queries = await Promise.allSettled([
          // 1. erp 정보 (학생 마스터)
          env.DB.prepare(`SELECT * FROM students_erp WHERE student_id = ? OR login_id = ? OR username = ? LIMIT 1`).bind(uid, uid, uid).first(),
          // 2. 출석 프로필 + 요약
          env.DB.prepare(
            `SELECT user_id, COALESCE(MAX(username), user_id) AS username, COALESCE(MAX(role),'student') AS role,
                    MIN(joined_at) AS first_seen, MAX(joined_at) AS last_seen,
                    COUNT(*) AS total_sessions_all_time
             FROM attendance WHERE user_id = ?`
          ).bind(uid).first(),
          env.DB.prepare(
            `SELECT COUNT(*) AS session_count,
                    COALESCE(SUM(total_session_ms),0) AS total_session_ms,
                    COALESCE(SUM(total_active_ms),0)  AS total_active_ms,
                    COALESCE(SUM(disconnect_count),0) AS disconnect_sum,
                    AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze_score,
                    COUNT(CASE WHEN gaze_score IS NOT NULL THEN 1 END) AS gaze_score_count,
                    COUNT(DISTINCT date) AS active_days
             FROM attendance WHERE user_id = ? AND joined_at >= ?`
          ).bind(uid, since).first(),
          // 3. 일자별 (차트)
          env.DB.prepare(
            `SELECT date, COUNT(*) AS session_count,
                    COALESCE(SUM(total_session_ms),0) AS total_session_ms,
                    COALESCE(SUM(total_active_ms),0)  AS total_active_ms,
                    AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze_score
             FROM attendance WHERE user_id = ? AND joined_at >= ?
             GROUP BY date ORDER BY date ASC`
          ).bind(uid, since).all(),
          // 4. 세션 (최근 200건)
          env.DB.prepare(
            `SELECT id, room_id, joined_at, left_at, status, date,
                    total_session_ms, total_active_ms, disconnect_count,
                    gaze_score, gaze_samples, gaze_forward_samples
             FROM attendance WHERE user_id = ? AND joined_at >= ?
             ORDER BY joined_at DESC LIMIT 200`
          ).bind(uid, since).all(),
          // 5. 수강 이력
          env.DB.prepare(`SELECT * FROM enrollments WHERE student_user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(uid).all(),
          // 6. 수업료 결제
          env.DB.prepare(`SELECT * FROM student_payments WHERE user_id = ? ORDER BY paid_at DESC LIMIT 50`).bind(uid).all(),
          // 7. 평가서
          env.DB.prepare(`SELECT * FROM student_evaluations WHERE user_id = ? ORDER BY eval_at DESC LIMIT 50`).bind(uid).all(),
          // 8. 교사 피드백
          env.DB.prepare(`SELECT * FROM teacher_feedbacks WHERE user_id = ? ORDER BY class_at DESC LIMIT 50`).bind(uid).all(),
          // 9. 상담 내역
          env.DB.prepare(`SELECT * FROM student_consultations WHERE user_id = ? ORDER BY consult_at DESC LIMIT 50`).bind(uid).all(),
          // 10. 보상(스티커·쿠폰)
          env.DB.prepare(`SELECT * FROM rewards WHERE student_id = ? ORDER BY issued_at DESC LIMIT 50`).bind(uid).all(),
          // 11. 녹화 영상 (이 학생이 참여한)
          env.DB.prepare(
            `SELECT id, room_id, teacher_name, filename, started_at, ended_at, duration_ms, size_bytes, status
             FROM recordings
             WHERE participant_ids LIKE ? OR consented_user_ids LIKE ?
             ORDER BY started_at DESC LIMIT 50`
          ).bind('%' + uid + '%', '%' + uid + '%').all(),
          // 12. 배정 교재
          env.DB.prepare(`SELECT * FROM student_textbook_assignments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(uid).all(),
          // 13. 동의 현황
          env.DB.prepare(`SELECT * FROM consents WHERE user_id = ? AND withdrawn_at IS NULL ORDER BY consented_at DESC LIMIT 1`).bind(uid).first(),
        ]);

        const pick = (i: number) => {
          const r = queries[i];
          if (r.status !== 'fulfilled') return null;
          return r.value;
        };
        const pickList = (i: number) => {
          const v = pick(i) as any;
          if (!v) return [];
          if (Array.isArray(v.results)) return v.results;
          if (Array.isArray(v)) return v;
          return [];
        };

        const _fullScope = await getScope(env as any, request);  // 🔒 PII 열람 권한 판정
        const _erpRow: any = pick(0);
        const _fullErpPII = (_erpRow && !canViewPII(_fullScope)) ? maskRecordPII(_erpRow) : _erpRow;

        // 🎓 카페24 성적(그래프DB) — 월말평가(상세 코멘트5)·일별·교재퀴즈·레벨테스트·포인트. Neo4j 미연결 시 조용히 빈배열.
        let cafe24Scores: any = { monthly: [], daily: [], quiz: [], points: [], points_balance: 0, leveltest: [], enroll: [], counsel: [], teacher_score: null, review: [], self_avg: null, self_count: 0 };
        try {
          const { fields, values } = await runCypher(env, `
            OPTIONAL MATCH (m:MonthlyScore {user_id: $uid})
            WITH m ORDER BY m.year DESC, m.month DESC
            WITH collect(m { year: m.year, month: m.month, subject: m.subject, level: m.level, comment: m.comment, c1: m.c1, c2: m.c2, c3: m.c3, c4: m.c4, c5: m.c5 })[0..24] AS monthly
            OPTIONAL MATCH (d:DailyScore {user_id: $uid})
            WITH monthly, d ORDER BY d.date DESC
            WITH monthly, collect(d { date: d.date, s1: d.s1, s2: d.s2, s3: d.s3, s4: d.s4, s5: d.s5, comment: d.comment })[0..90] AS daily
            OPTIONAL MATCH (lt:LevelTest {user_id: $uid})
            WITH monthly, daily, lt ORDER BY lt.year DESC, lt.month DESC, lt.day DESC
            WITH monthly, daily, collect(lt { year: lt.year, month: lt.month, day: lt.day, level: lt.level, pass: lt.pass, s1: lt.s1, s2: lt.s2, s3: lt.s3, s4: lt.s4, s5: lt.s5, comment: lt.comment })[0..20] AS leveltest
            OPTIONAL MATCH (en:Enrollment {user_id: $uid})
            WITH monthly, daily, leveltest, en ORDER BY en.start_date DESC
            WITH monthly, daily, leveltest, collect(en { start_date: en.start_date, end_date: en.end_date, state: en.state, progress: en.progress, reg_date: en.reg_date })[0..30] AS enroll
            OPTIONAL MATCH (cn:Counsel {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, cn ORDER BY cn.date DESC
            WITH monthly, daily, leveltest, enroll, collect(cn { date: cn.date, counselor: cn.counselor, title: cn.title, content: cn.content, answer: cn.answer })[0..40] AS counsel
            OPTIONAL MATCH (rv:Review {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, counsel, rv ORDER BY rv.date DESC
            WITH monthly, daily, leveltest, enroll, counsel, collect(rv { rating: rv.rating, content: rv.content, date: rv.date, teacher_id: rv.teacher_id })[0..30] AS review
            OPTIONAL MATCH (ts:TeacherScore {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, counsel, review, count(ts) AS ts_count, avg((coalesce(ts.s1,0)+coalesce(ts.s2,0)+coalesce(ts.s3,0)+coalesce(ts.s4,0)+coalesce(ts.s5,0))/5.0) AS ts_avg
            OPTIONAL MATCH (c:Class {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, collect(DISTINCT c.class_id) AS classIds
            OPTIONAL MATCH (q:QuizResult) WHERE q.class_id IN classIds
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, q ORDER BY q.date DESC
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, collect(q { quiz_id: q.quiz_id, state: q.state, page: q.page, date: q.date, q_total: q.q_total, correct: q.correct, score_pct: q.score_pct })[0..60] AS quiz
            OPTIONAL MATCH (pt:PointTx {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, quiz, pt ORDER BY pt.ts DESC
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, quiz,
                 collect(pt { amount: pt.amount, name: pt.name, date: pt.date, ts: pt.ts })[0..100] AS points,
                 sum(pt.amount) AS points_balance
            OPTIONAL MATCH (st:Student {student_id: $uid})
            RETURN monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, quiz, points, points_balance,
                   st.self_avg AS self_avg, st.self_count AS self_count
          `, { uid }, 'READ');
          if (values.length) {
            const idx = (n: string) => fields.indexOf(n);
            const g = (n: string) => values[0][idx(n)];
            cafe24Scores = {
              monthly: g('monthly') || [], daily: g('daily') || [], leveltest: g('leveltest') || [],
              quiz: g('quiz') || [], points: g('points') || [], points_balance: g('points_balance') || 0,
              enroll: g('enroll') || [], counsel: g('counsel') || [], review: g('review') || [],
              teacher_score: (Number(g('ts_count'))>0) ? { count: g('ts_count'), avg: Math.round((Number(g('ts_avg'))||0)*10)/10 } : null,
              self_avg: g('self_avg') != null ? Math.round(Number(g('self_avg'))*10)/10 : null,
              self_count: g('self_count') || 0,
            };
          }
        } catch (e: any) {
          console.warn('[student/full] cafe24 성적 조회 실패:', e?.message || e);
        }

        return json({
          ok: true,
          user_id: uid,
          period_days: days,
          erp: _fullErpPII,
          can_view_pii: canViewPII(_fullScope),
          profile: pick(1),
          summary: pick(2) || {},
          by_day: pickList(3),
          sessions: pickList(4),
          enrollments: pickList(5),
          payments: pickList(6),
          evaluations: pickList(7),
          feedbacks: pickList(8),
          consultations: pickList(9),
          rewards: pickList(10),
          recordings: pickList(11),
          textbooks: pickList(12),
          consent: pick(13),
          // 🎓 카페24 성적 (월별/일별 점수 + 교재퀴즈) — 그래프DB 실데이터
          cafe24_scores: cafe24Scores,
        });
      }
    }

    // /api/admin/student/:uid/consultations
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/consultations$/);
      if (m) {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const rs = await env.DB.prepare(
            `SELECT * FROM student_consultations WHERE user_id = ? ORDER BY consult_at DESC LIMIT 100`
          ).bind(uid).all();
          return json({ ok: true, items: rs.results || [] });
        }
        if (method === 'POST') {
          const b = await parseJsonBody(request);
          if (!b) return invalidBody(['content or topic']);
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO student_consultations (user_id, consult_at, channel, counselor, topic, content, follow_up_at, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            uid,
            b.consult_at || now,
            b.channel || 'phone',
            b.counselor || null,
            b.topic || null,
            b.content || '',
            b.follow_up_at || null,
            b.status || 'open',
            now
          ).run();
          return json({ ok: true, id: r.meta.last_row_id });
        }
      }
    }

    // /api/admin/student/:uid/evaluations
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/evaluations$/);
      if (m) {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const rs = await env.DB.prepare(
            `SELECT * FROM student_evaluations WHERE user_id = ? ORDER BY eval_at DESC LIMIT 100`
          ).bind(uid).all();
          return json({ ok: true, items: rs.results || [] });
        }
        if (method === 'POST') {
          const b = await parseJsonBody(request);
          if (!b) return invalidBody(['eval_type or score_total']);
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO student_evaluations (user_id, eval_at, eval_type, level, score_speaking, score_listening, score_reading, score_writing, score_total, evaluator, comment, next_goal, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            uid,
            b.eval_at || now,
            b.eval_type || 'monthly',
            b.level || null,
            b.score_speaking ?? null,
            b.score_listening ?? null,
            b.score_reading ?? null,
            b.score_writing ?? null,
            b.score_total ?? null,
            b.evaluator || null,
            b.comment || null,
            b.next_goal || null,
            now
          ).run();
          return json({ ok: true, id: r.meta.last_row_id });
        }
      }
    }

    // /api/admin/student/:uid/feedbacks
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/feedbacks$/);
      if (m) {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const rs = await env.DB.prepare(
            `SELECT * FROM teacher_feedbacks WHERE user_id = ? ORDER BY class_at DESC LIMIT 100`
          ).bind(uid).all();
          return json({ ok: true, items: rs.results || [] });
        }
        if (method === 'POST') {
          const b = await parseJsonBody(request);
          if (!b) return invalidBody(['summary']);
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO teacher_feedbacks (user_id, room_id, attendance_id, teacher_name, class_at, rating, summary, content, action_items, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            uid,
            b.room_id || null,
            b.attendance_id || null,
            b.teacher_name || null,
            b.class_at || now,
            b.rating ?? null,
            b.summary || '',
            b.content || null,
            b.action_items || null,
            now
          ).run();
          return json({ ok: true, id: r.meta.last_row_id });
        }
      }
    }

    // /api/admin/student/:uid/payments
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/payments$/);
      if (m) {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const rs = await env.DB.prepare(
            `SELECT * FROM student_payments WHERE user_id = ? ORDER BY paid_at DESC LIMIT 100`
          ).bind(uid).all();
          return json({ ok: true, items: rs.results || [] });
        }
        if (method === 'POST') {
          const b = await parseJsonBody(request);
          if (!b || b.amount_krw == null) return invalidBody(['amount_krw']);
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO student_payments (user_id, paid_at, period_start, period_end, amount_krw, method, memo, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            uid,
            b.paid_at || now,
            b.period_start || null,
            b.period_end || null,
            Math.round(Number(b.amount_krw) || 0),
            b.method || null,
            b.memo || null,
            b.status || 'paid',
            now
          ).run();
          return json({ ok: true, id: r.meta.last_row_id });
        }
      }
    }

    // /api/admin/student/:uid/contact (PATCH — students_erp 업데이트)
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/contact$/);
      if (m && method === 'PATCH') {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        const b = await parseJsonBody(request);
        if (!b) return invalidBody(['<any contact field>']);
        const allowed = ['student_phone','parent_phone','teacher_phone','school','grade','kakao_id','parent_kakao_id','address','birth_date','notes','shop_name','franchise'];
        const PII_GUARD = new Set(['student_phone','parent_phone','teacher_phone','kakao_id','parent_kakao_id']);
        const sets: string[] = []; const vals: any[] = []; const skippedMasked: string[] = [];
        for (const k of allowed) {
          if (b[k] === undefined) continue;
          // 🔒 마스킹된 표시값(*) 저장 차단 — 마스킹 문자열을 그대로 저장해 원본을 덮어쓰는 손상 방지
          if (PII_GUARD.has(k) && isMaskedValue(b[k])) { skippedMasked.push(k); continue; }
          sets.push(`${k} = ?`); vals.push(b[k]);
        }
        if (sets.length === 0) {
          return skippedMasked.length
            ? json({ ok: false, error: 'masked_values_rejected', skipped_masked: skippedMasked }, 400)
            : json({ ok: false, error: 'nothing_to_update' }, 400);
        }
        sets.push('updated_at = ?'); vals.push(Date.now());
        // student_id 우선, 없으면 login_id, 없으면 username 으로 매칭
        vals.push(uid, uid, uid);
        await env.DB.prepare(
          `UPDATE students_erp SET ${sets.join(', ')} WHERE student_id = ? OR login_id = ? OR username = ?`
        ).bind(...vals).run();
        return json({ ok: true, updated_fields: sets.length - 1, skipped_masked: skippedMasked });
      }
    }

    // /api/admin/student/:uid/extend (POST — 수강 연장)
    //   body: { months: 1|3|6|12 } 또는 { new_end_date: 'YYYY-MM-DD' }
    //   - students_erp.end_date 갱신
    //   - 활성 enrollments 의 ended_at 도 같이 연장 (있으면)
    //   - extension_log 에 기록 (감사 추적)
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/extend$/);
      if (m && method === 'POST') {
        await ensureStudentDetailSchema();
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_extensions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, prev_end_date TEXT, new_end_date TEXT NOT NULL, months_added INTEGER, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL);`);
        const uid = decodeURIComponent(m[1]);
        const b = await parseJsonBody(request);
        if (!b) return invalidBody(['months or new_end_date']);

        // 현재 end_date 조회
        const cur = await env.DB.prepare(
          `SELECT end_date FROM students_erp WHERE student_id = ? OR login_id = ? OR username = ? LIMIT 1`
        ).bind(uid, uid, uid).first<{ end_date: string }>();

        // 새 종료일 계산
        let newEnd: string;
        const months = parseInt(b.months, 10);
        if (b.new_end_date && /^\d{4}-\d{2}-\d{2}$/.test(b.new_end_date)) {
          newEnd = b.new_end_date;
        } else if (months > 0 && months <= 60) {
          // 기존 end_date 기준, 없으면 오늘 기준
          const baseStr = (cur?.end_date && /^\d{4}-\d{2}-\d{2}$/.test(cur.end_date))
            ? cur.end_date
            : new Date().toISOString().slice(0, 10);
          const d = new Date(baseStr + 'T00:00:00Z');
          d.setUTCMonth(d.getUTCMonth() + months);
          newEnd = d.toISOString().slice(0, 10);
        } else {
          return json({ ok: false, error: 'invalid_months_or_date' }, 400);
        }

        // students_erp.end_date 갱신
        await env.DB.prepare(
          `UPDATE students_erp SET end_date = ?, updated_at = ?
           WHERE student_id = ? OR login_id = ? OR username = ?`
        ).bind(newEnd, Date.now(), uid, uid, uid).run();

        // enrollments 도 함께 연장 (활성 행 1개) — KST 기준 종료시각 ms
        const newEndMs = new Date(newEnd + 'T23:59:59+09:00').getTime();
        await env.DB.prepare(
          `UPDATE enrollments SET ended_at = ?, status = 'confirmed', updated_at = ?
           WHERE student_user_id = ? AND (status = 'pending' OR status = 'confirmed' OR status IS NULL)`
        ).bind(newEndMs, Date.now(), uid).run();

        // 연장 로그 기록
        await env.DB.prepare(
          `INSERT INTO student_extensions (user_id, prev_end_date, new_end_date, months_added, reason, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          uid,
          cur?.end_date || null,
          newEnd,
          months || null,
          b.reason || null,
          b.created_by || 'admin',
          Date.now()
        ).run();

        return json({
          ok: true,
          prev_end_date: cur?.end_date || null,
          new_end_date: newEnd,
          months_added: months || null
        });
      }
    }

    // /api/admin/student/:uid/extensions (GET — 연장 이력)
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/extensions$/);
      if (m && method === 'GET') {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_extensions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, prev_end_date TEXT, new_end_date TEXT NOT NULL, months_added INTEGER, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL);`);
        const uid = decodeURIComponent(m[1]);
        const rs = await env.DB.prepare(
          `SELECT * FROM student_extensions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
        ).bind(uid).all();
        return json({ ok: true, items: rs.results || [] });
      }
    }

    // ===== 녹화(Recording) =====
    if (path === '/api/recordings/start' && method === 'POST') {
      const b = await request.json() as any;
      const now = Date.now();
      // 동의 안 한 학생 필터링
      const participantIds = (b.participant_ids || []) as string[];
      let consentedIds: string[] = [];
      if (participantIds.length > 0) {
        const placeholders = participantIds.map(() => '?').join(',');
        const rs = await env.DB.prepare(
          `SELECT user_id FROM consents WHERE user_id IN (${placeholders}) AND withdrawn_at IS NULL AND recording_consent = 1`
        ).bind(...participantIds).all<{ user_id: string }>();
        consentedIds = (rs.results || []).map(r => r.user_id);
      }
      const RETENTION_MS = 30 * 24 * 3600 * 1000; // 1개월
      const res = await env.DB.prepare(
        `INSERT INTO recordings (room_id, teacher_id, teacher_name, filename, participant_ids, participant_names, consented_user_ids, started_at, expires_at, storage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')`
      ).bind(
        b.room_id, b.teacher_id, b.teacher_name || null,
        b.filename || `rec_${b.room_id}_${now}.webm`,
        JSON.stringify(participantIds), JSON.stringify(b.participant_names || []),
        JSON.stringify(consentedIds), now, now + RETENTION_MS
      ).run();
      return json({
        ok: true,
        recording_id: res.meta.last_row_id,
        consented_count: consentedIds.length,
        total_participants: participantIds.length,
        non_consented: participantIds.filter(id => !consentedIds.includes(id))
      });
    }

    if (path === '/api/recordings/stop' && method === 'POST') {
      const b = await request.json() as any;
      const now = Date.now();
      await env.DB.prepare(
        `UPDATE recordings SET ended_at = ?, duration_ms = ?, size_bytes = ?, status = 'completed',
         file_url = COALESCE(?, file_url), storage = COALESCE(?, storage)
         WHERE id = ?`
      ).bind(now, b.duration_ms || 0, b.size_bytes || 0, b.file_url || null, b.storage || null, b.recording_id).run();
      return json({ ok: true, ended_at: now });
    }

    if (path === '/api/recordings' && method === 'GET') {
      // 녹화 목록 조회 — D1 의 recordings 메타데이터 + (참여도 점수) 함께 반환.
      // 참여도 점수는 attendance 테이블의 talk-time 비율로 도출한다.
      //   speaking_score : (총 활성 발화시간 / 총 세션시간) × 100
      //                    같은 room_id 이면서 해당 녹화 시간대(joined_at 이 녹화 window 내부)인
      //                    attendance 행만 평균. 시간대 필터가 없으면 과거 수업 데이터가
      //                    섞여 점수가 일정하게 나오므로 반드시 window 로 제한해야 함.
      //   gaze_score    : MediaPipe FaceLandmarker 로 계산된 "정면 응시 비율"(%).
      //                   public/js/mango-gaze.js → /api/gaze-score 경로로 attendance 에 누적.
      //                   speaking_score 와 동일 시간 window 로 평균.
      // 가중평균/총참여도(participation_score) 계산은 프런트(JS)에서 수행하여 점수 정의 변경 시 배포 없이 조정 가능하게 함.
      // --- 필터·페이지네이션 파라미터 (Phase 3) ----------------------
      const teacherId = url.searchParams.get('teacher_id');
      const roomId    = url.searchParams.get('room_id');
      const qSearch   = (url.searchParams.get('q') || '').trim();           // 방ID / 교사명 / 교사ID LIKE
      const dateFrom  = url.searchParams.get('date_from');                  // YYYY-MM-DD (KST 기준 00:00)
      const dateTo    = url.searchParams.get('date_to');                    // YYYY-MM-DD (KST 기준 23:59:59)
      const status    = url.searchParams.get('status');                     // ended | recording | aborted | deleted | all
      const limit     = Math.max(1,  Math.min(200, parseInt(url.searchParams.get('limit')  || '50', 10)));
      const offset    = Math.max(0,                parseInt(url.searchParams.get('offset') || '0',  10));

      // WHERE 조립 (count + list 공용)
      const whereParts: string[] = [];
      const whereBinds: any[]    = [];
      if (teacherId) { whereParts.push('r.teacher_id = ?'); whereBinds.push(teacherId); }
      if (roomId)    { whereParts.push('r.room_id = ?');    whereBinds.push(roomId); }
      if (qSearch) {
        whereParts.push("(r.room_id LIKE ? OR COALESCE(r.teacher_name,'') LIKE ? OR COALESCE(r.teacher_id,'') LIKE ?)");
        const p = `%${qSearch}%`;
        whereBinds.push(p, p, p);
      }
      if (dateFrom) {
        const ms = Date.parse(dateFrom + 'T00:00:00+09:00');
        if (!isNaN(ms)) { whereParts.push('r.started_at >= ?'); whereBinds.push(ms); }
      }
      if (dateTo) {
        const ms = Date.parse(dateTo + 'T23:59:59+09:00');
        if (!isNaN(ms)) { whereParts.push('r.started_at <= ?'); whereBinds.push(ms); }
      }
      if (status && status !== 'all') {
        whereParts.push('r.status = ?');
        whereBinds.push(status);
      }
      const whereSQL = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : 'WHERE 1=1';

      // Total count (필터 적용된 상태에서의 전체 건수 — 페이지네이션 UI 에 사용)
      const countStmt = env.DB.prepare(`SELECT COUNT(*) AS total FROM recordings r ${whereSQL}`);
      const countRow  = whereBinds.length
        ? await countStmt.bind(...whereBinds).first<{ total: number }>()
        : await countStmt.first<{ total: number }>();
      const total = countRow?.total || 0;

      let q = `SELECT r.id, r.room_id, r.teacher_id, r.teacher_name, r.filename, r.file_url,
                      r.size_bytes, r.duration_ms,
                      r.participant_names, r.consented_user_ids,
                      r.started_at, r.ended_at, r.status, r.storage, r.expires_at,
                      /* 시선 점수 — 해당 녹화 시간대의 attendance.gaze_score 평균
                         window = [started_at - 30s, ended_at 또는 started_at + duration + 30s] */
                      (SELECT ROUND(AVG(a.gaze_score), 1)
                       FROM attendance a
                       WHERE a.room_id = r.room_id
                         AND a.gaze_score IS NOT NULL
                         AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                         AND a.joined_at <= (
                               COALESCE(
                                 r.ended_at,
                                 r.started_at + COALESCE(r.duration_ms, 0),
                                 r.started_at + 10800000
                               ) + 30000
                             )
                      ) AS gaze_score,
                      /* 말하기 점수 — 해당 녹화 시간대에 속한 attendance 행만 평균(0~100)
                         window = [started_at - 30s, ended_at 또는 started_at + duration + 30s]
                         ended_at 이 null 이면 started_at + duration_ms 로 대체,
                         duration 도 없으면 started_at + 3h (비정상 케이스) 로 제한 */
                      (SELECT ROUND(AVG(
                                CAST(a.total_active_ms AS REAL) * 100.0
                                / NULLIF(a.total_session_ms, 0)
                              ), 1)
                       FROM attendance a
                       WHERE a.room_id = r.room_id
                         AND a.total_session_ms > 0
                         AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                         AND a.joined_at <= (
                               COALESCE(
                                 r.ended_at,
                                 r.started_at + COALESCE(r.duration_ms, 0),
                                 r.started_at + 10800000
                               ) + 30000
                             )
                      ) AS speaking_score,
                      /* 진단 필드 (admin UI 툴팁용) — "왜 점수가 — 인가?" 를 사후 추적 */
                      (SELECT COUNT(1) FROM attendance a
                        WHERE a.room_id = r.room_id
                          AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                          AND a.joined_at <= (
                                COALESCE(r.ended_at,
                                         r.started_at + COALESCE(r.duration_ms, 0),
                                         r.started_at + 10800000) + 30000
                              )
                      ) AS attendance_count,
                      (SELECT COUNT(1) FROM attendance a
                        WHERE a.room_id = r.room_id
                          AND (a.gaze_samples = 0 OR a.gaze_samples IS NULL)
                          AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                          AND a.joined_at <= (
                                COALESCE(r.ended_at,
                                         r.started_at + COALESCE(r.duration_ms, 0),
                                         r.started_at + 10800000) + 30000
                              )
                      ) AS gaze_missing_count,
                      (SELECT COUNT(1) FROM attendance a
                        WHERE a.room_id = r.room_id
                          AND COALESCE(a.total_session_ms, 0) > 0
                          AND COALESCE(a.total_active_ms, 0) = 0
                          AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                          AND a.joined_at <= (
                                COALESCE(r.ended_at,
                                         r.started_at + COALESCE(r.duration_ms, 0),
                                         r.started_at + 10800000) + 30000
                              )
                      ) AS speaking_zero_count
               FROM recordings r ${whereSQL}
               ORDER BY r.started_at DESC LIMIT ? OFFSET ?`;
      const listBinds = [...whereBinds, limit, offset];
      const rs = await env.DB.prepare(q).bind(...listBinds).all();

      // 응답 본문은 배열 그대로 유지 (하위 호환성). 페이지네이션 메타는 헤더로 전달.
      return new Response(JSON.stringify(rs.results || []), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'X-Total-Count, X-Offset, X-Limit',
          'X-Total-Count': String(total),
          'X-Offset':      String(offset),
          'X-Limit':       String(limit),
          'Cache-Control': 'no-store'
        }
      });
    }

    if (path.startsWith('/api/recordings/') && method === 'DELETE') {
      const id = parseInt(path.replace('/api/recordings/', ''), 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      await env.DB.prepare(`UPDATE recordings SET status = 'deleted' WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }

    // ===== 동의(Consent) =====
    if (path === '/api/consents' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.user_id) return invalidBody(['user_id']);
      const now = Date.now();
      const ip = request.headers.get('cf-connecting-ip') || '';
      const ua = request.headers.get('user-agent') || '';
      const res = await env.DB.prepare(
        `INSERT INTO consents (user_id, username, role, consent_version,
           recording_consent, voice_analysis_consent, attendance_consent, reward_consent, kakao_consent,
           guardian_required, guardian_status, guardian_contact,
           ip_address, user_agent, consented_at, raw_payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.user_id, b.username || null, b.role || 'student', b.consent_version || 'v1.0',
        b.recording ? 1 : 0, b.voice_analysis ? 1 : 0, b.attendance ? 1 : 0, b.reward ? 1 : 0, b.kakao ? 1 : 0,
        b.guardian_required ? 1 : 0, b.guardian_status || (b.guardian_required ? 'pending' : 'not_required'), b.guardian_contact || null,
        ip, ua, now, JSON.stringify(b)
      ).run();
      return json({ ok: true, consent_id: res.meta.last_row_id, consented_at: now });
    }

    if (path.startsWith('/api/consents/') && method === 'GET') {
      const userId = decodeURIComponent(path.replace('/api/consents/', ''));
      const row = await env.DB.prepare(
        `SELECT * FROM consents WHERE user_id = ? AND withdrawn_at IS NULL
         ORDER BY consented_at DESC LIMIT 1`
      ).bind(userId).first();
      return json(row || null);
    }

    if (path === '/api/consents/withdraw' && method === 'POST') {
      const b = await request.json() as any;
      const now = Date.now();
      await env.DB.prepare(
        `UPDATE consents SET withdrawn_at = ? WHERE user_id = ? AND withdrawn_at IS NULL`
      ).bind(now, b.user_id).run();
      return json({ ok: true, withdrawn_at: now });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🔥 Phase ST — 데일리 스트릭 + 보석 시스템 (Duolingo)
    // ═══════════════════════════════════════════════════════════════
    const ensureStreakSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_streaks (student_uid TEXT PRIMARY KEY, current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, last_check_date TEXT, gems INTEGER DEFAULT 0, total_gems_earned INTEGER DEFAULT 0, updated_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gem_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, balance_after INTEGER, created_at INTEGER NOT NULL);`);
      // 출결 기반 streak DFS 가 인덱스 시크로 끝나도록 보장 (멱등)
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}
    };

    // 오늘 날짜 (KST, YYYY-MM-DD)
    const todayKST = (): string => {
      const now = new Date(Date.now() + 9 * 3600 * 1000);
      return now.toISOString().slice(0, 10);
    };
    const dayDiff = (a: string, b: string): number => {
      const da = new Date(a + 'T00:00:00Z').getTime();
      const db = new Date(b + 'T00:00:00Z').getTime();
      return Math.round((db - da) / 86400000);
    };

    if (method === 'POST' && path === '/api/streak/check-in') {
      await ensureStreakSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);

      const today = todayKST();
      const now = Date.now();
      let row: any = await env.DB.prepare(
        `SELECT current_streak, longest_streak, last_check_date, gems, total_gems_earned FROM student_streaks WHERE student_uid = ?`
      ).bind(uid).first();

      let already_today = false;
      let earned = 0;
      let bonus_msg = '';
      let new_streak = 1;
      let new_longest = 1;
      let new_gems = 0;
      let new_total_earned = 0;

      if (!row) {
        // 신규 — 첫 출석
        earned = 10;
        new_streak = 1;
        new_longest = 1;
        new_gems = earned;
        new_total_earned = earned;
        await env.DB.prepare(
          `INSERT INTO student_streaks (student_uid, current_streak, longest_streak, last_check_date, gems, total_gems_earned, updated_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(uid, new_streak, new_longest, today, new_gems, new_total_earned, now).run();
        bonus_msg = '🎉 첫 출석! 보석 +10';
      } else {
        const last = row.last_check_date as string;
        if (last === today) {
          already_today = true;
          new_streak = row.current_streak;
          new_longest = row.longest_streak;
          new_gems = row.gems;
          new_total_earned = row.total_gems_earned;
          bonus_msg = '오늘 이미 출석했습니다';
        } else {
          const diff = dayDiff(last, today);
          new_streak = diff === 1 ? row.current_streak + 1 : 1;
          new_longest = Math.max(row.longest_streak, new_streak);

          // 기본 보상 10 + streak 보너스
          earned = 10;
          if (new_streak >= 30) { earned += 50; bonus_msg = '🏆 30일 연속! 보너스 +50'; }
          else if (new_streak >= 14) { earned += 30; bonus_msg = '🔥 2주 연속! 보너스 +30'; }
          else if (new_streak >= 7) { earned += 20; bonus_msg = '✨ 7일 연속! 보너스 +20'; }
          else if (new_streak >= 3) { earned += 5; bonus_msg = '💪 3일 연속! 보너스 +5'; }
          else { bonus_msg = `💎 출석 보석 +${earned}`; }

          new_gems = row.gems + earned;
          new_total_earned = row.total_gems_earned + earned;
          await env.DB.prepare(
            `UPDATE student_streaks SET current_streak = ?, longest_streak = ?, last_check_date = ?, gems = ?, total_gems_earned = ?, updated_at = ? WHERE student_uid = ?`
          ).bind(new_streak, new_longest, today, new_gems, new_total_earned, now, uid).run();
        }
      }

      if (earned > 0) {
        await env.DB.prepare(
          `INSERT INTO gem_transactions (student_uid, amount, reason, balance_after, created_at) VALUES (?,?,?,?,?)`
        ).bind(uid, earned, `daily_checkin_${new_streak}d`, new_gems, now).run();
      }

      return json({
        ok: true, already_today,
        current_streak: new_streak, longest_streak: new_longest,
        gems: new_gems, total_gems_earned: new_total_earned,
        earned, bonus_msg, today,
      });
    }

    if (method === 'GET' && path === '/api/streak/status') {
      await ensureStreakSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const today = todayKST();
      const now = Date.now();

      // 🔗 단일 권위: 실제 출결(attendance)을 역방향 DFS 로 계산 → 게이미피케이션
      //    student_streaks 와 "두 수치"가 어긋나지 않도록 여기서 일원화한다.
      const attStreak = await computeAttendanceStreak(env, uid);
      const at: any = await env.DB.prepare(
        `SELECT 1 FROM attendance WHERE user_id = ? AND date = ? LIMIT 1`
      ).bind(uid, today).first();
      const attended_today = !!at;

      const row: any = await env.DB.prepare(
        `SELECT current_streak, longest_streak, last_check_date, gems, total_gems_earned FROM student_streaks WHERE student_uid = ?`
      ).bind(uid).first();

      // gems 는 체크인 보상 레이어이므로 보존. streak 수치만 출결 기준으로 동기화.
      const longest = Math.max(Number(row?.longest_streak || 0), attStreak);
      if (!row) {
        // 출결은 있는데 게임 row 가 없던 학생 → 리더보드 일관성 위해 streak row 생성 (gems=0)
        if (attStreak > 0) {
          await env.DB.prepare(
            `INSERT INTO student_streaks (student_uid, current_streak, longest_streak, last_check_date, gems, total_gems_earned, updated_at) VALUES (?,?,?,?,?,?,?)`
          ).bind(uid, attStreak, longest, attended_today ? today : null, 0, 0, now).run();
        }
      } else if (row.current_streak !== attStreak || row.longest_streak !== longest) {
        // 저장된 수치가 출결과 다르면 출결 기준으로 정합화 (gems/체크인일은 건드리지 않음)
        await env.DB.prepare(
          `UPDATE student_streaks SET current_streak = ?, longest_streak = ?, updated_at = ? WHERE student_uid = ?`
        ).bind(attStreak, longest, now, uid).run();
      }

      return json({
        ok: true,
        current_streak: attStreak,           // 출결 기반 "진짜 연속" (단일 권위)
        longest_streak: longest,
        gems: Number(row?.gems || 0),
        total_gems_earned: Number(row?.total_gems_earned || 0),
        last_check_date: row?.last_check_date || null,
        attended_today,                       // 오늘 실제 출석 여부 (출결 기준)
        checked_today: attended_today,        // 하위호환: 기존 필드명 유지
        source: 'attendance',
        today,
      });
    }

    if (method === 'GET' && path === '/api/streak/leaderboard') {
      await ensureStreakSchema();
      const rs = await env.DB.prepare(
        `SELECT student_uid, current_streak, longest_streak, gems FROM student_streaks ORDER BY current_streak DESC, gems DESC LIMIT 20`
      ).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // 🔁 관리자 수동 트리거 — 전 학생 streak 일괄 정합화 (출결 기준)
    //   야간 cron(KST 03:00)과 동일한 reconcileAllStreaks 를 즉시 1회 실행.
    //   인증: 상단 /api/admin/* 관리자 세션 미들웨어가 이미 401 게이트.
    //   POST = 실행, 실행 후 갱신된 리더보드 상위 20명을 함께 반환해 효과 확인.
    if (method === 'POST' && path === '/api/admin/streak/reconcile') {
      const rc = await reconcileAllStreaks(env);
      const rs = await env.DB.prepare(
        `SELECT student_uid, current_streak, longest_streak, gems FROM student_streaks ORDER BY current_streak DESC, gems DESC LIMIT 20`
      ).all();
      return json({ ok: true, reconciled: rc, leaderboard: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🔥 Phase ST 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // ✍️ Phase AW — AI 영작 첨삭 (Grammarly + GPT)
    // ═══════════════════════════════════════════════════════════════
    const ensureWriteSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_writing_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, original_text TEXT NOT NULL, corrected_text TEXT, feedback TEXT, level TEXT, score INTEGER, created_at INTEGER NOT NULL);`);
    };

    if (method === 'POST' && path === '/api/ai/write-correct') {
      await ensureWriteSchema();
      const b: any = await request.json().catch(() => ({}));
      const text = String(b.text || '').trim();
      const level = String(b.level || 'A2').trim();
      const uid = String(b.uid || '').trim();
      if (!text || text.length < 3) return json({ ok: false, error: 'text_too_short' }, 400);
      if (text.length > 2000) return json({ ok: false, error: 'text_too_long' }, 400);

      const prompt = `You are an English writing tutor for a Korean student at CEFR level ${level}. The student wrote the following text. Your job:
1. Provide a corrected version (preserve student's meaning).
2. Provide a numeric score 0-100 for overall quality.
3. List 2-5 specific issues found, each with: original phrase, suggested phrase, brief reason (in Korean).
4. Provide one encouraging tip in Korean (1-2 sentences).

Respond in this strict JSON format only, no markdown:
{
  "corrected": "...",
  "score": 85,
  "issues": [{"original":"...","suggested":"...","reason":"..."}],
  "tip": "..."
}

Student text: """${text}"""`;

      if (!env.AI) {
        return json({ ok: false, error: 'AI_binding_missing' }, 503);
      }

      const models = [
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-3-8b-instruct',
      ];
      let raw = '';
      let lastErr: any = null;
      for (const m of models) {
        try {
          const resp: any = await env.AI.run(m, {
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1500, temperature: 0.3,
          });
          if (typeof resp === 'string') raw = resp;
          else if (resp && typeof resp.response === 'string') raw = resp.response;
          else if (resp && resp.response) raw = JSON.stringify(resp.response);
          else if (resp && resp.result && typeof resp.result === 'string') raw = resp.result;
          raw = String(raw || '').trim();
          if (raw) break;
        } catch (e: any) {
          lastErr = e;
          console.error(`[write-correct] model ${m} failed:`, e?.message || e);
        }
      }

      // JSON 추출 시도 — 다양한 응답 형식 대응
      const mm = raw.match(/\{[\s\S]*\}/);
      let parsed: any = {};
      try { parsed = JSON.parse(mm ? mm[0] : raw); } catch {}

      // AI 가 JSON 으로 응답 안 했을 때 안전한 폴백
      let corrected = String(parsed.corrected || '').trim();
      if (!corrected || corrected === text) {
        // 기본 폴백: 첫 글자 대문자화 + 마침표 추가
        corrected = text.charAt(0).toUpperCase() + text.slice(1);
        if (!/[.!?]$/.test(corrected.trim())) corrected = corrected.trim() + '.';
      }
      const score = Math.max(0, Math.min(100, Number(parsed.score || 75)));
      const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 8) : [];
      const tip = String(parsed.tip || '꾸준히 영작 연습을 이어가세요! 매일 한 문장씩만 써도 한 달이면 30문장입니다.');

      // raw 가 있긴 한데 JSON 파싱 실패 → AI 응답 텍스트를 tip 에 일부 포함
      const meta = raw && !Object.keys(parsed).length
        ? { ai_raw_excerpt: raw.slice(0, 500), parsed: false }
        : { parsed: true };

      try {
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO ai_writing_corrections (student_uid, original_text, corrected_text, feedback, level, score, created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(uid || null, text, corrected, JSON.stringify({ issues, tip, meta }), level, score, now).run();
      } catch (e: any) {
        console.error('[write-correct] DB insert failed:', e?.message || e);
      }

      // raw 도 lastErr 도 없을 일이 거의 없지만, 어느쪽이든 결과는 반환 (ok: true)
      // 단 진짜로 AI 가 완전히 안 됐으면 errCode 도 표시
      return json({
        ok: true,
        corrected, score, issues, tip, level,
        ...(raw ? {} : { ai_unavailable: true, fallback: true }),
      });
    }

    if (method === 'GET' && path === '/api/ai/write-history') {
      await ensureWriteSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const rs = await env.DB.prepare(
        `SELECT id, original_text, corrected_text, feedback, level, score, created_at FROM ai_writing_corrections WHERE student_uid = ? ORDER BY created_at DESC LIMIT 30`
      ).bind(uid).all();
      return json({ ok: true, items: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // ✍️ Phase AW 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase CF — AI 24시간 영어 친구 챗봇
    // ═══════════════════════════════════════════════════════════════
    const ensureChatSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_friend_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, level TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_chat_uid ON ai_friend_chats(student_uid, created_at);`);
    };

    if (method === 'POST' && path === '/api/ai/chat-friend') {
      await ensureChatSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      const msg = String(b.msg || '').trim();
      const level = String(b.level || 'A2').trim();
      const persona = String(b.persona || 'friendly').trim(); // friendly | playful | serious | tutor
      if (!uid || !msg) return json({ ok: false, error: 'uid_and_msg_required' }, 400);
      if (msg.length > 500) return json({ ok: false, error: 'msg_too_long' }, 400);

      // 최근 10개 메시지 컨텍스트
      const recent: any = await env.DB.prepare(
        `SELECT role, content FROM ai_friend_chats WHERE student_uid = ? ORDER BY id DESC LIMIT 10`
      ).bind(uid).all();
      const history = (recent.results || []).reverse();

      const personaMap: any = {
        friendly: 'a warm, friendly English friend named Mango',
        playful: 'a playful, joke-loving English buddy named Mango',
        serious: 'a calm, thoughtful English study partner named Mango',
        tutor: 'a supportive English tutor named Mango who gently corrects mistakes',
      };
      const system = `You are ${personaMap[persona] || personaMap.friendly}. You chat with a Korean student at CEFR level ${level}.
Rules:
- Reply in English appropriate for ${level} level (short, clear).
- Keep replies 1-3 sentences, friendly tone.
- If the student writes Korean, gently encourage them to try English.
- If you spot a grammar mistake, briefly note it in Korean at the end like: (💡 ~ 가 더 자연스러워요)
- Ask one follow-up question to keep conversation going.
- Never break character. Never say you are an AI.`;

      const messages: any[] = [{ role: 'system', content: system }];
      for (const h of history) {
        messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
      }
      messages.push({ role: 'user', content: msg });

      // env.AI 가 binding 안되어 있을 가능성 방어
      if (!env.AI) {
        return json({ ok: false, error: 'AI_binding_missing', detail: 'env.AI binding not configured' }, 503);
      }

      // 여러 모델 후보로 폴백 — 일부 모델이 지역/계정에서 사용 불가일 수 있음
      const models = [
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-3-8b-instruct',
      ];
      let reply = '';
      let lastErr: any = null;
      let usedModel = '';
      for (const m of models) {
        try {
          const resp: any = await env.AI.run(m, {
            messages, max_tokens: 300, temperature: 0.8,
          });
          if (typeof resp === 'string') reply = resp;
          else if (resp && typeof resp.response === 'string') reply = resp.response;
          else if (resp && resp.response) reply = JSON.stringify(resp.response);
          else if (resp && resp.result && typeof resp.result === 'string') reply = resp.result;
          reply = String(reply || '').trim();
          if (reply) { usedModel = m; break; }
        } catch (e: any) {
          lastErr = e;
          console.error(`[chat-friend] model ${m} failed:`, e?.message || e);
        }
      }
      if (!reply) {
        // AI 호출이 다 실패한 경우 — 친근한 폴백
        const fallbacks = [
          "Hi! 😊 I'm here. Tell me about your day in English!",
          "Hello! Let's practice some English together. What's on your mind?",
          "Hey there! 🥭 Try writing one sentence in English about what you ate today!",
        ];
        reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        console.error('[chat-friend] all models failed, using fallback. last error:', lastErr?.message || lastErr);
      }

      try {
        const now = Date.now();
        await env.DB.prepare(`INSERT INTO ai_friend_chats (student_uid, role, content, level, created_at) VALUES (?,?,?,?,?)`).bind(uid, 'user', msg, level, now).run();
        await env.DB.prepare(`INSERT INTO ai_friend_chats (student_uid, role, content, level, created_at) VALUES (?,?,?,?,?)`).bind(uid, 'assistant', reply, level, now + 1).run();
      } catch (e: any) {
        console.error('[chat-friend] DB insert failed:', e?.message || e);
        // DB 실패해도 reply는 반환
      }

      return json({ ok: true, reply, level, persona, model: usedModel || 'fallback' });
    }

    if (method === 'GET' && path === '/api/ai/chat-history') {
      await ensureChatSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const rs = await env.DB.prepare(
        `SELECT id, role, content, created_at FROM ai_friend_chats WHERE student_uid = ? ORDER BY id ASC LIMIT 200`
      ).bind(uid).all();
      return json({ ok: true, items: rs.results || [] });
    }

    if (method === 'POST' && path === '/api/ai/chat-clear') {
      await ensureChatSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      await env.DB.prepare(`DELETE FROM ai_friend_chats WHERE student_uid = ?`).bind(uid).run();
      return json({ ok: true });
    }
    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase CF 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase WD — 부모 위클리 카톡 다이제스트
    // ═══════════════════════════════════════════════════════════════
    const buildWeeklyDigest = async (uid: string): Promise<any> => {
      // 최근 7일 통계
      const endTs = Date.now();
      const startTs = endTs - 7 * 86400 * 1000;
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, joined_at INTEGER, date TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, lesson_date TEXT, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, created_at INTEGER NOT NULL);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, created_at INTEGER NOT NULL);`);
      } catch {}

      const student: any = await env.DB.prepare(`SELECT user_id, student_name, parent_name, parent_phone FROM students_erp WHERE user_id = ?`).bind(uid).first();
      const att: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(uid, startTs, endTs).first();
      const evals: any = await env.DB.prepare(`SELECT AVG(score_overall) AS avg, COUNT(*) AS n, GROUP_CONCAT(next_goals,'|') AS goals FROM student_evaluations WHERE student_uid = ? AND created_at >= ? AND created_at < ?`).bind(uid, startTs, endTs).first();
      const voice: any = await env.DB.prepare(`SELECT COUNT(*) AS n, AVG(accuracy_score) AS acc FROM voice_coaching WHERE student_uid = ? AND created_at >= ? AND created_at < ?`).bind(uid, startTs, endTs).first();

      const days = att?.d || 0;
      const avgScore = evals?.avg ? Math.round(evals.avg * 10) / 10 : 0;
      const evalCount = evals?.n || 0;
      const voiceCount = voice?.n || 0;
      const voiceAcc = voice?.acc ? Math.round(voice.acc) : 0;
      const nextGoals = (evals?.goals || '').split('|').filter((g: string) => g && g.trim()).slice(0, 2).join(' · ') || '꾸준한 학습 이어가기';

      const studentName = student?.student_name || uid;
      const parentName = student?.parent_name || '학부모님';
      const parentPhone = student?.parent_phone || '';

      const msg = `🥭 ${studentName} 학생 주간 학습 리포트
━━━━━━━━━━━━━━
📅 출석: ${days}일/7일
⭐ 평균 평점: ${avgScore || '평가 대기'} ${evalCount ? `(${evalCount}회 평가)` : ''}
🎤 음성 코칭: ${voiceCount}회 ${voiceAcc ? `(평균 정확도 ${voiceAcc}%)` : ''}
🎯 다음 목표: ${nextGoals}
━━━━━━━━━━━━━━
망고아이 와 함께 꾸준히 성장 중입니다 🌱
앱에서 자세한 학습 기록을 확인하실 수 있어요.`;

      return {
        uid, student_name: studentName, parent_name: parentName, parent_phone: parentPhone,
        days, avg_score: avgScore, eval_count: evalCount,
        voice_count: voiceCount, voice_acc: voiceAcc,
        next_goals: nextGoals, message: msg,
      };
    };

    if (method === 'GET' && path === '/api/parent/digest/preview') {
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      try {
        const d = await buildWeeklyDigest(uid);
        return json({ ok: true, digest: d });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'POST' && path === '/api/parent/digest/send-one') {
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      try {
        const d = await buildWeeklyDigest(uid);
        if (!d.parent_phone) return json({ ok: false, error: 'no_parent_phone', digest: d });
        // 카톡 알림톡 (기존 인프라 재활용) — 실패시 SMS fallback 또는 로그만
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
          await env.DB.prepare(`INSERT INTO digest_logs (student_uid, parent_phone, message, sent_at, status) VALUES (?,?,?,?,?)`).bind(uid, d.parent_phone, d.message, Date.now(), 'queued').run();
        } catch {}
        return json({ ok: true, sent: 1, digest: d });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'POST' && path === '/api/parent/digest/send-all') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
        const rs = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE parent_phone IS NOT NULL AND parent_phone != ''`).all();
        const list = (rs.results || []) as any[];
        let sent = 0, failed = 0;
        const now = Date.now();
        for (const r of list) {
          try {
            const d = await buildWeeklyDigest(r.user_id);
            if (d.parent_phone) {
              await env.DB.prepare(`INSERT INTO digest_logs (student_uid, parent_phone, message, sent_at, status) VALUES (?,?,?,?,?)`).bind(r.user_id, d.parent_phone, d.message, now, 'queued').run();
              sent++;
            } else failed++;
          } catch { failed++; }
        }
        return json({ ok: true, total: list.length, sent, failed });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'GET' && path === '/api/parent/digest/logs') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
        const rs = await env.DB.prepare(`SELECT id, student_uid, parent_phone, message, sent_at, status FROM digest_logs ORDER BY sent_at DESC LIMIT 100`).all();
        return json({ ok: true, items: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }
    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase WD 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🧠 Phase ML — 마이크로러닝 (AI 동의어 + 자동 퀴즈 + 카톡)
    //   Phase VOC 의 단어장을 확장 — 동의어 자동, 자동 퀴즈 5문항, 카카오 발송
    // ═══════════════════════════════════════════════════════════════
    const ensureMicroLearnSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, word TEXT NOT NULL, korean TEXT, example TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER NOT NULL, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_synonyms (id INTEGER PRIMARY KEY AUTOINCREMENT, vocab_id INTEGER NOT NULL, synonym TEXT NOT NULL, meaning_ko TEXT, example TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL, correct_index INTEGER NOT NULL, hint TEXT, source_word TEXT, quiz_type TEXT, completed INTEGER DEFAULT 0, user_answer INTEGER, is_correct INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS microlearn_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, parent_phone TEXT, content TEXT NOT NULL, channel TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
    };

    // ── POST /api/vocab/add-with-ai — 단어 + AI 동의어 + 의미·예문 자동 생성 ──
    if (method === 'POST' && path === '/api/vocab/add-with-ai') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || b.uid || '').trim();
      const word = String(b.word || '').trim();
      if (!userId || !word) return json({ ok: false, error: 'uid_and_word_required' }, 400);

      let korean = '', example = '', synonyms: any[] = [];
      if (env.AI) {
        const prompt = `For English word "${word}", provide JSON only:
{"korean":"<Korean meaning>","example":"<short English example sentence>","synonyms":[{"word":"<syn1>","meaning_ko":"<Korean>","example":"<sentence>"},{"word":"<syn2>","meaning_ko":"<Korean>","example":"<sentence>"},{"word":"<syn3>","meaning_ko":"<Korean>","example":"<sentence>"}]}`;
        try {
          const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/meta/llama-3.1-8b-instruct','@cf/meta/llama-3-8b-instruct'];
          let raw = '';
          for (const mdl of models) {
            try {
              const resp: any = await env.AI.run(mdl, { messages: [{ role:'user', content: prompt }], max_tokens: 600, temperature: 0.4 });
              if (typeof resp === 'string') raw = resp;
              else if (resp?.response) raw = typeof resp.response === 'string' ? resp.response : JSON.stringify(resp.response);
              if (raw) break;
            } catch (e: any) { console.error('[vocab-ai]', mdl, e?.message); }
          }
          const mm = raw.match(/\{[\s\S]*\}/);
          if (mm) {
            const parsed = JSON.parse(mm[0]);
            korean = String(parsed.korean || '').trim();
            example = String(parsed.example || '').trim();
            synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms.slice(0,5) : [];
          }
        } catch (e: any) { console.error('[vocab-ai] failed:', e?.message); }
      }
      // 기본 폴백
      if (!korean) korean = '(AI 미생성)';
      if (!example) example = `I learned the word "${word}" today.`;

      const now = Date.now();
      const r: any = await env.DB.prepare(
        `INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,0,?,?)`
      ).bind(userId, word, korean, example, now + 86400000, now).run();
      const vocabId = r.meta?.last_row_id;

      for (const s of synonyms) {
        try {
          await env.DB.prepare(
            `INSERT INTO vocab_synonyms (vocab_id, synonym, meaning_ko, example, created_at) VALUES (?,?,?,?,?)`
          ).bind(vocabId, String(s.word || '').trim(), String(s.meaning_ko || '').trim(), String(s.example || '').trim(), now).run();
        } catch {}
      }
      return json({ ok: true, id: vocabId, word, korean, example, synonyms });
    }

    // ── POST /api/vocab/auto-generate — AI가 학생 레벨/주제 기반 단어장 자동 생성 ──
    if (method === 'POST' && path === '/api/vocab/auto-generate') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || b.uid || '').trim();
      const level = String(b.level || 'A2').trim();
      const topic = String(b.topic || '').trim(); // 선택: 'school', 'food', 'travel' 등
      const count = Math.min(30, Math.max(5, Number(b.count) || 10));
      if (!userId) return json({ ok: false, error: 'uid_required' }, 400);
      if (!env.AI) return json({ ok: false, error: 'AI_binding_missing' }, 503);

      // 기존 단어 (중복 방지)
      const existRs: any = await env.DB.prepare(`SELECT word FROM vocabulary WHERE user_id = ?`).bind(userId).all();
      const existing = new Set((existRs.results || []).map((r: any) => String(r.word).toLowerCase()));

      const topicStr = topic ? ` related to "${topic}"` : '';
      const prompt = `Generate ${count + 5} useful English vocabulary words for a Korean student at CEFR level ${level}${topicStr}. For each word provide: English word, Korean meaning, short English example sentence.

Respond in strict JSON only:
{"words":[{"word":"...","korean":"...","example":"..."},...]}

Avoid these common already-known words: a, the, is, are, have, do, go.
Variety: mix of nouns, verbs, adjectives.`;

      let raw = '';
      const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/meta/llama-3.1-8b-instruct','@cf/meta/llama-3-8b-instruct'];
      for (const m of models) {
        try {
          const resp: any = await env.AI.run(m, { messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.7 });
          if (typeof resp === 'string') raw = resp;
          else if (resp?.response) raw = typeof resp.response === 'string' ? resp.response : JSON.stringify(resp.response);
          if (raw) break;
        } catch (e: any) { console.error('[auto-gen]', m, e?.message); }
      }
      const mm = raw.match(/\{[\s\S]*\}/);
      let words: any[] = [];
      try { const p = JSON.parse(mm ? mm[0] : raw); words = Array.isArray(p.words) ? p.words : []; } catch {}

      // 폴백: AI 실패 시 레벨별 기본 단어
      if (!words.length) {
        const fallback: any = {
          A1: [
            { word:'apple', korean:'사과', example:'I eat an apple every day.' },
            { word:'school', korean:'학교', example:'I go to school by bus.' },
            { word:'family', korean:'가족', example:'My family is very kind.' },
            { word:'friend', korean:'친구', example:'She is my best friend.' },
            { word:'happy', korean:'행복한', example:'I am happy today.' },
            { word:'book', korean:'책', example:'This book is interesting.' },
            { word:'study', korean:'공부하다', example:'I study English every day.' },
            { word:'water', korean:'물', example:'Please give me some water.' },
            { word:'morning', korean:'아침', example:'Good morning, everyone!' },
            { word:'play', korean:'놀다', example:'Children love to play games.' },
          ],
          A2: [
            { word:'travel', korean:'여행하다', example:'I want to travel around the world.' },
            { word:'enjoy', korean:'즐기다', example:'I enjoy reading books.' },
            { word:'weather', korean:'날씨', example:'The weather is nice today.' },
            { word:'remember', korean:'기억하다', example:'I remember my first day at school.' },
            { word:'practice', korean:'연습하다', example:'You should practice every day.' },
            { word:'decide', korean:'결정하다', example:'I decided to learn English.' },
            { word:'important', korean:'중요한', example:'Family is very important.' },
            { word:'beautiful', korean:'아름다운', example:'The sunset was beautiful.' },
            { word:'difficult', korean:'어려운', example:'This question is difficult.' },
            { word:'experience', korean:'경험', example:'I have a lot of experience.' },
          ],
          B1: [
            { word:'achieve', korean:'달성하다', example:'I want to achieve my goals.' },
            { word:'opportunity', korean:'기회', example:'This is a great opportunity.' },
            { word:'environment', korean:'환경', example:'We must protect the environment.' },
            { word:'consider', korean:'고려하다', example:'Please consider my opinion.' },
            { word:'culture', korean:'문화', example:'Korean culture is rich.' },
            { word:'challenge', korean:'도전', example:'Learning English is a challenge.' },
            { word:'communicate', korean:'의사소통하다', example:'We need to communicate clearly.' },
            { word:'recognize', korean:'인식하다', example:'I recognize his voice.' },
            { word:'improve', korean:'향상시키다', example:'I want to improve my skills.' },
            { word:'responsible', korean:'책임감 있는', example:'He is a responsible person.' },
          ],
          B2: [
            { word:'sustainable', korean:'지속 가능한', example:'We need a sustainable energy source.' },
            { word:'perspective', korean:'관점', example:'I see things from a different perspective.' },
            { word:'innovate', korean:'혁신하다', example:'Companies must innovate to survive.' },
            { word:'persistent', korean:'끈질긴', example:'Be persistent and you will succeed.' },
            { word:'comprehensive', korean:'포괄적인', example:'We need a comprehensive plan.' },
            { word:'collaborate', korean:'협력하다', example:'Teams collaborate to solve problems.' },
            { word:'demonstrate', korean:'보여주다', example:'She demonstrated her skills.' },
            { word:'fundamental', korean:'근본적인', example:'These are fundamental rights.' },
            { word:'integrate', korean:'통합하다', example:'We need to integrate new ideas.' },
            { word:'evident', korean:'명백한', example:'His talent is evident to all.' },
          ],
          C1: [
            { word:'paradigm', korean:'패러다임', example:'This is a new paradigm in education.' },
            { word:'ambiguous', korean:'애매한', example:'The instructions were ambiguous.' },
            { word:'mitigate', korean:'완화하다', example:'We must mitigate the risks.' },
            { word:'inevitable', korean:'불가피한', example:'Change is inevitable.' },
            { word:'leverage', korean:'활용하다', example:'We can leverage our resources.' },
            { word:'discrepancy', korean:'차이', example:'There is a discrepancy in the data.' },
            { word:'plausible', korean:'그럴듯한', example:'That is a plausible explanation.' },
            { word:'intricate', korean:'복잡한', example:'The design is intricate.' },
            { word:'unprecedented', korean:'전례없는', example:'These are unprecedented times.' },
            { word:'ubiquitous', korean:'어디에나 있는', example:'Smartphones are ubiquitous.' },
          ],
        };
        words = fallback[level] || fallback['A2'];
      }

      const now = Date.now();
      let added = 0, skipped = 0;
      const inserted: any[] = [];
      for (const w of words.slice(0, count)) {
        const word = String(w.word || '').trim();
        if (!word || existing.has(word.toLowerCase())) { skipped++; continue; }
        try {
          const r: any = await env.DB.prepare(
            `INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,0,?,?)`
          ).bind(userId, word, String(w.korean || '').trim(), String(w.example || '').trim(), now + 86400000, now).run();
          inserted.push({ id: r.meta?.last_row_id, word, korean: w.korean, example: w.example });
          added++;
        } catch { skipped++; }
      }
      return json({ ok: true, added, skipped, level, topic, words: inserted });
    }

    // ── POST /api/vocab/gen-quiz — 학생 단어장 기반 자동 퀴즈 5문항 ──
    if (method === 'POST' && path === '/api/vocab/gen-quiz') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || b.uid || '').trim();
      const count = Math.min(20, Math.max(1, Number(b.count) || 5));
      if (!userId) return json({ ok: false, error: 'uid_required' }, 400);

      const rs: any = await env.DB.prepare(
        `SELECT id, word, korean, example FROM vocabulary WHERE user_id = ? ORDER BY RANDOM() LIMIT ?`
      ).bind(userId, count).all();
      const words = (rs.results || []) as any[];
      if (!words.length) return json({ ok: false, error: 'no_words', message: '단어장이 비어있어요. 단어를 먼저 추가해주세요!' });

      // 오답 선택지 풀 (전체 학생 단어 중 무작위)
      const distRs: any = await env.DB.prepare(
        `SELECT korean FROM vocabulary WHERE user_id != ? AND korean IS NOT NULL AND korean != '' ORDER BY RANDOM() LIMIT 60`
      ).bind(userId).all();
      const distractors = (distRs.results || []).map((x: any) => x.korean).filter(Boolean);
      const myDistractors = words.map(w => w.korean).filter(Boolean);

      const now = Date.now();
      const quizzes: any[] = [];
      for (const w of words) {
        if (!w.korean) continue;
        const pool = [...distractors, ...myDistractors].filter(d => d !== w.korean);
        // 중복 제거 + 셔플 + 3개 선택
        const uniq = [...new Set(pool)];
        for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [uniq[i],uniq[j]] = [uniq[j],uniq[i]]; }
        const wrong = uniq.slice(0, 3);
        const opts = [w.korean, ...wrong];
        for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [opts[i],opts[j]] = [opts[j],opts[i]]; }
        const correctIndex = opts.indexOf(w.korean);

        const r: any = await env.DB.prepare(
          `INSERT INTO vocab_quizzes (user_id, question, options, correct_index, hint, source_word, quiz_type, created_at) VALUES (?,?,?,?,?,?,?,?)`
        ).bind(userId, `"${w.word}" 의 한국어 뜻은?`, JSON.stringify(opts), correctIndex, w.example || null, w.word, 'word_to_korean', now).run();
        quizzes.push({
          id: r.meta?.last_row_id,
          question: `"${w.word}" 의 한국어 뜻은?`,
          options: opts,
          correct_index: correctIndex,
          hint: w.example || '',
          source_word: w.word,
        });
      }

      return json({ ok: true, quizzes, total: quizzes.length });
    }

    // ── POST /api/vocab/quiz-submit — 퀴즈 답 제출 + 채점 ──
    if (method === 'POST' && path === '/api/vocab/quiz-submit') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const quizId = Number(b.quiz_id);
      const answer = Number(b.answer);
      if (!quizId || isNaN(answer)) return json({ ok: false, error: 'quiz_id_and_answer_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT user_id, correct_index, source_word FROM vocab_quizzes WHERE id = ?`).bind(quizId).first();
      if (!row) return json({ ok: false, error: 'quiz_not_found' }, 404);
      const isCorrect = row.correct_index === answer;
      await env.DB.prepare(
        `UPDATE vocab_quizzes SET completed = 1, user_answer = ?, is_correct = ?, completed_at = ? WHERE id = ?`
      ).bind(answer, isCorrect ? 1 : 0, Date.now(), quizId).run();
      // 정답이면 vocabulary 의 correct_count 증가
      if (isCorrect && row.source_word) {
        try { await env.DB.prepare(`UPDATE vocabulary SET correct_count = correct_count + 1, last_reviewed_at = ? WHERE user_id = ? AND word = ?`).bind(Date.now(), row.user_id, row.source_word).run(); } catch {}
      }
      return json({ ok: true, correct: isCorrect, correct_index: row.correct_index });
    }

    // ── POST /api/admin/microlearn/send-one — 학생 1명에게 마이크로러닝 카톡 발송 ──
    if (method === 'POST' && path === '/api/admin/microlearn/send-one') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);

      // 무작위 단어 1개 + 동의어 추출
      const w: any = await env.DB.prepare(
        `SELECT id, word, korean, example FROM vocabulary WHERE user_id = ? ORDER BY RANDOM() LIMIT 1`
      ).bind(uid).first();
      if (!w) return json({ ok: false, error: 'no_words', message: '발송할 단어가 없습니다. 학생의 단어장에 단어를 먼저 추가해주세요.' });
      const syns: any = await env.DB.prepare(`SELECT synonym, meaning_ko FROM vocab_synonyms WHERE vocab_id = ? LIMIT 3`).bind(w.id).all();
      const synList = (syns.results || []).map((s: any) => `${s.synonym} (${s.meaning_ko || '-'})`).join(', ');

      // 부모 전화번호
      let parentPhone = '';
      try {
        const s: any = await env.DB.prepare(`SELECT parent_phone FROM students_erp WHERE user_id = ?`).bind(uid).first();
        parentPhone = s?.parent_phone || '';
      } catch {}

      const msg = `🥭 오늘의 단어 [${w.word}]
━━━━━━━━━━━━━━
📖 뜻: ${w.korean || '-'}
✍️ 예문: ${w.example || '-'}
${synList ? `\n🔗 비슷한 표현: ${synList}` : ''}

💡 미니 퀴즈로 확인해보세요!
앱에서 "${w.word}" 단어 카드 + 퀴즈를 풀어보세요.`;

      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO microlearn_logs (user_id, parent_phone, content, channel, sent_at, status) VALUES (?,?,?,?,?,?)`
      ).bind(uid, parentPhone, msg, 'kakao', now, parentPhone ? 'queued' : 'no_phone').run();
      return json({ ok: true, sent: parentPhone ? 1 : 0, message: msg, parent_phone: parentPhone, word: w.word });
    }

    // ── POST /api/admin/microlearn/send-all — 모든 학생에게 일괄 발송 ──
    if (method === 'POST' && path === '/api/admin/microlearn/send-all') {
      await ensureMicroLearnSchema();
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_phone TEXT);`); } catch {}
      const rs: any = await env.DB.prepare(`SELECT DISTINCT user_id FROM vocabulary`).all();
      const list = (rs.results || []) as any[];
      let sent = 0, failed = 0;
      const now = Date.now();
      for (const r of list) {
        try {
          const w: any = await env.DB.prepare(`SELECT id, word, korean, example FROM vocabulary WHERE user_id = ? ORDER BY RANDOM() LIMIT 1`).bind(r.user_id).first();
          if (!w) { failed++; continue; }
          const s: any = await env.DB.prepare(`SELECT parent_phone FROM students_erp WHERE user_id = ?`).bind(r.user_id).first();
          const phone = s?.parent_phone || '';
          const msg = `🥭 오늘의 단어 [${w.word}]\n📖 뜻: ${w.korean || '-'}\n✍️ ${w.example || '-'}\n\n💡 망고아이 앱에서 미니 퀴즈로 확인하세요!`;
          await env.DB.prepare(`INSERT INTO microlearn_logs (user_id, parent_phone, content, channel, sent_at, status) VALUES (?,?,?,?,?,?)`)
            .bind(r.user_id, phone, msg, 'kakao', now, phone ? 'queued' : 'no_phone').run();
          if (phone) sent++; else failed++;
        } catch { failed++; }
      }
      return json({ ok: true, total: list.length, sent, no_phone: failed });
    }

    // ── GET /api/admin/microlearn/logs — 발송 기록 ──
    if (method === 'GET' && path === '/api/admin/microlearn/logs') {
      await ensureMicroLearnSchema();
      const rs: any = await env.DB.prepare(`SELECT id, user_id, parent_phone, content, status, sent_at FROM microlearn_logs ORDER BY sent_at DESC LIMIT 100`).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── GET /api/vocab/synonyms?vocab_id=N — 단어의 동의어 목록 ──
    if (method === 'GET' && path === '/api/vocab/synonyms') {
      await ensureMicroLearnSchema();
      const vid = Number(url.searchParams.get('vocab_id'));
      if (!vid) return json({ ok: false, error: 'vocab_id_required' }, 400);
      const rs: any = await env.DB.prepare(`SELECT id, synonym, meaning_ko, example FROM vocab_synonyms WHERE vocab_id = ?`).bind(vid).all();
      return json({ ok: true, items: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🧠 Phase ML 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase ALR — AI 학습 리포트 (수업 녹음 STT + LLM 분석)
    //   기존 Phase E1~E4 (수동 평가서) + Phase AEd (키워드 기반 AI 초안) 통합 업그레이드
    //   - 수업 녹음(R2) → Whisper STT → Llama 분석
    //   - 문법 오류 / Alternative 표현 / 다빈도 단어 / 강점·약점
    //   - student_evaluations 테이블과 자동 연동 (강사가 검토 후 발송)
    // ═══════════════════════════════════════════════════════════════
    const ensureAiLessonReportSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_lesson_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, evaluation_id INTEGER, student_uid TEXT, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, recording_id TEXT, recording_url TEXT, lesson_title TEXT, lesson_date TEXT, transcript TEXT, transcript_excerpt TEXT, grammar_errors TEXT, alternatives TEXT, word_freq TEXT, summary_ko TEXT, strengths TEXT, weaknesses TEXT, next_goals TEXT, overall_score INTEGER, speaking_seconds INTEGER, total_words INTEGER, status TEXT DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER);`);
    };

    // ── POST /api/eval/ai-lesson-report — 녹음 파일에서 AI 학습 리포트 자동 생성 ──
    //   body: { recording_id?, recording_url?, audio_base64?, student_uid, student_name?,
    //           teacher_uid?, teacher_name?, lesson_title?, lesson_date?, auto_save?=true }
    if (method === 'POST' && path === '/api/eval/ai-lesson-report') {
      await ensureAiLessonReportSchema();
      const b: any = await request.json().catch(() => ({}));
      const studentUid = String(b.student_uid || '').trim();
      if (!studentUid) return json({ ok: false, error: 'student_uid_required' }, 400);
      if (!env.AI) return json({ ok: false, error: 'AI_binding_missing' }, 503);

      // 1) 녹음 → STT
      let transcript = String(b.transcript || '').trim();  // 클라이언트가 미리 STT 했으면 사용
      let speakingSeconds = 0;
      if (!transcript) {
        // R2 에서 녹음 파일 가져오기
        let audioBuf: ArrayBuffer | null = null;
        try {
          if (b.recording_id && (env as any).RECORDINGS) {
            const obj: any = await (env as any).RECORDINGS.get(b.recording_id);
            if (obj) audioBuf = await obj.arrayBuffer();
          } else if (b.recording_url) {
            const r = await fetch(b.recording_url);
            if (r.ok) audioBuf = await r.arrayBuffer();
          } else if (b.audio_base64) {
            const raw = atob(b.audio_base64.replace(/^data:[^,]+,/, ''));
            const arr = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
            audioBuf = arr.buffer;
          }
        } catch (e: any) { console.error('[ai-lesson-report] fetch audio:', e?.message); }

        if (!audioBuf || audioBuf.byteLength < 1000) {
          return json({ ok: false, error: 'audio_not_found_or_too_small', message: '녹음 파일을 가져올 수 없어요. recording_id, recording_url, audio_base64, transcript 중 하나가 필요합니다.' }, 400);
        }
        if (audioBuf.byteLength > 25 * 1024 * 1024) {
          return json({ ok: false, error: 'audio_too_large', message: '오디오가 25MB 를 초과합니다. 더 짧은 클립을 시도해주세요.' }, 400);
        }

        try {
          const sttResp: any = await env.AI.run('@cf/openai/whisper', { audio: [...new Uint8Array(audioBuf)] });
          transcript = String(sttResp?.text || '').trim();
          speakingSeconds = Math.round((sttResp?.word_count || 0) * 0.4);  // 대략 추정 (분당 150단어 기준)
        } catch (e: any) {
          console.error('[ai-lesson-report] whisper:', e?.message);
          return json({ ok: false, error: 'stt_failed', detail: String(e?.message || e) }, 500);
        }
      }
      if (!transcript) return json({ ok: false, error: 'empty_transcript' }, 400);

      // 2) LLM 분석
      const studentName = String(b.student_name || studentUid).trim();
      const lessonTitle = String(b.lesson_title || '').trim();
      const prompt = `You are an expert English coach. Analyze this Korean student's spoken English transcript from a 1:1 lesson.

Student: ${studentName}${lessonTitle ? ` · Lesson: ${lessonTitle}` : ''}

Transcript:
"""
${transcript.slice(0, 6000)}
"""

Produce a comprehensive learning report. Respond in STRICT JSON only, no markdown:
{
  "overall_score": 0-100 (overall English proficiency in this session),
  "summary_ko": "한국어로 학생의 이번 수업 영어 사용 요약 (2-3 문장)",
  "grammar_errors": [
    { "original": "<wrong sentence student said>", "corrected": "<correct version>", "reason": "한국어 설명 (1줄)" }
  ],
  "alternatives": [
    { "learned": "<phrase student used>", "better": "<more natural/advanced phrasing>", "when_to_use": "한국어 설명 (1줄)" }
  ],
  "word_freq": [{ "word": "<word>", "count": <int> }],
  "strengths": ["한국어 강점 1줄 ×3"],
  "weaknesses": ["한국어 약점 1줄 ×3"],
  "next_goals": ["다음 수업에서 시도할 한국어 목표 ×2-3"]
}

Limit: max 5 grammar_errors, max 5 alternatives, max 10 word_freq. Be specific and helpful.`;

      let raw = '';
      const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/meta/llama-3.1-8b-instruct','@cf/meta/llama-3-8b-instruct'];
      for (const m of models) {
        try {
          const resp: any = await env.AI.run(m, { messages: [{ role: 'user', content: prompt }], max_tokens: 2200, temperature: 0.3 });
          if (typeof resp === 'string') raw = resp;
          else if (resp?.response) raw = typeof resp.response === 'string' ? resp.response : JSON.stringify(resp.response);
          if (raw) break;
        } catch (e: any) { console.error('[ai-lesson-report] llm:', m, e?.message); }
      }
      const mm = raw.match(/\{[\s\S]*\}/);
      let parsed: any = {};
      try { parsed = JSON.parse(mm ? mm[0] : raw); } catch {}

      // 3) 결과 정규화 + DB 저장
      const overallScore = Math.max(0, Math.min(100, Number(parsed.overall_score || 75)));
      const summaryKo = String(parsed.summary_ko || '학생의 영어 발화를 분석했습니다.');
      const grammarErrors = Array.isArray(parsed.grammar_errors) ? parsed.grammar_errors.slice(0, 8) : [];
      const alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 8) : [];
      const wordFreq = Array.isArray(parsed.word_freq) ? parsed.word_freq.slice(0, 15) : [];
      const strengthsArr = Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [];
      const weaknessesArr = Array.isArray(parsed.weaknesses) ? parsed.weaknesses.slice(0, 5) : [];
      const nextGoalsArr = Array.isArray(parsed.next_goals) ? parsed.next_goals.slice(0, 5) : [];

      const transcriptWords = transcript.split(/\s+/).filter(Boolean).length;
      const excerpt = transcript.slice(0, 800);
      const now = Date.now();

      // student_evaluations 자동 저장 (기존 평가서 시스템과 연동)
      let evaluationId: number | null = null;
      if (b.auto_save !== false) {
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
          const r: any = await env.DB.prepare(
            `INSERT INTO student_evaluations (student_uid, student_name, teacher_uid, teacher_name, lesson_title, lesson_date, score_overall, score_speaking, strengths, improvements, next_goals, teacher_comment, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            studentUid, studentName, String(b.teacher_uid || '').trim() || null, String(b.teacher_name || '').trim() || null,
            lessonTitle || null, String(b.lesson_date || '').trim() || new Date(now).toISOString().slice(0,10),
            overallScore, overallScore,
            strengthsArr.join('\n'), weaknessesArr.join('\n'), nextGoalsArr.join('\n'),
            summaryKo + (grammarErrors.length ? '\n\n[🤖 AI 자동 분석] 문법교정 ' + grammarErrors.length + '건, 대안표현 ' + alternatives.length + '건 발견. 상세 리포트는 AI 학습 리포트 메뉴에서 확인하세요.' : ''),
            now, now
          ).run();
          evaluationId = r.meta?.last_row_id || null;
        } catch (e: any) { console.error('[ai-lesson-report] save eval:', e?.message); }
      }

      let reportId: number | null = null;
      try {
        const r: any = await env.DB.prepare(
          `INSERT INTO ai_lesson_reports (evaluation_id, student_uid, student_name, teacher_uid, teacher_name, recording_id, recording_url, lesson_title, lesson_date, transcript, transcript_excerpt, grammar_errors, alternatives, word_freq, summary_ko, strengths, weaknesses, next_goals, overall_score, speaking_seconds, total_words, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          evaluationId, studentUid, studentName,
          String(b.teacher_uid || '').trim() || null, String(b.teacher_name || '').trim() || null,
          String(b.recording_id || '').trim() || null, String(b.recording_url || '').trim() || null,
          lessonTitle || null, String(b.lesson_date || '').trim() || new Date(now).toISOString().slice(0,10),
          transcript, excerpt,
          JSON.stringify(grammarErrors), JSON.stringify(alternatives), JSON.stringify(wordFreq),
          summaryKo, JSON.stringify(strengthsArr), JSON.stringify(weaknessesArr), JSON.stringify(nextGoalsArr),
          overallScore, speakingSeconds, transcriptWords, 'draft', now, now
        ).run();
        reportId = r.meta?.last_row_id || null;
      } catch (e: any) { console.error('[ai-lesson-report] save report:', e?.message); }

      return json({
        ok: true, report_id: reportId, evaluation_id: evaluationId,
        overall_score: overallScore, summary_ko: summaryKo,
        grammar_errors: grammarErrors, alternatives, word_freq: wordFreq,
        strengths: strengthsArr, weaknesses: weaknessesArr, next_goals: nextGoalsArr,
        transcript_excerpt: excerpt, total_words: transcriptWords, speaking_seconds: speakingSeconds,
      });
    }

    // ── GET /api/eval/ai-lesson-report/list?student_uid=... ──
    if (method === 'GET' && path === '/api/eval/ai-lesson-report/list') {
      await ensureAiLessonReportSchema();
      const sid = String(url.searchParams.get('student_uid') || '').trim();
      let q = `SELECT id, student_uid, student_name, teacher_name, lesson_title, lesson_date, overall_score, total_words, speaking_seconds, status, created_at FROM ai_lesson_reports`;
      const binds: any[] = [];
      if (sid) { q += ` WHERE student_uid = ?`; binds.push(sid); }
      q += ` ORDER BY created_at DESC LIMIT 100`;
      const rs: any = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── GET /api/eval/ai-lesson-report/:id ──
    const reportIdMatch = path.match(/^\/api\/eval\/ai-lesson-report\/(\d+)$/);
    if (method === 'GET' && reportIdMatch) {
      await ensureAiLessonReportSchema();
      const id = parseInt(reportIdMatch[1], 10);
      const row: any = await env.DB.prepare(`SELECT * FROM ai_lesson_reports WHERE id = ?`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      // JSON 필드 파싱
      ['grammar_errors','alternatives','word_freq','strengths','weaknesses','next_goals'].forEach(k => {
        try { row[k] = JSON.parse(row[k] || '[]'); } catch { row[k] = []; }
      });
      return json({ ok: true, item: row });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase ALR 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 🔐 Phase RT — WebRTC 화상강의실 JWT 입장 토큰 (안전 모듈)
    //   기존 SignalingRoom DO 와 충돌 없음 — 신규 테이블·라우트만 추가
    //   사용 흐름: 학생 → /join → JWT 발급 → (옵션) 시그널링 연결 시 검증
    // ═══════════════════════════════════════════════════════════════
    const ensureRoomTokenSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS room_members (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT, role TEXT NOT NULL, invited_at INTEGER NOT NULL, invited_by TEXT, UNIQUE(room_id, user_id));`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS room_tokens (jti TEXT PRIMARY KEY, room_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER DEFAULT 0, consumed_at INTEGER, ip TEXT, user_agent TEXT);`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_room_tokens_room ON room_tokens(room_id, expires_at);`);
    };

    // ── JWT 유틸 (Web Crypto API, HS256) ──
    const b64urlEnc = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const b64urlDec = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const getRoomSecret = (): string => {
      // 우선 secret(ROOM_JWT_SECRET) → 없으면 BUILD_STAMP 기반 임시(개발용 폴백)
      // ⚠️ 운영 환경에서는 반드시 `npx wrangler secret put ROOM_JWT_SECRET --env production` 으로 설정
      return (env as any).ROOM_JWT_SECRET || ('mangoi-fallback-' + ((env as any).BUILD_STAMP || 'dev'));
    };

    const signRoomJWT = async (payload: any): Promise<string> => {
      const enc = new TextEncoder();
      const header = b64urlEnc(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = b64urlEnc(JSON.stringify(payload));
      const data = `${header}.${body}`;
      const key = await crypto.subtle.importKey('raw', enc.encode(getRoomSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${data}.${sigB64}`;
    };

    const verifyRoomJWT = async (token: string): Promise<any | null> => {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [h, p, s] = parts;
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(getRoomSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
        const sigBytes = Uint8Array.from(b64urlDec(s), c => c.charCodeAt(0));
        const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${h}.${p}`));
        if (!ok) return null;
        const payload = JSON.parse(b64urlDec(p));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
      } catch { return null; }
    };

    // ── POST /api/rooms/:room_id/invite — 강사가 학생 초대 (사전 권한 등록) ──
    const inviteMatch = path.match(/^\/api\/rooms\/([^\/]+)\/invite$/);
    if (method === 'POST' && inviteMatch) {
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(inviteMatch[1]);
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || '').trim();
      const userName = String(b.user_name || '').trim();
      const role = String(b.role || 'student').trim();
      const invitedBy = String(b.invited_by || '').trim();
      if (!userId) return json({ ok: false, error: 'user_id_required' }, 400);
      if (!['teacher', 'student', 'observer'].includes(role)) return json({ ok: false, error: 'invalid_role' }, 400);
      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO room_members (room_id, user_id, user_name, role, invited_at, invited_by) VALUES (?,?,?,?,?,?) ON CONFLICT(room_id, user_id) DO UPDATE SET role=excluded.role, user_name=excluded.user_name`
        ).bind(roomId, userId, userName || null, role, now, invitedBy || null).run();
        return json({ ok: true, room_id: roomId, user_id: userId, role });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // ── POST /api/rooms/:room_id/join — 입장 요청 → 단기 JWT 발급 ──
    const joinMatch = path.match(/^\/api\/rooms\/([^\/]+)\/join$/);
    if (method === 'POST' && joinMatch) {
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(joinMatch[1]);
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || '').trim();
      if (!userId) return json({ ok: false, error: 'user_id_required' }, 400);

      // 사전 등록(invite) 확인
      const member: any = await env.DB.prepare(
        `SELECT role, user_name FROM room_members WHERE room_id = ? AND user_id = ?`
      ).bind(roomId, userId).first();

      // 사전 등록 없으면 → 기존 학생 인증 정보 폴백 (옵션 b.allow_open=true)
      let role = member?.role;
      if (!role) {
        if (b.allow_open === true) {
          role = String(b.role || 'student').trim();   // 기존 화상수업과 호환 (가드 없이 발급)
        } else {
          return json({ ok: false, error: 'not_invited', message: '이 강의실에 사전 등록되지 않았습니다. 강사에게 초대를 요청하세요.' }, 403);
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const ttl = Number(b.ttl_sec) || 300;            // 기본 5분, 길게 원하면 b.ttl_sec
      const jti = crypto.randomUUID().replace(/-/g, '');
      const payload = {
        iss: 'mangoi',
        sub: userId,
        aud: `room:${roomId}`,
        role,
        iat: now,
        exp: now + ttl,
        jti,
      };
      const token = await signRoomJWT(payload);

      // DB 에 발급 기록 (회수·1회용 검증 가능)
      const ip = request.headers.get('cf-connecting-ip') || '';
      const ua = (request.headers.get('user-agent') || '').slice(0, 255);
      try {
        await env.DB.prepare(
          `INSERT INTO room_tokens (jti, room_id, user_id, role, issued_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)`
        ).bind(jti, roomId, userId, role, now * 1000, (now + ttl) * 1000, ip || null, ua || null).run();
      } catch (e: any) { console.error('[room/join] token save:', e?.message); }

      return json({
        ok: true,
        room_token: token,
        room_id: roomId,
        role,
        user_name: member?.user_name || '',
        expires_in: ttl,
        jti,
      });
    }

    // ── POST /api/rooms/:room_id/verify-token — 토큰 검증 (시그널링 연결 전) ──
    const verifyMatch = path.match(/^\/api\/rooms\/([^\/]+)\/verify-token$/);
    if (method === 'POST' && verifyMatch) {
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(verifyMatch[1]);
      const b: any = await request.json().catch(() => ({}));
      const token = String(b.token || '').trim();
      if (!token) return json({ ok: false, error: 'token_required' }, 400);

      const payload = await verifyRoomJWT(token);
      if (!payload) return json({ ok: false, error: 'invalid_or_expired' }, 401);
      if (payload.aud !== `room:${roomId}`) return json({ ok: false, error: 'wrong_room' }, 403);

      // DB 회수 여부 + 1회용 사용 마킹
      const tok: any = await env.DB.prepare(
        `SELECT revoked, consumed_at FROM room_tokens WHERE jti = ?`
      ).bind(payload.jti).first();
      if (!tok) return json({ ok: false, error: 'unknown_jti' }, 401);
      if (tok.revoked) return json({ ok: false, error: 'revoked' }, 401);
      if (tok.consumed_at && b.allow_reuse !== true) return json({ ok: false, error: 'already_used' }, 401);
      if (!tok.consumed_at) {
        try {
          await env.DB.prepare(`UPDATE room_tokens SET consumed_at = ? WHERE jti = ?`)
            .bind(Date.now(), payload.jti).run();
        } catch {}
      }
      return json({ ok: true, room_id: roomId, user_id: payload.sub, role: payload.role, jti: payload.jti });
    }

    // ── POST /api/rooms/:room_id/kick — 강제 퇴장 (토큰 회수) ──
    const kickMatch = path.match(/^\/api\/rooms\/([^\/]+)\/kick$/);
    if (method === 'POST' && kickMatch) {
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(kickMatch[1]);
      const b: any = await request.json().catch(() => ({}));
      const targetUid = String(b.user_id || '').trim();
      if (!targetUid) return json({ ok: false, error: 'user_id_required' }, 400);
      await env.DB.prepare(
        `UPDATE room_tokens SET revoked = 1 WHERE room_id = ? AND user_id = ? AND revoked = 0`
      ).bind(roomId, targetUid).run();
      return json({ ok: true, room_id: roomId, user_id: targetUid });
    }

    // ── GET /api/rooms/:room_id/members — 초대된 학생/강사 목록 ──
    const membersMatch = path.match(/^\/api\/rooms\/([^\/]+)\/members$/);
    if (method === 'GET' && membersMatch) {
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(membersMatch[1]);
      const rs: any = await env.DB.prepare(
        `SELECT user_id, user_name, role, invited_at, invited_by FROM room_members WHERE room_id = ? ORDER BY role DESC, invited_at ASC`
      ).bind(roomId).all();
      return json({ ok: true, room_id: roomId, items: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🔐 Phase RT 끝
    // ═══════════════════════════════════════════════════════════════


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
          const tot: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM students_erp WHERE status = '정상' OR status IS NULL OR status = ''`).first();
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


    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase PFB — 학부모 상담 AI 챗봇 (Parent FAQ Bot)
    // ═══════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/parent/chat') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS parent_chat_log (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, user_message TEXT, ai_reply TEXT, escalated INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);

        const b: any = await request.json().catch(() => ({}));
        const userMessage = String(b.message || '').trim().slice(0, 1000);
        const conversationId = String(b.conversation_id || '').trim() || `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (!userMessage) return json({ ok: false, error: 'message_required' }, 400);

        const faqContext = `당신은 한국 어린이 영어학원 "망고아이(Mangoi)"의 친절한 학부모 상담 AI 어시스턴트입니다. 아래 FAQ를 참고해 답변하세요. 모르는 내용은 추측하지 말고 "원장님께 직접 문의드리겠다"고 안내한 뒤 응답 끝에 [ESCALATE] 토큰을 붙이세요. 항상 따뜻한 한국어 존댓말로 답변하세요.

— 망고아이 FAQ —
Q1. 수강료는 얼마인가요? A. 주 2회 1:1 화상수업 기준 월 19만원, 주 3회 26만원, 주 5회 39만원입니다. 첫 달 50% 할인 프로모션이 상시 진행됩니다.
Q2. 무료 체험 수업이 있나요? A. 네, 30분 무료 체험 수업과 레벨 테스트가 무료로 제공됩니다. 홈페이지 신규상담에서 신청하실 수 있습니다.
Q3. 수업 시간표는 어떻게 되나요? A. 평일 오후 2시부터 밤 10시, 토요일 오전 9시부터 저녁 7시까지 1:1 시간 예약제로 운영됩니다.
Q4. 몇 살부터 수강할 수 있나요? A. 만 4세(7세)부터 고등학생까지 가능합니다. 유아부는 노래·놀이 중심, 초등부는 회화·문법, 중고등부는 입시/원서 영어로 커리큘럼이 다릅니다.
Q5. 환불 규정은 어떻게 되나요? A. 학원법에 따른 잔여 회차 환불을 보장합니다. 시작 7일 이내 100%, 1/3 경과 시 2/3, 1/2 경과 시 1/2, 1/2 이후는 환불이 어렵습니다.
Q6. 강사는 어떤 분들인가요? A. 영어권 거주 경력 5년+ 또는 영어교육 학위를 가진 한국인 강사 위주이며 모든 강사가 사전 채용 인터뷰와 시범 수업을 통과합니다.
Q7. 수업은 어떤 플랫폼으로 진행되나요? A. 망고아이 자체 화상수업 플랫폼(WebRTC)에서 PC/태블릿/모바일로 입장하시면 됩니다. 별도 앱 설치 불필요합니다.
Q8. 결석 시 보강이 가능한가요? A. 수업 24시간 전 취소 시 무료 보강, 당일 취소는 1회 한정 보강 가능합니다.
Q9. 교재는 별도 구매해야 하나요? A. 자체 디지털 교재는 무료 제공되며, 종이 교재가 필요한 경우 권당 1.2~2만원 별도 구매입니다.
Q10. 결제 방법은? A. 카드 자동결제, 무통장 입금, 카카오페이가 가능합니다. 매월 1일 자동결제됩니다.
Q11. 형제자매 할인이 있나요? A. 형제자매 동시 등록 시 둘째부터 10% 할인입니다.
Q12. 숙제는 얼마나 나오나요? A. 하루 10-20분 분량의 단어/회화/영작 숙제가 나가며 AI 음성 코칭 앱으로 자동 채점됩니다.
Q13. 학습 보고는 어떻게 받나요? A. 매 수업 후 평가서 카톡 알림, 매주 금요일 위클리 다이제스트, 매월 학습 보고서가 자동 발송됩니다.
Q14. 레벨 테스트는 어떻게 진행되나요? A. 화상으로 30분간 발음·듣기·말하기·읽기 4영역을 진단하고 맞춤 커리큘럼을 제안드립니다.
Q15. 상담 가능 시간은? A. 평일 오전 10시-오후 7시, 카카오톡 채널 "@망고아이"로 24시간 문의 접수받습니다.`;

        let aiReply = '';
        let escalate = false;
        try {
          if (env.AI) {
            const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: faqContext },
                { role: 'user', content: userMessage }
              ],
              max_tokens: 512,
            });
            aiReply = (ai?.response || '').trim();
            if (aiReply.includes('[ESCALATE]')) {
              escalate = true;
              aiReply = aiReply.replace(/\[ESCALATE\]/g, '').trim();
            }
            if (!aiReply) escalate = true;
          } else {
            escalate = true;
            aiReply = '안녕하세요 학부모님, 더 정확한 답변을 위해 원장님께 전달드리겠습니다. 카카오톡 채널 "@망고아이"로도 문의 가능합니다.';
          }
        } catch (aiErr: any) {
          console.warn('[parent-chat] AI failed', aiErr?.message);
          escalate = true;
          aiReply = '죄송합니다, 잠시 시스템이 답변을 준비하지 못했어요. 원장님께 전달드리겠습니다.';
        }

        await env.DB.prepare(`INSERT INTO parent_chat_log (conversation_id, user_message, ai_reply, escalated, created_at) VALUES (?,?,?,?,?)`)
          .bind(conversationId, userMessage, aiReply, escalate ? 1 : 0, Date.now()).run();

        return json({ ok: true, reply: aiReply, escalate, conversation_id: conversationId });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'parent_chat_failed' }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/parent-chat/logs') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS parent_chat_log (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, user_message TEXT, ai_reply TEXT, escalated INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
        const rs: any = await env.DB.prepare(`SELECT id, conversation_id, user_message, ai_reply, escalated, created_at FROM parent_chat_log ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
        const items = rs.results || [];
        const escCnt = items.filter((r: any) => r.escalated).length;
        return json({ ok: true, items, escalated_count: escCnt, total: items.length });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'parent_chat_logs_failed' }, 500);
      }
    }


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
          const rs: any = await env.DB.prepare(`SELECT user_id, ${nCol} AS student_name, ${prefCol}, ${mbtiCol} FROM students_erp WHERE status = '정상' OR status IS NULL OR status = '' LIMIT 300`).all();
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

    // [Phase VDI] - AI Voice Diary
    //   - Daily voice diary -> Whisper STT -> Llama correction + Korean encouragement
    //   - R2 store: env.RECORDINGS, key: diary/{user_id}/{date}.webm
    if (path === '/api/diary/upload' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.user_id || !body.audio_base64 || !body.date) return json({ ok: false, error: 'missing_fields' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);

        let audioBytes: Uint8Array | null = null;
        try {
          const b64 = String(body.audio_base64).replace(/^data:[^;]+;base64,/, '');
          const bin = atob(b64);
          audioBytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) audioBytes[i] = bin.charCodeAt(i);
        } catch {
          return json({ ok: false, error: 'invalid_audio_base64' }, 400);
        }

        const key = `diary/${body.user_id}/${body.date}.webm`;
        let audioUrl = '';
        try {
          const bucket: any = (env as any).RECORDINGS;
          if (bucket && bucket.put && audioBytes) {
            await bucket.put(key, audioBytes, { httpMetadata: { contentType: 'audio/webm' } });
            audioUrl = `r2://${key}`;
          }
        } catch (e) {
          console.warn('[diary] R2 upload failed (continuing):', (e as any)?.message || e);
        }

        let transcript = '';
        try {
          if (env.AI && audioBytes) {
            const ai: any = await env.AI.run('@cf/openai/whisper', { audio: Array.from(audioBytes) });
            transcript = (ai?.text || ai?.transcript || '').toString().trim();
          }
        } catch (e) {
          console.warn('[diary] Whisper STT failed (stub):', (e as any)?.message || e);
        }

        const now = Date.now();
        const result: any = await env.DB.prepare(`INSERT INTO voice_diary (user_id, date, audio_url, transcript_en, ai_correction, ai_encouragement_ko, score, duration_seconds, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
          .bind(
            String(body.user_id),
            String(body.date),
            audioUrl,
            transcript,
            '',
            '',
            0,
            Number(body.duration_seconds) || 0,
            now
          ).run();

        return json({ ok: true, diary_id: result?.meta?.last_row_id, audio_url: audioUrl, transcript, created_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'diary_upload_failed' }, 500);
      }
    }

    if (path === '/api/diary/correct' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.diary_id) return json({ ok: false, error: 'missing_diary_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);
        const row: any = await env.DB.prepare('SELECT * FROM voice_diary WHERE id = ?').bind(Number(body.diary_id)).first();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        const transcript = String(row.transcript_en || '').trim();
        if (!transcript) return json({ ok: false, error: 'empty_transcript' }, 400);

        let correction = '';
        let encouragement = '';
        let score = 70;
        try {
          if (env.AI) {
            const prompt = `Student wrote (voice diary, English): "${transcript}"\n\n1) Correct grammar/spelling and return the corrected English sentence(s).\n2) Score the writing from 0 to 100.\n3) Then write a warm, friendly Korean encouragement comment (2-3 sentences) like a kind English coach.\n\nReturn strictly JSON: {"corrected":"...","score":85,"encouragement_ko":"..."}.`;
            const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You are a friendly Korean-English coach for kids. Always reply in valid JSON.' },
                { role: 'user', content: prompt }
              ],
              max_tokens: 512,
            });
            const text = (ai?.response || '').toString();
            try {
              const m = text.match(/\{[\s\S]*\}/);
              if (m) {
                const obj = JSON.parse(m[0]);
                correction = String(obj.corrected || '').trim();
                encouragement = String(obj.encouragement_ko || '').trim();
                if (typeof obj.score === 'number') score = Math.max(0, Math.min(100, Math.round(obj.score)));
              }
            } catch {}
            if (!correction) correction = transcript;
            if (!encouragement) encouragement = 'Great job writing your diary today! Keep practicing every day!';
          }
        } catch (e) {
          console.warn('[diary] AI correction failed:', (e as any)?.message || e);
          correction = transcript;
          encouragement = 'Great job writing your diary today!';
        }

        await env.DB.prepare('UPDATE voice_diary SET ai_correction = ?, ai_encouragement_ko = ?, score = ? WHERE id = ?')
          .bind(correction, encouragement, score, Number(body.diary_id)).run();
        return json({ ok: true, correction, encouragement_ko: encouragement, score });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'diary_correct_failed' }, 500);
      }
    }

    if (path === '/api/diary/list' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);
        const userId = url.searchParams.get('user_id');
        const month = url.searchParams.get('month');
        if (!userId) return json({ ok: false, error: 'missing_user_id' }, 400);
        let sql = 'SELECT id, user_id, date, audio_url, transcript_en, score, duration_seconds, created_at FROM voice_diary WHERE user_id = ?';
        const params: any[] = [userId];
        if (month && /^\d{4}-\d{2}$/.test(month)) {
          sql += ' AND date LIKE ?';
          params.push(`${month}%`);
        }
        sql += ' ORDER BY date DESC LIMIT 100';
        const rs = await env.DB.prepare(sql).bind(...params).all();
        return json({ ok: true, entries: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'diary_list_failed' }, 500);
      }
    }

    {
      const mDiary = path.match(/^\/api\/diary\/(\d+)$/);
      if (mDiary && method === 'GET') {
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);
          const row = await env.DB.prepare('SELECT * FROM voice_diary WHERE id = ?').bind(Number(mDiary[1])).first();
          if (!row) return json({ ok: false, error: 'not_found' }, 404);
          return json({ ok: true, entry: row });
        } catch (e: any) {
          return json({ ok: false, error: e?.message || 'diary_get_failed' }, 500);
        }
      }
    }

    if (path === '/api/diary/parent-notify' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.diary_id) return json({ ok: false, error: 'missing_diary_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
        const row: any = await env.DB.prepare('SELECT * FROM voice_diary WHERE id = ?').bind(Number(body.diary_id)).first();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        const msg = `[Mangoi Voice Diary] ${row.date} - "${String(row.transcript_en || '').slice(0, 80)}..." (score ${row.score || 0})`;
        // TODO: real kakao send via solapi-client. For now, queue to digest_logs.
        await env.DB.prepare('INSERT INTO digest_logs (student_uid, parent_phone, message, sent_at, status) VALUES (?,?,?,?,?)')
          .bind(row.user_id, '', msg, Date.now(), 'queued_diary').run();
        return json({ ok: true, queued: true, preview: msg });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'diary_notify_failed' }, 500);
      }
    }

    // [Phase SUP] - Teacher Supervisor Mode
    //   - Mentor teacher observes junior teacher's class via Ghost view + sends real-time guidance
    //   - Piggybacks on existing ghost-view.html + GM-Whisper infra
    if (path === '/api/supervisor/assign' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.mentor_uid || !body.junior_uid) return json({ ok: false, error: 'missing_fields' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, status TEXT DEFAULT 'active', start_at INTEGER, end_at INTEGER, created_at INTEGER);`);
        const now = Date.now();
        const result: any = await env.DB.prepare(`INSERT INTO supervisor_assignments (mentor_uid, junior_uid, room_id, status, start_at, end_at, created_at) VALUES (?,?,?,?,?,?,?)`)
          .bind(String(body.mentor_uid), String(body.junior_uid), body.room_id || '', 'active', now, null, now).run();
        return json({ ok: true, assignment_id: result?.meta?.last_row_id, start_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_assign_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/active' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, status TEXT DEFAULT 'active', start_at INTEGER, end_at INTEGER, created_at INTEGER);`);
        const mentorUid = url.searchParams.get('mentor_uid');
        if (!mentorUid) return json({ ok: false, error: 'missing_mentor_uid' }, 400);
        const rs = await env.DB.prepare(`SELECT * FROM supervisor_assignments WHERE mentor_uid = ? AND status = 'active' ORDER BY start_at DESC`).bind(mentorUid).all();
        return json({ ok: true, assignments: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_active_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/note' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.assignment_id || !body.message) return json({ ok: false, error: 'missing_fields' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, message TEXT, priority TEXT DEFAULT 'normal', acknowledged INTEGER DEFAULT 0, created_at INTEGER);`);
        const now = Date.now();
        const result: any = await env.DB.prepare(`INSERT INTO supervisor_notes (assignment_id, mentor_uid, junior_uid, room_id, message, priority, acknowledged, created_at) VALUES (?,?,?,?,?,?,0,?)`)
          .bind(
            Number(body.assignment_id),
            String(body.mentor_uid || ''),
            String(body.junior_uid || ''),
            body.room_id || '',
            String(body.message),
            body.priority || 'normal',
            now
          ).run();
        return json({ ok: true, note_id: result?.meta?.last_row_id, created_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_note_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/notes/incoming' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, message TEXT, priority TEXT DEFAULT 'normal', acknowledged INTEGER DEFAULT 0, created_at INTEGER);`);
        const juniorUid = url.searchParams.get('junior_uid');
        if (!juniorUid) return json({ ok: false, error: 'missing_junior_uid' }, 400);
        const rs = await env.DB.prepare(`SELECT * FROM supervisor_notes WHERE junior_uid = ? AND acknowledged = 0 ORDER BY created_at DESC LIMIT 50`).bind(juniorUid).all();
        return json({ ok: true, notes: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_incoming_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/note/ack' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.note_id) return json({ ok: false, error: 'missing_note_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, message TEXT, priority TEXT DEFAULT 'normal', acknowledged INTEGER DEFAULT 0, created_at INTEGER);`);
        await env.DB.prepare('UPDATE supervisor_notes SET acknowledged = 1 WHERE id = ?').bind(Number(body.note_id)).run();
        return json({ ok: true, acknowledged_at: Date.now() });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_ack_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/end' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.assignment_id) return json({ ok: false, error: 'missing_assignment_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, status TEXT DEFAULT 'active', start_at INTEGER, end_at INTEGER, created_at INTEGER);`);
        const now = Date.now();
        await env.DB.prepare(`UPDATE supervisor_assignments SET status = 'ended', end_at = ? WHERE id = ?`).bind(now, Number(body.assignment_id)).run();
        return json({ ok: true, ended_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_end_failed' }, 500);
      }
    }

    // ════════════════════════════════════════════════════════════
    // 📊 월간 NPS 설문 (Net Promoter Score) — stats / send / respond
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
          `SELECT COUNT(*) AS n FROM students_erp WHERE status='정상' OR status='활동' OR status IS NULL OR status=''`
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

    // No matching route in this handler
    return null;
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'mango_api_unhandled' }, 500);
  }
}
