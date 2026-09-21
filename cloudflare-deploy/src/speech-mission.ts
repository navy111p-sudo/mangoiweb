/**
 * 🎤 «오늘 몫 N문장» — 발음 코치 하루 미션의 정본 (2026-09-21, B안)
 *
 * [왜]
 *   사장님: 「발음테스트가 100문장인데 너무 많습니다. 하다가 지칩니다.
 *            아이들에게 매일 최대 5문장씩 할 수 있도록 미션을 주면 좋을 것 같습니다.」
 *   D1 실측(2026-09-21, `voice_coaching` 553행·136 학생-일):
 *     · 하루에 «서로 다른 문장» 을 몇 개 했나 — 1문장 94일(69%) · 2:16 · 3:5 · 4:2 ·
 *       **5:16** · 6:2 · 11:1  ⟹ 중앙값 1, 5문장 이상은 19일(14%).
 *     · 5문장 자리에 봉우리가 있는 것은 기본 세트(`BASIC_STEPS`)가 정확히 5문장이라서다.
 *       ⟹ «5» 는 우리가 지어낸 숫자가 아니라 이미 관측되는 마디다.
 *     · 100문장 완주 보상(`speech_master`)은 **전 기간 6건**(2026-07-06~09-10, 120점).
 *
 * 🔴 [「문장」은 «시도» 가 아니다 — 이 파일이 존재하는 첫 번째 이유]
 *   `voice_coaching` 은 **녹음 한 번에 한 행**이다. 같은 문장을 다시 녹음하면 행이 는다.
 *   실측: ysyt01 2026-09-18 = 21행인데 서로 다른 문장은 **11개**, guest 2026-09-01 =
 *   19행에 **5문장**. 전체로는 시도 553 대 문장 252(문장당 2.19회).
 *   ⟹ `COUNT(*)` 로 세면 **같은 문장을 다섯 번 눌러도 「5 / 5문장 · 오늘 몫 끝!」** 이 된다.
 *      화면이 거짓말을 하고, 그 거짓말 위에서 포인트가 나간다.
 *   ⛔ 그래서 이 파일은 `COUNT(DISTINCT target_text)` 로만 센다. 되돌리지 말 것.
 *   ℹ️ `target_text` 는 553행 전부 NOT NULL·비어 있지 않다(실측) — 그래도 아래 SQL 은
 *      빈 문자열을 빼 둔다(데이터가 바뀌면 «빈 문장» 이 한 칸을 먹는다).
 *
 * 🔴 [영어 화면만이다 — 중국어는 구조적으로 못 센다]
 *   `speech-coach-cn.html` 은 **서버 채점을 아예 부르지 않는다**(브라우저 STT + Azure SDK 로
 *   화면에만 표시). 그래서 `voice_coaching` 에 중국어 행이 사실상 없고, 이 미션도 안 걸린다.
 *   ⛔ 그 화면에 「오늘 몫」 줄을 달지 말 것 — 셀 수가 없어 언제나 0 이다(화면이 거짓말한다).
 *
 * 🔴 [게스트는 uid 를 «함께 쓴다»]
 *   `/api/voice/coach` 는 `student_uid` 가 없으면 `'guest'` 로 적는다. 즉 게스트 전원이 한 칸을
 *   쓴다 — 남이 연습한 것이 내 「오늘 몫」으로 보인다. ⛔ 게스트에게는 미션을 내려주지 않는다.
 *
 * ⚠️ [목표 숫자는 여기서 정하지 않는다]
 *   `TOOL_GOALS.speech.goal`(today-plan.ts) **한 곳**이 정본이다. 「오늘의 A.i 학습」 카드와
 *   이 미션이 같은 숫자를 말해야 하기 때문이다. ⛔ 5 를 이 파일이나 화면에 다시 적지 말 것.
 */
import { TOOL_GOALS } from './today-plan';
import { kstDayStart } from './point-policy';

/**
 * 🪙 하루 미션 보상 규칙 코드.
 *
 * ⚠️ 기존 `speech_master`(유닛 100문장 완주, 20점)와 **일부러 다른 규칙**이다:
 *   · `speech_master` 는 GAME_QUIZ_RULES 라 하루 30점 통을 쓴다. 미션에 그것을 그대로 쓰면
 *     20 + 20 = 40 > 30 이라 **그날 유닛 완주 보상이 막힌다**(둘 중 하나만 받는다).
 *   · 10 + 20 = 30 이면 둘 다 받을 수 있다.
 * ⛔ 이 규칙을 `GAME_QUIZ_RULES` 에서 빼지 말 것 — 빼는 순간 이 경로만 하루 30점 통을
 *    통째로 우회한다(1포인트 = 1원이다).
 * ✅ 하루 한 번은 **서버가** 보장한다 — 규칙표의 `daily_cap = 1` 이고 `earn-by-rule` 이
 *    `point_rule_log` 를 세서 막는다. 기기를 바꾸거나 새로고침해도 두 번 나가지 않는다.
 *    ⛔ 그러니 화면의 localStorage 표시를 «멱등» 으로 믿지 말 것(그건 요청을 줄이는 것뿐).
 */
export const SPEECH_MISSION_RULE = 'speech_daily';

/** 미션 보상 금액(점). ⚠️ 1포인트 = 1원 — 바꾸려면 이 한 줄만 고치고 사람에게 알릴 것. */
export const SPEECH_MISSION_POINTS = 10;

