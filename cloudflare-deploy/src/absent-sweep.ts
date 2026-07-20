/**
 * absent-sweep.ts — 🚨 결석 위험 자동 알림 (2026-07-21)
 *
 * 매 15분 cron: 오늘(KST) 예약(class_schedules) 중 "시작 후 10분이 지났는데 학생이
 * 화상수업에 입장(attendance 기록)하지 않은" 수업을 찾아 문자로 알린다.
 *
 * 안전장치 (기본 = 안전 모드):
 *  - 발송 대상: 운영자(OWNER_ALERT_PHONE)에게 요약 1통. 학부모 직접 발송은
 *    KV(SESSION_STATE) 'absent_alert_parent_send' 값이 'on' 일 때만 (기본 OFF).
 *  - 중복 방지: class_no_show 에 room_id(=class-{id}-{YYYYMMDD}, 날짜 포함이라 세션당 유일)
 *    기록이 있으면 스킵 — 클라이언트발 /api/notify/no-show 기록과도 자연히 상호 dedup.
 *  - 폭주 방지: 한 번의 sweep 에서 학부모 문자 최대 5건. 감지 창 = 시작 +10분 ~ +40분
 *    (그 이후는 이미 이전 sweep 이 처리했거나 지난 수업 — 재알림 안 함).
 *
 * 검증/진단: GET /api/admin/absent-sweep/run?dry=1 (관리자) — 발송 없이 감지 결과만 반환.
 */

import { sendPlainSms } from './solapi-client';

const DETECT_AFTER_MS = 10 * 60 * 1000;  // 시작 10분 후부터 결석 위험으로 판정
const DETECT_UNTIL_MS = 40 * 60 * 1000;  // 시작 40분 후까지만 감지(그 뒤는 재알림 금지)
const MAX_PARENT_SMS_PER_SWEEP = 5;      // 학부모 문자 폭주 방지 상한

export interface AbsentSweepResult {
  ok: boolean;
  checked: number;             // 오늘 발생 예약 중 감지 창 안에 있던 수업 수
  alerted: number;             // 이번에 새로 기록/알림한 결석 위험 수
  parent_mode: boolean;        // 학부모 직접 발송 모드였는지
  owner_sms?: any;             // 운영자 요약 문자 결과
  details: any[];
  dry?: boolean;
}

