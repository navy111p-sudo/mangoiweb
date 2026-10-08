#!/usr/bin/env node
/** Runs the COMPLETE proposed TS module against real, local SQLite.
 * Synthetic state only. It does NOT claim production routes enforce this contract. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { createSandboxStore, canonical } from '../sandbox/student-entitlements/store.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'entitlement-contract-'));
process.on('exit', () => rmSync(temp, { recursive: true, force: true }));
globalThis.fetch = async () => { throw Error('OUTBOUND_TRAFFIC_FORBIDDEN'); };
const aiPath = join(temp, 'ai-pass.ts'), contractPath = join(temp, 'contract.ts');
writeFileSync(aiPath, readFileSync(join(root, 'cloudflare-deploy/src/ai-pass.ts')));
writeFileSync(contractPath, readFileSync(process.env.ENTITLEMENT_CONTRACT_SRC || join(root, 'cloudflare-deploy/src/student-entitlement-contract.ts'), 'utf8').replace("from './ai-pass'", `from '${pathToFileURL(aiPath).href}'`));
const C = await import(pathToFileURL(contractPath).href);
const schema = readFileSync(join(root, 'sandbox/student-entitlements/001_entitlements.sql'), 'utf8');
const DAY = 86400000, T = Date.UTC(2026, 9, 4, 3), subject = 'synthetic-A';
let pass = 0, fail = 0, checks = 0;
async function test(name, fn) {
  checks++;
  try { await fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.error('FAIL ' + name + ': ' + e.stack); }
}
let counter = 0;
function fresh(path = ':memory:') { const db = new DatabaseSync(path); db.exec(schema); return { db, store: createSandboxStore(db, C) }; }
function origin(id, product, at = T, uid = subject) {
  return { id, studentUid: uid, sourceSystem: 'payment_orders', sourceRef: 'order-' + id, lineRef: 'line-1', evidenceRef: 'synthetic-receipt-' + id,
    product, currency: 'KRW', expectedAmount: product === 'paid_ai' ? 10000 : 200000, paidAmount: product === 'paid_ai' ? 10000 : 200000, settledAt: at, settlementStatus: 'paid' };
}
function classes(prefix, starts = [T + 10 * DAY, T + 20 * DAY]) { return starts.map((at, n) => ({ id: prefix + '-lesson-' + n, scheduleId: prefix + '-schedule-' + n, startAt: at, endAt: at + 25 * 60000, state: 'scheduled', revision: 0 })); }
function command(store, body, at = T, uid = subject) {
  if(body.type==='refund'&&body.mode==='unused_classes')body={...body,unusedEvidence:body.classIds.map(id=>({classId:id,classRevision:store.read(uid).video.flatMap(v=>v.classes).find(c=>c.id===id)?.revision??0,checkedAt:at,hasStudentAttendance:false,reservationRef:'synthetic-reservation-'+id}))};
  return { id: 'command-' + (++counter), studentUid: uid, at, expectedRevision: store.read(uid).revision, ...body }; }
function paid(store, id, at = T, uid = subject) { return store.apply(command(store, { type: 'grant_paid_ai', origin: origin(id, 'paid_ai', at, uid), months: 1 }, at, uid)); }
function video(store, id, at = T, cs = classes(id), uid = subject) { return store.apply(command(store, { type: 'grant_video', origin: origin(id, 'video_bundle', at, uid), paidClassCount: cs.length, classes: cs }, at, uid)); }
function rejection(store, cmd, pattern) { const before = canonical(store.read(cmd.studentUid)); assert.throws(() => store.apply(cmd), pattern); assert.equal(canonical(store.read(cmd.studentUid)), before); }
await test('unpaid learner has no paid AI or video and no revenue', () => {
  const { db, store } = fresh(), view = C.entitlementView(store.read(subject), T);
  assert.equal(view.aiAllowed, false); assert.equal(view.videoAllowed, false); assert.equal(C.entitlementRevenue(store.read(subject)).paidAiNet, 0); db.close();
});
await test('AI-only purchase → owned learning context → evaluation → stacked renewal → expiry', () => {
  const { db, store } = fresh(); paid(store, 'ai1');
  const first = C.entitlementView(store.read(subject), T);
  assert.equal(first.track, 'ai_only'); assert.equal(first.videoAllowed, false); assert.equal(first.evaluationBasis, 'ai_learning');
  assert.deepEqual(first.aiOriginIds, ['ai1']); assert.equal(first.studentUid, subject);
  assert.equal(first.paidEndsAt, C.addMonthsKst ? C.addMonthsKst(T, 1) : Date.UTC(2026, 10, 4, 3));
  paid(store, 'ai2', T + DAY);
  const renewal = C.entitlementView(store.read(subject), T + DAY);
  assert.equal(renewal.paidEndsAt, Date.UTC(2026, 11, 4, 3));
  assert.equal(C.entitlementView(store.read(subject), renewal.paidEndsAt).aiAllowed, false);
  assert.equal(C.entitlementRevenue(store.read(subject)).paidAiNet, 20000); store.verifyReplay(subject); db.close();
});
await test('stacked paid grants consume sequentially rather than in parallel', () => {
  const {db,store}=fresh(); paid(store,'a1'); paid(store,'a2');
  const state=store.read(subject), total=state.paidAi.reduce((n,g)=>n+g.remainingMs,0);
  assert.equal(C.entitlementView(state,T+10*DAY).paidRemainingMs,total-10*DAY);
  const firstEnd=T+state.paidAi[0].purchasedMs;
  const result=store.apply(command(store,{type:'reconcile'},firstEnd+2*DAY));
  assert.equal(result.state.paidAi[0].remainingMs,0);
  assert.equal(result.state.paidAi[1].remainingMs,state.paidAi[1].purchasedMs-2*DAY);
  assert.deepEqual(C.entitlementView(result.state,result.state.clock).aiOriginIds,['a2']);
  db.close();
});
await test('pause/resume keeps sub-day milliseconds exactly', () => {
  const {db,store}=fresh(); paid(store,'a1'); const duration=store.read(subject).paidAi[0].purchasedMs;
  video(store,'v1',T+12345,classes('v1',[T+DAY])); const end=store.read(subject).video[0].classes[0].endAt;
  assert.equal(C.entitlementView(store.read(subject),end+9876).paidRemainingMs,duration-12345-9876); db.close();
});
await test('full-payment-only: failed, pending, partial, overpaid and zero payments roll back', () => {
  for (const patch of [{settlementStatus:'failed'}, {settlementStatus:'pending'}, {paidAmount:5000}, {paidAmount:10001}, {paidAmount:0,expectedAmount:0}]) {
    const { db, store } = fresh(); const o = {...origin('invalid', 'paid_ai'), ...patch};
    rejection(store, command(store, {type:'grant_paid_ai', origin:o, months:1}), /full_payment_required/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM student_entitlement_events').get().n, 0); db.close();
  }
});
await test('cross-student, evidence-free, unverified, timestamp mismatch origins are rejected', () => {
  for (const [patch, pattern] of [[{studentUid:'synthetic-B'},/cross_student/],[{evidenceRef:''},/origin_evidence/],[{sourceSystem:'guess'},/unverified/],[{settledAt:T-DAY},/settlement_time/]]) {
    const { db, store } = fresh(); rejection(store, command(store,{type:'grant_paid_ai', origin:{...origin('bad','paid_ai'),...patch},months:1}),pattern); db.close();
  }
});
await test('video purchase grants included AI through exact final class end and zero AI revenue', () => {
  const { db, store } = fresh(); const cs = classes('v1'); video(store,'v1',T,cs);
  const view = C.entitlementView(store.read(subject),T); assert.equal(view.label,'화상수업 + AI 무료 포함'); assert.equal(view.evaluationBasis,'teacher_and_ai');
  assert.equal(view.aiAllowed,true); assert.equal(view.videoAllowed,true); assert.equal(view.includedUntil,cs.at(-1).endAt);
  assert.equal(C.entitlementView(store.read(subject),cs.at(-1).endAt-1).aiAllowed,true);
  assert.equal(C.entitlementView(store.read(subject),cs.at(-1).endAt).aiAllowed,false);
  assert.deepEqual(C.entitlementRevenue(store.read(subject)),{paidAiGross:0,paidAiRefunded:0,videoGross:200000,videoRefunded:0,includedAiRevenue:0,paidAiNet:0,videoNet:200000}); db.close();
});
await test('AI → video pauses exact remaining milliseconds; expiry resumes even after late reconciliation', () => {
  const { db, store }=fresh(); paid(store,'a1'); const start= T+3*DAY, cs=classes('v1',[T+8*DAY]);
  const before=C.entitlementView(store.read(subject),start).paidRemainingMs; const result=video(store,'v1',start,cs);
  assert.ok(result.transitions.some(x=>x.type==='paid_ai_paused')); assert.equal(C.entitlementView(store.read(subject),start).paidPaused,true);
  assert.equal(C.entitlementView(store.read(subject),cs[0].endAt-1).paidRemainingMs,before);
  const r=store.apply(command(store,{type:'reconcile'},cs[0].endAt+2*DAY));
  assert.equal(C.entitlementView(r.state,r.state.clock).paidRemainingMs,before-2*DAY);
  assert.ok(r.transitions.some(x=>x.type==='paid_ai_resumed'&&x.at===cs[0].endAt)); assert.equal(r.state.origins[0].paidAmount,10000); db.close();
});
await test('overlapping video renewals pause once and resume after the union ends',()=>{
  const {db,store}=fresh(); paid(store,'a1'); const a=classes('v1',[T+5*DAY]),b=classes('v2',[T+10*DAY]);
  video(store,'v1',T,a); video(store,'v2',T+DAY,b); const remaining=C.entitlementView(store.read(subject),T+DAY).paidRemainingMs;
  assert.equal(C.entitlementView(store.read(subject),a[0].endAt+DAY).paidRemainingMs,remaining);
  assert.equal(C.entitlementView(store.read(subject),b[0].endAt+DAY).paidRemainingMs,remaining-DAY); db.close();
});
await test('approved makeup extends free AI, preserves stable lesson identity and blocks stale move',()=>{
  const {db,store}=fresh(); paid(store,'a1'); const cs=classes('v1',[T+5*DAY]); video(store,'v1',T,cs);
  const move=command(store,{type:'move_class',originId:'v1',classId:cs[0].id,expectedClassRevision:0,scheduleId:'makeup-row',startAt:T+15*DAY,endAt:T+15*DAY+1500000,approvalRef:'approved-makeup',makeup:true},T+DAY);
  store.apply(move); const s=store.read(subject),v=C.entitlementView(s,T+6*DAY);
  assert.equal(v.aiSource,'video_included'); assert.equal(v.includedUntil,move.endAt); assert.equal(s.video[0].classes[0].id,cs[0].id); assert.equal(s.video[0].classes[0].scheduleId,'makeup-row');
  rejection(store,{...move,id:'stale-move',expectedRevision:s.revision},/class_revision_conflict/); db.close();
});
await test('late makeup approvals and backdated events demand reconciliation instead of losing paid time',()=>{
  const {db,store}=fresh(); const cs=classes('v1',[T+DAY]); video(store,'v1',T,cs);
  const move=command(store,{type:'move_class',originId:'v1',classId:cs[0].id,expectedClassRevision:0,scheduleId:'late-makeup',startAt:T+10*DAY,endAt:T+10*DAY+1500000,approvalRef:'approval',makeup:true},T+3*DAY);
  rejection(store,move,/late_makeup_requires_reconciliation/);
  store.apply(command(store,{type:'reconcile'},T+4*DAY)); rejection(store,command(store,{type:'reconcile'},T+DAY),/backdated_event/); db.close();
});
await test('partial refund removes exactly selected unused lessons and preserves unrelated entitlement',()=>{
  const {db,store}=fresh(); paid(store,'a1'); const cs=classes('v1'); video(store,'v1',T,cs);
  store.apply(command(store,{type:'refund',originId:'v1',refundId:'r1',amount:100000,mode:'unused_classes',classIds:[cs[1].id],evidenceRef:'verified-refund'},T+DAY));
  const s=store.read(subject),v=C.entitlementView(s,T+DAY); assert.deepEqual(v.scheduledClassIds,[cs[0].id]); assert.equal(v.includedUntil,cs[0].endAt); assert.equal(v.paidPaused,true);
  assert.equal(s.video[0].classes[1].state,'refunded'); assert.equal(s.origins.length,2); assert.equal(C.entitlementRevenue(s).videoNet,100000); store.verifyReplay(subject); db.close();
});
await test('completion preserved; refund of completed, started, unknown or duplicate lessons rolls back',()=>{
  const {db,store}=fresh(); const cs=classes('v1',[T+DAY,T+10*DAY]); video(store,'v1',T,cs);
  store.apply(command(store,{type:'complete_class',originId:'v1',classId:cs[0].id,expectedClassRevision:0},cs[0].endAt));
  for (const ids of [[cs[0].id],['missing'],[cs[1].id,cs[1].id]]) rejection(store,command(store,{type:'refund',originId:'v1',refundId:'bad-'+ids.join(','),amount:1000,mode:'unused_classes',classIds:ids,evidenceRef:'verified'},T+2*DAY),/refund_class_not_unused|duplicate_refund_classes/);
  assert.equal(store.read(subject).video[0].classes[0].state,'completed'); db.close();
});
await test('unused-class refunds require current attendance check and reservation evidence',()=>{
  const {db,store}=fresh(); const cs=classes('v1'); video(store,'v1',T,cs);
  const base=command(store,{type:'refund',originId:'v1',refundId:'r1',amount:100000,mode:'unused_classes',classIds:[cs[1].id],evidenceRef:'verified-refund'},T+DAY);
  for(const patch of [{hasStudentAttendance:true},{checkedAt:T},{classRevision:1},{reservationRef:''}]) rejection(store,{...base,unusedEvidence:[{...base.unusedEvidence[0],...patch}]},/verified_unused_evidence_required/);
  rejection(store,{...base,unusedEvidence:undefined},/verified_unused_evidence_required/); db.close();
});
await test('full video refund resumes paid AI and never destroys original payment evidence',()=>{
  const {db,store}=fresh(); paid(store,'a1'); video(store,'v1'); const r=store.apply(command(store,{type:'refund',originId:'v1',refundId:'full-v',amount:200000,mode:'full',classIds:[],evidenceRef:'verified-refund'},T+DAY));
  const v=C.entitlementView(r.state,T+DAY); assert.equal(v.aiSource,'paid_ai'); assert.equal(v.videoAllowed,false); assert.ok(r.transitions.some(x=>x.type==='paid_ai_resumed')); assert.equal(r.state.origins.find(o=>o.id==='v1').paidAmount,200000); assert.equal(C.entitlementRevenue(r.state).videoNet,0); db.close();
});
await test('video cancellation ends included access without inventing a financial refund',()=>{
  const {db,store}=fresh(); paid(store,'a1'); video(store,'v1'); store.apply(command(store,{type:'cancel_origin',originId:'v1',evidenceRef:'approved-cancellation'},T+DAY));
  const s=store.read(subject); assert.equal(C.entitlementView(s,T+DAY).aiSource,'paid_ai'); assert.equal(C.entitlementRevenue(s).videoNet,200000); db.close();
});
await test('paid AI refund revokes only that source and retains the other paid period',()=>{
  const {db,store}=fresh(); paid(store,'a1'); paid(store,'a2'); const total=C.entitlementView(store.read(subject),T).paidRemainingMs;
  const first=store.read(subject).paidAi[0].remainingMs; store.apply(command(store,{type:'refund',originId:'a1',refundId:'ai-refund',amount:10000,mode:'full',classIds:[],evidenceRef:'approved'}));
  assert.equal(C.entitlementView(store.read(subject),T).paidRemainingMs,total-first); assert.equal(C.entitlementRevenue(store.read(subject)).paidAiNet,10000); db.close();
});
await test('refund overpayment, partial AI, incomplete full refund are rejected atomically',()=>{
  for(const body of [{amount:10001,mode:'full'},{amount:5000,mode:'full'},{amount:5000,mode:'unused_classes'}]){
    const {db,store}=fresh(); paid(store,'a1'); rejection(store,command(store,{type:'refund',originId:'a1',refundId:'bad',classIds:[],evidenceRef:'approved',...body}),/refund_exceeds_paid|full_refund_must_close_balance|partial_refund_needs_video_classes/); db.close();
  }
});
await test('included AI forbids advisory automatic charge; resumed billing requires notice floor',()=>{
  const {db,store}=fresh(); paid(store,'a1'); const cs=classes('v1',[T+5*DAY]); video(store,'v1',T,cs);
  assert.deepEqual(C.aiRenewalDecision(store.read(subject),T+DAY,T-10*DAY),{charge:false,reason:'included_ai',notBefore:cs[0].endAt});
  assert.equal(C.aiRenewalDecision(store.read(subject),cs[0].endAt,null).charge,false);
  const expired=T+100*DAY; assert.equal(C.aiRenewalDecision(store.read(subject),expired,expired-DAY).charge,false); assert.equal(C.aiRenewalDecision(store.read(subject),expired,expired-3*DAY).charge,true); db.close();
});
await test('already-settled AI purchase during free period preserves value and flags duplicate-billing review',()=>{
  const {db,store}=fresh(); video(store,'v1'); const r=paid(store,'a1',T+DAY);
  assert.ok(r.transitions.some(x=>x.type==='settled_during_free_ai_review')); assert.equal(C.entitlementView(r.state,T+2*DAY).paidRemainingMs,r.state.paidAi[0].purchasedMs); db.close();
});
await test('repeated webhook uses one command key; conflicting replay and duplicate source are rejected',()=>{
  const {db,store}=fresh(); const cmd=command(store,{type:'grant_paid_ai',origin:origin('a1','paid_ai'),months:1}); const r=store.apply(cmd);
  for(let i=0;i<100;i++){ assert.equal(store.apply(cmd).duplicate,true); assert.equal(store.read(subject).revision,1); }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_entitlements').get().n,1);
  rejection(store,{...cmd,months:2},/idempotency_key_conflict/);
  rejection(store,{...cmd,id:'new-command-same-source',expectedRevision:1},/duplicate_origin/); assert.equal(store.verifyReplay(subject).events,1); db.close();
});
await test('source provenance uniqueness also holds across learners at database boundary',()=>{
  const {db,store}=fresh(); paid(store,'a1'); const o={...origin('a2','paid_ai',T,'synthetic-B'),sourceRef:'order-a1'};
  rejection(store,command(store,{type:'grant_paid_ai',origin:o,months:1},T,'synthetic-B'),/UNIQUE constraint failed|entitlement_origins_immutable/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM student_entitlement_subjects').get().n,1); db.close();
});
await test('append-only ledger and immutable origins reject SQL update and delete',()=>{
  const {db,store}=fresh(); paid(store,'a1');
  for(const table of ['student_entitlement_events','student_entitlement_origins']){
    assert.throws(()=>db.exec(`DELETE FROM ${table}`),/append_only|immutable/);
    const field=table.endsWith('events')?'event_type':'evidence_ref'; assert.throws(()=>db.exec(`UPDATE ${table} SET ${field}='tampered'`),/append_only|immutable/);
  }
  assert.throws(()=>db.exec('INSERT OR REPLACE INTO student_entitlement_events SELECT * FROM student_entitlement_events'),/append_only/);
  assert.throws(()=>db.exec('INSERT OR REPLACE INTO student_entitlement_origins SELECT * FROM student_entitlement_origins'),/immutable/);
  assert.equal(store.verifyReplay(subject).events,1); db.close();
});
await test('failure after event or before commit rolls back origins, ledger, balance and subject',()=>{
  for(const injectFailure of ['after_event','before_commit']){
    const {db,store}=fresh(); const cmd=command(store,{type:'grant_paid_ai',origin:origin('a1','paid_ai'),months:1});
    assert.throws(()=>store.apply(cmd,{injectFailure}),/synthetic_database_failure/);
    for(const table of ['subjects','origins','events'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM student_entitlement_${table}`).get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM student_entitlements').get().n,0);
    assert.equal(store.apply(cmd).duplicate,false); store.verifyReplay(subject); db.close();
  }
});
await test('stale revision, class count mismatch and duplicate class schedule cannot commit',()=>{
  const {db,store}=fresh(); paid(store,'a1'); rejection(store,{...command(store,{type:'reconcile'}),expectedRevision:0},/revision_conflict/);
  const cs=classes('v1'); rejection(store,command(store,{type:'grant_video',origin:origin('v1','video_bundle'),paidClassCount:3,classes:cs}),/paid_class_count_mismatch/);
  rejection(store,command(store,{type:'grant_video',origin:origin('v1','video_bundle'),paidClassCount:2,classes:[cs[0],cs[0]]}),/duplicate_class_or_schedule/); db.close();
});
await test('current projection integrity fails closed and replay cannot silently trust corrupted state',()=>{
  const {db,store}=fresh(); paid(store,'a1'); db.exec("UPDATE student_entitlement_subjects SET projection_json='{}'"); assert.throws(()=>store.read(subject),/projection_integrity_error/); assert.throws(()=>store.verifyReplay(subject),/projection_integrity_error/); db.close();
});
await test('valid optional undefined fields normalize to JSON and replay identically',()=>{
  const {db,store}=fresh(); const cs=classes('v1').map(c=>({...c,makeupApprovalRef:undefined}));
  const cmd=command(store,{type:'grant_video',origin:origin('v1','video_bundle'),paidClassCount:cs.length,classes:cs});
  assert.equal(store.apply(cmd).duplicate,false);
  const persisted=JSON.parse(db.prepare('SELECT command_json FROM student_entitlement_events').get().command_json);
  assert.equal(Object.hasOwn(persisted.classes[0],'makeupApprovalRef'),false);
  assert.equal(store.apply(JSON.parse(JSON.stringify(cmd))).duplicate,true);
  assert.equal(store.apply(cmd).duplicate,true); assert.equal(store.verifyReplay(subject).events,1); db.close();
});
await test('paid duration SQL constraints reject either or both nullable balances',()=>{
  const {db,store}=fresh(); paid(store,'a1');
  for(const update of ['purchased_ms=NULL','remaining_ms=NULL','purchased_ms=NULL,remaining_ms=NULL'])
    assert.throws(()=>db.exec('UPDATE student_entitlements SET '+update),/CHECK constraint failed/);
  assert.equal(store.verifyReplay(subject).events,1); db.close();
});
await test('reads and replay detect missing or inconsistent paid and video projection rows',()=>{
  for(const mutate of [
    "UPDATE student_entitlements SET remaining_ms=1 WHERE kind='paid_ai'",
    "UPDATE student_entitlements SET grant_json='{}' WHERE kind='paid_ai'",
    "UPDATE student_entitlements SET revoked=1 WHERE kind='video_bundle'",
    "UPDATE student_entitlements SET grant_json='{}' WHERE kind='video_bundle'",
    "DELETE FROM student_entitlements WHERE kind='paid_ai'",
    "DELETE FROM student_entitlements WHERE kind='video_bundle'",
  ]){
    const {db,store}=fresh(); paid(store,'a1'); video(store,'v1'); db.exec(mutate);
    assert.throws(()=>store.read(subject),/entitlement_projection_mismatch/);
    assert.throws(()=>store.verifyReplay(subject),/entitlement_projection_mismatch/); db.close();
  }
});
await test('derived reads and ledger replay keep one snapshot across a concurrent writer',()=>{
  const path=join(temp,'read-snapshot.sandbox.sqlite'),{db,store}=fresh(path);
  db.exec('PRAGMA journal_mode=WAL'); paid(store,'a1');
  const otherDb=new DatabaseSync(path),other=createSandboxStore(otherDb,C);
  let trigger=null;
  const wrappedDb={get isTransaction(){return db.isTransaction;},exec(sql){return db.exec(sql);},prepare(sql){
    const statement=db.prepare(sql);
    if(sql.startsWith('SELECT * FROM student_entitlement_subjects'))return {get(...args){
      const row=statement.get(...args); if(trigger?.kind==='subject'){const f=trigger.run;trigger=null;f();}return row;
    }};
    if(sql.startsWith('SELECT * FROM student_entitlement_events WHERE student_uid'))return {all(...args){
      const rows=statement.all(...args); if(trigger?.kind==='ledger'){const f=trigger.run;trigger=null;f();}return rows;
    }};
    return statement;
  }};
  const reader=createSandboxStore(wrappedDb,C);
  trigger={kind:'subject',run:()=>other.apply(command(other,{type:'reconcile'},T+DAY))};
  assert.equal(reader.read(subject).revision,1); assert.equal(other.read(subject).revision,2);
  trigger={kind:'ledger',run:()=>other.apply(command(other,{type:'reconcile'},T+2*DAY))};
  assert.equal(reader.verifyReplay(subject).events,2); assert.equal(other.read(subject).revision,3);
  assert.equal(reader.verifyReplay(subject).events,3); otherDb.close(); db.close();
});
await test('migration is repeatable and does not change synthetic legacy data or schemas',()=>{
  const {db}=fresh(); db.exec("CREATE TABLE enrollments(id INTEGER PRIMARY KEY,notes TEXT); INSERT INTO enrollments VALUES(1,'keep legacy'); CREATE TABLE student_payments(id INTEGER PRIMARY KEY, amount_krw INTEGER); INSERT INTO student_payments VALUES(1,10000)");
  const before=JSON.stringify(db.prepare("SELECT sql FROM sqlite_master WHERE name IN ('enrollments','student_payments') ORDER BY name").all());
  db.exec(schema); assert.equal(JSON.stringify(db.prepare("SELECT sql FROM sqlite_master WHERE name IN ('enrollments','student_payments') ORDER BY name").all()),before);
  assert.equal(db.prepare('SELECT notes FROM enrollments').get().notes,'keep legacy'); assert.equal(db.prepare('SELECT amount_krw FROM student_payments').get().amount_krw,10000); db.close();
});
await test('learning attribution snapshots remain immutable across later video conversion',()=>{
  const {db,store}=fresh(); paid(store,'a1'); const learningSnapshot=C.entitlementView(store.read(subject),T); video(store,'v1',T+DAY,classes('v1'));
  assert.equal(learningSnapshot.evaluationBasis,'ai_learning'); assert.deepEqual(learningSnapshot.aiOriginIds,['a1']); assert.equal(C.entitlementView(store.read(subject),T+DAY).evaluationBasis,'teacher_and_ai');
  assert.equal(C.entitlementView(store.read('synthetic-B'),T+DAY).aiAllowed,false); db.close();
});
await test('60 deterministic pause/expiry/reconcile histories conserve paid duration and replay',()=>{
  for(let i=0;i<60;i++){
    const {db,store}=fresh(); paid(store,'a1'); const duration=store.read(subject).paidAi[0].purchasedMs;
    const freeAt=T+(i%5)*DAY, end=T+(7+i%9)*DAY+1500000,cs=classes('v1',[end-1500000]); video(store,'v1',freeAt,cs);
    const after=end+(i%4)*DAY; store.apply(command(store,{type:'reconcile'},after));
    assert.equal(C.entitlementView(store.read(subject),after).paidRemainingMs,Math.max(0,duration-(freeAt-T)-(after-end)));
    assert.equal(store.verifyReplay(subject).events,3); db.close();
  }
});
if (!process.env.ENTITLEMENT_SKIP_RACES) await test('20 real two-connection races: one CAS winner, retry preserves both origins',async()=>{
  for(let i=0;i<20;i++){
    const path=join(temp,'race-'+i+'.sandbox.sqlite'),{db,store}=fresh(path),sync=new SharedArrayBuffer(8),barrier=new Int32Array(sync);
    const cmds=[command(store,{type:'grant_paid_ai',origin:origin('a1','paid_ai'),months:1}),command(store,{type:'grant_video',origin:origin('v1','video_bundle'),paidClassCount:1,classes:classes('v1',[T+5*DAY])})];
    const workers=cmds.map(cmd=>new Worker(new URL('../sandbox/student-entitlements/race-worker.mjs',import.meta.url),{workerData:{path,contractUrl:pathToFileURL(contractPath).href,sync,command:cmd}}));
    const results=workers.map(w=>new Promise((res,rej)=>{w.once('message',res);w.once('error',rej);w.once('exit',code=>{if(code!==0)rej(Error('worker_exit_'+code));});}));
    while(Atomics.load(barrier,0)<2)await new Promise(r=>setTimeout(r,5)); Atomics.store(barrier,1,1);Atomics.notify(barrier,1,2);
    const r=await Promise.all(results); assert.equal(r.filter(x=>x.ok).length,1); assert.equal(r.filter(x=>x.error==='revision_conflict').length,1);
    const loser=cmds[r.findIndex(x=>!x.ok)]; store.apply({...loser,expectedRevision:1});
    assert.equal(store.read(subject).origins.length,2); assert.equal(C.entitlementView(store.read(subject),T).paidPaused,true); assert.equal(store.verifyReplay(subject).events,2); db.close();
  }
});
console.log(JSON.stringify({suite:'proposed_entitlement_contract',scenarioGroups:checks,pass,fail,idempotencyRetries:100,generatedHistories:60,realSqliteRaces:process.env.ENTITLEMENT_SKIP_RACES?0:20,actualProductionRouteChanges:0,liveProviderCalls:0}));
process.exitCode=fail?1:0;
