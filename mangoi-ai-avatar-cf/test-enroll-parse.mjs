// 🎓 자동 수강등록 파서 회귀 테스트 — 한/영 모두, 오탐(메뉴 안내 질문)까지 검증
//   실행: node test-enroll-parse.mjs   (Node 20+, 외부 의존 없음)
import { enrollParseFields, enrollIntent, enrollMerge, enrollRespond, enrollAffirm, enrollCancel } from './src/index.js';

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? '  → got: ' + JSON.stringify(got) : '')); }
}

// ── 1) 필드 추출 ──
{
  const m = '아이디 jeong01 비번 mango1234 인 Jeong 학생을 강선생님한테 화수목금요일 19시 20분 주4회로 등록해줘';
  const f = enrollParseFields(m);
  ok('id 추출', f.login_id === 'jeong01', f.login_id);
  ok('pw 추출', f.password === 'mango1234', f.password);
  ok('학생명 추출', f.student_name === 'Jeong', f.student_name);
  ok('강사 추출', f.teacher_name === '강선생님', f.teacher_name);
  ok('요일 추출', JSON.stringify(f.days) === '["tue","wed","thu","fri"]', f.days);
  ok('시간 추출', f.time === '19:20', f.time);
  ok('주N회 추출', f.weekly === 4, f.weekly);
  ok('등록 의도', enrollIntent(m, f) === true);
}
// 조사가 붙은 값
{
  const f = enrollParseFields('아이디는 stu_kim 이고 비밀번호는 abcd1234야');
  ok('조사 붙은 id', f.login_id === 'stu_kim', f.login_id);
  ok('조사 붙은 pw', f.password === 'abcd1234', f.password);
}
// 시간 표기 변형
{
  ok('오후 7시 반', enrollParseFields('오후 7시 반').time === '19:30');
  ok('19:20 표기', enrollParseFields('19:20 수업').time === '19:20');
  ok('7:20 pm', enrollParseFields('7:20 pm class').time === '19:20');
  ok('9시(오전 기본)', enrollParseFields('9시에').time === '09:00');
  ok('시간 없음', enrollParseFields('강선생님으로 부탁해').time === '');
}
// 요일 표기 변형 — '수업'의 '수' 같은 오탐이 없어야 한다
{
  ok('월요일 단독', JSON.stringify(enrollParseFields('월요일 수업').days) === '["mon"]', enrollParseFields('월요일 수업').days);
  ok('구분자 요일', JSON.stringify(enrollParseFields('월, 수 로 해줘').days) === '["mon","wed"]', enrollParseFields('월, 수 로 해줘').days);
  ok('영문 요일', JSON.stringify(enrollParseFields('Mon Wed Fri').days) === '["mon","wed","fri"]', enrollParseFields('Mon Wed Fri').days);
  ok('오탐 없음(수업만)', JSON.stringify(enrollParseFields('수업 등록 화면 알려줘').days) === '[]', enrollParseFields('수업 등록 화면 알려줘').days);
  ok('오탐 없음(일정)', JSON.stringify(enrollParseFields('일정 확인해줘').days) === '[]', enrollParseFields('일정 확인해줘').days);
}
// 영어 문장 전체
{
  const m = 'register student Jeong with id jeong01 password mango1234 for teacher Kang on Tue Wed Thu Fri at 19:20';
  const f = enrollParseFields(m);
  ok('EN 학생명(동사 오인 금지)', f.student_name === 'Jeong', f.student_name);
  ok('EN id', f.login_id === 'jeong01', f.login_id);
  ok('EN pw', f.password === 'mango1234', f.password);
  ok('EN 강사', f.teacher_name === 'Kang', f.teacher_name);
  ok('EN 요일', JSON.stringify(f.days) === '["tue","wed","thu","fri"]', f.days);
  ok('EN 시간', f.time === '19:20', f.time);
  ok('EN 의도', enrollIntent(m, f) === true);
}

// 사장님 실사용 문장 (영문 강사명 + '선생님', 비번 오타)
{
  const m = '아이디 test0723 비변 mango1234 인 홍길동 학생, Melca 선생님한테 월수금요일 19시 20분 등록해줘';
  const f = enrollParseFields(m);
  ok('실사용: 아이디', f.login_id === 'test0723', f.login_id);
  ok('실사용: 비번 오타(비변)도 인식', f.password === 'mango1234', f.password);
  ok('실사용: 한글 학생명', f.student_name === '홍길동', f.student_name);
  ok('실사용: 영문 강사 + 선생님', f.teacher_name === 'Melca', f.teacher_name);
  ok('실사용: 요일', JSON.stringify(f.days) === '["mon","wed","fri"]', f.days);
  ok('실사용: 시간', f.time === '19:20', f.time);
  const r = enrollRespond(enrollMerge(null, f), false);
  ok('실사용: 바로 확인카드', r.enroll_ready === true, r.enroll_missing);
}
// 한글 강사는 접미사를 붙여 그대로 (DB 이름이 '강선생님')
ok('한글 강사 유지', enrollParseFields('강선생님한테').teacher_name === '강선생님');

// ── 2) 의도 판별 — 메뉴 위치 질문은 등록으로 새면 안 된다 ──
for (const m of ['수강신청 관리 메뉴 어디 있어?', 'where is the enrollment menu?', '수업 등록은 어떻게 해?', '급여 사용법 알려줘']) {
  ok('오탐 아님: ' + m, enrollIntent(m, enrollParseFields(m)) === false);
}
ok('정보 1개뿐이면 등록 아님', enrollIntent('등록해줘', enrollParseFields('등록해줘')) === false);

