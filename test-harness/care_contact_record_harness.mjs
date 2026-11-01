// 📞 이탈 케어 «연락 기록» 한 곳으로 (2026-10-13 케어 보드 2단계)
//
// 정본: cloudflare-deploy/src/care-contact.ts — recordCareContact(쓰기) · lastContacts(읽기)
// 진짜 SQLite(가짜 D1 껍데기)에 물려 «실제로» 돌리고, 다섯 군데 배선과 화면 줄을 오려 내 확인한다.
//
// 짝으로 보는 것:
//   ① 연락하면 사례(forecast_care)·student_retention 에 함께 적힌다  ↔  «처리 완료» 는 되돌리지 않는다
//   ② 다섯 원천 중 가장 최근 것을 고른다                           ↔  실패·테스트모드·포인트·이벤트는 «연락» 이 아니다
//   ③ 기록이 실패해도 던지지 않는다(연락 응답을 500 으로 바꾸면 중복 연락)
//   ④ 화면: 서버가 칸을 안 줬으면 아무것도 안 그린다          ↔  있으면 «마지막 연락 · 경로» 를 그린다
//
// 실행: node test-harness/care_contact_record_harness.mjs
//       CARE_SRC_DIR=<다른 src 폴더> 로 변이 사본을 가리킬 수 있다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)'); process.exit(0); }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.CARE_SRC_DIR || resolve(ROOT, 'cloudflare-deploy/src');
const PUB = process.env.CARE_PUB_DIR || resolve(ROOT, 'cloudflare-deploy/public');
const rd = (p) => readFileSync(p, 'utf8');
let PASS = 0, FAIL = 0;
const ok = (c, m, extra) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ FAIL ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };

