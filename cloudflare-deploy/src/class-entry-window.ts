/**
 * 🚪 수업 «입장 시간창» 정본 — 이 파일 한 곳에서만 계산한다.
 * ═══════════════════════════════════════════════════════════════════════════
 * (2026-09-11 마이마이 선생님 제보 「나가면 다시 못 들어온다」)
 *
 * [무슨 일이 있었나 — 실측]
 *   class-2332-20260911 (15:00~15:20, 창은 종료+15분 = 15:35:00 에 닫힘)
 *     15:18:31 강사 입장 → 15:25:03 퇴장
 *     15:25:20 재입장    → 15:27:38 퇴장
 *     15:34:04 재입장    → 15:35:28 퇴장   ← 창이 닫히기 56초 전
 *     그 뒤 입장 기록 0건.
 *   제보의 "I entered at 3:35pm but I can't log in again" 이 정확히 이 지점이다.
 *
 * [원인 — 같은 수업에 문이 둘이고 서로 다른 답을 했다]
 *   · 강사 포털(api-teacher.ts)  : enter_from_ts~enter_until_ts = **그날 하루 종일**
 *     (2026-08-07 마이마이 요청 ⑤⑪ 로 사장님이 이미 연 문)
 *   · 홈 화면(이 API + idx-main.js): status==='ended' 하드 블록 = **종료+15분**
 *   수업에서 「나가기」를 누르면 홈으로 떨어지므로(index.html 의 location.replace('/?_e=…')),
 *   강사가 다시 들어가려는 «그 순간» 만나는 것은 늘 닫힌 쪽이었다.
 *
 * [이 파일이 하는 일]
 *   «지금이 수업 시간인가»(open_at_ts~close_at_ts)와 «문을 열어 줄 것인가»(여기)를 **갈라 둔다.**
 *   ⛔ close_at_ts 를 늘려서 풀지 말 것 — 그 값에 상태 라벨(진행중/완료)·카운트다운·
 *      「지금 진행 중인 수업」 목록이 전부 걸려 있어서, 늘리면 끝난 수업이 한 시간 동안
 *      «진행중» 으로 떠 관제탑·오늘수업 화면이 통째로 거짓말을 한다.
 *      이 «따로 내려준다» 방식은 api-teacher.ts 가 2026-08-07 에 이미 쓴 선례 그대로다.
 *
 * [규칙]
 *   · 강사·관리자 : 그날 00:00~23:59 (강사 포털과 **같은 답**. 두 화면이 갈리지 않게)
 *   · 학생        : 시작 −10분 ~ max(종료+15분, min(종료+60분, 다음 수업 시작−5분))
 *
 *   ⚠️ **바닥(종료+15분)을 절대 없애지 말 것.** [실측 2026-09-11, 활성 예약 1,263회차]
 *      뒤에 수업이 있는 998회차 중 **간격이 0분 이하인 것이 287건(28.8%)** 이다.
 *      바닥이 없으면 그 회차들의 창이 «다음 수업 시작−5분» = 종료보다 **앞** 으로 계산돼
 *      지금보다 짧아진다 — 되던 것을 깨는 변경이 된다.
 *
 *   ℹ️ 「다음 수업」은 **그 사람 본인의** 다음 수업이다(이 API 가 부르는 사람의 목록에서 온다).
 *      ⛔ 이것을 「강사의 다음 수업을 막아 준다」로 읽지 말 것 — 강사 창은 하루 종일이라
 *         이 값이 강사를 제한하지 않는다. 강사가 옛 방에 남아 다음 수업 학생을 혼자 두는 것은
 *         **창으로 못 막는다**(사람이 두 방에 동시에 못 있는 문제라서). 그쪽은 「다음 수업이 곧
 *         시작됩니다」 안내로 강사를 다음 방으로 끌어오는 것이 답이고, 별건이다.
 *
 * [안 바뀌는 것]
 *   · 급여 — 수업료는 예약된 수업 길이로 계산한다(api-admin.ts 의 `duration_min ?? 30`).
 *     재입장을 몇 번 하든 금액이 부풀지 않는다. 늘어나는 것은 출석 기록뿐이다.
 *   · 방 자체 — src/video-call-room.ts 에는 시간 게이트가 한 줄도 없다(실측 0건).
 *     방 번호만 알면 언제든 열린다. 이 파일이 정하는 것은 «화면이 방 번호를 찾아 주느냐» 다.
 */

/** 기존 보장 — 창은 어떤 경우에도 이보다 짧아지지 않는다(위 ⚠️ 참고).
 *  ⚠️ 이 값의 «지금» 정본은 api-mango.ts 의 `LATE_AFTER` 다. 한쪽만 바꾸면 바닥이
 *     조용히 «지금» 보다 짧아진다 — class_entry_window_harness A-23 이 둘을 대조한다. */
