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
const insMatch = blk.match(/INSERT INTO students_erp \(([^)]*)\)\s*\n?\s*VALUES \(([^)]*)\)/);
check('INSERT 문을 찾았다', !!insMatch);
/* 🔁 (2026-08-28) 계약이 바뀌었다 — INSERT OR REPLACE → «카페24 칸만 덮는» UPSERT.
   REPLACE 는 «행을 지우고 다시 넣는» 것이라 컬럼 목록에 없는 25개 칸이 매일 밤 NULL 이 됐다.
   전화번호가 그렇게 전멸했던 것이 2026-08-18 건이고, password_hash·parent_user_id·eval_band 는
   그 상태로 남아 있었다(2026-08-28 실측 0건 — 그래서 학생 비밀번호를 도입할 수 없었다).
   ⛔ 옛 형태로 되돌리지 말 것. D절이 «두 번 돌린 뒤에도 남아 있는가» 로 실제로 잡는다. */
/* 부정 검사는 주석을 벗겨 낸 사본으로 — 설명 주석에 그 문장을 인용하는 순간 자기 주석을 잡는다
   (CLAUDE.md 2장 등재 함정. 지금 안 걸리는 건 주석이 'INTO students_erp' 를 안 붙였기 때문일 뿐이다) */
const blkNC = blk.replace(/\/\*[\s\S]*?\*\//g, ' ').split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join(' ');
check('⛔ INSERT OR REPLACE 로 되돌아가지 않았다', !blkNC.includes('INSERT OR REPLACE INTO students_erp'),
      'REPLACE 는 컬럼 목록 밖의 칸을 매일 밤 NULL 로 만든다 — franchises 는 2026-08-14 에 이미 UPSERT 로 바꿨다');
check('ON CONFLICT(user_id) DO UPDATE 로 카페24 칸만 덮는다', blk.includes('ON CONFLICT(user_id) DO UPDATE SET'),
      '이것이 없으면 위 INSERT 가 중복 키에서 그냥 실패한다');
{
  /* «덮어쓰기 목록» 만 잘라서 본다 — 정규식 이스케이프에 기대지 않고 문자열로 자른다. */
  const _si = blk.indexOf('DO UPDATE SET');
  const setBlk = _si < 0 ? '' : blk.slice(_si, blk.indexOf('\`)', _si) + 1);
  check('덮어쓰기 목록을 실제로 잘라 냈다', setBlk.length > 0,
        '못 자르면 아래 4건이 «빈 문자열» 을 검사해 전부 헛통과한다');
  check('⛔ created_at 은 갱신하지 않는다', !setBlk.includes('created_at = excluded'),
        'created_at 은 «카페24가 정본» 표식이라, 로컬 행(체험계정 lt*)을 동기화가 자기 것으로 바꾸면 안 된다');
  for (const c of ['password_hash', 'parent_user_id', 'eval_band']) {
    check(c + ' 는 덮어쓰기 목록에 없다', !setBlk.includes(c + ' ='),
          '이 칸은 카페24가 아니라 우리 코드가 쓰는 값이다 — 덮으면 보존이 무의미해진다');
  }
}
const cols = insMatch ? insMatch[1].split(',').map(s => s.trim()) : [];
const qs   = insMatch ? insMatch[2].split(',').map(s => s.trim()) : [];
/* 🔁 이번 버그의 «거울상» 을 막는다 — 카페24 칸을 INSERT 목록에만 더하면
   새 행에는 들어가는데 기존 29,000행은 영영 갱신되지 않고 **에러도 안 난다**.
   (전화번호가 목록에서 빠져 전멸했던 사고의 정확한 반대 방향) */
{
  const _s2 = blk.indexOf('DO UPDATE SET');
  const _set2 = _s2 < 0 ? '' : blk.slice(_s2, blk.indexOf('`)', _s2) + 1);
  // 머리말 'DO UPDATE SET' 을 떼지 않으면 첫 칸이 늘 «누락» 으로 읽힌다(검사기 자신의 함정)
  const setCols = _set2.replace('DO UPDATE SET', '').split(',').map((t) => (t.split('=')[0] || '').trim()).filter((t) => /^[a-z_]+$/.test(t));
  const want = cols.filter((c) => c !== 'user_id' && c !== 'created_at');
  const missing = want.filter((c) => !setCols.includes(c));
  check('덮어쓰기 목록이 INSERT 목록과 짝이다 (user_id·created_at 제외)', missing.length === 0,
        '갱신에서 빠진 칸: ' + missing.join(', ') + ' — 새 행에만 들어가고 기존 행은 영영 옛 값이다');
}
for (const c of ['parent_phone', 'student_phone', 'phone']) {
  check(`컬럼 목록에 ${c} 가 있다`, cols.includes(c),
        '이 칸이 빠지면 야간 동기화가 번호를 NULL 로 덮는다');
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
  /* ⚠️ (2026-09-01) student-override.ts 가 d1-chunk 를 «정적으로» 가져온다(loadHiddenStudents).
       그 의존까지 같이 복사하고 상대 import 에 확장자를 붙이지 않으면 여기서 모듈을 못 찾는다. */
  writeFileSync(join(tmp, 'd1-chunk.ts'), readFileSync(join(SRC, 'd1-chunk.ts'), 'utf8'));
  writeFileSync(join(tmp, 'student-override.ts'),
    readFileSync(join(SRC, 'student-override.ts'), 'utf8')
      .replace(/from '\.\/d1-chunk'/, "from './d1-chunk.ts'"));
  // 확장자 없는 상대 import 는 node 가 못 찾는다 — 사본에서만 .ts 를 붙인다
  writeFileSync(join(tmp, 'cafe24-sync.ts'), txt
    .replace(/from '\.\/teacher-match'/, "from './teacher-match.ts'")
    .replace(/from '\.\/student-override'/, "from './student-override.ts'"));
  const M = await import(pathToFileURL(join(tmp, 'cafe24-sync.ts')).href);

  const sq = new DatabaseSync(':memory:');
  sq.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, student_id TEXT, login_id TEXT,
    username TEXT, korean_name TEXT, grade TEXT, school TEXT, status TEXT, signup_date TEXT,
    end_date TEXT, shop_name TEXT, franchise TEXT, hq_name TEXT, points INTEGER,
    parent_phone TEXT, student_phone TEXT, phone TEXT, created_at INTEGER, updated_at INTEGER,
    password_hash TEXT, parent_user_id TEXT, eval_band TEXT, last_login_at INTEGER)`);
  const DB = {
    exec: async (s) => { try { sq.exec(s); } catch {} },
    prepare: (sql) => { const mk = (b) => ({ sql, _b: b, bind: (...a) => mk(a),
        run: async () => { sq.prepare(sql).run(...b); return { success: true }; } }); return mk([]); },
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
      /* 📞 (2026-09-15) 번호 «한 칸만» 찬 학생 — 야간 DELETE 보존이 칸마다 따로 필요하다.
         실제 데이터가 그렇다: createTrialStudent(leveltest-schedule.ts)는 `phone` 하나만 넣고
         (이 수리의 동기로 인용된 lt15·lt16·lt18 이 그 모양), 자가가입(api-students.ts)은
         parent_phone+phone 만 넣는다(student_phone 없음). 세 칸이 다 찬 행만 시험하면
         보존 조건을 «한 줄씩» 지우는 변이를 원리상 못 잡는다(실측으로 밟았다). */
      { user_id:'s7', name:'한부모', shop_name:'강남점' },
      { user_id:'s8', name:'한학생', shop_name:'강남점' },
      { user_id:'s9', name:'한번호', shop_name:'강남점' },
    ],
    parentPhones: { s1:'010-1111-2222', s2:'   ' },
  };
  /* 🧹 지정을 미리 넣어 둔다. 동기화가 s6 의 이름을 'jeong' 으로 덮어쓴 «뒤»
     applyStudentErpOverrides 가 '정우영' 으로 되돌리는지가 아래 검사의 핵심이다. */
  sq.exec(`CREATE TABLE IF NOT EXISTS student_erp_override (user_id TEXT PRIMARY KEY, korean_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER)`);
  sq.exec(`INSERT INTO student_erp_override (user_id, korean_name, hidden, created_at) VALUES ('s6','정우영',0,1)`);
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

  /* 🔒 (2026-08-28) «우리가 D1 에서만 관리하는 값» 이 야간 동기화에서 살아남는가.
     [왜 검사하나] 이 임포트는 카페24 학생 전원을 지우고 다시 넣는다. 컬럼 목록에 없는 칸은
        그때 전부 사라진다 — 전화번호가 그렇게 전멸했던 것이 2026-08-18 건이고,
        password_hash·parent_user_id·eval_band 는 아직 그 상태였다(2026-08-28 실측 0건).
        즉 학생이 비밀번호를 정해도 그날 밤 사라져서 «학생 비밀번호» 를 도입할 수 없었다.
     [문자열로는 못 잡는다] INSERT OR REPLACE 로 되돌려도 코드는 «있고» 값도 맞다.
        틀리는 것은 «다시 돌린 뒤에 남아 있는가» 뿐이라 실제로 두 번 돌려서 본다. */
  sq.prepare(`UPDATE students_erp SET password_hash=?, parent_user_id=?, eval_band=?, last_login_at=? WHERE user_id='s1'`)
    .run('HASH_KEEP_ME', 'parent_s1', 'band3', 1700000000000);

  /* 📞 (2026-09-15) **우리가 화면에서 넣은 번호가 야간 동기화를 넘기는가.**
     [왜 검사하나] 카페24 원본의 번호 칸은 비어 있다(실측 29,485행 네 칸 전부 0건). 그런데
        UPSERT 가 `parent_phone = excluded.parent_phone` 로 **무조건** 덮고 있어서, 우리가 넣은
        번호가 그날 밤 빈 값으로 되돌아갔다 — 에러 없이 「그냥 사라진」 것처럼만 보인다.
     [문자열로는 못 잡는다] SET 절도 «있고» 칸 이름도 맞다. 틀리는 것은 «다시 돌린 뒤 남아 있는가»
        뿐이라 실제로 넣고 두 번 돌려서 본다.
     ⚠️ s2 는 카페24가 «공백» 을 주는 학생이다 — 그래서 이 시나리오가 성립한다.
        s1 은 반대로 카페24가 번호를 주는 학생이라 «갱신이 계속 오는가» 의 짝 검사가 된다. */
  sq.prepare(`UPDATE students_erp SET parent_phone=?, student_phone=?, phone=? WHERE user_id='s2'`)
    .run('010-7777-8888', '010-3333-4444', '010-3333-4444');
  /* 📞 «한 칸만» 찬 셋 — 보존 조건의 세 줄이 각각 일하는지는 이 셋으로만 드러난다. */
  sq.prepare(`UPDATE students_erp SET parent_phone=?  WHERE user_id='s7'`).run('010-1010-1010');
  sq.prepare(`UPDATE students_erp SET student_phone=? WHERE user_id='s8'`).run('010-2020-2020');
  sq.prepare(`UPDATE students_erp SET phone=?         WHERE user_id='s9'`).run('010-3030-3030');
  /* 🔗 짝 검사용 — 카페24가 «값을 주는» 학생(s4)의 번호를 임의로 바꿔 둔다.
     ⚠️ s1 에 하면 안 된다: 바로 위 「다시 동기화해도 번호가 남아 있다」가 s1 을 보는데,
        그 검사의 뜻이 «카페24가 덮어썼다» 로 조용히 바뀌어 원래 재던 것을 안 재게 된다. */
  sq.prepare(`UPDATE students_erp SET parent_phone=? WHERE user_id='s4'`).run('010-0000-0000');

  // 야간 동기화가 매일 도는 상황 — 두 번 돌려도 지워지면 안 된다
  off = 0; for (;;) { const r = await M.importCafe24Students({ DB }, off, 2); if (r.done) break; off += 2; }
  check('다시 동기화해도 번호가 남아 있다 (야간 재실행)', g('s1','parent_phone') === '010-1111-2222',
        '재실행에서 지워지면 매일 밤 전멸한다');
  check('야간 동기화가 학생 비밀번호를 지우지 않는다',
        g('s1','password_hash') === 'HASH_KEEP_ME', '지워지면 학생이 정한 비밀번호가 하룻밤이면 사라진다');
  check('야간 동기화가 학부모 연결을 지우지 않는다',
        g('s1','parent_user_id') === 'parent_s1', '지워지면 학부모가 자녀 화면을 영영 못 본다');
  check('야간 동기화가 수업평가 밴드를 지우지 않는다',
        g('s1','eval_band') === 'band3', '지워지면 강사가 정한 밴드가 매일 밤 초기화된다');
  check('그래도 카페24 값은 계속 덮어쓴다 (동기화가 죽으면 안 된다)',
        g('s1','shop_name') === '강남점' && g('s1','korean_name') === '김민준',
        '보존을 넣느라 카페24 갱신이 멈추면 그것대로 사고다');

  /* 📞 우리가 넣은 번호 — 카페24가 «빈 값» 을 주는 학생(s2). 여기가 이번 수리의 본체다.
     DELETE 보존을 빼면 행이 통째로 지워져 새 INSERT 로 들어오고, COALESCE 를 빼면 행은 남되
     SET 이 NULL 로 덮는다. **두 경로 어느 쪽을 되돌려도 이 세 줄이 FAIL 난다.** */
  check('야간 동기화가 우리가 넣은 학부모 번호를 지우지 않는다',
        g('s2','parent_phone') === '010-7777-8888', String(g('s2','parent_phone')));
  check('야간 동기화가 우리가 넣은 학생 번호를 지우지 않는다 (student_phone)',
        g('s2','student_phone') === '010-3333-4444', String(g('s2','student_phone')));
  check('야간 동기화가 우리가 넣은 학생 번호를 지우지 않는다 (phone)',
        g('s2','phone') === '010-3333-4444', String(g('s2','phone')));
  /* 🔗 **짝 검사** — 위만 두면 「번호는 영영 안 덮는다」로 고쳐도 통과한다. 그러면 번호가 바뀐
     학생이 옛 번호로 굳는다(COALESCE 의 인자 순서를 뒤집으면 정확히 그렇게 된다).
     카페24가 «값을 주는» 학생은 그 값으로 되돌아와야 한다 — 카페24가 정본이라는 원칙 그대로. */
  check('카페24가 번호를 주면 그 값으로 계속 갱신된다 (덮어쓰기 방향)',
        g('s4','parent_phone') === '010-9999-0000',
        '우리가 임의로 바꾼 010-0000-0000 이 남아 있으면 카페24 갱신이 영영 안 오는 것이다: ' + String(g('s4','parent_phone')));

  /* 📞 **칸마다 따로** — 보존 조건 세 줄 중 «한 줄만» 지우는 변이는 여기서만 잡힌다.
     위 s2 는 세 칸이 다 차 있어 한 줄만 남아도 행이 보존된다(실측: 한 줄씩 지우면 36/0 통과).
     ⛔ 이 셋을 «세 칸 다 찬 학생» 으로 합치지 말 것 — 그 순간 이 검사가 헛돈다. */
  check('학부모 번호«만» 있는 학생도 안 지워진다 (보존 조건 parent_phone 줄)',
        g('s7','parent_phone') === '010-1010-1010', String(g('s7','parent_phone')));
  check('학생 번호«만» 있는 학생도 안 지워진다 (보존 조건 student_phone 줄)',
        g('s8','student_phone') === '010-2020-2020', String(g('s8','student_phone')));
  check('phone «만» 있는 학생도 안 지워진다 (보존 조건 phone 줄 — 체험계정 lt* 의 모양)',
        g('s9','phone') === '010-3030-3030', String(g('s9','phone')));
} catch (e) {
  check('실제 실행 검사', false, e?.message);
} finally {
  if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
