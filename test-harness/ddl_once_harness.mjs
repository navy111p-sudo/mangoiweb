// ddl_once_harness.mjs — 「같은 DDL 은 격리당 한 번만」이 실제로 그런지 (2026-08-09)
//
// 이 코드는 **모든 D1 호출이 지나가는 길** 위에 있다. 그래서 말이 아니라 실행으로 증명한다.
// 가짜 D1 을 만들어 실제로 몇 번 나갔는지 센다.
//
//   A. 같은 CREATE 를 여러 번 → 실제 실행은 한 번
//   B. 다른 DDL 은 각각 실행된다 (뭉뚱그리지 않는다)
//   C. DDL 이 아닌 exec 은 손대지 않는다 (매번 통과)
//   D. 실패는 기억하지 않는다 — 다음 호출이 다시 시도 (일시적 D1 오류로 격리가 죽지 않게)
//   E. 예외: ALTER 의 「이미 있는 컬럼」은 기억한다 (원하는 상태에 도달했으므로)
//   F. 실패는 호출자에게 그대로 전달된다 (조용히 삼키지 않는다)
//   G. prepare 등 다른 메서드는 원본 그대로
//   H. 회귀 감시 — 진입점(fetch·scheduled)에서 감싸기가 빠지지 않았는지

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const { wrapDbDdlOnce, __resetDdlOnce, ddlOnceStats } =
  await import(pathToFileURL(join(SRC, 'db-ddl-once.ts')).href);

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond, extra) => {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
};

/** 가짜 D1 — exec 이 몇 번 «실제로» 불렸는지 센다 */
function fakeDb(opts = {}) {
  const calls = [];
  return {
    calls,
    async exec(sql) {
      calls.push(sql);
      if (opts.throwOn && opts.throwOn(sql, calls.length)) throw new Error(opts.message || 'boom');
      return { count: 1 };
    },
    prepare(sql) { return { __sql: sql, bind: () => ({ run: async () => ({}) }) }; },
    async batch(x) { return x; },
  };
}

const CREATE_A = 'CREATE TABLE IF NOT EXISTS aaa (id INTEGER PRIMARY KEY)';
const CREATE_B = 'CREATE TABLE IF NOT EXISTS bbb (id INTEGER PRIMARY KEY)';
const ALTER_A  = 'ALTER TABLE aaa ADD COLUMN note TEXT';
const SELECTY  = 'PRAGMA foreign_keys=ON';

console.log('\nA. 같은 DDL 은 한 번만');
{
  __resetDdlOnce();
  const raw = fakeDb(); const db = wrapDbDdlOnce(raw);
  await db.exec(CREATE_A); await db.exec(CREATE_A); await db.exec(CREATE_A);
  check('세 번 불러도 D1 으로는 한 번', raw.calls.length === 1, `실제 ${raw.calls.length}번`);
  check('건너뛴 횟수가 집계된다', ddlOnceStats.skipped === 2, `skipped=${ddlOnceStats.skipped}`);
}

console.log('\nB. 다른 DDL 은 각각');
{
  __resetDdlOnce();
  const raw = fakeDb(); const db = wrapDbDdlOnce(raw);
  await db.exec(CREATE_A); await db.exec(CREATE_B); await db.exec(CREATE_A);
  check('서로 다른 두 문장은 둘 다 실행', raw.calls.length === 2, `실제 ${raw.calls.length}번`);
}

console.log('\nC. DDL 이 아닌 exec 은 그대로');
{
  __resetDdlOnce();
  const raw = fakeDb(); const db = wrapDbDdlOnce(raw);
  await db.exec(SELECTY); await db.exec(SELECTY);
  check('DDL 이 아니면 매번 통과', raw.calls.length === 2, `실제 ${raw.calls.length}번`);
}

console.log('\nD. 실패는 기억하지 않는다');
{
  __resetDdlOnce();
  const raw = fakeDb({ throwOn: (_s, n) => n === 1, message: 'D1 temporary failure' });
  const db = wrapDbDdlOnce(raw);
  let threw = false;
  try { await db.exec(CREATE_A); } catch { threw = true; }
  check('첫 시도의 실패가 호출자에게 전달된다', threw);
  await db.exec(CREATE_A);                       // 두 번째는 성공
  check('실패 뒤 다시 시도한다', raw.calls.length === 2, `실제 ${raw.calls.length}번`);
  await db.exec(CREATE_A);
  check('성공한 뒤에는 더 안 나간다', raw.calls.length === 2, `실제 ${raw.calls.length}번`);
}

console.log('\nE. ALTER 의 「이미 있는 컬럼」은 기억한다');
{
  __resetDdlOnce();
  const raw = fakeDb({ throwOn: () => true, message: 'duplicate column name: note' });
  const db = wrapDbDdlOnce(raw);
  for (let i = 0; i < 3; i++) { try { await db.exec(ALTER_A); } catch {} }
  check('세 번 불러도 D1 으로는 한 번', raw.calls.length === 1, `실제 ${raw.calls.length}번`);
}
{
  // 대조군: 같은 ALTER 라도 «다른» 오류면 기억하지 않는다
  __resetDdlOnce();
  const raw = fakeDb({ throwOn: () => true, message: 'network error' });
  const db = wrapDbDdlOnce(raw);
  for (let i = 0; i < 3; i++) { try { await db.exec(ALTER_A); } catch {} }
  check('일시적 오류는 기억하지 않는다(세 번 다 시도)', raw.calls.length === 3, `실제 ${raw.calls.length}번`);
}

console.log('\nF/G. 계약을 바꾸지 않는다');
{
  __resetDdlOnce();
  const raw = fakeDb(); const db = wrapDbDdlOnce(raw);
  const st = db.prepare('SELECT 1');
  check('prepare 는 원본 그대로', st && st.__sql === 'SELECT 1');
  check('같은 DB 를 두 번 감싸도 같은 객체', wrapDbDdlOnce(raw) === db);
  const r = await db.exec(CREATE_B);
  check('첫 실행은 원본 반환값을 그대로 돌려준다', r && r.count === 1, JSON.stringify(r));
}

console.log('\nH. 진입점에 감싸기가 남아 있는가');
{
  const idx = readFileSync(join(SRC, 'index.ts'), 'utf8');
  check("import 되어 있다", /from '\.\/db-ddl-once'/.test(idx));
  const fetchWrapped = /async fetch\([\s\S]{0,1200}?wrapDbDdlOnce\(env\.DB\)/.test(idx);   // 주석이 길어도 잡히게 넉넉히
  const schedWrapped = /async scheduled\([\s\S]{0,1200}?wrapDbDdlOnce\(env\.DB\)/.test(idx);   // 주석이 길어도 잡히게 넉넉히
  check('fetch 진입점에서 감싼다', fetchWrapped, '빠지면 DDL 이 다시 요청마다 나간다');
  check('scheduled 진입점에서 감싼다', schedWrapped);
}

console.log('\n' + '─'.repeat(56));
console.log(`  ${PASS} PASS · ${FAIL} FAIL`);
if (FAILS.length) { console.log('\n  실패:'); FAILS.forEach(f => console.log('   - ' + f)); }
console.log('─'.repeat(56));
process.exit(FAIL ? 1 : 0);
