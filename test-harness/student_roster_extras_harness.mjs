#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   💰📅 학생 목록 «최근 결제»·«다음 수업» 칸 — 정본 실행 + 무작위 샌드박스 (2026-10-13)
   ───────────────────────────────────────────────────────────────────────────
   정본: cloudflare-deploy/src/student-roster-extras.ts
   ① 순수 함수 고정 사례(짝으로)
   ② 무작위 샌드박스 — pickLastPayments / pickNextClass 를 «따로 짠 판정» 과 수백 번 대조,
      행 순서를 뒤섞어도 같은 답인가(결정론)
   ③ 끝에서 끝까지 — 진짜 SQLite(node:sqlite)를 D1 모양으로 감싸 attachRosterExtras 를
      수백 번 돌려 «SQL + 판정» 이 따로 짠 판정과 같은지(취소·자리표시·남의 행·씨앗·계정 키)
   ④ 실패해도 던지지 않는다(fail-open) · 그 두 칸만 비운다
   ⑤ 배선 — unified 응답이 정본을 부르는가 · 화면 매핑이 옮기는가 · 칸 수 22 대조
   ⑥ 화면 셀 함수를 오려 내 실제로 돌림
   변이시험: MUT=<이름> 으로 정본 사본을 바꿔 돌린다(저장소 파일은 안 건드림).
   ═══════════════════════════════════════════════════════════════════════════ */
process.env.TZ = 'America/Los_Angeles';   // ⚠️ getDay/getUTCDay 혼동을 잡으려면 UTC «보다 늦은» 시간대에서 돌려야 한다(KST·UTC 에서는 같은 답이라 못 잡음)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = (p) => readFileSync(p, 'utf8');
let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) PASS++; else { FAIL++; console.log('  ❌ FAIL ' + m); } };
const ROUNDS = Number(process.env.ROUNDS || 400);

// ── 결정론 난수 ──
let SEED = Number(process.env.SEED || 20261013);
const rnd = () => { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ── 정본 로드 ──
const loadTs = async (file, rewrite) => {
  let code = stripTypeScriptTypes(rd(resolve(SRC, file)));
  if (rewrite) code = rewrite(code);
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
};
let CSD, AUID, SSS, M;
const MUTS = {
  cancelled_counts: [`String(r.status ?? '') !== 'paid'`, `false`],
  tie_flip: [`cand.amount_krw > cur.amount_krw`, `cand.amount_krw < cur.amount_krw`],
  started_counts: [`at <= nowMs ||`, `at < nowMs ||`],
  no_limit: [` || at >= limit) return;`, `) return;`],
  pay_ignores_flag: [`if (opts.withPay === false)`, `if (false)`],
  no_recur_gate: [`if (!recurStartedOn(r, ymd)) continue;`, ``],
  no_where: [`WHERE \${SCHED_SUMMARY_WHERE} AND user_id`, `WHERE user_id`],
  no_c24: [`AND room_id LIKE 'c24-%'`, ``],
  local_dow: [`new Date(dms).getUTCDay()`, `new Date(dms).getDay()`],
  kst_flip: [`(h * 60 + mi) * 60e3 - KST`, `(h * 60 + mi) * 60e3 + KST`],
  no_seed: [`for (const a of seedAts || []) take(Number(a), 'cafe24');`, ``],
  pay_not_paid: [`WHERE status = 'paid' AND user_id`, `WHERE user_id`],
  throws: [`if (!uids.length) return;`, `if (!uids.length) return; if (uids.length) throw new Error('x');`],
};
const MUT = process.env.MUT || '';
try {
  CSD = await loadTs('class-start-date.ts');
  AUID = await loadTs('attendance-uid.ts');
  SSS = await loadTs('student-schedule-summary.ts', c => c.replace(/^import[^;]*;$/gm, ''));
  globalThis.__RX = { ...CSD, ...AUID, SCHED_SUMMARY_WHERE: SSS.SCHED_SUMMARY_WHERE };
  M = await loadTs('student-roster-extras.ts', (code) => {
    code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
      names.split(',').map(n => n.trim()).filter(Boolean).map(n => `const ${n} = globalThis.__RX.${n};`).join('\n'));
    if (MUT) {
      const [a, b] = MUTS[MUT] || [];
      if (!a || !code.includes(a)) { console.log('  ⚠️ 변이 앵커 0곳: ' + MUT); process.exit(3); }
      code = code.split(a).join(b);
    }
    return code;
  });
} catch (e) { console.log('  (정본 로드 실패) ' + e.message); }
ok(!!(M && M.pickLastPayments && M.pickNextClass && M.attachRosterExtras), '전제: 정본을 불러왔다');
if (!M) { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(1); }

