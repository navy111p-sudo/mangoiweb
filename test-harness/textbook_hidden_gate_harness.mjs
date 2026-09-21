// -*- coding: utf-8 -*-
// 🙈 교재 라이브러리 «숨김» — 관문 셋과 화면 배선 검사 (2026-09-07)
//
//   왜 —
//     `/api/admin/textbook-hidden-books` 는 **2026-08-13 신설 이래 줄곧 404 였다.**
//     index.ts 의 인증 게이트(①)와 라우팅 허용목록(②)에는 있었는데 api-mango.ts 의
//     위임 가드(③)에만 빠져 handleAdminApi 까지 못 갔다. 그래서 업로더의 숨김 상자는
//     「목록을 불러오지 못했습니다」만 떴고, 아무도 «고장» 으로 안 읽었다.
//     teacher-contacts(8/13)·finance-cafe24(8/15)·classes/today(7/23)·vc/(8/27)와
//     같은 원인의 다섯 번째다.
//
//   ⛔ 「그 문자열이 파일에 있는가」로 검사하지 않는다 — 접두사 규칙(`startsWith`)이 섞여 있어
//      눈으로는 통과처럼 보인다. **조건식을 오려 내 실제로 돌린다**(CLAUDE.md 2장).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy');
let PASS = 0, FAIL = 0;
const check = (n, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + n); }
  else { FAIL++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

const MANGO = readFileSync(join(ROOT, 'src/api-mango.ts'), 'utf8');
const INDEX = readFileSync(join(ROOT, 'src/index.ts'), 'utf8');
const CORE  = readFileSync(join(ROOT, 'public/js/adm-core.js'), 'utf8');
const ADMIN = readFileSync(join(ROOT, 'public/admin.html'), 'utf8');
const CSS   = readFileSync(join(ROOT, 'public/css/admin-inline-c.css'), 'utf8');

const PATH = '/api/admin/textbook-hidden-books';

console.log('════════ 🙈 교재 숨김 — 관문 셋 + 화면 배선 ════════');
console.log('\n── 1. 관문 «셋» — 하나만 빠져도 404 인데 화면엔 «자료 없음» 으로 보인다 ──');

/* 위임 가드(③) 조건식을 오려 내 실제로 평가한다 — classes_today_cafe24_harness ②-1 과 같은 방식. */
const guardAllows = (p) => {
  const anchor = MANGO.indexOf('const rAdmin = await handleAdminApi');
  const ifPos = MANGO.lastIndexOf('\n    if (', anchor);
  if (anchor < 0 || ifPos < 0) return null;
  const cond = MANGO.slice(ifPos + '\n    if ('.length, MANGO.lastIndexOf(') {', anchor))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  try { return new Function('path', 'method', `return (${cond});`)(p, 'GET'); }
  catch (e) { return null; }
};
/* 🪤 조건식을 «오려 내는» 것 자체가 헛돌 수 있다(주석 제거가 코드를 먹는 함정 — CLAUDE.md 2장).
      그래서 먼저 «이미 등록된 것은 통과하고, 없는 것은 막힌다» 를 확인해 자를 검사한다.
      이 두 줄이 깨지면 아래 판정은 뜻이 없다. */
check('①-0 [전제] 가드가 이미 등록된 경로를 통과시킨다 (classes/today)',
  guardAllows('/api/admin/classes/today') === true);
check('①-0 [전제] 가드가 등록 안 된 경로는 막는다 (있을 리 없는 경로)',
  guardAllows('/api/admin/__no_such_path__') === false);

check('① ③ 위임 가드(api-mango.ts)가 이 경로를 handleAdminApi 로 넘긴다  ← 없으면 404',
  guardAllows(PATH) === true, '2026-08-13~2026-09-07 이 자리가 비어 줄곧 404 였다');
check('② ② 라우팅 허용목록(index.ts)에도 있다', INDEX.includes(`path === '${PATH}'`));
check('③ ① 인증 게이트(isAdminOnlyApi)에도 있다',
  new RegExp(`if \\(path === '${PATH}'\\) return true`).test(INDEX));
/* ⛔ 강사에게 열면 «한 강사가 체크하면 전 강사의 교재가 사라진다» — 반경이 회사 전체다. */
check('④ 강사 차단 목록에 그대로 남아 있다 (열지 않았다)', INDEX.includes(`'${PATH}',`));

console.log('\n── 2. 화면(관리자 교재 표) 배선 ──');
check('⑤ 표가 그 API 를 부른다', CORE.includes(`fetch('${PATH}'`));
/* 🔴 종단 404 본문 {error:'Not Found'} 에는 ok 칸이 없다 — `d.ok === false` 로 보면
      그냥 통과해 «자료가 없다» 는 정상 문구로 그려진다(CLAUDE.md 2장). */
check('⑥ «성공이라고 말했는가» 로 판정한다 (ok !== true)',
  /d\.ok !== true/.test(CORE) && !/d\.ok === false/.test(CORE.slice(CORE.indexOf('_tbLoadHideMap'), CORE.indexOf('_tbHideCell'))));
check('⑦ 못 받았으면 «모름» 으로 두고 버튼을 안 만든다',
  /window\._tbHideMap = null/.test(CORE) && /if \(!window\._tbHideMap\)/.test(CORE));
/* 🪤 파일 전체에서 찾으면 헛돈다 — adm-core.js 는 1.6만 줄이라 다른 곳의 AbortController 가
      걸려, 이 함수에서 타임아웃을 통째로 빼도 초록불이었다(2026-09-07 변이시험에서 실측).
      **그 함수 본문만** 중괄호 짝으로 잘라서 본다. */
const fnBody = (src, name) => {
  const at = src.indexOf('function ' + name);
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(open, i + 1); }
  }
  return '';
};
const LOAD_FN = fnBody(CORE, '_tbLoadHideMap');
check('⑧-0 [전제] _tbLoadHideMap 본문을 실제로 잘라냈다', LOAD_FN.length > 200, LOAD_FN.length + '자');
check('⑧ 조회에 타임아웃이 있다 (매달려도 교재 표는 그려진다)',
  /new AbortController\(\)/.test(LOAD_FN)
  && /setTimeout\(/.test(LOAD_FN) && /\.abort\(\)/.test(LOAD_FN)
  && /signal/.test(LOAD_FN));   // 만든 신호를 실제로 fetch 에 넘기는가

/* 표 칸 수 — thead th · 한 줄 td · colspan 이 어긋나면 표가 통째로 밀린다. */
const theadEnd = ADMIN.indexOf('<tbody id="textbooks-table"');
const thead = ADMIN.slice(ADMIN.lastIndexOf('<thead', theadEnd), theadEnd);
const nTh = (thead.match(/<th\b/g) || []).length;
const rowsSeg = CORE.slice(CORE.indexOf('function _tbRenderRows'));
const bodySeg = rowsSeg.slice(0, rowsSeg.indexOf('\n}\n'));
const nTd = (bodySeg.match(/'<td/g) || []).length + (bodySeg.includes('_tbHideCell(t)') ? 1 : 0);
const colspans = [...new Set([...bodySeg.matchAll(/colspan="(\d+)"/g)].map(m => m[1]))];
check(`⑨ thead th(${nTh}) = 한 줄 td(${nTd}) = colspan(${colspans.join(',')})`,
  nTh === nTd && colspans.length === 1 && Number(colspans[0]) === nTh);

console.log('\n── 3. 표 안 작은 버튼이 전역 «인디고 알약» 룰에 안 먹히는가 ──');
/* ⚠️ 색·크기는 브라우저로 재야 한다 — 여기서는 «방어가 그 자리에 있는가» 만 본다.
      실제 측정은 test-harness/manual/textbook-hide-toggle-browser.mjs (33종). */
/* 🪤 (2026-09-11) 범위를 «파일 끝까지» 로 잡으면 안 된다 — 이 CSS 파일에 새 절이 붙는
      순간 남의 규칙이 딸려 들어와 **손대지도 않은 검사가 빨간불**이 된다(CLAUDE.md 2장
      「하니스가 검사 범위를 «파일 끝까지» 로 잡아 두었을 때」. 실제로 2026-09-11 에
      조직 3표 버튼 블록이 파일 끝에 붙으면서 ⑫가 거짓 FAIL 났다).
      ⚠️ 그렇다고 «다음 주석까지» 로 자르면 이번엔 **너무 일찍** 끊긴다 — 이 절 안에
         설명 주석이 하나 더 있어서 :hover 규칙이 통째로 빠진다(고치다 실제로 밟았다).
      → 선택자에 tb-hide-toggle 이 들어간 **규칙들만** 골라 잇는다. 파일이 자라도 안 어긋난다. */
/* ⚠️ 매칭 «전» 에 주석을 벗긴다 — `[^{}]*` 는 선택자 앞 «주석까지» 먹어서, tb-hide-toggle 을
      언급하는 주석 뒤에 무관한 규칙이 오면 그 규칙의 선언이 딸려 들어온다(고치려던 거짓 FAIL
      이 그대로 되살아난다). 벗기고 나면 선택자만 남는다. */
const CSS_NOCMT = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const cssBlock = [...CSS_NOCMT.matchAll(/([^{}]*tb-hide-toggle[^{}]*)\{([^}]*)\}/g)].map(m => m[0]).join('\n');
// 전제 — 이 절을 실제로 잘라 냈는가. 앵커가 어긋나면 아래 검사들이 빈 문자열을 보고 통과한다.
check('⑩-0 [전제] tb-hide-toggle 규칙을 잘라 냈다 (4개)',
  (cssBlock.match(/tb-hide-toggle/g) || []).length >= 4 && cssBlock.length > 200);
/* 🪤 부정 검사(«이 글자가 없어야 한다»)는 **주석을 벗겨 낸 사본**으로 판정한다 —
      이 절의 설명 주석에 `background:#…` 이 «쓰지 말 것» 의 예시로 들어 있어서,
      원문으로 물으면 검사가 자기 주석을 잡는다(CLAUDE.md 2장 · 2026-09-11 실제로 밟음).
      ⑬ 도 같은 사본으로 본다 — 주석에 적힌 「transform:none」 은 «끄는 줄» 이 아니다. */
const cssCode = cssBlock;   // 이미 주석이 없다(위에서 벗겼다)
check('⑩ ID 접두 선택자로 되살린다 (조상 id 가 앞에 있다)',
  /#textbooks-table td button\.tb-hide-toggle/.test(CSS));
check('⑪ 클래스 이름이 «-btn» 으로 끝나지 않는다 ([class$="-btn"] 규칙 회피)',
  !/class="[^"]*-btn"/.test(bodySeg) && /tb-hide-toggle/.test(bodySeg));
check('⑫ background 단축이 아니라 background-color 로 쓴다',
  /background-color:/.test(cssCode) && !/[^-]background:\s*#/.test(cssCode));
check('⑬ hover 에 transform 을 두지 않는다 (끄는 줄이 실제로 있다)',
  /transform:\s*none\s*!important/.test(cssCode));

console.log('──────────────────────────────────────────');
console.log(`  ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
process.exit(FAIL ? 1 : 0);
