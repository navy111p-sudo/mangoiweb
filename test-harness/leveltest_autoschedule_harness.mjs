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

console.log('\n[ ⑤-2 «이미 찬 교사» 를 진짜로 걸러낸다 (예전엔 한 번도 동작 안 함) ]');
// ① 'fri' 로 물었는데 값은 'Fri' → SQLite 의 = 는 대소문자를 가려 항상 0건이었다
// ② 담은 건 teachers.id 인데 비교는 teacher_profiles.id → 번호 체계가 달라 엉뚱한 교사를 뺐다
/* 함수 «끝» 을 정규식으로 집으려다 못 찾아 4건이 가짜로 실패했다.
   시작점부터 넉넉히 잘라 쓴다 — 아래에서 보는 문자열은 이 함수에만 있는 것들이다. */
const aAt = api.indexOf('const autoAssignTeacher = async');
const auto = aAt > 0 ? api.slice(aAt, aAt + 9000) : '';
check('자동배정 함수를 찾았다', auto.length > 500);
check('⛔ day_of_week 를 «대소문자 그대로» 비교하지 않는다',
  !/day_of_week = \?[\s\S]{0,200}?wantDay\.toLowerCase\(\)/.test(auto));
check('요일 표기를 전부 받아들인다 (Fri/fri/5/금/금요일)',
  /lower\(COALESCE\(cs\.day_of_week,''\)\) IN \(/.test(auto) && /'fri', 'friday', '5', '금', '금요일'/.test(auto));
check('일회성 수업(그 날짜)도 함께 본다 (레벨테스트끼리 겹치는 것도 막아야)',
  /cs\.scheduled_date = \?/.test(auto));
check('🔑 비교를 «번호» 가 아니라 «이름» 으로 한다 (두 표의 번호 체계가 다르다)',
  /JOIN teachers t ON CAST\(t\.id AS TEXT\) = CAST\(cs\.teacher_id AS TEXT\)/.test(auto)
  && /busyNames\.has\(normT\(t\.name\)\)/.test(auto));
check('⛔ 옛 busy(id 집합) 비교가 남아 있지 않다', !/!busy\.has\(String\(t\.id\)\)/.test(auto));

console.log('\n[ ⑤-3 강사를 바꾸면 «이미 만들어진 수업»의 담당도 같이 바뀐다 ]');
/* 신청 즉시 수업이 생기게 된 뒤 새로 생긴 함정 — 관리자가 목록에서 강사 드롭다운만 바꾸면
   화면엔 바뀐 이름이 보이는데 수업은 옛 강사에게 남아, 새 강사 화면엔 영영 안 뜬다(에러 0).
   실제 사고: 신청 #15 를 'Teacher Maimai' 로 바꿨는데 수업 #854 담당은 BELLE 그대로였다. */
check('강사 변경 시 연결된 수업의 teacher_id 도 갱신한다',
  /UPDATE class_schedules SET teacher_id = \?, updated_at = \? WHERE id = \?/.test(api));
check('연결된 수업이 있을 때만 건드린다', /if \(appT\?\.schedule_id\)/.test(api));
check('🔑 여기서도 번호가 아니라 «이름» 으로 원부를 찾는다',
  /const want = normT\(appT\.assigned_teacher\)/.test(api));
check('원부에 없는 이름이면 조용히 넘기지 않는다 (화면만 바뀐 상태를 만들지 않는다)',
  /error: 'teacher_not_in_roster'/.test(api));
check('결과를 응답에 실어 화면이 확인할 수 있게 한다', /teacher_sync: teacherSync/.test(api));

console.log('\n[ ⑥ 강사 페이지에 «레벨테스트» 로 뜬다 ]');
check('서버가 class_type 을 읽어온다', /cs\.class_type/.test(tapi));
/* 🔁 (2026-08-08) 판정식이 이 파일 안에 **세 벌 복제**돼 있던 걸 classKindOf 한 곳으로 합쳤다.
   그래서 아래 검사는 «그 글자가 있는지» 가 아니라 «판정이 한 곳인지» 를 본다.
   글자를 그대로 박아 두면, 옳은 리팩터링이 하네스를 깨서 되돌리게 만든다. */
check('레벨테스트 판정 함수가 있다', /const classKindOf = \(s: any\): ClassKind/.test(tapi));
check('is_level_test 를 내려준다', /is_level_test: (_kind|classKindOf\(s\)) === 'level_test'/.test(tapi));
check('source·notes 로도 한 번 더 본다 (옛 데이터 구제)',
  /leveltest\|level_test\|level-test\/i\.test\(String\(s\.source/.test(tapi));
check('⛔ 판정식이 다시 복제되지 않았다 (한 곳에서만 판정)',
  (tapi.match(/=== 'level_test'\s*\n?\s*\|\|\s*\/leveltest/g) || []).length <= 1);
check('강사 화면이 배지를 그린다', /kindPill\(c\)/.test(thtml) && /function kindPill\(c\)/.test(thtml));
check('배지가 유형별로 갈린다 (정규·체험·보강·레벨테스트)',
  /'trial'\s*\)\s*return[\s\S]{0,120}p-trial/.test(thtml) && /'makeup'\s*\)\s*return[\s\S]{0,120}p-makeup/.test(thtml));
check('옛 응답(캐시)에도 안 깨진다 — is_level_test 폴백',
  /is_level_test\) \? 'level_test' : 'regular'/.test(thtml));
