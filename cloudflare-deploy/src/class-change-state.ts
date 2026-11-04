/* 🧾 「취소 · 연기」 칸 정본 (2026-11-03)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 2026-11-02 Maimai 매니저가 lby01(BELLE) 14:00 수업을 「수업 취소」 했더니 관리자·매니저
        「오늘 수업」 목록과 강사 시간표에서 **통째로 사라졌다.** 데이터는 지워지지 않았다 —
        DELETE /api/admin/class-schedules/:id 는 행을 status='cancelled' 로 내릴 뿐이다
        (D1 실측: #4327 status=cancelled 그대로 남아 있음). 사라진 것은 «조회» 였다:
        `status != 'cancelled'` 로 걸러서 화면이 그 줄을 아예 못 받았다.
        → 사람이 본 것은 «수업이 없어졌다» 였고, 취소인지 연기인지 사고인지 구분할 수 없었다.
        요청(매니저): «취소해도 지우지 말고, 취소·연기 상태를 칸으로 보여 달라».

   [규칙]
     ① «취소된 회차» = **날짜가 정해진 행(scheduled_date 있음)** 이면서 status='cancelled'.
        ⛔ 매주 반복 행(scheduled_date 없음)의 cancelled 는 «회차» 가 아니다 — 「날짜별로 나누기」가
           원본 매주 줄을 cancelled 로 내리고(schedule-split.ts) 수강 종료도 매주 줄을 내린다.
           그것까지 띄우면 매주 같은 자리에 «취소됨» 이 영원히 뜬다. (연기 정본 class-postponed.ts 와 같은 선)
     ② 「취소·연기」 칸은 상태 «하나» 만 말한다 — 취소 > 연기 > (날짜를 옮겨 온) 이동.
        이동은 이력(class_audit_log)의 연기·변경 기록이 «원래 날짜·시각» 을 갖고 있고, 그것이 지금
        날짜·시각과 다를 때만 말한다(같으면 이동이 아니다 — 강사만 바꾼 변경 등).
     ③ 누가·왜는 **본사·내부직원에게만** 싣는다(호출부가 showActor 로 정한다) — 지사·대리점에
        본사 직원 이름·내부 사유가 나가지 않게. «언제» 와 «원래 날짜» 는 누구에게나 사실이다.
     ④ 이력 조회는 best-effort — 실패하면 칸이 상태만 말한다(누가·언제 없이). 목록은 절대 안 죽는다.

   ⛔ 판정을 화면에 복제하지 말 것 — 서버가 `change` 로 내려주고 화면은 «그리기만» 한다.
   감시: test-harness/class_cancelled_visible_harness.mjs */

import { isPostponedOccurrence } from './class-postponed';
import { selectInChunks } from './d1-chunk';

/** 날짜가 정해진 회차가 «취소» 됐는가. 매주 반복 행은 언제나 false(위 규칙 ①). */
export function isCancelledOccurrence(r: any): boolean {
  if (!r) return false;
  const st = String(r.status ?? r.sched_status ?? '').trim().toLowerCase();
  if (st !== 'cancelled') return false;
  return String(r.scheduled_date ?? '').trim() !== '';
}

/** WHERE 조각 — «취소되지 않은 행» + «[from, to] 에 날짜가 잡힌 취소 행».
 *  ⚠️ 바인드 «2개»(from, to)를 이 조각 자리 순서대로 넣을 것.
 *  ⚠️ 별칭을 꼭 넘기세요(JOIN 이 있는 쿼리) — 접두사 없는 status·scheduled_date 는 teachers 와 겹쳐
 *     ambiguous 로 죽고 catch 폴백이 그것을 삼킨다(CLAUDE.md 2장 「JOIN 을 붙였더니 그 칸이 사라짐」). */
export function liveOrCancelledInRangeSql(alias = ''): string {
  const a = alias ? alias + '.' : '';
  return `(COALESCE(${a}status,'active') <> 'cancelled' OR substr(COALESCE(${a}scheduled_date,''),1,10) BETWEEN ? AND ?)`;
}

