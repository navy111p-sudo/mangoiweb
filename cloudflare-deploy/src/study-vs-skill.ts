// ═══════════════════════════════════════════════════════════════════════
// 📊 study-vs-skill.ts — «한 것(공부량)» 과 «해낸 것(실력)» 을 따로 (2026-10-10, 경쟁사 분석 적용 ④)
//
//   무엇을 하나
//     학부모 대시보드(parent.html)에 지난 30일을 두 칸으로 보여 준다.
//       · 한 것   — 화상수업에 들어온 날 · A.i 친구에게 말한 횟수 · 웜업 횟수 · 단어 복습 횟수
//       · 해낸 것 — 넣은 지 7일 넘게 지나서도 맞힌 단어 · 고친 문장을 다시 바르게(정확도 80+) 말한 수
//
//   규칙
//     ⛔ «한 것» 의 숫자(시간·횟수·게임 점수)를 «실력» 이라고 부르지 않는다 — 그래서 칸을 나눈다.
//     ⛔ 지어내지 않는다 — 셀 수 없으면 null(«모름»). 0 과 null 은 다른 사실이고 화면도 다르게 말한다.
//        «7일 뒤 기억» 은 vocab_review_log 의 «맞힘» 이 그 단어를 넣은 때(vocabulary.created_at)보다
//        REMEMBER_DAYS 일 넘게 뒤일 때만 센다. 넣은 날 바로 맞힌 것은 «기억» 이 아니라 «방금 본 것» 이다.
//     ⚠️ «고친 문장» 은 fix-cards.ts(①) 정본을 그대로 쓴다 — 판정을 복제하지 않는다.
//     ⚠️ 쌍둥이 계정(X ↔ mangoai_X, 이름까지 같을 때만)은 함께 센다(③·⑤ 와 같은 규칙). 고친 문장은
//        fix-cards 가 로그인 계정만 보므로 그 칸만 로그인 계정 기준이다.
//     ⚠️ 출석은 «실제로 들어온» 행만(last_seen_at > 0) — 카페24 예약 씨앗 행은 실접속이 아니다(CLAUDE.md 2장).
//        계정은 account_uid 와 user_id 두 칸을 함께 본다(attendance-uid.ts 와 같은 뜻).
//     ⚠️ 읽기 전용이고 던지지 않는다 — 조회 하나가 실패하면 그 칸만 null.
// ═══════════════════════════════════════════════════════════════════════
import { resolveStudentTwins } from './student-alias';
import { loadFixCards } from './fix-cards';

const DAY_MS = 86400000;
export const STUDY_DAYS = 30;
export const REMEMBER_DAYS = 7;
export const SAID_RIGHT_ACC = 80;
const EXAMPLE_WORDS = 3;

export type StudyVsSkill = {
  days: number;
  study: { class_days: number | null; friend_talks: number | null; warmups: number | null; vocab_reviews: number | null };
  skill: { remembered_words: number | null; remembered_examples: string[]; fixed_said_right: number | null; fixed_total: number | null };
};

/** 고친 문장 카드 → (다시 바르게 말한 수, 전체 수). 순수 함수. */
export function countSaidRight(cards: any[]): { right: number; total: number } {
  const list = Array.isArray(cards) ? cards : [];
  let right = 0;
  for (const c of list) {
    const a = c ? Number(c.best_accuracy) : NaN;
    if (c && c.best_accuracy != null && Number.isFinite(a) && a >= SAID_RIGHT_ACC) right++;
  }
  return { right, total: list.length };
}

/** 쌍둥이까지 더한 계정 목록(내 계정 먼저). 던지지 않는다. */
async function idsOf(db: any, uid: string): Promise<string[]> {
  let tw: string[] = [];
  try { tw = await resolveStudentTwins(db, uid); } catch { tw = []; }
  const t = tw.find((x) => x && x !== uid);
  return t ? [uid, t] : [uid];
}

