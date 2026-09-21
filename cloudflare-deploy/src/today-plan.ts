// ═══════════════════════════════════════════════════════════════════════
// 📅 today-plan.ts — «오늘의 A.i 학습» 계획 정본 (2026-09-03)
//
// [왜 이 파일이 생겼나]
//   AI 학습도구는 8종이 있고 각각은 잘 돈다. 그런데 서로 이어져 있지 않았다.
//   2026-09-03 D1 실측: 최근 30일 AI 도구를 쓴 학생 60명 중 **2개 이상 도구를 쓴 학생 7명**,
//   3개 이상 3명. 「오늘 무엇을 하면 되는가」를 말해 주는 화면이 없어서
//   학생은 매번 목록 8칸 앞에서 하나를 고르고, 대개 한 가지만 쓰다 만다.
//   또 레벨이 화면마다 따로였다 — 웜업은 localStorage `mangoi_warmup_level`,
//   AI 친구는 `mangoi_aifriend_level`, 판단력은 서버 `students_erp.level`.
//
//   이 파일은 «오늘 할 일» 을 정하는 **순수 함수** 하나다 — DB 도 fetch 도 없다.
//   그래서 하니스가 컴파일해 실제로 돌릴 수 있고(CLAUDE.md 「함수를 실제로 돌려서」),
//   API(`/api/student/today`)와 화면(`today.html`)은 이것을 «부르기만» 한다.
//
// [⛔ 새 눈금을 만들지 않는다]
//   레벨 눈금은 BAND_SPECS(judgment-level.ts) 하나다 — 웜업 1~8 = AI 친구 S1~S8 = 밴드 1~8.
//   여기서는 그 표를 «읽기만» 한다. 세 번째 표를 만들면 화면마다 답이 다른 사고가 시작된다.
//
// [설계 근거 — docs/AI학습도구_학교학원_커리큘럼_제안서_2026-09-02 «A안 수업 샌드위치»]
//   · 수업일: 수업 «전» 10분 웜업(그날 교재 문장) → 정규수업(손대지 않음) → 수업 «후» 10분 복습퀴즈
//   · 수업 없는 날: 하루 15분 안팎 — 말하기 한 가지 + 복습 한 가지 + 요일 특별 한 가지
//   · 낱말 하나를 익히려면 8~10번 만나야 하고(Nation & Wang 1999 · Webb 2007), 같은 횟수라도
//     며칠에 나눌 때 오래간다(Cepeda 외 2006) — 그래서 «매일 조금» 이 기본 단위다.
// ═══════════════════════════════════════════════════════════════════════
import { BAND_SPECS, BAND_COUNT, bandFromTextbookLevel } from './judgment-level';
import { AI_FRIEND_CEFR } from './ai-friend-level';

export type ToolKey =
  | 'warmup' | 'review' | 'friend' | 'speech' | 'micro' | 'vocab' | 'judgment' | 'write' | 'games';

export interface ToolSpec {
  key: ToolKey;
  url: string;
  /** 중국어 교재 학생에게는 이 주소로(있을 때만) */
  urlZh?: string;
  icon: string;
  ko: string;
  en: string;
  /** 권장 시간(분) — 화면 표시용. 실제 소요와 무관하게 «이 정도면 된다» 는 눈금 */
  minutes: number;
  /** 낮은 밴드에서는 안 권한다(글쓰기 — 문장을 스스로 만들어야 하므로) */
  minBand?: number;
}

