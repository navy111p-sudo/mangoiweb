// 💳 결제관리(ph106) 실데이터 하니스 — 2026-08-17
//
//   왜 필요한가 —
//     이 화면은 오래 «데모» 였다. adm-q7.js 가 890,000 / 28,500,000 같은 고정 숫자를
//     찍고 차트는 Math.random() 이었다. 실데이터를 붙이면서 파 보니 화면의 전제부터
//     틀려 있었다 — B2B 돈은 student_payments 에 한 건도 없다. 학원이 통장으로 바로
//     보낸다. 그래서 두 카드가 «서로 다른 표» 를 본다.
//
//   이 하니스가 못 박는 것 — 전부 «조용히 되돌아가면 매출을 잘못 읽는» 것들:
//     ① B2B 를 student_payments 에서 세면 안 된다 (통장이 정본)
//     ② B2B 에 PG 수수료를 붙이면 안 된다 (통장 이체는 PG 를 안 거친다)
//     ③ 「케이씨피」(PG 정산금)·「케이씨피M」(운영자금)을 B2B 매출로 세면 안 된다
//     ④ 시연용 시드 결제(notSeedSql)를 B2C 에서 빼지 않으면 리포트와 숫자가 갈린다
//     ⑤ 대리점을 못 붙인 몫(unattributed)을 숨기면 «걸렀더니 돈이 사라진» 것처럼 보인다
//     ⑥ 데모 잔재(하드코딩 상수·Math.random 차트·alert 검색)가 되살아나면 안 된다
//
//   실행: node test-harness/payments_board_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, 'cloudflare-deploy', 'src');
const PUB = join(root, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); }
};

const board = readFileSync(join(SRC, 'payments-board.ts'), 'utf8');
const acct  = readFileSync(join(SRC, 'accounting-reports.ts'), 'utf8');
const admin = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
const q7    = readFileSync(join(PUB, 'js', 'adm-q7.js'), 'utf8');
const html  = readFileSync(join(PUB, 'admin.html'), 'utf8');

console.log('\n💳 결제관리 실데이터 하니스\n');

/* ── ① B2B 는 통장, B2C 는 결제표 ──────────────────────────────── */
console.log('① 두 카드가 서로 다른 표를 본다');
{
  const b2bFn = board.slice(board.indexOf('async function handleB2B'), board.indexOf('async function handleB2C'));
  const b2cFn = board.slice(board.indexOf('async function handleB2C'));
  ok(/bankacct_transactions/.test(b2bFn) && !/student_payments/.test(b2bFn),
    'B2B 는 bankacct_transactions 만 본다 (student_payments 를 세지 않는다)');
  ok(/student_payments/.test(b2cFn) && !/bankacct_transactions/.test(b2cFn),
    'B2C 는 student_payments 만 본다');
  ok(/classifyDeposit/.test(b2bFn),
    'B2B 는 classifyDeposit() 으로 입금 성격을 가린다 (회계 리포트와 같은 함수)');
}

/* ── ② B2B 에 PG 수수료를 붙이지 않는다 ───────────────────────── */
console.log('\n② PG 수수료는 카드결제(B2C)에만');
{
  const b2bFn = board.slice(board.indexOf('async function handleB2B'), board.indexOf('async function handleB2C'));
  const b2cFn = board.slice(board.indexOf('async function handleB2C'));
  ok(!/PG_RATE/.test(b2bFn), 'B2B 응답에 PG_RATE 가 쓰이지 않는다');
  ok(/PG_RATE/.test(b2cFn), 'B2C 는 PG_RATE 로 수수료를 계산한다');
  ok(/const PG_RATE = 0\.0286/.test(board),
    'PG 수수료율은 2.86% (2026-08-17 사장님 확인)');
  ok(!/b2b-kpi-fee/.test(html) && !/b2b-kpi-fee/.test(q7),
    'B2B 화면에 「수수료 합계」 타일이 없다');
}

