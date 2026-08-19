// ────────────────────────────────────────────────────────────────────────────
// 🚗 영업담당자 실적·인사평가·보상 — /api/admin/sales/*
//
// 왜 만들었나 (2026-08-18 사장님 지시):
//   전국 지사·학원을 돌며 화상영어를 파는 영업담당자가 «현재 1명» 있는데,
//   그 사람이 하루 종일 무엇을 했는지가 **어디에도 남지 않는다.**
//   강사는 수업이 자동으로 기록돼 인사평가가 돌아가지만(teacher_evaluations),
//   영업은 차를 타고 나가면 기록이 0이다. 그래서 —
//     · 열심히 해도 «계약이 없으면 논 것» 처럼 보이고
//     · 왜 안 되는지(방문이 적은 건지, 상담이 약한 건지) 구분이 안 되고
//     · 사람이 나가면 거래처 정보가 통째로 사라진다.
//
// 설계 원칙 — 4가지. 이걸 깨면 제도가 아니라 서류가 된다.
//   ① **본인이 자기 실적 숫자를 타이핑하지 않는다.**
//      계약 수·학생 수·유지율은 계약표(sales_deals)와 활동기록에서 서버가 «세어서» 만든다.
//      사람이 자기 점수의 재료를 입력하는 순간 그 숫자는 못 믿게 된다.
//      (강사 급여 결재함 approval-hr.ts 가 같은 이유로 «숫자를 서버가 채운다» 를 지킨다)
//   ② **100점 중 85점은 자동, 사람이 매기는 건 15점뿐.**
//      태도·차량관리·협업만 사람 몫이다. 나머지에 주관이 들어가면 «왜 이 점수냐» 가 시작된다.
//   ③ **자료가 없는 항목은 0점이 아니라 «해당없음»** 이다.
//      입사·도입 초기엔 3개월 유지율을 잴 수 없다. 그걸 0점으로 매기면 아무도 못 버틴다.
//      → 적용 가능한 항목의 만점 합으로 환산한다(applicable_max).
//   ④ **담당자가 한 명이라 상대평가·등급 강제배분을 하지 않는다.**
//      비교 대상은 «미리 정한 목표» 와 «지난 반기의 자기 자신» 둘뿐이다.
//
// 등급 기준은 강사 인사평가(api-admin.ts hrGradeLabel)와 **같은 임계값**을 쓴다.
//   회사 안에서 A 등급의 뜻이 두 개면 안 되기 때문이다.
//
// 권한:
//   · 전체 조회·평가 확정 = 본사 계정(hq/staff)만.
//   · 영업담당자 본인    = sales_reps.admin_username 으로 연결된 계정. 자기 것만 읽고,
//                          자기 영업일지·후보학원만 쓴다. 평가 점수는 못 고친다.
//   · 강사              = index.ts TEACHER_BLOCKED_PREFIXES 에서 통째로 차단.
//   · 지사·대리점       = isAgencyAllowedApi 미등록 → 미들웨어가 403.
//
// ⚠️ 이 API 는 급여를 «지급» 하지 않는다. 계산해서 보여줄 뿐이다.
//    실제 지급은 사람이 이체하고, 지급 사실만 나중에 기록한다(paid_at).
// ────────────────────────────────────────────────────────────────────────────

import { getAdminActor } from './auth-admin';
import { oncePerIsolate } from './once-per-isolate';

interface SalesEnv {
  DB: D1Database;
  [k: string]: any;
}

const json = (data: any, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/* ═══════════════════════════════════════════════════════════════════════════
 * 상수 — 제도의 «숫자» 는 전부 여기 한 곳에 모은다.
 *   화면에서 바꿀 수 있는 것(기본급·건당 성과급·목표치)은 표에 저장하고,
 *   제도 자체인 것(배점·등급·유지판정 기간)만 코드에 둔다.
 * ═════════════════════════════════════════════════════════════════════════ */

/** 100점 배점. 자동 85 + 사람 15. 합이 100 이 아니면 하니스가 아니라 사람이 먼저 알아챈다. */
export const SALES_EVAL_WEIGHTS = {
  // ── 실적 60 (결과로 나온 것) ──
  deals: 25,          // 신규 계약 학원 수
  students: 20,       // 신규 등록 학생 수
  retention: 15,      // 3개월 유지율
  // ── 활동 25 (결과가 나오기 전의 씨앗) ──
  visits: 10,         // 방문·상담 건수
  new_leads: 5,       // 신규 발굴 등록
  care_visits: 5,     // 기존 학원 관리방문
  diary: 5,           // 영업일지 성실도
  // ── 태도·기본 15 (사람이 보는 것) ──
  reporting: 5,       // 보고 마감 준수
  vehicle: 5,         // 차량·비용 관리
  teamwork: 5,        // 협업 평가
} as const;

export const SALES_AUTO_KEYS = ['deals', 'students', 'retention', 'visits', 'new_leads', 'care_visits', 'diary'] as const;
export const SALES_MANUAL_KEYS = ['reporting', 'vehicle', 'teamwork'] as const;

/** 항목 이름 — 화면과 «근거 분석» 이 같은 말을 쓰도록 서버가 정본을 준다. */
const SALES_LABELS: Record<string, string> = {
  deals: '신규 계약 학원 수',
  students: '신규 등록 학생 수',
  retention: '3개월 유지율',
  visits: '방문·상담 건수',
  new_leads: '신규 발굴 등록',
  care_visits: '기존 학원 관리방문',
  diary: '영업일지 성실도',
  reporting: '보고 마감 준수',
  vehicle: '차량·비용 관리',
  teamwork: '협업 평가',
};

/** 등급 임계값 — 강사 인사평가(api-admin.ts hrGradeLabel)와 **같은 칸**. 따로 놀면 안 된다. */
export function salesGrade(total: number | null): string | null {
  if (total == null || isNaN(total)) return null;
  if (total >= 90) return 'A+';
  if (total >= 85) return 'A';
  if (total >= 80) return 'B+';
  if (total >= 75) return 'B';
  if (total >= 70) return 'C+';
  if (total >= 65) return 'C';
  return 'D';
}

/** 반기 상여 배율. 1명이라 강제배분은 없다 — 절대평가 결과를 그대로 곱한다. */
export const SALES_BONUS_MULTIPLIER: Record<string, number> = {
  'A+': 1.5, 'A': 1.2, 'B+': 1.0, 'B': 0.8, 'C+': 0.5, 'C': 0.3, 'D': 0,
};

/**
 * 제도의 «금액·목표» 기본값 — 2026-08-18 사장님 확정.
 *   기본급 230만원(현재 실지급액) · 계약 1곳당 성과급 60만원 · 월 목표 2곳.
 *
 * ⚠️ 여기 값은 «새 담당자를 등록할 때 미리 채워지는 값» 일 뿐이다.
 *    담당자마다 다르게 주려면 화면에서 그 사람 것만 고치면 되고, 그 값이 정본이 된다.
 *    (코드를 고쳐야 금액이 바뀌는 구조로 만들면, 급여 협상 때마다 배포가 필요해진다)
 */
export const SALES_DEFAULTS = {
  base_salary_krw: 2300000,
  incentive_per_deal_krw: 600000,
  target_deals: 2,
  target_students: 20,
  target_visits: 48,
  target_leads: 20,
  target_care: 8,
};

/** 「3개월 유지」의 기준일 수. 계약일 + 이 일수가 지나야 유지 여부를 «잴 수 있다». */
const RETENTION_DAYS = 90;

/** 성과급 분할 비율 — 계약 시 50%, 3개월 유지 확인 시 50%.
 *  ⛔ 이미 준 돈을 회수(clawback)하지 않는다. 한국에서 임금성 금품 회수는 분쟁 소지가 크다.
 *     «처음부터 절반만 주고 나중에 마저 준다» 로 같은 효과를 낸다. */
const INCENTIVE_FIRST_RATE = 0.5;

/** 파이프라인 6단계. 숫자로 저장하는 이유 — 「어디서 막혔나」를 세려면 순서가 있어야 한다. */
export const SALES_STAGES = [
  { n: 1, key: 'lead',    ko: '발굴' },
  { n: 2, key: 'contact', ko: '접촉' },
  { n: 3, key: 'visit',   ko: '방문상담' },
  { n: 4, key: 'propose', ko: '제안·시연' },
  { n: 5, key: 'contract',ko: '계약' },
  { n: 6, key: 'settled', ko: '개원·정착' },
];

/** 활동 종류. visit/demo/meeting 은 «신규 영업», manage 는 «기존 학원 관리» 로 따로 센다. */
const ACTIVITY_KINDS = ['visit', 'call', 'meeting', 'demo', 'manage', 'other'];
const NEW_SALES_KINDS = ['visit', 'meeting', 'demo'];

/* ═══════════════════════════════════════════════════════════════════════════
 * 스키마
 * ═════════════════════════════════════════════════════════════════════════ */

const ensureSchema = oncePerIsolate<SalesEnv>(async (env) => {
  // 영업담당자 — 기본급·건당 성과급·월 목표는 «화면에서 바꾸는 값» 이라 표에 둔다.
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS sales_reps (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  name TEXT NOT NULL,`,
    `  phone TEXT,`,
    `  email TEXT,`,
    `  admin_username TEXT,`,
    `  region TEXT,`,
    `  hired_at TEXT,`,
    `  base_salary_krw INTEGER DEFAULT ${SALES_DEFAULTS.base_salary_krw},`,
    `  incentive_per_deal_krw INTEGER DEFAULT ${SALES_DEFAULTS.incentive_per_deal_krw},`,
    `  target_deals INTEGER DEFAULT ${SALES_DEFAULTS.target_deals},`,
    `  target_students INTEGER DEFAULT ${SALES_DEFAULTS.target_students},`,
    `  target_visits INTEGER DEFAULT ${SALES_DEFAULTS.target_visits},`,
    `  target_leads INTEGER DEFAULT ${SALES_DEFAULTS.target_leads},`,
    `  target_care INTEGER DEFAULT ${SALES_DEFAULTS.target_care},`,
    `  program_started_at TEXT,`,
    `  active INTEGER DEFAULT 1,`,
    `  notes TEXT,`,
    `  created_at INTEGER NOT NULL,`,
    `  updated_at INTEGER NOT NULL`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_sales_reps_active ON sales_reps(active);`);
  // 이미 만들어진 DB 에 칸이 없을 때(재배포 호환) — 있으면 SQLite 가 throw 하므로 흡수한다.
  for (const ddl of [
    `ALTER TABLE sales_reps ADD COLUMN program_started_at TEXT;`,
    `ALTER TABLE sales_deals ADD COLUMN retention_source TEXT;`,
    `ALTER TABLE sales_deals ADD COLUMN retention_evidence TEXT;`,
  ]) {
    try { await env.DB.exec(ddl); } catch { /* duplicate column — 정상 */ }
  }

  // 후보 학원(파이프라인). center_id 는 계약 후 실제 학원과 연결되면 채운다.
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS sales_leads (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  rep_id INTEGER NOT NULL,`,
    `  name TEXT NOT NULL,`,
    `  region TEXT,`,
    `  address TEXT,`,
    `  contact_name TEXT,`,
    `  contact_phone TEXT,`,
    `  stage INTEGER DEFAULT 1,`,
    `  status TEXT DEFAULT 'active',`,
    `  source TEXT,`,
    `  center_id INTEGER,`,
    `  next_action TEXT,`,
    `  next_action_at TEXT,`,
    `  last_contact_at TEXT,`,
    `  lost_reason TEXT,`,
    `  notes TEXT,`,
    `  created_at INTEGER NOT NULL,`,
    `  updated_at INTEGER NOT NULL`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_sales_leads_rep ON sales_leads(rep_id, stage);`);

  // 영업일지 — 하루 3분. raw_voice 는 «말한 원문» 을 그대로 남긴다(AI 정리가 틀렸을 때의 원본).
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS sales_activities (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  rep_id INTEGER NOT NULL,`,
    `  lead_id INTEGER,`,
    `  activity_date TEXT NOT NULL,`,
    `  kind TEXT NOT NULL,`,
    `  title TEXT,`,
    `  note TEXT,`,
    `  outcome TEXT,`,
    `  next_action TEXT,`,
    `  stage_after INTEGER,`,
    `  raw_voice TEXT,`,
    `  created_by TEXT,`,
    `  created_at INTEGER NOT NULL`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_sales_act_rep_date ON sales_activities(rep_id, activity_date);`);

  // 계약 — 성과급의 근거. retained_3m 은 «아직 모름(null)» 과 «유지 실패(0)» 를 구분한다.
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS sales_deals (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  rep_id INTEGER NOT NULL,`,
    `  lead_id INTEGER,`,
    `  center_id INTEGER,`,
    `  center_name TEXT NOT NULL,`,
    `  region TEXT,`,
    `  contract_date TEXT NOT NULL,`,
    `  students_initial INTEGER DEFAULT 0,`,
    `  students_3m INTEGER,`,
    `  retained_3m INTEGER,`,
    `  retention_checked_at TEXT,`,
    `  retention_source TEXT,`,
    `  retention_evidence TEXT,`,
    `  incentive_total_krw INTEGER,`,
    `  paid_first_krw INTEGER DEFAULT 0,`,
    `  paid_first_at TEXT,`,
    `  paid_second_krw INTEGER DEFAULT 0,`,
    `  paid_second_at TEXT,`,
    `  notes TEXT,`,
    `  created_at INTEGER NOT NULL,`,
    `  updated_at INTEGER NOT NULL`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_sales_deals_rep_date ON sales_deals(rep_id, contract_date);`);

  // 월 목표 — 담당자 기본 목표를 그 달만 다르게 하고 싶을 때(명절·시험기간 등).
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS sales_targets (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  rep_id INTEGER NOT NULL,`,
    `  period TEXT NOT NULL,`,
    `  target_deals INTEGER,`,
    `  target_students INTEGER,`,
    `  target_visits INTEGER,`,
    `  target_leads INTEGER,`,
    `  target_care INTEGER,`,
    `  workdays INTEGER,`,
    `  notes TEXT,`,
    `  updated_at INTEGER NOT NULL,`,
    `  UNIQUE(rep_id, period)`,
    `);`
  ].join(' '));

  // 평가 — 사람이 매긴 3개 + 확정 스냅샷. 자동 점수는 저장하지 않고 «그때 값» 을 snapshot 에 언다.
  //   (원본 데이터가 나중에 바뀌어도 «그때 무엇을 보고 A 를 줬는지» 가 남아야 한다)
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS sales_evaluations (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  rep_id INTEGER NOT NULL,`,
    `  period TEXT NOT NULL,`,
    `  score_reporting REAL,`,
    `  score_vehicle REAL,`,
    `  score_teamwork REAL,`,
    `  auto_total REAL,`,
    `  final_total REAL,`,
    `  grade TEXT,`,
    `  bonus_krw INTEGER,`,
    `  strengths TEXT,`,
    `  improvements TEXT,`,
    `  snapshot TEXT,`,
    `  evaluator TEXT,`,
    `  evaluated_at INTEGER,`,
    `  UNIQUE(rep_id, period)`,
    `);`
  ].join(' '));
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 기간 — 'YYYY-MM' (월) 또는 'YYYY-H1' / 'YYYY-H2' (반기) 둘 다 받는다.
 *   평가는 반기, 성과급은 월이라 두 가지가 다 필요하다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface PeriodRange { start: string; end: string; months: string[]; label: string; kind: 'month' | 'half' }

export function parsePeriod(p: string): PeriodRange | null {
  const s = String(p || '').trim();
  let m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]);
    return {
      start: `${m[1]}-${m[2]}-01`,
      end: lastDay(y, mo),
      months: [`${m[1]}-${m[2]}`],
      label: `${y}년 ${mo}월`,
      kind: 'month',
    };
  }
  m = /^(\d{4})-H([12])$/i.exec(s);
  if (m) {
    const y = Number(m[1]), h = Number(m[2]);
    const first = h === 1 ? 1 : 7;
    const months: string[] = [];
    for (let i = 0; i < 6; i++) months.push(`${m[1]}-${String(first + i).padStart(2, '0')}`);
    return {
      start: `${m[1]}-${String(first).padStart(2, '0')}-01`,
      end: lastDay(y, first + 5),
      months,
      label: `${y}년 ${h === 1 ? '상반기' : '하반기'}`,
      kind: 'half',
    };
  }
  return null;
}

