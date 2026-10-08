#!/usr/bin/env node
// Offline only: production TypeScript, isolated SQLite, and intercepted payment provider.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'payment-integrity-'));
const copies = new Map();
function copy(name) {
  if (copies.has(name)) return copies.get(name);
  const path = join(dir, name + '.ts'); copies.set(name, path);
  const override = name === 'api-pay' ? process.env.INTEGRITY_PAY_SRC : name === 'enroll-ops' ? process.env.INTEGRITY_ENROLL_SRC : name === 'api-pay-refund' ? process.env.INTEGRITY_REFUND_SRC : name === 'payment-schedule-audit' ? process.env.INTEGRITY_AUDIT_SRC : '';
  const src = readFileSync(override || join(root, 'cloudflare-deploy/src', name + '.ts'), 'utf8');
  writeFileSync(path, src.replace(/from (['"])\.\/([\w-]+)\1/g, (_, q, n) => `from '${pathToFileURL(copy(n)).href}'`));
  return path;
}
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const Pay = await import(pathToFileURL(copy('api-pay')).href);
const E = await import(pathToFileURL(copy('enroll-ops')).href);
const Audit = await import(pathToFileURL(copy('payment-schedule-audit')).href);
const Refund = await import(pathToFileURL(copy('api-pay-refund')).href);
const Ledger = await import(pathToFileURL(copy('session-ledger-load')).href);
let pass = 0, fail = 0;
const observations = {};
const previewFields = p => ({ remaining_classes: p.remaining_classes, choice_count: p.remaining_lessons.length,
  used_sessions: p.suggest_basis.used_sessions, remaining_by_schedule: p.suggest_basis.remaining_by_schedule,
  suggested: p.suggested, already_refunded: p.already_refunded, refundable_max: p.refundable_max });
function check(name, cond, value) { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + ' ' + JSON.stringify(value)); } }
let providerCalls = 0, providerStatus = 'DONE', providerReplies = [];
let providerPayment = {total:360000,balance:360000};
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.tosspayments.com/v1/')) throw Error('Unexpected outbound request blocked: ' + url);
  providerCalls++;
  if(providerReplies.length) return await providerReplies.shift()(url,init);
  const body = init?.body ? JSON.parse(init.body) : {};
  if (String(url).endsWith('/cancel')) {
    providerPayment.balance -= body.cancelAmount || providerPayment.balance;
    return Response.json({status:providerPayment.balance?'PARTIAL_CANCELED':'CANCELED',totalAmount:providerPayment.total,balanceAmount:providerPayment.balance,paymentKey:'synthetic-key'});
  }
  if (body.amount) providerPayment = {total:body.amount,balance:body.amount};
  return Response.json({ status: providerStatus, orderId: body.orderId, paymentKey: 'synthetic-key', totalAmount: body.amount || 360000 });
};
function fresh() {
  const db = new DatabaseSync(':memory:');
  const faults = { batch: 0, statementAt: 0, inserts: 0, delayedSource: false, sourceReads: 0, lessonReads: 0, lessonReadFault: '' };
  let afterBatch; const batchFinished=new Promise(r=>{afterBatch=r;});
  const prepare = (sql, args = []) => ({
    bind: (...a) => prepare(sql, a.map(v => v ?? null)),
    first: async () => { const value=db.prepare(sql).get(...args) ?? null; if(faults.delayedSource && sql.includes('SELECT id FROM class_schedules WHERE source')) { faults.sourceReads++; if(faults.sourceReads===2) await batchFinished; } return value; },
    all: async () => {
      if (sql.includes('SELECT s.id, s.scheduled_date AS date')) {
        faults.lessonReads++;
        if (faults.lessonReadFault === 'throw') throw Error('injected temporary attendance read failure');
        if (faults.lessonReadFault === 'missing_results') return { success: true };
        if (faults.lessonReadFault === 'failed_result') return { success: false, results: [] };
      }
      return { results: db.prepare(sql).all(...args) };
    },
    _run: () => { if(sql.includes('INSERT OR IGNORE INTO class_schedules')) {faults.inserts++; if(faults.statementAt && faults.inserts===faults.statementAt) throw Error('injected mid-transaction failure');} return db.prepare(sql).run(...args); },
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  const env = { TOSS_SECRET_KEY: 'synthetic_test_never_live', DB: { prepare, exec: async s => db.exec(s), batch: async stmts => {
    if (faults.batch > 0) { faults.batch--; throw Error('injected schedule database failure'); }
    db.exec('BEGIN'); try { const r = []; for (const s of stmts) { const x=s._run(); r.push({success:true,meta:{changes:Number(x.changes),last_row_id:Number(x.lastInsertRowid)}}); } db.exec('COMMIT'); afterBatch(); return r; } catch(e) { db.exec('ROLLBACK'); throw e; }
  } } };
  db.exec(`CREATE TABLE payment_orders(order_id TEXT PRIMARY KEY, uid TEXT, program TEXT, amount INTEGER, status TEXT, payment_key TEXT, method TEXT, payer_name TEXT, student_name TEXT, created_at INTEGER, paid_at INTEGER, fail_reason TEXT, raw TEXT, phone TEXT, enroll_json TEXT);
  CREATE TABLE teachers(id TEXT PRIMARY KEY,name TEXT,active INTEGER);
  CREATE TABLE students_erp(user_id TEXT PRIMARY KEY,korean_name TEXT,english_name TEXT,username TEXT,shop_name TEXT);
  CREATE TABLE subscriptions(id INTEGER PRIMARY KEY,user_id TEXT,status TEXT,billing_key TEXT,plan TEXT);
  INSERT INTO teachers VALUES('T1','Synthetic teacher',1);
  INSERT INTO students_erp VALUES('A','Synthetic A',null,'A',null);`);
  return { db, env, faults };
}
const n = (s, t) => Number(s.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
async function order(s, kind='new', overrides={}) {
  await E.ensureEnrollTables(s.env);
  return (await E.createEnrollOrder(s.env, 'A', { weekly: 2, months: 3, minutes: 20, teacherId:'T1', days:[1,3], times:{1:'19:00',3:'19:00'}, timesMin:{1:1140,3:1140}, startDate:'2027-01-04', ...overrides }, kind)).json();
}
async function confirm(s, o) { const url = new URL('https://offline.invalid/api/pay/confirm'); return (await Pay.handlePayApi(new Request(url, {method:'POST',body:JSON.stringify({orderId:o.orderId,amount:o.amount,paymentKey:'synthetic-key'})}),url,s.env)).json(); }
for (let repeat = 1; repeat <= 3; repeat++) {
  const s = fresh(); const o = await order(s); const before = providerCalls;
  check(`${repeat}: server quote gives 2/week x12weeks =24`, o.ok && o.summary.sessions === 24 && o.amount === 360000,o);
  check(`${repeat}: pending order has no schedules`, n(s,'class_schedules') === 0);
  const r = await confirm(s,o);
  check(`${repeat}: paid creates exactly24 schedules`, r.ok && n(s,'class_schedules') === 24,r);
  check(`${repeat}: enrollment matches student and teacher`, s.db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE user_id='A' AND teacher_id='T1' AND duration_min=20 AND class_type='regular'").get().n === 24);
  await confirm(s,o);
  check(`${repeat}: duplicate callback does not recharge/duplicate`, providerCalls-before === 1 && n(s,'class_schedules') === 24 && n(s,'enrollments') === 1);
}
{
  const s=fresh(), o=await order(s); s.faults.batch=1; const before=providerCalls;
  await confirm(s,o);
  check('fault really leaves paid enrollment without schedules', n(s,'enrollments')===1 && n(s,'class_schedules')===0);
  await confirm(s,o);
  check('paid callback replay repairs missing schedules without recharging', n(s,'class_schedules')===24 && providerCalls-before===1, {schedules:n(s,'class_schedules'),calls:providerCalls-before});
}
{
  const s=fresh(), o=await order(s);
  const r=await Promise.all([confirm(s,o),confirm(s,o)]);
  check('concurrent callbacks create one enrollment', n(s,'enrollments')===1,{enrollments:n(s,'enrollments'),r});
  check('concurrent callbacks create one schedule set', n(s,'class_schedules')===24,n(s,'class_schedules'));
}
{
  const s=fresh(), o=await order(s); providerStatus='ABORTED'; await confirm(s,o); providerStatus='DONE';
  check('failed payment generates no schedules or enrollment', n(s,'class_schedules')===0 && (!s.db.prepare("SELECT name FROM sqlite_master WHERE name='enrollments'").get() || n(s,'enrollments')===0));
}

async function webhook(s,o) { const url = new URL('https://offline.invalid/api/pay/webhook'); return (await Pay.handlePayApi(new Request(url,{method:'POST',body:JSON.stringify({data:{orderId:o.orderId}})}),url,s.env)).json(); }
{
 const s=fresh(),o=await order(s); s.faults.batch=1; await confirm(s,o); await webhook(s,o);
 check('verified paid webhook repairs missing schedules', n(s,'class_schedules')===24);
}
{
 const s=fresh(),o=await order(s,'new',{weekly:5,months:12,days:[1,2,3,4,5],times:{1:'19:00',2:'19:00',3:'19:00',4:'19:00',5:'19:00'},timesMin:{1:1140,2:1140,3:1140,4:1140,5:1140}});
 s.db.exec(`CREATE TEMP TRIGGER fail_row81 BEFORE INSERT ON class_schedules WHEN (SELECT COUNT(*) FROM class_schedules)=80 BEGIN SELECT RAISE(ABORT,'injected row81 failure'); END;`); await confirm(s,o);
 check('failure at statement81 rolls back all240 paid schedules',n(s,'class_schedules')===0,n(s,'class_schedules'));
 s.db.exec('DROP TRIGGER fail_row81'); await confirm(s,o);
 check('retry after transaction rollback restores exactly240',n(s,'class_schedules')===240,n(s,'class_schedules'));
}
for(const state of ['cancelled','refunded','partial_refunded']) {
 const s=fresh(),o=await order(s); await confirm(s,o); s.db.prepare('UPDATE payment_orders SET status=?').run(state);
 const before=providerCalls, r=await confirm(s,o);
 check(state+' cannot be reconfirmed or recharged',!r.ok && r.error==='order_already_reversed' && providerCalls===before,r);
 await webhook(s,o);
 check('stale DONE webhook does not resurrect '+state,s.db.prepare('SELECT status FROM payment_orders').get().status===state);
}
{
 const s=fresh(),o=await order(s);
 providerReplies=[async()=>Response.json({status:'DONE',totalAmount:o.amount}),async()=>{await new Promise(r=>setTimeout(r,10));return Response.json({code:'ALREADY_PROCESSED_PAYMENT'},{status:400});}];
 await Promise.all([confirm(s,o),confirm(s,o)]);
 check('late failed duplicate response cannot overwrite paid',s.db.prepare('SELECT status FROM payment_orders').get().status==='paid');
}
{
 const s=fresh(),o=await order(s); await confirm(s,o);
 const clean=await Audit.auditPaymentSchedules(s.env);
 check('clean24 count audit has no discrepancy',clean.checked===1 && clean.issues.length===0,clean);
 s.db.exec('DELETE FROM class_schedules WHERE id=(SELECT MAX(id) FROM class_schedules)');
 const before=n(s,'class_schedules'); const issue=(await Audit.auditPaymentSchedules(s.env)).issues[0];
 check('manual missing row is actionable by order/student/schedule/count',issue?.order_id===o.orderId && issue.uid==='A' && issue.actual_rows===23 && issue.expected_sessions===24 && issue.schedule_ids.length===23 && issue.reasons.includes('schedule_count_mismatch_review'),issue);
 await confirm(s,o);
 check('replay preserves deliberate existing schedule changes for review',n(s,'class_schedules')===before);
 s.db.exec("UPDATE class_schedules SET user_id='B' WHERE id=1");
 check('cross-student schedule mismatch detected',(await Audit.auditPaymentSchedules(s.env)).issues[0].reasons.includes('schedule_student_mismatch'));
 s.db.exec("UPDATE payment_orders SET status='cancelled'");
 check('cancellation with active lessons is flagged',(await Audit.auditPaymentSchedules(s.env)).issues[0].reasons.includes('cancelled_order_has_active_schedules'));
 s.db.exec("UPDATE payment_orders SET status='partial_refunded'");
 check('partial refund quota is review-needed not guessed',(await Audit.auditPaymentSchedules(s.env)).issues[0].reasons.includes('partial_refund_quota_review'));
 s.db.exec("UPDATE payment_orders SET status='failed'");
 check('unpaid lessons flagged',(await Audit.auditPaymentSchedules(s.env)).issues[0].reasons.includes('unpaid_order_has_schedules'));
 const beforeAudit=s.db.prepare('SELECT total_changes() n').get().n;
 await Audit.auditPaymentSchedules(s.env);
 check('reconciliation is read-only',s.db.prepare('SELECT total_changes() n').get().n===beforeAudit);
 const integrated=await Pay.runPaymentAudit(s.env,{sms:false});
 check('existing admin audit exposes detailed schedule issues',integrated.summary.scheduleIssues===1 && integrated.scheduleIssues[0].order_id===o.orderId,integrated.summary);
}
{
 const s=fresh(),o=await order(s); await confirm(s,o);
 s.db.exec(`CREATE TABLE attendance(room_id TEXT,role TEXT,joined_at INTEGER,date TEXT,account_uid TEXT,user_id TEXT,status TEXT);
 CREATE TABLE class_no_show(room_id TEXT,schedule_id INTEGER,missing_role TEXT,teacher_name TEXT,student_name TEXT,created_at INTEGER);
 CREATE TABLE schedule_change_requests(schedule_id INTEGER,orig_date TEXT,fee_type TEXT,minutes_before INTEGER,request_type TEXT,created_at INTEGER,status TEXT);`);
 const row=s.db.prepare('SELECT * FROM class_schedules ORDER BY scheduled_date LIMIT 1').get();
 const room='class-'+row.id+'-'+row.scheduled_date.replaceAll('-',''), joined=Date.parse(row.scheduled_date+'T19:00:00+09:00');
 s.db.prepare('INSERT INTO attendance VALUES(?,?,?,?,?,?,?)').run(room,'student',joined,row.scheduled_date,'A','A','joined');
 s.db.prepare('INSERT INTO attendance VALUES(?,?,?,?,?,?,?)').run(room,'teacher',joined,row.scheduled_date,'T1','T1','joined');
 const ledger=await Ledger.buildStudentLedger(s.env,'A','2027-01',joined+20*60000);
 check('scheduled room ID flows into actual attendance ledger',ledger.items[0].room_id===room && ledger.items[0].state==='done',ledger.items[0]);
 check('one recorded lesson yields24minus1 remaining by canonical ledger',o.summary.sessions-ledger.summary.deducted===23,ledger.summary);
 const again=await Ledger.buildStudentLedger(s.env,'A','2027-01',joined+20*60000);
 check('re-reading completion never double-deducts',again.summary.deducted===1);
 const other=await Ledger.buildStudentLedger(s.env,'B','2027-01',joined+20*60000);
 check('studentB never sees studentA purchased lessons',other.items.length===0);
}


function refundFixture(s) {
 s.db.exec(`CREATE TABLE IF NOT EXISTS attendance(room_id TEXT,role TEXT,joined_at INTEGER,date TEXT,account_uid TEXT,user_id TEXT,status TEXT);
 CREATE TABLE admin_account(id INTEGER PRIMARY KEY,username TEXT UNIQUE,password_hash TEXT,name TEXT,email TEXT,phone TEXT,created_at INTEGER,updated_at INTEGER);
 CREATE TABLE admin_sessions(token TEXT PRIMARY KEY,username TEXT,ip TEXT,user_agent TEXT,created_at INTEGER,expires_at INTEGER,last_seen_at INTEGER);
 CREATE TABLE admin_scope(username TEXT PRIMARY KEY,scope_type TEXT,scope_value TEXT,updated_at INTEGER);
 INSERT INTO admin_account VALUES(1,'admin','synthetic-hash','Synthetic administrator',null,null,1,1);
 INSERT INTO admin_scope VALUES('admin','hq',null,1);`);
 s.db.prepare("INSERT INTO admin_sessions VALUES('synthetic-session','admin',null,null,1,?,1)").run(Date.now()+86400000);
}
async function refund(s,o,body={},authorized=true) {
 const url=new URL('https://offline.invalid/api/pay/admin/refund');
 const res=await Refund.handleRefundApi(new Request(url,{method:'POST',headers:authorized?{cookie:'mango_admin_session=synthetic-session'}:{},body:JSON.stringify({order_id:o.orderId,amount:30000,reason:'Synthetic selected unused lesson refund',...body})}),url,s.env);
 return {status:res.status,...await res.json()};
}
async function preview(s,o) {
 const url=new URL('https://offline.invalid/api/pay/admin/refund-preview?order_id='+encodeURIComponent(o.orderId));
 const res=await Refund.handleRefundApi(new Request(url,{headers:{cookie:'mango_admin_session=synthetic-session'}}),url,s.env);
 return {status:res.status,...await res.json()};
}
async function atTime(iso,run) {
 const original=Date.now;Date.now=()=>Date.parse(iso);
 try{return await run();}finally{Date.now=original;}
}
// The visible count, settlement input, and selectable IDs must use one verified read.
for(const c of [
 {name:'attended earlier today',time:'09:00',role:'student',remaining:23},
 {name:'exact KST start',time:'10:00',remaining:23},
 {name:'one future minute',time:'10:01',remaining:24},
 {name:'future student attendance',time:'10:01',role:'student',remaining:23},
 {name:'future teacher attendance alone',time:'10:01',role:'teacher',remaining:24},
 {name:'cancelled future lesson',time:'10:01',state:'cancelled',remaining:23},
 {name:'completed future lesson',time:'10:01',state:'completed',remaining:23},
 {name:'KST midnight previous minute',date:'2027-01-03',time:'23:59',now:'2027-01-04T00:00:00+09:00',remaining:23},
 {name:'KST midnight next minute',time:'00:01',now:'2027-01-04T00:00:00+09:00',remaining:24},
]) await atTime(c.now||'2027-01-04T10:00:00+09:00',async()=>{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 const date=c.date||'2027-01-04';
 s.db.prepare('UPDATE class_schedules SET scheduled_date=?, start_time=?, status=? WHERE id=1').run(date,c.time,c.state||'active');
 if(c.role)s.db.prepare('INSERT INTO attendance(room_id,role) VALUES(?,?)').run('class-1-'+date.replaceAll('-',''),c.role);
 const reads=s.faults.lessonReads,before=providerCalls,r=await preview(s,o),p=r.preview;
 if(c.name==='attended earlier today')observations.attended_earlier_today=previewFields(p);
 check('consistent preview: '+c.name,r.status===200&&p.remaining_classes===c.remaining&&p.remaining_lessons.length===c.remaining
  &&p.suggest_basis.remaining_by_schedule===c.remaining&&p.suggest_basis.used_sessions===24-c.remaining
  &&p.suggested===360000-(24-c.remaining)*15000,p||r);
 check('one verified choice read and no provider: '+c.name,s.faults.lessonReads-reads===1&&providerCalls===before
  &&p.remaining_lessons.some(x=>x.id===1)===(c.remaining===24),{reads:s.faults.lessonReads-reads,p});
});
await atTime('2027-01-04T10:00:00+09:00',async()=>{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 s.db.exec("UPDATE class_schedules SET start_time='09:00' WHERE id=1; INSERT INTO attendance(room_id,role) VALUES('class-1-20270104','student');");
 const done=await refund(s,o,{confirm:true,refund_schedule_ids:[2,3]});
 const r=await preview(s,o),p=r.preview;
 observations.prior_refund2_plus_attended1=previewFields(p);
 check('prior refund2 plus attended1 yields21 remaining /1 used /315000',done.ok&&p.remaining_classes===21&&p.remaining_lessons.length===21
  &&p.suggest_basis.used_sessions===1&&p.suggested===315000,p||r);
 const snapshot=()=>JSON.stringify({schedules:s.db.prepare('SELECT * FROM class_schedules ORDER BY id').all(),orders:s.db.prepare('SELECT * FROM payment_orders').all(),refunds:s.db.prepare('SELECT * FROM payment_refunds').all()});
 let saved=snapshot();
 check('partial refund2 retains24 lineage rows and clean read-only audit',(await Audit.auditPaymentSchedules(s.env)).issues.length===0&&snapshot()===saved&&n(s,'class_schedules')===24);
 s.db.exec('DELETE FROM class_schedules WHERE id=24');saved=snapshot();
 const missing=(await Audit.auditPaymentSchedules(s.env)).issues[0];
 check('partial refund unrelated missing row is flagged without repair',missing?.actual_rows===23&&missing.active_rows===21
  &&missing.reasons.includes('schedule_count_mismatch_review')&&snapshot()===saved,missing);
 s.db.exec("INSERT INTO class_schedules(user_id,teacher_id,scheduled_date,start_time,duration_min,class_type,status,source,created_at) SELECT user_id,teacher_id,'2027-12-30','19:00',duration_min,class_type,'active',source,created_at FROM class_schedules WHERE id=23; INSERT INTO class_schedules(user_id,teacher_id,scheduled_date,start_time,duration_min,class_type,status,source,created_at) SELECT user_id,teacher_id,'2027-12-31','19:00',duration_min,class_type,'active',source,created_at FROM class_schedules WHERE id=23;");saved=snapshot();
 const extra=(await Audit.auditPaymentSchedules(s.env)).issues[0];
 check('partial refund unrelated extra row is flagged without repair',extra?.actual_rows===25&&extra.active_rows===23
  &&extra.reasons.includes('schedule_count_mismatch_review')&&snapshot()===saved,extra);
});
for(const fault of ['throw','missing_results','failed_result','missing_attendance_table']) {
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 if(fault==='missing_attendance_table')s.db.exec('ALTER TABLE attendance RENAME TO hidden_attendance');else s.faults.lessonReadFault=fault;
 const before=providerCalls,r=await preview(s,o);
 check(fault+' holds preview with503 and no guessed amounts',r.status===503&&r.error==='lesson_verification_unavailable'&&!r.preview,r);
 for(const body of [{refund_schedule_ids:[1,2]},{amount:360000},{confirm:true,refund_schedule_ids:[1,2]}]) {
  const attempted=await refund(s,o,body);
  check(fault+' blocks '+(body.confirm?'execution':body.amount?'full planning':'partial planning')+' before provider or refund record',attempted.status===503
   &&attempted.error==='lesson_verification_unavailable'&&providerCalls===before&&n(s,'payment_refunds')===0&&n(s,'class_schedules')===24,attempted);
 }
 if(fault==='missing_attendance_table')s.db.exec('ALTER TABLE hidden_attendance RENAME TO attendance');else s.faults.lessonReadFault='';
 const recovered=await preview(s,o),planned=await refund(s,o,{refund_schedule_ids:[1,2]});
 check(fault+' recovery returns verified24 and restores planning without provider',recovered.status===200&&recovered.preview.remaining_classes===24
  &&recovered.preview.remaining_lessons.length===24&&planned.dry_run&&providerCalls===before&&n(s,'payment_refunds')===0,{recovered,planned});
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 const noAuth=await refund(s,o,{},false);check('unauthorized refund rejected before provider',noAuth.status===401,noAuth);
 const before=providerCalls;
 const noIds=await refund(s,o,{confirm:true});check('partial class refund requires selected lessons',!noIds.ok&&noIds.error==='refund_lessons_required'&&providerCalls===before,noIds);
 const foreign=await refund(s,o,{confirm:true,refund_schedule_ids:[9999]});check('non-order lesson cannot be refunded',foreign.error==='refund_lesson_not_unused'&&providerCalls===before,foreign);
 const dup=await refund(s,o,{confirm:true,refund_schedule_ids:[1,1]});check('duplicate selected lesson IDs rejected',dup.error==='duplicate_refund_lessons',dup);
 const dry=await refund(s,o,{refund_schedule_ids:[1,2]});check('partial refund preview shows exact selected IDs without PG',dry.dry_run&&dry.will.refund_schedule_ids.join(',')==='1,2'&&providerCalls===before,dry);
 const done=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});
 check('selected partial refund cancels exactly2 and retains22',done.ok&&done.cancelled_classes===2&&s.db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE status='active'").get().n===22,done);
 check('partial refund preserves remaining enrollment active',s.db.prepare('SELECT status FROM enrollments').get().status==='active');
 check('partial refund persists selected IDs in existing audit basis',JSON.parse(s.db.prepare('SELECT basis FROM payment_refunds').get().basis).refund_schedule_ids.join(',')==='1,2');
 check('partial refund order stays partial_refunded',s.db.prepare('SELECT status FROM payment_orders').get().status==='partial_refunded');
 const nextPreview=await Refund.refundPreview(s.env,o.orderId);
 check('previously refunded unused lessons are not charged again as used',nextPreview.suggested===330000&&nextPreview.suggest_basis.used_sessions===0,nextPreview);
 check('allocated partial refund produces no false quota alert',(await Audit.auditPaymentSchedules(s.env)).issues.length===0);

 const twice=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});check('same unused lessons cannot be refunded twice',twice.error==='refund_lesson_not_unused',twice);
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 const r=s.db.prepare('SELECT * FROM class_schedules WHERE id=1').get();
 s.db.prepare('INSERT INTO attendance(room_id,role) VALUES(?,?)').run('class-1-'+r.scheduled_date.replaceAll('-',''),'student');
 const used=await refund(s,o,{confirm:true,refund_schedule_ids:[1]});check('lesson with actual attendance cannot be selected as unused',used.error==='refund_lesson_not_unused',used);
 s.db.exec("UPDATE class_schedules SET scheduled_date='2000-01-01' WHERE id=2");
 const past=await refund(s,o,{confirm:true,refund_schedule_ids:[2]});check('past class cannot be selected as future unused lesson',past.error==='refund_lesson_not_unused',past);
}

{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);const before=providerCalls;
 const replies=await Promise.all([refund(s,o,{confirm:true,refund_schedule_ids:[1,2]}),refund(s,o,{confirm:true,refund_schedule_ids:[1,2]})]);
 check('concurrent same-lesson refunds make exactly one provider call',providerCalls-before===1,{providerCalls:providerCalls-before,replies});
}

{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);s.faults.batch=1;
 const before=providerCalls,r=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});
 check('refund side-effect failure is surfaced with retained selected-ID log',r.ok&&r.warnings.length>0&&s.db.prepare('SELECT status FROM payment_refunds').get().status==='done',r);
 const again=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});
 check('failed class cancellation cannot trigger a second financial refund',again.error==='refund_lesson_not_unused'&&providerCalls-before===1,again);
 check('allocation-side-effect failure remains visible to admin audit',(await Audit.auditPaymentSchedules(s.env)).issues[0]?.reasons.includes('partial_refund_quota_review'));
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 const before=providerCalls;providerReplies=[async()=>{throw Error('injected PG disconnect after unknown outcome');}];
 const r=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});
 const again=await refund(s,o,{confirm:true,refund_schedule_ids:[3,4]});
 check('unknown PG refund outcome stays pending and blocks new refunds',r.needs_check&&again.error==='refund_in_progress'&&providerCalls-before===1,{r,again});
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 providerReplies=[async()=>Response.json({status:'PARTIAL_CANCELED',totalAmount:o.amount,balanceAmount:o.amount-30000})];
 await webhook(s,o);
 const row=s.db.prepare('SELECT status,refunded_amount FROM payment_orders').get(),p=await Refund.refundPreview(s.env,o.orderId);
 check('external partial refund preserves partial status and verified amount',row.status==='partial_refunded'&&row.refunded_amount===30000,row);
 check('external refund reduces maximum refundable balance',p.refundable_max===330000,p.refundable_max);
 check('external refund does not guess which lessons to cancel',s.db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE status='active'").get().n===24);
 providerReplies=[async()=>Response.json({status:'PARTIAL_CANCELED',totalAmount:o.amount})];await webhook(s,o);
 check('unverified external refund amount blocks further financial execution',(await Refund.refundPreview(s.env,o.orderId)).error==='refund_amount_unverified');
}

