// class_today_extras_harness.mjs — 「오늘 수업」 일곱 칸 (2026-09-23 매니저 요청)
//   날짜 · 강사 입장 · 결제유형 · 일정 · 지난/오늘 평가 · 학생 출결
//   정본 src/class-today-extras.ts 를 node 타입 제거로 «실제로» 돌린다(컴파일 없음).
//   ⚠️ 판정마다 «잡는다» 와 «함부로 안 잡는다» 를 짝으로 둔다 — 한쪽만 두면 «전부 X» 가 통과한다.
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.EXTRAS_SRC_DIR || join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };

console.log('A. 정본을 실제로 돌린다');
const tmp = mkdtempSync(join(tmpdir(), 'cte-'));
const fix = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
for (const f of ['class-today-extras', 'no-show-truth', 'd1-chunk', 'student-schedule-summary', 'attendance-uid']) {
  writeFileSync(join(tmp, f + '.ts'), fix(readFileSync(join(SRC, f + '.ts'), 'utf8')));
}
// 요일 정본(api-admin.ts admDowMatches)을 «그대로» 오려 와 주입한다 — 하니스에 규칙을 베끼지 않는다.
{
  const apiSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const a0 = apiSrc.indexOf('const ADM_DOW_MAP');
  const f0 = apiSrc.indexOf('function admDowMatches', a0);
  let i = apiSrc.indexOf('{', apiSrc.indexOf(')', f0)), d = 0;
  for (; i < apiSrc.length; i++) { if (apiSrc[i] === '{') d++; else if (apiSrc[i] === '}') { d--; if (!d) break; } }
  const dowSrc = a0 > 0 && f0 > a0 ? apiSrc.slice(a0, i + 1) : '';
  ok('요일 정본 admDowMatches 를 오려 냈다', dowSrc.length > 200 && /function admDowMatches/.test(dowSrc));
  writeFileSync(join(tmp, 'dow.ts'), dowSrc + '\nexport { admDowMatches };\n');
}
const runner = `
import * as X from './class-today-extras.ts';
import { admDowMatches } from './dow.ts';
const out = {};
const S = Date.parse('2026-09-23T14:00:00+09:00');
const M = 60000;
// 강사 입장
out.t_on   = X.judgeTeacherEntry('mangoi', S, 'ended', { present: true, from: S - 3*M });
out.t_edge = X.judgeTeacherEntry('mangoi', S, 'ended', { present: true, from: S + 60*1000 });
out.t_late = X.judgeTeacherEntry('mangoi', S, 'ended', { present: true, from: S + 7*M });
out.t_none = X.judgeTeacherEntry('mangoi', S, 'ended', { present: false, from: null });
out.t_pend = X.judgeTeacherEntry('mangoi', S, 'early', { present: false, from: null });
out.t_unk  = X.judgeTeacherEntry('mangoi', S, 'ended', { present: null, from: null });
out.t_c24  = X.judgeTeacherEntry('cafe24', S, 'ended', { present: true, from: S });
// 학생 출결
out.a_att  = X.judgeStudentAttendance('mangoi', S, 'ended', S + 2*M, 0);
out.a_late = X.judgeStudentAttendance('mangoi', S, 'ended', S + 9*M, 0);
out.a_abs  = X.judgeStudentAttendance('mangoi', S, 'ended', null, 0);
out.a_unk  = X.judgeStudentAttendance('mangoi', S, 'ended', null, 1);
out.a_wait = X.judgeStudentAttendance('mangoi', S, 'live', null, 0);
out.a_ny   = X.judgeStudentAttendance('mangoi', S, 'early', null, 0);
out.a_c24  = X.judgeStudentAttendance('cafe24', S, 'ended', S, 0);
// 결제 유형
const ct = new Map([['A학원','B2B'],['B학원','B2C'],['C학원', null]]);
out.p = [X.judgePayType('A학원', null, ct), X.judgePayType('B학원', 'B2B', ct), X.judgePayType('C학원', 'B2C', ct),
         X.judgePayType('없는학원', 'b2c', ct), X.judgePayType('', null, ct)];
// 평가
const day = Date.parse('2026-09-23T00:00:00+09:00');
const evs = [
  { id: 3, room_id: 'class-9-20260923', created_at: S + 25*M, score_overall: 4, note_en: 'Great job today' },
  { id: 2, room_id: 'class-1-20260921', created_at: day - 2*86400000, score_overall: 88, teacher_comment: 'Good' },
  { id: 1, room_id: '', created_at: day - 5*86400000, score_overall: 3 },
];
const pk = X.pickEvals(evs, 'class-9-20260923', '2026-09-23', day);
out.e_today = pk.today && pk.today.id; out.e_last = pk.last && pk.last.id;
const pk2 = X.pickEvals(evs, 'class-5-20260923', '2026-09-23', day);
out.e_other_today = pk2.today; out.e_other_last = pk2.last && pk2.last.id;
out.brief = X.briefEval(evs[1]);
// 로더 — 가짜 DB (질의문을 보고 답한다)
const SQLS = [];
const mkDb = (boom) => ({
  exec: async () => {},
  prepare(sql) {
    SQLS.push(sql);
    const res = () => {
      if (boom && boom.test(sql)) throw new Error('boom');
      if (/FROM attendance/.test(sql) && /account_uid/.test(sql)) return [
        { room_id: 'class-9-20260923', role: 'student', username: '김민준', user_id: 'u_dev1', account_uid: 'kim', joined_at: S + 8*M },
        { room_id: 'class-9-20260923', role: 'teacher', username: '교사 Teacher - Kaye', user_id: 'u_t', account_uid: null, joined_at: S - M },
      ];
      if (/FROM attendance/.test(sql)) return [
        { room_id: 'class-9-20260923', role: 'teacher', username: '교사 Teacher - Kaye', joined_at: S - M, out_at: S + 20*M },
      ];
      if (/FROM centers/.test(sql)) return [{ name: 'A학원', pt: 'B2B' }, { name: 'Z학원', pt: 'B2B' }, { name: 'Z학원', pt: 'B2C' }];
      if (/FROM students_erp/.test(sql)) return [{ user_id: 'kim', payment_type: null, shop_name: 'A학원' }, { user_id: 'park', payment_type: null, shop_name: 'A학원' }];
      if (/FROM class_schedules/.test(sql) && /day_of_week/.test(sql)) return [
        { user_id: 'kim', schedule_kind: 'recurring', scheduled_date: null, day_of_week: '3' },
        { user_id: 'kim', schedule_kind: 'recurring', scheduled_date: null, day_of_week: 'Fri' },
        { user_id: 'kim', schedule_kind: 'one_off', scheduled_date: '2026-09-27', day_of_week: null },
        { user_id: 'kim', schedule_kind: 'one_off', scheduled_date: '2026-10-01', day_of_week: '4' },
        { user_id: 'park', schedule_kind: 'recurring', scheduled_date: null, day_of_week: '월,수' },
        { user_id: 'lee', schedule_kind: 'recurring', scheduled_date: null, day_of_week: 'Mon' },
      ];
      if (/FROM class_schedules/.test(sql)) return [{ user_id: 'kim', schedule_kind: 'recurring', scheduled_date: null }];
      if (/FROM student_evaluations/.test(sql)) return evs.map(e => ({ ...e, student_uid: 'kim' }));
      return [];
    };
    const q = { all: async () => ({ results: res() }), first: async () => (res()[0] || null), run: async () => ({}) };
    return { ...q, bind() { return q; } };
  },
});
const mk = () => [
  { source: 'mangoi', room_id: 'class-9-20260923', student_uid: 'kim', student_name: '김', teacher_name: 'KAYE', academy: 'A학원', start_ts: S, status: 'ended' },
  { source: 'mangoi', room_id: 'class-7-20260923', student_uid: 'kim', student_name: '김', teacher_name: 'KAYE', academy: 'Z학원', start_ts: S, status: 'early' },
  { source: 'lms', room_id: 'c24-9', student_uid: 'lee2', student_name: '이이', teacher_name: 'KAYE', start_ts: S, status: 'done' },
  { kind: 'class', room_id: 'class-8-20260923', student_uid: 'park', student_name: '박', teacher_name: 'KAYE', start_ts: S, status: 'early' },
  { source: 'cafe24', room_id: 'c24-1', student_uid: 'lee', student_name: '이', teacher_name: null, academy: '', start_ts: S, status: 'ended' },
];
const ss = mk();
await X.enrichClassesToday({ DB: mkDb(null) }, ss, '2026-09-23', S + 60*M);
out.l = ss.map(s => ({ d: s.class_date, te: s.teacher_entry && s.teacher_entry.state, at: s.attendance && s.attendance.state,
  late: s.attendance && s.attendance.late_min, pay: s.pay_type, sch: s.sched_label_en, today: s.today_eval && s.today_eval.id, last: s.last_eval && s.last_eval.id }));
// 조회가 던져도 던지지 않고 그 칸만 비운다
const ss2 = mk(); let threw = false;
try { await X.enrichClassesToday({ DB: mkDb(/attendance|evaluations|centers|class_schedules/) }, ss2, '2026-09-23', S + 60*M); } catch (e) { threw = true; }
out.boom = { threw, at: ss2[0].attendance, today: ss2[0].today_eval, d: ss2[0].class_date };
// 🆕 방에 «아무도» 안 들어온 수업 — 판정 불가가 아니라 «입장 기록 없음»(2026-09-23 사장님 화면)
//    짝: 시작 전이면 «아직 전» · 출석 조회가 실패하면 그대로 «확인 불가»(모르면 단정하지 않음)
const mkEmpty = () => [
  { source: 'mangoi', room_id: 'class-6-20260923', student_uid: 'kim', student_name: '김', teacher_name: 'MAIMAI', start_ts: S, status: 'live' },
  { source: 'mangoi', room_id: 'class-5-20260923', student_uid: 'kim', student_name: '김', teacher_name: 'MAIMAI', start_ts: S, status: 'early' },
];
const se = mkEmpty(); await X.enrichClassesToday({ DB: mkDb(null) }, se, '2026-09-23', S + 10*M);
const sb = mkEmpty(); await X.enrichClassesToday({ DB: mkDb(/attendance/) }, sb, '2026-09-23', S + 10*M);
out.empty = { live: se[0].teacher_entry.state, early: se[1].teacher_entry.state, boom: sb[0].teacher_entry.state };
// 🔒 지사·대리점 — 평가를 «조회조차» 안 한다 · 짝: 기본값은 싣는다
SQLS.length = 0;
const ss3 = mk();
await X.enrichClassesToday({ DB: mkDb(null) }, ss3, '2026-09-23', S + 60*M, { evals: false });
out.hid = { today: ss3[0].today_eval, last: ss3[0].last_eval, flag: ss3[0].eval_hidden,
  queried: SQLS.some(q => /student_evaluations/.test(q)), att: ss3[0].attendance && ss3[0].attendance.state };
out.shownFlag = ss[0].eval_hidden;
// 📅 이번 주 7칸 (C안) — 정본 요일 파서를 주입했을 때만 채운다
out.wdates = X.weekDatesOf('2026-09-23');
out.wbad = X.weekDatesOf('2026/09/23');
out.wsun = X.weekDatesOf('2026-09-27');
out.wd1 = X.weekDaysFor([{ day_of_week: '3' }, { day_of_week: 'Fri' }, { scheduled_date: '2026-09-27' }, { scheduled_date: '2026-10-01', day_of_week: '4' }], out.wdates, admDowMatches);
out.wd2 = X.weekDaysFor([{ day_of_week: '월,수' }, { day_of_week: '일' }, { day_of_week: '' }, { day_of_week: 'xyz' }], out.wdates, admDowMatches);
SQLS.length = 0;
const ss4 = mk();
await X.enrichClassesToday({ DB: mkDb(null) }, ss4, '2026-09-23', S + 60*M, { dowMatches: admDowMatches });
out.wk = ss4.map(s => ({ w: s.week_days, d: s.week_dates && s.week_dates[0] }));
out.wkNoInj = ss.map(s => s.week_days);
out.wkQueriedNoInj = false;
const ss5 = mk(); SQLS.length = 0;
await X.enrichClassesToday({ DB: mkDb(null) }, ss5, '2026-09-23', S + 60*M);
out.wkQueriedNoInj = SQLS.some(q => /day_of_week/.test(q));
const ss6 = mk();
try { await X.enrichClassesToday({ DB: mkDb(/day_of_week/) }, ss6, '2026-09-23', S + 60*M, { dowMatches: admDowMatches }); out.wkBoom = { w: ss6[0].week_days, at: ss6[0].attendance && ss6[0].attendance.state }; } catch (e) { out.wkBoom = 'threw'; }
console.log(JSON.stringify(out));
`;
writeFileSync(join(tmp, 'run.mjs'), runner);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
rmSync(tmp, { recursive: true, force: true });
let o = null;
try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (e) { /* 아래에서 FAIL */ }
ok('정본을 실행해 결과를 받았다', !!o, (r.stderr || '').slice(0, 400));
if (o) {
  ok('강사: 시작 3분 전 입장 = 정시', o.t_on.state === 'on_time');
  ok('강사: 정확히 60초 뒤 = 아직 정시(경계)', o.t_edge.state === 'on_time');
  ok('강사: 7분 뒤 = 7분 지각', o.t_late.state === 'late' && o.t_late.late_min === 7);
  ok('강사: 기록 없음(끝난 수업) = none — «노쇼» 라 부르지 않음', o.t_none.state === 'none');
  ok('강사: 시작 전·기록 없음 = pending(«없음» 이라 단정 안 함)', o.t_pend.state === 'pending');
  ok('강사: 이름으로 못 가림 = unknown', o.t_unk.state === 'unknown');
  ok('강사: 카페24 = cafe24(방이 없어 모름)', o.t_c24.state === 'cafe24');
  ok('학생: 2분 뒤 입장 = 출석', o.a_att.state === 'attended');
  ok('학생: 9분 뒤 입장 = 지각 9분', o.a_late.state === 'late' && o.a_late.late_min === 9);
  ok('학생: 끝났고 아무 접속 없음 = 결석', o.a_abs.state === 'absent');
  ok('학생: 누군지 모를 접속이 있으면 «결석» 단정 안 함', o.a_unk.state === 'unknown');
  ok('학생: 수업 중 아직 없음 = waiting', o.a_wait.state === 'waiting');
  ok('학생: 시작 전 = not_yet', o.a_ny.state === 'not_yet');
  ok('학생: 카페24 = cafe24', o.a_c24.state === 'cafe24');
  ok('결제: 대리점 지정이 정본 · 원부 보조 · 섞이면 모름 · 없으면 null', JSON.stringify(o.p) === JSON.stringify(['B2B', 'B2C', null, 'B2C', null]), o.p);
  ok('평가: 같은 방 번호 = 오늘 평가', o.e_today === 3);
  ok('평가: 지난 평가 = 그 날짜 전 가장 최근', o.e_last === 2);
  ok('평가: 같은 날 «다른 방» 평가는 오늘 평가로 안 붙임(짝)', o.e_other_today === null && o.e_other_last === 2);
  ok('평가: 100점 만점 값은 max=100', o.brief.max === 100 && o.brief.score === 88);
  ok('지사·대리점(evals:false): 평가 내용이 응답에 없다', o.hid.today === null && o.hid.last === null, o.hid);
  ok('지사·대리점(evals:false): 평가 표를 «조회조차» 안 한다', o.hid.queried === false, o.hid);
  ok('지사·대리점(evals:false): 화면이 «본사 전용» 이라 말하게 eval_hidden=true', o.hid.flag === true);
  ok('지사·대리점(evals:false): 나머지 칸(출결)은 그대로 채운다(짝)', o.hid.att === 'late', o.hid);
  ok('본사(기본값): eval_hidden=false 이고 평가를 싣는다(짝)', o.shownFlag === false);
  const [a, z, lms, tp, b] = o.l;
  ok('강사 포털 LMS 줄(source=lms · c24-방)도 «방 없음» 으로 본다', lms.te === 'cafe24' && lms.at === 'cafe24', lms);
  ok('강사 포털 줄(academy 없음)은 원부 shop_name 으로 결제유형을 찾는다', tp.pay === 'B2B', tp);
  ok('로더: 같은 대리점 이름에 B2B·B2C 가 섞이면 «모름»(null)', z.pay === null, z);
  ok('로더: 날짜 칸', a.d === '2026-09-23' && b.d === '2026-09-23');
  ok('로더: 강사 입장 = 정본(teacherPresenceByRoom) 으로 정시', a.te === 'on_time', a);
  ok('로더: 학생은 account_uid 로 찾는다(user_id 는 기기번호) → 8분 지각', a.at === 'late' && a.late === 8, a);
  ok('로더: 결제유형 B2B', a.pay === 'B2B');
  ok('로더: 일정 = 명부 «예약» 칸과 같은 정본 라벨', a.sch === '1/wk', a);
  ok('로더: 오늘·지난 평가', a.today === 3 && a.last === 2, a);
  ok('로더: 카페24 줄 = cafe24 표시(지어내지 않음)', b.te === 'cafe24' && b.at === 'cafe24' && b.pay === null, b);
  ok('로더: 아무도 안 들어온 수업 중인 방은 «입장 기록 없음»(unknown 아님)', o.empty.live === 'none', o.empty);
  ok('로더: 짝 — 시작 전 빈 방은 «아직 전»', o.empty.early === 'pending', o.empty);
  ok('로더: 짝 — 출석 조회 실패면 «확인 불가» 그대로(단정 안 함)', o.empty.boom === 'unknown', o.empty);
  ok('로더: 조회가 던져도 던지지 않고 그 칸만 비운다', o.boom.threw === false && o.boom.at === null && o.boom.today === null && o.boom.d === '2026-09-23', o.boom);
  const F = false, Tt = true;
  ok('주: 2026-09-23(수) → 월 09-21 ~ 일 09-27', JSON.stringify(o.wdates) === JSON.stringify(['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27']), o.wdates);
  ok('주: 일요일(09-27)도 «그 주» 로 본다(다음 주로 넘기지 않음)', o.wsun && o.wsun[0] === '2026-09-21', o.wsun);
  ok('주: 모양이 틀린 날짜 = null', o.wbad === null);
  ok('7칸: 숫자 3·영문 Fri·이번 주 날짜 → 수·금·일', JSON.stringify(o.wd1) === JSON.stringify([F,F,Tt,F,Tt,F,Tt]), o.wd1);
  ok('7칸: 날짜가 있으면 요일보다 날짜가 이긴다(다음 주 날짜 + 목요일 → 목 안 켬)', o.wd1 && o.wd1[3] === false, o.wd1);
  ok('7칸: 한글 나열 «월,수» · «일» → 월·수·일, 빈값·모르는 값은 안 켬(짝)', JSON.stringify(o.wd2) === JSON.stringify([Tt,F,Tt,F,F,F,Tt]), o.wd2);
  ok('로더(주입): 그 학생 행으로 7칸을 채운다', JSON.stringify(o.wk[0].w) === JSON.stringify([F,F,Tt,F,Tt,F,Tt]) && o.wk[0].d === '2026-09-21', o.wk[0]);
  ok('로더(주입): 다른 학생 행은 안 섞는다(park = 월·수)', JSON.stringify(o.wk[3].w) === JSON.stringify([Tt,F,Tt,F,F,F,F]), o.wk[3]);
  ok('로더(주입): 카페24·LMS 줄은 비운다(null)', o.wk[4].w === null && o.wk[2].w === null, [o.wk[2], o.wk[4]]);
  ok('로더: 요일 정본을 안 넘기면 7칸을 안 채우고 조회도 안 한다(강사 포털)', o.wkNoInj.every(v => v === null) && o.wkQueriedNoInj === false, o);
  ok('로더: 7칸 조회가 던져도 던지지 않고 그 칸만 비운다(다른 칸은 그대로)', o.wkBoom !== 'threw' && o.wkBoom.w === null && o.wkBoom.at === 'late', o.wkBoom);
}

