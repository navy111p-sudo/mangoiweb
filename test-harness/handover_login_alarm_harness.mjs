// Exercise the shipped banner with controlled browser audio policies and authenticated API responses.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('cloudflare-deploy/public/js/handover-inbox-banner.js','utf8');
const report={id:1,version:1,report_date:'2026-10-04',status:'submitted',payload:{priority:'normal'},followup:null};
async function scenario({blocked=false,muted=false,rows=[report],status=200}={}){
 let now=1800000000000,gesture=false,starts=0,closed=0,interval,fetches=0;
 const elements=new Map(),events={},store=new Map(muted?[['mangoi_work_sound_v1','0']]:[]);
 function element(){return {hidden:false,textContent:'',classList:{toggle(){}},setAttribute(){},append(){},replaceChildren(){},querySelector(q){if(!elements.has(q))elements.set(q,element());return elements.get(q);}};}
 const shadow=element(),host={...element(),attachShadow:()=>shadow};
 const document={hidden:false,documentElement:{lang:'ko'},getElementById:()=>host,createElement:element,addEventListener:(k,f)=>events[k]=f};
 class Audio{constructor(){this.state=blocked?'suspended':'running';this.currentTime=0;}resume(){if(gesture)this.state='running';return this.state==='running'?Promise.resolve():new Promise(()=>{});}createOscillator(){return {frequency:{},connect(){},disconnect(){},start(){starts++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}close(){closed++;return Promise.resolve();}}
 let resultRows=rows,resultStatus=status;
 const context={document,window:{AudioContext:Audio,addEventListener:(k,f)=>events[k]=f},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},Date:class extends Date{static now(){return now;}},AbortController,MutationObserver:class{observe(){}},setInterval:f=>interval=f,setTimeout:()=>1,clearTimeout(){},fetch:async url=>{fetches++;return {status:resultStatus,ok:resultStatus===200,json:async()=>url.endsWith('/mine')?{ok:true,reports:[]}:{ok:true,me:{username:'bob'},reader_mode:true,total:resultRows.length,reports:resultRows}};}};
 vm.runInNewContext(source,context);
 const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};await flush();
 return {elements,store,host,document,get starts(){return starts;},get fetches(){return fetches;},get closed(){return closed;},async click(q){gesture=true;elements.get(q).onclick();await flush();},async refresh(){interval();await flush();},advance(ms){now+=ms;},rows(r){resultRows=r;},status(s){resultStatus=s;},async gesture(){gesture=true;events.pointerdown({composedPath:()=>[]});await flush();}};
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
console.log('PASS login alarm: pending/empty/muted/blocked audio, gesture retry, stale cancellation, snooze, hold, permissions, failures, hidden page, inline parity');
