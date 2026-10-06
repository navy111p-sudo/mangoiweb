/* ═══════════════════════════════════════════════════════════════════════
   ⏩ 학생 «무료 연기» 자동 승인 (2026-10-06 사장님 「2번으로 자동 연기되게 해줘」)
   ───────────────────────────────────────────────────────────────────────
   [왜] 학생이 연기 요청을 내도 관리자가 /decide 로 승인해야만 시간표가 옮겨졌다.
        승인을 안 하면 요청이 «대기» 로 남고, 다시 보내면 중복(already_pending)으로
        막혀 화면이 「저장되지 않았어요」라고만 했다(jeong #14, 10/5 22:44 대기).
   [무엇] 학생 요청 중 «아래 조건을 모두 만족하는 것» 만 접수 직후 바로 승인한다.
          나머지는 예전처럼 «대기» 로 남아 관리자가 승인한다.
   🔒 조건 (하나라도 아니면 자동 승인하지 않음 — 모르면 «대기» 쪽으로 실패)
     · 학생이 낸 «연기»(postpone) · 무료(수업 시작 30분 전보다 일찍) · 강사 변경 없음 · 연기보강 이름 없음
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

export const AUTO_POSTPONE_DECIDER = '자동승인(학생 무료 연기)';

export type AutoPostponeResult = { applied: 'moved' | 'postponed' | null; reason: string | null };

/** 순수 판정 — «자동 승인을 시도해도 되는 요청인가». 하니스가 경계값을 넣어 돌린다. */
export function autoPostponeEligible(row: any, cs: any): string | null {
  if (!row) return 'request_not_found';
  if (row.status !== 'pending') return 'not_pending';
  if (row.requester_role !== 'student') return 'not_student';
  if (row.request_type !== 'postpone') return 'not_postpone';
  if (row.fee_type !== 'free') return 'not_free';
  if (String(row.new_teacher_id ?? '').trim()) return 'teacher_change';
  if (String(row.end_makeup ?? '').trim()) return 'end_makeup';
  if (!cs) return 'schedule_not_found';
  if (!cs.scheduled_date) return 'recurring';
  if (['cancelled', 'ended', 'completed'].includes(String(cs.status || ''))) return 'schedule_not_movable';
  if (!row.schedule_snapshot || row.schedule_snapshot !== scheduleMoveVersion(cs)) return 'schedule_changed';
  const isMirror = String(cs.source || '') === MIRROR_SOURCE;
  if (row.request_scope !== WEEKLY_POSTPONE && isMirror && row.new_date
      && String(row.new_date) === String(cs.scheduled_date)) return 'mirror_same_day';
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
      const target = { ...cs, scheduled_date: String(row.new_date), start_time: String(row.new_time) };
      const tt: any = await env.DB.prepare(`SELECT name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`).bind(String(cs.teacher_id || '')).first();
      const strict = await findScheduleMoveConflicts(env, target, String(tt?.name || ''), [row.schedule_id]);
      if (strict) return { applied: null, reason: strict.error || 'conflict' };
      const conf = await findScheduleConflicts(env, {
        kind: 'one_off', userId: cs.user_id, teacherId: cs.teacher_id,
        schedDate: String(row.new_date), startTime: String(row.new_time),
        durationMin: Number(cs.duration_min) > 0 ? Number(cs.duration_min) : DEFAULT_CLASS_MINUTES,
        excludeId: row.schedule_id,
      }, { student: [], teacher: [] });
      if (conf.has) return { applied: null, reason: 'conflict' };
      /* 날짜가 바뀌는 이동은 미러 도장을 찍지 않는다(/decide 와 같은 규칙 — 옛 날짜에 유령 방지). */
      mutations.push(env.DB.prepare(`UPDATE class_schedules SET scheduled_date = ?, start_time = ?, updated_at = ? WHERE id = ?`)
        .bind(row.new_date, row.new_time, scheduleUpdatedAt, row.schedule_id));
      if (String(cs.status || '') === 'postponed') mutations.push(env.DB.prepare(REACTIVATE_POSTPONED_SQL).bind(row.schedule_id));
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
      action: 'postpone', schedule_id: row.schedule_id,
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
