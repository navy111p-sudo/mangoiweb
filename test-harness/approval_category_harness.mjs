/*
 * 🏷️ 결재 「지출 항목」 — 고른 값이 **정말 그대로 쌓이는가** (2026-09-04)
 *
 *   [왜 이 검사가 필요한가]
 *     서버는 예전부터 category 를 «60자 자유 문자열» 로 받고 있었다. 화면이 한 번도
 *     안 보냈을 뿐이라, 화면을 켜는 순간 「인터넷요금」·「인터넷 요금」·「통신비」가
 *     제각각 쌓여 합계가 조용히 갈라질 수 있었다.
 *
 *   [무엇을 재는가]
 *     ⓪ 회계 계정과목과 «서로 같은 말을 하는가» — 새 분류 체계를 만들지 않았는가
 *     ① 목록 자체의 규칙(key 불변·중복 없음·기타가 마지막)
 *     ② normCategory 를 **실제로 돌려** 「아는 값은 맞추고, 모르는 값은 지어내지 않는다」
 *     ③ 문서함 검색이 항목으로 **정말 거르는가**(진짜 SQLite)
 *     ④ 화면·서버 배선 — 목록이 두 벌이 아닌가, 돈 안 나가는 분류에 새지 않는가
 *
 *   [짝으로 본다]
 *     「모르는 값은 안 받는다」만 검사하면 **아무것도 안 받는 코드**가 통과한다.
 *     그래서 「아는 값은 실제로 받는다」를 언제나 함께 센다.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');

const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const { CATEGORIES, CATEGORY_KEYS, normCategory, categorySpec, TYPES, buildFindQuery } = P;

const api = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const acct = readFileSync(join(SRC, 'accounting-reports.ts'), 'utf8');
const work = readFileSync(join(PUB, 'work.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

console.log('════════ 결재 지출 항목 하니스 ════════');

// ══ ⓪ 회계와 같은 말을 하는가 ═════════════════════════════════════════════
console.log('\n[⓪] 회계 계정과목 — 새 분류 체계를 만들지 않았는가');

/* ⚠️ accounting-reports.ts 는 import 할 수 없다(Env·D1 에 묶여 있다).
   그래서 **선언된 배열을 읽어** 대조한다 — 「그 글자가 파일 어딘가에 있나」가 아니라
   EXPENSE_CATEGORIES 라는 그 목록 «안» 에 있는지를 본다. */
const m = acct.match(/export const EXPENSE_CATEGORIES\s*=\s*\[([\s\S]*?)\]/);
const ACCOUNTS = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
check('회계 계정과목 목록을 실제로 읽었다 (전제 — 못 읽으면 아래 검사가 헛돈다)',
  ACCOUNTS.length >= 10, ACCOUNTS.length + '개');

const bad = CATEGORIES.filter((c) => ACCOUNTS.indexOf(c.account) < 0);
check('모든 항목의 회계 계정이 EXPENSE_CATEGORIES 안에 있다 (이름을 새로 만들지 않았다)',
  ACCOUNTS.length >= 10 && bad.length === 0,
  bad.map((c) => c.key + '→' + c.account).join(', '));

// ══ ① 목록 자체 ═══════════════════════════════════════════════════════════
console.log('\n[①] 목록의 규칙');

check('항목이 여러 개다 (하나뿐이면 고르는 뜻이 없다)', CATEGORIES.length >= 5, CATEGORIES.length + '개');
check('key 가 겹치지 않는다', new Set(CATEGORY_KEYS).size === CATEGORY_KEYS.length);
check('key 는 ascii 소문자 — 라벨을 다듬어도 쌓인 값의 뜻이 안 바뀐다',
  CATEGORY_KEYS.every((k) => /^[a-z][a-z0-9_]*$/.test(k)),
  CATEGORY_KEYS.filter((k) => !/^[a-z][a-z0-9_]*$/.test(k)).join(','));
check('KO·EN 이름이 모두 있다 (한 언어만 있으면 그 화면이 빈칸이 된다)',
  CATEGORIES.every((c) => c.ko && c.en));
check('KO 이름이 겹치지 않는다 (같은 이름 둘이면 고르는 사람이 못 가른다)',
  new Set(CATEGORIES.map((c) => c.ko)).size === CATEGORIES.length);
check('「기타」가 있고 맨 마지막이다 — 목록에 없는 지출도 올릴 수 있어야 한다',
  CATEGORIES[CATEGORIES.length - 1].key === 'etc');
check('Unicode 13 이상 이모지를 쓰지 않는다 (Win10 두부)',
  !/[\u{1FA70}-\u{1FAFF}\u{1F7E0}-\u{1F7EB}]/u.test(JSON.stringify(CATEGORIES)));

// ══ ② normCategory 를 실제로 돌린다 ═══════════════════════════════════════
console.log('\n[②] 들어온 값 맞추기 — 실제로 돌려서');

