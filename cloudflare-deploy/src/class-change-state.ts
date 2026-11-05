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
import { normSkipDates } from './class-start-date';

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
        🔁 매주 반복 행(scheduled_date 없음)은 «그 주 하루만» 옮긴 경우만 줄을 만든다(2026-11-04 — recurring-one-week.ts):
           반복 행의 skip_dates 에 그 날이 «있을 때만»(없으면 «앞으로 계속» 시간표 변경이거나 기록만 남은 옛 요청 — 그 날
           수업은 그대로 열린다). 옮겨 간 곳은 그 하루짜리 줄(source='recurring-week:<반복 id>', notes 의 «<원래 날짜> 회차»)의
           «지금 자리» 다. 그 줄이 원래 날짜에 있으면(날짜 없이 연기 — status='postponed' 기록 줄) 그 줄이 이미 «⏸ 연기됨»
           으로 보이므로 null(두 줄이 되지 않게). 그 줄을 못 찾으면 기록의 «새 날짜» 로, 그것도 없으면 «이 날은 수업 없음»
           까지만 말한다(날짜를 지어내지 않는다).
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
  /** 그때 적힌 «새 날짜·시각»(요청의 new_date·new_time / 이력 detail 의 «→ 날짜 시각»). 매주 반복 수업에서
   *  옮겨 간 하루짜리 줄을 못 찾았을 때만 쓴다 — 날짜 지정 행은 언제나 «지금 행» 이 정본이다. */
  to_date?: string | null;
  to_time?: string | null;
}

/** 이력 detail 의 «→ 2026-11-12 09:30» — prepareRecurringOneWeek·자동승인 경로가 적는 모양(api-admin.ts decide). */
const MOVE_TO_RE = /→\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/;

function moveToOf(detail: any): { to_date: string | null; to_time: string | null } {
  const m = MOVE_TO_RE.exec(String(detail ?? ''));
  const d = m ? ymd(m[1]) : '';
  return { to_date: d || null, to_time: d ? (hhmm(m![2]) || null) : null };
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
  /* 💰 비용(2026-11-04 함정 대조): orig_date·lesson_date 는 substr 비교라 인덱스를 못 탄다 — 그대로면 «지금까지의 승인·이동
     전부» 를 매번 훑는다(강사 포털은 자동 새로고침마다). 두 표 모두 (status|action, created_at) 인덱스가 있으므로
     «원래 날짜보다 400일 넘게 앞서 적힌 기록» 을 잘라 범위 스캔으로 만든다 — 1년 넘게 미리 잡은 연기는 실재하지 않는다. */
  const since = Date.parse(f + 'T00:00:00+09:00') - 400 * 86400000;
  /* ⚠️ 잘렸으면 «다 물어봤다» 가 아니다 — LIMIT 을 넘긴 만큼은 줄이 빠지므로 complete=false 로 알린다. */
  const CAP = 3000;
  try {
    const rs: any = await db.prepare(
      `SELECT schedule_id, orig_date, orig_time, new_date, new_time, decided_by, decided_at, reason
         FROM schedule_change_requests
        WHERE status = 'approved' AND created_at >= ? AND schedule_id IS NOT NULL
          AND substr(COALESCE(orig_date,''),1,10) BETWEEN ? AND ?
        LIMIT ${CAP + 1}`
    ).bind(since, f, t).all();
    const list: any[] = (rs?.results as any[]) || [];
    if (list.length > CAP) complete = false;
    for (const r of list.slice(0, CAP)) {
      put({ schedule_id: String(r.schedule_id ?? '').trim(), from_date: ymd(r.orig_date), from_time: hhmm(r.orig_time) || null,
        at: Number(r.decided_at) > 0 ? Number(r.decided_at) : null, by: str(r.decided_by, 80), reason: str(r.reason, 300),
        to_date: ymd(r.new_date) || null, to_time: hhmm(r.new_time) || null });
    }
  } catch { complete = false; }
  try {
    const acts = MOVE_ACTIONS.map(a => `'${a}'`).join(',');
    const rs: any = await db.prepare(
      `SELECT schedule_id, lesson_date, lesson_time, actor, reason, detail, created_at
         FROM class_audit_log
        WHERE action IN (${acts}) AND created_at >= ? AND schedule_id IS NOT NULL
          AND substr(COALESCE(lesson_date,''),1,10) BETWEEN ? AND ?
        LIMIT ${CAP + 1}`
    ).bind(since, f, t).all();
    const list: any[] = (rs?.results as any[]) || [];
    if (list.length > CAP) complete = false;
    for (const r of list.slice(0, CAP)) {
      put({ schedule_id: String(r.schedule_id ?? '').trim(), from_date: ymd(r.lesson_date), from_time: hhmm(r.lesson_time) || null,
        at: Number(r.created_at) > 0 ? Number(r.created_at) : null, by: str(r.actor, 80), reason: str(r.reason, 300),
        ...moveToOf(r.detail) });
    }
  } catch { complete = false; }
  return { byKey, complete };
}

