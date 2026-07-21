/**
 * lesson-reminder.ts — 📣 수업 시작 전 리마인더 (2026-07-22)
 *
 * 매 15분 cron: 오늘(KST) 예약(class_schedules) 중 "시작까지 15~45분 남은" 수업을 찾아
 * 학부모 + 학생 번호 모두에게 문자로 알린다. (학부모 컴플레인 #1 대응 — 기존 알림은
 * 학생 입장 '후' 에만, 그것도 학생 번호 우선으로 나갔음.)
 *
 * 안전장치:
 *  - 킬스위치: KV(SESSION_STATE) 'lesson_reminder_send' = 'off' 면 전체 중단 (기본 ON).
 *  - 중복 방지: lesson_reminder_log 에 room_id(=class-{id}-{YYYYMMDD}, 세션당 유일)
 *    기록이 있으면 스킵 — 30분 창 × 15분 cron 이라 세션당 2회 겹쳐도 1회만 발송.
 *  - 폭주 방지: 한 번의 sweep 에서 문자 최대 40건 (초과분은 다음 sweep 이 담당).
 *
 * 메시지에 연기 규정(30분 전 무료/이후 유료)과 장비점검 링크를 함께 실어
 * 컴플레인 #2(규정 미인지)·#9(장비 사전점검) 도 같이 완화한다.
 *
 * 검증/진단: GET /api/admin/lesson-reminder/run?dry=1 (관리자) — 발송 없이 감지만.
 */

import { sendPlainSms } from './solapi-client';

const REMIND_MIN_MS = 15 * 60 * 1000;   // 시작 15분 전까지 알림 창 유지
const REMIND_MAX_MS = 45 * 60 * 1000;   // 시작 45분 전부터 알림 창 열림 (≈30분 전 발송)
const MAX_SMS_PER_SWEEP = 40;           // 문자 폭주 방지 상한

export interface LessonReminderResult {
  ok: boolean;
  enabled: boolean;
  checked: number;    // 알림 창 안의 세션 수
  reminded: number;   // 이번에 새로 발송한 세션 수
  sms_sent: number;   // 실제 발송된 문자 수 (학부모+학생 합)
  details: any[];
  dry?: boolean;
}

/**
 * 🧑‍🏫 교사 당일 피드백 리마인드 (KST 19:00) — 오늘 진행된 수업(입장 기록 존재) 중
 * 피드백(teacher_class_feedback 또는 승인된 feedback_drafts)이 없는 건을 교사별로 묶어
 * 문자 1통씩 발송. 자정 전 작성하면 공제(-25PHP/건)를 피할 수 있다는 안내 포함.
 * dedup: feedback_reminder_log (teacher_key + ymd) — 10시대엔 15분 cron 도 같이 돌아 필수.
 */
