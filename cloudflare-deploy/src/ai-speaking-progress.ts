/**
 * A.i 말하기 학습 평가: 순수 함수 모듈.
 * 점수는 실제 평가 엔진에서 제공해야 하며 추정/임의 생성 금지.
 */
export type CorrectionMode = 'immediate' | 'key-mistakes' | 'after-lesson';
export function correctionTimingOf(value: unknown): CorrectionMode | '' {
  return value === 'immediate' || value === 'key-mistakes' || value === 'after-lesson' ? value : '';
}

export function showDuringPractice(timing: CorrectionMode | '', fix: { severity: 'major' | 'minor' }): boolean {
  return timing !== 'after-lesson' && (timing !== 'key-mistakes' || fix.severity === 'major');
}

export type Skill = 'pronunciation' | 'fluency' | 'grammar' | 'vocabulary' | 'sentence';
export interface SpeakingEvaluation {
  lessonId: string;
  studentId: string;
  finishedNormally: boolean;
  evaluatedAt: string;
  skills: Partial<Record<Skill, number>>;
  spokenWords: string[];
  correctedWords: string[];
  sentencesCompleted: number;
  evaluationSource: string;
}
export interface SpeakingProgress {
  lessonId: string;
  studentId: string;
  finishedNormally: true;
  evaluatedAt: string;
  score: number | null;
  skills: Partial<Record<Skill, number>>;
  uniqueWords: string[];
  reviewWords: string[];
  sentencesCompleted: number;
}
const SKILLS: Skill[] = ['pronunciation','fluency','grammar','vocabulary','sentence'];
export function defaultCorrectionMode(level: number): CorrectionMode {
  if (!Number.isInteger(level) || level < 1 || level > 8) throw new Error('Invalid level');
  return level <= 2 ? 'immediate' : level <= 4 ? 'key-mistakes' : 'after-lesson';
}
export function validateEvaluation(e: SpeakingEvaluation): void {
  if (!e || typeof e !== 'object') throw new Error('Missing evaluation');
  if (![e.lessonId, e.studentId, e.evaluationSource].every(v => typeof v === 'string' && v.trim())) throw new Error('Missing evaluation identity/source');
  if (e.finishedNormally !== true) throw new Error('Incomplete lesson: no results');
  if (typeof e.evaluatedAt !== 'string' || !Number.isFinite(Date.parse(e.evaluatedAt))) throw new Error('Invalid evaluation date');
  if (!e.skills || typeof e.skills !== 'object' || Array.isArray(e.skills)) throw new Error('Invalid skills');
  if (![e.spokenWords, e.correctedWords].every(words => Array.isArray(words) && words.every(w => typeof w === 'string'))) throw new Error('Invalid words');
  if (!Number.isSafeInteger(e.sentencesCompleted) || e.sentencesCompleted < 0) throw new Error('Invalid sentence count');
  for (const [key, value] of Object.entries(e.skills)) {
    if (!SKILLS.includes(key as Skill) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('Invalid skill score');
  }
}
export function evaluateSpeaking(e: SpeakingEvaluation): SpeakingProgress {
  validateEvaluation(e);
  const scores = Object.values(e.skills).filter((n): n is number => typeof n === 'number');
  const score = scores.length === SKILLS.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null;
  const normalize = (words: string[]) => [...new Set(words.map(w=>w.trim().toLowerCase()).filter(Boolean))];
  const uniqueWords = normalize(e.spokenWords);
  const reviewWords = normalize(e.correctedWords);
  return {lessonId:e.lessonId,studentId:e.studentId,finishedNormally:true,evaluatedAt:e.evaluatedAt,
    score,skills:{...e.skills},uniqueWords,reviewWords,sentencesCompleted:e.sentencesCompleted};
}
export function correctionPrompt(mode: CorrectionMode): string {
  switch(mode) {
    case 'immediate': return 'Correct each meaningful mistake promptly, kindly and briefly, then resume conversation.';
    case 'key-mistakes': return 'Prioritize communication. Correct only major mistakes during the lesson. For minor mistakes, fill fix but keep corrections out of reply.';
    case 'after-lesson': return 'Put any correction in fix only. Keep corrections, recasts, and repetition requests out of reply. Continue the conversation normally.';
    default: throw new Error('Unknown correction mode');
  }
}
