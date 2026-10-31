/* verify_room_admin_role_harness.mjs — 「관리자로 잡혀 들어와도 «이 예약의 학생» 이면 학생」 (2026-08-26)
 *
 * 왜 필요한가
 *   사장님 신고 — 학생 수업 입장인데 사장님 얼굴이 전체화면, 강선생님이 210px PIP.
 *   원인은 CSS 가 아니라 «역할» 이었다. jeong 은 홈 통합 로그인의 관리자 폴백으로 들어가
 *   학생 세션이 없어 입장 역할이 admin 으로 잡히는데, /api/class/verify-room 이
 *   role=admin 을 «privileged» 로 즉시 통과시키고 resolved_role 을 주지 않아
 *   「이 예약의 학생이면 역할을 내린다」 교정이 admin 에서만 통째로 안 돌았다.
 *   → 한 번 admin 으로 잡히면 수업 내내 뒤집힌 채로 갔다(실측 10분). 얼굴 크기만이 아니라
 *     화면공유·교재 넘김·장치 도우미 권한까지 열린 채였다.
 *
 * ⚠️ 이 결함은 «문자열 검사» 로는 안 보였다 — 함수도 값도 다 있었고, 틀린 것은
 *    «누가 그 경로를 타는가» 뿐이었다. 그래서 여기서는 구조를 못 박고,
 *    핵심 판정(⑥)은 소스에서 오려 내 **실제로 돌린다.**
 *
 * ⛔ 되돌리면 이 검사가 FAIL 한다 — 그게 이 파일의 존재 이유다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

const api = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-mango.ts'), 'utf8');
const idx = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/idx-main.js'), 'utf8');

/* verify-room 핸들러만 잘라 낸다.
   ⚠️ 「길이로 자르기」(slice(i, i+N))는 옆 핸들러가 딸려 들어온다 — 구조를 앵커로 쓴다
      (CLAUDE.md 함정: 검사 범위를 길이로 자르지 마라). */
const START = "path === '/api/class/verify-room'";
const s0 = api.indexOf(START);
const s1 = api.indexOf("if (method === 'POST' && path === '/api/i18n/translate')", s0);
const block = (s0 >= 0 && s1 > s0) ? api.slice(s0, s1) : '';

console.log('\n① verify-room 핸들러를 찾는가');
ok(block.length > 500, 'verify-room 블록을 잘라 냈다', `s0=${s0} s1=${s1} len=${block.length}`);

