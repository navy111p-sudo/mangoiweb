/**
 * 🧩 «조각 질문» 막기 — 아바타가 「like space?」 처럼 앞부분이 빠진 질문을 하지 않게 (2026-10-28)
 *
 * [발단] 사장님 「아바타가 완전한 문장으로 말하게 만들어줘. 갑자기 질문에 like space? 이런 식으로
 *        나오지 말게 해줘.」
 *
 * [원인] 웜업 1단계 지시는 «한 번에 3~5단어» 인데, 엘리더잼 L1 은 매 턴 질문 앞에 접속사
 *        (By the way · One more thing · Oh, and · Of course …)를 붙이게 한다. 두 지시를 다 지키려다
 *        모델이 «문법 낱말»(do you · is it)부터 버린다 — 「By the way, like space?」.
 *        CLAUDE.md 2장 「길이를 조이면 모델은 «문법 낱말» 부터 버립니다」(AI 친구 2026-08-31)와 같은 뿌리다.
 *        AI 친구에는 그때 검사기(aiFriendBrokenQuestions)를 달았지만 웜업에는 없었다.
 *
 * [하는 일] 기초 단계(1~3)에서 «질문이 완전한 문장인가» 를 결정론으로 재고, 아니면 부르는 쪽이
 *          한 번 다시 뽑게 한다. 이 파일은 «판정» 만 한다 — 문장을 고쳐 쓰지 않는다
 *          (아이가 따라 읽을 문장을 코드가 지어내면 안 된다 — 이 저장소의 반복 규칙).
 *
 * ⚠️ 왜 aiFriendBrokenQuestions 를 그대로 안 썼나 — 실측(2026-10-28)으로 거짓 경보가 있었다:
 *    「What's your name?」·「Where's your cat?」·「How's your day?」(의문사 축약형)와
 *    「Is space big?」(관사 없는 셀 수 없는 명사)를 «깨졌다» 고 본다. 웜업은 그때마다 모델을
 *    한 번 더 부르므로(학생이 기다림) 거짓 경보의 값이 크다. 그래서 «앞부분이 빠졌는가» 하나만 본다.
 * ⚠️ 상급(4~8단계)에는 걸지 않는다 — 「So you like dogs?」 같은 구어체가 정상이다(AI 친구와 같은 판단).
 * ⛔ 이 파일은 import 가 없다 — 하니스가 그대로 번들해 «실제로 돌려서» 검증한다.
 */

/** 질문 앞에 와도 되는 조동사(+부정 축약). */
const AUX = new Set(['do', 'does', 'did', 'is', 'are', 'am', 'was', 'were', 'can', 'could', 'will',
  'would', 'shall', 'should', 'have', 'has', 'had', 'may', 'might', 'must',
  "don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "can't", "couldn't",
  "won't", "wouldn't", "shouldn't", "haven't", "hasn't", "hadn't", "ain't"]);
/** 의문사 — 「What's」·「Where'd」 같은 축약형도 받는다. */
const WH = /^(?:who|what|when|where|why|how|which|whose|whom)(?:'s|'re|'ll|'d|'ve|'m)?$/;
/** 혼자 와도 자연스러운 되묻기 — 「Really?」·「Right?」·「And you?」(and 는 앞머리로 떼어진다). */
const TAG_OK = new Set(['really', 'right', 'ok', 'okay', 'yes', 'no', 'yeah', 'sure', 'huh', 'pardon', 'sorry',
  'you', 'me', 'you too', 'me too', 'yes or no']);
/** 질문 앞에 붙는 말(접속사·감탄·칭찬). 떼고 나서 남은 것으로 판정한다. */
const LEAD = /^(?:(?:oh|ok|okay|so|well|hey|wow|hmm|and|but|or|also|plus|still|now|then|moreover|great|nice|cool|good|yes|yeah|yay|sure|by the way|one more thing|of course|good job|great job|nice job|well done)\b[\s,.!-]*)+/;

