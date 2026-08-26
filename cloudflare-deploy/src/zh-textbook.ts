/**
 * zh-textbook.ts — 🈶 중국어 교재 이름 해석 (판정 정본)
 *
 * ⚠️ 같은 교재를 세 곳이 **서로 다른 이름**으로 부르고 있었다(2026-08-26 D1 실측).
 *      · 교재 라이브러리 `textbook_files` : 「다락원 중국어 마스터 3」583쪽 · 「… 练习册」72쪽
 *      · 퀴즈·본문·어휘 `review_quizzes`/`zh_passage`/`zh_vocab` : 「다락원」
 *    서버 매칭은 `LOWER(textbook)=LOWER(?)` **정확일치**라 두 이름은 영영 안 맞는다.
 *    그래서 중국어 수업이 끝나도 중국어 퀴즈가 **한 번도 안 잡혔다** — 사장님 제보
 *    「중국어 수업 끝났는데 복습퀴즈가 왜 영어가 나와?」의 세 원인 중 하나.
 *
 * [왜 코드로 푸나] D1 의 `textbook` 값을 실제 이름으로 UPDATE 하는 길도 있었지만
 *    개발·운영이 같은 DB 라(CLAUDE.md 1-1) 되돌리기가 어렵고, 교재가 늘 때마다 같은
 *    사고가 되풀이된다. 2026-08-26 사장님 결정으로 **코드에서 해석**한다.
 *
 * ⛔ 교재 «이름» 만 보고 중국어라고 짐작하지 않는다 — 판정의 근거는 «`zh_passage`·`zh_vocab`
 *    에 그 교재가 실제로 있는가» 이고(중국어 게임이 이미 그 두 표를 정본으로 쓴다),
 *    이 파일은 그 표기와 라이브러리 표기를 **잇는 다리**일 뿐이다. 후보 목록을 DB 에서
 *    받아 오는 것이 그래서다 — 여기에 이름을 하드코딩하지 말 것.
 */

/** 화면에 보여줄 이름 — 콘텐츠 표기(`다락원`)를 그대로 쓰지 않는다.
 *  2026-08-26 사장님 지시: 「이름은 다락원 말고 그냥 중국어 마스터로 해줘」. */
const ZH_DISPLAY: Record<string, string> = {
  '다락원': '중국어 마스터',
};

/** 공백·대소문자만 무시하고 비교하기 위한 정규화. 글자는 지우지 않는다. */
function norm(s: any): string {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 라이브러리 교재 이름 → 콘텐츠 표기.
 *   `resolveZhTextbook('다락원 중국어 마스터 3', ['다락원']) === '다락원'`
 *
 * @param raw   수업 화면이 읽어 온 교재 이름(`__mangoiCurrentBookId`) — 없으면 null
 * @param known `zh_passage`·`zh_vocab` 에 실제로 있는 교재 표기 목록
 * @returns 이어졌으면 콘텐츠 표기, 못 이으면 **null**(= 중국어 교재가 아님)
 *
 * ⚠️ 못 이으면 «모름» 이 아니라 «중국어 아님» 으로 실패한다 — 영어 수업을 중국어로
 *    오인해 엉뚱한 퀴즈를 주는 쪽이, 안 잡히는 쪽보다 나쁘다.
 */
export function resolveZhTextbook(raw: string | null | undefined, known: string[]): string | null {
  const r = norm(raw);
  if (!r || !known || !known.length) return null;
  // ① 정확일치 먼저 — 이미 콘텐츠 표기로 부르고 있는 경우(중국어 게임·CN 페이지)
  for (const k of known) { if (norm(k) && norm(k) === r) return k; }
  // ② 라이브러리 이름이 콘텐츠 표기를 «품고» 있는 경우(「다락원 중국어 마스터 3」 ⊃ 「다락원」).
  //    긴 표기부터 본다 — 「다락원」과 「다락원 회화」가 함께 등록되면 더 구체적인 쪽이 맞다.
  const sorted = known.slice().filter(k => norm(k).length >= 2).sort((a, b) => norm(b).length - norm(a).length);
  for (const k of sorted) { if (r.includes(norm(k))) return k; }
  return null;
}

/** 콘텐츠 표기 → 화면에 보여줄 이름. 등록이 없으면 원래 이름 그대로. */
export function zhDisplayTextbook(textbook: string | null | undefined): string {
  const t = String(textbook == null ? '' : textbook).trim();
  return ZH_DISPLAY[t] || t;
}

/**
 * 중국어 퀴즈의 설명글에 박혀 있는 콘텐츠 표기를 «보여줄 이름» 으로 바꾼다.
 *   「다락원 Lv 3 제1과 본문 기반 …」 → 「중국어 마스터 Lv 3 제1과 본문 기반 …」
 *
 * ⚠️ 이 글은 만들 때 D1 에 «문자열로 박혀» 저장된다(review_quizzes.description). 이미 들어간
 *    행 16건을 UPDATE 하지 않기로 했으므로(CLAUDE.md 1-1 · 사장님 결정) **읽을 때** 바꾼다.
 * ⚠️ 중국어 행(lang='zh')에만 손댄다 — 영어 교재 이름에 우연히 같은 글자가 들어가도 안 건드린다.
 */
export function zhDisplayDesc(desc: string | null | undefined, lang: string | null | undefined): string {
  const d = String(desc == null ? '' : desc);
  if (!d || String(lang || '') !== 'zh') return d;
  let out = d;
  for (const k of Object.keys(ZH_DISPLAY)) { out = out.split(k).join(ZH_DISPLAY[k]); }
  return out;
}
