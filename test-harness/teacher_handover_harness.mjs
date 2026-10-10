// teacher_handover_harness.mjs — 강사 인수인계 카드 (2026-10-10, 경쟁사 분석 적용 ②)
//   정본 src/teacher-handover.ts 를 «실제로» 돌린다(타입 제거 + 진짜 fix-cards·d1-chunk).
//   loadHandovers 는 진짜 SQLite 를 D1 모양으로 감싸 돌린다.
//   배선(api-teacher.ts)·화면(teacher.html handoverHtml)은 글자가 아니라 «오려 내 실행» 으로 묻는다.
//   「한다」 옆에 「안 한다」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = p => readFileSync(p, 'utf8');
const H_FILE = process.env.HANDOVER_SRC || resolve(SRC, 'teacher-handover.ts');
const API_FILE = process.env.HANDOVER_API || resolve(SRC, 'api-teacher.ts');
const UI_FILE = process.env.HANDOVER_UI || resolve(PUB, 'teacher.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
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
const asData = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
function inject(code, ns) {
  return code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
    names.split(',').map(n => n.trim().replace(/^type\s+/, '')).filter(Boolean)
      .map(n => `const ${n} = globalThis.${ns}.${n};`).join('\n'));
}

/* ── 정본 로드 ── */
let M = null, FC = null;
try {
  const EO = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'english-only.ts')))));
  globalThis.__FC = { isEnglishText: EO.isEnglishText };
  FC = await import(asData(inject(stripTypeScriptTypes(rd(resolve(SRC, 'fix-cards.ts'))), '__FC')));
  const DC = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'd1-chunk.ts')))));
  globalThis.__TH = { ...FC, ...DC };
  M = await import(asData(inject(stripTypeScriptTypes(rd(H_FILE)), '__TH')));
} catch (e) { console.log('  (정본 로드 실패: ' + e.message + ')'); }

const run = f => { try { return f(); } catch (e) { return { __err: e.message }; } };

console.log('① 순수 함수');
ok('전제: 정본을 불러왔다', !!(M && M.loadHandovers && M.pickGoal));
if (M) {
  ok('JSON 배열 목표 → 첫 원소', run(() => M.firstGoal('["과거형 말하기","관사"]')) === '과거형 말하기');
  ok('빈 배열·null → 없음', run(() => M.firstGoal('[]')) === '' && run(() => M.firstGoal(null)) === '');
  ok('평문 목표는 그대로', run(() => M.firstGoal('불규칙 동사 20개')) === '불규칙 동사 20개');
  ok('일지 «Next Lesson:» 줄을 꺼낸다',
    run(() => M.nextLessonLine('Lesson Done: SIU - Basic 003\nNext Lesson: SIU - Basic 004\nLEVEL: 4')) === 'SIU - Basic 004');
  ok('짝: 그 줄이 없으면 지어내지 않는다', run(() => M.nextLessonLine('Great job today!\nKeep practicing.')) === '');
  ok('문장 «안» 의 next lesson 은 줄이 아니다', run(() => M.nextLessonLine('In the next lesson we will read.')) === '');
  ok('줄 중간의 «next lesson:» 도 줄이 아니다', run(() => M.nextLessonLine('We will review it next lesson: promise!')) === '');

  const g = run(() => M.pickGoal(
    [{ next_goals: '["리포트 목표"]', created_at: 1000, lesson_date: '2026-10-01' }],
    [{ note_en: 'Next Lesson: BTS 2 005', created_at: 2000, lesson_date: '2026-10-05' }]));
  ok('가장 최근 기록이 이긴다(옛 리포트가 어제 일지를 덮지 않음)', g && g.text === 'BTS 2 005' && g.from === 'teacher_note' && g.date === '2026-10-05', JSON.stringify(g));
  const g2 = run(() => M.pickGoal(
    [{ next_goals: '["리포트 목표"]', created_at: 3000, lesson_date: '2026-10-08' }],
    [{ note_en: 'Next Lesson: BTS 2 005', created_at: 2000 }]));
  ok('짝: 리포트가 더 최근이면 리포트', g2 && g2.text === '리포트 목표' && g2.from === 'lesson_report');
  const g3 = run(() => M.pickGoal([], [{ next_goals: '', next_goal: '옛 목표', note_en: 'Next Lesson: X', created_at: 1 }]));
  ok('평가 목표 칸이 있으면 일지 줄보다 먼저(같은 행)', g3 && g3.text === '옛 목표' && g3.from === 'evaluation');
  ok('아무 재료도 없으면 null', run(() => M.pickGoal([], [{ note_en: 'Good!', created_at: 1 }])) === null);

  const card = (to, p) => ({ key: to.toLowerCase(), from: 'x ' + to, to, why_ko: '', source: 'warmup', at: 1, lesson_title: '', practiced: p, best_accuracy: null });
  const sf = run(() => M.summarizeFix([card('A one.', 0), card('B two.', 2), card('C three.', 0)]));
  ok('못 고친 것 = 안 말해 본 카드', sf && sf.unfixed_n === 2 && sf.practiced === 1 && sf.total === 3, JSON.stringify(sf));
  ok('보여 줄 못 고친 문장은 최대 2개', sf && sf.unfixed.length === 2 && sf.unfixed[0].to === 'A one.');
  ok('카드 재료를 모르면 null(0 으로 위장하지 않음)', run(() => M.summarizeFix(null)) === null);
  ok('목표도 카드도 없으면 싣지 않는다', run(() => M.handoverWorthShowing({ goal: null, fix: { total: 0, practiced: 0, unfixed: [], unfixed_n: 0 } })) === false);
  ok('짝: 카드만 있어도 싣는다', run(() => M.handoverWorthShowing({ goal: null, fix: sf })) === true);
}

