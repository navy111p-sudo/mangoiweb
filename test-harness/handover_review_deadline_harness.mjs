// ⏰ 장지웅 부장 매일보고 확인 강제 (2026-10-14 대표님 «반드시 확인하게» · 마감 다음 날 낮 12시)
//   ② 마감 지나면 대표님께 알림·목록 표시  ③ 관리자 화면 잠금(overdue_lock)  ④ 연 뒤 10초 지나야 확인
// 실제 라우트를 격리된 SQLite 로 실행합니다. HRD_SRC=<사본> 으로 변이시험.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
let ts;try{ts=require('../cloudflare-deploy/node_modules/typescript');}catch{console.log('⏭ SKIP handover_review_deadline — typescript 없음(npm ci 필요)');process.exit(0);}
let pass=0,fail=0;const ok=(name,c)=>{if(c){pass++;console.log('  ✅',name);}else{fail++;console.log('  ❌ FAIL',name);}};
const source=readFileSync(process.env.HRD_SRC||'cloudflare-deploy/src/daily-handover.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE admin_account(username TEXT PRIMARY KEY,name TEXT); CREATE TABLE admin_scope(username TEXT,scope_type TEXT);
CREATE TABLE push_subscriptions(endpoint TEXT,user_id TEXT,enabled INTEGER);
CREATE TABLE holidays(country TEXT,date TEXT,name TEXT); INSERT INTO holidays VALUES('KR','2026-10-20','시험 공휴일'),('PH','2026-10-22','필리핀만'),('KR','2026-10-24','토요일 공휴일');
INSERT INTO push_subscriptions VALUES('ep-admin','admin',1),('ep-jjw','mgr_jjw',1),('ep-melca','mgr_melca',1);
CREATE TABLE push_queue(endpoint TEXT,title TEXT,body TEXT,url TEXT,icon TEXT,badge TEXT,tag TEXT,queued_at INTEGER);
INSERT INTO admin_account VALUES('admin','대표'),('mgr_jjw','장지웅'),('mgr_karl','Karl'),('mgr_melca','Melca'),('carol','Carol');
INSERT INTO admin_scope SELECT username,'hq' FROM admin_account;`);
function statement(sql){let args=[];return{sql,bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},runSync(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};},async run(){return this.runSync();}};}
const env={DB:{prepare:statement,async batch(items){db.exec('BEGIN');try{const out=items.map(s=>s.runSync());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};
let now=Date.parse('2026-10-13T10:00:00Z');class TestDate extends Date{static now(){return now;}}
const module={exports:{}};
const context={module,exports:module.exports,console,crypto,Date:TestDate,Request,Response,URL,setTimeout,clearTimeout,require:(name)=>{
 if(name==='./d1-chunk'){const m={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync('cloudflare-deploy/src/d1-chunk.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});return m.exports;}
 if(name==='./approval-policy')return{isHqStaff:a=>!!a.ok&&!a.isTeacher&&['hq','staff'].includes(a.role),isExec:a=>a.username==='admin'};
 if(name==='./once-per-isolate')return{oncePerIsolate:f=>f};
 if(name==='./handover-routing')return{approvalHints:()=>[],APPROVAL_PROMPT_RULE:''};
 if(name==='./auth-admin')return{PH_MANAGERS:[]};
 if(name==='./web-push')return{broadcastWebPush:async eps=>({sent:eps.length})};
 throw new Error(name);
}};
vm.runInNewContext(code,context);
const {handleDailyHandover:handle,reviewDueAt,runReviewEscalation,REVIEW_ENFORCED}=module.exports;
const pushes=[];
const actor=u=>({ok:true,username:u,name:u,role:'hq'});
async function api(route,body,u){const url=new URL('https://mangoi.ai/api/approval/handover'+route);const req=new Request(url,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});const res=await handle(req,url,env,actor(u));return{status:res.status,...await res.json()};}
let seq=0;
async function send(u,recipient,day){seq++;const r=await api('/save',{report_date:day,recipient,payload:{work:'Did work '+u+' '+seq,no_issue:true,no_open:true},version:0,request_key:'hrd_request_key_'+String(seq).padStart(4,'0'),submit:true,confirmed:true},u);return r.row;}
const T=s=>Date.parse(s);
try{
  ok('전제: 확인 의무자는 장지웅뿐 · 대표는 아님',REVIEW_ENFORCED.includes('mgr_jjw')&&!REVIEW_ENFORCED.includes('admin'));
  // 마감 = 제출한 날(KST) 다음 날 12:00 KST
  ok('마감: 10/13 19:00 KST 제출 → 10/14 12:00 KST',reviewDueAt(T('2026-10-13T10:00:00Z'))===T('2026-10-14T03:00:00Z'));
  ok('마감: 10/13 23:59 KST 제출 → 10/14 12:00 KST',reviewDueAt(T('2026-10-13T14:59:00Z'))===T('2026-10-14T03:00:00Z'));
  ok('마감: 10/14 00:01 KST 제출 → 10/15 12:00 KST (KST 날짜 기준)',reviewDueAt(T('2026-10-13T15:01:00Z'))===T('2026-10-15T03:00:00Z'));
  // 주말 제외(2026-10-16 대표님 지시) — 토·일이면 월요일 12시
  ok('주말: 목 10/15 제출 → 금 10/16 12:00 (평일은 그대로)',reviewDueAt(T('2026-10-15T09:00:00Z'))===T('2026-10-16T03:00:00Z'));
  ok('주말: 금 10/16 제출 → 월 10/19 12:00',reviewDueAt(T('2026-10-16T09:00:00Z'))===T('2026-10-19T03:00:00Z'));
  ok('주말: 토 10/17 제출 → 월 10/19 12:00',reviewDueAt(T('2026-10-17T05:00:00Z'))===T('2026-10-19T03:00:00Z'));
  ok('주말: 일 10/18 제출 → 월 10/19 12:00',reviewDueAt(T('2026-10-18T05:00:00Z'))===T('2026-10-19T03:00:00Z'));
  ok('주말: 일 23:59 KST 제출 → 월 12:00 (KST 날짜 기준)',reviewDueAt(T('2026-10-18T14:59:00Z'))===T('2026-10-19T03:00:00Z'));
  ok('주말: 월 00:01 KST 제출 → 화 12:00',reviewDueAt(T('2026-10-18T15:01:00Z'))===T('2026-10-20T03:00:00Z'));
  const karl=await send('mgr_karl','mgr_jjw','2026-10-13');
  const melca=await send('mgr_melca','admin','2026-10-13');       // 대표 앞 — 장지웅 잠금 대상 아님
  // 마감 전
  now=T('2026-10-14T02:59:00Z');
  let jj=await api('/inbox',null,'mgr_jjw');
  ok('마감 1분 전: 잠금 없음',Array.isArray(jj.overdue_lock)&&jj.overdue_lock.length===0);
  ok('확인 의무자에게 read_min_sec 10',jj.read_min_sec===10);
  db.exec('DELETE FROM push_queue');await runReviewEscalation(env,now);
  ok('마감 전에는 대표 알림 없음',db.prepare("SELECT COUNT(*) n FROM push_queue WHERE endpoint='ep-admin'").get().n===0);
  // 마감 지남
  now=T('2026-10-14T05:30:00Z');
  jj=await api('/inbox',null,'mgr_jjw');
  ok('마감 지남: 장지웅 잠금 1건(본인 앞 보고만)',jj.overdue_lock.length===1&&jj.overdue_lock[0].id===karl.id&&jj.overdue_lock[0].late_hours===2);
  const ad=await api('/inbox',null,'admin');
  ok('대표는 잠그지 않는다',ad.overdue_lock===null&&ad.read_min_sec===0);
  ok('대표 화면: 장지웅 마감 지남 1건 · 최장 2시간',ad.reviewer_overdue.length===1&&ad.reviewer_overdue[0].username==='mgr_jjw'&&ad.reviewer_overdue[0].count===1&&ad.reviewer_overdue[0].max_late_hours===2);
  ok('다른 직원에게는 대표용 목록이 없다',(await api('/inbox',null,'mgr_karl')).reviewer_overdue.length===0);
  db.exec('DELETE FROM push_queue');await runReviewEscalation(env,now);
  const q=db.prepare("SELECT body FROM push_queue WHERE endpoint='ep-admin'").all();
  ok('마감 지나면 대표님께 알림 1건',q.length===1&&/장지웅/.test(q[0].body)&&/1건/.test(q[0].body));
  ok('장지웅 본인에게는 이 알림이 안 간다',db.prepare("SELECT COUNT(*) n FROM push_queue WHERE endpoint='ep-jjw'").get().n===0);
  db.exec('DELETE FROM push_queue');now+=15*60000;await runReviewEscalation(env,now);
  ok('15분 뒤 다시 돌아도 같은 보고로는 안 보낸다',db.prepare("SELECT COUNT(*) n FROM push_queue").get().n===0);
  // ④ 열지 않고 바로 확인 → 막힘
  let a=await api('/ack',{id:karl.id,version:karl.version},'mgr_jjw');
  ok('열지 않고 확인 → 409 read_first',a.status===409&&a.error==='read_first'&&/10초/.test(a.message)&&/seconds/.test(a.message));
  ok('열람 기록',(await api('/opened',{id:karl.id,version:karl.version},'mgr_jjw')).ok===true);
  now+=5000;a=await api('/ack',{id:karl.id,version:karl.version},'mgr_jjw');
  ok('연 뒤 5초 → 아직 막힘(남은 5초)',a.status===409&&a.wait_sec===5);
  now+=5000;a=await api('/ack',{id:karl.id,version:karl.version},'mgr_jjw');
  ok('연 뒤 10초 → 확인 됨',a.ok===true);
  jj=await api('/inbox',null,'mgr_jjw');
  ok('확인하면 잠금이 풀린다',jj.overdue_lock.length===0);
  ok('대표 화면에서도 빠진다',(await api('/inbox',null,'admin')).reviewer_overdue.length===0);
  // 공동 수신(대표 앞) 보고도 장지웅이 확인하려면 열어야 한다 — 대표가 연 기록으로는 안 된다
  ok('대표가 대표 앞 보고를 연다',(await api('/opened',{id:melca.id,version:melca.version},'admin')).ok===true);
  now+=20000;a=await api('/ack',{id:melca.id,version:melca.version},'mgr_jjw');
  ok('대표가 연 기록으로 장지웅 확인은 안 된다',a.status===409&&a.error==='read_first');
  ok('장지웅이 공동 수신 보고를 열 수 있다',(await api('/opened',{id:melca.id,version:melca.version},'mgr_jjw')).ok===true);
  const f=db.prepare('SELECT opened_at FROM daily_handover_followup WHERE report_id=?').get(melca.id);
  ok('대표(받는 사람)가 연 시각은 그대로 남는다',!!f.opened_at);
  now+=10000;ok('10초 뒤 장지웅 확인 됨',(await api('/ack',{id:melca.id,version:melca.version},'mgr_jjw')).ok===true);
  // 장지웅이 공동 수신 보고를 먼저 열어도 «받는 사람이 열었다» 로 세지 않는다
  const m2=await send('mgr_melca','admin','2026-10-14');
  await api('/opened',{id:m2.id,version:m2.version},'mgr_jjw');
  const f2=db.prepare('SELECT opened_at FROM daily_handover_followup WHERE report_id=?').get(m2.id);
  ok('공동 수신자가 열어도 받는 사람의 열람 시각은 안 찍힌다',!f2||f2.opened_at==null);
  // 대표는 10초 규칙 없음
  const k2=await send('mgr_karl','mgr_jjw','2026-10-14');
  ok('대표는 열지 않아도 바로 확인(규칙 대상 아님)',(await api('/ack',{id:k2.id,version:k2.version},'admin')).ok===true);
  // 실패하면 잠그지 않는다
  now=T('2026-10-15T01:00:00Z');const k3=await send('mgr_karl','mgr_jjw','2026-10-15');now=T('2026-10-16T05:00:00Z');
  const realPrepare=env.DB.prepare;env.DB.prepare=sql=>{if(/FROM daily_handovers\s+WHERE recipient=\? AND username<>\? AND status='submitted' AND submitted_at/.test(sql))throw new Error('down');return realPrepare(sql);};
  jj=await api('/inbox',null,'mgr_jjw');env.DB.prepare=realPrepare;
  ok('마감 조회가 실패하면 잠그지 않는다(null)',jj.ok===true&&jj.overdue_lock===null);
  jj=await api('/inbox',null,'mgr_jjw');
  ok('조회가 되면 다시 잠긴다',jj.overdue_lock.length===1&&jj.overdue_lock[0].id===k3.id);
  // 공휴일 제외(2026-10-16 대표님 «공휴일도 빼줘») — 정본 함수
  const kr=d=>d==='2026-10-20';
  ok('공휴일: 월 10/19 제출, 화 10/20 공휴일 → 수 10/21 12:00',reviewDueAt(T('2026-10-19T01:00:00Z'),kr)===T('2026-10-21T03:00:00Z'));
  ok('공휴일: 판정 없이 부르면 예전대로(화 12:00)',reviewDueAt(T('2026-10-19T01:00:00Z'))===T('2026-10-20T03:00:00Z'));
  ok('공휴일: 금 제출 + 월 공휴일 → 화 12:00',reviewDueAt(T('2026-10-16T09:00:00Z'),d=>d==='2026-10-19')===T('2026-10-20T03:00:00Z'));
  ok('공휴일: 긴 연휴(5일)도 건너뛴다',reviewDueAt(T('2026-10-16T09:00:00Z'),d=>d>='2026-10-19'&&d<='2026-10-23')===T('2026-10-26T03:00:00Z'));
  // 금요일 보고는 주말 동안 안 잠기고 월 12시에 잠긴다
  await api('/ack',{id:k3.id,version:k3.version},'admin');
  now=T('2026-10-16T09:00:00Z');const fri=await send('mgr_karl','mgr_jjw','2026-10-16');
  now=T('2026-10-18T10:00:00Z');jj=await api('/inbox',null,'mgr_jjw');
  ok('금요일 보고: 일요일 저녁엔 안 잠긴다',jj.overdue_lock.length===0);
  now=T('2026-10-19T02:59:00Z');ok('금요일 보고: 월 11:59 엔 안 잠긴다',(await api('/inbox',null,'mgr_jjw')).overdue_lock.length===0);
  now=T('2026-10-19T03:01:00Z');jj=await api('/inbox',null,'mgr_jjw');
  ok('금요일 보고: 월 12:01 에 잠긴다',jj.overdue_lock.length===1&&jj.overdue_lock[0].id===fri.id&&jj.overdue_lock[0].late_hours===0);
  // 실제 라우트: 한국 공휴일(D1 holidays) 은 건너뛰고 필리핀 공휴일은 안 건너뛴다
  await api('/ack',{id:fri.id,version:fri.version},'mgr_jjw').catch(()=>{});
  await api('/opened',{id:fri.id,version:fri.version},'mgr_jjw');now+=11000;await api('/ack',{id:fri.id,version:fri.version},'mgr_jjw');
  now=T('2026-10-19T01:00:00Z');const mon=await send('mgr_karl','mgr_jjw','2026-10-19');
  now=T('2026-10-20T04:00:00Z');ok('공휴일 10/20 13:00 KST: 안 잠긴다',(await api('/inbox',null,'mgr_jjw')).overdue_lock.length===0);
  now=T('2026-10-21T02:59:00Z');ok('다음 근무일 10/21 11:59: 안 잠긴다',(await api('/inbox',null,'mgr_jjw')).overdue_lock.length===0);
  now=T('2026-10-21T03:01:00Z');jj=await api('/inbox',null,'mgr_jjw');
  ok('다음 근무일 10/21 12:01: 잠긴다',jj.overdue_lock.length===1&&jj.overdue_lock[0].id===mon.id);
  await api('/opened',{id:mon.id,version:mon.version},'mgr_jjw');now+=11000;await api('/ack',{id:mon.id,version:mon.version},'mgr_jjw');
  now=T('2026-10-21T05:00:00Z');const wed=await send('mgr_karl','mgr_jjw','2026-10-21');
  now=T('2026-10-22T03:01:00Z');ok('필리핀 공휴일(10/22)은 안 건너뛴다 — 목 12:01 잠김',(await api('/inbox',null,'mgr_jjw')).overdue_lock.some(x=>x.id===wed.id));
  await api('/opened',{id:wed.id,version:wed.version},'mgr_jjw');now+=11000;await api('/ack',{id:wed.id,version:wed.version},'mgr_jjw');
  now=T('2026-10-23T05:00:00Z');const fri2=await send('mgr_karl','mgr_jjw','2026-10-23');
  now=T('2026-10-26T02:59:00Z');ok('토요일 공휴일이 겹쳐도 월 12시 마감 그대로',(await api('/inbox',null,'mgr_jjw')).overdue_lock.length===0);
  now=T('2026-10-26T03:01:00Z');ok('… 월 12:01 잠김',(await api('/inbox',null,'mgr_jjw')).overdue_lock.some(x=>x.id===fri2.id));
  // 공휴일 표를 못 읽으면 주말만 빼는 예전 동작
  db.exec('ALTER TABLE holidays RENAME TO holidays_x');
  now=T('2026-10-19T01:00:00Z');const mon2=await send('mgr_melca','mgr_jjw','2026-10-19');now=T('2026-10-20T03:01:00Z');
  ok('공휴일 표 실패 → 주말만 빼고 판정(화 12:01 잠김)',(await api('/inbox',null,'mgr_jjw')).overdue_lock.some(x=>x.id===mon2.id));
  db.exec('ALTER TABLE holidays_x RENAME TO holidays');
}catch(e){fail++;console.log('  ❌ FAIL 실행 중 오류:',e&&e.stack);}
{const i=source.indexOf('export async function runDailyHandoverSweep');const body=source.slice(i,source.indexOf('\n}\n',i));ok('15분 sweep 이 마감 알림을 부른다',i>0&&/await runReviewEscalation\(env\)/.test(body.replace(/\/\/.*$/gm,'')));}
// 화면 배선 — 배너 잠금 · 확인 버튼 카운트다운 · 대표 표시
const banner=readFileSync('cloudflare-deploy/public/js/handover-inbox-banner.js','utf8');
const page=readFileSync('cloudflare-deploy/public/js/daily-handover.js','utf8');
ok('배너가 overdue_lock 으로 잠금 화면을 그린다',/function paintLock\(\)/.test(banner)&&/last\.overdue_lock/.test(banner)&&/paintLock\(\);host\.hidden/.test(banner));
ok('잠금 화면에 닫기 버튼이 없다',!/handover-review-lock[\s\S]{0,2000}(닫기|close\(\)|Close)/.test(banner.slice(banner.indexOf('function paintLock'),banner.indexOf('function reviewerLine'))));
ok('401/403 이면 잠금을 걷는다',/stopped=true;last=null;host\.hidden=true;paintLock\(\)/.test(banner));
ok('확인 의무자에게도 알림 권유',/last\.read_min_sec>0/.test(banner));
ok('대표 줄(reviewer_overdue)을 배너에 쓴다',/reviewer_overdue/.test(banner));
ok('관리자·매니저·결재 화면의 배너가 같은 코드',['admin.html','manager.html','work.html'].every(f=>f==='admin.html'?/handover-inbox-banner\.js\?v=8/.test(readFileSync('cloudflare-deploy/public/admin.html','utf8')):readFileSync('cloudflare-deploy/public/'+f,'utf8').includes(banner.trim())));
ok('확인 버튼이 N초 카운트다운',/function armReadGate/.test(page)&&/if\(readMinSec>0\)armReadGate\(r,ack\)/.test(page));
ok('read_first 를 사람 말로 보여준다',/j\.error==='read_first'/.test(page));
ok('대표 미확인 줄에 장지웅 마감 지남 표시',/overdueLine\(\)/.test(page)&&/reviewerOverdue=data\[1\]\.reviewer_overdue/.test(page));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
