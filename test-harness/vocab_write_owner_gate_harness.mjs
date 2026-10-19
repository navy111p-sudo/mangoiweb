/**
 * 🔐 단어장 «쓰기» 본인 확인 하니스 (2026-10-19)
 *
 *   node test-harness/vocab_write_owner_gate_harness.mjs
 *
 * 왜: 단어장에서 틀린 낱말(«단어장 약점»)이 웜업 대화·A.i 친구 프롬프트·게임 복습 큐에 실리게 된 뒤
 *     (src/vocab-weak.ts), 남이 다른 학생의 단어장에 낱말을 넣고(add) 그 학생 이름으로 퀴즈를 만들어(gen-quiz)
 *     오답을 제출(quiz-submit)하면 그 학생 대화에 «틀린 낱말» 을 심을 수 있었다 — 세 경로 모두 본인 확인이 없었다.
 *
 * 무엇을 «실제로» 돌리나
 *   ① 정본 vocabWriteDenied 를 오려 내 resolveOwnerScope 네 결과로 돌린다(deny 만 401 · 나머지는 통과).
 *   ② 여섯 라우트(add·bulk-add·add-with-ai·auto-generate·gen-quiz·quiz-submit)를 중괄호 짝으로 오려 내
 *      가짜 요청으로 돌린다. 게이트가 막으면 «DB·AI 를 한 번도 안 건드리는가», 통과면 «그 뒤로 진행하는가» 를 짝으로.
 *      quiz-submit 은 본문 user_id 가 아니라 «그 퀴즈 주인» 으로 묻는가까지.
 *   ③ 전수: /api/vocab/* POST 중 vocabulary·vocab_quizzes 에 쓰는 라우트는 전부 본인 확인을 지나는가.
 *   ④ 화면: micro-quiz 의 세 호출이 토큰을 싣는가(퀴즈 제출은 함수를 오려 내 가짜 fetch 로 실제로 돌린다).
 *
 * 변이시험: test-harness/manual/vocab-write-owner-mutations.mjs (사람이 부릅니다).
 * 소스 경로는 VWG_GAMES · VWG_MQ · VWG_VOCAB 로 바꿔 끼울 수 있다(변이시험용).
 */
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const R = (rel, env) => fs.readFileSync(process.env[env] || path.join(ROOT, rel), 'utf8');
const GAMES = R('cloudflare-deploy/src/api-games.ts', 'VWG_GAMES');
const MQ = R('cloudflare-deploy/public/micro-quiz.html', 'VWG_MQ');
const VOC = R('cloudflare-deploy/public/vocab.html', 'VWG_VOCAB');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); }
}
/** start 위치에서 첫 «{» 부터 짝이 맞는 «}» 까지(문자열·주석 안의 괄호는 건너뜀) */
function braceBlock(src, start) {
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0, q = null, line = false, block = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}
/** 주석을 벗긴 사본(부정 검사용) — 문자열 안의 // 는 안 건드린다 */
function stripComments(src) {
  let out = '', q = null, line = false, block = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') { line = false; out += c; } continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (q) { out += c; if (c === '\\') { out += n; i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c;
  }
  return out;
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const json = (o, s) => ({ __json: o, __status: s || 200 });

