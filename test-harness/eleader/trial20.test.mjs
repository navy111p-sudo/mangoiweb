import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {fixture} from './fixture.mjs';
const require=createRequire(import.meta.url),out=(handoffTmp()+'/ed20-')+process.pid+'.mjs';await require('../../cloudflare-deploy/node_modules/esbuild').build({stdin:{contents:"export * from './src/eleader-trial20';export * from './src/eleader-trial20-provider';export * from './src/eleader-book-pack';export {default as trialWorker} from './src/eleader-trial-worker';",resolveDir:process.cwd()+'/cloudflare-deploy'},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {trialWorker,handleTrial20,runTrial20MockSession,trial20Hash,trial20Wav,trial20CloudflareProvider,ELEADER_BOOK_UNITS:books}=await import(handoffURL(out));
function wav(n=32000){const b=new Uint8Array(n+44),v=new DataView(b.buffer),put=(s,o)=>{for(let i=0;i<s.length;i++)b[o+i]=s.charCodeAt(i);};put('RIFF',0);v.setUint32(4,n+36,true);put('WAVE',8);put('fmt ',12);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);put('data',36);v.setUint32(40,n,true);return b;}
const audio=new Uint8Array([0xff,0xfb,1,2,3,4,0,255]);
async function setup(book=books[0]){const f=await fixture();f.env.ROOM_JWT_SECRET=crypto.randomUUID();f.env.ELEADER_TRIAL20_LOCAL='mock-only';const issued=Date.now();let clock=issued;const code=crypto.randomUUID().replaceAll('-','');
 f.db.exec(readFileSync('cloudflare-deploy/sql/eleader-trial.sql','utf8'));f.db.exec(readFileSync('cloudflare-deploy/sql/eleader-trial20.sql','utf8'));
 f.db.exec("CREATE TABLE students_erp(user_id TEXT,password_hash TEXT);INSERT INTO students_erp VALUES('ED','synthetic-hash');DELETE FROM eleader_members;INSERT INTO eleader_academies VALUES('ed-sandbox','Synthetic',1);INSERT INTO eleader_members VALUES('ed-sandbox','student','ED','student');");f.db.prepare("INSERT INTO eleader_trial_lease VALUES(1,'ED','ed-sandbox',?,?,NULL)").run(issued,issued+3600000);
 f.db.prepare("INSERT INTO eleader_trial20_owner(id,code_hash,expires_at,policy) VALUES(1,?,?,'adult-trial20-v1')").run(await trial20Hash(code),issued+3600000);
 const token=await f.signUidToken('ED',f.env);let cookie='',calls=[],texts=[];const provider={mode:'mock',async stt(b){assert.ok(trial20Wav(b));calls.push('stt');return 'yes';},async chat(){calls.push('chat');const i=calls.filter(x=>x==='chat').length-1;return JSON.stringify({example:book.questions[i].model.replace(/[,\"]/g,'')});},async tts(text){calls.push('tts');texts.push(text);return audio;}};
 const request=(action,step=0,body,key=crypto.randomUUID(),extra={})=>new Request('https://trial.invalid/api/ai/eleader/trial20/'+action,{method:'POST',headers:{Origin:'https://trial.invalid',Authorization:'Bearer '+token,Cookie:cookie,'X-Trial20-Step':String(step),'X-Trial20-Request':key,'X-Trial20-Policy':'adult-trial20-v1','X-Trial20-Confirm':'yes',...(body instanceof Uint8Array?{'Content-Type':'audio/wav'}:body?{'Content-Type':'application/json'}:{}),...extra},body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined});
 const run=r=>runTrial20MockSession(r,f.env,provider,()=>clock);const startBody={code,book:book.id,policy:'adult-trial20-v1',adult:true,processing:true};
 const start=async()=>{const r=await run(request('start',0,startBody));if(r.ok)cookie=r.headers.get('set-cookie').split(';')[0];return r;};
 return {...f,book,code,token,provider,calls,texts,request,run,start,startBody,clock:v=>clock=v,issued};}
test('public gate and real adapter remain disabled before body/DB/provider access',async()=>{const r=new Request('https://trial.invalid/api/ai/eleader/trial20/start',{method:'POST',body:'not json'});assert.equal((await handleTrial20(r)).status,403);assert.equal((await runTrial20MockSession(r,{ELEADER_TRIAL20_LOCAL:'mock-only',DB:new Proxy({},{get(){throw Error('DB');}})},{mode:'cloudflare'})).status,403);});
test('owner code one-use, hashed storage, session cookie flags, five guesses, expiry and token boundary',async()=>{
 const f=await setup();try{const results=await Promise.all(Array.from({length:20},()=>f.start()));assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(f.calls.length,0);assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM eleader_trial20_owner').get()).includes(f.code));assert.match(results.find(r=>r.ok).headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
 assert.equal((await f.run(f.request('question',0,null,crypto.randomUUID(),{Cookie:''}))).status,403);
 assert.equal((await f.run(f.request('question',0,null,crypto.randomUUID(),{Authorization:'Bearer '+await f.signUidToken('other-child',f.env)}))).status,401);
 f.clock(f.issued+3600000);assert.equal((await f.run(f.request('question'))).status,403);
 }finally{f.db.close();}
 const g=await setup();try{for(let i=0;i<5;i++)assert.equal((await g.run(g.request('start',0,{...g.startBody,code:'0'.repeat(32)}))).status,403);assert.equal((await g.start()).status,403);assert.equal(g.calls.length,0);}finally{g.db.close();}
});
test('complete twenty-turn session: 20 STT,20 chat,21 TTS; binary preserved and no content persisted',async()=>{
 const f=await setup();try{assert.equal((await f.start()).status,200);let r=await f.run(f.request('question'));assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),audio);
 for(let step=1;step<=20;step++){r=await f.run(f.request('turn',step,wav()));assert.equal(r.status,200,'step '+step);assert.equal(r.headers.get('X-Trial20-Next'),String(step+1));}
 assert.deepEqual(['stt','chat','tts'].map(k=>f.calls.filter(x=>x===k).length),[20,20,21]);assert.equal(f.db.prepare('SELECT SUM(reserved_nanos) n FROM eleader_trial20_calls').get().n,345414600);assert.match(f.texts[1],/Imagine a pet, or skip/);assert.match(f.texts[3],/Imagine a pet, or skip/);assert.match(f.texts.at(-1),/We are done/);assert.equal((await f.run(f.request('turn',20,wav()))).status,409);
 const cols=f.db.prepare('PRAGMA table_info(eleader_trial20_calls)').all().map(x=>x.name);assert.deepEqual(cols,['step','kind','request_key','reserved_nanos','status']);
 }finally{f.db.close();}
});
test('22 book mappings and full-440 server contexts stay scoped to selected book',async()=>{
 for(const book of books){const f=await setup(book);try{await f.start();const r=await f.run(f.request('question'));assert.equal(r.status,200);assert.equal(f.texts[0],book.questions[0].question);}finally{f.db.close();}}
});
test('100 concurrent initial requests dispatch once; replay and step skipping cannot replenish slots',async()=>{
 const f=await setup();try{await f.start();const all=await Promise.all(Array.from({length:100},()=>f.run(f.request('question'))));assert.equal(all.filter(r=>r.ok).length,1);assert.equal(f.calls.length,1);assert.equal((await f.run(f.request('turn',2,wav()))).status,409);const skipped=await f.run(f.request('turn',1,{skip:true}));assert.equal(skipped.status,200);assert.deepEqual(f.calls,['tts','tts']);}finally{f.db.close();}
});
test('invalid PCM duration/format, missing origin/policy, exhausted budget fail closed',async()=>{
 const f=await setup();try{await f.start();await f.run(f.request('question'));for(const b of [wav(480002),new Uint8Array(44),wav(3)])assert.equal((await f.run(f.request('turn',1,b))).status,400);assert.equal((await f.run(f.request('turn',1,wav(),crypto.randomUUID(),{Origin:'https://other.invalid'}))).status,403);assert.equal((await f.run(f.request('turn',1,wav(),crypto.randomUUID(),{'X-Trial20-Policy':'old'}))).status,403);assert.equal(f.calls.length,1);}finally{f.db.close();}
 const g=await setup();try{await g.start();g.db.exec("INSERT INTO eleader_trial20_calls VALUES(20,'tts','already-spent-key',400000000,'unknown')");assert.equal((await g.run(g.request('question'))).status,502);assert.equal(g.calls.length,0);}finally{g.db.close();}
});
test('failure/unknown consumes and never retries; negative answer cannot become positive',async()=>{
 for(const failure of ['network','negative','unsafe']){const f=await setup();try{await f.start();await f.run(f.request('question'));f.provider.stt=async()=>{f.calls.push('stt');if(failure==='network')throw Error('network');return failure==='negative'?'no':'yes';};f.provider.chat=async()=>{f.calls.push('chat');return JSON.stringify({example:failure==='unsafe'?'Kill a cat.':'I have a cat.'});};assert.equal((await f.run(f.request('turn',1,wav()))).status,502);const n=f.calls.length;assert.equal((await f.run(f.request('turn',1,wav()))).status,409);assert.equal(f.calls.length,n);}finally{f.db.close();}}
});
test('delayed response cannot cross cancellation, expiry, membership, academy or selected-book changes',async()=>{
 for(const boundary of ['cancel','expiry','member','academy','book']){const f=await setup();try{await f.start();await f.run(f.request('question'));let release,entered;const seen=new Promise(r=>entered=r);f.provider.stt=async()=>{f.calls.push('stt');entered();await new Promise(r=>release=r);return 'yes';};const controller=new AbortController(),base=f.request('turn',1,wav()),request=new Request(base,{signal:controller.signal});const pending=f.run(request);await seen;if(boundary==='cancel')controller.abort();if(boundary==='expiry')f.clock(f.issued+3600000);if(boundary==='member')f.db.exec('DELETE FROM eleader_members');if(boundary==='academy')f.db.exec("UPDATE eleader_academies SET enabled=0 WHERE id='ed-sandbox'");if(boundary==='book')f.db.exec("UPDATE eleader_trial20_owner SET book_id='books-v1-b02'");release();assert.equal((await pending).status,502);assert.deepEqual(f.calls,['tts','stt']);}finally{f.db.close();}}
});
test('Cloudflare adapter contracts: fixed models/160 tokens/asteria, one call each, binary never text',async()=>{
 const calls=[];const p=trial20CloudflareProvider({async run(model,input){calls.push({model,input});if(model.includes('whisper'))return {text:'yes'};if(model.includes('llama'))return {response:'{"example":"I like cats."}'};return new ReadableStream({start(c){c.enqueue(audio);c.close();}});}});assert.equal(await p.stt(wav()),'yes');await p.chat([{role:'user',content:'yes'}]);assert.deepEqual(await p.tts('I like cats.'),audio);assert.equal(calls.length,3);assert.equal(calls[1].input.max_tokens,160);assert.equal(calls[2].input.speaker,'asteria');assert.equal(p.mode,'cloudflare');let n=0;const bad=trial20CloudflareProvider({async run(){n++;throw Error('network');}});await assert.rejects(()=>bad.tts('test'));assert.equal(n,1);
});
const world={crypto,setTimeout,clearTimeout,AbortController,Uint8Array};vm.runInNewContext(readFileSync('cloudflare-deploy/public/js/eleader-trial20-client.js','utf8'),world);const client=world.EleaderTrial20Client;
function clientFixture(extra={}){let requests=0,permissions=0,captures=0,active=0;const events=[];const services={stopCapture(){},stopPlayback(){active=0;},avatar(s){events.push(s);},async permission(){permissions++;return true;},async record({maxMillis}){captures++;assert.equal(maxMillis,15000);return wav();},async request({step}){requests++;return new Response(audio,{headers:{'Content-Type':'audio/mpeg','X-Trial20-Next':String(step+1)}});},async play(_a,{onStart}){assert.equal(active,0);active++;onStart();active--;},...extra};return {c:client.create({enabled:true,expiresAt:Date.now()+3600000,services}),services,events,counts:()=>({requests,permissions,captures})};}
test('client disabled by default; full20 explicit mic presses; repeat uses memory; no overlapping audio',async()=>{
 const disabled=client.create({services:new Proxy({},{get(){throw Error('disabled accessed services');}})});assert.equal(await disabled.start(),false);assert.equal(await disabled.answer(),false);
 const f=clientFixture();await f.c.start();assert.deepEqual(f.counts(),{requests:1,permissions:0,captures:0});await f.c.repeat();assert.equal(f.counts().requests,1);
 for(let i=0;i<20;i++)assert.equal(await f.c.answer(),true);assert.equal(f.c.snapshot().phase,'complete');assert.deepEqual(f.counts(),{requests:21,permissions:20,captures:20});assert.equal(await f.c.answer(),false);
});
test('client denied permission, late permission/capture/playback and network errors cannot auto retry or revive mic/avatar',async()=>{
 const denied=clientFixture({permission:async()=>false});await denied.c.start();assert.equal(await denied.c.answer(),false);assert.equal(denied.counts().requests,1);assert.equal(denied.counts().captures,0);
 for(const stage of ['permission','record','request']){let release,entered;const seen=new Promise(r=>entered=r);const f=clientFixture();await f.c.start();f.services[stage]=async()=>{entered();return await new Promise(r=>release=r);};const p=f.c.answer();await seen;f.c.expire();release(stage==='permission'?true:stage==='record'?wav():new Response(audio,{headers:{'Content-Type':'audio/mpeg','X-Trial20-Next':'2'}}));await p;assert.equal(f.c.snapshot().phase,'expired');assert.equal(await f.c.answer(),false);}
 const bad=clientFixture({request:async()=>{throw Error('network');}});assert.equal(await bad.c.start(),false);assert.equal(bad.c.snapshot().phase,'error');assert.equal(await bad.c.start(),false);
 let begin,end;const late=clientFixture({play:(_a,h)=>new Promise(r=>{begin=h.onStart;end=r;})});const p=late.c.start();await new Promise(r=>setTimeout(r,1));late.c.cancel();begin();end();await p;assert.equal(late.events.filter(x=>x==='start').length,0);
});
test('No/none prior answer is preserved; supplied Why remains optional and skippable, not assumed ownership',async()=>{
 for(const answer of ['no','none']){const f=await setup();try{await f.start();await f.run(f.request('question'));f.provider.stt=async()=>answer;f.provider.chat=async()=>JSON.stringify({example:'I do not have a pet.'});const r=await f.run(f.request('turn',1,wav()));assert.equal(r.status,200);assert.match(f.texts.at(-1),/I do not have a pet/);assert.match(f.texts.at(-1),/Imagine a pet, or skip this question/);assert.match(f.texts.at(-1),/Why do you like your pet/);}finally{f.db.close();}}
});
const browserWorld={Uint8Array,Float32Array,DataView,setTimeout,clearTimeout};vm.runInNewContext(readFileSync('cloudflare-deploy/public/js/eleader-trial20-browser.js','utf8'),browserWorld);const browserServices=browserWorld.EleaderTrial20Browser;
test('browser WAV converter bounds 15 seconds at 16kHz, handles48kHz, preserves signed samples',()=>{
 for(const rate of [16000,44100,48000]){const samples=new Float32Array(rate*16);samples.fill(0.5);const bytes=browserServices.makeWav(samples,rate);assert.ok(trial20Wav(bytes));assert.equal(bytes.length,480044);assert.ok(new DataView(bytes.buffer).getInt16(44,true)>0);}
 assert.throws(()=>browserServices.makeWav(new Float32Array(0),16000));assert.throws(()=>browserServices.makeWav(new Float32Array(100),1));
});
test('browser permission is audio-only and late grant stops tracks; playback errors reject without retries',async()=>{
 let grant,stopped=0,options;const fake={navigator:{mediaDevices:{getUserMedia:async o=>{options=o;return await new Promise(r=>grant=r);}}},URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:()=>{}},Blob,Audio:class{play(){queueMicrotask(()=>this.onerror());return Promise.resolve();}pause(){}}};
 const s=browserServices.create({getToken:()=> 'synthetic',browser:fake});const p=s.permission();s.stopCapture();grant({getTracks:()=>[{stop(){stopped++;}}]});assert.equal(await p,false);assert.equal(options.video,false);assert.equal(options.audio.channelCount,1);assert.equal(stopped,1);
 await assert.rejects(()=>s.play(audio,{onStart(){}}));
});
test('new20-path sandbox matrix:22books×10access conditions×2repetitions; no real provider calls',async()=>{
 const gates=['valid','cookie','actor','expired','revoked','academy','role','policy','request','query-book'];let passed=0,mockCalls=0;
 for(let round=0;round<2;round++)for(const book of books)for(const gate of gates){const f=await setup(book);try{await f.start();const headers={};if(gate==='cookie')headers.Cookie='';if(gate==='actor')headers.Authorization='Bearer '+await f.signUidToken('other-child',f.env);if(gate==='expired')f.clock(f.issued+3600000);if(gate==='revoked')f.db.exec('UPDATE eleader_trial_lease SET revoked_at=1');if(gate==='academy')f.db.exec("UPDATE eleader_academies SET enabled=0 WHERE id='ed-sandbox'");if(gate==='role')f.db.exec("UPDATE eleader_members SET kind='admin',role='director'");if(gate==='policy')headers['X-Trial20-Policy']='old';if(gate==='request')headers['X-Trial20-Request']='short';let r=f.request('question',0,null,crypto.randomUUID(),headers);if(gate==='query-book')r=new Request(r.url+'?book=other&academy=other',r);const response=await f.run(r);const allowed=gate==='valid'||gate==='query-book';assert.equal(response.ok,allowed,book.id+'/'+gate);assert.equal(f.calls.length,allowed?1:0);if(allowed)assert.equal(f.texts[0],book.questions[0].question);passed++;mockCalls+=f.calls.length;}finally{f.db.close();}}
 console.log(JSON.stringify({trial20UniqueConditions:220,repetitions:2,executions:passed,passed,mockProviderCalls:mockCalls,realProviderCalls:0}));assert.equal(passed,440);
});
test('client owner window expires automatically and clears replay/recording ability',async()=>{
 const f=clientFixture();const c=client.create({enabled:true,expiresAt:Date.now()+20,services:f.services});await c.start();await new Promise(r=>setTimeout(r,30));assert.equal(c.snapshot().phase,'expired');assert.equal(await c.repeat(),false);assert.equal(await c.answer(),false);f.c.expire();
 const invalid=client.create({enabled:true,expiresAt:Date.now()+7200000,services:f.services});assert.equal(invalid.snapshot().phase,'disabled');
});

test('prepared owner start transport uses same-origin credentials once, never retries or stores code',async()=>{
 let calls=0;const seen=[];const s=browserServices.create({getToken:()=> 'synthetic',browser:{fetch:async(path,options)=>{calls++;seen.push({path,options});return new Response('{}',{status:403});}}});
 const body={code:'a'.repeat(32),book:'books-v1-b01',policy:'adult-trial20-v1',adult:true,processing:true};
 await assert.rejects(s.startSession(body));assert.equal(calls,1);assert.equal(seen[0].path,'/api/ai/eleader/trial20/start');assert.equal(seen[0].options.credentials,'same-origin');assert.equal(seen[0].options.cache,'no-store');
 await assert.rejects(s.startSession({...body,processing:false}));assert.equal(calls,1);
});

test('isolated live HTTP adapter: exact host/config/DB marker, full20 binary responses and61 fake binding calls',async()=>{
 const f=await setup();try{
 const host='https://mangoiweb-eleader-ed-trial.navy111p.workers.dev',dbid=crypto.randomUUID();let callCount=0,chat=0,cookie='';
 Object.assign(f.env,{ELEADER_TRIAL_ACTIVATION:'owner-approved-61-040-v1',ELEADER_TRIAL_ACCOUNT:'7ae16a3c4bcc84743c70828a5156ebb3',ELEADER_TRIAL_DATABASE:'mangoi-eleader-ed-trial',ELEADER_TRIAL_DATABASE_ID:dbid,ELEADER_TRIAL_ONLY:'local-synthetic',AI:{run:async(model,input)=>{callCount++;if(model.includes('whisper'))return {text:'yes'};if(model.includes('llama'))return {response:JSON.stringify({example:f.book.questions[chat++].model.replace(/[,\"]/g,'')})};return new ReadableStream({start(c){c.enqueue(audio);c.close();}});}},ASSETS:{fetch:async()=>new Response('fixture')}});
 const request=(action,step=0,body)=>new Request(host+'/api/ai/eleader/trial20/'+action,{method:'POST',headers:{Origin:host,Authorization:'Bearer '+f.token,Cookie:cookie,'X-Trial20-Step':String(step),'X-Trial20-Request':crypto.randomUUID(),'X-Trial20-Policy':'adult-trial20-v1','X-Trial20-Confirm':'yes',...(body instanceof Uint8Array?{'Content-Type':'audio/wav'}:body?{'Content-Type':'application/json'}:{})},body:body instanceof Uint8Array?body:body?JSON.stringify(body):undefined});
 assert.equal((await trialWorker.fetch(request('start',0,f.startBody),f.env)).status,403);assert.equal(callCount,0);
 f.db.prepare('INSERT INTO eleader_trial_site VALUES(1,?,?,?,1)').run(dbid,'mangoiweb-eleader-ed-trial','7ae16a3c4bcc84743c70828a5156ebb3');
 for(const key of ['ELEADER_TRIAL_ACCOUNT','ELEADER_TRIAL_DATABASE','ELEADER_TRIAL_DATABASE_ID','ELEADER_TRIAL_ACTIVATION','ROOM_JWT_SECRET']){const saved=f.env[key];f.env[key]='wrong';assert.equal((await trialWorker.fetch(request('start',0,f.startBody),f.env)).status,403);f.env[key]=saved;}
 assert.equal((await trialWorker.fetch(f.request('start',0,f.startBody),f.env)).status,403);
 const asset=await trialWorker.fetch(new Request(host+'/eleader-pilot.html'),f.env);assert.match(asset.headers.get('Permissions-Policy'),/microphone=\(self\)/);assert.match(asset.headers.get('Permissions-Policy'),/camera=\(\)/);assert.match(asset.headers.get('Content-Security-Policy'),/media-src blob:/);
 const start=await trialWorker.fetch(request('start',0,f.startBody),f.env);assert.equal(start.status,200);assert.equal((await start.json()).mode,'cloudflare');cookie=start.headers.get('set-cookie').split(';')[0];
 for(let step=0;step<=20;step++){const r=await trialWorker.fetch(request(step?'turn':'question',step,step?wav():undefined),f.env);assert.equal(r.status,200,'HTTP step '+step);assert.equal(r.headers.get('X-Trial20-Mode'),'cloudflare');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),audio);}
 assert.equal(callCount,61);assert.equal(f.db.prepare('SELECT SUM(reserved_nanos) n FROM eleader_trial20_calls').get().n,345414600);
 assert.equal((await trialWorker.fetch(request('turn',20,wav()),f.env)).status,409);assert.equal(callCount,61);
 f.db.exec('UPDATE eleader_trial_site SET approved=0');assert.equal((await trialWorker.fetch(request('question'),f.env)).status,403);const closed=await trialWorker.fetch(new Request(host+'/eleader-pilot.html'),f.env);assert.match(closed.headers.get('Permissions-Policy'),/microphone=\(\)/);
 }finally{f.db.close();}
});

test('WebAudio adapter records bounded PCM, manual finish and abort stop tracks; fake device only',async()=>{
 for(const operation of ['finish','limit','abort']){
  let processor,stops=0,closed=0;
  const fake={navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++;}}]})}},AudioContext:class{sampleRate=48000;destination={};async resume(){}async close(){closed++;}createMediaStreamSource(){return {connect(){},disconnect(){}};}createScriptProcessor(){return processor={connect(){},disconnect(){}};}}};
  const s=browserServices.create({getToken:()=> 'synthetic',browser:fake});assert.equal(await s.permission(),true);const abort=new AbortController();const recording=s.record({maxMillis:15000,signal:abort.signal});await new Promise(r=>setImmediate(r));
  if(operation==='abort'){abort.abort();await assert.rejects(recording);}else{processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(operation==='limit'?48000*16:48000).fill(0.25)}});if(operation==='finish')s.finishCapture();const bytes=await recording;assert.ok(trial20Wav(bytes));assert.equal(bytes.length,operation==='limit'?480044:32044);}
  assert.equal(stops,1);assert.equal(closed,1);
 }
});
