/* ═══════════════════════════════════════════════════════════════════════
   🚪 «지금 들어갈 수업» 고르기 — /api/class/sessions/today 의 current 정본 (2026-09-30)
   ───────────────────────────────────────────────────────────────────────
   [사고] jjy2323 오늘 11:40(Kes)·11:50(Win) 두 수업이 겹쳐 잡혀 있을 때,
        홈 카드는 Kes 를 보여 줬는데 [입장]은 Win 방으로 갔다. 옛 규칙이
        «시작 시각이 지금과 가장 가까운 것» 이라 11:45 를 넘는 순간 답이 Win 으로
        뒤집혔기 때문이다. 카드와 입장이 서로 다른 순간에 물으면 서로 다른 수업을
        가리켜 → Kes 선생님은 빈 방, 학생은 Win 방(엇갈림).
   [규칙] 시간이 흘러도 뒤집히지 않게 «이미 시작한 수업이 먼저»:
        ① 지금 진행 중(시작 ≤ 지금 < 종료) — 가장 «먼저 시작한» 것(먼저 들어간 수업을 끝까지)
        ② 곧 시작(입장 창은 열렸고 아직 시작 전) — 가장 이른 것
        ③ 끝났지만 지각 입장 창 안 — 가장 «최근에 끝난» 것
   ⛔ «가장 가까운 것» 으로 되돌리지 마세요 — 겹친 두 수업 사이에서 답이 5분마다 바뀝니다.
   ═══════════════════════════════════════════════════════════════════════ */
export type PickableSession = { start_ts: number; end_ts: number; join_open: boolean };

export function pickCurrentSession<T extends PickableSession>(sessions: T[], now: number): T | null {
  const joinable = (sessions || []).filter(s => s && s.join_open);
  if (!joinable.length) return null;
  const inProgress = joinable.filter(s => s.start_ts <= now && now < s.end_ts)
    .sort((a, b) => a.start_ts - b.start_ts);
  if (inProgress.length) return inProgress[0];
  const upcoming = joinable.filter(s => now < s.start_ts)
    .sort((a, b) => a.start_ts - b.start_ts);
  if (upcoming.length) return upcoming[0];
  const late = joinable.slice().sort((a, b) => b.end_ts - a.end_ts);
  return late[0] || null;
}