// 주석 벗기기 — 글자를 훑으며 «문자열 안인가» 를 함께 추적(정규식 한 줄로 지우면 https:// 가 잘린다)
function strip(t) {
  let o = '', q = null;
  for (let i = 0; i < t.length; i++) {
    const c = t[i], n = t[i + 1];
    if (q) { o += c; if (c === '\\') { o += n; i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { const e = t.indexOf('\n', i); i = e < 0 ? t.length : e - 1; continue; }
    if (c === '/' && n === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 1; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    o += c;
  }
  return o;
}
// 중괄호 짝으로 «그 블록» 만 자르기(길이로 자르지 않는다)
function blockAt(src, anchor) {
  const at = src.indexOf(anchor);
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(at, i + 1);
}

/* ── 정본 불러오기 — forecast-dashboard 를 먼저, care-contact 의 import 를 그 사본으로 바꿔 끼운다 ── */
const toUrl = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const FD_URL = toUrl(stripTypeScriptTypes(rd(resolve(SRC, 'forecast-dashboard.ts'))));
const ccSrc = rd(resolve(SRC, 'care-contact.ts'));
ok(ccSrc.includes(`from './forecast-dashboard'`), '전제: care-contact.ts 가 caseKey 를 forecast-dashboard 에서 가져온다(정본 한 곳)');
const CC = await import(toUrl(stripTypeScriptTypes(ccSrc).replace(`'./forecast-dashboard'`, JSON.stringify(FD_URL))));
const FD = await import(FD_URL);

/* ── 가짜 D1 ──────────────────────────────────────────────────────────── */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  const wrap = (sql) => {
    const st = db.prepare(sql);
    const api = (args) => ({
      first: async () => st.get(...args) ?? null,
      all: async () => ({ results: st.all(...args) }),
      run: async () => { const r = st.run(...args); return { meta: { changes: r.changes } }; },
    });
    return { bind: (...a) => api(a), ...api([]) };
  };
  return { raw: db, prepare: wrap, exec: async (s) => db.exec(s) };
}
const NOW = Date.UTC(2026, 9, 13, 3, 0, 0);
function seed(d, opts = {}) {
  d.raw.exec(`CREATE TABLE student_retention (user_id TEXT PRIMARY KEY, category TEXT, end_date TEXT, last_class TEXT,
      days_inactive INTEGER, contacted INTEGER DEFAULT 0, contacted_at INTEGER, updated_at INTEGER NOT NULL);
    CREATE TABLE forecast_care (user_id TEXT NOT NULL, case_key TEXT NOT NULL, status TEXT NOT NULL, owner TEXT NOT NULL,
      updated_at INTEGER NOT NULL, contacted_at INTEGER, PRIMARY KEY(user_id, case_key));
    CREATE TABLE retention_care_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action_type TEXT, message TEXT,
      gift_type TEXT, event_id TEXT, status TEXT, error TEXT, created_at INTEGER);
    CREATE TABLE retention_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, status TEXT, sent_at INTEGER NOT NULL);`);
  if (!opts.noCounsel) d.raw.exec(`CREATE TABLE counseling_sms_log (request_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, fingerprint TEXT, actor TEXT, status TEXT NOT NULL, message_id TEXT, created_at INTEGER NOT NULL);`);
  const ins = d.raw.prepare(`INSERT INTO student_retention (user_id,category,end_date,last_class,days_inactive,updated_at) VALUES (?,?,?,?,?,?)`);
  ins.run('exp', 'expiring', '2026-10-20', null, 0, NOW);
  ins.run('ina', 'inactive', '2026-12-01', '2026-09-01', 42, NOW);
  ins.run('dn', 'expired', '2026-10-01', null, 0, NOW);
}
const care = (d, u) => d.raw.prepare(`SELECT * FROM forecast_care WHERE user_id=?`).all(u);
const ret = (d, u) => d.raw.prepare(`SELECT contacted, contacted_at FROM student_retention WHERE user_id=?`).get(u);

console.log('\n① recordCareContact — 연락을 «한 곳» 에도 적는다');
{
  const d = makeDb(); seed(d); const env = { DB: d };
  const r1 = await CC.recordCareContact(env, 'exp', 'mgr_karl', NOW);
  const c1 = care(d, 'exp');
  ok(r1 === true && c1.length === 1, '이탈 스냅샷에 있는 학생 → 사례가 하나 생긴다', c1);
  ok(c1[0] && c1[0].case_key === FD.caseKey({ category: 'expiring', end_date: '2026-10-20' }), '사례 키는 B 화면과 같은 정본 caseKey', c1[0] && c1[0].case_key);
  ok(c1[0] && c1[0].status === 'in_progress' && c1[0].owner === 'mgr_karl' && c1[0].contacted_at === NOW, '«상담 중» · 담당 · 연락 시각', c1[0]);
  ok(ret(d, 'exp').contacted === 1 && ret(d, 'exp').contacted_at === NOW, 'E 화면의 «연락함» 도 함께 켜진다', ret(d, 'exp'));

  // 이미 «처리 완료» 인 사례 — 되돌리지 않는다(연락은 «다시 열기» 가 아니다)
  const kDn = FD.caseKey({ category: 'expired', end_date: '2026-10-01' });
  d.raw.prepare(`INSERT INTO forecast_care VALUES (?,?,?,?,?,?)`).run('dn', kDn, 'done', 'hq_mgr', NOW - 9e5, NOW - 9e5);
  await CC.recordCareContact(env, 'dn', 'mgr_karl', NOW);
  const c2 = care(d, 'dn');
  ok(c2.length === 1 && c2[0].status === 'done' && c2[0].contacted_at === NOW, '«처리 완료» 는 그대로, 연락 시각만 갱신', c2);

  // 미확인 → 상담 중
  const kIn = FD.caseKey({ category: 'inactive', end_date: '2026-12-01', last_class: '2026-09-01' });
  d.raw.prepare(`INSERT INTO forecast_care VALUES (?,?,?,?,?,?)`).run('ina', kIn, 'unreviewed', 'x', NOW - 9e5, null);
  await CC.recordCareContact(env, 'ina', 'mgr_karl', NOW);
  ok(care(d, 'ina')[0].status === 'in_progress', '«미확인» → «상담 중» 으로 올린다', care(d, 'ina'));

  // 스냅샷에 없는 학생(A 화면에만 있는 학생) — 사례가 없으니 안 적는다(②가 care_log 에서 읽는다)
  const r4 = await CC.recordCareContact(env, 'nobody', 'mgr_karl', NOW);
  ok(r4 === false && care(d, 'nobody').length === 0, '스냅샷에 없는 학생은 사례를 지어내지 않는다');

  // 던지지 않는다
  let threw = false, r5;
  try { r5 = await CC.recordCareContact({ DB: { prepare() { throw new Error('D1 down'); } } }, 'exp', 'x', NOW); } catch { threw = true; }
  ok(!threw && r5 === false, 'DB 가 던져도 던지지 않고 false (연락 응답을 500 으로 바꾸지 않음)');
  ok(await CC.recordCareContact(env, '', 'x', NOW) === false, '빈 아이디는 아무것도 안 한다');
}

console.log('\n② lastContacts — 다섯 원천 중 가장 최근 «실제» 연락');
{
  const d = makeDb(); seed(d); const D = d.raw;
  const log = D.prepare(`INSERT INTO retention_care_log (user_id,action_type,status,created_at) VALUES (?,?,?,?)`);
  // a: care_log 문자(가장 최근) > E 자동 문자 > B 사례
  D.prepare(`INSERT INTO forecast_care VALUES ('a','k','in_progress','x',1,100)`).run();
  D.prepare(`INSERT INTO retention_messages (user_id,status,sent_at) VALUES ('a','sent',200)`).run();
  log.run('a', 'sms', 'sent', 300);
  // b: 최근 것은 전부 «연락 아님» — mock·failed·gift·event·class_notice / 진짜는 전화 50
  log.run('b', 'call', 'logged', 50);
  log.run('b', 'sms', 'mock', 900); log.run('b', 'sms', 'failed', 901); log.run('b', 'gift', 'sent', 902);
  log.run('b', 'event', 'queued', 903); log.run('b', 'class_notice', 'sent', 904); log.run('b', 'comeback_bundle', 'sent', 905);
  D.prepare(`INSERT INTO retention_messages (user_id,status,sent_at) VALUES ('b','failed',999)`).run();
  // c: 상담 문자 — accepted 만
  D.prepare(`INSERT INTO counseling_sms_log VALUES ('r1','c','f','x','accepted',null,400)`).run();
  D.prepare(`INSERT INTO counseling_sms_log VALUES ('r2','c','f','x','failed_or_unknown',null,800)`).run();
  // e: student_retention 의 연락함(켜짐) / f: 꺼진 토글은 연락이 아니다
  D.prepare(`UPDATE student_retention SET contacted=1, contacted_at=700 WHERE user_id='exp'`).run();
  D.prepare(`UPDATE student_retention SET contacted=0, contacted_at=750 WHERE user_id='ina'`).run();
  const R = await CC.lastContacts(d, ['a', 'b', 'c', 'exp', 'ina', 'zz', 'a']);
  const m = R.map;
  ok(R.failed === 0, '모두 읽었으면 failed=0', R.failed);
  ok(m.get('a') && m.get('a').at === 300 && m.get('a').via === 'sms', '세 원천 중 가장 최근(A 카드 문자)을 고른다', m.get('a'));
  ok(m.get('b') && m.get('b').at === 50 && m.get('b').via === 'call', '테스트모드·실패·포인트·이벤트·수업안내는 «연락» 이 아니다', m.get('b'));
  ok(m.get('c') && m.get('c').at === 400 && m.get('c').via === 'counsel_sms', '상담 문자는 «접수됨» 만', m.get('c'));
  ok(m.get('exp') && m.get('exp').at === 700 && m.get('exp').via === 'retention', 'E «연락함» 도 읽는다', m.get('exp'));
  ok(!m.has('ina'), '꺼진 «연락함» 은 연락이 아니다');
  ok(!m.has('zz'), '아무 기록 없는 학생은 없음(지어내지 않는다)');

  // 남의 학생을 끌어오지 않는다 — 목록에 없는 아이디의 기록은 안 나온다
  log.run('other', 'sms', 'sent', 5000);
  const m2 = (await CC.lastContacts(d, ['a'])).map;
  ok(m2.size === 1 && !m2.has('other'), '부른 학생만 — 남의 기록은 안 섞인다', [...m2.keys()]);
}
{
  // 표 하나가 없어도(상담 문자 표 미생성) 나머지로 계속
  const d = makeDb(); seed(d, { noCounsel: true });
  d.raw.prepare(`INSERT INTO retention_care_log (user_id,action_type,status,created_at) VALUES ('a','kakao','sent',10)`).run();
  let threw = false, m;
  try { m = await CC.lastContacts(d, ['a']); } catch { threw = true; }
  ok(!threw && m.map.get('a') && m.map.get('a').via === 'kakao' && m.failed === 0, '표가 «아직 없는» 것은 실패가 아니다 — 나머지 원천으로', m && [m.map.get('a'), m.failed]);
  ok((await CC.lastContacts(d, [])).map.size === 0, '빈 목록 → 빈 결과');
}
{
  // 진짜 읽기 실패는 «없음» 이 아니다 — failed 로 알린다
  const bad = { prepare() { return { bind() { return { all: async () => { throw new Error('D1 overloaded'); } }; } }; } };
  let threw = false, R;
  try { R = await CC.lastContacts(bad, ['a']); } catch { threw = true; }
  ok(!threw && R.failed === 5 && R.map.size === 0, '전부 실패하면 던지지 않고 failed=5 (화면이 «연락 없음» 이라 말하지 않게)', R && R.failed);
}
{
  // ⚖️ 같은 시각이면 원래 기록(A 카드 문자)이 메아리(forecast_care)를 이긴다
  const d = makeDb(); seed(d); const D = d.raw;
  D.prepare(`INSERT INTO retention_care_log (user_id,action_type,status,created_at) VALUES ('t','sms','sent',500)`).run();
  D.prepare(`INSERT INTO forecast_care VALUES ('t','k','in_progress','mgr_karl',500,500)`).run();
  ok((await CC.lastContacts(d, ['t'])).map.get('t').via === 'sms', '비기면 원래 기록(A 문자)이 이긴다 — «경로» 가 메아리로 바뀌지 않는다');
  // E 토글의 메아리(owner=retention_page)는 경로 retention
  D.prepare(`INSERT INTO forecast_care VALUES ('u','k','in_progress','retention_page',600,600)`).run();
  ok((await CC.lastContacts(d, ['u'])).map.get('u').via === 'retention', 'E «연락함» 토글이 남긴 사례는 경로가 «수강권 만료»');
  D.prepare(`INSERT INTO forecast_care VALUES ('v','k','in_progress','hq_mgr',600,600)`).run();
  ok((await CC.lastContacts(d, ['v'])).map.get('v').via === 'care', 'B 버튼이 남긴 사례는 경로가 «케어»');
}
{
  // 자동 발송(cron)은 연락 시각만 — 상태·담당은 그대로
  const d = makeDb(); seed(d); const env = { DB: d };
  await CC.recordCareContact(env, 'exp', 'auto-cron', NOW, { auto: true });
  const c = care(d, 'exp')[0];
  ok(c && c.status === 'unreviewed' && c.contacted_at === NOW, '자동 발송: 새 사례는 «미확인» 그대로 + 연락 시각', c);
  const k = FD.caseKey({ category: 'inactive', end_date: '2026-12-01', last_class: '2026-09-01' });
  d.raw.prepare(`INSERT INTO forecast_care VALUES (?,?,?,?,?,?)`).run('ina', k, 'in_progress', 'mgr_karl', 1, null);
  await CC.recordCareContact(env, 'ina', 'auto-cron', NOW, { auto: true });
  const c2 = care(d, 'ina')[0];
  ok(c2.status === 'in_progress' && c2.owner === 'mgr_karl' && c2.contacted_at === NOW, '자동 발송(짝): 사람이 맡은 사례의 담당을 auto-cron 으로 안 바꾼다', c2);
  const kd = FD.caseKey({ category: 'expired', end_date: '2026-10-01' });
  d.raw.prepare(`INSERT INTO forecast_care VALUES (?,?,?,?,?,?)`).run('dn', kd, 'done', 'hq_mgr', 1, null);
  await CC.recordCareContact(env, 'dn', 'mgr_karl', NOW);
  ok(care(d, 'dn')[0].owner === 'hq_mgr', '«처리 완료» 사례는 완료한 담당도 그대로');
}

console.log('\n③ 배선 — 다섯 곳이 정본을 쓰는가 (주석 벗긴 사본)');
const adm = strip(rd(resolve(SRC, 'api-admin.ts')));
const careBlk = blockAt(adm, "if (method === 'POST' && path === '/api/admin/retention/care')");
ok(careBlk.length > 2000, '전제: A 화면 케어 핸들러를 오려 냈다', careBlk.length);
{
  const gm = careBlk.match(/if \(\((CARE_CONTACT_ACTIONS[^\n]*?)\) \{[\s\S]{0,400}?careRecorded = await recordCareContact\(/);
  ok(!!gm, 'A 화면: 연락이면 recordCareContact 를 부른다');
  if (gm) {
    let f = null;
    try { f = new Function('CARE_CONTACT_ACTIONS', 'CARE_CONTACT_STATUSES', 'actionType', 'status', 'return ((' + gm[1].replace(/ as readonly string\[\]/g, '') + ');'); } catch (e) { ok(false, '게이트 식을 평가할 수 있다', e.message); }
    if (f) {
      const A = CC.CARE_CONTACT_ACTIONS, S = CC.CARE_CONTACT_STATUSES;
      const g = (a, s) => { try { return f(A, S, a, s); } catch { return 'ERR'; } };
      ok(g('sms', 'sent') === true && g('kakao', 'sent') === true && g('call', 'logged') === true, '게이트: 문자·카톡·전화는 적는다');
      ok(g('sms', 'mock') === false && g('sms', 'failed') === false && g('gift', 'sent') === false && g('event', 'queued') === false && g('comeback_bundle', 'sent') === false,
        '게이트(짝): 테스트모드·실패·포인트·이벤트는 안 적는다');
    }
  }
  ok(/return json\(\{ ok: true, status, detail, care_recorded: careRecorded \}\)/.test(careBlk), 'A 화면: 응답에 기록 여부를 싣는다');
  // 🔒 작성자 게이트 — 강사·조직 계정·«모름» 은 forecast_care 에 안 적는다
  const wm = careBlk.match(/const careWriterOk = \(a: any\) => ([^;]+);/);
  ok(!!wm && /if \(careWriterOk\(_a\)\) careRecorded = await recordCareContact\(env as any, uid, _a\.username/.test(careBlk), 'A 화면: 작성자 게이트를 지나야 적고, 작성자 이름으로 적는다');
  if (wm) {
    let w = null;
    try { w = new Function('isOrgScopedRole', 'return (a) => ' + wm[1].replace(/ as any/g, '') + ';'); } catch (e) { ok(false, '작성자 게이트를 평가할 수 있다', e.message); }
    if (w) {
      const AUTH = rd(resolve(SRC, 'auth-admin.ts'));
      const orgFn = blockAt(AUTH, 'export function isOrgScopedRole(');
      const org = new Function(stripTypeScriptTypes(orgFn).replace('export ', '') + '; return isOrgScopedRole;')();
      const g = w(org);
      ok(g({ ok: true, username: 'mgr_karl', role: 'hq', isTeacher: false }) === true, '작성자 게이트: 본사 계정은 적는다');
      ok(g({ ok: true, username: 'hq_t_kang', role: 'teacher', isTeacher: true }) === false, '작성자 게이트(짝): 강사는 안 적는다');
      ok(g({ ok: true, username: 'branch_busan', role: 'branch', isTeacher: false }) === false && g({ ok: true, username: 'agency_x', role: 'agency', isTeacher: false }) === false,
        '작성자 게이트(짝): 지사·대리점은 안 적는다');
      ok(g(null) === false && g({ ok: false, username: '', role: 'none', isTeacher: false }) === false, '작성자 게이트(짝): 작성자를 모르면 안 적는다');
    }
  }
}
const riskBlk = blockAt(adm, "if (method === 'GET' && path === '/api/admin/retention/risk')");
ok(/lastContacts\(env\.DB, list\.map/.test(riskBlk) && /o\.last_contact_ok = failed === 0/.test(riskBlk), 'A 목록: lastContacts 로 «마지막 연락» 을 붙이고 실패를 알린다 «마지막 연락» 을 붙인다');
ok(/if \(_hit\) return await _rrWithContact\(_hit/.test(riskBlk) && /return await _rrWithContact\(_rrPayload/.test(riskBlk),
  'A 목록: 캐시에서 나갈 때도 새로 계산할 때도 붙인다(캐시 «안» 에 넣지 않음 — 3분 묵지 않게)');
ok(!/last_contact/.test(riskBlk.slice(riskBlk.indexOf('const _rrPayload'), riskBlk.indexOf('SESSION_STATE.put(_rrKey'))),
  'A 목록(짝): 캐시에 저장하는 본문에는 «마지막 연락» 이 없다');
{
  const fBlk = blockAt(adm, "if (path.endsWith('/revenue')) return reply(");
  const getAt = adm.indexOf("if (path.endsWith('/revenue')) return reply(");
  const fGet = adm.slice(getAt, adm.indexOf('return reply(_care);', getAt) + 20);
  ok(getAt > 0 && /lastContacts\(env\.DB, _rows\.map/.test(fGet) && /_care\.last_contact_ok = _f === 0/.test(fGet), 'B 화면: 사례 목록에 다섯 원천의 «마지막 연락» 을 덮는다');
  ok(/if \(c && !\(Number\(r\.contacted_at\) >= c\.at\)\) r\.contacted_at = c\.at/.test(fGet), 'B 화면: 더 최근일 때만 덮는다(옛 값으로 뒤로 가지 않음)');
  void fBlk;
}
const retSrc = strip(rd(resolve(SRC, 'api-retention.ts')));
const markBlk = blockAt(retSrc, 'export async function markRetentionContacted');
ok(/if \(contacted\) await recordCareContact\(/.test(markBlk), 'E «연락함» 토글: 켤 때만 기록한다(끄기는 다른 화면을 안 지운다)');
const sendBlk = blockAt(retSrc, "if (status === 'sent') {");
ok(/recordCareContact\(env, uid, opts\.by \|\| 'admin', now, \{ auto: opts\.by === 'auto-cron' \}\)/.test(sendBlk), 'E 문자: «보냄» 일 때만 기록하고, 자동 발송이면 auto 로');
const cs = strip(rd(resolve(SRC, 'counseling-send.ts')));
ok(/if \(accepted\) await recordCareContact\(env, uid, actor, now\)/.test(cs), 'B 상담 문자: «접수됨» 일 때만, 보낸 사람으로 기록');
{
  const fd = strip(rd(resolve(SRC, 'forecast-dashboard.ts')));
  const sc = blockAt(fd, 'export async function saveCare(');
  ok(sc.length > 200 && /INSERT INTO forecast_care/.test(sc) && !/recordCareContact/.test(sc), 'B «연락 기록» 버튼(saveCare)은 원래부터 forecast_care 에 쓴다 — 두 번 적지 않는다');
}

console.log('\n④ 화면 — A 카드의 «마지막 연락» 줄');
{
  const q1 = rd(resolve(PUB, 'js/adm-q1.js'));
  const fn = blockAt(q1, 'function arrLastContactLine(');
  ok(fn.length > 200 && /\$\{arrLastContactLine\(r, d, isEn\)\}/.test(q1), '전제: 줄 함수를 오려 냈고 카드가 그것을 부른다');
  let line = null;
  try {
    line = new Function('esc', fn + '; return arrLastContactLine;')(s => String(s == null ? '' : s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'));
  } catch (e) { ok(false, '줄 함수를 실행할 수 있다', e.message); }
  if (line) {
    const call = (...a) => { try { return line(...a); } catch (e) { return 'ERR:' + e.message; } };
    ok(call({ last_contact: { at: Date.now(), via: 'sms' } }, {}, false) === '', '서버가 그 칸을 안 줬으면(옛 서버·조회 실패) 아무것도 안 그린다');
    ok(/아직 연락 기록 없음/.test(call({ last_contact: null }, { last_contact_ok: true }, false)), '기록이 없으면 «아직 연락 기록 없음»');
    const h = call({ last_contact: { at: Date.now() - 3 * 86400000, via: 'call' } }, { last_contact_ok: true }, false);
    ok(/마지막 연락/.test(h) && /3일 전/.test(h) && /전화/.test(h), '있으면 «마지막 연락 · 3일 전 · 전화»', h);
    const he = call({ last_contact: { at: Date.now(), via: 'counsel_sms' } }, { last_contact_ok: true }, true);
    ok(/Last contact: today/.test(he) && /Counseling SMS/.test(he), '영어 화면: Last contact · today · Counseling SMS', he);
    ok(!/<script/i.test(call({ last_contact: { at: Date.now(), via: '<script>x' } }, { last_contact_ok: true }, false)), '모르는 경로 글자는 이스케이프된다');
  }
  const html = rd(resolve(PUB, 'admin.html'));
  ok(/\/js\/adm-q1\.js\?v=9\b/.test(html), 'admin.html 이 adm-q1.js 를 새 버전(?v=9)으로 부른다');
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