/** 도구 8종 + 단어장. ⚠️ url 은 실재하는 화면이어야 한다(하니스가 파일 존재를 대조한다). */
export const TOOLS: Record<ToolKey, ToolSpec> = {
  warmup:   { key: 'warmup',   url: '/warmup.html',       icon: '🗣️', ko: '수업 전 AI 웜업', en: 'Pre-class AI warm-up', minutes: 10 },
  review:   { key: 'review',   url: '/review-quiz.html',  urlZh: '/review-quiz-cn.html', icon: '🧠', ko: '복습퀴즈', en: 'Review quiz', minutes: 10 },
  friend:   { key: 'friend',   url: '/ai-friend.html',    icon: '🤖', ko: 'AI 친구 대화', en: 'Chat with AI friend', minutes: 7 },
  speech:   { key: 'speech',   url: '/speech-coach.html', urlZh: '/speech-coach-cn.html', icon: '🎤', ko: 'AI 음성코치', en: 'AI speech coach', minutes: 7 },
  micro:    { key: 'micro',    url: '/micro-quiz.html',   icon: '⚡', ko: 'AI 단어 퀴즈', en: 'AI word quiz', minutes: 5 },
  vocab:    { key: 'vocab',    url: '/vocab.html',        icon: '📖', ko: '단어장', en: 'Vocabulary', minutes: 5 },
  judgment: { key: 'judgment', url: '/judgment.html',     icon: '🧭', ko: '판단력 훈련', en: 'Judgment training', minutes: 5 },
  write:    { key: 'write',    url: '/ai-write.html',     icon: '✍️', ko: 'AI 글쓰기', en: 'AI writing', minutes: 15, minBand: 3 },
  games:    { key: 'games',    url: '/student-games.html', icon: '🎮', ko: '학생게임', en: 'Learning games', minutes: 10 },
};

/**
 * 🎯 «오늘의 몫» — 도구마다 «오늘 이만큼 하면 끝» 을 정한 표 (2026-09-21).
 *
 * [왜]
 *   2026-09-21 D1 실측: 게임 한 판 길이 중앙값 **40초**(1,127판 중 57%가 1분 미만),
 *   발음은 하루 **중앙값 1문장**인데 화면이 내건 목표는 **100문장**이었다.
 *   화면 어디에도 «오늘 어디까지 하면 끝인가» 가 없었다 — 게임 HTML 14개·발음코치에
 *   날짜 기준 진행을 세는 코드가 0줄이고, 이 파일조차 «했다/안 했다» 이진으로만 봤다.
 *   사장님 제보: 「무작정 언제까지 해야 끝나는지 모르니 몇 번 하다가 나가게 돼요.」
 *
 * [숫자의 근거 — 지어내지 않았다]
 *   goal 은 그 도구의 «학생-일 행 수» 실측(2026-09-21)에서 왔다. 중앙값은 «이탈한 날» 까지
 *   섞여 있어 목표로 쓰면 순환논리가 되므로, **p75(잘 한 날)** 를 기준으로 삼고 기억하기
 *   쉬운 수로 맞췄다.  ⟨중앙 / p75⟩ warmup 1/2 · review 1/2 · friend 3/6 · micro 5/9 ·
 *   vocab 5/10 · judgment 3/5 · write 1/1.
 *   ⚠️ speech 만 실측 p75(2)보다 높은 **5** 다 — 2026-09-21 사장님이 정한 값이다
 *      (「매일 최대 5문장씩 미션」). 실측을 덮어쓴 것이 아니라 «사람이 정한 것» 이다.
 *
 * [⛔ games 는 goal 이 null 이다 — 빠뜨린 것이 아니다]
 *   지금 셀 수 있는 것은 `game_sessions` 의 «판 수» 뿐인데 그 중앙값이 40초다.
 *   목표를 «3판» 으로 두면 **아무것도 안 하고 세 번 들락날락한 학생이 «달성»** 이 된다 —
 *   화면이 거짓말을 시작한다. `items`(학습 항목) 로 세는 길도 지금은 막혀 있다:
 *   게임 6종이 그 값을 아예 안 보내서(game-track.js 머리말), 그 게임만 하는 학생에게는
 *   **아무리 해도 안 오르는 막대** 가 된다 — 목표가 없는 것보다 나쁘다.
 *   ⟹ 게임은 개수만 보여 주고 목표는 «말하지 않는다». 되살리려면 먼저
 *      `game_sessions.finished` 의 뜻(지금은 «학습 항목이 있었나»)을 고쳐야 한다.
 *
 * [⛔ 새 표·새 집계를 만들지 않았다]
 *   `PlanInput.done` 이 이미 **개수** 로 오고 있었고(api-students.ts 가 COUNT 로 센다)
 *   여기서 `> 0` 으로 버려지고 있었다. 그 값을 그대로 싣기만 한다.
 *
 * [단위 — «한 행이 무엇인가» 를 세는 표에서 확인하고 적었다]
 *   warmup 세션 1개 · review 제출 1회 · friend 학생 발화 1개 · speech 문장 1개(녹음 채점) ·
 *   **micro 문항 1개** · vocab 낱말 1개 · judgment 문항 1개 · write 첨삭 1건 · games 판 1개.
 *   ⚠️ micro 를 «판» 이라 적었다가 고쳤다(2026-09-21 함정 대조) — `vocab_quizzes` 는
 *      INSERT 도 UPDATE(completed=1) 도 **문항 하나씩** 돌고(api-games.ts), 화면은 한 판에
 *      5문항을 요청한다(micro-quiz.html `count: 5`). D1 실측도 한 분에 5·5·5행이었다.
 *      ⟹ 「판」 이면 5문항 한 판을 끝낸 학생에게 화면이 「5 / 5판」 이라 말한다 — 거짓말이다.
 *      숫자(5)는 맞았고 «말» 만 틀렸다.
 *   ⛔ 단위를 새로 넣거나 고칠 때는 **그 표의 INSERT 자리** 를 열어 «한 행이 무엇인가» 를
 *      확인할 것. 이름만 보고 짐작하지 말 것.
 *
 * ⚠️ goal 을 바꾸려면 **이 표 한 줄** 만 고친다. 화면에 숫자를 다시 적지 말 것.
 * ⛔ goal 에 0 을 넣지 말 것 — goalOf 는 «목표 없음» 과 구분해 영영 미완료로 두는데
 *    화면(goalRow)은 `if (!g)` 라 «목표 없음» 으로 그려, 서버와 화면이 다른 말을 한다.
 *    목표를 두지 않으려면 null 이다.
 */
