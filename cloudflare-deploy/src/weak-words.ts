/**
 * 🎯 weak-words.ts — 게임 «약점 단어» 판정 정본 (2026-10-18, 개선안 2순위 ⑥)
 *
 * [왜] game_progress 는 오답·정답을 «누적» 만 한다(src/index.ts 의 UPSERT). 그래서 예전 판정
 *      `wrong_count >= correct_count` 는 한 번 많이 틀린 단어를 «영원히» 약점으로 남겼다.
 *      [잰 것 — 2026-10-18 운영 D1] 지금 약점 116개 중 112개가 마지막 기록이 30일보다 오래됐다.
 *      그 옛 단어가 AI 친구 프롬프트·강사 AI 피드백에 «요즘 자주 틀리는 단어» 로 실렸다.
 *
 * [규칙] ① 판정은 그대로(오답 있음 + 오답 ≥ 정답) ② 마지막으로 본 지 WEAK_RECENT_DAYS 안인 것만
 *        ③ 순서는 «최근에 본 것 먼저», 같으면 «오답이 정답보다 많이 앞선 것» 먼저.
 * ⛔ 오래된 약점을 «다 배웠다» 로 읽지 않는다 — 목록에서 뺄 뿐 기록은 그대로다(DELETE 안 함).
 * ⛔ 이 조각을 쓰는 곳에서 조건을 다시 적지 않는다(한 곳만 고쳐지는 사고).
 * ⚠️ last_seen 이 없는 옛 행은 updated_at 으로, 둘 다 없으면 0(= 창 밖)으로 본다.
 */
export const WEAK_RECENT_DAYS = 60;

const SEEN = 'COALESCE(last_seen, updated_at, 0)';

/** 판정 자체(창 없이) — 아래 두 조각이 함께 쓴다. ⛔ 밖에서 이것만 따로 쓰지 말 것(창이 빠진다). */
const WEAK_CORE = `wrong_count > 0 AND wrong_count >= correct_count`;

/** WHERE 에 덧붙일 조각 — 바인드 1개(weakSince 값)를 받는다. */
export const WEAK_WHERE = `${WEAK_CORE} AND ${SEEN} >= ?`;

/** «창 밖으로 빠진» 약점 — 화면이 「그보다 오래된 약점 N개는 뺐다」를 말할 때만 센다(바인드 1개). */
export const WEAK_OLDER_WHERE = `${WEAK_CORE} AND ${SEEN} < ?`;

/** ORDER BY 조각(앞에 ORDER BY 를 붙이지 않는다). */
export const WEAK_ORDER = `${SEEN} DESC, (wrong_count - correct_count) DESC, wrong_count DESC`;

/** 창의 시작(ms). 이상한 now 면 0 — 창을 없애는 쪽(예전 동작)으로 실패한다. */
export function weakSince(nowMs: number, days: number = WEAK_RECENT_DAYS): number {
  const n = Number(nowMs);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n - Math.max(1, days) * 86400000;
}
