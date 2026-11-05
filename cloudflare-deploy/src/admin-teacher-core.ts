/** Shared teacher naming, evaluation and payroll calculations. */
import { DEFAULT_CLASS_MINUTES, classTenMinUnits } from './class-policy';
import { type HolidayClosure } from './holiday-closure';



// ═══ 💼 급여 상수·계산 클러스터 (api-mango.ts 에서 이동, 8차) ═══
//   - 환율: 1 PHP = 24.34 KRW (트리맵·요약용)
// ========================================================================

/** 환율 — KRW 표시용 (트리맵 등). 정기적 갱신 필요 시 wrangler vars 로 빼낼 것. */
export const PAYROLL_PHP_TO_KRW = 24.34;


/** 평가 카테고리 가중치 (합계 1.0). */
export const EVAL_WEIGHTS = {
  instruction:  0.25,  // 수업 우수성 (Instructional Excellence)
  retention:    0.30,  // 학생 재등록 유지율
  punctuality:  0.20,  // 성실성 / 시간엄수
  admin:        0.15,  // 행정 / 업무 성실도
  contribution: 0.10,  // 조직 기여도
};


/** 등급 임계값 + 라벨. */
export function classifyEvalGrade(weighted: number): string {
  if (weighted == null || isNaN(weighted)) return '미평가';
  if (weighted >= 4.75) return '최우수';
  if (weighted >= 4.50) return '매우 우수';
  if (weighted >= 3.50) return '우수';
  return '개선 요망';
}


export const VALID_TEACHER_STATUS = ['office', 'home'] as const;


/* 🗓️ 요일 표기 관용 파서 — /api/admin/classes/today (매니저 '오늘 수업') 용.
 *
 *  [무슨 일이 있었나 — 2026-08-06 마이마이 제보 "no class in manager's page"]
 *   매니저 화면의 '오늘 수업'은 **하루도 빠짐없이 비어 있었다**. 예약이 없어서가 아니다.
 *   여기만 `Number(day_of_week) === kDow` 로 비교하고 있었는데, 운영 D1 의
 *   class_schedules.day_of_week 는 **전부 영문 텍스트**('Wed' 153건·'Fri' 142·'Tue' 123·
 *   'Thu' 108·'Mon' 106·'Sat' 26)로 저장돼 있다. `Number('Thu')` 는 NaN 이고
 *   NaN === 4 는 항상 false → 반복수업 662건이 매일 통째로 걸러졌다.
 *   테이블 DDL 이 `day_of_week INTEGER` 라고 적혀 있어서 숫자일 거라 믿은 것이 화근인데,
 *   SQLite 는 선언 타입을 강제하지 않는다(실제 typeof = 'text').
 *   ⚠️ 에러가 한 줄도 안 난다. 화면은 "오늘 예정된 수업이 없습니다"라는 **정상 문구**를 띄웠고,
 *      그래서 아무도 고장으로 신고하지 않았다.
 *
 *  [왜 다른 화면은 멀쩡했나]
 *   학생·강사 경로(api-mango.ts sessions/today, api-teacher.ts)는 2026-07-24 에 이미
 *   같은 사고를 겪고 관용 파서로 고쳤다. 그때 **매니저 경로만 빠졌다**.
 *   → 세 곳이 같은 규칙이어야 한다. 여기만 좁으면 학생은 수업이 보이는데
 *     대신 들어가 줘야 할 매니저에게만 안 보이는, 가장 나쁜 방향의 엇갈림이 생긴다.
 */
export const ADM_DOW_MAP: Record<string, number> = {
  sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
  tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
  thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
  sat: 6, saturday: 6, '토': 6, '토요일': 6,
};

/** 숫자 '5' · 콤마목록 '1,3' · 영문 'Mon' · 한글 '월' 을 모두 받는다. (매칭을 넓히기만 한다) */
export function admDowMatches(raw: any, target: number): boolean {
  for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
    const t = p.trim();
    if (!t) continue;
    if (/^\d+$/.test(t)) { if (Number(t) === target) return true; continue; }
    const k = ADM_DOW_MAP[t.toLowerCase()];
    if (k !== undefined && k === target) return true;
  }
  return false;
}