for(const weekly of [1,2,3,5]) for(const months of [1,3,6,12]) for(const minutes of [20,30,40]) {
 const s=fresh(),days=[1,2,3,4,5].slice(0,weekly),times=Object.fromEntries(days.map(d=>[d,'19:00'])),timesMin=Object.fromEntries(days.map(d=>[d,1140]));
 const o=await order(s,'new',{weekly,months,minutes,days,times,timesMin});await confirm(s,o);
 const expected=weekly*4*months,amount=Math.floor((60000*weekly*months*(minutes/20)*(months===12?.9:months===6?.95:1))/10)*10;
 check('catalog matrix '+weekly+'weekly/'+months+'months/'+minutes+'min agrees price/count',o.summary?.sessions===expected&&o.amount===amount&&n(s,'class_schedules')===expected,{o,actual:n(s,'class_schedules')});
}
{
 const s=fresh(),o=await order(s),before=providerCalls;const r=await confirm(s,{...o,amount:o.amount/2});
 check('partial amount never calls provider or unlocks lessons',r.error==='amount_mismatch'&&providerCalls===before&&n(s,'class_schedules')===0,r);
}
{
 const s=fresh(),o=await order(s);providerStatus='WAITING_FOR_DEPOSIT';await confirm(s,o);providerStatus='DONE';
 check('unfunded virtual account creates no lessons',s.db.prepare('SELECT status FROM payment_orders').get().status==='await_deposit'&&n(s,'class_schedules')===0);
 await webhook(s,o);check('full verified deposit then creates24 lessons',n(s,'class_schedules')===24);
}
{
 const base={weekly:2,months:3,minutes:20,start_date:'2027-01-04',teacher_id:'T1',days:[1,3],time:'19:00'};
 check('fractional weekdays are rejected before order creation',!!E.enrollParse({...base,days:[1.5,3.5]}).error);
 check('nonexistent calendar date is rejected before order creation',E.enrollParse({...base,start_date:'2027-02-30'}).error==='bad_start_date');
}
{
 const s=fresh(),o=await order(s);s.faults.delayedSource=true;await Promise.all([confirm(s,o),confirm(s,o)]);
 check('delayed duplicate source response cannot shift into extra24 schedules',n(s,'class_schedules')===24,n(s,'class_schedules'));
}
// Independent review regressions: actual SQL and mocked provider responses.
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 providerReplies=[async()=>Response.json({status:'PARTIAL_CANCELED',totalAmount:o.amount,balanceAmount:o.amount-30000})];await webhook(s,o);
 const r=await refund(s,o,{confirm:true,record_only:true,refund_schedule_ids:[1,2]});
 check('external record-only allocation never double-adds known refund',r.ok&&s.db.prepare('SELECT refunded_amount FROM payment_orders').get().refunded_amount===30000&&(await Refund.refundPreview(s.env,o.orderId)).refundable_max===330000,r);
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});
 providerReplies=[async()=>Response.json({status:'PARTIAL_CANCELED',totalAmount:o.amount,balanceAmount:o.amount-60000})];await webhook(s,o);
 check('additional external refund requires its own allocation audit',(await Audit.auditPaymentSchedules(s.env)).issues[0]?.reasons.includes('unallocated_refund_amount_review'));
}
{
 const s=fresh(),o=await order(s);refundFixture(s);let unblock,entered;
 const held=new Promise(r=>unblock=r),waiting=new Promise(r=>entered=r);
 providerReplies=[async()=>{entered();await held;return Response.json({status:'DONE',totalAmount:o.amount});}];
 const late=confirm(s,o);await waiting;await confirm(s,o);await refund(s,o,{confirm:true,amount:o.amount});unblock();await late;
 check('stale DONE confirmation never overwrites completed full refund',s.db.prepare('SELECT status FROM payment_orders').get().status==='refunded');
}
{
 const s=fresh(),o=await order(s);let unblock,entered;const held=new Promise(r=>unblock=r),waiting=new Promise(r=>entered=r);
 providerReplies=[async()=>{entered();await held;return Response.json({status:'DONE',totalAmount:o.amount/2});}];
 const late=webhook(s,o);await waiting;await confirm(s,o);unblock();await late;
 check('stale amount mismatch webhook cannot overwrite valid paid state',s.db.prepare('SELECT status FROM payment_orders').get().status==='paid'&&n(s,'class_schedules')===24);
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);const before=providerCalls;
 providerReplies=[async()=>Response.json({code:'PROVIDER_ERROR'},{status:500})];
 const r=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});const again=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});
 check('ambiguous HTTP500 retains original claim and prevents another provider key',r.needs_check&&again.error==='refund_in_progress'&&providerCalls-before===1&&s.db.prepare('SELECT status FROM payment_refunds').get().status==='requested',{r,again});
}
{
 const s=fresh(),o=await order(s);providerReplies=[async()=>Response.json({status:'DONE',totalAmount:o.amount/2})];const r=await confirm(s,o);
 check('provider half-total DONE never unlocks full lessons',!r.ok&&n(s,'class_schedules')===0&&s.db.prepare('SELECT status FROM payment_orders').get().status!=='paid',r);
}