// ── 3) 슬롯 채우기(멀티턴) ──
{
  let draft = enrollMerge(null, enrollParseFields('아이디 jeong01 로 등록해줘 19시 20분'));
  let r = enrollRespond(draft, false);
  ok('1턴: 미완성', r.enroll_ready === false && r.enroll_missing.indexOf('teacher_name') >= 0, r.enroll_missing);
  draft = enrollMerge(r.enroll_draft, enrollParseFields('강선생님이고 화수목금요일'));
  r = enrollRespond(draft, false);
  ok('2턴: 완성', r.enroll_ready === true, r.enroll_missing);
  ok('payload 아이디', r.enroll_payload.student.login_id === 'jeong01');
  ok('payload 요일', JSON.stringify(r.enroll_payload.days) === '["tue","wed","thu","fri"]', r.enroll_payload.days);
  ok('payload 시간', r.enroll_payload.time === '19:20');
  ok('기본 수업길이 20분', r.enroll_payload.duration_min === 20);
  ok('비번은 마스킹되어 안내됨', r.answer.indexOf('mango') < 0 && r.answer.indexOf('기존 그대로') >= 0, r.answer);
  const r2 = enrollRespond(enrollMerge(draft, enrollParseFields('비번 mango1234')), false);
  ok('비번 넣어도 평문 노출 없음', r2.answer.indexOf('mango1234') < 0 && r2.answer.indexOf('●') >= 0, r2.answer);
  ok('payload 에는 비번 포함', r2.enroll_payload.student.password === 'mango1234');
}
// 주N회와 요일 수가 어긋나면 경고
{
  const d = enrollMerge(null, enrollParseFields('아이디 a123 강선생님 월요일 10시 주3회 등록'));
  const r = enrollRespond(d, false);
  ok('요일/횟수 불일치 경고', r.enroll_ready === true && r.answer.indexOf('⚠️') >= 0, r.answer);
}
// 영어 응답
{
  const d = enrollMerge(null, enrollParseFields('register id a123 teacher Kang Mon at 10:00'));
  const r = enrollRespond(d, true);
  ok('EN 확인문구', r.enroll_ready === true && /Teacher: Kang/.test(r.answer), r.answer);
}

// ── 4) 확인·취소 ──
for (const y of ['네', '넵', '응', 'yes', 'ok', '등록해줘', 'ㅇㅇ']) ok('확인: ' + y, enrollAffirm(y) === true);
for (const n of ['취소', '아니', 'cancel', 'stop']) ok('취소: ' + n, enrollCancel(n) === true);
ok('확인 아님', enrollAffirm('강선생님으로 바꿔줘') === false);

// 영어 관리자 실사용 — 'teacher: anna' 콜론 표기, 'add a class' 약한 동사
{
  const m = 'add a class for student 정우영, id: jeong, every friday 19:00, 20 min class, teacher: anna';
  const f = enrollParseFields(m);
  ok('EN 콜론 강사명', f.teacher_name === 'anna', f.teacher_name);
  ok('EN 콜론 아이디', f.login_id === 'jeong', f.login_id);
  ok('EN friday', JSON.stringify(f.days) === '["fri"]', f.days);
  ok('EN 19:00', f.time === '19:00', f.time);
  ok("EN 'add a class' 도 등록 의도", enrollIntent(m, f) === true);
}
// 약한 동사라도 수업/레슨이 없으면 등록 아님 (메뉴 안내와 구분)
for (const m of ['add a new teacher', 'schedule menu please', 'where can I add students?']) {
  ok('약한 동사 오탐 아님: ' + m, enrollIntent(m, enrollParseFields(m)) === false);
}

// ── 5) /api/chat 라우트 레벨 (LLM 없이 결정론 경로만 타는지) ──
const { default: worker } = await import('./src/index.js');
const chat = (body) => worker.fetch(new Request('https://x/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}), {}).then(r => r.json());
{
  const d1 = await chat({ mode: 'ops', message: '아이디 jeong01 비번 mango1234 인 Jeong 학생 화수목금요일 19시 20분 주4회 등록해줘' });
  ok('chat: 등록 분기', d1.enroll === true, d1);
  ok('chat: 강사 되물음', d1.enroll_ready === false && d1.enroll_missing.indexOf('teacher_name') >= 0, d1.enroll_missing);
  const d2 = await chat({ mode: 'ops', message: '강선생님', enroll_draft: d1.enroll_draft });
  ok('chat: 확인카드', d2.enroll_ready === true && !!d2.enroll_payload, d2);
  ok('chat: 비번 평문 노출 없음', d2.answer.indexOf('mango1234') < 0, d2.answer);
  const d3 = await chat({ mode: 'ops', message: '네', enroll_draft: d2.enroll_draft });
  ok('chat: "네" 하면 즉시 실행 신호', d3.auto_confirm === true, d3);
  const d4 = await chat({ mode: 'ops', message: '취소', enroll_draft: d2.enroll_draft });
  ok('chat: 취소', d4.enroll_cancel === true, d4);
  // 🌐 영어 화면에서는 학생 이름이 한글이어도 영어로 답해야 한다
  const e1 = await chat({ mode: 'ops', lang: 'en', message: 'add a class for 정우영, id: jeong, friday 19:00, teacher: anna' });
  ok('EN 화면: 영어 확인카드', e1.enroll_ready === true && /Teacher: anna/.test(e1.answer), e1.answer);
  const e2 = await chat({ mode: 'ops', lang: 'en', message: '아이디 jeong 인 학생 금요일 19시 안나선생님으로 등록해줘' });
  ok('EN 화면이어도 통째로 한국어면 한국어', /강사/.test(e2.answer), e2.answer);
  const d5 = await chat({ mode: 'ops', message: '자료실 어디 있어?' });
  ok('chat: 일반 질문은 등록 아님', !d5.enroll, d5);
}

console.log((fail ? '❌' : '✅') + ' enroll parser: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
