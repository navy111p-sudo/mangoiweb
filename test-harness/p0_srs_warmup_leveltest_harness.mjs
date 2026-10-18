// 2026-10-18 — 두 가지를 «실제로 돌려» 확인합니다.
//   A. 단어 퀴즈(/api/vocab/quiz-submit) 결과가 복습 일정(SRS: level·next_review_at)에 반영되는가
//      + 같은 퀴즈를 되풀이 제출해도 기록은 처음 한 번만 반영되는가 (짝: 처음 제출은 반영된다)
//   C. 레벨테스트 정답·해설은 «토큰으로 확인된 로그인» 일 때만 싣는가 (짝: 로그인이면 싣는다 · 화면이 이유를 말한다)
//   B. 웜업 «몇 번째 턴» 이 히스토리 상한(21)에 붙지 않고 세션별로 계속 늘어나는가
//      (짝: 카운터가 없거나 KV 가 없으면 예전 계산 그대로)
// 정본 함수·라우트·블록은 소스에서 오려 내 진짜 SQLite / 가짜 KV 로 돌립니다(하니스에 숫자를 베끼지 않음).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GAMES = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/src/api-games.ts'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/src/index.ts'), 'utf8');
let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };

function braceBlock(src, from) {
  const open = src.indexOf('{', from);
  if (open < 0) return '';
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(from, i + 1); }
  }
  return '';
}

// ── 정본 vocabSrsNext 를 오려 내 실행 ──
const srsDeclStart = GAMES.indexOf('export const VOCAB_SRS_INTERVALS');
const fnStart = GAMES.indexOf('export function vocabSrsNext');
const srsSrc = srsDeclStart >= 0 && fnStart > srsDeclStart
  // ⚠️ 반환 타입 «{ level: …}» 의 중괄호를 몸통으로 잡지 않게, 반환 타입 뒤 «} {» 부터 짝을 맞춘다
  ? GAMES.slice(srsDeclStart, fnStart) + GAMES.slice(fnStart, GAMES.indexOf('} {', fnStart) + 2) + braceBlock(GAMES, GAMES.indexOf('} {', fnStart) + 2)
  : '';