{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 const current=s.env.DB.prepare;
 s.env.DB.prepare=(sql)=>{let st=current(sql);if(!sql.includes('INSERT INTO payment_refunds'))return st;const bind=st.bind;st.bind=(...args)=>{const bound=bind(...args),first=bound.first;bound.first=async()=>{const lesson=s.db.prepare('SELECT scheduled_date FROM class_schedules WHERE id=1').get();s.db.prepare('INSERT INTO attendance(room_id,role) VALUES(?,?)').run('class-1-'+lesson.scheduled_date.replaceAll('-',''),'student');return first();};return bound;};return st;};
 const before=providerCalls,r=await refund(s,o,{confirm:true,refund_schedule_ids:[1]});
 check('attendance changing before atomic refund claim blocks financial request',r.error==='refund_state_changed'&&providerCalls===before&&s.db.prepare('SELECT status FROM class_schedules WHERE id=1').get().status==='active',r);
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);s.db.exec('DELETE FROM class_schedules');const before=providerCalls;
 const r=await confirm(s,{...o,amount:1});
 check('paid replay still validates amount before downstream repair',r.error==='amount_mismatch'&&n(s,'class_schedules')===0&&providerCalls===before,r);
}
// Different boundary amounts, webhook timing, and administrator rendering.
for (const refunded of [30000,350000,360000]) {
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 providerReplies=[async()=>Response.json({status:refunded===o.amount?'CANCELED':'PARTIAL_CANCELED',totalAmount:o.amount,balanceAmount:o.amount-refunded})]; await webhook(s,o);
 const before=providerCalls, r=await refund(s,o,{confirm:true,record_only:true,amount:refunded,refund_schedule_ids:[1,2]});
 check('external record boundary '+refunded+' does not double-account or call PG',r.ok&&s.db.prepare('SELECT refunded_amount FROM payment_orders').get().refunded_amount===refunded&&providerCalls===before,r);
 if(refunded<o.amount) {
  const again=await refund(s,o,{confirm:true,record_only:true,amount:1000,refund_schedule_ids:[3]});
  check('recorded external boundary '+refunded+' cannot be recorded a second time',again.error==='external_refund_verification_required'&&providerCalls===before,again);
 }
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});
 providerReplies=[async()=>Response.json({status:'PARTIAL_CANCELED',totalAmount:o.amount,balanceAmount:o.amount-60000})];await webhook(s,o);
 const r=await refund(s,o,{confirm:true,record_only:true,refund_schedule_ids:[3,4]});
 check('external delta after local refund reconciles money and separate selected lessons',r.ok&&s.db.prepare('SELECT refunded_amount FROM payment_orders').get().refunded_amount===60000&&(await Audit.auditPaymentSchedules(s.env)).issues.length===0,r);
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 providerReplies=[async()=>Response.json({status:'PARTIAL_CANCELED',totalAmount:o.amount,balanceAmount:o.amount-30000})];await webhook(s,o);
 const rs=await Promise.all([refund(s,o,{confirm:true,record_only:true,refund_schedule_ids:[1,2]}),refund(s,o,{confirm:true,record_only:true,refund_schedule_ids:[3,4]})]);
 check('concurrent external allocations cannot consume the verified delta twice',rs.filter(r=>r.ok).length===1&&s.db.prepare('SELECT SUM(refund_amount) amount FROM payment_refunds').get().amount===30000,rs);
}
for (const status of [408,429,503]) {
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);const before=providerCalls;
 providerReplies=[async()=>Response.json({code:'UNKNOWN_OUTCOME'},{status})];const r=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});const again=await refund(s,o,{confirm:true,refund_schedule_ids:[3,4]});
 check('HTTP'+status+' refund retains one claim pending reconciliation',r.needs_check&&again.error==='refund_in_progress'&&providerCalls-before===1,{r,again});
}
for (const payload of [{status:'DONE'}, {status:'DONE',totalAmount:NaN}, {status:'DONE',totalAmount:360000,orderId:'another-order'}, {status:'DONE',totalAmount:360000,paymentKey:'another-key'}]) {
 const s=fresh(),o=await order(s);providerReplies=[async()=>Response.json(payload)];const r=await confirm(s,o);
 check('unverified provider amount/identity never grants lessons '+JSON.stringify(payload),r.error==='provider_payment_mismatch'&&n(s,'class_schedules')===0,r);
}
{
 const s=fresh(),o=await order(s);refundFixture(s);let unblock,entered;const held=new Promise(r=>unblock=r),waiting=new Promise(r=>entered=r);
 providerReplies=[async()=>{entered();await held;return Response.json({status:'DONE',totalAmount:o.amount});}];
 const late=webhook(s,o);await waiting;await confirm(s,o);await refund(s,o,{confirm:true,amount:o.amount});unblock();await late;
 check('stale DONE webhook after full refund preserves terminal state and cancelled classes',s.db.prepare('SELECT status FROM payment_orders').get().status==='refunded'&&s.db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE status='active'").get().n===0);
}
{
 const s=fresh(),o=await order(s);let unblock,entered;const held=new Promise(r=>unblock=r),waiting=new Promise(r=>entered=r);
 providerReplies=[async()=>{entered();await held;return Response.json({status:'WAITING_FOR_DEPOSIT',totalAmount:o.amount});}];
 const late=confirm(s,o);await waiting;await confirm(s,o);unblock();await late;
 check('late virtual-account waiting response cannot downgrade paid',s.db.prepare('SELECT status FROM payment_orders').get().status==='paid'&&n(s,'class_schedules')===24);
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);await refund(s,o,{confirm:true,amount:o.amount});
 providerReplies=[async()=>Response.json({status:'PARTIAL_CANCELED',totalAmount:o.amount,balanceAmount:o.amount-30000})];await webhook(s,o);
 check('stale external partial snapshot cannot downgrade full refund or total',s.db.prepare('SELECT status FROM payment_orders').get().status==='refunded'&&s.db.prepare('SELECT refunded_amount FROM payment_orders').get().refunded_amount===o.amount);
}
{
 const html=readFileSync(join(root,'cloudflare-deploy/public/admin/send-pay-link.html'),'utf8');
 const start=html.indexOf('        var a = d.audit'),end=html.indexOf("        g('auditOut').innerHTML = html;",start)+"        g('auditOut').innerHTML = html;".length;
 const render=new Function('d','g','esc',html.slice(start,end));
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const node={innerHTML:''}, g=()=>node;
 render({audit:{summary:{anomalies:1},scheduleIssues:[{order_id:'review-order',uid:'A',student_name:'<script>student</script>',payment_status:'partial_refunded',expected_sessions:24,actual_rows:24,active_rows:22,schedule_ids:[1,2],reasons:['unallocated_refund_amount_review']}]}},g,esc);
 check('actual administrator render includes actionable schedule issue and escapes names',node.innerHTML.includes('review-order')&&node.innerHTML.includes('unallocated_refund_amount_review')&&node.innerHTML.includes('22')&&!node.innerHTML.includes('<script>'),node.innerHTML);
 render({audit:{summary:{anomalies:0},scheduleAuditError:'injected database outage'}},g,esc);
 check('audit failure is visible and cannot produce a clean-result banner',node.innerHTML.includes('점검 실패')&&!node.innerHTML.includes('✅ 이상 없음'),node.innerHTML);
 render({audit:{summary:{anomalies:0},scheduleTruncated:true,scheduleChecked:500}},g,esc);
 check('truncated audit shows bounded scope instead of claiming overall clean',node.innerHTML.includes('500')&&node.innerHTML.includes('추가 점검')&&!node.innerHTML.includes('✅ 이상 없음'),node.innerHTML);
}


