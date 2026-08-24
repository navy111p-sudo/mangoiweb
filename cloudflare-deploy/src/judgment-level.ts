// ═══════════════════════════════════════════════════════════════════════
// 🎚️ 판단력 훈련 — 읽기 밴드(reading band) 순수 계산 모듈 (2026-08-03)
//   설계서: docs/판단력훈련_레벨시스템_제안서.md
//
//   ⚠️ 이 파일은 '읽기 난이도'만 다룹니다. '판단 난이도'(difficulty 1~5)는
//      judgment-scoring.ts 가 그대로 담당하며 이 파일과 서로 독립입니다.
//      Newsela 방식 — 배울 내용(판단)은 그대로 두고 문장의 읽기 부담만 조절합니다.
//      읽기가 어려워서 틀린 것은 판단력 측정이 아니라 노이즈이기 때문입니다.
//
//   이 파일은 import 가 하나도 없어 하니스가 그대로 불러 검증합니다.
//     → test-harness/judgment_level_harness.mjs
//
//   ⚠️ 상수를 바꾸면 학생이 받는 문제의 난이도가 즉시 달라집니다.
// ═══════════════════════════════════════════════════════════════════════

/** 읽기 밴드 개수 — 망고아이 교재 Lv 1~34 를 8개로 묶은 것(사장님 "최소 8단계" 요건). */
export const BAND_COUNT = 8;

/**
 * 신규 학생 시작 밴드 — 중앙값(4)보다 하나 낮게 잡습니다.
 * 어려워서 못 푸는 이탈이 쉬워서 지루한 것보다 훨씬 치명적이기 때문입니다.
 */
export const DEFAULT_BAND = 3;

/** 자동 조절을 판단하는 최근 문항 창. */
export const BAND_WINDOW = 6;

/**
 * 난이도를 누가 정하는가 — 학생이 고르는 두 가지 모드.
 *   'auto'   : AI 가 답을 보고 알아서 올리고 내림(기본·추천)
 *   'manual' : 학생이 고른 범주에 그대로 머묾 — AI 가 건드리지 않음
 *
 * ⚠️ 모드가 없으면 "직접 골랐는데 AI 가 다시 옮겨 버리는" 모순이 생깁니다.
 *    고른 값이 유지되지 않으면 고르는 기능 자체가 의미를 잃습니다.
 */
export type BandMode = 'auto' | 'manual';
export const DEFAULT_BAND_MODE: BandMode = 'auto';

export function normalizeBandMode(raw: any): BandMode {
  return String(raw || '').trim().toLowerCase() === 'manual' ? 'manual' : 'auto';
}

/** 이 모드에서 자동 조절을 돌려도 되는가. */
export function shouldAutoAdjust(mode: any): boolean {
  return normalizeBandMode(mode) === 'auto';
}

/**
 * 🎯 자동 조절 임계값 — Wilson et al., "The Eighty Five Percent Rule for optimal learning"
 *   (Nature Communications, 2019): 학습이 가장 빠른 지점은 정답률 약 85%(오답률 15.87%).
 *
 *   6문항 창에서 가능한 정답률은 0 / 16.7 / 33.3 / 50 / 66.7 / 83.3 / 100% 입니다.
 *   목표 85% 에 가장 가까운 값이 5/6 = 83.3% 이므로 **5/6 은 올리지 않고 유지**합니다.
 *   (제안서 초안은 '5개 이상 → +1' 이었으나, 그러면 목표점에 앉아 있질 못하고
 *    항상 목표 위로 밀어 올려 버립니다. 목표에 머무는 것이 규칙의 취지입니다.)
 *
 *     6/6 (100%)  → 확실히 쉬움      → +1
 *     5/6 (83.3%) → 목표 적중        → 유지 ✅
 *     4/6 (66.7%) → 약간 어려움      → 유지
 *    ≤3/6 (≤50%)  → 확실히 어려움    → −1
 */
export const BAND_UP_CORRECT = 6;    // 이 개수 '이상' 맞히면 한 밴드 올림
export const BAND_DOWN_CORRECT = 3;  // 이 개수 '이하' 맞히면 한 밴드 내림

/**
 * 밴드별 사양 — 교재 Lv 구간 + 이름 + LLM 에게 줄 문장 제약.
 *
 * 🏷️ 이름을 붙인 이유 — 학생·학부모·강사가 "밴드 4"로는 아무것도 판단할 수 없습니다.
 *    "초중급"이면 고를 수 있습니다. 숫자는 내부 계산에만 쓰고 화면에는 이름을 보여줍니다.
 *    (강사 다수가 필리핀이라 한/영은 필수 — CLAUDE.md 운영 원칙. 중문은 화면 지원 언어라 함께 둡니다)
 */
