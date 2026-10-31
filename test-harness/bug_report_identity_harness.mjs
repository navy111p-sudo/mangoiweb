// bug_report_identity_harness.mjs — 🐞 버그·피드백 접수함 「신고자」 칸이 비던 것 (2026-09-13)
//
// 왜 만들었나
//   접수함 신고 4건이 전부 「-」(reporter_uid·reporter_name NULL) 였다. 홈 화면 FAB 이
//   `getCurrentUser()`(= 학생 전용 키 `mangoi_logged_user`)로 교사 이름을 읽어 보냈는데
//   교사는 그 키가 없다(교사는 admin 세션 쿠키). 서버 주석은 「교사에겐 admin 세션이 없다」는
//   거짓 전제를 적어 두고 본문 값만 믿었다.
//   → 서버 `POST /api/bug-report` 가 세션(`getAdminActor`)으로 신원을 «먼저» 채운다.
//
// ⚠️ 문자열 검사로는 못 잡는다 — 함수도 값도 다 «있고» 틀린 것은 «어느 키에서 읽는가» 뿐.
//    그래서 이 하니스는 POST 핸들러 블록을 **오려 내 가짜 request·env 로 실제로 돌린다.**
//    화면 쪽 `brReporterOf` 도 오려 내 돌려 «옛 행(둘 다 NULL)» 이 「-」 대신 무엇을 보여 주는지 본다.
//
// 짝(pair) — 한쪽만 두면 엉터리 수리도 통과한다
//   「세션이 있으면 서버 값이 이긴다」  ↔  「세션이 없으면 본문 값이 그대로 남는다」
//   「조회가 던져도 신고는 저장된다」   ↔  「저장되는 값은 본문 값이다」
//
// 변이시험(전부 실제 FAIL 확인 — 2026-09-13)
//   Ⓐ actor 블록 통째로 지우기(옛 코드)            → ②③ FAIL
//   Ⓑ 본문 값이 있으면 서버 값을 안 쓰기(뒤집기)    → ③ FAIL
//   Ⓒ actor 예외를 안 삼키기(신고가 500)           → ④ FAIL
//   Ⓓ 서버 폴백(vc_name) 지우기                     → ⑥⑦ FAIL
//   Ⓔ GET 이 reporter_shown 을 안 싣기               → ⑦ FAIL
//   Ⓕ 화면이 URL 을 다시 파싱하기(정본 두 벌)         → ⑧ FAIL
//   Ⓖ 머리말의 «사실이 아니다» 만 지우기              → ⑨ FAIL (처음엔 파일 전체를 봐서 죽은 검사였다 — 함정 대조가 잡음)
//   BUG_SRC_FILE=<사본> · BUG_JS_FILE=<사본> 로 변이 사본을 넣어 돌릴 수 있다.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.BUG_SRC_FILE || join(__dir, '../cloudflare-deploy/src/api-admin.ts');
const JS = process.env.BUG_JS_FILE || join(__dir, '../cloudflare-deploy/public/js/adm-bugreports.js');
const src = readFileSync(SRC, 'utf8');
const js = readFileSync(JS, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

/* 중괄호 짝으로 블록을 자른다 (문자열·주석은 이 블록에 «괄호가 든 것» 이 없어 단순 계수로 충분) */
function blockAt(s, anchor) {
  const i = s.indexOf(anchor);
  if (i < 0) return '';
  const open = s.indexOf('{', i);
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (d === 0) return s.slice(open + 1, k); }
  }
  return '';
}
/* `: any` · `: any[]` · ` as any` 만 벗긴다 — ⚠️ `any[]` 뒤에는 \b 가 안 걸린다(`]` 와 공백 사이) → (?!\w) */
const stripTs = (t) => t.replace(/:\s*any(\[\])?(?!\w)/g, '').replace(/\s+as\s+any(?!\w)/g, '');

/* 🔒 역할 판정 `isOrgScopedRole` 은 정본(auth-admin.ts)을 오려 내 쓴다 — 손으로 베끼면 정본이
   좁아질 때 게이트는 바뀌는데 검사만 초록이다(CLAUDE.md). */
