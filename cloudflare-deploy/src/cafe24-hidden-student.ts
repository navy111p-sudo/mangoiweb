/* 🙈 «오늘 수업» 의 카페24 줄 중 «명부에서 숨긴(삭제한) 계정» 에 표시를 단다 (2026-11-05)
   ═══════════════════════════════════════════════════════════════════════════
   [왜]  매니저 제보: 「mangoai_lee 를 연기해야 하는데 Move 버튼이 없다」.
         실측(2026-11-05 D1 SELECT): mangoai_lee 는 2026-10-04 사장님 요청으로 «삭제(숨김)» 한 계정이다.
         숨긴 계정은 카페24 미러가 일부러 수업을 만들지 않으므로(c24-mirror.ts 'student_hidden')
         망고아이 시간표에 행이 없고 → 옮길 대상이 없다. 그런데 카페24 예약은 그대로 남아
         «오늘 수업» 에 Move 없는 줄로 계속 떴다. 같은 시각·같은 강사(KRYSTEL)로 lby01(이병엽)의
         망고아이 수업이 따로 있었다 — 연기는 그 줄에서 해야 한다.

   [무엇을 하나]  카페24 줄에 student_hidden=true 를 달고, 같은 시각·같은 강사의 망고아이 수업이
         있으면 그 학생(들)을 hidden_twins 로 알려 준다(화면: «연기는 그 줄에서»).

   ⛔ 줄을 «빼지» 않는다 — 숨긴 계정에도 진짜 수업이 남아 있다.
      실측: 정우영2(숨김)는 카페24 강사 161 과의 수업이 망고아이 쌍둥이 없이 이어지고 있었다.
      빼면 그 수업이 «오늘 수업» 에서 통째로 사라진다. 표시만 한다.
   ⛔ 계정끼리 «같은 사람» 이라고 잇지 않는다 — 이름 추측으로 남의 수업이 붙은 사고가 이 저장소에
      여러 번 있다. «같은 시각(절대 시각 정확일치) + 같은 강사(정규화 이름 정확일치)» 라는 사실만 말한다.
   ⚠️ 숨김 목록을 못 읽으면(빈 Set) 아무 표시도 안 한다 — 예전 화면 그대로(조용히 «숨김» 이라고 지어내지 않는다).
   ℹ️ import 0 — 하니스가 그대로 불러 실제로 돌린다(감시: test-harness/teacher_class_transfer_harness.mjs B·D·E절). */

export interface HiddenTwin { student_uid: string; student_name: string | null }

type SessionLike = {
  source?: unknown; student_uid?: unknown; student_name?: unknown; start_ts?: unknown; teacher_name?: unknown;
  cancelled?: unknown; postponed?: unknown; moved_away?: unknown; status?: unknown;
  student_hidden?: boolean; hidden_twins?: HiddenTwin[];
};

/** 표시한 카페24 줄 수를 돌려준다. sessions 를 «그 자리에서» 고친다(새 칸 두 개만 더한다). */
export function markHiddenCafe24(sessions: SessionLike[], hiddenUids: Set<string>, norm: (v: unknown) => string): number {
  if (!Array.isArray(sessions) || !hiddenUids || !hiddenUids.size) return 0;
  const ms = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  // 같은 시각에 «열리는» 망고아이 수업만 쌍둥이 후보 — 취소·연기·다른 날로 옮긴 줄은 그 시각에 수업이 없다.
  const live = sessions.filter(s => s && s.source === 'mangoi' && !s.cancelled && !s.postponed && !s.moved_away
    && s.status !== 'cancelled' && s.status !== 'postponed');
  let marked = 0;
  for (const s of sessions) {
    if (!s || s.source !== 'cafe24') continue;
    const uid = typeof s.student_uid === 'string' ? s.student_uid : '';
    if (!uid || !hiddenUids.has(uid)) continue;            // 대소문자까지 정확일치(Kim/kim 은 다른 계정)
    s.student_hidden = true;
    marked++;
    const at = ms(s.start_ts);
    const teacher = norm(s.teacher_name);
    const twins: HiddenTwin[] = [];
    if (at !== null && teacher) {
      for (const m of live) {
        if (ms(m.start_ts) !== at) continue;
        if (norm(m.teacher_name) !== teacher) continue;
        const mu = typeof m.student_uid === 'string' ? m.student_uid : '';
        if (!mu || mu === uid) continue;
        if (twins.some(t => t.student_uid === mu)) continue;
        twins.push({ student_uid: mu, student_name: typeof m.student_name === 'string' && m.student_name ? m.student_name : null });
        if (twins.length >= 3) break;                      // 화면 한 줄 — 셋이면 충분하다
      }
    }
    s.hidden_twins = twins;
  }
  return marked;
}
