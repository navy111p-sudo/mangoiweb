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
import { siteUrl } from './site-url';           // 🔗 사람에게 나가는 링크는 한 곳에서
/* 📧 강사 대부분이 필리핀에 있어 «한국 문자» 로는 못 닿는다 — 이메일이 유일한 국제 자동 수단이다. */
import { sendEmail, emailLayout } from './email';

/** 이메일 본문에 학생·강사 이름이 그대로 들어간다 — 태그로 읽히지 않게 막는다. */
function escapeHtmlAbs(s: any): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

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

/* 📞 (2026-08-07) 담당 강사 연락처 찾기 — 결석 알림을 «기다리는 사람» 에게 보내려면 필요하다.
   [실사고] 8/7 18:00 레벨테스트에서 강사가 빈 방을 **30분** 지켰다(4번 재입장). 학생은 끝내
           안 왔고, 시스템은 18:15 에 결석을 «기록만» 했다 — 강사에게는 한 마디도 안 갔다.

   ⛔ `leveltest_applications.assigned_teacher_phone` 을 쓰면 안 된다. 실측:
        · 신청 #13 «Teacher Maimai» → 저장된 번호·메일은 **Teacher Kaye 의 것**
        · 신청 #15 «Teacher Maimai» → 프로필 25(Maimai)는 연락처가 비었는데 **제3자 번호**가 들어 있음
      그 컬럼은 지금 아무 데도 발송하지 않아 사고는 없었지만, 여기서 쓰면 **엉뚱한 강사에게 간다**.

   ✅ 대신 `class_schedules.teacher_id → teachers.name → teacher_profiles` 를 **이름으로** 잇는다.
      ⚠️ 부분일치는 금지 — 'Anna' 가 'HANNAH' 에 붙는 사고가 이미 있었다. api-teacher.ts 와 같은
         **낱말 경계** 규칙을 쓰고, 애매하면(후보 2명 이상) **아무에게도 안 보낸다**.
      ⚠️ `teacher_profiles.linked_teacher_id` 는 현재 전 행이 NULL 이라 못 쓴다(실측). */
/* 📵 (2026-09-01) `/api/notify/*` 도 이 판정을 씁니다 — 복제하지 마세요(notify-contacts.ts).
   판정을 여러 곳에 복제하면 반드시 어긋납니다(규칙서 2장, no-show-truth.ts 가 그 선례). */
