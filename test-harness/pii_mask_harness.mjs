// -*- coding: utf-8 -*-
// 🧪 PII 마스킹 보안 하니스 (실제 코드 실행 + 소스 와이어링 검증)
//   실행:  node test-harness/pii_mask_harness.mjs
//   사전:  npx tsc 로 src/pii-mask.ts → test-harness/.build/pii2/pii-mask.js 컴파일됨
//
//   검증 범위:
//     [1] 백엔드(컴파일된 실제 pii-mask.js) 함수 동작
//     [2] 프런트(public/js/pii-mask.js) 함수 동작
//     [3] TS ↔ JS 출력 패리티 (두 구현이 같은 결과를 내는가)
//     [4] 보안 불변식: 권한 판정 / 마스킹 누락 0 / 원본 불변
//     [5] 소스 와이어링: api-mango.ts · admin.html 에 실제로 연결됐는가
import { readFileSync, mkdirSync } from 'node:fs';
import { allSrc, allAdm } from './_srcbundle.mjs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
function eq(name, a, b){ check(`${name}  => ${JSON.stringify(a)}`, JSON.stringify(a) === JSON.stringify(b)); }

// ── 실제 코드 로드 ──────────────────────────────────────────────────
// 백엔드(src/pii-mask.ts) 자동 컴파일 → .build/pii2/pii-mask.js (사전 tsc 불필요)
const __BE_OUT = resolve(__dir, '.build/pii2/pii-mask.js');
try {
  mkdirSync(dirname(__BE_OUT), { recursive: true });
  execSync('npx --yes esbuild "' + resolve(__dir, '../cloudflare-deploy/src/pii-mask.ts') + '" --bundle --format=esm --platform=node --outfile="' + __BE_OUT + '"', { stdio: 'pipe' });
} catch (e) {
  console.error('  ⚠ pii-mask.ts 컴파일 실패 — esbuild 필요(npx esbuild):', (e && e.message ? String(e.message).split('\n')[0] : e));
  process.exit(1);
}
const BE = await import(pathToFileURL(__BE_OUT).href);   // 컴파일된 백엔드
const winSandbox = {}; global.window = winSandbox;
require(resolve(__dir, '../cloudflare-deploy/public/js/pii-mask.js')); // 프런트 → window.PIIMask
const FE = winSandbox.PIIMask;

const srcApi  = allSrc();
const srcHtml = allAdm();

// 공통 케이스 (입력, 기대 전화, 기대ID는 별도)
const PHONE_CASES = [
  ['010-1234-5678', '010-1234-****'],
  ['01012345678',   '010-1234-****'],
  ['010 1234 5678', '010-1234-****'],
  ['02-123-4567',   '02-123-****'],
  ['02-1234-5678',  '02-1234-****'],
  ['',              ''],
  [null,            ''],
  [undefined,       ''],
  ['010-1234-****', '010-1234-****'],   // 멱등
];
const ID_CASES = [
  ['kakao_id',           'kak***'],
  ['navy111p@gmail.com', 'nav***@gmail.com'],
  ['ab',                 'a***'],
  ['',                   ''],
  [null,                 ''],
  ['kak***',             'kak***'],     // 멱등
  ['nav***@gmail.com',   'nav***@gmail.com'],
];

console.log('\n[1] 백엔드(컴파일된 pii-mask.js) 동작');
for (const [inp, exp] of PHONE_CASES) eq(`maskPhoneNumber(${JSON.stringify(inp)})`, BE.maskPhoneNumber(inp), exp);
for (const [inp, exp] of ID_CASES)    eq(`maskKakaoId(${JSON.stringify(inp)})`,    BE.maskKakaoId(inp),    exp);

console.log('\n[2] 프런트(public/js/pii-mask.js) 동작');
for (const [inp, exp] of PHONE_CASES) eq(`maskPhoneNumber(${JSON.stringify(inp)})`, FE.maskPhoneNumber(inp), exp);
for (const [inp, exp] of ID_CASES)    eq(`maskKakaoId(${JSON.stringify(inp)})`,    FE.maskKakaoId(inp),    exp);

