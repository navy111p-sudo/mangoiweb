import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {fixture} from './fixture.mjs';
const require=createRequire(import.meta.url),out=(handoffTmp()+'/eleader-combined-')+process.pid+'.mjs';
await require('../../cloudflare-deploy/node_modules/esbuild').build({stdin:{contents:"export * from './src/eleader-combined-pack';export * from './src/eleader-source-pack';export * from './src/eleader-trial-limits';export {handleEleaderTrial} from './src/eleader-trial';",resolveDir:process.cwd()+'/cloudflare-deploy'},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {ELEADER_SOURCE_UNITS:source,ELEADER_COMBINED_UNITS:combined,ELEADER_CURRICULUM:meta,combinedQuestionContext,reserveTrialLogin,reserveTrialVoice,finishTrialVoice,TRIAL_VOICE_CAP,handleEleaderTrial}=await import(handoffURL(out));
const f=await fixture();f.db.exec(readFileSync('cloudflare-deploy/sql/eleader-trial.sql','utf8'));
const start=1700000000000;
const ctx={enabled:true,ownerVerified:true,lease:start};
const bounds={stt:{pcmBytes:320000,sampleRate:16000,channels:1,bits:16},chat:{inputBytes:24000,maxTokens:440},tts:{text:'I like cats.'}};
const key=(s)=>'local-synthetic-'+s;
test.beforeEach(()=>{f.db.exec('DELETE FROM eleader_trial_login_limit;DELETE FROM eleader_trial_voice_budget;DELETE FROM eleader_trial_lease');f.db.prepare("INSERT INTO eleader_trial_lease VALUES(1,'ED','ed-sandbox',?,?,NULL)").run(start,start+3600000);});
test('66 supplied questions match PDF extraction, retaining abbreviated source wording',()=>{
 const raw=JSON.parse(readFileSync('test-harness/eleader/fixtures/proposal-66-extracted.json','utf8'));
 assert.equal(source.length,22);const ids=new Set();
 for(let i=0;i<22;i++){assert.equal(source[i].questions.length,3);for(let j=0;j<3;j++){
  const q=source[i].questions[j];const cleaned=raw[i][j].replace(/\(Yes\/No, Cat\)/g,'').replace(/[가-힣]+/g,'').replace(/,/g,'').replace(/\s+/g,' ').trim();
  assert.equal(q.question,cleaned);assert.match(q.hint,/[가-힣]/);assert.ok(!ids.has(q.id));ids.add(q.id);
 }}assert.equal(ids.size,66);
});
test('126 raw => 124 presented; every original/supplement ID preserved as canonical or alias',()=>{
 const old=JSON.parse(readFileSync('cloudflare-deploy/src/eleader-pack.ts','utf8').split('= ',2)[1].split(' as const;')[0]);
 const qs=combined.flatMap(u=>u.questions),ids=qs.flatMap(q=>[q.id,...q.aliases]);assert.equal(qs.length,124);assert.equal(new Set(ids).size,126);assert.equal(ids.length,126);
 for(const q of [...old.flatMap(u=>u.questions),...source.flatMap(u=>u.questions)])assert.ok(ids.includes(q.id));
 assert.deepEqual(combined.slice(0,3).map(u=>u.questions.length),[22,22,23]);assert.ok(combined.slice(3).every(u=>u.questions.length===3));
 assert.equal(meta.complete_440,false);assert.equal(new Set(qs.map(q=>q.question.toLowerCase())).size,124);
 assert.ok(combined.slice(0,3).every(u=>u.questions.slice(0,8).some(q=>q.provenance.includes('supplement'))));
});
test('question context remains topic scoped, privacy guarded, and negative-answer cautious',()=>{
 for(const u of combined)for(const q of u.questions){const p=combinedQuestionContext(u.id,q.id);assert.ok(p.includes(JSON.stringify(q.question)));assert.match(p,/untrusted data/);assert.match(p,/negative meaning/);assert.match(p,/real names/);}
 assert.equal(combinedQuestionContext('pets','injected'),null);assert.equal(combinedQuestionContext(combined[0].id,'day-01'),null);
});
test('login limiter atomically admits five of 100 parallel attempts; persists across callers',async()=>{
 const r=await Promise.all(Array.from({length:100},()=>reserveTrialLogin(f.env.DB,start)));assert.equal(r.filter(Boolean).length,5);
 assert.equal(await reserveTrialLogin(f.env.DB,start+899999),false);assert.equal(await reserveTrialLogin(f.env.DB,start-1),false);
 assert.equal(await reserveTrialLogin(f.env.DB,start+900000),true);assert.equal(f.db.prepare('SELECT attempts FROM eleader_trial_login_limit').get().attempts,1);
});
test('voice disabled and unverified owner return without DB access',async()=>{
 const forbidden={prepare(){throw Error('DB accessed');}};
 for(const c of [{lease:start},{...ctx,enabled:false},{...ctx,ownerVerified:false}])assert.equal(await reserveTrialVoice(forbidden,c,'stt',key('no'),bounds.stt,start),false);
});
test('300 concurrent reservations admit exactly one of each kind and stay under $0.02',async()=>{
 const kinds=['stt','chat','tts'];const r=await Promise.all(Array.from({length:300},(_,i)=>reserveTrialVoice(f.env.DB,ctx,kinds[i%3],key(String(i)),bounds[kinds[i%3]],start)));
 assert.equal(r.filter(Boolean).length,3);const row=f.db.prepare('SELECT COUNT(*) n,SUM(reserved_nanos) total FROM eleader_trial_voice_budget').get();assert.equal(row.n,3);assert.equal(row.total,14108820);assert.ok(row.total<=TRIAL_VOICE_CAP);
});
test('idempotent replay, cross-kind key reuse, failure and unknown consume reservation without refund',async()=>{
 assert.equal(await reserveTrialVoice(f.env.DB,ctx,'chat',key('same'),bounds.chat,start),true);
 assert.equal(await reserveTrialVoice(f.env.DB,ctx,'chat',key('same'),bounds.chat,start),false);
 assert.equal(await reserveTrialVoice(f.env.DB,ctx,'tts',key('same'),bounds.tts,start),false);
 await finishTrialVoice(f.env.DB,key('same'),'unknown');await finishTrialVoice(f.env.DB,key('same'),'succeeded');
 assert.equal(f.db.prepare('SELECT status FROM eleader_trial_voice_budget').get().status,'unknown');
 assert.equal(await reserveTrialVoice(f.env.DB,ctx,'chat',key('retry'),bounds.chat,start),false);
 assert.equal(await reserveTrialVoice(f.env.DB,ctx,'tts',key('tts'),bounds.tts,start),true);await finishTrialVoice(f.env.DB,key('tts'),'failed');assert.equal(await reserveTrialVoice(f.env.DB,ctx,'tts',key('tts-retry'),bounds.tts,start),false);
});
test('invalid sizes, wrong lease, expiry, revocation and exhausted money fail closed',async()=>{
 for(const [kind,b] of [['stt',{...bounds.stt,pcmBytes:320002}],['stt',{...bounds.stt,channels:2}],['stt',{...bounds.stt,pcmBytes:NaN}],['chat',{...bounds.chat,inputBytes:24001}],['chat',{...bounds.chat,maxTokens:441}],['tts',{text:'a'.repeat(201)}],['tts',{text:'안녕'}]])assert.equal(await reserveTrialVoice(f.env.DB,ctx,kind,key('bad'),b,start),false);
 for(const now of [start-1,start+3600000])assert.equal(await reserveTrialVoice(f.env.DB,ctx,'stt',key('late'),bounds.stt,now),false);
 assert.equal(await reserveTrialVoice(f.env.DB,{...ctx,lease:start+1},'stt',key('lease'),bounds.stt,start),false);
 f.db.exec('UPDATE eleader_trial_lease SET revoked_at=1');assert.equal(await reserveTrialVoice(f.env.DB,ctx,'stt',key('revoked'),bounds.stt,start),false);f.db.exec('UPDATE eleader_trial_lease SET revoked_at=NULL');
 f.db.prepare("INSERT INTO eleader_trial_voice_budget VALUES(?,'stt',?,20000000,'unknown')").run(start,key('spent'));assert.equal(await reserveTrialVoice(f.env.DB,ctx,'tts',key('over'),bounds.tts,start),false);
});
test('missing budget schema throws; caller cannot obtain a dispatch permit',async()=>{
 const broken={prepare(){throw Error('missing schema');}};await assert.rejects(()=>reserveTrialVoice(broken,ctx,'stt',key('missing'),bounds.stt,start));
});
test('isolated ED API provides combined curriculum only after tenant/identity checks; all voice routes blocked',async()=>{
 f.env.ELEADER_TRIAL_ONLY='local-synthetic';f.db.exec("CREATE TABLE students_erp(user_id TEXT,password_hash TEXT);INSERT INTO students_erp VALUES('ED','test-placeholder');DELETE FROM eleader_members;INSERT INTO eleader_academies VALUES('ed-sandbox','Synthetic',1);INSERT INTO eleader_members VALUES('ed-sandbox','student','ED','student');");
 const token=await f.signUidToken('ED',f.env),url='http://localhost/api/ai/eleader/state?academy=ed-sandbox';
 const r=await handleEleaderTrial(new Request(url,{headers:{Authorization:'Bearer '+token}}),f.env,()=>{throw Error('unexpected login');},()=>start);const data=await r.json();assert.equal(r.status,200);assert.equal(data.units.flatMap(u=>u.questions).length,440);assert.equal(data.assignments.length,22);assert.deepEqual(data.progress,[]);assert.equal(data.external_processing_enabled,false);
 const bad=await handleEleaderTrial(new Request(url.replace('ed-sandbox','other'),{headers:{Authorization:'Bearer '+token}}),f.env,()=>null,()=>start);assert.equal(bad.status,403);
 for(const path of ['chat','transcribe','tts']){const r=await handleEleaderTrial(new Request('http://localhost/api/ai/eleader/'+path,{method:'POST'}),f.env,()=>null,()=>start);assert.equal(r.status,403);}
});
test.after(()=>f.db.close());
