// -*- coding: utf-8 -*-
// 🧾 「NEW TEACHER'S PAGE PROBLEM」(마이마이, 2026-08-08) 하네스
//   실행: node test-harness/teacher_page_feedback_260808_harness.mjs
//
//   원 문서의 12개 항목 중 «코드로 확인할 수 있는 것» 만 여기서 지킨다.
//   (RAM 증설은 하드웨어, 「휴식시간이 영구 고정되나?」는 질문이라 검사 대상이 아니다)
//
//   ⚠️ 이 파일은 «글자가 그대로 있는지» 가 아니라 «그 규칙이 지켜지는지» 를 보게 쓴다.
//      글자를 박아 두면 옳은 리팩터링이 하네스를 깨서, 고친 사람이 되돌리게 된다.
//      (실제로 2026-08-08 레벨테스트 하네스가 그렇게 깨졌다)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const tapi   = rd('../cloudflare-deploy/src/api-teacher.ts');
const mapi   = rd('../cloudflare-deploy/src/api-mango.ts');
const ticket = rd('../cloudflare-deploy/src/leveltest-ticket.ts');
const aapi   = rd('../cloudflare-deploy/src/api-admin.ts');
const thtml  = rd('../cloudflare-deploy/public/teacher.html');
const mypage = rd('../cloudflare-deploy/public/admin/mypage.html');
const q6     = rd('../cloudflare-deploy/public/js/adm-q6.js');
const ahtml  = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}
/** 소스에서 `const NAME = <숫자> * 60 * 1000` 을 분으로 읽는다. */
function minsOf(src, name) {
  const m = src.match(new RegExp(`${name}\\s*=\\s*(\\d+)\\s*\\*\\s*60\\s*\\*\\s*1000`));
  return m ? Number(m[1]) : null;
}

console.log('\n[ ⑤ 수업 전에 방을 열어 교재를 준비할 수 있다 ]');
/* 마이마이: "Can class be open even before the class? So teachers can enter early and prepare the book."
   그리고 그 전에 고쳐야 할 게 있었다 — 2026-08-07 레벨테스트 창을 30분으로 넓힐 때
   학생(api-mango)·티켓(leveltest-ticket)만 바뀌고 **강사(api-teacher)는 10분에 남아**,
   레벨테스트에서 학생이 먼저 들어와 20분 동안 빈 방에 앉아 있게 돼 있었다. */
const tOpen   = minsOf(tapi, 'OPEN_BEFORE');
const tOpenLT = minsOf(tapi, 'OPEN_BEFORE_LEVELTEST');
const sOpen   = minsOf(mapi, 'OPEN_BEFORE');
const sOpenLT = minsOf(mapi, 'OPEN_BEFORE_LEVELTEST');
const kOpenLT = minsOf(ticket, 'OPEN_BEFORE_MS');

check('강사 정규수업 입장창을 읽을 수 있다', tOpen !== null);
check('강사가 학생보다 **먼저(또는 같이)** 들어갈 수 있다 — 정규수업', tOpen !== null && sOpen !== null && tOpen >= sOpen);
check('🔴 레벨테스트도 강사가 늦지 않는다 (이게 어긋나면 학생만 빈 방에 앉는다)',
  tOpenLT !== null && sOpenLT !== null && tOpenLT >= sOpenLT);
check('레벨테스트 티켓과 학생 서버가 같은 값 (티켓엔 버튼이 뜨는데 서버가 안 열어주면 안 된다)',
  kOpenLT !== null && sOpenLT !== null && kOpenLT === sOpenLT);
check('강사는 교재 준비 시간을 실제로 갖는다 (정규수업에서 학생보다 먼저)', tOpen !== null && sOpen !== null && tOpen > sOpen);
check('⛔ 학생 정규수업 입장창은 건드리지 않았다 (학생 29,000명 전체가 영향)', sOpen === 10);
check('레벨테스트는 유형별로 창을 갈라 계산한다',
  /_kind === 'level_test' \? OPEN_BEFORE_LEVELTEST : OPEN_BEFORE/.test(tapi));
