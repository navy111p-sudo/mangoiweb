// ═══════════════════════════════════════════════════════════════════════
// 🎚 level-suggest.ts — «한 단계 올려(내려) 볼까요?» 제안 (2026-10-18, 개선안 2순위 ⑤)
//
//   무엇을 하나
//     AI 친구에서 학생이 «지금 고른 단계» 로 최근 나눈 대화를 보고, 한 단계 위·아래를 «제안» 한다.
//     바꾸는 것은 학생(이 누르는 버튼)이다 — 서버가 몰래 바꾸지 않는다.
//
//   왜 «제안» 인가
//     ⛔ 자동 승급·강등의 기준(몇 단어·몇 % 교정이면 올리나)은 아직 사람이 정하지 않았다.
//        레벨테스트 판정 기준도 «사람 결정 대기» 다(docs/작업기록/260922_레벨계산규칙_잰것과_결론.md).
//        그래서 아래 숫자는 «잠정값» 이고, 틀려도 학생이 «그대로» 를 누르면 끝이다(되돌리기 쉬운 쪽).
//     ⛔ 근거가 모자라면 아무 말도 안 한다(MIN_TURNS) — 서너 마디로 단계를 말하면 지어내는 것이다.
//     ⛔ 한 번에 한 단계만.
//     ⛔ 학생이 답한 뒤(올림·그대로) COOLDOWN_DAYS 동안은 다시 묻지 않는다 — 매번 물으면 잔소리다.
//
//   근거(최근 WINDOW_DAYS 일, «지금 단계로» 말한 것만)
//     ① 학생 한 마디의 평균 낱말 수(영어 낱말만 센다)
//     ② 뜻이 달라지는 교정(major)을 받은 비율 = major 교정 수 / 학생 마디 수
//
//   ⚠️ 이 파일은 import 가 없다 — 하니스가 타입만 벗겨 그대로 돌린다.
//   ⛔ 던지지 않는다 — 조회가 실패하면 «제안 없음».
// ═══════════════════════════════════════════════════════════════════════

export const LEVEL_ORDER = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'] as const;
export const SUGGEST_WINDOW_DAYS = 14;
export const SUGGEST_MIN_TURNS = 12;
export const SUGGEST_COOLDOWN_DAYS = 7;
/** 올림: 평균 낱말 수가 «그 단계 AI 문장 목표» 의 이 비율 이상 + major 교정 비율이 이 값 이하 */
export const UP_WORDS_RATIO = 0.7;
export const UP_MAX_MAJOR_RATE = 0.15;
/** 내림: major 교정 비율이 이 값 이상이거나, 평균 낱말 수가 이 값 미만 */
export const DOWN_MIN_MAJOR_RATE = 0.4;
export const DOWN_MAX_AVG_WORDS = 2;
const DAY_MS = 86400000;

