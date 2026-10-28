// ↕🔑 대리점 목록 «머리글 정렬» + «✏️ 수정 창에서 로그인 계정 만들기» (2026-10-28 사장님
//   「대리점 아이디와 정보를 넣어주고 필터 올림·내림 넣어줘」)
//   ① 서버 정렬 SQL 을 소스에서 오려 내 진짜 SQLite 에 돌린다(문자열이 아니라 «실제 순서» 를 본다)
//   ② 서버 계정 검사·쓰기(checkAgencyLogin/applyAgencyLogin)를 오려 내 진짜 SQLite 로 돌린다
//   ③ PATCH·POST 블록을 오려 «실제로» 돌린다 — 검사에 걸리면 저장 0건인가, 남의 계정을 못 건드리는가
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

// ── 공용: 스키마는 «정본 소스의 DDL» 을 읽어 만든다(하니스에 베껴 적지 않는다) ─────────
const authSrc = readFileSync(new URL('../cloudflare-deploy/src/auth-admin.ts', import.meta.url), 'utf8');
const syncSrc = readFileSync(new URL('../cloudflare-deploy/src/cafe24-sync.ts', import.meta.url), 'utf8');
const ddlOf = (src, re) => { const m = src.match(re); return m ? m[1] : ''; };
const DDL = {
  centers: ddlOf(api, /(CREATE TABLE IF NOT EXISTS centers \([^`]*?\);)/),
  centerAlters: [...api.matchAll(/ALTER TABLE centers ADD COLUMN (payment_type|phone) TEXT/g)].map(m => m[0]),
  franchises: ddlOf(syncSrc, /(CREATE TABLE IF NOT EXISTS franchises \([^`]*?\);)/),
  account: ddlOf(authSrc, /`(CREATE TABLE IF NOT EXISTS admin_account \([\s\S]*?\))`/),
  sessions: ddlOf(authSrc, /`(CREATE TABLE IF NOT EXISTS admin_sessions \([\s\S]*?\))`/),
  history: ddlOf(authSrc, /`(CREATE TABLE IF NOT EXISTS admin_login_history \([\s\S]*?\))`/),
  scope: ddlOf(api + authSrc, /(CREATE TABLE IF NOT EXISTS admin_scope \([^`]*?\);?)/),
  overrides: [...syncSrc.matchAll(/`(CREATE TABLE IF NOT EXISTS center_(?:franchise|manual)_override \([^`]*?\);)`/g)].map(m => m[1]),
};
ok('전제: 정본 DDL 을 모두 읽었다', Object.values(DDL).every(v => (Array.isArray(v) ? v.length === 2 : !!v)), JSON.stringify(Object.fromEntries(Object.entries(DDL).map(([k, v]) => [k, Array.isArray(v) ? v.length : !!v]))));
const mkDb = () => {
  const d = new DatabaseSync(':memory:');
  for (const q of [DDL.centers, ...DDL.centerAlters, DDL.franchises, DDL.account, DDL.sessions, DDL.history, DDL.scope])
    try { d.exec(q); } catch (e) { console.log('  DDL ' + e.message); }
  // settlement_rate_override 는 정렬 검사에서 tuition_krw 한 칸만 읽는다(정본 DDL 은 칸이 지연 ALTER 라 최소형으로)
  d.exec(`CREATE TABLE settlement_rate_override (scope_type TEXT, scope_key TEXT, tuition_krw INTEGER)`);
  return d;
};
/* 가짜 D1 — prepare()/bind() 두 층 모두 first·all·run, batch 는 진짜 트랜잭션(하나 실패하면 전부 되돌림). */
const mkEnv = (d) => ({ DB: {
  prepare(sql) {
    const mk = (args) => ({
      _sync: () => d.prepare(sql).run(...args),
      first: async () => d.prepare(sql).get(...args) || null,
      all: async () => ({ results: d.prepare(sql).all(...args) }),
      run: async () => { const x = d.prepare(sql).run(...args); return { meta: { last_row_id: Number(x.lastInsertRowid), changes: x.changes } }; },
    });
    const st = mk([]); st.bind = (...a) => mk(a); return st;
  },
  async batch(list) { d.exec('BEGIN'); try { const r = list.map(x => x._sync()); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } },
  async exec(sql) { d.exec(sql); },
} });
const T0 = 1700000000000;
const addCenter = (d, id, name, extra = {}) => d.prepare(`INSERT INTO centers (id, franchise_id, name, country, address, manager, active, created_at, updated_at, payment_type, phone)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, extra.fid ?? null, name, extra.country ?? null, extra.address ?? null, extra.manager ?? null,
  extra.active ?? 1, T0, T0, extra.pt ?? null, extra.phone ?? null);
const addAccount = (d, u, scopeValue, hash = 'H(orig)') => {
  d.prepare(`INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run(u, hash, u, T0, T0);
  if (scopeValue != null) d.prepare(`INSERT INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?, 'agency', ?, ?)`).run(u, scopeValue, T0);
};

// ── ① 서버 정렬 ─────────────────────────────────────────────
console.log('① 서버 정렬(ORDER BY 를 진짜 SQLite 에)');
const s0 = api.indexOf('const _txt = (col: string) =>');
const s1 = api.indexOf('const pageSql = limit === 0', s0);
ok('전제: 정렬 블록을 찾았다', s0 > 0 && s1 > s0);
let mkOrder = null;
try {
  mkOrder = new Function('url', 'canEditOrg', '_cSc',
    stripTypeScriptTypes(api.slice(s0, s1)) + '\nreturn { orderSql, sortDef, _sortKey, sortDir, sortJoin };');
} catch (e) { console.log('  ' + e.message); }
const db = mkDb();
db.exec(`INSERT INTO franchises (id, name, created_at, updated_at) VALUES (1,'부산지사',0,0),(2,'강남지사',0,0)`);
addCenter(db, 10, 'banana영어', { fid: 1, manager: '김', phone: '010-1', pt: 'B2C' });
addCenter(db, 11, 'Apple학원', { fid: 2, country: 'KR', manager: '', address: '서울', pt: 'B2B' });
addCenter(db, 12, '다솜학원', { country: '', phone: '010-3', address: '  ', active: 0 });
addCenter(db, 13, '가람영어', { fid: 1, country: 'PH', manager: '박', address: '부산', pt: '' });
db.exec(`INSERT INTO settlement_rate_override VALUES ('agency','banana영어',40000),('agency','가람영어',30000)`);
addAccount(db, 'zeta', '가람영어'); addAccount(db, 'alpha', '다솜학원');
db.prepare(`INSERT INTO admin_scope (username, scope_type, scope_value) VALUES ('gone','agency','banana영어')`).run();   // 계정이 지워진 범위 행
const orderSqlOf = (o) => `SELECT c.id FROM centers c LEFT JOIN franchises f ON f.id = c.franchise_id${o.sortJoin || ''} ORDER BY ${o.orderSql}`;
const order = (q, hq = true) => {
  if (!mkOrder) return { ids: [], o: {} };
  const o = mkOrder(new URL('https://x/api/admin/centers?' + q), () => hq, {});
  // SQL 이 깨지면(예: 모르는 열쇠가 undefined 로 새어 들어감) 하니스가 죽지 않고 그 항목이 FAIL 로 남게
  try { return { ids: db.prepare(orderSqlOf(o)).all().map(r => r.id), o }; }
  catch (e) { return { ids: ['SQL오류:' + e.message], o }; }
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
let plan = '';
try { plan = db.prepare('EXPLAIN QUERY PLAN ' + orderSqlOf(lg.o)).all().map(r => r.detail).join(' | '); } catch (e) { plan = 'ERR ' + e.message; }
ok('로그인 정렬은 줄마다 도는 상관 서브쿼리가 아니다(EXPLAIN 에 CORRELATED 없음)', !!plan && !/CORRELATED/.test(plan) && !/^ERR/.test(plan), plan);
ok('로그인 정렬 JOIN 은 그 정렬일 때만 붙는다', !order('sort=name&dir=asc').o.sortJoin && !order('').o.sortJoin);
const lgNo = order('sort=login&dir=asc', false);
ok('🔒 본사가 아니면 로그인 정렬을 받지 않는다(기본 순서·sortDef 없음)', !lgNo.o.sortDef && j(lgNo.ids) === '11,10,13,12');
const evil = order('sort=' + encodeURIComponent("id; DROP TABLE centers") + '&dir=desc');
ok('⛔ 모르는 열쇠는 SQL 에 안 들어간다(기본 순서)', !evil.o.sortDef && !/DROP/.test(evil.o.orderSql || ''));
ok('⛔ 상속 속성(constructor)도 열쇠로 안 받는다', !order('sort=constructor').o.sortDef);
ok('dir 은 desc 아니면 전부 ASC', order('sort=name&dir=evil').o.sortDir === 'ASC');
ok('응답에 «실제로 적용한» 정렬을 싣는다', /sort: sortDef \? \{ key: _sortKey, dir:/.test(api));
ok('정렬 JOIN 을 목록 쿼리에 실제로 붙인다', /LEFT JOIN franchises f ON f\.id = c\.franchise_id\$\{sortJoin\}\$\{listWhereSql\} ORDER BY \$\{orderSql\}/.test(api));

// ── ② 서버 계정 검사·쓰기 — 도우미를 오려 진짜 SQLite 로 ─────────────────
console.log('② 대리점 로그인 계정 검사·쓰기(checkAgencyLogin/applyAgencyLogin)');
const a0 = api.indexOf('type AgencyLoginCheck =');
const a1 = api.indexOf("if (method === 'PATCH') {", a0);
ok('전제: 공용 도우미를 찾았다', a0 > 0 && a1 > a0);
const helperJs = stripTypeScriptTypes(api.slice(a0, a1));
// recordLogin 도 정본(auth-admin.ts)에서 오려 와 진짜로 쓴다(감사 기록이 실제로 남는지 본다)
const braceBlock = (src, from) => {   // from 위치부터 첫 '{' 의 짝 '}' 까지
  const o = src.indexOf('{', from); let dep = 0;
  for (let i = o; i < src.length; i++) { if (src[i] === '{') dep++; else if (src[i] === '}' && --dep === 0) return src.slice(from, i + 1); }
  return '';
};
const rl0 = authSrc.indexOf('export async function recordLogin(');
const recordLoginJs = rl0 > 0 ? stripTypeScriptTypes(braceBlock(authSrc, rl0).replace(/^export /, '')) : '';
ok('전제: 정본 recordLogin 을 오려 냈다', /INSERT INTO admin_login_history/.test(recordLoginJs));
const RESERVED = new Set(['admin', 'jeong']);
const fakeHash = async p => 'H(' + p + ')';
const mkHelpers = (d, actor) => new Function('env', 'FULL_ACCESS_ACCOUNTS', 'hashPassword', 'getAdminActor', 'request',
  recordLoginJs + '\n' + helperJs + '\nreturn { checkAgencyLogin, applyAgencyLogin, agencyLoginActor };')(
  mkEnv(d), RESERVED, fakeHash, async () => actor, { headers: { get: () => '1.2.3.4' } });
let H = null;
try { H = mkHelpers(db, { ok: true, username: 'boss', isTeacher: false }); } catch (e) { console.log('  ' + e.message); }
const chk = async (...a) => { try { return await H.checkAgencyLogin(...a); } catch (e) { return { ok: false, error: 'THREW ' + e.message }; } };
const AUD = { by: 'boss', ip: '1.2.3.4', ua: 'ua' };
if (H) {
  ok('새 아이디 → 만들기', (await chk('ysyt00', 'secret1', 'banana영어', 10, 'banana영어')).mode === 'create');
  ok('아이디 형식', (await chk('a b', 'secret1', 'banana영어', 10, 'banana영어')).error === 'bad_username');
  ok('비밀번호 6자', (await chk('ysyt00', '12345', 'banana영어', 10, 'banana영어')).error === 'too_short');
  ok('전체권한 계정 이름 금지', (await chk('Admin', 'secret1', 'banana영어', 10, 'banana영어')).error === 'reserved_username');
  ok('남의 대리점 아이디 → 거절', (await chk('zeta', 'secret1', 'banana영어', 10, 'banana영어')).error === 'already_exists');
  const rs = await chk('ZETA', 'secret1', '가람영어', 13, '가람영어');
  ok('이 대리점 아이디(대소문자 무시) → 비밀번호 바꾸기', rs.mode === 'reset' && rs.username === 'zeta', JSON.stringify(rs));
  ok('등록(selfId=0)에서는 같은 아이디라도 바꾸기 없이 거절', (await chk('zeta', 'secret1', '가람영어', 0, '')).error === 'already_exists');
  addAccount(db, 'emp_scope', '');   // 범위 이름이 빈 대리점 계정 — «빈 이름 == 빈 이름» 으로 주인이 되면 안 된다
  ok('등록에서 빈 범위 이름 계정을 «내 것» 으로 오인하지 않는다', (await chk('emp_scope', 'secret1', 'X학원', 0, '')).error === 'already_exists');
  ok('이름을 바꾸는 중이어도 «저장 전» 이름의 계정은 이 대리점 것', (await chk('zeta', 'secret1', '가람영어2', 13, '가람영어')).mode === 'reset');
  ok('🔴 «바꾸려는 새 이름» 으로는 주인이 안 된다(남의 계정 비밀번호 가로채기 차단)',
    (await chk('zeta', 'secret1', '가람영어', 10, 'banana영어')).error === 'already_exists');
  addCenter(db, 14, '가람영어');
  ok('같은 이름 대리점이 여럿이면 비밀번호 바꾸기도 거절', (await chk('zeta', 'secret1', '가람영어', 13, '가람영어')).error === 'shared_center_name');
  db.exec(`DELETE FROM centers WHERE id = 14`);
  addCenter(db, 14, 'banana영어');
  ok('같은 이름 대리점이 또 있으면 만들기 거절', (await chk('newid', 'secret1', 'banana영어', 10, 'banana영어')).error === 'duplicate_center_name');
  ok('자기 자신만 그 이름이면 통과', (await chk('newid', 'secret1', '가람영어', 13, '가람영어')).mode === 'create');
  ok('등록(selfId=0)은 같은 이름이 하나라도 있으면 거절', (await chk('newid', 'secret1', '가람영어', 0, '')).error === 'duplicate_center_name');
  db.exec(`DELETE FROM centers WHERE id = 14`);
  const r1 = await H.applyAgencyLogin(await chk('ysyt00', 'secret1', 'banana영어', 10, 'banana영어'), 'secret1', 'banana영어', AUD);
  const acc = db.prepare(`SELECT * FROM admin_account WHERE username='ysyt00'`).get();
  const sc = db.prepare(`SELECT * FROM admin_scope WHERE username='ysyt00'`).get();
  ok('만들기: 계정 + agency 범위(이름 그대로)', r1 === 'created' && acc && acc.password_hash === 'H(secret1)' && sc && sc.scope_type === 'agency' && sc.scope_value === 'banana영어');
  // 만들기는 한 묶음 — 두 번째 줄(범위)이 실패하면 계정도 남지 않는다
  db.exec(`ALTER TABLE admin_scope RENAME TO admin_scope_x`);
  let threw = false; try { await H.applyAgencyLogin({ ok: true, mode: 'create', username: 'atom1' }, 'secret1', 'X', AUD); } catch { threw = true; }
  db.exec(`ALTER TABLE admin_scope_x RENAME TO admin_scope`);
  ok('만들기는 한 묶음(범위가 실패하면 계정도 안 남는다)', threw && !db.prepare(`SELECT 1 FROM admin_account WHERE username='atom1'`).get());
  db.prepare(`INSERT INTO admin_sessions (token, username, created_at, expires_at, last_seen_at) VALUES ('tk1','zeta',0,9e15,0)`).run();
  const nAcc = db.prepare(`SELECT COUNT(*) n FROM admin_account`).get().n;
  const r2 = await H.applyAgencyLogin(await chk('zeta', 'newpass9', '가람영어', 13, '가람영어'), 'newpass9', '가람영어', AUD);
  ok('바꾸기: 비밀번호만 바뀌고 계정은 안 늘어난다',
    r2 === 'reset' && db.prepare(`SELECT password_hash h FROM admin_account WHERE username='zeta'`).get().h === 'H(newpass9)'
    && db.prepare(`SELECT COUNT(*) n FROM admin_account`).get().n === nAcc);
  ok('바꾸기: 그 계정의 기존 로그인을 전부 끊는다', !db.prepare(`SELECT 1 FROM admin_sessions WHERE username='zeta'`).get());
  const hist = db.prepare(`SELECT reason, success FROM admin_login_history WHERE username='zeta' ORDER BY id DESC`).get();
  ok('바꾸기: «누가 바꿨는지» 를 로그인 이력에 남긴다', !!hist && hist.reason === 'password_reset_by:boss' && hist.success === 1, JSON.stringify(hist));
  const T = mkHelpers(db, { ok: true, username: 't1', isTeacher: true });
  ok('강사 세션이면 계정 작업 주체로 인정하지 않는다', (await T.agencyLoginActor()).ok === false && (await H.agencyLoginActor()).ok === true);
}

// ── ③ PATCH·POST 를 «실제로» 돌린다 — 검사에 걸리면 저장이 0건인가(반쪽 저장·가로채기) ─────────
console.log('③ PATCH·POST 실행(진짜 SQLite)');
const pStart = api.indexOf("if (method === 'PATCH') {", a0);
const patchBlock = braceBlock(api, pStart);
ok('전제: PATCH 블록을 중괄호 짝으로 오려 냈다', /login_account_note: linkedAccount/.test(patchBlock) && /applyAgencyLogin\(/.test(patchBlock));
const q0 = api.indexOf("const b = await parseJsonBody(request);\n      if (!b || !b.name) return invalidBody(['name']);", pStart);
const q1e = 'return json({ ok: true, id: r.meta.last_row_id, login_created: loginCreated });';
const q1 = api.indexOf(q1e, q0);
const postBlock = q0 > 0 && q1 > q0 ? api.slice(q0, q1 + q1e.length) : '';
ok('전제: POST 블록을 오려 냈다', /checkAgencyLogin\(/.test(postBlock) && /INSERT INTO centers/.test(postBlock));
// ⚠️ 블록 그대로는 «함수 밖 return» 이라 타입 제거가 실패한다 — 함수로 감싼 «뒤» 에 벗긴다.
//    (처음엔 감싸지 않아 handlerJs 가 빈 문자열이 되고 아래 실행 검사 전체가 «조용히» 건너뛰어졌다 — 아래 전제 검사가 그것을 막는다)
let handlerJs = '';
try {
  handlerJs = stripTypeScriptTypes('(async () => {\n' + api.slice(a0, a1) + '\n' + patchBlock + '\n' + postBlock
    + '\nreturn { status: 0, data: null };\n})');
} catch (e) { console.log('  ' + e.message); }
ok('전제: PATCH·POST 핸들러 코드를 실행 가능한 함수로 만들었다', !!handlerJs);
const runRoute = async (d, method, body, actor = { ok: true, username: 'boss', isTeacher: false }) => {
  try {
    const f = new Function('env', 'FULL_ACCESS_ACCOUNTS', 'hashPassword', 'getAdminActor', 'request', 'method',
      'parseJsonBody', 'invalidBody', 'json', '_normPayType', 'ensureCenterOverrideTables',
      recordLoginJs + '\nreturn (' + handlerJs + ')();');
    return await f(mkEnv(d), RESERVED, fakeHash, async () => actor, { body, headers: { get: () => '' } }, method,
      async (req) => req.body,
      (fields) => ({ status: 400, data: { ok: false, error: 'invalid_body', fields } }),
      (data, status = 200) => ({ status, data }),
      (v) => { const x = String(v || '').trim().toUpperCase(); return x === 'B2B' || x === 'B2C' ? x : null; },
      async (env) => { for (const q of DDL.overrides) await env.DB.exec(q); });
  } catch (e) { return { status: 'THREW', data: { error: e.message } }; }
};
const fx = () => {
  const d = mkDb();
  addCenter(d, 20, 'A학원'); addCenter(d, 21, 'B학원'); addCenter(d, 22, 'C학원');
  addCenter(d, 23, '같은이름'); addCenter(d, 24, '같은이름');
  addAccount(d, 'b_acc', 'B학원'); addAccount(d, 'c_acc', 'C학원'); addAccount(d, 'dup_acc', '같은이름');
  d.prepare(`INSERT INTO admin_sessions (token, username, created_at, expires_at, last_seen_at) VALUES ('s1','c_acc',0,9e15,0)`).run();
  return d;
};
const hashOf = (d, u) => (d.prepare(`SELECT password_hash h FROM admin_account WHERE username = ?`).get(u) || {}).h;
const nameOf = (d, id) => (d.prepare(`SELECT name FROM centers WHERE id = ?`).get(id) || {}).name;
let ran3 = 0;
if (handlerJs) {
  let d = fx(), r = await runRoute(d, 'PATCH', { id: 20, name: 'B학원', login_username: 'b_acc', login_password: 'hijack1' });
  ok('🔴 PATCH: A 를 B 이름으로 바꾸며 B 아이디를 넣어도 B 비밀번호는 안 바뀐다',
    r.status === 409 && r.data.error === 'already_exists' && hashOf(d, 'b_acc') === 'H(orig)' && nameOf(d, 20) === 'A학원', JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'PATCH', { id: 20, name: 'A학원2', login_username: 'a_x', login_password: '123' });
  ok('PATCH: 계정 검사에 걸리면 대리점 정보도 저장 안 한다(반쪽 저장 없음)',
    r.status === 400 && r.data.error === 'too_short' && nameOf(d, 20) === 'A학원' && !hashOf(d, 'a_x'), JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'PATCH', { id: 20, name: 'A학원', manager: '원장', login_username: 'a_new', login_password: 'secret1' });
  const sA = d.prepare(`SELECT scope_type, scope_value FROM admin_scope WHERE username='a_new'`).get();
  ok('PATCH: 새 아이디 → 계정 만들기(범위 = 대리점 이름)', r.status === 200 && r.data.login_result === 'created' && hashOf(d, 'a_new') === 'H(secret1)'
    && sA && sA.scope_type === 'agency' && sA.scope_value === 'A학원', JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'PATCH', { id: 22, name: 'C학원', login_username: 'c_acc', login_password: 'newpass1' });
  ok('PATCH: 이 대리점 아이디 → 비밀번호 바꾸기 + 기존 로그인 끊기',
    r.status === 200 && r.data.login_result === 'reset' && hashOf(d, 'c_acc') === 'H(newpass1)'
    && !d.prepare(`SELECT 1 FROM admin_sessions WHERE username='c_acc'`).get(), JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'PATCH', { id: 22, name: 'C학원 본점', login_username: 'c_acc', login_password: 'newpass1' });
  ok('PATCH: 이름을 바꾸면서도 자기 계정 비밀번호는 바꿀 수 있다(옛 이름 기준)',
    r.status === 200 && r.data.login_result === 'reset' && nameOf(d, 22) === 'C학원 본점', JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'PATCH', { id: 22, phone: '010-9', login_username: 'c_acc', login_password: '' });
  ok('PATCH: 비밀번호가 비면 계정은 그대로(다른 칸만 저장)',
    r.status === 200 && r.data.login_result === undefined && hashOf(d, 'c_acc') === 'H(orig)'
    && d.prepare(`SELECT phone FROM centers WHERE id=22`).get().phone === '010-9', JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'PATCH', { id: 23, name: '같은이름', login_username: 'dup_acc', login_password: 'newpass1' });
  ok('PATCH: 같은 이름 대리점의 공유 계정은 비밀번호를 안 바꾼다', r.status === 409 && r.data.error === 'shared_center_name' && hashOf(d, 'dup_acc') === 'H(orig)', JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'PATCH', { id: 22, login_username: 'c_acc', login_password: 'newpass1' }, { ok: true, username: 't1', isTeacher: true });
  ok('PATCH: 강사 세션이면 계정을 못 건드린다(403)', r.status === 403 && hashOf(d, 'c_acc') === 'H(orig)', JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'PATCH', { id: 22, login_username: 'c_acc', login_password: 'newpass1' });
  ok('PATCH: 계정만 바꾸는 저장도 된다(«수정할 값 없음» 아님)', r.status === 200 && r.data.login_result === 'reset', JSON.stringify(r));

  const cnt = (d2, n) => d2.prepare(`SELECT COUNT(*) n FROM centers WHERE name = ?`).get(n).n;
  d = fx(); r = await runRoute(d, 'POST', { name: 'D학원', login_username: 'd_acc', login_password: '12' });
  ok('POST: 계정 검사에 걸리면 대리점도 안 만든다', r.status === 400 && r.data.error === 'too_short' && cnt(d, 'D학원') === 0, JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'POST', { name: 'B학원', login_username: 'zz1', login_password: 'secret1' });
  ok('POST: 같은 이름 대리점이 있으면 계정과 함께 등록 거절', r.status === 409 && r.data.error === 'duplicate_center_name' && cnt(d, 'B학원') === 1, JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'POST', { name: 'E학원', login_username: 'b_acc', login_password: 'secret1' });
  ok('POST: 이미 있는 아이디는 «바꾸기» 없이 거절', r.status === 409 && r.data.error === 'already_exists' && hashOf(d, 'b_acc') === 'H(orig)' && cnt(d, 'E학원') === 0, JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'POST', { name: 'E학원', login_username: 'e_acc', login_password: 'secret1' });
  ok('POST: 등록 + 계정 만들기', r.status === 200 && r.data.login_created === true && cnt(d, 'E학원') === 1 && hashOf(d, 'e_acc') === 'H(secret1)', JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'POST', { name: 'F학원' });
  ok('POST: 계정 칸이 비면 대리점만 등록', r.status === 200 && r.data.login_created === false && cnt(d, 'F학원') === 1, JSON.stringify(r));
  d = fx(); r = await runRoute(d, 'POST', { name: 'G학원', login_username: 'g_acc' });
  ok('POST: 아이디만 있고 비밀번호가 없으면 거절', r.status === 400 && r.data.error === 'login_fields_incomplete' && cnt(d, 'G학원') === 0, JSON.stringify(r));
  ran3 = 1;
}
ok('전제: ③ 실행 검사가 실제로 돌았다(건너뛰지 않았다)', ran3 === 1);
ok('POST: 검사·계정 SQL 을 따로 복제하지 않는다', !/INSERT INTO admin_account/.test(postBlock) && !/FULL_ACCESS_ACCOUNTS/.test(postBlock));

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
