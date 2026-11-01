import { recurSkippedOn } from './class-start-date';   // ⏭ 그 주만 빠진 날
import {
  DEFAULT_CLASS_MINUTES, isLongClass,
  DEFAULT_LONG_CLASS_DAILY_CAP, longClassCapReached,
} from './class-policy';

/**
 * schedule-conflict.ts — 수업 «겹침» + «긴 수업 하루 정원» 판정 한 곳 (2026-08-04 / 08-17)
 *
 * 왜 따로 뺐나 —
 *   일정을 만들거나 옮기는 경로가 여러 곳인데, 겹침 검사는 «예약 신규 등록» 한 곳에만 있었다.
 *   그래서 강사 요청을 관리자가 승인해 수업을 옮기거나, AI 명령으로 시간을 바꿀 때는
 *   다른 수업과 겹쳐도 아무도 막지 않았다. 같은 로직을 경로마다 복사하면 또 어긋나므로
 *   판정은 여기 한 곳에만 둔다.
 *
 * 무엇을 겹침으로 보나 —
 *   · 학생 기준: 같은 학생이 겹치는 시간에 다른 수업 → 언제나 오류(한 사람이 두 수업에 못 앉는다)
 *   · 강사 기준: 같은 강사가 겹치는 시간에 다른 수업 → 오류
 *     ⚠️ 단 «같은 시각·같은 길이» 는 여러 학생이 함께 듣는 합반이 정상적으로 만드는 모양이라 제외한다.
 *        (이걸 빼지 않으면 멀쩡한 합반 등록이 막힌다)
 *   · 시간 비교는 반개구간 [시작, 끝) — 09:00(50분) 다음 09:50 은 겹치지 않는다.
 *
 * ※ enroll-ops.ts 의 enrollConflicts() 는 «여러 날짜를 한꺼번에» 보는 등록 전용 검사기다.
 *   목적이 달라 그대로 두고, 이 모듈은 «한 건을 만들거나 옮길 때» 를 담당한다.
 */

export interface ScheduleSlotQuery {
  /** 'recurring' = 매주 반복(요일), 'one_off' = 특정 날짜 1회 */
  kind: 'recurring' | 'one_off';
  userId?: string | null;
  teacherId?: string | null;
  /** recurring 일 때: 대상 요일(0=일 … 6=토) */
  days?: number[];
  /** one_off 일 때: YYYY-MM-DD */
  schedDate?: string | null;
  startTime: string;
  durationMin: number;
  /** 자기 자신은 겹침에서 뺀다 — 기존 수업을 «옮길» 때 반드시 넘길 것 */
  excludeId?: number | string | null;
}

export interface ScheduleConflictResult {
  has: boolean;
  student: any[];
  teacher: any[];
  /** 화면에 그대로 보여줄 수 있는 사유 (한/영) */
  ko: string;
  en: string;
  /** 🪑 긴 수업(20분 초과) 하루 정원에 걸렸을 때만 채워진다. 겹침과 성격이 달라 따로 둔다 */
  cap?: { day: string; count: number; cap: number } | null;
}

