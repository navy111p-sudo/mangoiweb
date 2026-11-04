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
     mode_hidden  — 보여줄 교정이 있었지만 학생이 고른/학원의 교정 모드에서 가려졌다

   ➕ (2026-11-04 사장님 「웜업 쪽도 내일 같이 재봐줘」) 같은 한 줄에 네 칸을 더 싣는다 — 쓰기 횟수는 그대로 한 번.
     opener_turn — on(첫마디 줄이 실린 턴) · rest(쉬는 턴) · first(세션 첫 답) · off(중국어·엘리더잼 예시형)
     start_kind  — 최종 답장의 시작이 fix(교정 앞머리) · praise(칭찬) · opener(첫마디) · other
     start_word  — 그 시작 말을 «우리 목록의 말» 로만(목록 밖이면 '') — 답장 본문이 아니다(정본 src/warmup-reply-start.ts)
     grade       — 정직한 칭찬 등급(perfect · partial · incomplete · '') — «틀린 문장에 칭찬이 남았나» 를 서버 판정으로 잰다
   ⚠️ 옛 표에는 그 네 칸이 없다 — 처음 한 번 «칸 없음» 오류가 나면 그때만 ALTER 하고 다시 넣는다(평소엔 왕복이 늘지 않는다).
      ALTER 가 끝내 안 되면 예전 일곱 칸만 넣는다(그 칸 때문에 판정 사유 기록이 통째로 죽지 않게). */

export type WarmupFixTraceReason = 'shown' | 'fix_missing' | 'fix_rejected' | 'held_gap' | 'mode_hidden';

export const WARMUP_FIX_TRACE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS warmup_fix_trace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'en',
  mode TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  opener_turn TEXT NOT NULL DEFAULT '',
  start_kind TEXT NOT NULL DEFAULT '',
  start_word TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT ''
)`;

/** 옛 표에 나중에 붙이는 칸(위 CREATE 의 마지막 넷과 같아야 한다). */
const EXTRA_COLS = ['opener_turn', 'start_kind', 'start_word', 'grade'] as const;

/* 표 만들기는 한 번만 시도한다(성공이든 실패든). 실패하면 다음 턴에 다시 시도한다. */
let tableReady: Promise<void> | null = null;
/* 네 칸을 함께 넣을 수 있나 — null 모름 · true 됨 · false 이 인스턴스에선 옛 일곱 칸만(ALTER 도 안 됐다). */
let extraOk: boolean | null = null;
let extraReady: Promise<void> | null = null;
function ensureExtraCols(db: any): Promise<void> {
  if (!extraReady) {
    extraReady = (async () => {
      for (const c of EXTRA_COLS) {
        // 이미 있으면 «duplicate column» 으로 실패한다 — 그것이 정상이라 삼킨다(다른 워커가 먼저 붙였을 수 있다).
        try { await db.prepare(`ALTER TABLE warmup_fix_trace ADD COLUMN ${c} TEXT NOT NULL DEFAULT ''`).run(); } catch {}
      }
    })();
  }
  return extraReady;
}
const isMissingCol = (e: any) => /no column named|no such column|has no column/i.test(String((e && e.message) || e || ''));

export async function logWarmupFixTrace(
  env: any,
  row: {
    userId: string; sessionId: string; lang: string; mode: string; reason: WarmupFixTraceReason; tag: string;
    openerTurn?: string; startKind?: string; startWord?: string; grade?: string;
  },
): Promise<void> {
  try {
    if (!env || !env.DB) return;
    if (!tableReady) {
      tableReady = env.DB.prepare(WARMUP_FIX_TRACE_TABLE_SQL).run().then(() => undefined, (e: any) => { tableReady = null; throw e; });
    }
    await tableReady;
    const base = [
      String(row.userId || '').slice(0, 64), String(row.sessionId || '').slice(0, 64),
      String(row.lang || 'en').slice(0, 8), String(row.mode || '').slice(0, 16),
      row.reason, String(row.tag || '').slice(0, 32), Date.now(),
    ];
    const extra = [
      String(row.openerTurn || '').slice(0, 8), String(row.startKind || '').slice(0, 8),
      String(row.startWord || '').slice(0, 40), String(row.grade || '').slice(0, 12),
    ];
    const insertFull = () => env.DB.prepare(
      `INSERT INTO warmup_fix_trace (user_id, session_id, lang, mode, reason, tag, created_at, opener_turn, start_kind, start_word, grade) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(...base, ...extra).run();
    if (extraOk !== false) {
      try { await insertFull(); extraOk = true; return; }
      catch (e: any) {
        if (!isMissingCol(e)) throw e;          // 칸 문제가 아니면 예전처럼 한 줄 남기고 넘어간다(아래 catch)
        await ensureExtraCols(env.DB);
        try { await insertFull(); extraOk = true; return; }
        catch (e2: any) {
          /* ⚠️ «또 칸 없음» 일 때만 이 인스턴스에서 새 칸을 포기한다. 네트워크·과부하 같은 일시 실패로 굳히면
             칸은 DB 에 있는데 이 워커만 몇 시간 빈 값을 쓴다(함정 대조 실측). 일시 실패면 다음 턴에 다시 시도하고,
             이번 턴은 옛 칸으로 «또» 넣지 않는다 — 다시 넣기가 실은 들어갔는데 응답만 끊겼으면 한 턴이 두 줄이 된다. */
          if (!isMissingCol(e2)) { extraReady = null; throw e2; }
          extraOk = false;
          console.warn('[warmup-fix-trace] extra columns unavailable — logging legacy 7 columns:', e2?.message || e2);
        }
      }
    }
    await env.DB.prepare(
      `INSERT INTO warmup_fix_trace (user_id, session_id, lang, mode, reason, tag, created_at) VALUES (?,?,?,?,?,?,?)`,
    ).bind(...base).run();
  } catch (e: any) {
    console.warn('[warmup-fix-trace] skipped:', e?.message || e);
  }
}
