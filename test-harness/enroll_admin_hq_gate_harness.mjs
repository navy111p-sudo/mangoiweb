// enroll_admin_hq_gate_harness.mjs — 「수강 운영」 API 본사 전용 게이트 (2026-09-10)
//
// 왜 만들었나
//   `/api/pay/enroll/admin/*` 는 게이트가 `checkAdminSession` 하나뿐이라
//   **로그인한 강사·지사·대리점이 그대로 실행**했다. `src/index.ts` 의 강사 차단·스코프
//   차단은 `/api/admin/` 접두사에만 걸리고, `admin_write_guard_harness` 도 그 접두사만
//   훑기 때문에 이 구멍은 어느 감시에도 안 걸렸다.
//
// ⚠️ 문자열 검사로는 이 종류를 못 잡는다 — 함수도 값도 다 «있고» 틀린 것은
//    «누가 통과하는가» 뿐이다. 그래서 이 하니스는 **게이트를 오려 내 실제로 돌린다**.
//
// 🔴 이 하니스가 지키는 가장 중요한 것: **fail-open 금지**
//    `getAdminActor()` 는 스코프 조회 실패를 삼키고 role='staff'(본사 동급)로 돌려준다.
//    그 값 하나만 보는 게이트는 D1 이 흔들릴 때 지사 계정을 통과시킨다.
//
// 변이시험(전부 실제 FAIL 확인 — 2026-09-10)
//   Ⓐ 스코프 재조회를 지우고 actor.role 만 보기        → ③절 FAIL
//   Ⓑ catch 에서 scopeType='none' 으로 떨어뜨리기       → ③절 FAIL
//   Ⓒ isTeacher 검사 지우기                             → ②절 FAIL
//   Ⓓ isOrgScopedRole 검사 지우기                       → ②절 FAIL
//   Ⓔ 게이트를 허용 목록(가진 것만 막기)으로 뒤집기      → ④절 FAIL
//   Ⓕ 사이드바 hideFrom 지우기                          → ⑤절 FAIL
//   Ⓖ 게이트를 전부 막기(본사도 403)                     → ②절 FAIL (짝 검사)

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../cloudflare-deploy/src/enroll-ops.ts');
const AUTH = join(__dir, '../cloudflare-deploy/src/auth-admin.ts');
const IA6 = join(__dir, '../cloudflare-deploy/public/js/adm-ia6.js');
const src = readFileSync(SRC, 'utf8');
const auth = readFileSync(AUTH, 'utf8');
const ia6 = readFileSync(IA6, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

/* 함수 몸통을 «괄호 짝» 으로 자른다.
   ⚠️ TS 는 인자 목록·반환 타입 안에도 `{` 가 있을 수 있어(CLAUDE.md), 여는 중괄호는
      «괄호 깊이 0» 인 것만 몸통으로 인정한다. */
function bodyAt(s, anchor) {
  const i = s.indexOf(anchor);
  if (i < 0) return '';
  let par = 0, start = -1;
  for (let k = i; k < s.length; k++) {
    const ch = s[k];
    if (ch === '(') par++;
    else if (ch === ')') par--;
    /* ⚠️ `if (path === '…' && …) {` 는 앵커가 조건식 «안» 이라 첫 ')' 에서 깊이가
       음수가 된다. 그래서 «0 이하» 를 몸통 시작으로 본다(함수 선언은 정확히 0). */
    else if (ch === '{' && par <= 0) { start = k; break; }
  }
  if (start < 0) return '';
  let d = 0;
  for (let k = start; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (d === 0) return s.slice(i, k + 1); }
  }
  return '';
}

/* ══ ① 전제 — 게이트를 오려 내 실행할 수 있는가 ══════════════════════════════ */
console.log('\n① 전제 — 게이트 함수를 오려 내 실제로 돌릴 수 있는가');
const fnSrc = bodyAt(src, 'async function enrollAdminHqOnly');
ok(!!fnSrc, '`enrollAdminHqOnly` 몸통을 오려 냈다');

const stripped = fnSrc
  .replace(/\)\s*:\s*Promise<[^>]*>\s*\{/, ') {')
  .replace(/\bas any\b/g, '')
  .replace(/:\s*any\b/g, '')
  .replace(/:\s*string \| null\b/g, '')
  .replace(/:\s*Request\b/g, '');

/* ⛔ 「조직인가」 판정을 여기에 손으로 베끼지 않는다 — 정본이 좁아지면(예: franchise 제거)
   게이트는 실제로 뚫리는데 검사만 초록으로 남는다(CLAUDE.md 「설정표를 손으로 적으면」).
   정본 `isOrgScopedRole`(auth-admin.ts)을 **오려 내 그대로 쓴다.** */
