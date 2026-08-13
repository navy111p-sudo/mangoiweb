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

/* 🕸️ (2026-08-13) 운영 화면 라벨이 «D1» 로 나온다 = 그래프DB 경로가 계속 실패하고 있다는 뜻.
   그런데 실패 판정이 «그 페이지를 켜 있는 동안» 만 살아 있어서, 접속할 때마다 학생 목록
   첫 조회가 한 번씩 그 실패를 기다렸다. 서버 쪽 Neo4j 타임아웃이 8초다(teacher-match.ts).
   그리고 «오류는 아닌데 0명» 인 응답은 아예 표시가 안 남아 **검색할 때마다** 다시 두드렸다.
   D1 쪽을 183만 행 → 12.6만 행으로 줄여 놔도 이 대기가 앞을 막으면 아무 소용이 없다. */
console.log('\n[ ⑤-2 그래프DB 대기가 D1 개선을 가리지 않게 (2026-08-13) ]');
check('실패 판정을 sessionStorage 에 기억한다 (새로고침해도 다시 안 기다린다)',
  /sessionStorage\.setItem\(_SM_GRAPH_OFF_KEY/.test(core) && /sessionStorage\.getItem\(_SM_GRAPH_OFF_KEY\)/.test(core));
check('⚠️ 영구 저장이 아니다 — 고쳐졌을 때 영영 안 쓰는 상태가 되면 안 된다',
  /_SM_GRAPH_OFF_TTL = 30 \* 60 \* 1000/.test(core) &&
  !/localStorage\.setItem\(_SM_GRAPH_OFF_KEY/.test(core));
check('⏱️ 응답이 늦으면 기다리지 않고 D1 로 간다 (서버 타임아웃 8초를 그대로 앉아 있지 않는다)',
  /const SM_GRAPH_WAIT_MS = \d+;/.test(core) && /Promise\.race\(\[_graphReq, _timeout\]\)/.test(core));
check('그 대기 시간이 8초보다 확실히 짧다',
  (Number((core.match(/const SM_GRAPH_WAIT_MS = (\d+);/) || [])[1]) || 99999) <= 3000);
check('🔴 «오류는 아닌데 0명» 도 건너뛰기로 친다 (검색마다 다시 두드리던 구멍)',
  /_smGraphOffMark\('전체 명부가 0명으로 옴'\)/.test(core));
check('⚠️ 검색 결과가 0건인 것은 «정상» 이라 끄지 않는다 (else if (!_qSrv) 로 가른다)',
  /\} else if \(!_qSrv\) \{/.test(core));
check('AbortError(최신 요청에 밀림)는 «고장» 으로 치지 않는다',
  /if \(e && e\.name === 'AbortError'\) return;\s*\/\/[^\n]*\n\s*_smGraphOffMark/.test(core));

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

/* 🐢 (2026-08-13 수정요청 #01) ①~⑥ 은 전부 «화면» 이야기였다. 그런데 정작 느린 곳은
   서버였다 — /api/admin/students/unified 한 방이 운영 D1 에서 183만 행(294ms),
   검색어가 붙으면 2,690만 행(1,361ms)을 읽고 있었다. 원인은 상관 서브쿼리 5개:
     · SELECT 목록의 attendance ×2 · enrollments ×1  → 학생 한 줄마다 다시 훑음
     · WHERE 의 centers·franchises EXISTS ×2        → 학생 한 줄마다 921·241행을 다시 훑음
   되돌아가면 화면 최적화가 아무리 잘 돼 있어도 그대로 느려지므로 여기서 못박는다.
   (실측 결과: 12.6만 행·74ms / 검색 9.7만 행·51ms. 결과 집합은 옛 쿼리와 행 단위로 동일) */
console.log('\n[ ⑦ 서버 쿼리 — 학생 한 명마다 테이블을 다시 훑지 않기 (2026-08-13 #01) ]');
{
  const adminTs = rd('../cloudflare-deploy/src/api-admin.ts');
  // 핸들러 «전체» 를 본다 — 고정 길이로 자르면 주석이 길어질 때 뒷부분이 잘려
  // 있지도 않은 것을 «없다» 로 읽고 헛통과·헛실패한다(실제로 한 번 겪음).
  const i = adminTs.indexOf(`path === '/api/admin/students/unified'`);
  const j = i >= 0 ? adminTs.indexOf('can_view_pii: canViewPII', i) : -1;
  const uni = (i >= 0 && j > i) ? adminTs.slice(i, j) : '';
  check('unified 핸들러를 찾았다 (아래 검사의 전제)', uni.length > 100);
  check('🔴 attendance 를 «행마다» 다시 세지 않는다 (COUNT 상관 서브쿼리 금지)',
    !/\(SELECT COUNT\(\*\) FROM attendance a WHERE a\.user_id = s\.user_id\)/.test(uni));
  check('🔴 attendance 최근방문도 «행마다» 다시 찾지 않는다 (MAX 상관 서브쿼리 금지)',
    !/\(SELECT MAX\(date\) FROM attendance a WHERE a\.user_id = s\.user_id\)/.test(uni));
  check('🔴 centers·franchises 를 «행마다» EXISTS 로 훑지 않는다 — 검색이 2,690만 행이 되던 원인',
    !/EXISTS \(SELECT 1 FROM (centers|franchises)/.test(uni));
  check('검색은 IN (비상관 서브쿼리) 로 한 번만 만든 목록을 재사용한다',
    /s\.shop_name IN \(SELECT c\.name FROM centers c/.test(uni) &&
    /s\.franchise IN \(SELECT f\.name FROM franchises f/.test(uni));
  check('먼저 1000명을 확정하는 CTE(page)가 있다', /WITH page AS \(/.test(uni));
  check('attendance 집계를 그 1000명으로 좁힌다 (통짜 GROUP BY 금지)',
    /FROM attendance\s+WHERE user_id IN \(SELECT user_id FROM page\)/.test(uni));
  check('⚠️ enrollments 조인의 MAX(id) 를 지우지 않았다 — 빼면 아무 행의 package 나 집힌다',
    /SELECT student_user_id, MAX\(id\)[^)]*, package[\s\S]{0,80}GROUP BY student_user_id/.test(uni));
  check('⚠️ sessions 는 LEFT JOIN 이 된 뒤에도 «없으면 0» 을 유지한다 (예전 COUNT(*) 와 같게)',
    /COALESCE\(a\.sessions, 0\) AS sessions/.test(uni));
  check('바깥 정렬을 명시했다 — 조인 뒤 순서가 «운» 에 맡겨지지 않게',
    /ORDER BY COALESCE\(p\.created_at,0\) DESC, p\._rid DESC/.test(uni));
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
