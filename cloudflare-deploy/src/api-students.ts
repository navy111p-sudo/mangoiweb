// ═══════════════════════════════════════════════════════════════════════
// 👨‍👩‍👧 api-students.ts — 학생·학부모 도메인 API (api-mango.ts 에서 분리)
//   docs/REFACTOR_PLAN.md 1단계 · 4차 이동(2026-07-14) · 로직 무변경
//   포함: Phase PD(부모 대시보드) · 자녀연결(link-child/my-children)
//         Phase WD(위클리 카톡 다이제스트) · Phase PFB(학부모 상담 챗봇)
//         Phase LOGIN(학생 로그인·가입·조회·비번변경, 5차 이동)
//   라우트: /api/parent/* + /api/admin/parent-chat/* + /api/student/{register,login,lookup,set-password}
//   매칭 안 되면 null 반환 → handleMangoApi 가 나머지 라우팅 계속.
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal, signUidToken, startSession, inspectSession } from './auth-token';  // 🔐 소유자 검증(IDOR 방지)+토큰 발급+세션 사유 조회
import { checkAdminSession, resolveOwnerScope } from './auth-admin';  // 🔐 공용 소유자 판정
import { sendPlainSms } from './solapi-client';   // 🔑 비밀번호 재설정 SMS 인증 (2026-07-22)
import { MANGOI_KNOWLEDGE, matchMangoiFaq } from './mangoi-facts';   // 📚 챗봇 «사실» 정본(홈 상담봇과 공유)
import { isStudentHidden } from './student-override';   // 🧹 숨김 지정된 중복 계정은 로그인도 막는다
import type { MangoEnv } from './api-mango';
import { summarizeAttendance } from './attendance-truth';
import { buildTodayPlan, bandFromLevelCell, kstParts, dowMatches, aiStreak, type ClassToday, type ToolKey } from './today-plan';   // 📅 «오늘의 학습» 정본 (2026-09-03)

