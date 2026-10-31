#!/usr/bin/env node
/**
 * enroll_sessions_duration_harness.mjs — 수강신청 확정의 «회차 수 = 수강 기간» (2026-09-29)
 *
 * 발단(운영 D1 실측): enroll-activate.ts 가 회차 수를 parseSessions(package) 하나로만 정해서,
 *   package 가 '정규수업' 이면 «주 N회 × 4주» 만 만들었다. 6개월 등록 전원이 활성 회차 4·8개뿐이었고
 *   (enrollments 120 delaware 6개월 → 9/29~10/20 4회), 4주 뒤 학생 화면에서 수업이 에러 없이 사라졌다.
 *
 * 무엇을 보나 — 문자열이 아니라 **실제로 돌려서**:
 *   A. planSessionCount(순수) — 6개월 주1회≈26 · 주2회≈52 · 회권 명시가 우선 · 둘 다 없으면 ×4 · 'unlimited' ×4 · 지난 종료일은 폴백+경고
 *   B. buildEnrollPlan 을 진짜 SQLite(node:sqlite) 로 — 날짜가 종료일을 넘지 않는다(공휴일로 밀려도)
 *   C. 백필(planEnrollBackfill / runEnrollBackfill) 을 진짜 SQLite 로 — dry 는 안 쓴다 · cancelled 날짜를 되살리지 않는다 ·
 *      중복 없음 · 두 번 돌려도 0 · 공휴일·강사 충돌 건너뜀 · 기간 모르면 안 만든다
 *   D. 라우트 — backfill 은 본사 게이트를 먼저 지난다(무인증 401·아무것도 안 씀) · dry 기본 · 모르는 action 거절
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dir, '../cloudflare-deploy/src');
/* 변이시험용: ENROLL_ACTIVATE_SRC=<고친 사본> 으로 가리킬 수 있다(저장소 파일을 고쳤다 되돌리지 않으려고). */
const OVERRIDE = process.env.ENROLL_ACTIVATE_SRC || '';
const readSrc = (n) => (n === 'enroll-activate' && OVERRIDE) ? readFileSync(OVERRIDE, 'utf8') : readFileSync(resolve(SRC_DIR, n + '.ts'), 'utf8');

