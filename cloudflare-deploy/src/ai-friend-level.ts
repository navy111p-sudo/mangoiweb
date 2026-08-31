/**
 * 🎚 AI 영어친구(ai-friend) 레벨 규격 — 정본은 이 파일 하나입니다. (2026-08-31)
 *
 * 왜 만들었나
 *   사장님 제보: 「아주 기초(A1)인데 문장이 너무 길고 어렵다」.
 *   운영 D1 실측(ai_friend_chats, assistant 313건):
 *     B1 290건 평균 31.1단어 · A2 13건 17.5단어 · **A1 10건 28.5단어(최대 45)**
 *   → A1 이 A2 보다 길었습니다. 레벨이 사실상 작동하지 않고 있었습니다.
 *
 *   원인은 프롬프트의 레벨 지시가 «한 줄» 이고 그나마 A1·C1 만 설명이 있었던 것입니다
 *   (A2·B1·B2 는 설명 없음, 어느 레벨에도 숫자 상한 없음). 반면 같은 프롬프트의 다른
 *   규칙 여섯 개(1~3문장+질문 · 칭찬 · 재미사실 · 오늘의단어 · 약점단어 · 한국어팁)는
 *   레벨과 무관하게 전부 걸려서, «짧게» 한 줄이 이길 수가 없었습니다.
 *
 * ⛔ 프롬프트 문구만 세게 써서 풀지 마세요.
 *    이 저장소의 반복 실측이 「지시만으로는 안 지켜진다」입니다(단어 수·문법·구두점 전례).
 *    그래서 여기서는 ① 프롬프트에 숫자를 주입하고 ② 만든 뒤 실제로 세어 보고
 *    ③ 넘치면 다시 뽑고 ④ 그래도 넘치면 문장 수만 결정론으로 줄입니다.
 *
 * ⚠️ 숫자는 웜업(src/index.ts 의 WARMUP_LEVELS)과 «짝» 입니다 — 두 화면이 다른 기준을 쓰면
 *    그때부터 «화면마다 답이 다른» 사고가 시작됩니다.
 *    ai_friend_level_harness 가 index.ts 에서 그 숫자를 읽어 대조하므로 한쪽만 고치면 FAIL 입니다.
 *
 * 🪜 여덟 칸 (2026-08-31 사장님 결정 — 「웜업과 친구하기 레벨을 8개 단계로」)
 *    다섯 칸(A1·A2·B1·B2·C1)에서 여덟 칸으로 넓혔습니다. 그런데 «새 눈금을 발명한» 것이
 *    아닙니다 — 웜업은 이미 여덟 칸이었고(WARMUP_LEVELS, 교재 Lv 1~34 밴드), 영어친구만
 *    다섯 칸이라 7 → 12 처럼 크게 뛰었습니다. 그래서 **웜업의 여덟 칸을 그대로 가져왔습니다.**
 *
 *      S1 A1   5단어(3~5)   ← 웜업 1 첫걸음 · 옛 A1 (값 그대로)
 *      S2 A2   7단어(5~7)   ← 웜업 2 기초   · 옛 A2 (값 그대로)
 *      S3 A2+  9단어(7~9)   ← 웜업 3 초급   · 새 칸 · **기본값**
 *      S4 B1  12단어(9~12)  ← 웜업 4 초중급 · 옛 B1 (값 그대로)
 *      S5 B1+ 15단어(12~15) ← 웜업 5 중급   · 새 칸
 *      S6 B2  18단어(15~18) ← 웜업 6 중고급 · 옛 B2 자리(16→18)
 *      S7 B2+ 22단어(18~22) ← 웜업 7 고급   · 새 칸
 *      S8 C1  제한없음       ← 웜업 8 최상급 · 옛 C1 (값 그대로)
 *
 *    ⛔ 눈금을 «한 칸 밀어» 맨 아래에 더 쉬운 칸을 만들려고 하지 마세요. 2026-08-31 에 실제로
 *       그렇게 짰다가 되돌렸습니다 — 웜업 저장값(mangoi_warmup_level)의 «뜻» 이 말없이 바뀌고,
 *       같은 밴드 이름(중급)을 판단력 훈련과 웜업이 서로 다른 단어 수로 부르게 됩니다.
 *       기초를 쉽게 하는 길은 «길이» 가 아니라 «열린 질문을 없애는 것» 입니다(S1 Yes/No, S2 양자택일).
 *       실측이 그것을 뒷받침합니다 — A1 이 이미 3~5단어 규격이었는데 실제 답변은 28.5단어였습니다.
 *       모자랐던 것은 더 낮은 칸이 아니라 **지키게 만드는 장치**였습니다.
 *    ⚠️ 옛 키(A1…C1)는 «학생 브라우저에 저장돼 있어» 계속 받습니다(LEGACY_LEVEL_MAP).
 *       지우면 지금까지 고른 레벨이 전부 리셋됩니다. 옛 키는 «같은 CEFR 이름을 단 칸» 으로 갑니다.
 *    ⚠️ CEFR 이름을 없애지 마세요 — 학부모·강사가 A1·B1 로 이야기합니다. 화면이 둘 다 보여 줍니다.
 */

