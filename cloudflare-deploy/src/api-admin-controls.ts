import { createAdminAuditWriter } from './admin-audit';
/** controls: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { signGhostObserveSig } from './auth-token';
import { getAdminActor, sameTeacherName, isOrgScopedRole } from './auth-admin';
import { diagnoseStudentDay } from './class-diagnose';

export async function handleAdminControlsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;



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
    const writeAudit = createAdminAuditWriter(env);


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

      /* 🔒 (2026-09-23) 이 방 1개 전용 참관 서명 — 화면이 ?observe=roomId&tok=... 로 열고,
         video-call-room.ts 의 handleJoinObserve 가 WebSocket join-observe 페이로드에서 검증한다.
         이 엔드포인트 자체가 이미 isAgencyAllowedApi·TEACHER_BLOCKED_PREFIXES 로 본사/관리자만
         걸러진 뒤라(지사·대리점·강사는 여기까지 못 옴) 별도 스코프 검사를 다시 걸 필요는 없다. */
      const observeSig = await signGhostObserveSig(roomId, env);

      return json({
        ok: true, observation_id: observationId, room_id: roomId,
        ghost_mode: 'recorded_only',
        notice_sent_to_others: false,                            // 핵심: 다른 참가자에게 알림 X
        media_consumer_pending: true,                            // GM-4 에서 활성화 예정
        observe_sig: observeSig,
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
      /* 🔎 (2026-10-01) ?uid=<학생>&date=YYYY-MM-DD — 그날 그 학생의 예약방·실제 접속·화상방 명단·회선/소리 기록을
         한 번에(읽기 전용). 정본 src/class-diagnose.ts. 강사·지사·대리점은 막는다(학생 접속 기록 전체가 실린다). */
      const diagUid = String(url.searchParams.get('uid') || '').trim();
      if (diagUid) {
        const _dgA = await getAdminActor(request, env as any);
        if (!_dgA.ok || _dgA.isTeacher || isOrgScopedRole(_dgA.role)) return json(forbiddenTeacherBody(_dgA as any), 403);
        return json(await diagnoseStudentDay(env, diagUid, url.searchParams.get('date')));
      }
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
  return null;
}
