/**
 * payroll_minutes_source_harness.mjs
 * ── 「급여의 «분» 이 어디서 오는가」 회귀 감시 (2026-08-18) ──
 *
 * 왜 필요한가:
 *   30분 수업이 생기면서 급여가 «수업 수 × 20분» 으로는 맞지 않게 됐다. 지금 분의 출처는 셋이다.
 *     ① manual  — 사람이 급여 화면에 넣은 total_10min_units
 *     ② ingest  — 카페24가 매달 보내 주는 teacher_payroll_auto.total_minutes  ← A안
 *     ③ assumed — 둘 다 없으면 예전 규칙(전부 20분)
 *   이 순서가 뒤집히면 조용히 돈이 틀어진다. ①이 ②에게 지면 «사람이 고쳤는데 다음 인제스트가
 *   원복» 이고, ③이 ②를 이기면 «카페24가 보냈는데도 20분으로 지급» 이다. 둘 다 사람 눈에
 *   안 보이는 사고라 여기서 실행해 확인한다(문자열 검사가 아니라 진짜로 계산시킨다).
 *
 * 실행: node test-harness/payroll_minutes_source_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dirname, '..', 'cloudflare-deploy', 'public');

let pass = 0; const fails = [];
const ok  = (m) => { pass++; console.log('  ✅ ' + m); };
const bad = (m) => { fails.push(m); console.log('  ❌ ' + m); };
const check = (m, c) => c ? ok(m) : bad(m);

const adminTs = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
const autoTs  = readFileSync(join(SRC, 'api-payroll-auto.ts'), 'utf8');
const core    = readFileSync(join(PUB, 'js', 'adm-core.js'), 'utf8');

/* ── calcPayrollOne 을 소스에서 떼어 내 실제로 실행한다 ───────────────────────
   타입 표기만 걷어내고 나머지는 원문 그대로 쓴다. 「복제해서 검사」 하면 원본이
   바뀌어도 하니스는 계속 통과하므로 아무것도 지키지 못한다. */
