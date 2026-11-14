import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../cloudflare-deploy/node_modules/typescript');
function load(name, dependencies = {}) {
  const source = fs.readFileSync(new URL('../cloudflare-deploy/src/' + name + '.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: n => dependencies[n] || {}, console, Date, Map, Set });
  return exports;
}
const { summarizeDropout } = load('dropout-report');
const periods = [
  {uid:'renew',start:'2026-09-01',end:'2026-10-01'},
  {uid:'renew',start:'2026-10-01',end:'2026-11-01'},
  {uid:'drop',start:'2026-09-01',end:'2026-10-01'},
  {uid:'drop',start:'2026-09-01',end:'2026-10-01'},
  {uid:'unknown',start:'2026-09-01',end:'2026-10-01'},
  {uid:'future',start:'2026-10-01',end:'2026-12-01'},
];
const result = summarizeDropout(periods,[{uid:'unknown'}],[],'2026-10-01','2026-10-31','2026-11-14');
assert.equal(result.total.ended,3);
assert.equal(result.total.renewed,1);
assert.equal(result.total.dropped,1);
assert.equal(result.total.unknown,1);
assert.equal(result.total.rate,null);
assert.equal(summarizeDropout(periods,[],[],'2026-10-01','2026-10-31','2026-11-14').total.rate,66.7);
assert.equal(summarizeDropout([],[],[],'2026-10-01','2026-10-31','2026-11-14').total.rate,null);
const { summarizeParentClasses } = load('parent-classes',{'./class-today-extras':{judgeStudentAttendance:(_,start,status,at)=>({state:at-start>300000?'late':'attended'})}});
const item=(date,state,room)=>({date,start:'10:00',state,room_id:room});
const now=Date.parse('2026-11-14T12:00:00+09:00');
const classes=[item('2026-10-30','done','prev'),item('2026-11-02','done','a'),item('2026-11-03','holiday','h'),item('2026-11-06','done','b'),item('2026-11-16','upcoming','c'),item('2026-11-17','cancelled','d')];
const joins=new Map([['a',Date.parse('2026-11-02T10:06:00+09:00')]]);
const summary=summarizeParentClasses(classes,'2026-11',now,joins);
assert.equal(summary.completed,2); assert.equal(summary.scheduled,3); assert.equal(summary.streak,3);
assert.equal(summary.late,1); assert.equal(summary.late_unmeasured,1); assert.equal(summary.next.date,'2026-11-16');
assert.equal(summarizeParentClasses([...classes,item('2026-11-10','unknown','x')],'2026-11',now,joins).streak,0);
console.log('PASS attendance and dropout behavioral checks');
const response = (data,status=200)=>({data,status});
let reads=0;
const denied = load('dropout-report',{'./api-util':{json:response},'./enroll-ops':{enrollAdminHqOnly:async()=>response({ok:false},403)}});
assert.equal((await denied.handleDropout({},new URL('https://example.test/api/admin/stats/dropout'),{DB:{prepare(){reads++;throw Error('unexpected')}}})).status,403);
assert.equal(reads,0);
const allowed=load('dropout-report',{'./api-util':{json:response},'./enroll-ops':{enrollAdminHqOnly:async()=>null}});
assert.equal((await allowed.handleDropout({},new URL('https://example.test/?from=2026-02-30'),{})).status,400);
assert.equal((await allowed.handleDropout({},new URL('https://example.test/'),{DB:{prepare(){throw Error('fixture unavailable')}}})).status,503);
console.log('PASS authorization, invalid dates, unavailable source');
const conflict = summarizeParentClasses([item('2026-11-02','done','one'),item('2026-11-02','student_absent','two')],'2026-11',now,joins);
assert.equal(conflict.scheduled,1);assert.equal(conflict.completed,0);assert.equal(conflict.unknown,1);
console.log('PASS conflicting source slot is counted once as unknown');
