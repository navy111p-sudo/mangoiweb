// -*- coding: utf-8 -*-
/*
 * ⏸ 연기된 회차가 «오늘 열리지 않게» — 네 곳 + 다시 잡기 (2026-10-01)
 *
 *   [왜] Farrah(FAR) 10/1 14:00 수업을 「⏸ 연기 · 날짜 없이」로 처리했는데 「오늘 수업」이
 *        계속 「🟢 Open · Join」이었다. 서버는 status='postponed' 로 바꿨지만 그 값을 읽는 곳이
 *        한 군데도 없었다(모두 `status != 'cancelled'` 만). 연기한 수업이
 *        ① 오늘 수업 목록 ② 학생 입장(sessions/today) ③ 30분 전 알림 ④ 결석 감지에 그대로 걸렸다.
 *
 *   [무엇을 못 박나]
 *     A. 정본 isPostponedOccurrence — 날짜 지정 + postponed 만 참(반복 행은 안 건드린다)
 *     B. 네 곳이 그 정본을 «실제로» 지나는가(SELECT 에 status 가 실리는가 · 루프에서 continue 하는가)
 *     C. 오늘 수업: 상태가 'postponed' 가 되고 join_open 이 닫히는가 — 식을 오려 내 실제로 평가
 *     D. 다시 잡기(PATCH·decide 'moved')가 status 를 active 로 되돌리는가 — SQL 은 진짜 SQLite 에
 *     E. 화면 셋(admin·manager·branch)이 «연기됨» 을 글자로 말하는가
 *
 *   ⚠️ 문자열로만 묻지 않는다 — 판정은 오려 내 돌리고, «안 거른다» 를 짝으로 둔다.
 */
import { readFileSync } from 'node:fs';

const R = (p) => readFileSync(new URL('../cloudflare-deploy/' + p, import.meta.url), 'utf8');
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
};

/** 주석 벗기기(문자열 안은 지키며) — 부정·배선 검사가 설명 주석을 잡지 않게. */
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

const MOD = R('src/class-postponed.ts');
const MOD_S = strip(MOD);

// ── A. 정본을 실제로 돌린다 ──
console.log('\nA. 정본 isPostponedOccurrence');
let isPost = null, REACT = null;
try {
  const fnSrc = MOD_S.slice(MOD_S.indexOf('export function isPostponedOccurrence'), MOD_S.indexOf('export const REACTIVATE_POSTPONED_SQL'))
    .replace('export function', 'function').replace('(r: any): boolean', '(r)');
  const sqlM = /export const REACTIVATE_POSTPONED_SQL\s*=\s*(`[^`]*`)/.exec(MOD_S);
  isPost = new Function(fnSrc + '\nreturn isPostponedOccurrence;')();
  REACT = sqlM ? new Function('return ' + sqlM[1])() : null;
} catch (e) { ok('전제: 정본을 오려 냈다', false, e.message); }
ok('전제: 정본을 오려 냈다', typeof isPost === 'function' && typeof REACT === 'string');
if (typeof isPost === 'function') {
  const run = (r) => { try { return isPost(r); } catch (e) { return 'THREW:' + e.message; } };
  ok('날짜 지정 + postponed → 거른다', run({ status: 'postponed', scheduled_date: '2026-10-01' }) === true);
  ok('대소문자·공백이 섞여도 거른다', run({ status: ' Postponed ', scheduled_date: '2026-10-01' }) === true);
  ok('teacher portal 모양(sched_status)도 읽는다', run({ sched_status: 'postponed', scheduled_date: '2026-10-01' }) === true);
  ok('짝: active 는 안 거른다', run({ status: 'active', scheduled_date: '2026-10-01' }) === false);
  ok('짝: 매주 반복 행(날짜 없음)은 postponed 여도 안 거른다 — 모든 주가 사라진다', run({ status: 'postponed', scheduled_date: null, day_of_week: 'Thu' }) === false);
  ok('짝: 빈 날짜도 반복으로 본다', run({ status: 'postponed', scheduled_date: '  ' }) === false);
  ok('짝: cancelled 와 섞지 않는다', run({ status: 'cancelled', scheduled_date: '2026-10-01' }) === false);
  ok('짝: status 없음·null 은 안 거른다', run({ scheduled_date: '2026-10-01' }) === false && run(null) === false);
}

// ── D-1. 다시 잡기 SQL 을 진짜 SQLite 에 ──
console.log('\nD-1. REACTIVATE_POSTPONED_SQL (진짜 SQLite)');
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { console.log('  ⏭  node:sqlite 없음 — D-1 건너뜀'); }
if (DatabaseSync && REACT) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, status TEXT, scheduled_date TEXT)`);
  db.exec(`INSERT INTO class_schedules VALUES (1,'postponed','2026-10-01'),(2,'active','2026-10-01'),(3,'cancelled','2026-10-01')`);
  for (const id of [1, 2, 3]) db.prepare(REACT).run(id);
  const st = Object.fromEntries(db.prepare('SELECT id, status FROM class_schedules').all().map((r) => [r.id, r.status]));
  ok('연기된 행은 active 로 돌아온다', st[1] === 'active', st[1]);
  ok('짝: active 는 그대로', st[2] === 'active');
  ok('짝: cancelled 는 되살리지 않는다', st[3] === 'cancelled', st[3]);
}

