// 🗓 강사 수업 일지 — 학생 레벨 · 수업 출결(출석/지각/결석) (2026-10-27 사장님 요청 4번)
//
// 글자가 «있는가» 가 아니라 출하 코드를 «실제로 돌려» 답을 본다.
//   A  서버 정본 src/eval-attendance.ts — 타입 제거로 실행
//   B  /api/eval/manual-create 핸들러 — 진짜 SQLite 에 저장해 칸을 읽는다(레벨은 본문이 아니라 학생 원부에서)
//   C  teacher.html openEval — vm 안에서 창을 그리고 칩을 눌러 «보내기» 의 payload 를 본다
//   D  «내가 쓴 일지» — 서버 SQL 의 지연 ALTER 폴백을 진짜 SQLite 로 · 화면 카드를 실제로 그림
// ⚠️ «고른다» 옆에 «안 고른다(모름·대기·없음)» 를 짝으로 둔다 — 짝이 없으면 «언제나 출석» 도 통과한다.
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const rd = (p) => readFileSync(join(CF, p), 'utf8');
let PASS = 0, FAIL = 0;
const FAILS = [];
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; FAILS.push(m); console.log('  ❌ ' + m); } };

/* ── A. 서버 정본 ─────────────────────────────────────────────────────── */
console.log('\n[A] src/eval-attendance.ts — 실제 실행');
const EA = (() => {
  const js = stripTypeScriptTypes(rd('src/eval-attendance.ts')).replace(/^export /gm, '');
  return new Function(js + '\nreturn { EVAL_ATTENDANCE_STATES, normalizeEvalAttendance, normalizeStudentLevel };')();
})();
ok(EA.normalizeEvalAttendance('attended') === 'attended', 'attended 는 그대로');
ok(EA.normalizeEvalAttendance('late') === 'late', 'late 는 그대로');
ok(EA.normalizeEvalAttendance('absent') === 'absent', 'absent 는 그대로');
ok(EA.normalizeEvalAttendance(' LATE ') === 'late', '대소문자·공백은 다듬는다');
for (const bad of ['', null, undefined, 'unknown', 'waiting', 'not_yet', 'present', 'cafe24', 'attended;DROP', 0, {}])
  ok(EA.normalizeEvalAttendance(bad) === null, '목록 밖 값은 null — ' + JSON.stringify(bad));
ok(EA.normalizeStudentLevel('  Lv 5 ') === 'Lv 5', '레벨은 공백을 다듬는다');
ok(EA.normalizeStudentLevel('') === null && EA.normalizeStudentLevel('   ') === null && EA.normalizeStudentLevel(null) === null, '빈 레벨은 null');
ok(EA.normalizeStudentLevel('x'.repeat(99)).length === 40, '너무 긴 레벨은 40자로 자른다');

/* ── B. 저장 핸들러 — 진짜 SQLite ─────────────────────────────────────── */
console.log('\n[B] /api/eval/manual-create — 진짜 SQLite 에 저장');
const ts = createRequire(join(CF, 'package.json'))('typescript');
function load(text, imports = {}) {
  const out = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', out)(exports, (name) => {
    if (!(name in imports)) throw new Error('Unmocked import: ' + name);
    return imports[name];
  });
  return exports;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const scoresMod = load(rd('src/evaluation-scores.ts'));
