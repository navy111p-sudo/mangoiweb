// 학습 API 진입점. 기능별 핸들러를 기존 순서로 호출하며 외부 import를 유지한다.
import type { MangoEnv } from './api-mango';
import { handleVocabApi } from './api-games-vocab';
import { handleMicrolearnApi } from './api-games-microlearn';
import { handleReviewQuizApi } from './api-games-review-quiz';
import { handleBadgesApi } from './api-games-badges';
import { handleStreakApi } from './api-games-streak';
import { handleVoiceApi } from './api-games-voice';

export { isCleanText, VOCAB_SRS_INTERVALS, vocabSrsNext, vocabWriteDenied } from './api-games-vocab-core';
export { BADGE_CATALOG, checkAndAwardBadges } from './api-games-badges';
export { reconcileAllStreaks } from './api-games-attendance-streak';

export async function handleGamesApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const vocabResponse = await handleVocabApi(request, url, env);
  if (vocabResponse) return vocabResponse;
  const microlearnResponse = await handleMicrolearnApi(request, url, env);
  if (microlearnResponse) return microlearnResponse;
  const reviewQuizResponse = await handleReviewQuizApi(request, url, env);
  if (reviewQuizResponse) return reviewQuizResponse;
  const badgesResponse = await handleBadgesApi(request, url, env);
  if (badgesResponse) return badgesResponse;
  const streakResponse = await handleStreakApi(request, url, env);
  if (streakResponse) return streakResponse;
  const voiceResponse = await handleVoiceApi(request, url, env);
  if (voiceResponse) return voiceResponse;
  return null;
}
