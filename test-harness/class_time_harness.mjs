// -*- coding: utf-8 -*-
// 🥭 망고아이 "수업 시간 표시" 로직 테스트 하네스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/class_time_harness.mjs
//   대상:  cloudflare-deploy/public/js/mango-class-time.js 의 순수 함수
//          (formatTime / addMinutes / pickTodaySchedule)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { formatTime, addMinutes, pickTodaySchedule } =
  require(resolve(__dir, '../cloudflare-deploy/public/js/mango-class-time.js'));

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond){
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}
const eq = (name, a, b) => check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));

console.log('\n[ formatTime ]');
eq('HH:MM 유지', formatTime('22:00'), '22:00');
eq('ISO → HH:MM', formatTime('2026-06-23T22:25:00'), '22:25');
eq('HH:MM:SS 자르기', formatTime('09:05:30'), '09:05');
eq('빈 값', formatTime(''), '--:--');
eq('잘못된 값', formatTime('xyz'), '--:--');

console.log('\n[ addMinutes — 종료시간 계산 ]');
eq('22:00 +25', addMinutes('22:00', 25), '22:25');
eq('09:50 +30', addMinutes('09:50', 30), '10:20');
eq('자정 넘김 23:50 +30', addMinutes('23:50', 30), '00:20');
eq('잘못된 입력', addMinutes('bad', 30), '--:--');

console.log('\n[ pickTodaySchedule ]');
const now = new Date('2026-06-23T22:05:00'); // 화요일(tue)
check('오늘 1회성 매칭', pickTodaySchedule([{ scheduled_date:'2026-06-23', start_time:'22:00', duration_min:25 }], now)?.start_time === '22:00');
check('요일 정기수업 매칭(tue)', pickTodaySchedule([{ day_of_week:'tue', start_time:'22:00', duration_min:30 }], now)?.day_of_week === 'tue');
check('현재시각 최근접 선택', pickTodaySchedule([{ day_of_week:'tue', start_time:'10:00' },{ day_of_week:'tue', start_time:'22:00' }], now)?.start_time === '22:00');
check('해당없음 → null', pickTodaySchedule([{ scheduled_date:'2020-01-01', start_time:'10:00' }], now) === null);
check('빈 배열 → null', pickTodaySchedule([], now) === null);

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { console.log('실패:', FAILS.join(', ')); process.exit(1); }
