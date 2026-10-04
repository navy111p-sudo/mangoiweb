/** Synthetic VM regression for the actual game-vocab.js account boundary. No network. */
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(resolve(ROOT,'cloudflare-deploy/public/js/game-vocab.js'),'utf8');
let pass=0,fail=0;
const ok=(label,v)=>{v?pass++:fail++;console.log((v?'PASS ':'FAIL ')+label);};
function setup(){let uid='A';const storage=new Map(),pending=[];let now=1000;
 const context={window:{},localStorage:{getItem:k=>k==='mangoi_logged_user'&&uid?JSON.stringify({uid}):null},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},fetch:u=>new Promise((resolve,reject)=>pending.push({u,resolve,reject})),Date:{now:()=>now},Promise,JSON};
 vm.runInNewContext(source,context);
 const payload=who=>({ok:true,json:async()=>({ok:true,student_name:who,words:[{en:who==='A'?'apple':'banana',ko:'과일'}]})});
 return {load:()=>context.window.MangoiGameVocab.load(),switchTo:v=>uid=v,pending,storage,finish:(i,who)=>pending[i].resolve(payload(who)),tick:()=>now+=700000};}
{
 const s=setup(),a=s.load(),again=s.load();ok('same account deduplicates in flight',a===again&&s.pending.length===1);s.finish(0,'A');await a;const cached=await s.load();ok('same account receives cache',cached.student==='A'&&s.pending.length===1);s.tick();const fresh=s.load();ok('expired cache refetches',s.pending.length===2);s.finish(1,'A');await fresh;
}
{
 const s=setup(),a=s.load();s.switchTo('B');const b=s.load();ok('different account gets separate request',a!==b&&s.pending.length===2);s.finish(0,'A');const stale=await a;ok('stale A success is discarded after B login',stale===null);if(s.pending.length>1){s.finish(1,'B');const data=await b;ok('B receives only B vocabulary',data.student==='B');}else{await b;ok('B receives only B vocabulary',false);}
}
{
 const s=setup(),a=s.load();s.switchTo('');s.finish(0,'A');ok('logout discards pending personal response',(await a)===null);ok('logout returns no personal cache',(await s.load())===null);
}
{
 const s=setup(),a=s.load();s.switchTo('B');const b=s.load();s.pending[0].reject(new Error('synthetic offline'));await a;const b2=s.load();ok('stale A failure cannot clear B request',b===b2&&s.pending.length===2);if(s.pending[1])s.finish(1,'B');await b2;
}
{
 const s=setup(),a=s.load();s.pending[0].reject(new Error('synthetic offline'));ok('network failure gracefully returns null',(await a)===null);const retry=s.load();ok('same account can retry after failure',s.pending.length===2);s.finish(1,'A');ok('retry returns own content',(await retry).student==='A');
}
console.log(JSON.stringify({pass,fail,mode:'synthetic VM; actual client source; zero remote calls'}));process.exitCode=fail?1:0;
