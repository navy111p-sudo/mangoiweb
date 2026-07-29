// enroll_contract_harness.mjs — AI 운영비서 자동 수강등록의 '경계 계약' 회귀 가드 (2026-07-30)
// ─────────────────────────────────────────────────────────────────────────────
//  이 기능은 4개 파일·3개 경계를 건너 실제 학생 계정과 반복수업을 만든다:
//    ① 아바타 워커  mangoi-ai-avatar-cf/src/index.js   → enroll_payload 생성
//    ② 위젯         mangoi-ai-avatar-cf/public/index.html → postMessage('mangoi-enroll')
//    ③ 부모 브리지  cloudflare-deploy/public/js/adm-s17.js → 출처검증 후 /api/admin/ai-action
//    ④ 백엔드       cloudflare-deploy/src/ai-command.ts (enroll_student) → DB 기록
//  각 파일은 담당자가 다르고 리포도 다르다. 한쪽에서 필드명 하나만 바꿔도
//  '엉뚱한 강사에게 배정' 또는 '수업 0건 등록' 이 소리 없이 발생한다.
//  → 그 계약(필드 이름·응답 형태·출처검증)을 소스 수준에서 못 박는다.
//
//  아바타 앱이 이 트리에 없으면(리포 분리 등) 조용히 통과시킨다(게이트 오탐 방지).
//  실행: node test-harness/enroll_contract_harness.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = (rel) => new URL(rel, import.meta.url);
const path = (rel) => fileURLToPath(url(rel));
const readOr = (rel) => { try { return readFileSync(path(rel), 'utf8'); } catch { return null; } };

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) pass++;
  else { fail++; console.log('  X ' + name + (got !== undefined ? '  -> ' + JSON.stringify(got) : '')); }
};

// ── 0) 아바타 앱 존재 확인 — 없으면 이 계약을 검사할 대상이 없으니 통과(benign) ──
const avatarSrc = readOr('../mangoi-ai-avatar-cf/src/index.js');
if (avatarSrc === null) {
  console.log('enroll contract: avatar app not in this tree — nothing to check, pass, 0 fail');
  process.exit(0);
}

// ── 1) 아바타가 '실제로' 만드는 payload 를 진짜 함수로 생성해 키 구조를 고정 ──
let payload = null;
try {
  const m = await import(url('../mangoi-ai-avatar-cf/src/index.js'));
  const draft = m.enrollMerge(null, m.enrollParseFields(
    '아이디 test0723 비번 mango1234 인 홍길동 학생 강선생님한테 화수목금요일 19시 20분 주4회 등록해줘'));
  const r = m.enrollRespond(draft, false);
  payload = r.enroll_payload;
  ok('아바타: enroll_ready', r.enroll_ready === true, r.enroll_missing);
  ok('아바타: 확인문구에 비번 평문 없음(●마스킹)', r.answer.indexOf('mango1234') < 0 && r.answer.indexOf('●') >= 0);
} catch (e) {
  console.log('  X 아바타 함수 import/실행 실패: ' + String(e));
  console.log('\nenroll contract: 0/1 pass, 1 fail'); process.exit(1);
}

// 백엔드(enroll_student)가 읽는 필드 ↔ 아바타 payload 경로 ↔ 그 값의 존재
//   [payload 경로, ai-command.ts 가 읽는 토큰]
const CONTRACT = [
  ['student.login_id',  /\bst\.login_id\b/],
  ['student.password',  /\bst\.password\b/],
  ['student.name',      /\bst\.name\b/],
  ['teacher_name',      /args\?\.teacher_name\b/],
  ['days',              /args\?\.days\b/],
  ['time',              /args\?\.time\b/],
  ['duration_min',      /args\?\.duration_min\b/],
  ['class_type',        /args\?\.class_type\b/],
];
const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// 1a) 아바타 payload 가 계약 필드를 실제로 담고 있는가 + 잉여 필드가 새로 생기지 않았는가
const expectTop = ['student', 'teacher_name', 'days', 'time', 'duration_min', 'class_type'];
ok('payload 최상위 키 = 계약과 동일', JSON.stringify(Object.keys(payload).sort()) === JSON.stringify([...expectTop].sort()), Object.keys(payload));
ok('payload.student 키 = {login_id,password,name}', JSON.stringify(Object.keys(payload.student).sort()) === JSON.stringify(['login_id','name','password']), Object.keys(payload.student));
for (const [dotted] of CONTRACT) ok('payload 에 ' + dotted + ' 존재', dig(payload, dotted) !== undefined, dig(payload, dotted));

