/* ═══════════════════════════════════════════════════════════════════════════
   📋 «오늘 수업» 줄에 붙이는 일곱 칸 — 날짜 · 강사 입장 시각 · 결제 유형 · 일정 ·
      지난 수업 평가 · 오늘 평가 · 학생 출결          (2026-09-23 매니저 요청)

   [왜] 매니저 제안: 「강사가 제시간에 들어왔는지, 학생이 왔는지, 지난·오늘 피드백이
     있는지를 한 줄에서 보고 싶다」. 그 전에는 출석·평가·결제유형이 전부 다른 화면이었다.

   [원칙] 전부 «덤» 이다 — 이 모듈이 실패해도 목록은 그대로 떠야 한다.
     그래서 모든 조회는 try 로 감싸고, 못 구하면 그 칸만 null(화면이 «—»)이다.
     ⛔ 모르는 값을 지어내지 않는다(CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」).

   [근거별 주의]
   · 강사 입장 시각 — 정본 `teacherPresenceByRoom`(no-show-truth.ts)을 그대로 부른다.
     이름 일치만 믿고(role 안 믿음) 모르면 «모름» 이다. ⛔ 판정을 여기 복제하지 말 것.
     ⚠️ 「입장 기록 없음」은 «노쇼» 가 아니다 — 노쇼는 급여가 걸린 판정이라 여기서 말하지 않는다.
   · 학생 출결 — attendance 의 `user_id` 는 «기기 임시번호» 이고 계정은 `account_uid` 다
     (CLAUDE.md 2장 attendance-uid). 둘 다 본다. 계정을 못 붙인 접속이 방에 있으면
     «결석» 이라 단정하지 않고 «확인 불가» 로 둔다.
   · 카페24 줄은 망고아이 방이 없어 강사 입장·출결을 원리상 모른다 → 'cafe24'.
   · 결제 유형 — 정본은 대리점 지정 `centers.payment_type`(학생 → shop_name = centers.name).
     centers.name 은 유일하지 않다 → 같은 이름에 B2B·B2C 가 섞이면 «모름».
     students_erp.payment_type 은 보조(실측 거의 NULL).
   · 평가 — student_evaluations 의 «1분 수업일지» 행(student_uid 가 있는 새 스키마)만 본다.
     점수 칸은 만점이 둘(1~5 / 0~100)이라 값으로 만점을 판정해 함께 싣는다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { teacherPresenceByRoom } from './no-show-truth';
import { selectInChunks } from './d1-chunk';
import { loadSchedSummaryMap } from './student-schedule-summary';
import { ensureAttendanceAccountUid } from './attendance-uid';

const KST = 9 * 3600 * 1000;
/** 학생이 시작 뒤 이만큼 안에 들어오면 «출석», 넘으면 «지각». */
export const STUDENT_LATE_GRACE_MS = 5 * 60 * 1000;
/** 강사는 시작 시각을 1분 넘기면 «지각». */
export const TEACHER_LATE_GRACE_MS = 60 * 1000;

/** KST 날짜(YYYY-MM-DD). */
export function kstYmd(ms: number): string {
  return new Date(ms + KST).toISOString().slice(0, 10);
}

/* ── 순수 판정 (하니스가 그대로 돌린다) ─────────────────────────────────── */

export type TeacherEntry = {
  /** on_time · late · none(입장 기록 없음) · pending(아직 시작 전·기록 없음) · unknown(이름으로 못 가림) · cafe24 */
  state: 'on_time' | 'late' | 'none' | 'pending' | 'unknown' | 'cafe24';
  at: number | null;
  late_min: number | null;
};

export function judgeTeacherEntry(
  source: string, startTs: number, status: string,
  presence: { present: boolean | null; from: number | null } | null | undefined,
): TeacherEntry {
  if (source === 'cafe24') return { state: 'cafe24', at: null, late_min: null };
  if (!presence || presence.present === null) return { state: 'unknown', at: null, late_min: null };
  if (presence.present === false || !presence.from) {
    // 시작 전이면 «아직» — 기록이 없는 것이 정상이다.
    return { state: status === 'early' || status === 'open' ? 'pending' : 'none', at: null, late_min: null };
  }
  const diff = presence.from - startTs;
  if (diff > TEACHER_LATE_GRACE_MS) return { state: 'late', at: presence.from, late_min: Math.floor(diff / 60000) };
  return { state: 'on_time', at: presence.from, late_min: 0 };
}

