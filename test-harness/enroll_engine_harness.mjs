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

const names = ['enrollQuoteCalc', 'enrollTimeToMin', 'enrollOverlap', 'enrollDates', 'enrollRefundCalc', 'kstToday', 'addDays', 'daysBetween'];
let code = '';
for (const n of names) {
  const m = src.match(new RegExp(`export function ${n}[\\s\\S]*?\\n}`));
  if (!m) { console.error(`FAIL extract ${n}`); process.exit(1); }
  code += m[0]
    .replace(/^export /, '')
    .replace(/\(([^)]*)\)(: [A-Za-z[\]{};: |<>]+)? \{/, (s, args) => `(${args.replace(/\?/g, '').replace(/: [A-Za-z[\]<>| .']+(?=[,)=])/g, '').replace(/: [A-Za-z[\]<>| .']+$/g, '')}) {`)
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

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — pass ${pass} / fail ${fail}`);
process.exit(fail === 0 ? 0 : 1);