export async function findTeacherContact(env: any, teacherId: any): Promise<{ name: string; phone: string | null; email: string | null; why: string }> {
  const out = { name: '', phone: null as string | null, email: null as string | null, why: 'no_teacher_id' };
  const tid = String(teacherId || '').trim();
  if (!tid) return out;
  try {
    const t: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`).bind(tid).first();
    if (!t?.name) { out.why = 'teacher_not_in_roster'; return out; }
    out.name = String(t.name);
    /* 0순위 — 사람이 관리자 화면(📇 강사 연락처 연결)에서 정해 준 연결이 있으면 그것만 쓴다.
       이름 추측보다 항상 앞이다. 관리자가 고른 것을 코드가 뒤집으면 안 된다. */
    try {
      const linked: any = await env.DB.prepare(
        `SELECT phone, email FROM teacher_profiles WHERE CAST(linked_teacher_id AS TEXT) = ? LIMIT 1`
      ).bind(tid).first();
      if (linked) {
        out.phone = linked.phone || null;
        out.email = linked.email || null;
        out.why = (out.email || out.phone) ? 'linked' : 'linked_but_no_contact';
        return out;
      }
    } catch {}
    const nrm = (s: any) => String(s || '').toUpperCase().trim();
    const words = (s: any) => nrm(s).split(/[\s·・,/()[\]-]+/).filter(Boolean);
    const target = nrm(t.name);
    const rs: any = await env.DB.prepare(
      `SELECT id, korean_name, english_name, phone, email FROM teacher_profiles
        WHERE (phone IS NOT NULL AND phone <> '') OR (email IS NOT NULL AND email <> '')`
    ).all();
    const hits = (rs.results || []).filter((p: any) => {
      for (const nm of [p.english_name, p.korean_name]) {
        const a = nrm(nm);
        if (!a) continue;
        if (a === target) return true;
        if (words(a).indexOf(target) >= 0 || words(target).indexOf(a) >= 0) return true;
      }
      return false;
    });
    if (hits.length === 1) { out.phone = hits[0].phone || null; out.email = hits[0].email || null; out.why = 'matched'; }
    else if (hits.length > 1) out.why = 'ambiguous';           // 헷갈리면 아무에게도 안 보낸다
    else out.why = 'no_phone_in_roster';                        // 번호가 원부에 아예 없음
  } catch (e: any) { out.why = 'lookup_failed'; }
  return out;
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
          const msg = `[망고아이] ${name} 학생이 오늘 ${hhmm} 수업 시작 ${c.late_min}분이 지나도록 입장하지 않았어요. 확인 부탁드립니다. 입장: ${siteUrl('/?go=videocall')}`;
          const r = await sendPlainSms(env, phone, msg);
          detail.parent_sms = r && r.ok ? 'sent' : (r && (r.error || r.message)) || 'failed';
          if (r && r.ok) parentBudget--;
        } else detail.parent_sms = 'no_phone';
      } catch (e: any) { detail.parent_sms = 'error:' + String(e?.message || e).slice(0, 80); }
    }

    /* 👩‍🏫 (2026-08-07) 담당 강사에게 알린다 — «기다리는 사람» 이 강사다.
       [왜] 8/7 실사고: 강사가 빈 방을 30분 지켰는데 시스템은 기록만 하고 아무 말도 안 했다.
            강사는 언제까지 기다려야 하는지, 우리가 알고는 있는지조차 알 수 없었다.
       ⚠️ 학부모 문자와 달리 **모드 스위치 없이 항상 보낸다** — 강사에게 «지금 상황»을 알리는 것은
          과잉 발송이 아니라 기본이다. 세션당 1회만 나간다(위 dup 검사가 보장).
       ⚠️ 못 보낸 경우를 조용히 넘기지 않는다. 아래 운영자 요약에 «연락처 없음» 으로 함께 실어
          원부의 빈칸이 눈에 보이게 한다(실측: 활동 강사 29명 중 원부 연결 0건). */
    let teacherNameForLog: string | null = null;
    if (!dry) {
      try {
        const tc = await findTeacherContact(env, c.teacher_id);
        detail.teacher = tc.name || null;
        teacherNameForLog = tc.name || null;   // 아래 기록에도 남긴다 — 누가 기다렸는지가 리포트에 보여야 한다
        const bodyKo = `${name} 학생이 아직 입장하지 않았어요 (${hhmm} 수업 · +${c.late_min}분).\n` +
                       `본사에 자동으로 알렸습니다. 10분 더 기다려 주시고, 그래도 안 오면 나오셔도 됩니다.`;
        const bodyEn = `${name} has not joined yet (${hhmm} class · +${c.late_min} min).\n` +
                       `We have notified the office — please wait 10 more minutes, then you may leave.`;
        /* 📧 이메일이 1순위다. 강사 대부분이 필리핀에 있어 «한국 문자» 는 닿지 않는다
           (실측: 프로필 전화 22건 중 21건이 09xx 필리핀 번호, 한국 번호 0건 · SOLAPI 는 국제 미지원).
           한국 번호일 때만 문자를 쓴다. 둘 다 없으면 조용히 넘기지 않고 운영자에게 이유를 올린다. */
        const isKr = (p: any) => /^(\+?82|0)10/.test(String(p || '').replace(/[\s-]/g, ''));
        if (tc.email) {
          try {
            const r2 = await sendEmail(env as any, {
              to: tc.email,
              subject: `[Mangoi] ${name} has not joined / 학생 미입장 (${hhmm})`,
              html: emailLayout({
                title: '🚨 학생이 아직 입장하지 않았어요 · Student has not joined',
                bodyHtml: `<p style="white-space:pre-line">${escapeHtmlAbs(bodyKo)}</p>`
                        + `<p style="white-space:pre-line;color:#475569">${escapeHtmlAbs(bodyEn)}</p>`,
              }),
            });
            detail.teacher_email = r2 && (r2 as any).ok !== false ? 'sent' : 'failed';
          } catch (e: any) { detail.teacher_email = 'error:' + String(e?.message || e).slice(0, 80); }
        } else if (tc.phone && isKr(tc.phone)) {
          const tr = await sendPlainSms(env, tc.phone, `[망고아이] ${bodyKo}\n${bodyEn}`);
          detail.teacher_sms = tr && tr.ok ? 'sent' : (tr && (tr.error || tr.message)) || 'failed';
        } else {
          const why = tc.phone && !isKr(tc.phone) ? 'phone_is_overseas_no_email' : tc.why;
          detail.teacher_sms = why;                       // no_phone_in_roster / ambiguous / 해외번호뿐 …
          ownerLines.push(`  ⚠ 강사 «${tc.name || c.teacher_id}» 에게 못 보냄 — ${why}`);
        }
      } catch (e: any) { detail.teacher_sms = 'error:' + String(e?.message || e).slice(0, 80); }
    }

    // no-show 기록 (관리자 /api/admin/no-shows 리포트에 표시됨)
    if (!dry) {
      try {
        await env.DB.prepare(
          `INSERT INTO class_no_show (room_id, schedule_id, missing_role, missing_uid, student_name, teacher_name, lesson_title, waited_min, notified_push, notified_kakao, created_at)
           VALUES (?,?,?,?,?,?,?,?,0,0,?)`
        ).bind(c.room_id, c.id, 'student', c.user_id || null, name, teacherNameForLog, '결석 위험(자동감지)', c.late_min, now).run();
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
