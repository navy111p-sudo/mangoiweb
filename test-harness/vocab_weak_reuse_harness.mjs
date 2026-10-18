/**
 * 🔁 단어장에서 틀린 낱말 → 웜업 대화·게임 (2026-10-18, 개선안 0순위 «약점 낱말 넣기»)
 *
 *   정본 src/vocab-weak.ts 를 타입 제거로 «실제로» 돌리고, 그 SQL 을 진짜 SQLite 에 돌린다.
 *   배선 다섯(웜업 · /api/games/vocab · /api/games/weak · 게임 허브 · A.i 친구)은 소스에서 오려 내 가짜 부품으로 돌린다.
 *
 *   짝으로 묻는 것:
 *     · «틀린 채로 남은 낱말은 들어온다» ↔ «한 번 맞혀 단계가 오른 낱말·오래된 낱말·남의 낱말은 안 들어온다»
 *     · «본인이면 읽는다» ↔ «다른 토큰·토큰 없음·다른 관리자면 안 읽는다»
 *     · «단어 목록에 있는 낱말은 복습 큐에 들어간다» ↔ «목록에 없는 낱말은 지어 넣지 않는다»
 *     · «단어장 약점은 따로 싣는다» ↔ «게임 기록 배열(교사 리포트가 그리는 것)에는 안 섞인다»
 *
 *   변이 — test-harness/manual/vocab-weak-mutations.mjs 가 소스 사본을 고쳐 이 하니스를 다시 돌린다(사람이 부름).
 *     2026-10-18 실측: 그 목록 39종 전부 실제 FAIL(조건 뒤집기·경계값·«weak 배열에 push»·본인 확인 주석 처리 포함). 목록 밖의 변이는 재지 않았다.
 *   ⚠️ 처음 판은 함정 대조에 셋이 뚫렸다 — weak 를 인자로 «주입» 해 그 배열을 만드는 줄을 안 봤고(지금은 함수 통째로 돌림),
 *      기초 경계를 난이도 1 하나로만 쟀고(지금은 0·1·2·3), 캐시가 본인 확인보다 먼저 읽혔다(지금은 확인이 먼저).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const R = (rel, env) => fs.readFileSync(process.env[env] || path.join(ROOT, rel), 'utf8');
const MOD = R('cloudflare-deploy/src/vocab-weak.ts', 'VW_MOD');
const WW = R('cloudflare-deploy/src/weak-words.ts', 'VW_WW');
const EO = R('cloudflare-deploy/src/english-only.ts', 'VW_EO');
const IDX = R('cloudflare-deploy/src/index.ts', 'VW_IDX');
const HUB = R('cloudflare-deploy/public/student-games.html', 'VW_HUB');
const AI = R('cloudflare-deploy/src/api-ai.ts', 'VW_AI');
const LV = R('cloudflare-deploy/src/ai-friend-level.ts', 'VW_LV');

let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };
const done = () => { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(fail ? 1 : 0); };

/** anchor 가 든 «가장 가까운 앞쪽 opener» 부터 중괄호 짝까지 */
function blockFrom(src, opener, anchor) {
  const a = anchor ? src.indexOf(anchor) : 0;
  if (a < 0) return '';
  const i = anchor ? src.lastIndexOf(opener, a) : src.indexOf(opener);
  if (i < 0) return '';
  const b = src.indexOf('{', i + opener.length - 1);
  let d = 0;
  for (let k = b; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
const noImports = (t) => t.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, '');

// ── 정본 실행 ──
let V = null, isEnglishText = null;
try {
  V = new Function(stripTypeScriptTypes(noImports(WW) + '\n' + noImports(MOD)) +
    '\nreturn { VOCAB_WEAK_GAME_MAX, VOCAB_WEAK_WHERE, VOCAB_WEAK_ORDER, WEAK_WORDS_MAX, WEAK_WORDS_MAX_BEGINNER, cleanWeakWord, cleanWeakKo, friendWeakList, VOCAB_WEAK_FRIEND_MAX, mergeWeakFirst, loadVocabWeakRows, loadWeakWordsForWarmup, weakWordsPromptLine, weakWordsCallerOk, WEAK_WHERE, WEAK_ORDER, weakSince };')();
  isEnglishText = new Function(stripTypeScriptTypes(noImports(EO)) + '\nreturn isEnglishText;')();
} catch (e) { check('정본 실행', false, e.message); }
check('전제: 정본(vocab-weak + weak-words + english-only)을 실제로 실행했다', !!V && typeof isEnglishText === 'function');
if (!V) done();

// ── 진짜 SQLite + D1 모양 ──
const NOW = Date.now();
const D = 86400000;
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, word TEXT, korean TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER)`);
db.exec(`CREATE TABLE game_progress (id INTEGER PRIMARY KEY, user_id TEXT, lang TEXT, item TEXT, ko TEXT, wrong_count INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, last_seen INTEGER, updated_at INTEGER, pron_best INTEGER DEFAULT 0, pron_count INTEGER DEFAULT 0)`);
const vins = db.prepare(`INSERT INTO vocabulary (user_id, word, korean, level, last_reviewed_at, correct_count, wrong_count, created_at) VALUES (?,?,?,?,?,?,?,?)`);
// kim01 의 단어장
vins.run('kim01', 'apple', '사과', 0, NOW - 2 * D, 0, 2, NOW - 30 * D);        // 약점(최근)
vins.run('kim01', 'banana', '바나나', 1, NOW - 1 * D, 1, 1, NOW - 30 * D);     // 한 번 맞혀 단계 1 — 빠짐
vins.run('kim01', 'cherry', '체리', 0, NOW - 90 * D, 0, 3, NOW - 120 * D);     // 오래됨 — 빠짐
vins.run('kim01', 'grape', '포도', 0, null, 0, 0, NOW - 1 * D);                // 새로 넣은 낱말(틀린 적 없음) — 빠짐
vins.run('kim01', 'lemon', '레몬', 0, null, 0, 1, NOW - 5 * D);                // 복습 기록 없음 → created_at 으로
vins.run('kim01', 'melon', '멜론', null, NOW - 10 * D, 0, 4, NOW - 40 * D);    // level 이 비어 있음 → 0 으로 본다
vins.run('kim01', '사과나무', '', 0, NOW - 1 * D, 0, 2, NOW - 1 * D);           // 한글 — 정리에서 버림
vins.run('kim01', 'I like to eat a big red apple', '', 0, NOW - 1 * D, 0, 2, NOW - 1 * D); // 문장 — 정리에서 버림
vins.run('Kim01', 'orange', '오렌지', 0, NOW - 1 * D, 0, 5, NOW - 1 * D);      // 대소문자만 다른 남의 계정
vins.run('kim01', 'pear', '배', 0, NOW - 3 * D, 3, 1, NOW - 30 * D);             // 옛 행: 여러 번 맞혔는데 level 0(퀴즈가 level 을 안 건드리던 때) — 빠짐
vins.run('kim01', 'plum', '자두', 0, NOW - 4 * D, 1, 1, NOW - 30 * D);           // 1:1 — 게임 판정처럼 남긴다
vins.run('lee02', 'peach', '복숭아', 0, NOW - 1 * D, 0, 5, NOW - 1 * D);       // 남의 낱말
const gins = db.prepare(`INSERT INTO game_progress (user_id, lang, item, ko, wrong_count, correct_count, last_seen, updated_at) VALUES (?,?,?,?,?,?,?,?)`);
gins.run('kim01', 'en', 'tiger', '호랑이', 3, 0, NOW - 3 * D, NOW - 3 * D);
gins.run('kim01', 'en', 'Apple', '사과', 2, 0, NOW - 4 * D, NOW - 4 * D);      // 단어장 약점과 같은 낱말(대소문자만 다름)
gins.run('kim01', 'en', 'zebra', '얼룩말', 2, 0, NOW - 200 * D, NOW - 200 * D); // 오래된 게임 약점
gins.run('kim01', 'zh', '你好', '안녕', 4, 0, NOW - 1 * D, NOW - 1 * D);        // 중국어 — 웜업(영어)에 안 씀

let dbCalls = 0;
function d1(sqlite, { throwAll = false, noGame = false } = {}) {
  return {
    prepare(sql) {
      dbCalls++;
      if (throwAll) throw new Error('D1 down');
      if (noGame && /game_progress/.test(sql)) throw new Error('no such table: game_progress');
      const st = sqlite.prepare(sql);
      const mk = (args) => ({
        all: async () => ({ results: st.all(...args) }),
        first: async () => st.get(...args) || null,
        run: async () => st.run(...args),
      });
      return Object.assign(mk([]), { bind: (...a) => mk(a) });
    },
  };
}
const DB = d1(db);

console.log('\n── ① 단어장 약점 판정(정본을 SQLite 에 실제로) ──');
const rows = await V.loadVocabWeakRows(DB, 'kim01', NOW, 20);
const ws = rows.map((r) => r.word);
check('① 틀린 채로 남은 최근 낱말은 들어온다', ws.includes('apple') && ws.includes('lemon'), ws);
check('① 짝: 한 번 맞혀 단계가 오른 낱말은 빠진다', !ws.includes('banana'), ws);
check('① 60일보다 오래된 낱말은 빠진다', !ws.includes('cherry'), ws);
check('① 틀린 적 없는 낱말은 빠진다', !ws.includes('grape'), ws);
check('① level 이 비어 있으면 처음 단계(0)로 본다', ws.includes('melon'), ws);
check('① 정답이 오답보다 많은 옛 행은 약점이 아니다', !ws.includes('pear'), ws);
check('① 짝: 오답 = 정답이면 게임 판정처럼 남긴다', ws.includes('plum'), ws);
check('① 남의 낱말·대소문자만 다른 계정의 낱말은 안 들어온다', !ws.includes('peach') && !ws.includes('orange'), ws);
check('① 최근에 본 것이 먼저', ws.indexOf('apple') < ws.indexOf('lemon') && ws.indexOf('lemon') < ws.indexOf('melon'), ws);
check('① 개수 상한을 지킨다', (await V.loadVocabWeakRows(DB, 'kim01', NOW, 1)).length === 1);
check('① 뜻(korean)도 함께 돌려준다', rows.find((r) => r.word === 'apple')?.korean === '사과');
check('① 조회가 실패하면 빈 목록(던지지 않음)', (await V.loadVocabWeakRows(d1(db, { throwAll: true }), 'kim01', NOW)).length === 0);
check('① uid 가 비면 빈 목록', (await V.loadVocabWeakRows(DB, '', NOW)).length === 0);

console.log('\n── ② 웜업용 합치기 · 정리 · 프롬프트 ──');
const warm = await V.loadWeakWordsForWarmup(DB, 'kim01', NOW);
check('② 단어장 약점이 먼저, 그 뒤 게임 약점', warm[0] === 'apple' && warm.includes('lemon'), warm);
check('② 최대 3개', warm.length === V.WEAK_WORDS_MAX && V.WEAK_WORDS_MAX === 3, warm);
check('② 대소문자만 다른 같은 낱말은 한 번만', warm.filter((w) => w.toLowerCase() === 'apple').length === 1, warm);
check('② 한글·문장은 버린다', !warm.some((w) => /[가-힣]/.test(w) || w.split(' ').length > 4), warm);
const gameOnly = await V.loadWeakWordsForWarmup(DB, 'nobody', NOW);
check('② 단어장이 비면 게임 약점만(빈 사람은 빈 목록)', Array.isArray(gameOnly) && gameOnly.length === 0, gameOnly);
db.prepare(`INSERT INTO game_progress (user_id, lang, item, wrong_count, correct_count, last_seen) VALUES ('gameonly','en','tiger',2,0,?)`).run(NOW - D);
check('② 게임 약점만 있는 학생도 웜업에 쓴다', JSON.stringify(await V.loadWeakWordsForWarmup(DB, 'gameonly', NOW)) === '["tiger"]');
check('② 게임 표가 없어도 단어장 쪽은 쓴다', (await V.loadWeakWordsForWarmup(d1(db, { noGame: true }), 'kim01', NOW))[0] === 'apple');
check('② 오래된 게임 약점·중국어는 웜업에 안 쓴다', !warm.includes('zebra') && !warm.includes('你好'), warm);
check('② cleanWeakWord: 따옴표·백틱·백슬래시를 떼어 프롬프트를 깨지 않는다', V.cleanWeakWord('ap"p`l\\e') === 'apple');
check('② cleanWeakWord: 30자 넘음·영문 없음은 버린다', V.cleanWeakWord('a'.repeat(31)) === '' && V.cleanWeakWord('123') === '' && V.cleanWeakWord(null) === '');
const line3 = V.weakWordsPromptLine(['apple', 'lemon', 'melon', 'tiger'], false);
const line1 = V.weakWordsPromptLine(['apple', 'lemon', 'melon'], true);
check('② 기초는 1개만', /"apple"/.test(line1) && !/"lemon"/.test(line1), line1);
check('② 짝: 기초가 아니면 3개까지', /"apple"/.test(line3) && /"melon"/.test(line3) && !/"tiger"/.test(line3), line3);
check('② 낱말이 없으면 아무 줄도 안 붙인다', V.weakWordsPromptLine([], false) === '' && V.weakWordsPromptLine(['사과'], false) === '');
check('② «가끔만·연달아 말고»·«틀렸다고 말하지 않는다»·«화제를 바꾸지 않는다» 를 함께 말한다',
  /now and then/.test(line3) && /never two replies in a row/.test(line3) && /never mention/i.test(line3) && /Never change the topic/.test(line3), line3);