// ─────────────────────────────────────────────────────────────
console.log('\n── ① 정본 vocabWriteDenied — deny 만 401, 나머지는 통과 ──');
const hA = GAMES.indexOf('export async function vocabWriteDenied(');
const helperSrc = hA >= 0 ? braceBlock(GAMES, hA) : '';
check('전제: vocabWriteDenied 를 오려 냈다', helperSrc.includes('resolveOwnerScope'), helperSrc.length);
let helper = null;
try {
  const body = stripTypeScriptTypes(helperSrc.replace(/^export\s+/, ''));
  helper = new Function('resolveOwnerScope', 'json', body + '\nreturn vocabWriteDenied;');
} catch (e) { check('정본 컴파일', false, e.message); }
async function runHelper(scope, owner, body) {
  const seen = [];
  try {
    const fn = helper(async (...a) => { seen.push(a); return scope; }, json);
    const out = await fn('REQ', 'URL', 'ENV', owner, body);
    return { out, seen };
  } catch (e) { return { out: { __threw: e.message }, seen }; }
}
for (const sc of ['guest', 'admin', 'self']) {
  const r = await runHelper(sc, 'kid1', { token: 't' });
  check(`${sc} 이면 통과(null)`, r.out === null, r.out);
}
{
  const r = await runHelper('deny', 'kid1', { token: 't' });
  check('deny 면 401', r.out && r.out.__status === 401, r.out);
  check('deny 응답: ok:false · auth_required', r.out && r.out.__json && r.out.__json.ok === false && r.out.__json.error === 'auth_required', r.out);
  check('deny 응답: 한국어·영어 안내를 함께', r.out && r.out.__json && /로그인/.test(r.out.__json.message || '') && /log in/i.test(r.out.__json.message_en || ''), r.out && r.out.__json);
  check('판정에 «그 요청·주인 uid·본문» 을 그대로 넘긴다', r.seen.length === 1 && r.seen[0][0] === 'REQ' && r.seen[0][1] === 'URL' && r.seen[0][2] === 'ENV' && r.seen[0][3] === 'kid1' && r.seen[0][4] && r.seen[0][4].token === 't', r.seen.map((a) => a.slice(0, 4)));
  const rNull = await runHelper('deny', null, undefined);
  check('주인 uid 가 비어도 던지지 않고 «빈 문자열» 로 묻는다', rNull.out && rNull.out.__status === 401 && rNull.seen[0] && rNull.seen[0][3] === '', rNull.seen.map((a) => a[3]));
}

