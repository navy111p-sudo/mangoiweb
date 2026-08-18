// 🌱 시연용 시드 결제 제외 — «리포트는 빼는데 대시보드는 세는» 어긋남 감시 · 2026-08-18
//
//   왜 필요한가 —
//     student_payments 에는 시연용으로 만들어진 가짜 결제가 432건(1억 7,280만) 섞여 있다.
//       · '[TESTSEED] …'            323건 — 시드 생성기 표식
//       · '정기결제 자동청구(cron)'  109건 — 빌링키 없는 시드 구독 50건을 cron 이 매일
//                                          «청구» 한 것처럼 쌓은 행. payment_orders 에
//                                          한 건도 없다 = 돈이 오간 적 없다(2026-08-18 확인).
//     회계 리포트·손익·대사·가맹점 정산서는 notSeedSql() 로 이미 걸러내고 있었는데,
//     **KPI 대시보드·매출통계·경영요약·실시간회계·AI비서·정산 대시보드는 안 걸렀다.**
//     그래서 같은 달 매출이 화면마다 3~4배 차이가 났다(2026-06 실측 3,732만 vs 1,158만).
//
//   이 하니스가 못 박는 것:
//     ① 매출을 «합치는» 쿼리는 전부 notSeedSql() 을 통과해야 한다
//     ② 조건을 복사해 붙이지 말 것 — accounting-reports 의 것 하나만 쓴다
//     ③ 시드 판별 문구(SEED_MEMOS) 자체가 사라지면 안 된다
//
//   ⚠️ 새 매출 집계를 만들 때 이 하니스가 FAIL 하면, 그건 «걸러야 할 곳을 빠뜨렸다» 는 뜻이다.
//      정말 시드까지 세야 하는 곳이라면 아래 ALLOW 에 이유와 함께 적을 것.
//
//   실행: node test-harness/seed_payment_filter_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SRC = join(dirname(dirname(fileURLToPath(import.meta.url))), 'cloudflare-deploy', 'src');
let pass = 0, fail = 0;
const ok = (c, label, detail) => {
  if (c) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); }
};
const read = f => readFileSync(join(SRC, f), 'utf8');

/* 매출을 «합치는» 쿼리를 가진 파일들 — 화면 이름과 함께 적어 둔다. */
const FILES = [
  ['api-admin.ts',           'KPI 대시보드 · 매출통계 · 오늘 통계'],
  ['accounting-realtime.ts', '실시간 회계'],
  ['exec-summary.ts',        '경영 요약(오늘 회사가 한 일)'],
  ['ai-command.ts',          'AI 비서 통계'],
  ['org-settlement.ts',      '지점/가맹점 정산 대시보드'],
  ['accounting-reports.ts',  '회계 리포트·손익·대사·가맹점 정산서'],
  ['payments-board.ts',      '결제관리(B2C)'],
];

/* 조건이 «변수에 담겨» 들어가는 경우가 있다(payments-board 의 BASE → where[] → WHERE 처럼
   한 번 더 건너뛰기도 한다). 변수 정의가 notSeedSql 을 직접 담고 있거나, 이미 «안전» 으로
   판정된 변수를 물고 있으면 그 변수를 끼운 쿼리도 걸러진 것으로 본다(더 안 변할 때까지 반복). */
function safeFragments(src) {
  const decls = [];
  const re = /const\s+([A-Za-z_$][\w$]*)[^=\n]*=\s*([^\n]*)/g;
  let m;
  while ((m = re.exec(src))) decls.push({ name: m[1], rhs: m[2] });
  const safe = new Set();
  for (let pass = 0; pass < 5; pass++) {
    const before = safe.size;
    for (const d of decls) {
      if (safe.has(d.name)) continue;
      if (/notSeedSql\(/.test(d.rhs)) { safe.add(d.name); continue; }
      if ([...safe].some(n => new RegExp('\\b' + n + '\\b').test(d.rhs))) safe.add(d.name);
    }
    if (safe.size === before) break;
  }
  return safe;
}

/* 시드를 세도 되는 예외 — «왜» 를 반드시 남긴다. */
const ALLOW = [
  // 특정 학생 한 명의 결제 이력·최근 결제일을 보여 주는 곳은 매출 집계가 아니다.
  /\(SELECT MAX\(paid_at\) FROM student_payments/,
  /\(SELECT amount_krw FROM student_payments/,
  // 카페24 동기화분만 세는 진단 쿼리 — memo LIKE '[cafe24]%' 로 이미 시드와 무관하다.
  /memo LIKE '\[cafe24\]%'/,
];

console.log('\n🌱 시연용 시드 결제 제외 — 매출 집계 일관성\n');

/* ── ① 매출 합계 쿼리마다 시드 제외가 붙어 있는가 ───────────────── */
console.log('① 매출을 합치는 쿼리에 시드 제외가 붙어 있다');
for (const [file, screen] of FILES) {
  const src = read(file);
  // SUM(amount_krw) 이 들어간 쿼리 조각을 «문장 단위» 로 훑는다
  const frags = safeFragments(src);
  const chunks = src.split(/;\s*\n/).filter(c =>
    /SUM\(\s*(p\.|sp\.)?amount_krw\s*\)/.test(c) &&
    /student_payments/.test(c));            // ⚠️ finance_expenses 도 amount_krw 를 쓴다 — 여기선 매출만 본다
  let bad = 0;
  for (const c of chunks) {
    if (ALLOW.some(re => re.test(c))) continue;
    if (/notSeedSql\(/.test(c)) continue;
    if ([...frags].some(n => c.includes('${' + n + '}'))) continue;   // 조건을 변수로 끼운 경우
    if ([...frags].some(n => new RegExp('\\b' + n + '\\b').test(c))) continue;
    bad++;
  }
  ok(bad === 0, `${file} — ${screen}`,
     bad > 0 ? `시드 제외가 없는 매출 합계 쿼리 ${bad}개. notSeedSql() 을 붙이거나 ALLOW 에 이유를 적을 것` : '');
}

/* ── ② 조건을 복사해 쓰지 않았는가 ─────────────────────────────── */
console.log('\n② 판별 조건은 accounting-reports 한 곳에서만 온다');
for (const [file] of FILES) {
  if (file === 'accounting-reports.ts') continue;
  const src = read(file);
  if (!/notSeedSql/.test(src)) continue;
  ok(/import \{[^}]*notSeedSql[^}]*\} from '\.\/accounting-reports'/.test(src),
     `${file} 가 notSeedSql 을 import 해서 쓴다`);
  ok(!/TESTSEED/.test(src), `${file} 안에 시드 문구가 복사돼 있지 않다`);
}

/* ── ③ 시드 판별 자체가 살아 있는가 ────────────────────────────── */
console.log('\n③ 시드 판별 문구가 그대로다');
{
  const acct = read('accounting-reports.ts');
  ok(/const SEED_MEMOS = \[/.test(acct), 'SEED_MEMOS 가 있다');
  ok(/\[TESTSEED\]%/.test(acct), "'[TESTSEED]%' 를 시드로 본다");
  ok(/정기결제 자동청구\(cron\)/.test(acct), "'정기결제 자동청구(cron)' 를 시드로 본다");
  ok(/export function notSeedSql/.test(acct), 'notSeedSql() 을 export 한다');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