// ── 요일 정본(admDowMatches)을 api-admin.ts 에서 오려 낸다 ──
const ADMIN = rd(resolve(SRC, 'api-admin.ts'));
let admDowMatches = null;
{
  const a = ADMIN.indexOf('const ADM_DOW_MAP');
  const fi = ADMIN.indexOf('function admDowMatches(', a);
  let i = ADMIN.indexOf('{', fi), d = 0, e = i;
  for (; e < ADMIN.length; e++) { if (ADMIN[e] === '{') d++; else if (ADMIN[e] === '}' && --d === 0) break; }
  const block = stripTypeScriptTypes(ADMIN.slice(a, e + 1));
  try { admDowMatches = new Function(block + '\nreturn admDowMatches;')(); } catch (er) { console.log('  dow 오려내기 실패 ' + er.message); }
}
ok(typeof admDowMatches === 'function' && admDowMatches('Mon', 1) && admDowMatches('1,3', 3) && admDowMatches('목', 4) && !admDowMatches('x', 1),
  '전제: 요일 정본(admDowMatches)을 오려 냈다');

// ── 따로 짠 판정(오라클) ──
const KST = 9 * 3600e3;
const oKst = (ymd, hm) => {
  const d = String(ymd ?? '').trim().slice(0, 10);
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm ?? '').trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !m) return null;
  const [Y, Mo, D] = d.split('-').map(Number);
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59 || Mo < 1 || Mo > 12 || D < 1) return null;
  const t = Date.UTC(Y, Mo - 1, D);
  if (new Date(t).getUTCDate() !== D || new Date(t).getUTCMonth() !== Mo - 1) return null;
  return t + (h * 60 + mi) * 60000 - KST;
};
const oLastPay = (rows) => {
  const by = {};
  for (const r of rows) {
    if (!r || r.status !== 'paid') continue;
    const uid = String(r.user_id ?? '').trim(); const at = Number(r.paid_at);
    if (!uid || !(at > 0) || !Number.isFinite(at)) continue;
    (by[uid] = by[uid] || []).push({ at, amt: Number.isFinite(Number(r.amount_krw)) ? Number(r.amount_krw) : 0, id: Number(r.id) || 0 });
  }
  const out = {};
  for (const k in by) {
    const s = by[k].sort((x, y) => (y.at - x.at) || (y.amt - x.amt) || (y.id - x.id));
    out[k] = { paid_at: s[0].at, amount_krw: s[0].amt };
  }
  return out;
};
const oNext = (rows, seeds, now) => {
  const cands = [];
  const today = new Date(now + KST).toISOString().slice(0, 10);
  for (const r of rows) {
    const sd = String(r.scheduled_date ?? '').trim();
    if (sd) { const t = oKst(sd, r.start_time); if (t != null) cands.push([t, 'mangoi']); continue; }
    if (r.day_of_week == null || String(r.day_of_week).trim() === '') continue;
    for (let i = 0; i <= 14; i++) {
      const ymd = new Date(Date.parse(today + 'T00:00:00Z') + i * 86400e3).toISOString().slice(0, 10);
      const [Y, Mo, D] = ymd.split('-').map(Number);
      const dow = new Date(Date.UTC(Y, Mo - 1, D)).getUTCDay();
      if (!admDowMatches(r.day_of_week, dow)) continue;
      if (!CSD.recurStartedOn(r, ymd)) continue;
      const t = oKst(ymd, r.start_time); if (t != null) cands.push([t, 'mangoi']);
    }
  }
  for (const s of seeds) cands.push([Number(s), 'cafe24']);
  const limit = Date.UTC(...today.split('-').map((x, i) => i === 1 ? x - 1 : +x)) - KST + 15 * 86400e3;   // 오늘(KST) 0시 + 15일
  const fut = cands.filter(c => Number.isFinite(c[0]) && c[0] > now && c[0] < limit).sort((a, b) => a[0] - b[0]);
  if (!fut.length) return null;
  const k = new Date(fut[0][0] + KST).toISOString();
  return { at: fut[0][0], ymd: k.slice(0, 10), hm: k.slice(11, 16), source: fut[0][1] };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortObj = (o) => Object.keys(o).sort().map(k => [k, o[k]]);

// ═══ ① 고정 사례 ═══
console.log('① 고정 사례');
{
  const P = M.pickLastPayments([
    { id: 1, user_id: 'a', paid_at: 100, amount_krw: 5, status: 'paid' },
    { id: 2, user_id: 'a', paid_at: 300, amount_krw: 9, status: 'cancelled' },
    { id: 3, user_id: 'a', paid_at: 200, amount_krw: 7, status: 'paid' },
    { id: 4, user_id: 'b', paid_at: 50, amount_krw: 1, status: 'paid' },
    { id: 5, user_id: 'b', paid_at: 50, amount_krw: 3, status: 'paid' },
  ]);
  ok(same(P.get('a'), { paid_at: 200, amount_krw: 7 }), '가장 늦은 paid 를 고른다 · 취소(cancelled)는 결제가 아니다');
  ok(same(P.get('b'), { paid_at: 50, amount_krw: 3 }), '같은 시각이면 금액 큰 쪽(결정론)');
  ok(!P.has('c'), '(짝) 결제가 없는 학생은 값이 없다(지어내지 않음)');
  ok(M.pickLastPayments([{ id: 1, user_id: 'x', paid_at: 0, amount_krw: 1, status: 'paid' }]).size === 0, '(짝) 시각이 0 이면 결제로 안 센다');

  const now = M.kstToMs('2026-10-13', '15:00');   // 화요일
  ok(M.kstToMs('2026-10-13', '15:00') === Date.UTC(2026, 9, 13, 6, 0), 'KST 15:00 = UTC 06:00');
  ok(M.kstToMs('2026-02-30', '10:00') === null && M.kstToMs('2026-10-13', '24:00') === null && M.kstToMs('2026-10-13', '9:5') === null, '깨진 날짜·시각은 null');
  const n1 = M.pickNextClass([{ scheduled_date: '2026-10-13', start_time: '15:00' }, { scheduled_date: '2026-10-13', start_time: '15:01' }], [], now, admDowMatches);
  ok(n1 && n1.hm === '15:01', '이미 시작한 수업은 «다음» 이 아니다(시작 시각 > 지금)');
  const n2 = M.pickNextClass([{ day_of_week: 'Tue', start_time: '14:00' }], [], now, admDowMatches);
  ok(n2 && n2.ymd === '2026-10-20' && n2.hm === '14:00', '매주 반복 — 오늘 지났으면 다음 주');
  const n3 = M.pickNextClass([{ day_of_week: '2', start_time: '14:00', skip_dates: '2026-10-20' }], [], now, admDowMatches);
  ok(n3 && n3.ymd === '2026-10-27', '그 주만 빠지는 날(skip_dates)은 건너뛴다');
  const n4 = M.pickNextClass([{ day_of_week: '화', start_time: '14:00', starts_on: '2026-11-03' }], [], now, admDowMatches);
  ok(n4 === null, '시작일(starts_on)이 14일 밖이면 «—»');
  const n5 = M.pickNextClass([{ day_of_week: 'Wed', start_time: '09:00' }], [now + 3600e3], now, admDowMatches);
  ok(n5 && n5.source === 'cafe24' && n5.hm === '16:00', '카페24 예약이 더 이르면 그것');
  ok(M.pickNextClass([{ scheduled_date: '2026-10-28', start_time: '10:00' }], [now + 16 * 86400e3], now, admDowMatches) === null, '날짜 지정·카페24 예약도 «앞으로 14일» 밖이면 «—» (반복 수업과 같은 기준)');
  const n6 = M.pickNextClass([{ scheduled_date: '2026-10-27', start_time: '23:59' }], [], now, admDowMatches);
  ok(n6 && n6.ymd === '2026-10-27', '(짝) 14일째 날 밤까지는 잡는다');
  ok(M.pickNextClass([{ day_of_week: 'x', start_time: '10:00' }, { scheduled_date: 'bad', start_time: '10:00' }], [], now, admDowMatches) === null, '(짝) 못 읽는 요일·날짜는 지어내지 않는다');
}

// ═══ ② 순수 함수 무작위 샌드박스 ═══
console.log(`② 무작위 샌드박스 — 순수 함수 ${ROUNDS}회 × 2`);
const UIDS = ['a', 'b', 'A', 'c', 'kim', 'Kim', 'lms', 'type_seed'];
const TIMES = ['09:00', '14:00', '15:00', '15:30', '23:59', '00:00', '7:05', '09:30:00', '24:00', '9:5', '', null, '12:60'];
const DOWS = ['0', '1', '2', '3', '4', '5', '6', '7', 'Mon', 'tue', 'WED', '목', '금요일', '1,3', 'tue thu', '월/수', 'x', '', null];
const BASE = Date.UTC(2026, 9, 13, 0, 0);
const randYmd = (now, lo, hi) => new Date(now + KST + Math.floor(lo + rnd() * (hi - lo)) * 86400e3).toISOString().slice(0, 10);
const genSched = (now) => {
  const dated = rnd() < 0.5;
  const r = { start_time: pick(TIMES) };
  if (dated) r.scheduled_date = pick([randYmd(now, -2, 18), randYmd(now, 0, 1), '2026-02-30', 'bad', '']);
  else r.scheduled_date = pick([null, '', null]);
  if (!dated || rnd() < 0.3) r.day_of_week = pick(DOWS);
  if (rnd() < 0.4) r.starts_on = pick([randYmd(now, -5, 20), null, 'nope']);
  if (rnd() < 0.4) r.skip_dates = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => randYmd(now, 0, 15)).join(',');
  return r;
};
let payMis = 0, payOrd = 0, nextMis = 0, nextOrd = 0, nonNull = 0;
for (let k = 0; k < ROUNDS; k++) {
  const rows = Array.from({ length: Math.floor(rnd() * 12) }, (_, i) => ({
    id: i + 1, user_id: pick(UIDS), paid_at: pick([0, -5, 1e12, 1e12, 1e12 + 1, 1.7e12, 1.7e12 + Math.floor(rnd() * 1e9), NaN]),
    amount_krw: pick([0, 150000, 150000, 99000, NaN, '120000']), status: pick(['paid', 'paid', 'cancelled', 'refunded', 'PAID']),
  }));
  const exp = oLastPay(rows);
  const got = Object.fromEntries(M.pickLastPayments(rows));
  if (!same(Object.keys(exp).sort().map(x => [x, exp[x]]), Object.keys(got).sort().map(x => [x, got[x]]))) payMis++;
  if (!same(sortObj(Object.fromEntries(M.pickLastPayments(shuffle(rows)))), sortObj(got))) payOrd++;

  const now = BASE + Math.floor(rnd() * 20 * 86400e3);
  const sched = Array.from({ length: Math.floor(rnd() * 6) }, () => genSched(now));
  const seeds = Array.from({ length: Math.floor(rnd() * 3) }, () => now + Math.floor((rnd() * 20 - 3) * 86400e3));
  const en = oNext(sched, seeds, now);
  const gn = M.pickNextClass(sched, seeds, now, admDowMatches);
  if (en) nonNull++;
  if (!same(en, gn)) { nextMis++; if (nextMis <= 3) console.log('    차이', JSON.stringify({ sched, seeds, now, en, gn })); }
  const gn2 = M.pickNextClass(shuffle(sched), shuffle(seeds), now, admDowMatches);
  if (!same(gn && gn.at, gn2 && gn2.at)) nextOrd++;
}
ok(payMis === 0, `최근 결제 — 따로 짠 판정과 ${ROUNDS}회 전부 같다 (어긋남 ${payMis})`);
ok(payOrd === 0, `최근 결제 — 행 순서를 섞어도 같은 답 (어긋남 ${payOrd})`);
ok(nextMis === 0, `다음 수업 — 따로 짠 판정과 ${ROUNDS}회 전부 같다 (어긋남 ${nextMis})`);
ok(nextOrd === 0, `다음 수업 — 행 순서를 섞어도 같은 시각 (어긋남 ${nextOrd})`);
ok(nonNull > ROUNDS * 0.3, `전제: 무작위 사례 중 «다음 수업이 있는» 경우가 충분하다 (${nonNull}/${ROUNDS})`);

