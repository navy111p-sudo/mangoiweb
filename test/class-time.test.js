/* 수업 시간 로직 단위 테스트 — 실행: node test/class-time.test.js */
const assert = require('assert');
const { formatTime, addMinutes, pickTodaySchedule } =
  require('../cloudflare-deploy/public/js/mango-class-time.js');

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.error('  ❌ ' + name + ' — ' + e.message); fail++; } };

console.log('\n[ formatTime ]');
t('HH:MM 유지', () => assert.strictEqual(formatTime('22:00'), '22:00'));
t('ISO → HH:MM', () => assert.strictEqual(formatTime('2026-06-23T22:25:00'), '22:25'));
t('HH:MM:SS 자르기', () => assert.strictEqual(formatTime('09:05:30'), '09:05'));
t('빈 값 → --:--', () => assert.strictEqual(formatTime(''), '--:--'));
t('잘못된 값 → --:--', () => assert.strictEqual(formatTime('xyz'), '--:--'));

console.log('\n[ addMinutes (종료시간 계산) ]');
t('22:00 +25 = 22:25', () => assert.strictEqual(addMinutes('22:00', 25), '22:25'));
t('09:50 +30 = 10:20', () => assert.strictEqual(addMinutes('09:50', 30), '10:20'));
t('자정 넘김 23:50 +30 = 00:20', () => assert.strictEqual(addMinutes('23:50', 30), '00:20'));
t('기본값 처리 잘못된 입력 → --:--', () => assert.strictEqual(addMinutes('bad', 30), '--:--'));

console.log('\n[ pickTodaySchedule ]');
const now = new Date('2026-06-23T22:05:00'); // 화요일(tue)
t('오늘 날짜 1회성 매칭', () => {
  const r = pickTodaySchedule([{ scheduled_date: '2026-06-23', start_time: '22:00', duration_min: 25 }], now);
  assert.strictEqual(r.start_time, '22:00');
});
t('요일 정기수업 매칭(tue)', () => {
  const r = pickTodaySchedule([{ day_of_week: 'tue', start_time: '22:00', duration_min: 30 }], now);
  assert.ok(r && r.day_of_week === 'tue');
});
t('현재시각에 가장 가까운 수업 선택', () => {
  const r = pickTodaySchedule([
    { day_of_week: 'tue', start_time: '10:00' },
    { day_of_week: 'tue', start_time: '22:00' },
  ], now);
  assert.strictEqual(r.start_time, '22:00');
});
t('해당없으면 null', () => {
  assert.strictEqual(pickTodaySchedule([{ scheduled_date: '2020-01-01', start_time: '10:00' }], now), null);
});
t('빈 배열 → null', () => assert.strictEqual(pickTodaySchedule([], now), null));

console.log(`\n결과: ${pass} 통과, ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