// ═══ 📊 인사평가 근거 분석 공용 헬퍼 (/api/admin/teacher-hr-analysis) ═══
/** 강사 이름 정규화 — 수업기록 테이블은 teacher_name(자유문자열)만 남기므로 표기 흔들림을 흡수. */
export function hrNormName(s: any): string {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/^teacher\s+/, '')      // "Teacher Ana" == "Ana"
    .replace(/[\s._\-]+/g, '')
    .trim();
}

/** 0~100 총점 → 목록·모달 공용 등급 라벨 (adm-core.js _hrGrade 와 동일 임계값). */
export function hrGradeLabel(total: number | null): string | null {
  if (total == null || isNaN(total)) return null;
  if (total >= 90) return 'A+';
  if (total >= 85) return 'A';
  if (total >= 80) return 'B+';
  if (total >= 75) return 'B';
  if (total >= 70) return 'C+';
  if (total >= 65) return 'C';
  return 'D';
}


let _payrollSchemaReady = false;
   // ⚡ /api/admin/enrollments 스키마 보강 — 인스턴스당 한 번
export async function ensurePayrollSchema(env: { DB: D1Database }): Promise<void> {
  if (_payrollSchemaReady) return;
  // teachers — 기존 호환 + 신규 컬럼
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS teachers (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  user_id TEXT,`,
    `  name TEXT NOT NULL,`,
    `  center_id INTEGER,`,
    `  rank TEXT,`,                                    // deprecated, NOT NULL 해제 (있으면 NULL 허용)
    `  hourly_rate_php INTEGER,`,                      // deprecated, 새 모델은 rate_per_10min_php 사용
    `  status TEXT,`,                                   // 'office' | 'home'
    `  years INTEGER,`,                                 // 근속 연수
    `  rate_per_10min_php REAL,`,                       // 10분당 단가 (강사별)
    `  active INTEGER DEFAULT 1,`,
    `  created_at INTEGER NOT NULL,`,
    `  updated_at INTEGER NOT NULL`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_teachers_active ON teachers(active);`);
  // 기존 DB 에 컬럼 누락 시 ALTER 로 추가 (이미 있으면 SQLite 가 throw → 흡수)
  for (const ddl of [
    `ALTER TABLE teachers ADD COLUMN status TEXT;`,
    `ALTER TABLE teachers ADD COLUMN years INTEGER;`,
    `ALTER TABLE teachers ADD COLUMN rate_per_10min_php REAL;`,
  ]) {
    try { await env.DB.exec(ddl); } catch { /* duplicate column — 정상 */ }
  }

  // 월별 수업 수 (20분 단위)
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS teacher_monthly_classes (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  teacher_id INTEGER NOT NULL,`,
    `  year INTEGER NOT NULL,`,
    `  month INTEGER NOT NULL,`,
    `  class_count INTEGER NOT NULL DEFAULT 0,`,
    `  notes TEXT,`,
    `  updated_at INTEGER NOT NULL,`,
    `  UNIQUE(teacher_id, year, month)`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_tmc_year_month ON teacher_monthly_classes(year, month);`);

  // 월별 평가 (5개 카테고리 점수 + 가중 합계 + 등급)
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS teacher_evaluations (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  teacher_id INTEGER NOT NULL,`,
    `  year INTEGER NOT NULL,`,
    `  month INTEGER NOT NULL,`,
    `  score_instruction REAL,`,
    `  score_retention REAL,`,
    `  score_punctuality REAL,`,
    `  score_admin REAL,`,
    `  score_contribution REAL,`,
    `  weighted_total REAL,`,
    `  grade TEXT,`,
    `  strengths TEXT,`,
    `  improvements TEXT,`,
    `  evaluator TEXT,`,
    `  evaluated_at INTEGER,`,
    `  UNIQUE(teacher_id, year, month)`,
    `);`
  ].join(' '));
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_te_year_month ON teacher_evaluations(year, month);`);

  // payslips — 마감용 (새 모델 컬럼)
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS payslips (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  teacher_id INTEGER NOT NULL,`,
    `  year INTEGER NOT NULL,`,
    `  month INTEGER NOT NULL,`,
    `  status TEXT,`,
    `  class_count INTEGER,`,
    `  rate_per_10min_php REAL,`,
    `  monthly_salary_php REAL,`,
    `  weighted_total REAL,`,
    `  grade TEXT,`,
    `  finalized_at INTEGER NOT NULL,`,
    `  finalized_by TEXT,`,
    `  UNIQUE(teacher_id, year, month)`,
    `);`
  ].join(' '));
  // 기존 payslips 테이블에 새 컬럼 추가 (재배포 호환)
  // 회계 보고서(accounting-reports.ts)가 SELECT 하는 컬럼 — period, payment_krw,
  // payment_php, minutes_taught, evaluation_score, bonus_krw, deduction_krw, paid —
  // 가 스키마에 없으면 보고서 값이 전부 0/null 로 나오므로 함께 추가.
  for (const ddl of [
    `ALTER TABLE payslips ADD COLUMN status TEXT;`,
    `ALTER TABLE payslips ADD COLUMN class_count INTEGER;`,
    `ALTER TABLE payslips ADD COLUMN rate_per_10min_php REAL;`,
    `ALTER TABLE payslips ADD COLUMN monthly_salary_php REAL;`,
    `ALTER TABLE payslips ADD COLUMN weighted_total REAL;`,
    `ALTER TABLE payslips ADD COLUMN grade TEXT;`,
    `ALTER TABLE payslips ADD COLUMN period TEXT;`,
    `ALTER TABLE payslips ADD COLUMN payment_krw INTEGER;`,
    `ALTER TABLE payslips ADD COLUMN payment_php REAL;`,
    `ALTER TABLE payslips ADD COLUMN minutes_taught INTEGER;`,
    `ALTER TABLE payslips ADD COLUMN evaluation_score REAL;`,
    `ALTER TABLE payslips ADD COLUMN bonus_krw INTEGER DEFAULT 0;`,
    `ALTER TABLE payslips ADD COLUMN deduction_krw INTEGER DEFAULT 0;`,
    `ALTER TABLE payslips ADD COLUMN paid INTEGER DEFAULT 0;`,
    // 🕐 (2026-08-17) 30분 수업 도입 — 급여식이 «class_count × 2» 로 모든 수업을 20분으로
    //   가정하고 있었다. 길이가 섞이면 강사가 30분을 가르치고 20분 값을 받는다.
    //   실제 «10분 토막» 합계를 담는 칸. 비어 있으면 예전대로 class_count×2 로 계산한다
    //   (= 전부 20분이던 과거 달의 값이 바뀌지 않는다).
    `ALTER TABLE teacher_monthly_classes ADD COLUMN total_10min_units INTEGER;`,
  ]) {
    try { await env.DB.exec(ddl); } catch { /* duplicate column — 정상 */ }
  }
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(period);`); } catch { /* noop */ }

  _payrollSchemaReady = true;
}


