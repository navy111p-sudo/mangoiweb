/**
 * enroll-ops.ts — 📚 수강신청·수업 자동배정 엔진 (2026-07-23)
 *
 *  규칙 원천 = 결제규칙_정리본_2026-07-22 (장지웅 부장 28문항) + 확인질문 5답:
 *   ① 대리점 단가 = 본사가 입력(agency_pricing), 미설정 시 60,000원
 *   ② 총액 = 단가 × 주횟수 × 개월 × 기간할인(6개월 95% / 12개월 90%) × 길이(40분 2배)
 *   ③ 강사 등급 가산 = 정책 미정 → 엔진·관리화면만 두고 기본 100%
 *   ④ 환불 = 기간할인 취소 후 정가로 사용분 정산, 잔액 환불
 *   ⑤ 공휴일 = 그 회차를 맨 뒤로 밀어 종료일이 늦어짐(회차 수 보존) + 학생 셀프 보강 가능
 *
 *  단계: 1) 결제→수업 자동생성  2) 연장·만료문자·종료후보  3) 공휴일·강사휴가  4) 환불·강사가산
 *
 *  ⚠️ 이 모듈은 다른 도메인을 import 하지 않는다(단방향). api-pay.ts 가 여기로 위임한다.
 *  ⚠️ 돈·수업 데이터를 다루므로: 모든 생성은 멱등, 이중 예약은 3중 차단, 실패는 격리.
 */
import { json, parseJsonBody } from './api-util';
import { DEFAULT_CLASS_MINUTES } from './class-policy';  // 기본 수업 20분(영어·중국어 공통)
import { checkAdminSession } from './auth-admin';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { sendPlainSms } from './solapi-client';

export const ENROLL_WEEKLY = [1, 2, 3, 5];
export const ENROLL_MONTHS = [1, 3, 6, 12];
export const ENROLL_BASE_WEEKLY1 = 60000;    // 대리점 단가 미설정 시 기본(주1회=월4회)
const ENROLL_TIME_MIN = 6 * 60;              // 06:00 ~
const ENROLL_TIME_MAX = 23 * 60 + 40;        // ~ 23:40
const ENROLL_END_DAYS = 21;                  // 3주 미결제 = 종료 후보(부장님 답변 14번)

/* ═══════════════ 순수 계산 (하니스가 이 함수들을 추출해 검증) ═══════════════ */

/** 가격 = 대리점 주1회 단가 × 주횟수 × 개월 × 기간할인 × 길이배수 × 강사배율 (10원 절사) */
export function enrollQuoteCalc(weekly1Price: number, weekly: number, months: number, minutes: number, teacherRate = 1.0) {
  const sessions = weekly * 4 * months;
  const discountRate = months >= 12 ? 0.90 : months >= 6 ? 0.95 : 1;
  const lenMul = minutes === 40 ? 2 : 1;
  const base = weekly1Price * weekly * months * lenMul;
  const amount = Math.floor((base * discountRate * teacherRate) / 10) * 10;
  const perSession = Math.round(amount / sessions);
  return { sessions, base, discountRate, amount, perSession };
}