export interface ToolGoal {
  /** 오늘 몫. null = 목표를 두지 않는다(지금 세는 값이 목표로 쓸 만하지 않다) */
  goal: number | null;
  /** 세는 단위 — 화면이 「2 / 5문장」 처럼 그대로 쓴다 */
  unitKo: string;
  /** 영어 단위(단수형). 화면이 1보다 크면 s 를 붙인다 */
  unitEn: string;
}
export const TOOL_GOALS: Record<ToolKey, ToolGoal> = {
  warmup:   { goal: 1,    unitKo: '번',   unitEn: 'session' },
  review:   { goal: 1,    unitKo: '번',   unitEn: 'round' },
  friend:   { goal: 5,    unitKo: '마디', unitEn: 'turn' },
  speech:   { goal: 5,    unitKo: '문장', unitEn: 'sentence' },
  micro:    { goal: 5,    unitKo: '문항', unitEn: 'question' },   // ⚠️ «판» 이 아니다 — 아래 [단위] 주석
  vocab:    { goal: 10,   unitKo: '낱말', unitEn: 'word' },
  judgment: { goal: 5,    unitKo: '문항', unitEn: 'question' },
  write:    { goal: 1,    unitKo: '편',   unitEn: 'piece' },
  games:    { goal: null, unitKo: '판',   unitEn: 'round' },   // ⛔ 위 «games 는 null» 주석을 읽을 것
};

/**
 * 수업 없는 날의 요일별 묶음 (일=0 … 토=6).
 *   말하기 하나(친구·음성코치를 번갈아) + 복습 하나(단어 퀴즈·복습퀴즈를 번갈아) + 요일 특별 하나.
 *   금요일 글쓰기는 밴드 3 이상에서만 — 그 아래는 AI 친구로 바꾼다(buildTodayPlan 이 처리).
 *   ⚠️ 표는 이것 하나다. 화면에 다시 적지 말 것(주간표는 서버가 내려준 것을 그린다).
 */
export const HOME_WEEK: Record<number, ToolKey[]> = {
  0: ['friend', 'games'],
  1: ['friend', 'micro', 'judgment'],
  2: ['speech', 'review', 'micro'],
  3: ['friend', 'micro', 'judgment'],
  4: ['speech', 'review', 'micro'],
  5: ['speech', 'write'],   // 말하기 + 주 1회 글쓰기(밴드 3 미만은 AI 친구로)
  6: ['speech', 'games'],
};

