/**
 * schedule-split.ts — 📅 «매주 수업» 한 줄을 날짜별 수업으로 나누기 (2026-10-02 사장님 지시)
 *
 * [왜] class_schedules 의 반복 행(scheduled_date 가 빈 행) 하나는 «매주 전부» 를 뜻한다.
 *      그래서 «그날 하루만 연기·변경» 이 원리상 안 된다 — 승인 경로도 applied='recorded'(기록만)
 *      로 끝난다. 날짜마다 한 줄씩 있으면 기존 연기·변경 창이 그대로 동작한다.
 *
 * [기간] 사장님 결정: «수강 종료일까지, 없으면 12주».
 *      종료일은 그 수업과 «같은 시각·같은 요일» 의 수강신청에서만 가져온다.
 *      ⛔ 학생의 아무 수강신청이나 집지 않는다 — 실측(2026-10-02) jeong 은 다른 시각(금 14:20)
 *         체험 신청의 종료일 10/11 이 있어, 그것을 쓰면 주4회 19:20 수업이 9일 만에 끝난다.
 *
 * ⛔ 원본 행은 지우지 않는다 — status='cancelled' 로만 내리고 이력을 남긴다(되돌릴 수 있게).
 * ⛔ 카페24 미러 행(source 가 c24-mirror…)은 나누지 않는다 — 미러가 다시 만든다.
 * ⚠️ 같은 학생·날짜·시각이 이미 있으면 그 날은 건너뛴다(중복 방지),
 *    강사가 그 시각에 다른 수업이 있으면(uq_sched_teacher_slot) INSERT OR IGNORE 로 빠지고
 *    결과의 skipped 에 이름이 남는다 — 조용히 사라지지 않게 화면이 말한다.
 */

const DOW: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};

