// -*- coding: utf-8 -*-
// 📊 강사 가동률 «지난 7일» 기준 — 실제로 돌려 보는 하니스 (2026-09-30)
//   실행: node test-harness/teacher_util_window_harness.mjs
//
//   왜 — 사장님 「교사 가동률이 왜 0% 야?」. 옛 판은 schedule_kind = 'recurring' 만 셌는데
//     지금 수업은 카페24 미러(one_off)·수강신청(dated)이 «날짜마다 한 줄» 로 만든다
//     (운영 D1 실측 활성: one_off 2,832 · dated 406 · recurring 6) → 명부 전원 0%.
//     사장님 결정: «지난 7일(오늘 제외)» 에 날짜가 잡힌 활성 수업으로 센다.
//
//   ⚠️ 문자열 검사로는 못 잡는다(SQL 도 값도 다 «있고» 틀린 것은 «무엇을 세는가» 뿐).
//      그래서 라우트 블록을 중괄호 짝으로 오려 내 타입을 벗기고, 진짜 SQLite 를 D1 모양으로
//      감싸 «실제로» 돌린다. 「센다」 옆에 「안 센다」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.UTIL_SRC || resolve(__dir, '../cloudflare-deploy/src/api-admin.ts');
const src = readFileSync(SRC, 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) PASS++; else FAIL++;
  console.log(`  ${cond ? '✅' : '❌ FAIL'} ${name}${!cond && extra ? '  — ' + extra : ''}`);
};

// ── 라우트 블록을 중괄호 짝으로 오려 낸다 (문자열·템플릿 안의 중괄호는 건너뜀)
const ANCHOR = "if (method === 'GET' && path === '/api/admin/stats/teacher-utilization') {";
const at = src.indexOf(ANCHOR);
function blockAt(s, i) {
  const open = s.indexOf('{', i);
  let depth = 0, q = null;
  for (let k = open; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '/' && s[k + 1] === '/') { k = s.indexOf('\n', k); continue; }
    if (c === '/' && s[k + 1] === '*') { k = s.indexOf('*/', k) + 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(i, k + 1); }
  }
  return '';
}
const block = at >= 0 ? blockAt(src, at) : '';
ok('전제: 가동률 라우트 블록을 오려 냈다', block.length > 500, `길이 ${block.length}`);

let handler = null;
try {
  const js = stripTypeScriptTypes('async function __h(method, path, env, json, DEFAULT_CLASS_MINUTES){\n' + block + '\nreturn null;\n}');
  handler = new Function(js + '\nreturn __h;')();
} catch (e) { console.log('  (컴파일 실패) ' + e.message); }
ok('전제: 블록을 실행 가능한 함수로 만들었다', typeof handler === 'function');