/** 수업일 묶음 — 수업 «전» / «후» / 집에서 마무리 */
export const CLASS_DAY: { before: ToolKey[]; after: ToolKey[]; home: ToolKey[] } = {
  before: ['warmup'],
  after: ['review'],
  home: ['micro'],
};

export interface ClassToday {
  /** 'HH:MM' (KST) */
  start: string;
  minutes: number;
  source: 'mangoi' | 'cafe24';
}

export interface PlanInput {
  /** 1~8. null = 레벨 미배정 */
  band: number | null;
  textbook: string | null;
  /** 중국어 교재(다락원) 학생이면 true — 복습퀴즈·음성코치를 중국어 화면으로 */
  zh?: boolean;
  /** KST 요일 0~6 */
  dow: number;
  /** KST 자정부터 지난 분 (0~1439) */
  nowMin: number;
  /** 오늘 잡힌 수업(망고아이 + 카페24). 없으면 [] */
  classes: ClassToday[];
  /** 이번 주 수업 요일(정기 + 날짜지정) — 주간표용. «수업일인가» 의 정본은 이것 하나다 */
  weekClassDows: number[];
  /**
   * 요일 → 그날 첫 수업 시각 'HH:MM' (주간표에 «19:00» 을 적기 위한 «라벨» 일 뿐).
   * ⛔ 이 값으로 «수업일인가» 를 판정하지 않는다 — weekClassDows 에 없는 요일의 값은 버린다.
   *    (정본을 두 벌로 두면 둘이 어긋나는 날 화면이 조용히 거짓말한다.)
   */
  weekClassTimes?: Record<number, string>;
  /** 오늘 도구별 활동 횟수(0 이면 안 함). 없는 키는 0 */
  done: Partial<Record<ToolKey, number>>;
}

export type Slot = 'before' | 'after' | 'home' | 'first';

export interface PlanStep {
  key: ToolKey | 'leveltest';
  slot: Slot;
  icon: string;
  ko: string;
  en: string;
  url: string;
  minutes: number;
  /**
   * 오늘 이 도구를 «끝냈는가».
   * 🔄 2026-09-21 에 뜻이 바뀌었다 — 예전에는 «한 번이라도 했나» 였다.
   *    그러면 1문장만 말해도 「✓ 완료」 라, 화면이 바로 아래에서 「3문장 더!」 라고
   *    말하는 자기모순이 됐다(2026-09-21 브라우저 실측으로 잡았다). 그리고 «한 번 열면 완료»
   *    는 애초에 사장님이 고쳐 달라고 한 그것이다 — 「언제까지 해야 끝나는지 모르겠다」.
   * ✅ 지금 뜻: 목표가 있으면 **오늘 몫을 채웠나**, 목표가 없으면(games·레벨테스트)
   *    예전 그대로 **한 번이라도 했나**.
   * ⚠️ 이 칸이 doneCount 를 만들고, 그 숫자를 홈 히어로(js/idx-cta-status.js)도 읽는다.
   *    그래서 두 화면이 «파일을 안 고치고» 같은 말을 한다 — index.html 은 공동 금지구역이라
   *    이 방향이 아니면 홈과 today 가 다른 숫자를 말하게 된다.
   */
  done: boolean;
  /** 왜 지금 이것인가 — 한 줄 */
  whyKo: string;
  whyEn: string;
  /* ── 🎯 오늘의 몫 (2026-09-21) — 위 TOOL_GOALS 주석을 함께 읽을 것 ── */
  /** 오늘 이 도구로 한 개수. 서버가 실제로 센 행 수이고, 못 세면 0 이다(지어내지 않는다) */
  count: number;
  /** 오늘 몫. null 이면 이 도구는 목표를 «말하지 않는다»(games) */
  goal: number | null;
  /** 세는 단위 이름 — 도구마다 뜻이 다르다(문장·판·마디…). 화면은 이 글자를 그대로 쓴다 */
  unitKo: string;
  unitEn: string;
}

