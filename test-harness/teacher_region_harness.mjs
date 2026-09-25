// 🌏 강사 «구분»(필리핀 · 북미 · 중국) 하니스                              (2026-09-01)
//
//   왜 필요한가 —
//     사장님 지시: 「국가 추가해서 필리핀, 북미, 중국, 이렇게도 나눠줘 / 구분칸 추가해줘」
//
//     먼저 «있는 데이터» 를 셌다(운영 D1 실측 2026-09-01, teacher_profiles 33행):
//       nationality 가 채워진 행은 **1개**(테스트강사 PH). 나머지 32행은 전부 NULL 이고,
//       대신 origin_region·active_region 에 한글로 들어 있다 —
//       필리핀 24 · 미국캐나다 2 · 중국 2 · (빈칸) 4~5.
//     ⟹ 국적 «만» 보면 강사 32명이 전부 「미지정」으로 뜬다. 이 하니스는 그 상태로
//        되돌아가지 않는지를 **실제 데이터로** 못 박는다.
//
//   이 하니스가 못 박는 것 —
//     ① 판정 정본이 한 파일(src/teacher-region.ts)이고 **컴파일해서 실제로 돌린다**
//     ② 실측 33행을 그대로 넣어 «몇 명이 어느 칸에 들어가는가» 를 센다
//     ③ 단서가 없으면 «미지정» 이다 — 지어내지 않는다
//     ④ 판정이 화면·SQL 에 **복제되지 않았다**(두 벌이 되면 반드시 어긋난다)
//     ⑤ 화면 목록(#tp-nationality·TP_REGION_LABEL)과 서버 목록이 같은 말을 하는가
//     ⑥ 새 필터가 «골라도 아무 일도 안 일어나는» 상태가 아닌가 (change 배선·표 칸 수)
//
//   실행: node test-harness/teacher_region_harness.mjs
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
const read = (p) => readFileSync(join(root, p), 'utf8');

