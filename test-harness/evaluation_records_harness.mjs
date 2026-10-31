/** Stage4: run the bundled production Worker and real SQLite; no live API or notifications. */
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
const src = name => readFileSync(join(CF, name), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'evaluation-records-'));
const { build } = req('esbuild');
const oldFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async () => { externalCalls++; throw new Error('External network prohibited'); };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('  ✅', name); };
const legacySchema = `CREATE TABLE student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, eval_at INTEGER NOT NULL, eval_type TEXT, level TEXT, score_speaking REAL, score_listening REAL, score_reading REAL, score_writing REAL, score_total REAL, evaluator TEXT, comment TEXT, next_goal TEXT, created_at INTEGER NOT NULL)`;
const canonicalSchema = src('src/api-mango.ts').match(/\['student_evaluations', `([^`]+)`\]/)[1];
function fixture(schema = 'legacy') {
  const raw = new DatabaseSync(':memory:');
  if (schema !== 'fresh') raw.exec(schema === 'legacy' ? legacySchema : canonicalSchema);
  raw.exec(`CREATE TABLE students_erp (user_id TEXT, student_id TEXT, login_id TEXT, username TEXT, student_name TEXT, korean_name TEXT, english_name TEXT);
    CREATE TABLE admin_sessions (token TEXT PRIMARY KEY, username TEXT, expires_at INTEGER, last_seen_at INTEGER);`);
  raw.prepare('INSERT INTO admin_sessions VALUES (?,?,?,?)').run('fixture-token', 'fixture-admin', Date.now() + 600000, 0);
  const sqls = [];
  const DB = {
    prepare(sql) {
      sqls.push(sql);
      const bound = args => ({
        bind: (...args) => { assert.ok(args.length <= 100, 'D1 bind limit'); return bound(args); },
        first: async () => raw.prepare(sql).get(...args) || null,
        all: async () => ({ success: true, results: raw.prepare(sql).all(...args) }),
        run: async () => { const r = raw.prepare(sql).run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
      });
      return bound([]);
    },
    exec: async sql => { sqls.push(sql); raw.exec(sql); return { success: true }; },
  };
  const env = { DB, ASSETS: { fetch: async () => { throw new Error('Unexpected static route'); } },
    PDF_STORE: { get: async () => null, put: async () => {} }, SESSION_STATE: { get: async () => null, put: async () => {} },
    AI: { run: async () => ({ response: JSON.stringify({ overall_score: 76, summary_ko: '로컬 평가입니다.' }) }) } };
  return { raw, DB, env, sqls };
}
const insert = (f, row) => f.raw.prepare(`INSERT INTO student_evaluations (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
const roster = (f, uid, name, extra = {}) => {
  const row = { user_id: uid, korean_name: name, ...extra };
  f.raw.prepare(`INSERT INTO students_erp (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
};
const snapshot = f => f.raw.prepare('SELECT * FROM student_evaluations ORDER BY id').all();
const unchanged = (f, before) => {
  const after = snapshot(f);
  before.forEach((row, index) => { for (const [key, value] of Object.entries(row)) assert.equal(after[index][key], value, `unchanged ${row.id}.${key}`); });
  assert.ok(!f.sqls.some(sql => /(?:UPDATE|DELETE FROM) student_evaluations/i.test(sql)), 'no historical DML');
};
try {
  const output = join(dir, 'worker.mjs');
  await build({ entryPoints: [join(CF, 'src/index.ts')], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', outfile: output, logLevel: 'silent' });
  let fixtureNumber = 0;
  async function call(f, path = '/api/admin/eval/list', body, authenticated = true) {
    // Production DDL caches are isolate-wide: each independent database needs its own Worker isolate.
    f.worker ||= (await import(pathToFileURL(output).href + '?fixture=' + (++fixtureNumber))).default;
    const response = await f.worker.fetch(new Request('https://example.invalid' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(authenticated ? { Cookie: 'mango_admin_session=fixture-token' } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), f.env, { waitUntil() {} });
    return { status: response.status, body: await response.json() };
  }
  await test('legacy 76/100 gains exact roster name, labeled evaluator and KST evaluation date; raw row unchanged', async () => {
    const f = fixture(); roster(f, 'legacy-uid', '레거시 학생');
    insert(f, { user_id: 'legacy-uid', eval_at: Date.parse('2026-09-30T15:00:00Z'), score_total: 76, evaluator: '기록 평가자', created_at: Date.parse('2026-10-02T15:00:00Z') });
    const before = snapshot(f); const r = await call(f); assert.equal(r.status, 200);
    const row = r.body.rows[0];
    assert.equal(row.display_student_name, '레거시 학생'); assert.equal(row.student_name_status, 'roster');
    assert.equal(row.student_name, null); assert.equal(row.student_uid, null);
    assert.equal(row.display_author_role, 'evaluator'); assert.equal(row.display_author_name, '기록 평가자'); assert.equal(row.teacher_name, null);
    assert.equal(row.display_date, '2026-10-01'); assert.equal(row.display_date_source, 'eval_at'); assert.equal(row.lesson_date, null);
    assert.equal(row.score_value, 76); assert.equal(row.score_max, 100); assert.equal(row.score_normalized_100, 76);
    assert.equal(r.body.stats.avg_score, 76); assert.equal(r.body.stats.total, 1); unchanged(f, before);
  });
  await test('canonical recorded name, teacher and lesson date win; modern raw scores and dates are untouched', async () => {
    const f = fixture('canonical'); roster(f, 'modern', '명부 이름');
    insert(f, { student_uid: 'modern', student_name: '기록 이름', teacher_name: '기록 강사', lesson_date: '2026-09-25', score_overall: 4, created_at: 1, updated_at: 2 });
    const before = snapshot(f); const r = await call(f); const row = r.body.rows[0];
    assert.equal(row.display_student_name, '기록 이름'); assert.equal(row.student_name_status, 'recorded');
    assert.equal(row.display_author_name, '기록 강사'); assert.equal(row.display_author_role, 'teacher');
    assert.equal(row.display_date, '2026-09-25'); assert.equal(row.display_date_source, 'lesson_date');
    assert.equal(row.score_overall, 4); assert.equal(row.score_status, 'unknown_scale'); unchanged(f, before);
    assert.ok(!f.sqls.some(sql => sql.includes('FROM students_erp WHERE user_id COLLATE')));
  });
  await test('identity lookup is exact, case sensitive, unique and never based on names/aliases', async () => {
    const f = fixture(); const initial = await call(f); assert.equal(initial.status, 200, JSON.stringify(initial));
    roster(f, 'Kim', '올바른 이름'); roster(f, 'kim', '다른 이름');
    roster(f, 'duplicate', '첫째'); roster(f, 'duplicate', '둘째');
    roster(f, 'no-name', null, { username: '사용자 계정', login_id: '계정 별칭' });
    roster(f, 'other-id', '다른 학생', { login_id: 'alias-only', student_id: 'alias-only', username: 'alias-only' });
    const cases = [
      ['Kim', null, 'roster', '올바른 이름'], ['duplicate', null, 'ambiguous', null],
      ['unknown', null, 'not_found', null], ['no-name', null, 'missing_name', null],
      ['alias-only', null, 'not_found', null], [' Kim', null, 'not_found', null],
      ['Kim', 'kim', 'uid_conflict', null], ['', null, 'missing_uid', null],
    ];
    for (const [uid, canonical] of cases) insert(f, { user_id: uid, student_uid: canonical, eval_at: 1, created_at: 1, score_total: 76 });
    const before = snapshot(f); const r = await call(f);
    for (let i = 0; i < cases.length; i++) {
      const row = r.body.rows.find(row => row.id === i + 1);
      assert.equal(row.student_name_status, cases[i][2]); assert.equal(row.display_student_name, cases[i][3]);
    }
    assert.equal(r.body.stats.total, cases.length); assert.equal(r.body.stats.avg_score, 76); unchanged(f, before);
  });
  for (const failure of ['throw', 'unsuccessful', 'missing_table']) await test(`roster ${failure} is explicit lookup_failed, keeps evaluations and statistics`, async () => {
    const f = fixture(); insert(f, { user_id: 'u', eval_at: 1, score_total: 76, created_at: 1 });
    const prepare = f.DB.prepare;
    if (failure === 'missing_table') f.raw.exec('DROP TABLE students_erp');
    else f.DB.prepare = sql => {
      if (sql.includes('FROM students_erp WHERE user_id COLLATE')) {
        if (failure === 'throw') throw new Error('fixture roster outage');
        return { bind: () => ({ all: async () => ({ success: false, results: [] }) }) };
      }
      return prepare(sql);
    };
    const r = await call(f); assert.equal(r.status, 200); assert.equal(r.body.rows[0].student_name_status, 'lookup_failed');
    assert.equal(r.body.rows[0].display_student_uid, 'u'); assert.equal(r.body.stats.avg_score, 76);
  });
  await test('KST midnight, date-only, recorded fallback, invalid dates and truly missing dates stay distinct', async () => {
    const f = fixture('canonical'); const initial = await call(f); assert.equal(initial.status, 200, JSON.stringify(initial));
    const rows = [
      { eval_at: Date.parse('2026-09-30T14:59:59Z') },
      { eval_at: Date.parse('2026-09-30T15:00:00Z') },
      { lesson_date: '2026-09-30', eval_at: Date.parse('2026-09-30T15:00:00Z') },
      { created_at: Date.parse('2026-09-30T15:00:00Z') },
      { lesson_date: '2026-02-30', eval_at: 'broken', created_at: Date.parse('2026-09-30T15:00:00Z') },
      { created_at: '' },
      { eval_at: '2026-09-30T23:50:00-04:00' },
      { eval_at: '2026-09-30T23:50:00' },
    ];
    rows.forEach((row, i) => insert(f, { student_uid: 'date-' + i, created_at: 1, updated_at: 1, ...row }));
    const before = snapshot(f); const r = await call(f);
    const expectations = [
      ['2026-09-30', 'eval_at', 'ok'], ['2026-10-01', 'eval_at', 'ok'], ['2026-09-30', 'lesson_date', 'ok'],
      ['2026-10-01', 'created_at', 'ok'], ['2026-10-01', 'created_at', 'invalid_date'], [null, null, 'missing'],
      ['2026-10-01', 'eval_at', 'ok'], ['1970-01-01', 'created_at', 'invalid_date'],
    ];
    expectations.forEach(([date, source, status], i) => {
      const row = r.body.rows.find(row => row.id === i + 1);
      assert.equal(row.display_date, date); assert.equal(row.display_date_source, source); assert.equal(row.date_status, status);
    }); unchanged(f, before);
  });
  await test('205 roster lookups are bounded, return one row each and preserve full-dataset stats with LIMIT', async () => {
    const f = fixture();
    for (let i = 0; i < 205; i++) { roster(f, 'u' + i, '학생' + i); insert(f, { user_id: 'u' + i, eval_at: 1, created_at: i + 1, score_total: 76 }); }
    const r = await call(f, '/api/admin/eval/list?limit=500');
    assert.equal(r.body.rows.length, 205); assert.ok(r.body.rows.every(row => row.student_name_status === 'roster'));
    assert.equal(f.sqls.filter(sql => sql.includes('FROM students_erp WHERE user_id COLLATE')).length, 3);
    const limited = await call(f, '/api/admin/eval/list?limit=1');
    assert.equal(limited.body.rows.length, 1); assert.equal(limited.body.stats.total, 205); assert.equal(limited.body.stats.avg_score, 76);
  });
  for (const schema of ['legacy', 'canonical', 'fresh']) await test(`all new writes work in ${schema} schema without changing historical rows`, async () => {
    const f = fixture(schema); roster(f, 'detail', '실제 학생');
    if (schema === 'canonical') insert(f, { student_uid: 'historical', student_name: '과거', lesson_date: '2026-09-01', score_overall: 4, created_at: 1, updated_at: 1 });
    else if (schema === 'legacy') insert(f, { user_id: 'historical', eval_at: 1, evaluator: '과거 평가자', score_total: 76, created_at: 1 });
    const before = schema === 'fresh' ? [] : snapshot(f);
    const detail = await call(f, '/api/admin/student/detail/evaluations', { score_total: 0, score_speaking: 0, evaluator: '상담 평가자', eval_at: Date.parse('2026-09-30T15:00:00Z'), student_name: '무시할 이름', teacher_name: '무시할 강사' });
    assert.equal(detail.status, 200, JSON.stringify(detail));
    let row = f.raw.prepare('SELECT * FROM student_evaluations WHERE id=?').get(detail.body.id);
    assert.equal(row.student_uid, 'detail'); assert.equal(row.user_id, 'detail'); assert.equal(row.score_total, 0);
    assert.equal(row.score_scale, 100); assert.equal(row.evaluation_source, 'student_detail'); assert.equal(row.updated_at, row.created_at);
    assert.ok(!row.student_name); assert.ok(!row.teacher_name); assert.ok(!row.lesson_date);
    for (const route of ['manual-create', 'draft-create']) {
      const r = await call(f, '/api/eval/' + route, { student_uid: route, score_participation: 4, lesson_date: '2026-09-20' });
      assert.equal(r.status, 200, JSON.stringify(r));
    }
    const bulk = await call(f, '/api/eval/bulk-create', { students: [{ student_uid: 'bulk', scores: { speaking: 8 } }] });
    assert.equal(bulk.body.created, 1);
    const ai = await call(f, '/api/eval/ai-lesson-report', { student_uid: 'ai', transcript: 'This is a fixture transcript.', lesson_date: '2026-09-20' });
    assert.equal(ai.status, 200); assert.ok(ai.body.evaluation_id);
    const list = await call(f); row = list.body.rows.find(row => row.id === detail.body.id);
    assert.equal(row.display_student_name, '실제 학생'); assert.equal(row.display_author_role, 'evaluator'); assert.equal(row.display_date_source, 'eval_at'); assert.equal(row.score_normalized_100, 0);
    // Legacy aliases must not newly expose canonical /10 values as raw /100 charts.
    for (const uid of ['bulk', 'ai']) {
      const feed = await call(f, '/api/admin/student/' + uid + '/evaluations');
      const full = await call(f, '/api/admin/student/' + uid + '/full');
      assert.equal(feed.status, 200); assert.deepEqual(feed.body.items, []);
      assert.equal(full.status, 200); assert.deepEqual(full.body.evaluations, []);
      const canonicalRow = list.body.rows.find(row => row.student_uid === uid);
      assert.ok(canonicalRow, 'canonical rows stay visible in the unified list');
      assert.equal(canonicalRow.score_normalized_100, uid === 'bulk' ? 80 : 76);
      assert.equal(canonicalRow.score_max, uid === 'bulk' ? 10 : 100);
    }
    // The existing manual/detail population is retained rather than silently rewritten.
    for (const uid of ['manual-create', 'draft-create', 'detail']) {
      const feed = await call(f, '/api/admin/student/' + uid + '/evaluations');
      assert.equal(feed.status, 200); assert.equal(feed.body.items.length, 1);
    }
    const all = snapshot(f).slice(before.length);
    assert.equal(all.length, 5); assert.ok(all.every(row => row.user_id === row.student_uid));
    assert.equal(all[1].lesson_date, '2026-09-20'); assert.equal(all[4].lesson_date, '2026-09-20'); unchanged(f, before);
  });
  await test('both student admin GETs preserve the legacy user_id result contract without backfill', async () => {
    const f = fixture('canonical'); const initial = await call(f); assert.equal(initial.status, 200, JSON.stringify(initial));
    for (const fields of [{ student_uid: 'wanted' }, { student_uid: '', user_id: 'wanted' }, { student_uid: 'wanted', user_id: 'wanted' }, { student_uid: 'wanted', user_id: 'other' }]) {
      insert(f, { created_at: 1, updated_at: 1, ...fields });
    }
    const before = snapshot(f);
    const r = await call(f, '/api/admin/student/wanted/evaluations');
    assert.equal(r.status, 200); assert.deepEqual(r.body.items.map(row => row.id).sort(), [2, 3]);
    const full = await call(f, '/api/admin/student/wanted/full');
    assert.equal(full.status, 200, JSON.stringify(full)); assert.deepEqual(full.body.evaluations.map(row => row.id).sort(), [2, 3]); unchanged(f, before);
  });
  await test('student admin GET handles canonical-only schema as no legacy records without migrating columns', async () => {
    const f = fixture('canonical');
    insert(f, { student_uid: 'wanted', created_at: 1, updated_at: 1 });
    const r = await call(f, '/api/admin/student/wanted/evaluations');
    assert.equal(r.status, 200); assert.deepEqual(r.body.items, []);
    assert.ok(!f.raw.prepare('PRAGMA table_info(student_evaluations)').all().some(row => row.name === 'user_id'));
  });
  await test('schema-add failure fails closed before student-detail INSERT', async () => {
    const f = fixture('canonical'); const exec = f.DB.exec;
    f.DB.exec = sql => /ADD COLUMN score_total/.test(sql) ? Promise.reject(new Error('fixture schema failure')) : exec(sql);
    const r = await call(f, '/api/admin/student/new/evaluations', { score_total: 76 });
    assert.equal(r.status, 500); assert.equal(snapshot(f).length, 0);
  });
  await test('existing authorization stays enforced at the real Worker entry', async () => {
    const f = fixture();
    for (const path of ['/api/admin/eval/list', '/api/admin/student/u/evaluations', '/api/admin/student/u/full']) assert.equal((await call(f, path, undefined, false)).status, 401);
    assert.equal((await call(f, '/api/admin/student/u/evaluations', { score_total: 76 }, false)).status, 401);
    assert.equal(snapshot(f).length, 0);
  });
  await test('admin UI renders honest identity/date labels, escaped UID/name and keeps score controls', async () => {
    const f = fixture(); roster(f, 'u<script>', '<img src=x>');
    insert(f, { user_id: 'u<script>', eval_at: Date.parse('2026-09-30T15:00:00Z'), evaluator: '<평가자>', score_total: 76, created_at: 1 });
    insert(f, { user_id: 'unknown', eval_at: 1, created_at: 1 });
    const response = await call(f); const elements = { 'ev-list-table': { innerHTML: '' }, 'ev-stats-line': { innerHTML: '' } }; const window = {};
    vm.runInNewContext(src('public/js/adm-r6.js'), { window, document: { readyState: 'loading', addEventListener() {}, getElementById: id => elements[id] }, fetch: async () => ({ ok: true, json: async () => response.body }), console });
    await window.evLoadList(); const html = elements['ev-list-table'].innerHTML;
    for (const value of ['&lt;img src=x&gt;', 'UID: u&lt;script&gt;', '평가자: &lt;평가자&gt;', '평가일 (KST): 2026-10-01', '수업일 미기록', '학생 이름 미확인', 'UID: unknown', '/100</span>', '/eval.html?id=1', 'evDelete(1)']) assert.ok(html.includes(value), value);
    assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script>'));
    response.body.rows[1].student_name_status = 'lookup_failed';
    response.body.rows[1].student_name = '   '; response.body.rows[1].teacher_name = '   ';
    await window.evLoadList(); assert.ok(elements['ev-list-table'].innerHTML.includes('학생 이름 조회 실패'));
    assert.ok(elements['ev-list-table'].innerHTML.includes('강사·평가자 미기록'));
    response.body.rows[0].lesson_date = '2026-02-30'; response.body.rows[0].date_status = 'invalid_date';
    await window.evLoadList(); assert.ok(elements['ev-list-table'].innerHTML.includes('수업일 확인 필요'));
  });
  assert.equal(externalCalls, 0);
} finally { globalThis.fetch = oldFetch; rmSync(dir, { recursive: true, force: true }); }
console.log(`\n${passed} passed, 0 failed — bundled Worker, real SQLite, no external calls or production writes`);
