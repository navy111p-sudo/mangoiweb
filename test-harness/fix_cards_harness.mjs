// fix_cards_harness.mjs — «지난번에 틀린 문장 다시 말하기» 카드 (2026-10-10)
//   정본 src/fix-cards.ts 를 «실제로» 돌린다(타입 제거 + 진짜 english-only).
//   loadFixCards 는 진짜 SQLite 를 D1 모양으로 감싸 돌린다.
//   배선은 글자가 아니라 «오려 내 실행» 으로 묻는다 — speech-coach ?say=, today-page renderFix.
//   「한다」 옆에 「안 한다」를 짝으로 둔다(짝이 없으면 «전부 막기»·«전부 통과» 가 초록이 된다).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = p => readFileSync(p, 'utf8');
const SRC_FILE = process.env.FIXCARDS_SRC || resolve(SRC, 'fix-cards.ts');
const API_FILE = process.env.FIXCARDS_API || resolve(SRC, 'api-students.ts');
const SC_FILE = process.env.FIXCARDS_SC || resolve(PUB, 'speech-coach.html');
const TP_FILE = process.env.FIXCARDS_TP || resolve(PUB, 'js/today-page.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* 중괄호 짝으로 블록 자르기 — start 는 «{» 가 시작되는 위치 이후 아무 곳 */
function bodyFrom(s, from) {
  const i = s.indexOf('{', from); if (i < 0) return '';
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return s.slice(i, k + 1); }
  }
  return '';
}

/* ── 정본 로드 ───────────────────────────────────────── */
let M = null;
try {
  const eo = stripTypeScriptTypes(rd(resolve(SRC, 'english-only.ts')));
  const EO = await import('data:text/javascript;base64,' + Buffer.from(eo).toString('base64'));
  globalThis.__FC = { isEnglishText: EO.isEnglishText };
  let code = stripTypeScriptTypes(rd(SRC_FILE));
  code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
    names.split(',').map(n => n.trim()).filter(Boolean).map(n => `const ${n} = globalThis.__FC.${n};`).join('\n'));
  M = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
} catch (e) { console.log('  (정본 로드 실패: ' + e.message + ')'); }

