// -*- coding: utf-8 -*-
/*
 * ⏭ 반복 수업의 «그 회차만» 연기 — 빠진 회차가 모든 곳에서 안 열리는가 (2026-10-01)
 *
 *   [왜] jeong(정우영) 매주 화·수·목·금 19:20 수업 중 금 10/2 하나만 연기를 승인했는데,
 *        서버는 반복 행이라 'recorded'(기록만)로 남기고 아무것도 안 바꿨다 → 그날도 입장·알림·
 *        결석 감지·급여가 그대로 돌 상태였다. 이제 «승인된 연기·변경 요청의 (schedule_id, orig_date)» 를
 *        읽는 쪽이 보고 그 회차만 뺀다(정본 src/class-postponed.ts). 반복 행 자체는 안 바꾼다.
 *
 *   A. 정본을 실제로 돌린다 — isSkippedOccurrence · loadOccurrenceSkips(진짜 SQLite) · skippedInfo · recurringClash
 *   B. 읽는 곳 9자리가 그 정본을 «실제로 조건으로» 쓰는가(주석 벗긴 사본)
 *   C. 학생 «내 수업» 카드의 다음 회차 건너뛰기 — 블록을 오려 내 실제로 돌린다
 *   D. 화면 두 곳이 새 결과('skipped'·'skipped_makeup')를 말하는가
 *
 *   ⚠️ 「막는다」 옆에 「안 막는다」를 짝으로 — 짝이 없으면 «전부 막기» 도 통과한다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, 'cloudflare-deploy', p), 'utf8');
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); }
};
function strip(src) {
  let out = '', i = 0, inBlock = false, inLine = false, q = '';
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && d === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && d === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c; i++;
  }
  return out;
}
/** start 위치 다음 첫 '{' 부터 짝이 맞는 '}' 까지. */
function braceBlock(src, start) {
  const b = src.indexOf('{', start); if (b < 0) return '';
  let d = 0;
  for (let k = b; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(start, k + 1); } }
  return '';
}

let tsMod = null;
for (const cand of ['typescript', join(ROOT, 'cloudflare-deploy', 'node_modules', 'typescript'), '/opt/node22/lib/node_modules/typescript/lib/typescript.js']) { try { tsMod = createRequire(import.meta.url)(cand); break; } catch {} }
ok('전제: typescript 를 찾았다(정본을 실제로 돌리려면 필요)', !!tsMod);

