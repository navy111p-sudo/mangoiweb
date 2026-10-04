#!/usr/bin/env node
// Offline diagnosis of requested Track7 contracts. Known gaps intentionally fail.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'), tmp=mkdtempSync(join(tmpdir(),'entitlement-gap-')), files=new Map();
function cp(name){if(files.has(name))return files.get(name);const p=join(tmp,name+'.ts');files.set(name,p);let src=readFileSync(join(root,'cloudflare-deploy/src',name+'.ts'),'utf8').replace(/from (['"])\.\/([\w-]+)\1/g,(_,q,n)=>`from '${pathToFileURL(cp(n)).href}'`);if(name==='api-pay')src+='\nexport { activateEnrollment, chargeAiPassOnce };\n';writeFileSync(p,src);return p;}
process.on('exit',()=>rmSync(tmp,{recursive:true,force:true}));
const Pay=await import(pathToFileURL(cp('api-pay')).href), AI=await import(pathToFileURL(cp('api-ai')).href), Auth=await import(pathToFileURL(cp('auth-token')).href), Track=await import(pathToFileURL(cp('student-track')).href), Pass=await import(pathToFileURL(cp('ai-pass')).href);
let pass=0,gaps=0,failed=0,pg=0;const reports=[];
function ok(name,v,d){if(v){pass++;console.log('PASS '+name);}else{failed++;console.log('FAIL '+name+' '+JSON.stringify(d));}}
function contract(name,v,d){if(v){pass++;console.log('PASS '+name);}else{gaps++;reports.push({name,evidence:d});console.log('GAP '+name+' '+JSON.stringify(d));}}
globalThis.fetch=async(url,init)=>{if(!String(url).startsWith('https://api.tosspayments.com/v1/billing/'))throw Error('All non-mock outbound traffic blocked');pg++;return Response.json({status:'DONE',paymentKey:'synthetic'});};
function fresh(){const db=new DatabaseSync(':memory:');const prep=(sql,args=[])=>({bind:(...a)=>prep(sql,a.map(v=>v??null)),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}});let aiCalls=0;const env={ROOM_JWT_SECRET:'synthetic-test-secret-not-a-real-credential-123456',TOSS_SECRET_KEY:'synthetic_test_key',DB:{prepare:prep,exec:async sql=>db.exec(sql)},AI:{run:async()=>{aiCalls++;return{response:JSON.stringify({reply:'I like playing games with friends. What games do you enjoy?'})};}}};db.exec(`CREATE TABLE enrollments(id INTEGER PRIMARY KEY,student_user_id TEXT,student_name TEXT,package TEXT,started_at INTEGER,ended_at INTEGER,monthly_fee_krw INTEGER,status TEXT,notes TEXT,created_at INTEGER,updated_at INTEGER);
CREATE TABLE students_erp(user_id TEXT PRIMARY KEY,english_name TEXT,korean_name TEXT,textbook TEXT,level TEXT);
INSERT INTO students_erp VALUES('A','Alice','Synthetic A',null,'Lv 1');
CREATE TABLE payment_orders(order_id TEXT PRIMARY KEY,uid TEXT,program TEXT,amount INTEGER,status TEXT,method TEXT,payer_name TEXT,student_name TEXT,phone TEXT,created_at INTEGER,payment_key TEXT,paid_at INTEGER,raw TEXT,fail_reason TEXT);
CREATE TABLE subscriptions(id INTEGER PRIMARY KEY,user_id TEXT,student_name TEXT,plan TEXT,amount INTEGER,status TEXT,next_billing_at INTEGER,last_billed_at INTEGER,created_at INTEGER,updated_at INTEGER,billing_key TEXT,customer_key TEXT,fail_count INTEGER);
CREATE TABLE class_schedules(id INTEGER PRIMARY KEY,user_id TEXT,teacher_id TEXT,status TEXT,scheduled_date TEXT);`);return{db,env,aiCalls:()=>aiCalls};}
async function chat(s,uid='A',tokenUid='A'){const token=await Auth.signUidToken(tokenUid,s.env);const u=new URL('https://offline.invalid/api/ai/chat-friend');const req=new Request(u,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({uid,msg:'I like games.',level:'Lv 1',token})});const res=await AI.handleAiApi(req,u,s.env);return{status:res.status,body:await res.json()};}
for(const mode of ['unpaid','expired','cancelled','active']){
 const s=fresh();if(mode!=='unpaid')s.db.prepare(`INSERT INTO enrollments VALUES(1,'A','Synthetic A',?,?,?,10000,?,'old-paid-order',1,1)`).run(Pass.AI_PASS_PKG_NAME,Date.now()-40*86400000,Date.now()+(mode==='expired'?-1:30*86400000),mode==='cancelled'?'cancelled':'active');
 const r=await chat(s);
 if(mode==='active')ok('paid unexpired AI pass can chat',r.status===200&&s.aiCalls()>0,r);
 else contract(mode+' student must not consume paid AI model calls',s.aiCalls()===0&&[402,403].includes(r.status),{http:r.status,model_calls:s.aiCalls()});
 ok(mode+' chat histories stay owned by studentA',s.db.prepare("SELECT COUNT(*) n FROM ai_friend_chats WHERE student_uid<>'A'").get().n===0);
}
{
 const s=fresh(),r=await chat(s,'B','A');ok('signed studentA cannot invoke studentB learning route',r.status===403&&s.aiCalls()===0,r);
}
{
 const s=fresh();s.db.exec("INSERT INTO class_schedules VALUES(1,'A','T','active','2000-01-01')");const t=await Track.resolveStudentTrack(s.env,'A');
 ok('historical reservation intentionally preserves teacher-review diagnostic classification; never an entitlement gate',t.track==='live_ai',t);
}
{
 const s=fresh(),now=Date.now();await Pay.activateEnrollment(s.env,{uid:'A',program:'ai_content',student_name:'A'},10000,now,'AI-ONE');const paidEnd=await Pass.currentAiPassEnd(s.env,'A',Pass.AI_PASS_PKG_NAME);
 await Pay.activateEnrollment(s.env,{uid:'A',program:'1on1-24',student_name:'A'},360000,now+1,'VIDEO-ONE');
 ok('video conversion preserves pre-existing paidAI enrollment record',(await Pass.currentAiPassEnd(s.env,'A',Pass.AI_PASS_PKG_NAME))===paidEnd);
 s.db.prepare("INSERT INTO subscriptions VALUES(1,'A','A','ai_content',10000,'active',?,null,1,1,'synthetic-billing','synthetic-customer',0)").run(now);
 const before=pg,r=await Pay.chargeAiPassOnce(s.env,s.db.prepare('SELECT * FROM subscriptions').get());
 contract('video freeAI inclusion must prevent redundant AI subscription charge',pg===before,{mock_provider_calls:pg-before,result:r});
 ok('AI billing records remain separate program classification',s.db.prepare("SELECT program FROM payment_orders LIMIT 1").get().program==='ai_content');
}
console.log(JSON.stringify({pass,gaps,unexpected_failures:failed,mock_provider_calls:pg,live_transactions:0,reports}));
process.exitCode=(gaps||failed)?1:0;
