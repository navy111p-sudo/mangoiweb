// Run the shipped AI dispatcher with local SQLite and synthetic AI responses.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.env.WRITING_MODULE_SRC_DIR || join(root, 'cloudflare-deploy/src');
const { buildSync } = createRequire(import.meta.url)('../cloudflare-deploy/node_modules/esbuild');
const temp = mkdtempSync(join(tmpdir(), 'mangoi-writing-contracts-'));
const realNow = Date.now, realFetch = globalThis.fetch;
const NOW = Date.UTC(2026, 10, 6, 15, 30), DAY = 86400000;
let pass = 0;
async function check(name, fn) { await fn(); pass++; console.log('PASS ' + name); }
function fixture() {
  const raw = new DatabaseSync(':memory:'), trace = [], calls = [], state = { failAlter: false, failInsert: false };
  raw.exec(`CREATE TABLE ai_writing_corrections(id INTEGER PRIMARY KEY,student_uid TEXT,original_text TEXT NOT NULL,corrected_text TEXT,feedback TEXT,level TEXT,score INTEGER,created_at INTEGER NOT NULL,topic_id INTEGER);
    CREATE TABLE students_erp(user_id TEXT PRIMARY KEY,korean_name TEXT,english_name TEXT);`);
  function prepare(sql) {
    const stmt = raw.prepare(sql);
    const bind = args => ({
      async first() { trace.push(sql); return stmt.get(...args) || null; },
      async all() { trace.push(sql); return { results: stmt.all(...args) }; },
      async run() { trace.push(sql); if (state.failInsert && /INSERT INTO ai_writing_corrections/.test(sql)) throw Error('synthetic insert failure'); const r = stmt.run(...args); return { success:true,meta:{ changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid) } }; },
    });
    return { ...bind([]),bind:(...args)=>bind(args) };
  }
  const env = { ROOM_JWT_SECRET:'synthetic-writing-contract-key-only', DB:{
    prepare,
    async exec(sql) { trace.push(sql); if (state.failAlter && /ADD COLUMN topic_id/.test(sql)) { state.failAlter=false; throw Error('synthetic temporary DDL failure'); } raw.exec(sql); },
    async batch(statements) { raw.exec('BEGIN'); try { const rows=[]; for(const s of statements) rows.push(await s.run()); raw.exec('COMMIT'); return rows; } catch(e) { raw.exec('ROLLBACK'); throw e; } },
  } };
  return { raw,env,trace,calls,state,close:()=>raw.close() };
}
try {
  Date.now = () => NOW;
  globalThis.fetch = async () => { throw Error('Unexpected network request in writing contracts'); };
  const out = join(temp,'handlers.mjs');
  buildSync({ stdin:{contents:"export {handleAiApi} from './api-ai'; export {signUidToken} from './auth-token'; export {ensurePointTables} from './api-points';",resolveDir:sourceDir,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent' });
  const M = await import(pathToFileURL(out).href);
  const post = body => ({ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
  const auth = async uid => ({ Authorization:'Bearer '+await M.signUidToken(uid,{ROOM_JWT_SECRET:'synthetic-writing-contract-key-only'}) });
  async function call(path,f,options={},expected=true) { const url=new URL(path,'https://sandbox.invalid'); const r=await M.handleAiApi(new Request(url,options),url,f.env); if(expected) assert(r instanceof Response,'Expected route response: '+path); return r; }
  function ai(f,payload) { f.env.AI={async run(model) { f.calls.push(model); return {response:JSON.stringify(payload)}; }}; }
  function row(f,uid,score,time=NOW) { f.raw.prepare('INSERT INTO ai_writing_corrections(student_uid,original_text,score,created_at) VALUES(?,?,?,?)').run(uid,'Synthetic writing',score,time); }

  await check('unmatched paths and methods do not touch D1 or providers',async()=>{
    const f=fixture();try { for(const p of ['/unmatched','/api/ai/write-correct']) assert.equal(await call(p,f,{},false),null); assert.deepEqual(f.trace,[]); }finally{f.close();}
  });
  await check('temporary topic schema failure remains retryable',async()=>{
    const f=fixture();try { f.state.failAlter=true; for(let i=0;i<2;i++) assert.equal((await call('/api/ai/write-correct',f,post({text:'x'}))).status,400); assert.equal(f.trace.filter(s=>/ADD COLUMN topic_id/.test(s)).length,2); }finally{f.close();}
  });
  await check('input limits and missing AI return before model calls or saved corrections',async()=>{
    const f=fixture();try { ai(f,{}); for(const text of ['','x','a'.repeat(2001)]) assert.equal((await call('/api/ai/write-correct',f,post({text}))).status,400); delete f.env.AI; assert.equal((await call('/api/ai/write-correct',f,post({text:'Hello there.'}))).status,503); assert.equal(f.calls.length,0); assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM ai_writing_corrections').get().n,0); }finally{f.close();}
  });
  await check('history and statistics require the requested owner and history stays limited to thirty',async()=>{
    const f=fixture();try { for(let i=0;i<35;i++) row(f,'a',80,NOW-i); row(f,'b',100);
      for(const p of ['write-history','write-stats']) { assert.equal((await call('/api/ai/'+p,f)).status,400); assert.equal((await call('/api/ai/'+p+'?uid=a',f)).status,401); assert.equal((await call('/api/ai/'+p+'?uid=a',f,{headers:await auth('b')})).status,401); }
      const r=await call('/api/ai/write-history?uid=a',f,{headers:await auth('a')});assert.equal(r.status,200);const b=await r.json();assert.equal(b.items.length,30);assert(b.items.every(x=>x.score===80));assert.equal(b.items[0].created_at,NOW);
    }finally{f.close();}
  });
  await check('statistics preserve KST day boundaries, streak and owner-only totals',async()=>{
    const f=fixture();try { row(f,'a',60,NOW);row(f,'a',80,NOW-3600000);row(f,'a',100,NOW-DAY);row(f,'b',1,NOW);
      const b=await(await call('/api/ai/write-stats?uid=a',f,{headers:await auth('a')})).json();assert.equal(b.total,3);assert.equal(b.avg_score,80);assert.equal(b.best_score,100);assert.equal(b.streak,2);assert.equal(b.wrote_today,true);assert.deepEqual(b.series.map(x=>[x.date,x.count]),[['2026-11-06',2],['2026-11-07',1]]);
    }finally{f.close();}
  });
  await check('leaderboard masks identities, excludes every guest variant and authenticates personal rank',async()=>{
    const f=fixture();try { row(f,'a',80);row(f,'a',80);row(f,'b',90);for(const uid of ['guest','guest_x','GuestBare'])for(let i=0;i<3;i++)row(f,uid,100);f.raw.exec("INSERT INTO students_erp VALUES('a','김민준',''),('b','','Amy')");
      const b=await(await call('/api/ai/write-leaderboard?uid=b',f,{headers:await auth('a')})).json();assert.deepEqual(b.items.map(x=>x.name),['김✱✱','A✱✱']);assert.equal(b.me,null);assert(b.items.every(x=>!('student_uid' in x)));
      const own=await(await call('/api/ai/write-leaderboard?uid=b',f,{headers:await auth('b')})).json();assert.deepEqual(own.me,{rank:2,count:1});
    }finally{f.close();}
  });
  await check('synthetic correction keeps triage, mission plural matching, feedback and guest reward boundary',async()=>{
    const f=fixture();try { ai(f,{corrected:'I went yesterday. I saw candles and books.',score:88,issues:[{original:'go',suggested:'went',category:'error',reason:'어제 일이므로 과거형으로 써요.'},{original:'absent phrase',suggested:'invented',category:'error',reason:'학생이 쓰지 않은 표현이에요.'}],tip:'꾸준히 연습하면 더 자연스럽게 쓸 수 있어요.',reply:'That sounds like a fun day!',upgrades:[{from:'books',to:'novels',why:'이야기책을 더 구체적으로 나타내는 표현이에요.'},{from:'absent',to:'missing',why:'학생이 쓰지 않은 표현이에요.'}]});
      const b=await(await call('/api/ai/write-correct',f,post({uid:'guest_writing',text:'I go yesterday. I saw candles and books.',mission_words:['candle','book','saw'],topic_id:7}))).json();assert.equal(b.score,88);assert.equal(b.issues.length,1);assert.equal(b.upgrades.length,1);assert.deepEqual(b.mission_used,['candle','book','saw']);assert.equal(b.points_guest,true);assert.equal(b.points,null);assert.deepEqual(b.vocab_saved,[]);assert.equal(b.topic_recorded,true);
      const saved=f.raw.prepare('SELECT student_uid,topic_id,feedback FROM ai_writing_corrections').get();assert.equal(saved.student_uid,'guest_writing');assert.equal(saved.topic_id,7);assert.equal(JSON.parse(saved.feedback).issues.length,1);assert.equal(f.calls.length,1);
    }finally{f.close();}
  });
  // 2026-11-11 계약 변경(엘리더잼 피드백): 못 읽은 답을 «원문 = 수정본·75점» 으로 저장하던 것이 바로 그 버그 → 모든 모델을 시도하고, 그래도 못 읽으면 솔직히 실패(저장 0건).
  await check('model fallback tries every model and unreadable JSON fails honestly without saving a fake correction',async()=>{
    const f=fixture();try { f.env.AI={async run(model){f.calls.push(model);if(f.calls.length===1)throw Error('synthetic unavailable model');return {response:'not JSON'};}};
      const r=await call('/api/ai/write-correct',f,post({text:'hello there'}));const b=await r.json();assert.equal(r.status,502);assert.equal(f.calls.length,3);assert.equal(b.ok,false);assert.equal(b.error,'ai_unreadable');assert.equal(b.corrected,undefined);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM ai_writing_corrections').get().n,0);
    }finally{f.close();}
  });
  await check('legacy table insert fallback does not claim topic submission and persistence failures still return correction',async()=>{
    const f=fixture();try { f.raw.exec('ALTER TABLE ai_writing_corrections DROP COLUMN topic_id');ai(f,{corrected:'Hello there.',score:80});
      const b=await(await call('/api/ai/write-correct',f,post({text:'hello there',uid:'guest_legacy',topic_id:5}))).json();assert.equal(b.ok,true);assert.equal(b.topic_recorded,false);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM ai_writing_corrections').get().n,1);
      f.state.failInsert=true;const failed=await(await call('/api/ai/write-correct',f,post({text:'hello again'}))).json();assert.equal(failed.ok,true);assert.equal(failed.topic_recorded,false);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM ai_writing_corrections').get().n,1);
    }finally{f.close();}
  });
  await check('authenticated writing uses the shared point ledger and respects its daily total cap',async()=>{
    const f=fixture();try { await M.ensurePointTables(f.env);ai(f,{corrected:'Hello there.',score:80});const options=post({uid:'a',text:'hello there'});options.headers={...options.headers,...await auth('a')};
      const wrong=post({uid:'a',text:'hello there'});wrong.headers={...wrong.headers,...await auth('b')};const denied=await(await call('/api/ai/write-correct',f,wrong)).json();assert.equal(denied.points_guest,true);assert.equal(denied.points,null);assert.deepEqual(denied.vocab_saved,[]);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM point_transactions').get().n,0);
      const b=await(await call('/api/ai/write-correct',f,options)).json();assert.equal(b.points_guest,false);assert.equal(b.points.amount,10);assert.equal(f.raw.prepare('SELECT balance FROM student_points WHERE user_id=?').get('a').balance,10);
      f.raw.prepare('INSERT INTO point_transactions(user_id,type,amount,balance_after,rule_code,created_at) VALUES(?,?,?,?,?,?)').run('a','earn',90,100,'ai_writing',NOW);
      const capped=await(await call('/api/ai/write-correct',f,options)).json();assert.equal(capped.points.capped,true);assert.equal(f.raw.prepare('SELECT balance FROM student_points WHERE user_id=?').get('a').balance,10);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM point_transactions').get().n,2);
    }finally{f.close();}
  });
  await check('authenticated correction saves vocabulary once and tags only awkward expressions',async()=>{
    const f=fixture();try {
      ai(f,{corrected:"I went yesterday. I'm not feeling well today.",score:80,issues:[{original:'go',suggested:'went',category:'error',reason:'어제 일이므로 과거형으로 써요.'},{original:'My condition is not good today.',suggested:"I'm not feeling well today.",category:'unnatural',reason:'몸 상태를 말할 때 더 자연스러운 표현이에요.'}]});
      const options=post({uid:'a',text:'I go yesterday. My condition is not good today.'});options.headers={...options.headers,...await auth('a')};
      const b=await(await call('/api/ai/write-correct',f,options)).json();assert.equal(b.issues.length,1);assert.equal(b.suggestions.length,1);assert.equal(b.vocab_saved.length,2);
      assert.equal(f.raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='vocab_tags'").get().n,1,'awkward tag storage was created');
      const tagged=f.raw.prepare('SELECT v.word,t.tag FROM vocabulary v LEFT JOIN vocab_tags t ON t.vocab_id=v.id ORDER BY v.id').all();assert.deepEqual(tagged.map(x=>[x.word,x.tag]),[['went',null],["I'm not feeling well today.",'awkward']]);
      const again=await(await call('/api/ai/write-correct',f,options)).json();assert.deepEqual(again.vocab_saved,[]);assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM vocabulary').get().n,2);
    }finally{f.close();}
  });
  await check('story POST dispatch remains before history GET and rejects unknown actions',async()=>{
    const f=fixture();try { const r=await call('/api/ai/write-history',f,post({action:'unknown'}));assert.equal(r.status,400);assert.deepEqual(f.calls,[]); }finally{f.close();}
  });
  console.log(`PASS ${pass} / FAIL 0 writing module contracts`);
} finally { Date.now=realNow;globalThis.fetch=realFetch;rmSync(temp,{recursive:true,force:true}); }