export interface BandSpec {
  band: number;
  /** 망고아이 교재 레벨(Lv 1~34) 구간 — 실제 커리큘럼 레벨(2026-08-03 확인). */
  lvFrom: number;
  lvTo: number;
  /**
   * 상황문 단어 수 범위.
   *   ⚠️ 상한만 걸면 위쪽 범주가 무력해집니다 — 실측(2026-08-03 라이브): 중고급(상한 18)으로
   *      지정했는데 7단어짜리가 나왔습니다. "최대 N단어"는 짧은 문장을 전혀 막지 못하기 때문입니다.
   *      그래서 하한(minWords)을 함께 줍니다.
   */
  minWords: number;
  maxWords: number;
  /** 허용 문법 범위 — 프롬프트에 그대로 들어갑니다(영문). */
  grammar: string;
  /** 범주 이름 — 화면에 보이는 것은 숫자가 아니라 이것입니다. */
  nameKo: string; nameEn: string; nameZh: string;
  /** 한 줄 설명 — 고를 때 판단 근거가 됩니다("어느 정도 문장인지"). */
  descKo: string; descEn: string; descZh: string;
}

export const BAND_SPECS: BandSpec[] = [
  { band: 1, lvFrom: 1,  lvTo: 4,  minWords: 3, maxWords: 5,  grammar: 'present tense only; only the most common everyday words (school, mom, play, want, help)',
    nameKo: '첫걸음',   nameEn: 'Starter',            nameZh: '入门',
    descKo: '아주 짧은 문장 (3~5단어)',        descEn: 'Very short sentences (3–5 words)',   descZh: '很短的句子（3~5个词）' },
  { band: 2, lvFrom: 5,  lvTo: 8,  minWords: 4, maxWords: 7,  grammar: 'present tense plus "can"; common everyday words a beginner knows',
    nameKo: '기초',     nameEn: 'Basic',              nameZh: '基础',
    descKo: '짧은 문장 (5~7단어)',             descEn: 'Short sentences (5–7 words)',        descZh: '短句（5~7个词）' },
  { band: 3, lvFrom: 9,  lvTo: 12, minWords: 6, maxWords: 9,  grammar: 'present and simple past; everyday vocabulary',
    nameKo: '초급',     nameEn: 'Elementary',         nameZh: '初级',
    descKo: '과거형이 나오는 문장 (7~9단어)',   descEn: 'Past tense appears (7–9 words)',     descZh: '出现过去式（7~9个词）' },
  { band: 4, lvFrom: 13, lvTo: 17, minWords: 8, maxWords: 12, grammar: 'present, past and future; at most one conjunction (and / but / because)',
    nameKo: '초중급',   nameEn: 'Pre-Intermediate',   nameZh: '初中级',
    descKo: '두 문장이 이어진 문장 (9~12단어)', descEn: 'Two ideas joined (9–12 words)',      descZh: '两句连接（9~12个词）' },
  { band: 5, lvFrom: 18, lvTo: 21, minWords: 10, maxWords: 15, grammar: 'complex sentences allowed; common phrasal verbs',
    nameKo: '중급',     nameEn: 'Intermediate',       nameZh: '中级',
    descKo: '조금 긴 문장 (12~15단어)',        descEn: 'Longer sentences (12–15 words)',     descZh: '较长的句子（12~15个词）' },
  { band: 6, lvFrom: 22, lvTo: 25, minWords: 13, maxWords: 18, grammar: 'relative clauses and conditionals allowed',
    nameKo: '중고급',   nameEn: 'Upper-Intermediate', nameZh: '中高级',
    descKo: '관계절·가정법이 나와요 (15~18단어)', descEn: 'Relative clauses appear (15–18 words)', descZh: '出现关系从句（15~18个词）' },
  { band: 7, lvFrom: 26, lvTo: 30, minWords: 16, maxWords: 22, grammar: 'common idioms and varied register allowed',
    nameKo: '고급',     nameEn: 'Advanced',           nameZh: '高级',
    descKo: '관용표현이 섞여요 (18~22단어)',   descEn: 'Idioms mixed in (18–22 words)',      descZh: '夹杂习惯用语（18~22个词）' },
  { band: 8, lvFrom: 31, lvTo: 34, minWords: 18, maxWords: 30, grammar: 'no restriction; focus on subtle nuance and tone',
    nameKo: '최상급',   nameEn: 'Fluent',             nameZh: '最高级',
    descKo: '가장 긴 문장 · 뉘앙스 중심 (18~30단어)', descEn: 'Longest sentences — nuance focused (18–30 words)', descZh: '最长的句子 · 重在语感（18~30个词）' },
];

