/**
 * warmup-graph.ts — 수업 전 AI 웜업 "개인화" (Neo4j Aura HTTP Query API)
 *
 * 배경 / 기존 시스템과의 관계
 * ─────────────────────────────────────────────────────────────────────────
 *   웜업 기본 연동(index.ts warmupLessonContext)은 D1로 "오늘 배울 교재의 문장"을
 *   뽑아 AI 프롬프트에 넣는다. 같은 교재면 모든 학생이 같은 문장 풀을 받는다.
 *   본 모듈은 복습퀴즈 응시 기록(review_quiz_results)에서 "그 학생이 틀린 문장"을
 *   그래프로 적재하고, 오늘 교재와 교차하는 취약 문장을 우선 질문하게 한다.
 *
 *   런타임이 Cloudflare Workers라 Bolt 드라이버는 못 쓰고, teacher-match.ts 와
 *   동일하게 Aura HTTP Query API(runCypher 재사용)로 Cypher 를 전송한다.
 *   조회는 "웜업 세션 시작 시 1회 + KV 캐시" — 매 채팅 메시지마다 Aura 를 치지 않는다.
 *
 * 그래프 모델
 *   (s:Student {student_id})-[:ASSIGNED_TO]->(tb:Textbook {name})
 *   (tb:Textbook)-[:HAS_SENTENCE]->(sen:Sentence {text})
 *   (s)-[w:STRUGGLED_WITH {count, last_at}]->(sen)
 *
 * ETL 소스(D1)
 *   students_erp        : user_id → textbook (배정 교재)
 *   review_quizzes      : textbook → questions(문장: audio_text/answer_text/target)
 *   review_quiz_results : user_id 별 답안 → 오답 문장 (detail 컬럼 우선, 없으면 재채점)
 *
 * 환경변수 — teacher-match 와 동일 시크릿 재사용 (미설정 시 graceful degrade)
 *   NEO4J_QUERY_URL / NEO4J_USER / NEO4J_PASSWORD
 *
 * 외부 공개
 *   runWarmupGraphSync(env)                        : D1 → Neo4j ETL (멱등 MERGE)
 *   getWeakSentences(env, studentId, textbook, n)  : 취약 문장 (오늘 교재 우선 정렬)
 *   warmupGraphRouter(request, env)                : /api/admin/warmup-graph/*
 */

import { runCypher, Neo4jNotConfiguredError, type TeacherMatchEnv } from './teacher-match';

export type WarmupGraphEnv = TeacherMatchEnv;

export interface WeakSentence {
  text: string;
  wrongCount: number;
  inTodayTextbook: boolean;
}

// ── ETL 적재 Cypher ────────────────────────────────────────────────────────
// 교재 → 문장 (Sentence 는 text 로 전역 유니크 — 여러 교재가 같은 문장을 공유 가능)
const LOAD_TEXTBOOK_SENTENCES_QUERY = `
UNWIND $books AS b
  MERGE (tb:Textbook {name: b.name})
  WITH tb, b
  UNWIND b.sentences AS sent
    MERGE (sen:Sentence {text: sent})
    MERGE (tb)-[:HAS_SENTENCE]->(sen)
`;

// 학생 → 배정 교재 (교재가 바뀐 학생은 이전 ASSIGNED_TO 를 제거해 최신 1개만 유지)
const LOAD_ASSIGNMENTS_QUERY = `
UNWIND $assigns AS a
  MERGE (s:Student {student_id: a.student_id})
  WITH s, a
  OPTIONAL MATCH (s)-[old:ASSIGNED_TO]->(oldTb:Textbook)
  WHERE oldTb.name <> a.textbook
  DELETE old
  WITH DISTINCT s, a
  MERGE (tb:Textbook {name: a.textbook})
  MERGE (s)-[:ASSIGNED_TO]->(tb)
`;

// 학생 → 오답 문장. count 는 ETL 에서 절대값으로 집계해 SET — 재실행해도 중복 누적 없음(멱등).
const LOAD_STRUGGLES_QUERY = `
UNWIND $wrongs AS w
  MERGE (s:Student {student_id: w.student_id})
  MERGE (sen:Sentence {text: w.text})
  MERGE (s)-[r:STRUGGLED_WITH]->(sen)
  SET r.count = w.count, r.last_at = w.last_at
  WITH sen, w
  MERGE (tb:Textbook {name: w.textbook})
  MERGE (tb)-[:HAS_SENTENCE]->(sen)
`;

