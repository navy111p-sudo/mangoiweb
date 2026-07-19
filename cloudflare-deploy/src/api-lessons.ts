// ═══════════════════════════════════════════════════════════════════════
// 📝 api-lessons.ts — 수업 산출물 도메인: 평가서·숙제 (api-mango.ts 에서 분리)
//   REFACTOR_PLAN 1단계 · 12차(2026-07-14) · 로직 무변경
//   포함: Phase HW(숙제) + E1~E4(평가서) + BE(일괄평가) + CAL(캘린더·공휴일, 13차)
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { checkAdminSession } from './auth-admin';
import { runCypher } from './teacher-match';
import { studentScopeWhere } from './scope';
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
      // 🔐 [무결성/파괴] 관리자·강사(관리자 세션 쿠키)만 삭제 — 무인증 임의 삭제(정수 id 열거로 전체 평가서 삭제) 차단.
      //   (2026-07-19 self-pentest 발견: 바로 위 GET 은 인증됐으나 DELETE 는 게이트 누락돼 있었음)
      //   호출부 adm-r6.js 는 관리자 콘솔(same-origin)이라 세션 쿠키가 자동 전송됨.
      const edAdmin = await checkAdminSession(request, env as any);
      if (!edAdmin.ok) return json({ ok: false, error: 'auth_required', message: '관리자만 삭제할 수 있습니다.' }, 401);
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

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
