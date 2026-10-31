// 🔎 학생 상세 «학생 마스터 조회» 하니스 — 2026-09-14
//
// [무엇이 문제였나]
//   관리자 › 학생 상세(`/admin/student.html`)의 왼쪽 카드가 `yahee` 학생에게 전부 «—» 였다
//   (가입일·수강 종료·주당 수업·결제 유형·가맹점). D1 에는 행이 멀쩡히 있었다(가입일 2026-09-14·가맹점).
//   원인: `/api/admin/student/:uid/full` 이 학생 마스터를 `student_id OR login_id OR username` 으로만 찾고
//   **`user_id`(PRIMARY KEY) 를 안 봤다.** 카페24 동기화 행(29,494)은 세 칸이 user_id 와 같아 우연히 걸렸지만,
//   관리자 「학생 등록」이 만든 행은 student_id·login_id 가 NULL 이고 username 이 한글 이름이라 어느 조건에도
//   안 걸렸다(실측 admin_manual 3행 전부). 같은 조건을 쓰는 수정(UPDATE)·수강 연장도 0행 갱신 — 에러 없음.
//
// [왜 문자열 검사만으로는 모자란가]
//   함수도 SQL 도 다 «있고» 틀린 것은 «그 조건이 이 모양의 행을 찾는가» 뿐이다. 그래서 소스에서 조건 조각과
//   INSERT 문을 **오려 내 진짜 SQLite 에 돌린다.** 그리고 「찾는다」 옆에 「남은 안 찾는다」·「옛 조건은 실제로
//   못 찾았다」를 짝으로 둔다 — 짝이 없으면 «아무나 찾기» 도 통과한다.
//
// 실행: node test-harness/student_erp_lookup_harness.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };
const mango = rd('../cloudflare-deploy/src/api-mango.ts');
const admin = rd('../cloudflare-deploy/src/api-admin.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};
// 부정 검사는 주석을 벗겨 낸 사본으로 (설명 주석이 옛 조건을 담고 있다 — CLAUDE.md 2장)
const strip = (t) => {
  const out = []; let inBlock = false;
  for (const line of t.split('\n')) {
    let l = line;
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) continue; l = l.slice(e + 2); inBlock = false; }
    for (;;) {
      const s = l.indexOf('/*'); if (s < 0) break;
      const e = l.indexOf('*/', s + 2);
      if (e < 0) { l = l.slice(0, s); inBlock = true; break; }
      l = l.slice(0, s) + l.slice(e + 2);
    }
    out.push(l.replace(/^\s*\/\/.*$/, ''));
  }
  return out.join('\n');
};

/* 운영 D1 `students_erp` 의 일부 칸만 흉내 낸다 — PRIMARY KEY 가 user_id 이고 id 칸이 없다는 점이 핵심
   (CLAUDE.md 2장 「students_erp 에는 id 컬럼이 없습니다」). 이 하니스가 보는 칸만 둔다. */
const SCHEMA = `CREATE TABLE students_erp (
  user_id TEXT PRIMARY KEY, student_id TEXT, login_id TEXT, username TEXT, korean_name TEXT, student_name TEXT,
  status TEXT, signup_date TEXT, end_date TEXT, classes_per_week INTEGER, payment_type TEXT,
  student_phone TEXT, parent_phone TEXT, shop_name TEXT, notes TEXT, source TEXT, password_hash TEXT,
  created_at INTEGER, updated_at INTEGER);`;
const seed = (db) => {
  // 실측 세 모양 그대로 (2026-09-14 D1): 카페24 동기화 · 관리자 수동 등록(옛 INSERT 모양) · 홈 회원가입
  db.prepare(`INSERT INTO students_erp (user_id, student_id, login_id, username, korean_name, signup_date, source) VALUES (?,?,?,?,?,?,?)`)
    .run('cafe24kid', 'cafe24kid', 'cafe24kid', 'cafe24kid', '김카페', '2026-01-01', null);
  db.prepare(`INSERT INTO students_erp (user_id, student_id, login_id, username, korean_name, signup_date, shop_name, source) VALUES (?,?,?,?,?,?,?,?)`)
    .run('yahee', null, null, '정예희', '정예희', '2026-09-14', '망고커뮤니케이션', 'admin_manual');
  db.prepare(`INSERT INTO students_erp (user_id, student_id, login_id, username, korean_name, signup_date, source) VALUES (?,?,?,?,?,?,?)`)
    .run('selfkid', 'selfkid', 'selfkid', 'selfkid', '박가입', '2026-09-01', 'self_signup');
};

