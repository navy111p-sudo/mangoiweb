/**
 * 📅 시간표 요약 숫자 — 관리자 대시보드 「통합 시간표」 카드가 «누르기 전에» 말하는 값.
 *
 * [왜 만들었나 — 2026-09-11 사장님 제보]
 *   그 카드 여섯 장이 전부 `location.href='/admin/weekly-schedule.html'` 한 줄이라
 *   무엇을 눌러도 같은 강사 스케줄이 나왔다. 그중 여섯 장이 «기능 설명» 만 적고 있어서
 *   사람이 시간표를 열어 봐야만 답을 알 수 있었다(= 이 저장소가 강사 명부 「지금」 칸에서
 *   이미 한 번 푼 문제 — CLAUDE.md 「하나하나 눌러봐야 알 수 있다는 제보」).
 *   그래서 카드가 숫자를 먼저 말하게 한다.
 *
 * [⛔ 지어내지 않는다]
 *   못 재는 값은 null 로 두고 화면이 «—» 와 이유를 그린다.
 *   CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」 — 그럴듯한 거짓말이
 *   이 저장소가 가장 오래 속은 방식이다(「📊 저장소 상태」 4칸이 몇 달간 예시값이었다).
 *
 * [⚠️ 요일 파싱을 여기서 새로 만들지 않는다]
 *   `class_schedules.day_of_week` 에는 `4`·`Thu`·`목`·`1,3,5` 가 섞여 있어
 *   (CLAUDE.md 「day_of_week 를 단일 값으로 읽었더니」) 서버 SQL 로는 못 센다.
 *   그래서 «날짜가 잡힌 수업»(scheduled_date)만 날짜로 세고,
 *   정기(recurring)는 «몇 건이 걸려 있는지» 만 따로 세어 화면이 나란히 적는다.
 *   ⛔ 둘을 더해서 한 숫자로 만들지 말 것 — 정기가 그 주에 몇 번 도는지 모르므로 거짓이 된다.
 *   실측(2026-09-11): 활성 1,262건 중 정기는 4건뿐이고 1,258건이 날짜가 잡힌 행이다.
 *
 * [게이트]
 *   `/api/admin/reports/` 접두사 아래에 두었다 — `src/index.ts`(공동 금지구역)를 한 줄도
 *   안 건드리고 ①인증 ②라우팅 ③강사 차단(TEACHER_BLOCKED_PREFIXES)이 전부 이미 걸린다.
 *   지사·대리점도 isAgencyAllowedApi 에 없어 403 이다 — 이 숫자는 전사 집계라
 *   그쪽이 보면 안 되므로 «맞는» 실패 방향이다. 화면은 403 을 «본사 계정에서 보입니다» 로 그린다.
 */

export interface ScheduleSummary {
  /** 이번 주 월요일 (KST, YYYY-MM-DD) */
  week_start: string;
  /** 이번 주 일요일 (KST, YYYY-MM-DD) */
  week_end: string;
  /** 오늘 (KST, YYYY-MM-DD) */
  today: string;
  /** 이번 주에 «날짜가 잡힌» 수업 건수 — 못 읽으면 null */
  dated: number | null;
  /** 매주 반복으로 걸려 있는 배정 건수 (주당 횟수 아님) — 못 읽으면 null */
  recurring: number | null;
  /** 이번 주에 수업이 잡힌 강사 수 — 못 읽으면 null */
  teachers: number | null;
  /** 이번 주에 수업이 잡힌 학생 수 — 못 읽으면 null */
  students: number | null;
  /** 오늘 잡힌 수업 건수 — 못 읽으면 null */
  today_count: number | null;
  /** 아직 안 나간 학부모 알림 건수 — 표가 없거나 못 읽으면 null */
  notify_pending: number | null;
  /** 그 알림 중 가장 오래된 것이 며칠째인지 — 없으면 null */
  notify_oldest_days: number | null;
}

