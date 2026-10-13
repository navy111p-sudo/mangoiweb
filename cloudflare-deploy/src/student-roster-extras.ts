/* ═══════════════════════════════════════════════════════════════════════════
   💰📅 학생 목록 «최근 결제» · «다음 수업» — 정본 한 곳 (2026-10-13 사장님 지시)
   ───────────────────────────────────────────────────────────────────────────
   학생 목록(/api/admin/students/unified) 맨 오른쪽 두 칸의 값을 만든다.

   💰 최근 결제 — student_payments 의 status='paid' 중 가장 늦은 한 건(날짜·금액).
      실측(2026-10-13): paid 11,702건 · 1,352명 · cancelled 119건.
      ⛔ cancelled 는 «결제» 가 아니다 — 세지 않는다.
      ⚠️ 같은 시각에 두 건이면 금액이 큰 쪽(같으면 id 큰 쪽) — 결정론.

   📅 다음 수업 — «지금 이후» 가장 이른 수업 하나(KST 날짜·시각).
      근거 둘:
        ① class_schedules (status='active', LMS·시드 자리표시 제외 — SCHED_SUMMARY_WHERE 와 같은 문자열)
           · 날짜 지정 행: scheduled_date + start_time
           · 매주 반복 행: day_of_week 로 앞으로 14일을 훑음 — 시작일(starts_on)·빠지는 날(skip_dates)은
             정본 recurStartedOn 을 지난다(그 주 하루만 연기된 날은 안 잡힘).
        ② 카페24 예약(attendance 의 c24- 방, joined_at = 예약 시각) — 미러를 안 켠 강사의 수업이
           class_schedules 에 없기 때문. 학생 키는 정본 ATTENDANCE_ACCOUNT_KEY.
      ⚠️ «지금 이후» 의 기준은 «시작 시각 > 지금» — 이미 시작한 수업은 «다음» 이 아니다.
      ⚠️ 공휴일 휴강은 반영하지 않는다(그 판정은 holiday-closure.ts 이고 여기서는 «예약» 만 말한다).
      ⛔ 모르면 지어내지 않는다 — 시각이 깨진 행·요일을 못 읽는 행은 건너뛴다.

   ⛔ 실패해도 명부는 그대로 떠야 한다 — 부르는 쪽이 try/catch 로 감싸고 그 두 칸만 «—».
   ═══════════════════════════════════════════════════════════════════════════ */
import { recurStartedOn, ensureStartsOnColumn, startsOnSel } from './class-start-date';
import { SCHED_SUMMARY_WHERE } from './student-schedule-summary';
import { ATTENDANCE_ACCOUNT_KEY, ATTENDANCE_BY_UID_LIST, attUidListBinds, ensureAttendanceAccountUid } from './attendance-uid';

const KST = 9 * 3600e3;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^(\d{1,2}):(\d{2})/;
export const NEXT_CLASS_LOOKAHEAD_DAYS = 14;

export type LastPayment = { paid_at: number; amount_krw: number };
export type NextClass = { at: number; ymd: string; hm: string; source: 'mangoi' | 'cafe24' };

