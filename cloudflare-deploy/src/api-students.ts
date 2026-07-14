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
import { authUidFromRequest as authUidGlobal, signUidToken } from './auth-token';  // 🔐 소유자 검증(IDOR 방지)+토큰 발급
import { checkAdminSession } from './auth-admin';
import type { MangoEnv } from './api-mango';

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
      const childUid = (url.searchParams.get('child_uid') || '').trim();
      if (!childUid) return json({ ok: false, error: 'child_uid_required' }, 400);

      // 안전 테이블 생성
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT, program TEXT, status TEXT, created_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, updated_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, amount INTEGER NOT NULL, type TEXT, reason TEXT, balance_after INTEGER, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_name TEXT, lesson_date TEXT, score_overall INTEGER, score_speaking INTEGER, score_listening INTEGER, score_grammar INTEGER, score_vocab INTEGER, score_attitude INTEGER, strengths TEXT, weaknesses TEXT, next_goal TEXT, teacher_comment TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER, source TEXT, occurred_at INTEGER NOT NULL);`);

      // 자녀 기본정보 (password_hash 포함 — 본인확인용, 응답에는 제외)
      const student = await env.DB.prepare(`SELECT user_id, student_name, parent_name, parent_phone, program, status, created_at, password_hash FROM students_erp WHERE user_id = ?`).bind(childUid).first<any>();
      if (!student) return json({ ok: false, error: 'user_not_found', message: '학생 정보를 찾을 수 없습니다.' }, 404);

      // 🔐 [PII] 학부모 본인 확인 — 자녀 계정 '비밀번호 로그인 토큰'이 있어야 열람 가능.
      //   ① 토큰(mango_token)의 uid 가 자녀 uid 와 일치해야 함(남의 자녀 차단)
      //   ② 비밀번호 미설정 계정은 차단 → parent.html 이 "비밀번호 설정(잠그기)"을 유도.
      //   (전화·이름 데이터가 D1 에 없어 비밀번호가 유일한 본인확인 수단)
      const _authUid = await authUidGlobal(request, url, env);
      if (!_authUid || _authUid !== childUid) {
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
      // 🔐 [PII] 본인(학부모 토큰) 또는 관리자만 자녀 목록 조회 — 남의 자녀 열람 차단
      const mcAdmin = await checkAdminSession(request, env as any);
      const mcAuth = await authUidGlobal(request, url, env);
      if (!mcAdmin.ok && mcAuth !== pUid) return json({ ok: false, error: 'auth_required' }, 401);
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
      if (!pwd || pwd.length < 6) return json({ ok: false, error: 'weak_password', message: '비밀번호는 6자 이상이어야 합니다.' }, 400);
      if (!name) return json({ ok: false, error: 'name_required', message: '학생 이름을 입력해 주세요.' }, 400);
      // 중복 아이디 차단
      const exists: any = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE user_id = ?`).bind(uid).first();
      if (exists) return json({ ok: false, error: 'exists', message: '이미 사용 중인 아이디입니다.' }, 409);
      const now = Date.now();
      const ph = await hashPwd(pwd);
      await env.DB.prepare(
        `INSERT INTO students_erp (user_id, student_name, parent_phone, phone, email, age, status, source, password_hash, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, 'active', 'self_signup', ?, ?, ?)`
      ).bind(uid, name, phone || null, phone || null, email || null, age || null, ph, now, now).run();
      return json({
        ok: true,
        token: await signUidToken(uid, env),
        user: { user_id: uid, user_name: name, role: 'student', has_password: true },
      });
    }

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
        // 🔐 uid 서명 토큰 — uid 기반 개인 데이터 API(/api/ai/chat-* 등) 호출 시 필요
        token: await signUidToken(uid, env),
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

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