check('② 웜업에 없는 규칙 이름(«follow the student»)을 가리키지 않는다', !/follow the student/i.test(line3), line3);

console.log('\n── ③ 본인 확인 ──');
check('③ 토큰 uid 가 같으면 읽어도 된다', V.weakWordsCallerOk('kim01', 'kim01', null) === true);
check('③ 짝: 토큰 uid 가 다르면 안 된다', V.weakWordsCallerOk('kim01', 'lee02', null) === false);
check('③ 짝: 대소문자만 달라도 안 된다', V.weakWordsCallerOk('kim01', 'Kim01', null) === false);
check('③ 관리자 세션이 같은 이름이면 된다', V.weakWordsCallerOk('kim01', null, 'kim01') === true);
check('③ 짝: 다른 이름의 관리자 세션은 안 된다', V.weakWordsCallerOk('kim01', null, 'admin') === false);
check('③ 아무 근거도 없으면 안 된다', V.weakWordsCallerOk('kim01', null, null) === false && V.weakWordsCallerOk('', '', '') === false);

console.log('\n── ④ 본인 확인 함수(vocabWeakCallerVerified)와 웜업 배선 — 오려 내 실제로 ──');
const hfn = blockFrom(IDX, 'async function vocabWeakCallerVerified(');
check('전제: 본인 확인 함수를 오려 냈다', hfn.includes('weakWordsCallerOk') && hfn.includes('checkAdminSession'));
let mkVerify = null;
try { mkVerify = new Function('weakWordsCallerOk', 'authUidFromRequest', 'checkAdminSession', 'URL', stripTypeScriptTypes(hfn) + '\nreturn vocabWeakCallerVerified;'); }
catch (e) { check('본인 확인 함수 실행 준비', false, e.message); }
function verifier({ tok = null, ses = null, authThrows = false, sesThrows = false } = {}) {
  return mkVerify(V.weakWordsCallerOk,
    async () => { if (authThrows) throw new Error('auth boom'); return tok; },
    async () => { if (sesThrows) throw new Error('ses boom'); return ses || { ok: false }; }, URL);
}
const REQ = { url: 'https://example.test/api/x' };
if (mkVerify) {
  check('④ 토큰 uid 가 같으면 본인', await verifier({ tok: 'kim01' })(REQ, {}, 'kim01') === true);
  check('④ 짝: 남의 토큰이면 아님', await verifier({ tok: 'lee02' })(REQ, {}, 'kim01') === false);
  check('④ 짝: 토큰·세션 둘 다 없으면 아님', await verifier({})(REQ, {}, 'kim01') === false);
  check('④ 같은 이름의 관리자 세션이면 본인', await verifier({ ses: { ok: true, username: 'kim01' } })(REQ, {}, 'kim01') === true);
  check('④ 짝: 다른 이름의 관리자 세션이면 아님', await verifier({ ses: { ok: true, username: 'admin' } })(REQ, {}, 'kim01') === false);
  check('④ 토큰 확인이 던지면 세션으로 확인한다', await verifier({ authThrows: true, ses: { ok: true, username: 'kim01' } })(REQ, {}, 'kim01') === true);
  let t = 'x'; try { t = await verifier({ authThrows: true, sesThrows: true })(REQ, {}, 'kim01'); } catch (e) { t = 'threw'; }
  check('④ 둘 다 던져도 던지지 않고 false', t === false, t);
  check('④ uid 가 비면 false', await verifier({ tok: '' })(REQ, {}, '') === false);
}
const wblk = blockFrom(IDX, "if (ctxUserId && ctxLang !== 'zh') {", "'warmupweakword:'");
check('전제: 웜업 블록을 오려 냈다', wblk.length > 200 && wblk.includes('loadWeakWordsForWarmup'));
check('④ 웜업 블록은 판정을 다시 적지 않고 본인 확인 함수를 부른다', /vocabWeakCallerVerified\(request, env, ctxUserId, body\)/.test(wblk) && !/weakWordsCallerOk|authUidFromRequest|checkAdminSession/.test(wblk), wblk.slice(0, 200));
check('④ 본인 확인이 캐시를 읽기 «전» 이다', wblk.indexOf('vocabWeakCallerVerified') >= 0 && wblk.indexOf('vocabWeakCallerVerified') < wblk.indexOf('SESSION_STATE.get'));
let runWarm = null;
try {
  const ts = `async function __w(ctxUserId: any, ctxLang: any, sessionId: any, env: any, request: any, body: any, ctxDifficulty: any,
    vocabWeakCallerVerified: any, loadWeakWordsForWarmup: any, weakWordsPromptLine: any, console: any) {
    let sys = ''; ${wblk}; return sys; }`;
  runWarm = new Function(stripTypeScriptTypes(ts) + '\nreturn __w;')();
} catch (e) { check('웜업 블록 실행 준비', false, e.message); }
function kv() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }
async function warmCase({ uid = 'kim01', lang = 'en', tok = null, ses = null, authThrows = false, dbDown = false, diff = 5, store = kv(), sid = 's1' } = {}) {
  dbCalls = 0;
  const env = { DB: d1(db, { throwAll: dbDown }), SESSION_STATE: store };
  let threw = false, sys = '';
  try {
    sys = await runWarm(uid, lang, sid, env, REQ, {}, diff, verifier({ tok, ses, authThrows }),
      V.loadWeakWordsForWarmup, V.weakWordsPromptLine, { warn() {} });
  } catch (e) { threw = true; }
  return { sys, threw, store, calls: dbCalls };
}
if (runWarm && mkVerify) {
  const a = await warmCase({ tok: 'kim01' });
  check('④ 토큰이 본인이면 프롬프트에 약점 낱말이 붙는다', /"apple"/.test(a.sys), a.sys);
  const b = await warmCase({ tok: 'lee02' });
  check('④ 짝: 남의 토큰이면 안 붙는다(DB 도 안 읽음)', b.sys === '' && b.calls === 0, b);
  check('④ 짝: 토큰이 없으면 안 붙는다', (await warmCase({ tok: null })).sys === '');
  check('④ 관리자 세션이 같은 이름이면 붙는다', /"apple"/.test((await warmCase({ ses: { ok: true, username: 'kim01' } })).sys));
  check('④ 짝: 다른 관리자 세션이면 안 붙는다', (await warmCase({ ses: { ok: true, username: 'admin' } })).sys === '');
  const z = await warmCase({ tok: 'kim01', lang: 'zh' });
  check('④ 중국어 대화에는 안 붙인다(읽지도 않음)', z.sys === '' && z.calls === 0, z);
  const dd = await warmCase({ tok: 'kim01', dbDown: true });
  check('④ DB 가 죽어도 던지지 않는다', !dd.threw && dd.sys === '', dd);
  for (const d of [0, 1, 2]) check(`④ 기초 경계: 난이도 ${d} 는 1개만`, /"apple"/.test((await warmCase({ tok: 'kim01', diff: d })).sys) && !/"lemon"/.test((await warmCase({ tok: 'kim01', diff: d })).sys));
  check('④ 짝: 난이도 3 은 3개까지', /"lemon"/.test((await warmCase({ tok: 'kim01', diff: 3 })).sys));
  const store = kv();
  const c1 = await warmCase({ tok: 'kim01', store });
  const c2 = await warmCase({ tok: 'kim01', store });
  check('④ 같은 세션 두 번째 말은 KV 에서 읽는다(DB 0회)', c1.calls > 0 && c2.calls === 0 && c1.sys === c2.sys, { c1: c1.calls, c2: c2.calls });
  check('④ 캐시 칸은 «세션 + 학생» 별로 갈린다', [...store.m.keys()].join() === 'warmupweakword:s1:kim01', [...store.m.keys()]);
  const c3 = await warmCase({ tok: null, store });
  check('④ 캐시가 있어도 본인 확인이 안 되면 안 붙는다(캐시만 맞춰 남의 낱말을 못 붙임)', c3.sys === '', c3.sys);
  check('④ 본인 확인이 안 된 요청은 캐시를 만들지 않는다', (await warmCase({ tok: 'lee02', store: kv() })).store.m.size === 0);
}