export type StudentAttendance = {
  /** attended · late · absent · waiting(수업 중·아직 안 옴) · not_yet(시작 전) · unknown(누군지 못 가린 접속) · cafe24 */
  state: 'attended' | 'late' | 'absent' | 'waiting' | 'not_yet' | 'unknown' | 'cafe24';
  at: number | null;
  late_min: number | null;
};

export function judgeStudentAttendance(
  source: string, startTs: number, status: string,
  studentFirstJoin: number | null, unidentifiedJoins: number,
): StudentAttendance {
  if (source === 'cafe24') return { state: 'cafe24', at: null, late_min: null };
  if (studentFirstJoin && studentFirstJoin > 0) {
    const diff = studentFirstJoin - startTs;
    if (diff > STUDENT_LATE_GRACE_MS) return { state: 'late', at: studentFirstJoin, late_min: Math.floor(diff / 60000) };
    return { state: 'attended', at: studentFirstJoin, late_min: 0 };
  }
  // 누군지 못 가린 접속이 있으면 «안 왔다» 고 단정하지 않는다.
  if (unidentifiedJoins > 0) return { state: 'unknown', at: null, late_min: null };
  if (status === 'early' || status === 'open') return { state: 'not_yet', at: null, late_min: null };
  if (status === 'live') return { state: 'waiting', at: null, late_min: null };
  return { state: 'absent', at: null, late_min: null };
}

/** 결제 유형 — 대리점 지정이 정본, 없으면 학생 원부. 모르면 null. */
export function judgePayType(
  shop: any, rowPayType: any, centerTypes: Map<string, string | null>,
): 'B2B' | 'B2C' | null {
  const s = String(shop || '').trim();
  if (s && centerTypes.has(s)) {
    const t = centerTypes.get(s);
    if (t === 'B2B' || t === 'B2C') return t;
    return null;   // 같은 이름에 둘이 섞임 → 모름
  }
  const pt = String(rowPayType || '').trim().toUpperCase();
  if (pt.startsWith('B2B')) return 'B2B';
  if (pt.startsWith('B2C')) return 'B2C';
  return null;
}

export type EvalBrief = {
  id: number; date: string; score: number | null; max: number | null;
  text: string; teacher: string | null;
};

/** 점수 만점 — 값이 5를 넘으면 100점 만점(AI 리포트), 아니면 5점 만점(1분 일지). */
export function evalMaxOf(score: any): number | null {
  const n = Number(score);
  if (score == null || score === '' || !Number.isFinite(n)) return null;
  return n > 5 ? 100 : 5;
}

export function briefEval(r: any): EvalBrief {
  const raw = r?.note_en || r?.teacher_comment || r?.strengths || r?.note_ko || '';
  const text = String(raw).replace(/\s+/g, ' ').trim();
  const n = Number(r?.score_overall);
  const hasScore = r?.score_overall != null && r?.score_overall !== '' && Number.isFinite(n);
  const created = Number(r?.created_at) || 0;
  return {
    id: Number(r?.id) || 0,
    date: created ? kstYmd(created) : String(r?.lesson_date || '').slice(0, 10),
    score: hasScore ? n : null,
    max: hasScore ? evalMaxOf(n) : null,
    text: text.length > 90 ? text.slice(0, 89) + '…' : text,
    teacher: r?.teacher_name || null,
  };
}

/** 한 수업의 «오늘 평가» 와 «지난 평가» 를 고른다.
 *  오늘 = 같은 방 번호, 없으면 그 날짜(KST)에 쓴 것 · 지난 = 이 수업 시작 전에 쓴 것 중 가장 최근. */