/** 문장 나누기 — 괄호(한국어 도움말)는 먼저 걷어 낸다. 영어 낱말이 없는 조각은 버린다. */
function sentences(text: string): string[] {
  return String(text == null ? '' : text)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s));
}

/** 쉼표로 나뉜 한 조각이 «제대로 시작하는 질문» 인가. 앞머리(접속사·감탄)뿐이면 null(판정 안 함). */
function partStarts(part: string): boolean | null {
  const low = part.toLowerCase().replace(/[^a-z' -]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!low) return null;
  const rest = low.replace(LEAD, '').trim();
  if (!rest) return null;
  if (TAG_OK.has(rest)) return true;
  const first = rest.split(' ')[0];
  return AUX.has(first) || WH.test(first);
}

/**
 * 그 답에서 «앞부분이 빠진 질문» 을 골라냅니다. 없으면 빈 배열.
 * 쉼표로 나뉜 조각 중 하나라도 제대로 시작하면 완전한 질문으로 봅니다 —
 * 「Ed, do you like dogs?」(부르는 말)·「Space is big, isn't it?」(꼬리 질문)이 그 경우입니다.
 */
export function fragmentQuestions(text: string): string[] {
  const bad: string[] = [];
  for (const sent of sentences(text)) {
    if (sent.indexOf('?') < 0) continue;
    // 한글이 섞인 문장은 «영어 질문» 이 아니다(교재 한국어 문항 「sun이라고 말할 수 있나요?」 등) — 판정하지 않는다.
    if (/[\u3131-\u318e\uac00-\ud7a3]/.test(sent)) continue;
    // 따옴표 안 문장은 «따라 말해 볼 문장» 이라 질문 판정에서 뺀다 — 「Can you say "I like space"?」
    const body = sent.replace(/"[^"]*"/g, ' X ').replace(/\?.*$/, '');
    const parts = body.split(/[,;:]/);
    let sawJudged = false, okAny = false;
    for (const p of parts) {
      const r = partStarts(p);
      if (r == null) continue;
      sawJudged = true;
      if (r) { okAny = true; break; }
    }
    if (sawJudged && !okAny) bad.push(sent);
  }
  return bad;
}

/** 이 단계에서 검사하는가 — 영어 기초(1~3단계)만. 중국어·상급·단계 모름(0)은 안 본다. */
export function checksFragmentQuestions(difficulty: number, lang: string): boolean {
  return lang !== 'zh' && difficulty >= 1 && difficulty <= 3;
}

/** 시스템 지시에 붙일 한 줄(기초 단계). 단어 수보다 문법이 먼저라는 것을 «예문으로» 못 박는다. */
export const FULL_QUESTION_RULE =
  "[완전한 질문] 문법이 단어 수보다 먼저야 — 질문은 언제나 'Do you like space?' 'Is it big?' 'What is your favorite color?' 처럼 " +
  "Do / Does / Is / Are / Can 이나 의문사로 시작하는 완전한 문장으로 말해. 'Like space?' 'By the way, like space?' 'Cats or dogs?' 처럼 " +
  "앞부분을 떼거나 낱말만 던지지 마. 접속사(So, By the way 등)를 붙여도 그 뒤 질문은 완전한 문장이어야 해.";

/** 다시 뽑을 때 모델에게 줄 지시 — 무엇이 틀렸는지 그대로 보여 준다(모르면 같은 것을 또 만든다). */
export function fragmentQuestionHint(bad: string[]): string {
  const shown = bad.slice(0, 3).map((s) => '"' + String(s).slice(0, 80) + '"').join(' ');
  return '(Your question ' + shown + ' is not a full sentence. Say your reply again with the same meaning, ' +
    'and make every question a full question that starts with Do / Does / Is / Are / Can or a question word, ' +
    'e.g. "Do you like space?". Keep it short and keep the same JSON format.)';
}
