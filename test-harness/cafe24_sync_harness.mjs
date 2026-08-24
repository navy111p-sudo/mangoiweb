// -*- coding: utf-8 -*-
// 🧪 카페24 → Neo4j → D1 이관 엔진 테스트 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/cafe24_sync_harness.mjs
//   대상:  cloudflare-deploy/src/cafe24-sync.ts + api-mango.ts(이관 엔드포인트·회계 집계)
//
// 검증 전략 ("진짜" 검증):
//   node:sqlite(내장) 에 실제 D1 스키마를 올리고, cafe24-sync.ts 가 쓰는 INSERT/DELETE
//   SQL 과 변환 로직(출석 상태매핑·세션시간·금액 coalesce·회계 손익집계)을 그대로
//   포팅해 실행하고 결과를 단언한다. + 소스 드리프트 가드(핵심 문자열 실재 확인).
//
// 핵심 회귀 포인트:
//   ① 결제 이관 멱등: memo '[cafe24]%' 삭제 후 재삽입 → 재실행해도 건수·합계 동일
//   ② 학생 이관 멱등: created_at 센티넬 삭제 → 재실행 무중복, 실학생(비센티넬) 보존
//   ③ 출석 상태 매핑: class_state 2=present / 그외=scheduled
//   ④ 출석 세션시간: end>start 면 end-start, 아니면 0 (미종료 수업 음수 방지)
//   ⑤ 출석 증분 멱등: sinceDate 창(date>=since)만 삭제·재삽입 → 전체 재적재분과 무중복
//   ⑥ 회계 월별 손익: type1=수입/type2=지출, net=수입-지출, substring 월그룹
//   ⑦ 조직 이관: cafe24 ID 를 D1 id 로 보존(franchise_id 연결)