const DOW_IN: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export function toMinutes(hhmm: any): number {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function toDow(v: any): number | null {
  const q = String(v ?? '').trim();
  if (!q) return null;
  if (/^\d$/.test(q)) { const n = Number(q); return (n >= 0 && n <= 6) ? n : null; }
  const x = DOW_IN[q.toLowerCase()];
  return x == null ? null : x;
}

/** 두 구간이 겹치는가 — 반개구간 [s,e) */
export function rowOverlaps(newStart: number, newEnd: number, rowStart: any, rowDur: any, fallbackDur = 30): boolean {
  const s = toMinutes(rowStart);
  const e = s + (Number(rowDur) > 0 ? Number(rowDur) : fallbackDur);
  return newStart < e && s < newEnd;
}

/* ═══════════ 🪑 긴 수업 하루 정원 (2026-08-17) ═══════════
 *   왜 겹침과 따로 두나 —
 *     겹침은 «물리적으로 불가능»(강사가 동시에 두 수업에 못 들어간다)이고,
 *     정원은 «회사가 정한 규칙»이다. 그래서 관리자 force 로는 넘길 수 있게 두고,
 *     사유 문구도 따로 낸다(무엇을 넘기는지 모르고 누르면 안 되니까).
 *   왜 30분이 아니라 «20분 초과» 를 세나 —
 *     40분도 강사 시간을 똑같이 먹는다. 30분만 세면 40분으로 그대로 빠져나간다.
 */

/** 강사 1인의 긴 수업 하루 정원 — teacher_pricing 에 값이 있으면 그것, 없으면 기본값 */
export async function longClassCapFor(env: any, teacherId: string): Promise<number> {
  if (!teacherId) return DEFAULT_LONG_CLASS_DAILY_CAP;
  try {
    const r: any = await env.DB.prepare(
      `SELECT long_class_daily_cap AS cap FROM teacher_pricing WHERE teacher_id = ? LIMIT 1`
    ).bind(String(teacherId)).first();
    const v = Number(r?.cap);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_LONG_CLASS_DAILY_CAP;
  } catch { return DEFAULT_LONG_CLASS_DAILY_CAP; }
}

/* 🟡 (2026-08-24 사장님 지시) LMS·시드 «자리표시» 행은 겹침으로 세지 않는다.
 *   class_schedules 활성 행의 대부분은 진짜 수업이 아니라 자리표시다(실측 667행 중 658행):
 *     · user_id='lms'       — 강사가 옛 LMS 로 수업 중이라 못 쓰던 시간 (source=lms_import_w26)
 *     · user_id='type_seed' — 6월 시연용 시드
 *   그 행들 때문에 그 시간에 망고아이 수업을 아예 넣을 수 없었다(주간 스케줄 화면에서
 *   «이미 예약된» 으로 막히고, 여기서도 409 conflict 가 났다).
 *   ⚠️ 제외식은 api-admin.ts·api-teacher.ts·churn-graph.ts·enroll-ops.ts 의
 *      `NOT IN ('lms','type_seed')` 와 **글자 하나까지 같게** 유지할 것 —
 *      화면마다 다르게 세기 시작하면 아무도 못 고친다.
 *      ⚠️ (2026-08-26) enroll-ops.ts 는 이 목록에서 «단 한 건 등록/이동» 이 아니라 «수강신청 확정
 *      전용 충돌검사기»(enrollConflicts·busyTimesForTeacher·teachersFreeAt)를 가리킨다 —
 *      이 파일과 목적은 다르지만(위 22행 주석) 같은 자리표시 데이터를 보므로 같은 제외식이 필요하다.
 *   ⚠️ 그 대신 이중배정을 서버가 더는 막아 주지 않는다. 이 데이터는 한 번 넣은 정적 임포트라
 *      지금 실제 LMS 일정과 맞는다는 보장이 없어서 내린 판단이다(화면 쪽 주석과 같은 근거).
 *   ⛔ 데이터는 지우지 않았다 — 되돌리려면 이 조건절만 빼면 된다. */
const NOT_PLACEHOLDER = `AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`;

/** 그 강사가 이미 잡아 둔 긴 수업 수 — 요일(정기) 또는 날짜(1회) 기준 */
async function longClassCountsByDay(env: any, teacherId: string, q: ScheduleSlotQuery): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!teacherId) return out;
  const exclude = q.excludeId == null ? null : String(q.excludeId);
  try {
    const rs = await env.DB.prepare(
      q.kind === 'recurring'
        ? `SELECT id, day_of_week, duration_min FROM class_schedules
             WHERE teacher_id = ? AND status = 'active' AND schedule_kind = 'recurring' ${NOT_PLACEHOLDER}`
        : `SELECT id, scheduled_date, duration_min FROM class_schedules
             WHERE teacher_id = ? AND status = 'active' AND scheduled_date = ? ${NOT_PLACEHOLDER}`
    ).bind(...(q.kind === 'recurring' ? [teacherId] : [teacherId, q.schedDate])).all();
    for (const row of ((rs as any)?.results || []) as any[]) {
      if (exclude != null && String(row.id) === exclude) continue;      // 자기 자신은 안 센다(옮길 때)
      // duration_min 이 비면 «옛 20분 수업» 으로 본다 — 긴 수업이 아니므로 세지 않는다
      if (!isLongClass(Number(row.duration_min) || DEFAULT_CLASS_MINUTES)) continue;
      if (q.kind === 'recurring') {
        for (const p of String(row.day_of_week ?? '').split(/[,\s]+/)) {
          const n = toDow(p);
          if (n != null) out[String(n)] = (out[String(n)] || 0) + 1;
        }
      } else {
        const d = String(row.scheduled_date || '');
        if (d) out[d] = (out[d] || 0) + 1;
      }
    }
  } catch { /* 조회 실패는 «정원 여유» 로 본다 — 등록을 막지 않는다 */ }
  return out;
}