console.log('B. 배선');
const api = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
const i0 = api.indexOf("path === '/api/admin/classes/today'");
const iE = api.indexOf('await enrichClassesToday(', i0);
const iJ = api.indexOf('const res = json({', i0);
ok('classes/today 가 정본을 «응답 전» 에 부른다', i0 > 0 && iE > i0 && iE < iJ);
ok('classes/today 는 평가를 연락처와 같은 판정(본사·내부직원만)으로 넘긴다', /enrichClassesToday\(env as any, sessions, dateStr, nowMs, \{ evals: _ctSeeContact, dowMatches: admDowMatches \}\)/.test(api)
   && /const _ctSeeContact = _ctScope\.type === 'hq' \|\| _ctScope\.type === 'none';/.test(api));
ok('그 호출은 조건 없이 try 로 감싸여 있다(목록이 통째로 안 사라짐)', /\n[ \t]*try \{ await enrichClassesToday\(/.test(api));
const adm = readFileSync(join(PUB, 'js', 'adm-today-classes.js'), 'utf8');
const th = (adm.match(/'<th>'/g) || []).length;
const tb = adm.slice(adm.indexOf("return '<tr>'"), adm.indexOf("'</tr>';", adm.indexOf("return '<tr>'")));
const td = (tb.match(/'<td[ >]/g) || []).length;
ok('관리자 표: th 수 = 한 줄의 td 수', th === td && th >= 15, { th, td });
for (const k of ['s.class_date', 'xPay(s.pay_type)', 'xSched(s)', 'xTeacherEntry(s.teacher_entry)', 'xAttendance(s.attendance)', 'xEval(s.last_eval', 'xEval(s.today_eval']) {
  ok('관리자 표가 ' + k + ' 를 그린다', tb.includes(k));
}
// 📅 수업 캘린더 칸 (C안) — xCal 을 오려 내 «실제로» 그려 본다
ok('관리자 표가 xCal(s, isC24) 를 그린다', tb.includes('xCal(s, isC24)'));
ok('관리자 표 머리글에 «수업 캘린더» 가 있다', /T\('수업 캘린더', 'Class calendar'\)/.test(adm.slice(0, adm.indexOf("return '<tr>'"))));
const cut = (src, head) => { const f = src.indexOf(head); if (f < 0) return ''; let i = src.indexOf('{', f), d = 0; const st = i; for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } } return src.slice(st + 1, i); };
const xcBody = cut(adm, 'function xCal(s, isC24)');
ok('xCal 을 오려 냈다', xcBody.length > 200);
let xc = null;
try {
  xc = new Function('T', 'esc', 'isEn', 'xSmall', 'xDash', 'X_DOW_KO', 'X_DOW_EN', 's', 'isC24', xcBody);
} catch (e) { ok('xCal 컴파일', false, e.message); }
if (xc) {
  const Tk = (k) => k, escF = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const small = (t) => '<small>' + t + '</small>', dash = () => '—';
  const KO = ['월','화','수','목','금','토','일'], EN = ['M','T','W','T','F','S','S'];
  const call = (s, c24) => { try { return xc(Tk, escF, () => false, small, dash, KO, EN, s, c24); } catch (e) { return 'THREW:' + e.message; } };
  const wd = ['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27'];
  const h1 = call({ student_uid: 'kim', student_name: '김<x>', class_date: '2026-09-23', week_days: [false,false,true,false,true,false,true], week_dates: wd }, false);
  ok('xCal: 수업 있는 날 칸 수 = 3(채운 색)', (h1.match(/background-color:#3b82f6/g) || []).length === 3, h1.slice(0, 300));
  ok('xCal: 7칸을 그린다', (h1.match(/width:17px/g) || []).length === 7);
  ok('xCal: 오늘(수) 칸에만 테두리', (h1.match(/outline:2px/g) || []).length === 1 && /outline:2px[^>]*>수</.test(h1));
  ok('xCal: 「📅 캘린더」 칩에 학생 아이디가 실린다(이름은 이스케이프)', /class="tc-cal-pin" role="button" tabindex="0" data-uid="kim" data-who="김&lt;x>"/.test(h1), h1);
  const h2 = call({ student_uid: 'lee', week_days: null }, true);
  ok('xCal: 카페24 줄은 «카페24 수업» 이라 말한다(빈칸·버튼 없음)', /카페24 수업/.test(h2) && !/tc-cal-pin/.test(h2), h2);
  ok('xCal: 학생 아이디가 없으면 «—»(짝)', call({ student_uid: '' }, false) === '—');
  const h3 = call({ student_uid: 'park', week_days: null }, false);
  ok('xCal: 7칸을 못 받아도 달력 버튼은 준다(칸은 안 지어냄)', /tc-cal-pin/.test(h3) && !/width:17px/.test(h3), h3);
}
const modal = cut(adm, 'function tcOpenCalModal(uid, who)');
ok('캘린더 창이 학생 상세의 스케줄 탭을 연다', /\/admin\/student\.html\?uid=' \+ encodeURIComponent\(uid\) \+ '&tab=schedule'/.test(modal));
ok('캘린더 창: 새 탭은 <a target=_blank> (window.open 금지)', /target="_blank" rel="noopener"/.test(modal) && !/window\.open/.test(modal));
ok('캘린더 창: vh 단위를 쓰지 않는다(zoom 1.3)', !/\d+vh/.test(modal));
const rend = adm.slice(adm.indexOf("return '<tr>'"));
ok('칩에 클릭·키보드 리스너를 단다', /querySelectorAll\('\.tc-cal-pin'\)[\s\S]{0,600}tcOpenCalModal\(uid/.test(rend) && /querySelectorAll\('\.tc-cal-pin'\)[\s\S]{0,900}keydown/.test(rend));
{
  const stu = readFileSync(join(PUB, 'admin', 'student.html'), 'utf8');
  ok('student.html 이 ?tab= 로 탭을 연다(기존 _initTab)', /get\('tab'\)[\s\S]{0,200}\.tab\[data-tab="' \+ _initTab/.test(stu) && /data-tab="schedule"/.test(stu));
  // 🌐 ?lang= 가 저장값을 이긴다 · 없으면 예전대로 저장값 — _lang IIFE 를 오려 내 실제로 돌린다
  const l0 = stu.indexOf('let _lang = (function(){');
  const l1 = stu.indexOf('})();', l0);
  const body = l0 > 0 ? stu.slice(l0 + 'let _lang = '.length, l1 + 4) : '';
  const runL = (search, saved) => { try {
    return new Function('location', 'localStorage', 'URLSearchParams', 'return ' + body)(
      { search }, { getItem: k => (k === 'mangoi_lang' ? saved : null), setItem() { throw new Error('저장하면 안 됨'); } }, URLSearchParams);
  } catch (e) { return 'THREW:' + e.message; } };
  ok('student.html: ?lang=en 이면 저장값(ko)보다 이긴다', runL('?uid=a&lang=en', 'ko') === 'en');
  ok('student.html: ?lang=ko 도 이긴다(짝)', runL('?lang=ko', 'en') === 'ko');
  ok('student.html: ?lang 이 없으면 예전대로 저장값', runL('?uid=a', 'en') === 'en' && runL('', 'ko') === 'ko');
  ok('student.html: 모르는 값은 무시', runL('?lang=zz', 'en') === 'en');
  ok('student.html: embed=1 이면 창 안 이동 링크를 숨긴다', /get\('embed'\)==='1'\)document\.documentElement\.classList\.add\('mg-embed'\)/.test(stu)
     && /html\.mg-embed header\.top a\[href\^="\/admin\.html"\]/.test(stu) && /html\.mg-embed #global-home-fab/.test(stu));
  for (const [nm, src, fn] of [['관리자', adm, 'tcOpenCalModal'], ['매니저', readFileSync(join(PUB, 'manager.html'), 'utf8'), 'mgCalOpen']]) {
    const b = src.slice(src.indexOf('function ' + fn + '('), src.indexOf('function ' + fn + '(') + 2500);
    ok(nm + ' 창: 지금 화면의 언어를 &lang= 로 넘기고 창에는 embed=1', /&lang=' \+ \((isEn|EN)\(\) \? 'en' : 'ko'\)/.test(b) && /url = tabUrl \+ '&embed=1'/.test(b));
    ok(nm + ' 창: «새 탭에서 열기» 는 embed 없는 주소', /href="' \+ esc\(tabUrl\)/.test(b));
  }
}
const mgr = readFileSync(join(PUB, 'manager.html'), 'utf8');
for (const k of ['r.teacher_entry', 'r.attendance', 'r.pay_type', 'r.sched_label_en', 'r.last_eval', 'r.today_eval', 'r.class_date']) {
  ok('매니저 화면이 ' + k + ' 를 읽는다', mgr.includes(k));
}
// 📅 매니저 화면 «수업 캘린더»(2026-09-23 «매니저 화면에도 똑같이») — calLine 블록을 오려 내 «실제로» 돌린다
{
  const c0 = mgr.indexOf('var calLine = \'\';');
  const c1 = mgr.indexOf("return '<div class=\"row\">", c0);
  const blk = c0 > 0 && c1 > c0 ? mgr.slice(c0, c1) : '';
  ok('매니저: calLine 블록을 오려 냈다', blk.length > 300);
  let mk2 = null;
  try { mk2 = new Function('T', 'esc', 'r', 'j', blk + '; return calLine;'); } catch (e) { ok('매니저 calLine 컴파일', false, e.message); }
  if (mk2) {
    const Te = (en, ko) => ko, escF = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const go = (r) => { try { return mk2(Te, escF, r, { date: '2026-09-23' }); } catch (e) { return 'THREW:' + e.message; } };
    const wd = ['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27'];
    const m1 = go({ source: 'mangoi', student_uid: 'kim', student_name: '김', class_date: '2026-09-23', week_days: [true,false,true,false,false,false,false], week_dates: wd });
    ok('매니저: 7칸 중 수업 있는 날 2칸이 켜진다', (m1.match(/<i class="on/g) || []).length === 2 && (m1.match(/<i /g) || []).length === 7, m1.slice(0, 300));
    ok('매니저: 오늘(수)에만 today 표시', (m1.match(/today/g) || []).length === 1 && /class="on today"[^>]*>수</.test(m1), m1);
    ok('매니저: 「📅 캘린더」 칩에 학생 아이디', /data-calpin="kim"/.test(m1));
    const m2 = go({ source: 'cafe24', student_uid: 'lee' });
    ok('매니저: 카페24 줄은 «카페24 수업» 이라 말하고 칩이 없다', /카페24 수업/.test(m2) && !/data-calpin/.test(m2), m2);
    ok('매니저: 학생 아이디가 없으면 아무것도 안 그린다(짝)', go({ source: 'mangoi', student_uid: '' }) === '');
    const m3 = go({ source: 'mangoi', student_uid: 'park', week_days: null });
    ok('매니저: 7칸을 못 받으면 칸은 안 지어내고 칩만', /data-calpin="park"/.test(m3) && !/<i /.test(m3), m3);
  }
  ok('매니저: 줄이 calLine 을 그린다', /exLine \+ calLine \+ '<\/span>'/.test(mgr));
  ok('매니저: 누르면 mgCalOpen(키보드 포함)', /closest\('\[data-calpin\]'\)[\s\S]{0,120}mgCalOpen\(/.test(mgr) && /closest\('\[data-ta\],\[data-calpin\]'\)/.test(mgr));
  const mo = mgr.slice(mgr.indexOf('function mgCalOpen('), mgr.indexOf('function bindTodayActions('));
  ok('매니저 창: 학생 상세 스케줄 탭을 연다 · window.open 없음', /\/admin\/student\.html\?uid=' \+ encodeURIComponent\(uid\) \+ '&tab=schedule'/.test(mo) && !/window\.open/.test(mo));
}
// ── 강사 포털(teacher.html) ──
const tea = readFileSync(join(SRC, 'api-teacher.ts'), 'utf8');
const iO = tea.indexOf('await applyRoomOverrides(env.DB, classes, ymd);');
const iX = tea.indexOf('await enrichClassesToday(', iO);
ok('강사 포털이 방 번호를 갈아 끼운 «뒤» 정본을 부른다', iO > 0 && iX > iO, { iO, iX });
ok('강사 포털: 조건 없이 try 로 감싼다', /\n[ \t]*try \{ await enrichClassesToday\(env as any, classes, todayStr, now[,)]/.test(tea));
// 📅 (2026-09-23) 강사 포털도 이번 주 7칸 — 요일 파서는 넘기고 평가(evals)는 안 넘긴다(숨김 그대로).
{
  const m = tea.match(/await enrichClassesToday\(env as any, classes, todayStr, now(?:, (\{[^}]*\}))?\)/);
  const opt = m && m[1] || '';
  ok('강사 포털: 요일 파서(dowMatches)를 넘긴다', /\bdowMatches\b/.test(opt), opt);
  ok('강사 포털: 평가(evals)는 넘기지 않는다(짝)', !/\bevals\b/.test(opt), opt);
  // 두 요일 파서가 같은 답을 내는가 — 한쪽만 좁으면 강사 화면 7칸이 관리자와 다르게 나온다
  const cut = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } } return src.slice(i, j + 1); };
  const mapOf = (src, name) => { const i = src.indexOf('const ' + name); return i < 0 ? '' : src.slice(src.indexOf('{', i), src.indexOf('};', i) + 1); };
  const admSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  let tDow = null, aDow = null;
  try { tDow = new Function('const DOW_MAP = ' + mapOf(tea, 'DOW_MAP:').replace(/^[^{]*/, '') + ';' + cut(tea, 'dowMatches').replace(/\(raw: any, target: number\): boolean/, '(raw, target)') + ' return dowMatches;')(); } catch (e) {}
  try { aDow = new Function('const ADM_DOW_MAP = ' + mapOf(admSrc, 'ADM_DOW_MAP:').replace(/^[^{]*/, '') + ';' + cut(admSrc, 'admDowMatches').replace(/\(raw: any, target: number\): boolean/, '(raw, target)') + ' return admDowMatches;')(); } catch (e) {}
  ok('강사·관리자 요일 파서를 오려 냈다', typeof tDow === 'function' && typeof aDow === 'function');
  if (tDow && aDow) {
    const samples = ['0','1','5','6','Mon','wed','Thu','fri','월','수','수요일','토','1,3,5','Mon,Thu','월/수','화·목','1 3 5','', null, 'x', '12'];
    let diff = [];
    for (const v of samples) for (let d = 0; d < 7; d++) if (tDow(v, d) !== aDow(v, d)) diff.push(v + '@' + d);
    ok('강사·관리자 요일 파서가 같은 답을 낸다', diff.length === 0, diff.slice(0, 5));
  }
}
ok('강사 포털: 배너(?only=next)는 건너뛴다', /if \(!onlyNext\) \{[\s\S]{0,700}enrichClassesToday/.test(tea));
const th2 = readFileSync(join(PUB, 'teacher.html'), 'utf8');
const fi = th2.indexOf('function extrasHtml(c){');
let body = '';
if (fi > 0) { let d = 0, i = th2.indexOf('{', fi); const st = i; for (; i < th2.length; i++) { if (th2[i] === '{') d++; else if (th2[i] === '}') { d--; if (!d) break; } } body = th2.slice(st + 1, i); }
ok('teacher.html extrasHtml 을 오려 냈다', body.length > 200);
let run = null;
try { run = new Function('T', 'esc', 'hhmm', 'c', body); } catch (e) { ok('extrasHtml 컴파일', false, e.message); }
if (run) {
  const T = (en) => en, esc = (x) => String(x), hhmm = () => '14:07';
  const call = (c) => { try { return run(T, esc, hhmm, c); } catch (e) { return 'THROW ' + e.message; } };
  const h1 = call({ class_date: '2026-09-23', pay_type: 'B2C', sched_label_en: '2/wk',
    teacher_entry: { state: 'late', at: 1, late_min: 7 }, attendance: { state: 'absent' },
    last_eval: { date: '2026-09-20', score: 4, max: 5, text: 'Good' }, today_eval: null });
  ok('teacher.html: 일곱 칸을 실제로 그린다', /2026-09-23/.test(h1) && /B2C/.test(h1) && /2\/wk/.test(h1) && /7 min late/.test(h1)
     && /Absent/.test(h1) && /Last feedback/.test(h1) && /Today's feedback/.test(h1), h1);
  ok('teacher.html: 옛 응답(칸 없음)에는 아무것도 안 그린다(짝)', call({ start_time: '14:00' }) === '');
  const h2 = call({ class_date: 'x', prev_lesson: { date: 'y' }, attendance: null });
  ok('teacher.html: ↩ 지난 수업이 있으면 «지난 평가» 를 겹쳐 그리지 않는다', !/Last feedback/.test(h2) && /Today's feedback/.test(h2), h2);
  // 📅 이번 주 7칸 — 받으면 그리고, 못 받으면 줄 자체를 안 그린다(짝)
  const wd = ['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27'];
  const h3 = call({ class_date: '2026-09-23', attendance: null, week_days: [true,false,true,false,true,false,false], week_dates: wd });
  const cells = h3.match(/<i class="[^"]*"/g) || [];
  ok('teacher.html: 이번 주 7칸을 그린다', cells.length === 7 && /This week/.test(h3), h3);
  ok('teacher.html: 수업 있는 날만 on (3일)', cells.filter(x => /\bon\b/.test(x)).length === 3, cells);
  ok('teacher.html: 오늘(수) 칸에 today 표시', /today/.test(cells[2] || '') && !/today/.test(cells[0] || ''), cells);
  ok('teacher.html: aria 에 수업 일수', /3 class day\(s\) this week/.test(h3), h3);
  const h4 = call({ class_date: '2026-09-23', attendance: null, week_days: null });
  ok('teacher.html: 7칸을 못 받으면 줄을 안 그린다(짝)', !/This week/.test(h4) && !/cal7/.test(h4), h4);
  const h5 = call({ class_date: '2026-09-23', attendance: null, week_days: [true, false] });
  ok('teacher.html: 7칸이 아니면 지어내지 않는다', !/cal7/.test(h5), h5);
  ok('teacher.html: 강사 화면엔 캘린더 창 버튼이 없다(관리자 API 403)', !/data-calpin/.test(h3) && !/admin\/student\.html/.test(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')));
}
ok('관리자 표: 숨김이면 «본사 전용»', /xEval\(s\.last_eval, s\.eval_hidden\)/.test(tb) && /xEval\(s\.today_eval, s\.eval_hidden\)/.test(tb) && /if \(hidden\) return xSmall\(T\('본사 전용'/.test(adm));
ok('매니저 화면: 숨김이면 «본사 전용»', /if \(r\.eval_hidden\) return esc\(T\('HQ only', '본사 전용'\)\)/.test(mgr));
ok('teacher.html 카드가 extrasHtml(c) 를 부른다', /\+\s+extrasHtml\(c\)\n/.test(th2));
ok('teacher.html 다시그리기 지문에 이번 주 7칸이 들어 있다', /sc\.week_days\.map\(/.test(th2));
ok('teacher.html 다시그리기 지문에 출결·강사입장이 들어 있다', /sc\.attendance \? sc\.attendance\.state/.test(th2) && /sc\.teacher_entry \? sc\.teacher_entry\.state/.test(th2));
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
