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
import { phonesForStudent } from './notify-contacts';  // 📞 학생·학부모 번호 판정 정본(복제 금지)
import { siteUrl } from './site-url';           // 🔗 사람에게 나가는 링크는 한 곳에서

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

/* 🏫 오늘 끝난 «옛 LMS 수업»(카페24 동기화분) — 피드백 리마인드 대상 (2026-08-19)
 *
 *  담당 판정은 **카페24 강사번호**(attendance.teacher_uid, 실측 9~196)로만 한다.
 *  ⛔ D1 `teachers.id`(지역 일련번호 1~29)와 절대 섞지 말 것 — 다른 체계이고,
 *     번호가 겹치는 자리에서 조용히 «다른 사람» 이 걸린다
 *     (실측: 카페24 24=Teacher Mariane 인데 teachers 24=HANNAH).
 *     CLAUDE.md 2장 「강사에게 남의 수업·급여가 보임」 항목 참고.
 *  ✅ 번호 → 사람 이름은 teacher_payroll_auto 로만 해석한다(카페24가 번호와 이름을
 *     함께 밀어넣은 표라 그 안에서는 안 어긋난다). 못 찾으면 그 강사는 건너뛴다 —
 *     이름을 모르면 문자에 뭐라고 쓸지도 모르고, 추측해서 보내면 남에게 간다.
 */
