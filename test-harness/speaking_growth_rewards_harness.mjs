// Actual SQLite, auth verifier and API handler; providers are fixtures, never live.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const esbuild=createRequire(new URL('../cloudflare-deploy/package.json',import.meta.url))('esbuild');
const temp=mkdtempSync(join(tmpdir(),'speaking-growth-'));
try{
 const entry=join(temp,'entry.ts'),bundle=join(temp,'entry.mjs');
 writeFileSync(entry,['ai-friend-point-credit','speaking-growth','speaking-audio-evidence','api-ai','api-games-voice','api-students','api-reports','auth-token'].map(n=>`export * from ${JSON.stringify(resolve('cloudflare-deploy/src/'+n+'.ts'))};`).join('\n'));
 esbuild.buildSync({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm'});
 const M=await import(pathToFileURL(bundle));
 const sq=new DatabaseSync(':memory:');let failAt=-1,blockAssistant=false,growthReads=0;
 function stmt(sql,args=[]){return{sql,args,bind(...a){return stmt(sql,a);},async first(){if(sql.includes('FROM speaking_growth_events'))growthReads++;return sq.prepare(sql).get(...args)||null;},async all(){if(sql.includes('FROM speaking_growth_events'))growthReads++;return{results:sq.prepare(sql).all(...args)};},async run(){if(blockAssistant&&sql.includes('INSERT INTO ai_friend_chats')&&args[1]==='assistant')throw new Error('injected save failure');const r=sq.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};}
 const db={prepare:stmt,async exec(sql){for(const line of sql.split('\n'))if(line.trim())sq.exec(line);},async batch(stmts){sq.exec('BEGIN IMMEDIATE');try{const out=stmts.map((s,i)=>{if(i===failAt)throw new Error('injected batch failure');const q=sq.prepare(s.sql);if(/^SELECT/i.test(s.sql))return{results:q.all(...s.args)};const r=q.run(...s.args);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};});sq.exec('COMMIT');return out;}catch(e){sq.exec('ROLLBACK');throw e;}}};
 const pointSrc=readFileSync('cloudflare-deploy/src/api-points.ts','utf8');
 for(const name of ['student_points','point_transactions','point_rule_log','point_awards','point_rules'])sq.exec(pointSrc.match(new RegExp('`(CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?;)`'))[1]);
 const uuid=()=>crypto.randomUUID();
 for(const [code,policy] of Object.entries(M.FRIEND_AWARDS)){
  const paid=await Promise.all(Array.from({length:25},()=>M.creditFriendAward(db,'cap-'+code,uuid(),code)));
  assert.equal(paid.filter(n=>n>0).length,policy.cap);assert.equal(paid.reduce((a,b)=>a+b,0),policy.amount*policy.cap);
 }
 const id=uuid();assert.equal(await M.creditFriendAward(db,'replay',id,'ai_friend_chat'),2);assert.equal(await M.creditFriendAward(db,'replay',id.toUpperCase(),'ai_friend_chat'),0);
 failAt=4;await assert.rejects(M.creditFriendAward(db,'rollback',uuid(),'ai_friend_chat'));failAt=-1;
 for(const name of ['student_points','point_transactions','point_rule_log','point_awards'])assert.equal(sq.prepare(`SELECT COUNT(*) n FROM ${name} WHERE user_id='rollback'`).get().n,0);
 sq.prepare("INSERT INTO point_transactions (user_id,type,amount,balance_after,created_at) VALUES ('total-cap','earn',99,99,?)").run(Date.now());
 assert.equal(await M.creditFriendAward(db,'total-cap',uuid(),'ai_friend_chat'),0);
 await assert.rejects(M.creditFriendAward(db,'guest_x',uuid(),'ai_friend_chat'));await assert.rejects(M.creditFriendAward(db,'real','invalid','ai_friend_chat'));
 const p={source:'warmup-verified-turn',sessionId:'s',grade:'partial',correction:{was:'I go yesterday.',now:'I went yesterday.'},skills:{grammar:100}};
 await M.logSpeakingGrowth(db,'growth','warmup',p,'1');await M.logSpeakingGrowth(db,'growth','warmup',p,'1');
 const valid={ok:true,scoreFieldsPresent:true,accuracy:0,fluency:75};
 assert.equal(M.referenceReadingEvidence({...valid,scoreFieldsPresent:false},'I like apples.','en'),null);assert.equal(M.referenceReadingEvidence(valid,'apple','en'),null);assert.equal(M.referenceReadingEvidence({...valid,accuracy:undefined},'I like apples.','en'),null);
 const evidence=M.referenceReadingEvidence(valid,'I like apples.','en');assert.equal(evidence.skills.pronunciation,0);
 await M.logSpeakingGrowth(db,'growth','speech-coach',{...p,sessionId:'reading'},'audio',evidence);
 const report=await M.readSpeakingGrowth(db,'growth',0,Date.now()+1000);
 assert.equal(report.turns,2);assert.equal(report.grades.partial,1);assert.equal(report.reading.samples,1);assert.equal(report.reading.pronunciation,0);assert.equal(report.reading.fluency,75);assert.equal(report.skills.grammar,null);
 assert.equal((await M.readSpeakingGrowth(db,'other',0,Date.now()+1000)).turns,0);assert.equal(await M.readSpeakingGrowth({prepare(){throw new Error('missing table');}},'growth',0,Date.now()+1000),null);
 const kv=new Map();let modelFails=false;
 const env={DB:db,ROOM_JWT_SECRET:'isolated-speaking-growth-auth-fixture',SESSION_STATE:{async get(k){return kv.get(k)||null;},async put(k,v){kv.set(k,v);}},AI:{async run(model){if(modelFails)throw new Error('fixture unavailable');return model.includes('whisper')?{text:'I like apples.'}:{response:JSON.stringify({reply:'What do you enjoy?',fix:null})};}}};
 async function post(uid,requestId,token){const url=new URL('https://local.test/api/ai/chat-friend');const r=await M.handleAiApi(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({uid,msg:'I collect seashells.',level:'S3',correction_mode:'free_talk',practice_session:'test-session',request_id:requestId})}),url,env);return{status:r.status,...await r.json()};}
 const token=await M.signUidToken('route-user',env),request=uuid();
 assert.equal((await post('another',request,token)).status,403);
 const good=await post('route-user',request,token);assert.equal(good.ok,true,JSON.stringify(good));assert.equal(good.gam.awarded,2);
 assert.equal((await post('route-user',request,token)).gam.awarded,0);assert.equal((await M.readSpeakingGrowth(db,'route-user',0,Date.now()+1000)).turns,1);
 assert.equal((await post('route-user','bad-id',token)).gam.awarded,0);
 modelFails=true;const failed=await post('route-user',uuid(),token);assert.equal(failed.gam.awarded,0);modelFails=false;
 blockAssistant=true;const notSaved=await post('route-user',uuid(),token);blockAssistant=false;assert.equal(notSaved.gam.awarded,0);
 assert.equal(sq.prepare("SELECT COUNT(*) n FROM point_rule_log WHERE user_id='route-user' AND rule_code='ai_friend_chat'").get().n,1);
 const raceToken=await M.signUidToken('route-race',env);
 const race=await Promise.all(Array.from({length:20},()=>post('route-race',uuid(),raceToken)));
 assert.equal(race.reduce((n,r)=>n+r.gam.awarded,0),20);assert.equal(sq.prepare("SELECT COUNT(*) n FROM point_rule_log WHERE user_id='route-race' AND rule_code='ai_friend_chat'").get().n,10);
 // Direct provider output is logged; client-supplied score fields never are.
 const originalFetch=globalThis.fetch;let providerMissing=false,providerCalls=0;
 const wav=new Uint8Array(32044),v=new DataView(wav.buffer);v.setUint32(0,0x52494646);v.setUint32(4,wav.length-8,true);v.setUint32(8,0x57415645);v.setUint32(12,0x666d7420);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(36,0x64617461);v.setUint32(40,wav.length-44,true);
 env.AZURE_SPEECH_KEY='isolated-fixture-key-with-no-live-access';env.AZURE_SPEECH_REGION='fixture';
 globalThis.fetch=async()=>{providerCalls++;return new Response(JSON.stringify({RecognitionStatus:'Success',NBest:[{Display:'I like apples.',PronunciationAssessment:providerMissing?{PronScore:80}:{AccuracyScore:0,FluencyScore:75,CompletenessScore:100,PronScore:50},Words:[]}]}),{headers:{'Content-Type':'application/json'}});};
 try{
  async function audio(reference){const fd=new FormData();fd.append('audio',new Blob([wav],{type:'audio/wav'}),'local.wav');fd.append('lang','en');fd.append('reference',reference);fd.append('azure',JSON.stringify({accuracy:100,fluency:100}));const u=new URL('https://local.test/api/voice/transcribe');return M.handleVoiceApi(new Request(u,{method:'POST',headers:{Authorization:'Bearer '+token},body:fd}),u,env);}
  assert.equal((await(await audio('I like apples.')).json()).ok,true);await audio('I like apples.');
  const audioReport=await M.readSpeakingGrowth(db,'route-user',0,Date.now()+1000);assert.equal(audioReport.reading.samples,1);assert.equal(audioReport.reading.pronunciation,0);assert.equal(audioReport.reading.fluency,75);
  providerMissing=true;await audio('I like bananas.');assert.equal((await M.readSpeakingGrowth(db,'route-user',0,Date.now()+1000)).reading.samples,1);
  const before=providerCalls,invalid=new URL('https://local.test/api/ai/chat-friend');
  const b64=Buffer.from(wav).toString('base64');
  const denied=await M.handleAiApi(new Request(invalid,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({uid:'another',msg:'Hello.',pron:{target:'apple',audio_b64:b64},correction_mode:'focused'})}),invalid,env);
  assert.equal(denied.status,403);assert.equal(providerCalls,before,'denied ownership cannot start paid pronunciation work');
 }finally{globalThis.fetch=originalFetch;}
 // Existing report authentication remains ahead of all new growth reads.
 sq.exec('CREATE TABLE students_erp (user_id TEXT PRIMARY KEY,student_name TEXT,parent_name TEXT,parent_phone TEXT,program TEXT,status TEXT,created_at INTEGER,password_hash TEXT)');
 sq.prepare("INSERT INTO students_erp (user_id,student_name,password_hash) VALUES ('another','Other fixture','fixture-password-set')").run();
 const parentUrl=new URL('https://local.test/api/parent/dashboard?child_uid=another'),beforeReads=growthReads;
 const parentDenied=await M.handleStudentsApi(new Request(parentUrl,{headers:{Authorization:'Bearer '+token}}),parentUrl,env);
 assert.equal(parentDenied.status,401);assert.equal(growthReads,beforeReads);
 const month=new Date().toISOString().slice(0,7),reportUrl=new URL('https://local.test/api/report/monthly/route-user/'+month);
 const reportResponse=await M.handleReportsApi(new Request(reportUrl,{headers:{Authorization:'Bearer '+token}}),reportUrl,env);
 const monthly=await reportResponse.json();assert.equal(reportResponse.status,200,JSON.stringify(monthly));assert.equal(monthly.speaking_growth.reading.samples,1);assert.equal(monthly.speaking_growth.skills.grammar,null);
 console.log('PASS speaking growth provenance, authenticated API awards, replay/daily/total caps, rollback, failed model and failed persistence (real SQLite)');
}finally{rmSync(temp,{recursive:true,force:true});}