/**
 * 이 수업을 넣으면 그 강사의 하루 긴 수업 정원을 넘는가.
 *   넘으면 { day, count, cap }, 아니면 null.
 *   ⚠️ 실패해도 예외를 던지지 않는다 — 조회가 안 되면 «여유 있음» 으로 보고 흐름을 막지 않는다.
 */
export async function findLongClassCapBlock(
  env: any, q: ScheduleSlotQuery
): Promise<{ day: string; count: number; cap: number } | null> {
  const teacherId = String(q?.teacherId || '');
  if (!teacherId || !isLongClass(q?.durationMin)) return null;   // 20분 수업은 정원과 무관
  const cap = await longClassCapFor(env, teacherId);
  if (!(cap > 0)) return null;                                    // 0 = 무제한
  const counts = await longClassCountsByDay(env, teacherId, q);
  const targets = q.kind === 'recurring'
    ? (Array.isArray(q.days) ? q.days.map(String) : [])
    : [String(q.schedDate || '')];
  for (const d of targets) {
    const n = counts[d] || 0;
    if (longClassCapReached(n, cap)) return { day: d, count: n, cap };
  }
  return null;
}

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 미리 읽기용 — findScheduleConflicts 의 세 번째 인자로 넘긴다(같은 SQL·같은 fail-open). */
export async function activeRowsFor(env: any, col: 'user_id' | 'teacher_id', val: string, q: ScheduleSlotQuery): Promise<any[]> {
  return activeRowsBy(env, col, val, q);
}

async function activeRowsBy(env: any, col: 'user_id' | 'teacher_id', val: string, q: ScheduleSlotQuery): Promise<any[]> {
  if (!val) return [];
  try {
    if (q.kind === 'recurring') {
      const rs = await env.DB.prepare(
        `SELECT id, day_of_week, scheduled_date, start_time, duration_min, user_id, teacher_id
           FROM class_schedules
          WHERE ${col} = ? AND status = 'active' AND schedule_kind = 'recurring' ${NOT_PLACEHOLDER}`
      ).bind(val).all();
      return rs?.results || [];
    }
    const rs = await env.DB.prepare(
      `SELECT id, day_of_week, scheduled_date, start_time, duration_min, user_id, teacher_id
         FROM class_schedules
        WHERE ${col} = ? AND status = 'active' AND scheduled_date = ? ${NOT_PLACEHOLDER}`
    ).bind(val, q.schedDate).all();
    return rs?.results || [];
  } catch { return []; }
}

/**
 * 한 건을 만들거나 옮길 때 겹치는 수업을 찾는다.
 * 실패해도 예외를 던지지 않는다 — 조회가 안 되면 «겹침 없음» 으로 보고 원래 흐름을 막지 않는다.
 */
