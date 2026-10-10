// student_goal_harness.mjs — 4주 목표 (2026-10-10, 경쟁사 분석 적용 ③)
//   정본 src/student-goal.ts 를 «실제로» 돌린다(타입 제거 + 진짜 d1-chunk, 진짜 SQLite 를 D1 모양으로).
//   배선(api-teacher·api-ai·api-students)과 화면(teacher.html·today-page.js·parent.html)은
//   «오려 내 실행» 하거나 «위치» 로 묻는다. 「한다」 옆에 「안 한다」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = p => readFileSync(p, 'utf8');
const G_FILE = process.env.GOAL_SRC || resolve(SRC, 'student-goal.ts');
const API_T = process.env.GOAL_API_T || resolve(SRC, 'api-teacher.ts');
const API_AI = process.env.GOAL_API_AI || resolve(SRC, 'api-ai.ts');
const API_S = process.env.GOAL_API_S || resolve(SRC, 'api-students.ts');
const UI_T = process.env.GOAL_UI_T || resolve(PUB, 'teacher.html');
const UI_TODAY = process.env.GOAL_UI_TODAY || resolve(PUB, 'js/today-page.js');
const UI_P = process.env.GOAL_UI_P || resolve(PUB, 'parent.html');

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
const strip = t => t.replace(/^[ \t]*\/\/.*$/gm, '');

/* ── 정본 로드 ── */
let M = null;
try {
  const DC = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'd1-chunk.ts')))));
  const SA = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'student-alias.ts')))));
  globalThis.__SG = { ...DC, ...SA };
  M = await import(asData(inject(stripTypeScriptTypes(rd(G_FILE)), '__SG')));
} catch (e) { console.log('  (정본 로드 실패: ' + e.message + ')'); }
const run = f => { try { return f(); } catch (e) { return { __err: e.message }; } };
const DAY = 86400000;

console.log('① 순수 함수');
ok('전제: 정본을 불러왔다', !!(M && M.setStudentGoal && M.goalView && M.GOALS));
if (M) {
  ok('보기는 5~6개(보고서 약속)', M.GOALS.length >= 5 && M.GOALS.length <= 6, String(M.GOALS.length));
  ok('보기마다 ko·en·hint 가 있고 key 가 겹치지 않는다', M.GOALS.every(g => g.key && g.ko && g.en && g.hint) && new Set(M.GOALS.map(g => g.key)).size === M.GOALS.length);
  ok('goalByKey: 아는 key', run(() => M.goalByKey('past_tense'))?.key === 'past_tense');
  ok('짝: 모르는 key·빈 값은 null', run(() => M.goalByKey('make_up')) === null && run(() => M.goalByKey('')) === null);
  const set = 100 * DAY;
  const row = { goal_key: 'past_tense', set_at: set, ends_at: set + 28 * DAY, status: 'active', set_by_name: 'Kaye' };
  const v1 = run(() => M.goalView(row, set + 1000));
  ok('정한 날 = 1일째', v1 && v1.day === 1 && v1.days === 28, JSON.stringify(v1));
  ok('10일 뒤 = 11일째', run(() => M.goalView(row, set + 10 * DAY + 5))?.day === 11);
  ok('끝난 목표는 null', run(() => M.goalView(row, set + 28 * DAY)) === null);
  ok('짝: 끝나기 직전은 28일째', run(() => M.goalView(row, set + 28 * DAY - 1))?.day === 28);
  ok('바뀐/지운 목표는 null', run(() => M.goalView({ ...row, status: 'replaced' }, set + 5)) === null);
  ok('모르는 key 행은 null(지어내지 않는다)', run(() => M.goalView({ ...row, goal_key: 'x' }, set + 5)) === null);
  const line = run(() => M.goalPromptLine(v1));
  ok('A.i 친구 지시에 목표 영어 이름이 들어간다', typeof line === 'string' && line.includes('Talk about past events'), line);
  ok('지시가 «학생을 따라간다» 를 이기지 않는다(강요 금지 문구)', /Never force it/.test(line) && /following what the student says/i.test(line));
  ok('짝: 목표가 없으면 빈 지시', run(() => M.goalPromptLine(null)) === '');
}

