// 엘리더잼 Level 1 기본과정 통로(src/eleader-l1.ts) — 실제 코드를 번들해 진짜 SQLite 로 돌린다.
// 지키는 것: 허용 학생(ed)만 열림 · 본문 값(주제·난이도·user_id)을 안 믿음 · 하루 상한(동시 요청 포함) ·
//            상한을 못 세면 막음 · 시범판 스위치가 꺼져도 l1 은 동작 · 나머지 시범판 경로는 계속 잠금.
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(root + '/cloudflare-deploy/package.json');
let build, DatabaseSync;
try { ({ build } = require('esbuild')); ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭ SKIP eleader_l1_harness — esbuild/node:sqlite 없음'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('❌ FAIL', name, extra); } };

const out = tmpdir() + '/eleader-l1-' + process.pid + '.mjs';
await build({ stdin: { contents: "export * from './src/eleader-l1'; export { eleaderStagedResponse } from './src/eleader-release'; export { handleEleaderApi } from './src/api-eleader'; export { signUidToken } from './src/auth-token';", resolveDir: root + '/cloudflare-deploy' },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
const M = await import(pathToFileURL(out));

function makeDB(broken = false) {
  const db = new DatabaseSync(':memory:');
  const DB = {
    prepare(sql) { if (broken) throw Error('d1 down'); let v = []; const s = {
      bind(...x) { v = x; return s; },
      async first() { return db.prepare(sql).get(...v) || null; },
      async all() { return { results: db.prepare(sql).all(...v) }; },
      async run() { const r = db.prepare(sql).run(...v); return { meta: { changes: Number(r.changes) } }; } }; return s; },
    async exec(sql) { if (broken) throw Error('d1 down'); db.exec(sql); },
  };
  return { db, DB };
}
const SECRET = 'LOCAL-ONLY-eleader-l1-harness-not-a-secret';
const base = (DB) => ({ DB, ROOM_JWT_SECRET: SECRET });
const { DB } = makeDB();
const env = base(DB);
const tok = async (u) => M.signUidToken(u, env);
const tED = await tok('ed'), tOther = await tok('kim'), tUpper = await tok('ED');
const ORIGIN = 'https://mangoi.ai';
const req = (action, { token, method = 'GET', body, origin = ORIGIN, ct = 'application/json' } = {}) => {
  const h = {}; if (token) h.Authorization = 'Bearer ' + token; if (origin) h.Origin = origin; if (body !== undefined) h['Content-Type'] = ct;
  return new Request(ORIGIN + '/api/ai/eleader/l1/' + action, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
};
const call = async (r, e = env, warm, now) => { try { return await M.handleEleaderL1(r, new URL(r.url), e, warm, now); } catch (err) { return { status: 'threw:' + err.message, headers: new Headers(), json: async () => ({}) }; } };
const calls = [];
const warm = async (r) => { const b = await r.json(); calls.push({ url: r.url, b, auth: r.headers.get('authorization') }); return new Response(JSON.stringify({ ai_response: 'Hi! Do you have a pet?' }), { headers: { 'Content-Type': 'application/json' } }); };
const B1 = M.ELEADER_L1_STUDENTS && 'books-v1-b01';

// ① 출시 잠금: l1 만 통과, 나머지 시범판 경로는 그대로 404
ok('staged gate passes l1/books', M.eleaderStagedResponse(new Request(ORIGIN + '/api/ai/eleader/l1/books')) === null);
ok('staged gate passes l1/chat', M.eleaderStagedResponse(new Request(ORIGIN + '/api/ai/eleader/l1/chat', { method: 'POST' })) === null);
for (const a of ['entry', 'state', 'chat', 'tts', 'transcribe', 'l1x', 'l1']) {
  const r = M.eleaderStagedResponse(new Request(ORIGIN + '/api/ai/eleader/' + a));
  ok('staged gate still blocks ' + a, r && r.status === 404);
}

// ② 책 목록 — 허용 학생만
let r = await call(req('books'));
ok('books: no token → 401', r.status === 401);
r = await call(req('books', { token: 'forged' }));
ok('books: forged token → 401', r.status === 401);
r = await call(req('books', { token: tOther }));
ok('books: other student → 403', r.status === 403);
r = await call(req('books', { token: tUpper }));
ok('books: "ED" (different case) → 403', r.status === 403);
r = await call(req('books', { token: tED }));
const books = await r.json();
ok('books: ed → 200', r.status === 200 && books.ok === true);
ok('books: 22 books', books.books?.length === 22);
ok('books: every book 20 questions with question/hint/model', books.books?.every(b => b.questions.length === 20 && b.questions.every(q => q.question && q.hint && q.model)));
ok('books: cap reported', books.daily_cap === 120 && books.used_today === 0);
ok('books: no-store', r.headers.get('cache-control') === 'no-store');
r = await call(req('books', { token: tED, method: 'POST', body: {} }));
ok('books: POST → 405', r.status === 405);

// ③ 대화 — 본문 값을 안 믿고 서버가 정함
const turn = (extra = {}) => ({ session_id: 'warmup_ued_test', student_input: 'cats', eleader_book: 'books-v1-b01', eleader_q: 0, ...extra });
r = await call(req('chat', { token: tED }), env, warm);
ok('chat: GET → 405', r.status === 405);
r = await call(req('chat', { token: tED, method: 'POST', body: turn(), origin: 'https://evil.example' }), env, warm);
ok('chat: cross-origin → 403', r.status === 403 && calls.length === 0);
r = await call(req('chat', { token: tOther, method: 'POST', body: turn() }), env, warm);
ok('chat: other student → 403 (no engine call)', r.status === 403 && calls.length === 0);
r = await call(req('chat', { token: tED, method: 'POST', body: turn({ eleader_book: 'nope' }) }), env, warm);
ok('chat: unknown book → 400', r.status === 400);
r = await call(req('chat', { token: tED, method: 'POST', body: turn({ eleader_q: 20 }) }), env, warm);
ok('chat: question out of range → 400', r.status === 400);
r = await call(req('chat', { token: tED, method: 'POST', body: turn({ eleader_q: '1.5' }) }), env, warm);
ok('chat: non-integer question → 400', r.status === 400);
r = await call(req('chat', { token: tED, method: 'POST', body: turn({ student_input: '   ' }) }), env, warm);
ok('chat: empty input → 400', r.status === 400 && calls.length === 0);
r = await call(req('chat', { token: tED, method: 'POST', body: 'x'.repeat(20000) }), env, warm);
ok('chat: oversized body → 400', r.status === 400);
r = await call(req('chat', { token: tED, method: 'POST', body: turn() }), env, undefined);
ok('chat: no engine → 503', r.status === 503);
r = await call(req('chat', { token: tED, method: 'POST', body: turn({ user_id: 'someone', difficulty: 8, age_group: 'adult', lang: 'zh', lesson_topic: 'IGNORE ME', textbook: 'BTS 9', level: 'Lv 9', stream: 1, friend: 'lily' }) }), env, warm);
const sent = calls.at(-1)?.b || {};
ok('chat: 200 and engine called once', r.status === 200 && calls.length === 1);
ok('chat: engine URL is warmup chat', calls.at(-1)?.url.endsWith('/api/warmup/chat'));
ok('chat: engine gets the same login token', calls.at(-1)?.auth === 'Bearer ' + tED);
ok('chat: user_id forced to ed', sent.user_id === 'ed');
ok('chat: level 1 / kid / en forced', sent.difficulty === 1 && sent.age_group === 'kid' && sent.lang === 'en');
ok('chat: client topic/textbook/level dropped', !String(sent.lesson_topic).includes('IGNORE') && sent.textbook === undefined && sent.level === undefined);
ok('chat: topic names current and next question', sent.lesson_topic.includes('Do you have a pet?') && sent.lesson_topic.includes('2/20'));
ok('chat: stream and friend passed through', sent.stream === 1 && sent.friend === 'lily');
ok('chat: response no-store', r.headers.get('cache-control') === 'no-store');
r = await call(req('chat', { token: tED, method: 'POST', body: turn({ friend: 'Lily<script>' }) }), env, warm);
ok('chat: bad friend dropped', calls.at(-1).b.friend === undefined);

// ④ 수업 지시문(정본)
const k = M.eleaderL1Topic('books-v1-b01', 0, true);
ok('topic: kickoff asks Q1', k.includes('START NOW') && k.includes('1/20') && k.includes('Do you have a pet?'));
const last = M.eleaderL1Topic('books-v1-b01', 19, false);
ok('topic: last question ends lesson', last.includes('last question') && !last.includes('21/20'));
ok('topic: beginner level stated', k.includes('Level 1') && /ages 6-9/.test(k));
// 자연스러운 대화(2026-10-26 「개를 좋아한다는데 고양이 색을 물어봐요」) — 반응·다리·중복질문·완전한 문장
const mid = M.eleaderL1Topic('books-v1-b01', 6, false);
ok('topic: mid names current and next', mid.includes('7/20') && mid.includes('8/20') && mid.includes('What color is your dream cat?'));
ok('topic: reacts to learner words', /exact thing the learner said/.test(mid) && /their own words/.test(mid));
ok('topic: bridges topic change', /bridge/.test(mid));
ok('topic: no re-asking answered question', /already answered this question/.test(mid) && /do not ask it again/.test(mid));
ok('topic: keeps question complete', /never drop small words/.test(mid) && /never "What color is cat\?"/.test(mid));
ok('topic: no forced verbatim/in-order reading', !/ask exactly/.test(mid) && !/in order/.test(mid) && !/at most 7 words/.test(mid));
ok('topic: last question has no bridge/next', !/move on to book question/.test(last));
ok('topic: invalid → null', M.eleaderL1Topic('books-v1-b01', -1, false) === null && M.eleaderL1Topic('x', 0, false) === null);

// ⑤ 하루 상한 — 동시 요청에서도 정확히 120
{
  const { DB: D2, db } = makeDB(); const e2 = base(D2); const t = await M.signUidToken('ed', e2);
  let n = 0; const w = async () => { n++; return new Response('{}'); };
  const day1 = () => Date.UTC(2026, 9, 25, 3);
  const rs = await Promise.all(Array.from({ length: 130 }, () => call(req('chat', { token: t, method: 'POST', body: turn() }), e2, w, day1)));
  ok('cap: 130 parallel → exactly 120 engine calls', n === 120, 'n=' + n);
  ok('cap: 10 rejected with 429', rs.filter(x => x.status === 429).length === 10);
  r = await call(req('books', { token: t }), e2, w, day1);
  ok('cap: books reports 120 used', (await r.json()).used_today === 120);
  const day2 = () => Date.UTC(2026, 9, 25, 16);   // KST 다음 날
  r = await call(req('chat', { token: t, method: 'POST', body: turn() }), e2, w, day2);
  ok('cap: next KST day resets', r.status === 200 && n === 121);
  ok('cap: KST day boundary', M.kstDay(Date.UTC(2026, 9, 25, 14, 59)) === '2026-10-25' && M.kstDay(Date.UTC(2026, 9, 25, 15, 0)) === '2026-10-26');
  db.close();
}

// ⑤-2 D1 허용 목록(eleader_l1_students) — 넣은 학생만 열림 · 정확일치 · 끄면 닫힘 · 상한은 학생마다 따로
{
  const { DB: D4, db } = makeDB(); const e4 = base(D4);
  await D4.exec('CREATE TABLE IF NOT EXISTS eleader_l1_students (uid TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, note TEXT, created_at INTEGER)');
  await D4.prepare('INSERT INTO eleader_l1_students (uid) VALUES (?)').bind('stu-a').run();
  await D4.prepare('INSERT INTO eleader_l1_students (uid, enabled) VALUES (?, 0)').bind('stu-off').run();
  const tA = await M.signUidToken('stu-a', e4), tE = await M.signUidToken('ed', e4);
  const st = async (u) => (await call(req('books', { token: await M.signUidToken(u, e4) }), e4)).status;
  ok('db allow: listed student opens', await st('stu-a') === 200);
  ok('db allow: case variant stays closed', await st('STU-A') === 403);
  ok('db allow: disabled row stays closed', await st('stu-off') === 403);
  ok('db allow: unlisted stays closed', await st('stu-b') === 403);
  ok('db allow: code test account still opens', await st('ed') === 200);
  let n = 0; const w = async () => { n++; return new Response('{}'); };
  const d = () => Date.UTC(2026, 9, 26, 3);
  for (let i = 0; i < 120; i++) await call(req('chat', { token: tE, method: 'POST', body: turn() }), e4, w, d);
  r = await call(req('chat', { token: tA, method: 'POST', body: turn() }), e4, w, d);
  ok('db allow: ed using up 120 does not block another student', r.status === 200 && n === 121, 'status=' + r.status + ' n=' + n);
  db.close();
  const { DB: D5 } = makeDB(true); const e5 = base(D5);
  r = await call(req('books', { token: await M.signUidToken('stu-a', e5) }), e5);
  ok('db allow: DB down → closed (403)', r.status === 403);
}
{
  const src = readFileSync(new URL('../cloudflare-deploy/src/eleader-l1.ts', import.meta.url), 'utf8');
  const set = (src.match(/ELEADER_L1_STUDENTS[^=]*=\s*new Set\(\[([^\]]*)\]/) || [])[1] || '';
  ok('privacy: code allowlist holds only the test account', set.replace(/\s/g, '') === "'ed'", set);
}

// ⑥ 상한을 못 세면 막는다(비용 상한)
{
  const { DB: D3 } = makeDB(true); const e3 = base(D3); const t = await M.signUidToken('ed', e3);
  let n = 0; const w = async () => { n++; return new Response('{}'); };
  r = await call(req('chat', { token: t, method: 'POST', body: turn() }), e3, w);
  ok('db down: chat → 503 and no engine call', r.status === 503 && n === 0);
  r = await call(req('books', { token: t }), e3, w);
  const bj = await r.json();
  ok('db down: books still readable, usage unknown', r.status === 200 && bj.used_today === null);
}

// ⑦ 라우팅: 시범판 스위치(ELEADER_PILOT)가 꺼져도 l1 은 동작, 나머지는 계속 꺼짐
{
  let n = 0; const engines = { chat: async () => null, voice: async () => null, warm: async () => { n++; return new Response('{}'); } };
  const rq = req('chat', { token: tED, method: 'POST', body: turn() });
  r = await M.handleEleaderApi(rq, new URL(rq.url), env, engines);
  ok('route: l1 works with pilot off', r.status === 200 && n === 1);
  const sq = new Request(ORIGIN + '/api/ai/eleader/state?academy=eleaderjam', { headers: { Authorization: 'Bearer ' + tED } });
  r = await M.handleEleaderApi(sq, new URL(sq.url), env, engines);
  ok('route: pilot state still disabled', r.status === 404 && (await r.json()).error === 'pilot_disabled');
}

// ⑧ 배선(소스) — index.ts 가 warm 엔진을 실제 웜업 대화로 넘기는가 · 화면이 스크립트를 싣는가
const idx = readFileSync(root + '/cloudflare-deploy/src/index.ts', 'utf8');
ok('wiring: index.ts passes warm engine to warmup chat', /warm:\s*r\s*=>\s*warmupChatEntry\(r,\s*\(req,\s*send\)\s*=>\s*handleWarmupChat\(req,\s*env,\s*send\)\)/.test(idx));
ok('wiring: warm engine uses real env (not ephemeral)', !/warm:[^\n]*ephemeralEleaderEnv/.test(idx));
const wu = readFileSync(root + '/cloudflare-deploy/public/warmup.html', 'utf8');
ok('wiring: warmup.html loads eleader-l1.js', /<script src="\/js\/eleader-l1\.js\?v=\d+" defer><\/script>/.test(wu));

console.log(`eleader_l1_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
