// -*- coding: utf-8 -*-
// 🧾 결재 규칙 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/approval_policy_harness.mjs
//   대상:  cloudflare-deploy/src/approval-policy.ts (순수 모듈 — DB·네트워크·AI 를 안 부른다)
//
//   이 파일이 지키는 것 —
//     결재는 «돈»과 «권한»이 걸린 기능이라, 규칙이 조용히 틀어지면 사고가 크다.
//     특히 아래 넷은 화면만 봐서는 틀어진 걸 알 수 없다:
//
//     A. 결재선 자동 결정 — 금액이 기준을 넘으면 2단계, 인사·급여는 경영진 직행
//     B. 열람등급 — 인사·급여가 매니저·강사에게 새지 않는가
//        (예전엔 본사 계정이면 **전원이 급여까지** 봤다. 그걸 막으려고 만든 규칙이다)
//     C. 올리기 권한 — 강사는 긴급·고객불만만. 지출 결재를 올릴 수 없어야 한다
//     D. 자동 점검 — 중복청구·예산초과·첨부누락·금액불일치를 실제로 잡는가
//        (이게 «실수를 줄인다»의 실체다. AI 가 아니라 계산이 한다)
//
//     E. 회귀 감시 — 옛 분류값(expense·doc·leave)이 사라지지 않았는가.
//        이름을 바꾸면 2026-08-05 부터 쌓인 결재가 «알 수 없는 분류»가 된다.

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);

const {
  REQ_TYPES, TYPES, typeSpec, stagesFor, deadlineMs, stageDeadlineMs,
  isExec, isHqStaff, canDecideStage, canSubmit, canView, runChecks,
  TWO_STEP_THRESHOLD, MONTHLY_BUDGET, AUTO_APPROVE_ENABLED,
} = P;

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

// ── 등장인물 ────────────────────────────────────────────────────────────────
const boss    = { ok: true, username: 'admin',     name: '대표',            role: 'hq',    isTeacher: false };
const office  = { ok: true, username: 'mgr_jjw',   name: '본사 담당',        role: 'hq',    isTeacher: false };
const phMgr   = { ok: true, username: 'mgr_melca', name: 'Melca',           role: 'hq',    isTeacher: false };
const teacher = { ok: true, username: 'hq_t01',    name: 'Teacher Ann',     role: 'teacher', isTeacher: true };
const agency  = { ok: true, username: 'shop_01',   name: '망고아이 대리점',  role: 'agency', isTeacher: false };

console.log('════════ 결재 규칙 하니스 ════════');

// ══ A. 결재선 자동 결정 ═══════════════════════════════════════════════════
console.log('\n[A] 결재선이 금액·분류로 자동으로 정해지는가');

const smallPhp = TWO_STEP_THRESHOLD.PHP - 1;
const bigPhp   = TWO_STEP_THRESHOLD.PHP;

check('소액 물품구입은 1단계',
  stagesFor('purchase', smallPhp, 'PHP').length === 1,
  JSON.stringify(stagesFor('purchase', smallPhp, 'PHP')));

check('기준 금액부터는 2단계 (담당 → 경영진)',
  (() => { const s = stagesFor('purchase', bigPhp, 'PHP');
           return s.length === 2 && s[0].role === 'staff' && s[1].role === 'exec'; })(),
  JSON.stringify(stagesFor('purchase', bigPhp, 'PHP')));

check('지출 정산도 같은 기준을 쓴다',
  stagesFor('expense', bigPhp, 'PHP').length === 2);

check('통화가 다르면 그 통화의 기준을 쓴다 (원화 소액은 1단계)',
  stagesFor('expense', TWO_STEP_THRESHOLD.KRW - 1, 'KRW').length === 1);

check('원화 고액은 2단계',
  stagesFor('expense', TWO_STEP_THRESHOLD.KRW, 'KRW').length === 2);

check('인사·급여는 중간을 건너뛰고 경영진 직행 (1단계·exec)',
  (() => { const s = stagesFor('hr', null, 'PHP');
           return s.length === 1 && s[0].role === 'exec'; })(),
  JSON.stringify(stagesFor('hr', null, 'PHP')));

check('긴급은 먼저 본 사람이 닫는다 (role=any)',
  stagesFor('urgent', null, 'PHP')[0].role === 'any');

// 금액을 모르면 «큰 건일 수도 있다»고 본다 — 놓치는 쪽보다 한 번 더 보는 쪽이 안전하다.
check('금액을 모르는 지출은 안전하게 2단계로 본다',
  stagesFor('expense', null, 'PHP').length === 2);

check('모르는 분류는 «일반 문서»로 떨어진다 (옛 데이터·오입력에도 안 깨짐)',
  typeSpec('무슨분류인지모름').key === 'doc');