// ═══ ③ 끝에서 끝까지 — 진짜 SQLite ═══
const E2E = Math.max(100, Math.floor(ROUNDS / 2));
console.log(`③ 끝에서 끝까지 — 진짜 SQLite ${E2E}회`);
const makeD1 = (db) => {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => db.prepare(sql).run(...args),
  });
  return { prepare: (sql) => wrap(sql), exec: async (sql) => db.exec(sql) };
};
let e2eMis = 0, e2eHasPay = 0, e2eHasNext = 0, e2eSeedWin = 0, leak = 0;
for (let k = 0; k < E2E; k++) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE student_payments (id INTEGER PRIMARY KEY, user_id TEXT, paid_at INTEGER, amount_krw INTEGER, status TEXT);
           CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, status TEXT, schedule_kind TEXT, scheduled_date TEXT, day_of_week TEXT, start_time TEXT);
           CREATE TABLE attendance (id INTEGER PRIMARY KEY, user_id TEXT, room_id TEXT, joined_at INTEGER, date TEXT);`);
  const now = BASE + Math.floor(rnd() * 20 * 86400e3);
  const pays = [], scheds = [], atts = [];
  for (let i = 0; i < Math.floor(rnd() * 25); i++) {
    const r = { user_id: pick(UIDS), paid_at: pick([1e12, 1.7e12 + Math.floor(rnd() * 1e9), 1.7e12 + Math.floor(rnd() * 1e9), 0]), amount_krw: pick([150000, 99000, 0]), status: pick(['paid', 'paid', 'cancelled', 'pending']) };
    const info = db.prepare('INSERT INTO student_payments (user_id,paid_at,amount_krw,status) VALUES (?,?,?,?)').run(r.user_id, r.paid_at, r.amount_krw, r.status);
    pays.push({ ...r, id: Number(info.lastInsertRowid) });
  }
  db.exec(`ALTER TABLE class_schedules ADD COLUMN starts_on TEXT; ALTER TABLE class_schedules ADD COLUMN skip_dates TEXT;`);
  for (let i = 0; i < Math.floor(rnd() * 20); i++) {
    const r = { ...genSched(now), user_id: pick(UIDS), status: pick(['active', 'active', 'cancelled', 'postponed']) };
    if (r.scheduled_date) r.schedule_kind = 'dated'; else r.schedule_kind = 'recurring';
    db.prepare('INSERT INTO class_schedules (user_id,status,schedule_kind,scheduled_date,day_of_week,start_time,starts_on,skip_dates) VALUES (?,?,?,?,?,?,?,?)')
      .run(r.user_id, r.status, r.schedule_kind, r.scheduled_date ?? null, r.day_of_week ?? null, r.start_time ?? null, r.starts_on ?? null, r.skip_dates ?? null);
    scheds.push(r);
  }
  /* account_uid 칸은 운영 DB 에 이미 있다. ⚠️ 정본의 «칸 보장» 은 격리당 한 번뿐이라(모듈 플래그)
     DB 를 매번 새로 만드는 이 하니스에서는 칸을 미리 만든다. 값은 비우거나 채워 두 갈래를 다 본다. */
  const accCol = true;
  db.exec('ALTER TABLE attendance ADD COLUMN account_uid TEXT');
  const accVals = rnd() < 0.2;
  for (let i = 0; i < Math.floor(rnd() * 15); i++) {
    const r = { user_id: pick([...UIDS, 'u_dev1', 'u_dev2']), account_uid: accVals ? null : pick([null, '', 'a', 'b', 'c', 'zz']),
      room_id: pick(['c24-511', 'c24-77', 'class-12-20261013', 'meet-1']), joined_at: now + Math.floor((rnd() * 20 - 3) * 86400e3) };
    if (accCol) db.prepare('INSERT INTO attendance (user_id,account_uid,room_id,joined_at) VALUES (?,?,?,?)').run(r.user_id, r.account_uid, r.room_id, r.joined_at);
    else db.prepare('INSERT INTO attendance (user_id,room_id,joined_at) VALUES (?,?,?)').run(r.user_id, r.room_id, r.joined_at);
    atts.push(r);
  }
  const students = shuffle(['a', 'b', 'A', 'c', 'kim', 'lms']).slice(0, 1 + Math.floor(rnd() * 5)).map(u => ({ user_id: u }));
  const env = { DB: makeD1(db) };
  let threwE2e = false;
  try { await M.attachRosterExtras(env, students, now, admDowMatches); } catch { threwE2e = true; }
  if (threwE2e) { e2eMis++; leak++; continue; }
  // 오라클
  const sset = new Set(students.map(s => s.user_id));
  const lp = oLastPay(pays.filter(p => sset.has(p.user_id)));
  const today = new Date(now + KST).toISOString().slice(0, 10);
  for (const s of students) {
    const u = s.user_id;
    const rows = scheds.filter(r => r.user_id === u && r.status === 'active' && !['lms', 'type_seed'].includes(String(r.user_id).toLowerCase())
      && (r.scheduled_date == null || String(r.scheduled_date).trim() === '' || String(r.scheduled_date) >= today));
    const seedMin = atts.filter(a => (a.room_id || '').startsWith('c24-') && a.joined_at > now && a.joined_at <= now + 15 * 86400e3
      && ((a.account_uid ? a.account_uid : a.user_id) === u) && (sset.has(a.account_uid) || sset.has(a.user_id)))
      .reduce((m, a) => Math.min(m, a.joined_at), Infinity);
    const en = oNext(rows, Number.isFinite(seedMin) ? [seedMin] : [], now);
    const elp = lp[u] || null;
    if (!same(s.lastpay ?? null, elp) || !same(s.next_class ?? null, en)) {
      e2eMis++; if (e2eMis <= 3) console.log('    e2e 차이', u, JSON.stringify({ got: [s.lastpay, s.next_class], exp: [elp, en] }));
    }
    if (elp) e2eHasPay++;
    if (en) e2eHasNext++;
    if (en && en.source === 'cafe24') e2eSeedWin++;
    if (!('lastpay' in s) || !('next_class' in s)) leak++;
  }
}
ok(e2eMis === 0, `SQL + 판정이 따로 짠 판정과 ${E2E}회 전부 같다 (어긋남 ${e2eMis})`);
ok(leak === 0, '모든 학생에 두 칸이 실린다(값이 없으면 null)');
ok(e2eHasPay > 20 && e2eHasNext > 20 && e2eSeedWin > 3, `전제: 결제·다음수업·카페24 씨앗이 실제로 나온 경우가 충분하다 (${e2eHasPay}·${e2eHasNext}·${e2eSeedWin})`);

// ═══ ③-2 강사에게는 결제 금액을 안 싣는다 ═══
console.log('③-2 강사·신원 모름 — 결제 칸 비움');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE student_payments (id INTEGER PRIMARY KEY, user_id TEXT, paid_at INTEGER, amount_krw INTEGER, status TEXT);
           CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, status TEXT, schedule_kind TEXT, scheduled_date TEXT, day_of_week TEXT, start_time TEXT, starts_on TEXT, skip_dates TEXT);
           CREATE TABLE attendance (id INTEGER PRIMARY KEY, user_id TEXT, account_uid TEXT, room_id TEXT, joined_at INTEGER, date TEXT);
           INSERT INTO student_payments (user_id,paid_at,amount_krw,status) VALUES ('a', 1700000000000, 150000, 'paid');`);
  const seen = [];
  const d1 = makeD1(db); const spy = { prepare: (q) => { seen.push(q); return d1.prepare(q); }, exec: d1.exec };
  const st = [{ user_id: 'a' }];
  await M.attachRosterExtras({ DB: spy }, st, BASE, admDowMatches, { withPay: false });
  ok(st[0].lastpay === null && !seen.some(q => /student_payments/.test(q)), 'withPay:false 면 결제 조회도 안 하고 칸이 null');
  const st2 = [{ user_id: 'a' }];
  await M.attachRosterExtras({ DB: makeD1(db) }, st2, BASE, admDowMatches, { withPay: true });
  ok(st2[0].lastpay && st2[0].lastpay.amount_krw === 150000, '(짝) withPay:true 면 싣는다');
  const a = ADMIN.indexOf("path === '/api/admin/students/unified'");
  const call = ADMIN.indexOf('attachRosterExtras(env', a);
  const blk = ADMIN.slice(ADMIN.lastIndexOf('let _rxWithPay', call), call + 200);
  ok(/_rxWithPay = !\(await getAdminActor\(request, env as any\)\)\.isTeacher/.test(blk) && /catch \{ _rxWithPay = false; \}/.test(blk) && /\{ withPay: _rxWithPay \}/.test(blk),
    'unified 가 강사면 결제를 끄고, 신원을 못 읽어도 끈다(돈 정보는 막는 쪽으로 실패)');
}

