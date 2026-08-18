// -*- coding: utf-8 -*-
// 🏯 본사 관리(조직 관리 › 본사) 하네스 (2026-08-18 수정요청 #13)
//   실행: node test-harness/hq_org_profile_harness.mjs
//
// 무엇을 막는가
//   ① «도달 가능성» — 새 /api 경로는 세 관문을 다 통과해야 실제로 동작한다.
//        index.ts 라우팅 게이트 / index.ts 인증 게이트 / api-mango.ts 전달 목록.
//        하나라도 빠지면 조용히 404 다(2026-08-13 teacher-contacts 가 그렇게 먹통이었다).
//   ② «갈라짐» — 본사 법인정보는 두 곳에 있다:
//        · 학부모가 보는 사이트 푸터  public/js/idx-grid-menu.js 의 cs-legal 블록
//        · 관리자 화면에 심는 정본    src/hq-profile.ts
//        둘이 어긋나면 학부모가 보는 사업자정보와 관리자 화면이 다른 말을 한다.
//   ③ «껍데기 회귀» — #hq-table 은 2026-08-08~08-17 동안 «채우는 JS 0곳» 이라
//        열 때마다 "데이터 없음" 만 나왔다. 그 상태로 되돌아가지 않는지 본다.
//   ④ «강사에게 열림» — 사업자등록번호·대표이사는 회사 법인정보다.
//        경로가 '/api/admin/org' 접두사 밖으로 나가면 TEACHER_BLOCKED_PREFIXES 를 벗어난다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const indexTs  = rd('../cloudflare-deploy/src/index.ts');
const mangoTs  = rd('../cloudflare-deploy/src/api-mango.ts');
const adminTs  = rd('../cloudflare-deploy/src/api-admin.ts');
const profTs   = rd('../cloudflare-deploy/src/hq-profile.ts');
const gridJs   = rd('../cloudflare-deploy/public/js/idx-grid-menu.js');
const admHtml  = rd('../cloudflare-deploy/public/admin.html');
const coreJs   = rd('../cloudflare-deploy/public/js/adm-core.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

const API = '/api/admin/org/hq';

console.log('\n[ ① 도달 가능성 — 세 관문 ]');
check('index.ts 라우팅 게이트에 경로가 있다',   indexTs.includes(`path === '${API}' ||`));
check('index.ts 인증 게이트(isAdminPath)에도 있다', indexTs.includes(`if (path === '${API}') return true;`));
check('api-mango.ts 가 handleAdminApi 로 전달한다', mangoTs.includes(`path === '${API}'`));
check('api-admin.ts 에 핸들러가 실제로 있다',   adminTs.includes(`path === '${API}' &&`));

console.log('\n[ ② 강사 차단 — 법인정보는 본사/매니저만 ]');
const blocked = (() => {
  const m = indexTs.match(/const TEACHER_BLOCKED_PREFIXES\s*=\s*\[([\s\S]*?)\];/);
  return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]) : [];
})();
check('TEACHER_BLOCKED_PREFIXES 로 덮인다', blocked.some(p => API.startsWith(p)),
  `덮는 접두사 없음 (목록 ${blocked.length}개)`);

console.log('\n[ ③ 사이트 푸터와 값이 같은가 — 갈라짐 감시 ]');
// src/hq-profile.ts 의 문자열 리터럴을 그대로 읽는다(TS 를 실행하지 않는다).
const val = (k) => {
  const m = profTs.match(new RegExp(`${k}\\s*:\\s*'([^']*)'`));
  return m ? m[1] : null;
};
// memo 는 관리자 화면 전용 설명이라 푸터에 없다 → 대조 대상에서 뺀다.
const MIRRORED = ['name', 'ceo_name', 'business_no', 'address', 'phone', 'email', 'ecommerce_no', 'privacy_officer'];
check('idx-grid-menu.js 에 회사정보 푸터(cs-legal)가 있다', gridJs.includes('cs-legal-title'));
for (const k of MIRRORED) {
  const v = val(k);
  check(`hq-profile.ts 의 ${k} 가 푸터에 그대로 있다`, !!v && gridJs.includes(v), v === null ? '값을 못 읽음' : `"${v}" 없음`);
}

console.log('\n[ ④ 이관 — 비어 있을 때 한 번만 심는다 ]');
check('CREATE TABLE hq_orgs 가 있다', /CREATE TABLE IF NOT EXISTS hq_orgs/.test(adminTs));
check('COUNT 로 «비어 있을 때만» 심는다 (두 번 심지 않음)',
  /SELECT COUNT\(\*\) AS n FROM hq_orgs/.test(adminTs) && /INSERT INTO hq_orgs/.test(adminTs));
check('HQ_PROFILE 를 import 해서 쓴다', adminTs.includes(`from './hq-profile'`) && adminTs.includes('HQ_PROFILE.business_no'));

console.log('\n[ ⑤ 화면 — 껍데기로 되돌아가지 않았는가 ]');
const hqBlock = (() => {
  const i = admHtml.indexOf('id="card-hq-orgs"');
  return i < 0 ? '' : admHtml.slice(Math.max(0, i - 400), i + 4000);
})();
check('본사 관리 하위항목이 감춰져 있지 않다 (display:none / data-unwired 없음)',
  !!hqBlock && !/id="card-hq-orgs"[^>]*display:none/.test(admHtml) && !/data-unwired="1"[^>]*id="card-hq-orgs"/.test(admHtml));
check('목록 검색창(#hq-q)이 있다', admHtml.includes('id="hq-q"'));
check('요구된 7개 컬럼이 그대로다',
  ['본사명', '대표이사', '사업자번호', '주소', '대표전화', '액션'].every(c => hqBlock.includes(c)));
check('푸터의 나머지 항목도 입력칸이 있다 (누락 없이 이관)',
  ['hq-ecommerce', 'hq-privacy', 'hq-email'].every(id => admHtml.includes(`id="${id}"`)));

console.log('\n[ ⑥ 화면 배선 — #hq-table 을 실제로 채우는 코드 ]');
check('adm-core.js 에 loadHqOrgs 가 있다', /function loadHqOrgs\s*\(/.test(coreJs));
check('loadHqOrgs 가 #hq-table 을 채운다', /getElementById\('hq-table'\)/.test(coreJs));
check('API 를 실제로 부른다', coreJs.includes(API));
check('카드를 열면 자동으로 불린다 (CARD_LOADERS)', /'card-hq-orgs':\s*\[loadHqOrgs\]/.test(coreJs));
check('등록·수정·삭제가 모두 배선돼 있다',
  /function saveHqOrg/.test(coreJs) && /function hqEdit/.test(coreJs) && /function hqDelete/.test(coreJs)
  && coreJs.includes("method: 'PATCH'") && coreJs.includes("method: 'DELETE'"));
check('상태에 따라 바뀌는 버튼 라벨이 data-ko/data-en 도 갱신한다 (🌐 토글 대응)',
  /setAttribute\('data-ko'/.test(coreJs) && /_hqSetBtnLabel/.test(coreJs));

console.log('\n' + '─'.repeat(58));
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { FAILS.forEach(f => console.log('    - ' + f)); process.exit(1); }
