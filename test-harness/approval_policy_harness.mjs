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
  TWO_STEP_THRESHOLD, MONTHLY_BUDGET, AUTO_APPROVE_ENABLED, EXEC_USERNAMES,
  sniffKind, normExt, contentTypeFor,
} = P;

// 한국 ↔ 필리핀 교환 경로를 지키는 코드가 실제로 파일에 있는지도 함께 본다.
import { readFileSync } from 'node:fs';
const API_SRC  = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const WORK_SRC = readFileSync(resolve(__dir, '../cloudflare-deploy/public/work.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

// ── 등장인물 ────────────────────────────────────────────────────────────────
const boss    = { ok: true, username: 'admin',     name: '대표',            role: 'hq',    isTeacher: false };
/* «경영진이 아닌 본사 담당» — 계정명을 못 박지 않는다.
   ⚠️ 2026-09-04 에 실제로 밟았다: 여기 'mgr_jjw' 를 적어 두었는데 그 사람이 경영진이 되자
      「본사 담당은 인사·급여를 볼 수 없다」·「경영진 단계는 경영진만」 두 검사가 FAIL 났다.
      보안이 샌 것이 아니라 **검사가 옛 명단을 들고 있던 것**이다.
   ✅ 그래서 EXEC_USERNAMES 에 «없는» 계정을 골라 쓴다. 경영진이 늘어도 뜻이 유지된다. */
const OFFICE_CANDIDATES = ['mgr_lby', 'mgr_jjw', 'mgr_staff'];
const OFFICE_UID = OFFICE_CANDIDATES.find(u => !EXEC_USERNAMES.includes(u));
const office  = { ok: true, username: OFFICE_UID, name: '본사 담당',        role: 'hq',    isTeacher: false };
const phMgr   = { ok: true, username: 'mgr_melca', name: 'Melca',           role: 'hq',    isTeacher: false };
const teacher = { ok: true, username: 'hq_t01',    name: 'Teacher Ann',     role: 'teacher', isTeacher: true };
const agency  = { ok: true, username: 'shop_01',   name: '망고아이 대리점',  role: 'agency', isTeacher: false };

console.log('════════ 결재 규칙 하니스 ════════');

// 아래 열람·결재 검사들은 «경영진이 아닌 본사 계정이 하나는 있다» 는 전제 위에 선다.
// 그 전제가 깨지면 검사가 조용히 뜻을 잃으므로 먼저 못 박는다.
check('검사 전제 — 경영진이 아닌 본사 계정을 하나 고를 수 있다',
  !!OFFICE_UID, '후보: ' + OFFICE_CANDIDATES.join(', ') + ' · 경영진: ' + EXEC_USERNAMES.join(', '));

// ══ A. 결재선 자동 결정 ═══════════════════════════════════════════════════
console.log('\n[A] 결재선이 금액·분류로 자동으로 정해지는가');

const smallPhp = TWO_STEP_THRESHOLD.PHP - 1;
const bigPhp   = TWO_STEP_THRESHOLD.PHP;

check('소액 물품구입은 1단계',
  stagesFor('purchase', smallPhp, 'PHP').length === 1,
  JSON.stringify(stagesFor('purchase', smallPhp, 'PHP')));

/* ⚠️ «역할 이름» 을 글자 그대로 못 박지 않는다 — 2026-09-09 에 돈이 나가는 건의 1단계가
      'staff'(본사 아무나) 에서 'mgr'(지정 결재권자) 로 좁혀졌을 때, 보장은 오히려 세졌는데
      이 검사만 빨간불이 났다. 물어야 할 것은 «두 단계인가 · 마지막이 경영진인가» 다. */
check('기준 금액부터는 2단계 (마지막은 경영진)',
  (() => { const s = stagesFor('purchase', bigPhp, 'PHP');
           return s.length === 2 && s[0].role !== 'exec' && s[1].role === 'exec'; })(),
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
  canView(office, 'hr', office.username, [], false) === true);   // 계정명을 두 번 적지 않는다

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

// ══ F. 첨부 — 이름표가 아니라 내용으로 본다 ═══════════════════════════════
console.log('\n[F] 첨부 형식을 «내용» 으로 판정하는가');

const bytesOf = (arr, pad = 16) => {
  const b = new Uint8Array(pad);
  arr.forEach((v, i) => { b[i] = v; });
  return b;
};
const JPG  = bytesOf([0xFF,0xD8,0xFF,0xE0]);
const PNG  = bytesOf([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
const PDF  = bytesOf([0x25,0x50,0x44,0x46,0x2D,0x31]);
const WEBP = bytesOf([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]);
const EXE  = bytesOf([0x4D,0x5A,0x90,0x00]);            // 윈도 실행 파일
const ELF  = bytesOf([0x7F,0x45,0x4C,0x46]);            // 리눅스 실행 파일
const HTML = bytesOf([0x3C,0x21,0x44,0x4F,0x43,0x54,0x59,0x50,0x45]);

check('JPEG 를 알아본다',  sniffKind(JPG) === 'jpg');
check('PNG 를 알아본다',   sniffKind(PNG) === 'png');
check('PDF 를 알아본다',   sniffKind(PDF) === 'pdf');
check('WEBP 를 알아본다',  sniffKind(WEBP) === 'webp');

check('이름을 receipt.jpg 로 바꾼 실행 파일은 통과하지 못한다 (윈도)', sniffKind(EXE) === null);
check('이름을 바꾼 실행 파일은 통과하지 못한다 (리눅스)',              sniffKind(ELF) === null);
check('HTML 을 사진인 척 올릴 수 없다',                                sniffKind(HTML) === null);
check('빈 파일·너무 짧은 파일은 통과하지 못한다',                      sniffKind(bytesOf([0xFF,0xD8], 4)) === null);

check('jpeg 와 jpg 를 같은 것으로 본다', normExt('JPEG') === 'jpg' && normExt('jpg') === 'jpg');
check('저장할 형식은 판정 결과를 따른다 (이름표가 아니라)',
  contentTypeFor('pdf') === 'application/pdf' && contentTypeFor('png') === 'image/png');

// ══ G. 한국 ↔ 필리핀 교환 — 끊겨도 잃지 않는가 ════════════════════════════
console.log('\n[G] 교환 경로 — 끊겨도 잃지 않고, 두 번 처리되지 않는가');

check('재전송이 기안을 두 건으로 만들지 않는다 — 같은 열쇠는 DB 가 막는다',
  /CREATE UNIQUE INDEX[\s\S]{0,120}client_key/.test(API_SRC),
  'approval_requests(requester_username, client_key) UNIQUE 인덱스가 없음');

check('올리기 전에 «이미 올라간 건» 인지 먼저 확인한다',
  /WHERE requester_username = \? AND client_key = \?/.test(API_SRC));

check('동시에 재전송해 UNIQUE 에 걸려도 실패로 처리하지 않는다',
  /UNIQUE\|constraint/i.test(API_SRC) && /duplicate: true/.test(API_SRC));

check('짧은 시간에 대량으로 올리는 것을 막는다',
  /too_many/.test(API_SRC) && /429/.test(API_SRC));

check('첨부는 실제 바이트로 확인한 뒤 저장한다',
  /sniffKind\(/.test(API_SRC) && /unreadable_file/.test(API_SRC));

check('내려받는 첨부에 형식 추측 금지(nosniff)를 붙인다',
  /X-Content-Type-Options/.test(API_SRC));

check('바뀐 게 없으면 본문을 안 보낸다 (304)',
  /If-None-Match/.test(API_SRC) && /\b304\b/.test(API_SRC));

check('결재함 응답에 시각을 섞지 않는다 — 섞으면 304 가 영영 안 나온다',
  !/overdue: !!\(/.test(API_SRC),
  'rowOf 가 «지금 지연인가» 를 담고 있으면 응답이 매초 달라진다');

check('단계는 한 번에 묶어 받는다 (행마다 따로 조회하지 않는다)',
  /stepsByRequest/.test(API_SRC) && /selectInChunks/.test(API_SRC));

check('IN 목록을 손으로 만들지 않는다 (D1 바인드 100 한도)',
  !/map\(\(\) => '\?'\)/.test(API_SRC));

check('화면 — 쓰다 만 기안을 기기에 저장한다',
  /DRAFT_KEY/.test(WORK_SRC) && /draftSave/.test(WORK_SRC));

check('화면 — 보내지 못한 기안을 사진까지 담아 둔다 (IndexedDB)',
  /indexedDB/.test(WORK_SRC) && /subQueueAdd/.test(WORK_SRC));

check('화면 — 연결되면 저장해 둔 기안을 자동으로 보낸다',
  /addEventListener\('online'/.test(WORK_SRC) && /subFlush/.test(WORK_SRC));

check('화면 — 재전송에 같은 열쇠를 쓴다',
  /client_key/.test(WORK_SRC) && /CKEY/.test(WORK_SRC));

check('화면 — 서버가 «판단해서» 거절한 것은 다시 보내지 않는다',
  /refused/.test(WORK_SRC),
  '4xx 를 계속 재시도하면 영영 안 되는 것을 영원히 반복한다');

check('화면 — 다시 그릴 때 쓰던 값을 지우지 않는다',
  /var keep = \{/.test(WORK_SRC),
  'paintForm 이 값을 챙기지 않으면 타이핑하던 내용이 날아간다');

check('화면 — 지연 판정을 화면이 한다 (서버 응답을 시각과 무관하게 유지)',
  /function isOverdue/.test(WORK_SRC));

check('화면 — 외부 파일을 부르지 않는다 (설계 계약 1번)',
  !/<script[^>]+src=/i.test(WORK_SRC) && !/<link[^>]+stylesheet/i.test(WORK_SRC),
  '외부 리소스를 하나라도 부르면 느린 회선에서 첫 화면이 그만큼 늦어진다');

/* 🪤 CLAUDE.md 의 «hidden 인데 그대로 보임» 함정의 반대쪽.
   hidden 으로 켜고 끄는 요소에 작성자 CSS 가 display 를 정해 두면, 그 CSS 가 [hidden] 을 이겨서
   hidden=false 로 바꿔도 **영영 안 보인다.** 2026-08-16 실제로 이것 때문에
   «보내지 못한 결재를 저장했습니다» 안내가 한 번도 뜨지 않았다(브라우저로 눌러 보고 발견). */
check('화면 — hidden 으로 켜고 끄는 띠에 display 를 박아 두지 않았다',
  !/^\.outbox\s*\{[^}]*display\s*:/m.test(WORK_SRC),
  '.outbox 에 display 가 있으면 [hidden] 을 이겨서 안내가 영영 안 뜬다');

check('화면 — [hidden] 을 !important 로 못박아 두었다',
  /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/.test(WORK_SRC),
  '작성자 CSS 가 UA 기본값을 이기는 것을 막는 안전선');

// ══ H. 알림이 «닿는가» — 푸시를 안 켠 사람에게도 ═══════════════════════════
console.log('\n[H] 알림이 실제로 닿는가 · 지연이 드러나는가');

check('푸시로 닿지 않은 사람을 골라낸다',
  /missed/.test(API_SRC),
  '푸시는 «켠 사람» 에게만 간다 — 처음에는 아무도 안 켜 놓은 상태다');

check('닿지 않으면 문자로 보낸다',
  /smsFallback/.test(API_SRC) && /sendPlainSms/.test(API_SRC));

check('필리핀 번호에 국가번호를 붙인다',
  /'63'/.test(API_SRC),
  "국가번호 없이 보내면 필리핀 현지 번호에 도착하지 않는다");

check('문자는 긴급·지연·승격에만 (돈이 든다)',
  /reqType === 'urgent' && n1\.missed/.test(API_SRC) &&
  !/smsFallback\(env, targets/.test(API_SRC),
  '모든 결재에 문자를 보내면 비용이 새어 나간다');

check('문자를 끄는 스위치가 있다',
  /approval_sms/.test(API_SRC),
  "KV 'approval_sms'='off' 로 즉시 끌 수 있어야 한다");

check('주간 결재 요약이 있다 (페널티 = 가시성)',
  /runApprovalWeeklyReport/.test(API_SRC));

check('주간 요약은 경영진에게만 간다',
  /approversFor\(env, 'exec', null\)[\s\S]{0,400}approval-weekly/.test(API_SRC),
  '사람별 지연 건수는 인사 정보에 가깝다');

check('주간 요약의 숫자는 코드가 계산한다 (AI 아님)',
  /AVG\(decided_at - created_at\)/.test(API_SRC));

// ══ I. 묶어서 승인 — 점검을 무력화하지 않는가 ═════════════════════════════
console.log('\n[I] 묶어서 승인이 자동 점검을 무력화하지 않는가');

check('화면 — 경고가 붙은 건은 묶음에서 뺀다',
  /function cleanOnes\(\)[\s\S]{0,400}level === 'warn'/.test(WORK_SRC),
  '경고까지 쓸어 승인하면 자동 점검이 있으나 마나가 된다');

check('화면 — 마감을 넘긴 건도 묶음에서 뺀다',
  /function cleanOnes\(\)[\s\S]{0,200}isOverdue\(r\)/.test(WORK_SRC));

check('화면 — 두 건 이상일 때만 묶음 버튼을 보여 준다',
  /list\.length < 2/.test(WORK_SRC));

check('화면 — 묶음 승인도 한 건씩 순서대로 보낸다',
  /step\(\);\s*\/\/ 하나씩/.test(WORK_SRC),
  '좁은 회선에서 한꺼번에 던지면 서로 대역폭을 다툰다');

check('화면 — 부재중(대결) 설정을 쓸 수 있다',
  /openAway|setAway/.test(WORK_SRC) && /api\/approval\/delegate/.test(WORK_SRC),
  '결재자가 휴가면 결재가 그대로 멈춘다');

check('동료 목록은 결재할 수 있는 사람에게만 내려보낸다',
  /colleagues[\s\S]{0,200}isHqStaff\(actor\) && !ph/.test(API_SRC),
  '아무에게나 내려보내면 그냥 직원 명부가 된다');

// ══ J. 기존 기능과 겹치지 않는가 — 중복 방지의 핵심 ═══════════════════════
console.log('\n[J] 기존 기능을 «가져오기» 만 하는가 (표를 두 벌 만들지 않는가)');

check('휴가는 강사도 올릴 수 있다 (쉬는 사람이 본인이다)',
  canSubmit(teacher, 'leave') === true);

check('휴가는 기간을 받는다',
  typeSpec('leave').wantsDates === true);

check('기간을 받는 분류는 휴가뿐이다',
  TYPES.filter(t => t.wantsDates).map(t => t.key).join(',') === 'leave');

check('휴가가 승인되면 기존 «강사 근무불가» 에 반영한다',
  /applyLeaveToCalendar/.test(API_SRC) && /teacher_unavailability/.test(API_SRC),
  '결재함에 휴가 표를 따로 만들면 캘린더와 반드시 어긋난다');

check('휴가 반영은 최종 승인일 때만 한다',
  /finalStatus === 'approved'[\s\S]{0,120}applyLeaveToCalendar/.test(API_SRC),
  '중간 단계 승인만으로 예약을 막으면 안 된다');

check('같은 휴가로 근무불가를 두 번 만들지 않는다',
  /linked_id/.test(API_SRC));

check('반영에 실패해도 결재는 살리되, 사실을 로그로 남긴다',
  /근무불가 등록 실패/.test(API_SRC),
  '조용히 사라지면 «승인은 됐는데 예약은 안 막힌» 상태를 아무도 모른다');

check('날짜가 거꾸로면 올릴 때 거절한다',
  /date_range_invalid/.test(API_SRC),
  '승인 시점에 실패하면 되돌리기 어렵다 — 입구에서 막는다');

check('수업 변경 요청은 건수만 비춘다 (표를 옮기지 않는다)',
  /schedule_pending/.test(API_SRC) &&
  !/INSERT INTO schedule_change_requests/.test(API_SRC),
  '같은 «요청 → 승인» 구조를 두 벌 만들면 반드시 어긋난다');

check('화면 — 수업 변경은 원래 화면으로 보낸다',
  /paintSchedule/.test(WORK_SRC) && /schedule_pending/.test(WORK_SRC));

// 관리자 화면(1MB)은 배지 한 줄만 — 결재 목록을 그리로 옮기면 /work 를 만든 이유가 사라진다.
/* 2026-09-09: 결재 배지 블록이 admin.html 인라인에서 /js/adm-appr-badge.js(defer)로 나갔다
   (첫 화면 예산 — first_paint_budget_harness). CSS 는 admin.html 에, JS 는 그 파일에 있으므로
   아래 검사들은 둘을 «합본» 으로 본다(한쪽만 보면 함수도 값도 «없다» 로 헛돈다 — CLAUDE.md 2장
   「그 파일을 읽던 다른 하니스가 조용히 헛돕니다」). */
const ADMIN_SRC = readFileSync(resolve(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8')
  + '\n' + readFileSync(resolve(__dir, '../cloudflare-deploy/public/js/adm-appr-badge.js'), 'utf8');
check('결재 배지 JS 는 defer 파일로 실린다 (첫 화면 예산 — 인라인 금지)',
  /<script src="\/js\/adm-appr-badge\.js\?v=\d+" defer><\/script>/.test(ADMIN_SRC) &&
  !/<script>\s*\(function\(\)\{\s*"use strict";\s*\/\* ⚠️ 대기가 0건이어도/.test(ADMIN_SRC),
  'admin.html blocking 여유가 2KB 뿐이라 인라인으로 되돌리면 first_paint_budget 이 빨간불이 된다');
const QUICK_SRC = readFileSync(resolve(__dir, '../cloudflare-deploy/public/js/adm-quick-access.js'), 'utf8');
const IA6_SRC = readFileSync(resolve(__dir, '../cloudflare-deploy/public/js/adm-ia6.js'), 'utf8');

check('관리자 화면에는 배지와 링크만 넣었다',
  /mi-appr-n/.test(ADMIN_SRC) &&
  !/api\/approval\/requests\/[^/]*\/decide/.test(ADMIN_SRC),
  '관리자 화면에 결재 목록·승인 버튼을 만들면 화면이 두 벌이 된다');

/* 🔁 2026-08-17 규칙 뒤집음 — 원래는 «0건이면 그리지 않는다» 였다.
   그런데 한국 본사(대표·담당)는 전부 admin.html 로 착지하는데, 대기 0건이면
   결재를 **올리러** 들어갈 입구가 화면에 하나도 없었다 — 주소를 외워야 했다.
   이 프로젝트가 없애려던 «찾아 들어가야 한다» 가 그대로 되살아나는 셈이라 뒤집었다.
   🧾 2026-08-20 부터 입구는 **화면이 아니라 메뉴가** 그린다 — 「자주 쓰는 기능」 표 첫 칸과
   사이드바 맨 위 「결재함」. 둘 다 대기 건수와 무관하게 언제나 그려지므로 «늘 보인다» 가
   그 자체로 성립한다. 이 블록이 하는 일은 그 위에 **숫자만** 얹는 것이다. */
check('관리자 화면의 입구는 대기 0건이어도 늘 보인다',
  !/if \(!n\) return;/.test(ADMIN_SRC) &&
  /href: '\/work'/.test(QUICK_SRC) &&
  /id = 'ia6-appr'/.test(IA6_SRC),
  '입구가 없으면 결재를 올리러 들어갈 방법이 없다');

check('대기가 없을 때는 숫자 없이 «결재함» 으로만 보인다 (알림이 아니라 메뉴)',
  /b\.textContent = n > 0 \? String\(n\) : '';/.test(ADMIN_SRC) &&
  /b\.style\.display = n > 0 \? 'flex' : 'none';/.test(ADMIN_SRC) &&
  /el\.textContent = apprN > 0 \? String\(apprN\) : '';/.test(ADMIN_SRC),
  '0건일 때 숫자를 붙이면 «0건» 이 알림처럼 보인다');

check('대기가 없을 때는 빨간 배지를 아예 감춘다',
  /\.ia6-appr-n:empty\{display:none\}/.test(ADMIN_SRC),
  '늘 떠 있는 «빨간 배지» 는 곧 배경이 된다');

/* 🪤 2026-08-17 사장님 화면에서 «어디에도 안 보인다» — 오른쪽 아래는 이미
   「AI 운영비서」 버튼과 상담원 아바타가 쓰고 있어서 떠 있는 배지가 그 뒤에 가려졌다.
   🧾 2026-08-20 그때 급히 만든 초록 줄을 없앴다 — 「자주 쓰는 기능」 표 «위» 에 혼자
   떠 있어 어색했고(사장님 지적), 사이드바 결재함까지 생겨 같은 입구가 셋이 됐다.
   지금은 그 표의 **첫 칸**으로 들어가 있다. 어느 쪽이든 «떠 있게 두지 않는다» 는 그대로다. */
check('입구는 흐름 안에 둔다 (떠 있게 두지 않는다)',
  !/position:fixed[^'"]*bottom:150px/.test(ADMIN_SRC) &&
  /#ph161-quick-items \.ph161-q\[data-qa="결재함"\]/.test(ADMIN_SRC),
  '오른쪽 아래는 AI 운영비서·아바타가 이미 쓰고 있어 가려진다');

check('결재함 칸은 사용 빈도 정렬에 밀리지 않는다 (pin)',
  /key: '결재함'[\s\S]{0,160}pin: true/.test(QUICK_SRC) &&
  /a\.it\.pin \? 1 : 0, bp = b\.it\.pin \? 1 : 0/.test(QUICK_SRC),
  '결재는 «누가 답을 기다리는» 일이라 덜 눌렀다는 이유로 뒤로 가면 안 된다');

check('표가 늦게 그려져도 숫자를 다시 붙인다',
  /if \(!paintQuick\([^)]*\)\) \{[\s\S]{0,240}setInterval/.test(ADMIN_SRC),
  '「자주 쓰는 기능」 표는 외부 js 가 그린다 — 한 번 실패하고 넘어가면 숫자가 영영 안 뜬다');

/* 🔁 2026-09-09 규칙 바꿈(사장님 A+B 선택) — 원래는 «반복 폴링하지 않는다» 였다.
   그런데 화면을 연 뒤 «한 번만» 조회하니 열어 둔 사이 도착한 결재가 새로고침 전까지 안 떴다
   (사장님 「결재가 뜨면 표시가 나게」). 지금 계약: 첫 조회는 여전히 3초 뒤(첫 화면과 경쟁 금지) ·
   그 뒤 60초 이상 간격 · 숨은 탭에서는 건너뜀. 실제 동작은 approval_sidebar_badge_live_harness 가
   가짜 DOM 으로 돌려 확인한다 — 여기서는 «주기가 좁아지지 않았는가» 만 못 박는다. */
check('관리자 화면의 배지는 첫 화면과 경쟁하지 않는다 (첫 조회 3초 뒤)',
  /setTimeout\(load, 3000\)/.test(ADMIN_SRC),
  '첫 화면에서 결재 조회가 먼저 나가면 필리핀 회선에서 그대로 지연이 된다');
check('주기 조회는 60초 이상 · 숨은 탭에서는 건너뛴다',
  Number((ADMIN_SRC.match(/var POLL_MS\s*=\s*(\d+)/) || [])[1]) >= 60000 &&
  /setInterval\(load, POLL_MS\)/.test(ADMIN_SRC) &&
  /if \(document\.hidden \|\| loading\) return;/.test(ADMIN_SRC),
  '좁은 회선에서 잦은 폴링은 정작 필요한 요청과 대역폭을 다툰다');

// ══ K. 인사·급여 «월 확정» — 숫자를 손으로 적지 않는가 ════════════════════
console.log('\n[K] 인사·급여 월 확정 — 급여를 다시 계산하지 않는가');

const HR_SRC = readFileSync(join(SRC, 'approval-hr.ts'), 'utf8');

check('급여를 다시 계산하지 않고 기존 함수를 그대로 부른다',
  /import \{ getPayrollAuto \} from '\.\/api-payroll-auto'/.test(HR_SRC),
  '결재함이 급여를 따로 계산하면 관리자 화면의 숫자와 어긋나는 날이 온다');

check('급여 표에 쓰지 않는다 (읽기 전용)',
  !/INSERT INTO teacher_payroll_auto|UPDATE teacher_payroll_auto|INSERT INTO payslips|UPDATE payslips/.test(HR_SRC),
  'payslips.finalized_at 은 api-admin 의 마감 흐름이 쓰는 칸이다 — 건드리면 이중이 된다');

check('승인 사실은 결재함 자기 표에만 적는다',
  /approval_period_locks/.test(HR_SRC));

check('승인 시점의 숫자를 얼려 둔다 (감사 기록)',
  /snapshot/.test(HR_SRC),
  '나중에 원본이 바뀌어도 «그때 무엇을 승인했는지» 가 남아야 한다');

check('같은 달을 두 번 확정하지 않는다',
  /ON CONFLICT\(kind, period\) DO NOTHING/.test(HR_SRC) && /period_locked/.test(API_SRC));

check('달 형식을 입구에서 검사한다 (YYYY-MM)',
  /\^\\d\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$/.test(HR_SRC),
  '형식이 어긋나면 달 잠금이 헛돈다');

check('자료가 없는 달은 아예 고를 수 없다',
  /HAVING SUM\(completed_classes\) > 0/.test(HR_SRC),
  '운영 DB 에 수업 0회짜리 미래 달(2027·2028·2030) 행이 실제로 있다');

check('필리핀 매니저에게는 인사·급여가 보이지 않는다',
  typeSpec('hr').koreaOnly === true &&
  canSubmit(phMgr, 'hr', true) === false &&
  canSubmit(office, 'hr', false) === true);

check('koreaOnly 는 인사·급여에만 붙어 있다',
  TYPES.filter(t => t.koreaOnly).map(t => t.key).join(',') === 'hr');

check('서버도 막는다 (화면에서 안 보여도 주소로 부르면 뚫리므로)',
  /canSubmit\(actor, reqType, ph\)/.test(API_SRC));

check('제목·본문을 서버가 만든다 (올리는 사람이 숫자를 적지 않는다)',
  /hrSnap \? String\(hrSnap\.title_ko\)/.test(API_SRC) &&
  /hrSnap \? String\(hrSnap\.body_ko\)/.test(API_SRC));

check('인사·급여에는 AI 요약을 부르지 않는다',
  /const sum = hrSnap \? null :/.test(API_SRC),
  'AI 가 금액을 바꿔 쓸 여지를 아예 남기지 않는다');

check('최종 승인일 때만 달을 잠근다',
  /finalStatus === 'approved' && cur\.req_type === 'hr'/.test(API_SRC));

check('잠금 실패해도 결재는 살리되 사실을 남긴다',
  /달 확정 기록 실패/.test(API_SRC));

check('달 잠금 표를 두 번 만들지 않는다 (주인 모듈 함수를 부른다)',
  /await ensureHrTable\(env\);/.test(API_SRC) &&
  !/CREATE TABLE IF NOT EXISTS approval_period_locks/.test(API_SRC),
  '같은 표를 두 곳에서 만들면 먼저 실행된 것이 이겨 컬럼이 어긋난다');

check('달을 확정하면 결재함 목록도 새로 받는다 (304 로 옛 목록이 남지 않게)',
  /approval_period_locks[\s\S]{0,200}etag|lsig/.test(API_SRC));

check('화면 — 인사·급여는 폼 대신 달 버튼을 그린다',
  /picks_period/.test(WORK_SRC) && /paintHrForm/.test(WORK_SRC));

check('화면 — 이미 확정된 달은 눌리지 않게 한다',
  /m\.approved[\s\S]{0,200}disabled/.test(WORK_SRC));

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