export interface WeekDay {
  dow: number;
  ko: string;
  en: string;
  isClass: boolean;
  isToday: boolean;
  tools: ToolKey[];
  /** 수업일이면 그날 첫 수업 시각 'HH:MM'. 모르면 null (수업일이 아니면 언제나 null) */
  start: string | null;
  /** 그날 AI 도구에 드는 분 — tools 의 TOOLS[k].minutes 합. 지어낸 값이 아니라 계획의 합계다 */
  minutes: number;
}

export interface TodayPlan {
  mode: 'class' | 'home' | 'unassigned';
  /** 수업일일 때 지금이 어느 구간인가 */
  phase: 'before' | 'in_class' | 'after' | null;
  cls: ClassToday | null;
  band: number | null;
  bandKo: string | null;
  bandEn: string | null;
  cefr: string | null;
  textbook: string | null;
  steps: PlanStep[];
  totalMinutes: number;
  doneCount: number;
  /** 도구 화면이 읽는 레벨 키에 심을 값 — 화면은 «비어 있을 때만» 심는다 */
  levelKeys: { warmup: string | null; aifriend: string | null };
  week: WeekDay[];
}

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'HH:MM' → 분. 못 읽으면 null */
export function hhmmToMin(s: any): number | null {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * `class_schedules.day_of_week` 는 숫자 하나가 아니다 — '4'·'Thu'·'목'·'목요일'·'1,3,5'·'Mon,Thu' 가
 * 실제로 들어 있다(CLAUDE.md 2장 「단일 값으로 읽었더니 그 수업만 안 열린다」).
 * 정본 `admDowMatches`(api-admin.ts) 와 같은 폭으로 받는다. import 하지 않는 이유는 그 파일이
 * 관리자 도메인 전체를 끌고 오기 때문 — 하니스가 두 함수를 같은 입력으로 돌려 대조한다.
 */
const DOW_MAP: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};
export function dowMatches(raw: any, target: number): boolean {
  for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
    const t = p.trim();
    if (!t) continue;
    if (/^\d+$/.test(t)) { if (Number(t) === target) return true; continue; }
    const k = DOW_MAP[t.toLowerCase()];
    if (k !== undefined && k === target) return true;
  }
  return false;
}
/** 나열('1,3,5'·'Mon,Thu')을 요일 배열로 */
export function dowList(raw: any): number[] {
  const out: number[] = [];
  for (let d = 0; d <= 6; d++) if (dowMatches(raw, d)) out.push(d);
  return out;
}

/** KST 기준 날짜 조각 — 서버(UTC)에서 «오늘» 을 셀 때 쓴다 */
export function kstParts(ms: number): { ymd: string; dow: number; min: number; dayStartMs: number } {
  const k = new Date(ms + 9 * 3600 * 1000);
  const y = k.getUTCFullYear(), mo = k.getUTCMonth(), d = k.getUTCDate();
  const ymd = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayStartMs = Date.UTC(y, mo, d) - 9 * 3600 * 1000;
  return { ymd, dow: k.getUTCDay(), min: k.getUTCHours() * 60 + k.getUTCMinutes(), dayStartMs };
}

/** `students_erp.level`('Lv 9' 등) → 밴드. 정본 bandFromTextbookLevel 을 그대로 쓴다 */
export function bandFromLevelCell(level: any): number | null {
  const b = bandFromTextbookLevel(level);
  return (b && b >= 1 && b <= BAND_COUNT) ? b : null;
}

function spec(key: ToolKey, zh?: boolean): { url: string; icon: string; ko: string; en: string; minutes: number } {
  const t = TOOLS[key];
  return { url: (zh && t.urlZh) ? t.urlZh : t.url, icon: t.icon, ko: t.ko, en: t.en, minutes: t.minutes };
}

