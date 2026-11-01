#!/usr/bin/env node
/**
 * enroll_student_conflict_harness.mjs — 수강신청의 «학생 본인 겹침» 검사 (2026-10-06 사장님 지시)
 *
 * 발단: 수강신청 경로(관리자 확정·기간 채우기·학생 결제 주문·결제 후 생성)는 enrollConflicts 로 «강사» 만 봐서,
 *   같은 학생이 같은 시간에 이미 다른 강사와 수업이 있어도 그 자리에 수업을 하나 더 만들었다.
 *   다른 경로(관리자 등록·승인·이동)는 schedule-conflict.ts 로 학생도 본다 — 수강신청만 빠져 있었다.
 *
 * 무엇을 보나 — 문자열이 아니라 진짜 SQLite(node:sqlite) 로 정본을 «실제로 돌려서»:
 *   A. enrollStudentConflicts — 겹치면 잡고, 짝으로: 남의 수업·취소·자기 신청 행·안 겹치는 시각은 안 잡고, 조회 실패는 null(모름)
 *   B. buildEnrollPlan — 겹치는 날짜를 빼고 경고한다 · (짝) 안 겹치면 경고 없음
 *   C. createEnrollOrder(신규) — 첫 회차가 학생 겹침이면 409 + «이 학생은» 문구 · (짝) 안 겹치면 그 409 가 아님
 *   D. enrollCreateSchedules — 결제 뒤 생성에서도 그 날짜를 안 만든다
 *   E. 기간 채우기(planEnrollBackfill) — 그 날짜를 skipped.student_conflict 로 뺀다
 *   F. 공개 미리보기 /api/pay/enroll/check — «본인 토큰» 일 때만 학생 겹침을 보고 답한다
 *      (짝) 토큰 없이·남의 토큰으로 남의 uid 를 넣으면 학생 일정을 안 본다(엿보기 차단)
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dir, '../cloudflare-deploy/src');
/* 변이시험용: ENROLL_OPS_SRC / ENROLL_ACTIVATE_SRC 로 고친 사본을 가리킬 수 있다 */
const OV = { 'enroll-ops': process.env.ENROLL_OPS_SRC || '', 'enroll-activate': process.env.ENROLL_ACTIVATE_SRC || '' };
const readSrc = (n) => OV[n] ? readFileSync(OV[n], 'utf8') : readFileSync(resolve(SRC_DIR, n + '.ts'), 'utf8');
const _tmps = [], _made = new Map();
const mkCopy = (name) => {
  if (_made.has(name)) return _made.get(name);
  const f = resolve(tmpdir(), `${name}.esc.${process.pid}.ts`);
  _made.set(name, f); _tmps.push(f);
  writeFileSync(f, readSrc(name).replace(/from '\.\/([\w-]+)'/g, (_m, n) => `from '${pathToFileURL(mkCopy(n)).href}'`));
  return f;
};
process.on('exit', () => { for (const f of _tmps) { try { rmSync(f); } catch {} } });

let PASS = 0, FAIL = 0;
const ok = (cond, name, extra) => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const done = () => { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(FAIL ? 1 : 0); };

let A = null, O = null;
try { A = await import(pathToFileURL(mkCopy('enroll-activate')).href); O = await import(pathToFileURL(mkCopy('enroll-ops')).href); }
catch (e) { console.log('  (정본 로드 실패) ' + (e && e.message)); }
ok(!!(O && O.enrollStudentConflicts && O.createEnrollOrder && O.enrollCreateSchedules && A && A.buildEnrollPlan && A.planEnrollBackfill), '전제: 정본을 불러왔다');
if (!O || !O.enrollStudentConflicts || !A) done();

