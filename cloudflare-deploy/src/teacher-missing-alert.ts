/**
 * teacher-missing-alert.ts — 🧑‍🏫 «학생은 왔는데 강사가 없다» 를 강사에게 먼저 알리고,
 *   그래도 아무 데도 안 닿으면 운영자(사장님)에게 문자 1통 (2026-10-28 사장님 지시)
 *
 *  [왜 만들었나] 2026-10-28 19:20 `class-4576-20261028`(중국어 강선생님 · 정우영):
 *    · 학생은 19:18 부터 세 번 들어와 기다렸고, 강사는 그날 서버에 요청이 0건이었다(중국 회선 추정).
 *    · 학생 화면의 「강사 미입장」 알림(`/api/notify/no-show`)이 19:18:49 에 두 번 기록됐지만
 *      **푸시 0 · 알림톡 0** — 그 강사는 전화·이메일·푸시가 하나도 등록돼 있지 않다.
 *    · 운영자 문자는 9/6(결석 위험)·9/8(전체)에 꺼져 있어 **아무도 몰랐다.**
 *    📊 [잰 것 — 2026-10-28, 최근 30일 `class-*` 방] 학생이 들어왔는데 시작 10분이 지나도
 *       강사가 없던 수업 **12건**, 그 방들의 «강사 미입장» 기록은 **전부 푸시 0 · 알림톡 0**.
 *
 *  [무엇을 하나] 결석 감지 크론(absent-sweep.ts, 15분마다 · 시작 +10~40분 창)이 «학생이 들어온»
 *    수업을 넘겨주면:
 *      ① 강사가 그 방에 한 번이라도 있었나 — 판정 정본 `teacherPresenceByRoom`(이름 일치만 · role 안 믿음)
 *         · 있었다(true) → 아무것도 안 한다
 *         · 모른다(null) → 아무것도 안 한다(«없었다» 로 단정해 문자를 보내지 않는다)
 *         · 없었다(false) → 그래도 그 방에 «이름 없는 교사·role=teacher» 접속이 있으면 멈춘다
 *           (`hasUnattributedTeacher` — 헛문자 방지) · 그것도 없으면 ②
 *      ② 강사에게 먼저 — 웹푸시 + 이메일(있으면). 학생 화면이 이미 보낸 알림이 «실제로 닿았으면»
 *         (`class_no_show.notified_push/kakao = 1`) 그것도 «닿았다» 로 센다.
 *      ③ ②가 하나도 안 닿았을 때만 운영자 번호(`OWNER_ALERT_PHONE`)로 문자 1통 — 종류
 *         `teacher-missing` 으로 밝혀 음소거(9/8) 예외로 나간다(정본 `owner-sms-mute.ts`).
 *    방마다 «한 번만» — `teacher_missing_alert` 표에 먼저 선점(INSERT OR IGNORE)한 호출만 보낸다.
 *
 *  ⛔ `class_no_show` 에 행을 «쓰지» 않는다 — 그 표의 강사 행은 급여(`teacher_no_show` → 0원)와 이어져
 *     있고, 강사가 늦게라도 들어오면 사후 판정이 뒤집힌다. 여기서는 «알림» 만 한다(읽기는 한다).
 *  ⛔ 운영자 문자는 «강사에게 닿을 길이 없을 때» 만 — 9/6 에 «수업마다 문자» 가 와서 끈 결정을
 *     되돌리지 않는다(실측 빈도는 위 12건 중 연락처가 비어 있는 강사 몫뿐이다).
 *  ⚠️ 던지지 않는다 — 부르는 쪽이 결석 감지 크론이라 여기서 던지면 그 흐름이 통째로 멈춘다.
 *  ⚠️ `findContact` 는 부르는 쪽(absent-sweep.ts)이 넘긴다 — 여기서 import 하면
 *     absent-sweep ↔ teacher-missing-alert 순환이 된다(teacher-push.ts 머리말과 같은 이유).
 */