/** 오늘 몫(문장 수). 정본은 `TOOL_GOALS.speech` 하나 — 여기서 숫자를 새로 정하지 않는다. */
export function speechDailyGoal(): number {
  const g = TOOL_GOALS.speech && TOOL_GOALS.speech.goal;
  return (typeof g === 'number' && g > 0) ? Math.floor(g) : 0;
}

/**
 * 게스트인가 — 게스트는 uid 를 함께 쓰므로 미션을 주지 않는다.
 *
 * ⚠️ `'guest'` 정확일치로는 모자란다 — 저장소가 실제로 만드는 모양은
 *    `guest` · `guest_xxxx` · `guest_zh_xxxx` · `guest_fb` 등 «밑줄로 이어 붙인» 것들이다.
 * ⛔ 그렇다고 `/^guest/` 로 넓히지 말 것 — **`guestavo` 같은 실계정을 게스트로 오판**한다.
 *    오판하면 그 학생은 「오늘 몫」 줄을 영영 못 보고 보상도 못 받는데 **에러가 안 난다**.
 *    ⟹ 「guest 로 시작」이 아니라 **「guest 이거나 guest_ 로 시작」** 으로 본다.
 * ⚠️ 그래도 «모르면 안 준다» 쪽으로 실패한다 — 새 접두사(`anon_` 등)가 생기면 그 계정은
 *    미션을 «받게» 되고, 여럿이 한 칸을 쓰면 남이 연습한 것이 내 몫으로 보인다.
 *    새 익명 접두사를 만들면 **이 함수도 함께** 고칠 것.
 */
export function isSharedGuestUid(uid: any): boolean {
  return /^guest(_|$)/i.test(String(uid || '').trim());
}

/**
 * 오늘(KST) 이 학생이 연습한 **서로 다른 문장** 수.
 * ⚠️ 못 세면 `null` 이다 — 0 이 아니다. 0 으로 적으면 「아무것도 안 했다」가 되어
 *    조회 한 번 실패가 학생의 오늘 몫을 통째로 지운다(그리고 화면이 그것을 사실로 말한다).
 */
export async function speechSentencesToday(env: any, uid: string): Promise<number | null> {
  if (!uid || isSharedGuestUid(uid)) return null;
  try {
    const row: any = await env.DB.prepare(
      `SELECT COUNT(DISTINCT target_text) AS n FROM voice_coaching
        WHERE student_uid = ? AND created_at >= ?
          AND target_text IS NOT NULL AND TRIM(target_text) <> ''`
    ).bind(uid, kstDayStart()).first();
    const n = Number(row?.n);
    return isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}

/**
 * 영어 단위의 복수형. 규칙은 화면(js/today-page.js 의 `unitEn`)과 **같은 말이어야 한다** —
 * 「오늘의 A.i 학습」 카드와 이 화면이 같은 단위를 다르게 쓰면 한 서비스가 두 말을 한다.
 * ⛔ 그래서 발음 화면에는 복수 규칙을 두지 않고 서버가 만든 이 값을 그대로 쓴다.
 *    (브라우저 JS 는 이 TS 를 import 할 수 없어 복제가 생기므로, 하니스가 둘을 대조한다.)
 * ⛔ 불규칙 복수가 필요한 단위(quiz → quizzes)를 TOOL_GOALS 에 넣지 말 것 — 이 규칙은
 *    «quizes» 같은 없는 말을 만드는데 에러는 안 나고 화면에만 나온다.
 */
export function pluralizeEn(unit: string, n: number): string {
  const u = String(unit || 'time');
  if (n === 1) return u;
  if (/(s|z|x|ch|sh)$/i.test(u)) return u + 'es';
  if (/[^aeiou]y$/i.test(u)) return u.slice(0, -1) + 'ies';
  return u + 's';
}

export interface SpeechMission {
  /** 오늘 몫(문장) */
  goal: number;
  /** 오늘 한 «서로 다른» 문장 수 */
  count: number;
  /** 몇 문장 남았나 */
  left: number;
  /** 오늘 몫을 채웠나 */
  reached: boolean;
  unitKo: string;
  unitEn: string;
  /** 영어 단위의 복수형(goal 기준) — 화면이 복수 규칙을 다시 만들지 않게 */
  unitEnPl: string;
  /** 보상 규칙 코드 — 화면이 이 값으로 적립을 부른다(화면에 코드를 적지 않게) */
  rule: string;
  /** 보상 점수(표시용). 실제 지급액은 서버 규칙표가 정한다 */
  points: number;
}

/**
 * 화면에 내려 줄 「오늘 몫」 상태. 모르면 `null` — 화면은 그때 아무 말도 하지 않는다.
 * ⛔ «모름» 을 0 으로 바꿔 내려주지 말 것(위 `speechSentencesToday` 주석과 같은 이유).
 */
export async function speechMissionState(env: any, uid: string): Promise<SpeechMission | null> {
  const goal = speechDailyGoal();
  if (!goal) return null;
  const count = await speechSentencesToday(env, uid);
  if (count == null) return null;
  const spec = TOOL_GOALS.speech || ({} as any);
  return {
    goal,
    count,
    left: Math.max(0, goal - count),
    reached: count >= goal,
    unitKo: String(spec.unitKo || '문장'),
    unitEn: String(spec.unitEn || 'sentence'),
    unitEnPl: pluralizeEn(String(spec.unitEn || 'sentence'), goal),
    rule: SPEECH_MISSION_RULE,
    points: SPEECH_MISSION_POINTS,
  };
}
