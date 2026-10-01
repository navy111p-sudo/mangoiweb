/* ⏸ 「연기된 회차」 판정 정본 (2026-10-01)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 2026-10-01 Farrah(FAR) 14:00 수업을 「⏸ 연기 · 날짜 없이」로 처리했는데
        「오늘 수업」 목록이 계속 「🟢 Open · Join」으로 그렸다. 서버는 그 행을
        status='postponed' 로 바꿨는데(/api/admin/schedule-requests/decide),
        그 값을 읽는 곳이 **한 군데도 없었다** — 다들 `status != 'cancelled'` 만 봤다.
        그래서 연기한 수업도 ① 관리자·매니저·지사 「오늘 수업」 ② 학생 입장
        (/api/class/sessions/today) ③ 30분 전 알림 ④ 결석 감지에 그대로 걸렸다.
        에러는 안 난다 — 화면은 정상이고 «연기» 만 조용히 무시된다.

   [규칙] **날짜가 정해진 행(scheduled_date 있음)** 이면서 status 가 'postponed' 일 때만
          «오늘 열리지 않는 회차» 로 본다.
     ⛔ 매주 반복 행(scheduled_date 없음)에는 적용하지 않는다 — 한 행이 «매주 전부» 라
        status 하나로 거르면 그 주만이 아니라 **모든 주가 사라진다.** 서버의 연기 승인도
        반복 행은 status 를 안 바꾸고 'recorded' 로 남긴다(같은 이유). 다른 경로(AI 명령)가
        반복 행을 'postponed' 로 만들었다면 예전처럼 그대로 보인다 — 새로 잃는 것이 없다.
     ⛔ 'cancelled' 와 합치지 않는다 — 급여는 둘을 다르게 센다(postponed_pay_percent).

   [짝] 연기한 회차를 «다시 잡으면»(날짜·시각을 옮기면) status 를 'active' 로 되돌려야 한다.
        안 그러면 새 날짜에서도 숨는다. → PATCH /api/admin/class-schedules/:id 와
        /schedule-requests/decide 의 'moved' 경로가 `REACTIVATE_POSTPONED_SQL` 를 함께 돌린다.

   감시: test-harness/class_postponed_harness.mjs */

export function isPostponedOccurrence(r: any): boolean {
  if (!r) return false;
  const st = String(r.status ?? r.sched_status ?? '').trim().toLowerCase();
  if (st !== 'postponed') return false;
  return String(r.scheduled_date ?? '').trim() !== '';
}

/** 연기됐던 회차를 다시 잡을 때 «열린 수업» 으로 되돌린다(연기 상태가 아니면 아무것도 안 함). */
export const REACTIVATE_POSTPONED_SQL =
  `UPDATE class_schedules SET status = 'active' WHERE id = ? AND status = 'postponed'`;

/* ⏭ 「반복 수업의 그 회차만 빠짐」 판정 정본 (2026-10-01)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 반복 행(scheduled_date 없음)은 한 줄이 «매주 전부» 라 status 를 바꿀 수 없다(위 ⛔).
        그래서 학생이 «이번 금요일만» 연기를 내고 관리자가 승인해도 서버는 'recorded' 로
        기록만 하고 아무것도 안 바꿨다 → 그날도 입장·알림·결석 감지가 그대로 돌았다
        (2026-10-01 jeong 10/2 금 19:20 — 승인됐는데 수업이 그대로 열릴 상태였다).
   [규칙] **승인된** 연기·변경 요청(schedule_change_requests, status='approved',
          request_type IN ('postpone','change'))의 (schedule_id, orig_date) 회차는 열리지 않는다.
     · 반복 행에만 적용한다 — 날짜 행은 승인 때 실제로 옮기거나 status='postponed' 로 바꾸므로
       (위 isPostponedOccurrence) 여기서 또 보면 «옮긴 새 날짜» 를 잘못 지울 수 있다.
     · 반복 행 자체는 **한 글자도 안 바꾼다**(absence-hold.ts 와 같은 방식 — 읽는 쪽이 본다).
     · 보강(새 일시)은 승인 때 별도의 일회성 행으로 만든다(/schedule-requests/decide).
   ⚠️ fail-open — 못 읽으면 빈 Map = «빠지는 회차 없음»(예전 동작 그대로). 막는 쪽으로 실패하면
      멀쩡한 수업이 통째로 사라진다.
   감시: test-harness/recurring_skip_harness.mjs */

/** 키 `${schedule_id}|${YYYY-MM-DD}` → { type: 'postpone'|'change', moved: 새 일시가 있었나 }.
 *  moved=true 면 보강 행이 따로 세어지므로 급여는 원래 회차를 세지 않는다(날짜 행 'moved' 와 같은 셈). */
export type OccurrenceSkips = Map<string, { type: string; moved: boolean }>;

export const OCCURRENCE_SKIPS_SQL =
  `SELECT schedule_id, orig_date, request_type, new_date, new_time FROM schedule_change_requests
    WHERE status = 'approved' AND request_type IN ('postpone','change')
      AND substr(orig_date, 1, 10) >= ? AND substr(orig_date, 1, 10) <= ?`;

