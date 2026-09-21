/**
 * 🎮 «오늘 게임에서 몇 문제» — 게임 허브 하루 몫의 정본 (2026-09-21, C안)
 *
 * [왜]
 *   사장님: 「게임을 하면 내가 얼만큼 더해야하는지 얼마나 남았는지 시각적으로 보이면
 *            좋겠어요. 무작정 언제까지 해야 끝나는지 모르니 몇번하다가 나가게돼요.」
 *
 * 🔴 [세는 것은 «판» 이 아니라 «문제» 다 — 이 파일이 존재하는 첫 번째 이유]
 *   2026-09-21 까지 게임은 목표가 **없었다**(`TOOL_GOALS.games.goal = null`). 그 이유를
 *   today-plan.ts 가 적어 두었다 — 「목표를 «3판» 으로 두면 **아무것도 안 하고 세 번
 *   들락날락한 학생이 «달성»** 이 된다」. 실제로 한 판의 중앙값이 40초다.
 *   ⟹ 그 반론은 **«문제» 로 세면 그 자리에서 사라진다.** 들락날락한 판은 `items` 가 0이라
 *      한 문제도 안 세어진다. 그래서 이 파일은 `COUNT(*)` 가 아니라 **`SUM(items)`** 를 센다.
 *   ⛔ 「판 수」로 되돌리지 말 것.
 *
 * 🔴 [`game_sessions` 에는 «게임이 아닌 것» 이 섞여 있다]
 *   `game-track.js` 는 게임(허브 16종 중 14종)만이 아니라 **학습 도구 7종**(warmup·speech-coach·vocab·
 *   judgment·micro-quiz·review-quiz·ai-write)에도 실린다. 실측(2026-09-21, 1,127행)에서
 *   가장 많은 `game` 값이 **`warmup` 403행**이었다.
 *   ⟹ 그대로 세면 «발음 5문장» 이 «게임 5문제» 로 **두 번 세어진다**(도구마다 자기 칸이 따로 있다).
 *   ✅ 그래서 빼는 목록을 **`TOOLS` 표에서 계산한다**(아래 `TOOL_GAME_IDS`).
 *      ⛔ 이름을 손으로 적지 말 것 — 도구가 늘면 그 도구가 조용히 게임으로 세어진다.
 *
 * ⚠️ [«오늘 게임을 켰지만 한 문제도 안 푼 날» 은 이제 0 으로 보인다]
 *   실측(2026-09-21, 학습도구·게스트 제외 학생-일 43): **15일(35%)이 그렇다.** 그것이 사실이고, 바로 그 15일이
 *   사장님이 말한 「몇 번 하다가 나가게 돼요」다. ⛔ 화면을 채우려고 판 수로 바꾸지 말 것.
 *
 * 🔴 [게임 2종은 «늦게» 오르는 것이 아니라 **영영 0** 이다 — 함정 대조가 잡았다]
 *   2026-09-21 전수 조사(허브 `student-games.html` 이 여는 16종을 하나씩 열어 확인):
 *     · `game-track.js` 를 싣는 것 **14종** — 이 14종만 `game_sessions` 에 행이 생긴다.
 *     · **`speaking-quiz.html`** — track 0건. `/api/games/shadow` 는 부르므로 그 한 줄만
 *       실으면 세어진다(game-track 이 shadow 를 items 로 셈). **별건**(그 파일은 B 담당).
 *     · **`student-game-scene-quest.html`** — track 0건 **+ `/api/` 호출 0건**.
 *       서버로 아무것도 안 보내므로 **구조적으로 셀 수 없다.**
 *   ⟹ 그 둘만 하는 학생에게는 막대가 «늦는» 것이 아니라 **한 번도 안 오른다.**
 *      옛 `goal:null` 주석이 경고한 「아무리 해도 안 오르는 막대」가 그 둘에 남아 있다.
 *   ⛔ 「전부 늦게 오를 뿐」으로 요약하지 말 것. 감시는 game_today_goal_harness ⑦ 이
 *      그 둘의 **이름을 찍어 출력**한다(FAIL 로 만들지 않는다 — 고치는 것은 사람이 정할 일).
 *
 * ⚠️ [한 판 «안» 에서 몇 문제 남았는지는 아직 못 보여준다 — 분모가 없다]
 *   2026-09-21 전수 조사: 추적되는 게임 14종 중 «한 판의 총 문제 수» 를 밖에서 알 수 있는 게임은
 *   사실상 없다(스테이지형·탈출형·육성형이 섞여 있고, 상수를 가진 것은 rescue-voyage
 *   `MAX_ROUNDS=6`·shooter `MAX_LIVES=3` 정도인데 뜻이 제각각이다).
 *   ⟹ 「이번 판: 5문제 중 2문제」는 **게임마다 따로** 정해야 하는 별건이다.
 *      지금 공통으로 셀 수 있는 것은 «오늘 몇 문제» 하나뿐이다.
 *
 * 🔴 [`game_sessions.finished` 를 «완주» 로 읽지 말 것]
 *   `game-track.js` 의 그 값은 `finishedFlag || items > 0` 인데, **`MangoiGame.finish()` 를
 *   부르는 게임이 저장소에 한 곳도 없다**(2026-09-21 grep 실측: 0건).
 *   ⟹ 실제 뜻은 «학습 항목이 하나라도 있었나» 이고, D1 실측도 **`finished=1` 과 `items>0` 이
 *      어긋난 행이 0건**이었다(2026-09-21 · 전체 1,127행 · `game` 값 20가지).
 *      ⛔ 완주율로 쓰지 말 것.
 *
 * ⚠️ [목표 숫자는 여기서 정하지 않는다]
 *   `TOOL_GOALS.games.goal`(today-plan.ts) 한 곳이 정본이다 — 「오늘의 A.i 학습」 카드와
 *   이 줄이 같은 숫자를 말해야 한다. ⛔ 5 를 이 파일이나 화면에 다시 적지 말 것.
 *
 * ℹ️ [보상은 없다]
 *   C안은 «보여 주기» 다. 포인트를 붙이면 하루 30점 통(게임 묶음)을 단어장·복습퀴즈와
 *   나눠 쓰는 계산이 함께 걸린다 — 그건 사람이 정할 일이다.
 */