async function endedC24Lessons(env: any, ymdKst: string): Promise<any[]> {
  const rs = await env.DB.prepare(
    `SELECT a.room_id, a.user_id, a.username, a.teacher_uid,
            p.teacher_name AS teacher_name
       FROM attendance a
       LEFT JOIN (SELECT teacher_id, MAX(teacher_name) AS teacher_name
                    FROM teacher_payroll_auto WHERE teacher_name IS NOT NULL
                   GROUP BY teacher_id) p
              ON CAST(p.teacher_id AS TEXT) = a.teacher_uid
      WHERE a.room_id LIKE 'c24-%' AND a.status = 'present'
        AND a.date = ? AND a.teacher_uid IS NOT NULL
      LIMIT 500`
  ).bind(ymdKst).all().catch(() => ({ results: [] as any[] }));

  const out: any[] = [];
  for (const r of ((rs.results || []) as any[])) {
    if (!r.teacher_name) continue;          // 번호를 사람으로 해석 못 하면 보내지 않는다
    out.push({
      id: null,
      room_id: String(r.room_id),
      user_id: r.user_id,
      student_name: r.username || r.user_id,
      start_time: '',                        // c24 행에는 «예정 시각» 이 없다 — 문구에서 학생 이름만 쓴다
      // teacher_id 는 **카페24 번호**다. 아래 전화번호 조회가 이 값을 teachers.id 로 쓰지 않도록
      // teacher_name 을 함께 넘긴다(이름 완전일치로 teacher_profiles 를 찾는다).
      teacher_id: null,
      teacher_name: String(r.teacher_name),
      src: 'lms',                            // 문구를 «어제 수업» 으로 바꾸는 표시
    });
  }
  return out;
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
  /* 🏫 (2026-08-19) 옛 LMS 수업(카페24 동기화분)도 리마인드 대상에 넣는다.
   *
   *  [왜] 강사들은 옛 LMS 에서 수업한다. 그 수업은 attendance 의 room_id='c24-*' 로
   *       이미 들어와 있는데(18만 건), 이 스윕은 class_schedules(정규 수업 0건)만 보고
   *       있었다. 그래서 **한 번도 문자를 보낸 적이 없다** — 증거: feedback_reminder_log
   *       테이블이 아예 없었다(그 표는 ended 가 있어야 만들어지는 자리에 있다).
   *
   *  ⛔ **기본 꺼짐**이다. 이 스윕 자체는 기본 ON('off' 일 때만 멈춤)이고 매일 19:00 KST 에
   *     도는데, 여기서 대상을 늘리는 순간 **그날 저녁 강사 25명에게 실제로 문자가 나간다.**
   *     그래서 이 경로만 «켜야 동작하는» 반대 규칙으로 둔다. 사람이 dry 결과를 보고
   *     KV(SESSION_STATE) 'feedback_reminder_c24' = 'on' 을 넣어야 켜진다.
   *     (dry=1 로는 플래그와 무관하게 미리 볼 수 있다 — 확인이 목적이므로)
   */
  const c24On = await (async () => {
    try { return (await env.SESSION_STATE?.get('feedback_reminder_c24')) === 'on'; } catch { return false; }
  })();
  if (c24On || dry) {
    /* ⏰ «어제» 다. 오늘이 아니다 — 카페24 동기화는 03:00 KST 에 **전날치까지** 가져온다.
       그래서 이 스윕이 도는 19:00 KST 시점에 «오늘» 수업은 D1 에 아직 0건이다
       (2026-08-19 실측: 오늘 0건 / 어제 103건, 최신 동기화 날짜 = 어제).
       ⛔ todayStr 로 되돌리면 이 경로는 **영원히 0건**이 되어 조용히 아무 일도 안 한다. */
    const yKst = new Date(now + KST - 86400000).toISOString().slice(0, 10);
    try { ended.push(...await endedC24Lessons(env, yKst)); } catch (e: any) {
      console.warn('[feedback-reminder] c24 수업 조회 실패:', e?.message);
    }
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
      /* 🪤 (2026-08-19) 수업일지(student_evaluations)를 빠뜨리면 «일지는 썼는데 안 썼다고
         문자가 가는» 사고가 난다. 강사가 /teacher 에서 [일지 쓰기] 로 남기는 곳은 여기다
         (POST /api/eval/create). 위 두 표(teacher_class_feedback·feedback_drafts)와는
         **다른 표**라서, 셋 다 봐야 «썼다» 를 옳게 판정한다. */
      const fb3 = await env.DB.prepare(
        `SELECT 1 FROM student_evaluations WHERE room_id = ? LIMIT 1`
      ).bind(c.room_id).first().catch(() => null);
      if (fb3) continue;
      const key = String(c.teacher_id ?? c.teacher_name ?? 'unknown');
      if (!missingByTeacher[key]) missingByTeacher[key] = { name: c.teacher_name || key, teacher_id: c.teacher_id, items: [] };
      missingByTeacher[key].items.push(c);
    } catch (e) {
      // 🔇→🔊 (2026-08-09) 한 수업이 조용히 빠지면 그 강사는 «피드백 미작성» 안내를 못 받고,
      //   자정이 지나 공제(-25PHP/건)를 맞는다. 돈이 걸린 누락이라 기록은 반드시 남긴다.
      console.warn('[feedback-reminder] 수업 1건 판정 실패 → 안내에서 누락:', (e as any)?.message, 'room=', c.room_id);
    }
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
      /* 🕐 LMS 수업은 하루 늦게 들어오므로 «어제» 로 말해야 맞다. 그리고 그때는 자정이
         이미 지났으니 «자정 전에 쓰면 공제를 피한다» 는 문구를 쓰면 거짓말이 된다. */
      const isLms = g.items.every((c: any) => c.src === 'lms');
      const msg = isLms
        ? `[MANGOi] ${g.name}, ${g.items.length} class(es) from yesterday have no class log yet: ${times}\nPlease write them in My Page > Class log.`
        : `[MANGOi] ${g.name}, you have ${g.items.length} class(es) today without feedback yet: ${times}\nPlease write/approve before midnight KST to avoid the -P25/class deduction. My Page > Feedback.`;
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
    } catch (e) {
      // 🔇→🔊 (2026-08-09) 여기가 조용하면 «중복 발송» 이 조용해진다.
      //   이 조회가 실패하면 아래 코드는 「아직 안 보냄」으로 간주하고 그대로 문자를 보낸다.
      //   학부모 휴대폰에 같은 안내가 두 번 가고, 아무 기록이 없어 아무도 모른다.
      //   ⚠️ 흐름은 바꾸지 않았다(문자 경로의 판단은 사람이 정할 일) — 다만 보이게는 한다.
      console.warn('[lesson-reminder] 중복확인 실패 → 중복 발송 위험:', (e as any)?.message, 'room=', c.room_id);
      result.details.push({ room_id: c.room_id, status: 'dedup_check_failed' });
    }

    const name = c.student_name || c.user_id || '학생';
    const hhmm = String(c.start_time || '');
    const detail: any = { room_id: c.room_id, student: name, start: hhmm, mins_left: c.mins_left };

    /* 전화번호 — 판정 정본은 `phonesForStudent`(notify-contacts.ts) 하나다.
       📞 (2026-09-10) 그 함수가 «우리 화면에서 받아 둔 번호»(student_erp_override)를 **먼저** 보고
          없으면 학생 명부로 떨어진다. 명부 번호는 카페24 동기화가 매일 밤 덮어서 실측 0건이라,
          이 배선이 없으면 아래 발송은 영영 'no_phone' 으로 끝난다(7일간 671건 감지 / 0건 발송).
       ⛔ 같은 판정을 여기에 복제하지 말 것 — 두 곳이 갈리면 「어떤 학생만 안 나가는」 사고가 된다. */
    let parentPhone = '', studentPhone = '';
    try {
      const p = await phonesForStudent(env, c.user_id || '');
      parentPhone = p.parent; studentPhone = p.student;
    } catch (e: any) {
      console.warn('[lesson-reminder] 번호 정본 조회 실패:', e?.message, 'uid=', c.user_id);
    }
    /* ⚠️ 정본은 `user_id` 로만 찾는다. 이 화면은 예전부터 `login_id` 로도 찾고 있었으므로
       («되던 것» 을 깨지 않게) 정본이 빈손일 때만 그 경로를 한 번 더 시도한다. */
    try {
      if (!parentPhone && !studentPhone) {
      const stu: any = await env.DB.prepare(
        `SELECT * FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
      ).bind(c.user_id || '', c.user_id || '').first();
      if (stu) {
        parentPhone = String(stu.parent_phone || '').trim();
        studentPhone = String(stu.student_phone || stu.phone || '').trim();
      }
      }
    } catch (e) {
      // 🔇→🔊 조회가 실패하면 아래에서 'no_phone' 으로 처리돼 «번호가 없는 학생» 과 구분되지 않는다.
      //   진짜 번호가 없는 건지, 조회가 깨진 건지 로그가 없으면 영영 모른다.
      console.warn('[lesson-reminder] 전화번호 조회 실패:', (e as any)?.message, 'uid=', c.user_id);
    }
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

    const msg = `[망고아이] ${name} 학생, 오늘 ${hhmm} 화상수업이 약 ${c.mins_left}분 후 시작됩니다.\n▶ 입장: ${siteUrl('/?go=videocall')}\n▶ 장비점검(마이크·스피커): ${siteUrl('/precheck.html')}\n※ 수업 연기·취소는 시작 30분 전까지 무료, 이후는 유료 처리됩니다.`;

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
