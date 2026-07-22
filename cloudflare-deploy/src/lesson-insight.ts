/**
 * 🎥 lesson-insight.ts — 수업이 끝나면 AI가 그 수업을 되짚어 학생별 리포트를 만든다
 *
 * 왜 별도 모듈인가
 *   수업 자체는 절대 끊기면 안 된다. 그래서 이 기능은 수업 통신 경로(WS/DO)와 완전히 분리된
 *   "끝난 수업만 뒤늦게 훑는" 배치로만 동작한다. 여기서 무슨 일이 나도 진행 중인 수업엔 영향이 없다.
 *
 * 무엇을 보고 평가하나 (이미 수집되고 있던 신호를 합친다)
 *   ① 집중도   attendance.gaze_score   — mango-gaze.js 가 얼굴 방향으로 낸 정면 응시 비율
 *   ② 발화량   attendance.total_active_ms / total_session_ms — 마이크 음량 기준 말한 시간
 *   ③ 끊김     attendance.disconnect_count
 *   ④ 영어 사용 chat_messages — 학생이 공개 채팅에 직접 친 영어 문장
 *   ⑤ (선택) transcript — 외부에서 STT 결과를 넣어주면 ④ 대신 사용 (2단계 음성 STT 대비)
 *
 * ⚠️ 지금 단계에서 하지 않는 것
 *   - 표정·감정 인식 (하지 않음)
 *   - 수업 중 실시간 음성 받아쓰기 (녹화가 webm 영상이라 Whisper 25MB 제한을 넘김 → 2단계)
 *   즉 "무슨 말을 했는지"의 근거는 현재 채팅 글이며, 음성은 '얼마나 말했는지'까지만 본다.
 *   이 한계는 리포트의 material_source 필드에 그대로 남겨 사람이 오해하지 않게 한다.
 *
 * 한/영 두 벌
 *   강사 다수가 필리핀·외국인이다. 라벨만 영어고 근거 문장이 한국어로 남으면 못 읽는다.
 *   그래서 요약·강점·약점·다음목표·근거를 전부 ko/en 두 벌로 저장한다.
 *
 * 킬스위치
 *   KV SESSION_STATE 에 'insight:off' 키를 넣으면 배치가 즉시 멈춘다.
 */

interface InsightEnv {
  DB: D1Database;
  AI?: any;
  SESSION_STATE?: KVNamespace;
}

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

// ── 스키마 (idempotent) ────────────────────────────────────────────────
let _schemaReady = false;
async function ensureSchema(env: InsightEnv) {
  if (_schemaReady) return;
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS lesson_insights (` +
      `id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, ` +
      `teacher_uid TEXT, teacher_name TEXT, lesson_date TEXT, ` +
      `session_ms INTEGER, active_ms INTEGER, talk_ratio REAL, gaze_score REAL, disconnect_count INTEGER, ` +
      `participation_score REAL, chat_lines INTEGER, chat_words INTEGER, material_source TEXT, ` +
      `overall_score INTEGER, summary_ko TEXT, summary_en TEXT, ` +
      `strengths_ko TEXT, strengths_en TEXT, weaknesses_ko TEXT, weaknesses_en TEXT, ` +
      `next_goals_ko TEXT, next_goals_en TEXT, corrections TEXT, evidence TEXT, ` +
      `status TEXT DEFAULT 'auto', reviewed_by TEXT, reviewed_at INTEGER, ` +
      // 같은 수업·같은 학생은 한 건만. UPSERT 의 충돌 기준이므로 테이블 정의에 직접 넣는다
      // (나중에 인덱스만 따로 만들면, 그 생성이 실패했을 때 ON CONFLICT 가 통째로 에러난다).
      `created_at INTEGER NOT NULL, updated_at INTEGER, UNIQUE(room_id, student_uid));`
  );
  try {
    await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_lesson_insights_student ON lesson_insights(student_uid, created_at DESC)`);
  } catch { /* 무시 */ }
  _schemaReady = true;
}