/* 🔁 «그 주 하루만» 옮긴 매주 반복 수업의 하루짜리 줄(recurring-one-week.ts 가 만든다).
   source='recurring-week:<반복 id>', notes='반복수업 <원래 날짜> 회차를 옮김(…)' / '… 회차 연기(…)'. */
export const RECUR_WEEK_CHILD_PREFIX = 'recurring-week:';

/** 🗂️ (2026-11-04) `class_schedules.source` 색인 — 아래 `source IN (...)` 가 표를 통째로 훑지 않게.
 *  [잰 것 — 운영 D1] 7,575행 · 그 조회 한 번에 rows_read 7,575(색인 없음). «오늘 수업»·주간 시간표를 열 때마다 돈다.
 *  다른 조회도 이 색인을 받는다 — `source = ?`(수강신청 묶음 adm-enroll:*·enroll:* 등, 대상이 좁다) · `id = ? AND source = ?`(PK 가 이김).
 *  ⚠️ 새 조회를 쓸 때 — 운영 D1 에 통계(sqlite_stat1)가 없고 [잰 것 — 2026-11-04] `source` 값이 한쪽으로 몰려 있다
 *     (c24-mirror 5,915 / 7,575행). 그래서 «넓은 source 값 + 좁은 색인 칸»(예: `user_id = ? AND source = 'c24-mirror'`)을
 *     함께 걸면 플래너가 좋은 색인을 버리고 이 색인으로 c24-mirror 행 전체를 훑을 수 있다(로컬 SQLite 실행 계획으로 확인 — 2026-11-04
 *     함정 대조). 지금 그런 모양의 조회는 없다. 쓰게 되면 EXPLAIN QUERY PLAN 으로 확인하고, 필요하면 `+source`(색인 안 쓰기)로 쓸 것.
 *  ⛔ exec 로 바꾸지 말 것 — D1 exec 는 줄마다 따로 실행한다(한 줄 prepare().run()).
 *  한 isolate 에 한 번만 시도(성공·실패 모두 — 이미 있으면 IF NOT EXISTS 가 아무 일도 안 한다). 실패해도 조회는 그대로(색인은 속도일 뿐). */
let _sourceIdxTried = false;
export async function ensureScheduleSourceIndex(db: any): Promise<void> {
  if (_sourceIdxTried || !db) return;
  _sourceIdxTried = true;
  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_sched_source ON class_schedules(source)').run(); } catch { /* 색인이 없어도 조회는 된다 */ }
}

/** 반복 행 번호들 → 그 하루짜리 줄 목록. 실패하면 complete=false(그 줄만 «새 날짜 모름» 으로 떨어진다). 던지지 않는다. */
export async function loadRecurWeekChildren(db: any, parentIds: any[]): Promise<{ byParent: Map<string, any[]>; complete: boolean }> {
  const byParent = new Map<string, any[]>();
  let complete = true;
  const srcs = Array.from(new Set((parentIds || []).map(x => String(x ?? '').trim()).filter(x => /^\d+$/.test(x))))
    .map(x => RECUR_WEEK_CHILD_PREFIX + x);
  if (!srcs.length || !db) return { byParent, complete: !db && srcs.length ? false : true };
  await ensureScheduleSourceIndex(db);
  try {
    const rows = await selectInChunks<any>(db, srcs,
      (ph) => `SELECT id, scheduled_date, start_time, status, source, notes, teacher_id, user_id FROM class_schedules WHERE source IN (${ph})`,
      { swallowErrors: true, onChunkError: () => { complete = false; } });
    for (const r of rows || []) {
      const pid = String(r.source || '').slice(RECUR_WEEK_CHILD_PREFIX.length);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(r);
    }
  } catch { complete = false; }
  return { byParent, complete };
}

