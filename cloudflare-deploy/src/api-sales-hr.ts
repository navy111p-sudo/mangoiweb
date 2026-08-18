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
    `  base_salary_krw INTEGER DEFAULT 0,`,
    `  incentive_per_deal_krw INTEGER DEFAULT 0,`,
    `  target_deals INTEGER DEFAULT 2,`,
    `  target_students INTEGER DEFAULT 20,`,
    `  target_visits INTEGER DEFAULT 48,`,
    `  target_leads INTEGER DEFAULT 20,`,
    `  target_care INTEGER DEFAULT 8,`,
    `  active INTEGER DEFAULT 1,`,
    `  notes TEXT,`,
    `  created_at INTEGER NOT NULL,`,
    `  updated_at INTEGER NOT NULL`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_sales_reps_active ON sales_reps(active);`);

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
    deals: Number(rep?.target_deals ?? 2),
    students: Number(rep?.target_students ?? 20),
    visits: Number(rep?.target_visits ?? 48),
    leads: Number(rep?.target_leads ?? 20),
    care: Number(rep?.target_care ?? 8),
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
    `SELECT id, center_name, contract_date, students_initial, students_3m, retained_3m
       FROM sales_deals WHERE rep_id = ? AND contract_date >= ? AND contract_date <= ?`
  ).bind(rep.id, range.start, range.end).all().catch(() => ({ results: [] }));
  const deals: any[] = dealRows?.results || [];

  items.push(scoreOf('deals', deals.length, t.deals));

  const students = deals.reduce((a, d) => a + num(d.students_3m, num(d.students_initial, 0)), 0);
  items.push(scoreOf('students', students, t.students));

  // 유지율 — 90일이 지난 계약만 분모. 아직 못 재는 계약을 실패로 세면 안 된다.
  const matured = deals.filter(d => maturedBy(String(d.contract_date), asOf));
  if (matured.length === 0) {
    items.push({
      key: 'retention', label: SALES_LABELS.retention, weight: SALES_EVAL_WEIGHTS.retention,
      actual: null, target: null, rate: null, score: null,
      reason: `3개월(${RETENTION_DAYS}일)이 지난 계약이 아직 없어 유지율을 잴 수 없습니다(해당없음).`,
    });
  } else {
    const kept = matured.filter(d => Number(d.retained_3m) === 1).length;
    const rate = kept / matured.length;
    items.push({
      key: 'retention', label: SALES_LABELS.retention, weight: SALES_EVAL_WEIGHTS.retention,
      actual: kept, target: matured.length, rate: Math.round(rate * 1000) / 1000,
      score: Math.round(rate * SALES_EVAL_WEIGHTS.retention * 100) / 100,
      reason: `3개월이 지난 계약 ${matured.length}곳 중 ${kept}곳 유지(${Math.round(rate * 100)}%)`,
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
    const want = Number(raw);
    if (hq) return isNaN(want) ? null : want;
    return myRepId;
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
    return json({ ok: true, reps: rs?.results || [], can_edit: hq });
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
      Math.max(0, num(body?.base_salary_krw, 0)),
      Math.max(0, num(body?.incentive_per_deal_krw, 0)),
      Math.max(0, num(body?.target_deals, 2)),
      Math.max(0, num(body?.target_students, 20)),
      Math.max(0, num(body?.target_visits, 48)),
      Math.max(0, num(body?.target_leads, 20)),
      Math.max(0, num(body?.target_care, 8)),
      body?.active === 0 || body?.active === false ? 0 : 1,
      String(body?.notes || '').trim() || null,
    ];
    if (id > 0) {
      await env.DB.prepare(
        `UPDATE sales_reps SET name=?, phone=?, email=?, admin_username=?, region=?, hired_at=?,
           base_salary_krw=?, incentive_per_deal_krw=?, target_deals=?, target_students=?,
           target_visits=?, target_leads=?, target_care=?, active=?, notes=?, updated_at=?
         WHERE id=?`
      ).bind(...vals, now, id).run();
      return json({ ok: true, id });
    }
    const ins: any = await env.DB.prepare(
      `INSERT INTO sales_reps (name, phone, email, admin_username, region, hired_at,
         base_salary_krw, incentive_per_deal_krw, target_deals, target_students,
         target_visits, target_leads, target_care, active, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
    const bonus = (range.kind === 'half' && grade)
      ? Math.round(num(rep.base_salary_krw, 0) * (SALES_BONUS_MULTIPLIER[grade] ?? 0))
      : null;

    return json({
      ok: true,
      rep, period: periodRaw, period_label: range.label, as_of: asOf,
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
    const bonus = (range.kind === 'half' && grade)
      ? Math.round(num(rep.base_salary_krw, 0) * (SALES_BONUS_MULTIPLIER[grade] ?? 0))
      : null;

    // 스냅샷 — 나중에 원본이 바뀌어도 «그때 무엇을 보고 이 등급을 줬는지» 가 남아야 한다.
    const snapshot = JSON.stringify({
      as_of: asOf, period: periodRaw, auto, manual, final: ft, grade, bonus_krw: bonus,
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

    return json({ ok: true, final: ft, grade, bonus_krw: bonus, auto });
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
      hq ? `SELECT id, rep_id, center_name, contract_date FROM sales_deals
             WHERE retained_3m IS NULL ORDER BY contract_date ASC LIMIT 50`
         : `SELECT id, rep_id, center_name, contract_date FROM sales_deals
             WHERE retained_3m IS NULL AND rep_id = ? ORDER BY contract_date ASC LIMIT 50`
    ).bind(...(hq ? [] : [myRepId])).all().catch(() => ({ results: [] }));
    const dueNow = (dueRs?.results || [])
      .filter((d: any) => maturedBy(String(d.contract_date), asOf))
      .map((d: any) => ({ ...d, retention_due: dueDate(String(d.contract_date)) }));

    return json({
      ok: true, period: periodRaw, period_label: range.label, as_of: asOf,
      can_edit: hq, cards, recent_activities: recent?.results || [],
      retention_due: dueNow, stages: SALES_STAGES,
      weights: SALES_EVAL_WEIGHTS, labels: SALES_LABELS,
      grade_multiplier: SALES_BONUS_MULTIPLIER,
    });
  }

  return json({ ok: false, error: 'not_found', path }, 404);
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