/* ── ② 진짜 SQLite ── */
function d1(db, failOn) {
  return { prepare(sql) {
    if (failOn && failOn.test(sql)) throw new Error('no such table (simulated)');
    const st = db.prepare(sql); let args = [];
    const o = { bind(...a) { args = a; return o; },
      async all() { return { results: st.all(...args) }; },
      async first() { return st.get(...args) ?? null; } };
    return o; } };
}
console.log('② loadHandovers — 진짜 SQLite');
if (M) {
  const DAY = 86400000;
  const now = 200 * DAY + 5 * 3600000, dayStart = 200 * DAY;
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE ai_lesson_reports (student_uid TEXT, next_goals TEXT, grammar_errors TEXT, lesson_title TEXT, lesson_date TEXT, created_at INTEGER);
           CREATE TABLE student_evaluations (student_uid TEXT, user_id TEXT, next_goals TEXT, next_goal TEXT, note_en TEXT, lesson_date TEXT, created_at INTEGER);
           CREATE TABLE warmup_fix_log (user_id TEXT, was TEXT, fixed TEXT, why_ko TEXT, lang TEXT, created_at INTEGER);
           CREATE TABLE voice_coaching (student_uid TEXT, target_text TEXT, accuracy_score REAL, created_at INTEGER);`);
  const ev = db.prepare('INSERT INTO student_evaluations VALUES (?,?,?,?,?,?,?)');
  ev.run('kim', null, null, null, 'Lesson Done: BTS 2 004\nNext Lesson: BTS 2 005', '2026-10-08', now - 2 * DAY);
  ev.run('kim', null, null, null, 'Next Lesson: TODAY', '2026-10-10', now - 3600000);            // 오늘 — 「지난」이 아님
  ev.run('Kim', null, null, null, 'Next Lesson: OTHER ACCOUNT', '2026-10-09', now - DAY);         // 대소문자만 다른 남
  ev.run('', 'park', null, '옛 스키마 목표', null, null, now - 3 * DAY);                          // 옛 행(user_id 만)
  ev.run('old', null, null, null, 'Next Lesson: TOO OLD', null, dayStart - 61 * DAY);           // 60일 밖
  db.prepare('INSERT INTO warmup_fix_log VALUES (?,?,?,?,?,?)').run('kim', 'I go school', 'I went to school.', '과거형', 'en', now - DAY);
  db.prepare('INSERT INTO warmup_fix_log VALUES (?,?,?,?,?,?)').run('kim', 'She like cats', 'She likes cats.', '수일치', 'en', now - DAY - 1000);
  db.prepare('INSERT INTO voice_coaching VALUES (?,?,?,?)').run('kim', 'She likes cats', 80, now - DAY + 5000);
  db.prepare('INSERT INTO voice_coaching VALUES (?,?,?,?)').run('Kim', 'I went to school.', 90, now - DAY + 5000);   // 남의 연습
  db.prepare('INSERT INTO warmup_fix_log VALUES (?,?,?,?,?,?)').run('lee', 'He go', 'He goes home.', '', 'en', now - DAY);

  const res = await M.loadHandovers(d1(db), ['kim', 'park', 'old', 'nobody', 'lee'], now, dayStart);
  const k = res.get('kim');
  ok('지난 목표 = 오늘 이전 가장 최근 일지 줄', k && k.goal && k.goal.text === 'BTS 2 005', JSON.stringify(k && k.goal));
  ok('uid 정확일치 — 대소문자만 다른 남의 기록이 안 섞인다', k && k.goal && k.goal.text !== 'OTHER ACCOUNT' && k.fix && k.fix.practiced === 1);
  ok('못 고친 것 = 학생이 아직 안 말해 본 문장', k && k.fix && k.fix.unfixed_n === 1 && k.fix.unfixed[0].to === 'I went to school.', JSON.stringify(k && k.fix));
  ok('복습 카드: 2장 중 1장 말해 봄', k && k.fix && k.fix.total === 2 && k.fix.practiced === 1);
  ok('옛 스키마(user_id·next_goal) 학생도 목표가 넘어간다', res.get('park') && res.get('park').goal && res.get('park').goal.text === '옛 스키마 목표');
  ok('60일 밖 기록만 있으면 싣지 않는다', !res.has('old'));
  ok('아무 기록도 없으면 싣지 않는다', !res.has('nobody'));
  ok('짝: 목표 없이 카드만 있어도 싣는다', res.get('lee') && res.get('lee').goal === null && res.get('lee').fix.total === 1);

  // ① 화면과 «같은 카드» 를 말하는가 — 학생 화면 정본 loadFixCards 와 대조
  const fc = await FC.loadFixCards(d1(db), 'kim', now);
  ok('학생 화면(①)과 같은 카드를 본다', k && fc.cards.length === k.fix.total
    && fc.cards.filter(c => !(c.practiced > 0)).map(c => c.to).join('|') === k.fix.unfixed.map(c => c.to).join('|'));

  // fail-open
  let thrown = null, r2 = null;
  try { r2 = await M.loadHandovers(d1(db, /voice_coaching/), ['kim'], now, dayStart); } catch (e) { thrown = e; }
  ok('연습 기록을 못 읽어도 던지지 않는다', !thrown);
  ok('연습 기록을 못 읽으면 카드 칸은 «모름»(null) — 연습 0 으로 위장하지 않음', r2 && r2.get('kim') && r2.get('kim').fix === null && r2.get('kim').goal.text === 'BTS 2 005');
  let r3 = null; thrown = null;
  try { r3 = await M.loadHandovers(d1(db, /./), ['kim'], now, dayStart); } catch (e) { thrown = e; }
  ok('모든 조회가 실패해도 던지지 않고 빈 결과', !thrown && r3 && r3.size === 0);
  const db2 = new DatabaseSync(':memory:');
  db2.exec(`CREATE TABLE student_evaluations (student_uid TEXT, user_id TEXT, next_goals TEXT, note_en TEXT, lesson_date TEXT, created_at INTEGER);`);
  db2.prepare('INSERT INTO student_evaluations VALUES (?,?,?,?,?,?)').run('kim', null, null, 'Next Lesson: NO OLD COL', null, now - DAY);
  const r4 = await M.loadHandovers(d1(db2), ['kim'], now, dayStart);
  ok('옛 next_goal 칸이 없는 DB 에서도 목표를 읽는다', r4.get('kim') && r4.get('kim').goal && r4.get('kim').goal.text === 'NO OLD COL');
}

/* ── ③ 배선: api-teacher.ts ── */
console.log('③ 강사 포털 배선');
{
  const api = rd(API_FILE);
  const i = api.indexOf('loadHandovers(env.DB');
  ok('전제: 포털이 loadHandovers 를 부른다', i > 0);
  const tryStart = api.lastIndexOf('if (!onlyNext) try', i);
  const blk = tryStart > 0 ? bodyFrom(api, tryStart) : '';
  ok('배너용(?only=next)에서는 안 부른다', tryStart > 0 && blk.includes('loadHandovers') && i - tryStart < 900);
  // 블록을 실제로 돌린다: 가짜 classes·loadHandovers 로 «무엇이 붙는가»
  let attached = null;
  try {
    const fn = new Function('classes', 'loadHandovers', 'env', 'now', 'kY', 'kMo', 'kD', 'KST', 'onlyNext',
      'return ' + stripTypeScriptTypes(`(async () => { ${'if (!onlyNext) try ' + blk + ' catch (e) {}'} return classes; })();`));
    const classes = [
      { kind: 'class', student_uid: 'kim' }, { kind: 'lms', student_uid: 'kim' }, { kind: 'class', student_uid: 'lee' }, { kind: 'class' },
    ];
    let asked = null;
    const fake = async (db, uids) => { asked = uids; return new Map([['kim', { goal: { text: 'G' }, fix: null }]]); };
    attached = await fn(classes, fake, { DB: {} }, 0, 2026, 9, 10, 9 * 3600000, false);
    ok('수업 학생만 묻는다(lms·uid 없음 제외)', JSON.stringify(asked) === JSON.stringify(['kim', 'lee']), JSON.stringify(asked));
  } catch (e) { ok('블록 실행', false, e.message); }
  ok('수업 줄에만 handover 를 붙인다', attached && attached[0].handover && !attached[1].handover && !attached[2].handover, JSON.stringify(attached));
  try {
    const fn2 = new Function('classes', 'loadHandovers', 'env', 'now', 'kY', 'kMo', 'kD', 'KST', 'onlyNext',
      'return ' + stripTypeScriptTypes(`(async () => { ${'if (!onlyNext) try ' + blk + ' catch (e) {}'} return classes; })();`));
    let called = false;
    const c2 = [{ kind: 'class', student_uid: 'kim' }];
    await fn2(c2, async () => { called = true; return new Map(); }, { DB: {} }, 0, 2026, 9, 10, 0, true);
    ok('짝: onlyNext 면 실제로 안 부른다', called === false);
    const c3 = [{ kind: 'class', student_uid: 'kim' }];
    let threw = false;
    try { await fn2(c3, async () => { throw new Error('boom'); }, { DB: {} }, 0, 2026, 9, 10, 0, false); } catch { threw = true; }
    ok('loadHandovers 가 던져도 목록은 살아 있다', !threw && !c3[0].handover);
  } catch (e) { ok('블록 실행(짝)', false, e.message); }
}

/* ── ④ 화면: teacher.html handoverHtml ── */
console.log('④ 강사 화면');
{
  const ui = rd(UI_FILE);
  const i = ui.indexOf('function handoverHtml(c)');
  ok('전제: handoverHtml 이 있다', i > 0);
  ok('수업 줄이 handoverHtml 을 부른다', /\+\s*handoverHtml\(c\)/.test(ui));
  const body = i > 0 ? bodyFrom(ui, i) : '';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const mk = (lang) => {
    try { return new Function('esc', 'T', 'return function(c)' + body)(esc, (en, ko) => lang === 'en' ? en : ko); }
    catch (e) { return () => '__ERR ' + e.message; }
  };
  const ko = mk('ko'), en = mk('en');
  const full = { handover: { goal: { text: 'BTS 2 005', date: '2026-10-08' },
    fix: { total: 3, practiced: 1, unfixed_n: 2, unfixed: [{ from: 'I go <b>', to: 'I went.' }, { from: 'x', to: 'y' }] } } };
  const hk = ko(full), he = en(full);
  ok('세 줄을 그린다(지난 목표·못 고친 것·복습 카드)', /지난 목표/.test(hk) && /아직 못 고친 것/.test(hk) && /3장 중 1장/.test(hk), hk);
  ok('영어 화면도 같은 세 줄', /Last goal/.test(he) && /Not fixed yet/.test(he) && /practiced 1 of 3/.test(he) && /\+1 more/.test(he), he);
  ok('글자를 탈출시킨다(XSS)', !/<b>'/.test(hk) && hk.includes('I go &lt;b&gt;'));
  ok('handover 가 없으면 아무것도 안 그린다', ko({}) === '' && ko({ handover: null }) === '');
  const unk = ko({ handover: { goal: { text: 'G' }, fix: null } });
  ok('카드를 모르면(null) 목표 줄만', /지난 목표/.test(unk) && !/복습 카드/.test(unk) && !/못 고친/.test(unk));
  const none = ko({ handover: { goal: null, fix: { total: 2, practiced: 0, unfixed_n: 2, unfixed: [{ from: 'a', to: 'b' }] } } });
  ok('짝: 아직 안 했으면 «아직 안 함»', /아직 안 함 \(2장\)/.test(none) && !/지난 목표/.test(none));
  const done = ko({ handover: { goal: null, fix: { total: 2, practiced: 2, unfixed_n: 0, unfixed: [] } } });
  ok('카드 0장이면 카드 줄을 안 그린다', ko({ handover: { goal: null, fix: { total: 0, practiced: 0, unfixed_n: 0, unfixed: [] } } }) === '');
  ok('목표 글자도 탈출시킨다(XSS)', !/<img/.test(ko({ handover: { goal: { text: '<img src=x>' }, fix: null } })));
  ok('다 말해 봤으면 못 고친 줄은 없다', !/못 고친/.test(done) && /2장 중 2장/.test(done));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
