#!/usr/bin/env node
/**
 * Offline boundary regressions for enrollStudentConflicts.
 * Run: node --require ./test-harness/helpers/offline-network-guard.cjs
 *           test-harness/enroll_student_conflict_boundaries_harness.mjs
 * Requires Node 24+ (real node:sqlite; no packages or live services).
 * ENROLL_OPS_SRC may point at a baseline/mutant copy; dependencies remain canonical.
 * Assertions execute the production module and SQLite SQL, not copied algorithms.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../cloudflare-deploy/src');
const guard = resolve(HERE, 'helpers/offline-network-guard.cjs');
if (existsSync(guard)) createRequire(import.meta.url)(guard);
const temp = mkdtempSync(resolve(tmpdir(), 'enroll-student-boundaries-'));
const copies = new Map();
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));
function copyModule(name) {
  if (copies.has(name)) return copies.get(name);
  const file = resolve(temp, `${name}.ts`);
  copies.set(name, file);
  const source = name === 'enroll-ops' && process.env.ENROLL_OPS_SRC
    ? resolve(process.env.ENROLL_OPS_SRC) : resolve(SRC, `${name}.ts`);
  writeFileSync(file, readFileSync(source, 'utf8').replace(
    /from (['"])\.\/([\w-]+)\1/g,
    (_match, _quote, dependency) => `from '${pathToFileURL(copyModule(dependency)).href}'`,
  ));
  return file;
}
const { enrollStudentConflicts } = await import(pathToFileURL(copyModule('enroll-ops')).href);
let PASS = 0, FAIL = 0;
function check(condition, label, detail) {
  if (condition) { PASS++; console.log(`PASS ${label}`); }
  else { FAIL++; console.error(`FAIL ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`); }
}
function equalDates(actual, expected, label) {
  const got = actual instanceof Set ? [...actual].sort() : actual;
  check(actual instanceof Set && JSON.stringify(got) === JSON.stringify([...new Set(expected)].sort()), label, { got, expected });
}
const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
const TUE = '2026-10-13', TUE2 = addDays(TUE, 7), TUE3 = addDays(TUE, 14);
const WED = addDays(TUE, 1), THU = addDays(TUE, 2), THU2 = addDays(THU, 7);
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const ALL_TIMES = Object.fromEntries(ALL_DAYS.map(day => [day, 1270]));
const OMIT = Symbol('omitted argument');

function fixture({ legacy = false, integerWeekday = false, failRead } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (
    id INTEGER PRIMARY KEY, user_id TEXT, schedule_kind TEXT, scheduled_date TEXT,
    day_of_week ${integerWeekday ? 'INTEGER' : 'TEXT'}, start_time TEXT, duration_min INTEGER, teacher_id TEXT,
    status TEXT, source TEXT, created_at INTEGER ${legacy ? '' : ', starts_on TEXT'}
  )`);
  const reads = [];
  function statement(sql, binds = []) {
    return {
      bind: (...args) => statement(sql, args),
      all: async () => {
        if (!/^\s*SELECT\b/i.test(sql)) throw new Error('Fixture permits production reads only');
        reads.push({ sql, binds: [...binds] });
        if (binds.length > 100) throw new Error(`D1 bind limit exceeded: ${binds.length}`);
        if (failRead?.({ sql, binds, index: reads.length })) throw new Error('Injected SQLite read failure');
        return { results: db.prepare(sql).all(...binds) };
      },
    };
  }
  const env = { DB: { prepare: sql => statement(sql) } };
  function insert(overrides = {}) {
    const row = {
      user_id: 'student-a', schedule_kind: 'dated', scheduled_date: TUE,
      day_of_week: null, start_time: '21:10', duration_min: 20, teacher_id: 'teacher-other',
      status: 'active', source: 'manual', created_at: Date.parse('2027-12-01T00:00:00Z'),
      ...(legacy ? {} : { starts_on: null }), ...overrides,
    };
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO class_schedules (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .run(...columns.map(column => row[column]));
  }
  return { db, env, reads, insert };
}
async function scenario(label, run, options) {
  const state = fixture(options);
  try { await run(state); }
  catch (error) { check(false, `${label}: unexpected exception`, String(error?.stack || error)); }
  finally { state.db.close(); }
}
function conflicts(env, options = {}) {
  const { dates = [TUE], times = { 2: 1270 }, days = [2], minutes = 20, uid = 'student-a' } = options;
  const args = [env, uid, dates, times, minutes, days];
  if (Object.hasOwn(options, 'exclude') && options.exclude !== OMIT) args.push(options.exclude);
  return enrollStudentConflicts(...args);
}
const recurring = { schedule_kind: 'recurring', scheduled_date: null, day_of_week: 'Tue' };

console.log('\n[A] Source exclusion: blank means no exclusion; nonblank excludes exactly itself');
const sources = [null, '', 'manual', 'adm-enroll:7', 'adm-enroll:70', 'enroll:ORD1', ' manual ', "quote' OR 1=1 --"];
const excludes = [['omitted', OMIT], ['undefined', undefined], ['null', null], ['empty', ''],
  ['own enrollment', 'adm-enroll:7'], ['manual', 'manual'], ['own order', 'enroll:ORD1'],
  ['padded manual', ' manual '], ['quoted source', "quote' OR 1=1 --"]];
for (const kind of ['dated', 'recurring']) {
  for (const source of sources) {
    for (const [exLabel, exclude] of excludes) {
      const label = `${kind}: source=${JSON.stringify(source)}, exclude=${exLabel}`;
      await scenario(label, async ({ env, insert }) => {
        insert({ ...(kind === 'recurring' ? recurring : {}), source });
        const excluded = typeof exclude === 'string' && exclude.length > 0 && source === exclude;
        equalDates(await conflicts(env, { exclude }), excluded ? [] : [TUE], label);
      });
    }
  }
}

console.log('\n[B] Recurrence starts: inclusive per row/date, unknown starts keep legacy behavior');
const starts = [
  ['earlier', addDays(TUE, -1), [TUE, TUE2, TUE3]],
  ['equal', TUE, [TUE, TUE2, TUE3]],
  ['one day later', WED, [TUE2, TUE3]],
  ['next Tuesday', TUE2, [TUE2, TUE3]],
  ['after window', addDays(TUE3, 1), []],
  ['null', null, [TUE, TUE2, TUE3]],
  ['empty', '', [TUE, TUE2, TUE3]],
  ['invalid', 'not-a-date', [TUE, TUE2, TUE3]],
  ['short invalid', '2026-1-1', [TUE, TUE2, TUE3]],
  ['trimmed timestamp', `  ${TUE2}T09:00:00Z  `, [TUE2, TUE3]],
];
for (const [label, starts_on, expected] of starts) {
  await scenario(label, async ({ env, insert }) => {
    insert({ ...recurring, starts_on });
    equalDates(await conflicts(env, { dates: [TUE, TUE2, TUE3] }), expected, `recurrence starts ${label}`);
  });
}
for (const source of [null, '', 'manual']) {
  await scenario('legacy schema', async ({ env, insert }) => {
    insert({ ...recurring, source });
    equalDates(await conflicts(env, { dates: [TUE, TUE2] }), [TUE, TUE2], `legacy schema missing starts_on, source=${JSON.stringify(source)}`);
  }, { legacy: true });
}
await scenario('row-specific start boundaries', async ({ env, insert }) => {
  insert({ ...recurring, day_of_week: 'Tue,Thu', starts_on: TUE2 });
  insert({ ...recurring, day_of_week: 'Thu', starts_on: THU });
  equalDates(await conflicts(env, { dates: [TUE, THU, TUE2, THU2], times: { 2: 1270, 4: 1270 }, days: [2, 4] }),
    [THU, TUE2, THU2], 'one started row cannot pull a different weekday backward before its start');
});
await scenario('non-overlapping early row', async ({ env, insert }) => {
  insert({ ...recurring, starts_on: TUE2 });
  insert({ ...recurring, starts_on: TUE, start_time: '22:00' });
  equalDates(await conflicts(env, { dates: [TUE, TUE2] }), [TUE2], 'early non-overlapping row cannot activate a future overlapping row');
});
for (const schedule_kind of ['dated', 'recurring', null]) {
  await scenario('explicit date wins', async ({ env, insert }) => {
    insert({ schedule_kind, day_of_week: 'Thu', starts_on: TUE3 });
    equalDates(await conflicts(env, { dates: [TUE, TUE2, THU], days: [2, 4], times: { 2: 1270, 4: 1270 } }),
      [TUE], `explicit date wins over starts_on, day and kind=${JSON.stringify(schedule_kind)}`);
  });
}
for (const scheduled_date of [null, '']) {
  for (const schedule_kind of ['recurring', 'dated', null]) {
    await scenario('date-less legacy row', async ({ env, insert }) => {
      insert({ ...recurring, scheduled_date, schedule_kind });
      equalDates(await conflicts(env), [TUE], `date-less row: date=${JSON.stringify(scheduled_date)}, kind=${JSON.stringify(schedule_kind)}`);
    });
  }
}

console.log('\n[C] Weekday aliases, multiple days, isolation and half-open time ranges');
for (const alias of ['2', 'Tue', 'tuesday', 'TUESDAY', '화', '화요일', ' Tue ', '2,2,Tue']) {
  await scenario('weekday alias', async ({ env, insert }) => {
    insert({ ...recurring, day_of_week: alias });
    equalDates(await conflicts(env, { dates: [TUE, WED], days: [2, 3], times: { 2: 1270, 3: 1270 } }),
      [TUE], `weekday alias ${JSON.stringify(alias)}`);
  });
}
await scenario('legacy numeric weekday', async ({ env, insert }) => {
  insert({ ...recurring, day_of_week: 2 });
  equalDates(await conflicts(env), [TUE], 'legacy INTEGER weekday 2');
}, { integerWeekday: true });
for (const alias of ['2,4', 'Tue,Thu', '화/목요일', 'Tue · Thu', '2,garbage,4']) {
  await scenario('multiple weekdays', async ({ env, insert }) => {
    insert({ ...recurring, day_of_week: alias, starts_on: THU });
    equalDates(await conflicts(env, { dates: [TUE, WED, THU, TUE2, THU2], days: [2, 3, 4], times: { 2: 1270, 3: 1270, 4: 1270 } }),
      [THU, TUE2, THU2], `multi-day alias ${JSON.stringify(alias)} honors start date`);
  });
}
await scenario('weekday-specific times', async ({ env, insert }) => {
  insert({ ...recurring, day_of_week: 'Tue,Thu' });
  equalDates(await conflicts(env, { dates: [TUE, THU], days: [2, 4], times: { 2: 1270, 4: 1290 } }),
    [TUE], 'different target times per weekday, including exact adjacency');
  equalDates(await conflicts(env, { dates: [TUE, THU], days: [2], times: { 2: 1270, 4: 1270 } }), [TUE], 'recurring days outside requested set are ignored');
  equalDates(await conflicts(env, { dates: [TUE, THU], days: [2, 4], times: { 2: 1270 } }), [TUE], 'missing target weekday time is ignored');
});
await scenario('Sunday zero', async ({ env, insert }) => {
  const sunday = '2026-10-18';
  insert({ ...recurring, day_of_week: '일요일' });
  equalDates(await conflicts(env, { dates: [sunday, TUE], days: [0, 2], times: { 0: 1270, 2: 1270 } }), [sunday], 'Sunday index zero remains a real weekday');
});
const intervals = [
  ['before adjacency', '20:50', 20, 20, false],
  ['after adjacency', '21:30', 20, 20, false],
  ['one minute before adjacency', '21:09', 1, 20, false],
  ['one minute overlap', '21:29', 1, 20, true],
  ['exact equal', '21:10', 20, 20, true],
  ['existing longer', '21:00', 40, 20, true],
  ['target longer overlap', '21:40', 20, 40, true],
  ['target longer adjacency', '21:50', 20, 40, false],
  ['null duration defaults twenty', '21:15', null, 20, true],
  ['zero duration defaults twenty', '21:15', 0, 20, true],
  ['invalid start time', 'not-time', 20, 20, false],
];
for (const kind of ['dated', 'recurring']) {
  for (const [label, start_time, duration_min, minutes, overlaps] of intervals) {
    await scenario(label, async ({ env, insert }) => {
      insert({ ...(kind === 'recurring' ? recurring : {}), start_time, duration_min });
      equalDates(await conflicts(env, { minutes }), overlaps ? [TUE] : [], `${kind}: ${label}`);
    });
  }
  for (const overrides of [{ user_id: 'someone-else' }, { status: 'cancelled' }, { status: 'inactive' }]) {
    await scenario('student/status isolation', async ({ env, insert }) => {
      insert({ ...(kind === 'recurring' ? recurring : {}), ...overrides });
      equalDates(await conflicts(env), [], `${kind}: ignores ${JSON.stringify(overrides)}`);
    });
  }
}

console.log('\n[D] Real SQLite with D1-sized bind limits: chunk boundaries through 205 dates');
for (const count of [1, 97, 98, 99, 100, 101, 198, 199, 200, 205]) {
  for (const [label, exclude] of [['omitted', OMIT], ['empty', ''], ['own source', 'adm-enroll:7']]) {
    await scenario('chunk boundary', async ({ env, insert, reads }) => {
      const dates = Array.from({ length: count }, (_, i) => addDays(TUE, i));
      const expected = [];
      dates.forEach((date, i) => {
        const source = [null, '', 'manual', 'adm-enroll:7', 'adm-enroll:70'][i % 5];
        insert({ scheduled_date: date, source });
        if (source !== exclude || exclude === '' || exclude === OMIT) expected.push(date);
      });
      equalDates(await conflicts(env, { dates, days: ALL_DAYS, times: ALL_TIMES, exclude }), expected,
        `${count} dates, exclude=${label}: complete exact result across chunks`);
      check(reads.every(read => read.binds.length <= 100), `${count} dates, exclude=${label}: every SQL read has <=100 binds`, reads.map(read => read.binds.length));
      const datedReads = reads.filter(read => /scheduled_date\s+IN\s*\(/i.test(read.sql));
      check(datedReads.length >= Math.ceil(count / 100), `${count} dates, exclude=${label}: all date chunks execute`, datedReads.length);
    });
  }
}
await scenario('duplicate inputs and rows', async ({ env, insert }) => {
  insert(); insert(); insert({ ...recurring });
  equalDates(await conflicts(env, { dates: [TUE, TUE, TUE2] }), [TUE, TUE2], 'duplicate rows, recurring+dated hits and duplicate probes still produce one date each');
});

console.log('\n[E] Read failures return null, never a falsely complete empty or partial result');
const broken = { DB: { prepare() { throw new Error('Injected prepare failure'); } } };
check(await conflicts(broken) === null, 'prepare failure returns null');
await scenario('missing table', async ({ env, db }) => {
  db.exec('DROP TABLE class_schedules');
  check(await conflicts(env) === null, 'SQLite missing-table failure returns null');
});
await scenario('dated read rejected', async ({ env }) => {
  check(await conflicts(env) === null, 'dated all() rejection returns null');
}, { failRead: () => true });
await scenario('recurring read rejected', async ({ env, insert }) => {
  insert();
  check(await conflicts(env) === null, 'recurring query failure discards partial dated hits and returns null');
}, { failRead: ({ sql }) => !/scheduled_date\s+IN\s*\(/i.test(sql) });
await scenario('later chunk rejected', async ({ env, insert }) => {
  insert();
  check(await conflicts(env, { dates: Array.from({ length: 205 }, (_, i) => addDays(TUE, i)), days: ALL_DAYS, times: ALL_TIMES }) === null,
    'later dated chunk failure discards earlier hits and returns null');
}, { failRead: ({ index }) => index === 2 });
for (const uid of ['', '   ', null]) equalDates(await conflicts(broken, { uid }), [], `empty student ${JSON.stringify(uid)} returns empty without DB access`);
equalDates(await conflicts(broken, { dates: [] }), [], 'empty date list returns empty without DB access');
await scenario('trim user ID', async ({ env, insert }) => {
  insert();
  equalDates(await conflicts(env, { uid: ' student-a ' }), [TUE], 'student ID is trimmed before lookup');
});

console.log(`\nRESULT: PASS ${PASS} / FAIL ${FAIL}`);
process.exitCode = FAIL ? 1 : 0;