// ── 조회 Cypher — 오늘 교재에 나오는 취약 문장 우선, 없으면 전체 취약 문장 ──
const WEAK_SENTENCES_QUERY = `
MATCH (s:Student {student_id: $studentId})-[w:STRUGGLED_WITH]->(sen:Sentence)
OPTIONAL MATCH (tb:Textbook)-[:HAS_SENTENCE]->(sen)
WHERE toLower(tb.name) = toLower($textbook)
WITH sen, w, (tb IS NOT NULL) AS inToday
RETURN sen.text AS text, w.count AS wrongCount, inToday
ORDER BY inToday DESC, w.count DESC, w.last_at DESC
LIMIT $limit
`;

/** review_quizzes.questions JSON 에서 영어 문장 추출 (index.ts warmupLessonContext 와 동일 기준) */
function extractSentences(questionsJson: unknown): string[] {
  let qs: any[] = [];
  try { qs = JSON.parse(String(questionsJson || '[]')) || []; } catch {}
  const out: string[] = [];
  for (const q of qs) {
    for (const c of [q?.audio_text, q?.answer_text, q?.target]) {
      const s = String(c || '').trim();
      if (s && /[a-zA-Z]/.test(s) && s.length <= 80 && !out.includes(s)) out.push(s);
    }
  }
  return out;
}

/** 오답 문장 하나 — detail 행(신규 저장분) 또는 재채점(구 데이터)에서 나온 결과 */
interface WrongEvent { student_id: string; text: string; textbook: string; at: number }

const normText = (s: unknown) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 단어 단위 일치율(0~1) — api-mango rqWordAcc 와 동일 취지의 경량 재구현 */
function wordAccuracy(answer: string, said: string): number {
  const a = normText(answer).split(' ').filter(Boolean);
  const b = new Set(normText(said).split(' ').filter(Boolean));
  if (!a.length) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / a.length;
}

/** 구 데이터(제출 detail 미저장) 재채점 — draw(랜덤 출제) 퀴즈는 문항 매핑이 불가해 건너뜀 */
function regradeWrongs(row: { user_id: string; answers: string; created_at: number }, quiz: { textbook: string; questions: string; draw: string | null }): WrongEvent[] {
  if (quiz.draw) return [];
  let qs: any[] = []; let ans: any[] = [];
  try { qs = JSON.parse(quiz.questions) || []; } catch {}
  try { ans = JSON.parse(row.answers) || []; } catch {}
  if (!qs.length || !ans.length) return [];
  const out: WrongEvent[] = [];
  for (let i = 0; i < Math.min(qs.length, ans.length); i++) {
    const q = qs[i]; const a = ans[i];
    const type = q?.type || 'choice';
    let wrong = false; let text = '';
    if (type === 'choice' || type === 'listen') {
      const n = (a == null || a === '') ? NaN : Number(a);
      wrong = !(Number.isInteger(n) && n === Number(q.answer));
      text = String(q.audio_text || (Array.isArray(q.opts) ? q.opts[Number(q.answer)] : '') || '').trim();
    } else {
      const said = String(a == null ? '' : a);
      const acc = wordAccuracy(q.answer_text, said);
      wrong = type === 'write' ? !(normText(said) === normText(q.answer_text) || acc >= 0.85) : acc < 0.6;
      text = String(q.answer_text || '').trim();
    }
    if (wrong && text && /[a-zA-Z]/.test(text) && text.length <= 80) {
      out.push({ student_id: row.user_id, text, textbook: quiz.textbook, at: row.created_at });
    }
  }
  return out;
}

/** 신규 데이터 — 제출 시 저장된 채점 detail(JSON)에서 오답 문장 추출 */
function detailWrongs(row: { user_id: string; detail: string; created_at: number }, textbook: string): WrongEvent[] {
  let ds: any[] = [];
  try { ds = JSON.parse(row.detail) || []; } catch {}
  const out: WrongEvent[] = [];
  for (const d of ds) {
    if (d?.correct) continue;
    const text = String(d?.answer_text || d?.audio_text || '').trim();
    if (text && /[a-zA-Z]/.test(text) && text.length <= 80) {
      out.push({ student_id: row.user_id, text, textbook, at: row.created_at });
    }
  }
  return out;
}