function extract(name, text) {
  const i = text.indexOf('async function ' + name);
  if (i < 0) throw new Error(name + ' 를 못 찾음');
  /* ⚠️ 본문 여는 «{» 를 indexOf('{') 로 찾으면 안 된다 — 매개변수 타입
     `env: { DB: D1Database }` 의 중괄호가 먼저 걸려 함수가 한 줄에서 끝난 것처럼 잘린다.
     반환 타입 표기 뒤의 «{» 에서 시작한다. */
  const sigEnd = text.indexOf('Promise<any> {', i);
  if (sigEnd < 0) throw new Error(name + ' 의 본문 시작을 못 찾음');
  let d = 0, started = false, end = -1;
  for (let k = text.indexOf('{', sigEnd + 'Promise<any>'.length); k < text.length; k++) {
    const c = text[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) { end = k; break; } }
  }
  return text.slice(i, end + 1);
}
let body = extract('calcPayrollOne', adminTs)
  .replace(/^async function calcPayrollOne\([\s\S]*?\): Promise<any> \{/, 'async function calcPayrollOne(env, teacherId, year, month) {')
  .replace(/const (\w+): any =/g, 'const $1 =')
  .replace(/let (\w+): any =/g, 'let $1 =')
  .replace(/let lengthSource: [^=]+=/, 'let lengthSource =');

const DEFAULT_CLASS_MINUTES = 20;

/* 🔗 (2026-08-18) calcPayrollOne 이 카페24 값을 «이름으로» 찾도록 바뀌었다.
   그 다리(loadCafe24PayrollMonth·normTeacherName)도 원문에서 그대로 떼어 와 함께 실행한다 —
   흉내 낸 함수를 넣으면 진짜 코드가 바뀌어도 이 하니스가 계속 통과해 버린다. */
function extractPlain(name, text) {
  const i = text.indexOf('function ' + name);
  if (i < 0) throw new Error(name + ' 를 못 찾음');
  const braceStart = text.indexOf('{', text.indexOf(')', i));
  let d = 0, end = -1;
  for (let k = braceStart; k < text.length; k++) {
    const c = text[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) { end = k; break; } }
  }
  return text.slice(i, end + 1);
}
const bridgeSrc = (extractPlain('normTeacherName', adminTs) + '\n' + extractPlain('loadCafe24PayrollMonth', adminTs))
  .replace(/function normTeacherName\(v: any\): string \{/, 'function normTeacherName(v) {')
  .replace(/(?:async )?function loadCafe24PayrollMonth\([\s\S]*?\) \{/,
           'async function loadCafe24PayrollMonth(env, year, month) {')
  .replace(/let rows: any\[\] = \[\];/, 'let rows = [];')
  .replace(/rows = \(rs\.results \|\| \[\]\) as any\[\];/, 'rows = (rs.results || []);')
  .replace(/const byName: Record<string, any> = \{\};/, 'const byName = {};')
  .replace(/const dupe = new Set<string>\(\);/, 'const dupe = new Set();')
  .replace(/const matched = new Set<string>\(\);/, 'const matched = new Set();')
  .replace(/find\(\.\.\.names: any\[\]\): any \| null \{/, 'find(...names) {')
  .replace(/unmatched\(\): any\[\] \{/, 'unmatched() {');

const fn = new Function(
  'DEFAULT_CLASS_MINUTES', 'classTenMinUnits', 'PAYROLL_PHP_TO_KRW', 'calcWeightedTotal', 'classifyEvalGrade',
  bridgeSrc + '\n' + body + '; return calcPayrollOne;'
)(DEFAULT_CLASS_MINUTES, (m) => m / 10, 24, () => 0, () => '미평가');

/** 아주 작은 D1 흉내 — 어떤 SELECT 인지 보고 미리 정해 둔 행을 돌려준다.
    카페24 표는 이제 .all() 로 그 달 전체를 읽어 «이름으로» 잇는다. */
function fakeDb({ teacher, monthly, ingest }) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          if (/FROM teachers/.test(sql))                 return teacher;
          if (/teacher_monthly_classes/.test(sql))       return monthly;
          if (/teacher_evaluations/.test(sql))           return null;
          return null;
        },
        async all() {
          if (/teacher_payroll_auto/.test(sql)) return { results: ingest ? [ingest] : [] };
          return { results: [] };
        }
      };
    }
  };
}
const T = { id: 1, name: '테스트강사', status: 'active', years: 1, rate_per_10min_php: 30, hourly_rate_php: 0, rank: 'A', center_id: 1, active: 1 };
/* 카페24 행은 이름으로 잇는다 — 이름이 없으면 이어지지 않는 것이 정상이다 */
const c24 = (mins) => ({ teacher_id: 161, teacher_name: T.name, completed_classes: 10, pay_php: 0, total_minutes: mins });
const run = (monthly, ingest) => fn({ DB: fakeDb({ teacher: T, monthly, ingest }) }, 1, 2026, 8);