// ── 2) 백엔드(enroll_student)가 그 필드들을 실제로 읽는가 ──
const backend = readOr('../cloudflare-deploy/src/ai-command.ts');
ok('백엔드 ai-command.ts 존재', backend !== null);
if (backend) {
  ok("백엔드에 enroll_student 핸들러 존재", /name === 'enroll_student'/.test(backend));
  for (const [dotted, re] of CONTRACT) ok('백엔드가 ' + dotted + ' 를 읽음(' + re + ')', re.test(backend));
  // 응답 계약: 위젯 handleEnrollResult 가 읽는 필드를 백엔드가 반환하는가
  for (const key of ['summary', 'summary_en', 'warnings', 'warnings_en'])
    ok('백엔드 응답에 ' + key + ' 포함', new RegExp('\\b' + key + '\\b').test(backend));
}

// ── 3) 부모 브리지(adm-s17.js): 같은 필드를 넘기고, 출처를 반드시 검증하는가 ──
const bridge = readOr('../cloudflare-deploy/public/js/adm-s17.js');
ok('브리지 adm-s17.js 존재', bridge !== null);
if (bridge) {
  ok("브리지가 mangoi-enroll 수신", /type===['"]mangoi-enroll['"]|type==='mangoi-enroll'/.test(bridge));
  ok('브리지 출처검증 ev.origin!==SRC', /ev\.origin\s*!==\s*SRC/.test(bridge), '출처검증 없으면 임의 사이트가 등록 가능');
  ok('브리지 소스검증 ev.source===frame.contentWindow', /ev\.source\s*!==\s*frame\.contentWindow/.test(bridge));
  ok('브리지가 /api/admin/ai-action 로 POST', /\/api\/admin\/ai-action/.test(bridge) && /credentials:\s*['"]include['"]/.test(bridge));
  ok("브리지가 name:'enroll_student' 로 호출", /name:\s*['"]enroll_student['"]/.test(bridge));
  for (const [dotted] of CONTRACT) {
    const leaf = dotted.split('.').pop();
    ok('브리지가 ' + leaf + ' 전달', new RegExp('\\b' + leaf + '\\b').test(bridge), leaf);
  }
}

// ── 4) 위젯(index.html)이 응답 필드를 소비하고, 확정문에 비번을 안 넣는가 ──
const widget = readOr('../mangoi-ai-avatar-cf/public/index.html');
ok('위젯 index.html 존재', widget !== null);
if (widget) {
  ok('위젯이 enroll_payload 소비', /enroll_payload/.test(widget));
  ok('위젯이 mangoi-enroll-result 수신', /mangoi-enroll-result/.test(widget));
  for (const key of ['summary', 'summary_en', 'warnings'])
    ok('위젯이 결과 ' + key + ' 표시', new RegExp('\\b' + key + '\\b').test(widget));
}

// ── 5) 중국어 강사 결정론 배정: 상수와 백엔드 매칭 규칙의 정합 ──
//   아바타는 강사 미지정 중국어 요청을 CHINESE_TEACHER_NAME 으로 배정한다.
//   그 문자열은 실제 teachers.name('중국어 강선생님')과 일치해야 백엔드가 강사를 찾는다.
//   (2026-07-30 DB 확인: teachers.id=29 name='중국어 강선생님' 존재 → 정확일치 해소)
const CTN = (avatarSrc.match(/CHINESE_TEACHER_NAME\s*=\s*"([^"]+)"/) || [])[1];
ok('CHINESE_TEACHER_NAME 상수 존재', !!CTN, CTN);
ok('CHINESE_TEACHER_NAME === "중국어 강선생님"(teachers.name 과 정확일치)', CTN === '중국어 강선생님', CTN);

console.log(`\nenroll contract: ${pass}/${pass + fail} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