import { TOOLS, TOOL_GOALS } from './today-plan';
import { kstDayStart } from './point-policy';
import { pluralizeEn } from './speech-mission';

/**
 * `game_sessions.game` 에서 «게임이 아닌 것» 을 골라내는 목록.
 *
 * `game-track.js` 의 `detectGame()` 과 **같은 다듬기**다 — 경로를 떼고 `.html` 을 떼고
 * `student-game-` 접두사와 `-cn` 접미사를 뗀다. 그 함수가 바뀌면 여기도 함께 고칠 것.
 * ⛔ 이름을 손으로 적지 말 것 — `TOOLS` 에서 계산한다(도구가 늘면 저절로 따라온다).
 * ⚠️ `'other'` 는 `detectGame()` 이 «어느 화면인지 모를 때» 주는 값이다 — 게임으로 세지 않는다.
 */
export function gameIdFromUrl(u: string): string {
  const f = String(u || '').split('/').pop() || '';
  return f.replace(/\.html?$/, '').replace(/^student-game-/, '').replace(/-cn$/, '');
}
export const TOOL_GAME_IDS: string[] = (() => {
  const out = new Set<string>(['other']);
  for (const k of Object.keys(TOOLS) as (keyof typeof TOOLS)[]) {
    if (k === 'games') continue;                      // 게임 허브 자신은 «도구» 가 아니다
    const t: any = TOOLS[k];
    if (t?.url) out.add(gameIdFromUrl(t.url));
    if (t?.urlZh) out.add(gameIdFromUrl(t.urlZh));
  }
  out.add(gameIdFromUrl(TOOLS.games.url));            // student-games — 허브는 게임이 아니다
  return [...out];
})();

/** 오늘 몫(문제 수). 정본은 `TOOL_GOALS.games` 하나 — 여기서 숫자를 새로 정하지 않는다. */
export function gameDailyGoal(): number {
  const g = TOOL_GOALS.games && TOOL_GOALS.games.goal;
  return (typeof g === 'number' && g > 0) ? Math.floor(g) : 0;
}

/**
 * 오늘(KST) 이 학생이 **게임에서** 푼 학습 항목 수.
 * ⚠️ 못 세면 `null` 이다 — 0 이 아니다. 0 으로 적으면 「아무것도 안 했다」가 되어
 *    조회 한 번 실패가 학생의 오늘 몫을 통째로 지운다(그리고 화면이 그것을 사실로 말한다).
 */
export async function gameItemsToday(env: any, uid: string): Promise<number | null> {
  const u = String(uid || '').trim();
  if (!u || /^guest(_|$)/i.test(u)) return null;      // 게스트는 uid 를 함께 쓴다(speech-mission 과 같은 규약)
  try {
    /* ⛔ 목록을 `IN (?,?,…)` 로 펴지 않는다 — D1 바인드 100개 한도가 있고
       도구가 늘어날 때마다 그 숫자가 변한다. 조직 스코프 조회와 같은 방식으로
       **콤마 문자열 한 개**를 바인드해 `instr` 로 묻는다.
       ⚠️ `game` 이 NULL 이면 `COALESCE` 로 'other' 로 본다 — 그것도 게임이 아니다. */
    const excl = ',' + TOOL_GAME_IDS.join(',') + ',';
    const row: any = await env.DB.prepare(
      `SELECT COALESCE(SUM(items), 0) AS n FROM game_sessions
        WHERE uid = ? AND created_at >= ?
          AND instr(?, ',' || COALESCE(game, 'other') || ',') = 0`
    ).bind(u, kstDayStart(), excl).first();
    const n = Number(row?.n);
    return isFinite(n) && n >= 0 ? n : null;
  } catch { return null; }
}

export interface GameMission {
  goal: number;
  /** 오늘 게임에서 푼 문제 수 */
  count: number;
  left: number;
  reached: boolean;
  unitKo: string;
  unitEn: string;
  /** 영어 단위의 복수형(goal 기준) — 화면이 복수 규칙을 다시 만들지 않게 */
  unitEnPl: string;
}

/**
 * 화면에 내려 줄 「오늘 몫」 상태. 모르면 `null` — 화면은 그때 아무 말도 하지 않는다.
 * ⛔ «모름» 을 0 으로 바꿔 내려주지 말 것.
 */
export async function gameMissionState(env: any, uid: string): Promise<GameMission | null> {
  const goal = gameDailyGoal();
  if (!goal) return null;
  const count = await gameItemsToday(env, uid);
  if (count == null) return null;
  const spec: any = TOOL_GOALS.games || {};
  return {
    goal,
    count,
    left: Math.max(0, goal - count),
    reached: count >= goal,
    unitKo: String(spec.unitKo || '문제'),
    unitEn: String(spec.unitEn || 'question'),
    unitEnPl: pluralizeEn(String(spec.unitEn || 'question'), goal),
  };
}