console.log('\n════════ 급여 «분» 출처 3단 우선순위 ════════');
{
  /* ③ 아무것도 없으면 예전 규칙 — 100회 × 20분 = 2,000분 = 200토막 */
  const r = await run({ class_count: 100, total_10min_units: null, notes: null }, null);
  check('③ 둘 다 없으면 «전부 20분» (100회 → 2,000분)', r.total_minutes === 2000 && r.total_10min_units === 200);
  check('③ 출처가 assumed_20min 으로 표시된다', r.length_source === 'assumed_20min');
  check('③ length_recorded 는 false (화면이 경고할 수 있어야 한다)', r.length_recorded === false);
  check('③ 급여 = 200토막 × 30₱ = 6,000₱', r.monthly_salary_php === 6000);
}
{
  /* ② 카페24가 분을 보내 주면 사람 손 없이 그것으로 계산 — 30분 100회 = 3,000분 */
  const r = await run({ class_count: 100, total_10min_units: null, notes: null }, c24(3000));
  check('② 카페24가 보낸 분이 있으면 그것으로 계산 (3,000분 → 300토막)', r.total_10min_units === 300);
  check('② 출처가 ingest 로 표시된다', r.length_source === 'ingest');
  check('② length_recorded 는 true (경고를 띄우지 않는다)', r.length_recorded === true);
  check('② 급여 = 300토막 × 30₱ = 9,000₱ (20분으로 치면 6,000₱ — 3,000₱ 차이)', r.monthly_salary_php === 9000);
}
{
  /* ① 사람이 넣은 값이 카페24보다 세다 — 뒤집히면 «고쳤는데 원복» 이 된다 */
  const r = await run({ class_count: 100, total_10min_units: 250, notes: null }, c24(3000));
  check('① 사람 입력이 카페24 값을 이긴다 (250토막)', r.total_10min_units === 250);
  check('① 출처가 manual 로 표시된다', r.length_source === 'manual');
}
{
  /* 0 이나 NULL 을 «값» 으로 오해하면 안 된다 */
  const r = await run({ class_count: 10, total_10min_units: 0, notes: null }, c24(0));
  check('0 은 «안 들어온 것» 으로 본다 (0분 지급 사고 방지)', r.length_source === 'assumed_20min' && r.total_minutes === 200);
}
{
  /* 옛 DB(칸이 아직 없음)에서 조회가 던져도 급여는 나와야 한다 */
  const db = { prepare(sql) { return { bind() { return this; }, async first() {
    if (/FROM teachers/.test(sql)) return T;
    if (/teacher_monthly_classes/.test(sql)) return { class_count: 5, total_10min_units: null, notes: null };
    return null;
  }, async all() {
    if (/teacher_payroll_auto/.test(sql)) throw new Error('no such column: total_minutes');
    return { results: [] };
  } }; } };
  const r = await fn({ DB: db }, 1, 2026, 8);
  check('칸이 없는 옛 DB 에서도 죽지 않고 예전 규칙으로 계산한다', r.ok === true && r.total_minutes === 100);
}

console.log('\n════════ 인제스트(A안) — 카페24 → 워커 ════════');
check('total_minutes 칸을 만든다(ALTER)', /ALTER TABLE teacher_payroll_auto ADD COLUMN total_minutes/.test(autoTs));
check('total_minutes / minutes 두 이름을 다 받는다', /r\.total_minutes \?\? r\.minutes/.test(autoTs));
check('INSERT 에 total_minutes 가 들어간다', /INSERT INTO teacher_payroll_auto[\s\S]*total_minutes/.test(autoTs));
check('🔴 안 보내면 지금 값을 지우지 않는다 (COALESCE)',
  /total_minutes=COALESCE\(excluded\.total_minutes, teacher_payroll_auto\.total_minutes\)/.test(autoTs));
check('0·빈값은 NULL 로 (0분 지급 방지)', /!\(Number\(mins\) > 0\)[\s\S]{0,40}\? null/.test(autoTs));

console.log('\n════════ 채워야 할 강사 표시(C안) ════════');
check('긴 수업 강사 명단을 뽑는 함수가 있다', /async function longClassTeacherIds/.test(adminTs));
check('급여 목록이 has_long_class 를 붙여 내려준다', /has_long_class = longIds\.has/.test(adminTs));
/* ⚠️ 이 세 가지를 빼면 «전원 경고» 가 되어 아무도 안 본다 — 실측 근거는 함수 주석 참고 */
check('🔴 «근무 불가(blocked)» 블록을 수업으로 세지 않는다', /NOT IN \('blocked', 'level_test'\)/.test(adminTs));
check('🔴 옛 LMS 일괄 입력(60분)을 세지 않는다', /NOT LIKE 'lms_import%'/.test(adminTs));
check('🔴 유형 시드 자료를 세지 않는다', /NOT LIKE 'type_seed%'/.test(adminTs));
check('teacher_id 가 TEXT 라 CAST 로 맞춘다', /CAST\(teacher_id AS INTEGER\)/.test(adminTs));

console.log('\n════════ 화면 ════════');
check('길이가 없는데 긴 수업이 있으면 «입력 필요» 를 띄운다', /has_long_class[\s\S]{0,400}입력 필요/.test(core));
check('카페24가 보낸 값에는 «자동» 을 붙인다', /length_source === 'ingest'[\s\S]{0,200}자동/.test(core));
check('adm-core 버전이 103 이상', (() => {
  const m = readFileSync(join(PUB, 'admin.html'), 'utf8').match(/adm-core\.js\?v=(\d+)/);
  return m && Number(m[1]) >= 103;
})());

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fails.length}`);
if (fails.length) { console.log('  실패 항목:'); fails.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(fails.length ? 1 : 0);
