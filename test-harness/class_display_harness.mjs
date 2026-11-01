import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('../cloudflare-deploy/node_modules/typescript');
const rd=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
let source;
for(const page of ['teacher.html','manager.html','admin/student.html']){
 const html=rd('cloudflare-deploy/public/'+page);
 const script=html.match(/<script>\s*(\/\* Class display:[\s\S]*?)<\/script>/)[1];
 if(source)assert.equal(script,source,'all surfaces share the same formatter');source=script;
 const listeners={}, saved={}, window={addEventListener:(n,f)=>listeners[n]=f,dispatchEvent:()=>{}},document={addEventListener:(n,f)=>listeners[n]=f,querySelectorAll:()=>[]};
 vm.runInNewContext(script,{window,document,localStorage:{getItem:k=>saved[k],setItem:(k,v)=>saved[k]=v},Event:class{}});
 const d=window.MangoiClassDisplay;
 assert.equal(d.time('00:00'),'12:00am');assert.equal(d.time('12:00'),'12:00pm');assert.equal(d.time('14:00'),'2:00pm');
 assert.equal(d.range({start_time:'14:00',duration_min:20}),'2:00pm – 2:20pm · 20 min');
 assert.equal(d.range({start_time:'23:50',duration_min:30}),'11:50pm – 12:20am (+1d) · 30 min');
 listeners.change({target:{matches:()=>true,value:'24'}});
 assert.equal(d.range({start_time:'14:00',duration_min:30}),'14:00 – 14:30 · 30 min');
 assert.equal(saved['mangoi.classTimeFormat'],'24');
 listeners.storage({key:'mangoi.classTimeFormat',newValue:'12'});assert.equal(d.time('14:00'),'2:00pm');
}
function module(p,imports={}){
 const out={exports:{}};
 const js=ts.transpileModule(rd('cloudflare-deploy/src/'+p),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',js)(out,out.exports,n=>imports[n]||{});return out.exports;
}
const canon=module('class-today-extras.ts');
const rows=[{id:22,student_uid:'a',room_id:'class-1-20261022',created_at:Date.parse('2026-10-22T16:00:00+09:00')},
 {id:23,student_uid:'a',room_id:'class-2-20261022',created_at:Date.parse('2026-10-22T16:30:00+09:00')}];
let fail=false;
const mod=module('calendar-records.ts',{'./class-today-extras':canon,'./d1-chunk':{selectInChunks:async(db,ids,sql)=>{if(fail)throw Error('offline');return sql('?').includes('student_evaluations')?rows:[{schedule_id:1,action:'reschedule',lesson_date:'2026-10-22',detail:'{"teacher_changed":true}'}];}}});
const items=[1,2].map(id=>({schedule_id:id,student_uid:'a',date:'2026-10-22',room_id:'class-'+id+'-20261022'}));
await mod.attachCalendarRecords({},items);
assert.equal(items[0].today_eval.id,22);assert.equal(items[1].today_eval.id,23);
assert.equal(items[0].teacher_changed,true);assert.equal(items[1].teacher_changed,false);
rows.splice(0,rows.length,{id:24,student_uid:'a',room_id:null,created_at:Date.parse('2026-10-22T17:00:00+09:00')});
await mod.attachCalendarRecords({},items);
assert.equal(items[0].today_eval,null);assert.equal(items[1].today_eval,null);
assert.equal(items[0].report_loaded,false,'roomless report cannot be assigned to either of two classes');
await mod.attachCalendarRecords({},[items[0]]);assert.equal(items[0].today_eval.id,24);
fail=true;await mod.attachCalendarRecords({},items);assert.equal(items[0].report_loaded,false);assert.equal(items[0].today_eval,null);
console.log('PASS: three formatters, AM/PM boundaries, durations, midnight, storage, per-room reports, teacher changes, unavailable records');