// ── 참여 점수 ──────────────────────────────────────────────────────────
//   관리자 학생 랭킹(api-admin.ts 의 focus_score)과 같은 공식을 쓴다.
//   두 화면이 다른 숫자를 보여주면 "어느 게 맞냐" 소리가 나온다.
//   시선 50% + 발화 40% - 끊김 10%. 시선 데이터가 없으면 발화 70% - 끊김 30%.
export function participationScore(
  activeMs: number, sessionMs: number, gaze: number | null, disconnects: number
): number {
  const talkRatio = sessionMs > 0 ? (activeMs / sessionMs) * 100 : 0;
  const dcPenalty = Math.min(100, disconnects * 20);
  let score = gaze != null
    ? gaze * 0.5 + talkRatio * 0.4 - dcPenalty * 0.1
    : talkRatio * 0.7 - dcPenalty * 0.3;
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

// attendance 에 gaze_score 컬럼이 없는 환경(초기 스키마)에서도 죽지 않게 2단 조회
async function fetchAttendance(env: InsightEnv, roomId: string, uid: string): Promise<any | null> {
  const base = `SELECT room_id, user_id, username, role, joined_at, left_at, date,
                       COALESCE(total_session_ms,0) AS session_ms,
                       COALESCE(total_active_ms,0)  AS active_ms,
                       COALESCE(disconnect_count,0) AS disconnects`;
  const tail = ` FROM attendance WHERE room_id = ? AND user_id = ? ORDER BY joined_at DESC LIMIT 1`;
  try {
    return await env.DB.prepare(`${base}, gaze_score${tail}`).bind(roomId, uid).first<any>();
  } catch {
    const r = await env.DB.prepare(`${base}${tail}`).bind(roomId, uid).first<any>();
    if (r) (r as any).gaze_score = null;
    return r;
  }
}

// ── LLM 분석 ───────────────────────────────────────────────────────────
const LLM_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3-8b-instruct',
];

async function analyzeEnglish(env: InsightEnv, studentName: string, lines: string[]): Promise<any | null> {
  if (!env.AI || !lines.length) return null;
  const material = lines.map((l) => `- ${l}`).join('\n').slice(0, 5000);
  const prompt = `You are an English coach reviewing what a Korean child actually produced during one 1:1 online lesson.

Student: ${studentName}
What the student wrote/said in English during the lesson:
"""
${material}
"""

Rules:
- Judge ONLY what is in the material above. Never invent quotes or achievements.
- If the material is too thin to judge, still answer but keep it modest and say so in the summary.
- EVERY text field must be written twice: Korean (_ko) and natural English (_en). The English is read by Filipino teachers, so it must stand alone without the Korean.

Respond in STRICT JSON only, no markdown:
{
  "overall_score": 0-100,
  "summary_ko": "이번 수업에서 아이가 쓴 영어에 대한 2-3문장 요약",
  "summary_en": "2-3 sentence summary of the English the child used",
  "strengths_ko": ["강점 1줄", "..."],
  "strengths_en": ["strength in one line", "..."],
  "weaknesses_ko": ["아쉬운 점 1줄", "..."],
  "weaknesses_en": ["weak point in one line", "..."],
  "next_goals_ko": ["다음 수업에서 시도할 것", "..."],
  "next_goals_en": ["what to try next lesson", "..."],
  "corrections": [
    { "original": "<exact sentence the student produced>", "corrected": "<natural version>",
      "why_ko": "왜 그런지 1줄", "why_en": "why, in one line" }
  ],
  "evidence": [
    { "fact_ko": "판단 근거가 된 실제 발화 1줄", "fact_en": "the same evidence in English" }
  ]
}

Max 3 items per array, max 4 corrections. Be concrete and kind — a child reads the result too.`;

  let raw = '';
  for (const m of LLM_MODELS) {
    try {
      const resp: any = await env.AI.run(m, {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1800,
        temperature: 0.3,
      });
      if (typeof resp === 'string') raw = resp;
      else if (resp?.response) raw = typeof resp.response === 'string' ? resp.response : JSON.stringify(resp.response);
      if (raw) break;
    } catch (e: any) {
      console.warn('[lesson-insight] llm failed:', m, e?.message || e);
    }
  }
  if (!raw) return null;
  const mm = raw.match(/\{[\s\S]*\}/);
  try { return JSON.parse(mm ? mm[0] : raw); } catch { return null; }
}

const arr = (v: any, n: number): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, n) : [];

// ── 리포트 1건 생성 ────────────────────────────────────────────────────
export interface GenerateInput {
  roomId: string;
  studentUid: string;
  studentName?: string | null;
  transcript?: string | null;   // 넣어주면 채팅 대신 이걸 근거로 삼는다 (2단계 STT 대비)
}

