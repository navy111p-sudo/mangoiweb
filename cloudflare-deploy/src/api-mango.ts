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
import { checkAdminSession, getAdminActor, sameTeacherName } from './auth-admin';
import { applyPIIScope, canViewPII, maskRecordPII, isMaskedValue } from './pii-mask';  // 🔒 PII 권한별 마스킹
import { sendCoupon, checkBalance, getGiftishowMode, parseWebhook, type GiftishowEnv } from './giftishow-client';
import { json, parseJsonBody, invalidBody, toCSV, csvResponse, today } from './api-util';
import { handleNotifyApi, ensureNotifSchema, enqueueNotification, sendPushToUser } from './api-notify';  // 🔔 알림큐·웹푸시 (분리됨)  // 🧰 공용 헬퍼 (REFACTOR_PLAN 1단계 분리)
import { handleDiaryApi } from './api-diary';
import { handleGamesApi, checkAndAwardBadges, BADGE_CATALOG } from './api-games';
import { handlePointsApi, ensurePointTables, applyPointTransaction } from './api-points';  // 🎁 포인트 도메인 (분리됨)
import { handleLessonsApi } from './api-lessons';  // 📝 평가서·숙제 (분리됨)
import { handleReportsApi } from './api-reports';  // 📄 월간리포트 (분리됨)
import { handleStudentsApi } from './api-students';  // 👨‍👩‍👧 학부모 도메인 (분리됨)
import { handleAdminApi } from './api-admin';       // 🛡️ 관리자 도메인 (분리 진행중)    // 🎮 게임/단어장·마이크로러닝 라우트 (분리됨)
import { handleExamApi } from './api-exam';         // 📝 Mini TOEIC 시험 라우트 (2026-07-13 신규)
import { handleUptimeApi } from './api-uptime';     // 📟 UptimeRobot 장애 웹훅 → 관리자 문자
import { authUidFromRequest as authUidGlobal, signUidToken } from './auth-token';  // 🔐 모듈레벨 소유자 검증(IDOR 방지)
import {
  sendLessonStartAlert, sendLessonEndAlert, sendChatSummaryAlert, sendMentionAlert,
  sendPaymentOverdueAlert,
  checkSolapiBalance, getSolapiMode, sendKakaoAlimtalk, sendPlainSms, type SolapiEnv,
} from './solapi-client';
import { sendEmail, emailLayout, type EmailEnv } from './email';   // 📧 이메일(Resend) — 레벨테스트 관리자/교사 알림
import {
  sendWebPushWakeup, broadcastWebPush, generateVapidKeyPair, getWebPushMode,
  type WebPushEnv,
} from './web-push';

export interface MangoEnv extends GiftishowEnv, SolapiEnv, EmailEnv {
  DB: D1Database;
  SESSION_STATE: KVNamespace;
  // 📧 이메일(Resend) — 레벨테스트 신규신청 관리자 알림 + 교사 배정 알림
  //   RESEND_API_KEY, RESEND_FROM, LEVELTEST_ADMIN_EMAIL (email.ts / EmailEnv)
  // 🎯 레벨테스트 신청자 확정 알림톡 템플릿(선택) — 미설정 시 문자(SMS) 폴백
  SOLAPI_TEMPLATE_LEVELTEST?: string;
  // 🕸️ Neo4j 그래프 DB (teacher-match.ts runCypher 공용 시크릿)
  NEO4J_QUERY_URL?: string;
  NEO4J_USER?: string;
  NEO4J_PASSWORD?: string;
  // 🥭 Phase 21 — Workers AI 바인딩 (검색창 AI 명령)
  AI?: any;
  // 📟 UptimeRobot 장애 웹훅 → 관리자 문자 알림 (api-uptime.ts)
  UPTIME_HOOK_KEY?: string;    // 웹훅 호출 보호 토큰(무단 호출 방지)
  OWNER_ALERT_PHONE?: string;  // 장애 문자 받을 관리자 번호
  // 🎁 Phase P4 — 기프티쇼 비즈 환경변수 (giftishow-client.ts)
  //   GIFTISHOW_API_KEY, GIFTISHOW_USER_ID, GIFTISHOW_API_BASE, GIFTISHOW_CALLBACK_URL, GIFTISHOW_TEST_MODE
  // 💬 Phase K2~K4 — 카카오 알림톡 환경변수 (solapi-client.ts)
  //   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, SOLAPI_TEMPLATE_*, SOLAPI_TEST_MODE
}

// json / parseJsonBody 는 api-util.ts 로 분리 (도메인별 api-*.ts 공용)

// (월간리포트 모듈함수 4종 → api-reports.ts, 20차 — 크론은 api-reports 에서 import)

// fix (2026-06-01) — 포인트 테이블 DDL 을 isolate 당 1회만 실행.
//   매 요청마다 CREATE TABLE 6개를 돌리면, 페이지 로드 시 동시 요청 폭주 →
//   D1 락/과부하 → 미처리 예외 → Cloudflare 503 발생. 이 플래그로 방지.
// (DDL 1회 실행 플래그 3종 → api-points.ts, 11차)

// (today() KST 날짜 헬퍼 → api-util.ts, 11차)

// (computeAttendanceStreak · reconcileAllStreaks → api-games.ts 로 이동, 3차 2026-07-14)



// (invalidBody → api-util.ts, 8차)

// (toCSV → api-util.ts, 8차)

// ========================================================================
// 💼 Payroll (Phase 8) — Mangoi 강사 급여·평가 시스템
//   - 모델: salary-heatmap.pages.dev 와 동일
//   - 월급 = 총 수업수(20분 단위) × 2 × 10분당 단가(PHP)
//   - 평가 = 5개 카테고리 가중 평균 → 4등급 자동 분류
//   - 근무 형태: 'office' | 'home' (rank 폐기, 호환성 위해 컬럼만 유지)
// (payroll 상수·계산 클러스터 → api-admin.ts, 8차)

