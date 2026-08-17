/**
 * duration-change-queue.ts — 📅 수업 «길이 변경» 신청함 (2026-08-17)
 *
 * 왜 필요한가 —
 *   30분 수업을 열고 나서 생긴 문제. 5시 학생이 20분 → 30분으로 바꾸면
 *   그 뒤 학생들 시작 시각이 줄줄이 10분씩 밀린다. 아무 때나 바꾸게 하면
 *   시간표가 매일 흔들리고, 밀린 학부모에게서 항의가 들어온다.
 *
 *   그래서 «신청은 상시 · 반영은 월 1회» 로 나눈다:
 *     ① 학부모·강사·관리자가 길이 변경을 신청하면 여기에 쌓인다(pending)
 *     ② 매달 1일, 관리자가 화면에서 「이번 달 반영」을 누르면 한꺼번에 적용된다
 *   중간에 흔들리지 않으니 뒷사람이 밀리는 일이 «한 달에 한 번» 으로 모인다.
 *
 * ⚠️ 적용은 반드시 «미리보기 → 실행» 두 걸음이다.
 *   길이를 바꾸면 겹침·정원에 걸릴 수 있는데, 그걸 모르고 일괄 실행하면
 *   수십 건이 조용히 실패하거나 조용히 겹친 채로 저장된다.
 *   그래서 dryRun 으로 «몇 건이 되고 몇 건이 왜 안 되는지» 를 먼저 보여 준다.
 *
 * ⚠️ 판정을 여기서 새로 짜지 않는다 — 겹침·정원은 schedule-conflict.ts 한 곳이 정본이다.
 */
import { json, parseJsonBody } from './api-util';
import { checkAdminSession } from './auth-admin';
import { writeClassAudit } from './class-audit';
import { findScheduleConflicts, toDow } from './schedule-conflict';
import { DEFAULT_CLASS_MINUTES, isAllowedClassMinutes } from './class-policy';

export type DurationChangeStatus = 'pending' | 'applied' | 'cancelled' | 'failed';

/** KST 기준 'YYYY-MM' (반영 회차를 가르는 기준) */
export function kstMonth(now = Date.now()): string {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 7);
}

