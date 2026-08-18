// 🧾 카페24 회계 실데이터 — 「케이씨피M」 매출 제외 하니스 (2026-08-18)
//
//   왜 필요한가 —
//     관리자 「정산·매출 > 카페24 회계 실데이터(장부·급여·지출·세금·예치금)」의
//     매출·손익 추이는 Neo4j AccBook 을 type(1=수입/2=지출)만 보고 통째로 더하고 있었다.
//     그래서 하나은행 계좌에서 옮겨 온 «운영자금»(적요 「케이씨피M」)이 그대로 매출로 잡혀
//     총 매출·순이익·영업이익률이 부풀었다. 통장(bankacct_transactions) 쪽은
//     classifyDeposit() 이 진작 걸러내고 있었는데 회계장부 쪽만 안 걸러내고 있었다.
//
//   이 하니스가 못 박는 것 — 전부 «조용히 되돌아가면 매출을 잘못 읽는» 것들:
//     ① 「케이씨피M」은 걸리고 「케이씨피」(진짜 PG 정산금)는 절대 안 걸린다
//     ② TS 정규식과 Cypher(Java) 정규식이 같은 규칙이다 (한쪽만 고치면 FAIL)
//     ③ summary 집계가 income·expense 양쪽에서 「케이씨피M」을 빼고, 뺀 금액을 같이 내려준다
//     ④ ledger 목록이 행마다 excluded_from_revenue 를 내려준다
//     ⑤ 화면(adm-core.js)이 그 행을 매출 합계에서 빼고, 뺀 사실을 숨기지 않는다
//     ⑥ 판정 규칙을 화면·API 로 복사하지 않았다 (정본은 accounting-reports.ts 한 곳)
//
//   실행: node test-harness/c24_finance_kcpm_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, 'cloudflare-deploy', 'src');
const PUB = join(root, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); }
};

const acct  = readFileSync(join(SRC, 'accounting-reports.ts'), 'utf8');
const admin = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
const core  = readFileSync(join(PUB, 'js', 'adm-core.js'), 'utf8');
const html  = readFileSync(join(PUB, 'admin.html'), 'utf8');

console.log('\n🧾 카페24 회계 실데이터 「케이씨피M」 매출 제외 하니스\n');

/* ── ① 판정이 실제로 맞는가 (소스에서 정규식을 꺼내 돌려 본다) ── */
console.log('① 「케이씨피M」만 걸리고 「케이씨피」는 안 걸린다');
const tsLit = acct.match(/const KCP_TRANSFER_TEXT_RE = (\/.+\/[a-z]*);/);
ok(!!tsLit, 'accounting-reports.ts 에 KCP_TRANSFER_TEXT_RE 정규식이 있다');
let tsRe = null;
if (tsLit) {
  const body = tsLit[1].slice(1, tsLit[1].lastIndexOf('/'));
  const flags = tsLit[1].slice(tsLit[1].lastIndexOf('/') + 1);
  tsRe = new RegExp(body, flags);
  const hits = ['케이씨피M', '케이씨피 M', '케이씨피M 입금', '(주)케이씨피M', 'KCPM', 'kcpm'];
  const miss = ['케이씨피', '케이씨피(주)', 'KCP', '케이씨피 정산', '케이씨피MONEY', '수업료', '김영진'];
  ok(hits.every(t => tsRe.test(t)), '자금이동으로 잡아야 할 적요를 전부 잡는다',
    '못 잡은 것: ' + hits.filter(t => !tsRe.test(t)).join(', '));
  ok(miss.every(t => !tsRe.test(t)), '⛔ 「케이씨피」(진짜 PG 정산금)는 절대 안 잡는다',
    '잘못 잡은 것: ' + miss.filter(t => tsRe.test(t)).join(', '));
}

/* ── ② TS 와 Cypher 규칙이 같은 것을 가리킨다 ─────────────────── */
console.log('\n② TS 정규식과 Cypher 정규식이 같은 규칙이다');
const cyLit = acct.match(/export const KCP_TRANSFER_CYPHER_RE = '([^']+)';/);
ok(!!cyLit, 'accounting-reports.ts 가 KCP_TRANSFER_CYPHER_RE 를 export 한다');
if (cyLit && tsRe) {
  // TS 소스의 '\\s' → 실제 문자열 '\s'
  const cy = cyLit[1].replace(/\\\\/g, '\\');
  ok(/^\(\?is\)\.\*/.test(cy) && /\.\*$/.test(cy),
    'Cypher 쪽은 `=~`(전체일치)용이라 (?is) + .* 로 감싸져 있다', cy);
  // 감싼 것을 벗기면 TS 정규식 본문과 글자까지 같아야 한다 — 한쪽만 고치는 사고 방지
  const core_ = cy.replace(/^\(\?is\)\.\*/, '').replace(/\.\*$/, '');
  ok(core_ === tsRe.source, 'Cypher 정규식 본문 = TS 정규식 본문 (한쪽만 고치면 FAIL)',
    `cypher=${core_}  ts=${tsRe.source}`);
}
ok(/export function isKcpTransferRow/.test(acct),
  '거래처·적요·계정과목 어디에 적혀 있어도 잡는 isKcpTransferRow() 가 있다');