export const LEVEL_SUGGEST_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS level_suggest_log (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id     TEXT NOT NULL,
     tool        TEXT NOT NULL,
     from_level  TEXT NOT NULL,
     to_level    TEXT NOT NULL,
     decision    TEXT NOT NULL,
     avg_words   REAL,
     major_rate  REAL,
     turns       INTEGER,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_level_suggest_user ON level_suggest_log (user_id, tool, created_at)`,
];

export type SuggestEvidence = { turns: number; avgWords: number; majorRate: number };
export type LevelSuggestion = { from: string; to: string; dir: 'up' | 'down'; evidence: SuggestEvidence };

/** 영어 낱말 수 — 한글·숫자만 있는 마디는 0 */
export function englishWordCount(s: any): number {
  const m = String(s == null ? '' : s).match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
  return m ? m.length : 0;
}

/** 순수 판정. wordsTarget 은 단계별 «AI 문장 목표 낱말 수»(S8 처럼 0 이면 올림 없음). */
export function decideLevelSuggestion(
  level: any, ev: SuggestEvidence | null | undefined, wordsTarget: Record<string, number>,
): LevelSuggestion | null {
  const i = (LEVEL_ORDER as readonly string[]).indexOf(String(level));
  if (i < 0 || !ev) return null;
  const turns = Number(ev.turns), avg = Number(ev.avgWords), rate = Number(ev.majorRate);
  if (!isFinite(turns) || !isFinite(avg) || !isFinite(rate)) return null;
  if (turns < SUGGEST_MIN_TURNS) return null;
  const evidence = { turns, avgWords: Math.round(avg * 10) / 10, majorRate: Math.round(rate * 100) / 100 };
  // 내림이 먼저 — 힘들어하는 학생을 놓치는 쪽이 더 나쁘다
  if (i > 0 && (rate >= DOWN_MIN_MAJOR_RATE || avg < DOWN_MAX_AVG_WORDS)) {
    return { from: LEVEL_ORDER[i], to: LEVEL_ORDER[i - 1], dir: 'down', evidence };
  }
  const target = Number(wordsTarget && wordsTarget[LEVEL_ORDER[i]]);
  if (i < LEVEL_ORDER.length - 1 && isFinite(target) && target > 0
      && avg >= target * UP_WORDS_RATIO && rate <= UP_MAX_MAJOR_RATE) {
    return { from: LEVEL_ORDER[i], to: LEVEL_ORDER[i + 1], dir: 'up', evidence };
  }
  return null;
}

/** 근거 모으기 — 실패하면 null(던지지 않음). */
export async function loadSuggestEvidence(db: any, uid: any, level: string, nowMs: number): Promise<SuggestEvidence | null> {
  try {
    const u = String(uid || '');
    if (!u || !db) return null;
    const since = nowMs - SUGGEST_WINDOW_DAYS * DAY_MS;
    const rs = await db.prepare(
      `SELECT content FROM ai_friend_chats WHERE student_uid = ? AND role = 'user' AND level = ? AND created_at >= ? ORDER BY id DESC LIMIT 200`
    ).bind(u, level, since).all();
    const rows: any[] = (rs && rs.results) || [];
    if (!rows.length) return { turns: 0, avgWords: 0, majorRate: 0 };
    const words = rows.map(r => englishWordCount(r.content));
    const avgWords = words.reduce((a, b) => a + b, 0) / rows.length;
    let major = 0;
    try {
      const f = await db.prepare(
        `SELECT COUNT(*) AS n FROM ai_friend_fix_log WHERE user_id = ? AND severity = 'major' AND created_at >= ?`
      ).bind(u, since).first();
      major = Number((f && f.n) || 0);
    } catch { return null; }            // 교정 기록을 못 읽으면 «모름» — 올림을 잘못 권하지 않게
    return { turns: rows.length, avgWords, majorRate: Math.min(1, major / rows.length) };
  } catch { return null; }
}

/** 최근에 답한 적이 있나 — 있으면 다시 묻지 않는다. 못 읽으면 true(묻지 않는 쪽). */
export async function recentlyAnswered(db: any, uid: any, tool: string, nowMs: number): Promise<boolean> {
  try {
    for (const q of LEVEL_SUGGEST_DDL) await db.prepare(q).run();
    const r = await db.prepare(
      `SELECT 1 AS x FROM level_suggest_log WHERE user_id = ? AND tool = ? AND created_at >= ? LIMIT 1`
    ).bind(String(uid || ''), tool, nowMs - SUGGEST_COOLDOWN_DAYS * DAY_MS).first();
    return !!r;
  } catch { return true; }
}

/** 학생의 답(올림·내림을 받아들임 / 그대로)을 남긴다. 실패하면 false. */
export async function recordSuggestAnswer(db: any, uid: any, tool: string, s: { from: any; to: any; decision: any; evidence?: any }, nowMs: number): Promise<boolean> {
  try {
    const from = String(s.from || ''), to = String(s.to || ''), dec = String(s.decision || '');
    const fi = (LEVEL_ORDER as readonly string[]).indexOf(from), ti = (LEVEL_ORDER as readonly string[]).indexOf(to);
    if (fi < 0 || ti < 0 || Math.abs(fi - ti) !== 1) return false;     // 한 단계짜리 제안만
    if (dec !== 'accept' && dec !== 'dismiss') return false;
    for (const q of LEVEL_SUGGEST_DDL) await db.prepare(q).run();
    const e = s.evidence || {};
    const num = (v: any) => { const x = Number(v); return isFinite(x) ? x : null; };
    await db.prepare(
      `INSERT INTO level_suggest_log (user_id, tool, from_level, to_level, decision, avg_words, major_rate, turns, created_at) VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(String(uid || ''), tool, from, to, dec, num(e.avgWords), num(e.majorRate), num(e.turns), nowMs).run();
    return true;
  } catch { return false; }
}