export async function ensureDurationQueueTable(env: any): Promise<void> {
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS class_duration_requests (` +
    `id INTEGER PRIMARY KEY AUTOINCREMENT, ` +
    `schedule_id INTEGER NOT NULL, ` +
    `user_id TEXT, student_name TEXT, teacher_id TEXT, ` +
    `from_minutes INTEGER, to_minutes INTEGER NOT NULL, ` +
    `status TEXT NOT NULL DEFAULT 'pending', ` +
    `requested_by TEXT, requested_role TEXT, reason TEXT, ` +
    `applied_month TEXT, applied_at INTEGER, applied_by TEXT, fail_reason TEXT, ` +
    `created_at INTEGER NOT NULL, updated_at INTEGER)`
  );
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_cdr_status ON class_duration_requests(status, created_at)`); } catch {}
  // ⚠️ 같은 수업에 대기 신청이 두 건이면 «마지막 것» 이 뭔지 모호해진다 — 한 건만 남긴다
  try { await env.DB.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cdr_one_pending ON class_duration_requests(schedule_id) WHERE status = 'pending'`); } catch {}
}

/* ═══════════════ 순수 판정 (하니스가 이 함수들을 추출해 검증) ═══════════════ */

/** 신청이 말이 되는가 — 화면·API 어디서 불러도 같은 답이 나와야 한다 */
export function validateDurationRequest(fromMinutes: any, toMinutes: any): { ok: boolean; error?: string } {
  const to = Number(toMinutes);
  if (!isAllowedClassMinutes(to)) return { ok: false, error: 'bad_minutes' };
  const from = Number(fromMinutes) > 0 ? Number(fromMinutes) : DEFAULT_CLASS_MINUTES;
  if (from === to) return { ok: false, error: 'same_minutes' };
  return { ok: true };
}

/**
 * 반영해도 되는 달인가.
 *   규칙은 «매달 1일에 그 달치를 반영» 이다. 같은 달에 두 번 반영하면
 *   두 번째는 반영할 것이 없거나(이미 처리) 그 달에 새로 들어온 신청까지
 *   앞당겨 반영해 «월 1회» 라는 약속이 깨진다.
 */
export function canApplyMonth(alreadyAppliedMonth: string | null | undefined, targetMonth: string): boolean {
  if (!targetMonth) return false;
  return String(alreadyAppliedMonth || '') !== targetMonth;
}

/* ═══════════════ 적용 ═══════════════ */

export interface ApplyOneResult {
  id: number; schedule_id: number; student_name: string | null;
  from_minutes: number; to_minutes: number;
  ok: boolean; reason?: string; reason_en?: string;
}

/**
 * 대기 중인 신청을 한 건씩 검사(+선택적 적용)한다.
 *   dryRun=true 면 DB 를 건드리지 않고 «되는지/왜 안 되는지» 만 돌려준다 — 미리보기용.
 *   판정은 findScheduleConflicts 가 한다(겹침 + 긴 수업 정원 둘 다).
 */
export async function applyPendingDurationChanges(
  env: any, opts: { dryRun: boolean; actor?: string; month?: string; force?: boolean }
): Promise<{ ok: boolean; month: string; total: number; applied: ApplyOneResult[]; blocked: ApplyOneResult[] }> {
  await ensureDurationQueueTable(env);
  const month = opts.month || kstMonth();
  const now = Date.now();

  const rs: any = await env.DB.prepare(
    `SELECT r.id, r.schedule_id, r.user_id, r.student_name, r.teacher_id, r.from_minutes, r.to_minutes,
            s.day_of_week, s.scheduled_date, s.schedule_kind, s.start_time,
            s.duration_min AS cur_minutes, s.teacher_id AS cur_teacher, s.status AS sched_status
       FROM class_duration_requests r
       LEFT JOIN class_schedules s ON s.id = r.schedule_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC LIMIT 500`
  ).all();

  const applied: ApplyOneResult[] = [];
  const blocked: ApplyOneResult[] = [];

  for (const row of ((rs?.results as any[]) || [])) {
    const base: ApplyOneResult = {
      id: Number(row.id), schedule_id: Number(row.schedule_id),
      student_name: row.student_name || null,
      from_minutes: Number(row.cur_minutes) || Number(row.from_minutes) || DEFAULT_CLASS_MINUTES,
      to_minutes: Number(row.to_minutes),
      ok: false,
    };

    // 신청 후 수업이 사라졌거나 종료됐을 수 있다 — 그대로 적용하면 유령 행이 생긴다
    if (row.sched_status == null) {
      blocked.push({ ...base, reason: '수업을 찾을 수 없습니다(삭제된 것 같습니다).', reason_en: 'Schedule not found.' });
      continue;
    }
    if (String(row.sched_status) !== 'active') {
      blocked.push({ ...base, reason: `수업이 «${row.sched_status}» 상태라 건너뜁니다.`, reason_en: `Schedule is ${row.sched_status}.` });
      continue;
    }
    if (Number(row.cur_minutes) === Number(row.to_minutes)) {
      blocked.push({ ...base, reason: '이미 그 길이입니다.', reason_en: 'Already that length.' });
      continue;
    }

    const kind: 'recurring' | 'one_off' = row.scheduled_date ? 'one_off' : 'recurring';
    const days = kind === 'recurring'
      ? String(row.day_of_week ?? '').split(/[,\s]+/).map(toDow).filter((n): n is number => n != null)
      : [];

    // ⚠️ excludeId 를 반드시 넘긴다 — 자기 자신과 겹친다고 스스로를 막으면 아무것도 못 바꾼다
    const conf = await findScheduleConflicts(env, {
      kind, userId: row.user_id, teacherId: row.cur_teacher || row.teacher_id,
      days, schedDate: row.scheduled_date || null,
      startTime: String(row.start_time || ''),
      durationMin: Number(row.to_minutes),
      excludeId: row.schedule_id,
    });
    if (conf.has && !opts.force) {
      blocked.push({ ...base, reason: conf.ko, reason_en: conf.en });
      continue;
    }

    if (!opts.dryRun) {
      await env.DB.prepare(`UPDATE class_schedules SET duration_min = ?, updated_at = ? WHERE id = ?`)
        .bind(Number(row.to_minutes), now, row.schedule_id).run();
      await env.DB.prepare(
        `UPDATE class_duration_requests SET status='applied', applied_month=?, applied_at=?, applied_by=?, updated_at=? WHERE id = ?`
      ).bind(month, now, opts.actor || 'admin', now, row.id).run();
      await writeClassAudit(env, {
        action: 'reschedule', schedule_id: row.schedule_id,
        student_name: row.student_name, lesson_time: row.start_time,
        actor: opts.actor || 'admin', actor_role: 'admin', source: 'duration-monthly',
        reason: `수업 길이 ${base.from_minutes}분 → ${base.to_minutes}분 (${month} 일괄 반영)`,
        detail: JSON.stringify({ from: base.from_minutes, to: base.to_minutes, month, forced: !!opts.force }),
      });
    }
    applied.push({ ...base, ok: true });
  }

  return { ok: true, month, total: applied.length + blocked.length, applied, blocked };
}

/* ═══════════════ 라우트 ═══════════════ */

export async function handleDurationQueue(request: Request, env: any, path: string, method: string): Promise<Response | null> {
  if (!path.startsWith('/api/admin/duration-requests')) return null;

  const sess = await checkAdminSession(request, env);
  if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
  const actor = String((sess as any).username || 'admin');

  // 대기 목록
  if (path === '/api/admin/duration-requests' && method === 'GET') {
    await ensureDurationQueueTable(env);
    const status = new URL(request.url).searchParams.get('status') || 'pending';
    const rs: any = await env.DB.prepare(
      `SELECT r.*, s.start_time, s.day_of_week, s.scheduled_date, s.duration_min AS cur_minutes
         FROM class_duration_requests r LEFT JOIN class_schedules s ON s.id = r.schedule_id
        WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 300`
    ).bind(status).all();
    const last: any = await env.DB.prepare(
      `SELECT MAX(applied_month) AS m FROM class_duration_requests WHERE status='applied'`
    ).first().catch(() => null);
    const thisMonth = kstMonth();
    return json({
      ok: true, requests: (rs?.results as any[]) || [],
      this_month: thisMonth,
      last_applied_month: last?.m || null,
      can_apply_this_month: canApplyMonth(last?.m, thisMonth),
    });
  }

  // 신청 등록
  if (path === '/api/admin/duration-requests' && method === 'POST') {
    await ensureDurationQueueTable(env);
    const b = await parseJsonBody(request) || {};
    const schedId = parseInt(String(b.schedule_id || ''), 10);
    if (!schedId) return json({ ok: false, error: 'bad_params', message: 'schedule_id 가 필요합니다.' }, 400);

    const s: any = await env.DB.prepare(
      `SELECT id, user_id, student_name, teacher_id, duration_min FROM class_schedules WHERE id = ? LIMIT 1`
    ).bind(schedId).first();
    if (!s) return json({ ok: false, error: 'not_found', message: '수업을 찾을 수 없습니다.' }, 404);

    const v = validateDurationRequest(s.duration_min, b.to_minutes);
    if (!v.ok) {
      return json({
        ok: false, error: v.error,
        message: v.error === 'same_minutes' ? '지금과 같은 길이입니다.' : '고를 수 없는 수업 길이입니다.',
      }, 400);
    }
    const now = Date.now();
    try {
      await env.DB.prepare(
        `INSERT INTO class_duration_requests (schedule_id, user_id, student_name, teacher_id, from_minutes, to_minutes,
           status, requested_by, requested_role, reason, created_at, updated_at)
         VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?)`
      ).bind(schedId, s.user_id || null, s.student_name || null, s.teacher_id || null,
             Number(s.duration_min) || DEFAULT_CLASS_MINUTES, Number(b.to_minutes),
             actor, String(b.requested_role || 'admin'), String(b.reason || '').slice(0, 300) || null, now, now).run();
    } catch (e) {
      // UNIQUE 인덱스 — 같은 수업에 대기 신청이 이미 있다
      return json({ ok: false, error: 'already_pending', message: '이 수업은 이미 변경 신청이 대기 중입니다. 기존 신청을 취소한 뒤 다시 넣어 주세요.' }, 409);
    }
    return json({ ok: true, schedule_id: schedId, to_minutes: Number(b.to_minutes), applies_on: '다음 반영일(매달 1일)' });
  }

  // 신청 취소
  if (path === '/api/admin/duration-requests/cancel' && method === 'POST') {
    await ensureDurationQueueTable(env);
    const b = await parseJsonBody(request) || {};
    const id = parseInt(String(b.id || ''), 10);
    if (!id) return json({ ok: false, error: 'bad_params' }, 400);
    await env.DB.prepare(
      `UPDATE class_duration_requests SET status='cancelled', updated_at=? WHERE id = ? AND status='pending'`
    ).bind(Date.now(), id).run();
    return json({ ok: true, id });
  }

  // 미리보기 (DB 안 건드림) / 실행
  if (path === '/api/admin/duration-requests/apply' && method === 'POST') {
    const b = await parseJsonBody(request) || {};
    const dryRun = b.dry_run !== false;      // ⚠️ 기본이 미리보기 — 실수로 일괄 반영되지 않게
    const force = b.force === true;
    const month = kstMonth();

    if (!dryRun) {
      // 「월 1회」 는 이 게이트가 지킨다 — 없으면 한 달에 몇 번이고 눌린다
      const last: any = await env.DB.prepare(
        `SELECT MAX(applied_month) AS m FROM class_duration_requests WHERE status='applied'`
      ).first().catch(() => null);
      if (!canApplyMonth(last?.m, month) && !force) {
        return json({
          ok: false, error: 'already_applied_this_month',
          message: `${month} 은 이미 반영했습니다. 「월 1회」 규칙이라 다음 달에 다시 눌러 주세요.`,
          last_applied_month: last?.m || null,
        }, 409);
      }
    }
    const out = await applyPendingDurationChanges(env, { dryRun, actor, month, force });
    return json({ ...out, dry_run: dryRun });
  }

  return null;
}
