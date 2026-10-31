import assert from 'node:assert/strict';
import { createSpeechSandbox } from './helpers/speech-sandbox.mjs';
const sandbox=createSpeechSandbox();let passed=0;
async function request(method,token,app='warmup',level=3){
  return sandbox.handle(new Request('http://sandbox/api/student/speech-preferences?app='+app+'&uid=victim',{
    method,headers:token?{Authorization:'Bearer '+token}:{},body:method==='PUT'?JSON.stringify({level,uid:'victim'}):undefined
  }));
}
try {
  for(const app of ['warmup','friend'])for(const uid of ['Alice','Bob'])for(let level=1;level<=5;level++){
    const token=await sandbox.sign(uid);
    assert.equal((await request('PUT',token,app,level)).status,200);
    const data=await (await request('GET',await sandbox.sign(uid.toUpperCase()),app)).json();
    assert.equal(data.level,level);passed++;
  }
  const victim=await request('GET',await sandbox.sign('victim'));assert.equal((await victim.json()).level,null);passed++;
  for(const token of ['', 'invalid.signature', (await sandbox.sign('Alice')).replace(/^./,'!'),await sandbox.sign('Alice',-1000),await sandbox.sign('guest_test')]){
    assert.equal((await request('PUT',token)).status,401);passed++;
  }
  const alice=await sandbox.sign('Alice');
  for(const level of [0,6,-1,1.5,'2',null,{},[]]){assert.equal((await request('PUT',alice,'warmup',level)).status,400);passed++;}
  assert.equal((await request('GET',alice,'unknown')).status,400);passed++;
  assert.equal((await request('DELETE',alice)).status,405);passed++;
  const bad=await sandbox.handle(new Request('http://sandbox/api/student/speech-preferences?app=warmup',{method:'PUT',headers:{Authorization:'Bearer '+alice},body:'{bad'}));
  assert.equal(bad.status,400);passed++;
  const rows=sandbox.sqlite.prepare('SELECT COUNT(*) AS n FROM student_speech_preferences').get();
  assert.equal(rows.n,4);passed++;
  console.log(JSON.stringify({suite:'real signed tokens + isolated SQLite',passed,failed:0}));
}finally{sandbox.close();}
