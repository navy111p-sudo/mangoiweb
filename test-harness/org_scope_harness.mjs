// -*- coding: utf-8 -*-
// 🏢 조직 명부(지사·대리점) 격리 하니스 — 의존성 없음 · node 로 바로 실행
//   실행:  node test-harness/org_scope_harness.mjs
//   대상:  cloudflare-deploy/src/scope.ts       (scopeFranchiseCond · scopeCenterCond · canEditOrg)
//          cloudflare-deploy/src/api-admin.ts   (/api/admin/franchises · /api/admin/centers)
//          cloudflare-deploy/src/index.ts       (isAgencyAllowedApi)
//          cloudflare-deploy/public/js/adm-core.js (CARD_POLICY · _applyOrgScopeUI)
//
//   무엇을 지키나 (2026-08-18 사장님 수정요청 #03·#04) —
//     조직 관리 화면은 「영업사원·지사장·학원장이 보기 쉽게」 하라고 하신 화면인데,
//     정작 그 셋 중 둘에게 닫혀 있었다:
//       · 대리점(학원장) — 카드 등급이 'branch' 라 **카드째 안 보였다**
//       · 지사장         — 카드는 보이는데 두 API 가 지사 허용목록에 없어 403 → **빈 표**
//     그래서 두 API 를 열었다. 이 하니스의 핵심은 «열었다» 가 아니라 «열되 안 샌다» 이다.
//
//   ⚠️ 이 두 경로는 원래 «전국 목록을 그대로 주는» API 였다. 조건절 하나만 사라져도
//      지사 241건·대리점 921건이 모든 지사장·학원장에게 통째로 나간다.
//      그래서 A(조건절이 SQL 에 실제로 박혔나)와 B(조건 함수가 값마다 맞게 도나)를 둘 다 본다.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = p => readFileSync(resolve(__dir, '..', p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); }
};

const aapi = R('cloudflare-deploy/src/api-admin.ts');
const idx = R('cloudflare-deploy/src/index.ts');
const core = R('cloudflare-deploy/public/js/adm-core.js');
const scopeTs = R('cloudflare-deploy/src/scope.ts');

// 핸들러 본문만 떼어 본다 — 파일 전체에서 찾으면 남의 코드가 통과시켜 준다
const cut = (from, to) => {
  const a = aapi.indexOf(from);
  if (a < 0) return '';
  const b = aapi.indexOf(to, a);
  return aapi.slice(a, b > a ? b : aapi.length);
};
const frBlk = cut("path === '/api/admin/franchises')", "path === '/api/admin/org/hq'");
const ctBlk = cut("path === '/api/admin/centers')", '/api/admin/students/erp-list');

console.log('\n════ 🏢 조직 명부(지사·대리점) 격리 ════');

console.log('\n[ A. 열려 있다 — 지사장·학원장이 자기 조직을 본다 ]');
const allowBlk = idx.slice(idx.indexOf('function isAgencyAllowedApi'),
                           idx.indexOf('function isAgencyAllowedApi') + 4000);
check('지사·대리점 허용목록에 /api/admin/franchises', /'\/api\/admin\/franchises',/.test(allowBlk));
check('지사·대리점 허용목록에 /api/admin/centers', /'\/api\/admin\/centers',/.test(allowBlk));
check('카드 등급이 agency (학원장에게도 카드가 보인다)', /'card-franchises':\s*'agency'/.test(core));
/* 강사는 이 화면에서 계속 막힌다 — 동료·가맹점 명부는 강사 일이 아니다.
   '/api/admin/franchises'·'/api/admin/centers' 는 TEACHER_BLOCKED_PREFIXES 에 이미 있다. */
check('🔴 강사에게는 여전히 닫혀 있다 (TEACHER_BLOCKED_PREFIXES)',
  /'\/api\/admin\/franchises', '\/api\/admin\/org', '\/api\/admin\/centers'/.test(idx));

console.log('\n[ B. 🔒 잘려 있다 — 조건절이 SQL 에 실제로 박혔나 ]');
check('지사 목록이 스코프를 읽는다 (getScope + scopeFranchiseCond)',
  /const _fSc = await getScope\(env as any, request\)/.test(frBlk) &&
  /scopeFranchiseCond\(_fSc, 'f'\)/.test(frBlk));
