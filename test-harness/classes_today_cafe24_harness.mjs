#!/usr/bin/env node
/**
 * 📅 「오늘 전체 수업」이 비어 있던 것 — 카페24 예약을 합쳐서 준다 (2026-08-25)
 *
 * 사고 내용
 *   8/25 매니저 보고서 ②「매니저 페이지에 오늘 전체 수업을 보여 달라」.
 *   그런데 그 카드는 **이미 있었다**(admin.html 「🚪 오늘 수업 (바로 입장)」).
 *   매니저가 [Load] 를 눌렀을 때 화면은 «No classes scheduled for today» 였고,
 *   같은 시각 관리자 「Live Classes」 화면에는 **Scheduled now 6 · In a Mangoi room 0** 이 찍혀 있었다.
 *
 * 원인 — **둘이었다**
 *   🔴 ① 이 경로가 **줄곧 404** 였다. index.ts 라우팅(관문 ②)에는 있었지만 api-mango.ts
 *      위임 가드(관문 ③)에 없어 handleAdminApi 까지 오지 못했다(2026-07-23 신설 이래).
 *      404 본문에는 `ok` 칸이 없어 화면의 `d.ok === false` 검사를 통과하고 빈 목록이 되어
 *      «오늘 예정된 수업이 없습니다» 라는 **정상 문구**로 그려졌다 — 그래서 아무도 고장으로 안 봤다.
 *   ② 관문을 뚫어도 /api/admin/classes/today 가 `class_schedules` 만 읽었다. 실제 운영 수업은 카페24가 정본이고
 *   카페24 예약은 그 표에 한 줄도 안 들어온다(cafe24-sync 는 attendance 에 `c24-{class_id}` 씨앗으로만 넣는다).
 *   ⚠️ 에러가 안 났다 — 화면은 «정상 문구» 를 띄웠다. 그래서 「기능이 없다」로 신고됐다.
 *
 * 이 하니스가 지키는 것
 *   - 두 갈래(class_schedules · attendance c24-%)를 **함께** 읽을 것
 *   - 카페24 줄에는 입장·참관 버튼을 주지 않을 것 (우리 방이 없다 — 아무도 없는 방으로 보낸다)
 *   - 강사에게 닫혀 있을 것 (핸들러 403 + index.ts 차단목록 — 스코프로는 못 막는다)
 *   - 지사·대리점에게는 «스코프로 자른 뒤에만» 열려 있을 것
 *   - manager.html 이 «펼칠 때만» 부르고, 자동갱신에 실리지 않고, 외부 요청을 늘리지 않을 것
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', 'cloudflare-deploy');
const ADMIN = readFileSync(join(ROOT, 'src/api-admin.ts'), 'utf8');
const INDEX = readFileSync(join(ROOT, 'src/index.ts'), 'utf8');
const TCJS = readFileSync(join(ROOT, 'public/js/adm-today-classes.js'), 'utf8');
const ADMIN_HTML = readFileSync(join(ROOT, 'public/admin.html'), 'utf8');
const MGR = readFileSync(join(ROOT, 'public/manager.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(label, ok) {
  if (ok) { PASS++; console.log('  ✅ ' + label); }
  else { FAIL++; FAILS.push(label); console.log('  ⚠ FAIL ' + label); }
}
/* 부정 검사는 반드시 주석을 벗긴 사본으로 — 「왜 뺐는지」 적은 설명이 자기 검사에 걸린다
   (CLAUDE.md 2장 — c24_finance_kcpm_harness 에서 실제로 밟은 함정) */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n📅 classes/today — 카페24 합산 · 격리 · 무게\n');

// ── 핸들러 본문만 (다음 핸들러 앞까지) ──────────────────────────────────────
const hStart = ADMIN.indexOf(`path === '/api/admin/classes/today'`);
const hNext = ADMIN.indexOf("path === '/api/admin/class-audit'", hStart + 40);
const H = hStart > 0 ? ADMIN.slice(hStart, hNext > hStart ? hNext : hStart + 12000) : '';
const HC = strip(H);

