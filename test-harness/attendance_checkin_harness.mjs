// -*- coding: utf-8 -*-
// 🧪 출결 체크인(/api/attendance/checkin) + 대시보드 결석률 로직 사양 테스트
//   실행:  node test-harness/attendance_checkin_harness.mjs
//   목적:  api-mango.ts 의 checkin 핸들러 핵심 결정 로직을 순수함수로 미러링해 회귀를 잡는다.
//          - 입력 검증(ID 형식/필수)
//          - timestamp 신뢰 윈도우(시계 오차·위변조 방어)
//          - KST 날짜/요일 집계 키
//          - 수업 스케줄 매칭(one_off/onetime + day_of_week 다형식: 영문CSV/숫자/한글)
//          - 수업시간 윈도우(grace) 판정
//          - 방어적 UPSERT(결석→출석 복구) 결정
//          - 첫 출석 알림 1회 규칙
//          - 대시보드 결석률 계산
// 주의: 규칙을 바꾸면 여기도 함께 바꿔 회귀를 잡습니다. (api-mango.ts 와 동일 사양)

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) { PASS++; } else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
function eq(name, a, b){ check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b)); }

// ═══════════════════ 미러링된 순수 로직 (api-mango.ts 와 동일 사양) ═══════════════════
const ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/;
function validateIds(body){
  const userId = body?.user_id != null ? String(body.user_id).trim() : '';
  const roomId = body?.room_id != null ? String(body.room_id).trim() : '';
  if (!ID_RE.test(userId) || !ID_RE.test(roomId)) return { ok:false, status:400 };
  return { ok:true, status:200, userId, roomId };
}
function resolveTs(timestamp, nowRef){
  let now = nowRef;
  if (timestamp != null) {
    const parsed = typeof timestamp === 'number' ? timestamp : Date.parse(String(timestamp));
    if (Number.isFinite(parsed) && parsed > nowRef - 86400000 && parsed < nowRef + 300000) now = parsed;
  }
  return now;
}
const kstDate = ts => new Date(ts + 9*3600*1000).toISOString().slice(0,10);
const kstDow  = ts => new Date(ts + 9*3600*1000).getUTCDay(); // 0=일

const ENG_ABBR = ['sun','mon','tue','wed','thu','fri','sat'];
const ENG_FULL = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const KOR      = ['일','월','화','수','목','금','토'];
function dayMatches(stored, dow){
  if (stored == null) return false;
  const want = new Set([ String(dow), String(dow===0?7:dow), ENG_ABBR[dow], ENG_FULL[dow], KOR[dow] ]);
  const parts = String(stored).split(/[\s,/|;]+/).map(t=>t.trim()).filter(Boolean);
  return parts.some(t => want.has(t) || want.has(t.toLowerCase()));
}
const ONEOFF_KINDS = new Set(['onetime','one_off','oneoff','one-time','onceoff']);
// 오늘 해당하는 스케줄 후보 전부: (a) scheduled_date 가 오늘인 일회성, (b) 오늘 요일 매칭 반복
function todaysSchedules(rows, date, dow){
  if (!Array.isArray(rows)) return [];
  return rows.filter(r => r && String(r.status||'active').toLowerCase()==='active' && (
    (r.scheduled_date === date) ||
    (!r.scheduled_date && dayMatches(r.day_of_week, dow))
  ));
}
// 입장 시각(now)을 윈도우에 포함하는 스케줄을 우선 선택, 없으면 첫 후보(없으면 null)
function pickTodaySchedule(rows, date, dow, now){
  const cands = todaysSchedules(rows, date, dow);
  if (!cands.length) return null;
  return cands.find(s => isWithinClass(s, now, date)) || cands[0];
}
function isWithinClass(sched, now, date){
  if (!sched) return true; // 스케줄 없음 → 인정(보수적, 결석률 버그 재발 방지)
  const [hh,mm] = String(sched.start_time||'00:00').split(':').map(x=>parseInt(x,10));
  const dur = Number(sched.duration_min ?? sched.duration_minutes ?? 30);
  const dayStartKst = new Date(date+'T00:00:00+09:00').getTime();
  const classStart = dayStartKst + ((hh||0)*60+(mm||0))*60000;
  const classEnd   = classStart + dur*60000;
  const GRACE_BEFORE = 30*60000, GRACE_AFTER = 15*60000;
  return now >= classStart - GRACE_BEFORE && now <= classEnd + GRACE_AFTER;
}
function decideUpsert(existing, withinClass){
  if (!existing) return { action:'insert', status: withinClass?'attended':'present', recovered:false };
  if (withinClass) return { action:'update', status:'attended', recovered: existing.status==='absent' };
  return { action:'touch', status: existing.status, recovered:false };
}
const firstAttend = (existing, recovered) => !existing || recovered;
function absence(active, attended){
  const absent = Math.max(0, active - attended);
  const rate = active>0 ? Math.round((absent*100/active)*10)/10 : 0;
  return { absent, rate };
}

