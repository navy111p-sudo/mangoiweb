// ═══════════════════════════════════════════════════════════════════════
// 🗣️ speaking-pace.ts — 월간 성적표 «따라 읽기 말속도(분당 낱말)» (2026-10-18, 개선안 1순위 ③)
//
//   재료 — 새로 재지 않는다. 발음 코칭이 채점할 때마다 voice_coaching.speech_rate 에
//   «초당 낱말» 을 이미 남긴다(정본 voice-score.ts analyzeAcoustic — Whisper 낱말 타이밍,
//   첫 낱말 시작 ~ 마지막 낱말 끝. 앞뒤 쉼은 안 센다).
//
//   ⚠️ 그래서 이 숫자는 «대화 속도» 가 아니라 «짧은 문장을 따라 읽는 속도» 다 — 앞뒤 쉼이 빠져
//      대화 WPM 보다 높게 나온다. 화면·문구는 반드시 «따라 읽기» 라고 말해야 한다(경쟁사 WPM 과
//      같은 잣대인 척하지 않는다).
//   ⛔ 지어내지 않는다 — 표본이 PACE_MIN_SAMPLES 미만이면 null(화면은 그 줄을 안 그린다).
//   ⛔ 평균 말고 «가운뎃값» — 짧은 문장 하나가 초당 7낱말로 튀는 일이 실제로 있다(2026-10-18 실측 최대 7.1).
//   ⚠️ 이 파일은 import 가 없다 — 하니스가 타입만 벗겨 그대로 돌린다.
// ═══════════════════════════════════════════════════════════════════════

/** 이보다 적은 문장으로는 말하지 않는다 */
export const PACE_MIN_SAMPLES = 5;
/** 믿을 수 있는 초당 낱말 범위 — 밖은 버린다(잡음·잘린 녹음) */
export const PACE_RATE_MIN = 0.5;
export const PACE_RATE_MAX = 6;

export type SpeakingPace = { wpm: number; samples: number } | null;

/** 초당 낱말 목록 → 분당 낱말(가운뎃값). 표본이 모자라면 null */
export function speakingPaceFromRates(rates: any[] | null | undefined): SpeakingPace {
  const ok = (rates || [])
    .map((r) => Number(r))
    .filter((r) => isFinite(r) && r >= PACE_RATE_MIN && r <= PACE_RATE_MAX)
    .sort((a, b) => a - b);
  if (ok.length < PACE_MIN_SAMPLES) return null;
  const mid = ok.length >> 1;
  const med = ok.length % 2 ? ok[mid] : (ok[mid - 1] + ok[mid]) / 2;
  return { wpm: Math.round(med * 60), samples: ok.length };
}

/** 그 기간의 말속도 — 절대 던지지 않는다(실패·표 없음 = null) */
export async function loadSpeakingPace(db: any, uid: string, startMs: number, endMs: number): Promise<SpeakingPace> {
  try {
    const rs: any = await db.prepare(
      `SELECT speech_rate FROM voice_coaching
        WHERE student_uid = ? AND created_at >= ? AND created_at < ? AND speech_rate > 0
        ORDER BY created_at DESC LIMIT 500`
    ).bind(uid, startMs, endMs).all();
    return speakingPaceFromRates(((rs && rs.results) || []).map((r: any) => r.speech_rate));
  } catch {
    return null;
  }
}
