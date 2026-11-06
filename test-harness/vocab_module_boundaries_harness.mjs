// Shipped dispatcher + local SQLite. Real ownership tokens, no live AI/DB/network.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.env.VOCAB_MODULE_SRC_DIR || join(root, 'cloudflare-deploy/src');
const { buildSync } = createRequire(import.meta.url)('../cloudflare-deploy/node_modules/esbuild');
const temp = mkdtempSync(join(tmpdir(), 'mangoi-vocab-contracts-'));
const realFetch = globalThis.fetch, realNow = Date.now, NOW = Date.now(), DAY = Math.floor((NOW + 9 * 3600000) / 86400000);
let pass = 0;
async function check(name, fn) { await fn(); pass++; console.log('PASS ' + name); }
function fixture() {
    const raw = new DatabaseSync(':memory:'), trace = [], state = { failBatchAt: -1 }, aiCalls = [];
    function prepare(sql) { const s = raw.prepare(sql); const make = args => ({ async first() { trace.push(['first', sql, args]); return s.get(...args) || null; }, async all() { trace.push(['all', sql, args]); return { results: s.all(...args) }; }, async run() { trace.push(['run', sql, args]); const r = s.run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }); return { ...make([]), bind: (...args) => make(args) }; }
    const env = { ROOM_JWT_SECRET: 'synthetic-vocab-contract-key-only', DB: { async exec(sql) { trace.push(['exec', sql]); raw.exec(sql); }, prepare, async batch(stmts) { raw.exec('BEGIN'); try {
                const rows = [];
                for (let i = 0; i < stmts.length; i++) {
                    if (i === state.failBatchAt)
                        throw Error('synthetic batch failure');
                    rows.push(await stmts[i].run());
                }
                raw.exec('COMMIT');
                return rows;
            }
            catch (e) {
                raw.exec('ROLLBACK');
                throw e;
            } } } };
    return { env, raw, trace, state, aiCalls };
}
try {
    Date.now = () => NOW;
    globalThis.fetch = async () => { throw Error('Unexpected network request in vocab contracts'); };
    const out = join(temp, 'handlers.mjs');
    buildSync({ stdin: { contents: "export { handleGamesApi, vocabSrsNext, VOCAB_SRS_INTERVALS, isCleanText, vocabWriteDenied } from './api-games'; export { vocabSrsNext as coreSrs } from './api-games-vocab-core'; export { signUidToken } from './auth-token';", resolveDir: sourceDir, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
    const M = await import(pathToFileURL(out).href);
    const call = async (path, env, options = {}, expectResponse = true) => { const url = new URL(path, 'https://sandbox.invalid'); const response = await M.handleGamesApi(new Request(url, options), url, env); if (expectResponse) assert(response instanceof Response, 'Expected route response: ' + path); return response; };
    const post = b => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const seeded = async () => { const f = fixture(); await call('/api/vocab/list', f.env); await call('/api/vocab/quiz-submit', f.env, post({})); f.trace.length = 0; return f; };
    const word = (f, uid = 'student-a', level = 1) => Number(f.raw.prepare('INSERT INTO vocabulary(user_id,word,korean,level,next_review_at,created_at) VALUES(?,?,?,?,?,?)').run(uid, 'apple', '사과', level, NOW - 1, NOW).lastInsertRowid);
    const quiz = (f, uid = 'student-a') => Number(f.raw.prepare('INSERT INTO vocab_quizzes(user_id,source_word,question,options,correct_index,created_at) VALUES(?,?,?,?,?,?)').run(uid, 'apple', 'Pick the meaning.', JSON.stringify(['사과', '자동차']), 0, NOW).lastInsertRowid);
    const auth = async (uid) => ({ Authorization: 'Bearer ' + await M.signUidToken(uid, { ROOM_JWT_SECRET: 'synthetic-vocab-contract-key-only' }) });
    await check('legacy exports still use the same SRS authority and retain bounds', async () => { assert.equal(M.vocabSrsNext, M.coreSrs); assert.deepEqual(M.VOCAB_SRS_INTERVALS, [1, 2, 4, 7, 14, 30, 60, 120]); assert.deepEqual(M.vocabSrsNext(1, true, NOW), { level: 2, days: 4, next: NOW + 4 * 86400000 }); assert.equal(M.vocabSrsNext(7, true, NOW).level, 7); assert.equal(M.vocabSrsNext(6, false, NOW).days, 1); assert(M.isCleanText('사과')); assert(!M.isCleanText(String.fromCharCode(0xFFFD))); });
    await check('unmatched paths and methods do not access D1 or providers', async () => { const f = fixture(); try {
        for (const p of ['/unmatched', '/api/vocab/add', '/api/vocab/auto-generate'])
            assert.equal(await call(p, f.env, {}, false), null);
        assert.deepEqual(f.trace, []);
    }
    finally {
        f.raw.close();
    } });
    await check('owner list filters rows and denies missing or mismatched tokens', async () => { const f = await seeded(); try {
        word(f);
        word(f, 'student-b');
        assert.equal((await call('/api/vocab/list?uid=student-a', f.env)).status, 401);
        assert.equal((await call('/api/vocab/list?uid=student-a', f.env, { headers: await auth('student-b') })).status, 401);
        const r = await call('/api/vocab/list?uid=student-a', f.env, { headers: await auth('student-a') });
        assert.equal(r.status, 200);
        assert.equal((await r.json()).words.length, 1);
    }
    finally {
        f.raw.close();
    } });
    await check('guest trial includes the exact ten-minute boundary and expires immediately after', async () => { const f = await seeded(); try {
        const uid = 'guest_vocab_trial';
        word(f, uid);
        assert.equal((await call('/api/vocab/list?uid=' + uid, f.env)).status, 200);
        f.raw.prepare('UPDATE vocab_guest_trial SET started_at=? WHERE uid=?').run(NOW - 600000, uid);
        assert.equal((await call('/api/vocab/due?uid=' + uid, f.env)).status, 200);
        f.raw.prepare('UPDATE vocab_guest_trial SET started_at=? WHERE uid=?').run(NOW - 600001, uid);
        const r = await call('/api/vocab/list?uid=' + uid, f.env);
        assert.equal(r.status, 401);
        assert.equal((await r.json()).error, 'guest_trial_expired');
    }
    finally {
        f.raw.close();
    } });
    await check('guest cannot start a fourth trial day', async () => { const f = await seeded(); try {
        const uid = 'guest_vocab_three';
        await call('/api/vocab/list?uid=' + uid, f.env);
        f.raw.prepare('DELETE FROM vocab_guest_trial WHERE uid=?').run(uid);
        for (let i = 1; i <= 3; i++)
            f.raw.prepare('INSERT INTO vocab_guest_trial VALUES(?,?,?)').run(uid, DAY - i, NOW - i * 86400000);
        const r = await call('/api/vocab/due?uid=' + uid, f.env);
        assert.equal(r.status, 401);
        assert.equal((await r.json()).error, 'guest_trial_used_up');
        assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM vocab_guest_trial WHERE uid=?').get(uid).n, 3);
    }
    finally {
        f.raw.close();
    } });
    await check('concurrent first list and due share one guest trial row', async () => { const f = await seeded(); try {
        const uid = 'guest_vocab_race';
        const rs = await Promise.all([call('/api/vocab/list?uid=' + uid, f.env), call('/api/vocab/due?uid=' + uid, f.env)]);
        assert.deepEqual(rs.map(r => r.status), [200, 200]);
        assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM vocab_guest_trial WHERE uid=?').get(uid).n, 1);
    }
    finally {
        f.raw.close();
    } });
    await check('five word/quiz generation writes deny another owner before AI calls or row insertion', async () => { const f = await seeded(); try {
        f.env.AI = { async run(...a) { f.aiCalls.push(a); throw Error('Provider should not be called'); } };
        for (const path of ['add', 'bulk-add', 'add-with-ai', 'auto-generate', 'gen-quiz']) {
            const r = await call('/api/vocab/' + path, f.env, post({ user_id: 'student-a', uid: 'student-a', word: 'apple', korean: '사과', items: [{ word: 'apple', korean: '사과' }] }));
            assert.equal(r.status, 401, path);
        }
        assert.equal(f.aiCalls.length, 0);
        assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM vocabulary').get().n, 0);
    }
    finally {
        f.raw.close();
    } });
    await check('quiz submission authorizes its stored owner rather than the body owner', async () => { const f = await seeded(); try {
        word(f);
        const id = quiz(f);
        const r = await call('/api/vocab/quiz-submit', f.env, post({ quiz_id: id, answer: 0, user_id: 'guest_spoof' }));
        assert.equal(r.status, 401);
        assert(!('correct_index' in await r.json()));
        assert.equal(f.raw.prepare('SELECT completed FROM vocab_quizzes WHERE id=?').get(id).completed, 0);
    }
    finally {
        f.raw.close();
    } });
    await check('flashcard and quiz share the same next-review schedule', async () => { const a = await seeded(), b = await seeded(); try {
        const id = word(a), wid = word(b), qid = quiz(b), headers = await auth('student-a');
        const r1 = await call('/api/vocab/review', a.env, { ...post({ id, correct: true }), headers: { ...headers, 'Content-Type': 'application/json' } });
        const r2 = await call('/api/vocab/quiz-submit', b.env, { ...post({ quiz_id: qid, answer: 0 }), headers: { ...headers, 'Content-Type': 'application/json' } });
        assert.equal(r1.status, 200);
        assert.equal(r2.status, 200);
        for (const f of [a, b]) {
            const r = f.raw.prepare('SELECT level,next_review_at,correct_count FROM vocabulary').get();
            assert.equal(r.level, 2);
            assert.equal(r.next_review_at, NOW + 4 * 86400000);
            assert.equal(r.correct_count, 1);
        }
        assert(wid);
    }
    finally {
        a.raw.close();
        b.raw.close();
    } });
    await check('repeated quiz submission does not inflate SRS, counters or review log', async () => { const f = await seeded(); try {
        word(f);
        const id = quiz(f), headers = await auth('student-a');
        for (let i = 0; i < 2; i++)
            assert.equal((await call('/api/vocab/quiz-submit', f.env, { ...post({ quiz_id: id, answer: 0 }), headers: { ...headers, 'Content-Type': 'application/json' } })).status, 200);
        assert.equal(f.raw.prepare('SELECT correct_count FROM vocabulary').get().correct_count, 1);
        assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM vocab_review_log').get().n, 1);
    }
    finally {
        f.raw.close();
    } });
    await check('failed batch rolls back completion and remains retryable', async () => { const f = await seeded(); try {
        word(f);
        const id = quiz(f), headers = await auth('student-a');
        f.state.failBatchAt = 1;
        const options = () => ({ ...post({ quiz_id: id, answer: 0 }), headers: { ...headers, 'Content-Type': 'application/json' } });
        const failed = await call('/api/vocab/quiz-submit', f.env, options());
        assert.equal(failed.status, 503);
        assert.equal((await failed.json()).retryable, true);
        assert.equal(f.raw.prepare('SELECT completed FROM vocab_quizzes').get().completed, 0);
        assert.equal(f.raw.prepare('SELECT correct_count FROM vocabulary').get().correct_count, 0);
        f.state.failBatchAt = -1;
        assert.equal((await call('/api/vocab/quiz-submit', f.env, options())).status, 200);
        assert.equal(f.raw.prepare('SELECT correct_count FROM vocabulary').get().correct_count, 1);
    }
    finally {
        f.raw.close();
    } });
    await check('reward still passes through the daily game cap', async () => { const f = await seeded(); try {
        f.raw.exec('CREATE TABLE point_transactions(id INTEGER PRIMARY KEY,user_id TEXT,type TEXT,amount INTEGER,rule_code TEXT,created_at INTEGER)');
        f.raw.prepare('INSERT INTO point_transactions VALUES(?,?,?,?,?,?)').run(1, 'student-a', 'earn', 30, 'vocab_review', NOW);
        const headers = await auth('student-a');
        const r = await call('/api/vocab/reward', f.env, { ...post({ user_id: 'student-a', kind: 'speak', session_id: 'fixture' }), headers: { ...headers, 'Content-Type': 'application/json' } });
        assert.equal(r.status, 200);
        const b = await r.json();
        assert.equal(b.awarded, 0);
        assert.equal(b.daily_cap, true);
        assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM vocab_rewards').get().n, 0);
    }
    finally {
        f.raw.close();
    } });
    await check('request contexts keep different environments and owners isolated', async () => {
        const a = await seeded(), b = await seeded();
        try {
            word(a, 'student-a'); word(b, 'student-b');
            b.raw.exec("UPDATE vocabulary SET word='banana',korean='바나나'");
            const rs = await Promise.all([
                call('/api/vocab/list?uid=student-a', a.env, { headers: await auth('student-a') }),
                call('/api/vocab/list?uid=student-b', b.env, { headers: await auth('student-b') }),
            ]);
            assert.equal((await rs[0].json()).words[0].word, 'apple');
            assert.equal((await rs[1].json()).words[0].word, 'banana');
        } finally { a.raw.close(); b.raw.close(); }
    });
    console.log(`PASS ${pass} / FAIL 0 vocabulary module contracts`);
}
finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
    rmSync(temp, { recursive: true, force: true });
}
