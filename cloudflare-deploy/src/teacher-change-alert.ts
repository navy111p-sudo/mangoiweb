/* ═══════════════════════════════════════════════════════════════════════
   🔔 강사에게 «수업 취소·연기·변경» 웹푸시 (2026-11-11 필리핀 매니저 maimai 요청)
   ───────────────────────────────────────────────────────────────────────
   [왜] 학생·관리자가 수업을 취소·연기해도 강사는 달력을 열어 봐야 알았다
        (학생 이름·시각·유료/무료가 담긴 알림은 관리자 카톡으로만 갔다 — api-admin-class-days.ts · api-mango.ts).
   [무엇] 변경 이력이 적히는 두 자리 — writeClassAudit(class-audit.ts) · 이동 엔진(class-schedule-move.ts) — 가
        이 함수를 부른다 → «학생 · 원래 시각 · 취소/연기/옮김 · 몇 분 전 변경 · (연기면) Paid/Unpaid» 를 담당 강사 폰으로.
   🔒 안 보내는 경우: 강사 본인이 한 변경 · 시각을 모름(매주 반복 줄 전체) ·
        시작 30분 뒤가 지났거나 24시간보다 먼 수업(멀리 있는 변경은 달력으로 충분 — 수강 취소가 미래 수업
        수십 개를 지울 때 폰이 수십 번 울리지 않게).
   💰 Paid/Unpaid 는 «급여와 같은 근거» 일 때만 — 날짜 없이 «연기됨» 으로 남은 수업 + 승인된 요청의 fee_type +
        급여 규칙(postpone-pay.ts). 취소·다른 날로 옮김은 표시하지 않는다(급여가 그 자리를 따로 셈하지 않음 —
        «30분 안 취소도 지급?» 은 사장님 결정 대기, 2026-11-11).
   ⛔ 던지지 않는다 — 부르는 쪽은 수업 취소·이동을 «이미 저장한 뒤» 다. 여기서 던지면 «저장됐는데 실패» 응답이 된다.
   ═══════════════════════════════════════════════════════════════════════ */
import { pushToTeacher } from './teacher-push';
import { postponePayPercent, loadPostponePayRules } from './postpone-pay';

export const ALERT_AHEAD_MS = 24 * 3600 * 1000;
export const ALERT_AFTER_START_MS = 30 * 60 * 1000;

export interface ClassChangeAlertInput {
  kind: 'cancel' | 'postpone' | 'move';
  student: string;
  date: string;               // 원래 날짜 YYYY-MM-DD (KST)
  time: string;               // 원래 시각 HH:MM (KST)
  minutesBefore: number;      // 변경 시각 → 수업 시작까지(음수 = 시작 뒤)
  toDate?: string | null;     // move 일 때 새 날짜(모르면 비움)
  toTime?: string | null;
  payPct?: number | null;     // postpone 일 때만 — 급여 지급률, 모르면 null
}

const md = (d: string) => String(d || '').slice(5, 10).replace('-', '/');
const hm = (t: string) => String(t || '').slice(0, 5);

/** 순수 — 알림 제목·본문(EN/KO). 하니스가 직접 돌린다. */
export function classChangeAlertText(i: ClassChangeAlertInput): { title: string; en: string; ko: string } {
  const when = `${md(i.date)} ${hm(i.time)}`;
  const who = i.student || 'Student';
  const m = Math.round(i.minutesBefore);
  const leadEn = m < 0 ? 'after the class started' : m < 60 ? `${m} min before class` : `${Math.floor(m / 60)} h ${m % 60} min before class`;
  const leadKo = m < 0 ? '수업 시작 뒤' : m < 60 ? `수업 ${m}분 전` : `수업 ${Math.floor(m / 60)}시간 ${m % 60}분 전`;
  const p = typeof i.payPct === 'number' && Number.isFinite(i.payPct) ? i.payPct : null;   // 연기 문구에만 붙인다(아래)
  const payEn = p === null ? '' : ` · Pay: ${p >= 100 ? 'Paid' : p <= 0 ? 'Unpaid' : `Paid ${p}%`}`;
  const payKo = p === null ? '' : ` · 수업료: ${p >= 100 ? '지급' : p <= 0 ? '미지급' : `${p}% 지급`}`;
  const to = i.toDate ? `${md(i.toDate)} ${hm(i.toTime || '')}`.trim() : '';
  if (i.kind === 'cancel') return {
    title: `❌ Class cancelled · 수업 취소 (${when})`,
    en: `${who} — ${when} class was cancelled (${leadEn}).`,
    ko: `${who} — ${when} 수업이 취소됐습니다 (${leadKo} 변경).`,
  };
  if (i.kind === 'move') return {
    title: `📅 Class moved · 수업 변경 (${when}${to ? ' → ' + to : ''})`,
    en: `${who} — ${when} class ${to ? 'moved to ' + to : 'was rescheduled'} (${leadEn}).`,
    ko: `${who} — ${when} 수업이 ${to ? to + '(으)로 옮겨졌' : '변경됐'}습니다 (${leadKo} 변경).`,
  };
  return {
    title: `⏸ Class postponed · 수업 연기 (${when})`,
    en: `${who} — ${when} class was postponed (${leadEn})${payEn}. No need to wait in the room.`,
    ko: `${who} — ${when} 수업이 연기됐습니다 (${leadKo} 변경)${payKo}. 방에서 기다리지 않아도 됩니다.`,
  };
}

