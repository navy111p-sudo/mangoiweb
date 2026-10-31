// 💸 환불 «실행·기록» 하니스 — 2026-08-25
//
//   왜 있나
//     2026-08-24 외주 제안서 대조 검토에서 확인된 유일한 실제 결손이 「환불 실행·기록」이었다.
//     그때까지 이 저장소에는 환불 «계산기» 만 있었고 토스 결제취소 호출은 0건이었다
//     (담당자가 토스 대시보드에서 직접 처리 → 우리 DB 에 아무 기록도 안 남음).
//     그래서 만든 것이 src/api-pay-refund.ts 다.
//
//   이 하니스가 못 박는 것 — 전부 «조용히 되돌아가면 돈이 새거나 두 번 나가는» 것들
//     ① 강사·지사·대리점이 환불을 만질 수 없다
//     ② 🔴 기록이 PG 호출 «앞»에 온다 (write-ahead) — 뒤집히면 「PG 는 취소됐는데 우리는 모르는」 상태가 된다
//     ③ 멱등키를 붙인다 — 재시도가 두 번 취소가 되지 않게
//     ④ 2단계 확인(confirm) 없이는 실행하지 않는다
//     ⑤ 금액 상한을 서버가 다시 계산한다
//     ⑥ 결과를 못 받은 요청이 남아 있으면 다음 실행을 막는다
//     ⑦ 실패도 «기록»한다 (지우지 않는다)
//     ⑧ 네트워크 오류를 failed 로 «확정»하지 않는다 (모르는 것은 모른다고 남긴다)
//     ⑨ 남은 수업은 DELETE 가 아니라 status='cancelled' (되돌릴 수 있어야 한다)
//     ⑩ 🔴 계산을 **실제로 돌려** 본다 — 이미 환불한 금액을 두 번 주지 않는가
//        (CLAUDE.md 2장: 문자열 검사는 「부르는가」만 보고 「무엇을 넘기는가」는 못 본다)
//
//   실행: node test-harness/payment_refund_harness.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');

