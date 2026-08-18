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
  // 확장자 없는 상대 import 는 node 가 못 찾는다 — 사본에서만 .ts 를 붙인다
  writeFileSync(join(tmp, 'cafe24-sync.ts'), txt.replace(/from '\.\/teacher-match'/, "from './teacher-match.ts'"));
  const M = await import(pathToFileURL(join(tmp, 'cafe24-sync.ts')).href);

  const sq = new DatabaseSync(':memory:');
  sq.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, student_id TEXT, login_id TEXT,
    username TEXT, korean_name TEXT, grade TEXT, school TEXT, status TEXT, signup_date TEXT,
    end_date TEXT, shop_name TEXT, franchise TEXT, hq_name TEXT, points INTEGER,
    parent_phone TEXT, student_phone TEXT, phone TEXT, created_at INTEGER, updated_at INTEGER)`);
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
    ],
    parentPhones: { s1:'010-1111-2222', s2:'   ' },
  };
  let off = 0; for (;;) { const r = await M.importCafe24Students({ DB }, off, 2); if (r.done) break; off += 2; }
  const g = (u,c) => sq.prepare(`SELECT ${c} v FROM students_erp WHERE user_id=?`).get(u)?.v;

  check('학부모 번호가 실제로 들어간다', g('s1','parent_phone') === '010-1111-2222', String(g('s1','parent_phone')));
  check('공백만 있는 번호는 NULL 로 정리된다', g('s2','parent_phone') === null, JSON.stringify(g('s2','parent_phone')));
  check('Parent 가 없으면 Student 속성으로 대체된다', g('s4','parent_phone') === '010-9999-0000', String(g('s4','parent_phone')));
  check('학생 번호가 student_phone·phone 양쪽에 들어간다',
        g('s5','student_phone') === '010-5555-6666' && g('s5','phone') === '010-5555-6666');
  check('기존 칸(소속)이 함께 유지된다', g('s1','shop_name') === '강남점', String(g('s1','shop_name')));

  // 야간 동기화가 매일 도는 상황 — 두 번 돌려도 지워지면 안 된다
  off = 0; for (;;) { const r = await M.importCafe24Students({ DB }, off, 2); if (r.done) break; off += 2; }
  check('다시 동기화해도 번호가 남아 있다 (야간 재실행)', g('s1','parent_phone') === '010-1111-2222',
        '재실행에서 지워지면 매일 밤 전멸한다');
} catch (e) {
  check('실제 실행 검사', false, e?.message);
} finally {
  if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch {} }
}

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