/** 그 원래 날짜의 하루짜리 줄 하나(같은 날이 둘이면 «나중에 만든 것» = id 큰 것). 없으면 null. */
export function recurWeekChildFor(list: any[] | null | undefined, fromDate: string): any | null {
  const d = ymd(fromDate);
  if (!d || !Array.isArray(list)) return null;
  const hit = list.filter(c => String(c?.notes ?? '').includes(`${d} 회차`));
  if (!hit.length) return null;
  hit.sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
  return hit[0];
}

/** «같은 자리» 열쇠 — 날짜|HH:MM|학생. 원래 날짜에 이미 줄(연기 기록 줄·새로 잡은 수업)이 있으면 반복 행의 줄은 안 만든다.
 *  날짜나 학생을 모르면 '' — 아래 movedAwayBlocked 는 빈 열쇠로 아무것도 안 막는다(모르는 둘을 하나로 합치면 남의 줄을 숨긴다). */
export function slotKeyOf(date: any, time: any, uid: any): string {
  const d = ymd(date), u = String(uid ?? '').trim();
  if (!d || !u) return '';
  return d + '|' + hhmm(time) + '|' + u;
}

/** «한 자리에 하나» — 원래 날짜에 «옮겨 감» 줄을 넣기 «전» 에 묻는다(관리자 «오늘 수업»·주간 시간표·강사 달력이 같은 규칙).
 *  taken: 그 날 이미 있는 진짜 줄의 자리 — 매주 반복 행에서 온 줄만 비켜 간다(날짜 지정 행의 줄은 예전 동작 그대로).
 *  ghosts: 이미 넣은 «옮겨 감» 줄의 자리 — 누구든 비켜 간다. 같은 회차가 «반복 행 승인 기록» 과 «하루짜리 줄을 다시 옮긴 기록»
 *  두 번 잡히는 경우가 있다(날짜 없이 연기 → 그 기록 줄을 나중에 다시 잡음 — 2026-11-04 함정 대조가 실제 핸들러로 재현).
 *  ⚠️ 넣을 때마다 ghosts 에 더해야 하고, 넣는 차례는 movedAwayOrder 로(날짜 지정 행 먼저). */
export function movedAwayBlocked(key: string, recur: boolean, taken: Set<string>, ghosts: Set<string>): boolean {
  if (!key) return false;
  return ghosts.has(key) || (recur && taken.has(key));
}

/** 넣는 차례 — 날짜 지정 행(그 회차의 «지금 자리» 를 가진 행) 먼저 0, 매주 반복 행 나중 1. 겹치면 반복 행 쪽이 빠진다. */
export function movedAwayOrder(row: any): number {
  return ymd(row && row.scheduled_date) ? 0 : 1;
}

/** 원래 날짜(ev.from_date)에 남길 「취소 · 연기」 칸. 남길 것이 없으면 null(규칙 ①~④).
 *  child — 매주 반복 행일 때만: 그 날짜의 «그 주 하루만» 줄(recurWeekChildFor). 날짜 지정 행에는 안 쓴다. */
export function judgeMovedAway(row: any, ev: MovedAwayEvent | null | undefined, opt: { showActor: boolean }, child?: any): ClassChange | null {
  if (!row || !ev) return null;
  const from = ymd(ev.from_date);
  if (!from) return null;
  if (String(row.id ?? ev.schedule_id) !== String(ev.schedule_id)) return null;
  const cur = ymd(row.scheduled_date);
  let toDate = '', toTime = '', st = '';
  if (cur) {
    if (cur === from) return null;                                // ① 아직 그 날에 있는 행 — 그 날 목록에 이미 있다
    toDate = cur; toTime = hhmm(row.start_time);
    st = String(row.status ?? row.sched_status ?? 'active').trim().toLowerCase();
  } else {
    /* 🔁 매주 반복 행 — «그 주 하루만» 옮겼을 때만(skip_dates 에 그 날이 있어야). 없으면 그 날 수업은 그대로 열린다. */
    if (!normSkipDates(row.skip_dates).includes(from)) return null;
    const cDate = child ? ymd(child.scheduled_date) : '';
    if (cDate === from) return null;                              // 날짜 없이 연기 — 그 날의 «⏸ 연기됨» 기록 줄이 이미 있다
    if (cDate) {
      toDate = cDate; toTime = hhmm(child.start_time);
      st = String(child.status ?? 'active').trim().toLowerCase();
    } else {
      const td = ymd(ev.to_date);
      if (td && td !== from) { toDate = td; toTime = hhmm(ev.to_time); }
    }
  }
  let ko: string, en: string;
  if (toDate) {
    const to = toDate.slice(5).replace('-', '/') + (toTime ? ' ' + toTime : '');
    const later = toDate > from;
    ko = later ? `⏸ 연기됨 → ${to}` : `📅 앞당김 → ${to}`;
    en = later ? `⏸ Postponed → ${to}` : `📅 Moved earlier → ${to}`;
    if (st === 'cancelled') { ko += ' · 그 뒤 취소됨'; en += ' · later cancelled'; }
    else if (st === 'postponed') { ko += ' · 그 뒤 다시 연기(날짜 미정)'; en += ' · postponed again (no date)'; }
  } else {
    ko = '⏸ 연기됨 — 이 날은 수업 없음'; en = '⏸ Postponed — no class this day';
  }
  const at = Number(ev.at) > 0 ? Number(ev.at) : null;
  return {
    kind: 'moved_away', at,
    by: (opt.showActor && ev.by) ? String(ev.by).slice(0, 80) : null,
    reason: (opt.showActor && ev.reason) ? String(ev.reason).slice(0, 300) : null,
    from_date: from, from_time: hhmm(ev.from_time) || null, via: null,
    label_ko: ko, label_en: en, at_kst: kstShort(at),
    to_date: toDate || null, to_time: toTime || null,
  };
}

