// ═══════════════════════════════════════════════════════════════════════
// 🧑‍🎓 수업 전 AI 웜업 — «누구와 이야기하는가»(연령대) 단일 출처 (2026-08-26)
//
//   발단: 웜업은 «대화 레벨 1~8»(영어 실력)만 있었고 «몇 살과 이야기하는가»가 없었습니다.
//         그래서 성인 수강생에게도 학교·친구·선생님 이야기가 나가고, 초등 저학년에게는
//         진로·시험 이야기가 나갔습니다. 판단력 훈련은 2026-08-24 에 같은 구멍을
//         age_group(child/adult)으로 메웠습니다(judgment-level.ts) — 웜업도 같은 축을 둡니다.
//
//   ⚠️ 이 축은 «실력»이 아니라 «소재·말투» 만 바꿉니다. 문장 길이·문법 범위는
//      난이도(WARMUP_LEVELS 1~8, src/index.ts)가 그대로 담당합니다.
//      성인 초보자는 «adult + 레벨 1» 처럼 두 축을 각각 고릅니다 — 한 축으로 묶으면
//      「성인인데 유아 문장」 이나 「초등인데 직장 이야기」 중 하나가 반드시 생깁니다.
//
//   ⚠️ 화면(public/warmup.html)의 선택지 id 와 여기 WARMUP_AGE_IDS 는 «짝» 입니다.
//      화면에만 늘리면 서버가 모르는 값이라 조용히 기본값(child)으로 떨어집니다
//      (CLAUDE.md 2장 「화면에서 골랐는데 그 값만 저장이 안 됨」과 같은 뿌리).
//      둘이 어긋나면 test-harness/warmup_age_level_harness.mjs 가 FAIL 냅니다.
//
//   이 파일은 import 가 하나도 없어 하니스가 그대로 불러 검증합니다.
// ═══════════════════════════════════════════════════════════════════════

export type WarmupAge = 'kid' | 'child' | 'teen' | 'adult';

/** 기본값 — 지금까지의 웜업이 사실상 이 톤이었습니다(초등 고학년~중학생). */
export const DEFAULT_WARMUP_AGE: WarmupAge = 'child';

/** 화면에 나오는 순서 그대로. 화면(warmup.html)의 data-age 값과 같아야 합니다. */
export const WARMUP_AGE_IDS: WarmupAge[] = ['kid', 'child', 'teen', 'adult'];

/** 사람이 읽는 이름 — 로그·관리자 화면에서 id 를 그대로 보여주지 않기 위해. */
export const WARMUP_AGE_NAMES: Record<WarmupAge, string> = {
  kid: '유아·초등 저학년',
  child: '초등 고학년·중학생',
  teen: '고등학생',
  adult: '성인',
};

/** LLM 프롬프트에 들어갈 연령대별 지시 — «소재와 말투»만 규정합니다. */
const WARMUP_AGE_LINES: Record<WarmupAge, string> = {
  kid: '지금 이야기하는 상대는 «유아·초등 저학년(6~9세)» 이야. 놀이·동물·가족·음식·색깔처럼 아주 익숙한 소재만 쓰고, 밝고 짧게 말해줘. 시험·진로·직장 이야기는 꺼내지 마.',
  child: '지금 이야기하는 상대는 «초등 고학년~중학생(10~15세)» 이야. 학교·친구·취미·게임·좋아하는 것처럼 또래가 편하게 말할 수 있는 일상 소재로 이야기해줘. 아기 다루듯 하는 말투는 쓰지 마.',
  teen: '지금 이야기하는 상대는 «고등학생(16~19세)» 이야. 친구·관심사·진로·시험·요즘 유행처럼 또래가 실제로 나누는 소재로 이야기해줘. 유치한 소재(동물 흉내·색깔 맞히기)는 피해.',
  adult: '지금 이야기하는 상대는 «성인» 이야. 직장·주말·여행·취미·요즘 관심사처럼 어른의 일상 소재로 이야기하고, 어른에게 말하듯 편하고 정중한 말투를 써. 학교 숙제·선생님·급식 같은 아동용 소재는 꺼내지 말고, 칭찬도 과장하지 말고 담백하게 해줘.',
};

/**
 * 값이 없거나 모르는 값이면 기본값(child).
 * ⚠️ 모르는 값을 «가장 어린 쪽»으로 떨어뜨리지 않습니다 — 성인 수강생이 유아 취급을
 *    받는 쪽이, 초등학생이 또래 대화를 받는 쪽보다 훨씬 나쁩니다.
 */
export function normalizeWarmupAge(raw: any): WarmupAge {
  const v = String(raw == null ? '' : raw).trim().toLowerCase();
  return (WARMUP_AGE_IDS as string[]).includes(v) ? (v as WarmupAge) : DEFAULT_WARMUP_AGE;
}

/** 시스템 프롬프트에 그대로 이어 붙이는 한 줄. */
export function warmupAgeLine(raw: any): string {
  return '[연령대] ' + WARMUP_AGE_LINES[normalizeWarmupAge(raw)];
}

/** 사람이 읽는 이름(로그·디버그용). */
export function warmupAgeName(raw: any): string {
  return WARMUP_AGE_NAMES[normalizeWarmupAge(raw)];
}
