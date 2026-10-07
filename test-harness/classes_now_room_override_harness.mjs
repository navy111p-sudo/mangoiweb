/**
 * Booked-class observation must resolve the same date-specific room as participants.
 * Real production route/body and helpers, real local SQLite, actual adm-s1 Observe
 * wiring in a Node VM. No browser, production DB, HTTP, notifications or WebRTC.
 * Actor/session identity is fixture-provided; actual scope SQL is executed.
 * Run from repository root: node test-harness/classes_now_room_override_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const ROOT = process.env.CNRO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const read = p => readFileSync(join(CF, p), 'utf8');
const ts = createRequire(join(CF, 'package.json'))('typescript');
let pass = 0, fail = 0;
function check(name, value, detail) {
  if (value) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))); }
}
function parse(source) { return ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true); }
function find(tree, predicate) {
  let found;
  const visit = n => { if (found) return; if (predicate(n)) { found = n; return; } ts.forEachChild(n, visit); };
  visit(tree);
  if (!found) throw new Error('Required production AST node missing');
  return found;
}
function fn(source, name) {
  const tree = parse(source);
  return find(tree, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(tree);
}
function transpile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
function compile(source, deps = {}) {
  const exports = {};
  new Function('exports', 'require', transpile(source))(exports, key => {
    if (!(key in deps)) throw new Error('Unexpected production dependency: ' + key);
    return deps[key];
  });
  return exports;
}
const chunks = compile(read('src/d1-chunk.ts'));
const start = compile(read('src/class-start-date.ts'));
const mirror = compile(fn(read('src/c24-mirror.ts'), 'mirrorNoteClassId'));
const classesNow = compile(read('src/classes-now.ts'), { './c24-mirror': mirror, './class-start-date': start });
const overrides = compile(read('src/class-room-override.ts'), { './d1-chunk': chunks });
const postponed = compile(read('src/class-postponed.ts'));
const groupRoom = compile(read('src/group-room.ts'), { './d1-chunk': chunks });   // 👥 합반 대표 방(2026-10-07)
const scopes = compile(read('src/scope.ts'), {
  './d1-chunk': chunks,
  './auth-admin': { checkAdminSession() { throw new Error('No live authentication in fixtures'); } },
});
const api = process.env.CNRO_API_SRC ? readFileSync(process.env.CNRO_API_SRC, 'utf8') : read('src/api-admin.ts');
const apiTree = parse(api);
const route = find(apiTree, n => ts.isIfStatement(n)
  && n.expression.getText(apiTree) === "method === 'GET' && path === '/api/admin/classes-now'").getText(apiTree);
const routeJs = transpile('async function runRoute(){' + route + '}');
const base = { id: 701, user_id: 'fixture-student', student_name: 'Fixture Student', scheduled_date: '2026-10-05',
  day_of_week: null, start_time: '10:00', duration_min: 30, status: 'active', teacher_id: '2',
  source: 'fixture-post-move', notes: '', starts_on: null, class_type: 'regular', franchise: 'BR-A', shop_name: 'SHOP-A' };
const millis = s => Date.parse(s + '+09:00');
const now = millis('2026-10-05T10:05:00');
const oldRoom = 'class-701-20261005', newRoom = 'meet-fixture-701';
const override = { schedule_id: 701, ymd: '20261005', room_id: newRoom };
const attendance = (room_id, joined_at = now - 300000, last_seen_at = now) => ({
  room_id, user_id: base.user_id, username: 'Fixture Student', joined_at, left_at: null, last_seen_at,
});

async function fixture({ rows = [base], roomOverrides = [override], live = [], at = now,
  scope = { type: 'hq', value: null }, teacher = false, failOverrides = false } = {}) {
  const sq = new DatabaseSync(':memory:');
  // Fixtures only: production SQL executes against isolated schema; no external DB handle exists.
  sq.exec(`CREATE TABLE class_schedules(id INTEGER PRIMARY KEY,user_id TEXT,student_name TEXT,class_type TEXT,
    source TEXT,notes TEXT,day_of_week TEXT,scheduled_date TEXT,start_time TEXT,duration_min INTEGER,status TEXT,teacher_id TEXT,starts_on TEXT);
    CREATE TABLE teachers(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE students_erp(user_id TEXT PRIMARY KEY,korean_name TEXT,english_name TEXT,franchise TEXT,shop_name TEXT);
    CREATE TABLE attendance(room_id TEXT,user_id TEXT,username TEXT,status TEXT,joined_at INTEGER,left_at INTEGER,last_seen_at INTEGER,teacher_uid TEXT);
    CREATE TABLE class_substitutions(sub_date TEXT,schedule_id INTEGER,substitute_teacher_id TEXT,status TEXT);
    CREATE TABLE class_room_override(schedule_id INTEGER,ymd TEXT,room_id TEXT,note TEXT,created_by TEXT,created_at INTEGER,PRIMARY KEY(schedule_id,ymd));`);
  sq.prepare('INSERT INTO teachers VALUES (?,?)').run(2, 'Fixture Teacher');
  for (const r of rows) {
    sq.prepare('INSERT INTO class_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...[
      r.id, r.user_id, r.student_name, r.class_type, r.source, r.notes, r.day_of_week, r.scheduled_date,
      r.start_time, r.duration_min, r.status, r.teacher_id, r.starts_on].map(v => v ?? null));
    sq.prepare('INSERT OR IGNORE INTO students_erp VALUES (?,?,?,?,?)').run(r.user_id, r.student_name, null, r.franchise, r.shop_name);
  }
  for (const r of live) sq.prepare('INSERT INTO attendance VALUES (?,?,?,?,?,?,?,?)')
    .run(r.room_id, r.user_id, r.username, 'present', r.joined_at, r.left_at ?? null, r.last_seen_at, '2');
  for (const r of roomOverrides) sq.prepare('INSERT INTO class_room_override VALUES (?,?,?,?,?,?)')
    .run(r.schedule_id, r.ymd, r.room_id, 'fixture', 'fixture-hq', at);
  const queries = [], attemptedWrites = [];
  const statement = (sql, args = []) => ({
    bind: (...binds) => statement(sql, binds),
    async all() {
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error('Only SELECT is permitted');
      queries.push({ sql, args });
      if (failOverrides && sql.includes('FROM class_room_override')) throw new Error('Fixture override read failure');
      return { results: sq.prepare(sql).all(...args), success: true };
    },
    async run() { attemptedWrites.push(sql); throw new Error('Fixture forbids route writes'); },
  });
  const DB = { prepare: sql => statement(sql), async exec(sql) { attemptedWrites.push(sql); throw new Error('Fixture forbids route DDL'); } };
  class FixedDate extends Date { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } }
  const warnings = [];
  const context = {
    Date: FixedDate, console: { warn: (...a) => warnings.push(a.map(String).join(' ')) },
    request: {}, env: { DB }, method: 'GET', path: '/api/admin/classes-now',
    getAdminActor: async () => ({ isTeacher: teacher, role: teacher ? 'teacher' : 'hq' }),
    forbiddenTeacherBody: () => ({ ok: false, error: 'forbidden_teacher' }),
    getScope: async () => scope, scopeStudentCond: scopes.scopeStudentCond,
    loadCafe24TeacherMap: async () => new Map(), ensureStartsOnColumn: async () => true,
    startsOnSel: start.startsOnSel,
    admDowMatches: () => { throw new Error('Dated fixtures must not need weekday matching'); },
    buildMangoiClassesNow: classesNow.buildMangoiClassesNow, mergeClassesNow: classesNow.mergeClassesNow,
    classesNowScanDates: classesNow.classesNowScanDates, liveOverlaps: classesNow.liveOverlaps,
    applyRoomOverrides: overrides.applyRoomOverrides, kstYmd: overrides.kstYmd,
    isPostponedOccurrence: postponed.isPostponedOccurrence,
    loadGroupLeadsForIds: groupRoom.loadGroupLeadsForIds, leadIdOf: groupRoom.leadIdOf,
    json: (body, status = 200) => ({ body, status }),
  };
  vm.createContext(context); vm.runInContext(routeJs, context);
  const response = await context.runRoute();
  return { response, queries, attemptedWrites, warnings, DB, close: () => sq.close() };
}

async function observe(response) {
  const nodes = {}, posts = [], opened = [];
  const el = id => (nodes[id] ||= { value: '', textContent: '', innerHTML: '', style: {}, focus() {} });
  const sandbox = {
    window: { adminLang: 'en', addEventListener() {}, mangoiOpenTab: url => opened.push(url) },
    document: { getElementById: el, addEventListener() {} },
    localStorage: { getItem: k => k === 'mangoi_admin_session' ? JSON.stringify({ uid: 'fixture-hq' }) : null },
    location: { origin: 'https://fixture.invalid' }, console, setTimeout() { return 0; }, alert() {}, confirm: () => false,
    async fetch(url, opts) {
      if (String(url).startsWith('/api/active-rooms')) return { ok: true, json: async () => [] };
      if (String(url).startsWith('/api/admin/classes-now')) return { ok: true, json: async () => response.body };
      if (url === '/api/admin/ghost/start') {
        posts.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ observe_sig: 'fixture-token' }) };
      }
      throw new Error('Unexpected fixture UI request ' + url);
    },
  };
  vm.createContext(sandbox); vm.runInContext(read('public/js/adm-s1.js'), sandbox);
  await sandbox.window.ghLoadLive();
  const html = nodes['gh-live-list'].innerHTML;
  const button = html.match(/ghQuickObserve\(decodeURIComponent\('([^']+)'\)\)/);
  if (button) await sandbox.window.ghQuickObserve(decodeURIComponent(button[1]));
  return { html, selected: button ? decodeURIComponent(button[1]) : null, posts, opened };
}

console.log('① Same resolved room, connection state, actual Observe wiring');
{
  const f = await fixture({ live: [attendance(newRoom)] });
  const c = f.response.body.classes?.[0];
  check('real route returns one successful class', f.response.status === 200 && f.response.body.ok && f.response.body.classes.length === 1, f.response);
  check('admin projection resolves meeting override', c?.room_id === newRoom, c);
  check('live presence matches resolved room', c?.connected === true && c.live_room === newRoom, c);
  check('aggregate connected count uses resolved room', f.response.body.counts?.connected === 1);
  const student = [{ schedule_id: base.id, room_id: oldRoom }], teacher = [{ schedule_id: base.id, room_id: oldRoom }];
  await overrides.applyRoomOverrides(f.DB, student, override.ymd); await overrides.applyRoomOverrides(f.DB, teacher, override.ymd);
  check('admin, student and teacher resolver results match', c?.room_id === student[0].room_id && student[0].room_id === teacher[0].room_id);
  const ui = await observe(f.response);
  check('production UI renders an Observe button for resolved room', ui.selected === newRoom, ui);
  check('real Observe handler sends resolved room to mock ghost/start', ui.posts.length === 1 && ui.posts[0].room_id === newRoom);
  check('real Observe handler opens resolved room URL', ui.opened.length === 1 && new URL(ui.opened[0]).searchParams.get('observe') === newRoom);
  const core = { _esc: s => String(s ?? '') }; vm.createContext(core);
  vm.runInContext(fn(read('public/js/adm-core.js'), '_schedRowsHtml'), core);
  const coreHtml = core._schedRowsHtml(f.response.body.classes, true, true);
  check('other admin booked row embeds resolved room', coreHtml.includes('data-room="' + newRoom + '"') && !coreHtml.includes('data-room="' + oldRoom + '"'));
  check('handler and resolver never write to database', f.attemptedWrites.length === 0, f.attemptedWrites);
  f.close();
}
console.log('② Negative controls preserve honest room and presence state');
for (const [name, input, expectedRoom, connected] of [
  ['old-room attendance is not presence in override room', { live: [attendance(oldRoom)] }, newRoom, false],
  ['override without live attendance stays disconnected', {}, newRoom, false],
  ['out-of-window live attendance stays disconnected', { live: [attendance(newRoom, now - 7200000, now - 3600000)] }, newRoom, false],
  ['no override preserves original room and attendance', { roomOverrides: [], live: [attendance(oldRoom)] }, oldRoom, true],
  ['invalid non-meet override keeps original room', { roomOverrides: [{ ...override, room_id: 'class-999-20261005' }], live: [attendance(oldRoom)] }, oldRoom, true],
  ['previous-date override does not leak into today', { roomOverrides: [{ ...override, ymd: '20261004' }], live: [attendance(oldRoom)] }, oldRoom, true],
  ['override read failure falls back without hiding class', { failOverrides: true, live: [attendance(oldRoom)] }, oldRoom, true],
]) {
  const f = await fixture(input), c = f.response.body.classes?.[0];
  check(name, f.response.status === 200 && c?.room_id === expectedRoom && c.connected === connected && c.live_room === (connected ? expectedRoom : null), f.response);
  check(name + ': aggregate count matches', f.response.body.counts?.connected === Number(connected));
  f.close();
}
console.log('③ Cross-midnight occurrence dates and isolated group lookups');
{
  const previous = { ...base, id: 801, user_id: 'fixture-prev', scheduled_date: '2026-10-04', start_time: '23:50' };
  const current = { ...base, id: 802, user_id: 'fixture-today', start_time: '00:00' };
  const f = await fixture({ at: millis('2026-10-05T00:03:00'), rows: [previous, current],
    roomOverrides: [{ schedule_id: 801, ymd: '20261004', room_id: 'meet-prev' }, { schedule_id: 802, ymd: '20261005', room_id: 'meet-today' }],
    live: [attendance('meet-prev', millis('2026-10-04T23:50:00'), millis('2026-10-05T00:03:00'))] });
  const c = f.response.body.classes || [], queries = f.queries.filter(q => q.sql.includes('FROM class_room_override'));
  check('yesterday and today both remain in current window', c.length === 2, c);
  check('each occurrence resolves its own date override', c.find(x => x.schedule_id === 801)?.room_id === 'meet-prev' && c.find(x => x.schedule_id === 802)?.room_id === 'meet-today', c);
  check('override queries are partitioned by occurrence date/id', queries.length === 2 && queries.some(q => q.args[0] === '20261004' && q.args.slice(1).join() === '801') && queries.some(q => q.args[0] === '20261005' && q.args.slice(1).join() === '802'), queries);
  check('cross-midnight presence matches only connected occurrence', c.find(x => x.schedule_id === 801)?.connected === true && c.find(x => x.schedule_id === 802)?.connected === false);
  f.close();
}
{
  const f = await fixture({ at: millis('2026-10-04T23:55:00'), rows: [{ ...base, start_time: '00:00' }] });
  check('tomorrow occurrence resolves tomorrow override before midnight', f.response.body.classes?.[0]?.room_id === newRoom, f.response);
  f.close();
}
console.log('④ Real scope SQL remains effective before override lookup');
{
  const other = { ...base, id: 702, user_id: 'outside-student', franchise: 'BR-B', shop_name: 'SHOP-B' };
  for (const scope of [{ type: 'branch', value: 'BR-A' }, { type: 'agency', value: 'SHOP-A' }]) {
    const f = await fixture({ rows: [base, other], scope, roomOverrides: [override, { ...override, schedule_id: 702, room_id: 'meet-outside' }] });
    const c = f.response.body.classes || [], queries = f.queries.filter(q => q.sql.includes('FROM class_room_override'));
    check(scope.type + ': outside row is excluded from list and counts', c.length === 1 && c[0].schedule_id === 701 && f.response.body.counts?.mangoi === 1, f.response);
    check(scope.type + ': override query never receives outside schedule ID', queries.length === 1 && queries[0].args.slice(1).every(id => Number(id) === 701), queries);
    f.close();
  }
  const blocked = await fixture({ teacher: true });
  check('teacher actor remains blocked before any query', blocked.response.status === 403 && blocked.queries.length === 0);
  blocked.close();
}
console.log('⑤ Reminder link is generic; room ID remains a bookkeeping key');
{
  const source = read('src/lesson-reminder.ts'), tree = parse(source);
  const sweep = find(tree, n => ts.isFunctionDeclaration(n) && n.name?.text === 'runLessonReminderSweep');
  const expr = find(sweep, n => ts.isVariableDeclaration(n) && n.name.getText(tree) === 'msg').initializer.getText(tree);
  const site = compile(read('src/site-url.ts'));
  const message = new Function('siteUrl', 'c', 'name', 'hhmm', 'return ' + expr)(site.siteUrl, { room_id: oldRoom, mins_left: 30 }, 'Fixture Student', '10:00');
  check('actual reminder template retains generic entry URL', message.includes(site.siteUrl('/?go=videocall')));
  check('actual reminder template encodes no obsolete room target', !/vc_room=|observe=|room_id=|class-701|meet-fixture/.test(message));
}
console.log(`\nClasses-now room override: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