/** 변경 이력 한 줄 → 담당 강사 푸시. 결과 사유를 돌려준다(로그·하니스용). 절대 던지지 않는다. */
export async function alertTeacherOfClassChange(env: any, a: {
  action?: string | null; schedule_id?: any; lesson_date?: string | null; lesson_time?: string | null;
  student_name?: string | null; actor_role?: string | null; teacher_id?: any;
}, nowMs: number = Date.now()): Promise<string> {
  try {
    if (a.actor_role === 'teacher') return 'by_teacher';
    const action = String(a.action || '');
    if (action !== 'remove' && action !== 'postpone' && action !== 'reschedule') return 'not_change';
    const date = String(a.lesson_date || '').slice(0, 10);
    const time = String(a.lesson_time || '').slice(0, 5).padStart(5, '0');
    const startMs = Date.parse(`${date}T${time}:00+09:00`);
    if (!Number.isFinite(startMs)) return 'no_time';
    if (startMs > nowMs + ALERT_AHEAD_MS || startMs < nowMs - ALERT_AFTER_START_MS) return 'out_of_window';
    const sid = parseInt(String(a.schedule_id ?? ''), 10);
    if (!sid || !env?.DB) return 'no_schedule';
    const row: any = await env.DB.prepare(
      `SELECT teacher_id, student_name, scheduled_date, start_time, status FROM class_schedules WHERE id = ?`
    ).bind(sid).first();
    const tid = a.teacher_id ?? (row && row.teacher_id);
    if (!row || !tid) return 'no_teacher';
    const st = String(row.status || 'active');
    const rDate = String(row.scheduled_date || '').slice(0, 10);
    const rTime = String(row.start_time || '').slice(0, 5).padStart(5, '0');
    let kind: ClassChangeAlertInput['kind'];
    if (action === 'remove' || st === 'cancelled') kind = 'cancel';
    else if (st === 'postponed') kind = 'postpone';
    else if (rDate && (rDate !== date || rTime !== time)) kind = 'move';
    else if (!rDate) kind = action === 'postpone' ? 'postpone' : 'move';   // 매주 반복 줄의 한 회차 — 새 자리는 모른다
    else return 'no_visible_change';                                        // 같은 날·같은 시각(강사만 바뀜 등)
    let payPct: number | null = null;
    if (kind === 'postpone' && st === 'postponed' && rDate === date) {
      try {   // 급여(admin-lesson-fees.ts)와 같은 근거 — 그날의 마지막 승인 요청 fee_type, 없으면 기본 지급률
        const req: any = await env.DB.prepare(
          `SELECT fee_type FROM schedule_change_requests WHERE schedule_id = ? AND orig_date = ? AND status = 'approved'
             AND request_type != 'change' ORDER BY created_at DESC LIMIT 1`
        ).bind(sid, date).first();
        payPct = postponePayPercent(await loadPostponePayRules(env.DB), req ? req.fee_type : null);
      } catch { payPct = null; }   // 모르면 표시 안 함(지어내지 않는다)
    }
    // shortcut: 강사가 함께 바뀐 이동은 «지금» 담당(teacher_id)에게 간다 — 옛 강사에게 따로 알리려면 이동 엔진처럼 teacher_id 를 넘길 것.
    const msg = classChangeAlertText({
      kind, student: String(a.student_name || row.student_name || ''), date, time,
      minutesBefore: (startMs - nowMs) / 60000,
      toDate: kind === 'move' ? rDate || null : null, toTime: kind === 'move' ? rTime : null, payPct,
    });
    const pr = await pushToTeacher(env, tid, msg.title, msg.en + '\n' + msg.ko, '/teacher', `class-change-${sid}-${date}`);
    return pr.sent > 0 ? 'sent' : (pr.why || 'not_sent');
  } catch (e: any) {
    try { console.warn('[teacher-change-alert] skipped:', e?.message || e); } catch {}
    return 'error';
  }
}