console.log('── 1. 두 갈래를 함께 읽는가 ──');
check('① 핸들러가 class_schedules 를 읽는다', /FROM class_schedules/.test(HC));
check('② 핸들러가 카페24 씨앗(attendance c24-%)도 읽는다',
  /FROM attendance[\s\S]{0,400}room_id LIKE 'c24-%'/.test(HC));
check('③ 카페24 조회가 «그 날짜» 로 잘린다 (a.date = ?)', /a\.date = \?/.test(HC));
check('④ 응답에 출처 구분이 실린다 (source)',
  /source:\s*'mangoi'/.test(HC) && /source:\s*'cafe24'/.test(HC));
/* 🧹 자리표시(lms·type_seed)를 안 걸러내면 실제 수업처럼 수백 건이 섞인다.
   제외식은 schedule-conflict.ts 의 NOT_PLACEHOLDER 와 **글자 하나까지 같아야** 한다. */
const PH_EXPR = "NOT IN ('lms','type_seed')";
check('④-2 자리표시 행을 걸러낸다 (본조회·폴백 둘 다)',
  (HC.match(new RegExp(PH_EXPR.replace(/[().]/g, '\\$&'), 'g')) || []).length >= 2);
check('④-3 제외식이 schedule-conflict.ts 의 정본과 같은 글자다',
  readFileSync(join(ROOT, 'src/schedule-conflict.ts'), 'utf8').includes(PH_EXPR));

console.log('\n── 2. 카페24 줄에는 입장·참관을 주지 않는가 ──');
//    ⛔ 우리 방이 없다. 버튼을 주면 아무도 없는 방이 열리고 «수업이 깨졌다» 로 읽힌다.
const c24Block = HC.slice(HC.indexOf("source: 'cafe24'"));
check('⑤ 서버가 카페24 줄에 join_open:false 를 실어 준다', /join_open:\s*false/.test(c24Block));
check('⑥ 서버가 카페24 줄에 observable:false 를 실어 준다', /observable:\s*false/.test(c24Block));
check('⑦ 화면이 출처를 보고 버튼을 가른다', /source\s*===\s*'cafe24'/.test(strip(TCJS)));
check('⑧ 화면이 observable === false 면 참관 버튼을 안 그린다',
  /observable\s*!==\s*false/.test(strip(TCJS)));

console.log('\n── 2-2. 🔴 관문 «셋» — 하나만 빠져도 404 인데 화면엔 «수업 없음» 으로 보인다 ──');
/* 2026-08-25 실측: 이 경로는 2026-07-23 신설 이래 ③ 위임 가드에 없어 줄곧 404 였다.
   ⚠️ 「그 문자열이 있는가」로 검사하면 안 된다 — 접두사 규칙(`startsWith`)이 섞여 있어
      눈으로는 통과처럼 보인다. **조건식을 오려 내 실제로 돌린다**(CLAUDE.md 2장 「넘기는 모양」 교훈). */
const MANGO = readFileSync(join(ROOT, 'src/api-mango.ts'), 'utf8');
const guardAllows = (p) => {
  const anchor = MANGO.indexOf('const rAdmin = await handleAdminApi');
  const ifPos = MANGO.lastIndexOf('\n    if (', anchor);
  if (anchor < 0 || ifPos < 0) return null;
  const cond = MANGO.slice(ifPos + '\n    if ('.length, MANGO.lastIndexOf(') {', anchor))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  try { return new Function('path', 'method', `return (${cond});`)(p, 'GET'); }
  catch { return null; }
};
check('②-1 ③ 위임 가드(api-mango.ts)가 이 경로를 handleAdminApi 로 넘긴다  ← 없으면 404',
  guardAllows('/api/admin/classes/today') === true);
check('②-2 ② 라우팅 허용목록(index.ts)에도 있다',
  INDEX.includes("path === '/api/admin/classes/today'"));
