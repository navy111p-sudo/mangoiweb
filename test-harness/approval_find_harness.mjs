/*
 * 📂 결재 문서함 — 「지난 결재 찾기」가 **실제로 거르는가** (2026-09-04)
 *
 *   [왜 이렇게 검사하나]
 *     조건을 «글자로» 검사하면 뜻이 뒤집혀도 통과한다 — `>=` 를 `<=` 로 바꿔도
 *     그 줄은 그대로 있다. 그래서 정본 buildFindQuery() 를 **실제로 부르고**,
 *     나온 SQL 을 **진짜 SQLite 에 돌려** 몇 건이 남는지 센다.
 *
 *   [짝으로 본다]
 *     「검색하면 걸러진다」만 보면 **아무것도 안 주는 코드**도 통과한다.
 *     그래서 「찾는 것은 실제로 나온다」를 언제나 함께 센다.
 *
 *   [무엇이 걸려 있나]
 *     · 인사·급여가 남의 목록에 새면 안 된다(열람등급은 호출부가 canView 로 거른다).
 *     · D1 의 LIKE 패턴 한도는 50자다 — 그래서 instr() 을 쓴다(CLAUDE.md 2장).
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const { buildFindQuery } = P;

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/* ── 진짜 SQLite ──────────────────────────────────────────────────────────
   node:sqlite 는 Node 22 에 들어 있다. 없으면 조용히 건너뛰지 않고 «못 쟀다» 고 말한다. */
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch {
  console.log('⏭  node:sqlite 없음 — 이 검사는 SQL 을 실제로 돌려야 뜻이 있습니다.');
  process.exit(0);
}

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE approval_requests (
  id INTEGER PRIMARY KEY, req_type TEXT, requester_username TEXT, requester_name TEXT,
  title TEXT, body TEXT, status TEXT, stage_due_at INTEGER, created_at INTEGER)`);

const KST = (d) => Date.parse(d + 'T00:00:00+09:00') + 12 * 3600_000;   // 그날 정오(KST)
const rows = [
  [1, 'purchase', 'admin',     '정우영', 'Dual Wan Router',   '라우터 구입합니다', 'approved', null, KST('2026-08-10')],
  [2, 'expense',  'admin',     '정우영', '8월 인터넷 요금',    'PLDT 요금',        'approved', null, KST('2026-08-20')],
  [3, 'urgent',   'admin',     '정우영', 'test classes',      '급합니다',          'pending',  null, KST('2026-08-30')],
  [4, 'doc',      'mgr_karl',  'Karl',   'Office memo',       'about the router',  'rejected', null, KST('2026-09-01')],
  [5, 'expense',  'mgr_melca', 'Melca',  'Supplies',          '문구류',            'pending',  null, KST('2026-09-03')],
  [6, 'hr',       'admin',     '정우영', '9월 급여 확정',      '',                 'approved', null, KST('2026-09-02')],
];
const ins = db.prepare(`INSERT INTO approval_requests
  (id, req_type, requester_username, requester_name, title, body, status, stage_due_at, created_at)
  VALUES (?,?,?,?,?,?,?,?,?)`);
for (const r of rows) ins.run(...r);

/** 정본이 만든 조건을 그대로 돌려 id 목록을 돌려준다. */
function run(input) {
  const { cond, binds, order } = buildFindQuery(input);
  const st = db.prepare('SELECT id FROM approval_requests' + cond + order);
  return st.all(...binds).map((r) => Number(r.id));
}
const same = (a, b) => a.length === b.length && a.every((x) => b.indexOf(x) >= 0);

console.log('════════ 결재 문서함 검색 하니스 ════════');

// ══ A. 함(트레이) ═════════════════════════════════════════════════════════
console.log('\n[A] 함 — 무엇을 모아 보는가');

check('내가 올린 것 — 내 건만 (남의 건은 안 나온다)',
  same(run({ scope: 'mine', me: 'admin' }), [1, 2, 3, 6]),
  JSON.stringify(run({ scope: 'mine', me: 'admin' })));

check('진행 중 — 내 대기 건만', same(run({ scope: 'open', me: 'admin' }), [3]));
check('승인 완료 — 내 승인 건만', same(run({ scope: 'done', me: 'admin' }), [1, 2, 6]));
check('반려 — 내 반려 건은 없다 (짝 검사: 남의 반려 건 4번이 새면 안 된다)',
  same(run({ scope: 'rejected', me: 'admin' }), []),
  JSON.stringify(run({ scope: 'rejected', me: 'admin' })));
check('내가 결재할 것 — 대기 중이되 내 건은 뺀다',
  same(run({ scope: 'pending', me: 'admin' }), [5]),
  JSON.stringify(run({ scope: 'pending', me: 'admin' })));
check('전체 — 조건 없이 다 나온다', run({ scope: 'all', me: 'admin' }).length === 6);

// ══ B. 검색 ═══════════════════════════════════════════════════════════════
console.log('\n[B] 검색 — 제목·내용·사람');

check('제목으로 찾는다', same(run({ scope: 'all', me: 'admin', q: 'Router' }), [1, 4]),
  JSON.stringify(run({ scope: 'all', me: 'admin', q: 'Router' })));
check('대소문자를 가리지 않는다', same(run({ scope: 'all', me: 'admin', q: 'router' }), [1, 4]));
check('내용으로도 찾는다', same(run({ scope: 'all', me: 'admin', q: 'PLDT' }), [2]));
check('한글 내용으로 찾는다', same(run({ scope: 'all', me: 'admin', q: '문구류' }), [5]));
check('올린 사람 이름으로 찾는다', same(run({ scope: 'all', me: 'admin', q: 'Melca' }), [5]));
check('계정으로도 찾는다', same(run({ scope: 'all', me: 'admin', q: 'mgr_karl' }), [4]));
check('없는 낱말은 0건 (짝 검사 — 아무거나 주지 않는다)',
  run({ scope: 'all', me: 'admin', q: '없는낱말xyz' }).length === 0);

/* 🔴 D1 의 LIKE 한도(50자)를 피하려고 instr 을 쓴다. 와일드카드가 «글자» 로 취급되는지 본다. */
db.prepare(`INSERT INTO approval_requests
  (id, req_type, requester_username, requester_name, title, body, status, created_at)
  VALUES (7,'doc','admin','정우영','100% 환급','',' approved',?)`).run(KST('2026-08-15'));
check('% 를 와일드카드로 오해하지 않는다 (LIKE 였다면 전부 걸렸다)',
  same(run({ scope: 'all', me: 'admin', q: '100%' }), [7]),
  JSON.stringify(run({ scope: 'all', me: 'admin', q: '100%' })));
check('_ 도 글자 그대로 본다', run({ scope: 'all', me: 'admin', q: 'a_b' }).length === 0);

const long = 'x'.repeat(70);
check('아주 긴 검색어에도 터지지 않는다 (D1 LIKE 였다면 50자에서 실패)',
  run({ scope: 'all', me: 'admin', q: long }).length === 0);
check('검색어는 60자로 자른다', buildFindQuery({ me: 'a', q: long }).binds.some((b) => String(b).length === 60));

// ══ C. 분류·상태 ══════════════════════════════════════════════════════════
console.log('\n[C] 분류·상태');

check('분류로 거른다', same(run({ scope: 'all', me: 'admin', type: 'expense' }), [2, 5]));
check('모르는 분류는 무시한다 (조건을 몰래 넣지 않는다)',
  run({ scope: 'all', me: 'admin', type: '없는분류' }).length === 7);
check('상태로 거른다', same(run({ scope: 'all', me: 'admin', status: 'pending' }), [3, 5]));
check('모르는 상태도 무시한다', run({ scope: 'all', me: 'admin', status: 'xxx' }).length === 7);
check('분류 + 상태를 함께 건다',
  same(run({ scope: 'all', me: 'admin', type: 'expense', status: 'pending' }), [5]));

// ══ D. 기간 ═══════════════════════════════════════════════════════════════
console.log('\n[D] 기간 — KST 날짜로 자른다');

check('시작일 이후만', same(run({ scope: 'all', me: 'admin', from: '2026-09-01' }), [4, 5, 6]),
  JSON.stringify(run({ scope: 'all', me: 'admin', from: '2026-09-01' })));
check('종료일 이전만', same(run({ scope: 'all', me: 'admin', to: '2026-08-15' }), [1, 7]),
  JSON.stringify(run({ scope: 'all', me: 'admin', to: '2026-08-15' })));
check('시작일·종료일 둘 다', same(run({ scope: 'all', me: 'admin', from: '2026-08-20', to: '2026-08-30' }), [2, 3]));
check('그날 하루만 골라도 그날 것이 나온다 (경계가 밀리지 않는다)',
  same(run({ scope: 'all', me: 'admin', from: '2026-08-30', to: '2026-08-30' }), [3]),
  JSON.stringify(run({ scope: 'all', me: 'admin', from: '2026-08-30', to: '2026-08-30' })));
check('날짜 모양이 아니면 무시한다 (조건을 몰래 넣지 않는다)',
  run({ scope: 'all', me: 'admin', from: '어제' }).length === 7);

// ══ E. 섞어 쓰기 ══════════════════════════════════════════════════════════
console.log('\n[E] 조건을 함께 걸 때');

check('내 것 + 분류 + 기간',
  same(run({ scope: 'mine', me: 'admin', type: 'expense', from: '2026-08-01' }), [2]));
check('내 것 + 검색 — 남의 건은 검색해도 안 나온다 (짝 검사)',
  same(run({ scope: 'mine', me: 'admin', q: 'router' }), [1]),
  JSON.stringify(run({ scope: 'mine', me: 'admin', q: 'router' })));

// ══ F. 바인드 개수 ════════════════════════════════════════════════════════
console.log('\n[F] D1 바인드 한도');

const full = buildFindQuery({ scope: 'mine', me: 'admin', q: 'a', type: 'doc', status: 'pending',
                             from: '2026-01-01', to: '2026-12-31' });
check('조건을 다 걸어도 바인드가 100개를 넘지 않는다 (D1 한도)',
  full.binds.length < 90, full.binds.length + '개');

console.log('\n──────────────────────────────────────');
if (FAIL) {
  console.log(`  ❌ ${FAIL}건 실패 / ${PASS + FAIL}건`);
  for (const f of FAILS) console.log('     ' + f);
  console.log('  결재는 돈과 권한이 걸린 기능입니다. 위 항목을 고치세요.');
  process.exit(1);
}
console.log(`  ✅ ${PASS}건 전부 통과 — 문서함 검색이 실제로 거릅니다.`);
