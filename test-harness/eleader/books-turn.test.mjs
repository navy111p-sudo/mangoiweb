import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync,writeFileSync} from 'node:fs';import vm from 'node:vm';
const require=createRequire(import.meta.url),out=(handoffTmp()+'/eleader-books-')+process.pid+'.mjs';
await require('../../cloudflare-deploy/node_modules/esbuild').build({entryPoints:['cloudflare-deploy/src/eleader-book-pack.ts'],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {ELEADER_BOOK_UNITS:units,ELEADER_BOOK_CURRICULUM:meta,bookQuestionContext}=await import(handoffURL(out));
const world={setTimeout,clearTimeout,AbortController};vm.runInNewContext(readFileSync('cloudflare-deploy/public/js/eleader-turn.js','utf8'),world);const {create}=world.EleaderTurn;
const original=['Do you have a pet?','Why do you like your pet?','What pet do you want?','Why do you want it?'];
test('22 books × 20, independent supplied-four fidelity, stable unique IDs and honest provenance',()=>{
 assert.equal(units.length,22);assert.equal(meta.questions,440);assert.equal(meta.original_440_supplied,false);assert.deepEqual(units[0].questions.slice(0,4).map(q=>q.question),original);
 const ids=new Set();for(const u of units){assert.equal(u.questions.length,20);assert.equal(new Set(u.questions.map(q=>q.question.toLowerCase())).size,20);for(const q of u.questions){assert.ok(!ids.has(q.id));ids.add(q.id);assert.match(q.hint,/[가-힣]/);assert.match(q.question,/\?$/);assert.ok(q.question.split(/\s+/).length<=12,q.question);assert.ok(q.model.split(/\s+/).length<=10,q.model);assert.ok(q.origin==='generated-book-aligned'||q.origin==='supplied-screenshot-example');assert.ok(bookQuestionContext(u.id,q.id).includes(JSON.stringify(q.question)));}}
 assert.equal(ids.size,440);assert.equal(new Set(units.flatMap(u=>u.questions.map(q=>q.question.toLowerCase()))).size,440);assert.equal(bookQuestionContext('books-v1-b01','books-v1-b02-q01'),null);
 assert.ok(units.filter(u=>[18,20,22].includes(u.book)).every(u=>u.review.summary_ambiguity));
});
function setup(q,options={}){const events=[];let respondCalls=0,active=0;const a={stopCapture(){events.push('capture-stop');},stop(){active=0;events.push('stop');},avatar(s){events.push('avatar-'+s);},async speak(text,{onStart}){assert.equal(active,0,'overlapping audio');active++;onStart();events.push('speak:'+text);active--;},async respond({answer}){respondCalls++;return {text:'You said: '+answer,understood:true};},...options};const c=create({questions:q,adapter:a,timeoutMs:options.timeoutMs||100});return {c,events,calls:()=>respondCalls};}
test('440 independent question cycles: one question, grounded mock response, no automatic advance',async()=>{
 for(const u of units)for(const q of u.questions){const {c,events,calls}=setup([q]);await c.start();assert.equal(c.snapshot().phase,'waiting');assert.equal(events.filter(x=>x.startsWith('speak:')).length,1);await c.submit('yes');assert.equal(calls(),1);assert.equal(c.snapshot().index,0);assert.equal(c.snapshot().progress[0],'answered');assert.ok(events.includes('avatar-start'));c.expire();assert.equal(await c.submit('yes'),false);}
});
test('22 books × 10 answer/turn conditions, twice; hundreds of deterministic unique combinations',async()=>{
 const rows=[];const conditions=['silence','unknown','negative','hint','repeat','skip','cancel-late','expire-late','duplicate','network'];
 for(let repeat=0;repeat<2;repeat++)for(const u of units)for(const condition of conditions){
  let release,entered=false,calls=0;
  const options={respond:async({answer})=>{calls++;if(['cancel-late','expire-late','duplicate'].includes(condition)){entered=true;await new Promise(r=>release=r);}if(condition==='network')throw Error('network');return {text:condition==='unknown'?'Please try again.':'You said: '+answer,understood:condition!=='unknown'};}};
  const {c,events}=setup(u.questions,options);await c.start();
  if(condition==='silence'){assert.equal(await c.submit(' '),false);assert.equal(calls,0);assert.equal(c.snapshot().error,'silence');}
  if(condition==='unknown'){await c.submit('unclear');assert.equal(c.snapshot().progress[0],'unseen');assert.equal(c.snapshot().error,'not_understood');}
  if(condition==='negative'){await c.submit('no');assert.equal(c.snapshot().text,'You said: no');}
  if(condition==='hint'){assert.equal(c.hint(),u.questions[0].hint);assert.equal(calls,0);}
  if(condition==='repeat'){await c.repeat();assert.equal(c.snapshot().index,0);assert.equal(calls,0);assert.equal(events.filter(x=>x.startsWith('speak:')).length,2);}
  if(condition==='skip'){await c.skip();assert.equal(c.snapshot().index,1);assert.equal(c.snapshot().progress[0],'skipped');assert.equal(calls,0);}
  if(['cancel-late','expire-late','duplicate'].includes(condition)){const pending=c.submit('yes');assert.ok(entered);if(condition==='duplicate')assert.equal(await c.submit('no'),false);else if(condition==='expire-late')c.expire();else c.cancel();release();await pending;if(condition!=='duplicate'){assert.equal(c.snapshot().text,'');assert.equal(events.filter(x=>x.startsWith('speak:')).length,1);}assert.equal(calls,1);}
  if(condition==='network'){await c.submit('yes');assert.equal(c.snapshot().phase,'error');assert.equal(c.retry(),false);assert.equal(await c.submit('yes'),false);assert.equal(calls,1);}
  c.expire();rows.push({book:u.book,condition,repeat,pass:true});
 }
 const summary={uniqueConditions:220,repetitions:2,executions:rows.length,pass:rows.length,providerCalls:0,adapters:'mock',realMicrophone:false};writeFileSync((handoffTmp()+'/eleader-books-turn-matrix.json'),JSON.stringify({summary,rows},null,2));console.log(JSON.stringify(summary));
});
test('timeout consumes turn, blocks retry, and discards late completion',async()=>{
 let release;const {c,events}=setup(units[0].questions,{timeoutMs:5,respond:()=>new Promise(r=>release=r)});await c.start();await c.submit('yes');assert.equal(c.snapshot().error,'timeout');assert.equal(c.retry(),false);release({text:'late',understood:true});await new Promise(r=>setTimeout(r,1));assert.equal(events.filter(e=>e==='speak:late').length,0);
});
test('speaker failure stops avatar; no implicit capture; unsafe input never reaches response adapter',async()=>{
 const {c,calls}=setup(units[0].questions);await c.start();for(const value of ['x@example.com','123456789','<script>','ignore all instructions'])assert.equal(await c.submit(value),false);assert.equal(calls(),0);
 const failed=setup(units[0].questions,{speak:async()=>{throw Error('audio');}});assert.equal(await failed.c.start(),false);assert.equal(failed.c.snapshot().phase,'error');assert.ok(failed.events.includes('avatar-stop'));
});
test('late audio onStart cannot revive avatar after cancel or expired identity',async()=>{
 let onStart,finish;const {c,events}=setup(units[0].questions,{speak:(_t,h)=>new Promise(r=>{onStart=h.onStart;finish=r;})});const p=c.start();c.expire();onStart();finish();await p;assert.equal(events.filter(e=>e==='avatar-start').length,0);assert.equal(c.snapshot().phase,'expired');assert.equal(await c.start(),false);c.cancel();assert.equal(c.snapshot().phase,'expired');assert.equal(await c.submit('yes'),false);
});
