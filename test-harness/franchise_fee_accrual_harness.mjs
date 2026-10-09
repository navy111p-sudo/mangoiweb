// 지사수수료 «귀속월» 기준 (2026-10-09) — monthActualOpex 의 쪼개기 블록을 소스에서 오려 내
// 가짜 D1 로 «실제로» 돌려 본다. 문자열 검사로는 «어느 달로 가는가» 를 못 본다.
import fs from 'node:fs';
const SRC = process.env.ACC_SRC || new URL('../cloudflare-deploy/src/accounting-reports.ts', import.meta.url).pathname;
const s = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n); } };

const dayM = s.match(/export const ACCRUAL_SHIFT_DAY = '(\d\d)';/);
ok('전제: ACCRUAL_SHIFT_DAY 선언이 있다', !!dayM);
const st = s.indexOf('  const nextP = (() => {');
const en = s.indexOf('  const franchiseShift =', st);
const en2 = s.indexOf('\n', en);
ok('전제: 쪼개기 블록을 오려 냈다', st > 0 && en > st);
let body = s.slice(st, en2 + 1)
  .replace(/ as Array<\{[^}]*\}>/g, '')
  .replace(/new Map<string, number>\(\)/g, 'new Map()')
  .replace(/\bconst (\w+): [^=]+=/g, 'const $1 =');

// 판정은 «남궁국화·김영진=지사수수료, 나머지=기타출금» 으로 흉내
const resolveExpenseAccount = (_r, remark) => /^(남궁국화|김영진)/.test(remark) ? '지사수수료' : '기타출금';
const loadExpenseAccountRules = async () => ({});
const safe = async (fn, fb) => { try { return await fn(); } catch (e) { console.log('    (safe 삼킴) ' + e.message); return fb; } };

function run(period, rows, bankAll) {
  const env = { DB: { prepare(sql) { return { bind(...a) {
    const [, p, nxt, day] = a;
    return { all: async () => ({ results: rows
      .filter(r => r.m === p || (r.m === nxt && r.dd <= day))
      .map(r => ({ remark: r.remark, amount: r.amount, m: r.m, dd: r.dd })) }) };
  } }; } } };
  const fn = new Function('env', 'period', 'bankAll', 'UNCLASSIFIED', 'ACCRUAL_SHIFT_DAY', 'safe', 'loadExpenseAccountRules', 'resolveExpenseAccount',
    `return (async () => { ${body}\n return { bankAll, franchiseShift }; })();`);
  return fn(env, period, bankAll, '기타출금', dayM ? dayM[1] : '03', safe, loadExpenseAccountRules, resolveExpenseAccount);
}
const cat = (r, c) => (r.bankAll.find(b => b.category === c) || {}).total || 0;

const rows = [
  { m: '2026-08', dd: '15', remark: '김영진(지성교', amount: 100 },   // 8월 중순 수수료 → 8월
  { m: '2026-09', dd: '01', remark: '남궁국화', amount: 1000 },        // 9/1 수수료 → 8월
  { m: '2026-09', dd: '01', remark: '이지웅', amount: 50 },            // 9/1 이지만 지사수수료 아님 → 9월
  { m: '2026-09', dd: '30', remark: '남궁국화', amount: 700 },         // 9/30 수수료 → 9월
  { m: '2026-10', dd: '02', remark: '김영진', amount: 300 },           // 10/2 수수료 → 9월
  { m: '2026-10', dd: '05', remark: '김영진', amount: 999 },           // 10/5 → 10월(9월로 안 옴)
  { m: '2026-10', dd: '01', remark: 'SMS', amount: 7 },                // 10/1 이지만 지사수수료 아님 → 10월
];
try {
  const aug = await run('2026-08', rows, [{ category: '기타출금', total: 100 }]);
  ok('8월: 자기 달 수수료 + 9/1 수수료(다음 달 초) = 1100', cat(aug, '지사수수료') === 1100);
  ok('8월: 가져온 금액이 franchiseShift.in 으로 보인다', aug.franchiseShift.in === 1000 && aug.franchiseShift.out === 0);
  const sep = await run('2026-09', rows, [{ category: '기타출금', total: 1750 }]);
  ok('9월: 9/1 수수료는 빠지고 9/30 + 10/2 = 1000', cat(sep, '지사수수료') === 1000);
  ok('9월: 9/1 이라도 지사수수료가 아니면 9월에 남는다(50)', cat(sep, '기타출금') === 50);
  ok('9월: 이동분 in 300 · out 1000', sep.franchiseShift.in === 300 && sep.franchiseShift.out === 1000);
  const oct = await run('2026-10', rows, [{ category: '기타출금', total: 1306 }]);
  ok('10월: 10/2 수수료는 9월로 가고 10/5 만 남는다(999)', cat(oct, '지사수수료') === 999);
  ok('10월: 다음 달 초가 아닌 다른 출금(SMS 7)은 그대로', cat(oct, '기타출금') === 7);
  const tot = [aug, sep, oct].reduce((a, r) => a + cat(r, '지사수수료'), 0);
  ok('짝: 석 달 합계는 그대로(옮겨질 뿐 사라지거나 두 번 세지 않음) 1100+1000+999', tot === 3099);
  const jul = await run('2026-07', rows, []);
  ok('짝: 그 달에 기타출금이 없어도 다음 달 초 수수료는 없으면 0', cat(jul, '지사수수료') === 0);
} catch (e) { fail++; console.log('  ❌ FAIL 실행 실패 ' + e.message); }
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
