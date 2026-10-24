import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(new URL('../cloudflare-deploy/package.json', import.meta.url))('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const mod = { exports: {} }; cache.set(name, mod);
  const source = readFileSync(new URL('../cloudflare-deploy/src/' + name + '.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', js)(mod, mod.exports, rel => load(rel.replace('./', '')));
  return mod.exports;
}
const { dropStudentCafe24Duplicates: drop } = load('student-cafe24-duplicates');
const { kstParts, dowMatches, buildTodayPlan } = load('today-plan');
const { recurStartedOn } = load('class-start-date');
const { summarizeAttendance } = load('attendance-truth');
const uid = 'fixture_student';
const date = '2026-10-23';
const start = Date.parse(date + 'T20:00:00+09:00');
const schedule = Object.freeze({ id: 6827, user_id: uid, scheduled_date: date, start_time: '20:00', duration_min: 20, schedule_kind: 'one_time', status: 'active' });
const rows = Object.freeze(['scheduled','scheduled','present'].map((status,i) => Object.freeze({ room_id: 'c24-' + i, user_id: uid, date, joined_at: start, status })));
const api = readFileSync(new URL('../cloudflare-deploy/src/api-students.ts', import.meta.url), 'utf8');
const from = api.indexOf('const classes: ClassToday[] = []');
const to = api.indexOf('const textbook =', from);
assert.ok(from > 0 && to > from);
const js = ts.transpileModule(api.slice(from,to), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
async function assemble(schedules, lms, ymd = date, closed = false) {
  // Run the actual API assembly at a fixed historical KST date, with no DB writes.
  const run = new Function('dropStudentCafe24Duplicates','exactUid','k','clsRs','c24Rs','dowMatches','recurStartedOn','kstParts','loadHolidayClosure','isHolidayClosedFor','env',
    `return (async()=>{${js}; return {classes,weekDows:[...weekDows],weekTimes};})()`);
  return run(drop,uid,{ymd,dow:new Date(ymd+'T12:00:00+09:00').getUTCDay()}, {results:schedules},{results:lms},dowMatches,recurStartedOn,kstParts,async()=>({closed}),h=>h.closed,{});
}
test('#6827 remains and all three exact LMS duplicates are excluded by actual API assembly', async () => {
  const before = JSON.stringify({schedule,rows});
  const result = await assemble([schedule],rows);
  assert.deepEqual(result.classes,[{start:'20:00',minutes:20,source:'mangoi'}]);
  assert.equal(schedule.id,6827); assert.equal(schedule.status,'active');
  assert.equal(JSON.stringify({schedule,rows}),before);
  assert.deepEqual(result.weekDows,[5]);
});
test('different UID, absolute timestamp and date are retained; identity is case-sensitive', () => {
  const other = [ {...rows[0],user_id:'other'}, {...rows[0],user_id:uid.toUpperCase()}, {...rows[0],joined_at:start+1}, {...rows[0],joined_at:start+86400000} ];
  assert.deepEqual(drop(uid,date,[{start:'20:00',source:'mangoi'}],other),{kept:other,hidden:0});
});
test('other time and other day remain in the actual plan and weekly map', async () => {
  const other = {...rows[0],joined_at:start+3600000};
  const tomorrow = {...rows[0],date:'2026-10-24',joined_at:start+86400000};
  const result = await assemble([schedule],[...rows,other,tomorrow]);
  assert.deepEqual(result.classes,[{start:'20:00',minutes:20,source:'mangoi'},{start:'21:00',minutes:20,source:'cafe24'}]);
  assert.ok(result.weekDows.includes(6));
});
test('no real Mangoi class cannot suppress Cafe24; invalid and LMS-only slots cannot match', async () => {
  assert.equal((await assemble([],rows)).classes.length,3);
  for (const classes of [[],[{start:'20:00',source:'cafe24'}],[{start:'25:00',source:'mangoi'}]])
    assert.equal(drop(uid,date,classes,rows).hidden,0);
  assert.equal(drop(uid,'invalid',[{start:'20:00',source:'mangoi'}],rows).hidden,0);
});
test('recurrence uses start date and skips; no occurrence retains independent LMS history', async () => {
  const recurring = {...schedule,scheduled_date:null,schedule_kind:'recurring',day_of_week:'Fri',starts_on:'2026-10-01'};
  assert.equal((await assemble([recurring],rows)).classes.length,1);
  for (const patch of [{starts_on:'2026-10-24'},{skip_dates:date},{day_of_week:'Thu'}]) {
    const result=await assemble([{...recurring,...patch}],rows);
    assert.equal(result.classes.length,3); assert.ok(result.classes.every(x=>x.source==='cafe24'));
  }
});
test('holiday closure and parent date-based attendance keep their existing behavior', async () => {
  assert.equal((await assemble([schedule],rows,date,true)).classes.length,0);
  assert.deepEqual(summarizeAttendance(rows,start+86400000).days,[date]);
});
test('student plan still uses the Mangoi 20:00 class', async () => {
  const {classes,weekDows,weekTimes}=await assemble([schedule],rows);
  const plan=buildTodayPlan({band:3,textbook:null,dow:5,nowMin:1190,classes,weekClassDows:weekDows,weekClassTimes:weekTimes,done:{}});
  assert.equal(plan.mode,'class'); assert.equal(plan.phase,'before');
});
