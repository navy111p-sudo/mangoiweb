// -*- coding: utf-8 -*-
// 💳 결제관리 화면(ph106) 실데이터 API 도달 가능성 하니스 (2026-08-18)
//   실행: node test-harness/payments_board_gate_harness.mjs
//
//   왜 만들었나 —
//     /api/admin/payments/b2b · b2c 는 핸들러(payments-board.ts)도 있고 화면(adm-q7.js)도
//     붙었는데 **라우팅 게이트 두 곳에 등록이 빠져** 라이브에서 404 였다.
//     화면에는 KPI 4칸이 전부 «—» 로 뜨고 표에는 «통장 입금을 불러오지 못했습니다 — HTTP 404».
//     인증이 접두사로 자동으로 덮이니 «등록 끝» 으로 보였던 것이 함정이었다 —
//     인증은 «누가 볼 수 있나» 만 정하고, 라우팅은 따로 경로를 하나씩 적어야 한다.
//
//   새 /api 경로는 세 관문을 전부 통과해야 실제로 동작한다:
//     ① src/index.ts     라우팅 게이트   (없으면 handleMangoApi 까지 못 감 → 404)
//     ② src/index.ts     인증 default-deny (/api/admin/ 로 시작하면 자동. 단 isAdminPublicApi
//                        예외에 들어가면 무인증 공개가 된다 — 그것만 감시한다)
//     ③ src/api-mango.ts 위임 목록       (없으면 handleAdminApi 까지 못 감 → 404)
//
//   ⚠️ 처음 쓸 때 ②를 «'/api/admin/payments' 문자열이 index.ts 에 있는가» 로 검사했는데,
//      그 문자열은 인증 게이트가 아니라 TEACHER_BLOCKED_PREFIXES(강사 차단 목록)의 것이었다.
//      인증 게이트를 통째로 지워도 초록불이 유지되는 «가짜 감시» 였다 — 지금은 default-deny
//      블록 자체를 본다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const indexTs  = rd('../cloudflare-deploy/src/index.ts');
const mangoTs  = rd('../cloudflare-deploy/src/api-mango.ts');
const adminTs  = rd('../cloudflare-deploy/src/api-admin.ts');
const boardTs  = rd('../cloudflare-deploy/src/payments-board.ts');
const q7Js     = rd('../cloudflare-deploy/public/js/adm-q7.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const PATHS = ['/api/admin/payments/b2b', '/api/admin/payments/b2c'];

/* 라우팅 게이트는 «if (path.startsWith('/api/attendance') || …)» 한 덩어리다.
   그 안에서 경로를 찾는다 — 파일 아무 데나 문자열이 있는 것으로는 안 된다. */
const routeGate = (() => {
  const at = indexTs.indexOf("path.startsWith('/api/attendance')");
  if (at < 0) return '';
  const end = indexTs.indexOf('handleMangoApi(request, url, env, ctx)', at);
  return end > at ? indexTs.slice(at, end) : '';
})();

/* isAdminPublicApi() 본문 — 여기 들어간 경로는 무인증 공개다. */
const publicFn = (() => {
  const at = indexTs.indexOf('function isAdminPublicApi(');
  return at < 0 ? '' : indexTs.slice(at, indexTs.indexOf('\nfunction ', at + 10) + 1 || at + 6000);
})();

/* 강사 차단 목록 — TEACHER_BLOCKED_PREFIXES 배열 안만 본다. */
const teacherBlocked = (() => {
  const at = indexTs.indexOf('const TEACHER_BLOCKED_PREFIXES = [');
  return at < 0 ? '' : indexTs.slice(at, indexTs.indexOf('];', at));
})();

/* 위임 목록은 handleAdminApi 호출 «직전» 의 if 조건이다. */
const mangoGate = (() => {
  const end = mangoTs.indexOf('const rAdmin = await handleAdminApi(');
  if (end < 0) return '';
  return mangoTs.slice(Math.max(0, end - 12000), end);
})();

console.log('\n[ 도달 가능성 — 세 관문을 다 통과하는가 ]');
check('라우팅 게이트 덩어리를 index.ts 에서 찾았다', routeGate.length > 0);
check('위임 목록 덩어리를 api-mango.ts 에서 찾았다', mangoGate.length > 0);
for (const p of PATHS) {
  check(`① index.ts 라우팅 게이트에 ${p} 가 있다`, routeGate.includes(`'${p}'`));
  check(`③ api-mango.ts 위임 목록에 ${p} 가 있다`, mangoGate.includes(`'${p}'`));
}
/* ② 인증 — /api/admin/ default-deny 가 자동으로 덮는다. 경로별 등록이 필요 없는 대신,
      ⓐ default-deny 블록이 살아 있어야 하고 ⓑ 공개 예외로 새 나가면 안 된다. */
const denyBlock = (() => {
  const at = indexTs.indexOf("if (path.startsWith('/api/admin/')) {");
  return at < 0 ? '' : indexTs.slice(at, at + 400);
})();
check('② index.ts 에 /api/admin/ default-deny 블록이 살아 있다',
  denyBlock.includes('isAdminPublicApi(path, method)') && /return true;/.test(denyBlock));
for (const p of PATHS) {
  check(`② ${p} 가 isAdminPublicApi 공개 예외에 없다`,
    !(publicFn.includes(`'${p}'`) || publicFn.includes(`'${p}/`)));
}
/* 강사 차단 — 회사 재무라 강사에게는 닫혀 있어야 한다(인증 게이트와는 별개 목록). */
check("강사 차단 목록에 '/api/admin/payments' 접두사가 있다",
  teacherBlocked.includes("'/api/admin/payments'"));

console.log('\n[ 핸들러·화면이 같은 주소를 본다 ]');
for (const p of PATHS) {
  check(`payments-board.ts 가 ${p} 를 처리한다`, boardTs.includes(`'${p}'`));
  check(`adm-q7.js 가 ${p} 를 부른다`, q7Js.includes(p));
}
check('api-admin.ts 가 handlePaymentsBoardApi 를 부른다',
  adminTs.includes('handlePaymentsBoardApi(request, url, env'));


console.log('');
if (FAIL) { console.log(`  ${PASS} PASS / ${FAIL} FAIL`); FAILS.forEach(f => console.log('   - ' + f)); process.exit(1); }
console.log(`  ${PASS} PASS / 0 FAIL`);
