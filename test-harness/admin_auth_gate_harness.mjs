// -*- coding: utf-8 -*-
// 🔒 관리자 인증 게이트 회귀 하니스 (2026-07-27)
//   실행:  node test-harness/admin_auth_gate_harness.mjs
//
//   왜 있나:
//     관리자 화면 인증이 "경로를 한 줄씩 등록하는 allowlist" 였던 탓에, 새 화면을 만들면서
//     등록을 빠뜨리면 그 페이지가 로그인 없이 그대로 내려갔다. 실제로 두 번 뚫렸다 —
//       · 2026-07-22 /admin/capitown-settlement.html (정산표 소스보기 노출)
//       · 2026-07-27 /admin/ghost-view.html (수업 관찰)
//     그래서 게이트를 DEFAULT-DENY 로 바꿨고, 그게 되돌아가지 않는지 여기서 지킨다.
//
//   방식: 네트워크 없이 소스 계약만 검사한다(배포 전 게이트에서 돌아야 하므로).
//         라이브 확인은 별도 — curl -si https://mango-i.com/admin/ghost-view.html → 302 여야 한다.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const indexTs = readFileSync(join(CF, 'src', 'index.ts'), 'utf8');
const mangoTs = readFileSync(join(CF, 'src', 'api-mango.ts'), 'utf8');

// 함수 본문만 잘라내는 헬퍼 (다음 최상위 function 선언 전까지)
function fnBody(src, name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return '';
  const rest = src.slice(i);
  const end = rest.indexOf('\nfunction ', 1);
  return end < 0 ? rest : rest.slice(0, end);
}

console.log('\n═══ ① 관리자 화면 DEFAULT-DENY ═══');
const isAdminPathBody = fnBody(indexTs, 'isAdminPath');
check('isAdminPath() 를 찾았다', isAdminPathBody.length > 0);
check(
  "isAdminPath() 가 '/admin/' 로 시작하는 모든 경로를 인증 대상으로 잡는다 (DEFAULT-DENY)",
  /path\.startsWith\('\/admin\/'\)\s*\)?\s*return true/.test(isAdminPathBody)
);
check(
  'isAdminPath() 가 /admin, /admin.html 도 잡는다',
  /path === '\/admin'/.test(isAdminPathBody) && /path === '\/admin\.html'/.test(isAdminPathBody)
);
check(
  '/api/admin/* 기본거부 규칙이 그대로 있다',
  /path\.startsWith\('\/api\/admin\/'\)/.test(isAdminPathBody)
);

console.log('\n═══ ② 로그인 화면은 예외로 남아 있다 (게이트가 자기 자신을 막지 않음) ═══');
const isAuthPublicBody = fnBody(indexTs, 'isAuthPublicPath');
check("isAuthPublicPath() 가 '/admin/login' 을 통과시킨다", /'\/admin\/login'/.test(isAuthPublicBody));
check("isAuthPublicPath() 가 '/admin/login.html' 을 통과시킨다", /'\/admin\/login\.html'/.test(isAuthPublicBody));
check("isAuthPublicPath() 가 '/api/admin/login' 을 통과시킨다", /'\/api\/admin\/login'/.test(isAuthPublicBody));

console.log('\n═══ ③ public/admin/ 아래에 정적자산이 없다 ═══');
//   DEFAULT-DENY 는 /admin/ 아래 **모든** 요청을 막는다. 여기에 js·css·img 를 넣으면
//   로그인 페이지가 자기 리소스를 못 불러온다. 자산은 /js, /css 루트에 두어야 한다.
const adminDir = join(CF, 'public', 'admin');
const adminFiles = existsSync(adminDir) ? readdirSync(adminDir) : [];
const nonHtml = adminFiles.filter(f => !f.endsWith('.html'));
check(`public/admin/ 은 .html 만 있다 (현재 ${adminFiles.length}개, 비-html ${nonHtml.length}개)`, nonHtml.length === 0);
if (nonHtml.length) console.log('     ↳ 비-html:', nonHtml.join(', '));

console.log('\n═══ ④ 과거에 뚫렸던 화면이 다시 공개로 새지 않는다 ═══');
//   이 두 개는 실제로 무인증 노출됐던 경로다. 이름을 박아 두어 재발을 즉시 잡는다.
for (const p of ['/admin/ghost-view.html', '/admin/capitown-settlement.html']) {
  check(`${p} 이 isAuthPublicPath 예외 목록에 없다`, !isAuthPublicBody.includes(p.replace('.html', '')) || !isAuthPublicBody.includes(p));
}
check('ghost-view.html 파일이 실제로 public/admin/ 에 있다(경로 오타 방지)', adminFiles.includes('ghost-view.html'));

console.log('\n═══ ⑤ 수업방 API 인증 (invite · kick · members) ═══');
//   room_id 만 알면 누구나 참가자를 강제 퇴장시키거나 명단을 조회할 수 있었다.
check(
  '_requireAdminForRoom 가드 함수가 있다',
  /_requireAdminForRoom\s*=\s*async/.test(mangoTs)
);
check(
  '가드가 checkAdminSession 으로 판정한다',
  /_requireAdminForRoom[\s\S]{0,400}?checkAdminSession/.test(mangoTs)
);
for (const [label, re] of [
  ['invite', /\/invite\$\/\);[\s\S]{0,220}?_requireAdminForRoom/],
  ['kick',   /\/kick\$\/\);[\s\S]{0,220}?_requireAdminForRoom/],
  ['members',/\/members\$\/\);[\s\S]{0,220}?_requireAdminForRoom/],
]) {
  check(`/api/rooms/:id/${label} 핸들러가 가드를 통과해야 실행된다`, re.test(mangoTs));
}

console.log('\n═══ ⑥ join 폴백에서 role 권한 상승이 막혀 있다 ═══');
//   과거: {allow_open:true, role:'teacher'} 로 아무나 교사 권한 방 토큰을 받을 수 있었다.
const allowOpenBlock = (mangoTs.match(/if \(b\.allow_open === true\) \{[\s\S]{0,900}?\n        \} else \{/) || [''])[0];
check('allow_open 폴백 블록을 찾았다', allowOpenBlock.length > 0);
check(
  "allow_open 폴백이 클라이언트 body.role 을 쓰지 않는다",
  allowOpenBlock.length > 0 && !/b\.role/.test(allowOpenBlock)
);
check(
  "allow_open 폴백이 role 을 'student' 로 고정한다",
  /role = 'student';/.test(allowOpenBlock)
);

console.log('\n' + '═'.repeat(56));
console.log(`  결과: ${PASS} PASS, ${FAIL} FAIL`);
if (FAIL) {
  console.log('  실패 항목:');
  for (const f of FAILS) console.log('   · ' + f);
  console.log('\n  ⚠ 인증 게이트가 약해졌습니다. 배포하지 마세요.');
}
process.exit(FAIL ? 1 : 0);
