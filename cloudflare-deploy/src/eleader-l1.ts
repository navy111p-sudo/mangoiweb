/** 엘리더잼 Level 1 기본과정 — A.i 말하기(웜업) 화면에서 쓰는 «허용된 학생 전용» 통로.
 *  (2026-10-25 사장님 지시: 「ed / 1234 로 로그인하면 아바타랑 A.i 말하기에서 대화가 되게 · level1 기본과정에 맞게」)
 *
 *  - GET  /api/ai/eleader/l1/books  → 22권 × 20문항(질문·한글 힌트·예시 문장). 허용 학생에게만.
 *  - POST /api/ai/eleader/l1/chat   → 웜업 대화 엔진으로 넘기되, 주제·난이도·연령은 «서버가» 정한다.
 *
 *  ⛔ 허용 목록 밖 계정은 403 — 교재 내용·대화 통로 둘 다 안 열린다(화면은 그 답을 보고 아무것도 안 그린다).
 *  ⛔ 화면이 보낸 lesson_topic·textbook·level·difficulty 는 버린다(본문 값을 믿지 않기).
 *  ⛔ 하루 상한(ELEADER_L1_DAILY_CAP)은 «대화 턴» 을 센다. 음성합성·받아쓰기는 웜업의 기존 경로(/api/voice/*)를 그대로 쓴다.
 *     상한을 못 세면(D1 장애) 막는 쪽으로 실패한다 — 비용 상한이기 때문.
 */
import { verifyUidToken } from './auth-token';
import { ELEADER_BOOK_UNITS } from './eleader-book-pack';

/** 정확일치(대소문자 구분) — `Ed`·`ED` 는 다른 계정이다. 학생을 늘리려면 이 목록에 한 줄. */
export const ELEADER_L1_STUDENTS: ReadonlySet<string> = new Set(['ed']);
export const ELEADER_L1_DAILY_CAP = 120;
export const ELEADER_L1_PREFIX = '/api/ai/eleader/l1/';

type L1Env = { DB: D1Database; [key: string]: any };
export type WarmEngine = (request: Request) => Promise<Response>;

