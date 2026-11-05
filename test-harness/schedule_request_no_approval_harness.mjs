import { adminSrcUsing as readAdminModuleGraph } from './_srcbundle.mjs';
// -*- coding: utf-8 -*-
/**
 * 연기·변경 요청 «승인 없음» (2026-11-02 사장님 「승인 자체가 필요 없어」)
 *   ① 지난 대기 자동 정리 — EXPIRE_SQL 을 «진짜 SQLite» 에 돌린다(지난 것만 닫고 나머지는 그대로 · 짝).
 *   ② 강사 요청 자동 반영의 조건식 — api-admin.ts 에서 오려 내 실제로 평가(진짜 강사·담당·연기/변경일 때만).
 *   ③ 관리자 창 — 반영 실패 시 요청을 대기로 남기지 않는다(mvDropReq), 옛 «승인해 주세요» 문구 없음.
 *   ④ 15분 감시견에 배선(새 cron·hour 비교 없이).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = p => readFileSync(join(ROOT, 'cloudflare-deploy', p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n, x ?? ''); } };
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n① 지난 대기 자동 정리');
const ex = SRC('src/schedule-request-expire.ts');
const sqlM = ex.match(/export const EXPIRE_SQL =\s*`([\s\S]*?)`;/);
ok('EXPIRE_SQL 을 오려 냈다', !!sqlM);
const kstM = ex.match(/export function kstStamp\(nowMs: number\): string \{([\s\S]*?)\n\}/);
const kstStamp = kstM ? new Function('nowMs', kstM[1]) : () => '';
const NOW = Date.parse('2026-11-02T14:10:00+09:00');
ok('kstStamp 는 KST', kstStamp(NOW) === '2026-11-02 14:10', kstStamp(NOW));
{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE schedule_change_requests (id INTEGER PRIMARY KEY, status TEXT, orig_date TEXT, orig_time TEXT, decided_by TEXT, decided_at INTEGER, decide_memo TEXT)`);
  const rows = [
    [1, 'pending', '2026-10-22', '07:40'],   // 지난 것
    [2, 'pending', '2026-10-23', '20:00'],   // 지난 것
    [3, 'pending', '2026-11-02', '14:00'],   // 오늘 10분 전 시작 → 지남
    [4, 'pending', '2026-11-02', '14:30'],   // 오늘 아직 → 그대로
    [5, 'pending', '2026-11-05', '19:00'],   // 앞으로 → 그대로
    [6, 'approved', '2026-10-01', '10:00'],  // 이미 처리 → 그대로
    [7, 'pending', null, null],              // 원래 일시 모름 → 그대로
    [8, 'pending', '2026/10/30', '09:00'],   // '/' 날짜 → 지남
    [9, 'pending', '2026-11-02', null],      // 시각 모름 → 그날 23:59 까지 그대로
    [10, 'pending', '2026-11-01', ''],       // 시각 빈 값·어제 → 지남
  ];
  for (const r of rows) db.prepare('INSERT INTO schedule_change_requests (id,status,orig_date,orig_time) VALUES (?,?,?,?)').run(...r);
  let changes = -1;
  try { changes = Number(db.prepare(sqlM ? sqlM[1] : 'x').run('자동정리(수업 시각 지남)', NOW, kstStamp(NOW)).changes); } catch (e) { ok('SQL 실행', false, e.message); }
  const st = id => db.prepare('SELECT status, decide_memo, decided_by FROM schedule_change_requests WHERE id=?').get(id);
  ok('지난 대기 5건만 닫았다', changes === 5, changes);
  for (const id of [1, 2, 3, 8, 10]) ok(`#${id} 지난 대기 → rejected · memo expired · 자동정리`, st(id).status === 'rejected' && st(id).decide_memo === 'expired' && /자동정리/.test(st(id).decided_by || ''), st(id));
  for (const id of [4, 5, 7, 9]) ok(`#${id} 아직 안 지났거나 모름 → pending 그대로(짝)`, st(id).status === 'pending', st(id));
  ok('#6 이미 처리된 것은 안 건드림', st(6).status === 'approved' && !st(6).decide_memo);
}
ok('새 상태값(expired)을 status 에 쓰지 않는다', !/status\s*=\s*'expired'/.test(strip(ex)));
ok('수업표(class_schedules)는 건드리지 않는다', !/class_schedules/.test(strip(ex)));
ok('던지지 않는다(try/catch)', /try \{[\s\S]*catch/.test(ex));

console.log('\n② 강사 요청 자동 반영 조건(api-admin.ts)');
const adm = readAdminModuleGraph(adminModuleFile => SRC("src/" + adminModuleFile));
const ci = adm.indexOf("if (requesterRole === 'teacher' && body.requester_role !== 'admin'");
ok('조건식을 찾았다', ci > 0);
const condSrc = ci > 0 ? adm.slice(ci + 4, adm.indexOf(') {\n', ci)) : 'false';
let cond = null;
try { cond = new Function('requesterRole', 'body', 'reqType', '_newReqId', '_srcCs', '_srcActor', 'return (' + condSrc.replace(/^\(/, '').replace(/\s+/g, ' ') + ');'); } catch (e) { ok('조건식 평가', false, e.message + ' :: ' + condSrc); }
const C = o => { try { return cond(...Object.values(Object.assign({ requesterRole: 'teacher', body: {}, reqType: 'postpone', _newReqId: 5, _srcCs: { id: 1 }, _srcActor: { ok: true, isTeacher: true } }, o))); } catch (e) { return 'THREW ' + e.message; } };
if (cond) {
  const NO = v => v === false || v === null || v === undefined || v === 0;
  ok('진짜 강사·연기 → 시도', C({}) === true);
  ok('변경도 시도', C({ reqType: 'change' }) === true);
  ok('취소는 안 함', NO(C({ reqType: 'cancel' })));
  ok('관리자 창(requester_role admin)은 안 함 — /decide 가 따로 온다', NO(C({ body: { requester_role: 'admin' } })));
  ok('강사 세션이 아니면 안 함', NO(C({ _srcActor: { ok: true, isTeacher: false } })));
  ok('로그인 없으면 안 함', NO(C({ _srcActor: { ok: false, isTeacher: true } })));
  ok('학생 역할 줄은 안 함', NO(C({ requesterRole: 'student' })));
  ok('수업을 못 읽었으면 안 함', NO(C({ _srcCs: null })));
}
const blk = ci > 0 ? adm.slice(ci, ci + 900) : '';
ok('담당 확인(teacherOwnsSchedule) 뒤에만 반영', /teacherOwnsSchedule\(env as any, _srcActor as any, _srcCs\)\)\s*\{[\s\S]*?autoApproveStudentPostpone\(env as any, _newReqId\)/.test(blk));
ok('응답이 auto_applied 를 싣는다', /auto_applied: _auto\.applied/.test(adm));

console.log('\n③ 관리자 창 — 반영 실패 시 대기로 남기지 않음');
const mm = SRC('public/js/class-move-modal.js');
ok('mvDropReq 가 reject 로 닫는다', /function mvDropReq\(id, nm\)[\s\S]{0,300}action: 'reject'/.test(mm));
ok('실패 갈래 세 곳이 mvDropReq 를 부른다', (strip(mm).match(/mvDropReq\(mk\.j\.id, nm\)/g) || []).length === 3);
ok('옛 «승인해 주세요» 문구 없음', !/에서 승인해 주세요/.test(mm));
for (const f of ['public/admin.html', 'public/manager.html', 'public/branch.html', 'public/admin/student.html'])
  ok(f + ' 가 class-move-modal ?v=13 이상', (() => { const m = SRC(f).match(/class-move-modal\.js\?v=(\d+)/); return m && Number(m[1]) >= 13; })());
ok('강사 화면이 auto_applied 를 말한다', /j\.auto_applied/.test(SRC('public/teacher.html')) && /j\.auto_applied/.test(SRC('public/admin/mypage.html')));

console.log('\n④ 15분 감시견 배선');
const idx = SRC('src/index.ts');
const wi = idx.indexOf("import('./schedule-request-expire')");
const before = wi > 0 ? idx.slice(Math.max(0, wi - 400), wi) : '';
ok('isWatchdogTick 블록 안에서 부른다', /if \(isWatchdogTick\) \{\s*try \{\s*const \{ runScheduleRequestExpire \}/.test(before + idx.slice(wi, wi + 10)));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