/* ── ② 진짜 SQLite ── */
function d1(db, failOn) {
  return {
    prepare(sql) {
      if (failOn && failOn.test(sql)) throw new Error('no such table (simulated)');
      const st = db.prepare(sql); let args = [];
      const o = { bind(...a) { args = a; return o; },
        async all() { return { results: st.all(...args) }; },
        async first() { return st.get(...args) ?? null; },
        async run() { return st.run(...args); }, __exec: () => st.run(...args) };
      return o;
    },
    async batch(list) { db.exec('BEGIN'); try { for (const s of list) s.__exec(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
console.log('② 저장·조회 — 진짜 SQLite');
if (M) {
  const now = 300 * DAY;
  const db = new DatabaseSync(':memory:');
  const D = d1(db);
  const r1 = await M.setStudentGoal(D, { uid: 'kim', key: 'past_tense', by: 'mangoi_007', byName: 'Kaye', nowMs: now });
  ok('목표를 저장한다', r1.ok === true && r1.goal && r1.goal.key === 'past_tense' && r1.goal.day === 1, JSON.stringify(r1));
  const r2 = await M.setStudentGoal(D, { uid: 'kim', key: 'describe', by: 'x', byName: 'Kaye', nowMs: now + DAY });
  const act = db.prepare(`SELECT goal_key, status FROM student_goals WHERE student_uid='kim' ORDER BY id`).all();
  ok('새로 정하면 앞 것은 replaced 로 남고 활성은 하나', r2.ok && act.length === 2 && act[0].status === 'replaced' && act.filter(a => a.status === 'active').length === 1, JSON.stringify(act));
  const bad = await M.setStudentGoal(D, { uid: 'kim', key: 'invent_goal', by: 'x', byName: 'x', nowMs: now });
  ok('보기 밖 key 는 거절(자유 입력 안 받음)', bad.ok === false && bad.error === 'unknown_goal');
  ok('짝: 거절해도 지금 목표는 그대로', db.prepare(`SELECT goal_key FROM student_goals WHERE student_uid='kim' AND status='active'`).get()?.goal_key === 'describe');
  await M.setStudentGoal(D, { uid: 'Kim', key: 'ask_questions', by: 'x', byName: 'x', nowMs: now });
  await M.setStudentGoal(D, { uid: 'lee', key: 'future_plans', by: 'x', byName: 'x', nowMs: now - 30 * DAY });   // 끝난 목표
  const m = await M.loadActiveGoals(D, ['kim', 'lee', 'nobody'], now + 2 * DAY);
  ok('여러 학생을 한 번에 읽는다', m.get('kim')?.key === 'describe');
  ok('uid 정확일치 — Kim 의 목표가 kim 에 안 섞인다', m.get('kim')?.key !== 'ask_questions');
  ok('끝난 목표·없는 학생은 안 싣는다', !m.has('lee') && !m.has('nobody'));
  const clr = await M.setStudentGoal(D, { uid: 'kim', key: '', by: 'x', byName: 'x', nowMs: now + 3 * DAY });
  ok('빈 key = 지우기', clr.ok === true && clr.goal === null && !(await M.loadActiveGoal(D, 'kim', now + 3 * DAY)));
  // 연습 횟수 — 목표를 정한 «뒤» 만
  db.exec(`CREATE TABLE ai_friend_chats (student_uid TEXT, role TEXT, content TEXT, created_at INTEGER);
           CREATE TABLE warmup_session_log (user_id TEXT, started_at INTEGER);`);
  const ch = db.prepare('INSERT INTO ai_friend_chats VALUES (?,?,?,?)');
  ch.run('kim', 'user', 'old', now - 5); ch.run('kim', 'user', 'a', now + 5); ch.run('kim', 'assistant', 'b', now + 6); ch.run('Kim', 'user', 'c', now + 7);
  db.prepare('INSERT INTO warmup_session_log VALUES (?,?)').run('kim', now + 9);
  const pr = await M.loadGoalPractice(D, 'kim', now);
  ok('목표 뒤 학생 발화만 센다(AI 답·이전·남의 계정 제외)', pr.friend === 1 && pr.warmup === 1, JSON.stringify(pr));
  // 쌍둥이 계정(X ↔ mangoai_X, 이름이 같을 때만) — 강사는 수업 줄 계정에 적고 학생은 다른 쪽으로 로그인한다
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, username TEXT)`);
  const se = db.prepare('INSERT INTO students_erp VALUES (?,?,?)');
  se.run('delaware', '김연숙', 'delaware'); se.run('mangoai_delaware', '김연숙', 'x');
  se.run('jin', '박진', 'jin'); se.run('mangoai_jin', '다른사람', 'y');
  await M.setStudentGoal(D, { uid: 'mangoai_delaware', key: 'likes_because', by: 'x', byName: 'x', nowMs: now });
  await M.setStudentGoal(D, { uid: 'mangoai_jin', key: 'likes_because', by: 'x', byName: 'x', nowMs: now });
  ok('쌍둥이 계정에 적힌 목표도 학생 로그인 계정에서 보인다', (await M.loadActiveGoal(D, 'delaware', now + 5))?.key === 'likes_because');
  await M.setStudentGoal(D, { uid: 'delaware', key: 'describe', by: 'x', byName: 'x', nowMs: now - DAY });   // 내 계정엔 더 «옛» 목표
  ok('두 계정에 다 있으면 «가장 최근에 정한» 목표', (await M.loadActiveGoal(D, 'delaware', now + 5))?.key === 'likes_because');
  ok('짝: 이름이 다른 «쌍둥이 모양» 계정은 남이다', (await M.loadActiveGoal(D, 'jin', now + 5)) === null);
  ch.run('mangoai_delaware', 'user', 'tw', now + 8); ch.run('delaware', 'user', 'me', now + 8);
  const prT = await M.loadGoalPractice(D, 'delaware', now);
  ok('연습도 쌍둥이 계정을 함께 센다', prT.friend === 2, JSON.stringify(prT));
  const prJ = await M.loadGoalPractice(D, 'jin', now);
  ok('짝: 이름이 다르면 안 섞는다', prJ.friend === 0, JSON.stringify(prJ));
  const pr2 = await M.loadGoalPractice(d1(db, /warmup_session_log/), 'kim', now);
  ok('못 센 재료는 null(0 으로 위장하지 않음)', pr2.friend === 1 && pr2.warmup === null, JSON.stringify(pr2));
  let thrown = null, em = null;
  try { em = await M.loadActiveGoals(d1(new DatabaseSync(':memory:')), ['kim'], now); } catch (e) { thrown = e; }
  ok('표가 없어도 던지지 않고 «목표 없음»', !thrown && em && em.size === 0);
}

/* ── ③ 강사 포털 배선 ── */
console.log('③ 강사 포털: 저장 권한·목표 싣기');
{
  const api = rd(API_T);
  const gate = api.match(/if \(path !== '\/api\/teacher\/portal' \|\| \(method !== 'GET' && !isGoalPost\)\) return null;/);
  ok('POST 는 ?part=goal 일 때만 받는다', !!gate && /const isGoalPost = method === 'POST' && url\.searchParams\.get\('part'\) === 'goal';/.test(api));
  const i = api.indexOf('if (isGoalPost) {');
  ok('전제: 저장 갈래를 찾았다', i > 0);
  ok('저장 갈래는 classes(오늘 수업)를 다 만든 «뒤»', i > api.indexOf('const classes: any[] = [];') && i > api.indexOf('loadHandovers(env.DB'));
  const blk = i > 0 ? bodyFrom(api, i) : '';
  const mk = () => new Function('isGoalPost', 'request', 'classes', 'setStudentGoal', 'goalByKey', 'actor', 'env', 'now', 'json',
    'return ' + stripTypeScriptTypes(`(async () => { if (isGoalPost) ${blk} return 'FELL'; })();`));
  const json = (b, st) => ({ b, st: st || 200 });
  const req = body => ({ json: async () => body });
  const classes = [{ kind: 'class', student_uid: 'kim' }, { kind: 'lms', student_uid: 'park' }];
  const G = M ? M.goalByKey : (k => k === 'past_tense' ? { key: k } : null);
  let called = null;
  const fakeSet = async (db, a) => { called = a; return { ok: true, goal: { key: a.key } }; };
  const go = async (body) => { called = null; try { return await mk()(true, req(body), classes, fakeSet, G, { username: 'mangoi_007', name: 'Kaye' }, { DB: {} }, 123, json); } catch (e) { return { err: e.message }; } };
  const a = await go({ student_uid: 'kim', goal_key: 'past_tense' });
  ok('내 오늘 학생이면 저장한다', a && a.b && a.b.ok === true && called && called.uid === 'kim' && called.by === 'mangoi_007' && called.nowMs === 123, JSON.stringify(a));
  const b = await go({ student_uid: 'stranger', goal_key: 'past_tense' });
  ok('남의 학생은 403 · 저장 안 함', b && b.st === 403 && b.b.error === 'not_your_student' && called === null, JSON.stringify(b));
  const c = await go({ student_uid: 'Kim', goal_key: 'past_tense' });
  ok('대소문자만 다른 계정도 남이다', c && c.st === 403 && called === null);
  const d = await go({ student_uid: 'park', goal_key: 'past_tense' });
  ok('수업이 아닌 줄(lms)의 학생은 안 된다', d && d.st === 403 && called === null);
  const e = await go({ student_uid: 'kim', goal_key: 'invent' });
  ok('보기 밖 key 는 400 · 저장 안 함', e && e.st === 400 && e.b.error === 'unknown_goal' && called === null);
  const f = await go({ student_uid: 'kim', goal_key: '' });
  ok('짝: 빈 key(지우기)는 받는다', f && f.b && f.b.ok === true && called && called.key === '');
  // 목표 싣기 블록
  const li = api.indexOf('loadActiveGoals(env.DB');
  const ts = li > 0 ? api.lastIndexOf('if (!onlyNext) try', li) : -1;
  const lb = ts > 0 ? bodyFrom(api, ts) : '';
  ok('전제: 목표 싣기 블록', ts > 0 && lb.includes('loadActiveGoals'));
  try {
    const fn = new Function('classes', 'loadActiveGoals', 'env', 'now', 'onlyNext',
      'return ' + stripTypeScriptTypes(`(async () => { if (!onlyNext) try ${lb} catch (e) {} return classes; })();`));
    const cl = [{ kind: 'class', student_uid: 'kim' }, { kind: 'lms', student_uid: 'kim' }, { kind: 'class', student_uid: 'lee' }];
    let asked = null;
    const out = await fn(cl, async (db, u) => { asked = u; return new Map([['kim', { key: 'past_tense' }]]); }, { DB: {} }, 1, false);
    ok('수업 줄에만 student_goal 을 싣는다', out[0].student_goal && !out[1].student_goal && !out[2].student_goal && JSON.stringify(asked) === '["kim","lee"]');
    let called2 = false;
    await fn([{ kind: 'class', student_uid: 'kim' }], async () => { called2 = true; return new Map(); }, { DB: {} }, 1, true);
    ok('짝: 배너용(onlyNext)에서는 안 부른다', called2 === false);
  } catch (err) { ok('싣기 블록 실행', false, err.message); }
  ok('보기 목록은 서버 정본(GOALS)에서 내려준다', /goal_options:\s*GOALS\.map\(/.test(api));
}

/* ── ④ A.i 친구 ── */
console.log('④ A.i 친구 대화를 목표 쪽으로');
{
  const ai = rd(API_AI);
  const s = ai.indexOf("path === '/api/ai/chat-friend'");
  const blk = s > 0 ? bodyFrom(ai, s) : '';
  ok('전제: chat-friend 블록', blk.length > 1000);
  ok('그 학생(uid)의 목표를 읽는다', /loadActiveGoal\(env\.DB, uid, /.test(blk));
  const gi = blk.indexOf('const goalCtx = goalPromptLine(goalNow');
  ok('목표 → 지시 한 줄(goalPromptLine)', gi > 0);
  ok('시스템 프롬프트에 실린다', /CEFR level \$\{level\}\.\$\{stuCtx\}\$\{topicCtx\}\$\{goalCtx\}/.test(blk));
  ok('짝: 목표 읽기가 실패해도 대화는 계속(loadActiveGoal 은 던지지 않음)', M && /catch \{ \/\* 표가 아직 없거나/.test(rd(G_FILE)));
}

/* ── ⑤ 학생·학부모 API ── */
console.log('⑤ 학생 «오늘의 A.i 학습» · 학부모 대시보드');
{
  const st = rd(API_S);
  const gq = st.indexOf("url.searchParams.get('goal')");
  const fx = st.indexOf("url.searchParams.get('fixcards')");
  ok('?goal=1 갈래가 있다', gq > 0);
  ok('?goal=1 은 본인 게이트 «뒤»(fixcards 와 같은 자리)', fx > 0 && gq > fx);
  const gb = gq > 0 ? bodyFrom(st, gq) : '';
  ok('목표가 없으면 연습을 안 센다(goal ? … : null)', /const practice = goal \? await loadGoalPractice/.test(gb));
  const pd = st.indexOf("path === '/api/parent/dashboard'");
  const pw = st.indexOf('password_not_set', pd);
  const pg = st.indexOf('loadActiveGoal(env.DB, childUid', pd);
  ok('학부모 대시보드: 비밀번호 게이트 «뒤» 에서 목표를 읽는다', pd > 0 && pw > pd && pg > pw);
  ok('학부모 응답에 goal 칸', /\n\s+goal,\n\s+generated_at: Date\.now\(\),/.test(st));
}

/* ── ⑥ 화면 ── */
console.log('⑥ 화면');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
{
  const ui = rd(UI_T);
  const i = ui.indexOf('function goalHtml(c)');
  ok('전제: teacher.html goalHtml', i > 0);
  ok('수업 줄이 goalHtml 을 부른다', /\+\s*goalHtml\(c\)/.test(ui));
  const body = i > 0 ? bodyFrom(ui, i) : '';
  const mk = (lang, DATA) => {
    try {
      const f = new Function('esc', 'T', 'EN', 'DATA', 'return function(c)' + body)(esc, (en, ko) => lang === 'en' ? en : ko, () => lang === 'en', DATA);
      return c => { try { return f(c); } catch (e) { return '__ERR ' + e.message; } };
    } catch (e) { return () => '__ERR ' + e.message; }
  };
  const OPT = { goal_options: [{ key: 'past_tense', ko: '과거형', en: 'Past tense' }, { key: 'describe', ko: '묘사', en: 'Describe' }] };
  const ko = mk('ko', OPT), en = mk('en', OPT), noOpt = mk('ko', {});
  const withG = { kind: 'class', student_uid: 'kim', student_goal: { key: 'describe', ko: '묘사', en: 'Describe', day: 3, days: 28 } };
  const h1 = ko(withG);
  ok('목표가 있으면 이름과 «3/28일째»', /묘사/.test(h1) && /3\/28일째/.test(h1), h1);
  ok('고르개에 보기가 다 있고 지금 목표가 선택돼 있다', (h1.match(/<option value="[a-z_]+"/g) || []).length === 2 && /value="describe" selected/.test(h1));
  ok('영어 화면은 영어 이름', /Describe/.test(en(withG)) && /day 3\/28/.test(en(withG)));
  const h2 = ko({ kind: 'class', student_uid: 'lee' });
  ok('목표가 없으면 «목표 고르기» 고르개', /목표 고르기/.test(h2) && /data-uid="lee"/.test(h2));
  ok('짝: 수업 줄이 아니거나 uid 가 없으면 안 그린다', ko({ kind: 'lms', student_uid: 'x' }) === '' && ko({ kind: 'class' }) === '');
  ok('옛 응답(보기 없음)·목표 없음이면 안 그린다(지어내지 않음)', noOpt({ kind: 'class', student_uid: 'lee' }) === '');
  ok('짝: 보기가 없어도 목표는 보여 준다', /묘사/.test(noOpt(withG)) && !/<select/.test(noOpt(withG)));
  ok('글자를 탈출시킨다(XSS)', !/<img/.test(ko({ kind: 'class', student_uid: '"><img src=x>', student_goal: { key: 'k', ko: '<img>', en: 'x', day: 1, days: 28 } })));
  const si = ui.indexOf("var sig = LANG + '|';");
  const se = si > 0 ? ui.indexOf('if (sig === lastSig) return;', si) : -1;
  const loop = (si > 0 && se > si) ? strip(ui.slice(si, se)) : '';
  ok('다시 그리기 지문에 목표가 들어 있다', /sc\.student_goal/.test(loop));
  ok('목표를 바꿀 때 한 번 묻는다(새 4주가 시작됨)', /cur\.key !== key && !window\.confirm\(/.test(ui));
  ok('저장 응답 때 «지금 화면의» 칸을 다시 찾는다(60초 다시그리기 대비)', /var s2 = curSel\(\) \|\| sel, m2 = curMsg\(\)/.test(ui) && /if \(m2\) m2\.textContent = why; else window\.alert\(why\);/.test(ui));
  ok('저장은 ?part=goal POST · 위임 리스너', /fetch\('\/api\/teacher\/portal\?part=goal', \{ method:'POST'/.test(ui) && /closest\('select\.goal-pick'\)/.test(ui));
}
{
  const js = rd(UI_TODAY);
  const i = js.indexOf('function renderGoal()');
  ok('전제: today-page renderGoal', i > 0);
  const body = i > 0 ? bodyFrom(js, i) : '';
  const els = {};
  const $ = id => (els[id] = els[id] || { hidden: false, innerHTML: 'OLD', textContent: '' });   // 이미 보이던 칸 — «감춘다» 를 실제로 재려고
  const mk = (GOAL, DATA, en) => {
    for (const k in els) delete els[k];
    try {
      new Function('$', 'GOAL', 'DATA', 'T', 'isEn', 'esc', body.slice(1, -1))($, GOAL, DATA, (k, e) => en ? e : k, () => !!en, esc);
      return { ok: true };
    } catch (e) { return { err: e.message }; }
  };
  const G = { ok: true, goal: { key: 'past_tense', ko: '과거형으로 지난 일 이야기하기', en: 'Past', day: 7, days: 28 }, practice: { friend: 4, warmup: null } };
  const r = mk(G, {});
  ok('목표가 있으면 칸을 보이고 이름·「28일 중 7일째」', r.ok && els['td-goal'].hidden === false && /과거형/.test(els['td-goal-card'].innerHTML) && /28일 중 7일째/.test(els['td-goal-card'].innerHTML), JSON.stringify(r) + els['td-goal-card']?.innerHTML);
  ok('세어진 연습만 말한다(웜업 null 은 빼고 «A.i 친구에게 4번 말함» — 단위를 그대로)', /A\.i 친구에게 4번 말함/.test(els['td-goal-card'].innerHTML) && !/웜업/.test(els['td-goal-card'].innerHTML));
  ok('막대 폭 = 7/28 = 25%', /width:25%/.test(els['td-goal-card'].innerHTML));
  mk({ ok: true, goal: null }, {});
  ok('짝: 목표가 없으면 칸째 감춘다', els['td-goal'].hidden === true);
  mk(G, { sample: true });
  ok('맛보기에서는 안 그린다', els['td-goal'].hidden === true);
  mk(null, {});
  ok('못 읽었으면 감춘다', els['td-goal'].hidden === true);
  ok('오늘 계획을 받은 뒤 loadGoal 을 부른다', /loadFix\(u\); loadGoal\(u\);/.test(js));
  ok('?goal=1 로 묻는다', /\/api\/student\/today\?goal=1&uid=/.test(js));
}
{
  const p = rd(UI_P);
  const i = p.indexOf('function pdGoalHtml(g, en)');
  ok('전제: parent pdGoalHtml', i > 0);
  const body = i > 0 ? bodyFrom(p, i) : '';
  let f = null;
  try { f = new Function('esc', 'return function(g, en)' + body)(esc); } catch (e) { ok('pdGoalHtml 만들기', false, e.message); }
  const call = (g, en) => { try { return f(g, en); } catch (e) { return '__ERR ' + e.message; } };
  const h = call({ key: 'past_tense', ko: '과거형', en: 'Past', day: 14, days: 28, set_by_name: 'Kaye', practice: { friend: 2, warmup: 3 } }, false);
  ok('학부모: 목표·「28일 중 14일째」·연습·정한 선생님', /과거형/.test(h) && /28일 중 14일째/.test(h) && /A\.i 친구에게 2번 말함/.test(h) && /웜업 3회/.test(h) && /Kaye/.test(h), h);
  ok('짝: 목표가 없으면 null(카드 감춤)', call(null, false) === null && call({}, false) === null);
  const h2 = call({ key: 'k', ko: '<b>x', en: 'x', day: 1, days: 28, set_by_name: '<img>', practice: { friend: null, warmup: null } }, false);
  ok('학부모: 못 센 연습은 안 그리고 글자를 탈출시킨다', !/A\.i 친구/.test(h2) && !/<img>/.test(h2) && !/<b>x/.test(h2), h2);
  ok('학부모 화면이 d.goal 로 카드를 그린다', /pdGoalHtml\(d\.goal,/.test(p));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
