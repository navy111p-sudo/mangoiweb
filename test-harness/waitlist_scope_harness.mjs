// -*- coding: utf-8 -*-
// 🪑 대기자 명단 지사·대리점 격리 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/waitlist_scope_harness.mjs
//   대상:  cloudflare-deploy/src/api-admin.ts  (GET/POST /api/admin/stats/waitlist)
//
//   무엇을 지키나 —
//     대기자 명단(class_waitlist, 2026-08-04 신설)에는 **스코프 필터가 없었다.**
//     '/api/admin/stats/' 는 지사·대리점에게 열려 있는 접두사라, 강남점 원장님이
//     서초점·부산지사 대기자의 **이름과 전화번호까지** 그대로 봤다.
//     (2026-08-17 수리. 연기·변경 요청을 막고 나서 이것만 남아 있던 것을 발견)
//
//     이 표에는 소속 칸이 아예 없어서 shop_name·franchise 두 칸을 새로 만들고
//     공용 scopeStudentCond() 로 거른다. 그 격리가 사라지지 않는지 본다.
//
//   검사 —
//     A. 목록(GET)   — 대리점·지사·지사본사는 자기 것만, 본사는 전부
//     B. 처리(POST)  — id 만 바꿔 넣어 남의 대기자를 취소할 수 없다(403)
//     C. 개수(counts)— 목록과 같은 조건. «목록 3명인데 대기 40명» 이면 그 자체가 누설이다
//     D. 옛 행       — 소속 칸이 빈 옛 자료는 «막는 쪽으로» 안 보이되,
//                      내가 넣은 것(created_by)은 계속 보인다
//     E. D1 한도     — 지사본사(지사 다수)에서도 바인드 100개를 안 넘는다
//     F. 회귀 감시   — api-admin.ts 의 waitlist 블록에서 격리가 빠지면 잡는다

import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/* scope.ts 를 «있는 그대로» 불러온다 — 격리 규칙을 하니스가 베껴 쓰면
   운영 코드가 바뀌어도 하니스는 옛 규칙으로 통과해 버린다.
   scope.ts 는 auth-admin 을 부르지만 여기서 쓰는 scopeStudentCond 는 순수 함수라,
   그 import 만 껍데기로 바꾼 사본을 임시로 만들어 불러온다. */
let scopeStudentCond, tmp;
try {
  tmp = mkdtempSync(join(tmpdir(), 'wlscope-'));
  const srcTxt = readFileSync(join(SRC, 'scope.ts'), 'utf8')
    .replace(/^import\s*\{[^}]*\}\s*from\s*'\.\/auth-admin';?\s*$/m,
             `const checkAdminSession: any = async () => ({ ok: false });`)
    .replace(/from\s*'\.\/d1-chunk'/g, `from ${JSON.stringify(pathToFileURL(join(SRC, 'd1-chunk.ts')).href)}`);
  const f = join(tmp, 'scope.ts');
  writeFileSync(f, srcTxt);
  ({ scopeStudentCond } = await import(pathToFileURL(f).href));
} catch (e) {
  console.log('  ❌ scope.ts 를 불러오지 못했습니다 —', e?.message);
  process.exit(1);
} finally {
  if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { } }
}

/* ── api-admin.ts 의 조립을 그대로 재현 ──
   ⚠️ 여기서 만드는 cond/binds 는 api-admin.ts 의 _wlCond/_wlBinds 와 같은 모양이어야 한다.
      아래 F(회귀 감시)가 그 «같음» 을 소스에서 다시 확인한다. */
function build(scope, actorName, status = 'waiting') {
  const c = scopeStudentCond(scope);
  const cond  = c.cond ? `(${c.cond} OR created_by = ?)` : '';
  const binds = c.cond ? [...c.binds, actorName] : [];
  const wc = [], wb = [];
  if (status !== 'all') { wc.push('status = ?'); wb.push(status); }
  if (cond) { wc.push(cond); wb.push(...binds); }
  return {
    sql: `SELECT id FROM class_waitlist ${wc.length ? 'WHERE ' + wc.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 300`,
    binds: wb, cond, condBinds: binds,
  };
}
const S = (type, value) => ({ type, value, label: '' });

const COLS = `id INTEGER PRIMARY KEY, student_name TEXT, phone TEXT, uid TEXT, status TEXT,
              created_at INTEGER, created_by TEXT, shop_name TEXT, franchise TEXT,
              resolved_at INTEGER, resolved_by TEXT`;