function lastDay(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return `${year}-${String(month).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 근무일(평일) 수 — 영업일지 성실도의 분모. 공휴일은 세지 않는다(연도별 표를 두면 매년 관리 대상이 된다).
 *  ⚠️ 그래서 이 값은 «약간 빡빡한» 분모다. 목표표(sales_targets.workdays)로 그 달만 덮어쓸 수 있다. */
function weekdaysBetween(startISO: string, endISO: string): number {
  const s = new Date(startISO + 'T00:00:00Z').getTime();
  const e = new Date(endISO + 'T00:00:00Z').getTime();
  if (!(s <= e)) return 0;
  let n = 0;
  for (let t = s; t <= e; t += 86400000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/** 계약일 + 90일이 지났는지 — 유지율을 «잴 수 있는» 계약만 분모에 넣기 위한 판정. */
function maturedBy(contractDate: string, asOfISO: string): boolean {
  const c = new Date(contractDate + 'T00:00:00Z').getTime();
  const a = new Date(asOfISO + 'T00:00:00Z').getTime();
  if (isNaN(c) || isNaN(a)) return false;
  return (a - c) >= RETENTION_DAYS * 86400000;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 목표치 — 담당자 기본값 위에 월별 예외를 덮는다.
 * ═════════════════════════════════════════════════════════════════════════ */

interface Targets { deals: number; students: number; visits: number; leads: number; care: number; workdays: number }

async function resolveTargets(env: SalesEnv, rep: any, range: PeriodRange): Promise<Targets> {
  const base = {
    deals: Number(rep?.target_deals ?? SALES_DEFAULTS.target_deals),
    students: Number(rep?.target_students ?? SALES_DEFAULTS.target_students),
    visits: Number(rep?.target_visits ?? SALES_DEFAULTS.target_visits),
    leads: Number(rep?.target_leads ?? SALES_DEFAULTS.target_leads),
    care: Number(rep?.target_care ?? SALES_DEFAULTS.target_care),
  };
  const out: Targets = { deals: 0, students: 0, visits: 0, leads: 0, care: 0, workdays: 0 };
  // 달마다 한 줄씩 읽는다. 최대 6줄이라 IN 절(파라미터 100 제한)을 쓸 이유가 없다.
  for (const mo of range.months) {
    const row: any = await env.DB.prepare(
      `SELECT target_deals, target_students, target_visits, target_leads, target_care, workdays
         FROM sales_targets WHERE rep_id = ? AND period = ?`
    ).bind(rep.id, mo).first().catch(() => null);
    out.deals    += num(row?.target_deals,    base.deals);
    out.students += num(row?.target_students, base.students);
    out.visits   += num(row?.target_visits,   base.visits);
    out.leads    += num(row?.target_leads,    base.leads);
    out.care     += num(row?.target_care,     base.care);
    const [y, m] = mo.split('-').map(Number);
    out.workdays += num(row?.workdays, weekdaysBetween(`${mo}-01`, lastDay(y, m)));
  }
  return out;
}

function num(v: any, fallback: number): number {
  const n = Number(v);
  return (v == null || isNaN(n)) ? fallback : n;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 자동 채점 — 85점. 여기가 이 파일의 심장이다.
 *
 * 점수식: 달성률(실적/목표)을 1.0 에서 자른 뒤 배점을 곱한다.
 *   초과 달성에 «점수» 로 더 주지 않는 이유 — 100점 상한이 깨지고, 초과분은 이미
 *   건당 정액 성과급으로 «돈» 에서 비례 보상되기 때문이다(이중 보상 방지).
 * ═════════════════════════════════════════════════════════════════════════ */

export interface ScoreItem {
  key: string; label: string; weight: number;
  actual: number | null; target: number | null;
  rate: number | null;   // 달성률 (자르지 않은 원값 — 초과달성이 보여야 한다)
  score: number | null;  // null = 해당없음(자료 부족)
  reason: string;
}

function scoreOf(key: string, actual: number, target: number): ScoreItem {
  const weight = (SALES_EVAL_WEIGHTS as any)[key] as number;
  const label = SALES_LABELS[key];
  if (!(target > 0)) {
    return { key, label, weight, actual, target, rate: null, score: null,
             reason: '목표가 정해지지 않아 채점하지 않았습니다(해당없음).' };
  }
  const rate = actual / target;
  const score = Math.round(Math.min(1, rate) * weight * 100) / 100;
  return {
    key, label, weight, actual, target, rate: Math.round(rate * 1000) / 1000, score,
    reason: `목표 ${target} 중 ${actual} 달성(${Math.round(rate * 100)}%) → ${weight}점 중 ${score}점`
      + (rate > 1 ? ' · 초과분은 성과급으로 지급됩니다' : ''),
  };
}

export async function computeAutoScores(env: SalesEnv, rep: any, range: PeriodRange, asOf: string) {
  const t = await resolveTargets(env, rep, range);
  const items: ScoreItem[] = [];

  // ── 실적 ──────────────────────────────────────────────────────────────
  const dealRows: any = await env.DB.prepare(
    `SELECT id, center_name, contract_date, students_initial, students_3m, retained_3m, retention_source
       FROM sales_deals WHERE rep_id = ? AND contract_date >= ? AND contract_date <= ?`
  ).bind(rep.id, range.start, range.end).all().catch(() => ({ results: [] }));
  const deals: any[] = dealRows?.results || [];

  items.push(scoreOf('deals', deals.length, t.deals));

  const students = deals.reduce((a, d) => a + num(d.students_3m, num(d.students_initial, 0)), 0);
  items.push(scoreOf('students', students, t.students));

  // 유지율 — 90일이 지났고 «판정이 끝난» 계약만 분모.
  //   ⚠️ (2026-08-18 수정) 처음엔 «90일 지난 계약» 전부를 분모에 넣었다. 그러면
  //      사람이 유지 확인 버튼을 안 눌러 둔 계약이 **자동으로 실패로 계산**돼,
  //      담당자가 아무 잘못 없이 점수를 잃는다. 확인 전(null)은 양쪽 어디에도 넣지 않는다.
  //      (설계 원칙 ③ — 자료가 없으면 0점이 아니라 «해당없음»)
  const matured = deals.filter(d => maturedBy(String(d.contract_date), asOf));
  const decided = matured.filter(d => Number(d.retained_3m) === 1 || Number(d.retained_3m) === 0);
  const pending = matured.length - decided.length;
  if (decided.length === 0) {
    items.push({
      key: 'retention', label: SALES_LABELS.retention, weight: SALES_EVAL_WEIGHTS.retention,
      actual: null, target: null, rate: null, score: null,
      reason: matured.length === 0
        ? `3개월(${RETENTION_DAYS}일)이 지난 계약이 아직 없어 유지율을 잴 수 없습니다(해당없음).`
        : `3개월이 지난 계약 ${matured.length}곳이 아직 «유지 확인 전»이라 채점하지 않았습니다(해당없음).`,
    });
  } else {
    const kept = decided.filter(d => Number(d.retained_3m) === 1).length;
    const rate = kept / decided.length;
    items.push({
      key: 'retention', label: SALES_LABELS.retention, weight: SALES_EVAL_WEIGHTS.retention,
      actual: kept, target: decided.length, rate: Math.round(rate * 1000) / 1000,
      score: Math.round(rate * SALES_EVAL_WEIGHTS.retention * 100) / 100,
      reason: `3개월이 지난 계약 중 판정 끝난 ${decided.length}곳에서 ${kept}곳 유지(${Math.round(rate * 100)}%)`
        + (pending > 0 ? ` · 확인 전 ${pending}곳은 채점에서 제외` : ''),
    });
  }

  // ── 활동 ──────────────────────────────────────────────────────────────
  const actAgg: any = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN kind IN ('visit','meeting','demo') THEN 1 ELSE 0 END) AS new_sales,
       SUM(CASE WHEN kind = 'manage' THEN 1 ELSE 0 END)                    AS care,
       COUNT(DISTINCT activity_date)                                        AS days
     FROM sales_activities
     WHERE rep_id = ? AND activity_date >= ? AND activity_date <= ?`
  ).bind(rep.id, range.start, range.end).first().catch(() => null);

  items.push(scoreOf('visits', num(actAgg?.new_sales, 0), t.visits));

  const leadAgg: any = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM sales_leads
      WHERE rep_id = ? AND date(created_at/1000,'unixepoch') >= ? AND date(created_at/1000,'unixepoch') <= ?`
  ).bind(rep.id, range.start, range.end).first().catch(() => null);
  items.push(scoreOf('new_leads', num(leadAgg?.c, 0), t.leads));

  items.push(scoreOf('care_visits', num(actAgg?.care, 0), t.care));

  // 영업일지 성실도 — 근무일 중 일지를 남긴 날의 비율. 분모가 0 이면 채점하지 않는다.
  const diaryDays = num(actAgg?.days, 0);
  items.push(scoreOf('diary', diaryDays, t.workdays));

  const applicable = items.filter(i => i.score != null);
  const earned = applicable.reduce((a, i) => a + (i.score as number), 0);
  const applicableMax = applicable.reduce((a, i) => a + i.weight, 0);

  return {
    items,
    targets: t,
    deal_count: deals.length,
    student_count: students,
    earned: Math.round(earned * 100) / 100,
    applicable_max: applicableMax,
    skipped: items.filter(i => i.score == null).map(i => i.key),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 총점 환산 — 자동(적용가능분) + 사람 15 → 100점
 *   자료가 없어 건너뛴 항목이 있으면, 남은 항목의 만점 합으로 «비율 환산» 한다.
 *   0점 처리하면 도입 초기에 D 등급만 나온다. 그건 평가가 아니라 사고다.
 * ═════════════════════════════════════════════════════════════════════════ */

export function finalTotal(
  autoEarned: number, autoApplicableMax: number,
  manual: { reporting?: number | null; vehicle?: number | null; teamwork?: number | null }
): { total: number | null; manual_sum: number | null; manual_max: number; converted: boolean } {
  const mVals = [manual?.reporting, manual?.vehicle, manual?.teamwork];
  const manualGiven = mVals.every(v => v != null && !isNaN(Number(v)));
  const manualSum = manualGiven ? mVals.reduce((a: number, v: any) => a + Number(v), 0) : null;
  const manualMax = SALES_EVAL_WEIGHTS.reporting + SALES_EVAL_WEIGHTS.vehicle + SALES_EVAL_WEIGHTS.teamwork;

  if (autoApplicableMax <= 0) return { total: null, manual_sum: manualSum, manual_max: manualMax, converted: false };

  const earned = autoEarned + (manualSum ?? 0);
  const max = autoApplicableMax + (manualGiven ? manualMax : 0);
  if (max <= 0) return { total: null, manual_sum: manualSum, manual_max: manualMax, converted: false };

  const total = Math.round((earned / max) * 100 * 100) / 100;
  const converted = max < 100;
  return { total, manual_sum: manualSum, manual_max: manualMax, converted };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 성과급 — 그 달에 «실제로 나갈 돈» 을 센다.
 *   1차: 그 달에 계약한 건 × 50%
 *   2차: 그 달에 «3개월 유지» 가 확인된 건 × 50%
 * ═════════════════════════════════════════════════════════════════════════ */

export async function computeCompensation(env: SalesEnv, rep: any, range: PeriodRange) {
  const perDeal = num(rep?.incentive_per_deal_krw, 0);

  const firstRows: any = await env.DB.prepare(
    `SELECT id, center_name, contract_date, incentive_total_krw, paid_first_krw, paid_first_at
       FROM sales_deals WHERE rep_id = ? AND contract_date >= ? AND contract_date <= ?
       ORDER BY contract_date ASC`
  ).bind(rep.id, range.start, range.end).all().catch(() => ({ results: [] }));

  const secondRows: any = await env.DB.prepare(
    `SELECT id, center_name, contract_date, retention_checked_at, incentive_total_krw, paid_second_krw, paid_second_at
       FROM sales_deals WHERE rep_id = ? AND retained_3m = 1
         AND retention_checked_at >= ? AND retention_checked_at <= ?
       ORDER BY retention_checked_at ASC`
  ).bind(rep.id, range.start, range.end).all().catch(() => ({ results: [] }));

  const first = (firstRows?.results || []).map((d: any) => ({
    deal_id: d.id, center_name: d.center_name, on: d.contract_date,
    amount: Math.round(num(d.incentive_total_krw, perDeal) * INCENTIVE_FIRST_RATE),
    paid: num(d.paid_first_krw, 0) > 0, paid_at: d.paid_first_at || null,
    why: '계약 체결 — 성과급 1차(50%)',
  }));
  const second = (secondRows?.results || []).map((d: any) => ({
    deal_id: d.id, center_name: d.center_name, on: d.retention_checked_at,
    amount: Math.round(num(d.incentive_total_krw, perDeal) * (1 - INCENTIVE_FIRST_RATE)),
    paid: num(d.paid_second_krw, 0) > 0, paid_at: d.paid_second_at || null,
    why: `계약 후 ${RETENTION_DAYS}일 유지 확인 — 성과급 2차(50%)`,
  }));

  const incentive = [...first, ...second].reduce((a, r) => a + r.amount, 0);
  const base = range.kind === 'month' ? num(rep?.base_salary_krw, 0) : 0;

  return {
    base_salary_krw: base,
    incentive_krw: incentive,
    total_krw: base + incentive,
    lines: [...first, ...second],
    per_deal_krw: perDeal,
    first_rate: INCENTIVE_FIRST_RATE,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 📏 기준선 기간 — 「제도가 신입일 때는 평가를 돈에 연결하지 않는다」
 *
 * 왜 (2026-08-18 사장님과 논의):
 *   지금 계신 담당자는 신입이 아니지만 **제도는 신입**이다. 지금까지 기록 없이
 *   일해 왔기 때문에 「월 2곳」이 쉬운 목표인지 무리인지 아무도 모른다.
 *   기록 0인 상태에서 정한 목표로 사람을 평가하면 그건 평가가 아니라 **추측**이다.
 *   → 시작 후 90일은 점수를 «내되» 상여에 연결하지 않는다(참고용).
 *
 * 끄는 법: sales_reps.program_started_at 을 90일보다 이전 날짜로 두면 자동 해제된다.
 * ═════════════════════════════════════════════════════════════════════════ */

export const BASELINE_DAYS = 90;

/** 이 담당자의 기준선 종료일. program_started_at 이 없으면 등록일을 시작으로 본다. */
export function baselineUntil(rep: any): string | null {
  let start = String(rep?.program_started_at || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    if (rep?.created_at) start = new Date(Number(rep.created_at)).toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  return new Date(new Date(start + 'T00:00:00Z').getTime() + BASELINE_DAYS * 86400000)
    .toISOString().slice(0, 10);
}

/** 이 기간의 평가가 «참고용» 인가 — 기간이 기준선 안에서 끝나면 참고용이다. */
export function isAdvisoryPeriod(rep: any, range: PeriodRange): boolean {
  const b = baselineUntil(rep);
  if (!b) return false;
  return range.end <= b;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🔁 유지율 «자동» 판정 — 사람이 버튼을 잊어도 담당자가 손해 보지 않게
 *
 * 왜 (2026-08-18):
 *   처음엔 「유지됨/이탈」을 사람이 눌러야 성과급 2차 50% 가 나가게 만들었다.
 *   그러면 **사장님이 바쁜 달에는 담당자 월급이 밀린다.** 제도가 사람의 부지런함에
 *   의존하면 언젠가 반드시 깨진다.
 *   망고아이에는 이미 학원별 학생·수업 데이터가 있다. 그걸 보면 «아직 수업 중인가»는
 *   기계가 답할 수 있다. 사람은 **애매한 것만** 보면 된다.
 *
 * 판정 규칙 (students_erp.shop_name = 학원 이름, attendance = 실제 수업 참석)
 *   · 활성 학생 ≥ 1  그리고  최근 30일 수업 기록 ≥ 1   → 유지(1)
 *   · 활성 학생 = 0  그리고  그 학원 학생 기록은 있음   → 이탈(0)
 *   · 학원 이름이 학생 명부에 아예 없음                 → 판정 불가 → 사람에게
 *   · 학생은 살아 있는데 최근 수업이 0건               → 판정 불가 → 사람에게
 *       (방학·휴원일 수 있다. 여기서 이탈로 찍으면 담당자 돈을 빼앗는 셈이다)
 *
 * ⚠️ 애매하면 «유지» 쪽으로 기울이지 않는다. **사람에게 넘긴다.**
 *    돈이 걸린 판정에서 기계가 추측하면, 그 추측이 틀린 날 신뢰가 통째로 무너진다.
 * ═════════════════════════════════════════════════════════════════════════ */

const RETENTION_RECENT_DAYS = 30;
const ACTIVE_STATUSES = "('정상','활동','active')";

export interface RetentionVerdict {
  decided: number | null;          // 1 유지 · 0 이탈 · null 판정 불가
  reason: string;                  // 사람이 읽는 근거 한 줄
  evidence: any;                   // 숫자 근거(감사용)
}

/** 계약의 학원 이름을 학생 명부(students_erp.shop_name)에 맞춘다.
 *  ⚠️ 학원 이름은 유일하지 않다(CLAUDE.md — centers.name 함정). 여러 곳에 걸리면
 *     «모름» 으로 두고 사람에게 넘긴다. 아무 쪽에 붙이면 그게 더 큰 사고다. */
async function resolveShopName(env: SalesEnv, centerName: string): Promise<{ shop: string; how: string } | null> {
  const name = String(centerName || '').trim();
  if (!name) return null;
  try {
    const exact: any = await env.DB.prepare(
      `SELECT shop_name, COUNT(*) AS c FROM students_erp WHERE shop_name = ? GROUP BY shop_name`
    ).bind(name).all();
    const ex = exact?.results || [];
    if (ex.length === 1) return { shop: String(ex[0].shop_name), how: 'exact' };
    if (ex.length > 1) return null;   // 같은 이름이 여러 줄 — 그룹했는데 여러 개면 이상하다. 사람에게.

    const like: any = await env.DB.prepare(
      `SELECT shop_name, COUNT(*) AS c FROM students_erp WHERE shop_name LIKE ? GROUP BY shop_name LIMIT 5`
    ).bind(name + '%').all();
    const lk = like?.results || [];
    if (lk.length === 1) return { shop: String(lk[0].shop_name), how: 'prefix' };
    return null;
  } catch {
    return null;   // students_erp 가 없는 환경(테스트 등) — 조용히 «판정 불가»
  }
}

export async function judgeRetention(env: SalesEnv, deal: any, asOf: string): Promise<RetentionVerdict> {
  const matched = await resolveShopName(env, deal?.center_name);
  if (!matched) {
    return {
      decided: null,
      reason: `학생 명부에서 «${String(deal?.center_name || '')}» 학원을 찾지 못했습니다. 사람이 확인해 주세요.`,
      evidence: { matched: false },
    };
  }

  let total = 0, active = 0, recent = 0;
  try {
    const t: any = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM students_erp WHERE shop_name = ?`
    ).bind(matched.shop).first();
    total = num(t?.c, 0);
    const a: any = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM students_erp WHERE shop_name = ? AND status IN ${ACTIVE_STATUSES}`
    ).bind(matched.shop).first();
    active = num(a?.c, 0);
    const since = new Date(new Date(asOf + 'T00:00:00Z').getTime() - RETENTION_RECENT_DAYS * 86400000)
      .toISOString().slice(0, 10);
    // ⚠️ IN (서브쿼리) 로 쓴다 — 학생 uid 를 목록으로 만들면 D1 파라미터 100개 제한에 걸린다.
    const r: any = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM attendance
        WHERE date >= ? AND user_id IN (SELECT user_id FROM students_erp WHERE shop_name = ?)`
    ).bind(since, matched.shop).first();
    recent = num(r?.c, 0);
  } catch {
    return { decided: null, reason: '학생·수업 기록을 읽지 못했습니다. 사람이 확인해 주세요.', evidence: { matched: true, error: true } };
  }

  const ev = { matched: true, shop: matched.shop, how: matched.how, total, active, recent, recent_days: RETENTION_RECENT_DAYS };

  if (active >= 1 && recent >= 1) {
    return { decided: 1, reason: `${matched.shop} — 활성 학생 ${active}명, 최근 ${RETENTION_RECENT_DAYS}일 수업 ${recent}건 → 유지`, evidence: ev };
  }
  if (active === 0 && total >= 1) {
    return { decided: 0, reason: `${matched.shop} — 등록 학생 ${total}명이 모두 비활성 → 이탈`, evidence: ev };
  }
  if (active >= 1 && recent === 0) {
    return { decided: null, reason: `${matched.shop} — 학생 ${active}명은 살아 있는데 최근 ${RETENTION_RECENT_DAYS}일 수업 기록이 없습니다(방학·휴원일 수 있음). 사람이 확인해 주세요.`, evidence: ev };
  }
  return { decided: null, reason: `${matched.shop} — 판정 근거가 부족합니다. 사람이 확인해 주세요.`, evidence: ev };
}

