/**
 * api-mango.ts - v3 명세서 신규 API
 *  - 출석 자동 감지 / 발화시간(VAD) 기록
 *  - 비상 카카오 ID 관리 / 비상 이벤트 로깅
 *  - 보상(스티커/쿠폰) 발급 with 일일 상한
 *  - 관리 대시보드 KPI
 *  - 🥭 Phase 21: AI 명령 엔드포인트 (Workers AI Llama 3.3 70B)
 */

import { processAiCommand, executeAction } from './ai-command';
import { sendCoupon, checkBalance, getGiftishowMode, parseWebhook, type GiftishowEnv } from './giftishow-client';
import {
  sendLessonStartAlert, sendLessonEndAlert, sendChatSummaryAlert, sendMentionAlert,
  sendPaymentOverdueAlert,
  checkSolapiBalance, getSolapiMode, type SolapiEnv,
} from './solapi-client';
import {
  sendWebPushWakeup, broadcastWebPush, generateVapidKeyPair, getWebPushMode,
  type WebPushEnv,
} from './web-push';

export interface MangoEnv extends GiftishowEnv, SolapiEnv {
  DB: D1Database;
  SESSION_STATE: KVNamespace;
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

const today = (ts: number = Date.now()) => {
  const d = new Date(ts);
  // KST 기준 날짜
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
};

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

