// -*- coding: utf-8 -*-
// 🗓 지난 수업에서 «수업 일정» 만들기 하니스 — 의존성 없음 · node 로 바로 실행
//   실행:  node test-harness/schedule_seed_harness.mjs
//   대상:  cloudflare-deploy/src/api-admin.ts                 (preview · apply)
//          cloudflare-deploy/src/index.ts · api-mango.ts       (게이트 3곳)
//          cloudflare-deploy/public/js/adm-schedule-seed.js    (화면)
//          cloudflare-deploy/public/admin.html                 (카드)
//
//   무엇을 지키나 (2026-08-19 사장님 A안) —
//     운영 D1 실측(2026-08-18): class_schedules 673행 중 진짜 학생 것은 **6명 15건**뿐.
//     (658행이 user_id='lms'·'type_seed' 자리표시자) 학생 29,398명 중 6명이다.
//     반면 실제 수업 기록은 attendance 에 182,612건 있다 — 자료가 없는 게 아니라
//     «앞으로의 일정» 칸으로 옮겨지지 않았을 뿐이다. 그 이관 도구가 이 기능이다.
//
//   ⚠️ 사장님이 고르신 것은 **A안 — 미리보기 → 사람이 고르기 → 만들기** 다.
//      이 하니스의 핵심은 «만든다» 가 아니라 «사람이 고른 것만 만든다» 이다.
//      ⛔ apply 가 스스로 패턴을 다시 뽑아 전부 넣게 바뀌면 A안이 B안이 된다 — 여기서 걸린다.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = p => readFileSync(resolve(__dir, '..', p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); }
};

const aapi = R('cloudflare-deploy/src/api-admin.ts');
const idx = R('cloudflare-deploy/src/index.ts');
const mango = R('cloudflare-deploy/src/api-mango.ts');
const js = R('cloudflare-deploy/public/js/adm-schedule-seed.js');
const html = R('cloudflare-deploy/public/admin.html');
const ia6 = R('cloudflare-deploy/public/js/adm-ia6.js');

const cut = (from, to) => {
  const a = aapi.indexOf(from); if (a < 0) return '';
  const b = aapi.indexOf(to, a); return aapi.slice(a, b > a ? b : aapi.length);
};
const prev = cut("path === '/api/admin/schedule-seed/preview'", "path === '/api/admin/schedule-seed/apply'");
const appl = cut("path === '/api/admin/schedule-seed/apply'", '// 🥭 Phase 6d');

console.log('\n════ 🗓 지난 수업에서 일정 만들기 (A안) ════');

console.log('\n[ A. 게이트 3곳에 등록돼 있다 ]');
check('preview 핸들러가 있다', prev.length > 0);
check('apply 핸들러가 있다', appl.length > 0);
check('위임 가드에 등록 (api-mango.ts — 없으면 404)',
  /path\.startsWith\('\/api\/admin\/schedule-seed\/'\)/.test(mango));
check('라우팅 화이트리스트에 등록 (index.ts)',
  /path\.startsWith\('\/api\/admin\/schedule-seed\/'\) \|\|/.test(idx));
check('🔴 인증 게이트 뒤에 있다 (무인증 공개 금지)',
  /if \(path\.startsWith\('\/api\/admin\/schedule-seed\/'\)\) return true;/.test(idx));
/* ⛔ 이 도구는 전국 학생을 훑는다. 지사·대리점 허용목록에 넣으면 남의 학생 이름·학원이 샌다. */
const allowBlk = idx.slice(idx.indexOf('function isAgencyAllowedApi'),
                           idx.indexOf('function isAgencyAllowedApi') + 4000);
check('🔴 지사·대리점 허용목록에는 **없다** (전국 학생을 훑는 도구다)',
  !/schedule-seed/.test(allowBlk));