import { teacherPresenceByRoom } from './no-show-truth';
import { pushToTeacher } from './teacher-push';
import { sendEmail, emailLayout } from './email';
import { sendPlainSms } from './solapi-client';

/** 감지 대상 한 건 — absent-sweep.ts 의 candidates 한 줄(학생이 이미 들어온 것). */
export interface TeacherMissingCase {
  room_id: string;
  schedule_id?: number | string | null;
  id?: number | string | null;
  teacher_id?: number | string | null;
  user_id?: string | null;
  student_name?: string | null;
  start_time?: string | null;
  late_min?: number | null;
}

export interface TeacherContactLike { name: string; phone: string | null; email: string | null; why: string }

export interface TeacherMissingDetail {
  room_id: string;
  status: string;            // teacher_present / presence_unknown / no_teacher_id / already_alerted / teacher_reached / owner_sms_sent …
  teacher?: string | null;
  student?: string | null;
  start?: string | null;
  late_min?: number | null;
  push?: string;
  email?: string;
  client_alert?: string;
  owner_sms?: string;
}

export interface TeacherMissingResult { checked: number; escalated: number; details: TeacherMissingDetail[]; dry?: boolean }

/** 이름 없이 «교사» 로만 들어온 접속 — 누구인지 몰라 판정에 안 걸리지만 «강사가 없다» 로 단정할 수도 없다. */
const UNNAMED_TEACHER_RE = /^\s*(?:교사|강사|선생님|teacher|tutor)\s*$/i;

/**
 * 그 방에 «이름으로 못 가린 강사 같은 접속» 이 있나 — 있으면 운영자 문자를 보내지 않는다.
 *   📊 [잰 것 — CLAUDE.md 2장 「21분 수업했는데 강사 미입장」] 최근 30일 강사 접속 254회 중 이름 없는
 *      `교사` 34회 — 정본 판정은 그 접속을 «강사 아님» 으로 보므로, 이것을 안 거르면 강사가 앉아 있는데
 *      운영자에게 「연락 안 됨」 문자가 간다(9/6 에 문자를 끈 바로 그 종류의 헛알림).
 *   ⚠️ `role` 은 클라이언트가 보내는 값이라 «있었다» 의 근거로는 안 쓴다(급여 판정). 여기서는 «알림을
 *      덜 보내는» 쪽으로만 쓴다 — 틀려도 결과는 «예전처럼 아무도 모른다» 이지 헛문자가 아니다.
 */
export function hasUnattributedTeacher(rows: Array<{ role?: any; username?: any }>): boolean {
  return (rows || []).some(r => String(r?.role || '') === 'teacher' || UNNAMED_TEACHER_RE.test(String(r?.username || '')));
}

/**
 * 판정 정본(순수 함수) — «운영자에게 문자를 보낼까».
 *   · 강사가 그 방에 «없었다» 로 확정(present === false)일 때만 — null(모름)은 보내지 않는다
 *   · 그리고 강사에게 보낸 알림이 하나도 안 닿았을 때만
 */
export function shouldEscalateTeacherMissing(present: boolean | null | undefined, reached: boolean): boolean {
  return present === false && !reached;
}

/** 강사에게 보내는 글(한/영) — 푸시·이메일이 같은 글을 쓴다. */
export function teacherMissingTeacherText(student: string, hhmm: string, lateMin: number): { title: string; ko: string; en: string } {
  return {
    title: `⏰ Student is waiting · 학생이 기다리고 있어요 (${hhmm})`,
    ko: `${student} 학생이 수업방에 들어와 기다리고 있어요 (${hhmm} 수업 · +${lateMin}분).\n지금 입장해 주세요.`,
    en: `${student} is waiting in the class room (${hhmm} class · +${lateMin} min).\nPlease join now.`,
  };
}

