/**
 * absence-hold.ts — ⏸ «말없이 그만둔» 학생의 수업을 자동으로 보류한다 (2026-09-25 사장님 결정)
 *
 * [왜] B2B·B2C 학생 중 그만둔다는 말 없이 안 나오는 경우가 있다. 그러면
 *      ① 강사는 매번 빈 방을 기다리고 ② 본사는 그 수업의 강사비를 계속 내고
 *      ③ 학생은 결석만 계속 쌓인다.
 *
 * [사장님 결정 — 2026-09-25]
 *   1. **결석 2회 연속**이면 그 학생의 수업을 자동으로 «보류» 한다.
 *   2. 보류된 수업의 강사비는 **0%**. 강사는 무조건 기다리지 말고 **필리핀 매니저에게**
 *      «계속 다니는지 / 그만두었는지» 확인한다(매니저가 [재개]·[그만둠] 을 누른다).
 *   3. 학생·학부모에게 **문자 + 카카오 알림톡**(템플릿이 등록돼 있으면)으로 확인 요청.
 *   4. 연락처는 **수강 등록 때 적은 번호(=학생 목록)** — 정본 `phonesForStudent`.
 *   5. 강사·매니저에게 **이메일 + 알림(웹푸시)**, 관리자·/teacher·/manager 화면에 자동 표시.
 *
 * [설계]
 *   · `class_schedules` 는 **한 글자도 안 바꾼다.** 보류는 이 표(`class_absence_hold`)에만 적고
 *     읽는 쪽(급여·강사 화면·결석 감지)이 이 표를 본다.
 *     ⛔ status 를 'cancelled' 로 바꾸지 말 것 — 급여가 «그 수업 전체» 를 빼서 보류 «전» 에
 *        실제로 한 수업까지 0원이 되고, 카페24 미러가 취소된 행을 «없는 것» 으로 보고 되살린다.
 *   · 보류는 «학생 단위» 다 — 수강신청 확정은 회차마다 일회성 행을 만들어(한 행 = 한 회)
 *     «한 예약 행의 연속 결석» 은 성립하지 않는다.
 *   · 기간은 (held_after, resumed_on) 열린 구간 — 보류를 건 날(=두 번째 결석일) 수업은
 *     이미 강사가 기다렸으므로 기존 규칙(학생 결석 지급률) 그대로, 그 «다음» 회차부터 0%.
 *
 * [판정 — 안전한 쪽으로 실패]
 *   회차마다 셋 중 하나다: absent(결석 기록 있음) · attended(그날 출석 있음) · unknown(둘 다 없음).
 *   가장 최근 회차부터 거꾸로 세어 absent 만 이어질 때의 개수가 연속 결석이다.
 *   ⚠️ unknown 은 연속을 «끊는다» — 모르면 보류하지 않는다(멀쩡한 학생의 수업이 멈추는 쪽이 더 나쁘다).
 *   ⚠️ 결석 기록은 `class_no_show`(missing_role='student') — absent-sweep 이 «시작 10분 뒤에도
 *      입장 안 함» 일 때만 남긴다. 판정을 새로 만들지 않는다.
 *
 * [끄기] KV(SESSION_STATE) `absence_hold` = 'off' → 새 보류를 안 건다(이미 건 것은 그대로).
 *        KV `absence_hold_notify_student` = 'off' → 학생·학부모 문자/알림톡만 끈다.
 */

import { phonesForStudent } from './notify-contacts';
import { sendPlainSms, sendKakaoAlimtalk } from './solapi-client';
import { sendEmail, emailLayout } from './email';
import { pushToTeacher } from './teacher-push';
import { PH_MANAGERS } from './auth-admin';
import { recurStartedOn } from './class-start-date';
import { siteUrl } from './site-url';
import { selectInChunks } from './d1-chunk';   // 🔢 IN 목록은 공용 헬퍼로(D1 바인드 100개 한도)

