/* 🪙 «오늘의 A.i 학습» — 오늘 받은 포인트를 «어느 활동에서» 받았는지로 나눈다 (2026-11-02)
   정본: 활동 키(today-plan.ts 의 TOOLS 키) ↔ 포인트 규칙 코드. 화면은 서버가 나눈 값만 그린다.
   ⛔ 지어내지 않는다 — 규칙 코드로 갈 곳을 모르면 'other'(합계에는 들어가지만 카드에는 안 붙음).
   ⚠️ AI 단어 퀴즈(micro)와 단어장(vocab)은 같은 규칙(vocab_review)을 쓴다 — 단어 퀴즈는 보상 키가
      «mq:» 세션이라 meta 에 ':mq:' 가 남는다(api-games.ts vocab/reward · micro-quiz.html). 그것으로 가른다. */

export type PointRow = { rule_code?: string | null; amount?: number | null; meta?: string | null };

export function toolForRule(code: string | null | undefined, meta: string | null | undefined): string {
  const c = String(code || '');
  if (c === 'vocab_review') return /:mq:/.test(String(meta || '')) ? 'micro' : 'vocab';
  if (c === 'review_quiz_done') return 'review';
  if (/^ai_friend_/.test(c)) return 'friend';
  if (c === 'speech_master') return 'speech';
  if (c === 'judgment_correct') return 'judgment';
  if (/^ai_writing/.test(c)) return 'write';
  if (c === 'rescue_sentence' || c === 'game_score') return 'games';
  return 'other';
}

/** 오늘 적립 줄들 → { total, by_tool }. 금액이 양수인 줄만 센다. */
export function pointsByTool(rows: PointRow[]): { total: number; by_tool: Record<string, number> } {
  const by: Record<string, number> = {};
  let total = 0;
  for (const r of rows || []) {
    const a = Number(r && r.amount);
    if (!(a > 0)) continue;
    total += a;
    const k = toolForRule(r.rule_code, r.meta);
    by[k] = (by[k] || 0) + a;
  }
  return { total, by_tool: by };
}
