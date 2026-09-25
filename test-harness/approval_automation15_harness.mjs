#!/usr/bin/env node
/**
 * 📊 결재 자동화 15단계 (2026-09-25) — 결재 지출 분석: 요약 · 사람별 · 지난 기간과 비교 · 가게·큰 지출
 *
 * 사장님 「결재함에 올라온 것들을 전체·사람별·기간별 등으로 분석한 간단 장부 — 손익은 아니고 지출, 비용 분석」
 *   → 샘플 4가지 중 추천안(A 요약 + B·C·D 탭) 「추천한 것으로 진행해」
 *
 * 무엇을 지키나
 *   ① spendAnalysis — 장부와 «같은 돈» 만 센다(짝: 사람별 합 == 가게별+가게모름 합 == 달별 합 == 장부 총계).
 *      통화를 섞지 않는다 · 사람은 아이디로 묶는다(동명이인) · 가게는 vendorKey 로 묶는다 · 큰 지출은 통화마다 5건.
 *   ② ledgerPrevRange — 바로 앞 기간(지난달·그 전달·그 앞 1년). 모르면 null.
 *   ③ compareSpend — 경고는 «금액 차이 ≥ 최소 + 50% 이상(또는 새로 생김)» 일 때만, 경고 먼저 · 차이 큰 순.
 *   ④ 서버 배선 — 앞 기간도 같은 거르기(canView) · 못 읽으면 compare null · 엑셀은 추가 조회 없이 먼저 돌아감.
 *   ⑤ 화면 — 서버가 센 것을 그리기만 · 비교 못 하면 «못 함» 이라고 말함(0원 아님) · 막대는 같은 통화 안에서만.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {
  const s = src.indexOf('{', i); if (s < 0 || i < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
// ⚠️ TS 는 반환 타입에 «{» 가 먼저 나온다 — 몸통은 «선언 줄 끝의 {» 부터 짝을 센다.
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const b = src.indexOf('{\n', i); return src.slice(i, b) + bodyAt(src, b); };

const at = s => Date.parse(s + 'T10:00:00+09:00');
const ROWS = [
  { id: 1, req_type: 'purchase', status: 'approved', amount: 500,  currency: 'PHP', created_at: at('2026-09-03'), category: 'supplies', category_ko: '사무', requester_username: 'mai',  requester_name: 'Mai',  vendor: 'National Book Store' },
  { id: 2, req_type: 'purchase', status: 'approved', amount: 1500, currency: 'PHP', created_at: at('2026-08-20'), category: 'meal',     category_ko: '식대', requester_username: 'mai',  requester_name: 'Mai',  vendor: 'national  book-store!' },
  { id: 3, req_type: 'expense',  status: 'approved', amount: 700,  currency: 'PHP', created_at: at('2026-09-10'), category: 'transport',category_ko: '교통', requester_username: 'karl', requester_name: 'Karl', vendor: 'Grab' },
  { id: 4, req_type: 'expense',  status: 'approved', amount: 300,  currency: 'PHP', created_at: at('2026-09-11'), category: '',          requester_username: 'mai2', requester_name: 'Mai',  vendor: '' },   // 동명이인
  { id: 5, req_type: 'expense',  status: 'approved', amount: 30000,currency: 'KRW', created_at: at('2026-09-12'), category: 'meal',      requester_username: 'karl', requester_name: 'Karl', vendor: 'Grab' },
  { id: 6, req_type: 'expense',  status: 'pending',  amount: 9999, currency: 'PHP', created_at: at('2026-09-12'), category: 'meal',      requester_username: 'karl', requester_name: 'Karl', vendor: 'Grab' },
  { id: 7, req_type: 'expense',  status: 'approved', amount: 8888, currency: 'PHP', created_at: at('2026-09-12'), category: 'meal', reverses_id: 3, requester_username: 'karl', vendor: 'Grab' },
  { id: 8, req_type: 'leave',    status: 'approved', amount: null, currency: 'PHP', created_at: at('2026-09-12'), requester_username: 'karl' },
  { id: 9, req_type: 'expense',  status: 'approved', amount: null, currency: 'PHP', created_at: at('2026-09-12'), requester_username: 'karl' },
];

console.log('\n① spendAnalysis');
try {
  const A = P.spendAnalysis(ROWS), L = P.ledgerFrom(ROWS);
  const sumBy = (list, cur) => Math.round(list.filter(x => x.cur === cur).reduce((a, x) => a + x.sum, 0) * 100) / 100;
  const nBy = (list, cur) => list.filter(x => x.cur === cur).reduce((a, x) => a + x.n, 0);
  let pairs = true;
  for (const t of L.totals) {
    if (sumBy(A.by_person, t.cur) !== t.sum || nBy(A.by_person, t.cur) !== t.n) pairs = false;
    if (sumBy(A.by_vendor, t.cur) + sumBy(A.no_vendor, t.cur) !== t.sum) pairs = false;
    if (sumBy(A.by_month, t.cur) !== t.sum) pairs = false;
  }
  ok('짝: 사람별 · 가게별+가게모름 · 달별 합이 장부 총계와 같다(통화마다, 건수까지)', pairs && L.totals.length === 2, JSON.stringify(L.totals));
  ok('대기·취소결재·금액없음은 안 센다', !A.top.some(t => [6, 7, 8, 9].includes(t.id)) && L.pending === 1 && L.no_amount === 2, JSON.stringify(A.by_person));
  const php = A.by_person.filter(p => p.cur === 'PHP');
  ok('사람은 아이디로 묶는다(이름이 같아도 다른 사람)', php.filter(p => p.who === 'Mai').length === 2 && php.find(p => p.user === 'mai').sum === 2000);
  ok('통화가 다르면 같은 사람도 다른 줄', A.by_person.some(p => p.user === 'karl' && p.cur === 'KRW' && p.sum === 30000) && A.by_person.some(p => p.user === 'karl' && p.cur === 'PHP' && p.sum === 700));
  ok('사람별 항목칸(cats)의 합 == 그 사람 합', A.by_person.every(p => Math.abs(Object.values(p.cats).reduce((a, b) => a + b, 0) - p.sum) < 0.001));
  ok('항목 없는 돈은 key "" 칸으로(장부 소계와 같은 열쇠)', A.by_person.find(p => p.user === 'mai2').cats[''] === 300);
  ok('통화 안에서 큰 돈 먼저', php[0].user === 'mai');
  const nbs = A.by_vendor.find(v => v.key === 'nationalbookstore');
  ok('가게는 표기가 달라도 한 칸(vendorKey)', nbs && nbs.sum === 2000 && nbs.n === 2 && nbs.name === 'National Book Store', JSON.stringify(A.by_vendor));
  ok('가게가 통화마다 따로', A.by_vendor.filter(v => v.key === 'grab').length === 2);
  ok('가게 이름 없는 돈은 «가게 모름» 으로 따로', A.no_vendor.length === 1 && A.no_vendor[0].sum === 300 && A.no_vendor[0].n === 1);
  ok('큰 지출은 통화마다 큰 순', A.top.filter(t => t.cur === 'PHP').map(t => t.id).join() === '2,3,1,4' && A.top.filter(t => t.cur === 'KRW').length === 1);
  const many = Array.from({ length: 9 }, (_, i) => ({ id: 100 + i, req_type: 'expense', status: 'approved', amount: 10 + i, currency: 'PHP', created_at: at('2026-09-01'), requester_username: 'x' }));
  ok('큰 지출은 통화마다 최대 ' + P.SPEND_TOP_N + '건', P.spendAnalysis(many).top.length === P.SPEND_TOP_N && P.spendAnalysis(many).top[0].amount === 18);
  ok('달별은 KST 달로 · 오래된 달 먼저', A.by_month.filter(m => m.cur === 'PHP').map(m => m.month).join() === '2026-08,2026-09');
  ok('빈 입력에도 빈 칸들', JSON.stringify(P.spendAnalysis(null)) === JSON.stringify({ by_person: [], by_vendor: [], no_vendor: [], top: [], by_month: [] }));
  ok('판정 정본은 하나(ledgerFrom 도 ledgerSpendState 를 쓴다)', /const st = ledgerSpendState\(r\);/.test(fnSrc(readFileSync(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts'), 'utf8'), 'ledgerFrom')));
  ok('상태 판정', P.ledgerSpendState(ROWS[0]) === 'ok' && P.ledgerSpendState(ROWS[5]) === 'pending' && P.ledgerSpendState(ROWS[8]) === 'no_amount' && P.ledgerSpendState(ROWS[7]) === 'no_amount' && P.ledgerSpendState(ROWS[6]) === null && P.ledgerSpendState(null) === null);
} catch (e) { ok('spendAnalysis 실행', false, e.stack); }

console.log('\n② ledgerPrevRange');
try {
  const R = P.ledgerPrevRange, eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok('이번 달 → 지난달', eq(R('month', '2026-09-25'), { from: '2026-08-01', to: '2026-08-31' }));
  ok('지난달 → 그 전달', eq(R('last_month', '2026-09-25'), { from: '2026-07-01', to: '2026-07-31' }));
  ok('1월의 «지난달» 비교는 작년 11월', eq(R('last_month', '2026-01-10'), { from: '2025-11-01', to: '2025-11-30' }));
  ok('3월의 «이번 달» 비교는 2월 말일까지', eq(R('month', '2026-03-05'), { from: '2026-02-01', to: '2026-02-28' }));
  ok('최근 1년 → 그 앞 1년(겹치지 않고 이어짐)', eq(R('year', '2026-09-25'), { from: '2024-09-26', to: '2025-09-25' }) && P.ledgerRange('year', '2026-09-25').from === '2025-09-26');
  ok('모르는 이름·깨진 날짜는 null', R('quarter', '2026-09-25') === null && R('month', '2026/09/25') === null && R(null, '2026-09-25') === null);
} catch (e) { ok('ledgerPrevRange 실행', false, e.message); }

console.log('\n③ compareSpend');
try {
  const cat = (cur, key, sum) => ({ cur, key, ko: key || null, en: key || null, sum, n: 1 });
  const now = { totals: [{ cur: 'PHP', sum: 13300 }, { cur: 'KRW', sum: 60000 }], by_category: [cat('PHP', 'meal', 5300), cat('PHP', 'supplies', 7800), cat('PHP', 'new', 200), cat('KRW', 'meal', 60000)] };
  const prev = { totals: [{ cur: 'PHP', sum: 10250 }, { cur: 'KRW', sum: 50000 }], by_category: [cat('PHP', 'meal', 2650), cat('PHP', 'supplies', 7200), cat('PHP', 'gone', 400), cat('KRW', 'meal', 50000)] };
  const C = P.compareSpend(now, prev);
  const f = (cur, key) => C.rows.find(r => r.cur === cur && r.key === key);
  ok('두 배로 늘고 차이가 크면 경고', f('PHP', 'meal').flag === true && f('PHP', 'meal').pct === 100 && f('PHP', 'meal').diff === 2650);
  ok('늘었지만 50% 미만이면 경고 안 함(짝)', f('PHP', 'supplies').flag === false && f('PHP', 'supplies').pct === 8);
  ok('새로 생겼어도 금액이 작으면 경고 안 함', f('PHP', 'new').flag === false && f('PHP', 'new').pct === null);
  ok('앞 기간에만 있던 항목도 남긴다(0으로 줄었다)', f('PHP', 'gone') && f('PHP', 'gone').now === 0 && f('PHP', 'gone').diff === -400);
  ok('원화는 원화 기준(₩10,000 차이는 경고 아님)', f('KRW', 'meal').flag === false && f('KRW', 'meal').pct === 20);
  const big = P.compareSpend({ totals: [], by_category: [cat('PHP', 'x', 1500)] }, { totals: [], by_category: [] });
  ok('앞 기간이 0 이고 차이가 크면 경고', big.rows[0].flag === true && big.rows[0].pct === null);
  const drop = P.compareSpend({ totals: [], by_category: [cat('PHP', 'x', 100)] }, { totals: [], by_category: [cat('PHP', 'x', 5000)] });
  ok('줄어든 것은 경고 안 함', drop.rows[0].flag === false && drop.rows[0].pct === -98);
  ok('모르는 통화는 경고 안 함', P.compareSpend({ totals: [], by_category: [cat('USD', 'x', 99999)] }, { totals: [], by_category: [] }).rows[0].flag === false);
  const php = C.rows.filter(r => r.cur === 'PHP');
  ok('경고 먼저, 그다음 차이가 큰 순', php[0].key === 'meal' && php[1].key === 'supplies' && php[2].key === 'gone');
  ok('통화를 섞지 않는다(통화 순서로 묶임)', C.rows.map(r => r.cur).join() === 'KRW,PHP,PHP,PHP,PHP');
  ok('총계 비교도 통화마다', C.totals.length === 2 && C.totals.find(t => t.cur === 'PHP').diff === 3050);
  ok('빈 입력에도 빈 결과', JSON.stringify(P.compareSpend(null, null)) === JSON.stringify({ totals: [], rows: [] }));
} catch (e) { ok('compareSpend 실행', false, e.stack); }

console.log('\n④ 서버 배선');
try {
  const code = strip(API);
  const li = code.indexOf('const L = ledgerFrom(items);');
  const blk = bodyAt(code, code.lastIndexOf('if (ledger) {', li));
  ok('전제: 장부 갈래를 찾았다', li > 0 && blk.length > 500);
  const ci = blk.indexOf('if (csv) return ledgerCsvResponse(');
  ok('엑셀은 앞 기간 조회 «전» 에 돌아간다(추가 조회 없음)', ci > 0 && ci < blk.indexOf('ledgerPrevRange('));
  ok('앞 기간은 정본 ledgerPrevRange 로', /const pr = ledgerPrevRange\(url\.searchParams\.get\('period'\), todayKst\);/.test(blk));
  ok('앞 기간도 같은 조건 조립(buildFindQuery, 기간만 바꿈)', /buildFindQuery\(\{ scope, me, q, type: fType, status: fStat, category: fCat, from: pr\.from, to: pr\.to, decidedBy: fBy \}\)/.test(blk));
  ok('앞 기간도 같은 거르기(canView) — 인사·급여가 섞이지 않게', /if \(!canView\(actor, r\.req_type, r\.requester_username, chainUsers\(st2\), ph\)\) continue;/.test(blk));
  ok('비교는 거른 것(items2)으로', /compare = compareSpend\(L, ledgerFrom\(items2\)\);/.test(blk));
  ok('못 읽으면 compare null(0원으로 안 그림)', /catch \{ compare = null; prev = null; \}/.test(blk));
  ok('분석은 canView 를 지난 items 로', /analysis: spendAnalysis\(items\)/.test(blk) && !/spendAnalysis\(page\)/.test(blk));
  ok('앞 기간도 잘림·결재선 누락을 말한다', /truncated: more2/.test(blk) && /steps_missing: page2\.length > 0/.test(blk));
  ok('목록 행에 가게 이름을 싣는다', /vendor: r\.vendor \|\| null,/.test(code));
  ok('기간 기준일은 KST 하나(todayKst)', /const todayKst = new Date\(Date\.now\(\) \+ 9 \* 3600_000\)/.test(code) && /ledgerRange\(url\.searchParams\.get\('period'\), todayKst\)/.test(code));
} catch (e) { ok('서버 배선', false, e.message); }

console.log('\n⑤ 화면');
try {
  const W = WORK;
  const names = ['ledCatName', 'ledBars', 'ledCurs', 'ledOf', 'ledPct', 'ledPrevName', 'ledSumHtml', 'ledPeopleHtml', 'ledCmpHtml', 'ledShopHtml'];
  const srcs = names.map(n => fnSrc(W, n));
  ok('전제: 그리는 함수 10개를 찾았다', srcs.every(x => x.length > 20), names.filter((n, i) => srcs[i].length <= 20).join());
  const LEDo = { per: 'month' };
  const env = {
    LED: LEDo, EN: () => false, T: (en, ko) => ko, esc: s => String(s),
    money: (v, c) => (c === 'KRW' ? '₩' : '₱') + Number(v).toLocaleString('en-US'),
  };
  const make = () => new Function(...Object.keys(env), srcs.join('\n') + '\nreturn {' + names.join(',') + '};')(...Object.values(env));
  const F = make();
  const L = P.ledgerFrom(ROWS), A = P.spendAnalysis(ROWS);
  const prev = P.ledgerFrom([{ ...ROWS[0], id: 50, amount: 100 }]);
  const d = { totals: L.totals, by_category: L.by_category, pending: L.pending, analysis: A,
              compare: P.compareSpend(L, prev), prev: { from: '2026-08-01', to: '2026-08-31', truncated: false } };
  const sum = F.ledSumHtml(d, A);
  ok('요약: 통화마다 승인 합계', /₱3,000/.test(sum) && /₩30,000/.test(sum), sum.slice(0, 300));
  ok('요약: 지난 기간 대비를 말한다', /지난달 ₱100/.test(sum) && /▲/.test(sum));
  ok('요약: 대기 건수(합계에 안 넣음)', /아직 대기 중/.test(sum) && /1건/.test(sum));
  ok('요약: 달이 둘 이상이면 달별 막대', /달별 · PHP/.test(sum) && /2026-08/.test(sum));
  ok('요약: 한 달뿐인 통화는 달별을 안 그린다', !/달별 · KRW/.test(sum));
  const noCmp = F.ledSumHtml({ ...d, compare: null }, A);
  ok('요약: 비교를 못 했으면 «비교 못 함»(0원 아님)', /비교 못 함/.test(noCmp) && !/지난달 ₱0/.test(noCmp));
  const ppl = F.ledPeopleHtml(d, A);
  ok('사람별: 통화마다 표 하나', (ppl.match(/<table/g) || []).length === 2);
  ok('사람별: 동명이인이 두 줄', (ppl.match(/<td>Mai<\/td>/g) || []).length === 2);
  ok('사람별: 합계 줄이 장부 총계', /<tfoot><tr><td>합계<\/td>[\s\S]*₱3,000/.test(ppl));
  ok('사람별: 빈 칸은 —', /ledz/.test(ppl));
  const cmp = F.ledCmpHtml(d);
  ok('비교: 비교 기간을 적는다', /2026-08-01 ~ 2026-08-31/.test(cmp));
  ok('비교: 크게 늘어난 항목을 위에 띄운다', /ledflag/.test(F.ledCmpHtml({ ...d, compare: P.compareSpend(P.ledgerFrom([{ ...ROWS[1], created_at: at('2026-09-01'), amount: 6000 }]), P.ledgerFrom([ROWS[1]])) })));
  ok('비교: 못 읽었으면 «불러오지 못했습니다»', /불러오지 못했습니다/.test(F.ledCmpHtml({ ...d, compare: null })));
  LEDo.per = 'year';
  ok('비교: 기간 이름을 따라간다(최근 1년 → 그 앞 1년)', /그 앞 1년/.test(F.ledCmpHtml(d)));
  LEDo.per = 'month';
  const shop = F.ledShopHtml(A);
  ok('가게: 가게별 막대 + 가게 모름', /National Book Store/.test(shop) && /가게 모름: ₱300/.test(shop));
  ok('가게: 큰 지출은 결재로 가는 링크', /href="\/work\?id=2"/.test(shop));
  ok('가게: 비었으면 «보여 줄 것이 없습니다»', /보여 줄 것이 없습니다/.test(F.ledShopHtml(null)));
  // 막대 — 같은 통화 안의 최대로 잰다
  const bars = F.ledBars([{ cur: 'PHP', sum: 50 }, { cur: 'PHP', sum: 100 }], x => 'n', 100);
  ok('막대 폭 = 같은 통화 최대 대비', /width:50%/.test(bars) && /width:100%/.test(bars));
  // 보기 이름
  const vb = W.slice(W.indexOf('window.ledView = function('), W.indexOf('};', W.indexOf('window.ledView = function(')) + 2);
  const LV = { view: 'sum' };
  new Function('LED', 'LED_VIEWS', 'paintLed', 'window', vb)(LV, ['sum', 'people', 'cmp', 'shop', 'list'], () => {}, { });
  ok('전제: ledView 를 찾았다', vb.length > 40);
  const run = v => { const w = {}; new Function('LED', 'LED_VIEWS', 'paintLed', 'window', vb)(LV, ['sum', 'people', 'cmp', 'shop', 'list'], () => {}, w); w.ledView(v); return LV.view; };
  ok('모르는 보기 이름은 요약으로', run('bogus') === 'sum' && run('shop') === 'shop');
  const pl = bodyAt(W, W.indexOf('function paintLed('));
  ok('다섯 보기 탭', /vt\('sum'[^)]*\) \+ vt\('people'[^)]*\) \+\s*vt\('cmp'[^)]*\) \+ vt\('shop'[^)]*\) \+ vt\('list'/.test(pl));
  ok('장부 목록(정렬 표)은 «장부 목록» 보기에서 그대로', pl.indexOf("if (LED.view !== 'list')") > 0 && pl.indexOf("if (LED.view !== 'list')") < pl.indexOf('sortBtn(\'date\''));
  ok('엑셀 버튼은 모든 보기에', pl.indexOf('ledCsv()') > 0 && pl.indexOf('ledCsv()') < pl.indexOf("if (LED.view !== 'list')"));
  ok('항목별 접힘 소계는 목록 보기에서만(요약 막대와 겹치지 않게)', /if \(cats\.length && LED\.view === 'list'\)/.test(pl));
  ok('보기 탭 색(밝은·어두운)', /\.ledvtab\.on\{/.test(W) && /html\.dark \.ledvtab\.on\{/.test(W));
  ok('화면이 시계로 날짜를 세지 않는다', !/new Date\(/.test(srcs.join('\n')));
} catch (e) { ok('화면 실행', false, e.stack); }

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
