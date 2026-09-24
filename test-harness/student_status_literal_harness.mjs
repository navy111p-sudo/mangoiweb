// ════════════════════════════════════════════════════════════════════════════
// student_status_literal_harness.mjs — `status='정상'` 하나로 화면이 통째로 0이 되는 사고
//
// 왜 이 하니스가 있나 (2026-08-09):
//   students_erp.status 의 실제 값은 **`active` / `inactive` 두 가지뿐**이다.
//   카페24 동기화(cafe24-sync.ts)가 영어로 적재한다. `'정상'` 은 옛 수기 입력 시절 값이고
//   지금 운영 DB 에 **0건**이다.
//
//   그런데 `exec-summary.ts` 가 그 값으로 학생을 세고 있었다 →
//     경영 대시보드(/admin/exec)의 **재원생·신규·누적·일별 상세가 전부 0**.
//     사장님이 「이상하게 나와」라고 화면을 보내 주셔서 발견했다.
//
//   🔴 반대 방향이 더 위험하다: `status<>'정상'` 은 **전 학생 29,391명에 걸린다.**
//      「이번달 탈락」이 그렇게 돼 있었다. end_date 조건 덕에 우연히 0으로 보였을 뿐,
//      재원 학생 한 명이 이번달 종료일을 받는 순간 재원 전체가 탈락으로 세어진다.
//
//   없는 값과 비교하면 «아무도 안 맞거나 모두가 맞거나» 둘 중 하나다. 둘 다 조용히 틀린다.
//   그래서 소스에서 막는다. 소스가 곧 사양이다.
//
//   ✅ 허용: 'active' 를 **함께** 포함한 IN 목록  (예: IN ('정상','활동','active'))
//   ❌ 금지: '정상' 단독 비교(= 또는 <>), 'active' 없는 IN 목록
//   (INSERT 기본값·CREATE TABLE DEFAULT 는 새로 쓰는 값이라 검사 대상이 아니다)
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');

/* 🚧 «알고 있으나 아직 안 고친 곳» — 고치는 순간 **바깥으로 나가는 동작**이 켜지는 자리다.
 *    사장님 결정 전까지 켜지 않는다. 목록에 있는 만큼만 봐주고, **새로 생기면 실패**한다(래칫).
 *
 *    api-reports.ts — 월간 리포트 배치 `runMonthlyReports()` (index.ts 크론이 매월 호출).
 *      지금 이 쿼리는 대상 **0명**을 고른다 → 배치가 아무 일도 안 하고 끝난다.
 *      고치면 최대 1,000명분 `monthly_reports` 행이 생긴다.
 *      ✅ 문자·알림톡이 곧바로 나가지는 않는다 — `sendMonthlyReportKakao()` 가
 *         `approval_status !== 'approved'` 면 발송을 막는다(실제 코드 확인함).
 *      그래도 «학부모에게 나가는 경로» 라 내 판단으로 켜지 않는다.
 */
const KNOWN_UNFIXED = new Map([
  ['api-reports.ts:534', '월간 리포트 배치 — 켜면 학부모 발송 경로가 살아난다(승인 게이트는 있음). 사장님 결정 대기'],
  // ⚠️ 2026-09-21 — 이 목록은 «줄 번호» 가 열쇠라, 그 파일에 import 한 줄만 늘어도 밀려
  //    «이미 고쳤다» 는 거짓 FAIL 이 난다(그날 실제로 508 → 509). 코드 지문으로 바꾸는 것이
  //    맞지만 그 재설계는 별건이라, 여기를 고칠 때는 파일을 열어 그 줄이 맞는지 눈으로 볼 것.
]);

let pass = 0, fail = 0;
const bad = [];
const known = [];

const files = readdirSync(SRC).filter(f => f.endsWith('.ts'));
for (const f of files) {
  const text = readFileSync(join(SRC, f), 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    // 주석 줄은 건너뛴다 — 이 사고를 설명하는 경고 주석이 여러 파일에 있다.
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    if (!/status/.test(line) || !/'정상'/.test(line)) return;
    // INSERT / CREATE TABLE DEFAULT 는 «쓰는 쪽» — 읽기 조건이 아니라 검사 대상 아님
    if (/INSERT\s+INTO|CREATE\s+TABLE|DEFAULT\s+'정상'/i.test(line)) return;

    const hasActive = /'active'/.test(line);
    const soloEq = /status\s*(=|<>|!=)\s*'정상'/.test(line);
    const where = `${f}:${i + 1}`;
    let why = null;
    if (soloEq && !hasActive) why = "«'정상' 단독 비교» — 운영 DB 에 0건이라 조건이 항상 빗나간다";
    else if (/status[^)]{0,40}\bIN\s*\(/i.test(line) && !hasActive) why = "«IN 목록에 'active' 가 없다» — 실제 값이 안 들어 있다";
    if (!why) return;
    if (KNOWN_UNFIXED.has(where)) known.push(`${where}  ${KNOWN_UNFIXED.get(where)}`);
    else bad.push(`${where}  ${why}\n        ${t.slice(0, 130)}`);
  });
}