export async function handleStudentsApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ═══════════════════════════════════════════════════════════════
    // 👨‍👩‍👧 Phase PD — 부모 대시보드 통합 API
    //   GET /api/parent/dashboard?child_uid=X
    //   반환: 자녀 기본정보 + 최근 출석 + 평가서 4개 + 포인트 잔액/거래 + 결제내역 + 다음 수업
    // ═══════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/parent/dashboard') {
      /* 🔤 (2026-08-26) 아이디 대소문자 무시 — 아래에서 DB 표기로 통일하므로 let 이다. */
      let childUid = (url.searchParams.get('child_uid') || '').trim();
      if (!childUid) return json({ ok: false, error: 'child_uid_required' }, 400);

      // 안전 테이블 생성
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, updated_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, amount INTEGER NOT NULL, type TEXT, reason TEXT, balance_after INTEGER, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_name TEXT, lesson_date TEXT, score_overall INTEGER, score_speaking INTEGER, score_listening INTEGER, score_grammar INTEGER, score_vocab INTEGER, score_attitude INTEGER, strengths TEXT, weaknesses TEXT, next_goal TEXT, teacher_comment TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER, source TEXT, occurred_at INTEGER NOT NULL);`);

      // 자녀 기본정보 (password_hash 포함 — 본인확인용, 응답에는 제외)
      const student = await env.DB.prepare(
        `SELECT user_id, student_name, parent_name, parent_phone, program, status, created_at, password_hash
           FROM students_erp WHERE user_id = ? COLLATE NOCASE
          ORDER BY (user_id = ?) DESC, user_id ASC LIMIT 1`
      ).bind(childUid, childUid).first<any>();
      if (!student) return json({ ok: false, error: 'user_not_found', message: '학생 정보를 찾을 수 없습니다.' }, 404);
      /* 🪪 이후 조회는 전부 **DB 표기**로 — 포인트·평가서·출석·결제가 user_id 를 열쇠로 쓰므로
         여기서 통일하지 않으면 «학생은 찾았는데 기록만 전부 비는» 상태가 된다. */
      childUid = String(student.user_id);

      // 🔐 [PII] 학부모 본인 확인 — 자녀 계정 '비밀번호 로그인 토큰'이 있어야 열람 가능.
      //   ① 토큰(mango_token)의 uid 가 자녀 uid 와 일치해야 함(남의 자녀 차단)
      //   ② 비밀번호 미설정 계정은 차단 → parent.html 이 "비밀번호 설정(잠그기)"을 유도.
      //   (전화·이름 데이터가 D1 에 없어 비밀번호가 유일한 본인확인 수단)
      const _authUid = await authUidGlobal(request, url, env);
      // 🔤 본인확인도 대소문자 무시 — 위에서 계정을 «정확일치 우선» 으로 하나로 좁힌 뒤라 안전하다.
      if (!_authUid || _authUid.toLowerCase() !== childUid.toLowerCase()) {
        return json({ ok: false, error: 'auth_required', message: '자녀 계정으로 로그인해주세요.' }, 401);
      }
      if (!student.password_hash) {
        return json({ ok: false, error: 'password_not_set', message: '자녀 정보를 보호하려면 비밀번호를 먼저 설정하세요.' }, 401);
      }
      delete (student as any).password_hash;  // 해시는 응답에 절대 포함하지 않음

      // 포인트 잔액
      const pts = await env.DB.prepare(`SELECT balance, lifetime_earned, lifetime_spent FROM student_points WHERE user_id = ?`).bind(childUid).first<any>();
      const ptsTx = await env.DB.prepare(`SELECT amount, type, reason, balance_after, created_at FROM point_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`).bind(childUid).all();

      // 최근 평가서 4개
      const evals = await env.DB.prepare(`SELECT id, lesson_date, score_overall, score_speaking, score_listening, score_grammar, score_vocab, score_attitude, strengths, next_goal, teacher_name, created_at FROM student_evaluations WHERE student_uid = ? ORDER BY created_at DESC LIMIT 4`).bind(childUid).all();

      // 출석 (최근 30일, attendance 테이블 — 월간 리포트(report.html/buildMonthlyReportData)와 동일한 원천으로 통일)
      //   이전엔 point_rule_log(포인트 적립 로그, rule_code='attendance')를 썼는데, 이 리워드는 프론트가
      //   수업 페이지에서 별도로 /api/points/earn-by-rule 을 호출해야만 쌓여 실제 화상수업 입장 기록(attendance
      //   테이블)과 자주 어긋났다 — 마이페이지·월간 리포트 출석 숫자가 서로 다르게 보이던 원인(2026-07-31).
      //   status='attended' 는 수업 시간 내 입장으로 확정된 행(api-mango.ts checkin)만 표시하므로
      //   on_time_days 는 항상 attDays 의 부분집합이 되어 on_time_rate 가 100%를 넘는 일이 없다.
      //   🔴 (2026-08-30 v4 제안서 02) 여기서 두 가지가 틀려 있었다 — 실측 근거와 규칙은
      //   src/attendance-truth.ts 머리말에 있다. 요약하면
      //     ① 「제시간율」을 status='attended' 로만 셌는데 그 값은 전체의 0.06% 다
      //        → 출석 상위 학생조차 분자가 0이라 화면이 늘 «0%» 였다(제보 내용 그대로).
      //     ② 「출석 일수」에 status='scheduled' 인 **미래 예약**까지 들어갔다.
      //   ⛔ 판정을 여기서 다시 쓰지 말 것 — summarizeAttendance 하나가 정본이다.
      const sinceMs = Date.now() - 30 * 86400000;
      const attRows = await env.DB.prepare(
        `SELECT date, status, attended_at, joined_at FROM attendance WHERE user_id = ? AND joined_at >= ? AND date IS NOT NULL`
      ).bind(childUid, sinceMs).all();
      const attSummary = summarizeAttendance((attRows.results || []) as any[]);

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
        attendance: attSummary,
        payments: pays.results || [],
        generated_at: Date.now(),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 👨‍👩‍👧 Phase PD 끝
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
      // 🔐 [PII] 임의 자녀를 임의 학부모에 연결하는 무인증 취약점 차단 — 관리자 전용
      //   (학부모 자가연결은 자녀 계정 비밀번호 claim 흐름[parent.html]으로 별도 처리)
      const lcAdmin = await checkAdminSession(request, env as any);
      if (!lcAdmin.ok) return json({ ok: false, error: 'auth_required' }, 401);
      await ensureStudentsErpWithParent();
      const b: any = await request.json().catch(() => ({}));
      const pUid = String(b.parent_user_id || '').trim();
      const cUid = String(b.child_user_id || '').trim();
      if (!pUid || !cUid) return json({ ok: false, error: 'parent_user_id_and_child_user_id_required' }, 400);

      /* 자녀가 students_erp 에 있는지 확인 — 없으면 생성.
         🔤 (2026-08-25) 확인은 **대소문자를 무시**한다. 구분하면 `jeong` 이 있는데
            `Jeong` 으로 이으라고 할 때 「없다」로 읽어 **빈 학생 행을 새로 만들고**
            학부모를 그 빈 계정에 잇는다 → 학부모 화면이 영영 비어 보인다.
         ✅ 찾은 뒤에는 **DB 에 적힌 표기**(childUid)로 UPDATE·응답을 통일한다 —
            여기서 갈리면 대소문자가 그대로 아래로 흐른다(admin_account 건과 같은 규칙). */
      const exists = await env.DB.prepare(
        `SELECT user_id FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`
      ).bind(cUid).first<{ user_id: string }>();
      const childUid = exists ? String(exists.user_id) : cUid;
      if (exists) {
        await env.DB.prepare(`UPDATE students_erp SET parent_user_id = ?, parent_name = COALESCE(?, parent_name) WHERE user_id = ?`)
          .bind(pUid, b.parent_name || null, childUid).run();
      } else {
        await env.DB.prepare(`INSERT INTO students_erp (user_id, student_name, parent_user_id, parent_name, status, created_at) VALUES (?,?,?,?,?,?)`)
          .bind(childUid, b.child_name || childUid, pUid, b.parent_name || null, '신규', Date.now()).run();
      }
      return json({ ok: true, parent_user_id: pUid, child_user_id: childUid });
    }

    // ── GET /api/parent/my-children?uid=X — 학부모의 자녀 목록 ──
    if (method === 'GET' && path === '/api/parent/my-children') {
      await ensureStudentsErpWithParent();
      const pUid = (url.searchParams.get('uid') || '').trim();
      if (!pUid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [PII] 본인(학부모 토큰) 또는 관리자만 자녀 목록 조회 — 남의 자녀 열람 차단. [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, pUid))) {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      const rs = await env.DB.prepare(`SELECT user_id, student_name, program, status FROM students_erp WHERE parent_user_id = ?`).bind(pUid).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ═══════════════════════════════════════════════════════════════
    // 👪 Phase PC 끝
    // ═══════════════════════════════════════════════════════════════


    // (🎮 Phase BG 배지 → api-games.ts — 3차 이동)


    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase TVS — 음성 코칭 관리자 대시보드

    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase WD — 부모 위클리 카톡 다이제스트
    // ═══════════════════════════════════════════════════════════════
    const buildWeeklyDigest = (uid: string) => buildWeeklyParentDigest(env, uid);

    if (method === 'GET' && path === '/api/parent/digest/preview') {
      const sess = await checkAdminSession(request, env);   // 학부모 전화번호 노출 → 관리자 전용
      if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      try {
        const d = await buildWeeklyDigest(uid);
        return json({ ok: true, digest: d });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 실제 발송 공용 — SMS(SOLAPI)로 즉시 전송하고 결과를 digest_logs 에 기록. (알림톡 템플릿 승인 후 그 경로로 승격 예정)
    //   ⚠️ 돈이 나가는 대외 발송이라, 대량 경로는 반드시 KV 스위치로 잠근다.
    const ensureDigestLog = async () => {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`); } catch {}
    };
    const deliverDigest = async (d: any): Promise<string> => {
      const phone = String(d.parent_phone || '').replace(/[^0-9]/g, '');
      if (phone.length < 10) return 'no_phone';
      try { const r = await sendPlainSms(env, phone, d.message); return r?.ok ? 'sent' : ('fail:' + (r?.error || 'sms')); }
      catch (e: any) { return 'fail:' + String(e?.message || e).slice(0, 40); }
    };

    if (method === 'POST' && path === '/api/parent/digest/send-one') {
      const sess = await checkAdminSession(request, env);
      if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      try {
        const d = await buildWeeklyDigest(uid);
        if (!d.parent_phone) return json({ ok: false, error: 'no_parent_phone', digest: d });
        await ensureDigestLog();
        // 단건은 관리자가 명시적으로 누르는 것이므로 실제 발송. dry=true 면 미리보기(발송 안 함).
        const status = b.dry ? 'preview' : await deliverDigest(d);
        if (!b.dry) await env.DB.prepare(`INSERT INTO digest_logs (student_uid, parent_phone, message, sent_at, status) VALUES (?,?,?,?,?)`).bind(uid, d.parent_phone, d.message, Date.now(), status).run();
        return json({ ok: status === 'sent' || b.dry === true, sent: status === 'sent' ? 1 : 0, status, digest: d });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'POST' && path === '/api/parent/digest/send-all') {
      const sess = await checkAdminSession(request, env);
      if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
      try {
        const b: any = await request.json().catch(() => ({}));
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT);`);
        await ensureDigestLog();
        // 🔒 대량 실발송은 KV 스위치가 명시적으로 켜져 있을 때만. 기본은 dry(미리보기·집계만) — 실수로 29,000명에게 나가는 것 방지.
        let liveOn = false;
        try { liveOn = (await env.SESSION_STATE.get('digest:send_all_live')) === '1'; } catch {}
        const doSend = b.live === true && liveOn;   // 요청도 live=true 이고 KV 스위치도 ON 이어야 실발송
        const limit = Math.min(5000, Math.max(1, Number(b.limit) || 5000));
        const rs = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE parent_phone IS NOT NULL AND parent_phone != '' LIMIT ?`).bind(limit).all();
        const list = (rs.results || []) as any[];
        let eligible = 0, sent = 0, failed = 0, noPhone = 0, skipped = 0;
        const now = Date.now();
        for (const r of list) {
          try {
            const d = await buildWeeklyDigest(r.user_id);
            if (!d.parent_phone) { noPhone++; continue; }
            eligible++;
            if (!doSend) continue;   // dry: 대상 집계만
            // 🛡 멱등: 이번 주 이미 발송했으면 skip(크론과 겹쳐도 중복문자 방지)
            if (await digestSentRecently(env, r.user_id)) { skipped++; continue; }
            const status = await deliverDigest(d);
            await env.DB.prepare(`INSERT INTO digest_logs (student_uid, parent_phone, message, sent_at, status) VALUES (?,?,?,?,?)`).bind(r.user_id, d.parent_phone, d.message, now, status).run();
            if (status === 'sent') sent++; else failed++;
          } catch { failed++; }
        }
        return json({ ok: true, live: doSend, kv_switch: liveOn, total: list.length, eligible, sent, failed, no_phone: noPhone, skipped_dup: skipped,
          note: doSend ? '실발송 완료' : '미리보기(집계만) — 실발송하려면 요청 live:true + KV digest:send_all_live=1 둘 다 필요' });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'GET' && path === '/api/parent/digest/logs') {
      const sess = await checkAdminSession(request, env);   // 발송 로그(전화번호·메시지) → 관리자 전용
      if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
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
    // 🤖 Phase PFB — 학부모 상담 AI 챗봇 (Parent FAQ Bot)
    // ═══════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/parent/chat') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS parent_chat_log (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, user_message TEXT, ai_reply TEXT, escalated INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);

        const b: any = await request.json().catch(() => ({}));
        const userMessage = String(b.message || '').trim().slice(0, 1000);
        const conversationId = String(b.conversation_id || '').trim() || `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (!userMessage) return json({ ok: false, error: 'message_required' }, 400);

        // 📚 사실 근거는 src/mangoi-facts.ts 하나뿐입니다 — 홈 상담봇(/api/consult-bot)과 같은 파일을 씁니다.
        //    ⚠️ 2026-08-11 이전에는 이 자리에 FAQ 가 통째로 복사돼 있었고, 그 사본이 틀렸습니다:
        //       지어낸 수강료(월 19/26/39만원)·틀린 환불규정(7일 이내 100%)·틀린 강사 구성(한국인 강사 위주).
        //       학부모가 어느 챗봇에 묻느냐에 따라 다른 답을 받고 있었습니다. 여기에 다시 복사하지 마세요.
        const faqContext = `당신은 한국 어린이 영어학원 "망고아이(Mangoi)"의 친절한 학부모 상담 AI 어시스턴트입니다.
아래 [정보]에 있는 사실만 근거로 답변하세요. [정보]에 없는 내용(특히 수강료·할인·교재비 등 금액)은 절대 지어내지 말고, "원장님께 직접 문의드리겠다"고 안내한 뒤 응답 끝에 [ESCALATE] 토큰을 붙이세요.
항상 따뜻한 한국어 존댓말로 답변하세요.

[정보]
${MANGOI_KNOWLEDGE}`;

        // 🎯 요금·환불처럼 틀리면 안 되는 주제는 LLM 에 묻지 않고 사람이 쓴 답을 그대로 씁니다(환각 0).
        //    홈 상담봇과 글자까지 같은 답이 나갑니다.
        const faqHits = matchMangoiFaq(userMessage);
        if (faqHits.length) {
          const reply = faqHits.join('\n\n');
          await env.DB.prepare(`INSERT INTO parent_chat_log (conversation_id, user_message, ai_reply, escalated, created_at) VALUES (?,?,?,?,?)`)
            .bind(conversationId, userMessage, reply, 0, Date.now()).run();
          return json({ ok: true, reply, escalate: false, conversation_id: conversationId });
        }

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

    // ── POST /api/student/register — 홈 회원가입(자기신청) → 실제 학생 계정 생성 + 자동 로그인 토큰 ──
    //   body: { user_id, password, name, phone?, email?, age? }
    //   · self_signup 태그로 실학원 로스터(카페24 적재분)와 구분
    //   · 성공 시 로그인과 동일한 { ok, token, user } 반환 → 프론트가 바로 로그인 처리
    if (method === 'POST' && path === '/api/student/register') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      await ensureLoginTable();
      // self_signup 구분 + 연락 컬럼 보강(멱등)
      for (const [col, type] of [['source', 'TEXT'], ['email', 'TEXT'], ['phone', 'TEXT'], ['age', 'TEXT']] as [string, string][]) {
        try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${col} ${type}`); } catch {}
      }
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      const pwd = String(b.password || '').trim();
      const name = String(b.name || b.student_name || '').trim();
      const phone = String(b.phone || '').trim();
      const email = String(b.email || '').trim();
      const age = String(b.age || '').trim();
      // 검증 — 프론트와 동일 규칙
      if (!uid || uid.length < 4 || uid.length > 20) return json({ ok: false, error: 'invalid_user_id', message: '아이디는 4~20자여야 합니다.' }, 400);
      if (!/^[a-zA-Z0-9_]+$/.test(uid)) return json({ ok: false, error: 'invalid_user_id', message: '아이디는 영문/숫자/언더바만 가능합니다.' }, 400);
      if (!pwd || pwd.length < 4) return json({ ok: false, error: 'weak_password', message: '비밀번호는 4자 이상이어야 합니다.' }, 400);
      if (!name) return json({ ok: false, error: 'name_required', message: '학생 이름을 입력해 주세요.' }, 400);
      /* 중복 아이디 차단 — 🔤 (2026-08-25) **대소문자를 무시**한다.
         바로 아래 `/api/student/login` 이 `WHERE user_id = ? COLLATE NOCASE` 로 찾으므로,
         여기서만 구분하면 `jeong` 이 있는데 `Jeong` 이 새로 만들어지고(PK 는 BINARY 라
         UNIQUE 에 안 걸린다) 로그인은 둘 중 «아무 행이나» 집는다.
         ⚠️ 관리자 수동 등록(api-admin.ts `/api/admin/students/create`)과 **짝**이다 —
            한쪽만 고치면 그 경로로 그대로 두 벌이 생긴다. */
      const exists: any = await env.DB.prepare(
        `SELECT user_id FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`
      ).bind(uid).first();
      if (exists) {
        const caseOnly = String(exists.user_id) !== uid;
        return json({ ok: false, error: 'exists',
          message: caseOnly
            ? `이미 «${exists.user_id}» 가 있습니다(대소문자만 다릅니다). 로그인은 대소문자를 구분하지 않으니 다른 아이디를 쓰세요.`
            : '이미 사용 중인 아이디입니다.' }, 409);
      }
      const now = Date.now();
      const ph = await hashPwd(pwd);
      await env.DB.prepare(
        `INSERT INTO students_erp (user_id, student_name, parent_phone, phone, email, age, status, source, password_hash, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, 'active', 'self_signup', ?, ?, ?)`
      ).bind(uid, name, phone || null, phone || null, email || null, age || null, ph, now, now).run();
      // 🔒 가입 직후 곧바로 로그인 상태가 되므로 여기서도 세션을 연다
      const _sidNew = await startSession(uid, env);
      return json({
        ok: true,
        token: await signUidToken(uid, env, undefined, _sidNew),
        user: { user_id: uid, user_name: name, role: 'student', has_password: true },
      });
    }

    // ── POST /api/student/login — 학생/학부모 통합 로그인 ──
    //   body: { user_id, password? }
    //   비밀번호 미설정자는 user_id 만으로 로그인 가능 (개발 단계 편의)
    // ── GET /api/student/session-status — 「왜 로그아웃됐는지」를 화면에 알려주기 위한 조회 ──
    //   🔒 (2026-08-08) 동시접속 1세션을 켜면 밀려난 기기가 401 을 받는데, 지금은 그냥
    //      「로그인해주세요」로만 보여 사용자가 이유를 모른다. 401 을 받은 화면이 이걸 한 번 물어
    //      «다른 기기에서 로그인되었습니다» 를 정확히 띄운다.
    //   ⚠️ 개인정보를 돌려주지 않는다 — uid 는 요청자가 이미 토큰으로 갖고 있는 값이고,
    //      DB 조회도 하지 않는다(서명 + KV 대조뿐). 그래서 인증 게이트 없이 열어도 안전하다.
    // ═══════════════════════════════════════════════════════════════
    // 📅 (2026-09-03) GET /api/student/today?uid=&token=  — «오늘의 학습»
    //   학생 한 명의 레벨·교재·오늘 수업(망고아이 + 카페24)·도구별 «오늘 했나» 를 모아
    //   정본 buildTodayPlan(src/today-plan.ts) 에 넘긴다. 판정은 전부 그 함수 안에 있고
    //   여기는 «재료를 모으는 곳» 이다 — 규칙을 여기에 다시 적지 말 것.
    //   🔐 본인(토큰) 또는 관리자·교사 세션만(resolveOwnerScope). 게스트는 거절한다 —
    //      이 응답에는 학생 이름·수업 시각이 실린다.
    //   ⚠️ 각 조회는 실패해도 «0·없음» 으로 떨어진다 — 표 하나가 없다고(새 DB) 화면이
    //      통째로 비면 안 된다. 단 students_erp 조회 실패는 그대로 500 이 맞다(기본 재료).
    // ═══════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/student/today') {
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const scope = await resolveOwnerScope(request, url, env as any, uid);
      if (scope !== 'self' && scope !== 'admin') {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 계획만 볼 수 있습니다.' }, 401);
      }
      const nowMs = Date.now();
      const k = kstParts(nowMs);
      // 이번 주(일~토) 범위 — 주간표의 «수업 있는 요일» 용
      const weekStartMs = k.dayStartMs - k.dow * 86400000;
      const weekEndMs = weekStartMs + 7 * 86400000;
      const ymdOf = (ms: number) => kstParts(ms).ymd;
      const weekStartYmd = ymdOf(weekStartMs), weekEndYmd = ymdOf(weekEndMs - 1);
      const since60 = nowMs - 60 * 86400000;
      const empty = { results: [] as any[] };

      /* ⚠️ 정확일치 우선 — `Kim`/`kim` 처럼 대소문자만 다른 행이 실재한다(CLAUDE.md 2장).
         NOCASE 하나로만 찾으면 «둘 중 아무거나» 를 집는다. */
      const stu: any = await env.DB.prepare(
        `SELECT user_id, student_name, korean_name, level, textbook FROM students_erp
          WHERE user_id = ? COLLATE NOCASE ORDER BY (user_id = ?) DESC LIMIT 1`
      ).bind(uid, uid).first();
      if (!stu) return json({ ok: false, error: 'not_found' }, 404);
      const exactUid = String(stu.user_id || uid);

      // 오늘 도구별 활동 — «한 번이라도 썼나» 만 본다(분 단위는 재지 못하므로 지어내지 않는다)
      const cnt = async (sql: string, ...args: any[]): Promise<number> => {
        try { const r: any = await env.DB.prepare(sql).bind(...args).first(); return Number(r?.n || 0); }
        catch { return 0; }
      };
      const d0 = k.dayStartMs;
      const [doneWarmup, doneReview, doneFriend, doneSpeech, doneMicro, doneVocab, doneJudg, doneWrite, doneGames,
             clsRs, c24Rs, ptRow, ...dateRs] = await Promise.all([
        cnt(`SELECT COUNT(*) n FROM warmup_session_log WHERE user_id = ? AND started_at >= ?`, exactUid, d0),
        cnt(`SELECT COUNT(*) n FROM review_quiz_results WHERE user_id = ? AND created_at >= ?`, exactUid, d0),
        cnt(`SELECT COUNT(*) n FROM ai_friend_chats WHERE student_uid = ? AND role = 'user' AND created_at >= ?`, exactUid, d0),
        cnt(`SELECT COUNT(*) n FROM voice_coaching WHERE student_uid = ? AND created_at >= ?`, exactUid, d0),
        cnt(`SELECT COUNT(*) n FROM vocab_quizzes WHERE user_id = ? AND completed = 1 AND completed_at >= ?`, exactUid, d0),
        cnt(`SELECT COUNT(*) n FROM vocab_review_log WHERE user_id = ? AND reviewed_at >= ?`, exactUid, d0),
        cnt(`SELECT COUNT(*) n FROM judgment_events WHERE student_uid = ? AND created_at >= ?`, exactUid, d0),
        cnt(`SELECT COUNT(*) n FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ?`, exactUid, d0),
        cnt(`SELECT COUNT(*) n FROM game_sessions WHERE uid = ? AND created_at >= ?`, exactUid, d0),
        /* 망고아이 시간표 — 정기(요일)와 날짜지정 둘 다. LMS·시드 자리표시는 뺀다(2026-08-24 결정). */
        env.DB.prepare(
          `SELECT day_of_week, scheduled_date, start_time, duration_min, schedule_kind
             FROM class_schedules
            WHERE user_id = ? COLLATE NOCASE AND status = 'active'
              AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')
              AND (schedule_kind = 'recurring' OR (scheduled_date BETWEEN ? AND ?))
            LIMIT 80`
        ).bind(exactUid, weekStartYmd, weekEndYmd).all<any>().catch(() => empty),
        /* 카페24 예약 씨앗 — joined_at 이 «예약 시각» 이다(2026-09-03 D1 실측). 카페24 수업은
           우리 방을 안 거치지만 «그날 학원 수업이 있다» 는 사실은 계획에 그대로 쓴다. */
        env.DB.prepare(
          `SELECT date, joined_at FROM attendance
            WHERE user_id = ? AND room_id LIKE 'c24-%' AND date BETWEEN ? AND ? LIMIT 40`
        ).bind(exactUid, weekStartYmd, weekEndYmd).all<any>().catch(() => empty),
        env.DB.prepare(
          `SELECT COALESCE(SUM(amount),0) s FROM point_transactions WHERE user_id = ? AND type = 'earn' AND created_at >= ?`
        ).bind(exactUid, d0).first<any>().catch(() => null),
        // AI 활동 연속일 — 60일치 KST 날짜 집합(도구 9종 합집합)
        ...([
          [`warmup_session_log`, `user_id`, `started_at`],
          [`review_quiz_results`, `user_id`, `created_at`],
          [`ai_friend_chats`, `student_uid`, `created_at`],
          [`voice_coaching`, `student_uid`, `created_at`],
          [`vocab_quizzes`, `user_id`, `completed_at`],
          [`judgment_events`, `student_uid`, `created_at`],
          [`ai_writing_corrections`, `student_uid`, `created_at`],
          [`game_sessions`, `uid`, `created_at`],
        ] as [string, string, string][]).map(([tb, col, ts]) =>
          env.DB.prepare(
            `SELECT DISTINCT date(${ts}/1000,'unixepoch','+9 hours') d FROM ${tb} WHERE ${col} = ? AND ${ts} >= ?`
          ).bind(exactUid, since60).all<any>().catch(() => empty)),
      ]);

      // 오늘 수업 + 이번 주 수업 요일
      const classes: ClassToday[] = [];
      const weekDows = new Set<number>();
      for (const r of (clsRs?.results || [])) {
        const mins = Number(r.duration_min || 20) || 20;
        if (String(r.schedule_kind) === 'recurring') {
          for (let d = 0; d <= 6; d++) if (dowMatches(r.day_of_week, d)) weekDows.add(d);
          if (dowMatches(r.day_of_week, k.dow) && r.start_time) classes.push({ start: String(r.start_time).slice(0, 5), minutes: mins, source: 'mangoi' });
        } else if (r.scheduled_date) {
          const dd = kstParts(Date.parse(String(r.scheduled_date) + 'T12:00:00+09:00')).dow;
          weekDows.add(dd);
          if (String(r.scheduled_date) === k.ymd && r.start_time) classes.push({ start: String(r.start_time).slice(0, 5), minutes: mins, source: 'mangoi' });
        }
      }
      for (const r of (c24Rs?.results || [])) {
        const j = Number(r.joined_at || 0);
        if (!j) continue;
        const kp = kstParts(j);
        weekDows.add(kp.dow);
        if (String(r.date) === k.ymd) {
          const hh = String(Math.floor(kp.min / 60)).padStart(2, '0'), mm = String(kp.min % 60).padStart(2, '0');
          classes.push({ start: `${hh}:${mm}`, minutes: 20, source: 'cafe24' });
        }
      }

      const textbook = String(stu.textbook || '').trim() || null;
      const zh = !!textbook && /다락원|중국어/.test(textbook);
      const done: Partial<Record<ToolKey, number>> = {
        warmup: doneWarmup, review: doneReview, friend: doneFriend, speech: doneSpeech,
        micro: doneMicro, vocab: doneVocab, judgment: doneJudg, write: doneWrite, games: doneGames,
      };
      const plan = buildTodayPlan({
        band: bandFromLevelCell(stu.level), textbook, zh,
        dow: k.dow, nowMin: k.min, classes, weekClassDows: [...weekDows], done,
      });
      const dates: string[] = [];
      for (const rs of dateRs) for (const r of ((rs as any)?.results || [])) if (r?.d) dates.push(String(r.d));
      const res = json({
        ok: true,
        uid: exactUid,
        name: String(stu.student_name || stu.korean_name || '').trim(),
        today: k.ymd,
        points_today: Number(ptRow?.s || 0),
        ai_streak: aiStreak(dates, k.ymd),
        plan,
      });
      res.headers.set('Cache-Control', 'private, no-store');   // 이름·수업 시각이 실린 응답 — 캐시 금지
      return res;
    }

    if (method === 'GET' && path === '/api/student/session-status') {
      const h = request.headers.get('Authorization') || '';
      const tok = (h.startsWith('Bearer ') ? h.slice(7) : '').trim() || String(url.searchParams.get('token') || '').trim();
      if (!tok) return json({ ok: true, state: 'none', uid: null });
      const r = await inspectSession(tok, env);
      return json({ ok: true, state: r.state, uid: r.uid });
    }

    if (method === 'POST' && path === '/api/student/login') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, parent_user_id TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      await ensureLoginTable();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      const pwd = String(b.password || '').trim();
      if (!uid) return json({ ok: false, error: 'user_id_required' }, 400);

      // 🔤 (2026-07-22) 학부모 컴플레인 #7: 대소문자 오타로 '학생 ID 없음'이 뜨던 문제 —
      //    조회를 대소문자 무시(NOCASE)로 바꾸고, 이후 처리는 DB의 원래 표기(stu.user_id)를 쓴다.
      /* 🔤 (2026-08-26 사장님 지시) 아이디는 **대소문자를 완전히 무시한다.** 어린이 학생이
         가장 헷갈리는 것이 대소문자이고, 한국어에는 대소문자가 없어 감이 없다.
         ⚠️ 그런데 NOCASE «하나만» 두면 안 된다 — `students_erp.user_id` 는 `TEXT PRIMARY KEY`
            = BINARY 라 대소문자만 다른 행이 UNIQUE 에 안 걸리고, 실제로 실재한다
            (2026-08-26 실측: `Kim`/`kim`, `Lee`/`lee` 네 행). ORDER BY 없는 NOCASE 조회는
            **둘 중 아무 행이나** 집어서 «어제까지 되던 사람» 이 남의 계정으로 들어간다.
         ✅ 그래서 **정확일치를 먼저** 보고, 없을 때만 대소문자만 다른 행을 쓴다.
            정본은 관리자 로그인(auth-admin.ts)의 같은 규칙과 한 몸이다. */
      const stu: any = await env.DB.prepare(
        `SELECT user_id, student_name, parent_name, parent_phone, parent_user_id, password_hash
           FROM students_erp WHERE user_id = ? COLLATE NOCASE
          ORDER BY (user_id = ?) DESC, user_id ASC LIMIT 1`
      ).bind(uid, uid).first();
      if (!stu) return json({ ok: false, error: 'user_not_found', message: '학생 ID 를 찾을 수 없습니다. 학원에 문의해주세요.' }, 404);

      /* 🧹 (2026-08-20) 숨김 지정한 중복 계정은 로그인도 막는다.
         명부에서만 감추면 «없앴다» 가 아니다 — 같은 사람의 옛 계정으로 들어가서
         「내 수업이 안 보인다」가 그대로 재현된다(정우영 계정 15개 건).
         ⛔ students_erp 행을 지워서 막지 말 것 — 카페24가 정본이라 밤에 되살아난다.
         정본: src/student-override.ts */
      if (await isStudentHidden(env, String(stu.user_id))) {
        return json({ ok: false, error: 'account_retired', message: '더 이상 사용하지 않는 계정입니다. 현재 사용 중인 아이디로 로그인해주세요.' }, 403);
      }

      // 비밀번호 검증 — 설정된 경우만
      if (stu.password_hash) {
        if (!pwd) return json({ ok: false, error: 'password_required', message: '비밀번호를 입력해주세요.' }, 401);
        const h = await hashPwd(pwd);
        if (h !== stu.password_hash) return json({ ok: false, error: 'invalid_password', message: '비밀번호가 일치하지 않습니다.' }, 401);
      }

      // 마지막 로그인 시각 업데이트 (NOCASE 매치 후엔 항상 DB 원표기 기준)
      try { await env.DB.prepare(`UPDATE students_erp SET last_login_at = ? WHERE user_id = ?`).bind(Date.now(), stu.user_id).run(); } catch {}

      // 🔒 동시접속 1세션 — 새 세션을 열면 이전 기기의 토큰은 죽는다(SINGLE_SESSION='on' 일 때만 작동)
      const _sid = await startSession(stu.user_id, env);

      return json({
        ok: true,
        // 🔐 uid 서명 토큰 — uid 기반 개인 데이터 API(/api/ai/chat-* 등) 호출 시 필요
        //    ⚠️ 반드시 DB 원표기(stu.user_id)로 서명 — 소문자 입력 시에도 하위 API uid 검증이 일치하게
        token: await signUidToken(stu.user_id, env, undefined, _sid),
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

    // ── GET /api/student/focus-history?uid=&days=30 — 학생 본인 집중도 이력 ──
    //   🆕 (2026-08-03) 화면(js/idx-grid-menu.js '집중도 결과')이 이 경로를 부르고 있었는데
    //      **서버에 아예 없었다.** 그래서 매번 404 → 클라이언트가 난수로 만든 샘플을
    //      본인 기록처럼 보여주고 있었다. 실제 원천은 attendance 테이블이다.
    //   원천: attendance(gaze_score, total_active_ms, total_session_ms, disconnect_count)
    //   점수식은 api-mango.ts 의 녹화 채점과 **동일하게** 맞춘다 — 화면 안내문도 같은 비율이다:
    //     시선 50% + 발화(수업 중 활동 비율) 30% + 안정성(끊김 적을수록 높음) 20%
    //   🔐 본인만 조회 가능(서명토큰 uid 일치). 남의 uid 를 넣어도 열리면 IDOR 이다.
    if (method === 'GET' && path === '/api/student/focus-history') {
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid || authUid.toLowerCase() !== uid.toLowerCase()) {
        return json({ ok: false, error: 'auth_required', message: '본인 계정으로 로그인해주세요.' }, 401);
      }
      const since = Date.now() - days * 86400000;
      let rows: any[] = [];
      try {
        const rs = await env.DB.prepare(
          `SELECT date, joined_at, username, gaze_score, disconnect_count, total_active_ms, total_session_ms
             FROM attendance
            WHERE user_id = ? COLLATE NOCASE AND joined_at >= ?
            ORDER BY joined_at ASC LIMIT 400`
        ).bind(uid, since).all();
        rows = (rs.results || []) as any[];
      } catch { rows = []; }

      const sessions = rows.map((r: any) => {
        const sessMs = Number(r.total_session_ms) || 0;
        const actMs = Number(r.total_active_ms) || 0;
        // 측정값이 없는 회차는 추정하지 않고 null 로 둔다 — 지어낸 수치가 섞이면 안 된다.
        const gaze = (typeof r.gaze_score === 'number') ? Math.round(r.gaze_score) : null;
        const speak = sessMs > 0 ? Math.round(actMs * 100 / sessMs) : null;
        const posture = (r.disconnect_count == null)
          ? null : Math.max(0, 100 - Math.min(100, Number(r.disconnect_count) * 20));
        const total = (gaze == null && speak == null && posture == null)
          ? null
          : Math.round((gaze == null ? 60 : gaze) * 0.5 + (speak == null ? 70 : speak) * 0.3 + (posture == null ? 100 : posture) * 0.2);
        return {
          date: r.date || (r.joined_at ? new Date(Number(r.joined_at)).toISOString().slice(0, 10) : '-'),
          teacher: '', topic: '',
          duration_min: sessMs > 0 ? Math.round(sessMs / 60000) : 0,
          measured: gaze != null || speak != null,   // 화면이 '미측정'을 구분할 수 있도록
          scores: { total, gaze, speak, posture },
        };
      }).filter((s: any) => s.scores.total != null);

      let name = uid;
      try {
        const stu: any = await env.DB.prepare(
          `SELECT student_name FROM students_erp WHERE user_id = ? COLLATE NOCASE`
        ).bind(uid).first();
        if (stu && stu.student_name) name = stu.student_name;
      } catch {}
      return json({ ok: true, sessions, profile: { name } });
    }

    /* ── GET /api/student/full?uid=&days=30 — 학생 본인 «평가표» ────────────────
     *
     * [왜] 화면(js/idx-grid-menu.js '평가표')이 이 경로를 부르는데 **서버에 없었다**.
     *      매번 404 → 클라이언트가 지어낸 샘플(Maria Santos·82점…)을 본인 기록처럼 보여줬다.
     *      [[student-home-report-focus-dead-endpoints]] 와 같은 뿌리. 집중도는 먼저 고쳤고 이건 남아 있었다.
     *
     * [원칙] 없는 건 «없다»고 보낸다. 추정·평균·난수로 칸을 메우지 않는다.
     *        학부모가 보는 숫자이고, 한 번 지어내면 실기록과 구분할 수 없다.
     *
     * ⚠️ 축 이름 주의 — 우리 평가서의 실제 축은 참여·이해·숙제·태도·말하기다.
     *    화면의 옛 필드명(listening/reading/writing)에 그대로 담되 **화면 라벨도 같이 바꿨다**.
     *    담기만 하고 라벨을 안 바꾸면 «이해» 점수가 «리스닝» 으로 둔갑한다.
     *
     * 🔐 본인만 조회 가능(서명토큰 uid 일치). 남의 uid 로 열리면 IDOR 이다.
     */
    if (method === 'GET' && path === '/api/student/full') {
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid || authUid.toLowerCase() !== uid.toLowerCase()) {
        return json({ ok: false, error: 'auth_required', message: '본인 계정으로 로그인해주세요.' }, 401);
      }
      const since = Date.now() - days * 86400000;
      const empty = { results: [] as any[] };

      // 서로 의존하지 않으므로 한꺼번에 — 회선이 느린 곳에서 왕복이 곧 대기시간이다.
      const [stuRow, attRs, evalRs, payRs] = await Promise.all([
        env.DB.prepare(`SELECT student_name, level, textbook FROM students_erp WHERE user_id = ? COLLATE NOCASE`)
          .bind(uid).first<any>().catch(() => null),
        env.DB.prepare(
          `SELECT id, date, joined_at, gaze_score, total_active_ms, total_session_ms, room_id
             FROM attendance
            WHERE user_id = ? COLLATE NOCASE AND joined_at >= ?
            ORDER BY joined_at ASC LIMIT 400`
        ).bind(uid, since).all<any>().catch(() => empty),
        env.DB.prepare(
          `SELECT id, eval_at, lesson_date, lesson_title, teacher_name,
                  score_participation, score_comprehension, score_homework, score_attitude,
                  score_speaking, score_overall, next_goals, teacher_comment
             FROM student_evaluations
            WHERE (student_uid = ? COLLATE NOCASE OR user_id = ? COLLATE NOCASE)
            ORDER BY COALESCE(eval_at, created_at) DESC LIMIT 20`
        ).bind(uid, uid).all<any>().catch(() => empty),
        env.DB.prepare(
          `SELECT status, amount_krw FROM student_payments
            WHERE user_id = ? COLLATE NOCASE ORDER BY id DESC LIMIT 50`
        ).bind(uid).all<any>().catch(() => empty),
      ]);

      const att = (attRs.results || []) as any[];
      let actSum = 0, sessSum = 0, gazeSum = 0, gazeCnt = 0;
      const sessions = att.map((r) => {
        const act = Number(r.total_active_ms) || 0;
        const sess = Number(r.total_session_ms) || 0;
        actSum += act; sessSum += sess;
        const gaze = (typeof r.gaze_score === 'number') ? r.gaze_score : null;
        if (gaze != null) { gazeSum += gaze; gazeCnt++; }
        return {
          id: r.id,
          date: r.date || (r.joined_at ? new Date(Number(r.joined_at)).toISOString().slice(0, 10) : ''),
          joined_at: r.joined_at ? Math.floor(Number(r.joined_at) / 1000) : null,
          active_ms: act, session_ms: sess, gaze_score: gaze,
          teacher: '',            // attendance 에 강사 이름이 없다 — 지어내지 않고 빈 값
          topic: '',
        };
      }).reverse();               // 화면은 최신이 위

      const evaluations = ((evalRs.results || []) as any[]).map((e) => {
        const at = Number(e.eval_at) || 0;
        return {
          id: e.id,
          // 화면은 초 단위를 기대한다(new Date(eval_at*1000)). ms 로 저장된 값을 초로 맞춘다.
          eval_at: at > 1e12 ? Math.floor(at / 1000) : at,
          eval_type: e.lesson_title ? String(e.lesson_title) : '수업 평가',
          level: stuRow?.level || '',
          evaluator: e.teacher_name || '',
          // 실제 축을 옛 필드 자리에 담는다(화면 라벨도 함께 바꿨다)
          score_speaking: e.score_speaking,
          score_listening: e.score_comprehension,
          score_reading: e.score_homework,
          score_writing: e.score_attitude,
          score_total: e.score_overall != null ? Math.round(Number(e.score_overall)) : null,
          // 원래 이름 그대로도 같이 보낸다 — 나중에 화면을 고칠 때 헷갈리지 않도록
          axes: {
            participation: e.score_participation, comprehension: e.score_comprehension,
            homework: e.score_homework, attitude: e.score_attitude, speaking: e.score_speaking,
          },
          next_goal: e.next_goals || '',
          comment: e.teacher_comment || '',
        };
      });

      return json({
        ok: true,
        source: 'real',           // 화면이 «샘플 아님» 을 확실히 알 수 있게
        profile: {
          username: stuRow?.student_name || uid,
          level: stuRow?.level || '',
          textbook: stuRow?.textbook || '',
          classes_per_week: null,  // 이 값을 담는 칸이 아직 없다 — 0 으로 채우면 결석이 지어내진다
        },
        summary: {
          total_active_ms: actSum,
          total_session_ms: sessSum,
          avg_gaze_score: gazeCnt ? gazeSum / gazeCnt : null,
          gaze_score_count: gazeCnt,
        },
        evaluations, sessions,
        payments: (payRs.results || []) as any[],
        rewards: [],               // 보상 원천이 이 화면과 아직 연결돼 있지 않다 — 빈 값이 정직하다
        enrollments: [],
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
      /* 🔤 (2026-08-26) 로그인과 같은 규칙 — 아이디 대소문자 무시(정확일치 우선).
         여기가 빠져 있으면 로그인은 되는데 «연장 결제» 만 «학생 정보를 찾을 수 없습니다» 가 된다. */
      try {
        stu = await env.DB.prepare(
          `SELECT * FROM students_erp WHERE user_id = ? COLLATE NOCASE
            ORDER BY (user_id = ?) DESC, user_id ASC LIMIT 1`
        ).bind(uid, uid).first();
      } catch {}
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

      /* 🔤 (2026-08-26) 로그인과 같은 규칙 — 아이디 대소문자 무시(정확일치 우선).
         ⚠️ UPDATE 는 반드시 **DB 에 적힌 표기**(canonUid)로 한다. 입력 표기로 쓰면
            대소문자가 다른 순간 «저장했다는데 새 비번으로 로그인이 안 되는» 상태가 된다
            (0건 UPDATE 는 에러를 내지 않는다). */
      const stu: any = await env.DB.prepare(
        `SELECT user_id, password_hash FROM students_erp WHERE user_id = ? COLLATE NOCASE
          ORDER BY (user_id = ?) DESC, user_id ASC LIMIT 1`
      ).bind(uid, uid).first();
      if (!stu) return json({ ok: false, error: 'user_not_found' }, 404);
      const canonUid = String(stu.user_id);
      // 기존 비밀번호 있으면 검증
      if (stu.password_hash) {
        const h = await hashPwd(oldPwd);
        if (h !== stu.password_hash) return json({ ok: false, error: 'invalid_old_password' }, 401);
      }
      const newHash = await hashPwd(newPwd);
      await env.DB.prepare(`UPDATE students_erp SET password_hash = ? WHERE user_id = ?`).bind(newHash, canonUid).run();
      return json({ ok: true, message: '비밀번호가 변경됐습니다.' });
    }

    // ── 🔑 비밀번호 재설정 (SMS 인증) — 2026-07-22 학부모 컴플레인 #7 ──
    //   그동안 비번 분실 = 학원 문의뿐이었음. 등록 전화번호로 6자리 코드를 보내 자가 재설정.
    //   POST /api/student/password-reset/request  { user_id }        → 등록번호로 코드 발송(뒷자리 마스킹 응답)
    //   POST /api/student/password-reset/confirm  { user_id, code, new_password } → 검증 후 변경
    //   안전장치: 코드 10분 유효 · 검증 5회 제한 · 요청 1시간 3회 제한 · 코드는 해시로만 저장
    const ensurePwReset = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_pw_reset (user_id TEXT PRIMARY KEY, code_hash TEXT, expires_at INTEGER, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, first_sent_at INTEGER, created_at INTEGER)`);
    };
    if (method === 'POST' && path === '/api/student/password-reset/request') {
      await ensureLoginTable(); await ensurePwReset();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      if (!uid) return json({ ok: false, error: 'user_id_required', message: '아이디를 입력해 주세요.' }, 400);
      const stu: any = await env.DB.prepare(`SELECT * FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`).bind(uid).first();
      if (!stu) return json({ ok: false, error: 'user_not_found', message: '해당 아이디를 찾을 수 없습니다. 학원에 문의해 주세요.' }, 404);
      const canonUid = String(stu.user_id);
      const phone = String(stu.student_phone || stu.phone || stu.parent_phone || '').replace(/[^0-9]/g, '');
      if (!phone || phone.length < 8) {
        return json({ ok: false, error: 'no_phone', message: '등록된 전화번호가 없어요. 학원(카카오 채널)으로 문의해 주세요.' }, 400);
      }
      const now = Date.now();
      // 1시간 3회 발송 제한
      const prev: any = await env.DB.prepare(`SELECT * FROM student_pw_reset WHERE user_id = ?`).bind(canonUid).first().catch(() => null);
      let sentCount = 0, firstSentAt = now;
      if (prev && prev.first_sent_at && now - prev.first_sent_at < 3600 * 1000) {
        sentCount = Number(prev.sent_count) || 0; firstSentAt = prev.first_sent_at;
        if (sentCount >= 3) return json({ ok: false, error: 'too_many_requests', message: '요청이 너무 잦아요. 1시간 후 다시 시도해 주세요.' }, 429);
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await hashPwd('pwreset|' + canonUid + '|' + code);
      await env.DB.prepare(
        `INSERT INTO student_pw_reset (user_id, code_hash, expires_at, attempts, sent_count, first_sent_at, created_at)
         VALUES (?,?,?,0,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_count=excluded.sent_count, first_sent_at=excluded.first_sent_at, created_at=excluded.created_at`
      ).bind(canonUid, codeHash, now + 10 * 60000, sentCount + 1, firstSentAt, now).run();
      const sms = await sendPlainSms(env as any, phone, `[망고아이] 비밀번호 재설정 인증번호는 [${code}] 입니다. 10분 안에 입력해 주세요.`);
      if (!sms || !sms.ok) return json({ ok: false, error: 'sms_failed', message: '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.' }, 502);
      const masked = phone.length > 4 ? phone.slice(0, 3) + '****' + phone.slice(-2) : '등록번호';
      return json({ ok: true, message: `${masked} 로 인증번호를 보냈어요. (10분 유효)`, masked_phone: masked });
    }
    if (method === 'POST' && path === '/api/student/password-reset/confirm') {
      await ensureLoginTable(); await ensurePwReset();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      const code = String(b.code || '').trim();
      const newPwd = String(b.new_password || '').trim();
      if (!uid || !code) return json({ ok: false, error: 'invalid_input', message: '아이디와 인증번호를 입력해 주세요.' }, 400);
      if (!newPwd || newPwd.length < 4) return json({ ok: false, error: 'weak_password', message: '새 비밀번호는 4자 이상이어야 합니다.' }, 400);
      const stu: any = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`).bind(uid).first();
      if (!stu) return json({ ok: false, error: 'user_not_found', message: '해당 아이디를 찾을 수 없습니다.' }, 404);
      const canonUid = String(stu.user_id);
      const row: any = await env.DB.prepare(`SELECT * FROM student_pw_reset WHERE user_id = ?`).bind(canonUid).first().catch(() => null);
      const now = Date.now();
      if (!row || !row.code_hash || now > Number(row.expires_at || 0)) {
        return json({ ok: false, error: 'code_expired', message: '인증번호가 만료됐어요. 다시 요청해 주세요.' }, 400);
      }
      if (Number(row.attempts || 0) >= 5) {
        return json({ ok: false, error: 'too_many_attempts', message: '시도 횟수를 초과했어요. 인증번호를 다시 요청해 주세요.' }, 429);
      }
      const codeHash = await hashPwd('pwreset|' + canonUid + '|' + code);
      if (codeHash !== row.code_hash) {
        try { await env.DB.prepare(`UPDATE student_pw_reset SET attempts = attempts + 1 WHERE user_id = ?`).bind(canonUid).run(); } catch {}
        return json({ ok: false, error: 'invalid_code', message: '인증번호가 일치하지 않아요.' }, 401);
      }
      const newHash = await hashPwd(newPwd);
      await env.DB.prepare(`UPDATE students_erp SET password_hash = ? WHERE user_id = ?`).bind(newHash, canonUid).run();
      try { await env.DB.prepare(`DELETE FROM student_pw_reset WHERE user_id = ?`).bind(canonUid).run(); } catch {}
      return json({ ok: true, message: '비밀번호가 변경됐어요. 새 비밀번호로 로그인해 주세요.' });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🔐 Phase LOGIN 끝
    // ═══════════════════════════════════════════════════════════════

    // ── 🔞 워드파이터 보호자 인증 (만 10세 이상 실사 좀비 격투 콘텐츠) — 2026-07-30 ──
    //   등록 보호자 연락처로 6자리 코드 발송 → 확인되면 students_erp.wf_verified_at 에 영구 기록(계정당 1회).
    //   GET  /api/student/wf-verify/status?user_id=X          → { ok, verified }
    //   POST /api/student/wf-verify/request  { user_id }       → 코드 발송(마스킹 응답)
    //   POST /api/student/wf-verify/confirm  { user_id, code } → 검증 후 wf_verified_at 기록
    //   안전장치: password-reset과 동일 — 코드 10분 유효 · 검증 5회 제한 · 요청 1시간 3회 제한 · 코드는 해시로만 저장
    const ensureWfVerify = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS wf_parent_verify (user_id TEXT PRIMARY KEY, code_hash TEXT, expires_at INTEGER, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, first_sent_at INTEGER, created_at INTEGER)`);
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN wf_verified_at INTEGER`); } catch {}
    };
    if (method === 'GET' && path === '/api/student/wf-verify/status') {
      await ensureWfVerify();
      const uid = String(url.searchParams.get('user_id') || '').trim();
      if (!uid) return json({ ok: false, error: 'user_id_required' }, 400);
      const stu: any = await env.DB.prepare(`SELECT wf_verified_at FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`).bind(uid).first().catch(() => null);
      return json({ ok: true, verified: !!(stu && stu.wf_verified_at) });
    }
    if (method === 'POST' && path === '/api/student/wf-verify/request') {
      await ensureWfVerify();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      if (!uid) return json({ ok: false, error: 'user_id_required', message: '아이디를 입력해 주세요.' }, 400);
      const stu: any = await env.DB.prepare(`SELECT * FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`).bind(uid).first();
      if (!stu) return json({ ok: false, error: 'user_not_found', message: '학생 정보를 찾을 수 없습니다. 학원에 문의해 주세요.' }, 404);
      const canonUid = String(stu.user_id);
      const phone = String(stu.parent_phone || stu.phone || '').replace(/[^0-9]/g, '');
      if (!phone || phone.length < 8) {
        return json({ ok: false, error: 'no_phone', message: '등록된 보호자 연락처가 없어요. 학원(카카오 채널)으로 문의해 주세요.' }, 400);
      }
      const now = Date.now();
      const prev: any = await env.DB.prepare(`SELECT * FROM wf_parent_verify WHERE user_id = ?`).bind(canonUid).first().catch(() => null);
      let sentCount = 0, firstSentAt = now;
      if (prev && prev.first_sent_at && now - prev.first_sent_at < 3600 * 1000) {
        sentCount = Number(prev.sent_count) || 0; firstSentAt = prev.first_sent_at;
        if (sentCount >= 3) return json({ ok: false, error: 'too_many_requests', message: '요청이 너무 잦아요. 1시간 후 다시 시도해 주세요.' }, 429);
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await hashPwd('wfverify|' + canonUid + '|' + code);
      await env.DB.prepare(
        `INSERT INTO wf_parent_verify (user_id, code_hash, expires_at, attempts, sent_count, first_sent_at, created_at)
         VALUES (?,?,?,0,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_count=excluded.sent_count, first_sent_at=excluded.first_sent_at, created_at=excluded.created_at`
      ).bind(canonUid, codeHash, now + 10 * 60000, sentCount + 1, firstSentAt, now).run();
      const sms = await sendPlainSms(env as any, phone, `[망고아이] '워드 파이터' 좀비 격투 콘텐츠는 만 10세 이상 이용가이며 보호자 확인이 필요합니다. 인증번호 [${code}] (10분 유효)`);
      if (!sms || !sms.ok) return json({ ok: false, error: 'sms_failed', message: '인증번호 발송에 실패했어요. 잠시 후 다시 시도해 주세요.' }, 502);
      const masked = phone.length > 4 ? phone.slice(0, 3) + '****' + phone.slice(-2) : '등록번호';
      return json({ ok: true, message: `${masked} 로 인증번호를 보냈어요. (10분 유효)`, masked_phone: masked });
    }
    if (method === 'POST' && path === '/api/student/wf-verify/confirm') {
      await ensureWfVerify();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      const code = String(b.code || '').trim();
      if (!uid || !code) return json({ ok: false, error: 'invalid_input', message: '아이디와 인증번호를 입력해 주세요.' }, 400);
      const stu: any = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE user_id = ? COLLATE NOCASE LIMIT 1`).bind(uid).first();
      if (!stu) return json({ ok: false, error: 'user_not_found', message: '해당 아이디를 찾을 수 없습니다.' }, 404);
      const canonUid = String(stu.user_id);
      const row: any = await env.DB.prepare(`SELECT * FROM wf_parent_verify WHERE user_id = ?`).bind(canonUid).first().catch(() => null);
      const now = Date.now();
      if (!row || !row.code_hash || now > Number(row.expires_at || 0)) {
        return json({ ok: false, error: 'code_expired', message: '인증번호가 만료됐어요. 다시 요청해 주세요.' }, 400);
      }
      if (Number(row.attempts || 0) >= 5) {
        return json({ ok: false, error: 'too_many_attempts', message: '시도 횟수를 초과했어요. 인증번호를 다시 요청해 주세요.' }, 429);
      }
      const codeHash = await hashPwd('wfverify|' + canonUid + '|' + code);
      if (codeHash !== row.code_hash) {
        try { await env.DB.prepare(`UPDATE wf_parent_verify SET attempts = attempts + 1 WHERE user_id = ?`).bind(canonUid).run(); } catch {}
        return json({ ok: false, error: 'invalid_code', message: '인증번호가 일치하지 않아요.' }, 401);
      }
      await env.DB.prepare(`UPDATE students_erp SET wf_verified_at = ? WHERE user_id = ?`).bind(now, canonUid).run();
      try { await env.DB.prepare(`DELETE FROM wf_parent_verify WHERE user_id = ?`).bind(canonUid).run(); } catch {}
      return json({ ok: true, verified: true, message: '보호자 인증이 완료됐어요.' });
    }

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

        /* 🔐 (2026-09-01) uid 서명 토큰(mango_token)을 여기서도 발급한다.
           [왜] 이 저장소의 학생 로그인은 **두 벌이 짝**이다 — 화면 표시용
             `mangoi_logged_user` 와, 서버가 «본인인지» 가리는 `mango_token`.
             그런데 이 콜백은 앞의 것만 저장하고 토큰을 안 줬다. 그러면 헤더에는
             로그인한 것처럼 보이는데 본인 확인이 필요한 API(포인트·단어장·판단력·동의 등)가
             전부 «남» 으로 판정한다 — 규칙서 2장 「로그인했는데 또 로그인하래요」와 같은 뿌리다.
           ⚠️ 2026-09-01 에 그 API 들의 소유자 게이트를 조였으므로(PR #581 — 포인트·단어장·판단력
             무인증 노출 차단) 이 구멍은 앞으로 더 아프게 드러난다.
           [잰 것 — 2026-09-01] `/api/oauth/status` 가 kakao·naver·google **전부 false**
             (클라이언트 ID 미등록) · D1 에 `oauth_users` 표가 **아직 없다** ·
             `students_erp` 의 social 접두 계정 52개(google 30·kakao 22)는 전부
             **카페24 센티넬**(created_at 1751500000000)이라 이 경로가 만든 것이 아니다.
           [거기서 내린 판단 — 측정 아님] 그러므로 지금 이 경로를 밟는 사람은 없고,
             클라이언트 ID 를 등록하는 순간 터지는 자리다. 등록 전에 막아 둔다.
           ⛔ 토큰 발급이 실패해도 로그인을 막지는 않는다 — 그 경우 예전과 똑같이
             «화면만 로그인» 상태가 되지만, 여기서 던지면 로그인 자체가 통째로 깨진다. */
        let _oauthToken = '';
        try {
          const _sid = await startSession(userId, env as any);
          _oauthToken = await signUidToken(userId, env as any, undefined, _sid);
        } catch (e: any) {
          console.error('[oauth] 토큰 발급 실패(로그인은 계속):', e?.message);
        }

        // 클라이언트로 결과 전달 + localStorage 자동 저장
        /* 🔐 이 JSON 은 아래 <script> 안에 그대로 박힌다. 이름·이메일은 **프로바이더가 준 값**이라
           우리가 못 믿는다 — JSON.stringify 는 «작다» 기호를 안 막으므로 이름에
           «스크립트 종료 태그» 를 넣으면 그 자리에서 탈출해 남의 코드가 돈다(실측 확인).
           위에서 토큰을 이 페이지에 싣기 시작했으니 그 구멍은 이제 **토큰 탈취** 통로가 된다.
           ⟹ 여는 꺾쇠를 유니코드로 바꾼다. JSON 값은 그대로 살아난다(파싱 결과 동일). */
        const userPayload = JSON.stringify({ user_id: userId, user_name: name, role: 'student', email, profile_image: profileImage, provider, token: _oauthToken })
          .replace(/</g, '\\u003c');
        /* 🔐 (2026-09-01) 이 페이지에는 이제 **토큰이 실린다.** 그러니 프로바이더가 준 값이
           HTML 로 들어가는 자리를 **하나도 빠짐없이** 막아야 한다.
           ⚠️ 처음엔 아래 payload 한 곳만 막았는데, 그 위 <p> 의 이름은 그대로였다.
              그 <p> 는 <script> «위» 라 파싱 중 먼저 도므로, 이름에 스크립트 종료 태그를 넣으면
              그 자리에서 localStorage 의 토큰을 그대로 읽어 갈 수 있었다(trap-check 실측).
              sink 가 둘이면 한 곳만 막는 것은 «안 막은 것» 이다. */
        const esc = (v: any) => String(v ?? '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>로그인 완료</title></head><body style="margin:0;font-family:'Noto Sans KR',sans-serif;background:#0a1530;color:#e6ecff;display:flex;align-items:center;justify-content:center;min-height:100vh">
          <div style="text-align:center;padding:32px">
            <div style="font-size:48px;margin-bottom:12px">✅</div>
            <h2 style="color:#fbbf24;margin-bottom:8px">${esc(provider).toUpperCase()} 로그인 완료</h2>
            <p style="color:#a3b3d1;margin-bottom:18px">${name ? esc(name) + '님 환영합니다!' : '잠시만 기다려주세요...'}</p>
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
              // 🔐 본인 확인용 토큰 — 이게 없으면 «화면만 로그인» 이 된다(위 주석 참고)
              if (u.token) localStorage.setItem('mango_token', u.token);
              else localStorage.removeItem('mango_token');   // 남의 옛 토큰이 남아 있으면 더 나쁘다
            } catch(e){}
            setTimeout(() => { location.href = '/'; }, 1500);
          </script>
          </body></html>`;
        /* ⚠️ 본문에 30일짜리 토큰이 들어 있다 — 공유 캐시에 한 사람 응답이 남으면
           **다른 사람에게 그대로 나간다.** 지금 CF 기본값은 /api/ 를 캐시하지 않지만,
           누가 «Cache Everything» 규칙을 걸면 그날로 사고가 된다. */
        return new Response(html, { headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store, max-age=0',
        } });
      } catch (err: any) {
        /* ⚠️ 이 문자열도 프로바이더 응답에서 온다(no_access_token 에 응답 본문이 붙는다).
           큰따옴표만 지우면 «작다» 기호로 그대로 탈출한다 — 위와 같은 전제를 여기도 적용한다.
           ⛔ 사유를 화면에 그대로 뿌리지 않는다: 자세한 것은 로그로 보내고 사람에게는 짧게 알린다. */
        console.error('[oauth] 콜백 실패:', provider, err?.message);
        const safeMsg = String(err?.message || 'unknown').replace(/[^\w .:_-]/g, '').slice(0, 80);
        return new Response(
          `<!doctype html><html><head><meta charset="utf-8"></head><body><script>` +
          `alert("OAuth 실패: ${safeMsg}");location.href="/";</script></body></html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
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

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}

/* ═══════════════════════════════════════════════════════════════════
 * 📅 학부모 주간 리포트 — 모듈 함수 (핸들러·크론 공용)
 *   경쟁사(스픽·캠블리 등)가 학부모에게 못 보여주는 것을 담는다:
 *   AI 친구 대화량 · 판단력 성장 · 정복한 단어 · 연속출석. 재등록의 핵심 무기.
 *   학생향 문구는 항상 희망·동기부여 톤(사장님 상시 지시).
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * 🛡 중복 발송 방지(멱등) — 최근 windowDays(기본 6일) 내 이 학생에게 'sent' 로그가 있으면 true.
 *   왜: Cloudflare 크론은 at-least-once(금요일 스윕이 드물게 2회 실행 가능)이고, 같은 날
 *       관리자가 send-all 을 수동으로도 누르면 크론분+수동분이 겹친다 → 학부모 문자 2통.
 *   6일 창: 주1회 발송이므로 지난주분(7일 전)은 안 걸리고, 같은 주 재실행만 막는다.
 *   실패 시 false 반환(발송을 막지 않음 — 안전보다 '한 번은 간다'를 우선, 로그 조회 실패로 전면 중단 방지).
 */
export async function digestSentRecently(env: any, uid: string, windowDays = 6): Promise<boolean> {
  try {
    const since = Date.now() - windowDays * 86400 * 1000;
    const row: any = await env.DB.prepare(
      `SELECT 1 FROM digest_logs WHERE student_uid = ? AND status = 'sent' AND sent_at >= ? LIMIT 1`
    ).bind(uid, since).first();
    return !!row;
  } catch { return false; }
}

export async function buildWeeklyParentDigest(env: any, uid: string): Promise<any> {
  const endTs = Date.now();
  const startTs = endTs - 7 * 86400 * 1000;
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT);`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, joined_at INTEGER, date TEXT);`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, lesson_date TEXT, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, created_at INTEGER NOT NULL);`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, created_at INTEGER NOT NULL);`);
  } catch {}

  const q1 = async (sql: string, ...binds: any[]) => { try { return await env.DB.prepare(sql).bind(...binds).first(); } catch { return null; } };

  const student: any = await q1(`SELECT user_id, student_name, parent_name, parent_phone FROM students_erp WHERE user_id = ?`, uid);
  const att: any = await q1(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ? AND COALESCE(status,'') <> 'scheduled'`, uid, startTs, endTs);
  const evals: any = await q1(`SELECT AVG(score_overall) AS avg, COUNT(*) AS n, GROUP_CONCAT(next_goals,'|') AS goals FROM student_evaluations WHERE student_uid = ? AND created_at >= ? AND created_at < ?`, uid, startTs, endTs);
  const voice: any = await q1(`SELECT COUNT(*) AS n, AVG(accuracy_score) AS acc FROM voice_coaching WHERE student_uid = ? AND created_at >= ? AND created_at < ?`, uid, startTs, endTs);
  // 🥭 차별 지표 (테이블 미존재 방어 = 조용히 0)
  const aiChat: any = await q1(`SELECT COUNT(*) AS n FROM ai_friend_chats WHERE student_uid = ? AND role = 'user' AND created_at >= ? AND created_at < ?`, uid, startTs, endTs);
  const judg: any = await q1(`SELECT COUNT(*) AS n, AVG((COALESCE(choice_score,0)+COALESCE(reasoning_score,0))/2.0) AS avg FROM judgment_analysis WHERE student_uid = ? AND created_at >= ? AND created_at < ?`, uid, startTs, endTs);
  const conquered: any = await q1(`SELECT COUNT(*) AS n FROM game_progress WHERE user_id = ? AND correct_count > wrong_count AND updated_at >= ? AND updated_at < ?`, uid, startTs, endTs);
  const streak: any = await q1(`SELECT current_streak FROM student_streaks WHERE student_uid = ?`, uid);

  const days = att?.d || 0;
  const streakN = streak?.current_streak || 0;
  const avgScore = evals?.avg ? Math.round(evals.avg * 10) / 10 : 0;
  const evalCount = evals?.n || 0;
  const aiChatN = aiChat?.n || 0;
  const judgN = judg?.n || 0;
  const judgAvg = judg?.avg ? Math.round(judg.avg) : 0;
  const conqueredN = conquered?.n || 0;
  const voiceCount = voice?.n || 0;
  const voiceAcc = voice?.acc ? Math.round(voice.acc) : 0;
  const nextGoals = (evals?.goals || '').split('|').filter((g: string) => g && g.trim()).slice(0, 2).join(' · ') || '꾸준한 학습 이어가기';

  const studentName = student?.student_name || uid;
  const parentName = student?.parent_name || '학부모님';
  const parentPhone = student?.parent_phone || '';

  let highlight = '이번 주도 꾸준히 함께했어요';
  if (aiChatN >= 20) highlight = `AI 친구와 영어로 ${aiChatN}번이나 대화했어요! 입이 트이는 중이에요`;
  else if (conqueredN >= 5) highlight = `이번 주에 새 단어 ${conqueredN}개를 완전히 내 것으로 만들었어요`;
  else if (streakN >= 5) highlight = `${streakN}일 연속 출석 중! 습관이 잡혀가고 있어요`;
  else if (judgN >= 3) highlight = `AI 판단력 훈련으로 스스로 생각하는 힘을 키우고 있어요`;
  else if (days >= 3) highlight = `이번 주 ${days}번 수업, 성실하게 참여했어요`;

  const lines = [`🥭 ${studentName} 학생 주간 학습 리포트`, '━━━━━━━━━━━━━━'];
  lines.push(`📅 출석 ${days}일/7일${streakN >= 2 ? ` · 🔥${streakN}일 연속` : ''}`);
  if (evalCount) lines.push(`⭐ 수업 평점 ${avgScore} (${evalCount}회)`);
  if (aiChatN) lines.push(`🤖 AI 친구와 영어 대화 ${aiChatN}회`);
  if (conqueredN) lines.push(`📚 정복한 단어 ${conqueredN}개`);
  if (judgN) lines.push(`🧠 판단력 훈련 ${judgN}회${judgAvg ? ` (평균 ${judgAvg}점)` : ''}`);
  if (voiceCount) lines.push(`🎤 발음 코칭 ${voiceCount}회${voiceAcc ? ` (정확도 ${voiceAcc}%)` : ''}`);
  lines.push('━━━━━━━━━━━━━━');
  lines.push(`🌟 ${highlight}`);
  lines.push(`🎯 다음 목표: ${nextGoals}`);
  lines.push('망고아이와 함께 성장 중입니다 🌱');

  return {
    uid, student_name: studentName, parent_name: parentName, parent_phone: parentPhone,
    days, streak: streakN, avg_score: avgScore, eval_count: evalCount,
    ai_chat: aiChatN, conquered: conqueredN, judgment_count: judgN, judgment_avg: judgAvg,
    voice_count: voiceCount, voice_acc: voiceAcc,
    highlight, next_goals: nextGoals, message: lines.join('\n'),
  };
}