for (const amount of [30000,180000]) {
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);s.db.exec('UPDATE payment_orders SET payment_key=NULL');
 const before=providerCalls, rs=await Promise.all([refund(s,o,{confirm:true,record_only:true,amount,refund_schedule_ids:[1,2]}),refund(s,o,{confirm:true,record_only:true,amount,refund_schedule_ids:[3,4]})]);
 const row=s.db.prepare('SELECT status,refunded_amount FROM payment_orders').get(), sum=s.db.prepare("SELECT SUM(refund_amount) total FROM payment_refunds WHERE status='done'").get().total;
 check('concurrent manual ledger '+amount+' reflects both completed records without PG',rs.every(r=>r.ok)&&row.refunded_amount===sum&&sum===amount*2&&providerCalls===before&&row.status===(sum>=o.amount?'refunded':'partial_refunded'),{rs,row,sum});
}


for (const payload of [{}, {status:'DONE'}, {status:'PARTIAL_CANCELED',totalAmount:360000,balanceAmount:360000}, {status:'PARTIAL_CANCELED',totalAmount:360000,balanceAmount:null}]) {
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);const before=providerCalls;
 providerReplies=[async()=>Response.json(payload)];const r=await refund(s,o,{confirm:true,refund_schedule_ids:[1,2]});const again=await refund(s,o,{confirm:true,refund_schedule_ids:[3,4]});
 check('unverified HTTP200 refund preserves original claim '+JSON.stringify(payload),r.needs_check&&again.error==='refund_in_progress'&&providerCalls-before===1&&s.db.prepare("SELECT COUNT(*) n FROM class_schedules WHERE status='active'").get().n===24,{r,again});
}

