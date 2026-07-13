var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// cloudflare-deploy/src/api-exam.ts
var api_exam_exports = {};
__export(api_exam_exports, {
  handleExamApi: () => handleExamApi
});
module.exports = __toCommonJS(api_exam_exports);

// cloudflare-deploy/src/api-util.ts
var json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  }
});
async function parseJsonBody(request) {
  try {
    const text = await request.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// cloudflare-deploy/src/api-exam.ts
async function ensureExamTables(env) {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS mt_exams (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT DEFAULT 'A1', listening_count INTEGER DEFAULT 5, reading_count INTEGER DEFAULT 5, duration_min INTEGER DEFAULT 20, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS mt_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, section TEXT NOT NULL, question_text TEXT NOT NULL, choice_a TEXT, choice_b TEXT, choice_c TEXT, choice_d TEXT, correct_answer TEXT NOT NULL, audio_url TEXT, image_url TEXT, points INTEGER DEFAULT 5, source TEXT DEFAULT 'manual', created_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS mt_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, user_id TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, score INTEGER, listening_score INTEGER, reading_score INTEGER, correct_count INTEGER, total_questions INTEGER);`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS mt_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, question_id INTEGER NOT NULL, selected_answer TEXT, is_correct INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
}
var SECTION_OK = (s) => s === "listening" || s === "reading" ? s : "reading";
var LETTER_OK = (s) => ["A", "B", "C", "D"].includes(String(s || "").toUpperCase()) ? String(s).toUpperCase() : "A";
var LEVEL_HINTS = {
  A1: "CEFR A1 (Korean elementary school beginner). Very short, very simple sentences (max 7 words). Basic everyday vocabulary only.",
  A2: "CEFR A2 (elementary upper grades). Short simple sentences (max 10 words). Common daily vocabulary.",
  B1: "CEFR B1 (middle school intermediate). Normal sentences (max 14 words). Some connectors and past/future tenses.",
  B2: "CEFR B2 (upper-intermediate). Natural sentences with varied grammar, mini TOEIC style.",
  C1: "CEFR C1 (advanced). Authentic TOEIC-style items with nuanced vocabulary and grammar."
};
async function mtAiGenerate(env, o) {
  const ai = env.AI;
  if (!ai) return { ok: false, error: "workers_ai_not_bound" };
  const count = Math.min(Math.max(Number(o.count) || 5, 1), 20);
  const hint = LEVEL_HINTS[o.level] || LEVEL_HINTS.A1;
  const topic = String(o.topic || "daily life").slice(0, 200);
  const shape = o.section === "listening" ? `{"audio_script":"<1-3 spoken English sentences to be read aloud (a short statement, announcement, or two-line dialogue)>","question_text":"<one English comprehension question about the audio>","choice_a":"..","choice_b":"..","choice_c":"..","choice_d":"..","correct_answer":"A|B|C|D"}` : `{"question_text":"<TOEIC-style incomplete sentence OR a 1-2 sentence mini passage followed by a question>","choice_a":"..","choice_b":"..","choice_c":"..","choice_d":"..","correct_answer":"A|B|C|D"}`;
  const prompt = `You are a TOEIC-style English test item writer for a Korean English academy (\uB9DD\uACE0\uC544\uC774).
Section: ${o.section === "listening" ? "LISTENING comprehension" : "READING (grammar / vocabulary / short reading)"}
Difficulty: ${hint}
Topic: ${topic}

Write exactly ${count} four-choice questions. Each item is a JSON object:
${shape}

Rules:
- All questions, choices${o.section === "listening" ? " and audio scripts" : ""} in English.
- Exactly one clearly correct answer per question; the other three plausible but wrong.
- Vary the position of the correct answer (do NOT make them all "A").
- No numbering, no explanations.
Reply with a raw JSON array ONLY. No markdown, no commentary.`;
  try {
    const resp = await ai.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: "You write English test questions as raw JSON arrays. Output JSON only." },
        { role: "user", content: prompt }
      ],
      max_tokens: Math.min(400 + count * 260, 4800)
    });
    let text = "";
    if (typeof resp === "string") text = resp;
    else if (resp && typeof resp.response === "string") text = resp.response;
    else if (resp && resp.response) text = JSON.stringify(resp.response);
    const m = String(text || "").match(/\[[\s\S]*\]/);
    if (!m) return { ok: false, error: "ai_no_json" };
    let arr = [];
    try {
      arr = JSON.parse(m[0]);
    } catch {
      return { ok: false, error: "ai_bad_json" };
    }
    const items = (Array.isArray(arr) ? arr : []).map((q) => ({
      question_text: String(q?.question_text || "").trim(),
      choice_a: String(q?.choice_a || "").trim(),
      choice_b: String(q?.choice_b || "").trim(),
      choice_c: String(q?.choice_c || "").trim(),
      choice_d: String(q?.choice_d || "").trim(),
      correct_answer: LETTER_OK(q?.correct_answer),
      audio_script: String(q?.audio_script || "").trim()
    })).filter((q) => q.question_text && q.choice_a && q.choice_b && q.choice_c && q.choice_d);
    if (!items.length) return { ok: false, error: "ai_invalid_questions" };
    return { ok: true, items: items.slice(0, count) };
  } catch (e) {
    return { ok: false, error: "ai_failed: " + (e?.message || "unknown") };
  }
}
async function handleExamApi(request, url, env) {
  const path = url.pathname;
  const method = request.method;
  if (method === "GET" && path === "/api/exam/tts") {
    const text = String(url.searchParams.get("text") || "").trim().slice(0, 500);
    if (!text) return json({ ok: false, error: "text_required" }, 400);
    const audioHeaders = { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=2592000", "Access-Control-Allow-Origin": "*" };
    const r2 = env.RECORDINGS;
    let cacheKey = "";
    try {
      const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("mt-tts-v1|en|" + text));
      cacheKey = "tts/mt-" + [...new Uint8Array(dig)].map((x) => x.toString(16).padStart(2, "0")).join("") + ".mp3";
    } catch {
    }
    if (cacheKey && r2) {
      try {
        const hit = await r2.get(cacheKey);
        if (hit) return new Response(hit.body, { headers: audioHeaders });
      } catch {
      }
    }
    const putCache = async (bytes) => {
      if (!cacheKey || !r2) return;
      try {
        await r2.put(cacheKey, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
      } catch {
      }
    };
    try {
      const ai = env.AI;
      if (ai) {
        const r = await ai.run("@cf/myshell-ai/melotts", { prompt: text, lang: "en" });
        const b64 = typeof r === "string" ? r : r?.audio || "";
        if (b64) {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          if (bytes.length > 2e3) {
            await putCache(bytes);
            return new Response(bytes, { headers: audioHeaders });
          }
        }
      }
    } catch {
    }
    try {
      const q = encodeURIComponent(text.slice(0, 190));
      const gr = await fetch("https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=" + q, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/"
        }
      });
      if (gr.ok) {
        const gb = await gr.arrayBuffer();
        if (gb.byteLength > 300) {
          await putCache(gb);
          return new Response(gb, { headers: audioHeaders });
        }
      }
    } catch {
    }
    return json({ ok: false, error: "tts_unavailable" }, 503);
  }
  if (method === "POST" && path === "/api/admin/exam/create") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const title = String(b.title || "").trim().slice(0, 120);
    if (!title) return json({ ok: false, error: "title_required" }, 400);
    const level = ["A1", "A2", "B1", "B2", "C1"].includes(b.level) ? b.level : "A1";
    const lc = Math.min(Math.max(Number(b.listening_count) || 5, 0), 30);
    const rc = Math.min(Math.max(Number(b.reading_count) || 5, 0), 30);
    const dur = Math.min(Math.max(Number(b.duration_min) || 20, 5), 120);
    const ins = await env.DB.prepare(`INSERT INTO mt_exams (title, level, listening_count, reading_count, duration_min, active, created_at) VALUES (?,?,?,?,?,1,?)`).bind(title, level, lc, rc, dur, Date.now()).run();
    return json({ ok: true, exam_id: ins?.meta?.last_row_id });
  }
  if (method === "POST" && path === "/api/admin/exam/question/ai-generate") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const examId = Number(b.exam_id) || 0;
    if (!examId) return json({ ok: false, error: "exam_id_required" }, 400);
    const exam = await env.DB.prepare(`SELECT id, level FROM mt_exams WHERE id = ?`).bind(examId).first();
    if (!exam) return json({ ok: false, error: "exam_not_found" }, 404);
    const section = SECTION_OK(b.section);
    const count = Math.min(Math.max(Number(b.count) || 5, 1), 20);
    const topic = String(b.topic || "daily life").trim().slice(0, 200);
    const gen = await mtAiGenerate(env, { level: exam.level || "A1", section, count, topic });
    if (!gen.ok) return json({ ok: false, error: gen.error }, 502);
    const now = Date.now();
    let saved = 0;
    for (const q of gen.items) {
      const audioUrl = section === "listening" && q.audio_script ? "/api/exam/tts?lang=en&text=" + encodeURIComponent(q.audio_script) : null;
      await env.DB.prepare(`INSERT INTO mt_questions (exam_id, section, question_text, choice_a, choice_b, choice_c, choice_d, correct_answer, audio_url, image_url, points, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(examId, section, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d, q.correct_answer, audioUrl, null, 5, "ai", now).run();
      saved++;
    }
    return json({ ok: true, generated_count: saved, section });
  }
  if (method === "POST" && path === "/api/admin/exam/question/add") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const examId = Number(b.exam_id) || 0;
    const qText = String(b.question_text || "").trim();
    if (!examId || !qText) return json({ ok: false, error: "exam_id_and_question_required" }, 400);
    const exam = await env.DB.prepare(`SELECT id FROM mt_exams WHERE id = ?`).bind(examId).first();
    if (!exam) return json({ ok: false, error: "exam_not_found" }, 404);
    await env.DB.prepare(`INSERT INTO mt_questions (exam_id, section, question_text, choice_a, choice_b, choice_c, choice_d, correct_answer, audio_url, image_url, points, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      examId,
      SECTION_OK(b.section),
      qText,
      String(b.choice_a || ""),
      String(b.choice_b || ""),
      String(b.choice_c || ""),
      String(b.choice_d || ""),
      LETTER_OK(b.correct_answer),
      b.audio_url ? String(b.audio_url) : null,
      b.image_url ? String(b.image_url) : null,
      Math.min(Math.max(Number(b.points) || 5, 1), 100),
      "manual",
      Date.now()
    ).run();
    return json({ ok: true });
  }
  if (method === "POST" && path === "/api/admin/exam/question/delete") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const qid = Number(b.question_id) || 0;
    if (!qid) return json({ ok: false, error: "question_id_required" }, 400);
    const r = await env.DB.prepare(`DELETE FROM mt_questions WHERE id = ?`).bind(qid).run();
    return json({ ok: true, deleted: r?.meta?.changes || 0 });
  }
  if (method === "POST" && path === "/api/admin/exam/toggle") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const examId = Number(b.exam_id) || 0;
    if (!examId) return json({ ok: false, error: "exam_id_required" }, 400);
    const row = await env.DB.prepare(`SELECT active FROM mt_exams WHERE id = ?`).bind(examId).first();
    if (!row) return json({ ok: false, error: "exam_not_found" }, 404);
    const next = row.active ? 0 : 1;
    await env.DB.prepare(`UPDATE mt_exams SET active = ? WHERE id = ?`).bind(next, examId).run();
    return json({ ok: true, active: next });
  }
  if (method === "POST" && path === "/api/admin/exam/delete") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const examId = Number(b.exam_id) || 0;
    if (!examId) return json({ ok: false, error: "exam_id_required" }, 400);
    await env.DB.prepare(`DELETE FROM mt_answers WHERE attempt_id IN (SELECT id FROM mt_attempts WHERE exam_id = ?)`).bind(examId).run();
    await env.DB.prepare(`DELETE FROM mt_attempts WHERE exam_id = ?`).bind(examId).run();
    await env.DB.prepare(`DELETE FROM mt_questions WHERE exam_id = ?`).bind(examId).run();
    const r = await env.DB.prepare(`DELETE FROM mt_exams WHERE id = ?`).bind(examId).run();
    return json({ ok: true, deleted: r?.meta?.changes || 0 });
  }
  if (method === "GET" && path === "/api/admin/exams") {
    await ensureExamTables(env);
    const rs = await env.DB.prepare(`SELECT e.*,
        (SELECT COUNT(*) FROM mt_questions q WHERE q.exam_id = e.id) AS question_count,
        (SELECT COUNT(*) FROM mt_questions q WHERE q.exam_id = e.id AND q.section='listening') AS lq_count,
        (SELECT COUNT(*) FROM mt_questions q WHERE q.exam_id = e.id AND q.section='reading') AS rq_count,
        (SELECT COUNT(*) FROM mt_attempts a WHERE a.exam_id = e.id AND a.finished_at IS NOT NULL) AS attempt_count,
        (SELECT AVG(a.score) FROM mt_attempts a WHERE a.exam_id = e.id AND a.finished_at IS NOT NULL) AS avg_score
      FROM mt_exams e ORDER BY e.id DESC LIMIT 100`).all();
    return json({ ok: true, list: rs.results || [] });
  }
  {
    const m = method === "GET" ? path.match(/^\/api\/admin\/exam\/(\d+)$/) : null;
    if (m) {
      await ensureExamTables(env);
      const examId = Number(m[1]);
      const exam = await env.DB.prepare(`SELECT * FROM mt_exams WHERE id = ?`).bind(examId).first();
      if (!exam) return json({ ok: false, error: "exam_not_found" }, 404);
      const qs = await env.DB.prepare(`SELECT * FROM mt_questions WHERE exam_id = ? ORDER BY CASE section WHEN 'listening' THEN 0 ELSE 1 END, id`).bind(examId).all();
      const lb = await env.DB.prepare(`SELECT user_id, score, listening_score, reading_score, finished_at FROM mt_attempts WHERE exam_id = ? AND finished_at IS NOT NULL ORDER BY score DESC, finished_at ASC LIMIT 20`).bind(examId).all();
      return json({ ok: true, exam, questions: qs.results || [], leaderboard: lb.results || [] });
    }
  }
  if (method === "GET" && path === "/api/exam/list") {
    await ensureExamTables(env);
    const rs = await env.DB.prepare(`SELECT e.id, e.title, e.level, e.listening_count, e.reading_count, e.duration_min,
        (SELECT COUNT(*) FROM mt_questions q WHERE q.exam_id = e.id) AS question_count
      FROM mt_exams e WHERE e.active = 1
        AND (SELECT COUNT(*) FROM mt_questions q WHERE q.exam_id = e.id) > 0
      ORDER BY e.id DESC LIMIT 50`).all();
    return json({ ok: true, list: rs.results || [] });
  }
  if (method === "POST" && path === "/api/exam/attempt/start") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const examId = Number(b.exam_id) || 0;
    const userId = String(b.user_id || "").trim().slice(0, 80);
    if (!examId || !userId) return json({ ok: false, error: "exam_id_and_user_id_required" }, 400);
    const exam = await env.DB.prepare(`SELECT * FROM mt_exams WHERE id = ? AND active = 1`).bind(examId).first();
    if (!exam) return json({ ok: false, error: "exam_not_found" }, 404);
    const qs = await env.DB.prepare(`SELECT id, section, question_text, choice_a, choice_b, choice_c, choice_d, audio_url, image_url FROM mt_questions WHERE exam_id = ? ORDER BY CASE section WHEN 'listening' THEN 0 ELSE 1 END, id`).bind(examId).all();
    const questions = qs.results || [];
    if (!questions.length) return json({ ok: false, error: "no_questions" }, 400);
    const ins = await env.DB.prepare(`INSERT INTO mt_attempts (exam_id, user_id, started_at) VALUES (?,?,?)`).bind(examId, userId, Date.now()).run();
    return json({ ok: true, attempt_id: ins?.meta?.last_row_id, questions });
  }
  if (method === "POST" && path === "/api/exam/attempt/submit-answer") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const attemptId = Number(b.attempt_id) || 0;
    const questionId = Number(b.question_id) || 0;
    const sel = LETTER_OK(b.selected_answer);
    if (!attemptId || !questionId) return json({ ok: false, error: "attempt_and_question_required" }, 400);
    const att = await env.DB.prepare(`SELECT id, exam_id, finished_at FROM mt_attempts WHERE id = ?`).bind(attemptId).first();
    if (!att) return json({ ok: false, error: "attempt_not_found" }, 404);
    if (att.finished_at) return json({ ok: false, error: "attempt_already_finished" }, 400);
    const q = await env.DB.prepare(`SELECT id, correct_answer FROM mt_questions WHERE id = ? AND exam_id = ?`).bind(questionId, att.exam_id).first();
    if (!q) return json({ ok: false, error: "question_not_found" }, 404);
    const isCorrect = sel === String(q.correct_answer).toUpperCase() ? 1 : 0;
    await env.DB.prepare(`DELETE FROM mt_answers WHERE attempt_id = ? AND question_id = ?`).bind(attemptId, questionId).run();
    await env.DB.prepare(`INSERT INTO mt_answers (attempt_id, question_id, selected_answer, is_correct, created_at) VALUES (?,?,?,?,?)`).bind(attemptId, questionId, sel, isCorrect, Date.now()).run();
    return json({ ok: true });
  }
  if (method === "POST" && path === "/api/exam/attempt/finish") {
    await ensureExamTables(env);
    const b = await parseJsonBody(request) || {};
    const attemptId = Number(b.attempt_id) || 0;
    if (!attemptId) return json({ ok: false, error: "attempt_id_required" }, 400);
    const att = await env.DB.prepare(`SELECT * FROM mt_attempts WHERE id = ?`).bind(attemptId).first();
    if (!att) return json({ ok: false, error: "attempt_not_found" }, 404);
    if (att.finished_at) {
      return json({ ok: true, score: att.score, correct_count: att.correct_count, total_questions: att.total_questions, listening_score: att.listening_score, reading_score: att.reading_score });
    }
    const stats = await env.DB.prepare(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN q.section='listening' THEN 1 ELSE 0 END) AS l_total,
        SUM(CASE WHEN q.section='reading' THEN 1 ELSE 0 END) AS r_total
      FROM mt_questions q WHERE q.exam_id = ?`).bind(att.exam_id).first();
    const cor = await env.DB.prepare(`SELECT
        SUM(a.is_correct) AS correct,
        SUM(CASE WHEN q.section='listening' THEN a.is_correct ELSE 0 END) AS l_correct,
        SUM(CASE WHEN q.section='reading' THEN a.is_correct ELSE 0 END) AS r_correct
      FROM mt_answers a JOIN mt_questions q ON q.id = a.question_id
      WHERE a.attempt_id = ?`).bind(attemptId).first();
    const total = Number(stats?.total) || 0;
    const correct = Number(cor?.correct) || 0;
    const pct = (c, t) => t ? Math.round(c / t * 100) : 0;
    const score = pct(correct, total);
    const lScore = pct(Number(cor?.l_correct) || 0, Number(stats?.l_total) || 0);
    const rScore = pct(Number(cor?.r_correct) || 0, Number(stats?.r_total) || 0);
    await env.DB.prepare(`UPDATE mt_attempts SET finished_at=?, score=?, listening_score=?, reading_score=?, correct_count=?, total_questions=? WHERE id=?`).bind(Date.now(), score, lScore, rScore, correct, total, attemptId).run();
    return json({ ok: true, score, correct_count: correct, total_questions: total, listening_score: lScore, reading_score: rScore });
  }
  if (method === "GET" && path === "/api/exam/results") {
    await ensureExamTables(env);
    const userId = String(url.searchParams.get("user_id") || "").trim();
    if (!userId) return json({ ok: false, error: "user_id_required" }, 400);
    const rs = await env.DB.prepare(`SELECT a.exam_id, e.title, a.score, a.listening_score, a.reading_score, a.correct_count, a.total_questions, a.finished_at
      FROM mt_attempts a JOIN mt_exams e ON e.id = a.exam_id
      WHERE a.user_id = ? AND a.finished_at IS NOT NULL ORDER BY a.finished_at DESC LIMIT 30`).bind(userId).all();
    return json({ ok: true, list: rs.results || [] });
  }
  return null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handleExamApi
});
