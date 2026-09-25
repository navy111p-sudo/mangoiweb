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
import { forbiddenTeacherBody } from './forbidden-teacher';   // 🪪 「강사 권한으로는 …」 문구 정본(계정 이름 포함) — 복제 금지
import { selectInChunks } from './d1-chunk';   // 🔢 IN(...) 목록을 D1 바인드 100개 한도에 맞춰 분할
// 수업 길이·격자·요금배수는 전부 class-policy 한 곳에서 온다 (여기 복사 금지)
import {
  DEFAULT_CLASS_MINUTES,      // 기본 수업 20분(영어·중국어 공통)
  ALLOWED_CLASS_MINUTES,      // 고를 수 있는 길이 [20,30,40] (25분은 스위치로 꺼 둠)
  CLASS_TIME_STEP_MIN,        // 예약 시작 시각 격자 10분
  classLengthMultiplier,      // 요금 배수 = 길이÷20 (분 정비례)
  DEFAULT_LONG_CLASS_DAILY_CAP,  // 🪑 긴 수업 하루 정원 기본값 (0 = 무제한)
  isLongClass, longClassCapReached,
} from './class-policy';
import { checkAdminSession, getAdminActor, isOrgScopedRole } from './auth-admin';
/* 🔒 스코프 격리는 scope.ts 한 곳에서만 판정한다(CLAUDE.md 「지사·대리점에게 관리자 API 를
   열었는데 남의 자료가 보임」). 이 파일 머리말의 «다른 도메인 import 금지» 는 수강신청 «규칙» 을
   딴 도메인에서 끌어오지 말라는 뜻이고, 인증·격리 같은 공용 가드는 예외다(api-pay-refund.ts 도 같다). */
import { getScope, scopeStudentCond } from './scope';
import { authUidFromRequest as authUidGlobal } from './auth-token';

/** 🔑 수강신청·자동결제용 로그인 판정 — 학생 토큰이 우선, 없으면 «관리자 세션 쿠키» 를
 *  본인 아이디(uid = username)로 인정한다. 「로그인했는데 또 로그인하래요」(CLAUDE.md 2장 —
 *  로그인 세션 두 갈래)의 수강신청 판: 홈 통합 로그인이 «관리자 폴백» 으로 성공하면
 *  (2026-08-23 사장님 jeong 이 정확히 이 경우) 학생 키가 localStorage 에 없어 화면이 잠겼다.
 *  ⚠️ 관리자 세션은 «그 username 자신» 으로만 인정 — 다른 uid 를 대신 인증해 주지 않는다.
 *     호출부의 `authUid !== uid` 검사가 그대로 살아 있어 남의 수강·결제는 여전히 403 이다.
 *  ⛔ 학생 키(mangoi_logged_user)를 관리자에게 만들어 주는 방식으로 풀지 말 것 — 학생 전용
 *     기능이 통째로 열린다(CLAUDE.md 같은 항목의 금지 사항). */
export async function authUidOrAdminSession(request: Request, url: URL, env: any, body?: any): Promise<string | null> {
  const uid = await authUidGlobal(request, url, env, body);
  if (uid) return uid;
  try {
    const sess = await checkAdminSession(request, env as any);
    if (sess?.ok && sess.username) return String(sess.username);
  } catch (_) {}
  return null;
}
import { sendPlainSms } from './solapi-client';
import { phonesForStudent } from './notify-contacts';  // 📞 학생·학부모 번호 판정 정본(복제 금지)
// ⚠️ 의존 방향: enroll-ops → notify-contacts → absent-sweep. absent-sweep 에서 이 파일을
//    import 하면 순환이 된다(선례: absent-sweep → api-notify → notify-contacts → absent-sweep).
import { siteUrl } from './site-url';           // 🔗 사람에게 나가는 링크는 한 곳에서
/* 🔗 1회용 연장 링크 — 학부모 폰에 학생 로그인이 없어도 «이 학생의 연장» 만 되게 하는 좁은 권한.
      ⛔ 로그인이 아니다. authUidGlobal 은 이 토큰을 모른다(개인정보 API 에 안 통한다). */
import { resolveRenewToken, markRenewLinkUsed, type RenewTokenScope } from './renew-link';
import { writeClassAudit } from './class-audit';
import { findScheduleConflicts } from './schedule-conflict';
import { planSeries, realConflict, normTime } from './class-series-move';   // 🔄 «변경(계속)» 시리즈 판정 정본
import { teacherMoveDenyReason } from './class-teacher-move';   // 🔒 담당 강사 변경 게이트 정본(PATCH 와 같음)   // 📅 옮기기 승인(/decide)이 쓰는 그 겹침 검사 — 복제 금지   // 📜 수업 변경 이력(공휴일 자동연기·강사 휴가대체)

export const ENROLL_WEEKLY = [1, 2, 3, 5];
export const ENROLL_MONTHS = [1, 3, 6, 12];
export const ENROLL_BASE_WEEKLY1 = 60000;    // 대리점 단가 미설정 시 기본(주1회=월4회)
const ENROLL_TIME_MIN = 6 * 60;              // 06:00 ~
const ENROLL_TIME_MAX = 23 * 60 + 40;        // ~ 23:40
const ENROLL_END_DAYS = 21;                  // 3주 미결제 = 종료 후보(부장님 답변 14번)

/* ═══════════════ 순수 계산 (하니스가 이 함수들을 추출해 검증) ═══════════════ */

/** 가격 = 대리점 주1회 단가 × 주횟수 × 개월 × 기간할인 × 길이배수 × 강사배율 (10원 절사)
 *  🔁 (2026-08-17) 길이배수가 «40분만 2배» 였다. 30분을 열면 20분 값에 팔리므로
 *     class-policy 의 분 정비례 배수(20:1.0 / 30:1.5 / 40:2.0)로 바꿨다. */
export function enrollQuoteCalc(weekly1Price: number, weekly: number, months: number, minutes: number, teacherRate = 1.0) {
  const sessions = weekly * 4 * months;
  const discountRate = months >= 12 ? 0.90 : months >= 6 ? 0.95 : 1;
  const lenMul = classLengthMultiplier(minutes);
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

/** 🔄 (2026-08-28) 대체강사 배정용 — 이 class_schedules 행이 그 날짜(date)에 실제로 열리는지,
 *  열린다면 그날의 요일(0=일~6=토)을 돌려준다. 안 열리면 null.
 *  ⚠️ day_of_week 는 이 파일의 다른 함수(enrollConflicts 등)와 같이 "단일 요일" 로만 본다 —
 *     admin classes/today 의 admDowMatches 는 콤마 나열도 허용하지만, 그 값은 이 파일이 만드는
 *     행(schedule_kind='dated')에는 나오지 않는다(day_of_week 는 admin 이 만드는 recurring 행만 씀). */
/** 🗓 (2026-08-30) `class_schedules.day_of_week` 는 «단일 값이 아니다» — 숫자 `4` 말고도
 *  `Thu`·`목`·`목요일`·`1,3,5`·`Mon,Thu` 가 실제로 들어 있다. 그래서 api-admin.ts 가
 *  `admDowMatches()`(+ADM_DOW_MAP)를 따로 두고 있다. 이 파일의 «가용성·충돌» 판정이
 *  단일 값만 보면, 그런 반복수업을 가진 강사가 후보 목록에 🟢(그 시간 가능)으로 나오고
 *  충돌검사도 통과해 **이중배정**이 된다(에러 없음). 그 판정을 한 곳으로 모은다.
 *  ⛔ api-admin 의 함수를 import 하지 않는다 — 이 파일은 다른 도메인을 import 하지 않는
 *     원칙이라(NOT_PLACEHOLDER 복제와 같은 방식) 같은 판정을 여기에 둔다.
 *     대신 substitute_assign_harness ①·⑦절이 두 판정을 실제로 돌려 답을 대조한다. */
const ENROLL_DOW_MAP: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};
export function enrollDowList(raw: any): number[] {
  const out: number[] = [];
  for (const part of String(raw ?? '').split(/[,\s/·]+/)) {
    const t = part.trim();
    if (!t) continue;
    if (/^\d+$/.test(t)) { const n = Number(t); if (n >= 0 && n <= 6 && !out.includes(n)) out.push(n); continue; }
    const dw = ENROLL_DOW_MAP[t.toLowerCase()];
    if (dw !== undefined && !out.includes(dw)) out.push(dw);
  }
  return out;
}

function subScheduleDow(scheduledDate: any, dayOfWeek: any, date: string): number | null {
  const targetDow = new Date(date + 'T00:00:00Z').getUTCDay();
  if (scheduledDate) return String(scheduledDate).slice(0, 10) === date ? targetDow : null;
  if (dayOfWeek != null && String(dayOfWeek).trim() !== '') {
    /* 판정은 위 enrollDowList 하나로 — 이 파일 안에서 «두 벌» 이 되면 또 갈린다. */
    return enrollDowList(dayOfWeek).includes(targetDow) ? targetDow : null;
  }
  return null;
}

/** 🔒 (2026-08-30 사장님 지시) 지사·대리점·지사본사는 **자기 소속 학생의 수업만** 대체 배정한다.
 *  차단이 아니라 «스코프로 자르기» 다 — 「우리 학원 강사가 병가」일 때 본사에 매번 요청하지 않아도 된다.
 *
 *  ⚠️ 이 API 는 `/api/pay/enroll/admin/*` 이라 `src/index.ts` 의 스코프 차단(`forbidden_scope`)
 *     **밖**이다(그 미들웨어는 `/api/admin/` 접두사에만 걸린다). 그래서 여기서 직접 자른다.
 *  ⚠️ 판정 기준은 「오늘 수업」 표(`/api/admin/classes/today`)와 **같아야 한다** — 그 화면은
 *     `scopeStudentCond(scope,'se')` 로 자른 목록을 보여 준다. 여기가 더 좁으면 «화면엔 있는데
 *     눌러도 안 되는 버튼» 이 되고, 더 넓으면 남의 학원 수업을 바꿀 수 있다.
 *  ⛔ 조건이 비면(스코프를 못 구했으면) **막는 쪽으로 실패한다** — 모르는 채로 열면 전국이 열린다.
 *  ℹ️ 본사(hq)·내부직원(none)은 `null` 을 돌려받아 그대로 통과한다. 강사는 이 함수 앞에서
 *     `actor.isTeacher` 로 이미 막혀 있다(그 가드를 이 안으로 옮기지 말 것 — 강사는 스코프가
 *     'none' 이라 여기서는 통과해 버린다. CLAUDE.md 「canEditOrg 로는 강사를 못 막는다」와 같은 뿌리). */
async function subScopeDenied(env: any, request: Request, actorRole: string, scheduleUserId: any): Promise<Response | null> {
  if (!isOrgScopedRole(actorRole)) return null;
  const deny = () => json({ ok: false, error: 'forbidden_scope', message: '우리 소속 학생의 수업만 대체 배정할 수 있습니다.' }, 403);
  try {
    const scope = await getScope(env, request);
    const c = scopeStudentCond(scope, 'se');
    if (!c.cond) return deny();                       // 조직 계정인데 조건이 비면 = 스코프 미상
    const uid = String(scheduleUserId || '').trim();
    if (!uid) return deny();                          // 학생이 안 붙은 행(자리표시 등)은 대상 아님
    const hit = await env.DB.prepare(
      `SELECT 1 AS ok FROM students_erp se WHERE se.user_id = ? AND (${c.cond}) LIMIT 1`
    ).bind(uid, ...c.binds).first();
    return hit ? null : deny();
  } catch (e) {
    console.warn('[enroll] subScopeDenied:', (e as any)?.message);
    return deny();                                    // 판정 자체가 실패해도 막는 쪽으로
  }
}

/** 🔄 (2026-08-28 trap-check 지적으로 추가) 대체강사가 "같은 날짜에 이미 다른 회차의
 *  대체로도" 잡혀 있는지 — enrollConflicts/teachersFreeAt 은 class_schedules 만 보므로
 *  class_substitutions 오버레이끼리의 겹침은 몰랐다(같은 강사가 같은 날 두 반의 대체로
 *  동시에 배정될 수 있었음). excludeScheduleId 는 "지금 편집 중인 그 회차 자신의 기존
 *  오버레이"를 스스로와의 충돌로 잘못 세지 않기 위함. */
async function subOverlayBusyIds(env: any, date: string, excludeScheduleId?: number): Promise<Map<string, { startMin: number; minutes: number }[]>> {
  const byTeacher = new Map<string, { startMin: number; minutes: number }[]>();
  try {
    const rs: any = await env.DB.prepare(
      /* ⚠️ (2026-08-30) 원 수업의 status 도 본다 — 오버레이만 'active' 로 보면 수업이 나중에
         취소돼도 그 대체가 남아 «그 시간 바쁨» 으로 잡힌다(그 강사가 후보에서 빠진다). */
      `SELECT cs2.schedule_id, cs2.substitute_teacher_id, cs.start_time, COALESCE(cs.duration_min,20) AS dm
         FROM class_substitutions cs2 JOIN class_schedules cs ON cs.id = cs2.schedule_id
        WHERE cs2.status = 'active' AND cs.status = 'active' AND cs2.sub_date = ?`
    ).bind(date).all();
    for (const r of ((rs?.results as any[]) || [])) {
      if (excludeScheduleId != null && Number(r.schedule_id) === excludeScheduleId) continue;
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s < 0) continue;
      const tid = String(r.substitute_teacher_id);
      if (!byTeacher.has(tid)) byTeacher.set(tid, []);
      byTeacher.get(tid)!.push({ startMin: s, minutes: Number(r.dm) || DEFAULT_CLASS_MINUTES });
    }
  } catch (e) { console.warn('[enroll] subOverlayBusyIds:', (e as any)?.message); }
  return byTeacher;
}

