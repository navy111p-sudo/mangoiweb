// Execute the shipped click handler, including coexistence with a legacy filter listener.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(process.env.TEACHER_HTML || new URL('../cloudflare-deploy/public/teacher.html',import.meta.url),'utf8');
const a=html.indexOf('  function portalContact('),b=html.indexOf('  function portalRefresh(',a);
assert(a>=0&&b>a);
let passed=0;
for(const cold of [false,true])for(const query of ['', 'Student', 'visible-login'])for(const academy of ['', 'Academy A'])for(const direction of ['asc','desc']){
 const filters={'portal-search':{value:query},'portal-academy':{value:academy},'class-time-sort':{value:direction},'wk-date':{value:'2026-10-23'}};
 const before=JSON.stringify(filters),handlers=[],scripts=[],opened=[];
 const ctx={document:{getElementById:id=>filters[id],addEventListener:(name,fn)=>handlers.push(fn),createElement:()=>({remove(){}}),head:{appendChild:s=>scripts.push(s)}},window:{},T:en=>en,esc:x=>String(x??''),stuUid:c=>c.student_id,stuLabelText:c=>c.student_name,todayKST:()=> '2026-10-24',alert(){}};
 const history={open:context=>opened.push(context)};
 if(!cold)ctx.window.MangoiTeacherHistory=history;
 vm.createContext(ctx);vm.runInContext(html.slice(a,b),ctx);
 const markup=ctx.portalContact({kind:'class',student_uid:'internal-admin-id',student_id:'visible-login',student_name:'Student',schedule_id:42,class_date:'2026-10-23'});
 const attrs=Object.fromEntries([...markup.matchAll(/(data-[\w-]+)(?:="([^"]*)")?/g)].map(m=>[m[1],m[2]||'']));
 const button={disabled:false,getAttribute:name=>attrs[name]??null};
 const event={target:{closest:selector=>Object.hasOwn(attrs,selector.slice(1,-1))?button:null}};
 // Old filter handlers must never see the new history action as a filter request.
 handlers.push(e=>{if(e.target.closest('[data-student-calendar]'))filters['portal-search'].value='internal-admin-id';});
 handlers.forEach(h=>h(event));
 if(cold){assert.equal(scripts.length,1);ctx.window.MangoiTeacherHistory=history;scripts[0].onload();}
 assert.equal(opened.length,1);assert.equal(opened[0].scheduleId,'42');assert.equal(opened[0].date,'2026-10-23');
 assert.equal(JSON.stringify(filters),before,'opening history must preserve all portal filters');
 assert.equal(button.disabled,false);passed++;
}
console.log(`PASS ${passed} history/filter scenarios: cold/warm loads, differing internal/display IDs, search, academy, time order and selected date preserved.`);