// ══ B. 열람등급 — 여기가 새면 급여가 샌다 ══════════════════════════════════
console.log('\n[B] 열람등급 — 인사·급여가 새지 않는가');

check('인사·급여를 본사 담당은 볼 수 없다',
  canView(office, 'hr', 'admin', [], false) === false);

check('인사·급여를 필리핀 매니저는 볼 수 없다',
  canView(phMgr, 'hr', 'admin', [], true) === false);

check('인사·급여를 강사는 볼 수 없다',
  canView(teacher, 'hr', 'admin', [], false) === false);

check('인사·급여를 경영진은 본다',
  canView(boss, 'hr', 'office', [], false) === true);

check('내가 올린 인사 건은 내가 본다 (기안자는 언제나 본인 건을 본다)',
  canView(office, 'hr', 'mgr_jjw', [], false) === true);

check('지출 결재를 강사는 볼 수 없다 (회사 지출 내역)',
  canView(teacher, 'expense', 'mgr_melca', [], false) === false);

check('긴급은 강사도 본다 (현장에서 먼저 아는 사람이 강사다)',
  canView(teacher, 'urgent', 'mgr_melca', [], false) === true);

check('긴급은 필리핀 매니저도 본다',
  canView(phMgr, 'urgent', 'office', [], true) === true);

check('남의 지출 결재를 필리핀 매니저가 훑어볼 수 없다',
  canView(phMgr, 'expense', 'office', [], true) === false);

check('결재선에 이름이 오른 사람은 그 건을 본다',
  canView(phMgr, 'expense', 'office', ['mgr_melca'], true) === true);

// ══ C. 올리기 권한 ════════════════════════════════════════════════════════
console.log('\n[C] 누가 무엇을 올릴 수 있는가');

check('강사는 긴급을 올릴 수 있다',      canSubmit(teacher, 'urgent') === true);
check('강사는 고객불만을 올릴 수 있다',  canSubmit(teacher, 'complaint') === true);
check('강사는 지출을 올릴 수 없다',      canSubmit(teacher, 'expense') === false);
check('강사는 인사·급여를 올릴 수 없다', canSubmit(teacher, 'hr') === false);
check('본사 담당은 지출을 올릴 수 있다', canSubmit(office, 'expense') === true);
check('필리핀 매니저는 물품구입을 올릴 수 있다', canSubmit(phMgr, 'purchase') === true);
check('대리점 계정은 결재를 올릴 수 없다', canSubmit(agency, 'expense') === false);

// ══ C-2. 결재 권한 ════════════════════════════════════════════════════════
console.log('\n[C-2] 누가 어느 단계를 결재할 수 있는가');

check('경영진 단계는 경영진만',
  canDecideStage(boss, 'exec', false) === true && canDecideStage(office, 'exec', false) === false);

check('담당 단계를 필리핀 매니저는 결재할 수 없다 (필리핀이 올리고 한국이 결재한다)',
  canDecideStage(phMgr, 'staff', true) === false);

check('담당 단계는 한국 본사 담당이 결재한다',
  canDecideStage(office, 'staff', false) === true);

// 긴급은 «확인했다» 표시지 돈이 아니다. 현지에서 못 닫으면 시차만큼 늦는다.
check('긴급은 필리핀 매니저도 닫을 수 있다',
  canDecideStage(phMgr, 'any', true) === true);

check('강사는 어느 단계도 결재할 수 없다',
  canDecideStage(teacher, 'any', false) === false &&
  canDecideStage(teacher, 'staff', false) === false);

check('대리점 계정은 결재할 수 없다',
  canDecideStage(agency, 'staff', false) === false);

check('경영진 판정 — 이름으로도 인정한다 (계정 새로 만들어도 결재가 안 멈추게)',
  isExec({ ok: true, username: 'ceo_new', name: '김대표', role: 'hq', isTeacher: false }) === true);

check('경영진 판정 — 강사는 이름이 뭐든 아니다',
  isExec({ ok: true, username: 'x', name: '대표', role: 'teacher', isTeacher: true }) === false);

// ══ D. 자동 점검 — 실수를 계산으로 잡는다 ═════════════════════════════════
console.log('\n[D] 자동 점검이 실수를 잡는가');

const codes = (fl) => fl.map(f => f.code);

check('영수증이 필요한 분류인데 첨부가 없으면 표시한다',
  codes(runChecks({ reqType: 'expense', amount: 100, currency: 'PHP', hasFile: false })).includes('no_file'));

check('첨부가 있으면 그 표시는 안 뜬다',
  !codes(runChecks({ reqType: 'expense', amount: 100, currency: 'PHP', hasFile: true })).includes('no_file'));

