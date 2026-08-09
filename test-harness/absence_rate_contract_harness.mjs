// ════════════════════════════════════════════════════════════════════════════
// absence_rate_contract_harness.mjs — 「오늘의 미실시율」 타일이 다시 거짓말하지 않도록
//
// 왜 이 하니스가 있나 (2026-08-09):
//   이 지표 하나를 **네 번 만에** 맞췄다. 틀린 셋을 전부 여기서 막는다.
//     ① 분모가 «전체 재원» 이었다 → 매일 99.9% 가 빨갛게 떠 있었다.
//     ② «예정 학생 중 출석 안 한 학생» 으로 고쳤다 → 70.7%. 한 학생이 하루에
//        수업을 여러 개 듣기 때문에 학생 단위로 세면 안 된다.
//     ③ 「room_id 겹침 0건」을 보고 «예약과 출석 피드가 끊겼다» 고 결론내
//        **계산 불가로 선언하고 커밋했다.** 정반대였다 — cafe24-sync 는
//        수업 1건에 행 1개를 쓰고 그 행의 status 를 present↔scheduled 로 **갱신**한다.
//        한 방에 두 상태가 동시에 있을 수 없는 것이 설계다.
//
//   그리고 맞춘 뒤에도 두 가지가 더 있었다 —
//     🪤 «오늘» 로 비율을 내면 아침엔 항상 100% 다(아직 아무 수업도 안 끝났으니까).
//     🪤 «어제» 값도 확정이 아니다. 야간 동기화가 최근 14일만 다시 가져와서
//        완료 처리가 15일에 걸쳐 들어온다 → 굳은 날 대비 일관되게 +5~8%p 나쁘게 보인다.
//
//   소스가 곧 사양이다. 위 규칙이 하나라도 풀리면 여기서 잡는다.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = (...p) => readFileSync(join(__dir, '..', 'cloudflare-deploy', ...p), 'utf8');
const api = R('src', 'api-admin.ts');
const core = R('public', 'js', 'adm-core.js');
const mgr = R('public', 'manager.html');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { console.log('  ✅ ' + label); pass++; }
  else { console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); fail++; }
};

// 지표 쿼리 본문만 떼어 본다(파일 전체에서 찾으면 남의 쿼리에 걸린다).
const qStart = api.indexOf('WITH ghost AS (');
const q = qStart >= 0 ? api.slice(qStart, qStart + 2600) : '';

console.log('① 세는 단위는 «학생» 이 아니라 «수업(행)» 이다');
check('지표 쿼리(WITH ghost … prev … wd)가 있다', qStart >= 0);
check('room_id LIKE \'c24-%\' 로 카페24 수업행만 센다', /room_id LIKE 'c24-%'/.test(q));
check('COUNT(DISTINCT user_id) 로 세지 않는다 (②번 오답 재발 방지)',
      !/COUNT\(DISTINCT\s+user_id\)/.test(q));
check("완료 판정은 status='present' 다 (cafe24-sync 의 class_state=2)",
      /SUM\(CASE WHEN status='present' THEN 1 ELSE 0 END\)/.test(q));

console.log('\n② «오늘» 로는 비율을 내지 않는다 — 아침엔 항상 100% 다');
check('오늘 것은 booked_today / done_today 두 «사실» 로만 준다',
      /booked_today/.test(q) && /done_today/.test(q));
check('오늘 비율을 켜는 hasSchedule 이 false 로 고정돼 있다',
      /const hasSchedule = false;/.test(api));
check('reason 으로 «오늘은 진행 중» 임을 밝힌다', /today_in_progress/.test(api));

console.log('\n③ 직전 영업일은 «날짜 빼기» 가 아니라 예약이 있는 날을 SQL 이 고른다');
check('HAVING COUNT(*) >= 20 으로 수업이 있는 날만 고른다', /HAVING COUNT\(\*\) >= 20/.test(q));
check('date(?, \'-1 day\') 같은 단순 날짜 빼기를 쓰지 않는다',
      !/date\(\?,\s*'-1 day'\)/.test(q),
      '공휴일·일요일에 0건이 잡혀 «미실시 –» 가 된다');

console.log('\n④ 어제 값은 확정 전이므로 «잣대» 를 함께 준다');
check('굳은 날 기준선(wd CTE)이 있다', /wd AS \(/.test(q));
check("잣대는 15일 이상 지난 «굳은 날» 만 쓴다", /-15 days/.test(q),
      '14일 안쪽을 섞으면 잣대 자체가 확정 전 값이 된다');
check('같은 요일끼리 비교한다', /strftime\('%w', date\) = \(SELECT strftime\('%w', date\) FROM prev\)/.test(q));
check('서버가 weekday_avg_pct 를 내보낸다', /weekday_avg_pct:\s*wdRate/.test(api));
check('표본이 적으면 잣대를 내지 않는다(null)', /wdBooked >= 100/.test(api));

console.log('\n⑤ 테스트·교육용 대리점은 지표에서 뺀다 (60일간 169건 예약·완료 0)');
check('ghost CTE 가 대리점 이름으로 거른다', /ghost AS \(\s*SELECT user_id FROM students_erp/.test(q));
for (const shop of ['무료수업(지인)', '망고아이 기본대리점', '교육용 대리점', '테스트대리점']) {
  check(`제외 목록에 「${shop}」 이 있다`, q.includes(`'${shop}'`));
}
check('이름 LIKE 로 거르지 않는다 — 「라이크테스트프랩어학원」은 실제 학원이다',
      !/shop_name LIKE '%테스트%'/.test(q) && !/korean_name LIKE '%테스트%'/.test(q));
const ghostUses = (q.match(/NOT IN \(SELECT user_id FROM ghost\)/g) || []).length;
check(`네 곳 전부에 제외가 걸려 있다 (오늘 예약·오늘 완료·prev·wd) — 실제 ${ghostUses}곳`,
      ghostUses >= 4, '한 곳이라도 빠지면 분자·분모가 서로 다른 모집단이 된다');

console.log('\n⑥ 화면은 «진행상황» 과 «잣대» 를 나눠 그린다');
for (const [name, src] of [['adm-core.js', core], ['manager.html', mgr]]) {
  check(`${name} 이 weekday_avg_pct 를 읽는다`, /weekday_avg_pct/.test(src));
  check(`${name} 이 booked/done 진행상황을 그린다`,
        /booked_today/.test(src) && /done_today/.test(src));
  check(`${name} 이 요일 라벨을 getUTCDay 로 만든다 (브라우저 시간대에 흔들리지 않게)`,
        /getUTCDay\(\)/.test(src));
}
check('adm-core.js 가 «오늘 결석률» 을 다시 빨갛게 칠하지 않는다',
      !/today-absence[\s\S]{0,120}#b91c1c/.test(core));

console.log('\n' + '─'.repeat(58));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('❌ 미실시율 계약이 깨졌습니다 — 위 주석의 «네 번 틀린 이력» 을 먼저 읽으세요.'); process.exit(1); }
console.log('🎉 미실시율 계약 유지 — 지어내지 않고, 확정 전 값에 잣대를 붙인다.');