console.log('\n[ B. 본사만 쓴다 ]');
check('🔴 preview 가 본사만 (canEditOrg)', /if \(!canEditOrg\(_seedSc\)\)[\s\S]{0,200}forbidden_scope/.test(prev));
check('🔴 apply 가 본사만 (canEditOrg)', /if \(!canEditOrg\(_seedSc\)\)[\s\S]{0,200}forbidden_scope/.test(appl));

console.log('\n[ C. 🔴 A안 — 사람이 고른 것만 만든다 ]');
/* 여기가 이 기능의 요점이다. apply 가 스스로 attendance 를 다시 훑으면 그 순간
   «미리보기» 는 장식이 되고, 사람이 뺀 학생에게도 수업이 생긴다. */
check('🔴 apply 는 body.items 만 받는다', /Array\.isArray\(b\?\.items\) \? b\.items : \[\]/.test(appl));
check('🔴 apply 가 attendance 를 다시 훑지 않는다', !/FROM attendance/.test(appl));
check('items 가 비면 거절한다', /if \(!list\.length\) return invalidBody\(\['items'\]\)/.test(appl));
check('한 번에 500건까지만 (실수로 전부 보내는 것을 막는다)', /list\.length > 500/.test(appl));
check('화면이 «고른 것» 만 보낸다', /var picked = ROWS\.filter\(function \(r\) \{ return r\._pick; \}\)/.test(js));
/* 실서비스 학생 일정이다 — 몇 명에게 몇 건인지 숫자로 보여 주고 한 번 더 묻는다 */
check('🔴 만들기 전에 «몇 명·몇 건» 을 숫자로 묻는다', /confirm\(q\)/.test(js) && /students \+ '명에게 수업 일정 '/.test(js));

console.log('\n[ D. 서버가 한 번 더 막는다 ]');
/* 화면이 실수로 보내도 서버에서 걸러야 한다 — 화면만 믿으면 «그만둔 학생에게 수업» 이 그대로 들어간다. */
check('🔴 명부에 없으면 안 만든다', /reason: 'not_in_roster'/.test(appl));
check('🔴 수강 중이 아니면 안 만든다', /reason: 'not_active'/.test(appl));
check('🔴 같은 일정이 이미 있으면 건너뛴다 (두 번 눌러도 안 늘어난다)',
  /reason: 'already'/.test(appl) &&
  /WHERE user_id = \? AND day_of_week = \? AND start_time = \? AND status <> 'cancelled'/.test(appl));
check('요일·시각 형식이 이상하면 건너뛴다', /reason: 'invalid'/.test(appl));
check('건너뛴 것을 돌려준다 (조용히 안 만들면 «왜 안 됐지» 가 된다)', /skipped_count/.test(appl));

console.log('\n[ E. 되돌릴 수 있다 ]');
/* 잘못 들어갔을 때 골라낼 표시가 없으면 되돌릴 방법이 없다 */
check('🔴 만든 행에 source=attendance_seed 를 찍는다', /'attendance_seed'/.test(appl));
check('만든 사람도 남긴다 (created_by)', /actor\.name \|\| 'admin'/.test(appl));

console.log('\n[ F. 요일 번호 ]');
/* 🪤 attendance(strftime %w)·class_schedules 둘 다 0=일…6=토 라 여기서는 변환이 없다.
      주간 시간표(weekly-schedule.html)만 0=월 이다. 섞으면 «화요일로 봤는데 월요일» 사고. */
check('서버가 0=일…6=토 표기로 저장한다',
  /const DOW_TXT = \['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'\]/.test(appl));
check('화면 요일 이름도 0=일 부터다', /var DOW_KO = \['일', '월', '화', '수', '목', '금', '토'\]/.test(js));

console.log('\n[ G. 미리보기가 정직하다 ]');
check('왜 빠졌는지 숫자로 보여 준다', /skip_already/.test(prev) && /skip_not_active/.test(prev) && /skip_not_in_roster/.test(prev));
check('권장(기본 체크) 규칙이 서버·화면에서 같다',
  /i\.in_roster && i\.active && !i\.already/.test(prev) &&
  /r\.in_roster && r\.active && !r\.already/.test(js));
