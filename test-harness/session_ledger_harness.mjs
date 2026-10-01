// 📒 회차 원장 하니스 (2026-10-01)
//   정본 src/session-ledger.ts 를 --experimental-strip-types 로 «실제로 돌려» 판정을 확인하고,
//   배선(API·화면)이 그 정본을 쓰는지 본다.
//   사장님 결정: 30분 전까지 연락 없는 결석 = 차감 · 30분 전 연락 = 연기(차감 안 함)
//                휴원 한 번 최대 4주 · 최근 1년 3번
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const LEDGER = process.env.LEDGER_SRC || join(SRC, 'session-ledger.ts');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); } };

// ── ① 정본을 실제로 돌린다 ──
const tmp = mkdtempSync(join(tmpdir(), 'sl-'));
writeFileSync(join(tmp, 'ledger.ts'), readFileSync(LEDGER, 'utf8'));
writeFileSync(join(tmp, 'run.mjs'), `
import * as L from './ledger.ts';
const base = { schedStatus:'active', upcoming:false, attended:false, studentNoShow:false, teacherNoShow:false, postponeReq:null, onLeave:false, onHold:false, holiday:false };
const c = (o) => L.classifyOccurrence({ ...base, ...o });
const out = {
  attended: c({ attended:true }),
  attendedEvenIfNoShow: c({ attended:true, studentNoShow:true }),
  studentAbsent: c({ studentNoShow:true }),
  early: c({ schedStatus:'postponed', postponeReq:{ minutes_before: 31 } }),
  exactly30: c({ schedStatus:'postponed', postponeReq:{ minutes_before: 30 } }),
  late: c({ schedStatus:'postponed', postponeReq:{ minutes_before: 10 } }),
  feeFree: c({ schedStatus:'postponed', postponeReq:{ fee_type:'free' } }),
  feePaid: c({ schedStatus:'postponed', postponeReq:{ fee_type:'paid' } }),
  postponedNoReq: c({ schedStatus:'postponed' }),
  upcoming: c({ upcoming:true }),
  leave: c({ onLeave:true, studentNoShow:true }),
  hold: c({ onHold:true }),
  holiday: c({ holiday:true }),
  teacherAbsent: c({ teacherNoShow:true, studentNoShow:true }),
  unknownNoRecord: c({}),
  unknownAttNull: c({ attended:null }),
  defs: L.LEDGER_STATES,
  sum: L.summarize(['done','student_absent','late_postpone','postponed','teacher_absent','leave','unknown','upcoming']),
  v: {
    ok28: L.validateLeave({ start_date:'2026-11-01', end_date:'2026-11-28' }, [], Date.parse('2026-10-01')),
    over28: L.validateLeave({ start_date:'2026-11-01', end_date:'2026-11-29' }, [], Date.parse('2026-10-01')),
    backwards: L.validateLeave({ start_date:'2026-11-10', end_date:'2026-11-01' }, [], Date.parse('2026-10-01')),
    badDate: L.validateLeave({ start_date:'2026/11/01', end_date:'2026-11-02' }, [], Date.parse('2026-10-01')),
    third: L.validateLeave({ start_date:'2026-12-01', end_date:'2026-12-05' },
      [{ start_date:'2026-01-01', end_date:'2026-01-05', status:'active', created_at: Date.parse('2026-01-01') },
       { start_date:'2026-03-01', end_date:'2026-03-05', status:'active', created_at: Date.parse('2026-03-01') }], Date.parse('2026-10-01')),
    fourth: L.validateLeave({ start_date:'2026-12-01', end_date:'2026-12-05' },
      [{ start_date:'2026-01-01', end_date:'2026-01-05', status:'active', created_at: Date.parse('2026-01-01') },
       { start_date:'2026-03-01', end_date:'2026-03-05', status:'active', created_at: Date.parse('2026-03-01') },
       { start_date:'2026-05-01', end_date:'2026-05-05', status:'active', created_at: Date.parse('2026-05-01') }], Date.parse('2026-10-01')),
    fourthButOneCancelled: L.validateLeave({ start_date:'2026-12-01', end_date:'2026-12-05' },
      [{ start_date:'2026-01-01', end_date:'2026-01-05', status:'active', created_at: Date.parse('2026-01-01') },
       { start_date:'2026-03-01', end_date:'2026-03-05', status:'cancelled', created_at: Date.parse('2026-03-01') },
       { start_date:'2026-05-01', end_date:'2026-05-05', status:'active', created_at: Date.parse('2026-05-01') }], Date.parse('2026-10-01')),
    oldOnesDontCount: L.validateLeave({ start_date:'2026-12-01', end_date:'2026-12-05' },
      [{ start_date:'2025-01-01', end_date:'2025-01-05', status:'active', created_at: Date.parse('2025-01-01') },
       { start_date:'2025-03-01', end_date:'2025-03-05', status:'active', created_at: Date.parse('2025-03-01') },
       { start_date:'2025-05-01', end_date:'2025-05-05', status:'active', created_at: Date.parse('2025-05-01') }], Date.parse('2026-10-01')),
    overlap: L.validateLeave({ start_date:'2026-11-05', end_date:'2026-11-10' },
      [{ start_date:'2026-11-01', end_date:'2026-11-06', status:'active', created_at: Date.parse('2026-10-01') }], Date.parse('2026-10-01')),
    touching: L.validateLeave({ start_date:'2026-11-07', end_date:'2026-11-10' },
      [{ start_date:'2026-11-01', end_date:'2026-11-06', status:'active', created_at: Date.parse('2026-10-01') }], Date.parse('2026-10-01')),
  },
  onLeave: [L.isOnLeave([{ start_date:'2026-11-01', end_date:'2026-11-28', status:'active' }], '2026-11-28') ? 1 : 0,
            L.isOnLeave([{ start_date:'2026-11-01', end_date:'2026-11-28', status:'active' }], '2026-11-29') ? 1 : 0,
            L.isOnLeave([{ start_date:'2026-11-01', end_date:'2026-11-28', status:'cancelled' }], '2026-11-10') ? 1 : 0],
  consts: { gt: L.POSTPONE_FREE_MINUTES_GT, max: L.LEAVE_MAX_DAYS, per: L.LEAVE_MAX_PER_YEAR },
  errKeys: Object.keys(L.LEAVE_ERROR_TEXT),
};
console.log(JSON.stringify(out));
`);
let R = null;
try {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  R = JSON.parse(r.stdout.trim().split('\n').pop());
} catch (e) { ok('정본을 실제로 돌렸다', false, String(e && e.message || e)); }

