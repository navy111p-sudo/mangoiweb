/**
 * AI 응답 지연 기록 — «학생이 얼마나 기다리는가» 를 우리 쪽에 남긴다.
 *
 * [왜 있나 — 2026-09-11]
 * A.i 친구하기를 써 본 학생 121명 중 **41명(34%)이 딱 한 턴만 주고받고 나갑니다**
 * (D1 ai_friend_chats 전수 실측). 그런데 그것이 «느려서» 인지 «말을 못 꺼내서» 인지
 * 가릴 방법이 없었습니다 — **시스템 지연이 어디에도 안 남기 때문입니다.**
 *
 * ⚠️ warmup_session_log 의 first_reply_at 을 지연으로 읽으면 틀립니다. 그 칸은
 *    warmup-log.ts 13행이 「그 학생이 «첫마디를 뗐는가»」라고 못 박은 대로
 *    **사람이 생각하고 타이핑한 시간**입니다(실측 평균 18.3초·최대 81초).
 * ⛔ Workers 로그로도 못 셉니다 — wrangler.toml 의 head_sampling_rate = 0.05 라
 *    20번 중 19번이 버려지고, 그 파일은 공동 금지구역이라 비율을 못 올립니다
 *    (ai-failure-log.ts 가 같은 이유로 생겼습니다 — 이 모듈은 그 형제입니다).
 *
 * ⛔ 학생 발화·AI 답변은 한 글자도 싣지 않습니다 — «얼마나 걸렸나» 만입니다.
 *    답변 «길이»(chars)는 싣습니다: 길이가 지연을 만드는지 봐야 하는데 그 숫자는
 *    본문이 아닙니다.
 * ⚠️ 실패해도 대화를 죽이지 않습니다 — 부르는 쪽이 try/catch 로 감쌉니다.
 *    감시 장치가 던지면 감시 대상이 그 자리에서 멈춥니다.
 * ⚠️ 이 표는 «턴마다» 쌓입니다(실패 때만 쌓이는 ai_failure_log 와 다릅니다).
 *    실측 기준 전 기간 1,035턴이라 부담이 없지만, 늘어나면 오래된 행을 줄이는 것은
 *    사람이 정할 일입니다.
 */

export type AiLatency = {
  feature: string;      // 어느 기능인가 ('chat-friend' …)
  model: string;        // 실제로 답한 모델 (폴백했으면 그 모델)
  ms: number;           // 요청 도착 ~ 응답 직전 (학생이 기다린 서버 시간)
  model_ms: number;     // 그중 모델 호출에 든 시간 — 나머지는 우리 코드 몫
  tries: number;        // 모델을 몇 번 불렀나 (폴백·재시도 포함)
  chars: number;        // 답변 길이 — ⛔ 본문이 아니라 «길이» 입니다
  level?: string;       // 눈높이 단계 (S1 … S8)
  rf: number;           // response_format(JSON 모드)이 살아 있었나 (1/0)
  ok: number;           // 답을 만들었나 (1/0) — 실패 턴의 지연도 «사실» 이라 남깁니다
};

/** 모델 이름은 길 수 있습니다 — 표를 부풀리지 않게 자릅니다. */
const MODEL_MAX = 80;

/** 시계가 뒤로 갔거나 값이 이상하면 «모름»(-1)으로 둡니다. ⛔ 0 으로 적지 마세요 —
 *  0 은 «즉시 응답» 이라는 뜻이라, 못 잰 것이 «가장 빠른 것» 으로 뒤집힙니다. */
function safeMs(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return -1;
  return Math.round(n);
}

export async function recordAiLatency(env: any, f: AiLatency): Promise<void> {
  if (!env?.DB) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ai_latency_log (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       feature    TEXT NOT NULL,
       model      TEXT,
       ms         INTEGER NOT NULL,
       model_ms   INTEGER NOT NULL,
       tries      INTEGER NOT NULL,
       chars      INTEGER NOT NULL,
       level      TEXT,
       rf         INTEGER NOT NULL,
       ok         INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     )`
  ).run();
  /* ⚠️ 칸을 DEFAULT 에 기대지 않고 «전부 명시» 합니다 — 이 저장소에는 CREATE 가 여러 벌인
     표에서 DEFAULT 가 환경마다 갈려 조용히 NULL 이 되던 전례가 있습니다. */
  await env.DB.prepare(
    `INSERT INTO ai_latency_log (feature, model, ms, model_ms, tries, chars, level, rf, ok, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    String(f.feature || '').slice(0, 40),
    String(f.model || '').slice(0, MODEL_MAX),
    safeMs(f.ms),
    safeMs(f.model_ms),
    Math.max(0, Number(f.tries) || 0),
    Math.max(0, Number(f.chars) || 0),
    f.level ? String(f.level).slice(0, 20) : null,
    Number(f.rf) ? 1 : 0,
    Number(f.ok) ? 1 : 0,
    Date.now()
  ).run();
}
