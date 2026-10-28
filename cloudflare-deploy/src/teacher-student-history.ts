import { buildStudentLedger } from './session-ledger-load';
import { attachCalendarRecords } from './calendar-records';
import { dowList } from './absence-hold';
import { recurStartedOn, normSkipDates } from './class-start-date';
import { loadTeacherNameOf } from './student-schedule-summary';
import { splitPastDay, splitOriginsFromNotes } from './schedule-split';
import { evaluationColumns, evaluationKstDate } from './evaluation-records';
import { dropCafe24SlotDuplicates } from './cafe24-slot-duplicates';
import { selectInChunks } from './d1-chunk';
import { twinCandidate } from './student-alias';
import { confirmedTwinName } from './teacher-cafe24-duplicates';

const KST = 9 * 3600000;
const day = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10);
const nextDay = (date: string) => new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

/** A cancelled series still owns its earlier occurrences. Never project it into the future. */
export function historyScheduleProjection(rows: any[], observedRooms: string[] = []): any[] {
  const origins = splitOriginsFromNotes(rows), out: any[] = [];
  for (const row of rows) {
    if (row.status === 'proposed') continue;
    if (row.status !== 'cancelled') { out.push(row); continue; }
    const split = splitPastDay(row, origins);
    const cancelled = evaluationKstDate(row.updated_at);
    if (row.scheduled_date) {
      out.push({ ...row, status: 'active', history_cancelled_on: cancelled || String(row.scheduled_date).slice(0,10) });
    } else if (split || cancelled) {
      out.push({ ...row, status: 'active', history_until: split || nextDay(cancelled!), history_cancelled_on: split ? null : cancelled });
    } else {
      // The cancellation date is unknown. Only actual attendance can establish these old occurrences.
      for (const room of observedRooms) {
        const match = /^class-(\d+)-(\d{4})(\d{2})(\d{2})$/.exec(room);
        if (match && Number(match[1]) === Number(row.id)) out.push({ ...row, status:'active', scheduled_date:`${match[2]}-${match[3]}-${match[4]}` });
      }
    }
  }
  return out;
}

/** Read existing columns only; use the canonical lesson_date → eval_at → created_at date precedence. */
export async function historyFeedback(db: D1Database, uid: string): Promise<any[]> {
  const columns = await evaluationColumns(db, 'student_evaluations');
  const identities = ['student_uid', 'user_id'].filter(c => columns.has(c));
  if (!identities.length) throw new Error('history_feedback_identity_unavailable');
  const identity = identities.length === 2 ? "COALESCE(NULLIF(student_uid,''),user_id)" : identities[0];
  const conflict = identities.length === 2 ? " AND (NULLIF(student_uid,'') IS NULL OR NULLIF(user_id,'') IS NULL OR student_uid=user_id COLLATE BINARY)" : '';
  const names = ['id','room_id','lesson_date','eval_at','teacher_name','teacher_uid','created_at','note_en','note_ko','teacher_comment','strengths','evaluator','comment'];
  const rs = await db.prepare(`SELECT ${names.map(c => columns.has(c) ? c : 'NULL AS ' + c).join(',')}
    FROM student_evaluations WHERE ${identity} = ? COLLATE BINARY${conflict} LIMIT 10001`).bind(uid).all<any>();
  if ((rs as any).success === false || !Array.isArray(rs.results)) throw new Error('history_feedback_unavailable');
  if (rs.results.length > 10000) throw new Error('history_too_many_records');
  return rs.results.map(r => ({ id:r.id,room_id:r.room_id,
    lesson_date:evaluationKstDate(r.lesson_date) || evaluationKstDate(r.eval_at) || evaluationKstDate(r.created_at),
    teacher_name:r.teacher_name || r.evaluator || null,created_at:r.created_at,
    note_en:String(r.note_en || r.teacher_comment || r.strengths || r.comment || '').slice(0,1500),
    note_ko:String(r.note_ko || '').slice(0,1500) })).filter(r => r.lesson_date).sort(newestReportFirst);
}
const newestReportFirst = (a: any, b: any) =>
  b.lesson_date.localeCompare(a.lesson_date) || (Number(b.created_at) || 0) - (Number(a.created_at) || 0);
