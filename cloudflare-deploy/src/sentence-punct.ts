// ═══════════════════════════════════════════════════════════════════════
// ✒️ 문장 종결부호 정본 (2026-08-26)
//   발단: 사장님 지적 — 판단력 훈련 화면에서 보기 A 는 «What's wrong with you?» 로
//   끝나는데 B·C·D 는 «Sorry, that was my fault» 처럼 맨몸이라 한 카드 안에서
//   규칙이 갈려 보였습니다. 물음표·느낌표는 «뜻을 지고 가는» 부호라 뺄 수 없으므로,
//   가지런하게 만드는 길은 «마침표를 찍는 쪽» 하나뿐입니다.
//
//   ⚠️ 왜 프롬프트로 안 풀었나 — 문항은 문제은행이 아니라 LLM 이 요청마다
//   실시간 생성합니다. 이 저장소의 반복 실측(단어 수·문법)이 보여주듯
//   «지시만으로는 안 지켜집니다» → 절반만 찍힌 상태가 되어 지금보다 나빠집니다.
//   그래서 받은 문자열을 코드에서 결정론적으로 다듬습니다(프롬프트 규칙은 보조).
//
//   ⛔ 아무 데나 쓰면 안 됩니다 — «문장» 인 자리에만 씁니다.
//      단어 퀴즈 보기(「어려운」·「你好」·「go to school」)에 마침표를 찍으면 고장입니다.
//      그래서 이 모듈은 «찍지 않는 쪽» 으로 실패하도록 짜여 있습니다:
//        · 이미 종결부호로 끝났으면 그대로 (Mr. · ... · ? · ! 포함)
//        · 마지막 글자가 로마자·숫자·한글이 아니면 그대로
//          (한자·이모지·쉼표 — 한자는 「。」를 쓰므로 여기서 손대면 안 됩니다)
//
//   ⚠️ 이 파일은 import 가 하나도 없는 순수 모듈입니다 —
//      test-harness/sentence_punct_harness.mjs 가 직접 불러 «실제로 돌려» 검증합니다.
// ═══════════════════════════════════════════════════════════════════════

/** 종결부호로 인정하는 글자 — 로마자권·CJK 양쪽. */
const TERMINAL = /[.!?…。！？]/u;

/** 마침표를 «붙여도 되는» 마지막 글자 — 로마자·숫자·한글 음절뿐입니다. */
const APPENDABLE = /[A-Za-z0-9\u{AC00}-\u{D7A3}]/u;

/** 문장 끝에 딸려 오는 닫는 부호들. */
const CLOSER_RUN = /[)\]}"'”’»›」』〉]*$/u;

/** 여는 따옴표 → 짝이 되는 닫는 따옴표. 이 짝일 때만 부호를 «안쪽» 에 넣습니다. */
const QUOTE_PAIRS: Record<string, string> = { '"': '"', "'": "'", '“': '”', '‘': '’', '«': '»', '‹': '›', '「': '」', '『': '』' };

/** 영어 의문문의 첫 낱말 — 여기에 걸리면 마침표가 아니라 물음표를 붙입니다. */
const QUESTION_HEAD = /^(?:do|does|did|is|are|am|was|were|can|could|will|would|shall|should|may|might|must|have|has|had|what|what's|where|where's|when|who|whom|whose|why|how|which|aren't|isn't|don't|doesn't|didn't|can't|couldn't|won't|wouldn't|shouldn't|haven't|hasn't)\b/i;

/** ⚠️ do·have 는 명령문 머리로도 온다 — «Have a great day» · «Do your homework».
 *  바로 뒤가 주어스러운 낱말일 때만 의문문으로 확신하고(«Do you…» · «Have they…»),
 *  아니면 이 모듈의 원칙대로 손대지 않는다(마침표를 «찍는» 쪽으로도 확신하지 않는다 —
 *  «Have a great day.» 로 굳히는 것도 «?» 만큼은 아니지만 넘겨짚기다). */
const AMBIG_Q_HEAD = /^(?:do|have)\s+(?:i|you|we|they|he|she|it|there|anyone|anybody|someone|somebody|everyone|everybody|nobody)\b/i;
const AMBIG_HEAD = /^(?:do|have)\b/i;

// 🇰🇷 한국어 종결어미 — 물음표 쪽을 «먼저» 봅니다(「맞나요」의 «요» 를 평서문으로 읽으면 안 됩니다).
//    ⚠️ 확신이 서는 어미만 넣습니다. 「…단어는」 처럼 어느 쪽도 아니면 손대지 않는 것이 정답입니다.
const KO_QUESTION_TAIL = /(?:까|죠|나요|가요|은가|는가|는지|ㄴ지|니|냐|을까|ㄹ까)$/u;
const KO_STATEMENT_TAIL = /(?:요|다|오|음|함|임)$/u;

