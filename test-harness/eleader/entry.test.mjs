import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
const f=await fixture();
const entry=args=>f.request({action:'entry',academy:'ignored-client-value',...args});
test('entry uses existing signed identity; forged/guest/teacher do not fall back to admin',async()=>{
 for(const args of [{},{student:'forged'},{student:'guest-fixture'},{student:'forged',admin:'fixture-director-session'},{admin:'fixture-teacher-session'}])assert.equal((await entry(args)).status,401);
});
test('entry returns only owned tenant and role; no questions, records or peers',async()=>{
 for(const [student,academy] of [['pilot-child-1','eleaderjam'],['other-child','other']]){
  const r=await entry({student});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(Object.keys(r.body).sort(),['entries','subject']);
  assert.equal(r.body.entries.length,1);assert.equal(r.body.entries[0].academy,academy);assert.equal(r.body.entries[0].role,'student');
 }
 const r=await entry({admin:'fixture-director-session'});assert.equal(r.body.entries[0].role,'director');assert.match(r.body.entries[0].href,/view=director/);
});
test('ED is only a short-lived synthetic student; no password or real academy membership',async()=>{
 f.db.exec("INSERT INTO eleader_academies VALUES ('ed-sandbox','합성 ED 테스트 학원',1); INSERT INTO eleader_members VALUES ('ed-sandbox','student','ED','student')");
 const token=await f.signUidToken('ED',f.env,60000);
 const r=await entry({student:token});assert.deepEqual(r.body.entries.map(e=>e.academy),['ed-sandbox']);assert.equal((await f.request({student:token,academy:'eleaderjam'})).status,403);
 assert.equal((await f.request({student:token,academy:'ed-sandbox',action:'settings',method:'POST',data:{name:'bad',enabled:true}})).status,403);
 assert.equal((await entry({student:await f.signUidToken('ED',f.env,-1)})).status,401);
 f.db.exec("DELETE FROM eleader_members WHERE subject='ED'; DELETE FROM eleader_academies WHERE id='ed-sandbox'");
 assert.deepEqual((await entry({student:token})).body.entries,[]);
});
test('pause, revoke, unprovisioned identity and method fail closed',async()=>{
 f.db.exec("UPDATE eleader_academies SET enabled=0 WHERE id='eleaderjam'");assert.deepEqual((await entry({student:'pilot-child-1'})).body.entries,[]);
 f.db.exec("UPDATE eleader_academies SET enabled=1 WHERE id='eleaderjam'; DELETE FROM eleader_members WHERE subject='pilot-child-2'");assert.deepEqual((await entry({student:'pilot-child-2'})).body.entries,[]);
 assert.equal((await entry({student:'pilot-child-1',method:'POST',data:{}})).status,405);
 f.env.ELEADER_PILOT='off';assert.equal((await entry({student:'pilot-child-1'})).status,404);
});
test.after(()=>f.db.close());
