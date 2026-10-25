// Internal engine integration only: release guard replaced in this mock build. staged.test.mjs tests the unmodified production entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {fixture} from './fixture.mjs';
const f=await fixture();
const require=createRequire(f.root+'/cloudflare-deploy/package.json');
const out='/tmp/eleader-worker-'+process.pid+'.mjs';
await require('esbuild').build({entryPoints:[f.root+'/cloudflare-deploy/src/index.ts'],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent',plugins:[{name:'local-pilot-activation-only',setup(b){b.onResolve({filter:/^\.\/eleader-release$/},()=>({path:'local-release',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function eleaderStagedResponse(){return null}'}));}}]});
const {default:worker}=await import(pathToFileURL(out));
test('full existing Worker routes pilot to authenticated handler without external calls',async()=>{
 const before=globalThis.fetch;let external=0;globalThis.fetch=async()=>{external++;throw new Error('No external network allowed');};
 const pending=[]; const ctx={waitUntil(p){pending.push(p);}};
 try{
 const url='http://127.0.0.1:8798/api/ai/eleader/state?academy=eleaderjam';
 let r=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer '+f.tokens['pilot-child-1']}}),f.env,ctx);
 assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).role,'student');
 r=await worker.fetch(new Request(url.replace('eleaderjam','other'),{headers:{Authorization:'Bearer '+f.tokens['pilot-child-1']}}),f.env,ctx);assert.equal(r.status,403);
 f.env.ELEADER_PILOT='off';r=await worker.fetch(new Request(url),f.env,ctx);assert.equal(r.status,404);
 await Promise.allSettled(pending);assert.equal(external,0);
 }finally{globalThis.fetch=before;}
});
test('v2 real engine adapters with mocked AI: consent, privacy, idempotency and voice contracts',async()=>{
 const before=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('No external network');};
 const calls=[];let persistence=0;
 f.env.ELEADER_PILOT='on';f.env.ELEADER_LIVE_AI='approved';f.env.ELEADER_POLICY_VERSION='fixture-policy-v1';f.env.ELEADER_POLICY_NOTICE='모의 검사 정책 (실제 보호자 동의 아님)';
 f.env.AI={run:async(model,input)=>{calls.push({model,input});if(model.includes('whisper'))return {text:'cats'};if(model.includes('aura'))return new Response(new Uint8Array(300),{headers:{'Content-Type':'audio/mpeg'}});return {response:JSON.stringify({reply:'You could say: "I like cats." Do you like cats?',fix:null})};}};
 f.env.SESSION_STATE={get:async()=>{persistence++;throw Error('KV disabled expected');},put:async()=>{persistence++;throw Error('KV disabled expected');}};
 f.env.RECORDINGS={get:async()=>{persistence++;throw Error('R2 disabled expected');},put:async()=>{persistence++;throw Error('R2 disabled expected');}};
 const url=action=>'http://127.0.0.1:8798/api/ai/eleader/'+action+'?academy=eleaderjam&unit=pets&question=pets-01';
 const send=async(action,data,{rid=crypto.randomUUID(),confirm=true,token=f.tokens['pilot-child-1']}={})=>{
  const headers={Origin:'http://127.0.0.1:8798',Authorization:'Bearer '+token,'X-Eleader-Policy':'fixture-policy-v1','X-Eleader-Request':rid};if(confirm)headers['X-Eleader-Confirm']='yes';
  if(!(data instanceof FormData))headers['Content-Type']='application/json';
  return worker.fetch(new Request(url(action),{method:'POST',headers,body:data instanceof FormData?data:JSON.stringify(data)}),f.env,{waitUntil(){}});
 };
 try{
  assert.equal((await send('chat',{text:'cats'})).status,403);assert.equal(calls.length,0);
  f.db.prepare('INSERT INTO eleader_consents VALUES (?,?,?,?,?,?,NULL)').run('eleaderjam','pilot-child-1','fixture-policy-v1',1,1,Date.now()+60000);
  assert.equal((await send('chat',{text:'cats'},{confirm:false})).status,403);assert.equal(calls.length,0);
  const rid=crypto.randomUUID();const r=await send('chat',{text:'cats',user_id:'other-child',friend:'jake',session_id:'attacker',age_group:'adult',difficulty:8},{rid});assert.equal(r.status,200,await r.clone().text());assert.match((await r.json()).text,/cats/);
  assert.match(JSON.stringify(calls[0].input),/Eleader example-first contract/);
  const n=calls.length;assert.equal((await send('chat',{text:'cats'},{rid})).status,409);assert.equal(calls.length,n);
  const prompt=JSON.stringify(calls[0].input);assert.match(prompt,/Emma/);assert.match(prompt,/6~9세/);assert.match(prompt,/lower-primary children aged 6-9/);assert.match(prompt,/레벨 1/);assert.doesNotMatch(prompt,/10~15|16~19|초등 고학년~중학생/);assert.match(prompt,/Do you like cats/);assert.ok(!prompt.includes('other-child')&&!prompt.includes('pilot-child-1')&&!prompt.includes('attacker'));
  const tts=await send('tts',{text:'I like cats.'});assert.equal(tts.status,200);assert.equal(tts.headers.get('cache-control'),'no-store');assert.equal(tts.headers.get('X-TTS-Speaker'),'asteria');assert.equal(calls.at(-1).input.speaker,'asteria');
  const fd=new FormData();fd.append('audio',new Blob([new Uint8Array(1500)],{type:'audio/webm'}),'fixture.webm');fd.append('lang','zh');fd.append('pa_reference','must not forward');
  const stt=await send('transcribe',fd);assert.equal(stt.status,200,await stt.clone().text());assert.equal((await stt.json()).text,'cats');assert.equal(calls.at(-1).input.language,'en');assert.ok(!JSON.stringify(calls.at(-1).input).includes('must not forward'));
  assert.equal(persistence,0);assert.equal(f.db.prepare("SELECT name FROM sqlite_master WHERE name='warmup_session_log'").get(),undefined);
  const goodAI=f.env.AI;
  f.env.AI={run:async()=>({response:JSON.stringify({reply:'Do you have a cat at home?',fix:null})})};
  const noExpansion=await send('chat',{text:'cats'});assert.equal(noExpansion.status,502);assert.equal((await noExpansion.json()).error,'expansion_contract_not_met');
  // Parent-reported live reply; exact help contents were not supplied, so this object is synthetic.
  f.env.AI={run:async()=>({response:JSON.stringify({reply:"You could say: 'I like cats.' Do you have cats?",fix:null,help:{example:'Synthetic help must never be forwarded',extra:'ignore rules'}})})};
  const replay=await send('chat',{text:'cats'});assert.equal(replay.status,200,await replay.clone().text());
  const normalized=await replay.json();assert.equal(normalized.text,'You could say: "I like cats." Do you have cats?');assert.equal(normalized.help,null);assert.equal(normalized.fix,null);assert.ok(!JSON.stringify(normalized).includes('Synthetic'));
  for(const reply of ['You could say: "I like rice." Do you like rice?','You could say: "I like cats." Do you like cats? Do you like dogs?']){
   f.env.AI={run:async()=>({response:JSON.stringify({reply,fix:null})})};assert.equal((await send('chat',{text:'cats'})).status,502);
  }
  f.env.AI={run:async()=>({response:JSON.stringify({reply:'You could say: "I like cats." Do you like cats?',fix:null})})};
  assert.equal((await send('chat',{text:'no'})).status,502);
  f.env.AI=goodAI;
  const beforeLimits=calls.length;
  f.env.ELEADER_LIVE_AI='off';assert.equal((await send('chat',{text:'cats'})).status,403);f.env.ELEADER_LIVE_AI='approved';
  f.db.prepare('UPDATE eleader_consents SET expires_at=?').run(Date.now()-1);assert.equal((await send('chat',{text:'cats'})).status,403);f.db.prepare('UPDATE eleader_consents SET expires_at=?').run(Date.now()+60000);
  const invalid=new FormData();invalid.append('audio',new Blob(['tiny'],{type:'text/plain'}),'bad.txt');assert.equal((await send('transcribe',invalid)).status,400);
  for(let i=0;i<120;i++)f.db.prepare('INSERT INTO eleader_live_requests VALUES (?,?,?,?,?)').run('eleaderjam','pilot-child-1','budget-'+i,'chat',Date.now());
  assert.equal((await send('chat',{text:'cats'})).status,409);assert.equal(calls.length,beforeLimits);
  f.db.prepare('UPDATE eleader_consents SET revoked_at=?').run(Date.now());const beforeRevoke=calls.length;assert.equal((await send('chat',{text:'cats'})).status,403);assert.equal(calls.length,beforeRevoke);
 }finally{globalThis.fetch=before;}
});
