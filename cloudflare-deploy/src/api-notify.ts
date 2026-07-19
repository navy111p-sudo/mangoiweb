// ═══════════════════════════════════════════════════════════════════════
// 🔔 api-notify.ts — 알림 큐 공용 (api-mango.ts 에서 이동, 2026-07-14 8차)
//   notification_queue 적재 담당. 소비(발송)는 기존 cron/라우트가 수행.
// ═══════════════════════════════════════════════════════════════════════
import { broadcastWebPush, generateVapidKeyPair, getWebPushMode } from './web-push';
import { json } from './api-util';
import type { MangoEnv } from './api-mango';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { checkAdminSession } from './auth-admin';
import { checkSolapiBalance, getSolapiMode, sendKakaoAlimtalk, sendChatSummaryAlert, sendLessonEndAlert, sendLessonStartAlert, sendMentionAlert } from './solapi-client';

let _notifSchemaReady = false;
export async function ensureNotifSchema(env: { DB: D1Database }): Promise<void> {
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
export async function enqueueNotification(
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

  // 🛡️ Inline-define sendPushToUser at the very top of the handler so all
  // notification endpoints below can use it without TDZ ReferenceError.
  // (Was previously declared deep inside the function — caused runtime crash
  // on /api/notify/lesson-started + lesson-ended + payment-success paths.)
const ensurePushTables_top = async (env: any) => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, ua TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id, enabled)`); } catch {}
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`);
    try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_push_queue_ep ON push_queue(endpoint, fetched_at, queued_at DESC)`); } catch {}
  };
export const sendPushToUser = async (env: any, userId: string, title: string, body: string, targetUrl: string = '/', tag?: string): Promise<any> => {
    try {
      await ensurePushTables_top(env);
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

// ═══════════════════════════════════════════════════════════════════════
// 🔔 알림/카카오 라우트 핸들러 (api-mango.ts 에서 이동, 19차 2026-07-14)
//   K1 채팅 영속화 + K2~K4 알림톡 + K5 양방향 + TVS 음성 대시보드
// ═══════════════════════════════════════════════════════════════════════
export async function handleNotifyApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

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
      // 🔐 [사생활] 이 수업 참여자만 채팅 조회 — 관리자/교사(쿠키세션) OR 방 로스터에 등록된 학생(토큰).
      //   방ID(class-{id}-{날짜})는 추측 가능 → 무인증/비참여자의 수업 채팅 열람 차단 (2026-07-11)
      let cmAllowed = false;
      try {
        const cmAdmin = await checkAdminSession(request, env as any);
        if (cmAdmin.ok) cmAllowed = true;
        else {
          const cmAuth = await authUidGlobal(request, url, env);
          if (cmAuth) {
            const inRoster: any = await env.DB.prepare(`SELECT 1 FROM vc_roster WHERE room_id=? AND account_uid=? LIMIT 1`).bind(roomId, cmAuth).first();
            if (inRoster) cmAllowed = true;
          }
        }
      } catch (e) { /* vc_roster 미존재 등 — 아래에서 차단 */ }
      if (!cmAllowed) return json({ ok: false, error: 'auth_required', message: '이 수업 참여자만 채팅을 볼 수 있습니다.' }, 401);
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
      // 🔐 [무결성] 이 수업 참여자만 채팅 이력 저장 — 방ID(class-{id}-{날짜})는 추측 가능 → 무인증·비참여자가
      //   가짜 발신자(sender_role='teacher' 등)로 남의 수업 채팅에 메시지 주입하는 것을 차단 (2026-07-19).
      //   GET 과 동일한 이중 인증: 관리자/교사(쿠키세션)=신뢰 / 학생(mango_token)=vc_roster 참여 확인.
      //   ⚠️ 실시간 채팅은 WebRTC(vcConn)로 별도 전송되므로 저장이 거부돼도 수업 채팅 자체는 끊기지 않음(이력만 미저장).
      let cmRole: 'admin' | 'student' | null = null;
      let cmAuthedUid: string | null = null;
      try {
        const cmAdmin = await checkAdminSession(request, env as any);
        if (cmAdmin.ok) cmRole = 'admin';
        else {
          const cmAuth = await authUidGlobal(request, url, env, body);   // Bearer > body.token > ?token=
          if (cmAuth) {
            const inRoster: any = await env.DB.prepare(`SELECT 1 FROM vc_roster WHERE room_id=? AND account_uid=? LIMIT 1`).bind(roomId, cmAuth).first();
            if (inRoster) { cmRole = 'student'; cmAuthedUid = cmAuth; }
          }
        }
      } catch (e) { /* vc_roster 미존재 등 — 아래에서 차단 */ }
      if (!cmRole) return json({ ok: false, error: 'auth_required', message: '이 수업 참여자만 채팅을 저장할 수 있습니다.' }, 401);
      // 학생은 sender_uid 위조 방지: 클라이언트가 보낸 값 대신 인증된 uid 로 고정(교사/관리자는 신뢰).
      const safeSenderUid = (cmRole === 'student') ? cmAuthedUid : (body.sender_uid || null);
      const now = Date.now();
      const ins = await env.DB.prepare(
        `INSERT INTO chat_messages (room_id, sender_uid, sender_name, sender_role, message, sent_at, meta)
         VALUES (?,?,?,?,?,?,?)`
      ).bind(
        roomId,
        safeSenderUid,
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
      if (body.student_uid) pushResults.push({ role: 'student', ...(await sendPushToUser(env, body.student_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      if (body.parent_uid) pushResults.push({ role: 'parent', ...(await sendPushToUser(env, body.parent_uid, pushTitle, pushBody, pushUrl, pushTag)) });
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
      if (missingUid) push = await sendPushToUser(env, missingUid, pushTitle, pushBody, roomUrl, `no-show-${roomId}`);

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
        pushResult = await sendPushToUser(env, 
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

      // 🔐 [PII 오라클 차단] 응답에서 mapped_user_id·room_id 제거 (2026-07-19).
      //   이 webhook 은 무인증(외부 SOLAPI/카카오가 호출)이라, 전화번호를 POST 하고 응답의
      //   mapped_user_id 를 받으면 "이 번호가 등록됐는지 + 학생 uid" 를 열거할 수 있는 오라클이었음.
      //   매핑은 서버 내부(저장·채팅삽입)에만 쓰고 외부로 돌려주지 않는다. 카카오 openbuilder 는 reply 만 사용.
      return json({
        ok: true,
        id: ins.meta?.last_row_id || null,
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


    // (자녀연결 link-child·my-children → api-students.ts — 4차 이동)

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

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