    // ===== 👨‍🏫 공개 강사 목록 (학생 홈페이지 강사진 미리보기용) =====
    if (path === '/api/teacher-profiles' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
        const rs = await env.DB.prepare(
          `SELECT id, korean_name, english_name, image_url, intro_video_url, group_name, career, certifications, education, available_days, available_hours, status, origin_region FROM teacher_profiles WHERE status = '활동중' ORDER BY korean_name ASC LIMIT ?`
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

      const [revRow, attRow, activeRow, signupRow] = await Promise.all([
        safe(() => env.DB.prepare(
          `SELECT COALESCE(SUM(amount_krw), 0) AS revenue, COUNT(*) AS pay_count
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL
             AND paid_at >= ? AND paid_at < ?`
        ).bind(startMs, endMs).first<{ revenue: number; pay_count: number }>(),
        { revenue: 0, pay_count: 0 } as any),

        safe(() => env.DB.prepare(
          `SELECT COUNT(DISTINCT user_id) AS attended
           FROM attendance WHERE date = ?`
        ).bind(todayKst).first<{ attended: number }>(),
        { attended: 0 } as any),

        safe(() => env.DB.prepare(
          `SELECT COUNT(*) AS active
           FROM students_erp
           WHERE end_date IS NULL OR end_date = '' OR end_date >= ?`
        ).bind(todayKst).first<{ active: number }>(),
        { active: 0 } as any),

        safe(() => env.DB.prepare(
          `SELECT COUNT(*) AS signups
           FROM students_erp WHERE signup_date = ?`
        ).bind(todayKst).first<{ signups: number }>(),
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
      const result = await processAiCommand(env, command);
      return json(result, result.ok === false ? 500 : 200);
    }

    if (method === 'POST' && path === '/api/admin/ai-action') {
      const body = await parseJsonBody(request);
      const name = body?.name || '';
      const args = body?.args || {};
      if (!name) return json({ ok: false, error: 'name_required' }, 400);
      // adminUserId 는 세션쿠키 미들웨어에서 헤더로 주입되거나 미상이면 null
      const adminUserId = request.headers.get('x-admin-user-id') || null;
      const result = await executeAction(env, name, args, adminUserId);
      return json(result, result.ok === false ? 400 : 200);
    }

    // ────────────────────────────────────────────────
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

    // ═══════════════════════════════════════════════════════════════
    // 🎁 Phase P1 - 망고아이 포인트 시스템 + 기프티콘 교환
    // ═══════════════════════════════════════════════════════════════

    // 헬퍼: 포인트 테이블 자동 생성 (안전망)
    const ensurePointTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER NOT NULL DEFAULT 0, lifetime_earned INTEGER NOT NULL DEFAULT 0, lifetime_spent INTEGER NOT NULL DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT, rule_code TEXT, redemption_id INTEGER, actor_id TEXT, actor_name TEXT, created_at INTEGER NOT NULL, meta TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rules (code TEXT PRIMARY KEY, label TEXT NOT NULL, amount INTEGER NOT NULL, cooldown_sec INTEGER DEFAULT 0, daily_cap INTEGER, enabled INTEGER DEFAULT 1, description TEXT, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gift_catalog (id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT, brand TEXT, name TEXT NOT NULL, category TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, thumbnail_url TEXT, stock INTEGER, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, description TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gift_redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, catalog_id INTEGER NOT NULL, gift_name TEXT, gift_brand TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, recipient_phone TEXT, recipient_name TEXT, status TEXT NOT NULL DEFAULT 'pending', external_order_id TEXT, external_coupon_code TEXT, error_message TEXT, requested_at INTEGER NOT NULL, sent_at INTEGER, delivered_at INTEGER, failed_at INTEGER, refunded_at INTEGER, txn_spend_id INTEGER, txn_refund_id INTEGER, meta TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER NOT NULL, triggered_at INTEGER NOT NULL, txn_id INTEGER, meta TEXT);`);
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
      const newBalance = (row.balance || 0) + signed;
      if (newBalance < 0) {
        throw new Error(`잔액 부족: 현재 ${row.balance}P, 차감 ${Math.abs(signed)}P`);
      }
      const lifetimeEarned = (row.lifetime_earned || 0) + (signed > 0 ? signed : 0);
      const lifetimeSpent = (row.lifetime_spent || 0) + (signed < 0 ? -signed : 0);
      // UPDATE 잔액
      await env.DB.prepare(`UPDATE student_points SET balance=?, lifetime_earned=?, lifetime_spent=?, last_earned_at=COALESCE(CASE WHEN ?>0 THEN ? END, last_earned_at), last_spent_at=COALESCE(CASE WHEN ?<0 THEN ? END, last_spent_at), student_name=COALESCE(?, student_name), updated_at=? WHERE user_id=?`)
        .bind(newBalance, lifetimeEarned, lifetimeSpent, signed, now, signed, now, studentName || null, now, userId).run();
      // INSERT 거래내역
      const ins = await env.DB.prepare(`INSERT INTO point_transactions (user_id, student_name, type, amount, balance_after, reason, rule_code, redemption_id, actor_id, actor_name, created_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(userId, studentName || null, type, signed, newBalance, reason || null, ruleCode || null, redemptionId || null, actorId || null, actorName || null, now, meta ? JSON.stringify(meta) : null).run();
      return { txnId: ins?.meta?.last_row_id, newBalance, signed };
    };

    // ── GET /api/points/balance?uid=xxx — 학생 본인 포인트 잔액 + 최근 거래 ──
    if (method === 'GET' && path === '/api/points/balance') {
      await ensurePointTables();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
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
      // 일일 한도 검사
      if (rule.daily_cap) {
        const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
        const todayMs = startOfDay.getTime();
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

      return json({
        ok: true,
        redemption_id: redemptionId,
        status: finalStatus,
        balance_after: spendTxn.newBalance,
        message: responseMessage,
        send_mode: mode,
        gift: { brand: item.brand, name: item.name, face_value: item.face_value, point_price: item.point_price },
      });
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
        ['스타벅스','아이스 아메리카노 Tall','cafe',4500,4500,10,'시원한 한 잔의 여유'],
        ['배스킨라빈스','파인트 (1개)','cafe',9800,9800,20,'취향대로 골라먹는 31'],
        ['교촌치킨','교촌오리지날 + 콜라1.25L','food',21000,21000,30,'바삭 짭짤 든든'],
        ['CGV','영화 1매 (전 지점)','movie',14000,14000,40,'평일 일반관 1회 사용'],
        ['교보문고','도서상품권 5,000원','book',5000,5000,50,'온/오프라인 사용 가능'],
        ['GS25','편의점 금액권 5,000원','voucher',5000,5000,60,'전국 GS25에서 사용'],
      ];
      let n = 0;
      for (const [brand,name,cat,fv,pp,sort,desc] of seeds) {
        const exists = await env.DB.prepare(`SELECT id FROM gift_catalog WHERE brand=? AND name=?`).bind(brand,name).first();
        if (exists) continue;
        await env.DB.prepare(`INSERT INTO gift_catalog (brand,name,category,face_value,point_price,enabled,sort_order,description,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?,?)`)
          .bind(brand,name,cat,fv,pp,sort,desc,now,now).run();
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

      // 발송 실패 콜백이면 자동 환불
      if (ev.status === 'failed' && !red.txn_refund_id) {
        try {
          const refundTxn = await applyPointTransaction({
            userId: red.user_id, studentName: red.student_name, type: 'refund',
            amount: red.point_price, reason: `[자동환불] 발송 실패 (webhook): ${(ev.message||'').slice(0,80)}`,
            redemptionId: redId, actorId: 'webhook', actorName: 'KT alpha webhook',
          });
          await env.DB.prepare(`UPDATE gift_redemptions SET txn_refund_id=?, status='refunded', refunded_at=? WHERE id=?`).bind(refundTxn.txnId, now, redId).run();
          if (red.catalog_id) {
            await env.DB.prepare(`UPDATE gift_catalog SET stock=stock+1, updated_at=? WHERE id=? AND stock IS NOT NULL`).bind(now, red.catalog_id).run();
          }
        } catch {}
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
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
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
        `INSERT INTO student_evaluations (student_uid, student_name, teacher_uid, teacher_name, room_id, lesson_title, lesson_date,
          score_participation, score_comprehension, score_homework, score_attitude, score_speaking, score_overall,
          strengths, improvements, next_goals, teacher_comment, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
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
      const rs = await env.DB.prepare(
        `SELECT s.user_id, s.name AS student_name, s.parent_phone, s.phone AS student_phone,
                (SELECT MAX(paid_at) FROM student_payments WHERE user_id = s.user_id AND status='paid') AS last_paid_at,
                (SELECT amount_krw FROM student_payments WHERE user_id = s.user_id AND status='paid' ORDER BY paid_at DESC LIMIT 1) AS last_amount
           FROM students_erp s
          WHERE s.status = '정상' OR s.status = '활동' OR s.status IS NULL OR s.status = ''
          ORDER BY s.name`
      ).all().catch(() => ({ results: [] } as any));
      const overdue: any[] = [];
      const upToDate: any[] = [];
      const neverPaid: any[] = [];
      for (const r of (rs.results || [])) {
        const row: any = r;
        if (!row.last_paid_at) {
          neverPaid.push({
            ...row,
            days_overdue: null,
            amount_krw: defaultMonthlyFee,
          });
        } else if (row.last_paid_at < cutoff) {
          const daysOverdue = Math.floor((now - row.last_paid_at) / (86400*1000)) - graceDays;
          overdue.push({
            ...row,
            days_overdue: daysOverdue,
            amount_krw: row.last_amount || defaultMonthlyFee,
          });
        } else {
          upToDate.push({
            ...row,
            days_overdue: 0,
          });
        }
      }
      return json({
        ok: true,
        grace_days: graceDays,
        default_fee: defaultMonthlyFee,
        overdue, never_paid: neverPaid, up_to_date: upToDate,
        summary: {
          total_overdue: overdue.length,
          total_never_paid: neverPaid.length,
          total_up_to_date: upToDate.length,
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
      const rs = await env.DB.prepare(
        `SELECT s.user_id, s.name AS student_name, s.parent_phone, s.phone AS student_phone,
                (SELECT MAX(paid_at) FROM student_payments WHERE user_id = s.user_id AND status='paid') AS last_paid_at,
                (SELECT amount_krw FROM student_payments WHERE user_id = s.user_id AND status='paid' ORDER BY paid_at DESC LIMIT 1) AS last_amount
           FROM students_erp s
          WHERE (s.status = '정상' OR s.status = '활동' OR s.status IS NULL OR s.status = '')`
      ).all().catch(() => ({ results: [] } as any));
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
      const studentTotal: any = await fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE (status = '정상' OR status = '활동' OR status IS NULL OR status = '')`);
      const studentNewThisMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ?`, thisMonthStart);
      const studentNewLastMonth: any = await fetch1(`SELECT COUNT(*) AS n FROM students_erp WHERE created_at >= ? AND created_at < ?`, lastMonthStart, lastMonthEnd);

      // 2. 매출
      const revThisMonth: any = await fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND paid_at >= ? AND paid_at < ?`, thisMonthStart, thisMonthEnd);
      const revLastMonth: any = await fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum, COUNT(*) AS n FROM student_payments WHERE status='paid' AND paid_at >= ? AND paid_at < ?`, lastMonthStart, lastMonthEnd);

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
                                         AND s.user_id NOT IN (SELECT user_id FROM student_payments WHERE status='paid' AND paid_at >= ?)`, cutoff);
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
        const r: any = await fetch1(`SELECT IFNULL(SUM(amount_krw),0) AS sum FROM student_payments WHERE status='paid' AND paid_at >= ? AND paid_at < ?`, dayStart.getTime(), dayEnd.getTime());
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
    };

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

    // 🔔 푸시 발송 헬퍼 — 다른 알림 트리거에서 호출 가능
    //   특정 user_id 의 모든 활성 구독에 push 메시지 큐잉 + wakeup 전송
    //   리턴: { ok, sent, fail, total }  (실패해도 throw 안 함)
    const sendPushToUser = async (userId: string, title: string, body: string, targetUrl: string = '/', tag?: string) => {
      try {
        await ensurePushTables();
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
        // 연속 출석 (간단 추정: 최근 30일 중 출석 일수)
        const since30 = Date.now() - 30 * 86400000;
        const r30: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ?`).bind(userId, since30).first();
        if ((r30?.d || 0) >= 7) await award('streak_7');
        if ((r30?.d || 0) >= 30) await award('streak_30');
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
        // 모든 활성 학생 가져오기
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, program TEXT, status TEXT, created_at INTEGER);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, username TEXT, role TEXT, joined_at INTEGER, left_at INTEGER, status TEXT, date TEXT);`);

        const now = Date.now();
        const since30 = now - 30 * 86400000;
        const since60 = now - 60 * 86400000;

        const studentsRs = await env.DB.prepare(`SELECT user_id, student_name FROM students_erp WHERE status = '정상' OR status IS NULL OR status = '' LIMIT 500`).all();
        const students = (studentsRs.results || []) as any[];
        if (!students.length) return json({ ok: true, count: 0, at_risk: [] });

        const atRisk: any[] = [];
        for (const s of students) {
          // 최근 30일 출석
          const att30: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ?`).bind(s.user_id, since30).first();
          // 30~60일 출석 (비교용)
          const att60: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(s.user_id, since60, since30).first();
          // 마지막 입장
          const lastJoin: any = await env.DB.prepare(`SELECT MAX(joined_at) AS j FROM attendance WHERE user_id = ?`).bind(s.user_id).first();
          // 평가서 평균
          let evalAvg = 0, evalCount = 0;
          try {
            const e: any = await env.DB.prepare(`SELECT AVG(score_overall) AS a, COUNT(*) AS n FROM student_evaluations WHERE student_uid = ? AND created_at >= ?`).bind(s.user_id, since60).first();
            evalAvg = Math.round(e?.a || 0); evalCount = e?.n || 0;
          } catch {}

          const attRecent = att30?.d || 0;
          const attPrev = att60?.d || 0;
          const daysSinceLastJoin = lastJoin?.j ? Math.floor((now - lastJoin.j) / 86400000) : 999;

          // 위험도 계산
          let risk = 0;
          const reasons: string[] = [];
          if (daysSinceLastJoin >= 14) { risk += 40; reasons.push(`마지막 입장 ${daysSinceLastJoin}일 전`); }
          else if (daysSinceLastJoin >= 7) { risk += 20; reasons.push(`최근 일주일 미출석`); }
          if (attRecent === 0) { risk += 25; reasons.push('최근 30일 출석 0회'); }
          else if (attPrev > 0 && attRecent < attPrev * 0.5) { risk += 25; reasons.push(`출석 ${attPrev}→${attRecent}회 급감`); }
          if (evalCount > 0 && evalAvg < 5) { risk += 20; reasons.push(`평가 평균 ${evalAvg}점 저조`); }
          if (evalCount === 0 && daysSinceLastJoin < 60) { risk += 10; reasons.push('평가서 미작성'); }

          if (risk >= 30) {
            atRisk.push({
              user_id: s.user_id,
              student_name: s.student_name || s.user_id,
              risk_score: Math.min(risk, 100),
              risk_level: risk >= 70 ? 'high' : risk >= 50 ? 'medium' : 'low',
              reasons,
              attendance_30d: attRecent,
              attendance_30to60d: attPrev,
              days_since_last_join: daysSinceLastJoin,
              eval_avg: evalAvg,
              eval_count_60d: evalCount,
              recommended_action: risk >= 70
                ? '🚨 학부모 직접 전화 + 무료 보강 수업 제안'
                : risk >= 50
                ? '📞 학부모에게 안부 전화 + 출석 동기부여'
                : '📧 푸시 알림 + 격려 메시지 발송',
            });
          }
        }
        // 위험도 내림차순
        atRisk.sort((a, b) => b.risk_score - a.risk_score);
        return json({ ok: true, count: atRisk.length, at_risk: atRisk });
      } catch (e: any) {
        console.warn('[retention/risk] error:', e?.message);
        return json({ ok: false, error: e?.message || 'risk_failed' }, 500);
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
          role: stu.parent_user_id ? 'student' : 'student',  // 학생/학부모 구분은 추후
          parent_name: stu.parent_name,
          parent_user_id: stu.parent_user_id,
          has_password: !!stu.password_hash,
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
              localStorage.setItem('mango_user', JSON.stringify(u));
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

      try {
        const rows = await env.DB.prepare(
          `SELECT ${labelExpr} AS label, SUM(amount_krw) AS revenue, COUNT(*) AS pay_count
           FROM student_payments
           WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at BETWEEN ? AND ?
           GROUP BY ${groupExpr}
           ORDER BY label ASC`
        ).bind(fromMs, toMs).all<{ label: string; revenue: number; pay_count: number }>();

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
           WHERE status = 'paid' AND paid_at IS NOT NULL`
        ).bind(todayKst, thisMonth, thisQuarter, thisHalf, thisYear).first<any>();

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

      try {
        // 신규 가입 (signup_date 기준)
        const newRows = await env.DB.prepare(
          `SELECT signup_date AS date, COUNT(*) AS cnt
           FROM students_erp
           WHERE signup_date IS NOT NULL AND signup_date BETWEEN ? AND ?
           GROUP BY signup_date ORDER BY signup_date ASC`
        ).bind(from, to).all<{ date: string; cnt: number }>();

        // 탈락 (end_date < 오늘 + status 가 정상 아님)
        const dropRows = await env.DB.prepare(
          `SELECT end_date AS date, COUNT(*) AS cnt
           FROM students_erp
           WHERE end_date IS NOT NULL AND end_date BETWEEN ? AND ?
             AND end_date < ?
             AND status != '정상'
           GROUP BY end_date ORDER BY end_date ASC`
        ).bind(from, to, today).all<{ date: string; cnt: number }>();

        // 전체 학생 수 (현재 활성 — 종료일 미만이거나 미설정)
        const activeRow = await env.DB.prepare(
          `SELECT COUNT(*) AS active
           FROM students_erp
           WHERE end_date IS NULL OR end_date >= ?`
        ).bind(today).first<{ active: number }>();

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
      return json({ ok: true, items: rs.results || [] });
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
        const rs = await env.DB.prepare(
          `SELECT rowid AS _rowid, * FROM students_erp ORDER BY rowid DESC LIMIT ?`
        ).bind(lim).all<any>();
        const items = (rs.results || []).map(r => {
          // id 컬럼이 없으면 rowid 를 id 로 사용 (프론트 호환)
          if (r.id == null) r.id = r._rowid;
          // korean_name / english_name 만 있으면 username 에 채움 (Phase 20d 스키마 호환)
          if (!r.username && r.korean_name) r.username = r.korean_name;
          if (!r.login_id && r.user_id) r.login_id = r.user_id;
          return r;
        });
        return json({ ok: true, items });
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
      const rs = await env.DB.prepare(
        `SELECT user_id,
                MAX(username) AS username,
                MAX(role)     AS role,
                MIN(joined_at) AS first_seen,
                MAX(joined_at) AS last_seen,
                COUNT(*)       AS sessions
         FROM attendance
         WHERE user_id IS NOT NULL AND user_id != ''
         GROUP BY user_id
         ORDER BY MAX(joined_at) DESC
         LIMIT ?`
      ).bind(lim).all();
      return json({ ok: true, items: rs.results || [] });
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
      if (method === 'GET') {
        const rs = await env.DB.prepare(`SELECT * FROM textbooks ORDER BY active DESC, level ASC, title ASC`).all();
        return json({ ok: true, items: rs.results || [] });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.title) return invalidBody(['title']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO textbooks (title, level, units, isbn, publisher, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.title, b.level || null, b.units != null ? Number(b.units) : null, b.isbn || null, b.publisher || null, b.notes || null, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
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
      const where: string[] = ['active = 1'];
      const binds: any[] = [];
      if (lv) { where.push('level = ?');       binds.push(lv); }
      if (tb) { where.push('textbook_id = ?'); binds.push(Number(tb)); }
      if (kd) { where.push('kind = ?');        binds.push(kd); }
      if (q)  { where.push('name LIKE ?');     binds.push(`%${q}%`); }
      const sql = `SELECT id, name, kind, mime, ext, size_bytes, r2_key, textbook_id, level, unit_no, description, uploaded_by, created_at, updated_at FROM textbook_files WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 500`;
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
      const where: string[] = ['active = 1'];
      const binds: any[] = [];
      if (lv) { where.push('level = ?'); binds.push(lv); }
      const rs: any = await env.DB.prepare(
        `SELECT id, name, kind, ext, size_bytes, level, unit_no, description, created_at FROM textbook_files WHERE ${where.join(' AND ')} ORDER BY level ASC, unit_no ASC, created_at DESC LIMIT 500`
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

        return json({
          ok: true,
          user_id: uid,
          period_days: days,
          erp: pick(0),
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
        const sets: string[] = []; const vals: any[] = [];
        for (const k of allowed) {
          if (b[k] !== undefined) { sets.push(`${k} = ?`); vals.push(b[k]); }
        }
        if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
        sets.push('updated_at = ?'); vals.push(Date.now());
        // student_id 우선, 없으면 login_id, 없으면 username 으로 매칭
        vals.push(uid, uid, uid);
        await env.DB.prepare(
          `UPDATE students_erp SET ${sets.join(', ')} WHERE student_id = ? OR login_id = ? OR username = ?`
        ).bind(...vals).run();
        return json({ ok: true, updated_fields: sets.length - 1 });
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

    return null;
  } catch (err: any) {
    console.error('Mango API error:', err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
}