export function validHistoryDate(value: string): boolean {
  const ms = Date.parse(value + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(ms)
    && new Date(ms).toISOString().slice(0, 10) === value;
}

/** Closest earlier occurrence, including a class whose feedback was never written. */
export function previousScheduled(rows: any[], before: string): any | null {
  const candidates: any[] = [];
  for (const row of historyScheduleProjection(rows)) {
    const dated = String(row.scheduled_date || '').slice(0, 10);
    let date = '';
    if (dated) { if (dated < before && validHistoryDate(dated)) date = dated; }
    else {
      const dows = dowList(row.day_of_week), skipped = normSkipDates(row.skip_dates);
      const base = Date.parse((row.history_until && row.history_until < before ? row.history_until : before) + 'T00:00:00Z');
      for (let i = 1; i <= (skipped.length + 1) * 7; i++) {
        const d = new Date(base - i * 86400000), ymd = d.toISOString().slice(0, 10);
        if (skipped.includes(ymd)) continue;
        if (!recurStartedOn(row, ymd, { createdFallback: true })) break;
        if (dows.includes(d.getUTCDay()) && !skipped.includes(ymd)) { date = ymd; break; }
      }
    }
    if (date) candidates.push({ date, start: String(row.start_time || ''), schedule_id: Number(row.id),
      teacher_id: row.teacher_id, room_id: `class-${row.id}-${date.replace(/-/g, '')}` });
  }
  candidates.sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  return candidates[0] || null;
}

const LMS_ROW = `room_id LIKE 'c24-%' AND status = 'present'`;
const hhmm = (ms: number) => new Date(ms + KST).toISOString().slice(11, 16);
/** 'H:MM' · 'HH:MM' · 'HH:MM:SS' → 'HH:MM' (string order = time order), anything else → ''. */
export const hhmmKey = (s: unknown) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s ?? ''));
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? m[1].padStart(2, '0') + ':' + m[2] : '';
};

/** Old-LMS (cafe24) lessons have no reservation row: the mirrored attendance row is the record.
 *  Teacher names come from the cafe24 payroll table (cafe24 numbers ≠ D1 teachers.id — never mix them).
 *  A name is used only when that number maps to exactly one name. Read only. */
export async function historyLmsLessons(db: D1Database, uid: string, from: string, end: string, before: string) {
  const month = await db.prepare(`SELECT room_id, date, joined_at, left_at, teacher_uid FROM attendance
    WHERE user_id = ? COLLATE BINARY AND ${LMS_ROW} AND date >= ? AND date < ? ORDER BY joined_at LIMIT 1000`)
    .bind(uid, from, end).all<any>();
  const last = await db.prepare(`SELECT room_id, date, joined_at, teacher_uid FROM attendance
    WHERE user_id = ? COLLATE BINARY AND ${LMS_ROW} AND date < ? ORDER BY date DESC, joined_at DESC LIMIT 1`)
    .bind(uid, before).first<any>();
  const seen = new Set<string>(), rows: any[] = [];
  for (const r of month.results || []) {
    const room = String(r.room_id || '');
    if (!seen.has(room) && evaluationKstDate(r.date)) { seen.add(room); rows.push(r); }
  }
  const numbers = [...new Set([...rows, ...(last ? [last] : [])].map(r => String(r.teacher_uid || '').trim()).filter(Boolean))];
  const names = new Map<string, Set<string>>();
  let namesUnread = false;   // «못 읽었다» 를 «기록 없음» 으로 위장하지 않는다 — 경고로 알린다
  try {
    for (const p of await selectInChunks<any>(db, numbers, ph =>
      `SELECT DISTINCT teacher_id, teacher_name FROM teacher_payroll_auto WHERE teacher_id IN (${ph})`)) {
      const key = String(p.teacher_id);
      if (!names.has(key)) names.set(key, new Set());
      if (p.teacher_name) names.get(key)!.add(String(p.teacher_name));
    }
  } catch { namesUnread = true; console.warn('[teacher-history] lms teacher names unavailable'); }
  const nameOf = (n: any) => { const s = names.get(String(n || '').trim()); return s && s.size === 1 ? [...s][0] : null; };
  const lesson = (r: any) => {
    const start = Number(r.joined_at) || 0, endMs = Number(r.left_at) || 0;
    return { date: evaluationKstDate(r.date)!, start: start > 0 ? hhmm(start) : null,
      duration_min: start > 0 && endMs > start ? Math.max(1, Math.round((endMs - start) / 60000)) : null,
      schedule_id: null, room_id: String(r.room_id), teacher_name: nameOf(r.teacher_uid),
      teacher_source: 'lms', teacher_changed: false, state: 'done', label_en: 'Attended (old LMS)', label_ko: '출석 (옛 LMS)' };
  };
  // joined_at stays beside the lesson: slot de-duplication compares exact timestamps, never rounded times.
  return { items: rows.map(r => ({ joined_at: Number(r.joined_at) || 0, lesson: lesson(r) })),
    previous: last && evaluationKstDate(last.date) ? lesson(last) : null, namesUnread };
}

