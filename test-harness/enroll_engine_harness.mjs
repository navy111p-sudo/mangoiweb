/**
 * 💳 수강신청(enroll) 엔진 하니스 — src/enroll-ops.ts 원문에서 순수 함수를 추출해 실행 검증.
 *   1단계: enrollQuoteCalc(가격) · enrollTimeToMin · enrollOverlap(중복) · enrollDates(회차 날짜)
 *   2~4단계: kstToday/addDays/daysBetween(만료·종료 판정) · enrollRefundCalc(환불)
 *   근거: 결제규칙_정리본_2026-07-22 + 확인질문 5답(장지웅 부장).
 *   실행: node test-harness/enroll_engine_harness.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'cloudflare-deploy', 'src', 'enroll-ops.ts'), 'utf8');

const names = ['enrollQuoteCalc', 'enrollTimeToMin', 'enrollOverlap', 'enrollDates', 'enrollRefundCalc', 'kstToday', 'addDays', 'daysBetween', 'isValidWeekly', 'inferWeeklyDays', 'enrollParse'];
// 상수도 원문에서 가져온다(값이 바뀌면 테스트도 같이 따라가게).
//   enrollParse 가 ENROLL_MONTHS·ENROLL_TIME_MIN/MAX 를 참조하므로 함께 끌어온다.
let code = '';
// ENROLL_TIME_MIN/MAX 는 export 가 아닌 모듈 로컬 상수라 'export ' 를 선택적으로 매칭한다.
for (const cn of ['ENROLL_WEEKLY', 'ENROLL_MONTHS', 'ENROLL_TIME_MIN', 'ENROLL_TIME_MAX']) {
  const cm = src.match(new RegExp(`(?:export )?const ${cn} =[^;]*;`));
  if (!cm) { console.error(`FAIL extract ${cn}`); process.exit(1); }
  code += cm[0].replace(/^export /, '') + '\n';
}

for (const n of names) {
  // 한 줄 함수 먼저(예: isValidWeekly) → 없으면 여러 줄 함수. 순서를 바꾸면 한 줄 함수가
  // 다음 함수까지 통째로 삼켜서 'export' 가 남고 문법 오류가 난다.
  let m = src.match(new RegExp(`export function ${n}\\([^\\n]*\\{[^\\n]*\\}`))
       || src.match(new RegExp(`export function ${n}[\\s\\S]*?\\n}`));
  if (!m) { console.error(`FAIL extract ${n}`); process.exit(1); }
  code += m[0]
    .replace(/^export /, '')
    .replace(/\(([^)]*)\)(: [A-Za-z[\]{};: |<>]+)? \{/, (s, args) => `(${args.replace(/\?/g, '').replace(/: [A-Za-z[\]<>| .']+(?=[,)=])/g, '').replace(/: [A-Za-z[\]<>| .']+$/g, '')}) {`)
    // 본문 안의 인라인 타입도 제거: 화살표 단일 인자 타입(x: any) + as 캐스트(as number[]) — enrollParse 대응
    .replace(/\(([a-zA-Z_$][\w$]*): [A-Za-z][\w<>[\]| .]*\)/g, '($1)')
    .replace(/ as [A-Za-z][\w<>[\]| ]*/g, '')
    .replace(/: (number|string|boolean)\[\]/g, '')
    .replace(/: (number|string|boolean)\b/g, '')
    .replace(/\??: Set<string>/g, '')
    + '\n';
}
const fns = new Function(code + `; return { ${names.join(', ')} };`)();

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
}

console.log('── 1단계: 가격 ──');
let q = fns.enrollQuoteCalc(60000, 1, 1, 20);
eq('주1회 1개월 기본가', [q.sessions, q.amount, q.perSession], [4, 60000, 15000]);
q = fns.enrollQuoteCalc(60000, 2, 3, 20);
eq('주2회 3개월 (할인 없음)', [q.sessions, q.amount], [24, 360000]);
q = fns.enrollQuoteCalc(30000, 1, 6, 20);
eq('부장님 확인 실례 30,000×6개월×95%=171,000', [q.sessions, q.discountRate, q.amount], [24, 0.95, 171000]);
q = fns.enrollQuoteCalc(60000, 2, 12, 20);
eq('주2회 12개월 10% 할인', [q.sessions, q.amount], [96, 1296000]);
eq('40분 수업 = 2배', fns.enrollQuoteCalc(60000, 1, 1, 40).amount, 120000);
eq('10원 단위 절사', fns.enrollQuoteCalc(33333, 1, 1, 20).amount, 33330);
eq('주5회(월20회)', [fns.enrollQuoteCalc(60000, 5, 1, 20).sessions, fns.enrollQuoteCalc(60000, 5, 1, 20).amount], [20, 300000]);
eq('강사 가산 120% (정책 확정 시)', fns.enrollQuoteCalc(60000, 1, 1, 20, 1.2).amount, 72000);
eq('강사 가산 기본 100% = 변화 없음', fns.enrollQuoteCalc(60000, 2, 1, 20, 1.0).amount, 120000);