// ═══ ④ fail-open ═══
console.log('④ 실패해도 던지지 않는다');
{
  const boom = { DB: { prepare: () => { throw new Error('D1 down'); }, exec: async () => { throw new Error('D1 down'); } } };
  const st = [{ user_id: 'a', username: '김' }];
  let threw = false;
  const _w = console.warn; console.warn = () => {};
  try { await M.attachRosterExtras(boom, st, BASE, admDowMatches); } catch { threw = true; }
  console.warn = _w;
  ok(!threw, 'DB 가 통째로 죽어도 던지지 않는다');
  ok(st[0].username === '김' && st[0].lastpay == null && st[0].next_class == null, '(짝) 명부 값은 그대로 · 두 칸만 비어 있다');
  let threw2 = false;
  try { await M.attachRosterExtras(boom, [], BASE, admDowMatches); await M.attachRosterExtras(boom, [{}], BASE, admDowMatches); } catch { threw2 = true; }
  ok(!threw2, '학생이 없거나 아이디가 비어도 던지지 않는다');
}

// ═══ ⑤ 배선 ═══
console.log('⑤ 배선');
{
  const a = ADMIN.indexOf("path === '/api/admin/students/unified'");
  const b = ADMIN.indexOf('attachRosterExtras(env', a);
  const out = ADMIN.indexOf('const _out: any = { ok: true, count: _piiStudents.length', a);
  ok(a > 0 && b > a && b < out, 'unified 응답을 만들기 «전» 에 정본을 부른다');
  ok(/attachRosterExtras\(env as any, _piiStudents as any\[\], Date\.now\(\), admDowMatches, \{ withPay: _rxWithPay \}\)/.test(ADMIN), '마스킹된 학생 배열·요일 정본을 넘긴다');
  const tryI = ADMIN.lastIndexOf('try {', b);
  ok(tryI > 0 && b - tryI < 40, '그 호출은 try 안 — 실패해도 명부는 뜬다');
  ok(/import \{ attachRosterExtras \} from '\.\/student-roster-extras'/.test(ADMIN), 'import 가 있다');
  const RX = rd(resolve(SRC, 'student-roster-extras.ts'));
  ok(!/SELECT\s+MAX\(p2\.paid_at\)/.test(RX), '결제 조회에 상관 서브쿼리(학생마다 MAX)를 쓰지 않는다');
  ok(RX.includes('${SCHED_SUMMARY_WHERE}') && RX.includes('ATTENDANCE_BY_UID_LIST') && RX.includes('recurStartedOn(r, ymd)'), '정본 조건(자리표시 제외·계정 키·시작일/빠지는 날)을 쓴다');
}
const CORE = rd(resolve(PUB, 'js/adm-core.js'));
const HTML = rd(resolve(PUB, 'admin.html'));
{
  ok(/lastpay: s\.lastpay \|\| null/.test(CORE) && /next_class: s\.next_class \|\| null/.test(CORE), '화면 매핑(apiItems)이 두 값을 옮긴다');
  const tStart = HTML.indexOf('id="sm-students-table"');
  const tEnd = HTML.indexOf('</table>', tStart);
  const T = HTML.slice(tStart, tEnd);
  const nCol = (T.match(/<col style=/g) || []).length;
  const nTh = (T.slice(T.indexOf('<thead>'), T.indexOf('</thead>')).match(/<th[\s>]/g) || []).length;
  const rs = CORE.indexOf('_smRowHtml = (s) => {');
  let i = CORE.indexOf('{', rs), d = 0, e = i;
  for (; e < CORE.length; e++) { if (CORE[e] === '{') d++; else if (CORE[e] === '}' && --d === 0) break; }
  const row = CORE.slice(rs, e);
  const nTd = (row.match(/<td[\s>]/g) || []).length + (row.match(/\$\{_(ct|schedTd|enrollTd|lastPayTd|nextClassTd|quickTd)\(/g) || []).length;
  const colspans = [...(T + CORE.slice(CORE.indexOf('let _smSort'), CORE.indexOf('window.smExportStudentsCsv'))).matchAll(/colspan="(\d+)"/g)].map(m => +m[1]);
  ok(nCol === 22 && nTh === 22 && nTd === 22, `col·th·td 가 서로 같다 (${nCol}·${nTh}·${nTd})`);
  ok(colspans.length >= 4 && colspans.every(c => c === nCol), `빈 줄 colspan 이 전부 같은 수 (${colspans.join(',')})`);
  ok(/data-sort-key="lastpay_at"/.test(T) && /data-sort-key="next_class_at"[^>]*data-sort-default-dir="asc"/.test(T), '두 칸이 정렬된다(다음 수업은 가까운 순)');
  ok(/data-ko="최근 결제" data-en="Last paid"/.test(T) && /data-ko="다음 수업" data-en="Next class"/.test(T), '머리글 KO/EN');
  ok(/adm-core\.js\?v=2610133-smpaynext/.test(HTML), 'adm-core.js 의 ?v= 를 올렸다');
  ok(/\['최근결제일'/.test(CORE) && /\['다음수업'/.test(CORE), 'CSV 에도 실린다');
}

// ═══ ⑥ 화면 셀 함수 실제 실행 ═══
console.log('⑥ 화면 셀 실제 실행');
{
  const cut = (name) => {
    const s0 = CORE.indexOf('const ' + name + ' = ');
    let i = CORE.indexOf('{', CORE.indexOf('=>', s0)), d = 0, e = i;
    for (; e < CORE.length; e++) { if (CORE[e] === '{') d++; else if (CORE[e] === '}' && --d === 0) break; }
    return CORE.slice(s0, e + 1) + ';';
  };
  const kst = CORE.slice(CORE.indexOf('const _kstMd = '), CORE.indexOf('\n', CORE.indexOf('const _kstMd = ')));
  const mk = (L) => new Function('_L', '_esc', kst + cut('_lastPayTd') + cut('_nextClassTd') + 'return { lp: _lastPayTd, nc: _nextClassTd };')(
    L, (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  let K, E;
  try { K = mk(false); E = mk(true); } catch (er) { console.log('  셀 함수 오려내기 실패 ' + er.message); }
  ok(!!K, '전제: 셀 함수 둘을 오려 냈다');
  if (K) {
    const at = Date.UTC(2026, 9, 12, 15, 30);   // KST 10-13 00:30
    const h = K.lp({ lastpay: { paid_at: at, amount_krw: 150000 } });
    ok(h.includes('>10-13<') && h.includes('₩150,000') && h.includes('2026-10-13'), '최근 결제 — KST 날짜와 금액을 그린다(자정 넘김 포함)');
    ok(K.lp({}) .includes('>—<') && K.lp({ lastpay: { paid_at: 0 } }).includes('>—<'), '(짝) 값이 없으면 «—»');
    const n = K.nc({ next_class: { at, ymd: '2026-10-14', hm: '19:20', source: 'cafe24' } });
    ok(n.includes('>10-14<') && n.includes('19:20') && n.includes('카페24 예약'), '다음 수업 — 날짜·시각·출처');
    ok(E.nc({ next_class: { ymd: '2026-10-14', hm: '19:20', source: 'mangoi' } }).includes('Mangoi booking'), '영어 화면은 영어');
    ok(K.nc({ next_class: null }).includes('>—<') && K.nc({ next_class: { ymd: '', hm: '' } }).includes('>—<'), '(짝) 없으면 «—»');
    ok(!K.nc({ next_class: { ymd: '<b>', hm: '"x' } }).includes('<b>'), '값은 이스케이프된다');
  }
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
