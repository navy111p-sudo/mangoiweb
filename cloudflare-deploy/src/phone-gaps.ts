/**
 * 📵 phone-gaps.ts — «수업은 있는데 문자를 받을 번호가 없는 학생» 목록 (2026-10-28 신설)
 *
 * [왜] 수업 30분 전 안내 문자(lesson-reminder.ts)는 수업을 정확히 찾는데, 받을 번호가 없어 대부분 안 나간다.
 *   [잰 것 — 2026-10-28 운영 D1, SELECT 만] 다음 7일 수업이 있는 학생 252명 중 발송 정본(phonesForStudent)으로
 *   번호가 잡히는 학생 **12명** · 못 잡히는 학생 **240명(95%)**. 그 240명 중 49명은 카페24 이탈위험 표
 *   (`student_retention`)에만 번호가 있다(누구 번호인지 — 학생/학부모 — 는 그 표에 없다).
 *   ⚠️ 표시 정본(loadContactPhones)으로 세면 61명으로 부풀어 보인다 — 그래서 여기는 `loadSendPhones`(발송 정본)로만 센다.
 *   ℹ️ 리마인더의 «login_id 로 한 번 더» 폴백은 같은 날 실측으로 늘어나는 학생이 0명이었다(그 폴백은 셈에 넣지 않는다).
 * [무엇] 매니저·관리자가 그 학생들을 한 화면에서 보고 그 자리에서 번호를 넣게 한다.
 *   저장은 이미 있는 `PATCH /api/admin/student/:uid/contact`(→ `student_erp_override`, 야간 동기화가 못 덮는 자리).
 * ⛔ 이탈위험 표의 번호는 «참고» 로만 보여 준다 — 자동으로 칸에 넣거나 저장하지 않는다
 *    (누구 번호인지 모르는 번호로 학부모에게 문자가 가면 빈칸보다 나쁘다).
 * ⛔ «어느 날 수업이 열리나» 를 따로 정하지 않는다 — 리마인더(runLessonReminderSweep)와 같은 규칙이어야 한다.
 *    `occursLikeReminder` 는 그 블록과 한 글자씩 같은 판정이고, 하니스가 그 블록을 오려 내 무작위로 대조한다.
 *    «알림 창»(시작 45~15분 전 · 15분 눈금)도 `reminderCanStillSend` 로 맞춘다 — 하니스가 리마인더의 창 계산을
 *    오려 내 «15분마다 돌려 보기» 로 대조한다. 그래서 이미 지난 수업·자정 직후 수업은 세지 않는다.
 *    ⚠️ 그래도 «복제» 다(리마인더가 이 함수를 부르지 않는다) — lesson-reminder.ts 를 고치면 하니스 B절이 어긋남을 잡는다.
 * ⚠️ fail-open — 번호 조회가 다 안 됐으면 `complete:false` 로 «일부만 확인» 이라고 말한다(«번호 없음» 으로 단정 금지).
 */

import { ensureStartsOnColumn, startsOnSel, recurStartedOn } from './class-start-date';
import { isPostponedOccurrence } from './class-postponed';
import { loadHolidayClosure, isHolidayClosedFor } from './holiday-closure';
import { loadSendPhones } from './notify-contacts';
import { selectInChunks } from './d1-chunk';
import { getSolapiMode } from './solapi-client';

export const PHONE_GAP_DAYS_DEFAULT = 7;
export const PHONE_GAP_DAYS_MAX = 14;
/** 리마인더 문자는 숫자 10자리부터 나간다 — 첫 관문 lesson-reminder-delivery.ts `deliverLessonReminder` 의 `normalized.length < 10`(국내 발송). */
export const SMS_MIN_DIGITS = 10;
/** 옛 LMS·시드 자리표시 — 진짜 학생이 아니다(schedule-conflict.ts 의 NOT_PLACEHOLDER 와 같은 두 값). */
const PLACEHOLDER_UIDS = new Set(['lms', 'type_seed']);

/** 오늘(KST)부터 days 일의 날짜·요일. */
export function kstDays(now: number, days: number): { ymd: string; dow: number }[] {
  const KST = 9 * 3600 * 1000;
  const out: { ymd: string; dow: number }[] = [];
  const k0 = new Date(now + KST);
  const base = Date.UTC(k0.getUTCFullYear(), k0.getUTCMonth(), k0.getUTCDate());
  const pad = (n: number) => String(n).padStart(2, '0');
  for (let i = 0; i < days; i++) {
    const d = new Date(base + i * 86400000);
    out.push({ ymd: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, dow: d.getUTCDay() });
  }
  return out;
}

/** 리마인더 «알림 창» — 시작 45~15분 전. lesson-reminder.ts 의 같은 이름 상수와 같은 값(하니스 B절이 소스에서 읽어 대조). */
export const REMIND_MIN_MS = 15 * 60 * 1000;
export const REMIND_MAX_MS = 45 * 60 * 1000;
const SWEEP_TICK_MS = 15 * 60 * 1000;   // 리마인더는 15분 감시견 cron(*/15, UTC·KST 같은 15분 눈금)에서 돈다

