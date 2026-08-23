// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🏦 신한 계좌 지출 분석 API — «실제로 돌려 보는» 회귀 하니스 (2026-08-23)

   [왜 문자열 검사로는 부족한가] 3단계에서 넣은 고정비 판정·전월 대비 증감·엑셀
   내보내기는 «그 함수가 있는가» 를 아무리 확인해도 **판정이 맞는지**를 알 수 없다.
   CLAUDE.md 2장의 「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」·「단계를 새로 넣었는데
   그 단계가 한 번도 안 쓰임」이 정확히 그런 사고였다 — 코드도 값도 다 «있는데»
   닿지 않거나 모양이 안 맞았다.

   그래서 `src/accounting-reports.ts` 를 컴파일해 **가짜 D1 로 실제로 돌린다**
   (선례: `no_show_false_alarm_harness.mjs` ⑩).

   ⚠️ typescript 는 cloudflare-deploy/node_modules 에 있다. 없으면 이 하니스는
      «건너뜀»으로 끝낸다 — 하니스 전체가 죽는 것이 더 나쁘다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(__dir, '..', rel), 'utf8');

let pass = 0;
const fails = [];
const check = (name, ok, why) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fails.push(name + (why ? ' — ' + why : '')); console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
};

console.log('════════ 🏦 신한 계좌 지출 분석 (bank-expenses) ════════');

const SRC = 'cloudflare-deploy/src/accounting-reports.ts';
const src = read(SRC);

/* ── ① 문자열로만 확인할 것 — «되살리면 안 되는 것» ───────────────────────── */
console.log('\n[ ① ⛔ 이 화면은 «출금» 전용이다 ]');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const fnBody = (() => {
  const i = src.indexOf('async function bankExpensesReport');
  if (i < 0) return '';
  // 다음 최상위 함수 선언 전까지
  const j = src.indexOf('\nasync function ', i + 10);
  return src.slice(i, j > 0 ? j : src.length);
})();
check('bankExpensesReport 가 있다', fnBody.length > 500);
const clean = strip(fnBody);
check("입금(kind='in')을 읽지 않는다 — 「케이씨피M」 금지가 되살아나지 않게",
  !/kind\s*=\s*'in'/.test(clean), '입금 조회가 생겼습니다');
