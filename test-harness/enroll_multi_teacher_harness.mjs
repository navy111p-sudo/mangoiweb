// enroll_multi_teacher_harness.mjs — 수강신청 등록 「🔀 여러 강사로 배정」 (2026-09-15)
//
// 왜 만들었나
//   사장님 요청: 한 학생을 강사·요일·시간이 다른 여러 건으로 한 번에 등록하고 싶다
//   (예: Kes 강사 화 14:00 + Win 강사 목 14:00) — 지금까지는 행을 통째로 복제해
//   학생 아이디·레벨구분·인원·수업시간·시작일·기간·연락처를 매번 다시 입력해야 했다.
//   서버·enroll-activate.ts 는 한 줄도 안 건드린다 — 화면이 한 행을 조합 수만큼
//   독립 레코드로 미리 쪼개서(_readEnrollmentRows) 이미 있는 다건 등록 경로
//   (addEnrollment 의 records.length > 1 갈래: POST 여러 번 + 각각 확정)로 흘려보낸다.
//
// ⚠️ 문자열 검사로는 «조합을 실제로 몇 건으로 쪼개는가·강사가 진짜 그 조합의 것인가·
//    행의 단일-강사 필드가 정말 무시되는가» 를 못 본다 — CLAUDE.md 2장의 반복된 교훈이다.
//    그래서 판정 함수(_mtbClassifyCombo·_mtbFindDupe·_readEnrollmentRows)를 소스에서
//    오려 내(중괄호 짝) 가짜 DOM/데이터로 **실제로 돌린다.**
//
// 짝 검사(한쪽만 두면 헛돈다):
//   「계획이 있으면 조합 수만큼 쪼갠다」        ↔ 「계획이 없으면 예전처럼 1건」
//   「계획 JSON 이 깨지면 단일-강사 경로」      ↔ 「정상 계획이면 그대로 쪼갠다」
//   「같은 강사·같은 요일은 막는다」            ↔ 「다른 요일·다른 강사는 막지 않는다」
//   「다른 학생이 여러 명이면 옛 문구」          ↔ 「한 학생이 여러 건이면 새 문구」
//
// 실행: node test-harness/enroll_multi_teacher_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = p => readFileSync(join(__dir, '..', p), 'utf8');
const core = R('cloudflare-deploy/public/js/adm-core.js');
const css = R('cloudflare-deploy/public/css/admin-inline-c.css');

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✅ ' + m); }
  else { fail++; console.log('  ❌ ' + m + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* 중괄호 짝으로 함수 몸통 자르기 — 괄호/꺾쇠 깊이가 0인 여는 중괄호만 «진짜 몸통 시작」으로 인정.
   (TS 반환타입·제네릭 안의 { } 를 몸통으로 오인하지 않기 위함 — CLAUDE.md 「중괄호 짝으로 함수
   몸통을 잘랐는데 엉뚱한 조각이 나옴」 항목과 같은 이유. 이 파일은 순수 JS 라 타입은 없지만
   함수 인자 기본값 등에 괄호가 섞일 수 있어 그대로 적용한다.) */
function bodyAt(s, anchor, from = 0) {
  const i = s.indexOf(anchor, from);
  if (i < 0) return '';
  let j = i, paren = 0, angle = 0, start = -1;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === '(') paren++; else if (c === ')') paren--;
    else if (c === '<') angle++; else if (c === '>') angle = Math.max(0, angle - 1);
    else if (c === '{' && paren === 0 && angle === 0) { start = j; break; }
  }
  if (start < 0) return '';
  let d = 0;
  for (let k = start; k < s.length; k++) {
    if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (d === 0) return s.slice(start, k + 1); }
  }
  return '';
}
/* 앵커부터 「몸통 끝」까지 — 함수 선언 전체(function 키워드~닫는 중괄호)를 그대로 돌려준다 */
function fnAt(s, anchor, from = 0) {
  const i = s.indexOf(anchor, from);
  if (i < 0) return '';
  const body = bodyAt(s, anchor, from);
  if (!body) return '';
  const bodyStart = s.indexOf(body, i);
  return s.slice(i, bodyStart + body.length);
}