export async function generateLessonInsight(env: InsightEnv, input: GenerateInput) {
  await ensureSchema(env);
  const roomId = String(input.roomId || '').trim().slice(0, 120);
  const uid = String(input.studentUid || '').trim().slice(0, 80);
  if (!roomId || !uid) return { ok: false, error: 'room_id_and_student_uid_required' };

  // ① 출석·집중도·발화 신호
  const att = await fetchAttendance(env, roomId, uid);
  const sessionMs = Number(att?.session_ms || 0);
  const activeMs = Number(att?.active_ms || 0);
  const gaze = att?.gaze_score != null ? Number(att.gaze_score) : null;
  const disconnects = Number(att?.disconnects || 0);
  const talkRatio = sessionMs > 0 ? Math.round((activeMs / sessionMs) * 1000) / 10 : 0;
  const partScore = participationScore(activeMs, sessionMs, gaze, disconnects);
  const studentName = String(input.studentName || att?.username || uid).slice(0, 80);
  const lessonDate = String(att?.date || new Date().toISOString().slice(0, 10));

  // ② 담당 교사 (같은 방의 teacher 출석행에서)
  let teacherUid: string | null = null;
  let teacherName: string | null = null;
  try {
    const t = await env.DB.prepare(
      `SELECT user_id, username FROM attendance WHERE room_id = ? AND role = 'teacher' ORDER BY joined_at DESC LIMIT 1`
    ).bind(roomId).first<any>();
    if (t) { teacherUid = t.user_id || null; teacherName = t.username || null; }
  } catch { /* 교사 행이 없어도 리포트는 만든다 */ }

  // ③ 영어 사용 근거 — transcript 우선, 없으면 학생 본인 채팅
  let lines: string[] = [];
  let materialSource = 'none';
  const tx = String(input.transcript || '').trim();
  if (tx) {
    lines = tx.split(/\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 2).slice(0, 60);
    materialSource = 'stt';
  } else {
    try {
      const rs = await env.DB.prepare(
        `SELECT message FROM chat_messages WHERE room_id = ? AND sender_uid = ? ORDER BY sent_at ASC LIMIT 60`
      ).bind(roomId, uid).all<any>();
      lines = (rs.results || [])
        .map((r: any) => String(r.message || '').replace(/\s+/g, ' ').trim())
        .filter((s: string) => s.length >= 2 && /[a-zA-Z]/.test(s))   // 영어가 한 글자도 없는 줄은 근거에서 제외
        .slice(0, 60);
      if (lines.length) materialSource = 'chat';
    } catch { /* chat_messages 미존재 환경 */ }
  }
  const chatWords = lines.join(' ').split(/\s+/).filter(Boolean).length;

  // ④ 근거가 너무 얇으면 AI를 부르지 않는다 — 없는 실력을 지어내지 않게 하는 안전장치
  const MIN_LINES = 3;
  const enough = lines.length >= MIN_LINES && chatWords >= 12;
  const ai = enough ? await analyzeEnglish(env, studentName, lines) : null;
  const status = ai ? 'auto' : 'signals_only';

  const now = Date.now();
  const row = {
    room_id: roomId, student_uid: uid, student_name: studentName,
    teacher_uid: teacherUid, teacher_name: teacherName, lesson_date: lessonDate,
    session_ms: sessionMs, active_ms: activeMs, talk_ratio: talkRatio,
    gaze_score: gaze, disconnect_count: disconnects, participation_score: partScore,
    chat_lines: lines.length, chat_words: chatWords,
    material_source: enough ? materialSource : (lines.length ? materialSource + '_thin' : 'none'),
    overall_score: ai ? Math.max(0, Math.min(100, Math.round(Number(ai.overall_score) || 0))) : null,
    summary_ko: ai ? String(ai.summary_ko || '') : null,
    summary_en: ai ? String(ai.summary_en || '') : null,
    strengths_ko: ai ? JSON.stringify(arr(ai.strengths_ko, 3)) : null,
    strengths_en: ai ? JSON.stringify(arr(ai.strengths_en, 3)) : null,
    weaknesses_ko: ai ? JSON.stringify(arr(ai.weaknesses_ko, 3)) : null,
    weaknesses_en: ai ? JSON.stringify(arr(ai.weaknesses_en, 3)) : null,
    next_goals_ko: ai ? JSON.stringify(arr(ai.next_goals_ko, 3)) : null,
    next_goals_en: ai ? JSON.stringify(arr(ai.next_goals_en, 3)) : null,
    corrections: ai && Array.isArray(ai.corrections) ? JSON.stringify(ai.corrections.slice(0, 4)) : null,
    evidence: ai && Array.isArray(ai.evidence) ? JSON.stringify(ai.evidence.slice(0, 3)) : null,
    status,
  };

  // UPSERT — 재생성해도 한 건 유지
  await env.DB.prepare(
    `INSERT INTO lesson_insights
      (room_id, student_uid, student_name, teacher_uid, teacher_name, lesson_date,
       session_ms, active_ms, talk_ratio, gaze_score, disconnect_count, participation_score,
       chat_lines, chat_words, material_source, overall_score, summary_ko, summary_en,
       strengths_ko, strengths_en, weaknesses_ko, weaknesses_en, next_goals_ko, next_goals_en,
       corrections, evidence, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(room_id, student_uid) DO UPDATE SET
       student_name=excluded.student_name, teacher_uid=excluded.teacher_uid, teacher_name=excluded.teacher_name,
       session_ms=excluded.session_ms, active_ms=excluded.active_ms, talk_ratio=excluded.talk_ratio,
       gaze_score=excluded.gaze_score, disconnect_count=excluded.disconnect_count,
       participation_score=excluded.participation_score, chat_lines=excluded.chat_lines,
       chat_words=excluded.chat_words, material_source=excluded.material_source,
       overall_score=COALESCE(excluded.overall_score, lesson_insights.overall_score),
       summary_ko=COALESCE(excluded.summary_ko, lesson_insights.summary_ko),
       summary_en=COALESCE(excluded.summary_en, lesson_insights.summary_en),
       strengths_ko=COALESCE(excluded.strengths_ko, lesson_insights.strengths_ko),
       strengths_en=COALESCE(excluded.strengths_en, lesson_insights.strengths_en),
       weaknesses_ko=COALESCE(excluded.weaknesses_ko, lesson_insights.weaknesses_ko),
       weaknesses_en=COALESCE(excluded.weaknesses_en, lesson_insights.weaknesses_en),
       next_goals_ko=COALESCE(excluded.next_goals_ko, lesson_insights.next_goals_ko),
       next_goals_en=COALESCE(excluded.next_goals_en, lesson_insights.next_goals_en),
       corrections=COALESCE(excluded.corrections, lesson_insights.corrections),
       evidence=COALESCE(excluded.evidence, lesson_insights.evidence),
       updated_at=excluded.updated_at`
  ).bind(
    row.room_id, row.student_uid, row.student_name, row.teacher_uid, row.teacher_name, row.lesson_date,
    row.session_ms, row.active_ms, row.talk_ratio, row.gaze_score, row.disconnect_count, row.participation_score,
    row.chat_lines, row.chat_words, row.material_source, row.overall_score, row.summary_ko, row.summary_en,
    row.strengths_ko, row.strengths_en, row.weaknesses_ko, row.weaknesses_en, row.next_goals_ko, row.next_goals_en,
    row.corrections, row.evidence, row.status, now, now
  ).run();

  return { ok: true, ...row, ai_used: !!ai };
}

