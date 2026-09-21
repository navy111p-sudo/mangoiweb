/**
 * AI 실패 기록 — «왜 답을 못 만들었나» 를 우리 쪽에 남긴다.
 *
 * [왜 있나 — 2026-09-09]
 * 사장님 「아직도 아바타가 내 말을 이해못하고 이상한 주제로 질문해」의 원인을 찾으려고
 * Workers 로그를 뒤졌는데 **한 줄도 없었습니다.** `wrangler.toml` 이
 * `head_sampling_rate = 0.05` 라 요청의 5% 만 로그에 남기기 때문입니다
 * (대시보드 실측: 목록이 22:41 → 22:32 로 건너뜀. 그 사이가 사장님 세션이었습니다).
 * ⛔ 그 비율을 올려서 풀 수 없습니다 — `wrangler.toml` 은 공동 금지구역입니다.
 * ✅ 그래서 «실패한 그 순간에» 사유를 D1 에 남깁니다. 읽는 것은 SELECT 한 줄입니다.
 *
 * ⛔ 학생 발화·AI 답변은 한 글자도 싣지 않습니다 — 무엇이·왜 실패했나만입니다.
 *    (이 표는 진단용이고 개인정보를 담는 곳이 아닙니다.)
 * ⚠️ 폴백은 드뭅니다(2026-09-09 실측: 그날 AI 답 35건 중 2건) — 표가 커질 일이 없습니다.
 *    다만 모델이 오래 죽어 있으면 대화 수만큼 쌓입니다. 그것도 «사실» 이라 그대로 둡니다.
 */

export type AiFailure = {
  feature: string;      // 어느 기능인가 ('chat-friend' …)
  models: string;       // 시도한 모델 목록
  err: string;          // 마지막 예외 문장 — 이것이 우리가 보려던 값
  rf: number;           // response_format(JSON 모드)이 켜져 있었나 (1/0)
  plain: number;        // 모델이 «평문» 을 준 횟수
  empty: number;        // 빈 응답 횟수
  level?: string;       // 눈높이 단계 (S1 … S8)
};

/** 오류 문장은 길 수 있습니다 — 표를 부풀리지 않게 자릅니다. */
const ERR_MAX = 400;

export async function recordAiFailure(env: any, f: AiFailure): Promise<void> {
  if (!env?.DB) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ai_failure_log (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       feature    TEXT NOT NULL,
       models     TEXT,
       err        TEXT,
       rf         INTEGER,
       plain      INTEGER,
       empty      INTEGER,
       level      TEXT,
       created_at INTEGER NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    `INSERT INTO ai_failure_log (feature, models, err, rf, plain, empty, level, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(
    String(f.feature || '').slice(0, 40),
    String(f.models || '').slice(0, 200),
    String(f.err || '').slice(0, ERR_MAX),
    Number(f.rf) ? 1 : 0,
    Number(f.plain) || 0,
    Number(f.empty) || 0,
    f.level ? String(f.level).slice(0, 20) : null,
    Date.now()
  ).run();
}