{
 const s=fresh(),o=await order(s);s.faults.batch=1;await confirm(s,o);
 check('generation failure retains durable pending provenance',s.db.prepare('SELECT fail_reason FROM payment_orders').get().fail_reason==='schedule_generation_pending:v1'&&n(s,'class_schedules')===0);
 providerReplies=[async()=>Response.json({status:'DONE',totalAmount:o.amount/2})];await webhook(s,o);
 check('stale mismatched webhook preserves pending generation provenance',s.db.prepare('SELECT fail_reason FROM payment_orders').get().fail_reason==='schedule_generation_pending:v1');
 await confirm(s,o);
 check('successful schedule batch atomically clears only its own pending marker',n(s,'class_schedules')===24&&s.db.prepare('SELECT fail_reason FROM payment_orders').get().fail_reason===null);
 s.db.exec('DELETE FROM class_schedules');const before=providerCalls;await confirm(s,o);await webhook(s,o);
 check('valid paid replay never recreates deliberately deleted completed lineage',n(s,'class_schedules')===0&&providerCalls-before===1);
 check('unmarked all-zero lineage remains actionable for administrator',(await Audit.auditPaymentSchedules(s.env)).issues[0]?.reasons.includes('paid_without_schedules'));
}
{
 const s=fresh(),o=await order(s);s.db.exec("UPDATE payment_orders SET status='paid',payment_key='synthetic-key',paid_at=1");await confirm(s,o);
 check('legacy paid missing schedules without provenance is reviewed instead of auto-generated',n(s,'class_schedules')===0);
}
{
 const s=fresh(),o=await order(s);await confirm(s,o);s.db.exec("UPDATE payment_orders SET fail_reason='operator_review_required'");await confirm(s,o);
 check('paid replay preserves unrelated warning marker',s.db.prepare('SELECT fail_reason FROM payment_orders').get().fail_reason==='operator_review_required');
}


