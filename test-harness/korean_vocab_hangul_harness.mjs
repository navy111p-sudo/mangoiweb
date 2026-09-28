import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hasForeignGloss, isKoreanGloss, normalizeKoreanGloss, repairKoreanGlosses } from '../cloudflare-deploy/src/korean-vocab.ts';

assert.equal(normalizeKoreanGloss('풍부한风味의'), '풍미가 풍부한');
assert.equal(normalizeKoreanGloss('풍부한風味의'), '풍미가 풍부한');
for (const text of ['풍부한风味의', '學校', '𠀀', 'カレー', 'あい', '金']) assert.equal(hasForeignGloss(text), true);
for (const text of ['사과', '풍미가 풍부한', '밝은 (색)', '3차원', '비타민 C']) assert.equal(isKoreanGloss(text), true);
for (const text of ['', null, '風味', 'apple', '뜻�']) assert.equal(isKoreanGloss(text), false);
const original = [{ word: 'school', korean: '學校' }, { word: 'flavorful', korean: '풍부한风味의' }, { word: 'apple', korean: '사과' }];
const fixed = await repairKoreanGlosses(original, { run: async () => ({ response: '[{"id":0,"word":"school","korean":"학교"}]' }) });
assert.deepEqual(fixed.map(r => r.korean), ['학교', '풍미가 풍부한', '사과']);
assert.equal(original[0].korean, '學校');
for (const response of ['not json', '[{"id":0,"word":"school","korean":"学校"}]', '[{"id":0,"word":"apple","korean":"사과"}]', '[{"id":0,"word":"school","korean":"학교"},{"id":0,"word":"school","korean":"다른 뜻"}]']) {
  assert.equal((await repairKoreanGlosses(original, { run: async () => ({ response }) }))[0].korean, '學校');
}
assert.equal((await repairKoreanGlosses(original, { run: async () => { throw Error('offline'); } }))[0].korean, '學校');
let calls = 0;
await repairKoreanGlosses(Array.from({ length: 41 }, () => ({ word: 'school', korean: '學校' })), { run: async (_, input) => {
  calls++;
  const batch = JSON.parse(input.messages[1].content);
  assert.ok(batch.length <= 20);
  return { response: JSON.stringify(batch.map(r => ({ ...r, korean: '학교' }))) };
} });
assert.equal(calls, 3);

