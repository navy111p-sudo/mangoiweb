import { handleWritingApi } from './api-ai-writing';
import type { EleaderEngines } from './eleader-engines';
import { handleEleaderApi } from './api-eleader';
// ═══════════════════════════════════════════════════════════════════════
// 🤖 AI API — 영작은 전용 모듈에 위임, AI 친구·수업 질문·명령은 여기서 처리
//   게임화 포인트/배지는 api-points·api-games 의 export 헬퍼 사용.
// ═══════════════════════════════════════════════════════════════════════
import { loadActiveGoal, goalPromptLine } from './student-goal';   // 🗓 4주 목표(2026-10-10)
import { loadRecentMistakes, recentMistakesPromptLine, logAiFriendFix, loadRecentFixTags, carryRepeatTags } from './recent-mistakes';
import { konglishFix, konglishPromptLine } from './konglish';   // 🇰🇷 콩글리시 대조표(2026-10-18 ⑦)
import { decideLevelSuggestion, loadSuggestEvidence, recentlyAnswered, recordSuggestAnswer } from './level-suggest';   // 🎚 단계 제안(2026-10-18 ⑤)
import { WEAK_WHERE, WEAK_ORDER, weakSince } from './weak-words';
import { loadVocabWeakRows, friendWeakList } from './vocab-weak';   // 🔁 단어장에서 틀린 낱말(2026-10-18 ⑥)
import { json } from './api-util';
import { applyEmpathyGuard, FRIEND_EMPATHY_RULE } from './warmup-empathy';   // 💛 힘들다는 아이에게 칭찬으로 시작하지 않기(2026-09-09)
import { authUidFromRequest as authUidGlobal, signUidToken } from './auth-token';
import { ensurePointTables, applyPointTransaction } from './api-points';
import { checkEarnAllowed } from './point-policy';   // 🪙 하루 상한 정본(복제 금지)

import { handleAiCommandApi } from './api-ai-command';

import { looksGarbledKo } from './ko-readable';   // 🔤 수업 중 질문의 한국어 뜻 거르기(2026-11-01)   // 🚦 고칠 곳 3단계 판정(오류·참고·인정) — «왜» 설명은 그 안에서 correction-reason 을 씀
import { aiFriendLevelSpec, aiFriendMeasureReply, aiFriendShortenHint, aiFriendStudentAsked, aiFriendTrimSentences, aiFriendNormalizeLevel, AI_FRIEND_LEVELS } from './ai-friend-level'; // 🎚 눈높이(레벨) 정본
import { studentCallName, scrubLoginId } from './student-call-name';   // 🧑 학생을 부를 이름 — 아이디 금지(2026-11-01)
import { resolveFriendName, wrongSelfName, askedOwnName } from './ai-friends';   // 🧑 AI 친구 이름 정본 + «다른 이름으로 소개했나» 판정
import { stripAddedKorean, hasAddedKorean } from './reply-korean';               // 🇰🇷 모델이 덧붙인 한국어 번역 제거 — 「뜻」 버튼 설계를 지킨다
import { assessPronFix } from './pron-focus';   // 🎯 집중교정 발음 교정(2026-11-01)
/* ✏️ «교정 카드» 판정 정본 — 웜업과 «같은 한 벌» 을 쓴다 (2026-09-09 사장님 「A.i 친구도 똑같이」).
   ⛔ 파일 이름이 warmup 이라고 복제해 오지 말 것. 판정이 두 벌이 되면 한쪽만 고쳐진다. */
import { backfillPastTenseFix } from './tense-backfill';
import { focusedCandidate, focusedReplyFix, recoverFocusedFix, FOCUSED_DRAFT_RULE } from './focused-correction';
import { AI_FRIEND_CORRECTION_RULE, parseWarmupOutput, verifyWarmupFix,
         decideWarmupFixShow, warmupShouldOfferRepeat, isRfRejection } from './warmup-correction';
import type { MangoEnv } from './api-mango';
import { recordAiFailure } from './ai-failure-log';
import { retryFriendModels, type FriendRetryResult } from './friend-retry';   // 🔁 모델 전부 실패 → 같은 요청 안에서 한 번 더(2026-11-04)
import { correctionModeOf, gateFixForMode } from './warmup-honest';   // 🎚️ A.i 친구 교정 모드(자유대화·균형·집중교정, 기본 집중교정)
/* 🎚️ (2026-11-03) 모드별 «교정을 말로 들려주기»·정직한 칭찬·균형 다시 묻기·미리듣기 문 — 정본 한 파일.
   ⛔ 같은 판정을 이 파일에 다시 적지 말 것(두 벌이 되면 한쪽만 고쳐진다). */
import { planFriendTurn, createFriendPreviewGate, recheckBalancedFix, finishFriendReply, waitAtMost, RECHECK_EXTRA_WAIT_MS } from './friend-correction-flow';
import { handleClassAsk } from './class-ask';
import { handleClassAskStream, wantsClassAskStream } from './class-ask-stream';   // ✋ A.i 선생님 수업 — 학생 질문 즉답(2026-10-08)
import { connectorRule, connectorPromptBlock, linkBandForFriendLevel, turnOpenerLine } from './conversation-connectors';
import { AVATAR_NATURAL_OPENERS } from './conversation-connectors';   // 🔗 연결 표현 정본(2026-10-28 · 세 화면 공용)
   // 📖 동화책 바꿔 쓰기 AI 한 번 더 보기·기록(2026-10-13)
import { recordAiLatency } from './ai-latency-log';   // ⏱ «학생이 얼마나 기다리는가» (A-3)
import { createJsonTextTap, takeSentences } from './stream-json-text';   // 📡 스트리밍 본문 추출 (A-1)
/* 🔁 «같은 질문 두 번 금지» 정본 — 엘리더잼·일반 A.i 말하기와 «같은 판정» (2026-10-28 사장님 「AI 영어친구에도 같은 질문 금지 적용해줘」).
   ⛔ 판정을 여기에 복제하지 말 것 — 이 화면은 부르기만 한다. */
import { questionSession, questionMemory, askedQuestionsLine, repeatedQuestions, retryRepeatedQuestion, repeatQuestionHintEn, isReaskRequest, isDontKnowAnswer } from './question-memory';
import { FRIEND_FRAG_RETRY_BUDGET_MS as FRAG_RETRY_BUDGET_MS } from './reply-questions';   // ⏱ 다시 뽑기 시간 예산 — A.i 친구는 9초(웜업 5초와 다름 · 이유는 reply-questions.ts)