/* 👥 쌍둥이 계정 이력 (2026-10-28 사장님 「쌍둥이 수업 요약·캘린더 이력도 고쳐줘」)
   [왜] 카페24에 같은 학생이 `X` 와 `mangoai_X` 두 계정으로 있고(운영 D1 실측 9명), 예약표는 `X`, 옛 LMS 출석은
        `mangoai_X` 로 갈려 있다. 이력은 계정 하나로만 읽어서, 예약 줄로 열면 옛 LMS 수업·일지가, LMS 줄로 열면
        예약·일지가 빠진 «반쪽 이력» 이었다(강사 목록의 중복 줄은 #1869 에서 한 줄로 정리됨).
   [규칙] 두 계정을 합쳐 읽는 것은 «같은 학생» 이 확인될 때만 — 강사 목록(teacher-cafe24-duplicates)과 같은 근거:
     ① 아이디가 정확히 `X` ↔ `mangoai_X` (twinCandidate — 양방향, 대소문자 그대로)
     ② 두 계정 각각에서 «확인된 이름»(예약표 student_name · 옛 LMS 출석 username · 명부 korean_name/username 에서
        MANGOAI 표식·공백을 지우고, 아이디 그대로인 이름은 «모름» 으로 버림)이 **정확히 하나**이고 서로 같다.
     ⛔ 한쪽이라도 이름이 없거나(전부 아이디 모양) 둘 이상이면 잇지 않는다 — 남의 기록이 섞이는 것이 반쪽보다 나쁘다.
     ⛔ 명부(students_erp) 이름만 보지 않는다 — 실측 9명 중 7명은 `X` 쪽 명부 이름이 아이디 그대로라 «모름» 이 된다.
     ⛔ 자리표시 계정(`lms`·`type_seed`)은 쌍둥이가 아니다 — `mangoai_lms` 의 짝이 `lms`(옛 LMS 점유 자리표시)가 된다.
   [실패] 이름을 못 읽으면 잇지 않고(= 예전 동작) 경고(twin_account)로 알린다 — «못 읽음» 을 «쌍둥이 없음» 으로 위장하지 않는다.
   읽기 전용. 감시: test-harness/teacher_student_history_harness.mjs (쌍둥이 절) */