check('아는 key 는 그대로 받는다 (짝 검사 — 아무것도 안 받는 코드는 여기서 걸린다)',
  CATEGORY_KEYS.every((k) => normCategory(k) === k),
  CATEGORY_KEYS.filter((k) => normCategory(k) !== k).join(','));
check('대문자로 와도 받는다', normCategory('SUPPLIES') === 'supplies');
check('앞뒤 공백이 있어도 받는다', normCategory('  utility  ') === 'utility');
check('한국어 라벨로 와도 맞춘다', normCategory('공과금 · 인터넷') === 'utility');
check('가운뎃점·공백이 달라도 맞춘다', normCategory('공과금·인터넷') === 'utility');
check('영어 라벨로 와도 맞춘다', normCategory('Office supplies') === 'supplies');

check('모르는 값은 지어내지 않는다 (null)', normCategory('통신비') === null);
check('빈 값은 null', normCategory('') === null && normCategory(null) === null && normCategory(undefined) === null);
check('⛔ 모르는 값을 «기타» 로 떨어뜨리지 않는다 — 안 고른 것과 기타를 고른 것은 다른 사실이다',
  normCategory('없는항목xyz') !== 'etc');
check('아주 긴 값에도 터지지 않는다', normCategory('x'.repeat(5000)) === null);
check('SQL 처럼 생긴 값도 그냥 모르는 값이다', normCategory("etc' OR 1=1--") === null);

check('categorySpec 은 이름을 돌려준다', (categorySpec('utility') || {}).ko === '공과금 · 인터넷');
check('categorySpec 은 모르면 null — 빈칸으로 두지 이름을 지어내지 않는다',
  categorySpec('없는것') === null && categorySpec(null) === null);
check('categorySpec 이 회계 계정도 함께 준다 (엑셀에서 회계와 대조할 수 있게)',
  !!(categorySpec('utility') || {}).account);