console.log('── 1단계: 시간·중복 ──');
eq('08:00 → 480', fns.enrollTimeToMin('08:00'), 480);
eq('23:40 → 1420', fns.enrollTimeToMin('23:40'), 1420);
eq('형식오류 → -1', fns.enrollTimeToMin('8:00'), -1);
eq('쓰레기 → -1', fns.enrollTimeToMin('abc'), -1);
eq('겹침 16:00(20) vs 16:10(20)', fns.enrollOverlap(960, 20, 970, 20), true);
eq('안겹침 16:00(20) vs 16:20(20)', fns.enrollOverlap(960, 20, 980, 20), false);
eq('겹침 16:00(40) vs 16:30(20)', fns.enrollOverlap(960, 40, 990, 20), true);
eq('겹침 대칭성', fns.enrollOverlap(990, 20, 960, 40), true);

console.log('── 1단계: 회차 날짜 (2026-07-27=월) ──');
let d = fns.enrollDates('2026-07-27', [1, 3], 8);
eq('월수 8회', [d[0], d[1], d.length, d[7]], ['2026-07-27', '2026-07-29', 8, '2026-08-19']);
eq('시작일이 비선택 요일이면 다음 해당 요일부터', fns.enrollDates('2026-07-28', [1, 3], 4)[0], '2026-07-29');
d = fns.enrollDates('2026-07-27', [1, 3], 8, new Set(['2026-07-29']));
eq('막힌 날 건너뛰고 뒤로 밀림 — 회차 보존', [d.length, d[1], d[7]], [8, '2026-08-03', '2026-08-24']);
d = fns.enrollDates('2026-07-27', [0, 1, 2, 3, 4], 20);
eq('주5회 20회', [d.length, d[0], d[19]], [20, '2026-07-27', '2026-08-23']);
eq('잘못된 시작일 → 빈 배열', fns.enrollDates('bad-date', [1], 4).length, 0);

console.log('── 3단계: 공휴일 밀림(확인답변 ⑤ — 종료일이 늦어짐) ──');
const plain = fns.enrollDates('2026-07-27', [1, 3], 8);
const withHol = fns.enrollDates('2026-07-27', [1, 3], 8, new Set(['2026-08-03', '2026-08-05']));
eq('공휴일 2개 → 회차는 그대로 8회', withHol.length, 8);
eq('공휴일 2개 → 종료일이 1주 늦어짐', [plain[7], withHol[7]], ['2026-08-19', '2026-08-26']);
eq('공휴일 날짜는 목록에서 빠짐', withHol.includes('2026-08-03') || withHol.includes('2026-08-05'), false);

console.log('── 2단계: 날짜 계산(만료·종료 판정) ──');
eq('addDays +7', fns.addDays('2026-07-27', 7), '2026-08-03');
eq('addDays -21 (3주 전)', fns.addDays('2026-07-27', -21), '2026-07-06');
eq('addDays 월말 넘김', fns.addDays('2026-07-31', 1), '2026-08-01');
eq('daysBetween 7일', fns.daysBetween('2026-07-27', '2026-08-03'), 7);
eq('daysBetween 과거는 음수', fns.daysBetween('2026-07-27', '2026-07-20'), -7);
eq('kstToday: UTC 15시 = KST 다음날 0시', fns.kstToday(Date.parse('2026-07-27T15:00:00Z')), '2026-07-28');
eq('kstToday: UTC 14:59 = KST 같은날', fns.kstToday(Date.parse('2026-07-27T14:59:00Z')), '2026-07-27');

console.log('── 4단계: 환불(확인답변 ④ — 할인 취소 후 정가 정산) ──');
// 6개월 주1회: 정가 30,000×6=180,000 / 결제 171,000(5%할인) / 24회
let r = fns.enrollRefundCalc(171000, 24, 0, 180000);
eq('한 번도 안 썼으면 전액', [r.remain, r.refund], [24, 171000]);
r = fns.enrollRefundCalc(171000, 24, 24, 180000);
eq('다 썼으면 0원 (음수 방지)', r.refund, 0);
r = fns.enrollRefundCalc(171000, 24, 8, 180000);
eq('8회 사용: 171,000 − 8×7,500 = 111,000', [r.listPerSession, r.usedValue, r.refund], [7500, 60000, 111000]);
eq('할인 취소 효과: 할인가로 계산했을 때보다 환불이 적다', fns.enrollRefundCalc(171000, 24, 8, 180000).refund < 171000 - 8 * Math.round(171000 / 24), true);
r = fns.enrollRefundCalc(120000, 8, 2, 120000);
eq('부장님 예시(30,000 4회 중 2회 → 절반) 스케일', [r.listPerSession, r.refund], [15000, 90000]);
r = fns.enrollRefundCalc(171000, 24, 99, 180000);
eq('사용 회차가 총 회차보다 커도 0 이하로 안 감', [r.used, r.refund], [24, 0]);

