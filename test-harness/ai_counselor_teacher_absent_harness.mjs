// 🧑‍🏫 A.i 상담사 「선생님이 안 들어와요」 → ① 카카오 채널 먼저 ② 인터넷·기기 점검 함께 (2026-09-30)
//   판정 함수를 워커 소스에서 오려 내 «실제로 돌려» 봅니다. 「걸린다」 옆에 「안 걸린다」를 짝으로 둡니다
//   (짝이 없으면 «전부 걸기» 도 통과합니다).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.TA_SRC || join(ROOT, 'mangoi-ai-avatar-cf/src/index.js');
const HTML = join(ROOT, 'mangoi-ai-avatar-cf/public/student.html');
const src = readFileSync(SRC, 'utf8');
const html = readFileSync(HTML, 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name); } };

// 중괄호 짝으로 함수 몸통 오려 내기
function cutFn(text, name) {
  const i = text.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = text.indexOf('{', i), depth = 0;
  for (let k = j; k < text.length; k++) {
    if (text[k] === '{') depth++;
    else if (text[k] === '}') { depth--; if (depth === 0) return text.slice(i, k + 1); }
  }
  return '';
}

console.log('① 판정 함수');
const fnSrc = cutFn(src, 'isTeacherAbsentQuestion');
const ansSrc = cutFn(src, 'teacherAbsentAnswer');
ok('전제: 판정·답변 함수를 오려 냈다', !!fnSrc && !!ansSrc);
let isTA = () => false, taAns = () => '';
try {
  isTA = new Function(fnSrc + '; return isTeacherAbsentQuestion;')();
  taAns = new Function(ansSrc + '; return teacherAbsentAnswer;')();
} catch (e) { ok('함수가 실행 가능하다 (' + e.message + ')', false); }

const YES = ['선생님이 안 들어오세요', '선생님 안들어와요', '쌤이 안 와요', '강사님이 아직 안 보여요',
  '선생님이 입장 안 하셨어요', '선생님이 늦어요', '선생님 기다리고 있어요', '선생님이 없어요',
  'my teacher is not here', "teacher hasn't joined yet", 'the teacher is late'];
const NO = ['선생님 소개해 주세요', '선생님 변경하고 싶어요', '선생님 바꾸고 싶어요', '어느 나라 선생님이에요?',
  '선생님 변경 신청하고 기다리고 있어요', '선생님 소개가 없어요', '환불하고 싶어요', '카메라가 안 켜져요', '샘플 수업이 없어요', '수업 입장은 어디서 해요?', 'teacher introduction'];
for (const m of YES) { let r = false; try { r = isTA(m); } catch (e) {} ok('걸린다: ' + m, r === true); }
for (const m of NO) { let r = true; try { r = isTA(m); } catch (e) {} ok('안 걸린다: ' + m, r === false); }

console.log('② 답변 순서 — 카카오가 인터넷보다 먼저');
for (const lang of ['ko', 'en']) {
  let a = ''; try { a = taAns(lang); } catch (e) {}
  const k = a.search(lang === 'en' ? /KakaoTalk/ : /카카오/);
  const n = a.search(lang === 'en' ? /internet/ : /인터넷/);
  ok(lang + ': 카카오와 인터넷을 둘 다 말한다', k >= 0 && n >= 0);
  ok(lang + ': 카카오가 먼저다', k >= 0 && n >= 0 && k < n);
  ok(lang + ': mangoi.ai 주소 확인을 함께 말한다', a.indexOf('mangoi.ai') >= 0);
}

console.log('③ 배선 — LLM 보다 앞, 카카오 링크');
const hc = cutFn(src, 'handleChat');
const iTA = hc.indexOf('isTeacherAbsentQuestion(message)');
const iAI = hc.lastIndexOf('callAI(message, env, lang, "student")');
ok('전제: handleChat 을 오려 냈다', hc.length > 1000);
ok('학생 모드에서 LLM 호출보다 먼저 판정한다', iTA > 0 && iAI > 0 && iTA < iAI);
ok('판정 결과를 조건으로 쓴다(if)', /if\s*\(\s*isTeacherAbsentQuestion\(message\)\s*\)/.test(hc));
ok('응답에 teacherAbsent 표식을 싣는다', /teacherAbsent:\s*true/.test(hc));
ok('카카오 주소에 /chat 을 붙이지 않았다', !/pf\.kakao\.com\/_xlqnSxd\/chat/.test(src + html));

console.log('④ 화면 — 두 버튼, 카카오 먼저');
const dt = cutFn(html, 'deliverTeacherAbsent');
ok('전제: deliverTeacherAbsent 가 있다', !!dt);
ok('응답을 받으면 그 함수로 그린다', /d\.teacherAbsent\)\s*\{\s*deliverTeacherAbsent\(d\)/.test(html));
const kI = dt.indexOf('ta-kakao'), dI = dt.indexOf('ta-diag');
ok('카카오 버튼이 점검 버튼보다 앞', kI > 0 && dI > 0 && kI < dI);
ok('카카오는 진짜 <a> 링크(새 창·noopener)', /<a id="ta-kakao"[^>]*target="_blank" rel="noopener"/.test(dt));
ok('점검 버튼은 부모 화면의 diagnosis 를 연다', /openParentPage\("diagnosis"\)/.test(dt));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