check('배지가 한/영 둘 다', /T\('LEVEL TEST','레벨테스트'\)/.test(thtml));
check('배지 색이 정의돼 있다', /\.pill\.p-lt\{background:#0d9488/.test(thtml));

console.log('\n[ ⑥-2 강사가 «내일» 수업도 미리 본다 ]');
/* 마이마이 제보: "내일 수업이 안 보인다". 버그가 아니라 이 화면이 «오늘» 만 그려서였다.
   레벨테스트는 준비가 필요한 수업이라(첫 대면·보호자 동석·평가) 당일에 알면 늦다. */
check('서버가 upcoming 을 내려준다', /upcoming: upcoming\.sort/.test(tapi));
check('오늘 이후만 담는다', /d <= todayStr\) continue/.test(tapi));
check('7일로 끊는다 (무한정 쌓이지 않게)', /UPCOMING_DAYS \* dayMs/.test(tapi));
check('⛔ 반복 수업은 안 넣는다 (넣으면 그 강사 시간표로 가득 찬다)',
  /if \(!s\.scheduled_date\) continue;/.test(tapi));
check('레벨테스트 표시가 함께 실린다', /is_level_test: classKindOf\(s\) === 'level_test',[\s\S]{0,120}?\}\);\s*\n\s*continue;/.test(tapi));
check('화면에 «다가오는 수업» 카드가 있다', /id="c-upcoming"/.test(thtml));
check('그리는 함수가 있다', /function renderUpcoming\(list\)/.test(thtml));
check('실제로 «불린다» (정의만 하면 화면은 그대로다)', /renderUpcoming\(d\.upcoming \|\| \[\]\)/.test(thtml));
check('언어를 바꿔도 다시 그린다', /renderUpcoming\(DATA\.upcoming \|\| \[\]\)/.test(thtml));
check('건이 없으면 카드째 숨긴다 (빈 카드 금지)',
  /if \(!list\.length\)\{ card\.hidden = true; return; \}/.test(thtml));
check('여기엔 입장 버튼을 주지 않는다 (그날이 아니면 방이 없다)',
  !/renderUpcoming[\s\S]{0,2200}?cls-act/.test(thtml));

console.log('\n[ ⑥-3 강사도 «내 주간 스케줄» 을 본다 ]');
/* 사장님 지적: "미리 교사의 스케줄에 올라와 있어야 하지 않나". 확인해 보니 강사에게
   자기 일정을 보는 화면이 **아예 없었다** — 마이페이지 탭 11개 중 스케줄 없음,
   /teacher 는 오늘만. 관리자에겐 주간 통합 캘린더가 있는데 당사자만 못 봤다. */
check('서버가 week 를 내려준다', /week: \{\s*\n\s*start: weekDates\[0\], end: weekDates\[6\]/.test(tapi));
check('?week= 로 주를 옮길 수 있다', /url\.searchParams\.get\('week'\)/.test(tapi));
check('어느 날짜를 주든 그 주 «월요일» 로 맞춘다', /const mondayOf = \(ms: number\)/.test(tapi));
check('반복 수업도 넣는다 (여기는 «내 시간표» 다)', /dowMatches\(s\.day_of_week, weekDays\[wi\]\.dow\)/.test(tapi));
check('일회성 수업도 넣는다', /String\(s\.scheduled_date\)\.slice\(0, 10\) === weekDays\[wi\]\.date/.test(tapi));
check('🔑 D1 을 다시 조회하지 않는다 (같은 rows 를 펼치기만)',
  /같은 rows 를 요일로 펼치기만/.test(tapi));
check('레벨테스트 표시가 주간에도 실린다',
  /weekDays\[wi\]\.items\.push\([\s\S]{0,700}?is_level_test:/.test(tapi));
check('오늘 칸을 표시한다', /is_today: date === todayStr/.test(tapi));
check('화면에 «내 주간 스케줄» 카드가 있다', /id="c-week"/.test(thtml));
check('그리는 함수가 있다', /function renderWeek\(w\)/.test(thtml));
check('첫 로드 때 «불린다»', /renderWeek\(d\.week\)/.test(thtml));
check('이전/이번/다음 주 버튼이 있다',
  /id="wk-prev"/.test(thtml) && /id="wk-this"/.test(thtml) && /id="wk-next"/.test(thtml));
check('버튼이 실제로 배선된다', /function bindWeekNav\(\)/.test(thtml) && /bindWeekNav\(\);/.test(thtml));
check('리스너가 겹쳐 쌓이지 않는다 (클릭 한 번에 여러 번 나가지 않게)', /!b\._wkBound/.test(thtml));
check('LMS 점유 슬롯은 흐리게 (학생이 없어 들어갈 방이 없다)', /it\.kind !== 'class'/.test(thtml));
check('한/영 둘 다', /T\('No classes','수업 없음'\)/.test(thtml));

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
