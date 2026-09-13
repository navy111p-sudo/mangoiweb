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
//   Ⓓ 화면 폴백(uid·vc_name) 지우기                 → ⑥ FAIL
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
const stripTs = (t) => t.replace(/:\s*any\b/g, '').replace(/\s+as\s+any\b/g, '');

console.log('① 전제 — 핸들러·화면 함수를 실제로 잘라 냈다');
const postBody = blockAt(src, "if (method === 'POST' && path === '/api/bug-report')");
ok(postBody.includes('INSERT INTO bug_reports'), 'POST /api/bug-report 블록을 잘라 냈다 (INSERT 포함)');
const jsFn = blockAt(js, 'function brReporterOf(b)');
ok(jsFn.includes('vc_name'), 'adm-bugreports.js 의 brReporterOf 를 잘라 냈다');

/* ── 서버 핸들러를 실제로 돌리는 틀 ── */
async function runPost({ body, actor, actorThrows }) {
  const inserted = [];
  const env = { DB: { prepare: (sql) => ({ bind: (...b) => ({ run: async () => { inserted.push({ sql, b }); return { meta: { last_row_id: 7 } }; } }) }) } };
  const request = { json: async () => body, headers: { get: () => 'UA/1' } };
  const json = (o, status) => ({ o, status: status || 200 });
  const ensureBugTable = async () => {};
  const getAdminActor = async () => { if (actorThrows) throw new Error('D1 흔들림'); return actor || { ok: false, username: '', name: '', role: 'none', isTeacher: false }; };
  const fn = new Function('request', 'env', 'json', 'ensureBugTable', 'getAdminActor', 'console',
    'return (async () => { const method = "POST", path = "/api/bug-report";\n' + stripTs(postBody) + '\n})();');
  /* ⚠️ 핸들러가 던지면 «크래시» 가 아니라 «깔끔한 FAIL» 로 — 스택트레이스만 남으면 무엇이
     깨졌는지 안 보인다(CLAUDE.md 「하니스를 크래시시키지 마세요」). */
  let res, threw = null;
  try { res = await fn(request, env, json, ensureBugTable, getAdminActor, { warn: () => {} }); }
  catch (e) { threw = e; res = { o: { ok: false, error: 'THREW: ' + (e && e.message) }, status: 500 }; }
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

console.log('⑥ 화면 — 옛 행(둘 다 NULL)에 「-」 대신 알 수 있는 데까지 보여 준다');
{
  const mk = new Function('ROLE_LABEL', '_isEn', 'function brReporterOf(b){' + jsFn + '}\nreturn brReporterOf;');
  const ROLE_LABEL = (r) => ({ teacher: '교사', admin: '관리자', student: '학생' }[r] || (r || '-'));
  const f = mk(ROLE_LABEL, () => false);
  // 2026-09-13 D1 실측 행 그대로
  const legacyUrl = 'https://test.mangoi.co.kr/?vc_autojoin=1&vc_role=teacher&vc_room=demo-1&vc_name=%EA%B5%90%EC%82%AC+mangoi_167&room=demo-1';
  const a = f({ reporter_role: 'teacher', reporter_uid: null, reporter_name: null, page_url: legacyUrl });
  ok(a.shown === '교사 mangoi_167', 'uid·name 이 NULL 이면 page_url 의 vc_name 을 보여 준다 (실측 행: ' + a.shown + ')');
  ok(/주소에서/.test(a.sub), '그것이 «주소에서» 온 표기라고 함께 적는다');
  const b = f({ reporter_role: 'teacher', reporter_uid: null, reporter_name: null, page_url: 'https://test.mangoi.co.kr/' });
  ok(b.shown === '-' && !/주소에서/.test(b.sub), '주소에도 없으면 「-」 — 지어내지 않는다');
  const c = f({ reporter_role: 'teacher', reporter_uid: 'mangoi_167', reporter_name: null, page_url: legacyUrl });
  ok(c.shown === 'mangoi_167' && !/주소에서/.test(c.sub), 'uid 만 있으면 uid 를 보여 주고 주소는 안 본다');
  const d = f({ reporter_role: 'teacher', reporter_uid: 'mangoi_167', reporter_name: 'Teacher Len', page_url: legacyUrl });
  ok(d.shown === 'Teacher Len' && d.sub === '교사 · mangoi_167', '새 행(둘 다 있음)은 이름 + «교사 · 계정»');
  const e = f({ reporter_role: 'teacher', reporter_uid: null, reporter_name: null, page_url: 'not a url' });
  ok(e.shown === '-', '주소가 깨져 있어도 던지지 않는다');
  ok(/const rp = brReporterOf\(b\)/.test(js) && !/esc\(b\.reporter_name\|\|'-'\)/.test(js), '표의 신고자 칸이 그 함수를 실제로 쓴다(옛 식 잔존 0)');
}

console.log('⑦ 문서 — 거짓 전제(「교사에겐 admin 세션이 없어」)가 소스에 남아 있지 않다');
{
  const noComment = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok(!/교사에겐 admin 세션이 없어 신원은 clientside 전달/.test(noComment), '(주석 벗긴 사본) 옛 문장이 코드에 없다');
  ok(/사실이 아니다/.test(src), '머리말이 그 전제가 틀렸다고 적어 둔다');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