check('출금만 읽는다', /kind='out'/.test(clean));
check('계정과목은 공용 판정 함수를 쓴다 (손익계산서와 같은 함수)',
  /resolveExpenseAccount\(/.test(clean) && !/owners\.has\(/.test(clean),
  '판정을 이 함수 안에서 다시 쓰고 있습니다');

/* ── ② 컴파일해서 실제로 돌린다 ───────────────────────────────────────────── */
console.log('\n[ ② 가짜 D1 로 실제 실행 ]');
let mod = null, why = '';
try {
  const ts = (await import(pathToFileURL(
    resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
  /* import 를 전부 걷어내고 필요한 것만 스텁으로 넣는다.
     ⚠️ 스텁이 진짜와 «모양»이 다르면 조용히 빈 결과가 되므로, 아래 가짜 DB 는
        모르는 SQL 을 만나면 기록해 두고 마지막에 0건인지 확인한다. */
  let code = src.replace(/^import[\s\S]*?from\s*'[^']+';\s*$/gm, '');
  code += '\nexport { bankExpensesReport };\n';
  const stub = `
    const getScope = async () => ({ type: 'hq', value: null, label: '본사' });
    const selectInChunks = async (db) => (db.__rows || []);
    const loadRateOverrides = async () => ({});
    const resolveHqRate = () => 0;
    const DEFAULT_HQ_RATE = 0;
    const bankacctStatus = async () => ({ state: 'ok', message_ko: '정상', message_en: 'ok', rows_total: 9 });
    // 📥 엑셀은 «무엇을 담아 보냈는지» 를 그대로 돌려주는 스텁으로 대신한다
    const xlsxResponse = (filename, sheets) =>
      new Response(JSON.stringify({ __xlsx: true, filename, sheets }),
        { headers: { 'Content-Type': 'application/json' } });
  `;
  const js = ts.transpileModule(stub + code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
} catch (e) { why = String(e && e.message || e); }

if (!mod) {
  console.log('  ⏭ 컴파일하지 못해 건너뜀 (' + why.slice(0, 120) + ')');
} else {
  /* 씨앗 — 2026-07 기준.
     · 김영진(지성교  : 4개월 내내 ~600만  → 고정비 (금액 폭 작음)
     · 신한카드        : 4개월 내내 나오지만 금액이 2.4배 흔들림 → 반복(금액 변동)
     · 주식회사알수없는곳: 7월에만          → 변동비 + «새로 생김»
     · 옛구독서비스     : 6월까지 있다가 7월에 사라짐 → «사라짐» 으로 잡혀야 한다 */
  const TX = [];
  const add = (ym, day, remark, amount, category) =>
    TX.push({ id: TX.length + 1, trans_at: `${ym}-${String(day).padStart(2, '0')} 10:00`,
              amount, balance: 0, remark, category, memo: '' });
  for (const [ym, amt] of [['2026-04', 5800000], ['2026-05', 6000000], ['2026-06', 5500000], ['2026-07', 6000000]]) {
    add(ym, 5, '김영진(지성교', amt, '기타출금');
  }
  for (const [ym, amt] of [['2026-04', 900000], ['2026-05', 2100000], ['2026-06', 1200000], ['2026-07', 2000000]]) {
    add(ym, 15, '신한카드 결제', amt, '카드대금');
  }
  add('2026-07', 20, '주식회사새로운곳', 1500000, '기타출금');
  for (const ym of ['2026-04', '2026-05', '2026-06']) add(ym, 8, '옛구독서비스', 900000, '기타출금');

  const unknownSql = [];
  const rowsFor = (sql, binds) => {
    if (/FROM expense_payee_category/i.test(sql)) return [];              // 사람이 지정한 것 없음
    if (/FROM franchises/i.test(sql)) return [{ owner_name: '김영진' }];   // 지사 대표자 → 지사수수료
    if (/substr\(trans_at,1,7\) AS ym/i.test(sql)) {
      const m = new Map();
      for (const t of TX) {
        const ym = t.trans_at.slice(0, 7);
        m.set(ym, (m.get(ym) || 0) + t.amount);
      }
      return [...m].map(([ym, total]) => ({ ym, total, cnt: TX.filter(t => t.trans_at.startsWith(ym)).length }));
    }
    if (/FROM bankacct_transactions/i.test(sql)) {
      const [a, b] = binds;
      return TX.filter(t => { const ym = t.trans_at.slice(0, 7); return ym >= a && ym <= b; })
               .sort((x, y) => (x.trans_at < y.trans_at ? 1 : -1));
    }
    unknownSql.push(sql.replace(/\s+/g, ' ').trim().slice(0, 90));
    return [];
  };
  const DB = {
    exec: async () => {},
    prepare(sql) {
      let binds = [];
      const api = {
        bind: (...b) => { binds = b; return api; },
        all: async () => ({ results: rowsFor(sql, binds) }),
        first: async () => (rowsFor(sql, binds)[0] || null),
        run: async () => ({ meta: { changes: 0 } }),
      };
      return api;
    },
  };
  const env = { DB };
  const req = new Request('https://x/api/admin/reports/bank-expenses');

  const res = await mod.bankExpensesReport(env, req, new URL('https://x/?month=2026-07'), 'json');
  const d = await res.json();

  check('가짜 DB 가 모르는 SQL 이 없다 (스텁이 실제 쿼리와 맞는다)',
    unknownSql.length === 0, unknownSql.join(' | '));
  check('응답이 만들어진다', d && d.ok === true && d.type === 'bank-expenses');

  console.log('\n[ ③ 🧭 계정과목 — 손익계산서와 같은 판정이 실제로 걸리는가 ]');
  const kim = (d.rows || []).find(r => /김영진/.test(r.remark));
  /* 「김영진(지성교」는 적요가 잘려 온다. payeeBase 로 «김영진» 을 뽑아
     franchises.owner_name 과 맞아야 지사수수료가 된다. 안 되면 「기타출금」에 남는다. */
  check('잘린 적요가 지사 대표자명과 맞으면 지사수수료', !!kim && kim.account === '지사수수료',
    kim ? kim.account : '(행 없음)');
  check('은행 적요로 이미 분류된 행은 그대로 둔다',
    (d.rows || []).some(r => /신한카드/.test(r.remark) && r.account === '카드대금'));

  console.log('\n[ ④ 🏷️ 지정 가능 여부 (2단계) ]');
  // ⚠️ payeeBase() 는 '(' 앞까지만 자른다 — 공백으로는 안 자르므로 이름은 「신한카드 결제」다
  const pCard = (d.payees || []).find(p => p.payee === '신한카드 결제');
  const pNew = (d.payees || []).find(p => p.payee === '주식회사새로운곳');
  check('「기타출금」으로 내려온 거래처는 지정 가능', !!pNew && pNew.assignable === true);
  /* 🪤 지정해도 안 바뀌는 거래처를 «가능» 이라고 하면, 지정해 놓고 「저장이 안 된다」가 된다 */
  check('은행 적요로 이미 분류된 거래처는 지정 불가로 표시', !!pCard && pCard.assignable === false,
    pCard ? String(pCard.assignable) : '(없음)');
  check('본사면 can_assign=true', d.can_assign === true);

  console.log('\n[ ⑤ 🔁 고정비 판정이 실제로 걸리는가 (3단계) ]');
  const rc = d.recurring || {};
  const item = (name) => (rc.items || []).find(i => i.payee === name);
  check('창이 4개월이고 마지막이 조회한 달',
    (rc.window || []).length === 4 && rc.window[3] === '2026-07', JSON.stringify(rc.window));
  check('매달 비슷한 금액 → 고정비', item('김영진') && item('김영진').kind === 'fixed',
    item('김영진') ? item('김영진').kind + ' spread=' + item('김영진').spread : '(없음)');
  /* 🪤 «매달 나온다» 만으로 고정비라고 하면 안 된다 — 금액이 2.4배 흔들리는 카드대금이
        고정비가 되면 「고정비는 그대로인데 변동비만 늘었다」는 판단이 통째로 틀어진다. */
  check('매달 나오지만 금액이 흔들리면 고정비가 아니다',
    item('신한카드 결제') && item('신한카드 결제').kind === 'recurring',
    item('신한카드 결제') ? item('신한카드 결제').kind + ' spread=' + item('신한카드 결제').spread : '(없음)');
  check('한 달만 나온 곳은 변동비',
    item('주식회사새로운곳') && item('주식회사새로운곳').kind === 'variable');
  check('고정비 합계가 그 달 금액이다', rc.fixed_total === 6000000, String(rc.fixed_total));
  check('세 묶음 합이 총 출금과 같다',
    (rc.fixed_total + rc.recurring_total + rc.variable_total) === d.summary.out_total,
    `${rc.fixed_total}+${rc.recurring_total}+${rc.variable_total} vs ${d.summary.out_total}`);
  check('근거(몇 달 나왔는지·금액 폭)를 함께 준다',
    item('김영진') && item('김영진').months_seen === 4 && typeof item('김영진').spread === 'number');

  console.log('\n[ ⑥ 📈 전월 대비 증감 — «사라진» 거래처가 보이는가 ]');
  const mv = (n) => (d.movers || []).find(m => m.payee === n);
  check('비교 대상이 전월이다', d.prev_month === '2026-06');
  check('새로 생긴 곳은 status=new', mv('주식회사새로운곳') && mv('주식회사새로운곳').status === 'new');
  /* 🪤 이번 달에 없는 거래처는 당월 목록만 보면 영영 안 보인다 — 정기결제가 끊긴 것을
        놓치지 않으려면 반드시 들어와야 한다. */
  check('7월에 사라진 곳이 목록에 있다', !!mv('옛구독서비스'), '(없음)');
  check('사라진 곳은 status=gone 이고 감소로 잡힌다',
    mv('옛구독서비스') && mv('옛구독서비스').status === 'gone' && mv('옛구독서비스').delta === -900000);
  check('증감이 큰 것부터 정렬', (d.movers || [])[0] && d.movers[0].delta >= (d.movers[1] || { delta: -1 }).delta);
  check('변화 없는 곳은 목록에 없다', !(d.movers || []).some(m => m.delta === 0));

  console.log('\n[ ⑦ 📥 엑셀 내보내기가 실제로 만들어지는가 ]');
  const xres = await mod.bankExpensesReport(env, req, new URL('https://x/?month=2026-07&format=xlsx'), 'xlsx');
  const x = await xres.json();
  check('xlsx 응답이 만들어진다', !!x && x.__xlsx === true);
  check('파일 이름에 조회한 달이 들어간다', /bank-expenses-2026-07/.test(String(x.filename)), String(x.filename));
  const names = (x.sheets || []).map(s => s.name);
  check('시트가 요약 + 3장', names.length === 4, names.join(','));
  check('거래처별·증감·출금내역 시트가 있다',
    names.includes('거래처별') && names.includes('전월 대비 증감') && names.includes('출금 내역'), names.join(','));
  /* ⛔ 입금 시트를 만들면 「케이씨피M」·«운영자금 보충» 이 엑셀로 다시 나간다
        (2026-08-18 지시로 화면에서 뺀 것이 파일로 새는 형태) */
  check('입금 시트가 없다', !names.some(n => /입금/.test(n)), names.join(','));
  const flat = JSON.stringify(x.sheets);
  check('사라진 거래처가 엑셀에도 담긴다', /옛구독서비스/.test(flat));
  check('금액이 «숫자» 로 들어간다 (엑셀에서 합계가 되게)',
    /,6000000,/.test(flat) || /\[6000000/.test(flat) || /:6000000/.test(flat) || flat.includes('6000000'));

  console.log('\n[ ⑧ 자료가 없는 달 ]');
  const empty = await (await mod.bankExpensesReport(env, req, new URL('https://x/?month=2026-01'), 'json')).json();
  check('출금이 없는 달도 ok 로 답한다', empty.ok === true);
  check('가짜 숫자를 채우지 않는다', empty.summary.out_total === 0 && (empty.rows || []).length === 0);
  check('고정비도 0 으로 (없는 것을 있다고 하지 않는다)',
    empty.recurring.fixed_total === 0 && (empty.recurring.items || []).length === 0);
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fails.length}건 중 ✅ ${pass} 통과 / ❌ ${fails.length} 실패`);
if (fails.length) {
  console.log('실패:');
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