export async function historyTwinOf(db: D1Database, uid: string): Promise<{ twin: string | null; unread: boolean }> {
  const twin = twinCandidate(uid);
  const lo = String(twin || '').toLowerCase();
  if (!twin || lo === 'lms' || lo === 'type_seed') return { twin: null, unread: false };
  let rows: any[];
  try {
    const rs = await db.prepare(`SELECT user_id, student_name AS n FROM class_schedules WHERE user_id = ? COLLATE BINARY OR user_id = ? COLLATE BINARY
      UNION SELECT user_id, username FROM attendance WHERE (user_id = ? COLLATE BINARY OR user_id = ? COLLATE BINARY) AND ${LMS_ROW}
      UNION SELECT user_id, COALESCE(korean_name, username) FROM students_erp WHERE user_id = ? COLLATE BINARY OR user_id = ? COLLATE BINARY
      LIMIT 1001`).bind(uid, twin, uid, twin, uid, twin).all<any>();
    if ((rs as any).success === false || !Array.isArray(rs.results) || rs.results.length > 1000) throw new Error('history_twin_names');
    rows = rs.results;
  } catch { console.warn('[teacher-history] twin names unavailable'); return { twin: null, unread: true }; }
  const names = (account: string) => new Set(rows.filter(r => String(r.user_id ?? '') === account)
    .map(r => confirmedTwinName(r.n, account)).filter(Boolean));
  const mine = names(uid), theirs = names(twin);
  return { twin: mine.size === 1 && theirs.size === 1 && [...mine][0] === [...theirs][0] ? twin : null, unread: false };
}