/** 화면(레벨 고르기)에 내려보낼 목록 — 서버가 단일 출처가 되도록 여기서 만듭니다. */
export function bandCatalog(): Array<{ band: number; lv: string; ko: string; en: string; zh: string; dko: string; den: string; dzh: string }> {
  return BAND_SPECS.map((s) => ({
    // Lv 표기는 bandLabel() 하나만 씁니다 — 화면마다 'Lv 9-12'/'Lv 9–12' 로 갈리지 않게.
    band: s.band, lv: bandLabel(s.band),
    ko: s.nameKo, en: s.nameEn, zh: s.nameZh,
    dko: s.descKo, den: s.descEn, dzh: s.descZh,
  }));
}

/** 밴드 → 범주 이름(언어별). 강사·관리자 화면과 학생 화면이 같은 이름을 쓰게 합니다. */
export function bandName(band: any, lang = 'ko'): string {
  const s = bandSpec(band);
  return lang === 'en' ? s.nameEn : lang === 'zh' ? s.nameZh : s.nameKo;
}

/**
 * 밴드 → "첫걸음 (Lv 1-4)" 처럼 이름과 교재 Lv 을 붙여 놓은 표기.
 *   숫자만 보면 학생·학부모가 판단할 수 없고, 이름만 보면 강사가 교재와 못 맞춥니다.
 *   두 화면이 서로 다른 말을 쓰지 않도록 이 함수 하나로 통일합니다.
 */
export function bandLvName(band: any, lang = 'ko'): string {
  return `${bandName(band, lang)} (${bandLabel(band)})`;
}

/**
 * 밴드 1~8 정규화. 값이 없거나 이상하면 DEFAULT_BAND.
 *   ⚠️ `null`/`''` 을 먼저 걸러야 합니다 — `+null === 0` 이라 그냥 clamp 하면
 *      '값 없음'이 최하단 밴드 1로 떨어집니다(저장값이 비었을 때 학생이 갑자기 가장 쉬운 문장을 받음).
 */
export function normalizeBand(raw: any): number {
  if (raw == null || raw === '' || typeof raw === 'boolean') return DEFAULT_BAND;
  const b = Math.round(+raw);
  if (!Number.isFinite(b)) return DEFAULT_BAND;
  return Math.max(1, Math.min(BAND_COUNT, b));
}

/** 밴드 사양 조회(정규화 포함). */
export function bandSpec(band: any): BandSpec {
  return BAND_SPECS[normalizeBand(band) - 1];
}

/**
 * 교재 레벨 문자열 → 읽기 밴드.
 *   `textbook_files.level` 의 실제 표기는 "Lv 12" 형식이지만
 *   "Lv12" / "12" / "L12" / "레벨 12" 도 받아 줍니다.
 *   숫자를 못 찾으면 null (호출측이 다른 소스로 폴백).
 */
export function bandFromTextbookLevel(raw: any): number | null {
  if (raw == null) return null;
  const m = String(raw).match(/(\d+)/);
  if (!m) return null;
  const lv = parseInt(m[1], 10);
  if (!Number.isFinite(lv) || lv < 1) return null;
  for (const s of BAND_SPECS) if (lv >= s.lvFrom && lv <= s.lvTo) return s.band;
  // 34 를 넘는 값은 최상단 밴드로(커리큘럼 확장 대비)
  return lv > BAND_SPECS[BAND_SPECS.length - 1].lvTo ? BAND_COUNT : null;
}

/** 밴드 → 교재 Lv 구간 표기("Lv 9–12") — 강사·관리자 화면용. */
export function bandLabel(band: any): string {
  const s = bandSpec(band);
  return `Lv ${s.lvFrom}–${s.lvTo}`;
}

/**
 * LLM 프롬프트에 넣을 읽기 제약문.
 *   ⚠️ 마지막 문장이 이 설계의 핵심입니다 — 읽기를 쉽게 만들되
 *      판단 자체는 쉬워지면 안 된다는 것을 명시적으로 못 박습니다.
 *      (이 문장이 빠지면 LLM 이 낮은 밴드에서 선택지를 뻔하게 만들어
 *       판단력 훈련이 아니라 단순 어휘 문제가 되어 버립니다.)
 */
