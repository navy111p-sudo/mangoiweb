/* 🎌 holiday-closure.ts — 공휴일 휴강 판정 정본 (2026-10-09 사장님 「추천안대로」)
 *
 * [왜] 한글날(10/9)에 학생 홈이 「🔔 수업 들어오세요」 벨을 계속 울렸다. 공휴일을 «휴강» 으로 아는
 *      코드가 수업 화면 쪽에 한 곳도 없었고, 유일하게 공휴일을 읽는 «수업 밀기»(runHolidayShiftSweep)는
 *      enroll_holidays 가 비어 있어(실측 0건) 아무것도 안 했다. 그날 잡힌 수업 156건 · 실제 접속 방 1개.
 *
 * [정책] 휴강일 = ① 공식 한국 공휴일(holidays, country='KR') 또는 ② 수강 운영 › 공휴일(enroll_holidays).
 *        단 «이날은 수업함» 으로 지정한 날(holiday_closure_override kind='open_day')은 휴강 아님.
 *        예외 = 중국어 수업 — 담당 강사가 예외 목록(기본 원부 29 「중국어 강선생님」 + 지정분)이면 그대로 연다.
 *        ⚠️ 필리핀 공휴일(PH)은 보지 않는다.
 *
 * [원칙]
 *  · 데이터를 안 바꾼다 — class_schedules 는 그대로, «읽을 때» 가린다. 공휴일을 잘못 넣어도 빼면 바로 돌아온다.
 *  · fail-open — 조회가 실패하면 «휴강 아님». 막는 쪽으로 실패하면 평일 수업이 통째로 막힌다.
 *  · 판정은 이 파일 한 곳. 학생 입장(api-mango sessions/today)·강사 포털·30분 전 문자·결석 감지가 부른다.
 *  · 수업마다 조회하지 않는다 — 날짜당 한 번(+isolate 캐시 5분).
 */

export const HOLIDAY_EXEMPT_TEACHERS_DEFAULT: readonly string[] = ['29'];   // 원부 29 = 중국어 강선생님
const CACHE_MS = 5 * 60 * 1000;

export interface HolidayClosure {
  /** 그날이 휴강일인가 */
  closed: boolean;
  /** 공휴일 이름(모르면 null) */
  name: string | null;
  /** 예외 강사(원부 teachers.id 문자열) */
  exempt: Set<string>;
  /** «이날은 수업함» 으로 열어 둔 날인가 */
  opened: boolean;
}

const OPEN: HolidayClosure = { closed: false, name: null, exempt: new Set(HOLIDAY_EXEMPT_TEACHERS_DEFAULT), opened: false };
const cache = new Map<string, { at: number; v: HolidayClosure }>();

export function clearHolidayClosureCache(): void { cache.clear(); }

export async function ensureHolidayClosureTable(db: any): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS holiday_closure_override (
       kind TEXT NOT NULL, key TEXT NOT NULL, note TEXT, updated_by TEXT, updated_at INTEGER,
       PRIMARY KEY (kind, key))`
  ).run();
}

/** ymd = 'YYYY-MM-DD'(KST). 던지지 않는다. */
export async function loadHolidayClosure(db: any, ymd: string): Promise<HolidayClosure> {
  if (!db || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return OPEN;
  const hit = cache.get(ymd);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
  let v: HolidayClosure = OPEN;
  try {
    let name: string | null = null;
    try {
      const r = await db.prepare(`SELECT name FROM holidays WHERE country = 'KR' AND date = ? LIMIT 1`).bind(ymd).first();
      if (r) name = String(r.name || '') || '공휴일';
    } catch { /* 표 없음 — 다음 근거로 */ }
    if (!name) {
      try {
        const r = await db.prepare(`SELECT name FROM enroll_holidays WHERE day = ? LIMIT 1`).bind(ymd).first();
        if (r) name = String(r.name || '') || '휴일';
      } catch { /* 표 없음 */ }
    }
    const exempt = new Set<string>(HOLIDAY_EXEMPT_TEACHERS_DEFAULT);
    let opened = false;
    try {
      await ensureHolidayClosureTable(db);
      const rs: any = await db.prepare(
        `SELECT kind, key FROM holiday_closure_override WHERE kind = 'exempt_teacher' OR (kind = 'open_day' AND key = ?)`
      ).bind(ymd).all();
      for (const row of ((rs?.results as any[]) || [])) {
        if (row.kind === 'exempt_teacher') exempt.add(String(row.key).trim());
        else if (row.kind === 'open_day') opened = true;
      }
    } catch { /* 예외 표를 못 읽음 — 기본 예외만 */ }
    v = { closed: !!name && !opened, name, exempt, opened };
  } catch { v = OPEN; }
  cache.set(ymd, { at: Date.now(), v });
  return v;
}

/** 이 수업(teacher_id)이 오늘 휴강인가. */
export function isHolidayClosedFor(h: HolidayClosure | null | undefined, teacherId: any): boolean {
  if (!h || !h.closed) return false;
  const tid = String(teacherId ?? '').trim();
  return !(tid && h.exempt.has(tid));
}

/** 학생·강사에게 보여 줄 한 줄(한/영). */
export function holidayClosedMsg(name: string | null): string {
  const n = name || '공휴일';
  return `🎌 오늘은 ${n} 휴강입니다 · Holiday — no class today`;
}

/** 휴강일에 학생이 «입장» 을 눌렀을 때 띄울 안내(한/영 병기). ⛔ 화면에 문장을 복제하지 말 것 — 이 함수가 정본. */
export function holidayEntryAlert(name: string | null): string {
  const n = name || '공휴일';
  return `🎌 오늘은 ${n}이라 수업이 쉬어요.\n다음 수업일에 만나요! 수업 일정은 홈의 «내 수업» 에서 확인할 수 있어요.\n\n`
    + `Today is a holiday (${n}), so there is no class.\nSee you at your next class! Check «My classes» on the home screen for your schedule.`;
}
