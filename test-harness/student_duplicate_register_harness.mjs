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
// 🪤 처음 판에서는 «묻는가» 결정이 라우트 안의 `if (cands.length)` 한 줄이라 **조건 뒤집기**
//    변이(`!cands.length` · 화면 `!== 'possible_duplicate'` · `LIMIT 1`)가 문자열 검사 29건을
//    전부 통과했다(2026-09-14 함정 대조 실측). 그래서 결정을 정본 `duplicateGate` 로 빼서
//    실제로 돌리고(①-b), 화면 함수도 **가짜 DOM·가짜 fetch 로 실제로 돌린다**(④).
//
// 변이시험(전부 실제 FAIL 확인 — 2026-09-14)
//   Ⓐ phoneDigits 를 항등함수로(하이픈 안 벗김)          → ①-a FAIL
//   Ⓑ 이름 검사 지우기(번호만 같으면 후보)               → ①-a FAIL
//   Ⓒ 번호 없으면 «이름만으로» 후보                       → ①-a FAIL
//   Ⓓ duplicateGate 의 ask 를 뒤집기(`existing.length === 0`) → ①-b FAIL
//   Ⓔ duplicateGate 에서 force 무시                       → ①-b FAIL
//   Ⓕ 라우트 `if (gate.ask)` → `if (!gate.ask)`            → ②-2 FAIL
//   Ⓖ 라우트에서 분기 통째로 지우기                       → ②-1·②-2 FAIL
//   Ⓗ 조회에 LIMIT 붙이기                                → ②-6 FAIL
//   Ⓘ 화면 `=== 'possible_duplicate'` → `!==`               → ④ FAIL
//   Ⓙ 화면이 첫 제출부터 force:true                        → ④ FAIL
//   Ⓚ 화면의 possible_duplicate 분기 지우기               → ④ FAIL
//   Ⓛ 조회 실패를 조용히 빈 배열로(로그·표식 없이)         → ②-7 FAIL

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
} catch (e) { ok(false, '①-0 esbuild 로 정본을 변환했다 (없으면 ①절이 통째로 헛돈다 — 환경 사유: ' + (e && e.message) + ')'); }

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

  console.log('\n①-b «묻는가» 결정 정본 duplicateGate — 실제 실행 (짝: 묻는다 ↔ 통과한다)');
  const G = mod.duplicateGate;
  let g;
  g = G(undefined, '정예희', '01089862224', '', rows);
  ok(g.ask === true && g.check === 'checked' && g.existing.length === 1 && g.existing[0].user_id === 'yahee', '①-b1 force 없음 + 같은 사람 있음 → ask:true (yahee)');
  g = G(true, '정예희', '01089862224', '', rows);
  ok(g.ask === false && g.check === 'checked' && g.existing.length === 1, '①-b2 force:true → ask:false (existing 은 그대로 알려 준다)');
  g = G('1', '정예희', '01089862224', '', rows);
  ok(g.ask === false, '①-b3 force "1" 도 force 로 본다');
  g = G('yes', '정예희', '01089862224', '', rows);
  ok(g.ask === true, '①-b4 force 에 엉뚱한 값("yes") 은 force 가 아니다 → 묻는다');
  g = G(undefined, '정예희', '01000000000', '', rows);
  ok(g.ask === false && g.check === 'checked' && g.existing.length === 0, '①-b5 같은 사람 없음 → ask:false (짝: 안 묻는다)');
  g = G(undefined, '정예희', '01089862224', '', null);
  ok(g.ask === false && g.check === 'skipped' && g.existing.length === 0, '①-b6 조회 실패(rows null) → 묻지 않고 통과하되 check:skipped 로 밝힌다');
  g = G(undefined, '정예희', '01089862224', '', []);
  ok(g.ask === false && g.check === 'checked', '①-b7 조회 성공·0행 → checked (skipped 와 다르다)');
}

