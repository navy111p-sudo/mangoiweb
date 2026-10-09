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

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
