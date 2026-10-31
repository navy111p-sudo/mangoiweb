/**
 * 🔄 수업 «변경(앞으로 계속)» — 이어지는 회차를 한꺼번에 옮길 계획을 세우는 정본 (순수 함수)
 *
 * (2026-09-23 사장님) 「연기는 지정한 날짜에 한 번이고, 변경은 계속이야.」
 *   · 연기(완전히 / 지정 날짜) = 그 회 하나 → 이미 있는 /schedule-requests(+decide) 를 그대로 쓴다.
 *   · 변경 = 이 회부터 «앞으로 전부» → 이 파일이 «어느 행이 같은 시리즈인가» 를 정하고
 *     enroll-ops.ts 의 POST /api/pay/enroll/admin/series-move 가 적용한다.
 *
 * ✅ 같은 시리즈 = 같은 학생·같은 출처(source)·같은 담당 강사·같은 시각·같은 요일·active,
 *    그리고 기준 회 «이후» (기준 회 포함). 날짜 지정 수업만 대상이다 — 매주 반복 행
 *    (scheduled_date 가 빈 행)은 한 행이 이미 «매주 전부» 라 시간표에서 옮긴다.
 * ⛔ 카페24 미러 행(source 가 c24-mirror 로 시작)은 막는다 — 카페24 가 정본이라 여기서 옮겨도
 *    밤마다 미러가 옛 시간표로 다음 회차를 다시 만든다. «카페24에서 바꾸세요» 로 말한다.
 * ⛔ 요일을 «숫자 칸(day_of_week)» 으로 보지 않는다 — 표기가 세 벌이다(CLAUDE.md 2장).
 *    날짜에서 UTC 로 요일을 뽑는다(로컬 시간대면 하루 밀린다).
 */

export interface SeriesRow {
  id: any;
  user_id?: any;
  scheduled_date?: any;
  start_time?: any;
  teacher_id?: any;
  source?: any;
  status?: any;
}

export interface SeriesItem {
  id: number;
  from_date: string;
  from_time: string;
  to_date: string;
  to_time: string;
}

/* ⚠️ 한 가지 모양 — tsconfig 가 strict 가 아니라 판별 유니온이 좁혀지지 않는다(CLAUDE.md 2장). */
export type SeriesPlan = { ok: boolean; error: string; delta_days: number; items: SeriesItem[] };
const fail = (error: string): SeriesPlan => ({ ok: false, error, delta_days: 0, items: [] });

/** 한 번에 옮길 수 있는 최대 회차 — 넘으면 거절한다(잘라서 반쪽만 옮기지 않는다). */
export const SERIES_MAX = 60;

export function normDate(v: any): string {
  const s = String(v ?? '').trim().replace(/\//g, '-').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  // ⚠️ 모양만 맞는 없는 날짜(2026-13-99)는 Date 가 NaN → addDays 가 던져 500 이 된다.
  const t = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : '';
}
export function normTime(v: any): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return '';
  return (h < 10 ? '0' : '') + h + ':' + m[2];
}
function dayNum(iso: string): number {
  return Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
}
export function addDays(iso: string, n: number): string {
  return new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);
}
export function dowOf(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}
export function isMirrorSource(src: any): boolean {
  return /^c24-mirror/.test(String(src ?? ''));
}

/**
 * 기준 회(anchor)와 그 학생의 후보 행들로 «앞으로 계속» 옮길 계획을 세운다.
 * ⚠️ 쓰기는 하지 않는다 — 겹침 검사·적용은 부르는 쪽이 한다.
 */
export function planSeries(anchor: SeriesRow, rows: SeriesRow[], newDate: any, newTime: any, max: number = SERIES_MAX): SeriesPlan {
  if (!anchor || String(anchor.status || '') !== 'active') return fail('schedule_not_found');
  const aDate = normDate(anchor.scheduled_date);
  const aTime = normTime(anchor.start_time);
  if (!aDate || !aTime) return fail('weekly_row');
  if (isMirrorSource(anchor.source)) return fail('mirror_series');
  const nd = normDate(newDate);
  const nt = normTime(newTime);
  if (!nd || !nt) return fail('bad_params');
  const delta = dayNum(nd) - dayNum(aDate);
  if (delta === 0 && nt === aTime) return fail('no_change');

  const uid = String(anchor.user_id ?? '');
  const src = String(anchor.source ?? '');
  const tid = String(anchor.teacher_id ?? '');
  const dow = dowOf(aDate);
  const seen = new Set<string>();
  const picked: SeriesRow[] = [];
  for (const r of [anchor].concat(rows || [])) {
    if (!r) continue;
    const id = String(r.id ?? '');
    if (!id || seen.has(id)) continue;
    const d = normDate(r.scheduled_date);
    if (String(r.status || '') !== 'active') continue;
    if (String(r.user_id ?? '') !== uid) continue;
    if (String(r.source ?? '') !== src) continue;
    if (String(r.teacher_id ?? '') !== tid) continue;
    if (normTime(r.start_time) !== aTime) continue;
    if (!d || d < aDate || dowOf(d) !== dow) continue;
    seen.add(id);
    picked.push(r);
  }
  if (picked.length > max) return fail('too_many');
  picked.sort((a, b) => (normDate(a.scheduled_date) < normDate(b.scheduled_date) ? -1 : 1));
  return {
    ok: true, error: '',
    delta_days: delta,
    items: picked.map((r) => {
      const d = normDate(r.scheduled_date);
      return { id: Number(r.id), from_date: d, from_time: aTime, to_date: addDays(d, delta), to_time: nt };
    }),
  };
}

/** 겹침 결과에서 «같은 시리즈 자신» 을 뺀다 — 한 주 뒤로 옮기면 다음 회의 옛 자리와 겹쳐 보인다. */
export function realConflict(c: { has: boolean; student: any[]; teacher: any[]; cap?: any }, seriesIds: Set<string>): boolean {
  if (!c || !c.has) return false;
  if (c.cap) return true;
  const other = (x: any) => !seriesIds.has(String(x && x.id));
  return (c.student || []).some(other) || (c.teacher || []).some(other);
}
