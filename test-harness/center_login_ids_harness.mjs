// 🪪 대리점 목록 «로그인 아이디» 칸 (2026-10-26 사장님 「엘리더잼영어 아이디가 뭔지 모르겠다」)
//   서버(api-admin.ts GET /api/admin/centers)가 admin_scope(scope_type='agency') 를 대리점 «이름»
//   정확일치로 이어 login_ids 를 싣고, 화면(adm-core.js _ctLoginCell)이 그린다.
//   ① 서버 SQL 을 소스에서 오려 내 진짜 SQLite 에 돌린다  ② 화면 칸 함수를 오려 내 실제로 돌린다.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n); } };
const api = readFileSync(new URL('../cloudflare-deploy/src/api-admin.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('../cloudflare-deploy/public/js/adm-core.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../cloudflare-deploy/public/admin.html', import.meta.url), 'utf8');

// ── ① 서버 블록 ─────────────────────────────────────────────
const a0 = api.indexOf('const _ctItems: any[]');
const a1 = api.indexOf('return json({ ok: true, items: _ctItems', a0);
ok('전제: 서버 블록을 찾았다', a0 > 0 && a1 > a0);
const block = api.slice(a0, a1);
ok('본사만 싣는다(canEditOrg 게이트)', /if \(!min && canEditOrg\(_cSc\)/.test(block));
ok('지워진 계정은 뺀다(admin_account JOIN)', /JOIN admin_account a ON a\.username = s\.username/.test(block));
ok('이름 정확일치(LIKE 아님)', /scope_value IN \(SELECT value FROM json_each/.test(block) && !/scope_value LIKE/.test(block));
ok('실패해도 목록은 그대로(try/catch)', /try \{[\s\S]*\} catch/.test(block));

const sqls = [...block.matchAll(/prepare\(\s*`([\s\S]*?)`/g)].map(m => m[1]);
ok('전제: SQL 두 개를 오려 냈다', sqls.length === 2);
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE centers (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE admin_scope (username TEXT PRIMARY KEY, scope_type TEXT, scope_value TEXT);
  CREATE TABLE admin_account (username TEXT PRIMARY KEY);
  INSERT INTO centers VALUES (1,'엘리더잼영어'),(2,'수원우만학원'),(3,'해법엘리트'),(4,'해법엘리트'),(5,'엘리스영어');
  INSERT INTO admin_scope VALUES ('eljam','agency','엘리더잼영어'),('eljam2','agency','엘리더잼영어'),
    ('hb','agency','해법엘리트'),('gone','agency','수원우만학원'),('br','branch','엘리더잼영어'),('near','agency','엘리스');
  INSERT INTO admin_account VALUES ('eljam'),('eljam2'),('hb'),('br'),('near');`);
const names = JSON.stringify(['엘리더잼영어','수원우만학원','해법엘리트','엘리스영어']);
let rows = [], dups = [];
try { rows = db.prepare(sqls[0]).all(names); dups = db.prepare(sqls[1]).all(names); } catch (e) { console.log('  ' + e.message); }
const by = {}; for (const r of rows) (by[r.shop] = by[r.shop] || []).push(r.username);
ok('엘리더잼영어 → 두 계정 모두', JSON.stringify(by['엘리더잼영어']) === '["eljam","eljam2"]');
ok('지사(branch) 계정은 안 붙는다', !(by['엘리더잼영어'] || []).includes('br'));
ok('지워진 계정(gone)은 안 붙는다', !by['수원우만학원']);
ok('부분일치(엘리스 ≠ 엘리스영어) 안 붙는다', !by['엘리스영어']);
ok('같은 이름 대리점을 알아챈다', dups.map(r => r.name).join() === '해법엘리트');

// ── ② 화면 칸 ─────────────────────────────────────────────
const c0 = core.indexOf('const _ctLoginCell = c =>');
const c1 = core.indexOf('\n  tb.innerHTML = d.items.map', c0);
ok('전제: 화면 칸 함수를 찾았다', c0 > 0 && c1 > c0);
let cell = null;
try { cell = new Function('adminLang', '_esc', core.slice(c0, c1) + '\nreturn _ctLoginCell;')('ko', s => String(s)); } catch (e) { console.log('  ' + e.message); }
const run = c => { try { return cell(c); } catch (e) { return 'ERR ' + e.message; } };
ok('아이디를 그린다', /eljam/.test(run({ login_ids: ['eljam'] })) && /📋/.test(run({ login_ids: ['eljam'] })));
ok('계정 없음을 말한다(빈 배열)', /계정 없음/.test(run({ login_ids: [] })));
ok('못 물어봤으면 «계정 없음» 이라 하지 않는다(짝)', !/계정 없음/.test(run({})) && /\?/.test(run({})));
ok('같은 이름 공유 경고', /같은 이름/.test(run({ login_ids: ['hb'], login_shared: true })) && !/같은 이름/.test(run({ login_ids: ['hb'] })));
ok('행에 그 칸을 실제로 넣는다', /<td style="white-space:nowrap">\$\{_ctLoginCell\(c\)\}<\/td>/.test(core.slice(c1, c1 + 400)));

// ── ③ 칸 수가 서로 같은가 ───────────────────────────────
const thead = (html.match(/<table data-gc="🏪 대리점 목록"[\s\S]*?<\/thead>/) || [''])[0];
const thN = (thead.match(/<th[\s>]/g) || []).length;
const rowTpl = core.slice(c1, core.indexOf("join('')", c1));
const tdN = (rowTpl.match(/<td[\s>]/g) || []).length;
const spans = [...core.slice(core.indexOf('async function loadCenters'), c1).matchAll(/colspan="(\d+)"/g)].map(m => +m[1])
  .concat([...html.matchAll(/<tbody id="centers-table"><tr><td colspan="(\d+)"/g)].map(m => +m[1]));
ok(`th(${thN}) = td(${tdN}) = colspan(${spans.join(',')})`, thN > 0 && thN === tdN && spans.length >= 3 && spans.every(n => n === thN));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