// ── 배포된 (구) 버그 로직 재현: one_off/영문요일을 못 잡던 SQL 동작 ──
function buggyPick(rows, date, dowNumeric){
  return rows.find(r => r &&
    ((String(r.schedule_kind)==='onetime' && r.scheduled_date===date) ||
     (String(r.schedule_kind)==='recurring' && String(r.day_of_week)===String(dowNumeric)))) || null;
}

// ═══════════════════════════════ 테스트 ═══════════════════════════════
console.log('🧪 출결 체크인 · 대시보드 결석률 사양 테스트\n');

// 고정 기준 시각: 2026-06-10(수) KST 정오
const WED_NOON = Date.parse('2026-06-10T12:00:00+09:00');

console.log('[1] 입력 검증 (필수/형식)');
check('정상 ID 통과', validateIds({user_id:'u_ab12cd', room_id:'room-7'}).ok);
check('소켓ID(소문자영숫자) 통과', validateIds({user_id:'k3j2h1g0f9e8', room_id:'r1'}).ok);
check('이메일형 user_id 통과', validateIds({user_id:'a.b@x.com', room_id:'r1'}).ok);
check('user_id 누락 → 400', validateIds({room_id:'r1'}).status === 400);
check('room_id 누락 → 400', validateIds({user_id:'u1'}).status === 400);
check('공백 user_id → 400', validateIds({user_id:'   ', room_id:'r1'}).status === 400);
check('SQL 위험문자(따옴표) → 400', validateIds({user_id:"u'); DROP", room_id:'r1'}).status === 400);
check('128자 초과 → 400', validateIds({user_id:'u'.repeat(129), room_id:'r1'}).status === 400);

console.log('\n[2] timestamp 신뢰 윈도우');
const NOW = WED_NOON;
eq('정상 과거(10분전) 채택', resolveTs(NOW-600000, NOW), NOW-600000);
eq('미래 5분 초과 → 서버시각', resolveTs(NOW+600000, NOW), NOW);
eq('과거 24h 초과 → 서버시각', resolveTs(NOW-90000000, NOW), NOW);
eq('ISO 문자열 파싱', resolveTs('2026-06-10T11:55:00+09:00', NOW), Date.parse('2026-06-10T11:55:00+09:00'));
eq('쓰레기 값 → 서버시각', resolveTs('not-a-date', NOW), NOW);
eq('null → 서버시각', resolveTs(null, NOW), NOW);

console.log('\n[3] KST 날짜/요일 집계 키');
eq('KST 날짜', kstDate(WED_NOON), '2026-06-10');
eq('KST 요일(수=3)', kstDow(WED_NOON), 3);
// UTC 자정 직후(KST 오전 9시)도 같은 날로 묶이는지 — 23:30 UTC 6/9 = KST 08:30 6/10
eq('KST 날짜 경계(UTC 6/9 23:30 → KST 6/10)', kstDate(Date.parse('2026-06-09T23:30:00Z')), '2026-06-10');

console.log('\n[4] 🐞 버그 재현: 구 로직은 one_off/영문요일 스케줄을 못 잡음');
const seedRows = [
  { id:1, schedule_kind:'recurring', day_of_week:'mon,wed', scheduled_date:null, start_time:'12:00', duration_min:30 },
  { id:2, schedule_kind:'one_off',   day_of_week:null,      scheduled_date:'2026-06-10', start_time:'16:00', duration_min:30 },
];
check('구 로직: recurring "mon,wed" 매칭 실패(버그)', buggyPick(seedRows,'2026-06-10',3) === null);
const noonTs = Date.parse('2026-06-10T12:00:00+09:00');
const fourPmTs = Date.parse('2026-06-10T16:00:00+09:00');
check('✅ 신 로직: 정오 입장 → 12:00 반복수업(mon,wed) 선택', pickTodaySchedule(seedRows,'2026-06-10',3,noonTs)?.id === 1);
check('✅ 신 로직: 16시 입장 → 같은 날 16:00 일회성 선택', pickTodaySchedule(seedRows,'2026-06-10',3,fourPmTs)?.id === 2);
check('✅ 신 로직: one_off 단독 당일 매칭', pickTodaySchedule([seedRows[1]],'2026-06-10',3,noonTs)?.id === 2);
check('취소(status=cancelled) 스케줄은 제외', pickTodaySchedule([{...seedRows[0],status:'cancelled'}],'2026-06-10',3,noonTs) === null);

