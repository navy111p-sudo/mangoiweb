/** A weekly postponement moves the remaining dated series as one request.
 * Counts and schedule IDs are preserved; extending the last date is not a bonus lesson.
 * Mirror/undated series cannot be safely inferred, so they fail before saving a request.
 */
import { planSeries, addDays, normDate, normTime } from './class-series-move';
import { findScheduleMoveConflicts, loadScheduleMoveFacts, longClassCapFor } from './schedule-conflict';

export const WEEKLY_POSTPONE = 'weekly_postpone';
const version = (r: any) => JSON.stringify(['id','user_id','teacher_id','scheduled_date','start_time',
  'duration_min','status','source','updated_at','schedule_kind','starts_on','day_of_week'].map(k => r[k] ?? null));

export function weeklyPostponePlan(anchor: any, rows: any[]) {
  const date = normDate(anchor?.scheduled_date);
  if (!date) return { ok: false, error: 'weekly_row', items: [], snapshot: '' };
  const plan = planSeries(anchor, rows, addDays(date, 7), normTime(anchor.start_time));
  if (!plan.ok) return { ...plan, snapshot: '' };
  const all = new Map([anchor, ...rows].map(r => [String(r.id), r]));
  const items = plan.items.slice().sort((a,b) => a.id - b.id);
  return { ...plan, items, snapshot: JSON.stringify(items.map(it => ({ ...it, version: version(all.get(String(it.id))) }))) };
}

export async function readWeeklyPostponePlan(env: any, anchor: any) {
  const result = await env.DB.prepare(`SELECT * FROM class_schedules WHERE user_id = ? AND status = 'active' ORDER BY id`)
    .bind(anchor.user_id).all();
  if (result?.success === false || !Array.isArray(result?.results)) throw new Error('series_lookup_failed');
  return { ...weeklyPostponePlan(anchor, result.results), rows: result.results };
}

/** Caller captures request/schedule guards BEFORE this read and commits the returned
 * statements WITH the request decision in commitScheduleRequestDecision. */
export async function prepareWeeklyPostpone(env: any, request: any, anchor: any, now: number) {
  if (request.request_type !== 'postpone' || request.new_teacher_id)
    return { ok: false, error: 'invalid_weekly_postpone', mutations: [] };
  const plan = await readWeeklyPostponePlan(env, anchor);
  if (!plan.ok) return { ...plan, mutations: [] };
  if (!request.series_snapshot || request.series_snapshot !== plan.snapshot)
    return { ok: false, error: 'series_changed', mutations: [] };
  const anchorItem = plan.items.find(it => String(it.id) === String(anchor.id));
  if (!anchorItem || request.new_date !== anchorItem.to_date || request.new_time !== anchorItem.to_time)
    return { ok: false, error: 'invalid_weekly_postpone', mutations: [] };
  const ids = plan.items.map(it => it.id);
  const facts = await loadScheduleMoveFacts(env, anchor);
  const teachers = await env.DB.prepare('SELECT id, name FROM teachers').all();
  if (teachers?.success === false || !Array.isArray(teachers?.results)) throw new Error('teacher_lookup_failed');
  const names = new Map(teachers.results.map((t: any) => [String(t.id), String(t.name || '')]));
  const targets = plan.items.map(it => ({ ...plan.rows.find((r: any) => String(r.id) === String(it.id)),
    scheduled_date: it.to_date, start_time: it.to_time }));
  for (const target of targets) {
    if (!names.has(String(target.teacher_id))) return { ok: false, error: 'teacher_not_found', mutations: [] };
    const conflict = await findScheduleMoveConflicts(env, target, String(names.get(String(target.teacher_id))), ids, facts);
    if (conflict) return { ...conflict, ok: false, mutations: [] };
    if (Number(target.duration_min) > 20) {
      const cap = await longClassCapFor(env, String(target.teacher_id));
      const after = facts.rows.filter(r => !ids.includes(Number(r.id))).concat(targets);
      const longCount = after.filter(r => String(r.teacher_id) === String(target.teacher_id)
        && r.scheduled_date === target.scheduled_date && Number(r.duration_min) > 20).length;
      if (cap > 0 && longCount > cap) return { ok: false, error: 'long_class_capacity', mutations: [] };
    }
    const internal = await findScheduleMoveConflicts(env, target, String(names.get(String(target.teacher_id))), [target.id],
      { ...facts, rows: targets.filter(t => t.id !== target.id) });
    if (internal) return { ...internal, ok: false, mutations: [] };
  }
  const mutations = targets.map(target => env.DB.prepare(`UPDATE class_schedules SET scheduled_date = ?, start_time = ?, updated_at = ? WHERE id = ?`)
    .bind(target.scheduled_date, target.start_time, Math.max(now, (Number(target.updated_at) || 0) + 1), target.id));
  return { ok: true, error: '', mutations, items: plan.items };
}
