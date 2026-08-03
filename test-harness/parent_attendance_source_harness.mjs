// parent_attendance_source_harness.mjs — 학부모 마이페이지 출석 '원천 통일' 회귀 가드 (2026-07-31)
// ─────────────────────────────────────────────────────────────────────────────
//  고친 버그: 마이페이지(api-students.ts)는 출석을 point_rule_log(포인트 적립 로그)에서 읽었는데,
//  이건 프론트가 /api/points/earn-by-rule 을 따로 호출해야만 쌓여 실제 화상수업 입장 기록
//  (attendance 테이블)과 어긋났다 → 마이페이지와 월간 리포트의 출석 일수가 달랐다.
//  또 on_time 을 별도 rule_code 로 세어 attDays 의 부분집합이 아니었고 → on_time_rate 가 100% 초과 가능.
//  수정: attendance 테이블 하나로 통일(월간 리포트 buildMonthlyReportData 와 동일 원천),
//        on_time_days = status='attended' 행 → 항상 attDays ⊆, rate ≤ 100%.
//  이 하니스는 (1)집계 불변식과 (2)원천 계약을 못 박아, point_rule_log 로 되돌리거나
//  단위/상태값이 깨지면 배포 게이트에서 잡는다.
//  실행: node test-harness/parent_attendance_source_harness.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const readOr = (rel) => { try { return readFileSync(path(rel), 'utf8'); } catch { return null; } };

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) pass++;
  else { fail++; console.log('  X ' + name + (got !== undefined ? '  -> ' + JSON.stringify(got) : '')); }
};

// ── 1) 집계 불변식 — api-students.ts 의 리듀서를 그대로 옮겨 검증 ──
//    (attendance 테이블 행 → attDays / onTimeDays / on_time_rate)
function aggregate(rows) {
  const attDays = new Set(), onTimeDays = new Set();
  (rows || []).forEach((r) => {
    if (!r.date) return;              // date IS NOT NULL 가드
    attDays.add(r.date);
    if (r.status === 'attended') onTimeDays.add(r.date);   // 정시=수업시간 내 입장
  });
  return {
    last_30d_days: attDays.size,
    on_time_days: onTimeDays.size,
    on_time_rate: attDays.size ? Math.round((onTimeDays.size / attDays.size) * 100) : 0,
    days: Array.from(attDays).sort(),
  };
}
{
  // 같은 날 여러 수업(중복 date)·present/attended 혼재·null date 섞기
  const rows = [
    { date: '2026-07-10', status: 'attended' },
    { date: '2026-07-10', status: 'present' },   // 같은 날 재입장 — 중복 제거돼야
    { date: '2026-07-11', status: 'present' },    // 지각/시간 밖 = 출석은 맞지만 정시 아님
    { date: '2026-07-12', status: 'attended' },
    { date: null,          status: 'attended' },  // date 없는 행 = 무시
  ];
  const a = aggregate(rows);
  ok('출석일 = 서로 다른 날짜 수(중복·null 제외)', a.last_30d_days === 3, a);
  ok('정시일 = attended 서로 다른 날짜 수', a.on_time_days === 2, a);
  ok('on_time_rate = round(2/3*100) = 67', a.on_time_rate === 67, a);
  ok('🔴 on_time_days 는 항상 att_days 의 부분집합', a.on_time_days <= a.last_30d_days);
  ok('🔴 on_time_rate 는 100% 를 넘지 않는다', a.on_time_rate <= 100, a.on_time_rate);
  ok('days 는 YYYY-MM-DD 오름차순', JSON.stringify(a.days) === JSON.stringify(['2026-07-10','2026-07-11','2026-07-12']), a.days);
}
{
  // 전원 정시 → 100% (초과 아님), 출석 0 → 0% (0 나눗셈 가드)
  ok('전원 attended → 정확히 100%', aggregate([{date:'2026-07-01',status:'attended'}]).on_time_rate === 100);
  ok('출석 0건 → rate 0(NaN 아님)', aggregate([]).on_time_rate === 0);
  ok('present 만 → 정시 0', aggregate([{date:'2026-07-01',status:'present'}]).on_time_days === 0);
}

// ── 2) 원천 계약 — api-students.ts 가 attendance 테이블로 읽고, point_rule_log 로 안 돌아갔는가 ──
const students = readOr('../cloudflare-deploy/src/api-students.ts');
ok('api-students.ts 존재', students !== null);
if (students) {
  ok('마이페이지 출석을 attendance 테이블에서 읽음(joined_at 필터)',
     /FROM attendance WHERE user_id = \? AND joined_at >= \?/.test(students));
  ok('정시 판정 = status===\'attended\'', /r\.status === 'attended'/.test(students));
  ok('on_time_rate = onTimeDays/attDays', /onTimeDays\.size \/ attDays\.size/.test(students));
  ok('🔴 옛 버그 패턴(point_rule_log on_time 리더) 미복귀',
     !/rule_code === 'on_time'/.test(students) && !/rule_code === 'attendance'/.test(students),
     'point_rule_log 로 되돌아갔다');
}

// ── 3) 쓰기측 정합 — api-mango.ts 가 수업시간 내 입장을 status='attended' 로 쓰는가 ──
//    (리더의 'attended' 필터가 실제 생산자를 가져야 정시 집계가 0으로 죽지 않는다)
const mango = readOr('../cloudflare-deploy/src/api-mango.ts');
ok('api-mango.ts 존재', mango !== null);
if (mango) {
  ok("checkin 이 withinClass 를 'attended' 로 기록", /withinClass \? 'attended' : 'present'/.test(mango));
  ok('attendance.joined_at 는 ms(Date.now) — 리더의 joined_at>=ms 필터와 단위 일치',
     /INSERT INTO attendance[\s\S]{0,400}joined_at/.test(mango) && /const now = Date\.now\(\)/.test(mango));
}

// ── 4) 월간 리포트와 '동일 원천' 인가(파리티) — buildMonthlyReportData 도 attendance+distinct date ──
const reports = readOr('../cloudflare-deploy/src/api-reports.ts');
ok('api-reports.ts 존재', reports !== null);
if (reports) {
  ok('월간 리포트도 attendance 테이블에서 DISTINCT date 로 집계(같은 원천)',
     /COUNT\(DISTINCT date\) AS d FROM attendance WHERE user_id = \? AND joined_at >= \?/.test(reports));
}

console.log(`\nparent attendance source: ${pass}/${pass + fail} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