/* ── ③ 매출·손익 집계에서 뺀다 ───────────────────────────────── */
console.log('\n③ summary 집계가 「케이씨피M」을 빼고, 뺀 금액을 숨기지 않는다');
{
  const i = admin.indexOf("if (kind === 'summary')");
  const sum = admin.slice(i, admin.indexOf('const QMAP', i));
  ok(i > 0 && /MATCH \(a:AccBook\)/.test(sum), 'finance-cafe24/summary 가 AccBook 을 집계한다');
  ok(/AS isKcpm/.test(sum), '행마다 isKcpm(=「케이씨피M」인가)을 판정한다');
  ok(/t = 1 AND NOT isKcpm/.test(sum), '총 매출(income)에서 「케이씨피M」을 뺀다');
  ok(/t = 2 AND NOT isKcpm/.test(sum), '총 지출(expense)에서도 「케이씨피M」을 뺀다');
  ok(/excluded_transfer/.test(sum) && /excluded_count/.test(sum),
    '뺀 금액·건수를 excluded_transfer / excluded_count 로 같이 내려준다');
  ok(/\$kcpmRe/.test(sum) && /kcpmRe: KCP_TRANSFER_CYPHER_RE/.test(sum),
    '정규식을 쿼리에 박지 않고 정본 상수를 파라미터로 넘긴다');
}

/* ── ④ 거래 내역 목록도 행마다 표시를 내려준다 ───────────────── */
console.log('\n④ ledger 목록이 행마다 매출 제외 여부를 내려준다');
{
  const led = admin.slice(admin.indexOf('ledger: `MATCH (a:AccBook)'));
  const line = led.slice(0, led.indexOf('\n'));
  ok(/AS excluded_from_revenue/.test(line), '회계장부 조회가 excluded_from_revenue 를 함께 돌려준다');
  ok(/coalesce\(a\.store,''\) =~ \$kcpmRe/.test(line) && /coalesce\(a\.memo,''\) =~ \$kcpmRe/.test(line),
    '거래처·적요 양쪽을 본다 (카페24 입력자가 자리를 가리지 않는다)');
}

/* ── ⑤ 화면이 매출 합계에서 빼고, 뺀 사실을 보여 준다 ─────────── */
console.log('\n⑤ 화면(adm-core.js)이 합계에서 빼고 숨기지 않는다');
{
  const load = core.slice(core.indexOf('window.c24FinLoad'), core.indexOf('window.accLoadFranchise'));
  ok(/excluded_from_revenue/.test(load), '서버가 내려준 판정을 그대로 쓴다');
  ok(/if \(isExcl\(row\)\) \{ sExc \+= m; nExc\+\+; return; \}/.test(load),
    '「케이씨피M」 행은 매출·지출 합계에 더하지 않는다');
  ok(/매출 제외/.test(load), '표에서 그 행이 «매출 제외» 로 구분된다');
  const summ = core.slice(core.indexOf('window.c24FinSummary'), core.indexOf('window.c24FinLoad'));
  ok(/excluded_transfer/.test(summ) && /c24fin-sum-total/.test(summ),
    'KPI 카드 아래에 «얼마를 왜 뺐는지» 안내가 나온다');
  ok(/「케이씨피M」 제외/.test(summ), '총 매출 카드가 제외 사실을 라벨로 알린다');
  ok(/id="c24fin-sum-total"/.test(html), 'admin.html 에 그 안내가 들어갈 자리가 있다');
}

/* ── ⑥ 규칙을 복사하지 않았다 ───────────────────────────────── */
console.log('\n⑥ 판정 규칙의 정본은 accounting-reports.ts 한 곳');
{
  ok(/import \{[^}]*KCP_TRANSFER_CYPHER_RE[^}]*\} from '\.\/accounting-reports'/.test(admin),
    "api-admin.ts 가 정본을 들여와 쓴다 (복사본 금지)");
  ok(!/케이씨피\s*M\|KCP/.test(admin), 'api-admin.ts 안에 정규식 복사본이 없다');
  ok(!/케이씨피\s*M\|KCP/.test(core), 'adm-core.js 안에 정규식 복사본이 없다 (서버 판정만 쓴다)');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
