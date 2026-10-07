/* ═══════════════════════════════════════════════════════════════════════
   ⏩ 학생 «무료 연기» 자동 승인 (2026-10-06 사장님 「2번으로 자동 연기되게 해줘」)
   ───────────────────────────────────────────────────────────────────────
   [왜] 학생이 연기 요청을 내도 관리자가 /decide 로 승인해야만 시간표가 옮겨졌다.
        승인을 안 하면 요청이 «대기» 로 남고, 다시 보내면 중복(already_pending)으로
        막혀 화면이 「저장되지 않았어요」라고만 했다(jeong #14, 10/5 22:44 대기).
   [무엇] 학생 요청 중 «아래 조건을 모두 만족하는 것» 만 접수 직후 바로 승인한다.
          나머지는 예전처럼 «대기» 로 남아 관리자가 승인한다.
   📌 (2026-10-07 사장님 「연기·변경 요청은 대리점 승인이 필요없어. 학생이 신청하면 즉각 반영」)
      «무료 연기만» 에서 넓혔다 — 학생이 낸 연기·변경은 유료(30분 전 이후)·강사 변경·연기보강 이름이
      있어도 즉시 반영한다. 유료 여부는 요청에 그대로 남는다(fee_type — 정산이 읽는 값, 승인과 무관).
      남는 «대기» 는 «옮길 수가 없는» 경우뿐이다 — 반복 수업·겹침·근무불가·수업이 그사이 바뀜·
      고른 강사를 못 찾음·카페24 수업의 날짜+강사 동시 변경.
   🔒 조건 (하나라도 아니면 자동 승인하지 않음 — 모르면 «대기» 쪽으로 실패)
     · 학생이 낸 «연기»(postpone) 또는 «변경»(change)
     · 날짜가 정해진 수업(scheduled_date) — 반복 수업은 승인해도 'recorded'(기록만)라 여기서 다루지 않는다
     · 접수 때 찍은 수업 스냅샷과 지금 수업이 같음
     · 카페24 미러 수업을 «같은 날짜에서 시각만» 옮기는 것은 안 함(도장 규칙 — 관리자 경로에 맡김)
   ✅ 검사·저장은 관리자 승인(/api/admin/schedule-requests/decide)과 «같은 부품» 을 쓴다
      (겹침·근무불가 검사, 매주 연기 계획, CHECK guard + D1 batch 원자 저장).
   ⛔ 이 함수는 던지지 않는다 — 실패하면 { applied:null, reason } 이고 요청은 «대기» 그대로다.
   ═══════════════════════════════════════════════════════════════════════ */
import { WEEKLY_POSTPONE, prepareWeeklyPostpone } from './weekly-postpone';
import { prepareScheduleRequestGuards, commitScheduleRequestDecision } from './schedule-request-atomic';
import { scheduleMoveVersion } from './class-schedule-move';
import { findScheduleConflicts, findScheduleMoveConflicts } from './schedule-conflict';
import { REACTIVATE_POSTPONED_SQL } from './class-postponed';
import { MIRROR_SOURCE, MIRROR_SOURCE_MANUAL } from './c24-mirror';
import { DEFAULT_CLASS_MINUTES } from './class-policy';
import { writeClassAudit } from './class-audit';
import { END_MAKEUP_MARK_SQL } from './end-makeup';

export const AUTO_POSTPONE_DECIDER = '자동승인(학생 연기·변경)';

export type AutoPostponeResult = { applied: 'moved' | 'postponed' | null; reason: string | null };

/** 순수 판정 — «자동 승인을 시도해도 되는 요청인가». 하니스가 경계값을 넣어 돌린다. */
export function autoPostponeEligible(row: any, cs: any): string | null {
  if (!row) return 'request_not_found';
  if (row.status !== 'pending') return 'not_pending';
  if (row.requester_role !== 'student') return 'not_student';
  if (row.request_type !== 'postpone' && row.request_type !== 'change') return 'not_postpone_or_change';
  if (!cs) return 'schedule_not_found';
  if (!cs.scheduled_date) return 'recurring';
  if (['cancelled', 'ended', 'completed'].includes(String(cs.status || ''))) return 'schedule_not_movable';
  if (!row.schedule_snapshot || row.schedule_snapshot !== scheduleMoveVersion(cs)) return 'schedule_changed';
  const isMirror = String(cs.source || '') === MIRROR_SOURCE;
  if (row.request_scope !== WEEKLY_POSTPONE && isMirror && row.new_date
      && String(row.new_date) === String(cs.scheduled_date)) return 'mirror_same_day';
  /* 👨‍🏫 강사 변경 — /decide 와 같은 규칙: 새 일시가 있어야 하고, 카페24 수업은 날짜를 옮기며 강사까지 못 바꾼다(옛 날짜 유령). */
  const wantTid = String(row.new_teacher_id ?? '').trim();
  if (wantTid && wantTid !== String(cs.teacher_id ?? '')) {
    if (!/^\d+$/.test(wantTid) || !(row.new_date && row.new_time) || row.request_scope === WEEKLY_POSTPONE) return 'teacher_change_invalid';
    if (isMirror && String(row.new_date) !== String(cs.scheduled_date)) return 'mirror_teacher_date';
  }
  return null;
}