let isOrgScopedRole = null;
try {
  const os = bodyAt(auth, 'export function isOrgScopedRole')
    .replace('export function', 'function')
    .replace(/\)\s*:\s*boolean\s*\{/, ') {')
    .replace(/:\s*string \| null \| undefined/g, '');
  isOrgScopedRole = new Function(os + '\nreturn isOrgScopedRole;')();
} catch (e) { console.log('     (정본 평가 실패: ' + e.message + ')'); }
ok(typeof isOrgScopedRole === 'function', '정본 `isOrgScopedRole` 을 소스에서 읽어 왔다');
/* 짝 — 「읽었다」만으로는 부족하다. 그 함수가 실제로 두 쪽을 가르는지 본다. */
ok(typeof isOrgScopedRole === 'function'
   && isOrgScopedRole('branch') === true && isOrgScopedRole('hq') === false,
   '정본이 조직(branch)과 본사(hq)를 실제로 가른다');

let gate = null;
try {
  gate = new Function('getAdminActor', 'json', 'isOrgScopedRole', 'console',
    stripped + '\nreturn enrollAdminHqOnly;')(
      (req) => req.__actor,
      (obj, status) => ({ __json: obj, status }),
      isOrgScopedRole,
      { warn() {} });
} catch (e) { console.log('     (평가 실패: ' + e.message + ')'); }
ok(typeof gate === 'function', '게이트를 함수로 만들었다');

/* 가짜 D1 — prepare() 와 prepare().bind() **두 층 모두** 에 first 를 둔다(CLAUDE.md). */
function envWith(scopeRow, opts = {}) {
  const first = async () => { if (opts.throws) throw new Error('D1_ERROR: boom'); return scopeRow; };
  const leaf = { first, all: async () => ({ results: [] }) };
  return { DB: { prepare: () => ({ bind: () => leaf, ...leaf }) } };
}
const reqAs = (actor) => ({ __actor: actor });
const A = (role, extra = {}) => ({ ok: true, username: 'u1', name: '', role, isTeacher: role === 'teacher', ...extra });

async function run(actor, scopeRow, opts) {
  if (typeof gate !== 'function') return { __json: { error: '__no_gate' }, status: 0 };
  return await gate(reqAs(actor), envWith(scopeRow, opts));
}
const err = (r) => (r && r.__json ? r.__json.error : null);

/* ══ ② 누가 막히고 누가 통과하는가 (짝으로) ═══════════════════════════════════ */
console.log('\n② 역할별 판정 — 실제로 돌려서');
{
  const t = await run(A('teacher'), { scope_type: 'teacher' });
  ok(err(t) === 'forbidden_teacher' && t.status === 403, '강사 → 403 forbidden_teacher');

  for (const st of ['branch', 'agency', 'franchise']) {
    const r = await run(A(st), { scope_type: st });
    ok(err(r) === 'forbidden_scope' && r.status === 403, `조직 계정(${st}) → 403 forbidden_scope`);
  }

  /* 🔑 짝 — 「본사는 통과한다」가 없으면 «전부 막기» 도 통과한다. */
  for (const st of ['hq', 'none']) {
    const r = await run(A(st === 'hq' ? 'hq' : 'staff'), { scope_type: st });
    ok(r === null, `본사·내부 계정(scope_type=${st}) → 통과(막지 않는다)`);
  }

  const noSess = await run({ ok: false, username: '', name: '', role: 'none', isTeacher: false }, null);
  ok(noSess && noSess.status === 401, '세션 없음 → 401 auth_required');
}

/* ══ ③ 🔴 fail-open 금지 — «모르면 막는다» ════════════════════════════════════ */
console.log('\n③ «모른다» 를 «본사» 로 읽지 않는가 (이 하니스의 핵심)');
{
  /* getAdminActor 가 스코프 조회 실패를 삼켜 role='staff' 로 돌려준 그 상황.
     실제 스코프는 branch 다 — 게이트가 근거를 다시 읽어야만 잡을 수 있다. */
  const laundered = await run(A('staff'), { scope_type: 'branch' });
  ok(err(laundered) === 'forbidden_scope',
     'role 이 staff 로 세탁돼도 admin_scope 가 branch 면 막는다');

  const thrown = await run(A('staff'), null, { throws: true });
  ok(thrown && thrown.status === 403 && err(thrown) === 'scope_unknown',
     '스코프 조회가 던지면 → 403(통과시키지 않는다)');

  const noRow = await run(A('staff'), null);
  ok(noRow && noRow.status === 403 && err(noRow) === 'scope_unknown',
     'admin_scope 행이 없으면 → 403(심기까지 실패한 것)');

  const blank = await run(A('staff'), { scope_type: '   ' });
  ok(blank && blank.status === 403 && err(blank) === 'scope_unknown',
     'scope_type 이 빈 값이면 → 403');

  /* 이름 기반 강사 판정을 못 탄 계정 */
  const tScope = await run(A('staff'), { scope_type: 'teacher' });
  ok(err(tScope) === 'forbidden_teacher', 'actor 는 staff 인데 scope_type=teacher 면 강사로 막는다');
}