if (R) {
  ok('들어왔으면 완료', R.attended === 'done');
  ok('들어왔으면 결석 기록이 있어도 완료(수업은 했다)', R.attendedEvenIfNoShow === 'done');
  ok('연락 없는 결석 = 학생 결석', R.studentAbsent === 'student_absent');
  ok('31분 전 연기 = 연기', R.early === 'postponed');
  ok('정확히 30분 전은 급여와 같은 기준(>30)으로 늦은 연기', R.exactly30 === 'late_postpone');
  ok('10분 전 연기 = 늦은 연기', R.late === 'late_postpone');
  ok('fee_type free = 연기', R.feeFree === 'postponed');
  ok('fee_type paid = 늦은 연기', R.feePaid === 'late_postpone');
  ok('요청 기록 없는 연기는 결석으로 단정하지 않음', R.postponedNoReq === 'postponed');
  ok('아직 안 했으면 예정', R.upcoming === 'upcoming');
  ok('휴원이면 결석 기록이 있어도 휴원', R.leave === 'leave');
  ok('보류 기간 = 결석 보류', R.hold === 'absence_hold');
  ok('공휴일', R.holiday === 'holiday');
  ok('강사 결석이 학생 결석보다 먼저', R.teacherAbsent === 'teacher_absent');
  ok('기록 없음 = 미정 (지어내지 않음)', R.unknownNoRecord === 'unknown');
  ok('출석을 못 읽음 = 미정', R.unknownAttNull === 'unknown');
  // 차감 표 — 짝으로
  const D = R.defs;
  ok('완료·학생 결석·늦은 연기는 차감', D.done.deduct && D.student_absent.deduct && D.late_postpone.deduct);
  ok('연기·강사 결석·휴원·보류·공휴일·예정·미정은 차감 안 함',
    ['postponed','teacher_absent','leave','absence_hold','holiday','upcoming','unknown'].every(k => D[k] && D[k].deduct === false));
  ok('연기·강사 결석은 이월', D.postponed.carry && D.teacher_absent.carry);
  ok('요약: 차감 3 · 이월 2 · 전체 8', R.sum.deducted === 3 && R.sum.carried === 2 && R.sum.total === 8, JSON.stringify(R.sum));
  // 휴원 규칙
  const v = R.v;
  ok('28일(4주) 휴원 통과', v.ok28 === null, String(v.ok28));
  ok('29일 휴원 막음', v.over28 === 'too_long', String(v.over28));
  ok('끝 < 시작 막음', v.backwards === 'end_before_start');
  ok('날짜 형식 틀리면 막음', v.badDate === 'bad_date');
  ok('최근 1년 3번째 통과', v.third === null, String(v.third));
  ok('최근 1년 4번째 막음', v.fourth === 'yearly_limit', String(v.fourth));
  ok('취소한 휴원은 안 셈', v.fourthButOneCancelled === null, String(v.fourthButOneCancelled));
  ok('1년보다 오래된 휴원은 안 셈', v.oldOnesDontCount === null, String(v.oldOnesDontCount));
  ok('겹치면 막음', v.overlap === 'overlap');
  ok('맞닿기만 하면 통과', v.touching === null, String(v.touching));
  ok('휴원 마지막 날 포함 · 다음 날 제외 · 취소분 제외', R.onLeave.join(',') === '1,0,0', R.onLeave.join(','));
  ok('상수: 30분 · 28일 · 3번', R.consts.gt === 30 && R.consts.max === 28 && R.consts.per === 3, JSON.stringify(R.consts));
  ok('오류 문구가 사유 코드마다 있음', ['bad_date','end_before_start','too_long','yearly_limit','overlap'].every(k => R.errKeys.includes(k)));
}

