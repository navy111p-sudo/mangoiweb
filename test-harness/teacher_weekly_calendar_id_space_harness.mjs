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

console.log('\n[ ③ 이름 매칭이 «남의 일정» 을 끌어오면 안 된다 (FAR ⊄ HT FARRAH) ]');
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
check('화면에 그 유형의 색이 있다', /'leveltest':'#0d9488'/.test(q6));
check('화면에 그 유형의 이름이 있다', /'leveltest':'레벨테스트'/.test(q6));

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
