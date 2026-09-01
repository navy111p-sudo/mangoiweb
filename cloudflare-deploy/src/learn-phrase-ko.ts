/**
 * learn-phrase-ko.ts — 「뜻 보기」 칭찬·인사 상투구 한국어 정본 (2026-08-31)
 *
 * [왜 생겼나] 사장님 제보 — AI 영어친구 말풍선의 「뜻」 버튼이
 *   「Good job! 🦊 Do you have a pet animal?」를
 *   **「훌륭한 직업! 당신은 애완 동물이 있습니까?」** 로 보여 주었다.
 *   `job` 을 «직업» 으로 옮긴 **직역**이다. 아이가 읽는 카드라 그대로 배운다.
 *
 * [뿌리 두 겹]
 *   ① `ai-friend.html` 이 `/api/translate` 를 **모드 없이** 불렀다 → 기본 경로는
 *      번역모델 m2m100 직역. 웜업(`warmup.html`)은 2026-08-24 에 이미 `mode:'learn'`
 *      (언어모델 의역)으로 고쳤는데 **AI 친구 화면만 빠져 있었다.**
 *      → 같은 판정이 두 곳에 있으면 한쪽만 고쳐진다는, 이 저장소의 반복 사고.
 *   ② learn 모드로 바꿔도 «확률» 이다. 이 저장소의 반복 실측이
 *      「지시만으로는 안 지켜진다」(단어 수·문법·구두점 전례)이므로,
 *      **제일 자주 나오고 제일 크게 틀리는 상투구는 결정론으로 못 박는다.**
 *      그 상투구가 이 표다.
 *
 * ⛔ 문장 «안» 의 낱말을 이 표로 갈아 끼우지 말 것 — 여기서 하는 일은
 *    «말머리에 통째로 붙은 상투구» 를 떼어 내 정해진 한국어로 바꾸는 것뿐이다.
 *    (「a good job market」 같은 진짜 명사 job 을 건드리면 안 된다.)
 * ⛔ 뒤에 마침표·느낌표가 없으면 떼지 않는다 — 「Good job on your sentence」처럼
 *    문장의 일부일 수 있고, 그때 떼면 「잘했어요! on your sentence」가 된다.
 */

/** 말머리 상투구 → 아이가 읽을 한국어 (해요체 고정 — 「뜻」 카드는 학생이 읽는다) */
export const LEARN_LEAD_KO: Record<string, string> = {
  // ── 「Good job」 계열 — 이번 사고의 당사자. job=직업 직역이 여기서 났다 ──
  'good job': '잘했어요',
  'great job': '아주 잘했어요',
  'nice job': '잘했어요',
  'awesome job': '정말 잘했어요',
  'amazing job': '정말 잘했어요',
  'good work': '잘했어요',
  'great work': '아주 잘했어요',
  'nice work': '잘했어요',
  'well done': '잘했어요',
  'you did it': '해냈어요',
  'you got it': '맞았어요',
  // ── 「try」 계열 — try 를 «재판·시도해 보다» 로 옮기는 직역이 잦다 ──
  'good try': '좋은 시도예요',
  'great try': '좋은 시도예요',
  'nice try': '좋은 시도예요',
  'good effort': '열심히 했네요',
  'keep trying': '계속해 봐요',
  'keep going': '계속해 봐요',
  'keep it up': '지금처럼 계속해요',
  'almost': '거의 다 왔어요',
  'so close': '거의 다 맞았어요',
  'not bad': '괜찮은데요',
  // ── 대답·문장 칭찬 ──
  'good answer': '좋은 대답이에요',
  'great answer': '멋진 대답이에요',
  'nice answer': '좋은 대답이에요',
  'good sentence': '문장 잘 만들었어요',
  'great sentence': '문장 정말 잘 만들었어요',
  'nice sentence': '문장 잘 만들었어요',
  'good question': '좋은 질문이에요',
  'great question': '좋은 질문이에요',
  'nice question': '좋은 질문이에요',
  'good idea': '좋은 생각이에요',
  'great idea': '좋은 생각이에요',
  'nice idea': '좋은 생각이에요',
  'good point': '좋은 얘기예요',
  'good choice': '잘 골랐어요',
  'nice choice': '잘 골랐어요',
  // ── 한 낱말 감탄 ──
  'awesome': '최고예요',
  'amazing': '정말 대단해요',
  'excellent': '훌륭해요',
  'fantastic': '아주 멋져요',
  'wonderful': '멋져요',
  'perfect': '완벽해요',
  'super': '아주 잘했어요',
  'brilliant': '정말 훌륭해요',
  'cool': '멋져요',
  'nice': '좋아요',
  'good': '좋아요',
  'great': '좋아요',
  'yay': '야호',
  'wow': '와',
  'oh': '아',
  'hooray': '만세',
  'bravo': '멋져요',
  'well said': '잘 말했어요',
  'you rock': '최고예요',
  'high five': '하이파이브',
  // ── 인사·맺음 ──
  'hi there': '안녕하세요',
  'hello there': '안녕하세요',
  'good luck': '행운을 빌어요',
  'have fun': '재미있게 해요',
  'no worries': '걱정 말아요',
  "don't worry": '걱정 말아요',
  'thanks': '고마워요',
  'thank you': '고마워요',
  'see you': '또 만나요',
  'bye': '안녕히 가세요',
};