console.log('════════ 1부. 화면 마크업 — 새 열을 안 만들고 ③ 배정 우선순위 칸 «안» 에 들어갔는가 ════════');
const rowFn = fnAt(core, 'function _addEnrollmentRow(prefill)');
ok(!!rowFn, '_addEnrollmentRow 를 찾았다');
const prioTdM = /'<td class="en-c en-c-prio"[\s\S]*?<\/td>' \+/.exec(rowFn);
const prioTd = prioTdM ? prioTdM[0] : '';
ok(!!prioTd, 'en-c-prio <td> 블록(문자열 조립부)을 찾았다');
ok(/en-row-multi-teacher-btn/.test(prioTd), '🔀 버튼이 en-c-prio 칸 «안» 에 있다 (새 <td> 를 안 만들었다 — 12칸 그리드 합 함정 회피)');
ok(/en-row-multi-teacher-summary/.test(prioTd), '요약 줄도 같은 칸 안에 있다');
const colClasses = [...new Set([...rowFn.matchAll(/class="en-c en-c-([a-z]+)"/g)].map(m => 'en-c-' + m[1]))];
const knownCols = ['en-c-num', 'en-c-uid', 'en-c-type', 'en-c-prio', 'en-c-day', 'en-c-time', 'en-c-classmin', 'en-c-size', 'en-c-start', 'en-c-dur', 'en-c-phone', 'en-c-del'];
ok(colClasses.length > 0 && colClasses.every(c => knownCols.includes(c)), '⛔ 새 en-c-* 열(칸)을 만들지 않았다 — 기존 칸 이름뿐', colClasses);

