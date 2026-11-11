import { adminSrcFromFile as readAdminSourceFromFile } from './_srcbundle.mjs';
// 📥 대리점 아이디 일괄 입력 (2026-11-02) — js/adm-center-bulk-login.js 를 가짜 화면에서 «실제로» 돌린다.
//    + 대리점 목록 검색 대상(qf=name) 서버 조건을 소스에서 오려 진짜 SQLite 에 돌린다.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(process.env.CTB_SRC || path.join(ROOT, 'cloudflare-deploy/public/js/adm-center-bulk-login.js'), 'utf8');
const API = readAdminSourceFromFile(path.join(ROOT, 'cloudflare-deploy/src/api-admin.ts'));
const HTML = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/admin.html'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/js/adm-core.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('❌ FAIL ' + name + (extra ? ' — ' + extra : '')); } };

// ── ① 모듈을 가짜 화면에서 실행 ──
const sandbox = { window: {}, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} }, adminLang: 'ko', console };
sandbox.window.adminLang = 'ko';
let api;
try {
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { timeout: 2000 });
  api = sandbox.window.__ctBulkLogin;
} catch (e) { console.log('❌ FAIL 모듈 실행 — ' + e.message); fail++; }
ok('모듈이 __ctBulkLogin 을 내보낸다', !!(api && api.plan && api.tableToRows && api.textToTable));

if (api) {
  const centers = [
    { id: 1, name: '가나학원', login_ids: [] },
    { id: 2, name: '강서SLP', login_ids: [] },
    { id: 3, name: '강서SLP', login_ids: [] },
    { id: 4, name: '다라학원', login_ids: ['dara01'] },
    { id: 5, name: '마바학원', login_ids: [] },
    { id: 6, name: '사아학원' },              // login_ids 모름
    { id: 7, name: 'A  B 학원', login_ids: [] },
  ];
  const run = (txt, pw = '') => {
    const p = api.tableToRows(api.textToTable(txt));
    if (p.error) return { error: p.error };
    return api.plan(p.rows, centers, pw);
  };
  const st = (r, i) => r[i].status + ':' + r[i].reason;

  // 탭 붙여넣기 + 이름 매칭
  let r = run('대리점명\t아이디\t비밀번호\n가나학원\tgana01\tabc123\n');
  ok('이름 정확일치 1곳 → 만들 예정', r[0] && r[0].status === 'ready' && r[0].center.id === 1 && r[0].pw === 'abc123', JSON.stringify(r[0]));
  // 같은 이름 둘 → 건너뜀(짝: ID 를 주면 된다)
  r = run('대리점명\t아이디\n강서SLP\tgs01\n', 'pass1234');
  ok('같은 이름 대리점 여럿 → 건너뜀', st(r, 0) === 'skip:name_ambiguous', st(r, 0));
  r = run('ID\t대리점명\t아이디\n3\t강서SLP\tgs03\n', 'pass1234');
  ok('ID 를 주면 같은 이름이어도 그 대리점으로', r[0].status === 'ready' && r[0].center.id === 3, st(r, 0));
  // ID 와 이름이 다른 대리점
  r = run('ID\t대리점명\t아이디\n1\t마바학원\tx001\n', 'pass1234');
  ok('ID 와 이름이 어긋나면 건너뜀', st(r, 0) === 'skip:id_name_mismatch', st(r, 0));
  // 이미 계정 있음 → 비밀번호 바꾸지 않게 건너뜀
  r = run('ID\t아이디\n4\tnewid\n4\n', 'pass1234');
  ok('다른 계정이 이미 있음 → 건너뜀', st(r, 0) === 'skip:has_account', st(r, 0));
  r = run('ID\t아이디\n4\tDARA01\n', 'pass1234');
  ok('같은 아이디로 이미 연결 → 건너뜀(대소문자 무시)', st(r, 0) === 'skip:already_linked', st(r, 0));
  // 계정 여부 모르면 건너뜀
  r = run('ID\t아이디\n6\tsaa01\n', 'pass1234');
  ok('계정 여부 모름 → 건너뜀', st(r, 0) === 'skip:login_unknown', st(r, 0));
  // 비밀번호
  r = run('ID\t아이디\n5\tmaba01\n');
  ok('비밀번호 없음 → 건너뜀', st(r, 0) === 'skip:no_password', st(r, 0));
  r = run('ID\t아이디\n5\tmaba01\n', 'abc');
  ok('비밀번호 6자 미만 → 건너뜀', st(r, 0) === 'skip:short_password', st(r, 0));
  r = run('ID\t아이디\n5\tmaba01\n', 'common1');
  ok('공통 초기 비밀번호가 쓰인다', r[0].status === 'ready' && r[0].pw === 'common1', st(r, 0));
  r = run('ID\t아이디\t비밀번호\n5\tmaba01\town999\n', 'common1');
  ok('엑셀 비밀번호가 공통보다 먼저', r[0].pw === 'own999');
  // 아이디 형식
  r = run('ID\t아이디\n5\t한글아이디\n', 'pass1234');
  ok('아이디 형식 틀림 → 건너뜀', st(r, 0) === 'skip:bad_login', st(r, 0));
  // 엑셀 안 중복
  r = run('ID\t아이디\n1\tsame1\n5\tSAME1\n', 'pass1234');
  ok('같은 아이디 두 줄 → 둘 다 건너뜀', st(r, 0) === 'skip:login_dup_in_file' && st(r, 1) === 'skip:login_dup_in_file');
  r = run('ID\t아이디\n1\taaa01\n1\tbbb01\n', 'pass1234');
  ok('같은 대리점 두 줄 → 둘 다 건너뜀', st(r, 0) === 'skip:center_dup_in_file' && st(r, 1) === 'skip:center_dup_in_file');
  // 공백 정규화 이름
  r = run('대리점명\t아이디\nA B 학원\tab01\n', 'pass1234');
  ok('이름 공백 차이는 같은 이름', r[0].status === 'ready' && r[0].center.id === 7, st(r, 0));
  // 없는 대리점 / ID 숫자 아님
  r = run('ID\t대리점명\t아이디\n999\t\tz001\nabc\t\tz002\n\t없는학원\tz003\n', 'pass1234');
  ok('없는 ID·숫자 아닌 ID·없는 이름', st(r, 0) === 'skip:id_not_found' && st(r, 1) === 'skip:bad_id' && st(r, 2) === 'skip:name_not_found');
  // CSV(따옴표) + 열 순서 바뀜
  r = run('"아이디","비밀번호","ID"\r\n"maba01","pw1234","5"\r\n');
  ok('CSV·열 순서가 달라도 머리글 이름으로 읽음', r[0] && r[0].status === 'ready' && r[0].center.id === 5 && r[0].row.login === 'maba01', JSON.stringify(r[0] && r[0].row));
  // 머리글 없음
  r = run('가나학원\tgana01\n');
  ok('머리글이 없으면 오류로 알림', !!r.error);
  // 건너뛴 줄에는 비밀번호를 남기지 않는다
  r = run('ID\t아이디\t비밀번호\n4\tnewid\tsecret1\n');
  ok('건너뛴 줄은 비밀번호를 들고 있지 않다', r[0].pw === '');
  // 사유 문구가 있다
  ok('모든 사유에 사람이 읽을 문구', ['name_ambiguous','has_account','no_password','login_unknown','center_dup_in_file'].every(c => api.reasonText(c) !== c));
}