/** 상투구 사이에 낄 수 있는 것: 공백·이모지 ─ 글자(라틴/한글/한자)와 문장부호만 아니면 통과 */
const LEAD_GAP = /^[\s\u200d\ufe0f\u{1f3fb}-\u{1f3ff}\p{Extended_Pictographic}]*/u;

/** 상투구 뒤에 반드시 있어야 하는 종결부호. 없으면 «문장의 일부» 로 보고 떼지 않는다 */
const LEAD_PUNCT = /^\s*([!.~?]+|,)/;

/* 긴 것부터 맞춰야 「good job」 이 「good」 으로 잘리지 않는다 */
const LEAD_KEYS = Object.keys(LEARN_LEAD_KO).sort((a, b) => b.length - a.length);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 낱말 경계 — 「Good」 이 「Goodbye」 를 물지 않게 뒤에 라틴 글자가 오면 안 된다 */
const LEAD_RE = new RegExp('^(' + LEAD_KEYS.map(esc).join('|') + ')(?![A-Za-z\'’])', 'i');

export interface LearnLead {
  /** 떼어 낸 상투구의 한국어. 없으면 '' */
  leadKo: string;
  /** 상투구를 뗀 나머지 영어. 전부 상투구였으면 '' */
  rest: string;
}

/**
 * 말머리의 «아는 상투구» 를 떼어 낸다 — 기계번역·언어모델에 맡기지 않는 부분.
 *
 * 「Good job! 🦊 Do you have a pet animal?」
 *   → { leadKo: '잘했어요!', rest: '🦊 Do you have a pet animal?' }
 *
 * ⚠️ 최대 3번까지만 떼어 낸다(「Great try! Nice sentence! …」 같은 겹칭찬).
 *    그 뒤는 진짜 문장일 가능성이 높다.
 */
export function peelLearnLead(text: string): LearnLead {
  let rest = String(text || '');
  const leads: string[] = [];
  for (let i = 0; i < 3; i++) {
    // 앞의 공백·이모지는 잠시 들고 있는다 — 상투구가 안 걸리면 그대로 돌려놔야 한다
    const gap = (rest.match(LEAD_GAP) || [''])[0];
    const afterGap = rest.slice(gap.length);
    const m = afterGap.match(LEAD_RE);
    if (!m) break;
    const afterWord = afterGap.slice(m[0].length);
    const p = afterWord.match(LEAD_PUNCT);
    if (!p) break;                       // 종결부호가 없으면 «문장의 일부» — 떼지 않는다
    const ko = LEARN_LEAD_KO[m[1].toLowerCase()];
    if (!ko) break;                      // 이론상 안 오지만, 오면 손대지 않는다
    // 이모지는 버리지 않고 한국어 앞에 되돌려 붙인다(원문의 🦊 가 사라지면 안 된다)
    leads.push((gap.trim() ? gap.trim() + ' ' : '') + ko + (p[1] === ',' ? ',' : p[1]));
    rest = afterWord.slice(p[0].length);
  }
  if (!leads.length) return { leadKo: '', rest: String(text || '') };
  return { leadKo: leads.join(' ').trim(), rest: rest.trim() };
}

