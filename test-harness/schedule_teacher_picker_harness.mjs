// Read-only replacement preview: execute the actual modal/picker code with delayed responses.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../cloudflare-deploy/public/admin/weekly-schedule.html', import.meta.url), 'utf8');
const a = html.indexOf('function replacementTeacherBlock(');
const b = html.indexOf('/* 💾 (2026-09-11) 드래그와', a);
assert(a > 0 && b > a);
let pass = 0;
const check = (name, fn) => { assert(fn, name); pass++; };
function setup() {
  const pending = [], renders = [], timers = new Set();
  const c = { activeTab:'teacher', mode:'change', teacher:{id:1}, teacherName:'Alpha', origDate:'2026-10-05', origHour:9, origMinute:20, slot:{id:101,ids:[101,102],duration_min:20} };
  const scope = { window:{__rescheduleCtx:c}, currentLang:'ko', TEACHERS:[{id:1,name:'Alpha',category:'office'},{id:2,name:'Beta',category:'office'},{id:3,name:'Gamma',category:'office'}],
    fetch:(url,options)=>new Promise((resolve,reject)=>pending.push({url,options,resolve,reject})),
    AbortController, setTimeout:f=>{timers.add(f);return f;},clearTimeout:f=>timers.delete(f),
    canOverrideTimeLimit:()=>true,minLabel:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
    escapeHtml:s=>String(s).replaceAll('<','&lt;'),openModal:s=>renders.push(s),document:{querySelector:()=>null},console,Date };
  vm.createContext(scope); vm.runInContext(html.slice(a,b),scope);
  return {scope,c,pending,renders,timers};
}
const response = options => ({ok:true,json:async()=>({ok:true,options})});
const flush = async()=>{await new Promise(resolve=>setImmediate(resolve));};
{
  const t=setup();t.scope.renderRescheduleModal();
  check('opening requests every underlying group ID read-only',t.pending[0].url.endsWith('ids=101%2C102')&&!t.pending[0].options.method);
  check('all candidates disabled while preview pending',(t.renders.at(-1).match(/class="teacher-pick-card [^"]*" disabled/g)||[]).length===2);
  t.scope.window.rscPickTeacher('2');check('direct selection cannot bypass pending preview',!t.c.pickedTeacher);
  t.pending[0].resolve(response({'2':{available:false,error:'teacher_unavailable'},'3':{available:true}}));await flush();
  check('unavailable reason rendered',t.renders.at(-1).includes('근무불가·휴가'));
  check('available candidate enabled',t.renders.at(-1).includes('onclick="rscPickTeacher(\'3\')"'));
  t.scope.window.rscPickTeacher('2');check('blocked candidate cannot be selected directly',!t.c.pickedTeacher);
  t.scope.window.rscPickTeacher('3');check('numeric teacher ID works from string onclick',t.c.pickedTeacher?.id===3);
  check('available selection enables confirmation',/class="modal-btn primary"  onclick="rscConfirm\(\)"/.test(t.renders.at(-1)));
  check('preview timer cleared',t.timers.size===0);
}
{
  const t=setup();t.scope.renderRescheduleModal();t.pending[0].reject(new Error('network'));await flush();
  check('failure keeps candidates disabled',t.c.teacherOptionsState==='failed'&&!t.c.pickedTeacher);
  check('failure offers visible retry',t.renders.at(-1).includes('rscRetryTeachers()'));
  t.scope.window.rscRetryTeachers();check('retry starts a new read',t.pending.length===2);
  t.pending[1].resolve(response({'2':{available:true},'3':{available:true}}));await flush();check('retry can recover',t.c.teacherOptionsState==='ready');
}
{
  const t=setup();t.scope.renderRescheduleModal();t.scope.window.__rescheduleCtx=null;
  t.pending[0].resolve(response({'2':{available:true}}));await flush();check('closed modal is not resurrected',t.renders.length===1);
}
{
  const t=setup();t.scope.renderRescheduleModal();t.scope.window.rscRetryTeachers();
  t.pending[1].resolve(response({'2':{available:false,error:'conflict'}}));await flush();
  t.pending[0].resolve(response({'2':{available:true}}));await flush();
  check('older response cannot overwrite newer blocked response',t.c.teacherOptions['2'].available===false);
}
console.log(`결과: PASS ${pass} / FAIL 0`);