console.log('\n[5] day_of_week 다형식 매칭 (수요일=3)');
check('영문약어 wed', dayMatches('wed', 3));
check('영문CSV mon,wed', dayMatches('mon,wed', 3));
check('대문자 WED', dayMatches('WED', 3));
check('숫자 0-index "3"', dayMatches('3', 3));
check('ISO 1-index "3"(수)', dayMatches('3', 3));
check('한글 "수"', dayMatches('수', 3));
check('한글 CSV "월,수"', dayMatches('월,수', 3));
check('full "wednesday"', dayMatches('wednesday', 3));
check('미매칭: tue 는 수요일 아님', !dayMatches('tue', 3));
check('미매칭: "월,화"', !dayMatches('월,화', 3));

console.log('\n[6] 수업시간 윈도우(grace 시작30분전~종료15분후)');
const sched = { start_time:'12:00', duration_min:30 }; // 12:00~12:30
const D='2026-06-10';
check('정시 입장(12:00) 인정', isWithinClass(sched, Date.parse(D+'T12:00:00+09:00'), D));
check('25분 전(11:35) 인정', isWithinClass(sched, Date.parse(D+'T11:35:00+09:00'), D));
check('40분 전(11:20) 거부', !isWithinClass(sched, Date.parse(D+'T11:20:00+09:00'), D));
check('종료직후(12:40, +10분) 인정', isWithinClass(sched, Date.parse(D+'T12:40:00+09:00'), D));
check('종료 20분후(12:50) 거부', !isWithinClass(sched, Date.parse(D+'T12:50:00+09:00'), D));
check('스케줄 없으면 항상 인정', isWithinClass(null, Date.parse(D+'T03:00:00+09:00'), D));
check('duration_minutes(별칭컬럼)도 인식', isWithinClass({start_time:'12:00', duration_minutes:60}, Date.parse(D+'T12:50:00+09:00'), D));

console.log('\n[7] 방어적 UPSERT 결정');
eq('신규 입장 + 수업중 → insert attended', decideUpsert(null, true), {action:'insert',status:'attended',recovered:false});
eq('신규 입장 + 수업외 → insert present', decideUpsert(null, false), {action:'insert',status:'present',recovered:false});
eq('🔧 결석행 + 수업중 → attended 복구', decideUpsert({status:'absent'}, true), {action:'update',status:'attended',recovered:true});
eq('present행 + 수업중 → attended', decideUpsert({status:'present'}, true), {action:'update',status:'attended',recovered:false});
eq('attended행 재입장 → no 중복복구', decideUpsert({status:'attended'}, true), {action:'update',status:'attended',recovered:false});
eq('결석행 + 수업외 → status 유지', decideUpsert({status:'absent'}, false), {action:'touch',status:'absent',recovered:false});

console.log('\n[8] 첫 출석 알림 1회 규칙 (class_start)');
check('신규 입장 → 알림', firstAttend(null, false) === true);
check('결석→출석 복구 → 알림', firstAttend({status:'absent'}, true) === true);
check('이미 출석 재입장 → 알림 안함', firstAttend({status:'attended'}, false) === false);
check('present 재호출 → 알림 안함(join이 이미 발송)', firstAttend({status:'present'}, false) === false);

console.log('\n[9] 대시보드 결석률 계산');
eq('52명 전원 출석 → 0%', absence(52, 52), {absent:0, rate:0});
eq('52명 중 0명 출석 → 100%(버그 상황)', absence(52, 0), {absent:52, rate:100});
eq('52명 중 40명 출석 → 23.1%', absence(52, 40), {absent:12, rate:23.1});
eq('출석>활성(데이터 꼬임) → 음수 방지 0', absence(50, 52), {absent:0, rate:0});
eq('활성 0명 → 0% (0 나눗셈 방어)', absence(0, 0), {absent:0, rate:0});

// ═══════════════════════════════ 결과 ═══════════════════════════════
console.log('\n====================================================');
console.log(`🎯 총 ${PASS+FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패 항목:'); FAILS.forEach(f=>console.log('  - '+f)); process.exitCode = 1; }
else console.log('🎉 출결 체크인·결석률 핵심 로직 전부 통과');
console.log('====================================================');
