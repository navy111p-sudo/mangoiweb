/* ═══════════════════════════════════════════════════════════════════════
   🔁 매주 반복 수업의 «그 주 하루만» 연기·변경 (2026-10-09 사장님 「반복 수업 그 주 하루만 연기 기능 만들어줘」)
   ───────────────────────────────────────────────────────────────────────
   [왜] 반복 수업(scheduled_date 없음)은 한 줄이 «매주 전부» 라, 연기·변경을 승인해도
        applied='recorded'(기록만)로 끝났다. 관리자가 반려하고 하루짜리 수업을 손으로 넣어야 했다.
   [무엇] 반복 줄은 그대로 두고 «그 날짜 하나만» 빠지게 한다 — class_schedules.skip_dates.
          · 새 일시가 있으면 → 그 일시에 «하루짜리 새 줄» 을 만든다(보강, source='recurring-week:<원래 id>').
          · 새 일시가 없으면(단순 연기) → 원래 날짜·시각에 status='postponed' 인 하루짜리 기록 줄을 만든다.
            (날짜 지정 수업의 연기와 같은 모양 — 급여 postponed_pay_percent·연기 숨김·다시 잡기가 그대로 동작한다.)
   🔒 읽는 쪽은 정본 recurStartedOn(src/class-start-date.ts)이 skip_dates 를 보므로 학생 입장·강사 화면·
      알림·결석 감지·지금 수업·겹침 검사가 한 번에 따라온다. 급여는 recurSkippedOn 으로 그날을 안 센다.
   ⛔ 반복 줄의 updated_at 은 안 올린다 — 올리면 «다른 주» 의 대기 요청이 전부 schedule_changed 로 막힌다.
      동시성은 /decide 의 CHECK guard(unchangedRow — skip_dates 포함)가 막는다.
   ⛔ 새 줄의 source 를 원래 줄(adm-enroll:<id>)과 같게 두지 말 것 — 수강 확정 백필이 그 source 로
      «이미 만든 날짜» 를 세어 회차가 어긋난다.
   ⛔ 이 함수는 판정·문장 준비만 한다 — 저장은 부르는 쪽이 commitScheduleRequestDecision 으로 한 batch 에.
   감시: test-harness/recurring_one_week_harness.mjs
   ═══════════════════════════════════════════════════════════════════════ */
import { WEEKLY_POSTPONE } from './weekly-postpone';
import { splitDowList, kstToday } from './schedule-split';
import { normSkipDates, recurStartedOn } from './class-start-date';
import { scheduleMoveVersion } from './class-schedule-move';
import { findScheduleConflicts, findScheduleMoveConflicts } from './schedule-conflict';
import { MIRROR_SOURCE } from './c24-mirror';
import { DEFAULT_CLASS_MINUTES } from './class-policy';

