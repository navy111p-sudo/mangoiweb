import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readSpeakingVocabularyWeek } from '../src/ai-speaking-vocabulary.ts';

const now = Date.parse('2026-11-08T03:00:00Z');
const start = Date.parse('2026-11-01T15:00:00Z');
function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE ai_speaking_sessions(student_uid TEXT,status TEXT,finished_at INTEGER,result_json TEXT,capture_limited INTEGER)`);
  const db = { prepare(query: string) { return { bind(...args: any[]) {
    return { all: async () => ({ results: sql.prepare(query).all(...args) }) };
  } }; } };
  function insert(uid: string, at: number, words: string[], status = 'complete', limited = 0) {
    sql.prepare('INSERT INTO ai_speaking_sessions VALUES(?,?,?,?,?)').run(uid, status, at, JSON.stringify({ uniqueWords: words }), limited);
  }
  return { sql, db, insert };
}
test('completed words deduplicate across daily sessions with exact student identity and KST boundaries', async () => {
  const { sql, db, insert } = database();
  try {
    insert('Lee', start - 1, ['old']); insert('Lee', start, ['Hello', 'hello', 'world']);
    insert('Lee', start + 1, ['world', "don't"], 'complete', 1);
    insert('Lee', start + 86400000, ['world']);
    insert('lee', start, ['other']); insert('Kim', start, ['private']);
    insert('Lee', now, ['today']); insert('Lee', now + 1, ['future']);
    insert('Lee', now, ['unfinished'], 'evaluating');
    const week = await readSpeakingVocabularyWeek(db, 'Lee', now);
    assert.deepEqual(week?.map(d => d.words), [3,1,0,0,0,0,1]);
    assert.equal(week?.[0].date, '2026-11-02'); assert.equal(week?.[6].date, '2026-11-08');
    assert.equal(week?.[0].limited, true); assert.equal(week?.[1].limited, false);
    assert.equal((await readSpeakingVocabularyWeek(db, 'lee', now))?.[0].words, 1);
    assert.deepEqual((await readSpeakingVocabularyWeek(db, 'none', now))?.map(d => d.words), Array(7).fill(0));
  } finally { sql.close(); }
});
test('unavailable or corrupt records are unknown, not a zero week', async () => {
  assert.equal(await readSpeakingVocabularyWeek({ prepare() { throw Error('offline'); } }, 'Lee', now), null);
  for (const response of [{}, { success: false, results: [] }]) {
    assert.equal(await readSpeakingVocabularyWeek({ prepare: () => ({ bind: () => ({ all: async () => response }) }) }, 'Lee', now), null);
  }
  for (const value of ['broken', '{}', '{"uniqueWords":[3]}', '{"uniqueWords":["<script>"]}']) {
    const { sql, db } = database();
    try {
      sql.prepare('INSERT INTO ai_speaking_sessions VALUES(?,?,?,?,?)').run('Lee', 'complete', now, value, 0);
      assert.equal(await readSpeakingVocabularyWeek(db, 'Lee', now), null);
    } finally { sql.close(); }
  }
  assert.equal(await readSpeakingVocabularyWeek({}, '', now), null);
  assert.equal(await readSpeakingVocabularyWeek({}, 'Lee', NaN), null);
});
test('week rolls over at KST midnight without including expired words', async () => {
  const { sql, db, insert } = database();
  try {
    insert('Lee', start, ['expired']);
    const midnight = Date.parse('2026-11-08T15:00:00Z');
    insert('Lee', midnight, ['new']);
    const week = await readSpeakingVocabularyWeek(db, 'Lee', midnight);
    assert.equal(week?.[0].date, '2026-11-03');
    assert.deepEqual(week?.map(d => d.words), [0,0,0,0,0,0,1]);
  } finally { sql.close(); }
});

// The same completed-practice evidence is used in parent and academy period reports.
import {readSpeakingVocabularyCounts} from '../src/speaking-growth.ts';
test('report vocabulary deduplicates the period and preserves account and time boundaries',async()=>{
 const {sql,db,insert}=database();try{
  insert('Lee',start,['Hello','world']);insert('Lee',now,['hello','apple'],'complete',1);
  insert('lee',now,['private']);insert('Lee',now,['unfinished'],'open');insert('Lee',now+1,['future']);
  assert.deepEqual(await readSpeakingVocabularyCounts(db,'Lee',start,now+1),{sessions:2,uniqueWords:3,limited:true});
  assert.deepEqual(await readSpeakingVocabularyCounts(db,'none',start,now+1),{sessions:0,uniqueWords:0,limited:false});
  sql.prepare("UPDATE ai_speaking_sessions SET result_json='broken' WHERE student_uid='Lee'").run();
  assert.equal(await readSpeakingVocabularyCounts(db,'Lee',start,now+1),null);
 }finally{sql.close();}
 assert.equal(await readSpeakingVocabularyCounts({},'Lee',start,now+1),null);
 assert.equal(await readSpeakingVocabularyCounts({},'Lee',now,start),null);
});
