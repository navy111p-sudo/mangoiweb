/** feedback-drafts: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { createLessonFeeCalculator } from './admin-lesson-fees';
import { json } from './api-util';
import { praiseCountForRoom } from './point-policy';
import { selectInChunks } from './d1-chunk';
import { sendPlainSms } from './solapi-client';
import { getAdminActor, sameTeacherName } from './auth-admin';

export async function handleAdminFeedbackDraftsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  const { computeLessonFeeMonth } = createLessonFeeCalculator(env);


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
  return null;
}
