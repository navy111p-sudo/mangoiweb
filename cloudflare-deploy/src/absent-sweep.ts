/**
 * absent-sweep.ts — 🚨 결석 위험 자동 알림 (2026-07-21)
 *
 * 매 15분 cron: 오늘(KST) 예약(class_schedules) 중 "시작 후 10분이 지났는데 학생이
 * 화상수업에 입장(attendance 기록)하지 않은" 수업을 찾아 문자로 알린다.
 *
 * 안전장치 (기본 = 안전 모드):
 *  - 발송 대상: 담당 강사(이메일/한국번호 문자)만 항상. **운영자 요약 문자와 학부모 직접 발송은
 *    둘 다 기본 OFF** 이고 KV(SESSION_STATE) 스위치로만 켠다
 *    ('absent_alert_owner_send' / 'absent_alert_parent_send' = 'on').
 *    ⚠️ 운영자 요약은 2026-09-06 사장님 지시로 껐다 — 수업마다 문자가 계속 왔다.
 *       감지·기록(class_no_show)·강사 알림은 그대로이므로 관리자 › 노쇼 리포트에서 다 보인다.
 *  - 중복 방지: class_no_show 에 room_id(=class-{id}-{YYYYMMDD}, 날짜 포함이라 세션당 유일)
 *    기록이 있으면 스킵 — 클라이언트발 /api/notify/no-show 기록과도 자연히 상호 dedup.
 *  - 폭주 방지: 한 번의 sweep 에서 학부모 문자 최대 5건. 감지 창 = 시작 +10분 ~ +40분
 *    (그 이후는 이미 이전 sweep 이 처리했거나 지난 수업 — 재알림 안 함).
 *
 * 검증/진단: GET /api/admin/absent-sweep/run?dry=1 (관리자) — 발송 없이 감지 결과만 반환.
 */

