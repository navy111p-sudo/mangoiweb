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
/* ⚠️ (2026-08-13) 예전엔 «2개 이상» 을 셌다 — 이 화면이 네트워크를 두 번(그래프+D1) 탔기 때문이다.
   그래프 왕복을 뺐으니 이제 fetch 는 하나뿐이고 가드도 하나다. 개수를 세는 대신
   «loadStudentList 안의 fetch 개수만큼 가드가 있는가» 로 본다 — 나중에 호출이 늘어도 안 헐거워진다. */
{
  // ⚠️ 끝을 renderStudentTable 로 잡으면 사이의 openScheduleCalendar·aiOpenAnalysis 까지 딸려 온다
  //    (그 둘의 fetch 는 목록 경합과 무관하다). loadStudentList «하나만» 자른다.
  const _lsA = core.indexOf('async function loadStudentList');
  const _lsB = core.indexOf('\nfunction ', _lsA);
  const body = core.slice(_lsA, _lsB > _lsA ? _lsB : undefined);
  const fetches = (body.match(/await fetch\(/g) || []).length;
  const guards  = (body.match(/name === 'AbortError'\) return/g) || []).length;
  check(`AbortError 는 화면을 손대지 않고 종료한다 (fetch ${fetches}개 · 가드 ${guards}개)`,
    fetches >= 1 && guards >= fetches);
}

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
/* 🕸️❌ (2026-08-13) 이 화면은 그래프DB(/api/admin/students/graph-list)를 이제 «안 부른다».
   왜 뺐는지 (adm-core.js 의 loadStudentList 주석에 근거를 적어 두었다) —
     ① 지금 아무것도 안 준다. 라벨이 «D1» 이고 콘솔 로그가 없다 = ok:true + students:[] 다
        (오류였다면 dg.error 가 찍힌다). 즉 Neo4j 는 살아 있는데 MATCH (s:Student) 가 0건.
        예전엔 있었다 — 같은 MATCH 로 29,386명을 students_erp 에 넣었던 경로다.
     ② 살아나도 이 표에는 D1 보다 나쁘다. 그래프 응답에는 이 표가 그리는
        가입일·수강신청·세션수·최근방문 4열이 아예 없다. 그래프가 이기면 그 4열이 조용히 빈다.
     ③ D1 은 실측 74ms 다. 앞에 왕복을 하나 더 두는 것 자체가 손해다.
   되살릴 때는 «그래프 먼저» 가 아니라 «D1 기본 + 그래프가 더 주는 것만 덧대기» 로 할 것. */
console.log('\n[ ⑤-2 학생 목록은 D1 만 쓴다 (2026-08-13) ]');
// ⚠️ «경로 문자열이 등장하는가» 로 보면 안 된다 — 왜 뺐는지 적어 둔 주석에도 경로가 나온다.
//    실제로 «부르는가»(fetch) 로 본다.
check('🔴 학생 목록이 graph-list 를 부르지 않는다',
  !/fetch\([^)]*students\/graph-list/.test(core.slice(core.indexOf('async function loadStudentList'),
                                                       core.indexOf('function renderStudentTable'))));
check('그래프 폴백 상태변수가 남아 있지 않다 (죽은 코드 금지)',
  !/_smGraphOff|SM_GRAPH_WAIT_MS|_SM_GRAPH_OFF/.test(core));
check('출처 라벨이 항상 D1 이다 (없는 출처를 «그래프DB 실데이터» 로 광고하지 않는다)',
  !/그래프DB 실데이터/.test(core));
check('⚠️ 그래도 서버 엔드포인트는 지우지 않았다 (진단·다른 화면용)',
  /path === '\/api\/admin\/students\/graph-list'/.test(rd('../cloudflare-deploy/src/api-admin.ts')));
check('왜 뺐는지 근거가 코드에 남아 있다 (되살릴 사람이 읽어야 한다)',
  /가입일\(created_at\) · 수강신청\(enroll_package\) · 세션수\(sessions\) · 최근방문\(last_seen\)/.test(core));

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