console.log('① 정본을 실제로 돌린다');
ok('전제: 정본을 불러왔다', !!(M && M.pickFixCards && M.loadFixCards));
if (M) {
  const run = (f) => { try { return f(); } catch (e) { return { __err: e.message }; } };
  // cleanPair
  ok('고친 영어 문장은 카드가 된다', !!run(() => M.cleanPair('I go school', 'I go to school.', '전치사 to')));
  ok('고친 문장이 영어가 아니면 버린다', run(() => M.cleanPair('나 학교 가', '나는 학교에 가', '')) === null);
  ok('대소문자·마침표만 다르면 버린다', run(() => M.cleanPair('i like dogs', 'I like dogs.', '')) === null);
  ok('빈 값은 버린다', run(() => M.cleanPair('', 'I like dogs.', '')) === null && run(() => M.cleanPair('x', '', '')) === null);
  ok('너무 긴 고친 문장은 버린다(잘라 쓰지 않는다)', run(() => M.cleanPair('a', 'I ' + 'very '.repeat(40) + 'like it.', '')) === null);

  const lesson = [{ created_at: 2000, lesson_title: 'BTS 2', grammar_errors: JSON.stringify([
    { original: 'He go to park', corrected: 'He goes to the park.', reason: '3인칭 단수' },
    { original: 'same', corrected: 'Same', reason: '' },
  ]) }];
  const warm = [
    { was: 'I go school yesterday', fixed: 'I went to school yesterday.', why_ko: '과거형', lang: 'en', created_at: 3000 },
    { was: 'he go to park', fixed: 'he goes to the park', why_ko: '중복', lang: 'en', created_at: 2500 },
    { was: '我去学校', fixed: '我去了学校。', why_ko: '', lang: 'zh', created_at: 2400 },
    { was: 'She like cats', fixed: 'She likes cats.', why_ko: '수일치', lang: 'en', created_at: 2300 },
    { was: 'They is happy', fixed: 'They are happy.', why_ko: 'be동사', lang: 'en', created_at: 2200 },
  ];
  const cards = run(() => M.pickFixCards(lesson, warm)) || [];
  ok('수업 리포트가 웜업보다 먼저다', Array.isArray(cards) && cards[0] && cards[0].source === 'lesson' && cards[0].to === 'He goes to the park.');
  ok('같은 고친 문장은 한 장(대소문자·마침표 무시)', Array.isArray(cards) && cards.filter(c => /goes to the park/i.test(c.to)).length === 1);
  ok('중국어(zh) 기록은 건너뛴다', Array.isArray(cards) && !cards.some(c => /[一-鿿]/.test(c.to)));
  ok('중국어 기록은 병음(로마자)이어도 건너뛴다',
    (run(() => M.pickFixCards([], [{ was: 'wo qu xuexiao', fixed: 'Wo qu le xuexiao.', why_ko: '', lang: 'zh', created_at: 1 }])) || [1]).length === 0);
  ok('최대 3장', Array.isArray(cards) && cards.length === 3);
  ok('짝: 웜업 교정도 카드가 된다', Array.isArray(cards) && cards.some(c => c.source === 'warmup' && c.to === 'I went to school yesterday.'));
  ok('수업 제목이 실린다', Array.isArray(cards) && cards[0] && cards[0].lesson_title === 'BTS 2');
  ok('grammar_errors 가 깨진 JSON 이면 그 행만 건너뛴다',
    (run(() => M.pickFixCards([{ grammar_errors: '{broken', created_at: 1 }], warm.slice(0, 1))) || []).length === 1);

  // attachPractice
  const one = [{ key: M.normSentence('I went to school yesterday.'), from: 'x', to: 'I went to school yesterday.', why_ko: '', source: 'warmup', at: 1000, lesson_title: '', practiced: 0, best_accuracy: null }];
  const ap = run(() => M.attachPractice(one, [
    { target_text: 'i went to school yesterday', accuracy_score: 70, created_at: 1500 },
    { target_text: 'I went to school yesterday.', accuracy_score: 88, created_at: 2000 },
    { target_text: 'I went to school yesterday.', accuracy_score: 99, created_at: 500 },   // 카드보다 앞 — 안 센다
    { target_text: 'Something else.', accuracy_score: 100, created_at: 2000 },
  ])) || [];
  ok('카드가 생긴 «뒤» 의 같은 문장만 센다', ap[0] && ap[0].practiced === 2, JSON.stringify(ap[0]));
  ok('최고 정확도는 그 안에서', ap[0] && ap[0].best_accuracy === 88);
  const ap0 = run(() => M.attachPractice(one, [])) || [];
  ok('짝: 연습 없으면 0회·점수 null(지어내지 않는다)', ap0[0] && ap0[0].practiced === 0 && ap0[0].best_accuracy === null);
}