console.log('\n[3] TS ↔ JS 출력 패리티 (불일치 시 한쪽만 고쳐진 회귀 탐지)');
const PARITY = ['010-1234-5678','01012345678','029876543','+82 10 1234 5678','12345','010-1234-****','007', null];
for (const v of PARITY) eq(`phone 패리티 ${JSON.stringify(v)}`, BE.maskPhoneNumber(v), FE.maskPhoneNumber(v));
for (const v of ['kakao_id','a@b.com','xy','HELLO_world','kak***',null,'']) eq(`id 패리티 ${JSON.stringify(v)}`, BE.maskKakaoId(v), FE.maskKakaoId(v));

console.log('\n[4] 보안 불변식');
// 4-1 권한 판정
eq('canViewPII hq=true',     BE.canViewPII({type:'hq'}),     true);
eq('canViewPII none=true',   BE.canViewPII({type:'none'}),   true);
eq('canViewPII branch=false',BE.canViewPII({type:'branch'}), false);
eq('canViewPII agency=false',BE.canViewPII({type:'agency'}), false);
eq('canViewPII null=false',  BE.canViewPII(null),            false);
eq('canViewPII undefined=false', BE.canViewPII(undefined),   false);
eq('canViewPII unknown=false', BE.canViewPII({type:'xyz'}),  false);

// 4-2 마스킹 누락 0 — 제한 권한이면 모든 PII 컬럼이 가려져야 한다
const row = () => ({ user_id:'u1', name:'홍길동', student_phone:'010-1111-2222', parent_phone:'010-3333-4444',
                     teacher_phone:'010-5555-6666', kakao_id:'gildong_k', parent_kakao_id:'parent_kk',
                     email:'gd@example.com', shop_name:'강남대리점', points:100 });
const masked = BE.maskRecordPII(row());
check('student_phone 마스킹됨', /\*\*\*\*$/.test(masked.student_phone));
check('parent_phone 마스킹됨',  /\*\*\*\*$/.test(masked.parent_phone));
check('teacher_phone 마스킹됨', /\*\*\*\*$/.test(masked.teacher_phone));
check('kakao_id 마스킹됨',      masked.kakao_id.includes('***'));
check('parent_kakao_id 마스킹됨', masked.parent_kakao_id.includes('***'));
check('email 마스킹됨(도메인보존)', masked.email === 'gd@***example.com'.replace('***example.com','example.com')? false : /\*\*\*@example\.com$/.test(masked.email));
check('비PII(name) 보존',       masked.name === '홍길동');
check('비PII(points) 보존',     masked.points === 100);
check('비PII(shop_name) 보존',  masked.shop_name === '강남대리점');
// 잔존 원본번호 0 — 마스킹된 레코드에 원본 전화번호 패턴이 남아있으면 안 됨
const flat = JSON.stringify(masked);
check('🔒 원본 전화 11자리 잔존 0', !/010-?1111-?2222|010-?3333-?4444|010-?5555-?6666/.test(flat));

// 4-3 원본 불변(mutation 금지)
const orig = row(); BE.maskRecordPII(orig);
check('maskRecordPII 원본 미변경', orig.student_phone === '010-1111-2222' && orig.kakao_id === 'gildong_k');

// 4-4 applyPIIScope: 제한=마스킹 / 권한=원본참조 / 원본배열 불변
const list = [row(), row()];
const restricted = BE.applyPIIScope(list, {type:'agency', value:'x'});
check('applyPIIScope(agency) 전 레코드 마스킹', restricted.every(r => /\*\*\*\*$/.test(r.parent_phone)));
check('applyPIIScope 원본배열 불변', list[0].parent_phone === '010-3333-4444');
const full = BE.applyPIIScope(list, {type:'hq'});
check('applyPIIScope(hq) 원본 그대로(동일 참조)', full === list);
check('applyPIIScope(none) 원본 그대로', BE.applyPIIScope(list, {type:'none'}) === list);