export async function loadOccurrenceSkips(env: any, fromDate: string, toDate: string): Promise<OccurrenceSkips> {
  const out: OccurrenceSkips = new Map();
  try {
    const rs: any = await env.DB.prepare(OCCURRENCE_SKIPS_SQL).bind(String(fromDate).slice(0, 10), String(toDate).slice(0, 10)).all();
    for (const r of (rs?.results || []) as any[]) {
      if (r.schedule_id == null) continue;
      const d = String(r.orig_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      out.set(`${r.schedule_id}|${d}`, {
        type: String(r.request_type || 'postpone'),
        moved: !!(String(r.new_date || '').trim() && String(r.new_time || '').trim()),
      });
    }
  } catch (e: any) { console.warn('[class-postponed] skips load failed (fail-open):', e?.message); }
  return out;
}

/** 이 반복 행의 그 날짜 회차가 승인된 요청으로 «빠졌는가». 날짜 행은 언제나 false. */
export function isSkippedOccurrence(r: any, date: string, skips: OccurrenceSkips | null | undefined): boolean {
  if (!r || !skips || !skips.size) return false;
  if (String(r.scheduled_date ?? '').trim() !== '') return false;
  return skips.has(`${r.id}|${String(date || '').slice(0, 10)}`);
}

/** 빠진 회차의 정보(없으면 null) — 급여가 «연기 지급률» 과 «보강으로 옮김» 을 가를 때 쓴다. */
export function skippedInfo(r: any, date: string, skips: OccurrenceSkips | null | undefined): { type: string; moved: boolean } | null {
  if (!isSkippedOccurrence(r, date, skips)) return null;
  return skips!.get(`${r.id}|${String(date || '').slice(0, 10)}`) || null;
}

/* ⏭ 보강(새 일시)이 «반복 수업» 과 겹치는가 (2026-10-01)
   [왜] 공용 겹침 검사(findScheduleConflicts)의 일회성 갈래는 «그 날짜가 적힌 행» 만 본다 —
        매주 도는 반복 행은 안 본다. 그대로 쓰면 금 10/2 를 금 10/9 같은 시각으로 미는
        보강이 «그 학생의 10/9 정규 수업» 과 겹쳐도 통과한다(실측: jeong 요청 #13 이 그 모양).
   ⛔ 공용 검사를 고치지 않는다 — 수강신청·시간표 이동이 함께 쓰는 정본이라 반경이 크다.
      보강을 만드는 이 자리에서만 반복 행을 한 번 더 본다.
   규칙: 학생의 반복 행은 시간이 겹치면 충돌. 강사의 반복 행은 «같은 시각·같은 길이»(합반)가 아니면 충돌.
        그날 이미 빠진 회차(skips)는 빈자리로 본다. 요일을 모르면 «안 겹친다» 가 아니라 건너뛴다(모름).
   요일 판정은 absence-hold.ts 의 dowList 와 같은 규칙(숫자·영문·한글·나열) — 가벼운 모듈로 두려고 옮겨 적었다. */
const _DOW: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};
export function recurDows(raw: any): number[] {
  const out: number[] = [];
  for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
    const t = p.trim();
    if (!t) continue;
    let n: number | undefined;
    if (/^\d+$/.test(t)) { const v = Number(t); if (v >= 0 && v <= 6) n = v; }
    else n = _DOW[t.toLowerCase()];
    if (n !== undefined && out.indexOf(n) < 0) out.push(n);
  }
  return out;
}
const _mins = (hm: any): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
export function recurringClash(
  rows: any[],
  q: { date: string; start: string; dur: number; userId: string; teacherId: string },
  skips?: OccurrenceSkips | null,
): any | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(q.date || ''));
  const s0 = _mins(q.start);
  if (!dm || !Number.isFinite(s0)) return null;
  const dow = new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]))).getUTCDay();
  const e0 = s0 + (Number(q.dur) > 0 ? Number(q.dur) : 30);
  for (const r of rows || []) {
    if (!r || String(r.scheduled_date ?? '').trim() !== '') continue;           // 반복 행만
    if (String(r.status || 'active') !== 'active') continue;
    if (!recurDows(r.day_of_week).includes(dow)) continue;
    const so = String(r.starts_on ?? '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(so) && so > q.date) continue;              // 아직 시작 전인 반복
    if (isSkippedOccurrence(r, q.date, skips)) continue;                        // 그날은 이미 빠짐
    const s1 = _mins(r.start_time);
    if (!Number.isFinite(s1)) continue;
    const d1 = Number(r.duration_min) > 0 ? Number(r.duration_min) : 30;
    if (!(s0 < s1 + d1 && s1 < e0)) continue;                                   // 시간이 안 겹침
    const mine = q.userId && String(r.user_id ?? '') === String(q.userId);
    if (mine) return r;
    const sameTeacher = q.teacherId && String(r.teacher_id ?? '') === String(q.teacherId);
    if (sameTeacher) {
      const sameSlot = s1 === s0 && d1 === (Number(q.dur) > 0 ? Number(q.dur) : 30);
      if (!sameSlot) return r;                                                  // 합반이 아니면 충돌
    }
  }
  return null;
}
