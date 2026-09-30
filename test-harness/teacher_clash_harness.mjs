#!/usr/bin/env node
// ⚔️ teacher_clash_harness — «같은 강사·같은 시간에 LMS(카페24) 수업과 망고아이 수업이 둘 다 있나»
//   대상: cloudflare-deploy/src/teacher-clash.ts (순수 함수 — 실제로 돌린다)
//   발단: 2026-09-30 Zee 수요일 20:00 — 카페24 정규수업(umc276) + 망고아이 반복수업(yahee, id 3498).
//   그 망고아이 행은 «날짜 없는 반복 수업» 이라 미러의 loadExisting 이 한 번도 못 봤다.
//   ⚠️ 「잡는다」 옆에 「안 잡는다」를 짝으로 둔다 — 짝이 없으면 «전부 겹침» 도 통과한다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/src/' + f), 'utf8');
const P = process.env.CLASH_SRC || resolve(__dir, '../cloudflare-deploy/src/teacher-clash.ts');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => { if (cond) PASS++; else FAIL++; console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ' — ' + extra : '')}`); };

let M;
try { M = await import(pathToFileURL(P).href); } catch (e) { ok('teacher-clash.ts 를 불러온다', false, String(e.message || e)); }

/* 요일 정본(enrollDowList)을 enroll-ops.ts 에서 오려 낸다 — ⛔ 하니스에 다시 적지 않는다 */
const EO = SRC('enroll-ops.ts');
const mapSrc = /const ENROLL_DOW_MAP[^=]*=\s*(\{[\s\S]*?\});/.exec(EO);
const fnSrc = /export function enrollDowList\(raw: any\): number\[\] \{([\s\S]*?)\n\}/.exec(EO);
ok('전제: enroll-ops.ts 에서 요일 정본을 오려 냈다', !!(mapSrc && fnSrc));
const dowList = (mapSrc && fnSrc)
  ? new Function('ENROLL_DOW_MAP', 'return function(raw){' + fnSrc[1].replace(/: number\[\]/g, '') + '}')(new Function('return ' + mapSrc[1])())
  : () => [];

if (M) {
  const c24 = (o) => ({ class_id: o.id || 'c1', date: o.date || '2026-09-30', start_time: o.time || '20:00',
    duration_min: o.dur ?? 20, teacher_id: o.tid === undefined ? '9' : o.tid, teacher_name: 'ZEE',
    student_uid: o.uid || 'umc276', student_name: null, verdict: o.verdict || 'already' });
  const mg = (o) => ({ id: o.id || 3498, user_id: o.uid || 'yahee', student_name: null,
    teacher_id: o.tid === undefined ? '9' : o.tid, schedule_kind: o.kind || 'recurring',
    day_of_week: o.dow === undefined ? '3' : o.dow, scheduled_date: o.date ?? null,
    start_time: o.time || '20:00', duration_min: o.dur ?? 20, source: o.source || 'admin_ui', status: o.status || 'active' });
  const run = (a, b) => { try { return M.findTeacherClashes(a, b, dowList); } catch (e) { return { clashes: [], unchecked_no_teacher: -1, err: e }; } };

  console.log('\n[ A. 실사고 — Zee 수(9/30) 20:00 ]');
  const r0 = run([c24({})], [mg({})]);
  ok('반복 수업(수=3)과 카페24 수업의 겹침을 잡는다', r0.clashes.length === 1, JSON.stringify(r0.err || r0.clashes.length));
  ok('강사 이중 배정(다른 학생)으로 말한다', r0.clashes[0]?.same_student === false);
  ok('망고아이 쪽이 «매주 반복» 이라고 싣는다', r0.clashes[0]?.mangoi.recurring === true);
  ok('요일이 «Wed»·«수»·«1,3,5» 로 적혀도 잡는다',
    ['Wed', '수', '1,3,5', '수요일'].every(d => run([c24({})], [mg({ dow: d })]).clashes.length === 1));

  console.log('\n[ B. 짝 — 안 잡아야 하는 것 ]');
  ok('다른 요일(목)이면 안 잡는다', run([c24({})], [mg({ dow: '4' })]).clashes.length === 0);
  ok('다른 강사면 안 잡는다', run([c24({})], [mg({ tid: '16' })]).clashes.length === 0);
  ok('맞닿기만 하면(20:20 시작) 안 잡는다', run([c24({})], [mg({ time: '20:20' })]).clashes.length === 0);
  ok('10분 겹치면 잡는다(20:10)', run([c24({})], [mg({ time: '20:10' })]).clashes.length === 1);
  ok('취소된 수업은 안 잡는다', run([c24({})], [mg({ status: 'cancelled' })]).clashes.length === 0);
  ok('미러 사본(c24-mirror)은 자기 자신이라 안 잡는다', run([c24({})], [mg({ source: 'c24-mirror' })]).clashes.length === 0);
  ok('미러 사본(c24-mirror:manual)도 안 잡는다', run([c24({})], [mg({ source: 'c24-mirror:manual' })]).clashes.length === 0);
  ok('옛 자리표시(lms)는 안 잡는다', run([c24({})], [mg({ uid: 'lms' })]).clashes.length === 0);
  ok('퇴사 잔재(no_teacher_left)는 안 잡는다', run([c24({ verdict: 'no_teacher_left' })], [mg({})]).clashes.length === 0);
  ok('날짜 있는 행은 날짜가 이긴다(다른 날이면 안 잡음)', run([c24({})], [mg({ date: '2026-10-07', dow: '3' })]).clashes.length === 0);
  ok('날짜 있는 행 — 같은 날이면 잡는다', run([c24({})], [mg({ date: '2026-09-30', dow: null, kind: 'dated' })]).clashes.length === 1);
  const u = run([c24({ tid: null })], [mg({})]);
  ok('강사를 못 이은 LMS 수업은 짐작하지 않고 «못 봄» 으로 센다', u.clashes.length === 0 && u.unchecked_no_teacher === 1);
  ok('같은 학생이면 «이중 등록» 으로 가른다', run([c24({ uid: 'yahee' })], [mg({})]).clashes[0]?.same_student === true);

  console.log('\n[ C. 망고아이 쪽 조회 SQL — 진짜 SQLite ]');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, student_name TEXT, teacher_id TEXT,
    schedule_kind TEXT, day_of_week TEXT, scheduled_date TEXT, start_time TEXT, duration_min INTEGER, source TEXT, status TEXT)`);
  const ins = db.prepare('INSERT INTO class_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  ins.run(1, 'yahee', null, '9', 'recurring', '3', null, '20:00', 20, 'admin_ui', 'active');
  ins.run(2, 'a', null, '9', 'dated', null, '2026-09-30', '20:00', 20, 'adm-enroll:1', 'active');
  ins.run(3, 'b', null, '9', 'dated', null, '2026-12-30', '20:00', 20, 'adm-enroll:1', 'active');       // 창 밖
  ins.run(4, 'c', null, '9', 'one_off', null, '2026-09-30', '20:00', 20, 'c24-mirror', 'active');       // 미러
  ins.run(5, 'd', null, '9', 'dated', null, '2026-09-30', '20:00', 20, 'adm-enroll:1', 'cancelled');   // 취소
  ins.run(6, 'lms', null, '9', 'recurring', '3', null, '20:00', 20, 'lms_import_w26', 'active');       // 자리표시
  const env = { DB: { prepare: (sql) => ({ bind: (...a) => ({ all: async () => ({ results: db.prepare(sql).all(...a) }) }) }) } };
  let got = [];
  try { got = (await M.loadMangoiForClash(env, '2026-09-30', '2026-10-14')).map(r => r.id).sort(); } catch (e) { ok('조회가 돈다', false, String(e.message)); }
  ok('반복 수업(날짜 없음)을 읽는다 — 미러 loadExisting 이 빠뜨리던 것', got.includes(1));
  ok('창 안의 날짜 수업을 읽는다', got.includes(2));
  ok('창 밖·미러·취소·자리표시는 안 읽는다', JSON.stringify(got) === '[1,2]', JSON.stringify(got));

  console.log('\n[ D. 배선 — 성적표가 전원을 대조해 싣는다 ]');
  const MIR = SRC('c24-mirror.ts');
  const rep = MIR.slice(MIR.indexOf('export async function c24MirrorReport'), MIR.indexOf('export async function applyMirror'));
  ok('성적표가 findTeacherClashes 를 «planMirror 결과 전체» 로 부른다', /findTeacherClashes\(rows,\s*\w+,\s*enrollDowList\)/.test(rep));
  ok('성적표가 clashes 를 응답에 싣는다', /\n\s*clashes,\n/.test(rep));
  ok('실패하면 clashes=null(«못 봤다») 로 둔다 — 빈 배열로 위장하지 않는다', /let clashes: TeacherClash\[\] \| null = null;/.test(rep));
  const MGR = readFileSync(resolve(__dir, '../cloudflare-deploy/public/manager.html'), 'utf8');
  ok('매니저 화면이 clashes 를 그린다', /function paintClash\(\)/.test(MGR) && /j\.clashes/.test(MGR));
  ok('매니저 화면 — null 이면 «겹침 없음이 아님» 이라고 말한다', /This is NOT "no conflicts"/.test(MGR));
  ok('매니저 화면 — 본사 전용으로 켠다(IS_HQ)', /getElementById\('c-clash'\);\s*if \(_clash\) _clash\.hidden = !IS_HQ;/.test(MGR));
}

console.log(`\n  PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
