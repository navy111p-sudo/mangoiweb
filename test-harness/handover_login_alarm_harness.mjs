// Exercise the shipped banner with controlled browser audio policies and authenticated API responses.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('cloudflare-deploy/public/js/handover-inbox-banner.js','utf8');
const report={id:1,version:1,report_date:'2026-10-04',status:'submitted',payload:{priority:'normal'},followup:null};
async function scenario({blocked=false,muted=false,rows=[report],status=200,writer=null,storeSeed=[]}={}){
 let now=1800000000000,gesture=false,starts=0,closed=0,interval,fetches=0;
 const elements=new Map(),events={},store=new Map([...(muted?[['mangoi_work_sound_v1','0']]:[]),...storeSeed]);
 function element(){return {hidden:false,textContent:'',kids:[],style:{},focus(){},remove(){this.removed=true;},addEventListener(){},classList:{toggle(){}},setAttribute(){},append(...kids){this.kids.push(...kids);},replaceChildren(...kids){this.kids=kids;},querySelector(q){if(!elements.has(q))elements.set(q,element());return elements.get(q);}};}
 const shadow=element(),host={...element(),attachShadow:()=>shadow};
 const body=element();const document={body,hidden:false,documentElement:{lang:'ko'},getElementById:()=>host,createElement:element,addEventListener:(k,f)=>events[k]=f};
 class Audio{constructor(){this.state=blocked?'suspended':'running';this.currentTime=0;}resume(){if(gesture)this.state='running';return this.state==='running'?Promise.resolve():new Promise(()=>{});}createOscillator(){return {frequency:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){},start(){starts++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}close(){closed++;return Promise.resolve();}}
 let resultRows=rows,resultStatus=status,resultWriter=writer;
 const context={document,window:{AudioContext:Audio,addEventListener:(k,f)=>events[k]=f},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},Date:class extends Date{static now(){return now;}},AbortController,MutationObserver:class{observe(){}},setInterval:f=>interval=f,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{fetches++;return {status:resultStatus,ok:resultStatus===200,json:async()=>url.endsWith('/feedback-pending')?{ok:true,feedback:[]}:url.endsWith('/mine')?{ok:true,reports:[]}:{ok:true,me:{username:'bob'},writer:resultWriter,reader_mode:true,total:resultRows.length,reports:resultRows}};}};
 vm.runInNewContext(source,context);
 const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};await flush();
 return {elements,store,host,document,body,writer(w){resultWriter=w;},get starts(){return starts;},get fetches(){return fetches;},get closed(){return closed;},async click(q){gesture=true;elements.get(q).onclick();await flush();},async refresh(){interval();await flush();},advance(ms){now+=ms;},rows(r){resultRows=r;},status(s){resultStatus=s;},async gesture(){gesture=true;events.pointerdown({composedPath:()=>[]});await flush();}};
}
let s=await scenario();assert.equal(s.starts,3,'login with pending reports chimes');await s.refresh();assert.equal(s.starts,3,'normal polling does not repeat chime');
s=await scenario({rows:[]});assert.equal(s.starts,0,'nothing pending is silent');
s=await scenario({muted:true});assert.equal(s.starts,0,'saved mute is respected');await s.click('.sound');assert.equal(s.starts,3,'explicit enable rings');
s=await scenario({blocked:true});assert.equal(s.starts,0,'no oscillator queued under autoplay block');assert.match(s.elements.get('.sound').textContent,/알람 소리 켜기/);await s.click('.sound');assert.equal(s.starts,3,'gesture resumes pending login alert');
s=await scenario({blocked:true});s.rows([]);await s.refresh();await s.gesture();assert.equal(s.starts,0,'ack elsewhere before unlock cannot play stale queued sound');
s=await scenario({blocked:true});await s.click('.snooze');await s.gesture();assert.equal(s.starts,0,'snooze does not acknowledge or play');assert.match(s.elements.get('.title').textContent,/1건/);
s=await scenario({rows:[{...report,followup:{hold_until:1800003600000}}]});assert.equal(s.starts,0,'active reasoned hold suppresses chime');
s=await scenario({status:403});assert.equal(s.host.hidden,true);assert.equal(s.starts,0);const n=s.fetches;await s.refresh();assert.equal(s.fetches,n,'unauthorized account stops polling');
s=await scenario({blocked:true});s.status(500);await s.refresh();await s.gesture();assert.equal(s.starts,0,'failed refresh never rings from stale data');
s=await scenario({blocked:true});s.document.hidden=true;await s.gesture();assert.equal(s.starts,0,'background page stays silent');
assert.ok(readFileSync('cloudflare-deploy/public/work.html','utf8').includes(source.trim()),'inline and shared banner are identical');
const missing={required:true,today_required:false,warning:{level:3,missing_days:['2026-11-03','2026-11-04','2026-11-05']}};
s=await scenario({rows:[],writer:missing});assert.equal(s.starts,6,'writer stage 3 siren works with empty reader inbox');assert.equal(s.body.kids.length,1,'popup appears on first login');assert.equal(s.host.hidden,false,'persistent red writer banner visible');await s.refresh();assert.equal(s.starts,6,'writer polling does not repeat sound');
let seed=[...s.store.entries()];s=await scenario({rows:[],writer:missing,storeSeed:seed});assert.equal(s.starts,0,'reload same account/day is silent');assert.equal(s.body.kids.length,0,'reload same account/day does not repeat modal');assert.equal(s.host.hidden,false,'banner survives popup dismissal/reload');
s=await scenario({blocked:true,rows:[],writer:missing});assert.equal(s.starts,0,'blocked writer audio queues no oscillator');await s.gesture();assert.equal(s.starts,6,'writer siren retries on first gesture');
s=await scenario({blocked:true,rows:[],writer:missing});s.writer({required:true,warning:{level:0,missing_days:[]}});await s.refresh();await s.gesture();assert.equal(s.starts,0,'resolved missing reports cannot ring later');assert.equal(s.body.kids[0].removed,true,'popup removed after all missing submissions resolved');
s=await scenario({rows:[],writer:{...missing,warning:{level:1,missing_days:['2026-11-05']}}});assert.equal(s.starts,3,'stage 1 uses a shorter warning');
s=await scenario({rows:[],writer:{...missing,warning:{level:2,missing_days:['2026-11-04','2026-11-05']}}});assert.equal(s.starts,6,'stage 2 uses a longer warning');
s=await scenario({rows:[],writer:{required:false,warning:missing.warning}});assert.equal(s.starts,0,'non-roster account never gets writer alarm');assert.equal(s.body.kids.length,0);
s=await scenario({rows:[],writer:missing,muted:true});assert.equal(s.starts,0,'existing mute remains respected for writer audio');assert.equal(s.body.kids.length,1,'muted writer still sees warning');
for(const page of ['manager','work'])assert.ok(readFileSync('cloudflare-deploy/public/'+page+'.html','utf8').includes(source.trim()),page+' inline parity');
console.log('PASS writer alarms: stages, daily limits, popup/banner, muted/blocked audio, gesture, stale cancellation, non-roster');
console.log('PASS login alarm: pending/empty/muted/blocked audio, gesture retry, stale cancellation, snooze, hold, permissions, failures, hidden page, inline parity');
