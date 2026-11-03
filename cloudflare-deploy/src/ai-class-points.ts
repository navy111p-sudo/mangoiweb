/* 🪙 A.i 선생님 수업 포인트 — 수업을 끝까지 마치면 한 번 (2026-11-03 사장님 지시)
   정본: 금액·조건·판정. 라우트(api-points.ts earn-by-rule)는 이 파일을 «부르기만» 한다.
   import 가 없어 하니스가 그대로 돌린다(test-harness/ai_class_points_harness.mjs).

   규칙: 수업을 끝까지 마치고 별을 1개 이상 받았으면 5P · 하루 1번 · 하루 전체 상한(100점)을 함께 지난다.
   ⚠️ 이 수업은 진행이 학생 화면에서만 돈다 — 서버는 «끝까지 했다» 를 검증할 방법이 없다(화면이 보낸
      별·문항 수를 믿는다). 그 대가로 금액을 작게(5P)·하루 1번으로 묶었다(사장님 승인 2026-11-03).
   ⛔ 모양이 이상한 값(음수·소수·별 > 문항·문항 0)은 주지 않는다 — 1P = 1원이라 «막는 쪽» 이 맞는 실패 방향. */

export const AI_CLASS_POINT_RULE = 'ai_class_done';
export const AI_CLASS_POINT_AMOUNT = 5;
export const AI_CLASS_POINT_DAILY_CAP = 1;
export const AI_CLASS_POINT_MIN_STARS = 1;
const MAX_TARGETS = 300;

/** 줄 수 있는가 — { ok:true, stars, targets } 이거나 { ok:false, error }.
 *  ⚠️ 한 모양으로 둔다 — tsconfig 가 strict 가 아니라 판별 유니온 좁히기가 안 된다(CLAUDE.md 2장). */
export function aiClassPointGate(meta: any): { ok: boolean; error: string | null; stars: number | null; targets: number | null; lesson: string } {
  const m = meta && typeof meta === 'object' ? meta : {};
  const stars = Number(m.stars), targets = Number(m.targets);
  const lesson = String(m.lesson == null ? '' : m.lesson).trim().slice(0, 120);
  if (!Number.isInteger(stars) || !Number.isInteger(targets) || targets < 1 || targets > MAX_TARGETS || stars < 0 || stars > targets) {
    return { ok: false, error: 'bad_result', stars: null, targets: null, lesson };
  }
  if (stars < AI_CLASS_POINT_MIN_STARS) return { ok: false, error: 'no_stars', stars, targets, lesson };
  return { ok: true, error: null, stars, targets, lesson };
}