let pass = 0, fail = 0, skip = 0;
const check = (name, ok) => { if (ok) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };
const skipIt = (name) => { skip++; console.log('  ⏭ ' + name); };
/** 부정 검사는 주석을 벗긴 사본으로 (CLAUDE.md 2장 「내 주석 때문에 FAIL」). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const regionSrc = read('cloudflare-deploy/src/teacher-region.ts');
const adminSrc  = read('cloudflare-deploy/src/api-admin.ts');
const coreSrc   = read('cloudflare-deploy/public/js/adm-core.js');
const htmlSrc   = read('cloudflare-deploy/public/admin.html');
const adminCode = strip(adminSrc);
const coreCode  = strip(coreSrc);

console.log('\n[ ① 판정 정본이 전용 파일 «하나» 에 있다 ]');
check('src/teacher-region.ts 가 resolveTeacherRegion 을 내보낸다',
  /export function resolveTeacherRegion/.test(regionSrc));
check('TEACHER_REGIONS · TEACHER_REGION_NONE · teacherRegionMatches 를 내보낸다',
  /export const TEACHER_REGIONS/.test(regionSrc) &&
  /export const TEACHER_REGION_NONE/.test(regionSrc) &&
  /export function teacherRegionMatches/.test(regionSrc));
check('api-admin.ts 는 그 정본을 import 해서 쓴다',
  /import \{[^}]*resolveTeacherRegion[^}]*\} from '\.\/teacher-region'/.test(adminSrc));
check('⛔ 판정 규칙을 api-admin.ts 에 복사하지 않았다 (나라코드 표가 거기 없다)',
  !/COUNTRY_REGION/.test(adminCode));

console.log('\n[ ② 화면은 «판정하지 않고» 서버가 준 값을 그린다 ]');
check('목록 API 가 행마다 region 을 실어 준다',
  /r\.region = resolveTeacherRegion\(r\)/.test(adminCode));
check('화면 배지는 t.region 을 그대로 읽는다',
  /_tpRegionBadge\(t\.region\)/.test(coreCode));
check('⛔ 화면에 지역 «글자» 로 판정하는 코드가 없다 (origin_region 을 안 본다)',
  !/origin_region/.test(coreCode.slice(coreCode.indexOf('function _tpRegionBadge'))));
check('⛔ 화면에 resolveTeacherRegion 을 다시 구현하지 않았다',
  !/function\s+resolveTeacherRegion/.test(coreCode));
check('국적을 바꾸면 서버가 «다시 판정한» region 을 응답에 실어 준다',
  /regionAfter = resolveTeacherRegion\(rowAfter\)/.test(adminCode) &&
  /region: regionAfter/.test(adminCode));
check('화면은 그 값이 없으면 지어내지 않고 목록을 다시 읽는다',
  /typeof res\.data\.region === 'string'[\s\S]{0,200}loadTeacherProfiles\(\)/.test(coreCode));

console.log('\n[ ③ 화면 배선 — «골라도 아무 일도 안 일어나는» 상태가 아닌가 ]');
check('필터 드롭다운(#tp-filter-region)이 있다', /id="tp-filter-region"/.test(htmlSrc));
for (const v of ['PH', 'NA', 'CN', 'ETC', '__none__']) {
  check('필터에 값 ' + v + ' 가 있다',
    new RegExp('id="tp-filter-region"[\\s\\S]{0,900}<option value="' + v.replace('__none__', '__none__') + '"').test(htmlSrc));
}
check('🔴 그 필터에 change 리스너가 걸려 있다 (이 한 줄이 빠지면 조용히 아무 일도 안 한다)',
  /getElementById\('tp-filter-region'\)|e\('tp-filter-region'\)\.addEventListener\('change'/.test(coreSrc) &&
  /e\('tp-filter-region'\)\.addEventListener\('change', loadTeacherProfiles\)/.test(coreCode));
check('고른 값을 서버로 보낸다 (?region=)', /params\.set\('region', region\)/.test(coreCode));
check('서버가 그 파라미터로 거른다',
  /url\.searchParams\.get\('region'\)/.test(adminCode) && /teacherRegionMatches\(fRegion/.test(adminCode));
check('표에 «구분» 머리 칸이 있다', /data-ko="구분" data-en="Country"/.test(htmlSrc));
check('표 한 줄에도 구분 칸이 있다', /id="tprgc-'/.test(coreCode));

console.log('\n[ ③-2 칸을 늘렸으면 빈 표의 colspan 도 함께 늘어야 한다 ]');
{
  const ths = (htmlSrc.match(/<table id="tp-list-table"[\s\S]*?<\/thead>/) || [''])[0];
  const n = (ths.match(/<th[\s>]/g) || []).length;
  check('머리 칸 수 = ' + n + ' 개', n === 17);   // 2026-09-25 «가동률» 칸 추가로 16→17
  const spans = [...htmlSrc.matchAll(/id="tp-list-body"><tr><td colspan="(\d+)"/g)].map(m => Number(m[1]));
  check('admin.html 빈 표 colspan 이 머리 칸 수와 같다 (' + spans.join(',') + ')',
    spans.length > 0 && spans.every(x => x === n));
  /* ⚠️ 파일 전체에서 colspan 을 세면 «다른 표» 까지 걸린다(급여·방 목록 등).
     강사 명부를 그리는 함수 본문만 잘라서 본다. */
  const lp = coreCode.indexOf('async function loadTeacherProfiles');
  const body = lp < 0 ? '' : coreCode.slice(lp, coreCode.indexOf('\nasync function', lp + 10));
  const cspans = [...body.matchAll(/tbody\.innerHTML = '<tr><td colspan="(\d+)"/g)].map(m => Number(m[1]));
  check('adm-core.js 의 강사 명부 colspan 도 같다 (' + cspans.join(',') + ')',
    cspans.length >= 2 && cspans.every(x => x === n));
}

console.log('\n[ ④ 화면 나라 목록과 서버 나라 표가 같은 말을 하는가 ]');
{
  const natBlock = (htmlSrc.match(/<select id="tp-nationality"[\s\S]*?<\/select>/) || [''])[0];
  const htmlCodes = [...natBlock.matchAll(/<option value="([A-Z]{2})"/g)].map(m => m[1]).sort();
  /* ⚠️ 줄머리(^)로만 찾으면 한 줄에 둘 적은 나라(US·CA)를 놓친다 — 실제로 놓쳤다. */
  const tableCodes = [...(regionSrc.match(/const COUNTRY_REGION[\s\S]*?\n\};/) || [''])[0]
    .matchAll(/\b([A-Z]{2}):\s*TEACHER_REGION_/g)].map(m => m[1]).sort();
  check('수정 모달의 나라(' + htmlCodes.join(',') + ') 가 전부 서버 표에 있다',
    htmlCodes.length > 0 && htmlCodes.every(c => tableCodes.includes(c)));
  const pickCodes = [...(coreSrc.match(/var TP_REGION_PICK = \[[\s\S]*?\n\];/) || [''])[0]
    .matchAll(/code: '([A-Z]{2})'/g)].map(m => m[1]);
  check('인라인 메뉴가 고르게 하는 나라도 전부 서버 표에 있다 (' + pickCodes.join(',') + ')',
    pickCodes.length > 0 && pickCodes.every(c => tableCodes.includes(c)));
  const labelKeys = [...(coreSrc.match(/var TP_REGION_LABEL = \{[\s\S]*?\n\};/) || [''])[0]
    .matchAll(/^\s*(PH|NA|CN|ETC):/gm)].map(m => m[1]).sort();
  const srvRegions = [...(regionSrc.match(/export const TEACHER_REGIONS[\s\S]*?\];/) || [''])[0]
    .matchAll(/TEACHER_REGION_(PH|NA|CN|ETC)/g)].map(m => m[1]).sort();
  check('화면 라벨 표의 칸(' + labelKeys.join(',') + ') 이 서버 목록과 같다',
    labelKeys.length === 4 && JSON.stringify(labelKeys) === JSON.stringify(srvRegions));
}