export async function findScheduleConflicts(
  env: any, q: ScheduleSlotQuery,
  /* 📅 (2026-09-30) 한 날짜의 여러 시각을 볼 때 행을 한 번만 읽도록 — 넘기면 그 행으로 판정한다.
     ⛔ 판정은 여기 한 곳이다. 미리 읽은 행을 들고 가서 겹침을 따로 계산하지 말 것. */
  pre?: { student?: any[]; teacher?: any[]; cap?: { day: string; count: number; cap: number } | null },
): Promise<ScheduleConflictResult> {
  const empty: ScheduleConflictResult = { has: false, student: [], teacher: [], ko: '', en: '', cap: null };
  if (!q || !q.startTime) return empty;

  const newStart = toMinutes(q.startTime);
  const newEnd = newStart + (Number(q.durationMin) > 0 ? Number(q.durationMin) : 30);
  const days = Array.isArray(q.days) ? q.days : [];
  const exclude = q.excludeId == null ? null : String(q.excludeId);

  const hitsDay = (row: any) => {
    if (q.kind !== 'recurring') return true;   // 일회성은 SQL 에서 같은 날짜로 이미 좁혔다
    for (const p of String(row.day_of_week ?? '').split(/[,\s]+/)) {
      const n = toDow(p);
      if (n != null && days.includes(n)) return true;
    }
    return false;
  };
  const usable = (row: any) =>
    (exclude == null || String(row.id) !== exclude) &&
    hitsDay(row) &&
    rowOverlaps(newStart, newEnd, row.start_time, row.duration_min);

  const student: any[] = [];
  const teacher: any[] = [];

  for (const row of (pre && pre.student) || await activeRowsBy(env, 'user_id', String(q.userId || ''), q)) {
    if (!usable(row)) continue;
    student.push(row);
  }
  for (const row of (pre && pre.teacher) || await activeRowsBy(env, 'teacher_id', String(q.teacherId || ''), q)) {
    if (!usable(row)) continue;
    if (q.userId && String(row.user_id ?? '') === String(q.userId)) continue;   // 학생 쪽에서 이미 셌다
    // 같은 시각·같은 길이 = 합반(그룹) 수업 → 정상이므로 제외
    const sameSlot = String(row.start_time) === String(q.startTime)
      && (Number(row.duration_min) > 0 ? Number(row.duration_min) : 30) === (Number(q.durationMin) > 0 ? Number(q.durationMin) : 30);
    if (sameSlot) continue;
    teacher.push(row);
  }

  // 🪑 겹치지 않아도 «긴 수업 하루 정원» 에 걸릴 수 있다. 겹침이 없을 때만 본다 —
  //   겹침이 이미 있으면 그쪽이 더 근본적인 사유라 문구가 섞이면 헷갈린다.
  if (!student.length && !teacher.length) {
    /* 정원은 «강사·날짜» 로만 정해져 시각과 무관 — 미리 구해 넘기면(pre.cap) 칸마다 다시 묻지 않는다. */
    const capBlock = pre && pre.cap !== undefined ? pre.cap : await findLongClassCapBlock(env, q);
    if (!capBlock) return empty;
    const dayKo = q.kind === 'recurring'
      ? `${DOW_KO[Number(capBlock.day)] ?? capBlock.day}요일`
      : capBlock.day;
    return {
      has: true, student: [], teacher: [], cap: capBlock,
      ko: `이 강사는 ${dayKo}에 긴 수업(${DEFAULT_CLASS_MINUTES}분 초과)이 이미 정원만큼 있습니다 `
        + `(${capBlock.count}/${capBlock.cap}건). 짧은 수업으로 바꾸거나 다른 강사·다른 요일을 골라 주세요.`,
      en: `This teacher already has the maximum number of long classes (over ${DEFAULT_CLASS_MINUTES} min) on ${capBlock.day} `
        + `(${capBlock.count}/${capBlock.cap}). Choose a shorter class, another teacher, or another day.`,
    };
  }

  const ko = student.length
    ? '이 학생에게 시간이 겹치는 예약이 이미 있습니다.'
    : '이 강사에게 시간이 겹치는 다른 수업이 이미 있습니다. (같은 시각 합반이 아니라 시간이 어긋나게 겹칩니다 — 강사가 동시에 두 수업에 들어갈 수 없습니다)';
  const en = student.length
    ? 'This student already has a class overlapping this time.'
    : 'This teacher already has another class overlapping this time — not a same-slot group class, so the teacher cannot attend both.';

  return { has: true, student, teacher, ko, en, cap: null };
}


