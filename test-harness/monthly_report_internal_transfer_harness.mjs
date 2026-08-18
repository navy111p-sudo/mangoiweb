// 📅 월간 회계 리포트 — 내부 자금이체(구 「운영자금 보충」) 표시 제거 하니스 · 2026-08-18
//
//   왜 필요한가 —
//     신한 계좌에는 자기 계좌 간에 옮긴 돈(적요가 「케이씨피M」)이 섞여 들어온다.
//     매출이 아니라서 손익에는 넣지 않았지만, 화면에는 「운영자금 보충」이라는 줄과
//     그것을 설명하는 각주가 남아 있었다. 사장님 판단 — **설명이 오히려 혼동을 준다.**
//     2026-08-18 지시로 월간 회계 리포트에서는 금액도 각주도 아예 보여 주지 않는다.
//     같은 날 추가 지시로 **손익계산서(P&L)·매출–입금 대사 리포트도 같은 기준**으로 맞췄다.
//
//   이 하니스가 못 박는 것:
//     ① 화면(renderMonthly)에 「케이씨피M」·「운영자금」·funding_in_krw 가 되살아나면 안 된다
//     ② 리포트 payload(buildMonthly)에도 그 금액이 나가면 안 된다
//     ③ 「실제 현금흐름」의 입금액은 내부 이체를 뺀 금액이어야 한다 (순증감까지 같이 바뀐다)
//     ④ 상세 목록·CSV 에는 «아직 성격을 모르는» 입금만 남는다
//     ⑤ 손익계산서·대사 리포트에도 그 설명이 남아 있으면 안 된다 (화면마다 말이 갈리면 안 된다)
//     ⑥ ⛔ 그래도 classifyDeposit 의 판정 자체는 지우면 안 된다 —
//        이 규칙이 없으면 대사(reconcile)가 다시 «매출 누락» 오진을 한다(2026-08-16 사고)
//
//   실행: node test-harness/monthly_report_internal_transfer_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const acct = readFileSync(join(root, 'cloudflare-deploy', 'src', 'accounting-reports.ts'), 'utf8');
const core = readFileSync(join(root, 'cloudflare-deploy', 'public', 'js', 'adm-core.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); }
};

/** 소스에서 함수 한 덩어리를 잘라 온다(다음 최상위 선언 전까지). */
const slice = (src, from, to) => {
  const a = src.indexOf(from);
  if (a < 0) return '';
  const b = src.indexOf(to, a + from.length);
  return b < 0 ? src.slice(a) : src.slice(a, b);
};

console.log('\n📅 월간 회계 리포트 — 내부 자금이체 표시 제거\n');

/* ── ① 화면에 문구가 되살아나지 않았는가 ──────────────────────── */
console.log('① 화면(renderMonthly)에 설명이 남아 있지 않다');
{
  const render = slice(core, 'function renderMonthly(', 'function renderQuarterly(');
  ok(render.length > 500, 'renderMonthly() 를 찾았다', '함수명이 바뀌었으면 이 하니스부터 고칠 것');
  ok(!/케이씨피/.test(render), '「케이씨피M」 설명 각주가 없다');
  ok(!/운영자금/.test(render), '「운영자금 보충」 표현이 없다');
  ok(!/funding_in_krw/.test(render), 'funding_in_krw 를 그리지 않는다');
  ok(!/메우려고|메우고 있는지/.test(render), '«부족한 돈을 메우려고 옮겨 왔습니다» 문장이 없다');
  ok(/매출 합계/.test(render) && /통장 직접입금/.test(render),
    '매출 표 자체는 그대로다 (장부 결제 · 통장 직접입금 · 매출 합계)');
  ok(/deposit_transfer_unknown_krw/.test(render),
    '아직 «성격 미확인» 입금은 계속 묻는다 (모르는 돈까지 숨기면 안 된다)');
}

/* ── ② 서버 payload 에도 금액이 나가지 않는다 ─────────────────── */
console.log('\n② 리포트 payload 에 내부 이체 금액이 없다');
{
  const build = slice(acct, 'async function buildMonthly(', '\n/* ═');
  ok(build.length > 500, 'buildMonthly() 를 찾았다');
  ok(!/funding_in_krw/.test(acct), 'accounting-reports.ts 어디에도 funding_in_krw 가 없다');
  ok(!/transferKnown/.test(build), 'buildMonthly 가 transferKnown 을 내보내지 않는다');
  ok(/deposit_transfer_krw:\s*pl\.rev\.dep\.transferUnknown/.test(build),
    'deposit_transfer_krw 는 «확인 안 된» 금액만 담는다');
  ok(/const unknownTransferRows = pl\.rev\.dep\.transferRows\.filter\(r => !r\.known\)/.test(build),
    '상세 목록은 known=false 행만 남긴다');
  ok(/transfer_rows:\s*unknownTransferRows/.test(build),
    'detail.transfer_rows 가 그 목록을 쓴다 (엑셀 «확인필요 입금» 시트도 이걸 본다)');
  ok(!/케이씨피M/.test(build), '월간 CSV 문구에 「케이씨피M」 이 없다');
}

/* ── ③ 실제 현금흐름에서도 뺐는가 ─────────────────────────────── */
console.log('\n③ «통장 기준 실제 현금흐름» 이 내부 이체를 뺀 금액이다');
{
  const cash = slice(acct, 'async function monthCash(', '\n/* 통장 PG 입금이');
  ok(/const cin = Math\.max\(0, t\.cin - dep\.transferKnown\)/.test(cash),
    '실제 입금(cin)에서 내부 이체를 뺀다');
  ok(/cinAll: t\.cin/.test(cash), '원본 합계는 cinAll 로 남겨 뒀다 (통장 원장 대조용)');
  const build = slice(acct, 'async function buildMonthly(', '\n/* ═');
  ok(/cash_net_krw: cash\.cin - cash\.cout/.test(build),
    '순증감은 뺀 뒤의 cin 으로 다시 계산된다');
}

/* ── ④ 대사 배너 안내문 ───────────────────────────────────────── */
console.log('\n④ 대사 배너가 내부 이체를 설명하지 않는다');
{
  const rec = slice(acct, 'function reconcileMonth(', '\n// ─');
  ok(!/transferKnown/.test(rec), 'transfer_note 가 확인된 내부 이체를 안내하지 않는다');
  ok(/transferUnknown/.test(rec), '성격을 «모르는» 입금은 계속 안내한다');
}

/* ── ⑤ 손익계산서·대사 리포트도 같은 기준 ─────────────────────── */
console.log('\n⑤ 손익계산서·대사 리포트에도 설명이 남아 있지 않다');
{
  const stmt = slice(acct, 'async function statementReport(', '\nasync function taxReport(');
  ok(stmt.length > 500, 'statementReport() 를 찾았다');
  ok(!/transferKnown/.test(stmt), '손익계산서 매출 각주에서 내부 이체 안내가 빠졌다');
  ok(/transferUnknown/.test(stmt), '성격을 «모르는» 입금은 손익계산서에서도 계속 밝힌다');

  const rec = slice(acct, 'async function reconcileReport(', '\n// ─');
  ok(rec.length > 500, 'reconcileReport() 를 찾았다');
  ok(!/케이씨피M/.test(rec), '대사 리포트 문구·엑셀 머리말에 「케이씨피M」 이 없다');
  ok(!/운영자금/.test(rec), '대사 리포트에 「운영자금」 표현이 없다');
  ok(/if \(kind === 'transfer' && isKnownTransfer\(row\.remark\)\) continue;/.test(rec),
    '확인된 내부 이체는 대사 집계 어느 칸에도 넣지 않는다');
  ok(/성격 미확인 입금/.test(rec), '남은 칸 이름은 「성격 미확인 입금」 이다');
}

/* ── ⑥ ⛔ 판정 규칙 자체는 살아 있어야 한다 ───────────────────── */
console.log('\n⑥ 매출 제외 규칙(classifyDeposit)은 그대로다');
{
  ok(/const KNOWN_TRANSFER_RE = \/\^케이씨피M\$\//.test(acct),
    '「케이씨피M」 판정 정규식이 살아 있다');
  const fn = slice(acct, 'export function classifyDeposit(', '\nexport interface');
  ok(/if \(s === '케이씨피'[^\n]*return 'pg'/.test(fn),
    '「케이씨피」(기업은행 자동정산)만 PG 입금으로 센다');
  ok(/if \(\/케이씨피\|KCP\/i\.test\(s\)\) return 'transfer'/.test(fn),
    '변형 표기는 transfer — 매출·대사에서 빠진다 (이게 없으면 «매출 누락» 오진 재발)');
  const rev = slice(acct, 'async function monthRevenue(', '\n/* 📊');
  ok(/total: \(Number\(book\.revenue\) \|\| 0\) \+ dep\.b2b/.test(rev),
    '매출 합계는 장부 결제 + B2B 직접입금뿐이다 (내부 이체는 애초에 안 들어간다)');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