/* ↩ «옮긴 수업 되돌리기» 판정 정본 (2026-11-04 매니저 Mai «I postpone the class but there's no restore or undo postponement option»)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 날짜를 정해 연기·변경한 수업은 원래 날짜에 «⏸ 연기됨 → 11/11 20:00» 줄(moved_away)로 남는데, 그 줄은 읽기 전용이라
        되돌릴 길이 없었다. «↩ 연기 취소»(action:'restore')는 «날짜 없이 연기»(status='postponed', 같은 날짜)한 줄에만 있다 —
        날짜를 정해 옮긴 행은 새 날짜에서 다시 active 라 그 경로가 받지 않는다(⛔ 그 status 검사를 풀지 말 것 — CLAUDE.md
        «Postponed restore vs permanent time change»).
   [무엇] 되돌리기 = «지금 자리의 그 행» 을 원래 날짜·시각으로 «다시 옮기기»(PR #1889 — 같은 행이 옮겨 다닌다, 새 행 없음).
        이 함수는 «되돌릴 수 있나 · 무엇을 · 어디로» 만 판정한다(D1 안 읽음). 오늘 수업 API(버튼을 줄지)와 되돌리기 API(실제로
        할지)가 «같은 이 함수» 를 부른다 — 두 벌이면 «버튼은 있는데 누르면 거절» 이 생긴다.
   [규칙]
     · 대상(target) = 날짜 지정 행이면 그 행, 매주 반복 행이면 «그 주 하루만» 줄(recurWeekChildFor). 못 찾으면 no_target
       (기록의 새 날짜만 아는 경우 — 무엇을 옮길지 모른다).
     · 원래 시각을 모르면 no_time(지어내지 않는다).
     · 원래 시각이 이미 시작했거나 지났으면 orig_passed(지난 시각에 «예정» 수업을 만들면 결석 감지·급여가 엉킨다 — restore 와 같은 선).
     · 대상이 active 가 아니면(그 뒤 취소·다시 연기) target_not_active — 새 날짜 줄에서 처리한다.
     · 대상(새 자리)이 이미 시작했거나 지났으면 target_started(앞당겨 이미 끝난 수업을 다시 끌어오지 않는다).
   ⛔ 출석 기록·겹침·강사 휴가는 여기서 안 본다 — D1 이 필요해 실제 이동(class-schedule-move.ts undoMove)이 같은 batch 안에서 본다.
   ⛔ 강사는 되돌리지 않는다(날짜·시각만). 옮기면서 강사도 바꿨다면 그 변경은 남는다 — 기록에 «원래 강사» 가 없다. */
export type MovedAwayUndoBlock = 'no_target' | 'no_time' | 'orig_passed' | 'target_not_active' | 'target_started';