/**
 * 밴드에 맞는 문장 개수 힌트.
 *   LLM 은 '단어 수'보다 '문장 개수'를 훨씬 잘 지킵니다. 라이브 실측에서 단어 수만 주면
 *   목표 구간의 아래쪽으로 계속 치우쳤습니다(고급 16~22 지시에 14~15).
 */
export function sentenceHint(band: any): string {
  const s = bandSpec(band);
  const n = Math.max(1, Math.round(s.maxWords / 9));
  return n <= 1 ? 'ONE sentence' : `${n} short sentences`;
}

export function bandPromptLine(band: any): string {
  const s = bandSpec(band);
  return `READING LEVEL (strict): the child reads at Mangoi textbook level ${bandLabel(s.band)}. `
    // ⚠️ 하한이 반드시 있어야 합니다. 상한만 주면 LLM 이 어느 밴드에서든 짧게 써 버려
    //    위쪽 범주가 아무 효과를 못 냅니다(라이브 실측: 상한 18 인데 7단어가 나왔음).
    + `The SITUATION text must be ${s.minWords}-${s.maxWords} words long — not shorter, not longer. `
    // 문장 개수 + 자가 점검 지시 — 단어 수만으로는 계속 짧게 씁니다(라이브 실측).
    + `Write it as ${sentenceHint(s.band)}. Count the words of your situation before you answer: `
    + `if it is under ${s.minWords} words, add concrete detail (who, where, what just happened) until it fits. `
    // 선택지에는 하한을 주지 않습니다 — 아이가 실제로 할 법한 말이라 억지로 늘리면 부자연스러워집니다.
    + `Each OPTION must be at most ${s.maxWords} words and must stay something a child would really say. `
    // ⚠️ 단어 수를 맞추려고 문법을 깨면 안 됩니다 — 실사고(2026-08-24): 첫걸음(선택지 5단어 이하)에서
    //    "Want to play with me?"(6단어)가 안 들어가자 to 를 떨어뜨린 "Want play with me" 가 나갔습니다.
    + `Even at this level, every sentence must stay complete, natural, grammatically correct English — `
    + `never drop words like "to" or "do" to fit the word limit; pick a different shorter natural expression instead. `
    + `Grammar allowed: ${s.grammar}. `
    + `Keep the JUDGMENT itself just as challenging: the difficulty must come from how subtle the choice is, `
    + `NOT from long sentences or hard words. Never make the best option obvious just because the words are simple.`;
}

// ── 📏 생성 결과 검사 — 지시만으로는 안 지켜집니다 ─────────────────────────
//   라이브 실측(2026-08-03): 고급(16~22단어)으로 지정했는데 14단어가 왔습니다.
//   프롬프트에 하한을 적어도 LLM 은 단어 수를 자주 어기므로, 받은 결과를 세어 보고
//   어긋나면 다시 뽑습니다. 다만 완벽을 요구하면 문제를 아예 못 주게 되므로 여유를 둡니다.
//   ⚠️ 여유를 너무 넓게 두면 LLM 이 그 바닥에 눌러앉습니다 — 0.75 로 뒀더니 실측이
//      전부 하한의 75~80% 에 몰렸습니다(초중급 8~12 인데 6). 0.9 로 좁혀 목표 안으로 밀어 넣습니다.
export const BAND_LEN_UNDER = 0.9;    // 하한의 90% 까지는 허용
export const BAND_LEN_OVER = 1.3;     // 상한의 130% 까지는 허용

/** 영어 문장의 단어 수 — 구두점만 있는 토큰은 세지 않습니다. */
export function countWords(s: any): number {
  return String(s || '').trim().split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w)).length;
}

/** 상황문이 그 범주의 길이에 맞는가(여유 포함). */
export function situationFitsBand(text: any, band: any): boolean {
  const s = bandSpec(band);
  const n = countWords(text);
  if (!n) return false;
  return n >= Math.round(s.minWords * BAND_LEN_UNDER) && n <= Math.round(s.maxWords * BAND_LEN_OVER);
}

// ── 🎯 레벨 찾기(배치테스트) ────────────────────────────────────────────────
//   Duolingo 식 적응형 계단. 가운데서 시작해 맞으면 올리고 틀리면 내리되 보폭을 줄여 수렴합니다.
//   적응형 검사 연구상 12문항이면 95% 정확도, 5~10문항이 실용 하한 — 아이가 지치지 않는 6문항으로 잡습니다.
//   ⚠️ 채점은 화면에서 정답 인덱스로 바로 합니다(LLM 재호출 0). 그래서 3분이면 끝납니다.
//   ⚠️ 배치 문항은 판단력 지수에 넣지 않습니다 — 일부러 너무 어려운 문제를 섞기 때문입니다.
export const PLACEMENT_ITEMS = 6;
export const PLACEMENT_START = 4;        // 중앙(4)에서 시작 — 위아래 모두 6문항 안에 닿습니다
export const PLACEMENT_FIRST_STEP = 2;   // 첫 보폭만 2, 이후 1로 좁혀 수렴