const auth = readFileSync(join(__dir, '../cloudflare-deploy/src/auth-admin.ts'), 'utf8');
const orgBody = blockAt(auth, 'export function isOrgScopedRole');
const isOrgScopedRole = orgBody ? new Function('role', orgBody) : null;

console.log('① 전제 — 핸들러·화면 함수를 실제로 잘라 냈다');
const postBody = blockAt(src, "if (method === 'POST' && path === '/api/bug-report')");
ok(postBody.includes('INSERT INTO bug_reports'), 'POST /api/bug-report 블록을 잘라 냈다 (INSERT 포함)');
const jsFn = blockAt(js, 'function brReporterOf(b)');
ok(jsFn.includes('reporter_shown'), 'adm-bugreports.js 의 brReporterOf 를 잘라 냈다');
ok(typeof isOrgScopedRole === 'function' && isOrgScopedRole('branch') === true && isOrgScopedRole('hq') === false, 'auth-admin.ts 의 isOrgScopedRole 을 잘라 내 실제로 돈다');

/* ── 서버 핸들러를 실제로 돌리는 틀 ── */
async function runPost({ body, actor, actorThrows }) {
  const inserted = [];
  const env = { DB: { prepare: (sql) => ({ bind: (...b) => ({ run: async () => { inserted.push({ sql, b }); return { meta: { last_row_id: 7 } }; } }) }) } };
  const request = { json: async () => body, headers: { get: () => 'UA/1' } };
  const json = (o, status) => ({ o, status: status || 200 });
  const ensureBugTable = async () => {};
  const getAdminActor = async () => { if (actorThrows) throw new Error('D1 흔들림'); return actor || { ok: false, username: '', name: '', role: 'none', isTeacher: false }; };
  /* ⚠️ 핸들러가 던지면(만들 때든 부를 때든) «크래시» 가 아니라 «깔끔한 FAIL» 로 — 스택트레이스만
     남으면 무엇이 깨졌는지 안 보인다(CLAUDE.md 「하니스를 크래시시키지 마세요」). */
  let res, threw = null;
  try {
    const fn = new Function('request', 'env', 'json', 'ensureBugTable', 'getAdminActor', 'isOrgScopedRole', 'console',
      'return (async () => { const method = "POST", path = "/api/bug-report";\n' + stripTs(postBody) + '\n})();');
    res = await fn(request, env, json, ensureBugTable, getAdminActor, isOrgScopedRole, { warn: () => {} });
  } catch (e) { threw = e; res = { o: { ok: false, error: 'THREW: ' + (e && e.message) }, status: 500 }; }
  const ins = inserted.find(x => /INSERT INTO bug_reports/.test(x.sql));
  // 바인드 순서: reporter_role, reporter_uid, reporter_name, category, message, page_url, ua, now
  return { res, threw, row: ins ? { role: ins.b[0], uid: ins.b[1], name: ins.b[2], msg: ins.b[4] } : null };
}

const TEACHER = { ok: true, username: 'mangoi_167', name: 'Teacher Len', role: 'teacher', isTeacher: true };
const HQ = { ok: true, username: 'admin', name: '정우영', role: 'hq', isTeacher: false };

console.log('② 홈 FAB 이 보내던 모양(uid·name 빈 값) + 교사 세션 → 서버가 채운다');
{
  const { res, row } = await runPost({ body: { message: 'very laggy', reporter_role: 'teacher', reporter_uid: '', reporter_name: '' }, actor: TEACHER });
  ok(res.o.ok === true, '신고가 저장된다(ok:true)');
  ok(row && row.uid === 'mangoi_167', 'reporter_uid 가 세션 계정(mangoi_167)으로 채워진다 — 옛 코드는 NULL');
  ok(row && row.name === 'Teacher Len', 'reporter_name 이 admin_account.name 으로 채워진다');
  ok(row && row.role === 'teacher', 'reporter_role 이 teacher');
}