import { DatabaseSync } from 'node:sqlite';
import { allSrc } from './_srcbundle.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const CD = resolve(ROOT, 'cloudflare-deploy');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, detail = '') {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
}
const eq = (name, a, b) => check(`${name} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) !== JSON.stringify(b) ? `got ${JSON.stringify(a)}` : '');

// ── 실제 D1 스키마 (api-mango.ts 가 만드는 것과 동일) ─────────────────────────
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE students_erp (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, username TEXT, login_id TEXT,
    payment_type TEXT, end_date TEXT, signup_date TEXT, classes_per_week INTEGER, points INTEGER DEFAULT 0,
    student_phone TEXT, parent_phone TEXT, teacher_phone TEXT, shop_name TEXT, hq_name TEXT, branch1_name TEXT,
    branch2_name TEXT, franchise TEXT, status TEXT DEFAULT '정상', created_at INTEGER, updated_at INTEGER,
    korean_name TEXT, english_name TEXT, user_id TEXT, grade TEXT, school TEXT, level TEXT);`);
  db.exec(`CREATE TABLE student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER,
    period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
  db.exec(`CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL,
    username TEXT, role TEXT, joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT,
    total_session_ms INTEGER DEFAULT 0);`);
  db.exec(`CREATE TABLE franchises (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, phone TEXT,
    owner_name TEXT, opened_at TEXT, active INTEGER DEFAULT 1, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  db.exec(`CREATE TABLE centers (id INTEGER PRIMARY KEY AUTOINCREMENT, franchise_id INTEGER, name TEXT NOT NULL,
    country TEXT, address TEXT, manager TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  return db;
}

const SENTINEL = 1751500000000;

// ── cafe24-sync.ts 의 이관 로직을 그대로 포팅 (SQL·변환은 동일) ────────────────
function importPayments(db, neoRows) {
  db.prepare(`DELETE FROM student_payments WHERE memo LIKE '[cafe24]%'`).run();
  const now = Date.now();
  const ins = db.prepare(`INSERT INTO student_payments (user_id, paid_at, period_start, period_end, amount_krw, method, memo, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of neoRows) {
    ins.run(String(r.user_id ?? ''), Number(r.paid_at) || null, r.period_start || null, r.period_end || null,
      Number(r.amount_krw) || 0, r.method || 'card', r.memo || '[cafe24]', r.status || 'paid', now);
  }
  return neoRows.length;
}
function importStudents(db, neoRows, off) {
  if (off === 0) db.prepare(`DELETE FROM students_erp WHERE created_at = ?`).run(SENTINEL);
  const ins = db.prepare(`INSERT OR REPLACE INTO students_erp (user_id, student_id, login_id, username, korean_name, grade, school, status, signup_date, end_date, shop_name, franchise, hq_name, points, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of neoRows) {
    const uid = String(r.user_id ?? ''); const kname = r.korean_name || uid;
    ins.run(uid, uid, uid, kname, kname, r.grade || null, r.school || null, r.status || 'active',
      r.signup_date || null, r.end_date || null, r.shop_name || null, r.franchise || null, r.hq_name || '망고아이 본사',
      Number(r.points) || 0, SENTINEL, SENTINEL);
  }
}
// 🔒 버그픽스 반영: 증분 시 DELETE 창 = [since, until] 양쪽 경계 (INSERT 창과 동일).
//   neoRows 는 이미 [since,until] 로 필터된 것으로 가정(Cypher WHERE c.date>=since AND c.date<=until).
function importAttendance(db, neoRows, off, sinceDate, untilDate) {
  if (off === 0) {
    if (sinceDate) db.prepare(`DELETE FROM attendance WHERE room_id LIKE 'c24-%' AND date >= ? AND date <= ?`).run(sinceDate, untilDate || '9999-12-31');
    else db.prepare(`DELETE FROM attendance WHERE room_id LIKE 'c24-%'`).run();
  }
  const ins = db.prepare(`INSERT INTO attendance (room_id, user_id, role, joined_at, left_at, status, date, total_session_ms) VALUES (?, ?, 'student', ?, ?, ?, ?, ?)`);
  for (const r of neoRows) {
    const start = Number(r.start_ms) || 0, end = Number(r.end_ms) || 0;
    const status = Number(r.class_state) === 2 ? 'present' : 'scheduled';
    ins.run(`c24-${r.class_id}`, String(r.user_id ?? ''), start || null, end || null, status, r.date || null, end > start ? end - start : 0);
  }
}
// Cypher 창 필터 시뮬레이션 (WHERE c.date >= since AND c.date <= until)
const windowRows = (rows, since, until) => rows.filter(r => (!since || r.date >= since) && (!until || r.date <= (until || '9999-12-31')));
function importOrg(db, branches, centers) {
  const now = Date.now();
  const insF = db.prepare(`INSERT OR REPLACE INTO franchises (id, name, address, phone, owner_name, active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of branches) insF.run(Number(r.id), r.name || '(무명지사)', r.address || null, r.phone || null, r.manager || null, Number(r.active) ? 1 : 0, '[cafe24]', now, now);
  const insC = db.prepare(`INSERT OR REPLACE INTO centers (id, franchise_id, name, address, manager, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of centers) insC.run(Number(r.id), Number(r.branch_id) || null, r.name || '(무명센터)', r.address || null, r.manager || null, Number(r.active) ? 1 : 0, now, now);
}
// 회계 월별 손익 (api-mango finance summary Cypher 의 SQL 등가)
function financeSummary(accbook) {
  const byMonth = new Map();
  for (const a of accbook) {
    if (!a.date) continue;
    const ym = String(a.date).slice(0, 7);
    if (ym < '2019-01') continue;
    const cur = byMonth.get(ym) || { ym, income: 0, expense: 0 };
    if (Number(a.type) === 1) cur.income += Number(a.money) || 0;
    else if (Number(a.type) === 2) cur.expense += Number(a.money) || 0;
    byMonth.set(ym, cur);
  }
  const months = [...byMonth.values()].map(m => ({ ...m, net: m.income - m.expense })).sort((a, b) => b.ym.localeCompare(a.ym));
  const totals = months.reduce((a, m) => ({ income: a.income + m.income, expense: a.expense + m.expense }), { income: 0, expense: 0 });
  return { months, totals: { ...totals, net: totals.income - totals.expense } };
}

console.log('\n━━━━━━━━━━ 🧪 cafe24-sync 이관 엔진 하니스 ━━━━━━━━━━\n');

// ═══ ① 결제 이관 멱등 ═══
console.log('① 결제 이관 멱등 (memo [cafe24]% 삭제 후 재삽입)');
{
  const db = freshDb();
  // 기존 비-cafe24 결제 1건 (보존돼야 함)
  db.prepare(`INSERT INTO student_payments (user_id, amount_krw, memo, status, created_at) VALUES ('manual1', 50000, '수동입력', 'paid', 1)`).run();
  const pays = [
    { user_id: 'a', paid_at: 1700000000000, amount_krw: 220000, method: 'card', memo: '[cafe24] 1', status: 'paid' },
    { user_id: 'b', paid_at: 1700000001000, amount_krw: 0, method: 'point', memo: '[cafe24] 2', status: 'paid' },  // 금액0 coalesce
    { user_id: 'c', paid_at: 1700000002000, amount_krw: 100000, method: 'card', memo: '[cafe24] 3', status: 'refunded' },
  ];
  importPayments(db, pays);
  importPayments(db, pays); // 재실행 (멱등 확인)
  const c24 = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount_krw),0) s FROM student_payments WHERE memo LIKE '[cafe24]%'`).get();
  eq('cafe24 결제 건수(재실행 후 무중복)', c24.c, 3);
  eq('cafe24 결제 합계', c24.s, 320000);
  const manual = db.prepare(`SELECT COUNT(*) c FROM student_payments WHERE memo='수동입력'`).get();
  eq('수동입력 결제 보존', manual.c, 1);
  const paid = db.prepare(`SELECT COALESCE(SUM(amount_krw),0) s FROM student_payments WHERE memo LIKE '[cafe24]%' AND status='paid'`).get();
  eq('paid 만 합산 시 환불 제외', paid.s, 220000);
  db.close();
}

// ═══ ② 학생 이관 멱등 (센티넬) ═══
console.log('\n② 학생 이관 멱등 (created_at 센티넬 삭제)');
{
  const db = freshDb();
  // 실학생(비센티넬) 3명 — 보존돼야 함
  for (const u of ['honggildong', 'lee', 'lemuel'])
    db.prepare(`INSERT INTO students_erp (user_id, korean_name, created_at) VALUES (?, ?, 1780859962000)`).run(u, u);
  const studs = [
    { user_id: 'UMC32', korean_name: '풍예진', status: 'active', shop_name: '강남센터', franchise: '강남지사', points: 100 },
    { user_id: 'gauss', korean_name: '가우스', status: 'active', shop_name: '수성센터', franchise: '대구지사', points: 0 },
  ];
  importStudents(db, studs, 0);
  importStudents(db, studs, 0); // 재실행
  const senti = db.prepare(`SELECT COUNT(*) c FROM students_erp WHERE created_at = ?`).get(SENTINEL);
  eq('센티넬 학생(재실행 무중복)', senti.c, 2);
  const real = db.prepare(`SELECT COUNT(*) c FROM students_erp WHERE created_at = 1780859962000`).get();
  eq('실학생(비센티넬) 보존', real.c, 3);
  const franc = db.prepare(`SELECT franchise, hq_name FROM students_erp WHERE user_id='UMC32'`).get();
  eq('franchise 채워짐(정산 트리용)', franc.franchise, '강남지사');
  eq('hq_name 기본값', franc.hq_name, '망고아이 본사');
  db.close();
}

// ═══ ③④ 출석 상태 매핑 + 세션시간 ═══
console.log('\n③④ 출석 상태 매핑(2=present) + 세션시간(end>start)');
{
  const db = freshDb();
  const classes = [
    { class_id: 1, user_id: 'a', start_ms: 1000, end_ms: 3400000, date: '2026-06-01', class_state: 2 }, // present, 3399000ms
    { class_id: 2, user_id: 'a', start_ms: 5000, end_ms: 0,       date: '2026-06-02', class_state: 1 }, // scheduled, end<start→0
    { class_id: 3, user_id: 'b', start_ms: 2000, end_ms: 1000,    date: '2026-06-03', class_state: 2 }, // end<start→0 (음수 방지)
  ];
  importAttendance(db, classes, 0, undefined);
  const r1 = db.prepare(`SELECT status, total_session_ms, left_at FROM attendance WHERE room_id='c24-1'`).get();
  eq('class_state 2 → present', r1.status, 'present');
  eq('세션시간 end-start', r1.total_session_ms, 3399000);
  const r2 = db.prepare(`SELECT status, total_session_ms, left_at FROM attendance WHERE room_id='c24-2'`).get();
  eq('class_state 1 → scheduled', r2.status, 'scheduled');
  eq('미종료 수업 세션시간 0', r2.total_session_ms, 0);
  eq('미종료 left_at null', r2.left_at, null);
  const r3 = db.prepare(`SELECT total_session_ms FROM attendance WHERE room_id='c24-3'`).get();
  eq('end<start 음수방지 0', r3.total_session_ms, 0);
  db.close();
}

// ═══ ⑤ 출석 증분 멱등 — 경계 있는 창 [since, until] (🔒 미래 예약수업 과다삭제 방지) ═══
console.log('\n⑤ 출석 증분 멱등 (경계창 [since,until] — 미래 예약수업 보존)');
{
  const db = freshDb();
  // 전체 적재: 과거 + 최근 + 먼 미래 예약(2030) — 미래가 대량이라는 실제 상황 재현
  const full = [
    { class_id: 10, user_id: 'a', start_ms: 1, end_ms: 2, date: '2019-10-29', class_state: 2 }, // 먼 과거
    { class_id: 11, user_id: 'a', start_ms: 1, end_ms: 2, date: '2026-06-20', class_state: 2 }, // 최근(창 안)
    { class_id: 12, user_id: 'a', start_ms: 1, end_ms: 2, date: '2027-05-01', class_state: 1 }, // 미래 예약
    { class_id: 13, user_id: 'a', start_ms: 1, end_ms: 2, date: '2030-02-20', class_state: 1 }, // 먼 미래 예약
  ];
  importAttendance(db, full, 0, undefined);
  eq('전체 적재 건수(과거+최근+미래)', db.prepare(`SELECT COUNT(*) c FROM attendance WHERE room_id LIKE 'c24-%'`).get().c, 4);
  // 야간 증분: 창 [2026-06-15, 2026-09-15] — 6/20 만 갱신, 나머지(과거·미래예약) 전부 보존
  const since = '2026-06-15', until = '2026-09-15';
  const neo = windowRows(full.map(r => r.class_id === 11 ? { ...r, end_ms: 5 } : r), since, until);
  eq('Cypher 창 필터 결과(6/20만)', neo.length, 1);
  importAttendance(db, neo, 0, since, until);
  const cnt = db.prepare(`SELECT COUNT(*) c FROM attendance WHERE room_id LIKE 'c24-%'`).get();
  eq('증분 후 총건수(손실 없음)', cnt.c, 4);   // ← 옛 버그면 3 이하로 손실
  eq('먼 과거 보존', db.prepare(`SELECT COUNT(*) c FROM attendance WHERE room_id='c24-10'`).get().c, 1);
  eq('먼 미래 예약(2030) 보존 🔒', db.prepare(`SELECT COUNT(*) c FROM attendance WHERE room_id='c24-13'`).get().c, 1);
  eq('창 안 수업 갱신됨(end 5-1=4)', db.prepare(`SELECT total_session_ms FROM attendance WHERE room_id='c24-11'`).get().total_session_ms, 4);
  // 회귀 가드: 상한 없는 옛 삭제(date>=since)면 미래예약(12,13)이 삭제됨을 명시적으로 확인
  const db2 = freshDb();
  importAttendance(db2, full, 0, undefined);
  db2.prepare(`DELETE FROM attendance WHERE room_id LIKE 'c24-%' AND date >= ?`).run(since);  // 옛 버그 재현
  eq('(버그재현) 상한없는 삭제는 미래예약까지 날림', db2.prepare(`SELECT COUNT(*) c FROM attendance WHERE room_id LIKE 'c24-%'`).get().c, 1);
  db2.close();
  db.close();
}

// ═══ ⑥ 회계 월별 손익 ═══
console.log('\n⑥ 회계 월별 손익 (type1=수입/2=지출, net)');
{
  const acc = [
    { acc_id: 1, date: '2026-05-10', type: 1, money: 1000000 }, // 수입
    { acc_id: 2, date: '2026-05-20', type: 2, money: 300000 },  // 지출
    { acc_id: 3, date: '2026-06-01', type: 1, money: 500000 },  // 수입
    { acc_id: 4, date: '2018-01-01', type: 1, money: 999 },     // 2019 이전 제외
    { acc_id: 5, date: '', type: 1, money: 777 },               // 날짜없음 제외
  ];
  const s = financeSummary(acc);
  eq('집계 월수(2019이전·무날짜 제외)', s.months.length, 2);
  eq('총수입', s.totals.income, 1500000);
  eq('총지출', s.totals.expense, 300000);
  eq('순익', s.totals.net, 1200000);
  const may = s.months.find(m => m.ym === '2026-05');
  eq('2026-05 순익', may.net, 700000);
  eq('월 정렬 최신순', s.months[0].ym, '2026-06');
}

// ═══ ⑦ 조직 이관 (id 보존) ═══
console.log('\n⑦ 조직 이관 (cafe24 BranchID/CenterID → D1 id 보존)');
{
  const db = freshDb();
  const branches = [{ id: 42, name: '강남지사', manager: '김지사', active: 1 }];
  const centers = [{ id: 100, branch_id: 42, name: '강남센터', manager: '이센터', active: 1 }, { id: 101, branch_id: 0, name: '무소속센터', active: 0 }];
  importOrg(db, branches, centers);
  importOrg(db, branches, centers); // 멱등(REPLACE)
  eq('지사 건수(REPLACE 무중복)', db.prepare(`SELECT COUNT(*) c FROM franchises`).get().c, 1);
  eq('센터 건수', db.prepare(`SELECT COUNT(*) c FROM centers`).get().c, 2);
  const f = db.prepare(`SELECT id, name FROM franchises WHERE id=42`).get();
  eq('지사 id = cafe24 BranchID', f.id, 42);
  const c = db.prepare(`SELECT franchise_id FROM centers WHERE id=100`).get();
  eq('센터→지사 연결(franchise_id=BranchID)', c.franchise_id, 42);
  const c2 = db.prepare(`SELECT franchise_id FROM centers WHERE id=101`).get();
  eq('branch_id 0 → franchise_id null', c2.franchise_id, null);
  db.close();
}

// ═══ ⑧ 소스 드리프트 가드 (핵심 배선 실재) ═══
console.log('\n⑧ 소스 드리프트 가드 (cafe24-sync.ts / api-mango.ts / index.ts 실재)');
{
  const sync = readFileSync(resolve(CD, 'src/cafe24-sync.ts'), 'utf8');
  const api = allSrc();
  const idx = readFileSync(resolve(CD, 'src/index.ts'), 'utf8');
  const tch = readFileSync(resolve(CD, 'src/api-teacher.ts'), 'utf8');
  check('sync: 결제 멱등 삭제', sync.includes(`DELETE FROM student_payments WHERE memo LIKE '[cafe24]%'`));
  check('sync: 학생 센티넬', sync.includes('CAFE24_STUDENT_SENTINEL') && sync.includes('1751500000000'));
  check('sync: 출석 상태매핑', sync.includes("Number(r.class_state) === 2 ? 'present' : 'scheduled'"));
  check('sync: 출석 음수방지', sync.includes('end > start ? end - start : 0'));
  check('sync: 출석 삭제 상·하한 경계(과다삭제 방지)🔒', sync.includes('AND date >= ? AND date <= ?') && sync.includes('c.date <= $until'));
  check('sync: nightly 출석 경계창(until 지정)', sync.includes('180 * 86400000') && /importCafe24Attendance\(env, off, 3000, since, until\)/.test(sync));
  check('sync: nightly 4종 refresh', sync.includes('importCafe24Org') && sync.includes('importCafe24Payments') && sync.includes('importCafe24Students') && sync.includes('importCafe24Attendance'));
  check('api: 회계 summary(type1/2 수입지출)', api.includes('CASE WHEN t = 1') && api.includes('CASE WHEN t = 2') && api.includes('substring(a.date,0,7)'));
  check('api: graph-list 명부(students/teachers/staff/books)', api.includes("path === '/api/admin/students/graph-list'") && api.includes("path === '/api/admin/teachers/graph-list'") && api.includes("path === '/api/admin/staff/graph-list'"));
  /* 👩‍🏫 (2026-08-18) 강사 칸 — 「수업일지 0건」의 뿌리를 막아 둔다.
     옛 LMS 수업은 여기로 들어오는데 «누가 가르쳤는지» 가 없어서 강사 화면이 수업 목록을
     만들 수 없었고, 그래서 [일지 쓰기] 버튼이 한 번도 뜨지 않았다.
     이 두 칸이 조용히 빠지면 증상이 그대로 되돌아온다 — 그때 여기서 잡는다. */
  check('sync: 출석에 강사 칸(teacher_uid/teacher_name)',
        sync.includes('ADD COLUMN teacher_uid') && sync.includes('ADD COLUMN teacher_name')
        && /INSERT INTO attendance \([^)]*teacher_uid, teacher_name\)/.test(sync));
  check('sync: :Class 에서 강사 속성 조회(없으면 null 로 degrade)',
        sync.includes('coalesce(c.teacher_id, c.teacher_no, c.t_id) AS teacher_id'));
  /* 강사 화면이 그 칸을 실제로 쓰는지 — 파이프만 깔고 화면이 안 읽으면 증상은 그대로다. */
  check('teacher: 끝난 LMS 수업을 수업 목록에 실음',
        tch.includes("a.room_id LIKE 'c24-%'") && tch.includes("status: 'done'"));
  /* 🔴 (2026-08-19) «남의 수업이 보이던» 사고의 회귀 감시.
     teacher_uid 는 카페24 강사번호(9~196)이고 teachers.id 는 지역 일련번호(1~29)다.
     둘을 곧바로 맞추면 번호가 겹치는 자리에서 남의 수업이 보인다
     (실측: HANNAH 계정 ↔ 카페24 24 = Teacher Mariane 의 수업 127건).
     → 카페24 번호는 teacher_payroll_auto 를 거쳐서만 해석해야 한다. */
  check('teacher: 카페24 강사번호를 payroll 로 해석(teachers.id 직결 금지)',
        tch.includes('teacher_payroll_auto') && tch.includes('cafe24Tids')
        && !/tConds\s*=\s*linkedTeacherIds/.test(tch));
  /* ⚠️ (2026-08-24) 「뜻」으로 검사한다 — 조건문 «모양» 을 문자열로 못 박아 두면
        이름 후보를 하나 늘리는 것 같은 무해한 수정에도 FAIL 이 난다(실제로 밟음:
        `rows.length === 1` → `rows.length !== 1) continue`). 지켜야 하는 것은 둘뿐이다:
          ① 프로필·급여 조회가 **완전일치**일 것 — 부분일치(LIKE) 금지('Anna → HANNAH')
          ② 후보가 «정확히 1개» 일 때만 붙일 것
        그래서 그 블록만 잘라 내어 LIKE 가 없는지까지 함께 본다(예전 검사보다 강하다). */
  const c24Block = tch.slice(tch.indexOf('const cafe24Tids'), tch.indexOf('no_cafe24_teacher_id'));
  check('teacher: 완전일치만 · 후보 2개 이상이면 붙이지 않음',
        c24Block.includes('COLLATE NOCASE')
        && !/\bLIKE\b/.test(c24Block)
        && /rows\.length\s*[!=]==\s*1/.test(c24Block)
        && /pr\.length\s*[!=]==\s*1/.test(c24Block));
  check('teacher: 번호를 못 찾으면 안 보여주는 쪽으로 실패',
        tch.includes('no_cafe24_teacher_id'));

  /* 📅 (2026-08-24 Hannah 「내일 수업이 안 보인다」) 카페24 «예약» 수업이 강사 화면에 뜨는가.
     ────────────────────────────────────────────────────────────────────────────
     이 저장소는 카페24 예약을 `class_schedules` 에 **한 줄도 넣지 않는다**. 들어오는 곳은
     `attendance` 의 `c24-*` 씨앗뿐이고(야간 동기화 창 [60일 전 ~ 180일 후]),
     강사 포털이 그것을 읽어 줘야 «내일» 이 보인다. 예전엔 `date <= 오늘` 로 잘라내고 있어
     카페24 수업이 «미래» 로 보일 경로가 아예 없었다. */
  check('sync: class_schedules 에는 손대지 않는다(예약은 attendance 씨앗으로만)',
        !sync.includes('class_schedules'));
  check('teacher: 카페24 «예약»(scheduled)도 읽는다 — date<=오늘 로만 자르지 않는다',
        tch.includes('lmsFutureRs') && /=== 'scheduled'/.test(tch));
  check('teacher: 예약 수업을 주간 시간표·앞으로 7일에 싣는다',
        /weekDays\[wi\]\.items\.push/.test(tch)
        && /upcoming\.push\(\{[\s\S]{0,400}source: 'lms'/.test(tch));
  /* 🔴 여기가 사고가 날 자리다 — 카페24 행에는 망고아이 «방» 이 없다. 오늘 목록에 끼우면
        [입장] 버튼이 붙어 아무도 없는 방으로 보내게 된다. 그래서 그 루프 안에서는
        `classes.push` 를 절대 하지 않는다(주간·앞으로 7일에만 넣는다). */
  const futLoop = tch.slice(tch.indexOf('for (const r of (lmsFutureRs.results'));
  const futLoopEnd = futLoop.indexOf('classes.sort(');
  check('🔴 teacher: 예약 수업을 «오늘 목록» 에는 넣지 않는다(방이 없어 빈 방으로 보내게 된다)',
        futLoopEnd > 0 && !futLoop.slice(0, futLoopEnd).includes('classes.push'));
  /* 동기화가 가져오는 칸에 수업 «유형» 속성이 없다 → «체험» 이라고 지어내면 정규수업이
     체험으로 보인다. 모르는 것은 모르는 채로 둔다(출처만 밝힌다). */
  check('teacher: 카페24 행의 유형을 추측하지 않는다',
        !/source: 'lms',[\s\S]{0,120}class_kind: '(trial|level_test|makeup)'/.test(tch));
  /* `mangoi_###` 계정은 표시이름이 아이디 그대로라 teacher_profiles 완전일치가 영원히 0건이다.
     본사가 「강사 계정 연결」로 사람을 정해 줘도 이 경로만 계속 실패하던 것을 고친 자리. */
  check('teacher: 카페24 번호 해석에 **원부 이름**을 먼저 쓴다(mangoi_### 계정 구제)',
        /nameKeys[\s\S]{0,240}resolvedRows/.test(tch));
  /* 이름도 같은 번호 체계에서만 가져와야 한다 — teachers 로 되돌리면 남의 이름이 박힌다. */
  check('sync: 강사 이름은 payroll(같은 번호 체계)에서만',
        sync.includes('SELECT teacher_name FROM teacher_payroll_auto')
        && !/SELECT name FROM teachers WHERE CAST\(id AS TEXT\)/.test(sync));
  check('teacher: 끝난 수업에 입장 창을 열지 않음',
        tch.includes('enter_from_ts: start_ts, enter_until_ts: end_ts') && tch.includes('can_enter: false'));
  check('idx: nightly cron 배선', idx.includes('nightlyCafe24Refresh'));
  check('idx: 이관 라우트 게이트(import + finance 정규식)', idx.includes("path === '/api/admin/students/import-cafe24'") && idx.includes('finance-cafe24'));
}

// ── 요약 ──
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  결과: ✅ ${PASS} PASS   ❌ ${FAIL} FAIL`);
if (FAIL) { console.log(`  실패: ${FAILS.join(', ')}`); process.exit(1); }
console.log(`  🎉 전체 통과 — 이관 로직 회귀 없음`);
