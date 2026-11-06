// Shipped dispatcher + real in-memory SQLite. No live bindings, credentials or AI calls.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.env.REVIEW_MODULE_SRC_DIR || join(root, 'cloudflare-deploy/src');
const { buildSync } = createRequire(import.meta.url)('../cloudflare-deploy/node_modules/esbuild');
const temp = mkdtempSync(join(tmpdir(), 'mangoi-review-contracts-'));
const fetchBefore = globalThis.fetch;
let pass = 0;
async function check(name, fn) { await fn(); pass++; console.log('PASS ' + name); }
function fixture() {
    const raw = new DatabaseSync(':memory:');
    const trace = [];
    function prepare(sql) {
        const s = raw.prepare(sql), make = args => ({
            async first() { trace.push(['first', sql, args]); return s.get(...args) || null; },
            async all() { trace.push(['all', sql, args]); return { results: s.all(...args) }; },
            async run() { trace.push(['run', sql, args]); const r = s.run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
        });
        return { ...make([]), bind: (...args) => make(args) };
    }
    const env = { DB: { async exec(sql) { trace.push(['exec', sql]); raw.exec(sql); }, prepare }, ROOM_JWT_SECRET: 'synthetic-review-contract-key-not-used-outside-tests' };
    return { env, raw, trace };
}
const questions = [
    { type: 'choice', q: 'Pick a fruit.', opts: ['apple', 'car'], answer: 0, explain: '비밀 해설' },
    { type: 'listen', q: 'Listen.', opts: ['Hello.', 'Goodbye.'], answer: 1, audio_text: 'Goodbye.', explain: '듣기 해설' },
    { type: 'write', q: 'Write.', answer_text: '打工', accept: ['dǎgōng'], explain: '쓰기 해설' },
    { type: 'speak', q: 'Speak.', answer_text: '我喜欢苹果', explain: '말하기 해설' },
];
try {
    globalThis.fetch = async () => { throw Error('Unexpected outbound request in review contracts'); };
    const out = join(temp, 'handlers.mjs');
    buildSync({ stdin: { contents: "export { handleGamesApi } from './api-games'; export { signUidToken } from './auth-token'; export * from './api-games-review-scoring';", resolveDir: sourceDir, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
    const M = await import(pathToFileURL(out).href);
    const call = (path, env, options = {}) => { const url = new URL(path, 'https://sandbox.invalid'); return M.handleGamesApi(new Request(url, options), url, env); };
    const post = b => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const seeded = async () => { const f = fixture(); await call('/api/review-quiz/list', f.env); f.raw.prepare('INSERT INTO review_quizzes(id,title,questions,active,created_at) VALUES(?,?,?,?,?)').run(7, 'Synthetic quiz', JSON.stringify(questions), 1, Date.now()); f.trace.length = 0; return f; };
    await check('unmatched paths and methods do not touch D1', async () => { const f = fixture(); try {
        assert.equal(await call('/unmatched', f.env), null);
        assert.equal(await call('/api/review-quiz/submit', f.env), null);
        assert.deepEqual(f.trace, []);
    }
    finally {
        f.raw.close();
    } });
    await check('quiz get keeps required/not-found/inactive responses', async () => { const f = await seeded(); try {
        assert.equal((await call('/api/review-quiz/get', f.env)).status, 400);
        assert.equal((await call('/api/review-quiz/get?id=999', f.env)).status, 404);
        f.raw.exec('UPDATE review_quizzes SET active=0 WHERE id=7');
        assert.equal((await call('/api/review-quiz/get?id=7', f.env)).status, 404);
    }
    finally {
        f.raw.close();
    } });
    await check('public questions hide answers, explanations and listening script; speaking target remains', async () => { const f = await seeded(); try {
        const r = await call('/api/review-quiz/get?id=7', f.env);
        const b = await r.json();
        assert.equal(r.status, 200);
        const qs = b.quiz.questions;
        assert.equal(qs.length, 4);
        for (const q of qs) {
            for (const key of ['answer', 'answer_text', 'accept', 'explain', 'audio_text'])
                assert(!(key in q), key + ' leaked');
        }
        assert.equal(qs[3].target, questions[3].answer_text);
        assert.equal(qs[1].has_audio, true);
    }
    finally {
        f.raw.close();
    } });
    await check('draw preserves bank indices and never mutates source question order', async () => { const f = await seeded(); try {
        f.raw.prepare('UPDATE review_quizzes SET draw=? WHERE id=7').run(JSON.stringify({ choice: 1, listen: 1 }));
        const qs = (await (await call('/api/review-quiz/get?id=7', f.env)).json()).quiz.questions;
        assert.deepEqual(qs.map(q => q.idx).sort(), [0, 1]);
        assert.equal(new Set(qs.map(q => q.idx)).size, 2);
        assert.equal(JSON.parse(f.raw.prepare('SELECT questions FROM review_quizzes WHERE id=7').get().questions)[0].answer, 0);
    }
    finally {
        f.raw.close();
    } });
    await check('another student cannot submit, and no result is inserted', async () => { const f = await seeded(); try {
        const r = await call('/api/review-quiz/submit', f.env, post({ quiz_id: 7, user_id: 'other-student', answers: [0, 1, 'dagong', '我喜欢苹果'] }));
        assert.equal(r.status, 401);
        assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM review_quiz_results').get().n, 0);
    }
    finally {
        f.raw.close();
    } });
    await check('served indices determine actual grading and persisted details', async () => { const f = await seeded(); try {
        const r = await call('/api/review-quiz/submit', f.env, post({ quiz_id: 7, user_id: 'guest_review_fixture', served: [2, 0], answers: ['dagong', 0] }));
        const b = await r.json();
        assert.equal(r.status, 200);
        assert.equal(b.score, 2);
        assert.equal(b.total, 2);
        assert.equal(b.percent, 100);
        assert.equal(b.points_guest, true);
        const row = f.raw.prepare('SELECT user_id,score,total,detail FROM review_quiz_results').get();
        assert.equal(row.user_id, 'guest_review_fixture');
        assert.equal(row.score, 2);
        assert.equal(row.total, 2);
        assert.equal(JSON.parse(row.detail).length, 2);
    }
    finally {
        f.raw.close();
    } });
    await check('public list anonymizes other student statistics but valid owner sees them', async () => { const f = await seeded(); try {
        f.raw.prepare('INSERT INTO review_quiz_results(quiz_id,user_id,score,total,created_at) VALUES(?,?,?,?,?)').run(7, 'student-a', 3, 4, Date.now());
        const read = async (headers) => (await (await call('/api/review-quiz/list?user_id=student-a', f.env, { headers })).json()).quizzes[0];
        const anon = await read({});
        assert.equal(anon.best_score, null);
        assert.equal(anon.attempts, 0);
        const own = await read({ Authorization: 'Bearer ' + await M.signUidToken('student-a', f.env) });
        assert.equal(own.best_score, 3);
        assert.equal(own.attempts, 1);
        const other = await read({ Authorization: 'Bearer ' + await M.signUidToken('student-b', f.env) });
        assert.equal(other.best_score, null);
        assert.equal(other.attempts, 0);
    }
    finally {
        f.raw.close();
    } });
    await check('single-question checking grades without adding an attempt', async () => { const f = await seeded(); try {
        const r = await call('/api/review-quiz/check', f.env, post({ quiz_id: 7, idx: 0, answer: 0 }));
        const b = await r.json();
        assert.equal(b.correct, true);
        assert.equal(b.answer_text, 'apple');
        assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM review_quiz_results').get().n, 0);
    }
    finally {
        f.raw.close();
    } });
    await check('empty choice answer stays wrong even when correct index is zero', async () => { for (const answer of [null, '', undefined])
        assert.equal(M.rqGrade([questions[0]], [answer]).score, 0); assert.equal(M.rqGrade([questions[0]], [0]).score, 1); });
    await check('pinyin tones and Korean NFC survive normalization; Chinese partial credit survives', async () => { assert.equal(M.rqNorm('dǎgōng'), 'dagong'); assert.equal(M.rqNorm('한글'), '한글'); assert.equal(M.rqGrade([questions[2]], ['dagong']).score, 1); const d = M.rqGrade([questions[3]], ['我喜欢']).detail[0]; assert.equal(d.accuracy, 60); assert.equal(d.correct, true); assert.equal(M.rqGrade([questions[3]], ['我']).detail[0].correct, false); });
    await check('question parser rejects malformed banks and preserves options as phrases', async () => { assert.equal(M.rqParseQuestions('bad').error, 'questions_invalid_json'); assert.equal(M.rqParseQuestions([]).ok, false); assert.equal(M.rqParseQuestions([{ type: 'choice', q: 'Pick.', opts: ['one'], answer: 0 }]).ok, false); const p = M.rqParseQuestions([questions[0]]); assert.equal(p.ok, true); assert.deepEqual(p.list[0].opts, ['apple', 'car']); });
    await check('many draws honor each type count, unique indices and safe serialization', async () => { const bank = Array.from({ length: 24 }, (_, i) => ({ ...questions[i % 4], q: 'Question ' + i })); const snapshot = JSON.stringify(bank); for (let i = 0; i < 120; i++) {
        const idx = M.rqDrawIndices(bank, { choice: 2, listen: 3, write: 1, speak: 2 });
        assert.equal(idx.length, 8);
        assert.equal(new Set(idx).size, 8);
        for (const [type, n] of Object.entries({ choice: 2, listen: 3, write: 1, speak: 2 }))
            assert.equal(idx.filter(j => bank[j].type === type).length, n);
        for (const j of idx)
            assert(!('explain' in M.rqSafeOne(bank[j], j)));
    } assert.equal(JSON.stringify(bank), snapshot); });
    await check('language filtering keeps legacy NULL English and excludes Chinese from English list', async () => { const f = await seeded(); try {
        f.raw.prepare('INSERT INTO review_quizzes(id,title,questions,active,created_at,lang) VALUES(?,?,?,?,?,?)').run(8, 'Chinese quiz', JSON.stringify(questions), 1, Date.now(), 'zh');
        const read = async (lang) => (await (await call('/api/review-quiz/list?lang=' + lang, f.env)).json()).quizzes.map(q => q.id);
        assert.deepEqual(await read('en'), [7]);
        assert.deepEqual(await read('zh'), [8]);
    }
    finally {
        f.raw.close();
    } });
    console.log(`PASS ${pass} / FAIL 0 review quiz module contracts`);
}
finally {
    globalThis.fetch = fetchBefore;
    rmSync(temp, { recursive: true, force: true });
}
