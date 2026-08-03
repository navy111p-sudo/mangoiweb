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

/** 밴드별 사양 — 교재 Lv 구간 + LLM 에게 줄 문장 제약. */
export interface BandSpec {
  band: number;
  /** 망고아이 교재 레벨(Lv 1~34) 구간 — 실제 커리큘럼 레벨(2026-08-03 확인). */
  lvFrom: number;
  lvTo: number;
  /** 문장 1개의 목표 단어 수 상한(상황문·선택지 공통). */
  maxWords: number;
  /** 허용 문법 범위 — 프롬프트에 그대로 들어갑니다(영문). */
  grammar: string;
}

export const BAND_SPECS: BandSpec[] = [
  { band: 1, lvFrom: 1,  lvTo: 4,  maxWords: 5,  grammar: 'present tense only; only the most common everyday words (school, mom, play, want, help)' },
  { band: 2, lvFrom: 5,  lvTo: 8,  maxWords: 7,  grammar: 'present tense plus "can"; common everyday words a beginner knows' },
  { band: 3, lvFrom: 9,  lvTo: 12, maxWords: 9,  grammar: 'present and simple past; everyday vocabulary' },
  { band: 4, lvFrom: 13, lvTo: 17, maxWords: 12, grammar: 'present, past and future; at most one conjunction (and / but / because)' },
  { band: 5, lvFrom: 18, lvTo: 21, maxWords: 15, grammar: 'complex sentences allowed; common phrasal verbs' },
  { band: 6, lvFrom: 22, lvTo: 25, maxWords: 18, grammar: 'relative clauses and conditionals allowed' },
  { band: 7, lvFrom: 26, lvTo: 30, maxWords: 22, grammar: 'common idioms and varied register allowed' },
  { band: 8, lvFrom: 31, lvTo: 34, maxWords: 30, grammar: 'no restriction; focus on subtle nuance and tone' },
];

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
export function bandPromptLine(band: any): string {
  const s = bandSpec(band);
  return `READING LEVEL (strict): the child reads at Mangoi textbook level ${bandLabel(s.band)}. `
    + `Every sentence — both the situation and EVERY option — must be at most ${s.maxWords} words. `
    + `Grammar allowed: ${s.grammar}. `
    + `Keep the JUDGMENT itself just as challenging: the difficulty must come from how subtle the choice is, `
    + `NOT from long sentences or hard words. Never make the best option obvious just because the words are simple.`;
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