export interface AiFriendLevelSpec {
  /** 한 문장의 최대 단어 수. 0 = 제한 없음(C1) */
  maxWordsPerSentence: number;
  /** 답변 전체의 최대 문장 수 — 되묻는 질문 1개를 «포함한» 수입니다 */
  maxSentences: number;
  /** 프롬프트에 넣을 영어 지시 */
  rule: string;
  /**
   * true = «길이를 늘리는 규칙»(재미있는 사실·최근 틀린 단어 끼워 넣기)을 끕니다.
   * 기초 단계에서 그 둘이 걸리면 문장이 반드시 길어집니다 — 실측된 A1 답변 45단어가 그 모양이었습니다.
   */
  plain: boolean;
}

/** 화면(ai-friend.html)의 레벨 버튼과 1:1 입니다. 늘리면 화면도 함께 고쳐야 합니다. */
export const AI_FRIEND_LEVELS: Record<string, AiFriendLevelSpec> = {
  /* 🌱 맨 아래 칸 — 여기서 중요한 것은 길이가 아니라 «질문 형식» 입니다. 3단어짜리
     "How are you?" 도 초보에게는 벽입니다(답을 스스로 만들어야 하니까요).
     고를 말이 질문 «안» 에 있어야 합니다. 그래서 S1 은 Yes/No 만, S2 는 양자택일까지입니다. */
  S1: {
    maxWordsPerSentence: 5, maxSentences: 2, plain: true,
    rule: 'CEFR A1 (absolute beginner). Every sentence must be 3-5 words long. Use only the most basic words (like, have, want, good, big). Present tense only. No commas, no "because", no "but". Ask ONLY yes/no questions the student can answer with "Yes." or "No." — never a wh- question, never "or". Your whole reply must be at most 2 sentences: one short cheer and ONE short question.',
  },
  S2: {
    maxWordsPerSentence: 7, maxSentences: 3, plain: true,
    rule: 'CEFR A2 (beginner). Every sentence must be 5-7 words long. Everyday words only, present tense mostly. Ask a yes/no question or an either/or question where BOTH choices are inside your question — the student must be able to answer by copying words you just said. Your whole reply must be at most 3 short sentences, ending with ONE short question.',
  },
  S3: {
    maxWordsPerSentence: 9, maxSentences: 3, plain: true,
    rule: 'CEFR A2+ (beginner, moving up). Every sentence must be 7-9 words long. Everyday words; present and present-continuous, and simple past is fine now. Your whole reply must be at most 3 sentences, ending with ONE question.',
  },
  S4: {
    maxWordsPerSentence: 12, maxSentences: 3, plain: false,
    rule: 'CEFR B1 (lower-intermediate). Keep every sentence under 12 words. You may use past tense and simple linkers (and / but / because). Your whole reply must be at most 3 sentences, ending with ONE question.',
  },
  S5: {
    maxWordsPerSentence: 15, maxSentences: 3, plain: false,
    rule: 'CEFR B1+ (intermediate). Keep every sentence under 15 words. Varied tenses, reasons and comparisons are fine. At most 3 sentences, ending with ONE question.',
  },
  S6: {
    maxWordsPerSentence: 18, maxSentences: 4, plain: false,
    rule: 'CEFR B2 (upper-intermediate). Keep every sentence under 18 words. Natural phrasing, conditionals, relative clauses and easy idioms are fine. At most 4 sentences, ending with ONE question.',
  },
  S7: {
    maxWordsPerSentence: 22, maxSentences: 4, plain: false,
    rule: 'CEFR B2+ (advanced-ish). Keep every sentence under 22 words. Use the phrasal verbs, linkers and idioms a native friend really uses, and ask a deeper follow-up. At most 4 sentences, ending with ONE question.',
  },
  S8: {
    maxWordsPerSentence: 0, maxSentences: 4, plain: false,
    rule: 'CEFR C1 (advanced). Speak naturally and fluently like a native friend. Nuance and abstract topics are welcome. At most 4 sentences, ending with ONE question.',
  },
};

