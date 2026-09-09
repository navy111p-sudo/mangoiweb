/**
 * warmup-empathy.ts — 「학생이 힘들다고 했는데 AI 가 칭찬한다」를 막는 정본 (2026-09-09)
 *
 * [왜 생겼나] 사장님 제보 —
 *   학생: `I don't like school`
 *   Emma: `Haha nice! What do you like to do after school?`
 *   「학교를 좋아하지 않는다고 했는데 nice 라는 답변은 일반적이지 않아 보임.」
 *
 * [뿌리] AI 에게 주는 규칙에 «칭찬» 은 있는데 «공감» 이 없었다.
 *   · 웜업(`src/index.ts` warmupSystem)의 [칭찬] 규칙: 「학생이 잘 대답하면 크게 기뻐하며
 *     칭찬한 뒤 다음 질문으로」 + 돌려 쓸 말 목록에 **「Haha nice!」가 실제로 들어 있다.**
 *   · AI 영어친구(`src/api-ai.ts`)는 더 세다 — 「When the student writes in English,
 *     open with a SHORT cheer」라 **조건이 아예 없다.**
 *   ⟹ 모델 입장에서 `I don't like school` 은 «문장을 잘 만든 대답» 이라 규칙대로 칭찬했다.
 *      「무슨 말인지 보라」는 지시가 어디에도 없었다. 지어낸 말이 아니라 목록에서 뽑은 것이다.
 *
 * [두 겹으로 막는 이유 — 사장님이 고르신 B안]
 *   ① 프롬프트에 [공감] 규칙을 넣는다 (아래 WARMUP_EMPATHY_RULE / FRIEND_EMPATHY_RULE)
 *   ② 그것만 믿지 않는다. 이 저장소의 반복 실측이 「지시만으로는 안 지켜진다」다
 *      (단어 수·문법·구두점·직역 전례). 그래서 **학생이 부정적인 말을 한 턴에는
 *      서버가 답장 앞머리의 칭찬 상투구를 떼어 낸다.**
 *
 * ⛔ 말을 «지어내지» 않는다 — 떼기만 한다. 뒤 문장은 모델이 쓴 그대로 남는다.
 *    (초보가 그대로 따라 읽는 문장을 코드가 만들면 안 된다 — 이 저장소의 반복 규칙.)
 * ⛔ 「Oh」·「Don't worry」·「No worries」 같은 **공감 말머리는 떼지 않는다.**
 *    그건 지금 상황에서 «맞는» 말이다. 아래 목록에 애초에 넣지 않았다.
 * ⚠️ 떼고 나서 남는 영어가 없으면 **원문 그대로** 돌려준다. 빈 말풍선이 더 나쁘다.
 * ⚠️ 이 모듈의 함수는 **절대 던지지 않는다.** 여기서 던지면 멀쩡한 대화가 500 이 된다.
 */

/* ── ① 학생이 «부정적인 마음» 을 말했나 ──────────────────────────────────
 *  ⚠️ 여기서 틀리는 값의 대가는 비대칭이다.
 *     · 거짓 양성(아닌데 부정으로 봄) = 답장 앞머리의 감탄사 하나가 사라진다 → 가볍다.
 *     · 거짓 음성(부정인데 못 봄)     = 사장님이 제보하신 그 화면이 그대로 다시 난다.
 *     그래서 «확실한 신호» 를 넉넉히 담되, 뜻이 갈리는 낱말은 일부러 뺐다.
 *  ⛔ `sick`(요즘 «멋지다» 로도 쓴다)·`bad`(「not bad」= 칭찬)·`hard` 단독은 넣지 않는다.
 *     「too hard」·「so hard」처럼 «정도» 가 붙은 것만 본다.
 *  ⚠️ 학생 발화는 «음성인식» 을 거쳐 오므로 글자가 깨질 수 있다 — 못 잡는 것이 정상이고,
 *     그때는 프롬프트 규칙(①)이 받는다. 두 겹으로 둔 이유가 이것이다. */