const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** KST 날짜(YYYY-MM-DD) — 하루 상한의 기준. */
export function kstDay(now = Date.now()): string {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

/** 이번 턴에 AI 가 따를 수업 지시(서버 정본). 책·문항이 틀리면 null. */
export function eleaderL1Topic(bookId: unknown, qIndex: unknown, kickoff: boolean): string | null {
  const book = ELEADER_BOOK_UNITS.find(b => b.id === bookId);
  const i = Number(qIndex);
  if (!book || !Number.isInteger(i) || i < 0 || i >= book.questions.length) return null;
  const qs = book.questions, q = qs[i], n = qs.length;
  const head = `Eleader Jam Level 1 basic course for beginner lower-primary children (ages 6-9, pre-A1/A1). ` +
    `Book: ${JSON.stringify(book.title)}. Ask the book questions one at a time, in order. ` +
    `Use very short, simple, grammatical sentences (at most 7 words each). Never use Korean in English sentences.`;
  if (kickoff) {
    return `${head} START NOW: greet the learner in one short sentence, then ask exactly this question ${i + 1}/${n}: ${JSON.stringify(q.question)}`;
  }
  const next = i + 1 < n
    ? `Then ask exactly this next question ${i + 2}/${n}: ${JSON.stringify(qs[i + 1].question)}`
    : `This was the last question. Praise the learner warmly and say today's book practice is finished. Do not ask a new book question.`;
  return `${head} The learner is answering question ${i + 1}/${n}: ${JSON.stringify(q.question)}. ` +
    `A good example answer is ${JSON.stringify(q.model)}. In at most 2 short sentences, react kindly to what the learner actually said ` +
    `(if the answer is very short, unclear or not English, offer the example answer for them to say). ${next}`;
}

async function readJson(request: Request, limit: number): Promise<any> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw Error('json_required');
  const reader = request.body?.getReader();
  if (!reader) throw Error('body_required');
  const parts: Uint8Array[] = []; let n = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      n += value.length; if (n > limit) { await reader.cancel(); throw Error('too_large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(n); let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  const data = JSON.parse(new TextDecoder().decode(all));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('invalid');
  return data;
}

async function ensureUsage(DB: D1Database) {
  await DB.exec('CREATE TABLE IF NOT EXISTS eleader_l1_usage (uid TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uid, day))');
}
async function usedToday(DB: D1Database, uid: string, day: string): Promise<number> {
  await ensureUsage(DB);
  const r = await DB.prepare('SELECT n FROM eleader_l1_usage WHERE uid=? AND day=?').bind(uid, day).first<{ n: number }>();
  return Number(r?.n) || 0;
}
/** 상한 안이면 한 칸 선점하고 true. 한 문장이라 동시 요청이 서로를 넘지 못한다. */
async function reserveTurn(DB: D1Database, uid: string, day: string, cap: number): Promise<boolean> {
  await ensureUsage(DB);
  const r = await DB.prepare(
    'INSERT INTO eleader_l1_usage (uid, day, n) VALUES (?, ?, 1) ON CONFLICT(uid, day) DO UPDATE SET n = n + 1 WHERE n < ?'
  ).bind(uid, day, cap).run();
  return Number(r?.meta?.changes) === 1;
}

export async function handleEleaderL1(request: Request, url: URL, env: L1Env, warm?: WarmEngine, now = () => Date.now()): Promise<Response | null> {
  if (!url.pathname.startsWith(ELEADER_L1_PREFIX)) return null;
  const action = url.pathname.slice(ELEADER_L1_PREFIX.length);
  if (action !== 'books' && action !== 'chat') return reply({ error: 'not_found' }, 404);
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply({ error: 'login_required' }, 401);
  let uid = '';
  try { uid = (await verifyUidToken(auth.slice(7), env as any)) || ''; } catch { uid = ''; }
  if (!uid) return reply({ error: 'login_required' }, 401);
  if (!ELEADER_L1_STUDENTS.has(uid)) return reply({ error: 'l1_not_enrolled' }, 403);
  const day = kstDay(now());

  if (action === 'books') {
    if (request.method !== 'GET') return reply({ error: 'method_not_allowed' }, 405);
    let used: number | null = null;
    try { used = await usedToday(env.DB, uid, day); } catch { used = null; }
    return reply({
      ok: true, subject: uid, course: { ko: 'Level 1 기본과정', en: 'Level 1 Basic Course' },
      daily_cap: ELEADER_L1_DAILY_CAP, used_today: used,
      books: ELEADER_BOOK_UNITS.map(b => ({
        id: b.id, title: b.title, book: b.book,
        questions: b.questions.map(q => ({ question: q.question, hint: q.hint, model: q.model })),
      })),
    });
  }

  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (request.headers.get('Origin') !== url.origin) return reply({ error: 'same_origin_required' }, 403);
  if (!warm) return reply({ error: 'engine_unavailable' }, 503);
  let b: any;
  try { b = await readJson(request, 16384); } catch { return reply({ error: 'invalid_json_body' }, 400); }
  const kickoff = b.kickoff === 1;
  const topic = eleaderL1Topic(b.eleader_book, b.eleader_q, kickoff);
  if (!topic) return reply({ error: 'invalid_question' }, 400);
  const input = typeof b.student_input === 'string' ? b.student_input.trim().slice(0, 600) : '';
  const session = typeof b.session_id === 'string' ? b.session_id.trim().slice(0, 120) : '';
  if (!input || !session) return reply({ error: 'invalid_turn' }, 400);
  let ok = false;
  try { ok = await reserveTurn(env.DB, uid, day, ELEADER_L1_DAILY_CAP); } catch { return reply({ error: 'limit_unavailable' }, 503); }
  if (!ok) return reply({ error: 'daily_cap_reached', cap: ELEADER_L1_DAILY_CAP }, 429);

  const inner: Record<string, unknown> = {
    session_id: session, student_input: input, user_id: uid,
    difficulty: 1, age_group: 'kid', lang: 'en', guided: 1, lesson_topic: topic,
  };
  if (kickoff) inner.kickoff = 1;
  if (b.stream === 1) inner.stream = 1;
  if (typeof b.friend === 'string' && /^[a-z]{1,16}$/.test(b.friend)) inner.friend = b.friend;
  const res = await warm(new Request(new URL('/api/warmup/chat', url), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(inner), signal: request.signal,
  }));
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}