/** 90일이 지났는데 아직 판정이 없는 계약을 훑어 자동으로 채운다.
 *  cron(매일 09:00 KST)과 화면의 «지금 자동 판정» 버튼이 같은 함수를 쓴다 —
 *  두 경로가 다른 규칙을 쓰면 어느 쪽이 맞는지 아무도 모르게 된다. */
export async function runSalesRetentionSweep(env: SalesEnv, limit = 200): Promise<{
  checked: number; kept: number; lost: number; needs_human: number;
}> {
  await ensureSchema(env);
  const asOf = todayISO();
  const rows: any = await env.DB.prepare(
    `SELECT id, rep_id, center_name, contract_date FROM sales_deals
      WHERE retained_3m IS NULL ORDER BY contract_date ASC LIMIT ?`
  ).bind(limit).all().catch(() => ({ results: [] }));

  let checked = 0, kept = 0, lost = 0, human = 0;
  for (const d of (rows?.results || [])) {
    if (!maturedBy(String(d.contract_date), asOf)) continue;   // 아직 90일 전 — 건드리지 않는다
    checked++;
    const v = await judgeRetention(env, d, asOf);
    if (v.decided == null) {
      human++;
      // 판정은 못 했어도 «왜 못 했는지» 는 남긴다. 사람이 화면에서 그 이유를 보고 누른다.
      await env.DB.prepare(
        `UPDATE sales_deals SET retention_evidence = ?, updated_at = ? WHERE id = ?`
      ).bind(JSON.stringify({ verdict: 'needs_human', reason: v.reason, evidence: v.evidence, at: asOf }), Date.now(), d.id)
       .run().catch(() => null);
      continue;
    }
    if (v.decided === 1) kept++; else lost++;
    await env.DB.prepare(
      `UPDATE sales_deals SET retained_3m = ?, retention_checked_at = ?, retention_source = 'auto',
         retention_evidence = ?, updated_at = ? WHERE id = ? AND retained_3m IS NULL`
    ).bind(v.decided, asOf, JSON.stringify({ reason: v.reason, evidence: v.evidence, at: asOf }), Date.now(), d.id)
     .run().catch(() => null);
  }
  return { checked, kept, lost, needs_human: human };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🎤 말로 쓰는 영업일지 — 「타이핑을 요구하면 3주째부터 아무도 안 쓴다」
 *
 * 흐름: 브라우저 음성인식(한국어) → 이 API → 학원·종류·단계·다음 할 일 초안 →
 *       사람이 «틀린 것만» 고치고 저장.
 *
 * ⚠️ 자동화는 «빠른 길» 이지 «유일한 길» 이 아니다(결재함 work.html 과 같은 원칙).
 *    AI 가 죽어도 규칙 기반 폴백이 초안을 만들고, 그것도 실패하면 직접 입력이 그대로 남는다.
 *    그래서 이 API 는 **절대 실패를 돌려주지 않는다** — 최소한 원문은 note 에 담아 준다.
 *
 * ⚠️ 학원 이름은 «지어내지» 않는다. 이 담당자의 후보 학원 목록 안에서만 고른다.
 *    LLM 이 그럴듯한 학원 이름을 만들어 내면 그게 그대로 실적 기록이 된다.
 * ═════════════════════════════════════════════════════════════════════════ */

const DIARY_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct',
];

const DIARY_SYSTEM_PROMPT = [
  '너는 한국 학원 영업담당자의 말을 받아 영업일지 초안을 만드는 도우미다.',
  '반드시 JSON 하나만 출력한다. 설명·인사말·코드펜스 금지.',
  '형식: {"lead_name":string|null,"kind":string,"stage_after":number|null,"outcome":string,"next_action":string}',
  'kind 는 정확히 다음 중 하나: visit(방문상담) call(전화) meeting(미팅) demo(시연) manage(기존 학원 관리방문) other(기타).',
  'stage_after 는 1~6 중 하나 또는 null. 1 발굴, 2 접촉, 3 방문상담, 4 제안·시연, 5 계약, 6 개원·정착.',
  'lead_name 은 사용자가 말한 학원 이름을 그대로 적는다. 말하지 않았으면 null. 절대 지어내지 않는다.',
  'outcome 은 오늘 있었던 일을 한 문장으로. next_action 은 다음에 할 일을 한 문장으로. 없으면 빈 문자열.',
  '모든 값은 한국어로 쓴다.',
].join('\n');

const KIND_RULES: Array<{ k: string; re: RegExp }> = [
  { k: 'manage',  re: /관리\s*방문|점검|사후\s*관리|기존\s*학원/ },
  { k: 'demo',    re: /시연|데모|보여\s*드|체험\s*수업/ },
  { k: 'call',    re: /전화|통화|콜|연락(했|드렸)/ },
  { k: 'meeting', re: /미팅|회의|만나(서|기로)|면담/ },
  { k: 'visit',   re: /방문|찾아가|들렀|다녀왔|상담/ },
];

const STAGE_RULES: Array<{ n: number; re: RegExp }> = [
  { n: 6, re: /개원|첫\s*수업|정착|학생\s*등록\s*완료/ },
  { n: 5, re: /계약|도장|사인|체결/ },
  { n: 4, re: /제안|견적|시연|단가표|제안서/ },
  { n: 3, re: /방문\s*상담|찾아가|들렀|원장님(과|을)\s*만/ },
  { n: 2, re: /전화|통화|연락|첫\s*접촉/ },
];

/** 이름 비교용 정규화 — 「둔산 세종어학원」과 「둔산세종어학원」을 같게 본다. */
function normName(s: any): string {
  return String(s == null ? '' : s).toLowerCase().replace(/[\s()·・\-_,.]/g, '');
}

/** 말한 학원 이름을 이 담당자의 후보 학원에서 찾는다. 못 찾으면 null(=지어내지 않음). */
function matchLead(spoken: string, leads: any[]): any | null {
  const n = normName(spoken);
  if (!n) return null;
  let hit = leads.filter(l => normName(l.name) === n)[0];
  if (hit) return hit;
  hit = leads.filter(l => normName(l.name).indexOf(n) >= 0 || n.indexOf(normName(l.name)) >= 0)[0];
  return hit || null;
}