/** 밴드에 맞게 묶음을 다듬는다 — 글쓰기는 밴드 3 미만이면 AI 친구로 */
function fitToBand(keys: ToolKey[], band: number | null): ToolKey[] {
  const out: ToolKey[] = [];
  for (const k of keys) {
    const t = TOOLS[k];
    if (t.minBand && (band == null || band < t.minBand)) { if (!out.includes('friend')) out.push('friend'); continue; }
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * 오늘 몫 계산 — 순수 함수. 목표가 없는 도구(games)는 개수만 싣고 reached 는 언제나 false.
 * ⚠️ 음수·NaN 은 0 으로 본다(서버 COUNT 가 실패하면 0 을 주지만, 여기서 한 번 더 막는다).
 */
export function goalOf(key: ToolKey, rawCount: any): { count: number; goal: number | null; unitKo: string; unitEn: string; reached: boolean } {
  const g = TOOL_GOALS[key] || { goal: null, unitKo: '번', unitEn: 'time' };
  const n = Number(rawCount);
  const count = (isFinite(n) && n > 0) ? Math.floor(n) : 0;
  return { count, goal: g.goal, unitKo: g.unitKo, unitEn: g.unitEn,
           reached: (g.goal != null && g.goal > 0) ? (count >= g.goal) : false };
}

function step(key: ToolKey, slot: Slot, inp: PlanInput, whyKo: string, whyEn: string): PlanStep {
  const s = spec(key, inp.zh);
  const { reached, ...rest } = goalOf(key, inp.done[key]);
  return { key, slot, icon: s.icon, ko: s.ko, en: s.en, url: s.url, minutes: s.minutes,
           whyKo, whyEn, ...rest,
           /* 목표가 있으면 «오늘 몫을 채웠나», 없으면 예전 그대로 «한 번이라도 했나».
              ⛔ 목표 없는 도구까지 false 로 떨어뜨리지 말 것 — games 는 목표가 없으므로
                 그러면 무엇을 해도 영영 «안 한 것» 이 된다. */
           done: (rest.goal != null) ? reached : (rest.count > 0) };
}

/** 오늘 수업 중 «가장 이른 것» — 두 건이면 첫 수업 전 웜업·마지막 수업 뒤 복습이 맞지만 화면은 한 건만 보여 준다 */
function firstClass(classes: ClassToday[]): ClassToday | null {
  let best: ClassToday | null = null;
  for (const c of classes || []) {
    if (hhmmToMin(c.start) == null) continue;
    if (!best || (hhmmToMin(c.start) as number) < (hhmmToMin(best.start) as number)) best = c;
  }
  return best;
}
function lastClass(classes: ClassToday[]): ClassToday | null {
  let best: ClassToday | null = null;
  for (const c of classes || []) {
    if (hhmmToMin(c.start) == null) continue;
    if (!best || (hhmmToMin(c.start) as number) > (hhmmToMin(best.start) as number)) best = c;
  }
  return best;
}

/** 이번 주 요일표 — 화면이 그대로 그린다 */
export function buildWeek(inp: PlanInput): WeekDay[] {
  const set = new Set(inp.weekClassDows || []);
  const times = inp.weekClassTimes || {};
  const week: WeekDay[] = [];
  for (let d = 0; d <= 6; d++) {
    const isClass = set.has(d);
    const tools = isClass
      ? [...CLASS_DAY.before, ...CLASS_DAY.after, ...CLASS_DAY.home]
      : fitToBand(HOME_WEEK[d] || ['friend', 'micro'], inp.band);
    /* 시각은 «수업일인 날» 에만 붙인다 — times 가 넓어도 판정은 weekClassDows 하나뿐 */
    const start = isClass && hhmmToMin(times[d]) != null ? String(times[d]).slice(0, 5) : null;
    const minutes = tools.reduce((n, k) => n + (TOOLS[k] ? TOOLS[k].minutes : 0), 0);
    week.push({ dow: d, ko: DOW_KO[d], en: DOW_EN[d], isClass, isToday: d === inp.dow, tools, start, minutes });
  }
  return week;
}

/**
 * 주간표의 «오늘» 칸을 실제 steps 로 맞춘다.
 *
 * 🔴 왜 필요한가 — buildWeek 은 요일표만 보고 tools 를 정하는데, buildTodayPlan 은
 *   레벨이 없으면(band == null) steps 를 «레벨테스트 + AI 친구» 로 통째로 바꾼다.
 *   그 분기를 buildWeek 이 모르므로, 그대로 두면 띠의 오늘 칸은 「14분」인데 바로 아래
 *   펼침 상자는 「레벨테스트 10분 · AI 친구 7분」(17분)을 나열한다 — 상자 제목이
 *   「금요일 · 오늘」이라 «이 칸을 풀어 쓴 것» 으로 읽히는데 숫자가 다르다.
 *   ⚠️ 예외가 아니라 «거의 모든 학생» 이다 — 2026-09-04 운영 D1 실측:
 *      students_erp 29,475명 중 level 이 채워진 사람 1명.
 *   ⛔ 반대로 고치지 말 것(steps 를 week 에 맞추기) — 「오늘 할 일」의 정본은 steps 다.
 */
export function todayFromSteps(week: WeekDay[], dow: number, steps: PlanStep[]): WeekDay[] {
  const d = week[dow];
  if (!d || !steps.length) return week;
  d.tools = steps.map(s => s.key).filter(k => k !== 'leveltest') as ToolKey[];
  d.minutes = steps.reduce((n, s) => n + (s.minutes || 0), 0);   // 레벨테스트도 «오늘 드는 시간» 이므로 합에 넣는다
  return week;
}

/**
 * «오늘 할 일» 정본.
 *   · 레벨 미배정 → 레벨테스트가 1번, 그 뒤 AI 친구(레벨 없이도 되는 도구)
 *   · 수업일 → 웜업(전) · 복습퀴즈(후) · 단어 퀴즈(집)
 *   · 수업 없는 날 → HOME_WEEK[요일]
 *   done 은 «오늘 그 도구를 한 번이라도 썼는가» 로만 본다 — 몇 분 했는지는 재지 않는다
 *   (재지 못하는 값을 지어내지 않는다).
 */
/**
 * 🍯 맛보기(로그인 전) 화면이 쓰는 «보기용» 값 — 실제 학생 한 명이 아니라 «가운데쯤» 을 고른 것.
 *   ⚠️ 교재는 일부러 null 이다. 아무 교재 이름이나 적으면 그 화면은 «네 교재는 BTS 3» 이라고
 *      말하는 셈이 되는데 그건 사실이 아니다(2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」).
 *   ⚠️ 밴드 3 은 «있는 값 중 하나» 를 고른 것이고 «평균» 이 아니다 — 평균이라고 적지 말 것.
 *   ⛔ 수업은 언제나 [] 로 넘긴다(집에서 하는 날). «오늘 19시 수업» 이라고 말하면 아무도 안 온다.
 */
export const SAMPLE_BAND = 3;
export const SAMPLE_TEXTBOOK: string | null = null;

export function buildTodayPlan(inp: PlanInput): TodayPlan {
  const band = (inp.band && inp.band >= 1 && inp.band <= BAND_COUNT) ? inp.band : null;
  const bs = band ? BAND_SPECS[band - 1] : null;
  const cefr = band ? (AI_FRIEND_CEFR['S' + band] || null) : null;
  const steps: PlanStep[] = [];
  const cls = firstClass(inp.classes || []);
  const last = lastClass(inp.classes || []);
  let mode: TodayPlan['mode'];
  let phase: TodayPlan['phase'] = null;

  if (band == null) {
    mode = 'unassigned';
    steps.push({ key: 'leveltest', slot: 'first', icon: '🎯', ko: '레벨테스트', en: 'Level test',
                 url: '/level-test-ai.html', minutes: 10, done: false,
                 /* 레벨테스트는 «한 번만 보면 되는» 것이라 오늘 몫이 없다(개수도 안 센다) */
                 count: 0, goal: null, unitKo: '번', unitEn: 'time',
                 whyKo: '내 수준을 알아야 AI 가 맞는 문장을 줍니다. 한 번만 보면 됩니다.',
                 whyEn: 'Once the AI knows your level, every tool picks the right sentences.' });
    steps.push(step('friend', 'home', inp, '레벨 없이도 바로 할 수 있어요. 오늘 있었던 일을 영어로 말해 보세요.',
                                          'Works without a level — tell the AI about your day.'));
  } else if (cls) {
    mode = 'class';
    const sMin = hhmmToMin(cls.start) as number;
    const eMin = (hhmmToMin(last!.start) as number) + Math.max(10, last!.minutes || 20);
    phase = inp.nowMin < sMin ? 'before' : (inp.nowMin <= eMin ? 'in_class' : 'after');
    for (const k of CLASS_DAY.before) steps.push(step(k, 'before', inp,
      `${cls.start} 수업 전에 10분. 오늘 배울 문장으로 입을 풀어요.`,
      `10 minutes before your ${cls.start} class — warm up with today's sentences.`));
    for (const k of CLASS_DAY.after) steps.push(step(k, 'after', inp,
      '수업이 끝난 직후가 제일 잘 남아요. 오늘 배운 것을 바로 물어봅니다.',
      'Right after class is when it sticks — quiz on what you just learned.'));
    for (const k of fitToBand(CLASS_DAY.home, band)) steps.push(step(k, 'home', inp,
      '집에서 5분. 오늘 틀린 단어를 한 번 더 만나요.',
      '5 minutes at home — meet today\'s missed words once more.'));
  } else {
    mode = 'home';
    const keys = fitToBand(HOME_WEEK[inp.dow] || ['friend', 'micro'], band);
    const why: Record<string, [string, string]> = {
      friend:   ['말하기 한 가지. 오늘은 AI 친구와 7분.', 'Speaking: 7 minutes with your AI friend.'],
      speech:   ['말하기 한 가지. 오늘은 발음 7분.', 'Speaking: 7 minutes of pronunciation.'],
      micro:    ['복습 한 가지. 지난 수업에서 틀린 단어가 다시 나와요.', 'Review: words you missed come back.'],
      review:   ['복습 한 가지. 교재 진도대로 묻습니다.', 'Review: questions follow your textbook.'],
      judgment: ['요일 특별. 상황을 읽고 고르는 5분.', 'Special: 5 minutes of choosing and explaining.'],
      write:    ['주 1회 글쓰기. 6하원칙 질문에 답하면 뼈대가 생겨요.', 'Weekly writing — answer 5W1H and get an outline.'],
      games:    ['자율. 게임도 포인트가 쌓여요.', 'Free choice — games earn points too.'],
      vocab:    ['내 단어장을 한 번 훑어요.', 'Skim your own word list.'],
      warmup:   ['수업이 없는 날에도 입 풀기.', 'Warm up even without a class.'],
    };
    for (const k of keys) steps.push(step(k, 'home', inp, why[k][0], why[k][1]));
  }

  const totalMinutes = steps.reduce((a, s) => a + s.minutes, 0);
  /* ⚠️ 2026-09-21 부터 이 숫자는 «오늘 몫을 채운 도구 수» 다(위 PlanStep.done 주석).
     홈 히어로(idx-cta-status.js)도 같은 값을 읽으므로 두 화면이 저절로 같은 말을 한다. */
  const doneCount = steps.filter(s => s.done).length;
  return {
    mode, phase, cls,
    band, bandKo: bs ? bs.nameKo : null, bandEn: bs ? bs.nameEn : null, cefr,
    textbook: inp.textbook || null,
    steps, totalMinutes, doneCount,
    levelKeys: { warmup: band ? String(band) : null, aifriend: band ? ('S' + band) : null },
    week: todayFromSteps(buildWeek(inp), inp.dow, steps),
  };
}

/**
 * AI 활동 연속일 — 「오늘 또는 어제까지 며칠 연속으로 어떤 도구든 썼는가」.
 * dates 는 KST 'YYYY-MM-DD' 의 집합(중복 무관), todayYmd 기준으로 거슬러 센다.
 * 어제까지 이어졌으면 오늘 아직 안 했어도 끊긴 것으로 보지 않는다(오늘 하면 이어진다).
 */
export function aiStreak(dates: Iterable<string>, todayYmd: string): number {
  const set = new Set<string>();
  for (const d of dates) if (d) set.add(String(d).slice(0, 10));
  const [y, m, d] = todayYmd.split('-').map(Number);
  let cur = Date.UTC(y, m - 1, d);
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
  if (!set.has(fmt(cur))) cur -= 86400000;           // 오늘 아직 안 했으면 어제부터
  let n = 0;
  while (set.has(fmt(cur))) { n++; cur -= 86400000; }
  return n;
}
