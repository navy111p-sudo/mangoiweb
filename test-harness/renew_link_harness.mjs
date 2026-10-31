// -*- coding: utf-8 -*-
// 🔗 수강 연장 «1회용 링크» 안전 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/renew_link_harness.mjs
//   대상:  cloudflare-deploy/src/renew-link.ts        ← 토큰 발급·검증
//          cloudflare-deploy/src/enroll-ops.ts        ← 토큰을 받아 주는 3개 경로
//          cloudflare-deploy/src/auth-token.ts        ← ⛔ 여기엔 절대 섞이면 안 된다
//          cloudflare-deploy/public/enroll.html       ← 토큰을 저장하지 않는다
//
//   이 파일이 지키는 것 —
//     미연장 안내 문자는 **학부모 휴대폰**으로 나간다. 그 폰에는 학생 로그인이 없으므로
//     문자 속 링크는 «로그인 없이 열리는 공개 주소»다. 실제 학생 29,000명이 쓰는 서비스에서
//     그런 주소는 설계가 조금만 헐거워도 계정 탈취가 된다. 그래서 다음을 못 박는다.
//
//     A. 토큰은 «로그인»이 아니다 — 공용 소유자 검증(auth-token.ts)에 섞이지 않는다.
//        이게 깨지면 일기·시험·게임·평가서까지 문자 링크로 열린다.
//     B. 토큰이 통하는 곳은 «연장» 3개뿐이다 (my-current · renew-link · renew-order).
//        특히 새 수강신청(create-order)에는 통하면 안 된다 — 이 링크는 «잇는» 용도다.
//     C. uid 는 토큰이 정한다 — 클라이언트가 보낸 uid 를 믿으면 남의 학생을 연장·결제할 수 있다.
//     D. DB 에는 해시만 저장한다 — 장부가 새도 살아 있는 링크가 나오지 않는다.
//     E. 만료·회수·1회용 — 옛 문자의 링크가 영원히 살아 있으면 회수할 방법이 없다.
//     F. 토큰 원문은 응답·로그에 싣지 않는다.
//     G. 화면은 토큰을 localStorage 에 저장하지 않는다 — 저장하면 그 폰이 학생 계정처럼 굳는다.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const PUB = resolve(__dir, '../cloudflare-deploy/public');