export async function handleAiApi(
  request: Request,
  url: URL,
  env: MangoEnv,
  eleaderEngines?: EleaderEngines
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (path.startsWith('/api/ai/eleader/')) return handleEleaderApi(request, url, env, eleaderEngines);

  const writingResponse = await handleWritingApi(request, url, env);
  if (writingResponse) return writingResponse;

    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase CF — AI 24시간 영어 친구 챗봇
    // ═══════════════════════════════════════════════════════════════
    const ensureChatSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_friend_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, level TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_chat_uid ON ai_friend_chats(student_uid, created_at);`);
    };

    // ✨ 오늘의 단어 — KST 날짜로 결정되는 순환 목록. 클라이언트 HUD 와 서버 보너스 판정의 단일 정본.
    const AI_FRIEND_WORDS: Array<{ w: string; ko: string; e: string }> = [
      { w: 'amazing', ko: '놀라운', e: '🤩' }, { w: 'delicious', ko: '아주 맛있는', e: '🍕' },
      { w: 'brave', ko: '용감한', e: '🦁' }, { w: 'curious', ko: '호기심 많은', e: '🔍' },
      { w: 'favorite', ko: '가장 좋아하는', e: '💖' }, { w: 'exciting', ko: '신나는', e: '🎢' },
      { w: 'together', ko: '함께', e: '🤝' }, { w: 'weekend', ko: '주말', e: '📅' },
      { w: 'weather', ko: '날씨', e: '🌤' }, { w: 'special', ko: '특별한', e: '🌟' },
      { w: 'adventure', ko: '모험', e: '🗺' }, { w: 'friendly', ko: '다정한', e: '😊' },
      { w: 'hungry', ko: '배고픈', e: '🍚' }, { w: 'awesome', ko: '끝내주는', e: '👍' },
      { w: 'dream', ko: '꿈', e: '💭' }, { w: 'travel', ko: '여행하다', e: '✈' },
      { w: 'animal', ko: '동물', e: '🐾' }, { w: 'happy', ko: '행복한', e: '😄' },
      { w: 'library', ko: '도서관', e: '📚' }, { w: 'practice', ko: '연습하다', e: '💪' },
      { w: 'beautiful', ko: '아름다운', e: '🌸' }, { w: 'question', ko: '질문', e: '❓' },
      { w: 'birthday', ko: '생일', e: '🎂' }, { w: 'important', ko: '중요한', e: '📌' },
      { w: 'vacation', ko: '방학·휴가', e: '🏖' }, { w: 'surprise', ko: '깜짝 놀람', e: '🎁' },
      { w: 'healthy', ko: '건강한', e: '🥗' }, { w: 'famous', ko: '유명한', e: '⭐' },
      { w: 'monster', ko: '괴물', e: '👾' }, { w: 'rainbow', ko: '무지개', e: '🌈' },
    ];
    const aiFriendWordOfDay = () => {
      const dayIdx = Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);
      return AI_FRIEND_WORDS[dayIdx % AI_FRIEND_WORDS.length];
    };
    // 🎮 HUD 스냅샷 — 오늘/누적 메시지 수 + 🔥연속 대화 일수(KST). 채팅·히스토리 응답에 공용.
    const aiFriendGamSnapshot = async (uid: string) => {
      const KST_OFF = 9 * 3600 * 1000;
      const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
      // 🐢 세 조회는 서로 무관(같은 uid, 다른 집계) — 순서대로 기다리지 않고 한꺼번에 보낸다.
      const [tc, lc, dr]: any[] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_friend_chats WHERE student_uid=? AND role='user' AND created_at>=?`).bind(uid, todayMs).first(),
        env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_friend_chats WHERE student_uid=? AND role='user'`).bind(uid).first(),
        env.DB.prepare(`SELECT DISTINCT CAST((created_at + 32400000) / 86400000 AS INTEGER) AS d FROM ai_friend_chats WHERE student_uid=? AND role='user' AND created_at>=? ORDER BY d DESC LIMIT 40`).bind(uid, Date.now() - 40 * 86400000).all(),
      ]);
      const days = new Set(((dr.results || []) as any[]).map(r => Number(r.d)));
      const todayIdx = Math.floor((Date.now() + KST_OFF) / 86400000);
      let streak = 0;
      while (days.has(todayIdx - streak)) streak++;
      // 오늘 아직 안 보냈어도 어제까지의 스트릭은 이어짐 표시 (끊긴 건 아님)
      if (streak === 0 && days.has(todayIdx - 1)) { let s = 0; while (days.has(todayIdx - 1 - s)) s++; streak = s; }
      /* 🪙 (2026-11-02) 오늘 «실제로» 적립된 AI 친구 포인트 — 화면 «오늘 받은 포인트» 칸의 정본.
         ⛔ 추정하지 않습니다(예전 화면은 «오늘 대화 수 × 2» 를 지어냈습니다). 못 세면 null = 화면이 «—».
         게스트는 적립하지 않으므로 guest:true 로 알립니다. */
      const guest = /^guest/i.test(uid);
      let earnedToday: number | null = guest ? 0 : null;
      if (!guest) {
        try {
          const er: any = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS s FROM point_rule_log WHERE user_id=? AND rule_code IN ('ai_friend_chat','ai_friend_word','ai_friend_voice','ai_friend_listen') AND triggered_at>=?`).bind(uid, todayMs).first();
          const n = Number(er?.s);
          if (Number.isFinite(n)) earnedToday = n;
        } catch { /* 표가 아직 없거나 조회 실패 — «모름» */ }
      }
      return { today: tc?.c || 0, lifetime: lc?.c || 0, streak, word: aiFriendWordOfDay(), guest, earned_today: earnedToday };
    };

    /* 🔁 (2026-07-23 제보) "I 한 마디만 했는데 지난번 답을 그대로 길게 다시 한다".
       웜업(handleWarmupChat)에는 반복 감지 후 재생성이 있었지만 AI 친구에는 없었다.
       모델은 입력이 짧거나 애매하면 직전 답변을 거의 그대로 복사한다 → 직전 AI 발화와
       (거의) 같으면 한 번 다시 생성한다. 판정은 웜업과 동일한 방식. */
    const aiFriendNorm = (s: string) =>
      String(s || '').toLowerCase().replace(/[^a-z0-9가-힣' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const aiFriendIsRepeat = (text: string, hist: any[]) => {
      const t = aiFriendNorm(text);
      if (t.length < 12) return false;                 // 짧은 리액션("Nice try!")은 반복 허용
      for (const m of hist.filter((h) => h && h.role === 'assistant').slice(-3)) {
        const p = aiFriendNorm(String(m.content || ''));
        if (!p) continue;
        if (p === t) return true;
        const shorter = p.length < t.length ? p : t;
        const longer = p.length < t.length ? t : p;
        // 앞부분이 통째로 같으면(길이의 80% 이상) 사실상 같은 답으로 본다
        if (shorter.length >= 24 && longer.startsWith(shorter.slice(0, Math.floor(shorter.length * 0.8)))) return true;
      }
      return false;
    };
    /* 🎤 음성 인식이 잘라먹은 조각인가.
       ⚠️ (2026-07-29 학생 제보 · 화면녹화 증거) "또박또박 말하는데 계속 다시 말하래요".
       진범은 오인식이 아니라 이 판정이었다. 옛 판정은 ①두 단어 이하면 무조건 잘림,
       ②마지막 단어가 흔한 기능어면 무조건 잘림으로 봤는데, 그 목록에 it/you/me/do/can/is
       처럼 "문장을 정상적으로 끝내는" 말이 들어 있었다. 그래서 Whisper 가 **완벽하게**
       받아적은
         "I like watching movies, but I don't do it."   (→ 끝 단어 it)
         "I like watching movies. What about you?"      (→ 끝 단어 you)
       가 연달아 '잘림'으로 찍혀 학생은 네 번 내리 "Can you say the whole sentence again?"
       만 들었다. 아이는 결국 "Why do you always think again to me?" 라고 물었다.
       이제는 ①문장부호로 끝나면 완결로 보고, ②영어로 문장을 끝낼 수 없는 말(관사·전치사·
       접속사·소유격)로 끝날 때만 잘림으로 본다. 놓치는 쪽(되묻지 않고 그냥 답하기)이
       잘못 되묻는 쪽보다 학생에게 훨씬 낫다. */
    // 이 말로 끝나면 영어 문장이 성립하지 않는다 — 명백한 조각
    const AI_FRIEND_DANGLING = /^(a|an|the|and|or|but|to|of|in|on|at|for|with|from|about|my|your|his|her|their|our|because|than|very|really|going)$/i;
    // 뒤에 말이 와야만 뜻이 되는 be동사류 ("My favorite movie is" → 조각)
    const AI_FRIEND_DANGLING_BE = /^(i|is|are|am|was|were|want|need|going)$/i;
    // 짧은 대답은 이 말로 끝나도 정상("Yes, I can.") — 두 단어 이하일 때만 조각으로 본다("I like")
    const AI_FRIEND_DANGLING_SHORT = /^(do|does|did|can|will|would|have|has|like|that|this|it|there)$/i;
    const aiFriendLooksCut = (s: string) => {
      const raw = String(s || '').trim();
      if (!raw) return false;
      if (/[.!?…"')\]]$/.test(raw)) return false;      // 문장부호로 끝나면 다 말한 것
      const w = raw.split(/\s+/).filter(Boolean);
      if (!w.length) return false;
      const last = w[w.length - 1].replace(/[^a-z']/gi, '');
      if (!last) return false;
      if (AI_FRIEND_DANGLING.test(last) || AI_FRIEND_DANGLING_BE.test(last)) return true;
      return w.length <= 2 && AI_FRIEND_DANGLING_SHORT.test(last);
    };
    /* 🔁 직전 답이 이미 "다시 말해줄래?" 였는가 — 두 번 연속 되묻는 것은 금지.
       한 번 못 알아들었으면 두 번째는 알아들은 만큼이라도 받아주고 대화를 이어가야 한다. */
    const aiFriendJustAskedAgain = (hist: any[]) => {
      const last = [...hist].reverse().find((h) => h && h.role === 'assistant');
      if (!last) return false;
      return /(say (it|that|the whole sentence) again|one more time|didn'?t catch|only caught|다시 말)/i
        .test(String(last.content || ''));
    };
    /* 🐢 "천천히 말해줘 / 다시 말해줘 / What? / 뭐라고?" 같은 부탁인가 — 무시하고 제 얘기만 하면 안 된다
       ⚠️ 네 줄 모두 정본 QM_REASK_KO·EN·ECHO·DONT_KNOW_MEANING(src/question-memory.ts)과 «글자 그대로» 같다.
          하니스가 이 블록을 vm 으로 떼어 돌려 import 를 못 쓴다 — 한쪽만 고치지 말 것(ai_friend_no_repeat_question_harness ①-18 이 원문 대조).
       🔴 (2026-11-05 실측) 예전엔 영어 줄 맨 앞에 «I don't know» 가 «문장 어디서나» 붙어 있었다 — 「I don't know, anyway I like riding
          a bicycle.」·「I don't know. But I love Beauty and the Beast」 까지 «천천히 말해 달라» 로 읽혀, 지난 기록의 «I don't know» 턴
          대부분이 「Yes! I will speak slowly.」 로 시작했고 «훨씬 짧게» 지시 탓에 「You like bike.」 같은 깨진 영어가 나왔다.
          ⛔ 되살리지 말 것. «답을 모른다»(그 말만)는 정본 isDontKnowAnswer 가 따로 받고(dontKnowHint), «뜻을 모른다» 는 넷째 줄이 받는다. */
    const aiFriendIsMetaAsk = (s: string) =>
      /(?:천천히|느리게|쉽게|짧게|간단히|또박또박|크게|다시)\s*(?:(?:다시|좀|한\s*번)\s*)?(?:말씀|말|얘기|읽어|설명)\s*(?:해\s*)?(?:줘(?![서야])|주세요|주실래|줄래|주시겠|주실\s*수|줄\s*수)|(?:천천히|느리게|쉽게|짧게|간단히|또박또박|크게|다시)\s*(?:좀\s*)?해\s*(?:줘(?![서야])|주세요|주실래|줄래|주시겠)|못\s*알아\s*(?:들었|듣겠)|알아\s*듣기\s*(?:힘들|어려)|쉬운\s*말로\s*(?:(?:말|얘기|설명)\s*)?(?:해\s*)?(?:줘(?![서야])|주세요|주실래|줄래|주시겠|주실\s*수|줄\s*수)|모르겠|너무\s*(?:빠르게|빨리)\s*말|한\s*번\s*(?:더|만)\s*(?:말씀|말|얘기)\s*(?:해\s*)?(?:줘(?![서야])|주세요|주실래|줄래|주시겠|주실\s*수|줄\s*수)/.test(String(s || '')) ||
      /\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+slow down\b|\bslow down,? please\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+(?:speak|talk|say (?:it|that)|read (?:it|that)|go)(?: english)?(?: a (?:little|bit))?(?: more)? (?:slowly|slower|slow)\b|\bplease(?: more)? (?:slowly|slower|slow)\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+(?:a (?:little|bit) )?(?:more )?(?:slowly|slower|slow|simpler|easier|shorter),? please\b|\byou(?:['’]re| are)?\s+(?:(?:talk|talking|speak|speaking)\s+(?:too|so|very|really)|too) fast\b|\byour (?:voice|talking|speaking) is (?:too|so) fast\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+(?:say|tell me) (?:it |that )?(?:again|one more time)\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+repeat(?: (?:it|that|please|again|the question|the sentence|one more time))?\b|\bi (?:don['’]?t|do not|can['’]?t|cannot|couldn['’]?t|didn['’]?t|not) (?:really )?understand(?: (?:you|that|it|this|anything|the question|your question|the word|the sentence|english|what you(?:['’]re| are) saying|what you (?:said|mean)|what (?:that|it) means))?(?=[^\p{L}\p{N}]*$|\s*[.!?](?:\s|$)|\s*,\s*(?:sorry|please|can you|could you|say|again|teacher)\b)|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+(?:say|speak|talk|explain)(?: it| that)? (?:more )?(?:simply|simpler|easier|more easily|shorter)\b|\b(?:you|please)\s+make it (?:simple|simpler|easy|easier|short|shorter)\b|\b(?:simple|simpler|easy|easier|short|shorter) (?:words|english|sentences?),? please\b|\b(?:can you|please) use (?:easy|easier|simple|simpler) words\b|\b(?:didn['’]?t|can['’]?t|couldn['’]?t|did not|cannot|could not|don['’]?t) hear you\b|\b(?:you|please|um+|uh+|sorry|oh|ok|okay|teacher|what|huh|too fast|too hard|again)[,.!?]?\s+speak (?:up|slower|louder|more slowly)\b|\bwhat (?:was|is) the question\b/iu.test(String(s || '')) ||
      /^[^\p{L}\p{N}]*(?:(?:oh|um+|uh+|wait|아|음|(?:eh|네|응|예|에|엥|어|sorry|excuse me)\s*[?？]|wha+t?|huh|sorry|excuse me|뭐|뭐라고요?|too fast|너무\s*빨라요?)[^\p{L}\p{N}]+){0,2}(?:wha+t?|huh|pardon(?: me)?|i beg your pardon|come again|say what|what was that|what (?:did|do) you (?:say|said|mean|ask)|what did you just say|what you (?:say|said)|what does (?:it|that) mean|again\s*[?？]|(?:once )?again,? please|(?:one more time|once more)(?:\s*[?？]|,? please)|(?:please )?(?:say (?:it |that )?again|tell me again|slow down|repeat(?: (?:it|that|again|the question|the sentence|one more time))?|(?:speak|talk|say it|read it|go)(?: a (?:little|bit))?(?: more slowly| slower)|speak (?:up|louder)|explain (?:it |that )?(?:more )?simply|use (?:easy|easier|simple|simpler) words)(?:,? please)?|(?:speak|talk|say it|read it)(?: more)? slowly,? please|too fast(?: for me)?(?:,? (?:teacher|please))?|(?:you(?:['’]re| are) )?(?:talking|speaking) too fast|louder|slower|more slowly|don['’]?t understand(?:,? sorry)?|not understand|(?:a (?:little|bit) )?(?:more )?(?:slow|slower|louder|slowly|simpler|easier|shorter),? please|i (?:can['’]?t|cannot|couldn['’]?t) hear(?: you)?(?: well)?|sorry,? i (?:didn['’]?t|did not|couldn['’]?t) (?:hear|catch)(?: (?:that|it|you|what you said))?|뭐|머|뭐라고|뭐라구|뭐라고요|뭐라구요|뭐요|뭐라고\s*(?:하셨어요|하셨죠|하셨나요|했어요?|했니|했지)|다시요?|(?:다시\s*)?한\s*번\s*(?:만\s*)?(?:더\s*)?요|(?:잘\s*)?(?:안|못)\s*(?:들려요?|들렸어요?|들었어요?)|(?:잘\s*)?못\s*알아\s*들어요?|소리가?\s*(?:잘\s*)?(?:안\s*들려요?|작아요?)|무슨\s*(?:말|뜻|말씀)이(?:에요|야|예요|세요)?|이해(?:가|를)?\s*(?:안\s*(?:돼|되|가)|못\s*(?:했|해))[^\s\p{P}]*|(?:천천히|다시|느리게|쉽게|크게|또박또박)\s*(?:다시\s*)?(?:말|얘기)\s*해(?:\s*봐(?:요)?)?|(?:(?:좀|더|조금만?|다시)\s*)?(?:천천히|느리게|쉽게|짧게|간단히)(?:\s*(?:좀|다시))?(?:\s*해(?:\s*(?:줘|주세요))?|요)?|너무\s*(?:빨라요?|빠르다|빠르네요?)|(?:eh|네|응|예|에|엥|어|sorry|excuse me)\s*[?？])[^\p{L}\p{N}]*$/iu.test(String(s || '')) ||
      /\bi (?:don['’]?t|do not) (?:really )?know what (?:(?:that|it|this|you|the (?:word|question|sentence)) (?:means?|meant|said|say)|you(?:['’]re| are) saying)(?=[^\p{L}\p{N}]*$|\s*[.!?](?:\s|$)|\s*,\s*(?:sorry|please|can you|could you|say|again|teacher)\b)/iu.test(String(s || ''));
    /* 🈚 (2026-07-27 사장님 신고) Llama 가 한국어 팁을 쓰다 중국어 단어를 섞는다
       ("💡猴子들은 바나나와 많은 과일들을 좋아해요"). 영어친구챗 답변에 한자가 정당하게
       나올 일은 없다 — 한자가 섞인 💡팁은 통째로 떼고(팁은 선택 요소·반쪽 문장을 남기지
       않기 위해), 본문에 흘러든 한자 낱글자는 지운다. 한글(가-힣)은 건드리지 않는다. */
    const aiFriendStripHanzi = (s: string) => {
      let r = String(s || '');
      const HAN = /[㐀-䶿一-鿿]/;
      r = r.replace(/\(?\s*💡[^\n)]*\)?/g, (m) => (HAN.test(m) ? '' : m));
      return r.replace(/[㐀-䶿一-鿿]+/g, '').replace(/[ \t]{2,}/g, ' ').trim();
    };

    // ── POST /api/ai/chat-guest-token — 비로그인 게스트용 세션 스코프 uid + 서명 토큰 발급 ──
    //   클라이언트가 임의 uid 를 만들어 보내는 것을 금지 (IDOR 방지). 게스트 uid 는
    //   서버가 발급한 추측 불가 랜덤값 + 단기 토큰만 허용, sessionStorage 에만 보관.
    if (method === 'POST' && path === '/api/ai/chat-guest-token') {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      const guestUid = 'guest_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      return json({ ok: true, uid: guestUid, token: await signUidToken(guestUid, env, 7 * 86400 * 1000) });
    }

    // ✋ A.i 선생님 수업 — 학생 질문 즉답. 판정·상한·파싱은 전부 class-ask.ts 정본(여기는 부르기만)
    if (method === 'POST' && path === '/api/ai/class-ask') {
      const askDeps = { json, recordFailure: (f: any) => recordAiFailure(env, f), linkRule: connectorRule('beginner'), koOk: (s: string) => !looksGarbledKo(s) };
      // 📡 `stream: 1` 이면 영어 답을 생성되는 즉시 흘려보냅니다(없으면 예전 응답 그대로)
      const peek: any = await request.clone().json().catch(() => ({}));
      if (wantsClassAskStream(peek)) return handleClassAskStream(request, env, askDeps);
      return handleClassAsk(request, env, askDeps);
    }

    if (method === 'POST' && path === '/api/ai/chat-friend') {
      /* ⏱ (2026-09-11) 지연 계측 시작 — 여기가 «학생이 기다리기 시작하는» 자리입니다.
         ⛔ warmup_session_log.first_reply_at 을 지연으로 읽지 마세요: 그 칸은 «학생이
            첫마디를 뗀» 시각(사람 반응 시간)이지 시스템 지연이 아닙니다. 정본 ai-latency-log.ts */
      const latT0 = Date.now();
      let latModelMs = 0;   // 모델 호출에 실제로 든 시간의 «합»
      let latTries = 0;     // 모델을 몇 번 불렀나 (폴백·재시도 포함)
      await ensureChatSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      const msg = String(b.msg || '').trim();
      /* 🎯 집중교정이면 옛 게이트(두 번째부터·연달아 막기)를 건너뛰고 검증된 교정을 매번 보여 준다(2026-10-31). */
      const friendMode = correctionModeOf(b.correction_mode);   // 🎚️ 값이 없으면 집중교정
      const immediateFix = friendMode === 'focused';
      /* 🎯 발음 교정 — 집중교정 + 음성(WAV) + 기준 낱말이 있을 때만 Azure 발음평가를 «미리» 돌린다.
         응답을 기다리게 하지 않으려고 여기서 시작하고, 응답을 만들 때 결과만 받는다(실패는 null). */
      const pronIn: any = (friendMode === 'focused' && b.pron && typeof b.pron === 'object') ? b.pron : null;
      const pronP: Promise<any> = pronIn ? assessPronFix(env as any, pronIn.audio_b64, pronIn.target) : Promise.resolve(null);
      /* 🪜 여덟 칸으로 넓히면서, 학생 브라우저에 남아 있는 옛 키(A1…C1)도 그대로 받습니다.
         ⛔ 정규화를 빼면 옛 값이 «모르는 값» 이 되어 조용히 기본값으로 떨어집니다 —
            학생이 고른 레벨이 리셋된 것처럼 보입니다. */
      const level = aiFriendNormalizeLevel(b.level);
      const persona = String(b.persona || 'friendly').trim(); // friendly | playful | serious | tutor
      /* 🗺 (2026-07-29 학생 제보) "영화 주제로 들어왔는데 처음엔 동물 얘기를 물어봤어요".
         지금까지 주제 카드는 영어 문장 한 줄을 대신 보내주는 게 전부였고, 그 다음 턴부터는
         모델이 주제를 붙잡아 둘 근거가 아무것도 없었다(게다가 시스템 프롬프트가 재미난
         사실 예시로 'animals' 를 맨 앞에 박아둬서 첫 턴부터 동물로 새기 쉬웠다).
         이제 고른 주제를 매 요청에 실어 보내 대화 내내 유지한다. */
      const topic = String(b.topic || '').trim().slice(0, 40);
      if (!uid || !msg) return json({ ok: false, error: 'uid_and_msg_required' }, 400);
      if (msg.length > 500) return json({ ok: false, error: 'msg_too_long' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰의 uid 와 요청 uid 일치 필수
      const authUid = await authUidGlobal(request, url, env, b);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);

      // 🐢 (2026-07-27) 응답 지연 최소화 — 서로 무관한 조회들을 순서대로 기다리지 않고 한꺼번에 보낸다.
      //   (gamSnapshot 은 "오늘 몇 번째 대화인가"를 이번 메시지가 기록된 뒤에 세야 정확해서
      //   여기서 같이 시작하지 않는다 — 채팅 로그 저장 이후에 계산한다.)
      const [recent, st, wk, turns, goalNow, pastFixes, vw]: any[] = await Promise.all([
        /* 🔁 40줄 + 시각 — «같은 질문 두 번 금지» 의 기억(qmem)은 지금 이어지는 대화(1시간 넘게 쉬면 끊음) 40줄까지 본다.
           ⚠️ 모델에게 보여 주는 대화(history)는 예전처럼 최근 20줄만 — 지시를 늘리지 않는다. */
        env.DB.prepare(`SELECT role, content, created_at FROM ai_friend_chats WHERE student_uid = ? ORDER BY id DESC LIMIT 40`).bind(uid).all(),
        env.DB.prepare(`SELECT english_name, korean_name, textbook, level FROM students_erp WHERE user_id = ? LIMIT 1`).bind(uid).first().catch(() => null),
        // 🎯 약점 단어 — 정본 src/weak-words.ts(최근 60일 · 최근 먼저). 오래된 약점을 «요즘» 으로 말하지 않게.
        env.DB.prepare(`SELECT item, ko FROM game_progress WHERE user_id = ? AND lang = 'en' AND ${WEAK_WHERE} ORDER BY ${WEAK_ORDER} LIMIT 5`).bind(uid, weakSince(Date.now())).all().catch(() => null),
        /* ✏️ 교정 게이트용 «몇 번째 턴인가» — 반드시 «단조 증가» 해야 한다.
           ⛔ history.length 로 세지 말 것: 위 조회가 LIMIT 20 이라 그 값은 곧 상한에 붙고,
              그러면 turnCount - lastShownTurn 이 영영 0 이 되어 교정이 통째로 멎는다
              (웜업 쪽은 2026-10-18 에 세션별 KV 카운터로 고쳤다 — src/index.ts «warmupturn:»).
           ⛔ 조회가 실패해도 막지 않는다 — 0 이면 turnNo 가 1 이 되고, 뜻이 달라지는 교정(major)은
              그때도 뜹니다. 다만 «계속» 실패하면 turnNo 가 1 에 고정되어 «작은 실수는 두 번째부터»
              쪽이 멎는다(아래 게이트 주석). */
        env.DB.prepare(`SELECT COUNT(*) AS n FROM ai_friend_chats WHERE student_uid = ? AND role = 'assistant'`).bind(uid).first().catch(() => null),
        // 🗓 강사가 정한 4주 목표(src/student-goal.ts) — 던지지 않는다(없으면 null).
        loadActiveGoal(env.DB, uid, Date.now()),
        // 🔁 최근 교정받은 표현(웜업·AI 친구) — 던지지 않는다(없으면 []). 정본 src/recent-mistakes.ts
        loadRecentMistakes(env.DB, uid, Date.now()),
        // 🔁 단어장에서 틀린 낱말 — 웜업·게임과 같은 정본(src/vocab-weak.ts). 던지지 않는다(없으면 []).
        loadVocabWeakRows(env.DB, uid, Date.now(), 5),
      ]);
      const historyAll = (recent.results || []).reverse();
      const history = historyAll.slice(-20);
      /* 🔁 (2026-10-28) 이 대화에서 «이미 물은 질문 → 학생 답» — 판정 정본 src/question-memory.ts.
         ⚠️ 마지막 AI 질문의 답은 이번 학생 말(msg)이다. 기록이 깨졌거나 질문이 없으면 null(= 예전 동작).
         ⛔ 던지지 않는다 — 기억을 못 만들어도 대화는 그대로 간다. */
      /* 🐢 학생이 «다시·천천히·모르겠어요» 를 부탁했거나 말이 잘려 «다시 말해 줘» 를 시킬 턴이면, 방금 질문을 다시 묻는 것이
         요청을 들어주는 것이다 — 그 질문은 기억에서 뺀다(reask). 그 앞에 물은 질문은 그대로 막는다.
         (2026-10-28 함정 대조 실측: 「Can you say that again slowly?」 → 「Sure! Is your dog big?」 가 새 질문으로 바뀌었다.)
         ⚠️ «요청» 판정은 정본 isReaskRequest — 아래 metaHint(aiFriendIsMetaAsk)와 정규식 원문이 같다(하니스 ①-18 대조).
            정본이 요청이라 하면 metaHint 도 반드시 켜진다 — 판정은 «다시 물어도 된다» 인데 지시는 안 시키는 일이 없게.
         🤷 (2026-11-05) «I don't know» 그 말만(isDontKnowAnswer)도 이번 턴엔 그 질문을 기억에서 뺀다 — dontKnowHint 가
            «같은 것을 쉽게·두 개 중 고르기로» 다시 묻게 하므로 그것이 반복으로 잡히면 안 된다. */
      const dontKnowTurn = isDontKnowAnswer(msg);
      const reaskTurn = isReaskRequest(msg) || dontKnowTurn || (aiFriendLooksCut(msg) && !aiFriendJustAskedAgain(history));
      let qmem: ReturnType<typeof questionMemory> = null;
      try { qmem = questionMemory(questionSession(historyAll, latT0), msg, { reask: reaskTurn }); } catch (e: any) { console.warn('[chat-friend] question memory failed:', e?.message || e); }
      const repN = (t: string): number => { try { return repeatedQuestions(t, qmem).length; } catch { return 0; } };

      /* 🧑 이름은 학생이 고른다(Emma·Jake·Lily·Noah) — 예전에는 네 갈래가 전부 "named Mango" 라,
         화면이 "Hi! I'm Lily." 라고 인사해 놓고 학생이 이름을 물으면 AI 가 다른 이름을 댔다
         (2026-08-31 사장님 제보). ⛔ 화면이 보낸 문자열을 그대로 넣지 말 것 — 정본 표를 거친다. */
      const friendName = resolveFriendName(b.friend);
      const personaMap: any = {
        friendly: `a warm, cheerful English friend named ${friendName} who loves cheering kids on`,
        playful: `a silly, joke-loving English buddy named ${friendName} who makes English feel like a game`,
        serious: `a calm, kind English study partner named ${friendName} who explains things clearly`,
        tutor: `a supportive English tutor named ${friendName} who gently corrects mistakes and celebrates progress`,
      };
      // 🎓 개인화(26-07-21) — 그 학생의 이름·교재·약점 단어를 아는 친구 (웜업 엔진과 동일 데이터 재사용).
      //    실패하면 조용히 일반 친구로 동작 — 채팅 흐름에 절대 영향 금지.
      /* 🎚 눈높이 규격 — 이 아래의 프롬프트·검사가 전부 이 하나를 봅니다(정본 src/ai-friend-level.ts).
         ⚠️ 여기서 만들어야 합니다 — 아래 stuCtx(약점 단어)가 lvSpec.plain 을 읽습니다. */
      const lvSpec = aiFriendLevelSpec(level);
      let callName = '';
      // latinOnly — 답장의 한글은 지워지므로(stripAddedKorean) 한글 이름만 있으면 이름 없이 부른다
      try { callName = studentCallName(st, uid, { latinOnly: true }); } catch { callName = ''; }
      let stuCtx = '';
      try {
        /* 🧑 (2026-11-01) 이름 칸에 아이디가 든 학생이 있어 「Yay, ysyt01!」 이 나갔다 — 정본 src/student-call-name.ts
           ⛔ english_name 을 그대로 쓰지 말 것 · 이름이 없으면 아이디 대신 «이름 없이» 부른다. */
        const sname = callName;
        const textbook = String(st?.textbook || '').trim().slice(0, 60);
        // 단어장 약점 먼저, 게임 약점 다음 — 합치기·정리 정본 friendWeakList(src/vocab-weak.ts)
        const weak = friendWeakList(vw || [], (wk?.results as any[]) || [], 5);
        const parts: string[] = [];
        if (sname) parts.push(`Their name is "${sname}" — greet or cheer them by name sometimes. Never call them by any username or login ID.`);
        else parts.push(`You do not know their name — cheer them without a name (e.g. "Great job!"). Never call them by a username or login ID, and never make up a name.`);
        if (textbook) parts.push(`They study the textbook "${textbook}" — occasionally relate the chat to what they learn there.`);
        if (weak.length && !lvSpec.plain) parts.push(`Words they recently got wrong in their word book, games or quizzes: ${weak.join(', ')}. Once in a while, weave ONE of these words naturally into your reply or question (never quiz the whole list at once). Cheer loudly when they use one correctly.`);
        if (parts.length) stuCtx = `\nAbout THIS student (use naturally in conversation — never recite this list):\n- ${parts.join('\n- ')}`;
      } catch { /* 개인화 실패 무시 */ }

      const wodNow = aiFriendWordOfDay();
      // 🗺 학생이 고른 주제 — 대화 내내 이 주제 안에서 논다. 학생이 스스로 다른 얘기를 꺼내면 따라간다.
      /* 🔴 2026-09-03 수리 — 주제는 «울타리» 가 아니라 «시작점» 이다.
         옛 문구는 「Stay on THIS topic / every question must be about it / Do NOT switch」
         세 겹 금지였고, 「학생이 딴 얘기를 꺼내면 따라가라」는 괄호로만 붙어 있어 모델이
         강한 금지 쪽을 따랐다. 벨잉글리시 원장님 제보 「대화가 매끄럽게 이어지지 않고,
         정해진 문장 안에서만 하는 느낌」의 1순위 원인.
         ⛔ 다시 «금지» 로 되돌리지 말 것 — 주제는 «대화가 멈췄을 때만» 꺼낸다.
         ℹ️ 문장 길이·난이도는 이 줄과 무관하게 lvSpec 이 그대로 강제하므로 기초 학생도 안전하다. */
      const topicCtx = topic
        ? `\nThe student picked "${topic}" as a starting point. Open there, then FOLLOW THE STUDENT: if they bring up anything else — their dog, their day, a game, a feeling — get curious about THAT and stay with it. Only steer back to "${topic}" when the chat stalls and they have nothing to say.`
        : '';
      /* 🗓 (2026-10-10) 강사가 정한 4주 목표 — 대화를 «그 연습 쪽으로 살짝» 기울인다.
         ⛔ 목표는 사람(강사)이 정한다 — 여기서 AI 가 목표를 고르거나 바꾸지 않는다.
         ⛔ «학생을 따라간다» 규칙을 이기지 않게 «기회가 될 때» 로만 쓴다(goalPromptLine 문구). */
      const goalCtx = goalPromptLine(goalNow || null);
      /* 🔁 (2026-10-18 개선안 1순위 ②) 지난번에 고쳐 준 표현을 «다시 맞게 써 볼 기회» 로.
         ⛔ «학생을 따라간다»·눈높이 규칙을 이기지 않게 «자연스러울 때만» (recentMistakesPromptLine 문구). */
      const mistakeCtx = recentMistakesPromptLine(pastFixes || [], !!lvSpec.plain);
      // 🇰🇷 표에 있는 콩글리시를 썼으면 답장에서 자연스러운 말을 한 번 써 보이게(정본 konglish.ts)
      const konglishCtx = konglishPromptLine(msg);
      /* 🎚 기초 단계(A1·A2)에서는 «길이를 늘리는 규칙» 을 끕니다.
         재미있는 사실 한 줄이 붙는 순간 3~5단어 문장은 지킬 수 없습니다 — 실측된 45단어짜리
         A1 답변이 정확히 그 모양이었습니다(칭찬+사실+설명+질문). 약점 단어 끼워 넣기도 같은 이유로
         위 stuCtx 에서 함께 껐습니다. ⛔ 대신 «오늘의 단어» 는 남깁니다 — 그건 학생이 쓰면
         포인트를 받는 퀘스트라, 빼면 기초 학생만 그 퀘스트를 못 깨게 됩니다. */
      /* ❓ 2026-09-03 — 되묻기 강제를 «상급에서만» 완화한다.
         기초(plain)에서는 그대로 둔다: 기초 학생은 스스로 말을 못 꺼내서 질문이 없으면
         대화가 그 자리에서 끝난다. 반대로 상급에서는 매 턴 질문이 «취조» 처럼 느껴져
         「정해진 문장 안에서만 한다」의 2순위 원인이 됐다(원장님 제보).
         ⛔ 기초 쪽을 함께 풀지 말 것. */
      /* 🔴 2026-09-09 사장님 「질문과 대답이 서로 맞지 않아」 — 화면 실측:
           학생 "What is your favorite food?" → AI "Cool! Do you have a favorite food?"
           학생 "What did you do yesterday?"  → AI "Ooh nice one! Did you eat food yesterday?"
         물어본 것에 «대답» 을 하지 않고 되묻기만 했습니다. 모델이 아니라 규격 탓이었습니다 —
         기초 단계 규칙이 「칭찬 하나 + 질문 하나가 전부」라고 못 박아 대답이 들어갈 자리가
         아예 없었고, 트리머도 대답을 버렸습니다(ai-friend-level.ts 참고).
         ⛔ 되묻기 강제를 «없애서» 풀지 마세요 — 기초 학생은 질문이 없으면 대화가 그 자리에서
            끝납니다(2026-09-03 결정). 여기서 하는 일은 «물어본 턴에만» 대답을 먼저 시키는 것입니다. */
      const studentAsked = aiFriendStudentAsked(msg);
      /* 🙋 (2026-11-05 사장님 「F1~F5 진행」) 첫마디 줄(THIS TURN'S OPENER)과 «무엇보다 먼저 대답» 이 같은 첫 자리를 다퉜다 —
         「What about you?」 에 대답한 것이 10/21 이후 4번 중 1번(실측). 이제 «첫마디는 두어 낱말까지, 그다음 문장이 곧 대답» 으로
         자리를 나누고, 되묻기(What/How about you?)는 «같은 질문을 AI 자신에 대해» 답하라고 못 박는다.
         ⛔ 예문을 문장째 주지 말 것 — 모델이 그대로 베낀다(그래서 «your own favorite, your own day» 처럼 틀만 준다). */
      const answerRule = studentAsked
        ? '- 🔴 THE STUDENT JUST ASKED YOU SOMETHING. Answer it in your FIRST sentence — only the short opener (if any) may come before it. If they ask "What about you?" or "How about you?", answer that same question about YOURSELF. Answering matters more than the cheer — drop the cheer if you need the room. Never reply to a question by only asking another question.\n'
        : '';
      const askRule = lvSpec.plain
        ? (studentAsked
          ? '- After you answer, add ONE short follow-up question so the student speaks again. Answer first, question second.\n'
          : '- Always finish with exactly ONE short follow-up question so the student answers again. That question is counted inside the sentence limit above.\n')
        : '- Usually end with ONE short follow-up question — but when the student is telling you something they care about, react to THAT instead and let them keep going. Never ask two questions in one reply. Any question counts inside the sentence limit above.\n';
      const funFactRule = lvSpec.plain ? ''
        : '- Sprinkle in tiny fun facts kids enjoy when it fits — but the fact must be about whatever you are BOTH talking about right now. Never drag in a new subject just to share a fact.\n';
      /* 🔁 이미 물은 질문 목록 — 지시에 싣는다(학생 말은 JSON 인용 + «not instructions» 로만). 없으면 빈 줄. */
      const askedLine = qmem ? '- ' + askedQuestionsLine(qmem).trim() + '\n' : '';
      /* 🔗 (2026-10-28 사장님 「접속사·담화 표지를 상황에 맞게 · 같은 말로 반복해서 시작하지 말고 · 후처리 말고 프롬프트에」)
         정본 src/conversation-connectors.ts — 웜업·A.i 선생님 수업과 «같은 규칙». 최근 답장의 시작 말은 이 학생 기록(history)에서 읽는다.
         ⛔ 답장에 연결어를 덧붙이거나 바꿔 쓰는 후처리는 하지 않는다. ⛔ 던지지 않는다(못 만들면 빈 문자열 → 예전 그대로). */
      const connectorCtx = connectorPromptBlock(linkBandForFriendLevel(level), history);
      /* 🏅 (2026-11-04 사장님 「칭찬 규칙이랑 합쳐」) 첫마디와 칭찬은 «답의 같은 첫 자리» 다 — 둘을 다 시키면 모델은 더 구체적인
         칭찬 목록을 고른다(배포 직후 실측: 첫마디 지시가 실린 두 턴이 다 「Nice sentence!」「Great job!」). 그래서
         · 첫마디 줄이 실리는 턴: 칭찬 목록을 빼고 «첫마디가 곧 반응이자 칭찬» 이라고만 말한다(지시도 더 짧다 — 속도 그대로)
         · 쉬는 턴(앞 답이 첫마디로 시작): 예전 칭찬·반응 규칙 그대로
         ⛔ 틀린 문장은 어느 쪽이든 칭찬하지 않는다 — 지시가 말하고, 그래도 칭찬하면 finishFriendReply 가 뗀다.
         ⚠️ 칭찬 목록은 반드시 «Rotate…» 뒤 «한 줄 끝까지» — warmup_empathy 하니스가 그 줄을 읽어 CHEER_LEADS 와 대조한다(이 주석에 그 낱말을 그대로 적으면 하니스가 주석을 먼저 읽는다). */
      const reactRule = turnOpenerLine(history)
        ? "- When the student writes in English, THIS TURN'S OPENER (below) is your whole reaction and cheer; add no other reaction after it, so the reply is not longer."
        : `- When the student writes in English, open with a SHORT, real reaction to what they said — a few words about their idea ("A quiet day can be nice.", "Camping with your brother sounds fun!") or, when they did well, a cheer (never cheer English that has a mistake). Do not open every reply the same way; when you cheer, pick a DIFFERENT one from the last two you used. Rotate freely: Nice!, Great try!, Ooh nice one!, That's right!, Wow!, Yes!, Perfect!, Cool!, Awesome!, You got it!, Well said!, Nice sentence!, I like that!, Good one!, Haha nice!`;
      // Voice turns should reach the next question quickly without truncating JSON,
      // dropping answers, changing the model, or overriding the student's level.
      const voiceTurnRule = b.via === 'voice'
        ? '- VOICE CONVERSATION: Keep reply to one brief, relevant response and at most ONE short follow-up question (normally 2 sentences, about 20 words total). A short contextual opener may introduce the useful response within this same budget; skip empty stalling, repeated praise, and optional fun facts. If the student asked a question, answer it first; take the extra sentence allowed by LEVEL when needed. Keep complete grammar and obey the stricter LEVEL limits. Keep corrections in fix, outside the spoken reply.\n'
        : '';
      const system = `You are ${personaMap[persona] || personaMap.friendly}. You chat with a young Korean student at CEFR level ${level}.${stuCtx}${topicCtx}${goalCtx}${mistakeCtx}${konglishCtx}
Rules:
- Ground your response in the student's actual words and the recent conversation. Never invent a preference, event, or answer for them. If a fragment is ambiguous (for example "You"), ask ONE simple clarification instead of guessing its meaning or changing the subject. A short clear answer such as "Yes" or "No" is valid in context.
- Your name is ${friendName}. If the student asks your name, say "${friendName}" — never invent a different name.
- LEVEL — this is the MOST IMPORTANT rule. Obey it even if it means dropping something else you wanted to say. ${lvSpec.rule}${studentAsked ? ' (Exception for THIS reply only: you may use one extra sentence so that your answer fits. Keep every word limit above.)' : ''}
${answerRule}${askRule}${voiceTurnRule}${reactRule}
${FRIEND_EMPATHY_RULE}
${AVATAR_NATURAL_OPENERS}\n${connectorCtx ? connectorCtx + '\n' : ''}- Use 1-2 fun emojis per reply. Kids love them.
- If the student writes Korean, warmly invite them to try English and give one simple example sentence they can copy.
- NEVER write Korean inside "reply". Do not translate your own English, and do not add a grammar tip there — corrections go in the "fix" field below, which the student sees as its own card. Showing Korean next to the English stops them from reading the English at all, and they have a separate button for the meaning.
- NEVER use Chinese characters (한자) or Japanese anywhere.
${funFactRule}- Today's special word is "${wodNow.w}" (Korean: ${wodNow.ko}). Use it only when it fits the talk — never force it into an unrelated sentence or use it after sad news; skipping it is fine. Cheer loudly if the student uses it.
- NEVER repeat a reply you already gave. Every reply must be new — new words, a new question.
${askedLine}- A short answer is a GOOD answer. "Yes.", "Movies!", "I like it." are complete — just reply happily and keep the chat going. Only ask them to repeat when the message truly breaks off mid-word ("I", "and my"), and NEVER ask twice in a row: if your last reply already asked them to repeat, answer whatever you did understand this time.
- If the student asks you to slow down, repeat, or speak more simply (in English or Korean), FIRST agree to that request and then do it — use shorter, easier sentences right away, but keep every sentence complete and correct. Never ignore the request and carry on with your own topic.
- "I don't know" means they don't know the answer, not "slow down": help with the same question (easier words or two choices). If they add something else, follow that.
- Never break character. Never say you are an AI. Never use words far above the student's level.
${AI_FRIEND_CORRECTION_RULE}
${immediateFix ? FOCUSED_DRAFT_RULE : ''}`;

      const messages: any[] = [{ role: 'system', content: system }];
      for (const h of history) {
        /* 🧑 예전 답장에 남은 아이디(「Yay, ysyt01!」)를 모델이 따라 하지 않게 «보여 줄 사본» 에서만 이름으로 바꾼다.
           ⚠️ D1 기록은 그대로 둔다. */
        const content = h.role === 'user' ? h.content : scrubLoginId(h.content, uid, callName || 'friend');
        messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content });
      }
      /* 🎤/🐢 이번 발화가 '잘린 조각' 이거나 '천천히 해달라'는 부탁이면, 그 사실을 모델에게
         명시적으로 알려준다. 규칙만으로는 모델이 직전 답변을 그대로 복사해 버린다. */
      /* 🔁 두 번 연속 되묻기 금지 — 직전 답이 이미 "다시 말해줄래?" 였으면 이번엔 되묻지 않고
         알아들은 만큼이라도 받아준다. (제보 영상에서 네 턴 내리 되물어 학생이 포기했다.) */
      const cutHint = (aiFriendLooksCut(msg) && !aiFriendJustAskedAgain(history))
        ? ` [The student's message is very short or cut off — do NOT guess and do NOT repeat your last reply. Reply in ONE short line and ask them to say the whole sentence again.]`
        : (aiFriendLooksCut(msg)
          ? ` [You already asked them to repeat last time — do NOT ask again. Warmly answer whatever you did understand and ask ONE easy question.]` : '');
      /* 🔴 (2026-11-05 실측) 옛 문구 「much shorter and easier words」 를 모델은 «문법 낱말을 버려라» 로 읽었다 —
         「Yes! You like bike. Do you ride bike today?」·「You like movie. What movie?」. 짧게 하되 «완전한 문장» 을 함께 못 박는다. */
      const metaHint = aiFriendIsMetaAsk(msg)
        ? ` [The student is asking you to slow down / repeat / speak more simply, or did not understand you. Agree in a word or two first (for example "Sure!"), then say it again in shorter, easier words — but keep every sentence complete and correct: never drop little words like "do", "a" or "the".]`
        : (dontKnowTurn
          ? ` [The student does not know the answer to your last question. That is okay — say so kindly, then ask the same thing again in an easier way, with two choices to pick from. Use complete, correct sentences and stay on the same topic.]`
          : '');
      messages.push({ role: 'user', content: msg + cutHint + metaHint });

      // env.AI 가 binding 안되어 있을 가능성 방어
      if (!env.AI) {
        return json({ ok: false, error: 'AI_binding_missing', detail: 'env.AI binding not configured' }, 503);
      }

      /* 📡 A-1 (2026-09-11) — «답이 다 만들어진 뒤에» 읽기 시작하던 것을, 문장이 끝날 때마다
         먼저 흘려보냅니다. 학생 121명 중 41명(34%)이 1턴만 하고 나가는데(D1 실측), 그것이
         «느려서» 인지 가리려고 A-3 로 재기 시작했고 이 갈래가 그 기다림을 줄입니다.

         ⛔ 옛 화면은 이 갈래를 모릅니다 — `stream` 을 안 보내면 지금까지와 «한 글자도»
            다르지 않습니다(응답 계약 유지). 스트리밍은 옵트인입니다.
         ⚠️ 아래 본 처리는 «들여쓰기를 일부러 안 바꿨습니다» — 함수로 감싸기만 해서
            diff 가 «앞뒤 몇 줄» 로 끝나게(340행을 밀면 무엇이 바뀌었는지 못 읽습니다).
         ⚠️ 스트리밍으로 보내는 것은 «미리보기» 이고 정본은 done 이벤트의 reply 입니다 —
            재시도(반복·이름·눈높이)가 돌면 답이 바뀌기 때문입니다(그때 replaced:1). */
      const wantStream = (b.stream === 1 || b.stream === true || b.stream === '1');
      let sseSend: ((o: any) => void) | null = null;

      const runTurn = async (): Promise<any> => {
      // 여러 모델 후보로 폴백 — 일부 모델이 지역/계정에서 사용 불가일 수 있음
      const models = [
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-3-8b-instruct',
      ];
      let reply = '';
      let lastErr: any = null;
      let usedModel = '';
      /* ✏️ 교정 카드 (2026-09-09) — 모델 출력이 이제 JSON({reply,fix}) 이다.
         ⚠️ 아래 «네 자리»(첫 호출·반복 재시도·이름 재시도·눈높이 재시도)가 전부 takeFriendReply 를
            지나야 한다. 하나라도 빼먹으면 그 경로만 조용히 중괄호를 학생 화면·TTS 로 내보낸다
            (웜업에서 실제로 그 사고가 났다 — "[object Object]", 2026-09-08).
         fix 는 «그 답장을 실제로 채택했을 때만» 확정한다(commitFix) — 재시도 답장이 거절될 수
         있는데 파싱하자마자 덮으면 화면의 답장은 옛것인데 카드만 새 답장의 것이 된다. */
      let rawFix: any = null;
      let stagedFix: any = null;
      let focusedFix: any = null;
      let friendPlain = 0;   // 모델이 «평문» 을 준 횟수 — 조용히 옛 동작으로 돌아가지 않게 남긴다
      let friendEmpty = 0;   // 빈 응답 — 위와 «다른 사실» 이라 한 숫자로 뭉치지 않는다
      let friendRF = true;   // response_format 을 거부하는 모델이면 한 번 끄고 다시(선례: 웜업)
      const friendAIOpts = (msgs: any[], maxTokens: number, temperature: number): any => {
        const o: any = { messages: msgs, max_tokens: maxTokens, temperature };
        if (friendRF) o.response_format = { type: 'json_object' };
        return o;
      };
      /* ⛔ 재시도는 «제약이 원인일 때» 만 — 판정 정본은 warmup-correction.ts 의 isRfRejection.
         `if (!friendRF) throw` 로만 가르면 429·타임아웃까지 이 분기로 들어와, 일시 장애 한 번에
         JSON 모드가 꺼지고 그 요청의 남은 경로가 통째로 옛 동작이 된다. */
      const runFriend = async (model: string, msgs: any[], maxTokens: number, temperature: number, overlap = false): Promise<any> => {
        /* ⏱ 모델 호출만 따로 잽니다 — 전체 시간에서 이것을 빼면 «우리 코드가 쓴 시간» 이 나옵니다.
           ⚠️ 실패한 호출도 셉니다(그 시간도 학생은 기다립니다). finally 로 두는 이유입니다.
           🎚️ overlap = 본 호출과 «동시에» 도는 호출(균형 다시 묻기) — 그 시간은 여기서 안 더한다.
              겹친 시간까지 더하면 model_ms 가 전체 ms 보다 커진다. 안 겹친 나머지는 기다리는 쪽이 더한다. */
        const mT0 = Date.now();
        latTries++;
        try {
          return await env.AI.run(model, friendAIOpts(msgs, maxTokens, temperature));
        } catch (rfErr: any) {
          if (!friendRF || !isRfRejection(rfErr)) throw rfErr;
          console.warn('[chat-friend] response_format rejected, retrying without:', rfErr?.message || rfErr);
          friendRF = false;
          latTries++;
          return await env.AI.run(model, friendAIOpts(msgs, maxTokens, temperature));
        } finally {
          if (!overlap) latModelMs += Date.now() - mT0;
        }
      };
      /* ⚠️ 정본에 «응답 객체» 를 통째로 넘기면 안 된다 — JSON 모드에서는 response 가 이미
         파싱된 객체일 수 있고, 그것을 문자열로 굳히면 "[object Object]" 가 된다.
         저장소의 다른 다섯 곳과 같은 모양으로 읽는다(2026-09-08 실사고). */
      const takeFriendReply = (r: any): string => {
        const parsed = parseWarmupOutput(
          typeof r === 'string' ? r : (r?.response ?? r?.result?.response ?? r?.result ?? '')
        );
        stagedFix = parsed.fix;
        if (!parsed.reply) friendEmpty++;
        else if (!parsed.json) friendPlain++;   // 평문이 왔다 = 프롬프트가 안 먹은 것
        return parsed.reply;
      };
      const commitFix = () => { rawFix = stagedFix; };
      /* 📡 스트리밍 호출 (A-1) — «첫 모델에만» 씁니다.
         ⛔ 폴백·재시도까지 흘리면 이미 보낸 문장과 새 답이 뒤섞입니다. 그것들은 비스트리밍으로
            돌고, 답이 바뀌면 done 의 replaced:1 로 화면이 다시 읽습니다.
         ⛔ 모델 조각을 그대로 내보내지 않습니다 — JSON 모드라 `{"reply":"Hi th` 같은 부분
            JSON 이 옵니다. createJsonTextTap 이 «값 문자열 안» 글자만 통과시켜 구조 문자가
            학생 화면에 못 갑니다(2026-09-08 에 두 번 낸 사고의 방어).
         ⛔ 문장이 끝나기 «전» 에는 안 보냅니다 — 운율이 문장 단위라 토막 내 읽으면 소리가 깨집니다. */
      let streamedText = '';
      let streamTried = false;
      /* 🎚️ (2026-11-03) 이 턴의 계획 — 규칙으로 잡힌 교정·칭찬 위험·균형 «다시 묻기» 여부(순수 함수, 던지지 않음).
         ⚠️ 잘린 말·«천천히 말해 줘» 같은 부탁은 교정할 문장이 아니다(cut). */
      const turnPlan = planFriendTurn(friendMode, msg, { cut: aiFriendLooksCut(msg) || aiFriendIsMetaAsk(msg) || dontKnowTurn });   // «I don't know» 그 말만은 교정할 문장이 아니다(예전처럼 다시 묻기 안 함 — 속도 그대로)
      /* 🔁 미리듣기 멈춤 — 이 대화에서 이미 물은 질문이 나오면 그 문장부터 안 흘려보낸다(최종본은 아래에서 다시 뽑힌다).
         안 멈추면 학생이 같은 질문을 «먼저 듣고», 그다음 바뀐 답을 또 듣는다.
         ⚠️ 시간 예산을 넘긴 턴은 다시 안 뽑으니 멈추지도 않는다(웜업 createWarmupLive 와 같은 규칙).
         ⚠️ 판정이 던지면 «멈추는» 쪽 — 최종본은 done 으로 그대로 간다. */
      let streamHalt = '';
      /* 🎚️ (2026-11-03) 교정이 올지 모르는 동안 미리듣기를 «잡아 두는» 문 — 정본 src/friend-correction-flow.ts.
         균형: 교정이 있으면 미리듣기를 접고 정본(고친 문장 먼저)을 한 번에 읽힌다 / 없으면 잡아 둔 문장을 바로 보낸다.
         ⚠️ «실제로 보낸» 문장만 streamedText 에 넣는다(replaced 판정). */
      const previewGate = createFriendPreviewGate(turnPlan, (sen: string) => {
        streamedText += (streamedText ? ' ' : '') + sen;
        if (sseSend) sseSend({ t: sen });
      });
      const liveSend = (sen: string) => {
        if (streamHalt) return;
        if (friendMode === 'focused') { streamHalt = 'focused'; return; }
        let stop = false;
        try { stop = !!qmem && Date.now() - latT0 <= FRAG_RETRY_BUDGET_MS && repeatedQuestions(sen, qmem).length > 0; } catch { stop = true; }
        if (stop) { streamHalt = 'repeat'; return; }
        previewGate.push(sen);
      };
      const runFriendStreaming = async (model: string, msgs: any[], maxTokens: number, temperature: number): Promise<any> => {
        const mT0 = Date.now();
        latTries++;
        try {
          const st: any = await env.AI.run(model, { ...friendAIOpts(msgs, maxTokens, temperature), stream: true });
          /* 스트림이 아니면(모델·계정이 지원 안 함) 그대로 돌려줘 옛 경로가 받습니다. */
          if (!st || typeof st.getReader !== 'function') return st;
          const tap = createJsonTextTap('reply');
          const rd = st.getReader();
          const dec = new TextDecoder();
          let line = '', raw = '', pend = '';
          for (;;) {
            const { value, done } = await rd.read();
            if (done) break;
            line += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = line.indexOf('\n')) >= 0) {
              const one = line.slice(0, nl).trim();
              line = line.slice(nl + 1);
              if (!one.startsWith('data:')) continue;
              const pay = one.slice(5).trim();
              if (!pay || pay === '[DONE]') continue;
              let t = '';
              try { const ev: any = JSON.parse(pay); t = String(ev?.response ?? ''); } catch { continue; }
              if (!t) continue;
              raw += t;
              pend += tap.push(t);
              const cut = takeSentences(pend);
              pend = cut.rest;
              for (const sen of cut.out) liveSend(sen);
              previewGate.raw(raw);   // 🎚️ fix 칸이 null 인지 객체인지 보이는 순간 미리듣기를 열거나 접는다
            }
          }
          const tail = String(pend || '').trim();
          if (tail) liveSend(tail);
          previewGate.streamEnd(raw);   // 🎚️ fix 칸을 못 봤으면 «없음» 으로 본다
          return { response: raw };
        } finally {
          latModelMs += Date.now() - mT0;
        }
      };
      /* 🎚️ (2026-11-03) 균형 «교정만 다시 묻기» — 본 대화 호출과 «동시에» 시작한다(기다림이 합이 아니라 둘 중 긴 쪽).
         [왜] "My birthday was tomorrow." 를 모델이 문법이 아니라 내용으로 받아 fix 를 비웠다(사장님 화면).
         ⚠️ 모델 시간(latModelMs)에는 «본 호출과 안 겹친 나머지» 만 더한다(아래 교정 블록) —
            겹친 시간까지 더하면 model_ms 가 전체 ms 보다 커져 «우리 코드 몫» 이 음수가 된다.
         ⛔ recheckBalancedFix 는 던지지 않는다(실패 = 교정 없음 = 고치기 전과 같음). */
      const recheckP: Promise<any> | null = turnPlan.recheck
        ? recheckBalancedFix(msg, async (msgs: any[]) => await runFriend(models[0], msgs, 480, 0.2, true))   // 480 = 집중교정 recoverFocusedFix 와 같은 여유(JSON 잘림 방지)
        : null;
      if (recheckP) recheckP.then((f: any) => previewGate.recheck(!!f));
      /* ⚡ (2026-11-06 사장님 「휴대폰 A.i 말하기 3카드 모두 아바타가 더 빨리 응답」) 집중교정 «교정만 다시 묻기» 를
         본 호출과 «동시에» 시작한다 / Focused mode: start the correction recheck alongside the main call.
         [왜] 예전에는 본 답이 «다» 만들어진 뒤에야 이 호출을 «차례로» 불렀다 — 맞는 문장(교정 없음)이면 매 턴
              모델 왕복이 하나 더 붙었고, 집중교정은 미리듣기가 없어서 그 시간을 학생이 통째로 기다렸다.
         ⚠️ 쓰는 «순서» 는 그대로다 — 모델의 교정 → 과거형 보완 → 콩글리시 → 답장 속 «You can say» → 이것(아래 waitFocusedRecover).
            그래서 규칙 보완이 잡는 문장이면 시작하지 않는다(어차피 안 쓰인다). 모델이 교정을 주면 결과를 버린다(호출 하나가 헛돈다 — 그 비용과 바꾼 것).
         ⚠️ 모델 시간(latModelMs)에는 «본 호출과 안 겹친 나머지» 만 더한다 — 균형 다시 묻기와 같은 규칙(overlap).
         ⛔ 던지지 않는다 — recoverFocusedFix 가 스스로 삼키고, 혹시 몰라 .catch 로 한 번 더 막는다(실패 = 교정 없음 = 예전과 같은 방향).
         ⚠️ 본 호출이 «먼저» 나가게 한 박자(마이크로태스크) 뒤에 시작한다 — 바로 아래 for 문이 await 없이 곧장 env.AI.run 을 부르므로
            그다음 차례에 이것이 돈다(여전히 «동시에»). 가짜 모델을 쓰는 하니스들이 «첫 호출 = 대화 답» 으로 대본을 짜 두었다
            (CLAUDE.md 2장 «새 모델 호출을 더하면 대본이 한 칸 밀립니다» — conversation_connectors 가 실제로 밀렸다). */
      const focusedRecoverP: Promise<any> | null =
        (immediateFix && !focusedCandidate(backfillPastTenseFix(msg), msg) && !focusedCandidate(konglishFix(msg), msg))
          ? Promise.resolve().then(() => recoverFocusedFix(msg, async (msgs: any[]) => await runFriend(models[0], msgs, 480, 0.2, true))).catch(() => null)
          : null;
      for (const m of models) {
        try {
          /* 스트리밍은 «한 번만» 시도합니다 — 실패하면 같은 모델을 옛 방식으로 다시 불러
             이득만 잃고 동작은 그대로입니다(최악이어도 고치기 전과 같음). */
          let resp: any;
          if (wantStream && sseSend && !streamTried) {
            streamTried = true;
            try {
              resp = await runFriendStreaming(m, messages, 300, 0.8);
            } catch (se: any) {
              console.warn('[chat-friend] stream call failed, falling back:', se?.message || se);
              resp = await runFriend(m, messages, 300, 0.8);
            }
          } else {
            resp = await runFriend(m, messages, 300, 0.8);
          }
          reply = takeFriendReply(resp);
          if (reply) { usedModel = m; commitFix(); break; }
        } catch (e: any) {
          lastErr = e;
          console.error(`[chat-friend] model ${m} failed:`, e?.message || e);
        }
      }
      /* 🔁 모델이 «전부» 실패했으면 잠깐 기다렸다 같은 요청 안에서 한 번 더 (2026-11-04 사장님 지시) — 정본 src/friend-retry.ts.
         Every model failed → wait briefly and retry once inside the same request.
         ⛔ 화면이 다시 보내게 하지 않습니다 — 학생 발화 저장·대화 포인트·발음 채점이 «두 번» 됩니다(그 파일 머리말).
         ⚠️ 이 자리는 «집중교정·같은 질문 다시 뽑기» 보다 앞이어야 합니다 — 살아난 답도 그 검사를 똑같이 지납니다.
         ⚠️ 첫 시도가 이미 오래 걸렸으면(9초 예산) 안 합니다. 던지지 않습니다.
         📏 살아난 턴은 ai_failure_log 에 'chat-friend-rescued' 로 남깁니다(학생 발화·답변 없이) —
            안 남기면 «첫 시도 실패» 가 통째로 안 보여 실패가 줄어든 것처럼 읽힙니다. */
      let friendRetry: FriendRetryResult | null = null;
      if (!reply) {
        friendRetry = await retryFriendModels({
          models, startedAt: latT0,
          call: (rm) => runFriend(rm, messages, 300, 0.8),
          take: (r) => takeFriendReply(r),
          onError: (rm, e: any) => { lastErr = e; console.error(`[chat-friend] retry model ${rm} failed:`, e?.message || e); },
        });
        console.warn('[chat-friend] retry', 'rescued=' + (friendRetry.reply ? 1 : 0), 'tries=' + friendRetry.tried, friendRetry.skipped);
        if (friendRetry.reply) {
          reply = friendRetry.reply; usedModel = friendRetry.model; commitFix();
          try {
            await recordAiFailure(env, {
              feature: 'chat-friend-rescued',
              models: models.join(','),
              err: String(lastErr?.message || lastErr || 'unknown'),
              rf: friendRF ? 1 : 0,
              plain: friendPlain,
              empty: friendEmpty,
              level,
            });
          } catch (e: any) {
            console.error('[chat-friend] recordAiFailure(rescued) failed:', e?.message || e);
          }
        }
      }
      /* 🔁 직전 답변과 (거의) 같은 말이 또 나오면 1회 재생성 — temperature 를 올리고 명시적으로 지시.
         (웜업 handleWarmupChat 과 동일한 방식. "I" 한 마디에 지난 답이 그대로 나오던 문제)
         🔁 (2026-10-28) «말만 바꾼 같은 질문»(big↔small · 방금 들은 white 되묻기)도 잡는다 — 판정·순서 정본 src/question-memory.ts.
         ⚠️ 그쪽은 시간 예산(FRAG_RETRY_BUDGET_MS) 안에서만, 최대 두 번 다시 뽑는다.
         ⚠️ 다시 뽑은 것이 «같은 질문이 없거나 줄었고» 글자 반복도 아닐 때만 받는다 — 아니면 원래 답(대화를 끊지 않는다).
         ⚠️ 던지지 않는다 — 모델이 던지면 거기서 멈추고 지금까지의 답을 쓴다. */
      if (reply && usedModel && immediateFix) {
        /* ⚡ 위에서 미리 시작한 다시 묻기를 받는다 — 안 겹친 나머지만 모델 시간에 더한다.
           ⚠️ 미리 부른 것은 첫 모델(models[0])이다. 본 답이 «폴백 모델» 에서 나왔고 미리 부른 것이 빈손이면
              예전처럼 그 모델로 한 번 더 묻는다(첫 모델이 흔들린 턴에 교정을 잃지 않게). */
        const waitFocusedRecover = async (): Promise<any> => {
          if (!focusedRecoverP) return await recoverFocusedFix(msg, (msgs) => runFriend(usedModel, msgs, 480, 0.2));
          const w0 = Date.now();
          let got: any = null;
          try { got = await focusedRecoverP; } finally { latModelMs += Date.now() - w0; }
          if (!got && usedModel !== models[0]) got = await recoverFocusedFix(msg, (msgs) => runFriend(usedModel, msgs, 480, 0.2));
          return got;
        };
        focusedFix = focusedCandidate(rawFix, msg)
          || focusedCandidate(backfillPastTenseFix(msg), msg)
          || focusedCandidate(konglishFix(msg), msg)
          || focusedReplyFix(reply, msg)
          || await waitFocusedRecover();
        if (focusedFix) { rawFix = focusedFix; reply = focusedFix.now; }
      }
      if (reply && usedModel && !focusedFix) {
        const rr = await retryRepeatedQuestion({
          text: reply, textRepeat: aiFriendIsRepeat(reply, history),
          repeatsOf: (t) => repeatedQuestions(t, qmem),
          inBudget: () => Date.now() - latT0 <= FRAG_RETRY_BUDGET_MS,
          ask: async (extra) => takeFriendReply(await runFriend(usedModel, messages.concat(extra), 220, 0.95)),
          acceptable: (t) => !aiFriendIsRepeat(t, history),
          onAccept: () => commitFix(),
          genericHint: '(You already said that. Say something completely different in new words, and ask a different question. Keep it to 1-2 short sentences.)',
          hintFor: repeatQuestionHintEn,
        });
        if (rr.tries || rr.error) console.warn('[chat-friend] repeat retry', 'tries=' + rr.tries, 'left=' + rr.left, 'lv=' + level, rr.error || '');
        reply = rr.text;
      }
      /* 🚨 모델이 «다» 실패한 경우 (2026-09-09 사장님 제보로 표시를 붙임).
         [잰 것 — 2026-09-09 D1 ai_friend_chats] 그날 AI 답 35건 중 폴백 2건이고, 그 2건이
         사장님 세션(22:33:17·22:33:37)에 «연달아» 나왔습니다. 직전 22:32:52 는 정상 답이었고
         9/1(80건)·9/2(53건)·9/3(10건)은 폴백 0건입니다.
         ⛔ 이 문장은 «AI 가 한 말» 이 아닙니다 — 학생이 무슨 말을 했든 똑같이 나오는 고정 문구라,
            공룡 얘기를 하던 학생에게 「오늘 뭐 먹었어?」 라고 되물어 «이해를 못 한다» 로 보입니다
            (사장님 화면 실측: 학생이 "I'm talking about a dinosaur." 라고 항의한 다음 턴에도 폴백).
         ✅ 그래서 «답» 인 척하지 않고 ai_unavailable 로 밝힙니다 — 화면이 그것을 보고
            안내로 그리고, 소리로 읽지 않고, 교정 카드도 안 붙입니다.
         🔴 «왜 실패했나» 를 Workers 로그로 찾으려 하지 마세요 — 2026-09-09 실측:
            `wrangler.toml` 이 `head_sampling_rate = 0.05` 라 **요청의 5% 만** 로그에 남습니다.
            사장님 세션 3건은 그래서 한 줄도 안 남았고(대시보드에서 22:41 → 22:32 로 건너뜀),
            제가 「로그가 정본」이라고 말씀드린 뒤에야 그 설정을 확인했습니다.
            ⛔ 그 비율을 올려서 풀지 마세요 — `wrangler.toml` 은 공동 금지구역입니다.
         ✅ 그래서 «실패했을 때만» 사유를 D1 에 한 줄 남깁니다(아래 recordAiFailure).
            폴백은 드물어서(9/9 하루 2건) 표가 커질 일이 없고, 사람이 대시보드를 뒤질 필요도 없습니다. */
      let usedFallback = false;
      if (!reply) {
        const fallbacks = [
          "Hi! 😊 I'm here. Tell me about your day in English!",
          "Hello! Let's practice some English together. What's on your mind?",
          "Hey there! 🥭 Try writing one sentence in English about what you ate today!",
        ];
        reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        usedFallback = true;
        console.error('[chat-friend] all models failed, using fallback. last error:', lastErr?.message || lastErr);
        /* ⛔ 기록이 대화를 막으면 안 됩니다 — 통째로 try/catch 이고 await 하지 않습니다.
           ⛔ 학생 발화·AI 답변은 «한 글자도» 싣지 않습니다(무엇이 실패했나만). */
        try {
          await recordAiFailure(env, {
            feature: 'chat-friend',
            // 🔁 재시도까지 했는지 함께 — «다시 해도 실패» 와 «시간이 넘어 안 함(budget)» 을 가릅니다(2026-11-04).
            //    ⚠️ 그래서 plain·empty 는 첫 시도 + 재시도를 합친 횟수입니다(최대 6).
            models: models.join(',') + (friendRetry ? ' | retry:' + (friendRetry.skipped || 'tried=' + friendRetry.tried) : ''),
            err: String(lastErr?.message || lastErr || 'unknown'),
            rf: friendRF ? 1 : 0,
            plain: friendPlain,
            empty: friendEmpty,
            level,
          });
        } catch (e: any) {
          console.error('[chat-friend] recordAiFailure failed:', e?.message || e);
        }
      }
      // 🈚 한자 섞임 정리 — 프롬프트 지시만으로는 모델이 가끔 어겨서, 저장·응답 전에 결정론적으로 거른다.
      reply = aiFriendStripHanzi(reply) || reply;
      /* KR 모델이 «친절하게» 덧붙인 한국어 번역을 뗀다 (2026-09-01 사장님 제보).
         프롬프트에 금지를 적었지만 이 저장소의 반복 실측이 「지시만으로는 안 지켜진다」라
         만든 뒤 확인하는 단계를 함께 둔다. 바로 위 한자 제거와 같은 자리·같은 방식이다. */
      if (hasAddedKorean(reply)) {
        console.warn('[chat-friend] stripped added Korean, len=' + reply.length);
        reply = stripAddedKorean(reply) || reply;
      }

      /* 🏷️ 이름을 어기면 다시 뽑는다 (2026-08-31 사장님 지시).
         바로 위 프롬프트가 「Your name is ${friendName} … never invent a different name」라고
         적어 두는데도 모델이 가끔 어깁니다 — 제보가 두 번 왔고 그때마다 «다른» 이름이었습니다
         (루이 → 로이). 매번 지어내는 것이라 화면 이름을 바꿔 맞추는 것은 과녁을 쫓는 일입니다.
         ⛔ 이름만 갈아 끼우지 않습니다 — 뒤따르는 말과 앞뒤가 안 맞을 수 있습니다.
         ⚠️ 두 번째도 어기면 그냥 내보냅니다 — 이름 한 번 틀린 것이 대화가 끊기는 것보다 낫습니다. */
      const badName = wrongSelfName(reply, friendName, { askedName: askedOwnName(msg) });
      if (badName && usedModel && !focusedFix) {
        console.warn('[chat-friend] wrong self-name:', badName, 'expected=' + friendName);
        try {
          const again: any = await runFriend(usedModel, messages.concat([
            { role: 'assistant', content: reply },
            { role: 'user', content: `(You said your name is ${badName}, but your name is ${friendName}. Say it again correctly.)` },
          ]), 160, 0.5);
          const rn = aiFriendStripHanzi(takeFriendReply(again));
          // 다시 뽑은 것이 «이름도 맞고 눈높이도 나빠지지 않을 때만» 받는다
          // 🔁 그리고 «이미 물은 질문» 을 새로 들여오지 않을 때만(repN — 같은 질문 두 번 금지)
          if (rn && !wrongSelfName(rn, friendName) && repN(rn) <= repN(reply)
              && aiFriendMeasureReply(rn, level, { answering: studentAsked }).score
                 <= aiFriendMeasureReply(reply, level, { answering: studentAsked }).score) {
            reply = rn;
            commitFix();
          }
        } catch (e: any) {
          console.error('[chat-friend] name retry failed:', e?.message || e);
        }
      }

      /* 🎚 눈높이 강제 (2026-08-31) — 「지시만으로는 안 지켜진다」의 그 자리입니다.
         만든 답을 실제로 세어 보고 ① 넘치면 한 번 더 뽑고 ② 그래도 넘치면 문장 «수» 만 줄입니다.
         ⛔ 문장 «안» 의 단어는 자르지 마세요 — 아이가 그대로 따라 읽는 문장이라 깨진 영어를 배웁니다.
         ⛔ 다시 뽑은 것을 무조건 받지 마세요 — 빈 답이나 더 긴 답으로 바꾸면 고치려던 것이 나빠집니다. */
      const lvBefore = aiFriendMeasureReply(reply, level, { answering: studentAsked });
      if (!lvBefore.ok && !focusedFix) {
        if (usedModel) {
          try {
            const shorter: any = await runFriend(usedModel, messages.concat([
              { role: 'assistant', content: reply },
              { role: 'user', content: aiFriendShortenHint(reply, level) },
            ]), 160, 0.4);
            const st2 = aiFriendStripHanzi(takeFriendReply(shorter));
            const m2 = st2 ? aiFriendMeasureReply(st2, level, { answering: studentAsked }) : null;
            // ⚠️ «더 나은 쪽» 판정은 score 하나로 합니다(깨진 문법 100 · 길이 10 · 문장 수 1).
            //    조금 길어도 «올바른» 문장이 낫기 때문입니다 — 길이만 비교하면 전보문이 이깁니다.
            // 🔁 짧게 다시 뽑은 것이 «이미 물은 질문» 을 새로 들여오면 받지 않는다(같은 질문 두 번 금지)
            if (st2 && m2 && (m2.ok || m2.score < lvBefore.score) && repN(st2) <= repN(reply)) {
              reply = st2;
              commitFix();
            }
          } catch (e: any) {
            console.error('[chat-friend] level shorten retry failed:', e?.message || e);
          }
        }
        reply = aiFriendTrimSentences(reply, level, { answering: studentAsked }) || reply;
        const lvAfter = aiFriendMeasureReply(reply, level, { answering: studentAsked });
        if (!lvAfter.ok) {
          /* 한 문장이 여전히 길거나 꼴이 깨져 있을 수 있다 — 낱말을 자르거나 문장을 «고쳐 쓰지» 는
             않기 때문이다(아이가 그대로 따라 읽는 문장이라 코드가 지어내면 안 된다).
             ⛔ 조용히 넘기지 마세요. 이 줄이 없었다면 「Dog is big?」 이 화면까지 갔는지조차 몰랐습니다. */
          console.error('[chat-friend] level ' + level + ' not clean: '
            + lvAfter.sentences + '/' + lvAfter.maxSentences + ' sentences, worst '
            + lvAfter.worstWords + '/' + lvAfter.hardMaxWordsPerSentence + ' words'
            + (lvAfter.broken.length ? ', broken questions: ' + JSON.stringify(lvAfter.broken) : ''));
        }
      }

      /* 💛 (2026-09-09) 학생이 부정적인 말을 한 턴이면 답장 앞머리의 칭찬 상투구를 떼어 낸다.
         [왜 여기인가] 길이·문법 손질이 «다 끝난 뒤» 이고 DB 에 저장하기 «전» 이라,
         학생이 본 문장과 ai_friend_chats 에 남는 문장이 같아진다(다음 턴의 history 도 그것을 본다).
         ⛔ 말을 지어내지 않는다 — 떼기만 하고, 뗄 것이 없거나 다 떼면 원문 그대로다.
         ⚠️ 판정에 넣는 것은 «학생 발화»(msg)다. reply 를 넣으면 정반대가 된다.
         ⚠️ 이 화면과 웜업은 «같은 판정» 을 써야 한다 — 한쪽만 고치면 화면마다 답이 달라진다
            (정본 src/warmup-empathy.ts 하나. 하니스가 두 화면의 배선을 함께 본다). */
      reply = applyEmpathyGuard(msg, reply) || reply;

      /* ✏️ 교정 카드 (2026-09-09) — 웜업과 «같은 판정 한 벌» 을 쓴다(warmup-correction.ts).
         모델이 준 fix 를 믿지 않고 ① 검증하고 ② 보여 줄지까지 정한다.
         ⛔ 매 턴 고치지 않는다 — 2026-09-03 이 화면에서 「주제를 벗어나지 마」를 세 겹으로 넣었다가
            「정해진 문장 안에서만 한다」는 현장 제보를 받고 되돌린 전례가 있다. 교정도 같다.
         ⚠️ 이 블록은 절대 던지면 안 된다 — 여기서 던지면 멀쩡한 대화가 통째로 500 이 된다.
            실패하면 fix 없이(= 고치기 전과 똑같이) 내려간다. */
      let showFix: any = null;
      let verifiedFix: any = null;   // 🎚️ 검증을 통과한 교정(카드를 보여 주든 말든) — 정직한 칭찬의 «틀렸는가» 근거
      let offerRepeat = false;
      try {
        /* 🇰🇷 모델이 고친 것이 없으면(뜻이 통해 넘어간 경우) 규칙 보완(과거형·콩글리시 표)으로 한 번 더 본다.
           🎚️ 그래도 없으면 균형 «다시 묻기» 결과(이미 본 호출과 동시에 돌고 있다 — 안 겹친 나머지만 기다린다).
           ⛔ 모델의 교정이 있으면 그것이 먼저다 — 보완·다시 묻기는 «모델이 놓친 것» 만 받는다.
           ⚠️ 이 식의 규칙 보완은 friend-correction-flow.ts 의 deterministicFriendFix(turnPlan.detFix)다.
              집중교정 경로(위 focusedCandidate 줄)는 아직 backfill·konglish 를 «같은 순서로» 직접 부른다 —
              규칙을 더할 때 두 자리를 함께 볼 것(합치는 것은 집중교정 하니스가 걸린 별건).
           ⏱ 다시 묻기는 «본 답이 끝난 뒤» 최대 RECHECK_EXTRA_WAIT_MS 만 더 기다린다(함정 대조 2026-11-03 — 상한이 없었다).
              모델이 다 실패한 폴백 턴이면 기다리지 않는다(학생이 못 볼 교정을 «보여 줬다» 로 남기지 않게). */
        const waitRecheck = async () => {
          if (usedFallback || !recheckP) return null;
          const w0 = Date.now();
          try {
            const got = await waitAtMost(recheckP, RECHECK_EXTRA_WAIT_MS);
            if (!got) previewGate.recheck(false);   // 시간이 다 됐으면 잡아 둔 미리듣기를 놓아준다(늦은 결과는 문이 무시)
            return got;
          } finally { latModelMs += Date.now() - w0; }
        };
        const verified = verifyWarmupFix(rawFix, msg) || turnPlan.detFix || (recheckP ? await waitRecheck() : null);
        verifiedFix = verified;
        /* ⚠️ 프롬프트가 「그 넷은 반드시 고쳐」로 바뀌면서 fix 생성이 잦아집니다 — 그러면
           «모델은 줬는데 우리가 버렸다» 가 주요 실패 모양이 됩니다(지어낸 교정·한글 섞임·
           낱말 안 겹침…). 평문·빈 응답에는 이미 로그가 있는데 이것만 없었습니다.
           ⛔ 학생 발화나 교정 문장을 로그에 싣지 마세요 — «버렸다» 는 사실만 남깁니다. */
        if (!verified && rawFix) console.warn('[chat-friend] fix rejected by verify');
        if (verified) {
          /* 이번 답장까지 세어 1부터 시작한다.
             🔴 2026-09-09 까지는 turnNo 가 1 이면 게이트가 «막았습니다» — `turnCount - lastShownTurn(0) < 2`
                가 1-0=1 로 걸려 «학생의 맨 첫 마디» 는 원리상 교정해 줄 수 없었습니다(정본을 돌려 실측).
                지금은 «한 번도 안 보여줬으면 간격이 성립하지 않는다» 로 고쳤습니다(decideWarmupFixShow).
             ⚠️ 그래도 이 조회가 «계속» 실패하면 turnNo 가 1 에 고정됩니다. 뜻이 달라지는 교정(major)은
                그래도 뜨지만 «작은 실수는 두 번째부터» 쪽은 간격에 걸려 멎습니다 — 조용해서 아무도
                모르므로 로그를 남깁니다.
                ⛔ 「조회가 실패해도 전부 통과한다」고 적지 마세요 — major 만 통과합니다. */
          if (!turns) console.warn('[chat-friend] turn count query failed — 작은 실수 교정이 계속 막힙니다');
          const turnNo = Number((turns && (turns as any).n) || 0) + 1;
          const mkey = 'aifriendfix:' + uid;
          let memoIn: any = null;
          try {
            const rawMemo = (env as any).SESSION_STATE ? await (env as any).SESSION_STATE.get(mkey) : null;
            if (rawMemo != null) memoIn = JSON.parse(rawMemo);
          } catch (e: any) {
            /* ⚠️ 읽기가 조용히 실패하면 memo 가 늘 null 이라 «연달아 교정 안 하기»·
               «minor 는 두 번째부터» 가 통째로 풀려 «매 턴 교정» 이 됩니다 — 화면은 멀쩡해 보입니다.
               쓰기 쪽에만 로그가 있고 읽기 쪽에 없던 것을 함정 대조가 잡았습니다. */
            console.warn('[chat-friend] fix memo read failed:', e?.message || e);
          }
          // 🇰🇷 최근 14일에 이미 고쳐 준 관사·복수·전치사는 «한 번 센 것» 으로 이어 받는다(정본 recent-mistakes.ts).
          //    작은 실수일 때만 조회한다 — 큰 실수는 원래 바로 고친다.
          if (verified && verified.severity !== 'major') memoIn = carryRepeatTags(memoIn, await loadRecentFixTags(env.DB, uid, Date.now()));
          const decided = decideWarmupFixShow(verified, memoIn, turnNo, { immediate: immediateFix });
          // 🎚️ 모드별 게이트 — 자유대화는 따라 말하기 없음, 집중교정은 검증된 교정을 매번(warmup-honest gateFixForMode).
          showFix = gateFixForMode(friendMode, verified, decided.show, false).show;
          // 🔁 보여 준 교정은 남겨 다음 대화에서 다시 쓰게 한다(KV 메모는 6시간 «간격» 만 기억). 던지지 않는다.
          if (showFix) await logAiFriendFix(env.DB, uid, showFix, Date.now());
          offerRepeat = warmupShouldOfferRepeat(decided.show, decided.memo, turnNo);
          if (friendMode === 'free_talk') offerRepeat = false;
          else if (friendMode === 'focused') offerRepeat = !!showFix;
          try {
            if ((env as any).SESSION_STATE) {
              await (env as any).SESSION_STATE.put(mkey, JSON.stringify(decided.memo), { expirationTtl: 6 * 3600 });
            }
          } catch (e: any) {
            /* 조용히 실패하면 «연달아 교정하지 않기»·«두 번째부터 보여주기» 가 통째로 풀려
               매 턴 교정이 뜬다 — 그런데 화면은 멀쩡해 보인다. 반드시 한 줄 남긴다. */
            console.warn('[chat-friend] fix memo save failed:', e?.message || e);
          }
        }
      } catch (e: any) {
        console.warn('[chat-friend] fix gate skipped:', e?.message || e);
      }
      /* 🎚️ (2026-11-03) 최종 답장 조립 — 정본 friend-correction-flow.ts 의 finishFriendReply 한 곳.
         순서: 정직한 칭찬(틀렸으면 칭찬 말머리 떼기) → 균형: 고친 문장을 질문보다 먼저 1번 → 집중: 고친 문장 3번.
         Final speech and saved history use the same verified correction (focused: exactly three times).
         ⚠️ 저장(아래 INSERT)·응답 «전» 이어야 학생이 들은 문장과 다음 턴이 읽는 기록이 같다. */
      reply = finishFriendReply(reply, { mode: friendMode, verified: verifiedFix, shown: showFix, msg, fallback: usedFallback, suspect: !!rawFix });

      /* 📦 화면이 «답» 을 그리고 읽는 데 쓰는 칸 — 아래 final 이벤트와 마지막 응답(done)이 «같은 함수» 로 만든다.
         ⛔ 두 곳에 따로 적지 마세요 — 한쪽만 고치면 «먼저 읽은 답» 과 «정본» 이 갈립니다. */
      const replyOut = (): any => ({
        // 🚨 «AI 가 답을 못 만들었다» 를 화면이 알 수 있게. 옛 화면은 이 칸을 모르고
        //    그냥 reply 를 그리므로 «고치기 전» 과 같습니다(안전한 방향).
        ...(usedFallback ? { ai_unavailable: true } : {}),
        fix: usedFallback ? null : showFix, repeat: usedFallback ? false : offerRepeat,
        // 📡 스트리밍으로 미리 보낸 문장과 최종본이 «다른가» — 화면이 그때만 다시 읽습니다.
        ...(wantStream ? { replaced: streamedText && streamedText.trim() !== reply.trim() ? 1 : 0 } : {}),
      });
      /* ⚡ (2026-11-06 사장님 「휴대폰 A.i 말하기 3카드 모두 더 빨리」) 최종 답을 «먼저» 보낸다 / Send the final reply first.
         [왜] 예전에는 아래 대화 저장(INSERT 2)·포인트(D1 조회·적립 여러 번 «차례로»)·지연 기록·발음 채점까지 «다» 끝난 뒤에야
              done 한 번으로 답을 보냈다. 집중교정(기본값)은 미리듣기가 없어서 그 시간을 학생이 통째로 기다렸다.
         [어떻게] 답이 정해지는 이 자리에서 final 이벤트로 먼저 보내고, 나머지는 스트림을 연 채로 이어서 한다 —
              응답 본문을 흘리는 동안은 워커가 살아 있다(Cloudflare 문서 «A Worker that is still streaming a response body
              remains active») 그래서 waitUntil 이 필요 없다. 포인트·발음(pron_fix)은 예전처럼 done 에 실린다.
         ⚠️ 저장은 «답이 정해진 뒤» 그대로라 학생이 들은 문장과 다음 턴이 읽는 기록이 같다(아래 INSERT 는 이 reply 를 쓴다).
            화면은 done 이 올 때까지 보내기 버튼을 잠가 두므로 다음 턴이 저장보다 먼저 올 수 없다.
         ⛔ 옛 화면은 final 을 모른다 — data 줄을 «done 이 아니면 문장(t)» 으로만 읽어서 t 가 없는 이 이벤트는 그냥 지나간다(예전과 같음).
         ⛔ JSON 경로(stream 미사용)에는 보내지 않는다 — 응답 계약 그대로. */
      let latFinalMs = 0;   // ⏱ 학생이 «답» 을 받은 시각(스트리밍) — 지연 기록의 ms 는 이것(없으면 끝까지)
      if (sseSend) {
        sseSend({ final: 1, ok: true, reply, ...replyOut() });
        latFinalMs = Date.now() - latT0;
      }

      // ⚠️ 이 저장은 반드시 기다린다 — 바로 아래 gam 스냅샷("오늘 몇 번째 대화")이
      //   이 INSERT 가 끝난 뒤의 개수를 세어야 정확하다. 백그라운드로 미루면 그 숫자가
      //   이번 메시지를 못 세거나(레이스) 다음 새로고침에야 반영돼 부정확해진다.
      try {
        const now = Date.now();
        await env.DB.prepare(`INSERT INTO ai_friend_chats (student_uid, role, content, level, created_at) VALUES (?,?,?,?,?)`).bind(uid, 'user', msg, level, now).run();
        /* ⛔ 폴백은 «AI 가 한 말» 로 남기지 않습니다.
           [잰 것 — D1 ai_friend_chats, 사장님 세션] 22:32:52 정상답 → 22:33:17 폴백 → 22:33:37 폴백.
             즉 폴백이 history 에 들어간 «뒤» 에 모델이 실제로 답한 턴은 한 번도 없습니다.
           [판단 — 관측이 아니라 예방] 다음 «정상» 턴이 오면 모델이 그 고정 문구를 자기 직전
             발언으로 보게 됩니다. 그 문구는 주제와 무관하므로(예: 음식) 대화를 끌 수 있어 미리 막습니다.
           ✅ 학생 발화는 그대로 남깁니다 — 학생이 «말한 것» 은 사실이고, 답이 없는 턴으로 남는 것이
              「없던 일」로 지우는 것보다 정직합니다.
           ⚠️ 대신 폴백의 흔적이 D1 에 안 남습니다 — 이 뒤로 빈도의 정본은 아래 console.error 뿐입니다. */
        if (!usedFallback) {
          await env.DB.prepare(`INSERT INTO ai_friend_chats (student_uid, role, content, level, created_at) VALUES (?,?,?,?,?)`).bind(uid, 'assistant', reply, level, now + 1).run();
        }
      } catch (e: any) {
        console.error('[chat-friend] DB insert failed:', e?.message || e);
        // DB 실패해도 reply는 반환
      }

      // 🎮 게임화 — 포인트/스트릭/오늘의 단어 보너스. 실패해도 채팅 응답은 정상 반환.
      //   메시지당 2P(하루 10회) · 오늘의 단어 사용 +5P(하루 1회) · 🎤말하기 +1P(하루 5회)
      //   게스트(guest*)는 HUD 숫자만 주고 포인트는 적립하지 않음(기프티콘 교환 불가 계정).
      let gam: any = null;
      try {
        gam = await aiFriendGamSnapshot(uid);
        gam.awarded = 0; gam.word_bonus = 0; gam.voice_bonus = 0; gam.listen_bonus = 0;
        if (!/^guest/i.test(uid)) {
          await ensurePointTables(env);
          const KST_OFF = 9 * 3600 * 1000;
          const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
          const usedToday = async (code: string) => {
            const c: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`).bind(uid, code, todayMs).first();
            return c?.c || 0;
          };
          // ⚠️ 적립 자체(logAward)는 잔액을 읽고-쓰는 순서라 같은 유저에 대해 동시 실행하면
          //   레이스로 한쪽 적립이 유실될 수 있다 — 반드시 순서대로. "오늘 이미 썼나" 조회만
          //   서로 무관한 읽기라 한꺼번에 보낸다.
          const logAward = async (code: string, amount: number, label: string) => {
            /* 🪙 (2026-09-01) 하루 전체 상한(100점)을 여기서도 본다 — 정본 checkEarnAllowed.
               ⚠️ **«줬는지» 를 반드시 돌려준다.** 처음엔 조용히 return 했는데, 부르는 쪽이
                  그 뒤에서 무조건 gam.awarded = 2 를 써서 **적립 0인데 학생 화면이 «+5P»** 라고
                  말했다(ai-friend.html 이 그 값으로 축하 토스트를 그린다). 없는 포인트를 지어내는
                  것은 상한을 넘기는 것보다 나쁘다 — 규칙서 2장 「⛔ 지어내지 마세요」.
               ⚠️ 여기서 던지지는 않는다 — 포인트가 대화를 막으면 안 된다. */
            const allow = await checkEarnAllowed(env, uid, code, amount);
            if (!allow.ok) { console.log('[ai-friend] 포인트 상한 — 적립 건너뜀:', code, allow.error); return false; }
            const r = await applyPointTransaction(env, { userId: uid, type: 'earn', amount, reason: label, ruleCode: code });
            await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,NULL)`).bind(uid, code, amount, Date.now(), r.txnId).run();
            return true;
          };
          const wod = gam.word;
          const wantWord = !!(wod && new RegExp(`\\b${wod.w}\\b`, 'i').test(msg));
          const wantVoice = String(b.via || '') === 'voice';
          /* 🎧 (2026-08-07) 자막을 가리거나 끈 채로 대화하면 덤 1P.
             듣기 훈련은 «켠 쪽에 벌점» 이 아니라 «끈 쪽에 덤» 이어야 한다 —
             어려워서 자막을 켠 학생이 손해 보는 느낌을 받으면 그 학생부터 그만둔다.
             ⚠️ 화면이 알려주는 값이라 마음먹으면 속일 수 있다. 이미 있는 via:'voice' 와 같은 수준의
                신뢰도이고, 하루 5회로 묶여 있어 최대 5P다. 여기에 더 큰 보상을 걸지 말 것. */
          const wantListen = ['blur', 'off'].includes(String(b.sub || ''));
          const [chatUsed, wordUsed, voiceUsed, listenUsed] = await Promise.all([
            usedToday('ai_friend_chat'),
            wantWord ? usedToday('ai_friend_word') : Promise.resolve(Infinity),
            wantVoice ? usedToday('ai_friend_voice') : Promise.resolve(Infinity),
            wantListen ? usedToday('ai_friend_listen') : Promise.resolve(Infinity),
          ]);
          /* ⚠️ 화면 값은 «실제로 줬을 때만» 쓴다 — logAward 가 false 면 그 자리는 비운다.
             안 그러면 적립 0인데 학생 화면이 «+5P» 라고 축하한다(2026-09-01 실측 경로). */
          if (chatUsed < 10 && await logAward('ai_friend_chat', 2, '망고와 영어 수다')) gam.awarded = 2;
          if (wantWord && wordUsed < 1 && await logAward('ai_friend_word', 5, `오늘의 단어(${wod.w}) 사용`)) gam.word_bonus = 5;
          if (wantVoice && voiceUsed < 5 && await logAward('ai_friend_voice', 1, '영어로 말하기')) gam.voice_bonus = 1;
          if (wantListen && listenUsed < 5 && await logAward('ai_friend_listen', 1, '자막 없이 듣기')) gam.listen_bonus = 1;
          /* 🪙 이번 턴에 대화 포인트를 못 받은 이유 — 화면이 «왜 0P 인지» 를 말하게. 'daily'=오늘 10번 다 받음 · 'total'=하루 전체 상한 */
          gam.chat_capped = chatUsed >= 10 ? 'daily' : (gam.awarded ? null : 'total');
          if (gam.earned_today != null) gam.earned_today = Number(gam.earned_today) + gam.awarded + gam.word_bonus + gam.voice_bonus + gam.listen_bonus;
        }
      } catch (e: any) {
        console.error('[chat-friend] gamification failed:', e?.message || e);
      }

      if (friendPlain || friendEmpty) {
        /* 조용해지지 않게 남긴다 — 「교정이 한 번도 안 뜬다」의 1순위 원인이 이것이었다. */
        console.warn('[chat-friend] model output: plain=' + friendPlain + ' empty=' + friendEmpty + ' rf=' + friendRF);
      }

      /* ⏱ 지연 기록 (2026-09-11 · A-3) — 34% 가 «1턴만 하고 나가는» 이유가 «느려서» 인지
         가리려면 먼저 재야 합니다. ⛔ 학생 발화·AI 답변은 한 글자도 싣지 않습니다(길이만).
         ⛔ 기록이 대화를 막으면 안 됩니다 — 통째로 try/catch 입니다. */
      try {
        await recordAiLatency(env, {
          feature: 'chat-friend',
          model: usedModel || 'fallback',
          /* ⏱ (2026-11-06) 스트리밍이면 «final 을 보낸 시각» — 그 뒤 저장·포인트는 학생이 기다리지 않는다.
             ⚠️ 그래서 이날부터 chat-friend 의 ms 는 그 앞보다 «저장·포인트 시간만큼» 작게 나온다(재는 자리가 바뀐 것 — 비교할 때 감안). */
          ms: latFinalMs || (Date.now() - latT0),
          model_ms: latModelMs,
          tries: latTries,
          chars: (reply || '').length,
          level,
          rf: friendRF ? 1 : 0,
          ok: usedFallback ? 0 : 1,
        });
      } catch (e: any) {
        console.error('[chat-friend] recordAiLatency failed:', e?.message || e);
      }

      const pronFix = await pronP;   // 🎯 발음 교정 결과(없으면 null)
      return { ok: true, reply, level, persona, model: usedModel || 'fallback', gam,
                    ...replyOut(),   // ai_unavailable · fix · repeat · replaced — final 이벤트와 같은 함수(위 replyOut)
                    ...(pronFix ? { pron_fix: pronFix } : {}) };
      };

      /* 📡 옛 경로 — stream 을 안 보내면 지금까지와 똑같습니다. */
      if (!wantStream) return json(await runTurn());

      /* 📡 새 경로 — SSE. ⚠️ Response 를 «먼저» 돌려줘야 브라우저가 받기 시작합니다.
         start() 는 async 여도 Response 는 즉시 나갑니다. */
      const enc = new TextEncoder();
      return new Response(new ReadableStream({
        async start(c) {
          sseSend = (o: any) => { try { c.enqueue(enc.encode('data: ' + JSON.stringify(o) + '\n\n')); } catch {} };
          try {
            const out = await runTurn();
            sseSend({ done: 1, ...out });
          } catch (e: any) {
            /* ⛔ 조용히 닫으면 화면이 «영영 기다립니다» — 무슨 일인지 말하고 닫습니다.
               화면은 이 이벤트를 받으면 옛 경로로 다시 물어봅니다. */
            console.error('[chat-friend] stream turn failed:', e?.message || e);
            try { sseSend({ done: 1, ok: false, error: 'stream_failed' }); } catch {}
          } finally {
            try { c.close(); } catch {}
          }
        },
      }), { headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-store',   // ⛔ 자격증명 섞인 응답은 캐시 금지
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',              // 중간 버퍼가 모아 두면 스트리밍이 헛돕니다
      } });
    }

    // 기록 조회·레벨 응답·초기화는 같은 소유자 판정을 사용한다.
    const denyChatHistoryAccess = async (uid: string, body?: unknown): Promise<Response | null> => {
      const authUid = await authUidGlobal(request, url, env, body);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
      return null;
    };

    if (method === 'GET' && path === '/api/ai/chat-history') {
      await ensureChatSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const denied = await denyChatHistoryAccess(uid);
      if (denied) return denied;
      const rs = await env.DB.prepare(
        `SELECT id, role, content, created_at FROM ai_friend_chats WHERE student_uid = ? ORDER BY id ASC LIMIT 200`
      ).bind(uid).all();
      // 🎮 HUD 초기 데이터(오늘/누적/스트릭/오늘의 단어) — 실패해도 히스토리는 정상 반환
      let gam: any = null;
      try { gam = await aiFriendGamSnapshot(uid); } catch {}
      /* 🎚 (2026-10-18 개선안 2순위 ⑤) «한 단계 올려(내려) 볼까요?» — 제안만. 바꾸는 건 학생 버튼.
         ⛔ 근거가 모자라거나·최근에 답했거나·조회가 실패하면 null(아무 말도 안 함). 정본 level-suggest.ts */
      let levelSuggest: any = null;
      try {
        const lvQ = url.searchParams.get('level');
        if (lvQ) {
          const lv = aiFriendNormalizeLevel(lvQ);
          const nowS = Date.now();
          if (!(await recentlyAnswered(env.DB, uid, 'aifriend', nowS))) {
            const ev = await loadSuggestEvidence(env.DB, uid, lv, nowS);
            const targets: Record<string, number> = {};
            for (const k of Object.keys(AI_FRIEND_LEVELS)) targets[k] = Number((AI_FRIEND_LEVELS as any)[k].maxWordsPerSentence) || 0;
            levelSuggest = decideLevelSuggestion(lv, ev, targets);
          }
        }
      } catch (e: any) { console.warn('[chat-history] level suggest skipped:', e?.message || e); }
      return json({ ok: true, items: rs.results || [], gam, level_suggest: levelSuggest });
    }

    /* 🎚 단계 제안에 대한 학생의 답 기록 — 이미 등록된 경로의 «비어 있던 POST» 를 쓴다(src/index.ts 무수정).
       ⛔ 모르는 action 은 거절한다(나중에 이 경로에 다른 뜻을 넣을 때 조용히 흘러 들어오지 않게). */
    if (method === 'POST' && path === '/api/ai/chat-history') {
      const b: any = await request.json().catch(() => ({}));
      if (String(b.action || '') !== 'level_suggest') return json({ ok: false, error: 'unknown_action' }, 400);
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const denied = await denyChatHistoryAccess(uid, b);
      if (denied) return denied;
      const okRec = await recordSuggestAnswer(env.DB, uid, 'aifriend',
        { from: b.from, to: b.to, decision: b.decision, evidence: b.evidence }, Date.now());
      return okRec ? json({ ok: true }) : json({ ok: false, error: 'bad_answer' }, 400);
    }

    if (method === 'POST' && path === '/api/ai/chat-clear') {
      await ensureChatSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const denied = await denyChatHistoryAccess(uid, b);
      if (denied) return denied;
      await env.DB.prepare(`DELETE FROM ai_friend_chats WHERE student_uid = ?`).bind(uid).run();
      /* ✏️ 교정 메모도 함께 지운다 (2026-09-09 함정 대조).
         턴 수는 위 DELETE 로 0 으로 돌아가는데 KV 의 lastShownTurn 은 6시간 남아 있어서,
         「대화 초기화」를 누른 학생은 최대 6시간 동안 교정이 조용히 억제된다.
         ⚠️ 실패해도 초기화 자체는 성공으로 답한다 — 메모는 6시간 뒤 저절로 사라진다. */
      try { if ((env as any).SESSION_STATE) await (env as any).SESSION_STATE.delete('aifriendfix:' + uid); }
      catch (e: any) { console.warn('[chat-friend] fix memo clear failed:', e?.message || e); }
      return json({ ok: true });
    }
    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase CF 끝
    // ═══════════════════════════════════════════════════════════════

  return handleAiCommandApi(request, url, env);
}
