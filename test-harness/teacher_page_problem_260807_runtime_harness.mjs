// -*- coding: utf-8 -*-
// 🧪 「NEW TEACHER'S PAGE PROBLEM (2)」 — **실행** 하네스 (정적 검사가 아니라 코드를 돌린다)
//   실행: node test-harness/teacher_page_problem_260807_runtime_harness.mjs
//
//   왜 따로 두나: 글자 검사(teacher_page_problem_260807_harness.mjs)는 «그렇게 써 있는가» 만 안다.
//   돈(연기 지급률)과 문(입장 시간창)은 **실제로 그 값이 나오는지** 를 봐야 한다.
//   → esbuild 로 운영 소스를 실번들 → 가짜 D1 위에서 핸들러를 직접 호출한다.
//
//   ⚠️ 시간창 계산·급여 계산 코드는 **운영본 그대로** 돈다(여기서 다시 구현하지 않는다).
import { mkdtempSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond || extra === undefined ? '' : '  → ' + JSON.stringify(extra)}`);
}

/* esbuild 위치 — cloudflare-deploy/node_modules 가 비어 있는 때가 있어(병행 세션의 정리)
   다른 worktree 의 것도 찾아본다. 없으면 «검사 못 함» 을 분명히 말하고 끝낸다(조용한 통과 금지). */
function findBin(rel) {
  const cands = [join(CF, 'node_modules', ...rel)];
  const wt = join(ROOT, '.claude', 'worktrees');
  try {
    for (const d of (await0(wt) || [])) cands.push(join(wt, d, 'cloudflare-deploy', 'node_modules', ...rel));
  } catch {}
  return cands.find((p) => existsSync(p)) || null;
}
function await0(dir) { try { return require0(dir); } catch { return []; } }
function require0(dir) { return (globalThis.__ls || (globalThis.__ls = {}))[dir] ||= readdir(dir); }
function readdir(dir) { try { return require('node:fs').readdirSync(dir); } catch { return []; } }

// 위 헬퍼는 CJS require 를 쓰지 않도록 단순화
const { readdirSync } = await import('node:fs');
function findEsbuild() {
  const rel = ['esbuild', 'bin', 'esbuild'];
  const cands = [join(CF, 'node_modules', ...rel)];
  const wt = join(ROOT, '.claude', 'worktrees');
  try { for (const d of readdirSync(wt)) cands.push(join(wt, d, 'cloudflare-deploy', 'node_modules', ...rel)); } catch {}
  return cands.find((p) => existsSync(p)) || null;
}

const ESBUILD = findEsbuild();
if (!ESBUILD) {
  console.log('\n⚠️  esbuild 를 찾지 못했습니다 (cloudflare-deploy/node_modules 가 비어 있음).');
  console.log('    npm install 후 다시 실행하세요. — 검사를 «통과» 로 처리하지 않습니다.');
  process.exit(2);
}

const outDir = mkdtempSync(join(tmpdir(), 'mangoi-rt-'));
function bundle(entryAbs, outName) {
  const outFile = join(outDir, outName);
  execFileSync(process.execPath, [
    ESBUILD, entryAbs, '--bundle', '--format=esm', '--platform=neutral', '--target=es2022',
    `--outfile=${outFile}`,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return outFile;
}

/* ── api-teacher 는 쿠키 세션이 필요하다 → src 를 임시 복사해 auth-admin 만 스텁한다.
     시간창 계산 코드는 손대지 않는다(그게 검사 대상이다). */
const srcCopy = join(outDir, 'src');
cpSync(join(CF, 'src'), srcCopy, { recursive: true });
writeFileSync(join(srcCopy, 'auth-admin.ts'), `
export const PH_MANAGERS: string[] = [];
export async function getAdminActor(_req: any, _env: any) {
  return { ok: true, isTeacher: true, role: 'teacher', username: 'maimai', name: 'MAIMAI' };
}
export async function requireAdmin(){ return { ok: true }; }
export default {};
`, 'utf8');
const teacherBundle = bundle(join(srcCopy, 'api-teacher.ts'), 'api-teacher.mjs');
const { handleTeacherApi } = await import(pathToFileURL(teacherBundle).href);
const adminBundle = bundle(join(CF, 'src', 'api-admin.ts'), 'api-admin.mjs');
const { handleAdminApi } = await import(pathToFileURL(adminBundle).href);
console.log('— 운영 소스 실번들 로드 완료 (api-teacher · api-admin) —');

// ═══════════════════════════════════════════════════════════════════
// ⑤⑪ 강사 입장 창 — 「그날 하루 종일」
// ═══════════════════════════════════════════════════════════════════
console.log('\n[ ⑤⑪ 실행: 강사 문이 그날 하루 종일 열리는가 ]');

const KST = 9 * 3600 * 1000;
const kNow = new Date(Date.now() + KST);
const pad = (n) => String(n).padStart(2, '0');
const TODAY = `${kNow.getUTCFullYear()}-${pad(kNow.getUTCMonth() + 1)}-${pad(kNow.getUTCDate())}`;
const DAY_START = Date.UTC(kNow.getUTCFullYear(), kNow.getUTCMonth(), kNow.getUTCDate(), 0, 0, 0) - KST;

/** 오늘 특정 시각(KST)에 수업 1건이 있는 강사용 가짜 D1 */
function teacherDB(startTimeHHMM) {
  const rows = [{
    id: 901, user_id: 'stu_a', student_name: '학생A', day_of_week: null,
    scheduled_date: TODAY, start_time: startTimeHHMM, duration_min: 20,
    notes: null, class_type: 'regular', source: 'admin_ui', level: 'Lv3', textbook: 'BTS 1', student_en: 'Student A',
  }];
  const empty = { results: [] };
  return {
    exec: async () => {},
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      const api = {
        bind: () => api,
        all: async () => {
          if (/FROM class_schedules cs/i.test(s)) return { results: rows };
          if (/FROM teachers/i.test(s)) return { results: [{ id: 27, name: 'MAIMAI' }] };
          return empty;
        },
        first: async () => null,
        run: async () => ({ meta: {} }),
      };
      return api;
    },
  };
}
const teacherEnv = (db) => ({ DB: db, MANGO_KV: { get: async () => null, put: async () => {} } });

async function portal(startTimeHHMM) {
  const url = new URL('https://x/api/teacher/portal');
  const res = await handleTeacherApi(new Request(url, { method: 'GET' }), url, teacherEnv(teacherDB(startTimeHHMM)));
  return res.json();
}

// ① 한참 뒤(23:50) 수업 — 예전이면 «5시간 뒤 입장» 으로 잠겨 있던 상황
const late = await portal('23:50');
const lateC = (late.classes || [])[0] || {};
check('응답에 classes 가 있다', !!lateC.schedule_id, late.error || Object.keys(late));
check('enter_from_ts = 오늘 00:00(KST)', lateC.enter_from_ts === DAY_START, { got: lateC.enter_from_ts, want: DAY_START });
check('enter_until_ts = 오늘 23:59:59.999(KST)', lateC.enter_until_ts === DAY_START + 86400000 - 1, lateC.enter_until_ts);
check('🚪 시작 몇 시간 전이어도 can_enter = true', lateC.can_enter === true, lateC.can_enter);
check('🔴 그래도 «수업 시간» 판정은 그대로다 (join_open=false · status=early)',
  lateC.join_open === false && lateC.status === 'early', { join_open: lateC.join_open, status: lateC.status });
check('🔴 open_at_ts 는 예전 규칙(시작 30분 전) 그대로 — 카운트다운이 흔들리지 않는다',
  lateC.start_ts - lateC.open_at_ts === 30 * 60 * 1000, (lateC.start_ts - lateC.open_at_ts) / 60000);

// ② 이미 끝난 수업(00:05 시작·20분) — 「Done 이라 문이 잠긴다」던 그 상태
const done = await portal('00:05');
const doneC = (done.classes || [])[0] || {};
const nowMs = Date.now();
check('끝난 수업도 can_enter = true (연장·마무리 — 요청 ⑪)',
  doneC.can_enter === true && nowMs > doneC.close_at_ts, { can_enter: doneC.can_enter, closed: nowMs > doneC.close_at_ts });
check('🔴 «끝났다» 는 사실 자체는 그대로 남는다 (status=done → 평가 버튼이 뜬다)',
  doneC.status === 'done', doneC.status);
check('주간 스케줄 응답 모양이 그대로다 ({start,end,days[7]})',
  !!done.week && Array.isArray(done.week.days) && done.week.days.length === 7,
  done.week && Object.keys(done.week));
check('🔴 학생 입장 창 값(student_open_lead_min)이 그대로 내려온다',
  doneC.student_open_lead_min === 10, doneC.student_open_lead_min);

// ═══════════════════════════════════════════════════════════════════
// ② 연기 지급률 — 「언제 연기했나」로 금액이 갈린다
// ═══════════════════════════════════════════════════════════════════
console.log('\n[ ② 실행: 연기 지급률이 요청 시점(fee_type)으로 갈리는가 ]');

const Y = 2026, M = 1;            // 과거 달 → 전부 «이미 지난 수업»
const D1DATE = `${Y}-${pad(M)}-05`;

/** payroll 계산용 가짜 D1.
 *  earlyRule: null = 규칙 없음 / {enabled, amount} = 사전연기 지급률 규칙 */
function payrollDB(earlyRule) {
  const rules = [
    { code: 'no_feedback_day', label_ko: '당일 피드백 미작성', label_en: 'No feedback', rule_type: 'per_lesson', amount: 25, enabled: 1, sort_order: 1 },
    { code: 'late_no_extend', label_ko: '지각', label_en: 'Late', rule_type: 'per_minute', amount: 10, enabled: 1, sort_order: 2 },
    { code: 'absent_pay_percent', label_ko: '결석 지급률', label_en: 'Absent %', rule_type: 'policy_percent', amount: 0, enabled: 1, sort_order: 4 },
    { code: 'postponed_pay_percent', label_ko: '연기 지급률', label_en: 'Postponed %', rule_type: 'policy_percent', amount: 100, enabled: 1, sort_order: 5 },
  ];
  if (earlyRule) rules.push({
    code: 'postponed_early_pay_percent', label_ko: '사전 연기 지급률', label_en: 'Early postpone %',
    rule_type: 'policy_percent', amount: earlyRule.amount, enabled: earlyRule.enabled, sort_order: 6,
  });

  const mk = (id, status) => ({
    id, user_id: 'stu' + id, student_name: '학생' + id, teacher_id: 27, teacher_name: 'MAIMAI',
    scheduled_date: D1DATE, day_of_week: null, start_time: '18:00', duration_min: 20,
    status, class_type: 'regular',
  });
  const schedules = [
    mk(101, 'postponed'),   // 사전 연기(30분보다 이른 요청) — fee_type='free'
    mk(102, 'postponed'),   // 임박 연기(30분 이내)        — fee_type='paid'
    mk(103, 'postponed'),   // 요청 기록 없음               — 판정 근거 없음
    mk(104, 'active'),      // 정상 완료 (회귀 확인용)
  ];
  const requests = [
    { schedule_id: 101, orig_date: D1DATE, fee_type: 'free', minutes_before: 300, created_at: 1 },
    { schedule_id: 102, orig_date: D1DATE, fee_type: 'paid', minutes_before: 12, created_at: 1 },
  ];
  const empty = { results: [] };
  return {
    exec: async () => {},
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      const api = {
        bind: () => api,
        all: async () => {
          if (/FROM payroll_deduction_rules/i.test(s)) return { results: rules };
          if (/FROM payroll_levels/i.test(s)) return empty;
          if (/FROM lesson_late_minutes/i.test(s)) return empty;
          if (/FROM teacher_profiles/i.test(s)) return { results: [{ id: 27, korean_name: 'MAIMAI', english_name: 'MAIMAI', fee_per_10min: 30, level: null }] };
          if (/FROM class_schedules/i.test(s)) return { results: schedules };
          if (/FROM class_no_show/i.test(s)) return empty;
          if (/FROM schedule_change_requests/i.test(s)) return { results: requests };
          if (/FROM teacher_class_feedback/i.test(s)) return empty;
          if (/FROM feedback_drafts/i.test(s)) return empty;
          if (/FROM students_erp/i.test(s)) return empty;
          return empty;
        },
        first: async () => {
          if (/COUNT\(\*\) AS c FROM payroll_deduction_rules/i.test(s)) return { c: rules.length };
          if (/FROM payroll_meta/i.test(s)) return { value: '1' };
          return null;
        },
        run: async () => ({ meta: {} }),
      };
      return api;
    },
  };
}

async function lessons(earlyRule) {
  const url = new URL(`https://x/api/admin/payroll/lessons?year=${Y}&month=${M}&teacher_name=MAIMAI`);
  const res = await handleAdminApi(new Request(url, { method: 'GET' }), url, { DB: payrollDB(earlyRule) });
  return res.json();
}
const byId = (j, id) => (j.lessons || []).find((l) => l.schedule_id === id) || {};

