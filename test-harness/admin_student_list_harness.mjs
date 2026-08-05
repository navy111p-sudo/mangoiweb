// -*- coding: utf-8 -*-
// 🐢 관리자 학생목록 안정화 하네스 (2026-08-05)
//   실행: node test-harness/admin_student_list_harness.mjs
//
//   사장님 지적 "버벅거리고 자꾸 왔다갔다 움직인다" 의 원인 5겹이 되돌아가지 못하게 막는다.
//
//   ⚠️ 이 하네스가 생긴 진짜 이유:
//     고치는 과정에서 `const btn = document.getElementById('sm-load-students')` 선언 줄을
//     실수로 지웠다. 문법은 멀쩡하니 `node --check`·tsc·인라인JS 게이트가 전부 통과했고,
//     검증도 renderStudentTable() 을 «직접 불러» 했기 때문에 통과했다.
//     실제로는 bindStudentList IIFE 가 ReferenceError 로 죽어 **버튼·검색·자동로드 배선이
//     통째로 안 붙었다** — 「불러오기」를 눌러도 아무 일도 안 일어났다.
//     → 그래서 ⑥번 검사: 배선 IIFE 안에서 addEventListener 를 붙이는 변수는
//        같은 블록에 선언이 있어야 한다. 선언 없는 식별자를 잡아낸다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const core = rd('../cloudflare-deploy/public/js/adm-core.js');
const html = rd('../cloudflare-deploy/public/admin.html');
const css  = rd('../cloudflare-deploy/public/css/admin-inline-a.css');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ① 불러오기 버튼 — 클릭 이벤트가 검색어로 들어가지 않기 ]');
// 예전: btn.addEventListener('click', loadStudentList) → q = PointerEvent → "[object PointerEvent]" 로 조회 → 0건
check('버튼을 loadStudentList 에 «맨몸으로» 묶지 않는다',
  !/addEventListener\(\s*'click'\s*,\s*loadStudentList\s*\)/.test(core));
check('loadStudentList 가 이벤트 객체를 방어한다',
  /typeof q === 'object'/.test(core));

console.log('\n[ ② 검색 중에는 표를 비우지 않기 (표 높이가 위아래로 튀는 원인) ]');
check('quiet 모드가 있다', /opts && opts\.quiet/.test(core));
check('검색 재조회는 quiet 로 부른다', /loadStudentList\([^)]*\{\s*quiet:\s*true\s*\}\)/.test(core));
check('0건 응답이 이미 떠 있는 목록을 지우지 않는다',
  /if \(_quiet\) \{ renderStudentTable\(\); return; \}/.test(core));

console.log('\n[ ③ 응답 경합 — 늦게 온 옛 응답이 최신 결과를 덮지 않기 ]');
check('요청 일련번호가 있다', /_smReqSeq/.test(core));
check('AbortController 로 이전 요청을 끊는다', /_smAbort\.abort\(\)/.test(core));
check('AbortError 는 화면을 손대지 않고 종료한다',
  (core.match(/name === 'AbortError'\) return/g) || []).length >= 2);