/* 🔴 404 는 `{error:'Not Found'}` 라 `ok` 칸이 없다. `d.ok === false` 만 보면 그냥 통과하고
   `d.sessions || []` 가 빈 배열이 되어 «오늘 예정된 수업이 없습니다» 로 그려진다 = 고장이 안 보인다. */
check('②-3 화면이 «성공이라고 말했는가» 로 판정한다 (ok !== true 면 오류)',
  /d\.ok !== true/.test(TCJS) && /Array\.isArray\(d\.sessions\)/.test(TCJS));
check('②-4 화면이 HTTP 실패를 그대로 오류로 올린다', /if \(!r\.ok\) throw/.test(TCJS));
check('②-5 매니저 화면도 같은 규칙이다',
  /j\.ok !== true/.test(MGR) && /Array\.isArray\(j\.sessions\)/.test(MGR));

console.log('\n── 3. 강사 차단 · 지사 격리 (스코프로는 강사를 못 막는다) ──');
check('⑨ 핸들러 첫머리에서 강사를 403 으로 끊는다',
  /classes\/today'\)\s*\{[\s\S]{0,400}isTeacher[\s\S]{0,80}(?:forbidden_teacher|forbiddenTeacherBody)/.test(HC));
/* ⚠️ 「몇 글자 안에」로 찾지 않는다 — 목록이 길어지면 조용히 거짓 실패가 난다.
   문자 위치로도 자르지 않는다(주석을 벗기면 위치가 밀린다). **줄 단위로** 목록을 읽는다:
   그 목록이 시작하는 줄부터 `];` 로 닫히는 줄까지가 목록이다. */
const listLines = (startRe) => {
  const lines = INDEX.split('\n');
  const i = lines.findIndex((l) => startRe.test(l));
  if (i < 0) return [];
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\s*\];?\s*$/.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out;
};
const inList = (startRe, needle) =>
  listLines(startRe).some((l) => !/^\s*(\/\/|\*)/.test(l) && l.includes(needle));

check('⑩ index.ts 강사 차단목록에 등재됐다',
  inList(/const TEACHER_BLOCKED_PREFIXES\s*=/, "'/api/admin/classes/today'"));
