// -*- coding: utf-8 -*-
// 📐 관리자 화면 가로 넘침 가드 (2026-08-18)
//   실행: node test-harness/admin_layout_overflow_harness.mjs
//
// 무엇을 막는가
//   `.admin-layout` 은 `grid-template-columns: 260px 1fr` 이다. **그리드 칸의 기본값은
//   min-width:auto** 라 «내용보다 작아지지 않는다». 그래서 1fr 칸(#admin-main-scale)이
//   그 안의 넓은 표만큼 부풀어 창 밖으로 나갔다.
//
//   실측(2026-08-18, 헤드리스 1500px): 「학생관리」(컬럼 17개, 표 1,703px)를 열면
//     · 카드가 1,821px 이 되고 문서가 **586px** 가로로 넘쳤다
//     · 페이지 전체에 가로 스크롤바가 생기고 오른쪽 컬럼은 옆으로 밀어야 보였다
//   ⚠️ 표를 담은 상자에는 **이미 overflow-x:auto 가 있었는데도** 안 먹었다 —
//      상자가 «넘칠 일이 없을 만큼» 같이 커져서다. 그래서 그 상자만 봐서는 원인을 못 찾는다.
//
//   min-width:0 한 줄로 고쳤고, 이 하니스는 그 줄이 사라지는 것을 막는다.
//   (지우면 증상이 즉시 돌아오지만 «화면이 조금 넓어 보일 뿐» 이라 눈치채기 어렵다)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const cssA = rd('../cloudflare-deploy/public/css/admin-inline-a.css');
const html = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond, extra) => {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
};

console.log('\n[ 그리드 1fr 칸이 줄어들 수 있는가 ]');
check('.admin-layout 이 여전히 grid 다 (구조가 바뀌면 이 검사의 전제가 깨진다)',
  /\.admin-layout\s*\{[^}]*display:\s*grid/.test(cssA));
check('#admin-main-scale 에 min-width:0 이 있다',
  /#admin-main-scale\s*\{[^}]*min-width:\s*0/.test(cssA),
  '이게 없으면 넓은 표가 있는 카드에서 화면이 통째로 옆으로 밀린다');
check('그 규칙이 .admin-layout 과 같은 파일·같은 미디어 블록에 있다',
  cssA.indexOf('#admin-main-scale') > cssA.indexOf('.admin-layout { display: grid'));

console.log('\n[ 캐시 버전 ]');
const m = html.match(/admin-inline-a\.css\?v=(\d+)/);
check('admin.html 이 admin-inline-a.css 를 ?v= 로 부른다', !!m);
check('버전이 v=11 이상이다 (min-width:0 이 들어간 판)',
  !!m && parseInt(m[1], 10) >= 11, m ? `현재 v=${m[1]}` : '못 찾음');

console.log('\n[ 넓은 표는 자기 상자 안에서 스크롤해야 한다 ]');
// 학생 목록이 대표 사례 — 상자에 overflow-x 가 살아 있는지 (위 min-width:0 과 «짝» 이다)
// ⚠️ `overflow-x:auto` 만 찾으면 못 잡는다 — 실제로는 `overflow:auto` 축약형을 쓴다
//    (인라인 style 과 admin-inline-a.css 두 곳 모두). 축약형도 가로 스크롤을 만든다.
const wrapScrolls = /id="sm-students-wrap"[^>]*overflow\s*:\s*auto/.test(html)
  || /#sm-students-wrap\s*\{[^}]*overflow\s*:\s*auto/.test(cssA);
check('#sm-students-wrap 이 overflow:auto 로 감싸져 있다', wrapScrolls,
  '상자의 overflow 와 칸의 min-width:0 은 «둘 다» 있어야 동작한다');

console.log('\n' + '─'.repeat(58));
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { FAILS.forEach(f => console.log('    - ' + f)); process.exit(1); }
