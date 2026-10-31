// -*- coding: utf-8 -*-
// 📅 「강사 스케줄(주간 통합 캘린더)에 레벨테스트가 안 뜬다」 하네스 (2026-08-06)
//   실행: node test-harness/teacher_weekly_calendar_id_space_harness.mjs
//
//   신고: 강사 필터를 「Teacher Maimai」로 두면 목요일 18:00 레벨테스트(#852)가 안 보인다.
//
//   원인 — 필터가 «다른 번호 체계» 를 보고 있었다. 에러는 한 줄도 안 난다.
//     · 캘린더가 그리는 것은 class_schedules 이고, 그 teacher_id 는 **teachers.id** 다
//       (운영 664건 전부 teachers 와 일치).
//     · 그런데 필터 목록은 teacher_profiles 에서 가져와 **teacher_profiles.id** 를 값으로 썼다.
//     · 두 표는 번호 체계가 다르다: 마이마이 = profiles #25 / teachers #27.
//       「Teacher Maimai」로 거르면 teacher_id='25' 를 찾는데 그건 KARL 이라 0건.
//     · 더 나쁜 것 — 664건 중 611건이 profiles 에도 «존재하는 번호» 라, 대부분의 강사는
//       **조용히 남의 수업을 보고 있었다**. 「Teacher Len」(#8) → 실제로는 KAYE 의 수업 50건.
//   이 하네스는 그 혼선이 되돌아오지 못하게 막는다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const q6   = rd('../cloudflare-deploy/public/js/adm-q6.js');
const api  = rd('../cloudflare-deploy/src/api-admin.ts');
const html = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ① 필터 목록은 «캘린더가 쓰는 표» 에서 가져와야 한다 ]');
check('강사 목록을 /api/admin/teachers (=teachers) 에서 가져온다',
  /fetch\('\/api\/admin\/teachers'/.test(q6));
check('⛔ teacher_profiles 를 필터 목록 원천으로 쓰지 않는다 (번호 체계가 다르다)',
  !/fetch\('\/api\/admin\/teacher-profiles/.test(q6));
check('option 의 value 가 그 목록의 id 다', /'<option value="'\+t\.id\+'"/.test(q6));
check('필터 비교가 teacher_id 끼리다', /String\(r\.teacher_id\) !== String\(filterId\)/.test(q6));

console.log('\n[ ② 강사 목록 행의 📅 버튼 — profiles id 를 그대로 넣으면 안 된다 ]');
check('⛔ profiles id(tid)를 필터에 직접 넣지 않는다',
  !/ph54State\.teacherFilter = String\(tid\)/.test(q6));
check('이름으로 원부 id 를 되찾는다', /ph54State\.teacherFilter = rid/.test(q6) && /function ph54ResolveTeacherId/.test(q6));
check('되찾기 전에 원부를 먼저 불러온다 (순서가 뒤집히면 항상 빈 목록에서 찾는다)',
  /await Promise\.all\(\[[\s\S]{0,220}?\]\);\s*[\s\S]{0,400}?var rid = ph54ResolveTeacherId\(tname\)/.test(q6));
check('못 찾으면 조용히 0건을 보여주지 않고 이유를 말한다', /if \(!rid\) ph54Toast\(/.test(q6));

//  📌 (2026-09-08) FAR(22) 와 HT FARRAH(3) 는 실은 **같은 사람**이다(사장님 확인).
//     그래도 이 검사는 그대로다 — 이어야 할 행은 **활성 22** 이고 3 은 퇴사 행이다.
//     그리고 이 규칙이 지키는 것은 그 쌍이 아니라 «부분일치 일반»(HT NESS 등)이다.
console.log('\n[ ③ 이름 매칭이 «엉뚱한 행» 을 끌어오면 안 된다 (Teacher Far → 활성 22) ]');
// 진짜 함수를 떼어 실행한다 — 규칙을 여기에 다시 적으면 자기복사 검사가 된다
const normSrc = (q6.match(/function ph54NormName\(s\)\{[\s\S]*?\n  \}/) || [''])[0];
const resSrc  = (q6.match(/function ph54ResolveTeacherId\(name\)\{[\s\S]*?\n  \}/) || [''])[0];
check('두 함수 소스를 떼어냈다', normSrc.length > 40 && resSrc.length > 80);
let resolve2 = null;
try {
  // eslint-disable-next-line no-new-func
  resolve2 = new Function('roster', `
    var ph54State = { teachers: roster };
    ${normSrc}
    ${resSrc}
    return ph54ResolveTeacherId;
  `);
} catch (e) { console.log('   (함수 구성 실패: ' + e.message + ')'); }
check('실제 함수를 실행할 수 있다', typeof resolve2 === 'function');
if (typeof resolve2 === 'function') {
  const roster = [
    { id: 22, name: 'FAR' }, { id: 3, name: 'HT FARRAH' }, { id: 10, name: 'HT NESS' },
    { id: 27, name: 'MAIMAI' }, { id: 25, name: 'KARL' }, { id: 8, name: 'KAYE' },
  ];
  const R = resolve2(roster);
  check('「Teacher Maimai」 → 27 (프로필 25 가 아니라 원부 27)', R('Teacher Maimai') === '27');
  check('접두사 없는 이름도 찾는다 (MAIMAI)', R('MAIMAI') === '27');
  check('「Teacher Far」 → 22 이고 «HT FARRAH(3)» 이 아니다', R('Teacher Far') === '22');
  check('「Teacher Ness」 → 10 (HT NESS 는 단어 단위로 맞다)', R('Teacher Ness') === '10');
  check('없는 이름은 빈 값 (엉뚱한 사람으로 떨어지지 않는다)', R('Teacher Nobody') === '');
  check('빈 입력에 안 죽는다', R('') === '' && R(null) === '');
  check('⛔ 짧은 이름이 긴 이름에 «스치는» 매칭 금지 (FAR vs FARRAH)', R('Teacher Farr') === '');
}

console.log('\n[ ④ 레벨테스트가 캘린더에서 한눈에 구분돼야 한다 ]');
check('서버가 level_test 를 별도 유형으로 내려준다', /c === 'level_test'[\s\S]{0,90}?return 'leveltest'/.test(api));
/* 🎨 (2026-08-11) 예전엔 색을 «#0d9488» 로 못박아 검사했다. 그러다 팔레트를 통째로
   파스텔로 바꾸자 «구분은 여전히 되는데» 하네스만 빨개졌다 — 검사가 의도가 아니라
   그때의 색깔을 외우고 있었던 것이다. 의도는 「레벨테스트가 다른 유형과 구분된다」다. */
const COLORS = Object.fromEntries(
  [...q6.matchAll(/'(1on1|group|temp|leveltest)':\s*'(#[0-9a-fA-F]{3,8})'/g)].map(m => [m[1], m[2].toLowerCase()])
);
check('화면에 그 유형의 색이 있다', !!COLORS.leveltest);
check('⛔ 레벨테스트 색이 다른 유형과 겹치지 않는다 (겹치면 구분이 안 된다)',
  !!COLORS.leveltest && ['1on1', 'group', 'temp'].every(k => COLORS[k] && COLORS[k] !== COLORS.leveltest));
check('화면에 그 유형의 이름이 있다', /'leveltest':'레벨테스트'/.test(q6));

/* ⑦·⑧ 은 2026-08-11 「BELLE 스케줄 24개가 정확한가?」 확인에서 나왔다.
   답: 그림은 DB 와 정확히 일치했지만, 그 24개가 전부 «수업이 아닌 것» 이었다. */
console.log('\n[ ⑦ 스케줄 캘린더 두 개의 박스색이 같아야 한다 (사장님 지시 2026-08-11) ]');
const ws = rd('../cloudflare-deploy/public/admin/weekly-schedule.html');
const wsColor = (cls) => (ws.match(new RegExp('\\.slot-' + cls + '\\{background:(#[0-9a-fA-F]{3,8})')) || [])[1]?.toLowerCase();
for (const [type, cls] of [['1on1', '1on1'], ['group', 'group'], ['temp', 'temp']]) {
  const a = COLORS[type], b = wsColor(cls);
  check(`${type} — 통합 캘린더(${a || '?'}) = 주간 스케줄(${b || '?'})`, !!a && a === b);
}
check('밝은 파스텔이 됐으니 카드 글자는 흰색이 아니다 (흰 글자면 안 읽힌다)',
  /\.ph54-ev\s*\{[^}]*color:\s*#1e293b/.test(rd('../cloudflare-deploy/public/css/admin-inline-c.css')));

console.log('\n[ ⑧ 「수업이 아닌 칸」 을 수업처럼 보여 주지 않는다 ]');
// 운영 실측(2026-08-11): 활성 667행 중 진짜 수업 9행. 나머지는 LMS 점유 518 + 시연 시드 140.
check('서버가 정체(origin)를 함께 내려준다',
  /origin\s*=\s*_uid === 'lms' \? 'lms' : \(_uid === 'type_seed' \? 'sample' : 'class'\)/.test(api));
check('그 판정이 api-teacher.ts 의 kind 와 같은 식이다 (두 화면이 갈리면 안 된다)',
  /_uid === 'lms' \? 'lms' : \(_uid === 'type_seed' \? 'sample' : 'class'\)/.test(rd('../cloudflare-deploy/src/api-teacher.ts')));
check('카드가 유형 라벨 대신 정체를 적는다 (학생이 없다고 «1:1» 로 폴백하지 않는다)',
  /org\s*\?\s*ph54T\(org\.ko, org\.en\)/.test(q6));
check('카드에 시각 표식이 붙는다 (배지 + 회색·사선)',
  /ph54-ev-tag/.test(q6) && /ph54-nonclass/.test(q6));
check('⛔ 「총 N개 수업」 으로 뭉뚱그리지 않는다 — 진짜 수업과 점유를 갈라 센다',
  /nReal\s*=\s*evClass\.filter/.test(q6) && /nOther\s*=\s*evClass\.length - nReal/.test(q6));

/* ⑨ 같은 API 를 쓰는 «강사 출근현황»(adm-p6.js) — 여기서 LMS 점유를 세면 「규정출근시간」이
   옛 LMS 슬롯의 첫 시각이 되고, 그 숫자가 급여·평가로 이어진다. 캘린더만 고치면 반쪽이다. */
console.log('\n[ ⑨ 강사 출근현황도 «수업이 아닌 것» 으로 출근을 판정하지 않는다 ]');
const p6 = rd('../cloudflare-deploy/public/js/adm-p6.js');
check('출근 집계가 LMS 점유·시드를 뺀다',
  /_org === 'lms' \|\| _org === 'sample'/.test(p6));
check('뺀 건수를 세어 둔다 (조용히 빼지 않는다)', /_awSkipped/.test(p6));
check('⛔ 「수업 스케줄은 실제 데이터입니다」 라고 더는 단언하지 않는다',
  !/<b>수업 스케줄은 실제 데이터입니다\.<\/b>/.test(p6));
check('배너가 «왜 뺐는지» 를 한/영으로 밝힌다',
  /옛 LMS 점유·시연 시드/.test(p6) && /legacy-LMS \/ demo placeholders/.test(p6));
check('빈 화면이 «기록 없음» 이 아니라 «수업이 없음 + 이유» 를 말한다',
  /망고아이 수업<\/b>이 없습니다/.test(p6) && /전부 옛 LMS 점유·시연 시드입니다/.test(p6));
check('엑셀 내려받기도 같은 필터를 탄다 (filterRecords 경유)',
  (p6.match(/const rows = filterRecords\(\)/g) || []).length >= 2);

console.log('\n[ ⑤ 일회성 수업이 주간 캘린더에서 빠지지 않는다 ]');
// 레벨테스트 수업은 전부 one_off 라, 반복(day_of_week)만 그리면 영영 안 보인다
check('one_off / scheduled_date 도 그 주 범위면 넣는다',
  /if \(kind === 'one_off' \|\| r\.scheduled_date\)[\s\S]{0,220}?d >= weekStartISO && d <= weekEndISO/.test(api));

console.log('\n[ ⑥ 캐시 — 고친 js 가 실제로 내려가야 한다 ]');
const v = (html.match(/adm-q6\.js\?v=(\d+)/) || [])[1];
check('admin.html 이 adm-q6.js 를 버전과 함께 부른다', !!v);
check('버전이 5 이상 (이번 수정 반영)', Number(v || 0) >= 5);

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