check('화면이 «미리 준비» 를 안내한다', /Prep now/.test(thtml) && /교재를 미리 열어 두세요/.test(thtml));
check('안내는 수업 시작 전에만 뜬다 (수업 중엔 방해)', /if \(open && !live && c\.open_lead_min/.test(thtml));
check('lead 값이 없는 옛 응답에서는 안내를 지어내지 않는다',
  /c\.open_lead_min && c\.student_open_lead_min/.test(thtml));

console.log('\n[ ④ 강사 페이지의 «연기» 버튼을 없앴다 ]');
/* "Remove postpone option at teacher's page, they might postpone it by themselves or
    accidentally postpone it. Managers and students can only postpone"
   [사실관계] 이 버튼은 원래도 «요청 → 매니저 승인» 이라 강사 혼자 옮길 수는 없었다.
   다만 [수업 입장] 바로 옆이라 **오탭 위험**은 진짜였다 → 오늘 목록에서만 뺀다. */
check('오늘 수업 줄에 연기 버튼을 그리지 않는다', !/data-post="' \+ i \+ '"/.test(thtml));
check('연기 요청 «경로» 자체는 남아 있다 (아플 때 알릴 길까지 막지 않는다) — 마이페이지',
  /sr-submit/.test(mypage) && /schedule-requests/.test(mypage));
check('되살릴 수 있게 openPostpone 은 지우지 않았다', /function openPostpone\(c\)/.test(thtml));

console.log('\n[ ③ 오늘 목록에 정규·체험·레벨테스트가 한 화면에 ]');
check('서버가 수업 유형을 한 곳에서 판정한다 (복제 금지)',
  /const classKindOf = \(s: any\): ClassKind/.test(tapi));
check('유형 4가지를 모두 구분한다', /'level_test'/.test(tapi) && /ct === 'trial'/.test(tapi) && /ct === 'makeup'/.test(tapi));
check('서버가 class_kind 를 내려준다', /class_kind: _kind/.test(tapi));
check('오늘·앞으로·주간 세 목록이 모두 class_kind 를 싣는다',
  (tapi.match(/class_kind:/g) || []).length >= 3);
check('화면 배지도 한 함수에서 나온다', /function kindPill\(c\)/.test(thtml));
check('세 목록이 모두 그 함수를 쓴다', (thtml.match(/kindPill\(/g) || []).length >= 4);
check('배지 색이 정의돼 있다', /\.pill\.p-trial\{/.test(thtml) && /\.pill\.p-makeup\{/.test(thtml));
check('정규수업엔 배지를 안 붙인다 (전부 붙이면 특별한 수업이 묻힌다)',
  /return '';\s*\/\/ 정규수업/.test(thtml));
check('배지가 한/영 둘 다', /T\('TRIAL','체험수업'\)/.test(thtml) && /T\('MAKE-UP','보강수업'\)/.test(thtml));

console.log('\n[ ② 수업료 — 상태에 «연기» 가 있다 ]');
/* "For class fee, Please include: Lesson time / Student / Status / Deductions"
   시간·학생·상태·공제 열은 이미 있었다. 없던 건 **연기(postpone) 상태** 하나다.
   그리고 그 구멍 때문에 두 가지가 조용히 잘못돼 있었다(아래 두 검사). */
check('연기된 수업을 상태로 잡는다', /schedStatus === 'postponed'/.test(aapi));
check('🔴 하지 않은 수업에 «피드백 미작성» 공제가 붙지 않는다',
  /if \(st === 'finish'\) \{\s*\n\s*fbOk =/.test(aapi));
check('연기 지급률이 «정책 값» 으로 빠져 있다 (코드에 금액을 박지 않는다)',
  /postponed_pay_percent/.test(aapi) && /const postponePct/.test(aapi));
check('🔴 규칙이 없는 옛 DB에서 급여가 0 이 되지 않는다 (기본 100%)',
  /rules\.postponed_pay_percent\s*\n?\s*\? \(rules\.postponed_pay_percent\.enabled \? [^:]+: 100\)\s*\n?\s*: 100/.test(aapi));
check('요약에 연기 건수가 잡힌다', /postponed_count/.test(aapi));
check('화면에 연기 배지가 있다', /postponed:\s*\[en\?'⏸ Postponed'/.test(mypage));
check('연기 0건이면 타일을 안 만든다 (늘 0인 칸은 잡음)', /s\.postponed_count \? tile\('⏸/.test(mypage));
check('수업 유형이 사람 말로 나온다 (level_test 같은 개발자 글자 금지)',
  /function typeLabel\(v\)/.test(mypage) && /typeLabel\(l\.lesson_type\)/.test(mypage));
check('모르는 유형은 지어내지 않고 그대로 보여준다', /return String\(v\);/.test(mypage));

console.log('\n[ ⑩ 매니저가 주간 캘린더에서 그 시간을 막을 수 있다 ]');
/* "is it possible for Managers to block the time especially if the teacher can't do the
    class if she's on undertime" — 막는 기능(teacher_unavailability)은 원래 있었지만
    주간 캘린더가 그걸 **읽지 않아서**, 막아 놓고도 캘린더엔 빈칸으로 보였다. */
check('주간 캘린더 API 가 휴식시간도 함께 내려준다',
  /FROM teacher_unavailability/.test(aapi) && /source: 'unavailability'/.test(aapi));
check('매주 반복 차단을 그 주 날짜로 펼친다', /dowIdxToKey\[Number\(b\.day_of_week\)\]/.test(aapi));
check('🔴 휴식시간에는 id 를 안 준다 (수업 id 와 겹쳐 엉뚱한 수업이 이동한다)',
  /block_id: b\.id,/.test(aapi) && !/\n\s+id: b\.id,/.test(aapi));
check('휴식시간 조회가 실패해도 수업 캘린더는 그려진다', /catch \{ \/\* 휴식시간 조회 실패가/.test(aapi));
check('화면에서 휴식시간은 드래그 금지', /var canDrag\s*=\s*\(s\.source !== 'unavailability'\)/.test(q6));
check('빈 칸 클릭으로 차단을 만든다', /teacher-unavailability/.test(q6) && /ph54-cal-col/.test(q6));
check('강사를 고른 뒤에만 차단할 수 있다 (전체 보기에선 누구를 막을지 모른다)',
  /if \(calTrack0 && filterId\)/.test(q6));
/* ⚠️ (2026-08-07) 예전엔 `window.prompt(`+`window.confirm(` **글자** 를 찾았다.
   그러다 입력창을 «시작·종료를 직접 고르는 작은 창»(요청 ⑮)으로 바꾸자, 동작은 더 나아졌는데
   하네스가 깨졌다. 검사를 «그 함수를 썼는가» 가 아니라 **규칙**으로 다시 쓴다:
     ① 사유를 받을 자리가 있고, ② 사람이 한 번 더 눌러야 저장된다(즉시 저장 금지). */
check('되돌릴 수 없게 만들지 않는다 — 사유 입력 + 확인을 거친다',
  (/window\.prompt\(/.test(q6) || /ph54-blk-reason/.test(q6))
  && (/window\.confirm\(/.test(q6) || /ph54-blk-ok/.test(q6)));
check('차단 창이 저장을 직접 하지 않는다 (저장 경로는 한 곳)',
  !/function ph54BlockDialog\([\s\S]*?\n  }\n/.test(q6)
  || !/function ph54BlockDialog\(([\s\S]*?)\n  }\n/.exec(q6)[1].includes('fetch('));
check('🔴 요일 번호 체계를 맞춘다 (캘린더 0=월 → DB 0=일)', /\(colIdx \+ 1\) % 7/.test(q6));
check('저장 후 서버에서 다시 읽어 반영한다 (화면만 바뀌는 착시 금지)',
  /await ph54LoadRecords\(\);\s*\n?\s*\/\/ 서버에서 다시 읽어|ph54LoadRecords\(\);[\s\S]{0,80}ph54Render\(\)/.test(q6));
// 규칙: 카드 이름칸이 «사유» 를 먼저 쓴다(문구 자체는 언어에 따라 달라질 수 있다).
check('막힌 이유를 카드에 보여준다 (모르면 매니저가 그냥 지운다)',
  /nameTxt\s*=\s*isBlock\s*\?\s*\(s\.reason\s*\|\|/.test(q6));

console.log('\n[ ⑦ 메뉴를 고르면 화면 «왼쪽» 이 보인다 ]');
/* "The middle still shows every time we select an option sir, not the left most part."
   2026-07-27 에 이미 한 번 고쳤는데 증상이 남았다 — 그 수정은 «즉시 한 번» 만 0 으로 돌려서,
   behavior:'smooth' 인 호출에서는 그 뒤 애니메이션이 다시 가운데로 끌고 갔다. */
check('스크롤이 멎을 때까지 왼쪽을 붙잡는다', /function holdLeft\(el\)/.test(ahtml));
check('🔴 손을 떼는 시한이 있다 (없으면 가로 스크롤을 영영 못 한다)',
  /var until = Date\.now\(\) \+ \d+/.test(ahtml) && /if \(Date\.now\(\) < until\)/.test(ahtml));
check('사용자가 직접 밀면 즉시 손을 뗀다', /'wheel', release/.test(ahtml));
check('🔴 리스너를 쌓아 두지 않는다 (메뉴를 누를 때마다 누적되면 안 된다)',
  /window\.removeEventListener\('wheel', release\)/.test(ahtml)
  && /window\.removeEventListener\('keydown', release\)/.test(ahtml));
check('붙잡기가 겹치지 않는다 (메뉴를 연달아 눌러도 하나만)',
  /if \(holdRelease\) holdRelease\(\);/.test(ahtml));
check('scrollIntoView 를 안 거치는 해시 이동도 잡는다', /'hashchange'/.test(ahtml) && /isMenuCard\(el\)\) holdLeft/.test(ahtml));
check('메뉴 카드가 아닌 요소는 손대지 않는다 (가로 스크롤 표·캐러셀 부작용 방지)',
  /if \(isMenuCard\(this\)\) holdLeft\(this\)/.test(ahtml));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