/** 지금(now) 이후 리마인더가 그 수업에 «아직» 문자를 보낼 수 있는가.
 *  리마인더는 15분마다 «오늘(KST) 수업» 만 보고 시작까지 15~45분 남은 것에 보낸다(lesson-reminder.ts).
 *  ⟹ 그 창 안에 «그날의» 15분 눈금이 now 뒤로 하나라도 있어야 한다. 이미 지난 수업·15분도 안 남은 수업,
 *     자정 직후(00:00~00:15) 수업, 시각이 비어 «00:00» 으로 읽히는 수업은 번호가 있어도 문자가 안 간다.
 *  ⚠️ 리마인더의 `now` 는 눈금 «정각» 이 아니다 — 15분 cron 안에서 감시견·녹화 마무리 등이 먼저 돌아 몇 초 늦다(δ>0).
 *     그래서 «정확히 15분 전» 눈금은 `until = 15분 − δ < 15분` 이라 «한 번도» 안 걸린다(그 뒤엔 받을 눈금도 없다).
 *     ⟹ 위쪽 끝은 «미포함»(`- 1`). 아래쪽 «정확히 45분 전» 은 `45분 − δ` 라 걸린다(포함). δ 가 1분보다 작다고 본다
 *     — 수업 시각은 분 단위라 그보다 작으면 답이 같다(하니스가 δ=1초·59초 둘 다로 리마인더를 돌려 대조). */