/** Move validation is deliberately fail-closed. The older registration helper above
 * allows overrides and falls back on lookup failures; neither is safe for a move.
 * Read dated and recurring rows together, since either can occupy the destination. */
export function scheduleDays(row: any): number[] {
  const aliases: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
    '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5, '토요일': 6,
  };
  return String(row.day_of_week ?? '').split(/[,\s]+/)
    .map(v => toDow(v) ?? aliases[v.toLowerCase()] ?? null).filter((n): n is number => n != null);
}

export function scheduleSharesDay(a: any, b: any, today: string): boolean {
  const ad = String(a.scheduled_date || ''), bd = String(b.scheduled_date || '');
  const starts = (r: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.starts_on || '')) ? String(r.starts_on) : '';
  if (ad && bd) return ad === bd;
  if (ad || bd) {
    const d = ad || bd, recurring = ad ? b : a;
    /* ⏭ (2026-10-09) 그 주만 빠진 날의 반복 줄은 그날 자리를 차지하지 않는다(정본 recurSkippedOn). */
    if (recurSkippedOn(recurring, d)) return false;
    return d >= starts(recurring) && (!ad ? d >= today : true)
      && scheduleDays(recurring).includes(new Date(d + 'T00:00:00Z').getUTCDay());
  }
  return scheduleDays(a).some(d => scheduleDays(b).includes(d));
}

function shiftScheduleDay(row: any, days: number): any {
  if (!days) return row;
  const shift = (date: string) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  return { ...row,
    scheduled_date: row.scheduled_date ? shift(String(row.scheduled_date)) : null,
    day_of_week: scheduleDays(row).map(d => (d + days) % 7).join(','),
    starts_on: /^\d{4}-\d{2}-\d{2}$/.test(String(row.starts_on || '')) ? shift(String(row.starts_on)) : null };
}
function moveTimeSegments(row: any) {
  const start = toMinutes(row.start_time), end = start + (Number(row.duration_min) || DEFAULT_CLASS_MINUTES);
  const segments = [{ row, start, end: Math.min(end, 1440) }];
  if (end > 1440) segments.push({ row: shiftScheduleDay(row, 1), start: 0, end: end - 1440 });
  return segments;
}
export function scheduleRowsOverlap(a: any, b: any, today: string): boolean {
  return moveTimeSegments(a).some(x => moveTimeSegments(b).some(y =>
    x.start < y.end && y.start < x.end && scheduleSharesDay(x.row, y.row, today)));
}

export function scheduleHitsBlock(row: any, block: any, today: string): boolean {
  const bs = block.start_time ? toMinutes(block.start_time) : 0;
  const be = block.end_time ? toMinutes(block.end_time) : 1440;
  return moveTimeSegments(row).some(segment => {
    if (!(segment.start < be && bs < segment.end)) return false;
    const r = segment.row, date = String(r.scheduled_date || '');
    if (block.kind === 'weekly') {
      return date ? new Date(date + 'T00:00:00Z').getUTCDay() === Number(block.day_of_week)
        : scheduleDays(r).includes(Number(block.day_of_week));
    }
    const from = String(block.start_date || ''), to = String(block.end_date || from);
    if (!from || !to) return false;
    if (date) return date >= from && date <= to;
    const first = [from, today, String(r.starts_on || '')].sort().pop()!;
    if (first > to) return false;
    // A week covers every weekday without expanding an unbounded recurring series.
    const d = new Date(first + 'T00:00:00Z');
    for (let i = 0; i < 7 && d.toISOString().slice(0, 10) <= to; i++, d.setUTCDate(d.getUTCDate() + 1)) {
      if (scheduleDays(r).includes(d.getUTCDay())) return true;
    }
    return false;
  });
}