check('⑪ 지사·대리점 허용목록에도 등재됐다 (스코프로 자른 뒤에만)',
  inList(/^\s*const allow = \[/, "'/api/admin/classes/today'"));
check('⑫ 두 조회 모두 scopeStudentCond 로 잘린다',
  (HC.match(/_ctStu\.cond/g) || []).length >= 2 && /scopeStudentCond\(_ctScope, 'se'\)/.test(HC));
/* 🔴 조인이 깨졌을 때의 폴백이 조건 없는 전체 조회라면, 지사에게 남의 학생이 나간다.
   스코프가 걸린 요청은 폴백하지 않고 빈 목록을 주는 것이 맞다. */
check('⑬ 스코프가 걸린 요청은 «조건 없는 폴백» 을 타지 않는다',
  /if \(_ctStu\.cond\) \{ rows = \{ results: \[\] \}/.test(HC));

console.log('\n── 4. 학생 정보 한 줄 (보고서 ①) ──');
check('⑭ 응답에 레벨·교재가 실린다', /level:\s*s\.se_level/.test(HC) && /textbook:\s*s\.se_textbook/.test(HC));
check('⑮ «교재 배정 여부» 를 서버가 판정한다', /textbook_assigned:/.test(HC));
check('⑯ 화면이 교재 미배정을 눈에 띄게 표시한다',
  /textbook_assigned/.test(TCJS) && /교재 미배정/.test(TCJS));

console.log('\n── 5. 날짜 (보고서 ③ — 완료된 수업 기록) ──');
check('⑰ ?date= 를 받는다', /searchParams\.get\('date'\)/.test(HC));
check('⑱ 모양이 틀린 날짜는 오늘로 되돌린다 (빈 표로 오해하지 않게)',
  /\\d\{4\}-\\d\{2\}-\\d\{2\}[\s\S]{0,120}todayStr/.test(HC));
check('⑲ 화면에 날짜 입력칸이 있다', /id="tc-date"/.test(ADMIN_HTML));
check('⑳ 날짜를 바꾸면 서버에서 다시 받는다 (render 가 아니라 로더)',
  /tc-date[\s\S]{0,240}tcLoadToday/.test(TCJS));

console.log('\n── 6. 매니저 화면 — 가벼움 계약 ──');
check('㉑ 「오늘 전체 수업」 카드가 있다', /id="c-today"/.test(MGR));
check('㉒ «펼칠 때만» 부른다 (ontoggle)', /id="c-today" ontoggle="if\(this\.open\)loadTodayAll\(\)"/.test(MGR));
/* ⛔ 자동갱신에 태우면 하루 143건 조회가 주기적으로 돈다 — [Refresh] 와 날짜 변경 때만. */
const mgrCode = strip(MGR);
check('㉓ setInterval 로 이 카드를 돌리지 않는다',
  !/setInterval\([\s\S]{0,200}loadTodayAll/.test(mgrCode));
check('㉔ [Refresh] 를 누르면 다시 받는다', /c-today:loadTodayAll/.test(mgrCode));
/* 이 화면의 설계는 «외부 요청 최소화» — 외부 리소스가 늘면 필리핀 회선에서 RTT 가 붙는다 */
const ext = (MGR.match(/<(?:script|link)[^>]*(?:src|href)="/g) || []).length;
check(`㉕ 외부 리소스가 1개 그대로다  [현재 ${ext}개]`, ext === 1);
/* 카톡·문자앱 인앱 브라우저는 window.open 이 예외 없이 null 만 돌려준다 (CLAUDE.md 2장).
   🔴 (2026-09-02) 이 검사를 «식 모양» 으로 못 박아 두었더니, 보장은 그대로인데 검사만 깨졌다
      (`if (!w) location.href` → `if (w) {…} else location.href`). 뜻으로 묻는다 —
      ① 'noopener' 를 기능 문자열로 주지 않는다(주면 탭이 열려도 반환이 null 이라 늘 폴백한다)
      ② 진짜로 못 열었을 때 같은 창으로 간다  ③ opener 는 손으로 끊는다 */
{
  const oi = mgrCode.indexOf('window.open(');
  const blk = oi < 0 ? '' : mgrCode.slice(Math.max(0, oi - 200), oi + 400);
  check('㉖ 입장이 window.open 실패 시 같은 창으로 폴백한다',
    oi > 0 && !/window\.open\([^)]*noopener/.test(blk)
    && /location\.href = url/.test(blk) && /\.opener\s*=\s*null/.test(blk));
}
check('㉗ 실패해도 로그인 화면으로 튕기지 않는다 (quietGet)',
  /quietGet\('\/api\/admin\/classes\/today'/.test(mgrCode));

console.log('\n── 7. 캐시 무효화 ──');
const vm = ADMIN_HTML.match(/adm-today-classes\.js\?v=(\d+)/);
check(`㉘ adm-today-classes.js ?v= 가 8 이상  [현재 ${vm ? vm[1] : '없음'}]`,
  !!vm && Number(vm[1]) >= 8);

console.log('\n─────────────────────────────────────────────');
/* ⚠️ 요약 줄의 «모양» 이 러너의 판정에 걸린다 — run.mjs 는 «숫자 뒤에 곧바로 FAIL» 이 오면
   실패로 읽는다(`([1-9]\d*)\s*FAIL`). `PASS 28    FAIL 0` 처럼 쓰면 28 이 실패 건수로 잡혀
   **전부 통과인데 FAIL 로 분류된다**(2026-08-25 실제로 밟음). 다른 하니스와 같은 모양을 쓸 것. */
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
