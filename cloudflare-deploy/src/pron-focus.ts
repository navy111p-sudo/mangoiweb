// ═══════════════════════════════════════════════════════════════════════
// 🎯 집중교정 — 발음 교정 (2026-11-01 사장님 지시)
//
// 학생이 기준 낱말을 틀리게 발음하면(예: bug → "pok") 아바타가 올바른 발음을
// 3번 들려 준다. 판정은 Azure 발음평가의 «낱말 단위» 결과를 쓴다.
//
// 판정 기준 (둘 다 만족해야 교정)
//   · 그 낱말의 ErrorType 이 Mispronunciation — 소리는 냈는데 다르게 냈다.
//     Omission(빠뜨림)이나 None(맞음)은 교정하지 않는다.
//     ⛔ 학생이 대화를 다른 말로 했다면 기준 낱말은 Omission 으로 나온다 → 거짓 교정을 막는다.
//   · 낱말 정확도(AccuracyScore) 가 60 미만.
//
// ⛔ 실패는 전부 null. 이 기능은 «덤» 이라 채팅 응답을 막으면 안 된다.
// ⛔ 기준 낱말은 영문자 한 덩어리만 받는다(화면이 고른 값이라도 서버가 다시 확인).
// ═══════════════════════════════════════════════════════════════════════
import { assessPronunciation } from './azure-pronunciation';

export const PRON_FIX_ACCURACY_MAX = 60;
export const PRON_FIX_SAY_TIMES = 3;
/** base64 글자 수 상한 — 16kHz mono 16bit WAV 약 11초분. 넘으면 보내지 않는다(요금·지연). */
export const PRON_AUDIO_B64_MAX = 500000;

export interface PronFix { word: string; accuracy: number; say_times: number; }

/** 기준 낱말 형식 검사 — 영문자 2~20자 한 덩어리만 허용. */
export function pronTargetOk(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z]{2,20}$/.test(t);
}

/** Azure 결과에서 기준 낱말이 «틀리게 발음됨» 인지 판정. 해당 없으면 null. */
export function pronFixFromResult(res: any, target: string): PronFix | null {
  if (!res || res.ok !== true || !Array.isArray(res.words) || !pronTargetOk(target)) return null;
  const want = target.toLowerCase();
  const w = res.words.find((x: any) => String(x?.word || '').toLowerCase() === want);
  if (!w) return null;
  const acc = Number(w.accuracy);
  if (!Number.isFinite(acc)) return null;
  if (w.errorType !== 'Mispronunciation') return null;   // 빠뜨림(Omission)·맞음(None)은 교정하지 않는다
  if (acc >= PRON_FIX_ACCURACY_MAX) return null;
  return { word: target, accuracy: Math.round(acc), say_times: PRON_FIX_SAY_TIMES };
}

/** base64 WAV → ArrayBuffer. 형식·크기가 안 맞으면 null. */
export function decodePronAudio(b64: unknown): ArrayBuffer | null {
  if (typeof b64 !== 'string' || !b64 || b64.length > PRON_AUDIO_B64_MAX) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  } catch { return null; }
}

/** 발음 교정이 필요한지 Azure 에 물어본다. 어떤 실패도 던지지 않고 null. */
export async function assessPronFix(env: any, audioB64: unknown, target: unknown): Promise<PronFix | null> {
  try {
    if (!pronTargetOk(target)) return null;
    const audio = decodePronAudio(audioB64);
    if (!audio) return null;
    const res: any = await assessPronunciation(env, audio, target, 'en');
    return pronFixFromResult(res, target);
  } catch {
    return null;
  }
}
