/* ═══════════════════════════════════════════════════════════════════════
   🔔 강사에게 «수업 취소·연기·변경» 웹푸시 (2026-11-11 필리핀 매니저 maimai 요청)
   ───────────────────────────────────────────────────────────────────────
   [왜] 학생·관리자가 수업을 취소·연기해도 강사는 달력을 열어 봐야 알았다
        (학생 이름·시각·유료/무료가 담긴 알림은 관리자 카톡으로만 갔다 — api-admin-class-days.ts · api-mango.ts).
   [무엇] 변경 이력이 적히는 두 자리 — writeClassAudit(class-audit.ts) · 이동 엔진(class-schedule-move.ts) — 가
        이 함수를 부른다 → «학생 · 원래 시각 · 취소/연기/옮김 · 몇 분 전 변경(30분 이내 표시)» 를 담당 강사 폰으로.
   🔒 안 보내는 경우: 강사 본인이 한 변경 · 시각을 모름(매주 반복 줄 전체) ·
        시작 30분 뒤가 지났거나 24시간보다 먼 수업(멀리 있는 변경은 달력으로 충분 — 수강 취소가 미래 수업
        수십 개를 지울 때 폰이 수십 번 울리지 않게).
   💰 (2026-11-11 사장님 결정 «시간만 표시») 알림에 Paid/Unpaid 는 싣지 않는다 — 급여는 날짜 없는 연기에만 30분 규칙을
        쓰고(다른 날로 옮김·취소는 원래 자리 0원) 알림이 돈을 약속하면 급여와 어긋난다. 금액은 강사 화면 «급여» 에서.
   ⛔ 던지지 않는다 — 부르는 쪽은 수업 취소·이동을 «이미 저장한 뒤» 다. 여기서 던지면 «저장됐는데 실패» 응답이 된다.
   ═══════════════════════════════════════════════════════════════════════ */
import { pushToTeacher } from './teacher-push';
import { POSTPONE_FREE_MINUTES_GT } from './session-ledger';   // 30분 경계 — 급여·학생 원장과 같은 값
import { recurSkippedOn } from './class-start-date';

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
}

const md = (d: string) => String(d || '').slice(5, 10).replace('-', '/');
const hm = (t: string) => String(t || '').slice(0, 5);

/** 순수 — 알림 제목·본문(EN/KO). 하니스가 직접 돌린다. */
export function classChangeAlertText(i: ClassChangeAlertInput): { title: string; en: string; ko: string } {
  const when = `${md(i.date)} ${hm(i.time)}`;
  const who = i.student || 'Student';
  const m = Math.ceil(i.minutesBefore);
  const in30 = i.minutesBefore >= 0 && i.minutesBefore <= POSTPONE_FREE_MINUTES_GT;   // 요청 fee_type 'paid' 와 같은 경계(30분 «초과» 여야 사전 변경)
  const leadEn = (i.minutesBefore < 0 ? 'after the class started' : m < 60 ? `${m} min before class` : `${Math.floor(m / 60)} h ${m % 60} min before class`) + (in30 ? ' — within 30 min' : '');
  const leadKo = (i.minutesBefore < 0 ? '수업 시작 뒤' : m < 60 ? `수업 ${m}분 전` : `수업 ${Math.floor(m / 60)}시간 ${m % 60}분 전`) + ' 변경' + (in30 ? ' · 30분 이내' : '');
  const to = i.toDate ? `${md(i.toDate)} ${hm(i.toTime || '')}`.trim() : '';
  if (i.kind === 'cancel') return {
    title: `❌ Class cancelled · 수업 취소 (${when})`,
    en: `${who} — ${when} class was cancelled (${leadEn}).`,
    ko: `${who} — ${when} 수업이 취소됐습니다 (${leadKo}).`,
  };
  if (i.kind === 'move') return {
    title: `📅 Class moved · 수업 변경 (${when}${to ? ' → ' + to : ''})`,
    en: `${who} — ${when} class ${to ? 'moved to ' + to : 'was rescheduled'} (${leadEn}).`,
    ko: `${who} — ${when} 수업이 ${to ? to + '(으)로 옮겨졌' : '변경됐'}습니다 (${leadKo}).`,
  };
  return {
    title: `⏸ Class postponed · 수업 연기 (${when})`,
    en: `${who} — ${when} class was postponed (${leadEn}). No need to wait in the room.`,
    ko: `${who} — ${when} 수업이 연기됐습니다 (${leadKo}). 방에서 기다리지 않아도 됩니다.`,
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
    const row: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE id = ?`).bind(sid).first();   // * — skip_dates 는 지연 ALTER 칸
    const tid = a.teacher_id ?? (row && row.teacher_id);
    if (!row || !tid) return 'no_teacher';
    const st = String(row.status || 'active');
    const rDate = String(row.scheduled_date || '').slice(0, 10);
    const rTime = String(row.start_time || '').slice(0, 5).padStart(5, '0');
    let kind: ClassChangeAlertInput['kind'];
    if (action === 'remove' || st === 'cancelled') kind = 'cancel';
    else if (st === 'postponed') kind = 'postpone';
    else if (rDate && (rDate !== date || rTime !== time)) kind = 'move';
    /* 매주 반복 줄의 한 회차 — 그 날이 «실제로 빠졌을 때만»(skip_dates). 옛 요청의 «기록만» 승인(applied='recorded')은
       회차가 그대로 열려 있으니 «기다리지 않아도 됩니다» 를 보내면 수업을 놓친다(PR #2275 Codex P1). */
    else if (!rDate && recurSkippedOn(row, date)) kind = action === 'postpone' ? 'postpone' : 'move';
    else return 'no_visible_change';                                        // 같은 날·같은 시각(강사만 바뀜 등)
    // 강사가 함께 바뀌는 경로(이동 엔진·요청 승인·자동 연기)는 «원래» 강사 id 를 a.teacher_id 로 넘긴다 — 없으면 지금 담당.
    const msg = classChangeAlertText({
      kind, student: String(a.student_name || row.student_name || ''), date, time,
      minutesBefore: (startMs - nowMs) / 60000,
      toDate: kind === 'move' ? rDate || null : null, toTime: kind === 'move' ? rTime : null,
    });
    const pr = await pushToTeacher(env, tid, msg.title, msg.en + '\n' + msg.ko, '/teacher', `class-change-${sid}-${date}`);
    return pr.sent > 0 ? 'sent' : (pr.why || 'not_sent');
  } catch (e: any) {
    try { console.warn('[teacher-change-alert] skipped:', e?.message || e); } catch {}
    return 'error';
  }
}