export function pickEvals(evals: any[], roomId: string, dateStr: string, dayStartTs: number)
  : { today: any | null; last: any | null } {
  let today: any = null;
  for (const e of evals) if (roomId && String(e?.room_id || '') === roomId) { today = e; break; }
  if (!today) for (const e of evals) {
    const c = Number(e?.created_at) || 0;
    if (c && kstYmd(c) === dateStr && !String(e?.room_id || '').trim()) { today = e; break; }
  }
  let last: any = null;
  for (const e of evals) {   // evals 는 created_at 내림차순
    if (e === today) continue;
    const c = Number(e?.created_at) || 0;
    if (c && c < dayStartTs) { last = e; break; }   // 이 수업 «날짜 전» 에 쓴 것 중 가장 최근
  }
  return { today, last };
}

/** 망고아이 방이 없는 줄인가 — 관리자 목록은 source='cafe24', 강사 포털은 source='lms'(방 번호 c24-…). */
export function isNoRoomRow(s: any): boolean {
  const src = String(s?.source || '');
  return src === 'cafe24' || src === 'lms' || /^c24-/.test(String(s?.room_id || ''));
}

/* ── 로더 (sessions 를 제자리에서 채운다 · 절대 던지지 않는다) ────────────── */

/** opts.evals=false — 평가 내용을 싣지 않는다(지사·대리점. 2026-09-23 사장님 지시).
 *  ⚠️ 기본값은 true(강사 포털·본사). 부르는 쪽이 «숨길 사람» 을 정한다. */