export const RECUR_WEEK_SOURCE_PREFIX = 'recurring-week:';
/** 이 사유면 «예전 동작(기록만)» 으로 떨어진다 — 옛 요청은 회차 날짜·접수 스냅샷이 없다. */
export const ONE_WEEK_FALLBACK = ['no_orig_date', 'no_snapshot'];
export const RECUR_SKIP_MAX = 120;   // 한 줄에 쌓일 «빠지는 날» 상한(폭주 방지)

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
function validYmd(s: any): boolean {
  const t = String(s ?? '');
  if (!YMD.test(t)) return false;
  const d = new Date(t + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === t;
}
function dowOfYmd(ymd: string): number { return new Date(ymd + 'T00:00:00Z').getUTCDay(); }

/** 순수 판정 — 이 요청을 «그 주 하루만» 으로 반영할 수 있나. null 이면 가능, 아니면 사유 코드.
 *  'not_recurring'·'no_orig_date'·'no_snapshot' 은 «예전 동작(기록만)» 으로 떨어뜨려도 되는 사유다. */
export function oneWeekEligible(row: any, cs: any, today: string): string | null {
  if (!row || !cs) return 'schedule_not_found';
  if (cs.scheduled_date) return 'not_recurring';
  if (row.request_scope === WEEKLY_POSTPONE) return 'weekly_scope';
  if (!row.orig_date) return 'no_orig_date';
  if (!row.schedule_snapshot) return 'no_snapshot';
  if (row.schedule_snapshot !== scheduleMoveVersion(cs)) return 'schedule_changed';
  if (String(cs.status || 'active') !== 'active') return 'schedule_not_movable';
  if (String(cs.source || '') === MIRROR_SOURCE) return 'mirror_recurring';
  const orig = String(row.orig_date);
  if (!validYmd(orig)) return 'bad_orig_date';
  if (orig < today) return 'orig_date_past';
  if (!splitDowList(cs.day_of_week).includes(dowOfYmd(orig))) return 'orig_not_class_day';
  /* 시작 전이거나 이미 빠진 날 — recurStartedOn 이 둘 다 false 로 답한다. */
  if (!recurStartedOn(cs, orig)) return 'orig_not_open';
  if (normSkipDates(cs.skip_dates).length >= RECUR_SKIP_MAX) return 'too_many_skips';
  const hasNew = !!(row.new_date || row.new_time);
  if (hasNew) {
    if (!validYmd(row.new_date) || !HM.test(String(row.new_time || ''))) return 'bad_new_date_time';
    if (String(row.new_date) < today) return 'new_date_past';
  } else if (row.request_type === 'change') return 'new_date_time_required_for_change';
  return null;
}

/** 사유 코드 → 사람이 읽는 말(관리자 화면 409 용). */
export function oneWeekMessage(code: string): { ko: string; en: string } {
  const M: Record<string, [string, string]> = {
    schedule_changed: ['요청 후 수업이 변경되었습니다. 반려 후 최신 시간표에서 다시 요청해 주세요.', 'The class changed after this request. Reject it, then submit a fresh request.'],
    schedule_not_movable: ['이 반복 수업은 지금 진행 중인 수업이 아니라 옮길 수 없습니다.', 'This weekly class is not active, so it cannot be moved.'],
    mirror_recurring: ['카페24에서 온 수업은 여기서 옮길 수 없습니다. 시간표에서 직접 조정해 주세요.', 'Cafe24 classes cannot be moved here. Please adjust them in the timetable.'],
    bad_orig_date: ['연기할 날짜가 올바르지 않습니다.', 'The class date to postpone is invalid.'],
    orig_date_past: ['이미 지난 날짜의 수업은 옮길 수 없습니다.', 'A class on a past date cannot be moved.'],
    orig_not_class_day: ['그 날짜는 이 반복 수업이 있는 요일이 아닙니다.', 'That date is not a class day for this weekly class.'],
    orig_not_open: ['그 날짜에는 이 수업이 열리지 않습니다(시작 전이거나 이미 옮긴 날).', 'This class does not run on that date (not started yet or already moved).'],
    too_many_skips: ['이 반복 수업에 옮긴 날이 너무 많습니다. 시간표에서 정리해 주세요.', 'Too many moved dates on this weekly class. Please tidy the timetable.'],
    bad_new_date_time: ['새 날짜·시각이 올바르지 않습니다.', 'The new date or time is invalid.'],
    new_date_past: ['새 날짜가 이미 지났습니다.', 'The new date is in the past.'],
    new_date_time_required_for_change: ['변경에는 새 날짜·시각이 필요합니다.', 'A change needs a new date and time.'],
    conflict: ['요청한 시간이 다른 수업과 겹칩니다. 다른 시간을 골라 주세요.', 'The requested time overlaps another class. Choose another time.'],
    teacher_unavailable: ['그 시간은 강사의 근무불가 또는 휴가 시간입니다.', 'The teacher is unavailable or on leave at that time.'],
  };
  const m = M[code] || ['확인하지 못해 옮기지 않았습니다. 새로고침 후 다시 시도해 주세요.', 'It could not be verified, so nothing was moved. Refresh and try again.'];
  return { ko: m[0], en: m[1] };
}

export type OneWeekPlan = {
  ok: boolean; error: string | null; status: number;
  applied: 'moved' | 'postponed' | null;
  mutations: any[];
  conflict?: any;
};

/** 판정 + 겹침 검사 + 저장 문장 준비. 던지지 않는다(조회 실패는 { ok:false, error:'availability_unknown' }).
 *  opts.teacherId: 옮긴 하루짜리 줄의 담당 강사(강사 변경이 허락됐을 때만 다른 값). 기본 = 원래 강사. */
export async function prepareRecurringOneWeek(env: any, row: any, cs: any, now: number,
  opts: { teacherId?: string | null; actor?: string; today?: string } = {}): Promise<OneWeekPlan> {
  const today = opts.today || kstToday(now);
  const why = oneWeekEligible(row, cs, today);
  if (why) return { ok: false, error: why, status: 409, applied: null, mutations: [] };
  const orig = String(row.orig_date);
  const skips = normSkipDates(cs.skip_dates);
  skips.push(orig);
  const nextSkips = normSkipDates(skips.join(',')).join(',');
  const dur = Number(cs.duration_min) > 0 ? Number(cs.duration_min) : DEFAULT_CLASS_MINUTES;
  const actor = String(opts.actor || 'schedule-request').slice(0, 80);
  const tag = `${RECUR_WEEK_SOURCE_PREFIX}${cs.id}`;
  const mutations: any[] = [
    env.DB.prepare(`UPDATE class_schedules SET skip_dates = ? WHERE id = ? AND scheduled_date IS NULL`).bind(nextSkips, cs.id),
  ];
  try {
    if (row.new_date && row.new_time) {
      const tid = String(opts.teacherId ?? cs.teacher_id ?? '');
      const newDate = String(row.new_date), newTime = String(row.new_time);
      const target = { ...cs, id: null, scheduled_date: newDate, start_time: newTime, teacher_id: tid, skip_dates: null };
      const tt: any = await env.DB.prepare(`SELECT name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`).bind(tid).first();
      /* 원래 반복 줄은 «옮기는 바로 그 날» 에만 빠진다 — 다른 날로 옮기면 그날의 반복 줄과 겹칠 수 있으니 제외하지 않는다. */
      const exclude = newDate === orig ? [cs.id] : [];
      const strict = await findScheduleMoveConflicts(env, target, String(tt?.name || ''), exclude);
      if (strict) return { ok: false, error: strict.error || 'conflict', status: strict.status || 409, applied: null, mutations: [], conflict: strict };
      const conf = await findScheduleConflicts(env, {
        kind: 'one_off', userId: cs.user_id, teacherId: tid,
        schedDate: newDate, startTime: newTime, durationMin: dur,
        excludeId: newDate === orig ? cs.id : undefined,
      } as any, { student: [], teacher: [] });
      if (conf.has) return { ok: false, error: 'conflict', status: 409, applied: null, mutations: [], conflict: { ko: conf.ko, en: conf.en } };
      /* 하루짜리는 «정규» 가 아니다(수업 종류 정본 — 정규=매주). 체험·레벨은 그대로 둔다. */
      const ct = String(cs.class_type || 'regular') === 'regular' ? 'makeup' : String(cs.class_type);
      const endMk = String(row.end_makeup ?? '').trim();
      const note = `반복수업 ${orig} 회차를 옮김(원래 #${cs.id})` + (endMk ? ` · ${endMk}` : '');
      mutations.push(env.DB.prepare(
        `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, updated_at, notes)
         VALUES (?, ?, 'dated', ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
      ).bind(cs.user_id, cs.student_name || null, ct, String(dowOfYmd(newDate)), newDate, newTime, dur, tid || null, tag, actor, now, now, note));
      return { ok: true, error: null, status: 200, applied: 'moved', mutations };
    }
    /* 단순 연기 — 그날 그 시각의 «연기» 기록 줄. 숨김·급여·나중에 다시 잡기는 날짜 지정 연기와 같다. */
    const note = `반복수업 ${orig} 회차 연기(원래 #${cs.id})`;
    mutations.push(env.DB.prepare(
      `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, updated_at, notes)
       VALUES (?, ?, 'dated', ?, ?, ?, ?, ?, ?, 'postponed', ?, ?, ?, ?, ?)`
    ).bind(cs.user_id, cs.student_name || null, String(cs.class_type || 'regular'), String(dowOfYmd(orig)), orig, String(cs.start_time || ''), dur,
      cs.teacher_id ?? null, tag, actor, now, now, note));
    return { ok: true, error: null, status: 200, applied: 'postponed', mutations };
  } catch (e: any) {
    console.warn('[recurring-one-week] 확인 실패 — 옮기지 않음:', e?.message || e);
    return { ok: false, error: 'availability_unknown', status: 503, applied: null, mutations: [] };
  }
}
