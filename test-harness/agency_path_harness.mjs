// 🤝 대리점 전용 주소 /agency (2026-10-20 사장님 지시: /manager 는 본사 관리자 화면)
//   managerPortalRedirect() 를 src/index.ts 에서 중괄호 짝으로 오려 내 «실제로» 돌린다.
//   「대리점은 /agency 로 간다」 옆에 「본사·지사·지사본사·강사는 예전 그대로」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IDX = readFileSync(resolve(root, 'cloudflare-deploy/src/index.ts'), 'utf8');
const AUTH = readFileSync(resolve(root, 'cloudflare-deploy/src/auth-admin.ts'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };

function bodyOf(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  let j = src.indexOf('{', src.indexOf('): Promise<Response | null>', i)), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(j + 1, k);
}
let body = bodyOf(IDX, 'async function managerPortalRedirect(');
ok(body.length > 200, '전제: managerPortalRedirect 몸통을 오려 냈다');
body = body.replace(/\{\s*type:\s*string\s*\}/g, '').replace(/ as any/g, '')
           .replace(/let sc:\s*;/, 'let sc;')
           .replace(/let actor:\s*\{[^}]*\};/, 'let actor;')
           .replace(/\(e as any\)/g, '(e)');
let fn;
try {
  fn = new Function('request', 'url', 'path', 'env', 'getScope', 'getAdminActor', 'PH_MANAGERS',
    'return (async () => {' + body + '})();');
} catch (e) { console.log('  ❌ FAIL 컴파일 실패: ' + e.message); fail++; }

async function run(path, scope, actor = { ok: true, isTeacher: false, role: 'hq', username: 'admin' }, search = '') {
  const url = new URL('https://mangoi.ai' + path + search);
  const realRedirect = Response.redirect;
  try {
    const r = await fn({ url: url.toString() }, url, path, {},
      async () => ({ type: scope }), async () => actor, ['mgr_karl']);
    if (!r) return null;
    const loc = new URL(r.headers.get('Location')); return loc.pathname + loc.search;
  } catch (e) { return 'ERR:' + e.message; }
  finally { Response.redirect = realRedirect; }
}
if (fn) {
  // 대리점
  ok(await run('/manager', 'agency') === '/agency', '대리점이 /manager 를 열면 /agency 로');
  ok(await run('/admin.html', 'agency') === '/agency', '대리점이 관리자 첫 화면을 열면 /agency 로');
  ok(await run('/branch', 'agency') === '/agency', '대리점이 /branch 를 열면 /agency 로');
  ok(await run('/agency', 'agency') === null, '대리점은 /agency 에 그대로 머문다');
  ok(await run('/manager', 'agency', undefined, '?tui_paid=1') === '/agency?tui_paid=1', '결제 복귀 쿼리를 들고 옮긴다');
  ok(await run('/manager', 'agency', undefined, '?full=1') === null, '?full=1 탈출구는 그대로');
  // 짝: 다른 역할은 예전 그대로
  ok(await run('/manager', 'hq') === null, '본사는 /manager 에 그대로 (짝)');
  ok(await run('/agency', 'hq') === '/manager', '본사가 /agency 를 열면 /manager 로');
  ok(await run('/manager', 'branch') === '/branch', '지사장은 예전처럼 /branch (짝)');
  ok(await run('/agency', 'branch') === '/branch', '지사장이 /agency 를 열면 /branch 로');
  ok(await run('/manager', 'franchise') === null, '지사본사는 /manager 그대로 (짝)');
  ok(await run('/agency', 'franchise') === '/manager', '지사본사가 /agency 를 열면 /manager 로');
  ok(await run('/admin.html', 'franchise') === '/manager', '지사본사의 관리자 첫 화면은 예전처럼 /manager');
  ok(await run('/agency', 'none', { ok: true, isTeacher: true, role: 'teacher' }) === '/teacher', '강사가 /agency 를 열면 /teacher 로');
}
// 서버 첫 화면 정본
ok(/rr\.role === 'agency' \? '\/agency'/.test(AUTH), '로그인 첫 화면(home_path): 대리점 → /agency');
// 라우팅 3관문: 미인증 리다이렉트 목록 · 화면 서빙 · isAdminPath
ok(/path === '\/agency' \|\| path === '\/agency\/' \|\| path === '\/agency\.html'\n\s*\|\| path === '\/work'/.test(IDX), '미인증이면 로그인 화면으로 보내는 목록에 /agency');
ok(/if \(path === '\/agency'[^\n]*\) \{\s*\n\s*const r = new Request\(new URL\('\/manager\.html'/.test(IDX), '/agency 는 manager.html 을 서빙');
const iAdm = IDX.indexOf('function isAdminPath(');
ok(iAdm > 0 && IDX.indexOf("path === '/agency' || path === '/agency/' || path === '/agency.html') return true;", iAdm) > iAdm, 'isAdminPath 에 /agency (로그인 필수)');
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