/** 다음에 물어볼 밴드 — 맞으면 올리고 틀리면 내리되 보폭을 한 칸씩 줄입니다. */
export function placementNext(current: any, correct: boolean, step: any): { band: number; step: number } {
  const b = normalizeBand(current);
  const s = Math.max(1, Math.round(+step) || 1);
  const next = Math.max(1, Math.min(BAND_COUNT, b + (correct ? s : -s)));
  return { band: next, step: Math.max(1, s - 1) };
}

/**
 * 정오 배열 → 최종 밴드. 계단을 끝까지 따라간 자리가 그대로 답입니다.
 *   (한 문제 실수로 1칸 어긋나도 이후 자동 조절이 바로잡습니다 — 배치는 '출발점'만 정하면 됩니다)
 */
export function runPlacement(results: Array<boolean | number>): { band: number; asked: number[] } {
  let band = PLACEMENT_START, step = PLACEMENT_FIRST_STEP;
  const asked: number[] = [];
  for (const r of (Array.isArray(results) ? results : [])) {
    asked.push(band);
    const nx = placementNext(band, !!r, step);
    band = nx.band; step = nx.step;
  }
  return { band, asked };
}

/** 최근 결과 창에 한 건 추가(오래된 것부터 밀어냄). 1=정답, 0=오답. */
export function pushResult(hist: any, isCorrect: any): number[] {
  const arr = Array.isArray(hist) ? hist.map((v: any) => (v ? 1 : 0)) : [];
  arr.push(isCorrect ? 1 : 0);
  return arr.slice(-BAND_WINDOW);
}

export interface BandTransition {
  /** 조절 후 밴드(변화 없으면 현재 밴드 그대로). */
  band: number;
  /** -1 내림 / 0 유지 / +1 올림 */
  direction: -1 | 0 | 1;
  /** 판단 근거 — 로깅·디버깅용 */
  reason: 'window_not_full' | 'too_easy' | 'too_hard' | 'on_target' | 'at_ceiling' | 'at_floor';
  /** 창을 비워야 하는가(밴드가 실제로 바뀐 경우) — 연속 등락 방지 */
  reset: boolean;
}

/**
 * 자동 조절 — 최근 창의 정답 수로 한 밴드씩만 움직입니다.
 *   창이 다 차기 전에는 절대 움직이지 않습니다(표본 부족으로 흔들리는 것 방지).
 */
export function nextBand(current: any, hist: any): BandTransition {
  const band = normalizeBand(current);
  const arr = Array.isArray(hist) ? hist.map((v: any) => (v ? 1 : 0)) : [];
  if (arr.length < BAND_WINDOW) return { band, direction: 0, reason: 'window_not_full', reset: false };

  const correct = arr.slice(-BAND_WINDOW).reduce((a: number, b: number) => a + b, 0);
  if (correct >= BAND_UP_CORRECT) {
    if (band >= BAND_COUNT) return { band, direction: 0, reason: 'at_ceiling', reset: true };
    return { band: band + 1, direction: 1, reason: 'too_easy', reset: true };
  }
  if (correct <= BAND_DOWN_CORRECT) {
    if (band <= 1) return { band, direction: 0, reason: 'at_floor', reset: true };
    return { band: band - 1, direction: -1, reason: 'too_hard', reset: true };
  }
  return { band, direction: 0, reason: 'on_target', reset: false };
}

/**
 * 학생이 직접 누른 "너무 어려워요 / 너무 쉬워요" — 창을 기다리지 않고 즉시 한 밴드.
 *   delta: -1(너무 어려움) / +1(너무 쉬움)
 */
export function nudgeBand(current: any, delta: any): BandTransition {
  const band = normalizeBand(current);
  const d = Math.sign(Math.round(+delta) || 0);
  if (d === 0) return { band, direction: 0, reason: 'on_target', reset: false };
  const next = Math.max(1, Math.min(BAND_COUNT, band + d));
  if (next === band) {
    return { band, direction: 0, reason: d > 0 ? 'at_ceiling' : 'at_floor', reset: true };
  }
  return { band: next, direction: d > 0 ? 1 : -1, reason: d > 0 ? 'too_easy' : 'too_hard', reset: true };
}