console.log('③ 세션이 있으면 «서버 값이 이긴다» — 본문에 남의 이름을 적어도 무시');
{
  const { row } = await runPost({ body: { message: 'x', reporter_uid: 'someone_else', reporter_name: '남의 이름', reporter_role: 'admin' }, actor: TEACHER });
  ok(row && row.uid === 'mangoi_167' && row.name === 'Teacher Len', '본문의 uid·name 이 세션 값으로 덮인다');
  ok(row && row.role === 'teacher', '본문 role(admin) 이 아니라 세션 판정(teacher) 이 남는다');
}
{
  const { row } = await runPost({ body: { message: 'x' }, actor: HQ });
  ok(row && row.role === 'admin' && row.uid === 'admin' && row.name === '정우영', '본사 세션이면 role=admin · 계정·이름이 채워진다');
  const br = await runPost({ body: { message: 'x' }, actor: { ok: true, username: 'branch_busan', name: '부산지사', role: 'branch', isTeacher: false } });
  ok(br.row && br.row.role === 'branch', '지사 세션이면 role 을 그대로(branch) 남긴다 — 「관리자」로 뭉뚱그리지 않음');
  const st = await runPost({ body: { message: 'x' }, actor: { ok: true, username: 'ops_lead', name: '운영', role: 'staff', isTeacher: false } });
  ok(st.row && st.row.role === 'admin', '내부직원(staff) 세션은 admin 라벨');
}
{
  const { row } = await runPost({ body: { message: 'x', reporter_name: '본문이름' }, actor: { ...TEACHER, name: '' } });
  ok(row && row.name === '본문이름', '세션은 있는데 admin_account.name 이 비면 본문 이름을 쓴다');
  const r2 = await runPost({ body: { message: 'x' }, actor: { ...TEACHER, name: '' } });
  ok(r2.row && r2.row.name === 'mangoi_167', '이름이 어디에도 없으면 계정 아이디를 이름 자리에 둔다(「-」 보다 낫다)');
}

console.log('④ 짝 — 세션이 «없으면» 본문 값 그대로 (학생·비로그인 신고가 막히면 안 된다)');
{
  const { res, row } = await runPost({ body: { message: 'hi', reporter_role: 'student', reporter_uid: 'jeong', reporter_name: '정우영' } });
  ok(res.o.ok === true, '비로그인도 저장된다');
  ok(row && row.uid === 'jeong' && row.name === '정우영' && row.role === 'student', '본문 uid·name·role 이 그대로 남는다');
}
{
  const { res, row, threw } = await runPost({ body: { message: 'hi', reporter_uid: 'jeong', reporter_name: '정우영', reporter_role: 'teacher' }, actorThrows: true });
  ok(!threw && res.o.ok === true, '세션 조회가 던져도 신고는 저장된다(fail-open — 신고가 막히는 쪽이 더 나쁘다)' + (threw ? ' — 핸들러가 던짐: ' + threw.message : ''));
  ok(row && row.uid === 'jeong' && row.name === '정우영', '그때 저장되는 값은 본문 값이다');
}
{
  const { res, row } = await runPost({ body: { message: '   ' }, actor: TEACHER });
  ok(res.status === 400 && !row, '본문이 비면 여전히 400 (세션이 있어도 빈 신고는 안 받는다)');
}

