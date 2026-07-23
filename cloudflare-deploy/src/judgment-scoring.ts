// ═══════════════════════════════════════════════════════════════════════
// 🧮 판단력 채점·성장지수 순수 계산 모듈 (2026-07-23)
//   api-judgment.ts 에서 분리한 이유: 이 계산이 학생에게 보이는 점수이자 관리자 통계의 원천이라
//   **테스트로 고정**해 두어야 합니다. 이 파일은 import 가 하나도 없어 하니스가 그대로 불러 검증합니다.
//     → test-harness/judgment_scoring_harness.mjs
//
//   ⚠️ 이 파일의 상수를 바꾸면 학생 지수와 관리자 스냅샷이 함께 움직입니다.
// ═══════════════════════════════════════════════════════════════════════

/** 판단력 지수 5축 가중치 (설계서 §2.2). */
export const AXIS_WEIGHTS: Record<string, number> = {
  choice: 0.30, reasoning: 0.30, selfcorrection: 0.15, register: 0.15, consistency: 0.10,
};

// 최근 성과 반영 — 단순 누적 평균이면 27번 푼 학생이 100점을 받아도 지수가 0.3점밖에 안 움직여
// "몇 점을 받든 65" 로 보입니다. 반감기 RECENCY_HALF_LIFE 회의 지수가중 평균을 씁니다.
export const RECENCY_HALF_LIFE = 6;   // 6회 전 판단의 가중치 = 최신의 1/2
export const RECENT_WINDOW = 12;      // 자기교정력·일관성을 보는 최근 창

/**
 * 난이도별 도달 가능 상한 — 변별력의 핵심.
 *   쉬운 문제(1)만 전부 맞혀도 선택 축은 80까지입니다. 100을 받으려면 어려운 문제(5)를 맞혀야 합니다.
 *   반대로 쉬운 문제를 틀리면 감점 폭도 더 큽니다(20 → 16).
 *   ⚠️ '난이도를 가중평균의 가중치로만 쓰는 방식'은 모든 문항 난이도가 같으면 가중치가 상쇄돼
 *      아무 효과가 없습니다(무의미). 그래서 점수 자체를 난이도 상한으로 환산합니다.
 */
export const DIFFICULTY_CEILING = [80, 88, 94, 98, 100];

/** 난이도 1~5 정규화. 값이 없으면 보통(3). */
export function normalizeDifficulty(raw: any): number {
  const d = Math.round(+raw);
  return Number.isFinite(d) ? Math.max(1, Math.min(5, d)) : 3;
}

/** 선택 점수를 난이도 상한으로 환산 — 성장 지수 계산에만 씁니다(학생에게 보이는 점수는 원점수 그대로). */
export function difficultyAdjust(score: number, difficulty: any): number {
  const d = normalizeDifficulty(difficulty);
  return Math.round(score * DIFFICULTY_CEILING[d - 1] / 100);
}

/** 오답 선택지가 가질 수 있는 최대 점수 — 정답보다 높거나 비슷해지는 것을 막습니다. */
export const WRONG_OPTION_CAP = 85;

/**
 * 선택지별 적절성 점수 정규화 — 공정성·변별력의 핵심.
 *   기존에는 정답 100 / 오답 일괄 45 라, "거의 맞은 답"과 "완전히 엉뚱한 답"이 같은 점수였습니다.
 *   LLM 이 매긴 선택지별 점수를 쓰되 다음을 보장합니다:
 *     ① 개수가 선택지 수보다 많으면 잘라 맞추고, 모자라면 null(→ 기존 100·45 방식으로 안전 폴백)
 *     ② 오답은 WRONG_OPTION_CAP 이하 — 오답이 정답보다 높게 나오는 역전을 원천 차단
 *     ③ 정답은 항상 최고점
 *   서버가 KV 에 보관한 값과 클라이언트가 되돌려 보낸 값 모두 이 함수를 통과시킵니다.
 */
export function normalizeOptionScores(raw: any, n: number, correctIdx: number): number[] | null {
  if (!Array.isArray(raw) || n < 2 || raw.length < n) return null;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round(+raw[i]);
    if (!Number.isFinite(x)) return null;
    out.push(Math.max(0, Math.min(100, x)));
  }
  if (correctIdx >= 0 && correctIdx < n) {
    for (let i = 0; i < n; i++) if (i !== correctIdx) out[i] = Math.min(out[i], WRONG_OPTION_CAP);
    const otherMax = n > 1 ? Math.max(...out.filter((_, i) => i !== correctIdx)) : 0;
    out[correctIdx] = Math.min(100, Math.max(out[correctIdx], otherMax + 5, 95));
  }
  return out;
}

/** 학생이 고른 선택지의 점수 — option_scores 가 없으면 기존 100·45 방식으로 폴백. */
export function scoreChoice(
  optScores: number[] | null, chosenIdx: number, correctIdx: number | null, isOptimal: boolean,
): number {
  const graded = (optScores && chosenIdx >= 0 && chosenIdx < optScores.length) ? optScores[chosenIdx] : null;
  if (isOptimal) return graded != null ? Math.max(95, graded) : 100;
  if (graded != null) return graded;
  return correctIdx != null ? 45 : 70;
}

export const avg = (arr: number[]): number | null => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
export function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length);
}