/** 요일 표기 세 벌(숫자 0~6 · 영문 · 한글, 쉼표 나열)을 전부 받는다. 모르면 빈 배열. */
export function splitDowList(raw: any): number[] {
  const out: number[] = [];
  for (const part of String(raw ?? '').split(/[,\s/·]+/)) {
    const t = part.trim();
    if (!t) continue;
    let n: number | undefined;
    if (/^\d+$/.test(t)) { n = Number(t); if (n > 6) n = undefined; }
    else n = DOW[t.toLowerCase()];
    if (n !== undefined && !out.includes(n)) out.push(n);
  }
  return out;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dowOf(ymd: string): number { return new Date(ymd + 'T00:00:00Z').getUTCDay(); }

export const SPLIT_DEFAULT_WEEKS = 12;
export const SPLIT_MAX_WEEKS = 26;

export interface SplitPlan {
  ok: boolean;
  reason?: string;
  from?: string;
  until?: string;
  until_source?: 'enrollment' | 'default';
  dates: string[];
}

/** 순수 함수 — DB 를 모른다. today 는 KST 'YYYY-MM-DD'. */
export function planScheduleSplit(row: any, today: string, enrollEnd: string | null): SplitPlan {
  if (!row) return { ok: false, reason: 'not_found', dates: [] };
  if (String(row.status || 'active') !== 'active') return { ok: false, reason: 'not_active', dates: [] };
  if (row.scheduled_date && String(row.scheduled_date).trim()) return { ok: false, reason: 'already_dated', dates: [] };
  if (String(row.source || '').startsWith('c24-mirror')) return { ok: false, reason: 'mirror_row', dates: [] };
  const dows = splitDowList(row.day_of_week);
  if (!dows.length) return { ok: false, reason: 'no_weekday', dates: [] };
  if (!YMD.test(today)) return { ok: false, reason: 'bad_today', dates: [] };

  const so = String(row.starts_on || '').slice(0, 10);
  const from = YMD.test(so) && so > today ? so : today;
  const cap = addDays(from, SPLIT_MAX_WEEKS * 7 - 1);
  let until: string;
  let src: 'enrollment' | 'default';
  if (enrollEnd && YMD.test(enrollEnd) && enrollEnd >= from) {
    until = enrollEnd < cap ? enrollEnd : cap;
    src = 'enrollment';
  } else {
    until = addDays(from, SPLIT_DEFAULT_WEEKS * 7 - 1);
    src = 'default';
  }
  const dates: string[] = [];
  for (let d = from; d <= until; d = addDays(d, 1)) if (dows.includes(dowOf(d))) dates.push(d);
  return { ok: true, from, until, until_source: src, dates };
}

/** 그 수업과 같은 시각·같은 요일을 담은 «살아 있는» 수강신청의 종료일. 못 찾으면 null. */
export async function findEnrollmentEnd(env: any, row: any): Promise<string | null> {
  try {
    const r: any = await env.DB.prepare(
      `SELECT end_date, days_of_week, time FROM enrollments
        WHERE student_user_id = ? AND end_date IS NOT NULL AND end_date <> ''
          AND COALESCE(status,'') NOT IN ('cancelled','canceled','refunded','rejected')`
    ).bind(String(row.user_id || '')).all();
    const rowDows = splitDowList(row.day_of_week);
    let best: string | null = null;
    for (const e of (r?.results || [])) {
      if (String(e.time || '').slice(0, 5) !== String(row.start_time || '').slice(0, 5)) continue;
      if (!splitDowList(e.days_of_week).some(d => rowDows.includes(d))) continue;
      const end = String(e.end_date).slice(0, 10);
      if (YMD.test(end) && (!best || end > best)) best = end;
    }
    return best;
  } catch (e) {
    console.warn('[schedule-split] enrollment lookup:', (e as any)?.message);
    return null;
  }
}

/** 💰 (2026-10-08 함정 대조) 급여용 — 나누기가 만든 날짜 줄의 메모(«매주 수업 #ID 을 날짜별로 나눔»)에서
    «원래 매주 줄 id → 나눈 날(KST)» 을 되찾는다. 급여는 매주 줄을 그 달 전체로 펼치는데 나누면 원본이
    cancelled 가 되어 지난 회차가 빠진다 — 그래서 급여가 «나눈 날 이전» 회차를 원래 id 그대로 센다.
    ⛔ 지난 회차를 새 id 로 다시 만들지 않는다: 노쇼·연기·지각·피드백이 전부 원래 id(class-{id}-날짜) 기준이다.
    rows: { notes, created_at } — 같은 원본을 여러 번 나눴으면 «가장 이른» 날. */
export const SPLIT_MARK = '날짜별로 나눔 @';

/** 💰 급여용 — 취소된 매주 줄이 «나눈» 것이면 나눈 날(KST)을, 아니면 null.
    ① 원본 메모의 «날짜별로 나눔 @YYYY-MM-DD»(2026-10-08 부터) ② 없으면 날짜 줄 메모로 찾은 날(그 전 나누기).
    ⛔ 그냥 취소된 매주 줄은 null — 지난 회차를 되살리지 않는다. */
export function splitPastDay(row: any, origins: Map<number, string>): string | null {
  if (!row || String(row.status || '') !== 'cancelled') return null;
  if (row.scheduled_date && String(row.scheduled_date).trim()) return null;
  const m = String(row.notes || '').match(/날짜별로 나눔 @(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return origins.get(Number(row.id)) || null;
}

export function splitOriginsFromNotes(rows: any[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const r of rows || []) {
    const all = String(r?.notes || '').match(/매주 수업 #(\d+) 을 날짜별로 나눔/g);
    if (!all || !all.length) continue;
    const m = all[all.length - 1].match(/#(\d+)/);
    const id = m ? Number(m[1]) : 0;
    const t = Number(r?.created_at);
    if (!(id > 0) || !(t > 0)) continue;
    const day = kstToday(t);
    const prev = out.get(id);
    if (!prev || day < prev) out.set(id, day);
  }
  return out;
}

export function kstToday(nowMs = Date.now()): string {
  return new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface SplitResult { ok: boolean; error?: string; plan: SplitPlan; made: number; existing: string[]; skipped: string[]; cancelled: boolean; focus_date?: string | null; focus_id?: number | null }

/** 📅 (2026-10-08 매니저 요청 «오늘 수업·학생 목록·캘린더 모두에서 연기·변경·취소») — «그 날» 의 날짜 수업 id.
    나눈 뒤(또는 이미 있던) 같은 학생·같은 시각·그 날짜의 살아 있는 행. 못 찾으면 null(지어내지 않는다). */
export async function findFocusRowId(env: any, row: any, focusDate: string): Promise<number | null> {
  if (!row || !YMD.test(String(focusDate || ''))) return null;
  try {
    const r: any = await env.DB.prepare(
      `SELECT id FROM class_schedules WHERE user_id = ? AND start_time = ? AND scheduled_date = ? AND status = 'active'
        ORDER BY id DESC LIMIT 1`
    ).bind(row.user_id, row.start_time, focusDate).first();
    return r && Number(r.id) > 0 ? Number(r.id) : null;
  } catch (e) {
    console.warn('[schedule-split] focus lookup:', (e as any)?.message);
    return null;
  }
}

/** 실행. dry 면 아무것도 안 쓴다. 새 줄이 하나도 안 생기면 원본을 내리지 않는다.
 *  focusDate 를 주면 ⛔ 그 날짜가 나눌 범위(plan.dates)에 «없을 때» 아무것도 쓰지 않고 거절한다
 *  (나눴는데 정작 그 날 수업이 없으면 «연기하려던 수업» 을 못 찾는다). */
export async function runScheduleSplit(env: any, id: number, opts: { dry: boolean; actor: string; today?: string; focusDate?: string | null }): Promise<SplitResult> {
  const row: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ? LIMIT 1`).bind(id).first();
  const today = opts.today || kstToday();
  const plan = planScheduleSplit(row, today, row ? await findEnrollmentEnd(env, row) : null);
  const focus = opts.focusDate && YMD.test(String(opts.focusDate)) ? String(opts.focusDate) : null;
  const base: SplitResult = { ok: plan.ok, error: plan.reason, plan, made: 0, existing: [], skipped: [], cancelled: false, focus_date: focus, focus_id: null };
  if (!plan.ok || !plan.dates.length) return { ...base, ok: false, error: plan.reason || 'no_dates' };
  if (opts.focusDate != null && opts.focusDate !== '' && (!focus || !plan.dates.includes(focus))) {
    return { ...base, ok: false, error: 'focus_not_in_plan' };
  }

  const ex: any = await env.DB.prepare(
    `SELECT scheduled_date FROM class_schedules WHERE user_id = ? AND start_time = ? AND status = 'active'
       AND scheduled_date BETWEEN ? AND ?`
  ).bind(row.user_id, row.start_time, plan.from, plan.until).all();
  const have = new Set((ex?.results || []).map((x: any) => String(x.scheduled_date).slice(0, 10)));
  const todo = plan.dates.filter(d => !have.has(d));
  base.existing = plan.dates.filter(d => have.has(d));
  if (opts.dry) {
    if (focus && have.has(focus)) base.focus_id = await findFocusRowId(env, row, focus);
    return base;
  }

  const now = Date.now();
  const note = (row.notes ? String(row.notes) + ' · ' : '') + '매주 수업 #' + id + ' 을 날짜별로 나눔';
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, notes)
     VALUES (?, ?, 'dated', ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`
  );
  const res = await env.DB.batch(todo.map(d => stmt.bind(
    row.user_id, row.student_name || null, row.class_type || 'regular', d, row.start_time,
    row.duration_min || 20, row.teacher_id || null, row.source || 'schedule_split', opts.actor, now, note)));
  (res as any[]).forEach((x, i) => { if (Number(x?.meta?.changes || 0) > 0) base.made++; else base.skipped.push(todo[i]); });

  if (base.made + base.existing.length === 0) return { ...base, ok: false, error: 'nothing_created' };
  /* 💰 원본에 «나눈 날» 을 적는다 — 급여가 그 날 «이전» 회차를 원래 id 로 계속 센다(splitPastDay).
     새 날짜 줄이 하나도 안 생겨도(전부 이미 있던 날) 남아야 해서 «원본» 에 적는다. */
  await env.DB.prepare(`UPDATE class_schedules SET status='cancelled', updated_at=?, notes = COALESCE(notes,'') || ? WHERE id=? AND status='active'`)
    .bind(now, ' · ' + SPLIT_MARK + today, id).run();
  base.cancelled = true;
  if (focus) base.focus_id = await findFocusRowId(env, row, focus);
  return base;
}
