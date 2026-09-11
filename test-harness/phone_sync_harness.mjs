// -*- coding: utf-8 -*-
// 📞 학부모·학생 전화번호 동기화 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/phone_sync_harness.mjs
//   대상:  cloudflare-deploy/src/cafe24-sync.ts  importCafe24Students()
//
//   이 파일이 지키는 것 —
//     2026-08-18 이전, D1 students_erp 29,398행 중 전화번호가 parent_phone 3개 · phone 9개
//     뿐이었다. 미납 안내도 결석 알림도 **아무에게도 닿지 않았다.** 원인이 둘이었다.
//       ① 야간 동기화 Cypher 가 전화번호를 아예 안 가져왔다.
//       ② INSERT OR REPLACE 의 컬럼 목록에 전화번호가 없었다.
//          INSERT OR REPLACE 는 «행을 지우고 다시 넣는» 것이라, 목록에 없는 칸은 NULL 이 된다.
//          → 누가 번호를 채워 넣어도 **그날 밤 동기화가 지웠다.**
//     그래서 전화번호를 목록에 넣는 것은 «추가» 이자 «지워지는 것을 멈추는» 일이다.
//     이 컬럼을 목록에서 다시 빼면 그 순간 전국 전화번호가 하룻밤에 사라진다.
//
//   검사 —
//     A. Cypher 가 학부모·학생 번호를 가져온다
//     B. INSERT 컬럼 목록에 전화번호 칸이 있다  ← 빠지면 야간에 전멸
//     C. 컬럼 수 = 물음표 수 = bind 인자 수 (어긋나면 값이 통째로 밀린다)
//     D. 실제로 함수를 돌려 본다 — 가짜 그래프 + 진짜 SQLite

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const txt = readFileSync(join(SRC, 'cafe24-sync.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (n, c, e) => { if (c) PASS++; else { FAIL++; FAILS.push(n + (e ? ` — ${e}` : '')); }
  console.log(`  ${c ? '✅' : '❌'} ${n}${c ? '' : (e ? ` — ${e}` : '')}`); };

// importCafe24Students 블록만 자른다
const bs = txt.indexOf('export async function importCafe24Students');
const be = txt.indexOf('export async function importCafe24Attendance', bs);
const blk = (bs >= 0 && be > bs) ? txt.slice(bs, be) : '';

console.log('\n📞 학부모·학생 전화번호 동기화');

console.log('\n  A. Cypher 가 번호를 가져온다');
check('importCafe24Students 를 찾았다', !!blk);
check('학부모 노드를 잇는다 (OPTIONAL MATCH (par:Parent))',
      /OPTIONAL MATCH \(par:Parent\)/.test(blk),
      '학부모 번호의 정본은 :Parent 노드다');
check('부모가 여럿이어도 하나만 취한다 (collect(...)[0])',
      /collect\(DISTINCT par\.phone\)\[0\]/.test(blk));
check('Parent 가 없으면 Student 속성으로 대체 (coalesce)',
      /coalesce\(parent_phone_g,\s*s\.parent_phone\)\s+AS\s+parent_phone/.test(blk));
check('학생 본인 번호도 가져온다 (s.student_phone)',
      /s\.student_phone\s+AS\s+student_phone/.test(blk));

console.log('\n  B. INSERT 목록에 번호 칸이 있다 (빠지면 야간에 전멸)');
const insMatch = blk.match(/INSERT OR REPLACE INTO students_erp \(([^)]*)\)\s*\n?\s*VALUES \(([^)]*)\)/);
check('INSERT 문을 찾았다', !!insMatch);
const cols = insMatch ? insMatch[1].split(',').map(s => s.trim()) : [];
const qs   = insMatch ? insMatch[2].split(',').map(s => s.trim()) : [];
for (const c of ['parent_phone', 'student_phone', 'phone']) {
  check(`컬럼 목록에 ${c} 가 있다`, cols.includes(c),
        '이 칸이 빠지면 INSERT OR REPLACE 가 매일 밤 NULL 로 덮는다');
}

console.log('\n  C. 컬럼 수 = ? 수 = bind 인자 수');
check(`컬럼 ${cols.length}개 = 물음표 ${qs.length}개`, cols.length === qs.length,
      `${cols.length} vs ${qs.length}`);
const bindM = blk.match(/return ins\.bind\(([\s\S]*?)\);/);
let bindN = -1;
if (bindM) {
  let depth = 0, n = 1;
  for (const ch of bindM[1]) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; else if (ch === ',' && depth === 0) n++; }
  bindN = n;
}
check(`bind 인자 ${bindN}개 = 컬럼 ${cols.length}개`, bindN === cols.length,
      '어긋나면 값이 한 칸씩 밀려 엉뚱한 자리에 들어간다');