/** 자리표시(옛 LMS 점유·6월 시연 시드) 제외 — `src/schedule-conflict.ts` 와 같은 문자열.
 *  ⛔ 이 파일은 다른 도메인을 import 하지 않는 규약이라 복제한다(NOT_PLACEHOLDER 선례).
 *     다섯 곳의 문자열이 서로 같아야 한다 — 한 곳만 고치면 「멀쩡히 빈 시간인데 배정이 막힘」. */
const NOT_PLACEHOLDER = `AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 오늘·이번 주(월~일)를 YYYY-MM-DD 로 돌려준다. */
export function kstWeekWindow(nowMs: number): { today: string; start: string; end: string } {
  const k = new Date(nowMs + KST_OFFSET_MS);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  // getUTCDay(): 0=일 … 6=토. 월요일 시작으로 맞춘다(일요일이면 6일 전).
  const dow = k.getUTCDay();
  const backToMon = (dow === 0) ? 6 : (dow - 1);
  const start = new Date(k.getTime() - backToMon * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  return { today: iso(k), start: iso(start), end: iso(end) };
}

/** 한 줄짜리 숫자 조회. 실패하면 던지지 않고 null — 「모름」과 「0」은 다른 사실이다. */
async function count1(db: any, sql: string, binds: any[]): Promise<number | null> {
  try {
    const row: any = await db.prepare(sql).bind(...binds).first();
    if (!row) return null;
    const v = row.n;
    return (v == null) ? null : Number(v);
  } catch {
    return null;
  }
}

/**
 * 카드가 그릴 숫자를 모아 온다.
 * ⚠️ 어느 한 줄이 실패해도 나머지는 그대로 내려간다 — 카드 하나가 «—» 가 될 뿐
 *    화면 전체가 비지 않는다.
 */
export async function buildScheduleSummary(env: any, nowMs: number = Date.now()): Promise<ScheduleSummary> {
  const db = env?.DB;
  const w = kstWeekWindow(nowMs);

  const base = `FROM class_schedules WHERE status='active' ${NOT_PLACEHOLDER}`;
  const inWeek = `${base} AND scheduled_date BETWEEN ? AND ?`;

  const [dated, teachers, students, todayCount, recurring] = await Promise.all([
    count1(db, `SELECT COUNT(*) AS n ${inWeek}`, [w.start, w.end]),
    count1(db, `SELECT COUNT(DISTINCT teacher_id) AS n ${inWeek}`, [w.start, w.end]),
    count1(db, `SELECT COUNT(DISTINCT user_id) AS n ${inWeek}`, [w.start, w.end]),
    count1(db, `SELECT COUNT(*) AS n ${base} AND scheduled_date = ?`, [w.today]),
    count1(db, `SELECT COUNT(*) AS n ${base} AND schedule_kind = 'recurring'`, []),
  ]);

  // 📲 안 나간 학부모 알림.
  //   ⚠️ 이 표는 INSERT 만 있고 «꺼내 보내는» 코드가 저장소에 0곳이다(2026-09-11 실측).
  //      즉 여기 쌓인 건수는 «보낼 예정» 이 아니라 «아무도 안 보내고 있는» 건수다.
  //      화면이 그 말을 그대로 해야 한다 — 「대기 중」이라고만 적으면 곧 나갈 것처럼 읽힌다.
  //   표가 아직 없는 환경에서는 조회가 실패하는데, 그건 «0건» 이 아니라 «모름» 이다.
  let notifyPending: number | null = null;
  let notifyOldestDays: number | null = null;
  try {
    const row: any = await db
      .prepare(`SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM parent_notify_queue WHERE status = 'queued'`)
      .first();
    if (row && row.n != null) {
      notifyPending = Number(row.n);
      const oldest = Number(row.oldest || 0);
      if (notifyPending > 0 && oldest > 0 && oldest <= nowMs) {
        notifyOldestDays = Math.floor((nowMs - oldest) / 86400000);
      }
    }
  } catch {
    notifyPending = null;
  }

  return {
    week_start: w.start,
    week_end: w.end,
    today: w.today,
    dated,
    recurring,
    teachers,
    students,
    today_count: todayCount,
    notify_pending: notifyPending,
    notify_oldest_days: notifyOldestDays,
  };
}