export const ENTER_FLOOR_MS = 15 * 60 * 1000;
/** 마무리·연장 상한 — 이보다 길게 열지 않는다. */
export const ENTER_MAX_MS = 60 * 60 * 1000;
/** 다음 수업 앞에 비워 두는 여유. */
export const NEXT_GUARD_MS = 5 * 60 * 1000;

const DAY_MS = 86400000;

export interface EntryWindowInput {
  /** 강사·관리자인가 (role=teacher|admin) */
  isTeacher: boolean;
  /** 그날 00:00 KST 를 UTC ms 로 */
  dayStartTs: number;
  /** 학생 창이 열리는 시각 (= open_at_ts, 시작 −10분 / 레벨테스트 −30분) */
  openAtTs: number;
  /** 수업 종료 시각 */
  endTs: number;
  /** 같은 사람의 «다음 수업» 시작 시각. 없으면 null */
  nextStartTs?: number | null;
}

export interface EntryWindow {
  from: number;
  until: number;
}

/** 이 수업에 «문을 열어 줄» 구간. */
export function entryWindow(i: EntryWindowInput): EntryWindow {
  if (i.isTeacher) {
    // 강사 포털(api-teacher.ts)과 **같은 답** — 두 화면이 갈리면 이번 사고가 그대로 재현된다.
    return { from: i.dayStartTs, until: i.dayStartTs + DAY_MS - 1 };
  }
  let until = i.endTs + ENTER_MAX_MS;
  if (i.nextStartTs != null && i.nextStartTs > 0) {
    until = Math.min(until, i.nextStartTs - NEXT_GUARD_MS);
  }
  // 바닥 — 위 ⚠️. 이 Math.max 를 빼면 붙어 있는 287회차가 지금보다 짧아진다.
  return { from: i.openAtTs, until: Math.max(i.endTs + ENTER_FLOOR_MS, until) };
}

export function canEnterNow(w: EntryWindow, now: number): boolean {
  return now >= w.from && now <= w.until;
}

/**
 * 막을 때 **사람에게 보여 줄 문구** — 한/영 병기.
 * ⚠️ 한국어만 쓰면 안 된다. 예전 문구가 `alert('오늘 수업은 이미 종료되었어요.')` 로 한국어
 *    전용이라, 필리핀·중국인 강사에게는 「무언가 떴는데 읽을 수 없다」 = "can't log in" 이었다.
 *    (CLAUDE.md — 「사람을 멈춰 세우는 문구」는 한/영 병기)
 * ℹ️ 문구를 **서버가** 만들어 보내는 이유: index.html 첫 화면 예산이 빠듯해(여유 70바이트)
 *    blocking 파일(js/idx-main.js)에 한국어 문자열을 새로 넣을 자리가 없다.
 */
export function enterBlockedMsg(w: EntryWindow, now: number): string {
  if (now < w.from) {
    return '아직 입장 시간이 아니에요. ⏰\n조금 뒤에 다시 눌러 주세요.\n\n'
      + "It's not time to join yet.\nPlease try again shortly.";
  }
  // ⚠️ 「아래에」라고 쓰지 않는다 — 방 코드 입력칸은 이 버튼 «위» 에 있다(index.html 8140 < 8167).
  return '이 수업은 입장 시간이 지났어요. ⏹\n그래도 들어가야 한다면 매니저에게 방 번호를 받아 「방 코드 직접 입력」에 넣어 주세요.\n\n'
    + 'The join window for this class has closed.\nIf you still need to join, ask your manager for the room code and use "Enter room code".';
}

/**
 * 정렬된 세션 목록에서 각 세션의 «다음 수업 시작 시각» 을 구한다.
 * ⛔ `sessions[i + 1]` 로 쓰지 말 것 — 같은 시각에 시작하는 수업이 둘일 수 있고(그룹 수업은
 *    서버에 «학생마다 한 행»), 그러면 자기 자신과 같은 시각을 «다음» 으로 잡아 창이
 *    종료보다 앞으로 계산된다. **자기보다 늦게 시작하는 것 중 가장 이른 것**으로 고른다.
 * ⚠️ 목록이 정렬돼 있다고 가정하지 않는다 — 호출부가 정렬을 바꿔도 답이 안 흔들리게.
 */
export function nextStartAfter(starts: number[], startTs: number): number | null {
  let best: number | null = null;
  for (const s of starts) {
    if (!(s > startTs)) continue;
    if (best == null || s < best) best = s;
  }
  return best;
}