console.log('② loadFixCards — 진짜 SQLite, uid 정확일치, fail-open');
function d1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = [];
    const o = { bind(...a) { args = a; return o; },
      async all() { return { results: st.all(...args) }; },
      async first() { return st.get(...args) ?? null; } };
    return o; } };
}
if (M) {
  const now = 100 * 86400000;
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE ai_lesson_reports (student_uid TEXT, grammar_errors TEXT, lesson_title TEXT, created_at INTEGER);
           CREATE TABLE warmup_fix_log (user_id TEXT, was TEXT, fixed TEXT, why_ko TEXT, lang TEXT, created_at INTEGER);
           CREATE TABLE voice_coaching (student_uid TEXT, target_text TEXT, accuracy_score REAL, created_at INTEGER);`);
  db.prepare('INSERT INTO warmup_fix_log VALUES (?,?,?,?,?,?)').run('kim', 'I go school', 'I went to school.', '과거형', 'en', now - 86400000);
  db.prepare('INSERT INTO warmup_fix_log VALUES (?,?,?,?,?,?)').run('Kim', 'She like cats', 'She likes cats.', '', 'en', now - 86400000);
  db.prepare('INSERT INTO warmup_fix_log VALUES (?,?,?,?,?,?)').run('kim', 'old one', 'This is old.', '', 'en', now - 40 * 86400000);
  db.prepare('INSERT INTO ai_lesson_reports VALUES (?,?,?,?)').run('kim', JSON.stringify([{ original: 'He go', corrected: 'He goes.', reason: 'r' }]), 'L1', now - 2 * 86400000);
  db.prepare('INSERT INTO voice_coaching VALUES (?,?,?,?)').run('kim', 'I went to school.', 77, now - 3600000);
  db.prepare('INSERT INTO voice_coaching VALUES (?,?,?,?)').run('Kim', 'I went to school.', 99, now - 3600000);
  let r = null;
  try { r = await M.loadFixCards(d1(db), 'kim', now); } catch (e) { r = { __err: e.message }; }
  ok('전제: 돌았다', r && Array.isArray(r.cards), JSON.stringify(r));
  if (r && Array.isArray(r.cards)) {
    ok('남의 계정(Kim)의 교정은 안 섞인다', !r.cards.some(c => c.to === 'She likes cats.'));
    ok('30일 넘은 교정은 안 나온다', !r.cards.some(c => c.to === 'This is old.'));
    ok('수업 → 웜업 순서', r.cards.length === 2 && r.cards[0].to === 'He goes.' && r.cards[1].to === 'I went to school.');
    const w = r.cards.find(c => c.to === 'I went to school.');
    ok('연습은 본인 것만(Kim 의 99점은 안 셈)', w && w.practiced === 1 && w.best_accuracy === 77, JSON.stringify(w));
    ok('세 재료 다 «물어봤다»', r.sources.lesson && r.sources.warmup && r.sources.practice);
  }
  // fail-open: 표가 하나도 없는 DB
  const empty = new DatabaseSync(':memory:');
  let r2 = null;
  try { r2 = await M.loadFixCards(d1(empty), 'kim', now); } catch (e) { r2 = { __err: 'threw: ' + e.message }; }
  ok('표가 없으면 던지지 않고 빈 카드', r2 && Array.isArray(r2.cards) && r2.cards.length === 0, JSON.stringify(r2));
  ok('그때 «못 물어봤다» 를 false 로 말한다(0건과 다름)', r2 && r2.sources && r2.sources.lesson === false && r2.sources.warmup === false);
  // 한쪽만 있을 때 — 웜업만 있어도 카드는 나온다
  const half = new DatabaseSync(':memory:');
  half.exec(`CREATE TABLE warmup_fix_log (user_id TEXT, was TEXT, fixed TEXT, why_ko TEXT, lang TEXT, created_at INTEGER);`);
  half.prepare('INSERT INTO warmup_fix_log VALUES (?,?,?,?,?,?)').run('kim', 'I go school', 'I went to school.', '', 'en', now - 1000);
  let r3 = null;
  try { r3 = await M.loadFixCards(d1(half), 'kim', now); } catch (e) { r3 = { __err: e.message }; }
  ok('짝: 수업 표가 없어도 웜업 카드는 나온다', r3 && r3.cards && r3.cards.length === 1 && r3.sources.lesson === false && r3.sources.warmup === true);
  ok('연습 표가 없으면 카드는 그대로·연습 «모름»', r3 && r3.cards && r3.cards[0].practiced === 0 && r3.sources.practice === false);
}

console.log('③ 서버 배선 — 게이트 «뒤» 갈래');
{
  const s = rd(API_FILE);
  const route = s.indexOf("path === '/api/student/today'");
  const body = route >= 0 ? bodyFrom(s, route) : '';
  ok('전제: 라우트를 잘라 냈다', body.length > 500);
  const gate = body.indexOf('resolveOwnerScope(');
  const fx = body.indexOf("get('fixcards')");
  ok('?fixcards 갈래가 있다', fx > 0);
  ok('그 갈래는 본인/관리자 게이트 «뒤»', gate > 0 && fx > gate);
  const fxBody = fx > 0 ? bodyFrom(body, fx) : '';
  ok('그 갈래는 정본 loadFixCards 를 부르고 그 결과를 싣는다', /loadFixCards\(\s*env\.DB\s*,\s*uid/.test(fxBody) && /cards\s*:\s*\w+\.cards/.test(fxBody));
  ok('캐시 금지(private, no-store)', /private, no-store/.test(fxBody));
  ok('import 가 있다', /import\s*\{\s*loadFixCards\s*\}\s*from\s*'\.\/fix-cards'/.test(s));
}

console.log('④ 발음 코칭 ?say= — 오려 내 실행');
{
  const s = rd(SC_FILE);
  const fi = s.indexOf('function scSayFromUrl(');
  const fn = fi >= 0 ? s.slice(fi, s.indexOf('{', fi)) + bodyFrom(s, fi) : '';
  let say = null;
  try { say = new Function(fn + '; return scSayFromUrl;')(); } catch (e) { say = null; }
  ok('전제: scSayFromUrl 을 오려 냈다', typeof say === 'function');
  if (typeof say === 'function') {
    ok('영어 문장을 받는다', say('?say=' + encodeURIComponent('I went to school.')) === 'I went to school.');
    ok('겹공백은 하나로', say('?say=' + encodeURIComponent('  I   went ')) === 'I went');
    ok('한글은 안 받는다', say('?say=' + encodeURIComponent('나는 학교에 갔다')) === '');
    ok('영어에 한글이 섞여도 안 받는다', say('?say=' + encodeURIComponent('I like 김치.')) === '');
    ok('160자 넘으면 안 받는다', say('?say=' + encodeURIComponent('a'.repeat(161))) === '');
    ok('글자 없는 기호만이면 안 받는다', say('?say=' + encodeURIComponent('!!! ...')) === '');
    ok('없으면 빈 값', say('?course=bts') === '');
  }
  // 초기화 블록: ?say 가 있으면 setTarget, 코스 이어서 하기는 건너뛴다
  const ti = s.indexOf('var _qsSay = scSayFromUrl(');
  const tryStart = ti >= 0 ? s.lastIndexOf('try {', ti) : -1;
  const block = tryStart >= 0 ? 'try ' + bodyFrom(s, tryStart) + ' catch(e){}' : '';
  const runBlock = (search, saved) => {
    const calls = [];
    try {
      new Function('location', 'localStorage', 'COURSES', 'setTarget', 'selectCourse', 'scSayFromUrl', block)(
        { search }, { getItem: () => saved }, { bts: 1, siu: 1, phonics: 1 },
        (t) => calls.push('T:' + t), (c) => calls.push('C:' + c), say);
    } catch (e) { calls.push('ERR:' + e.message); }
    return calls.join('|');
  };
  ok('전제: 초기화 블록을 잘라 냈다', block.length > 100 && typeof say === 'function');
  if (block && typeof say === 'function') {
    const saved = JSON.stringify({ course: 'bts' });
    ok('?say 가 있으면 그 문장을 걸고 코스 복원은 건너뛴다', runBlock('?say=I%20went%20home.', saved) === 'T:I went home.');
    ok('짝: ?say 가 없으면 예전대로 저장 코스를 연다', runBlock('', saved) === 'C:bts');
    ok('짝: ?course 도 예전대로', runBlock('?course=siu', null) === 'C:siu');
    ok('?say 가 한글이면 무시하고 예전대로', runBlock('?say=' + encodeURIComponent('안녕') + '&course=siu', null) === 'C:siu');
  }
}

console.log('⑤ 오늘의 A.i 학습 화면 — renderFix 를 가짜 DOM 으로 실행');
{
  const s = rd(TP_FILE);
  const pick = (name) => { const i = s.indexOf('function ' + name + '('); return i < 0 ? '' : s.slice(i, s.indexOf('{', i)) + bodyFrom(s, i); };
  const src = [pick('fixUrl'), pick('renderFix')].join('\n');
  ok('전제: renderFix·fixUrl 을 오려 냈다', /function renderFix/.test(src) && /function fixUrl/.test(src));
  const mk = () => { const el = {}; return { hidden: true, innerHTML: '', textContent: '' }; };
  const run = (FIX, DATA, en) => {
    const els = { 'td-fix': mk(), 'td-fix-list': mk(), 'td-h-fix': mk() };
    try {
      new Function('FIX', 'DATA', '$', 'T', 'isEn', 'esc', src + '; renderFix();')(
        FIX, DATA, (id) => els[id] || null, (k, e) => (en ? e : k), () => !!en,
        (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'));
    } catch (e) { els.err = e.message; }
    return els;
  };
  const card = { to: 'I went to school.', from: 'I go school', why_ko: '과거형', source: 'warmup', practiced: 0, best_accuracy: null, lesson_title: '' };
  const a = run({ ok: true, cards: [card] }, { sample: false }, false);
  ok('카드가 있으면 칸을 보인다', a['td-fix'].hidden === false && !a.err, a.err);
  ok('따라 말하기 링크가 ?say=<고친 문장>&from=today', a['td-fix-list'].innerHTML.includes('/speech-coach.html?say=' + encodeURIComponent('I went to school.').replace(/[&]/g, '&#38;') + '&#38;from=today'), a['td-fix-list'].innerHTML.slice(0, 300));
  ok('내가 한 말·이유가 그려진다', a['td-fix-list'].innerHTML.includes('I go school') && a['td-fix-list'].innerHTML.includes('과거형'));
  ok('아직 연습 안 했다고 말한다', a['td-fix-list'].innerHTML.includes('아직 연습 안 함'));
  const b = run({ ok: true, cards: [] }, { sample: false }, false);
  ok('짝: 0장이면 칸째 감춘다', b['td-fix'].hidden === true);
  const c = run(null, { sample: false }, false);
  ok('못 읽었으면(null) 감춘다', c['td-fix'].hidden === true && !c.err);
  const d = run({ ok: true, cards: [card] }, { sample: true }, false);
  ok('맛보기에서는 그리지 않는다', d['td-fix'].hidden === true);
  const e = run({ ok: false, cards: [card] }, { sample: false }, false);
  ok('ok 가 아니면 그리지 않는다', e['td-fix'].hidden === true);
  const f = run({ ok: true, cards: [{ ...card, practiced: 2, best_accuracy: 88.4 }] }, { sample: false }, true);
  ok('EN: 영어로 연습 기록을 말한다', f['td-fix-list'].innerHTML.includes('Practiced 2x') && f['td-fix-list'].innerHTML.includes('best 88'));
  ok('EN: 한국어 이유는 영어 화면에 안 그린다', !f['td-fix-list'].innerHTML.includes('과거형'));
  // 배선 — 계획을 그린 «뒤» 에 카드를 부르는가(성공 갈래 안)
  const li = s.indexOf('function load(');
  const loadBody = li >= 0 ? bodyFrom(s, li) : '';
  ok('계획 성공 갈래에서 render() 다음 loadFix(u) 를 부른다', /DATA\s*=\s*d;\s*render\(\);\s*loadFix\(u\);/.test(loadBody));
  const lf = pick('loadFix');
  ok('loadFix 는 ?fixcards=1 을 본인 토큰과 함께 부른다', /fixcards=1/.test(lf) && /token=/.test(lf));
  ok('언어를 바꾸면 카드도 다시 그린다', (s.match(/renderFix\(\);\s*\}\s*\}\);/g) || []).length === 2);
  const html = rd(resolve(PUB, 'today.html'));
  ok('today.html 에 카드 칸이 있고 처음엔 감춰져 있다', /<div id="td-fix" hidden>/.test(html));
  ok('today.html 이 today-page.js 를 ?v= 로 부른다', /today-page\.js\?v=\d+/.test(html));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
console.log(`fix_cards_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
