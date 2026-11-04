/**
 * 🔁 AI 영어친구 — 모델이 «전부» 실패한 턴을 같은 요청 안에서 한 번 더 시도합니다.
 *    AI friend — when every model fails, try the same turn once more inside the same request.
 *
 * [왜 있나 — 2026-11-04 사장님 「자동 재시도 기능 만들어서 PR 올려줘」]
 *   모델 3개(70B → 8B → 8B)가 모두 에러·빈 답을 주면 화면에
 *   「⚠️ 지금은 답을 만들지 못했어요. 잠시 뒤 다시 보내 주세요.」가 뜹니다(ai_unavailable, 2026-09-09).
 *   사장님 화면(2026-11-04)에서는 그 바로 다음 턴이 정상이었습니다 — «잠깐» 의 실패였다는 뜻이라
 *   조금 기다렸다 다시 부르면 대부분 살아날 것으로 봅니다.
 *   ⚠️ 그것은 «추정» 입니다 — 얼마나 살아나는지는 ai_failure_log 의 'chat-friend-rescued'(살아남)
 *      대 'chat-friend'(끝내 실패) 줄 수로 재세요.
 *
 * ✅ 왜 «화면이 다시 보내기» 가 아니라 «서버 안에서 다시 부르기» 인가
 *   실패한 턴에도 서버는 ① 학생 발화를 ai_friend_chats 에 저장하고 ② 대화 포인트(2P)를 주고
 *   ③ (집중교정·음성 턴) 발음 채점(Azure)을 돌립니다. 화면이 같은 요청을 다시 보내면 셋이 «두 번»
 *   일어납니다 — 기록이 겹쳐 모델이 «학생이 같은 말을 두 번 했다» 로 보고, 포인트가 두 번 나가고,
 *   채점 비용이 두 번 듭니다. 같은 요청 «안» 에서 모델만 다시 부르면 셋 다 한 번입니다.
 *
 * ⏱ 시간 예산 — 그동안 학생은 «입력 중…» 을 봅니다.
 *   · 첫 시도가 이미 오래 걸렸으면(타임아웃류) 다시 하지 않습니다 — 기다림만 두 배가 됩니다.
 *   · 기준 9초 — «답이 아예 없는» 턴을 살리는 것이라 «같은 질문 다시 뽑기»(FRAG_RETRY_BUDGET_MS, 2026-11-05 부터 5초)보다 넉넉히 둡니다.
 *   · «기다린 뒤에도» 예산 안이어야 시작하고, 모델마다 다시 보고 넘으면 거기서 멈춥니다.
 *
 * ⛔ 던지지 않습니다 — 재시도가 대화를 막으면 안 됩니다(못 살리면 예전과 같은 안내로 갑니다).
 * ⛔ 스트리밍을 쓰지 않습니다 — «첫 모델에서 한 번만» 규칙(api-ai.ts)을 그대로 둡니다.
 *    미리 흘려보낸 문장이 있었다면 최종본과 달라지므로 화면이 replaced:1 을 보고 다시 읽습니다.
 * ⛔ 이 파일은 학생 발화·AI 답변을 저장하거나 기록하지 않습니다.
 * ℹ️ import 0 — 하니스가 이 파일을 그대로 실행합니다(test-harness/ai_friend_retry_harness.mjs).
 */

/** 다시 부르기 전에 기다리는 시간 — 혼잡(429·용량 초과)이 풀릴 틈. */
export const FRIEND_RETRY_DELAY_MS = 1500;
/** 턴 시작부터 이 시간을 넘었으면 다시 부르지 않습니다(답이 아예 없는 턴을 살리는 예산 — 다시 뽑기 5초보다 넉넉히). */
export const FRIEND_RETRY_BUDGET_MS = 9000;

/** 지금(턴 시작부터 elapsedMs 지남) 모델을 한 번 더 불러도 되는가.
 *  ⚠️ 모르면(숫자가 아니면) «안 한다» — 예전 동작 그대로가 안전한 쪽입니다. */
export function friendRetryAllowed(elapsedMs: unknown, budgetMs: number = FRIEND_RETRY_BUDGET_MS): boolean {
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return false;
  if (typeof budgetMs !== 'number' || !Number.isFinite(budgetMs)) return false;
  return elapsedMs <= budgetMs;
}

export type FriendRetryResult = {
  reply: string;            // 살아난 답 — 못 살렸으면 ''
  model: string;            // 그 답을 준 모델 — 못 살렸으면 ''
  tried: number;            // 다시 부른 횟수
  skipped: '' | 'budget';   // 시간 예산 때문에 한 번도 못 불렀으면 'budget'
};

/** 모델 목록을 처음부터 한 번 더 돕니다(기다린 뒤). 처음으로 빈 답이 아닌 것을 돌려줍니다.
 *  · call — 모델 하나를 부른다(부르는 쪽의 정본 래퍼: JSON 모드 폴백·지연 집계를 그대로 탄다)
 *  · take — 응답을 답 문장으로 바꾼다(부르는 쪽의 정본 파서 — 생 JSON 이 새지 않게)
 *  · onError — 모델 하나가 던졌을 때(부르는 쪽이 마지막 오류를 기억하게) */
export async function retryFriendModels(o: {
  models: readonly string[];
  startedAt: number;
  call: (model: string) => Promise<unknown>;
  take: (resp: unknown) => string;
  onError?: (model: string, err: unknown) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  delayMs?: number;
  budgetMs?: number;
}): Promise<FriendRetryResult> {
  const out: FriendRetryResult = { reply: '', model: '', tried: 0, skipped: '' };
  try {
    const now = o.now || (() => Date.now());
    const delay = Math.max(0, Number(o.delayMs ?? FRIEND_RETRY_DELAY_MS) || 0);
    const budget = Number(o.budgetMs ?? FRIEND_RETRY_BUDGET_MS);
    const sleep = o.sleep || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    // 기다린 «뒤» 에도 예산 안이어야 시작합니다 — 기다리기만 하고 못 부르면 시간만 버립니다.
    if (!friendRetryAllowed(now() - o.startedAt + delay, budget)) { out.skipped = 'budget'; return out; }
    if (delay > 0) await sleep(delay);
    for (const m of o.models || []) {
      if (!friendRetryAllowed(now() - o.startedAt, budget)) { if (!out.tried) out.skipped = 'budget'; break; }
      out.tried++;
      try {
        const r = o.take(await o.call(m));
        if (typeof r === 'string' && r) { out.reply = r; out.model = m; return out; }
      } catch (e) {
        try { if (o.onError) o.onError(m, e); } catch { /* 기록이 재시도를 막지 않습니다 */ }
      }
    }
  } catch { /* 재시도가 대화를 막지 않습니다 — 예전 안내로 갑니다 */ }
  return out;
}
