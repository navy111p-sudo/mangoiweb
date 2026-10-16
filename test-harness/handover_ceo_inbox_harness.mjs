// 👥 매일보고 공동 수신 — 정우영 대표(admin) ↔ 장지웅 부장(mgr_jjw) 둘 중 누구 앞이든 둘 다 본다 (2026-10-13 지시).
// 실제 라우트를 격리된 SQLite 로 실행합니다 — 운영 D1 은 건드리지 않습니다.
// HCI_SRC=<사본 경로> 로 변이시험을 할 수 있습니다.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
let ts;try{ts=require('../cloudflare-deploy/node_modules/typescript');}catch{console.log('⏭ SKIP handover_ceo_inbox — typescript 없음(npm ci 필요)');process.exit(0);}
let pass=0,fail=0;const ok=(name,c)=>{if(c){pass++;console.log('  ✅',name);}else{fail++;console.log('  ❌ FAIL',name);}};
const source=readFileSync(process.env.HCI_SRC||'cloudflare-deploy/src/daily-handover.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE admin_account(username TEXT PRIMARY KEY,name TEXT); CREATE TABLE admin_scope(username TEXT,scope_type TEXT);
CREATE TABLE push_subscriptions(endpoint TEXT,user_id TEXT,enabled INTEGER);
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
const {handleDailyHandover:handle,INBOX_ALSO_SEES}=module.exports;
const pushes=[];
const actor=u=>({ok:true,username:u,name:u,role:'hq'});
async function api(route,body,u){const url=new URL('https://mangoi.ai/api/approval/handover'+route);const req=new Request(url,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});const res=await handle(req,url,env,actor(u));return{status:res.status,...await res.json()};}
let seq=0;
async function send(u,recipient,submit=true){seq++;const r=await api('/save',{report_date:'2026-10-13',recipient,payload:{work:'Did work '+u,no_issue:true,no_open:true},version:0,request_key:'hci_request_key_'+String(seq).padStart(4,'0'),submit,confirmed:submit},u);return r.row;}
const ids=r=>(r.reports||[]).map(x=>x.username).sort().join(',');
try{
  ok('전제: 대표 ↔ 장지웅 양방향 설정이 정본에 있다',(INBOX_ALSO_SEES?.admin||[]).includes('mgr_jjw')&&(INBOX_ALSO_SEES?.mgr_jjw||[]).includes('admin'));
  const karl=await send('mgr_karl','mgr_jjw');
  await send('mgr_melca','admin');
  await send('carol','mgr_karl');           // 남 앞 보고 — 대표 목록에 안 나와야
  await send('admin','mgr_jjw');            // 대표 자신이 쓴 것 — 자기 미확인에 안 나와야
  now+=86400000;await api('/save',{report_date:'2026-10-14',recipient:'mgr_jjw',payload:{work:'draft only',no_issue:true,no_open:true},version:0,request_key:'hci_request_key_draft',submit:false},'mgr_melca');
  const adminIn=await api('/inbox',null,'admin');
  ok('대표 미확인에 장지웅 앞 보고(Karl)가 보인다',ids(adminIn).split(',').includes('mgr_karl'));
  ok('대표 앞 보고(Melca)도 그대로 보인다',ids(adminIn).split(',').includes('mgr_melca'));
  ok('남 앞 보고(carol→Karl)는 안 보인다',!ids(adminIn).split(',').includes('carol'));
  ok('대표 자신이 쓴 보고는 안 보인다',!ids(adminIn).split(',').includes('admin'));
  ok('초안은 안 보인다',(adminIn.reports||[]).every(r=>r.status==='submitted'));
  ok('건수(total)가 목록과 같다 (2건)',adminIn.total===2&&adminIn.reports.length===2);
  const jjwIn=await api('/inbox',null,'mgr_jjw');
  ok('장지웅 미확인에 대표 앞 보고(Melca)도 보인다',ids(jjwIn)==='admin,mgr_karl,mgr_melca'&&jjwIn.total===3);
  const melcaRow=jjwIn.reports.find(r=>r.username==='mgr_melca');
  ok('장지웅이 대표 앞 보고를 열람(/home 날짜별)할 수 있다',(await api('/home?date=2026-10-13',null,'mgr_jjw')).reports.some(r=>r.id===melcaRow.id));
  // 2026-10-14: 장지웅은 «열고 10초 뒤» 에만 확인된다(handover_review_deadline_harness)
  await api('/opened',{id:melcaRow.id,version:melcaRow.version},'mgr_jjw');now+=10000;
  ok('장지웅이 대표 앞 보고를 확인할 수 있다',(await api('/ack',{id:melcaRow.id,version:melcaRow.version},'mgr_jjw')).ok===true);
  ok('다른 직원(Karl)은 대표 앞 보고를 확인할 수 없다',(await api('/ack',{id:melcaRow.id,version:melcaRow.version+1},'mgr_karl')).status>=403);
  ok('다른 직원은 남의 앞 보고를 못 본다',(await api('/inbox',null,'mgr_melca')).total===0);
  const ack=await api('/ack',{id:karl.id,version:karl.version},'admin');
  ok('대표가 장지웅 앞 보고를 확인할 수 있다(기존 isExec 규칙)',ack.ok===true);
  ok('확인하면 장지웅 미확인에서도 빠진다',(await api('/inbox',null,'mgr_jjw')).total===1);
  ok('확인하면 대표 미확인에서도 빠진다',(await api('/inbox',null,'admin')).total===0);
  // 제출 순간 «도착» 알림이 공동 수신자에게도 1회 (읽는 시간대일 때)
  const tags=()=>db.prepare("SELECT endpoint,tag FROM push_queue").all();
  db.exec("DELETE FROM push_queue");now=Date.parse('2026-10-15T01:00:00Z'); // KST 10:00 평일
  const r2=await api('/save',{report_date:'2026-10-15',recipient:'mgr_jjw',payload:{work:'cc test',no_issue:true,no_open:true},version:0,request_key:'hci_request_key_cc01',submit:true,confirmed:true},'mgr_karl');
  ok('장지웅 앞 제출 → 대표에게도 도착 알림',tags().some(t=>t.endpoint==='ep-admin'&&t.tag===`handover-cc:${r2.row.id}:${r2.row.version}`));
  ok('Melca 같은 다른 직원에게는 안 간다',!tags().some(t=>t.endpoint==='ep-melca'));
  db.exec("DELETE FROM push_queue");
  const r3=await api('/save',{report_date:'2026-10-15',recipient:'admin',payload:{work:'cc test 2',no_issue:true,no_open:true},version:0,request_key:'hci_request_key_cc02',submit:true,confirmed:true},'mgr_melca');
  ok('대표 앞 제출 → 장지웅에게도 도착 알림',tags().some(t=>t.endpoint==='ep-jjw'&&t.tag===`handover-cc:${r3.row.id}:${r3.row.version}`));
  db.exec("DELETE FROM push_queue");
  const r4=await api('/save',{report_date:'2026-10-15',recipient:'carol',payload:{work:'cc test 3',no_issue:true,no_open:true},version:0,request_key:'hci_request_key_cc03',submit:true,confirmed:true},'mgr_melca');
  ok('남 앞 제출은 공동 알림 없음',!tags().some(t=>/handover-cc/.test(t.tag)));
}catch(e){fail++;console.log('  ❌ FAIL 실행 중 오류:',e&&e.message);}
// 화면: 남 앞 보고에는 «→ 받는 사람» 을 붙인다
const js=readFileSync('cloudflare-deploy/public/js/daily-handover.js','utf8');
const m=js.match(/var button=node\('button',(mode==='mine'[^;]*?),'mh-report-button'\)/);
let label=null;try{label=new Function('mode','x','me','staffName','return '+m[1]+';');}catch{}
ok('목록 라벨 식을 오려 냈다',!!label);
if(label){const sn=u=>({mgr_jjw:'장지웅'}[u]||u);
  ok('남 앞 보고는 «작성자 → 받는 사람»',label('unread',{staff_name:'Karl',recipient:'mgr_jjw'},{username:'admin'},sn)==='Karl → 장지웅');
  ok('내 앞 보고는 작성자만(예전 그대로)',label('unread',{staff_name:'Melca',recipient:'admin'},{username:'admin'},sn)==='Melca');
  ok('보낸 보고 화면은 예전 그대로',label('mine',{staff_name:'Karl',recipient:'mgr_jjw'},{username:'mgr_karl'},sn)==='→ 장지웅');}
console.log(`handover_ceo_inbox_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