export async function enrichClassesToday(env: any, sessions: any[], dateStr: string, nowMs: number,
  opts: { evals?: boolean } = {}): Promise<void> {
  const withEvals = opts.evals !== false;
  for (const s of sessions) {
    s.class_date = dateStr;
    s.teacher_entry = null; s.attendance = null; s.pay_type = null;
    s.sched_label_ko = null; s.sched_label_en = null;
    s.last_eval = null; s.today_eval = null;
    s.eval_hidden = !withEvals;   // 화면이 «—»(없음)과 «본사 전용»(숨김)을 가르게
  }
  if (!sessions.length) return;
  const db = env.DB;
  const dayStartTs = Date.parse(dateStr + 'T00:00:00+09:00');
  const mangoi = sessions.filter(s => !isNoRoomRow(s) && s.room_id);
  const uids = Array.from(new Set(sessions.map(s => String(s.student_uid || '').trim()).filter(Boolean)));

  // ① 강사 입장 — 정본 판정 재사용
  let presence = new Map<string, any>();
  try {
    presence = await teacherPresenceByRoom(db, mangoi.map(s => ({
      room_id: s.room_id, missing_role: 'teacher',
      teacher_name: s.teacher_name || null, student_name: s.student_name || null,
    })));
  } catch (e: any) { console.warn('[classes/today] teacher entry:', e?.message); }

  // ② 학생 출결 — 방마다 접속 행
  const byRoom = new Map<string, any[]>();
  let attOk = false;
  if (mangoi.length) {
    try {
      await ensureAttendanceAccountUid(env);
      const att = await selectInChunks<any>(db, mangoi.map(s => s.room_id), (ph) =>
        `SELECT room_id, role, username, user_id, account_uid, joined_at FROM attendance WHERE room_id IN (${ph})`);
      for (const a of att) {
        const k = String(a?.room_id || '');
        const l = byRoom.get(k) || []; l.push(a); byRoom.set(k, l);
      }
      attOk = true;
    } catch (e: any) { console.warn('[classes/today] attendance:', e?.message); }
  }

  for (const s of sessions) {
    const noRoom = isNoRoomRow(s);
    s.teacher_entry = judgeTeacherEntry(noRoom ? 'cafe24' : 'mangoi', Number(s.start_ts) || 0, String(s.status || ''),
      noRoom ? null : (presence.get(s.room_id) || null));
    if (noRoom) { s.attendance = judgeStudentAttendance('cafe24', 0, '', null, 0); continue; }
    if (!attOk) continue;   // 못 물어봤다 → 칸을 비운다(«결석» 이 아니다)
    const uid = String(s.student_uid || '').trim();
    const sname = String(s.student_name || '').trim();
    const tname = String(s.teacher_name || '').trim().toLowerCase();
    let first: number | null = null; let unidentified = 0;
    for (const a of (byRoom.get(s.room_id) || [])) {
      const j = Number(a?.joined_at) || 0;
      if (!j) continue;
      const uname = String(a?.username || '').replace(/^(학생|student)\s*/i, '').trim();
      const isStu = (uid && (String(a?.account_uid || '') === uid || String(a?.user_id || '') === uid || uname === uid))
        || (sname && uname === sname);
      if (isStu) { if (first == null || j < first) first = j; continue; }
      const role = String(a?.role || '').toLowerCase();
      const lu = String(a?.username || '').toLowerCase();
      const looksStaff = role === 'teacher' || role === 'admin' || role === 'observer'
        || /^(교사|teacher|관리자|admin)/.test(lu) || (tname && lu.includes(tname));
      if (!looksStaff) unidentified++;
    }
    s.attendance = judgeStudentAttendance('mangoi', Number(s.start_ts) || 0, String(s.status || ''), first, unidentified);
  }

  // ③ 결제 유형
  try {
    const centerTypes = new Map<string, string | null>();
    const rs = await db.prepare(
      `SELECT name, UPPER(TRIM(payment_type)) AS pt FROM centers
        WHERE UPPER(TRIM(COALESCE(payment_type,''))) IN ('B2B','B2C') AND name IS NOT NULL AND TRIM(name) <> ''`
    ).all();
    for (const r of (rs?.results || [])) {
      const n = String(r.name).trim(); const t = String(r.pt);
      if (!centerTypes.has(n)) centerTypes.set(n, t);
      else if (centerTypes.get(n) !== t) centerTypes.set(n, null);
    }
    const rowPt = new Map<string, any>();
    if (uids.length) {
      try {
        const pr = await selectInChunks<any>(db, uids, (ph) =>
          `SELECT user_id, payment_type, shop_name FROM students_erp WHERE user_id IN (${ph})`);
        for (const r of pr) rowPt.set(String(r.user_id), r);
      } catch (e: any) { console.warn('[classes/today] erp payment_type:', e?.message); }
    }
    for (const s of sessions) {
      // 학원은 줄에 실려 오면 그것(관리자 목록), 없으면 원부의 shop_name(강사 포털).
      const er = rowPt.get(String(s.student_uid || '')) || {};
      s.pay_type = judgePayType(s.academy || er.shop_name, er.payment_type, centerTypes);
    }
  } catch (e: any) { console.warn('[classes/today] pay type:', e?.message); }

  // ④ 일정 — 명부 「예약」 칸과 같은 정본
  try {
    const sched = await loadSchedSummaryMap(env, nowMs);
    for (const s of sessions) {
      const v = sched.get(String(s.student_uid || '').trim());
      if (v && v.total > 0) { s.sched_label_ko = v.label_ko; s.sched_label_en = v.label_en; }
    }
  } catch (e: any) { console.warn('[classes/today] schedule:', e?.message); }

  // ⑤⑥ 평가(1분 수업일지) — 지난 · 오늘. ⛔ 숨길 사람이면 «조회 자체를 안 한다»(응답에 실릴 자리가 없게)
  if (withEvals && uids.length) {
    try {
      const ev = await selectInChunks<any>(db, uids, (ph) =>
        `SELECT * FROM student_evaluations WHERE student_uid IN (${ph})`);
      const byUid = new Map<string, any[]>();
      for (const e of ev) {
        const u = String(e?.student_uid || ''); if (!u) continue;
        const l = byUid.get(u) || []; l.push(e); byUid.set(u, l);
      }
      for (const l of byUid.values()) l.sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
      for (const s of sessions) {
        const l = byUid.get(String(s.student_uid || '').trim());
        if (!l) continue;
        const { today, last } = pickEvals(l, String(s.room_id || ''), dateStr, dayStartTs);
        s.today_eval = today ? briefEval(today) : null;
        s.last_eval = last ? briefEval(last) : null;
      }
    } catch (e: any) { console.warn('[classes/today] evaluations:', e?.message); }
  }
}
