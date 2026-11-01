/* 🔎 웜업 교정 «판정 사유» 기록 (2026-10-31 사장님 「교정과 3번 반복이 됐다 안 됐다 한다」 원인 추적).

   왜 필요한가 — 교정 카드가 안 뜬 턴의 이유가 Workers 로그에만 남았는데, 로그는
   head_sampling_rate 0.05 라 20턴 중 19턴은 기록되지 않는다. 그래서 「왜 어떤 턴에서만 빠졌나」를
   사후에 셀 방법이 없었다. 이 표는 턴마다 판정 결과 한 줄을 남긴다.

   ⛔ 학생 발화·교정 문장·AI 답장은 싣지 않는다(미성년자 대화다). 사유 한 단어와 태그만 남긴다.
   ⛔ 기록 실패가 대화를 멈추면 안 된다 — 이 함수는 절대 던지지 않는다.

   reason 의 뜻:
     shown        — 교정 카드(와 3번 반복 대상)가 학생에게 보여졌다
     fix_missing  — 모델이 fix 를 아예 안 보냈다
     fix_rejected — fix 를 보냈지만 검증(verifyWarmupFix)에서 버려졌다
     held_gap     — 검증은 통과했지만 턴 간격 규칙(작은 실수는 두 번째부터 등)으로 이번 턴엔 미뤘다
     mode_hidden  — 보여줄 교정이 있었지만 학생이 고른/학원의 교정 모드에서 가려졌다 */

export type WarmupFixTraceReason = 'shown' | 'fix_missing' | 'fix_rejected' | 'held_gap' | 'mode_hidden';

export const WARMUP_FIX_TRACE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS warmup_fix_trace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'en',
  mode TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
)`;

/* 표 만들기는 한 번만 시도한다(성공이든 실패든). 실패하면 다음 턴에 다시 시도한다. */
let tableReady: Promise<void> | null = null;

export async function logWarmupFixTrace(
  env: any,
  row: { userId: string; sessionId: string; lang: string; mode: string; reason: WarmupFixTraceReason; tag: string },
): Promise<void> {
  try {
    if (!env || !env.DB) return;
    if (!tableReady) {
      tableReady = env.DB.prepare(WARMUP_FIX_TRACE_TABLE_SQL).run().then(() => undefined, (e: any) => { tableReady = null; throw e; });
    }
    await tableReady;
    await env.DB.prepare(
      `INSERT INTO warmup_fix_trace (user_id, session_id, lang, mode, reason, tag, created_at) VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      String(row.userId || '').slice(0, 64), String(row.sessionId || '').slice(0, 64),
      String(row.lang || 'en').slice(0, 8), String(row.mode || '').slice(0, 16),
      row.reason, String(row.tag || '').slice(0, 32), Date.now(),
    ).run();
  } catch (e: any) {
    console.warn('[warmup-fix-trace] skipped:', e?.message || e);
  }
}