// ══ ③ 문서함이 항목으로 정말 거르는가 (진짜 SQLite) ═══════════════════════
console.log('\n[③] 문서함 검색 — 진짜 SQL 로');

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { DatabaseSync = null; }
if (!DatabaseSync) {
  console.log('  ⏭  node:sqlite 없음 — 이 절은 SQL 을 실제로 돌려야 뜻이 있습니다.');
} else {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE approval_requests (
    id INTEGER PRIMARY KEY, req_type TEXT, requester_username TEXT, requester_name TEXT,
    title TEXT, body TEXT, category TEXT, status TEXT, stage_due_at INTEGER, created_at INTEGER)`);
  const KST = (d) => Date.parse(d + 'T00:00:00+09:00') + 12 * 3600_000;
  const ins = db.prepare(`INSERT INTO approval_requests
    (id, req_type, requester_username, requester_name, title, body, category, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const rows = [
    [1, 'expense',  'admin', '정우영', '8월 인터넷',  '', 'utility',  'approved', KST('2026-08-20')],
    [2, 'expense',  'admin', '정우영', '9월 인터넷',  '', 'utility',  'pending',  KST('2026-09-02')],
    [3, 'purchase', 'admin', '정우영', '라우터',      '', 'equipment','approved', KST('2026-08-10')],
    [4, 'expense',  'admin', '정우영', '볼펜',        '', null,       'approved', KST('2026-08-11')],
    [5, 'doc',      'admin', '정우영', '메모',        '', '',         'approved', KST('2026-08-12')],
  ];
  for (const r of rows) ins.run(...r);
  const run = (inp) => {
    const { cond, binds, order } = buildFindQuery(inp);
    return db.prepare('SELECT id FROM approval_requests' + cond + order).all(...binds).map((r) => Number(r.id));
  };
  const same = (a, b) => a.length === b.length && a.every((x) => b.indexOf(x) >= 0);

  check('항목으로 거른다', same(run({ scope: 'all', me: 'admin', category: 'utility' }), [1, 2]),
    JSON.stringify(run({ scope: 'all', me: 'admin', category: 'utility' })));
  check('다른 항목은 안 섞인다 (짝 검사)',
    same(run({ scope: 'all', me: 'admin', category: 'equipment' }), [3]));
  check('한국어 라벨로 골라도 걸러진다 (옛 화면·북마크)',
    same(run({ scope: 'all', me: 'admin', category: '공과금 · 인터넷' }), [1, 2]));
  check('항목 + 상태를 함께 건다',
    same(run({ scope: 'all', me: 'admin', category: 'utility', status: 'pending' }), [2]));
  check('모르는 항목이면 조건을 몰래 넣지 않는다 — 0건이 아니라 전부',
    run({ scope: 'all', me: 'admin', category: '없는항목' }).length === 5);
  check('항목을 안 고르면 전부 (조건 없음)',
    run({ scope: 'all', me: 'admin' }).length === 5);
  check('항목을 골랐다고 «항목 없는 건» 이 딸려오지 않는다',
    run({ scope: 'all', me: 'admin', category: 'utility' }).indexOf(4) < 0);
  const f = buildFindQuery({ scope: 'all', me: 'a', category: 'utility', q: 'x', type: 'doc', status: 'pending', from: '2026-01-01', to: '2026-12-31' });
  check('조건을 다 걸어도 D1 바인드 한도 안 (100개)', f.binds.length < 90, f.binds.length + '개');
}

// ══ ④ 배선 — 목록이 두 벌이 아닌가 ═══════════════════════════════════════
console.log('\n[④] 배선 — 화면과 서버가 같은 목록을 보는가');

check('서버가 목록을 내려준다 (categories)',
  /categories:\s*CATEGORIES\.map/.test(api));
check('화면은 서버가 준 목록을 그린다 (D.categories)',
  /D\.categories/.test(work));

/* ⛔ 화면이 자기 목록을 들고 있으면 서버와 갈린다 —
   「화면에서는 골랐는데 저장이 안 되는」 사고(CLAUDE.md 2장 duration_months)의 뿌리다.
   ⚠️ 주석에 예시로 적힌 한국어는 세지 않는다 — 주석을 벗긴 사본으로 판정한다. */
const workJs = work.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const hardcoded = CATEGORIES.filter((c) => workJs.indexOf("'" + c.key + "'") >= 0
                                        || workJs.indexOf('"' + c.key + '"') >= 0);
check('화면에 항목 목록을 손으로 적어 두지 않았다',
  hardcoded.length === 0, hardcoded.map((c) => c.key).join(','));

check('POST 가 정본으로 맞춰서 저장한다 (자유 문자열 60자로 받지 않는다)',
  /normCategory\(String\(form\.get\('category'\)/.test(api) &&
  !/String\(form\.get\('category'\) \|\| ''\)\.trim\(\)\.slice\(0, 60\)/.test(api));

/* 🏷️ 돈이 안 나가는 분류(휴가·불만·인사)에 항목이 새면 지출 합계가 흐려진다.
   조건이 «있는가» 만 보지 말고 목록 자체를 본다. */
const wantsCat = TYPES.filter((t) => t.wantsCategory).map((t) => t.key);
check('지출 항목은 돈이 나가는 분류에만 켜져 있다',
  wantsCat.length > 0 && wantsCat.every((k) => k === 'purchase' || k === 'expense'),
  wantsCat.join(','));
check('물품·지출 둘 다 켜져 있다 (짝 검사 — 전부 꺼도 위 검사는 통과한다)',
  wantsCat.indexOf('purchase') >= 0 && wantsCat.indexOf('expense') >= 0);
check('POST 가 그 분류에만 항목을 넣는다 (wantsCategory 를 실제로 본다)',
  /typeSpec\(reqType\)\.wantsCategory[\s\S]{0,200}?normCategory/.test(api));
check('화면도 그 분류에만 칸을 그린다', /PICK\.wants_category/.test(work));
check('서버가 wants_category 를 내려준다', /wants_category:\s*!!t\.wantsCategory/.test(api));

check('읽을 때 이름을 붙여 준다 (화면이 key 를 그대로 보여 주지 않게)',
  /category_ko:/.test(api) && /categorySpec\(r\.category\)/.test(api));
check('엑셀에 지출 항목·회계 계정 칸이 있다',
  /'지출 항목', '회계 계정'/.test(api) && /r\.category_ko \|\| ''/.test(api));
check('「지난번과 같이」가 항목을 물려준다 (매달 같은 돈이 매번 비지 않게)',
  /category: r\.category \|\| null/.test(api) && /if \(r\.category\) setVal\('f_cat'/.test(work));
check('보낼 때 실제로 실어 보낸다 (buildFD)',
  /fd\.append\('category', rec\.cat\)/.test(work));
check('초안에 항목이 함께 저장된다 (쓰다 만 것을 되살릴 때 안 날아가게)',
  /cat: getVal\('f_cat'\)/.test(work) && /setVal\('f_cat', d\.cat/.test(work));
check('다시 그릴 때 고른 항목이 안 날아간다 (keep)',
  /c: getVal\('f_cat'\)/.test(work) && /setVal\('f_cat', keep\.c\)/.test(work));
check('응답 모양이 바뀌었으니 ETag 를 올렸다 (옛 화면이 304 로 남지 않게)',
  /W\/"a5-/.test(api));

console.log('\n──────────────────────────────────────');
if (FAIL) {
  console.log(`  ❌ ${FAIL}건 실패 / ${PASS + FAIL}건`);
  for (const f of FAILS) console.log('     ' + f);
  console.log('  결재는 돈이 걸린 기능입니다. 위 항목을 고치세요.');
  process.exit(1);
}
console.log(`  ✅ ${PASS}건 전부 통과 — 고른 항목이 그대로 쌓입니다.`);
