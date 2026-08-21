// -*- coding: utf-8 -*-
/**
 * 🚪 로그아웃 = 서버 세션 폐기 회귀 하니스 (2026-08-21)
 *
 * [사고] 사장님 질문 「학생으로 로그인하면 관리자도 자동으로 열리나?」 를 확인하다 발견.
 *        열리는 것은 학생 로그인 때문이 아니라 **전에 로그인한 관리자 쿠키가 살아 있어서**였고,
 *        그 과정에서 «로그아웃을 눌러도 세션이 안 끊기는» 자리가 세 곳 나왔다.
 *          ① manager.html — 버튼이 `href="/admin/logout"` 이었는데 **그 경로에는 핸들러가 없다.**
 *             src/index.ts 에서 «인증 없이 통과» 목록에만 있고 처리하는 곳이 없어 SPA 폴백으로
 *             홈 화면(index.html)이 떴다. 누른 사람에겐 로그아웃처럼 보이지만 세션은 그대로.
 *          ② js/idx-user-session.js 의 홈 화면 로그아웃 두 개 — localStorage 만 지웠다.
 *          ③ admin.html 의 「🚪 로그아웃 (다른 계정으로)」 — 역시 localStorage 만.
 *        세션의 정본은 **HttpOnly 쿠키 mango_admin_session + D1 admin_sessions** 라서
 *        JS 로는 못 지운다. `POST /api/admin/logout` 외에 방법이 없다. 로그인 유지가 30일이라
 *        공용 PC·분실한 폰에서 그대로 위험이 된다.
 *
 * 여기서 못 박는 것
 *   A. 죽은 경로 `/admin/logout` 로 사람을 보내는 링크가 없다 (핸들러가 없으면 홈 화면이 뜬다)
 *   B. 「로그아웃」 이라고 적힌 자리는 전부 POST /api/admin/logout 을 부른다
 *   C. localStorage 의 'mangoi_admin_session' 만 지우고 끝내는 로그아웃이 없다
 *   D. 서버 쪽 로그아웃 API 가 살아 있고 세션 행을 실제로 지운다
 *
 * ⚠️ 부정 검사(«이 문자열이 없어야 한다»)는 주석을 벗긴 사본으로 한다 —
 *    설명 주석에 그 문자열이 들어가면 자기 주석을 잡는다(CLAUDE.md 2장 함정).
 *
 * 실행: node test-harness/logout_session_revoke_harness.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = process.env.MANGOI_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '');
/** 주석 제거 — 부정 검사 전용 (CLAUDE.md 2장) */
const strip = t => t
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const REVOKE = /fetch\(\s*['"]\/api\/admin\/logout['"]/;

console.log('\n════════ 🚪 로그아웃 = 서버 세션 폐기 ════════\n');

// ── A. 죽은 경로로 사람을 보내지 않는다 ────────────────────────────────
console.log('A. 죽은 경로 /admin/logout');
{
  const idx = read(join(SRC, 'index.ts'));
  // 「인증 없이 통과」 목록에만 있고 실제로 처리하는 곳이 없다는 사실을 기록해 둔다.
  //   (누군가 진짜 핸들러를 만들면 이 검사는 무의미해지지만, 그때는 링크도 살아나므로 무해하다.)
  const declaredPublic = /path === '\/admin\/logout'/.test(idx);
  check('src/index.ts 가 그 경로를 인증-공개로만 알고 있다(핸들러 없음)', declaredPublic,
        '이 전제가 깨지면 아래 링크 금지 검사를 다시 판단할 것');

  const linkers = [];
  for (const f of ['manager.html', 'teacher.html', 'admin.html', 'work.html', 'index.html',
                   'admin/mypage.html', 'admin/exec.html', 'admin/login.html']) {
    const t = strip(read(join(PUB, f)));
    if (/href\s*=\s*["']\/admin\/logout["']/.test(t)) linkers.push(f);
  }
  check('href="/admin/logout" 로 보내는 화면이 없다', linkers.length === 0,
        linkers.length ? ('아직 남음: ' + linkers.join(', ') + ' — 누르면 홈 화면이 뜨고 세션은 살아 있다') : '');
}

// ── B. 로그아웃 자리는 전부 서버에 POST 한다 ───────────────────────────
console.log('\nB. 「로그아웃」 자리가 서버 세션을 끊는가');
{
  const mgr = read(join(PUB, 'manager.html'));
  check('manager.html — 로그아웃이 POST /api/admin/logout 을 부른다', REVOKE.test(mgr));
  check('manager.html — 개인 캐시(mgr_cache_*)를 함께 지운다(공용 PC)',
        /CACHE_PREFIX/.test(mgr) && /localStorage\.removeItem\(k\)|removeItem\(k\)/.test(mgr));

  const ius = read(join(PUB, 'js', 'idx-user-session.js'));
  check('idx-user-session.js — 폐기 헬퍼가 있고 POST 한다',
        /function\s+mangoiRevokeAdminCookie/.test(ius) && REVOKE.test(ius));
  // 두 로그아웃 «각각» 이 부르는지 — 한쪽만 고치면 반쪽이 된다.
  const body = f => {
    const i = ius.indexOf(f);
    return i < 0 ? '' : ius.slice(i, ius.indexOf('\n  };', i) + 5);
  };
  check('idx-user-session.js — 학생 logout() 이 부른다',
        /mangoiRevokeAdminCookie\s*\(/.test(body('window.logout = function')));
  check('idx-user-session.js — logoutAdminSession() 이 부른다',
        /mangoiRevokeAdminCookie\s*\(/.test(body('window.logoutAdminSession = function')));

  const adm = read(join(PUB, 'admin.html'));
  const ph116 = (() => {
    const i = adm.indexOf('window.ph116BackToAdmin');
    return i < 0 ? '' : adm.slice(i, i + 1200);
  })();
  check('admin.html — 「🚪 로그아웃 (다른 계정으로)」 가 POST 한다', REVOKE.test(ph116));

  // 이미 제대로 하고 있던 화면들 — 되돌아가지 않게 함께 못 박는다.
  for (const f of ['teacher.html', 'admin/mypage.html', 'admin/exec.html',
                   'admin/capitown-settlement.html', 'admin/finance-realtime.html']) {
    check(`${f} — 기존 로그아웃이 그대로 POST 한다`, REVOKE.test(read(join(PUB, f))));
  }
}

// ── C. localStorage 만 지우고 끝내는 로그아웃이 없다 ───────────────────
console.log('\nC. localStorage 만 지우고 끝내지 않는가');
{
  // 'mangoi_admin_session' 을 지우는 파일은 같은 파일 안에서 폐기 POST 도 해야 한다.
  //   ⛔ 예외: admin.html 의 admGoLogin() — 「세션이 이미 죽었으니 로그인 화면으로」 라는
  //      복구 경로다(사람이 누르는 로그아웃이 아니다). 그 파일은 ph116 쪽에서 이미 POST 하므로
  //      파일 단위 검사로는 통과한다. 새 파일을 만들 때 이 규칙을 잊지 말 것.
  const files = ['manager.html', 'admin.html', 'js/idx-user-session.js',
                 'admin/capitown-settlement.html'];
  const bad = [];
  for (const f of files) {
    const t = read(join(PUB, f));
    if (!t) continue;
    const clears = /removeItem\(\s*['"]mangoi_admin_session['"]\s*\)/.test(strip(t));
    if (clears && !REVOKE.test(t)) bad.push(f);
  }
  check('세션 키를 지우는 화면은 모두 서버 폐기도 한다', bad.length === 0,
        bad.length ? ('반쪽짜리: ' + bad.join(', ')) : '');
}

// ── D. 서버 쪽이 실제로 세션 행을 지우는가 ─────────────────────────────
console.log('\nD. 서버 /api/admin/logout');
{
  const auth = read(join(SRC, 'auth-admin.ts'));
  const i = auth.indexOf("path === '/api/admin/logout'");
  const seg = i < 0 ? '' : auth.slice(i, i + 900);
  check('POST /api/admin/logout 핸들러가 있다', i >= 0);
  check('admin_sessions 행을 지운다(쿠키만 지우고 끝내지 않는다)',
        /DELETE\s+FROM\s+admin_sessions/i.test(seg),
        '행을 남기면 쿠키를 복사해 둔 쪽이 계속 통과한다');
  check('만료 쿠키를 함께 내려보낸다', /Max-Age=0|clearSessionCookie|expireSessionCookie/.test(seg + auth.slice(0, 400)));
  const idx = read(join(SRC, 'index.ts'));
  check('로그아웃 API 는 인증 없이도 통과한다(만료 세션도 정리 가능)',
        /path === '\/api\/admin\/logout'/.test(idx));
}

console.log('\n──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n실패 목록:'); failures.forEach(f => console.log('  · ' + f)); }
console.log(fail ? '❌ 실패' : '🎉 로그아웃이 실제로 세션을 끊는다.');
process.exit(fail ? 1 : 0);
