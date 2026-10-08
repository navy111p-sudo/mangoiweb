/**
 * 📒 회차 원장 — D1 에서 읽어 정본(session-ledger.ts)에 넘기는 쪽.
 *
 * ⚠️ 읽기만 한다. 표를 새로 만드는 것은 student_leaves(휴원 기록) 하나뿐이다.
 * ⚠️ 각 조회는 실패해도 던지지 않는다 — 그 칸만 «모름» 이 되고 원장은 뜬다.
 *    단, 출석을 «못 읽은» 것과 «없는» 것은 다르다: 못 읽었으면 attended=null 로 넘겨
 *    그 회차는 «미정» 이 된다(결석으로 단정해 차감하지 않는다).
 */
import {
  classifyOccurrence, summarize, isOnLeave, LEDGER_STATES,
  type LedgerState, type LeaveRow,
} from './session-ledger';
import { dowList, loadHoldRanges, heldOnFor } from './absence-hold';
import { recurStartedOn } from './class-start-date';
import { teacherPresenceByRoom } from './no-show-truth';
import { loadTeacherNameOf } from './student-schedule-summary';

const pad = (n: number) => String(n).padStart(2, '0');
const KST = 9 * 3600 * 1000;
function kstYmd(ms: number): string {
  const k = new Date(ms + KST);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

export async function ensureStudentLeaveTable(env: any): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_leaves (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'active', created_by TEXT, created_at INTEGER NOT NULL, cancelled_by TEXT, cancelled_at INTEGER)`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_student_leaves_uid ON student_leaves(student_uid)`); } catch { /* 있음 */ }
}

export async function loadLeaves(env: any, uid: string): Promise<LeaveRow[] | null> {
  try {
    await ensureStudentLeaveTable(env);
    const rs = await env.DB.prepare(
      `SELECT id, student_uid, start_date, end_date, reason, status, created_by, created_at, cancelled_by, cancelled_at
         FROM student_leaves WHERE student_uid = ? ORDER BY start_date DESC`
    ).bind(uid).all();
    return (rs?.results || []) as any[];
  } catch (e: any) {
    console.warn('[session-ledger] 휴원 조회 실패:', e?.message || e);
    return null;
  }
}

