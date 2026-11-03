/* 🪙 교재 낱말 쓰기 숙제 포인트 — 한 판을 끝까지 마치면 한 번 (2026-11-03 사장님 지시)
   정본: 금액·조건·판정. 라우트(api-points.ts earn-by-rule)는 이 파일을 «부르기만» 한다.
   import 가 없어 하니스가 그대로 돌린다(test-harness/scene_words_points_harness.mjs).

   규칙: 숙제 한 판(«어려웠던 표현 다시 도전» 판 제외)을 끝까지 마치고 1개 이상 맞혔으면
         5P · 하루 1번 · 하루 전체 상한(100점)을 함께 지난다.
   ⚠️ 진행이 학생 화면에서만 돈다 — 서버는 «끝까지 했다» 를 검증할 방법이 없다(화면이 보낸
      문항·정답 수를 믿는다). 그 대가로 금액을 작게(5P)·하루 1번으로 묶었다(사장님 승인 2026-11-03).
   ⛔ 모양이 이상한 값(음수·소수·정답 > 문항·문항 0)은 주지 않는다 — 1P = 1원이라 «막는 쪽» 이 맞는 실패 방향. */

export const SCENE_WORDS_POINT_RULE = 'scene_words_done';
export const SCENE_WORDS_POINT_AMOUNT = 5;
export const SCENE_WORDS_POINT_DAILY_CAP = 1;
export const SCENE_WORDS_POINT_MIN_CORRECT = 1;
const MAX_ITEMS = 100;

/** 줄 수 있는가 — { ok:true, correct, items } 이거나 { ok:false, error }.
 *  ⚠️ 한 모양으로 둔다 — tsconfig 가 strict 가 아니라 판별 유니온 좁히기가 안 된다(CLAUDE.md 2장). */
export function sceneWordsPointGate(meta: any): { ok: boolean; error: string | null; correct: number | null; items: number | null; book: string } {
  const m = meta && typeof meta === 'object' ? meta : {};
  const correct = Number(m.correct), items = Number(m.items);
  const book = String(m.book == null ? '' : m.book).trim().slice(0, 80);
  if (!Number.isInteger(correct) || !Number.isInteger(items) || items < 1 || items > MAX_ITEMS || correct < 0 || correct > items) {
    return { ok: false, error: 'bad_result', correct: null, items: null, book };
  }
  if (correct < SCENE_WORDS_POINT_MIN_CORRECT) return { ok: false, error: 'no_correct', correct, items, book };
  return { ok: true, error: null, correct, items, book };
}
