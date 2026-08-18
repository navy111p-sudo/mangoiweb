// -*- coding: utf-8 -*-
// 💾 신규 학생 등록 마법사 «진짜 저장» 하니스 — 의존성 없음 · node 로 바로 실행
//   실행:  node test-harness/enroll_wizard_persist_harness.mjs
//   대상:  cloudflare-deploy/public/admin/weekly-schedule.html  (wizFinalize)
//          cloudflare-deploy/src/api-admin.ts                   (POST /api/admin/class-schedules)
//
//   무엇을 지키나 (2026-08-18) —
//     주간 시간표의 「신규 학생 등록」 마법사는 마지막에 addSlot() 만 불렀다.
//     addSlot 은 SLOTS[...] = s 로 **브라우저 메모리만** 바꾼다. 그런데 화면에는
//     「🎉 등록 완료 / 성공적으로 등록되었습니다 / N개 슬롯이 자동 배정되었습니다」가 떴다.
//     담당자는 배정을 마쳤다고 믿고 넘어가는데 **새로고침하면 사라진다.**
//     (#276 「본사 직원 등록이 시연용 껍데기였던 것」과 같은 종류의 사고다.)
//
//   ⚠️ 이 하니스의 요점은 «저장한다» 가 아니라 «저장한 것만 성공이라고 말한다» 이다.
//      화면이 서버 응답과 무관하게 성공을 그리면, 고치기 전과 똑같이 조용히 사라진다.
//
//   검사 —
//     A. 서버로 보낸다        — POST /api/admin/class-schedules
//     B. 유령 학생을 안 만든다 — user_id 를 지어내 보내지 않는다(이름으로 서버가 찾게)
//     C. 요일을 맞춘다        — 화면 0=월…6=일 → 서버 0=일…6=토
//     D. 실패를 삼키지 않는다 — 저장된 개수로 화면을 그리고, 0건이면 성공이라 하지 않는다
//     E. 겹침 확인            — 서버 409 conflict 를 사람에게 묻고 force 로 재시도
//     F. 성향을 기록한다      — 고른 성향이 notes 로 함께 저장된다

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

const html = R('cloudflare-deploy/public/admin/weekly-schedule.html');
const aapi = R('cloudflare-deploy/src/api-admin.ts');

// wizFinalize 본문만 떼어 본다 — 파일 전체에서 찾으면 남의 코드가 통과시켜 준다
const s = html.indexOf('async function wizFinalize');
const e = html.indexOf('window.wizFinalize=wizFinalize;', s);
const blk = (s >= 0 && e > s) ? html.slice(s, e) : '';

console.log('\n════ 💾 신규 학생 등록 마법사 — 진짜 저장 ════');

