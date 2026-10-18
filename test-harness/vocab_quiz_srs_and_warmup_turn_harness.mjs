// 2026-10-18 — 두 가지를 «실제로 돌려» 확인합니다.
//   A. 단어 퀴즈(/api/vocab/quiz-submit) 결과가 복습 일정(SRS: level·next_review_at)에 반영되는가
//      + 같은 퀴즈를 되풀이 제출해도 기록은 처음 한 번만 반영되는가 (짝: 처음 제출은 반영된다)
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
      run: async () => { const r = st.run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
    return api;
  };
  return { DB: { prepare: prep } };
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

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
