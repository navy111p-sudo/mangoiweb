import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(new URL('../cloudflare-deploy/package.json', import.meta.url))('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const mod = { exports: {} }; cache.set(name, mod);
  const source = readFileSync(new URL('../cloudflare-deploy/src/' + name + '.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', js)(mod, mod.exports, rel => load(rel.replace('./', '')));
  return mod.exports;
}
const { dropTeacherCafe24Duplicates: drop } = load('teacher-cafe24-duplicates');
const start = Date.parse('2026-10-23T20:00:00+09:00');
const schedule = Object.freeze({ id: 6827, user_id: 'mangoiai_yahee', scheduled_date: '2026-10-23', start_time: '20:00', sched_status: 'active' });
const local = Object.freeze({ kind: 'class', schedule_id: 6827, student_uid: schedule.user_id, start_ts: start, room_id: 'class-6827-20261023', status: 'done', class_state: 'done', join_open: false, attendance: { state: 'late' } });
const lms = Object.freeze({ room_id: 'c24-100', user_id: schedule.user_id, joined_at: start, left_at: start + 1200000 });
const dow = (raw, day) => raw === day || raw === 'Fri' && day === 5;

test('#6827 survives with room and attendance; only its LMS row is hidden', () => {
  assert.deepEqual(drop([lms], [schedule], [local], dow), { kept: [], hidden: 1 });
  assert.equal(local.schedule_id, 6827);
  assert.equal(local.room_id, 'class-6827-20261023');
  assert.equal(local.attendance.state, 'late');
  assert.equal(schedule.sched_status, 'active');
});
test('historical duplicate is hidden even when absent from today or selected week', () => {
  assert.equal(drop([lms], [schedule], [], dow).hidden, 1);
  assert.equal(drop([lms], [], [local], dow).hidden, 1); // cover schedule today
});
test('retain other students, timestamps, dates, missing identities, cancelled and postponed slots', () => {
  for (const patch of [{ user_id: 'other' }, { joined_at: start + 1 }, { joined_at: start + 86400000 }, { user_id: '' }])
    assert.equal(drop([{ ...lms, ...patch }], [schedule], [], dow).hidden, 0);
  for (const sched_status of ['cancelled', 'postponed']) {
    assert.equal(drop([lms], [{ ...schedule, sched_status }], [], dow).hidden, 0);
    assert.equal(drop([lms], [], [{ ...local, class_state: sched_status }], dow).hidden, 0);
  }
});
test('recurrence uses canonical weekday, start date and skipped occurrences', () => {
  const recurring = { ...schedule, scheduled_date: null, day_of_week: 'Fri', starts_on: '2026-10-01' };
  assert.equal(drop([lms], [recurring], [], dow).hidden, 1);
  assert.equal(drop([lms], [{ ...recurring, starts_on: '2026-10-24' }], [], dow).hidden, 0);
  assert.equal(drop([lms], [{ ...recurring, skip_dates: '2026-10-23' }], [], dow).hidden, 0);
  assert.equal(drop([lms], [{ ...recurring, day_of_week: 4 }], [], dow).hidden, 0);
});
test('invalid input and LMS/sample placeholders cannot suppress history', () => {
  for (const patch of [{ start_time: '25:00' }, { start_time: '' }, { user_id: 'lms' }, { user_id: 'type_seed' }])
    assert.equal(drop([lms], [{ ...schedule, ...patch }], [], dow).hidden, 0);
  for (const joined_at of [null, NaN, Infinity, 8640000000000000])
    assert.equal(drop([{ ...lms, joined_at }], [schedule], [], dow).hidden, 0);
  assert.equal(drop([lms], [], [{ ...local, kind: 'sample' }], dow).hidden, 0);
});
test('real portal append block keeps #6827 and retains unrelated LMS history', () => {
  const src = readFileSync(new URL('../cloudflare-deploy/src/api-teacher.ts', import.meta.url), 'utf8');
  const from = src.indexOf('const lmsVisible = dropTeacherCafe24Duplicates(');
  const to = src.indexOf('classes.sort((a, b) => a.start_ts - b.start_ts);', from);
  assert.ok(from > 0 && to > from);
  const js = ts.transpileModule(src.slice(from, to), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const classes = [local];
  const other = { ...lms, room_id: 'c24-101', user_id: 'other' };
  new Function('dropTeacherCafe24Duplicates', 'lmsRs', 'cafe24DedupeSchedules', 'classes', 'dowMatches', 'KST', 'pad', 'studentUidOf', js)
    (drop, { results: [lms, other] }, [schedule], classes, dow, 32400000, n => String(n).padStart(2, '0'), r => r.user_id);
  assert.equal(classes.length, 2);
  assert.equal(classes[0], local);
  assert.equal(classes[1].room_id, 'c24-101');
  assert.equal(classes[1].join_open, false);
});

/* 👥 쌍둥이 계정 중복 줄 (2026-10-28) — 예약표 `X` 와 옛 LMS `mangoai_X` 가 같은 분에 두 줄로 보이던 것.
   «감춘다» 옆에 «남긴다» 를 짝으로 둔다 — 짝이 없으면 «쌍둥이 LMS 줄을 전부 감추기» 도 통과한다.
   이름은 지어낸 예시(실제 학생 아님 — 저장소는 공개). */
const { confirmedTwinName } = load('teacher-cafe24-duplicates');
const tStart = Date.parse('2026-10-20T19:00:00+09:00');
const twinSched = Object.freeze({ id: 9001, user_id: 'kidaa', student_name: '가나다', scheduled_date: '2026-10-20', start_time: '19:00', sched_status: 'active' });
const twinLms = Object.freeze({ room_id: 'c24-900', user_id: 'mangoai_kidaa', username: '가나다 MANGOAI', joined_at: tStart, left_at: tStart + 1200000 });
const twinToday = Object.freeze({ kind: 'class', schedule_id: 9001, student_uid: 'kidaa', student_name: '가나다', start_ts: tStart, status: 'done', class_state: 'done' });

test('twin: confirmed same name at the exact minute hides only the LMS row', () => {
  assert.deepEqual(drop([twinLms], [twinSched], [], dow), { kept: [], hidden: 1 });       // 지난 날(예약표 펼치기)
  assert.deepEqual(drop([twinLms], [], [twinToday], dow), { kept: [], hidden: 1 });       // 오늘 수업
  assert.equal(twinSched.sched_status, 'active');                                          // 예약 줄은 그대로
  // 반대 방향(LMS 가 X, 예약이 mangoai_X)도 같은 사람
  const rev = drop([{ ...twinLms, user_id: 'kidaa', username: '가나다' }], [{ ...twinSched, user_id: 'mangoai_kidaa', student_name: '가나다 MANGOAI' }], [], dow);
  assert.equal(rev.hidden, 1);
});
test('twin: exact and twin duplicates are counted together; unrelated LMS rows survive', () => {
  const other = { ...lms, room_id: 'c24-101', user_id: 'other', username: '라마바' };
  const r = drop([lms, twinLms, other], [schedule, twinSched], [], dow);
  assert.equal(r.hidden, 2);
  assert.deepEqual(r.kept.map(x => x.room_id), ['c24-101']);
});
test('twin: kept when names are unknown, differ, or ids/time/state do not line up', () => {
  for (const patch of [
    { username: '' }, { username: null }, { username: 'mangoai_kidaa' }, { username: 'MANGOAI' },   // LMS 이름 모름
    { username: '가나라 MANGOAI' },                                                            // 이름이 다름
    { joined_at: tStart + 1 }, { joined_at: tStart + 86400000 },                              // 시각이 다름
    { user_id: 'mangoai_kidab' }, { user_id: 'xkidaa' }, { user_id: 'mangoai_' },             // 쌍둥이가 아님
    { user_id: 'mangoai_Kidaa' }, { user_id: 'Mangoai_kidaa' }, { user_id: 'MANGOAI_KIDAA' },  // 아이디는 대소문자 그대로(Kim/kim 실계정)
  ]) assert.equal(drop([{ ...twinLms, ...patch }], [twinSched], [], dow).hidden, 0, JSON.stringify(patch));
  for (const student_name of ['kidaa', 'KIDAA', '', null, '가나라'])                          // 예약 이름 모름·다름
    assert.equal(drop([twinLms], [{ ...twinSched, student_name }], [], dow).hidden, 0, String(student_name));
  for (const user_id of ['Kidaa', 'KIDAA'])                                                      // 예약 아이디 대소문자 다름
    assert.equal(drop([twinLms], [{ ...twinSched, user_id }], [], dow).hidden, 0, user_id);
  assert.equal(drop([twinLms], [], [{ ...twinToday, student_uid: 'Kidaa' }], dow).hidden, 0, 'today Kidaa');
  // 양쪽 이름이 «둘 다» 모름이어도 잇지 않는다 — «모름 == 모름» 을 같은 이름으로 세면 안 된다.
  for (const [username, student_name] of [['', 'kidaa'], [null, ''], ['mangoai_kidaa', 'kidaa'], ['MANGOAI', null]])
    assert.equal(drop([{ ...twinLms, username }], [{ ...twinSched, student_name }], [], dow).hidden, 0, 'both unknown ' + username);
  assert.equal(drop([{ ...twinLms, username: '' }], [], [{ ...twinToday, student_name: '' }], dow).hidden, 0, 'both unknown today');
  for (const sched_status of ['cancelled', 'postponed'])
    assert.equal(drop([twinLms], [{ ...twinSched, sched_status }], [], dow).hidden, 0, sched_status);
  for (const class_state of ['cancelled', 'postponed'])
    assert.equal(drop([twinLms], [], [{ ...twinToday, class_state }], dow).hidden, 0, class_state);
  assert.equal(drop([twinLms], [], [{ ...twinToday, kind: 'sample' }], dow).hidden, 0);
  assert.equal(drop([twinLms], [{ ...twinSched, user_id: 'lms' }], [], dow).hidden, 0);
});
test('twin: names compare exactly (case kept) and id-shaped names are unknown', () => {
  assert.equal(confirmedTwinName('가나다 MANGOAI', 'mangoai_kidaa'), '가나다');
  assert.equal(confirmedTwinName('kidaa', 'kidaa'), '');
  assert.equal(confirmedTwinName('kidaa', 'mangoai_kidaa'), '');           // 쌍둥이 아이디 그대로도 «모름»
  assert.equal(confirmedTwinName('mangoai_kidaa', 'kidaa'), '');
  assert.equal(confirmedTwinName('Mangoai_Kidaa', 'kidaa'), '');
  assert.equal(confirmedTwinName('  ', 'kidaa'), '');
  assert.equal(confirmedTwinName('Sarang', 'kidaa'), 'Sarang');
  const latin = { ...twinLms, username: 'sarang MANGOAI' };
  assert.equal(drop([latin], [{ ...twinSched, student_name: 'Sarang' }], [], dow).hidden, 0);
  assert.equal(drop([latin], [{ ...twinSched, student_name: 'sarang' }], [], dow).hidden, 1);
});
test('twin: real portal append block shows the lesson once', () => {
  const src = readFileSync(new URL('../cloudflare-deploy/src/api-teacher.ts', import.meta.url), 'utf8');
  const from = src.indexOf('const lmsVisible = dropTeacherCafe24Duplicates(');
  const to = src.indexOf('classes.sort((a, b) => a.start_ts - b.start_ts);', from);
  assert.ok(from > 0 && to > from);
  const js = ts.transpileModule(src.slice(from, to), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const classes = [{ ...twinToday, room_id: 'class-9001-20261020' }];
  new Function('dropTeacherCafe24Duplicates', 'lmsRs', 'cafe24DedupeSchedules', 'classes', 'dowMatches', 'KST', 'pad', 'studentUidOf', js)
    (drop, { results: [twinLms] }, [twinSched], classes, dow, 32400000, n => String(n).padStart(2, '0'), r => r.user_id);
  assert.deepEqual(classes.map(c => c.room_id), ['class-9001-20261020']);
});
test('twin: the LMS query still selects the name the twin check reads', () => {
  const src = readFileSync(new URL('../cloudflare-deploy/src/api-teacher.ts', import.meta.url), 'utf8');
  for (const name of ['lmsSqlJoin', 'lmsSqlPlain']) {
    const at = src.indexOf('const ' + name + ' =');
    const sql = src.slice(at, src.indexOf('`;', at));
    assert.ok(at > 0 && /SELECT[^]*\ba\.username\b[^]*FROM attendance a/.test(sql), name + ' selects a.username');
  }
});
