// ═══════════════════════════════════════════════════════════════════════
// 📝 api-lessons.ts — 수업 산출물 도메인: 평가서·숙제 (api-mango.ts 에서 분리)
//   REFACTOR_PLAN 1단계 · 12차(2026-07-14) · 로직 무변경
//   포함: Phase HW(숙제 출제·제출) + Phase E1~E4(학생 평가서) + Phase BE(일괄 평가서)
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { checkAdminSession } from './auth-admin';
import { sendPushToUser } from './api-notify';
import type { MangoEnv } from './api-mango';

export async function handleLessonsApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

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
      if (body.student_uid) pushResults.push({ role: 'student', ...(await sendPushToUser(env, body.student_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      if (body.parent_uid) pushResults.push({ role: 'parent', ...(await sendPushToUser(env, body.parent_uid, pushTitle, pushBody, pushUrl, pushTag)) });
      // 🎮 배지는 parent.html / mypage 에서 페이지 로드 시 /api/badges/check 호출로 자동 갱신
      return json({ ok: true, id: evalId, overall, notify: notifyResult, push: pushResults });
    }

    // ── GET /api/eval/list?uid=X&role=student|parent|teacher — 평가서 목록 ──
    if (method === 'GET' && path === '/api/eval/list') {
      await ensureEvalTable();
      const uid = (url.searchParams.get('uid') || '').trim();
      const role = (url.searchParams.get('role') || 'student').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [PII] 본인 평가만 — 토큰 uid 일치 요구(남의 평가서 목록 열람 차단, IDOR).
      //   학부모는 password 보호된 /api/parent/dashboard 로 평가를 봄(이 경로는 본인 토큰 필요).
      const evAuthUid = await authUidGlobal(request, url, env);
      if (!evAuthUid || evAuthUid !== uid) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 평가만 조회할 수 있습니다.' }, 401);
      }
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
      // 🔐 [PII] 본인 평가 또는 관리자만 — 평가서(교사코멘트·신원) 정수 id 열거 IDOR 차단
      const eidAuth = await authUidGlobal(request, url, env);
      if (eidAuth !== String(row.student_uid || '')) {
        const eidAdmin = await checkAdminSession(request, env as any);
        if (!eidAdmin.ok) return json({ ok: false, error: 'auth_required' }, 401);
      }
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

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
