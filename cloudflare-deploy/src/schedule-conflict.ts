/**
 * schedule-conflict.ts — 수업 시간 «겹침» 판정 한 곳 (2026-08-04)
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

async function activeRowsBy(env: any, col: 'user_id' | 'teacher_id', val: string, q: ScheduleSlotQuery): Promise<any[]> {
  if (!val) return [];
  try {
    if (q.kind === 'recurring') {
      const rs = await env.DB.prepare(
        `SELECT id, day_of_week, scheduled_date, start_time, duration_min, user_id, teacher_id
           FROM class_schedules
          WHERE ${col} = ? AND status = 'active' AND schedule_kind = 'recurring'`
      ).bind(val).all();
      return rs?.results || [];
    }
    const rs = await env.DB.prepare(
      `SELECT id, day_of_week, scheduled_date, start_time, duration_min, user_id, teacher_id
         FROM class_schedules
        WHERE ${col} = ? AND status = 'active' AND scheduled_date = ?`
    ).bind(val, q.schedDate).all();
    return rs?.results || [];
  } catch { return []; }
}

/**
 * 한 건을 만들거나 옮길 때 겹치는 수업을 찾는다.
 * 실패해도 예외를 던지지 않는다 — 조회가 안 되면 «겹침 없음» 으로 보고 원래 흐름을 막지 않는다.
 */
export async function findScheduleConflicts(env: any, q: ScheduleSlotQuery): Promise<ScheduleConflictResult> {
  const empty: ScheduleConflictResult = { has: false, student: [], teacher: [], ko: '', en: '' };
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

  for (const row of await activeRowsBy(env, 'user_id', String(q.userId || ''), q)) {
    if (!usable(row)) continue;
    student.push(row);
  }
  for (const row of await activeRowsBy(env, 'teacher_id', String(q.teacherId || ''), q)) {
    if (!usable(row)) continue;
    if (q.userId && String(row.user_id ?? '') === String(q.userId)) continue;   // 학생 쪽에서 이미 셌다
    // 같은 시각·같은 길이 = 합반(그룹) 수업 → 정상이므로 제외
    const sameSlot = String(row.start_time) === String(q.startTime)
      && (Number(row.duration_min) > 0 ? Number(row.duration_min) : 30) === (Number(q.durationMin) > 0 ? Number(q.durationMin) : 30);
    if (sameSlot) continue;
    teacher.push(row);
  }

  if (!student.length && !teacher.length) return empty;

  const ko = student.length
    ? '이 학생에게 시간이 겹치는 예약이 이미 있습니다.'
    : '이 강사에게 시간이 겹치는 다른 수업이 이미 있습니다. (같은 시각 합반이 아니라 시간이 어긋나게 겹칩니다 — 강사가 동시에 두 수업에 들어갈 수 없습니다)';
  const en = student.length
    ? 'This student already has a class overlapping this time.'
    : 'This teacher already has another class overlapping this time — not a same-slot group class, so the teacher cannot attend both.';

  return { has: true, student, teacher, ko, en };
}