export const ABSENCE_HOLD_STREAK = 2;      // 사장님 결정: 결석 2회 연속
const LOOKBACK_DAYS = 45;                  // 회차를 거꾸로 볼 기간
const KAKAO_CHANNEL = 'https://pf.kakao.com/_xlqnSxd';   // ⛔ 뒤에 /chat 을 붙이지 말 것(비로그인 PC 가 로그인으로 튕김)

const DOW: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};
/** day_of_week 표기 세 벌('4'·'Thu'·'목'·'1,3,5') → 요일 번호 목록. 모르면 빈 배열(지어내지 않음). */
export function dowList(raw: any): number[] {
  const out: number[] = [];
  for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
    const t = p.trim();
    if (!t) continue;
    let n: number | undefined;
    if (/^\d+$/.test(t)) { const v = Number(t); if (v >= 0 && v <= 6) n = v; }
    else n = DOW[t.toLowerCase()];
    if (n !== undefined && out.indexOf(n) < 0) out.push(n);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
const KST = 9 * 3600 * 1000;
export function kstYmd(ms: number): string {
  const k = new Date(ms + KST);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}
function addDays(ymd: string, d: number): string {
  const t = Date.parse(ymd + 'T00:00:00Z') + d * 86400000;
  const k = new Date(t);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

export type OccState = 'absent' | 'attended' | 'unknown';
export interface Occurrence { date: string; start: string; schedule_id: number; state: OccState; }

/**
 * 순수 함수 — 회차 목록(순서 무관)에서 «가장 최근부터 이어진 결석» 개수.
 * unknown 을 만나면 멈춘다(모르면 보류하지 않는다).
 */
export function absenceStreak(occ: Occurrence[]): number {
  const sorted = occ.slice().sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  let n = 0;
  for (const o of sorted) {
    if (o.state === 'absent') n++;
    else break;
  }
  return n;
}

/**
 * 순수 함수 — 그 날짜의 수업이 «보류 기간» 에 들어가는가.
 * 구간은 (held_after, resumed_on) — 보류를 건 날과 재개한 날 수업은 포함하지 않는다.
 */
export function isHeldOn(h: { held_after: string; resumed_on?: string | null }, ymd: string): boolean {
  if (!h || !h.held_after || !ymd) return false;
  if (!(ymd > h.held_after)) return false;
  if (h.resumed_on && !(ymd < h.resumed_on)) return false;
  return true;
}

export async function ensureAbsenceHoldTable(env: any): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_absence_hold (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_id TEXT, teacher_name TEXT, held_after TEXT NOT NULL, resumed_on TEXT, streak INTEGER, state TEXT NOT NULL DEFAULT 'held', notify_json TEXT, decided_by TEXT, decided_at INTEGER, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_absence_hold_uid ON class_absence_hold(student_uid)`); } catch { /* 있음 */ }
}

/** 보류 기록 전부(학생 uid 소문자 → 행 목록). 못 읽으면 빈 Map — «보류 없음» 으로 떨어진다(예전과 같음). */
export async function loadHoldRanges(env: any): Promise<Map<string, any[]>> {
  const m = new Map<string, any[]>();
  if (!env?.DB) return m;
  try {
    const rs = await env.DB.prepare(
      `SELECT id, student_uid, held_after, resumed_on, state FROM class_absence_hold WHERE state IN ('held','ended','resumed')`
    ).all();
    for (const r of (rs?.results || [])) {
      const k = String((r as any).student_uid || '').toLowerCase();
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
  } catch { /* 표가 아직 없음 — 보류 없음 */ }
  return m;
}
export function heldOnFor(ranges: Map<string, any[]>, uid: any, ymd: string): any | null {
  const list = ranges.get(String(uid || '').toLowerCase());
  if (!list) return null;
  for (const h of list) if (isHeldOn(h, ymd)) return h;
  return null;
}

/**
 * 보류 기간이라도 학생이 «실제로 들어온» 회차는 보류가 아니다 — 강사가 수업했으니 지급한다.
 * 방 번호(`class-{예약id}-{YYYYMMDD}`) 중 학생 접속이 있는 것. ⛔ 못 읽으면 null —
 * 부르는 쪽은 null 이면 보류를 적용하지 않는다(모르면 예전 동작 = 가르친 수업을 0원으로 만들지 않는다).
 */
export async function attendedStudentRooms(env: any, roomIds: string[]): Promise<Set<string> | null> {
  const out = new Set<string>();
  const ids = [...new Set(roomIds.filter(Boolean))];
  if (!ids.length) return out;
  try {
    const rows = await selectInChunks<any>(env.DB, ids,
      (ph) => `SELECT DISTINCT room_id FROM attendance WHERE room_id IN (${ph}) AND role = 'student' AND status <> 'scheduled'`);
    for (const r of rows) out.add(String(r.room_id));
    return out;
  } catch (e: any) {
    console.warn('[absence-hold] 보류 회차 출석 확인 실패 — 보류를 적용하지 않음:', e?.message || e);
    return null;
  }
}

/** 그 학생의 최근 회차와 각 회차의 출결 상태. */
export async function studentOccurrences(env: any, uid: string, now: number): Promise<Occurrence[]> {
  const today = kstYmd(now);
  const from = addDays(today, -LOOKBACK_DAYS);
  const rs = await env.DB.prepare(
    `SELECT * FROM class_schedules WHERE user_id = ? AND COALESCE(status,'active') != 'cancelled'`
  ).bind(uid).all();
  const rows: any[] = (rs?.results || []).filter((r: any) => {
    const u = String(r.user_id || '').toLowerCase();
    return u && u !== 'lms' && u !== 'type_seed';
  });
  const occ: Occurrence[] = [];
  for (const r of rows) {
    const start = String(r.start_time || '00:00').slice(0, 5);
    const [hh, mm] = start.split(':').map(Number);
    const dur = Number(r.duration_min ?? r.duration_minutes ?? 30) || 30;
    const startMs = (ymd: string) => Date.parse(`${ymd}T${pad(hh || 0)}:${pad(mm || 0)}:00+09:00`);
    const endedBy = (ymd: string) => startMs(ymd) + (dur + 40) * 60000 <= now;
    const dated = String(r.scheduled_date || '').replace(/\//g, '-').slice(0, 10);
    const dates: string[] = [];
    if (dated) {
      if (dated >= from && dated <= today) dates.push(dated);
    } else {
      const dows = dowList(r.day_of_week);
      if (!dows.length) continue;
      for (let d = from; d <= today; d = addDays(d, 1)) {
        if (dows.indexOf(new Date(d + 'T00:00:00Z').getUTCDay()) >= 0 && recurStartedOn(r, d)) dates.push(d);
      }
    }
    // 끝난 회차 + «이미 시작한» 회차(끝나기 전이라도 결석 기록이 찍혔으면 센다 — 아래에서 거른다).
    // ⚠️ 결석 감지는 «시작+10~40분» 에 기록하고 곧바로 이 판정을 부른다. 끝난 회차만 세면
    //    방금 기록된 결석이 빠져 «2회 연속» 이 실제로는 «3회» 가 된다(2026-09-25 함정 대조).
    for (const d of dates) if (startMs(d) <= now) occ.push({ date: d, start, schedule_id: Number(r.id), state: 'unknown', ended: endedBy(d) } as any);
  }
  if (!occ.length) return occ;

  // 결석 기록 — (schedule_id, KST 날짜)
  const absentKeys = new Set<string>();
  try {
    const ids = [...new Set(occ.map(o => o.schedule_id))];
    const q = await env.DB.prepare(
      `SELECT schedule_id, created_at FROM class_no_show
        WHERE missing_role = 'student' AND created_at >= ? AND instr(?, ',' || CAST(schedule_id AS TEXT) || ',') > 0`
    ).bind(Date.parse(from + 'T00:00:00+09:00'), ',' + ids.join(',') + ',').all();
    for (const r of (q?.results || [])) absentKeys.add(`${(r as any).schedule_id}|${kstYmd(Number((r as any).created_at))}`);
  } catch { /* 모르면 전부 unknown — 보류 안 함 */ }

  // 출석 — 그날 그 학생의 접속(기기 id 칸·계정 칸 둘 다) 또는 그 예약방의 학생 접속
  const attended = new Set<string>();
  try {
    const q = await env.DB.prepare(
      `SELECT date, room_id FROM attendance
        WHERE (account_uid = ? OR user_id = ?) AND date >= ? AND status <> 'scheduled' AND room_id NOT LIKE 'c24-%'`
    ).bind(uid, uid, from).all();
    for (const r of (q?.results || [])) attended.add(String((r as any).date || '').slice(0, 10));
  } catch { /* 칸이 없는 옛 DB — 아래 방 번호 판정만 */ }
  try {
    const q = await env.DB.prepare(
      `SELECT DISTINCT room_id FROM attendance WHERE room_id LIKE 'class-%' AND role = 'student' AND joined_at >= ? AND instr(?, ',' || room_id || ',') > 0`
    ).bind(Date.parse(from + 'T00:00:00+09:00'), ',' + occ.map(o => `class-${o.schedule_id}-${o.date.replace(/-/g, '')}`).join(',') + ',').all();
    for (const r of (q?.results || [])) {
      const m = String((r as any).room_id).match(/-(\d{4})(\d{2})(\d{2})$/);
      if (m) attended.add(`${m[1]}-${m[2]}-${m[3]}`);
    }
  } catch { /* 무시 */ }

  for (const o of occ) {
    if (attended.has(o.date)) o.state = 'attended';
    else if (absentKeys.has(`${o.schedule_id}|${o.date}`)) o.state = 'absent';
  }
  // 아직 안 끝났고 기록도 없는 회차는 뺀다(진행 중 = 모름 — 연속을 끊지도 잇지도 않는다).
  return occ.filter((o: any) => o.ended || o.state !== 'unknown').map((o: any) => { const { ended, ...rest } = o; return rest; });
}

async function kvOff(env: any, key: string): Promise<boolean> {
  try { return (await env.SESSION_STATE?.get(key)) === 'off'; } catch { return false; }
}

function studentMessage(name: string): string {
  return `[망고아이] ${name} 학생이 최근 수업에 2회 연속 출석하지 않아 다음 수업을 잠시 보류했습니다.\n`
    + `계속 수업하실지 알려 주세요. 답이 없으면 담당 선생님이 기다리지 않습니다.\n`
    + `카카오톡 상담: ${KAKAO_CHANNEL}`;
}

/** 학생·학부모 연락 — 수강 등록 때 적은 번호(학생 목록). 알림톡 템플릿이 있으면 알림톡(실패 시 문자로 대체). */
async function notifyStudent(env: any, uid: string, name: string): Promise<any> {
  const out: any = { phones: 0, sent: [] as any[] };
  if (await kvOff(env, 'absence_hold_notify_student')) { out.skipped = 'switch_off'; return out; }
  const p = await phonesForStudent(env, uid);
  const list: { to: string; who: string }[] = [];
  if (p.parent) list.push({ to: p.parent, who: 'parent' });
  if (p.student && p.student !== p.parent) list.push({ to: p.student, who: 'student' });
  out.phones = list.length;
  if (!list.length) { out.why = 'no_phone_in_student_list'; return out; }
  const text = studentMessage(name);
  const tpl = String(env.SOLAPI_TEMPLATE_ABSENCE_HOLD || '');
  for (const r of list) {
    try {
      let res: any;
      if (tpl) {
        res = await sendKakaoAlimtalk(env, {
          templateCode: tpl, recipientPhone: r.to,
          variables: { '#{학생명}': name || '회원', '#{상담URL}': KAKAO_CHANNEL },
          fallbackSmsText: text,
        } as any);
        out.sent.push({ who: r.who, via: 'alimtalk', ok: !!res?.ok, error: res?.ok ? undefined : (res?.error || res?.message) });
      } else {
        res = await sendPlainSms(env, r.to, text, { subject: '수업 보류 안내' });
        out.sent.push({ who: r.who, via: 'sms', ok: !!res?.ok, error: res?.ok ? undefined : (res?.error || res?.message) });
      }
    } catch (e: any) { out.sent.push({ who: r.who, ok: false, error: String(e?.message || e).slice(0, 80) }); }
  }
  if (!tpl) out.alimtalk = 'template_not_set';   // 알림톡은 카카오 검수 템플릿 등록 뒤에 켜진다
  return out;
}

/** 강사·필리핀 매니저 — 이메일 + 웹푸시. */
async function notifyStaff(env: any, h: { student_name: string; teacher_id: any; teacher_name: string | null; streak: number }): Promise<any> {
  const out: any = {};
  const name = h.student_name;
  const titleKo = `⏸ ${name} 학생 수업 보류 (결석 ${h.streak}회 연속)`;
  const bodyEn = `${name} has missed ${h.streak} classes in a row. Upcoming classes are ON HOLD (no pay while on hold).\n`
    + `Teacher: do NOT wait in the room — ask the Philippine manager whether the student continues or has quit.\n`
    + `Manager: confirm with the student/academy, then press [Resume] or [Quit] on the manager page.`;
  const bodyKo = `${name} 학생이 ${h.streak}회 연속 결석해 다음 수업부터 보류했습니다(보류 기간 강사비 0%).\n`
    + `강사: 방에서 기다리지 말고 필리핀 매니저에게 계속 다니는지/그만두었는지 확인하세요.\n`
    + `매니저: 학생·학원에 확인한 뒤 매니저 화면에서 [재개] 또는 [그만둠]을 눌러 주세요.`;
  const tag = 'absence-hold-' + String(name).slice(0, 20);
  try {
    const pt = await pushToTeacher(env, h.teacher_id, titleKo, bodyEn + '\n' + bodyKo, '/teacher', tag);
    out.teacher_push = pt.sent > 0 ? 'sent' : (pt.why || 'failed');
  } catch (e: any) { out.teacher_push = 'error'; }
  try {
    const pm = await pushToTeacher(env, '', titleKo, bodyEn + '\n' + bodyKo, '/manager', tag, PH_MANAGERS);
    out.manager_push = pm.sent > 0 ? 'sent' : (pm.why || 'failed');
  } catch (e: any) { out.manager_push = 'error'; }

  // 이메일 — 강사(프로필) + 매니저(계정)
  const emails: string[] = [];
  try {
    const tn = String(h.teacher_name || '').trim();
    if (tn) {
      const r: any = await env.DB.prepare(
        `SELECT email FROM teacher_profiles WHERE (UPPER(TRIM(english_name)) = UPPER(?) OR UPPER(TRIM(korean_name)) = UPPER(?)) AND email IS NOT NULL AND TRIM(email) <> '' LIMIT 2`
      ).bind(tn, tn).all();
      const rows = r?.results || [];
      if (rows.length === 1) emails.push(String(rows[0].email).trim());   // 두 명 이상이면 붙이지 않는다(남의 강사)
    }
  } catch { /* 무시 */ }
  try {
    const rows = await selectInChunks<any>(env.DB, PH_MANAGERS,
      (ph) => `SELECT email FROM admin_account WHERE username IN (${ph}) AND email IS NOT NULL AND TRIM(email) <> ''`);
    for (const x of rows) { const e = String((x as any).email).trim(); if (e && emails.indexOf(e) < 0) emails.push(e); }
  } catch { /* 무시 */ }
  if (emails.length) {
    try {
      const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
      const r = await sendEmail(env, {
        to: emails,
        subject: `[Mangoi] ${name} — class on hold (absent ${h.streak}x) / 수업 보류`,
        html: emailLayout({
          title: '⏸ Class on hold · 수업 보류',
          bodyHtml: `<p style="white-space:pre-line">${esc(bodyEn)}</p><p style="white-space:pre-line;color:#475569">${esc(bodyKo)}</p>`
                  + `<p><a href="${siteUrl('/manager')}">${siteUrl('/manager')}</a></p>`,
        }),
      });
      out.email = r.ok ? `sent:${emails.length}` : (r.error || r.message || 'failed');
    } catch (e: any) { out.email = 'error'; }
  } else out.email = 'no_email';
  return out;
}

/**
 * 결석이 새로 기록된 학생에 대해 부른다(absent-sweep). 연속 2회 이상이면 보류를 걸고 알린다.
 * ⛔ 던지지 않는다 — 부르는 쪽이 15분 감시 작업이다.
 */
export async function maybeHoldStudent(env: any, c: { user_id: any; student_name?: any; teacher_id?: any; teacher_name?: any }, now: number, opts: { dry?: boolean } = {}): Promise<any> {
  const uid = String(c.user_id || '').trim();
  if (!uid || !env?.DB) return { status: 'no_uid' };
  try {
    if (await kvOff(env, 'absence_hold')) return { status: 'switch_off' };
    await ensureAbsenceHoldTable(env);
    const today = kstYmd(now);
    // ⛔ loadHoldRanges(못 읽으면 빈 Map)를 쓰지 않는다 — 여기서 «없음» 으로 떨어지면 보류가 두 번 걸리고
    //    학부모 문자도 두 번 나간다(되돌릴 수 없음). 이 조회는 실패하면 던져 아래 catch 로 «보류 안 함».
    const open: any = await env.DB.prepare(
      `SELECT id FROM class_absence_hold WHERE student_uid = ? COLLATE NOCASE AND state IN ('held','ended') LIMIT 1`
    ).bind(uid).first();
    if (open) return { status: 'already_held', id: open.id };
    const occ = await studentOccurrences(env, uid, now);
    const streak = absenceStreak(occ);
    if (streak < ABSENCE_HOLD_STREAK) return { status: 'below', streak };
    if (opts.dry) return { status: 'would_hold', streak };
    const name = String(c.student_name || uid);
    const tname = c.teacher_name ? String(c.teacher_name) : null;
    const ins: any = await env.DB.prepare(
      `INSERT INTO class_absence_hold (student_uid, student_name, teacher_id, teacher_name, held_after, streak, state, created_at, updated_at)
       VALUES (?,?,?,?,?,?, 'held', ?, ?)`
    ).bind(uid, name, c.teacher_id != null ? String(c.teacher_id) : null, tname, today, streak, now, now).run();
    const id = ins?.meta?.last_row_id;
    const notify: any = {};
    notify.student = await notifyStudent(env, uid, name);
    notify.staff = await notifyStaff(env, { student_name: name, teacher_id: c.teacher_id, teacher_name: tname, streak });
    try {
      await env.DB.prepare(`UPDATE class_absence_hold SET notify_json = ?, updated_at = ? WHERE id = ?`)
        .bind(JSON.stringify(notify).slice(0, 4000), Date.now(), id).run();
    } catch { /* 기록 실패는 보류를 막지 않는다 */ }
    return { status: 'held', id, streak, notify };
  } catch (e: any) {
    console.warn('[absence-hold] 판정 실패(보류 안 함):', e?.message || e);
    return { status: 'error', error: String(e?.message || e).slice(0, 120) };
  }
}

/**
 * 보류 중인 학생이 스스로 다시 들어오면 자동으로 풀어 준다(오늘 출석이 있으면 오늘부터 재개).
 * ⛔ 던지지 않는다.
 */
export async function autoResumeReturning(env: any, now: number): Promise<number> {
  let n = 0;
  try {
    // «그만둠(ended)» 도 본다 — 매니저가 그만둠을 눌렀는데 학생이 돌아오면 그 뒤 수업이 영영 0원이 된다.
    const rs = await env.DB.prepare(`SELECT id, student_uid, held_after FROM class_absence_hold WHERE state IN ('held','ended')`).all();
    for (const h of (rs?.results || []) as any[]) {
      // ① 계정 칸 또는 기기 칸에 그 학생이 찍힌 접속
      const q: any = await env.DB.prepare(
        `SELECT MIN(date) d FROM attendance WHERE (account_uid = ? OR user_id = ?) AND date > ? AND status <> 'scheduled' AND room_id NOT LIKE 'c24-%'`
      ).bind(h.student_uid, h.student_uid, h.held_after).first().catch(() => null);
      // ② 그 학생 예약방(class-{id}-{날짜})의 학생 접속 — 계정 칸이 빈 접속(기기 번호만)도 잡는다
      const q2: any = await env.DB.prepare(
        `SELECT MIN(a.joined_at) t FROM attendance a
          WHERE a.room_id LIKE 'class-%' AND a.role = 'student' AND a.joined_at > ?
            AND EXISTS (SELECT 1 FROM class_schedules cs WHERE cs.user_id = ? AND instr(a.room_id, 'class-' || cs.id || '-') = 1)`
      ).bind(Date.parse(addDays(h.held_after, 1) + 'T00:00:00+09:00'), h.student_uid).first().catch(() => null);
      const d1 = q && q.d ? String(q.d).slice(0, 10) : '';
      const d2 = q2 && q2.t ? kstYmd(Number(q2.t)) : '';
      const d = [d1, d2].filter(Boolean).sort()[0] || '';
      if (!d) continue;
      await env.DB.prepare(
        `UPDATE class_absence_hold SET state = 'resumed', resumed_on = ?, decided_by = 'auto:returned', decided_at = ?, updated_at = ? WHERE id = ? AND state IN ('held','ended')`
      ).bind(d, now, now, h.id).run();
      n++;
    }
  } catch (e: any) { console.warn('[absence-hold] 자동 재개 확인 실패:', e?.message || e); }
  return n;
}

/** 목록 — state=open(보류·미결) · all */
export async function listHolds(env: any, state: string = 'open'): Promise<any[]> {
  await ensureAbsenceHoldTable(env);
  const where = state === 'all' ? '' : `WHERE state = 'held'`;
  const rs = await env.DB.prepare(
    `SELECT id, student_uid, student_name, teacher_id, teacher_name, held_after, resumed_on, streak, state, notify_json, decided_by, decided_at, note, created_at
       FROM class_absence_hold ${where} ORDER BY created_at DESC LIMIT 200`
  ).all();
  return (rs?.results || []).map((r: any) => {
    let notify: any = null;
    try { notify = r.notify_json ? JSON.parse(r.notify_json) : null; } catch { notify = null; }
    const { notify_json, ...rest } = r;
    // ⛔ 전화번호는 싣지 않는다 — 몇 명에게 갔는지·왜 못 갔는지만.
    return { ...rest, notify };
  });
}

/** 매니저 결정 — resume(계속 다님: 오늘부터 정상) · end(그만둠: 보류 유지, 강사비 0% 계속). */
export async function decideHold(env: any, id: number, action: string, by: string, note?: string): Promise<{ ok: boolean; error?: string }> {
  await ensureAbsenceHoldTable(env);
  const now = Date.now();
  if (action === 'resume') {
    const r: any = await env.DB.prepare(
      `UPDATE class_absence_hold SET state = 'resumed', resumed_on = ?, decided_by = ?, decided_at = ?, note = ?, updated_at = ? WHERE id = ? AND state IN ('held','ended')`
    ).bind(kstYmd(now), by, now, note || null, now, id).run();
    return (r?.meta?.changes || 0) > 0 ? { ok: true } : { ok: false, error: 'not_found_or_decided' };
  }
  if (action === 'end') {
    const r: any = await env.DB.prepare(
      `UPDATE class_absence_hold SET state = 'ended', decided_by = ?, decided_at = ?, note = ?, updated_at = ? WHERE id = ? AND state = 'held'`
    ).bind(by, now, note || null, now, id).run();
    return (r?.meta?.changes || 0) > 0 ? { ok: true } : { ok: false, error: 'not_found_or_decided' };
  }
  return { ok: false, error: 'unknown_action' };
}

/**
 * 🌐 /api/admin/reports/absence-holds       GET  ?state=open|all → 목록
 *    /api/admin/reports/absence-holds/decide POST {id, action:'resume'|'end', note?}
 * ⚠️ `/api/admin/reports/` 에 얹은 이유: 인증·라우팅·강사차단 게이트에 이미 등록돼 있어
 *    src/index.ts(공동 금지구역)를 안 건드린다(CLAUDE.md 2장).
 * 🔐 강사는 그 접두사에서 이미 막힌다(강사는 /teacher 화면에서 «보류» 만 보고, 결정은 매니저가 한다).
 *    지사·대리점은 남의 학생이 보이므로 여기서 한 번 더 막는다 — 역할을 못 읽으면 막는 쪽으로.
 */
export async function absenceHoldRouter(env: any, request: Request, url: URL, p: string, deps: {
  getAdminActor: (req: Request, env: any) => Promise<any>; isOrgScopedRole: (r: any) => boolean;
}): Promise<Response | null> {
  if (p !== 'absence-holds' && p !== 'absence-holds/decide') return null;
  const J = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' } });
  let actor: any;
  try { actor = await deps.getAdminActor(request, env); } catch { return J({ ok: false, error: 'actor_unavailable' }, 403); }
  if (!actor || !actor.ok) return J({ ok: false, error: 'unauthorized' }, 401);
  if (actor.isTeacher || deps.isOrgScopedRole(actor.role)) return J({ ok: false, error: 'forbidden_scope' }, 403);
  /* 🔐 getAdminActor() 는 스코프 조회 실패를 삼켜 조직 계정을 'staff'(본사 동급)로 돌려줄 수 있다(CLAUDE.md 2장).
     이 결정은 강사비(급여)를 바꾸므로 admin_scope 를 한 번 더 «삼키지 않고» 읽고, 못 읽으면 막는다
     (본보기 enrollAdminHqOnly — 같은 판정을 여기 두는 이유는 도메인 모듈끼리 import 하지 않으려고). */
  let scopeType: string | null = null;
  try {
    const r: any = await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`).bind(actor.username).first();
    scopeType = r ? (String(r.scope_type ?? '').trim() || null) : null;
  } catch { scopeType = null; }
  if (scopeType === null) return J({ ok: false, error: 'scope_unknown' }, 403);
  if (scopeType === 'teacher' || deps.isOrgScopedRole(scopeType)) return J({ ok: false, error: 'forbidden_scope' }, 403);
  if (p === 'absence-holds') {
    if (request.method !== 'GET') return J({ ok: false, error: 'method_not_allowed' }, 405);
    try { return J({ ok: true, items: await listHolds(env, url.searchParams.get('state') === 'all' ? 'all' : 'open') }); }
    catch (e: any) { return J({ ok: false, error: 'list_failed', message: String(e?.message || e).slice(0, 120) }, 500); }
  }
  if (request.method !== 'POST') return J({ ok: false, error: 'method_not_allowed' }, 405);
  const b: any = await request.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return J({ ok: false, error: 'bad_id' }, 400);
  const r = await decideHold(env, id, String(b.action || ''), String(actor.username || actor.uid || 'admin'), b.note ? String(b.note).slice(0, 300) : undefined);
  return J(r, r.ok ? 200 : (r.error === 'unknown_action' ? 400 : 409));
}
