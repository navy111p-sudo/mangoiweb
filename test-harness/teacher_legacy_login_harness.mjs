#!/usr/bin/env node
/**
 * teacher_legacy_login_harness.mjs — 강사 "기존 아이디·비번" 통과 인증 회귀 가드 (2026-07-27)
 *
 * 무엇을 지키는가
 *   ① 옛 LMS 로그인 성공 판정은 **세션이 실제로 열리는지**로만 한다.
 *      (옛 서버가 성공/실패 둘 다 200 + alert 를 주므로 본문 문구로 판정하면 오탐 → 가짜 계정 생성)
 *   ② 자동 생성 계정은 **반드시 강사 권한**(scope_type='teacher'). 이게 풀리면 강사가
 *      회계·정산·권한 API 까지 보게 된다(index.ts TEACHER_BLOCKED_PREFIXES 의 근거).
 *   ③ 비밀번호는 평문으로 저장되지 않는다.
 *   ④ 이미 계정이 있는데 비번이 틀린 경우는 옛 서버로 폴백하지 않는다(새 비번 변경이 무의미해짐).
 *   ⑤ 스위치(LEGACY_TEACHER_LOGIN)·아이디 형식 검사가 옛 서버 호출 **전에** 걸린다.
 */
import { execSync } from 'child_process';
import { readPageSource } from './page-source.mjs';   // 분해 대응: 페이지 코드 전체를 읽는다
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { allSrc } from './_srcbundle.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TS = resolve(root, 'cloudflare-deploy', 'src', 'legacy-teacher-auth.ts');
const OUT = resolve(root, 'test-harness', '.legacy-teacher-auth.built.mjs');

let mod;
try {
  execSync(`npx --yes esbuild "${TS}" --bundle --format=esm --platform=node --outfile="${OUT}"`, { stdio: 'pipe' });
  mod = await import(pathToFileURL(OUT).href + '?t=' + Date.now());
} catch (e) {
  console.error('FAIL: legacy-teacher-auth.ts 컴파일/로드 실패 —', (e && e.message ? String(e.message).split('\n')[0] : e));
  process.exit(1);
} finally {
  try { if (existsSync(OUT)) unlinkSync(OUT); } catch { /* 정리 실패 무시 */ }
}
const { verifyLegacyLmsLogin, provisionTeacherAccount, legacyLoginEnabled } = mod;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label); } };

// ── 가짜 옛 LMS 서버 ──────────────────────────────────────────────
//   POST /login_action.php → 시나리오별 응답, GET / → 세션 유무에 따라 로그인폼으로 튕김
function mockFetch(scenario) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || 'GET' });
    const isPost = (init && init.method) === 'POST';
    if (isPost) {
      const h = new Headers();
      if (scenario.setCookie) for (const c of scenario.setCookie) h.append('set-cookie', c);
      return new Response(scenario.postBody || '<script>alert("아이디를 잘못 입력하셨습니다.");</script>', { status: 200, headers: h });
    }
    // 세션 확인 요청
    const sent = (init && init.headers && init.headers.Cookie) || '';
    if (!scenario.sessionValid || !sent) {
      return new Response('', { status: 302, headers: { location: 'login_form.php' } });
    }
    if (scenario.probe302) return new Response('', { status: 302, headers: { location: scenario.probe302 } });
    return new Response(scenario.probeBody || '<html><body>수업 목록</body></html>', { status: 200 });
  };
  return calls;
}
const ENV = { DB: null, LEGACY_LMS_BASE: 'https://legacy.test/lms' };

console.log('\n▶ 1. 옛 LMS 통과 인증 판정');

// 실패 — 쿠키를 아예 안 준다(아이디 오류)
mockFetch({ setCookie: [], sessionValid: false });
let r = await verifyLegacyLmsLogin(ENV, 'teacher01', 'pw12345');
ok(r.ok === false && r.reason === 'no_session_cookie', '쿠키 없음 → 실패(no_session_cookie)');

// 실패 — 쿠키는 줬지만 세션 확인에서 로그인폼으로 튕김(비번 오류)
mockFetch({ setCookie: ['PHPSESSID=abc; path=/'], sessionValid: false });
r = await verifyLegacyLmsLogin(ENV, 'teacher01', 'pw12345');
ok(r.ok === false && r.reason === 'not_authenticated', '쿠키만 있고 세션 무효 → 실패(not_authenticated)');

// 🔴 핵심: 실패 응답에 alert 가 없어도(문구 변경) 세션이 무효면 실패여야 한다
mockFetch({ setCookie: ['PHPSESSID=abc; path=/'], postBody: '<html>OK</html>', sessionValid: false });
r = await verifyLegacyLmsLogin(ENV, 'teacher01', 'pw12345');
ok(r.ok === false, 'alert 문구가 없어져도 세션 무효면 실패 (본문 문구로 판정하지 않음)');