// ── ② 급여와 같은 30분 기준인가(두 장부가 어긋나지 않게) ──
const admin = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
const mango = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
ok('급여 쪽 연기 판정도 «30분 초과 = free»', /minutesBefore\s*>\s*30\s*\?\s*'free'\s*:\s*'paid'/.test(admin));

// ── ③ 배선 ──
const load = readFileSync(join(SRC, 'session-ledger-load.ts'), 'utf8');
ok('로더가 정본 classifyOccurrence 를 부른다', /classifyOccurrence\(\{/.test(load));
ok('로더가 휴원·보류·공휴일·연기요청·강사오판대조를 넘긴다',
  /onLeave:\s*!!isOnLeave\(/.test(load) && /onHold:\s*!!heldOnFor\(/.test(load) && /holiday:\s*holidays\.has\(/.test(load)
  && /postponeReq:\s*postponeReq\[key\]/.test(load) && /teacherPresenceByRoom\(/.test(load));
ok('출석을 못 읽으면 null(미정)로 넘긴다', /if \(!attOk\) attended = null;/.test(load) && /attended === null \? null/.test(load));
ok('로더는 class_schedules 를 고치지 않는다', !/UPDATE\s+class_schedules|DELETE\s+FROM\s+class_schedules/i.test(load));
ok('API: 회차 원장 GET 경로', /session-ledger\$\//.test(mango) && /buildStudentLedger\(env/.test(mango));
ok('API: 휴원 저장은 정본 validateLeave 를 지난다', /const bad = validateLeave\(req, existing, Date\.now\(\)\)/.test(mango));
ok('API: 휴원 쓰기는 강사·조직 계정을 막는다', /강사는 휴원을/.test(mango) && /isOrgScopedRole\(actor\.role\)\) return json\(\{ ok: false, error: 'forbidden_scope' \}/.test(mango));
ok('API: 기존 휴원을 못 읽으면 막는 쪽으로', /if \(existing === null\) return json\(\{ ok: false, error: 'leaves_read_failed' \}, 500\)/.test(mango));

const html = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'admin', 'student.html'), 'utf8');
ok('화면: 회차 원장 탭과 패널', /data-tab="ledger"/.test(html) && /data-panel="ledger"/.test(html));
ok('화면: 서버가 보낸 라벨을 그린다(판정 복제 없음)', /i\.label_en : i\.label_ko/.test(html) && !/minutes_before\s*>\s*30/.test(html));
ok('화면: 성공 판정은 ok === true', /d && d\.ok === true/.test(html));
ok('화면: 언어 전환 때 다시 그림', /window\.slRerender\) window\.slRerender\(\)/.test(html));

console.log(`session_ledger_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