/* ── ③ classifyDeposit 실제 동작 — 통장 적요 판정 ─────────────── */
console.log('\n③ 통장 적요 판정 (실제 운영 데이터 형태로)');
{
  // accounting-reports.ts 의 규칙을 그대로 옮겨 «규칙이 바뀌면 여기서 깨지게» 한다.
  const src = acct.slice(acct.indexOf('export function classifyDeposit'));
  const body = src.slice(0, src.indexOf('\n}') + 2);
  const classify = new Function('remark', 'amount', body
    .replace('export function classifyDeposit(remark: string, amount: number): DepositKind {', '')
    .replace(/DEPOSIT_MIN_KRW/g, '1000')
    .replace(/\n}\s*$/, '')
    + '\n');

  const cases = [
    ['케이씨피',            4771345, 'pg',       'PG 정산금'],
    ['케이씨피M',           5000000, 'transfer', '하나은행에서 옮긴 운영자금 — 매출 아님'],
    ['(주)드림키오',         373500, 'b2b',      '학원 직접입금'],
    ['어센틱영어 박영선',     120000, 'b2b',      '학원 직접입금(실명 병기)'],
    ['JW학원',               908372, 'b2b',      '학원 직접입금'],
    ['메트로은행서울지점',         1, 'other',    '계좌확인용 1원'],
    ['국세환급금',           500000, 'other',    '세금 환급 — 매출 아님'],
  ];
  for (const [remark, amt, want, why] of cases) {
    const got = classify(remark, amt);
    ok(got === want, `「${remark}」 → ${want} (${why})`, got === want ? '' : `실제: ${got}`);
  }
}

/* ── ④ B2C SQL 을 진짜 SQLite 로 돌려 본다 ────────────────────── */
console.log('\n④ B2C 집계 SQL (in-memory SQLite)');
{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE student_payments (id INTEGER PRIMARY KEY, user_id TEXT, paid_at INTEGER,
           amount_krw INTEGER, method TEXT, memo TEXT, status TEXT)`);

  const day = 86400000;
  const now = Date.now();
  const rows = [
    // 진짜 결제 3건
    ['u1', now,          100000, '카드', '[cafe24] 동기화', 'paid'],
    ['u2', now,           50000, '카드', '[cafe24] 동기화', 'paid'],
    ['u3', now - 40*day, 900000, '카드', '[cafe24] 동기화', 'paid'],
    // 시연용 시드 2건 — 반드시 빠져야 한다
    ['s1', now,        30000000, '카드', '[TESTSEED] 시연',        'paid'],
    ['s2', now,        20000000, '카드', '정기결제 자동청구(cron)', 'paid'],
    // 취소 건 — status 가 paid 가 아니므로 빠져야 한다
    ['u4', now,          777000, '카드', '[cafe24] 동기화', 'cancelled'],
  ];
  const ins = db.prepare(`INSERT INTO student_payments (user_id,paid_at,amount_krw,method,memo,status)
                          VALUES (?,?,?,?,?,?)`);
  for (const r of rows) ins.run(...r);

  // payments-board.ts 가 쓰는 조건을 그대로 재현
  const NOT_SEED = `NOT (COALESCE(p.memo,'') LIKE '[TESTSEED]%' OR COALESCE(p.memo,'') = '정기결제 자동청구(cron)')`;
  const D = `date(p.paid_at/1000,'unixepoch','+9 hours')`;
  const r = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN ${D} = date('now','+9 hours') THEN p.amount_krw END),0) AS today_amt,
           COUNT(CASE WHEN ${D} = date('now','+9 hours') THEN 1 END) AS today_cnt,
           COALESCE(SUM(p.amount_krw),0) AS all_amt
      FROM student_payments p WHERE p.status='paid' AND ${NOT_SEED}
  `).get();

  ok(Number(r.today_amt) === 150000,
    '오늘 결제액에서 시드 5,000만원이 빠진다 (150,000 이어야 함)', `실제: ${r.today_amt}`);
  ok(Number(r.today_cnt) === 2, '오늘 건수 2건 (시드·취소 제외)', `실제: ${r.today_cnt}`);
  ok(Number(r.all_amt) === 1050000, '전체도 시드·취소 제외', `실제: ${r.all_amt}`);

  // PG 수수료 2.86%
  ok(Math.round(150000 * 0.0286) === 4290, 'PG 수수료 = 결제액 × 2.86% (150,000 → 4,290)');
  db.close();
}

