// -*- coding: utf-8 -*-
// 🧪 «이 시간 가능한 강사» 카드에 그날 총 수업 수 + 적은 순 정렬 (2026-10-13 매니저 Karl 제안 · 사장님 승인)
//   실행:  node test-harness/move_teacher_day_count_harness.mjs
//
//   [무엇을 지키나] 결석 강사의 수업을 대체 강사에게 «고르게» 나누려면 그날 각 강사가 몇 회 하는지 보여야 한다.
//   [실제로 하는 일 — 문자열 검사만 하지 않는다]
//     A. src/enroll-ops.ts 의 teacherDayCounts·moveCandidatesFor 를 소스에서 오려 내 «진짜 SQLite» 위에서 돌린다
//        (날짜 지정·반복·그룹·취소·자리표시·대체·시작 전·그 주만 빠짐 — «센다» 와 «안 센다» 를 짝으로).
//     B. 정렬 — dayCount 를 켜면 적은 순, 안 켜면(학생 경로) 예전 이름순(짝).
//     C. 화면 카드(class-move-modal.js)를 오려 내 돌려 «그날 N회» 가 그려지는가, null 이면 안 그리는가(짝).
//     D. 배선 — 관리자 경로만 dayCount 를 켜고, 학생 경로(api-mango.ts)는 안 켠다 · ?v= 일치.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const SELF = fileURLToPath(import.meta.url);
if (!process.env.__MTDC_CHILD) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', SELF], { encoding: 'utf8', env: { ...process.env, __MTDC_CHILD: '1' } });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exit(r.status == null ? 1 : r.status);
}

const ROOT = join(dirname(SELF), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const OPS = readFileSync(process.env.MTDC_OPS_SRC || join(SRC, 'enroll-ops.ts'), 'utf8');
const MANGO = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
const MODAL = readFileSync(process.env.MTDC_MODAL_SRC || join(ROOT, 'cloudflare-deploy/public/js/class-move-modal.js'), 'utf8');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) PASS++; else FAIL++;
  console.log(`  ${cond ? '✅' : '❌'} ${name}${!cond && extra ? '  → ' + extra : ''}`);
}

function braceBlock(src, openIdx) {
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}
/** 최상위 선언을 머리부터 «줄 맨 앞의 }» 까지 자른다 — 이 두 파일의 최상위 함수는 전부 그 모양으로 끝난다.
 *  (괄호·꺾쇠를 세면 화살표 함수의 => 와 정규식 안 / 에 흔들려 엉뚱한 곳까지 먹었다 — 실제로 밟음.) */
function cutDecl(src, head) {
  const at = src.indexOf(head);
  if (at < 0) return '';
  const lineStart = src.lastIndexOf('\n', at) + 1;
  const indent = src.slice(lineStart, at);
  const end = src.indexOf('\n' + indent + '}', at);
  return end < 0 ? '' : src.slice(at, end + indent.length + 2);
}

console.log('\n── A. teacherDayCounts (진짜 SQLite)');
const pieces = {
  map: (() => { const i = OPS.indexOf('const ENROLL_DOW_MAP'); return i < 0 ? '' : OPS.slice(i, OPS.indexOf('};', i) + 2); })(),
  dowList: cutDecl(OPS, 'export function enrollDowList('),
  subDow: cutDecl(OPS, 'function subScheduleDow('),
  notPh: (OPS.match(/^const NOT_PLACEHOLDER = .*;$/m) || [''])[0],
  intervals: cutDecl(OPS, 'export async function teacherIntervalsOn('),   // 2026-10-13: teacherDayCounts 가 이것을 세어 «몇 회» 를 만든다(행 읽기 정본)
  counts: cutDecl(OPS, 'export async function teacherDayCounts('),
  move: cutDecl(OPS, 'export async function moveCandidatesFor('),
};
for (const [k, v] of Object.entries(pieces)) check('전제: 소스에서 오려 냈다 — ' + k, v.length > 20);