// ── B. 네 곳의 배선 ──
console.log('\nB. 네 곳이 정본을 지난다');
function selectsBeforeCancelled(src) {
  const out = []; const re = /`SELECT([^`]*?)FROM class_schedules(?: cs)?\s+WHERE (?:cs\.)?status != 'cancelled'/g; let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}
for (const [file, nLoops] of [['src/absent-sweep.ts', 1], ['src/lesson-reminder.ts', 2]]) {
  const S = strip(R(file));
  const sels = selectsBeforeCancelled(S);
  ok(`${file}: 예약 SELECT 가 ${nLoops}개 있다(전제)`, sels.length === nLoops, sels.length);
  ok(`${file}: 그 SELECT 가 전부 status 칸을 싣는다`, sels.length > 0 && sels.every((c) => /\bstatus\b/.test(c)));
  const loopRe = /if \(!occurs\) continue;\s*seen\.add\(s\.id\);\s*if \(isPostponedOccurrence\(s\)(?: \|\| isSkippedOccurrence\(s, \w+, \w+\))?\) continue;/g;
  ok(`${file}: 루프마다 연기 회차를 건너뛴다`, (S.match(loopRe) || []).length === nLoops, (S.match(loopRe) || []).length);
  ok(`${file}: 정본을 import 한다`, /import \{[^}]*\bisPostponedOccurrence\b[^}]*\} from '\.\/class-postponed'/.test(S));
}
{
  const S = strip(R('src/api-mango.ts'));
  const i = S.indexOf('const runPass = async');
  const blk = i >= 0 ? S.slice(i, S.indexOf('let matchedBy', i)) : '';
  ok('sessions/today: runPass 를 오려 냈다(전제)', blk.length > 200);
  ok('sessions/today: SELECT 가 status 를 싣는다', /cs\.status/.test(blk) && /scheduled_date, start_time, duration_min, teacher_id, status/.test(blk));
  ok('sessions/today: 연기 회차를 건너뛴다', /if \(isPostponedOccurrence\(s\)(?: \|\| isSkippedOccurrence\(s, \w+, \w+\))?\) continue;/.test(blk));
  ok('sessions/today: 건너뛰기가 out.push 보다 앞이다', blk.indexOf('isPostponedOccurrence(s)') > 0 && blk.indexOf('isPostponedOccurrence(s)') < blk.indexOf('out.push'));
}