const NEG_EN: readonly RegExp[] = [
  /\b(do\s*n['’]?t|do\s+not|dont|didn['’]?t|did\s+not|does\s*n['’]?t|can['’]?t|cannot)\s+(like|want|enjoy|understand|get\s+it)\b/i,
  /\bnot\s+(fun|good|great|nice|happy|easy|interesting)\b/i,
  /\bno\s+fun\b/i,
  /\b(hate|hated|hates)\b/i,
  /\b(boring|bored|sad|angry|upset|lonely|scared|afraid|worried|stressed|nervous)\b/i,
  /\b(terrible|awful|horrible|annoying|frustrating|frustrated|disappointed)\b/i,
  /\b(tired|exhausted|sleepy|exhausting)\b/i,
  /\b(too|so|very|really)\s+(hard|difficult|boring|tired|much)\b/i,
  /\b(it|that|this|english|school|homework|math)\s+(is|was|['’]s)\s+(hard|difficult|boring)\b/i,
  /\bgive\s+up\b/i,
  /\bi\s+(feel|am|['’]m)\s+(bad|down|sick|awful|terrible)\b/i,
];
/** 한국어는 «어간» 으로 본다 — 어미가 여러 가지라 낱말 경계로는 못 잡는다 */
const NEG_KO: readonly string[] = [
  '싫어', '싫다', '싫은', '싫었', '싫고', '하기싫', '하기 싫',
  '힘들', '어려워', '어렵', '못하겠', '모르겠어', '포기',
  '짜증', '슬퍼', '슬프', '우울', '속상', '화나', '화가',
  '피곤', '졸려', '졸리', '지겨', '재미없', '재미 없', '노잼',
  '무서워', '무섭', '걱정', '아파', '아팠', '아프',
];

/**
 * 학생이 «부정적인 마음» 을 말했는가.
 * ⚠️ «누가» 말했는지는 부르는 쪽이 정한다 — 이 함수에 AI 답장을 넣으면 안 된다.
 *    (AI 가 「Are you sad?」라고 물은 것을 학생의 감정으로 세면 정반대가 된다.)
 */
export function studentSoundsNegative(text: any): boolean {
  try {
    const t = String(text == null ? '' : text);
    if (!t.trim()) return false;
    for (const re of NEG_EN) if (re.test(t)) return true;
    for (const k of NEG_KO) if (t.indexOf(k) >= 0) return true;
    return false;
  } catch { return false; }   // 모르면 «평소대로»(안 떼기) — 고치기 전과 같은 동작
}

/* ── ② 답장 앞머리의 «칭찬 상투구» ────────────────────────────────────────
 *  🔗 이 목록은 **두 프롬프트의 «돌려 쓸 말» 목록과 짝** 이다
 *     (웜업 warmupSystem 의 [칭찬] · AI 영어친구의 「Rotate freely:」).
 *     프롬프트에 새 칭찬을 추가하고 여기에 안 넣으면 그 말만 조용히 안 걸린다 —
 *     그래서 하니스가 **두 프롬프트에서 목록을 «읽어»** 전부 여기에 있는지 대조한다.
 *  ⛔ 공감 말머리(Oh / Don't worry / No worries / Sorry / I see / Really)는 넣지 않는다.
 *     힘들다는 아이에게 그건 «맞는» 말이라 떼면 오히려 나빠진다. */
export const CHEER_LEADS: readonly string[] = [
  // 두 프롬프트가 실제로 돌려 쓰라고 적어 둔 것
  'haha nice', 'hahaha nice', 'haha', 'hahaha',
  'ooh nice one', 'nice one', 'good one', 'nice sentence', 'great sentence',
  "that's great", "that's right", "that's awesome", "that's cool", "that's perfect",
  'i love that', 'i like that', 'love it', 'i love it',
  'you got it', 'well said', 'great try', 'good try', 'nice try',
  'wow', 'yes', 'yeah', 'yay', 'woohoo', 'hooray', 'bravo',
  'perfect', 'cool', 'awesome', 'amazing', 'nice', 'great', 'good',
  // 같은 뜻으로 모델이 자주 쓰는 것
  'good job', 'great job', 'nice job', 'awesome job', 'amazing job',
  'good work', 'great work', 'nice work', 'well done', 'way to go',
  'excellent', 'fantastic', 'wonderful', 'super', 'brilliant', 'terrific',
  'good answer', 'great answer', 'nice answer', 'good sentence',
  'you did it', 'high five', 'sweet', 'nice going', 'keep it up',
];

/* 긴 것부터 맞춰야 「good job」 이 「good」 으로 잘리지 않는다 */
const LEAD_KEYS = [...CHEER_LEADS].sort((a, b) => b.length - a.length);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 낱말 경계 — 「Nice」 가 「Nicely」 를 물면 안 된다. 아포스트로피 두 종류 모두 허용 */
const CHEER_RE = new RegExp(
  '^(' + LEAD_KEYS.map((k) => escRe(k).replace(/'/g, "['’]")).join('|') + ')(?![A-Za-z\'’])', 'i');
/** 앞에 낄 수 있는 것: 공백·이모지 (글자·문장부호는 안 된다) */
const GAP_RE = /^[\s‍️\u{1f3fb}-\u{1f3ff}\p{Extended_Pictographic}]*/u;
/** 상투구 뒤에 반드시 있어야 하는 종결부호. 없으면 «문장의 일부» 로 보고 떼지 않는다
 *  (「Nice sentence you wrote」의 Nice 를 떼면 문장이 부서진다) */
const PUNCT_RE = /^\s*([!.~?]+|,)/;

/**
 * 답장 앞머리의 칭찬 상투구를 떼어 낸다 — **학생이 부정적인 말을 한 턴에만** 부른다.
 *
 *   `Haha nice! What do you like to do after school?`
 *     → `What do you like to do after school?`
 *
 * ⚠️ 최대 2번까지만 떼어 낸다(「Great try! Nice one! …」 같은 겹칭찬).
 *    그 뒤는 진짜 문장일 가능성이 높다.
 * ⚠️ 떼고 남는 것이 없으면 **원문 그대로** 돌려준다.
 */
export function stripCheerLead(reply: any): string {
  /* ⚠️ String() 조차 try «안» 에 둔다 — 밖에 두었다가 하니스가 잡았다.
     toString 이 던지는 값이 오면 그 자리에서 예외가 나 대화가 통째로 500 이 된다.
     ⛔ 이 모듈은 어떤 입력에도 던지지 않는다(위 머리말의 마지막 규칙). */
  try {
    const orig = String(reply == null ? '' : reply);
    let rest = orig;
    let peeled = 0;
    for (let i = 0; i < 2; i++) {
      const gap = (rest.match(GAP_RE) || [''])[0];
      const afterGap = rest.slice(gap.length);
      const m = afterGap.match(CHEER_RE);
      if (!m) break;
      const afterWord = afterGap.slice(m[0].length);
      const p = afterWord.match(PUNCT_RE);
      if (!p) break;                       // 종결부호가 없으면 «문장의 일부» — 떼지 않는다
      rest = afterWord.slice(p[0].length);
      peeled++;
    }
    if (!peeled) return orig;
    rest = rest.trim();
    if (!rest) return orig;                // 통째로 칭찬뿐이었다 → 원문 유지(빈 말풍선 금지)
    // 첫 글자를 대문자로 — 「what do you like…」 가 남으면 문장이 소문자로 시작한다
    const j = rest.search(/[A-Za-z]/);
    if (j >= 0 && j <= 3) rest = rest.slice(0, j) + rest.charAt(j).toUpperCase() + rest.slice(j + 1);
    return rest;
  } catch { return typeof reply === 'string' ? reply : ''; }   // 모르면 «고치기 전과 같이»
}

/**
 * 부르는 쪽이 쓰는 한 줄 — 「학생이 부정적이면 칭찬 말머리를 뗀다」.
 * ⚠️ 판정에 넣는 것은 **학생 발화**이고, 다듬는 것은 **AI 답장**이다. 바꿔 넣지 말 것.
 */
export function applyEmpathyGuard(studentText: any, reply: any): string {
  try {
    if (!studentSoundsNegative(studentText)) return String(reply == null ? '' : reply);
    return stripCheerLead(reply);
  } catch { return typeof reply === 'string' ? reply : ''; }
}

/* ── ③ 프롬프트에 넣는 규칙 ──────────────────────────────────────────────
 *  ⛔ 이것«만» 으로 풀지 말 것 — 위 ②가 정본이고 이건 «먼저» 막는 쪽이다.
 *  ⚠️ 웜업 규칙은 한국어로 쓴다(그 프롬프트가 한국어) · 친구 규칙은 영어로 쓴다.
 *     그 자리의 다른 규칙들과 같은 말투여야 모델이 똑같이 취급한다. */
export const WARMUP_EMPATHY_RULE =
  '[공감] 학생이 싫다·힘들다·슬프다·피곤하다·재미없다처럼 부정적인 마음을 말하면 '
  + '«칭찬 말로 시작하지 마». Wow!, Nice!, Haha nice! 같은 감탄사를 앞에 붙이지 말고, '
  + '먼저 그 마음을 한 문장으로 받아 준 다음(예: Oh, really? That\'s okay.) '
  + '무엇이 힘든지 한 가지만 부드럽게 물어봐. 억지로 밝게 만들려 하지 말고 학생이 말한 것을 그대로 인정해 줘.';

export const FRIEND_EMPATHY_RULE =
  '- If the student says they dislike something, or sounds sad, tired, bored, worried or upset, '
  + 'do NOT open with a cheer (no Wow!/Nice!/Haha nice!). '
  + 'Acknowledge the feeling first in ONE short sentence (e.g. "Oh, really? That\'s okay."), '
  + 'then ask one gentle follow-up question about it. Never tell them to cheer up.';
