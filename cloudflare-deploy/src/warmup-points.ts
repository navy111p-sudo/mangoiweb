/* 🪙 A.i 말하기(웜업) 포인트 — «끝내고 요약 보기» 때 한 번 (2026-11-03 사장님 지시)
   정본: 금액·조건·판정. 라우트(api-points.ts earn-by-rule)는 이 파일을 «부르기만» 한다.
   import 가 없어 하니스가 그대로 돌린다(test-harness/warmup_points_harness.mjs).

   규칙: 한 대화에서 학생이 «직접» 3번 이상 말했으면 5P · 하루 1번 · 하루 전체 상한(100점)을 함께 지난다.
   ⛔ 화면이 보낸 «몇 번 말했다» 를 믿지 않는다 — 서버 대화 기록(KV 'warmup:<세션>')에서 센다.
   ⛔ 화면이 첫 인사를 시키려고 보내는 합성 발화(kickoff)는 «학생이 한 말» 이 아니다 — 세지 않는다
      (warmup.html 의 kick 문장이 이 머리말로 시작한다 — 하니스가 두 곳을 대조).
   ⛔ 모르면 주지 않는다(기록을 못 읽음 = 'turns_unknown') — 1P = 1원이라 «막는 쪽» 이 맞는 실패 방향.
   ⚠️ 대화 기록은 최근 20줄(학생 10번)까지만 남는다 — 3번 판정에는 충분하다. */

export const WARMUP_POINT_RULE = 'warmup_talk';
export const WARMUP_POINT_AMOUNT = 5;
export const WARMUP_POINT_DAILY_CAP = 1;
export const WARMUP_POINT_MIN_TURNS = 3;
export const WARMUP_KICKOFF_PREFIX = "Let's start today's pre-class warm-up!";

/** 대화 기록 → 학생이 «직접» 말한 횟수. 모양이 이상하면 null(=모름). */
export function countStudentTurns(history: any, onlyConfirmed = false): number | null {
  if (!Array.isArray(history)) return null;
  let n = 0;
  for (const m of history) {
    if (!m || m.role !== 'user') continue;
    if (onlyConfirmed && m.confirmed !== true) continue;
    const t = String(m.content == null ? '' : m.content).trim();
    if (!t || t.indexOf(WARMUP_KICKOFF_PREFIX) === 0) continue;
    n++;
  }
  return n;
}

/** 줄 수 있는가 — { ok:true } 이거나 { ok:false, error, have? }.
 *  sessionOwner: warmup_session_log 의 user_id(없으면 null · 못 읽었으면 undefined). */
export function warmupPointGate(o: { sessionId: string; historyRaw: string | null | undefined; userId: string; sessionOwner: string | null | undefined; requireConfirmed?: boolean; }):
  { ok: boolean; error: string | null; have: number | null } {
  /* ⚠️ 한 모양으로 둔다 — tsconfig 가 strict 가 아니라 판별 유니온 좁히기가 안 된다(CLAUDE.md 2장). */
  const sid = String(o.sessionId || '').trim();
  if (!sid || sid.length > 200) return { ok: false, error: 'session_required', have: null };
  if (o.sessionOwner === undefined) return { ok: false, error: 'turns_unknown', have: null };
  if (o.sessionOwner && o.sessionOwner !== o.userId) return { ok: false, error: 'session_mismatch', have: null };
  if (o.historyRaw == null) return { ok: false, error: 'turns_unknown', have: null };
  let h: any = null;
  try { h = JSON.parse(String(o.historyRaw)); } catch { return { ok: false, error: 'turns_unknown', have: null }; }
  const have = countStudentTurns(h, o.requireConfirmed === true);
  if (have == null) return { ok: false, error: 'turns_unknown', have: null };
  if (have < WARMUP_POINT_MIN_TURNS) return { ok: false, error: 'not_enough_turns', have };
  return { ok: true, error: null, have };
}
