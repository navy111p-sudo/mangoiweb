import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const esbuild=createRequire(new URL('../cloudflare-deploy/package.json',import.meta.url))('esbuild');
const tmp=mkdtempSync(join(tmpdir(),'warmup-credit-'));
try{
 const built=join(tmp,'credit.mjs');
 esbuild.buildSync({entryPoints:['cloudflare-deploy/src/warmup-point-credit.ts'],bundle:true,platform:'node',format:'esm',outfile:built});
 const {creditWarmupPoints}=await import(pathToFileURL(built));
 const sq=new DatabaseSync(':memory:');
 const src=readFileSync('cloudflare-deploy/src/api-points.ts','utf8');
 for(const table of ['student_points','point_transactions','point_rule_log','point_awards','point_rules']){
  const ddl=src.match(new RegExp('`(CREATE TABLE IF NOT EXISTS '+table+' \\([\\s\\S]*?;)`'))?.[1];assert.ok(ddl,table);sq.exec(ddl);
 }
 sq.prepare("INSERT INTO point_rules (code,label,amount,daily_cap,enabled,updated_at) VALUES ('warmup_talk','talk',5,1,1,0)").run();
 let failAt=-1;
 function statement(sql,args=[]){return {sql,args,bind(...a){return statement(sql,a);},async first(){return sq.prepare(sql).get(...args)||null;},async all(){return{results:sq.prepare(sql).all(...args)};},async run(){const r=sq.prepare(sql).run(...args);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};}
 const db={prepare:statement,async exec(sql){sq.exec(sql);},async batch(stmts){sq.exec('BEGIN IMMEDIATE');try{const results=stmts.map((s,i)=>{if(i===failAt)throw new Error('injected write failure');const q=sq.prepare(s.sql);if(/^SELECT/i.test(s.sql))return{results:q.all(...s.args)};const r=q.run(...s.args);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};});sq.exec('COMMIT');return results;}catch(e){sq.exec('ROLLBACK');throw e;}}};
 const claims=await Promise.all(Array.from({length:20},(_,i)=>creditWarmupPoints(db,'student','session'+i,3)));
 assert.equal(claims.filter(x=>x.ok).length,1);assert.equal(sq.prepare("SELECT balance FROM student_points WHERE user_id='student'").get().balance,5);
 assert.equal(sq.prepare("SELECT count(*) n FROM point_transactions WHERE user_id='student'").get().n,1);
 assert.equal(sq.prepare("SELECT count(*) n FROM point_rule_log WHERE user_id='student'").get().n,1);
 failAt=4;await assert.rejects(creditWarmupPoints(db,'rollback','rollback-session',3));
 assert.equal(sq.prepare("SELECT count(*) n FROM point_awards WHERE user_id='rollback'").get().n,0);assert.equal(sq.prepare("SELECT count(*) n FROM student_points WHERE user_id='rollback'").get().n,0);
 failAt=-1;assert.equal((await creditWarmupPoints(db,'rollback','rollback-session',3)).signed,5);
 sq.prepare("INSERT INTO point_transactions (user_id,type,amount,balance_after,created_at) VALUES ('capped','earn',98,98,?)").run(Date.now());
 assert.equal((await creditWarmupPoints(db,'capped','cap-session',3)).ok,false);
 const originalNow=Date.now;Date.now=()=>originalNow()+86400000;
 try{assert.equal((await creditWarmupPoints(db,'rollback','rollback-session',3)).ok,false);}finally{Date.now=originalNow;}
 assert.equal((await creditWarmupPoints(db,'different','rollback-session',3)).ok,true);
 await assert.rejects(creditWarmupPoints(db,'guest_test','s',3));await assert.rejects(creditWarmupPoints(db,'student','s',2));
 const entry=join(tmp,'route.ts'),routeFile=join(tmp,'route.mjs');
 writeFileSync(entry,`export {handlePointsApi} from ${JSON.stringify(resolve('cloudflare-deploy/src/api-points.ts'))}; export {signUidToken} from ${JSON.stringify(resolve('cloudflare-deploy/src/auth-token.ts'))};`);
 esbuild.buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'esm',outfile:routeFile});
 const {handlePointsApi,signUidToken}=await import(pathToFileURL(routeFile));
 sq.exec('CREATE TABLE warmup_session_log (session_id TEXT PRIMARY KEY,user_id TEXT)');
 sq.prepare('INSERT INTO warmup_session_log VALUES (?,?)').run('route-session','route-user');
 const history=JSON.stringify(Array.from({length:3},()=>({role:'user',content:'I like apples.',confirmed:true})));
 const env={DB:db,ADMIN_PASSWORD:'local-test-secret',ROOM_JWT_SECRET:'local-test-secret-for-authenticated-warmup',SESSION_STATE:{async get(k){return k==='warmup:route-failed'?history.replaceAll('"confirmed":true','"confirmed":false'):k.startsWith('warmup:route-')?history:null;}}};
 const tok=await signUidToken('route-user',env),wrong=await signUidToken('other-user',env);
 async function claim(token,uid='route-user',session='route-session'){const u=new URL('https://local.test/api/points/earn-by-rule');const headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;const r=await handlePointsApi(new Request(u,{method:'POST',headers,body:JSON.stringify({user_id:uid,rule_code:'warmup_talk',meta:{session_id:session,stars:100,turns:999}})}),u,env);return{status:r.status,...await r.json()};}
 assert.equal((await claim(null)).status,401);assert.equal((await claim(wrong)).status,401);
 sq.prepare('INSERT INTO warmup_session_log VALUES (?,?)').run('route-failed','route-user');
 assert.equal((await claim(tok,'route-user','route-failed')).error,'not_enough_turns');
 assert.equal((await claim(tok,'route-user','missing-owner')).ok,false);
 const good=await claim(tok);assert.equal(good.ok,true,JSON.stringify(good));assert.equal(good.signed,5);
 assert.equal((await claim(tok)).ok,false);assert.equal(sq.prepare("SELECT balance FROM student_points WHERE user_id='route-user'").get().balance,5);
 const raceToken=await signUidToken('route-race',env);
 for(let i=0;i<20;i++)sq.prepare('INSERT INTO warmup_session_log VALUES (?,?)').run('route-race-'+i,'route-race');
 const race=await Promise.all(Array.from({length:20},(_,i)=>claim(raceToken,'route-race','route-race-'+i)));
 assert.equal(race.filter(r=>r.ok).length,1);assert.equal(sq.prepare("SELECT balance FROM student_points WHERE user_id='route-race'").get().balance,5);
 failAt=5;await assert.rejects(creditWarmupPoints(db,'rollback-ledger','s',3));failAt=-1;
 assert.equal(sq.prepare("SELECT count(*) n FROM point_transactions WHERE user_id='rollback-ledger'").get().n,0);
 console.log('PASS warmup atomic daily/session dedupe, ledger consistency, rollback, cap and guest gates (real SQLite)');
}finally{rmSync(tmp,{recursive:true,force:true});}
