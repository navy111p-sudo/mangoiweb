// ═══════════════════════════════════════════════════════════════════════
// 🧐 판단력 훈련 — 영어 문장 품질 규칙 (2026-08-24)
//   발단: 사장님 지적 — 실서비스 문항에 «Want play with me» (to 누락) 같은
//   깨진 영어가 선택지로 그대로 나갔습니다.
//
//   왜 생겼나 — 문항은 문제은행이 아니라 Workers AI(llama-3.3)가 요청마다
//   실시간 생성하는데, 프롬프트 어디에도 「선택지도 문법은 맞아야 한다」는
//   지시가 없었습니다. 오히려
//     ① 채점 기준의 "clearly rude or wrong option" 이 「문법이 틀린 문장」으로
//        해석될 여지를 줬고
//     ② 최저 밴드(첫걸음)의 「선택지 5단어 이하」 제약이 "Want to play with me?"
//        (6단어)를 못 쓰게 해 to 를 떨어뜨린 전보문으로 밀었습니다.
//
//   설계 원칙 — 판단력 훈련의 오답은 «상황·말투에 안 맞는 말»이지
//   «깨진 영어»가 아닙니다(깨진 오답은 문법만 보고 답이 나와 판단 훈련이 안 됩니다).
//   유일한 예외: 학생이 문법 유형(형태/시제) 연습을 «스스로 고른» 문항 —
//   그때는 오답에 그 실수를 일부러 심는 것이 연습의 목적입니다.
//
//   ⚠️ 이 파일은 import 가 하나도 없는 순수 모듈입니다 —
//      test-harness/judgment_grammar_harness.mjs 가 직접 불러 검증합니다.
// ═══════════════════════════════════════════════════════════════════════

/** 문법이 «틀린» 오답이 허용되는 오답 유형 — 학생이 직접 고른 연습에서만 씁니다. */
export const GRAMMAR_PRACTICE_MISCONCEPTIONS = ['GRAMMAR_FORM', 'TENSE_CONFUSION'] as const;

/** 이 오답 유형을 학생이 직접 골랐다면 오답에 그 문법 실수를 심어도 되는가. */
export function allowsBrokenDistractors(pickedMisconception: any): boolean {
  return (GRAMMAR_PRACTICE_MISCONCEPTIONS as readonly string[]).includes(String(pickedMisconception || '').toUpperCase().trim());
}

/**
 * 시나리오 생성 프롬프트에 넣는 영어 품질 지시.
 *   allowBrokenDistractors=false(기본): 상황문·모든 선택지·해설 전부 문법이 맞아야 하고,
 *     오답은 «말투·상황 적합성»만 어긋나야 합니다.
 *   true(문법 연습 문항): 오답에만 «한 개의 사실적인 문법 실수»를 심고,
 *     상황문·정답·해설은 여전히 흠 없는 영어여야 합니다.
 */
export function englishQualityRules(allowBrokenDistractors: boolean): string {
  if (allowBrokenDistractors) {
    return 'ENGLISH QUALITY (strict): The situation, the "why" explanation, and the BEST option must be complete, natural, grammatically correct English. '
      + 'Because the child chose to practice grammar, each WRONG option must contain exactly ONE realistic grammar mistake a Korean child actually makes '
      + '(a missing word like "to", wrong word order, or a wrong verb form) — everything else about it stays natural. '
      + 'Never use broken English anywhere except inside those wrong options.';
  }
  return 'ENGLISH QUALITY (strict): Every sentence you output — the situation, EVERY option, and the "why" — must be complete, natural, grammatically correct English that a native speaker could actually say. '
    + 'Wrong options must be wrong ONLY in politeness, tone, or fit for this situation — NEVER in grammar. '
    + 'For example "Want play with me" (missing "to") must never appear as any option; "Do you want to play?" is fine. '
    + 'If a natural expression does not fit the word limit, choose a DIFFERENT shorter natural expression — never make it fit by dropping words.';
}

/**
 * 생성 «결과»를 다시 읽혀 보는 교정 프롬프트.
 *   이 저장소의 반복 실측(단어 수)이 보여주듯 지시만으로는 안 지켜집니다 —
 *   받은 문장을 실제로 검사하고 어긋나면 다시 뽑습니다.
 */
export function grammarCheckPrompt(items: string[]): string {
  const list = (items || []).map((s, i) => `${i + 1}. ${String(s || '')}`).join('\n');
  return 'You are a strict English proofreader for a children\'s English learning app.\n'
    + 'For each numbered line below, decide whether it is complete, natural, grammatically correct English that a native speaker could actually say.\n'
    + 'Casual spoken forms are fine ("Wanna play?", "Sounds good!"). '
    + 'A missing required word ("Want play with me" is missing "to"), wrong word order, or a wrong verb form is NOT fine.\n\n'
    + list
    + '\n\nReturn STRICT JSON only: {"bad": [<numbers of the lines that are NOT correct natural English; [] if every line is fine>]}';
}