/* ══ ④ 어느 경로에 걸리는가 — 조건식을 실제로 평가 ════════════════════════════ */
console.log('\n④ 배선 — 이 접두사의 «모든» 경로가 게이트를 지나는가');
{
  // 제외 목록을 소스에서 «읽어» 쓴다(값을 베껴 적지 않는다).
  const sm = src.match(/const ENROLL_ADMIN_SELF_GATED\s*=\s*new Set\(\[([\s\S]*?)\]\);/);
  ok(!!sm, '제외 목록(ENROLL_ADMIN_SELF_GATED)을 소스에서 읽었다');
  const selfGated = new Set(sm ? [...sm[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);

  // 게이트를 부르는 if 의 «조건식» 을 오려 내 평가한다(식 모양을 못 박지 않는다).
  const call = src.indexOf('await enrollAdminHqOnly(');
  const ifAt = src.lastIndexOf('if (', call);
  let cond = '';
  if (call > 0 && ifAt > 0) {
    let d = 0;
    for (let k = ifAt + 3; k < src.length; k++) {
      if (src[k] === '(') d++;
      else if (src[k] === ')') { d--; if (d === 0) { cond = src.slice(ifAt + 4, k); break; } }
    }
  }
  ok(!!cond, '게이트를 부르는 조건식을 오려 냈다');
  let gated = () => false;
  try { gated = new Function('path', 'ENROLL_ADMIN_SELF_GATED', 'return (' + cond + ');'); } catch {}

  // 소스에 실재하는 admin 경로 전수
  const paths = [...new Set([...src.matchAll(/path === '(\/api\/pay\/enroll\/admin\/[^']+)'/g)].map((m) => m[1]))];
  ok(paths.length >= 8, `이 접두사의 경로를 ${paths.length}개 찾았다`);

  let uncovered = [];
  for (const p of paths) {
    const byGate = !!gated(p, selfGated);
    if (!byGate && !selfGated.has(p)) uncovered.push(p);
  }
  ok(uncovered.length === 0, '게이트도 자기 가드도 없는 경로 0건' + (uncovered.length ? ' — ' + uncovered.join(', ') : ''));

  // 제외한 경로는 «스스로» 강사를 막아야 한다
  for (const p of selfGated) {
    const blk = bodyAt(src, `path === '${p}'`);
    ok(/isTeacher/.test(blk), `제외 경로 ${p} 는 자기 블록에서 강사를 막는다`);
  }

  // 새 경로가 생겨도 저절로 막히는가(제외 목록 방식인가)
  ok(gated('/api/pay/enroll/admin/brand-new-thing', selfGated) === true,
     '이 접두사의 «새» 경로는 아무것도 안 해도 게이트를 지난다');
  ok(gated('/api/pay/enroll/quote', selfGated) === false,
     '학생용 경로(/api/pay/enroll/quote)는 게이트를 안 지난다');

  /* 🔴 «있는가» 만으로는 부족하다 — 게이트 호출을 admin 라우트들 «아래» 로 옮겨도
     위 검사는 전부 통과한다(CLAUDE.md 「감시는 «어디에 있는가» 를 세서」). */
  const firstRoute = src.indexOf("path === '/api/pay/enroll/admin/");
  ok(call > 0 && firstRoute > 0 && call < firstRoute,
     '게이트가 첫 admin 라우트보다 «앞» 에서 불린다');
  for (const p of selfGated) {
    ok(gated(p, selfGated) === false, `제외 경로 ${p} 는 이 게이트를 안 지난다(스코프로 자른다)`);
  }
}

/* ══ ⑤ 화면 짝 — 사이드바에서도 감추는가 ══════════════════════════════════════ */
console.log('\n⑤ 화면 짝 — 사이드바 「수강 운영」 감춤');
{
  const gm = ia6.match(/var GROUPS = \[[\s\S]*?\n {2}\];/);
  ok(!!gm, 'adm-ia6.js 에서 GROUPS 블록을 오려 냈다');
  let GROUPS = null;
  try { GROUPS = new Function(gm[0] + '\nreturn GROUPS;')(); } catch (e) { console.log('     (eval 실패: ' + e.message + ')'); }
  ok(Array.isArray(GROUPS) && GROUPS.length > 0,
     'GROUPS 가 순수 리터럴이라 그대로 평가된다 (상수 이름을 쓰면 여기서 null)');

  const items = [];
  for (const g of (GROUPS || [])) for (const it of (g.items || [])) items.push(it);
  const eo = items.find((i) => i && i.href === '/enroll-ops.html');
  ok(!!eo, '「수강 운영」 항목을 찾았다');
  const hide = (eo && eo.hideFrom) || [];
  for (const r of ['teacher', 'franchise', 'branch', 'agency']) {
    ok(hide.indexOf(r) >= 0, `수강 운영이 ${r} 에게 감춰진다`);
  }
  /* 짝 — «전부 감추기» 가 아닌지.
     ⚠️ 「href 항목 중 안 감춘 것이 있나」로 물으면 안 된다 — href 항목이 전부
        정당하게 감춰지는 날 멀쩡한 코드가 빨간불이 된다(2026-09-10 실제로 밟음).
        물어야 할 것은 «지사 계정에게 메뉴가 남아 있는가» 다. */
  const leftForBranch = items.filter((i) => i && (i.hideFrom || []).indexOf('branch') < 0).length;
  ok(leftForBranch >= 10, `지사 계정에게 남는 항목 ${leftForBranch}개 (전부 감추기가 아니다)`);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
