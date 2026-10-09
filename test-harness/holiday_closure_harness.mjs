// 🎌 holiday_closure_harness — 공휴일 휴강(중국어 제외) 정본을 «실제로» 돌린다 (2026-10-09)
//
// [왜] 한글날에 학생 홈 벨이 계속 울렸다. 판정 정본 src/holiday-closure.ts 를 진짜 SQLite(D1 모양 감싸기)
//      위에서 돌려 «막는다» 옆에 «중국어(예외 강사)는 연다»·«평일은 연다»·«조회 실패면 연다(fail-open)»·
//      «이날은 수업함 이면 연다» 를 짝으로 본다(한쪽만 보면 «전부 막기»·«전부 열기» 가 통과한다).
//      배선은 각 소비처가 그 판정을 «수업을 넣기 전에» 부르는지 중괄호 없이 위치로 본다.
// 변이시험: HOLIDAY_SRC=<고친 사본> 으로 정본 대신 돌린다.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.HOLIDAY_SRC || join(ROOT, 'cloudflare-deploy/src/holiday-closure.ts');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); } };

// ── ① 정본을 실제로 돌린다 ───────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'hol-'));
copyFileSync(SRC, join(tmp, 'holiday-closure.ts'));
writeFileSync(join(tmp, 'run.mjs'), `
import { DatabaseSync } from 'node:sqlite';
import * as H from './holiday-closure.ts';
function d1(db, failAll){
  return { prepare(sql){ const st = () => { if (failAll) throw new Error('boom'); return db.prepare(sql); };
    const mk = (args) => ({
      bind: (...a) => mk(a),
      first: async () => st().get(...args) ?? null,
      all: async () => ({ results: st().all(...args) }),
      run: async () => st().run(...args),
    }); return mk([]); } };
}
const db = new DatabaseSync(':memory:');
db.exec("CREATE TABLE holidays (country TEXT, date TEXT, name TEXT)");
db.exec("CREATE TABLE enroll_holidays (day TEXT PRIMARY KEY, name TEXT)");
db.exec("INSERT INTO holidays VALUES ('KR','2026-10-09','한글날'),('PH','2026-11-01','All Saints'),('KR','2026-12-25','기독탄신일')");
db.exec("INSERT INTO enroll_holidays VALUES ('2026-10-20','학원 휴무')");
const D = d1(db, false);
const out = {};
const h = await H.loadHolidayClosure(D, '2026-10-09'); H.clearHolidayClosureCache();
out.kr = { closed: h.closed, name: h.name, en: H.isHolidayClosedFor(h, '7'), zh: H.isHolidayClosedFor(h, '29'), zhNum: H.isHolidayClosedFor(h, 29), none: H.isHolidayClosedFor(h, '') };
const w = await H.loadHolidayClosure(D, '2026-10-08'); H.clearHolidayClosureCache();
out.weekday = { closed: w.closed, en: H.isHolidayClosedFor(w, '7') };
const ph = await H.loadHolidayClosure(D, '2026-11-01'); H.clearHolidayClosureCache();
out.ph = { closed: ph.closed };
const eh = await H.loadHolidayClosure(D, '2026-10-20'); H.clearHolidayClosureCache();
out.enroll = { closed: eh.closed, name: eh.name };
await H.ensureHolidayClosureTable(D);
db.exec("INSERT INTO holiday_closure_override (kind,key) VALUES ('open_day','2026-12-25'),('exempt_teacher','12')");
const op = await H.loadHolidayClosure(D, '2026-12-25'); H.clearHolidayClosureCache();
out.opened = { closed: op.closed, en: H.isHolidayClosedFor(op, '7') };
const ex = await H.loadHolidayClosure(D, '2026-10-09'); H.clearHolidayClosureCache();
out.extra = { t12: H.isHolidayClosedFor(ex, '12'), t7: H.isHolidayClosedFor(ex, '7'), zh: H.isHolidayClosedFor(ex, '29') };
const bad = await H.loadHolidayClosure(d1(db, true), '2026-10-09'); H.clearHolidayClosureCache();
out.failOpen = { closed: bad.closed, en: H.isHolidayClosedFor(bad, '7') };
out.nul = H.isHolidayClosedFor(null, '7');
out.msg = H.holidayClosedMsg('한글날');
out.alert = H.holidayEntryAlert('한글날'); out.alertNull = H.holidayEntryAlert(null);
console.log(JSON.stringify(out));
`);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
let o = null;
try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { /* 아래에서 FAIL */ }
console.log('① 정본 실행');
ok('정본을 실제로 돌렸다', !!o, (r.stderr || '').slice(0, 300));
if (o) {
  ok('한글날(공식 KR) = 휴강일', o.kr.closed === true && o.kr.name === '한글날');
  ok('영어 강사 수업은 휴강', o.kr.en === true);
  ok('중국어 강선생님(29)은 그대로 연다', o.kr.zh === false && o.kr.zhNum === false);
  ok('강사 미배정 수업은 휴강(예외 아님)', o.kr.none === true);
  ok('평일은 휴강 아님 (짝)', o.weekday.closed === false && o.weekday.en === false);
  ok('필리핀 공휴일은 안 본다', o.ph.closed === false);
  ok('수강 운영 › 공휴일 표의 날도 휴강', o.enroll.closed === true && o.enroll.name === '학원 휴무');
  ok('«이날은 수업함» 이면 연다', o.opened.closed === false && o.opened.en === false);
  ok('추가한 예외 강사(12)는 연다', o.extra.t12 === false);
  ok('예외를 더해도 기본(29)은 남고 남은 휴강 (짝)', o.extra.zh === false && o.extra.t7 === true);
  ok('조회가 실패하면 휴강 아님(fail-open)', o.failOpen.closed === false && o.failOpen.en === false);
  ok('판정 객체가 없으면 휴강 아님', o.nul === false);
  ok('안내 문구는 한/영', /한글날/.test(o.msg) && /Holiday/.test(o.msg));
}