const addDay = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const KST_TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstMs = (day) => Date.parse(day + 'T00:00:00+09:00');
const nextDow = (from, dow) => { let d = addDay(from, 1); for (let i = 0; i < 7; i++) { if (new Date(d + 'T00:00:00Z').getUTCDay() === dow) return d; d = addDay(d, 1); } return d; };

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const wrap = (sql, b = []) => ({
    bind: (...x) => wrap(sql, x.map((v) => (v === undefined ? null : v))),
    first: async () => db.prepare(sql).get(...b) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...b) }),
    run: async () => { const r = db.prepare(sql).run(...b); return { meta: { changes: Number(r.changes || 0) } }; },
  });
  const env = { DB: {
    exec: async (sql) => { db.exec(sql); },
    prepare: (sql) => wrap(sql),
    batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  } };
  db.exec(`CREATE TABLE enrollments (id INTEGER PRIMARY KEY, student_user_id TEXT, student_name TEXT, package TEXT, started_at INTEGER, ended_at INTEGER,
            monthly_fee_krw INTEGER, status TEXT, notes TEXT, created_at INTEGER, updated_at INTEGER, days_of_week TEXT, time TEXT, class_size TEXT,
            type TEXT, teacher_name TEXT, end_date TEXT, assign_priority TEXT, duration_months TEXT, duration_min INTEGER, base_fee_krw INTEGER, fee_source TEXT, parent_phone TEXT)`);
  db.exec(`CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)`);
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, parent_phone TEXT, student_phone TEXT, phone TEXT)`);
  db.exec(`INSERT INTO teachers (id, name, active) VALUES (5, 'HANNAH', 1), (6, 'KAYE', 1)`);
  db.exec(`INSERT INTO students_erp (user_id, korean_name) VALUES ('stu', '김학생'), ('other', '남학생')`);
  return { env, db };
}
async function withTables() {
  const s = makeEnv();
  try { await O.ensureEnrollTables(s.env); } catch {}
  try { await A.buildEnrollPlan(s.env, 999999); } catch {}
  return s;
}
const insCls = (db, o) => db.prepare(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, day_of_week, start_time, duration_min, teacher_id, status, source, created_by, created_at)
  VALUES (?, ?, ?, 'regular', ?, ?, ?, ?, ?, ?, ?, 'h', 1)`).run(o.uid || 'stu', '김학생', o.kind || 'dated', o.date ?? null, o.dow ?? null,
  o.time || '21:10', o.dm || 20, String(o.tid || '6'), o.status || 'active', o.src || 'manual');

const TUE = nextDow(KST_TODAY, 2);          // 다음 화요일
const TUE2 = addDay(TUE, 7);
const TIMES = { 2: 21 * 60 + 10 };

/* ═══ A ═══ */
console.log('\n[ A. enrollStudentConflicts ]');
{
  const { env, db } = await withTables();
  insCls(db, { date: TUE, time: '21:00', dm: 30 });                 // 21:00~21:30 → 21:10 과 겹침
  insCls(db, { uid: 'other', date: TUE2, time: '21:10', tid: '7' }); // 남의 수업
  insCls(db, { date: TUE2, time: '21:10', status: 'cancelled', tid: '8' }); // 취소
  insCls(db, { date: TUE2, time: '21:10', src: 'adm-enroll:7', tid: '9' }); // 자기 신청 행(excludeSource)
  insCls(db, { date: TUE2, time: '21:30', tid: '10' });             // 21:10(20분) 끝과 맞닿음 → 안 겹침
  let s = null; try { s = await O.enrollStudentConflicts(env, 'stu', [TUE, TUE2], TIMES, 20, [2], 'adm-enroll:7'); } catch (e) { s = { __err: e.message }; }
  ok(s instanceof Set && s.has(TUE), '학생의 다른 수업(다른 강사)과 겹치는 날짜를 잡는다', s && [...(s.__err ? [] : s)]);
  ok(s instanceof Set && !s.has(TUE2), '(짝) 남의 수업·취소·자기 신청 행·맞닿기만 하는 시각은 안 잡는다', s && [...(s.__err ? [] : s)]);
  let s2 = null; try { s2 = await O.enrollStudentConflicts(env, 'stu', [TUE2], TIMES, 20, [2], null); } catch (e) { s2 = { __err: e.message }; }
  ok(s2 instanceof Set && s2.has(TUE2), '(짝) 제외 출처를 안 넘기면 그 신청 행도 겹침으로 본다 — 제외가 실제로 일한다', s2 && [...(s2.__err ? [] : s2)]);

  const r = await withTables();
  insCls(r.db, { kind: 'recurring', dow: 'Tue', time: '21:15' });   // 날짜 없는 반복 수업
  let s3 = null; try { s3 = await O.enrollStudentConflicts(r.env, 'stu', [TUE, TUE2, addDay(TUE, 1)], { 2: 1270, 3: 1270 }, 20, [2, 3]); } catch (e) { s3 = { __err: e.message }; }
  ok(s3 instanceof Set && s3.has(TUE) && s3.has(TUE2) && !s3.has(addDay(TUE, 1)), '날짜 없는 반복 수업(요일)은 그 요일 날짜를 전부 잡는다 · 다른 요일은 안 잡는다', s3 && [...(s3.__err ? [] : s3)]);

  const bad = { DB: { prepare: () => { throw new Error('boom'); } } };
  let s4; try { s4 = await O.enrollStudentConflicts(bad, 'stu', [TUE], TIMES, 20, [2]); } catch (e) { s4 = 'threw'; }
  ok(s4 === null, '조회 실패는 던지지 않고 null(모름)을 돌려준다', s4);
}