/* ═══ ✏️ 학생 정보 수정 입구 (2026-09-11 사장님 지시) ═══════════════════════════
   [제보] 「학생 목록에서 학생 정보 수정하게 해 줘 — 수정하는 란이 없어」
   [실제] 폼은 이미 있었다(`admin/student.html` 의 「연락처·정보」 탭, 주소 포함 13칸).
          **목록에서 그 자리로 가는 길만 없었다.** 그래서 새 폼을 만들지 않고 링크를 냈다.
   ⛔ 이 링크를 지우면 「수정하는 란이 없어」가 그대로 돌아온다.
   ⛔ 폼을 «한 벌 더» 만들지 말 것 — 두 벌이 어긋나면 화면마다 답이 달라진다(CLAUDE.md). */
{
  const row = /_smRowHtml = \(s\) => \{([\s\S]*?)\n  \};/.exec(core);
  const rowHtml = row ? row[1] : '';
  check('행 그리는 코드를 찾았다 (아래 검사의 전제)', rowHtml.length > 200);
  check('✏️ 수정 링크가 학생 목록 행에 있다',
    /tab=contact/.test(rowHtml), '없으면 목록에서 정보를 고칠 길이 사라진다');
  check('그 링크가 «연락처·정보» 탭으로 곧장 연다 (탭 딥링크)',
    /\/admin\/student\?uid=\$\{uidEnc\}&amp;tab=contact/.test(rowHtml), rowHtml.slice(0, 200));
  check('기존 🎓 상세 링크도 그대로 남아 있다',
    /\/admin\/student\?uid=\$\{uidEnc\}"/.test(rowHtml));
  /* ⚠️ 열 너비는 table-layout:fixed 로 못 박혀 있다 — 좁으면 두 링크가 겹쳐 못 누른다.
     80px 시절에 그대로 두 개를 넣으면 이 검사가 잡는다. */
  const cgw = /<table id="sm-students-table"[\s\S]{0,1400}?<colgroup>([\s\S]*?)<\/colgroup>/.exec(html);
  const widths = cgw ? (cgw[1].match(/width:(\d+)px/g) || []).map(x => Number(x.match(/\d+/)[0])) : [];
  check('상세·수정 열이 두 링크를 담을 만큼 넓다 (≥120px)',
    widths.length > 2 && widths[2] >= 120, '3번째 열 = ' + (widths[2] ?? '?') + 'px');

  /* 🧷 저장이 «다음 날에도» 남는가 — 화면이 아니라 서버 쪽 짝이다.
     PATCH 가 students_erp 만 고치고 끝나면 오늘 밤 카페24 동기화가 전부 되돌린다. */
  const mango = rd('../cloudflare-deploy/src/api-mango.ts');
  const ci = mango.indexOf("/contact$/");
  const ce = ci >= 0 ? mango.indexOf('/extend$/', ci) : -1;
  const contact = (ci >= 0 && ce > ci) ? mango.slice(ci, ce) : '';
  check('연락처 저장 핸들러를 찾았다 (아래 검사의 전제)', contact.length > 400);
  check('🧷 저장이 «지켜지는 표» 에도 적는다 — 없으면 다음 날 아침 전부 빈칸이 된다',
    /rememberStudentOverrides\(/.test(contact));
  check('정본 user_id 로 적는다 (별칭으로 적으면 아무것도 안 지켜진다)',
    /SELECT user_id FROM students_erp WHERE user_id = \?/.test(contact));
  check('비밀번호도 지킨다 (안 지키면 다음 날 학생이 로그인 못 한다)',
    /kept\.password_hash/.test(contact));
  const ov = rd('../cloudflare-deploy/src/student-override.ts');
  check('⛔ 대리점·지사는 지키는 목록에 «없다» — 넣으면 정산 수수료가 옛 대리점으로 간다',
    /OVERRIDE_COLS\s*=\s*\[[^\]]*\]/.test(ov) &&
    !/OVERRIDE_COLS\s*=\s*\[[^\]]*'(shop_name|franchise)'/.test(ov));
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