async function countOf(db: any, sql: string, binds: any[]): Promise<number | null> {
  try {
    const r: any = await db.prepare(sql).bind(...binds).first();
    if (!r || r.n == null) return null;
    const n = Number(r.n);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

/** 학부모 대시보드용 — 부르는 쪽이 «자녀 토큰 + 비밀번호» 게이트를 통과시킨 뒤에만. 던지지 않는다. */
export async function loadStudyVsSkill(db: any, uid: string, nowMs: number): Promise<StudyVsSkill | null> {
  const u = String(uid || '').trim();
  if (!u || !db) return null;
  const since = nowMs - STUDY_DAYS * DAY_MS;
  const ids = await idsOf(db, u);
  const ph = ids.length === 2 ? '(?, ?)' : '(?)';

  const class_days = await countOf(db,
    `SELECT COUNT(DISTINCT date(joined_at / 1000, 'unixepoch', '+9 hours')) AS n FROM attendance
      WHERE (account_uid IN ${ph} OR user_id IN ${ph}) AND joined_at >= ? AND last_seen_at > 0`,
    [...ids, ...ids, since]);
  const friend_talks = await countOf(db,
    `SELECT COUNT(*) AS n FROM ai_friend_chats WHERE student_uid IN ${ph} AND role = 'user' AND created_at >= ?`,
    [...ids, since]);
  const warmups = await countOf(db,
    `SELECT COUNT(*) AS n FROM warmup_session_log WHERE user_id IN ${ph} AND started_at >= ?`,
    [...ids, since]);
  const vocab_reviews = await countOf(db,
    `SELECT COUNT(*) AS n FROM vocab_review_log WHERE user_id IN ${ph} AND reviewed_at >= ?`,
    [...ids, since]);

  // «7일 넘게 지나서도 맞힌 단어» — 단어는 그 학생 것이어야 하고(v.user_id = l.user_id), 맞힘이 넣은 뒤 REMEMBER_DAYS 일 넘게 뒤.
  let remembered_words: number | null = null;
  let remembered_examples: string[] = [];
  try {
    const rs: any = await db.prepare(
      `SELECT v.id AS id, v.word AS word, MAX(l.reviewed_at) AS last_at
         FROM vocab_review_log l JOIN vocabulary v ON v.id = l.vocab_id AND v.user_id = l.user_id
        WHERE l.user_id IN ${ph} AND l.correct = 1 AND l.reviewed_at >= ?
          AND l.reviewed_at >= v.created_at + ?
        GROUP BY v.id ORDER BY last_at DESC`
    ).bind(...ids, since, REMEMBER_DAYS * DAY_MS).all();
    const rows: any[] = (rs && rs.results) || [];
    remembered_words = rows.length;
    remembered_examples = rows.map((r) => String(r.word || '').trim()).filter(Boolean).slice(0, EXAMPLE_WORDS);
  } catch { remembered_words = null; remembered_examples = []; }

  let fixed_said_right: number | null = null, fixed_total: number | null = null;
  try {
    const fc = await loadFixCards(db, u, nowMs);
    const cards = (fc && fc.cards) || [];
    const askedAny = !!(fc && fc.sources && (fc.sources.lesson || fc.sources.warmup));
    // 카드가 없으면 연습 조회를 안 해서 practice=false 다 — 그때 0/0 은 «모름» 이 아니라 사실이다.
    const practiceKnown = cards.length === 0 || !!(fc && fc.sources && fc.sources.practice);
    if (askedAny && practiceKnown) {
      const c = countSaidRight(cards);
      fixed_said_right = c.right; fixed_total = c.total;
    }
  } catch { fixed_said_right = null; fixed_total = null; }

  return {
    days: STUDY_DAYS,
    study: { class_days, friend_talks, warmups, vocab_reviews },
    skill: { remembered_words, remembered_examples, fixed_said_right, fixed_total },
  };
}