console.log('── 2단계: 연장 시 주 횟수 추정 (실사용 최다 시나리오) ──');
// 주2회(월·수) 학생이 수요일 1건만 남기고 연장하는 상황 = 가장 흔한 연장 시점
const past2 = ['2026-07-13', '2026-07-15', '2026-07-20', '2026-07-22'];  // 월수 과거
eq('🔴버그방지: 남은 1건(수)만 보면 주1회로 오판 → 과거 포함해 주2회로 정정',
   fns.inferWeeklyDays([...past2, '2026-07-29'], ['2026-07-29']), [1, 3]);
eq('미래가 충분하면 그대로 주2회', fns.inferWeeklyDays(['2026-07-27', '2026-07-29'], ['2026-07-27', '2026-07-29']), [1, 3]);
eq('진짜 주1회 학생은 주1회 유지', fns.inferWeeklyDays(['2026-07-13', '2026-07-20', '2026-07-27'], ['2026-07-27']), [1]);
eq('주5회(월~금)', fns.inferWeeklyDays(['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31'], ['2026-07-27']), [1,2,3,4,5]);
eq('🔴요일 변경으로 4일 섞임 + 미래 1건 → 추정 포기(null). 미래로 폴백하면 같은 오판 재발',
   fns.inferWeeklyDays(['2026-07-13','2026-07-15','2026-07-21','2026-07-23','2026-07-29'], ['2026-07-29']), null);
eq('요일 변경했어도 미래가 한 주 이상 뻗어 있으면 새 패턴(화목)으로 인정',
   fns.inferWeeklyDays(['2026-07-13','2026-07-15','2026-07-28','2026-07-30','2026-08-04','2026-08-06'],
                       ['2026-07-28','2026-07-30','2026-08-04','2026-08-06']), [2, 4]);
eq('미래 2건이어도 같은 주 안이면(7일 미만) 추정 포기',
   fns.inferWeeklyDays(['2026-07-13','2026-07-15','2026-07-21','2026-07-23','2026-07-28','2026-07-30'],
                       ['2026-07-28','2026-07-30']), null);
eq('판매 주 횟수 판정: 4회는 상품에 없음', [fns.isValidWeekly(1), fns.isValidWeekly(2), fns.isValidWeekly(4), fns.isValidWeekly(5)], [true, true, false, true]);

console.log('── 1단계: 결제 전 입력 검증(enrollParse — 이상 주문/변조 차단) ──');
// kstToday() 에 의존하므로 시작일은 항상 미래(2099년)로 고정 → 오늘 날짜와 무관하게 안정적.
const good = { weekly: 2, months: 3, minutes: 20, time: '16:00', days: [1, 3], start_date: '2099-01-05', teacher_id: 'T29' };
const parse = (over) => fns.enrollParse({ ...good, ...over });
eq('정상 주문 통과(에러 없음)', parse({}).error, undefined);
eq('정상 주문 필드 정규화', [parse({}).weekly, parse({}).startMin, parse({}).days], [2, 960, [1, 3]]);
eq('상품에 없는 주횟수(4) 거부', parse({ weekly: 4, days: [1, 2, 3, 4] }).error, 'bad_weekly');
eq('상품에 없는 개월(5) 거부', parse({ months: 5 }).error, 'bad_months');
eq('허용 안 된 수업길이(30분) 거부', parse({ minutes: 30 }).error, 'bad_minutes');
eq('10분 단위 아닌 시각 거부', parse({ time: '16:05' }).error, 'bad_time');
eq('형식 틀린 시각 거부', parse({ time: '9:00' }).error, 'bad_time');
eq('요일 수 ≠ 주횟수 거부(변조 방지)', parse({ weekly: 2, days: [1] }).error, 'days_count_mismatch');
eq('요일 중복은 dedup 되어 개수 불일치로 거부', parse({ weekly: 2, days: [1, 1] }).error, 'days_count_mismatch');
eq('시작일 형식 오류 거부', parse({ start_date: '2099-1-5' }).error, 'bad_start_date');
eq('과거 시작일 거부(소급 결제 방지)', parse({ start_date: '2000-01-01' }).error, 'start_date_past');
eq('강사 미지정 거부', parse({ teacher_id: '' }).error, 'teacher_required');
eq('요일 범위(0~6) 밖 값은 걸러져 개수 불일치로 거부', parse({ weekly: 2, days: [1, 9] }).error, 'days_count_mismatch');

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — pass ${pass} / fail ${fail}`);
process.exit(fail === 0 ? 0 : 1);
