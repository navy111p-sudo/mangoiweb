/**
 * 🏫 B2B(대리점·학원) 화상수업 수업료 정산 — 정본(순수 함수)
 *
 * (2026-10-01 사장님 지시) 옛 mangoi.co.kr 의 B2B 결제 문제 12가지를 mangoi.ai 에서 없앤다.
 *   ① 충전금이 자동 소진되지 않는다            → 수업 한 번마다 «회차 원장» 상태대로 자동 차감
 *   ② 충전금이 바닥나도 알림이 없다              → 월말 예상 잔액이 모자라면 보충 청구서 + 문자
 *   ③ 결제 페이지가 복잡하다                    → 로그인 없는 한 장짜리 결제 링크
 *   ④ 학생은 월별, 본사는 건별이라 차액이 난다    → 달력 월(1일~말일) 하나로 통일
 *   ⑤ 미리 말한 연기가 결석으로 청구된다        → 30분 전 연기 «신청» 만 있어도 차감 보류
 *   ⑥ +/- 이월 개념이 어렵다                     → «충전금 잔액» 한 숫자로 보여 준다(남은 돈은 그대로 남는다)
 *   ⑦ 25일~말일 알림 문자를 손으로 보낸다        → 20일 발행 · D-7 · D-day · D+14 · D+21 자동 문자
 *   ⑧ 금액이 왜 이렇게 나왔는지 사람이 설명한다  → 계산 근거를 문장으로 자동 생성(explain)
 *   ⑨ 자동결제가 없다                            → 카드 등록 학원은 D-day 자동결제(별도 스위치)
 *   ⑩ 같은 주1회인데 4회·5회가 섞인다           → 학생마다 «요일 · 날짜» 를 그대로 적고 이유를 말한다
 *   ⑪ 첫 달은 다음 달에 2개월치가 같이 나온다   → 첫 달은 «남은 회차만큼» 바로 청구(보충 청구서)
 *   ⑫ 관리자 페이지에 로그인해야만 결제된다      → 문자로 받은 링크에서 바로 결제
 *
 * ⚠️ 이 파일은 «계산» 만 한다 — D1 을 읽고 쓰는 것은 b2b-tuition-load.ts.
 * ⚠️ 회차 상태(차감 여부)는 session-ledger.ts 가 정본이다. 여기서 다시 판정하지 않는다.
 * ⚠️ 회당 단가 = 대리점 «주1회(=월4회)» 단가 ÷ 4 × 수업 길이 배수(class-policy) — 수강신청
 *    `computeMonthlyFee`(enroll-fee.ts)와 같은 기준가·같은 배수다. 한쪽만 바꾸면 두 화면이 갈린다.
 * ⚠️ 모르면 지어내지 않는다 — 단가가 없거나 상태가 «미정» 이면 차감 0, 사람이 확인.
 */
import { LEDGER_STATES, POSTPONE_FREE_MINUTES_GT, type LedgerState } from './session-ledger';
import { classLengthMultiplier, DEFAULT_CLASS_MINUTES } from './class-policy';

/** 대리점 단가(weekly1_price)가 «몇 회» 기준인가 — enroll-ops.ts ENROLL_BASE_WEEKLY1 주석 «주1회=월4회» */
export const SESSIONS_PER_WEEKLY1 = 4;
/** 매월 청구서 발행일(사장님 결정 2026-10-01) */
export const ISSUE_DAY = 20;
/** 잔액 부족 알림을 «며칠 앞» 수업까지 보고 판단하나 */
export const LOW_BALANCE_LOOKAHEAD_DAYS = 14;

const pad = (n: number) => String(n).padStart(2, '0');
const won = (n: number) => '₩' + Math.round(Number(n) || 0).toLocaleString('ko-KR');
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 10원 절사 — enroll-fee.ts floor10 과 같은 자리에서 끊는다 */
export function floor10(n: number): number { return Math.floor(n / 10) * 10; }

