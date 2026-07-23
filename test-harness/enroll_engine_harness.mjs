/**
 * 💳 수강신청(enroll) 엔진 하니스 — api-pay.ts 원문에서 순수 함수를 추출해 실행 검증.
 *   대상: enrollQuoteCalc(가격) · enrollTimeToMin · enrollOverlap(중복) · enrollDates(회차 날짜)
 *   근거: 결제규칙_정리본_2026-07-22 + 확인질문 5답(장지웅 부장) — 특히 "30,000×6개월×95%=171,000" 실례 검증.
 *   실행: node test-harness/enroll_engine_harness.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'cloudflare-deploy', 'src', 'api-pay.ts'), 'utf8');

// export function 4개를 원문에서 추출 (타입 표기 제거 후 eval)
const names = ['enrollQuoteCalc', 'enrollTimeToMin', 'enrollOverlap', 'enrollDates'];
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

// ── 가격 (규칙: 단가×주횟수×개월×할인×길이, 10원 절사) ──
let q = fns.enrollQuoteCalc(60000, 1, 1, 20);
eq('가격: 주1회 1개월 기본가', [q.sessions, q.amount, q.perSession], [4, 60000, 15000]);
q = fns.enrollQuoteCalc(60000, 2, 3, 20);
eq('가격: 주2회 3개월 (할인 없음)', [q.sessions, q.amount], [24, 360000]);
q = fns.enrollQuoteCalc(30000, 1, 6, 20);
eq('가격: 부장님 확인 실례 30,000×6개월×95%=171,000', [q.sessions, q.discountRate, q.amount], [24, 0.95, 171000]);
q = fns.enrollQuoteCalc(60000, 2, 12, 20);
eq('가격: 주2회 12개월 10% 할인', [q.sessions, q.amount], [96, 1296000]);
q = fns.enrollQuoteCalc(60000, 1, 1, 40);
eq('가격: 40분 수업 = 2배', q.amount, 120000);
q = fns.enrollQuoteCalc(33333, 1, 1, 20);
eq('가격: 10원 단위 절사', q.amount, 33330);
q = fns.enrollQuoteCalc(60000, 5, 1, 20);
eq('가격: 주5회(월20회)', [q.sessions, q.amount], [20, 300000]);

// ── 시간 파서 ──
eq('시간: 08:00 → 480', fns.enrollTimeToMin('08:00'), 480);
eq('시간: 23:40 → 1420', fns.enrollTimeToMin('23:40'), 1420);
eq('시간: 형식오류 → -1', fns.enrollTimeToMin('8:00'), -1);
eq('시간: 쓰레기 → -1', fns.enrollTimeToMin('abc'), -1);

// ── 중복(겹침) 판정 ──
eq('겹침: 16:00(20) vs 16:10(20) = 겹침', fns.enrollOverlap(960, 20, 970, 20), true);
eq('겹침: 16:00(20) vs 16:20(20) = 안겹침', fns.enrollOverlap(960, 20, 980, 20), false);
eq('겹침: 16:00(40) vs 16:30(20) = 겹침', fns.enrollOverlap(960, 40, 990, 20), true);
eq('겹침: 16:30(20) vs 16:00(40) = 겹침(대칭)', fns.enrollOverlap(990, 20, 960, 40), true);

// ── 회차 날짜 생성 (2026-07-27 = 월요일) ──
let d = fns.enrollDates('2026-07-27', [1, 3], 8);
eq('날짜: 월수 8회 시작일 포함', [d[0], d[1], d.length, d[7]], ['2026-07-27', '2026-07-29', 8, '2026-08-19']);
d = fns.enrollDates('2026-07-28', [1, 3], 4);
eq('날짜: 시작일이 비선택 요일이면 다음 해당 요일부터', d[0], '2026-07-29');
d = fns.enrollDates('2026-07-27', [1, 3], 8, new Set(['2026-07-29']));
eq('날짜: 막힌 날(공휴일/충돌)은 건너뛰고 뒤로 밀림 — 회차 수 보존', [d.length, d[1], d[7]], [8, '2026-08-03', '2026-08-24']);
d = fns.enrollDates('2026-07-27', [0, 1, 2, 3, 4], 20);
eq('날짜: 주5회 20회(1개월) 생성', [d.length, d[0], d[19]], [20, '2026-07-27', '2026-08-23']);
d = fns.enrollDates('bad-date', [1], 4);
eq('날짜: 잘못된 시작일 → 빈 배열', d.length, 0);

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — pass ${pass} / fail ${fail}`);
process.exit(fail === 0 ? 0 : 1);
