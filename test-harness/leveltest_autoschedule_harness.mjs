// -*- coding: utf-8 -*-
// 📅 「신청하면 자동으로 수업이 잡히고 강사·관리자 화면에 뜬다」 하네스 (2026-08-06)
//   실행: node test-harness/leveltest_autoschedule_harness.mjs
//
//   신고: "여기서 레벨테스트 신청하면 자동으로 스케줄과 캘린더에 뜨고
//          강사한테도 테스트 예정 수업 뜨게 해줘. 강사페이지와 관리자페이지 모두"
//
//   그전까지: 관리자가 「📅 수업 만들기」를 **손으로 눌러야만** 방이 생겼다.
//     안 누르면 → 방이 없음 → 학생 티켓에 입장 버튼 없음 → 강사 화면·주간 캘린더에도 안 뜸.
//     신청서만 쌓이고 아무도 못 들어가는 상태가 **에러 없이** 남는다.
//     게다가 계정이 없는 신청자(운영 절반)는 "계정 아이디를 지정해 주세요" 에서 막혔고,
//     관리자가 아무 계정이나 넣으면 **실제 학생의 기록이 오염**된다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const mod   = rd('../cloudflare-deploy/src/leveltest-schedule.ts');
const api   = rd('../cloudflare-deploy/src/api-admin.ts');
const tapi  = rd('../cloudflare-deploy/src/api-teacher.ts');
const thtml = rd('../cloudflare-deploy/public/teacher.html');
const q6    = rd('../cloudflare-deploy/public/js/adm-q6.js');
const tc    = rd('../cloudflare-deploy/public/js/adm-today-classes.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ① 신청 즉시 수업이 «자동으로» 잡힌다 ]');
check('자동 배정 함수가 있다', /export async function autoScheduleOnApply/.test(mod));
check('신청 저장 직후 실제로 «불린다» (정의만 하면 아무 일도 안 일어난다)',
  /await autoScheduleOnApply\(env, appRowNew\)/.test(api));
check('신청 응답이 schedule_id 를 돌려준다 (화면이 «예약됨» 이라 말할 근거)',
  /schedule_id: \(autoSched && autoSched\.schedule_id\) \|\| null/.test(api));
check('자동 생성이 실패해도 신청 자체는 성공한다 (try/catch)',
  /try \{[\s\S]{0,400}?autoScheduleOnApply[\s\S]{0,200}?\} catch/.test(api));

