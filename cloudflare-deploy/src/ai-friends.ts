/* ai-friends.ts — «AI 친구» 이름의 정본 (2026-08-31)
 *
 * 왜 이 파일이 있나
 *   웜업·AI영어친구·음성코치에서 학생이 네 친구(Emma·Jake·Lily·Noah) 중 하나를 고른다.
 *   그런데 이름·얼굴·목소리를 넷으로 늘리면서 «AI 자신의 정체성» 이라는 축을 빠뜨렸다 —
 *   서버 프롬프트가 「너는 '망고(Mango)'야」로 하드코딩돼 있었고 화면은 고른 이름을
 *   서버에 보내지도 않았다. 그래서 화면은 "Hi! I'm Lily." 라고 인사해 놓고, 학생이
 *   이름을 물으면 AI 가 Mango 라 하거나 그때그때 다른 이름을 지어냈다
 *   (2026-08-31 사장님 제보 「이름이 lily 로 나오는데 자신의 이름이 루이라고 말한다」).
 *
 * ⛔ 화면이 보낸 문자열을 그대로 프롬프트에 넣지 말 것
 *   그 자리는 시스템 프롬프트라, 임의 문자열이 들어가면 프롬프트 주입 통로가 된다.
 *   반드시 이 표를 거쳐 «아는 이름» 으로만 바꾼다. 모르는 값이면 기존 'Mango'.
 *
 * ⚠️ 화면 목록과 이 표는 «짝» 이다 — 화면에만 친구를 늘리면 서버가 모르는 값이라
 *    조용히 Mango 로 떨어진다(CLAUDE.md 「화면에서 골랐는데 그 값만 저장이 안 됨」과 같은 뿌리).
 *    ai_friend_name_harness 가 화면 세 곳과 이 표를 대조한다.
 */

/** 화면이 쓰는 키 → AI 가 «자기 이름» 으로 말할 표시 이름 */
export const AI_FRIEND_NAMES: Record<string, string> = {
  emma: 'Emma',
  jake: 'Jake',
  lily: 'Lily',
  noah: 'Noah',
};

/** 아무도 안 골랐거나 모르는 값일 때 — 네 친구가 생기기 전의 이름을 그대로 쓴다 */
export const AI_FRIEND_DEFAULT = 'Mango';

/**
 * 화면이 보낸 값을 «아는 이름» 으로 바꾼다.
 * ⚠️ 「번갈아(mix)」는 화면이 «그 턴에 말할 사람» 을 보내므로 여기서는 다루지 않는다 —
 *    mix 를 그대로 받으면 목록에 없어 기본값이 된다(그것이 맞는 동작이다).
 */
export function resolveFriendName(raw: unknown): string {
  const k = String(raw || '').trim().toLowerCase();
  return AI_FRIEND_NAMES[k] || AI_FRIEND_DEFAULT;
}
