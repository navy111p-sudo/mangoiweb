// ═══════════════════════════════════════════════════════════════════════
// 🗓 student-goal.ts — 4주 목표 (2026-10-10, 경쟁사 분석 적용 ③)
//
//   무엇을 하나
//     강사가 학생마다 «4주 목표» 하나를 고른다(보기 6개 중). 그 목표는
//       · 학생 «오늘의 A.i 학습» 과 학부모 화면에 한 줄 + 진행도로 보이고
//       · A.i 친구 대화가 그 목표를 연습할 기회를 «자연스럽게» 만든다(학생이 꺼낸 얘기를 먼저 따라간다).
//
//   규칙
//     ⛔ 목표는 사람(강사)이 정한다 — AI 가 정하면 화면마다 다른 말을 한다(보고서 «주의»).
//     ⛔ 보기 밖의 목표를 받지 않는다 — 모르는 key 는 거절. 자유 입력을 받으면 학부모 화면에
//        검토 안 된 글이 그대로 나간다.
//     ⛔ 진행도를 지어내지 않는다 — «28일 중 N일째» 와 «목표를 정한 뒤 실제로 한 연습 횟수»
//        (A.i 친구에게 말한 횟수·웜업 횟수)만 센다. «목표 달성률» 같은 숫자는 잴 방법이 없어 안 만든다.
//     ⚠️ 학생 하나에 활성 목표는 하나. 새로 정하면 앞 것은 'replaced' 로 남긴다(지우지 않는다 — 이력).
//     ⚠️ 읽기 조회는 던지지 않는다(표가 없거나 실패하면 «목표 없음»). 화면 하나를 막지 않는다.
//     ⚠️ uid 는 정확일치(Kim/kim 은 다른 계정).
// ═══════════════════════════════════════════════════════════════════════
import { selectInChunks } from './d1-chunk';

export const GOAL_DAYS = 28;
const DAY_MS = 86400000;

export type GoalDef = { key: string; ko: string; en: string; hint: string };

/** 보기 6개 — 강사가 이 중 하나를 고른다. hint 는 A.i 친구에게 주는 영어 지시(학생에게는 안 보임). */
export const GOALS: GoalDef[] = [
  { key: 'past_tense',     ko: '과거형으로 지난 일 이야기하기',   en: 'Talk about past events (past tense)',
    hint: 'give the student chances to tell what they did (yesterday, last weekend) using the past tense' },
  { key: 'full_sentences', ko: '완전한 문장으로 대답하기',         en: 'Answer in full sentences',
    hint: 'gently invite the student to answer in a full sentence (subject + verb), not one word' },
  { key: 'ask_questions',  ko: '내가 먼저 질문하기',               en: 'Ask questions back',
    hint: 'invite the student to ask YOU questions too, and praise them when they do' },
  { key: 'describe',       ko: '사람·물건 묘사하기',               en: 'Describe people and things',
    hint: 'give the student chances to describe people, animals or things with adjectives' },
  { key: 'likes_because',  ko: '좋아하는 것과 이유 말하기',         en: 'Say what I like and why (because)',
    hint: 'ask why the student likes something, so they practice answering with "because"' },
  { key: 'future_plans',   ko: '앞으로의 계획 말하기',             en: 'Talk about future plans (will / going to)',
    hint: 'give the student chances to talk about plans using "will" or "going to"' },
];

export function goalByKey(k: unknown): GoalDef | null {
  const s = String(k == null ? '' : k).trim();
  return GOALS.find((g) => g.key === s) || null;
}

export type GoalView = {
  key: string; ko: string; en: string;
  set_at: number; ends_at: number;
  day: number;          // 오늘이 몇 일째인가(1부터, 최대 GOAL_DAYS)
  days: number;         // GOAL_DAYS
  set_by_name: string;
};

/** 행 → 화면용(순수 함수). 모르는 key·끝난 목표면 null. */
export function goalView(row: any, nowMs: number): GoalView | null {
  if (!row) return null;
  const g = goalByKey(row.goal_key);
  if (!g) return null;
  const setAt = Number(row.set_at) || 0, endsAt = Number(row.ends_at) || 0;
  if (!setAt || !endsAt || nowMs >= endsAt || String(row.status || 'active') !== 'active') return null;
  const day = Math.min(GOAL_DAYS, Math.max(1, Math.floor((nowMs - setAt) / DAY_MS) + 1));
  return { key: g.key, ko: g.ko, en: g.en, set_at: setAt, ends_at: endsAt, day, days: GOAL_DAYS,
           set_by_name: String(row.set_by_name || '').slice(0, 60) };
}