// ── ② 라우트 배선 — 중괄호 짝으로 몸통을 잘라 본다 ─────────────────────
console.log('\n② POST /api/admin/students/create 배선');
const route = bodyAt(admin, "if (method === 'POST' && path === '/api/admin/students/create')");
ok(route.length > 500, '②-0 전제: 라우트 몸통을 잘라 냈다 (' + route.length + '자)');
const rs = strip(route);
ok(/const gate = duplicateGate\(body\?\.force, name, parentPhone, studentPhone, sameRows\)/.test(rs), '②-1 라우트가 정본 duplicateGate 를 (force·이름·번호·행) 순으로 부른다');
ok(/if \(gate\.ask\) \{/.test(rs) && !/if \(!gate\.ask\)/.test(rs), '②-2 «묻는가» 는 gate.ask 그대로 — 뒤집지 않았다');
ok(/error:\s*'possible_duplicate'/.test(rs) && /existing:\s*gate\.existing/.test(rs), '②-3 409 possible_duplicate + existing 목록(정본 답)을 돌려준다');
const iGate = rs.indexOf('duplicateGate(');
const iIns = rs.indexOf('INSERT INTO students_erp');
const iExists = rs.indexOf("error: 'exists'");
ok(iGate > 0 && iIns > iGate, '②-4 판정이 INSERT 보다 «앞» 이다');
ok(iExists > 0 && iGate > iExists, '②-5 아이디 중복(exists) 검사가 먼저, 사람 중복은 그 뒤');
const q = rs.slice(rs.indexOf('SELECT user_id, student_name, korean_name'), iGate);
ok(q.length > 0 && !/LIKE/.test(q) && /student_name = \?/.test(q) && /korean_name = \?/.test(q) && /username = \?/.test(q), '②-6a 같은 이름 조회는 세 칸 완전일치(=) — LIKE 없음');
ok(!/LIMIT/i.test(q), '②-6b 조회에 LIMIT 이 없다 (동명이인 50명 넘는 이름에서 후보가 잘리면 조용히 통과한다)');
ok(/catch \(e: any\) \{[\s\S]*?console\.warn\([\s\S]*?sameRows = null;/.test(rs.slice(0, iGate)), '②-7 조회 실패는 «null»(정본이 skipped 로 밝힘) + console.warn — 조용히 넘기지 않는다');
ok(/dup_check:\s*gate\.check/.test(rs), '②-8 성공 응답에 dup_check(checked/skipped) 를 싣는다');
ok(/import \{ duplicateGate \} from '\.\/student-duplicate'/.test(admin), '②-9 정본을 import 한다 (복제 아님)');
ok(!/function (studentDuplicateCandidates|duplicateGate)/.test(strip(admin)), '②-10 api-admin.ts 안에 판정 복제본이 없다');
ok(/\['phone', 'TEXT'\]/.test(route), '②-11 지연 ALTER 목록에 phone 이 있다 (없는 DB 에서 조회가 매번 죽어 fail-open 으로 기능이 조용히 죽는다)');

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
ok(Number(v) >= 220, '③-7 admin.html 의 adm-core.js ?v= 가 220 이상 (' + v + ')');

// ── ④ 화면 함수를 가짜 DOM·가짜 fetch 로 «실제로» 돌린다 ───────────────
//   문자열 검사(③)는 `=== 'possible_duplicate'` 를 `!==` 로 뒤집어도 통과한다(함정 대조 실측).
//   그래서 함수를 오려 내 실제로 부르고 «무엇이 그려졌는가·무엇을 보냈는가» 를 본다.
console.log('\n④ 화면 — smSubmitRegisterStudent 실제 실행');
function makeDom(values) {
  const els = {};
  const mk = (id) => {
    const el = { id, value: values[id] || '', disabled: false, innerHTML: '', style: {}, _listeners: {},
      querySelector(sel) {
        if (sel === '.sm-reg-force' && /sm-reg-force/.test(el.innerHTML)) {
          const b = { style: { setProperty() {} }, _click: null, addEventListener(ev, fn) { if (ev === 'click') b._click = fn; } };
          el._forceBtn = b; return b;
        }
        return null;
      } };
    return el;
  };
  const document = { getElementById(id) { if (!(id in els)) els[id] = mk(id); return els[id]; } };
  return { document, els };
}
async function runScreen(responses, opts) {
  // responses: fetch 호출 순서대로 돌려줄 {status, body}
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  const { document, els } = makeDom({ 'sm-reg-uid': 'yahee3', 'sm-reg-name': '정예희', 'sm-reg-parent-phone': '010-8986-2224' });
  const src = 'async function (opts) ' + fnBody;
  const win = {};
  const factory = new Function('document', 'fetch', '_esc', 'adminLang', 'window', 'alert', 'loadStudentList', 'return (' + src + ');');
  const f = factory(document, fetch, (x) => String(x == null ? '' : x), 'ko', win, () => {}, () => {});
  win.smSubmitRegisterStudent = f;
  await f(opts);
  return { calls, msg: els['sm-reg-msg'], els, win };
}
const fnBody = bodyAt(core, 'window.smSubmitRegisterStudent = async function');
const DUP = { status: 409, body: { ok: false, error: 'possible_duplicate', existing: [{ user_id: 'yahee', name: '정예희', matched_on: 'parent_phone', source: 'admin_manual' }] } };
const OKR = { status: 200, body: { ok: true, user_id: 'yahee3', name: '정예희', temp_password: 'abcd-efgh-ijkl', dup_check: 'checked' } };
const OKSKIP = { status: 200, body: { ok: true, user_id: 'yahee3', name: '정예희', temp_password: 'abcd-efgh-ijkl', dup_check: 'skipped' } };
const ERR = { status: 400, body: { ok: false, error: 'name_required', message: '학생 이름을 입력하세요.' } };
try {
  let r = await runScreen([DUP]);
  ok(r.calls.length === 1 && r.calls[0].body.force === undefined && !('force' in JSON.parse(JSON.stringify(r.calls[0].body))), '④-1 첫 제출에는 force 를 싣지 않는다 (본문에 force 키 없음)');
  ok(/yahee/.test(r.msg.innerHTML) && /sm-reg-force/.test(r.msg.innerHTML) && !/계정을 만들었습니다/.test(r.msg.innerHTML), '④-2 409 possible_duplicate → 기존 아이디 + 「그래도 등록」 버튼, 성공 문구는 없다');
  ok(r.calls.length === 1, '④-3 묻는 응답을 받고 «스스로» 다시 보내지 않는다 (사람이 눌러야)');
  // 「그래도 등록」을 누르면 force:true 로 다시 보내고 성공을 그린다
  const btn = r.msg._forceBtn;
  ok(!!btn && typeof btn._click === 'function', '④-4 「그래도 등록」 버튼에 click 리스너가 달렸다');
  if (btn && btn._click) {
    // 두 번째 호출은 성공 응답으로
    const calls2 = [];
    r.win.smSubmitRegisterStudent = async (o) => { calls2.push(o); };
    btn._click();
    await new Promise(res => setTimeout(res, 0));
    ok(calls2.length === 1 && calls2[0] && calls2[0].force === true, '④-5 누르면 smSubmitRegisterStudent({force:true}) 로 다시 부른다');
  }
  r = await runScreen([OKR], { force: true });
  ok(r.calls.length === 1 && r.calls[0].body.force === true, '④-6 opts.force:true 면 본문에 force:true 를 싣는다');
  ok(/계정을 만들었습니다/.test(r.msg.innerHTML) && /abcd-efgh-ijkl/.test(r.msg.innerHTML) && !/sm-reg-force/.test(r.msg.innerHTML), '④-7 성공 응답은 성공 문구 + 비밀번호 (짝: 정상 등록은 그대로 된다)');
  r = await runScreen([OKR], { force: 'true' });
  ok(r.calls[0].body.force === undefined, '④-8 opts.force 가 문자열 "true" 면 force 로 안 본다 (=== true 만)');
  r = await runScreen([OKR], { type: 'click' });
  ok(r.calls[0].body.force === undefined, '④-9 Event 객체 같은 인자가 와도 force 가 아니다');
  r = await runScreen([OKSKIP]);
  ok(/중복 확인을 못 한 채/.test(r.msg.innerHTML), '④-10 dup_check:skipped 면 «확인 못 했다» 를 화면이 말한다');
  r = await runScreen([OKR]);
  ok(!/중복 확인을 못 한 채/.test(r.msg.innerHTML), '④-11 dup_check:checked 면 그 안내가 없다 (짝)');
  r = await runScreen([ERR]);
  ok(/학생 이름을 입력하세요/.test(r.msg.innerHTML) && !/sm-reg-force/.test(r.msg.innerHTML), '④-12 다른 오류는 예전처럼 오류 문구만 (그래도 등록 버튼 없음)');
} catch (e) {
  ok(false, '④ 화면 함수 실행이 던졌다 (오려내기 실패 또는 문법 변이): ' + (e && e.message));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
