// ↕🔑 대리점 목록 «머리글 정렬» + «✏️ 수정 창에서 로그인 계정 만들기» (2026-10-28 사장님
//   「대리점 아이디와 정보를 넣어주고 필터 올림·내림 넣어줘」)
//   ① 서버 정렬 SQL 을 소스에서 오려 내 진짜 SQLite 에 돌린다(문자열이 아니라 «실제 순서» 를 본다)
//   ② 서버 계정 검사·쓰기(checkAgencyLogin/applyAgencyLogin)를 오려 내 진짜 SQLite 로 돌린다
//   ③ PATCH·POST 가 «검사 → 저장 → 계정» 순서인지(반쪽 저장 방지)
//   ④ 화면: 정렬 순환(▲→▼→원래)·화살표, 수정 창 아이디 미리 채우기·안내 문구
//   ⑤ 머리글 data-sk 가 서버가 아는 열쇠인지(오타면 눌러도 «원래 순서» 로 조용히 돌아간다)
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (extra ? ' — ' + extra : '')); } };
const api = readFileSync(new URL('../cloudflare-deploy/src/api-admin.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('../cloudflare-deploy/public/js/adm-core.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../cloudflare-deploy/public/admin.html', import.meta.url), 'utf8');

// ── ① 서버 정렬 ─────────────────────────────────────────────
console.log('① 서버 정렬(ORDER BY 를 진짜 SQLite 에)');
const s0 = api.indexOf('const _txt = (col: string) =>');
const s1 = api.indexOf('const pageSql = limit === 0', s0);
ok('전제: 정렬 블록을 찾았다', s0 > 0 && s1 > s0);
let mkOrder = null;
try {
  mkOrder = new Function('url', 'canEditOrg', '_cSc',
    stripTypeScriptTypes(api.slice(s0, s1)) + '\nreturn { orderSql, sortDef, _sortKey, sortDir };');
} catch (e) { console.log('  ' + e.message); }
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE franchises (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE centers (id INTEGER PRIMARY KEY, franchise_id INTEGER, name TEXT, country TEXT, manager TEXT, phone TEXT, address TEXT, payment_type TEXT, active INTEGER);
  CREATE TABLE settlement_rate_override (scope_type TEXT, scope_key TEXT, tuition_krw INTEGER);
  CREATE TABLE admin_scope (username TEXT PRIMARY KEY, scope_type TEXT, scope_value TEXT, updated_at INTEGER);
  CREATE TABLE admin_account (username TEXT PRIMARY KEY, password_hash TEXT, name TEXT, created_at INTEGER, updated_at INTEGER);
  INSERT INTO franchises VALUES (1,'부산지사'),(2,'강남지사');
  INSERT INTO centers VALUES
    (10,1,'banana영어',NULL,'김','010-1',NULL,'B2C',1),
    (11,2,'Apple학원','KR','',NULL,'서울','B2B',1),
    (12,NULL,'다솜학원','',NULL,'010-3','  ',NULL,0),
    (13,1,'가람영어','PH','박',NULL,'부산','',1);
  INSERT INTO settlement_rate_override VALUES ('agency','banana영어',40000),('agency','가람영어',30000);
  INSERT INTO admin_scope (username,scope_type,scope_value) VALUES ('zeta','agency','가람영어'),('alpha','agency','다솜학원'),('gone','agency','banana영어');
  INSERT INTO admin_account (username) VALUES ('zeta'),('alpha');`);
const order = (q, hq = true) => {
  if (!mkOrder) return { ids: [], o: {} };
  const o = mkOrder(new URL('https://x/api/admin/centers?' + q), () => hq, {});
  // SQL 이 깨지면(예: 모르는 열쇠가 undefined 로 새어 들어감) 하니스가 죽지 않고 그 항목이 FAIL 로 남게
  try {
    const ids = db.prepare(`SELECT c.id FROM centers c LEFT JOIN franchises f ON f.id = c.franchise_id ORDER BY ${o.orderSql}`).all().map(r => r.id);
    return { ids, o };
  } catch (e) { return { ids: ['SQL오류:' + e.message], o }; }
};
const j = a => a.join(',');
ok('기본(정렬 없음) = 옛 순서(운영 먼저 → 이름)', j(order('').ids) === '11,10,13,12', j(order('').ids));
ok('이름 ▲ — 대소문자 무시(Apple < banana) → 한글', j(order('sort=name&dir=asc').ids) === '11,10,13,12', j(order('sort=name&dir=asc').ids));
ok('이름 ▼', j(order('sort=name&dir=desc').ids) === '12,13,10,11', j(order('sort=name&dir=desc').ids));
ok('ID ▼ (숫자)', j(order('sort=id&dir=desc').ids) === '13,12,11,10');
ok('담당자 ▲ — 빈 값(NULL·\'\')은 맨 아래', j(order('sort=manager&dir=asc').ids) === '10,13,11,12', j(order('sort=manager&dir=asc').ids));
ok('담당자 ▼ — 빈 값은 «내림» 에서도 맨 아래', j(order('sort=manager&dir=desc').ids) === '13,10,11,12', j(order('sort=manager&dir=desc').ids));
ok('주소 ▲ — 공백뿐인 값도 빈 값', order('sort=address&dir=asc').ids.slice(-2).sort().join() === '10,12', j(order('sort=address&dir=asc').ids));
ok('수강료 ▼ (숫자 40000 > 30000, 미설정은 아래)', j(order('sort=tuition&dir=desc').ids).startsWith('10,13'), j(order('sort=tuition&dir=desc').ids));
ok('결제유형 ▲ (B2B → B2C → 미지정)', j(order('sort=payment&dir=asc').ids).startsWith('11,10'), j(order('sort=payment&dir=asc').ids));
ok('지사 ▲ (강남 < 부산, 지사 없음은 아래)', j(order('sort=franchise&dir=asc').ids) === '11,10,13,12', j(order('sort=franchise&dir=asc').ids));
const lg = order('sort=login&dir=asc');
ok('로그인 아이디 ▲ (본사) — 지워진 계정은 없는 셈, 계정 없는 곳은 아래', j(lg.ids) === '12,13,10,11', j(lg.ids));
const lgNo = order('sort=login&dir=asc', false);
ok('🔒 본사가 아니면 로그인 정렬을 받지 않는다(기본 순서·sortDef 없음)', !lgNo.o.sortDef && j(lgNo.ids) === '11,10,13,12');
const evil = order('sort=' + encodeURIComponent("id; DROP TABLE centers") + '&dir=desc');
ok('⛔ 모르는 열쇠는 SQL 에 안 들어간다(기본 순서)', !evil.o.sortDef && !/DROP/.test(evil.o.orderSql || ''));
ok('⛔ 상속 속성(constructor)도 열쇠로 안 받는다', !order('sort=constructor').o.sortDef);
ok('dir 은 desc 아니면 전부 ASC', order('sort=name&dir=evil').o.sortDir === 'ASC');
ok('응답에 «실제로 적용한» 정렬을 싣는다', /sort: sortDef \? \{ key: _sortKey, dir:/.test(api));

// ── ② 서버 계정 검사·쓰기 ─────────────────────────────────────
console.log('② 대리점 로그인 계정 검사·쓰기(checkAgencyLogin/applyAgencyLogin)');
const a0 = api.indexOf('type AgencyLoginCheck =');
const a1 = api.indexOf("if (method === 'PATCH') {", a0);
ok('전제: 공용 도우미를 찾았다', a0 > 0 && a1 > a0);
const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({
  first: async () => db.prepare(sql).get(...a) || null,
  run: async () => db.prepare(sql).run(...a),
}) }) } };
let H = null;
try {
  H = new Function('env', 'FULL_ACCESS_ACCOUNTS', 'hashPassword',
    stripTypeScriptTypes(api.slice(a0, a1)) + '\nreturn { checkAgencyLogin, applyAgencyLogin };')(
    env, new Set(['admin', 'jeong']), async p => 'H(' + p + ')');
} catch (e) { console.log('  ' + e.message); }
const chk = async (...a) => { try { return await H.checkAgencyLogin(...a); } catch (e) { return { ok: false, error: 'THREW ' + e.message }; } };
if (H) {
  ok('새 아이디 → 만들기', (await chk('ysyt00', 'secret1', 'banana영어', 10, ['banana영어'])).mode === 'create');
  ok('아이디 형식', (await chk('a b', 'secret1', 'banana영어', 10, [])).error === 'bad_username');
  ok('비밀번호 6자', (await chk('ysyt00', '12345', 'banana영어', 10, [])).error === 'too_short');
  ok('전체권한 계정 이름 금지', (await chk('Admin', 'secret1', 'banana영어', 10, [])).error === 'reserved_username');
  ok('남의 대리점 아이디 → 거절', (await chk('zeta', 'secret1', 'banana영어', 10, ['banana영어'])).error === 'already_exists');
  const rs = await chk('ZETA', 'secret1', '가람영어', 13, ['가람영어']);
  ok('이 대리점 아이디(대소문자 무시) → 비밀번호 바꾸기', rs.mode === 'reset' && rs.username === 'zeta', JSON.stringify(rs));
  ok('등록(selfId=0)에서는 같은 아이디라도 바꾸기 없이 거절', (await chk('zeta', 'secret1', '가람영어', 0, [])).error === 'already_exists');
  ok('이름을 바꾸는 중이어도 옛 이름 계정은 이 대리점 것', (await chk('zeta', 'secret1', '가람영어2', 13, ['가람영어2', '가람영어'])).mode === 'reset');
  db.exec(`INSERT INTO centers (id,name) VALUES (14,'banana영어')`);
  ok('같은 이름 대리점이 또 있으면 만들기 거절', (await chk('newid', 'secret1', 'banana영어', 10, ['banana영어'])).error === 'duplicate_center_name');
  ok('자기 자신만 그 이름이면 통과', (await chk('newid', 'secret1', '가람영어', 13, ['가람영어'])).mode === 'create');
  ok('등록(selfId=0)은 같은 이름이 하나라도 있으면 거절', (await chk('newid', 'secret1', '가람영어', 0, [])).error === 'duplicate_center_name');
  db.exec(`DELETE FROM centers WHERE id = 14`);
  const c1 = await chk('ysyt00', 'secret1', 'banana영어', 10, ['banana영어']);
  const r1 = await H.applyAgencyLogin(c1, 'secret1', 'banana영어');
  const acc = db.prepare(`SELECT * FROM admin_account WHERE username='ysyt00'`).get();
  const sc = db.prepare(`SELECT * FROM admin_scope WHERE username='ysyt00'`).get();
  ok('만들기: 계정 + agency 범위(이름 그대로)', r1 === 'created' && acc && acc.password_hash === 'H(secret1)' && sc && sc.scope_type === 'agency' && sc.scope_value === 'banana영어');
  const before = db.prepare(`SELECT COUNT(*) n FROM admin_account`).get().n;
  const r2 = await H.applyAgencyLogin(await chk('zeta', 'newpass9', '가람영어', 13, ['가람영어']), 'newpass9', '가람영어');
  ok('바꾸기: 비밀번호만 바뀌고 계정은 안 늘어난다',
    r2 === 'reset' && db.prepare(`SELECT password_hash h FROM admin_account WHERE username='zeta'`).get().h === 'H(newpass9)'
    && db.prepare(`SELECT COUNT(*) n FROM admin_account`).get().n === before);
}

// ── ③ 순서: 검사 → 저장 → 계정 ──────────────────────────────
console.log('③ PATCH·POST 순서(반쪽 저장 방지)');
const p0 = api.indexOf("if (method === 'PATCH') {", a1 - 5);
const p1 = api.indexOf('login_account_note: linkedAccount', p0);
const patch = api.slice(p0, p1);
const iChk = patch.indexOf('checkAgencyLogin('), iUpd = patch.indexOf('UPDATE centers SET ${sets.join'), iApp = patch.indexOf('applyAgencyLogin(');
ok('PATCH: 검사 → UPDATE → 계정', iChk > 0 && iUpd > iChk && iApp > iUpd, [iChk, iUpd, iApp].join('/'));
ok('PATCH: 비밀번호를 넣었을 때만 계정을 건드린다', /if \(loginPw\) \{[\s\S]{0,600}checkAgencyLogin\(/.test(patch));
ok('PATCH: 계정만 바꾸는 저장도 «수정할 값 없음» 으로 막지 않는다', /if \(!sets\.length && !loginChk\)/.test(patch));
ok('PATCH: 결과를 화면에 알린다(login_result)', /login_result: loginResult/.test(api.slice(p0, p1 + 400)));
const q0 = api.indexOf("const loginUsername = String(b.login_username || '').trim();", p1);
const q1 = api.indexOf('login_created: loginCreated', q0);
const post = api.slice(q0, q1);
ok('POST: 검사 → INSERT → 계정(같은 도우미)', post.indexOf('checkAgencyLogin(') > 0
  && post.indexOf('INSERT INTO centers') > post.indexOf('checkAgencyLogin(') && post.indexOf('applyAgencyLogin(') > post.indexOf('INSERT INTO centers'));
ok('POST: 검사·계정 SQL 을 따로 복제하지 않는다', !/INSERT INTO admin_account/.test(post) && !/FULL_ACCESS_ACCOUNTS/.test(post));

// ── ④ 화면 ────────────────────────────────────────────────
console.log('④ 화면: 정렬 순환·화살표 / 수정 창');
const f0 = core.indexOf('function ctSortBy(key)');
const f1 = core.indexOf('function ctPrevPage()', f0);
ok('전제: 정렬 함수를 찾았다', f0 > 0 && f1 > f0);
const calls = [];
const ths = ['id', 'name', 'manager'].map(k => {
  const at = { 'data-sk': k, 'data-ar': '⇅' }, cls = new Set();
  return { getAttribute: n => at[n], setAttribute: (n, v) => { at[n] = v; }, at,
    classList: { contains: c => cls.has(c), toggle: (c, on) => { on ? cls.add(c) : cls.delete(c); } } };
});
const st = { sort: '', dir: '' };
let S = null;
try {
  S = new Function('_ctState', 'loadCenters', 'document', 'window', core.slice(f0, f1) + '\nreturn { ctSortBy, _ctSyncSortHead };')(
    st, o => { calls.push(o); st.sort = o.sort; st.dir = o.dir; },
    { querySelectorAll: sel => (sel === '#ct-list-table th.ct-sort-th' ? ths : []) }, {});
} catch (e) { console.log('  ' + e.message); }
if (S) {
  S.ctSortBy('name'); ok('1번 누름 → ▲ 올림', st.sort === 'name' && st.dir === 'asc');
  S._ctSyncSortHead();
  ok('화살표: 고른 칸 ▲ · 나머지 ⇅', ths[1].at['data-ar'] === '▲' && ths[0].at['data-ar'] === '⇅' && ths[1].classList.contains('ct-sort-on'));
  S.ctSortBy('name'); ok('2번 → ▼ 내림', st.sort === 'name' && st.dir === 'desc');
  S._ctSyncSortHead(); ok('화살표 ▼', ths[1].at['data-ar'] === '▼');
  S.ctSortBy('name'); ok('3번 → 원래 순서', st.sort === '' && st.dir === '');
  S._ctSyncSortHead(); ok('화살표 전부 ⇅', ths.every(t => t.at['data-ar'] === '⇅') && !ths[1].classList.contains('ct-sort-on'));
  S.ctSortBy('manager'); S.ctSortBy('id'); ok('다른 칸을 누르면 그 칸 ▲ 부터', st.sort === 'id' && st.dir === 'asc');
}
const lc = core.slice(core.indexOf('async function loadCenters('), core.indexOf('// 💳 결제유형 저장'));
ok('요청에 sort/dir 를 싣는다', /'&sort=' \+ encodeURIComponent\(_ctState\.sort\)/.test(lc));
ok('정렬을 바꾸면 첫 페이지부터', /opts\.sort !== undefined\)[^\n]*_ctState\.offset = 0/.test(lc));
ok('화살표는 서버가 돌려준 d.sort 로', /_ctState\.sort = d\.sort \?/.test(lc) && /_ctSyncSortHead\(\)/.test(lc));

const e0 = core.indexOf('var _CT_LOGIN_HINT');
const e1 = core.indexOf('window.ctEdit = ctEdit;', e0);
ok('전제: 수정 창 함수를 찾았다', e0 > 0 && e1 > e0);
const mkDom = () => {
  const els = {};
  ['ct-franchise', 'ct-name', 'ct-country', 'ct-manager', 'ct-phone', 'ct-address', 'ct-paytype', 'ct-tuition', 'ct-login-id', 'ct-login-pw', 'ct-add-btn', 'ct-cancel-btn', 'ct-form-wrap', 'ct-login-hint']
    .forEach(id => { const at = {}; els[id] = { value: 'X', style: {}, open: false, textContent: '', focus() {}, setAttribute: (n, v) => { at[n] = v; }, getAttribute: n => at[n], at }; });
  return els;
};
const runEdit = (row) => {
  const els = mkDom();
  try {
    const F = new Function('document', 'adminLang', '_ctRows', '_ctSetBtnLabel', 'window',
      'var _ctEditId = 0, _ctTuitionPrev = "";\n' + core.slice(e0, e1) + '\nreturn ctEdit;')(
      { getElementById: id => els[id] || null }, 'ko', [row], () => {}, {});
    F(row.id);
  } catch (e) { console.log('  ' + e.message); }
  return els;
};
const one = runEdit({ id: 5, name: '가람영어', login_ids: ['zeta'] });
ok('계정이 하나면 그 아이디를 미리 채운다', one['ct-login-id'].value === 'zeta');
ok('비밀번호는 절대 채우지 않는다', one['ct-login-pw'].value === '');
ok('안내 문구가 «수정» 판으로(ko·en 둘 다)', /비밀번호를 넣고 저장하면/.test(one['ct-login-hint'].textContent)
  && /Enter a password/.test(one['ct-login-hint'].at['data-en'] || ''));
ok('로그인 칸을 숨기지 않는다', one['ct-login-id'].style.display !== 'none');
ok('계정이 여럿이면 비워 둔다(추측 금지)', runEdit({ id: 6, name: 'x', login_ids: ['a1', 'b2'] })['ct-login-id'].value === '');
ok('계정이 없으면 비워 둔다', runEdit({ id: 7, name: 'x', login_ids: [] })['ct-login-id'].value === '');
const sc = core.slice(core.indexOf('async function saveCenter('), core.indexOf('window.saveCenter'));
const scPatch = sc.slice(0, sc.indexOf("_menuPost('/api/admin/centers'"));
ok('수정 저장이 아이디·비밀번호를 보낸다', /login_username: loginId \|\| null, login_password: loginPw \|\| null/.test(scPatch.slice(scPatch.indexOf("method: 'PATCH'"))));
ok('수정 저장이 결과(만듦/바꿈)를 사람에게 말한다', /login_result === 'created'/.test(scPatch) && /login_result === 'reset'/.test(scPatch));
ok('ctResetForm 이 안내 문구를 «등록» 판으로 되돌린다', /function ctResetForm\(\) \{[\s\S]{0,700}_ctSetLoginHint\(false\)/.test(core));

// ── ⑤ 머리글 ↔ 서버 열쇠 ────────────────────────────────────
console.log('⑤ 머리글 data-sk ↔ 서버 CT_SORT');
const thead = (html.match(/<table data-gc="🏪 대리점 목록"[\s\S]*?<\/thead>/) || [''])[0];
const sks = [...thead.matchAll(/<th data-sk="(\w+)"[^>]*onclick="ctSortBy\('(\w+)'\)"/g)];
ok('정렬 머리글 10칸(액션 빼고 전부)', sks.length === 10, String(sks.length));
ok('data-sk 와 onclick 열쇠가 같다', sks.every(m => m[1] === m[2]));
const block = api.slice(s0, s1);
const known = new Set([...block.matchAll(/^\s+(\w+):\s*\{ expr:/gm)].map(m => m[1]).concat(/CT_SORT\.login = /.test(block) ? ['login'] : []));
ok('머리글 열쇠가 전부 서버가 아는 열쇠', sks.length > 0 && sks.every(m => known.has(m[1])), sks.map(m => m[1]).filter(k => !known.has(k)).join());
ok('화살표 CSS 는 data-ar + ::after(i18n 이 글자를 갈아끼워도 산다)', /#ct-list-table th\.ct-sort-th::after\{content:attr\(data-ar\)/.test(html));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
