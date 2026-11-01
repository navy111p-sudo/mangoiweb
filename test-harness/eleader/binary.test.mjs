import test from 'node:test';import assert from 'node:assert/strict';import {start} from './server.mjs';
test('scoped TTS HTTP path preserves non-UTF8 bytes exactly (mock engine)',async()=>{
 const bytes=Uint8Array.from({length:300},(_,i)=>[0xff,0xfb,0x90,0x64,0,0xfe,0x80,0xc3,0x28][i%9]);
 const f=await start({engines:{chat:async()=>null,voice:async()=>new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}})}});
 f.env.ELEADER_LIVE_AI='approved';f.env.ELEADER_POLICY_VERSION='binary-test';f.env.ELEADER_POLICY_NOTICE='synthetic fixture';
 f.db.prepare('INSERT INTO eleader_consents VALUES (?,?,?,?,?,?,NULL)').run('eleaderjam','pilot-child-1','binary-test',1,1,Date.now()+60000);
 try{const r=await fetch('http://127.0.0.1:8798/api/ai/eleader/tts?academy=eleaderjam&unit=pets&question=pets-01',{method:'POST',headers:{Origin:'http://127.0.0.1:8798',Authorization:'Bearer '+f.tokens['pilot-child-1'],'Content-Type':'application/json','X-Eleader-Policy':'binary-test','X-Eleader-Confirm':'yes','X-Eleader-Request':crypto.randomUUID()},body:JSON.stringify({text:'I like cats.'})});assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'audio/mpeg');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);}finally{await new Promise(r=>f.server.close(r));}
});