// 🔴 핵심: 성공 응답에 alert("환영합니다") 가 섞여도 세션이 유효하면 성공이어야 한다
mockFetch({ setCookie: ['PHPSESSID=abc; path=/'], postBody: '<script>alert("환영합니다");location.href="main.php";</script>', sessionValid: true });
r = await verifyLegacyLmsLogin(ENV, 'teacher01', 'pw12345');
ok(r.ok === true, 'alert 가 있어도 세션 유효면 성공 (성공 alert 오탐 방지)');

// 성공 — 세션 확인이 다른 곳으로 리다이렉트
mockFetch({ setCookie: ['PHPSESSID=abc; path=/'], sessionValid: true, probe302: 'main.php' });
r = await verifyLegacyLmsLogin(ENV, 'teacher01', 'pw12345');
ok(r.ok === true, '세션 확인이 main.php 로 이동 → 성공');

// 실패 — 200 이지만 로그인 폼이 그려짐
mockFetch({ setCookie: ['PHPSESSID=abc; path=/'], sessionValid: true, probeBody: '<input name="ApplyMemberLoginPW">' });
r = await verifyLegacyLmsLogin(ENV, 'teacher01', 'pw12345');
ok(r.ok === false && r.reason === 'not_authenticated', '200 인데 로그인 폼이면 실패');

// 삭제 지시 쿠키(deleted)는 세션으로 치지 않는다
mockFetch({ setCookie: ['RememberAdminID=deleted; Max-Age=0'], sessionValid: true });
r = await verifyLegacyLmsLogin(ENV, 'teacher01', 'pw12345');
ok(r.ok === false && r.reason === 'no_session_cookie', 'deleted 쿠키만 오면 세션 없음으로 처리');

console.log('\n▶ 2. 옛 서버를 부르기 전에 걸러내는 것들');

let calls = mockFetch({ setCookie: ['PHPSESSID=a'], sessionValid: true });
r = await verifyLegacyLmsLogin({ ...ENV, LEGACY_TEACHER_LOGIN: 'off' }, 'teacher01', 'pw12345');
ok(r.ok === false && r.reason === 'disabled' && calls.length === 0, '스위치 off → 옛 서버 호출 0회');

calls = mockFetch({ setCookie: ['PHPSESSID=a'], sessionValid: true });
r = await verifyLegacyLmsLogin(ENV, 'bad id!<script>', 'pw12345');
ok(r.ok === false && r.reason === 'id_format' && calls.length === 0, '이상한 아이디 → 옛 서버 호출 0회');

calls = mockFetch({ setCookie: ['PHPSESSID=a'], sessionValid: true });
r = await verifyLegacyLmsLogin(ENV, 'teacher01', 'ab');
ok(r.ok === false && r.reason === 'id_format' && calls.length === 0, '너무 짧은 비번 → 옛 서버 호출 0회');

ok(legacyLoginEnabled({}) === true && legacyLoginEnabled({ LEGACY_TEACHER_LOGIN: 'off' }) === false, '스위치 기본값 = 켜짐, "off" 로만 꺼짐');

console.log('\n▶ 3. 계정 자동 생성 — 강사 권한 고정 · 평문 비번 금지');

const stmts = [];
const dbStub = {
  exec: async (sql) => { stmts.push({ sql, binds: [] }); },
  prepare: (sql) => ({ bind: (...b) => ({ run: async () => { stmts.push({ sql, binds: b }); } }) }),
};
await provisionTeacherAccount({ DB: dbStub }, 'anna.cruz@example.com', 'SALT$deadbeef', { name: 'Anna Cruz', teacher_id: '77', matched: true });
const scopeStmt = stmts.find(s => /INSERT INTO admin_scope/i.test(s.sql));
ok(!!scopeStmt && /'teacher'/.test(scopeStmt.sql), 'admin_scope 에 scope_type=teacher 고정 저장');
ok(!!scopeStmt && /DO UPDATE SET scope_type='teacher'/.test(scopeStmt.sql), '이미 있는 스코프도 teacher 로 되돌림(권한 상승 방지)');
const acctStmt = stmts.find(s => /INSERT INTO admin_account/i.test(s.sql));
ok(!!acctStmt && acctStmt.binds.includes('SALT$deadbeef'), 'admin_account 에 해시 저장');
ok(!!acctStmt && !acctStmt.binds.some(b => typeof b === 'string' && /^pw|password$/i.test(b)), '평문 비밀번호는 바인딩되지 않음');
ok(stmts.some(s => /teacher_legacy_accounts/i.test(s.sql)), '이관 현황 테이블에 기록(관리자 확인용)');

console.log('\n▶ 4. 소스 가드 (구조가 되돌려지면 실패)');

const SRC = allSrc();
ok(/scopeType === 'teacher'\)\s*return \{ role: 'teacher'/.test(SRC),
   "resolveRole 이 scope_type='teacher' 를 교사로 판정");
