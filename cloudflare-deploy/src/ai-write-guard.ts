// ═══════════════════════════════════════════════════════════════════════
// ✍️ AI 영작 첨삭 «실패» 감시 — 15분 감시견(runSiteWatchdog)이 부른다 (2026-11-11)
//
// [왜] 엘리더잼 원장님 피드백 «수정본이 원문과 똑같고 75점» — 운영 45건 중 8건이 AI 답을 못 읽은
//   실패였는데, 서버가 그것을 «성공» 처럼 꾸며 내보내 **아무도 몰랐습니다.** 고친 뒤(#2270)에는
//   못 읽으면 학생에게 «다시 눌러 주세요» 를 솔직히 보이고 ai_failure_log 에 'write-correct' 로 남기지만,
//   그 표를 읽는 곳이 없어 **또 아무도 모를 수 있습니다.** 사장님 「실패 알림 만들어줘」(2026-11-11).
//
// [무엇을] 최근 1시간 'write-correct' 실패가 AW_FAIL_ALERT_MIN 건 이상이면 사장님께 문자 1회,
//   다시 0건이 되면 «정상» 문자 1회. 그 사이(1~2건)는 조용히 둔다 — 한 번의 일시 장애로 문자가 오가면
//   알림이 무뎌집니다(같은 이유로 room-split-guard 도 «상태가 바뀔 때만» 보냅니다).
//
// ⛔ 이 파일의 함수는 **절대 던지지 않는다** — 감시견 안에서 돌기 때문(던지면 사이트 장애 감시까지 멈춘다).
// ⛔ 문자에 학생 글·이름을 싣지 않는다 — 숫자만(AGENTS.md «개인정보»).
// ═══════════════════════════════════════════════════════════════════════
import { sendPlainSms } from './solapi-client';

export const AW_FAIL_WINDOW_MS = 60 * 60 * 1000;   // 최근 1시간
export const AW_FAIL_ALERT_MIN = 3;                // 이만큼 실패하면 «학생 여럿이 막혔다»
export const AW_ALERT_KEY = 'aiwrite:alerted';

export type AiWriteGuardResult = { state: 'unknown' | 'ok' | 'failing'; failures?: number; successes?: number; smsSent?: boolean };

export async function checkWriteCorrectFailures(env: any): Promise<AiWriteGuardResult> {
  try {
    const db: any = env && env.DB;
    const kv: any = env && env.SESSION_STATE;
    if (!db || !kv) return { state: 'unknown' };
    const since = Date.now() - AW_FAIL_WINDOW_MS;

    let failures = 0;
    try {
      const r: any = await db.prepare(`SELECT COUNT(*) AS n FROM ai_failure_log WHERE feature = 'write-correct' AND created_at >= ?`).bind(since).first();
      failures = Number(r && r.n) || 0;
    } catch (e: any) {
      // 표가 아직 없다 = 실패가 한 번도 없었다. 그 밖의 DB 오류는 «모름» — 확신 없이 문자하지 않는다
      if (!/no such table/i.test(String(e && e.message || e))) return { state: 'unknown' };
    }
    let successes = 0;
    try {
      const r: any = await db.prepare(`SELECT COUNT(*) AS n FROM ai_writing_corrections WHERE created_at >= ?`).bind(since).first();
      successes = Number(r && r.n) || 0;
    } catch { /* 문자에 곁들이는 숫자일 뿐 — 판정에는 안 쓴다 */ }

    let alerted = false;
    try { alerted = !!(await kv.get(AW_ALERT_KEY)); } catch { /* 못 읽으면 «안 보냈다» 로 — 최악이 문자 한 통 더 */ }
    const phone = String(env.OWNER_ALERT_PHONE || '').trim();
    const send = async (text: string): Promise<boolean> => {
      if (!phone) return false;
      try { return !!(await sendPlainSms(env, phone, text, { kind: 'ai-write' })).ok; } catch { return false; }
    };

    let smsSent = false;
    if (failures >= AW_FAIL_ALERT_MIN && !alerted) {
      smsSent = await send(`[망고아이] ⚠️ AI 영작 첨삭이 최근 1시간 ${failures}건 실패했습니다(성공 ${successes}건). ` +
        '학생들이 «다시 눌러 주세요» 안내를 보고 있습니다. Cloudflare Workers AI 상태를 확인해 주세요.');
      try { await kv.put(AW_ALERT_KEY, '1'); } catch (e: any) { console.warn('[ai-write-guard] KV put 실패', e?.message); }
    } else if (failures === 0 && alerted) {
      smsSent = await send('[망고아이] ✅ AI 영작 첨삭이 정상으로 돌아왔습니다(최근 1시간 실패 0건).');
      // 지우기가 실패하면 «보냈음» 이 남아 다음 장애에 문자가 안 간다 — 로그는 남긴다
      try { await kv.delete(AW_ALERT_KEY); } catch (e: any) { console.warn('[ai-write-guard] KV delete 실패', e?.message); }
    }
    return { state: failures >= AW_FAIL_ALERT_MIN ? 'failing' : 'ok', failures, successes, smsSent };
  } catch {
    return { state: 'unknown' };
  }
}