/** 평가 점수 5개 → 가중 합계 (없으면 null). */
export function calcWeightedTotal(e: {
  score_instruction?: number | null,
  score_retention?: number | null,
  score_punctuality?: number | null,
  score_admin?: number | null,
  score_contribution?: number | null,
} | null): number | null {
  if (!e) return null;
  const i = e.score_instruction, r = e.score_retention, p = e.score_punctuality,
        a = e.score_admin, c = e.score_contribution;
  // 5개 모두 있어야 합산
  if ([i, r, p, a, c].some(v => v == null || isNaN(Number(v)))) return null;
  const total = Number(i) * EVAL_WEIGHTS.instruction
              + Number(r) * EVAL_WEIGHTS.retention
              + Number(p) * EVAL_WEIGHTS.punctuality
              + Number(a) * EVAL_WEIGHTS.admin
              + Number(c) * EVAL_WEIGHTS.contribution;
  return Math.round(total * 100) / 100;
}


/**
 * 한 강사의 월 급여·평가 통합 계산.
 *   월급 = «10분 토막 수» × rate_per_10min_php
 *   평가 = teacher_evaluations 의 5개 점수 → 가중 합계 → 등급
 *
 *   🕐 (2026-08-17) 예전 식은 «class_count × 2» 였다. 그 «2» 는 10분 토막 개수인데
 *      모든 수업이 20분이라는 가정이 박혀 있었다. 30분 수업이 생기면 강사가
 *      30분을 가르치고 20분 값을 받는다(임금 삭감 → 강사 이탈).
 *      이제 total_10min_units 가 있으면 그것을 쓰고, 없으면(=과거 달) 예전 식 그대로.
 */