ok(/if \(!row\) \{[\s\S]{0,400}?legacyLoginEnabled/.test(SRC),
   '계정이 없을 때(!row)만 옛 LMS 폴백 진입');
ok(/} else \{[\s\S]{0,200}?verifyPassword\(password, row\.password_hash\)[\s\S]{0,200}?wrong_password/.test(SRC),
   '계정이 있으면 새 시스템 비번만 검증(옛 비번으로 우회 불가)');
ok(/hashPassword\(password\)[\s\S]{0,200}?provisionTeacherAccount/.test(SRC),
   '자동 생성 시 새 방식으로 해시한 뒤 저장');

const TOML = readFileSync(resolve(root, 'cloudflare-deploy', 'wrangler.toml'), 'utf8');
const varsHits = (TOML.match(/^LEGACY_TEACHER_LOGIN\s*=/gm) || []).length;
ok(varsHits >= 2, 'wrangler.toml [vars] 와 [env.production.vars] 양쪽에 스위치 존재 (한쪽만 = 운영 미적용)');

const IDX = readPageSource('index.html');   // 분해 대응
// 🇵🇭 (2026-08-02) 강사 목적지가 /admin/mypage → /teacher (초경량 강사 포털)로 바뀌었다.
//   이 가드가 지키려는 것은 목적지 문자열이 아니라 **판정 순서**다:
//   교사 판정이 아이디 접두사(capi…)보다 먼저여야 한다. 순서가 뒤집히면 옛 LMS 에서 넘어온
//   강사(아이디가 capi… 로 시작할 수 있음)가 캐피타운 정산 화면으로 새어 나간다.
//   주석이 사이에 들어가도 깨지지 않도록 '순서'만 본다.
{
  /* (2026-08-20) 첫 화면 판정의 «정본» 이 서버(auth-admin.ts 의 home_path)로 옮겨졌다.
     ⚠️ 글자 `var dest = '/admin.html';` 을 그대로 찾던 옛 검사는 서버 값을 얹는 순간 깨졌다.
        깨진 것은 «보호» 가 아니라 «찾는 글자» 다 — 지켜야 할 것은 순서뿐이니 순서만 본다. */
  const iDest = IDX.search(/var dest = .*'\/admin\.html'/);
  const iTeacher = IDX.indexOf("String(role).indexOf('teacher') >= 0", iDest);
  const iCapi = IDX.indexOf("uid.indexOf('capi') === 0", iDest);
  ok(iDest >= 0 && iTeacher > iDest && iCapi > iTeacher,
     '홈 로그인(폴백): 교사 판정이 아이디 접두사(capi…)보다 먼저');

  /* 🏠 서버가 정하는 쪽도 같은 순서를 지켜야 한다. isTeacher 를 먼저 거르지 않으면
        capi… 아이디를 가진 옛 LMS 강사가 매니저 포털로 새어 나간다. 화면 폴백만 지키면
        정작 «정본» 이 뚫린 채로 통과한다. */
  const AUTH = readFileSync(resolve(root, 'cloudflare-deploy', 'src', 'auth-admin.ts'), 'utf8');
  const iHome = AUTH.indexOf('const homePath =');
  const iIsT  = AUTH.indexOf('isTeacher ?', iHome);
  const iRole = AUTH.indexOf("rr.role === 'branch'", iHome);
  ok(iHome >= 0 && iIsT > iHome && iRole > iIsT,
     '서버 home_path: 교사 판정이 역할 판정보다 먼저');
  ok(/indexOf\('teacher'\) >= 0\) dest = '\/teacher'/.test(IDX),
     '홈 로그인: 교사는 초경량 강사 포털(/teacher)로 이동');
}
const LGN = readFileSync(resolve(root, 'cloudflare-deploy', 'public', 'admin', 'login.html'), 'utf8');
ok(/!data\.is_teacher && \(uid === 'capitown'/.test(LGN),
   '관리자 로그인 화면: 교사는 캐피타운 정산 화면으로 새지 않음');

// 🚪 (2026-08-02 실사고) 화면 경로를 isAdminPath 에만 등록하고 미들웨어의 '로그인 리다이렉트
//   목록'에 빠뜨리면, 인증은 걸리지만 **API 취급**이 되어 로그아웃 상태에서 로그인 화면 대신
//   {"ok":false,"error":"auth_required"} JSON 원문이 화면에 뜬다. 실제로 /teacher 가 그렇게
//   배포됐다(라이브 401 확인 → 즉시 수정). 두 곳에 다 있는지 소스로 못박는다.
{
  const SRC_IDX = readFileSync(resolve(root, 'cloudflare-deploy', 'src', 'index.ts'), 'utf8');
  ok(/path === '\/teacher' \|\| path === '\/teacher\/' \|\| path === '\/teacher\.html'\) return true/.test(SRC_IDX),
     '/teacher 가 isAdminPath 에 등록됨 (로그인 필수)');
  const iRedir = SRC_IDX.indexOf('HTML 페이지 → 로그인 화면으로 리다이렉트');
  const iBlockEnd = SRC_IDX.indexOf('const next = encodeURIComponent', iRedir);
  const redirBlock = iRedir >= 0 ? SRC_IDX.slice(iRedir, iBlockEnd) : '';
  ok(redirBlock.includes("path === '/teacher'"),
     '/teacher 가 미인증 리다이렉트 목록에도 등록됨 (JSON 401 노출 방지)');
}

console.log(`\n${fail === 0 ? '✅ PASS' : '❌ FAIL'} ${pass}건 통과 / ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
