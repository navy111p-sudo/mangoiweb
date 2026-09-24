// 수강신청 「카톡」 칸 — 이름표 없는 한 줄도 읽는가 (2026-09-24)
//   사장님이 「홍길동수요일오후6시체험수업등록」 을 넣었더니 «수강신청 정보를 찾을 수 없습니다».
//   파서를 adm-core.js 에서 중괄호 짝으로 오려 내 «실제로 돌려» 답을 본다(글자 검사 아님).
//   ⚠️ 짝으로 본다 — 「한 줄을 읽는다」 옆에 「옛 이름표 양식도 그대로」·「유형이 없으면 안 지어낸다」.
import fs from 'fs';
const SRC = process.env.ADMCORE_SRC || new URL('../cloudflare-deploy/public/js/adm-core.js', import.meta.url);
const src = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };
function cut(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = src.indexOf('{', src.indexOf(')', i));
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
}
const names = ['_extractKoFields', '_normalizeEnrollment', '_parseFreeformEnrollment', '_parseKakaoEnrollments'];
const parts = names.map(cut);
names.forEach((n, i) => ok(parts[i].length > 0, '전제: ' + n + ' 를 오려 냈다'));
let parse = () => [];
try { parse = new Function(parts.join('\n') + ';return _parseKakaoEnrollments;')(); }
catch (e) { ok(false, '파서를 만들지 못함: ' + e.message); }
const run = (t) => { try { return parse(t) || []; } catch (e) { return [{ _err: e.message }]; } };
const one = (t) => { const r = run(t); return r.length === 1 ? r[0] : null; };

console.log('① 사장님이 넣은 그대로');
let r = one('홍길동수요일오후6시체험수업등록');
ok(r && r.student_name === '홍길동', '붙여 쓴 줄 — 이름 홍길동');
ok(r && r.days_of_week === '수', '요일 수 («체험수업» 의 수를 요일로 안 읽는다)');
ok(r && r.time === '18:00', '오후6시 → 18:00');
ok(r && r._types && r._types.join() === 'trial', '유형 체험');

console.log('② 여러 모양');
r = one('홍길동 수요일 오후6시 체험');
ok(r && r.student_name === '홍길동' && r.time === '18:00' && r.days_of_week === '수', '띄어 쓴 줄');
r = one('김사랑 월수금 7시 정규 (kim01) 9월 30일부터');
ok(r && r.days_of_week === '월수금', '요일 글자만 모인 낱말 월수금');
ok(r && r.time === '19:00', '오전·오후 없는 7시 → 19:00');
ok(r && r.student_user_id === 'kim01', '아이디 kim01');
ok(r && /-09-30$/.test(r._started_at_str), '9월 30일 → 시작일 (월·일 글자를 요일로 안 읽는다)');
r = one('이영희 화,목 18:30 레벨테스트 1:1');
ok(r && r.days_of_week === '화목' && r.time === '18:30' && r.class_size === '1:1', '18:30 · 화,목 · 1:1 (1:1 을 시간으로 안 읽는다)');
r = one('최민 금요일 저녁 7시반 체험수업 신청합니다');
ok(r && r.student_name === '최민' && r.time === '19:30', '7시반 → 19:30, 군말은 이름에 안 들어간다');
r = one('김정규 정규 화요일 5시');
ok(r && r.student_name === '김정규' && r._types.join() === 'regular', '이름 속 «정규» 는 이름으로 남는다');
r = one('이에스더 체험 목요일 오후 4시');
ok(r && r.student_name === '이에스더', '이름 속 «에» 를 지우지 않는다');
const multi = run('박민수 월요일 오후5시 체험\n정다은 화요일 오후6시 정규');
ok(multi.length === 2 && multi[0].student_name === '박민수' && multi[1].student_name === '정다은', '줄마다 한 명');

