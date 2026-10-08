// Actual shipped cancellation UI functions with synthetic in-process transport only.
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(process.env.END_CLASSES_SOURCE||new URL('../cloudflare-deploy/public/admin/student.html',import.meta.url),'utf8');
const a=source.indexOf('var _endPlan = []'),b=source.indexOf('window.extendBy =',a);
if(a<0||b<a)throw Error('Cancellation source block missing');
const code=source.slice(a,b), inputTag=source.match(/<input\b[^>]*id="endFromDate"[^>]*>/)?.[0]||'';
const inputCode=inputTag.match(/oninput="([^"]+)"/)?.[1]||'',changeCode=inputTag.match(/onchange="([^"]+)"/)?.[1]||'';
let pass=0,fail=0;const results=[];
function check(name,ok,detail){results.push({name,passed:!!ok,detail});if(ok){pass++;console.log('PASS '+name);}else{fail++;console.log('FAIL '+name+' '+JSON.stringify(detail));}}
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const rows=[{id:1,source:'adm-enroll:order_A',user_id:'fixture_A',scheduled_date:'2026-10-08',start_time:'19:00',status:'active',teacher_name:'Fixture Teacher',class_type:'regular'},
{id:2,source:'adm-enroll:order_B',user_id:'fixture_A',scheduled_date:'2026-10-16',start_time:'19:00',status:'active',teacher_name:'Fixture Teacher',class_type:'regular'},
{id:3,user_id:'fixture_A',scheduled_date:null,start_time:'19:00',status:'active'},
{id:4,user_id:'fixture_B',scheduled_date:'2026-10-16',start_time:'19:00',status:'active'},
{id:5,user_id:'fixture_A',scheduled_date:'2026-10-17',start_time:'19:00',status:'cancelled'}];
const reply=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
function world(lang='ko'){
 const elements=new Map(),storage=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',innerHTML:''});return elements.get(id);};
 el('endFromDate').value='2026-10-08';el('endRunBtn').disabled=true;
 const w={reads:[],writes:[],confirms:[],rows:structuredClone(rows),accept:true,now:Date.parse('2026-10-08T00:00:00Z'),onGet:null,onDelete:null,onRestore:null};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[w.now]));}static now(){return w.now;}}
 const ctx={uid:'fixture_A',_lang:lang,$:el,esc:x=>String(x??''),Date:Clock,console,encodeURIComponent,
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 confirm:message=>{w.confirms.push(message);if(w.onConfirm)w.onConfirm();return w.accept;},
 fetch:async(url,opts={})=>{const method=opts.method||'GET';if(method==='GET'){if(!String(url).startsWith('/api/admin/class-schedules?'))throw Error('Unexpected read');w.reads.push(url);return w.onGet?await w.onGet(url):reply({ok:true,items:structuredClone(w.rows)});}
 if(!/^\/api\/admin\/class-schedules\/\d+$/.test(url)||!['DELETE','POST'].includes(method))throw Error('Unexpected mutation');
 const op={id:Number(url.split('/').pop()),method,body:JSON.parse(opts.body||'{}')};w.writes.push(op);
 return method==='DELETE'&&w.onDelete?await w.onDelete(op):method==='POST'&&w.onRestore?await w.onRestore(op):reply({ok:true});},
 loadAiSchedules(){},loadDStudentSchedule(){}};ctx.window=ctx;runInNewContext(code,ctx);
 w.ctx=ctx;w.el=el;w.storage=storage;w.preview=()=>ctx.endClassesPreview();w.run=()=>ctx.endClassesRun();w.undo=()=>ctx.endClassesUndo();
 w.date=(value,event)=>{el('endFromDate').value=value;if(event){const src=event==='change'?changeCode:inputCode;if(src)runInNewContext(src,ctx);}};
 return w;
}
for(const lang of ['ko','en']){
 const w=world(lang);await w.preview();w.date('2026-10-15');await w.run();check(lang+' date changed without event blocks stale deletion',w.writes.length===0,w.writes);check(lang+' stale date blocks confirmation',w.confirms.length===0);check(lang+' stale date requires fresh preview',w.el('endRunBtn').disabled);
}
for(const event of ['input','change']){
 const w=world();await w.preview();w.date('2026-10-15',event);check(event+' immediately disables execution',w.el('endRunBtn').disabled);await w.run();check(event+' change causes no mutation',w.writes.length===0);
}
{
 const w=world(),one=defer(),two=defer();let n=0;w.onGet=()=>++n===1?one.promise:two.promise;
 const old=w.preview();w.date('2026-10-15','input');const fresh=w.preview();two.resolve(reply({ok:true,items:w.rows}));await fresh;one.resolve(reply({ok:true,items:w.rows}));await old;await w.run();
 check('late old success cannot overwrite newer date preview',w.writes.length===1&&w.writes[0].id===2,w.writes);
}
{
 const w=world(),one=defer();let n=0;w.onGet=()=>++n===1?one.promise:Promise.resolve(reply({ok:true,items:w.rows}));
 const old=w.preview();w.date('2026-10-15','input');await w.preview();one.resolve(reply({ok:false,error:'old_failure'},503));await old;
 check('late old failure cannot overwrite newer successful preview',!w.el('endPreviewBox').textContent.includes('old_failure')&&!w.el('endRunBtn').disabled);
 await w.run();check('newer preview remains executable after stale failure',w.writes.length===1&&w.writes[0].id===2);
}
{
 const w=world(),pending=defer();w.onGet=()=>pending.promise;const req=w.preview();w.date('2026-10-15','input');pending.resolve(reply({ok:true,items:w.rows}));await req;await w.run();
 check('date edit during preview leaves plan invalid',w.writes.length===0&&w.el('endRunBtn').disabled,w.writes);
}
{
 const w=world(),pending=defer();await w.preview();let first=true;w.onDelete=()=>{if(first){first=false;return pending.promise;}return Promise.resolve(reply({ok:true}));};
 const one=w.run();const two=w.run();await two;check('repeated run confirms and starts once',w.confirms.length===1&&w.writes.length===1,{confirms:w.confirms.length,writes:w.writes});pending.resolve(reply({ok:true}));await one;
 check('repeated run never duplicates an ID',w.writes.length===2&&new Set(w.writes.map(x=>x.id)).size===2,w.writes);
}
{
 const w=world(),pending=defer();await w.preview();let first=true;w.onDelete=()=>{if(first){first=false;return pending.promise;}return Promise.resolve(reply({ok:true}));};
 const run=w.run();check('date and preview controls are locked during execution',w.el('endFromDate').disabled&&w.el('endPreviewBtn').disabled);
 w.rows.push({...rows[1],id:6,scheduled_date:'2026-10-20'});w.date('2026-10-15','input');await w.preview();check('preview cannot replace an executing batch',w.reads.length===1);
 pending.resolve(reply({ok:true}));await run;check('execution uses only the confirmed snapshot',w.writes.map(x=>x.id).join(',')==='1,2',w.writes);check('execution unlocks date but requires a fresh preview',!w.el('endFromDate').disabled&&w.el('endRunBtn').disabled);
}
{
 const w=world();await w.preview();w.accept=false;await w.run();check('confirmation cancellation keeps valid preview and writes nothing',w.writes.length===0&&!w.el('endRunBtn').disabled);w.accept=true;await w.run();check('valid confirmation ends only displayed own dated active rows',w.writes.map(x=>x.id).join(',')==='1,2');
 const saved=JSON.parse(w.storage.get('mgsEndBatch:fixture_A'));check('undo journal contains only confirmed successes',saved.items.map(x=>x.id).join(',')==='1,2');
}
{
 const w=world();await w.preview();w.onConfirm=()=>w.date('2026-10-15','input');await w.run();check('selection is rechecked after confirmation',w.writes.length===0);
}
{
 const w=world();w.now=Date.parse('2026-10-08T14:59:00Z');await w.preview();w.now=Date.parse('2026-10-08T15:01:00Z');await w.run();check('KST midnight invalidates a now-past cutoff',w.writes.length===0&&w.el('endRunBtn').disabled);
}
{
 const w=world();await w.preview();w.ctx.uid='fixture_B';await w.run();check('student identity drift cannot execute the old plan',w.writes.length===0);
}
{
 const w=world();await w.preview();w.onGet=()=>reply({ok:false,error:'fixture_unavailable'},503);await w.preview();await w.run();check('new failed preview cannot reuse old IDs',w.writes.length===0&&w.el('endRunBtn').disabled);
}
for(const from of ['', '2026-10-01']){const w=world();w.date(from);await w.preview();check('existing blank/past cutoff clamps to KST today: '+from,w.el('endFromDate').value==='2026-10-08');await w.run();check('clamped cutoff preserves displayed selection: '+from,w.writes.map(x=>x.id).join(',')==='1,2');}
{
 const w=world();await w.preview();w.onDelete=op=>op.id===1?reply({ok:false},503):reply({ok:true});await w.run();const saved=JSON.parse(w.storage.get('mgsEndBatch:fixture_A'));check('partial failures journal only successful rows',saved.items.length===1&&saved.items[0].id===2);check('partial failures do not claim full success',w.el('endPreviewBox').innerHTML.includes('1건 실패'));
}
{
 const w=world(),pending=defer();await w.preview();w.onGet=()=>pending.promise;const request=w.preview();await w.run();
 check('new preview pending cannot execute previous valid plan',w.writes.length===0&&w.el('endRunBtn').disabled);
 pending.resolve(reply({ok:false,error:'latest_failed'},503));await request;await w.run();check('failed pending preview leaves previous plan unusable',w.writes.length===0);
}
{
 const w=world(),pending=defer();w.onGet=()=>pending.promise;const request=w.preview();w.ctx.uid='fixture_B';pending.resolve(reply({ok:true,items:w.rows}));await request;await w.run();
 check('student drift during async preview cannot enable old rows',w.writes.length===0&&w.el('endRunBtn').disabled);
}
{
 const w=world();await w.preview();const sources=w.ctx._endPlan.map(x=>x.source);await w.run();
 check('displayed cross-enrollment row identities are preserved',sources.join(',')==='adm-enroll:order_A,adm-enroll:order_B'&&w.writes.map(x=>x.id).join(',')==='1,2');
}
{
 const w=world(),pending=defer();w.storage.set('mgsEndBatch:fixture_A',JSON.stringify({at:w.now,items:[{id:1,date:'2026-10-08',time:'19:00'}]}));w.onRestore=()=>pending.promise;
 const one=w.undo();const two=w.undo();await w.preview();await w.run();
 check('undo serializes with run preview and repeated undo',w.writes.length===1&&w.reads.length===0&&w.el('endFromDate').disabled,{writes:w.writes,reads:w.reads});
 pending.resolve(reply({ok:true}));await Promise.all([one,two]);check('undo completion leaves controls ready for new preview',!w.el('endFromDate').disabled&&w.el('endRunBtn').disabled);
}
for(const status of ['active','completed',undefined]){
 const w=world('en');w.storage.set('mgsEndBatch:fixture_A',JSON.stringify({at:w.now,items:[{id:1,date:'2026-10-08',time:'19:00'}]}));w.onRestore=()=>reply({ok:false,error:'not_cancelled',status},409);await w.undo();
 check('not-cancelled response counts as restored only for verified active: '+String(status),status==='active'?!w.storage.has('mgsEndBatch:fixture_A'):JSON.parse(w.storage.get('mgsEndBatch:fixture_A')||'null')?.items.length===1,w.el('endPreviewBox').textContent);
}
for(const lang of ['ko','en']){
 const w=world(lang);w.storage.set('mgsEndBatch:fixture_A',JSON.stringify({at:w.now,items:[{id:1,date:'2026-10-08',time:'19:00'}]}));w.onRestore=()=>reply({ok:false,error:'restore_failed'},503);await w.undo();
 check(lang+' uncertain restore asks for refresh instead of raw code',!w.el('endPreviewBox').textContent.includes('restore_failed')&&/refresh|새로고침/.test(w.el('endPreviewBox').textContent),w.el('endPreviewBox').textContent);
}
check('actual HTML wires both cutoff edit events',!!inputCode&&!!changeCode);check('actual preview button can be disabled',/id="endPreviewBtn"/.test(source));
console.log(`end_classes_preview: PASS ${pass} / FAIL ${fail}`);
if(process.env.END_CLASSES_RESULT)writeFileSync(process.env.END_CLASSES_RESULT,JSON.stringify({pass,fail,results},null,2)+'\n');
if(fail)process.exitCode=1;
