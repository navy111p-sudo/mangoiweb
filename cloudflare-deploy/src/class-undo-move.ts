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

import { loadMovedAwayEvents, movedAwayKey, judgeMovedAway, judgeMovedAwayUndo, loadRecurWeekChildren, recurWeekChildFor, loadLiveDatedSlots, heldIdFor, HELD_UNDO_SOURCE } from './class-change-state';
import { moveSchedulesAtomically, ensureScheduleMoveGuard } from './class-schedule-move';
import { ensureClassAuditTable } from './class-audit';

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

/** ①~④ — 행 · 그 날의 이동 기록 · (매주 반복이면) 하루짜리 줄 · «지금도 옮겨 감» 판정. «원래대로» 와 «연기 되돌리기» 가 함께 쓴다. */
async function resolveMovedAway(env: any, scheduleId: number, fromDate: any): Promise<Fail | { row: any; child: any; ch: any; from: string }> {
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
  return { row, child, ch, from };
}

export async function undoMovedClass(env: any, actor: any, scheduleId: number, fromDate: any, nowMs: number = Date.now(), historicalCorrection = false) {
  const got = await resolveMovedAway(env, scheduleId, fromDate);
  if ('ok' in got) return got;
  const { row, child, ch } = got;
  const u = judgeMovedAwayUndo(row, ch, child, nowMs);
  if (!u) return fail(409, 'not_moved', 'This class is already back on this date, or was not moved. Refresh the list.');
  if (historicalCorrection && u.historical_available !== true) return fail(409, 'historical_not_available', 'This class can no longer be corrected as an unstarted future destination. Refresh its history.');
  const historical = historicalCorrection && u.historical_available === true;
  if (historical) {
    const destination = child || row;
    const start = Date.parse(String(destination.scheduled_date) + 'T' + String(destination.start_time).padStart(5, '0') + ':00+09:00');
    if (destination.status !== 'active' || !Number.isFinite(start) || start <= nowMs) return fail(409, 'target_not_active', 'Only an unstarted active destination can be corrected. Restore a cancelled future class separately.');
  }
  if (!u.ok && !historical) return fail(409, String(u.reason), BLOCK_MESSAGE[String(u.reason)] || 'This class cannot be restored.');

  const target = child || row;
  if (String(target.id) !== String(u.target_id)) return fail(409, 'schedule_changed', 'The class changed while checking. Refresh the list.');
  const result: any = await moveSchedulesAtomically(env, actor,
    { ids: [String(target.id)], patch: { destination_date: u.from_date, start_time: u.from_time } }, [target], { undoMove: true, historicalUndo: historical });
  return result.ok
    ? { ...result, id: Number(target.id), from_date: u.from_date, from_time: u.from_time }
    : result;
}

/* ↩ 연기 되돌리기 — 원래 시각에 «같은 수업» 이 이미 열려 있을 때 (2026-11-08)
   POST /api/admin/class-schedules/:id { action:'undo_move', from_date, held:true }
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 사장님·매니저 Mai 재요청 «undo postponement even though the time has passed». 운영 D1 실측(2026-11-08):
        11/04 18:03 카페24 미러 수업 #7730(11/04 20:00)을 11/11 로 연기 → 18:15 미러가 같은 예약(c24:519537)을 11/04 20:00 에
        #7772 로 다시 만들었고 카페24 출석은 present — 수업은 «원래 시각에 열렸다». 그런데 원래 날짜에는 «다른 날로 옮김 —
        이 날은 수업 없음» 이 거짓으로 남았고, 11/06 에 둔 «수업 복원 · 11/11» 은 한 수업을 «두 번» 연다(Mai 가 눌렀다가 1분 뒤 다시 취소).
   [무엇] 새 수업을 열지 않는다(지난 시각에 «예정» 수업을 만들지 않는 선 — PR #2109 — 그대로).
        ① 옮겨 간 사본이 아직 시작 전 active 면 «취소»(미러 행이면 'c24-mirror:manual' 도장 — DELETE 와 같은 이유: 미러가 «사람 손» 으로 본다)
           + 'remove' 기록(사본 날짜 — 그 날 «✕ 취소됨» 칸에 누가·왜가 실린다). 사본이 이미 취소면 행은 그대로.
        ② 'restore' 기록(source=HELD_UNDO_SOURCE, lesson_date = 원래 날짜) → loadMovedAwayEvents 가 그 날 «옮겨 감» 줄을 지운다
           (관리자 «오늘 수업»·주간 시간표·강사 달력이 같은 정본을 읽어 함께 사라진다).
   ⛔ 원래 자리의 열린 수업(held)·출석·결제·급여 기록은 건드리지 않는다.
   🔒 판정은 judgeMovedAwayUndo(…, heldId) 한 곳 — «오늘 수업» 버튼과 같은 함수·같은 근거(loadLiveDatedSlots·heldIdFor).
   🔒 모르면 막는다 — 열린 수업 조회 실패는 lookup_failed(503).
   🔒 읽은 뒤 바뀌면(사본·열린 수업·사본 방 출석) batch 첫 문장의 CHECK 가 전체를 되돌린다(이동 엔진과 같은 가드 표).
   감시: test-harness/class_undo_move_harness.mjs H절·E19~ */
const HELD_REASON = 'Undo postponement (연기 되돌리기) — class held at the original time (원래 시각에 수업이 열림)';