/* 'moved_away' (2026-11-04) = «이 날짜에서 다른 날로 옮겨 간» 회차 — 원래 날짜 목록에만 남기는 줄(아래 judgeMovedAway). */
export type ClassChangeKind = 'cancelled' | 'postponed' | 'moved' | 'moved_away';

export interface ClassChange {
  kind: ClassChangeKind;
  /** 처리한 시각(ms) — 이력이 없으면 null */
  at: number | null;
  /** 처리한 사람 — 본사·내부직원에게만, 모르면 null */
  by: string | null;
  /** 사유 — 본사·내부직원에게만, 없으면 null */
  reason: string | null;
  /** moved 일 때 원래 날짜(YYYY-MM-DD)·시각(HH:MM) */
  from_date: string | null;
  from_time: string | null;
  /** moved 의 종류 — 'postpone'(연기로 옮김) | 'reschedule'(변경으로 옮김) */
  via: 'postpone' | 'reschedule' | null;
  /** 화면에 그대로 쓰는 글자(KO/EN) — 세 화면(admin·manager·branch)이 문구를 따로 만들지 않게 여기서 한 번만 만든다 */
  label_ko: string;
  label_en: string;
  /** 처리 시각 KST «MM/DD HH:MM» — 없으면 null */
  at_kst: string | null;
  /** moved_away 일 때 지금 자리(옮겨 간 날짜·시각) — 그 밖에는 없음 */
  to_date?: string | null;
  to_time?: string | null;
}

export interface AuditLite {
  action?: any;
  schedule_id?: any;
  lesson_date?: any;
  lesson_time?: any;
  actor?: any;
  reason?: any;
  created_at?: any;
  id?: any;
}

const CANCEL_ACTIONS = ['remove', 'end', 'cancel'];
const MOVE_ACTIONS = ['postpone', 'reschedule'];
/** 이 정본이 읽는 이력 종류 전부 — 조회 SQL 이 이 목록을 그대로 쓴다(두 벌 금지). */
export const CLASS_CHANGE_AUDIT_ACTIONS = [...CANCEL_ACTIONS, ...MOVE_ACTIONS];

