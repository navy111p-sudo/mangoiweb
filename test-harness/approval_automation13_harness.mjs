#!/usr/bin/env node
/**
 * 📅🧾📤 결재 자동화 13단계 (2026-09-25) — 회계장부: 지난달 탭 · 분류별 소계 · 장부 그대로 엑셀
 *
 * 무엇을 지키나
 *   ① ledgerRange — 기간은 서버가 KST «오늘» 로 정한다(이번 달·지난달·최근 12개월). 모르는 이름은 null(지어내지 않음).
 *   ② ledgerFrom.by_category — 통화+분류 한 칸 · 통화를 넘어 합치지 않는다 · 소계 합 == 총계(짝) · «분류 없음» 은 맨 뒤.
 *   ③ 서버 배선 — period 는 ledger 일 때만 · 엑셀은 ledger 갈래 «안»(canView 를 지난 items) ·
 *      ledgerCsvResponse 를 오려 내 실제로 돌려 BOM·수식차단·통화별 합계·«빠진 것» 적기를 본다.
 *   ④ 화면 — 날짜를 화면이 세지 않는다(period 이름만) · 엑셀이 화면과 같은 주소를 쓴다 · 세 탭.
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
const fnAt = (src, i) => src.slice(i, src.indexOf('{', i)) + bodyAt(src, i);

console.log('\n① ledgerRange');
try {
  const R = P.ledgerRange;
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok('이번 달 = 1일~말일', eq(R('month', '2026-09-25'), { from: '2026-09-01', to: '2026-09-30' }), JSON.stringify(R('month', '2026-09-25')));
  ok('지난달 = 지난달 1일~말일', eq(R('last_month', '2026-09-25'), { from: '2026-08-01', to: '2026-08-31' }));
  ok('1월의 지난달은 작년 12월', eq(R('last_month', '2026-01-10'), { from: '2025-12-01', to: '2025-12-31' }));
  ok('3월의 지난달은 2월 말일까지(윤년 아님)', eq(R('last_month', '2026-03-05'), { from: '2026-02-01', to: '2026-02-28' }));
  ok('최근 1년 = 1년 전 다음날 ~ 오늘', eq(R('year', '2026-09-25'), { from: '2025-09-26', to: '2026-09-25' }), JSON.stringify(R('year', '2026-09-25')));
  ok('최근 1년은 연초에도 비지 않는다(«올해» 가 아님)', R('year', '2026-01-02').from === '2025-01-03');
  ok('모르는 이름이면 null(지어내지 않음)', R('quarter', '2026-09-25') === null && R('', '2026-09-25') === null && R(null, '2026-09-25') === null);
  ok('오늘 형식이 깨지면 null', R('month', '2026/09/25') === null && R('month', '') === null);
} catch (e) { ok('ledgerRange 실행', false, e.message); }

console.log('\n② ledgerFrom.by_category');
try {
  const at = s => Date.parse(s + 'T10:00:00+09:00');
  const L = P.ledgerFrom([
    { id: 1, status: 'approved', amount: 500, currency: 'PHP', created_at: at('2026-09-03'), category: 'office', category_ko: '사무용품', category_en: 'Office' },
    { id: 2, status: 'approved', amount: 1500, currency: 'PHP', created_at: at('2026-09-04'), category: 'office', category_ko: '사무용품', category_en: 'Office' },
    { id: 3, status: 'approved', amount: 3000, currency: 'PHP', created_at: at('2026-09-05'), category: 'meal', category_ko: '식비', category_en: 'Meals' },
    { id: 4, status: 'approved', amount: 9000, currency: 'PHP', created_at: at('2026-09-06') },                     // 분류 없음(가장 큰 돈)
    { id: 5, status: 'approved', amount: 20000, currency: 'KRW', created_at: at('2026-09-06'), category: 'office', category_ko: '사무용품' },
    { id: 6, status: 'pending', amount: 777, currency: 'PHP', created_at: at('2026-09-07'), category: 'office', category_ko: '사무용품' },
    { id: 7, status: 'approved', amount: 888, currency: 'PHP', reverses_id: 1, created_at: at('2026-09-07'), category: 'office' },
  ]);
  const C = L.by_category || [];
  const find = (cur, key) => C.find(c => c.cur === cur && c.key === key);
  ok('같은 통화·같은 분류는 한 칸', find('PHP', 'office') && find('PHP', 'office').sum === 2000 && find('PHP', 'office').n === 2, JSON.stringify(C));
  ok('통화가 다르면 같은 분류도 다른 칸(합치지 않음)', find('KRW', 'office') && find('KRW', 'office').sum === 20000);
  ok('대기·취소결재는 소계에 안 든다', !C.some(c => c.sum === 2777 || c.sum === 2888));
  let pairOk = true;
  for (const t of L.totals) {
    const s = C.filter(c => c.cur === t.cur).reduce((a, c) => a + c.sum, 0);
    const n = C.filter(c => c.cur === t.cur).reduce((a, c) => a + c.n, 0);
    if (Math.abs(s - t.sum) > 0.001 || n !== t.n) pairOk = false;
  }
  ok('짝: 통화마다 소계의 합 == 총계(건수까지)', pairOk && L.totals.length === 2, JSON.stringify(L.totals));
  const php = C.filter(c => c.cur === 'PHP');
  ok('분류 없음은 맨 뒤(금액이 가장 커도)', php.length === 3 && php[php.length - 1].key === '' && php[php.length - 1].sum === 9000, JSON.stringify(php));
  ok('분류 있는 것은 큰 돈 먼저', php[0].key === 'meal' && php[1].key === 'office');
  ok('분류 없음은 이름을 지어내지 않는다(ko·en null)', php[2].ko === null && php[2].en === null);
  ok('통화 순서가 총계와 같다', C.map(c => c.cur).join() === 'KRW,PHP,PHP,PHP');
  ok('빈 입력에도 배열', Array.isArray(P.ledgerFrom([]).by_category) && P.ledgerFrom(null).by_category.length === 0);
} catch (e) { ok('by_category 실행', false, e.message); }

console.log('\n③ 서버 배선');
try {
  const code = strip(API);
  const ri = code.indexOf('ledgerRange(url.searchParams.get(');
  ok('전제: 기간 정하기를 찾았다', ri > 0);
  const guard = code.lastIndexOf('if (ledger) {', ri);
  ok('period 는 ledger 일 때만 본다(다른 목록 from/to 는 그대로)', guard > 0 && ri - guard < 220);
  ok('정해진 기간을 from/to 에 실제로 넣는다', /if \(rg\) \{ from = rg\.from; to = rg\.to; \}/.test(code));
  const bq = code.indexOf('buildFindQuery({', ri);
  ok('기간은 조회 조건을 만들기 «앞» 에서 정한다', bq > ri);
  const li = code.indexOf('const L = ledgerFrom(');
  const blk = bodyAt(code, code.lastIndexOf('if (ledger) {', li));
  ok('엑셀은 장부 갈래 «안»(canView 를 지난 items 로)', /const L = ledgerFrom\(items\);/.test(blk) && /if \(csv\) return ledgerCsvResponse\(L,/.test(blk));
  ok('엑셀이 json 보다 먼저', blk.indexOf('ledgerCsvResponse') < blk.indexOf('return json('));
  ok('엑셀에 잘림·결재선 누락을 넘긴다', /truncated: hasMore/.test(blk.slice(blk.indexOf('ledgerCsvResponse'))) && /stepsMissing/.test(blk.slice(blk.indexOf('ledgerCsvResponse'))));
  ok('화면 응답에 by_category 를 싣는다', /by_category: L\.by_category/.test(blk));

  // ledgerCsvResponse 를 오려 내 실제로 돌린다
  const fi = API.indexOf('function ledgerCsvResponse(');
  const ci = API.indexOf('function csvCell(');
  const wi = API.indexOf('function csvWhen(');
  const tsStrip = t => t.replace(/\(L: ReturnType<typeof ledgerFrom>,\s*o: \{[^}]*\}\): Response/, '(L, o)')
                        .replace(/\(v: any\): string/, '(v)').replace(/\(ms: any\): string/, '(ms)')
                        .replace(/\(x: number\)/g, '(x)').replace(/const lines: string\[\] = \[\];/, 'const lines = [];')
                        .replace(/\(a: any\[\]\)/g, '(a)').replace(/const notes: string\[\] = \[\];/, 'const notes = [];');
  const src = tsStrip(fnAt(API, ci)) + '\n' + tsStrip(fnAt(API, wi)) + '\n' + tsStrip(API.slice(fi, API.indexOf('): Response {', fi) + 12) + bodyAt(API, API.indexOf('): Response {', fi))) + '\nreturn ledgerCsvResponse;';
  // ⚠️ fnAt(첫 «{») 를 쓰지 않는다 — 인자 타입 `o: { … }` 의 중괄호를 몸통으로 잡는다(CLAUDE.md 2장).
  const run = new Function(src)();
  const at = s => Date.parse(s + 'T10:00:00+09:00');
  const L = P.ledgerFrom([
    { id: 1, status: 'approved', amount: 500, currency: 'PHP', created_at: at('2026-08-03'), title: '=SUM(A1)', requester_name: 'Karl', category: 'office', category_ko: '사무용품' },
    { id: 2, status: 'approved', amount: 20000, currency: 'KRW', created_at: at('2026-08-04'), title: 'box', requester_name: '장' },
    { id: 3, status: 'pending', amount: 700, currency: 'PHP', created_at: at('2026-08-05') },
  ]);
  const res = run(L, { from: '2026-08-01', to: '2026-08-31', truncated: true, max: 2000, stepsMissing: false });
  // ⚠️ Response.text() 는 BOM 을 벗겨 준다 — 바이트로 봐야 한다.
  const bytes = new Uint8Array(await res.arrayBuffer());
  const body = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  ok('BOM 으로 시작(한글 엑셀)', bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF);
  ok('수식 차단 — =로 시작하는 제목은 글자로', body.includes('"\'=SUM(A1)"'));
  ok('통화별 합계가 따로 있다', /"합계","","1건","","","PHP","500"/.test(body) && /"합계","","1건","","","KRW","20000"/.test(body), body.slice(0, 400));
  ok('분류별 소계와 «분류 없음»', body.includes('"사무용품","","PHP","500"') && body.includes('"분류 없음","","KRW","20000"'));
  ok('대기 건은 줄로 안 넣고 «빠졌다» 고 적는다', !body.includes('"700"') && body.includes('결재 대기 1건'));
  ok('잘렸으면 파일에도 적는다', body.includes('앞 2000건만'));
  ok('기간이 파일에 적힌다', body.includes('2026-08-01 ~ 2026-08-31'));
  ok('파일 이름에 기간', /ledger-2026-08-01_2026-08-31\.csv/.test(res.headers.get('Content-Disposition') || ''));
  ok('중간 캐시 금지', res.headers.get('Cache-Control') === 'private, no-store');
  const res2 = run(L, { from: '2026-08-01', to: '2026-08-31', truncated: false, max: 2000, stepsMissing: false });
  ok('짝: 안 잘렸으면 «잘렸다» 고 안 적는다', !(await res2.text()).includes('앞 2000건만'));
} catch (e) { ok('서버 배선 실행', false, e.message); }

console.log('\n④ 화면');
try {
  const W = strip(WORK);
  const qb = fnAt(W, W.indexOf('function ledQuery('));
  ok('전제: ledQuery 를 찾았다', qb.length > 20);
  ok('기간은 «이름» 만 보낸다(period)', /'&period=' \+ encodeURIComponent\(per\)/.test(qb));
  ok('화면이 날짜를 세지 않는다(from= 을 안 만든다 · ledFrom 없음)', !/from=/.test(qb) && !/function ledFrom\(/.test(W));
  const rb = fnAt(W, W.indexOf('function runLed('));
  ok('장부 조회가 ledQuery 를 쓴다', /ledQuery\(per\)/.test(rb));
  const cb = W.slice(W.indexOf('window.ledCsv'), W.indexOf('\n', W.indexOf('window.ledCsv')));
  ok('엑셀이 화면과 같은 주소 + format=csv', /ledQuery\(LED\.per\) \+ '&format=csv'/.test(cb), cb);
  const pb = fnAt(W, W.indexOf('window.ledPer = function('));
  const LEDo = { per: 'month', data: { month: null, last_month: {}, year: null } };
  let ran = '';
  new Function('LED', 'LED_PERS', 'paintLed', 'runLed', 'return ' + pb.replace(/^window\.ledPer = /, ''))(LEDo, ['month', 'last_month', 'year'], () => { ran = 'paint'; }, (p) => { ran = 'run:' + p; })('last_month');
  ok('지난달 탭을 누르면 지난달로(받아 둔 것이 있으면 다시 안 부른다)', LEDo.per === 'last_month' && ran === 'paint', ran);
  new Function('LED', 'LED_PERS', 'paintLed', 'runLed', 'return ' + pb.replace(/^window\.ledPer = /, ''))(LEDo, ['month', 'last_month', 'year'], () => { ran = 'paint'; }, (p) => { ran = 'run:' + p; })('bogus');
  ok('모르는 탭 이름은 이번 달로', LEDo.per === 'month' && ran === 'run:month', ran);
  ok('탭 셋(이번 달·지난달·최근 1년)', /tab\('month'[^)]*\) \+ tab\('last_month'[^)]*\) \+ tab\('year'/.test(W));
  ok('분류별 소계는 접어 둔다(장부 줄을 밀어내지 않게)', /<details class="ledcats">/.test(W));
} catch (e) { ok('화면 실행', false, e.message); }

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