/**
 * 주간 다이제스트 일괄 처리 (금요일 KST 19:00 크론).
 *   ⚠️ 대량 대외 발송 → KV `digest:send_all_live` 가 '1' 일 때만 실제 SMS 발송.
 *   기본은 dry(대상 집계만) — 알림톡 템플릿 승인·사장님 결정 전까지 안전.
 */
export async function runWeeklyParentDigestSweep(env: any): Promise<any> {
  const out: any = { ok: true, live: false, eligible: 0, sent: 0, failed: 0, at: Date.now() };
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT);`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
    let liveOn = false;
    try { liveOn = (await env.SESSION_STATE.get('digest:send_all_live')) === '1'; } catch {}
    out.live = liveOn;
    const rs = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE parent_phone IS NOT NULL AND parent_phone != '' LIMIT 5000`).all();
    const list = (rs.results || []) as any[];
    const now = Date.now();
    for (const r of list) {
      try {
        const d = await buildWeeklyParentDigest(env, r.user_id);
        const phone = String(d.parent_phone || '').replace(/[^0-9]/g, '');
        if (phone.length < 10) continue;
        out.eligible++;
        if (!liveOn) continue;   // dry: 집계만
        // 🛡 멱등: 이번 주 이미 발송했으면 skip(크론 2회 실행·수동 send-all 겹침 → 중복문자 방지)
        if (await digestSentRecently(env, r.user_id)) { out.skipped = (out.skipped || 0) + 1; continue; }
        let status = 'fail';
        try { const sr = await sendPlainSms(env, phone, d.message); status = sr?.ok ? 'sent' : ('fail:' + (sr?.error || 'sms')); }
        catch (e: any) { status = 'fail:' + String(e?.message || e).slice(0, 30); }
        await env.DB.prepare(`INSERT INTO digest_logs (student_uid, parent_phone, message, sent_at, status) VALUES (?,?,?,?,?)`).bind(r.user_id, phone, d.message, now, status).run();
        if (status === 'sent') out.sent++; else out.failed++;
      } catch { out.failed++; }
    }
  } catch (e: any) { out.ok = false; out.error = String((e as any)?.message || e); }
  return out;
}