console.log('\n② 조기 통과는 «참관» 만 — 관리자는 조회를 거친다');
const early = block.match(/if \(role === 'observer'\) return json\(\{[^}]*reason: 'privileged'/);
ok(!!early, "role === 'observer' 만 privileged 로 조기 통과한다");
ok(!/role === 'admin' \|\| role === 'observer'/.test(block),
  "옛 조기 통과(role === 'admin' || role === 'observer')가 남아 있지 않다 — 되돌리면 여기서 잡힌다");

console.log('\n③ 관리자에게도 resolved_role 을 준다');
const adminRet = block.match(/if \(isAdminRole\) \{[\s\S]{0,400}?\}/);
ok(!!adminRet, 'isAdminRole 전용 반환이 있다');
ok(!!adminRet && /resolved_role: resolvedRole/.test(adminRet[0]),
  '그 반환에 resolved_role 이 실린다 — 이게 없으면 클라이언트가 내릴 근거를 못 받는다',
  adminRet ? adminRet[0].slice(0, 160) : '');

console.log('\n④ 관리자를 «막지» 는 않는다 (예전과 동일)');
ok(!!adminRet && /authorized: true/.test(adminRet[0]),
  'admin 반환의 authorized 는 언제나 true — 관리자는 어느 방이든 들어갈 수 있어야 한다',
  adminRet ? adminRet[0].slice(0, 160) : '');

console.log('\n⑤ 관리자 세션으로 «이 예약의 학생» 을 확인한다');
const sessBlock = block.match(/if \(!ok\) \{\s*try \{\s*const sess = await checkAdminSession[\s\S]*?\n      \}/);
ok(!!sessBlock, '세션 판정 블록이 있다');
const sb = sessBlock ? sessBlock[0] : '';
ok(/row\.user_id/.test(sb), '그 블록이 row.user_id(예약의 학생)와 대조한다');
ok(/resolvedRole = 'student'/.test(sb), "일치하면 resolvedRole 을 'student' 로 정한다");

console.log('\n⑥ 그 대조를 실제로 돌린다 (문자열 검사가 아니라)');
/* 판정 세 줄만 오려 낸다 — 타입 표기가 없어 그대로 실행할 수 있다 */
const cmp = sb.match(/const su = String\(sess\.username\);[\s\S]*?resolvedRole = 'student'; \}/);
if (!cmp) {
  ok(false, '판정 세 줄을 오려 내지 못했다 — 모양이 바뀌었으면 이 검사도 함께 고칠 것');
} else {
  const run = (rowUserId, sessUser) => {
    const sess = { username: sessUser };
    const row = { user_id: rowUserId };
    let ok2 = false, resolvedRole = null;
    // eslint-disable-next-line no-new-func
    const f = new Function('sess', 'row', `let ok=false,resolvedRole=null;${cmp[0]}return {ok,resolvedRole};`);
    const r = f(sess, row);
    ok2 = r.ok; resolvedRole = r.resolvedRole;
    return { ok: ok2, resolvedRole };
  };
  const a = run('jeong', 'jeong');
  ok(a.ok === true && a.resolvedRole === 'student', '아이디가 같으면 «학생» 으로 판정 (실사고 그림)', JSON.stringify(a));
  const b = run('jeong', 'Jeong');
  ok(b.ok === true && b.resolvedRole === 'student',
    '대소문자만 달라도 «학생» — students_erp.user_id 는 BINARY 라 Kim/kim 이 실재한다', JSON.stringify(b));
  const c = run('otherstudent', 'jeong');
  ok(c.ok === false && c.resolvedRole === null,
    '남의 수업이면 붙이지 않는다 — 여기서 틀리면 «남의 수업의 학생» 이 된다', JSON.stringify(c));
  const d = run('', 'jeong');
  ok(d.ok === false, '예약에 학생 아이디가 없으면 붙이지 않는다', JSON.stringify(d));
  const e = run(null, '');
  ok(e.ok === false, '세션 아이디가 비어도 붙지 않는다', JSON.stringify(e));
}

console.log('\n⑦ 강사 판정이 «먼저» 다 — 강사로 확정되면 학생으로 내리지 않는다');
const iTeacher = sb.indexOf("resolvedRole = 'teacher'");
const iStudent = sb.indexOf("resolvedRole = 'student'");
ok(iTeacher >= 0 && iStudent > iTeacher,
  '같은 블록에서 강사 판정이 학생 판정보다 앞에 있다',
  `teacher@${iTeacher} student@${iStudent}`);

console.log('\n⑧ 이름으로 학생을 붙이지 않는다');
ok(!/student_name/.test(sb),
  '세션 판정은 아이디 완전일치(대소문자만 무시)에서 멈춘다 — 이름으로 넓히지 않는다');

console.log('\n⑨ 클라이언트가 그 값을 실제로 쓰는가');
ok(/resolved_role === 'student'/.test(idx), "idx-main.js 가 resolved_role === 'student' 를 본다");
const dem = idx.match(/if \(_vres && _vres\.resolved_role === 'student' &&[\s\S]{0,160}?\) \{/);
ok(!!dem && /vcMyRole === 'admin'/.test(dem[0]),
  '내림 조건에 admin 이 들어 있다 — 없으면 서버가 알려 줘도 안 내려간다',
  dem ? dem[0].replace(/\s+/g, ' ').slice(0, 150) : '');
ok(/verify-room\?' \+ _vq, \{ credentials: 'include' \}/.test(idx),
  "verify-room 을 credentials:'include' 로 부른다 — 쿠키가 안 가면 세션 판정이 통째로 죽는다");

console.log(`\n──────────────────────────────────────────\n  ✅ PASS ${pass}   ❌ FAIL ${fail}   (총 ${pass + fail})\n`);
process.exit(fail ? 1 : 0);
