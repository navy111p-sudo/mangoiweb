// ═══════════════════════════════════════════════════════════════════════
// 🔤 ko-readable.ts — AI 가 쓴 한국어가 «사람이 읽을 수 있는 문장» 인가 (2026-11-01)
//
//   [왜 — 운영 화면 실사고(사장님 제보, AI 영작 첨삭)]
//     교정 이유 「신호 입력를 지도신.」·「어 신린 있다 없다」, 어휘 이유 「지도 알는 어 지도 었다 알 지도 었다.」,
//     영어여야 할 답장 칸에 「있다 어 알는 사람 었다…」. 한국어에 약한 보조 모델이 낱말 조각을 늘어놓았는데
//     서버는 «한글이 있고 6자 이상» 만 봐서 그대로 학생 화면에 나갔습니다.
//     같은 모양의 검사가 다른 AI 기능(발음 코칭·판단력·수업 중 질문·중국어 퀴즈·학부모 번역)에도 있어 이 정본으로 모읍니다.
//
//   [두 단계]
//     looksGarbledKo — «분명히 깨졌다» 는 표시만 봅니다(느슨). 반말·번역·여러 문장에도 씁니다.
//       ① 받침과 안 맞는 조사(받침 뒤 «를», 받침 없는 뒤 «을» — 「입력를」)
//       ② 같은 한글 낱말 반복(짧은 글 3회 · 긴 글은 전체의 1/4 이상이면서 4회)
//       ③ 홀로 떨어진 어미·조사 조각(「어」·「었다」·「는」 …) — 단, 영어 낱말 바로 뒤의 조사(「read 를」)는 정상
//     isReadableKo — 짧은 «설명» 칸용(엄격). 위를 통과하고, 6~200자, 존댓말 끝맺음(…요/…니다).
//
//   ⛔ 확신이 없으면 «깨졌다» 고 하지 않습니다(looksGarbledKo 는 거짓 경보가 적은 쪽으로).
//   ⛔ 이 파일은 import 가 없습니다 — 하니스가 그대로 불러 실제로 돌립니다.
// ═══════════════════════════════════════════════════════════════════════

const HANGUL_RE = /[가-힣]/;
/** 홀로 서면 낱말이 될 수 없는 조각(어미·조사). 「이」·「다」·「아」는 낱말이기도 해서 뺍니다(이 표현·다 했어요·아, 그렇군요). */
const FRAGMENTS = new Set(['어', '었', '았', '였', '었다', '았다', '였다', '는다', '었어', '았어', '는', '을', '를', '은', '가']);

/** «을» 로 끝나는 진짜 낱말(받침 없는 글자 + 을) — 조사가 아니므로 «틀린 조사» 로 보지 않습니다. */
const EUL_WORDS = /(가을|마을|노을|고을|모을)$/;

function hasJong(ch: string): boolean {
  const c = ch.charCodeAt(0) - 0xAC00;
  return c >= 0 && c < 11172 && c % 28 !== 0;
}

/** 낱말 열 — 한글·영문·숫자·아포스트로피만 남기고 공백으로 자릅니다. */
function koTokens(s: string): string[] {
  return s.replace(/[^가-힣a-zA-Z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
}

/** 분명히 깨진 한국어인가(느슨 — 거짓 경보가 적은 쪽). 한글이 없으면 false(판정 대상 아님). */
export function looksGarbledKo(raw: unknown): boolean {
  const s = String(raw == null ? '' : raw).trim();
  if (!HANGUL_RE.test(s)) return false;
  const toks = koTokens(s);
  // ① 받침과 안 맞는 조사
  for (const t of toks) {
    const m = t.match(/([가-힣])(를|을)$/);
    if (!m) continue;   // ⚠️ 두 글자 낱말(「책를」)도 봅니다 — 퍼즈가 잡은 빈틈(2026-11-01)
    if (m[2] === '를' && hasJong(m[1])) return true;
    if (m[2] === '을' && !hasJong(m[1]) && !EUL_WORDS.test(t)) return true;
  }
  // ② 같은 한글 낱말 반복
  const cnt: Record<string, number> = {};
  const limit = toks.length <= 15 ? 3 : Math.max(4, Math.ceil(toks.length / 4));
  for (const t of toks) {
    if (!HANGUL_RE.test(t)) continue;
    cnt[t] = (cnt[t] || 0) + 1;
    if (cnt[t] >= limit) return true;
  }
  // ③ 홀로 떨어진 조각 — 영어 낱말 바로 뒤의 조사는 정상(「watch 가 아니라 read 를 써요」)
  for (let i = 0; i < toks.length; i++) {
    if (!FRAGMENTS.has(toks[i])) continue;
    const prev = i > 0 ? toks[i - 1] : '';
    if (/[A-Za-z0-9']$/.test(prev)) continue;
    return true;
  }
  return false;
}

/** 짧은 «설명» 칸(교정 이유·팁·발음 코칭 한 줄)용 — 엄격. */
export function isReadableKo(raw: unknown): boolean {
  const s = String(raw == null ? '' : raw).trim();
  if (s.length < 6 || s.length > 200 || !HANGUL_RE.test(s)) return false;
  if (!/(요|니다)[.!?~\s]*$/.test(s)) return false;
  return !looksGarbledKo(s);
}

/** 영어로 써야 하는 칸(펜팔 답장 등)인가 — 한글이 섞이거나 영문자가 너무 적으면 false. */
export function isEnglishReply(raw: unknown): boolean {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || /[ᄀ-ᇿ㄰-㆏가-힯]/.test(s)) return false;
  const nonSpace = s.replace(/\s+/g, '');
  const letters = (nonSpace.match(/[A-Za-z]/g) || []).length;
  return letters >= 3 && letters / nonSpace.length >= 0.6;
}

/** 느슨 판정용 편의 함수 — 깨졌으면 빈 문자열, 아니면 그대로(앞뒤 공백만 정리). */
export function keepIfReadableKo(raw: unknown): string {
  const s = String(raw == null ? '' : raw).trim();
  return looksGarbledKo(s) ? '' : s;
}
