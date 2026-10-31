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

// ── 📅 자료 온전성(coverageOf) — 다음 달 1~3일엔 지난달을 «확정» 이라 말하지 않는다 (2026-10-09)
// 함수 두 개를 소스에서 중괄호 짝으로 오려 내 시각을 넣어 «실제로» 돌린다.
function cutFn(name) {
  const i = s.indexOf('function ' + name + '(');
  if (i < 0) return '';
  // 인자 목록을 괄호 짝으로 건너뛴 뒤 첫 «{» 가 몸통 — «) {» 로 찾으면 본문의 if 가 먼저 걸린다
  let pd = 0, q = s.indexOf('(', i);
  for (; q < s.length; q++) { if (s[q] === '(') pd++; else if (s[q] === ')') { pd--; if (pd === 0) break; } }
  const b = s.indexOf('{', q); let d = 0, j = b;
  for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break; } }
  return s.slice(i, j + 1);
}
function stripTs(t) {
  // 시그니처: 괄호 짝으로 인자 목록을 잘라 «이름 = 기본값» 만 남기고 반환 타입은 버린다
  const o = t.indexOf('('); let d = 0, k = o;
  for (; k < t.length; k++) { if (t[k] === '(') d++; else if (t[k] === ')') { d--; if (d === 0) break; } }
  const parts = []; let cur = '', dd = 0;
  for (const ch of t.slice(o + 1, k)) {
    if ('({['.includes(ch)) dd++; else if (')}]'.includes(ch)) dd--;
    if (ch === ',' && dd === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const args = parts.map(x => { const m = x.match(/^\s*(\w+)[\s\S]*?(=\s*[\s\S]+)?$/); const def = x.match(/=\s*([\s\S]+)$/); return m[1] + (def ? ' = ' + def[1].trim() : ''); });
  const body = t.slice(t.indexOf('{', k));
  return t.slice(0, o) + '(' + args.join(', ') + ') ' + body
    .replace(/const (\w+): [^=]+=/g, 'const $1 =')
    .replace(/ as const/g, '');
}
const covSrc = cutFn('coverageOf'), srcSrc = cutFn('sourceCoverage');
ok('전제: coverageOf · sourceCoverage 를 오려 냈다', covSrc.length > 200 && srcSrc.length > 50);
let cov = null;
try {
  cov = new Function('ACCRUAL_SHIFT_DAY', 'currentMonth', stripTs(srcSrc) + '\n' + stripTs(covSrc) + '\nreturn coverageOf;')(
    dayM ? dayM[1] : '03', () => { throw new Error('currentMonth 를 부르면 시각 주입이 안 됨'); });
} catch (e) { console.log('    (오려 내기 실패) ' + e.message); }
ok('전제: coverageOf 를 만들었다', typeof cov === 'function');
const at = ymd => Date.parse(ymd + 'T12:00:00+09:00');
const ST = { bankFrom: '2026-06-01', cardFrom: '2026-06-01' };
const C = (p, d) => { try { return cov(p, ST, at(d)); } catch (e) { return { level: 'ERR:' + e.message, note: '' }; } };
ok('11/1 의 10월 → 확정 아님(지사수수료 대기)', C('2026-10', '2026-11-01').level === 'partial' && /지사 수수료/.test(C('2026-10', '2026-11-01').note));
ok('11/3 의 10월 → 아직 확정 아님(3일까지 포함)', C('2026-10', '2026-11-03').level === 'partial');
ok('짝: 11/4 의 10월 → 확정', C('2026-10', '2026-11-04').level === 'full');
ok('짝: 11/2 의 9월(지난지난달) → 확정', C('2026-09', '2026-11-02').level === 'full');
ok('짝: 10/9 의 10월 → «진행 중» 문구 그대로', /진행 중/.test(C('2026-10', '2026-10-09').note));
ok('짝: 1/2 의 전년 12월 → 확정 아님(해 넘김)', (() => { try { return cov('2025-12', { bankFrom: '2025-01-01', cardFrom: '2025-01-01' }, at('2026-01-02')).level === 'partial'; } catch (e) { return false; } })());
ok('짝: 통장 자료가 없는 달은 «지사수수료» 가 아니라 «자료 없음» 으로 말한다', C('2026-05', '2026-06-02').level === 'none');
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