check('🔴 전체 목록 쿼리에 조건절이 붙는다', /LEFT JOIN master_branches m ON m\.id = mm\.master_id\$\{_fWhere\}/.test(frBlk));
/* 🪤 드롭다운용 fields=min 은 «짧은 목록» 이라 잊기 쉽다. 여기만 빠지면
      「지사 선택…」 칸으로 전국 241건 이름이 그대로 샌다. */
check('🔴 드롭다운용 짧은 목록(fields=min)도 잘린다',
  /SELECT f\.id, f\.name FROM franchises f\$\{_fWhere\}/.test(frBlk));
check('🔴 대표지사 목록(view=master)도 잘린다', /const mWhere = _fCond\.cond/.test(frBlk));
check('대리점 목록이 스코프를 읽는다 (getScope + scopeCenterCond)',
  /const _cSc = await getScope\(env as any, request\)/.test(ctBlk) &&
  /scopeCenterCond\(_cSc, 'c'\)/.test(ctBlk));
check('🔴 대리점 목록 조건절이 «맨 앞»에 들어간다 (뒤 필터가 무엇이든 울타리 안)',
  /if \(_cCond\.cond\) \{ where\.push\(_cCond\.cond\); binds\.push\(\.\.\._cCond\.binds\); \}/.test(ctBlk));
/* 건수(counts)까지 같이 잘려야 한다 — 「목록 3곳인데 총 921곳」 이면 그 숫자가 곧 누설이다.
   centers 는 where/binds 를 목록·건수가 함께 쓰므로 위 한 줄이 둘 다 덮는다. */
check('건수 요약도 같은 where 를 쓴다 (목록 3곳 · 총 921곳 같은 누설 방지)',
  /FROM centers c LEFT JOIN franchises f ON f\.id = c\.franchise_id\$\{whereSql\}/.test(ctBlk));

