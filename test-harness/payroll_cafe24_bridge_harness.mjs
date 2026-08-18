/**
 * payroll_cafe24_bridge_harness.mjs
 * ── 「카페24 급여를 이름으로 잇는다」 회귀 감시 (2026-08-18) ──
 *
 * 왜 이 하니스가 있나 — 실측으로 드러난 함정이다.
 *   teacher_payroll_auto.teacher_id 는 **카페24 MySQL 번호**(9~196)이고,
 *   D1 의 teachers.id(1~29)·teacher_profiles.id(4~37) 와 다른 번호 체계다.
 *   겹치는 구간에서 서로 다른 사람을 가리킨다(2026-08-18 운영 DB 실측):
 *       카페24 9  =「테스트 강사」 · teachers 9  = ZEE      · profiles 9  = Teacher Hannah
 *       카페24 24 = Teacher Mariane · teachers 24 = HANNAH  · profiles 24 = Teacher JP
 *       카페24 26 = Teacher Rica    · teachers 26 = MELCA   · profiles 26 = Teacher Janice
 *   번호로 이으면 «남의 급여» 가 나간다. 실제로 2026-08-18 오전에 번호로 이어 두었다가
 *   같은 날 바로잡았다(그때는 total_minutes 가 전부 NULL 이라 결과가 없어 사고는 없었다).
 *
 * 실행: node test-harness/payroll_cafe24_bridge_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminTs   = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'src', 'api-admin.ts'), 'utf8');
const q3        = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'public', 'js', 'adm-q3.js'), 'utf8');
const adminHtml = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'public', 'admin.html'), 'utf8');

let pass = 0; const fails = [];
const check = (m, c) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };

console.log('\n════════ ⛔ 번호로 잇지 않는다 ════════');
/* 이 하니스의 알맹이 — 카페24 표를 우리 번호로 조회하는 코드가 다시 들어오면 FAIL. */
const badJoin = /teacher_payroll_auto[\s\S]{0,200}?WHERE\s+teacher_id\s*=\s*\?/i.test(adminTs);
check('🔴 teacher_payroll_auto 를 teacher_id 로 조회하지 않는다 (남의 급여 방지)', !badJoin);
check('이름 기준 다리(loadCafe24PayrollMonth)가 있다', /async function loadCafe24PayrollMonth/.test(adminTs));
check('급여 계산(calcPayrollOne)이 이름으로 찾는다', /const c24 = await loadCafe24PayrollMonth\(env, year, month\);[\s\S]{0,120}c24\.find\(t\.name\)/.test(adminTs));

console.log('\n════════ 이름 정규화 규칙 ════════');
{
  const m = adminTs.match(/function normTeacherName\(v: any\): string \{\s*return ([^;]+);/);
  check('normTeacherName 을 소스에서 뽑았다', !!m);
  if (m) {
    const f = new Function('v', 'return ' + m[1].replace(/String\(v \?\? ''\)/, "String(v ?? '')") + ';');
    check('대소문자·공백 무시 («  FAYE » → «faye»)', f('  FAYE ') === 'faye');
    check('«Teacher » 접두사를 뗀다 (카페24 «Teacher Faye» ↔ 명부 «FAYE»)', f('Teacher Faye') === f('FAYE'));
    check('가운데 공백이 여러 개여도 같게 본다', f('Teacher   Jane') === f('teacher jane'));
    check('한글 이름은 그대로 («중국어 강선생님»)', f('중국어 강선생님') === '중국어 강선생님');
    check('🔴 서로 다른 사람을 같게 보지 않는다 (jane ≠ janice)', f('Teacher Jane') !== f('Teacher Janice'));
  }
}
check('같은 이름이 둘이면 잇지 않는다 (애매하면 포기)', /for \(const k of dupe\) delete byName\[k\]/.test(adminTs));

console.log('\n════════ 보충 규칙 ════════');
check('D1 계산이 0회일 때만 카페24 값으로 채운다', /a\.lesson_count === 0 && Number\(cf\.completed_classes\) > 0/.test(adminTs));
check('🔴 카페24로 채운 줄에는 공제를 붙이지 않는다', /const rowDeduct\s*=\s*useC24 \? 0 :/.test(adminTs));
check('합계도 채운 값 기준으로 더한다 (머리글과 표가 어긋나지 않게)',
  /totalAmount \+= rowAmount;[\s\S]{0,120}totalFinal \+= rowFinal;/.test(adminTs));
check('분을 아직 안 보내면 «완료 수업 × 20분» 으로 환산해 보여 준다',
  /Number\(cf\.completed_classes \|\| 0\) \* DEFAULT_CLASS_MINUTES/.test(adminTs));
check('그 환산값임을 c24_minutes_real 로 구분한다', /c24_minutes_real:/.test(adminTs));
check('카페24 줄에는 «단가 미지정» 경고를 띄우지 않는다', /rate_missing: rateMissing && !useC24/.test(adminTs));
check('못 이은 강사 명단을 함께 내려준다', /c24_unmatched: _prOwn \? \[\] : c24\.unmatched\(\)/.test(adminTs));
/* 🔴 강사 로그인에게 남의 급여(pay_php)가 새지 않는지 — 화면 감추기만으로는 부족하다.
   본인 뷰에서는 루프가 남을 건너뛰어 matched 가 자기 하나뿐이라, 서버가 안 자르면
   unmatched() 가 나머지 전원의 이름·완료수업·pay_php 를 통째로 실어 보낸다. */
check('🔴 강사 본인 뷰에는 못 이은 명단을 주지 않는다 (남의 pay_php 유출 차단)',
  /c24_unmatched: _prOwn \? \[\]/.test(adminTs));
check('unmatched() 에 pay_php 가 들어 있다 (그래서 위 차단이 필요하다는 근거)',
  /unmatched\(\)[\s\S]{0,400}pay_php: byName\[k\]\.pay_php/.test(adminTs));

console.log('\n════════ 화면 ════════');
check('카페24에서 온 줄에 배지를 붙인다', /amount_source !== 'cafe24'/.test(q3) && /카페24/.test(q3));
check('못 이은 강사가 있으면 관리자에게 한 줄 알린다', /c24_unmatched[\s\S]{0,900}못 이은/.test(q3));
check('그 알림은 강사 본인 뷰에는 안 띄운다', /!_prTeacherView && _un\.length/.test(q3));
check('adm-q3 ?v= 6 이상', (() => { const m = adminHtml.match(/adm-q3\.js\?v=(\d+)/); return m && Number(m[1]) >= 6; })());

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fails.length}`);
if (fails.length) fails.forEach(f => console.log('   · ' + f));
console.log('─────────────────────────────────────────────');
process.exit(fails.length ? 1 : 0);
