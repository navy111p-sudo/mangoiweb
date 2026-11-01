import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
import {fixture} from './fixture.mjs';
const require=createRequire(new URL('../../cloudflare-deploy/package.json',import.meta.url));
const out=join(tmpdir(),'eleader-trial-'+process.pid+'.mjs');
await require('esbuild').build({stdin:{contents:"export {handleEleaderTrial} from './src/eleader-trial'; export {handleStudentsApi} from './src/api-students'; export {default as trialWorker} from './src/eleader-trial-worker';",resolveDir:handoffFile(new URL('../../cloudflare-deploy',import.meta.url))},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {handleEleaderTrial,handleStudentsApi,trialWorker}=await import(pathToFileURL(out));
const f=await fixture();f.env.ROOM_JWT_SECRET=crypto.randomUUID();f.env.ELEADER_TRIAL_ONLY='local-synthetic';
const issued=Date.now();let clock=issued,loginCalls=0;
const password=crypto.randomUUID()+crypto.randomUUID();
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password+'|mangoi-salt-2026'))).toString('hex');
f.db.exec("CREATE TABLE students_erp(user_id TEXT PRIMARY KEY,student_name TEXT,parent_name TEXT,parent_phone TEXT,parent_user_id TEXT,password_hash TEXT,last_login_at INTEGER); DELETE FROM eleader_members; INSERT INTO eleader_academies VALUES('ed-sandbox','합성 ED 테스트 학원',1); INSERT INTO eleader_members VALUES('ed-sandbox','student','ED','student'); INSERT INTO eleader_assignments VALUES('ed-sandbox','ED','pets');");
f.db.prepare('INSERT INTO students_erp(user_id,password_hash) VALUES (?,?)').run('ED',hash);
f.db.exec(readFileSync(new URL('../../cloudflare-deploy/sql/eleader-trial.sql',import.meta.url),'utf8'));
f.db.prepare('INSERT INTO eleader_trial_lease VALUES(1,?,?,?, ?,NULL)').run('ED','ed-sandbox',issued,issued+3600000);
const login=async(...args)=>{loginCalls++;return handleStudentsApi(...args);};
const req=(path,method='GET',body,token)=>new Request('http://127.0.0.1'+path,{method,headers:{Origin:'http://127.0.0.1',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
const run=r=>handleEleaderTrial(r,f.env,login,()=>clock);
let token;
test.beforeEach(()=>f.db.exec('DELETE FROM eleader_trial_login_limit'));

test('existing login verifies generated password and only synthetic ED membership',async()=>{
 const r=await run(req('/api/student/login','POST',{user_id:'ED',password}));assert.equal(r.status,200);const d=await r.json();token=d.token;assert.equal(d.user.user_id,'ED');assert.equal(d.user.role,'student');
 const state=await run(req('/api/ai/eleader/entry','GET',null,token));assert.deepEqual((await state.json()).entries.map(e=>e.academy),['ed-sandbox']);
 const detail=await run(req('/api/ai/eleader/state?academy=ed-sandbox','GET',null,token));assert.deepEqual((await detail.json()).trial,{read_only:true,expires_at:issued+3600000});
 assert.equal((await run(req('/api/student/login','POST',{user_id:'ED',password:crypto.randomUUID()}))).status,401);
});
for(const path of ['/api/ai/eleader/complete','/api/ai/eleader/chat','/api/ai/eleader/tts','/api/ai/eleader/transcribe','/api/ai/eleader/settings','/api/ai/eleader/assign','/api/warmup/chat','/api/voice/tts','/api/student/register','/api/student/set-password','/api/admin/login','/api/student/profile'])test('route denied: '+path,async()=>{assert.equal((await run(req(path,'POST',{},token))).status,403);});
test('tenant, other identity, cookie-only, weak input, handoff and CSRF rejected',async()=>{
 assert.equal((await run(req('/api/ai/eleader/state?academy=eleaderjam','GET',null,token))).status,403);
 assert.equal((await run(req('/api/ai/eleader/entry','GET',null,await f.signUidToken('other-child',f.env)))).status,401);
 assert.equal((await run(req('/api/ai/eleader/entry'))).status,401);
 for(const body of [{user_id:'other-child',password},{user_id:'ED',password:'x'},{user_id:'ED',password,handoff:'not-allowed'}])assert.equal((await run(req('/api/student/login','POST',body))).status,401);
 const r=req('/api/student/login','POST',{user_id:'ED',password});r.headers.set('Origin','https://other.invalid');assert.equal((await run(r)).status,403);
});
test('absolute expiry denies still-valid token AND repeated new logins, with no extension',async()=>{
 assert.equal(await f.signUidToken('ED',f.env).then(Boolean),true);
 clock=issued+3600000;const before=loginCalls;
 for(let i=0;i<3;i++){assert.equal((await run(req('/api/ai/eleader/entry','GET',null,token))).status,403);assert.equal((await run(req('/api/student/login','POST',{user_id:'ED',password}))).status,403);}
 assert.equal(loginCalls,before);assert.equal(f.db.prepare('SELECT expires_at FROM eleader_trial_lease').get().expires_at,issued+3600000);clock=issued;
});
test('revocation and expired in-flight login do not return a valid token',async()=>{
 f.db.prepare('UPDATE eleader_trial_lease SET revoked_at=?').run(issued);assert.equal((await run(req('/api/ai/eleader/entry','GET',null,token))).status,403);f.db.exec('UPDATE eleader_trial_lease SET revoked_at=NULL');
 const r=await handleEleaderTrial(req('/api/student/login','POST',{user_id:'ED',password}),f.env,async(...a)=>{const result=await login(...a);clock=issued+3600000;return result;},()=>clock);assert.equal(r.status,403);assert.equal((await r.json()).token,undefined);clock=issued;
});
test('login endpoint rate limit counts concurrent ED/ed attempts before password work',async()=>{
 let invoked=0;
 const results=await Promise.all(Array.from({length:50},(_,i)=>handleEleaderTrial(req('/api/student/login','POST',{user_id:i%2?'ed':'ED',password}),f.env,async()=>{invoked++;return Response.json({ok:true});},()=>clock)));
 assert.equal(invoked,5);assert.equal(results.filter(r=>r.status===429).length,45);
 assert.equal((await run(req('/api/student/login','POST',{user_id:'ed',password}))).status,429);
});
test('approved short ED password still requires actual stored hash; voice remains blocked',async()=>{
 const temporary=String(crypto.getRandomValues(new Uint32Array(1))[0]%900000+100000);
 const h=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(temporary+'|mangoi-salt-2026'))).toString('hex');
 f.db.prepare('UPDATE students_erp SET password_hash=?').run(h);
 try{assert.equal((await run(req('/api/student/login','POST',{user_id:'ed',password:temporary}))).status,200);assert.equal((await run(req('/api/ai/eleader/chat','POST',{},token))).status,403);}finally{f.db.prepare('UPDATE students_erp SET password_hash=?').run(hash);}
});
test('wrong DB shape, missing password, future lease and missing table fail closed',async()=>{
 f.db.exec("INSERT INTO students_erp(user_id) VALUES('synthetic-extra')");assert.equal((await run(req('/api/ai/eleader/entry','GET',null,token))).status,403);f.db.exec("DELETE FROM students_erp WHERE user_id='synthetic-extra'");
 f.db.exec("UPDATE students_erp SET password_hash=NULL");assert.equal((await run(req('/api/student/login','POST',{user_id:'ED',password}))).status,403);f.db.prepare('UPDATE students_erp SET password_hash=?').run(hash);
 clock=issued-1;assert.equal((await run(req('/api/ai/eleader/entry','GET',null,token))).status,403);clock=issued;
 f.db.exec('DROP TABLE eleader_trial_lease');assert.equal((await run(req('/api/ai/eleader/entry','GET',null,token))).status,503);
});
test('unconfigured production does not access DB or modify existing auth',async()=>{
 assert.equal(await handleEleaderTrial(req('/api/student/login','POST',{}),{DB:new Proxy({},{get(){throw Error('DB touched');}})},()=>{throw Error('login touched');}),null);
 assert.ok(!readFileSync(new URL('../../cloudflare-deploy/src/index.ts',import.meta.url),'utf8').includes('handleEleaderTrial'));
});
test('review-only isolated Worker applies capture/network headers and denies unconfigured APIs',async()=>{
 const r=await trialWorker.fetch(req('/warmup.html'),{ASSETS:{fetch:async()=>new Response('synthetic asset')}});assert.match(r.headers.get('Permissions-Policy'),/microphone=\(\)/);assert.match(r.headers.get('Content-Security-Policy'),/connect-src 'self'/);
 assert.equal((await trialWorker.fetch(req('/api/student/login','POST',{}),{})).status,403);
});
test.after(()=>f.db.close());
