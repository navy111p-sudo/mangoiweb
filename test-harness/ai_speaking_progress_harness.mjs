import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
if (!process.env.SPEAKING_PROGRESS_CHILD) {
  const dir = mkdtempSync(join(tmpdir(), 'speaking-progress-'));
  try {
    writeFileSync(join(dir, 'hooks.mjs'), `import {existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';
export async function resolve(spec,ctx,next){if(spec.startsWith('.')&&!/\\.(ts|js|mjs|json)$/.test(spec)&&ctx.parentURL){const u=new URL(spec+'.ts',ctx.parentURL);if(existsSync(fileURLToPath(u)))return next(u.href,ctx);}return next(spec,ctx);}`);
    writeFileSync(join(dir, 'register.mjs'), `import {register} from 'node:module';register('./hooks.mjs',import.meta.url);`);
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', pathToFileURL(join(dir, 'register.mjs')).href, fileURLToPath(import.meta.url)], {
      env: { ...process.env, SPEAKING_PROGRESS_CHILD: '1' }, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024
    });
    process.stdout.write(child.stdout || ''); process.stderr.write(child.stderr || '');
    process.exitCode = child.status ?? 1;
    if (!process.exitCode) {
      const unit = spawnSync(process.execPath, ['--test', ...['ai-speaking-progress.test.ts', 'ai-speaking-progress-view.test.cjs', 'ai-speaking-progress-controller.test.cjs', 'ai-speaking-settings-timing.test.cjs'].map(f => join(ROOT, 'cloudflare-deploy/test', f))], { encoding: 'utf8', timeout: 30000 });
      process.stdout.write(unit.stdout || ''); process.stderr.write(unit.stderr || ''); process.exitCode = unit.status ?? 1;
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
} else {
  globalThis.fetch = async () => { throw new Error('External network is forbidden in this sandbox'); };
  const { DatabaseSync } = await import('node:sqlite');
  const { handleSpeakingSession, recordSpeakingTurn, speakingTextScores } = await import('../cloudflare-deploy/src/ai-speaking-session.ts');
  const { awardSpeakingPoints } = await import('../cloudflare-deploy/src/speaking-points.ts');
  const { handleAiApi } = await import('../cloudflare-deploy/src/api-ai.ts');
  const { signUidToken } = await import('../cloudflare-deploy/src/auth-token.ts');
  const { evaluateSpeaking } = await import('../cloudflare-deploy/src/ai-speaking-progress.ts');
  let pass = 0;
  const check = (name, fn) => { fn(); pass++; console.log('PASS ' + name); };
  const sq = new DatabaseSync(':memory:');
  sq.exec('CREATE TABLE point_transactions(user_id TEXT,rule_code TEXT,amount INTEGER,created_at INTEGER,meta TEXT)');
  let fault = null;
  const DB = { async exec(sql) { sq.exec(sql); }, prepare(sql) {
    const statement = (args = []) => ({ bind: (...values) => statement(values),
      async run() { if (fault?.(sql)) throw Error('injected DB failure'); const r = sq.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      async first() { if (fault?.(sql)) throw Error('injected DB failure'); return sq.prepare(sql).get(...args) || null; },
      async all() { if (fault?.(sql)) throw Error('injected DB failure'); return { success: true, results: sq.prepare(sql).all(...args) }; }
    }); return statement();
  }};
  let calls = 0, model = async () => ({ response: JSON.stringify({ skills: { grammar: 80, vocabulary: 90, sentence: 85, pronunciation: 100 } }) });
  const env = { DB, ROOM_JWT_SECRET: 'local-sandbox-only', AI: { async run(...args) { calls++; return model(...args); } } };
  const tokens = {};
  for (const uid of ['alice', 'bob', 'guest-local']) tokens[uid] = await signUidToken(uid, env);
  const request = (body, uid = 'alice') => new Request('https://speaking.test/api/ai/speaking-progress', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tokens[uid] ? { Authorization: 'Bearer ' + tokens[uid] } : {}) }, body: JSON.stringify(body) });
  const call = async (body, uid = 'alice', route = handleSpeakingSession) => {
    const r = request(body, uid), response = await route(r, new URL(r.url), env);
    return { status: response.status, ...(await response.json()) };
  };
  const start = async (app = 'friend', sourceId = 'warm-1') => (await call({ action: 'start', app, sourceId })).sessionId;
  const turn = async (id, extra = {}, uid = 'alice', app = 'friend') => {
    const b = { progress_session: id, progress_turn: crypto.randomUUID(), session_id: 'warm-1', ...extra };
    await recordSpeakingTurn(request({}, uid), env, b, { app, student: 'I like apples. Apples are tasty.', assistant: 'What fruit do you like?', correction: 'I like apples.', points: 2 });
    return b;
  };
  for (const uid of ['missing', 'guest-local']) {
    const r = await call({ action: 'start', app: 'friend' }, uid);
    check(uid + ' cannot create evaluated sessions', () => assert.equal(r.status, 401));
  }
  const voice = await start();
  const wav = Buffer.alloc(32044);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
  wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
  const blockExternal = globalThis.fetch;
  let voiceRequests = 0;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/koreacentral\.stt\.speech\.microsoft\.com/);
    assert.equal(init.body.byteLength, wav.length);
    voiceRequests++;
    return Response.json({RecognitionStatus:'Success', NBest:[{Display:'I like apples.',
      PronunciationAssessment:{AccuracyScore:91,FluencyScore:82,CompletenessScore:100}}]});
  };
  env.AZURE_SPEECH_KEY = 'sandbox-azure-speech-only';
  env.AZURE_SPEECH_REGION = 'koreacentral';
  try {
    const audio = {progress_audio:wav.toString('base64')};
    await turn(voice,audio,'bob');
    const first = await turn(voice,audio);
    await turn(voice,first);
    const measured = await call({action:'finish',sessionId:voice});
    check('voice marks use the authenticated audio assessment and five-skill overall score', () => {
      assert.equal(voiceRequests,1);
      assert.equal(measured.result.skills.pronunciation,91);
      assert.equal(measured.result.skills.fluency,82);
      assert.equal(measured.result.score,86);
      assert.equal(measured.result.acousticSample,true);
      assert.doesNotMatch(sq.prepare('SELECT turns_json FROM ai_speaking_sessions WHERE id=?').get(voice).turns_json,/UklGR/);
    });
  } finally {
    globalThis.fetch = blockExternal;
    delete env.AZURE_SPEECH_KEY;
    delete env.AZURE_SPEECH_REGION;
  }
  calls = 0;
  const id = await start();
  const empty = await call({ action: 'finish', sessionId: id });
  check('empty session cannot finish', () => assert.equal(empty.error, 'no_completed_turns'));
  await turn(id, { kickoff: true });
  check('synthetic greeting is excluded', () => assert.equal(JSON.parse(sq.prepare('SELECT turns_json FROM ai_speaking_sessions WHERE id=?').get(id).turns_json).length, 0));
  await turn(id, {}, 'bob');
  assert.equal((await call({ action: 'finish', sessionId: id })).error, 'no_completed_turns');
  const foreign = await call({ action: 'finish', sessionId: id }, 'bob');
  check('another account cannot append or finish', () => assert.equal(foreign.status, 404));
  const body = await turn(id);
  await turn(id, body);
  sq.prepare('INSERT INTO point_transactions VALUES(?,?,?,?,?)').run('alice', 'ai_friend_chat', 2, Date.now(), JSON.stringify({ speaking_session: id }));
  check('a replayed turn is stored once', () => assert.equal(JSON.parse(sq.prepare('SELECT turns_json FROM ai_speaking_sessions WHERE id=?').get(id).turns_json).length, 1));
  const finished = await call({ action: 'finish', sessionId: id, skills: { grammar: 100 }, gems: 99999 }, 'alice', handleAiApi);
  check('real API route returns server-derived score and completion', () => { assert.equal(finished.result.score, null); assert.equal(finished.result.skills.grammar,80); assert.equal(finished.result.finishedNormally, true); });
  check('text engine cannot invent acoustic scores', () => { assert.equal(finished.result.skills.pronunciation, undefined); assert.equal(finished.result.skills.fluency, undefined); });
  check('unique words derive from student speech only', () => assert.deepEqual(finished.result.uniqueWords, ['i', 'like', 'apples', 'are', 'tasty']));
  check('confirmed per-turn reward is distinct from estimate', () => { assert.equal(finished.result.rewards.pointsEarned, 2); assert.equal(finished.result.rewards.gemsBalance, null); });
  check('fresh completion includes this practice in seven-day vocabulary', () => {
    assert.equal(finished.result.weeklyVocabulary.length,7);
    assert.equal(finished.result.weeklyVocabulary.at(-1).words,5);
  });
  const beforeHistoryCalls=calls;
  const history=await call({action:'history'});
  check('history reads are authenticated and never evaluate or award',()=>{assert.equal(history.weeklyVocabulary.at(-1).words,5);assert.equal(calls,beforeHistoryCalls);});
  assert.equal((await call({action:'history'},'missing')).status,401);
  assert.equal((await call({action:'history'},'bob')).weeklyVocabulary.at(-1).words,0);
  const priorCalls = calls;
  for (let n = 0; n < 5; n++) assert.deepEqual((await call({ action: 'finish', sessionId: id })).result, finished.result);
  fault = sql => sql.includes('SELECT finished_at,result_json,capture_limited');
  const withoutHistory = await call({action:'finish',sessionId:id}); fault = null;
  check('history lookup failure preserves cached assessment without regrading', () => {
    assert.equal(withoutHistory.status,200);assert.equal(withoutHistory.result.weeklyVocabulary,null);
    assert.equal(withoutHistory.result.skills.grammar,80);assert.equal(calls,priorCalls);
  });
  await turn(id);
  check('reopening results neither grades nor records again', () => { assert.equal(calls, priorCalls); assert.equal(JSON.parse(sq.prepare('SELECT turns_json FROM ai_speaking_sessions WHERE id=?').get(id).turns_json).length, 1); });
  for (const bad of [null, '80', NaN, Infinity, -1, 101, {}, []]) {
    check('invalid model score rejected: ' + String(bad), () => assert.throws(() => speakingTextScores({ skills: { grammar: bad, vocabulary: 80, sentence: 80 } })));
  }
  for (const score of [0, 1, 49, 75, 90, 99, 100]) {
    check('measured score boundary ' + score, () => assert.equal(speakingTextScores({ skills: { grammar: score, vocabulary: score, sentence: score } }).grammar, score));
  }
  const sample = { lessonId: 'x', studentId: 'alice', finishedNormally: true, evaluatedAt: new Date().toISOString(), evaluationSource: 'test', skills: {}, spokenWords: [], correctedWords: [], sentencesCompleted: 0 };
  for (const patch of [{ finishedNormally: 'true' }, { evaluatedAt: 'bad' }, { skills: null }, { spokenWords: [42] }, { studentId: {} }])
    check('untrusted evaluation shape ' + JSON.stringify(patch), () => assert.throws(() => evaluateSpeaking({ ...sample, ...patch })));
  for (const output of [null, { response: '{}' }, { response: '<html>bad</html>' }]) {
    const sid = await start(); await turn(sid); model = async () => output;
    const r = await call({ action: 'finish', sessionId: sid });
    check('missing/invalid assessment keeps score and estimated rewards empty', () => { assert.equal(r.result.score, null); assert.equal('stars' in r.result,false); assert.equal('gems' in r.result,false); assert.equal(r.result.evaluationStatus, 'unavailable'); });
  }
  const sid = await start('warmup'); await turn(sid, { session_id: 'wrong-warmup' }, 'alice', 'warmup');
  assert.equal((await call({ action: 'finish', sessionId: sid })).error, 'no_completed_turns');
  await turn(sid, {}, 'alice', 'warmup');
  sq.exec(`CREATE TABLE student_points(user_id TEXT,balance INTEGER); INSERT INTO student_points VALUES('alice',25);
    CREATE TABLE student_streaks(student_uid TEXT,gems INTEGER); INSERT INTO student_streaks VALUES('alice',30);
    CREATE TABLE IF NOT EXISTS student_badges(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,badge_code TEXT NOT NULL,awarded_at INTEGER NOT NULL,UNIQUE(user_id,badge_code)); INSERT INTO student_badges(user_id,badge_code,awarded_at) VALUES('alice','first_class',1);`);
  const insert = sq.prepare('INSERT INTO point_transactions VALUES(?,?,?,?,?)');
  insert.run('alice', 'warmup_talk', 5, Date.now(), '{"session_id":"warm-1"}');
  insert.run('bob', 'warmup_talk', 99, Date.now(), '{"session_id":"warm-1"}');
  insert.run('alice', 'warmup_talk', 88, Date.now(), '{"session_id":"other"}');
  insert.run('alice', 'warmup_talk', 77, Date.now(), '{bad');
  const ledgerBefore = sq.prepare('SELECT * FROM point_transactions').all();
  const warm = await call({ action: 'finish', sessionId: sid });
  check('warmup ownership/source and exact ledger metadata are enforced', () => { assert.equal(warm.result.rewards.pointsEarned, 5); assert.equal(warm.result.rewards.pointsBalance, 25); assert.equal(warm.result.rewards.gemsBalance, 30); assert.deepEqual(warm.result.rewards.badges, ['first_class']); });
  check('viewing results performs no wallet transactions', () => assert.deepEqual(sq.prepare('SELECT * FROM point_transactions').all(), ledgerBefore));
  sq.exec(`ALTER TABLE student_points ADD COLUMN lifetime_earned INTEGER DEFAULT 0;
    UPDATE student_points SET lifetime_earned=1000 WHERE user_id='alice';
    CREATE TABLE student_evaluations(id INTEGER PRIMARY KEY,student_uid TEXT,score_overall REAL,evaluation_source TEXT,score_scale INTEGER);
    INSERT INTO student_evaluations VALUES(1,'alice',50,'ai_lesson_report',100);`);
  const badgeSession=await start();await turn(badgeSession);await call({action:'finish',sessionId:badgeSession});
  check('existing points badges are awarded once without crediting the wallet',()=>{assert.equal(sq.prepare("SELECT count(*) AS n FROM student_badges WHERE user_id='alice' AND badge_code='points_1000'").get().n,1);assert.equal(sq.prepare("SELECT count(*) AS n FROM student_badges WHERE user_id='alice' AND badge_code='eval_perfect'").get().n,0);assert.deepEqual(sq.prepare('SELECT * FROM point_transactions').all(),ledgerBefore);});
  sq.prepare('UPDATE student_evaluations SET score_overall=100 WHERE id=1').run();
  const perfectSession=await start();await turn(perfectSession);await call({action:'finish',sessionId:perfectSession});
  check('perfect-score badge uses the verified rubric rather than raw score >=10',()=>assert.equal(sq.prepare("SELECT count(*) AS n FROM student_badges WHERE user_id='alice' AND badge_code='eval_perfect'").get().n,1));
  const another=await start();await turn(another);await call({action:'finish',sessionId:another});
  check('repeated completion cannot duplicate existing badges',()=>assert.equal(sq.prepare("SELECT count(*) AS n FROM student_badges WHERE user_id='alice' AND badge_code IN ('points_1000','eval_perfect')").get().n,2));
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  model = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const concurrent = await start(); await turn(concurrent);
  const first = call({ action: 'finish', sessionId: concurrent }); await ready;
  const second = await call({ action: 'finish', sessionId: concurrent });
  check('double finish cannot run a second evaluator', () => assert.equal(second.error, 'evaluation_pending'));
  release({ response: '{"skills":{"grammar":80,"vocabulary":80,"sentence":80}}' }); await first;
  const interrupted = await start(); await turn(interrupted);
  sq.prepare("UPDATE ai_speaking_sessions SET status='evaluating',finished_at=? WHERE id=?").run(Date.now() - 31000, interrupted);
  model = async () => ({ response: '{"skills":{"grammar":80,"vocabulary":80,"sentence":80}}' });
  const recovered = await call({ action: 'finish', sessionId: interrupted });
  check('expired interrupted claim can be recovered', () => assert.equal(recovered.result.skills.grammar, 80));
  const failure = await start(); await turn(failure);
  fault = sql => sql.includes("SET status='complete'");
  assert.equal((await call({ action: 'finish', sessionId: failure })).status, 503); fault = null;
  sq.prepare('UPDATE ai_speaking_sessions SET finished_at=? WHERE id=?').run(Date.now() - 31000, failure);
  assert.equal((await call({ action: 'finish', sessionId: failure })).result.skills.grammar, 80);
  check('failed persistence is retriable without awarding money', () => assert.deepEqual(sq.prepare('SELECT * FROM point_transactions').all(), ledgerBefore));
  const bounded = await start();
  for(let i=0;i<101;i++) await turn(bounded);
  const boundedResult = await call({action:'finish',sessionId:bounded});
  check('long conversations have bounded storage and an explicit partial-data flag',()=>{assert.equal(boundedResult.result.recordedTurns,100);assert.equal(boundedResult.result.captureLimited,true);});
  const pointSql = new DatabaseSync(':memory:');
  try {
    pointSql.exec(`CREATE TABLE point_awards(award_id TEXT PRIMARY KEY,user_id,credited_at);
      CREATE TABLE student_points(user_id TEXT PRIMARY KEY,student_name,balance,lifetime_earned,last_earned_at,updated_at);
      CREATE TABLE point_transactions(id INTEGER PRIMARY KEY,user_id,student_name,type,amount,balance_after,reason,rule_code,created_at,meta);
      CREATE TABLE point_rule_log(user_id,rule_code,amount,triggered_at,txn_id,meta);`);
    let abortLedger = true;
    const db = {
      prepare(sql) { return {bind:(...args)=>({sql,args})}; },
      async batch(statements) {
        pointSql.exec('BEGIN');
        try {
          const results = statements.map(({sql,args}) => {
            if (abortLedger && sql.includes('INSERT INTO point_transactions')) throw Error('ledger unavailable');
            const stmt = pointSql.prepare(sql);
            const results = sql.includes('RETURNING') ? stmt.all(...args) : (stmt.run(...args), []);
            return {meta:{changes:pointSql.prepare('SELECT changes() AS n').get().n},results};
          });
          pointSql.exec('COMMIT');
          return results;
        } catch(error) { pointSql.exec('ROLLBACK'); throw error; }
      }
    };
    const award = {uid:'alice',rule:'warmup_talk',key:'warm-1',amount:5,label:'practice',dailyCap:1,meta:{session_id:'warm-1'}};
    await assert.rejects(awardSpeakingPoints(db,award));
    abortLedger = false;
    const paid = await Promise.all([awardSpeakingPoints(db,award),awardSpeakingPoints(db,award),
      awardSpeakingPoints(db,{...award,key:'warm-2',meta:{session_id:'warm-2'}})]);
    check('reward rollback allows retry; duplicates and parallel daily awards pay once', () => {
      assert.equal(paid.filter(Boolean).length,1);
      assert.equal(pointSql.prepare('SELECT balance FROM student_points').get().balance,5);
      assert.equal(pointSql.prepare('SELECT txn_id FROM point_rule_log').get().txn_id,paid.find(Boolean).txnId);
    });
  } finally { pointSql.close(); }
  const corrected = await start();
  await recordSpeakingTurn(request({}),env,{progress_session:corrected,progress_turn:crypto.randomUUID()}, {app:'friend',student:'He go home.',assistant:'Where does he live?',correction:'He goes home.'});
  const correctedResult = await call({action:'finish',sessionId:corrected});
  check('review words come from the actual correction change',()=>assert.deepEqual(correctedResult.result.reviewWords,['goes']));
  // Compile the actual Worker, as the existing speech harness does, to verify both routing and capture.
  const require = createRequire(join(ROOT,'cloudflare-deploy/package.json'));
  const bundled = require('esbuild').buildSync({entryPoints:[join(ROOT,'cloudflare-deploy/src/index.ts')],bundle:true,write:false,platform:'node',format:'cjs',external:['cloudflare:*']}).outputFiles[0].text;
  const workerModule={exports:{}}; new Function('module','exports','require',bundled)(workerModule,workerModule.exports,require);
  const cache=new Map();
  const workerDB={...DB,prepare(sql){
    if(sql.includes('ai_speaking_sessions'))return DB.prepare(sql);
    try{sq.prepare(sql);return DB.prepare(sql);}catch{return {bind(){return this;},async first(){return null;},async all(){return {success:true,results:[]};},async run(){return {success:true,meta:{changes:0}};}};}
  }};
  const workerEnv={...env,DB:workerDB,SESSION_STATE:{async get(key){return cache.get(key)||null;},async put(key,value){cache.set(key,value);},async delete(key){cache.delete(key);}}};
  const worker=workerModule.exports.default;
  const context={waitUntil(){}};
  const anonymous=await worker.fetch(request({action:'start',app:'friend'},'missing'),workerEnv,context);
  check('full Worker keeps result requests authenticated',()=>assert.equal(anonymous.status,401));
  const startRequest=request({action:'start',app:'warmup',sourceId:'worker-warmup'});
  const startedResponse=await worker.fetch(startRequest,workerEnv,context);
  const startedBody=await startedResponse.json();
  check('full Worker dispatches the authenticated result endpoint',()=>{assert.equal(startedResponse.status,200);assert.ok(startedBody.sessionId);});
  workerEnv.AI={async run(){return {response:'{"reply":"Apples sound tasty. What fruit do you like?","fix":null}'};}};
  const warmRequest=new Request('https://speaking.test/api/warmup/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.alice},body:JSON.stringify({session_id:'worker-warmup',user_id:'alice',student_input:'I like apples.',difficulty:3,lang:'en',progress_session:startedBody.sessionId,progress_turn:crypto.randomUUID()})});
  const warmResponse=await worker.fetch(warmRequest,workerEnv,context), warmBody=await warmResponse.json();
  check('full Worker records only its successful authenticated warmup reply',()=>{assert.equal(warmResponse.status,200,JSON.stringify(warmBody));assert.equal(JSON.parse(sq.prepare('SELECT turns_json FROM ai_speaking_sessions WHERE id=?').get(startedBody.sessionId).turns_json).length,1);});
  const timed = await start(); await turn(timed);
  const nativeTimer = globalThis.setTimeout; let delay = 0;
  model = () => new Promise(()=>{});
  globalThis.setTimeout = (fn, ms) => { delay = ms; return nativeTimer(fn, 1); };
  try {
    const r = await call({action:'finish',sessionId:timed});
    check('evaluator timeout returns unmeasured results and releases its claim',()=>{assert.equal(delay,15000);assert.equal(r.result.score,null);assert.equal(r.result.evaluationStatus,'unavailable');});
  } finally { globalThis.setTimeout = nativeTimer; }
  const fenced = await start(); await turn(fenced);
  const nativeNow=Date.now; let clock=nativeNow(), releaseOld, oldEntered;
  Date.now=()=>clock;
  const oldReady=new Promise(resolve=>{oldEntered=resolve;}); let attempt=0;
  model=()=>++attempt===1?(oldEntered(),new Promise(resolve=>{releaseOld=resolve;})):Promise.resolve({response:'{"skills":{"grammar":80,"vocabulary":80,"sentence":80}}'});
  try {
    const older=call({action:'finish',sessionId:fenced}); await oldReady; clock+=31001;
    const newer=await call({action:'finish',sessionId:fenced});
    releaseOld({response:'{"skills":{"grammar":100,"vocabulary":100,"sentence":100}}'});
    const stale=await older;
    check('a stale evaluator cannot overwrite a recovered session result',()=>{assert.equal(newer.result.skills.grammar,80);assert.equal(stale.status,503);});
    assert.equal((await call({action:'finish',sessionId:fenced})).result.skills.grammar,80);
  } finally {Date.now=nativeNow;}
  const bobSession=(await call({action:'start',app:'friend'},'bob')).sessionId;
  await turn(bobSession,{},'bob');
  const clearRequest = new Request('https://speaking.test/api/ai/chat-clear', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.alice }, body: JSON.stringify({ uid: 'alice' }) });
  const cleared = await handleAiApi(clearRequest, new URL(clearRequest.url), env);
  check('clear chat also removes its copied result transcripts', () => { assert.equal(cleared.status, 200); assert.equal(sq.prepare("SELECT count(*) AS n FROM ai_speaking_sessions WHERE student_uid='alice' AND app='friend'").get().n, 0); });
  check('clearing friend history preserves other accounts, warmup history and wallet', () => { assert.ok(sq.prepare("SELECT count(*) AS n FROM ai_speaking_sessions WHERE app='warmup'").get().n > 0);assert.ok(sq.prepare("SELECT count(*) AS n FROM ai_speaking_sessions WHERE student_uid='bob'").get().n > 0); assert.deepEqual(sq.prepare('SELECT * FROM point_transactions').all(), ledgerBefore); });
  console.log(`Speaking progress: PASS ${pass} / FAIL 0`);
}