/** 위 맵에서 특정 강사가 그 시간대에 실제로 겹치는지. */
function subOverlayHasOverlap(byTeacher: Map<string, { startMin: number; minutes: number }[]>, teacherId: string, startMin: number, minutes: number): boolean {
  const slots = byTeacher.get(String(teacherId));
  if (!slots) return false;
  return slots.some((s) => enrollOverlap(startMin, minutes, s.startMin, s.minutes));
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
    // 🪑 (2026-08-17) 강사 1인당 «하루에 받을 긴 수업(20분 초과)» 정원. 0/NULL = 무제한(기존 동작).
    //   이미 만들어진 테이블에도 붙여야 하므로 ALTER 를 따로 돌린다(중복이면 무시).
    try { await env.DB.exec(`ALTER TABLE teacher_pricing ADD COLUMN long_class_daily_cap INTEGER DEFAULT 0`); } catch { /* duplicate column — 정상 */ }
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS enroll_holidays (day TEXT PRIMARY KEY, name TEXT, created_by TEXT, created_at INTEGER)`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS enroll_notify_log (uid TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, sent_at INTEGER, PRIMARY KEY (uid, kind, day))`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`);
    try { await env.DB.prepare(`ALTER TABLE payment_orders ADD COLUMN enroll_json TEXT`).run(); } catch (_) {}
    try { await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sched_teacher_slot ON class_schedules(teacher_id, scheduled_date, start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL`).run(); } catch (_) {}
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sched_user_date ON class_schedules(user_id, scheduled_date)`).run(); } catch (_) {}
    /* 🔄 (2026-08-28) 1회성 대체강사 배정 — "매주 반복 수업"의 정본 행(class_schedules)은 하루치
       예외를 기록할 칸이 없다(teacher_id 를 바꾸면 그 요일 전체가 영구히 바뀐다 — 그건 이미 있는
       /api/pay/enroll/admin/teacher-leave 의 몫). 이 표는 "그 날짜 하루만" 강사를 겹쳐 보여주는
       오버레이다 — class_schedules 의 teacher_id 는 손대지 않으므로 다음 주는 저절로 원래 강사로
       돌아간다. (schedule_id, sub_date) 는 한 쌍에 하루 한 명만 있어야 하므로 UNIQUE — 등록·취소는
       DELETE 없이 UPSERT 로 status 만 바꾼다(이력은 class_audit_log 가 따로 남긴다). */
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_substitutions (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL, sub_date TEXT NOT NULL, original_teacher_id TEXT, substitute_teacher_id TEXT NOT NULL, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, status TEXT NOT NULL DEFAULT 'active')`);
    try { await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS uq_class_sub_slot ON class_substitutions(schedule_id, sub_date)`).run(); } catch (_) {}
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_class_sub_date ON class_substitutions(sub_date, status)`).run(); } catch (_) {}
  } catch (e) { console.warn('[enroll] ensure tables:', (e as any)?.message); }
}

/* ═══════════════ 조회 헬퍼 ═══════════════ */

