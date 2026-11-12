import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../cloudflare-deploy/public/warmup.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function warmupFetch(url, options){'),html.indexOf('function pauseWarmup(){'));
function setup(json){
 const timers=new Map();let seq=0,signal;
 const response={ok:true,status:200,headers:new Map(),body:{getReader(){return 'unchanged reader';}},json:()=>json(signal)};
 const ctx={AbortController,Promise,Error,_warmPaused:false,_warmControllers:[],API_BASE:'',window:{},localStorage:{getItem:()=>null},
  setTimeout:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clearTimeout:id=>timers.delete(id),
  fetch:async(url,opts)=>{signal=opts.signal;return response;}};
 vm.runInNewContext(source,ctx);
 return {ctx,timers,response,signal:()=>signal};
}
{
 const h=setup(()=>new Promise(()=>{}));const r=await h.ctx.warmupFetch('/api/warmup/chat');
 assert.equal(h.timers.size,0,'header timeout released');
 const read=r.json();
 assert.equal(h.ctx._warmControllers.length,1,'JSON body remains cancellable after headers');
 assert.equal(h.timers.size,1,'JSON body has a finite deadline');
 const deadline=[...h.timers.values()][0];assert.equal(deadline.ms,20000);deadline.fn();
 await assert.rejects(read,/timed out|aborted/);
 assert.equal(h.signal().aborted,true);assert.equal(h.ctx._warmControllers.length,0);assert.equal(h.timers.size,0);
}
{
 const h=setup(()=>new Promise(()=>{}));const r=await h.ctx.warmupFetch('/api/warmup/chat');const read=r.json();
 h.ctx._warmControllers.splice(0).forEach(c=>c.abort());
 await assert.rejects(read,/aborted/);assert.equal(h.timers.size,0,'leaving releases body timer');
}
{
 const h=setup(()=>Promise.resolve({ai_response:'Hello'}));const r=await h.ctx.warmupFetch('/api/warmup/chat');
 assert.deepEqual(await r.json(),{ai_response:'Hello'});assert.equal(h.timers.size,0);assert.equal(h.ctx._warmControllers.length,0);assert.equal(h.signal().aborted,false);
}
{
 const h=setup(()=>Promise.reject(new SyntaxError('invalid JSON')));const r=await h.ctx.warmupFetch('/api/warmup/chat');
 await assert.rejects(r.json(),/invalid JSON/);assert.equal(h.timers.size,0);assert.equal(h.ctx._warmControllers.length,0);
}
{
 const h=setup(()=>Promise.resolve({}));const r=await h.ctx.warmupFetch('/api/warmup/chat');
 assert.equal(r,h.response);assert.equal(r.body.getReader(),'unchanged reader');assert.equal(h.timers.size,0,'SSE retains its existing reader timeout');
}
console.log('PASS: response body timeout, leave cancellation, success, malformed JSON, unchanged SSE');
