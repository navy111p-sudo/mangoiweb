/**
 * end-makeup.ts — ⏸ «연기보강»: 이 회차를 수업 «끝» 다음 수업일로 옮긴다 (2026-10-02 사장님 제안)
 *
 * 「월수금 수업인데 금요일을 연기하면, 그 수업이 수업 종료 마지막 날 이후에 하루 더 추가되는 방식.
 *   11/1(월)이 종료일이면 11/3(수)로 하나 더 생기고, 이름은 «연기보강 (10월2일 연기)».」
 *
 * [어떻게] 새 줄을 만들지 않고 «그 회차 행» 을 새 날짜로 옮긴다 — 기존 «지정한 날짜로 연기» 와
 *   같은 길(/schedule-requests(change) → /decide)이라 겹침 검사·스코프·이력·미러 도장 규칙을
 *   그대로 받는다. 다른 점은 둘: 날짜를 «서버가» 계산하고, 옮긴 뒤 class_type='makeup' +
 *   메모에 «연기보강 (M월 D일 연기)» 를 붙인다.
 *
 * [날짜] 같은 학생·같은 시각의 «앞으로 잡힌 날짜 수업» 들이 한 묶음이다.
 *   그 묶음의 요일들 중, 마지막 수업(이 회차 제외) 다음에 오는 첫 요일.
 *   ⚠️ 그래서 여러 번 연기하면 줄줄이 뒤로 붙는다(두 번째 보강은 첫 보강 다음 수업일).
 * ⛔ 날짜를 화면이 정하게 두지 않는다 — 화면은 미리보기만 받는다(서버가 다시 계산).
 * ⛔ 반복 행(scheduled_date 없음)은 안 된다 — «그 날짜» 가 없다(먼저 날짜별로 나누기).
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dowOf = (ymd: string) => new Date(ymd + 'T00:00:00Z').getUTCDay();

/** 순수 함수. series = 묶음 전체(자기 포함), selfId 는 옮길 회차. 못 정하면 null. */
export function nextEndMakeupDate(series: { id: number; date: string }[], selfId: number): string | null {
  const valid = series.filter(s => s && YMD.test(String(s.date || '')));
  const self = valid.find(s => Number(s.id) === Number(selfId));
  if (!self) return null;
  const dows = Array.from(new Set(valid.map(s => dowOf(s.date))));
  const others = valid.filter(s => Number(s.id) !== Number(selfId)).map(s => s.date).sort();
  const last = others.length ? others[others.length - 1] : self.date;
  const base = last > self.date ? last : self.date;   // 이 회차가 맨 끝이면 그 뒤로
  for (let i = 1; i <= 14; i++) {
    const d = addDays(base, i);
    if (dows.includes(dowOf(d))) return d;
  }
  return null;
}

/** «연기보강 (10월 2일 연기)» — 메모·화면에 쓰는 이름. */
export function endMakeupLabel(origDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(origDate || ''));
  return m ? '연기보강 (' + Number(m[2]) + '월 ' + Number(m[3]) + '일 연기)' : '연기보강';
}

export function kstTodayYmd(nowMs = Date.now()): string {
  return new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface EndMakeupPlan { ok: boolean; reason?: string; new_date?: string; new_time?: string; last_date?: string; label?: string }

/** 그 회차의 연기보강 날짜를 계산한다(읽기만). */
export async function planEndMakeup(env: any, scheduleId: number, today = kstTodayYmd()): Promise<EndMakeupPlan> {
  const cs: any = await env.DB.prepare(
    `SELECT id, user_id, scheduled_date, start_time, status FROM class_schedules WHERE id = ? LIMIT 1`
  ).bind(scheduleId).first();
  if (!cs) return { ok: false, reason: 'not_found' };
  if (String(cs.status || '') !== 'active') return { ok: false, reason: 'not_active' };
  const self = String(cs.scheduled_date || '').slice(0, 10);
  if (!YMD.test(self)) return { ok: false, reason: 'not_dated' };
  const r: any = await env.DB.prepare(
    `SELECT id, scheduled_date FROM class_schedules
      WHERE user_id = ? AND start_time = ? AND status = 'active'
        AND scheduled_date IS NOT NULL AND scheduled_date >= ?`
  ).bind(cs.user_id, cs.start_time, today < self ? today : self).all();
  const series = ((r?.results as any[]) || []).map(x => ({ id: Number(x.id), date: String(x.scheduled_date).slice(0, 10) }));
  if (!series.some(s => s.id === Number(cs.id))) series.push({ id: Number(cs.id), date: self });
  const nd = nextEndMakeupDate(series, Number(cs.id));
  if (!nd) return { ok: false, reason: 'no_next_date' };
  const others = series.filter(s => s.id !== Number(cs.id)).map(s => s.date).sort();
  return { ok: true, new_date: nd, new_time: String(cs.start_time || '').slice(0, 5), last_date: others[others.length - 1] || self, label: endMakeupLabel(self) };
}

/** 옮긴 «뒤» 에 붙이는 문장 — /decide 가 이동과 같은 batch 에 넣는다. */
export const END_MAKEUP_MARK_SQL =
  `UPDATE class_schedules SET class_type = 'makeup', notes = COALESCE(notes || ' · ', '') || ? WHERE id = ?`;