console.log('\n[4b] 저장 손상 방지 가드 — isMaskedValue (마스킹값 덮어쓰기 차단)');
eq('isMaskedValue("010-1234-****")=true', BE.isMaskedValue('010-1234-****'), true);
eq('isMaskedValue("kak***")=true',        BE.isMaskedValue('kak***'),        true);
eq('isMaskedValue("010-1234-5678")=false (원본 통과)', BE.isMaskedValue('010-1234-5678'), false);
eq('isMaskedValue("gildong")=false',      BE.isMaskedValue('gildong'),       false);
eq('isMaskedValue(null)=false',           BE.isMaskedValue(null),            false);
eq('isMaskedValue(123)=false (비문자열)', BE.isMaskedValue(123),             false);
// TS↔JS 패리티
for (const v of ['010-1234-****','kak***','010-1234-5678','x',null,123,'']) eq('isMaskedValue 패리티 '+JSON.stringify(v), BE.isMaskedValue(v), FE.isMaskedValue(v));
// /contact PATCH 가드 시뮬레이션 — 마스킹된 전화가 들어오면 저장에서 제외돼야 함
const simContactSave = (body) => {
  const allowed=['student_phone','parent_phone','teacher_phone','school','grade','kakao_id','parent_kakao_id'];
  const PII_GUARD=new Set(['student_phone','parent_phone','teacher_phone','kakao_id','parent_kakao_id']);
  const sets=[]; const skipped=[];
  for (const k of allowed){ if(body[k]===undefined) continue; if(PII_GUARD.has(k)&&BE.isMaskedValue(body[k])){skipped.push(k);continue;} sets.push(k);}
  return {sets, skipped};
};
let r = simContactSave({ parent_phone:'010-3333-****', school:'서울초', student_phone:'010-1111-2222' });
check('가드: 마스킹된 parent_phone 저장 제외', !r.sets.includes('parent_phone') && r.skipped.includes('parent_phone'));
check('가드: 원본 student_phone 은 저장됨', r.sets.includes('student_phone'));
check('가드: 비PII(school) 항상 저장됨', r.sets.includes('school'));
r = simContactSave({ parent_phone:'010-3333-****', kakao_id:'kak***' });
check('가드: 전부 마스킹이면 저장항목 0(손상 0)', r.sets.length===0 && r.skipped.length===2);

console.log('\n[5] 소스 와이어링 (실제 파일에 연결됐는가)');
// api-mango.ts
check('api: pii-mask import', /from '\.\/pii-mask'/.test(srcApi));
check('api: erp-list applyPIIScope', /applyPIIScope\(items, _swErp\.scope\)/.test(srcApi));
check('api: erp-list can_view_pii 동봉', /items: _piiItems, can_view_pii: canViewPII\(_swErp\.scope\)/.test(srcApi));
check('api: unified applyPIIScope', /applyPIIScope\(rs\.results \|\| \[\], _ssw\.scope\)/.test(srcApi));
check('api: unified can_view_pii 동봉', /students: _piiStudents, can_view_pii/.test(srcApi));
check('api: 상세(full) erp 마스킹', /maskRecordPII\(_erpRow\)/.test(srcApi) && /erp: _fullErpPII/.test(srcApi));
check('api: isMaskedValue import', /isMaskedValue/.test(srcApi));
check('api: /contact 저장 가드(마스킹값 차단)', /PII_GUARD\.has\(k\) && isMaskedValue\(b\[k\]\)/.test(srcApi));
check('api: /contact masked_values_rejected 처리', /masked_values_rejected/.test(srcApi));
// admin.html
check('html: pii-mask.js 스크립트 로드', /<script src="\/js\/pii-mask\.js">/.test(srcHtml));
check('html: 헬퍼 _piiPhone 정의', /window\._piiPhone\s*=/.test(srcHtml));
check('html: 헬퍼 _piiId 정의',    /window\._piiId\s*=/.test(srcHtml));
check('html: unified fetch setCanView', /PIIMask\.setCanView\(d\.can_view_pii\)/.test(srcHtml));
check('html: erp fetch setCanView',     /PIIMask\.setCanView\(j\.can_view_pii\)/.test(srcHtml));
check('html: 학생목록 전화 마스킹 적용', /_piiPhone\(s\.student_phone\)/.test(srcHtml) && /_piiPhone\(s\.parent_phone\)/.test(srcHtml));
check('html: 단체톡짹톡 카톡ID 마스킹', /_piiId\(s\.kakao_id\)/.test(srcHtml));
check('html: 단체톡짹톡 학부모전화 마스킹', /_piiPhone\(s\.parent_phone\)/.test(srcHtml));

console.log('\n====================================================');
console.log(`🎯 총 ${PASS+FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('❌ 실패 항목:'); FAILS.forEach(f => console.log('   - ' + f)); }
else console.log('🎉 PII 마스킹 — 동작·패리티·보안불변식·와이어링 모두 정상');
console.log('====================================================');
process.exit(FAIL ? 1 : 0);
