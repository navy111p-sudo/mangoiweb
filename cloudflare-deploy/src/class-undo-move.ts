/* ↩ 옮긴 수업 되돌리기 — POST /api/admin/class-schedules/:id { action:'undo_move', from_date } (2026-11-04)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 매니저 Mai «At manager's page, I postpone the class but there's no restore or undo postponement option».
        날짜를 정해 연기·변경한 수업은 원래 날짜에 «⏸ 연기됨 → 11/11 20:00» 줄(moved_away — 읽기 전용)로만 남아서
        되돌릴 길이 없었다. 기존 «↩ 연기 취소»(action:'restore')는 «날짜 없이 연기»(status='postponed')한 줄 전용이다.
   [무엇] 그 줄의 수업(:id = 줄의 schedule_id — 날짜 지정 행이면 그 행, 매주 반복이면 반복 행)을 «원래 날짜·시각» 으로
        다시 옮긴다. 원래 자리는 화면이 보낸 값이 아니라 **서버의 이동 기록**(loadMovedAwayEvents)에서 다시 찾는다 —
        화면은 «어느 날짜의 줄인가»(from_date) 만 보낸다.
   [순서] ① 행 → ② 그 날의 이동 기록 → ③ (매주 반복이면) 하루짜리 줄 → ④ judgeMovedAway(지금도 «옮겨 감» 인가)
          → ⑤ judgeMovedAwayUndo(되돌릴 수 있나 — 시각·대상 상태) → ⑥ moveSchedulesAtomically(undoMove)
          — 겹침·강사 휴가·동시 수정·출석 기록은 ⑥ 이 같은 batch 안에서 본다.
   ⛔ 모르면 막는다(fail-closed) — 이력·하루짜리 줄 조회가 실패하면 «기록 없음» 이 아니라 lookup_failed(503).
   ⛔ 새 행을 만들지 않는다(PR #1889 — 같은 행이 옮겨 다닌다). 기록은 'restore'(→ 새 날짜에 «옮겨 감» 줄이 안 생긴다).
   🔒 권한은 부르는 쪽(api-admin.ts)이 정한다 — 본사 전용(enrollAdminHqOnly), «연기 취소» 와 같은 선.
   감시: test-harness/class_undo_move_harness.mjs */

import { loadMovedAwayEvents, movedAwayKey, judgeMovedAway, judgeMovedAwayUndo, loadRecurWeekChildren, recurWeekChildFor } from './class-change-state';
import { moveSchedulesAtomically } from './class-schedule-move';

type Fail = { ok: false; status: number; error: string; message: string };
const fail = (status: number, error: string, message: string): Fail => ({ ok: false, status, error, message });

/** 안 되는 이유 → 화면에 그대로 보여 줄 영어 문장(화면은 error 코드로 KO/EN 을 고르고, 모르는 코드면 이 문장을 쓴다). */
const BLOCK_MESSAGE: Record<string, string> = {
  no_target: 'The class could not be found at its new date. Change it from the new date instead.',
  no_time: 'The original time is unknown, so it cannot be restored automatically. Rebook it to a time instead.',
  orig_passed: 'The original time has already started or passed, so it cannot be restored.',
  target_not_active: 'The class was cancelled or postponed again after the move. Handle it on its new date.',
  target_started: 'The class has already started at its new date, so it cannot be moved back.',
};

async function fullRow(env: any, id: any): Promise<any | null> {
  return await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first();
}

export async function undoMovedClass(env: any, actor: any, scheduleId: number, fromDate: any, nowMs: number = Date.now()) {
  const from = String(fromDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return fail(400, 'invalid_from_date', 'Pick the original class date again.');
  let row: any = null;
  try { row = await fullRow(env, scheduleId); }
  catch { return fail(503, 'lookup_failed', 'Could not check the class right now. Please try again shortly.'); }
  if (!row) return fail(404, 'not_found', 'The class could not be found. Refresh the list.');

  const evs = await loadMovedAwayEvents(env.DB, from, from);
  const ev = evs.byKey.get(movedAwayKey(row.id, from));
  if (!ev) return evs.complete
    ? fail(409, 'no_move_record', 'There is no move record for this date. Refresh the list.')
    : fail(503, 'lookup_failed', 'Could not check the change history right now. Please try again shortly.');

  /* 🔁 매주 반복 행 — 옮겨 간 것은 «그 주 하루만» 줄이다. 판정에 쓴 줄과 옮길 줄이 같아야 하므로 전체 칸으로 다시 읽는다
     (loadRecurWeekChildren 은 칸 일부만 읽어 그대로 넘기면 이동 엔진의 버전 대조가 늘 «바뀌었다» 로 거절한다). */
  let child: any = null;
  if (!String(row.scheduled_date ?? '').trim()) {
    const rw = await loadRecurWeekChildren(env.DB, [row.id]);
    const c = recurWeekChildFor(rw.byParent.get(String(row.id)), from);
    if (!c && !rw.complete) return fail(503, 'lookup_failed', 'Could not check the class right now. Please try again shortly.');
    if (c) {
      try { child = await fullRow(env, c.id); }
      catch { return fail(503, 'lookup_failed', 'Could not check the class right now. Please try again shortly.'); }
    }
  }

  const ch = judgeMovedAway(row, ev, { showActor: false }, child);
  if (!ch) return fail(409, 'not_moved', 'This class is already back on this date, or was not moved. Refresh the list.');
  const u = judgeMovedAwayUndo(row, ch, child, nowMs);
  if (!u) return fail(409, 'not_moved', 'This class is already back on this date, or was not moved. Refresh the list.');
  if (!u.ok) return fail(409, String(u.reason), BLOCK_MESSAGE[String(u.reason)] || 'This class cannot be restored.');

  const target = child || row;
  if (String(target.id) !== String(u.target_id)) return fail(409, 'schedule_changed', 'The class changed while checking. Refresh the list.');
  const result: any = await moveSchedulesAtomically(env, actor,
    { ids: [String(target.id)], patch: { destination_date: u.from_date, start_time: u.from_time } }, [target], { undoMove: true });
  return result.ok
    ? { ...result, id: Number(target.id), from_date: u.from_date, from_time: u.from_time }
    : result;
}