console.log('\n[ C. ✍️ 고치는 것은 본사만 ]');
check('🔴 지사 등록·대표지사 지정·비활성이 본사만 (403)',
  /if \(!canEditOrg\(_fSc\)\) \{[\s\S]{0,220}forbidden_scope/.test(frBlk));
check('🔴 대리점 등록·결제유형 수정이 본사만 (403)',
  /\(method === 'POST' \|\| method === 'PATCH'\) && !canEditOrg\(_cSc\)[\s\S]{0,220}forbidden_scope/.test(ctBlk));
check('화면에서도 본사 전용 칸을 감춘다 (_applyOrgScopeUI)',
  /function _applyOrgScopeUI/.test(core) && /'card-master-branches', 'card-hq-orgs'/.test(core) &&
  /\['fr-add-btn', 'ct-add-btn'\]/.test(core));
check('🔴 모르는 역할은 막는 쪽으로 떨어진다', /_applyOrgScopeUI\(isHQ\)/.test(core));
/* 🪤 #legacy-cards 안에서 인라인 display 는 «카드들 보이게» 복구 규칙(!important)에 진다.
      역할별 카드 숨김이 PC 에서 통째로 안 먹던 것이 그 때문이었다(#264). 같은 함정 위에 있는
      이 함수도 반드시 .rbac-hide 클래스로 감춰야 한다 — 인라인으로 되돌리면 여기서 걸린다. */
check('감추기가 .rbac-hide 클래스다 (인라인 display 는 PC 에서 진다)',
  /classList\.toggle\('rbac-hide', !hq\)/.test(core) &&
  !/_applyOrgScopeUI[\s\S]{0,900}style\.setProperty\('display'/.test(core));

console.log('\n[ D. 조건 함수가 값마다 맞게 도나 (scope.ts 를 실제로 불러서) ]');
{
  /* scope.ts 를 **실제로 불러서** 값마다 돌려 본다. 소스 문자열만 보면
     「조건이 있긴 한데 값이 비면 LIKE '%' 로 전국이 열린다」 같은 것을 못 잡는다.
     node 는 .ts 를 못 읽으므로 타입만 벗겨 메모리에서 불러온다 —
       · 바깥 import 두 줄은 지운다(이 두 함수는 그것들을 안 쓴다)
       · typescript 가 없으면(설치 전 새 PC 등) 아래 else 로 떨어져 소스 검사로 대신한다 */
  const mod = await (async () => {
    try {
      const src = readFileSync(resolve(__dir, '../cloudflare-deploy/src/scope.ts'), 'utf8')
        .replace(/^import .*$/gm, '')
        .replace(/^export \{ franchiseInClause \};$/gm, '');
      const ts = await import(pathToFileURL(
        resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href);
      const js = (ts.default || ts).transpileModule(src, {
        compilerOptions: { module: 99 /* ESNext */, target: 99 }
      }).outputText;
      return await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
    } catch { return null; }
  })();
  if (!mod) {
    /* node 가 .ts 를 못 읽는 환경이면 문자열로라도 핵심만 본다 —
       조건이 통째로 사라지는 것은 이걸로도 잡힌다. */
    check('(ts 직접 로드 불가 — 소스로 확인) 지사는 이름 앞머리로 자른다',
      /scope\.type === 'branch'[\s\S]{0,220}name LIKE \?/.test(scopeTs));
    check('(소스) 대리점은 자기 이름 한 칸', /scope\.type === 'agency'[\s\S]{0,220}\$\{a\}name = \?/.test(scopeTs));
    check('🔴 (소스) 값이 비면 막는 쪽 (1 = 0)', (scopeTs.match(/cond: '1 = 0'/g) || []).length >= 3);
    check('🔴 (소스) 본사·내부직원만 조건이 빈다', /return \{ cond: '', binds: \[\] \};\s*\/\/ hq · none/.test(scopeTs));
    check('🔴 (소스) IN (?,?,…) 목록을 만들지 않는다 (D1 바인드 100개 한도)',
      !/map\(\(\) => '\?'\)/.test(scopeTs));
    check('(소스) 지사본사는 콤마 문자열 한 개로 맞춘다', /',' \|\| \? \|\| ','/.test(scopeTs));
    check('(소스) 조직 수정 권한은 hq·none 만', /scope\.type === 'hq' \|\| scope\.type === 'none'/.test(scopeTs));
  } else {
    const { scopeFranchiseCond, scopeCenterCond, canEditOrg } = mod;
    const S = (type, value) => ({ type, value, label: '' });
    const f = s => scopeFranchiseCond(s, 'f');
    const c = s => scopeCenterCond(s, 'c');
    check('본사는 조건이 없다 (전국)', f(S('hq', null)).cond === '' && c(S('hq', null)).cond === '');
    check('내부직원(none)도 조건이 없다', f(S('none', null)).cond === '');
    check('지사는 이름 앞머리로 자른다', /name LIKE \?/.test(f(S('branch', '노원')).cond) &&
      f(S('branch', '노원')).binds[0] === '노원%');
    check('대리점은 자기 이름 한 칸', /name = \?/.test(c(S('agency', '노원백점학원')).cond) &&
      c(S('agency', '노원백점학원')).binds[0] === '노원백점학원');
    check('🔴 지사 값이 비면 막는다 (LIKE % 로 전국이 열리면 안 된다)',
      f(S('branch', null)).cond === '1 = 0' && f(S('branch', '')).cond === '1 = 0');
    check('🔴 대리점 값이 비면 막는다', c(S('agency', null)).cond === '1 = 0');
    check('🔴 지사본사 목록이 비면 막는다', f(S('franchise', '')).cond === '1 = 0');
    /* 🪤 바인드를 목록으로 펴면 소유 지사가 100개를 넘는 순간 D1 이 "too many SQL variables"
          로 죽고, 그 예외는 대개 try/catch 에 삼켜져 «빈 표» 로 보인다(CLAUDE.md 함정표). */
    const many = Array.from({ length: 241 }, (_, i) => '지사' + i).join(',');
    check('🔴 지사본사 241개도 바인드 1개 (D1 100개 한도)',
      f(S('franchise', many)).binds.length === 1 && c(S('franchise', many)).binds.length === 1);
    check('지사본사는 쉼표로 감싸 부분일치를 막는다', /',' \|\| \? \|\| ','/.test(f(S('franchise', '노원지사')).cond));
    check('대리점 스코프에서 지사도 자기 것만', /franchise_id IN \(SELECT id FROM franchises/.test(c(S('branch', '노원')).cond));
    check('조직 수정 권한은 본사·내부직원만',
      canEditOrg(S('hq', null)) && canEditOrg(S('none', null)) &&
      !canEditOrg(S('branch', '노원')) && !canEditOrg(S('agency', '가')) && !canEditOrg(S('franchise', '가')));
  }
}

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
