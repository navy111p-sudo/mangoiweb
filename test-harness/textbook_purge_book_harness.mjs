/* 🗑️ 교재 «묶음 통째» 영구 삭제 회귀 감시 (2026-09-07 사장님 결정 B안)
   ═══════════════════════════════════════════════════════════════════════════
   [무엇을 지키나]
     ① 허용 판정 정본(src/textbook-purge-gate.ts)을 **실제로 컴파일해 돌린다**.
        ⛔ 「그 조건이 있는가」를 문자열로 보면 부등호·비교를 뒤집어도 그 글자가 남아 통과한다.
           하필 그 자리가 «되돌릴 수 없는 삭제» 를 지키는 자리다.
     ② «막는다» 와 «통과시킨다» 를 **짝으로** 본다 — 「전부 막기」도 초록이 되면 안 된다.
     ③ 라우트가 그 정본을 **부르는가**(조건을 라우트에 다시 적지 않았는가).
     ④ 조직 스코프 판정이 auth-admin 의 정본과 **같은 말인가**(복제해 뒀으므로 대조한다).
     ⑤ SQL 이 LIKE 가 아닌가 — D1 은 LIKE 패턴 50자를 넘으면 조회 자체가 실패한다.
        교재 이름은 「BTS 17 Korea (Hobbies And Activities,…)」처럼 쉽게 넘는다.
     ⑥ 변이시험 — 되돌리면 실제로 FAIL 이 나는가.
   ⚠️ 이 하니스가 없으면 게이트를 통째로 지워도 초록불이다. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const rd = p => { try { return readFileSync(resolve(SRC, p), 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0, skip = 0;
const ok  = (t, c, why='') => { c ? (pass++, console.log('  ✅ ' + t)) : (fail++, console.log('  ❌ ' + t + (why ? ' — ' + why : ''))); };
const sk  = (t, why) => { skip++; console.log('  ⏭ ' + t + (why ? ' — ' + why : '')); };

const gateSrc  = rd('textbook-purge-gate.ts');
const adminSrc = rd('api-admin.ts');
const authSrc  = rd('auth-admin.ts');
const indexSrc = rd('index.ts');

console.log('[ ① 정본 파일과 라우트 배선 ]');
ok('판정 정본 src/textbook-purge-gate.ts 가 있다', gateSrc.length > 400);
ok('라우트가 정본을 import 한다', /import\s*\{[^}]*textbookPurgeGate[^}]*\}\s*from\s*'\.\/textbook-purge-gate'/.test(adminSrc));

/* 라우트 블록만 잘라 본다 — ⛔ 길이로 자르지 말 것(옆 핸들러가 딸려 온다). 중괄호 짝으로 자른다. */
function blockAt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  return src.slice(i);
}
const ANCHOR = "if (method === 'DELETE' && path === '/api/admin/textbook-files') {";
const route = blockAt(adminSrc, ANCHOR);
ok('DELETE /api/admin/textbook-files 라우트가 있다', route.length > 200);
ok('라우트가 textbookPurgeGate(...) 를 부른다', /textbookPurgeGate\s*\(/.test(route));
ok('게이트 결과를 «조건으로» 쓴다(부르기만 하지 않는다)', /if\s*\(\s*!\s*gate\.ok\s*\)/.test(route));
ok('통과 뒤 분기도 게이트가 준 mode 로 한다', /gate\.mode\s*===\s*'count'/.test(route));

/* ⚠️ 조건을 라우트에 «다시» 적으면 정본이 두 벌이 된다 — 한쪽만 고쳐지는 사고가 시작된다. */
ok('라우트가 강사/스코프 판정을 다시 적지 않았다',
   !/isOrgScopedRole\s*\(/.test(route) && !/_pgActor\.isTeacher\s*\)/.test(route));

console.log('\n[ ② 관문 — src/index.ts 를 안 건드리고 얹었는가 ]');
ok('②라우팅 허용목록에 그 경로가 이미 있다(메서드를 안 가린다)',
   /path === '\/api\/admin\/textbook-files'/.test(indexSrc));
ok('③위임 가드가 그 접두사를 통과시킨다',
   /startsWith\('\/api\/admin\/textbook-files'\)/.test(rd('api-mango.ts')));
ok('본문 action 을 요구한다(모르는 요청이 흘러 들어오지 않게)', /'purge_book'/.test(gateSrc));

console.log('\n[ ③ SQL — LIKE 금지 · 묶음 판정식 한 곳 ]');
ok('묶음 판정식 BOOK_EXPR 이 한 번만 선언된다',
   (adminSrc.match(/const BOOK_EXPR\s*=/g) || []).length === 1);
ok('숨김 목록과 삭제가 같은 BOOK_EXPR 을 쓴다',
   (adminSrc.match(/\$\{BOOK_EXPR\}/g) || []).length >= 4);
/* ⚠️ 부정 검사는 **주석을 벗긴 사본**으로 — 설명 주석에 그 낱말이 들어가면 자기 주석을 잡는다. */
const stripCmt = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
ok('삭제 SQL 에 LIKE 가 없다 (D1 LIKE 패턴 50자 한도)', !/LIKE/i.test(stripCmt(route)));
ok('R2 키는 textbook-files/ 접두사만 지운다',
   /startsWith\('textbook-files\/'\)/.test(route));
ok('R2 삭제 실패 시 D1 행을 남긴다(고아 방지)', /continue;/.test(route));
ok('한 번에 다 지우지 않는다(배치 상한)', /PURGE_BATCH_MAX/.test(route));
ok('누가 무엇을 지웠는지 기록한다', /textbook_purge_book/.test(route));
/* 🔴 «남은 수» 를 못 읽었을 때 0 으로 떨어뜨리면 done:true 가 되어 «삭제 완료» 라고 말하고,
   숨김 표식까지 지워져 숨겨 뒀던 교재가 전 강사에게 되살아난다. */
ok('남은 수를 못 읽으면 0 이 아니라 null(모름) 로 둔다',
   /remaining: number \| null = null/.test(route) && /catch \{ remaining = null; \}/.test(route));
ok('done 은 «0 임을 확인했을 때만» true', /done: remaining === 0/.test(route));
/* ⚠️ 「.all().catch(빈 배열) 이 없는가」로 넓게 물으면 **무해한 곳까지** 잡는다 —
   1단계의 «예시 5개» 조회는 실패해도 확인창에 예시가 안 뜰 뿐이다(실제로 거짓 FAIL 났다).
   물어야 할 것은 «지울 행 목록을 못 읽었을 때 막는가» 다. */
ok('지울 행 목록을 못 읽으면 막는다(빈 배열로 떨어뜨리지 않는다)',
   /rows = null;[\s\S]{0,80}if \(!rows\) return json\(\{ ok: false, error: 'lookup_failed' \}, 503\);/.test(route));
ok('숨김 표식은 «다 지운 것을 확인했을 때만» 건드린다',
   /if \(remaining === 0\) \{[\s\S]{0,300}textbook_hidden_books/.test(route));

console.log('\n[ ④ 조직 스코프 판정이 auth-admin 정본과 같은 말인가 ]');
const roles = ['branch','agency','franchise','hq','none','teacher','staff','',null,undefined,'HQ','Branch'];

/* ─────────────────────────────────────────────────────────────
   ⑤ 게이트를 컴파일해 **실제로 돌린다** — 여기가 핵심이다.
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ⑤ 게이트를 실제로 돌린다 ]');
let ts = null;
try { ts = (await import(pathToFileURL(resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default; } catch {}

async function load(src) {
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
}

if (!ts) {
  sk('typescript 를 못 찾아 실행 검사를 건너뜀 (npm ci 선행 필요)');
} else {
  const mod = await load(gateSrc);
  const HQ = { action: 'purge_book', actorOk: true, isTeacher: false, role: 'hq', book: 'BTS 2', totalFiles: 19 };
  const g = (o = {}) => mod.textbookPurgeGate({ dryRun: true, ...HQ, ...o });

  // ── 막는다 ──
  ok('모르는 action 은 거절', g({ action: 'nuke' }).error === 'unknown_action');
  ok('action 이 없으면 거절',  g({ action: undefined }).error === 'unknown_action');
  ok('로그인 안 했으면 401',   g({ actorOk: false }).error === 'unauthorized');
  ok('강사는 403',             g({ isTeacher: true }).error === 'forbidden_teacher');
  for (const r of ['branch','agency','franchise'])
    ok('조직 스코프(' + r + ')는 403', g({ role: r }).error === 'forbidden_scope');
  ok('책 이름이 없으면 거절',  g({ book: '' }).error === 'book_required');
  ok('책 이름이 공백뿐이면 거절', g({ book: '   ' }).error === 'book_required');

  // ── 통과시킨다 (짝) — 이 짝이 없으면 «전부 막기» 도 초록이 된다 ──
  ok('본사(hq)는 1단계 통과',        g().ok === true && g().mode === 'count');
  ok('내부직원(none)도 1단계 통과',  g({ role: 'none' }).ok === true);
  ok('1단계는 언제나 세기만 한다',   g().mode === 'count');

  // ── 2단계 ──
  const P = o => g({ dryRun: false, confirmName: 'BTS 2', ...o });
  ok('이름을 다시 입력 안 하면 거절', P({ confirmName: undefined }).error === 'confirm_mismatch');
  ok('이름이 다르면 거절',            P({ confirmName: 'BTS 22' }).error === 'confirm_mismatch');
  ok('대소문자가 달라도 거절',        P({ confirmName: 'bts 2' }).error === 'confirm_mismatch');
  ok('앞뒤 공백이 달라도 거절',       P({ confirmName: 'BTS 2 ' }).error === 'confirm_mismatch');
  ok('이름이 정확히 같으면 통과',     P().ok === true && P().mode === 'purge');

  // ── «모르면 막는다» (되돌릴 수 없는 조작의 fail-closed) ──
  ok('파일 수를 모르면(null) 막는다',      P({ totalFiles: null }).error === 'lookup_failed');
  ok('파일 수를 안 넘기면(undefined) 막는다', P({ totalFiles: undefined }).error === 'lookup_failed');
  ok('파일 수가 NaN 이면 막는다',          P({ totalFiles: NaN }).error === 'lookup_failed');
  ok('없는 책은 book_not_found',           P({ totalFiles: 0 }).error === 'book_not_found');
  ok('«모름» 과 «없음» 을 다른 말로 한다',
     P({ totalFiles: null }).error !== P({ totalFiles: 0 }).error);

  // ── dryRun 기본값: 명시적 false 가 아니면 절대 지우지 않는다 ──
  for (const v of [undefined, null, true, 0, '', 'false', 'no'])
    ok('dryRun=' + JSON.stringify(v) + ' 는 삭제로 안 간다',
       mod.textbookPurgeGate({ ...HQ, dryRun: v, confirmName: 'BTS 2' }).mode !== 'purge');

  // ── ④ 대조: auth-admin 정본과 같은 말인가 ──
  let authMod = null;
  try {
    const m = authSrc.match(/export function isOrgScopedRole[\s\S]*?\n\}/);
    if (m) authMod = await load(m[0]);
  } catch {}
  if (!authMod) sk('auth-admin 의 isOrgScopedRole 을 못 떼어내 대조를 건너뜀');
  else {
    const same = roles.every(r => authMod.isOrgScopedRole(r) === mod.purgeOrgScopedRole(r));
    ok('복제한 조직스코프 판정이 auth-admin 정본과 같은 답을 낸다', same);
  }

  // ─────────────────────────────────────────────────────────
  // ⑥ 라우트의 «게이트 거절 → 즉시 return» 을 **실제로 돌린다**.
  // 🔴 그전에는 그 조건을 «글자로만» 봤다. 그래서 가드 몸통을 빈 블록으로 바꿔
  //    결과를 무시하게 만들어도 통과했다(실측) — 게이트를 부르기만 하는 상태다.
  //    하필 이 경로는 미들웨어가 안 막아서(강사 업로드용으로 열려 있다) 저 한 줄이
  //    유일한 방어선이다. 그래서 문자열이 아니라 «실행» 으로 본다.
  // ⛔ 이 설명을 블록주석으로 되돌리지 말 것 — 안에 «별표+슬래시» 가 들어가면
  //    주석이 거기서 닫혀 뒷부분이 코드가 된다(2026-09-07 실제로 밟음).
  // ─────────────────────────────────────────────────────────
  console.log('\n[ ⑥ 라우트 가드를 실제로 돌린다 ]');
  function routeGuardBlocks(routeSrc) {
    const a = routeSrc.indexOf('const gate = textbookPurgeGate(');
    const b = routeSrc.indexOf("if (gate.mode === 'count')");
    if (a < 0 || b < 0 || b <= a) return 'NO_SEGMENT';
    const seg = routeSrc.slice(a, b).replace(/ as any/g, '');
    let out;
    try {
      const fn = new Function('textbookPurgeGate', 'json', 'b', '_pgActor', 'book', 'dryRun', 'totalFiles',
        seg + '\nreturn "PASSED_THROUGH";');
      out = fn(() => ({ ok: false, mode: 'none', error: 'forbidden_teacher', status: 403 }),
               () => 'BLOCKED', {}, { ok: true, isTeacher: true, role: 'teacher' }, 'BTS 2', true, 19);
    } catch (e) { return 'THREW:' + e.message; }
    return out;
  }
  ok('게이트가 «거절» 하면 라우트가 그 자리에서 막는다',
     routeGuardBlocks(route) === 'BLOCKED', String(routeGuardBlocks(route)).slice(0, 80));

  const routeMutants = [
    ['가드 결과 무시',   r => r.replace(/if \(!gate\.ok\) return json\([^;]*;/, 'if (!gate.ok) { }')],
    ['가드 조건 뒤집기', r => r.replace('if (!gate.ok) return json(', 'if (gate.ok) return json(')],
    ['가드 통째 제거',   r => r.replace(/if \(!gate\.ok\) return json\([^;]*;/, '')],
  ];
  for (const [name, mut] of routeMutants) {
    const r2 = mut(route);
    if (r2 === route) { ok('라우트 변이 «' + name + '» 이 실제로 바꿨다', false, '패턴 불일치 — 검사가 헛돈다'); continue; }
    ok('라우트 변이 «' + name + '» 을 잡는다', routeGuardBlocks(r2) !== 'BLOCKED');
  }

  console.log('\n[ ⑦ 게이트 변이시험 — 되돌리면 실제로 잡히는가 ]');
  const mutants = [
    ['강사 차단 제거',      s => s.replace('if (i.isTeacher) return', 'if (false && i.isTeacher) return')],
    ['조직스코프 차단 제거', s => s.replace('if (purgeOrgScopedRole(i.role)) return', 'if (false) return')],
    ['이름 확인 뒤집기',    s => s.replace("if (String(i?.confirmName ?? '') !== book) {", "if (String(i?.confirmName ?? '') === book) {")],
    ['«모름» 을 통과시키기', s => s.replace(/if \(i\.totalFiles === null[\s\S]*?\n  \}/, '')],
    ['dryRun 기본값 뒤집기', s => s.replace('if (i.dryRun !== false) return', 'if (i.dryRun === false) return')],
  ];
  for (const [name, mutate] of mutants) {
    const src2 = mutate(gateSrc);
    if (src2 === gateSrc) { ok('변이 «' + name + '» 이 원본을 실제로 바꿨다', false, '패턴 불일치 — 검사가 헛돈다'); continue; }
    let caught = false;
    try {
      const m2 = await load(src2);
      const gg = (o = {}) => m2.textbookPurgeGate({ dryRun: true, ...HQ, ...o });
      const PP = o => gg({ dryRun: false, confirmName: 'BTS 2', ...o });
      if (gg({ isTeacher: true }).error !== 'forbidden_teacher') caught = true;
      if (gg({ role: 'branch' }).error !== 'forbidden_scope') caught = true;
      if (PP({ confirmName: 'BTS 22' }).error !== 'confirm_mismatch') caught = true;
      if (PP({ totalFiles: null }).error !== 'lookup_failed') caught = true;
      if (gg().mode !== 'count') caught = true;
    } catch { caught = true; }
    ok('변이 «' + name + '» 을 잡는다', caught, '되돌려도 검사가 통과한다 = 헛돌고 있다');
  }
}

console.log('\n[ ⑦ 화면 — 지우는 버튼이 «어느 것을 지우는지» 갈라 말하는가 ]');
const html = (() => { try { return readFileSync(resolve(__dir, '../cloudflare-deploy/public/textbook-uploader.html'), 'utf8'); } catch { return ''; } })();
ok('공용 자료실 목록에 🗑 삭제 버튼이 있다', /data-del-book=/.test(html));
ok('purgeBook 이 2단계(세기 → 이름 확인)를 거친다',
   /action:\s*'purge_book'/.test(html) && /confirm_name:\s*book/.test(html) && /prompt\(/.test(html));
/* ⚠️ «객체 모양» 을 글자 그대로 못 박지 말 것 — 1단계 본문에 `dry_run: true` 를 «명시» 로
   더하기만 해도(뜻은 같고 오히려 명확) FAIL 이 난다. 물어야 할 것은 «끄지 않았는가» 다. */
{
  const firstCall = html.slice(html.indexOf("action: 'purge_book', book })") - 400,
                               html.indexOf("action: 'purge_book', book })") + 60);
  ok('1단계 요청이 dry_run 을 끄지 않는다', !/dry_run:\s*false/.test(firstCall));
  ok('1단계 요청에 confirm_name 이 없다', !/confirm_name/.test(firstCall));
}
ok('화면 판정이 «성공이라고 말했는가»(ok===true) 다', /j\.ok\s*!==\s*true|d\.ok\s*!==\s*true/.test(html));
ok('한 장도 못 지웠는데 남아 있으면 멈춘다(무한 반복 방지)', /if \(!Number\(j\.deleted \|\| 0\)\)/.test(html));
ok('화면이 «모름»(remaining null)을 숫자인 척 말하지 않는다',
   /j\.remaining === null \|\| j\.remaining === undefined/.test(html));
ok('중간에 멈추면 «완료» 라고 말하지 않는다',
   /doneConfirmed/.test(html) && /아직 다 지우지 못했습니다/.test(html));
/* ⚠️ 이 표는 IndexedDB 를 읽는다 — 제목이 «라이브러리» 로 되돌아가면 «총 0개» 거짓말이 재발한다. */
ok('이 PC 표 제목이 «이 컴퓨터» 라고 말한다', /이 컴퓨터에 저장된 교재/.test(html));
ok('공용 자료실 목록 제목이 «공용 자료실» 이라고 말한다', /공용 자료실 교재/.test(html));
ok('로그인 안 됐을 때 화면이 그렇게 말한다', /id="auth-bar"/.test(html) && /checkAuthBar/.test(html));
/* ⚠️ 이 PC 표의 [삭제] 는 IndexedDB 만 지운다. 문구가 그 말을 안 하면 «서버까지 지웠다» 로
   읽힌다 — Mai 「삭제가 안 된다」 제보의 절반이 이것이었다. */
ok('이 PC [삭제] 확인창이 «이 컴퓨터» 라고 말한다', /이 컴퓨터에서 지울까요/.test(html));
ok('이 PC [삭제] 가 «공용 자료실은 그대로» 라고 말한다', /공용 자료실\(서버\)에는 그대로 남습니다/.test(html));
{
  /* delTextbook 함수 몸통만 중괄호 짝으로 잘라 «서버 호출이 없는지» 본다.
     ⛔ 길이로 자르면 옆 함수가 딸려 와 purgeBook 의 fetch 가 잡힌다(거짓 FAIL). */
  const i = html.indexOf('window.delTextbook');
  let d = 0, started = false, end = i, body = '';
  for (let j = i; j >= 0 && j < html.length; j++) {
    const c = html[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) { end = j + 1; break; } }
  }
  body = i >= 0 ? html.slice(i, end) : '';
  ok('이 PC [삭제] 가 서버를 안 건드린다(delTextbook 안에 fetch 없음)',
     body.length > 100 && !/fetch\s*\(/.test(body));
}
/* ⚠️ 🗑 버튼이 <label> «안» 에 있으면 누를 때마다 숨김 체크박스가 함께 토글된다. */
/* ⚠️ 파일 전체 indexOf 로 순서를 재면 위쪽에 그 낱말이 하나만 생겨도 뜻을 잃는다.
   **행을 그리는 템플릿 안** 에서만 «label 을 닫은 뒤에 버튼이 오는가» 를 본다. */
{
  const t0 = html.indexOf("return '<div style=\"display:flex;align-items:center;gap:10px;padding:9px 12px");
  const tpl = t0 > 0 ? html.slice(t0, t0 + 1600) : '';
  ok('행 템플릿을 찾았다', tpl.length > 400);
  ok('🗑 버튼이 숨김 label 밖에 있다',
     tpl.indexOf("+ '</label>'") > 0 && tpl.indexOf('data-del-book=') > tpl.indexOf("+ '</label>'"));
}

console.log('\n──────────────────────────────');
console.log(`PASS ${pass} / FAIL ${fail} / SKIP ${skip}`);
process.exit(fail ? 1 : 0);