const lessons = load(rd('src/api-lessons.ts'), {
  './api-dubbing': load(rd('src/api-dubbing.ts'), { './auth-token': {}, './auth-admin': {} }),
  './evaluation-scores': scoresMod,
  './evaluation-records': load(rd('src/evaluation-records.ts'), { './d1-chunk': load(rd('src/d1-chunk.ts')) }),
  './eval-attendance': load(rd('src/eval-attendance.ts')),
  './api-util': { json },
  './site-url': { siteUrl: (p) => 'https://example.invalid' + p },
  './auth-token': {},
  './auth-admin': { checkAdminSession: async () => ({ ok: true }) },
  './api-notify': { sendPushToUser: async () => ({ sent: 0 }) },
}).handleLessonsApi;
function dbFixture(withLevelCol = true) {
  const raw = new DatabaseSync(':memory:');
  raw.exec(withLevelCol ? 'CREATE TABLE students_erp (user_id TEXT, login_id TEXT, level TEXT)'
                        : 'CREATE TABLE students_erp (user_id TEXT, login_id TEXT)');
  const wrap = (sql) => {
    const st = raw.prepare(sql);
    const bound = (args) => ({
      first: async () => st.get(...args) || null,
      all: async () => ({ success: true, results: st.all(...args) }),
      run: async () => { const r = st.run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
      bind: (...next) => bound(next),
    });
    return bound([]);
  };
  return { raw, DB: { prepare: wrap, exec: async (sql) => { raw.exec(sql); return { success: true }; } } };
}
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('No external network allowed'); };
async function save(f, body) {
  const url = new URL('https://example.invalid/api/eval/manual-create');
  const r = await lessons(new Request(url, { method: 'POST', body: JSON.stringify(body) }), url, { DB: f.DB });
  const j = await r.json();
  const row = j.id ? f.raw.prepare('SELECT attendance_status, student_level FROM student_evaluations WHERE id = ?').get(j.id) : null;
  return { status: r.status, j, row };
}
try {
  const f = dbFixture(true);
  f.raw.exec(`INSERT INTO students_erp (user_id, login_id, level) VALUES ('kim01', 'kim01', 'Lv 5'), ('lee02', 'lee02', NULL)`);
  for (const st of ['attended', 'late', 'absent']) {
    const r = await save(f, { student_uid: 'kim01', score_participation: 4, attendance_status: st });
    ok(r.status === 200 && r.row && r.row.attendance_status === st, `강사가 고른 «${st}» 가 그대로 저장된다`);
  }
  const lv = await save(f, { student_uid: 'kim01', attendance_status: 'late', student_level: 'FAKE 99' });
  ok(lv.row && lv.row.student_level === 'Lv 5', '레벨은 본문(FAKE 99)이 아니라 학생 원부(Lv 5)에서 읽어 남긴다');
  const none = await save(f, { student_uid: 'kim01' });
  ok(none.status === 200 && none.row && none.row.attendance_status === null, '안 고르면 null — «출석» 으로 채우지 않는다');
  const bogus = await save(f, { student_uid: 'kim01', attendance_status: 'present' });
  ok(bogus.status === 200 && bogus.row && bogus.row.attendance_status === null, '목록 밖 값(present)은 버리고 저장은 된다');
  const nolv = await save(f, { student_uid: 'lee02', attendance_status: 'absent' });
  ok(nolv.row && nolv.row.student_level === null && nolv.row.attendance_status === 'absent', '레벨이 비었으면 null(지어내지 않음)');
  const ghost = await save(f, { student_uid: 'nobody', attendance_status: 'attended' });
  ok(ghost.row && ghost.row.student_level === null, '원부에 없는 학생도 저장은 되고 레벨은 null');

  const g = dbFixture(false);   // level 칸이 아예 없는 원부 — 조회가 던져도 일지는 저장돼야 한다
  const nocol = await save(g, { student_uid: 'kim01', attendance_status: 'late' });
  ok(nocol.status === 200 && nocol.row && nocol.row.attendance_status === 'late' && nocol.row.student_level === null,
     'students_erp 에 level 칸이 없어도(조회 실패) 일지 저장은 성공 — 그 칸만 null');
} catch (e) {
  ok(false, 'B 절 실행 중 예외: ' + (e && e.stack || e));
} finally {
  globalThis.fetch = oldFetch;
}