/** ym = 'YYYY-MM'. 그 달 그 학생의 회차 원장. */
export async function buildStudentLedger(env: any, uid: string, ym: string, now: number = Date.now()) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${ym}-01`, to = `${ym}-${pad(days)}`;
  const warnings: string[] = [];

  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT * FROM class_schedules WHERE user_id = ? AND COALESCE(status,'active') != 'cancelled'`
    ).bind(uid).all();
    rows = (rs?.results || []).filter((r: any) => {
      const u = String(r.user_id || '').toLowerCase();
      return u && u !== 'lms' && u !== 'type_seed';
    });
  } catch (e: any) {
    return { ok: false, error: 'schedule_read_failed', detail: String(e?.message || e) };
  }

  // 그 달의 회차 전개 (날짜가 요일을 이긴다)
  const occ: any[] = [];
  for (const r of rows) {
    const start = String(r.start_time || '00:00').slice(0, 5);
    const dur = Number(r.duration_min ?? r.duration_minutes ?? 20) || 20;
    const dated = String(r.scheduled_date || '').replace(/\//g, '-').slice(0, 10);
    const dates: string[] = [];
    if (dated) { if (dated >= from && dated <= to) dates.push(dated); }
    else {
      const dows = dowList(r.day_of_week);
      for (let d = 1; d <= days; d++) {
        const ymd = `${ym}-${pad(d)}`;
        if (dows.indexOf(new Date(ymd + 'T00:00:00Z').getUTCDay()) >= 0 && recurStartedOn(r, ymd)) dates.push(ymd);
      }
    }
    for (const d of dates) {
      const startMs = Date.parse(`${d}T${start.length === 5 ? start : '00:00'}:00+09:00`);
      occ.push({ schedule_id: Number(r.id), date: d, start, dur, teacher_id: r.teacher_id ?? null,
        status: String(r.status || 'active').toLowerCase(), room: `class-${r.id}-${d.replace(/-/g, '')}`,
        dated: !!dated, source: String(r.source || ''), start_ms: startMs,
        upcoming: !(startMs <= now) });
    }
  }
  occ.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const mStart = Date.parse(`${from}T00:00:00+09:00`);
  const mEnd = Date.parse(`${to}T23:59:59+09:00`);
  const ids = [...new Set(occ.map(o => o.schedule_id))];
  const idList = ',' + ids.join(',') + ',';

  // 출석 — 예약방 학생 접속 + 그날 그 학생 계정 접속(카페24 씨앗 제외)
  let attended: Set<string> | null = new Set<string>();
  let attOk = 0;
  try {
    const q = await env.DB.prepare(
      `SELECT DISTINCT room_id FROM attendance WHERE room_id LIKE 'class-%' AND role = 'student' AND joined_at >= ? AND joined_at <= ? AND instr(?, ',' || room_id || ',') > 0`
    ).bind(mStart, mEnd + 3 * 3600 * 1000, ',' + occ.map(o => o.room).join(',') + ',').all();
    for (const r of (q?.results || [])) attended!.add('room:' + String((r as any).room_id));
    attOk++;
  } catch (e: any) { warnings.push('attendance_room'); }
  try {
    const q = await env.DB.prepare(
      `SELECT DISTINCT date FROM attendance WHERE (account_uid = ? OR user_id = ?) AND date >= ? AND date <= ?
          AND COALESCE(status,'') <> 'scheduled' AND room_id NOT LIKE 'c24-%'`
    ).bind(uid, uid, from, to).all();
    for (const r of (q?.results || [])) attended!.add('day:' + String((r as any).date || '').slice(0, 10));
    attOk++;
  } catch (e: any) { warnings.push('attendance_day'); }
  if (!attOk) attended = null;

  // 노쇼 (학생·강사) + 강사 오판 대조
  const nsStudent = new Set<string>(); const nsTeacher = new Map<string, any>();
  if (ids.length) {
    try {
      const q = await env.DB.prepare(
        `SELECT room_id, schedule_id, missing_role, teacher_name, student_name, created_at FROM class_no_show
          WHERE created_at >= ? AND created_at <= ? AND instr(?, ',' || CAST(schedule_id AS TEXT) || ',') > 0`
      ).bind(mStart, mEnd + 3 * 3600 * 1000, idList).all();
      const list = (q?.results || []) as any[];
      let presence = new Map<string, any>();
      try { presence = await teacherPresenceByRoom(env.DB, list); } catch { /* 대조 생략 — 강사 결석 그대로 */ }
      for (const n of list) {
        // 날짜는 방 번호(class-{id}-{YYYYMMDD})가 정본 — 알림은 수업 «뒤» 에 찍힐 수 있어 created_at 이 다음 날일 수 있다
        const rm = /^class-(\d+)-(\d{4})(\d{2})(\d{2})$/.exec(String(n.room_id || ''));
        const k = rm ? `${rm[1]}|${rm[2]}-${rm[3]}-${rm[4]}` : `${n.schedule_id}|${kstYmd(Number(n.created_at))}`;
        if (n.missing_role === 'student') nsStudent.add(k);
        else if (n.missing_role === 'teacher') {
          const p = n.room_id ? presence.get(String(n.room_id)) : null;
          if (!(p && p.present === true)) nsTeacher.set(k, n);   // 오판이면 강사 결석으로 안 봄
        }
      }
    } catch (e: any) { warnings.push('no_show'); }
  }

  // 승인된 연기 요청 (schedule_id|orig_date — 마지막 승인)
  const postponeReq: Record<string, any> = {};
  if (ids.length) {
    try {
      const q = await env.DB.prepare(
        `SELECT schedule_id, orig_date, fee_type, minutes_before, request_type, created_at FROM schedule_change_requests
          WHERE status = 'approved' AND request_type != 'change' AND instr(?, ',' || CAST(schedule_id AS TEXT) || ',') > 0`
      ).bind(idList).all();
      for (const r of (q?.results || []) as any[]) {
        const k = `${r.schedule_id}|${String(r.orig_date || '').slice(0, 10)}`;
        const prev = postponeReq[k];
        if (!prev || (Number(r.created_at) || 0) > (Number(prev.created_at) || 0)) postponeReq[k] = r;
      }
    } catch (e: any) { warnings.push('postpone_requests'); }
  }

  const leaves = await loadLeaves(env, uid);
  if (leaves === null) warnings.push('leaves');
  const holds = await loadHoldRanges(env);
  const holidays = new Set<string>();
  try {
    const q = await env.DB.prepare(`SELECT day FROM enroll_holidays WHERE day >= ? AND day <= ?`).bind(from, to).all();
    for (const r of (q?.results || [])) holidays.add(String((r as any).day));
  } catch { /* 표 없음 — 공휴일 없음 */ }

  // 그날 이 학생 회차 수 — «그날 접속했다» 는 회차가 하나뿐일 때만 그 회차의 출석으로 본다
  //   (하루 두 번 수업이면 한 번 들어온 것으로 둘 다 «완료» 가 되면 안 된다 → 방 번호로만 판정)
  const perDay: Record<string, number> = {};
  for (const o of occ) perDay[o.date] = (perDay[o.date] || 0) + 1;

  const items = occ.map(o => {
    const key = `${o.schedule_id}|${o.date}`;
    const att = attended === null ? null
      : (attended.has('room:' + o.room) || (perDay[o.date] === 1 && attended.has('day:' + o.date)));
    // 승인된 연기·취소 요청을 이 회차에 붙이는 조건:
    //   · 반복 행 → 요청이 «기록만» 되고 행은 안 바뀌므로(decide 의 'recorded') 요청이 유일한 근거
    //   · 날짜 행 → 실제로 status='postponed' 로 바뀐 경우만. 새 날짜로 «옮겨진» 행은 옮겨진 날짜의
    //     회차가 따로 세어지므로(급여도 같음) 여기서 연기로 또 세지 않는다.
    /* 🔁 (2026-10-09) 반복 수업 «그 주만» 연기 — 요청은 반복 줄 번호, 연기 기록은 새 줄(source='recurring-week:<id>'). */
    const rwParent = o.source.indexOf('recurring-week:') === 0 ? o.source.slice('recurring-week:'.length) : '';
    const pr0 = postponeReq[key] || (rwParent ? postponeReq[`${rwParent}|${o.date}`] : null) || null;
    const pr = pr0 && (!o.dated || o.status === 'postponed') ? pr0 : null;
    const state: LedgerState = classifyOccurrence({
      schedStatus: o.status,
      upcoming: o.upcoming,
      attended: att,
      studentNoShow: nsStudent.has(key),
      teacherNoShow: nsTeacher.has(key),
      postponeReq: pr,
      onLeave: !!isOnLeave(leaves || [], o.date),
      onHold: !!heldOnFor(holds, uid, o.date),
      holiday: holidays.has(o.date),
    });
    const def = LEDGER_STATES[state];
    return {
      date: o.date, start: o.start, duration_min: o.dur, schedule_id: o.schedule_id, room_id: o.room,
      teacher_id: o.teacher_id, state, label_ko: def.ko, label_en: def.en, deduct: def.deduct, carry: def.carry,
      postpone_minutes_before: pr && pr.minutes_before != null ? Number(pr.minutes_before) : null,
      // 🏫 B2B 수업료(b2b-tuition-load.ts)가 쓰는 칸 — 상태 판정에는 영향 없음(더하기만)
      //   «예정» 이 휴원·공휴일보다 먼저 판정되므로, 다음 달 청구에서 그 날을 빼려면 따로 알아야 한다.
      source: o.source, start_ms: o.start_ms,
      on_leave: !!isOnLeave(leaves || [], o.date), holiday: holidays.has(o.date),
    };
  });

  /* 👩‍🏫 (2026-10-08) 화면이 강사 «번호» 만 받던 것을 이름으로. 정본 loadTeacherNameOf(원부 번호 → 계정 연결)
     — 실패해도 던지지 않고 빈 이름을 준다(원장은 그대로 떠야 한다). ⛔ 카페24 강사번호와 섞지 않는다. */
  let nameOf: (tid: any) => string = () => '';
  try { nameOf = await loadTeacherNameOf(env); } catch { /* 이름 없이 간다 */ }
  for (const it of items as any[]) it.teacher_name = nameOf(it.teacher_id) || null;

  return {
    ok: true, uid, month: ym,
    summary: summarize(items.map(i => i.state)),
    items,
    leaves: leaves || [],
    warnings,
  };
}