// ─────────────────────────────────────────────────────────────
console.log('\n── ② 여섯 라우트 — 막히면 DB·AI 를 안 건드리고, 통과면 그 뒤로 간다(짝) ──');
const REACHED = 'REACHED_PAST_GATE';
const DENY = { __deny: true };
function routeOf(p) {
  const a = GAMES.indexOf(`if (method === 'POST' && path === '${p}')`);
  return a >= 0 ? braceBlock(GAMES, a) : '';
}
function compile(p, blk) {
  const body = stripTypeScriptTypes('async function x(){\n' + blk + '\n}');
  const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'));
  return new AsyncFunction('env', 'request', 'url', 'json', 'vocabWriteDenied', 'ensureVocab', 'ensureMicroLearnSchema',
    'KOREAN_GLOSS_RULE', 'repairKoreanGlosses', 'hasForeignGloss', 'normalizeKoreanGloss', 'isKoreanGloss',
    `const method='POST', path='${p}';\n${inner}\nreturn { __fellThrough: true };`);
}
/** DB·AI 를 처음 건드리는 순간 REACHED 를 던진다(quiz-submit 의 «주인 찾기» 조회만 답한다) */
function makeEnv(quizOwner, log) {
  const reach = (what) => { log.push(what); throw new Error(REACHED); };
  return {
    DB: {
      prepare(sql) {
        const st = {
          bind() { return st; },
          async first() { if (/FROM vocab_quizzes WHERE id = \?/.test(sql)) { log.push('quiz-owner-lookup'); return { user_id: quizOwner, correct_index: 1, source_word: 'apple' }; } return reach('db:' + sql.slice(0, 30)); },
          async all() { return reach('db:' + sql.slice(0, 30)); },
          async run() { return reach('db-write:' + sql.slice(0, 30)); },
        };
        return st;
      },
      async batch() { return reach('db-batch'); },
      async exec() { return reach('db-exec'); },
    },
    AI: { run: async () => reach('ai') },
  };
}
const ROUTES = [
  { p: '/api/vocab/add', body: (u) => ({ user_id: u, word: 'apple', korean: '' }) },
  { p: '/api/vocab/bulk-add', body: (u) => ({ user_id: u, items: [{ word: 'apple', korean: '사과' }] }) },
  { p: '/api/vocab/add-with-ai', body: (u) => ({ uid: u, word: 'apple' }) },
  { p: '/api/vocab/auto-generate', body: (u) => ({ uid: u, level: 'A2', count: 5 }) },
  { p: '/api/vocab/gen-quiz', body: (u) => ({ uid: u, count: 5 }) },
];
async function run(p, blk, reqBody, quizOwner, allowUid) {
  const log = [], gate = [];
  let out;
  try {
    const fn = compile(p, blk);
    out = await fn(makeEnv(quizOwner, log), { json: async () => reqBody }, new URL('https://mangoi.ai' + p), json,
      async (request, url, env, owner, body) => { gate.push({ owner, body }); return owner === allowUid ? null : DENY; },
      async () => {}, async () => {}, 'RULE',
      async () => { log.push('repair'); throw new Error(REACHED); }, () => false, (x) => x, () => true);
  } catch (e) { out = { __threw: e.message }; }
  return { out, log, gate };
}
for (const r of ROUTES) {
  const blk = routeOf(r.p);
  check(`전제: ${r.p} 블록을 오려 냈다`, blk.length > 200, blk.length);
  if (!blk) continue;
  const me = await run(r.p, blk, r.body('me'), null, 'me');
  check(`${r.p}: 본인이면 게이트를 지나 그 뒤로 간다`, me.out && me.out.__threw === REACHED && me.gate.length === 1 && me.gate[0].owner === 'me', { out: me.out, gate: me.gate.map((g) => g.owner) });
  check(`${r.p}: 판정에 «본문» 을 넘긴다(토큰을 읽게)`, me.gate.length === 1 && me.gate[0].body && (me.gate[0].body.user_id === 'me' || me.gate[0].body.uid === 'me'), me.gate.map((g) => g.body));
  const other = await run(r.p, blk, r.body('kid1'), null, 'me');
  check(`${r.p}: 남의 uid 면 게이트 응답을 그대로 돌려준다`, other.out === DENY, other.out);
  check(`${r.p}: 막히면 DB·AI 를 한 번도 안 건드린다`, other.log.length === 0, other.log);
  const blank = await run(r.p, blk, r.body(''), null, 'me');
  check(`${r.p}: 짝 — uid 가 비면 예전처럼 400(게이트를 안 부름)`, blank.out && blank.out.__status === 400 && blank.gate.length === 0, { out: blank.out, gate: blank.gate.length });
}
{
  const p = '/api/vocab/quiz-submit';
  const blk = routeOf(p);
  check(`전제: ${p} 블록을 오려 냈다`, blk.length > 200, blk.length);
  if (blk) {
    // 본문에는 user_id:'me' 를 실어 보내지만 퀴즈 주인은 kid1 — «주인» 으로 물어야 막힌다
    const forged = await run(p, blk, { quiz_id: 7, answer: 0, user_id: 'me' }, 'kid1', 'me');
    check('quiz-submit: «그 퀴즈 주인» 으로 묻는다(본문 user_id 가 아님)', forged.gate.length === 1 && forged.gate[0].owner === 'kid1', forged.gate.map((g) => g.owner));
    check('quiz-submit: 남의 퀴즈면 게이트 응답을 그대로', forged.out === DENY, forged.out);
    check('quiz-submit: 남의 퀴즈면 기록·복습 일정을 안 건드린다(주인 조회만)', forged.log.length === 1 && forged.log[0] === 'quiz-owner-lookup', forged.log);
    check('quiz-submit: 남의 퀴즈면 정답(correct_index)을 안 돌려준다', !(forged.out && forged.out.__json && 'correct_index' in forged.out.__json), forged.out);
    const own = await run(p, blk, { quiz_id: 7, answer: 0 }, 'me', 'me');
    // 그 뒤 첫 DB 조회가 REACHED 를 던지는데 라우트 자신의 try/catch 가 503 으로 바꾼다 — «게이트 뒤 DB 를 만졌는가» 로 본다
    const pastGate = own.log.length >= 2 && own.log[0] === 'quiz-owner-lookup' && own.log.slice(1).some((x) => String(x).startsWith('db:'));
    check('quiz-submit: 짝 — 내 퀴즈면 게이트를 지나 기록으로 간다', pastGate && own.gate.length === 1 && own.gate[0].owner === 'me' && own.out !== DENY, { out: own.out, log: own.log });
    const missing = await run(p, blk, { answer: 0 }, 'me', 'me');
    check('quiz-submit: 짝 — quiz_id 가 없으면 예전처럼 400', missing.out && missing.out.__status === 400 && missing.gate.length === 0, missing.out);
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n── ③ 전수 — /api/vocab/* POST 중 단어장·퀴즈에 «쓰는» 라우트는 전부 본인 확인을 지난다 ──');
{
  const re = /if \(method === 'POST' && path === '(\/api\/vocab\/[a-z-]+)'\)/g;
  const found = [];
  let m;
  while ((m = re.exec(GAMES))) {
    const blk = stripComments(braceBlock(GAMES, m.index));
    const writes = /INSERT (OR \w+ )?INTO (vocabulary|vocab_quizzes)\b|UPDATE (vocabulary|vocab_quizzes)\b/.test(blk);
    if (!writes) continue;
    const gated = /vocabWriteDenied\(|resolveOwnerScope\(/.test(blk);
    found.push(m[1]);
    check(`${m[1]}: 쓰는 라우트는 본인 확인을 지난다`, gated);
  }
  check('전제: 쓰는 라우트를 일곱 개 이상 찾았다(add·bulk-add·review·add-with-ai·auto-generate·gen-quiz·quiz-submit)', found.length >= 7, found);
  for (const p of ['/api/vocab/add', '/api/vocab/bulk-add', '/api/vocab/add-with-ai', '/api/vocab/auto-generate', '/api/vocab/gen-quiz', '/api/vocab/quiz-submit', '/api/vocab/review']) {
    check(`전제: 목록에 ${p} 가 있다`, found.includes(p), found);
  }
  // 정본이 하나뿐인가 — 판정을 라우트마다 다시 적지 않았는가
  const decl = (stripComments(GAMES).match(/async function vocabWriteDenied\(/g) || []).length;
  check('정본 vocabWriteDenied 선언은 하나', decl === 1, decl);
}

// ─────────────────────────────────────────────────────────────
console.log('\n── ④ 화면 — 퀴즈 화면이 토큰을 싣는다 ──');
{
  // 각 fetch 호출의 본문 객체를 괄호 짝으로 잘라 «token: __mgTok()» 이 들어 있는지
  function bodyOfFetch(src, urlLit) {
    const a = src.indexOf(`fetch('${urlLit}'`);
    if (a < 0) return null;
    const b = src.indexOf('JSON.stringify(', a);
    if (b < 0 || b - a > 400) return null;
    let depth = 0;
    for (let i = b + 'JSON.stringify'.length; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(b, i + 1); }
    }
    return null;
  }
  const mq = stripComments(MQ);
  for (const u of ['/api/vocab/auto-generate', '/api/vocab/gen-quiz', '/api/vocab/quiz-submit']) {
    const bo = bodyOfFetch(mq, u);
    check(`micro-quiz: ${u} 본문에 token: __mgTok()`, !!bo && /\btoken:\s*__mgTok\(\)/.test(bo), bo);
  }
  const voc = stripComments(VOC);
  for (const u of ['/api/vocab/add', '/api/vocab/bulk-add']) {
    const bo = bodyOfFetch(voc, u);
    check(`vocab: ${u} 본문에 token: __mgTok() (원래부터)`, !!bo && /\btoken:\s*__mgTok\(\)/.test(bo), bo);
  }
  // 퀴즈 제출 함수를 오려 내 가짜 fetch·localStorage 로 실제로 돌린다
  const rA = MQ.indexOf('function recordProgress(');
  const rp = rA >= 0 ? braceBlock(MQ, rA) : '';
  const tA = MQ.indexOf('function __mgTok(');
  const tk = tA >= 0 ? braceBlock(MQ, tA) : '';
  check('전제: recordProgress·__mgTok 를 오려 냈다', !!rp && !!tk);
  const sent = [];
  try {
    const fn = new Function('fetch', 'localStorage', tk + '\n' + rp + '\nreturn recordProgress;')(
      (u, o) => { sent.push({ u, b: JSON.parse(o.body) }); return Promise.resolve(); },
      { getItem: (k) => (k === 'mango_token' ? 'TOK-me' : null) });
    fn({ serverId: 11, serverCorrect: 2 }, false);
    fn({ serverId: 12, serverCorrect: 0 }, true);
  } catch (e) { check('recordProgress 실행', false, e.message); }
  check('퀴즈 제출이 저장된 로그인 토큰을 싣는다', sent.length === 2 && sent.every((s) => s.u === '/api/vocab/quiz-submit' && s.b.token === 'TOK-me'), sent);
  check('짝: 채점 값은 예전 그대로(오답이면 다른 보기 · 정답이면 정답 보기)', sent.length === 2 && sent[0].b.quiz_id === 11 && sent[0].b.answer === 0 && sent[1].b.answer === 0 && sent[1].b.quiz_id === 12, sent.map((s) => s.b));
  // 막혔을 때 화면이 «auth_required» 글자 대신 서버 안내를 보여 주는가
  check('micro-quiz: 단어 만들기 실패 안내가 서버 문구(message)를 먼저 쓴다', /tt\(d\.message,\s*d\.message_en \|\| d\.message\) \|\| d\.error \|\| 'unknown'/.test(mq));
  // vocab 화면: 서버 안내를 «지금 언어» 로 고르는 _vocMsg 를 오려 내 실제로 돌린다(한/영 짝)
  {
    const pick = (name) => { const i = voc.indexOf('function ' + name + '('); return i < 0 ? '' : voc.slice(i, voc.indexOf('\n', i)); };
    const src = pick('_isEn') + '\n' + pick('_vocMsg');
    let vm = null;
    try {
      vm = (lang) => new Function('document', 'localStorage', src + '\nreturn _vocMsg;')({ documentElement: { lang } }, { getItem: () => null });
    } catch (e) { vm = null; }
    check('전제: vocab 의 _isEn·_vocMsg 를 오려 냈다', !!pick('_isEn') && !!pick('_vocMsg') && typeof vm === 'function');
    const d = { ok: false, error: 'auth_required', message: 'KO-MSG', message_en: 'EN-MSG' };
    let ko = null, en = null, enNoEn = null, none = null;
    try { ko = vm('ko')(d); en = vm('en')(d); enNoEn = vm('en')({ message: 'KO-ONLY' }); none = vm('ko')(null); } catch (e) { ko = 'THREW ' + e.message; }
    check('vocab: 한국어 화면은 서버 한국어 안내', ko === 'KO-MSG', ko);
    check('vocab: 짝 — 영어 화면은 서버 영어 안내', en === 'EN-MSG', en);
    check('vocab: 영어 안내가 없으면 한국어로 떨어진다(빈칸 아님)', enNoEn === 'KO-ONLY', enNoEn);
    check('vocab: 응답이 없으면 빈 문자열(던지지 않음)', none === '', none);
    check('vocab: 단어 추가·여러 개 추가 실패가 그 안내를 먼저 쓴다', /throw new Error\(_vocMsg\(d\) \|\| d\.error\)/.test(voc) && /throw new Error\(_vocMsg\(d\) \|\| d\.error \|\| '추가 실패'\)/.test(voc));
    check('vocab: 미리보기 «+ 단어» 가 막히면 안내를 띄운다', /d\.error === 'auth_required'\) alert\(_vocMsg\(d\)/.test(voc));
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