/**
 * D1 → Neo4j 웜업 그래프 적재(ETL). 멱등 — 반복 실행해도 중복 노드/누적 없음.
 * @returns 적재 카운트 요약
 * @throws Neo4jNotConfiguredError(미설정) / Error(D1·연결·쿼리 오류)
 */
export async function runWarmupGraphSync(
  env: WarmupGraphEnv,
): Promise<{ textbooks: number; sentences: number; assignments: number; struggles: number; resultsScanned: number }> {
  if (!env.DB) throw new Error('D1 바인딩(DB)이 없어 ETL을 실행할 수 없습니다.');

  // 1) 교재 → 문장
  const qrs = await env.DB
    .prepare(`SELECT id, textbook, questions, draw FROM review_quizzes WHERE active = 1 AND textbook IS NOT NULL AND textbook != ''`)
    .all<{ id: number; textbook: string; questions: string; draw: string | null }>();
  const quizzes = qrs.results || [];
  const bookMap = new Map<string, Set<string>>();
  const quizById = new Map<number, { textbook: string; questions: string; draw: string | null }>();
  for (const q of quizzes) {
    quizById.set(Number(q.id), { textbook: q.textbook, questions: q.questions, draw: q.draw });
    const set = bookMap.get(q.textbook) || new Set<string>();
    for (const s of extractSentences(q.questions)) set.add(s);
    bookMap.set(q.textbook, set);
  }
  const books = Array.from(bookMap.entries())
    .map(([name, set]) => ({ name, sentences: Array.from(set).slice(0, 200) }))
    .filter((b) => b.sentences.length);

  // 2) 학생 → 배정 교재
  let assigns: Array<{ student_id: string; textbook: string }> = [];
  try {
    const ars = await env.DB
      .prepare(`SELECT user_id, textbook FROM students_erp WHERE textbook IS NOT NULL AND textbook != '' LIMIT 5000`)
      .all<{ user_id: string; textbook: string }>();
    assigns = (ars.results || []).map((r) => ({ student_id: String(r.user_id), textbook: String(r.textbook).trim() })).filter((a) => a.student_id && a.textbook);
  } catch {
    // students_erp 미존재 → 배정 없이 진행 (오답 그래프만 적재)
  }

  // 3) 응시 기록 → 오답 문장 (최근 2000건 — detail 우선, 없으면 재채점)
  let resultsScanned = 0;
  const events: WrongEvent[] = [];
  try {
    const rrs = await env.DB
      .prepare(`SELECT quiz_id, user_id, answers, detail, created_at FROM review_quiz_results ORDER BY created_at DESC LIMIT 2000`)
      .all<{ quiz_id: number; user_id: string; answers: string; detail: string | null; created_at: number }>();
    for (const r of (rrs.results || [])) {
      const quiz = quizById.get(Number(r.quiz_id));
      if (!quiz || !r.user_id) continue;
      resultsScanned++;
      if (r.detail) events.push(...detailWrongs({ user_id: r.user_id, detail: r.detail, created_at: r.created_at }, quiz.textbook));
      else events.push(...regradeWrongs({ user_id: r.user_id, answers: r.answers, created_at: r.created_at }, quiz));
    }
  } catch (e: any) {
    // detail 컬럼이 아직 없는 구 스키마 — detail 없이 재조회
    const rrs = await env.DB
      .prepare(`SELECT quiz_id, user_id, answers, created_at FROM review_quiz_results ORDER BY created_at DESC LIMIT 2000`)
      .all<{ quiz_id: number; user_id: string; answers: string; created_at: number }>();
    for (const r of (rrs.results || [])) {
      const quiz = quizById.get(Number(r.quiz_id));
      if (!quiz || !r.user_id) continue;
      resultsScanned++;
      events.push(...regradeWrongs(r, quiz));
    }
  }

  // (학생, 문장) 단위 집계 — count 절대값 + 최근 시각
  const agg = new Map<string, { student_id: string; text: string; textbook: string; count: number; last_at: number }>();
  for (const e of events) {
    const key = e.student_id + ' ' + e.text;
    const cur = agg.get(key);
    if (cur) { cur.count++; if (e.at > cur.last_at) { cur.last_at = e.at; cur.textbook = e.textbook; } }
    else agg.set(key, { student_id: e.student_id, text: e.text, textbook: e.textbook, count: 1, last_at: e.at });
  }
  const wrongs = Array.from(agg.values()).slice(0, 3000);

  // 4) Neo4j 적재 (Query API 는 호출당 단일 statement — 순차)
  if (books.length) await runCypher(env, LOAD_TEXTBOOK_SENTENCES_QUERY, { books }, 'WRITE');
  if (assigns.length) await runCypher(env, LOAD_ASSIGNMENTS_QUERY, { assigns }, 'WRITE');
  if (wrongs.length) await runCypher(env, LOAD_STRUGGLES_QUERY, { wrongs }, 'WRITE');

  return {
    textbooks: books.length,
    sentences: books.reduce((n, b) => n + b.sentences.length, 0),
    assignments: assigns.length,
    struggles: wrongs.length,
    resultsScanned,
  };
}