// Execute the real gen-quiz route with a fake database, preserving SQL routing and INSERT parameters.
const src = readFileSync(new URL('../cloudflare-deploy/src/api-games.ts', import.meta.url), 'utf8');
const start = src.indexOf("    if (method === 'POST' && path === '/api/vocab/gen-quiz')");
const end = src.indexOf("    // ── POST /api/vocab/quiz-submit", start);
assert.ok(start > 0 && end > start);
const wrapped = stripTypeScriptTypes('async function routeFixture() {\n' + src.slice(start, end) + '\n}');
const code = wrapped.slice(wrapped.indexOf('{') + 1, wrapped.lastIndexOf('}'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const route = new AsyncFunction('env', 'request', 'sourceName', 'normalizeKoreanGloss', 'isCleanText', `
  const method='POST', path='/api/vocab/gen-quiz';
  const ensureMicroLearnSchema=async()=>{};
  const json=x=>x;
  ${code}`);
async function quiz(sourceName, glosses, distractors) {
  const saved = [];
  const env = { DB: { prepare(sql) {
    let binds;
    return { bind(...values) { binds = values; return this; },
      async all() { return { results: /SELECT (ko AS korean|korean FROM)/.test(sql) ? distractors.map(korean => ({ korean })) : glosses.map((korean, i) => ({ id: i + 1, word: 'word' + i, korean })) }; },
      async first() { return { level: 'A1', n: glosses.length }; },
      async run() { saved.push(binds); return { meta: { last_row_id: saved.length } }; },
    };
  } } };
  const result = await route(env, { json: async () => ({ user_id: 'fixture', source: sourceName, count: glosses.length || 1 }) }, sourceName, normalizeKoreanGloss, isKoreanGloss);
  return { result, saved };
}
for (const source of ['mywords', 'textbook']) {
  for (let trial = 0; trial < 20; trial++) {
    const { result, saved } = await quiz(source, ['풍부한风味의', '學校'], ['풍미가 풍부한', '학교', '学校', '연필', '고아']);
    assert.equal(result.ok, true);
    assert.equal(result.quizzes.length, 1);
    const q = result.quizzes[0];
    assert.equal(q.options[q.correct_index], '풍미가 풍부한');
    assert.equal(new Set(q.options).size, q.options.length);
    assert.ok(q.options.every(isKoreanGloss));
    assert.deepEqual(JSON.parse(saved[0][2]), q.options);
    assert.equal(saved[0][3], q.correct_index);
  }
}
assert.equal((await quiz('mywords', ['學校'], ['学校'])).result.error, 'no_usable_words');
assert.equal((await quiz('mywords', ['사과'], ['사과'])).result.error, 'no_usable_words');
console.log('PASS: Hangul detection, meaning-preserving repairs, AI failure handling, batches, and both quiz sources with correct scoring.');

// Exercise the migration CLI with a mocked Cloudflare API: pagination, dry-run, and CAS conflicts.
const directory = mkdtempSync(join(tmpdir(), 'gloss-repair-'));
try {
  const planPath = join(directory, 'plan.json');
  const cli = new URL('../cloudflare-deploy/scripts/repair-korean-vocab.mjs', import.meta.url).href;
  const mock = `
    import assert from 'node:assert/strict';
    let updates = 0;
    globalThis.fetch = async (url, options) => {
      assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/test-account/'));
      const {sql, params} = JSON.parse(options.body);
      let result;
      if (sql.startsWith('SELECT MAX')) result = {success:true,results:[{n:251}]};
      else if (sql.startsWith('SELECT id')) {
        result = {success:true,results:params[0]===0
          ? Array.from({length:250},(_,i)=>({id:i+1,word:'apple',korean:'사과',example:''}))
          : [{id:251,word:'flavorful',korean:'풍부한风味의',example:''}]};
      } else {
        assert.ok(sql.startsWith('UPDATE '));
        assert.ok(sql.endsWith('WHERE id = ? AND ' + (sql.includes('vocab_synonyms')?'meaning_ko':sql.includes('en_vocab')?'ko':'korean') + ' = ?'));
        assert.deepEqual(params,['풍미가 풍부한',251,'풍부한风味의']);
        updates++;
        result={success:true,meta:{changes:sql.includes('en_vocab')?0:1}};
      }
      return {ok:true,status:200,json:async()=>({success:true,result:[result]})};
    };
  `;
  const env = { ...process.env, CLOUDFLARE_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_DATABASE_ID: 'test-database' };
  const scan = spawnSync(process.execPath, ['--input-type=module', '-e', mock + `process.argv=['node','repair','--plan',${JSON.stringify(planPath)}]; await import(${JSON.stringify(cli)}); assert.equal(updates,0);`], {env, encoding:'utf8'});
  assert.equal(scan.status, 0, scan.stderr);
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  assert.equal(plan.items.length, 3);
  assert.equal(plan.counts.vocabulary, 251);
  assert.ok(plan.items.every(item => item.after === '풍미가 풍부한'));
  const apply = spawnSync(process.execPath, ['--input-type=module', '-e', mock + `process.argv=['node','repair','--apply',${JSON.stringify(planPath)}]; await import(${JSON.stringify(cli)}); assert.equal(updates,3);`], {env, encoding:'utf8'});
  assert.equal(apply.status, 2, apply.stderr); // Concurrent edit is reported, never overwritten.
  const stats = JSON.parse(apply.stdout.trim());
  assert.deepEqual([stats.changed, stats.conflicts, stats.unresolved], [2,1,0]);
  console.log('PASS: full-table pagination, no dry-run writes, original-value backup, and concurrent-edit protection.');
} finally { rmSync(directory, {recursive:true, force:true}); }
