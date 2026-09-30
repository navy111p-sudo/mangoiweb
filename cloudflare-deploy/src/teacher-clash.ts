/**
 * ⚔️ teacher-clash.ts — «같은 강사가 같은 시간에 LMS(카페24) 수업과 망고아이 수업을 둘 다 갖고 있나»
 *   (2026-09-30 필리핀 매니저 요청 → 사장님 A안 승인)
 *
 * 발단: Zee 가 수요일 20:00 에 카페24 정규수업(umc276)이 있는데, 망고아이 쪽에도 같은 시각
 *       다른 학생(yahee)의 반복 수업이 잡혀 있었다(class_schedules id 3498, admin_ui, recurring).
 *       [잰 것 — 2026-09-30 D1] 그 반복 행은 2026-09-24 에 만들어졌고, 그때는 앞으로의 수요일
 *       카페24 행이 아직 미러로 안 들어와 있었다(카페24는 당일에 예약을 채운다).
 *       ⟹ 등록 시점의 겹침 검사는 «아직 없는» 카페24 수업을 원리상 못 본다.
 *   게다가 미러(c24-mirror.ts)의 `loadExisting` 은 `scheduled_date` 가 있는 행만 읽어서
 *   **반복 수업(recurring)을 한 번도 안 본다** — 뒤늦게 카페24 수업이 들어와도 조용히 겹쳐 만든다.
 *
 * 이 파일은 그 겹침을 «찾아서 보여 주기만» 한다. ⛔ 아무것도 쓰지 않는다(수업을 막거나 지우지 않는다).
 *   카페24 LMS 에 우리 수업을 «써 넣는» 것은 불가능하다 — 카페24가 쓰기 API 를 안 준다.
 *   그래서 방향을 뒤집어 «망고아이 화면 한 곳에서 두 쪽을 함께 대조» 한다.
 *
 * ⚠️ 요일 판정은 정본 `enrollDowList`(enroll-ops.ts)를 **주입받는다** — 여기서 다시 만들지 않는다
 *    (`class_schedules.day_of_week` 에는 '3'·'Wed'·'수'·'1,3,5' 가 섞여 있다. CLAUDE.md 2장).
 * ⚠️ 강사 대조는 «원부 번호(teachers.id)» 로만 한다 — 카페24 번호는 미러의 links 가 이미
 *    원부 번호로 풀어 준 값(teacher_id)만 쓴다. 이름·카페24 번호로 잇지 않는다(남의 강사가 붙는다).
 */

/** 카페24 수업 한 건 — c24-mirror 의 PlanRow 에서 필요한 칸만 */
export interface ClashC24Row {
  class_id: string;
  date: string;             // YYYY-MM-DD (KST)
  start_time: string;       // HH:MM (KST)
  duration_min: number;
  teacher_id: string | null;    // 원부 번호(teachers.id) — 못 이었으면 null
  teacher_name: string | null;
  student_uid: string;
  student_name: string | null;
  verdict: string;
}

/** 망고아이 수업 한 건 (class_schedules, 미러가 만든 것은 뺀 뒤) */
export interface ClashMangoiRow {
  id: number;
  user_id: string | null;
  student_name?: string | null;
  teacher_id: string | null;
  schedule_kind: string | null;
  day_of_week: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  duration_min: number | null;
  source: string | null;
  status: string | null;
}

export interface TeacherClash {
  date: string;
  teacher_id: string;
  teacher_name: string | null;
  lms: { class_id: string; start_time: string; duration_min: number; student_uid: string; student_name: string | null; suspect: boolean };
  mangoi: { id: number; start_time: string; duration_min: number; student_uid: string; student_name: string | null; source: string; recurring: boolean };
  /** 같은 학생이면 «이중 등록», 다르면 «강사 이중 배정» — 사람이 할 일이 다르다 */
  same_student: boolean;
}

/** 카페24 쪽에서 «실제 수업이 아니라» 겹침을 따질 필요가 없는 판정 */
const NOT_REAL = new Set(['no_teacher_left', 'student_hidden', 'no_student']);

function toMin(hm: any): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm ?? '').trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(v) ? v : null;
}

/** 망고아이 행이 그 날짜에 열리는가 — 날짜가 있으면 날짜가 이긴다(sessions/today 와 같은 순서) */
export function mangoiRowOnDate(r: ClashMangoiRow, date: string, dowList: (raw: any) => number[]): boolean {
  const sd = String(r.scheduled_date ?? '').slice(0, 10);
  if (sd) return sd === date;
  if (r.day_of_week == null || String(r.day_of_week).trim() === '') return false;
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return dowList(r.day_of_week).includes(dow);
}