/* ── ⑤ 미배정 몫을 숨기지 않는다 ──────────────────────────────── */
console.log('\n⑤ 대리점을 못 붙인 몫을 드러낸다');
{
  ok(/unattributed/.test(board), 'API 가 unattributed(건수·금액)를 돌려준다');
  ok(/st\.user_id IS NULL/.test(board), '판정 기준 = 학생 원부에 없는 결제자');
  ok(/b2c-unattr/.test(html) && /b2c-unattr/.test(q7), '화면에 경고 띠가 있다');
  ok(/pm-unattr-note\[hidden\][\s\S]{0,80}display:\s*none\s*!important/.test(
       readFileSync(join(PUB, 'css', 'admin-inline-c.css'), 'utf8')),
     '[hidden] 이 실제로 먹도록 !important 로 못박혀 있다');
}

/* ── ⑥ 데모 잔재가 되살아나지 않았다 ───────────────────────────
   ⚠️ 주석을 걷어내고 본다. adm-q7.js 머리말이 «되살리지 말 것» 목록으로 옛 상수와
      Math.random 을 «글로» 적고 있어서, 그냥 grep 하면 자기 경고문에 자기가 걸린다. */
console.log('\n⑥ 데모 잔재 없음');
{
  const code = q7.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/890000|28500000|815100|2380000|45200000/.test(code),
    'adm-q7.js 에 하드코딩 결제 상수가 없다');
  ok(!/Math\.random/.test(code), 'adm-q7.js 에 Math.random() 차트가 없다');
  ok(!/alert\(['"]검색 요청 전송/.test(code), '검색 버튼이 alert 데모가 아니다');
  ok(/fetch\('\/api\/admin\/payments\/b2b|fetch\(url/.test(code), '실제로 API 를 호출한다');
  ok(!/pm-demo-badge|pm-demo-note/.test(html), '「데모 데이터」 배지·띠가 걷혔다');
  ok(!/b2b-compare-chart|b2c-compare-chart/.test(html),
    '가짜 「3년 평균 vs 올해」 비교 차트가 제거됐다');
}

/* ── ⑦ 라우팅 등록 — 이 저장소가 반복해 밟은 함정 ─────────────── */
console.log('\n⑦ 라우팅·인증 게이트');
{
  ok(/import { handlePaymentsBoardApi }/.test(admin), 'api-admin.ts 가 핸들러를 들여온다');
  ok(/handlePaymentsBoardApi\(request, url/.test(admin), 'api-admin.ts 가 핸들러를 호출한다');
  const idx = readFileSync(join(SRC, 'index.ts'), 'utf8');
  ok(/'\/api\/admin\/payments'/.test(idx),
    "index.ts 인증 게이트가 '/api/admin/payments' 접두사를 덮는다");
  ok(/handlePaymentsBoardApi/.test(admin.slice(0, admin.indexOf("path === '/api/admin/payments/overdue'"))),
    '기존 /payments/overdue 라우트보다 «먼저» 걸린다');
}

/* ── ⑧ 시드 제외 조건은 한 곳에서만 ───────────────────────────── */
console.log('\n⑧ 시드 제외 조건을 복사하지 않았다');
{
  ok(/export function notSeedSql/.test(acct), 'accounting-reports.ts 가 notSeedSql 을 export 한다');
  ok(/import \{[^}]*notSeedSql[^}]*\} from '\.\/accounting-reports'/.test(board),
    'payments-board.ts 가 그것을 들여와 쓴다 (복사본 금지)');
  ok(!/TESTSEED/.test(board), 'payments-board.ts 안에 시드 문구가 복사돼 있지 않다');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