/* ── C. 강사 화면 일지 창 — vm 에서 실제로 그리고 누른다 ─────────────── */
console.log('\n[C] teacher.html openEval — 창을 그리고 칩을 눌러 보낸다');
const HTML = rd('public/teacher.html');
// 함수 하나를 «중괄호 짝» 으로 잘라 낸다 — 다음 함수 이름까지 자르면 사이의 딴 코드가 딸려 온다.
// 문자열·줄주석 안의 중괄호는 세지 않는다.
function fn(name) {
  const a = HTML.indexOf('  function ' + name + '(');
  if (a < 0) throw new Error('function not found: ' + name);
  let i = HTML.indexOf('{', a), depth = 0, q = null;
  for (; i < HTML.length; i++) {
    const ch = HTML[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '/' && HTML[i + 1] === '/') { i = HTML.indexOf('\n', i); continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return HTML.slice(a, i + 1);
  }
  throw new Error('unbalanced: ' + name);
}
const decode = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
function makeEl(attrs, cls) {
  return {
    className: cls, _a: Object.assign({}, attrs),
    getAttribute(k) { return k in this._a ? this._a[k] : null; },
    setAttribute(k, v) { this._a[k] = String(v); },
  };
}
// 창 안 «출결 칩» 만 진짜 요소로 만든다 — 나머지 칸은 빈 값 상자(기존 하니스와 같은 방식).
function makeMask() {
  const nodes = new Map();
  let atts = [];
  const attBox = {
    onclick: null,
    querySelectorAll: (s) => (s === '[data-att]' ? atts : []),
    querySelector: (s) => (s === '[data-att].on' ? (atts.find((b) => /\bon\b/.test(b.className)) || null) : null),
  };
  const mask = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(h) {
      this._html = h;
      atts = [...h.matchAll(/<button type="button" class="(tchip(?: on)?)" data-att="([a-z]+)" aria-pressed="(true|false)">/g)]
        .map((m) => makeEl({ 'data-att': m[2], 'aria-pressed': m[3] }, m[1]));
    },
    querySelector(s) {
      if (s === '#ev-att') return attBox;
      if (!nodes.has(s)) nodes.set(s, { value: '', disabled: false, hidden: true, querySelector: () => null, querySelectorAll: () => [] });
      return nodes.get(s);
    },
    querySelectorAll: () => [],
    tap(key) { const b = atts.find((x) => x.getAttribute('data-att') === key); attBox.onclick({ target: { closest: () => b } }); },
    onChips: () => atts.filter((b) => /\bon\b/.test(b.className)).map((b) => b.getAttribute('data-att')),
    pressed: () => atts.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-att')),
  };
  return mask;
}
let payload = null, lang = 'en', mask = null;
const body = { appendChild(m) { m.parentNode = body; }, removeChild(m) { m.parentNode = null; } };
const ctx = {
  Date, Number, String, AbortSignal, Event, JSON,
  window: { addEventListener() {} },
  T: (en, ko) => (lang === 'en' ? en : ko), EN: () => lang === 'en',
  esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  hhmm: (ts) => { const d = new Date(ts + 9 * 3600 * 1000); return d.getUTCHours() + ':' + ('0' + d.getUTCMinutes()).slice(-2); },
  now: () => Date.parse('2026-10-27T13:00:00+09:00'),
  document: { addEventListener() {}, createElement: () => (mask = makeMask()), body, dispatchEvent() {} },
  DATA: { today: '2026-10-27', me: { username: 'teacher1', name: 'Teacher One' }, classes: [] },
  WK_DATA: null, WK_READ: 0, MY: {}, lastSig: null,
  stuLabelText: (c) => c.student_name, MangoiClassDisplay: { range: () => '12:30pm – 12:50pm' },
  bandChip: () => '', chip: () => '', stars: () => '', pick: () => null,
  freshClass: (c) => c, renderClasses() {}, renderWeek() {},
  fetch: async (url, opts) => { payload = { url, body: JSON.parse(opts.body) }; return { ok: true, json: async () => ({ ok: true, id: 1 }) }; },
};
vm.createContext(ctx);
vm.runInContext(fn('openEval'), ctx);
const START = Date.parse('2026-10-27T12:30:00+09:00');
const base = { kind: 'class', student_uid: 'kim01', student_name: 'Kim', room_id: 'class-9-20261027', class_date: '2026-10-27', start_ts: START };
async function openAndSend(c, taps = []) {
  payload = null;
  ctx.openEval(c);
  const html = mask.innerHTML, preOn = mask.onChips(), prePressed = mask.pressed();
  for (const t of taps) mask.tap(t);
  mask.querySelector('#ev-ko').value = '오늘 수업에 잘 참여했습니다.';
  mask.querySelector('#ev-en').value = 'Participated well today.';
  await mask.querySelector('#ev-ok').onclick.call({ disabled: false, textContent: '' });
  await new Promise((r) => setImmediate(r));
  return { html, preOn, prePressed, sent: payload && payload.body };
}
try {
  // C-1 입장 기록 판정이 셋 중 하나면 미리 고르고 그대로 보낸다
  const cases = [
    ['attended', { state: 'attended', at: START + 60000, late_min: 0 }, /joined 12:31 \(on time\)/],
    ['late', { state: 'late', at: START + 8 * 60000, late_min: 8 }, /joined 12:38 \(\+8 min\)/],
    ['absent', { state: 'absent', at: null, late_min: null }, /no entry/],
  ];
  for (const [st, att, hintRe] of cases) {
    const r = await openAndSend({ ...base, attendance: att });
    ok(r.preOn.length === 1 && r.preOn[0] === st, `입장 기록 «${st}» → 그 칩 하나만 미리 켜짐`);
    ok(r.prePressed.length === 1 && r.prePressed[0] === st, `«${st}» 칩은 aria-pressed=true(화면낭독기도 안다)`);
    ok(hintRe.test(decode(r.html)), `«${st}» 근거 안내가 보인다 (${hintRe})`);
    ok(r.sent && r.sent.attendance_status === st, `손대지 않고 보내면 attendance_status=${st}`);
    ok(payload && payload.url === '/api/eval/manual-create', '보내는 곳은 /api/eval/manual-create');
  }
  // C-2 판정이 없거나 «모름·대기·시작 전» 이면 아무것도 고르지 않는다(짝)
  for (const att of [undefined, null, { state: 'unknown' }, { state: 'waiting' }, { state: 'not_yet' }, { state: 'cafe24' }, { state: 'postponed' }]) {
    const r = await openAndSend({ ...base, attendance: att });
    ok(r.preOn.length === 0, '입장 판정 ' + JSON.stringify(att && att.state) + ' → 미리 고르지 않음');
    ok(r.sent && !('attendance_status' in r.sent), '  그대로 보내면 attendance_status 를 안 싣는다(서버 null)');
    ok(/please choose/.test(decode(r.html)), '  «직접 골라 주세요» 안내');
  }
  // C-3 강사가 바꾸면 바꾼 값이 나간다 · 켜진 것을 다시 누르면 «고르지 않음»
  const chg = await openAndSend({ ...base, attendance: { state: 'late', at: START + 9 * 60000, late_min: 9 } }, ['absent']);
  ok(chg.sent && chg.sent.attendance_status === 'absent', '지각 → 결석으로 바꾸면 absent 가 나간다');
  ok(mask.onChips().join() === 'absent' && mask.pressed().join() === 'absent', '바꾼 뒤 켜진 칩·aria-pressed 는 결석 하나');
  const off = await openAndSend({ ...base, attendance: { state: 'attended', at: START, late_min: 0 } }, ['attended']);
  ok(off.sent && !('attendance_status' in off.sent), '켜진 칩을 다시 누르면 고르지 않음 → 안 싣는다');
  const pickNew = await openAndSend({ ...base }, ['late']);
  ok(pickNew.sent && pickNew.sent.attendance_status === 'late', '판정이 없을 때 강사가 «지각» 을 고르면 late');
  // C-4 레벨 줄 — 값 · 미등록 · 이스케이프
  const lv = await openAndSend({ ...base, level: 'Lv 5' });
  ok(/Student level<\/b>: Lv 5/.test(lv.html), '학생 레벨(Lv 5)이 창에 보인다');
  const nolv = await openAndSend({ ...base });
  ok(/Student level<\/b>: Not set/.test(nolv.html), '레벨이 없으면 «Not set»');
  const xss = await openAndSend({ ...base, level: '<img src=x onerror=1>' });
  ok(!/<img src=x/.test(xss.html) && /&lt;img src=x/.test(xss.html), '레벨 값은 이스케이프된다');
  // C-5 한국어 화면 — 라벨이 EN/KO 두 벌
  lang = 'ko';
  const ko = await openAndSend({ ...base, level: 'Lv 5', attendance: { state: 'late', at: START + 4 * 60000 + 6 * 60000, late_min: 10 } });
  ok(/수업 출결/.test(ko.html) && /출석/.test(ko.html) && /지각/.test(ko.html) && /결석/.test(ko.html), '한국어 화면: 수업 출결·출석·지각·결석');
  ok(/학생 레벨<\/b>: Lv 5/.test(ko.html), '한국어 화면: 학생 레벨');
  ok(/입장 기록: 12:40 입장 \(\+10분\)/.test(decode(ko.html)), '한국어 근거 안내: «입장 기록: 12:40 입장 (+10분)»');
  lang = 'en';
  const en = await openAndSend({ ...base });
  ok(/Class status/.test(en.html) && /Attended/.test(en.html) && /Late/.test(en.html) && /Absent/.test(en.html), '영어 화면: Class status·Attended·Late·Absent');
  // C-6 괄호 짝 — 창에 보이는 글자 조각마다 «(» 와 «)» 수가 같다(2026-10-28 「수준 그룹 (눌러서 정하거나 바꿔요」 닫는 괄호 누락).
  //   조각을 못 뽑으면 아래 검사가 빈손으로 통과하므로, 그 라벨을 실제로 읽었는지를 짝으로 본다.
  for (const [lg, h, want] of [['한국어', ko.html, /수준 그룹/], ['영어', en.html, /Level group/]]) {
    const texts = [...h.matchAll(/>([^<]+)</g)].map((m) => decode(m[1]).trim()).filter(Boolean);
    const bad = texts.filter((t) => (t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length);
    ok(texts.some((t) => want.test(t)), lg + ' 화면: 글자 조각을 실제로 읽었다(수준 그룹 라벨 포함)');
    ok(bad.length === 0, lg + ' 화면: 모든 글자의 괄호 짝이 맞다' + (bad.length ? ' — ' + bad.join(' | ') : ''));
  }
} catch (e) {
  ok(false, 'C 절 실행 중 예외: ' + (e && e.stack || e));
}

/* ── D. «내가 쓴 일지» ───────────────────────────────────────────────── */
console.log('\n[D] 내가 쓴 일지 — 서버 SQL 폴백 · 카드 그리기');
try {
  const T = rd('src/api-teacher.ts');
  const a = T.indexOf('const myEvalsSql = (extra: string) =>');
  const b = T.indexOf('`;', a);
  ok(a > 0 && b > a, 'myEvalsSql 를 소스에서 찾았다');
  const builder = new Function('ors', 'return ' + T.slice(a, b + 1).replace('const myEvalsSql = (extra: string) =>', '(extra) =>'))(['(teacher_uid = ? COLLATE NOCASE)']);
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE student_evaluations (id INTEGER PRIMARY KEY, student_name TEXT, lesson_date TEXT, score_overall REAL, note_en TEXT, note_ko TEXT,
           teacher_comment TEXT, strengths TEXT, room_id TEXT, parent_notified INTEGER, viewed_by_parent INTEGER, created_at INTEGER, teacher_uid TEXT, teacher_name TEXT)`);
  db.exec(`INSERT INTO student_evaluations (student_name, lesson_date, note_en, room_id, created_at, teacher_uid) VALUES ('Kim','2026-10-27','ok','r',1,'teacher1')`);
  let threw = false; try { db.prepare(builder(', attendance_status, student_level')).all('teacher1'); } catch { threw = true; }
  ok(threw, '배포 직후(칸 없음)에는 새 칸 SQL 이 실제로 던진다 — 폴백이 필요한 이유');
  ok(db.prepare(builder('')).all('teacher1').length === 1, '옛 칸만의 폴백 SQL 은 그대로 읽힌다');
  db.exec(`ALTER TABLE student_evaluations ADD COLUMN attendance_status TEXT`);
  db.exec(`ALTER TABLE student_evaluations ADD COLUMN student_level TEXT`);
  db.exec(`UPDATE student_evaluations SET attendance_status='late', student_level='Lv 5'`);
  const rows = db.prepare(builder(', attendance_status, student_level')).all('teacher1');
  ok(rows.length === 1 && rows[0].attendance_status === 'late' && rows[0].student_level === 'Lv 5', '칸이 생긴 뒤에는 출결·레벨을 함께 읽는다');
  const wired = /prepare\(myEvalsSql\(', attendance_status, student_level'\)\)[\s\S]{0,160}\.catch\(\(\) => env\.DB\.prepare\(myEvalsSql\(''\)\)/.test(T);
  ok(wired, '실제 배선: 새 칸 SQL 이 실패하면 옛 칸 SQL 로 한 번 더 읽는다');

  // 화면 카드
  let painted = '';
  const ctx2 = {
    T: (en, ko) => (lang === 'en' ? en : ko), EN: () => lang === 'en', esc: ctx.esc,
    fill: (id, h) => { painted = h; },
    MY: { myev: { items: [
      { student_name: 'Kim', lesson_date: '2026-10-27', attendance_status: 'late', student_level: 'Lv 5', score_overall: 4, note_en: 'ok' },
      { student_name: 'Lee', lesson_date: '2026-10-26', attendance_status: null, student_level: null, note_en: 'old' },
      { student_name: 'Park', lesson_date: '2026-10-25', attendance_status: 'bogus', note_en: 'x' },
    ] } },
  };
  vm.createContext(ctx2);
  vm.runInContext(fn('paintMyEvals') + '\npaintMyEvals();', ctx2);
  const parts = painted.split('<div class="draft"');
  ok(/⏰ Late/.test(parts[1]) && /Level: Lv 5/.test(parts[1]), '카드: 출결(⏰ Late)·레벨(Level: Lv 5)이 보인다');
  ok(!/Attended|Late|Absent|Level:/.test(parts[2]), '카드: 옛 일지(값 없음)에는 아무것도 안 그린다');
  ok(!/bogus|Attended|Late|Absent/.test(parts[3]), '카드: 모르는 값은 그리지 않는다');
  lang = 'ko'; vm.runInContext('paintMyEvals();', ctx2); lang = 'en';
  ok(/⏰ 지각/.test(painted) && /레벨: Lv 5/.test(painted), '카드 한국어: ⏰ 지각 · 레벨: Lv 5');
} catch (e) {
  ok(false, 'D 절 실행 중 예외: ' + (e && e.stack || e));
}

/* ── E. 이 화면의 계약 ───────────────────────────────────────────────── */
console.log('\n[E] 화면 계약');
{
  const icons = [...fn('openEval').matchAll(/attChip\('[a-z]+',\s*'([^']+)'/g)].map((m) => m[1]);
  ok(icons.length === 3 && icons.every((x) => ['✅', '⏰', '❌'].includes(x)),
     '출결 칩 아이콘은 Unicode 6 의 ✅⏰❌ 뿐(Win10 두부 금지 — 1-4) · ' + icons.join(''));
}
ok(/\.tchip\{[\s\S]{0,220}min-height:44px/.test(HTML), '출결 칩도 .tchip — 손가락 크기 44px 이상');

console.log('\n──────────────────────────────────────────');
console.log(`  결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   - ' + f)); }
process.exit(FAIL ? 1 : 0);
