/**
 * 📶 vc-quality-live.ts — 수업 관제탑 «회선» 칸을 «강사 / 학생» 으로 나누는 정본 (2026-11-03)
 *
 * [왜] 관제탑의 회선 칸(예: «254ms · 0.1%»)은 그 방에 있는 «모두» 의 최근 5분 평균이라,
 *      직원이 「강사 쪽인가, 학생 쪽인가?」를 물어도 답할 수 없었다(사장님 「역할별로 나눠 보이게 고쳐줘」).
 *      같은 vc_quality 행을 역할로 한 번 더 묶어 방마다 by_role 로 붙인다 — 새 표를 만들지 않는다.
 *
 * ⛔ 방 단위 쿼리(api-admin.ts live=1)는 그대로 «방» 으로 묶는다 — 툴팁·옛 한 줄·역할 줄이 «모름» 일 때의
 *    심각도가 그 값을 쓴다. 이 파일은 역할별 값을 «덧붙이고», 평균 규칙(LIVE_AVG_SQL)을 두 쿼리에 함께 준다.
 *    (2026-11-03 후속) 심각도·「지금 손봐야 할 방」은 화면(js/monitor-wall.js worst())이 «가장 나쁜 줄» 로 정한다.
 * ⚠️ role 은 «접속한 기기가 보낸 값» 이다(js/idx-vc-qlog.js — vcIsTeacherRole() 이면 'teacher',
 *    아니면 저장된 역할이나 'student'). 화면 «표시» 에만 쓴다.
 *    ⚠️ vcIsTeacherRole() 은 admin·hq 역할도 참으로 본다(idx-main.js) — 본사·사장님이 «직접 입장» 하면
 *       그 기기는 'teacher' 로 보내 «강사» 줄에 섞인다(그래서 «강사 2명» 이 나올 수 있다).
 *       «기타» 는 기기가 teacher·student·빈 값이 아닌 글자를 보낸 드문 경우뿐이다.
 *    ⛔ 출석·노쇼·급여 판정에 쓰지 말 것(CLAUDE.md 2장 — 판정 근거는 이름 일치뿐).
 * ⚠️ 표본이 없으면 «모름»(null) 이다 — samples=0 인 1분의 avg_loss(0) 와 avg_rtt=0 은 평균에서 뺀다.
 *    0 으로 섞으면 카메라를 끈 사람이 «회선이 제일 좋은 사람» 으로 보인다(CLAUDE.md 2장).
 *    (2026-11-03 후속, 사장님 「방 단위 값도 표본 없는 1분 빼고」) 방 단위 쿼리도 같은 규칙 —
 *    그 규칙은 아래 LIVE_AVG_SQL «한 곳» 에 두고 두 쿼리가 함께 쓴다(한쪽만 고치면 둘이 어긋난다).
 * ⚠️ 이 집계가 실패해도 방 단위 응답은 그대로 나가야 한다(by_role 만 빠짐 → 화면은 예전 한 줄).
 *    그래서 부르는 쪽(api-admin.ts)이 try 로 감싼다.
 */

export type LineRole = 'teacher' | 'student' | 'other';

/** 화면에 그리는 순서 — 강사가 먼저 */
export const LINE_ROLE_ORDER: readonly LineRole[] = ['teacher', 'student', 'other'];

/** 손실·RTT 평균 — «표본 있는 1분만». 방 단위(api-admin.ts)·역할별 쿼리가 함께 쓴다 */
export const LIVE_AVG_SQL = `ROUND(AVG(CASE WHEN samples > 0 THEN avg_loss END), 1) AS avg_loss,
         ROUND(AVG(CASE WHEN avg_rtt > 0 THEN avg_rtt END)) AS avg_rtt`;

/** 역할을 세 칸으로 묶는다 — 'teacher' 만 강사, 빈 값·'student' 는 학생, 그 밖의 글자는 기타.
 *  ⛔ 방 단위 쿼리와 «같은 WHERE» 를 쓴다(같은 행을 묶는 축만 다르다 — vc_quality_live_role_harness ① 이 대조). */
export const LIVE_ROLE_SQL = `SELECT room,
         CASE WHEN LOWER(TRIM(COALESCE(role, ''))) = 'teacher' THEN 'teacher'
              WHEN LOWER(TRIM(COALESCE(role, ''))) IN ('', 'student') THEN 'student'
              ELSE 'other' END AS rk,
         COUNT(DISTINCT uid) AS people,
         ${LIVE_AVG_SQL}
    FROM vc_quality
   WHERE ts >= ? AND room IS NOT NULL AND room <> '' AND avg_loss >= 0
   GROUP BY room, rk
   LIMIT 1000`;

export interface LiveRoleRow {
  room?: unknown; rk?: unknown; people?: unknown; avg_loss?: unknown; avg_rtt?: unknown;
}
export interface LineByRole {
  role: LineRole; people: number; avg_loss: number | null; avg_rtt: number | null;
}

/* 숫자가 아니면 «모름» — 0 으로 바꾸지 않는다 */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 방 목록(방 단위 쿼리 결과)마다 by_role 을 붙인다. 역할 행이 없는 방은 그대로 둔다(화면은 예전 한 줄). */
export function attachRoleSplit<T extends { room?: unknown }>(rooms: T[], rows: LiveRoleRow[]): Array<T & { by_role?: LineByRole[] }> {
  const by = new Map<string, LineByRole[]>();
  for (const r of rows || []) {
    const room = r && typeof r.room === 'string' ? r.room : '';
    if (!room) continue;
    const role: LineRole = (LINE_ROLE_ORDER as readonly unknown[]).includes(r.rk) ? (r.rk as LineRole) : 'other';
    const list = by.get(room) || [];
    list.push({ role, people: Math.max(0, Number(r.people) || 0), avg_loss: numOrNull(r.avg_loss), avg_rtt: numOrNull(r.avg_rtt) });
    by.set(room, list);
  }
  return (rooms || []).map((rm) => {
    const list = by.get(String(rm && rm.room));
    if (!list || !list.length) return rm;
    list.sort((a, b) => LINE_ROLE_ORDER.indexOf(a.role) - LINE_ROLE_ORDER.indexOf(b.role));
    return { ...rm, by_role: list };
  });
}