/** Read only. Student identity must come from an authorized schedule, never the query string. */
export async function loadTeacherStudentHistory(env: any, uid: string, month: string, before: string) {
  // A confirmed twin account is the same student (historyTwinOf). Without one, `other` = uid binds the same account twice.
  const twinInfo = await historyTwinOf(env.DB, uid);
  const twin = twinInfo.twin, other = twin || uid;
  const rows = await env.DB.prepare(`SELECT * FROM class_schedules WHERE user_id = ? OR user_id = ?`).bind(uid, other).all();
  const from = month + '-01';
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  let observedRooms: string[] = [], observationWarning = false;
  if ((rows.results || []).some((r: any) => r.status === 'cancelled' && !r.scheduled_date && !evaluationKstDate(r.updated_at))) {
    try {
      const attendance = await env.DB.prepare(`SELECT DISTINCT a.room_id FROM attendance a JOIN class_schedules cs
        ON a.room_id GLOB ('class-' || cs.id || '-[0-9]*') WHERE (cs.user_id=? OR cs.user_id=?) AND a.role='student' LIMIT 10001`)
        .bind(uid, other).all();
      if ((attendance.results || []).length > 10000) throw new Error('history_attendance_limit');
      observedRooms = (attendance.results || []).map((r: any) => String(r.room_id));
    } catch { observationWarning = true; }
  }
  const projected = historyScheduleProjection(rows.results || [], observedRooms);
  let previous: any = previousScheduled(projected, before);
  // Each account's reservations are judged by that account's own ledger (attendance, leaves, holds) — the same answer
  // as opening the history from that account's own row.
  const twinRows = twin ? projected.filter((r: any) => String(r.user_id ?? '') === twin) : [];
  const ownRows = twin ? projected.filter((r: any) => String(r.user_id ?? '') !== twin) : projected;
  const noLms = { items: [], previous: null, namesUnread: false };
  const [ledger, twinLedger, ownReports, twinReports, lms, twinLms]: any[] = await Promise.all([
    buildStudentLedger(env, uid, month, Date.now(), true, ownRows),
    twin && twinRows.length ? buildStudentLedger(env, twin, month, Date.now(), true, twinRows).catch(() => ({ ok: false })) : null,
    historyFeedback(env.DB, uid),
    twin ? historyFeedback(env.DB, twin).catch(() => null) : [],
    historyLmsLessons(env.DB, uid, from, end, before).catch(() => null),
    twin ? historyLmsLessons(env.DB, twin, from, end, before).catch(() => null) : noLms,
  ]);
  if (!ledger.ok) throw new Error('history_schedule_unavailable');
  // The twin half failing is a warning (the student's own half still shows), never a silently shorter history.
  if (twinInfo.unread || (twinLedger && !twinLedger.ok) || !twinReports) ledger.warnings.push('twin_account');
  for (const w of (twinLedger && twinLedger.ok && twinLedger.warnings) || []) if (!ledger.warnings.includes(w)) ledger.warnings.push(w);
  if (observationWarning) ledger.warnings.push('historical_attendance');
  // An unread old-LMS record is a warning, never an empty month.
  if (!lms || !twinLms) ledger.warnings.push('lms_attendance');
  if ((lms && lms.namesUnread) || (twinLms && twinLms.namesUnread)) ledger.warnings.push('lms_teacher_names');
  const allReports: any[] = twinReports && twinReports.length ? [...ownReports, ...twinReports].sort(newestReportFirst) : ownReports;
  const lmsLater = (a: any, b: any) => !a ? b || null : !b ? a : (b.date + hhmmKey(b.start) > a.date + hhmmKey(a.start) ? b : a);
  const lmsPrevious = lmsLater(lms && lms.previous, twinLms && twinLms.previous);
  // The later lesson is the previous one; on an exact tie the Mangoi reservation stays (it carries the schedule id).
  if (lmsPrevious && (!previous || lmsPrevious.date + hhmmKey(lmsPrevious.start) > previous.date + hhmmKey(previous.start))) previous = lmsPrevious;
  const reportDate = (r: any) => r.lesson_date;
  const reports = allReports.filter((r: any) => r.lesson_date >= from && r.lesson_date < end);
  const prior = allReports.find((r: any) => r.lesson_date < before);
  const previousFeedback = previous && allReports.find((r: any) => r.room_id === previous.room_id && r.lesson_date < before);
  const schedules = new Map<number, any>(projected.map((r: any) => [Number(r.id), r]));
  // student_uid = the account that owns the record (attachCalendarRecords finds that account's own reports).
  const owned = (part: any, owner: string | null) =>
    (owner && part && part.ok ? part.items : []).map((it: any) => ({ ...it, student_uid: owner }));
  const items: any[] = [...owned(ledger, uid), ...owned(twinLedger, twin)].filter((it: any) => {
    const row = schedules.get(it.schedule_id);
    return row && (row.scheduled_date || recurStartedOn(row, it.date, { createdFallback: true }));
  });
  await attachCalendarRecords(env, items);
  // Old-LMS lessons, minus the ones a Mangoi reservation already shows at the exact same slot (same rule as the class list).
  // Only a reservation that itself says «done» may hide one: the ledger never counts c24 attendance, so a same-slot
  // reservation without it reads «unknown»/«absent» — hiding the attended LMS row there would replace evidence with
  // «no record». In that case both rows stay (each source says what it knows).
  const slots = items.filter((it: any) => it.state === 'done' && hhmmKey(it.start)).map((it: any) => ({ source: 'mangoi',
    student_uid: uid, start_ts: Date.parse(`${it.date}T${hhmmKey(it.start)}:00+09:00`), status: it.state }));
  // Both accounts are one student here, so the slot key is that student (uid) for every row; the owner stays on the item.
  const lmsRows: { user_id: string; joined_at: number; lesson: any; owner: string }[] = [];
  for (const [part, owner] of [[lms, uid], [twinLms, twin]] as [any, string | null][]) {
    if (owner) for (const x of part?.items || []) lmsRows.push({ user_id: uid, joined_at: x.joined_at, lesson: x.lesson, owner });
  }
  const lmsRooms = new Set<string>();
  for (const x of dropCafe24SlotDuplicates(lmsRows, slots).kept) {
    if (lmsRooms.has(x.lesson.room_id)) continue;   // one c24 room is one lesson, whichever account it was recorded under
    lmsRooms.add(x.lesson.room_id); items.push({ ...x.lesson, student_uid: x.owner });
  }
  const used = new Set<number>();
  for (const it of items) {
    // A c24 room is one lesson, so its report matches by room even if the report was dated on another day.
    const report = (it.teacher_source === 'lms' ? allReports.find((r: any) => r.room_id === it.room_id) : null)
      || reports.find((r: any) => reportDate(r) === it.date && r.room_id === it.room_id)
      || (items.filter(x => x.date === it.date).length === 1
        ? reports.find((r: any) => reportDate(r) === it.date && !r.room_id) : null);
    if (report) {
      used.add(Number(report.id));
      it.feedback = report; it.teacher_name = report.teacher_name || it.teacher_name;
      it.teacher_source = 'feedback';
    } else if (it.teacher_source !== 'lms') it.teacher_source = 'schedule';
  }
  for (const report of reports) {
    if (used.has(Number(report.id))) continue;
    // Duplicate revisions of the same room are one occurrence; show its newest report.
    if (report.room_id && items.some(i => i.room_id === report.room_id && i.date === reportDate(report))) continue;
    const rm = /^class-(\d+)-\d{8}$/.exec(String(report.room_id || ''));
    items.push({ date: reportDate(report), start: null, schedule_id: rm ? Number(rm[1]) : null,
      room_id: report.room_id, teacher_name: report.teacher_name || null, teacher_source: 'feedback',
      state: 'unknown', label_en: 'Attendance not recorded', label_ko: '출결 기록 미확인', feedback: report });
  }
  let summary: any = previous;
  const sameDayCount = previous ? projected.filter((r: any) => previousScheduled([r], before)?.date === previous.date).length : 0;
  const matchedFeedback = previousFeedback || (prior && summary && reportDate(prior) === summary.date && !prior.room_id && sameDayCount === 1 ? prior : null);
  const summaryFeedback = prior && (!summary || reportDate(prior) > summary.date) ? prior : matchedFeedback;
  if (summaryFeedback) {
    summary = { ...(summary && summary.date === reportDate(summaryFeedback) ? summary : {}), date: reportDate(summaryFeedback),
      teacher_name: summaryFeedback.teacher_name || (summary?.date === reportDate(summaryFeedback) ? summary.teacher_name : null) || null,
      teacher_source: 'feedback', feedback: summaryFeedback };
  }
  const nameOf = await loadTeacherNameOf(env);
  if (summary && !summary.teacher_name) summary.teacher_name = nameOf(summary.teacher_id) || null;
  // Undo permanent teacher changes when showing dates before their effective day.
  // Old text-only audits cannot prove a teacher identity: leave that value explicitly unknown.
  const audits = await env.DB.prepare(`SELECT a.schedule_id,a.action,a.lesson_date,a.detail,a.created_at
    FROM class_audit_log a JOIN class_schedules cs ON cs.id=a.schedule_id
    WHERE (cs.user_id=? OR cs.user_id=?) AND a.action IN ('teacher_change','reschedule') ORDER BY a.created_at DESC`)
    .bind(uid, other).all();
  for (const it of [...items, ...(summary ? [summary] : [])]) {
    if (it.teacher_source === 'feedback') continue;
    for (const audit of audits.results || []) {
      if (Number(audit.schedule_id) !== it.schedule_id) continue;
      let detail: any = {}; try { detail = JSON.parse(audit.detail || '{}'); } catch { /* legacy text */ }
      if (detail.via_overlay) continue;
      const effective = detail.date || detail.scheduled_date || audit.lesson_date || day(Number(audit.created_at));
      if (audit.action !== 'teacher_change' && !detail.teacher_changed && !/담당 강사 →/.test(audit.detail || '')) continue;
      if (it.date < effective) { it.teacher_name = nameOf(detail.from_teacher_id) || null; }
      else if (it.date === effective) it.teacher_changed = true;
    }
  }
  // Date-specific substitutes take precedence over the recurring reservation's teacher.
  const subs = await env.DB.prepare(`SELECT s.schedule_id, s.sub_date, s.substitute_teacher_id, t.name AS teacher_name
    FROM class_substitutions s JOIN class_schedules cs ON cs.id=s.schedule_id
    LEFT JOIN teachers t ON CAST(t.id AS TEXT)=CAST(s.substitute_teacher_id AS TEXT)
    WHERE (cs.user_id=? OR cs.user_id=?) AND s.status='active' AND (s.sub_date BETWEEN ? AND ? OR s.sub_date=?)`)
    .bind(uid, other, from, end, summary?.date || '').all();
  for (const it of [...items, ...(summary ? [summary] : [])]) {
    if (it.teacher_source === 'feedback') continue;
    const sub = (subs.results || []).find((s: any) => Number(s.schedule_id) === it.schedule_id && s.sub_date === it.date);
    if (sub) { it.teacher_name = sub.teacher_name || nameOf(sub.substitute_teacher_id) || null; it.teacher_changed = true; }
  }
  items.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  return { ok: true, month, before, items, previous: summary, warnings: ledger.warnings || [] };
}