/* ═══ B ═══ */
console.log('\n[ B. buildEnrollPlan ]');
{
  const { env, db } = await withTables();
  db.prepare(`INSERT INTO enrollments (id, student_user_id, student_name, package, started_at, status, days_of_week, time, teacher_name)
              VALUES (7, 'stu', '김학생', '정규수업', ?, 'confirmed', '화', '21:10', 'HANNAH')`).run(kstMs(TUE));
  insCls(db, { date: TUE, time: '21:10', tid: '6' });   // KAYE 와 이미 수업
  let p = null; try { p = await A.buildEnrollPlan(env, 7, '5'); } catch (e) { p = { __err: e.message }; }
  ok(p && Array.isArray(p.dates) && !p.dates.includes(TUE) && p.dates.length === 4, '학생이 이미 수업 있는 날짜는 빼고 4회를 뒤로 채운다', p && (p.__err || p.dates));
  ok(p && (p.warnings || []).some((w) => w.includes('이 학생은') && w.includes(TUE)), '«이 학생은 그 시간에 이미 다른 수업» 경고에 날짜가 있다', p && p.warnings);
  ok(p && Array.isArray(p.skipped_student_conflicts) && p.skipped_student_conflicts.includes(TUE), '건너뛴 학생 겹침 날짜를 따로 돌려준다', p && p.skipped_student_conflicts);

  const z = await withTables();
  z.db.prepare(`INSERT INTO enrollments (id, student_user_id, student_name, package, started_at, status, days_of_week, time, teacher_name)
              VALUES (8, 'stu', '김학생', '정규수업', ?, 'confirmed', '화', '21:10', 'HANNAH')`).run(kstMs(TUE));
  insCls(z.db, { uid: 'other', date: TUE, time: '21:10', tid: '6' });
  let q = null; try { q = await A.buildEnrollPlan(z.env, 8, '5'); } catch (e) { q = { __err: e.message }; }
  ok(q && q.dates && q.dates.includes(TUE) && !(q.warnings || []).some((w) => w.includes('이 학생은')), '(짝) 겹치지 않으면 첫 날짜 그대로 · 학생 겹침 경고 없음', q && (q.__err || { d: q.dates, w: q.warnings }));
}

/* ═══ C ═══ */
console.log('\n[ C. createEnrollOrder(신규) ]');
const P = { teacherId: '5', days: [2], timesMin: TIMES, times: { 2: '21:10' }, minutes: 20, weekly: 1, months: 1, startDate: TUE };
{
  const { env, db } = await withTables();
  insCls(db, { date: TUE, time: '21:10', tid: '6' });
  let res = null, body = null;
  try { res = await O.createEnrollOrder(env, 'stu', P, 'new'); body = await res.json(); } catch (e) { body = { __err: e.message }; }
  ok(res && res.status === 409 && body.error === 'slot_conflict' && String(body.message || '').includes('이 학생은'), '첫 회차가 학생 겹침이면 409 + «이 학생은» 안내', body);
  ok(body && Number(body.student_conflict_count) >= 1, '학생 겹침 건수를 함께 돌려준다', body && body.student_conflict_count);

  const z = await withTables();
  insCls(z.db, { uid: 'other', date: TUE, time: '21:10', tid: '6' });
  let b2 = null, r2 = null;
  try { r2 = await O.createEnrollOrder(z.env, 'stu', P, 'new'); b2 = await r2.json(); } catch (e) { b2 = { __err: String(e.message) }; }
  ok(b2 && b2.error !== 'slot_conflict', '(짝) 남의 수업만 있으면 학생 겹침으로 막지 않는다', b2);
}

/* ═══ D ═══ */
console.log('\n[ D. enrollCreateSchedules (결제 뒤 생성) ]');
{
  const { env, db } = await withTables();
  insCls(db, { date: TUE, time: '21:10', tid: '6' });
  const order = { student_name: '김학생', enroll_json: JSON.stringify({ uid: 'stu', teacher_id: '5', days: [2], times: { 2: '21:10' }, minutes: 20, sessions: 4, start_date: TUE, weekly: 1, months: 1 }) };
  try { await O.enrollCreateSchedules(env, order, 'ORD1'); } catch (e) { console.log('  (오류) ' + e.message); }
  const made = db.prepare(`SELECT scheduled_date d FROM class_schedules WHERE source = 'enroll:ORD1' ORDER BY d`).all().map((x) => x.d);
  ok(made.length === 4 && !made.includes(TUE), '학생이 이미 수업 있는 날짜는 만들지 않고 4회를 채운다', made);
}