console.log('②-2 순서가 바뀌어도 같은 답 (2026-09-24 사장님 「순서가 바뀌어도 되게」)');
for (const t of ['체험 수요일 오후6시 홍길동', '오후6시 홍길동 체험 수요일', '수요일 체험 홍길동 오후6시',
                 '체험수업수요일오후6시홍길동등록', '6시 수요일 홍길동 체험', '수 오후6시 홍길동 체험']) {
  const x = one(t);
  ok(x && x.student_name === '홍길동' && x.days_of_week === '수' && x.time === '18:00' && x._types.join() === 'trial',
     '순서 바꿈 — ' + t);
}
r = one('9월 30일부터 월수금 김사랑 kim01 정규 7시');
ok(r && r.student_name === '김사랑' && r.student_user_id === 'kim01' && r.days_of_week === '월수금' && r.time === '19:00' && /-09-30$/.test(r._started_at_str),
   '날짜·아이디가 앞에 와도 같은 답');

console.log('②-3 여러 말투 (2026-09-24 사장님 「다양하게」)');
r = one('박민수 평일 6pm 정규 30분 3개월 6만원');
ok(r && r.days_of_week === '월화수목금', '평일 → 월~금');
ok(r && r.time === '18:00', '6pm → 18:00');
ok(r && r.duration_min === 30, '30분 → 수업 길이');
ok(r && r.duration_months === '3', '3개월 → 기간 («개월» 의 «월» 을 수강료 쪽이 안 먹는다)');
ok(r && r.monthly_fee_krw === 60000, '6만원 → 60000');
r = one('김사랑 월수금 7시 정규 30분 3개월 6만원 kim01');
ok(r && r.time === '19:00' && r.duration_min === 30, '「7시 정규 30분」 은 19:00 + 30분 수업 (19:30 이 아니다 — 입력칸 예시 그대로)');
r = one('정다은 주말 오전10시 레벨테스트 Krystel 선생님 010-1234-5678');
ok(r && r.days_of_week === '토일' && r.time === '10:00', '주말 · 오전10시');
ok(r && r.teacher_name === 'KRYSTEL' && r.assign_priority === 'teacher', '「Krystel 선생님」 → 강사(대문자) · 강사 우선');
ok(r && r.student_user_id === null, '강사 영문 이름을 아이디로 오해하지 않는다');
ok(r && r.parent_phone === '01012345678', '전화번호 → 학부모 번호 (시간·날짜로 안 읽는다)');
r = one('월~금 저녁7시반 레테 초3 최민');
ok(r && r.days_of_week === '월화수목금' && r.time === '19:30' && r._types.join() === 'level' && r.student_name === '최민', '월~금 · 7시반 · 레테 · 학년(초3)은 이름에 안 들어감');
r = one('아이디 lee02 이지은 화욜 목욜 오후 5시 20분 정규반 내일부터');
ok(r && r.student_user_id === 'lee02' && r.days_of_week === '화목' && r.time === '17:20' && /^\d{4}-\d{2}-\d{2}$/.test(r._started_at_str),
   '아이디 lee02 · 화욜·목욜 · 5시 20분 · 내일부터');
r = one('윤서 수 pm 6:30 trial');
ok(r && r.time === '18:30' && r._types.join() === 'trial', 'pm 6:30 · trial');
r = one('홍길동 수요일 오후6시 체험');
ok(r && /홍길동 수요일 오후6시 체험/.test(r.notes || ''), '원문을 메모(notes)에 남긴다');

console.log('③ 짝 — 지어내지 않는다 · 옛 양식은 그대로');
ok(run('홍길동 수요일 6시').length === 0, '수업 종류가 없으면 만들지 않는다');
ok(run('수요일 오후6시 체험').length === 0, '이름이 없으면 만들지 않는다');
r = one('학생: 홍길동\n수업 유형: 체험\n요일: 수\n시간: 18:00');
ok(r && r.student_name === '홍길동' && r.time === '18:00' && r.days_of_week === '수', '이름표 양식은 예전처럼 읽는다');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