console.log('① students_erp.status 를 «없는 값» 과 비교하는 곳이 없어야 한다');
if (bad.length === 0) { console.log('  ✅ 새로 생긴 위험한 status 비교 0건'); pass++; }
else { bad.forEach(b => console.log('  ❌ ' + b)); fail += bad.length; }
// 🚧 알고 있는 미수정 자리는 «조용히» 넘기지 않는다 — 매번 눈에 보이게 찍는다.
if (known.length) {
  console.log('  🚧 알고 있으나 아직 안 고친 곳 (사장님 결정 대기):');
  known.forEach(k => console.log('     · ' + k));
}
// 목록에 적어 놓고 이미 고친 자리는 목록에서 빼야 한다(썩은 예외가 남지 않게).
const stale = [...KNOWN_UNFIXED.keys()].filter(k => !known.includes(...[known.find(x => x.startsWith(k))].filter(Boolean)) && !known.some(x => x.startsWith(k)));
if (stale.length === 0) { console.log('  ✅ 예외 목록에 «이미 고친 자리» 가 남아 있지 않다'); pass++; }
else { console.log('  ❌ 예외 목록이 낡았다(이미 고쳐졌다) — 지우세요: ' + stale.join(', ')); fail++; }

// ── 고친 파일이 다시 돌아가지 않도록 못박는다 ────────────────────────────────
const exec = readFileSync(join(SRC, 'exec-summary.ts'), 'utf8');
const check = (label, cond, detail) => {
  if (cond) { console.log('  ✅ ' + label); pass++; }
  else { console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); fail++; }
};

console.log('\n② 경영 대시보드는 판정 함수 한 곳만 쓴다');
check('activeCond() 가 있다', /function activeCond\(/.test(exec));
check("activeCond() 가 'active' 를 포함한다", /activeCond[\s\S]{0,220}'active'/.test(exec));
check('inactiveCond() 는 activeCond 의 부정이다 (별도로 짜지 않는다)',
      /function inactiveCond\([\s\S]{0,120}NOT \$\{activeCond/.test(exec));

console.log('\n③ «재원» 은 status 만으로 정하지 않는다 — 종료일도 본다');
check('enrolledCond() 가 있다', /function enrolledCond\(/.test(exec));
check('enrolledCond() 가 end_date 를 본다', /enrolledCond[\s\S]{0,260}end_date/.test(exec));
check('재원 총계(activeTotal)가 enrolledCond 를 쓴다',
      /async function activeTotal[\s\S]{0,400}\$\{enrolledCond\(\)\}/.test(exec),
      'status 만 보면 28,665명, 종료일까지 보면 7,667명 — 관리자 첫 화면과 숫자가 갈린다');

console.log('\n④ 비용이 «0» 인 것과 «안 적힌» 것을 구분한다');
check('서버가 expense_recorded 를 내보낸다', /expense_recorded:/.test(exec));
check('서버가 이유를 한 줄로 준다(expense_note)', /expense_note:/.test(exec));
const execHtml = readFileSync(join(__dir, '..', 'cloudflare-deploy', 'public', 'admin', 'exec.html'), 'utf8');
check('화면이 비용 미입력이면 순익 선을 그리지 않는다',
      /expense_recorded === false/.test(execHtml) && /if \(!noCost\)/.test(execHtml),
      '비용 0 → 순익=매출 → 「번 돈이 전부 남는다」로 읽힌다');

console.log('\n⑤ 대리점 그래프는 «매출 있는 곳» 만, 뺀 개수를 밝힌다');
check('매출 0원 대리점을 그래프에서 거른다', /rev_month\|\|0\) > 0|\(x\.rev_month\|\|0\)\s*>\s*0/.test(execHtml));
check('상위 N 으로 자른다', /slice\(0,\s*15\)/.test(execHtml));
check('뺀 개수를 화면에 적는다(조용한 잘라내기 금지)', /branchChartNote/.test(execHtml));

console.log('\n' + '─'.repeat(58));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log("❌ status 비교/경영 대시보드 계약이 깨졌습니다 — 위 주석의 «0이 되거나 전부가 되거나» 를 읽으세요."); process.exit(1); }
console.log('🎉 통과 — 없는 값과 비교하지 않고, 모르는 것을 0으로 그리지 않는다.');