/** 운영자에게 보내는 문자 — 누가·언제·왜 안 닿았는지와 «할 일» 을 함께. */
export function teacherMissingOwnerText(teacher: string, student: string, hhmm: string, lateMin: number, why: string): string {
  return `[망고아이] 🚨 강사 미입장 · 연락 안 됨\n`
    + `${teacher} 강사 · ${student} 학생 ${hhmm} 수업 (+${lateMin}분)\n`
    + `학생은 수업방에서 기다리는 중인데 강사가 아직 없고, 강사에게 보낸 알림이 하나도 닿지 않았습니다(${why}).\n`
    + `강사에게 직접 연락해 주세요.`;
}

function escapeHtml(s: any): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * absent-sweep.ts 가 «학생이 들어온» 수업을 넘기면 위 ①②③ 을 돈다.
 * @param findContact 원부 강사 → 이름·연락처(absent-sweep.ts 의 findTeacherContact). 순환 import 를 피하려고 받는다.
 * dry 면 선점·발송을 안 하고 «무엇을 할 것인가» 만 돌려준다.
 */
export async function runTeacherMissingAlerts(
  env: any,
  cases: TeacherMissingCase[],
  nowMs: number,
  opts: { dry?: boolean; findContact: (env: any, teacherId: any) => Promise<TeacherContactLike> },
): Promise<TeacherMissingResult> {
  const dry = !!opts.dry;
  const out: TeacherMissingResult = { checked: 0, escalated: 0, details: [], dry };
  if (!cases || !cases.length || !env?.DB) return out;

  if (!dry) {
    try {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_missing_alert (room_id TEXT PRIMARY KEY, schedule_id INTEGER, teacher_id TEXT, created_at INTEGER NOT NULL, result TEXT)`);
    } catch (e: any) { console.warn('[teacher-missing] 표 보장 실패:', e?.message || e); }
  }

  for (const c of cases) {
    out.checked++;
    const room = String(c?.room_id || '').trim();
    const student = String(c?.student_name || c?.user_id || '학생');
    const hhmm = String(c?.start_time || '');
    const late = Number(c?.late_min) || 0;
    const d: TeacherMissingDetail = { room_id: room, status: '', student, start: hhmm, late_min: late };
    out.details.push(d);
    try {
      const tid = String(c?.teacher_id ?? '').trim();
      if (!room || !tid) { d.status = 'no_teacher_id'; continue; }

      // 이미 이 방을 처리했으면 다시 보지 않는다(크론이 15분마다 같은 수업을 또 본다)
      const seen = await env.DB.prepare(`SELECT 1 FROM teacher_missing_alert WHERE room_id = ? LIMIT 1`)
        .bind(room).first().catch(() => null);
      if (seen) { d.status = 'already_alerted'; continue; }

      const tc = await opts.findContact(env, tid);
      const tname = String(tc?.name || '').trim();
      d.teacher = tname || null;
      if (!tname) { d.status = 'teacher_unknown'; continue; }

      // ① 강사가 이 방에 한 번이라도 있었나 — 정본 판정(이름 일치만 · 모르면 null)
      const pm = await teacherPresenceByRoom(env.DB, [{
        room_id: room, missing_role: 'teacher', teacher_name: tname, student_name: student,
      }]);
      const present = pm.get(room)?.present;
      if (present === true) { d.status = 'teacher_present'; continue; }
      if (present !== false) { d.status = 'presence_unknown'; continue; }
      const roomRows: any = await env.DB.prepare(`SELECT role, username FROM attendance WHERE room_id = ? LIMIT 200`)
        .bind(room).all();
      if (hasUnattributedTeacher(roomRows?.results || [])) { d.status = 'teacher_like_in_room'; continue; }

      if (dry) { d.status = 'would_notify_teacher'; continue; }

      // 방마다 한 번 — 선점에 성공한 호출만 보낸다
      const claim = await env.DB.prepare(
        `INSERT OR IGNORE INTO teacher_missing_alert (room_id, schedule_id, teacher_id, created_at) VALUES (?, ?, ?, ?)`
      ).bind(room, Number(c?.schedule_id ?? c?.id) || null, tid, nowMs).run();
      if (!(claim?.meta?.changes > 0)) { d.status = 'already_alerted'; continue; }

      // ② 강사에게 먼저 — 푸시 + 이메일
      const msg = teacherMissingTeacherText(student, hhmm, late);
      let reached = false;
      try {
        const pr = await pushToTeacher(env, tid, msg.title, msg.en + '\n' + msg.ko, '/teacher', 'teacher-missing-' + room);
        d.push = pr.sent > 0 ? 'sent' : (pr.why || 'failed');
        if (pr.sent > 0) reached = true;
      } catch (e: any) { d.push = 'error:' + String(e?.message || e).slice(0, 80); }
      if (tc.email) {
        try {
          const r = await sendEmail(env, {
            to: tc.email,
            subject: `[Mangoi] Student is waiting / 학생이 기다리고 있어요 (${hhmm})`,
            html: emailLayout({
              title: '⏰ 학생이 기다리고 있어요 · Student is waiting',
              bodyHtml: `<p style="white-space:pre-line">${escapeHtml(msg.ko)}</p>`
                      + `<p style="white-space:pre-line;color:#475569">${escapeHtml(msg.en)}</p>`,
            }),
          });
          d.email = r && r.ok ? 'sent' : ((r && (r.error || r.mode)) || 'failed');
          if (r && r.ok) reached = true;
        } catch (e: any) { d.email = 'error:' + String(e?.message || e).slice(0, 80); }
      } else d.email = tc.why === 'linked' ? 'no_email' : (tc.why || 'no_email');

      // 학생 화면이 이미 보낸 «강사 미입장» 알림이 실제로 닿았으면 그것도 «닿았다»
      try {
        const ns: any = await env.DB.prepare(
          `SELECT MAX(notified_push) AS p, MAX(notified_kakao) AS k FROM class_no_show WHERE room_id = ? AND missing_role = 'teacher'`
        ).bind(room).first();
        const hit = !!(ns && (Number(ns.p) > 0 || Number(ns.k) > 0));
        d.client_alert = hit ? 'delivered' : 'none';
        if (hit) reached = true;
      } catch { d.client_alert = 'lookup_failed'; }

      // ③ 아무 데도 안 닿았을 때만 운영자에게
      if (!shouldEscalateTeacherMissing(present, reached)) {
        d.status = 'teacher_reached';
      } else {
        const ownerPhone = env.OWNER_ALERT_PHONE;
        if (!ownerPhone) d.owner_sms = 'no_owner_phone';
        else {
          const why = `푸시 ${d.push || '-'} · 이메일 ${d.email || '-'}`;
          const r = await sendPlainSms(env, ownerPhone, teacherMissingOwnerText(tname, student, hhmm, late, why), { kind: 'teacher-missing' });
          d.owner_sms = r && r.ok ? 'sent' : ((r && (r.muted ? 'muted' : (r.error || r.message))) || 'failed');
          if (r && r.ok) out.escalated++;
        }
        d.status = 'owner_escalated';
      }

      try {
        await env.DB.prepare(`UPDATE teacher_missing_alert SET result = ? WHERE room_id = ?`)
          .bind(JSON.stringify(d).slice(0, 1000), room).run();
      } catch { /* 기록 실패는 알림을 되돌리지 않는다 */ }
    } catch (e: any) {
      d.status = 'error:' + String(e?.message || e).slice(0, 80);
    }
  }

  // 사람이 보러 갈 곳 — cron 로그. 학생만 들어오고 강사 판정이 «있었다» 뿐이면 조용히 둔다.
  if (out.details.some(x => x.status !== 'teacher_present')) {
    console.log('[teacher-missing]', JSON.stringify(out));
  }
  return out;
}