console.log('\n[ A. 서버로 보낸다 ]');
check('wizFinalize 가 있다 (async)', blk.length > 0);
check('🔴 POST /api/admin/class-schedules 로 보낸다',
  /fetch\('\/api\/admin\/class-schedules'/.test(blk) && /method:'POST'/.test(blk));
check('세션 쿠키를 함께 보낸다 (관리자 세션은 토큰이 아니라 쿠키다)',
  /credentials:'include'/.test(blk));
/* 🪤 예전 코드는 addSlot() «만» 불렀다. addSlot 은 지금도 화면 즉시반영에 쓰지만,
      서버 저장이 끝난 슬롯에만 불러야 한다 — 순서가 뒤집히면 «화면엔 있는데 DB엔 없는» 줄이 남는다. */
check('🔴 addSlot 만 부르고 끝나지 않는다 (저장 성공한 것만 화면에 그린다)',
  /if\(res\.ok\)\{[\s\S]{0,400}addSlot\(/.test(blk));
check('서버가 그 경로를 실제로 받는다 (POST 핸들러 존재)',
  /method === 'POST' && path === '\/api\/admin\/class-schedules'/.test(aapi));

console.log('\n[ B. 유령 학생을 안 만든다 ]');
/* 이 마법사는 이름만 받는데, 예전에는 st_<타임스탬프> 를 지어내 uid 로 썼다.
   그대로 저장하면 명부에 없는 uid 라 어느 화면에서도 그 수업이 안 보인다.
   이름만 보내면 서버가 students_erp 에서 찾고, 없으면 student_not_found 로 거절한다. */
check('🔴 user_id 를 지어내 보내지 않는다', !/user_id\s*:/.test(blk));
check('학생 이름을 보낸다 (서버가 명부에서 찾도록)', /student_name\s*:\s*s\.student\.name/.test(blk));
check('서버가 이름으로 학생을 찾고, 없으면 거절한다',
  /students_erp WHERE korean_name = \? OR username = \?/.test(aapi) && /student_not_found/.test(aapi));

console.log('\n[ C. 요일 번호를 맞춘다 ]');
/* 🪤 이 화면은 0=월…6=일, 서버(class_schedules)는 0=일…6=토 다.
      그대로 보내면 «월요일로 골랐는데 일요일에 잡히는» 사고가 난다
      (CLAUDE.md 「요일 번호 체계를 맞춘다」와 같은 함정). */
check('🔴 (dow+1)%7 로 바꿔 보낸다', /days:\[\(sl\.dow\+1\)%7\]/.test(blk));
check('시작 시각을 HH:MM 으로 만든다', /start_time:pad2\(sl\.hour\)\+':00'/.test(blk));

console.log('\n[ D. 실패를 삼키지 않는다 ]');
check('🔴 저장된 개수로 화면을 그린다 (지어낸 개수 아님)',
  /saved\.length/.test(blk) && !/'개 슬롯이 자동으로 배정되었습니다'/.test(blk));
check('🔴 0건이면 성공이라고 하지 않는다',
  /등록하지 못했습니다/.test(blk) && /서버에 저장된 것이 없습니다/.test(blk));
check('일부만 저장되면 «일부만» 이라고 한다', /일부만 등록됨/.test(blk));
check('실패한 슬롯의 사유를 화면에 적는다', /failed\.map\(/.test(blk));
check('저장하는 동안 «저장 중» 을 보여 준다 (두 번 누름 방지)', /저장 중…/.test(blk));

console.log('\n[ E. 겹침은 사람에게 묻는다 ]');
/* 서버는 학생·강사 시간이 겹치면 409 conflict 로 한 번 되묻는다(force 로 통과).
   묻지 않고 force 를 항상 붙이면 그 안전장치가 통째로 죽는다. */
/* force 는 «조건부» 여야 한다. 항상 붙이면 겹침 확인이 통째로 죽는다.
   첫 호출도 하드코딩 true 가 아니라 지금까지의 forced 상태를 그대로 넘겨야 한다. */
check('🔴 force 를 조건부로만 붙인다', /if\(force\)body\.force=true;/.test(blk));
check('🔴 첫 호출부터 force 를 켜지 않는다',
  /var res=await post\(sl,forced\);/.test(blk) && !/await post\(sl,\s*true\)[\s\S]{0,80}첫/.test(blk));
check('409 conflict 면 확인을 받는다', /res\.status===409[\s\S]{0,120}confirm\(/.test(blk));
check('«그래도» 라고 하면 force 로 다시 보낸다', /forced=true; res=await post\(sl,true\)/.test(blk));
/* 강사 휴가·휴식시간(teacher_unavailable)은 force 로도 못 뚫는다 — 서버 쪽 계약 확인 */
check('강사 근무불가는 force 로도 안 뚫린다 (서버)', /teacher_unavailable/.test(aapi));

console.log('\n[ F. 성향을 기록한다 ]');
check('고른 성향이 notes 로 저장된다',
  /notes:note/.test(blk) && /wizPersonalityLabel/.test(blk));
/* 🙂 성향은 «기록» 이지 «매칭 기준» 이 아니다. 강사 쪽에 성향 자료가 없어서 추천에 못 쓴다.
      화면이 그렇게 보이면 안 되므로 한 줄로 밝혀 두었는지 본다 — 지우면 여기서 걸린다. */
check('🔴 «추천에는 반영되지 않는다» 를 화면에 밝힌다',
  /추천 순서에는 반영되지 않습니다/.test(blk));

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