/** 닫는 따옴표·괄호를 벗겨 낸 «알맹이» — 판정은 여기서 합니다. */
export function coreOf(text: any): string {
  const t = String(text == null ? '' : text).trim();
  const closers = (t.match(CLOSER_RUN) || [''])[0];
  return closers ? t.slice(0, t.length - closers.length) : t;
}

/** 이미 종결부호로 끝났는가 — 닫는 부호는 벗겨 내고 «안쪽» 을 봅니다("Sorry." → true). */
export function endsWithTerminalPunct(text: any): boolean {
  const core = coreOf(text);
  if (!core) return false;
  return TERMINAL.test(String(Array.from(core).pop() || ''));
}

/**
 * 붙일 부호를 고릅니다 — '?' · '.' · '' (=손대지 않음).
 *   영어는 첫 낱말로, 한국어는 종결어미로 판정하고, 확신이 없으면 '' 를 돌려줍니다.
 */
export function terminalMarkFor(text: any): '' | '.' | '?' {
  const t = String(text == null ? '' : text).trim();
  if (!t) return '';
  if (AMBIG_HEAD.test(t)) return AMBIG_Q_HEAD.test(t) ? '?' : '';
  if (QUESTION_HEAD.test(t)) return '?';
  const last = String(Array.from(t).pop() || '');
  // 한글로 끝나면 한국어 어미로 판정 — 어느 쪽도 아니면 손대지 않습니다.
  if (/[\u{AC00}-\u{D7A3}]/u.test(last)) {
    if (KO_QUESTION_TAIL.test(t)) return '?';
    if (KO_STATEMENT_TAIL.test(t)) return '.';
    return '';
  }
  return '.';
}

/** 문자열 전체가 한 쌍의 따옴표로 싸여 있는가 — 그럴 때만 부호를 안쪽에 넣습니다. */
function isQuoteWrapped(t: string, closers: string): boolean {
  if (closers.length !== 1) return false;
  const open = String(Array.from(t)[0] || '');
  return QUOTE_PAIRS[open] === closers;
}

/**
 * 문장 끝에 종결부호를 보장합니다.
 *   · 이미 끝났으면 그대로 · 붙일 수 없는 글자로 끝나면 그대로 · 판정이 안 서면 그대로
 *   · 통째로 따옴표에 싸인 문장은 «안쪽» 에("Sorry" → "Sorry.")
 *   · 끝에 붙은 괄호 주석은 «뒤» 에(「정답: 你好 (nǐ hǎo)」 → 「… (nǐ hǎo).」)
 */
export function endSentence(text: any): string {
  const t = String(text == null ? '' : text).trim();
  if (!t) return t;
  const closers = (t.match(CLOSER_RUN) || [''])[0];
  const core = closers ? t.slice(0, t.length - closers.length) : t;
  if (!core) return t;                                   // 부호만 있는 문자열
  const last = String(Array.from(core).pop() || '');
  if (TERMINAL.test(last)) return t;                     // 이미 끝났음 (Mr. · ... · ? · ! 포함)
  if (!APPENDABLE.test(last)) return t;                  // 한자·이모지·쉼표·빈칸(____) 등은 손대지 않습니다
  const mark = terminalMarkFor(core);
  if (!mark) return t;                                   // 판정이 안 서면 그대로 — 틀리게 찍는 것이 더 나쁩니다
  return isQuoteWrapped(t, closers) ? core + mark + closers : t + mark;
}

/** 보기 목록처럼 여러 문장을 한꺼번에. 배열이 아니면 빈 배열을 돌려줍니다. */
export function endSentences(list: any): string[] {
  return Array.isArray(list) ? list.map((s) => endSentence(s)) : [];
}

/**
 * 생성 프롬프트에 넣는 구두점 지시(보조 — 정본은 위 결정론 함수입니다).
 *   낱말 보기에는 찍지 말라는 것까지 함께 못 박습니다.
 */
export const PUNCTUATION_PROMPT_RULE =
  'PUNCTUATION: Every complete sentence you output — the situation, every full-sentence option, the question, and the explanation — must end with proper terminal punctuation (. ? or !). '
  + 'A question ends with "?", never with "." — and never leave a sentence with no ending mark at all. '
  + 'Single words or short noun phrases used as answer choices (e.g. "difficult", "go to school") take NO ending punctuation.';
