/** Execute the shipped identity loader with deferred responses; no actual network. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../cloudflare-deploy/public/js/adm-identity.js',import.meta.url),'utf8');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.hidden=false;this.textContent='';}
  appendChild(child){this.children.push(child);return child;}
  setAttribute(key,value){this[key]=value;}
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture({ready='complete',stored}={}){
  const values=new Map(Object.entries(stored||{})),requests=[],timers=new Map(),events=[],handlers={},listeners={};let nextTimer=0;
  const body=new Element('body');
  const document={body,readyState:ready,createElement:tag=>new Element(tag),addEventListener:(name,fn)=>{handlers[name]=fn;},dispatchEvent:event=>events.push(event)};
  const window={addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const context={window,document,localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},AbortController,
    CustomEvent:class {constructor(type,{detail}){this.type=type;this.detail=detail;}},
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    fetch:(url,options)=>{const wait=deferred();requests.push({url,options,...wait});return wait.promise;}};
  vm.runInNewContext(source,context);
  const response=(name,status=200)=>({ok:status===200,json:async()=>({ok:true,user:{username:name,name:'Name '+name},role:'exec',scope:{label:'HQ'}})});
  const find=id=>{const walk=node=>node.id===id?node:node.children.map(walk).find(Boolean);return walk(body);};
  return{window,body,values,requests,timers,events,handlers,listeners,response,find};
}
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
{
  const f=fixture({ready:'loading'});await tick();assert.equal(f.requests.length,0);f.handlers.DOMContentLoaded();await tick();
  const a=f.window.admRetryIdentity(),b=f.window.admRetryIdentity();assert.equal(a,b);assert.equal(f.requests.length,1);
  f.requests[0].resolve(f.response('verified'));await a;
  check('single initial request + repeated clicks retain server-only identity',()=>{assert.equal(f.window.admIdentity().uid,'verified');assert.equal(f.window.admIdentityState,'ready');assert.equal(f.body.children.length,0);assert.equal(f.requests[0].url,'/api/admin/me');assert.equal(f.requests[0].options.credentials,'include');assert.equal(f.requests[0].options.cache,'no-store');assert.equal(f.timers.size,0);assert.equal(f.events.filter(e=>e.type==='mangoi:identity').length,1);});
}
for(const kind of ['network','401','500','invalid_json','missing_user']){
  const f=fixture();await tick();const wait=f.window.admRetryIdentity();
  if(kind==='network')f.requests[0].reject(new Error('private failure detail'));
  else if(kind==='invalid_json')f.requests[0].resolve({ok:true,json:async()=>{throw new Error('invalid');}});
  else if(kind==='missing_user')f.requests[0].resolve({ok:true,json:async()=>({ok:true,user:{name:'Fabricated'}})});
  else f.requests[0].resolve(f.response('bad',Number(kind)));
  await wait;
  check(kind+' shows neutral error and manual retry without guessing/saving identity',()=>{assert.equal(f.window.admIdentity(),null);assert.equal(f.window.admIdentityOrPending().name,'계정 확인 실패');assert.equal(f.window.admIdentityState,'error');assert.equal(f.find('adm-identity-status').hidden,false);assert.equal(f.values.size,0);assert.equal(f.find('adm-identity-retry').disabled,false);assert.equal(f.requests.length,1);});
  const retry=f.find('adm-identity-retry').onclick();await tick();assert.equal(f.requests.length,2);assert.equal(f.find('adm-identity-retry').disabled,true);
  f.requests[1].resolve(f.response('recovered'));await retry;
  check(kind+' retry recovers in-place and hides one status banner',()=>{assert.equal(f.window.admIdentity().uid,'recovered');assert.equal(f.find('adm-identity-status').hidden,true);assert.equal(f.body.children.length,1);assert.equal(f.timers.size,0);});
}
{
  const f=fixture();await tick();const old=f.window.admRetryIdentity();const timer=[...f.timers.values()][0];assert.equal(timer.ms,8000);timer.fn();await old;
  check('8-second timeout finishes even when fetch ignores abort',()=>{assert.equal(f.window.admIdentityState,'timeout');assert.equal(f.requests[0].options.signal.aborted,true);assert.equal(f.window.admIdentity(),null);});
  const fresh=f.window.admRetryIdentity();await tick();f.requests[1].resolve(f.response('new'));await fresh;
  f.requests[0].resolve(f.response('late-old'));await tick();
  check('late timed-out response cannot overwrite successful retry',()=>{assert.equal(f.window.admIdentity().uid,'new');assert.equal(f.events.length,1);});
}
for(const viaEvent of [false,true]){
  const f=fixture({stored:{admin_session:JSON.stringify({uid:'before'})}});await tick();const old=f.window.admRetryIdentity();
  f.values.set('admin_session',JSON.stringify({uid:'after'}));if(viaEvent)f.listeners.storage({key:'admin_session'});
  f.requests[0].resolve(f.response('before'));await old;
  check('changed session '+(viaEvent?'storage event':'same-tab stamp')+' rejects stale result and never loops',()=>{assert.equal(f.window.admIdentityState,'changed');assert.equal(f.window.__ADM_ME,null);assert.equal(JSON.parse(f.values.get('admin_session')).uid,'after');assert.equal(f.events.length,0);assert.equal(f.requests.length,1);});
  const fresh=f.window.admRetryIdentity();await tick();f.requests[1].resolve(f.response('after'));await fresh;assert.equal(f.window.admIdentity().uid,'after');
}
{
  const f=fixture({stored:{admin_session:JSON.stringify({uid:'before'})}});await tick();const old=f.window.admRetryIdentity();
  f.values.clear();f.listeners.storage({key:null});const fresh=f.window.admRetryIdentity();await tick();f.requests[1].resolve(f.response('new-login'));await fresh;
  f.requests[0].reject(new Error('late old logout failure'));await old;
  check('logout/clear plus fresh retry ignores older error completion',()=>{assert.equal(f.window.admIdentityState,'ready');assert.equal(f.window.admIdentity().uid,'new-login');assert.equal(f.requests.length,2);assert.equal(f.events.length,1);});
}
assert.match(readFileSync(new URL('../cloudflare-deploy/public/admin.html',import.meta.url),'utf8'),/adm-identity\.js\?v=2/);
console.log(`Admin identity recovery: PASS ${count}; no live calls, no authentication changes`);
