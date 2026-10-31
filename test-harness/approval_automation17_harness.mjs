#!/usr/bin/env node
/**
 * 🔎 결재 자동화 17단계 (2026-09-25) — 회계장부 «빠진 것 점검» 탭
 *
 * 무엇을 지키나
 *   ① repeatTitleKey — 숫자·달 이름만 빼고 같은 제목으로 본다(「9월 인터넷 요금」 == 「10월 인터넷 요금」), 다른 제목은 다르다.
 *   ② ledgerChecks 영수증 — 승인된 지출 중 requiresFile 분류만 · 파일 있으면 빼기 · 대기·되돌림은 빼기 · 금액 큰 순 · 20건 상한.
 *   ③ ledgerChecks 빠진 지출 — 같은 사람·분류·제목만 · 이번 기간 «대기 중» 도 올라온 것으로 · 앞 달 대기 건은 안 셈.
 *      ⛔ «확인 못 함» 을 «빠진 것 없음» 으로 말하지 않는다(missing_why: period·truncated·status·prev).
 *   ④ 서버 배선 — 앞 달 거른 것(items2)을 넘기고 · 못 읽으면 null · 잘림·상태 필터를 넘긴다 · 엑셀보다 뒤.
 *   ⑤ 화면 — 탭 · 건수 · 링크 · ✓ 와 «확인 못 함» 을 가른다 · 빈 장부에서도 빠진 것은 보여 준다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const POLICY = process.env.POLICY_SRC || join(SRC, 'approval-policy.ts');
const P = await import(pathToFileURL(POLICY).href);
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
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); return i < 0 ? '' : src.slice(i, src.indexOf('{', i)) + bodyAt(src, i); };

const T0 = Date.parse('2026-09-10T03:00:00Z');
let nid = 1;
const row = o => Object.assign({ id: nid++, req_type: 'expense', status: 'approved', amount: 1000, currency: 'PHP',
  requester_username: 'mgr_karl', requester_name: 'Karl', title: '인터넷 요금', created_at: T0, has_file: true }, o);

console.log('\n① repeatTitleKey');
try {
  const k = P.repeatTitleKey;
  ok('「9월 인터넷 요금」 == 「10월 인터넷 요금」', k('9월 인터넷 요금') === k('10월 인터넷 요금') && k('9월 인터넷 요금') === '인터넷 요금');
  ok('영어 달 이름·서수·기호도 뺀다', k('Internet bill - Sept 2026') === k('internet bill (October)') && k('Rent for 1st') === k('rent for 2nd'));
  ok('다른 제목은 다르다', k('인터넷 요금') !== k('전기 요금') && k('Water bill') !== k('Internet bill'));
  ok('빈 값은 빈 열쇠', k(null) === '' && k('') === '' && k('9월') === '');
} catch (e) { ok('① 실행', false, e.message); }

console.log('\n② 영수증 없이 승인된 지출');
try {
  nid = 1;
  const items = [
    row({ title: '영수증 있음' }),
    row({ title: '파일 있음(1)', has_file: 1, amount: 99999 }),
    row({ title: '영수증 없음 작은', has_file: false, amount: 500 }),
    row({ title: '영수증 없음 큰', has_file: 0, amount: 9000 }),
    row({ title: '구매 영수증 없음', req_type: 'purchase', has_file: false, amount: 700 }),
    row({ title: '대기 중', has_file: false, status: 'pending' }),
    row({ title: '되돌림', has_file: false, reverses_id: 3 }),
    row({ title: '문서(붙여도 되고 안 붙여도 됨)', req_type: 'doc', has_file: false }),
    row({ title: '원화 없음', has_file: false, amount: 3000, currency: 'KRW' }),
  ];
  const c = P.ledgerChecks(items, [], 'month');
  const t = c.no_receipt.map(r => r.title);
  ok('영수증 없는 승인 지출만(구매·정산)', c.no_receipt_n === 4 && t.includes('영수증 없음 작은') && t.includes('구매 영수증 없음') && t.includes('원화 없음'), JSON.stringify(t));
  ok('파일 있으면 빼기(true·1)', !t.includes('영수증 있음') && !t.includes('파일 있음(1)'));
  ok('대기·되돌림은 빼기', !t.includes('대기 중') && !t.includes('되돌림'));
  ok('일반 문서(requiresFile 아님)는 빼기', !t.some(x => x.startsWith('문서')));
  ok('통화별로 묶고 금액 큰 순', t[0] === '원화 없음' && t[1] === '영수증 없음 큰' && t[3] === '영수증 없음 작은', JSON.stringify(t));
  const r0 = c.no_receipt.find(r => r.title === '영수증 없음 큰');
  ok('줄 모양(id·날짜·사람·분류)', r0 && r0.id === 4 && r0.ymd === '2026-09-10' && r0.who === 'Karl' && r0.type_ko === '지출 정산' && r0.cur === 'PHP');
  const many = Array.from({ length: 25 }, (_, i) => row({ title: 'n' + i, has_file: false, amount: i + 1 }));
  const cm = P.ledgerChecks(many, [], 'month');
  ok('20건 상한 · 건수는 전부', cm.no_receipt.length === P.LEDGER_CHECK_MAX && P.LEDGER_CHECK_MAX === 20 && cm.no_receipt_n === 25);
} catch (e) { ok('② 실행', false, e.message); }

console.log('\n③ 지난달엔 있었는데 이번 달엔 아직 없는 지출');
try {
  nid = 100;
  const prev = [
    row({ title: '9월 인터넷 요금', amount: 2000 }),
    row({ title: '9월 전기 요금', amount: 5000 }),
    row({ title: '9월 전기 요금', amount: 5000 }),                                      // 같은 열쇠 둘 → 한 번만
    row({ title: '9월 물 요금', requester_username: 'mgr_melca', requester_name: 'Melca', amount: 800 }),
    row({ title: '9월 월세', amount: 30000 }),                                           // 이번 달엔 대기 중
    row({ title: '9월 가스', status: 'pending' }),                                       // 앞 달 대기 건은 안 셈
    row({ title: '9월', amount: 10 }),                                                    // 빈 열쇠는 안 셈
    row({ title: '9월 사무용품', req_type: 'purchase', amount: 900 }),                 // 분류 다름
  ];
  const items = [
    row({ title: '10월 인터넷 요금', amount: 2100 }),
    row({ title: '10월 물 요금', amount: 800 }),                                        // 사람 다름(Karl) → Melca 건은 빠짐
    row({ title: '10월 월세', status: 'pending' }),
    row({ title: '10월 사무용품', req_type: 'expense', amount: 900 }),                 // 분류가 달라 구매 건은 빠짐
  ];
  const c = P.ledgerChecks(items, prev, 'month');
  const t = c.missing.map(r => r.title + '|' + r.who);
  ok('확인함 표시', c.missing_known === true && c.missing_applies === true && c.missing_why === '');
  ok('빠진 것: 전기 요금(한 번)·Melca 물 요금·구매 사무용품', c.missing_n === 3 && t.includes('9월 전기 요금|Karl') && t.includes('9월 물 요금|Melca') && t.includes('9월 사무용품|Karl'), JSON.stringify(t));
  ok('숫자만 다른 같은 제목은 올라온 것', !t.some(x => x.startsWith('9월 인터넷')));
  ok('이번 기간 «대기 중» 도 올라온 것', !t.some(x => x.startsWith('9월 월세')));
  ok('앞 달 대기 건·빈 열쇠는 안 셈', !t.some(x => x.startsWith('9월 가스')) && !t.some(x => x === '9월|Karl'));
  ok('금액 큰 순(같은 통화)', t[0].startsWith('9월 전기'), JSON.stringify(t));
  ok('지난달 보기도 확인', P.ledgerChecks(items, prev, 'last_month').missing_known === true);
  const why = (p, pi, o) => { const x = P.ledgerChecks(items, pi, p, o); return x.missing_known + '/' + x.missing_why + '/' + x.missing_n; };
  ok('올해 보기는 확인 안 함(period)', why('year', prev) === 'false/period/0' && P.ledgerChecks(items, prev, 'year').missing_applies === false);
  ok('앞 달 못 읽음(null)은 prev — «없음» 이 아니다', why('month', null) === 'false/prev/0');
  ok('이번 기간이 잘렸으면 truncated', why('month', prev, { truncated: true }) === 'false/truncated/0');
  ok('상태 필터면 status', why('month', prev, { statusFiltered: true }) === 'false/status/0');
  ok('빈 앞 달은 확인함·0건', why('month', []) === 'true//0');
  const mp = Array.from({ length: 23 }, (_, i) => row({ title: '가게' + String.fromCharCode(65 + i), amount: 100 + i }));
  const cm = P.ledgerChecks([], mp, 'month');
  ok('빠진 지출도 20건 상한 · 건수는 전부', cm.missing.length === 20 && cm.missing_n === 23);
  ok('빈 입력에도 안 던짐', P.ledgerChecks(null, null, null).no_receipt_n === 0);
} catch (e) { ok('③ 실행', false, e.message); }

console.log('\n④ 서버 배선');
try {
  const code = strip(API);
  const li = code.indexOf('checks: ledgerChecks(');
  const blk = bodyAt(code, code.lastIndexOf('if (ledger) {', li));
  ok('전제: 장부 갈래를 찾았다', li > 0 && blk.length > 500);
  { const ii = API.search(/^\s*ledgerChecks,/m), fi = API.indexOf("from './approval-policy'", ii);
    ok('정본을 import(approval-policy 에서)', ii > 0 && fi > ii && !/\}\s*from\s*'/.test(API.slice(ii, fi))); }
  ok('응답에 checks — 이번 거른 것·앞 달·기간·잘림·상태 필터', /checks: ledgerChecks\(items, prevItems, url\.searchParams\.get\('period'\), \{ truncated: hasMore, statusFiltered: !!fStat \}\)/.test(blk));
  ok('앞 달은 거른 것(items2)을 넘긴다', /prevItems = items2;/.test(blk));
  ok('못 읽으면 prevItems 도 null', /catch \{[^}]*prevItems = null;[^}]*\}/.test(blk));
  ok('시작 값은 null(«없음» 아님)', /let prevItems: any\[\] \| null = null;/.test(blk));
  ok('엑셀이 먼저 돌아간다', blk.indexOf('if (csv) return') > 0 && blk.indexOf('if (csv) return') < blk.indexOf('ledgerChecks('));
} catch (e) { ok('④ 실행', false, e.message); }

console.log('\n⑤ 화면');
try {
  const W = WORK;
  const need = ['ledChkCount', 'ledChkRows', 'ledMissWhy', 'ledMissingHtml', 'ledChkHtml'];
  const srcs = need.map(n => fnSrc(W, n));
  ok('전제: 함수 다섯을 찾았다', srcs.every(s => s.length > 30), need.filter((n, i) => srcs[i].length <= 30).join(','));
  const mk = (lang, per) => new Function('LED', 'T', 'esc', 'lm', srcs.join('\n') + '\nreturn {' + need.join(',') + '};')(
    { per: per || 'month' }, (en, ko) => lang === 'en' ? en : ko, x => String(x).replace(/</g, '&lt;'), (v, c) => c + ':' + v);
  const F = mk('ko');
  const base = { no_receipt: [], no_receipt_n: 0, missing: [], missing_n: 0, missing_known: true, missing_applies: true, missing_why: '' };
  ok('건수 표시', F.ledChkCount({ checks: { ...base, no_receipt_n: 2, missing_n: 3 } }) === ' (5)' && F.ledChkCount({ checks: base }) === '' && F.ledChkCount({}) === '');
  const r1 = { id: 7, title: '<b>전기</b>', amount: 5000, cur: 'PHP', who: 'Karl', type_ko: '지출 정산', type_en: 'Expense', ymd: '2026-09-10' };
  const rows = F.ledChkRows([r1], 2);
  ok('줄: 결재 링크·환산 금액(lm)·사람·날짜·이스케이프', rows.includes('href="/work?id=7"') && rows.includes('PHP:5000') && rows.includes('Karl · 지출 정산 · 2026-09-10') && rows.includes('&lt;b>전기'));
  ok('상한 넘친 건수', rows.includes('외 2건') && !F.ledChkRows([r1], 0).includes('외'));
  const h0 = F.ledChkHtml({ checks: base });
  ok('둘 다 0이면 ✓ 두 줄', (h0.match(/✓/g) || []).length === 2);
  const hw = w => F.ledChkHtml({ checks: { ...base, missing_known: false, missing_applies: w !== 'period', missing_why: w } });
  ok('확인 못 한 때는 ✓ 를 안 그린다(영수증 ✓ 하나만)', ['period', 'prev', 'truncated', 'status'].every(w => (hw(w).match(/✓/g) || []).length === 1));
  ok('이유마다 다른 말', hw('period').includes('«이번 달»·«지난달»') && hw('prev').includes('불러오지 못해') && hw('truncated').includes('너무 많아') && hw('status').includes('상태 필터'));
  const hm = F.ledChkHtml({ checks: { ...base, missing: [r1], missing_n: 1 } });
  ok('빠진 것이 있으면 목록 + «한 번만 산 물건일 수도»', hm.includes('href="/work?id=7"') && hm.includes('한 번만 산 물건'));
  ok('점검 결과가 없으면 «하지 못했습니다»', F.ledChkHtml({}).includes('점검을 하지 못했습니다'));
  const FE = mk('en', 'last_month');
  const he = FE.ledChkHtml({ checks: { ...base, missing: [r1], missing_n: 1 } });
  ok('영어·지난달 제목', he.includes('not yet last month') && he.includes('Approved spending with no receipt') && FE.ledMissWhy({ missing_why: 'status' }).includes('status filter'));
  const pl = bodyAt(W, W.indexOf('function paintLed('));
  ok('탭: 가게 뒤·목록 앞에 «빠진 것 점검»(+건수)', /vt\('shop'[\s\S]*?vt\('chk', 'Check' \+ ledChkCount\(d\), '빠진 것 점검' \+ ledChkCount\(d\)\)[\s\S]*?vt\('list'/.test(pl));
  ok('탭 목록에 chk', /LED_VIEWS = \[[^\]]*'chk'[^\]]*\]/.test(W));
  ok('그 탭이 ledChkHtml 을 그린다', /LED\.view === 'chk'\)\s*\? ledChkHtml\(d\)/.test(pl));
  ok('빈 장부에서도 빠진 것은 보여 준다', /d\.checks && d\.checks\.missing_n \? ledMissingHtml\(d\.checks\) : ''/.test(pl));
  ok('화면에서 날짜·금액을 다시 재지 않는다', !/Date|getMonth|toFixed/.test(srcs.join('\n')));
} catch (e) { ok('⑤ 실행', false, e.message); }

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