export async function undoHeldMove(env: any, actor: any, scheduleId: number, fromDate: any, nowMs: number = Date.now()) {
  if (!actor?.ok) return fail(401, 'auth_required', 'Please sign in again.');
  const got = await resolveMovedAway(env, scheduleId, fromDate);
  if ('ok' in got) return got;
  const { row, child, ch, from } = got;
  const slots = await loadLiveDatedSlots(env.DB, from, [row.user_id]);
  if (!slots) return fail(503, 'lookup_failed', 'Could not check the class at the original time right now. Please try again shortly.');
  const heldId = heldIdFor(slots, from, ch.from_time, row.user_id, row.teacher_id, row.id);
  const u = judgeMovedAwayUndo(row, ch, child, nowMs, heldId);
  if (!u || u.held_available !== true || !u.held_id)
    return fail(409, 'held_not_available', 'The class at the original time is no longer there, or this postponement has changed. Refresh the list.');
  const copyActive = u.held_copy_status === 'active';
  const heldRowId = u.held_id;
  try {
    await ensureScheduleMoveGuard(env);
    await ensureClassAuditTable(env);
    /* 사본 방 출석 — 사본을 «취소» 할 때만 본다(이미 취소된 사본은 행을 안 바꾼다). 방 이름은 이동 엔진과 같은 규칙 + 방 지정. */
    const exists = async (t: string) => !!(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(t).first());
    const rooms = [`class-${row.id}`, `class-${row.id}-${String(row.scheduled_date || '').replace(/-/g, '')}`];
    if (copyActive && await exists('class_room_override')) {
      const ov: any = await env.DB.prepare(`SELECT room_id FROM class_room_override WHERE schedule_id = ?`).bind(row.id).all();
      for (const r of ((ov?.results as any[]) || [])) if (r && r.room_id) rooms.push(String(r.room_id));
    }
    const attSql = copyActive && await exists('attendance')
      ? `(SELECT COUNT(*) FROM attendance WHERE room_id IN (SELECT value FROM json_each(?)) AND status <> 'scheduled')` : null;
    if (attSql) {
      const n: any = await env.DB.prepare(`SELECT ${attSql} AS n`).bind(JSON.stringify(rooms)).first();
      if (Number(n?.n) > 0) return fail(409, 'class_already_attended', 'The moved class already has attendance records. Ask head office to check its history.');
    }
    const verSql = `(SELECT json_array(status, scheduled_date, start_time, updated_at, source, teacher_id, user_id) FROM class_schedules WHERE id = ?)`;
    const copyVer: any = await env.DB.prepare(`SELECT ${verSql} AS v`).bind(row.id).first();
    const heldVer: any = await env.DB.prepare(`SELECT ${verSql} AS v`).bind(heldRowId).first();
    if (!copyVer || copyVer.v == null || !heldVer || heldVer.v == null) return fail(409, 'schedule_changed', 'The class changed while checking. Refresh the list.');
    let teacherName: string | null = null;
    try { const t: any = await env.DB.prepare(`SELECT name FROM teachers WHERE CAST(id AS TEXT) = CAST(? AS TEXT) LIMIT 1`).bind(row.teacher_id ?? '').first(); teacherName = t && t.name ? String(t.name) : null; } catch { /* 이름은 기록 보조 — 없어도 된다 */ }

    const now = Math.max(nowMs, (Number(row.updated_at) || 0) + 1);
    const token = crypto.randomUUID();
    const guardArgs: any[] = [token, row.id, copyVer.v, heldRowId, heldVer.v];
    if (attSql) guardArgs.push(JSON.stringify(rooms));
    const statements = [env.DB.prepare(`INSERT INTO schedule_move_guard(token, valid) SELECT ?, CASE WHEN ${verSql} = ? AND ${verSql} = ?${attSql ? ` AND ${attSql} = 0` : ''} THEN 1 ELSE 0 END`).bind(...guardArgs)];
    const who = actor.name || actor.username || '관리자';
    const audit = `INSERT INTO class_audit_log (action, schedule_id, teacher_name, student_name, lesson_date, lesson_time, actor, actor_role, source, detail, reason, created_at) VALUES (?,?,?,?,?,?,?,'admin',?,?,?,?)`;
    if (copyActive) {
      statements.push(env.DB.prepare(`UPDATE class_schedules SET status = 'cancelled', source = CASE WHEN source = 'c24-mirror' THEN 'c24-mirror:manual' ELSE source END, updated_at = ? WHERE id = ?`).bind(now, row.id));
      statements.push(env.DB.prepare(audit).bind('remove', row.id, teacherName, row.student_name || null, row.scheduled_date || null, row.start_time || null, who, 'ui',
        JSON.stringify({ held_undo: true, held_id: heldRowId, from_date: u.from_date, from_time: u.from_time }), HELD_REASON, now));
    }
    statements.push(env.DB.prepare(audit).bind('restore', row.id, teacherName, row.student_name || null, u.from_date, u.from_time, who, HELD_UNDO_SOURCE,
      JSON.stringify({ undo_move: true, held_at_original: true, held_id: heldRowId, copy_date: row.scheduled_date || null, copy_time: row.start_time || null, copy_status_before: u.held_copy_status, resulting_status: 'cancelled' }),
      HELD_REASON, now));
    statements.push(env.DB.prepare(`DELETE FROM schedule_move_guard WHERE token = ?`).bind(token));
    const results = await env.DB.batch(statements);
    if (!Array.isArray(results) || results.some((r: any) => !r || r.success === false)) throw new Error('held_undo_batch_failed');
    return { ok: true as const, status: 200, id: Number(row.id), from_date: u.from_date, from_time: u.from_time, held_id: heldRowId, copy_cancelled: copyActive };
  } catch (e: any) {
    return /schedule_move_snapshot/.test(String(e?.message || e))
      ? fail(409, 'schedule_changed', 'The class changed while checking. Refresh the list.')
      : fail(503, 'move_failed', 'Could not save right now. Please refresh and try again.');
  }
}