import { ensureStartsOnColumn, startsOnSel, recurStartedOn } from './class-start-date';   // 📅 매주 반복 수업의 시작일 정본
import { sendPlainSms } from './solapi-client';
import { siteUrl } from './site-url';           // 🔗 사람에게 나가는 링크는 한 곳에서
/* 📧 강사 대부분이 필리핀에 있어 «한국 문자» 로는 못 닿는다 — 이메일이 유일한 국제 자동 수단이다. */
import { sendEmail, emailLayout } from './email';
import { pushToTeacher } from './teacher-push';   // 🔔 강사 웹푸시(정본) — 카카오는 필리핀 번호에 안 닿는다(2026-09-14)
import { applyRoomOverrides } from './class-room-override';   // 🚪 지정된 회의방의 출석을 봐야 급여가 0원이 되지 않는다

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
  owner_mode?: boolean;        // 운영자 요약 문자 모드였는지 (기본 OFF)
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
      ⚠️ `teacher_profiles.linked_teacher_id` 는 2026-08-07 실측에서 전 행 NULL 이었다.
         📊 2026-09-06 재실측: 33행 중 **29행이 채워져 있다** — 아래 «0순위 linked» 경로가
            지금은 실제로 도는 주 경로다(그 아래 이름 매칭은 나머지 4행용). */
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
      `SELECT id, user_id, student_name, day_of_week, scheduled_date, start_time, duration_min, teacher_id${startsOnSel(await ensureStartsOnColumn(env))}
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
    else if (s.day_of_week != null && s.day_of_week !== '') occurs = (Number(s.day_of_week) === kDow) && recurStartedOn(s, todayStr);
    if (!occurs) continue;
    seen.add(s.id);
    const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
    if (!Number.isFinite(hh)) continue;
    const start_ts = Date.UTC(kY, kMo, kD, hh, mm || 0, 0) - KST;
    const late = now - start_ts;
    if (late < DETECT_AFTER_MS || late > DETECT_UNTIL_MS) continue;   // 감지 창 밖
    /* ⚠️ `schedule_id` 를 «따로» 담는다 — 이 행의 열쇠는 `s.id` 인데
       applyRoomOverrides 는 `schedule_id` 를 읽는다. 안 담으면 **에러 없이 늘 헛돈다**
       (CLAUDE.md 2장 「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」). */
    candidates.push({ ...s, schedule_id: s.id, start_ts, late_min: Math.floor(late / 60000), room_id: `class-${s.id}-${ymd}` });
  }

  /* 🚪 「오늘은 이 방으로」 — 지정이 걸린 수업은 **그 회의방**의 출석을 봐야 한다.
     ⚠️ 안 보면 학생이 지정된 방에 멀쩡히 있는데 예약방(class-…)에 없다는 이유로
        「결석 위험」이 찍히고, 그 `class_no_show` 행을 `no-show-truth.ts` 가 읽어
        **그 수업의 수업료가 0원**이 된다(CLAUDE.md 2장 「급여가 걸려 있습니다」).
     ⚠️ 던지지 않는다(fail-open) — 지정이 안 걸리면 예약방 그대로다. 정본 src/class-room-override.ts */
  await applyRoomOverrides(env.DB, candidates, ymd);

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

  /* 📵 (2026-09-06) 운영자 요약 문자 — 사장님 지시로 **기본 OFF**.
     [왜] 수업 시간대마다 「🚨 결석 위험 1건 · … (+15분 미입장)」 문자가 사장님 폰으로 계속 왔습니다.
          예약은 있는데 학생이 늦게 들어오는 흔한 경우까지 전부 잡히므로 하루에 여러 통이 됩니다.
     ⚠️ **감지·기록·강사 알림은 그대로입니다** — 멈추는 것은 «운영자에게 문자로 알리는 것» 하나뿐이고,
        결석 위험 자체는 `class_no_show` 에 계속 쌓여 관리자 › 노쇼 리포트에서 그대로 보입니다.
        (기록까지 끄면 「왜 수업이 성립하지 않았나」가 함께 사라집니다 — 규칙서 2장.)
     ⚠️ `OWNER_ALERT_PHONE` 자체를 지우면 안 됩니다 — 결제·환불·이상로그인·사이트 장애·방 갈림
        감시견이 **같은 번호**를 씁니다. 그래서 이 알림 하나만 KV 스위치로 끕니다.
     ✅ 다시 켜려면 배포 없이 KV(SESSION_STATE) `absent_alert_owner_send` = `on`.
     ⚠️ KV 조회가 실패하면 «안 보내는» 쪽으로 떨어집니다 — 이 자리에서 원하는 실패 방향입니다. */
  let ownerMode = false;
  try { ownerMode = (await env.SESSION_STATE?.get('absent_alert_owner_send')) === 'on'; } catch {}
  result.owner_mode = ownerMode;

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
       ⚠️ 못 보낸 경우를 조용히 넘기지 않는다 — 원부의 빈칸이 눈에 보여야 한다.
          📊 [잰 것 — 2026-09-06 운영 D1 `teacher_profiles` 전수] 33행 중 이메일 27 · 연결
             (`linked_teacher_id`) 29 · 한국 번호 2. 즉 **지금은 대부분에게 닿습니다** —
             2026-08-07 에 여기 적혀 있던 「연결 0건」은 그때 값이고 지금은 아닙니다.
             ⚠️ 이메일이 빈 6행 중 **`status='활동중'` 은 둘**입니다 — 프로필 30 「중국어
                강선생님」(원부 29 · 계정 `hq_t_kang`, 그 계정에도 메일 없음)과 36 「JED」
                (원부 20 · 계정 연결 없음). 둘 다 전화도 비어 있어 **어떤 자동 알림도 못
                받습니다.** 나머지 4행은 퇴사 3 · 비활동 1(숨김)이라 보낼 일이 없습니다.
             ⛔ 그 빈칸은 코드로 못 채웁니다 — 관리자 › 📇 강사 연락처 연결에서 사람이 넣습니다
                (⛔ D1 을 직접 UPDATE 하지 말 것 — 규칙서 1-1).
          ⚠️ (2026-09-06) 운영자 요약 문자가 기본 OFF 가 되면서, 그 «⚠ 못 보냄» 줄이 갈 곳이
             한 번 사라졌었다. 지금은 세 곳에 남는다 — ① 켜져 있으면 운영자 요약 문자
             ② 항상 `details[].teacher_sms` ③ 꺼져 있어도 `owner_sms.unsent_lines`.
             ⛔ 「어차피 detail 에 있으니」로 ③을 지우지 말 것: 문자가 안 갈 때 사람이 실제로
                보는 것은 cron 로그(`[absent-sweep]`) 한 줄이고, 거기 안 실리면 안 보인다. */
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
        /* 🔔 (2026-09-14) 웹푸시를 «먼저, 그리고 이메일과 함께» 보낸다 — 강사 화면(teacher.html)에서
           「알림 받기」를 켠 강사의 폰에 카톡 알림처럼 뜬다. 카카오톡 자동 발송은 필리핀 번호에 «구조적으로»
           안 닿아(teacher-push.ts 머리말) 사장님이 이쪽을 고르셨다.
           ⚠️ 푸시는 «켠 사람에게만» 가고 폰이 꺼져 있으면 못 받는다 — 그래서 이메일을 «대신» 하지 않고
              «더한다». 아래 이메일/문자 갈래는 한 글자도 안 바뀐다.
           ⚠️ 못 보낸 이유(no_linked_account / no_subscription …)는 detail 에 그대로 남긴다. */
        let pushOk = false;
        try {
          const pr = await pushToTeacher(env, c.teacher_id,
            '⏰ ' + name + ' has not joined · 학생 미입장 (' + hhmm + ')', bodyEn + '\n' + bodyKo,
            '/teacher', 'absent-' + c.room_id);
          pushOk = pr.sent > 0;
          detail.teacher_push = pushOk ? 'sent' : (pr.why || 'failed');
        } catch (e: any) { detail.teacher_push = 'error:' + String(e?.message || e).slice(0, 80); }
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
          // 🔔 푸시가 실제로 나갔으면 «못 보냄» 이 아니다 — 운영자 경고는 «아무 데도 안 닿았을 때» 만.
          if (!pushOk) ownerLines.push(`  ⚠ 강사 «${tc.name || c.teacher_id}» 에게 못 보냄 — ${why}`);
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

  // 운영자 요약 문자 1통 (dry 는 발송 안 함 · 기본 OFF — 위 ownerMode 참고)
  if (result.alerted > 0 && !dry) {
    /* ⛔ 꺼져 있어도 조용히 넘기지 않는다 — 「왜 문자가 안 왔나」와 「무엇이 안 갔나」가
       함께 보여야 한다. 보이는 곳: cron 로그 `[absent-sweep]`(index.ts 가 result 를 통째로
       찍는다)과 GET /api/admin/absent-sweep/run 응답.
       ⚠️ dry run 은 여기까지 오지 않는다(`!dry` 조건) — 그때는 위 `owner_mode:false` 로 본다.
       ⛔ 이 분기를 «이른 return» 으로 되돌리지 말 것: 나중에 이 블록 뒤에 정리 코드가 붙으면
          OFF 인 날에만 조용히 건너뛰어진다. */
    if (ownerMode) {
      try {
        const ownerPhone = env.OWNER_ALERT_PHONE;
        if (ownerPhone) {
          const text = `[망고아이] 🚨 결석 위험 ${result.alerted}건\n${ownerLines.slice(0, 8).join('\n')}${parentMode ? '\n(학부모 문자 발송됨)' : '\n(학부모 발송 OFF — 관리자 확인용)'}`;
          result.owner_sms = await sendPlainSms(env, ownerPhone, text);
        } else result.owner_sms = { skipped: 'no_owner_phone' };
      } catch (e: any) { result.owner_sms = { error: String(e?.message || e).slice(0, 120) }; }
    } else {
      result.owner_sms = {
        skipped: 'owner_send_off',
        hint: "KV absent_alert_owner_send='on' 이면 다시 보냅니다",
        unsent_lines: ownerLines.slice(0, 8),   // 강사에게 «못 보냄» 사유가 여기서 사라지지 않게
      };
    }
  }

  return result;
}
