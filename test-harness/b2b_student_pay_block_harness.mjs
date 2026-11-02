/* b2b_student_pay_block_harness.mjs — 🏫 B2B 대리점 학생 «직접 결제» 차단 (2026-11-02 사장님)
   「결제유형이 B2B 로 되어 있는 대리점은 학생이 AI 컨텐츠나 화상수업을 직접 결제할 수 없도록」
   [무엇을] ① 판정 정본(src/b2b-student-pay-block.ts)을 타입만 벗겨 **실제로 돌리고**, D1 은 진짜 SQLite 로.
            ② 학생이 직접 결제하는 입구 7곳이 그 판정을 «주문·카드등록보다 먼저» 부르는가(중괄호 짝으로 잘라 위치로).
   짝: «B2B 면 막는다» 옆에 «B2C·미지정·모름·조회실패면 안 막는다» 를 반드시 둔다(없으면 «전부 막기» 도 통과). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = p => readFileSync(join(ROOT, 'cloudflare-deploy/src', p), 'utf8');
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => { if (cond) { PASS++; console.log('  ✅ ' + name); } else { FAIL++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); } };

const modSrc = SRC('b2b-student-pay-block.ts');
ok('정본 파일에 import 가 없다(enroll-ops 에서도 부를 수 있게)', !/^\s*import\s/m.test(modSrc));
let M = null;
try {
  const js = stripTypeScriptTypes(modSrc);
  M = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
} catch (e) { ok('정본을 불러온다', false, e.message); }

console.log('\n① 순수 판정 decideAgencyPayType');
if (M) {
  const d = M.decideAgencyPayType;
  ok('B2B 대리점 → B2B', d([{ payment_type: 'B2B', franchise_name: 'A' }], 'A', null) === 'B2B');
  ok('소문자·공백도 B2B', d([{ payment_type: ' b2b ', franchise_name: null }], null, null) === 'B2B');
  ok('B2C 대리점 → B2C (짝)', d([{ payment_type: 'B2C', franchise_name: 'A' }], 'A', null) === 'B2C');
  ok('미지정 대리점 + 학생칸 없음 → null', d([{ payment_type: null, franchise_name: 'A' }], 'A', null) === null);
  ok('대리점 미지정이면 학생 칸(B2B 결제) → B2B', d([{ payment_type: null, franchise_name: 'A' }], 'A', 'B2B 결제') === 'B2B');
  ok('대리점 지정이 학생 칸을 이긴다(B2C 지정 + 학생 B2B)', d([{ payment_type: 'B2C', franchise_name: 'A' }], 'A', 'B2B') === 'B2C');
  ok('같은 이름이 B2B·B2C 로 갈리면 지사로 좁힌다', d([{ payment_type: 'B2B', franchise_name: 'A' }, { payment_type: 'B2C', franchise_name: 'B' }], 'A', null) === 'B2B');
  ok('지사로 좁혀도 B2C 쪽이면 B2C (짝)', d([{ payment_type: 'B2B', franchise_name: 'A' }, { payment_type: 'B2C', franchise_name: 'B' }], 'B', null) === 'B2C');
  ok('지사를 모르면 «모름» — 막지 않는다', d([{ payment_type: 'B2B', franchise_name: 'A' }, { payment_type: 'B2C', franchise_name: 'B' }], null, null) === 'unknown');
  ok('같은 지사 안에서도 섞이면 «모름»', d([{ payment_type: 'B2B', franchise_name: 'A' }, { payment_type: 'B2C', franchise_name: 'A' }], 'A', null) === 'unknown');
  ok('같은 이름 둘이 모두 B2B 면 B2B', d([{ payment_type: 'B2B', franchise_name: 'A' }, { payment_type: 'B2B', franchise_name: 'B' }], null, null) === 'B2B');
  ok('대리점이 없으면(빈 목록) 학생 칸 없으면 null', d([], null, null) === null);
  ok('메시지가 학원 이름을 말한다', /«ABC학원»/.test(M.b2bPayBlockMessage('ABC학원')));
}

console.log('\n② D1(진짜 SQLite) — studentPayBlock / b2bPayBlockBody');
function makeEnv(setup) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, shop_name TEXT, franchise TEXT, payment_type TEXT);
           CREATE TABLE centers (id INTEGER PRIMARY KEY AUTOINCREMENT, franchise_id INTEGER, name TEXT NOT NULL, payment_type TEXT);
           CREATE TABLE franchises (id INTEGER PRIMARY KEY, name TEXT);`);
  if (setup) setup(db);
  const wrap = sql => {
    const st = db.prepare(sql);
    const run = (args) => ({
      first: async () => st.get(...args) ?? null,
      all: async () => ({ results: st.all(...args) }),
      run: async () => st.run(...args),
    });
    return Object.assign(run([]), { bind: (...a) => run(a) });
  };
  return { DB: { prepare: wrap } };
}
if (M) {
  const env = makeEnv(db => {
    db.exec(`INSERT INTO franchises VALUES (1,'서울지사'),(2,'부산지사');
      INSERT INTO centers (franchise_id,name,payment_type) VALUES (1,'B2B학원','B2B'),(1,'B2C학원','B2C'),(1,'미정학원',NULL),
        (1,'쌍둥이학원','B2B'),(2,'쌍둥이학원','B2C');
      INSERT INTO students_erp VALUES ('b2bkid','B2B학원','서울지사',NULL),('b2ckid','B2C학원','서울지사',NULL),
        ('nonekid','미정학원','서울지사',NULL),('noshop',NULL,NULL,NULL),
        ('twinA','쌍둥이학원','서울지사',NULL),('twinB','쌍둥이학원','부산지사',NULL),('twinX','쌍둥이학원',NULL,NULL),
        ('Upper','B2B학원','서울지사',NULL),('Kim','B2B학원',NULL,NULL),('kim','B2C학원',NULL,NULL);`);
  });
  const bl = async u => (await M.studentPayBlock(env, u)).blocked;
  ok('B2B 대리점 학생은 막는다', await bl('b2bkid') === true);
  ok('B2C 대리점 학생은 안 막는다 (짝)', await bl('b2ckid') === false);
  ok('미지정 대리점 학생은 안 막는다', await bl('nonekid') === false);
  ok('학원이 없는 학생은 안 막는다', await bl('noshop') === false);
  ok('명부에 없는 계정(관리자 등)은 안 막는다', await bl('admin') === false);
  ok('같은 이름 대리점 — 서울지사(B2B) 학생은 막는다', await bl('twinA') === true);
  ok('같은 이름 대리점 — 부산지사(B2C) 학생은 안 막는다', await bl('twinB') === false);
  ok('같은 이름 대리점 — 지사 모름이면 안 막는다', await bl('twinX') === false);
  ok('대소문자만 다른 아이디(유일)도 찾는다', await bl('upper') === true);
  ok('대소문자만 다른 계정이 둘이면 정확일치만 본다(Kim=B2B)', await bl('Kim') === true);
  ok('…kim=B2C 는 안 막는다 (짝)', await bl('kim') === false);
  const body = await M.b2bPayBlockBody(env, 'b2bkid');
  ok('막을 때 본문: ok:false · 오류코드 · 학원 · 문구', body && body.ok === false && body.error === M.B2B_PAY_BLOCK_ERROR && body.shop === 'B2B학원' && /직접 결제할 수 없습니다/.test(body.message), JSON.stringify(body));
  ok('안 막을 때 본문은 null', await M.b2bPayBlockBody(env, 'b2ckid') === null);
  const broken = { DB: { prepare: () => { throw new Error('D1 down'); } } };
  let r = null; try { r = await M.studentPayBlock(broken, 'b2bkid'); } catch (e) { r = { thrown: true }; }
  ok('조회가 실패하면 던지지 않고 막지 않는다(fail-open)', r && !r.thrown && r.blocked === false, JSON.stringify(r));
  const noFr = makeEnv(db => { db.exec(`DROP TABLE franchises; INSERT INTO centers (franchise_id,name,payment_type) VALUES (1,'X','B2B'); INSERT INTO students_erp VALUES ('x','X',NULL,NULL);`); });
  ok('지사 표가 없는 DB 에서도 던지지 않는다', (await M.studentPayBlock(noFr, 'x')).blocked === false);
}

console.log('\n③ 배선 — 학생이 직접 결제하는 입구 7곳');
function blockAt(src, anchor) {
  const i = src.indexOf(anchor); if (i < 0) return '';
  const j = src.indexOf('{', i + anchor.length - 1);
  let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const PAY = SRC('api-pay.ts'), ENR = SRC('enroll-ops.ts');
const GATE = /const _b2b = await b2bPayBlockBody\(env, (\w+)\); if \(_b2b\) return json\(_b2b, 403\);/;
const cases = [
  ['create-order(화상수업 회차권·A.i 콘텐츠)', PAY, "if (path === '/api/pay/create-order' && method === 'POST') {", 'verifiedUid', 'INSERT INTO payment_orders'],
  ['manual-request(무통장·가상계좌 접수)', PAY, "if (path === '/api/pay/manual-request' && method === 'POST') {", 'verifiedUid2', 'INSERT INTO payment_orders'],
  ['billing/register(자동결제 카드 등록)', PAY, "if (path === '/api/pay/billing/register' && method === 'POST') {", 'authUid', 'customerKey'],
  ['billing/confirm(자동결제 확정)', PAY, "if (path === '/api/pay/billing/confirm' && method === 'POST') {", 'authUid', 'confirmAiPassBilling'],
  ['billing/charge-now(지금 결제)', PAY, "if (path === '/api/pay/billing/charge-now' && method === 'POST') {", 'authUid', 'chargeSubscriptionOnce('],
  ['enroll/create-order(수강신청)', ENR, "if (path === '/api/pay/enroll/create-order' && method === 'POST') {", 'uid', 'createEnrollOrder('],
  ['enroll/renew-order(연장 — 문자 링크 포함)', ENR, "if (path === '/api/pay/enroll/renew-order' && method === 'POST') {", 'uid', 'createEnrollOrder('],
];
for (const [name, src, anchor, varName, after] of cases) {
  const b = strip(blockAt(src, anchor));
  const m = b.match(GATE);
  ok(name + ' — 게이트가 있다', !!m);
  ok(name + ' — 인증된 «그» 변수로 묻는다(' + varName + ')', !!m && m[1] === varName, m && m[1]);
  ok(name + ' — 돈이 걸린 일(' + after + ')보다 먼저', !!m && b.indexOf(m[0]) < b.indexOf(after) && b.indexOf(after) > 0);
  ok(name + ' — 인증 확인보다 뒤(남의 계정으로 묻지 않음)', !!m && b.indexOf('auth') >= 0 && b.indexOf('auth') < b.indexOf(m[0]));
}
ok('⛔ 학원이 내는 길(/api/pay/b2b/*)은 막지 않는다', !/b2bPayBlockBody/.test(strip(blockAt(PAY, "if (path.startsWith('/api/pay/b2b/')) {"))));

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