/**
 * 옛 키 → 새 키. 학생 브라우저(localStorage)와 D1 ai_friend_chats.level 에 옛 값이 남아 있습니다.
 * ⛔ 지우지 마세요 — 지금까지 고른 레벨이 전부 리셋되고, 옛 대화 기록의 레벨도 읽을 수 없게 됩니다.
 */
export const LEGACY_LEVEL_MAP: Record<string, string> = {
  // 옛 키는 «같은 CEFR 이름을 단 칸» 으로 갑니다 — 학생이 고른 난이도가 그대로 유지됩니다.
  A1: 'S1', A2: 'S2', B1: 'S4', B2: 'S6', C1: 'S8',
};

/** 화면에 함께 보여 줄 CEFR 이름 — 학부모·강사가 이 말로 이야기합니다.
 *  ⚠️ 웜업 화면(warmup.html 의 LEVEL_CATALOG.cefr)과 «같은 말» 이어야 합니다(하니스가 대조).
 *  ⚠️ 「+」 가 붙은 셋은 공식 CEFR 등급이 아니라 그 사이를 가리키는 통용 표기입니다 —
 *     여덟 칸을 다섯 등급 위에 얹으려면 그 사이가 필요합니다. */
export const AI_FRIEND_CEFR: Record<string, string> = {
  S1: 'A1', S2: 'A2', S3: 'A2+', S4: 'B1',
  S5: 'B1+', S6: 'B2', S7: 'B2+', S8: 'C1',
};

/**
 * 기본값은 S3(초급·A2+, 7~9단어) — 2026-08-31 사장님 결정 「기본은 STEP 3」.
 * ⚠️ 화면 기본값(ai-friend.html 의 AIF_DEFAULT)과 «짝» 입니다. 예전에는 화면 B1 · 서버 A2 로
 *    서로 달라서, 화면이 안 보내면 조용히 다른 레벨이 됐습니다.
 * ⚠️ 웜업 화면의 기본값(_warmLevel = 3)과도 같은 칸입니다 — 두 화면이 같은 눈금이니까요.
 */
export const AI_FRIEND_DEFAULT_LEVEL = 'S3';

/**
 * 화면·저장소에서 온 값을 «아는 칸» 으로 바꿉니다.
 * ⚠️ `LEVELS[k] || 기본값` 만으로는 안 됩니다 — 평범한 객체 리터럴이라 'constructor' 같은
 *    프로토타입 키가 그대로 조회됩니다(2026-08-31 같은 뿌리의 사고를 ai-friends.ts 에서 밟았습니다).
 */
export function aiFriendNormalizeLevel(level: unknown): string {
  const raw = String(level || '').trim().toUpperCase();
  const key = Object.prototype.hasOwnProperty.call(LEGACY_LEVEL_MAP, raw) ? LEGACY_LEVEL_MAP[raw] : raw;
  return Object.prototype.hasOwnProperty.call(AI_FRIEND_LEVELS, key) ? key : AI_FRIEND_DEFAULT_LEVEL;
}

export function aiFriendLevelSpec(level: string): AiFriendLevelSpec {
  return AI_FRIEND_LEVELS[aiFriendNormalizeLevel(level)];
}

/**
 * 한국어 문법 팁「(💡 …)」은 길이 계산에서 뺍니다.
 * 그 팁은 영어 문장이 아니라 «덧붙인 도움말» 이라, 같이 세면 팁을 단 답변만 억울하게 잘립니다.
 */
export function aiFriendStripTip(text: string): string {
  return String(text || '').replace(/\(\s*💡[^)]*\)\s*$/g, '').trim();
}