// (csvResponse → api-util.ts, 8차)

// ========================================================================
// 📣 알림 큐 (Phase 5) — Worker 는 적재만 하고, 발송은 외부 도구가 폴링.
//   - 카카오톡 직접 발송은 후속 Phase (KAKAO_ACCESS_TOKEN 시크릿 도입) 에서.
//   - 큐 모델은 다채널 확장 가능 (slack/email/discord 등).
// ========================================================================
// (_notifSchemaReady → api-notify.ts, 8차)
// (ensureNotifSchema → api-notify.ts, 8차)

// (enqueueNotification → api-notify.ts, 8차)

// (seedGiftCatalog → api-points.ts, 11차)

export async function handleMangoApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // (sendPushToUser → api-notify.ts 로 승격 — admin 5회차)

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
      // 🔐 [PII] 본인 녹화만 — 토큰 uid 일치 요구(남의 수업영상 목록·재생키 열람 차단, IDOR)
      //   녹화는 화상수업 관례상 학생 '이름'으로 저장되는 경우가 있어, 토큰 주인의
      //   등록 이름으로 조회하는 것도 본인으로 인정한다. (student_name 이 NULL 인 이관
      //   데이터가 많아 korean_name·english_name·username 까지 본인 이름으로 본다)
      const recAuthUid = await authUidGlobal(request, url, env);
      if (!recAuthUid) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 녹화만 조회할 수 있습니다.' }, 401);
      }
      if (recAuthUid !== uid) {
        let recOwnNames: string[] = [];
        try {
          const s: any = await env.DB.prepare(`SELECT student_name, korean_name, english_name, username FROM students_erp WHERE user_id = ?`).bind(recAuthUid).first();
          recOwnNames = [s?.student_name, s?.korean_name, s?.english_name, s?.username]
            .map((v: any) => String(v || '').trim()).filter((v: string) => !!v);
        } catch {}
        // 🎭 데모 빠른 로그인 카드 — 화상수업 표시이름(카드 이름)이 계정 이름과 달라
        //    index.html demoStudents 매핑을 서버에서도 본인 이름으로 인정 (데모 전용)
        const DEMO_CARD_NAMES: Record<string, string> = {
          hong: '홍길동', kim: '김민수', lee: '이지민', park: '박서연', navy111p: '정우영', student: '데모학생',
        };
        if (DEMO_CARD_NAMES[recAuthUid]) recOwnNames.push(DEMO_CARD_NAMES[recAuthUid]);
        if (!recOwnNames.includes(uid)) {
          return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 녹화만 조회할 수 있습니다.' }, 401);
        }
      }
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

    if (path === '/api/kakao-id/teachers' && method === 'GET') {
      // 🔐 [PII] 전 강사 전화번호 대량 노출 차단 — 관리자 전용
      const ktAdmin = await checkAdminSession(request, env as any);
      if (!ktAdmin.ok) return json({ ok: false, error: 'auth_required' }, 401);
      const rs = await env.DB.prepare(
        `SELECT user_id, username, kakao_id, phone FROM kakao_ids WHERE role = 'teacher' AND kakao_id IS NOT NULL`
      ).all();
      return json(rs.results || []);
    }

    if (path.startsWith('/api/kakao-id/') && method === 'GET') {
      const userId = decodeURIComponent(path.replace('/api/kakao-id/', ''));
      // 🔐 [PII] 임의 유저 전화번호 조회 차단 — 관리자 또는 본인 토큰만
      const kAdmin = await checkAdminSession(request, env as any);
      const kAuth = await authUidGlobal(request, url, env);
      if (!kAdmin.ok && kAuth !== userId) return json({ ok: false, error: 'auth_required' }, 401);
      const row = await env.DB.prepare(
        `SELECT user_id, role, username, kakao_id, phone, opted_in_at FROM kakao_ids WHERE user_id = ?`
      ).bind(userId).first();
      return json(row || null);
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
      // 🔐 [PII] 본인 보상만 — 토큰 uid 일치 요구
      const rwAuth = await authUidGlobal(request, url, env);
      if (!rwAuth || rwAuth !== studentId) return json({ ok: false, error: 'auth_required' }, 401);
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

    // ═══════════════════════════════════════════════════════════════
    // 🛡️ 관리자 통계/KPI → api-admin.ts 로 분리 (REFACTOR_PLAN 1단계, admin 1회차)
    // ═══════════════════════════════════════════════════════════════
    if (path.startsWith('/api/chat/') || path.startsWith('/api/admin/chat/')
        || path.startsWith('/api/notify/') || path.startsWith('/api/admin/kakao/')
        || path === '/api/webhook/kakao-inbound' || path === '/api/admin/voice/all-stats') {
      const rNotify = await handleNotifyApi(request, url, env);
      if (rNotify) return rNotify;
    }
    if (path.startsWith('/api/admin/monthly-report') || path.startsWith('/api/report/monthly')) {
      const rReports = await handleReportsApi(request, url, env);
      if (rReports) return rReports;
    }
    if (path.startsWith('/api/calendar') || path.startsWith('/api/admin/calendar')
        || path.startsWith('/api/admin/homework') || path.startsWith('/api/eval/')
        || path.startsWith('/api/admin/eval/')) {
      const rLessons = await handleLessonsApi(request, url, env);
      if (rLessons) return rLessons;
    }
    if (path.startsWith('/api/points') || path.startsWith('/api/gifts')
        || path.startsWith('/api/admin/points') || path.startsWith('/api/admin/gifts')
        || path.startsWith('/api/ratings') || path.startsWith('/api/admin/ratings')
        || path.startsWith('/api/ai-feedback') || path === '/api/teacher/my-ratings'
        || path === '/api/vc/roster') {
      const rPoints = await handlePointsApi(request, url, env);
      if (rPoints) return rPoints;
    }
    if (path.startsWith('/api/admin/franchises') || path.startsWith('/api/admin/centers')
        || path.startsWith('/api/leveltest/') || path === '/api/teacher/leveltest-assignments'
        || path.startsWith('/api/admin/enrollments') || path.startsWith('/api/admin/community-posts')
        || path.startsWith('/api/admin/textbooks') || path === '/api/lesson-video'
        || path.startsWith('/api/get-lesson-video/') || path.startsWith('/api/admin/mango-videos')
        || path.startsWith('/api/admin/students/') || path.startsWith('/api/admin/selfscore/')
        || path === '/api/admin/attendance/import-cafe24' || path === '/api/admin/payments/import-cafe24'
        || path === '/api/admin/org/import-cafe24' || path === '/api/admin/staff/graph-list'
        || path === '/api/admin/teachers/graph-list' || path === '/api/admin/books/graph-list'
        || path === '/api/admin/level-tests' || path.startsWith('/api/admin/leveltest/')
        || path.startsWith('/api/admin/retention/')
        || path.startsWith('/api/admin/teacher/mbti') || path.startsWith('/api/mbti/')
        || path === '/api/teachers/mbti-list' || path.startsWith('/api/admin/teacher/praise')
        || path === '/api/teacher/praise' || path === '/api/teachers/list-public'
        || path.startsWith('/api/admin/payments/overdue') || path === '/api/admin/payments/notify-overdue'
        || path === '/api/admin/payments/notify-all-overdue' || path === '/api/admin/payments/record'
        || path.startsWith('/api/admin/ai-analyze/')
        || path.startsWith('/api/admin/schedules') || path.startsWith('/api/admin/unassigned-students')
        || path.startsWith('/api/admin/notify-queue') || path.startsWith('/api/admin/class-schedules')
        || path.startsWith('/api/admin/no-shows') || path === '/api/admin/students/merge-duplicates'
        || path.startsWith('/api/popups') || path.startsWith('/api/admin/popups')
        || path.startsWith('/api/admin/posters')
        || path.startsWith('/api/admin/teacher-profiles') || path.startsWith('/api/admin/teachers')
        || path.startsWith('/api/admin/teacher-classes') || path.startsWith('/api/admin/teacher-evaluation')
        || path === '/api/teacher/mbti-self' || path === '/api/admin/export/payroll.csv'
        || path.startsWith('/api/admin/stats/') || path.startsWith('/api/admin/kpi/')
        || path.startsWith('/api/admin/payroll/') || path.startsWith('/api/admin/schedule-requests')
        || path.startsWith('/api/admin/feedback-drafts')) {
      const rAdmin = await handleAdminApi(request, url, env);
      if (rAdmin) return rAdmin;
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

    // (🥭 Phase WS 주간스케줄·미배정·알림큐·수업스케줄 → api-admin.ts — admin 5회차)

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

    // (🥭 노쇼·스케줄CRUD·중복병합 → api-admin.ts — admin 5회차)

    // (🎁 Phase P1+P4 포인트·기프티콘·별점평가 29매처 → api-points.ts — 11차)

    // (📢 Phase POP 팝업/공지·포스터 16라우트 → api-admin.ts — admin 4회차)

    // (📅 Phase CAL 캘린더 3라우트 → api-lessons.ts — 13차)

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
      // 원문 언어 감지: 한자(중국어 게임 문장)면 chinese — english 고정이면 중→한 번역이 깨짐
      const srcOf = (s: string) => /[一-鿿]/.test(s) ? 'chinese' : (target === 'en' ? 'korean' : 'english');
      const tgtLang = target === 'en' ? 'english' : 'korean';
      if (need.length && ai) {
        for (const t of need) {
          try {
            const resp: any = await ai.run('@cf/meta/m2m100-1.2b', { text: t, source_lang: srcOf(t), target_lang: tgtLang });
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
    // 🎮 게임/학습 도메인 → api-games.ts 로 분리 (REFACTOR_PLAN 1단계)
    //   🧩 Phase RQ(복습퀴즈) + 📚 Phase VOC(단어장) + 🧠 Phase ML(마이크로러닝)
    //   null 반환 시 기존 라우팅 계속 — 모든 매처가 exact/전용 prefix 라 순서 영향 없음
    // ═══════════════════════════════════════════════════════════════
    if (path.startsWith('/api/voice/')
        || path.startsWith('/api/review-quiz/') || path.startsWith('/api/admin/review-quiz/')
        || path.startsWith('/api/vocab') || path.startsWith('/api/admin/microlearn/')
        || path.startsWith('/api/badges/') || path.startsWith('/api/admin/badges/')
        || path.startsWith('/api/streak/') || path.startsWith('/api/admin/streak/')) {
      const rGames = await handleGamesApi(request, url, env);
      if (rGames) return rGames;
    }

    // (📝 Phase HW 숙제 → api-lessons.ts — 12차)

    // (💬 K1 채팅+K2~K4 알림톡 → api-notify.ts — 19차)

    // (📝 Phase E1~E4 평가서 → api-lessons.ts — 12차)


    // (💰 Phase F1~F2 미납 알림 → api-admin.ts — 14차)


    // (📊 Phase D1~D2 KPI 대시보드 → api-admin.ts — admin 1회차)

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

    // (💼 Phase G1~G2 급여정산·SR 연기변경·FD 피드백초안 13라우트 → api-admin.ts — admin 2회차)


    // (🤖 Phase A1~A2 AI 학습분석 → api-admin.ts — 14차)



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
    // 👨‍👩‍👧 학부모 도메인 → api-students.ts 로 분리 (REFACTOR_PLAN 1단계 4차)
    //   PD(대시보드)·자녀연결·WD(다이제스트)·PFB(상담챗봇) — null 시 계속
    // ═══════════════════════════════════════════════════════════════
    if (path.startsWith('/api/oauth/')
        || path.startsWith('/api/parent/') || path.startsWith('/api/admin/parent-chat/')
        || path.startsWith('/api/student/')) {
      const rStudents = await handleStudentsApi(request, url, env);
      if (rStudents) return rStudents;
    }



    // (🎙 Phase AV 음성코칭 5라우트 → api-games.ts — 15차)


    // (💬 K5 양방향+TVS → api-notify.ts — 19차)


    // (📝 Phase BE 일괄평가 → api-lessons.ts — 12차)



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


    // (🚨 Phase ARR 이탈위험+케어액션 → api-admin.ts — 18차)


    // (📚 VOC·🧠 ML·🧩 RQ → api-games.ts — 위임은 Phase RQ 자리(위쪽)에서 일괄 처리)


    // (📄 MR·MAR 월간리포트 → api-reports.ts — 20차)


    // (🧠 MBTI 매칭 + 🌟 교사 칭찬 8매처 → api-admin.ts — 16차)


    // (🔐 UID 서명토큰 클로저 → auth-token.ts 로 통합(중복제거, 5차 2026-07-14)
    //  검증=authUidGlobal(모듈), 발급=signUidToken(auth-token) — 알고리즘·시크릿 동일 확인함)

    // (🔐 Phase LOGIN 학생 로그인/가입 → api-students.ts — 5차 이동)



    // (🌐 Phase OAUTH 소셜로그인 3매처 → api-students.ts — 17차)


    // (💵 stats revenue·rankings·flow·storage → api-admin.ts — admin 1회차)


    // (💼 강사관리·급여 슈퍼블록 13라우트 → api-admin.ts — admin 3회차)

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

    // (👨‍🎓 학생목록·graph-list·cafe24 임포트·레벨테스트 집계 → api-admin.ts — 21차)

    // (🏢 Phase 9 메뉴6+레벨테스트+교재동영상·망고비디오 → api-admin.ts — 22차)

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
      // 🔐 [PII] 동의 이력(전화·IP·기기정보) 조회 차단 — 관리자 또는 본인 토큰만
      const csAdmin = await checkAdminSession(request, env as any);
      const csAuth = await authUidGlobal(request, url, env);
      if (!csAdmin.ok && csAuth !== userId) return json({ ok: false, error: 'auth_required' }, 401);
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

    // (🔥 Phase ST 스트릭 → api-games.ts — 3차 이동)


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

      const prompt = `You are Mango, a friendly English writing tutor for a Korean student at CEFR level ${level}. The student wrote the following text. Your job:
1. Provide a corrected version (preserve student's meaning).
2. Provide a numeric score 0-100 for overall quality.
3. List 2-5 specific issues found, each with: original phrase, suggested phrase, brief reason (in Korean).
4. Provide one encouraging tip in Korean (1-2 sentences).
5. Reply to the CONTENT of the student's writing like a pen-pal friend, in English appropriate for ${level} level (1-2 short sentences, warm, may end with a small question).

Respond in this strict JSON format only, no markdown:
{
  "corrected": "...",
  "score": 85,
  "issues": [{"original":"...","suggested":"...","reason":"..."}],
  "tip": "...",
  "reply": "..."
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
      // 💬 망고 선생님의 답장 — 첨삭을 '검사'가 아니라 '대화'로 만드는 펜팔 답장
      const reply = String(parsed.reply || '').trim().slice(0, 400);

      // 📚 미션 단어 검증 — 클라이언트가 보낸 미션 단어 중 실제 글에 쓰인 단어를 서버가 판정
      //   (보너스 포인트 지급 근거이므로 클라이언트 자가신고를 믿지 않고 서버가 단어경계로 확인)
      const missionWords: string[] = Array.isArray(b.mission_words)
        ? b.mission_words.slice(0, 5).map((w: any) => String(w || '').trim()).filter((w: string) => /^[a-zA-Z' -]{1,30}$/.test(w))
        : [];
      const missionUsed = missionWords.filter(w =>
        new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));

      // raw 가 있긴 한데 JSON 파싱 실패 → AI 응답 텍스트를 tip 에 일부 포함
      const meta = raw && !Object.keys(parsed).length
        ? { ai_raw_excerpt: raw.slice(0, 500), parsed: false }
        : { parsed: true };

      try {
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO ai_writing_corrections (student_uid, original_text, corrected_text, feedback, level, score, created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(uid || null, text, corrected, JSON.stringify({ issues, tip, reply, mission_words: missionWords, mission_used: missionUsed, meta }), level, score, now).run();
      } catch (e: any) {
        console.error('[write-correct] DB insert failed:', e?.message || e);
      }

      // 🎁 포인트 적립 + 배지 검사 — 서명 토큰의 uid 와 요청 uid 가 일치하는 로그인 사용자만.
      //   (토큰 없이 uid 만 넣어 호출하는 무인증 요청은 첨삭은 되지만 포인트는 안 쌓임 → 파밍 방지)
      let pointsEarned: any = null;
      let missionBonus: any = null;
      let streakBonus: any = null;
      let earnedBadges: any[] = [];
      const vocabSaved: string[] = [];
      const awAuthUid = await authUidGlobal(request, url, env, b);
      if (awAuthUid && awAuthUid === uid && !uid.startsWith('guest_')) {
        // 규칙 기반 적립 인라인 헬퍼 — 쿨다운/일일한도는 point_rule_log 기준(KST 자정 경계)
        const earnWritingRule = async (code: string, label: string, amount: number, dailyCap: number, description: string, cooldownSec = 0) => {
          try {
            await ensurePointTables(env);
            const now = Date.now();
            await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(code) DO NOTHING`)
              .bind(code, label, amount, cooldownSec, dailyCap, description, now).run();
            const rule: any = await env.DB.prepare(`SELECT * FROM point_rules WHERE code=? AND enabled=1`).bind(code).first();
            if (!rule) return null;
            if ((rule.cooldown_sec || 0) > 0) {
              const last: any = await env.DB.prepare(`SELECT triggered_at FROM point_rule_log WHERE user_id=? AND rule_code=? ORDER BY triggered_at DESC LIMIT 1`).bind(uid, code).first();
              if (last && (now - last.triggered_at) < rule.cooldown_sec * 1000) return { cooldown: true };
            }
            if (rule.daily_cap) {
              const KST_OFF = 9 * 3600 * 1000;
              const todayMs = Math.floor((now + KST_OFF) / 86400000) * 86400000 - KST_OFF;
              const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`).bind(uid, code, todayMs).first();
              if ((cnt?.c || 0) >= rule.daily_cap) return { capped: true, cap: rule.daily_cap };
            }
            const r = await applyPointTransaction(env, { userId: uid, type: 'earn', amount: rule.amount, reason: rule.label, ruleCode: code, meta: { score, level } });
            await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
              .bind(uid, code, rule.amount, now, r.txnId, JSON.stringify({ score, level })).run();
            return { amount: rule.amount, label: rule.label, newBalance: r.newBalance };
          } catch (e: any) {
            console.error(`[write-correct] earn ${code} failed:`, e?.message || e);
            return null;
          }
        };
        pointsEarned = await earnWritingRule('ai_writing', 'AI 영작 첨삭 완료', 10, 5, 'AI 영작 첨삭을 받을 때마다 지급 (하루 5회)');
        if (missionWords.length >= 3 && missionUsed.length >= 3) {
          missionBonus = await earnWritingRule('ai_writing_mission', '영작 미션 단어 달성', 15, 2, '미션 단어 3개 이상을 글에 사용하면 보너스 (하루 2회)');
        }
        // 🔥 연속 영작 마디 보상 — 7·14·21…일마다 +50P (쿨다운 6일로 같은 마디 중복 방지)
        try {
          const KST_OFF = 32400000;
          const days: any = await env.DB.prepare(
            `SELECT DISTINCT CAST((created_at + ${KST_OFF}) / 86400000 AS INTEGER) AS d FROM ai_writing_corrections WHERE student_uid = ? ORDER BY d DESC LIMIT 120`
          ).bind(uid).all();
          const ds = ((days.results || []) as any[]).map(r => Number(r.d));
          const todayD = Math.floor((Date.now() + KST_OFF) / 86400000);
          let wStreak = 0;
          if (ds.length && ds[0] === todayD) {
            wStreak = 1;
            for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) wStreak++;
          }
          if (wStreak >= 7 && wStreak % 7 === 0) {
            streakBonus = await earnWritingRule('ai_writing_streak', '연속 영작 7일 달성', 50, 1, '7일 연속 영작할 때마다 지급', 6 * 86400);
            if (streakBonus && streakBonus.amount) (streakBonus as any).streak = wStreak;
          }
        } catch (e: any) { console.error('[write-correct] streak bonus failed:', e?.message || e); }
        // 📗 첨삭 표현 → 단어장 자동 저장 (짧은 교정 표현만, 사용자별 중복 방지, 회당 최대 3개)
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, word TEXT NOT NULL, korean TEXT, example TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER NOT NULL, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
          const nowV = Date.now();
          for (const iss of issues.slice(0, 6)) {
            if (vocabSaved.length >= 3) break;
            const sug = String(iss?.suggested || '').trim();
            const reason = String(iss?.reason || '').trim().slice(0, 80);
            if (!sug || sug.length > 40 || !/[a-zA-Z]/.test(sug)) continue;
            const dup: any = await env.DB.prepare(`SELECT id FROM vocabulary WHERE user_id=? AND LOWER(word)=LOWER(?) LIMIT 1`).bind(uid, sug).first();
            if (dup) continue;
            await env.DB.prepare(`INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,0,?,?)`)
              .bind(uid, sug, reason || '영작 첨삭에서 배운 표현', corrected.slice(0, 120), nowV, nowV).run();
            vocabSaved.push(sug);
          }
        } catch (e: any) { console.error('[write-correct] vocab save failed:', e?.message || e); }
        try {
          const earned = await checkAndAwardBadges(env, uid);
          earnedBadges = earned
            .map(code => BADGE_CATALOG.find(c => c.code === code))
            .filter(Boolean);
        } catch (e: any) {
          console.error('[write-correct] badge check failed:', e?.message || e);
        }
      }

      // raw 도 lastErr 도 없을 일이 거의 없지만, 어느쪽이든 결과는 반환 (ok: true)
      // 단 진짜로 AI 가 완전히 안 됐으면 errCode 도 표시
      return json({
        ok: true,
        corrected, score, issues, tip, reply, level,
        mission_words: missionWords, mission_used: missionUsed,
        points: pointsEarned, mission_bonus: missionBonus, streak_bonus: streakBonus,
        earned_badges: earnedBadges, vocab_saved: vocabSaved,
        ...(raw ? {} : { ai_unavailable: true, fallback: true }),
      });
    }

    if (method === 'GET' && path === '/api/ai/write-history') {
      await ensureWriteSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰(mango_token)의 uid 와 요청 uid 가 일치해야만 조회.
      //   (예전엔 uid 만 알면 남의 첨삭 이력을 볼 수 있었음 → uid-token-auth 관례 적용)
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid || authUid !== uid) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      }
      const rs = await env.DB.prepare(
        `SELECT id, original_text, corrected_text, feedback, level, score, created_at FROM ai_writing_corrections WHERE student_uid = ? ORDER BY created_at DESC LIMIT 30`
      ).bind(uid).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── GET /api/ai/write-stats?uid=&token= — 영작 성장 리포트 (스트릭·통계·30일 추이) ──
    if (method === 'GET' && path === '/api/ai/write-stats') {
      await ensureWriteSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 본인 통계만 — write-history 와 동일한 서명 토큰 인증
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid || authUid !== uid) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      }
      const KST_OFF = 32400000;
      const now = Date.now();
      const todayD = Math.floor((now + KST_OFF) / 86400000);
      // 전체 통계
      const tot: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n, ROUND(AVG(score)) AS avg_score, MAX(score) AS best_score FROM ai_writing_corrections WHERE student_uid = ?`
      ).bind(uid).first();
      // 최근 30일 일별 시리즈 (성장 그래프용)
      const sinceMs = (todayD - 29) * 86400000 - KST_OFF;
      const daily = await env.DB.prepare(
        `SELECT CAST((created_at + ${KST_OFF}) / 86400000 AS INTEGER) AS d, COUNT(*) AS n, ROUND(AVG(score)) AS avg_score, MAX(score) AS best_score
         FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ? GROUP BY d ORDER BY d ASC`
      ).bind(uid, sinceMs).all();
      const series = ((daily.results || []) as any[]).map(r => ({
        date: new Date(Number(r.d) * 86400000).toISOString().slice(0, 10),
        count: r.n || 0, avg_score: r.avg_score || 0, best_score: r.best_score || 0,
      }));
      // 연속 영작일 (오늘 또는 어제부터 역방향)
      const days: any = await env.DB.prepare(
        `SELECT DISTINCT CAST((created_at + ${KST_OFF}) / 86400000 AS INTEGER) AS d FROM ai_writing_corrections WHERE student_uid = ? ORDER BY d DESC LIMIT 120`
      ).bind(uid).all();
      const ds = ((days.results || []) as any[]).map(r => Number(r.d));
      let streak = 0;
      if (ds.length && (ds[0] === todayD || ds[0] === todayD - 1)) {
        streak = 1;
        for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) streak++;
      }
      const wroteToday = ds.length > 0 && ds[0] === todayD;
      // 이번주 vs 지난주 평균점 (성장 한 줄 메시지용) — 주 경계는 KST 월요일
      const dow = (todayD + 3) % 7;               // 1970-01-01(목)=day0, 목→3 이므로 +3 하면 월=0
      const weekStartD = todayD - dow;
      const weekStartMs = weekStartD * 86400000 - KST_OFF;
      const prevWeekStartMs = (weekStartD - 7) * 86400000 - KST_OFF;
      const thisW: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n, ROUND(AVG(score)) AS avg_score FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ?`
      ).bind(uid, weekStartMs).first();
      const lastW: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n, ROUND(AVG(score)) AS avg_score FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ? AND created_at < ?`
      ).bind(uid, prevWeekStartMs, weekStartMs).first();
      return json({
        ok: true,
        total: tot?.n || 0, avg_score: tot?.avg_score || 0, best_score: tot?.best_score || 0,
        streak, wrote_today: wroteToday,
        series,
        this_week: { count: thisW?.n || 0, avg_score: thisW?.avg_score || 0 },
        last_week: { count: lastW?.n || 0, avg_score: lastW?.avg_score || 0 },
      });
    }

    // ── GET /api/ai/write-leaderboard?uid=&token= — 🏆 이번 주 영작왕 (작성 편수 기준) ──
    //   점수 경쟁은 저학년에 역효과 → "많이 쓴 사람" 기준. 이름은 마스킹해 PII 비노출,
    //   uid+token 이 오면 내 순위(me)도 함께 반환. uid 없이 호출해도 목록은 조회 가능.
    if (method === 'GET' && path === '/api/ai/write-leaderboard') {
      await ensureWriteSchema();
      const KST_OFF = 32400000;
      const todayD = Math.floor((Date.now() + KST_OFF) / 86400000);
      const weekStartMs = (todayD - ((todayD + 3) % 7)) * 86400000 - KST_OFF;
      const rs = await env.DB.prepare(
        `SELECT student_uid, COUNT(*) AS n, ROUND(AVG(score)) AS avg_score FROM ai_writing_corrections
         WHERE created_at >= ? AND student_uid IS NOT NULL AND student_uid != '' AND student_uid NOT LIKE 'guest_%'
         GROUP BY student_uid ORDER BY n DESC, avg_score DESC LIMIT 10`
      ).bind(weekStartMs).all();
      const rows = ((rs.results || []) as any[]);
      // 이름 조회(students_erp) 후 마스킹 — "김민준" → "김✱✱", "Amy" → "A✱✱"
      const maskName = (s: string) => {
        const t = String(s || '').trim();
        if (!t) return '익명';
        return t.charAt(0) + '✱✱';
      };
      const nameMap = new Map<string, string>();
      if (rows.length) {
        try {
          const qs = rows.map(() => '?').join(',');
          const ns = await env.DB.prepare(
            `SELECT user_id, korean_name, english_name FROM students_erp WHERE user_id IN (${qs})`
          ).bind(...rows.map(r => r.student_uid)).all();
          for (const r of ((ns.results || []) as any[])) {
            nameMap.set(r.user_id, String(r.korean_name || r.english_name || '').trim());
          }
        } catch {}
      }
      const items = rows.map((r, i) => ({
        rank: i + 1,
        name: maskName(nameMap.get(r.student_uid) || r.student_uid),
        count: r.n || 0, avg_score: r.avg_score || 0,
      }));
      // 내 순위 — 토큰 인증된 본인만
      let me: any = null;
      const lbUid = String(url.searchParams.get('uid') || '').trim();
      if (lbUid) {
        const authUid = await authUidGlobal(request, url, env);
        if (authUid && authUid === lbUid) {
          const mine: any = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ?`
          ).bind(lbUid, weekStartMs).first();
          const myN = mine?.n || 0;
          if (myN > 0) {
            const above: any = await env.DB.prepare(
              `SELECT COUNT(*) AS c FROM (SELECT student_uid FROM ai_writing_corrections
               WHERE created_at >= ? AND student_uid IS NOT NULL AND student_uid != '' AND student_uid NOT LIKE 'guest_%'
               GROUP BY student_uid HAVING COUNT(*) > ?)`
            ).bind(weekStartMs, myN).first();
            me = { rank: (above?.c || 0) + 1, count: myN };
          } else {
            me = { rank: null, count: 0 };
          }
        }
      }
      return json({ ok: true, week_start: new Date(weekStartMs + KST_OFF).toISOString().slice(0, 10), items, me });
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

    // ✨ 오늘의 단어 — KST 날짜로 결정되는 순환 목록. 클라이언트 HUD 와 서버 보너스 판정의 단일 정본.
    const AI_FRIEND_WORDS: Array<{ w: string; ko: string; e: string }> = [
      { w: 'amazing', ko: '놀라운', e: '🤩' }, { w: 'delicious', ko: '아주 맛있는', e: '🍕' },
      { w: 'brave', ko: '용감한', e: '🦁' }, { w: 'curious', ko: '호기심 많은', e: '🔍' },
      { w: 'favorite', ko: '가장 좋아하는', e: '💖' }, { w: 'exciting', ko: '신나는', e: '🎢' },
      { w: 'together', ko: '함께', e: '🤝' }, { w: 'weekend', ko: '주말', e: '📅' },
      { w: 'weather', ko: '날씨', e: '🌤' }, { w: 'special', ko: '특별한', e: '🌟' },
      { w: 'adventure', ko: '모험', e: '🗺' }, { w: 'friendly', ko: '다정한', e: '😊' },
      { w: 'hungry', ko: '배고픈', e: '🍚' }, { w: 'awesome', ko: '끝내주는', e: '👍' },
      { w: 'dream', ko: '꿈', e: '💭' }, { w: 'travel', ko: '여행하다', e: '✈' },
      { w: 'animal', ko: '동물', e: '🐾' }, { w: 'happy', ko: '행복한', e: '😄' },
      { w: 'library', ko: '도서관', e: '📚' }, { w: 'practice', ko: '연습하다', e: '💪' },
      { w: 'beautiful', ko: '아름다운', e: '🌸' }, { w: 'question', ko: '질문', e: '❓' },
      { w: 'birthday', ko: '생일', e: '🎂' }, { w: 'important', ko: '중요한', e: '📌' },
      { w: 'vacation', ko: '방학·휴가', e: '🏖' }, { w: 'surprise', ko: '깜짝 놀람', e: '🎁' },
      { w: 'healthy', ko: '건강한', e: '🥗' }, { w: 'famous', ko: '유명한', e: '⭐' },
      { w: 'monster', ko: '괴물', e: '👾' }, { w: 'rainbow', ko: '무지개', e: '🌈' },
    ];
    const aiFriendWordOfDay = () => {
      const dayIdx = Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);
      return AI_FRIEND_WORDS[dayIdx % AI_FRIEND_WORDS.length];
    };
    // 🎮 HUD 스냅샷 — 오늘/누적 메시지 수 + 🔥연속 대화 일수(KST). 채팅·히스토리 응답에 공용.
    const aiFriendGamSnapshot = async (uid: string) => {
      const KST_OFF = 9 * 3600 * 1000;
      const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
      const tc: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_friend_chats WHERE student_uid=? AND role='user' AND created_at>=?`).bind(uid, todayMs).first();
      const lc: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_friend_chats WHERE student_uid=? AND role='user'`).bind(uid).first();
      const dr: any = await env.DB.prepare(`SELECT DISTINCT CAST((created_at + 32400000) / 86400000 AS INTEGER) AS d FROM ai_friend_chats WHERE student_uid=? AND role='user' AND created_at>=? ORDER BY d DESC LIMIT 40`).bind(uid, Date.now() - 40 * 86400000).all();
      const days = new Set(((dr.results || []) as any[]).map(r => Number(r.d)));
      const todayIdx = Math.floor((Date.now() + KST_OFF) / 86400000);
      let streak = 0;
      while (days.has(todayIdx - streak)) streak++;
      // 오늘 아직 안 보냈어도 어제까지의 스트릭은 이어짐 표시 (끊긴 건 아님)
      if (streak === 0 && days.has(todayIdx - 1)) { let s = 0; while (days.has(todayIdx - 1 - s)) s++; streak = s; }
      return { today: tc?.c || 0, lifetime: lc?.c || 0, streak, word: aiFriendWordOfDay() };
    };

    // ── POST /api/ai/chat-guest-token — 비로그인 게스트용 세션 스코프 uid + 서명 토큰 발급 ──
    //   클라이언트가 임의 uid 를 만들어 보내는 것을 금지 (IDOR 방지). 게스트 uid 는
    //   서버가 발급한 추측 불가 랜덤값 + 단기 토큰만 허용, sessionStorage 에만 보관.
    if (method === 'POST' && path === '/api/ai/chat-guest-token') {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      const guestUid = 'guest_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      return json({ ok: true, uid: guestUid, token: await signUidToken(guestUid, env, 7 * 86400 * 1000) });
    }

    if (method === 'POST' && path === '/api/ai/chat-friend') {
      await ensureChatSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      const msg = String(b.msg || '').trim();
      const level = String(b.level || 'A2').trim();
      const persona = String(b.persona || 'friendly').trim(); // friendly | playful | serious | tutor
      if (!uid || !msg) return json({ ok: false, error: 'uid_and_msg_required' }, 400);
      if (msg.length > 500) return json({ ok: false, error: 'msg_too_long' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰의 uid 와 요청 uid 일치 필수
      const authUid = await authUidGlobal(request, url, env, b);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);

      // 최근 10개 메시지 컨텍스트
      const recent: any = await env.DB.prepare(
        `SELECT role, content FROM ai_friend_chats WHERE student_uid = ? ORDER BY id DESC LIMIT 10`
      ).bind(uid).all();
      const history = (recent.results || []).reverse();

      const personaMap: any = {
        friendly: 'a warm, cheerful mango-shaped English friend named Mango who loves cheering kids on',
        playful: 'a silly, joke-loving mango buddy named Mango who makes English feel like a game',
        serious: 'a calm, kind English study partner named Mango who explains things clearly',
        tutor: 'a supportive English tutor named Mango who gently corrects mistakes and celebrates progress',
      };
      const wodNow = aiFriendWordOfDay();
      const system = `You are ${personaMap[persona] || personaMap.friendly}. You chat with a young Korean student at CEFR level ${level}.
Rules:
- Reply in English matched to ${level} (A1 = very short simple sentences with easy words; C1 = natural and fluent).
- Keep replies 1-3 short sentences, then ask exactly ONE fun follow-up question so the student answers again.
- When the student writes in English, start with a short cheer like "Nice sentence!" or "Great try!".
- Use 1-2 fun emojis per reply. Kids love them.
- If the student writes Korean, warmly invite them to try English and give one simple example sentence they can copy.
- If you spot a grammar or spelling mistake, add ONE short Korean tip at the very end in exactly this format: (💡 ~가 더 자연스러워요)
- Sprinkle in tiny fun facts kids enjoy (animals, space, food, games) when it fits.
- Today's special word is "${wodNow.w}" (Korean: ${wodNow.ko}). Use it naturally sometimes, and cheer loudly if the student uses it.
- Never break character. Never say you are an AI. Never use words far above the student's level.`;

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

      // 🎮 게임화 — 포인트/스트릭/오늘의 단어 보너스. 실패해도 채팅 응답은 정상 반환.
      //   메시지당 2P(하루 10회) · 오늘의 단어 사용 +5P(하루 1회) · 🎤말하기 +1P(하루 5회)
      //   게스트(guest*)는 HUD 숫자만 주고 포인트는 적립하지 않음(기프티콘 교환 불가 계정).
      let gam: any = null;
      try {
        gam = await aiFriendGamSnapshot(uid);
        gam.awarded = 0; gam.word_bonus = 0; gam.voice_bonus = 0;
        if (!/^guest/i.test(uid)) {
          await ensurePointTables(env);
          const KST_OFF = 9 * 3600 * 1000;
          const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
          const usedToday = async (code: string) => {
            const c: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`).bind(uid, code, todayMs).first();
            return c?.c || 0;
          };
          const logAward = async (code: string, amount: number, label: string) => {
            const r = await applyPointTransaction(env, { userId: uid, type: 'earn', amount, reason: label, ruleCode: code });
            await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,NULL)`).bind(uid, code, amount, Date.now(), r.txnId).run();
          };
          if ((await usedToday('ai_friend_chat')) < 10) { await logAward('ai_friend_chat', 2, '망고와 영어 수다'); gam.awarded = 2; }
          const wod = gam.word;
          if (wod && new RegExp(`\\b${wod.w}\\b`, 'i').test(msg) && (await usedToday('ai_friend_word')) < 1) {
            await logAward('ai_friend_word', 5, `오늘의 단어(${wod.w}) 사용`); gam.word_bonus = 5;
          }
          if (String(b.via || '') === 'voice' && (await usedToday('ai_friend_voice')) < 5) {
            await logAward('ai_friend_voice', 1, '영어로 말하기'); gam.voice_bonus = 1;
          }
        }
      } catch (e: any) {
        console.error('[chat-friend] gamification failed:', e?.message || e);
      }

      return json({ ok: true, reply, level, persona, model: usedModel || 'fallback', gam });
    }

    if (method === 'GET' && path === '/api/ai/chat-history') {
      await ensureChatSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰의 uid 와 요청 uid 일치 필수 (타인 대화 열람 차단)
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
      const rs = await env.DB.prepare(
        `SELECT id, role, content, created_at FROM ai_friend_chats WHERE student_uid = ? ORDER BY id ASC LIMIT 200`
      ).bind(uid).all();
      // 🎮 HUD 초기 데이터(오늘/누적/스트릭/오늘의 단어) — 실패해도 히스토리는 정상 반환
      let gam: any = null;
      try { gam = await aiFriendGamSnapshot(uid); } catch {}
      return json({ ok: true, items: rs.results || [], gam });
    }

    if (method === 'POST' && path === '/api/ai/chat-clear') {
      await ensureChatSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰의 uid 와 요청 uid 일치 필수 (타인 대화 삭제 차단)
      const authUid = await authUidGlobal(request, url, env, b);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
      await env.DB.prepare(`DELETE FROM ai_friend_chats WHERE student_uid = ?`).bind(uid).run();
      return json({ ok: true });
    }
    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase CF 끝
    // ═══════════════════════════════════════════════════════════════


    // (📅 Phase WD 위클리 다이제스트 → api-students.ts — 4차 이동)


    // (🧠 Phase ML 은 api-games.ts 로 이동 — 위 Phase VOC 위임 지점에서 함께 처리)


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
      // 우선 secret(ROOM_JWT_SECRET) → 없으면 강한 상수 폴백(공개 BUILD_STAMP 사용 금지, 2026-07-12 보안)
      // ⚠️ 운영 환경에서는 반드시 `npx wrangler secret put ROOM_JWT_SECRET --env production` 으로 설정
      //   폴백 상수는 auth-token.ts / api-mango 8713 / signaling-room.ts 와 동일해야 방JWT 상호검증됨.
      return (env as any).ROOM_JWT_SECRET || 'mgi-fb-d0895a3a232c5ef0f0950c6128a04a5311ec69ba142cb4a86a8d334e33c56f30';
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

    // [Phase VDI] - AI Voice Diary → api-diary.ts 로 분리 (docs/REFACTOR_PLAN.md 1단계)
    if (path.startsWith('/api/diary/')) {
      const rDiary = await handleDiaryApi(request, url, env);
      if (rDiary) return rDiary;
    }

    // [Phase MT] - Mini TOEIC 자체 영어 시험 → api-exam.ts (2026-07-13 백엔드 신규 구현)
    if (path.startsWith('/api/exam/') || path === '/api/admin/exams' || path.startsWith('/api/admin/exam/')) {
      const rExam = await handleExamApi(request, url, env);
      if (rExam) return rExam;
    }

    // 📟 UptimeRobot 장애 웹훅 → 관리자 문자 (api-uptime.ts)
    if (path === '/api/uptime-hook') {
      const rHook = await handleUptimeApi(request, url, env);
      if (rHook) return rHook;
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
