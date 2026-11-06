// Production inbox handler against memory SQLite: writer warnings are not reader warnings.
import assert from 'node:assert/strict';
import { loadTypescript, makeHandoverEnv, seedBoardDay } from './helpers/handover-env.mjs';
const ts=loadTypescript();
assert.ok(ts,'TypeScript is required');
const t=makeHandoverEnv(ts);
await seedBoardDay(t);
t.db.exec('CREATE TABLE holidays(country TEXT,date TEXT)');
let r=await t.api('/inbox',null,'staff_c');
assert.equal(r.status,200);assert.equal(r.writer.warning.level,3);
assert.ok(r.writer.warning.missing_days.includes('2026-11-04'),'draft is missing');
assert.ok(!JSON.stringify(r.writer).includes('초안비밀'),'no draft content exposed');
t.db.prepare(`UPDATE daily_handovers SET submitted_at=1,status='submitted' WHERE username='staff_c'`).run();
r=await t.api('/inbox',null,'staff_c');
assert.equal(r.writer.today_submitted,true);
assert.equal(r.writer.warning.level,3,'older unresolved days survive today submission');
assert.ok(!r.writer.warning.missing_days.includes('2026-11-04'));
r=await t.api('/inbox',null,'staff_x');
assert.equal(r.writer.required,false,'non-roster staff has no writer warning');
t.db.exec('DROP TABLE holidays'); // Local memory only: simulate unreadable holiday data.
r=await t.api('/inbox',null,'staff_c');
assert.equal(r.writer,null,'unknown calendar never fabricates an escalation');
assert.equal(r.ok,true,'calendar failure does not disable the inbox');
t.db.close();
console.log('PASS writer inbox: actual handler, draft, today submitted/older missing, non-roster, calendar failure');