// ── 진짜 SQLite 를 D1 모양으로 감싼다
function makeEnv(setup) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER);
    CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT, user_id TEXT,
      day_of_week TEXT, start_time TEXT, duration_min INTEGER, scheduled_date TEXT,
      schedule_kind TEXT, status TEXT, source TEXT);
    CREATE TABLE teacher_unavailability (teacher_id TEXT, day_of_week TEXT, start_time TEXT, end_time TEXT, kind TEXT);`);
  setup(db);
  const wrap = (sql) => {
    const st = db.prepare(sql);
    const mk = (args) => ({ all: async () => ({ results: st.all(...args) }), first: async () => st.get(...args) ?? null });
    return { bind: (...a) => mk(a), ...mk([]) };
  };
  return { DB: { prepare: wrap } };
}
const json = (o, status) => ({ body: o, status: status || 200 });
const kstDay = (off) => new Date(Date.now() + 9 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
async function run(setup) {
  if (!handler) return null;
  try { const r = await handler('GET', '/api/admin/stats/teacher-utilization', makeEnv(setup), json, 20); return r && r.body; }
  catch (e) { console.log('  (실행 예외) ' + e.message); return null; }
}
const byName = (d, n) => (d && d.teachers || []).find((t) => t.name === n) || null;

console.log('\n[ ① 날짜가 잡힌 수업(one_off·dated)을 센다 — 옛 0% 사고 ]');
const ins = (db, t, date, start, dur, kind, extra = {}) =>
  db.prepare(`INSERT INTO class_schedules (teacher_id,user_id,day_of_week,start_time,duration_min,scheduled_date,schedule_kind,status,source)
              VALUES (?,?,?,?,?,?,?,?,?)`).run(String(t), extra.user || 'stu', extra.dow ?? null, start, dur, date,
    kind, extra.status || 'active', extra.source || 'c24-mirror');
const base = (db) => {
  db.exec(`INSERT INTO teachers VALUES (1,'KAYE',1),(2,'FAR',1),(3,'OLD',0)`);
};
const d1 = await run((db) => {
  base(db);
  ins(db, 1, kstDay(-1), '09:00', 20, 'one_off');
  ins(db, 1, kstDay(-3), '10:00', 30, 'dated', { source: 'adm-enroll:1' });
});
const kaye = byName(d1, 'KAYE');
ok('응답 ok', d1 && d1.ok === true);
ok('one_off + dated 둘 다 셈 (20+30=50분)', kaye && kaye.assigned_min === 50, JSON.stringify(kaye));
ok('가동률이 0 이 아니다', kaye && kaye.utilization_pct > 0);
ok('수업 없는 활성 강사는 0% 로 나온다(짝)', byName(d1, 'FAR') && byName(d1, 'FAR').assigned_min === 0);
ok('퇴사 강사는 목록에 없다', !byName(d1, 'OLD'));
ok('응답에 계산 기간(from/to)이 실린다', d1 && d1.window && d1.window.from === kstDay(-7) && d1.window.to === kstDay(-1));

console.log('\n[ ② 안 세는 것 — 짝 ]');
const d2 = await run((db) => {
  base(db);
  ins(db, 1, kstDay(-2), '09:00', 20, 'one_off');                          // 셈
  ins(db, 1, kstDay(0), '11:00', 20, 'one_off');                           // 오늘 — 제외
  ins(db, 1, kstDay(-8), '11:00', 20, 'one_off');                          // 8일 전 — 제외
  ins(db, 1, kstDay(3), '11:00', 20, 'one_off');                           // 미래 — 제외
  ins(db, 1, kstDay(-2), '12:00', 20, 'one_off', { status: 'cancelled' }); // 취소 — 제외
  ins(db, 1, kstDay(-2), '13:00', 20, 'one_off', { user: 'lms' });         // 자리표시 — 제외
});
const k2 = byName(d2, 'KAYE');
ok('오늘·8일 전·미래·취소·LMS 는 안 센다 (20분만)', k2 && k2.assigned_min === 20, JSON.stringify(k2));

console.log('\n[ ③ 그룹 수업은 강사 시간 한 번 ]');
const d3 = await run((db) => {
  base(db);
  for (const u of ['a', 'b', 'c']) ins(db, 1, kstDay(-1), '15:00', 30, 'one_off', { user: u });
  ins(db, 1, kstDay(-1), '16:00', 20, 'one_off', { user: 'a' });           // 다른 시각은 따로
});
const k3 = byName(d3, 'KAYE');
ok('같은 날·같은 시각 3명 = 30분 한 번 + 다른 시각 20분 = 50분', k3 && k3.assigned_min === 50, JSON.stringify(k3));
ok('수업 회수도 2회', k3 && k3.class_count === 2);

console.log('\n[ ④ 날짜 없는 옛 매주 반복 행은 그대로 센다 · 날짜가 있으면 날짜가 이긴다 ]');
const d4 = await run((db) => {
  base(db);
  ins(db, 2, null, '18:00', 20, 'recurring', { dow: 'mon,wed', source: 'x' }); // 요일 2개 = 40분
  ins(db, 2, kstDay(-4), '18:00', 20, 'recurring', { dow: 'fri', source: 'x' }); // 날짜 있음 → 1회만
  ins(db, 2, kstDay(-20), '18:00', 20, 'recurring', { dow: 'tue', source: 'x' }); // 날짜가 창 밖 → 안 셈
});
const f4 = byName(d4, 'FAR');
ok('옛 반복 40분 + 날짜 있는 반복 20분 = 60분(창 밖 날짜는 요일로 다시 안 셈)', f4 && f4.assigned_min === 60, JSON.stringify(f4));

console.log('\n[ ⑤ 요일 막대 — 날짜의 요일로 잡는다 ]');
const d5date = kstDay(-1);
const d5 = await run((db) => { base(db); ins(db, 1, d5date, '09:00', 20, 'one_off'); });
const wantDow = new Date(d5date + 'T00:00:00Z').getUTCDay();
ok('busiest_dow 가 그 날짜의 요일', byName(d5, 'KAYE') && byName(d5, 'KAYE').busiest_dow === wantDow);

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