for (const balance of [null, undefined, -1, 400000]) {
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 providerReplies=[async()=>Response.json({status:'PARTIAL_CANCELED',totalAmount:o.amount,balanceAmount:balance})];await webhook(s,o);
 check('unverified external balance blocks further financial refund '+String(balance),(await Refund.refundPreview(s.env,o.orderId)).error==='refund_amount_unverified'&&s.db.prepare('SELECT refunded_amount FROM payment_orders').get().refunded_amount===0);
}

function billingFixture(s,plan='ai_content') {
 s.db.exec(`DROP TABLE subscriptions; CREATE TABLE subscriptions(id INTEGER PRIMARY KEY,user_id TEXT,student_name TEXT,plan TEXT,amount INTEGER,status TEXT,next_billing_at INTEGER,last_billed_at INTEGER,created_at INTEGER,updated_at INTEGER,billing_key TEXT,customer_key TEXT,fail_count INTEGER);`);
 s.db.prepare(`INSERT INTO subscriptions VALUES(1,'A','Synthetic A',?,10000,'active',1,null,1,1,'synthetic-billing','synthetic-customer',0)`).run(plan);
 return s.db.prepare('SELECT * FROM subscriptions WHERE id=1').get();
}
for (const plan of ['ai_content','auto_renew']) {
 const s=fresh();await E.ensureEnrollTables(s.env);if(plan==='auto_renew'){const o=await order(s);await confirm(s,o);} const sub=billingFixture(s,plan),before=providerCalls;
 providerReplies=[async()=>{throw Error('billing result lost after provider received request');}];
 const first=await Pay.chargeSubscriptionOnce(s.env,sub),second=await Pay.chargeSubscriptionOnce(s.env,s.db.prepare('SELECT * FROM subscriptions').get());
 check(plan+' unknown billing outcome blocks a new order and charge',!first.ok&&second.error==='billing_reconciliation_required'&&providerCalls-before===1,{first,second,calls:providerCalls-before});
}
{
 const s=fresh();await E.ensureEnrollTables(s.env);const sub=billingFixture(s);providerReplies=[async()=>Response.json({status:'DONE',paymentKey:'synthetic-key',totalAmount:5000})];
 const r=await Pay.chargeSubscriptionOnce(s.env,sub);
 check('AI subscription provider half-total never grants full paid pass',!r.ok&&(!s.db.prepare("SELECT name FROM sqlite_master WHERE name='enrollments'").get()||n(s,'enrollments')===0),r);
}

for (const plan of ['ai_content','auto_renew']) {
 const s=fresh();await E.ensureEnrollTables(s.env);if(plan==='auto_renew'){const o=await order(s);await confirm(s,o);}const sub=billingFixture(s,plan);
 providerReplies=[async()=>{throw Error('response lost');}];await Pay.chargeSubscriptionOnce(s.env,sub);
 const pending=s.db.prepare("SELECT * FROM payment_orders WHERE status='pending'").get();
 const a=await Pay.runPaymentAudit(s.env,{sms:false});
 check(plan+' unknown billing is actionable by order/student/subscription',a.billingPending.length===1&&a.billingPending[0].order_id===pending.order_id&&a.billingPending[0].uid==='A',a);
 providerReplies=[async()=>Response.json({status:'DONE',totalAmount:pending.amount,paymentKey:'synthetic-key',orderId:pending.order_id})];await webhook(s,{orderId:pending.order_id});
 const state=s.db.prepare('SELECT status,fail_reason FROM payment_orders WHERE order_id=?').get(pending.order_id),subscription=s.db.prepare('SELECT next_billing_at FROM subscriptions').get();
 check(plan+' verified webhook resolves pending billing without another charge',state.status==='paid'&&state.fail_reason===null&&subscription.next_billing_at>Date.now(),{state,subscription});
}
for (const status of [500,200]) {
 const s=fresh();await E.ensureEnrollTables(s.env);const sub=billingFixture(s),before=providerCalls;
 providerReplies=[async()=>Response.json({status:'UNKNOWN',code:status===500?'PROVIDER_ERROR':undefined},{status})];
 const r=await Pay.chargeSubscriptionOnce(s.env,sub),again=await Pay.chargeSubscriptionOnce(s.env,sub);
 check('billing HTTP'+status+' unknown response preserves original order',!r.ok&&again.error==='billing_reconciliation_required'&&providerCalls-before===1&&n(s,'payment_orders')===1,{r,again});
}
{
 const s=fresh();await E.ensureEnrollTables(s.env);const sub=billingFixture(s),before=providerCalls;
 providerReplies=[async()=>Response.json({code:'REJECT_CARD_PAYMENT',message:'synthetic definite card decline'},{status:400})];
 const r=await Pay.chargeSubscriptionOnce(s.env,sub),again=await Pay.chargeSubscriptionOnce(s.env,s.db.prepare('SELECT * FROM subscriptions').get());
 check('definitive declined card can retry without retaining an unknown claim',!r.ok&&again.ok&&providerCalls-before===2,{r,again});
}