console.log('\n  D. 실제로 돌려 본다 (가짜 그래프 + 진짜 SQLite)');
let tmp;
try {
  tmp = mkdtempSync(join(tmpdir(), 'phsync-'));
  /* cafe24-sync.ts 를 «있는 그대로» 불러온다 — 로직을 하니스가 베껴 쓰면
     운영 코드가 바뀌어도 하니스는 옛 로직으로 통과해 버린다.
     Neo4j 로 나가는 runCypher 만 껍데기로 바꾼 사본을 임시로 만든다(node 가 타입을 벗겨 준다). */
  writeFileSync(join(tmp, 'teacher-match.ts'), `
export async function runCypher(env: any, q: string, params: any): Promise<any> {
  const G = (globalThis as any).__PHGRAPH;
  const wp = /OPTIONAL MATCH \\(par:Parent\\)/.test(q);
  const ws = /s\\.student_phone/.test(q);
  const fields = ['user_id','korean_name','grade','school','status','signup_date','end_date','shop_name','franchise','hq_name','points'];
  if (wp) fields.push('parent_phone');
  if (ws) fields.push('student_phone');
  const off = params.off || 0, lim = params.lim || 1000;
  const values = G.students.slice(off, off + lim).map((s: any) => {
    const r: any[] = [s.user_id, s.name, null, null, 'active', null, null, s.shop_name ?? null, null, null, 0];
    if (wp) r.push(G.parentPhones[s.user_id] ?? s.parent_phone ?? null);
    if (ws) r.push(s.student_phone ?? null);
    return r;
  });
  return { fields, values };
}
`);
  /* 🧹 (2026-08-20) student-override.ts 는 «진짜 파일 그대로» 넣는다.
     이유는 위 teacher-match 와 정반대다 — 껍데기로 바꾸면 「동기화가 이름을 덮은 뒤
     우리 지정을 다시 입히는가」를 검사할 수 없다. 그게 이 모듈의 존재 이유다.
     Neo4j 로 나가지 않는 순수 D1 코드라 그대로 돌려도 된다. */
  writeFileSync(join(tmp, 'student-override.ts'), readFileSync(join(SRC, 'student-override.ts'), 'utf8'));
  // 확장자 없는 상대 import 는 node 가 못 찾는다 — 사본에서만 .ts 를 붙인다
  writeFileSync(join(tmp, 'cafe24-sync.ts'), txt
    .replace(/from '\.\/teacher-match'/, "from './teacher-match.ts'")
    .replace(/from '\.\/student-override'/, "from './student-override.ts'"));
  const M = await import(pathToFileURL(join(tmp, 'cafe24-sync.ts')).href);

  const sq = new DatabaseSync(':memory:');
  /* 🧷 (2026-09-11) 개인정보 칸을 실제 운영과 같게 붙여 둔다 — 야간 동기화의 INSERT OR REPLACE
     컬럼 목록에 «없는» 칸들이다. 즉 아래 검사는 「목록에 없는 칸이 NULL 이 되는가」를 재현한다. */
  sq.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, student_id TEXT, login_id TEXT,
    username TEXT, korean_name TEXT, grade TEXT, school TEXT, status TEXT, signup_date TEXT,
    end_date TEXT, shop_name TEXT, franchise TEXT, hq_name TEXT, points INTEGER,
    parent_phone TEXT, student_phone TEXT, phone TEXT, created_at INTEGER, updated_at INTEGER,
    teacher_phone TEXT, kakao_id TEXT, parent_kakao_id TEXT, birth_date TEXT,
    address TEXT, notes TEXT, password_hash TEXT)`);
  /* ⚠️ first() 도 흉내 내야 한다 — ensureStudentOverrideTable 이 「address 칸이 있나」를
     그걸로 탐침한다. 없으면 TypeError 가 나고, 그 catch 가 «칸 없음» 으로 읽어 ALTER 를 돌린다.
     즉 빼먹어도 통과하지만, 그러면 «탐침이 도는지» 를 검사하지 못한다. */
  const DB = {
    exec: async (s) => { try { sq.exec(s); } catch {} },
    prepare: (sql) => { const mk = (b) => ({ sql, _b: b, bind: (...a) => mk(a),
        run: async () => { sq.prepare(sql).run(...b); return { success: true }; },
        first: async () => { const st = sq.prepare(sql); return st.get(...b) ?? null; } }); return mk([]); },
    batch: async (st) => { for (const s of st) sq.prepare(s.sql).run(...s._b); },
  };
  globalThis.__PHGRAPH = {
    students: [
      { user_id:'s1', name:'김민준', shop_name:'강남점' },
      { user_id:'s2', name:'이서연', shop_name:'서초점' },
      { user_id:'s4', name:'최하늘', shop_name:'강남점', parent_phone:'010-9999-0000' },
      { user_id:'s5', name:'정예은', shop_name:'강남점', student_phone:'010-5555-6666' },
      // 🧹 이름 덮어쓰기 대상 — 카페24는 'jeong' 을 주는데 우리는 '정우영' 으로 보여야 한다
      { user_id:'s6', name:'jeong', shop_name:'강남점' },
      // 🧷 개인정보 지키기 대상 — 카페24는 학교만 주고 주소·생일·메모는 주지 않는다
      { user_id:'s7', name:'박서준', shop_name:'강남점', school:'카페24초' },
    ],
    parentPhones: { s1:'010-1111-2222', s2:'   ' },
  };
  /* 🧹 지정을 미리 넣어 둔다. 동기화가 s6 의 이름을 'jeong' 으로 덮어쓴 «뒤»
     applyStudentErpOverrides 가 '정우영' 으로 되돌리는지가 아래 검사의 핵심이다. */
  /* ⚠️ 일부러 «옛 스키마» 로 만든다(개인정보 칸 없음) — 이미 운영에 있는 표가 이 모양이다.
     ensureStudentOverrideTable 이 ALTER 로 칸을 붙이는지까지 여기서 함께 확인된다. */
  sq.exec(`CREATE TABLE IF NOT EXISTS student_erp_override (user_id TEXT PRIMARY KEY, korean_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER)`);
  sq.exec(`INSERT INTO student_erp_override (user_id, korean_name, hidden, created_at) VALUES ('s6','정우영',0,1)`);
  /* 🧷 s7 — 관리자가 「연락처·정보」 탭에서 고친 학생. 카페24는 이 값들을 아예 주지 않는다.
     칸을 붙이는 것은 위 ALTER 가 하므로, 지정 넣기는 동기화 «전» 에 할 수 없다 → 아래에서 넣는다. */
  let off = 0; for (;;) { const r = await M.importCafe24Students({ DB }, off, 2); if (r.done) break; off += 2; }
  const g = (u,c) => sq.prepare(`SELECT ${c} v FROM students_erp WHERE user_id=?`).get(u)?.v;

  check('학부모 번호가 실제로 들어간다', g('s1','parent_phone') === '010-1111-2222', String(g('s1','parent_phone')));
  check('공백만 있는 번호는 NULL 로 정리된다', g('s2','parent_phone') === null, JSON.stringify(g('s2','parent_phone')));
  check('Parent 가 없으면 Student 속성으로 대체된다', g('s4','parent_phone') === '010-9999-0000', String(g('s4','parent_phone')));
  check('학생 번호가 student_phone·phone 양쪽에 들어간다',
        g('s5','student_phone') === '010-5555-6666' && g('s5','phone') === '010-5555-6666');
  check('기존 칸(소속)이 함께 유지된다', g('s1','shop_name') === '강남점', String(g('s1','shop_name')));
  /* 🧹 (2026-08-20) 「동기화 뒤에 우리 지정을 다시 입힌다」 — 순서가 뒤집히면 여기서 걸린다.
     applyStudentErpOverrides 호출을 지우거나 INSERT 앞으로 옮기면 'jeong' 이 그대로 남는다. */
  check('지정한 이름이 동기화 뒤에 다시 입혀진다 (korean_name)',
        g('s6','korean_name') === '정우영', String(g('s6','korean_name')));
  check('지정한 이름이 username 에도 함께 입혀진다',
        g('s6','username') === '정우영', String(g('s6','username')));
  check('지정이 없는 학생의 이름은 카페24 값 그대로다',
        g('s1','korean_name') === '김민준', String(g('s1','korean_name')));

  // 야간 동기화가 매일 도는 상황 — 두 번 돌려도 지워지면 안 된다
  off = 0; for (;;) { const r = await M.importCafe24Students({ DB }, off, 2); if (r.done) break; off += 2; }
  check('다시 동기화해도 번호가 남아 있다 (야간 재실행)', g('s1','parent_phone') === '010-1111-2222',
        '재실행에서 지워지면 매일 밤 전멸한다');

  /* ═══ 🧷 E절 — 관리자가 고친 개인정보가 다음 날에도 남는가 (2026-09-11) ═══════════
     [무엇을 재현하나] 관리자가 「연락처·정보」 탭에서 주소·생일·메모·비밀번호를 넣고 저장하면
       ① students_erp 에 바로 들어가고(오늘 화면) ② student_erp_override 에도 한 벌 적힌다(내일).
     그 ②가 없으면 오늘 밤 INSERT OR REPLACE 가 «컬럼 목록에 없는 칸» 을 전부 NULL 로 만든다.
     2026-08-18 에 전화번호가 그렇게 전멸했고, 나머지 칸은 그때 안 고쳐져 계속 사라지고 있었다.
     ⚠️ 이 검사가 FAIL 이면 「주소를 넣고 다음 날 열면 비어 있다」가 그대로 돌아온 것이다. */
  const OV = await import(pathToFileURL(join(tmp, 'student-override.ts')).href);
  const pinned = {
    address: '경기 안양시 동안구 …', birth_date: '2014-03-11',
    notes: '수·금 저녁반', kakao_id: 'seojun_k', password_hash: 'deadbeef',
    school: '사람이고친초', student_phone: '010-7777-8888',
  };
  // 관리자 저장이 하는 일 그대로 — students_erp 에 넣고, 지켜지는 표에도 적는다
  sq.prepare(`UPDATE students_erp SET address=?, birth_date=?, notes=?, kakao_id=?, password_hash=?, school=?, student_phone=? WHERE user_id='s7'`)
    .run(pinned.address, pinned.birth_date, pinned.notes, pinned.kakao_id, pinned.password_hash, pinned.school, pinned.student_phone);
  const wrote = await OV.rememberStudentOverrides({ DB }, 's7', { ...pinned, shop_name: '내가고친점', franchise: '내가고친가맹' });

  check('지켜지는 칸만 적힌다 (대리점·지사는 일부러 제외)', wrote === 7, '적힌 칸 수 ' + wrote);
  check('저장 직후에는 화면에 그대로 보인다', g('s7','address') === pinned.address, String(g('s7','address')));

  // 🌙 오늘 밤 03:00 — 카페24 동기화가 통째로 돈다
  off = 0; for (;;) { const r = await M.importCafe24Students({ DB }, off, 2); if (r.done) break; off += 2; }

  check('주소가 다음 날에도 남아 있다', g('s7','address') === pinned.address,
        '카페24가 안 주는 칸이라 예전에는 NULL 이 됐다 — 지금 값: ' + JSON.stringify(g('s7','address')));
  check('생년월일이 남아 있다',   g('s7','birth_date') === pinned.birth_date, String(g('s7','birth_date')));
  check('특이사항이 남아 있다',   g('s7','notes') === pinned.notes, String(g('s7','notes')));
  check('카톡 ID 가 남아 있다',   g('s7','kakao_id') === pinned.kakao_id, String(g('s7','kakao_id')));
  check('비밀번호가 남아 있다 (없으면 다음 날 로그인이 안 된다)',
        g('s7','password_hash') === pinned.password_hash, String(g('s7','password_hash')));
  check('사람이 고친 학교가 카페24 값을 이긴다',
        g('s7','school') === '사람이고친초', '카페24 값(카페24초)으로 돌아갔다: ' + String(g('s7','school')));
  check('사람이 고친 전화번호가 남아 있다',
        g('s7','student_phone') === pinned.student_phone, String(g('s7','student_phone')));
  /* ⛔ 여기가 뒤집히면 정산 사고다 — 소속을 고정하면 학생이 옮겨가도 수수료가 옛 대리점으로 간다. */
  check('대리점은 «지키지 않는다» — 카페24 값으로 돌아간다',
        g('s7','shop_name') === '강남점', '소속을 고정하면 정산이 엉뚱한 곳으로 간다: ' + String(g('s7','shop_name')));
  // 지정이 없는 학생이 덩달아 덮이지 않는가 (COALESCE 가 칸마다 따로 판단하는지)
  check('지정이 없는 학생은 아무것도 안 바뀐다',
        g('s1','school') == null && g('s1','parent_phone') === '010-1111-2222', String(g('s1','school')));
  check('이름 지정은 그대로 함께 동작한다 (기존 기능 회귀)',
        g('s6','korean_name') === '정우영', String(g('s6','korean_name')));
} catch (e) {
  check('실제 실행 검사', false, e?.message);
} finally {
  if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