/** KST 기준 오늘 발생하는 예약을 계산해 감지 창(시작+10~40분) 안의 결석 후보를 찾는다. */
export async function runAbsentStudentSweep(env: any, opts: { dry?: boolean } = {}): Promise<AbsentSweepResult> {
  const dry = !!opts.dry;
  const now = Date.now();
  const KST = 9 * 3600 * 1000;
  const k = new Date(now + KST);
  const kY = k.getUTCFullYear(), kMo = k.getUTCMonth(), kD = k.getUTCDate();
  const kDow = k.getUTCDay();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${kY}${pad(kMo + 1)}${pad(kD)}`;
  const todayStr = `${kY}-${pad(kMo + 1)}-${pad(kD)}`;

  // 오늘 발생 예약 전체 (일회성=날짜 일치 / 반복=요일 일치) — /api/class/sessions/today 와 동일 규칙
  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT id, user_id, student_name, day_of_week, scheduled_date, start_time, duration_min, teacher_id
       FROM class_schedules WHERE status != 'cancelled'`
    ).all();
    rows = rs.results || [];
  } catch {
    return { ok: false, checked: 0, alerted: 0, parent_mode: false, details: [{ error: 'class_schedules_unavailable' }] };
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
    const late = now - start_ts;
    if (late < DETECT_AFTER_MS || late > DETECT_UNTIL_MS) continue;   // 감지 창 밖
    candidates.push({ ...s, start_ts, late_min: Math.floor(late / 60000), room_id: `class-${s.id}-${ymd}` });
  }

  const result: AbsentSweepResult = { ok: true, checked: candidates.length, alerted: 0, parent_mode: false, details: [], dry };
  if (!candidates.length) return result;

  // no-show 기록 테이블 보장 (api-notify.ts 와 동일 DDL)
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_no_show (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, missing_role TEXT, missing_uid TEXT, student_name TEXT, teacher_name TEXT, lesson_title TEXT, waited_min INTEGER, notified_push INTEGER DEFAULT 0, notified_kakao INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`);
  } catch {}

  // 학부모 직접 발송 모드 — 기본 OFF, KV 로만 켬 (안전 모드)
  let parentMode = false;
  try { parentMode = (await env.SESSION_STATE?.get('absent_alert_parent_send')) === 'on'; } catch {}
  result.parent_mode = parentMode;

  const newlyAbsent: any[] = [];
  for (const c of candidates) {
    // ① 학생이 이미 입장했으면 정상 — attendance 는 /api/attendance/join 이 기록
    try {
      const att = await env.DB.prepare(
        `SELECT 1 FROM attendance WHERE room_id = ? AND (user_id = ? OR role = 'student') LIMIT 1`
      ).bind(c.room_id, c.user_id || '').first();
      if (att) { result.details.push({ room_id: c.room_id, status: 'joined' }); continue; }
    } catch { continue; } // attendance 조회 실패 시 오탐 알림 금지 — 스킵
    // ② 이미 기록/알림된 세션이면 스킵 (room_id 에 날짜 포함 = 세션당 1회 보장)
    try {
      const dup = await env.DB.prepare(
        `SELECT 1 FROM class_no_show WHERE room_id = ? AND missing_role = 'student' LIMIT 1`
      ).bind(c.room_id).first();
      if (dup) { result.details.push({ room_id: c.room_id, status: 'already_alerted' }); continue; }
    } catch {}
    newlyAbsent.push(c);
  }

  if (!newlyAbsent.length) return result;

  let parentBudget = MAX_PARENT_SMS_PER_SWEEP;
  const ownerLines: string[] = [];
  for (const c of newlyAbsent) {
    const name = c.student_name || c.user_id || '이름미상';
    const hhmm = String(c.start_time || '');
    const detail: any = { room_id: c.room_id, student: name, start: hhmm, late_min: c.late_min, status: 'absent' };

    // 학부모 문자 (모드 ON + 전화번호 있을 때만, sweep 당 상한)
    if (parentMode && parentBudget > 0 && !dry) {
      try {
        const stu: any = await env.DB.prepare(
          `SELECT korean_name, phone, parent_phone FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
        ).bind(c.user_id || '', c.user_id || '').first();
        const phone = stu && (stu.parent_phone || stu.phone);
        if (phone) {
          const msg = `[망고아이] ${name} 학생이 오늘 ${hhmm} 수업 시작 ${c.late_min}분이 지나도록 입장하지 않았어요. 확인 부탁드립니다. 입장: https://test.mangoi.co.kr/?go=videocall`;
          const r = await sendPlainSms(env, phone, msg);
          detail.parent_sms = r && r.ok ? 'sent' : (r && (r.error || r.message)) || 'failed';
          if (r && r.ok) parentBudget--;
        } else detail.parent_sms = 'no_phone';
      } catch (e: any) { detail.parent_sms = 'error:' + String(e?.message || e).slice(0, 80); }
    }

    // no-show 기록 (관리자 /api/admin/no-shows 리포트에 표시됨)
    if (!dry) {
      try {
        await env.DB.prepare(
          `INSERT INTO class_no_show (room_id, schedule_id, missing_role, missing_uid, student_name, teacher_name, lesson_title, waited_min, notified_push, notified_kakao, created_at)
           VALUES (?,?,?,?,?,?,?,?,0,0,?)`
        ).bind(c.room_id, c.id, 'student', c.user_id || null, name, null, '결석 위험(자동감지)', c.late_min, now).run();
      } catch (e: any) { detail.log = 'insert_failed:' + String(e?.message || e).slice(0, 80); }
    }

    ownerLines.push(`· ${name} ${hhmm} 수업 (+${c.late_min}분 미입장)`);
    result.alerted++;
    result.details.push(detail);
  }

  // 운영자 요약 문자 1통 (dry 는 발송 안 함)
  if (result.alerted > 0 && !dry) {
    try {
      const ownerPhone = env.OWNER_ALERT_PHONE;
      if (ownerPhone) {
        const text = `[망고아이] 🚨 결석 위험 ${result.alerted}건\n${ownerLines.slice(0, 8).join('\n')}${parentMode ? '\n(학부모 문자 발송됨)' : '\n(학부모 발송 OFF — 관리자 확인용)'}`;
        result.owner_sms = await sendPlainSms(env, ownerPhone, text);
      } else result.owner_sms = { skipped: 'no_owner_phone' };
    } catch (e: any) { result.owner_sms = { error: String(e?.message || e).slice(0, 120) }; }
  }

  return result;
}
