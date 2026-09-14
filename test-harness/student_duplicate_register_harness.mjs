// student_duplicate_register_harness.mjs — 학생 수동 등록 «같은 사람 중복» 경고 (2026-09-14)
//
// 왜 만들었나
//   정예희 학생이 yahee·yahee1·yahee2 로 1분 안에 세 번 등록됐다(전부 admin_manual, 각각
//   비밀번호가 있어 셋 다 로그인됨). 아이디 중복 검사는 «아이디» 만 보므로 번호를 붙여
//   다시 누르면 그대로 통과했다. 뿌리는 «첫 등록이 됐는지 몰라서 또 누른 것» 이라 막는
//   자리는 로그인이 아니라 «등록» — 서버가 같은 이름+같은 연락처가 있으면 409 로 «묻고»,
//   사람이 「그래도 등록」(force:true)을 눌러야 통과한다.
//
// ⚠️ 문자열 검사로는 이 종류를 못 잡는다 — 함수도 값도 다 «있고» 틀린 것은
//    «무슨 답이 나오는가» 뿐이다. 그래서 판정 정본(src/student-duplicate.ts)을 esbuild 로
//    변환해 **실제로 돌린다.** 배선(라우트·화면)은 «중괄호 짝» 으로 몸통을 잘라 본다.
//
// 짝 검사(한쪽만 두면 «전부 막기»·«전부 통과» 도 초록이 된다):
//   「같은 이름+같은 번호면 묻는다」 ↔ 「이름만 같으면 안 묻는다」·「번호가 없으면 안 묻는다」
//   「force 없으면 409」        ↔ 「force 있으면 INSERT 까지 간다」
//
// 변이시험(전부 실제 FAIL 확인 — 2026-09-14)
//   Ⓐ phoneDigits 를 항등함수로(하이픈 안 벗김)          → ①-4 FAIL
//   Ⓑ 이름 검사 지우기(번호만 같으면 후보)               → ①-6 FAIL
//   Ⓒ 번호 없으면 «이름만으로» 후보                       → ①-7 FAIL
//   Ⓓ 라우트에서 force 판정 지우기(항상 묻기)             → ②-3 FAIL
//   Ⓔ 라우트에서 possible_duplicate 분기 통째로 지우기    → ②-1·②-2 FAIL
//   Ⓕ 화면이 첫 제출부터 force:true 를 싣기               → ③-3 FAIL
//   Ⓖ 화면의 possible_duplicate 분기 지우기               → ③-1 FAIL

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = p => readFileSync(join(__dir, '..', p), 'utf8');
const dupTs = R('cloudflare-deploy/src/student-duplicate.ts');
const admin = R('cloudflare-deploy/src/api-admin.ts');
const core = R('cloudflare-deploy/public/js/adm-core.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* 중괄호 짝으로 블록 자르기 — 여는 중괄호는 «괄호 깊이 0·꺾쇠 깊이 0» 인 것만 인정 */
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

// ── ① 판정 정본을 실제로 돌린다 ───────────────────────────────────────────
console.log('\n① 판정 정본 studentDuplicateCandidates — 실제 실행');
let mod = null;
try {
  const eb = createRequire(join(__dir, '../cloudflare-deploy/package.json'))('esbuild');
  const js = eb.transformSync(dupTs, { loader: 'ts', format: 'esm' }).code;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
} catch (e) { console.log('  ⚠ esbuild 없음/변환 실패 — ①절 건너뜀: ' + (e && e.message)); }

if (mod) {
  const F = mod.studentDuplicateCandidates;
  const rows = [
    { user_id: 'yahee',  student_name: '정예희', korean_name: '정예희', username: '정예희', parent_phone: '01089862224', student_phone: '010-9045-1044', source: 'admin_manual' },
    { user_id: 'kim01',  student_name: '김사랑', korean_name: '김사랑', parent_phone: '01011112222', student_phone: null, source: null },
    { user_id: 'kim02',  student_name: '김사랑', korean_name: '김사랑', parent_phone: '01033334444', student_phone: null, source: null },
    { user_id: 'nonm',   student_name: '',       korean_name: null,    parent_phone: '01089862224', source: null },   // 이름 없는 행
  ];
  let r;
  r = F('정예희', '010-8986-2224', '', rows);
  ok(r.length === 1 && r[0].user_id === 'yahee' && r[0].matched_on === 'parent_phone', '①-1 같은 이름 + 같은 부모번호(하이픈 표기 다름) → yahee 1건');
  r = F('정예희', '', '01090451044', rows);
  ok(r.length === 1 && r[0].matched_on === 'student_phone', '①-2 같은 이름 + 같은 학생번호(숫자만) → 1건');
  r = F('정예희', '01000000000', '', rows);
  ok(r.length === 0, '①-3 같은 이름이지만 번호가 다르면 0건 (짝: 이름만으로는 안 묻는다)');
  r = F('정예희', '010 8986 2224', '', rows);
  ok(r.length === 1, '①-4 공백 표기도 같은 번호로 본다 (phoneDigits)');
  ok(mod.phoneDigits('010-9045-1044') === '01090451044' && mod.phoneDigits(null) === '', '①-5 phoneDigits — 숫자만·null 은 빈 문자열');
  r = F('박다른', '01089862224', '', rows);
  ok(r.length === 0, '①-6 번호는 같지만 이름이 다르면 0건 (짝: 번호만으로는 안 묻는다 — 형제)');
  r = F('정예희', '', '', rows);
  ok(r.length === 0, '①-7 새 등록에 번호가 없으면 0건 (이름만으로 묻지 않는다 — 동명이인)');
  r = F('김사랑', '01033334444', '', rows);
  ok(r.length === 1 && r[0].user_id === 'kim02', '①-8 동명이인 둘 중 번호가 맞는 한 명만');
  r = F('정예희', '1234', '', rows);
  ok(r.length === 0, '①-9 7자리 미만 번호는 근거로 안 쓴다');
  r = F('정예희', '01089862224', '', []);
  ok(Array.isArray(r) && r.length === 0, '①-10 행이 비면 빈 배열 (던지지 않는다)');
  let threw = false; try { F('정예희', '01089862224', '', [null, {}, { user_id: 'x' }]); } catch { threw = true; }
  ok(!threw, '①-11 이상한 행(null·빈 객체)이 섞여도 던지지 않는다');
}

// ── ② 라우트 배선 — 중괄호 짝으로 몸통을 잘라 본다 ─────────────────────
console.log('\n② POST /api/admin/students/create 배선');
const route = bodyAt(admin, "if (method === 'POST' && path === '/api/admin/students/create')");
ok(route.length > 500, '②-0 전제: 라우트 몸통을 잘라 냈다 (' + route.length + '자)');
const rs = strip(route);
ok(/studentDuplicateCandidates\(/.test(rs), '②-1 라우트가 정본 studentDuplicateCandidates 를 부른다');
ok(/error:\s*'possible_duplicate'/.test(rs) && /existing:\s*cands/.test(rs), '②-2 409 possible_duplicate + existing 목록을 돌려준다');
ok(/force/.test(rs) && /if\s*\(\s*!force\s*\)/.test(rs), '②-3 force 가 «없을 때만» 묻는다 (force 면 통과)');
// 순서: 판정은 INSERT 보다 앞, 아이디 중복(409 exists) 검사 뒤
const iDup = rs.indexOf('studentDuplicateCandidates(');
const iIns = rs.indexOf('INSERT INTO students_erp');
const iExists = rs.indexOf("error: 'exists'");
ok(iDup > 0 && iIns > iDup, '②-4 판정이 INSERT 보다 «앞» 이다');
ok(iExists > 0 && iDup > iExists, '②-5 아이디 중복(exists) 검사가 먼저, 사람 중복은 그 뒤');
// 조회는 이름 완전일치(LIKE 금지)
const q = rs.slice(rs.indexOf('SELECT user_id, student_name, korean_name'), iDup);
ok(q.length > 0 && !/LIKE/.test(q) && /student_name = \?/.test(q), '②-6 같은 이름 조회는 완전일치(=) — LIKE 없음');
// 조회 실패는 fail-open: catch 에서 빈 배열
ok(/catch\s*\{\s*sameRows\s*=\s*\[\]/.test(rs), '②-7 조회가 실패하면 빈 배열(묻지 않고 예전처럼 통과)');
ok(/import \{ studentDuplicateCandidates \} from '\.\/student-duplicate'/.test(admin), '②-8 정본을 import 한다 (복제 아님)');
ok(!/function studentDuplicateCandidates/.test(strip(admin)), '②-9 api-admin.ts 안에 판정 복제본이 없다');

// ── ③ 화면 배선 (adm-core.js 학생 등록 모달) ────────────────────────────
console.log('\n③ 화면 — smSubmitRegisterStudent');
const fn = bodyAt(core, 'window.smSubmitRegisterStudent = async function');
ok(fn.length > 500, '③-0 전제: 함수 몸통을 잘라 냈다 (' + fn.length + '자)');
const fs = strip(fn);
ok(/possible_duplicate/.test(fs) && /existing/.test(fs), '③-1 possible_duplicate 응답을 따로 그린다');
ok(/sm-reg-force/.test(fs) && /smSubmitRegisterStudent\(\s*\{\s*force:\s*true\s*\}\s*\)/.test(fs), '③-2 「그래도 등록」 버튼이 force:true 로 다시 보낸다');
// 첫 제출에는 force 를 싣지 않는다 — body 조립식에서 force 가 조건부(opts.force)인지
const bodyExpr = (fs.match(/body:\s*JSON\.stringify\(\{[^}]*\}\)/) || [''])[0];
ok(bodyExpr.length > 0 && /force:\s*force\s*\?\s*true\s*:\s*undefined/.test(bodyExpr), '③-3 요청 본문의 force 는 조건부(첫 제출은 undefined)');
ok(/const force = !!\(opts && opts\.force === true\)/.test(fs), '③-4 force 는 opts.force === true 일 때만 (Event 객체 등 다른 인자는 거짓)');
// possible_duplicate 분기가 일반 오류 분기보다 앞
ok(fs.indexOf('possible_duplicate') < fs.indexOf("!r.ok || !j.ok"), '③-5 possible_duplicate 분기가 일반 오류 분기보다 앞');
// 아이디를 HTML 로 그릴 때 이스케이프
ok(/_esc\(String\(c\.user_id/.test(fs), '③-6 기존 아이디는 _esc 로 이스케이프해 그린다');
// ?v= 가 올라갔는가 (219 이상)
const v = (R('cloudflare-deploy/public/admin.html').match(/adm-core\.js\?v=(\d+)/) || [])[1];
ok(Number(v) >= 219, '③-7 admin.html 의 adm-core.js ?v= 가 219 이상 (' + v + ')');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
