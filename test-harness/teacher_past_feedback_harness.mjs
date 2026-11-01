// Execute the shipped calendar actions and composer; never send a production request.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../cloudflare-deploy/public/teacher.html',import.meta.url),'utf8');
function fn(name){const a=html.indexOf('  function '+name+'(');return html.slice(a,html.indexOf('\n  function ',a+10));}
let clock=Date.parse('2026-10-24T04:00:00+09:00'), payload, opened, saved=0;
const nodes=new Map();
const body={appendChild(m){m.parentNode=body;},removeChild(m){m.parentNode=null;}};
const mask={querySelector(s){if(!nodes.has(s))nodes.set(s,{value:'',disabled:false,querySelector:()=>null,querySelectorAll:()=>[]});return nodes.get(s);},querySelectorAll(){return [];}};
const listeners={};
const ctx={Date,Number,AbortSignal,Event,window:{addEventListener(){}},T:(en)=>en,EN:()=>true,esc:x=>String(x??'').replaceAll('<','&lt;'),now:()=>clock,
 document:{addEventListener(n,cb){listeners[n]=cb;},createElement:()=>mask,body,dispatchEvent(){saved++;}},
 DATA:{today:'2026-10-24',me:{username:'teacher',name:'Teacher'},classes:[]},WK_DATA:{days:[]},WK_READ:0,MY:{},
 stuLabelText:c=>c.student_name,MangoiClassDisplay:{range:()=> '7:00pm – 7:20pm'},
 bandChip:()=>'',chip:()=>'',stars:()=>'',pick:()=>3,renderClasses(){},renderWeek(){},
 fetch:async(url,opts)=>{assert.equal(url,'/api/eval/manual-create');payload=JSON.parse(opts.body);return {ok:true,json:async()=>({ok:true,id:123})};}};
vm.createContext(ctx);
vm.runInContext([fn('weekRecordHtml'),fn('canWriteWeekFeedback'),fn('freshClass'),fn('openEval')].join('\n'),ctx);
const base={kind:'class',schedule_id:1,student_uid:'student',student_name:'Student',room_id:'class-1-20261023',class_date:'2026-10-23',start_ts:clock-1000,report_loaded:true};
assert(ctx.weekRecordHtml(base).includes('data-week-eval="class-1-20261023"'));
assert(ctx.weekRecordHtml({...base,today_eval:{id:77}}).includes('data-evq="77"'));
for(const patch of [{kind:'lms'},{kind:'sample'},{student_uid:''},{room_id:''},{report_loaded:false},{report_loaded:undefined},{today_eval:{id:7}},{eval_written:true},{holiday_name:'Holiday'},{class_state:'postponed'},{class_state:'cancelled'},{start_ts:0},{start_ts:'bad'},{start_ts:clock+1}]){
 assert.equal(ctx.canWriteWeekFeedback({...base,...patch}),false,JSON.stringify(patch));
}
for(let i=0;i<720;i++){
 const start=clock+(i-360)*60000;
 assert.equal(ctx.canWriteWeekFeedback({...base,start_ts:start}),start<=clock);
}
// A recurring schedule has today's row too: saving the prior day must not mark today's row.
ctx.DATA.classes=[{...base,class_date:ctx.DATA.today,room_id:'class-1-20261024'}];
assert.equal(ctx.freshClass(base),base);
const past={...base};ctx.WK_DATA.days=[{items:[past]}];
ctx.openEval=c=>{opened=c;};
listeners.click({target:{closest:()=>({getAttribute:()=>past.room_id})}});assert.equal(opened,past);
past.report_loaded=false;opened=null;
listeners.click({target:{closest:()=>({getAttribute:()=>past.room_id})}});assert.equal(opened,null);
past.report_loaded=true;
vm.runInContext(fn('openEval'),ctx);
// Different dates, including leap day/month boundaries, through the actual Send handler.
for(let i=0;i<400;i++){
 const date=new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);
 const c={...base,class_date:date,room_id:'class-1-'+date.replaceAll('-','')};
 nodes.clear();ctx.openEval(c);
 assert(mask.innerHTML.includes(date));
 mask.querySelector('#ev-ko').value='학생이 수업에 열심히 참여했습니다.';
 mask.querySelector('#ev-en').value='Participated well.';
 await mask.querySelector('#ev-ok').onclick();
 await new Promise(r=>setImmediate(r));
 assert.equal(payload.lesson_date,date);assert.equal(payload.room_id,c.room_id);
 assert.equal(payload.student_uid,'student');assert.equal(payload.teacher_uid,'teacher');
 assert.equal(c.today_eval.id,123);assert.equal(ctx.DATA.classes[0].eval_written,undefined);
 assert.equal(mask.parentNode,null);
}
assert.equal(saved,400);
console.log('PASS: 720 start-time boundaries, 400 real composer saves with historical dates, stale actions, recurring-day isolation, edit link and blocked states');