// ── ② 실행 경로 — 이미 계정 있는 대리점에 PATCH 를 보내지 않는가(비밀번호가 바뀌는 길) ──
ok('실행은 status=ready 줄만 보낸다', /if \(p\.status !== 'ready'\) continue;/.test(SRC));
ok('성공 판정은 login_result === created', /d\.login_result === 'created'/.test(SRC));
ok('실행 뒤 비밀번호를 지운다', /p\.pw = ''/.test(SRC) && /dp\.value = ''/.test(SRC));
ok('admin.html 이 모듈을 싣는다', /<script src="\/js\/adm-center-bulk-login\.js\?v=\d+" defer><\/script>/.test(HTML));
ok('admin.html 에 입력칸들이 있다', ['ct-bulk-wrap','ct-bulk-paste','ct-bulk-file','ct-bulk-defpw','ct-bulk-preview','ct-bulk-run','ct-bulk-result'].every(id => HTML.includes('id="' + id + '"')));

// ── ③ 검색 대상 qf=name — 서버 조건을 오려 SQLite 에 실제로 돌린다 ──
const qi = API.indexOf("const qf = url.searchParams.get('qf')");
ok('서버 qf 갈래가 있다', qi > 0);
let sqlite;
try { sqlite = await import('node:sqlite'); } catch {}
if (qi > 0 && sqlite) {
  const blk = API.slice(qi, API.indexOf('/* 🏢 (2026-08-18', qi));
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(`CREATE TABLE franchises (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE centers (id INTEGER PRIMARY KEY, franchise_id INTEGER, name TEXT, manager TEXT, address TEXT);`);
  db.exec(`INSERT INTO franchises VALUES (1,'본사직영지사'),(2,'부산지사');
           INSERT INTO centers VALUES (10,1,'MANGO AI','홍길동','서울'),(11,2,'직영학원','김','부산'),(12,1,'드림키오','이','직영로');`);
  const runQ = (q, qfv) => {
    const where = [], binds = [];
    const url = { searchParams: new URLSearchParams(qfv ? { qf: qfv } : {}) };
    const fn = new Function('q', 'url', 'where', 'binds', blk.replace(/: string/g, ''));
    fn(q, url, where, binds);
    const sql = `SELECT c.id FROM centers c LEFT JOIN franchises f ON f.id=c.franchise_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id`;
    return db.prepare(sql).all(...binds).map(r => r.id).join(',');
  };
  ok('qf=name → 대리점 이름만(지사·주소 안 걸림)', runQ('직영', 'name') === '11', runQ('직영', 'name'));
  ok('qf 없음 → 예전처럼 지사·주소까지(짝)', runQ('직영', '') === '10,11,12', runQ('직영', ''));
}
ok('화면이 qf 를 함께 보낸다', /'&qf=' \+ _ctState\.qf/.test(CORE) && /qf: 'name'/.test(CORE));
ok('검색 대상 선택칸이 있다(기본 대리점명만)', /<select id="ct-qf"[^>]*>\s*<option value="name"/.test(HTML));

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
