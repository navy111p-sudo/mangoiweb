// Real workerd + disposable local D1/KV. Never reads Wrangler config or secrets.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const require=createRequire(new URL('../cloudflare-deploy/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),esbuild=require('esbuild');
const dir=mkdtempSync(join(tmpdir(),'speaking-runtime-'));
let mf,egress=0;
try{
 const imports={handleAiApi:'api-ai',handlePointsApi:'api-points',signUidToken:'auth-token',creditFriendAward:'ai-friend-point-credit',logSpeakingGrowth:'speaking-growth',readSpeakingGrowth:'speaking-growth'};
 const entry=join(dir,'entry.ts'),bundle=join(dir,'worker.mjs');
 writeFileSync(entry,Object.entries(imports).map(([name,file])=>`import {${name}} from ${JSON.stringify(resolve('cloudflare-deploy/src/'+file+'.ts'))};`).join('\n')+`
 let modelCalls=0;
 export default {async fetch(request,env,ctx){
  const url=new URL(request.url),body=()=>request.json();
  if(url.pathname==='/__aiCalls')return Response.json({modelCalls});
  env.AI={async run(){modelCalls++;return{response:JSON.stringify({reply:'What do you enjoy?',fix:null})};}};
  if(url.pathname==='/__token')return Response.json({token:await signUidToken(url.searchParams.get('uid'),env)});
  if(url.pathname==='/__credit'){const b=await body();return Response.json({paid:await creditFriendAward(env.DB,b.uid,b.id,b.code)});}
  if(url.pathname==='/__growth'){const b=await body();await logSpeakingGrowth(env.DB,b.uid,'friend',b.observation,b.id);return Response.json(await readSpeakingGrowth(env.DB,b.uid,0,Date.now()+1000));}
  if(url.pathname==='/__egress'){try{const r=await fetch('https://not-permitted.invalid/');return new Response(r.ok?'allowed':'blocked');}catch{return new Response('blocked');}}
  if(url.pathname.startsWith('/api/ai/'))return await handleAiApi(request,url,env,ctx)||new Response('missing',{status:404});
  return await handlePointsApi(request,url,env,ctx)||new Response('missing',{status:404});
 }};`);
 esbuild.buildSync({entryPoints:[entry],outfile:bundle,bundle:true,format:'esm',platform:'browser',target:'es2022'});
 mf=new Miniflare(convertV4MiniflareOptions({cf:false,telemetry:{enabled:false},resourcePersistencePath:join(dir,'state'),workers:[{name:'speaking-isolated',rootPath:dir,modules:true,scriptPath:bundle,compatibilityDate:'2026-04-07',
  d1Databases:{DB:'speaking-disposable-db'},kvNamespaces:['SESSION_STATE'],
  bindings:{ROOM_JWT_SECRET:'speaking-local-fixture-secret-never-used-remotely'},
  outboundService:async()=>{egress++;throw new Error('External network disabled in speaking sandbox');}}]}));
 await mf.ready;
 const db=await mf.getD1Database('DB');
 async function call(path,data,token){const r=await mf.dispatchFetch('http://local.test'+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return{status:r.status,body:await r.json()};}
 const {body:{token}}=await call('/__token?uid=runtime-user');
 // Initialize the actual existing point schema through its API (invalid claim).
 await call('/api/points/earn-by-rule',{user_id:'runtime-user',rule_code:'not-a-rule'},token);
 await db.prepare(`INSERT INTO point_rules (code,label,amount,daily_cap,enabled,updated_at) VALUES ('ai_friend_chat','fixture',2,10,1,0)`).run();
 const bypass=await call('/api/points/earn-by-rule',{user_id:'runtime-user',rule_code:'ai_friend_chat',meta:{request_id:crypto.randomUUID()}},token);
 assert.equal(bypass.status,403,'friend awards cannot be claimed without a server-confirmed chat: '+JSON.stringify(bypass.body));
 assert.equal(bypass.body.error,'server_verified_award_required');
 for(const code of ['ai_friend_word','ai_friend_voice','ai_friend_listen'])assert.equal((await call('/api/points/earn-by-rule',{user_id:'runtime-user',rule_code:code},token)).status,403);
 const foreign=await call('/api/points/earn-by-rule',{user_id:'other-user',rule_code:'ai_friend_chat'},token);
 assert.equal(foreign.status,401);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM point_transactions').first()).n,0);
 await db.prepare(`INSERT INTO point_rules (code,label,amount,daily_cap,enabled,updated_at) VALUES ('fixture_existing_rule','fixture',1,1,1,0)`).run();
 const existing=await call('/api/points/earn-by-rule',{user_id:'runtime-user',rule_code:'fixture_existing_rule'},token);
 assert.equal(existing.body.signed,1,'other existing rule behavior is preserved');
 const id=crypto.randomUUID();
 const paid=await Promise.all(Array.from({length:12},()=>call('/__credit',{uid:'runtime-user',id,code:'ai_friend_chat'})));
 assert.equal(paid.reduce((n,r)=>n+r.body.paid,0),2,'actual D1 concurrent replay pays once');
 const race=await Promise.all(Array.from({length:20},()=>call('/__credit',{uid:'runtime-race',id:crypto.randomUUID(),code:'ai_friend_chat'})));
 assert.equal(race.reduce((n,r)=>n+r.body.paid,0),20,'actual D1 daily rule cap is atomic');
 await db.exec(`CREATE TRIGGER fixture_rollback BEFORE INSERT ON point_rule_log WHEN NEW.user_id='runtime-rollback' BEGIN SELECT RAISE(ABORT,'injected ledger failure'); END;`);
 const fail=await mf.dispatchFetch('http://local.test/__credit',{method:'POST',body:JSON.stringify({uid:'runtime-rollback',id:crypto.randomUUID(),code:'ai_friend_chat'})});
 assert.equal(fail.status,500);
 for(const table of ['student_points','point_transactions','point_awards','point_rule_log'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE user_id=?').bind('runtime-rollback').first()).n,0,table+' rolls back');
 const observation={source:'warmup-verified-turn',sessionId:'session',grade:'partial',skills:{grammar:100}};
 const g=await call('/__growth',{uid:'runtime-user',id:'event',observation});
 assert.equal(g.body.turns,1);assert.equal(g.body.skills.grammar,null);
 assert.equal((await call('/__growth',{uid:'runtime-user',id:'event',observation})).body.turns,1);
 const uid='runtime-attributed',ownToken=(await call('/__token?uid='+uid)).body.token;
 const session=(await call('/api/ai/speaking-progress',{action:'start',app:'friend'},ownToken)).body.sessionId;
 const turn=crypto.randomUUID(),chat={uid,msg:'I collect seashells.',level:'S3',correction_mode:'free_talk',progress_session:session,progress_turn:turn,request_id:turn};
 const concurrent=await Promise.all(Array.from({length:4},()=>call('/api/ai/chat-friend',chat,ownToken)));assert.equal(concurrent.reduce((sum,r)=>sum+r.body.gam.awarded,0),2,'concurrent retries pay once with the same attribution');
 const recorded=await db.prepare('SELECT meta FROM point_transactions WHERE user_id=?').bind(uid).first();assert.equal(JSON.parse(recorded.meta).speaking_session,session);
 const before=(await call('/__aiCalls')).body.modelCalls;
 const completed=await call('/api/ai/speaking-progress',{action:'finish',sessionId:session},ownToken);
 assert.equal(completed.body.result.rewards.pointsEarned,2);assert.deepEqual(completed.body.result.skills,{});assert.equal((await call('/__aiCalls')).body.modelCalls,before,'finish never runs unvalidated inference');
 const replay=await call('/api/ai/chat-friend',chat,ownToken);assert.equal(replay.body.gam.awarded,0);
 assert.equal((await call('/api/ai/speaking-progress',{action:'finish',sessionId:session},ownToken)).body.result.rewards.pointsEarned,2);
 const mismatchedSession=(await call('/api/ai/speaking-progress',{action:'start',app:'friend'},ownToken)).body.sessionId;
 const mismatch=await call('/api/ai/chat-friend',{...chat,progress_session:mismatchedSession,progress_turn:crypto.randomUUID(),request_id:crypto.randomUUID()},ownToken);
 assert.equal(mismatch.body.gam.awarded,0,'different turn and award IDs cannot create unattributed payments');
 assert.equal((await call('/api/ai/speaking-progress',{action:'finish',sessionId:mismatchedSession},ownToken)).body.result.rewards.pointsEarned,0);
 const foreignToken=(await call('/__token?uid=runtime-foreign')).body.token;
 const foreignSession=(await call('/api/ai/speaking-progress',{action:'start',app:'friend'},foreignToken)).body.sessionId;
 const forgedTurn=crypto.randomUUID();const rejectedAttribution=await call('/api/ai/chat-friend',{...chat,progress_session:foreignSession,progress_turn:forgedTurn,request_id:forgedTurn},ownToken);assert.equal(rejectedAttribution.body.gam.awarded,0);
 assert.equal((await call('/api/ai/speaking-progress',{action:'finish',sessionId:foreignSession},foreignToken)).body.error,'no_completed_turns');
 const forged=await db.prepare('SELECT meta FROM point_transactions WHERE user_id=? ORDER BY id DESC LIMIT 1').bind(uid).first();assert.equal(JSON.parse(forged.meta).speaking_session,session,'foreign session cannot receive reward attribution');
 assert.equal(egress,0,'no external request during actual D1 tests');
 const probe=await mf.dispatchFetch('http://local.test/__egress');assert.equal(await probe.text(),'blocked');assert.equal(egress,1,'network deny rule is exercised');
 console.log('PASS isolated workerd/D1/KV: generic award bypass denied, auth, atomic replay/cap/rollback, growth provenance; egress blocked');
}finally{await mf?.dispose();rmSync(dir,{recursive:true,force:true});}