/** 배열 끝(=최신)에 가까울수록 큰 가중치를 주는 가중 평균. */
export function recencyAvg(arr: Array<number | null>): number | null {
  let ws = 0, vs = 0;
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (v == null) continue;                                     // 값 없는 회차는 가중치 자리도 차지하지 않음
    const w = Math.pow(0.5, (n - 1 - i) / RECENCY_HALF_LIFE);
    ws += w; vs += w * v;
  }
  return ws > 0 ? vs / ws : null;
}

export interface GrowthAxes {
  events_count: number;
  axis_choice: number | null; axis_reasoning: number | null; axis_selfcorrection: number | null;
  axis_register: number | null; axis_consistency: number | null;
  judgment_index: number | null; top_misconceptions: Array<{ code: string; count: number }>;
  /** 직전 판단까지로 계산한 지수 — 이번 판단으로 몇 점 오르내렸는지 학생에게 보여주기 위함. */
  prev_index?: number | null;
  /** 가장 최근 판단 1건 요약 — 성장 화면의 "이번 판단" 칩. */
  last?: { choice_score: number | null; reasoning_score: number | null; is_optimal: number; created_at: number } | null;
}

/**
 * 판단 기록(judgment_analysis 행, 시간 오름차순) → 5축 + 지수.
 * 순수 함수라 "직전 판단까지"를 재계산하는 데에도 그대로 씁니다(delta 산출).
 */
export function axesFromRows(rows: any[]): GrowthAxes {
  const choiceSeq: Array<number | null> = [], reasoningSeq: Array<number | null> = [], registerSeq: Array<number | null> = [];
  const choiceRaw: number[] = [];
  const miscSeq: Array<string | null> = []; const miscCount = new Map<string, number>();
  for (const r of rows) {
    let feat: any = {}; try { feat = r.reasoning_features_json ? JSON.parse(r.reasoning_features_json) : {}; } catch { feat = {}; }
    const cs = r.choice_score != null ? Number(r.choice_score) : null;
    // 난이도 상한 환산 — 쉬운 문제만 반복해서는 지수 상단에 닿을 수 없게 함
    choiceSeq.push(cs == null ? null : difficultyAdjust(cs, feat.difficulty));
    if (cs != null) choiceRaw.push(cs);
    reasoningSeq.push((feat.has_reasoning && r.reasoning_score != null) ? Number(r.reasoning_score) : null);
    registerSeq.push(feat.register_awareness != null ? Number(feat.register_awareness) : null);
    const mc = r.misconception_tag ? String(r.misconception_tag) : null;
    miscSeq.push(mc);
    if (mc) miscCount.set(mc, (miscCount.get(mc) || 0) + 1);
  }

  // 자기교정력 — "최근 창에서 이미 겪은 오답유형을 또 틀린 비율"의 역수.
  //   ⚠️ 과거 버그: 오답이 담긴 배열만 분모로 써서, 정답을 아무리 맞혀도 점수가 회복되지 않았습니다
  //   (한번 낮아지면 영구 고정). 이제 분모가 최근 판단 '전체'라 정답이 쌓이면 다시 올라갑니다.
  let axisSelf: number | null = null;
  if (rows.length) {
    const cut = Math.max(0, miscSeq.length - RECENT_WINDOW);
    const seen = new Set<string>();
    for (let i = 0; i < cut; i++) { const c = miscSeq[i]; if (c) seen.add(c); }   // 창 이전에 이미 겪은 유형
    let repeated = 0, total = 0;
    for (let i = cut; i < miscSeq.length; i++) {
      total++;
      const c = miscSeq[i];
      if (c) { if (seen.has(c)) repeated++; seen.add(c); }
    }
    axisSelf = total ? Math.round(100 * (1 - repeated / total)) : null;
  }
  // 일관성 — 최근 창 선택 원점수 표준편차의 역(안정적일수록 높음)
  const recentChoice = choiceRaw.slice(-RECENT_WINDOW);
  const axisConsistency = recentChoice.length >= 2 ? Math.max(0, Math.min(100, Math.round(100 - stddev(recentChoice)))) : null;

  const round = (v: number | null) => v == null ? null : Math.round(v);
  const a: GrowthAxes = {
    events_count: rows.length,
    axis_choice: round(recencyAvg(choiceSeq)),
    axis_reasoning: round(recencyAvg(reasoningSeq)),
    axis_selfcorrection: axisSelf,
    axis_register: round(recencyAvg(registerSeq)),
    axis_consistency: axisConsistency,
    judgment_index: null,
    top_misconceptions: [...miscCount.entries()].map(([code, count]) => ({ code, count })).sort((x, y) => y.count - x.count).slice(0, 5),
  };
  // 지수 — 존재하는 축만으로 가중치 재정규화
  const parts: Array<[number, number]> = [];
  if (a.axis_choice != null) parts.push([AXIS_WEIGHTS.choice, a.axis_choice]);
  if (a.axis_reasoning != null) parts.push([AXIS_WEIGHTS.reasoning, a.axis_reasoning]);
  if (a.axis_selfcorrection != null) parts.push([AXIS_WEIGHTS.selfcorrection, a.axis_selfcorrection]);
  if (a.axis_register != null) parts.push([AXIS_WEIGHTS.register, a.axis_register]);
  if (a.axis_consistency != null) parts.push([AXIS_WEIGHTS.consistency, a.axis_consistency]);
  const wSum = parts.reduce((s, [w]) => s + w, 0);
  a.judgment_index = wSum > 0 ? Math.round(parts.reduce((s, [w, v]) => s + w * v, 0) / wSum) : null;
  return a;
}