/** 'HH:MM' → 분. 형식 오류면 -1 */
export function enrollTimeToMin(t: string): number {
  const m = /^([0-2]\d):([0-5]\d)$/.exec(String(t || '').trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 두 수업 시간대가 겹치는가 */
export function enrollOverlap(aStart: number, aMin: number, bStart: number, bMin: number): boolean {
  return aStart < bStart + bMin && bStart < aStart + aMin;
}

/** 시작일부터 선택 요일(0=일~6=토)로 sessions 회차 날짜 생성. blocked(공휴일·충돌)는 건너뛰고 뒤로 밀림 → 회차 수 보존 */
export function enrollDates(startDate: string, days: number[], sessions: number, blocked?: Set<string>): string[] {
  const out: string[] = [];
  const d = new Date(startDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return out;
  const want = new Set(days);
  for (let i = 0; i < 800 && out.length < sessions; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (want.has(d.getUTCDay()) && !(blocked && blocked.has(iso))) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** 환불액 = 결제액 − (사용 회차 × 정가 회당). 기간할인은 취소(확인답변 ④). 음수면 0 */
export function enrollRefundCalc(paidAmount: number, sessions: number, usedSessions: number, basePrice: number) {
  const used = Math.max(0, Math.min(sessions, usedSessions));
  const remain = sessions - used;
  const listPerSession = Math.round(basePrice / sessions);   // 할인 취소한 정가 회당
  const usedValue = used * listPerSession;
  const refund = Math.max(0, Math.floor((paidAmount - usedValue) / 10) * 10);
  return { used, remain, listPerSession, usedValue, refund };
}

/** KST 기준 오늘 YYYY-MM-DD */
export function kstToday(now = Date.now()): string {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
/** YYYY-MM-DD 에 일수 더하기 */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 두 날짜(YYYY-MM-DD) 차이 일수 (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/* ═══════════════ 테이블 ═══════════════ */

export async function ensureEnrollTables(env: any): Promise<void> {
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS agency_pricing (shop_name TEXT PRIMARY KEY, weekly1_price INTEGER NOT NULL, updated_by TEXT, updated_at INTEGER)`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_pricing (teacher_id TEXT PRIMARY KEY, rate_pct INTEGER NOT NULL DEFAULT 100, note TEXT, updated_by TEXT, updated_at INTEGER)`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS enroll_holidays (day TEXT PRIMARY KEY, name TEXT, created_by TEXT, created_at INTEGER)`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS enroll_notify_log (uid TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, sent_at INTEGER, PRIMARY KEY (uid, kind, day))`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`);
    try { await env.DB.prepare(`ALTER TABLE payment_orders ADD COLUMN enroll_json TEXT`).run(); } catch (_) {}
    try { await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sched_teacher_slot ON class_schedules(teacher_id, scheduled_date, start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL`).run(); } catch (_) {}
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sched_user_date ON class_schedules(user_id, scheduled_date)`).run(); } catch (_) {}
  } catch (e) { console.warn('[enroll] ensure tables:', (e as any)?.message); }
}

/* ═══════════════ 조회 헬퍼 ═══════════════ */

/** 학생 uid → 대리점(shop_name)과 주1회 단가 */
async function priceForUid(env: any, uid: string): Promise<{ shopName: string; weekly1Price: number }> {
  let shopName = '';
  try {
    const st: any = await env.DB.prepare(`SELECT shop_name FROM students_erp WHERE user_id = ? LIMIT 1`).bind(uid).first();
    shopName = String(st?.shop_name || '').trim();
  } catch (_) {}
  let weekly1Price = ENROLL_BASE_WEEKLY1;
  if (shopName) {
    try {
      const p: any = await env.DB.prepare(`SELECT weekly1_price FROM agency_pricing WHERE shop_name = ? LIMIT 1`).bind(shopName).first();
      if (p && Number(p.weekly1_price) > 0) weekly1Price = Number(p.weekly1_price);
    } catch (_) {}
  }
  return { shopName, weekly1Price };
}

/** 강사 가산 배율 (기본 1.0 — 정책 미정, 확인답변 ③) */
async function teacherRateFor(env: any, teacherId: string): Promise<number> {
  try {
    const r: any = await env.DB.prepare(`SELECT rate_pct FROM teacher_pricing WHERE teacher_id = ? LIMIT 1`).bind(String(teacherId)).first();
    const pct = Number(r?.rate_pct || 100);
    if (pct >= 50 && pct <= 300) return pct / 100;
  } catch (_) {}
  return 1.0;
}

/** 공휴일 집합 (오늘 이후) */
async function holidaySet(env: any, fromDay: string): Promise<Set<string>> {
  const s = new Set<string>();
  try {
    const rs: any = await env.DB.prepare(`SELECT day FROM enroll_holidays WHERE day >= ? LIMIT 500`).bind(fromDay).all();
    for (const r of ((rs?.results as any[]) || [])) s.add(String(r.day));
  } catch (_) {}
  return s;
}

/** 강사의 기존 수업과 충돌하는 날짜들 (날짜지정 + 요일반복 모두 검사) */
export async function enrollConflicts(env: any, teacherId: string, dates: string[], startMin: number, minutes: number, days: number[]): Promise<Set<string>> {
  const conflicts = new Set<string>();
  if (!dates.length) return conflicts;
  try {
    for (let i = 0; i < dates.length; i += 90) {   // D1 파라미터 100개 한도
      const chunk = dates.slice(i, i + 90);
      const ph = chunk.map(() => '?').join(',');
      const rs: any = await env.DB.prepare(
        `SELECT scheduled_date, start_time, COALESCE(duration_min, 20) AS dm FROM class_schedules
         WHERE teacher_id = ? AND status = 'active' AND scheduled_date IN (${ph})`
      ).bind(teacherId, ...chunk).all();
      for (const r of ((rs?.results as any[]) || [])) {
        const s = enrollTimeToMin(String(r.start_time || ''));
        if (s >= 0 && enrollOverlap(startMin, minutes, s, Number(r.dm) || DEFAULT_CLASS_MINUTES)) conflicts.add(String(r.scheduled_date));
      }
    }
    const rs2: any = await env.DB.prepare(
      `SELECT day_of_week, start_time, COALESCE(duration_min, 20) AS dm FROM class_schedules
       WHERE teacher_id = ? AND status = 'active' AND schedule_kind = 'recurring' AND day_of_week IS NOT NULL`
    ).bind(teacherId).all();
    const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };
    const badDows = new Set<number>();
    for (const r of ((rs2?.results as any[]) || [])) {
      const dw = DOW[String(r.day_of_week || '').toLowerCase().slice(0, 3)];
      if (dw === undefined || !days.includes(dw)) continue;
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s >= 0 && enrollOverlap(startMin, minutes, s, Number(r.dm) || DEFAULT_CLASS_MINUTES)) badDows.add(dw);
    }
    if (badDows.size) {
      for (const iso of dates) {
        const dw = new Date(iso + 'T00:00:00Z').getUTCDay();
        if (badDows.has(dw)) conflicts.add(iso);
      }
    }
  } catch (e) { console.warn('[enroll] conflicts:', (e as any)?.message); }
  return conflicts;
}

/** 요청 본문 검증 → 정규화 */
export function enrollParse(body: any): any {
  const weekly = Number(body?.weekly || 0);
  const months = Number(body?.months || 0);
  const minutes = Number(body?.minutes || 20);
  const time = String(body?.time || '').trim();
  const startDate = String(body?.start_date || '').trim();
  const teacherId = String(body?.teacher_id || '').trim().slice(0, 40);
  const days: number[] = Array.isArray(body?.days)
    ? ([...new Set(body.days.map((x: any) => Number(x)))] as number[]).filter((n) => n >= 0 && n <= 6).sort()
    : [];
  if (!ENROLL_WEEKLY.includes(weekly)) return { error: 'bad_weekly' };
  if (!ENROLL_MONTHS.includes(months)) return { error: 'bad_months' };
  if (minutes !== 20 && minutes !== 40) return { error: 'bad_minutes' };
  const startMin = enrollTimeToMin(time);
  if (startMin < ENROLL_TIME_MIN || startMin > ENROLL_TIME_MAX || startMin % 10 !== 0) return { error: 'bad_time' };
  if (days.length !== weekly) return { error: 'days_count_mismatch' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: 'bad_start_date' };
  if (startDate < kstToday()) return { error: 'start_date_past' };
  if (!teacherId) return { error: 'teacher_required' };
  return { weekly, months, minutes, time, startMin, startDate, teacherId, days };
}

/* ═══════════════ 1단계: 결제 확정 → 수업 전량 생성 ═══════════════ */

/**
 * 📚 결제 확정 → class_schedules 회차 전량 생성. (confirm·webhook 공용)
 *   멱등: source='enroll:주문번호' 존재 시 재실행 안 함.
 *   충돌·공휴일 날짜는 건너뛰고 뒤로 밀어 회차 수를 보존한다.
 */
export async function enrollCreateSchedules(env: any, order: any, orderId: string): Promise<void> {
  if (!order || !order.enroll_json) return;
  let ej: any = null;
  try { ej = JSON.parse(String(order.enroll_json)); } catch (_) { return; }
  if (!ej || !ej.uid || !ej.teacher_id || !Array.isArray(ej.days)) return;
  await ensureEnrollTables(env);

  const src = `enroll:${orderId}`;
  const dup: any = await env.DB.prepare(`SELECT id FROM class_schedules WHERE source = ? LIMIT 1`).bind(src).first();
  if (dup) return;   // 이미 생성됨(confirm·webhook 경합 안전)

  const sessions = Number(ej.sessions || 0);
  const startMin = enrollTimeToMin(String(ej.time || ''));
  if (!sessions || startMin < 0) return;

  // 결제 시점 기준 재검사 — 주문~결제 사이에 찬 슬롯 + 공휴일을 함께 blocked 처리
  const probe = enrollDates(String(ej.start_date), ej.days, sessions * 2);
  const blocked = await enrollConflicts(env, String(ej.teacher_id), probe, startMin, Number(ej.minutes) || 20, ej.days);
  const hol = await holidaySet(env, String(ej.start_date));
  hol.forEach((d) => blocked.add(d));
  const dates = enrollDates(String(ej.start_date), ej.days, sessions, blocked);
  if (dates.length < sessions) console.warn('[enroll] not enough dates', orderId, dates.length, '/', sessions);

  const now = Date.now();
  const sName = String(order.student_name || order.payer_name || '');
  const stmt = env.DB.prepare(
    `INSERT OR IGNORE INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at, notes)
     VALUES (?, ?, 'dated', 'regular', ?, ?, ?, ?, 'active', ?, 'enroll-auto', ?, ?)`
  );
  const note = `수강신청 자동생성 · ${ej.teacher_name || ''} · 주${ej.weekly}회×${ej.months}개월`;
  const batch: any[] = dates.map((d) =>
    stmt.bind(String(ej.uid), sName || null, d, String(ej.time), Number(ej.minutes) || 20, String(ej.teacher_id), src, now, note));
  for (let i = 0; i < batch.length; i += 80) await env.DB.batch(batch.slice(i, i + 80));
}

/* ═══════════════ 2단계: 현재 수강 현황 · 연장 ═══════════════ */

/** 요일 집합이 판매 중인 주 횟수(1/2/3/5회)인지 */
export function isValidWeekly(n: number): boolean { return ENROLL_WEEKLY.includes(n); }

/**
 * 수업 요일 패턴 추정 — ⚠️ 연장은 보통 "수업이 1~2회 남았을 때" 한다.
 *   그때 남은 수업만 보면 주2회(월·수) 학생이 수요일 1건만 남아 주1회로 오판 → 요금·회차가 틀어진다.
 *   그래서 ①최근 과거 14일 + 미래 전체 로 먼저 추정하고, 그래도 유효하지 않으면 ②미래만으로 재시도한다.
 *   둘 다 유효하지 않으면(예: 도중에 요일을 바꿔 4일이 섞임) 추정하지 않고 신규 신청으로 안내한다.
 */
export function inferWeeklyDays(pastAndFuture: string[], futureOnly: string[]): number[] | null {
  const dows = (list: string[]) => [...new Set(list.map((d) => new Date(d + 'T00:00:00Z').getUTCDay()))].sort((a, b) => a - b);
  const wide = dows(pastAndFuture);
  if (isValidWeekly(wide.length)) return wide;
  // 넓은 창이 오염된 경우(도중에 요일을 바꿈)에만 미래로 재시도한다.
  // ⚠️ 단, 미래가 최소 한 주 이상 뻗어 있어야 패턴으로 믿는다 — 1~2건만 남은 시점에
  //    미래만 보면 주2회 학생을 주1회로 오판하는 같은 함정에 다시 빠진다.
  if (futureOnly.length >= 2 && daysBetween(futureOnly[0], futureOnly[futureOnly.length - 1]) >= 7) {
    const narrow = dows(futureOnly);
    if (isValidWeekly(narrow.length)) return narrow;
  }
  return null;
}

/** 학생의 현재 수강 상태 요약 (남은 회차·마지막 수업일·요일·시간·강사) */
async function currentEnrollment(env: any, uid: string): Promise<any> {
  const today = kstToday();
  const since = addDays(today, -14);   // 요일 패턴 추정용 과거 창(연장 시점엔 미래가 거의 없다)
  const rs: any = await env.DB.prepare(
    `SELECT scheduled_date, start_time, COALESCE(duration_min,20) AS dm, teacher_id, source
     FROM class_schedules
     WHERE user_id = ? AND status = 'active' AND scheduled_date IS NOT NULL AND scheduled_date >= ?
     ORDER BY scheduled_date ASC LIMIT 400`
  ).bind(uid, since).all();
  const all = ((rs?.results as any[]) || []);
  const future = all.filter((r) => String(r.scheduled_date) >= today);
  if (!future.length) return { active: false, remaining: 0 };

  const last = future[future.length - 1];
  const days = inferWeeklyDays(all.map((r) => String(r.scheduled_date)), future.map((r) => String(r.scheduled_date)));
  let teacherName = '';
  try {
    const t: any = await env.DB.prepare(`SELECT name FROM teachers WHERE id = ? LIMIT 1`).bind(String(last.teacher_id)).first();
    teacherName = String(t?.name || '');
  } catch (_) {}
  return {
    active: true,
    remaining: future.length,
    next_date: String(future[0].scheduled_date),
    last_date: String(last.scheduled_date),
    days: days || [],
    days_resolved: !!days,               // false 면 화면이 연장 카드를 숨기고 신규 신청으로 안내
    time: String(last.start_time || ''),
    minutes: Number(last.dm) || 20,
    teacher_id: String(last.teacher_id || ''),
    teacher_name: teacherName,
    days_left: daysBetween(today, String(last.scheduled_date)),
  };
}

/* ═══════════════ 2단계: 만료 임박 문자 + 종료 후보 ═══════════════ */

/** 만료 임박(7일·3일 전) 학생에게 재결제 안내 문자. 멱등(enroll_notify_log). dry=진단만 */
export async function runEnrollExpirySweep(env: any, opts?: { dry?: boolean }): Promise<any> {
  const out: any = { ok: true, checked: 0, due: [] as any[], sent: 0, skipped: 0, dry: !!opts?.dry, at: Date.now() };
  try {
    await ensureEnrollTables(env);
    const today = kstToday();
    // 학생별 마지막 수업일 = 만료일
    const rs: any = await env.DB.prepare(
      `SELECT user_id, MAX(scheduled_date) AS last_date, COUNT(*) AS remaining
       FROM class_schedules
       WHERE status='active' AND scheduled_date IS NOT NULL AND scheduled_date >= ?
       GROUP BY user_id LIMIT 2000`
    ).bind(today).all();
    const rows = ((rs?.results as any[]) || []);
    out.checked = rows.length;

    for (const r of rows) {
      const uid = String(r.user_id || '');
      const lastDate = String(r.last_date || '');
      if (!uid || !lastDate) continue;
      const left = daysBetween(today, lastDate);
      const kind = left === 7 ? 'exp7' : left === 3 ? 'exp3' : '';
      if (!kind) continue;
      out.due.push({ uid, last_date: lastDate, days_left: left, kind, remaining: r.remaining });
      if (opts?.dry) continue;

      // 멱등: 같은 학생·같은 종류·같은 날 1회만
      const dup: any = await env.DB.prepare(`SELECT uid FROM enroll_notify_log WHERE uid=? AND kind=? AND day=? LIMIT 1`).bind(uid, kind, today).first();
      if (dup) { out.skipped++; continue; }

      let phone = '', name = '';
      try {
        const s: any = await env.DB.prepare(
          `SELECT COALESCE(parent_phone, phone) AS ph, COALESCE(korean_name, english_name, username) AS nm
           FROM students_erp WHERE user_id = ? LIMIT 1`
        ).bind(uid).first();
        phone = String(s?.ph || '').replace(/[^0-9]/g, '');
        name = String(s?.nm || '');
      } catch (_) {}
      await env.DB.prepare(`INSERT OR REPLACE INTO enroll_notify_log (uid, kind, day, sent_at) VALUES (?,?,?,?)`).bind(uid, kind, today, Date.now()).run();
      if (phone.length < 10) { out.skipped++; continue; }

      const txt = `[망고아이] ${name ? name + ' 학생 ' : ''}수업이 ${left}일 후(${lastDate}) 종료됩니다.\n같은 요일·시간·선생님으로 이어서 수강하시려면 아래에서 연장해 주세요 🥭\nhttps://test.mangoi.co.kr/enroll.html`;
      const sr = await sendPlainSms(env, phone, txt);
      if (sr?.ok) out.sent++; else out.skipped++;
    }
  } catch (e) { out.ok = false; out.error = String((e as any)?.message || e); }
  return out;
}

/** 종료 후보 명단 — 마지막 수업 후 N일(기본 21=3주) 이상 새 수업이 없는 학생 (부장님 요청 ①) */
async function endingSoonList(env: any, days: number): Promise<any> {
  const today = kstToday();
  // 미래 수업이 있는 학생 = 진행중 → 제외. 과거 수업만 있고 마지막이 N일 이상 지났으면 종료 후보.
  const rs: any = await env.DB.prepare(
    `SELECT s.user_id, MAX(s.scheduled_date) AS last_date, COUNT(*) AS total
     FROM class_schedules s
     WHERE s.status='active' AND s.scheduled_date IS NOT NULL AND s.scheduled_date < ?
       AND NOT EXISTS (SELECT 1 FROM class_schedules f WHERE f.user_id = s.user_id AND f.status='active' AND f.scheduled_date >= ?)
     GROUP BY s.user_id
     HAVING MAX(s.scheduled_date) <= ?
     ORDER BY last_date ASC LIMIT 300`
  ).bind(today, today, addDays(today, -days)).all();
  const rows = ((rs?.results as any[]) || []);
  // 이름·연락처 붙이기 (D1 파라미터 한도 → 90개 청크)
  const info: Record<string, any> = {};
  const uids = rows.map((r) => String(r.user_id));
  for (let i = 0; i < uids.length; i += 90) {
    const chunk = uids.slice(i, i + 90);
    const ph = chunk.map(() => '?').join(',');
    try {
      const si: any = await env.DB.prepare(
        `SELECT user_id, COALESCE(korean_name, english_name, username) AS nm, shop_name FROM students_erp WHERE user_id IN (${ph})`
      ).bind(...chunk).all();
      for (const s of ((si?.results as any[]) || [])) info[String(s.user_id)] = s;
    } catch (_) {}
  }
  return {
    threshold_days: days,
    today,
    students: rows.map((r) => ({
      user_id: String(r.user_id),
      name: String(info[String(r.user_id)]?.nm || ''),
      shop_name: String(info[String(r.user_id)]?.shop_name || ''),
      last_date: String(r.last_date),
      days_since: daysBetween(String(r.last_date), today),
      past_classes: Number(r.total || 0),
    })),
  };
}

/* ═══════════════ 3단계: 공휴일 자동 연기 ═══════════════ */

/**
 * 🎌 공휴일에 걸린 수업을 맨 뒤로 밀어 종료일을 늦춘다(확인답변 ⑤ — 회차 수 보존).
 *   각 수업을 "그 학생의 마지막 수업 이후 같은 요일"로 이동. 충돌·공휴일이면 다시 다음 주로.
 *   멱등: notes 에 이동 표시 + 공휴일 날짜에 active 수업이 없으면 아무 일도 안 함.
 */
export async function runHolidayShiftSweep(env: any, opts?: { dry?: boolean }): Promise<any> {
  const out: any = { ok: true, holidays: 0, moved: 0, failed: 0, items: [] as any[], dry: !!opts?.dry, at: Date.now() };
  try {
    await ensureEnrollTables(env);
    const today = kstToday();
    const hs: any = await env.DB.prepare(`SELECT day FROM enroll_holidays WHERE day >= ? ORDER BY day ASC LIMIT 60`).bind(today).all();
    const holidays = ((hs?.results as any[]) || []).map((r) => String(r.day));
    out.holidays = holidays.length;
    if (!holidays.length) return out;
    const holSet = new Set(holidays);

    for (const hday of holidays) {
      const rs: any = await env.DB.prepare(
        `SELECT id, user_id, teacher_id, start_time, COALESCE(duration_min,20) AS dm, student_name, source, notes
         FROM class_schedules WHERE status='active' AND scheduled_date = ? LIMIT 300`
      ).bind(hday).all();
      const rows = ((rs?.results as any[]) || []);
      for (const r of rows) {
        const uid = String(r.user_id), tid = String(r.teacher_id || '');
        const startMin = enrollTimeToMin(String(r.start_time || ''));
        if (startMin < 0) { out.failed++; continue; }
        // 그 학생의 마지막 수업일 다음 주 같은 요일부터 빈 자리 찾기
        const lastRow: any = await env.DB.prepare(
          `SELECT MAX(scheduled_date) AS d FROM class_schedules WHERE user_id=? AND status='active' AND scheduled_date IS NOT NULL`
        ).bind(uid).first();
        const anchor = String(lastRow?.d || hday);
        const dow = new Date(hday + 'T00:00:00Z').getUTCDay();
        let target = '';
        for (let k = 1; k <= 12 && !target; k++) {
          const cand = enrollDates(addDays(anchor, 1), [dow], k)[k - 1];
          if (!cand || holSet.has(cand)) continue;
          const conf = tid ? await enrollConflicts(env, tid, [cand], startMin, Number(r.dm) || 20, [dow]) : new Set<string>();
          if (!conf.has(cand)) target = cand;
        }
        if (!target) { out.failed++; continue; }
        out.items.push({ id: r.id, uid, from: hday, to: target });
        if (opts?.dry) continue;
        try {
          await env.DB.prepare(
            `UPDATE class_schedules SET scheduled_date = ?, updated_at = ?, notes = ? WHERE id = ? AND status='active'`
          ).bind(target, Date.now(), `${String(r.notes || '')} · 공휴일(${hday}) 자동 연기`.slice(0, 500), r.id).run();
          out.moved++;
        } catch (e) { out.failed++; }
      }
    }
  } catch (e) { out.ok = false; out.error = String((e as any)?.message || e); }
  return out;
}

/* ═══════════════ 라우터 ═══════════════ */

export async function handleEnrollApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/pay/enroll/')) return null;
  await ensureEnrollTables(env);

  /* ── (a) 강사 목록 (공개 — 이름·사진만) ── */
  if (path === '/api/pay/enroll/teachers' && method === 'GET') {
    let rows: any[] = [];
    try {
      const rs: any = await env.DB.prepare(`SELECT id, name, photo_url FROM teachers WHERE active = 1 ORDER BY name ASC LIMIT 200`).all();
      rows = (rs?.results as any[]) || [];
    } catch (_) {
      try {
        const rs: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1 ORDER BY name ASC LIMIT 200`).all();
        rows = (rs?.results as any[]) || [];
      } catch (_) {}
    }
    // 강사 가산 배율 동봉 (기본 100 → 화면에서 배지 표시 가능)
    const rates: Record<string, number> = {};
    try {
      const pr: any = await env.DB.prepare(`SELECT teacher_id, rate_pct FROM teacher_pricing`).all();
      for (const p of ((pr?.results as any[]) || [])) rates[String(p.teacher_id)] = Number(p.rate_pct || 100);
    } catch (_) {}
    return json({ ok: true, teachers: rows.map((t) => ({ id: String(t.id), name: String(t.name || ''), photo: String(t.photo_url || ''), rate_pct: rates[String(t.id)] || 100 })) });
  }

  /* ── (b) 가격 견적 (공개) ── */
  if (path === '/api/pay/enroll/quote' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const uid = String(body.uid || '').trim();
    const weekly = Number(body.weekly || 0), months = Number(body.months || 0), minutes = Number(body.minutes || 20);
    if (!ENROLL_WEEKLY.includes(weekly) || !ENROLL_MONTHS.includes(months) || (minutes !== 20 && minutes !== 40)) {
      return json({ ok: false, error: 'bad_options' }, 400);
    }
    const { shopName, weekly1Price } = await priceForUid(env, uid);
    const tRate = body.teacher_id ? await teacherRateFor(env, String(body.teacher_id)) : 1.0;
    const q = enrollQuoteCalc(weekly1Price, weekly, months, minutes, tRate);
    return json({
      ok: true, shop_name: shopName || null, weekly1_price: weekly1Price, teacher_rate: tRate, ...q,
      name: `주${weekly}회 × ${months}개월 (${q.sessions}회${minutes === 40 ? '·40분' : ''})`,
    });
  }

  /* ── (c) 슬롯 가능 여부 (공개 — 충돌 건수만, 강사 시간표 비노출) ── */
  if (path === '/api/pay/enroll/check' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const p = enrollParse(body);
    if (p.error) return json({ ok: false, error: p.error }, 400);
    const sessions = p.weekly * 4 * p.months;
    const hol = await holidaySet(env, p.startDate);
    const probe = enrollDates(p.startDate, p.days, sessions * 2);
    const conflicts = await enrollConflicts(env, p.teacherId, probe, p.startMin, p.minutes, p.days);
    const blocked = new Set<string>([...conflicts, ...hol]);
    const dates = enrollDates(p.startDate, p.days, sessions, blocked);
    if (dates.length < sessions) return json({ ok: false, error: 'date_gen_failed' }, 400);
    // 원래 자리(공휴일·충돌 없이) 대비 몇 건이 밀렸는지 = 안내용
    const plain = enrollDates(p.startDate, p.days, sessions);
    const shifted = plain.filter((d) => blocked.has(d)).length;
    const firstConflict = plain.find((d) => conflicts.has(d)) || null;
    return json({
      ok: true, sessions, conflict_count: conflicts.size, shifted_count: shifted,
      ok_to_book: !firstConflict || shifted < sessions,   // 밀려서라도 회차를 채울 수 있으면 예약 가능
      hard_blocked: !!firstConflict && dates.length < sessions,
      first_date: dates[0], last_date: dates[dates.length - 1],
      teacher_busy: conflicts.size > 0,
    });
  }

  /* ── (d) 신규 주문 생성 (본인 인증 필수) ── */
  if (path === '/api/pay/enroll/create-order' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const uid = String(body.uid || '').trim();
    if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
    const authUid = await authUidGlobal(request, url, env, body);
    if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
    if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
    const p = enrollParse(body);
    if (p.error) return json({ ok: false, error: p.error }, 400);
    return await createEnrollOrder(env, uid, p, 'new');
  }

  /* ── (e) 내 수강 현황 (본인 인증) — 연장 화면용 ── */
  if (path === '/api/pay/enroll/my-current' && method === 'GET') {
    const uid = String(url.searchParams.get('uid') || '').trim();
    if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
    const authUid = await authUidGlobal(request, url, env, {});
    if (!authUid) return json({ ok: false, error: 'auth_required' }, 401);
    if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
    const cur = await currentEnrollment(env, uid);
    return json({ ok: true, current: cur });
  }

  /* ── (f) 연장 주문 (본인 인증) — 요일·시간·강사 승계, 마지막 수업 다음 회차부터 ── */
  if (path === '/api/pay/enroll/renew-order' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const uid = String(body.uid || '').trim();
    if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
    const authUid = await authUidGlobal(request, url, env, body);
    if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
    if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);

    const cur = await currentEnrollment(env, uid);
    if (!cur.active) return json({ ok: false, error: 'no_active_enrollment', message: '연장할 수업이 없습니다. 새로 신청해 주세요.' }, 400);
    const months = Number(body.months || 0);
    if (!ENROLL_MONTHS.includes(months)) return json({ ok: false, error: 'bad_months' }, 400);
    const weekly = cur.days.length;
    // ⚠️ 요일 패턴을 확신할 수 없으면 절대 추측해서 청구하지 않는다(잘못된 금액·회차 방지).
    if (!cur.days_resolved || !ENROLL_WEEKLY.includes(weekly)) {
      return json({ ok: false, error: 'weekly_unresolved', message: '현재 수업 요일을 확인할 수 없습니다. 새로 신청해 주세요.' }, 400);
    }

    const p = {
      weekly, months, minutes: cur.minutes, time: cur.time,
      startMin: enrollTimeToMin(cur.time),
      startDate: addDays(cur.last_date, 1),        // 마지막 수업 다음 회차부터 이어짐(부장님 답변 12번)
      teacherId: cur.teacher_id, days: cur.days,
    };
    if (p.startMin < 0) return json({ ok: false, error: 'time_unresolved' }, 400);
    return await createEnrollOrder(env, uid, p, 'renew');
  }

  /* ── (g) 대리점 단가 (본사 관리자) ── */
  if (path === '/api/pay/enroll/admin/prices' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    try {
      const rs: any = await env.DB.prepare(
        `SELECT s.shop_name, COUNT(*) AS students, MAX(p.weekly1_price) AS weekly1_price, MAX(p.updated_at) AS updated_at
         FROM students_erp s LEFT JOIN agency_pricing p ON p.shop_name = s.shop_name
         WHERE s.shop_name IS NOT NULL AND s.shop_name != ''
         GROUP BY s.shop_name ORDER BY students DESC LIMIT 300`
      ).all();
      return json({ ok: true, default_price: ENROLL_BASE_WEEKLY1, shops: (rs?.results as any[]) || [] });
    } catch (e) { return json({ ok: false, error: String((e as any)?.message || e) }, 500); }
  }
  if (path === '/api/pay/enroll/admin/prices' && method === 'POST') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const body = await parseJsonBody(request) || {};
    const shopName = String(body.shop_name || '').trim().slice(0, 100);
    const price = Number(body.weekly1_price || 0);
    if (!shopName || !(price >= 1000 && price <= 1000000)) return json({ ok: false, error: 'bad_params' }, 400);
    await env.DB.prepare(
      `INSERT INTO agency_pricing (shop_name, weekly1_price, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(shop_name) DO UPDATE SET weekly1_price=excluded.weekly1_price, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(shopName, Math.round(price), String((sess as any).username || 'admin'), Date.now()).run();
    return json({ ok: true, shop_name: shopName, weekly1_price: Math.round(price) });
  }

  /* ── (h) 강사 등급 가산 (본사 관리자, 4단계 — 정책 확정 전까지 기본 100%) ── */
  if (path === '/api/pay/enroll/admin/teacher-rates' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    try {
      const rs: any = await env.DB.prepare(
        `SELECT t.id, t.name, COALESCE(p.rate_pct, 100) AS rate_pct, p.note, p.updated_at
         FROM teachers t LEFT JOIN teacher_pricing p ON p.teacher_id = CAST(t.id AS TEXT)
         WHERE t.active = 1 ORDER BY rate_pct DESC, t.name ASC LIMIT 300`
      ).all();
      return json({ ok: true, teachers: (rs?.results as any[]) || [], note: '정책 미확정 — 기본 100%. 변경 시 새 결제부터 적용됩니다.' });
    } catch (e) { return json({ ok: false, error: String((e as any)?.message || e) }, 500); }
  }
  if (path === '/api/pay/enroll/admin/teacher-rates' && method === 'POST') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const body = await parseJsonBody(request) || {};
    const tid = String(body.teacher_id || '').trim().slice(0, 40);
    const pct = Math.round(Number(body.rate_pct || 100));
    if (!tid || !(pct >= 50 && pct <= 300)) return json({ ok: false, error: 'bad_params', message: '배율은 50~300% 사이여야 합니다.' }, 400);
    await env.DB.prepare(
      `INSERT INTO teacher_pricing (teacher_id, rate_pct, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(teacher_id) DO UPDATE SET rate_pct=excluded.rate_pct, note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(tid, pct, String(body.note || '').slice(0, 200) || null, String((sess as any).username || 'admin'), Date.now()).run();
    return json({ ok: true, teacher_id: tid, rate_pct: pct });
  }

  /* ── (i) 공휴일 관리 (본사 관리자, 3단계) ── */
  if (path === '/api/pay/enroll/admin/holidays' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const rs: any = await env.DB.prepare(
      `SELECT day, name, created_by AS by_who, created_at FROM enroll_holidays ORDER BY day ASC LIMIT 400`
    ).all();
    return json({ ok: true, holidays: (rs?.results as any[]) || [] });
  }
  if (path === '/api/pay/enroll/admin/holidays' && method === 'POST') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const body = await parseJsonBody(request) || {};
    const day = String(body.day || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ ok: false, error: 'bad_day' }, 400);
    if (body.remove) {
      await env.DB.prepare(`DELETE FROM enroll_holidays WHERE day = ?`).bind(day).run();
      return json({ ok: true, removed: day });
    }
    await env.DB.prepare(
      `INSERT INTO enroll_holidays (day, name, created_by, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET name=excluded.name`
    ).bind(day, String(body.name || '휴일').slice(0, 60), String((sess as any).username || 'admin'), Date.now()).run();
    return json({ ok: true, day });
  }

  /* ── (j) 종료 후보 명단 (본사 관리자, 부장님 요청 ①) ── */
  if (path === '/api/pay/enroll/admin/ending-soon' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const days = Math.min(120, Math.max(1, parseInt(url.searchParams.get('days') || String(ENROLL_END_DAYS), 10) || ENROLL_END_DAYS));
    try {
      const list = await endingSoonList(env, days);
      return json({ ok: true, ...list });
    } catch (e) { return json({ ok: false, error: String((e as any)?.message || e) }, 500); }
  }

  /* ── (k) 만료 임박 스윕 수동 실행·진단 (관리자) ── */
  if (path === '/api/pay/enroll/admin/expiry-sweep' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const dry = url.searchParams.get('dry') !== '0';   // 기본은 진단(문자 미발송)
    return json({ ok: true, result: await runEnrollExpirySweep(env, { dry }) });
  }

  /* ── (l) 공휴일 연기 스윕 수동 실행·진단 (관리자) ── */
  if (path === '/api/pay/enroll/admin/holiday-shift' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const dry = url.searchParams.get('dry') !== '0';
    return json({ ok: true, result: await runHolidayShiftSweep(env, { dry }) });
  }

  /* ── (m) 강사 휴가 → 다른 강사로 수업 이관 (관리자, 3단계) ── */
  if (path === '/api/pay/enroll/admin/teacher-leave' && method === 'POST') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const body = await parseJsonBody(request) || {};
    const from = String(body.from_teacher_id || '').trim();
    const to = String(body.to_teacher_id || '').trim();
    const day = String(body.day || '').trim();
    const dry = !!body.dry;
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ ok: false, error: 'bad_params' }, 400);
    if (from === to) return json({ ok: false, error: 'same_teacher' }, 400);
    const rs: any = await env.DB.prepare(
      `SELECT id, user_id, student_name, start_time, COALESCE(duration_min,20) AS dm
       FROM class_schedules WHERE status='active' AND scheduled_date=? AND teacher_id=? LIMIT 200`
    ).bind(day, from).all();
    const rows = ((rs?.results as any[]) || []);
    const moved: any[] = [], skipped: any[] = [];
    for (const r of rows) {
      const startMin = enrollTimeToMin(String(r.start_time || ''));
      const dow = new Date(day + 'T00:00:00Z').getUTCDay();
      const conf = await enrollConflicts(env, to, [day], startMin, Number(r.dm) || 20, [dow]);
      if (conf.has(day)) { skipped.push({ id: r.id, student: r.student_name, time: r.start_time, reason: '대체 강사도 그 시간에 수업 있음' }); continue; }
      if (!dry) {
        await env.DB.prepare(`UPDATE class_schedules SET teacher_id=?, updated_at=?, notes=COALESCE(notes,'')||' · 강사 휴가 대체' WHERE id=? AND status='active'`)
          .bind(to, Date.now(), r.id).run();
      }
      moved.push({ id: r.id, student: r.student_name, time: r.start_time });
    }
    return json({ ok: true, day, from, to, dry, moved_count: moved.length, skipped_count: skipped.length, moved, skipped });
  }

  /* ── (n) 환불 계산기 (관리자, 4단계 — 계산만. 실제 환불 실행은 사람이) ── */
  if (path === '/api/pay/enroll/admin/refund-quote' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const orderId = String(url.searchParams.get('order_id') || '').trim();
    if (!orderId) return json({ ok: false, error: 'order_id_required' }, 400);
    const o: any = await env.DB.prepare(
      `SELECT order_id, uid, amount, status, enroll_json, paid_at, student_name FROM payment_orders WHERE order_id = ? LIMIT 1`
    ).bind(orderId).first();
    if (!o) return json({ ok: false, error: 'order_not_found' }, 404);
    if (o.status !== 'paid') return json({ ok: false, error: 'not_paid', status: o.status }, 400);
    let ej: any = null;
    try { ej = JSON.parse(String(o.enroll_json || 'null')); } catch (_) {}
    if (!ej) return json({ ok: false, error: 'not_enroll_order', message: '수강신청 주문이 아닙니다.' }, 400);

    const sessions = Number(ej.sessions || 0);
    const src = `enroll:${orderId}`;
    const today = kstToday();
    const rem: any = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM class_schedules WHERE source=? AND status='active' AND scheduled_date >= ?`
    ).bind(src, today).first();
    const remaining = Number(rem?.n || 0);
    const usedSessions = Math.max(0, sessions - remaining);
    const lenMul = Number(ej.minutes) === 40 ? 2 : 1;
    const basePrice = Number(ej.weekly1_price || ENROLL_BASE_WEEKLY1) * Number(ej.weekly || 1) * Number(ej.months || 1) * lenMul;
    const calc = enrollRefundCalc(Number(o.amount || 0), sessions, usedSessions, basePrice);
    return json({
      ok: true, order_id: orderId, student: o.student_name, paid_amount: Number(o.amount || 0),
      sessions, remaining_by_schedule: remaining, base_price_no_discount: basePrice,
      discount_rate: Number(ej.months) >= 12 ? 0.90 : Number(ej.months) >= 6 ? 0.95 : 1,
      ...calc,
      policy: '기간할인 취소 후 정가로 사용분 정산 → 잔액 환불 (2026-07-23 확인)',
    });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

/* ═══════════════ 주문 생성 공통 (신규·연장) ═══════════════ */

async function createEnrollOrder(env: any, uid: string, p: any, kind: 'new' | 'renew'): Promise<Response> {
  const sessions = p.weekly * 4 * p.months;
  const hol = await holidaySet(env, p.startDate);
  const probe = enrollDates(p.startDate, p.days, sessions * 2);
  const conflicts = await enrollConflicts(env, p.teacherId, probe, p.startMin, p.minutes, p.days);
  const blocked = new Set<string>([...conflicts, ...hol]);
  const dates = enrollDates(p.startDate, p.days, sessions, blocked);
  if (dates.length < sessions) {
    return json({ ok: false, error: 'slot_conflict', conflict_count: conflicts.size,
      message: '선택한 시간에 이미 다른 수업이 많습니다. 다른 시간을 골라주세요.' }, 409);
  }
  // 신규 신청은 "첫 회차가 막힌 경우"를 사용자에게 알려 다른 시간을 고르게 한다(연장은 밀어서 진행).
  if (kind === 'new') {
    const plain = enrollDates(p.startDate, p.days, sessions);
    const firstBlockedByConflict = plain.some((d) => conflicts.has(d));
    if (firstBlockedByConflict) {
      return json({ ok: false, error: 'slot_conflict', conflict_count: conflicts.size,
        message: '선택한 시간에 이미 다른 수업이 있습니다. 다른 시간을 골라주세요.' }, 409);
    }
  }

  const { shopName, weekly1Price } = await priceForUid(env, uid);
  const tRate = await teacherRateFor(env, p.teacherId);
  const q = enrollQuoteCalc(weekly1Price, p.weekly, p.months, p.minutes, tRate);

  let tName = '';
  try { const t: any = await env.DB.prepare(`SELECT name FROM teachers WHERE id = ? LIMIT 1`).bind(p.teacherId).first(); tName = String(t?.name || ''); } catch (_) {}
  let sName = '';
  try { const s: any = await env.DB.prepare(`SELECT COALESCE(korean_name, english_name, username) AS n FROM students_erp WHERE user_id = ? LIMIT 1`).bind(uid).first(); sName = String(s?.n || ''); } catch (_) {}

  const orderName = `${kind === 'renew' ? '[연장] ' : ''}주${p.weekly}회 × ${p.months}개월 수강권 (${q.sessions}회${p.minutes === 40 ? '·40분' : ''})`;
  const enrollJson = JSON.stringify({
    v: 1, kind, uid, teacher_id: p.teacherId, teacher_name: tName, days: p.days, time: p.time,
    minutes: p.minutes, weekly: p.weekly, months: p.months, start_date: p.startDate,
    sessions: q.sessions, per_session: q.perSession, weekly1_price: weekly1Price,
    teacher_rate: tRate, shop_name: shopName || null,
  });
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const orderId = `${kind === 'renew' ? 'MGR' : 'MGE'}-${Date.now().toString(36).toUpperCase()}-${rnd}`;
  try {
    await env.DB.prepare(
      `INSERT INTO payment_orders (order_id, uid, program, amount, status, method, payer_name, student_name, phone, enroll_json, created_at)
       VALUES (?, ?, 'enroll', ?, 'pending', 'card', ?, ?, NULL, ?, ?)`
    ).bind(orderId, uid, q.amount, sName || null, sName || null, enrollJson, Date.now()).run();
  } catch (e) {
    return json({ ok: false, error: 'order_create_failed', message: String((e as any)?.message || e) }, 500);
  }
  return json({
    ok: true, kind, orderId, amount: q.amount, orderName,
    clientKey: env.TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq',
    summary: {
      teacher: tName, days: p.days, time: p.time, minutes: p.minutes, sessions: q.sessions,
      first_date: dates[0], last_date: dates[dates.length - 1], discount: q.discountRate,
      teacher_rate: tRate, shifted: sessions - enrollDates(p.startDate, p.days, sessions).filter((d) => !blocked.has(d)).length,
    },
  });
}