/* 상대 import 를 사본 절대경로로 바꾼 임시 사본(로직은 한 글자도 안 바꾼다) — c24_mirror_harness 와 같은 방식 */
const _tmps = [], _made = new Map();
const mkCopy = (name) => {
  if (_made.has(name)) return _made.get(name);
  const f = resolve(tmpdir(), `${name}.esd.${process.pid}.ts`);
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

let M = null;
try { M = await import(pathToFileURL(mkCopy('enroll-activate')).href); }
catch (e) { console.log('  (정본 로드 실패) ' + (e && e.message)); }
ok(!!(M && M.planSessionCount && M.buildEnrollPlan && M.planEnrollBackfill && M.runEnrollBackfill), '전제: 정본을 불러왔다');
if (!M || !M.planSessionCount) { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(1); }

/* 독립 계산기 — 정본을 베끼지 않고 따로 센다 */
const countDow = (from, until, dows) => {
  let n = 0; const d = new Date(from + 'T00:00:00Z');
  while (d.toISOString().slice(0, 10) <= until) { if (dows.includes(d.getUTCDay())) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
};
const addDay = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const safe = (fn) => { try { return fn(); } catch (e) { return { __err: String(e && e.message || e) }; } };

/* ═══ A. 순수 판정 ═══ */
console.log('\n[ A. planSessionCount — 회차 수 = 수강 기간 ]');
{
  const S = '2026-09-29';   // 화요일
  const P = (o) => safe(() => M.planSessionCount(Object.assign({ pkg: '정규수업', days: [2], startDay: S, enrollStartDay: S }, o)));
  const a1 = P({ durationMonths: '6' });
  const exp1 = countDow(S, '2027-03-28', [2]);
  ok(a1.sessions === exp1 && a1.sessions >= 25 && a1.sessions <= 27, `6개월 주1회(화) → 약 26회 (정본 ${a1.sessions} · 독립계산 ${exp1})`, a1);
  ok(a1.basis === 'duration_months' && a1.until === '2027-03-28', '근거는 duration_months, 끝은 «6개월 전날»', a1);
  const a2 = P({ days: [2, 4], durationMonths: '6' });
  ok(a2.sessions === countDow(S, '2027-03-28', [2, 4]) && a2.sessions >= 51 && a2.sessions <= 53, `6개월 주2회(화·목) → 약 52회 (${a2.sessions})`, a2);
  const a3 = P({ days: [2, 4], endDate: '2027-03-29' });
  ok(a3.basis === 'end_date' && a3.until === '2027-03-29' && a3.sessions === countDow(S, '2027-03-29', [2, 4]), 'end_date 가 있으면 그것까지(포함) 센다 (delaware 120 모양)', a3);
  const a3b = P({ days: [2, 4], endDate: '2027-03-29', durationMonths: '1' });
  ok(a3b.basis === 'end_date', '(짝) end_date 가 duration_months 보다 우선', a3b);
  const a4 = P({ pkg: '1:1 12회권', days: [2, 4], durationMonths: '6', endDate: '2027-03-29' });
  ok(a4.sessions === 12 && a4.basis === 'package', '회권 명시(12회권)가 기간보다 우선 — 옛 동작 보존', a4);
  const a4b = P({ pkg: '총 10회', days: [2], durationMonths: '6' });
  ok(a4b.sessions === 10 && a4b.basis === 'package', '«총 N회» 도 우선', a4b);
  const a5 = P({ days: [2, 4] });
  ok(a5.sessions === 8 && a5.basis === 'fallback' && a5.until === null, '기간 정보가 없으면 옛 폴백(주2회 × 4주 = 8)', a5);
  const a6 = P({ days: [2, 4], durationMonths: 'unlimited' });
  ok(a6.sessions === 8 && a6.basis === 'fallback', "'unlimited' 는 날짜로 못 세니 옛 폴백", a6);
  const a7 = P({ days: [2], durationMonths: 'x6' });
  ok(a7.basis === 'fallback', '모르는 값은 지어내지 않는다(폴백)', a7);
  const a8 = P({ days: [2], endDate: '2026-09-01' });
  ok(a8.basis === 'fallback' && a8.expired === true && a8.sessions === 4, '종료일이 이미 지났으면 폴백 + expired 표시', a8);
  const a8b = P({ days: [2], durationMonths: '6' });
  ok(a8b.expired === false, '(짝) 기간 안이면 expired 아님', a8b);
  const a9 = P({ days: [2, 4], durationMonths: '6', startDay: '2026-12-01' });
  ok(a9.sessions === countDow('2026-12-01', '2027-03-28', [2, 4]), '시작이 오늘로 당겨졌으면 «남은» 기간만 센다(개월은 원래 시작일 기준)', a9);
  const a10 = P({ days: [0, 1, 2, 3, 4, 5, 6], endDate: '2030-12-31' });
  ok(a10.sessions === 400, '상한 400 유지', a10);
  ok(M.addMonthsDay('2026-01-31', 1) === '2026-02-28' && M.addMonthsDay('2026-11-15', 3) === '2027-02-15', 'addMonthsDay 말일 보정·해 넘김');
  ok(M.validDay('2027-02-30') === null && M.validDay('2027-03-29') === '2027-03-29' && M.validDay('') === null, 'validDay 는 실재하는 날짜만');
  ok(M.parseSessions('정규수업', 2) === 8, '(전제) 옛 parseSessions 는 그대로 — 폴백의 근거');
}

/* ═══ 진짜 SQLite 를 D1 모양으로 ═══ */
function makeEnv() {
  const db = new DatabaseSync(':memory:');
  const wrap = (sql, b = []) => ({
    _sql: sql, _b: b,
    bind: (...x) => wrap(sql, x.map((v) => (v === undefined ? null : v))),
    first: async () => db.prepare(sql).get(...b) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...b) }),
    run: async () => { const r = db.prepare(sql).run(...b); return { meta: { changes: Number(r.changes || 0) } }; },
  });
  const env = {
    DB: {
      exec: async (sql) => { db.exec(sql); },
      prepare: (sql) => wrap(sql),
      batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    },
  };
  db.exec(`CREATE TABLE enrollments (id INTEGER PRIMARY KEY, student_user_id TEXT, student_name TEXT, package TEXT, started_at INTEGER, ended_at INTEGER,
            monthly_fee_krw INTEGER, status TEXT, notes TEXT, created_at INTEGER, updated_at INTEGER, days_of_week TEXT, time TEXT, class_size TEXT,
            type TEXT, teacher_name TEXT, end_date TEXT, assign_priority TEXT, duration_months TEXT, duration_min INTEGER, base_fee_krw INTEGER, fee_source TEXT, parent_phone TEXT)`);
  db.exec(`CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)`);
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, parent_phone TEXT, student_phone TEXT, phone TEXT)`);
  db.exec(`INSERT INTO teachers (id, name, active) VALUES (5, 'HANNAH', 1), (6, 'KAYE', 1)`);
  db.exec(`INSERT INTO students_erp (user_id, korean_name) VALUES ('delaware', '김연숙')`);
  return { env, db };
}
const KST_TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstMs = (day) => Date.parse(day + 'T00:00:00+09:00');
/* 오늘 이후 첫 화요일 */
const nextDow = (from, dow) => { let d = from; for (let i = 0; i < 7; i++) { if (new Date(d + 'T00:00:00Z').getUTCDay() === dow) return d; d = addDay(d, 1); } return from; };

/* ═══ B. buildEnrollPlan ═══ */
console.log('\n[ B. buildEnrollPlan — 진짜 SQLite ]');
{
  const { env, db } = makeEnv();
  const start = nextDow(KST_TODAY, 2);
  const endDate = M.addMonthsDay(start, 6);
  const hol = addDay(start, 14);   // 3주차 화요일을 공휴일로
  db.exec(`CREATE TABLE IF NOT EXISTS enroll_holidays (day TEXT PRIMARY KEY, name TEXT, created_by TEXT, created_at INTEGER)`);
  db.prepare(`INSERT INTO enroll_holidays (day, name) VALUES (?, '테스트휴일')`).run(hol);
  db.prepare(`INSERT INTO enrollments (id, student_user_id, student_name, package, started_at, status, days_of_week, time, teacher_name, end_date, duration_months)
              VALUES (120, 'delaware', '김연숙', '정규수업', ?, 'confirmed', '화목', '21:10', 'HANNAH', ?, '6')`).run(kstMs(start), endDate);
  let p = null; try { p = await M.buildEnrollPlan(env, 120); } catch (e) { p = { __err: String(e.message || e) }; }
  const expect = countDow(start, endDate, [2, 4]);
  ok(p && p.sessions === expect && p.sessions >= 50, `6개월 화·목 → ${expect}회를 계획한다 (정본 ${p && p.sessions})`, p && (p.__err || p.sessions));
  ok(p && p.sessions_basis === 'end_date' && p.until === endDate, '근거·끝 날짜를 함께 돌려준다', p && { b: p.sessions_basis, u: p.until });
  const maxD = p && p.dates && p.dates.length ? p.dates[p.dates.length - 1] : '';
  ok(p && p.dates && p.dates.length > 40 && maxD <= endDate, `날짜가 종료일(${endDate})을 넘지 않는다 — 공휴일로 밀려도 (마지막 ${maxD})`, p && p.dates && p.dates.length);
  ok(p && p.dates && !p.dates.includes(hol) && p.dates.length === expect - 1, '공휴일은 빠지고 그만큼 줄어든다(종료일 뒤로 새지 않음)', p && p.dates && p.dates.length);
  /* 폴백 짝 — 기간 없는 신청은 옛 동작(×4) */
  db.prepare(`INSERT INTO enrollments (id, student_user_id, student_name, package, started_at, status, days_of_week, time, teacher_name)
              VALUES (121, 'delaware', '김연숙', '정규수업', ?, 'confirmed', '화목', '21:10', 'HANNAH')`).run(kstMs(start));
  let q = null; try { q = await M.buildEnrollPlan(env, 121); } catch (e) { q = { __err: String(e.message || e) }; }
  ok(q && q.sessions === 8 && q.sessions_basis === 'fallback' && q.until === null, '(짝) 기간 정보 없는 신청은 예전처럼 8회', q && (q.__err || q.sessions));
}

/* ═══ C. 백필 ═══ */
console.log('\n[ C. 백필 — 진짜 SQLite ]');
async function seedBackfill() {
  const { env, db } = makeEnv();
  // ensureEnrollTables 가 class_schedules 를 만든다(정본 스키마)
  try { await M.buildEnrollPlan(env, 999999); } catch {}
  const start = nextDow(KST_TODAY, 2);
  const endDate = M.addMonthsDay(start, 2);    // 2개월짜리로 작게
  db.prepare(`INSERT INTO enrollments (id, student_user_id, student_name, package, started_at, status, days_of_week, time, teacher_name, end_date, duration_months)
              VALUES (120, 'delaware', '김연숙', '정규수업', ?, 'confirmed', '화목', '21:10', 'HANNAH', ?, '2')`).run(kstMs(start), endDate);
  // 옛 결함 그대로 — 4주 × 화목 = 8회(활성), 그중 1회는 사람이 취소
  const d8 = []; { let d = start; while (d8.length < 8) { const w = new Date(d + 'T00:00:00Z').getUTCDay(); if (w === 2 || w === 4) d8.push(d); d = addDay(d, 1); } }
  const ins = db.prepare(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_by, created_at)
                          VALUES ('delaware', '김연숙', 'dated', 'regular', ?, '21:10', 20, '5', ?, 'adm-enroll:120', 'admin', 1)`);
  d8.forEach((d, i) => ins.run(d, i === 3 ? 'cancelled' : 'active'));
  const last = d8[d8.length - 1];
  // 마지막 활성 «뒤» 에 사람이 취소한 회차가 하나 있다 — 되살리면 안 된다
  const cancelledAfter = (() => { let d = addDay(last, 1); for (;;) { const w = new Date(d + 'T00:00:00Z').getUTCDay(); if (w === 2 || w === 4) return d; d = addDay(d, 1); } })();
  ins.run(cancelledAfter, 'cancelled');
  return { env, db, start, endDate, d8, last, cancelledAfter };
}
const countSrc = (db) => db.prepare(`SELECT COUNT(*) AS n FROM class_schedules WHERE source = 'adm-enroll:120'`).get().n;
{
  const S = await seedBackfill();
  const before = countSrc(S.db);
  let r = null; try { r = await M.runEnrollBackfill(S.env, 120, true, 'test'); } catch (e) { r = { __err: String(e.message || e) }; }
  const expectAdd = countDow(addDay(S.last, 1), S.endDate, [2, 4]) - 1;   // 취소된 한 날 제외
  ok(r && r.ok && r.dry === true && r.add.length === expectAdd, `dry — 모자란 ${expectAdd}회를 계획한다 (정본 ${r && r.add && r.add.length})`, r && (r.__err || r.reason));
  ok(countSrc(S.db) === before, '🔴 dry 는 한 줄도 안 쓴다', { before, after: countSrc(S.db) });
  ok(r && r.add.every((a) => a.date > S.last && a.date <= S.endDate), '채우는 구간은 «마지막 활성 다음날 ~ 종료일»');
  ok(r && !r.add.some((a) => a.date === S.cancelledAfter) && r.skipped.existing.includes(S.cancelledAfter), '🔴 사람이 취소한 날짜는 되살리지 않는다', r && r.skipped);
  ok(r && !r.add.some((a) => a.date === S.d8[3]), '(짝) 중간의 취소 날짜도 거꾸로 메우지 않는다');
  ok(r && r.add.every((a) => a.teacher_id === '5' && a.start_time === '21:10' && a.duration_min === 20), '같은 강사·시각·길이로 잇는다');

  let w = null; try { w = await M.runEnrollBackfill(S.env, 120, false, 'test'); } catch (e) { w = { __err: String(e.message || e) }; }
  ok(w && w.ok && w.created === expectAdd, `실행하면 ${expectAdd}회를 만든다 (${w && w.created})`, w && (w.__err || w.error));
  const dups = S.db.prepare(`SELECT scheduled_date, COUNT(*) AS n FROM class_schedules WHERE source='adm-enroll:120' GROUP BY scheduled_date HAVING n > 1`).all();
  ok(dups.length === 0, '같은 날짜가 두 번 생기지 않는다', dups);
  const canc = S.db.prepare(`SELECT status FROM class_schedules WHERE source='adm-enroll:120' AND scheduled_date = ?`).all(S.cancelledAfter);
  ok(canc.length === 1 && canc[0].status === 'cancelled', '취소된 날짜는 여전히 취소 한 줄뿐', canc);
  const maxD = S.db.prepare(`SELECT MAX(scheduled_date) AS m FROM class_schedules WHERE source='adm-enroll:120'`).get().m;
  ok(maxD <= S.endDate, '종료일을 넘는 행이 없다', maxD);
  let w2 = null; try { w2 = await M.runEnrollBackfill(S.env, 120, false, 'test'); } catch (e) { w2 = { __err: String(e.message || e) }; }
  ok(w2 && w2.created === 0 && w2.add.length === 0, '멱등 — 두 번째 실행은 0건', w2 && (w2.__err || w2.add.length));
}
{
  /* 공휴일·강사 충돌은 건너뛴다 */
  const S = await seedBackfill();
  const cands = []; { let d = addDay(S.last, 1); while (d <= S.endDate) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if ((wd === 2 || wd === 4) && d !== S.cancelledAfter) cands.push(d); d = addDay(d, 1); } }
  const hol = cands[0], busy = cands[1];
  S.db.prepare(`INSERT INTO enroll_holidays (day, name) VALUES (?, '휴일')`).run(hol);
  S.db.prepare(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
                VALUES ('other', '남', 'dated', 'regular', ?, '21:15', 20, '5', 'active', 'admin_ui', 1)`).run(busy);
  let r = null; try { r = await M.runEnrollBackfill(S.env, 120, true, 'test'); } catch (e) { r = { __err: String(e.message || e) }; }
  ok(r && r.skipped.holiday.includes(hol) && !r.add.some((a) => a.date === hol), '공휴일은 건너뛴다', r && (r.__err || r.skipped));
  ok(r && r.skipped.conflict.includes(busy) && !r.add.some((a) => a.date === busy), '강사가 그 시간에 다른 수업이면 건너뛴다', r && r.skipped);
  ok(r && r.add.length === cands.length - 2, '(짝) 나머지는 그대로 채운다', r && r.add.length);
}
{
  /* 기간을 모르면 안 만든다 · 확정 전이면 안 만든다 */
  const S = await seedBackfill();
  S.db.exec(`UPDATE enrollments SET end_date = NULL, duration_months = 'unlimited' WHERE id = 120`);
  let r = null; try { r = await M.runEnrollBackfill(S.env, 120, false, 'test'); } catch (e) { r = { __err: String(e.message || e) }; }
  ok(r && r.ok === false && r.reason === 'no_period' && r.created === 0, "기간을 모르면('unlimited') 지어내지 않는다", r && (r.__err || r.reason));
  S.db.exec(`UPDATE enrollments SET duration_months = '2', status = 'pending' WHERE id = 120`);
  let r2 = null; try { r2 = await M.runEnrollBackfill(S.env, 120, false, 'test'); } catch (e) { r2 = { __err: String(e.message || e) }; }
  ok(r2 && r2.ok === false && r2.reason === 'not_confirmed' && r2.created === 0, '확정 전 신청은 채우지 않는다', r2 && (r2.__err || r2.reason));
}

/* ═══ D. 라우트 ═══ */
console.log('\n[ D. 라우트 — 게이트·기본값 ]');
{
  const S = await seedBackfill();
  const before = countSrc(S.db);
  const mk = (body) => new Request('https://mangoi.ai/api/admin/enrollments/120/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let res = null;
  try { res = await M.handleEnrollActivateApi(mk({ action: 'backfill', dry: false }), new URL('https://mangoi.ai/api/admin/enrollments/120/activate'), S.env, 'x'); }
  catch (e) { res = { status: 'throw:' + e.message }; }
  ok(res && (res.status === 401 || res.status === 403), '🔴 무인증 backfill 은 본사 게이트에서 막힌다(401/403)', res && res.status);
  ok(countSrc(S.db) === before, '(짝) 막히면 아무것도 안 쓴다');
  let r2 = null;
  try { r2 = await M.handleEnrollActivateApi(mk({ action: 'wipe' }), new URL('https://mangoi.ai/api/admin/enrollments/120/activate'), S.env, 'x'); }
  catch (e) { r2 = { status: 'throw:' + e.message }; }
  ok(r2 && r2.status === 400, '모르는 action 은 400', r2 && r2.status);
  /* dry 기본값 — 라우트의 식을 오려 내 실제로 평가 */
  const src = readSrc('enroll-activate');
  const blk = src.slice(src.indexOf("action === 'backfill'"));
  const m = /const dry = ([^;]+);/.exec(blk);
  ok(!!m, '전제: 백필 갈래의 dry 식을 찾았다');
  const ev = (body) => { try { return new Function('body', 'return (' + m[1] + ');')(body); } catch (e) { return 'err'; } };
  ok(m && ev({}) === true && ev({ dry: true }) === true && ev({ dry: 'false' }) === true && ev({ dry: 0 }) === true, '🔴 dry 는 기본 true — false 를 «명시» 해야만 쓴다');
  ok(m && ev({ dry: false }) === false, '(짝) dry:false 면 쓴다');
  const gi = blk.indexOf('enrollAdminHqOnly('), ri = blk.indexOf('runEnrollBackfill(');
  ok(gi > 0 && ri > gi, '본사 게이트가 실행보다 앞에 있다');
}

/* ═══ E. 수업 종류(class_type) — 2026-10-06 「체험수업으로 확정했는데 정규수업으로 나온다」 ═══ */
console.log('\n[ E. 수업 종류 — 체험은 trial 로 ]');
{
  const T = M.enrollClassType;
  ok(typeof T === 'function', '전제: enrollClassType 이 있다');
  const t = (o) => safe(() => T(o));
  ok(t({ type: '체험수업', package: '체험수업 · 총 1회' }) === 'trial', '🔴 체험수업 → trial (사고 그대로)');
  ok(t({ type: '', package: '체험수업' }) === 'trial', 'type 이 비어도 package 로 → trial');
  ok(t({ type: '레벨테스트' }) === 'level_test' && t({ package: '보강 1회' }) === 'makeup', '레벨테스트·보강도 갈린다');
  ok(t({ type: '정규수업', package: '정규수업' }) === 'regular', '(짝) 정규수업은 그대로 regular');
  ok(t({}) === 'regular' && t(null) === 'regular' && t({ type: '???' }) === 'regular', '(짝) 모르면 예전처럼 regular — 지어내지 않는다');
  /* 백필을 진짜 SQLite 로 — 체험 신청이면 trial 로 적힌다 */
  const S = await seedBackfill();
  S.db.prepare(`UPDATE enrollments SET type='체험수업', package='1회권' WHERE id=120`).run();
  S.db.prepare(`UPDATE class_schedules SET class_type='trial' WHERE source='adm-enroll:120'`).run();
  let r = null; try { r = await M.runEnrollBackfill(S.env, 120, false, 'h'); } catch (e) { r = { __err: e.message }; }
  const kinds = S.db.prepare(`SELECT DISTINCT class_type k FROM class_schedules WHERE source='adm-enroll:120' AND created_by='h'`).all().map(x => x.k);
  ok(r && r.created > 0 && kinds.length === 1 && kinds[0] === 'trial', '🔴 백필이 체험 신청을 trial 로 만든다(실행 — type 칸에만 «체험»)', { r: r && (r.__err || r.created), kinds });
  const S2 = await seedBackfill();
  let r2 = null; try { r2 = await M.runEnrollBackfill(S2.env, 120, false, 'h'); } catch (e) { r2 = { __err: e.message }; }
  const k2 = S2.db.prepare(`SELECT DISTINCT class_type k FROM class_schedules WHERE source='adm-enroll:120' AND created_by='h'`).all().map(x => x.k);
  ok(r2 && r2.created > 0 && k2.length === 1 && k2[0] === 'regular', '(짝) 정규 신청 백필은 regular 그대로', { r: r2 && (r2.__err || r2.created), k2 });
  /* 확정 경로(runActivate — 내보내지 않음)는 구조로: INSERT 에 'regular' 를 못 박지 않고 그 신청으로 종류를 정한다 */
  const src = readSrc('enroll-activate').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const ins = src.match(/INSERT OR IGNORE INTO class_schedules[\s\S]*?VALUES \([^)]*\)/g) || [];
  ok(ins.length === 2, '전제: 시간표 INSERT 두 곳을 찾았다', ins.length);
  ok(ins.every(x => !/'regular'/.test(x)), "🔴 INSERT 에 'regular' 를 못 박지 않았다");
  const binds = src.match(/stmt\.bind\(uid, String\(e\??\.student_name \|\| ''\), ([^,]+),/g) || [];
  ok(binds.length === 2 && binds.every(b => /enrollClassType\(e\)/.test(b)), '두 INSERT 모두 그 신청(e)으로 종류를 정한다', binds);
  const ai = src.indexOf('async function runActivate'); const eAt = src.indexOf('const e = plan.enrollment', ai);
  ok(ai > 0 && eAt > ai, '전제: 확정 경로의 e 는 신청서 전체(plan.enrollment = SELECT *)');
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