export function reminderCanStillSend(startTime: any, ymd: string, now: number): boolean {
  const [hh, mm] = String(startTime || '00:00').split(':').map((x: string) => Number(x));
  if (!Number.isFinite(hh)) return false;
  const [y, mo, d] = String(ymd).split('-').map((x: string) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return false;
  const KST = 9 * 3600 * 1000;
  const dayStart = Date.UTC(y, mo - 1, d) - KST;
  const start = Date.UTC(y, mo - 1, d, hh, mm || 0, 0) - KST;   // 리마인더와 같은 식(`mm || 0`)
  const lo = Math.max(now, start - REMIND_MAX_MS, dayStart);
  const hi = Math.min(start - REMIND_MIN_MS - 1, dayStart + 86400000 - 1);   // «정확히 15분 전» 은 미포함(위 주석)
  return Math.ceil(lo / SWEEP_TICK_MS) * SWEEP_TICK_MS <= hi;
}

/** 그날 리마인더가 이 수업을 «열리는 수업» 으로 보는가 — runLessonReminderSweep 의 판정과 같다(공휴일은 따로). */
export function occursLikeReminder(s: any, ymd: string, dow: number): boolean {
  let occurs = false;
  if (s.scheduled_date) occurs = (s.scheduled_date === ymd);
  else if (s.day_of_week != null && s.day_of_week !== '') occurs = (Number(s.day_of_week) === dow) && recurStartedOn(s, ymd);
  if (!occurs) return false;
  if (isPostponedOccurrence(s)) return false;
  return true;
}

/** 번호로 문자가 «실제로» 나가는가. 학생 번호가 학부모와 같으면 한 통만 나간다(리마인더와 같다). */
export function sendState(p: { student: string; parent: string } | undefined): { reach: boolean; short: number } {
  const par = String(p?.parent || '').replace(/[^0-9]/g, '');
  const stu = String(p?.student || '').replace(/[^0-9]/g, '');
  const ok = (x: string) => x.length >= SMS_MIN_DIGITS;
  if (ok(par) || ok(stu)) return { reach: true, short: 0 };
  const lens = [par.length, stu.length].filter(n => n > 0);
  return { reach: false, short: lens.length ? Math.max(...lens) : 0 };
}

export interface PhoneGap {
  uid: string;
  name: string;
  classes: number;                 // 창 안에 열리는 수업 수(회차)
  next_date: string;               // 가장 가까운 수업
  next_time: string;
  status: 'none' | 'short';        // none = 번호 없음 · short = 번호가 있지만 10자리 미만이라 안 나감
  short_len: number;               // short 일 때 그 번호의 자릿수
  hint_phone: string;              // 참고 — 카페24 이탈위험 표의 번호(표기 그대로, 누구 번호인지 모름). 없으면 ''
}

export interface PhoneGapResult {
  ok: boolean;
  error?: string;
  days: number;
  from: string;
  to: string;
  students: number;                // 창 안에 수업이 있는 학생 수
  reachable: number;               // 그중 문자가 실제로 갈 학생 수
  gaps: PhoneGap[];
  complete: boolean;               // false = 번호 조회를 다 못 했다(«번호 없음» 으로 단정하지 말 것)
  hint_complete: boolean;          // false = 참고 번호 조회가 실패했다
  sms_mode: string;                // real | mock | disabled
  reminder_enabled: boolean | null;// 수업 전 안내 문자 스위치(null = 모름)
  measured_at: number;
}

export async function buildPhoneGaps(env: any, opts: { days?: number; now?: number } = {}): Promise<PhoneGapResult> {
  const now = Number.isFinite(opts.now as number) ? Number(opts.now) : Date.now();
  const dRaw = Math.floor(Number(opts.days));
  const days = Number.isFinite(dRaw) && dRaw >= 1 ? Math.min(PHONE_GAP_DAYS_MAX, dRaw) : PHONE_GAP_DAYS_DEFAULT;
  const dl = kstDays(now, days);
  const res: PhoneGapResult = {
    ok: true, days, from: dl[0].ymd, to: dl[dl.length - 1].ymd, students: 0, reachable: 0, gaps: [],
    complete: true, hint_complete: true, sms_mode: getSolapiMode(env || {}), reminder_enabled: null, measured_at: now,
  };
  try {
    const v = await env?.SESSION_STATE?.get('lesson_reminder_send');
    res.reminder_enabled = v !== 'off';
  } catch { res.reminder_enabled = null; }
  if (!env?.DB) return { ...res, ok: false, error: 'no_db' };

  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT id, user_id, student_name, day_of_week, scheduled_date, start_time, status, teacher_id${startsOnSel(await ensureStartsOnColumn(env))}
         FROM class_schedules
        WHERE status != 'cancelled'
          AND (scheduled_date IS NULL OR scheduled_date = '' OR (scheduled_date >= ? AND scheduled_date <= ?))`
    ).bind(res.from, res.to).all();
    rows = (rs && rs.results) || [];
  } catch (e: any) {
    console.warn('[phone-gaps] 수업 조회 실패:', e?.message);
    return { ...res, ok: false, error: 'class_schedules_unavailable' };
  }

  const hol = new Map<string, any>();
  for (const d of dl) hol.set(d.ymd, await loadHolidayClosure(env.DB, d.ymd));   // 던지지 않는다(fail-open)

  type Agg = { uid: string; name: string; classes: number; next_date: string; next_time: string };
  const by = new Map<string, Agg>();
  for (const s of rows) {
    const uid = String(s.user_id || '').trim();
    if (!uid || PLACEHOLDER_UIDS.has(uid.toLowerCase())) continue;
    for (const d of dl) {
      if (!occursLikeReminder(s, d.ymd, d.dow)) continue;
      if (isHolidayClosedFor(hol.get(d.ymd), s.teacher_id)) continue;   // 🎌 휴강일엔 리마인더도 안 나간다
      // ⏱ 리마인더가 «아직» 보낼 수 있는 수업만 센다 — 이미 지난 수업·곧 시작·시각을 못 읽는 수업은 번호가 있어도 문자가 없다.
      if (!reminderCanStillSend(s.start_time, d.ymd, now)) continue;
      const t = String(s.start_time || '');
      const a = by.get(uid) || { uid, name: '', classes: 0, next_date: '', next_time: '' };
      a.classes++;
      if (!a.name && s.student_name) a.name = String(s.student_name);
      const key = d.ymd + ' ' + t, cur = a.next_date ? a.next_date + ' ' + a.next_time : '';
      if (!cur || key < cur) { a.next_date = d.ymd; a.next_time = t; }
      by.set(uid, a);
    }
  }
  res.students = by.size;
  if (!by.size) return res;

  const sp = await loadSendPhones(env, Array.from(by.keys()));
  res.complete = sp.complete;
  const gaps: PhoneGap[] = [];
  for (const a of by.values()) {
    const st = sendState(sp.phones.get(a.uid));
    if (st.reach) { res.reachable++; continue; }
    gaps.push({ uid: a.uid, name: a.name || a.uid, classes: a.classes, next_date: a.next_date, next_time: a.next_time,
      status: st.short ? 'short' : 'none', short_len: st.short, hint_phone: '' });
  }
  if (gaps.length) {
    try {
      const ret = await selectInChunks<any>(env.DB, gaps.map(g => g.uid),
        (ph) => `SELECT user_id, phone FROM student_retention WHERE user_id IN (${ph})`);
      const m = new Map<string, string>();
      for (const r of ret) {
        const ph = String(r && r.phone != null ? r.phone : '').trim();
        if (r && r.user_id && ph.replace(/[^0-9]/g, '').length >= 9 && !m.has(String(r.user_id))) m.set(String(r.user_id), ph);
      }
      for (const g of gaps) g.hint_phone = m.get(g.uid) || '';
    } catch (e: any) {
      res.hint_complete = false;
      console.warn('[phone-gaps] 참고 번호(이탈위험 표) 조회 실패:', e?.message);
    }
  }
  gaps.sort((x, y) => ((x.next_date + ' ' + x.next_time) < (y.next_date + ' ' + y.next_time) ? -1
    : (x.next_date + ' ' + x.next_time) > (y.next_date + ' ' + y.next_time) ? 1 : (x.uid < y.uid ? -1 : x.uid > y.uid ? 1 : 0)));
  res.gaps = gaps;
  return res;
}
