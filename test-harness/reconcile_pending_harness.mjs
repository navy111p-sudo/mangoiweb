#!/usr/bin/env node
/* 🔍 월간 리포트 대사 — «입금 구간이 아직 안 끝난 달» 은 판정하지 않는다 (2026-10-09)

   실사고: 10/9 에 9월 리포트를 열었더니 입금 구간(9/22~10/21)의 절반만 지났는데,
   그때까지 들어온 두 번(₩3,129,279)을 9월 결제 전체의 예상 입금(₩15,443,560)과 견줘
   🚨 «장부와 통장이 크게 어긋납니다 · -393.5%» 가 떴다. 돈이 빈 것이 아니라 아직 안 온 것.

   정본: src/accounting-reports.ts 의 lagWindowOpen() · reconcileMonth().
   ⚠️ 문자열이 아니라 «실제로 돌려» 답을 본다 — 함수를 오려 내 타입을 벗기고 실행.
   짝: «구간이 끝난 달은 예전대로 판정한다» · «통장 마지막 날을 모르면 예전 동작». */
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const SRC = process.env.ACCT_SRC || new URL('../cloudflare-deploy/src/accounting-reports.ts', import.meta.url);
const src = readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };

// 함수 하나를 «선언부터 짝 맞는 닫는 중괄호까지» 오려 낸다(반환 타입의 { } 는 괄호·꺾쇠 깊이 0 이 아닐 때 건너뜀)
function fnAt(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let p = 0, a = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '(') p++; else if (c === ')') p--;
    else if (c === '<') a++; else if (c === '>' && src[j - 1] !== '=') a--;
    else if (c === '{' && p === 0 && a <= 0) {
      // 반환 타입 객체 « : { … } » 를 몸통으로 잘못 잡지 않게 — 바로 앞이 ':' 면 건너뜀
      const before = src.slice(i, j).replace(/\s+$/, '');
      if (/:\s*$/.test(before) || /\|\s*$/.test(before)) { let d = 0; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) break; } continue; }
      break;
    }
  }
  let d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) break; }
  return src.slice(i, k + 1);
}

const parts = ['prevDay', 'lagWindowOpen', 'reconcileMonth'].map(fnAt);
ok(parts.every(x => x.length > 50), '전제: 세 함수를 오려 냈다');
let api = null;
try {
  const js = stripTypeScriptTypes('const PG_FEE_RATE = 0.0286; const PG_SETTLE_LAG_DAYS = 21;\n' + parts.join('\n'));
  api = new Function(js + '\nreturn { prevDay, lagWindowOpen, reconcileMonth };')();
} catch (e) { console.log('  (실행 실패) ' + e.message); }
ok(!!api, '전제: 오려 낸 함수를 실행할 수 있다');

if (api) {
  const { lagWindowOpen, reconcileMonth } = api;
  const dep = { hasBank: true, pg: 9247127, b2b: 0, transferUnknown: 0, other: 0 };
  const win = { from: '2026-09-22', to: '2026-10-22' };   // [from, to)

  console.log('\n① 실사고 재현 — 10/8 까지 자료, 9월분 구간 9/22~10/21');
  const open = lagWindowOpen(win, '2026-10-08');
  ok(open && open.last_bank === '2026-10-08', '구간이 아직 열려 있다고 판단한다');
  const r = (() => { try { return reconcileMonth(15898250, dep, 3129279, open); } catch (e) { return { err: e.message }; } })();
  ok(r.verdict === 'pending', `🚨 alert 가 아니라 pending (지금: ${r.verdict})`);
  ok(r.diff_pct === null, `비율을 내지 않는다 (지금: ${r.diff_pct})`);
  ok(/2026-10-21/.test(String(r.message)), '«언제 다시 보라» 를 말한다(2026-10-21)');
  ok(r.lag_window && r.lag_window.to === '2026-10-21', 'lag_window 를 실어 보낸다');
  ok(r.deposit_pg === 3129279 && r.expected === 15443560, '숫자 자체는 그대로 실린다(감추지 않는다)');

  console.log('\n② 짝 — 구간이 끝난 달은 예전처럼 판정한다');
  ok(lagWindowOpen(win, '2026-10-21') === null, '마지막 날이 구간 끝날(10/21)이면 닫혔다');
  ok(lagWindowOpen(win, '2026-10-25') === null, '그 뒤면 닫혔다');
  const closed = reconcileMonth(15898250, dep, 3129279, null);
  ok(closed.verdict === 'alert', `닫힌 구간에서 크게 모자라면 여전히 alert (지금: ${closed.verdict})`);
  const fine = reconcileMonth(15898250, dep, 15400000, null);
  ok(fine.verdict === 'ok', `닫힌 구간에서 맞으면 ok (지금: ${fine.verdict})`);
  ok(typeof fine.diff_pct === 'number', '닫힌 구간은 비율을 낸다');

  console.log('\n③ 짝 — 모르면 옛 동작');
  ok(lagWindowOpen(win, null) === null, '마지막 날을 모르면(null) 열려 있다고 보지 않는다');
  ok(lagWindowOpen(win, 'garbage') === null, '이상한 값도 열려 있다고 보지 않는다');
  ok(reconcileMonth(15898250, dep, null, open).verdict !== 'pending', '시차 입금을 못 구했으면(lagPg null) pending 이 아니다');
  ok(reconcileMonth(15898250, { ...dep, hasBank: false }, 3129279, open).verdict === 'no_data', '통장 자료가 없는 달은 no_data 그대로');
}

console.log('\n④ 배선 — 월간 리포트가 실제로 구간 판정을 넘기고, 화면이 pending 을 안다');
ok(/reconcileMonth\(pl\.rev\.bookPg, pl\.rev\.dep, lagPg,\s*lagPg != null \? lagWindowOpen\(lagWin, lastBankDay\) : null\)/.test(src),
  'buildMonthly 가 lagWindowOpen 결과를 넘긴다');
const core = readFileSync(new URL('../cloudflare-deploy/public/js/adm-core.js', import.meta.url), 'utf8');
const banner = core.slice(core.indexOf('function reconcileBanner('), core.indexOf('function drill('));
ok(/pending:\s*\[/.test(banner), '배너가 pending 색·문구를 갖는다(없으면 배너가 통째로 안 뜬다)');
ok(/rec\.verdict === 'pending'/.test(banner), 'pending 이면 비율을 그리지 않는다');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