//                                 강남·서초 = 서울지사 / 해운대 = 부산지사
const ROWS = [
  [1, '강남학생A',   '010-1111', 'u1', 'waiting', 1, '망고아이 강남 대리점',  '망고아이 강남 대리점',  '서울'],
  [2, '서초학생B',   '010-2222', 'u2', 'waiting', 2, '망고아이 서초 대리점',  '망고아이 서초 대리점',  '서울'],
  [3, '해운대C',     '010-3333', 'u3', 'waiting', 3, '망고아이 해운대 대리점', '망고아이 해운대 대리점', '부산'],
  [4, '본사가넣음',  '010-4444', 'u4', 'waiting', 4, '망고아이 본사',         null, null],  // 소속 없음
  [5, '옛행(강남)',  '010-5555', null, 'waiting', 5, '망고아이 강남 대리점',  null, null],  // 칸이 생기기 전 자료
];
function seed() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_waitlist(${COLS})`);
  for (const r of ROWS) {
    db.prepare(`INSERT INTO class_waitlist (id,student_name,phone,uid,status,created_at,created_by,shop_name,franchise)
                VALUES (?,?,?,?,?,?,?,?,?)`).run(...r);
  }
  return db;
}

//                라벨                    스코프                                 로그인 이름              보여야 할 id
const CASES = [
  ['본사 hq',              S('hq', null),                        '망고아이 본사',         [1, 2, 3, 4, 5]],
  ['강남 대리점',          S('agency', '망고아이 강남 대리점'),   '망고아이 강남 대리점',  [1, 5]],
  ['서초 대리점',          S('agency', '망고아이 서초 대리점'),   '망고아이 서초 대리점',  [2]],
  ['서울 지사',            S('branch', '서울'),                   '망고아이 서울 지사',    [1, 2]],
  ['부산 지사',            S('branch', '부산'),                   '망고아이 부산 지사',    [3]],
  ['지사본사(서울,부산)',  S('franchise', '서울,부산'),           '캐피타운',              [1, 2, 3]],
  ['내부직원 none',        S('none', null),                       '직원',                  [1, 2, 3, 4, 5]],
];

console.log('\n🪑 대기자 명단 지사·대리점 격리');

console.log('\n  A. 목록(GET) — 누가 무엇을 보나');
{
  const db = seed();
  for (const [label, scope, actor, want] of CASES) {
    const q = build(scope, actor);
    const got = db.prepare(q.sql).all(...q.binds).map(r => r.id);
    const exp = [...want].sort((a, b) => b - a);
    check(`${label} → [${exp}]`, JSON.stringify(got) === JSON.stringify(exp), `실제 [${got}]`);
  }
}

console.log('\n  B. 처리(POST resolve/cancel) — id 만 알면 남의 것을 취소할 수 있나');
//                라벨                                스코프                                로그인 이름             id  바뀌어야?
for (const [label, scope, actor, id, ok] of [
  ['강남 원장 → 서초 대기자(2) 취소',  S('agency', '망고아이 강남 대리점'), '망고아이 강남 대리점', 2, false],
  ['강남 원장 → 자기 대기자(1) 취소',  S('agency', '망고아이 강남 대리점'), '망고아이 강남 대리점', 1, true],
  ['강남 원장 → 옛 자기 행(5) 취소',   S('agency', '망고아이 강남 대리점'), '망고아이 강남 대리점', 5, true],
  ['서울 지사 → 부산 대기자(3) 취소',  S('branch', '서울'),                 '망고아이 서울 지사',   3, false],
  ['본사 → 아무거나(3) 취소',          S('hq', null),                       '망고아이 본사',        3, true],
]) {
  const db = seed();
  const q = build(scope, actor);
  const res = db.prepare(`UPDATE class_waitlist SET status=?, resolved_at=?, resolved_by=? WHERE id=?`
                         + (q.cond ? ` AND ${q.cond}` : ''))
                .run('cancelled', 9, actor, id, ...q.condBinds);
  const changed = Number(res.changes) > 0;
  check(`${label} → ${ok ? '바뀜' : '막힘(403)'}`, changed === ok, changed ? '바뀜' : '막힘');
}

console.log('\n  C. 개수(counts) 도 목록과 같은 조건인가');
{
  const db = seed();
  for (const [label, scope, actor, want] of CASES) {
    const c = scopeStudentCond(scope);
    const cond = c.cond ? `(${c.cond} OR created_by = ?)` : '';
    const binds = c.cond ? [...c.binds, actor] : [];
    const n = db.prepare(`SELECT COUNT(*) n FROM class_waitlist ${cond ? 'WHERE ' + cond : ''}`).get(...binds).n;
    check(`${label} → ${want.length}명`, n === want.length, `실제 ${n}명`);
  }
}

console.log('\n  D. 옛 행(소속 칸이 빈 자료) — 막되, 내가 넣은 것은 안 잃는다');
{
  const db = seed();
  const gangnam = build(S('agency', '망고아이 강남 대리점'), '망고아이 강남 대리점');
  const seen = db.prepare(gangnam.sql).all(...gangnam.binds).map(r => r.id);
  check('강남 원장이 넣은 옛 행(5)은 계속 보인다', seen.includes(5));
  check('본사가 넣은 옛 행(4)은 강남 원장에게 안 보인다', !seen.includes(4));
  const seocho = build(S('agency', '망고아이 서초 대리점'), '망고아이 서초 대리점');
  const seen2 = db.prepare(seocho.sql).all(...seocho.binds).map(r => r.id);
  check('남의 옛 행(5)은 서초 원장에게 안 보인다', !seen2.includes(5));
}

console.log('\n  E. D1 바인드 100개 한도 — 지사가 늘어도 조용히 빈 결과가 되지 않는다');
{
  const db = seed();
  for (const n of [10, 80, 200]) {
    const list = Array.from({ length: n }, (_, i) => '지사' + i).join(',');
    const q = build(S('franchise', list), '캐피타운');
    let ran = true;
    try { db.prepare(q.sql).all(...q.binds); } catch { ran = false; }
    check(`지사 ${n}개 → 바인드 ${q.binds.length}개 (≤100) · 실행됨`, q.binds.length <= 100 && ran);
  }
}

console.log('\n  F. 회귀 감시 — api-admin.ts 에서 격리가 빠지면 잡는다');
{
  const txt = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const i = txt.indexOf(`'/api/admin/stats/waitlist'`);
  // 블록 끝 = 다음 라우트 시작. 넉넉히 뒤까지 보되 파일 끝을 넘지 않는다.
  const blk = i < 0 ? '' : txt.slice(i, i + 9000);
  check('waitlist 라우트를 찾았다', i >= 0);
  check('스코프를 읽는다 (getScope + scopeStudentCond)',
        /getScope\s*\(/.test(blk) && /scopeStudentCond\s*\(/.test(blk));
  check('소속 칸이 있다 (shop_name · franchise)',
        /ADD COLUMN shop_name/.test(blk) && /ADD COLUMN franchise/.test(blk));
  /* ⚠️ «_wlCond 를 세 곳에서 쓴다» 만 보면 안 된다 — 정의를 `const _wlCond = ''` 로
        비워도 쓰는 곳은 그대로라 그대로 통과한다(이 하니스를 만들 때 실제로 놓쳤다).
        **조건이 스코프에서 나오는지** 를 정의 자리에서 확인한다. */
  check('조건이 스코프에서 나온다 (_wlCond ← _wlC.cond)',
        /const\s+_wlCond\s*=\s*_wlC\.cond\s*\?/.test(blk),
        '_wlCond 정의가 _wlC.cond 로 시작하지 않음 — 격리가 비워졌을 수 있다');
  check('바인드도 스코프에서 나온다 (_wlBinds ← _wlC.binds)',
        /const\s+_wlBinds\s*=\s*_wlC\.cond\s*\?[\s\S]{0,80}_wlC\.binds/.test(blk));
  check('목록·개수·처리가 같은 조건을 쓴다 (_wlCond 한 벌)',
        (blk.match(/_wlCond/g) || []).length >= 5,
        `_wlCond 등장 ${(blk.match(/_wlCond/g) || []).length}회 (정의 + 목록·개수·UPDATE)`);
  check('넣을 때 소속을 찍는다 (INSERT 에 shop_name, franchise)',
        /INSERT INTO class_waitlist[\s\S]{0,400}shop_name,\s*franchise/.test(blk));
  check('남의 것을 처리하면 403 으로 막는다',
        /forbidden_scope/.test(blk) && /meta\?\.changes/.test(blk));
  check('SELECT \\* 에 스코프 없는 옛 쿼리가 남아 있지 않다',
        !/SELECT \* FROM class_waitlist \$\{status === 'all' \? '' : 'WHERE status = \?'\}/.test(blk));
}

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