/** Query API 결과의 정수 표현을 JS number 로 정규화 (teacher-match toNumber 와 동일) */
function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'low' in (v as any)) return (v as any).low;
  return Number(v) || 0;
}

/**
 * 학생의 취약 문장 조회 — 오늘 교재(HAS_SENTENCE 교차)에 나오는 것 우선 정렬.
 * @throws Neo4jNotConfiguredError / Error — 호출부(웜업 채팅)는 catch 후 빈 배열로 degrade 할 것.
 */
export async function getWeakSentences(
  env: WarmupGraphEnv,
  studentId: string,
  textbook: string,
  limit = 5,
): Promise<WeakSentence[]> {
  if (!studentId) return [];
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 20) : 5;
  const { fields, values } = await runCypher(env, WEAK_SENTENCES_QUERY, {
    studentId,
    textbook: textbook || '',
    limit: safeLimit,
  });
  const fText = fields.indexOf('text');
  const fCnt = fields.indexOf('wrongCount');
  const fIn = fields.indexOf('inToday');
  return values.map((row) => ({
    text: String(row[fText] || ''),
    wrongCount: toNum(row[fCnt]),
    inTodayTextbook: !!row[fIn],
  })).filter((w) => w.text);
}

// ── 공통 JSON 응답 헬퍼 (프로젝트 라우터 컨벤션과 동일) ───────────────────────
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

/**
 * 독립 라우터 — /api/admin/warmup-graph/* (관리자 세션 게이트는 index.ts 공통 미들웨어가 적용)
 *   POST /api/admin/warmup-graph/sync                       : D1 → Neo4j 수동 재적재
 *   GET  /api/admin/warmup-graph/weak?student_id=&textbook= : 취약 문장 디버그 조회
 */
export async function warmupGraphRouter(request: Request, env: WarmupGraphEnv): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/warmup-graph\/?/, '');
  const method = request.method.toUpperCase();

  try {
    if (p === 'sync' && method === 'POST') {
      const summary = await runWarmupGraphSync(env);
      return json({ ok: true, synced: summary });
    }

    if (p === 'weak' && method === 'GET') {
      const studentId = url.searchParams.get('student_id') || '';
      const textbook = url.searchParams.get('textbook') || '';
      const limit = Number(url.searchParams.get('limit')) || 5;
      if (!studentId) return err('student_id 쿼리 파라미터가 필요합니다.', 400);
      const weak = await getWeakSentences(env, studentId, textbook, limit);
      return json({ ok: true, student_id: studentId, textbook, count: weak.length, weak_sentences: weak });
    }

    return err('not found: ' + p, 404);
  } catch (e: any) {
    if (e instanceof TypeError) return err(e.message, 400);
    if (e instanceof Neo4jNotConfiguredError) return err(e.message, 503);
    const status = /인증 실패|연결 실패/.test(e?.message || '') ? 503 : 500;
    return err(e?.message || 'warmup-graph internal error', status);
  }
}