{
 const s=fresh(),o=await order(s);await confirm(s,o);const sub=billingFixture(s,'auto_renew'),before=n(s,'class_schedules');
 providerReplies=[async()=>Response.json({status:'DONE',paymentKey:'synthetic-key',totalAmount:60000})];const r=await Pay.chargeSubscriptionOnce(s.env,sub);
 check('video renewal provider half-total never grants extra lessons',!r.ok&&n(s,'class_schedules')===before&&s.db.prepare("SELECT COUNT(*) n FROM payment_orders WHERE status='pending'").get().n===1,r);
}
{
 const html=readFileSync(join(root,'cloudflare-deploy/public/admin/send-pay-link.html'),'utf8'),start=html.indexOf('        var a = d.audit'),end=html.indexOf("        g('auditOut').innerHTML = html;",start)+"        g('auditOut').innerHTML = html;".length;
 const render=new Function('d','g','esc',html.slice(start,end)),node={innerHTML:''};
 render({audit:{summary:{anomalies:1},billingPending:[{order_id:'billing-review-1',uid:'A',student_name:'Synthetic A',amount:10000,fail_reason:'billing_pending:v1:1'}]}},()=>node,v=>String(v));
 check('actual admin rendering identifies unresolved billing and prohibits silent expiry claim',node.innerHTML.includes('billing-review-1')&&node.innerHTML.includes('재청구 보류')&&!node.innerHTML.includes('✅ 이상 없음'),node.innerHTML);
}

// Independent billing lifecycle regressions.
{
 const s=fresh();await E.ensureEnrollTables(s.env);const sub=billingFixture(s),before=providerCalls;
 providerReplies=[async()=>{throw Error('unknown billed outcome');}];await Pay.chargeSubscriptionOnce(s.env,sub);
 const pending=s.db.prepare("SELECT * FROM payment_orders WHERE status='pending'").get();
 const bad=await confirm(s,{orderId:pending.order_id,amount:1});
 const afterBad=s.db.prepare('SELECT status,fail_reason FROM payment_orders WHERE order_id=?').get(pending.order_id);
 const retry=await Pay.chargeSubscriptionOnce(s.env,s.db.prepare('SELECT * FROM subscriptions').get());
 check('ordinary invalid confirm cannot erase a pending billing claim',bad.error==='billing_reconciliation_required'&&afterBad.status==='pending'&&retry.error==='billing_reconciliation_required'&&providerCalls-before===1,{bad,afterBad,retry});
}
{
 const s=fresh();await E.ensureEnrollTables(s.env);const sub=billingFixture(s),before=providerCalls;
 providerReplies=[async()=>{throw Error('unknown billed outcome');}];await Pay.chargeSubscriptionOnce(s.env,sub);
 s.db.exec("UPDATE subscriptions SET status='replaced'; INSERT INTO subscriptions SELECT 2,user_id,student_name,plan,amount,'active',1,NULL,created_at+70000,updated_at,billing_key,customer_key,0,NULL,teacher_id,weekly,minutes FROM subscriptions WHERE id=1");
 const retry=await Pay.chargeSubscriptionOnce(s.env,s.db.prepare('SELECT * FROM subscriptions WHERE id=2').get());
 check('replacement subscription retains same-student same-product pending billing protection',retry.error==='billing_reconciliation_required'&&providerCalls-before===1&&n(s,'payment_orders')===1,retry);
}
{
 const s=fresh();await E.ensureEnrollTables(s.env);const sub=billingFixture(s);let entered,unblock;const waiting=new Promise(r=>entered=r),held=new Promise(r=>unblock=r);
 providerReplies=[async()=>{entered();await held;return Response.json({code:'REJECT_CARD_PAYMENT',message:'stale decline'},{status:400});}];
 const delayed=Pay.chargeSubscriptionOnce(s.env,sub);await waiting;const pending=s.db.prepare("SELECT * FROM payment_orders WHERE status='pending'").get();
 providerReplies=[async()=>Response.json({status:'DONE',totalAmount:pending.amount,paymentKey:'synthetic-key',orderId:pending.order_id})];await webhook(s,{orderId:pending.order_id});
 const afterWebhook=s.db.prepare('SELECT next_billing_at,fail_count FROM subscriptions').get();unblock();await delayed;
 const afterDelayed=s.db.prepare('SELECT next_billing_at,fail_count FROM subscriptions').get();
 check('stale decline cannot bump failures or bring verified next-billing date forward',afterDelayed.fail_count===afterWebhook.fail_count&&afterDelayed.next_billing_at===afterWebhook.next_billing_at,{afterWebhook,afterDelayed});
}


for (const plan of ['ai_content','auto_renew']) {
 const s=fresh();await E.ensureEnrollTables(s.env);if(plan==='auto_renew'){const o=await order(s);await confirm(s,o);}const sub=billingFixture(s,plan);

 // Let schema setup happen on both calls; the two subscription leases are deliberately separate.
 s.db.exec("INSERT INTO subscriptions SELECT 2,user_id,student_name,plan,amount,status,next_billing_at,last_billed_at,created_at,updated_at,billing_key,customer_key,fail_count FROM subscriptions WHERE id=1");
 const other=s.db.prepare('SELECT * FROM subscriptions WHERE id=2').get(),before=providerCalls;
 const rs=await Promise.all([Pay.chargeSubscriptionOnce(s.env,sub),Pay.chargeSubscriptionOnce(s.env,other)]);
 check(plan+' concurrent distinct subscriptions admit only one same-product charge',providerCalls-before===1&&rs.filter(r=>r.ok).length===1,{rs,calls:providerCalls-before});
}
{
 const s=fresh();await E.ensureEnrollTables(s.env);const sub=billingFixture(s);providerReplies=[async()=>{throw Error('unknown');}];await Pay.chargeSubscriptionOnce(s.env,sub);
 const pending=s.db.prepare("SELECT * FROM payment_orders WHERE status='pending'").get(),before=providerCalls;
 providerReplies=[async()=>Response.json({status:'DONE',totalAmount:1})];await webhook(s,{orderId:pending.order_id});
 const retry=await Pay.chargeSubscriptionOnce(s.env,sub);
 check('mismatched verification webhook cannot erase pending billing protection',retry.error==='billing_reconciliation_required'&&providerCalls-before===1&&s.db.prepare('SELECT status FROM payment_orders').get().status==='pending',retry);
}

{
 const s=fresh(),o=await order(s);await confirm(s,o);const sub=billingFixture(s,'auto_renew');let entered,unblock;const waiting=new Promise(r=>entered=r),held=new Promise(r=>unblock=r);
 providerReplies=[async()=>{entered();await held;return Response.json({code:'REJECT_CARD_PAYMENT',message:'stale renewal decline'},{status:400});}];
 const delayed=Pay.chargeSubscriptionOnce(s.env,sub);await waiting;const pending=s.db.prepare("SELECT * FROM payment_orders WHERE status='pending'").get();
 providerReplies=[async()=>Response.json({status:'DONE',totalAmount:pending.amount,paymentKey:'synthetic-key',orderId:pending.order_id})];await webhook(s,{orderId:pending.order_id});
 const afterWebhook=s.db.prepare('SELECT next_billing_at,fail_count FROM subscriptions').get();unblock();await delayed;
 const afterDelayed=s.db.prepare('SELECT next_billing_at,fail_count FROM subscriptions').get();
 check('video renewal stale decline preserves verified billing date and failure count',afterDelayed.fail_count===afterWebhook.fail_count&&afterDelayed.next_billing_at===afterWebhook.next_billing_at,{afterWebhook,afterDelayed});
}