const startDateUrl = pathToFileURL(join(SRC, 'class-start-date.ts')).href;
const modSrc = `import { recurStartedOn, ensureStartsOnColumn, startsOnSel } from '${startDateUrl}';
const DEFAULT_CLASS_MINUTES = 20;
function enrollTimeToMin(t: any) { const m = /^(\\d{1,2}):(\\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; }
async function findScheduleConflicts(env: any, q: any) { return { has: false, cap: false, student: [] }; }
async function subOverlayBusyIds() { return new Map(); }
function subOverlayHasOverlap() { return false; }
async function unavailabilityRows() { return []; }
function teachersOffAt() { return new Set(); }
${pieces.map}
${pieces.notPh}
${pieces.dowList}
${pieces.subDow}
${pieces.intervals}
${pieces.counts}
${pieces.move}
`;
const dir = mkdtempSync(join(tmpdir(), 'mtdc-'));
const modFile = join(dir, 'mod.ts');
writeFileSync(modFile, modSrc);
let M = null;
try { M = await import(pathToFileURL(modFile).href); } catch (e) { console.log('   (불러오기 실패: ' + e.message + ')'); }
check('전제: 오려 낸 정본을 불러왔다', !!(M && M.teacherDayCounts && M.moveCandidatesFor));

const { DatabaseSync } = await import('node:sqlite');
function mkEnv(opts = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, teacher_id TEXT, start_time TEXT, scheduled_date TEXT,
             day_of_week TEXT, schedule_kind TEXT, status TEXT, created_at INTEGER, duration_min INTEGER);
           CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER);
           CREATE TABLE teacher_profiles (linked_teacher_id INTEGER, image_url TEXT, english_name TEXT, updated_at INTEGER, created_at INTEGER);`);
  if (!opts.noSubs) db.exec(`CREATE TABLE class_substitutions (schedule_id INTEGER, substitute_teacher_id TEXT, sub_date TEXT, status TEXT);`);
  const ins = db.prepare(`INSERT INTO class_schedules (id,user_id,teacher_id,start_time,scheduled_date,day_of_week,schedule_kind,status) VALUES (?,?,?,?,?,?,?,?)`);
  const D = '2026-10-14'; // 수요일
  // 강사 1: 날짜 지정 2회 + 매주 수요일 1회 = 3
  ins.run(1, 's1', '1', '10:00', D, null, 'dated', 'active');
  ins.run(2, 's2', '1', '11:00', D, null, 'dated', 'active');
  ins.run(3, 's3', '1', '12:00', null, 'Wed', 'recurring', 'active');
  // 강사 1 — 안 세는 것들
  ins.run(4, 's4', '1', '13:00', D, null, 'dated', 'cancelled');           // 취소
  ins.run(5, 'lms', '1', '14:00', D, null, 'dated', 'active');             // 자리표시
  ins.run(6, 's6', '1', '15:00', '2026-10-15', null, 'dated', 'active');   // 다른 날
  ins.run(7, 's7', '1', '16:00', null, '1,5', 'recurring', 'active');      // 월·금 반복
  // 강사 2: 그룹 수업(같은 시각 학생 3명) = 1회 + '3'(숫자 수요일) 반복 1회 = 2
  ins.run(10, 'g1', '2', '18:00', D, null, 'dated', 'active');
  ins.run(11, 'g2', '2', '18:00', D, null, 'dated', 'active');
  ins.run(12, 'g3', '2', '18:00', D, null, 'dated', 'active');
  ins.run(13, 's13', '2', '19:00', null, '3', 'recurring', 'active');
  // 강사 3: 결석 — 1회는 강사 4 가 대체
  ins.run(20, 's20', '3', '09:00', D, null, 'dated', 'active');
  ins.run(21, 's21', '3', '09:20', D, null, 'dated', 'active');
  // 강사 5: 반복이지만 시작일이 그날 뒤 / 그 주만 빠짐 → 0
  ins.run(30, 's30', '5', '10:00', null, 'Wed', 'recurring', 'active');
  ins.run(31, 's31', '5', '11:00', null, 'Wed', 'recurring', 'active');
  db.exec(`ALTER TABLE class_schedules ADD COLUMN starts_on TEXT; ALTER TABLE class_schedules ADD COLUMN skip_dates TEXT;`);
  db.exec(`UPDATE class_schedules SET starts_on='2026-10-21' WHERE id=30; UPDATE class_schedules SET skip_dates='2026-10-14' WHERE id=31;`);
  if (!opts.noSubs) db.exec(`INSERT INTO class_substitutions VALUES (21,'4','${D}','active'), (20,'4','2026-10-15','active')`);
  db.exec(`INSERT INTO teachers VALUES (1,'Ana',1),(2,'Belle',1),(3,'Chaine',1),(4,'Cindy',1),(5,'Farrah',1),(6,'Hannah',1)`);
  const wrap = (sql) => {
    const st = { args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.first = async () => db.prepare(sql).get(...st.args) ?? null;
    st.all = async () => ({ results: db.prepare(sql).all(...st.args) });
    st.run = async () => { db.prepare(sql).run(...st.args); return {}; };
    return st;
  };
  return { DB: { prepare: wrap, exec: async (sql) => { try { db.exec(sql); } catch (e) { throw e; } } } };
}

const D = '2026-10-14';
let counts = null;
try { counts = M ? await M.teacherDayCounts(mkEnv(), D) : null; } catch (e) { console.log('   (실행 실패: ' + e.message + ')'); }
const g = (id) => (counts ? counts.get(String(id)) || 0 : NaN);
check('세었다(null 아님)', counts instanceof Map);
check('강사 1: 날짜 지정 2 + 수요일 반복 1 = 3 (취소·자리표시·다른 날·월금 반복은 안 셈)', g(1) === 3, String(g(1)));
check('강사 2: 그룹 수업 3행은 1회로 + 숫자 요일(3) 반복 1 = 2', g(2) === 2, String(g(2)));
check('강사 3: 대체로 넘어간 수업은 원래 강사에서 빠짐 = 1', g(3) === 1, String(g(3)));
check('강사 4: 그날 대체로 들어간 수업을 셈 = 1 (다른 날 대체는 안 셈)', g(4) === 1, String(g(4)));
check('강사 5: 시작 전·그 주만 빠짐 반복은 안 셈 = 0', g(5) === 0, String(g(5)));
check('강사 6: 수업 없음 = 0', g(6) === 0);
let c2 = null;
try { c2 = M ? await M.teacherDayCounts(mkEnv({ noSubs: true }), D) : null; } catch (e) {}
check('대체 표가 없어도 죽지 않고 원래 강사로 센다(강사 3 = 2)', c2 instanceof Map && c2.get('3') === 2, c2 ? String(c2.get('3')) : 'null');
let cBad = 'x';
try { cBad = M ? await M.teacherDayCounts({ DB: { prepare() { throw new Error('d1 down'); }, exec: async () => {} } }, D) : 'x'; } catch (e) { cBad = 'threw'; }
check('조회가 실패하면 null(모름) — 던지지도 0 으로 지어내지도 않는다', cBad === null, String(cBad));

console.log('\n── B. 정렬 (moveCandidatesFor 실제 실행)');
const row = { id: 999, user_id: 'stu', scheduled_date: D, dm: 20, teacher_id: '3', teacher_name: 'Chaine', status: 'active', source: 'adm-enroll:1' };
let rOn = null, rOff = null;
try { rOn = await M.moveCandidatesFor(mkEnv(), row, D, '20:00', { dayCount: true }); } catch (e) { console.log('   (실행 실패: ' + e.message + ')'); }
try { rOff = await M.moveCandidatesFor(mkEnv(), row, D, '20:00'); } catch (e) { console.log('   (실행 실패: ' + e.message + ')'); }
const ids = (r) => (r && r.candidates || []).map((t) => t.id).join(',');
check('켜면 적은 순(같으면 이름순): Farrah0·Hannah0·Cindy1·Belle2·Ana3', ids(rOn) === '5,6,4,2,1', ids(rOn));
check('켜면 후보마다 day_count 가 숫자', !!rOn && rOn.candidates.every((t) => typeof t.day_count === 'number'));
check('켜면 담당 강사에도 day_count(=1)', !!rOn && rOn.current && rOn.current.day_count === 1);
check('켜면 day_count_ok = true', !!rOn && rOn.day_count_ok === true);
check('짝: 안 켜면(학생 경로) 예전 이름순 Ana·Belle·Cindy·Farrah·Hannah', ids(rOff) === '1,2,4,5,6', ids(rOff));
check('짝: 안 켜면 day_count 는 null(세지 않음)', !!rOff && rOff.candidates.every((t) => t.day_count === null) && rOff.day_count_ok === false);

console.log('\n── C. 화면 카드 (class-move-modal.js 실제 실행)');
const cardSrc = cutDecl(MODAL, 'function mvCard(');
const htmlSrc = cutDecl(MODAL, 'function mvTeachersHtml(');
check('전제: mvCard·mvTeachersHtml 를 오려 냈다', cardSrc.length > 50 && htmlSrc.length > 50);
let mvCard = null, mvTeachersHtml = null;
try {
  const f = new Function('esc', 'T', 'mvWhy', '_mvPick', cardSrc + '\n' + htmlSrc + '\nreturn { mvCard, mvTeachersHtml };');
  const T = (ko, en) => en;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  ({ mvCard, mvTeachersHtml } = f(esc, T, () => '', ''));
} catch (e) { console.log('   (컴파일 실패: ' + e.message + ')'); }
const html = (t) => { try { return mvCard(t, ''); } catch (e) { return 'ERR ' + e.message; } };
check('day_count 10 → «10 classes that day»', /10 classes that day/.test(html({ id: 1, name: 'Ana', day_count: 10 })));
check('day_count 1 → «1 class that day»(단수)', /1 class that day/.test(html({ id: 1, name: 'Ana', day_count: 1 })));
check('day_count 0 → «0 classes that day»(0 도 사실)', /0 classes that day/.test(html({ id: 1, name: 'Ana', day_count: 0 })));
check('짝: day_count null → 수를 그리지 않음', !/that day/.test(html({ id: 1, name: 'Ana', day_count: null })));
let h2 = '';
try { h2 = mvTeachersHtml({ current: null, teacher_change_ok: true, day_count_ok: true, candidates: [{ id: 1, name: 'A', day_count: 0 }, { id: 2, name: 'B', day_count: 2 }] }); } catch (e) { h2 = 'ERR ' + e.message; }
check('셌을 때 «수업이 적은 강사부터» 안내', /fewer classes that day come first/.test(h2), h2.slice(0, 80));
let h3 = '';
try { h3 = mvTeachersHtml({ current: null, teacher_change_ok: true, day_count_ok: false, candidates: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] }); } catch (e) { h3 = 'ERR ' + e.message; }
check('짝: 못 셌으면 그 안내를 안 함', !/fewer classes/.test(h3) && !/^ERR/.test(h3));

console.log('\n── E. 샌드박스 반복검사 (무작위 시간표 × 정본 vs 따로 짠 기준 계산)');
/* 결정론 난수 — 실패가 나면 같은 seed 로 다시 재현된다. */
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const ITER = Number(process.env.MTDC_ITER || 500);
const DOWN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KO = ['일', '월', '화', '수', '목', '금', '토'];
function ymdAdd(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* 기준 계산 — 정본을 «보지 않고» 규칙만으로 다시 짠 것(같은 실수를 복제하지 않으려고 다른 모양으로). */
function reference(rows, subs, date) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  const subOf = new Map(subs.filter((x) => x.date === date && x.status === 'active').map((x) => [x.sid, x.tid]));
  const per = {};
  for (const r of rows) {
    if (r.status !== 'active' || !r.teacher || ['lms', 'type_seed'].includes(String(r.user).toLowerCase())) continue;
    let opens;
    if (r.date) opens = r.date === date;
    else if (r.dows) {
      opens = r.dows.includes(dow) && !(r.startsOn && date < r.startsOn) && !(r.skips || []).includes(date);
    } else opens = false;
    if (!opens) continue;
    const t = subOf.get(r.id) || r.teacher;
    (per[t] = per[t] || new Set()).add(r.time);
  }
  const out = {}; for (const k of Object.keys(per)) out[k] = per[k].size; return out;
}
let fuzzBad = 0, fuzzRuns = 0, sortBad = 0, firstBad = '';
if (M) {
  for (let it = 0; it < ITER; it++) {
    const R = rng(1000 + it);
    const pick = (a) => a[Math.floor(R() * a.length)];
    const date = ymdAdd('2026-10-12', Math.floor(R() * 14));
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, teacher_id TEXT, start_time TEXT, scheduled_date TEXT,
               day_of_week TEXT, schedule_kind TEXT, status TEXT, created_at INTEGER, duration_min INTEGER, starts_on TEXT, skip_dates TEXT);
             CREATE TABLE class_substitutions (schedule_id INTEGER, substitute_teacher_id TEXT, sub_date TEXT, status TEXT);
             CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER);
             CREATE TABLE teacher_profiles (linked_teacher_id INTEGER, image_url TEXT, english_name TEXT, updated_at INTEGER, created_at INTEGER);`);
    const nT = 2 + Math.floor(R() * 8);
    for (let t = 1; t <= nT; t++) db.prepare(`INSERT INTO teachers VALUES (?,?,1)`).run(t, 'T' + String.fromCharCode(64 + t));
    const rows = [], subs = [];
    const nR = Math.floor(R() * 40);
    const ins = db.prepare(`INSERT INTO class_schedules (id,user_id,teacher_id,start_time,scheduled_date,day_of_week,schedule_kind,status,starts_on,skip_dates) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (let i = 1; i <= nR; i++) {
      const teacher = String(1 + Math.floor(R() * nT));
      const time = pick(['09:00', '09:20', '10:00', '18:00', '18:20', '21:10']);
      const user = pick(['s1', 's2', 's3', 'g1', 'g2', 'lms', 'LMS', 'type_seed']);
      const status = pick(['active', 'active', 'active', 'active', 'cancelled', 'postponed']);
      const recurring = R() < 0.4;
      let date0 = null, dowStr = null, dows = null, startsOn = null, skips = null;
      if (recurring) {
        const set = [...new Set([pick([0,1,2,3,4,5,6]), pick([0,1,2,3,4,5,6])])];
        dows = set;
        dowStr = pick([
          set.join(','),
          set.map((d) => DOWN[d]).join(','),
          set.map((d) => KO[d]).join('/'),
          set.map((d) => DOWN[d].toLowerCase()).join(' '),
        ]);
        if (R() < 0.3) startsOn = ymdAdd(date, Math.floor(R() * 15) - 7);
        if (R() < 0.3) skips = [date, ymdAdd(date, 7)].slice(0, 1 + Math.floor(R() * 2));
      } else {
        date0 = ymdAdd(date, pick([0, 0, 0, -1, 1, 7]));
      }
      ins.run(i, user, teacher, time, date0, dowStr, recurring ? 'recurring' : 'dated', status, startsOn, skips ? skips.join(',') : null);
      rows.push({ id: i, user, teacher, time, date: date0, dows, status, startsOn, skips });
      if (R() < 0.12) {
        const sub = { sid: i, tid: String(1 + Math.floor(R() * nT)), date: pick([date, date, ymdAdd(date, 1)]), status: pick(['active', 'active', 'cancelled']) };
        subs.push(sub);
        db.prepare(`INSERT INTO class_substitutions VALUES (?,?,?,?)`).run(sub.sid, sub.tid, sub.date, sub.status);
      }
    }
    const wrap = (sql) => { const st = { args: [] }; st.bind = (...a) => { st.args = a; return st; };
      st.first = async () => db.prepare(sql).get(...st.args) ?? null; st.all = async () => ({ results: db.prepare(sql).all(...st.args) }); return st; };
    const env = { DB: { prepare: wrap, exec: async (sql) => { try { db.exec(sql); } catch (e) { throw e; } } } };
    fuzzRuns++;
    let got = null;
    try { got = await M.teacherDayCounts(env, date); } catch (e) { got = 'THREW ' + e.message; }
    /* 대체는 원래 수업이 «그날 열릴 때만» 의미가 있다 — 기준도 정본도 열린 수업만 센 뒤 대체로 옮긴다. */
    const want = reference(rows, subs, date);
    const gotObj = got instanceof Map ? Object.fromEntries([...got].filter(([, v]) => v > 0)) : got;
    const same = got instanceof Map && JSON.stringify(Object.keys(gotObj).sort().map((k) => [k, gotObj[k]])) === JSON.stringify(Object.keys(want).sort().map((k) => [k, want[k]]));
    if (!same) { fuzzBad++; if (!firstBad) firstBad = 'seed ' + (1000 + it) + ' date ' + date + ' got ' + JSON.stringify(gotObj) + ' want ' + JSON.stringify(want); }
    /* 정렬 불변식 — 후보는 day_count 오름차순, 같으면 이름순. */
    try {
      const r = await M.moveCandidatesFor(env, { id: 99999, user_id: 'x', scheduled_date: date, dm: 20, teacher_id: '1', teacher_name: 'TA', status: 'active', source: '' }, date, '23:00', { dayCount: true });
      const c = r.candidates || [];
      for (let i = 1; i < c.length; i++) {
        const a = c[i - 1], b = c[i];
        if (a.day_count > b.day_count || (a.day_count === b.day_count && String(a.display_name).localeCompare(String(b.display_name)) > 0)) { sortBad++; break; }
      }
      if (c.some((t) => typeof t.day_count !== 'number' || t.day_count !== ((got instanceof Map && got.get(t.id)) || 0))) sortBad++;
    } catch (e) { sortBad++; }
  }
}
check(`샌드박스 ${fuzzRuns}회 — 정본 수 == 기준 계산 수 (불일치 ${fuzzBad})`, fuzzRuns === ITER && fuzzBad === 0, firstBad);
check(`샌드박스 ${fuzzRuns}회 — 후보가 «적은 순·같으면 이름순» 이고 카드 숫자 == 센 수 (위반 ${sortBad})`, fuzzRuns === ITER && sortBad === 0);

console.log('\n── D. 배선');
const adminRoute = (() => { const i = OPS.indexOf("path === '/api/pay/enroll/admin/move-candidates'"); return i < 0 ? '' : braceBlock(OPS, OPS.indexOf('{', i)); })();
check('관리자 move-candidates 가 dayCount 를 켠다', /moveCandidatesFor\([^)]*\{\s*dayCount:\s*true\s*\}\s*\)/.test(adminRoute));
check('학생 free-teachers 는 dayCount 를 안 켠다', /moveCandidatesFor\(env, row, date, time\)/.test(MANGO) && !/dayCount/.test(MANGO));
check('학생 응답 pick 이 day_count 를 싣지 않는다', /const pick = \(t: any\) => \(\{ id: t\.id, name: t\.name, display_name: t\.display_name, photo: t\.photo \}\)/.test(MANGO));

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