// ── (A) 규칙이 아예 없는 DB — 지금까지의 동작이 그대로여야 한다
const A = await lessons(null);
check('규칙 없음: 연기 3건 모두 전액 지급 (기존 동작 유지)',
  byId(A, 101).amount === 60 && byId(A, 102).amount === 60 && byId(A, 103).amount === 60,
  [byId(A, 101).amount, byId(A, 102).amount, byId(A, 103).amount]);
check('🔴 연기 수업에 «당일 피드백 미작성» 공제가 붙지 않는다',
  byId(A, 101).deduction_total === 0, byId(A, 101).deductions);
check('정상 완료 수업은 전액 + 피드백 공제 (회귀 없음)',
  byId(A, 104).amount === 60 && byId(A, 104).deduction_total === 25 && byId(A, 104).net_amount === 35,
  { amount: byId(A, 104).amount, ded: byId(A, 104).deduction_total, net: byId(A, 104).net_amount });

// ── (B) 새 규칙이 «꺼져» 있는 상태(= 우리가 넣은 기본값)
const B = await lessons({ enabled: 0, amount: 0 });
check('🔴 새 규칙 꺼짐: 금액이 하나도 바뀌지 않는다 (배포해도 급여가 안 움직인다)',
  byId(B, 101).amount === 60 && byId(B, 102).amount === 60 && byId(B, 103).amount === 60,
  [byId(B, 101).amount, byId(B, 102).amount, byId(B, 103).amount]);