type MoveFacts = { rows: any[]; blocks: any[]; vacations: any[] };
async function strictRows(stmt: any): Promise<any[]> {
  const result = await stmt.all();
  if (!result || result.success === false || !Array.isArray(result.results)) throw new Error('schedule_lookup_failed');
  return result.results;
}
export async function loadScheduleMoveFacts(env: any, row?: any): Promise<MoveFacts> {
  const rows = await strictRows(env.DB.prepare(`SELECT * FROM class_schedules
    WHERE (status IS NULL OR status = 'active') ${NOT_PLACEHOLDER}
    ${row ? 'AND (CAST(teacher_id AS TEXT) = ? OR user_id = ?)' : ''}`)
    .bind(...(row ? [String(row.teacher_id || ''), String(row.user_id || '')] : [])));
  const optionalRows = async (table: string, sql: string) => {
    // A missing legacy table has no blocks; a failed lookup is never an empty result.
    const exists = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first();
    return exists ? strictRows(env.DB.prepare(sql)) : [];
  };
  const blocks = await optionalRows('teacher_unavailability', `SELECT * FROM teacher_unavailability`);
  const vacations = await optionalRows('calendar_events', `SELECT id, teacher_name, date AS start_date,
    COALESCE(end_date, date) AS end_date FROM calendar_events WHERE event_type = 'vacation'`);
  return { rows, blocks, vacations };
}

export async function findScheduleMoveConflicts(env: any, row: any, teacherName: string,
  excludeIds: Array<string | number> = [row.id], pre?: MoveFacts) {
  // Reassignment changes future recurring occurrences. Old vacations must not block it forever.
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const excluded = new Set(excludeIds.map(String));
  const effectiveDate = String(row.scheduled_date || '');
  if (!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(row.start_time || ''))
    || (row.duration_min != null && (!Number.isInteger(Number(row.duration_min)) || Number(row.duration_min) <= 0 || Number(row.duration_min) > 240))
    || (effectiveDate ? (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !Number.isFinite(Date.parse(effectiveDate + 'T00:00:00Z'))
      || new Date(effectiveDate + 'T00:00:00Z').toISOString().slice(0, 10) !== effectiveDate) : !scheduleDays(row).length)) {
    return { status: 503, error: 'availability_unknown', message: '원래 수업의 날짜·시간 정보가 올바르지 않아 변경하지 않았습니다. 수업 정보를 확인해 주세요.' };
  }
  if (String(row.teacher_id || '').trim() && !String(teacherName || '').trim()) return {
    status: 503, error: 'availability_unknown', message: '강사 이름을 확인하지 못해 휴가를 대조할 수 없습니다. 강사 정보를 확인해 주세요.' };
  const facts = pre || await loadScheduleMoveFacts(env, row);
  const rows = facts.rows;
  const start = toMinutes(row.start_time), duration = Number(row.duration_min) || DEFAULT_CLASS_MINUTES;
  const student: any[] = [], teacher: any[] = [];
  for (const other of rows) {
    if (excluded.has(String(other.id)) || !scheduleRowsOverlap(row, other, today)) continue;
    if (String(other.user_id) === String(row.user_id)) student.push(other);
    else if (String(other.teacher_id) === String(row.teacher_id)) {
      // Preserve the existing exact-slot group contract; staggered overlap is never a group.
      if (toMinutes(other.start_time) === start && (Number(other.duration_min) || DEFAULT_CLASS_MINUTES) === duration) continue;
      teacher.push(other);
    }
  }
  const blocks = facts.blocks.filter(b => String(b.teacher_id) === String(row.teacher_id));
  const vacations = teacherName ? facts.vacations.filter(b => b.teacher_name === teacherName) : [];
  const teacherBlocks = blocks.concat(vacations.map((b: any) => ({ ...b, kind: 'calendar_vacation' })))
    .filter((b: any) => scheduleHitsBlock(row, b, today));
  if (teacherBlocks.length) return { status: 409, error: 'teacher_unavailable',
    message: '이 시간은 강사의 근무불가 또는 휴가 시간입니다. 다른 강사나 시간을 선택해 주세요.', teacher_blocks: teacherBlocks };
  if (student.length || teacher.length) return { status: 409, error: 'conflict',
    message: student.length ? '학생의 다른 수업과 시간이 겹칩니다.' : '선택한 강사의 다른 수업과 시간이 겹칩니다.',
    conflicts: student, teacher_conflicts: teacher };
  return null;
}