/**
 * 🧠 겹침 찾기 — 순수 함수(하니스가 그대로 돌린다).
 *   시간은 [시작, 시작+길이) 반열린 구간으로 본다 — 20:00~20:20 과 20:20~20:40 은 안 겹친다.
 */
export function findTeacherClashes(
  c24: ClashC24Row[],
  mangoi: ClashMangoiRow[],
  dowList: (raw: any) => number[],
): { clashes: TeacherClash[]; unchecked_no_teacher: number } {
  const out: TeacherClash[] = [];
  const seen = new Set<string>();
  let unchecked = 0;

  // 강사별로 미리 묶는다 (카페24 수백 건 × 망고아이 수백 건)
  const byTeacher = new Map<string, ClashMangoiRow[]>();
  for (const m of mangoi) {
    if (String(m.status || '') === 'cancelled') continue;
    if (String(m.source || '').startsWith('c24-mirror')) continue;   // 카페24 수업의 사본 — 자기 자신과 겹칠 뿐
    if (['lms', 'type_seed'].includes(String(m.user_id || '').toLowerCase())) continue;   // 옛 자리표시
    const tid = m.teacher_id == null ? '' : String(m.teacher_id).trim();
    if (!tid) continue;
    const arr = byTeacher.get(tid) || [];
    arr.push(m);
    byTeacher.set(tid, arr);
  }

  for (const c of c24) {
    if (NOT_REAL.has(String(c.verdict || ''))) continue;
    const tid = c.teacher_id == null ? '' : String(c.teacher_id).trim();
    if (!tid) { unchecked++; continue; }        // ⛔ 강사를 못 이었으면 짐작해서 대조하지 않는다
    const cs = toMin(c.start_time);
    if (cs == null) continue;
    const ce = cs + Math.max(1, Number(c.duration_min) || 20);
    for (const m of byTeacher.get(tid) || []) {
      if (!mangoiRowOnDate(m, c.date, dowList)) continue;
      const ms = toMin(m.start_time);
      if (ms == null) continue;
      const me = ms + Math.max(1, Number(m.duration_min) || 20);
      if (!(cs < me && ms < ce)) continue;
      const key = `${m.id}|${c.date}|${c.class_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mUid = String(m.user_id || '');
      out.push({
        date: c.date, teacher_id: tid, teacher_name: c.teacher_name,
        lms: {
          class_id: c.class_id, start_time: c.start_time, duration_min: Number(c.duration_min) || 0,
          student_uid: c.student_uid, student_name: c.student_name, suspect: c.verdict === 'suspect_dup',
        },
        mangoi: {
          id: m.id, start_time: String(m.start_time || '').slice(0, 5), duration_min: Number(m.duration_min) || 0,
          student_uid: mUid, student_name: m.student_name ?? null, source: String(m.source || ''),
          recurring: !String(m.scheduled_date ?? '').trim(),
        },
        same_student: mUid !== '' && mUid === String(c.student_uid || ''),
      });
    }
  }
  out.sort((a, b) => (a.date + a.lms.start_time + a.teacher_id).localeCompare(b.date + b.lms.start_time + b.teacher_id));
  return { clashes: out, unchecked_no_teacher: unchecked };
}

/** 망고아이 쪽 후보 — 창 안의 날짜 수업 + 날짜 없는 반복 수업. ⚠️ 실패하면 던진다(«0건=깨끗» 으로 위장하지 않기) */
export async function loadMangoiForClash(env: { DB: any }, since: string, until: string): Promise<ClashMangoiRow[]> {
  const rs: any = await env.DB.prepare(
    `SELECT id, user_id, student_name, teacher_id, schedule_kind, day_of_week, scheduled_date,
            start_time, duration_min, source, status
       FROM class_schedules
      WHERE status != 'cancelled'
        AND COALESCE(source, '') NOT LIKE 'c24-mirror%'
        AND LOWER(COALESCE(user_id, '')) NOT IN ('lms', 'type_seed')
        AND ( (scheduled_date IS NOT NULL AND TRIM(scheduled_date) <> '' AND scheduled_date >= ? AND scheduled_date <= ?)
              OR ((scheduled_date IS NULL OR TRIM(scheduled_date) = '') AND day_of_week IS NOT NULL AND TRIM(day_of_week) <> '') )`
  ).bind(since, until).all();
  return (rs.results || []) as ClashMangoiRow[];
}