console.log('\n[ ⑤ 함정 대조 ]');
check('구분 배지가 background-color 로 색을 준다 (background:#f… 는 옛 규칙이 투명하게 덮는다)',
  /_tpRegionBadge[\s\S]{0,900}background-color:/.test(coreCode) &&
  !/_tpRegionBadge[\s\S]{0,900}style="background:#/.test(coreCode));
check('배지가 글자색 페인터 셋의 예외 클래스(tp-st-badge)를 함께 단다',
  /class="tp-st-badge tp-rg-badge"/.test(coreCode));
check('배지에 white-space:nowrap 이 있다 (좁은 칸에서 낱글자로 쪼개지지 않게)',
  /_tpRegionBadge[\s\S]{0,900}white-space:nowrap/.test(coreCode));
check('⛔ 트리거 버튼에 data-ko/data-en 을 달지 않았다 (아이콘 상자가 문장으로 갈아끼워진다)',
  !/class="tp-st-btn" id="tprgb-[\s\S]{0,400}data-ko="/.test(coreCode));
check('메뉴는 상태 메뉴와 다른 열쇠(rg:)를 써서 «같은 메뉴» 로 오인되지 않는다',
  /var key = 'rg:' \+ id/.test(coreCode));
check('⛔ 국기 이모지를 쓰지 않았다 (Win10 은 국기를 글자 두 개로 그린다)',
  !/[\u{1F1E6}-\u{1F1FF}]/u.test(strip(htmlSrc).slice(
    strip(htmlSrc).indexOf('tp-filter-region'), strip(htmlSrc).indexOf('tp-filter-region') + 1200)));

console.log('\n[ ⑥ 🔴 판정을 «실제로 돌려» 본다 — 문자열 검사로는 무엇이 걸러지는지 못 본다 ]');
const tsPath = resolve(root, 'cloudflare-deploy/node_modules/typescript/lib/typescript.js');
let mod = null;
if (!existsSync(tsPath)) {
  skipIt('typescript 없음 — 컴파일 실행 검사 건너뜀 (npm ci 필요)');
} else {
  const ts = (await import(pathToFileURL(tsPath).href)).default;
  const js = ts.transpileModule(regionSrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
  check('컴파일해서 불러올 수 있다', typeof mod.resolveTeacherRegion === 'function');
}

if (mod) {
  const R = mod.resolveTeacherRegion;

  console.log('\n  ── 나라 코드로 읽기 ──');
  check('PH → 필리핀', R({ nationality: 'PH' }) === 'PH');
  check('US → 북미',   R({ nationality: 'US' }) === 'NA');
  check('CA → 북미',   R({ nationality: 'CA' }) === 'NA');
  check('CN → 중국',   R({ nationality: 'CN' }) === 'CN');
  check('KR → 기타 국가', R({ nationality: 'KR' }) === 'ETC');
  check('모르는 «코드»(JP)도 미지정이 아니라 기타 국가다', R({ nationality: 'JP' }) === 'ETC');
  check('소문자로 와도 같다', R({ nationality: 'ph' }) === 'PH');
  check('코드가 아닌 쓰레기값은 코드로 안 읽는다', R({ nationality: '???' }) === '');

  console.log('\n  ── 지역 «글자» 로 읽기 (실제 D1 값) ──');
  check('출신 지역 「필리핀」 → 필리핀', R({ origin_region: '필리핀' }) === 'PH');
  check('활동 지역 「미국캐나다」 → 북미 (둘 다 같은 칸이라 충돌이 아니다)',
    R({ active_region: '미국캐나다' }) === 'NA');
  check('「중국」 → 중국', R({ origin_region: '중국' }) === 'CN');
  check('그룹 「중국어 강사」 → 중국', R({ group_name: '중국어 강사' }) === 'CN');
  check('그룹 「미국 오전반」 → 북미', R({ group_name: '미국 오전반' }) === 'NA');
  check('「Office Teacher」 는 단서가 아니다 → 미지정', R({ group_name: 'Office Teacher' }) === '');
  check('영문 Philippines 도 읽는다', R({ origin_region: 'Philippines' }) === 'PH');
  check('⛔ 짧은 약자를 부분일치로 읽지 않는다 (Alpha 의 ph)', R({ origin_region: 'Alpha Team' }) === '');
  check('국적이 있으면 지역 글자보다 «국적» 이 이긴다',
    R({ nationality: 'US', origin_region: '필리핀' }) === 'NA');
  check('한 칸에 두 구분이 섞이면 그 칸은 안 쓴다 → 다음 칸으로',
    R({ origin_region: '필리핀/중국', active_region: '중국' }) === 'CN');
  check('아무 단서도 없으면 미지정 — 지어내지 않는다', R({}) === '');
  check('null 행도 미지정', R(null) === '');

  console.log('\n  ── 🔴 실측 33행을 그대로 넣어 «몇 명이 어느 칸» 인지 센다 ──');
  // 2026-09-01 운영 D1 teacher_profiles 전수. 값은 실제로 들어 있는 그대로다.
  const PH_ROW = { origin_region: '필리핀', active_region: '필리핀' };
  const rows = [
    { id: 4,  n: 'Belle',    ...PH_ROW, group_name: 'Home-based' },
    { id: 5,  n: 'Shas',     ...PH_ROW, group_name: 'Office Teacher' },
    { id: 6,  n: 'Zee',      ...PH_ROW, group_name: 'Office Teacher' },
    { id: 7,  n: 'Krystel',  ...PH_ROW, group_name: 'Home-based' },
    { id: 8,  n: 'Len',      ...PH_ROW, group_name: 'Office Teacher' },
    { id: 9,  n: 'Hannah',   ...PH_ROW, group_name: 'Home-based' },
    { id: 10, n: 'Sid',      ...PH_ROW, group_name: 'Office Teacher' },
    { id: 11, n: 'Kaye',     ...PH_ROW, group_name: 'Office Teacher' },
    { id: 12, n: 'Ana',      ...PH_ROW, group_name: 'Office Teacher' },
    { id: 13, n: 'Win',      ...PH_ROW, group_name: 'Home-based' },
    { id: 14, n: 'Jinette',  ...PH_ROW, group_name: 'Home-based' },
    { id: 15, n: 'Cindy',    ...PH_ROW, group_name: 'Office Teacher' },
    { id: 16, n: 'Kes',      ...PH_ROW, group_name: 'Office Teacher' },
    { id: 17, n: 'Mo',       origin_region: '미국캐나다', active_region: '미국캐나다', group_name: '미국 오전반' },
    { id: 18, n: 'Jenny',    ...PH_ROW, group_name: 'Home-based' },
    { id: 19, n: 'Melca',    ...PH_ROW, group_name: null },
    { id: 20, n: 'Jane',     ...PH_ROW, group_name: 'Office Teacher' },
    { id: 22, n: 'Ness',     ...PH_ROW, group_name: 'Home-based' },
    { id: 23, n: 'Chaine',   ...PH_ROW, group_name: 'Home-based' },
    { id: 24, n: 'JP',       ...PH_ROW, group_name: 'Office Teacher' },
    { id: 25, n: 'Maimai',   ...PH_ROW, group_name: 'Head Teacher' },
    { id: 26, n: 'Janice',   origin_region: '미국캐나다', active_region: '미국캐나다', group_name: '미국 오후반' },
    { id: 27, n: 'Far',      ...PH_ROW, group_name: 'Office Teacher' },
    { id: 28, n: 'Rica',     ...PH_ROW, group_name: 'Office Teacher' },
    { id: 29, n: 'Mariane',  ...PH_ROW, group_name: 'Home-based' },
    { id: 30, n: '강선생님',  origin_region: '중국', active_region: '중국', group_name: '중국어 강사' },
    { id: 31, n: '손선생님',  origin_region: '중국', active_region: '중국', group_name: '중국어 강사' },
    { id: 32, n: 'Wan',      origin_region: '필리핀', active_region: null, group_name: null },
    { id: 33, n: 'Karl',     ...PH_ROW, group_name: 'Head Teacher' },
    { id: 36, n: 'JED',      origin_region: null, active_region: null, group_name: null },
    { id: 37, n: 'FAYE',     origin_region: null, active_region: null, group_name: null },
    { id: 38, n: '테스트강사', nationality: 'PH', origin_region: null, active_region: null, group_name: 'home' },
    { id: 39, n: '파라테스트', origin_region: null, active_region: null, group_name: 'office' },
  ];
  check('실측 행 수가 33이다 (표본이 줄면 이 검사는 뜻이 없다)', rows.length === 33);
  const tally = {};
  for (const r of rows) { const k = R(r) || '(미지정)'; tally[k] = (tally[k] || 0) + 1; }
  console.log('     → ' + JSON.stringify(tally));
  check('필리핀 26명', tally.PH === 26);
  check('북미 2명 (Mo · Janice)', tally.NA === 2);
  check('중국 2명 (강선생님 · 손선생님)', tally.CN === 2);
  check('미지정 3명 (JED · FAYE · 파라테스트)', tally['(미지정)'] === 3);
  check('🔴 국적만 보면 32명이 미지정이 된다 — 지역 글자를 함께 보는 이유',
    rows.filter(r => mod.teacherRegionFromCountry(r.nationality)).length === 1);
  check('합계가 33 (아무도 어느 칸에도 안 빠지지 않는다)',
    Object.values(tally).reduce((a, b) => a + b, 0) === 33);

  console.log('\n  ── 필터 판정 ──');
  const M = mod.teacherRegionMatches;
  check('「전체 구분」은 다 통과시킨다', M('', 'PH') && M('', ''));
  check('PH 필터는 필리핀만', M('PH', 'PH') && !M('PH', 'NA') && !M('PH', ''));
  check('「미지정」 필터는 빈 값만', M(mod.TEACHER_REGION_NONE, '') && !M(mod.TEACHER_REGION_NONE, 'PH'));
  check('필터를 실제 33행에 걸면 26 + 2 + 2 + 3 = 33',
    rows.filter(r => M('PH', R(r))).length === 26 &&
    rows.filter(r => M('NA', R(r))).length === 2 &&
    rows.filter(r => M('CN', R(r))).length === 2 &&
    rows.filter(r => M(mod.TEACHER_REGION_NONE, R(r))).length === 3);

  console.log('\n  ── 라벨 ──');
  check('미지정은 빈칸이 아니라 «미지정» 이라고 적는다', mod.teacherRegionLabel('') === '미지정');
  check('영어 화면도 빈칸이 아니다', mod.teacherRegionLabel('', true) === 'Unset');
  check('북미 라벨', mod.teacherRegionLabel('NA') === '북미' && mod.teacherRegionLabel('NA', true) === 'North America');
}

console.log('\n──────────────────────────────────────────');
console.log(`PASS ${pass} / FAIL ${fail} / SKIP ${skip}`);
process.exit(fail ? 1 : 0);
