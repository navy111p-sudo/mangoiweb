/* 📅 (2026-09-24) 매주 반복 수업의 «시작일» — 정본 한 곳.
 *
 * [왜] 학생 상세 「수업 예약 등록」의 «매주 반복» 에 시작일 칸이 없었다(사장님 제보
 *   「수업 시작 일자가 써있지 않아」). 반복 행은 day_of_week 만 들고 있어서
 *   ① 캘린더가 등록하기 «전» 인 지난달까지 거꾸로 그렸고(「수업을 입력하면 뒤로 수업이 가」)
 *   ② 다음 달부터 시작할 수업을 미리 넣을 방법이 없었다.
 *
 * [저장] class_schedules.starts_on TEXT ('YYYY-MM-DD'). 지연 ALTER 로 생긴다.
 *   ⛔ scheduled_date 에 넣지 말 것 — 읽는 쪽 전부가 «날짜가 있으면 그 하루만» 으로 읽어
 *      «매주» 가 그 자리에서 죽는다(CLAUDE.md 2장 드래그 이동 항목).
 *
 * [판정] recurStartedOn(row, ymd) — 반복 행이 그 날짜에 «이미 시작했는가».
 *   - 날짜 지정 행(scheduled_date)은 이 함수와 무관 → true.
 *   - starts_on 이 모양에 맞으면 ymd >= starts_on.
 *   - 모르면(비었거나 깨졌으면) true — ⛔ 막는 쪽으로 실패하지 말 것. 수업이 조용히
 *     사라지는 것이 더 나쁘다(옛 반복 행은 전부 이 칸이 비어 있다).
 *   캘린더처럼 «과거» 를 그리는 곳은 opts.createdFallback 으로 created_at 날짜를
 *   바닥으로 쓴다(시작일이 없던 옛 행이 등록 전 과거로 번지지 않게).
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function normStartsOn(v: any): string | null {
  const s = String(v ?? '').trim().slice(0, 10);
  return YMD.test(s) ? s : null;
}

/** created_at(ms) → KST 'YYYY-MM-DD'. 모르면 null. */
export function kstYmdOfMs(ms: any): string | null {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function recurStartedOn(row: any, ymd: string, opts: { createdFallback?: boolean } = {}): boolean {
  if (!row) return true;
  if (row.scheduled_date) return true;
  let s = normStartsOn(row.starts_on);
  if (!s && opts.createdFallback) s = kstYmdOfMs(row.created_at);
  if (!s || !YMD.test(String(ymd || ''))) return true;
  return String(ymd) >= s;
}

/* ⚠️ «DB 바인딩 객체» 별로 기억한다 — 격리 전체에 한 값을 두면 DB 가 다른 곳(하니스·다른 env)에서
   «칸이 있다» 를 믿고 SELECT 해 조회가 통째로 죽는다(lesson_reminder_delivery_harness 가 잡았다). */
const _hasCol = new WeakMap<object, Promise<boolean>>();

/** starts_on 칸을 (없으면) 만들고, 지금 있는지 돌려준다. DB 바인딩당 한 번.
 *  ⚠️ 실패하면 false — 부르는 쪽은 SELECT 에 그 칸을 넣지 않고 «예전처럼» 돈다. */
export function ensureStartsOnColumn(env: any): Promise<boolean> {
  const db = env && env.DB;
  if (!db) return Promise.resolve(false);
  const hit = _hasCol.get(db);
  if (hit) return hit;
  const p = (async () => {
    try { await db.exec(`ALTER TABLE class_schedules ADD COLUMN starts_on TEXT`); } catch {}
    try {
      const r = await db.prepare(`PRAGMA table_info(class_schedules)`).all();
      return ((r && r.results) || []).some((c: any) => c && c.name === 'starts_on');
    } catch { return false; }
  })();
  _hasCol.set(db, p);
  p.then((ok) => { if (!ok) _hasCol.delete(db); }, () => { _hasCol.delete(db); });
  return p;
}

/** SELECT 목록에 붙일 조각. 칸이 없으면 NULL 로 채워 모양을 맞춘다. */
export function startsOnSel(has: boolean, alias = ''): string {
  return has ? `, ${alias ? alias + '.' : ''}starts_on` : `, NULL AS starts_on`;
}
