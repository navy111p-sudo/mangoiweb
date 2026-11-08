/**
 * A.i 말하기 학습 평가: 순수 함수 모듈.
 * UI/DB 연결 전 단계. 점수는 실제 평가 엔진에서 제공해야 하며 추정/임의 생성 금지.
 */
export type CorrectionMode = 'immediate' | 'key-mistakes' | 'after-lesson';
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
  score: number | null;
  skills: Partial<Record<Skill, number>>;
  uniqueWords: string[];
  reviewWords: string[];
  sentencesCompleted: number;
}
const SKILLS: Skill[] = ['pronunciation','fluency','grammar','vocabulary','sentence'];
export function defaultCorrectionMode(level: number): CorrectionMode {
  if (!Number.isFinite(level)) throw new Error('Invalid level');
  return level <= 2 ? 'immediate' : level <= 4 ? 'key-mistakes' : 'after-lesson';
}
export function validateEvaluation(e: SpeakingEvaluation): void {
  if (!e.lessonId || !e.studentId || !e.evaluationSource) throw new Error('Missing evaluation identity/source');
  if (!e.finishedNormally) throw new Error('Incomplete lesson: no results');
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
  return {score,skills:e.skills,uniqueWords,reviewWords,sentencesCompleted:e.sentencesCompleted};
}
export function correctionPrompt(mode: CorrectionMode): string {
  switch(mode) {
    case 'immediate': return 'Correct each meaningful mistake promptly, kindly and briefly, then resume conversation.';
    case 'key-mistakes': return 'Prioritize communication. Correct at most three important mistakes during the lesson.';
    case 'after-lesson': return 'Do not interrupt for language corrections; collect errors and summarize them after the lesson.';
    default: throw new Error('Unknown correction mode');
  }
}
