// Exercise shipped dispatchers and SQL against synthetic, isolated SQLite only.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.env.BADGES_STREAK_SRC_DIR || join(root, 'cloudflare-deploy/src');
const { buildSync } = createRequire(import.meta.url)('../cloudflare-deploy/node_modules/esbuild');
const temp = mkdtempSync(join(tmpdir(), 'mangoi-badges-contracts-'));
const realFetch = globalThis.fetch, realNow = Date.now;
const NOW = Date.UTC(2026, 10, 6, 15, 30), TODAY = '2026-11-07', DAY = 86400000;
let pass = 0;
async function check(name, fn) { await fn(); pass++; console.log('PASS ' + name); }

function fixture() {
  const raw = new DatabaseSync(':memory:'), trace = [], state = { batchCalls: 0, failBatch: 0 };
  raw.exec(`
    CREATE TABLE attendance(id INTEGER PRIMARY KEY, user_id TEXT, account_uid TEXT, username TEXT, role TEXT, date TEXT);
    CREATE TABLE students_erp(user_id TEXT PRIMARY KEY, korean_name TEXT, student_name TEXT, username TEXT);
    CREATE TABLE student_evaluations(student_uid TEXT, score_overall INTEGER);
    CREATE TABLE voice_coaching(student_uid TEXT, accuracy_score INTEGER);
    CREATE TABLE student_points(user_id TEXT, lifetime_earned INTEGER);
    CREATE TABLE vocabulary(user_id TEXT, level INTEGER);
    CREATE TABLE vocab_review_log(user_id TEXT, reviewed_at INTEGER);
    CREATE TABLE ai_writing_corrections(student_uid TEXT, score INTEGER, created_at INTEGER);
  `);
  function prepare(sql) {
    const statement = raw.prepare(sql);
    const bound = args => ({
      async first() { trace.push(['first', sql]); return statement.get(...args) || null; },
      async all() { trace.push(['all', sql]); return { results: statement.all(...args) }; },
      async run() { trace.push(['run', sql]); const r = statement.run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    });
    return { ...bound([]), bind: (...args) => bound(args) };
  }
  const env = { ROOM_JWT_SECRET: 'synthetic-badges-contract-key-only', DB: {
    async exec(sql) { trace.push(['exec', sql]); raw.exec(sql); }, prepare,
    async batch(statements) {
      state.batchCalls++;
      if (state.failBatch === state.batchCalls) throw Error('synthetic batch failure');
      raw.exec('BEGIN');
      try { const rows = []; for (const s of statements) rows.push(await s.run()); raw.exec('COMMIT'); return rows; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  } };
  return { raw, env, trace, state, close: () => raw.close() };
}

try {
  Date.now = () => NOW;
  globalThis.fetch = async () => { throw Error('Unexpected external request in badges/streak contracts'); };
  const out = join(temp, 'handlers.mjs');
  buildSync({ stdin: { contents: `
    export { handleGamesApi, BADGE_CATALOG, checkAndAwardBadges, reconcileAllStreaks } from './api-games';
    export { BADGE_CATALOG as catalog, checkAndAwardBadges as award } from './api-games-badges';
    export { reconcileAllStreaks as reconcile, computeAttendanceStreak } from './api-games-attendance-streak';
    export { signUidToken } from './auth-token';
  `, resolveDir: sourceDir, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  const M = await import(pathToFileURL(out).href);
  const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const auth = async uid => ({ Authorization: 'Bearer ' + await M.signUidToken(uid, { ROOM_JWT_SECRET: 'synthetic-badges-contract-key-only' }) });
  async function call(path, f, options = {}, expectResponse = true) {
    const url = new URL(path, 'https://sandbox.invalid');
    const r = await M.handleGamesApi(new Request(url, options), url, f.env);
    if (expectResponse) assert(r instanceof Response, 'Expected route response: ' + path);
    return r;
  }
  const init = async f => { assert.equal((await call('/api/streak/check-in', f, post({}))).status, 400); };
  function attendance(f, uid, count, { offset = 0, role = 'student', account = null } = {}) {
    for (let i = 0; i < count; i++) f.raw.prepare('INSERT INTO attendance(user_id,account_uid,username,role,date) VALUES(?,?,?,?,?)')
      .run(uid, account, 'Name ' + uid, role, new Date(Date.parse(TODAY) - (i + offset) * DAY).toISOString().slice(0, 10));
  }
  function streak(f, uid, current, longest = current, last = '2026-11-06', gems = 77) {
    f.raw.prepare('INSERT INTO student_streaks VALUES(?,?,?,?,?,?,?)').run(uid, current, longest, last, gems, gems + 9, 1);
  }

  await check('legacy exports reference the same catalog, award and reconciliation functions', async () => {
    assert.equal(M.BADGE_CATALOG, M.catalog); assert.equal(M.checkAndAwardBadges, M.award); assert.equal(M.reconcileAllStreaks, M.reconcile);
    assert.equal(new Set(M.catalog.map(b => b.code)).size, M.catalog.length);
    assert(M.catalog.some(b => b.code === 'writing_streak_7'));
  });
  await check('unmatched paths and methods do no D1 or provider work', async () => {
    const f = fixture(); try {
      for (const p of ['/unmatched', '/api/badges/check', '/api/streak/check-in', '/api/admin/streak/reconcile']) assert.equal(await call(p, f, {}, false), null);
      assert.deepEqual(f.trace, []);
    } finally { f.close(); }
  });
  await check('badge list requires its owner token and returns only that owner awards', async () => {
    const f = fixture(); try {
      assert.equal((await call('/api/badges/list', f)).status, 400);
      f.raw.exec("INSERT INTO student_badges(user_id,badge_code,awarded_at) VALUES('a','first_class',1),('b','writing_10',2)");
      assert.equal((await call('/api/badges/list?uid=a', f)).status, 401);
      assert.equal((await call('/api/badges/list?uid=a', f, { headers: await auth('b') })).status, 401);
      const r = await call('/api/badges/list?uid=a', f, { headers: await auth('a') }); assert.equal(r.status, 200);
      const b = await r.json(); assert.equal(b.earned_count, 1); assert.equal(b.badges.find(x => x.code === 'first_class').earned, true); assert.equal(b.badges.find(x => x.code === 'writing_10').earned, false);
    } finally { f.close(); }
  });
  await check('badge awards retain thresholds, owner filtering and sequential idempotency', async () => {
    const f = fixture(); try {
      attendance(f, 'a', 7); attendance(f, 'b', 30);
      f.raw.exec("INSERT INTO voice_coaching VALUES('a',95); INSERT INTO student_points VALUES('a',1200); INSERT INTO vocabulary VALUES('a',5)");
      const first = await M.checkAndAwardBadges(f.env, 'a');
      assert.deepEqual([...first].sort(), ['attendance_1', 'first_class', 'streak_7', 'voice_score_90', 'points_1000', 'vocab_first'].sort());
      assert.deepEqual(await M.checkAndAwardBadges(f.env, 'a'), []);
      assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM student_badges').get().n, first.length);
      assert(!first.includes('streak_30')); assert(!first.includes('first_login'));
    } finally { f.close(); }
  });
  await check('badge route still calls the shared award authority', async () => {
    const f = fixture(); try {
      assert.equal((await call('/api/badges/check', f, post({}))).status, 400);
      f.raw.exec("INSERT INTO ai_writing_corrections VALUES('a',95,1)");
      const r = await call('/api/badges/check', f, post({ uid: 'a' })); assert.equal(r.status, 200);
      assert.deepEqual((await r.json()).earned.sort(), ['writing_90', 'writing_first']);
    } finally { f.close(); }
  });
  await check('attendance recursion counts consecutive unique days, not totals, and caps at thirty', async () => {
    const f = fixture(); try {
      attendance(f, 'a', 3); attendance(f, 'a', 1); attendance(f, 'a', 2, { offset: 5 }); attendance(f, 'b', 40);
      assert.equal(await M.computeAttendanceStreak(f.env, 'a'), 3); assert.equal(await M.computeAttendanceStreak(f.env, 'b'), 30);
      assert.equal(await M.computeAttendanceStreak(f.env, 'missing'), 0);
      f.raw.exec('DROP TABLE attendance'); assert.equal(await M.computeAttendanceStreak(f.env, 'a'), 0);
    } finally { f.close(); }
  });
  await check('KST check-in rewards once per date and denies another account', async () => {
    const f = fixture(); try {
      assert.equal((await call('/api/streak/check-in', f, post({ uid: 'a' }))).status, 401);
      const options = post({ uid: 'guest_checkin' });
      const r = await call('/api/streak/check-in', f, options); assert.equal(r.status, 200);
      const b = await r.json(); assert.equal(b.today, TODAY); assert.equal(b.earned, 10); assert.equal(b.current_streak, 1);
      const repeat = await (await call('/api/streak/check-in', f, options)).json(); assert.equal(repeat.earned, 0); assert.equal(repeat.already_today, true);
      assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM gem_transactions').get().n, 1);
    } finally { f.close(); }
  });
  await check('check-in bonus boundaries and a missed day retain their rewards and records', async () => {
    const f = fixture(); try {
      await init(f);
      for (const [days, expected] of [[2,15],[6,30],[13,40],[29,60]]) {
        const uid = 'guest_bonus_' + days; streak(f, uid, days);
        const b = await (await call('/api/streak/check-in', f, post({ uid }))).json(); assert.equal(b.current_streak, days + 1); assert.equal(b.earned, expected); assert.equal(b.gems, 77 + expected);
      }
      streak(f, 'guest_gap', 14, 18, '2026-11-05');
      const b = await (await call('/api/streak/check-in', f, post({ uid: 'guest_gap' }))).json(); assert.equal(b.current_streak, 1); assert.equal(b.longest_streak, 18); assert.equal(b.earned, 10);
      assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM gem_transactions').get().n, 5);
    } finally { f.close(); }
  });
  await check('status authorizes before attendance synchronization and denies guests', async () => {
    const f = fixture(); try {
      await init(f); attendance(f, 'a', 3); streak(f, 'a', 99, 120);
      assert.equal((await call('/api/streak/status?uid=a', f)).status, 401);
      assert.equal((await call('/api/streak/status?uid=a', f, { headers: await auth('b') })).status, 401);
      assert.equal((await call('/api/streak/status?uid=guest_checkin', f)).status, 401);
      assert.equal(f.raw.prepare('SELECT current_streak FROM student_streaks').get().current_streak, 99);
      const r = await call('/api/streak/status?uid=a', f, { headers: await auth('a') }); assert.equal(r.status, 200);
      const b = await r.json(); assert.equal(b.current_streak, 3); assert.equal(b.longest_streak, 120); assert.equal(b.gems, 77); assert.equal(b.source, 'attendance'); assert.equal(b.checked_today, true);
      assert.deepEqual({ ...f.raw.prepare('SELECT current_streak,longest_streak,gems,total_gems_earned,last_check_date FROM student_streaks').get() }, { current_streak:3, longest_streak:120, gems:77, total_gems_earned:86, last_check_date:'2026-11-06' });
    } finally { f.close(); }
  });
  await check('today attendance still recognizes account_uid and status creates missing owner row without gems', async () => {
    const f = fixture(); try {
      attendance(f, 'device', 1, { account: 'a' }); attendance(f, 'a', 3, { offset: 1 });
      const r = await call('/api/streak/status?uid=a', f, { headers: await auth('a') }); assert.equal(r.status, 200);
      const b = await r.json(); assert.equal(b.attended_today, true); assert.equal(b.current_streak, 3); assert.equal(b.gems, 0);
      assert.equal(f.raw.prepare('SELECT last_check_date FROM student_streaks WHERE student_uid=?').get('a').last_check_date, TODAY);
    } finally { f.close(); }
  });
  await check('reconciliation deduplicates days, excludes teachers and preserves longer history and gem balances', async () => {
    const f = fixture(); try {
      await init(f); attendance(f, 'a', 3); attendance(f, 'a', 1); attendance(f, 'a', 5, { offset: 8 }); attendance(f, 'teacher', 10, { role: 'teacher' }); attendance(f, 'b', 40, { role: null }); streak(f, 'a', 99, 100);
      assert.deepEqual(await M.reconcileAllStreaks(f.env), { scanned:2, updated:2 });
      assert.deepEqual({ ...f.raw.prepare('SELECT current_streak,longest_streak,gems,total_gems_earned,last_check_date FROM student_streaks WHERE student_uid=?').get('a') }, { current_streak:3, longest_streak:100, gems:77, total_gems_earned:86, last_check_date:'2026-11-06' });
      assert.equal(f.raw.prepare('SELECT current_streak FROM student_streaks WHERE student_uid=?').get('b').current_streak, 30); assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM student_streaks WHERE student_uid=?').get('teacher').n, 0);
    } finally { f.close(); }
  });
  await check('reconciliation keeps fifty-row batches and continues after one failed batch', async () => {
    const f = fixture(); try {
      for (let i = 0; i < 51; i++) attendance(f, 'user_' + String(i).padStart(2, '0'), 1);
      f.state.failBatch = 1;
      assert.deepEqual(await M.reconcileAllStreaks(f.env), { scanned:51, updated:1 }); assert.equal(f.state.batchCalls, 2); assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM student_streaks').get().n, 1);
    } finally { f.close(); }
  });
  await check('leaderboard keeps top twenty ordering, ERP and attendance name fallback without an id column', async () => {
    const f = fixture(); try {
      await init(f); for (let i=0;i<22;i++) streak(f, 'u'+i, 22-i, 22-i, null, i);
      f.raw.exec("INSERT INTO students_erp VALUES('u0','정본 이름',NULL,NULL); INSERT INTO attendance(user_id,username,date) VALUES('u1','출결 이름','2026-11-07')");
      const r = await call('/api/streak/leaderboard', f); assert.equal(r.status, 200); const b = await r.json();
      assert.equal(b.items.length, 20); assert.equal(b.items[0].student_uid, 'u0'); assert.equal(b.items[0].student_name, '정본 이름'); assert.equal(b.items[1].student_name, '출결 이름'); assert.equal(b.items[2].student_name, null); assert(!b.items.some(x => x.student_uid === 'u21'));
    } finally { f.close(); }
  });
  await check('badge stats and admin reconcile remain routed through their real handlers', async () => {
    const f = fixture(); try {
      attendance(f, 'a', 1); await M.checkAndAwardBadges(f.env, 'a');
      const stats = await call('/api/admin/badges/stats', f); assert.equal(stats.status, 200); assert.equal((await stats.json()).total_awards, 2);
      const rc = await call('/api/admin/streak/reconcile', f, post({})); assert.equal(rc.status, 200); assert.deepEqual((await rc.json()).reconciled, { scanned:1, updated:1 });
    } finally { f.close(); }
  });
  await check('concurrent owner requests keep independent environments and balances', async () => {
    const a=fixture(), b=fixture(); try {
      await init(a); await init(b); streak(a,'guest_same',2,2,'2026-11-06',10); streak(b,'guest_same',6,6,'2026-11-06',80);
      const responses=await Promise.all([call('/api/streak/check-in',a,post({uid:'guest_same'})),call('/api/streak/check-in',b,post({uid:'guest_same'}))]);
      const bodies=await Promise.all(responses.map(r=>r.json())); assert.deepEqual(bodies.map(x=>x.gems),[25,110]);
    } finally { a.close(); b.close(); }
  });
  console.log(`PASS ${pass} / FAIL 0 badges/streak module contracts`);
} finally {
  Date.now = realNow; globalThis.fetch = realFetch; rmSync(temp, { recursive:true, force:true });
}
