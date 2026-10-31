// Runs the actual translation route and receipt handler with isolated service doubles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const api = readFileSync('cloudflare-deploy/src/api-approval.ts', 'utf8');
const html = readFileSync('cloudflare-deploy/public/work.html', 'utf8');
for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
const route = api.slice(api.indexOf('  const mTranslate ='), api.indexOf('  const mOne ='));
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const translate = new AsyncFunction('actor','env','url','path','method','isHqStaff','canView','chainOf','ph','safe','json',stripTypeScriptTypes('async function routeTest(){\n'+route+'\n}').replace(/^async function routeTest\(\)\{/, '').replace(/}\s*$/, ''));
let calls = 0;
const row = { title: 'Headset', body: '3 units PHP 2400', req_type: 'purchase', requester_username: 'manager' };
async function run({staff=true, allowed=true, found=true, ai=true, lang='ko', fails=false}={}) {
  calls = 0;
  const env = {DB:{prepare:()=>({bind:()=>({first:async()=>found?row:null})})}, AI: ai?{run:async()=>{calls++;if(fails) throw Error('offline');return {response:'헤드셋\n3개 PHP 2400'};}}:null};
  return translate({},env,new URL('https://test/api?lang='+lang),'/api/approval/requests/42/translate','POST',()=>staff,()=>allowed,async()=>({usernames:[]}),false,async(f,b)=>{try{return await f();}catch{return b;}},(data,status=200)=>({data,status}));
}
assert.equal((await run({staff:false})).status,403); assert.equal(calls,0);
assert.equal((await run({allowed:false})).status,403); assert.equal(calls,0);
assert.equal((await run({found:false})).status,404); assert.equal(calls,0);
assert.equal((await run({lang:'xx'})).status,400); assert.equal(calls,0);
assert.equal((await run({ai:false})).status,503);
assert.equal((await run({fails:true})).status,503);
const success=await run(); assert.equal(success.status,200); assert.equal(calls,1);
assert.deepEqual(success.data.original,{title:row.title,body:row.body});
assert.equal((await run({lang:'en'})).data.lang,'en');
// A slow earlier OCR response must never update the newly selected receipt.
const start=html.indexOf('function takeFile(f){'), end=html.indexOf('\n/* 🧾 영수증 품목',start);
let pending=[]; const values={}; let notes=[];
const context={PHOTO_SEQ:0,OCR:null,FILE:null,PICK:{requires_file:true},PHOTO_Q:'',CUR:'PHP',
  note:x=>notes.push(x),T:(en)=>en,photoWarn:()=>{},shrink:async f=>f,photoQualityOf:async()=>'',
  fetch:()=>new Promise(resolve=>pending.push(resolve)),getVal:k=>values[k]||'',setVal:(k,v)=>values[k]=v,fillFromReceipt:()=>false};
vm.createContext(context);vm.runInContext(html.slice(start,end),context);
context.takeFile({type:'image/png',name:'old.png'});await new Promise(setImmediate);
context.takeFile({type:'image/png',name:'new.png'});await new Promise(setImmediate);
pending[1]({json:async()=>({ok:true,amount:200,vendor:'new'})});await new Promise(setImmediate);
pending[0]({json:async()=>({ok:true,amount:999,vendor:'old'})});await new Promise(setImmediate);
assert.equal(context.OCR.amount,200);assert.equal(values.f_amount,200);assert.equal(context.FILE.name,'new.png');
context.takeFile({type:'image/png',name:'third.png'});await new Promise(setImmediate);
context.takeFile({type:'application/pdf',name:'final.pdf'});
pending[2]({json:async()=>({ok:true,amount:888})});await new Promise(setImmediate);
assert.equal(context.OCR,null);assert.equal(context.FILE.name,'final.pdf');
console.log('PASS: translation access control, unavailable AI, original preservation, KO/EN, stale receipt/PDF races, inline JS syntax');
// Exercise the real quick-action and translation UI without a network/browser dependency.
function element(){return {children:[],style:{},textContent:'',disabled:false,appendChild(x){this.children.push(x);},scrollIntoView(){},focus(){this.focused=true;}};}
let posted=0, pickCount=0, shotCount=0;
const host=element(), button=element();button.parentNode={querySelector:()=>host};
let english=false;
const ui={window:{},PICK:{key:'expense'},document:{createElement:element,getElementById:()=>button},
 T:(en,ko)=>english?en:ko,EN:()=>english,toast:()=>{},note:()=>{},AP_TRANSLATING:{},
 AbortController,setTimeout,clearTimeout,encodeURIComponent,
 fetch:async()=>{posted++;return {ok:true,json:async()=>({ok:true,translation:'<img onerror=evil()>',original:{title:'Test',body:'Original 2400 PHP'}})};}};
ui.window.pick=()=>{pickCount++;ui.PICK={key:'expense'};};ui.window.shoot=()=>shotCount++;
vm.createContext(ui);
vm.runInContext(html.slice(html.indexOf('window.aiStart ='),html.indexOf('window.pick = function(key){')),ui);
ui.window.aiStart('receipt');assert.equal(pickCount,0);assert.equal(shotCount,1);
ui.PICK=null;ui.window.aiStart('voice');assert.equal(pickCount,1);assert.equal(shotCount,1);
assert.equal(posted,0); // Opening a form does not trigger a translation/model call.
ui.window.translateApproval(42,button);ui.window.translateApproval(42,button);
await new Promise(setImmediate);assert.equal(posted,1);assert.equal(button.disabled,false);
assert.equal(host.children[1].textContent,'<img onerror=evil()>'); // Render as text, never markup.
assert.equal(host.children[2].children[1].textContent,'Test\nOriginal 2400 PHP');
ui.fetch=async()=>({ok:false});ui.window.translateApproval(42,button);await new Promise(setImmediate);
assert.equal(button.disabled,false);assert.match(host.textContent,/번역하지 못했습니다/);
console.log('PASS: quick-action draft preservation, explicit-only AI, duplicate-click guard, safe translation text, original text and retry');