// ── ② 배선 — 소비처가 «수업을 넣기 전» 에 판정을 부르는가 ─────────────
console.log('② 배선');
const rd = (p) => readFileSync(join(ROOT, 'cloudflare-deploy', p), 'utf8');
const mango = rd('src/api-mango.ts');
{
  const i = mango.indexOf("path === '/api/class/sessions/today'");
  const body = mango.slice(i, mango.indexOf("path === '/api/class/schedule/mine'", i) > 0 ? mango.indexOf("path === '/api/class/schedule/mine'", i) : i + 40000);
  const g = body.indexOf('if (isHolidayClosedFor(holiday, s.teacher_id)) { holidaySkipped++; continue; }');
  const push = body.indexOf('out.push({');
  ok('학생 입장: 판정이 수업 목록에 넣기 «전»', g > 0 && push > g);
  ok('학생 입장: 오늘 날짜로 판정을 읽는다', /loadHolidayClosure\(env\.DB, todayStr\)/.test(body));
  ok('학생 입장: 응답에 holiday 를 싣는다', /holiday: holidayInfo/.test(body));
}
for (const [f, n] of [['src/lesson-reminder.ts', 2], ['src/absent-sweep.ts', 1]]) {
  const t = rd(f);
  const c = (t.match(/if \(isHolidayClosedFor\(_holiday, s\.teacher_id\)\) continue;/g) || []).length;
  ok(f + ': 판정을 ' + n + '곳에서 부른다', c === n, 'got ' + c);
  ok(f + ': 판정을 오늘 날짜로 읽는다', (t.match(/loadHolidayClosure\(env\.DB, todayStr\)/g) || []).length === n);
}
{
  const t = rd('src/api-teacher.ts');
  ok('강사 포털: 휴강이면 입장 버튼을 안 준다', /can_enter: !_postponed && !_holidayOff &&/.test(t) && /join_open: !_postponed && !_holidayOff &&/.test(t));
  ok('강사 포털: 판정을 실제로 계산한다', /const _holidayOff = !_cancelled && !_postponed && isHolidayClosedFor\(_holiday, s\.teacher_id\)/.test(t));
}
{
  const t = rd('src/api-students.ts');
  ok('오늘의 학습: 휴강 수업을 «오늘 수업» 에서 뺀다', (t.match(/isHolidayClosedFor\(_holiday, r\.teacher_id\)\) _holidaySkipped\+\+; else classes\.push/g) || []).length === 2);
}
{
  const t = rd('public/js/idx-cta-status.js');
  ok('홈 버튼: 서버 holiday 로만 휴강을 말한다', /d\.holiday && d\.holiday\.closed_count > 0/.test(t) && /todayState\.hn/.test(t));
  const ix = readFileSync(join(ROOT, 'cloudflare-deploy/public/index.html'), 'utf8');
  ok('홈 버튼: ?v= 를 올렸다', /idx-cta-status\.js\?v=3/.test(ix));
}
{
  const t = rd('src/enroll-ops.ts');
  ok('관리: 모르는 action 은 거절', /error: 'unknown_action'/.test(t));
  ok('관리: 기본 예외(29)는 못 뺀다', /error: 'fixed_default'/.test(t));
}