console.log('\n── ⑤ /api/games/vocab — 약점 낱말을 먼저 담는가 ──');
const vblk = blockFrom(IDX, 'if (userId) {', 'const weakRows = await loadVocabWeakRows(env.DB, userId');
check('전제: games/vocab 단어 블록을 오려 냈다', vblk.length > 200 && vblk.includes('mergeWeakFirst'));
let runVocab = null;
try {
  const ts = `async function __v(userId: any, env: any, loadVocabWeakRows: any, mergeWeakFirst: any, readableKoreanVocabulary: any, isEnglishText: any, VOCAB_WEAK_GAME_MAX: any) {
    const words: Array<{ en: string; ko: string }> = []; ${vblk}; return words; }`;
  runVocab = new Function(stripTypeScriptTypes(ts) + '\nreturn __v;')();
} catch (e) { check('games/vocab 블록 실행 준비', false, e.message); }
if (runVocab) {
  // 32개를 더 넣어 «가장 먼저 넣은 약점 낱말» 이 최근 30개 밖으로 밀리게 만든다
  const big = new DatabaseSync(':memory:');
  big.exec(`CREATE TABLE vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, word TEXT, korean TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER)`);
  const bi = big.prepare(`INSERT INTO vocabulary (user_id, word, korean, level, last_reviewed_at, wrong_count, created_at) VALUES (?,?,?,?,?,?,?)`);
  bi.run('s', 'oldweak', '오래된약점', 0, NOW - 3 * D, 2, NOW - 50 * D);
  bi.run('s', 'oldfine', '오래된정상', 2, NOW - 3 * D, 0, NOW - 50 * D);
  for (let i = 0; i < 32; i++) bi.run('s', 'w' + 'abcdefghijklmnopqrstuvwxyzabcdef'[i] + i.toString(36), '뜻' + i, 0, null, 0, NOW - i * 1000);
  let out = [];
  try { out = await runVocab('s', { DB: d1(big), AI: null }, V.loadVocabWeakRows, V.mergeWeakFirst, async (r) => r, isEnglishText, V.VOCAB_WEAK_GAME_MAX); } catch (e) { check('⑤ 단어 블록 실행', false, e.message); }
  const ens = out.map((w) => w.en);
  check('⑤ 최근 30개 밖으로 밀린 약점 낱말도 들어온다(맨 앞)', ens[0] === 'oldweak', ens.slice(0, 3));
  check('⑤ 짝: 밀려난 «틀린 적 없는» 낱말은 예전처럼 안 들어온다', !ens.includes('oldfine'), ens.length);
  check('⑤ 같은 낱말이 두 번 나오지 않는다', new Set(ens.map((e) => e.toLowerCase())).size === ens.length);
  let out2 = [];
  try { out2 = await runVocab('kim01', { DB: d1(db), AI: null }, async () => [], V.mergeWeakFirst, async (r) => r, isEnglishText, V.VOCAB_WEAK_GAME_MAX); } catch (e) { check('⑤ 단어 블록 실행(약점 없음)', false, e.message); }
  check('⑤ 약점 조회가 실패해도 예전 목록은 그대로', out2.length > 0);
}