console.log('\n[ ④ 열 너비 고정 — 렌더마다 재측정해 좌우로 흔들리지 않기 ]');
check('CSS 가 table-layout: fixed', /#sm-students-table\s*\{[^}]*table-layout:\s*fixed/.test(css));
check('min-width: max-content 를 되살리지 않았다',
  !/#sm-students-table\s*\{[^}]*min-width:\s*max-content/.test(css));
const cg = /<table id="sm-students-table"[\s\S]{0,1200}?<colgroup>([\s\S]*?)<\/colgroup>/.exec(html);
const cols = cg ? (cg[1].match(/<col\b/g) || []).length : 0;
check(`colgroup 의 <col> 이 19개 (열 수와 같음) — ${cols}개`, cols === 19);
const ths = (/<tbody id="sm-students-tbody"/.test(html) &&
  (/<table id="sm-students-table"[\s\S]*?<thead><tr>([\s\S]*?)<\/tr><\/thead>/.exec(html)?.[1].match(/<th\b/g) || []).length) || 0;
check(`thead 의 <th> 도 19개 — ${ths}개`, ths === 19);

console.log('\n[ ⑤ 통짜 렌더 금지 — 1000행 × 19열을 매번 다시 그리지 않기 ]');
check('청크 크기 상수가 있다', /const SM_CHUNK\s*=\s*\d+/.test(core));
check('첫 렌더는 청크만 그린다', /arr\.slice\(0, _smShown\)/.test(core));
check('이어붙이기 함수가 노출돼 있다', /window\.smAppendRows\s*=\s*smAppendRows/.test(core));
check('스크롤로 이어붙인다', /addEventListener\('scroll'[\s\S]{0,200}smAppendRows/.test(core));
check('스크롤 위치를 보존한다', /wrap\.scrollLeft = keepLeft/.test(core));
check('CSV·정렬은 전체(_smStudents)를 그대로 쓴다', /_pre = _smStudents/.test(core));
check('그래프DB 가 죽으면 재시도하지 않는다', /_smGraphOff/.test(core));

console.log('\n[ ⑥ 배선 IIFE — addEventListener 대상 변수에 선언이 있는지 (선언 삭제 사고 방지) ]');
//   `(function NAME(){ … })()` 블록을 잘라, 그 안에서 `X.addEventListener` 로 쓰인 X 가
//   같은 블록에 const/let/var 로 선언돼 있는지 본다. 브라우저 전역은 예외.
const GLOBALS = new Set(['document', 'window', 'self', 'top', 'parent', 'navigator', 'screen', 'location', 'body', 'this']);
const iifes = [...core.matchAll(/\(function\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{/g)];
let undeclared = [];
for (const m of iifes) {
  // 중괄호 균형으로 블록 끝 찾기
  let i = core.indexOf('{', m.index + m[0].length - 1), depth = 0, end = -1;
  for (let p = i; p < core.length; p++) {
    if (core[p] === '{') depth++;
    else if (core[p] === '}') { depth--; if (depth === 0) { end = p; break; } }
  }
  if (end < 0) continue;
  const body = core.slice(i, end);
  const used = new Set([...body.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\.addEventListener\s*\(/g)].map(x => x[1]));
  for (const v of used) {
    if (GLOBALS.has(v)) continue;
    const e = v.replace(/\$/g, '\\$');
    // 선언으로 인정하는 것: const/let/var/function 선언, 화살표 함수 인자, function 인자, catch 인자.
    //   ⚠️ `if (btn)` 같은 «괄호에 그냥 들어간 것» 은 인정하지 않는다 — 그게 이번 사고였다.
    const declared =
      new RegExp(`(?:const|let|var|function)\\s+${e}\\b`).test(body)          // const btn = …
      || new RegExp(`\\b${e}\\s*=>`).test(body)                                // forEach(d => …
      || new RegExp(`\\([^)]*\\b${e}\\b[^)]*\\)\\s*=>`).test(body)             // ((a, b) => …
      || new RegExp(`function\\s*[\\w$]*\\s*\\([^)]*\\b${e}\\b[^)]*\\)`).test(body)
      || new RegExp(`catch\\s*\\(\\s*${e}\\b`).test(body);
    if (!declared) undeclared.push(`${m[1]}() 안의 «${v}»`);
  }
}
check(`배선 IIFE ${iifes.length}개 검사 — 선언 없는 대상 0개` +
      (undeclared.length ? ` (발견: ${undeclared.join(', ')})` : ''), undeclared.length === 0);
check('bindStudentList 에서 btn 을 선언한다',
  /function bindStudentList\(\)\{[\s\S]{0,200}const btn = document\.getElementById\('sm-load-students'\)/.test(core));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
