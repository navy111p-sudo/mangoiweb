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

export type ClassChangeKind = 'cancelled' | 'postponed' | 'moved';

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