console.log('\n── ⑥ /api/games/weak — handleGamesWeak 를 통째로 오려 내 실제로 ──');
const gfn = blockFrom(IDX, 'async function handleGamesWeak(');
check('전제: handleGamesWeak 를 오려 냈다', gfn.includes('vocab_weak') && gfn.includes('game_progress'));
check('⑥ 응답에 vocab_weak 를 «따로» 싣는다(weak 와 다른 칸)', /weak,\s*vocab_weak:\s*vocabWeak/.test(gfn), gfn.slice(-400));
let mkWeak = null;
try {
  mkWeak = new Function('_ensureGameProgressTable', '_MS_JSON', 'isEnglishText', 'loadVocabWeakRows', 'mergeWeakFirst', 'VOCAB_WEAK_GAME_MAX', 'vocabWeakCallerVerified', 'URL', 'Response',
    stripTypeScriptTypes(gfn) + '\nreturn handleGamesWeak;');
} catch (e) { check('handleGamesWeak 실행 준비', false, e.message); }
const VOCAB_MAX = (() => { const m = MOD.match(/export const VOCAB_WEAK_GAME_MAX\s*=\s*(\d+)/); return m ? Number(m[1]) : NaN; })();
check('전제: 게임 쪽 개수 상수를 정본에서 읽었다', Number.isFinite(VOCAB_MAX) && VOCAB_MAX > 0, VOCAB_MAX);
async function weakCase({ lang = 'en', verified = true, vocabDown = false } = {}) {
  const env = { DB: vocabDown ? { prepare(sql) { if (/FROM vocabulary/.test(sql)) throw new Error('no such table: vocabulary'); return d1(db).prepare(sql); } } : d1(db) };
  try {
    const fn = mkWeak(async () => {}, {}, isEnglishText, V.loadVocabWeakRows, V.mergeWeakFirst, VOCAB_MAX, async () => verified, URL, Response);
    const r = await fn({ url: `https://example.test/api/games/weak?user_id=kim01&lang=${lang}&limit=20` }, env);
    return { status: r.status, body: await r.json() };
  } catch (e) { return { status: -1, body: { error: String(e && e.message || e), weak: [], vocab_weak: [] } }; }
}
if (mkWeak) {
  const gameRows = db.prepare(`SELECT item FROM game_progress WHERE user_id='kim01' AND lang='en' AND wrong_count>0 AND wrong_count>=correct_count`).all().map((r) => r.item).sort();
  const en = await weakCase();
  const weakItems = (en.body.weak || []).map((x) => x.item).sort();
  const vw = (en.body.vocab_weak || []).map((x) => x.item);
  check('⑥ 본인이면 단어장 약점을 vocab_weak 로 싣는다', en.status === 200 && vw.includes('apple') && vw.includes('lemon'), en.body);
  check('⑥ 짝: weak 는 게임 기록 그대로 — 단어장 약점이 한 개도 안 섞인다(교사 리포트가 그리는 배열)', JSON.stringify(weakItems) === JSON.stringify(gameRows) && !weakItems.includes('lemon') && !weakItems.includes('melon'), { weakItems, gameRows });
  check('⑥ 한글 낱말은 vocab_weak 에 안 싣는다', vw.length > 0 && !vw.some((w) => /[가-힣]/.test(w)), vw);
  check('⑥ 낱말 다듬기는 /api/games/vocab 과 같다(영어 30자 — 허브가 정확일치로 찾게)', vw.length > 0 && vw.every((w) => isEnglishText(w, 30) && w === w.trim()), vw);
  check('⑥ 개수는 /api/games/vocab 의 앞자리와 같은 상한', vw.length > 0 && vw.length <= VOCAB_MAX && /loadVocabWeakRows\(env\.DB, userId, Date\.now\(\), VOCAB_WEAK_GAME_MAX\)/.test(IDX.slice(IDX.indexOf('async function handleGamesVocab('), IDX.indexOf('async function handleGamesVocab(') + 12000)));
  const nv = await weakCase({ verified: false });
  check('⑥ 짝: 본인 확인이 안 되면 vocab_weak 는 비고 weak 는 예전 그대로', nv.status === 200 && nv.body.vocab_weak.length === 0 && JSON.stringify((nv.body.weak || []).map((x) => x.item).sort()) === JSON.stringify(gameRows), nv.body);
  const zh = await weakCase({ lang: 'zh' });
  check('⑥ 중국어 요청에는 vocab_weak 를 비운다', zh.status === 200 && zh.body.vocab_weak.length === 0, zh.body);
  const vd = await weakCase({ vocabDown: true });
  check('⑥ 단어장 조회가 실패해도 weak 는 그대로(500 이 아님)', vd.status === 200 && vd.body.vocab_weak.length === 0 && (vd.body.weak || []).length === gameRows.length, vd);
}