{
  const S = strip(R('src/api-teacher.ts'));
  ok('강사 포털: 정본으로 판정한다', /const _postponed = isPostponedOccurrence\(s\);/.test(S));
  ok('강사 포털: 상태를 «postponed» 로 내려준다', /: \(?_postponed(?: \|\| isSkippedOccurrence\(s, todayStr, _skipsW\)\))? \? 'postponed'/.test(S));
  ok('강사 포털: 입장을 닫는다', /can_enter: !_postponed (?:&& !isSkippedOccurrence\(s, todayStr, _skipsW\) )?&& now >= enterFromTs/.test(S) && /join_open: !_postponed (?:&& !isSkippedOccurrence\(s, todayStr, _skipsW\) )?&& now >= open_at_ts/.test(S));
  const H = strip(R('public/teacher.html'));
  const a = H.indexOf("if (c.class_state === 'postponed'){");
  const blk = a > 0 ? H.slice(a, H.indexOf('continue;', a)) : '';
  ok('teacher.html: 연기 줄을 따로 그리고 입장 버튼을 안 준다', blk.length > 0 && !/enter|joinClass/i.test(blk.replace(/stPill/g, '')));
}
// (실제 응답은 schedule_move_room_sync_harness 2c 가 번들로 끝에서 끝까지 돌린다)