/**
 * 회당 단가. weekly1Price 가 없거나 0 이면 null(지어내지 않음).
 *   20분 60,000원 → 15,000원 · 30분 → 22,500원 · 40분 → 30,000원
 */
export function sessionUnitPrice(weekly1Price: any, minutes: any): number | null {
  const w = Number(weekly1Price);
  if (!Number.isFinite(w) || w <= 0) return null;
  const m = Number(minutes) > 0 ? Number(minutes) : DEFAULT_CLASS_MINUTES;
  return floor10((w / SESSIONS_PER_WEEKLY1) * classLengthMultiplier(m));
}

// ───────────────────────── 날짜 ─────────────────────────
export function monthAdd(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function isValidMonth(s: any): boolean {
  const t = String(s || '');
  if (!/^\d{4}-\d{2}$/.test(t)) return false;
  const m = Number(t.slice(5, 7));
  return m >= 1 && m <= 12;
}
export function lastDayOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
function dayNum(ymd: string): number { return Math.round(Date.parse(ymd + 'T00:00:00Z') / 86400000); }
export function addDays(ymd: string, n: number): string {
  return new Date((dayNum(ymd) + n) * 86400000).toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number { return dayNum(b) - dayNum(a); }
function dowOf(ymd: string): number { return new Date(ymd + 'T00:00:00Z').getUTCDay(); }

// ───────────────────────── 차감 ─────────────────────────
export interface PendingPostpone { minutes_before?: number | null; fee_type?: string | null; request_type?: string | null; }

/**
 * 한 회차를 충전금에서 얼마 뺄까.
 *   · 상태가 «차감» (완료·학생 결석·늦은 연기) 이면 회당 단가
 *   · 단, 그 회차에 «30분 전에 들어온 연기 신청» 이 아직 승인 대기면 보류(0) — 문제 ⑤
 *     (학원은 미리 말했는데 본사가 아직 처리 안 한 사이에 결석으로 빠져나가는 일을 막는다)
 *   · 단가를 모르면 0 (지어내지 않음) — hold_reason 'no_price'
 */
export function chargeFor(state: LedgerState, unit: number | null, pending?: PendingPostpone | null):
  { charge: number; hold: null | 'pending_postpone' | 'no_price' | 'unknown_state' } {
  const def = LEDGER_STATES[state];
  if (!def) return { charge: 0, hold: 'unknown_state' };
  if (!def.deduct) return { charge: 0, hold: state === 'unknown' ? 'unknown_state' : null };
  if (pending && earlyPending(pending)) return { charge: 0, hold: 'pending_postpone' };
  if (unit == null || !(unit > 0)) return { charge: 0, hold: 'no_price' };
  return { charge: unit, hold: null };
}

/** 대기 중인 연기 신청이 «30분 전» 에 들어왔나 (session-ledger 와 같은 경계: 30분 «초과») */
export function earlyPending(p: PendingPostpone | null | undefined): boolean {
  if (!p) return false;
  if (String(p.request_type || '').toLowerCase() === 'change') return false;
  if (p.fee_type === 'free') return true;
  if (p.fee_type === 'paid') return false;
  const mb = Number(p.minutes_before);
  return Number.isFinite(mb) && p.minutes_before != null && mb > POSTPONE_FREE_MINUTES_GT;
}

/** 학원이 지금 연기 신청을 하면 «차감 안 되는 연기» 로 인정되나 */
export function postponeIsFree(classStartMs: number, nowMs: number): { free: boolean; minutes_before: number } {
  const mb = Math.floor((classStartMs - nowMs) / 60000);
  return { free: mb > POSTPONE_FREE_MINUTES_GT, minutes_before: mb };
}

// ───────────────────────── 청구서 ─────────────────────────
export interface PlannedSession { date: string; start?: string; minutes: number; unit: number | null; schedule_id?: number; }
export interface StudentPlan {
  uid: string;
  name: string;
  sessions: PlannedSession[];
  /** 청구에서 뺐나와 그 이유(사람이 뺐음 · 개인 결제 · 카페24 수업 등) */
  excluded?: string | null;
}
export interface InvoiceLine {
  uid: string; name: string; count: number; dates: string[]; pattern_ko: string; pattern_en: string;
  amount: number; units: number[]; no_price: number; excluded: string | null;
}
export interface InvoiceCalc {
  kind: 'monthly' | 'topup';
  month: string;
  lines: InvoiceLine[];
  students: number;
  sessions: number;
  planned_krw: number;
  balance_krw: number;
  committed_krw: number;
  credit_krw: number;
  debt_krw: number;
  due_krw: number;
  no_price_sessions: number;
  explain_ko: string[];
  explain_en: string[];
}

/** 「화 4회 (6·13·20·27일)」 — 문제 ⑩: 학생마다 요일과 날짜를 그대로 보여 준다 */
export function patternOf(dates: string[]): { ko: string; en: string } {
  if (!dates.length) return { ko: '수업 없음', en: 'no classes' };
  const byDow: Record<number, string[]> = {};
  for (const d of dates) { const w = dowOf(d); (byDow[w] = byDow[w] || []).push(d); }
  const ks = Object.keys(byDow).map(Number).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const ko = ks.map(w => `${DOW_KO[w]} ${byDow[w].length}회`).join(' · ');
  const en = ks.map(w => `${DOW_EN[w]}×${byDow[w].length}`).join(' · ');
  const days = dates.map(d => String(Number(d.slice(8, 10)))).join('·');
  return { ko: `${ko} (${days}일)`, en: `${en} (${days})` };
}

/**
 * 청구서 계산.
 *   monthly: 다음 달 수업료 − 월말 예상 잔액(지금 잔액 − 이번 달 남은 수업)
 *   topup  : 이번 달 남은 수업이 잔액보다 많을 때 «모자란 만큼만» (첫 달 · 신규생 · 추가 수업)
 * ⛔ 금액을 음수로 만들지 않는다. 남는 돈은 «충전금으로 남는다» — 돌려주는 것은 사람이 정한다.
 */
export function computeInvoice(input: {
  kind: 'monthly' | 'topup';
  month: string;
  students: StudentPlan[];
  balanceKrw: number;
  /** 이번 달(청구 대상 달 «이전») 아직 안 한 수업의 합계 — 그만큼은 이미 쓰일 돈 */
  committedKrw: number;
  /** topup 에서 «새로 들어온 학생» 이름(설명용) */
  newStudents?: string[];
}): InvoiceCalc {
  const lines: InvoiceLine[] = [];
  let planned = 0, sessions = 0, noPrice = 0, students = 0;
  for (const s of input.students || []) {
    const dates = s.sessions.map(x => x.date).sort();
    const pat = patternOf(dates);
    let amount = 0, np = 0;
    const units: number[] = [];
    for (const x of s.sessions) {
      if (x.unit == null || !(x.unit > 0)) { np++; continue; }
      units.push(x.unit);
      amount += x.unit;
    }
    const excluded = s.excluded ? String(s.excluded) : null;
    lines.push({ uid: s.uid, name: s.name, count: dates.length, dates, pattern_ko: pat.ko, pattern_en: pat.en,
      amount: excluded ? 0 : amount, units, no_price: np, excluded });
    if (excluded) continue;
    students++;
    planned += amount;
    sessions += dates.length;
    noPrice += np;
  }
  const balance = Math.round(Number(input.balanceKrw) || 0);
  const committed = Math.max(0, Math.round(Number(input.committedKrw) || 0));
  const projected = balance - committed;
  const credit = Math.max(0, projected);
  const debt = Math.max(0, -projected);
  let due: number;
  if (input.kind === 'topup') due = Math.max(0, committed + planned - balance);
  else due = Math.max(0, planned - credit + debt);
  due = floor10(due);

  const calc: InvoiceCalc = {
    kind: input.kind, month: input.month, lines, students, sessions, planned_krw: planned,
    balance_krw: balance, committed_krw: committed, credit_krw: credit, debt_krw: debt, due_krw: due,
    no_price_sessions: noPrice, explain_ko: [], explain_en: [],
  };
  const ex = explainInvoice(calc, input.newStudents || []);
  calc.explain_ko = ex.ko; calc.explain_en = ex.en;
  return calc;
}

/**
 * 문제 ⑧ — «왜 이 금액인가» 를 사람이 설명하지 않아도 되게 문장으로 만든다.
 *   계산에 쓴 숫자만 쓴다(지어낸 숫자 0). 학원이 이 문장만 읽고 계산기로 다시 맞춰 볼 수 있어야 한다.
 */
export function explainInvoice(c: InvoiceCalc, newStudents: string[] = []): { ko: string[]; en: string[] } {
  const ko: string[] = [], en: string[] = [];
  const [, mm] = c.month.split('-');
  const mo = `${Number(mm)}월`;
  if (c.kind === 'monthly') {
    ko.push(`① ${mo} 수업료: 학생 ${c.students}명 · 수업 ${c.sessions}회 = ${won(c.planned_krw)} (학생마다 그 달 «실제 수업 날짜» 를 셌습니다)`);
    en.push(`① ${c.month} tuition: ${c.students} students · ${c.sessions} classes = ${won(c.planned_krw)} (each student's actual class dates that month)`);
    ko.push(`② 지금 충전금 ${won(c.balance_krw)} − 이번 달 남은 수업 ${won(c.committed_krw)} = 월말 예상 잔액 ${won(c.balance_krw - c.committed_krw)}`);
    en.push(`② Balance now ${won(c.balance_krw)} − rest of this month ${won(c.committed_krw)} = expected month-end balance ${won(c.balance_krw - c.committed_krw)}`);
    if (c.debt_krw > 0) {
      ko.push(`③ 청구액 = ${won(c.planned_krw)} + 모자란 금액 ${won(c.debt_krw)} = ${won(c.due_krw)}`);
      en.push(`③ Amount due = ${won(c.planned_krw)} + shortfall ${won(c.debt_krw)} = ${won(c.due_krw)}`);
    } else {
      ko.push(`③ 청구액 = ${won(c.planned_krw)} − 남는 충전금 ${won(c.credit_krw)} = ${won(c.due_krw)}`);
      en.push(`③ Amount due = ${won(c.planned_krw)} − remaining credit ${won(c.credit_krw)} = ${won(c.due_krw)}`);
    }
  } else {
    const who = newStudents.length ? ` (새로 온 학생: ${newStudents.slice(0, 5).join(', ')}${newStudents.length > 5 ? ' 외' : ''})` : '';
    ko.push(`① 이번 달(${mo}) 남은 수업 ${won(c.committed_krw + c.planned_krw)}${who}`);
    en.push(`① Remaining classes this month (${c.month}): ${won(c.committed_krw + c.planned_krw)}`);
    ko.push(`② 지금 충전금 ${won(c.balance_krw)} → 모자란 ${won(c.due_krw)} 만 지금 청구합니다 (다음 달 것이 아닙니다 · 첫 달은 남은 회차만큼만)`);
    en.push(`② Balance ${won(c.balance_krw)} → we only bill the shortfall ${won(c.due_krw)} now (not next month; the first month covers remaining classes only)`);
  }
  if (c.kind === 'monthly') {
    ko.push('※ 이 금액은 발행일 기준으로 고정됩니다. 그 뒤 생긴 결석·연기·새 학생은 충전금에 그대로 반영돼 다음 달 청구서 ②에서 정산됩니다.');
    en.push('※ This amount is fixed on the issue date. Later changes (absences, postponements, new students) stay in the balance and are settled in next month\'s ②.');
  }
  // 문제 ⑩ — 주 횟수가 같은데 회차가 다른 학생이 섞여 있으면 그 이유를 먼저 말한다
  const perWeek1 = c.lines.filter(l => !l.excluded && l.count > 0 && new Set(l.dates.map(d => dowOf(d))).size === 1);
  const counts = new Set(perWeek1.map(l => l.count));
  if (counts.size > 1) {
    ko.push(`※ 같은 «주 1회» 라도 요일에 따라 이 달은 ${[...counts].sort().join('·')}회로 다릅니다 — 달력에 그 요일이 몇 번 있는지만큼 셉니다(학생별 날짜를 아래에 적었습니다).`);
    en.push(`※ «Once a week» students differ (${[...counts].sort().join('/')} classes) because each weekday appears a different number of times this month.`);
  }
  ko.push('※ 연기(수업 30분 전까지 연락)·강사 결석·공휴일·휴원은 차감하지 않고 충전금으로 그대로 남습니다.');
  en.push('※ Postponed (30+ min notice), teacher absence, holidays and leave are never deducted — the money stays as credit.');
  if (c.no_price_sessions > 0) {
    ko.push(`⚠️ 단가가 정해지지 않은 수업 ${c.no_price_sessions}회는 금액에 넣지 않았습니다 — 본사가 단가를 정하면 다시 계산됩니다.`);
    en.push(`⚠️ ${c.no_price_sessions} classes have no price yet and are not included.`);
  }
  return { ko, en };
}

// ───────────────────────── 잔액 알림 (문제 ②) ─────────────────────────
export function balanceAlert(balanceKrw: number, upcomingKrw: number): 'ok' | 'low' | 'empty' {
  const b = Number(balanceKrw) || 0, u = Number(upcomingKrw) || 0;
  if (u <= 0) return 'ok';
  if (b <= 0) return 'empty';
  if (b < u) return 'low';
  return 'ok';
}

// ───────────────────────── 자동 문자 일정 (문제 ⑦) ─────────────────────────
/**
 * 사장님 결정(2026-10-01): 20일 청구 · D-7 → D-day → D+14 예고 → D+21 재등록 잠금(후보) ·
 *   부분 입금은 해제 안 함 · 첫 달은 문자만(잠금 없음).
 *   마감(D-day) = 청구 대상 달의 1일. 보충 청구서(topup)는 발행일 + 3일.
 * 오늘 보낼 단계 하나를 돌려준다. 이미 보낸 단계는 sent 에 있다. 없으면 null.
 *   ⛔ 지난 단계를 «몰아서» 보내지 않는다 — 오늘 해당하는 단계 하나만.
 */
export type ReminderStep = 'issued' | 'd_minus_7' | 'd_day' | 'd_plus_14' | 'd_plus_21';
export const REMINDER_ORDER: ReminderStep[] = ['issued', 'd_minus_7', 'd_day', 'd_plus_14', 'd_plus_21'];

export function dueDateOf(inv: { kind: string; month: string; issued_on?: string | null }): string {
  if (inv.kind === 'topup') return addDays(String(inv.issued_on || `${inv.month}-01`), 3);
  return `${inv.month}-01`;
}

export function reminderStepToday(inv: {
  kind: string; month: string; issued_on?: string | null; status: string; due_krw: number; paid_krw?: number; first_month?: boolean;
}, todayYmd: string, sent: string[] = []): ReminderStep | null {
  const owed = Math.max(0, (Number(inv.due_krw) || 0) - (Number(inv.paid_krw) || 0));
  if (inv.status === 'paid' || inv.status === 'void' || owed <= 0) return null;
  const due = dueDateOf(inv);
  const d = daysBetween(due, todayYmd);   // 음수 = 마감 전
  const want: ReminderStep | null =
    inv.issued_on === todayYmd ? 'issued'
    : d === -7 ? 'd_minus_7'
    : d === 0 ? 'd_day'
    : d === 14 ? 'd_plus_14'
    : d === 21 ? 'd_plus_21'
    : null;
  if (!want) return null;
  if (want === 'd_plus_21' && inv.first_month) return null;   // 첫 달은 잠금 단계 없음(문자만)
  if (sent.indexOf(want) >= 0) return null;
  return want;
}

/** 연체 단계 — 화면 배지용. 부분 입금은 해제하지 않는다(사장님 결정). */
export function overdueLevel(inv: { kind: string; month: string; issued_on?: string | null; status: string; due_krw: number; paid_krw?: number; first_month?: boolean }, todayYmd: string):
  'none' | 'due_soon' | 'overdue' | 'warn' | 'lock_candidate' {
  const owed = Math.max(0, (Number(inv.due_krw) || 0) - (Number(inv.paid_krw) || 0));
  if (inv.status === 'paid' || inv.status === 'void' || owed <= 0) return 'none';
  const d = daysBetween(dueDateOf(inv), todayYmd);
  if (d < -7) return 'none';
  if (d < 0) return 'due_soon';
  if (d < 14) return 'overdue';
  if (d < 21 || inv.first_month) return 'warn';
  return 'lock_candidate';
}

/** 학원에 보낼 문자 (짧게 · 링크 하나). 금액·마감은 계산된 값만. */
export function reminderText(step: ReminderStep, inv: { shop_name: string; month: string; kind: string; due_krw: number; paid_krw?: number; issued_on?: string | null }, link: string): string {
  const owed = Math.max(0, (Number(inv.due_krw) || 0) - (Number(inv.paid_krw) || 0));
  const mo = `${Number(inv.month.slice(5, 7))}월`;
  const due = dueDateOf(inv);
  const dueTxt = `${Number(due.slice(5, 7))}/${Number(due.slice(8, 10))}`;
  const what = inv.kind === 'topup' ? `${mo} 충전금 보충` : `${mo} 수업료`;
  const head = `[망고아이] ${inv.shop_name}`;
  switch (step) {
    case 'issued':    return `${head}\n${what} 청구서가 나왔습니다: ${won(owed)} (마감 ${dueTxt})\n학생별 날짜·계산 근거 확인·결제:\n${link}`;
    case 'd_minus_7': return `${head}\n${what} ${won(owed)} 마감이 7일 남았습니다 (${dueTxt}).\n${link}`;
    case 'd_day':     return `${head}\n오늘이 ${what} 마감일입니다: ${won(owed)}\n${link}`;
    case 'd_plus_14': return `${head}\n${what} ${won(owed)} 이 14일째 미납입니다. 일주일 안에 결제가 없으면 다음 달 수업 등록이 멈출 수 있습니다.\n${link}`;
    case 'd_plus_21': return `${head}\n${what} ${won(owed)} 미납으로 다음 달 수업 등록 보류 대상이 되었습니다. 결제하시면 바로 풀립니다.\n${link}`;
  }
}

// ───────────────────────── A.i 차이 진단 (문제 ⑧ · 샘플 4) ─────────────────────────
export interface LedgerItemLite { date: string; state: LedgerState; deduct: boolean; postpone_minutes_before?: number | null; }
export interface DiagnoseRow { uid: string; name: string; ours: number; theirs: number | null; diff: number; reasons_ko: string[]; reasons_en: string[]; }

/**
 * 학원이 «우리 계산» 을 적어 보내면, 학생마다 회차 원장과 비교해 «어느 날이 왜 다른지» 를 말한다.
 *   차감 회차 수(ours) 대 학원 숫자(theirs). 다르면 그 달의 «애매한 날» 을 먼저 짚는다:
 *   결석(연락 없음)·늦은 연기·미정·연기·강사 결석·휴원·공휴일.
 *   ⛔ 결론을 지어내지 않는다 — «이 날이 원인일 수 있습니다» 까지만, 날짜와 상태는 실제 기록.
 */
export function diagnoseCounts(
  rows: Array<{ uid: string; name: string; items: LedgerItemLite[] }>,
  theirs: Record<string, number | null | undefined>,
): DiagnoseRow[] {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const out: DiagnoseRow[] = [];
  for (const r of rows) {
    const ours = r.items.filter(i => i.deduct).length;
    const tRaw = theirs[r.uid];
    const t = tRaw == null || (tRaw as any) === '' || !Number.isFinite(Number(tRaw)) ? null : Math.round(Number(tRaw));
    const diff = t == null ? 0 : ours - t;
    const ko: string[] = [], en: string[] = [];
    if (t != null && diff !== 0) {
      const pick = (st: LedgerState) => r.items.filter(i => i.state === st).map(i => md(i.date));
      const absent = pick('student_absent'), late = pick('late_postpone'), unk = pick('unknown');
      const post = pick('postponed'), ta = pick('teacher_absent'), lv = pick('leave'), hol = pick('holiday');
      if (diff > 0) {   // 우리가 더 셌다
        if (absent.length) { ko.push(`${absent.join('·')} 결석(연락 없음)으로 차감했습니다 — 학원에서 연기로 알고 계시면, 30분 전 연기 신청 기록이 없습니다.`); en.push(`${absent.join(', ')} counted as no-show (no postpone request on record).`); }
        if (late.length) { ko.push(`${late.join('·')} 은 수업 30분 안쪽에 연기를 요청해 결석 처리됐습니다.`); en.push(`${late.join(', ')} postponed less than 30 min before → counted.`); }
        if (!absent.length && !late.length) { ko.push('수업한 날이 학원 기록보다 많습니다 — 아래 날짜별 표에서 «완료» 날을 맞춰 보세요.'); en.push('More completed classes than your record — compare the «Done» dates.'); }
      } else {          // 학원이 더 셌다
        if (post.length) { ko.push(`${post.join('·')} 연기(30분 전 연락)는 차감하지 않았습니다.`); en.push(`${post.join(', ')} postponed in time — not counted.`); }
        if (ta.length) { ko.push(`${ta.join('·')} 은 강사 결석이라 차감하지 않고 보강합니다.`); en.push(`${ta.join(', ')} teacher absent — not counted.`); }
        if (lv.length) { ko.push(`${lv.join('·')} 휴원 기간은 차감하지 않았습니다.`); en.push(`${lv.join(', ')} on leave — not counted.`); }
        if (hol.length) { ko.push(`${hol.join('·')} 공휴일은 차감하지 않았습니다.`); en.push(`${hol.join(', ')} holiday — not counted.`); }
        if (unk.length) { ko.push(`${unk.join('·')} 은 출석 기록이 없어 «미정» 으로 두고 차감하지 않았습니다 — 본사가 확인합니다.`); en.push(`${unk.join(', ')} have no record ("unknown") — not counted yet.`); }
        if (!ko.length) { ko.push('학원 기록에 있는 수업이 시스템 일정에 없습니다 — 일정이 등록되지 않았을 수 있습니다.'); en.push('A class in your record is not in our schedule.'); }
      }
    }
    out.push({ uid: r.uid, name: r.name, ours, theirs: t, diff, reasons_ko: ko, reasons_en: en });
  }
  return out;
}

/** 학원이 붙여 넣은 「이름 횟수」 줄들을 학생 uid 로 맞춘다(이름 완전일치 + 후보가 하나일 때만). */
export function parseTheirCounts(text: string, students: Array<{ uid: string; name: string }>): { counts: Record<string, number>; unmatched: string[] } {
  const counts: Record<string, number> = {}; const unmatched: string[] = [];
  const byName = new Map<string, string[]>();
  for (const s of students) { const k = String(s.name || '').replace(/\s+/g, ''); if (!k) continue; byName.set(k, [...(byName.get(k) || []), s.uid]); }
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(.+?)[\s,:\t]+(\d{1,2})\s*회?\s*$/.exec(line);
    if (!m) { unmatched.push(line); continue; }
    const cand = byName.get(m[1].replace(/\s+/g, '')) || [];
    if (cand.length !== 1) { unmatched.push(line); continue; }
    counts[cand[0]] = Number(m[2]);
  }
  return { counts, unmatched };
}
