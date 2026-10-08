// 👨‍🎓 학생 상세 «학생 목록» 버튼 → 필리핀 매니저가 /manager(홈)로 튕기지 않는가 (2026-10-08 Melca 제보)
// index.ts managerPortalRedirect 는 /admin.html 을 연 PH 매니저를 /manager 로 보낸다. 탈출구는 ?full=1 하나.
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n); } };
const html = readFileSync('cloudflare-deploy/public/admin/student.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const ts = readFileSync('cloudflare-deploy/src/index.ts', 'utf8');
const links = [...html.matchAll(/<a\b[^>]*href="([^"]*card-students-mgmt[^"]*)"/g)].map(m => m[1]);
ok('학생 목록 링크가 있다', links.length >= 1);
ok('학생 목록 링크가 전부 ?full=1 을 단다', links.length >= 1 && links.every(h => /[?&]full=1\b/.test(h)));
const dash = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*data-ko="📊 대시보드"/g)].map(m => m[1]);
ok('대시보드 링크가 있다', dash.length >= 1);
ok('대시보드 링크도 ?full=1 을 단다(2026-10-08 사장님 — 매니저도 관리자 화면으로)', dash.length >= 1 && dash.every(h => /^\/admin\.html\?full=1\b/.test(h)));
const fn = ts.slice(ts.indexOf('async function managerPortalRedirect'), ts.indexOf('function isAdminPath'));
ok('전제: managerPortalRedirect 의 ?full=1 탈출구가 살아 있다', /searchParams\.get\('full'\)\s*===\s*'1'\)\s*return null/.test(fn));
ok('전제: PH 매니저를 /admin.html 에서 /manager 로 보낸다', /PH_MANAGERS/.test(fn) && /'\/manager'/.test(fn));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