/* ═══ 카페24 급여 인제스트를 «이름으로» 잇는다 (2026-08-18 사장님 요청 3안) ═══
   teacher_payroll_auto 는 카페24 서버가 매달 밀어 넣는 표다(/api/payroll-ingest).
   ⛔ 그 표의 teacher_id 는 **카페24 MySQL 번호**로, D1 의 teachers.id(1~29)·
      teacher_profiles.id(4~37) 와 완전히 다른 번호 체계다. 실측(2026-08-18) 9~196 이고
      겹치는 구간에서 서로 **다른 사람**을 가리킨다:
        카페24 9 =「테스트 강사」 · teachers 9 = ZEE · profiles 9 = Teacher Hannah
        카페24 24 = Teacher Mariane · teachers 24 = HANNAH · profiles 24 = Teacher JP
      번호로 이으면 «남의 급여» 가 된다. 이 파일이 이미 profByTeacherId 다리를 두고
      「번호 직조회는 다른 번호 체계라 남의 프로필이 나온다」고 적어 둔 것과 같은 함정이다.
   ✅ 그래서 **이름**으로 잇는다. 정확 일치가 우선이고, 안 맞으면 «Teacher » 접두사를 뗀
      정규화 이름으로 한 번 더 본다(카페24 «Teacher Faye» ↔ 명부 «FAYE» 같은 경우).
      정규화 후 같은 이름이 둘 이상이면 **잇지 않는다** — 애매한 연결은 틀린 급여보다 낫다.
      (실측: 정규화 후 중복 이름 0건, 32명 중 26명이 정확 일치로 이어진다) */
export function normTeacherName(v: any): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/^teacher\s+/, '');
}


/* ═══ 카페24 강사번호 → «이름 · 원부번호» 다리 (2026-08-19) ═══
   attendance.teacher_uid 는 **카페24 강사번호**다(실측 9~196). 그런데 —
     ① 이름 칸(attendance.teacher_name)은 거의 비어 있다. 4주 실측(2026-07-22~08-19)에서
        학생 행 4,084건 중 강사번호는 3,251건(80%)에 있는데 **이름은 243건(6%)** 뿐이었다.
     ② 그 243건은 «비어 있는 것보다 나쁘다» — 옛 동기화가 카페24 번호를 `teachers.id` 로
        오인해 조회한 **남의 이름**이다(카페24 24 = Teacher Mariane 인데 HANNAH 로 적혀 있다).
        동기화 코드는 79aa8ed 에서 고쳤지만 **이미 들어간 행은 그대로**다.
   ⛔ 그래서 attendance.teacher_name 을 읽지 말 것. 번호로 매번 다시 찾는다.
   ✅ 이름 = teacher_payroll_auto. 카페24 서버가 «번호와 이름을 함께» 밀어넣은 유일한 표라
      번호↔이름이 어긋나지 않는다(실측: 4주에 나온 강사번호 27개가 전부 여기서 이름이 나온다).
   ✅ 원부번호 = 그 이름을 normTeacherName 으로 정규화해 teachers 와 **유일하게** 맞을 때만.
      class_schedules.teacher_id 를 읽는 화면들이 `LEFT JOIN teachers` 를 하므로, 여기에
      카페24 번호를 그대로 넣으면 번호가 겹치는 자리에서 조용히 남의 이름이 뜬다(=①과 같은 사고).
      애매하면 **비워 둔다** — 빈 칸은 눈에 띄지만 틀린 이름은 안 띈다.
      (실측: 665건 중 이름 665건 · 원부연결 590건. 못 이은 것은 「HT NESS」·「Wan」과
       사람이 아닌 「스케줄변경중」·「test teacher」다) */
export type Cafe24TeacherInfo = { name: string | null; teacherId: string | null };


/** 🎌 (2026-10-09) 휴강 예외 강사(원부 번호)의 «정규화된 이름» — 카페24 줄을 이름으로 알아보는 데 쓴다.
 *  원부를 못 읽으면 빈 집합(이름 예외만 못 볼 뿐 — 「중국어」·chinese 글자 판정은 그대로). 던지지 않는다. */
