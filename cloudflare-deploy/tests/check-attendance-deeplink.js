// check-attendance-deeplink.js — AI 운영비서 '출결 세부 딥링크' 점검 (의존성 없음)
// 실행: node tests/check-attendance-deeplink.js   (또는 test-deeplink.bat 더블클릭)
// admin.html 에 강사명/모드까지 읽어 출석현황(수업당 출결) 카드로 이동하는 로직이 살아있는지 확인.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'public', 'admin.html');
let html = '';
try { html = fs.readFileSync(FILE, 'utf8'); }
catch (e) { console.error('FAIL  admin.html 을 읽을 수 없습니다:', e.message); process.exit(1); }

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { console.log('PASS  ' + name); pass++; }
  else { console.log('FAIL  ' + name); fail++; }
}

// 1) 딥링크 헬퍼 존재
check('caEnsureInit() 초기화 헬퍼 존재', /function\s+caEnsureInit\s*\(/.test(html));
check('window.caAttendanceFromQuery 딥링크 함수 존재', /window\.caAttendanceFromQuery\s*=/.test(html));

// 2) 헬퍼가 강사 선택 + 모드 전환 + 카드 오픈을 수행
const helper = (html.match(/window\.caAttendanceFromQuery[\s\S]*?\n  \};/) || [''])[0];
check('헬퍼가 강사 목록(_caTeachers)과 대조해 매칭', /_caTeachers/.test(helper) && /indexOf/.test(helper));
check('헬퍼가 #ca-teacher 셀렉트 값을 설정', /getElementById\(['"]ca-teacher['"]\)/.test(helper));
check('헬퍼가 보기 모드(그래프/날짜별/강사·날짜별) 판정', /그래프|chart/.test(helper) && /날짜별/.test(helper) && /byTeacherDate/.test(helper));
check('헬퍼가 caSetMode 로 보기 전환', /caSetMode/.test(helper));
check('헬퍼가 카드를 열고(card.open) 결과 객체를 반환', /card\.open\s*=\s*true/.test(helper) && /return\s*\{[\s\S]*found/.test(helper));

// 3) 출결 리졸버가 caAttendanceFromQuery 로 출석현황 딥링크를 수행
check('출결 의도 → caAttendanceFromQuery 로 출석현황 딥링크', /window\.caAttendanceFromQuery\(s\)/.test(html));
check('출결 라벨에 강사명/출석현황 포함', /강사 출석현황\(수업당 출결\)|출석현황\(수업당 출결\)/.test(html));
check('급여 질문은 출결 리졸버에서 제외(오작동 방지)', /!\/급여\|월월?급\|봉급\|payroll\|salary\/i\.test\(s\)/.test(html) || /!\/급여\|월급\|봉급\|payroll\|salary\/i\.test\(s\)/.test(html));

// 4) 대상 카드/요소가 실제로 존재
check('출석현황 카드(card-class-attendance) 존재', /id="card-class-attendance"/.test(html));
check('강사 필터 셀렉트(#ca-teacher) 존재', /id="ca-teacher"/.test(html));
check('보기모드 버튼(caSetMode) 존재', /onclick="caSetMode\(/.test(html));

// 5) "열어 드릴까요?" 확인형 오픈 (관리자·경영진 전용)
check('확인 대기 상태(_miPending) 존재', /var\s+_miPending\s*=/.test(html));
check('긍정 응답 감지(miIsYes) — 응/예/그래/좋아/오케이', /function\s+miIsYes/.test(html) && /응응\?/.test(html) && /오케이/.test(html));
check('부정 응답 감지(miIsNo) 존재', /function\s+miIsNo/.test(html));
check('질문→메뉴 매핑 리졸버(miResolveTarget) 존재', /function\s+miResolveTarget/.test(html));
check('강사명 토큰 추출(miNameToken) 존재', /function\s+miNameToken/.test(html));
check('강사 정보 타깃(miTeacherInfoTarget)+강사관리 카드로 오픈', /function\s+miTeacherInfoTarget/.test(html) && /goCard\(['"]card-teacher-mgmt['"]\)/.test(html));
check('강사목록 행 하이라이트(miHighlightTeacherRow + tp-list-body)', /function\s+miHighlightTeacherRow/.test(html) && /tp-list-body/.test(html));
check('답변 끝에 "열어 드릴까요?" 제안 문구', /열어 드릴까요\? \(예\/아니오\)/.test(html));
check('확인 시 보류 동작 실행(pend.exec)', /pend\.exec\(\)/.test(html));
check('관리자·경영진(또는 미확인)만 확인형 오픈 게이트', /_gate==='admin'\s*\|\|\s*_gate==='guest'/.test(html));
check('식별된 교사/지사/대리점은 제외(miSalaryGate teacher/denied)', /function\s+miSalaryGate/.test(html) && /return 'teacher'/.test(html) && /return 'denied'/.test(html));

console.log('\n결과: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
