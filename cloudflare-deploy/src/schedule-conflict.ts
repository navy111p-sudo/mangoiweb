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
export async function findScheduleConflicts(env: any, q: ScheduleSlotQuery): Promise<ScheduleConflictResult> {
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

  // 🪑 겹치지 않아도 «긴 수업 하루 정원» 에 걸릴 수 있다. 겹침이 없을 때만 본다 —
  //   겹침이 이미 있으면 그쪽이 더 근본적인 사유라 문구가 섞이면 헷갈린다.
  if (!student.length && !teacher.length) {
    const capBlock = await findLongClassCapBlock(env, q);
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