/* ═══ E ═══ */
console.log('\n[ E. 기간 채우기(백필) ]');
{
  const { env, db } = await withTables();
  const end = addDay(TUE, 55);
  db.prepare(`INSERT INTO enrollments (id, student_user_id, student_name, package, started_at, status, days_of_week, time, teacher_name, end_date)
              VALUES (9, 'stu', '김학생', '정규수업', ?, 'confirmed', '화', '21:10', 'HANNAH', ?)`).run(kstMs(TUE), end);
  insCls(db, { date: TUE, time: '21:10', tid: '5', src: 'adm-enroll:9' });       // 이 신청의 1회차
  const hit = addDay(TUE, 14);
  insCls(db, { date: hit, time: '21:10', tid: '6' });                             // 3주차에 다른 수업
  let b = null; try { b = await A.planEnrollBackfill(env, 9); } catch (e) { b = { __err: e.message }; }
  ok(b && b.ok && b.skipped && (b.skipped.student_conflict || []).includes(hit), '학생 겹침 날짜를 skipped.student_conflict 로 뺀다', b && (b.__err || b.skipped));
  ok(b && b.add && !b.add.some((x) => x.date === hit) && b.add.some((x) => x.date === addDay(TUE, 7)), '(짝) 그 날짜만 빠지고 다른 화요일은 채운다', b && b.add && b.add.map((x) => x.date));
}

/* ═══ F ═══ */
console.log('\n[ F. 미리보기 /api/pay/enroll/check ]');
{
  let T = null; try { T = await import(pathToFileURL(mkCopy('auth-token')).href); } catch (e) { console.log('  (auth-token 로드 실패) ' + e.message); }
  ok(!!(T && T.signUidToken && O.handleEnrollApi), '전제: 토큰 발급·라우트 핸들러를 불러왔다');
  const { env, db } = await withTables();
  env.ROOM_JWT_SECRET = 'harness-secret-0123456789abcdef';
  insCls(db, { date: TUE, time: '21:10', tid: '6' });   // stu 가 이미 KAYE 와 수업
  const call = async (extra) => {
    const body = { teacher_id: '5', weekly: 1, months: 1, minutes: 20, days: [2], times: { 2: '21:10' }, start_date: TUE, ...extra };
    const req = new Request('https://x/api/pay/enroll/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try { const r = await O.handleEnrollApi(req, new URL(req.url), env); return r ? await r.json() : { __err: 'null response' }; }
    catch (e) { return { __err: String(e.message || e) }; }
  };
  let tok = ''; try { tok = await T.signUidToken('stu', env); } catch (e) { console.log('  (토큰 발급 실패) ' + e.message); }
  const own = await call({ uid: 'stu', token: tok });
  ok(own && own.ok && own.student_checked === true && own.student_busy === true && own.ok_to_book === false && own.first_student_conflict === TUE,
    '본인 토큰이면 학생 겹침을 보고 «예약 불가 · 첫 겹침 날짜» 로 답한다', own);
  const anon = await call({ uid: 'stu' });
  ok(anon && anon.ok && anon.student_checked === false && anon.student_busy === false && anon.ok_to_book === true,
    '(짝) 토큰 없이 uid 만 넣으면 학생 일정을 안 본다 — 엿보기 차단', anon);
  let otherTok = ''; try { otherTok = await T.signUidToken('other', env); } catch {}
  const spoof = await call({ uid: 'stu', token: otherTok });
  ok(spoof && spoof.ok && spoof.student_checked === false && spoof.student_busy === false,
    '(짝) 남의 토큰으로 다른 uid 를 넣어도 안 본다', spoof);
  const clean = await call({ uid: 'other', token: otherTok });
  ok(clean && clean.ok && clean.student_checked === true && clean.student_busy === false && clean.ok_to_book === true,
    '(짝) 본인인데 겹침이 없으면 그대로 예약 가능', clean);
}
{
  /* 학생 화면이 본인 토큰을 실어 보내고, 학생 겹침을 강사 겹침과 다른 말로 그리는가 */
  const html = readFileSync(resolve(__dir, '../cloudflare-deploy/public/enroll.html'), 'utf8');
  const i = html.indexOf("fetch('/api/pay/enroll/check'");
  const seg = i >= 0 ? html.slice(i, html.indexOf('}, 450);', i)) : '';
  ok(seg.length > 0, '전제: enroll.html 의 미리보기 호출을 찾았다');
  ok(/uid\s*:\s*UID/.test(seg) && /token\s*:\s*TOKEN/.test(seg), '미리보기 호출이 uid·token 을 함께 보낸다');
  const bi = seg.indexOf('d.student_busy'), ci = seg.indexOf('d.conflict_count');
  ok(bi > 0 && ci > 0 && bi < ci && /이 학생은/.test(seg.slice(bi, ci)), '학생 겹침이면 «이 학생은 …» 으로 따로 말한다(강사 겹침 문구보다 먼저 가른다)');
}

done();
