// 2026-10-27 강사·매니저 제안 세 건 — «실제로 돌려서» 본다.
//   ① 강사 화면 연락처: 정본 loadContactPhones(notify-contacts.ts) — 받아 둔 번호 → 명부 → 이탈위험 스냅샷
//   ② 관리자 «오늘 수업» 시간 칸: 16:00 → «4:00pm – 4:20pm» (KST 12시간제, 시작–끝)
//   ③ 강사 화면 월(Month) 보기: 서버 ?part=month(주간과 같은 판정) + teacher.html 월 달력
// node test-harness/teacher_contact_month_harness.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = (p) => readFileSync(p, 'utf8');
let PASS = 0, FAIL = 0;
const ok = (c, m, extra) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ FAIL ' + m + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); } };
function braceBody(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (startIdx < 0 || open < 0) return '';
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(startIdx, i + 1); }
  }
  return '';
}

/* ── ① 연락처 정본 ─────────────────────────────────────────────────────────── */
console.log('[ ① 연락처 정본 loadContactPhones — 진짜 SQLite 로 돌린다 ]');
globalThis.__CM = { overrides: new Map(), overrideThrows: false };
let NC = null;
try {
  const chunk = stripTypeScriptTypes(rd(resolve(SRC, 'd1-chunk.ts')));
  const CH = await import('data:text/javascript;base64,' + Buffer.from(chunk).toString('base64'));
  globalThis.__CM.selectInChunks = CH.selectInChunks;
  globalThis.__CM.findTeacherContact = async () => null;
  globalThis.__CM.getOverridePhones = async () => ({ parent: '', student: '' });
  globalThis.__CM.loadOverridePhones = async (env, uids) => {
    if (globalThis.__CM.overrideThrows) throw new Error('override down');
    const out = new Map();
    for (const u of uids) if (globalThis.__CM.overrides.has(u)) out.set(u, globalThis.__CM.overrides.get(u));
    return out;
  };
  let code = stripTypeScriptTypes(rd(resolve(SRC, 'notify-contacts.ts')));
  code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
    names.split(',').map(n => n.trim()).filter(Boolean).map(n => `const ${n} = globalThis.__CM.${n};`).join('\n'));
  NC = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
} catch (e) { console.log('  (정본 로드 실패) ' + e.message); }
ok(!!(NC && NC.loadContactPhones), '전제: notify-contacts.ts 의 loadContactPhones 를 불러왔다');
if (!NC) { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(1); }

