/** Mixed evaluation rubrics: execute production SQL/handlers in isolated SQLite.
 * No live API, notifications or network. Lists retain raw fields; only the score projection changes.
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const req = createRequire(join(CF, 'package.json'));
const ts = req('typescript');
const src = name => readFileSync(join(CF, name), 'utf8');
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('  ✅', name); };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
let authorized = true;
let pushes = [];
function load(text, imports = {}) {
  const out = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', out)(exports, name => {
    if (!(name in imports)) throw new Error('Unmocked import: ' + name);
    return imports[name];
  });
  return exports;
}
const scores = load(src('src/evaluation-scores.ts'));
const records = load(src('src/evaluation-records.ts'), { './d1-chunk': load(src('src/d1-chunk.ts')) });
const lessons = load(src('src/api-lessons.ts'), {
  './evaluation-scores': scores,
  './evaluation-records': records,
  './api-util': { json },
  './site-url': { siteUrl: path => 'https://example.invalid' + path },
  './auth-token': {},
  './auth-admin': { checkAdminSession: async () => ({ ok: authorized }) },
  './api-notify': { sendPushToUser: async (...args) => { pushes.push(args); return { sent: 0 }; } },
}).handleLessonsApi;
const legacySchema = `CREATE TABLE student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, eval_at INTEGER NOT NULL, eval_type TEXT, level TEXT, score_speaking REAL, score_listening REAL, score_reading REAL, score_writing REAL, score_total REAL, evaluator TEXT, comment TEXT, next_goal TEXT, created_at INTEGER NOT NULL)`;
function dbFixture(legacy = false) {
  const raw = new DatabaseSync(':memory:');
  if (legacy) raw.exec(legacySchema);
  raw.exec('CREATE TABLE students_erp (user_id TEXT, login_id TEXT)');
  const wrap = sql => {
    const st = raw.prepare(sql);
    const bound = args => ({
      first: async () => st.get(...args) || null,
      all: async () => ({ success: true, results: st.all(...args) }),
      run: async () => { const r = st.run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
      bind: (...next) => bound(next),
    });
    return bound([]);
  };
  const DB = { prepare: wrap, exec: async sql => { raw.exec(sql); return { success: true }; } };
  return { raw, DB };
}
async function call(f, path, body, aiScore = 4) {
  const url = new URL('https://example.invalid' + path);
  const method = body === undefined ? 'GET' : 'POST';
  const response = await lessons(new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), url,
    { DB: f.DB, AI: { run: async () => ({ response: JSON.stringify({ overall_score: aiScore, summary_ko: '수업 분석입니다.' }) }) } });
  return { status: response.status, body: await response.json() };
}
const list = f => call(f, '/api/admin/eval/list');
const insert = (f, fields) => {
  const row = { user_id: 'fixture', eval_at: 1, student_uid: 'fixture', created_at: 1, ...fields };
  f.raw.prepare(`INSERT INTO student_evaluations (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
};
const rowById = (response, id) => response.body.rows.find(row => row.id === id);
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('No external network allowed'); };
try {
  await test('empty list: unknown average is null, never a fabricated zero', async () => {
    const f = dbFixture(); const r = await list(f);
    assert.equal(r.body.stats.avg_score, null); assert.equal(r.body.stats.scored_count, 0); assert.deepEqual(r.body.rows, []);
  });
  for (const legacy of [false, true]) {
    await test(`all writers persist server-owned source/scale; zero retained (legacy=${legacy})`, async () => {
      const f = dbFixture(legacy); pushes = [];
      const manual = await call(f, '/api/eval/manual-create', { student_uid: 'm', score_participation: 4, evaluation_source: 'ai_lesson_report', score_scale: 100 });
      assert.equal(manual.status, 200);
      const draft = await call(f, '/api/eval/draft-create', { student_uid: 'd', score_participation: 0, score_speaking: 8, score_scale: 5 });
      assert.equal(draft.status, 200);
      const bulk = await call(f, '/api/eval/bulk-create', { students: [{ student_uid: 'b', scores: { participation: 4 } }, { student_uid: 'z', scores: { participation: 0 } }] });
      assert.equal(bulk.body.created, 2);
      for (const val of [4, 0, 100]) {
        const ai = await call(f, '/api/eval/ai-lesson-report', { student_uid: 'a', transcript: 'A local test transcript.', evaluation_source: 'teacher_manual', score_scale: 5 }, val);
        assert.equal(ai.status, 200); assert.ok(ai.body.evaluation_id); assert.equal(ai.body.overall_score, val);
      }
      const rows = (await list(f)).body.rows;
      assert.equal(rows.length, 7);
      const m = rows.find(r => r.student_uid === 'm'); assert.equal(m.evaluation_source, 'teacher_manual'); assert.equal(m.score_scale, 5); assert.equal(m.score_normalized_100, 80);
      const d = rows.find(r => r.student_uid === 'd'); assert.equal(d.score_participation, 0); assert.equal(d.score_scale, 10); assert.equal(d.evaluation_source, 'teacher_ai_draft'); assert.equal(d.score_normalized_100, 40);
      const b = rows.find(r => r.student_uid === 'b'); assert.equal(b.score_scale, 10); assert.equal(b.score_normalized_100, 40);
      assert.equal(rows.find(r => r.student_uid === 'z').score_normalized_100, 0);
      assert.equal(rows.find(r => r.student_uid === 'a' && r.score_overall === 4).score_normalized_100, 4);
      assert.equal(rows.find(r => r.student_uid === 'a' && r.score_overall === 0).score_normalized_100, 0);
      assert.ok(pushes.find(p => p[1] === 'd')[3].includes('/10'));
      assert.ok(pushes.find(p => p[1] === 'm')[3].includes('/5'));
    });
  }
  await test('proven legacy provenance; ambiguous/invalid excluded; averages independent of LIMIT; raw unchanged', async () => {
    const f = dbFixture(true); await list(f); await scores.ensureEvaluationScoreSchema(f.DB);
    f.raw.exec('CREATE TABLE ai_lesson_reports (id INTEGER PRIMARY KEY, evaluation_id INTEGER)');
    const fields = [
      { score_overall: 4, evaluation_source: 'teacher_manual', score_scale: 5 },
      { score_overall: 4, evaluation_source: 'teacher_bulk', score_scale: 10 },
      { score_overall: 4 }, // linked AI below, low score must not become /5
      { score_overall: 0, evaluation_source: 'ai_lesson_report', score_scale: 100 },
      { score_overall: 4, teacher_uid: 'teacher', room_id: 'room', note_chips: '' },
      { student_uid: null, score_total: 75, eval_type: 'monthly' },
      { score_overall: 4 }, // same value, source unknown
      { score_overall: 88 }, // magnitude alone does not establish source
      { score_overall: 4, score_participation: 4 }, // legacy manual or ten-point draft
      { score_overall: 4, note_en: 'Added later via PATCH' },
      { score_overall: 8, evaluation_source: 'teacher_manual', score_scale: 5 },
      { score_overall: 4, evaluation_source: 'teacher_manual', score_scale: 100 },
      { score_overall: null },
      { score_overall: 'bad', evaluation_source: 'teacher_manual', score_scale: 5 },
      { score_overall: 4, score_scale: 5 },
    ];
    fields.forEach(row => insert(f, row));
    f.raw.exec('INSERT INTO ai_lesson_reports VALUES (1,3), (2,3)');
    const before = JSON.stringify(f.raw.prepare('SELECT * FROM student_evaluations ORDER BY id').all());
    const r = await list(f); const s = r.body.stats;
    assert.equal(s.total, 15); assert.equal(s.scored_count, 6); assert.equal(s.unknown_scale_count, 4); assert.equal(s.invalid_score_count, 4); assert.equal(s.excluded_score_count, 8); assert.equal(s.missing_score_count, 1);
    assert.equal(s.avg_score_scale, 100); assert.equal(s.avg_score, (80 + 40 + 4 + 0 + 80 + 75) / 6);
    assert.equal(rowById(r, 3).score_max, 100); assert.equal(rowById(r, 3).score_overall, 4);
    assert.equal(rowById(r, 5).score_max, 5); assert.equal(rowById(r, 6).score_value, 75); assert.equal(rowById(r, 6).score_overall, null);
    const limited = await call(f, '/api/admin/eval/list?limit=1'); assert.equal(limited.body.rows.length, 1); assert.deepEqual(limited.body.stats, s);
    assert.equal(JSON.stringify(f.raw.prepare('SELECT * FROM student_evaluations ORDER BY id').all()), before);
    assert.equal(r.body.rows[0].student_name, null); assert.equal(r.body.rows[0].lesson_date, null); // Stage 4 untouched
    assert.ok(!Object.keys(r.body.rows[0]).some(key => key.startsWith('__score')));
  });
  await test('bad input is rejected and all missing scores stay missing', async () => {
    const f = dbFixture();
    for (const value of [0, 6, -1, 'oops', '', true, []]) {
      assert.equal((await call(f, '/api/eval/manual-create', { student_uid: 'm', score_participation: value })).status, 400);
    }
    for (const value of [11, -1, 'oops', '', true, []]) {
      assert.equal((await call(f, '/api/eval/draft-create', { student_uid: 'd', score_participation: value })).status, 400);
    }
    const missing = await call(f, '/api/eval/manual-create', { student_uid: 'm' }); assert.equal(missing.body.overall, null);
    const b = await call(f, '/api/eval/bulk-create', { students: [{ student_uid: 'bad', scores: { speaking: 100 } }] });
    assert.equal(b.body.failed, 1); assert.equal(b.body.created, 0);
    assert.equal((await list(f)).body.stats.scored_count, 0);
  });
  await test('unauthenticated create/draft/bulk/AI are rejected before writes', async () => {
    authorized = false; const f = dbFixture();
    for (const route of ['create', 'manual-create', 'draft-create', 'bulk-create', 'ai-lesson-report']) {
      assert.equal((await call(f, '/api/eval/' + route, { student_uid: 'x' })).status, 401);
    }
    assert.equal(f.raw.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='student_evaluations'").get().n, 0);
    authorized = true;
  });
  await test('migration errors fail closed; no untyped evaluation INSERT', async () => {
    const f = dbFixture(); const realExec = f.DB.exec;
    f.DB.exec = async sql => { if (/ADD COLUMN (evaluation_source|score_scale)/.test(sql)) throw new Error('metadata unavailable'); return realExec(sql); };
    await assert.rejects(call(f, '/api/eval/manual-create', { student_uid: 'x', score_participation: 4 }), /metadata unavailable/);
    assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM student_evaluations').get().n, 0);
  });
  await test('read projection works without metadata columns even if score migration is unavailable', async () => {
    const f = dbFixture(true); const realExec = f.DB.exec;
    f.DB.exec = async sql => { if (/ADD COLUMN (evaluation_source|score_scale)/.test(sql)) throw new Error('metadata unavailable'); return realExec(sql); };
    f.raw.exec("INSERT INTO student_evaluations (user_id, eval_at, score_total, created_at) VALUES ('legacy',1,75,1)");
    const r = await list(f); assert.equal(r.status, 200); assert.equal(r.body.stats.avg_score, 75);
    assert.ok(!f.raw.prepare('PRAGMA table_info(student_evaluations)').all().some(row => row.name === 'score_scale'));
  });
  await test('old tabs keep saving safely with explicit unknown scale and refresh warning', async () => {
    const f = dbFixture(); pushes = [];
    for (const score of [0, 4, 8]) {
      const r = await call(f, '/api/eval/create', { student_uid: 'old', score_participation: score, evaluation_source: 'teacher_manual', score_scale: 5 });
      assert.equal(r.status, 200); assert.equal(r.body.overall, score);
      assert.equal(r.body.warning, 'score_scale_unknown_refresh_required'); assert.equal(r.body.score_scale, null);
    }
    const r = await list(f);
    assert.equal(r.body.stats.scored_count, 0); assert.equal(r.body.stats.unknown_scale_count, 3);
    assert.ok(r.body.rows.every(row => row.evaluation_source === 'legacy_unclassified' && row.score_status === 'unknown_scale'));
    assert.ok(pushes.every(push => push[3].includes('척도 확인 필요') && !push[3].includes('/5')));
  });
  await test('student-detail 100-point writer persists metadata and preserves raw zero', async () => {
    const mango = src('src/api-mango.ts');
    const sf = ts.createSourceFile('mango.ts', mango, ts.ScriptTarget.Latest, true);
    let schema = '';
    const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(sf) === 'ensureStudentDetailSchema') schema = node.getText(sf); ts.forEachChild(node, visit); };
    visit(sf); assert.ok(schema);
    const start = mango.indexOf('    // /api/admin/student/:uid/evaluations');
    const end = mango.indexOf('    // /api/admin/student/:uid/feedbacks', start);
    assert.ok(start > 0 && end > start);
    const code = `export async function run(env, request, path, method) { const ${schema}; ${mango.slice(start, end)} }`;
    const run = load("import { ensureStudentEvaluationDetailSchema, readStudentAdminEvaluations } from './evaluation-records';\nimport { ensureEvaluationScoreSchema, validEvaluationScores } from './evaluation-scores';\nimport { json, parseJsonBody, invalidBody } from './api-util';\n" + code, {
      './evaluation-scores': scores,
      './evaluation-records': records,
      './api-util': { json, parseJsonBody: request => request.json(), invalidBody: () => json({ ok: false }, 400) },
    }).run;
    const f = dbFixture();
    const send = body => run({ DB: f.DB }, new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(body) }), '/api/admin/student/detail/evaluations', 'POST');
    const response = await send({ score_total: 0, score_speaking: 0, evaluation_source: 'teacher_manual', score_scale: 5 });
    assert.equal(response.status, 200);
    const raw = f.raw.prepare('SELECT * FROM student_evaluations').get();
    assert.equal(raw.score_total, 0); assert.equal(raw.score_speaking, 0); assert.equal(raw.score_scale, 100); assert.equal(raw.evaluation_source, 'student_detail');
    assert.equal((await list(f)).body.rows[0].score_normalized_100, 0);
    assert.equal((await send({ score_total: 101 })).status, 400);
    assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM student_evaluations').get().n, 1);
  });
  await test('admin list renders denominators, zero, excluded count, safe stars and preserved controls', async () => {
    const f = dbFixture(); await list(f); await scores.ensureEvaluationScoreSchema(f.DB);
    for (const row of [
      { evaluation_source: 'teacher_manual', score_scale: 5, score_overall: 4 },
      { evaluation_source: 'teacher_bulk', score_scale: 10, score_overall: 4 },
      { evaluation_source: 'ai_lesson_report', score_scale: 100, score_overall: 4 },
      { evaluation_source: 'ai_lesson_report', score_scale: 100, score_overall: 0 },
      { score_overall: 88 },
      { score_overall: '<img src=x onerror=alert(1)>' },
    ]) insert(f, row);
    const response = await list(f);
    const elements = { 'ev-list-table': { innerHTML: '' }, 'ev-stats-line': { innerHTML: '' } };
    const window = {};
    let responseOk = true;
    vm.runInNewContext(src('public/js/adm-r6.js'), { window, document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements[id] },
      fetch: async () => ({ ok: responseOk, json: async () => response.body }), console });
    await window.evLoadList();
    const html = elements['ev-list-table'].innerHTML; const stats = elements['ev-stats-line'].innerHTML;
    assert.ok(stats.includes('31.0/100')); assert.ok(stats.includes('4건 기준')); assert.ok(stats.includes('척도 미확인 2건'));
    assert.ok(html.includes('/5</span>')); assert.ok(html.includes('/10</span>')); assert.ok(html.includes('/100</span>')); assert.ok(html.includes('>0<span'));
    assert.ok(html.includes('척도·점수 확인 필요')); assert.ok(!html.includes('<img')); assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('/eval.html?id=1')); assert.ok(html.includes('evDelete(1)'));
    assert.equal((html.match(/[★☆]/g) || []).length, 20);
    response.body.stats.avg_score = null; response.body.stats.scored_count = 0; response.body.rows = [];
    await window.evLoadList(); assert.ok(!elements['ev-stats-line'].innerHTML.includes('0.0/100')); assert.ok(elements['ev-list-table'].innerHTML.includes('아직 작성된'));
    for (const httpOk of [false, true]) {
      elements['ev-stats-line'].innerHTML = 'old average 99.0/100';
      responseOk = httpOk; response.body = { ok: false, error: 'database_unavailable' };
      await window.evLoadList();
      assert.ok(elements['ev-list-table'].innerHTML.includes('로드 실패'));
      assert.ok(!elements['ev-list-table'].innerHTML.includes('아직 작성된'));
      assert.equal(elements['ev-stats-line'].innerHTML, '통계 확인 불가');
    }
  });
  await test('student-detail submit preserves all five zero inputs and distinguishes blanks', async () => {
    const page = src('public/admin/student.html');
    const start = page.indexOf("$('evAddBtn').addEventListener('click', async () => {");
    const end = page.indexOf("\n});", start) + 4;
    assert.ok(start > 0 && end > start);
    const inputs = {};
    let click; let saved;
    const $ = id => inputs[id] ||= { value: '', addEventListener: (_event, fn) => { click = fn; } };
    vm.runInNewContext(page.slice(start, end), { $, uid: 'student', _lang: 'ko', postSave: async (_path, body) => { saved = body; } });
    const ids = ['evSpeak', 'evList', 'evRead', 'evWrite', 'evTotal'];
    const keys = ['score_speaking', 'score_listening', 'score_reading', 'score_writing', 'score_total'];
    ids.forEach(id => $(id).value = '0'); await click();
    keys.forEach(key => assert.equal(saved[key], 0, key));
    ids.forEach(id => $(id).value = ''); await click();
    keys.forEach(key => assert.equal(saved[key], null, key));
    ids.forEach(id => $(id).value = '100'); await click();
    keys.forEach(key => assert.equal(saved[key], 100, key));
  });
  await test('all current manual/draft clients select their dedicated route; queued teacher payload retained', async () => {
    const teacher = src('public/teacher.html'); const manual = src('public/js/adm-r6.js'); const draft = src('public/js/adm-q1.js');
    assert.equal((teacher.match(/fetch\('\/api\/eval\/manual-create'/g) || []).length, 2);
    assert.ok(manual.includes("fetch('/api/eval/manual-create'")); assert.ok(draft.includes("fetch('/api/eval/draft-create'"));
    assert.ok(!/fetch\('\/api\/eval\/create'/.test(teacher + manual + draft));
    assert.ok(teacher.includes("var NQ = 'mangoi_note_queue_v1'"));
  });
  await test('bundled Worker entry routes all score writers through real session authentication', async () => {
    const { build } = req('esbuild'); const dir = mkdtempSync(join(tmpdir(), 'eval-entry-'));
    try {
      const output = join(dir, 'worker.mjs');
      await build({ entryPoints: [join(CF, 'src/index.ts')], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', outfile: output, logLevel: 'silent' });
      const worker = (await import(pathToFileURL(output).href)).default;
      const f = dbFixture();
      f.raw.exec(`CREATE TABLE admin_sessions (token TEXT PRIMARY KEY, username TEXT, expires_at INTEGER, last_seen_at INTEGER)`);
      f.raw.prepare('INSERT INTO admin_sessions VALUES (?,?,?,?)').run('local-only-token', 'local-admin', Date.now() + 60000, 0);
      let externalCalls = 0;
      const env = { DB: f.DB, ASSETS: { fetch: async () => { throw new Error('Route fell through to static assets'); } },
        PDF_STORE: { get: async () => null, put: async () => {} }, SESSION_STATE: { get: async () => null, put: async () => {} },
        AI: { run: async () => { externalCalls++; throw new Error('Unexpected AI call'); } } };
      for (const route of ['create', 'manual-create', 'draft-create']) {
        const url = 'https://example.invalid/api/eval/' + route;
        const unauth = await worker.fetch(new Request(url, { method: 'POST', body: '{}' }), env, { waitUntil() {} });
        assert.equal(unauth.status, 401, route + ' unauth');
        const auth = await worker.fetch(new Request(url, { method: 'POST', headers: { Cookie: 'mango_admin_session=local-only-token' }, body: '{}' }), env, { waitUntil() {} });
        assert.equal(auth.status, 400, route + ' auth'); assert.equal((await auth.json()).error, 'student_uid_required');
      }
      assert.equal(externalCalls, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
} finally { globalThis.fetch = oldFetch; }
console.log(`\n${passed} passed, 0 failed — real SQLite, mocked network/AI, no production writes`);
