import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),D=require('../cloudflare-deploy/public/js/scene-textbook-catalog.js');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(v,m)=>{assert.ok(v,m);checks++;};
eq(D.classify('BTS 1 001 (Welcome to school)'),{series:'bts',book:'BTS 1'});
eq(D.classify('BTS 10 002 (Weather)'),{series:'bts',book:'BTS 10'});
eq(D.classify('SIU BASIC 2 (Hobbies)'),{series:'siu',book:'SIU BASIC 2'});
eq(D.classify('SIU ADVANCE 10 (Explain)'),{series:'siu',book:'SIU ADVANCE 10'});
eq(D.classify('BTS'),null,'manual umbrella entry is not a lesson');
const name='BTS 1 001 (Welcome to school)';
const catalog={ok:true,groups:[{book:name,files:24,level:'Lv 1'},{book:'BTS 1 010 (Review)',files:17,level:'Lv 1'},{book:'BTS 10 001 (Weather)',files:32,level:'Lv 3'},{book:'SIU BASIC 2 (Hobbies)',files:12,level:'Lv 4'},{book:'other',files:20,level:'Lv 1'}]};
eq(D.groups(catalog).length,4);eq(D.groups(catalog)[0].name,name);eq(D.groups(catalog)[2].book,'BTS 10','numeric sort');
eq(D.pages({ok:true,items:[{id:1,name:'['+name+'] page 10',unit_no:10},{id:2,name:'['+name+'] page 2',unit_no:2},{id:3,name:'[Other] page 1'},{id:-1,name:'['+name+'] invalid'}]},name).map(p=>p.id),[2,1],'wrong book and invalid IDs are rejected');
class El{
 constructor(){this.value='';this.hidden=false;this.disabled=false;this.children=[];this.textContent='';this.handlers={};}
 replaceChildren(){this.children=[];}append(x){this.children.push(x);}addEventListener(k,f){this.handlers[k]=f;}
}
const source=fs.readFileSync(new URL('../cloudflare-deploy/public/js/scene-textbook-catalog.js',import.meta.url),'utf8');
function app(){
 const ids=['ct-load','ct-status','ct-series','ct-level','ct-book','ct-lesson','ct-selectors','ct-open','ct-pages','cq-close','back','ui-lang'];
 const els=Object.fromEntries(ids.map(x=>[x,new El()]));els['ct-series'].value='bts';const requests=[],timers=new Map();let tid=0;
 const document={documentElement:{lang:'ko'},getElementById:id=>els[id],createElement:()=>new El()};
 vm.runInNewContext(source,{window:{addEventListener(){}},document,AbortController,Set,fetch:(url,options)=>new Promise((resolve,reject)=>{requests.push({url,resolve});options.signal.addEventListener('abort',()=>reject(Error('aborted')));}),setTimeout:fn=>{timers.set(++tid,fn);return tid;},clearTimeout:id=>timers.delete(id)});
 return {els,requests,timers,click:id=>els['ct-'+id].handlers.click(),change:(id,value)=>{els['ct-'+id].value=value;els['ct-'+id].handlers.change();},reply:data=>requests.at(-1).resolve({ok:true,json:async()=>data})};
}
const flush=()=>new Promise(setImmediate),a=app();eq(a.requests.length,0,'no eager catalog request');
a.click('load');eq(a.requests[0].url,'/api/textbook-files?group=1');a.reply(catalog);await flush();
eq(a.els['ct-book'].children.length,3,'BTS volumes grouped without guessing lesson numbers');
a.change('level','Lv 1');eq(a.els['ct-book'].children.length,2,'registered level filters books');
a.change('book','BTS 1');eq(a.els['ct-lesson'].children[1].value,name,'exact source name retained');
a.change('lesson',name);ok(!a.els['ct-open'].disabled);a.click('open');ok(a.requests.at(-1).url.includes(encodeURIComponent(name)),'exact book query encoded');
a.reply({ok:true,items:[{id:8,name:'['+name+'] 001.jpg',unit_no:1}]});await flush();eq(a.els['ct-pages'].children[0].href,'/api/textbook-files/8/raw');eq(a.requests.length,2,'page bytes wait for explicit link click');
a.click('open');const stale=a.requests.at(-1);a.change('series','siu');stale.resolve({ok:true,json:async()=>({ok:true,items:[{id:8,name:'['+name+'] 001.jpg'}]})});await flush();eq(a.els['ct-pages'].children.length,0,'late old-book response cannot redraw');
eq(a.els['ct-book'].children[1].value,'SIU BASIC 2');
const timeout=app();timeout.click('load');for(const fn of [...timeout.timers.values()])fn();await flush();ok(!timeout.els['ct-load'].disabled,'timeout permits retry');ok(timeout.els['ct-status'].textContent.includes('다시'));
ok(!source.includes('/api/admin/'),'student UI never uses privileged catalog API');
console.log('PASS textbook catalog: '+checks+' checks (published catalog, exact selection, registered levels, lazy pages, cancellation, retry)');