function d1(db) {   // node:sqlite → D1 모양(prepare().bind().all/first, prepare().all)
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...(args || [])) }),
    first: async () => db.prepare(sql).get(...(args || [])) ?? null,
    run: async () => db.prepare(sql).run(...(args || [])),
  });
  return { prepare: (sql) => mk(sql, []), exec: async (s) => db.exec(s) };
}
function freshDb({ erp = true, ret = true } = {}) {
  const db = new DatabaseSync(':memory:');
  if (erp) db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, phone TEXT, student_phone TEXT, parent_phone TEXT, shop_name TEXT)`);
  if (ret) db.exec(`CREATE TABLE student_retention (user_id TEXT PRIMARY KEY, phone TEXT, category TEXT)`);
  return db;
}
{
  const db = freshDb();
  db.exec(`INSERT INTO students_erp VALUES
    ('ov1','01011112222',NULL,NULL,'A'),
    ('e_stu',NULL,'01033334444','01099990000','A'),
    ('e_ph','01055556666',NULL,'01099990000','A'),
    ('e_par',NULL,NULL,'01077778888','A'),
    ('short','1234',NULL,NULL,'A'),
    ('ret1',NULL,NULL,NULL,'A'),
    ('none',NULL,'',' ','A')`);
  db.exec(`INSERT INTO student_retention VALUES ('ret1','010-2222-3333','inactive'),('short','01044445555','expiring'),('RET1','01000000000','x')`);
  globalThis.__CM.overrides = new Map([
    ['ov1', { student: '01012121212', parent: '01034343434' }],
    ['ov2', { student: '', parent: '01056565656' }],
  ]);
  const m = await NC.loadContactPhones({ DB: d1(db) }, ['ov1', 'ov2', 'e_stu', 'e_ph', 'e_par', 'short', 'ret1', 'none', 'ghost', '', null, 'ov1']);
  ok(m.get('ov1') === '01012121212', '받아 둔 학생 번호가 명부보다 먼저다', m.get('ov1'));
  ok(m.get('ov2') === '01056565656', '받아 둔 번호가 학부모 것뿐이면 그것', m.get('ov2'));
  ok(m.get('e_stu') === '01033334444', '명부: student_phone 이 학부모 번호보다 먼저', m.get('e_stu'));
  ok(m.get('e_ph') === '01055556666', '명부: phone 칸도 읽는다', m.get('e_ph'));
  ok(m.get('e_par') === '01077778888', '명부: 학생 번호가 없으면 학부모 번호', m.get('e_par'));
  ok(m.get('ret1') === '010-2222-3333', '🔑 명부에 없으면 이탈위험 스냅샷(매니저 화면과 같은 원천) — 표기 그대로', m.get('ret1'));
  ok(m.get('short') === '01044445555', '(짝) 9자리 미만은 번호로 안 보고 다음 원천으로 간다', m.get('short'));
  ok(!m.has('none') && !m.has('ghost'), '(짝) 번호가 없으면 맵에 없다 — 지어내지 않는다');
  ok(!m.has('') && !m.has('null'), '(짝) 빈 아이디는 묻지도 않는다');
  ok(![...m.values()].includes('01000000000'), '(짝) 대소문자가 다른 남의 행(RET1)을 끌어오지 않는다 — 정확일치');
}
{
  const db = freshDb({ erp: false });
  db.exec(`INSERT INTO student_retention VALUES ('a','01011110000','inactive')`);
  globalThis.__CM.overrides = new Map(); globalThis.__CM.overrideThrows = true;
  let m = null, threw = false;
  try { m = await NC.loadContactPhones({ DB: d1(db) }, ['a', 'b']); } catch { threw = true; }
  ok(!threw && m && m.get('a') === '01011110000', 'fail-open: 받아 둔 번호 조회·명부 표가 죽어도 남은 원천으로 찾고 던지지 않는다', m && [...m]);
  globalThis.__CM.overrideThrows = false;
}
{
  const db = freshDb();
  const ins = db.prepare(`INSERT INTO student_retention VALUES (?,?,?)`);
  const uids = [];
  for (let i = 0; i < 230; i++) { const u = 'bulk' + i; uids.push(u); ins.run(u, '0105555' + String(1000 + i), 'inactive'); }
  const m = await NC.loadContactPhones({ DB: d1(db) }, uids);
  ok(m.size === 230, 'D1 바인드 100개 한도를 넘는 230명도 전부 찾는다(공용 청크)', m.size);
}

console.log('\n[ ① 배선 — 강사 포털이 그 정본을 쓴다 ]');
const tapi = rd(resolve(SRC, 'api-teacher.ts'));
const enrichAt = tapi.indexOf('// Enrich only rows already authorized by the teacher schedule query.');
const enrichTry = braceBody(tapi, tapi.indexOf('if (!onlyNext) try {', enrichAt));
ok(enrichTry.length > 200, '전제: 연락처 보강 블록을 잘라 냈다');
ok(/const phones = await loadContactPhones\(env, uids\)/.test(enrichTry), '보강 블록이 정본 loadContactPhones 를 부른다');
ok(/c\.student_phone = phones\.get\(uid\) \|\| null/.test(enrichTry), '그 결과를 student_phone 으로 싣는다');
ok(!/student_phone\s*=\s*String\(r\.phone/.test(enrichTry), '⛔ 명부 칸을 직접 읽어 번호를 정하던 옛 식이 없다(판정 복제 금지)');
ok(/contactsChecked = true;/.test(enrichTry) && enrichTry.indexOf('contactsChecked = true;') > enrichTry.indexOf('phones.get(uid)'),
  '«조회 완료» 표시는 번호를 다 실은 «뒤» try 안에서만 참이 된다(실패면 거짓)');
ok(/contacts_checked: contactsChecked/.test(tapi), '응답에 contacts_checked 를 싣는다');
ok(/import \{ loadContactPhones \} from '\.\/notify-contacts'/.test(tapi), 'import 가 있다');

/* ── ① 화면 — «왜 비었나» 한 줄 ─────────────────────────────────────────────── */
console.log('\n[ ① 화면 — 연락처 안내 줄(contactNoteHtml)을 실제로 돌린다 ]');
const thtml = rd(resolve(PUB, 'teacher.html'));
function fnSrc(src, name) {
  const a = src.indexOf('  function ' + name + '(');
  return a < 0 ? '' : braceBody(src, a);
}
{
  const ctx = vm.createContext({ DATA: null, LANG: 'en', EN: () => ctx.LANG !== 'ko', T: (en, ko) => ctx.LANG === 'ko' ? ko : en,
    esc: x => String(x ?? ''), stuUid: c => c.student_uid || '' });
  vm.runInContext(fnSrc(thtml, 'contactNoteHtml'), ctx);
  const rows = [{ student_uid: 'a', student_phone: '010' }, { student_uid: 'b' }, { student_uid: 'c' }, { kind: 'lms' }, { student_uid: '' }];
  ok(typeof ctx.contactNoteHtml === 'function', '전제: contactNoteHtml 을 오려 냈다');
  ok(ctx.contactNoteHtml(rows) === '', '자료가 아직 없으면 말하지 않는다');
  ctx.DATA = { classes: [] };
  ok(ctx.contactNoteHtml(rows) === '', '서버가 «조회 완료» 라 하기 전(캐시를 그린 순간 — 번호를 일부러 비운 자료)엔 말하지 않는다');
  ctx.DATA = { contacts_checked: true };
  const en = ctx.contactNoteHtml(rows);
  ok(/2 of 3 have no number/.test(en), '조회를 마쳤으면 «N of M» 을 진짜 수업 줄로만 센다(LMS 점유·아이디 없는 줄 제외)', en);
  ctx.LANG = 'ko';
  ok(/2\/3건/.test(ctx.contactNoteHtml(rows)), '한국어도 같은 숫자');
  ok(ctx.contactNoteHtml([{ student_uid: 'a', student_phone: '010' }]) === '', '(짝) 다 있으면 아무 말도 안 한다');
  const rc = fnSrc(thtml, 'renderClasses');
  ok(/h \+= contactNoteHtml\(list\);/.test(rc), 'renderClasses 가 그 줄을 실제로 붙인다');
  ok(/DATA\.contacts_checked\) \? 'C' : ''\)/.test(rc), '«조회 완료» 가 지문에 들어간다(캐시 뒤 서버 응답에 다시 그리게)');
  ok(/key === 'student_phone' \|\| key === 'contacts_checked'/.test(fnSrc(thtml, 'saveCache'))
    && /key === 'student_phone' \|\| key === 'contacts_checked'/.test(fnSrc(thtml, 'paintCached')),
    '캐시에는 번호도 «조회 완료» 도 남기지 않는다(캐시 화면이 «번호 없음» 이라고 거짓말하지 않게)');
}

/* ── ② 관리자 시간 칸 ───────────────────────────────────────────────────────── */
console.log('\n[ ② 관리자 «오늘 수업» 시간 칸 — KST 12시간제 시작–끝 ]');
const tc = rd(resolve(PUB, 'js/adm-today-classes.js'));
{
  const ctx = vm.createContext({});
  vm.runInContext(fnSrc(tc, 'kst12') + '\n' + fnSrc(tc, 'kstRange'), ctx);
  const at = (iso) => Date.parse(iso);
  const S = (a, b) => ({ start_ts: at(a), end_ts: b ? at(b) : undefined });
  ok(typeof ctx.kstRange === 'function', '전제: kstRange 를 오려 냈다');
  ok(ctx.kstRange(S('2026-10-27T07:00:00Z', '2026-10-27T07:20:00Z')) === '4:00pm – 4:20pm', '16:00~16:20 KST → «4:00pm – 4:20pm» (제보 화면 그대로)', ctx.kstRange(S('2026-10-27T07:00:00Z', '2026-10-27T07:20:00Z')));
  ok(ctx.kstRange(S('2026-10-27T03:00:00Z', '2026-10-27T03:30:00Z')) === '12:00pm – 12:30pm', '정오는 12:00pm');
  ok(ctx.kstRange(S('2026-10-27T15:10:00Z', '2026-10-27T15:30:00Z')) === '12:10am – 12:30am', '자정 뒤는 12:10am(0:10 이 아니다)');
  ok(ctx.kstRange(S('2026-10-27T14:50:00Z', '2026-10-27T15:10:00Z')) === '11:50pm – 12:10am (+1d)', '날을 넘기면 (+1d)');
  ok(ctx.kstRange(S('2026-10-27T07:05:00Z')) === '4:05pm', '(짝) 끝 시각이 없으면 시작만 — 지어내지 않는다');
  ok(ctx.kstRange({ start_ts: NaN }) === '-', '(짝) 시작을 모르면 «-»');
  ok(!/\d{2}:\d{2}/.test(ctx.kstRange(S('2026-10-27T11:00:00Z', '2026-10-27T11:25:00Z'))), '24시간제(20:00) 글자가 안 나온다');
  ok(/'<td style="white-space:nowrap" title="KST">' \+ esc\(kstRange\(s\)\) \+ '<\/td>'/.test(tc), '표의 시간 칸이 그 함수를 실제로 부른다');
  ok(!/<td style="white-space:nowrap">' \+ hhmm\(s\.start_ts\)/.test(tc), '⛔ 시간 칸에 24시간제 hhmm(start_ts) 가 남아 있지 않다');
  ok(/tcTh\('time', '시간 \(한국\)', 'Time \(KST\)'\)/.test(tc), '머리글이 «Time (KST)» 라고 말한다');
}

/* ── ③ 월 보기 — 서버 ───────────────────────────────────────────────────────── */
console.log('\n[ ③ 월 보기 — 서버 ?part=month ]');
{
  const hitsAt = tapi.indexOf('const hitsOn = ');
  const itemAt = tapi.indexOf('const calendarItemOf = ');
  const hitsSrc = tapi.slice(hitsAt, tapi.indexOf(';\n', hitsAt) + 2);
  const itemSrc = braceBody(tapi, itemAt) + ';';
  const dowSrc = braceBody(tapi, tapi.indexOf('function dowMatches('));
  const mapSrc = tapi.slice(tapi.indexOf('const DOW_MAP'), tapi.indexOf('};', tapi.indexOf('const DOW_MAP')) + 2);
  const uidSrc = braceBody(tapi, tapi.indexOf('const studentUidOf = ')) + ';';
  ok(hitsAt > 0 && itemAt > hitsAt && itemSrc.length > 100, '전제: hitsOn·calendarItemOf 를 오려 냈다');
  const ctx = vm.createContext({ todayStr: '2026-10-27', pad: n => String(n).padStart(2, '0'),
    recurStartedOn: (s, date) => !s.starts_on || date >= s.starts_on,
    classKindOf: s => (s.class_type === 'level_test' ? 'level_test' : 'regular') });
  vm.runInContext(stripTypeScriptTypes([mapSrc, dowSrc, uidSrc, hitsSrc, itemSrc].join('\n')).replace(/^const (\w+) =/gm, 'var $1 ='), ctx);
  ok(ctx.hitsOn({ day_of_week: 'Tue' }, '2026-10-27', 2) === true, '반복(요일) 수업이 그 요일에 걸린다');
  ok(ctx.hitsOn({ day_of_week: 'Tue', starts_on: '2026-11-01' }, '2026-10-27', 2) === false, '(짝) 시작일 전에는 안 걸린다(정본 recurStartedOn)');
  ok(ctx.hitsOn({ scheduled_date: '2026-10-30 00:00' }, '2026-10-30', 5) === true && ctx.hitsOn({ scheduled_date: '2026-10-30' }, '2026-10-31', 6) === false, '일회성은 그 날만');
  const it = ctx.calendarItemOf({ id: 7, user_id: 'kid1', start_time: '16:00', duration_min: 20, student_name: '김선우', class_type: 'level_test' }, '2026-11-02', false);
  ok(it.room_id === 'class-7-20261102' && it.start_time === '16:00' && it.status === 'early' && it.is_level_test === true && it.student_uid === 'kid1',
    '달력 한 줄: 방 번호·시각·상태·레벨테스트·아이디', it);
  ok(ctx.calendarItemOf({ id: 8, user_id: 'lms', start_time: '9:5' }, '2026-10-01', true).class_state === 'postponed'
    && ctx.calendarItemOf({ id: 8, user_id: 'lms', start_time: '9:5' }, '2026-10-01', false).kind === 'lms',
    '연기·LMS 점유 슬롯도 주간과 같은 규칙');
  ok(/for \(const day of weekDays\) if \(hitsOn\(s, day\.date, day\.dow\)\) day\.items\.push\(calendarItemOf\(s, day\.date, _postponed\)\)/.test(tapi)
    && /for \(const day of monthDays\) if \(hitsOn\(s, day\.date, day\.dow\)\) day\.items\.push\(calendarItemOf\(s, day\.date, _postponed\)\)/.test(tapi),
    '🔑 주간과 월간이 «같은» 판정·줄 모양을 쓴다(한쪽만 고쳐지는 사고를 막는다)');
  ok(!/weekDays\[wi\]/.test(tapi), '⛔ 주간 전용 옛 판정 복제본이 남아 있지 않다');
  // 날짜 칸 만들기를 실제로 돌린다
  const mdAt = tapi.indexOf('const monthDays: any[] = [];');
  const mdSrc = tapi.slice(mdAt, tapi.indexOf('\n  }\n', mdAt) + 4);
  const run = (monthParam) => {
    const c2 = vm.createContext({ monthMode: true, monthParam, todayStr: '2026-10-27', pad: n => String(n).padStart(2, '0') });
    vm.runInContext(stripTypeScriptTypes(mdSrc).replace('const monthDays', 'var monthDays'), c2);
    return c2.monthDays;
  };
  const feb = run('2026-02'), oct = run('2026-10');
  ok(feb.length === 28 && feb[0].date === '2026-02-01' && feb[0].dow === 0, '2026년 2월 = 28칸, 1일은 일요일', feb.length);
  ok(run('2028-02').length === 29, '윤년 2월 = 29칸');
  ok(oct.length === 31 && oct[3].dow === 0 && oct.filter(d => d.is_today).map(d => d.date)[0] === '2026-10-27', '10월 = 31칸, 오늘 표시는 27일 하나', oct.filter(d => d.is_today).length);
  const guard = tapi.match(/if \(monthMode && !\((\/\^[^/]+\/)\.test\(monthParam\)/);
  const re = guard ? eval(guard[1]) : null;
  ok(!!re && re.test('2026-10') && !re.test('2026-13') && !re.test('2026-1') && !re.test("2026-10' OR 1=1"), '잘못된 month 는 400(형식 검사)');
  ok(/const onlyNext = [^\n]*\|\| monthMode;/.test(tapi), '월 보기는 «가벼운 경로» — 오늘 목록의 무거운 보강을 건너뛴다');
  const mret = braceBody(tapi, tapi.indexOf('  if (monthMode) {\n    /* 🎌'));
  ok(/applyHolidayToItems\(real,/.test(mret) && /month: \{\s*\n\s*month: monthParam/.test(mret) && /return json\(/.test(mret), '월 응답: 공휴일 휴강을 같은 정본으로 입히고 달력만 돌려준다');
  ok(mret && tapi.indexOf('  if (monthMode) {\n    /* 🎌') < tapi.indexOf('  if (onlyNext) {\n    const GRACE_AFTER_END'), '월 응답이 «다음 수업» 응답보다 먼저 갈린다');
  ok(!/student_phone|contact/.test(mret), '(짝) 월 응답에는 연락처가 안 실린다(그 날 목록에서만)');
}

/* ── ③ 월 보기 — 화면 ───────────────────────────────────────────────────────── */
console.log('\n[ ③ 월 보기 — teacher.html 달력을 실제로 그린다 ]');
{
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const cls = new Set();
      els.set(id, { id, hidden: false, innerHTML: '', textContent: '', open: false, attrs: {},
        classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) },
        setAttribute(k, v) { this.attrs[k] = v; } });
    }
    return els.get(id);
  };
  const fetched = [];
  const ctx = vm.createContext({ LANG: 'en', EN: () => ctx.LANG !== 'ko', T: (en, ko) => ctx.LANG === 'ko' ? ko : en,
    esc: x => String(x ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    document: { getElementById: el }, localStorage: { getItem: () => null, setItem() {} }, console: { warn() {} },
    clsToday: () => '2026-10-27', clsDayLabel: (d) => d,
    stuLabelText: (c, fb) => c.student_name || fb,
    MangoiClassDisplay: { time: t => 'T' + t, range: c => 'R' + c.start_time },
    fetch: (url) => { fetched.push(url); return new Promise(() => {}); } });
  const names = ['moThisMonth', 'moShift', 'moLabel', 'moOpen', 'setScheduleView', 'loadMonth', 'moItemHtml', 'renderMonth'];
  const code = 'var MO = { view: \'week\', month: null, data: null, read: 0, err: false }; var MO_VIEW_KEY = \'k\';\n'
    + names.map(n => fnSrc(thtml, n)).join('\n');
  ok(names.every(n => fnSrc(thtml, n)), '전제: 월 보기 함수 8개를 오려 냈다');
  vm.runInContext(code, ctx);
  ok(ctx.moShift('2026-01', -1) === '2025-12' && ctx.moShift('2026-12', 1) === '2027-01', '달 이동이 해를 넘는다');
  ok(ctx.moLabel('2026-10') === 'October 2026', '영어 달 이름');
  ctx.setScheduleView('month', false);
  ok(el('wk-pane').hidden === true && el('mo-pane').hidden === false && el('wk-mode-month').attrs['aria-pressed'] === 'true', '«Month» 를 누르면 주간이 숨고 월간이 보인다');
  ok(fetched.length === 0, '⚠️ 접이칸이 닫혀 있으면 아무것도 안 부른다(첫 화면 API 1회 계약)');
  el('c-week').open = true;
  ctx.setScheduleView('month', false);
  ok(fetched.length === 1 && fetched[0] === '/api/teacher/portal?part=month&month=2026-10', '열려 있으면 이번 달을 ?part=month 로 부른다', fetched);
  ctx.MO.month = '2026-10';
  ctx.MO.data = { month: '2026-10', days: Array.from({ length: 31 }, (_, i) => ({
    date: '2026-10-' + String(i + 1).padStart(2, '0'), dow: (4 + i) % 7, is_today: i === 26,
    items: i === 26 ? [
      { kind: 'class', start_time: '12:30', student_name: '지승연' },
      { kind: 'class', start_time: '13:00', student_name: '박주원', is_level_test: true },
      { kind: 'class', start_time: '13:20', student_name: 'X', class_state: 'postponed' },
      { kind: 'lms', start_time: '14:00' },
      { kind: 'class', start_time: '15:00', student_name: 'Y' }] : (i === 8 ? [{ kind: 'class', start_time: '16:00', student_name: 'Z', status: 'holiday', holiday_name: 'Hangeul Day' }] : []) })) };
  ctx.renderMonth();
  const h = el('month').innerHTML;
  const cells = (h.match(/class="mo-c[ "]/g) || []).length;
  const leadBlanks = (h.slice(0, h.indexOf('data-mo-day=')).match(/mo-blank/g) || []).length;
  ok(cells % 7 === 0 && leadBlanks === 4, '칸 수가 7의 배수, 10/1(목) 앞에 빈칸 4개(요일 칸이 맞는다)', { cells, leadBlanks });
  ok((h.match(/data-mo-day="/g) || []).length === 31, '날짜 칸 31개(누를 수 있는 버튼)');
  ok(/data-mo-day="2026-10-27"[^>]*>.*?<span class="mo-n">4<\/span>/.test(h), '오늘 칸: 진짜 수업 수만 센다(LMS 점유 제외 = 4)');
  ok(/mo-c today/.test(h), '오늘 칸 강조');
  ok(/T12:30<\/b> <span class="mo-who">지승연/.test(h), '시각은 MangoiClassDisplay.time(12/24 선택을 따른다)·학생 이름');
  ok(/mo-i lt/.test(h) && /mo-i pp/.test(h) && /mo-i dim/.test(h), '레벨테스트·연기·점유 슬롯을 구분해 그린다');
  ok(/\+1<\/span>/.test(h), '네 줄 넘으면 «+N»');
  ok(/mo-c hol/.test(h) && /Hangeul Day/.test(h) && /mo-i hol/.test(h), '공휴일 휴강 칸·이름');
  ok(el('mo-label').textContent === 'October 2026' && el('mo-this').classList.contains('on'), '머리에 달 이름, «이번 달» 표시');
  ctx.LANG = 'ko'; ctx.renderMonth();
  ok(el('mo-label').textContent === '2026년 10월' && /수업 4건/.test(el('month').innerHTML), '한국어로 다시 그린다');
  ctx.MO.err = true; ctx.MO.data = null; ctx.renderMonth();
  ok(el('mo-error').hidden === false && el('month').innerHTML === '', '(짝) 못 불러오면 «불러오는 중» 이 아니라 실패 안내');
  // 배선
  const bindSrc = thtml.slice(thtml.indexOf('(function bindMonthView(){'), thtml.indexOf('})();', thtml.indexOf('(function bindMonthView(){')));
  ok(/pickClsDay\(c\.getAttribute\('data-mo-day'\)\)/.test(bindSrc), '칸을 누르면 그 날을 위 목록(pickClsDay)으로 연다 — 새 화면을 만들지 않는다');
  ok(/card\.addEventListener\('toggle'/.test(bindSrc) && /getElementById\('cls-month-open'\)/.test(bindSrc), '접이칸을 열 때 불러오고, 날짜 옆 «📅 Month view» 가 바로 연다');
  ok(/addEventListener\('class-time-format'/.test(bindSrc) && /getElementById\('lang'\)/.test(bindSrc), '언어·12/24 표시가 바뀌면 다시 그린다');
  ok(/id="wk-mode-month"/.test(thtml) && /id="mo-pane" hidden/.test(thtml) && /id="cls-month-open"/.test(thtml), '화면에 주간/월간 버튼·월 칸·바로가기가 있다');
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