/* 🪤 접속 시각은 19:03·19:05 처럼 흔들린다. 분까지 그대로 묶으면 같은 수업이 여러 패턴으로
      쪼개져 최빈이 1이 되고, 아무것도 안 걸린다. */
check('시각을 10분 격자로 스냅해서 묶는다', /\/10\)\*10/.test(prev));
check('수업 길이를 접속 시간에서 뽑되 10~60분으로 가둔다',
  /Math\.max\(10, Math\.min\(60, mins \|\| DEFAULT_CLASS_MINUTES\)\)/.test(prev));
check('만들고 나서 결과 메시지를 지우지 않는다', /preview\(true\);/.test(js));

console.log('\n[ I. 👩‍🏫 강사 — 번호 체계를 섞지 않는다 ]');
/* 🪤 강사 번호가 «세 벌» 이다 —
     카페24 번호 : attendance.teacher_uid · teacher_payroll_auto.teacher_id  (실측 9~196)
     원부 번호   : teachers.id · class_schedules.teacher_id                   (1~29)
     프로필 번호 : teacher_profiles.id                                        (4~37)
   겹치는 자리에서 서로 «다른 사람» 이다(카페24 24 = Teacher Mariane / 원부 24 = HANNAH).
   2026-08-18 에 동기화가 이걸 섞어 attendance 602행에 남의 이름을 넣었고(79aa8ed 로 수리),
   같은 실수를 이 도구가 반복하면 학생 일정에 남의 강사가 붙는다. */
/* 부정 검사는 주석을 벗겨 낸 사본으로 — 「왜 안 읽는지」 적은 주석이 자기 검사에 걸린다
   (CLAUDE.md 「하니스에 «이 단어가 없어야 한다»」 함정) */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const prevC = strip(prev), applC = strip(appl), aapiC = strip(aapi);

check('🔴 preview 가 attendance.teacher_name 을 읽지 않는다 (옛 동기화가 남의 이름을 넣어 둔 칸)',
  !/a\.teacher_name/.test(prevC));
check('이름은 teacher_payroll_auto 에서 찾는다 (번호와 이름을 함께 받은 유일한 표)',
  /FROM teacher_payroll_auto/.test(aapiC) && /loadCafe24TeacherMap/.test(prevC));
check('🔴 원부 연결은 이름이 «유일» 할 때만 (겹치면 잇지 않는다)',
  /tid\.set\(k, tid\.has\(k\) \? null : String\(t\.id\)\)/.test(aapiC));
check('🔴 apply 가 카페24 번호를 class_schedules.teacher_id 에 그대로 넣지 않는다',
  !/it\?\.teacher_uid \? String\(it\.teacher_uid\) : null/.test(applC));
check('🔴 apply 가 강사를 서버에서 다시 찾는다 (화면이 보낸 번호를 그대로 믿지 않는다)',
  /loadCafe24TeacherMap\(env, list\.map/.test(applC) && /const teacherId = /.test(applC));
check('못 이으면 비워 둔다 (빈 칸은 눈에 띄지만 틀린 이름은 안 띈다)',
  /\?\.teacherId : null\) \|\| null/.test(applC));
check('강사가 안 붙는 건수를 미리보기가 숫자로 알린다', /no_teacher:/.test(prevC) && /teacher_unlinked:/.test(prevC));
check('만든 뒤에도 강사 미배정 건수를 돌려준다', /without_teacher:/.test(applC));
check('화면이 «원부 미연결» 을 표시한다', /원부 미연결/.test(js));

console.log('\n[ H. 화면이 붙어 있다 ]');
check('카드가 admin.html 에 있다', /id="card-schedule-seed"/.test(html));
check('스크립트를 부른다', /src="\/js\/adm-schedule-seed\.js\?v=\d+"/.test(html));
check('사이드바 「시간표·근무」에 등록돼 있다', /'card-auto-schedule', 'card-schedule-seed'/.test(ia6));

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