/** 학생 uid → 대리점(shop_name)과 주1회 단가 */
export async function priceForUid(env: any, uid: string): Promise<{ shopName: string; weekly1Price: number }> {
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
export async function teacherRateFor(env: any, teacherId: string): Promise<number> {
  try {
    const r: any = await env.DB.prepare(`SELECT rate_pct FROM teacher_pricing WHERE teacher_id = ? LIMIT 1`).bind(String(teacherId)).first();
    const pct = Number(r?.rate_pct || 100);
    if (pct >= 50 && pct <= 300) return pct / 100;
  } catch (_) {}
  return 1.0;
}

/** 공휴일 집합 (오늘 이후) */
export async function holidaySet(env: any, fromDay: string): Promise<Set<string>> {
  const s = new Set<string>();
  try {
    const rs: any = await env.DB.prepare(`SELECT day FROM enroll_holidays WHERE day >= ? LIMIT 500`).bind(fromDay).all();
    for (const r of ((rs?.results as any[]) || [])) s.add(String(r.day));
  } catch (_) {}
  return s;
}

/* 🟡 (2026-08-26 실사고) LMS·시드 «자리표시» 행은 충돌로 세지 않는다.
 *   class_schedules 활성 행의 대부분은 진짜 수업이 아니라 자리표시다(user_id='lms'·'type_seed' —
 *   schedule-conflict.ts 97행 주석과 같은 사정). 그런데 이 파일(수강신청 확정 전용 충돌검사)만
 *   그 제외를 빠뜨리고 있었다 — schedule-conflict.ts 의 «단 한 건 등록/이동» 충돌검사는
 *   2026-08-24 에 이미 고쳐졌는데, 「여러 날짜를 한꺼번에」 보는 이 파일의 검사기(enrollConflicts·
 *   busyTimesForTeacher·teachersFreeAt)는 원래도 서로 다른 검사기라(schedule-conflict.ts 22행
 *   주석 「목적이 달라 그대로 둔다」) 그 수리에 포함되지 않았다.
 *   실사고: FAR(mangoi_018)가 수요일 20:40 에 실제 수업이 없는데도 옛 LMS 자리표시 행 하나
 *   때문에 «다른 수업 있음» 으로 판정돼, 수강신청 확정에서 그 요일의 첫 4주가 «충돌» 로 건너뛰어졌다.
 *   ⚠️ 제외식은 schedule-conflict.ts·api-admin.ts·api-teacher.ts·churn-graph.ts 의
 *      `NOT IN ('lms','type_seed')` 와 **글자 하나까지 같게** 유지할 것.
 *   ⛔ 데이터는 지우지 않는다 — 되돌리려면 이 조건절만 빼면 된다. */
const NOT_PLACEHOLDER = `AND LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`;

/** 강사의 기존 수업과 충돌하는 날짜들 (날짜지정 + 요일반복 모두 검사)
 *  🕐 (2026-07-30) 요일별 다른 시간 지정 — 제보 #2-3. startMin(공통 시각) 하나 대신
 *  timesMinByDow(요일→분) 맵을 받는다 — 날짜마다 그 날의 요일에 맞는 시각으로 충돌을 검사한다.
 *  timesMinByDow 에 없는 요일(days 밖)은 건너뛴다. */
export async function enrollConflicts(env: any, teacherId: string, dates: string[], timesMinByDow: Record<number, number>, minutes: number, days: number[]): Promise<Set<string>> {
  const conflicts = new Set<string>();
  if (!dates.length) return conflicts;
  try {
    // D1 파라미터 한도 분할은 공용 selectInChunks 로 일원화(2026-08-07)
    const rows: any[] = await selectInChunks<any>(env.DB, dates,
      (ph) => `SELECT scheduled_date, start_time, COALESCE(duration_min, 20) AS dm FROM class_schedules
         WHERE teacher_id = ? AND status = 'active' AND scheduled_date IN (${ph}) ${NOT_PLACEHOLDER}`,
      { lead: [teacherId] });
    for (const r of rows) {
      const dow = new Date(String(r.scheduled_date) + 'T00:00:00Z').getUTCDay();
      const startMin = timesMinByDow[dow];
      if (startMin === undefined) continue;
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s >= 0 && enrollOverlap(startMin, minutes, s, Number(r.dm) || DEFAULT_CLASS_MINUTES)) conflicts.add(String(r.scheduled_date));
    }
    const rs2: any = await env.DB.prepare(
      `SELECT day_of_week, start_time, COALESCE(duration_min, 20) AS dm FROM class_schedules
       WHERE teacher_id = ? AND status = 'active' AND schedule_kind = 'recurring' AND day_of_week IS NOT NULL ${NOT_PLACEHOLDER}`
    ).bind(teacherId).all();
    const badDows = new Set<number>();
    for (const r of ((rs2?.results as any[]) || [])) {
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s < 0) continue;
      for (const dw of enrollDowList(r.day_of_week)) {          // '1,3,5'·'목' 도 받는다(위 enrollDowList)
        if (!days.includes(dw)) continue;
        const startMin = timesMinByDow[dw];
        if (startMin === undefined) continue;
        if (enrollOverlap(startMin, minutes, s, Number(r.dm) || DEFAULT_CLASS_MINUTES)) badDows.add(dw);
      }
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

/* 🕐 (2026-07-31) 시간 슬롯 전체 목록(06:00~23:40, 10분 단위) — 예약가능시간 필터링·강사프리 조회 공용 */
function allTimeSlots(): string[] {
  const out: string[] = [];
  for (let m = ENROLL_TIME_MIN; m <= ENROLL_TIME_MAX; m += 10) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

/** 특정 요일들에 대해, 앞으로 N주 안에 이미 잡힌 실제 날짜(그 요일들만) — 충돌 조회용 probe */
function probeDatesForDows(days: number[], weeks = 12): string[] {
  const out: string[] = [];
  const want = new Set(days);
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < weeks * 7 && out.length < weeks * days.length; i++) {
    if (want.has(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** 제보 #1 — 강사 선택 후 "이미 예약된 시간대"를 실제로 걸러낸다.
 *  단일 강사에 대해, 요청한 각 요일(dow)마다 이미 다른 학생 수업으로 막혀 있는 시간을 돌려준다.
 *  판정 기준: (a) 그 강사의 '고정 요일 수업'(recurring), (b) 앞으로 12주 안의 그 요일 실제 예약(dated) 중
 *  단 한 번이라도 겹치면 "막힘" — 매주 반복 예약이라 한 번이라도 안 되면 안전하게 막는다(보수적 판정). */
export async function busyTimesForTeacher(env: any, teacherId: string, days: number[], minutes: number): Promise<Record<number, string[]>> {
  const result: Record<number, string[]> = {};
  for (const d of days) result[d] = [];
  if (!teacherId || !days.length) return result;

  const busyByDow: Record<number, { start: number; dur: number }[]> = {};
  for (const d of days) busyByDow[d] = [];
  try {
    const rs1: any = await env.DB.prepare(
      `SELECT day_of_week, start_time, COALESCE(duration_min, 20) AS dm FROM class_schedules
       WHERE teacher_id = ? AND status = 'active' AND schedule_kind = 'recurring' AND day_of_week IS NOT NULL ${NOT_PLACEHOLDER}`
    ).bind(teacherId).all();
    for (const r of ((rs1?.results as any[]) || [])) {
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s < 0) continue;
      for (const dw of enrollDowList(r.day_of_week)) {          // '1,3,5'·'목' 도 받는다
        if (!busyByDow[dw]) continue;
        busyByDow[dw].push({ start: s, dur: Number(r.dm) || DEFAULT_CLASS_MINUTES });
      }
    }

    const probe = probeDatesForDows(days, 12);
    const probeRows: any[] = await selectInChunks<any>(env.DB, probe,
      (ph) => `SELECT scheduled_date, start_time, COALESCE(duration_min, 20) AS dm FROM class_schedules
         WHERE teacher_id = ? AND status = 'active' AND scheduled_date IN (${ph}) ${NOT_PLACEHOLDER}`,
      { lead: [teacherId] });
    for (const r of probeRows) {
      const dow = new Date(String(r.scheduled_date) + 'T00:00:00Z').getUTCDay();
      if (!busyByDow[dow]) continue;
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s >= 0) busyByDow[dow].push({ start: s, dur: Number(r.dm) || DEFAULT_CLASS_MINUTES });
    }
  } catch (e) { console.warn('[enroll] busyTimesForTeacher:', (e as any)?.message); }

  const slots = allTimeSlots();
  for (const d of days) {
    const busy = busyByDow[d];
    if (!busy.length) continue;
    result[d] = slots.filter((t) => {
      const startMin = enrollTimeToMin(t);
      return busy.some((b) => enrollOverlap(startMin, minutes, b.start, b.dur));
    });
  }
  return result;
}

/** 제보 #2 — "시간 먼저 선택" 모드. 요청한 요일·시각에 실제로 비어있는 강사 id 목록만 돌려준다.
 *  (busyTimesForTeacher 와 판정 기준 동일 — 12주 안에 한 번이라도 겹치면 그 강사는 제외) */
export async function teachersFreeAt(env: any, days: number[], timesMinByDow: Record<number, number>, minutes: number): Promise<Set<string>> {
  const busyTeacherIds = new Set<string>();
  try {
    const rs1: any = await env.DB.prepare(
      `SELECT teacher_id, day_of_week, start_time, COALESCE(duration_min, 20) AS dm FROM class_schedules
       WHERE status = 'active' AND schedule_kind = 'recurring' AND day_of_week IS NOT NULL ${NOT_PLACEHOLDER}`
    ).all();
    for (const r of ((rs1?.results as any[]) || [])) {
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s < 0) continue;
      for (const dw of enrollDowList(r.day_of_week)) {          // '1,3,5'·'목' 도 받는다
        if (!days.includes(dw)) continue;
        const startMin = timesMinByDow[dw];
        if (startMin === undefined) continue;
        if (enrollOverlap(startMin, minutes, s, Number(r.dm) || DEFAULT_CLASS_MINUTES)) busyTeacherIds.add(String(r.teacher_id));
      }
    }

    const probe = probeDatesForDows(days, 12);
    const probeRows: any[] = await selectInChunks<any>(env.DB, probe,
      (ph) => `SELECT teacher_id, scheduled_date, start_time, COALESCE(duration_min, 20) AS dm FROM class_schedules
         WHERE status = 'active' AND scheduled_date IN (${ph}) ${NOT_PLACEHOLDER}`);
    for (const r of probeRows) {
      const dow = new Date(String(r.scheduled_date) + 'T00:00:00Z').getUTCDay();
      const startMin = timesMinByDow[dow];
      if (startMin === undefined) continue;
      const s = enrollTimeToMin(String(r.start_time || ''));
      if (s >= 0 && enrollOverlap(startMin, minutes, s, Number(r.dm) || DEFAULT_CLASS_MINUTES)) busyTeacherIds.add(String(r.teacher_id));
    }
  } catch (e) { console.warn('[enroll] teachersFreeAt:', (e as any)?.message); }

  // 🪑 (2026-08-17) 긴 수업(20분 초과)이면 «하루 정원» 이 찬 강사도 뺀다.
  //   여기서 안 빼면 학생이 그 강사를 고른 뒤 결제 직전에 거절당한다 — 고르기 전에 지운다.
  if (isLongClass(minutes)) {
    try {
      const capRows: any = await env.DB.prepare(
        `SELECT teacher_id, COALESCE(long_class_daily_cap, 0) AS cap FROM teacher_pricing
          WHERE COALESCE(long_class_daily_cap, 0) > 0`
      ).all();
      const caps = new Map<string, number>();
      for (const r of ((capRows?.results as any[]) || [])) caps.set(String(r.teacher_id), Number(r.cap));
      if (DEFAULT_LONG_CLASS_DAILY_CAP > 0 || caps.size) {
        // 요일별 긴 수업 수 — 정원이 걸린 강사만 세면 되므로 한 번에 훑는다
        const rsL: any = await env.DB.prepare(
          `SELECT teacher_id, day_of_week, COALESCE(duration_min, 20) AS dm FROM class_schedules
            WHERE status = 'active' AND schedule_kind = 'recurring' AND day_of_week IS NOT NULL ${NOT_PLACEHOLDER}`
        ).all();
        const perTeacherDay = new Map<string, number>();
        for (const r of ((rsL?.results as any[]) || [])) {
          if (!isLongClass(Number(r.dm) || DEFAULT_CLASS_MINUTES)) continue;
          for (const dw of enrollDowList(r.day_of_week)) {      // '1,3,5'·'목' 도 받는다
            if (!days.includes(dw)) continue;
            const k = String(r.teacher_id) + '|' + dw;
            perTeacherDay.set(k, (perTeacherDay.get(k) || 0) + 1);
          }
        }
        for (const [k, n] of perTeacherDay) {
          const tid = k.split('|')[0];
          const cap = caps.get(tid) ?? DEFAULT_LONG_CLASS_DAILY_CAP;
          if (longClassCapReached(n, cap)) busyTeacherIds.add(tid);   // 하루라도 꽉 차면 뺀다
        }
      }
    } catch (e) { console.warn('[enroll] teachersFreeAt long-class cap:', (e as any)?.message); }
  }

  let allTeacherIds: string[] = [];
  try {
    const rs: any = await env.DB.prepare(`SELECT id FROM teachers WHERE active = 1`).all();
    allTeacherIds = ((rs?.results as any[]) || []).map((t) => String(t.id));
  } catch (e) { console.warn('[enroll] teachersFreeAt teachers list:', (e as any)?.message); }
  return new Set(allTeacherIds.filter((id) => !busyTeacherIds.has(id)));
}

/** 요청 본문 검증 → 정규화
 *  🕐 (2026-07-30) 요일별 다른 시간 지정 — 제보 #2-3.
 *  body.times = { "1":"19:00", "3":"20:00" } (요일 인덱스 → 'HH:MM') 형식을 우선 쓴다.
 *  구버전 호출(단일 body.time 문자열)은 모든 요일에 같은 시각을 적용하는 것으로 호환 처리. */
export function enrollParse(body: any): any {
  const weekly = Number(body?.weekly || 0);
  const months = Number(body?.months || 0);
  const minutes = Number(body?.minutes || 20);
  const startDate = String(body?.start_date || '').trim();
  const teacherId = String(body?.teacher_id || '').trim().slice(0, 40);
  const days: number[] = Array.isArray(body?.days)
    ? ([...new Set(body.days.map((x: any) => Number(x)))] as number[]).filter((n) => n >= 0 && n <= 6).sort()
    : [];
  if (!ENROLL_WEEKLY.includes(weekly)) return { error: 'bad_weekly' };
  if (!ENROLL_MONTHS.includes(months)) return { error: 'bad_months' };
  if (!ALLOWED_CLASS_MINUTES.includes(minutes)) return { error: 'bad_minutes' };
  if (days.length !== weekly) return { error: 'days_count_mismatch' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: 'bad_start_date' };
  if (startDate < kstToday()) return { error: 'start_date_past' };
  if (!teacherId) return { error: 'teacher_required' };

  const rawTimes = (body && typeof body.times === 'object' && body.times) ? body.times : null;
  const uniformTime = String(body?.time || '').trim();   // 구버전 호환
  // ⚠️ enroll_engine_harness.mjs 가 이 함수를 원문 그대로 뽑아 순수 JS로 실행한다 —
  //   그 스트리핑 정규식이 Record<..> 같은 제네릭은 못 지운다. 여기서는 타입 주석 없이 둘 것.
  const times = {};
  const timesMin = {};
  for (const d of days) {
    const t = rawTimes ? String(rawTimes[String(d)] ?? rawTimes[d] ?? '').trim() : uniformTime;
    const m = enrollTimeToMin(t);
    // 시작 시각은 격자 위에만 — 길이가 전부 격자의 배수라 이어 붙이면 빈틈이 0 이 된다
    if (m < ENROLL_TIME_MIN || m > ENROLL_TIME_MAX || m % CLASS_TIME_STEP_MIN !== 0) return { error: 'bad_time', day: d };
    times[d] = t;
    timesMin[d] = m;
  }
  return { weekly, months, minutes, startDate, teacherId, days, times, timesMin };
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
  /* 🕐 (2026-07-30) 요일별 다른 시간 — 제보 #2-3. ej.times = { "1":"19:00", "3":"20:00" }.
     구주문 호환: ej.times 가 없는 옛 주문(단일 ej.time)은 모든 요일에 그 시각을 적용한다. */
  const timesMap: Record<string, string> = (ej.times && typeof ej.times === 'object') ? ej.times : {};
  const fallbackTime = String(ej.time || '');
  const timesMinByDow: Record<number, number> = {};
  for (const d of ej.days as number[]) {
    const t = String(timesMap[String(d)] ?? timesMap[d] ?? fallbackTime);
    const m = enrollTimeToMin(t);
    if (m >= 0) timesMinByDow[d] = m;
  }
  if (!sessions || Object.keys(timesMinByDow).length !== ej.days.length) return;

  // 결제 시점 기준 재검사 — 주문~결제 사이에 찬 슬롯 + 공휴일을 함께 blocked 처리
  const probe = enrollDates(String(ej.start_date), ej.days, sessions * 2);
  const blocked = await enrollConflicts(env, String(ej.teacher_id), probe, timesMinByDow, Number(ej.minutes) || 20, ej.days);
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
  const batch: any[] = dates.map((d) => {
    const dow = new Date(d + 'T00:00:00Z').getUTCDay();
    const t = String(timesMap[String(dow)] ?? timesMap[dow] ?? fallbackTime);
    return stmt.bind(String(ej.uid), sName || null, d, t, Number(ej.minutes) || 20, String(ej.teacher_id), src, now, note);
  });
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

/** 🔁 이미 끝난 수강도 «같은 요일·시간» 으로 이어 받을 수 있는 기간 (2026-08-24 사장님 결정).
 *  재등록이 가장 필요한 순간이 «막 끝난 직후» 인데, 그때 연장 카드가 사라져 신규 폼을 처음부터
 *  다시 채워야 했다. 너무 넓히면 «반년 전 그만둔 학생» 에게 옛 강사·시간을 들이밀게 되므로 60일. */
export const ENROLL_RENEW_LOOKBACK_DAYS = 60;

/** 연장 수업의 시작일 — «마지막 수업 다음 날», 단 그날이 이미 지났으면 «오늘» 부터.
 *  ⚠️ 이 보정이 없으면 끝난 학생의 새 수업이 **과거 날짜로** 잡힌다(enrollDates 는 startDate 부터 센다). */
export function renewStartDate(lastDate: string, today?: string): string {
  const t = today || kstToday();
  const next = addDays(String(lastDate || ''), 1);
  return next > t ? next : t;
}

/** 학생의 현재 수강 상태 요약 (남은 회차·마지막 수업일·요일·시간·강사) */
export async function currentEnrollment(env: any, uid: string): Promise<any> {
  const today = kstToday();
  /* 🔁 (2026-08-24) 창을 60일로 넓혔다 — 미래 수업이 0건인 «끝난» 학생도 연장 대상으로 잡기 위해.
     ⚠️ 넓힌 창을 요일 추정에 그대로 쓰면 안 된다 — 도중에 요일을 바꾼 학생이 4일로 잡혀
        판정 불가가 된다. 추정 창은 아래에서 «마지막 수업일 기준 최근 14일» 로 다시 좁힌다
        (수강 중인 학생에게는 today 기준과 같아 기존 동작 그대로다). */
  const since = addDays(today, -ENROLL_RENEW_LOOKBACK_DAYS);
  const rs: any = await env.DB.prepare(
    `SELECT scheduled_date, start_time, COALESCE(duration_min,20) AS dm, teacher_id, source
     FROM class_schedules
     WHERE user_id = ? AND status = 'active' AND scheduled_date IS NOT NULL AND scheduled_date >= ?
     ORDER BY scheduled_date ASC LIMIT 800`
  ).bind(uid, since).all();
  const all = ((rs?.results as any[]) || []);
  if (!all.length) return { active: false, renewable: false, ended: false, remaining: 0 };
  const future = all.filter((r) => String(r.scheduled_date) >= today);
  const ended = future.length === 0;   // 미래 수업 0건 = 이미 끝난 수강(창 안에 과거 기록은 있다)

  const last = ended ? all[all.length - 1] : future[future.length - 1];
  // 요일·시간 추정 창 — 끝난 학생은 «마지막 수업일» 을 기준으로 최근 14일을 본다.
  const patFrom = addDays(ended ? String(last.scheduled_date) : today, -14);
  const pat = all.filter((r) => String(r.scheduled_date) >= patFrom);
  const days = inferWeeklyDays(pat.map((r) => String(r.scheduled_date)), future.map((r) => String(r.scheduled_date)));
  let teacherName = '';
  try {
    const t: any = await env.DB.prepare(`SELECT name FROM teachers WHERE id = ? LIMIT 1`).bind(String(last.teacher_id)).first();
    teacherName = String(t?.name || '');
  } catch (_) {}

  /* 🕐 (2026-07-30) 요일별 시간 추정 — 제보 #2-3. days 추정과 같은 원리·같은 데이터(과거14일+미래).
     요일별로 실제 등록된 시각을 모으고, 배열을 시간순(ASC)으로 훑으므로 나중 값이 그 요일의 최신 시각이 된다.
     ⚠️ days 에 있는 요일 전부가 시간을 얻지 못하면(그 요일 수업이 이미 다 소진돼 남은 행이 없는 경우 등)
        '연장 결제'를 진행하면 안 된다 — days_resolved 와 같은 이유로 추측 청구를 막는다. */
  const timesByDow: Record<number, string> = {};
  for (const r of pat) {   // ⚠️ all(60일) 이 아니라 추정 창 — 옛 시간이 최신을 덮지 않게
    const dow = new Date(String(r.scheduled_date) + 'T00:00:00Z').getUTCDay();
    const t = String(r.start_time || '');
    if (enrollTimeToMin(t) >= 0) timesByDow[dow] = t;
  }
  const timesResolved = !!days && days.every((d) => timesByDow[d] !== undefined);
  const times: Record<number, string> = {};
  if (timesResolved) for (const d of (days as number[])) times[d] = timesByDow[d];

  return {
    active: !ended,                       // 뜻 유지: «앞으로 남은 수업이 있다»
    ended,                                // 🔁 이미 끝났지만 60일 안이라 이어받을 수 있다
    renewable: true,                      // 화면·서버가 «연장 카드를 열까» 판정할 때 보는 값
    days_since_end: ended ? daysBetween(String(last.scheduled_date), today) : 0,
    remaining: future.length,
    next_date: ended ? '' : String(future[0].scheduled_date),
    last_date: String(last.scheduled_date),
    days: days || [],
    days_resolved: !!days,               // false 면 화면이 연장 카드를 숨기고 신규 신청으로 안내
    times,                                // { 요일: 'HH:MM' } — days_resolved && times_resolved 일 때만 신뢰
    times_resolved: timesResolved,
    time: String(last.start_time || ''), // 구버전 호환(단일 표시용) — 새 로직은 times 를 쓸 것
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

      /* 📞 전화번호는 판정 정본 `phonesForStudent`(notify-contacts.ts) 하나로 찾는다 (2026-09-15).
         ⛔ 여기서 `students_erp` 를 직접 읽어 번호를 «정하지» 말 것 — 카페24 원본에 번호가 없어
            그 칸은 실측 0건이고(2026-09-15, 29,496행), 우리 화면에서 받은 번호는
            `student_erp_override` 에 있다. 정본이 그 둘을 «override 먼저» 로 본다.
            ℹ️ 명부 칸이 «밤에 덮이던» 것은 2026-09-15 에 막혔다(#995, cafe24-sync.ts) —
               그래도 정본을 지나는 것이 맞다. override 는 «우리가 받은 값» 이라 카페24가 나중에
               번호를 채워도 뜻이 갈리지 않고, 판정이 한 곳에 남는다.
            이 배선이 없던 동안 이 안내는 번호를 못 찾아 계속 skip 됐다
            (2026-09-15 실측: 그날 23건 시도 / 번호를 찾은 학생 1명).
         ⚠️ 학부모 번호가 없으면 학생 번호로 보내는 기존 동작은 그대로 지킨다.
         ⚠️ **대상이 조금 넓어졌다**(둘 다 «더 보내는» 방향): 옛 `COALESCE(parent_phone, phone)` 는
            `student_phone` 을 아예 안 봤고, `parent_phone` 이 **빈 문자열**이면 그것을 반환해
            `phone` 으로 못 떨어졌다. 정본은 둘을 모두 본다(실측상 `student_phone` 은 0건이라 오늘 반경 ~0).
         ⚠️ 정본이 실패하면 아래 명부 조회로 떨어져 «고치기 전» 과 똑같이 동작한다(fail-open). */
      let phone = '', name = '';
      try {
        const p = await phonesForStudent(env, uid);
        phone = String(p.parent || p.student || '').replace(/[^0-9]/g, '');
      } catch (_) { /* fail-open — 아래 명부 조회가 받는다 */ }
      try {
        const s: any = await env.DB.prepare(
          `SELECT COALESCE(parent_phone, phone) AS ph, COALESCE(korean_name, english_name, username) AS nm
           FROM students_erp WHERE user_id = ? LIMIT 1`
        ).bind(uid).first();
        /* ⚠️ 폴백 기준을 «비었나» 가 아니라 **아래 발송 게이트와 «같은» 10자리**로 맞춘다.
              `normPhone`(notify-contacts.ts)은 9자리도 통과시키므로, «비었나» 로 물으면
              9자리 override 하나가 명부의 멀쩡한 11자리를 가로막고 그대로 skip 된다
              (= 이 수리가 «되던 것» 을 깨는 유일한 방향. 2026-09-15 함정 대조 지적). */
        if (phone.length < 10) phone = String(s?.ph || '').replace(/[^0-9]/g, '');
        name = String(s?.nm || '');
      } catch (_) {}
      await env.DB.prepare(`INSERT OR REPLACE INTO enroll_notify_log (uid, kind, day, sent_at) VALUES (?,?,?,?)`).bind(uid, kind, today, Date.now()).run();
      if (phone.length < 10) { out.skipped++; continue; }

      const txt = `[망고아이] ${name ? name + ' 학생 ' : ''}수업이 ${left}일 후(${lastDate}) 종료됩니다.\n같은 요일·시간·선생님으로 이어서 수강하시려면 아래에서 연장해 주세요 🥭\n${siteUrl('/enroll.html')}`;
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
  // 이름·연락처 붙이기 (D1 파라미터 한도 → 공용 selectInChunks 로 분할)
  const info: Record<string, any> = {};
  const uids = rows.map((r) => String(r.user_id));
  // 이름은 부가 정보라 조회 실패해도 목록 자체는 내보낸다(기존 try/catch 동작 유지)
  const infoRows = await selectInChunks<any>(env.DB, uids,
    (ph) => `SELECT user_id, COALESCE(korean_name, english_name, username) AS nm, shop_name FROM students_erp WHERE user_id IN (${ph})`,
    { swallowErrors: true });
  for (const s of infoRows) info[String(s.user_id)] = s;
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

/* ═══════════════ 🎌 공휴일 한 곳으로 (2026-09-25 사장님 «D → 공휴일 한 곳 → C») ═══════════════
   [무엇이 문제였나] 공휴일을 적는 곳이 세 군데이고 **표가 셋**이다 —
     · 수강 운영 › 공휴일            → enroll_holidays   ← 새벽 6시 «공휴일 수업 뒤로 밀기»가 읽는 «유일한» 표
     · 강사 › 시간표·근무 › 캘린더   → calendar_events (event_type='holiday')
     · 운영 인프라 모듈 ③            → holidays (modules-ext.ts)
   ⟹ 캘린더에만 넣은 공휴일은 **수업이 안 밀린다**(에러 없음).
   [무엇을 했나] «수업 밀기» 의 정본은 enroll_holidays 하나로 정하고, 캘린더에만 있는 한국 공휴일을
     찾아 **사람이 눌러서** 그 표에 옮기게 한다(아래 함수 + 화면의 «옮기기» 버튼).
   ⛔ 캘린더 공휴일을 cron 이 «자동으로» 읽게 하지 말 것 — 캘린더에는 필리핀 공휴일도 있고
      «2026 공휴일 자동 채우기» 한 번에 20여 일이 한꺼번에 «수업 밀기» 대상이 된다(되돌리기 어려운
      수업 이동이 사람 확인 없이 일어난다). 사람이 고른 날만 옮긴다.
   ⛔ 필리핀(PH) 공휴일은 후보에서 뺀다 — 학생 수업을 미는 날이 아니라 강사 쪽 사정이다.
   ⚠️ 국가 칸이 빈(수동 등록) 공휴일은 후보에 «넣되» 국가를 모름으로 표시한다 — 사람이 보고 고른다.
   ⚠️ 표가 없거나(캘린더를 한 번도 안 연 환경) 조회가 실패하면 ok:false 로 «모름» 을 돌려준다.
      빈 배열을 «없다» 로 돌려주면 «못 물어봤다» 가 «다 옮겼다» 로 읽힌다. */
/* 📌 (2026-09-25 후속) 세 번째 표 holidays(운영 인프라 모듈 — Nager.Date 에서 받아 오는 «국가 공식»
   공휴일)도 후보에 합친다. 캘린더에 사람이 안 적었어도 «공식 공휴일인데 수업이 안 밀리는» 날을 보여 준다.
   · 두 원천을 «따로» 묻는다 — 한쪽 표가 없거나 실패해도 다른 쪽 결과는 보여 준다.
   · 둘 다 실패하면 ok:false(«모름»). 하나만 실패하면 ok:true + failed:[그 원천] — 화면이 «일부만 대조» 라 말한다.
   · src: 'calendar'(캘린더) · 'official'(공식 공휴일) · 'both'. 같은 날은 한 줄로 합친다(이름은 캘린더 우선 — 사람이 적은 말). */
export type HolidayMissing = { day: string; name: string; country: string; src: 'calendar' | 'official' | 'both' };
export async function calendarHolidaysMissing(env: any, today: string): Promise<{ ok: boolean; items: HolidayMissing[]; failed?: string[]; error?: string }> {
  const byDay = new Map<string, HolidayMissing>();
  const failed: string[] = [];
  const errs: string[] = [];
  const dayOk = (d: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  try {
    const rs: any = await env.DB.prepare(
      `SELECT c.date AS day, MIN(c.title) AS name, MIN(COALESCE(c.country, '')) AS country
         FROM calendar_events c
        WHERE c.event_type = 'holiday'
          AND (c.country = 'KR' OR c.country IS NULL OR c.country = '')
          AND c.date >= ?
          AND NOT EXISTS (SELECT 1 FROM enroll_holidays h WHERE h.day = c.date)
        GROUP BY c.date
        ORDER BY c.date ASC LIMIT 60`
    ).bind(today).all();
    for (const r of ((rs?.results as any[]) || [])) {
      if (!dayOk(r.day)) continue;
      byDay.set(String(r.day), { day: String(r.day), name: String(r.name || ''), country: String(r.country || ''), src: 'calendar' });
    }
  } catch (e) { failed.push('calendar'); errs.push(String((e as any)?.message || e).slice(0, 80)); }
  try {
    const rs: any = await env.DB.prepare(
      `SELECT o.date AS day, MIN(o.name) AS name
         FROM holidays o
        WHERE o.country = 'KR'
          AND o.date >= ?
          AND NOT EXISTS (SELECT 1 FROM enroll_holidays h WHERE h.day = o.date)
        GROUP BY o.date
        ORDER BY o.date ASC LIMIT 60`
    ).bind(today).all();
    for (const r of ((rs?.results as any[]) || [])) {
      if (!dayOk(r.day)) continue;
      const d = String(r.day);
      const had = byDay.get(d);
      if (had) { had.src = 'both'; if (!had.country) had.country = 'KR'; }
      else byDay.set(d, { day: d, name: String(r.name || ''), country: 'KR', src: 'official' });
    }
  } catch (e) { failed.push('official'); errs.push(String((e as any)?.message || e).slice(0, 80)); }
  if (failed.length >= 2) return { ok: false, items: [], failed, error: errs.join(' / ').slice(0, 120) };
  const items = [...byDay.values()].sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0)).slice(0, 60);
  return failed.length ? { ok: true, items, failed } : { ok: true, items };
}

/* ═══════════════ 📋 오늘 할 일 요약 (2026-09-25 — 제안서 C안) ═══════════════
   수강 운영 화면의 첫 탭. «무엇을 먼저 해야 하나» 를 한 번의 요청으로 돌려준다.
   ✅ 새 판정을 만들지 않는다 — 이미 있는 함수(endingSoonList · runEnrollExpirySweep(dry))를
      그대로 부르고 «건수» 만 모은다. 각 칸은 따로 try — 한 칸이 실패해도 나머지는 보인다.
   ⛔ 실패한 칸을 0 으로 채우지 말 것 — { error } 로 돌려 화면이 «확인 못 함» 이라고 말하게 한다
      (0 은 «오늘 할 일 없음» 으로 읽힌다).
   ⛔ 공휴일 이동은 runHolidayShiftSweep(dry) 를 부르지 않는다 — 공휴일마다 수업 300건×충돌검사라
      첫 화면에 무겁다. 여기서는 «그날 걸린 수업 수» 만 센다(이동 미리보기는 자동 문자 탭에 그대로).
   ⚠️ 강사 휴가는 캘린더(calendar_events.vacation)에 «적힌 것» 만 보여준다. 그 휴가에 걸린 수업을
      찾으려면 teacher_name 으로 수업표를 이어야 하는데, 강사 이름이 세 벌이라 남의 수업이 붙을 수
      있다(CLAUDE.md 「남의 이름이 뜸」). 그래서 «비는 수업 N건» 을 지어내지 않고 «휴가 N건 — 넘겼는지
      확인» 까지만 말한다. */
async function enrollTodoSummary(env: any): Promise<any> {
  const today = kstToday();
  const out: any = { ok: true, today };
  try {
    const l = await endingSoonList(env, ENROLL_END_DAYS);
    out.ending = {
      days: ENROLL_END_DAYS,
      count: l.students.length,
      top: l.students.slice(0, 3).map((s: any) => ({ name: s.name || s.user_id, days: s.days_since })),
    };
  } catch (e) { out.ending = { error: String((e as any)?.message || e).slice(0, 120) }; }

  try {
    const r = await runEnrollExpirySweep(env, { dry: true });
    if (r && r.ok) {
      const due = (r.due || []) as any[];
      out.expiry = { count: due.length, exp7: due.filter((d) => d.kind === 'exp7').length, exp3: due.filter((d) => d.kind === 'exp3').length };
    } else out.expiry = { error: String(r?.error || 'failed').slice(0, 120) };
  } catch (e) { out.expiry = { error: String((e as any)?.message || e).slice(0, 120) }; }

  try {
    const hs: any = await env.DB.prepare(
      `SELECT day, name FROM enroll_holidays WHERE day >= ? AND day <= ? ORDER BY day ASC LIMIT 20`
    ).bind(today, addDays(today, 30)).all();
    const days = ((hs?.results as any[]) || []).map((r) => ({ day: String(r.day), name: String(r.name || '') }));
    let classes = 0;
    if (days.length) {
      /* 날짜 목록은 «콤마 문자열 한 개» 로 바인딩한다(D1 바인드 100개 한도 — 자리표시자를 날짜 수만큼 만들지 않는다) */
      const csv = ',' + days.map((d) => d.day).join(',') + ',';
      const c: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM class_schedules WHERE status='active' AND scheduled_date IS NOT NULL AND instr(?, ',' || scheduled_date || ',') > 0`
      ).bind(csv).first();
      classes = Number(c?.n || 0);
    }
    out.holidays = { next: days.slice(0, 3), count: days.length, classes };
  } catch (e) { out.holidays = { error: String((e as any)?.message || e).slice(0, 120) }; }

  const miss = await calendarHolidaysMissing(env, today);
  out.calendar_missing = miss.ok ? { count: miss.items.length, top: miss.items.slice(0, 3), failed: miss.failed || [] } : { error: miss.error || 'failed' };

  try {
    const vs: any = await env.DB.prepare(
      `SELECT date, end_date, teacher_name, title FROM calendar_events
        WHERE event_type = 'vacation' AND date <= ? AND COALESCE(end_date, date) >= ?
        ORDER BY date ASC LIMIT 20`
    ).bind(addDays(today, 14), today).all();
    const items = ((vs?.results as any[]) || []).map((r) => ({
      date: String(r.date || ''), end_date: String(r.end_date || ''),
      teacher: String(r.teacher_name || ''), title: String(r.title || ''),
    }));
    out.vacations = { count: items.length, items: items.slice(0, 5) };
  } catch (e) { out.vacations = { error: String((e as any)?.message || e).slice(0, 120) }; }

  return out;
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
          const conf = tid ? await enrollConflicts(env, tid, [cand], { [dow]: startMin }, Number(r.dm) || 20, [dow]) : new Set<string>();
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
          /* 📜 (2026-08-12) 자동 연기가 이력에 안 남던 자리. 사람이 누른 연기는 남는데
             «시스템이 옮긴 것» 만 빈칸이라, 학부모가 「왜 날짜가 바뀌었냐」 물으면
             notes 문자열 말고는 근거가 없었다. actor 는 system — 사람이 한 일이 아니다. */
          await writeClassAudit(env, {
            action: 'reschedule', schedule_id: r.id, student_name: (r as any).student_name || null,
            lesson_date: hday, lesson_time: String((r as any).start_time || '') || null,
            actor: 'system', actor_role: 'system', source: 'holiday-auto',
            reason: `공휴일(${hday}) 자동 연기`,
            detail: JSON.stringify({ from: hday, to: target }),
          });
        } catch (e) { out.failed++; }
      }
    }
  } catch (e) { out.ok = false; out.error = String((e as any)?.message || e); }
  return out;
}

/* ═══════════════ 라우터 ═══════════════ */

/** 🔒 `/api/pay/enroll/admin/*` 중 **자기 게이트를 이미 가진** 경로.
 *  ⛔ 여기에 경로를 더하는 것은 「본사 전용에서 뺀다」는 뜻이다 — 그 경로가 스스로
 *     강사·조직 계정을 막는지 확인한 뒤에만 넣을 것. */
const ENROLL_ADMIN_SELF_GATED = new Set([
  /* 이 둘은 2026-08-30 사장님 지시로 «차단» 이 아니라 «스코프로 자르기» 를 택한
     자리다(subScopeDenied). 조직 계정이 「오늘 수업」 카드에서 실제로 쓰고 있다. */
  '/api/pay/enroll/admin/substitute-candidates',
  '/api/pay/enroll/admin/substitute',
  /* 📅 (2026-09-23) 연기·변경 창의 «새 시간에 되는 강사» — 읽기 전용이고 위 둘과 같은 게이트
     (강사 차단 + subScopeDenied)를 스스로 건다. 조직 계정도 「오늘 수업」 에서 옮기기를 쓰므로. */
  '/api/pay/enroll/admin/move-candidates',
  /* 🔄 (2026-09-23) «변경(앞으로 계속)» — 이어지는 회차를 한꺼번에 옮긴다. 한 회 옮기기(/decide)와
     같은 게이트(강사 차단 + subScopeDenied)를 스스로 건다. 담당 강사까지 바꾸는 요청은 안에서
     한 번 더 본사 전용(teacherMoveDenyReason — PATCH 와 같은 정본)으로 막는다. */
  '/api/pay/enroll/admin/series-move',
]);

/** 🔒 본사(내부 계정)만 통과. 강사·지사·대리점·지사본사는 403.
 *
 *  🔴 «모른다» 를 «본사» 로 읽지 않는 것이 이 함수의 핵심이다.
 *     `getAdminActor()` 는 스코프를 «못 구해도» `scopeType='none'` 으로 떨어지고,
 *     `resolveRole('none', …)` 이 그것을 **`staff`(본사 동급)** 으로 판정한다.
 *     ⚠️ 그 자리는 `auth-admin.ts` 의 try/catch «만» 이 아니다 — `getScope()` 안의
 *        D1 접근이 전부 `s_safe`(scope.ts)로 감싸여 있어 **던지지 않고 조용히 null 을**
 *        돌려주고, 그러면 `autoSeedOne()` 이 이름으로 추측하며 이름마저 못 읽으면
 *        `type='none'` 이다. ⛔ 그러니 그 try/catch 를 걷어내는 것으로는 «고쳤다» 가 아니다.
 *     ⟹ `isOrgScopedRole(actor.role)` «하나만» 보면 D1 이 한 번 흔들릴 때
 *        지사 계정이 그대로 통과한다 — 이 함수가 막으려던 바로 그 일이다.
 *        (CLAUDE.md 「가드에 필요한 값을 safe(…, null) 로 조회하면 fail-open」)
 *  ✅ 그래서 근거(`admin_scope.scope_type`)를 **삼키지 않고** 한 번 더 읽고,
 *     못 읽으면 «모름» 으로 **막는 쪽으로** 실패한다. 이 경로에는 학부모에게
 *     문자를 보내는 스윕·하루치 수업의 강사 변경이 있어 «되돌릴 수 없는» 쪽이다.
 *  ℹ️ 행이 없을 걱정은 안 해도 된다 — 바로 위 `getAdminActor()` 가 `getScope()` 를
 *     부르고, 그것이 행이 없으면 `autoSeedOne()` 으로 **심어 놓는다**.
 *     그러고도 없으면 심기까지 실패한 것이라 그때도 막는 쪽이 맞다.
 *     (2026-09-10 실측: 계정 49개 중 4개가 `admin_scope` 행이 없었고 전부
 *      이름으로 정확히 추측됐다 — 즉 평소에는 잘 돌고 흔들릴 때만 샌다)
 *  🪤 **이 재조회로도 «못» 막는 변종이 하나 있다** — `autoSeedOne()` 은 이름을 못 읽어
 *     `type='none'` 이 된 값을 `INSERT OR IGNORE` 로 **admin_scope 에 영구히 심는다.**
 *     그 뒤로는 이 재조회가 그 'none' 을 «정상적으로» 읽어 통과시킨다. 즉 여기서 막는
 *     것은 «못 읽는 순간» 이지 «잘못 심긴 값» 이 아니다. 정본 수리는 `autoSeedOne` 이
 *     «이름을 못 읽었으면 아무것도 안 쓰게» 하는 쪽인데 반경이 있어 **사람이 정할 일**
 *     이다(2026-09-10 함정 대조 지적). ⚠️ 그 조건에 닿을 수 있는 것은 `admin_scope` 행이
 *     없는 넷 중 조직 계정 둘(`agency_sc002`·`capitown`)이다.
 *  ⚠️ 판정을 여기서 복제하지 않는다 — «조직인가» 는 정본 `isOrgScopedRole()` 이 답한다. */
export async function enrollAdminHqOnly(request: Request, env: any): Promise<Response | null> {
  const actor = await getAdminActor(request, env as any);
  if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
  const denyTeacher = () => json(forbiddenTeacherBody(actor, '강사 권한으로는 사용할 수 없는 기능입니다.'), 403);
  if (actor.isTeacher) return denyTeacher();

  let scopeType: string | null = null;
  try {
    const r: any = await env.DB.prepare(
      `SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`
    ).bind(actor.username).first();
    /* 행이 없거나 칸이 비어 있으면 null — 둘 다 «모름» 으로 다룬다. */
    const st = r ? String(r.scope_type ?? '').trim() : '';
    scopeType = st || null;
  } catch (e) {
    console.warn('[enroll] enrollAdminHqOnly scope:', (e as any)?.message);
    scopeType = null;
  }
  if (scopeType === null) {
    return json({ ok: false, error: 'scope_unknown', message: '권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 403);
  }
  /* 이름 기반 강사 판정을 못 탄 계정까지 여기서 한 번 더 막는다. */
  if (scopeType === 'teacher') return denyTeacher();
  if (isOrgScopedRole(scopeType)) {
    return json({ ok: false, error: 'forbidden_scope', message: '본사만 사용할 수 있는 기능입니다.' }, 403);
  }
  return null;
}

export async function handleEnrollApi(request: Request, url: URL, env: any): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/pay/enroll/')) return null;
  await ensureEnrollTables(env);

  /* ══ 🔒 (2026-09-10 사장님 「수강 운영 게이트 달아줘」) ═══════════════════════
     「수강 운영」(/enroll-ops.html)·「대리점 단가」(/enroll-pricing.html)가 부르는
     `/api/pay/enroll/admin/*` 는 **본사 전용**이다. 그런데 그동안 게이트가
     `checkAdminSession` 하나뿐이라 **로그인한 강사·지사·대리점이 그대로 실행**했다.

     ⚠️ 왜 미들웨어가 안 잡았나 — `src/index.ts` 의 강사 차단(TEACHER_BLOCKED_PREFIXES)과
        스코프 차단(forbidden_scope)은 **`/api/admin/` 접두사에만** 걸린다. 이 경로는
        `/api/pay/` 밑이라 그 둘을 통째로 비켜 간다(같은 사정이 이 파일
        `subScopeDenied` 주석에도 적혀 있다).
     ⚠️ `admin_write_guard_harness` 도 `/api/admin/*` 만 훑는다 — 그래서 이 구멍이
        「강사가 부를 수 있는 새 쓰기 API」 감시에 한 번도 안 걸렸다.

     [잰 것 — 2026-09-10] 열려 있던 것: 활성 강사 300명의 이름·급여 배율·긴 수업
       정원 읽기/쓰기 · 회사 전체 공휴일 등록·삭제 · 전국 만료 임박 학생 명단 ·
       하루치 수업의 담당 강사 통째 변경 · **학부모에게 문자를 실제로 보내는 스윕**
       (expiry-sweep?dry=0) · 환불 계산 · 전국 학원별 단가 읽기/쓰기.

     ✅ 제외 목록 방식이다 — 이 접두사에 새 엔드포인트가 생기면 아무것도 안 해도
        본사 전용이 된다. 허용 목록으로 짰다면 새 API 가 조용히 열린 채 나간다 —
        이 파일이 방금 그래서 뚫려 있었다.
     ⚠️ 화면 감추기는 짝이다 — 사이드바 「수강 운영」 항목에도 같은 날 `hideFrom` 을
        달았다(js/adm-ia6.js). 서버만 있으면 «눌러도 안 되는 버튼» 이 남고,
        화면만 있으면 URL 로 뚫린다(CLAUDE.md). */
  if (path.startsWith('/api/pay/enroll/admin/') && !ENROLL_ADMIN_SELF_GATED.has(path)) {
    const denied = await enrollAdminHqOnly(request, env);
    if (denied) return denied;
  }

  /* ── (a) 강사 목록 (공개 — 이름·사진·MBTI) ── */
  //   🔗 (2026-07-30) 제보 #2-1: teachers(급여·스케줄용)엔 사진·MBTI 컬럼이 아예 없다.
  //   실제 사진/MBTI는 teacher_profiles 에 있는데, 이름으로 자동 매칭이 안 돼(29명 중 1명만 일치)
  //   teacher_profiles.linked_teacher_id(관리자가 수동 연결) 로 LEFT JOIN 한다. 연결 안 된 강사는
  //   photo/mbti 가 빈 값으로 오고(기존처럼 이모지 폴백), 배정·가격 로직(teachers.id 기준)은 그대로.
  if (path === '/api/pay/enroll/teachers' && method === 'GET') {
    let rows: any[] = [];
    try {
      const rs: any = await env.DB.prepare(
        `SELECT t.id, t.name, tp.image_url AS photo_url, tp.mbti, tp.intro_video_url
           FROM teachers t
           LEFT JOIN teacher_profiles tp ON tp.linked_teacher_id = t.id
          WHERE t.active = 1 ORDER BY t.name ASC LIMIT 200`
      ).all();
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
    return json({ ok: true, teachers: rows.map((t) => ({
      id: String(t.id), name: String(t.name || ''),
      photo: String(t.photo_url || ''), mbti: String(t.mbti || ''),
      intro_video_url: String(t.intro_video_url || ''),
      rate_pct: rates[String(t.id)] || 100,
    })) });
  }

  /* ── (b) 가격 견적 (공개) ── */
  if (path === '/api/pay/enroll/quote' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    let uid = String(body.uid || '').trim();
    /* 🔗 문자 갱신 링크(RT)로 온 비로그인 화면은 uid 를 모른다(빈 값으로 온다).
       그대로 두면 priceForUid('') 가 본사 기본단가로 계산되는데, 실제 결제(renew-order)는
       토큰으로 uid 를 풀어 대리점 단가(agency_pricing)를 쓴다 — «카드에는 A원, 결제창에는
       B원» 이 되는 결제 신뢰 사고. 견적도 같은 토큰으로 uid 를 해석해 같은 단가를 쓴다. */
    if (!uid) {
      const rtScope = await resolveRenewToken(env, url, body, request);
      if (rtScope) uid = rtScope.uid;
    }
    const weekly = Number(body.weekly || 0), months = Number(body.months || 0), minutes = Number(body.minutes || 20);
    if (!ENROLL_WEEKLY.includes(weekly) || !ENROLL_MONTHS.includes(months) || !ALLOWED_CLASS_MINUTES.includes(minutes)) {
      return json({ ok: false, error: 'bad_options' }, 400);
    }
    const { shopName, weekly1Price } = await priceForUid(env, uid);
    const tRate = body.teacher_id ? await teacherRateFor(env, String(body.teacher_id)) : 1.0;
    const q = enrollQuoteCalc(weekly1Price, weekly, months, minutes, tRate);
    return json({
      ok: true, shop_name: shopName || null, weekly1_price: weekly1Price, teacher_rate: tRate, ...q,
      name: `주${weekly}회 × ${months}개월 (${q.sessions}회${minutes !== DEFAULT_CLASS_MINUTES ? '·' + minutes + '분' : ''})`,
    });
  }

  /* ── (b-1) 강사별 이미 예약된 시간대 (공개) — 제보 #1. 요일 선택 후 시간 select 에서 막힌 시간 비활성화용 ── */
  if (path === '/api/pay/enroll/busy-times' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const teacherId = String(body.teacher_id || '').trim();
    const days: number[] = Array.isArray(body.days) ? ([...new Set(body.days.map((x: any) => Number(x)))] as number[]).filter((n) => n >= 0 && n <= 6) : [];
    const minutes = Number(body.minutes || 20);
    if (!teacherId || !days.length || !ALLOWED_CLASS_MINUTES.includes(minutes)) return json({ ok: false, error: 'bad_params' }, 400);
    const busy = await busyTimesForTeacher(env, teacherId, days, minutes);
    return json({ ok: true, busy });
  }

  /* ── (b-2) 시간 먼저 선택 → 그 시간에 비어있는 강사만 (공개) — 제보 #2 ── */
  if (path === '/api/pay/enroll/teachers-free-at' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const days: number[] = Array.isArray(body.days) ? ([...new Set(body.days.map((x: any) => Number(x)))] as number[]).filter((n) => n >= 0 && n <= 6) : [];
    const minutes = Number(body.minutes || 20);
    const uniformTime = String(body.time || '').trim();
    const rawTimes = (body && typeof body.times === 'object' && body.times) ? body.times : null;
    if (!days.length || !ALLOWED_CLASS_MINUTES.includes(minutes)) return json({ ok: false, error: 'bad_params' }, 400);
    const timesMin: Record<number, number> = {};
    for (const d of days) {
      const t = rawTimes ? String(rawTimes[String(d)] ?? rawTimes[d] ?? '').trim() : uniformTime;
      const m = enrollTimeToMin(t);
      if (m < 0) return json({ ok: false, error: 'bad_time', day: d }, 400);
      timesMin[d] = m;
    }
    const freeIds = await teachersFreeAt(env, days, timesMin, minutes);
    return json({ ok: true, teacher_ids: Array.from(freeIds) });
  }

  /* ── (c) 슬롯 가능 여부 (공개 — 충돌 건수만, 강사 시간표 비노출) ── */
  if (path === '/api/pay/enroll/check' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    const p = enrollParse(body);
    if (p.error) return json({ ok: false, error: p.error }, 400);
    const sessions = p.weekly * 4 * p.months;
    const hol = await holidaySet(env, p.startDate);
    const probe = enrollDates(p.startDate, p.days, sessions * 2);
    const conflicts = await enrollConflicts(env, p.teacherId, probe, p.timesMin, p.minutes, p.days);
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
    const authUid = await authUidOrAdminSession(request, url, env, body);
    if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
    if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
    const p = enrollParse(body);
    if (p.error) return json({ ok: false, error: p.error }, 400);
    return await createEnrollOrder(env, uid, p, 'new');
  }

  /* ── (e) 내 수강 현황 (본인 인증) — 연장 화면용 ──
       🔗 (2026-08-18) 문자로 받은 1회용 링크(?rt=)도 받는다. 그 경우 uid 는 클라이언트가
          보낸 값이 아니라 **토큰이 가리키는 학생**이다 — 토큰만 있으면 아무 uid나 적어
          남의 현황을 볼 수 있으면 안 되므로, 토큰 쪽 uid 를 정본으로 쓴다. */
  if (path === '/api/pay/enroll/my-current' && method === 'GET') {
    const scope = await resolveRenewToken(env, url, null, request);
    const uid = scope ? scope.uid : String(url.searchParams.get('uid') || '').trim();
    if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
    if (!scope) {
      const authUid = await authUidOrAdminSession(request, url, env, {});
      if (!authUid) return json({ ok: false, error: 'auth_required' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
    }
    const cur = await currentEnrollment(env, uid);
    return json({ ok: true, current: cur, via: scope ? 'renew_link' : 'login' });
  }

  /* ── (e-2) 1회용 연장 링크 확인 — 화면 머리말용 ──
       문자를 누르면 enroll.html 이 제일 먼저 이걸 부른다. 돌려주는 것은 «누구의 링크인지»와
       «아직 쓸 수 있는지» 뿐이다. 전화번호·주소 같은 개인정보는 싣지 않는다(문자 링크는
       가족·지인에게 전달될 수 있다고 보고, 이름 외에는 주지 않는다). */
  if (path === '/api/pay/enroll/renew-link' && method === 'GET') {
    const scope = await resolveRenewToken(env, url, null, request);
    if (!scope) return json({ ok: false, error: 'invalid_or_expired', message: '링크가 만료되었거나 사용할 수 없습니다. 문자를 다시 받아 주세요.' }, 401);
    let name = '';
    try {
      const r: any = await env.DB.prepare(
        `SELECT COALESCE(korean_name, english_name, username, user_id) AS nm FROM students_erp WHERE user_id = ? LIMIT 1`
      ).bind(scope.uid).first();
      name = String(r?.nm || '');
    } catch {}
    const cur = await currentEnrollment(env, scope.uid);
    return json({ ok: true, uid: scope.uid, name, expires_at: scope.expires_at, used: scope.used, current: cur });
  }

  /* ── (f) 연장 주문 (본인 인증) — 요일·시간·강사 승계, 마지막 수업 다음 회차부터 ── */
  if (path === '/api/pay/enroll/renew-order' && method === 'POST') {
    const body = await parseJsonBody(request) || {};
    /* 🔗 (2026-08-18) 문자로 받은 1회용 링크로도 연장할 수 있다.
          ⚠️ uid 는 **토큰이 가리키는 학생**으로 강제한다. 본문의 uid 는 쳐다보지 않는다 —
             남의 uid 를 적어 보내는 위조를 원천 차단하기 위함이다(로그인 경로의
             authUid !== uid 검사와 같은 뜻).
          ⚠️ 이미 주문에 쓴 링크는 다시 못 쓴다. «두 번 결제됐다» 를 막는 마지막 빗장이다. */
    let renewScope: RenewTokenScope | null = await resolveRenewToken(env, url, body, request);
    if (renewScope?.used) {
      return json({ ok: false, error: 'link_already_used', message: '이미 결제에 사용된 링크입니다. 로그인 후 이용해 주세요.' }, 409);
    }
    const uid = renewScope ? renewScope.uid : String(body.uid || '').trim();
    if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
    if (!renewScope) {
      const authUid = await authUidOrAdminSession(request, url, env, body);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
    }

    const cur = await currentEnrollment(env, uid);
    // 🔁 (2026-08-24) 이미 끝난 수강도 60일 안이면 이어받는다(renewable) — 재등록이 가장 필요한 순간이다.
    if (!cur.renewable) return json({ ok: false, error: 'no_active_enrollment', message: '연장할 수업이 없습니다. 새로 신청해 주세요.' }, 400);
    const months = Number(body.months || 0);
    if (!ENROLL_MONTHS.includes(months)) return json({ ok: false, error: 'bad_months' }, 400);
    const weekly = cur.days.length;
    // ⚠️ 요일 패턴을 확신할 수 없으면 절대 추측해서 청구하지 않는다(잘못된 금액·회차 방지).
    if (!cur.days_resolved || !ENROLL_WEEKLY.includes(weekly)) {
      return json({ ok: false, error: 'weekly_unresolved', message: '현재 수업 요일을 확인할 수 없습니다. 새로 신청해 주세요.' }, 400);
    }
    // 🕐 (2026-07-30) 요일별 시간도 마찬가지로 전부 확실할 때만 진행 — 제보 #2-3.
    if (!cur.times_resolved) {
      return json({ ok: false, error: 'time_unresolved', message: '현재 수업 시간을 확인할 수 없습니다. 새로 신청해 주세요.' }, 400);
    }

    const timesMin: Record<number, number> = {};
    for (const d of cur.days as number[]) timesMin[d] = enrollTimeToMin(cur.times[d]);
    const p = {
      weekly, months, minutes: cur.minutes, times: cur.times, timesMin,
      startDate: renewStartDate(cur.last_date),    // 마지막 수업 다음 회차부터(끝난 학생은 오늘부터 — 과거 날짜 방지)
      teacherId: cur.teacher_id, days: cur.days,
    };
    const res = await createEnrollOrder(env, uid, p, 'renew');
    // 주문이 실제로 만들어졌을 때만 링크를 소진시킨다(견적 실패로 링크가 죽으면 안 된다)
    if (renewScope && res && res.status >= 200 && res.status < 300) {
      let orderId = '';
      try { orderId = String(((await res.clone().json()) as any)?.orderId || ''); } catch {}
      await markRenewLinkUsed(env, renewScope.token, orderId || undefined);
    }
    return res;
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
        `SELECT t.id, t.name, COALESCE(p.rate_pct, 100) AS rate_pct,
                COALESCE(p.long_class_daily_cap, ?) AS long_class_daily_cap,
                p.note, p.updated_at
         FROM teachers t LEFT JOIN teacher_pricing p ON p.teacher_id = CAST(t.id AS TEXT)
         WHERE t.active = 1 ORDER BY rate_pct DESC, t.name ASC LIMIT 300`
      ).bind(DEFAULT_LONG_CLASS_DAILY_CAP).all();
      return json({
        ok: true, teachers: (rs?.results as any[]) || [],
        default_long_class_daily_cap: DEFAULT_LONG_CLASS_DAILY_CAP,
        note: '정책 미확정 — 기본 100%. 변경 시 새 결제부터 적용됩니다. 긴 수업 정원 0 = 무제한.',
      });
    } catch (e) { return json({ ok: false, error: String((e as any)?.message || e) }, 500); }
  }
  if (path === '/api/pay/enroll/admin/teacher-rates' && method === 'POST') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const body = await parseJsonBody(request) || {};
    const tid = String(body.teacher_id || '').trim().slice(0, 40);
    const pct = Math.round(Number(body.rate_pct || 100));
    if (!tid || !(pct >= 50 && pct <= 300)) return json({ ok: false, error: 'bad_params', message: '배율은 50~300% 사이여야 합니다.' }, 400);
    // 🪑 긴 수업 하루 정원 — 0 = 무제한. 안 보내면 null 로 넣고 COALESCE 가 기존 값을 지킨다
    //   (요율만 고치러 온 호출이 정원을 지워 버리면 안 된다)
    let capIn: number | null = null;
    if (body.long_class_daily_cap !== undefined && body.long_class_daily_cap !== null && body.long_class_daily_cap !== '') {
      const c = Math.round(Number(body.long_class_daily_cap));
      if (!(Number.isFinite(c) && c >= 0 && c <= 50)) {
        return json({ ok: false, error: 'bad_cap', message: '긴 수업 정원은 0~50 사이여야 합니다. (0 = 무제한)' }, 400);
      }
      capIn = c;
    }
    await env.DB.prepare(
      `INSERT INTO teacher_pricing (teacher_id, rate_pct, long_class_daily_cap, note, updated_by, updated_at) VALUES (?, ?, COALESCE(?, ?), ?, ?, ?)
       ON CONFLICT(teacher_id) DO UPDATE SET rate_pct=excluded.rate_pct,
         long_class_daily_cap=COALESCE(?, teacher_pricing.long_class_daily_cap),
         note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(tid, pct, capIn, DEFAULT_LONG_CLASS_DAILY_CAP, String(body.note || '').slice(0, 200) || null,
           String((sess as any).username || 'admin'), Date.now(), capIn).run();
    return json({ ok: true, teacher_id: tid, rate_pct: pct, long_class_daily_cap: capIn });
  }

  /* ── (i) 공휴일 관리 (본사 관리자, 3단계) ── */
  if (path === '/api/pay/enroll/admin/holidays' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    const rs: any = await env.DB.prepare(
      `SELECT day, name, created_by AS by_who, created_at FROM enroll_holidays ORDER BY day ASC LIMIT 400`
    ).all();
    /* 🎌 (2026-09-25) 캘린더에만 있고 «수업 밀기» 표에는 없는 한국 공휴일 — 화면이 «옮기기» 로 보여준다 */
    const miss = await calendarHolidaysMissing(env, kstToday());
    return json({
      ok: true, holidays: (rs?.results as any[]) || [],
      calendar_missing: miss.items, calendar_ok: miss.ok, calendar_failed: miss.failed || [],
    });
  }

  /* ── (i-2) 📋 오늘 할 일 요약 (본사 관리자, 2026-09-25) ── */
  if (path === '/api/pay/enroll/admin/todo' && method === 'GET') {
    const sess = await checkAdminSession(request, env);
    if (!sess.ok) return json({ ok: false, error: 'auth_required' }, 401);
    return json(await enrollTodoSummary(env));
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
      const conf = await enrollConflicts(env, to, [day], { [dow]: startMin }, Number(r.dm) || 20, [dow]);
      if (conf.has(day)) { skipped.push({ id: r.id, student: r.student_name, time: r.start_time, reason: '대체 강사도 그 시간에 수업 있음' }); continue; }
      if (!dry) {
        await env.DB.prepare(`UPDATE class_schedules SET teacher_id=?, updated_at=?, notes=COALESCE(notes,'')||' · 강사 휴가 대체' WHERE id=? AND status='active'`)
          .bind(to, Date.now(), r.id).run();
        /* 📜 (2026-08-12) 하루치 수업의 강사를 통째로 바꾸는데 이력이 없었다.
           학생·학부모가 「오늘 왜 다른 선생님이냐」 물었을 때 댈 근거가 notes 문자열뿐이었다.
           ⚠️ dry 실행에는 남기지 않는다 — 미리보기는 사건이 아니다. */
        await writeClassAudit(env, {
          action: 'teacher_change', schedule_id: r.id, student_name: r.student_name || null,
          lesson_date: day, lesson_time: String(r.start_time || '') || null,
          actor: (sess as any)?.username || (sess as any)?.name || 'admin', actor_role: 'admin',
          source: 'teacher-leave-sub', reason: '강사 휴가 대체',
          detail: JSON.stringify({ from_teacher_id: from, to_teacher_id: to }),
        });
      }
      moved.push({ id: r.id, student: r.student_name, time: r.start_time });
    }
    return json({ ok: true, day, from, to, dry, moved_count: moved.length, skipped_count: skipped.length, moved, skipped });
  }

  /* ── (m-2) 1회성 대체강사 배정 — 후보 조회 (관리자) ──
     사장님 요청(2026-08-28) "강사 휴가·병가로 다른 강사로 대체" — 위 (m)과 다른 것은
     "그 요일 전체를 영구히 바꾸는" 게 아니라 "이번 회차 하루만" 이라는 점. 그 판단 근거는
     schedule_kind: 수강신청이 만드는 행(schedule_kind='dated')은 회차마다 행이 따로 있어
     teacher_id 를 바꿔도 그 날짜 하나만 바뀐다(다음 주는 다른 행). 반면 admin 이 만드는
     'recurring' 행은 한 행이 무기한 반복이라, 손대면 앞으로 계속 바뀐다 — 그래서 그 행은
     건드리지 않고 class_substitutions 에 "그 날짜만" 겹쳐 보여줄 오버레이를 남긴다. */
  if (path === '/api/pay/enroll/admin/substitute-candidates' && method === 'GET') {
    /* 🔴 (2026-08-28 trap-check 지적) checkAdminSession 만으로는 강사 세션도 통과한다 —
       강사가 이 API 를 직접 불러 남의 수업의 담당 강사를 마음대로 바꿀 수 있었다.
       CLAUDE.md 2장 "관리자 «쓰기» API 를 본사 전용으로 막았는데 강사가 그대로 실행됨" 과
       같은 함정. getAdminActor().isTeacher 로 강사를 명시적으로 막는다(읽기 전용인 이
       GET 도 남의 수업 정보를 보여주므로 함께 막는다). */
    const actor = await getAdminActor(request, env as any);
    if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
    if (actor.isTeacher) return json(forbiddenTeacherBody(actor, '강사 권한으로는 사용할 수 없는 기능입니다.'), 403);
    await ensureEnrollTables(env);
    const scheduleId = Number(url.searchParams.get('schedule_id') || 0);
    const date = String(url.searchParams.get('date') || '').trim();
    if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'bad_params' }, 400);
    const row: any = await env.DB.prepare(
      `SELECT cs.id, cs.user_id, cs.student_name, cs.schedule_kind, cs.day_of_week, cs.scheduled_date,
              cs.start_time, COALESCE(cs.duration_min,20) AS dm, cs.teacher_id, cs.status,
              t.name AS teacher_name
         FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
        WHERE cs.id = ? LIMIT 1`
    ).bind(scheduleId).first();
    if (!row || row.status !== 'active') return json({ ok: false, error: 'schedule_not_found' }, 404);
    /* 🔒 지사·대리점·지사본사는 «자기 소속 학생의 수업» 만 — 남의 학원 수업의 강사·학생 이름이
       여기서 나가면 안 된다(읽기 전용이라도 막는다). 본사·내부직원은 그대로 통과. */
    { const d = await subScopeDenied(env, request, actor.role, row.user_id); if (d) return d; }
    const dow = subScheduleDow(row.scheduled_date, row.day_of_week, date);
    if (dow === null) return json({ ok: false, error: 'not_on_that_date', message: '이 수업은 그 날짜에 열리지 않습니다.' }, 400);
    const startMin = enrollTimeToMin(String(row.start_time || ''));
    const minutes = Number(row.dm) || DEFAULT_CLASS_MINUTES;
    const isRecurring = !row.scheduled_date;

    const freeIds = await teachersFreeAt(env, [dow], { [dow]: startMin }, minutes);
    /* 🟡 (2026-08-28 trap-check 지적) teachersFreeAt 은 class_schedules 만 보고
       class_substitutions 오버레이는 몰랐다 — 같은 강사가 같은 날 두 반의 대체로
       동시에 배정될 수 있었다. 그 날짜의 기존 오버레이도 함께 본다. */
    const subBusy = await subOverlayBusyIds(env, date, scheduleId);
    const tRows: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1 ORDER BY name`).all();
    const candidates = ((tRows?.results as any[]) || [])
      .filter((t: any) => String(t.id) !== String(row.teacher_id || ''))
      .map((t: any) => ({
        id: String(t.id), name: t.name,
        free: freeIds.has(String(t.id)) && !subOverlayHasOverlap(subBusy, String(t.id), startMin, minutes),
      }))
      .sort((a: any, b: any) => (a.free === b.free ? 0 : a.free ? -1 : 1));

    let existingSub: any = null;
    if (isRecurring) {
      const ex: any = await env.DB.prepare(
        `SELECT substitute_teacher_id, original_teacher_id, reason FROM class_substitutions
          WHERE schedule_id = ? AND sub_date = ? AND status = 'active' LIMIT 1`
      ).bind(scheduleId, date).first();
      if (ex) {
        const t2: any = await env.DB.prepare(`SELECT name FROM teachers WHERE id = ? LIMIT 1`).bind(ex.substitute_teacher_id).first();
        existingSub = {
          substitute_teacher_id: String(ex.substitute_teacher_id), substitute_teacher_name: t2?.name || null,
          original_teacher_id: ex.original_teacher_id ? String(ex.original_teacher_id) : null, reason: ex.reason || null,
        };
      }
    }
    return json({
      ok: true,
      schedule: {
        id: row.id, student_name: row.student_name, start_time: row.start_time,
        duration_min: minutes, teacher_id: row.teacher_id ? String(row.teacher_id) : null,
        teacher_name: row.teacher_name, schedule_kind: row.schedule_kind, is_recurring: isRecurring,
      },
      candidates, existing_substitution: existingSub,
    });
  }

  /* ── 📅 (2026-09-23 Karl 매니저 제안) 옮길 «새 시간» 에 되는 강사 ──
     "Upon moving classes to other schedule, can we see available teachers who can handle
      the new schedule? … some students choose specific teacher to handle the class."
     ⟹ ① 지금 담당(학생이 고른) 강사가 그 시간에 되는가를 «먼저» ② 안 되면 다른 빈 강사를.
     ✅ 판정은 옮기기 승인(/api/admin/schedule-requests/decide)이 실제로 쓰는
        findScheduleConflicts 를 그대로 부른다 — 화면이 «가능» 이라 한 강사가 승인에서 «겹침» 으로
        거절되면 안 된다. 거기에 «그날 다른 수업의 대체로 들어가 있음»(class_substitutions)과
        «근무 불가 등록»(teacher_unavailability)을 덧붙여 알린다(승인은 이 둘을 안 보지만 사실이다).
     ⛔ 읽기 전용이다 — 담당 강사를 바꾸지 않는다(바꾸는 길은 🔄 대체강사·시간표).
     ⚠️ 학생 자신의 겹침은 강사와 무관하게 옮기기를 막으므로 따로 알린다(student_conflict). */
  if (path === '/api/pay/enroll/admin/move-candidates' && method === 'GET') {
    const actor = await getAdminActor(request, env as any);
    if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
    if (actor.isTeacher) return json(forbiddenTeacherBody(actor, '강사 권한으로는 사용할 수 없는 기능입니다.'), 403);
    const scheduleId = Number(url.searchParams.get('schedule_id') || 0);
    const date = String(url.searchParams.get('date') || '').trim();
    const time = String(url.searchParams.get('time') || '').trim().slice(0, 5);
    if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) {
      return json({ ok: false, error: 'bad_params' }, 400);
    }
    const row: any = await env.DB.prepare(
      `SELECT cs.id, cs.user_id, cs.scheduled_date, COALESCE(cs.duration_min,20) AS dm, cs.teacher_id, cs.status, cs.source,
              t.name AS teacher_name
         FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
        WHERE cs.id = ? LIMIT 1`
    ).bind(scheduleId).first();
    if (!row || row.status !== 'active') return json({ ok: false, error: 'schedule_not_found' }, 404);
    { const d = await subScopeDenied(env, request, actor.role, row.user_id); if (d) return d; }
    const minutes = Number(row.dm) || DEFAULT_CLASS_MINUTES;
    const startMin = enrollTimeToMin(time);
    const q = { kind: 'one_off' as const, schedDate: date, startTime: time, durationMin: minutes, excludeId: scheduleId };

    const stu = await findScheduleConflicts(env, { ...q, userId: row.user_id, teacherId: null });
    const subBusy = await subOverlayBusyIds(env, date, scheduleId);

    /* 근무 불가 등록 — 표가 없을 수 있다(없으면 «없음» 으로). */
    const offIds = new Set<string>();
    try {
      const dow = new Date(date + 'T00:00:00Z').getUTCDay();
      const rs: any = await env.DB.prepare(
        `SELECT teacher_id, kind, start_date, end_date, day_of_week, start_time, end_time FROM teacher_unavailability`
      ).all();
      for (const b of ((rs?.results as any[]) || [])) {
        const bs = b.start_time ? enrollTimeToMin(String(b.start_time)) : 0;
        const be = b.end_time ? enrollTimeToMin(String(b.end_time)) : 24 * 60;
        const hitTime = startMin < be && bs < startMin + minutes;
        const hitDay = (b.kind === 'date_range' && b.start_date && b.end_date && date >= String(b.start_date) && date <= String(b.end_date))
          || (b.kind === 'weekly' && b.day_of_week != null && Number(b.day_of_week) === dow);
        if (hitDay && hitTime) offIds.add(String(b.teacher_id));
      }
    } catch { /* 표 없음 — 알릴 것 없음 */ }

    const tRows: any = await env.DB.prepare(`SELECT id, name FROM teachers WHERE active = 1 ORDER BY name`).all();
    const teachers = ((tRows?.results as any[]) || []);
    const curId = row.teacher_id != null ? String(row.teacher_id) : '';
    /* 담당 강사가 퇴사(active=0)여도 «그 강사» 로 한 줄은 보여 준다. */
    if (curId && !teachers.some((t: any) => String(t.id) === curId)) {
      teachers.unshift({ id: curId, name: row.teacher_name || ('#' + curId) });
    }
    const judge = async (t: any) => {
      const id = String(t.id);
      const c = await findScheduleConflicts(env, { ...q, userId: null, teacherId: id });
      let why = '';
      if (c.has) why = c.cap ? 'long_class_cap' : 'busy';
      else if (subOverlayHasOverlap(subBusy, id, startMin, minutes)) why = 'substituting';
      else if (offIds.has(id)) why = 'time_off';
      return { id, name: t.name, free: !why, why, current: id === curId };
    };
    const out: any[] = [];
    for (let i = 0; i < teachers.length; i += 8) {
      out.push(...(await Promise.all(teachers.slice(i, i + 8).map(judge))));
    }
    /* 🖼 사진·영문 이름 — 홈 「강사 소개」 카드와 같은 곳(teacher_profiles.image_url).
       원부 번호로 잇는다(linked_teacher_id). 못 읽으면 사진 없이 이름만(막지 않는다). */
    const photo = new Map<string, { img: string; en: string }>();
    try {
      const pr: any = await env.DB.prepare(
        `SELECT CAST(linked_teacher_id AS TEXT) AS tid, image_url, english_name FROM teacher_profiles
          WHERE linked_teacher_id IS NOT NULL ORDER BY COALESCE(updated_at, created_at, 0) DESC`
      ).all();
      for (const r of ((pr?.results as any[]) || [])) {
        const k = String(r.tid || '');
        if (!k || photo.has(k)) continue;           // 최신 한 줄만
        photo.set(k, { img: String(r.image_url || ''), en: String(r.english_name || '') });
      }
    } catch { /* 칸·표 없음 — 이름만 */ }
    for (const t of out) {
      const ph = photo.get(t.id);
      /* ⛔ http(s)·/ 로 시작하는 주소만 — 화면이 <img src> 에 그대로 넣는다. */
      t.photo = ph && /^(https?:\/\/|\/)/i.test(ph.img) ? ph.img : '';
      t.display_name = (ph && ph.en) || t.name;
    }
    const current = out.find((t) => t.current) || null;
    /* «그 시간대 가능한 강사만» (2026-09-23 사장님) — 안 되는 강사는 수만 센다. */
    const free = out.filter((t) => !t.current && t.free)
      .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name)));
    const busyCount = out.filter((t) => !t.current && !t.free).length;
    /* 🪞 카페24 미러 수업은 «날짜를 바꾸면서» 담당 강사까지 바꾸면 안 된다 — 강사를 바꾸는 PATCH 가
       「사람 손」 도장(c24-mirror:manual)을 찍어 미러의 유일 인덱스 밖으로 나가고, 그 밤 미러가
       옛 날짜에 같은 수업을 다시 만든다(CLAUDE.md 2장 «날짜가 바뀌는 이동에 도장» 과 같은 뿌리).
       같은 날짜 안에서 시각만 옮기면 도장이 오히려 맞는 동작이라 허용한다. */
    const isMirror = String(row.source || '') === 'c24-mirror';
    const sameDay = String(row.scheduled_date || '').slice(0, 10) === date;
    return json({
      ok: true, date, time, duration_min: minutes,
      student_conflict: stu.has && stu.student.length > 0,
      current, candidates: free, busy_count: busyCount,
      teacher_change_ok: !(isMirror && !sameDay),
    });
  }

  /* ── 🔄 (2026-09-23 사장님) 수업 «변경» = 앞으로 계속 ──
     「연기는 지정한 날짜에 한 번이고, 변경은 계속이야.」
     body: { schedule_id, new_date, new_time, teacher_id?, apply? }
       · apply 가 true 가 아니면 «미리보기»(dry run) — 무엇이 몇 회 바뀌는지만 돌려준다.
       · apply:true 면 같은 시리즈(class-series-move.ts)를 전부 옮긴다.
     ✅ 전부 되거나 전혀 안 되거나 — 한 회라도 겹치면 아무것도 쓰지 않고 그 날짜들을 돌려준다.
        겹침 판정은 한 회 옮기기(/decide)가 쓰는 findScheduleConflicts 그대로다(복제 금지).
     ⛔ 카페24 미러 수업은 막는다(mirror_series) — 밤마다 미러가 옛 시간표를 다시 만든다.
     ⛔ 담당 강사를 바꾸면 본사 전용 — PATCH /api/admin/class-schedules/:id 와 같은 정본 게이트.
     ⚠️ day_of_week 칸은 건드리지 않는다 — 날짜 지정 행은 scheduled_date 가 이기고(sessions/today),
        한 회 옮기기(/decide)도 그 칸을 안 바꾼다(두 경로가 다르게 쓰면 어긋난다). */
  if (path === '/api/pay/enroll/admin/series-move' && method === 'POST') {
    const actor = await getAdminActor(request, env as any);
    if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
    if (actor.isTeacher) return json(forbiddenTeacherBody(actor, '강사 권한으로는 사용할 수 없는 기능입니다.'), 403);
    const body = await parseJsonBody(request) || {};
    const scheduleId = Number(body.schedule_id || 0);
    const apply = body.apply === true;
    if (!scheduleId) return json({ ok: false, error: 'bad_params' }, 400);
    const row: any = await env.DB.prepare(
      `SELECT cs.id, cs.user_id, cs.student_name, cs.scheduled_date, cs.start_time, COALESCE(cs.duration_min,20) AS dm,
              cs.teacher_id, cs.status, cs.source, t.name AS teacher_name
         FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)
        WHERE cs.id = ? LIMIT 1`
    ).bind(scheduleId).first();
    if (!row || row.status !== 'active') return json({ ok: false, error: 'schedule_not_found' }, 404);
    if (['lms', 'type_seed'].includes(String(row.user_id || '').toLowerCase())) return json({ ok: false, error: 'placeholder_row' }, 400);
    { const d = await subScopeDenied(env, request, actor.role, row.user_id); if (d) return d; }

    /* 담당 강사 변경 — 같은 강사면 «안 바꿈». 바꾸면 본사 전용 + 실재하는 강사만. */
    const curTid = row.teacher_id != null ? String(row.teacher_id) : '';
    const wantTid = String(body.teacher_id ?? '').trim();
    const swap = !!wantTid && wantTid !== curTid;
    let newTeacherName: string | null = null;
    if (swap) {
      if (!/^\d+$/.test(wantTid)) return json({ ok: false, error: 'invalid_teacher_id' }, 400);
      let scopeType: string | null = null;
      try {
        const sr: any = await env.DB.prepare(`SELECT scope_type FROM admin_scope WHERE username = ? LIMIT 1`).bind(actor.username).first();
        const st = sr ? String(sr.scope_type ?? '').trim() : '';
        scopeType = st || null;
      } catch { scopeType = null; }                    // 모르면 정본 게이트가 막는다
      const deny = teacherMoveDenyReason({ ok: actor.ok, isTeacher: actor.isTeacher, scopeType });
      if (deny) return json(deny.error === 'forbidden_teacher' ? forbiddenTeacherBody(actor, deny.message)
        : { ok: false, error: deny.error, message: deny.message }, deny.status as any);
      const tr: any = await env.DB.prepare(`SELECT name FROM teachers WHERE CAST(id AS TEXT) = ? LIMIT 1`).bind(wantTid).first().catch(() => null);
      if (!tr) return json({ ok: false, error: 'teacher_not_found' }, 400);
      newTeacherName = String(tr.name || '');
    }

    const rs: any = await env.DB.prepare(
      `SELECT id, user_id, scheduled_date, start_time, teacher_id, source, status FROM class_schedules
        WHERE user_id = ? AND status = 'active' AND scheduled_date IS NOT NULL AND scheduled_date <> ''
        ORDER BY scheduled_date LIMIT 400`
    ).bind(row.user_id).all();
    const plan = planSeries(row, (rs?.results as any[]) || [], body.new_date, body.new_time);
    if (!plan.ok) return json({ ok: false, error: plan.error }, plan.error === 'mirror_series' ? 409 : 400);

    const minutes = Number(row.dm) || DEFAULT_CLASS_MINUTES;
    const newTid = swap ? wantTid : curTid;
    const ids = new Set(plan.items.map((it) => String(it.id)));
    const conflicts: { date: string; ko: string; en: string }[] = [];
    for (let i = 0; i < plan.items.length; i += 6) {
      await Promise.all(plan.items.slice(i, i + 6).map(async (it) => {
        const c = await findScheduleConflicts(env, {
          kind: 'one_off', userId: row.user_id, teacherId: newTid || null,
          schedDate: it.to_date, startTime: it.to_time, durationMin: minutes, excludeId: it.id,
        });
        if (realConflict(c, ids)) conflicts.push({ date: it.to_date, ko: c.ko, en: c.en });
      }));
    }
    conflicts.sort((a, b) => (a.date < b.date ? -1 : 1));
    const summary = {
      count: plan.items.length, delta_days: plan.delta_days, items: plan.items,
      from_time: normTime(row.start_time), to_time: plan.items[0]?.to_time || '',
      teacher: { from_id: curTid, from_name: row.teacher_name || null, to_id: newTid, to_name: swap ? newTeacherName : (row.teacher_name || null), changed: swap },
    };
    if (conflicts.length) return json({ ok: false, error: 'conflict', conflicts, ...summary }, 409);
    if (!apply) return json({ ok: true, dry_run: true, ...summary });

    /* 적용 — 한 번의 batch. 행마다 «옛 날짜·시각 그대로인가» 를 WHERE 로 다시 본다(그 사이 누가 바꿨으면 0행). */
    const now = Date.now();
    const stmts = plan.items.map((it) => env.DB.prepare(
      swap
        ? `UPDATE class_schedules SET scheduled_date = ?, start_time = ?, teacher_id = ?, updated_at = ?
            WHERE id = ? AND status = 'active' AND substr(replace(scheduled_date,'/','-'),1,10) = ? AND substr(start_time,1,5) = ?`
        : `UPDATE class_schedules SET scheduled_date = ?, start_time = ?, updated_at = ?
            WHERE id = ? AND status = 'active' AND substr(replace(scheduled_date,'/','-'),1,10) = ? AND substr(start_time,1,5) = ?`
    ).bind(...(swap
      ? [it.to_date, it.to_time, newTid, now, it.id, it.from_date, it.from_time]
      : [it.to_date, it.to_time, now, it.id, it.from_date, it.from_time])));
    const res: any[] = await env.DB.batch(stmts);
    const moved = res.reduce((n, r) => n + (Number(r?.meta?.changes) || 0), 0);
    const actorName = String(actor.name || actor.username || '관리자');
    for (const it of plan.items) {
      await writeClassAudit(env, {
        action: 'reschedule', schedule_id: it.id,
        teacher_name: row.teacher_name || null, student_name: row.student_name || row.user_id || null,
        lesson_date: it.from_date, lesson_time: it.from_time,
        actor: actorName, actor_role: 'admin', source: 'series-move',
        reason: String(body.reason || '').trim().slice(0, 200) || null,
        detail: `→ ${it.to_date} ${it.to_time}` + (swap ? ` · 강사 ${row.teacher_name || curTid} → ${newTeacherName || newTid}` : '') + ` (변경·앞으로 계속 ${plan.items.length}회)`,
      });
    }
    return json({ ok: true, applied: true, moved, ...summary });
  }

  /* ── (m-3) 1회성 대체강사 배정 — 등록/취소 (관리자) ──
     substitute_teacher_id 가 "지금 정본 담당 강사"(recurring 행은 항상 원래 강사, dated 행은
     현재 값)와 같으면 "취소·복귀" 로 다룬다 — recurring 행은 자기 자신에 대해서는 절대
     "충돌" 검사를 해서는 안 된다(그 행 자체가 이미 그 강사의 그 시간 커밋이라 스스로와
     충돌 판정이 나 버린다 — 2026-08-28 설계 중 실제로 밟고 고침). */
  if (path === '/api/pay/enroll/admin/substitute' && method === 'POST') {
    // 🔴 (2026-08-28 trap-check 지적) 위 GET 과 같은 이유 — 강사는 이 쓰기 API 를 아예 못 쓴다.
    const actor = await getAdminActor(request, env as any);
    if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
    if (actor.isTeacher) return json(forbiddenTeacherBody(actor, '강사 권한으로는 사용할 수 없는 기능입니다.'), 403);
    await ensureEnrollTables(env);
    const body = await parseJsonBody(request) || {};
    const scheduleId = Number(body.schedule_id || 0);
    const date = String(body.date || '').trim();
    const subTeacherId = String(body.substitute_teacher_id || '').trim();
    const reason = String(body.reason || '기타').slice(0, 200);
    if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !subTeacherId) return json({ ok: false, error: 'bad_params' }, 400);

    const row: any = await env.DB.prepare(
      `SELECT id, user_id, student_name, schedule_kind, day_of_week, scheduled_date, start_time,
              COALESCE(duration_min,20) AS dm, teacher_id, status
         FROM class_schedules WHERE id = ? LIMIT 1`
    ).bind(scheduleId).first();
    if (!row || row.status !== 'active') return json({ ok: false, error: 'schedule_not_found' }, 404);
    if (['lms', 'type_seed'].includes(String(row.user_id || '').toLowerCase())) return json({ ok: false, error: 'placeholder_row' }, 400);
    /* 🔒 지사·대리점·지사본사는 «자기 소속 학생의 수업» 만 바꿀 수 있다 — 어떤 쓰기보다 앞에 온다.
       되돌리기(원래 강사 복귀)도 같은 조건으로 허용한다(2026-08-30 사장님 결정 — 자기가 배정한
       대체를 자기가 취소하지 못하면 본사에 매번 요청해야 한다). */
    { const d = await subScopeDenied(env, request, actor.role, row.user_id); if (d) return d; }
    const dow = subScheduleDow(row.scheduled_date, row.day_of_week, date);
    if (dow === null) return json({ ok: false, error: 'not_on_that_date' }, 400);

    const isRecurring = !row.scheduled_date;
    const currentTeacherId = row.teacher_id ? String(row.teacher_id) : '';
    const isSelfRevert = isRecurring && currentTeacherId && subTeacherId === currentTeacherId;
    if (!isSelfRevert && subTeacherId === currentTeacherId) return json({ ok: false, error: 'same_teacher' }, 400);

    /* 🟡 (2026-08-28 trap-check 지적) substitute_teacher_id 가 실제 teachers 행인지 검증하지
       않았다 — 정상 UI(드롭다운)로는 항상 유효한 값만 오지만, API 를 직접 호출하면 임의
       문자열이 그대로 저장돼 화면엔 강사명이 빈 값으로 뜬다. 되돌리기(isSelfRevert)는
       currentTeacherId 가 이미 이 행에서 온 값이라 다시 검증할 필요가 없다. */
    if (!isSelfRevert) {
      const tExists = await env.DB.prepare(`SELECT id FROM teachers WHERE id = ? AND active = 1 LIMIT 1`).bind(subTeacherId).first();
      if (!tExists) return json({ ok: false, error: 'invalid_teacher' }, 400);
    }

    if (!isSelfRevert) {
      const startMin = enrollTimeToMin(String(row.start_time || ''));
      const minutes = Number(row.dm) || DEFAULT_CLASS_MINUTES;
      const conf = await enrollConflicts(env, subTeacherId, [date], { [dow]: startMin }, minutes, [dow]);
      if (conf.has(date)) return json({ ok: false, error: 'substitute_busy', message: '대체 강사도 그 시간에 다른 수업이 있습니다.' }, 409);
      /* 🟡 (2026-08-28 trap-check 지적) — 위 GET 후보조회와 같은 이유로, 이 강사가 같은 날
         "다른 회차의 대체" 로 이미 잡혀 있는지도 봐야 한다(class_schedules 만으로는 모른다). */
      const subBusy = await subOverlayBusyIds(env, date, scheduleId);
      if (subOverlayHasOverlap(subBusy, subTeacherId, startMin, minutes)) {
        return json({ ok: false, error: 'substitute_busy', message: '대체 강사가 같은 날 다른 회차의 대체로 이미 배정돼 있습니다.' }, 409);
      }
    }

    const now = Date.now();
    const actorName = actor.username || actor.name || 'admin';

    if (isRecurring) {
      if (isSelfRevert) {
        await env.DB.prepare(
          `UPDATE class_substitutions SET status = 'cancelled', updated_at = ? WHERE schedule_id = ? AND sub_date = ? AND status = 'active'`
        ).bind(now, scheduleId, date).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO class_substitutions (schedule_id, sub_date, original_teacher_id, substitute_teacher_id, reason, created_by, created_at, updated_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
           ON CONFLICT(schedule_id, sub_date) DO UPDATE SET
             substitute_teacher_id = excluded.substitute_teacher_id, reason = excluded.reason,
             created_by = excluded.created_by, updated_at = excluded.updated_at, status = 'active'`
        ).bind(scheduleId, date, currentTeacherId || null, subTeacherId, reason, actorName, now, now).run();
      }
    } else {
      /* dated 행 — 그 회차 자체가 그 날 하루뿐이라 오버레이가 필요 없다. 바로 바꾼다. */
      await env.DB.prepare(
        `UPDATE class_schedules SET teacher_id = ?, updated_at = ?, notes = COALESCE(notes,'') || ' · 대체강사 배정(' || ? || ')' WHERE id = ? AND status = 'active'`
      ).bind(subTeacherId, now, reason, scheduleId).run();
    }

    await writeClassAudit(env, {
      action: isSelfRevert ? 'substitute_cancelled' : 'teacher_change',
      schedule_id: scheduleId, student_name: row.student_name || null,
      lesson_date: date, lesson_time: String(row.start_time || '') || null,
      actor: actorName, actor_role: 'admin',
      source: isRecurring ? 'admin-substitute-recurring' : 'admin-substitute-dated',
      reason: isSelfRevert ? '대체강사 취소(원래 강사로 복귀)' : ('1회성 대체 · ' + reason),
      /* 📜 (2026-08-28 trap-check 지적) 필드명을 `one_time` 대신 `via_overlay` 로 —
         dated 행의 변경도 "하루뿐"이라는 점에서 결과는 둘 다 1회성이라 이름이 헷갈렸다.
         이 필드는 "정본 행을 직접 고쳤나(false, dated) / class_substitutions 오버레이로
         겹쳐 보였나(true, recurring)" 를 말한다 — 나중에 급여 담당자가 이 로그로 대체
         내역을 사람이 직접 확인할 때 구분 근거가 된다. */
      detail: JSON.stringify({ from_teacher_id: currentTeacherId, to_teacher_id: subTeacherId, via_overlay: isRecurring, date }),
    });

    return json({ ok: true, schedule_id: scheduleId, date, cancelled: isSelfRevert, via_overlay: isRecurring, substitute_teacher_id: isSelfRevert ? null : subTeacherId });
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
    const lenMul = classLengthMultiplier(Number(ej.minutes));
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

export async function createEnrollOrder(env: any, uid: string, p: any, kind: 'new' | 'renew' | 'auto_renew'): Promise<Response> {
  const sessions = p.weekly * 4 * p.months;
  const hol = await holidaySet(env, p.startDate);
  const probe = enrollDates(p.startDate, p.days, sessions * 2);
  const conflicts = await enrollConflicts(env, p.teacherId, probe, p.timesMin, p.minutes, p.days);
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

  const orderName = `${kind === 'auto_renew' ? '[자동연장] ' : kind === 'renew' ? '[연장] ' : ''}주${p.weekly}회 × ${p.months}개월 수강권 (${q.sessions}회${p.minutes !== DEFAULT_CLASS_MINUTES ? '·' + p.minutes + '분' : ''})`;
  const enrollJson = JSON.stringify({
    v: 2, kind, uid, teacher_id: p.teacherId, teacher_name: tName, days: p.days, times: p.times,
    minutes: p.minutes, weekly: p.weekly, months: p.months, start_date: p.startDate,
    sessions: q.sessions, per_session: q.perSession, weekly1_price: weekly1Price,
    teacher_rate: tRate, shop_name: shopName || null,
  });
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const orderId = `${kind === 'auto_renew' ? 'MGA' : kind === 'renew' ? 'MGR' : 'MGE'}-${Date.now().toString(36).toUpperCase()}-${rnd}`;
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
      teacher: tName, days: p.days, times: p.times, minutes: p.minutes, sessions: q.sessions,
      first_date: dates[0], last_date: dates[dates.length - 1], discount: q.discountRate,
      teacher_rate: tRate, shifted: sessions - enrollDates(p.startDate, p.days, sessions).filter((d) => !blocked.has(d)).length,
    },
  });
}