// ── 배치: 끝난 수업 훑기 (cron */15분) ─────────────────────────────────
export async function runLessonInsightSweep(env: InsightEnv, opts?: { limit?: number; lookbackMs?: number }) {
  await ensureSchema(env);
  // 킬스위치
  try {
    if (env.SESSION_STATE && (await env.SESSION_STATE.get('insight:off'))) {
      return { ok: true, disabled: true, processed: 0 };
    }
  } catch { /* KV 불가 시 계속 */ }

  const limit = Math.max(1, Math.min(30, opts?.limit ?? 12));
  const lookback = opts?.lookbackMs ?? 6 * 3600_000;
  const now = Date.now();
  const from = now - lookback;
  const until = now - 3 * 60_000;   // 종료 직후 3분은 기다린다 (마지막 gaze/발화 beacon 이 늦게 들어옴)

  let targets: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT a.room_id AS room_id, a.user_id AS user_id, a.username AS username
         FROM attendance a
        WHERE COALESCE(a.role,'student') = 'student'
          AND a.left_at IS NOT NULL
          AND a.left_at BETWEEN ? AND ?
          AND NOT EXISTS (
                SELECT 1 FROM lesson_insights li
                 WHERE li.room_id = a.room_id AND li.student_uid = a.user_id)
        ORDER BY a.left_at DESC
        LIMIT ?`
    ).bind(from, until, limit).all<any>();
    targets = rs.results || [];
  } catch (e: any) {
    console.warn('[lesson-insight] sweep query failed:', e?.message || e);
    return { ok: false, error: String(e?.message || e), processed: 0 };
  }

  let done = 0, aiUsed = 0, failed = 0;
  for (const t of targets) {
    try {
      const r: any = await generateLessonInsight(env, {
        roomId: t.room_id, studentUid: t.user_id, studentName: t.username,
      });
      if (r?.ok) { done++; if (r.ai_used) aiUsed++; }
    } catch (e: any) {
      failed++;
      console.warn('[lesson-insight] generate failed:', t.room_id, t.user_id, e?.message || e);
    }
  }
  return { ok: true, candidates: targets.length, processed: done, ai_used: aiUsed, failed };
}

// ── HTTP 라우트 ────────────────────────────────────────────────────────
//   전부 /api/admin/ 아래에 둔다. 리포트에는 학생 이름과 발화 내용이 들어가므로 무인증 경로를 만들지 않는다.
//   index.ts 의 default-deny 미들웨어가 /api/admin/* 인증을 이미 보장한다.
//   강사 마이페이지도 /admin/mypage 라 같은 관리자 세션을 쓰므로 별도 공개 경로가 필요 없다.
//
//   GET  /api/admin/lesson-insights?room_id=|student_uid=|teacher_uid=|teacher_name=[&from=&to=&limit=]
//   POST /api/admin/lesson-insights/generate  {room_id, student_uid, student_name?, transcript?}
//   POST /api/admin/lesson-insights/sweep     (cron 안 기다리고 즉시 확인용)
export async function handleLessonInsightApi(
  request: Request, url: URL, env: InsightEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === 'POST' && path === '/api/admin/lesson-insights/generate') {
    const b: any = await request.json().catch(() => ({}));
    if (!b?.room_id || !b?.student_uid) return json({ ok: false, error: 'room_id_and_student_uid_required' }, 400);
    try {
      const r = await generateLessonInsight(env, {
        roomId: String(b.room_id), studentUid: String(b.student_uid),
        studentName: b.student_name || null, transcript: b.transcript || null,
      });
      return json(r, r.ok ? 200 : 400);
    } catch (e: any) {
      return json({ ok: false, error: String(e?.message || e) }, 500);
    }
  }

  if (method === 'POST' && path === '/api/admin/lesson-insights/sweep') {
    try {
      const b: any = await request.json().catch(() => ({}));
      const r = await runLessonInsightSweep(env, { limit: b?.limit, lookbackMs: b?.lookback_ms });
      return json(r);
    } catch (e: any) {
      return json({ ok: false, error: String(e?.message || e) }, 500);
    }
  }

  if (method === 'GET' && path === '/api/admin/lesson-insights') {
    await ensureSchema(env);
    const roomId = (url.searchParams.get('room_id') || '').trim();
    const studentUid = (url.searchParams.get('student_uid') || '').trim();
    const teacherUid = (url.searchParams.get('teacher_uid') || '').trim();
    // 강사 마이페이지는 uid 가 아니라 이름(window.__myName)으로 자기 것을 찾는다.
    const teacherName = (url.searchParams.get('teacher_name') || '').trim();
    const lim = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '30', 10)));
    const where: string[] = [];
    const binds: any[] = [];
    if (roomId) { where.push('room_id = ?'); binds.push(roomId); }
    if (studentUid) { where.push('student_uid = ?'); binds.push(studentUid); }
    if (teacherUid) { where.push('teacher_uid = ?'); binds.push(teacherUid); }
    if (teacherName) { where.push('teacher_name = ?'); binds.push(teacherName); }
    const fromD = (url.searchParams.get('from') || '').trim();
    const toD = (url.searchParams.get('to') || '').trim();
    if (fromD) { where.push('lesson_date >= ?'); binds.push(fromD); }
    if (toD) { where.push('lesson_date <= ?'); binds.push(toD); }
    binds.push(lim);
    try {
      const rs = await env.DB.prepare(
        `SELECT * FROM lesson_insights ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`
      ).bind(...binds).all<any>();
      const pj = (s: any) => { try { return s ? JSON.parse(s) : []; } catch { return []; } };
      const items = (rs.results || []).map((r: any) => ({
        ...r,
        strengths_ko: pj(r.strengths_ko), strengths_en: pj(r.strengths_en),
        weaknesses_ko: pj(r.weaknesses_ko), weaknesses_en: pj(r.weaknesses_en),
        next_goals_ko: pj(r.next_goals_ko), next_goals_en: pj(r.next_goals_en),
        corrections: pj(r.corrections), evidence: pj(r.evidence),
      }));
      return json({ ok: true, items, count: items.length });
    } catch (e: any) {
      return json({ ok: false, error: String(e?.message || e) }, 500);
    }
  }

  return null;
}