/** 'YYYY-MM-DD' + 'HH:MM' (KST) → epoch ms. 모양이 틀리면 null. */
export function kstToMs(ymd: any, hm: any): number | null {
  const d = String(ymd ?? '').trim().slice(0, 10);
  const m = HM.exec(String(hm ?? '').trim());
  if (!YMD.test(d) || !m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  const ms = Date.parse(d + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== d) return null;
  return ms + (h * 60 + mi) * 60e3 - KST;
}

export function msToKst(ms: number): { ymd: string; hm: string } {
  const iso = new Date(ms + KST).toISOString();
  return { ymd: iso.slice(0, 10), hm: iso.slice(11, 16) };
}

/** 학생별 가장 늦은 «paid» 한 건. 행 순서와 무관하게 같은 답(결정론). */
export function pickLastPayments(rows: any[]): Map<string, LastPayment> {
  const out = new Map<string, LastPayment & { id: number }>();
  for (const r of rows || []) {
    if (!r || String(r.status ?? '') !== 'paid') continue;
    const uid = String(r.user_id ?? '').trim();
    const at = Number(r.paid_at);
    if (!uid || !Number.isFinite(at) || at <= 0) continue;
    const amt = Number(r.amount_krw);
    const cand = { paid_at: at, amount_krw: Number.isFinite(amt) ? amt : 0, id: Number(r.id) || 0 };
    const cur = out.get(uid);
    if (!cur || cand.paid_at > cur.paid_at
      || (cand.paid_at === cur.paid_at && (cand.amount_krw > cur.amount_krw
        || (cand.amount_krw === cur.amount_krw && cand.id > cur.id)))) out.set(uid, cand);
  }
  const res = new Map<string, LastPayment>();
  for (const [k, v] of out) res.set(k, { paid_at: v.paid_at, amount_krw: v.amount_krw });
  return res;
}

/** 한 학생의 다음 수업. schedRows = class_schedules(활성), seedAts = 카페24 예약 시각들(ms). */
export function pickNextClass(schedRows: any[], seedAts: number[], nowMs: number,
                              dowMatches: (raw: any, dow: number) => boolean): NextClass | null {
  let best: NextClass | null = null;
  const take = (at: number | null, source: NextClass['source']) => {
    if (at == null || !Number.isFinite(at) || at <= nowMs) return;
    if (best && at >= best.at) return;
    const k = msToKst(at);
    best = { at, ymd: k.ymd, hm: k.hm, source };
  };
  const todayMs = Date.parse(msToKst(nowMs).ymd + 'T00:00:00Z');
  for (const r of schedRows || []) {
    if (!r) continue;
    const sd = String(r.scheduled_date ?? '').trim();
    if (sd) { take(kstToMs(sd, r.start_time), 'mangoi'); continue; }
    if (r.day_of_week == null || String(r.day_of_week).trim() === '') continue;
    for (let i = 0; i <= NEXT_CLASS_LOOKAHEAD_DAYS; i++) {
      const dms = todayMs + i * 86400e3;
      const ymd = new Date(dms).toISOString().slice(0, 10);
      const dow = new Date(dms).getUTCDay();
      if (!dowMatches(r.day_of_week, dow)) continue;
      if (!recurStartedOn(r, ymd)) continue;
      const at = kstToMs(ymd, r.start_time);
      if (at != null && at > nowMs) { take(at, 'mangoi'); break; }
    }
  }
  for (const a of seedAts || []) take(Number(a), 'cafe24');
  return best;
}

/** 목록의 학생들에 lastpay / next_class 를 붙인다. 던지지 않는다(실패하면 그 칸만 비움). */
export async function attachRosterExtras(env: any, students: any[], nowMs: number,
                                         dowMatches: (raw: any, dow: number) => boolean): Promise<void> {
  const uids = Array.from(new Set((students || []).map((s: any) => String(s?.user_id ?? '').trim()).filter(Boolean)));
  if (!uids.length) return;
  const j = JSON.stringify(uids);
  // 💰
  try {
    const r = await env.DB.prepare(
      `SELECT id, user_id, paid_at, amount_krw, status FROM student_payments
        WHERE status = 'paid' AND user_id IN (SELECT value FROM json_each(?))`
      // ⛔ «학생마다 MAX(paid_at)» 상관 서브쿼리로 줄이지 말 것 — 매 행 전수 스캔(CLAUDE.md 2장).
      //    paid 행을 그대로 받아 pickLastPayments 가 고른다(목록 2,000명 × 평균 9건 안팎).
    ).bind(j).all();
    const m = pickLastPayments((r && r.results) || []);
    for (const s of students) { const v = m.get(String(s?.user_id ?? '').trim()); s.lastpay = v || null; }
  } catch (e: any) { console.warn('[roster-extras] 최근 결제 조회 실패(그 칸만 비움):', e?.message || e); }
  // 📅
  try {
    const todayYmd = msToKst(nowMs).ymd;
    const has = await ensureStartsOnColumn(env);
    const sr = await env.DB.prepare(
      `SELECT user_id, schedule_kind, scheduled_date, day_of_week, start_time${startsOnSel(has)}
         FROM class_schedules
        WHERE ${SCHED_SUMMARY_WHERE} AND user_id IN (SELECT value FROM json_each(?))
          AND (scheduled_date IS NULL OR TRIM(scheduled_date) = '' OR scheduled_date >= ?)`
    ).bind(j, todayYmd).all();
    const byUid = new Map<string, any[]>();
    for (const row of ((sr && sr.results) || [])) {
      const k = String(row.user_id ?? '').trim();
      if (!byUid.has(k)) byUid.set(k, []);
      byUid.get(k)!.push(row);
    }
    const seeds = new Map<string, number[]>();
    try {
      await ensureAttendanceAccountUid(env);
      const ar = await env.DB.prepare(
        `SELECT ${ATTENDANCE_ACCOUNT_KEY} AS uid, MIN(joined_at) AS at
           FROM attendance
          WHERE ${ATTENDANCE_BY_UID_LIST} AND room_id LIKE 'c24-%' AND joined_at > ? AND joined_at <= ?
          GROUP BY uid`
      ).bind(...attUidListBinds(uids), nowMs, nowMs + (NEXT_CLASS_LOOKAHEAD_DAYS + 1) * 86400e3).all();
      for (const row of ((ar && ar.results) || [])) seeds.set(String(row.uid), [Number(row.at)]);
    } catch (e: any) { console.warn('[roster-extras] 카페24 예약 조회 실패(망고아이 예약만):', e?.message || e); }
    for (const s of students) {
      const k = String(s?.user_id ?? '').trim();
      s.next_class = pickNextClass(byUid.get(k) || [], seeds.get(k) || [], nowMs, dowMatches);
    }
  } catch (e: any) { console.warn('[roster-extras] 다음 수업 조회 실패(그 칸만 비움):', e?.message || e); }
}
