/** Reject acoustic evidence of silence/uncertainty, never a blacklist of valid sentences.
 * Missing metadata is unknown, not zero. The browser separately checks recorded audio.
 */
export function sttRejectReason(result: any): string | null {
  if (!String(result?.text || '').trim()) return 'no_speech';
  const info = result?.transcription_info;
  if (typeof info?.duration_after_vad === 'number' && info.duration_after_vad === 0 &&
      typeof info?.duration === 'number' && info.duration > 0) return 'no_speech';
  const segments = Array.isArray(result?.segments) ? result.segments : [];
  for (const s of segments) {
    if (!String(s?.text || '').trim()) continue;
    const ns = typeof s.no_speech_prob === 'number' && Number.isFinite(s.no_speech_prob) ? s.no_speech_prob : null;
    const lp = typeof s.avg_logprob === 'number' && Number.isFinite(s.avg_logprob) ? s.avg_logprob : null;
    if (ns !== null && ns >= 0.6 && (lp === null || lp < -1)) return 'no_speech';
    if (lp !== null && lp < -1) return 'low_confidence';
  }
  return null;
}