export async function runFeedbackReminderSweep(env: any, opts: { dry?: boolean } = {}): Promise<any> {
  const dry = !!opts.dry;
  const out: any = { ok: true, teachers: 0, sms_sent: 0, details: [], dry };
  try {
    if ((await env.SESSION_STATE?.get('feedback_reminder_send')) === 'off') { out.enabled = false; return out; }
  } catch {}
  const now = Date.now();
  const KST = 9 * 3600 * 1000;
  const k = new Date(now + KST);
  const kY = k.getUTCFullYear(), kMo = k.getUTCMonth(), kD = k.getUTCDate();
  const kDow = k.getUTCDay();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${kY}${pad(kMo + 1)}${pad(kD)}`;
  const todayStr = `${kY}-${pad(kMo + 1)}-${pad(kD)}`;

  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT id, user_id, student_name, day_of_week, scheduled_date, start_time, duration_min, teacher_id, teacher_name
       FROM class_schedules WHERE status != 'cancelled'`
    ).all();
    rows = rs.results || [];
  } catch { return { ...out, ok: false, error: 'class_schedules_unavailable' }; }

  // 오늘 발생 + 이미 끝난 수업만
  const ended: any[] = [];
  const seen = new Set<number>();
  for (const s of rows) {
    if (seen.has(s.id)) continue;
    let occurs = false;
    if (s.scheduled_date) occurs = (s.scheduled_date === todayStr);
    else if (s.day_of_week != null && s.day_of_week !== '') occurs = (Number(s.day_of_week) === kDow);
    if (!occurs) continue;
    seen.add(s.id);
    const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
    if (!Number.isFinite(hh)) continue;
    const start_ts = Date.UTC(kY, kMo, kD, hh, mm || 0, 0) - KST;
    const endTs = start_ts + (Number(s.duration_min) || 25) * 60000;
    if (endTs > now) continue;
    ended.push({ ...s, room_id: `class-${s.id}-${ymd}` });
  }
  if (!ended.length) return out;

  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS feedback_reminder_log (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_key TEXT, ymd TEXT, missing_count INTEGER, created_at INTEGER NOT NULL)`);
  } catch {}

  // 피드백 미작성 판정 — 실제 진행(attendance 존재) + 피드백 두 경로 모두 부재
  const missingByTeacher: Record<string, { name: string; teacher_id: any; items: any[] }> = {};
  for (const c of ended) {
    try {
      const att = await env.DB.prepare(`SELECT 1 FROM attendance WHERE room_id = ? LIMIT 1`).bind(c.room_id).first();
      if (!att) continue; // 열리지 않은 수업(결석/노쇼)은 리마인드 대상 아님
      const fb1 = await env.DB.prepare(`SELECT 1 FROM teacher_class_feedback WHERE room_id = ? LIMIT 1`).bind(c.room_id).first().catch(() => null);
      if (fb1) continue;
      const fb2 = await env.DB.prepare(`SELECT 1 FROM feedback_drafts WHERE room_id = ? AND status = 'approved' LIMIT 1`).bind(c.room_id).first().catch(() => null);
      if (fb2) continue;
      const key = String(c.teacher_id ?? c.teacher_name ?? 'unknown');
      if (!missingByTeacher[key]) missingByTeacher[key] = { name: c.teacher_name || key, teacher_id: c.teacher_id, items: [] };
      missingByTeacher[key].items.push(c);
    } catch {}
  }

  let budget = 20;
  for (const key of Object.keys(missingByTeacher)) {
    if (budget <= 0) break;
    const g = missingByTeacher[key];
    // 하루 1회 dedup
    try {
      const dup = await env.DB.prepare(`SELECT 1 FROM feedback_reminder_log WHERE teacher_key = ? AND ymd = ? LIMIT 1`).bind(key, ymd).first();
      if (dup) { out.details.push({ teacher: g.name, status: 'already_reminded' }); continue; }
    } catch {}
    // 교사 전화번호 — teacher_profiles(id 또는 이름)
    let phone = '';
    try {
      const tp: any = await env.DB.prepare(
        `SELECT phone FROM teacher_profiles WHERE id = ? OR korean_name = ? OR english_name = ? LIMIT 1`
      ).bind(g.teacher_id ?? -1, g.name, g.name).first();
      phone = String(tp?.phone || '').trim();
    } catch {}
    const times = g.items.slice(0, 6).map((c: any) => `${c.start_time} ${c.student_name || c.user_id || ''}`.trim()).join(' / ');
    const detail: any = { teacher: g.name, missing: g.items.length, times };
    if (phone && !dry) {
      const msg = `[MANGOi] ${g.name}, you have ${g.items.length} class(es) today without feedback yet: ${times}\nPlease write/approve before midnight KST to avoid the -P25/class deduction. My Page > Feedback.`;
      try {
        const r = await sendPlainSms(env, phone, msg);
        detail.sms = r && r.ok ? 'sent' : (r && (r.error || r.message)) || 'failed';
        if (r && r.ok) { out.sms_sent++; budget--; }
      } catch (e: any) { detail.sms = 'error:' + String(e?.message || e).slice(0, 80); }
    } else if (!phone) detail.sms = 'no_phone';
    if (!dry) {
      try {
        await env.DB.prepare(`INSERT INTO feedback_reminder_log (teacher_key, ymd, missing_count, created_at) VALUES (?,?,?,?)`)
          .bind(key, ymd, g.items.length, now).run();
      } catch {}
    }
    out.teachers++;
    out.details.push(detail);
  }
  return out;
}

/** KST 기준 오늘 발생 예약 중 시작 15~45분 전 세션을 찾아 학부모+학생에게 리마인더 발송. */
export async function runLessonReminderSweep(env: any, opts: { dry?: boolean } = {}): Promise<LessonReminderResult> {
  const dry = !!opts.dry;
  const result: LessonReminderResult = { ok: true, enabled: true, checked: 0, reminded: 0, sms_sent: 0, details: [], dry };

  // 킬스위치 (기본 ON — 'off' 로 명시했을 때만 중단)
  try {
    if ((await env.SESSION_STATE?.get('lesson_reminder_send')) === 'off') {
      result.enabled = false;
      return result;
    }
  } catch {}

  const now = Date.now();
  const KST = 9 * 3600 * 1000;
  const k = new Date(now + KST);
  const kY = k.getUTCFullYear(), kMo = k.getUTCMonth(), kD = k.getUTCDate();
  const kDow = k.getUTCDay();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${kY}${pad(kMo + 1)}${pad(kD)}`;
  const todayStr = `${kY}-${pad(kMo + 1)}-${pad(kD)}`;

  // 오늘 발생 예약 전체 (일회성=날짜 일치 / 반복=요일 일치) — absent-sweep 과 동일 규칙
  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT id, user_id, student_name, day_of_week, scheduled_date, start_time, duration_min, teacher_id
       FROM class_schedules WHERE status != 'cancelled'`
    ).all();
    rows = rs.results || [];
  } catch {
    return { ...result, ok: false, details: [{ error: 'class_schedules_unavailable' }] };
  }

  const candidates: any[] = [];
  const seen = new Set<number>();
  for (const s of rows) {
    if (seen.has(s.id)) continue;
    let occurs = false;
    if (s.scheduled_date) occurs = (s.scheduled_date === todayStr);
    else if (s.day_of_week != null && s.day_of_week !== '') occurs = (Number(s.day_of_week) === kDow);
    if (!occurs) continue;
    seen.add(s.id);
    const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
    if (!Number.isFinite(hh)) continue;
    const start_ts = Date.UTC(kY, kMo, kD, hh, mm || 0, 0) - KST;
    const until = start_ts - now;
    if (until < REMIND_MIN_MS || until > REMIND_MAX_MS) continue;   // 알림 창 밖
    candidates.push({ ...s, start_ts, mins_left: Math.round(until / 60000), room_id: `class-${s.id}-${ymd}` });
  }

  result.checked = candidates.length;
  if (!candidates.length) return result;

  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS lesson_reminder_log (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, student_uid TEXT, sent_parent INTEGER DEFAULT 0, sent_student INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`);
  } catch {}

  let budget = MAX_SMS_PER_SWEEP;
  for (const c of candidates) {
    if (budget <= 0) { result.details.push({ room_id: c.room_id, status: 'budget_exhausted' }); break; }
    // 세션당 1회 보장
    try {
      const dup = await env.DB.prepare(`SELECT 1 FROM lesson_reminder_log WHERE room_id = ? LIMIT 1`).bind(c.room_id).first();
      if (dup) { result.details.push({ room_id: c.room_id, status: 'already_sent' }); continue; }
    } catch {}

    const name = c.student_name || c.user_id || '학생';
    const hhmm = String(c.start_time || '');
    const detail: any = { room_id: c.room_id, student: name, start: hhmm, mins_left: c.mins_left };

    // 전화번호 — 스키마 편차(phone/student_phone) 대비 SELECT * 후 유연하게 해석
    let parentPhone = '', studentPhone = '';
    try {
      const stu: any = await env.DB.prepare(
        `SELECT * FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
      ).bind(c.user_id || '', c.user_id || '').first();
      if (stu) {
        parentPhone = String(stu.parent_phone || '').trim();
        studentPhone = String(stu.student_phone || stu.phone || '').trim();
      }
    } catch {}
    if (!parentPhone && !studentPhone) {
      detail.status = 'no_phone';
      result.details.push(detail);
      // 번호가 없어도 로그는 남겨 세션당 재시도 폭주 방지
      if (!dry) {
        try {
          await env.DB.prepare(`INSERT INTO lesson_reminder_log (room_id, schedule_id, student_uid, sent_parent, sent_student, created_at) VALUES (?,?,?,0,0,?)`)
            .bind(c.room_id, c.id, c.user_id || null, now).run();
        } catch {}
      }
      continue;
    }

    const msg = `[망고아이] ${name} 학생, 오늘 ${hhmm} 화상수업이 약 ${c.mins_left}분 후 시작됩니다.\n▶ 입장: https://test.mangoi.co.kr/?go=videocall\n▶ 장비점검(마이크·스피커): https://test.mangoi.co.kr/precheck.html\n※ 수업 연기·취소는 시작 30분 전까지 무료, 이후는 유료 처리됩니다.`;

    let sentParent = 0, sentStudent = 0;
    if (!dry) {
      if (parentPhone && budget > 0) {
        try {
          const r = await sendPlainSms(env, parentPhone, msg);
          detail.parent_sms = r && r.ok ? 'sent' : (r && (r.error || r.message)) || 'failed';
          if (r && r.ok) { sentParent = 1; budget--; result.sms_sent++; }
        } catch (e: any) { detail.parent_sms = 'error:' + String(e?.message || e).slice(0, 80); }
      }
      // 학생 번호가 학부모와 다를 때만 별도 발송 (같은 번호 이중 발송 방지)
      if (studentPhone && studentPhone !== parentPhone && budget > 0) {
        try {
          const r = await sendPlainSms(env, studentPhone, msg);
          detail.student_sms = r && r.ok ? 'sent' : (r && (r.error || r.message)) || 'failed';
          if (r && r.ok) { sentStudent = 1; budget--; result.sms_sent++; }
        } catch (e: any) { detail.student_sms = 'error:' + String(e?.message || e).slice(0, 80); }
      }
      try {
        await env.DB.prepare(`INSERT INTO lesson_reminder_log (room_id, schedule_id, student_uid, sent_parent, sent_student, created_at) VALUES (?,?,?,?,?,?)`)
          .bind(c.room_id, c.id, c.user_id || null, sentParent, sentStudent, now).run();
      } catch (e: any) { detail.log = 'insert_failed:' + String(e?.message || e).slice(0, 80); }
    } else {
      detail.would_send = { parent: !!parentPhone, student: !!(studentPhone && studentPhone !== parentPhone) };
    }

    detail.status = 'reminded';
    result.reminded++;
    result.details.push(detail);
  }

  return result;
}