export async function loadHolidayExemptNames(env: any, hols: Array<HolidayClosure | null | undefined>): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const h of hols) if (h) for (const x of h.exempt) ids.add(x);
  const names = new Set<string>();
  if (!ids.size) return names;
  try {
    const er: any = await env.DB.prepare(`SELECT id, name FROM teachers`).all();
    for (const t of ((er.results || []) as any[])) if (ids.has(String(t.id))) names.add(normTeacherName(t.name));
  } catch { /* 원부 없음 */ }
  return names;
}


export async function loadCafe24TeacherMap(
  env: { DB: D1Database }, uids: (string | null | undefined)[],
): Promise<Map<string, Cafe24TeacherInfo>> {
  const out = new Map<string, Cafe24TeacherInfo>();
  const want = new Set(uids.map(u => String(u ?? '').trim()).filter(Boolean));
  if (!want.size) return out;

  // 원부(teachers) 정규화 이름 → id. 같은 이름이 둘 이상이면 «잇지 않음»(null) 으로 못 박는다.
  const tid = new Map<string, string | null>();
  try {
    const rs = await env.DB.prepare(`SELECT id, name FROM teachers`).all();
    for (const t of ((rs.results || []) as any[])) {
      const k = normTeacherName(t.name);
      if (!k) continue;
      tid.set(k, tid.has(k) ? null : String(t.id));
    }
  } catch { /* 원부가 없는 옛 DB — 이름만 준다 */ }

  try {
    // 오름차순이라 같은 번호가 여러 달 있으면 **최근 달 이름**이 남는다(개명·표기변경 반영)
    const rs = await env.DB.prepare(
      `SELECT CAST(teacher_id AS TEXT) AS c24, teacher_name
         FROM teacher_payroll_auto
        WHERE teacher_name IS NOT NULL AND teacher_name <> ''
        ORDER BY year ASC, month ASC`
    ).all();
    for (const r of ((rs.results || []) as any[])) {
      const c24 = String(r.c24 || '');
      if (!want.has(c24)) continue;
      const nm = String(r.teacher_name || '').trim();
      out.set(c24, { name: nm || null, teacherId: (tid.get(normTeacherName(nm)) ?? null) });
    }
  } catch { /* 급여 인제스트 표가 없는 옛 DB — 이름 없이 진행(화면이 «미상» 으로 보여 준다) */ }

  return out;
}


export async function loadCafe24PayrollMonth(env: { DB: D1Database }, year: number, month: number) {
  let rows: any[] = [];
  try {
    const rs = await env.DB.prepare(
      `SELECT teacher_id, teacher_name, completed_classes, total_classes, pay_php, total_minutes
         FROM teacher_payroll_auto WHERE year = ? AND month = ?`
    ).bind(year, month).all();
    rows = (rs.results || []) as any[];
  } catch { /* 표·칸이 없는 옛 DB — 없는 것으로 본다(화면은 종전대로 D1 계산만) */ }

  const byName: Record<string, any> = {};
  const dupe = new Set<string>();
  for (const r of rows) {
    const k = normTeacherName(r.teacher_name);
    if (!k) continue;
    if (byName[k]) dupe.add(k); else byName[k] = r;
  }
  for (const k of dupe) delete byName[k];        // 같은 이름이 둘이면 잇지 않는다
  const matched = new Set<string>();

  return {
    rows,
    /** 명부 이름들(한글명·영문명) 중 하나라도 카페24 행과 이어지면 그 행을 준다. */
    find(...names: any[]): any | null {
      for (const n of names) {
        const k = normTeacherName(n);
        if (k && byName[k]) { matched.add(k); return byName[k]; }
      }
      return null;
    },
    /** 카페24에는 있는데 화면 명부와 못 이은 강사 — 화면이 «몇 명이 빠졌는지» 알려 줄 수 있게. */
    unmatched(): any[] {
      return Object.keys(byName).filter(k => !matched.has(k)).map(k => ({
        teacher_id: byName[k].teacher_id, teacher_name: byName[k].teacher_name,
        completed_classes: byName[k].completed_classes, pay_php: byName[k].pay_php,
      }));
    },
  };
}


