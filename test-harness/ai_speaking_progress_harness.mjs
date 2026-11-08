import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

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
  const { DatabaseSync } = await import('node:sqlite');
  const { handleSpeakingSession, recordSpeakingTurn, speakingTextScores } = await import('../cloudflare-deploy/src/ai-speaking-session.ts');
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
      async all() { return { success: true, results: sq.prepare(sql).all(...args) }; }
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
  check('real API route returns server-derived score and completion', () => { assert.equal(finished.result.score, 85); assert.equal(finished.result.finishedNormally, true); });
  check('text engine cannot invent acoustic scores', () => { assert.equal(finished.result.skills.pronunciation, undefined); assert.equal(finished.result.skills.fluency, undefined); });
  check('unique words derive from student speech only', () => assert.deepEqual(finished.result.uniqueWords, ['i', 'like', 'apples', 'are', 'tasty']));
  check('confirmed per-turn reward is distinct from estimate', () => { assert.equal(finished.result.rewards.pointsEarned, 2); assert.equal(finished.result.rewards.gemsBalance, null); });
  const priorCalls = calls;
  for (let n = 0; n < 5; n++) assert.deepEqual((await call({ action: 'finish', sessionId: id })).result, finished.result);
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
    check('missing/invalid assessment keeps score and estimated rewards empty', () => { assert.equal(r.result.score, null); assert.equal(r.result.stars, 0); assert.equal(r.result.gems, 0); assert.equal(r.result.evaluationStatus, 'unavailable'); });
  }
  const sid = await start('warmup'); await turn(sid, { session_id: 'wrong-warmup' }, 'alice', 'warmup');
  assert.equal((await call({ action: 'finish', sessionId: sid })).error, 'no_completed_turns');
  await turn(sid, {}, 'alice', 'warmup');
  sq.exec(`CREATE TABLE student_points(user_id TEXT,balance INTEGER); INSERT INTO student_points VALUES('alice',25);
    CREATE TABLE student_streaks(student_uid TEXT,gems INTEGER); INSERT INTO student_streaks VALUES('alice',30);
    CREATE TABLE student_badges(user_id TEXT,badge_code TEXT,awarded_at INTEGER); INSERT INTO student_badges VALUES('alice','first_class',1);`);
  const insert = sq.prepare('INSERT INTO point_transactions VALUES(?,?,?,?,?)');
  insert.run('alice', 'warmup_talk', 5, Date.now(), '{"session_id":"warm-1"}');
  insert.run('bob', 'warmup_talk', 99, Date.now(), '{"session_id":"warm-1"}');
  insert.run('alice', 'warmup_talk', 88, Date.now(), '{"session_id":"other"}');
  insert.run('alice', 'warmup_talk', 77, Date.now(), '{bad');
  const ledgerBefore = sq.prepare('SELECT * FROM point_transactions').all();
  const warm = await call({ action: 'finish', sessionId: sid });
  check('warmup ownership/source and exact ledger metadata are enforced', () => { assert.equal(warm.result.rewards.pointsEarned, 5); assert.equal(warm.result.rewards.pointsBalance, 25); assert.equal(warm.result.rewards.gemsBalance, 30); assert.deepEqual(warm.result.rewards.badges, ['first_class']); });
  check('viewing results performs no wallet transactions', () => assert.deepEqual(sq.prepare('SELECT * FROM point_transactions').all(), ledgerBefore));
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
  check('expired interrupted claim can be recovered', () => assert.equal(recovered.result.score, 80));
  const failure = await start(); await turn(failure);
  fault = sql => sql.includes("SET status='complete'");
  assert.equal((await call({ action: 'finish', sessionId: failure })).status, 503); fault = null;
  sq.prepare('UPDATE ai_speaking_sessions SET finished_at=? WHERE id=?').run(Date.now() - 31000, failure);
  assert.equal((await call({ action: 'finish', sessionId: failure })).result.score, 80);
  check('failed persistence is retriable without awarding money', () => assert.deepEqual(sq.prepare('SELECT * FROM point_transactions').all(), ledgerBefore));
  const bounded = await start();
  for(let i=0;i<101;i++) await turn(bounded);
  const boundedResult = await call({action:'finish',sessionId:bounded});
  check('long conversations have bounded storage and an explicit partial-data flag',()=>{assert.equal(boundedResult.result.recordedTurns,100);assert.equal(boundedResult.result.captureLimited,true);});
  const corrected = await start();
  await recordSpeakingTurn(request({}),env,{progress_session:corrected,progress_turn:crypto.randomUUID()}, {app:'friend',student:'He go home.',assistant:'Where does he live?',correction:'He goes home.'});
  const correctedResult = await call({action:'finish',sessionId:corrected});
  check('review words come from the actual correction change',()=>assert.deepEqual(correctedResult.result.reviewWords,['goes']));
  const clearRequest = new Request('https://speaking.test/api/ai/chat-clear', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.alice }, body: JSON.stringify({ uid: 'alice' }) });
  const cleared = await handleAiApi(clearRequest, new URL(clearRequest.url), env);
  check('clear chat also removes its copied result transcripts', () => { assert.equal(cleared.status, 200); assert.equal(sq.prepare("SELECT count(*) AS n FROM ai_speaking_sessions WHERE student_uid='alice' AND app='friend'").get().n, 0); });
  check('clearing friend history preserves warmup history and wallet', () => { assert.ok(sq.prepare("SELECT count(*) AS n FROM ai_speaking_sessions WHERE app='warmup'").get().n > 0); assert.deepEqual(sq.prepare('SELECT * FROM point_transactions').all(), ledgerBefore); });
  console.log(`Speaking progress: PASS ${pass} / FAIL 0`);
}