/** 원문 전체에서 후보 학원 이름이 등장하는지 찾는다(AI 가 학원을 못 뽑았을 때의 그물). */
function findLeadInText(text: string, leads: any[]): any | null {
  const t = normName(text);
  if (!t) return null;
  let best: any = null;
  for (const l of leads) {
    const n = normName(l.name);
    if (n.length >= 2 && t.indexOf(n) >= 0) {
      if (!best || n.length > normName(best.name).length) best = l;
    }
  }
  return best;
}

/** 규칙 기반 초안 — AI 가 없거나 실패해도 «빈 화면» 을 주지 않기 위한 바닥. */
export function parseDiaryByRules(text: string, leads: any[]): any {
  const t = String(text || '');
  let kind = 'visit';
  for (const r of KIND_RULES) { if (r.re.test(t)) { kind = r.k; break; } }
  let stage: number | null = null;
  for (const r of STAGE_RULES) { if (r.re.test(t)) { stage = r.n; break; } }

  // 문장 나누기 — 다음 할 일은 «다음/재방문/보내/준비» 가 든 문장에 있을 확률이 높다.
  const sentences = t.split(/(?<=[.!?。])\s+|\n+/).map(x => x.trim()).filter(Boolean);
  const nextRe = /다음|내일|다음\s*주|재방문|보내|준비|예정|하기로|약속/;
  const nextSent = sentences.filter(x => nextRe.test(x))[0] || '';
  const outSent = sentences.filter(x => x !== nextSent)[0] || t.slice(0, 200);

  const lead = findLeadInText(t, leads);
  return {
    lead_id: lead ? lead.id : null,
    lead_name: lead ? lead.name : null,
    kind, stage_after: stage,
    outcome: outSent.slice(0, 300),
    next_action: nextSent.slice(0, 300),
    note: t.slice(0, 2000),
    source: 'rules',
  };
}

