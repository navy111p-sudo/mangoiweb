/** student-analysis: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { WEAK_WHERE, WEAK_ORDER, weakSince } from './weak-words';
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { checkAdminSession } from './auth-admin';
import { cleanAnalysis, cleanScore, foreignFields, parseAnalysisJson, recoverNextAction, KOREAN_ONLY_RETRY_NOTE, SUMMARY_UNAVAILABLE } from './ai-analysis-clean';
import { ATTENDANCE_BY_UID, attUidBinds, ensureAttendanceAccountUid } from './attendance-uid';

export async function handleAdminStudentAnalysisApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ═══════════════════════════════════════════════════════════════
    // 💰 Phase F1~F2 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase A1~A2 — AI 학습 분석 (Workers AI / Llama 3.3 70B)
    // ═══════════════════════════════════════════════════════════════

    const ensureAiAnalysisTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_student_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, summary TEXT, strengths TEXT, weaknesses TEXT, recommendations TEXT, risk_level TEXT, raw_response TEXT, model TEXT, generated_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_ai_an_student ON ai_student_analysis(student_uid, generated_at DESC)`); } catch {}
      // 🧹 2026-09-23 — next_action 칸(없던 칸). 멱등: 이미 있으면 duplicate column 으로 조용히 넘어감
      try { await env.DB.exec(`ALTER TABLE ai_student_analysis ADD COLUMN next_action TEXT`); } catch {}
    };

    // ── POST /api/admin/ai-analyze/student — 학생 1명 AI 학습 분석 ──
    //   body: { student_uid, student_name?, force_refresh? }
    //   캐시: 12시간 이내 분석은 재사용 (Workers AI 호출 비용 절약)
    if (method === 'POST' && path === '/api/admin/ai-analyze/student') {
      await ensureAiAnalysisTable();
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.student_uid || '').trim();
      if (!uid) return json({ ok: false, error: 'student_uid_required' }, 400);
      // 🔐 [PII] 관리자(세션) 또는 본인/학부모(토큰 uid 일치) 만 자녀 AI 분석 조회
      const aaAuth = await authUidGlobal(request, url, env, body);
      const aaAdmin = await checkAdminSession(request, env as any);
      if (!aaAdmin.ok && (!aaAuth || aaAuth !== uid)) {
        return json({ ok: false, error: 'auth_required', message: '자녀 계정으로 로그인해주세요.' }, 401);
      }

      // 1) 캐시 확인 (12시간)
      if (!body.force_refresh) {
        const cached: any = await env.DB.prepare(
          `SELECT * FROM ai_student_analysis WHERE student_uid = ? ORDER BY generated_at DESC LIMIT 1`
        ).bind(uid).first();
        if (cached && (Date.now() - cached.generated_at) < 12 * 3600 * 1000) {
          // 🧹 저장본도 거릅니다 — 수리 «전» 에 저장된 것에 한자·베트남어가 남아 있을 수 있고,
          //    next_action 칸이 없던 옛 저장본은 raw_response 에서 되살립니다.
          //    ⚠️ 요약까지 걸러졌으면 저장본을 버리고 새로 만듭니다 — 안 그러면 12시간 동안 「다시 눌러 주세요」만 나옵니다.
          const cc = cleanAnalysis({ ...cached, next_action: recoverNextAction(cached) });
          if (!cc.summary_dropped) {
            const { dropped: _ccD, summary_dropped: _ccS, ...ccVals } = cc;
            return json({ ok: true, cached: true, analysis: { ...cached, ...ccVals } });
          }
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
      // 출석 (최근 60일) — 🧹 2026-09-23: 포인트 로그(point_rule_log)가 아니라 실제 수업 기록(attendance)의
      //   «수업한 날 수» 로 셉니다. 포인트 로그는 출석 포인트가 적립된 날만 남아 수업을 해도 「출석이 낮다」로 읽혔습니다.
      //   ⚠️ 미래 시각은 뺍니다 — 카페24 가 예약을 attendance 에 미리 만들어 둡니다(joined_at = 예약 시각).
      //   ⚠️ 조회가 실패하면 0 이 아니라 null(«모름») — 0 으로 두면 AI 가 「출석이 낮다」고 지어냅니다.
      let attendanceDays: number | null = null;
      try {
        await ensureAttendanceAccountUid(env);
        const ar: any = await env.DB.prepare(
          `SELECT COUNT(DISTINCT date) AS n FROM attendance
            WHERE ${ATTENDANCE_BY_UID} AND joined_at >= ? AND joined_at <= ? AND COALESCE(status,'') <> 'scheduled'`
        ).bind(...attUidBinds(uid), since, Date.now()).first();
        if (ar && ar.n != null && Number.isFinite(Number(ar.n))) attendanceDays = Number(ar.n);
      } catch { attendanceDays = null; }
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
      // 🎯 게임 학습기록 (피드백 루프 연결): 정오답 합계 + 취약 단어 상위 5 + 게임 내 발음 평균
      const gameAgg: any = await fetch1(
        `SELECT SUM(correct_count) AS c, SUM(wrong_count) AS w,
                AVG(CASE WHEN pron_count > 0 THEN pron_last END) AS p
           FROM game_progress WHERE user_id = ? AND last_seen >= ?`, uid, since);
      const gameWeak = await fetchAll(
        `SELECT item, ko, wrong_count FROM game_progress
          WHERE user_id = ? AND ${WEAK_WHERE}
          ORDER BY ${WEAK_ORDER} LIMIT 5`, uid, weakSince(Date.now()));  // 정본 src/weak-words.ts
      // 🎤 스피치코치 발음/정확도/유창성 평균 (최근 10회)
      const coachAgg: any = await fetch1(
        `SELECT COUNT(*) AS n, AVG(pronunciation_score) AS p, AVG(accuracy_score) AS a, AVG(fluency_score) AS f FROM (
           SELECT pronunciation_score, accuracy_score, fluency_score FROM voice_coaching
           WHERE student_uid = ? ORDER BY created_at DESC LIMIT 10)`, uid);

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
- 수업 기록이 있는 날(최근 60일, 카페24 예약 포함 — 결석 여부는 알 수 없음): ${attendanceDays == null ? '(확인 못 함 — 출석에 대해 판단하지 마세요)' : attendanceDays + '일'}
- 채팅 메시지: ${chatStats?.msg_count || 0}개
- 포인트 적립: ${pointStats?.earned || 0}P / 사용: ${pointStats?.spent || 0}P

[학습 게임 기록 (최근 60일)]
- 문제 풀이: 정답 ${gameAgg?.c || 0} / 오답 ${gameAgg?.w || 0}${(Number(gameAgg?.c || 0) + Number(gameAgg?.w || 0)) > 0 ? ` (정답률 ${Math.round(Number(gameAgg.c || 0) / (Number(gameAgg.c || 0) + Number(gameAgg.w || 0)) * 100)}%)` : ''}
- 게임 내 발음 점수 평균: ${gameAgg?.p != null ? Math.round(Number(gameAgg.p)) + '/100' : '-'}
- 자주 틀리는 단어: ${gameWeak.length ? gameWeak.map((g: any) => `${g.item}${g.ko ? `(${g.ko})` : ''} ${g.wrong_count}회` ).join(', ') : '(없음)'}

[스피치코치 발음 연습 (최근 10회)]
${Number(coachAgg?.n || 0) > 0 ? `- 연습 ${coachAgg.n}회 · 발음 ${coachAgg.p != null ? Math.round(Number(coachAgg.p)) : '-'}/100 · 정확도 ${coachAgg.a != null ? Math.round(Number(coachAgg.a)) : '-'}/100 · 유창성 ${coachAgg.f != null ? Math.round(Number(coachAgg.f)) : '-'}/100` : '(연습 기록 없음)'}

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

      let model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
      const runAnalysis = async (retryNote: string): Promise<string> => {
        const aiResult: any = await env.AI.run(model, {
          messages: [
            { role: 'system', content: '당신은 한국 영어 학원의 학습 분석 AI 입니다. 항상 JSON 형식으로만 응답하세요. 모든 값은 순수 한국어(한글)로 쓰고 한자·베트남어·일본어를 섞지 마세요.' + (retryNote ? '\n' + retryNote : '') },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1500,
        });
        // 응답을 안전하게 문자열로 정규화
        let t: string;
        if (typeof aiResult === 'string') t = aiResult;
        else if (aiResult && typeof aiResult.response === 'string') t = aiResult.response;
        else if (aiResult && aiResult.response) t = JSON.stringify(aiResult.response);
        else t = JSON.stringify(aiResult || {});
        return String(t || '');
      };
      let aiResponse: string = '';
      try {
        aiResponse = await runAnalysis('');
      } catch (e: any) {
        return json({ ok: false, error: 'ai_call_failed', detail: String(e?.message || e) }, 500);
      }
      // 🧹 한자·베트남어가 섞였으면 한 번만 다시 만듭니다(지시만으로는 안 지켜짐). 거른 뒤 «더 많이 남는» 답만 채택.
      {
        const p1 = parseAnalysisJson(aiResponse);
        if (foreignFields(p1).length) {
          try {
            const second = await runAnalysis(KOREAN_ONLY_RETRY_NOTE);
            const p2 = parseAnalysisJson(second);
            if (p2 && cleanScore(p2) > cleanScore(p1)) aiResponse = second;   // 거른 뒤 «더 많이 남는» 쪽
          } catch (e: any) {
            console.warn('[ai-analyze] 한국어 재시도 실패 — 첫 답을 거르고 씁니다:', String(e?.message || e));
          }
        }
      }

      // 5) JSON 파싱
      let parsed: any = null;
      try {
        const m = aiResponse.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch (e: any) {
        console.warn('[ai-analyze] JSON parse fail:', e?.message, aiResponse.slice(0, 300));
      }

      // 🧹 그래도 섞인 항목은 «통째로» 뺍니다(잘라 내면 말이 안 되는 문장이 남습니다)
      const cl = cleanAnalysis(parsed);
      if (cl.dropped.length) console.warn('[ai-analyze] 한국어 아닌 글자로 뺀 칸:', cl.dropped.join(','), uid);
      const analysis = {
        student_uid: uid,
        student_name: studentName,
        summary: !parsed ? '(AI 응답 파싱 실패 - raw 참고)' : (cl.summary_dropped ? SUMMARY_UNAVAILABLE : (cl.summary || '(AI 응답 파싱 실패 - raw 참고)')),
        strengths: cl.strengths,
        weaknesses: cl.weaknesses,
        recommendations: cl.recommendations,
        risk_level: parsed?.risk_level || 'unknown',
        next_action: cl.next_action,
        raw_response: aiResponse.slice(0, 4000),
        model,
        generated_at: Date.now(),
        data_sources: {
          eval_count: evalStats?.n || 0,
          attendance_count: attendanceDays,
          chat_messages: chatStats?.msg_count || 0,
          point_earned: pointStats?.earned || 0,
          game_correct: gameAgg?.c || 0,
          game_wrong: gameAgg?.w || 0,
          voice_coach_count: coachAgg?.n || 0,
        }
      };

      // 6) D1 저장 (히스토리 관리)
      //   🧹 summary 를 못 살렸으면 저장하지 않습니다 — 저장하면 12시간 동안 그 안내문이 캐시로 나갑니다.
      if (!cl.summary_dropped) {
        try {
          await env.DB.prepare(
            `INSERT INTO ai_student_analysis (student_uid, student_name, summary, strengths, weaknesses, recommendations, risk_level, next_action, raw_response, model, generated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            uid, studentName, analysis.summary, analysis.strengths, analysis.weaknesses,
            analysis.recommendations, analysis.risk_level, analysis.next_action, analysis.raw_response, model, analysis.generated_at
          ).run();
        } catch (e: any) {
          // next_action 칸을 못 만든 환경 — 그 칸 없이라도 적습니다(옛 저장본처럼 raw_response 에서 되살아납니다)
          console.warn('[ai-analyze] next_action 칸 없이 저장:', String(e?.message || e));
          await env.DB.prepare(
            `INSERT INTO ai_student_analysis (student_uid, student_name, summary, strengths, weaknesses, recommendations, risk_level, raw_response, model, generated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
          ).bind(
            uid, studentName, analysis.summary, analysis.strengths, analysis.weaknesses,
            analysis.recommendations, analysis.risk_level, analysis.raw_response, model, analysis.generated_at
          ).run();
        }
      }

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
  return null;
}