console.log('\n── ⑧ 게임 허브 — 복습 큐에 넣기(student-games.html 을 오려 내 실제로) ──');
const sA = HUB.indexOf('var _seededMiss = false;');
const seedFn = blockFrom(HUB, 'function _seedMissFromServer(){');
const sEnd = sA < 0 || !seedFn ? -1 : HUB.indexOf(seedFn) + seedFn.length;
const hubSeed = sA >= 0 && sEnd > sA ? HUB.slice(sA, sEnd) : '';
const loadBlk = blockFrom(HUB, 'if (window.MangoiGameVocab){', 'MangoiGameVocab.load().then(function(d){');
check('전제: 시딩 코드와 맞춤 어휘 로드 블록을 오려 냈다', hubSeed.includes('_applyServerWeak') && loadBlk.includes('_GAME_WORDS'));
function hub({ lang = 'en', words, vocab = [], weakResp, vocabResp, order = 'seed-first', token = 'TOK' }) {
  let fetchFail = false;
  let resolveFetch, resolveLoad;
  const fetchP = new Promise((r) => { resolveFetch = r; });
  const loadP = new Promise((r) => { resolveLoad = r; });
  const W = words.slice(), Vv = vocab.slice();
  const env = { lang };
  const MGV = { load: () => loadP };
  const seenHeaders = [];
  const api = new Function('__env', '_GAME_WORDS', '_GAME_VOCAB', 'fetch', 'window', 'document', '_gameUid', 'MangoiGameVocab', 'localStorage',
    `var GAME_LANG = __env.lang; var _missQueue = [];
     ${hubSeed}
     return { seed: _seedMissFromServer, load: function(){ ${loadBlk} }, q: function(){ return _missQueue; }, setLang: function(l){ GAME_LANG = l; },
              apply: function(){ _applyServerWeak(); }, reset: function(){ _missQueue = []; _seededMiss = false; } };`)(
    env, W, Vv,
    (u, o) => { seenHeaders.push((o && o.headers) || {}); return (fetchFail ? Promise.reject(new Error('net')) : fetchP).then((d) => ({ ok: true, json: async () => d })); },
    { MangoiGameVocab: MGV },
    { getElementById: () => null },
    () => 'kim01', MGV, token == null ? { getItem: () => null } : { getItem: (k) => (k === 'mango_token' ? token : null) });
  return {
    api, W, seenHeaders, failNext() { fetchFail = true; },
    async run() {
      api.load(); api.seed();
      const tick = () => new Promise((r) => setTimeout(r, 0));
      if (order === 'seed-first') { resolveFetch(weakResp); await tick(); await tick(); resolveLoad(vocabResp); }
      else { resolveLoad(vocabResp); await tick(); resolveFetch(weakResp); }
      await tick(); await tick(); await tick();
      return api.q();
    },
  };
}
const DEF = [{ en: 'cat', ko: '고양이' }, { en: 'dog', ko: '개' }];
const STU = { textbook: 'BTS 1', level: '', sentences: [], words: ['apple', 'lemon', 'melon', 'tiger', 'egg', 'fish'].map((e) => ({ en: e, ko: '뜻-' + e })) };
const RESP = { ok: true, weak: [{ item: 'tiger' }, { item: 'cat' }], vocab_weak: [{ item: 'apple' }, { item: 'ghostword' }, { item: 'tiger' }] };
if (hubSeed && loadBlk) {
  const h1 = hub({ words: DEF, weakResp: RESP, vocabResp: STU, order: 'load-first' });
  const q1 = await h1.run();
  const ids1 = q1.map((x) => x.kind + ':' + x.id);
  check('⑧ 단어 목록에 있는 단어장 약점 낱말은 복습 큐에 들어간다', ids1.includes('word:apple'), ids1);
  check('⑧ 그 항목은 목록의 것(다듬어진 뜻)을 그대로 쓴다', q1.find((x) => x.id === 'apple')?.item?.ko === '뜻-apple', q1);
  check('⑧ 짝: 목록에 없는 낱말은 지어 넣지 않는다', !ids1.some((x) => x.endsWith(':ghostword')), ids1);
  check('⑧ 게임 약점(예전 동작)도 그대로 들어간다', ids1.includes('word:tiger'), ids1);
  check('⑧ 같은 낱말이 두 번 들어가지 않는다', ids1.filter((x) => x === 'word:tiger').length === 1, ids1);
  const h2 = hub({ words: DEF, weakResp: RESP, vocabResp: STU, order: 'seed-first' });
  const ids2 = (await h2.run()).map((x) => x.kind + ':' + x.id);
  check('⑧ 약점 응답이 «먼저» 오고 맞춤 어휘가 «나중에» 와도 큐에 들어간다', ids2.includes('word:apple') && ids2.includes('word:tiger'), ids2);
  // 목록에 그 낱말이 «있어도» 중국어 모드면 안 넣는다(서버가 이미 비워 보내지만 허브도 한 번 더 막는다)
  const h3 = hub({ lang: 'zh', words: DEF.concat([{ en: 'apple', ko: '사과' }]), weakResp: RESP, vocabResp: null, order: 'load-first' });
  const ids3 = (await h3.run()).map((x) => x.kind + ':' + x.id);
  check('⑧ 중국어 모드에는 단어장(영어) 약점을 안 넣는다', !ids3.includes('word:apple'), ids3);
  check('⑧ 짝: 중국어 모드에서도 게임 약점은 예전처럼 넣는다', ids3.includes('word:cat'), ids3);
  // 요청은 영어로 나가고 응답이 오기 전에 중국어로 바뀐 경우
  const h4 = hub({ words: DEF, weakResp: RESP, vocabResp: null, order: 'seed-first' });
  const p4 = h4.run();
  h4.api.setLang('zh');
  const ids4 = (await p4).map((x) => x.kind + ':' + x.id);
  check('⑧ 응답 전에 언어를 바꿨으면 옛 언어의 약점을 넣지 않는다', ids4.length === 0, ids4);
  check('⑧ 약점 요청에 본인 토큰을 싣는다(서버가 본인일 때만 vocab_weak 를 준다)', h1.seenHeaders[0] && h1.seenHeaders[0].Authorization === 'Bearer TOK', h1.seenHeaders);
  const h5 = hub({ words: DEF, weakResp: RESP, vocabResp: null, order: 'load-first', token: null });
  await h5.run();
  check('⑧ 짝: 토큰이 없으면 Authorization 을 안 싣는다', h5.seenHeaders[0] && !('Authorization' in h5.seenHeaders[0]), h5.seenHeaders);
  // 영어 응답을 받은 뒤 언어를 바꿔 다시 시딩 — 새 요청이 실패하면, 옛 영어 응답을 다시 적용하지 않아야 한다
  const h6 = hub({ words: DEF.concat([{ en: 'apple', ko: '사과' }]), weakResp: RESP, vocabResp: null, order: 'load-first' });
  await h6.run();
  check('전제: 영어 응답이 큐에 들어갔다', h6.api.q().length > 0);
  h6.api.setLang('zh'); h6.api.reset(); h6.failNext(); h6.api.seed();
  await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  h6.api.apply();
  check('⑧ 다시 시딩하면 옛 응답을 버린다(새 요청이 실패해도 옛 언어 약점이 되살아나지 않음)', h6.api.q().length === 0, h6.api.q());
}