/**
 * 🪧 «이 강사는 이번 달 길이를 채워야 한다» 를 화면이 알려 주기 위한 명단 (사장님 요청 C안).
 *
 *   급여 화면에서 「총 수업시간(분)」을 비워 두면 «전부 20분» 으로 계산된다. 20분만 가르친
 *   강사에게는 그게 정답이라 비워 두는 것이 맞다. 문제는 **30·40분을 가르친 강사만** 채워야
 *   하는데, 그걸 사람이 기억해야 한다는 점이다. 빠뜨리면 강사가 조용히 손해를 본다.
 *   그래서 «긴 수업을 가진 강사» 를 서버가 뽑아 화면에 표시한다.
 *
 *   ⚠️ class_schedules 는 깨끗한 표가 아니다. 실측(2026-08-18):
 *      · class_type='blocked' 100건 — 수업이 아니라 «근무 불가» 블록이다
 *      · source='lms_import_w26' 518건 — 옛 LMS 를 옮기며 길이를 60 으로 일괄로 박아 둔 것
 *      · source='type_seed_20260623' — 유형 시드 자료
 *      이것들을 그대로 세면 «전원 긴 수업 있음» 이 되어 경고가 의미를 잃는다(늑대소년).
 *      그래서 위 셋을 뺀다. 지금 이 조건의 결과는 0명이고, 그게 맞다 —
 *      30분 상품이 이제 막 열려서 아직 파는 중이기 때문이다.
 *   ⚠️ teacher_id 는 TEXT 인데 안에 숫자가 들어 있다(실측: '8','5'…). CAST 로 맞춘다.
 *   ⚠️ 이것은 «참고 표시» 일 뿐 급여의 근거가 아니다. 근거는 total_10min_units(사람) 또는
 *      카페24가 보낸 total_minutes 다. 여기서 나온 명단으로 금액을 계산하지 말 것.
 */
export async function longClassTeacherIds(env: { DB: D1Database }): Promise<Set<number>> {
  const out = new Set<number>();
  try {
    const rs = await env.DB.prepare(
      `SELECT DISTINCT CAST(teacher_id AS INTEGER) AS tid
         FROM class_schedules
        WHERE status = 'active'
          AND duration_min > ?
          AND COALESCE(class_type, '') NOT IN ('blocked', 'level_test')
          AND COALESCE(source, '') NOT LIKE 'lms_import%'
          AND COALESCE(source, '') NOT LIKE 'type_seed%'`
    ).bind(DEFAULT_CLASS_MINUTES).all();
    for (const r of (rs.results || []) as any[]) {
      const n = Number(r.tid);
      if (n > 0) out.add(n);
    }
  } catch { /* 표가 없거나 칸이 없는 환경 — 명단 없음으로 (경고만 안 뜬다) */ }
  return out;
}