export async function autoApproveStudentPostpone(env: any, requestId: number | null): Promise<AutoPostponeResult> {
  if (!requestId) return { applied: null, reason: 'no_request_id' };
  try {
    const row: any = await env.DB.prepare(`SELECT * FROM schedule_change_requests WHERE id = ? LIMIT 1`).bind(requestId).first();
    const cs: any = row && row.schedule_id
      ? await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(row.schedule_id).first()
      : null;
    const why = autoPostponeEligible(row, cs);
    if (why) return { applied: null, reason: why };

    const now = Date.now();
    const scheduleUpdatedAt = Math.max(now, (Number(cs.updated_at) || 0) + 1);
    const guards = await prepareScheduleRequestGuards(env, row, cs);
    const mutations: any[] = [];
    let applied: 'moved' | 'postponed';

    if (row.request_scope === WEEKLY_POSTPONE) {
      const weekly = await prepareWeeklyPostpone(env, row, cs, now);
      if (!weekly.ok) return { applied: null, reason: weekly.error || 'weekly_failed' };
      mutations.push(...weekly.mutations);
      applied = 'moved';
    } else if (row.new_date && row.new_time) {
      const wantTid = String(row.new_teacher_id ?? '').trim();
      const swap = !!wantTid && wantTid !== String(cs.teacher_id ?? '');
      if (swap) {
        /* 고른 강사가 재직 중인지 — 못 찾으면 옮기지도 않는다(시각만 바꾸고 «완료» 라 하면 거짓). */
        const tr: any = await env.DB.prepare(`SELECT name FROM teachers WHERE CAST(id AS TEXT) = ? AND COALESCE(active,1) = 1 LIMIT 1`).bind(wantTid).first();
        if (!tr) return { applied: null, reason: 'teacher_not_found' };
      }
      const tid = swap ? wantTid : String(cs.teacher_id || '');
      const target = { ...cs, scheduled_date: String(row.new_date), start_time: String(row.new_time), teacher_id: tid };
      const tt: any = await env.DB.prepare(`SELECT name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`).bind(tid).first();
      const strict = await findScheduleMoveConflicts(env, target, String(tt?.name || ''), [row.schedule_id]);
      if (strict) return { applied: null, reason: strict.error || 'conflict' };
      const conf = await findScheduleConflicts(env, {
        kind: 'one_off', userId: cs.user_id, teacherId: tid,
        schedDate: String(row.new_date), startTime: String(row.new_time),
        durationMin: Number(cs.duration_min) > 0 ? Number(cs.duration_min) : DEFAULT_CLASS_MINUTES,
        excludeId: row.schedule_id,
      }, { student: [], teacher: [] });
      if (conf.has) return { applied: null, reason: 'conflict' };
      /* 날짜가 바뀌는 이동은 미러 도장을 찍지 않는다(/decide 와 같은 규칙 — 옛 날짜에 유령 방지). */
      /* 카페24 수업을 같은 날짜에서 옮기면 도장(:manual) — 그 경우는 위 판정(mirror_same_day)이 이미 «대기» 로 돌렸다. */
      mutations.push(env.DB.prepare(`UPDATE class_schedules SET scheduled_date = ?, start_time = ?, updated_at = ? WHERE id = ?`)
        .bind(row.new_date, row.new_time, scheduleUpdatedAt, row.schedule_id));
      // 같은 batch(한 트랜잭션) — 강사·연기 해제·연기보강 이름이 시각과 «함께» 바뀐다(/decide 와 같은 묶음)
      if (swap) mutations.push(env.DB.prepare(`UPDATE class_schedules SET teacher_id = ? WHERE id = ?`).bind(wantTid, row.schedule_id));
      if (String(cs.status || '') === 'postponed') mutations.push(env.DB.prepare(REACTIVATE_POSTPONED_SQL).bind(row.schedule_id));
      if (String(row.end_makeup ?? '').trim()) mutations.push(env.DB.prepare(END_MAKEUP_MARK_SQL).bind(String(row.end_makeup), row.schedule_id));
      applied = 'moved';
    } else {
      const isMirror = String(cs.source || '') === MIRROR_SOURCE;
      mutations.push(env.DB.prepare(
        isMirror
          ? `UPDATE class_schedules SET status = 'postponed', source = '${MIRROR_SOURCE_MANUAL}', updated_at = ? WHERE id = ?`
          : `UPDATE class_schedules SET status = 'postponed', updated_at = ? WHERE id = ?`
      ).bind(scheduleUpdatedAt, row.schedule_id));
      applied = 'postponed';
    }

    const decision = env.DB.prepare(`UPDATE schedule_change_requests SET status = 'approved', decided_by = ?, decided_at = ?, decide_memo = ? WHERE id = ? AND status = 'pending'`)
      .bind(AUTO_POSTPONE_DECIDER, now, 'auto', requestId);
    await commitScheduleRequestDecision(env, guards, mutations, decision);

    await writeClassAudit(env, {
      action: row.request_type === 'change' ? 'reschedule' : 'postpone', schedule_id: row.schedule_id,
      teacher_name: row.teacher_name || null, student_name: row.student_name || null,
      lesson_date: row.orig_date || null, lesson_time: row.orig_time || null,
      actor: row.requester_name || row.requester_uid || '학생', actor_role: 'student',
      source: 'schedule-request-auto', reason: row.reason || null,
      detail: (row.new_date || row.new_time) ? `→ ${row.new_date || ''} ${row.new_time || ''}`.trim() + ' · 자동승인' : '자동승인',
    } as any);
    return { applied, reason: null };
  } catch (e: any) {
    console.warn('[student-auto-postpone] 자동 승인 실패 — 대기로 남김:', e?.message || e);
    return { applied: null, reason: 'apply_failed' };
  }
}
