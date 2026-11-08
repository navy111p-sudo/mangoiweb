// Observed server results only. Grades are never converted to numeric skill scores.

export function speakingObservation(o: { sessionId: string; turn: number; input: string; lang: string; ok: boolean; kickoff: boolean; grade: unknown; fix: any; eventId?:string }) {
  if (!o.ok || o.kickoff) return null;
  const words = (s: string) => o.lang === 'en' ? [...new Set((String(s).toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) || []))] : [];
  return {
    source: 'warmup-verified-turn', sessionId: o.sessionId, turn: o.turn, eventId:o.eventId,
    grade: ['perfect', 'partial', 'incomplete'].includes(String(o.grade)) ? o.grade : null,
    spokenWords: words(o.input), reviewWords: o.fix ? words(o.fix.now) : [], wordCountMeasured: o.lang === 'en',
    correction: o.fix ? { was: o.fix.was, now: o.fix.now, why: o.fix.why_ko || '' } : null,
    // No acoustic recording or five-skill assessment exists in this chat response.
    skills: {},
  };
}