export async function calcPayrollOne(env: { DB: D1Database }, teacherId: number, year: number, month: number): Promise<any> {
  const t: any = await env.DB.prepare(
    `SELECT id, name, status, years, rate_per_10min_php, hourly_rate_php, rank, center_id, active
     FROM teachers WHERE id = ?`
  ).bind(teacherId).first();
  if (!t) return { ok: false, error: 'teacher_not_found', teacher_id: teacherId };

  const cl: any = await env.DB.prepare(
    `SELECT class_count, total_10min_units, notes FROM teacher_monthly_classes
     WHERE teacher_id = ? AND year = ? AND month = ?`
  ).bind(teacherId, year, month).first();
  const classCount = cl ? Number(cl.class_count) : 0;

  /* 🕐 (2026-08-18) 길이의 출처를 «셋 중 하나» 로 정리한다. 위에서부터 이긴다.
       ① manual  — 사람이 급여 화면에 넣은 total_10min_units. 사람이 명시한 값이므로 가장 세다.
       ② ingest  — 카페24가 매달 보내 주는 teacher_payroll_auto.total_minutes (사장님 요청 A안).
                   이것이 들어오면 «급여 담당자가 손으로 넣는 일» 자체가 없어진다.
       ③ assumed — 둘 다 없으면 예전 규칙(전부 20분 = class_count × 2).
     ⚠️ ①이 ②를 이기는 순서를 뒤집지 말 것 — 사람이 카페24 값을 고치려고 넣었는데
        다음 인제스트가 덮으면 «고쳤는데 원복됐다» 가 된다. */
  let tenMinUnits = classCount * classTenMinUnits(DEFAULT_CLASS_MINUTES);
  let lengthSource: 'manual' | 'ingest' | 'assumed_20min' = 'assumed_20min';
  if (cl && Number(cl.total_10min_units) > 0) {
    tenMinUnits = Number(cl.total_10min_units);
    lengthSource = 'manual';
  } else {
    let ing: any = null;
    try {
      /* ⛔ 여기서 teacher_id 로 조회하면 안 된다 — teacher_payroll_auto 의 번호는 카페24 번호라
         우리 teachers.id 와 겹치는 구간에서 **다른 사람**을 가리킨다(위 loadCafe24PayrollMonth
         주석의 실측 참고). 2026-08-18 에 번호 조회로 넣었다가 같은 날 바로잡았다.
         지금까지 사고가 안 난 이유는 total_minutes 가 아직 전부 NULL 이라 결과가 없었기 때문이고,
         카페24 가 분을 보내기 시작하는 순간 남의 분으로 급여가 나갔을 자리다. */
      const c24 = await loadCafe24PayrollMonth(env, year, month);
      ing = c24.find(t.name);
    } catch { /* 칸이 아직 없는 옛 DB — 종전대로 ③ */ }
    if (ing && Number(ing.total_minutes) > 0) {
      tenMinUnits = Number(ing.total_minutes) / 10;
      lengthSource = 'ingest';
    }
  }
  // 화면이 «전부 20분으로 가정한 달» 을 구분해 경고할 수 있게 남긴다(①②면 true).
  const lengthRecorded = lengthSource !== 'assumed_20min';

  const ev: any = await env.DB.prepare(
    `SELECT score_instruction, score_retention, score_punctuality, score_admin, score_contribution,
            weighted_total, grade, strengths, improvements, evaluator, evaluated_at
     FROM teacher_evaluations WHERE teacher_id = ? AND year = ? AND month = ?`
  ).bind(teacherId, year, month).first();

  const rate = Number(t.rate_per_10min_php || 0);
  const monthlySalary = Math.round(tenMinUnits * rate * 100) / 100;
  const weighted = ev ? (ev.weighted_total != null ? Number(ev.weighted_total) : calcWeightedTotal(ev)) : null;
  const grade = weighted != null ? classifyEvalGrade(weighted) : '미평가';

  return {
    ok: true,
    teacher_id: t.id,
    teacher_name: t.name,
    status: t.status || null,
    years: t.years != null ? Number(t.years) : null,
    rate_per_10min_php: rate,
    year, month,
    class_count: classCount,
    total_10min_units: tenMinUnits,      // 급여 근거 — 20분만이면 class_count×2 와 같다
    total_minutes: Math.round(tenMinUnits * 10),
    // false = 그 달의 실제 길이가 입력된 적이 없어 «전부 20분» 으로 계산했다는 뜻.
    // 화면이 이걸 구분해 보여 줘야 30분 수업을 20분 값으로 지급하는 사고를 눈치챌 수 있다.
    length_recorded: lengthRecorded,
    // 'manual'(사람 입력) · 'ingest'(카페24가 보낸 분) · 'assumed_20min'(전부 20분으로 가정)
    length_source: lengthSource,
    monthly_salary_php: monthlySalary,
    monthly_salary_krw: Math.round(monthlySalary * PAYROLL_PHP_TO_KRW),
    php_to_krw: PAYROLL_PHP_TO_KRW,
    evaluation: ev ? {
      score_instruction:  ev.score_instruction,
      score_retention:    ev.score_retention,
      score_punctuality:  ev.score_punctuality,
      score_admin:        ev.score_admin,
      score_contribution: ev.score_contribution,
      weighted_total:     weighted,
      grade,
      strengths:          ev.strengths,
      improvements:       ev.improvements,
      evaluator:          ev.evaluator,
      evaluated_at:       ev.evaluated_at,
    } : null,
    weighted_total: weighted,
    grade,
    currency: 'PHP'
  };
}