function ymd(v: any): string {
  const s = String(v ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function hhmm(v: any): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  return (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2];
}
/** KST «MM/DD HH:MM» (ms → 글자). 숫자가 아니면 null. */
function kstShort(ms: number | null): string | null {
  if (!(Number(ms) > 0)) return null;
  const k = new Date(Number(ms) + 9 * 3600000).toISOString();
  return k.slice(5, 10).replace('-', '/') + ' ' + k.slice(11, 16);
}
/** 화면 글자 — 상태별 KO/EN. moved 는 «원래 MM/DD HH:MM» 을 붙인다. */
function labelsOf(kind: ClassChangeKind, via: ClassChange['via'], fromDate: string | null, fromTime: string | null): { ko: string; en: string } {
  if (kind === 'cancelled') return { ko: '✕ 취소됨', en: '✕ Cancelled' };
  if (kind === 'postponed') return { ko: '⏸ 연기됨 — 새 날짜 미정', en: '⏸ Postponed — no new date' };
  const from = ((fromDate ? fromDate.slice(5).replace('-', '/') : '') + (fromTime ? ' ' + fromTime : '')).trim();
  return via === 'postpone'
    ? { ko: `📅 ${from} 에서 연기됨`, en: `📅 Postponed from ${from}` }
    : { ko: `📅 ${from} 에서 옮김`, en: `📅 Moved from ${from}` };
}
function latest(list: AuditLite[], actions: string[]): AuditLite | null {
  let best: AuditLite | null = null;
  for (const e of list) {
    if (!e || !actions.includes(String(e.action || ''))) continue;
    const t = Number(e.created_at) || 0, bt = best ? (Number(best.created_at) || 0) : -1;
    if (!best || t > bt || (t === bt && (Number(e.id) || 0) > (Number(best.id) || 0))) best = e;
  }
  return best;
}

/** 한 줄의 「취소·연기」 상태. 말할 것이 없으면 null(화면은 «—»).
 *  row = class_schedules 한 행(status·scheduled_date·start_time), audits = 그 행의 이력(순서 무관). */
export function judgeClassChange(row: any, audits: AuditLite[] | null | undefined, opt: { showActor: boolean }): ClassChange | null {
  if (!row) return null;
  const list = Array.isArray(audits) ? audits : [];
  const who = (e: AuditLite | null) => (opt.showActor && e && String(e.actor || '').trim()) ? String(e.actor).trim().slice(0, 80) : null;
  const why = (e: AuditLite | null) => (opt.showActor && e && String(e.reason || '').trim()) ? String(e.reason).trim().slice(0, 300) : null;
  const when = (e: AuditLite | null) => (e && Number(e.created_at) > 0) ? Number(e.created_at) : null;
  const base = (kind: ClassChangeKind, e: AuditLite | null, via: ClassChange['via'] = null, fromDate: string | null = null, fromTime: string | null = null): ClassChange => {
    const l = labelsOf(kind, via, fromDate, fromTime);
    return { kind, at: when(e), by: who(e), reason: why(e), from_date: fromDate, from_time: fromTime, via,
      label_ko: l.ko, label_en: l.en, at_kst: kstShort(when(e)) };
  };

  if (isCancelledOccurrence(row)) return base('cancelled', latest(list, CANCEL_ACTIONS));
  if (isPostponedOccurrence(row)) return base('postponed', latest(list, ['postpone']));

  // 이동 — 날짜가 정해진 «살아 있는» 회차만. 이력의 원래 자리가 지금 자리와 다를 때만 말한다.
  const curDate = ymd(row.scheduled_date);
  if (!curDate) return null;
  const st = String(row.status ?? row.sched_status ?? 'active').trim().toLowerCase();
  if (st && st !== 'active') return null;
  const e = latest(list, MOVE_ACTIONS);
  if (!e) return null;
  const fromDate = ymd(e.lesson_date), fromTime = hhmm(e.lesson_time);
  if (!fromDate) return null;
  const curTime = hhmm(row.start_time);
  if (fromDate === curDate && (!fromTime || !curTime || fromTime === curTime)) return null;
  return base('moved', e, String(e.action) === 'postpone' ? 'postpone' : 'reschedule', fromDate, fromTime || null);
}

/** 이력 조회 — schedule_id 별 묶음. 실패하면 빈 Map(⚠️ 그때 complete=false 로 «못 물어봤다» 를 알린다). */
export async function loadClassChangeAudits(db: any, scheduleIds: any[]): Promise<{ bySchedule: Map<string, AuditLite[]>; complete: boolean }> {
  const ids = Array.from(new Set((scheduleIds || []).map(x => Number(x)).filter(n => Number.isSafeInteger(n) && n > 0)));
  const bySchedule = new Map<string, AuditLite[]>();
  if (!ids.length) return { bySchedule, complete: true };
  let complete = true;
  try {
    const acts = CLASS_CHANGE_AUDIT_ACTIONS.map(a => `'${a}'`).join(',');
    const rows = await selectInChunks<AuditLite>(db, ids,
      (ph) => `SELECT id, action, schedule_id, lesson_date, lesson_time, actor, reason, created_at
                 FROM class_audit_log WHERE schedule_id IN (${ph}) AND action IN (${acts})`,
      { swallowErrors: true, onChunkError: () => { complete = false; } });
    for (const r of rows) {
      const k = String(r.schedule_id);
      const arr = bySchedule.get(k);
      if (arr) arr.push(r); else bySchedule.set(k, [r]);
    }
  } catch { complete = false; }
  return { bySchedule, complete };
}

/* ⏸ «원래 날짜» 에 남기는 줄 (2026-11-04)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 매니저(Mai) «취소·연기를 지우지 말고 칸으로 보여 달라» 의 두 번째 절반. 취소(2026-11-03)는 행이 그 날짜에
        남아 «✕ 취소됨» 으로 보이는데, 날짜를 정해 연기한 수업(«한 회 뒤로 밀기», «지정한 날짜로 연기», 강사·학생 연기)은
        **같은 schedule 행을 새 날짜로 옮긴다**(PR #1889 규칙 — 되돌리면 안 됨). 그래서 원래 날짜 목록에서는
        수업이 «통째로 사라졌다»(D1 행은 새 날짜에 그대로 있다).
   [무엇] 원래 날짜에 «⏸ 연기됨 → 11/11 15:50» 줄을 «읽기 전용» 으로 돌려준다. 행을 새로 만들지 않는다(D1 쓰기 0).
   [근거] 둘 다 «옮긴 그 batch 안에서» 함께 저장되는 기록이다 —
     · schedule_change_requests 승인 행(status='approved', orig_date·orig_time = 접수 때 서버가 적은 원래 자리)
     · class_audit_log 'postpone'·'reschedule'(lesson_date·lesson_time = 옮기기 전 자리 — class-schedule-move.ts 는 batch 안)
     ⛔ 'restore' 는 안 읽는다 — «연기 취소» 는 원래 자리로 «돌아온» 것이라 남길 줄이 없다.
   [규칙]
     ① **지금 행이 결정한다** — 날짜가 정해진 행(scheduled_date)이고, 그 날짜가 이 날과 «다를 때만».
        같은 날로 돌아왔으면(되돌림·같은 날 시각만 변경) 줄을 안 만든다(그 행이 그 날 목록에 이미 있다).
        ⛔ 매주 반복 행(scheduled_date 없음)은 «옮겨 간 회차» 가 아니다 — 그 주 하루 연기는 자리표시 행이 이미 그 날에 있다.
     ② 글자는 «지금 자리» 로 만든다 — 기록의 new_date 가 아니라(그 뒤 또 옮겼을 수 있다). 늦은 날이면 «⏸ 연기됨 →»,
        이른 날이면 «📅 앞당김 →»(앞당긴 것을 «연기» 라 부르면 거짓이다). 지금 행이 취소·연기 상태면 그 사실을 덧붙인다.
     ③ 누가·왜는 본사·내부직원에게만(showActor) — judgeClassChange 와 같은 규칙.
     ④ 기록이 없으면 줄도 없다 — 지어내지 않는다(옛 요청은 orig_date 가 비어 있을 수 있다).
   ⛔ 이 줄에는 입장·참관·연기·대체강사·피드백 버튼을 주지 않는다(부르는 쪽이 moved_away:true 로 표시 — 그 방에는 수업이 없다).
   ⛔ 학생 입장·결석 감지·리마인더·급여는 이 함수를 «안» 읽는다 — 보여 주기 전용이다. */

export interface MovedAwayEvent {
  schedule_id: string;
  /** 원래 날짜(YYYY-MM-DD)·시각(HH:MM) */
  from_date: string;
  from_time: string | null;
  at: number | null;
  by: string | null;
  reason: string | null;
}

/** 키 — 한 수업이 한 날짜에서 한 번만 «옮겨 간» 줄을 갖는다. */
export function movedAwayKey(scheduleId: any, fromDate: string): string {
  return String(scheduleId) + '|' + String(fromDate);
}

/** [from, to] 날짜 범위에서 «원래 자리였던» 이동 기록을 모은다. 실패하면 그 근거만 빠지고 complete=false. 던지지 않는다. */
export async function loadMovedAwayEvents(db: any, fromDate: string, toDate: string): Promise<{ byKey: Map<string, MovedAwayEvent>; complete: boolean }> {
  const byKey = new Map<string, MovedAwayEvent>();
  let complete = true;
  const f = ymd(fromDate), t = ymd(toDate);
  if (!f || !t || !db) return { byKey, complete: !db ? false : true };
  const put = (e: MovedAwayEvent) => {
    if (!e.schedule_id || !/^\d+$/.test(e.schedule_id) || !e.from_date) return;
    const k = movedAwayKey(e.schedule_id, e.from_date);
    const old = byKey.get(k);
    // 같은 자리 기록이 둘이면 «나중 것»(같은 시각이면 누가가 있는 것)
    if (!old || (Number(e.at) || 0) > (Number(old.at) || 0) || ((Number(e.at) || 0) === (Number(old.at) || 0) && !old.by && e.by)) byKey.set(k, e);
  };
  const str = (v: any, n: number) => { const x = String(v ?? '').trim(); return x ? x.slice(0, n) : null; };
  try {
    const rs: any = await db.prepare(
      `SELECT schedule_id, orig_date, orig_time, decided_by, decided_at, reason
         FROM schedule_change_requests
        WHERE status = 'approved' AND schedule_id IS NOT NULL
          AND substr(COALESCE(orig_date,''),1,10) BETWEEN ? AND ?
        LIMIT 3000`
    ).bind(f, t).all();
    for (const r of ((rs?.results as any[]) || [])) {
      put({ schedule_id: String(r.schedule_id ?? '').trim(), from_date: ymd(r.orig_date), from_time: hhmm(r.orig_time) || null,
        at: Number(r.decided_at) > 0 ? Number(r.decided_at) : null, by: str(r.decided_by, 80), reason: str(r.reason, 300) });
    }
  } catch { complete = false; }
  try {
    const acts = MOVE_ACTIONS.map(a => `'${a}'`).join(',');
    const rs: any = await db.prepare(
      `SELECT schedule_id, lesson_date, lesson_time, actor, reason, created_at
         FROM class_audit_log
        WHERE action IN (${acts}) AND schedule_id IS NOT NULL
          AND substr(COALESCE(lesson_date,''),1,10) BETWEEN ? AND ?
        LIMIT 3000`
    ).bind(f, t).all();
    for (const r of ((rs?.results as any[]) || [])) {
      put({ schedule_id: String(r.schedule_id ?? '').trim(), from_date: ymd(r.lesson_date), from_time: hhmm(r.lesson_time) || null,
        at: Number(r.created_at) > 0 ? Number(r.created_at) : null, by: str(r.actor, 80), reason: str(r.reason, 300) });
    }
  } catch { complete = false; }
  return { byKey, complete };
}

/** 원래 날짜(ev.from_date)에 남길 「취소 · 연기」 칸. 남길 것이 없으면 null(규칙 ①~④). */
export function judgeMovedAway(row: any, ev: MovedAwayEvent | null | undefined, opt: { showActor: boolean }): ClassChange | null {
  if (!row || !ev) return null;
  const from = ymd(ev.from_date);
  const cur = ymd(row.scheduled_date);
  if (!from || !cur || cur === from) return null;                 // ① 매주 반복 행·아직 그 날에 있는 행은 아니다
  if (String(row.id ?? ev.schedule_id) !== String(ev.schedule_id)) return null;
  const curTime = hhmm(row.start_time);
  const to = cur.slice(5).replace('-', '/') + (curTime ? ' ' + curTime : '');
  const later = cur > from;
  let ko = later ? `⏸ 연기됨 → ${to}` : `📅 앞당김 → ${to}`;
  let en = later ? `⏸ Postponed → ${to}` : `📅 Moved earlier → ${to}`;
  const st = String(row.status ?? row.sched_status ?? 'active').trim().toLowerCase();
  if (st === 'cancelled') { ko += ' · 그 뒤 취소됨'; en += ' · later cancelled'; }
  else if (st === 'postponed') { ko += ' · 그 뒤 다시 연기(날짜 미정)'; en += ' · postponed again (no date)'; }
  const at = Number(ev.at) > 0 ? Number(ev.at) : null;
  return {
    kind: 'moved_away', at,
    by: (opt.showActor && ev.by) ? String(ev.by).slice(0, 80) : null,
    reason: (opt.showActor && ev.reason) ? String(ev.reason).slice(0, 300) : null,
    from_date: from, from_time: hhmm(ev.from_time) || null, via: null,
    label_ko: ko, label_en: en, at_kst: kstShort(at),
    to_date: cur, to_time: curTime || null,
  };
}