for(const plan of ['ai_content','auto_renew']) {
 const s=fresh();await E.ensureEnrollTables(s.env);if(plan==='auto_renew'){const o=await order(s);await confirm(s,o);}const sub=billingFixture(s,plan);
 s.db.exec("INSERT INTO subscriptions SELECT 2,user_id,student_name,plan,amount,status,next_billing_at,last_billed_at,created_at,updated_at,billing_key,customer_key,fail_count FROM subscriptions WHERE id=1");
 const other=s.db.prepare('SELECT * FROM subscriptions WHERE id=2').get(),before=providerCalls;
 let reads=0,release;const held=new Promise(r=>release=r),orig=s.env.DB.prepare;
 s.env.DB.prepare=sql=>{const st=orig(sql);if(!sql.includes("SELECT order_id FROM payment_orders WHERE uid=? AND program=?"))return st;const bind=st.bind;st.bind=(...args)=>{const b=bind(...args),f=b.first;b.first=async()=>{const snapshot=await f();if(++reads===2)await held;return snapshot;};return b;};return st;};
 const first=Pay.chargeSubscriptionOnce(s.env,sub),second=Pay.chargeSubscriptionOnce(s.env,other);const a=await first;release();const b=await second;
 check(plan+' delayed duplicate subscription snapshot still makes only one charge',providerCalls-before===1&&a.ok&&b.error==='already_charging',{a,b,calls:providerCalls-before});
}


// The final SQL write must repeat unused eligibility, not trust the prior read.
for (const changed of ['attendance','start_time']) {
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);const before=providerCalls,originalBatch=s.env.DB.batch;let injected=false;
 s.env.DB.batch=async stmts=>{
  if(!injected){injected=true;
   if(changed==='attendance'){
    const lesson=s.db.prepare('SELECT scheduled_date FROM class_schedules WHERE id=1').get();
    s.db.prepare('INSERT INTO attendance(room_id,role) VALUES(?,?)').run('class-1-'+lesson.scheduled_date.replaceAll('-',''),'student');
   } else s.db.exec("UPDATE class_schedules SET scheduled_date='2000-01-01',start_time='00:00' WHERE id=1");
  }
  return originalBatch(stmts);
 };
 const r=await refund(s,o,{confirm:true,refund_schedule_ids:[1]});
 const issue=(await Audit.auditPaymentSchedules(s.env)).issues[0],again=await refund(s,o,{confirm:true,refund_schedule_ids:[1]});
 check('final cancellation CAS detects '+changed+' change after eligibility read',injected&&r.ok&&r.cancelled_classes===0&&r.warnings.length>0
  &&s.db.prepare('SELECT status FROM class_schedules WHERE id=1').get().status==='active'
  &&s.db.prepare('SELECT status FROM payment_refunds').get().status==='done'
  &&issue?.reasons.includes('partial_refund_quota_review')&&again.error==='refund_lesson_not_unused'&&providerCalls-before===1,
  {r,issue,again,calls:providerCalls-before});
}

// Exercise the actual refund page script without a browser. This checks state only,
// not DOM rendering/layout; the separate Chromium fixture remains required for that.
{
 const s=fresh(),o=await order(s);await confirm(s,o);refundFixture(s);
 const nodes=new Map(),dialogs=[];let posts=0,hold=null,transportFailure=false;
 const node=id=>{
  if(!nodes.has(id)){
   const classes=new Set(['pv-card','confirm-box'].includes(id)?['hide']:[]),listeners=new Map();
   nodes.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,checked:false,focus(){},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
    addEventListener:(e,fn)=>{const list=listeners.get(e)||[];list.push(fn);listeners.set(e,list);},
    querySelectorAll:selector=>selector==='input:checked'?[{value:'1'},{value:'2'}]:[],
    fire:(e='click')=>{for(const fn of listeners.get(e)||[])fn({});}});
  }
  return nodes.get(id);
 };
 const document={documentElement:{lang:'ko'},getElementById:node};
 const html=readFileSync(process.env.INTEGRITY_REFUND_UI_SRC||join(root,'cloudflare-deploy/public/admin/refunds.html'),'utf8');
 const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('var current = null'))?.[1];
 if(!script)throw Error('refund page inline script not found');
 runInNewContext(script,{document,alert:m=>dialogs.push(String(m)),console,fetch:async(path,init={})=>{
  if(init.method==='POST')posts++;
  if(transportFailure&&path.includes('refund-preview'))throw Error('injected disconnected preview');
  const gate=hold&&path.includes(hold.path)?hold:null;if(gate)hold=null;
  const url=new URL(path,'https://offline.invalid'),res=await Refund.handleRefundApi(new Request(url,{...init,headers:{...init.headers,cookie:'mango_admin_session=synthetic-session'}}),url,s.env);
  if(gate){gate.entered();await gate.waiting;}
  return res;
 }});
 const flush=()=>new Promise(r=>setImmediate(r));
 const click=async id=>{node(id).fire();await flush();};
 const defer=path=>{let entered,release;const started=new Promise(r=>entered=r),waiting=new Promise(r=>release=r);hold={path,entered,waiting};return{started,release};};
 node('q-order').value=o.orderId;node('f-reason').value='Synthetic UI state test';await click('btn-load');
 check('actual page script initially accepts a verified preview',!node('pv-card').classList.contains('hide')&&!node('btn-dry').disabled&&node('f-amount').value===360000);
 node('f-amount').value=30000;await click('btn-dry');node('f-typed').value='환불';node('f-typed').fire('input');
 check('actual page script opens a valid confirmation',!node('confirm-box').classList.contains('hide')&&!node('btn-run').disabled);
 s.faults.lessonReadFault='throw';await click('btn-load');const before=posts;await click('btn-run');await click('btn-dry');
 check('actual page script invalidates current and plan on verification failure',node('pv-card').classList.contains('hide')&&node('confirm-box').classList.contains('hide')&&node('btn-dry').disabled&&node('btn-run').disabled&&posts===before&&String(dialogs.at(-1)||'').includes('미사용 수업을 확인하지 못해'));
 document.documentElement.lang='en';await click('btn-load');
 check('actual page script uses English verification hold',String(dialogs.at(-1)||'').includes('unused lessons could not be verified'));
 s.faults.lessonReadFault='';await click('btn-load');
 check('actual page script recovers after temporary read failure',!node('pv-card').classList.contains('hide')&&!node('btn-dry').disabled&&node('f-amount').value===360000);
 transportFailure=true;await click('btn-load');const beforeTransport=posts;await click('btn-dry');
 check('actual page script invalidates old preview on transport failure',node('pv-card').classList.contains('hide')&&node('btn-dry').disabled&&posts===beforeTransport);transportFailure=false;
 await click('btn-load');const old=defer('refund-preview');node('btn-load').fire();await old.started;s.faults.lessonReadFault='throw';await click('btn-load');old.release();await flush();
 check('actual page script discards older success after newer failed load',node('pv-card').classList.contains('hide')&&node('btn-dry').disabled);
 s.faults.lessonReadFault='';await click('btn-load');node('f-amount').value=30000;const oldPlan=defer('/api/pay/admin/refund');node('btn-dry').fire();await oldPlan.started;s.faults.lessonReadFault='throw';await click('btn-load');oldPlan.release();await flush();
 check('actual page script discards old planning response after failed reload',node('pv-card').classList.contains('hide')&&node('confirm-box').classList.contains('hide')&&node('btn-run').disabled);
 s.faults.lessonReadFault='';await click('btn-load');node('f-amount').value=30000;s.faults.lessonReadFault='throw';await click('btn-dry');
 check('actual page script holds planning when revalidation fails',node('pv-card').classList.contains('hide')&&node('btn-dry').disabled&&node('btn-run').disabled&&String(dialogs.at(-1)||'').includes('unused lessons could not be verified')&&n(s,'payment_refunds')===0);
 s.faults.lessonReadFault='';await click('btn-load');node('f-amount').value=30000;await click('btn-dry');node('f-typed').value='환불';node('f-typed').fire('input');s.faults.lessonReadFault='throw';await click('btn-run');
 check('actual page script requires reload after execution-time verification failure',node('pv-card').classList.contains('hide')&&node('btn-dry').disabled&&node('btn-run').disabled&&String(dialogs.at(-1)||'').includes('unused lessons could not be verified')&&n(s,'payment_refunds')===0);
}

console.log(JSON.stringify({pass,fail,providerCalls,liveTransactions:0}));
if(process.env.INTEGRITY_EVIDENCE_FILE)writeFileSync(process.env.INTEGRITY_EVIDENCE_FILE,JSON.stringify({synthetic:true,liveTransactions:0,...observations},null,2)+'\n');
process.exitCode = fail ? 1 : 0;

export { fresh, order, confirm, refundFixture, Refund };
