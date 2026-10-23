import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = fs.readFileSync(new URL('../cloudflare-deploy/public/teacher.html', import.meta.url), 'utf8');
// Parse every inline script, including ones this test does not execute.
for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
const start = html.indexOf('  function askReport(');
const end = html.indexOf('\n  function openEval(', start);
let resolve, calls = 0;
const ctx = {
  reportPendingCount: 0, reportPending: {}, ASKED: {}, DATA: {today:'2026-10-23'}, WK_READ: 0,
  resumeClassRender(){}, classRenderDeferred: false,
  Date, Error, AbortSignal, EN:()=>false, T:(en,ko)=>ko, askedSave(){},
  setBtnLabel(b,en,ko){ b.label=ko; },
  fetch(){ calls++; return new Promise(r=>{resolve=r;}); }
};
vm.createContext(ctx); vm.runInContext(html.slice(start,end),ctx);
const button = ()=>({disabled:false, attrs:{}, setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});
const c={room_id:'room-1'}; const b=button();
ctx.askReport(c,b); ctx.askReport(c,b);
assert.equal(calls,1); assert.equal(ctx.reportPendingCount,1);
assert.equal(b.disabled,true); assert.equal(b.attrs['aria-busy'],'true');
resolve({ok:true,json:async()=>({ok:true})});
await new Promise(r=>setImmediate(r));
assert.equal(ctx.reportPendingCount,0); assert.ok(ctx.ASKED[c.room_id]);
assert.equal(b.disabled,true); assert.equal(b.label,'요청됨 ✓'); assert.equal(b.attrs['aria-busy'],undefined);
const b2=button(); ctx.askReport({room_id:'room-2'},b2);
resolve({ok:false,status:500,json:async()=>({ok:true})});
await new Promise(r=>setImmediate(r));
assert.equal(b2.disabled,false); assert.equal(b2.label,'다시 누르기'); assert.equal(ctx.reportPendingCount,0);
ctx.askReport({room_id:'room-2'},b2); assert.equal(calls,3);
resolve({ok:true,json:async()=>({ok:false,error:'denied'})});
await new Promise(r=>setImmediate(r)); assert.equal(b2.disabled,false);
// Execute the actual early-render guard: no DOM mutation during interaction.
const guard = html.slice(html.indexOf('  function renderClasses('),html.indexOf('    portalAcademies();',html.indexOf('  function renderClasses(')))+'return "render"; }';
let focused=false, pendingSelect=false;
ctx.classPointerDown=false;
ctx.document={activeElement:{tagName:'SELECT'},getElementById(){return {contains:()=>focused,querySelector:()=>pendingSelect};}};
vm.runInContext(guard,ctx);
assert.equal(ctx.renderClasses([]),'render');
focused=true; assert.equal(ctx.renderClasses([]),undefined);
assert.equal(ctx.renderClasses([],true),'render');
focused=false; pendingSelect=true; assert.equal(ctx.renderClasses([]),undefined);
pendingSelect=false; ctx.classPointerDown=true; assert.equal(ctx.renderClasses([]),undefined);
ctx.classPointerDown=false; ctx.reportPendingCount=1; assert.equal(ctx.renderClasses([]),undefined);
console.log('PASS: script syntax, duplicate requests, success, HTTP/API failure, retry, focus/pointer/save guards');
