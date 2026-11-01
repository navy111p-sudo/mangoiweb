// ═══════════════════════════════════════════════════════════════════════
// 🇰🇷 konglish.ts — 한국식 영어(콩글리시) 대조표 (2026-10-18, 개선안 2순위 ⑦)
//
//   한국 학생이 «영어라고 믿고» 쓰지만 원어민은 못 알아듣거나 어색하게 듣는 말.
//   모델은 뜻이 통하면 대개 넘어가서(「handphone」도 알아듣는다) 교정 카드가 안 뜬다.
//   그래서 «손으로 적은 표» 로 결정론으로 잡는다 — 지시만으로는 안 지켜진다(이 저장소의 반복 실측).
//
//   ⛔ 뜻이 둘인 말은 넣지 않는다 — 「meeting」(소개팅/회의) · 「notebook」(공책/노트북) ·
//      「service」(공짜/서비스) · 「cunning」(커닝/교활한) · 「one piece」(원피스/한 조각) ·
//      「fighting」(응원/싸움) 은 맞는 영어로도 흔히 쓰이므로, 잡으면 멀쩡한 문장을 «틀렸다» 고 한다.
//      (fighting 은 «Fighting!» 처럼 «혼자 외치는» 모양일 때만 잡는다.)
//   ⛔ 고친 말을 모델에게 맡기지 않는다 — 아이가 그대로 따라 쓰는 표현이라 표에 적힌 그대로.
//   ⚠️ 표에 없는 콩글리시는 못 잡는다 — 「모른다」 쪽으로 실패한다(지어내지 않음).
// ═══════════════════════════════════════════════════════════════════════
import type { WarmupFix } from './warmup-correction';

/** [찾는 식, 자연스러운 영어, 왜(한국어), 복수형을 붙일 수 있나] */
export const KONGLISH: ReadonlyArray<readonly [RegExp, string, string, boolean]> = [
  [/\bhand ?phones?\b/i, 'cell phone', '«핸드폰» 은 한국식 표현이에요. 영어로는 cell phone 또는 그냥 phone 이라고 해요.', true],
  [/\beye[- ]?shopping\b/i, 'window shopping', '«아이쇼핑» 은 한국식 표현이에요. 사지 않고 구경만 하는 건 window shopping 이에요.', false],
  [/\bskinship\b/i, 'hugs', '«스킨십» 은 영어에 없는 말이에요. hugs(안아 주기) 처럼 구체적으로 말해요.', false],
  [/\bselcas?\b/i, 'selfie', '«셀카» 는 한국식 줄임말이에요. 영어로는 selfie 예요.', true],
  [/\bhotchkiss\b/i, 'stapler', '«호치키스» 는 상표 이름이에요. 영어로는 stapler 예요.', false],
  [/\bofficetels?\b/i, 'studio apartment', '«오피스텔» 은 한국에서 만든 말이에요. 영어로는 studio apartment 예요.', true],
  [/\bone ?rooms?\b/i, 'studio apartment', '«원룸» 은 한국식 표현이에요. 영어로는 studio apartment 예요.', true],
  [/\bgag ?m[ae]n\b/i, 'comedian', '«개그맨» 은 한국식 표현이에요. 영어로는 comedian 이에요.', false],
  [/\bback ?mirrors?\b/i, 'rearview mirror', '«백미러» 는 한국식 표현이에요. 영어로는 rearview mirror 예요.', true],
  [/\brunning ?machines?\b/i, 'treadmill', '«러닝머신» 은 한국식 표현이에요. 영어로는 treadmill 이에요.', true],
  [/\bremocons?\b/i, 'remote control', '«리모컨» 은 한국식 줄임말이에요. 영어로는 remote control(또는 remote) 이에요.', true],
  [/\bmorning ?calls?\b/i, 'wake-up call', '«모닝콜» 은 한국식 표현이에요. 영어로는 wake-up call 이에요.', true],
  [/\bsharp ?pencils?\b/i, 'mechanical pencil', '«샤프» 는 한국식 표현이에요. 영어로는 mechanical pencil 이에요.', true],
  [/\bopen ?cars?\b/i, 'convertible', '«오픈카» 는 한국식 표현이에요. 영어로는 convertible 이에요.', true],
  [/\bconcents?\b/i, 'outlet', '«콘센트» 는 영어가 아니에요. 벽의 전기 꽂는 곳은 outlet 이에요.', true],
  [/\bvinyl ?bags?\b/i, 'plastic bag', '«비닐봉지» 는 영어로 plastic bag 이에요.', true],
  [/\bnote ?book computers?\b/i, 'laptop', '«노트북 컴퓨터» 는 영어로 laptop 이라고 해요.', true],
  [/\bauto ?bikes?\b/i, 'motorcycle', '«오토바이» 는 한국식 표현이에요. 영어로는 motorcycle 이에요.', true],
  [/\bA\/S\b/i, 'repair service', '«A/S» 는 한국식 표현이에요. 고쳐 주는 건 repair service 라고 해요.', false],
  [/\bSNS\b/i, 'social media', '«SNS» 는 한국식 표현이에요. 영어로는 social media 라고 해요.', false],
  /* 응원 «화이팅» — 혼자 외치는 모양일 때만(«I was fighting with my brother» 는 맞는 영어). */
  [/(?:^|[.!?]\s*)(?:fighting|hwaiting|paiting)\s*!+|^\s*(?:fighting|hwaiting|paiting)\s*[.!]*\s*$/i, 'You can do it!',
    '«화이팅!» 은 한국식 응원이에요. 영어로는 You can do it! 또는 Good luck! 이라고 해요.', false],
];

export interface KonglishHit { was: string; now: string; whyKo: string }

/** 학생 문장에서 표에 있는 콩글리시를 «처음 하나» 찾는다. 없으면 null. 던지지 않는다. */
export function findKonglish(text: unknown): KonglishHit | null {
  const s = typeof text === 'string' ? text : '';
  if (!s.trim()) return null;
  for (const [re, right, why, plural] of KONGLISH) {
    const m = s.match(re);
    if (!m) continue;
    const was = m[0].replace(/^[.!?\s]+/, '').trim();
    if (!was) continue;
    // 복수형으로 썼으면 고친 말에도 s 를 붙인다(handphones → cell phones)
    const now = plural && /s$/i.test(was) ? right + 's' : right;
    return { was, now, whyKo: why };
  }
  return null;
}

/** 교정 카드 한 장 — 표에서 나왔으므로 «검증된 교정» 과 같은 모양으로 돌려준다.
 *  ⚠️ severity 는 major — 매번 고쳐 줄 가치가 있고(같은 말을 또 써야만 다시 뜬다),
 *     «작은 실수는 두 번째부터» 에 걸리면 첫 사용이 그대로 지나간다. */
export function konglishFix(text: unknown): WarmupFix | null {
  const h = findKonglish(text);
  if (!h) return null;
  return { was: h.was, now: h.now, why_ko: h.whyKo, tag: 'word_choice', severity: 'major' };
}

/** 시스템 프롬프트 한 줄 — 답장에서 «자연스러운 말» 을 한 번 써 보이게 한다(강의하지 않게). */
export function konglishPromptLine(text: unknown): string {
  const h = findKonglish(text);
  if (!h) return '';
  return `\nThe student just used the Korean-style English expression "${h.was}". Natural English says "${h.now}". In your reply, naturally use "${h.now}" once — do not lecture about it.`;
}