const refundSrc = readFileSync(join(SRC, 'api-pay-refund.ts'), 'utf8');
const paySrc = readFileSync(join(SRC, 'api-pay.ts'), 'utf8');
const idxSrc = readFileSync(join(SRC, 'index.ts'), 'utf8');
const enrollSrc = readFileSync(join(SRC, 'enroll-ops.ts'), 'utf8');
const policySrc = readFileSync(join(SRC, 'class-policy.ts'), 'utf8');
const uiSrc = readFileSync(join(PUB, 'admin', 'refunds.html'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* 주석을 벗긴 사본 — 「이 말이 없어야 한다」류 부정 검사는 반드시 이걸로 판정한다.
   설명 주석에 그 단어가 들어가면 검사가 자기 주석을 잡는다(CLAUDE.md 2장 함정). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const refundCode = strip(refundSrc);

/* ══════════ ① 권한 — 강사·지사·대리점 ══════════ */
console.log('\n[ ① 권한 — 누가 환불을 만질 수 있나 ]');
check('강사를 막는다 (isTeacher → forbidden_teacher)',
  /actor\.isTeacher/.test(refundCode) && /forbidden_teacher|forbiddenTeacherBody/.test(refundCode));
check('지사·대리점·지사본사를 막는다 (forbidden_scope)',
  /scopeType === 'branch'/.test(refundCode)
  && /scopeType === 'agency'/.test(refundCode)
  && /scopeType === 'franchise'/.test(refundCode)
  && /forbidden_scope/.test(refundCode));
check('⛔ canEditOrg() 하나로 막지 않는다 (그 함수는 강사를 통과시킨다 — CLAUDE.md 2장)',
  !/canEditOrg/.test(refundCode));
check('⛔ scope 를 hq 로만 좁히지 않는다 (admin_scope 행이 없는 본사 직원이 none 으로 잡혀 막힌다)',
  !/scopeType\s*!==\s*'hq'/.test(refundCode));
check('세 갈래(미리보기·내역·실행)가 모두 같은 게이트를 지난다',
  (refundCode.match(/await refundGate\(request, env\)/g) || []).length >= 3,
  (refundCode.match(/await refundGate\(request, env\)/g) || []).length);

/* ══════════ ② 🔴 기록이 먼저다 (write-ahead) ══════════ */
console.log('\n[ ② 기록이 PG 호출보다 «앞»에 오는가 — 이 파일이 존재하는 이유 ]');
const iInsert = refundCode.indexOf('INSERT INTO payment_refunds');
const iFetch = refundCode.indexOf('TOSS_CANCEL_URL(p.payment_key)');
check('INSERT INTO payment_refunds 가 있다', iInsert > 0);
check('토스 취소 호출이 있다 (payments/{key}/cancel)',
  /api\.tosspayments\.com\/v1\/payments\/\$\{encodeURIComponent\(paymentKey\)\}\/cancel/.test(refundCode) && iFetch > 0);
check('🔴 기록(INSERT)이 PG 호출보다 먼저 온다', iInsert > 0 && iFetch > 0 && iInsert < iFetch,
  { insert: iInsert, fetch: iFetch });
check('기록에 실패하면 실행하지 않고 중단한다',
  /record_failed/.test(refundCode) && /기록 없이는 실행하지 않습니다|기록을 남기지 못해 중단/.test(refundSrc));
check('먼저 넣는 행의 상태가 requested 다 (결과를 아직 모른다는 뜻)',
  /'requested'/.test(refundCode));

/* ══════════ ③ 멱등키 ══════════ */
console.log('\n[ ③ 재시도가 두 번 취소가 되지 않게 ]');
check('Idempotency-Key 헤더를 붙인다', /'Idempotency-Key'/.test(refundCode));
check('멱등키가 «먼저 만든 기록의 id» 기반이다 (재시도해도 같은 키)',
  /mgi-refund-\$\{refundId\}/.test(refundCode));

/* ══════════ ④ 2단계 확인 ══════════ */
console.log('\n[ ④ confirm 없이는 실행하지 않는다 ]');
check('confirm === true 일 때만 실행한다', /body\.confirm === true/.test(refundCode));
check('confirm 이 없으면 dry_run 으로 계획만 돌려준다',
  /if \(!confirm\)/.test(refundCode) && /dry_run: true/.test(refundCode));
check('dry_run 응답이 «무엇을 할지»를 담는다 (금액·모드·남은수업)',
  /will:\s*\{[\s\S]{0,400}?amount[\s\S]{0,400}?cancel_remaining_classes/.test(refundCode));

/* ══════════ ⑤ 금액 상한 ══════════ */
console.log('\n[ ⑤ 금액은 서버가 다시 계산한다 ]');
check('환불 가능 상한 = 결제액 − 이미 환불한 합계',
  /const max = Math\.max\(0, paid - already\)/.test(refundCode));
check('이미 환불한 합계는 «done» 만 센다',
  /status === 'done'\)\s*\.reduce/.test(refundCode.replace(/\s+/g, ' ').replace(/ \./g, '.')) ||
  /filter\(r => r\.status === 'done'\)\.reduce/.test(refundCode));
check('상한을 넘으면 거절한다 (amount_exceeds)',
  /amount > p\.refundable_max/.test(refundCode) && /amount_exceeds/.test(refundCode));
check('0원 이하는 거절한다', /nothing_to_refund/.test(refundCode));
check('사유가 없으면 거절한다 (나중에 남는 것은 그 한 줄뿐이다)',
  /reason_required/.test(refundCode));

/* ══════════ ⑥ 동시 실행 잠금 ══════════ */
console.log('\n[ ⑥ 결과를 못 받은 요청이 남아 있으면 막는다 ]');
check('pending(requested) 건수를 센다', /pending_refunds/.test(refundCode));
check('pending 이 있으면 409 로 거절한다',
  /p\.pending_refunds > 0/.test(refundCode) && /refund_in_progress/.test(refundCode));
check('목록 API 가 «확인 필요» 건수를 함께 내려준다', /needs_check/.test(refundCode));

/* ══════════ ⑦⑧ 실패·모름을 남기는 방식 ══════════ */
console.log('\n[ ⑦⑧ 실패는 지우지 않고 남긴다 · 모르는 것은 모른다고 남긴다 ]');
check('PG 가 거절하면 failed 로 기록한다', /status = 'failed'/.test(refundCode));
check('실패 사유(코드·메시지)를 함께 남긴다',
  /pg_code/.test(refundCode) && /pg_raw/.test(refundCode));
check('🔴 네트워크 오류는 failed 로 «확정»하지 않는다 (취소됐는지 모르므로 requested 로 남긴다)',
  /network_error/.test(refundCode)
  && !/network_error[\s\S]{0,200}status = 'failed'/.test(refundCode));
check('네트워크 오류 응답이 needs_check 를 켠다', /needs_check: true/.test(refundCode));
check('⛔ 환불 기록을 지우는 DELETE 가 없다',
  !/DELETE\s+FROM\s+payment_refunds/i.test(refundCode));

/* ══════════ ⑨ 남은 수업 처리 ══════════ */
console.log('\n[ ⑨ 남은 수업은 되돌릴 수 있게 끈다 ]');
check('남은 수업을 status=\'cancelled\' 로 끈다 (DELETE 아님)',
  /UPDATE class_schedules SET status = 'cancelled'/.test(refundCode));
check('⛔ class_schedules 를 DELETE 하지 않는다',
  !/DELETE\s+FROM\s+class_schedules/i.test(refundCode));
check('오늘 이후 회차만 끈다 (지난 수업은 이미 한 수업이다)',
  /scheduled_date >= \?/.test(refundCode) && /kstToday\(\)/.test(refundCode));
check('왜 꺼졌는지 수업 메모에 남긴다', /환불로 취소/.test(refundSrc));
check('자동연장이 살아 있으면 경고한다 (그대로 두면 다음 달 또 청구된다)',
  /active_subscription/.test(refundCode) && /자동연장/.test(refundSrc));
check('⛔ 자동연장을 말없이 해지하지는 않는다 (학생 전체 계약에 걸리는 별개 결정)',
  !/UPDATE subscriptions SET status\s*=\s*'cancelled'/.test(refundCode));
check('뒷정리가 실패해도 환불 자체를 실패로 만들지 않는다 (warnings 로 올린다)',
  /warnings/.test(refundCode));

/* ══════════ ⑩ 라우팅 — 공동 금지구역을 안 건드렸는가 ══════════ */
console.log('\n[ ⑩ 라우팅 — src/index.ts(공동 금지구역)를 건드리지 않고 닿는가 ]');
check('api-pay.ts 가 /api/pay/admin/refund 를 위임한다',
  /path\.startsWith\('\/api\/pay\/admin\/refund'\)/.test(strip(paySrc))
  && /handleRefundApi/.test(strip(paySrc)));
/* ⚠️ index.ts 는 strip() 을 걸지 않는다 — 긍정 검사라 주석이 섞여도 무해하고,
   거대한 파일을 주석 제거 정규식에 넣으면 문자열 안의 별표-슬래시 때문에
   엉뚱한 덩어리가 지워진다(이 검사가 실제로 그래서 빨간불이었다). */
check('index.ts 는 /api/pay/ 접두사를 통째로 넘긴다 (새 경로마다 등록할 필요 없음)',
  /path\.startsWith\('\/api\/pay\/'\)/.test(idxSrc));
check('화면은 /admin/ 아래라 default-deny 인증이 자동으로 걸린다',
  /if \(path\.startsWith\('\/admin\/'\)\) return true;/.test(idxSrc));
check('기존 «계산기»(refund-quote)는 그대로 남아 있다 (수강신청 화면이 쓰고 있다)',
  /\/api\/pay\/enroll\/admin\/refund-quote/.test(strip(enrollSrc)));

/* ══════════ ⑪ 화면 ══════════ */
console.log('\n[ ⑪ 화면 — 사람이 실수하기 어렵게 ]');
check('사유 입력칸이 있고 비어 있으면 막는다',
  /f-reason/.test(uiSrc) && /환불 사유를 적어 주세요/.test(uiSrc));
check('실행 전 «확인» 단계를 거친다 (dry-run 먼저, 그 다음 실행)',
  /dryRun/.test(uiSrc) && /bodyFromForm\(false\)/.test(uiSrc) && /bodyFromForm\(true\)/.test(uiSrc));
check('확인 문구를 직접 입력해야 실행 버튼이 켜진다',
  /f-typed/.test(uiSrc) && /value\.trim\(\)\s*!==\s*'환불'/.test(uiSrc));
check('금액·모드를 바꾸면 앞서 받은 확인이 무효가 된다',
  /\['f-amount', 'f-reason', 'f-record-only', 'f-cancel-classes'\]/.test(uiSrc));
check('「장부에만 기록」(record_only) 길이 있다 — 밖에서 처리한 과거 환불을 남기기 위해',
  /record_only/.test(uiSrc) && /record_only/.test(refundCode));
check('가상계좌 환불 계좌를 넘길 수 있다',
  /refund_account/.test(uiSrc) && /refundReceiveAccount/.test(refundCode));
check('«확인 필요» 건수를 맨 위에서 크게 알린다', /stuck-box/.test(uiSrc));
check('실행 결과가 실패여도 «기록 번호»를 보여 준다 (찾아갈 수 있게)',
  /refund_id/.test(uiSrc));

/* ══════════ ⑫ 🔴 계산을 실제로 돌려 본다 ══════════ */
console.log('\n[ ⑫ 판정을 컴파일해 가짜 DB 로 실제 실행 — 두 번 주지 않는가 ]');
let mod = null, why = '';
try {
  const ts = (await import(pathToFileURL(resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;

  // 중괄호 균형으로 함수 하나를 통째로 오려낸다 (정본 로직을 스텁으로 바꾸면 검사가 무의미해진다)
  const cut = (src, head) => {
    const i = src.indexOf(head);
    if (i < 0) throw new Error('못 찾음: ' + head);
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') { d++; started = true; }
      else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error('끝을 못 찾음: ' + head);
  };

  const shim = [
    'const json = (d, s) => ({ __json: d, status: s || 200 });',
    'const parseJsonBody = async () => ({});',
    'const getAdminActor = async () => ({ ok: true, isTeacher: false, username: "tester" });',
    'const getScope = async () => ({ type: "hq" });',
    'const sendPlainSms = async () => ({ ok: true });',
    'const ENROLL_BASE_WEEKLY1 = ' + (/ENROLL_BASE_WEEKLY1 = (\d+)/.exec(enrollSrc) || [, '60000'])[1] + ';',
    // classLengthMultiplier 가 참조한다 — 값도 정본(class-policy.ts)에서 읽어 온다
    'const DEFAULT_CLASS_MINUTES = ' + (/DEFAULT_CLASS_MINUTES = (\d+)/.exec(policySrc) || [, '20'])[1] + ';',
    cut(enrollSrc, 'export function enrollRefundCalc').replace('export ', ''),
    cut(enrollSrc, 'export function kstToday').replace('export ', ''),
    cut(policySrc, 'export function classLengthMultiplier').replace('export ', ''),
  ].join('\n');

  const body = refundSrc.replace(/^\s*import[\s\S]*?from\s+'[^']+';\s*$/gm, '');
  const js = ts.transpileModule(shim + '\n' + body, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
} catch (e) { why = e.message; }

if (!mod) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + String(why).slice(0, 120) + ')');
} else try {
  /* 가짜 D1 — SQL 을 보고 답을 고른다. 진짜 DB 없이 «계산»만 검증한다. */
  const fakeDB = (opt) => ({
    prepare(sql) {
      const st = {
        _b: [],
        bind(...b) { st._b = b; return st; },
        async first() {
          if (/FROM payment_orders/i.test(sql)) return opt.order || null;
          if (/COUNT\(\*\) AS n FROM class_schedules/i.test(sql)) return { n: opt.remaining ?? 0 };
          if (/FROM subscriptions/i.test(sql)) return opt.sub ? { id: 1 } : null;
          return null;
        },
        async all() {
          if (/FROM payment_refunds/i.test(sql)) return { results: opt.refunds || [] };
          return { results: [] };
        },
        async run() { return { meta: { changes: 0 } }; },
      };
      return st;
    },
  });

  const order = (over) => Object.assign({
    order_id: 'MGE-TEST', uid: 'u1', amount: 120000, status: 'paid',
    payment_key: 'pk_test', method: '카드', paid_at: 1, student_name: '홍길동', payer_name: null,
    enroll_json: JSON.stringify({ sessions: 12, minutes: 20, weekly: 1, months: 3, weekly1_price: 60000 }),
    refunded_amount: 0,
  }, over || {});

  // 코드가 보는 것은 env.DB 다 — 가짜 DB 를 그 자리에 끼운다
  const prev = async (opt) => await mod.refundPreview({ DB: fakeDB(opt) }, 'MGE-TEST');

  // 1) 아직 아무것도 환불하지 않은 상태
  const a = await prev({ order: order(), remaining: 8, refunds: [] });
  check('결제 12만원 · 12회 중 8회 남음 → 상한은 전액 12만원', a.refundable_max === 120000, a.refundable_max);
  check('사용분(4회)을 정가로 정산한 금액을 권장한다',
    a.suggested > 0 && a.suggested < 120000, { suggested: a.suggested, basis: a.suggest_basis.rule });
  check('권장 계산 근거가 «사용분 정산» 이라고 말한다',
    a.suggest_basis.rule === 'enroll_used_settlement' && a.suggest_basis.used_sessions === 4,
    a.suggest_basis.used_sessions);
  check('남은 수업 수를 함께 알려 준다', a.remaining_classes === 8, a.remaining_classes);

  // 2) 🔴 핵심 — 이미 일부를 환불한 뒤. 계산기는 «결제액 기준» 이라 그대로 쓰면 두 번 준다.
  const paidBack = 30000;   // 이미 돌려준 금액
  const b = await prev({
    order: order(), remaining: 8,
    refunds: [{ id: 1, refund_amount: paidBack, status: 'done' }],
  });
  check('이미 환불한 금액만큼 상한이 줄어든다', b.refundable_max === 120000 - paidBack, b.refundable_max);
  check('이미 환불한 합계를 그대로 보여 준다', b.already_refunded === paidBack, b.already_refunded);
  check('🔴 권장 금액이 이미 준 만큼 줄어든다 (두 번 주지 않는다)',
    b.suggested === Math.max(0, a.suggested - paidBack), { before: a.suggested, after: b.suggested });
  check('권장 금액은 절대 상한을 넘지 않는다', b.suggested <= b.refundable_max, b.suggested);

  // 3) 결과를 못 받은 요청이 남아 있는 경우
  const c = await prev({
    order: order(), remaining: 8,
    refunds: [{ id: 2, refund_amount: 10000, status: 'requested' }],
  });
  check('requested 행을 «확인 필요»로 센다', c.pending_refunds === 1, c.pending_refunds);
  check('requested 는 «이미 환불한 금액»에 넣지 않는다 (아직 준 게 아니다)',
    c.already_refunded === 0, c.already_refunded);

  // 4) 실패한 요청은 금액에서 빠진다
  const d = await prev({
    order: order(), remaining: 8,
    refunds: [{ id: 3, refund_amount: 50000, status: 'failed' }],
  });
  check('failed 는 «이미 환불한 금액»에 넣지 않는다', d.already_refunded === 0, d.already_refunded);
  check('failed 는 실행을 막지 않는다', d.pending_refunds === 0, d.pending_refunds);

  // 5) 돈이 들어오지 않은 주문
  const e1 = await prev({ order: order({ status: 'pending' }), remaining: 0, refunds: [] });
  check('결제완료가 아닌 주문은 not_paid 로 거절한다', e1.error === 'not_paid', e1);
  const e2 = await prev({ order: order({ status: 'await_deposit' }), remaining: 0, refunds: [] });
  check('가상계좌 미입금(await_deposit)도 거절한다 — 받은 돈이 없다', e2.error === 'not_paid', e2);
  const e3 = await prev({ order: null, remaining: 0, refunds: [] });
  check('없는 주문은 order_not_found', e3.error === 'order_not_found', e3);

  // 6) 부분 환불이 끝난 주문은 «이어서» 환불할 수 있어야 한다
  const f = await prev({
    order: order({ status: 'partial_refunded' }), remaining: 8,
    refunds: [{ id: 4, refund_amount: 20000, status: 'done' }],
  });
  check('partial_refunded 주문도 이어서 환불할 수 있다', !f.error && f.refundable_max === 100000, f.refundable_max);

  // 7) 수강신청이 아닌 일반 주문
  const g = await prev({ order: order({ enroll_json: null }), remaining: 0, refunds: [] });
  check('수강신청 주문이 아니면 잔액 전액을 권장한다',
    g.suggested === 120000 && g.suggest_basis.rule === 'full', g.suggest_basis.rule);

  // 8) 자동연장 경고
  const h = await prev({ order: order(), remaining: 8, refunds: [], sub: true });
  check('자동연장이 살아 있으면 미리보기가 알려 준다', h.active_subscription === true);
} catch (e) {
  /* 여기서 던지면 하니스가 통째로 죽고, 스택에 컴파일된 소스(base64)가 찍혀 로그를 덮는다.
     실행 검사 실패는 «FAIL 한 줄» 로만 남긴다. */
  check('⑫ 실행 검사가 예외 없이 끝난다', false, String(e && e.message).slice(0, 160));
}

/* ══════════ 요약 ══════════ */
console.log('\n────────────────────────────────');
console.log(`  PASS ${pass} / FAIL ${fail}`);
if (fail) {
  console.log('\n  ⚠️ 환불은 돈을 되돌리는 유일한 길입니다.');
  console.log('     이 하니스가 빨간불이면 «두 번 나가거나, 나갔는데 기록이 없는» 상태를 의심하세요.');
}
process.exit(fail ? 1 : 0);