/** A.i 친구에게 줄 한 줄(순수 함수). 목표가 없으면 ''. ⚠️ 학생이 꺼낸 얘기를 먼저 따라가라는 규칙을 깨지 않게 «기회가 될 때» 로만. */
export function goalPromptLine(v: GoalView | null): string {
  if (!v) return '';
  const g = goalByKey(v.key);
  if (!g) return '';
  return `\nThe student's teacher set a 4-week goal: "${g.en}". When it fits naturally, ${g.hint}. Never force it — following what the student says still comes first.`;
}

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS student_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, goal_key TEXT NOT NULL,
  set_by TEXT, set_by_name TEXT, set_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active')`;

export async function ensureGoalTable(db: any): Promise<void> {
  await db.prepare(CREATE_SQL).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_student_goals_uid ON student_goals(student_uid, status)`).run();
}

/** 여러 학생의 활성 목표 — 던지지 않는다(표가 없으면 빈 Map). */
export async function loadActiveGoals(db: any, uids: string[], nowMs: number): Promise<Map<string, GoalView>> {
  const out = new Map<string, GoalView>();
  const list = [...new Set((uids || []).map((u) => String(u || '').trim()).filter(Boolean))];
  if (!list.length || !db) return out;
  try {
    const rows = await selectInChunks<any>(db, list,
      (ph) => `SELECT student_uid, goal_key, set_by_name, set_at, ends_at, status FROM student_goals
                WHERE student_uid IN (${ph}) AND status = 'active' AND ends_at > ?
                ORDER BY set_at DESC`,
      { tail: [nowMs] });
    for (const r of rows) {
      const u = String(r.student_uid || '');
      if (!u || out.has(u)) continue;          // 가장 최근 것 하나
      const v = goalView(r, nowMs);
      if (v) out.set(u, v);
    }
  } catch { /* 표가 아직 없거나 조회 실패 — 목표 없음 */ }
  return out;
}

export async function loadActiveGoal(db: any, uid: string, nowMs: number): Promise<GoalView | null> {
  return (await loadActiveGoals(db, [uid], nowMs)).get(String(uid || '').trim()) || null;
}

/** 목표를 정한 뒤 실제로 한 연습 — 셀 수 없으면 null(0 으로 위장하지 않는다). 던지지 않는다. */
export async function loadGoalPractice(db: any, uid: string, sinceMs: number): Promise<{ friend: number | null; warmup: number | null }> {
  const res = { friend: null as number | null, warmup: null as number | null };
  try {
    const r: any = await db.prepare(
      `SELECT COUNT(*) AS n FROM ai_friend_chats WHERE student_uid = ? AND role = 'user' AND created_at >= ?`
    ).bind(uid, sinceMs).first();
    if (r && r.n != null) res.friend = Number(r.n) || 0;
  } catch { /* 모름 */ }
  try {
    const r: any = await db.prepare(
      `SELECT COUNT(*) AS n FROM warmup_session_log WHERE user_id = ? AND started_at >= ?`
    ).bind(uid, sinceMs).first();
    if (r && r.n != null) res.warmup = Number(r.n) || 0;
  } catch { /* 모름 */ }
  return res;
}

/**
 * 목표 정하기·지우기. key 가 '' 이면 지우기(활성 목표를 'cleared').
 * 부르는 쪽이 «이 사람이 이 학생의 강사인가» 를 먼저 확인해야 한다.
 * ⚠️ 끝내기와 새로 넣기를 한 batch 로 — 하나만 되면 활성 목표가 둘이 되거나 하나도 없어진다.
 */
export async function setStudentGoal(db: any, a: { uid: string; key: string; by: string; byName: string; nowMs: number }):
  Promise<{ ok: true; goal: GoalView | null } | { ok: false; error: string }> {
  const uid = String(a.uid || '').trim();
  if (!uid) return { ok: false, error: 'student_uid_required' };
  const key = String(a.key || '').trim();
  const g = key ? goalByKey(key) : null;
  if (key && !g) return { ok: false, error: 'unknown_goal' };
  await ensureGoalTable(db);
  const endOld = db.prepare(`UPDATE student_goals SET status = ? WHERE student_uid = ? AND status = 'active'`)
    .bind(g ? 'replaced' : 'cleared', uid);
  if (!g) { await endOld.run(); return { ok: true, goal: null }; }
  const endsAt = a.nowMs + GOAL_DAYS * DAY_MS;
  const ins = db.prepare(`INSERT INTO student_goals (student_uid, goal_key, set_by, set_by_name, set_at, ends_at, status)
                          VALUES (?, ?, ?, ?, ?, ?, 'active')`)
    .bind(uid, g.key, String(a.by || '').slice(0, 80), String(a.byName || '').slice(0, 80), a.nowMs, endsAt);
  await db.batch([endOld, ins]);
  return { ok: true, goal: goalView({ goal_key: g.key, set_by_name: a.byName, set_at: a.nowMs, ends_at: endsAt, status: 'active' }, a.nowMs) };
}