console.log('\n[ A-1. 정본 vocabSrsNext ]');
check('정본을 오려 냈다(전제)', srsSrc.length > 0);
let VOCAB_SRS_INTERVALS, vocabSrsNext;
try {
  const js = stripTypeScriptTypes(srsSrc.replace(/export /g, ''));
  ({ VOCAB_SRS_INTERVALS, vocabSrsNext } = new Function(js + '\nreturn { VOCAB_SRS_INTERVALS, vocabSrsNext };')());
} catch (e) { console.log('  (오려 내기 실패)', e.message); }
try {
  const now = 1_000_000;
  check('정답이면 level+1', vocabSrsNext(2, true, now).level === 3);
  check('오답이면 level 0', vocabSrsNext(5, false, now).level === 0);
  check('최대 7에서 멈춘다', vocabSrsNext(7, true, now).level === 7);
  check('null level 은 0 으로 본다', vocabSrsNext(null, true, now).level === 1);
  check('다음 복습 = 간격표의 그 날수', vocabSrsNext(2, true, now).next === now + VOCAB_SRS_INTERVALS[3] * 86400000);
} catch (e) { check('정본 실행', false, e.message); }
console.log('\n[ A-2. 간격표가 한 곳뿐인가 ]');
check('/api/vocab/review 가 간격표를 다시 적지 않는다', (GAMES.match(/\[1, 2, 4, 7, 14, 30, 60, 120\]/g) || []).length === 1);
const reviewBlk = braceBlock(GAMES, GAMES.indexOf("path === '/api/vocab/review'"));
check('/api/vocab/review 가 정본을 부른다', /vocabSrsNext\(/.test(reviewBlk));

// ── quiz-submit 라우트를 오려 내 진짜 SQLite 로 실행 ──
console.log('\n[ A-3. 퀴즈 제출 → 복습 일정 반영 ]');
const qsStart = GAMES.indexOf("if (method === 'POST' && path === '/api/vocab/quiz-submit')");
const qsBlk = qsStart >= 0 ? braceBlock(GAMES, qsStart) : '';
check('quiz-submit 블록을 오려 냈다(전제)', qsBlk.length > 0);

function makeEnv(db) {
  const prep = (sql) => {
    const st = db.prepare(sql);
    let args = [];
    const api = {
      bind: (...a) => { args = a; return api; },
      first: async () => st.get(...args) ?? null,
      all: async () => ({ results: st.all(...args) }),
      run: async () => { if (db.__failOn && sql.includes(db.__failOn)) throw new Error('D1 transient'); const r = st.run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      __runSync: () => { const r = st.run(...args); return { meta: { changes: Number(r.changes) } }; },
      __sql: sql,
    };
    return api;
  };
  // D1 batch = 한 트랜잭션 (하나라도 던지면 전부 되돌림). failOn: 그 SQL 조각이 든 문장에서 일부러 던진다.
  const batch = async (stmts) => {
    db.exec('BEGIN');
    try {
      const out = stmts.map((s) => { if (db.__failOn && s.__sql.includes(db.__failOn)) throw new Error('D1 transient'); return s.__runSync(); });
      db.exec('COMMIT'); return out;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  return { DB: { prepare: prep, batch } };
}
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, word TEXT, korean TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0);
           CREATE TABLE vocab_quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, question TEXT, options TEXT, correct_index INTEGER NOT NULL, hint TEXT, source_word TEXT, quiz_type TEXT, completed INTEGER DEFAULT 0, user_answer INTEGER, is_correct INTEGER, created_at INTEGER, completed_at INTEGER);
           CREATE TABLE vocab_review_log (user_id TEXT, vocab_id INTEGER, correct INTEGER, reviewed_at INTEGER);`);
  db.prepare(`INSERT INTO vocabulary (user_id, word, korean, level, next_review_at) VALUES ('kid1','apple','사과',3, 0)`).run();
  db.prepare(`INSERT INTO vocab_quizzes (user_id, correct_index, source_word, created_at) VALUES ('kid1', 2, 'apple', 0)`).run();
  return db;
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let route = null;
try {
  const body = stripTypeScriptTypes('async function x(){\n' + qsBlk + '\n}');
  const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'));
  route = new AsyncFunction('env', 'request', 'ensureMicroLearnSchema', 'vocabSrsNext', 'json',
    `const method='POST', path='/api/vocab/quiz-submit';\n${inner}\nreturn null;`);
} catch (e) { check('라우트 컴파일', false, e.message); }
const json = (o, s) => ({ __json: o, status: s || 200 });
async function submit(db, answer) {
  const request = { json: async () => ({ quiz_id: 1, answer }) };
  try { return await route(makeEnv(db), request, async () => {}, vocabSrsNext, json); }
  catch (e) { return { __err: e.message }; }
}
if (route && vocabSrsNext) {
  { // 오답 → level 0, 내일 다시
    const db = freshDb();
    const before = Date.now();
    const r = await submit(db, 0);
    const v = db.prepare(`SELECT level, next_review_at, wrong_count FROM vocabulary WHERE word='apple'`).get();
    check('오답 응답은 correct:false', r && r.__json && r.__json.correct === false, r);
    check('오답이면 level 0 으로', v.level === 0, v);
    check('오답이면 next_review_at 이 약 1일 뒤', v.next_review_at >= before + 86400000 - 5000 && v.next_review_at <= Date.now() + 86400000 + 5000, v);
    check('오답 카운트 +1', v.wrong_count === 1, v);
  }
  { // 정답 → level+1, 간격만큼 뒤
    const db = freshDb();
    const r = await submit(db, 2);
    const v = db.prepare(`SELECT level, next_review_at, correct_count FROM vocabulary WHERE word='apple'`).get();
    check('정답 응답은 correct:true', r && r.__json && r.__json.correct === true, r);
    check('정답이면 level 3 → 4', v.level === 4, v);
    check('정답이면 next_review_at 이 간격표[4]일 뒤', v.next_review_at > Date.now() + (VOCAB_SRS_INTERVALS[4] - 1) * 86400000, v);
    check('정답 카운트 +1', v.correct_count === 1, v);
  }
  { // 되풀이 제출 → 처음만 반영 (짝: 처음은 반영됨 — 위 두 블록)
    const db = freshDb();
    await submit(db, 2); await submit(db, 2); await submit(db, 2);
    const v = db.prepare(`SELECT level, correct_count FROM vocabulary WHERE word='apple'`).get();
    const logs = db.prepare(`SELECT COUNT(*) AS n FROM vocab_review_log`).get().n;
    const r = await submit(db, 0);
    check('세 번 제출해도 level 은 한 번만 오른다(4)', v.level === 4, v);
    check('세 번 제출해도 카운트는 1', v.correct_count === 1, v);
    check('복습 이력도 한 줄', Number(logs) === 1, logs);
    check('되풀이 제출에도 채점 결과는 돌려준다', r && r.__json && r.__json.correct === false, r);
  }
  { // SRS 저장이 한 번 실패하면 «완료» 도 안 남아, 다시 제출하면 처음 제출로 반영된다 (Codex #1608)
    const db = freshDb();
    db.__failOn = 'UPDATE vocabulary';
    const r1 = await submit(db, 2);
    const q1 = db.prepare(`SELECT completed FROM vocab_quizzes WHERE id=1`).get();
    const logs1 = db.prepare(`SELECT COUNT(*) AS n FROM vocab_review_log`).get().n;
    check('실패하면 ok:false + retryable 로 말한다', r1 && r1.__json && r1.__json.ok === false && r1.__json.retryable === true && r1.status === 503, r1);
    check('실패하면 퀴즈가 «완료» 로 안 남는다', !q1.completed, q1);
    check('실패하면 복습 이력도 안 남는다(한 트랜잭션)', Number(logs1) === 0, logs1);
    db.__failOn = null;
    const r2 = await submit(db, 2);
    const v = db.prepare(`SELECT level, correct_count FROM vocabulary WHERE word='apple'`).get();
    check('다시 제출하면 SRS 가 반영된다(level 4)', r2 && r2.__json && r2.__json.ok === true && v.level === 4 && v.correct_count === 1, { r2, v });
  }
  { // 짝: 단어가 단어장에 없어도 퀴즈 완료·이력은 남는다
    const db = freshDb();
    db.prepare(`DELETE FROM vocabulary`).run();
    const r = await submit(db, 2);
    const q = db.prepare(`SELECT completed FROM vocab_quizzes WHERE id=1`).get();
    const logs = db.prepare(`SELECT COUNT(*) AS n FROM vocab_review_log`).get().n;
    check('단어장에 없어도 ok:true · 완료 · 이력 1줄', r && r.__json && r.__json.ok === true && q.completed === 1 && Number(logs) === 1, { r, q, logs });
  }
}

// ── B. 웜업 턴 카운터 블록을 오려 내 가짜 KV 로 실행 ──
console.log('\n[ B. 웜업 «몇 번째 턴» 은 계속 늘어난다 ]');
const tStart = INDEX.indexOf('let turnCount = Math.floor(history.length / 2) + 1;');
let tEnd = -1;
if (tStart >= 0) { const tryAt = INDEX.indexOf('try {', tStart); const blk = braceBlock(INDEX, tryAt); const after = INDEX.indexOf('}', tryAt + blk.length); tEnd = INDEX.indexOf('\n', INDEX.indexOf("turn counter skipped", tStart)); }
const tSrc = tStart >= 0 && tEnd > tStart ? INDEX.slice(tStart, tEnd) : '';
check('턴 카운터 블록을 오려 냈다(전제)', /warmupturn:/.test(tSrc));
check('예전 «const turnCount = history...» 한 줄만 남아 있지 않다', !/const turnCount = Math\.floor\(history\.length \/ 2\) \+ 1;/.test(INDEX));
let turnFn = null;
try {
  turnFn = new AsyncFunction('env', 'history', 'sessionId', stripTypeScriptTypes(tSrc) + '\nreturn turnCount;');
} catch (e) { check('턴 블록 컴파일', false, e.message); }
const hist = (pairs) => Array.from({ length: Math.min(pairs, 20) * 2 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' }));
if (turnFn) {
  const store = new Map();
  const kv = { get: async (k) => store.has(k) ? store.get(k) : null, put: async (k, v) => { store.set(k, v); } };
  const env = { SESSION_STATE: kv };
  let last = 0, mono = true, t = 0;
  for (let i = 0; i < 30; i++) { t = await turnFn(env, hist(i), 's1'); if (t <= last) mono = false; last = t; }
  check('30턴 동안 계속 늘어난다(단조 증가)', mono, last);
  check('30번째 턴은 30', t === 30, t);
  const tOther = await turnFn(env, hist(0), 's2');
  check('다른 세션은 1부터', tOther === 1, tOther);
  // 짝: KV 가 없으면 예전 계산 그대로 (상한 21)
  const tNoKv = await turnFn({}, hist(25), 's3');
  check('KV 가 없으면 예전 계산(21)', tNoKv === 21, tNoKv);
  // KV 가 던지면 예전 계산으로 떨어지고 대화는 계속된다
  const bad = { SESSION_STATE: { get: async () => { throw new Error('kv down'); }, put: async () => {} } };
  let tBad = null; try { tBad = await turnFn(bad, hist(3), 's4'); } catch (e) { tBad = 'threw'; }
  check('KV 가 실패해도 던지지 않고 예전 계산(4)', tBad === 4, tBad);
}

// ── C. 레벨테스트 정답·해설 잠금 ──
console.log('\n[ C. 레벨테스트 정답·해설은 로그인 학생만 ]');
const ADMIN = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/src/api-admin.ts'), 'utf8');
const cStart = ADMIN.indexOf('const reviewLocked = !authedUid;');
const cEnd = cStart >= 0 ? ADMIN.indexOf('return json({ ok: true, ai_score', cStart) : -1;
const cSrc = cStart >= 0 && cEnd > cStart ? ADMIN.slice(cStart, cEnd) : '';
check('잠금 블록을 오려 냈다(전제)', cSrc.length > 0);
const retLine = cEnd > 0 ? ADMIN.slice(cEnd, ADMIN.indexOf('\n', cEnd)) : '';
check('응답에 review_locked 를 싣는다', /review_locked:\s*reviewLocked/.test(retLine), retLine.slice(0, 160));
let lockFn = null;
try { lockFn = new Function('authedUid', 'buildLeveltestReview', 'CEFR_BANK', 'answers', stripTypeScriptTypes(cSrc) + '\nreturn { review, reviewLocked };'); }
catch (e) { check('잠금 블록 컴파일', false, e.message); }
if (lockFn) {
  const fake = () => [{ id: 'a1_1', answer: 2 }];
  let anon = null, authed = null;
  try { anon = lockFn(null, fake, [], { a1_1: 0 }); authed = lockFn('kid1', fake, [], { a1_1: 0 }); } catch (e) { check('잠금 블록 실행', false, e.message); }
  if (anon && authed) {
    check('비로그인이면 review 를 싣지 않는다', anon.review === undefined, anon);
    check('비로그인이면 review_locked = true', anon.reviewLocked === true, anon);
    check('짝: 로그인이면 정본 결과를 싣는다', Array.isArray(authed.review) && authed.review.length === 1, authed);
    check('짝: 로그인이면 review_locked = false', authed.reviewLocked === false, authed);
    let thrown = null; try { thrown = lockFn('kid1', () => { throw new Error('x'); }, [], {}); } catch (e) { thrown = 'threw'; }
    check('해설 만들기가 실패해도 던지지 않는다(빈 배열)', thrown && Array.isArray(thrown.review) && thrown.review.length === 0, thrown);
  }
}
const HTML = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/level-test-ai.html'), 'utf8');
const rvAt = HTML.indexOf('function renderReview(');
const rvBody = rvAt >= 0 ? braceBlock(HTML, rvAt) : '';
check('화면 renderReview 를 오려 냈다(전제)', rvBody.length > 100);
let rv = null;
try { rv = new Function('$', 'questions', 'esc', rvBody + '\nreturn renderReview;'); } catch (e) { check('화면 함수 컴파일', false, e.message); }
if (rv) {
  const mk = () => { const c = new Set(['hidden']); return { innerHTML: '', textContent: '', classList: { add: (x) => c.add(x), remove: (x) => c.delete(x), contains: (x) => c.has(x) } }; };
  const nodes = { 'ai-review-wrap': mk(), 'ai-review': mk(), 'ai-review-n': mk(), 'ai-review-tip': mk() };
  const fn = rv((id) => nodes[id], [], (x) => String(x));
  fn({ ok: true, correct: 3, total: 24, review_locked: true });
  check('잠긴 응답이면 상자를 열고 «로그인하면 해설» 이라 말한다', !nodes['ai-review-wrap'].classList.contains('hidden') && /로그인하면/.test(nodes['ai-review'].innerHTML), nodes['ai-review'].innerHTML.slice(0, 80));
  check('영어 안내도 함께', /Log in to see/.test(nodes['ai-review'].innerHTML));
  check('잠긴 응답에 «전부 맞혔다» 라고 말하지 않는다', !/전부 맞혔/.test(nodes['ai-review'].innerHTML));
  const n2 = { 'ai-review-wrap': mk(), 'ai-review': mk(), 'ai-review-n': mk(), 'ai-review-tip': mk() };
  rv((id) => n2[id], [], (x) => String(x))({ ok: true, correct: 3, total: 24 });
  check('짝: review 도 잠금도 없는 옛 응답에는 아무것도 안 그린다', n2['ai-review-wrap'].classList.contains('hidden') && n2['ai-review'].innerHTML === '');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