async function parseDiaryByAI(env: SalesEnv, text: string, leads: any[]): Promise<any | null> {
  if (!env.AI) return null;
  const names = leads.slice(0, 40).map(l => l.name).join(' / ');
  const user = (names ? `이 담당자가 관리 중인 학원 목록: ${names}\n\n` : '') + `받아쓴 말:\n${text}`;
  for (const model of DIARY_MODELS) {
    try {
      const res: any = await env.AI.run(model, {
        messages: [
          { role: 'system', content: DIARY_SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        max_tokens: 420,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      const raw = String(res?.response || res?.result?.response || '').trim();
      let parsed: any = null;
      try { parsed = JSON.parse(raw); }
      catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; }
      if (!parsed) continue;

      // ── 화이트리스트 검증. LLM 이 뭘 뱉든 여기서 걸러진다. ──
      const kind = ACTIVITY_KINDS.indexOf(String(parsed.kind || '')) >= 0 ? String(parsed.kind) : null;
      let stage: number | null = null;
      const sn = Number(parsed.stage_after);
      if (!isNaN(sn) && sn >= 1 && sn <= 6) stage = Math.round(sn);

      const lead = parsed.lead_name ? matchLead(String(parsed.lead_name), leads) : null;
      const fallbackLead = lead || findLeadInText(text, leads);

      const rules = parseDiaryByRules(text, leads);
      return {
        lead_id: fallbackLead ? fallbackLead.id : null,
        lead_name: fallbackLead ? fallbackLead.name : null,
        // 학원을 말했는데 목록에 없으면 «새 학원일 수 있다» 고 알려 준다(자동 등록은 하지 않는다).
        unknown_lead: (parsed.lead_name && !fallbackLead) ? String(parsed.lead_name).slice(0, 100) : null,
        kind: kind || rules.kind,
        stage_after: stage != null ? stage : rules.stage_after,
        outcome: String(parsed.outcome || rules.outcome || '').slice(0, 300),
        next_action: String(parsed.next_action || rules.next_action || '').slice(0, 300),
        note: text.slice(0, 2000),
        source: 'ai',
        model,
      };
    } catch { /* 다음 모델로 */ }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 🗺 오늘 어디부터 갈까 — 방문 우선순위
 *
 * 왜: 전국에 학원은 수만 곳이다. 어디를 먼저 갈지 매일 아침 사람이 고민하면
 *     그 고민 시간만큼 방문이 준다. 하루 동선이 짧아지면 방문 건수는 그냥 올라간다.
 *
 * ⚠️ AI 를 쓰지 않는다. 규칙으로 점수를 매긴다.
 *    「왜 이 학원을 추천했는지」를 한 줄로 설명할 수 있어야 사람이 따른다.
 *    LLM 이 「느낌상 여기」라고 하면 아무도 그 순서를 신뢰하지 않는다.
 * ═════════════════════════════════════════════════════════════════════════ */

/** 단계별 기본 점수 — 계약에 가까울수록 한 번의 방문이 비싸다. */
const STAGE_WEIGHT: Record<number, number> = { 1: 8, 2: 14, 3: 24, 4: 30, 5: 20, 6: 6 };

/** 이 날짜로부터 며칠 지났나. 날짜가 없으면 null. */
function daysSince(dateStr: any, asOf: string): number | null {
  const d = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = new Date(d + 'T00:00:00Z').getTime();
  const a = new Date(asOf + 'T00:00:00Z').getTime();
  if (isNaN(t) || isNaN(a)) return null;
  return Math.round((a - t) / 86400000);
}

export async function computeNextVisits(env: SalesEnv, repId: number, asOf: string, limit = 10) {
  const rs: any = await env.DB.prepare(
    `SELECT id, name, region, stage, contact_name, contact_phone, next_action, next_action_at, last_contact_at
       FROM sales_leads WHERE rep_id = ? AND status = 'active' LIMIT 500`
  ).bind(repId).all().catch(() => ({ results: [] }));
  const leads: any[] = rs?.results || [];

  // 지역별 활성 후보 수 — 같은 지역에 여러 곳이 있으면 하루에 묶어서 돌 수 있다.
  const byRegion: Record<string, number> = {};
  for (const l of leads) {
    const r = String(l.region || '').trim();
    if (r) byRegion[r] = (byRegion[r] || 0) + 1;
  }

  // 이미 계약한 학원의 지역 — 근처에 «잘 되는 곳» 이 있으면 그게 가장 강한 영업 자료다.
  const dealRs: any = await env.DB.prepare(
    `SELECT region, COUNT(*) AS c FROM sales_deals WHERE rep_id = ? AND COALESCE(region,'') <> '' GROUP BY region`
  ).bind(repId).all().catch(() => ({ results: [] }));
  const wonRegion: Record<string, number> = {};
  for (const d of (dealRs?.results || [])) wonRegion[String(d.region)] = num(d.c, 0);

  const scored = leads.map(l => {
    const reasons: string[] = [];
    let score = STAGE_WEIGHT[Number(l.stage)] ?? 8;
    reasons.push(`${SALES_STAGES[Math.max(0, Math.min(5, Number(l.stage) - 1))].ko} 단계`);

    // 방치 일수 — 오래 안 만나면 식는다. 21일에서 상한을 둔다(무한정 올라가면 죽은 리드가 1위가 된다).
    const idle = daysSince(l.last_contact_at, asOf);
    if (idle == null) {
      score += 14;
      reasons.push('아직 한 번도 접촉 기록 없음');
    } else if (idle >= 7) {
      score += Math.min(21, idle);
      reasons.push(`${idle}일째 연락 없음`);
    }

    // 스스로 적어 둔 «다음 할 일» 의 예정일 — 이걸 넘기면 약속을 어긴 것이다.
    const due = daysSince(l.next_action_at, asOf);
    if (due != null) {
      if (due > 0) { score += 25; reasons.push(`예정일 ${due}일 지남`); }
      else if (due >= -1) { score += 18; reasons.push('오늘·내일 예정'); }
      else if (due >= -3) { score += 10; reasons.push('사흘 안 예정'); }
    }

    const region = String(l.region || '').trim();
    if (region && (byRegion[region] || 0) > 1) {
      score += Math.min(10, ((byRegion[region] || 1) - 1) * 3);
      reasons.push(`같은 지역에 ${byRegion[region]}곳 — 묶어서 방문 가능`);
    }
    if (region && (wonRegion[region] || 0) > 0) {
      score += 8;
      reasons.push(`근처에 이미 계약한 학원 ${wonRegion[region]}곳 — 사례로 쓸 수 있음`);
    }

    return {
      lead_id: l.id, name: l.name, region: l.region, stage: l.stage,
      stage_ko: SALES_STAGES[Math.max(0, Math.min(5, Number(l.stage) - 1))].ko,
      contact_name: l.contact_name, contact_phone: l.contact_phone,
      next_action: l.next_action, next_action_at: l.next_action_at,
      last_contact_at: l.last_contact_at, idle_days: idle,
      score: Math.round(score), reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** 관리방문이 오래 끊긴 계약 학원 — 유지율(15점·성과급 2차)의 실제 원인이다. */
export async function computeCareDue(env: SalesEnv, repId: number, asOf: string, gapDays = 45, limit = 10) {
  const rs: any = await env.DB.prepare(
    `SELECT d.id, d.center_name, d.region, d.contract_date, d.lead_id,
            (SELECT MAX(a.activity_date) FROM sales_activities a
              WHERE a.rep_id = d.rep_id AND a.kind = 'manage'
                AND (a.lead_id = d.lead_id OR a.title = d.center_name)) AS last_care
       FROM sales_deals d
      WHERE d.rep_id = ? AND COALESCE(d.retained_3m, 1) = 1
      ORDER BY d.contract_date DESC LIMIT 200`
  ).bind(repId).all().catch(() => ({ results: [] }));

  const out: any[] = [];
  for (const d of (rs?.results || [])) {
    const since = daysSince(d.last_care, asOf);
    const sinceContract = daysSince(d.contract_date, asOf);
    const gap = since != null ? since : sinceContract;
    if (gap == null || gap < gapDays) continue;
    out.push({
      deal_id: d.id, center_name: d.center_name, region: d.region,
      last_care: d.last_care || null, gap_days: gap,
      reason: d.last_care
        ? `관리방문한 지 ${gap}일 지났습니다`
        : `계약 후 ${gap}일 동안 관리방문 기록이 없습니다`,
    });
  }
  out.sort((a, b) => b.gap_days - a.gap_days);
  return out.slice(0, limit);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 위험한 학원 — 「빠져나가기 전에」 알려 준다
 *
 * 왜: 유지율은 평가 15점이자 성과급 2차 50% 의 조건이다. 그래서 이 알림은
 *     영업담당자에게 **직접 돈이 걸린 알림**이 된다 — 그래서 무시하지 않는다.
 *
 * 판정 재료 (유지율 자동 판정과 같은 원천을 쓴다 — 두 화면의 숫자가 어긋나면 안 된다)
 *   · 최근 30일 수업 건수 vs 그 앞 30일  → 줄었나
 *   · 활성 학생 수                        → 남아 있나
 *   · 30일 안에 수강 만료되는 학생 수      → 곧 빠지나
 * ═════════════════════════════════════════════════════════════════════════ */

export interface AtRiskItem {
  deal_id: number; rep_id: number; center_name: string; shop: string | null;
  level: 'high' | 'medium' | 'low' | 'unknown';
  active: number; recent30: number; prev30: number; drop: number | null; expiring: number;
  reason: string;
}

export async function computeAtRisk(env: SalesEnv, repId: number | null, asOf: string, limit = 40): Promise<AtRiskItem[]> {
  const rs: any = await env.DB.prepare(
    repId == null
      ? `SELECT id, rep_id, center_name FROM sales_deals WHERE COALESCE(retained_3m,1) = 1 ORDER BY contract_date DESC LIMIT ?`
      : `SELECT id, rep_id, center_name FROM sales_deals WHERE rep_id = ? AND COALESCE(retained_3m,1) = 1 ORDER BY contract_date DESC LIMIT ?`
  ).bind(...(repId == null ? [limit] : [repId, limit])).all().catch(() => ({ results: [] }));

  const d30 = (n: number) => new Date(new Date(asOf + 'T00:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
  const since30 = d30(30), since60 = d30(60);
  const until30 = new Date(new Date(asOf + 'T00:00:00Z').getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const out: AtRiskItem[] = [];
  for (const d of (rs?.results || [])) {
    const matched = await resolveShopName(env, d.center_name);
    if (!matched) {
      out.push({
        deal_id: d.id, rep_id: d.rep_id, center_name: d.center_name, shop: null,
        level: 'unknown', active: 0, recent30: 0, prev30: 0, drop: null, expiring: 0,
        reason: '학생 명부에서 이 학원을 찾지 못해 상태를 알 수 없습니다.',
      });
      continue;
    }
    let active = 0, recent30 = 0, prev30 = 0, expiring = 0;
    try {
      const a: any = await env.DB.prepare(
        `SELECT
           SUM(CASE WHEN status IN ('정상','활동','active') THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN COALESCE(end_date,'') <> '' AND end_date >= ? AND end_date <= ? THEN 1 ELSE 0 END) AS expiring
         FROM students_erp WHERE shop_name = ?`
      ).bind(asOf, until30, matched.shop).first();
      active = num(a?.active, 0);
      expiring = num(a?.expiring, 0);
      const c: any = await env.DB.prepare(
        `SELECT
           SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS recent30,
           SUM(CASE WHEN date >= ? AND date < ? THEN 1 ELSE 0 END) AS prev30
         FROM attendance
        WHERE date >= ? AND user_id IN (SELECT user_id FROM students_erp WHERE shop_name = ?)`
      ).bind(since30, since60, since30, since60, matched.shop).first();
      recent30 = num(c?.recent30, 0);
      prev30 = num(c?.prev30, 0);
    } catch {
      continue;   // 명부·출석 표가 없는 환경 — 조용히 건너뛴다
    }

    const drop = prev30 > 0 ? Math.round((1 - recent30 / prev30) * 100) / 100 : null;
    let level: AtRiskItem['level'] = 'low';
    let reason = `활성 학생 ${active}명 · 최근 30일 수업 ${recent30}건 — 특이 신호 없음`;

    if (active === 0) {
      level = 'high';
      reason = '활성 학생이 0명입니다. 이미 빠져나갔을 수 있습니다.';
    } else if (recent30 === 0 && prev30 > 0) {
      level = 'high';
      reason = `최근 30일 수업이 0건입니다(그 전 30일에는 ${prev30}건). 지금 들르세요.`;
    } else if (drop != null && drop >= 0.4) {
      level = 'high';
      reason = `수업이 ${Math.round(drop * 100)}% 줄었습니다 (${prev30}건 → ${recent30}건).`;
    } else if (drop != null && drop >= 0.2) {
      level = 'medium';
      reason = `수업이 ${Math.round(drop * 100)}% 줄었습니다 (${prev30}건 → ${recent30}건).`;
    } else if (expiring >= 3) {
      level = 'medium';
      reason = `30일 안에 ${expiring}명이 수강 만료됩니다. 재등록 상담이 필요합니다.`;
    }

    out.push({ deal_id: d.id, rep_id: d.rep_id, center_name: d.center_name, shop: matched.shop,
               level, active, recent30, prev30, drop, expiring, reason });
  }

  const rank: Record<string, number> = { high: 0, medium: 1, unknown: 2, low: 3 };
  out.sort((a, b) => rank[a.level] - rank[b.level]);
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 📰 주간·월간 보고서 — 사람이 보고서를 쓰지 않는다
 *
 * ⚠️ 사실(숫자)은 전부 서버가 «세어서» 만든다. AI 는 «총평 두 문장» 만 쓴다.
 *    숫자까지 AI 에게 맡기면 보고서가 그럴듯하게 틀린다. 그건 없는 것보다 나쁘다.
 * ═════════════════════════════════════════════════════════════════════════ */

/** 지난주(월~일) 구간. offset 0 = 이번 주, 1 = 지난주. */
export function weekRange(asOf: string, offset = 1): { start: string; end: string; label: string } {
  const t = new Date(asOf + 'T00:00:00Z').getTime();
  const dow = new Date(t).getUTCDay();                 // 0=일
  const backToMon = (dow === 0 ? 6 : dow - 1);         // 이번 주 월요일까지
  const monThis = t - backToMon * 86400000;
  const mon = monThis - offset * 7 * 86400000;
  const sun = mon + 6 * 86400000;
  const iso = (x: number) => new Date(x).toISOString().slice(0, 10);
  return { start: iso(mon), end: iso(sun), label: offset === 0 ? '이번 주' : `${iso(mon)} ~ ${iso(sun)}` };
}

export async function buildSalesReport(env: SalesEnv, rep: any, start: string, end: string, asOf: string) {
  const act: any = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN kind IN ('visit','meeting','demo') THEN 1 ELSE 0 END) AS new_sales,
       SUM(CASE WHEN kind = 'manage' THEN 1 ELSE 0 END) AS care,
       SUM(CASE WHEN kind = 'call' THEN 1 ELSE 0 END) AS calls,
       COUNT(DISTINCT activity_date) AS days
     FROM sales_activities WHERE rep_id = ? AND activity_date >= ? AND activity_date <= ?`
  ).bind(rep.id, start, end).first().catch(() => null);

  const newLeads: any = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM sales_leads
      WHERE rep_id = ? AND date(created_at/1000,'unixepoch') >= ? AND date(created_at/1000,'unixepoch') <= ?`
  ).bind(rep.id, start, end).first().catch(() => null);

  const deals: any = await env.DB.prepare(
    `SELECT center_name, students_initial FROM sales_deals
      WHERE rep_id = ? AND contract_date >= ? AND contract_date <= ? ORDER BY contract_date ASC`
  ).bind(rep.id, start, end).all().catch(() => ({ results: [] }));

  const pipe: any = await env.DB.prepare(
    `SELECT stage, COUNT(*) AS c FROM sales_leads WHERE rep_id = ? AND status = 'active' GROUP BY stage`
  ).bind(rep.id).all().catch(() => ({ results: [] }));
  const byStage: Record<number, number> = {};
  for (const r of (pipe?.results || [])) byStage[Number(r.stage)] = num(r.c, 0);

  const nextVisits = await computeNextVisits(env, rep.id, asOf, 5);
  const careDue = await computeCareDue(env, rep.id, asOf, 45, 5);
  const atRisk = (await computeAtRisk(env, rep.id, asOf, 20)).filter(x => x.level === 'high' || x.level === 'medium').slice(0, 3);

  const dealRows: any[] = deals?.results || [];
  const facts = {
    period: { start, end },
    visits: num(act?.new_sales, 0),
    care: num(act?.care, 0),
    calls: num(act?.calls, 0),
    diary_days: num(act?.days, 0),
    new_leads: num(newLeads?.c, 0),
    deals: dealRows.map(d => ({ center_name: d.center_name, students: num(d.students_initial, 0) })),
    pipeline: SALES_STAGES.map(s => ({ ...s, count: byStage[s.n] || 0 })),
    next_visits: nextVisits,
    care_due: careDue,
    at_risk: atRisk,
    bottleneck: findBottleneck(byStage),
  };

  // ── 사람이 읽는 글 — 규칙으로 조립한다(숫자는 위에서 이미 확정됐다) ──
  const lines: string[] = [];
  lines.push(`[${rep.name}] ${start} ~ ${end}`);
  lines.push(`방문·상담 ${facts.visits}건 · 관리방문 ${facts.care}건 · 전화 ${facts.calls}건 · 일지 ${facts.diary_days}일 · 신규 발굴 ${facts.new_leads}곳`);
  if (facts.deals.length) {
    lines.push(`신규 계약 ${facts.deals.length}곳 — ${facts.deals.map(d => d.center_name).join(', ')}`);
  } else {
    lines.push('신규 계약 없음');
  }
  const p4 = byStage[4] || 0, p5 = byStage[5] || 0;
  lines.push(`진행 중: 제안·시연 ${p4}곳 · 계약 단계 ${p5}곳`);
  if (facts.bottleneck) lines.push(`막힌 곳: ${facts.bottleneck.label}`);
  if (facts.at_risk.length) {
    lines.push('위험 학원: ' + facts.at_risk.map(r => `${r.center_name}(${r.reason})`).join(' / '));
  }
  if (facts.next_visits.length) {
    lines.push('다음 주 우선 방문: ' + facts.next_visits.slice(0, 3).map(v => `${v.name}(${v.reasons[0]})`).join(', '));
  }
  if (facts.care_due.length) {
    lines.push('관리방문 필요: ' + facts.care_due.slice(0, 3).map(c => `${c.center_name}(${c.gap_days}일)`).join(', '));
  }

  return { facts, text: lines.join('\n') };
}

/** 월요일 아침 주간 보고 — 활성 담당자마다 한 건씩 알림큐에 넣는다. */
export async function runSalesWeeklyReport(env: SalesEnv): Promise<{ sent: number }> {
  await ensureSchema(env);
  const asOf = todayISO();
  const wk = weekRange(asOf, 1);
  const reps: any = await env.DB.prepare(`SELECT * FROM sales_reps WHERE active = 1`).all().catch(() => ({ results: [] }));
  let sent = 0;
  for (const rep of (reps?.results || [])) {
    const r = await buildSalesReport(env, rep, wk.start, wk.end, asOf);
    // 아무 활동도 없던 주는 보내지 않는다 — 빈 보고서가 매주 오면 아무도 안 읽는다.
    if (r.facts.visits === 0 && r.facts.calls === 0 && r.facts.care === 0 && r.facts.deals.length === 0) continue;
    const { enqueueNotification } = await import('./api-notify');
    await enqueueNotification(env as any, {
      type: 'sales_weekly',
      title: `영업 주간 보고 — ${rep.name} (${wk.start}~${wk.end})`,
      body: r.text,
      meta: { rep_id: rep.id, period: wk },
    });
    sent++;
  }
  return { sent };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⚖️ 공정성 감시 — AI 가 사장님 편이 아니라 «사실» 편에 선다
 *
 * 평가 제도가 무너지는 이유는 대부분 「부정확해서」가 아니라 「불공정하다고 느껴서」다.
 * 그래서 사람이 놓치기 쉬운 «운·환경 요인» 을 시스템이 먼저 짚어 올린다.
 *
 * ⚠️ 여기서 점수를 고치지 않는다. **사장님께 이의를 제기할 뿐**이다.
 *    자동으로 점수를 올려 주면 그 순간 이 기능은 «점수 부풀리기» 가 된다.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface FairnessFlag { level: 'warn' | 'info'; title: string; detail: string }

export async function computeFairness(env: SalesEnv, rep: any, range: PeriodRange, asOf: string): Promise<FairnessFlag[]> {
  const flags: FairnessFlag[] = [];
  const auto = await computeAutoScores(env, rep, range, asOf);
  const t = auto.targets;

  // ① 근무일이 적은 기간인가 — 명절·공휴일이 낀 달에 같은 목표는 불리하다.
  //    (공휴일 표를 두지 않기로 했으므로, 평일 수 자체가 적은 달을 잡아낸다)
  const perMonth = range.months.length > 0 ? t.workdays / range.months.length : 0;
  if (perMonth > 0 && perMonth < 20) {
    flags.push({
      level: 'warn',
      title: '근무일이 평소보다 적은 기간입니다',
      detail: `월평균 근무일이 ${perMonth.toFixed(1)}일입니다(보통 21~22일). 목표는 그대로였다면 그만큼 불리했습니다.`,
    });
  }

  // ② 유지율 표본이 너무 작다 — 한 곳만 이탈해도 점수가 크게 흔들린다.
  const retItem = auto.items.filter(i => i.key === 'retention')[0];
  if (retItem && retItem.target != null && retItem.target > 0 && retItem.target < 3) {
    flags.push({
      level: 'warn',
      title: `유지율 표본이 ${retItem.target}곳뿐입니다`,
      detail: `한 곳만 이탈해도 유지율이 크게 떨어집니다(15점 항목). 표본이 3곳 미만인 기간의 유지율 점수는 참고로만 보시길 권합니다.`,
    });
  }

  // ③ «방문을 안 한 것» 과 «기록을 안 한 것» 은 다르다.
  const diary = auto.items.filter(i => i.key === 'diary')[0];
  const visits = auto.items.filter(i => i.key === 'visits')[0];
  if (diary && visits && diary.rate != null && visits.rate != null && diary.rate < 0.6 && visits.rate < 0.8) {
    flags.push({
      level: 'warn',
      title: '방문 점수가 낮은 원인이 «기록 누락» 일 수 있습니다',
      detail: `일지를 남긴 날이 근무일의 ${Math.round(diary.rate * 100)}%뿐입니다. 방문 건수는 일지에서만 세므로, 실제로 다녀왔어도 기록이 없으면 0건으로 잡힙니다. 점수를 확정하기 전에 본인에게 확인해 보세요.`,
    });
  }

  // ④ 시장 전체가 나빴는가 — 회사 전체 신규 등록 추세와 비교한다.
  //    개인 실적만 보면 «이 사람이 못한 것» 처럼 보이지만, 전사가 같이 줄었다면 개인 문제가 아니다.
  try {
    const prevP = previousPeriod(range.months.length === 1 ? range.months[0] : `${range.start.slice(0, 4)}-H${Number(range.start.slice(5, 7)) <= 6 ? 1 : 2}`);
    const prevRange = prevP ? parsePeriod(prevP) : null;
    if (prevRange) {
      const cur: any = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM students_erp WHERE signup_date >= ? AND signup_date <= ?`
      ).bind(range.start, range.end).first();
      const prv: any = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM students_erp WHERE signup_date >= ? AND signup_date <= ?`
      ).bind(prevRange.start, prevRange.end).first();
      const c = num(cur?.c, 0), p = num(prv?.c, 0);
      if (p >= 20 && c < p * 0.8) {
        flags.push({
          level: 'info',
          title: '회사 전체 신규 등록도 함께 줄었습니다',
          detail: `전사 신규 등록이 지난 기간 ${p}명 → 이번 기간 ${c}명(${Math.round((1 - c / p) * 100)}% 감소)입니다. 이번 기간의 부진은 개인 문제가 아닐 수 있습니다.`,
        });
      }
    }
  } catch { /* 명부가 없으면 이 검사만 건너뛴다 */ }

  // ⑤ 목표가 과거 실적보다 지나치게 높은가 — 근거 없이 올린 목표는 평가가 아니라 벌칙이다.
  const prevP2 = previousPeriod(range.months.length === 1 ? range.months[0] : `${range.start.slice(0, 4)}-H${Number(range.start.slice(5, 7)) <= 6 ? 1 : 2}`);
  const prevRange2 = prevP2 ? parsePeriod(prevP2) : null;
  if (prevRange2) {
    const prevAuto = await computeAutoScores(env, rep, prevRange2, asOf);
    if (prevAuto.deal_count > 0 && t.deals > prevAuto.deal_count * 2) {
      flags.push({
        level: 'warn',
        title: '목표가 지난 기간 실적의 2배를 넘습니다',
        detail: `지난 기간 실적 ${prevAuto.deal_count}곳인데 이번 목표는 ${t.deals}곳입니다. 근거 없이 올린 목표라면 낮은 점수는 사람이 아니라 목표의 문제입니다.`,
      });
    }
  }

  // ⑦ 기간의 «일부만» 기록이 있는가 — 첫 평가에서 반드시 걸린다.
  //    목표는 기간 전체(6개월)로 잡히는데 기록은 제도 시작일부터만 있다.
  //    예: 제도 시작 8/18 인데 하반기(7/1~12/31)를 평가하면 7/1~8/17 은 «0건» 으로 잡힌다.
  //    사람은 그 기간에도 일했다 — 기록할 곳이 없었을 뿐이다.
  //    ⛔ 점수를 자동으로 올려 주지 않는다. 목표를 몇 % 로 봐야 하는지만 알려 준다.
  const startedAt = String(rep?.program_started_at || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(startedAt) && startedAt > range.start) {
    const total = daysBetween(range.start, range.end);
    const covered = daysBetween(startedAt, range.end);
    if (total > 0 && covered > 0 && covered < total) {
      const pct = Math.round((covered / total) * 100);
      flags.push({
        level: 'warn',
        title: `이 기간의 ${100 - pct}% 는 기록이 있을 수 없습니다`,
        detail: `제도를 ${startedAt} 에 시작해서 ${range.start} ~ ${startedAt} 사이는 기록할 곳 자체가 없었습니다. `
          + `그런데 목표는 기간 전체로 잡혀 있습니다. 방문·발굴·일지 점수는 목표의 약 ${pct}% 를 만점으로 보고 읽으시고, `
          + `첫 평가는 상여에 연결하지 않는 것을 권합니다.`,
      });
    }
  }

  // ⑥ 기준선 기간인가 — 이 기간의 낮은 점수로 사람을 판단하면 안 된다.
  if (isAdvisoryPeriod(rep, range)) {
    flags.push({
      level: 'info',
      title: '기준선 기간입니다',
      detail: `제도 시작 ${BASELINE_DAYS}일 안의 기간입니다(${baselineUntil(rep)}까지). 점수는 나오지만 상여에 연결되지 않습니다 — 이 기간 숫자로 사람을 판단하지 마세요.`,
    });
  }

  return flags;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 권한 헬퍼
 * ═════════════════════════════════════════════════════════════════════════ */

function isHqStaff(actor: any): boolean {
  return !!actor?.ok && !actor.isTeacher && (actor.role === 'hq' || actor.role === 'staff');
}

/** 로그인한 사람이 «영업담당자 본인» 인지 — 본인 것만 읽고 자기 일지만 쓴다. */
async function ownRepId(env: SalesEnv, actor: any): Promise<number | null> {
  if (!actor?.ok || !actor.username) return null;
  const r: any = await env.DB.prepare(
    `SELECT id FROM sales_reps WHERE admin_username = ? AND active = 1 LIMIT 1`
  ).bind(actor.username).first().catch(() => null);
  return r ? Number(r.id) : null;
}

async function getRep(env: SalesEnv, repId: number): Promise<any> {
  return await env.DB.prepare(`SELECT * FROM sales_reps WHERE id = ?`).bind(repId).first().catch(() => null);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 라우터
 * ═════════════════════════════════════════════════════════════════════════ */

export async function handleSalesHrApi(
  request: Request, url: URL, env: SalesEnv
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith('/api/admin/sales/')) return null;
  const method = request.method;

  const actor: any = await getAdminActor(request, env as any);
  if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);

  await ensureSchema(env);

  const hq = isHqStaff(actor);
  const myRepId = hq ? null : await ownRepId(env, actor);
  if (!hq && myRepId == null) {
    return json({ ok: false, error: 'forbidden', message: '영업 인사 정보는 본사 계정과 담당자 본인만 볼 수 있습니다.' }, 403);
  }

  /** 요청한 rep_id 가 볼 수 있는 것인지. 본인 계정이면 자기 id 로 강제한다. */
  const scopedRepId = (raw: any): number | null => {
    if (!hq) return myRepId;
    // ⚠️ (2026-08-18 수리) 예전엔 `Number(raw)` 만 보고 isNaN 이 아니면 그대로 돌려줬다.
    //    그런데 rep_id 가 아예 없으면 raw 는 null 이고 **Number(null) 은 0** 이다.
    //    isNaN(0) 은 false 라 «0번 담당자» 로 해석됐고, 0번은 없으니 404 rep_not_found 가 났다.
    //    휴대폰 화면(/sales)은 rep_id 를 안 붙이므로 **첫 화면이 통째로 안 열렸다.**
    //    빈 값·0 이하는 «지정 안 함(null)» 으로 본다 — 그래야 부르는 쪽의 기본값 처리가 산다.
    if (raw == null || String(raw).trim() === '') return null;
    const want = Number(raw);
    return (isNaN(want) || want <= 0) ? null : want;
  };

  let body: any = {};
  if (method === 'POST' || method === 'PUT') {
    try { body = await request.json(); } catch { body = {}; }
  }
  const now = Date.now();

  // ── 담당자 목록 ───────────────────────────────────────────────────────
  if (path === '/api/admin/sales/reps' && method === 'GET') {
    const rs: any = await env.DB.prepare(
      hq ? `SELECT * FROM sales_reps ORDER BY active DESC, name ASC`
         : `SELECT * FROM sales_reps WHERE id = ? ORDER BY name ASC`
    ).bind(...(hq ? [] : [myRepId])).all().catch(() => ({ results: [] }));
    return json({ ok: true, reps: rs?.results || [], can_edit: hq, defaults: SALES_DEFAULTS });
  }

  // ── 담당자 등록·수정 (본사만) ────────────────────────────────────────
  if (path === '/api/admin/sales/reps' && method === 'POST') {
    if (!hq) return json({ ok: false, error: 'forbidden' }, 403);
    const name = String(body?.name || '').trim();
    if (!name) return json({ ok: false, error: 'name_required' }, 400);
    const id = Number(body?.id) || 0;
    const vals = [
      name,
      String(body?.phone || '').trim() || null,
      String(body?.email || '').trim() || null,
      String(body?.admin_username || '').trim() || null,
      String(body?.region || '').trim() || null,
      String(body?.hired_at || '').trim() || null,
      Math.max(0, num(body?.base_salary_krw, SALES_DEFAULTS.base_salary_krw)),
      Math.max(0, num(body?.incentive_per_deal_krw, SALES_DEFAULTS.incentive_per_deal_krw)),
      Math.max(0, num(body?.target_deals, SALES_DEFAULTS.target_deals)),
      Math.max(0, num(body?.target_students, SALES_DEFAULTS.target_students)),
      Math.max(0, num(body?.target_visits, SALES_DEFAULTS.target_visits)),
      Math.max(0, num(body?.target_leads, SALES_DEFAULTS.target_leads)),
      Math.max(0, num(body?.target_care, SALES_DEFAULTS.target_care)),
      String(body?.program_started_at || '').trim() || todayISO(),
      body?.active === 0 || body?.active === false ? 0 : 1,
      String(body?.notes || '').trim() || null,
    ];
    if (id > 0) {
      await env.DB.prepare(
        `UPDATE sales_reps SET name=?, phone=?, email=?, admin_username=?, region=?, hired_at=?,
           base_salary_krw=?, incentive_per_deal_krw=?, target_deals=?, target_students=?,
           target_visits=?, target_leads=?, target_care=?,
           program_started_at=COALESCE(program_started_at, ?), active=?, notes=?, updated_at=?
         WHERE id=?`
      ).bind(...vals, now, id).run();
      return json({ ok: true, id });
    }
    const ins: any = await env.DB.prepare(
      `INSERT INTO sales_reps (name, phone, email, admin_username, region, hired_at,
         base_salary_krw, incentive_per_deal_krw, target_deals, target_students,
         target_visits, target_leads, target_care, program_started_at, active, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(...vals, now, now).run();
    return json({ ok: true, id: ins?.meta?.last_row_id ?? null });
  }

  // ── 후보 학원(파이프라인) ────────────────────────────────────────────
  if (path === '/api/admin/sales/leads' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const stage = url.searchParams.get('stage');
    const where: string[] = []; const bind: any[] = [];
    if (repId != null) { where.push('rep_id = ?'); bind.push(repId); }
    if (stage) { where.push('stage = ?'); bind.push(Number(stage)); }
    const st = url.searchParams.get('status');
    if (st) { where.push('status = ?'); bind.push(st); }
    const sql = `SELECT * FROM sales_leads${where.length ? ' WHERE ' + where.join(' AND ') : ''}
                 ORDER BY stage DESC, COALESCE(last_contact_at,'') DESC, id DESC LIMIT 500`;
    const rs: any = await env.DB.prepare(sql).bind(...bind).all().catch(() => ({ results: [] }));
    return json({ ok: true, leads: rs?.results || [], stages: SALES_STAGES });
  }

  if (path === '/api/admin/sales/leads' && method === 'POST') {
    const repId = scopedRepId(body?.rep_id);
    if (repId == null) return json({ ok: false, error: 'rep_id_required' }, 400);
    const name = String(body?.name || '').trim();
    const id = Number(body?.id) || 0;
    if (!id && !name) return json({ ok: false, error: 'name_required' }, 400);
    const stage = Math.min(6, Math.max(1, num(body?.stage, 1)));
    const status = ['active', 'won', 'lost', 'hold'].indexOf(String(body?.status || 'active')) >= 0
      ? String(body?.status || 'active') : 'active';
    const vals = [
      repId, name,
      String(body?.region || '').trim() || null,
      String(body?.address || '').trim() || null,
      String(body?.contact_name || '').trim() || null,
      String(body?.contact_phone || '').trim() || null,
      stage, status,
      String(body?.source || '').trim() || null,
      body?.center_id != null && body.center_id !== '' ? Number(body.center_id) : null,
      String(body?.next_action || '').trim() || null,
      String(body?.next_action_at || '').trim() || null,
      String(body?.last_contact_at || '').trim() || null,
      String(body?.lost_reason || '').trim() || null,
      String(body?.notes || '').trim() || null,
    ];
    if (id > 0) {
      await env.DB.prepare(
        `UPDATE sales_leads SET rep_id=?, name=COALESCE(NULLIF(?,''),name), region=?, address=?,
           contact_name=?, contact_phone=?, stage=?, status=?, source=?, center_id=?,
           next_action=?, next_action_at=?, last_contact_at=?, lost_reason=?, notes=?, updated_at=?
         WHERE id=?`
      ).bind(...vals, now, id).run();
      return json({ ok: true, id });
    }
    const ins: any = await env.DB.prepare(
      `INSERT INTO sales_leads (rep_id, name, region, address, contact_name, contact_phone,
         stage, status, source, center_id, next_action, next_action_at, last_contact_at,
         lost_reason, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(...vals, now, now).run();
    return json({ ok: true, id: ins?.meta?.last_row_id ?? null });
  }

  // ── 영업일지 ─────────────────────────────────────────────────────────
  if (path === '/api/admin/sales/activities' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const from = String(url.searchParams.get('from') || '').trim();
    const to = String(url.searchParams.get('to') || '').trim();
    const where: string[] = []; const bind: any[] = [];
    if (repId != null) { where.push('a.rep_id = ?'); bind.push(repId); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('a.activity_date >= ?'); bind.push(from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('a.activity_date <= ?'); bind.push(to); }
    const rs: any = await env.DB.prepare(
      `SELECT a.*, l.name AS lead_name FROM sales_activities a
       LEFT JOIN sales_leads l ON l.id = a.lead_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.activity_date DESC, a.id DESC LIMIT 400`
    ).bind(...bind).all().catch(() => ({ results: [] }));
    return json({ ok: true, activities: rs?.results || [], kinds: ACTIVITY_KINDS });
  }

  if (path === '/api/admin/sales/activities' && method === 'POST') {
    const repId = scopedRepId(body?.rep_id);
    if (repId == null) return json({ ok: false, error: 'rep_id_required' }, 400);
    const date = String(body?.activity_date || '').trim() || todayISO();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: 'bad_date' }, 400);
    const kind = ACTIVITY_KINDS.indexOf(String(body?.kind || 'visit')) >= 0 ? String(body?.kind) : 'visit';
    const leadId = body?.lead_id != null && body.lead_id !== '' ? Number(body.lead_id) : null;

    const ins: any = await env.DB.prepare(
      `INSERT INTO sales_activities (rep_id, lead_id, activity_date, kind, title, note, outcome,
         next_action, stage_after, raw_voice, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      repId, leadId, date, kind,
      String(body?.title || '').trim().slice(0, 200) || null,
      String(body?.note || '').trim().slice(0, 2000) || null,
      String(body?.outcome || '').trim().slice(0, 500) || null,
      String(body?.next_action || '').trim().slice(0, 500) || null,
      body?.stage_after != null && body.stage_after !== '' ? Math.min(6, Math.max(1, Number(body.stage_after))) : null,
      String(body?.raw_voice || '').trim().slice(0, 4000) || null,
      actor.username || null, now
    ).run();

    // 일지에 «단계 이동» 이 들어 있으면 후보 학원의 단계도 같이 올린다.
    //   두 곳을 따로 입력하게 하면 반드시 한쪽이 빈다.
    if (leadId && body?.stage_after != null && body.stage_after !== '') {
      await env.DB.prepare(
        `UPDATE sales_leads SET stage = ?, last_contact_at = ?, updated_at = ? WHERE id = ? AND rep_id = ?`
      ).bind(Math.min(6, Math.max(1, Number(body.stage_after))), date, now, leadId, repId).run().catch(() => null);
    } else if (leadId) {
      await env.DB.prepare(
        `UPDATE sales_leads SET last_contact_at = ?, updated_at = ? WHERE id = ? AND rep_id = ?`
      ).bind(date, now, leadId, repId).run().catch(() => null);
    }
    return json({ ok: true, id: ins?.meta?.last_row_id ?? null });
  }

  // ── 계약 ─────────────────────────────────────────────────────────────
  if (path === '/api/admin/sales/deals' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const where: string[] = []; const bind: any[] = [];
    if (repId != null) { where.push('rep_id = ?'); bind.push(repId); }
    const period = String(url.searchParams.get('period') || '').trim();
    if (period) {
      const r = parsePeriod(period);
      if (r) { where.push('contract_date >= ? AND contract_date <= ?'); bind.push(r.start, r.end); }
    }
    const rs: any = await env.DB.prepare(
      `SELECT * FROM sales_deals${where.length ? ' WHERE ' + where.join(' AND ') : ''}
       ORDER BY contract_date DESC, id DESC LIMIT 500`
    ).bind(...bind).all().catch(() => ({ results: [] }));
    const rows = (rs?.results || []).map((d: any) => ({
      ...d,
      matured: maturedBy(String(d.contract_date), todayISO()),
      retention_due: dueDate(String(d.contract_date)),
    }));
    return json({ ok: true, deals: rows, retention_days: RETENTION_DAYS });
  }

  // 계약 등록·수정은 본사만. 성과급의 근거라 본인이 쓰게 두지 않는다(설계 원칙 ①).
  if (path === '/api/admin/sales/deals' && method === 'POST') {
    if (!hq) return json({ ok: false, error: 'forbidden', message: '계약 등록은 본사 계정만 할 수 있습니다.' }, 403);
    const repId = Number(body?.rep_id);
    if (!(repId > 0)) return json({ ok: false, error: 'rep_id_required' }, 400);
    const id = Number(body?.id) || 0;
    const centerName = String(body?.center_name || '').trim();
    const contractDate = String(body?.contract_date || '').trim();
    if (!id && (!centerName || !/^\d{4}-\d{2}-\d{2}$/.test(contractDate))) {
      return json({ ok: false, error: 'invalid', message: '학원 이름과 계약일(YYYY-MM-DD)이 필요합니다.' }, 400);
    }
    // retained_3m 은 «아직 모름(null)» 을 지키기 위해 값이 실제로 올 때만 건드린다.
    const retained = (body?.retained_3m === 1 || body?.retained_3m === true) ? 1
                   : (body?.retained_3m === 0 || body?.retained_3m === false) ? 0 : null;
    const checkedAt = retained == null ? null
      : (String(body?.retention_checked_at || '').trim() || todayISO());

    const vals = [
      repId,
      body?.lead_id != null && body.lead_id !== '' ? Number(body.lead_id) : null,
      body?.center_id != null && body.center_id !== '' ? Number(body.center_id) : null,
      centerName,
      String(body?.region || '').trim() || null,
      contractDate,
      Math.max(0, num(body?.students_initial, 0)),
      body?.students_3m != null && body.students_3m !== '' ? Math.max(0, Number(body.students_3m)) : null,
      retained, checkedAt,
      body?.incentive_total_krw != null && body.incentive_total_krw !== '' ? Math.max(0, Number(body.incentive_total_krw)) : null,
      Math.max(0, num(body?.paid_first_krw, 0)),
      String(body?.paid_first_at || '').trim() || null,
      Math.max(0, num(body?.paid_second_krw, 0)),
      String(body?.paid_second_at || '').trim() || null,
      String(body?.notes || '').trim() || null,
    ];
    if (id > 0) {
      await env.DB.prepare(
        `UPDATE sales_deals SET rep_id=?, lead_id=?, center_id=?,
           center_name=COALESCE(NULLIF(?,''),center_name), region=?,
           contract_date=COALESCE(NULLIF(?,''),contract_date), students_initial=?, students_3m=?,
           retained_3m=COALESCE(?,retained_3m), retention_checked_at=COALESCE(?,retention_checked_at),
           incentive_total_krw=?, paid_first_krw=?, paid_first_at=?, paid_second_krw=?, paid_second_at=?,
           notes=?, updated_at=? WHERE id=?`
      ).bind(...vals, now, id).run();
      // 사람이 직접 누른 판정은 «manual» 로 표시한다 — 자동 판정과 구분돼야
      // 나중에 「자동이 얼마나 맞았나」를 볼 수 있다(자동 판정을 신뢰할 근거).
      if (retained != null) {
        await env.DB.prepare(
          `UPDATE sales_deals SET retention_source = 'manual' WHERE id = ?`
        ).bind(id).run().catch(() => null);
      }
      return json({ ok: true, id });
    }
    const ins: any = await env.DB.prepare(
      `INSERT INTO sales_deals (rep_id, lead_id, center_id, center_name, region, contract_date,
         students_initial, students_3m, retained_3m, retention_checked_at, incentive_total_krw,
         paid_first_krw, paid_first_at, paid_second_krw, paid_second_at, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(...vals, now, now).run();
    // 계약이 잡히면 후보 학원은 «계약» 단계로 올린다.
    if (body?.lead_id) {
      await env.DB.prepare(
        `UPDATE sales_leads SET stage = 5, status = 'won', updated_at = ? WHERE id = ? AND rep_id = ?`
      ).bind(now, Number(body.lead_id), repId).run().catch(() => null);
    }
    return json({ ok: true, id: ins?.meta?.last_row_id ?? null });
  }

  // ── 월 목표 ──────────────────────────────────────────────────────────
  if (path === '/api/admin/sales/targets' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const rs: any = await env.DB.prepare(
      `SELECT * FROM sales_targets WHERE rep_id = ? ORDER BY period DESC LIMIT 36`
    ).bind(repId).all().catch(() => ({ results: [] }));
    return json({ ok: true, targets: rs?.results || [] });
  }

  if (path === '/api/admin/sales/targets' && method === 'POST') {
    if (!hq) return json({ ok: false, error: 'forbidden' }, 403);
    const repId = Number(body?.rep_id);
    const period = String(body?.period || '').trim();
    if (!(repId > 0) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return json({ ok: false, error: 'invalid', message: 'rep_id 와 period(YYYY-MM)가 필요합니다.' }, 400);
    }
    await env.DB.prepare(
      `INSERT INTO sales_targets (rep_id, period, target_deals, target_students, target_visits,
         target_leads, target_care, workdays, notes, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(rep_id, period) DO UPDATE SET
         target_deals=excluded.target_deals, target_students=excluded.target_students,
         target_visits=excluded.target_visits, target_leads=excluded.target_leads,
         target_care=excluded.target_care, workdays=excluded.workdays,
         notes=excluded.notes, updated_at=excluded.updated_at`
    ).bind(
      repId, period,
      body?.target_deals != null && body.target_deals !== '' ? Number(body.target_deals) : null,
      body?.target_students != null && body.target_students !== '' ? Number(body.target_students) : null,
      body?.target_visits != null && body.target_visits !== '' ? Number(body.target_visits) : null,
      body?.target_leads != null && body.target_leads !== '' ? Number(body.target_leads) : null,
      body?.target_care != null && body.target_care !== '' ? Number(body.target_care) : null,
      body?.workdays != null && body.workdays !== '' ? Number(body.workdays) : null,
      String(body?.notes || '').trim() || null, now
    ).run();
    return json({ ok: true });
  }

  // ── 평가 (자동채점 + 저장된 사람 점수) ──────────────────────────────
  if (path === '/api/admin/sales/evaluation' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const range = parsePeriod(String(url.searchParams.get('period') || ''));
    if (repId == null || !range) return json({ ok: false, error: 'invalid', message: 'rep_id 와 period(YYYY-MM 또는 YYYY-H1)가 필요합니다.' }, 400);
    const rep = await getRep(env, repId);
    if (!rep) return json({ ok: false, error: 'rep_not_found' }, 404);

    const periodRaw = String(url.searchParams.get('period') || '').trim();
    const asOf = todayISO();
    const auto = await computeAutoScores(env, rep, range, asOf);
    const saved: any = await env.DB.prepare(
      `SELECT * FROM sales_evaluations WHERE rep_id = ? AND period = ?`
    ).bind(repId, periodRaw).first().catch(() => null);

    const manual = {
      reporting: saved?.score_reporting ?? null,
      vehicle: saved?.score_vehicle ?? null,
      teamwork: saved?.score_teamwork ?? null,
    };
    const ft = finalTotal(auto.earned, auto.applicable_max, manual);
    const grade = salesGrade(ft.total);
    // 📏 기준선 기간이면 등급은 «참고용» 이고 상여는 계산하지 않는다.
    const advisory = isAdvisoryPeriod(rep, range);
    const bonus = (!advisory && range.kind === 'half' && grade)
      ? Math.round(num(rep.base_salary_krw, 0) * (SALES_BONUS_MULTIPLIER[grade] ?? 0))
      : null;

    return json({
      ok: true,
      rep, period: periodRaw, period_label: range.label, as_of: asOf,
      advisory, baseline_until: baselineUntil(rep), baseline_days: BASELINE_DAYS,
      weights: SALES_EVAL_WEIGHTS, manual_keys: SALES_MANUAL_KEYS, labels: SALES_LABELS,
      auto, manual, final: ft, grade, bonus_krw: bonus,
      bonus_multiplier: grade ? (SALES_BONUS_MULTIPLIER[grade] ?? 0) : null,
      saved: saved || null,
      can_edit: hq,
    });
  }

  // 평가 확정 — 사람 점수 3개만 받는다. 자동 85점은 서버가 다시 센다(화면 값을 믿지 않는다).
  if (path === '/api/admin/sales/evaluation' && method === 'POST') {
    if (!hq) return json({ ok: false, error: 'forbidden', message: '평가 확정은 본사 계정만 할 수 있습니다.' }, 403);
    const repId = Number(body?.rep_id);
    const periodRaw = String(body?.period || '').trim();
    const range = parsePeriod(periodRaw);
    if (!(repId > 0) || !range) return json({ ok: false, error: 'invalid' }, 400);
    const rep = await getRep(env, repId);
    if (!rep) return json({ ok: false, error: 'rep_not_found' }, 404);

    const clamp = (v: any, max: number) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      if (isNaN(n)) return null;
      return Math.max(0, Math.min(max, n));
    };
    const manual = {
      reporting: clamp(body?.score_reporting, SALES_EVAL_WEIGHTS.reporting),
      vehicle: clamp(body?.score_vehicle, SALES_EVAL_WEIGHTS.vehicle),
      teamwork: clamp(body?.score_teamwork, SALES_EVAL_WEIGHTS.teamwork),
    };

    const asOf = todayISO();
    const auto = await computeAutoScores(env, rep, range, asOf);
    const ft = finalTotal(auto.earned, auto.applicable_max, manual);
    const grade = salesGrade(ft.total);
    const advisory = isAdvisoryPeriod(rep, range);
    const bonus = (!advisory && range.kind === 'half' && grade)
      ? Math.round(num(rep.base_salary_krw, 0) * (SALES_BONUS_MULTIPLIER[grade] ?? 0))
      : null;

    // 스냅샷 — 나중에 원본이 바뀌어도 «그때 무엇을 보고 이 등급을 줬는지» 가 남아야 한다.
    const snapshot = JSON.stringify({
      as_of: asOf, period: periodRaw, auto, manual, final: ft, grade, bonus_krw: bonus,
      advisory, baseline_until: baselineUntil(rep),
      base_salary_krw: num(rep.base_salary_krw, 0),
      weights: SALES_EVAL_WEIGHTS,
    });

    await env.DB.prepare(
      `INSERT INTO sales_evaluations (rep_id, period, score_reporting, score_vehicle, score_teamwork,
         auto_total, final_total, grade, bonus_krw, strengths, improvements, snapshot, evaluator, evaluated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(rep_id, period) DO UPDATE SET
         score_reporting=excluded.score_reporting, score_vehicle=excluded.score_vehicle,
         score_teamwork=excluded.score_teamwork, auto_total=excluded.auto_total,
         final_total=excluded.final_total, grade=excluded.grade, bonus_krw=excluded.bonus_krw,
         strengths=excluded.strengths, improvements=excluded.improvements,
         snapshot=excluded.snapshot, evaluator=excluded.evaluator, evaluated_at=excluded.evaluated_at`
    ).bind(
      repId, periodRaw, manual.reporting, manual.vehicle, manual.teamwork,
      auto.earned, ft.total, grade, bonus,
      String(body?.strengths || '').trim().slice(0, 2000) || null,
      String(body?.improvements || '').trim().slice(0, 2000) || null,
      snapshot, actor.username || null, now
    ).run();

    return json({ ok: true, final: ft, grade, bonus_krw: bonus, auto, advisory });
  }

  // ── 보상 계산 ────────────────────────────────────────────────────────
  if (path === '/api/admin/sales/compensation' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const range = parsePeriod(String(url.searchParams.get('period') || ''));
    if (repId == null || !range) return json({ ok: false, error: 'invalid' }, 400);
    const rep = await getRep(env, repId);
    if (!rep) return json({ ok: false, error: 'rep_not_found' }, 404);
    const comp = await computeCompensation(env, rep, range);
    return json({ ok: true, rep_id: repId, rep_name: rep.name, period_label: range.label, ...comp });
  }

  // ── 「왜 이 점수인가」 근거 분석 ─────────────────────────────────────
  //   강사 인사평가의 /api/admin/teacher-hr-analysis 와 같은 역할.
  //   평가 제도가 무너지는 가장 큰 이유는 «근거를 설명 못 함» 이다.
  if (path === '/api/admin/sales/hr-analysis' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const range = parsePeriod(String(url.searchParams.get('period') || ''));
    if (repId == null || !range) return json({ ok: false, error: 'invalid' }, 400);
    const rep = await getRep(env, repId);
    if (!rep) return json({ ok: false, error: 'rep_not_found' }, 404);

    const periodRaw = String(url.searchParams.get('period') || '').trim();
    const asOf = todayISO();
    const auto = await computeAutoScores(env, rep, range, asOf);

    // 지난 반기(또는 지난 달)와 비교 — 1명이라 «남» 이 아니라 «과거의 자기» 가 비교 대상이다.
    const prev = previousPeriod(periodRaw);
    let compare: any = null;
    const prevRange = prev ? parsePeriod(prev) : null;
    if (prevRange) {
      const prevAuto = await computeAutoScores(env, rep, prevRange, asOf);
      compare = {
        period: prev, period_label: prevRange.label,
        deals: { now: auto.deal_count, before: prevAuto.deal_count },
        students: { now: auto.student_count, before: prevAuto.student_count },
        earned: { now: auto.earned, before: prevAuto.earned },
      };
    }

    // 파이프라인 — 「어디서 막혔나」
    const pipe: any = await env.DB.prepare(
      `SELECT stage, COUNT(*) AS c FROM sales_leads WHERE rep_id = ? AND status = 'active' GROUP BY stage`
    ).bind(repId).all().catch(() => ({ results: [] }));
    const byStage: Record<number, number> = {};
    for (const r of (pipe?.results || [])) byStage[Number(r.stage)] = Number(r.c);

    return json({
      ok: true, rep_id: repId, rep_name: rep.name,
      period: periodRaw, period_label: range.label, as_of: asOf,
      items: auto.items, earned: auto.earned, applicable_max: auto.applicable_max,
      skipped: auto.skipped, targets: auto.targets,
      pipeline: SALES_STAGES.map(s => ({ ...s, count: byStage[s.n] || 0 })),
      compare,
      bottleneck: findBottleneck(byStage),
    });
  }

  // ── 첫 화면 한 번에 (왕복 1회) ──────────────────────────────────────
  if (path === '/api/admin/sales/overview' && method === 'GET') {
    const periodRaw = String(url.searchParams.get('period') || '').trim() || todayISO().slice(0, 7);
    const range = parsePeriod(periodRaw) || parsePeriod(todayISO().slice(0, 7))!;
    const repsRs: any = await env.DB.prepare(
      hq ? `SELECT * FROM sales_reps WHERE active = 1 ORDER BY name ASC`
         : `SELECT * FROM sales_reps WHERE id = ?`
    ).bind(...(hq ? [] : [myRepId])).all().catch(() => ({ results: [] }));
    const reps: any[] = repsRs?.results || [];
    const asOf = todayISO();

    const cards: any[] = [];
    for (const rep of reps) {
      const auto = await computeAutoScores(env, rep, range, asOf);
      const comp = await computeCompensation(env, rep, range);
      const ft = finalTotal(auto.earned, auto.applicable_max, { reporting: null, vehicle: null, teamwork: null });
      const pipe: any = await env.DB.prepare(
        `SELECT stage, COUNT(*) AS c FROM sales_leads WHERE rep_id = ? AND status = 'active' GROUP BY stage`
      ).bind(rep.id).all().catch(() => ({ results: [] }));
      const byStage: Record<number, number> = {};
      for (const r of (pipe?.results || [])) byStage[Number(r.stage)] = Number(r.c);
      cards.push({
        rep, auto_items: auto.items, earned: auto.earned, applicable_max: auto.applicable_max,
        auto_only_total: ft.total, targets: auto.targets,
        advisory: isAdvisoryPeriod(rep, range), baseline_until: baselineUntil(rep),
        deal_count: auto.deal_count, student_count: auto.student_count,
        compensation: comp,
        pipeline: SALES_STAGES.map(s => ({ ...s, count: byStage[s.n] || 0 })),
      });
    }

    // 최근 영업일지 — 첫 화면에서 «지금 뭐 하고 있나» 가 바로 보여야 한다.
    const recent: any = await env.DB.prepare(
      hq ? `SELECT a.*, l.name AS lead_name, r.name AS rep_name FROM sales_activities a
            LEFT JOIN sales_leads l ON l.id = a.lead_id
            LEFT JOIN sales_reps r ON r.id = a.rep_id
            ORDER BY a.activity_date DESC, a.id DESC LIMIT 20`
         : `SELECT a.*, l.name AS lead_name, r.name AS rep_name FROM sales_activities a
            LEFT JOIN sales_leads l ON l.id = a.lead_id
            LEFT JOIN sales_reps r ON r.id = a.rep_id
            WHERE a.rep_id = ? ORDER BY a.activity_date DESC, a.id DESC LIMIT 20`
    ).bind(...(hq ? [] : [myRepId])).all().catch(() => ({ results: [] }));

    // 유지 확인이 밀린 계약 — 여기가 성과급 2차의 트리거다. 놓치면 담당자가 돈을 못 받는다.
    const dueRs: any = await env.DB.prepare(
      hq ? `SELECT id, rep_id, center_name, contract_date, retention_evidence FROM sales_deals
             WHERE retained_3m IS NULL ORDER BY contract_date ASC LIMIT 50`
         : `SELECT id, rep_id, center_name, contract_date, retention_evidence FROM sales_deals
             WHERE retained_3m IS NULL AND rep_id = ? ORDER BY contract_date ASC LIMIT 50`
    ).bind(...(hq ? [] : [myRepId])).all().catch(() => ({ results: [] }));
    const dueNow = (dueRs?.results || [])
      .filter((d: any) => maturedBy(String(d.contract_date), asOf))
      .map((d: any) => {
        // 자동 판정이 «왜 못 했는지» 를 화면에 그대로 보여 준다.
        //   이유 없이 「확인하세요」만 뜨면 사람은 무엇을 확인할지 모른다.
        let why: string | null = null;
        try { const e = JSON.parse(String(d.retention_evidence || '')); why = e?.reason || null; } catch { /* 없으면 없는 대로 */ }
        return { id: d.id, rep_id: d.rep_id, center_name: d.center_name, contract_date: d.contract_date,
                 retention_due: dueDate(String(d.contract_date)), why };
      });

    return json({
      ok: true, period: periodRaw, period_label: range.label, as_of: asOf,
      can_edit: hq, cards, recent_activities: recent?.results || [],
      retention_due: dueNow, stages: SALES_STAGES,
      weights: SALES_EVAL_WEIGHTS, labels: SALES_LABELS,
      grade_multiplier: SALES_BONUS_MULTIPLIER,
    });
  }

  // ── 🎤 말로 쓰는 영업일지 — 받아쓴 말 → 일지 초안 ──────────────────
  //   저장은 하지 않는다. «초안» 만 돌려주고, 사람이 보고 고친 뒤 저장 버튼을 누른다.
  if (path === '/api/admin/sales/parse-diary' && method === 'POST') {
    const repId = scopedRepId(body?.rep_id);
    const text = String(body?.text || '').trim();
    if (repId == null) return json({ ok: false, error: 'rep_id_required' }, 400);
    if (!text) return json({ ok: false, error: 'text_required', message: '받아쓴 내용이 비어 있습니다.' }, 400);

    const leadRs: any = await env.DB.prepare(
      `SELECT id, name FROM sales_leads WHERE rep_id = ? AND status = 'active'
        ORDER BY COALESCE(last_contact_at,'') DESC, id DESC LIMIT 200`
    ).bind(repId).all().catch(() => ({ results: [] }));
    const leads: any[] = leadRs?.results || [];

    let draft = await parseDiaryByAI(env, text, leads);
    if (!draft) draft = parseDiaryByRules(text, leads);   // AI 가 없거나 실패해도 화면은 채워진다
    return json({ ok: true, draft, lead_count: leads.length });
  }

  // ── 📱 휴대폰 화면 전용 — 첫 화면에 필요한 «전부» 를 한 번에 ──────
  //
  //   왜 따로 만들었나 (2026-08-18 사장님 지시):
  //     영업이사는 하루 종일 운전한다. 화면을 볼 수 있는 순간이 짧고, 회선도 나쁘다
  //     (터널·시골). 이 화면이 홈·우선순위·위험·실적을 각각 부르면 왕복이 4번이고,
  //     그중 하나만 늦어도 «안 열리는 앱» 이 된다.
  //     → /api/approval/home · /api/teacher/portal 과 같은 «한 번에» 방식을 쓴다.
  //
  //   ⚠️ 이 엔드포인트는 화면을 위해 «모아 주기만» 한다. 계산은 전부 기존 함수를 그대로
  //      부른다 — 여기서 다시 계산하면 사무실 화면과 숫자가 어긋나는 날이 반드시 온다.
  if (path === '/api/admin/sales/mobile' && method === 'GET') {
    const asOf = todayISO();
    const periodRaw = String(url.searchParams.get('period') || '').trim() || asOf.slice(0, 7);
    const range = parsePeriod(periodRaw) || parsePeriod(asOf.slice(0, 7))!;

    // 담당자 고르기 — 본인 계정이면 자기 것, 본사 계정이면 지정한 사람(없으면 첫 활성자).
    let repId = scopedRepId(url.searchParams.get('rep_id'));
    if (repId == null) {
      const first: any = await env.DB.prepare(
        `SELECT id FROM sales_reps WHERE active = 1 ORDER BY id ASC LIMIT 1`
      ).first().catch(() => null);
      repId = first ? Number(first.id) : null;
    }
    if (repId == null) {
      return json({ ok: true, empty: true, message: '등록된 영업담당자가 없습니다. 관리자 화면에서 먼저 등록하세요.' });
    }
    const rep0 = await getRep(env, repId);
    if (!rep0) return json({ ok: false, error: 'rep_not_found' }, 404);

    const auto = await computeAutoScores(env, rep0, range, asOf);
    const comp = await computeCompensation(env, rep0, range);
    const visits = await computeNextVisits(env, repId, asOf, 5);
    const care = await computeCareDue(env, repId, asOf, 45, 3);
    const risk = (await computeAtRisk(env, repId, asOf, 25))
      .filter(x => x.level === 'high' || x.level === 'medium');

    const leadRs: any = await env.DB.prepare(
      `SELECT id, name, region, stage, contact_name, contact_phone, next_action, last_contact_at
         FROM sales_leads WHERE rep_id = ? AND status = 'active'
        ORDER BY stage DESC, COALESCE(last_contact_at,'') DESC, id DESC LIMIT 200`
    ).bind(repId).all().catch(() => ({ results: [] }));

    const pipe: any = await env.DB.prepare(
      `SELECT stage, COUNT(*) AS c FROM sales_leads WHERE rep_id = ? AND status = 'active' GROUP BY stage`
    ).bind(repId).all().catch(() => ({ results: [] }));
    const byStage: Record<number, number> = {};
    for (const r of (pipe?.results || [])) byStage[Number(r.stage)] = num(r.c, 0);

    // 오늘 이미 일지를 남겼는지 — 「오늘 기록했어요」 표시에 쓴다(잔소리 대신 확인).
    const today: any = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM sales_activities WHERE rep_id = ? AND activity_date = ?`
    ).bind(repId, asOf).first().catch(() => null);

    const itemOf = (k: string) => auto.items.filter(i => i.key === k)[0] || null;

    return json({
      ok: true, as_of: asOf, period: periodRaw, period_label: range.label,
      rep: {
        id: rep0.id, name: rep0.name,
        base_salary_krw: num(rep0.base_salary_krw, 0),
        incentive_per_deal_krw: num(rep0.incentive_per_deal_krw, 0),
      },
      can_edit: hq,
      advisory: isAdvisoryPeriod(rep0, range), baseline_until: baselineUntil(rep0),
      kpi: {
        deals: auto.deal_count, deals_target: auto.targets.deals,
        students: auto.student_count, students_target: auto.targets.students,
        visits: itemOf('visits')?.actual ?? 0, visits_target: auto.targets.visits,
        diary_days: itemOf('diary')?.actual ?? 0, workdays: auto.targets.workdays,
        logged_today: num(today?.c, 0) > 0,
      },
      money: {
        incentive_krw: comp.incentive_krw,
        base_salary_krw: comp.base_salary_krw,
        total_krw: comp.total_krw,
        per_deal_krw: comp.per_deal_krw,
        lines: comp.lines,
      },
      pipeline: SALES_STAGES.map(s => ({ ...s, count: byStage[s.n] || 0 })),
      next_visits: visits, care_due: care, at_risk: risk,
      leads: leadRs?.results || [], stages: SALES_STAGES,
    });
  }

  // ── 🗺 오늘 어디부터 갈까 — 방문 우선순위 + 관리방문 필요 ─────────
  if (path === '/api/admin/sales/next-visits' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    if (repId == null) return json({ ok: false, error: 'rep_id_required' }, 400);
    const asOf = todayISO();
    const limit = Math.min(30, Math.max(1, num(url.searchParams.get('limit'), 10)));
    const visits = await computeNextVisits(env, repId, asOf, limit);
    const care = await computeCareDue(env, repId, asOf, 45, 10);
    return json({ ok: true, as_of: asOf, visits, care_due: care });
  }

  // ── ⚠️ 위험한 학원 — 빠져나가기 «전» 에 ───────────────────────────
  if (path === '/api/admin/sales/at-risk' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const asOf = todayISO();
    const limit = Math.min(60, Math.max(1, num(url.searchParams.get('limit'), 40)));
    const items = await computeAtRisk(env, hq && repId == null ? null : repId, asOf, limit);
    return json({
      ok: true, as_of: asOf, items,
      counts: {
        high: items.filter(i => i.level === 'high').length,
        medium: items.filter(i => i.level === 'medium').length,
        unknown: items.filter(i => i.level === 'unknown').length,
      },
    });
  }

  // ── 📰 주간·월간 보고서 ──────────────────────────────────────────
  //   period=week / week-N / YYYY-MM / YYYY-H1
  if (path === '/api/admin/sales/report' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    if (repId == null) return json({ ok: false, error: 'rep_id_required' }, 400);
    const rep0 = await getRep(env, repId);
    if (!rep0) return json({ ok: false, error: 'rep_not_found' }, 404);

    const asOf = todayISO();
    const raw = String(url.searchParams.get('period') || 'week').trim();
    let start = '', end = '', label = '';
    const wm = /^week(?:-(\d+))?$/.exec(raw);
    if (wm) {
      const wk = weekRange(asOf, wm[1] ? Number(wm[1]) : 1);
      start = wk.start; end = wk.end; label = `주간 (${wk.label})`;
    } else {
      const r = parsePeriod(raw);
      if (!r) return json({ ok: false, error: 'bad_period' }, 400);
      start = r.start; end = r.end; label = r.label;
    }
    const built = await buildSalesReport(env, rep0, start, end, asOf);
    return json({ ok: true, rep_id: repId, rep_name: rep0.name, period_label: label, as_of: asOf, ...built });
  }

  // ── ⚖️ 공정성 감시 ───────────────────────────────────────────────
  if (path === '/api/admin/sales/fairness' && method === 'GET') {
    const repId = scopedRepId(url.searchParams.get('rep_id'));
    const range = parsePeriod(String(url.searchParams.get('period') || ''));
    if (repId == null || !range) return json({ ok: false, error: 'invalid' }, 400);
    const rep0 = await getRep(env, repId);
    if (!rep0) return json({ ok: false, error: 'rep_not_found' }, 404);
    const asOf = todayISO();
    const flags = await computeFairness(env, rep0, range, asOf);
    return json({ ok: true, rep_id: repId, period_label: range.label, as_of: asOf, flags });
  }

  // ── 🔁 유지 여부 자동 판정 지금 실행 (본사만) ─────────────────────
  //   평소에는 매일 09:00 KST cron 이 돈다. 이 버튼은 «기다리지 않고 지금» 용이다.
  if (path === '/api/admin/sales/retention-sweep' && method === 'POST') {
    if (!hq) return json({ ok: false, error: 'forbidden' }, 403);
    const r = await runSalesRetentionSweep(env);
    return json({ ok: true, ...r });
  }

  return json({ ok: false, error: 'not_found', path }, 404);
}

/** 두 날짜 사이 일수(끝날 포함). 기간의 «몇 %가 기록 가능했나» 를 재는 데 쓴다. */
function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00Z').getTime();
  const b = new Date(toISO + 'T00:00:00Z').getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** 계약일 + 90일 = 유지 확인 예정일. 화면이 «언제 확인해야 하는지» 를 보여줄 수 있게. */
function dueDate(contractDate: string): string | null {
  const c = new Date(contractDate + 'T00:00:00Z').getTime();
  if (isNaN(c)) return null;
  return new Date(c + RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
}

/** 직전 기간 — 'YYYY-MM' → 전달, 'YYYY-H1' → 전 반기. */
export function previousPeriod(p: string): string | null {
  let m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(p || ''));
  if (m) {
    let y = Number(m[1]), mo = Number(m[2]) - 1;
    if (mo === 0) { mo = 12; y--; }
    return `${y}-${String(mo).padStart(2, '0')}`;
  }
  m = /^(\d{4})-H([12])$/i.exec(String(p || ''));
  if (m) {
    const y = Number(m[1]), h = Number(m[2]);
    return h === 1 ? `${y - 1}-H2` : `${y}-H1`;
  }
  return null;
}

/** 파이프라인 병목 — 앞 단계 대비 다음 단계가 가장 크게 줄어든 곳.
 *  「방문은 많은데 제안이 없다」와 「제안은 많은데 계약이 없다」는 처방이 정반대라 구분해야 한다. */
export function findBottleneck(byStage: Record<number, number>): { from: number; to: number; label: string; drop: number } | null {
  let worst: { from: number; to: number; label: string; drop: number } | null = null;
  for (let n = 1; n <= 4; n++) {
    const a = byStage[n] || 0, b = byStage[n + 1] || 0;
    if (a < 3) continue;              // 표본이 너무 적으면 «병목» 이라고 말하지 않는다
    const drop = 1 - (b / a);
    if (drop <= 0.6) continue;        // 60% 넘게 줄어든 구간만 병목으로 본다
    if (!worst || drop > worst.drop) {
      worst = {
        from: n, to: n + 1, drop: Math.round(drop * 100) / 100,
        label: `${SALES_STAGES[n - 1].ko} → ${SALES_STAGES[n].ko} 에서 ${Math.round(drop * 100)}% 가 빠집니다`,
      };
    }
  }
  return worst;
}