/* ══ ① 조건 조각을 소스에서 읽고 바인드 개수를 함수에서 «실행해» 맞춘다 ═══════════════ */
console.log('\n════ ① ERP_BY_UID 정본 조각 ════');
const fragM = /const ERP_BY_UID = `([^`]+)`;/.exec(mango);
check('소스에서 ERP_BY_UID 조각을 찾았다', !!fragM);
const FRAG = fragM ? fragM[1] : '';
const bindsM = /const erpUidBinds = \(uid[^)]*\)[^=]*=> (\[[^\]]*\]);/.exec(mango);
check('소스에서 erpUidBinds 를 찾았다', !!bindsM);
let binds = null;
try { binds = bindsM ? new Function('uid', 'return ' + bindsM[1] + ';')('X') : null; } catch { binds = null; }
check('조각의 ? 개수 == erpUidBinds 가 돌려주는 개수 (어긋나면 D1 이 바인드 오류로 죽는다)',
  !!binds && (FRAG.match(/\?/g) || []).length === binds.length, { q: (FRAG.match(/\?/g) || []).length, binds });
check('조각이 user_id 를 본다 (이게 빠진 것이 사고였다)', /\buser_id = \?/.test(FRAG));

/* ══ ② 다섯 자리가 전부 정본 조각을 쓰고, 옛 조건이 어디에도 남지 않았다 ════════════ */
console.log('\n════ ② 배선 — 조건을 각자 다시 적지 않았는가 ════');
{
  const src = strip(mango);
  const uses = (src.match(/FROM students_erp WHERE \$\{ERP_BY_UID\}|students_erp SET [^`]*WHERE \$\{ERP_BY_UID\}/g) || []).length;
  check('students_erp 를 ERP_BY_UID 로 찾는 자리가 5곳 이상 (full·수정 preRow·수정 UPDATE·연장 SELECT·연장 UPDATE)', uses >= 5, { uses });
  check('⛔ 옛 조건 «student_id = ? OR login_id = ? OR username = ?» 이 students_erp 조회에 남아 있지 않다',
    !/students_erp[^`]*student_id = \? OR login_id = \? OR username = \?/.test(src));
  const bindUses = (src.match(/erpUidBinds\(uid\)/g) || []).length;
  check('그 자리들이 바인드도 정본(erpUidBinds)으로 넘긴다', bindUses >= 5, { bindUses });
}

/* ══ ③ 진짜 SQLite — 세 모양의 행을 «찾는다» 와 «남은 안 찾는다» 를 짝으로 ══════════ */
console.log('\n════ ③ 실제 SQLite — 어떤 모양의 행이든 아이디로 찾는가 ════');
if (FRAG && binds) {
  const db = new DatabaseSync(':memory:'); db.exec(SCHEMA); seed(db);
  const sel = `SELECT * FROM students_erp WHERE ${FRAG} LIMIT 1`;
  const find = (uid) => db.prepare(sel).get(...Array(binds.length).fill(uid));
  const y = find('yahee');
  check('관리자 수동 등록 행(student_id·login_id NULL)을 user_id 로 찾는다 — 사고의 그 모양', !!y && y.user_id === 'yahee');
  check('찾은 행에 가입일·가맹점이 실려 있다 (카드가 «—» 가 아니게 되는 근거)', !!y && y.signup_date === '2026-09-14' && y.shop_name === '망고커뮤니케이션');
  check('카페24 동기화 행도 그대로 찾는다 (되던 것을 깨지 않았다)', find('cafe24kid')?.user_id === 'cafe24kid');
  check('홈 회원가입 행도 찾는다', find('selfkid')?.user_id === 'selfkid');
  check('없는 아이디는 안 찾는다 (짝 — 없으면 «아무나 찾기» 도 통과)', find('nobody') === undefined);
  check('한글 이름으로 물으면 username 으로 여전히 찾는다 (옛 경로 유지)', find('정예희')?.user_id === 'yahee');

  // 옛 조건을 «대조» 로 돌려 본다 — 이 하니스가 정말 사고 모양을 재고 있는지 확인하는 줄
  const OLD = `(student_id = ? OR login_id = ? OR username = ?)`;
  const oldY = db.prepare(`SELECT * FROM students_erp WHERE ${OLD} LIMIT 1`).get('yahee', 'yahee', 'yahee');
  check('[대조] 옛 조건은 그 행을 실제로 못 찾는다 (이 검사가 사고를 재현하고 있다는 증거)', oldY === undefined);

  // 수강 연장 UPDATE 문을 소스에서 오려 내 돌린다 — 0행 갱신이던 자리
  const upM = /`UPDATE students_erp SET end_date = \?, updated_at = \?\s+WHERE \$\{ERP_BY_UID\}`/.exec(mango);  // 줄바꿈 자리는 못 박지 않는다(리플로우는 무해)
  check('소스에서 연장 UPDATE 문을 찾았다', !!upM);
  if (upM) {
    const sql = upM[0].slice(1, -1).replace('${ERP_BY_UID}', FRAG).replace(/\s+/g, ' ');
    const r = db.prepare(sql).run('2026-11-07', 1, ...Array(binds.length).fill('yahee'));
    check('연장 UPDATE 가 수동 등록 행 «한 줄» 을 실제로 갱신한다 (전에는 0행)', r.changes === 1, r.changes);
    check('다른 학생의 end_date 는 그대로다 (짝)', find('cafe24kid')?.end_date === null && find('yahee')?.end_date === '2026-11-07');
  }
}

/* ══ ④ 「학생 등록」 INSERT 를 오려 내 돌리고, 그 행을 옛 조건으로도 찾을 수 있는 모양인지 본다 ══ */
console.log('\n════ ④ 관리자 「학생 등록」이 만드는 행의 모양 ════');
{
  // 앵커는 «students/create 의 INSERT»(source 'admin_manual') 하나 — 컬럼 순서·줄바꿈은 못 박지 않는다.
  const m = /`INSERT INTO students_erp \(([^)]*)\)[^`]*'admin_manual'[^`]*`\s*\)\.bind\(([\s\S]*?)\)\.run\(\);/.exec(admin);
  check('소스에서 students/create 의 INSERT 문을 찾았다', !!m);
  if (m) {
    const sql = m[0].slice(1, m[0].indexOf('`', 1)).replace(/\s+/g, ' ');
    const cols = m[1].split(',').map((c) => c.trim());
    check('INSERT 컬럼 목록에 user_id·student_id·login_id 가 «들어 있다» (순서는 안 묻는다)',
      ['user_id', 'student_id', 'login_id'].every((c) => cols.includes(c)), cols);
    const nQ = (sql.match(/\?/g) || []).length;
    /* 바인드 인자를 «소스 그대로» 실제로 평가한다 — 값을 손으로 적으면 순서가 뒤바뀐 진짜 버그
       (student_id 에 이름이 들어가는 것)를 원리상 못 잡는다(trap-check 변이 A 가 잡음). */
    let args = null;
    try {
      args = new Function('uid', 'name', 'today', 'studentPhone', 'parentPhone', 'shopName', 'notes', 'pwdHash', 'now',
        'return [' + m[2] + '];')('newkid', '새학생', () => '2026-09-14', null, null, '망고학원', null, 'HASH', 1);
    } catch (e) { args = null; }
    check('bind 인자 목록을 소스에서 오려 내 평가했다 (모르는 이름이 생기면 여기서 FAIL)', Array.isArray(args));
    check('INSERT 의 ? 개수 == bind 인자 개수 (어긋나면 등록 자체가 D1 오류로 죽는다)', !!args && nQ === args.length, { nQ, n: args && args.length });
    const db = new DatabaseSync(':memory:'); db.exec(SCHEMA);
    let ok = !!args, err = '';
    try { if (args) db.prepare(sql).run(...args); } catch (e) { ok = false; err = String(e?.message || e); }
    check('INSERT 가 실제 SQLite 에서 돈다', ok, err);
    const row = db.prepare(`SELECT * FROM students_erp WHERE user_id = ?`).get('newkid');
    check('새 행의 student_id·login_id 가 user_id 와 같다 (카페24 행 29,494건과 같은 모양 — 바인드 «순서» 까지 실측)',
      !!row && row.student_id === 'newkid' && row.login_id === 'newkid');
    check('username 에는 여전히 이름이 들어간다 (다른 화면이 username=이름 을 전제한다)', !!row && row.username === '새학생');
    if (FRAG && binds) {
      const found = db.prepare(`SELECT user_id FROM students_erp WHERE ${FRAG} LIMIT 1`).get(...Array(binds.length).fill('newkid'));
      check('그 행을 학생 상세 조회 정본으로 찾는다 (끝에서 끝까지)', found?.user_id === 'newkid');
    }
  }
}

{
  const alt = /for \(const \[col, type\] of \[([^\]]*(?:\]\s*,\s*\[[^\]]*)*)\]\] as \[string, string\]\[\]\)/.exec(admin.slice(admin.indexOf("'/api/admin/students/create'")));
  const altCols = alt ? [...alt[1].matchAll(/\['([a-z_]+)'/g)].map((x) => x[1]) : [];
  check('students/create 의 지연 ALTER 목록에 student_id·login_id 가 있다 (동기화가 한 번도 안 돈 DB 에서 등록이 죽지 않게)',
    altCols.includes('student_id') && altCols.includes('login_id'), altCols);
}

console.log('\n' + '─'.repeat(58));
console.log(FAIL === 0 ? `✅ ALL PASS (${PASS})` : `⚠ PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
process.exit(FAIL ? 1 : 0);