// ── ⑦ (2026-10-09 후속) 휴강일 «입장» 안내 — «예약된 수업이 없어요» 대신 공휴일 안내 ─────────────
console.log('\n⑦ 휴강일 입장 안내');
if (o) {
  ok('안내에 공휴일 이름이 한/영 둘 다 들어간다', (o.alert.match(/한글날/g) || []).length === 2 && /holiday/i.test(o.alert) && /쉬어요/.test(o.alert));
  ok('이름을 모르면 «공휴일» 로', /오늘은 공휴일이라/.test(o.alertNull));
  ok('안내가 «예약된 수업이 없어요» 라고 하지 않는다', !/예약된 수업이 없/.test(o.alert));
}
{
  const t = rd('src/api-mango.ts');
  ok('서버: sessions/today 의 holiday 에 alert 를 싣는다', /alert: holidayEntryAlert\(holiday\.name\)/.test(t));
}
{
  // vcJoinMyClass 를 오려 내 가짜 fetch 로 «실제로» 돌린다 — 무슨 글자가 alert 되는가
  const js = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/idx-main.js'), 'utf8');
  const i0 = js.indexOf('async function vcJoinMyClass()');
  let body = '';
  if (i0 >= 0) { let d = 0, j = js.indexOf('{', i0); for (let k = j; k < js.length; k++) { if (js[k] === '{') d++; else if (js[k] === '}') { d--; if (!d) { body = js.slice(i0, k + 1); break; } } } }
  ok('전제: vcJoinMyClass 를 오려 냈다', body.length > 500);
  const run = async (resp) => {
    const shown = []; const entered = [];
    try {
      const f = new Function('window', 'document', 'fetch', 'alert', 'vcEnterResolvedRoom', 'vcShowClassGate', 'vcShowSessionPicker', 'vcIsTeacherRole', 'console',
        body + '\nreturn vcJoinMyClass;');
      const btn = { dataset: {}, textContent: '' };
      const fn = f({ getCurrentUser: () => ({ uid: 'kim', name: '김', role: 'student' }) },
        { getElementById: (id) => id === 'vc-join-myclass' ? btn : { value: '' } },
        async () => ({ json: async () => resp }), (m) => shown.push(String(m)), () => entered.push(1), () => entered.push('g'), () => entered.push('p'), () => false, { warn() {}, log() {} });
      await fn();
    } catch (e) { shown.push('CRASH ' + e.message); }
    return { shown, entered };
  };
  const hol = await run({ ok: true, sessions: [], current: null, holiday: { name: '한글날', closed_count: 2, alert: 'HOLIDAY-ALERT' } });
  ok('휴강일: 공휴일 안내만 띄우고 입장 안 함', hol.shown.length === 1 && hol.shown[0] === 'HOLIDAY-ALERT' && !hol.entered.length, JSON.stringify(hol));
  const none = await run({ ok: true, sessions: [], current: null, holiday: null });
  ok('짝: 평일 수업 없음은 예전 문구 그대로', none.shown.length === 1 && /오늘 예약된 수업이 없어요/.test(none.shown[0]), JSON.stringify(none));
  const live = await run({ ok: true, sessions: [{ status: 'live', room_id: 'class-1-20261009' }], current: { status: 'live', room_id: 'class-1-20261009' }, holiday: { name: '한글날', closed_count: 1, alert: 'HOLIDAY-ALERT' } });
  ok('짝: 열린 수업(중국어)이 있으면 안내 없이 입장', !live.shown.length && live.entered.length === 1, JSON.stringify(live));
  const lobby = js.slice(js.indexOf("var _jd = await fetch('/api/class/sessions/today?"), js.indexOf("var _jd = await fetch('/api/class/sessions/today?") + 6000);
  ok('로비(게이트 켜짐): 휴강이면 공휴일 안내 후 멈춘다', /else if \(_jd\.holiday && _jd\.holiday\.alert\) \{\s*alert\(_jd\.holiday\.alert\); _stopJoin = true;/.test(lobby));
  ok('로비(게이트 꺼짐): 공용방 안내를 공휴일 안내로 바꾼다', /window\.__vcHolidayMsg = _jd\.holiday && _jd\.holiday\.alert;/.test(lobby) && /if \(_hm\) alert\(_hm \+/.test(js));
  const ix = readFileSync(join(ROOT, 'cloudflare-deploy/public/index.html'), 'utf8');
  const th = readFileSync(join(ROOT, 'cloudflare-deploy/public/teacher.html'), 'utf8');
  ok('idx-main.js ?v= 를 두 곳 다 올렸다', /idx-main\.js\?v=65/.test(ix) && /idx-main\.js\?v=65/.test(th));
}

// ── ⑧ (2026-10-09 후속) 관제탑(지금 수업)·급여 — 휴강 수업을 빼고 0 원으로 ─────────────────────────
console.log('\n⑧ 관제탑·급여');
{
  const cn = readFileSync(join(ROOT, 'cloudflare-deploy/src/classes-now.ts'), 'utf8');
  const i0 = cn.indexOf('export function dropHolidayClosed');
  let fn = '';
  if (i0 >= 0) { let d = 0, j = cn.indexOf('{\n', i0);   /* 반환 타입의 '{' 를 건너뛴다 */ for (let k = j; k < cn.length; k++) { if (cn[k] === '{') d++; else if (cn[k] === '}') { d--; if (!d) { fn = cn.slice(i0, k + 1); break; } } } }
  ok('전제: dropHolidayClosed 를 오려 냈다', fn.length > 200);
  const t2 = mkdtempSync(join(tmpdir(), 'hol2-'));
  copyFileSync(SRC, join(t2, 'holiday-closure.ts'));
  const _exConst = (cn.match(/export const EXEMPT_BY_NAME = [^;]+;/) || [''])[0];
  writeFileSync(join(t2, 'mini.ts'), `import { isHolidayClosedFor, type HolidayClosure } from './holiday-closure.ts';\ntype ClassesNowRow = any;\nconst KST9 = 9 * 60 * 60 * 1000;\n${_exConst}\n${fn}\n`);
  writeFileSync(join(t2, 'run.mjs'), `
import { dropHolidayClosed, EXEMPT_BY_NAME } from './mini.ts';
const at = (ymd, hm) => Date.parse(ymd + 'T' + hm + ':00+09:00');
const hol = { closed: true, name: '한글날', exempt: new Set(['29']), opened: false };
const open = { closed: false, name: null, exempt: new Set(['29']), opened: false };
const rows = [
  { source: 'mangoi', schedule_id: 1, start_ms: at('2026-10-09','14:00'), room_id: 'class-1' },   // 영어 → 뺀다
  { source: 'mangoi', schedule_id: 2, start_ms: at('2026-10-09','15:00'), room_id: 'class-2' },   // 중국어(29) → 남김
  { source: 'cafe24', start_ms: at('2026-10-09','16:00'), room_id: 'c24-9' },                     // 카페24 영어(원부 7) → 뺀다
  { source: 'cafe24', start_ms: at('2026-10-09','16:30'), room_id: 'c24-10' },                    // 카페24 중국어(원부 29) → 남김
  { source: 'cafe24', start_ms: at('2026-10-09','17:00'), room_id: 'c24-11' },                    // 카페24 이름으로만 중국어 → 남김
  { source: 'cafe24', start_ms: at('2026-10-09','17:30'), room_id: 'c24-12' },                    // 카페24 강사 모름 → 뺀다
  { source: 'cafe24', start_ms: at('2026-10-10','10:00'), room_id: 'c24-13' },                    // 카페24 평일 → 남김
  { source: 'mangoi', schedule_id: 3, start_ms: at('2026-10-10','00:10'), room_id: 'class-3' },   // 다음날(평일) → 남김
  { source: 'mangoi', schedule_id: 4, start_ms: at('2026-10-09','23:50'), room_id: 'class-4' },   // 휴강일 밤(KST) → 뺀다
];
const tOf = (c) => c.source === 'cafe24' ? ({ 'c24-9': '7', 'c24-10': '29', 'c24-11': EXEMPT_BY_NAME, 'c24-12': '', 'c24-13': '7' })[c.room_id] : ({ 1: '7', 2: '29', 3: '7', 4: '7' })[c.schedule_id];
const r = dropHolidayClosed(rows, tOf, { '2026-10-09': hol, '2026-10-10': open });
const nolook = dropHolidayClosed(rows, tOf, {});
console.log(JSON.stringify({ kept: r.kept.map(x => x.room_id), closed: r.closed, c24: r.closed_c24, name: r.name, nolook: nolook.kept.length }));
`);
  const r2 = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(t2, 'run.mjs')], { encoding: 'utf8' });
  let q = null; try { q = JSON.parse((r2.stdout || '').trim().split('\n').pop()); } catch {}
  ok('관제탑: 판정을 실제로 돌렸다', !!q, (r2.stderr || '').slice(0, 300));
  if (q) {
    ok('관제탑: 휴강 영어 수업(낮·KST 밤)은 뺀다', !q.kept.includes('class-1') && !q.kept.includes('class-4') && q.name === '한글날');
    ok('관제탑: 카페24 영어·강사 모름 수업도 뺀다', !q.kept.includes('c24-9') && !q.kept.includes('c24-12') && q.c24 === 2 && q.closed === 4);
    ok('짝: 중국어(원부·이름)·다음날 평일 수업은 남긴다', ['class-2', 'class-3', 'c24-10', 'c24-11', 'c24-13'].every(x => q.kept.includes(x)), JSON.stringify(q.kept));
    ok('짝: 판정을 못 읽으면 아무것도 안 뺀다(fail-open)', q.nolook === 9);
  }
  const a = rd('src/api-admin.ts');
  const ri = a.indexOf("path === '/api/admin/classes-now'");
  const route = ri >= 0 ? a.slice(ri, a.indexOf('return json({', a.indexOf('dropHolidayClosed(', ri)) + 1200) : '';
  ok('관제탑: 합친 «뒤» 에 뺀다(카페24 짝이 되살아나지 않게)', /dropHolidayClosed\(mergeClassesNow\(/.test(route));
  ok('관제탑: 방 어긋남 경보도 남은 수업으로만', /findRoomMismatches\(_mgOpen as any/.test(route));
  ok('관제탑: 응답에 휴강 건수를 싣는다', /holiday_closed: _hol\.closed/.test(route));
  ok('관제탑: 카페24 줄은 카페24 강사번호→원부 번호로 판정한다', /c\.source === 'cafe24' \? _c24Tid\.get\(String\(c\.room_id\)\)/.test(route) && /_c24Tid\.set\(String\(r\.room_id\), info && info\.teacherId \? info\.teacherId : \(byName \? EXEMPT_BY_NAME : ''\)\)/.test(route));
  ok('관제탑: 이름으로 중국어 강사를 알아본다(예외 강사 원부 이름·중국어·chinese)', /_exNames\.has\(normTeacherName\(nm\)\) \|\| \/중국어\|chinese\/i\.test\(nm\)/.test(route));
  // 급여
  const fi = a.indexOf('const holByDate');
  ok('급여: 날짜별 휴강 판정을 미리 읽는다', fi > 0 && /holByDate\[ds\] = await loadHolidayClosure\(env\.DB, ds\)/.test(a));
  const iPost = a.indexOf("if (schedStatus === 'postponed') st = 'postponed';");
  const iHol = a.indexOf("else if (isHolidayClosedFor(holByDate[dateStr], l.teacher_id)) st = 'holiday';");
  const iUp = a.indexOf("else if (upcoming) st = 'upcoming';", iPost);
  ok('급여: 연기 다음·예정 앞에서 «휴강» 으로 가른다', iPost > 0 && iHol > iPost && iUp > iHol);
  ok('급여: 휴강은 수업 수·금액에 안 넣는다', /if \(st === 'holiday'\) \{ agg\.holiday_count = \(agg\.holiday_count \|\| 0\) \+ 1; continue; \}/.test(a));
  ok('급여: 금액은 완료·결석·연기만 준다(휴강 0)', /if \(st === 'finish'\) amount = base;\s*else if \(st === 'student_absent'\)[^\n]*\n\s*else if \(st === 'postponed'\)[^\n]*\n/.test(a));
  const pub = (f) => readFileSync(join(ROOT, 'cloudflare-deploy/public', f), 'utf8');
  ok('급여 화면 셋이 «공휴일 휴강» 을 그린다(모르는 상태는 «수업 완료» 로 떨어진다)',
    /holiday:\s*\[en\?'🎌/.test(pub('admin/mypage.html')) && /l\.status === 'holiday'/.test(pub('teacher.html')) && /holiday:\s*\['🎌 공휴일 휴강'/.test(pub('js/adm-q3.js')));
  ok('adm-q3.js ?v= 를 올렸다', /adm-q3\.js\?v=11/.test(pub('admin.html')));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