check('꺼져 있어도 «왜 이 금액인지» 근거는 내려온다 (화면 설명용)',
  byId(B, 101).postpone_fee_type === 'free' && byId(B, 102).postpone_fee_type === 'paid',
  [byId(B, 101).postpone_fee_type, byId(B, 102).postpone_fee_type]);

// ── (C) 새 규칙을 «켠» 상태 — 문서 규칙대로 갈린다
const C = await lessons({ enabled: 1, amount: 0 });
check('규칙 켬 · 사전 연기(30분보다 이름) = 0 지급', byId(C, 101).amount === 0, byId(C, 101).amount);
check('규칙 켬 · 임박 연기(30분 이내) = 전액 지급', byId(C, 102).amount === 60, byId(C, 102).amount);
check('🔴 규칙 켬 · 요청 기록이 없는 연기 = 기존 규칙 그대로 (모르는 것을 사전연기로 단정하지 않는다)',
  byId(C, 103).amount === 60, byId(C, 103).amount);
check('지급률이 화면용으로 함께 내려온다', byId(C, 101).postpone_pay_percent === 0 && byId(C, 102).postpone_pay_percent === 100,
  [byId(C, 101).postpone_pay_percent, byId(C, 102).postpone_pay_percent]);
check('정상 완료 수업은 규칙을 켜도 그대로 (간섭 없음)',
  byId(C, 104).amount === 60 && byId(C, 104).net_amount === 35, [byId(C, 104).amount, byId(C, 104).net_amount]);
check('합계도 함께 움직인다 (요약이 상세와 어긋나지 않는다)',
  (C.summary ? C.summary.pay_amount : null) === (60 + 60 + 0 + 60),
  C.summary && C.summary.pay_amount);

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