check('문서 결재에는 첨부 표시를 띄우지 않는다',
  !codes(runChecks({ reqType: 'doc', hasFile: false })).includes('no_file'));

check('영수증 금액과 입력 금액이 다르면 잡는다 (금액 오타)',
  codes(runChecks({ reqType: 'expense', amount: 5000, currency: 'PHP', hasFile: true, ocrAmount: 500 }))
    .includes('amount_mismatch'));

check('영수증 금액과 같으면 안 잡는다',
  !codes(runChecks({ reqType: 'expense', amount: 5000, currency: 'PHP', hasFile: true, ocrAmount: 5000 }))
    .includes('amount_mismatch'));

check('1% 이내 차이(반올림)는 잡지 않는다 — 잔소리가 되면 아무도 안 읽는다',
  !codes(runChecks({ reqType: 'expense', amount: 10000, currency: 'PHP', hasFile: true, ocrAmount: 10050 }))
    .includes('amount_mismatch'));

check('같은 금액·같은 분류가 최근에 또 있으면 중복 청구로 표시한다',
  codes(runChecks({ reqType: 'expense', amount: 3000, currency: 'PHP', hasFile: true, duplicateCount: 1 }))
    .includes('duplicate'));

check('이번 달 합계가 예산을 넘으면 표시한다',
  codes(runChecks({ reqType: 'expense', amount: 1000, currency: 'PHP', hasFile: true,
                    monthTotal: MONTHLY_BUDGET.PHP })).includes('over_budget'));

check('예산 안이면 표시하지 않는다',
  !codes(runChecks({ reqType: 'expense', amount: 10, currency: 'PHP', hasFile: true, monthTotal: 0 }))
    .includes('over_budget'));

check('평소보다 3배 이상 크면 «참고»로 알린다',
  (() => { const f = runChecks({ reqType: 'expense', amount: 30000, currency: 'PHP', hasFile: true, medianAmount: 5000 });
           const u = f.find(x => x.code === 'unusual_amount');
           return !!u && u.level === 'info'; })());

check('점검 문구는 한국어·영어가 모두 있다 (화면이 두 언어를 쓴다)',
  runChecks({ reqType: 'expense', amount: 1, currency: 'PHP', hasFile: false })
    .every(f => f.ko && f.en && f.code && f.level));

// ══ D-2. 마감 ═════════════════════════════════════════════════════════════
console.log('\n[D-2] 마감 시한');

const t0 = 1_700_000_000_000;
check('긴급 마감이 가장 짧다',
  stageDeadlineMs('urgent', t0) < stageDeadlineMs('complaint', t0));

check('단계가 많으면 전체 마감이 더 뒤다',
  deadlineMs('expense', t0, 2) > deadlineMs('expense', t0, 1));

check('마감은 접수 시각보다 항상 뒤다',
  TYPES.every(t => deadlineMs(t.key, t0, 1) > t0));

// ══ E. 회귀 감시 ══════════════════════════════════════════════════════════
console.log('\n[E] 회귀 감시 — 옛 결재가 길을 잃지 않는가');

for (const legacy of ['expense', 'doc', 'leave']) {
  check(`옛 분류값 '${legacy}' 이 그대로 살아 있다 (2026-08-05 부터 쌓인 데이터)`,
    REQ_TYPES.includes(legacy));
}

check('요청하신 분류가 모두 있다 (물품구입·인사·고객불만·긴급)',
  ['purchase', 'hr', 'complaint', 'urgent'].every(k => REQ_TYPES.includes(k)));

check('분류마다 한국어·영어 이름이 있다',
  TYPES.every(t => t.ko && t.en));

check('자동 승인은 기본으로 꺼져 있다 (데이터가 쌓인 뒤 항목별로 켜는 것이 안전)',
  AUTO_APPROVE_ENABLED === false);

check('열람등급은 정의된 세 가지 중 하나만 쓴다',
  TYPES.every(t => ['exec', 'chain', 'broadcast'].includes(t.visibility)));

check('인사·급여만 경영진 전용이다',
  TYPES.filter(t => t.visibility === 'exec').map(t => t.key).join(',') === 'hr');

// ── 결과 ────────────────────────────────────────────────────────────────────
console.log('──────────────────────────────────────');
if (FAIL) {
  console.log(`  ❌ ${FAIL}건 실패 / ${PASS + FAIL}건`);
  for (const f of FAILS) console.log('     ' + f);
  console.log('  결재는 돈과 권한이 걸린 기능입니다. 위 항목을 고치세요.');
  process.exit(1);
} else {
  console.log(`  ✅ ${PASS}건 전부 통과 — 결재선·열람등급·자동점검이 규칙대로 동작합니다.`);
}