const link = readFileSync(join(SRC, 'renew-link.ts'), 'utf8');
const enroll = readFileSync(join(SRC, 'enroll-ops.ts'), 'utf8');
const authTok = readFileSync(join(SRC, 'auth-token.ts'), 'utf8');
const page = readFileSync(join(PUB, 'enroll.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/** 주석을 걷어낸 «진짜 코드» — 주석에 적힌 단어에 검사가 속지 않게 한다. */
function codeOnly(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const linkC = codeOnly(link);
const enrollC = codeOnly(enroll);
const authC = codeOnly(authTok);
const pageC = page.replace(/\/\*[\s\S]*?\*\//g, '');

console.log('\n[ A. 토큰은 «로그인» 이 아니다 — 공용 소유자 검증에 섞이지 않는다 ]');
check('auth-token.ts 가 renew-link 를 가져오지 않는다 (⛔ 섞이면 개인정보 API 가 통째로 열린다)',
  !/from '\.\/renew-link'/.test(authC), 'auth-token.ts 에 renew-link import 가 생겼다');
check('auth-token.ts 에 연장토큰 관련 코드가 없다',
  !/renew[_-]?token|resolveRenewToken/i.test(authC));
check('renew-link.ts 가 authUidFromRequest 를 쓰지 않는다 (권한이 서로 흘러들지 않게 단방향 유지)',
  !/authUidFromRequest/.test(linkC));

console.log('\n[ B. 토큰이 통하는 곳은 «연장» 4개뿐이다 ]');
const users = [...enrollC.matchAll(/resolveRenewToken\s*\(/g)].length;
// 2026-08-27 quote 추가 — RT(비로그인) 화면의 «표시 금액» 이 본사 기본가로 계산돼
// 결제창 금액(renew-order 가 토큰 uid 로 계산)과 갈리던 것. 견적은 가격 숫자만 돌려주고
// 개인정보·쓰기 권한이 없으므로 토큰 권한 확장이 아니다. 새 사용처를 또 늘리려면
// 같은 기준(읽기 전용·연장 흐름 안)인지 여기서 다시 판단할 것.
check('enroll-ops.ts 안에서만 4번 쓴다 (my-current · renew-link · renew-order · quote)', users === 4, `실제 ${users}번`);
{
  // 다른 모듈이 몰래 가져다 쓰지 않는지 — src 전체를 훑는다
  const others = readdirSync(SRC).filter(f => f.endsWith('.ts') && f !== 'renew-link.ts' && f !== 'enroll-ops.ts')
    .filter(f => /resolveRenewToken/.test(readFileSync(join(SRC, f), 'utf8')));
  check('다른 모듈은 연장토큰을 쓰지 않는다', others.length === 0, others.join(', '));
}
{
  // create-order 블록에 토큰이 들어가면 «아무 상품이나» 살 수 있게 된다
  const i = enrollC.indexOf(`path === '/api/pay/enroll/create-order'`);
  const j = enrollC.indexOf(`path === '/api/pay/enroll/my-current'`, i);
  const blk = (i >= 0 && j > i) ? enrollC.slice(i, j) : '';
  check('create-order(새 수강신청)에는 토큰이 통하지 않는다', !!blk && !/resolveRenewToken/.test(blk),
    blk ? 'create-order 블록에 토큰 검증이 들어갔다' : 'create-order 블록을 찾지 못했다');
}

console.log('\n[ C. uid 는 토큰이 정한다 — 클라이언트가 보낸 uid 를 믿지 않는다 ]');
{
  const i = enrollC.indexOf(`path === '/api/pay/enroll/renew-order'`);
  const j = enrollC.indexOf(`path === '/api/pay/enroll/admin/prices'`, i);
  const blk = (i >= 0 && j > i) ? enrollC.slice(i, j) : '';
  check('renew-order: uid 를 토큰(renewScope.uid)에서 가져온다',
    /renewScope\s*\?\s*renewScope\.uid\s*:/.test(blk), '토큰 uid 우선 사용이 안 보인다');
  /* (2026-08-23) authUidOrAdminSession = authUidGlobal(토큰) → 관리자 세션 쿠키(본인 username 한정) 순의
     로그인 검증 — «토큰이 없을 때만 로그인 검증» 이라는 이 검사의 뜻은 동일하다(연장토큰과는 무관). */
  check('renew-order: 토큰이 없을 때만 로그인 검증으로 내려간다',
    /if\s*\(\s*!renewScope\s*\)\s*\{[\s\S]{0,400}authUid(Global|OrAdminSession)/.test(blk));
  check('renew-order: 이미 쓴 링크는 막는다(중복 결제 방지)',
    /renewScope\?\.used/.test(blk) && /link_already_used/.test(blk));
  check('renew-order: 주문 성공했을 때만 링크를 소진시킨다',
    /res\.status\s*>=\s*200[\s\S]{0,400}markRenewLinkUsed/.test(blk));

  const i2 = enrollC.indexOf(`path === '/api/pay/enroll/my-current'`);
  const j2 = enrollC.indexOf(`path === '/api/pay/enroll/renew-link'`, i2);
  const blk2 = (i2 >= 0 && j2 > i2) ? enrollC.slice(i2, j2) : '';
  check('my-current: 토큰이 있으면 그 uid 를 쓴다 (남의 현황 조회 차단)',
    /scope\s*\?\s*scope\.uid\s*:/.test(blk2));
}

console.log('\n[ D. DB 에는 해시만 저장한다 ]');
check('저장 칼럼 이름이 token_hash 다 (원문 칼럼이 아니다)', /token_hash\s+TEXT\s+PRIMARY KEY/.test(linkC));
check('SHA-256 으로 해시한다', /digest\('SHA-256'/.test(linkC));
check('INSERT 에 원문 토큰을 넣지 않는다',
  /INSERT INTO renew_links[^`]*token_hash/.test(linkC) && !/INSERT INTO renew_links[^`]*\btoken\b\s*,/.test(linkC));
check('조회도 해시로 한다', /WHERE token_hash = \?/.test(linkC));

console.log('\n[ E. 만료·회수·1회용 ]');
check('만료 시각을 저장한다', /expires_at\s+INTEGER\s+NOT NULL/.test(linkC));
check('만료를 검사한다', /row\.expires_at\)\s*<\s*Date\.now\(\)/.test(linkC));
check('회수(revoked)를 검사한다', /Number\(row\.revoked\)\s*===\s*1/.test(linkC));
check('새 링크를 만들면 그 학생의 옛 링크는 죽는다',
  /UPDATE renew_links SET revoked = 1 WHERE uid = \?/.test(linkC));
check('토큰은 32바이트 난수다 (추측 불가)', /getRandomValues\(new Uint8Array\(32\)\)/.test(linkC));
check('형식이 아닌 값은 DB 조회조차 안 한다', /\{40,64\}/.test(linkC));

console.log('\n[ F. 토큰 원문이 새지 않는다 ]');
check('renew-link.ts 에 console 로그가 없다', !/console\.(log|warn|error|info)/.test(linkC));
{
  const i = enrollC.indexOf(`path === '/api/pay/enroll/renew-link'`);
  const j = enrollC.indexOf(`path === '/api/pay/enroll/renew-order'`, i);
  const blk = (i >= 0 && j > i) ? enrollC.slice(i, j) : '';
  check('renew-link 응답이 토큰을 되돌려주지 않는다', !!blk && !/token\s*:/.test(blk));
  check('renew-link 응답에 전화번호를 싣지 않는다', !!blk && !/phone/i.test(blk));
}
{
  const api = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const apiC = codeOnly(api);
  check('관리자 응답이 발급된 토큰 원문을 되돌려주지 않는다',
    !/renew_link:\s*renewLink\s*\?\s*\{[^}]*token/.test(apiC));
}

console.log('\n[ G. 화면이 토큰을 저장하지 않는다 ]');
check('enroll.html 이 토큰을 localStorage 에 넣지 않는다',
  !/localStorage\.setItem\([^)]*\bRT\b/.test(pageC) && !/localStorage\.setItem\([^)]*renew/i.test(pageC));
check('enroll.html 은 주소에서만 토큰을 읽는다',
  /URLSearchParams\(location\.search\)\.get\('rt'\)/.test(pageC));
check('연장 전용 모드에서 새 수강신청 UI 를 접는다',
  /body\.renew-only #app > \.step:not\(#stRenew\)\s*\{\s*display:none !important/.test(page));
check('연장 전용 모드는 자동연장(정기결제) 상자도 접는다 — 카드 등록엔 진짜 로그인이 필요하다',
  /body\.renew-only #autoRenewBox\s*\{\s*display:none !important/.test(page));

console.log('\n[ H. 문자에 실리는 링크 ]');
{
  const api = codeOnly(readFileSync(join(SRC, 'api-admin.ts'), 'utf8'));
  check('B2C 미연장 발송 때 학생별 링크를 발급한다', /issueRenewLink\(env, body\.user_id\)/.test(api));
  check('일괄 발송도 학생별 링크를 발급한다', /issueRenewLink\(env, row\.user_id\)/.test(api));
  check('B2B(미납)에는 연장 링크를 붙이지 않는다', !/isB2c\s*\?\s*[\s\S]{0,80}issueRenewLink[\s\S]{0,40}:\s*await issueRenewLink/.test(api));
  check('링크 주소는 site-url 정본으로 만든다 (workers.dev 손입력 금지)',
    /siteUrl\('\/enroll\.html\?/.test(linkC) && !/workers\.dev/.test(linkC));
}

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 목록:'); for (const f of FAILS) console.log('  · ' + f); }
process.exit(FAIL ? 1 : 0);