console.log('\n── ⑨ A.i 친구 — 단어장 약점을 «낱말 (뜻)» 으로(정본 friendWeakList + api-ai.ts 배선을 실제로) ──');
{
  const VR = [{ word: 'apple', korean: '사과' }, { word: 'lem"on', korean: '레"몬' }, { word: '사과나무', korean: '' }, { word: 'I like to eat a big red apple', korean: '' }, { word: 'kiwi', korean: '아주 긴 뜻 '.repeat(5) }];
  const GR = [{ item: 'Apple', ko: '사과' }, { item: 'tiger', ko: '호랑이' }, { item: 'I like cats', ko: '' }, { item: 'zebra', ko: '' }];
  let fl = [], flGame = null, flNull = null, flMany = [];
  try {
    fl = V.friendWeakList(VR, GR, 5);
    flGame = V.friendWeakList([], GR.slice(0, 2), 5);
    flNull = V.friendWeakList(null, null);
    flMany = V.friendWeakList(['wa', 'wb', 'wc', 'wd', 'we'].map((w) => ({ word: w, korean: '' })), GR, 5);
  } catch (e) { check('⑨ friendWeakList 실행(던지지 않음)', false, e.message); }
  check('⑨ 단어장 약점이 먼저, 뜻을 괄호로', fl[0] === 'apple (사과)', fl);
  check('⑨ 따옴표는 떼어 프롬프트를 깨지 않는다', fl.includes('lemon (레몬)'), fl);
  check('⑨ 단어장의 한글·문장은 버린다', !fl.some((x) => /사과나무|big red/.test(x)), fl);
  check('⑨ 뜻이 너무 길면 뜻만 빼고 낱말은 남긴다', fl.includes('kiwi'), fl);
  check('⑨ 짝: 게임 약점은 예전 그대로(문장도 남김) 뒤에 이어 붙는다', fl.includes('tiger (호랑이)') && fl.includes('I like cats'), fl);
  check('⑨ 대소문자만 다른 같은 낱말은 한 번만(단어장 쪽을 남김)', fl.filter((x) => /^apple/i.test(x)).length === 1, fl);
  check('⑨ 최대 5개', fl.length === 5 && !fl.includes('zebra'), fl);
  check('⑨ 단어장 약점은 최대 3칸 — 게임 약점 2칸은 남는다', flMany.filter((x) => /^w[a-e]$/.test(x)).length === 3 && flMany.includes('tiger (호랑이)'), flMany);
  check('⑨ 짝: 단어장 칸 상한은 정본 상수(3)', V.VOCAB_WEAK_FRIEND_MAX === 3);
  check('⑨ 짝: 단어장이 비면 게임 약점만(예전과 같은 글자)', JSON.stringify(flGame) === JSON.stringify(['Apple (사과)', 'tiger (호랑이)']), flGame);
  check('⑨ 둘 다 비면 빈 목록 · null 이어도 던지지 않음', Array.isArray(flNull) && flNull.length === 0, flNull);

  // 배선 ① — chat-friend 첫머리(본인 확인)부터 병렬 조회까지 오려 내 가짜 요청으로 «실제로» 돌린다
  const cfA = AI.indexOf("path === '/api/ai/chat-friend'");
  const hA = cfA < 0 ? -1 : AI.indexOf('const latT0 = Date.now();', cfA);
  const pa = hA < 0 ? -1 : AI.indexOf('const [recent, st, wk', hA);
  const paEnd = pa < 0 ? -1 : AI.indexOf(']);', pa);
  const headSrc = hA >= 0 && paEnd > pa ? AI.slice(hA, paEnd + 3) : '';
  const names = ((AI.slice(Math.max(pa, 0)).match(/^const \[([^\]]+)\]/) || [])[1] || '').split(',').map((x) => x.trim()).filter(Boolean);
  check('전제: chat-friend 첫머리부터 병렬 조회까지 오려 냈다', headSrc.includes('authUidGlobal') && names.length >= 7, names);
  const VMARK = [{ word: 'apple', korean: '사과' }];
  async function runHead(authUid) {
    const calls = [];
    const fakeDb = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ item: 'tiger', ko: '호랑이' }] }), first: async () => null }) }) };
    let out;
    try {
      // 함수로 «먼저» 감싼 뒤 타입을 지운다 — stripTypeScriptTypes 는 모듈로 읽어 맨 위 return 을 거절한다
      const body = stripTypeScriptTypes('async function __h(request, url, env, ensureChatSchema, authUidGlobal, json, aiFriendNormalizeLevel, WEAK_WHERE, WEAK_ORDER, weakSince, loadActiveGoal, loadRecentMistakes, loadVocabWeakRows){\n' +
        headSrc + '\nreturn { __reached: true, ' + names.join(', ') + ' }; }');
      const fn = new Function(body + '\nreturn __h;')();
      out = await fn({ json: async () => ({ uid: 'Kim01', msg: 'hi' }) }, new URL('https://mangoi.ai/api/ai/chat-friend'), { DB: fakeDb },
        async () => {}, async () => authUid, (o, st) => ({ __json: o, __status: st || 200 }), (l) => l,
        'WW', 'WO', () => 0, async () => null, async () => ['RECENT'], async (...a) => { calls.push(a); return VMARK; });
    } catch (e) { out = { __threw: e.message }; }
    return { out, calls, fakeDb };
  }
  const self = await runHead('Kim01');
  const vwName = self.out && self.out.__reached ? names.find((n) => self.out[n] === VMARK) : null;
  const c0 = self.calls[0] || [];
  check('⑨ 본인이면 단어장 약점을 한 번 읽는다 — 그 DB · 요청 uid · 지금 시각 · 5개', self.calls.length === 1 && c0[0] === self.fakeDb && c0[1] === 'Kim01' && typeof c0[2] === 'number' && Math.abs(c0[2] - Date.now()) < 60000 && c0[3] === 5, { out: self.out && self.out.__threw, args: c0.slice(1) });
  check('⑨ 그 결과가 이름 있는 변수로 받아진다', !!vwName, names);
  const other = await runHead('lee02');
  check('⑨ 짝: 토큰이 남의 uid 면 403 이고 단어장을 안 읽는다', other.out && other.out.__status === 403 && other.calls.length === 0, { out: other.out, n: other.calls.length });
  const none = await runHead(null);
  check('⑨ 짝: 토큰이 없으면 401 이고 단어장을 안 읽는다', none.out && none.out.__status === 401 && none.calls.length === 0, { out: none.out, n: none.calls.length });

  // 배선 ② — 프롬프트 조각(stuCtx)을 오려 내 «진짜 눈높이 규격» 으로 돌린다
  let L = null;
  try { L = new Function(stripTypeScriptTypes(noImports(LV)) + '\nreturn { aiFriendLevelSpec };')(); } catch (e) { check('⑨ 눈높이 정본 실행', false, e.message); }
  check('전제: 기초 경계 — S3 은 plain, S4 는 아니다(정본 ai-friend-level.ts)', !!L && L.aiFriendLevelSpec('S3').plain === true && L.aiFriendLevelSpec('S4').plain === false);
  const sA = AI.indexOf("let stuCtx = '';");
  const CATCH = '} catch { /* 개인화 실패 무시 */ }';
  const sB = sA < 0 ? -1 : AI.indexOf(CATCH, sA);
  const stuSrc = sA >= 0 && sB > sA ? AI.slice(sA, sB + CATCH.length) : '';
  check('전제: stuCtx 조각을 오려 냈다', stuSrc.includes('friendWeakList'));
  const spy = [];
  const stu = (st, wk, vw, lv) => {
    try {
      return new Function('st', 'wk', vwName || '__none', 'lvSpec', 'friendWeakList', 'return (function(){ ' + stripTypeScriptTypes(stuSrc) + ' return stuCtx; })();')(
        st, wk, vw, L ? L.aiFriendLevelSpec(lv) : { plain: false }, (...a) => { spy.push(a); return V.friendWeakList(...a); });
    } catch (e) { return 'THREW:' + e.message; }
  };
  const GWK = { results: [{ item: 'tiger', ko: '호랑이' }] };
  const s4 = stu({ english_name: 'Kim' }, GWK, VMARK, 'S4');
  check('⑨ S4(기초가 아님)면 단어장 약점이 먼저 프롬프트에 실린다', /got wrong in their word book, games or quizzes: apple \(사과\), tiger \(호랑이\)\./.test(s4), s4);
  check('⑨ 프롬프트가 «받은 그 변수» 를 friendWeakList 에 넘기고 상한은 5', spy.length > 0 && spy[0][0] === VMARK && (spy[0][2] === undefined ? 5 : spy[0][2]) === 5 && (spy[0][3] === undefined ? 3 : spy[0][3]) === 3, spy.map((a) => [a[0] === VMARK, a[2], a[3]]));
  const s3 = stu({ english_name: 'Kim' }, GWK, VMARK, 'S3');
  check('⑨ 짝: S3(기초)에는 예전처럼 약점 줄을 안 넣는다 — 이름 줄은 그대로', !/got wrong/.test(s3) && /Their name is "Kim"/.test(s3), s3);
  const sg = stu(null, GWK, [], 'S4');
  check('⑨ 짝: 단어장이 비면 게임 약점만(예전과 같음)', /: tiger \(호랑이\)\./.test(sg), sg);
  const su = stu({ english_name: 'Kim' }, null, undefined, 'S4');
  check('⑨ 조회가 비거나 실패해도 개인화가 통째로 죽지 않는다(이름 줄은 남고 약점 줄은 없음)', !/THREW/.test(su) && /Their name is "Kim"/.test(su) && !/got wrong/.test(su), su);
}

done();