/** 영어 낱말만 셉니다 — 이모지·숫자·문장부호는 길이가 아닙니다. */
export function aiFriendCountWords(s: string): number {
  const m = String(s || '').match(/[A-Za-z][A-Za-z'’-]*/g);
  return m ? m.length : 0;
}

/**
 * 문장 나누기. 낱말이 하나도 없는 조각(이모지만 남은 꼬리 등)은 문장으로 세지 않습니다.
 * ⚠️ 마침표가 하나도 없는 답변은 통째로 한 문장입니다 — 그래야 «한 줄로 길게» 가 안 빠져나갑니다.
 */
export function aiFriendSplitSentences(text: string): string[] {
  return aiFriendStripTip(text)
    .split(/(?<=[.!?])\s+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return aiFriendCountWords(s) > 0; });
}

/**
 * 눈높이에 맞는 길이인가. 넘치면 왜 넘쳤는지도 함께 돌려줍니다(로그·하니스용).
 * ⚠️ «판별 유니온» 으로 만들지 마세요 — 이 저장소는 strictNullChecks:false 라 좁히기가
 *    동작하지 않아 컴파일이 깨집니다(CLAUDE.md 함정). 한 가지 모양으로 둡니다.
 */
export function aiFriendMeasureReply(reply: string, level: string): {
  ok: boolean; sentences: number; maxSentences: number;
  worstWords: number; maxWordsPerSentence: number;
} {
  const spec = aiFriendLevelSpec(level);
  const parts = aiFriendSplitSentences(reply);
  let worst = 0;
  for (const p of parts) worst = Math.max(worst, aiFriendCountWords(p));
  const overSentences = parts.length > spec.maxSentences;
  const overWords = spec.maxWordsPerSentence > 0 && worst > spec.maxWordsPerSentence;
  return {
    ok: !overSentences && !overWords,
    sentences: parts.length, maxSentences: spec.maxSentences,
    worstWords: worst, maxWordsPerSentence: spec.maxWordsPerSentence,
  };
}

/** 다시 뽑을 때 모델에게 줄 지시 — «무엇이 얼마나 넘쳤는지» 를 숫자로 알려 줍니다. */
export function aiFriendShortenHint(reply: string, level: string): string {
  const m = aiFriendMeasureReply(reply, level);
  const spec = aiFriendLevelSpec(level);
  const bits: string[] = [];
  if (m.sentences > m.maxSentences) bits.push('you wrote ' + m.sentences + ' sentences but the limit is ' + m.maxSentences);
  if (spec.maxWordsPerSentence > 0 && m.worstWords > spec.maxWordsPerSentence) {
    bits.push('your longest sentence has ' + m.worstWords + ' words but the limit is ' + spec.maxWordsPerSentence);
  }
  return '(That reply is too hard for this student — ' + bits.join(', ') + '. Say the SAME idea again, much shorter. '
    + spec.rule + ' Keep the cheer and the question, drop everything else.)';
}

/**
 * 마지막 안전망 — 문장 «수» 만 결정론으로 줄입니다.
 *   맨 앞 문장(칭찬)과 되묻는 질문을 남기고 가운데를 버립니다. 한국어 팁은 그대로 붙여 줍니다.
 * ⛔ 문장 «안» 의 단어를 잘라내지 마세요 — 말이 깨진 영어를 아이가 그대로 따라 읽습니다.
 *    한 문장이 여전히 길면 그건 받아들입니다(문제를 못 주는 것이 더 나쁩니다).
 * ⛔ 질문을 버리지 마세요 — 되물을 말이 없어지면 그 자리에서 대화가 끊깁니다.
 */
export function aiFriendTrimSentences(reply: string, level: string): string {
  const spec = aiFriendLevelSpec(level);
  const parts = aiFriendSplitSentences(reply);
  if (parts.length <= spec.maxSentences) return reply;

  const tipMatch = String(reply || '').match(/\(\s*💡[^)]*\)\s*$/);
  const tip = tipMatch ? ' ' + tipMatch[0].trim() : '';

  let qIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) { if (/\?/.test(parts[i])) { qIdx = i; break; } }
  const lastIdx = qIdx >= 0 ? qIdx : parts.length - 1;

  const keep: string[] = [];
  if (spec.maxSentences >= 2 && lastIdx !== 0) keep.push(parts[0]);   // 칭찬 한 줄
  keep.push(parts[lastIdx]);
  // 자리가 남으면 앞쪽 문장을 순서대로 채운다(되묻는 질문은 늘 마지막에 남는다)
  for (let i = 1; i < parts.length && keep.length < spec.maxSentences; i++) {
    if (i === lastIdx) continue;
    keep.splice(keep.length - 1, 0, parts[i]);
  }
  return keep.join(' ').trim() + tip;
}
