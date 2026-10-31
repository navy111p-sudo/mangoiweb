import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
const f=await fixture();
const student='pilot-child-1',admin='fixture-director-session';
test('default off, unauthenticated, forged and guest denied',async()=>{
 f.env.ELEADER_PILOT='off';assert.equal((await f.request({student})).status,404);f.env.ELEADER_PILOT='on';
 for(const args of [{},{student:'forged'},{student:'guest-fixture'},{student:'forged',admin}])assert.equal((await f.request(args)).status,401);
});
test('tenant isolation and peer records remain private',async()=>{
 assert.equal((await f.request({student,academy:'other'})).status,403);
 assert.equal((await f.request({admin,academy:'other'})).status,403);
 assert.equal((await f.request({student:'other-child'})).status,403);
 const r=await f.request({student});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(r.body.students,[]);assert.ok(r.body.assignments.every(a=>a.student_uid===student));
});
test('3 original units, 20 unique questions each; simple English and Korean hints',async()=>{
 const {body}=await f.request({student});assert.equal(body.units.length,3);
 const ids=new Set();for(const u of body.units){assert.equal(u.questions.length,20);for(const q of u.questions){assert.ok(!ids.has(q.id));ids.add(q.id);assert.match(q.hint,/[가-힣]/);assert.match(q.question,/\?$/);assert.ok(q.question.split(' ').length<=12);assert.match(q.model,/[.]$/);}}
 assert.equal(ids.size,60);
});
test('student cannot manage; teacher cannot become director; cross-tenant assignment rejected',async()=>{
 assert.equal((await f.request({student,action:'settings',method:'POST',data:{name:'bad',enabled:false}})).status,403);
 assert.equal((await f.request({student,action:'assign',method:'POST',data:{}})).status,403);
 assert.equal((await f.request({admin:'fixture-teacher-session'})).status,401);
 assert.equal((await f.request({admin,action:'assign',method:'POST',data:{student:'other-child',unit:'pets',assigned:true}})).status,403);
 assert.equal((await f.request({admin,action:'complete',method:'POST',data:{unit:'pets',question:'pets-01'}})).status,403);
});
test('settings, assignment, revocation, re-assignment and history',async()=>{
 assert.equal((await f.request({admin,action:'settings',method:'POST',data:{name:'검토 학원',enabled:false}})).status,200);
 assert.equal((await f.request({student})).status,403);
 await f.request({admin,action:'settings',method:'POST',data:{name:'엘리더잼 시범 학원',enabled:true}});
 const data={student,unit:'pets',assigned:false};await f.request({admin,action:'assign',method:'POST',data});
 assert.equal((await f.request({student,action:'complete',method:'POST',data:{unit:'pets',question:'pets-01'}})).status,403);
 await f.request({admin,action:'assign',method:'POST',data:{...data,assigned:true}});
});
test('duplicate clicks and retries store exactly one result; reload resumes; no answer saved',async()=>{
 const req={student,action:'complete',method:'POST',data:{unit:'pets',question:'pets-01',answer:'should not persist',student:'other-child'}};
 const result=await Promise.all(Array.from({length:10},()=>f.request(req)));assert.ok(result.every(r=>r.status===200));
 assert.equal((await f.request({student})).body.progress.length,1);
 assert.equal((await f.request({student:'pilot-child-2'})).body.progress.length,0);
 const row=f.db.prepare('SELECT * FROM eleader_progress').get();assert.deepEqual(Object.keys(row).sort(),['academy_id','completed_at','question_id','student_uid','unit_id'].sort());assert.equal(row.student_uid,student);
});
test('invalid question, unsupported methods, CSRF, identity switch, membership removal',async()=>{
 assert.equal((await f.request({student,action:'complete',method:'POST',data:{unit:'food',question:'pets-01'}})).status,400);
 assert.equal((await f.request({student,method:'DELETE'})).status,405);
 assert.equal((await f.request({admin,action:'settings',method:'POST'})).status,403);
 assert.equal((await f.request({admin,headers:{'X-Eleader-Subject':'other-director'}})).status,409);
 f.db.prepare("DELETE FROM eleader_members WHERE subject=?").run('pilot-child-2');assert.equal((await f.request({student:'pilot-child-2'})).status,403);
});
test('expired/replaced login sessions and oversized/cross-origin requests fail closed',async()=>{
 const expired=await f.signUidToken(student,f.env,-1);assert.equal((await f.request({student:expired})).status,401);
 const stale=await f.signUidToken(student,f.env,60000,'old-session');f.env.SINGLE_SESSION='on';f.env.SESSION_STATE={get:async()=> 'new-session'};
 assert.equal((await f.request({student:stale})).status,401);delete f.env.SINGLE_SESSION;delete f.env.SESSION_STATE;
 const url=new URL('http://127.0.0.1:8798/api/ai/eleader/complete?academy=eleaderjam');
 const make=(origin,text)=>new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+f.tokens[student]},body:text});
 assert.equal((await f.handleEleaderApi(make('https://untrusted.invalid','{}'),url,f.env)).status,403);
 assert.equal((await f.handleEleaderApi(make(url.origin,JSON.stringify({text:'x'.repeat(5000)})),url,f.env)).status,400);
});
test('missing schema fails closed' ,async()=>{
 f.db.exec('DROP TABLE eleader_assignments');assert.equal((await f.request({student})).status,503);
});