// ── A. 정본 ──
console.log('\nA. 정본 class-postponed.ts');
let M = {};
try {
  const js = tsMod.transpileModule(R('src/class-postponed.ts'), { compilerOptions: { target: 99, module: 1 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', js)(m, m.exports); M = m.exports;
} catch (e) { ok('전제: 정본을 불러왔다', false, e.message); }
ok('전제: 정본을 불러왔다', ['isSkippedOccurrence', 'loadOccurrenceSkips', 'skippedInfo', 'recurringClash', 'recurDows'].every((k) => typeof M[k] === 'function'));
const safe = (f) => { try { return f(); } catch (e) { return 'THREW:' + e.message; } };

if (M.isSkippedOccurrence) {
  const sk = new Map([['851|2026-10-02', { type: 'postpone', moved: true }]]);
  const rec = { id: 851, scheduled_date: null, day_of_week: 'fri' };
  ok('반복 행의 그 날짜는 빠진다', safe(() => M.isSkippedOccurrence(rec, '2026-10-02', sk)) === true);
  ok('짝: 같은 반복 행의 다음 주는 안 빠진다', safe(() => M.isSkippedOccurrence(rec, '2026-10-09', sk)) === false);
  ok('짝: 다른 수업 번호는 안 빠진다', safe(() => M.isSkippedOccurrence({ id: 850, scheduled_date: null }, '2026-10-02', sk)) === false);
  ok('짝: 날짜 지정 행은 (번호·날짜가 같아도) 안 빠진다 — 옮긴 새 날짜를 지우면 안 된다', safe(() => M.isSkippedOccurrence({ id: 851, scheduled_date: '2026-10-02' }, '2026-10-02', sk)) === false);
  ok('짝: 빈 Map·null 이면 아무것도 안 빠진다(fail-open)', safe(() => M.isSkippedOccurrence(rec, '2026-10-02', new Map())) === false && safe(() => M.isSkippedOccurrence(rec, '2026-10-02', null)) === false);
  ok('날짜에 시각이 붙어 와도 날짜로 본다', safe(() => M.isSkippedOccurrence(rec, '2026-10-02T19:20', sk)) === true);
  ok('skippedInfo: 빠졌으면 종류·옮김 여부를 준다', JSON.stringify(safe(() => M.skippedInfo(rec, '2026-10-02', sk))) === '{"type":"postpone","moved":true}');
  ok('짝: skippedInfo — 안 빠졌으면 null', safe(() => M.skippedInfo(rec, '2026-10-09', sk)) === null);
}

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
ok('전제: node:sqlite', !!DatabaseSync);
if (DatabaseSync && M.loadOccurrenceSkips) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE schedule_change_requests (id INTEGER PRIMARY KEY, schedule_id INTEGER, request_type TEXT, orig_date TEXT, new_date TEXT, new_time TEXT, status TEXT)`);
  db.exec(`INSERT INTO schedule_change_requests (schedule_id, request_type, orig_date, new_date, new_time, status) VALUES
    (851,'postpone','2026-10-02','2026-10-09','19:20','approved'),
    (850,'postpone','2026-10-01',NULL,NULL,'approved'),
    (849,'change','2026-10-07','2026-10-07','20:00','approved'),
    (848,'postpone','2026-10-06','2026-10-13','19:20','pending'),
    (847,'postpone','2026-10-03',NULL,NULL,'rejected'),
    (846,'cancel','2026-10-03',NULL,NULL,'approved'),
    (845,'postpone','2026-12-25',NULL,NULL,'approved')`);
  const wrap = (sql) => { const st = db.prepare(sql); const ex = (a) => ({ all: async () => ({ results: st.all(...a) }) }); return Object.assign(ex([]), { bind: (...a) => ex(a) }); };
  const sk = await M.loadOccurrenceSkips({ DB: { prepare: wrap } }, '2026-10-01', '2026-10-31');
  ok('승인된 연기를 읽는다(새 일시 있음 → moved)', JSON.stringify(sk.get('851|2026-10-02')) === '{"type":"postpone","moved":true}', [...sk]);
  ok('승인된 «날짜 없는» 연기 → moved=false(급여는 연기 지급률)', sk.get('850|2026-10-01')?.moved === false);
  ok('승인된 변경도 읽는다', sk.get('849|2026-10-07')?.type === 'change');
  ok('짝: 대기·거절은 안 읽는다(승인 전엔 수업이 그대로 열린다)', !sk.has('848|2026-10-06') && !sk.has('847|2026-10-03'));
  ok('짝: cancel 종류는 안 읽는다', !sk.has('846|2026-10-03'));
  ok('짝: 범위 밖 날짜는 안 읽는다', !sk.has('845|2026-12-25'));
  const boom = await M.loadOccurrenceSkips({ DB: { prepare: () => { throw new Error('D1 down'); } } }, '2026-10-01', '2026-10-31');
  ok('조회가 던지면 빈 Map(fail-open — 예전 그대로 수업이 열린다)', boom instanceof Map && boom.size === 0);
}

if (M.recurringClash) {
  const jeongFri = { id: 851, user_id: 'jeong', teacher_id: '29', day_of_week: 'fri', scheduled_date: null, start_time: '19:20', duration_min: 20, status: 'active' };
  const q = (o) => Object.assign({ date: '2026-10-09', start: '19:20', dur: 20, userId: 'jeong', teacherId: '29' }, o);
  ok('그 학생의 다음 주 같은 정규 수업과 겹치면 충돌(실사고 #13 모양)', safe(() => M.recurringClash([jeongFri], q({}))) === jeongFri);
  ok('짝: 다른 요일이면 안 겹친다', safe(() => M.recurringClash([jeongFri], q({ date: '2026-10-08' }))) === null);
  ok('짝: 시간이 안 겹치면 아니다(19:40 시작)', safe(() => M.recurringClash([jeongFri], q({ start: '19:40' }))) === null);
  ok('그날 이미 빠진 회차는 빈자리로 본다', safe(() => M.recurringClash([jeongFri], q({}), new Map([['851|2026-10-09', { type: 'postpone', moved: false }]]))) === null);
  ok('시작일 전인 반복은 안 본다', safe(() => M.recurringClash([{ ...jeongFri, starts_on: '2026-11-01' }], q({}))) === null);
  ok('짝: 시작일이 지난 반복은 본다', (safe(() => M.recurringClash([{ ...jeongFri, starts_on: '2026-09-01' }], q({}))) || {}).id === 851);
  const otherSame = { ...jeongFri, id: 9, user_id: 'kim' };
  ok('강사의 다른 학생 수업 — 같은 시각·같은 길이(합반)는 충돌 아님', safe(() => M.recurringClash([otherSame], q({}))) === null);
  ok('짝: 강사의 다른 학생 수업이 어긋나게 겹치면 충돌', safe(() => M.recurringClash([{ ...otherSame, start_time: '19:30' }], q({}))) !== null);
  ok('짝: 남의 강사·남의 학생이면 안 본다', safe(() => M.recurringClash([{ ...otherSame, teacher_id: '7' }], q({}))) === null);
  ok('짝: 날짜 지정 행은 여기서 안 본다(공용 검사 몫)', safe(() => M.recurringClash([{ ...jeongFri, scheduled_date: '2026-10-09' }], q({}))) === null);
  ok('짝: 취소된 반복은 안 본다', safe(() => M.recurringClash([{ ...jeongFri, status: 'cancelled' }], q({}))) === null);
  ok('한글·숫자·나열 요일도 읽는다', safe(() => M.recurringClash([{ ...jeongFri, day_of_week: '금' }], q({}))) !== null
     && safe(() => M.recurringClash([{ ...jeongFri, day_of_week: '1,5' }], q({}))) !== null);
  /* 요일 판정이 absence-hold.ts 의 dowList 와 같은 답인가 — 옮겨 적은 것이라 어긋나면 조용히 틀린다. */
  const AH = R('src/absence-hold.ts');
  let dl = null;
  try {
    const dowBlk = AH.slice(AH.indexOf('const DOW'), AH.indexOf('export function dowList'));
    const fnBlk = braceBlock(AH, AH.indexOf('export function dowList')).replace('export function', 'function');
    dl = new Function(tsMod.transpileModule(dowBlk + '\n' + fnBlk, { compilerOptions: { target: 99 } }).outputText + '\nreturn dowList;')();
  } catch (e) { console.log('   (' + e.message + ')'); }
  ok('전제: absence-hold dowList 를 오려 냈다', typeof dl === 'function');
  if (dl) {
    const cases = ['fri', 'Fri', 'FRIDAY', '금', '금요일', '5', '1,3,5', 'mon tue', '화·목', 'x', '', null, '7', 'sun/sat'];
    const bad = cases.filter((c) => JSON.stringify(dl(c)) !== JSON.stringify(M.recurDows(c)));
    ok('요일 판정이 정본(dowList)과 같다', bad.length === 0, bad);
  }
}

// ── B. 읽는 곳의 배선 ──
console.log('\nB. 읽는 곳이 정본을 «조건으로» 쓴다');
const SK = (v, d, m) => new RegExp(`isSkippedOccurrence\\(${v}, ${d}, ${m}\\)`);
{
  const S = strip(R('src/api-mango.ts'));
  const i = S.indexOf('const runPass = async');
  const pre = S.slice(Math.max(0, i - 400), i);
  const blk = i >= 0 ? S.slice(i, S.indexOf('let matchedBy', i)) : '';
  ok('sessions/today: 오늘 날짜로 정본을 읽는다(runPass 앞)', /const _skipsT = await loadOccurrenceSkips\(env, todayStr, todayStr\);/.test(pre));
  ok('sessions/today: 그 회차를 건너뛰고(continue) out.push 보다 앞이다',
    /if \(isPostponedOccurrence\(s\) \|\| isSkippedOccurrence\(s, todayStr, _skipsT\)\) continue;/.test(blk) && blk.indexOf('isSkippedOccurrence') < blk.indexOf('out.push'));
}
{
  const S = strip(R('src/api-teacher.ts'));
  ok('강사 포털: 오늘과 이번 주를 덮는 범위로 읽는다', /const _skW = \[todayStr, \.\.\.weekDates\]\.sort\(\);\s*const _skipsW = await loadOccurrenceSkips\(env, _skW\[0\], _skW\[_skW\.length - 1\]\);/.test(S));
  ok('강사 포털 주간표: 그 칸만 건너뛴다(반복 행 통째가 아니라)', /if \(!hit \|\| isSkippedOccurrence\(s, weekDays\[wi\]\.date, _skipsW\)\) continue;/.test(S));
  ok('강사 포털 오늘: «연기됨» 으로 그린다', /: \(_postponed \|\| isSkippedOccurrence\(s, todayStr, _skipsW\)\) \? 'postponed'/.test(S));
  ok('강사 포털 오늘: 입장을 닫는다(join_open·can_enter 둘 다)', /join_open: !_postponed && !isSkippedOccurrence\(s, todayStr, _skipsW\) && now/.test(S) && /can_enter: !_postponed && !isSkippedOccurrence\(s, todayStr, _skipsW\) && now/.test(S));
  ok('매니저 목록: 오늘 날짜로 읽고 건너뛴다', /const _skipsM = await loadOccurrenceSkips\(env, todayStr, todayStr\);/.test(S) && /if \(isPostponedOccurrence\(s\) \|\| isSkippedOccurrence\(s, todayStr, _skipsM\)\) continue;/.test(S));
}
for (const [file, n] of [['src/absent-sweep.ts', 1], ['src/lesson-reminder.ts', 2]]) {
  const S = strip(R(file));
  ok(`${file}: 오늘 날짜로 ${n}번 읽는다`, (S.match(/const _skips = await loadOccurrenceSkips\(env, todayStr, todayStr\);/g) || []).length === n);
  ok(`${file}: 루프 ${n}곳이 그 회차를 건너뛴다`, (S.match(/seen\.add\(s\.id\);\s*if \(isPostponedOccurrence\(s\) \|\| isSkippedOccurrence\(s, todayStr, _skips\)\) continue;/g) || []).length === n);
}
{
  const S = strip(R('src/api-admin.ts'));
  ok('classes/today: 요청한 날짜로 읽고 «연기됨» 으로 그린다', /const _skipsTd = await loadOccurrenceSkips\(env, dateStr, dateStr\);/.test(S)
     && /const _postponed = isPostponedOccurrence\(s\) \|\| isSkippedOccurrence\(s, dateStr, _skipsTd\);\s*if \(_postponed\) status = 'postponed';/.test(S));
  ok('classes-now: 방 번호의 (번호, 날짜)로 거른다', /\.filter\(\(c: any\) => \{\s*const m = \/\^class-\(\\d\+\)-\(\\d\{4\}\)\(\\d\{2\}\)\(\\d\{2\}\)\$\/\.exec\(String\(c\.room_id \|\| ''\)\);\s*return !m \|\| !isSkippedOccurrence\(_rowByIdN\.get\(Number\(m\[1\]\)\), `\$\{m\[2\]\}-\$\{m\[3\]\}-\$\{m\[4\]\}`, _skipsN\);/.test(S));
  ok('급여: 그 달 범위로 읽는다', /const _skipsPay = await loadOccurrenceSkips\(env, `\$\{ymPrefix\}-01`, `\$\{ymPrefix\}-31`\);/.test(S));
  ok('급여: 옮겼거나 변경이면 원래 회차를 세지 않는다', /const _skp = skippedInfo\(l, dateStr, _skipsPay\);\s*if \(_skp && \(_skp\.moved \|\| _skp\.type === 'change'\)\) continue;/.test(S));
  ok('급여: 날짜 없는 연기는 «postponed» 지급률', /if \(schedStatus === 'postponed' \|\| _skp\) st = 'postponed';/.test(S));
  /* decide: 반복 갈래가 'recorded' 앞에서 'skipped' 로 가는가(순서). */
  const i = S.indexOf("path === '/api/admin/schedule-requests/decide'");
  const blk = i >= 0 ? S.slice(i, S.indexOf("path === '/api/admin/classes/today'", i)) : '';
  ok('decide: 반복 갈래(_recOd)가 «recorded» 보다 앞이다', blk.indexOf("} else if (_recOd) {") > 0 && blk.indexOf("} else if (_recOd) {") < blk.indexOf("applied = 'recorded';"));
  ok('decide: 보강을 만들기 전에 반복 행 겹침을 본다', blk.indexOf('recurringClash(') > 0 && blk.indexOf('recurringClash(') < blk.indexOf('INSERT INTO class_schedules'));
  ok('decide: 보강 행의 source 가 요청 번호를 단다(추적용)', /`postpone:\$\{row\.id\}`/.test(blk));
}

// ── C. 학생 «내 수업» 카드 — 다음 회차 건너뛰기를 실제로 돌린다 ──
console.log('\nC. schedule/mine 다음 회차');
{
  const S = strip(R('src/api-mango.ts'));
  const a = S.indexOf('if (nextDate && isSkippedOccurrence(r, nextDate, msSkips))');
  const blk = a > 0 ? braceBlock(S, a) : '';
  ok('전제: 블록을 오려 냈다', blk.length > 100);
  ok('schedule/mine: 70일 범위로 읽는다', /const msSkips = await loadOccurrenceSkips\(env, msTodayStr, new Date\(Date\.UTC\(msKY, msKMo, msKD \+ 70\)\)\.toISOString\(\)\.slice\(0, 10\)\);/.test(S));
  if (blk && M.isSkippedOccurrence) {
    const run = (r, nextDate, dows, skips) => {
      const f = new Function('r', 'nextDate', 'dows', 'msSkips', 'isSkippedOccurrence', 'msPad', 'hh', 'mm', 'MS_KST',
        'let nextStartTs = 0;\n' + tsMod.transpileModule(blk, { compilerOptions: { target: 99 } }).outputText + '\nreturn { nextDate, nextStartTs };');
      return safe(() => f(r, nextDate, dows, skips, M.isSkippedOccurrence, (n) => String(n).padStart(2, '0'), 19, 20, 9 * 3600 * 1000));
    };
    const r = { id: 851, scheduled_date: null };
    const one = new Map([['851|2026-10-02', { type: 'postpone', moved: true }]]);
    ok('빠진 금 10/2 → 다음 금 10/9 로', run(r, '2026-10-02', [5], one).nextDate === '2026-10-09');
    ok('주 2회면 같은 주의 다른 요일로(화·금: 10/2 빠짐 → 10/6 화)', run(r, '2026-10-02', [2, 5], one).nextDate === '2026-10-06');
    ok('두 주 연속 빠지면 그다음으로', run(r, '2026-10-02', [5], new Map([...one, ['851|2026-10-09', { type: 'postpone', moved: false }]])).nextDate === '2026-10-16');
    ok('짝: 안 빠졌으면 그대로', run(r, '2026-10-02', [5], new Map()).nextDate === '2026-10-02');
    ok('시작 시각도 그 날짜로 맞춘다', run(r, '2026-10-02', [5], one).nextStartTs === Date.UTC(2026, 9, 9, 19, 20) - 9 * 3600 * 1000);
  }
}

// ── D. 화면이 새 결과를 말한다 ──
console.log('\nD. 화면');
{
  const A = strip(R('public/js/adm-r11.js'));
  ok("adm-r11: 'skipped_makeup' 를 말한다", /d\.applied === 'skipped_makeup'\s*\?\s*\(isEn\?'[^']*makeup[^']*':'[^']*보강[^']*'\)/.test(A));
  ok("adm-r11: 'skipped' — 사유가 있으면 그 사유를", /d\.applied === 'skipped'\s*\?\s*\(d\.message \?/.test(A));
  const C = strip(R('public/js/class-move-modal.js'));
  ok("class-move-modal: 'skipped'·'skipped_makeup' 를 말한다", /a === 'skipped_makeup'/.test(C) && /a === 'skipped'/.test(C));
  ok('class-move-modal: 묶음 연기에서 반복 «그 회차만» 도 성공으로 센다', /var _pp = res\.j\.applied === 'postponed' \|\| res\.j\.applied === 'skipped' \|\| res\.j\.applied === 'skipped_makeup';/.test(C));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