/** 떼어 낸 한국어 + 나머지의 번역을 다시 한 문장으로 잇는다 */
export function joinLearnLead(leadKo: string, koRest: string): string {
  const a = String(leadKo || '').trim();
  const b = String(koRest || '').trim();
  if (!a) return b;
  if (!b) return a;
  return a + ' ' + b;
}

/**
 * learn 모드 프롬프트에 넣을 «직역 금지» 예시.
 * ⛔ 이것만으로 풀지 말 것 — 정본은 위 표(결정론)이고 이건 나머지 문장을 위한 보조다.
 */
export const LEARN_GLOSS_HINT =
  'These are cheers, not literal statements: "Good job!" means 잘했어요 (never 직업/job as an occupation), '
  + '"Great try!" means 좋은 시도예요, "Nice sentence!" means 문장 잘 만들었어요, '
  + '"Let\'s warm up" means having a light practice chat (never making anything warm). '
  + 'In a school context "숙제" is school homework, never housework or a job.';

/* ── 고정 인사말 의역 (정본) ────────────────────────────────────────────
 *  [왜 여기로 옮겼나] 2026-09-01 — 이 판정이 «두 곳» 이었습니다.
 *    ① `warmup.html` 의 `curatedMeaning()` (클라이언트 정규식 — 옛 인사 전용 안전망)
 *    ② 서버는 아무것도 몰라서, 다른 화면이 같은 문장을 물으면 직역이 나왔습니다.
 *  이번 수리의 뿌리 진단이 바로 「같은 판정이 두 곳에 있으면 한쪽만 고쳐진다」라,
 *  그 형태를 그대로 남겨 둘 수 없어 **서버 한 곳**으로 모았습니다.
 *
 *  ℹ️ 「그린 쪽이 자기가 쓴 한국어를 알고 있는」 경우(`warmup.html` 의 `_koCache` 미리 넣기)는
 *     중복이 아닙니다 — 그건 «판정» 이 아니라 «자기가 방금 쓴 값» 이고, 번역 요청 자체를 없앱니다.
 *     여기 있는 것은 그 값을 못 가진 채 옛 문장이 서버까지 온 경우의 안전망입니다.
 *
 *  ⚠️ 인사말에 «고른 친구 이름» 이 들어갑니다(Lily·Noah…). 옛 문장은 "your Mangoi AI friend"
 *     로 박혀 있었으므로 둘 다 받습니다. 못 맞추면 빈 문자열 — 일반 경로로 넘어갑니다.
 */
const GREETING_RE =
  /^Hi! I'm (your Mangoi AI friend|[A-Za-z][A-Za-z .'-]{0,29}?)\.?\s*🥭\s*(?:Today's topic is "([\s\S]{1,80}?)"\.\s*)?Let's warm up before class\. How are you today\?$/;

/** 고정 인사말이면 손으로 다듬은 의역을 준다. 아니면 '' (일반 번역 경로로 넘어간다) */
export function curatedLearnMeaning(text: string): string {
  const m = String(text || '').trim().match(GREETING_RE);
  if (!m) return '';
  const who = m[1] === 'your Mangoi AI friend' ? '망고아이 AI 친구' : m[1].trim();
  return '안녕하세요! 저는 ' + who + ' 예요 🥭 '
    + (m[2] ? ('오늘의 주제는 "' + m[2] + '"예요. ') : '')
    + '수업 전에 저랑 같이 가볍게 입을 풀어 봐요. 오늘 기분이 어때요?';
}
