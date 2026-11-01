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

/* ⏭ (2026-10-09) 매주 반복 수업의 «그 주 하루만 빠지는 날» — class_schedules.skip_dates TEXT
 *   ('YYYY-MM-DD' 를 쉼표로 이은 목록). 그 날 그 반복 줄은 열리지 않는다.
 *   쓰는 곳은 src/recurring-one-week.ts 하나(연기·변경 승인). 옮긴 수업은 «하루짜리 새 줄» 이다.
 *   ⛔ 깨진 조각은 버린다(모르는 값으로 수업을 숨기지 않는다 — 막는 쪽으로 실패하지 않기). */
export function normSkipDates(v: any): string[] {
  const out: string[] = [];
  for (const part of String(v ?? '').split(',')) {
    const t = part.trim().slice(0, 10);
    if (!YMD.test(t)) continue;
    const d = new Date(t + 'T00:00:00Z');   // 2026-02-30 같은 «모양만 맞는» 날짜도 버린다
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== t) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out.sort();
}

/** 그 반복 줄이 ymd 에 «빠지는 날» 로 지정됐나. 날짜 지정 행은 언제나 false. */
export function recurSkippedOn(row: any, ymd: string): boolean {
  if (!row || row.scheduled_date) return false;
  if (!YMD.test(String(ymd || ''))) return false;
  return normSkipDates(row.skip_dates).includes(String(ymd));
}

export function recurStartedOn(row: any, ymd: string, opts: { createdFallback?: boolean } = {}): boolean {
  if (!row) return true;
  if (row.scheduled_date) return true;
  /* ⏭ 그 주만 빠지는 날이면 «열리지 않음» — 이 함수를 지나는 읽는 곳 전부(학생 입장·강사 화면·
     알림·결석 감지·지금 수업·겹침 검사)가 한 번에 따라온다. */
  if (recurSkippedOn(row, ymd)) return false;
  let s = normStartsOn(row.starts_on);
  if (!s && opts.createdFallback) s = kstYmdOfMs(row.created_at);
  if (!s || !YMD.test(String(ymd || ''))) return true;
  return String(ymd) >= s;
}

/* ⚠️ «DB 바인딩 객체» 별로 기억한다 — 격리 전체에 한 값을 두면 DB 가 다른 곳(하니스·다른 env)에서
   «칸이 있다» 를 믿고 SELECT 해 조회가 통째로 죽는다(lesson_reminder_delivery_harness 가 잡았다). */
const _hasCol = new WeakMap<object, Promise<number>>();

/** starts_on(+ skip_dates) 칸을 (없으면) 만들고, 지금 무엇이 있는지 돌려준다. DB 바인딩당 한 번.
 *  0 = 둘 다 없음 · 1 = starts_on 만 · 2 = 둘 다. (참/거짓으로 읽어도 예전과 같은 뜻이다)
 *  ⚠️ 실패하면 그 칸을 빼고 «예전처럼» 돈다 — skip_dates 가 없으면 빠지는 날이 없는 것으로 본다. */
export function ensureStartsOnColumn(env: any): Promise<number> {
  const db = env && env.DB;
  if (!db) return Promise.resolve(0);
  const hit = _hasCol.get(db);
  if (hit) return hit;
  const p = (async () => {
    try { await db.exec(`ALTER TABLE class_schedules ADD COLUMN starts_on TEXT`); } catch {}
    try { await db.exec(`ALTER TABLE class_schedules ADD COLUMN skip_dates TEXT`); } catch {}
    try {
      const r = await db.prepare(`PRAGMA table_info(class_schedules)`).all();
      const cols = ((r && r.results) || []).map((c: any) => c && c.name);
      if (!cols.includes('starts_on')) return 0;
      return cols.includes('skip_dates') ? 2 : 1;
    } catch { return 0; }
  })();
  _hasCol.set(db, p);
  p.then((ok) => { if (ok < 2) _hasCol.delete(db); }, () => { _hasCol.delete(db); });
  return p;
}

/** SELECT 목록에 붙일 조각. 칸이 없으면 NULL 로 채워 모양을 맞춘다(skip_dates 도 함께). */
export function startsOnSel(has: boolean | number, alias = ''): string {
  const a = alias ? alias + '.' : '';
  const so = has ? `, ${a}starts_on` : `, NULL AS starts_on`;
  const sk = Number(has) >= 2 ? `, ${a}skip_dates` : `, NULL AS skip_dates`;
  return so + sk;
}