console.log('⑤ 위치 — 신원 조회가 INSERT «앞» 에 있고, INSERT 가 그 변수를 바인딩한다');
{
  const iActor = postBody.indexOf('getAdminActor(');
  const iIns = postBody.indexOf('INSERT INTO bug_reports');
  ok(iActor > 0 && iActor < iIns, 'getAdminActor 호출이 INSERT 보다 앞');
  ok(/\.bind\(reporterRole,\s*reporterUid,\s*reporterName/.test(postBody), 'INSERT 가 reporterRole·reporterUid·reporterName 변수를 그 순서로 바인딩');
}

console.log('⑥ 서버 — 옛 행(둘 다 NULL)에 「-」 대신 알 수 있는 데까지 내려준다 (정본 bugReporterView)');
/* 2026-09-13 D1 실측 행 그대로 */
const legacyUrl = 'https://test.mangoi.co.kr/?vc_autojoin=1&vc_role=teacher&vc_room=demo-1&vc_name=%EA%B5%90%EC%82%AC+mangoi_167&room=demo-1';
let view = null;
{
  const vb = blockAt(src, 'const bugReporterView = (r');
  ok(vb.includes('vc_name'), '전제 — bugReporterView 몸통을 잘라 냈다');
  /* 못 잘라 냈으면(정본이 없는 사본) 크래시 대신 «틀린 답» 을 내는 대역 — 아래 검사가 깔끔히 FAIL 한다 */
  view = vb ? new Function('r', stripTs(vb)) : () => ({ shown: '(정본 없음)', via: '(정본 없음)' });
  const a = view({ reporter_role: 'teacher', reporter_uid: null, reporter_name: null, page_url: legacyUrl });
  ok(a.shown === '교사 mangoi_167' && a.via === 'url', 'uid·name 이 NULL 이면 page_url 의 vc_name 을 via:url 로 준다 (실측 행: ' + a.shown + ')');
  const b = view({ reporter_role: 'teacher', reporter_uid: null, reporter_name: null, page_url: 'https://test.mangoi.co.kr/' });
  ok(b.shown === '' && b.via === '', '주소에도 없으면 빈 값 — 지어내지 않는다');
  const c = view({ reporter_uid: 'mangoi_167', reporter_name: null, page_url: legacyUrl });
  ok(c.shown === 'mangoi_167' && c.via === 'uid', 'uid 만 있으면 uid (주소는 안 본다)');
  const d = view({ reporter_uid: 'mangoi_167', reporter_name: 'Teacher Len', page_url: legacyUrl });
  ok(d.shown === 'Teacher Len' && d.via === 'name', '새 행(둘 다 있음)은 이름');
  const e = view({ reporter_uid: null, reporter_name: null, page_url: 'not a url' });
  ok(e.shown === '' && e.via === '', '주소가 깨져 있어도 던지지 않는다');
  ok(view(null).shown === '', 'null 행에도 던지지 않는다');
}

console.log('⑦ GET /api/admin/bug-reports 가 그 값을 «행마다» 싣는다 — 화면 둘이 같은 답을 받도록');
{
  const getBody = blockAt(src, "if (method === 'GET' && path === '/api/admin/bug-reports')");
  ok(getBody.includes('bugReporterView('), '전제 — GET 블록을 잘라 냈고 정본을 부른다');
  const rowsDb = [
    { id: 3, reporter_role: 'teacher', reporter_uid: null, reporter_name: null, page_url: legacyUrl, status: 'new' },
    { id: 9, reporter_role: 'teacher', reporter_uid: 'mangoi_167', reporter_name: 'Teacher Len', page_url: 'https://mangoi.ai/', status: 'new' },
  ];
  const env = { DB: { prepare: (sql) => ({ bind: () => ({ all: async () => ({ results: /GROUP BY/.test(sql) ? [] : rowsDb }) }), all: async () => ({ results: [] }) }) } };
  const url = new URL('https://mangoi.ai/api/admin/bug-reports');
  const json = (o) => ({ o });
  let out = null, threw = null;
  try {
    const fn = new Function('url', 'env', 'json', 'ensureBugTable', 'bugReporterView',
      'return (async () => { const method = "GET", path = "/api/admin/bug-reports";\n' + stripTs(getBody) + '\n})();');
    out = await fn(url, env, json, async () => {}, (r) => view(r));
  } catch (e) { threw = e; }
  ok(!threw && out && out.o.ok === true && out.o.count === 2, 'GET 이 정상 응답 (count 2)' + (threw ? ' — 던짐: ' + threw.message : ''));
  const r3 = out && out.o.rows.find(r => r.id === 3);
  ok(r3 && r3.reporter_shown === '교사 mangoi_167' && r3.reporter_via === 'url', '옛 행에 reporter_shown=«교사 mangoi_167»·reporter_via=url 이 실린다');
  const r9 = out && out.o.rows.find(r => r.id === 9);
  ok(r9 && r9.reporter_shown === 'Teacher Len' && r9.reporter_via === 'name', '새 행에 reporter_shown=이름·via=name');
  ok(r3 && r3.reporter_uid === null && r3.page_url === legacyUrl, '원래 칸(reporter_uid·page_url)은 그대로 남는다(덮어쓰지 않음)');
}

console.log('⑧ 화면 둘 — 서버 값을 «그대로» 쓰고 URL 을 다시 파싱하지 않는다');
{
  const mk = new Function('ROLE_LABEL', '_isEn', 'function brReporterOf(b){' + jsFn + '}\nreturn brReporterOf;');
  const ROLE_LABEL = (r) => ({ teacher: '교사', admin: '관리자', student: '학생' }[r] || (r || '-'));
  const f = mk(ROLE_LABEL, () => false);
  const a = f({ reporter_role: 'teacher', reporter_uid: null, reporter_name: null, page_url: legacyUrl, reporter_shown: '교사 mangoi_167', reporter_via: 'url' });
  ok(a.shown === '교사 mangoi_167' && /주소에서/.test(a.sub), '접수함: 서버가 via:url 로 주면 그 표기 + «주소에서»');
  const b = f({ reporter_role: 'teacher', reporter_uid: null, reporter_name: null, page_url: legacyUrl, reporter_shown: '', reporter_via: '' });
  ok(b.shown === '-' && !/주소에서/.test(b.sub), '접수함: 서버가 빈 값이면 「-」 (URL 을 스스로 파싱해 채우지 않는다)');
  const d = f({ reporter_role: 'teacher', reporter_uid: 'mangoi_167', reporter_name: 'Teacher Len', reporter_shown: 'Teacher Len', reporter_via: 'name' });
  ok(d.shown === 'Teacher Len' && d.sub === '교사 · mangoi_167', '접수함: 새 행은 이름 + «교사 · 계정»');
  const old = f({ reporter_role: 'teacher', reporter_uid: 'mangoi_167', reporter_name: 'Teacher Len' });
  ok(old.shown === 'Teacher Len', '접수함: 옛 응답(reporter_shown 없음)에도 이름이 나온다(캐시된 옛 화면 대비)');
  ok(!/new URL\(/.test(jsFn), '접수함: URL 파싱은 서버 정본에만 있다(화면에 복제 0)');
  ok(/const rp = brReporterOf\(b\)/.test(js) && !/esc\(b\.reporter_name\|\|'-'\)/.test(js), '접수함: 표의 신고자 칸이 그 함수를 실제로 쓴다(옛 식 잔존 0)');
  const mgr = readFileSync(join(__dir, '../cloudflare-deploy/public/manager.html'), 'utf8');
  ok(/esc\(r\.reporter_shown \|\| r\.reporter_name \|\| r\.reporter_uid \|\| '-'\)/.test(mgr), 'manager.html 도 reporter_shown 을 먼저 그린다(화면 둘이 같은 답)');
  ok(/r\.reporter_via === 'url'/.test(mgr), 'manager.html 도 «주소에서» 표기를 함께 적는다');
}

console.log('⑨ 문서 — 거짓 전제(「교사에겐 admin 세션이 없어」)가 소스에 남아 있지 않다');
{
  const noComment = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok(!/교사에겐 admin 세션이 없어 신원은 clientside 전달/.test(noComment), '(주석 벗긴 사본) 옛 문장이 코드에 없다');
  /* ⚠️ 파일 전체에서 찾으면 다른 자리의 같은 낱말에 걸려 «죽은 검사» 가 된다(함정 대조 실측) — 머리말 블록만 잘라 본다 */
  const head = src.slice(src.indexOf('🐞 Phase BUG'), src.indexOf('const ensureBugTable'));
  ok(head.length > 0 && /사실이 아니다/.test(head) && /admin 세션/.test(head), '이 절의 머리말이 그 전제가 틀렸다고 적어 둔다');
  ok(/남은 구멍/.test(head) && /본문 그대로/.test(head), '머리말이 «세션 없는 요청은 본문 그대로» 라는 남은 구멍을 명시한다');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