console.log('\n[ ② 자동과 수동이 «같은 코드» 를 쓴다 ]');
// 두 경로가 갈라지면 «자동으로 만든 수업»과 «손으로 만든 수업»이 미묘하게 달라진다
check('관리자 버튼도 같은 함수를 부른다', /const res = await createLeveltestSchedule\(env, appRow/.test(api));
check('api-admin 안에 수업 INSERT 가 남아 있지 않다 (로직 이중화 금지)',
  !/INSERT INTO class_schedules[\s\S]{0,200}?'one_off', 'level_test'/.test(api));
check('수업 INSERT 는 leveltest-schedule.ts 에만 있다',
  /INSERT INTO class_schedules[\s\S]{0,200}?'one_off', 'level_test'/.test(mod));

console.log('\n[ ③ 계정이 없는 신청자도 막히지 않는다 ]');
check('체험 계정 자동 생성이 있다', /async function createTrialStudent/.test(mod));
check('아이디가 신청번호 기반이라 충돌하지 않는다', /const base = `lt\$\{Number\(app\.id\)\}`/.test(mod));
check('그래도 겹치면 뒤에 번호를 붙여 피한다', /uid = `\$\{base\}_\$\{i \+ 1\}`/.test(mod));
check('전화번호도 함께 저장한다 (나중에 연락·리마인더가 가능해야)',
  /INSERT INTO students_erp[\s\S]{0,400}?app\.phone/.test(mod));
check('만든 계정을 신청서에도 되꽂는다 (다음부터 본인 조회가 된다)',
  /SET schedule_id = \?, student_uid = COALESCE\(student_uid, \?\)/.test(mod));
check('관리자 버튼 경로에서도 계정을 만들어 준다 (되물으면 남의 계정을 넣게 된다)',
  /allowCreateStudent: b\.create_student !== false/.test(api));

console.log('\n[ ④ 자동이라고 아무거나 만들지 않는다 ]');
check('지난 날짜로는 안 만든다 (어느 화면에도 안 뜨는 죽은 수업이 된다)',
  /error: 'past_date'/.test(mod));
check('시간이 겹치면 멈춘다 (같은 강사가 두 방에 있을 수 없다)', /error: 'conflict'/.test(mod));
check('겹침을 «구간» 으로 본다 (시작시각만 보면 18:00 50분 옆 18:30 을 놓친다)',
  /s1 < e2 && s2 < e1/.test(mod));
check('강사 미배정이면 안 만든다', /error: 'no_teacher'/.test(mod));
check('공개 신청이므로 남용 방지가 있다 (같은 번호 24시간 3건)',
  /rate_limited/.test(mod) && /Date\.now\(\) - 86400000/.test(mod));
check('킬스위치가 있다', /leveltest_autoschedule/.test(mod));
check('이미 수업이 있으면 또 만들지 않는다', /if \(app\.schedule_id\)/.test(mod));

console.log('\n[ ⑤ 강사 번호를 «이름» 으로 되찾는다 (번호 체계가 다르다) ]');
// 신청서의 assigned_teacher_id 는 teacher_profiles 번호. 그대로 쓰면 엉뚱한 강사가 된다
// (Teacher Kaye = profiles 11 / teachers 8, 그리고 teachers 11 은 MARIANE)
check('teachers 원부에서 이름으로 찾는다', /SELECT id, name FROM teachers WHERE COALESCE\(active,1\) = 1/.test(mod));
check("표기 차이를 정규화한다 ('Teacher Maimai' ↔ 'MAIMAI')",
  /replace\(\/teacher\/g, ''\)/.test(mod));
check('⛔ assigned_teacher_id 를 그대로 쓰지 않는다',
  !/teacher_id[^_a-zA-Z]{0,4}=\s*app\.assigned_teacher_id/.test(mod));

console.log('\n[ ⑥ 강사 페이지에 «레벨테스트» 로 뜬다 ]');
check('서버가 class_type 을 읽어온다', /cs\.class_type/.test(tapi));
check('is_level_test 를 내려준다', /is_level_test: String\(s\.class_type \|\| ''\) === 'level_test'/.test(tapi));
check('source·notes 로도 한 번 더 본다 (옛 데이터 구제)',
  /leveltest\|level_test\|level-test\/i\.test\(String\(s\.source/.test(tapi));
check('강사 화면이 배지를 그린다', /c\.is_level_test \? ' <span class="pill p-lt">/.test(thtml));
check('배지가 한/영 둘 다', /T\('LEVEL TEST','레벨테스트'\)/.test(thtml));
check('배지 색이 정의돼 있다', /\.pill\.p-lt\{background:#0d9488/.test(thtml));

console.log('\n[ ⑦ 관리자 화면 — 오늘 수업 · 주간 캘린더 ]');
check('「오늘 수업」이 레벨테스트를 구분한다', /is_level_test/.test(tc));
check('주간 캘린더에 레벨테스트 색이 있다', /'leveltest':'#0d9488'/.test(q6));
check('주간 캘린더에 레벨테스트 이름이 있다', /'leveltest':'레벨테스트'/.test(q6));
check('서버가 level_test 를 별도 유형으로 내려준다',
  /c === 'level_test'[\s\S]{0,90}?return 'leveltest'/.test(api));
check('주간 캘린더가 일회성 수업을 그 주에 넣는다 (레벨테스트는 전부 one_off)',
  /if \(kind === 'one_off' \|\| r\.scheduled_date\)[\s\S]{0,220}?d >= weekStartISO && d <= weekEndISO/.test(api));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
