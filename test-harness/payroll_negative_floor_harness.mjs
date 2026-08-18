/**
 * payroll_negative_floor_harness.mjs
 * ── 「단가 없는 강사에게 공제만 붙어 실지급이 마이너스」 회귀 감시 (2026-08-18) ──
 *
 * 실제로 화면에 나온 사고다: 중국어 강선생님 — 등급 미지정 → 단가 ₱0 → 수업료 ₱0,
 * 그런데 피드백 미작성 14건 × ₱25 = -₱350 공제는 그대로 붙어 «실지급 ₱-350»,
 * 머리글 합계도 «실지급 ₱-325» 로 표시됐다(2026-08-18 사장님 캡처).
 * 수업별 순지급(net_amount)은 이미 0 하한이었는데 월 합계 두 곳만 하한이 없었다.
 *
 * 검사 방식: api-admin.ts 원문에서 해당 집계식을 찾아 «실제로 실행» 한다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminTs = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'src', 'api-admin.ts'), 'utf8');
const q3 = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'public', 'js', 'adm-q3.js'), 'utf8');
const adminHtml = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'public', 'admin.html'), 'utf8');

let pass = 0; const fails = [];
const check = (m, c) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };

console.log('\n════════ 급여 월 합계 0 하한 ════════');

/* ① 강사별 집계(agg) — 식을 원문에서 뽑아 실행 */
{
  const m = adminTs.match(/agg\.final_amount = ([^;]+);/);
  check('강사별 집계식을 찾았다', !!m);
  if (m) {
    const f = new Function('agg', 'return ' + m[1] + ';');
    check('수업료 0 + 공제 350 → 실지급 0 (마이너스 금지)', f({ pay_amount: 0, deduction_total: 350 }) === 0);
    check('수업료 500 + 공제 350 → 실지급 150 (정상 차감은 그대로)', f({ pay_amount: 500, deduction_total: 350 }) === 150);
  }
}

/* ② 상세(summary) — 목록과 같은 규칙이어야 두 화면이 안 어긋난다 */
{
  const m = adminTs.match(/sum\.final_amount = ([^;]+);/);
  check('상세 합계식을 찾았다', !!m);
  if (m) {
    const f = new Function('sum', 'return ' + m[1] + ';');
    check('상세도 마이너스 금지 (0-350 → 0)', f({ pay_amount: 0, deduction_total: 350 }) === 0);
    check('상세도 정상 차감 유지 (500-350 → 150)', f({ pay_amount: 500, deduction_total: 350 }) === 150);
  }
}

console.log('\n════════ 단가 미지정 표시 ════════');
check('서버가 rate_missing 을 내려준다', /rate_missing: rateMissing/.test(adminTs));
check('rateMissing 판정은 rate20 기준', /const rateMissing = !\(rate20 > 0\)/.test(adminTs));
check('화면: 단가 없음+수업 있음이면 «단가 미지정» 표시(0원으로 보이지 않게)',
  /rate_missing && \(r\.lesson_count\|\|0\) > 0/.test(q3) && /단가 미지정/.test(q3));
check('화면: 수업 0회 강사는 조용히 둔다 (전원 경고 방지 — lesson_count 조건)',
  (q3.match(/rate_missing && \(r\.lesson_count\|\|0\) > 0/g) || []).length >= 2);
check('adm-q3 ?v= 5 이상', (() => { const m = adminHtml.match(/adm-q3\.js\?v=(\d+)/); return m && Number(m[1]) >= 5; })());

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fails.length}`);
if (fails.length) fails.forEach(f => console.log('   · ' + f));
console.log('─────────────────────────────────────────────');
process.exit(fails.length ? 1 : 0);