console.log('\n════════ 2부. 버튼 배선 + 행 초기화 때 계획도 함께 지워지는가 ════════');
ok(/en-row-multi-teacher-btn'\)\.addEventListener\('click'/.test(rowFn), '🔀 버튼에 click 리스너가 달렸다');
ok(/_openMultiTeacherBuilder\(tr\)/.test(rowFn), '그 리스너가 _openMultiTeacherBuilder 를 부른다');
ok(/_enRenderMultiTeacherSummary\(tr\)/.test(rowFn), '행을 만들 때 요약을 한 번 그린다(프리필로 만든 행도 안전)');
const resetBlockM = /if \(tbody\.children\.length <= 1\) \{[\s\S]*?\} else \{/.exec(rowFn);
const resetBlock = resetBlockM ? resetBlockM[0] : '';
ok(!!resetBlock, '행 리셋(✕, 마지막 1행) 블록을 찾았다');
ok(/delete tr\.dataset\.enMultiTeacherPlan/.test(resetBlock), '리셋 시 dataset.enMultiTeacherPlan 을 지운다 — 안 지우면 «비운 행» 인데 옛 계획이 살아남는다');
ok(/classList\.remove\('en-row-multi-active'\)/.test(resetBlock), '리셋 시 en-row-multi-active 클래스도 뗀다');
ok(resetBlock.includes('en-row-multi-teacher-summary') && /textContent = ''/.test(resetBlock.slice(resetBlock.indexOf('en-row-multi-teacher-summary'))), '리셋 시 요약 줄도 비운다');

console.log('\n════════ 3부. CSS — 전역 인디고 알약 함정을 .en-row-time-builder 선례와 같은 방식으로 피했는가 ════════');
const btnCssM = /#en-multi-table td button\.en-row-multi-teacher-btn \{([\s\S]*?)\n {2}\}/.exec(css);
const btnCss = btnCssM ? btnCssM[1] : '';
ok(!!btnCss, '.en-row-multi-teacher-btn 전용 CSS 규칙을 찾았다');
['background', 'border', 'color', 'font-size', 'padding'].forEach(prop => {
  const re = new RegExp(prop + '\\s*:[^;]*!important');
  ok(re.test(btnCss), 'ID 접두 규칙이 ' + prop + ' 을 !important 로 되살린다(안 그러면 전역 details.menu-card button 룰이 이겨 큰 파란 알약이 된다)');
});
const btnHoverM = /#en-multi-table td button\.en-row-multi-teacher-btn:hover \{([\s\S]*?)\n {2}\}/.exec(css);
const btnHover = btnHoverM ? btnHoverM[1] : '';
ok(!!btnHover, 'hover 규칙도 있다');
ok(/transform\s*:\s*none\s*!important/.test(btnHover) && /box-shadow\s*:\s*none\s*!important/.test(btnHover), '⛔ hover 확대 금지 — transform·box-shadow 모두 none !important (1-3 규칙)');
const dimBlockM = /#en-multi-table tr\.en-row-multi-active[\s\S]*?\{([\s\S]*?)\n {2}\}/.exec(css);
const dimSelAll = dimBlockM ? dimBlockM[0] : '';
const dimCss = dimBlockM ? dimBlockM[1] : '';
ok(!!dimBlockM, 'tr.en-row-multi-active 흐림 규칙을 찾았다');
ok(/select\.en-row-priority/.test(dimSelAll) && /select\.en-row-teacher/.test(dimSelAll) && /td\.en-c-day/.test(dimSelAll) && /td\.en-c-time/.test(dimSelAll), '흐림 대상 네 곳(우선순위·강사·요일·시간)을 정확히 겨눈다');
ok(/pointer-events\s*:\s*none\s*!important/.test(dimCss), '손도 뗀다(pointer-events:none) — 안 그러면 흐려 보여도 계속 눌린다');

console.log('\n════════ 4부. _mtbClassifyCombo — 실제로 돌려 빈/미완성/유효 판정 ════════');
const tbTimeToPartsSrc = fnAt(core, 'function _tbTimeToParts(t)');
const classifySrc = fnAt(core, 'function _mtbClassifyCombo(teacher, days, timeRaw)');
ok(!!tbTimeToPartsSrc, '_tbTimeToParts 를 찾았다');
ok(!!classifySrc, '_mtbClassifyCombo 를 찾았다');
let classify = null;
try {
  classify = new Function(tbTimeToPartsSrc + '\n' + classifySrc + '\nreturn _mtbClassifyCombo;')();
} catch (e) { ok(false, '_mtbClassifyCombo 를 실제로 컴파일했다: ' + e.message); }

if (classify) {
  ok(classify('', [], '').kind === 'empty', '아무것도 안 채우면 «빈 조합»');
  ok(classify('  ', [], '  ').kind === 'empty', '공백만 채워도 «빈 조합»(트림 후 빈 값)');
  ok(classify('Kes', [], '').kind === 'partial', '강사만 고르고 요일·시간이 없으면 «미완성»');
  ok(classify('', ['tue'], '').kind === 'partial', '요일만 고르면 «미완성»');
  ok(classify('', [], '14:00').kind === 'partial', '시간만 채워도 «미완성»');
  ok(classify('Kes', ['tue'], '   ').kind === 'partial', '강사·요일은 있는데 시간이 공백뿐이면 «미완성»(트림 후 빈 문자열)');
  ok(classify('Kes', ['tue'], 'abc').kind === 'partial', '시간이 숫자 형식이 아니면 «미완성»');
  ok(classify('Kes', ['tue'], '9:5').kind === 'partial', '분이 한 자리(9:5)면 형식 불일치로 «미완성» — HH:MM 두 자리를 요구한다(요일별 시간 빌더가 만들어 주는 값과 같은 모양)');
  const r = classify(' Kes ', ['tue', 'thu'], '9:00');
  ok(!!r && r.kind === 'valid', '강사·요일·시간이 다 있으면 «유효»');
  if (r && r.kind === 'valid') {
    ok(r.combo.teacher === 'Kes', '강사 이름은 앞뒤 공백을 트림한다');
    ok(JSON.stringify(r.combo.days) === JSON.stringify(['tue', 'thu']), '요일 배열을 그대로 담는다(한 조합에 여러 날)');
    ok(r.combo.time === '09:00', '시간은 _tbTimeToParts 로 정규화된다(9:00 → 09:00, 기존 요일별 시간 빌더와 같은 규칙 재사용)');
  }
}

console.log('\n════════ 5부. _mtbFindDupe — 실제로 돌려 같은 강사·같은 요일 중복 판정 ════════');
const dupeSrc = fnAt(core, 'function _mtbFindDupe(combos)');
ok(!!dupeSrc, '_mtbFindDupe 를 찾았다');
let findDupe = null;
try { findDupe = new Function(dupeSrc + '\nreturn _mtbFindDupe;')(); }
catch (e) { ok(false, '_mtbFindDupe 를 실제로 컴파일했다: ' + e.message); }
if (findDupe) {
  ok(findDupe([]) === null, '빈 목록 — 중복 없음');
  ok(findDupe([{ teacher: 'Kes', days: ['tue'] }, { teacher: 'Win', days: ['tue'] }]) === null, '강사가 다르면 같은 요일이어도 중복 아님');
  ok(findDupe([{ teacher: 'Kes', days: ['tue'] }, { teacher: 'Kes', days: ['thu'] }]) === null, '짝: 같은 강사여도 요일이 다르면 중복 아님(화요일 한 시간·목요일 다른 시간 — 정당한 사용)');
  const d = findDupe([{ teacher: 'Kes', days: ['tue', 'thu'] }, { teacher: 'Kes', days: ['tue'] }]);
  ok(!!d && d.teacher === 'Kes' && d.day === 'tue' && d.dayKo === '화', '같은 강사·같은 요일이 두 콤보에 걸치면 잡아낸다(화요일)');
}

console.log('\n════════ 6부. _readEnrollmentRows — 계획이 있으면 조합 수만큼 «실제로» 쪼개지는가 ════════');
const readSrc = fnAt(core, 'function _readEnrollmentRows()');
const addMonthsSrc = fnAt(core, 'function _enAddMonths(startISO, months)');
ok(!!readSrc, '_readEnrollmentRows 를 찾았다');
ok(!!addMonthsSrc, '_enAddMonths 를 찾았다');

function field(v) { return { value: v == null ? '' : String(v) }; }
function makeRow(v) {
  const one = {
    '.en-row-uid': field(v.uid), '.en-row-name': field(v.name), '.en-row-package': field(v.pkg),
    '.en-row-fee': field(v.fee), '.en-row-start': field(v.start), '.en-row-time': field(v.time),
    '.en-row-size': field(v.size), '.en-row-classmin': field(v.classmin === undefined ? 20 : v.classmin),
    '.en-row-priority': field(v.priority || 'schedule'), '.en-row-teacher': field(v.teacher),
    '.en-row-duration': field(v.duration), '.en-row-phone': field(v.phone),
  };
  const many = {
    '.en-row-type:checked': (v.types || []).map(t => ({ value: t })),
    '.en-row-day:checked': (v.days || []).map(d => ({ value: d })),
  };
  const ds = {};
  if (v.multiPlan !== undefined) ds.enMultiTeacherPlan = v.multiPlan;
  return {
    dataset: ds,
    querySelector(sel) { return Object.prototype.hasOwnProperty.call(one, sel) ? one[sel] : null; },
    querySelectorAll(sel) { return Object.prototype.hasOwnProperty.call(many, sel) ? many[sel] : []; },
  };
}
function runRead(rows) {
  const document = { querySelectorAll(sel) { return sel === '#en-multi-rows tr' ? rows : []; } };
  const addMonthsFn = new Function(addMonthsSrc + '\nreturn _enAddMonths;')();
  const readFn = new Function('document', '_enAddMonths', readSrc + '\nreturn _readEnrollmentRows;')(document, addMonthsFn);
  return readFn();
}

if (readSrc && addMonthsSrc) {
  try {
    // A. 계획 없는 평범한 행 — 예전과 완전히 같은 결과여야 한다(짝의 기준선)
    const rowA = makeRow({
      uid: 'stu01', name: '홍길동', start: '2026-09-20', time: '14:00', size: '1:1',
      classmin: 30, priority: 'schedule', teacher: '', duration: '3', phone: '01012345678',
      types: ['regular'], days: ['tue'],
    });
    let out = runRead([rowA]);
    ok(out.length === 1, 'A. 계획 없는 행 → 레코드 1건(예전 그대로)');
    ok(out[0] && out[0].teacher_name === null, 'A. 「요일·시간 우선」이면 teacher_name 은 안 보낸다');
    ok(out[0] && out[0].days_of_week === '화' && out[0].time === '14:00', 'A. 요일·시간이 단일 필드에서 그대로 온다');
    ok(out[0] && out[0].assign_priority === 'schedule', 'A. 우선순위도 행의 값 그대로');

    // B. 2개 조합 계획 — 단일 필드에는 일부러 «다른» 값을 넣어 진짜 무시되는지 확인
    const comboPlan = JSON.stringify([
      { teacher: 'Kes', days: ['tue'], time: '14:00' },
      { teacher: 'Win', days: ['thu'], time: '15:00' },
    ]);
    const rowB = makeRow({
      uid: 'stu02', name: '김철수', start: '2026-09-20', time: 'IGNORED', size: '1:1',
      classmin: 40, priority: 'schedule', teacher: 'IGNORED', duration: '6', phone: '01099998888',
      types: ['regular'], days: ['mon'], multiPlan: comboPlan,
    });
    out = runRead([rowB]);
    ok(out.length === 2, 'B. 2개 조합 계획 → 레코드 2건으로 실제로 쪼개진다');
    ok(!!out[0] && out[0].teacher_name === 'Kes' && out[0].days_of_week === '화' && out[0].time === '14:00', 'B-1. 1번째 조합 — Kes·화·14:00');
    ok(!!out[1] && out[1].teacher_name === 'Win' && out[1].days_of_week === '목' && out[1].time === '15:00', 'B-2. 2번째 조합 — Win·목·15:00');
    ok(!!out[0] && !!out[1] && out[0].assign_priority === 'teacher' && out[1].assign_priority === 'teacher', 'B-3. 두 건 다 「강사 우선」으로 강제된다(행의 단일 priority=schedule 은 무시)');
    ok(!!out[0] && !!out[1] && out[0].student_user_id === 'stu02' && out[1].student_user_id === 'stu02', 'B-4. 두 건 다 같은 학생');
    ok(!!out[0] && !!out[1] && out[0].duration_min === 40 && out[1].duration_min === 40, 'B-5. 수업 시간(분)은 두 건에 공유된다');
    ok(!!out[0] && !!out[1] && out[0].duration_months === '6' && out[1].duration_months === '6' && out[0].end_date === out[1].end_date && out[0].end_date === '2027-03-20', 'B-6. 수업 기간·종료일도 공유되고 정확히 계산된다(시작+6개월)');
    ok(!!out[0] && !!out[1] && out[0].parent_phone === '01099998888' && out[1].parent_phone === '01099998888', 'B-7. 연락처도 두 건에 공유된다');

    // C~E. 계획 값이 이상해도 예외 없이 단일-강사 경로로 안전하게 떨어진다(A 와 짝)
    const rowC = makeRow({ uid: 'stu03', name: 'C', types: ['level'], days: ['wed'], time: '10:00', priority: 'schedule', multiPlan: '{not valid json' });
    out = runRead([rowC]);
    ok(out.length === 1 && out[0] && out[0].days_of_week === '수', 'C. 계획 JSON 이 깨졌으면 예외 없이 단일-강사 경로로 떨어진다(짝: A)');

    const rowD = makeRow({ uid: 'stu04', name: 'D', types: ['level'], days: ['fri'], time: '11:00', priority: 'schedule', multiPlan: '{"teacher":"x"}' });
    out = runRead([rowD]);
    ok(out.length === 1 && out[0] && out[0].days_of_week === '금', 'D. 계획이 배열이 아니면 단일-강사 경로로 떨어진다');

    const rowE = makeRow({ uid: 'stu05', name: 'E', types: ['level'], days: ['sat'], time: '12:00', priority: 'schedule', multiPlan: '[]' });
    out = runRead([rowE]);
    ok(out.length === 1 && out[0] && out[0].days_of_week === '토', 'E. 계획이 빈 배열이면 단일-강사 경로로 떨어진다');

    // G. 아이디·유형·패키지가 전부 빈 행은 계획이 있어도 건너뛴다(기존 빈 행 규칙이 그대로 이긴다)
    const rowG = makeRow({ uid: '', name: '', types: [], days: [], multiPlan: JSON.stringify([{ teacher: 'Kes', days: ['tue'], time: '14:00' }]) });
    out = runRead([rowG]);
    ok(out.length === 0, 'G. 아이디·유형·패키지가 전부 비면 계획이 있어도 건너뛴다(예전 빈 행 규칙 그대로)');

    // H. 평범한 행 + 계획 행이 섞이면 addEnrollment 의 다건 등록 경로가 받을 총 건수가 맞는가
    out = runRead([rowA, rowB]);
    ok(out.length === 3, 'H. 여러 행이 섞이면(1건 + 2건 계획) 합쳐서 3건 — addEnrollment 의 기존 다건 경로가 그대로 받는다');
  } catch (e) {
    ok(false, '6부 실행이 던졌다(오려내기 실패 또는 문법 변이): ' + e.message);
  }
}

console.log('\n════════ 7부. 일괄 등록 확인창 — 「N명 학생」 이라고 거짓말하지 않는가 ════════');
const uidStart = core.indexOf('const _enUniqUids = new Set');
const uidEnd = core.indexOf('if (!confirm(_enConfirmMsg))');
ok(uidStart >= 0 && uidEnd > uidStart, '확인창 문구 계산 코드를 찾았다');
if (uidStart >= 0 && uidEnd > uidStart) {
  const msgSnippet = core.slice(uidStart, uidEnd);
  const confirmMsgFor = (records, adminLang) => {
    try { return new Function('records', 'adminLang', msgSnippet + '\nreturn _enConfirmMsg;')(records, adminLang); }
    catch (e) { return '__THREW__:' + e.message; }
  };
  const sameStudent = [{ student_user_id: 'stu02' }, { student_user_id: 'stu02' }];
  const diffStudents = [{ student_user_id: 'stu10' }, { student_user_id: 'stu11' }];
  ok(confirmMsgFor(sameStudent, 'ko') === '1명 학생에게 총 2건의 수업을 나눠 등록하시겠습니까?', '한글 · 한 학생이 2건으로 쪼개졌을 때 — 「2명 학생」이라 거짓말하지 않는다');
  ok(confirmMsgFor(diffStudents, 'ko') === '2명 학생을 동시에 등록하시겠습니까?', '짝: 한글 · 서로 다른 학생 2명이면 예전 문구 그대로');
  ok(confirmMsgFor(sameStudent, 'en') === 'Register 2 enrollment(s) for 1 student(s) at once?', '영어 · 한 학생 2건');
  ok(confirmMsgFor(diffStudents, 'en') === 'Register 2 students at once?', '짝: 영어 · 다른 학생 2명이면 예전 문구 그대로');
  const missingUid = [{ student_user_id: null }, { student_user_id: null }];
  const m = confirmMsgFor(missingUid, 'ko');
  ok(typeof m === 'string' && !m.startsWith('__THREW__'), 'student_user_id 가 없는 레코드가 섞여도 던지지 않는다(addEnrollment 의 필수값 검사가 이 앞에서 이미 막아 실제로는 안 일어나지만, 방어적으로도 안전해야 한다)');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