// ── F. 오늘 수업 «출결·강사 입장» 칸 — 연기를 «결석·미입장» 으로 말하지 않는가(정본을 실제로 돌림) ──
console.log('\nF. class-today-extras 판정');
{
  const { stripTypeScriptTypes } = await import('node:module');
  const X = R('src/class-today-extras.ts');
  const take = (name) => {
    const i = X.indexOf('export function ' + name + '(');
    if (i < 0) return '';
    const b = X.indexOf('{', X.indexOf(')', X.indexOf(':', i)));
    let d = 0, k = b;
    for (; k < X.length; k++) { if (X[k] === '{') d++; else if (X[k] === '}') { d--; if (!d) break; } }
    return X.slice(i, k + 1).replace('export function', 'function');
  };
  let jt = null, js = null;
  try {
    const src = stripTypeScriptTypes('const STUDENT_LATE_GRACE_MS = 300000; const TEACHER_LATE_GRACE_MS = 60000;\n'
      + take('judgeTeacherEntry') + '\n' + take('judgeStudentAttendance'));
    [jt, js] = new Function(src + '\nreturn [judgeTeacherEntry, judgeStudentAttendance];')();
  } catch (e) { console.log('   (' + e.message + ')'); }
  ok('전제: 두 판정을 오려 냈다', typeof jt === 'function' && typeof js === 'function');
  if (jt && js) {
    const safe = (f) => { try { return f(); } catch (e) { return { state: 'THREW' }; } };
    ok('강사 입장: 연기면 «postponed»(미입장 아님)', safe(() => jt('mangoi', 1000, 'postponed', { present: false, from: null })).state === 'postponed');
    ok('학생 출결: 연기면 «postponed»(결석 아님)', safe(() => js('mangoi', 1000, 'postponed', null, 0)).state === 'postponed');
    ok('짝: 끝난 수업에 기록이 없으면 여전히 결석', safe(() => js('mangoi', 1000, 'ended', null, 0)).state === 'absent');
    ok('짝: 끝난 수업에 강사 기록이 없으면 여전히 «none»', safe(() => jt('mangoi', 1000, 'ended', { present: false, from: null })).state === 'none');
  }
  const T = strip(R('public/js/adm-today-classes.js'));
  ok('admin: 강사 입장 칸이 postponed 를 그린다', /e\.state === 'postponed'/.test(T));
  ok('admin: 출결 칸이 postponed 를 그린다', /postponed:\s*\['⏸', '연기됨', 'Postponed'/.test(T));
  for (const f of ['public/manager.html', 'public/branch.html']) {
    const H = strip(R(f));
    ok(`${f}: 강사 입장·출결 칸이 postponed 를 그린다`, /te\.state === 'postponed'/.test(H) && /postponed: \['⏸', 'Postponed', '연기됨'\]/.test(H));
  }
}
// ── G. «다음 수업»·관찰·학생 «내 수업» 카드 ──
console.log('\nG. 다음 수업 · 수업 관찰 · 내 수업 카드');
{
  const TS = strip(R('src/api-teacher.ts'));
  ok('강사 배너(?only=next): 연기·취소를 다음 수업으로 고르지 않는다', /c\.kind === 'class' && c\.class_state !== 'postponed' && c\.class_state !== 'cancelled'/.test(TS));
  ok('강사 포털 매니저 블록: status 를 싣고 연기 회차를 건너뛴다', /cs\.duration_min, cs\.status, cs\.teacher_id/.test(TS) && /if \(!occurs\) continue;\s*if \(isPostponedOccurrence\(s\)(?: \|\| isSkippedOccurrence\(s, \w+, \w+\))?\) continue;/.test(TS));
  const TH = strip(R('public/teacher.html'));
  const n = TH.indexOf('if (c.absence_hold) continue;');
  ok('teacher.html «다음 수업» 띠: 연기·취소를 건너뛴다', n > 0 && /if \(c\.class_state === 'postponed' \|\| c\.class_state === 'cancelled'\) continue;/.test(TH.slice(n, n + 400)));
  const AS = strip(R('src/api-admin.ts'));
  ok('classes-now: status 를 싣고 연기 회차를 거른다', /cs\.duration_min, cs\.status, cs\.teacher_id\$\{_soSelCn\}/.test(AS) && /schedRows = \(\(rs2\.results \|\| \[\]\) as any\[\]\)\.filter\(\(r: any\) => !isPostponedOccurrence\(r\)\);/.test(AS));
  const MS = strip(R('src/api-mango.ts'));
  const i = MS.indexOf('const runMsPass = async');
  const blk = i > 0 ? MS.slice(i, MS.indexOf('let msRows', i)) : '';
  ok('schedule/mine: 두 SELECT 가 status 를 싣는다', (blk.match(/class_type, (cs\.)?status/g) || []).length === 2);
  ok('schedule/mine: 결과에서 연기 회차를 거른다', /return _ms\.filter\(\(r: any\) => !isPostponedOccurrence\(r\)\);/.test(blk));
}

// ── C. 오늘 수업 목록: 식을 실제로 평가 ──
console.log('\nC. /api/admin/classes/today');
const ADM = R('src/api-admin.ts');
const ADM_S = strip(ADM);
{
  const i = ADM_S.indexOf("path === '/api/admin/classes/today'");
  const blk = i >= 0 ? ADM_S.slice(i, i + 20000) : '';
  ok('전제: 핸들러를 찾았다', blk.length > 0);
  const setM = /const _postponed = isPostponedOccurrence\(s\)(?: \|\| isSkippedOccurrence\(s, \w+, \w+\))?;\s*if \(_postponed\) status = 'postponed';/.exec(blk);
  ok('상태를 postponed 로 바꾼다', !!setM);
  const jm = /join_open:\s*([^,\n]+),/.exec(blk);
  let jf = null;
  try { jf = jm ? new Function('_postponed', 'nowMs', 'open_at_ts', 'close_at_ts', 'return (' + jm[1] + ');') : null; } catch (e) { jf = null; }
  ok('전제: join_open 식을 오려 냈다', typeof jf === 'function', jm && jm[1]);
  if (jf) {
    ok('연기면 입장 시간대 안이어도 닫힌다', jf(true, 100, 50, 200) === false);
    ok('짝: 연기 아니면 시간대 안에서 열린다', jf(false, 100, 50, 200) === true);
    ok('짝: 연기 아니어도 시간대 밖은 닫힌다', jf(false, 300, 50, 200) === false);
  }
  ok('postponed 칸을 내려준다', /postponed:\s*_postponed,/.test(blk));
}

// ── D-2. 다시 잡기 배선 ──
console.log('\nD-2. 다시 잡기 — PATCH · decide');
{
  const i = ADM_S.indexOf("path === '/api/admin/schedule-requests/decide'");
  const blk = i >= 0 ? ADM_S.slice(i, ADM_S.indexOf("path === '/api/admin/classes/today'", i)) : '';
  ok('decide: 예약 SELECT 가 status 를 싣는다', /SELECT id, scheduled_date, start_time, duration_min, user_id, teacher_id, source, status(?:, [a-z_, ]+)? FROM class_schedules/.test(blk));
  ok('decide: 연기 상태면 되살리기 문장을 함께 돌린다',
    /if \(String\(\(cs as any\)\?\.status \|\| ''\) === 'postponed'\) _mvAll\.push\(env\.DB\.prepare\(REACTIVATE_POSTPONED_SQL\)\.bind\(row\.schedule_id\)\);/.test(blk));
  ok('decide: 여러 문장이면 batch 로 묶는다', /if \(_mvAll\.length > 1\) await env\.DB\.batch\(_mvAll\);\s*else await _mv\.run\(\);/.test(blk));
  const j = ADM_S.indexOf("/^\\/api\\/admin\\/class-schedules\\/\\d+$/.test(path)) {", ADM_S.indexOf("method === 'PATCH' || method === 'PUT'"));
  const pb = j >= 0 ? ADM_S.slice(j, j + 12000) : '';
  ok('PATCH: 전제 — 핸들러를 찾았다', pb.length > 0);
  ok('PATCH: 연기 회차를 날짜·시각으로 옮기면 active 로 되돌린다',
    /if \(isPostponedOccurrence\(_pchRow\) && sets\.some\(\(x\) => x\.startsWith\('scheduled_date'\) \|\| x\.startsWith\('start_time'\)\)\) \{\s*sets\.push\(`status = 'active'`\);/.test(pb));
  ok('PATCH: 되돌리기가 UPDATE 보다 앞에서 sets 에 들어간다',
    pb.indexOf("status = 'active'") > 0 && pb.indexOf("status = 'active'") < pb.indexOf('UPDATE class_schedules SET ${sets.join'));
}

// ── E. 화면 ──
console.log('\nE. 화면 셋');
{
  const T = strip(R('public/js/adm-today-classes.js'));
  ok('admin: BADGE 에 postponed 가 있다', /postponed:\s*\{\s*ko:\s*'⏸ 연기됨'/.test(T));
  const a = T.indexOf("} else if (s.postponed) {"), b = T.indexOf('act = s.join_open');
  ok('admin: 연기 줄은 입장 버튼 분기보다 먼저 갈린다', a > 0 && b > 0 && a < b);
  const pblk = a > 0 ? T.slice(a, b) : '';
  ok('admin: 연기 줄에 입장·참관 버튼을 안 준다', pblk && !/tcEnterClass|tcObserveClass/.test(pblk));
  ok('admin: 연기 줄에 «다시 잡기» 를 준다', /tc-move-pin/.test(pblk));
  for (const f of ['public/manager.html', 'public/branch.html']) {
    const H = strip(R(f));
    // 화면 문구는 #1322(같은 날 다른 세션)가 정한 것을 쓴다 — 서버 칸 postponed 를 보고 입장 대신 «연기됨» 을 그린다
    ok(`${f}: 연기 줄에 글자 표시를 붙인다`, /if \(r\.postponed\) act = '<span class="tag hot">' \+ esc\(T\('⏸ Postponed', '⏸ 연기됨'\)\)/.test(H));
  }
  const M = strip(R('public/js/class-move-modal.js'));
  ok('일괄 연기: 이미 연기된 줄은 빼고 이유를 말한다', /else if \(r\.status === 'postponed'\) why = 'postponed';/.test(M) && /w === 'postponed'/.test(M));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