export interface MovedAwayUndo {
  historical_available?: boolean;
  /** ↩ (2026-11-06) 옮겨 간 새 자리가 «그 뒤 취소» 됐고 아직 시작 전이면 true — 원래 날짜 줄에서 바로 «취소 수업 복원»
   *  (action:'restore' → 대상 행, 정본 restoreCancelled 엔진)을 줄 수 있다. 원래 시각이 지났어도 된다(새 자리에 다시 여는 것). */
  restore_cancelled_available?: boolean;
  /** 대상(새 자리)의 날짜·시각 — «취소 수업 복원» 확인창에 그대로 보여 준다(화면이 지어내지 않게). */
  target_date?: string | null;
  target_time?: string | null;
  ok: boolean;
  /** 안 되는 이유(ok=false 일 때만) */
  reason: MovedAwayUndoBlock | null;
  /** 돌아갈 자리 — 원래 날짜(YYYY-MM-DD)·시각(HH:MM) */
  from_date: string;
  from_time: string | null;
  /** 실제로 옮길 행 번호(날짜 지정 행 = 그 행, 매주 반복 = 하루짜리 줄). 못 찾으면 null */
  target_id: string | null;
}

/** KST «날짜 + HH:MM» → ms. 모양이 틀리면 NaN. */
function kstStartMs(date: any, time: any): number {
  const d = ymd(date), t = hhmm(time);
  return d && t ? Date.parse(`${d}T${t}:00+09:00`) : NaN;
}

/** 원래 날짜 줄(judgeMovedAway 가 null 이 아니었던 줄)을 «되돌릴 수 있나». ch 가 moved_away 가 아니면 null.
 *  row·child 는 judgeMovedAway 에 넘긴 것과 같은 것. nowMs 는 부르는 쪽의 «지금». */
export function judgeMovedAwayUndo(row: any, ch: ClassChange | null | undefined, child: any, nowMs: number): MovedAwayUndo | null {
  if (!row || !ch || ch.kind !== 'moved_away') return null;
  const from = ymd(ch.from_date);
  if (!from) return null;
  const fromTime = hhmm(ch.from_time);
  const target = ymd(row.scheduled_date) ? row : (child && ymd(child.scheduled_date) ? child : null);
  /* 새 자리(대상)의 상태·시작 시각 — 아래 판정과 «취소 수업 복원» 판정이 같은 값을 쓴다. */
  const tSt = target ? String(target.status ?? target.sched_status ?? 'active').trim().toLowerCase() : '';
  const tStart = target ? kstStartMs(target.scheduled_date, target.start_time) : NaN;
  /* ↩ (2026-11-06 사장님 «원래 시각이 지났어도 되돌리기 옵션을 달라» — 화면 «⏸ Postponed → 11/11 20:00 · later cancelled»
     + «Original time has passed — cannot undo»). 새 자리가 그 뒤 «취소» 됐고 아직 시작 전이면, 원래 날짜 줄에서 바로
     그 수업을 새 자리에 다시 열 수 있다 — 서버 정본 restore(restoreCancelled 엔진: 시작 여부·겹침·휴가·출석·동시 수정)를 그대로 탄다.
     ⛔ 지난 원래 시각에 «열린 수업» 을 만들지 않는다(결석 감지·급여 — PR #2109 가 버린 길). 복원 뒤에는 이 줄이 다시 판정되어
        원래 시각이 미래면 «↩ 원래대로», 지났으면 «↩ 과거 기록 정정» 이 뜬다. ⛔ 날짜 없이 다시 연기(postponed)된 대상은 해당 없음.
     ⚠️ 상태는 엔진(class-schedule-move.ts restoreCancelled: row.status === 'cancelled')과 «같은 정확일치» 로 본다 —
        다듬어 비교하면 «버튼은 보이는데 누르면 not_cancelled» 가 생긴다. */
  const restoreCancelled = !!target && target.id != null && target.status === 'cancelled' && Number.isFinite(tStart) && tStart > nowMs;
  const out = (reason: MovedAwayUndoBlock | null): MovedAwayUndo => ({
    ok: reason === null, reason, from_date: from, from_time: fromTime || null,
    target_id: target && target.id != null ? String(target.id) : null,
    target_date: target ? (ymd(target.scheduled_date) || null) : null,
    target_time: target ? (hhmm(target.start_time) || null) : null,
    restore_cancelled_available: restoreCancelled,
  });
  if (!target || target.id == null) return out('no_target');
  if (!fromTime) return out('no_time');
  const origStart = kstStartMs(from, fromTime);
  if (!Number.isFinite(origStart) || origStart <= nowMs) {
    const result = out('orig_passed');
    result.historical_available = !!ymd(row.scheduled_date) && Number.isFinite(origStart) && String(target.status ?? target.sched_status ?? 'active') === 'active' && Number.isFinite(tStart) && tStart > nowMs;
    return result;
  }
  if (tSt && tSt !== 'active') return out('target_not_active');
  if (!Number.isFinite(tStart) || tStart <= nowMs) return out('target_started');
  return out(null);
}
