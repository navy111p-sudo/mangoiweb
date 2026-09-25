/*
 * 📒 결재함 회계장부 · 📷 카드 영수증 미리보기 (12단계, 2026-09-25) — 화면에서 실제로 그려지고 정렬되는가
 *
 *   [짝으로 본다]
 *     이번 달 ↔ 최근 1년(다른 from 으로 부른다) · 날짜 내림 ↔ 오름 · 금액 내림 ↔ 오름(통화끼리)
 *     결재 권한자는 scope=all ↔ 직원은 scope=mine · 못 불러오면 «못 불러왔다» 고 말한다
 *     결재할 사진 건에는 미리보기 ↔ PDF·내가 올린 건에는 없음
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-ledger-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약).
 */
import { requireBrowser, fileUrl } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');
const P = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                                          'cloudflare-deploy', 'src', 'approval-policy.ts')).href);
const TYPES = P.TYPES.map((t) => ({ key: t.key, ko: t.ko, en: t.en, needs_amount: t.needsAmount, wants_file: t.wantsFile,
  requires_file: !!t.requiresFile, wants_dates: !!t.wantsDates, wants_category: !!t.wantsCategory, picks_period: t.key === 'hr' }));
const CATS = P.CATEGORIES.map((c) => ({ key: c.key, ko: c.ko, en: c.en, account: c.account }));
const STATUSES = P.STATUSES.map((s) => ({ key: s.key, ko: s.ko, en: s.en }));
const now = Date.now(), DAY = 86400000;
const it = (id, over) => Object.assign({ id, req_type: 'expense', type_ko: '지출 정산', type_en: 'Expense', title: 'T' + id, body: '',
  amount: 1000, currency: 'PHP', requester_username: 'mgr_karl', requester_name: 'Karl', status: 'pending', status_ko: '대기',
  status_en: 'Pending', created_at: now - DAY, stage_seq: 1, stage_total: 1, flags: [],
  steps: [{ seq: 1, role: 'mgr', status: 'active' }], has_file: true, file_name: 'r.jpg', file_kind: 'image' }, over || {});
function home(over) {
  return Object.assign({ ok: true, me: { username: 'mgr_jjw', name: '장지웅', is_exec: false, is_ph_manager: false, is_teacher: false },
    colleagues: [], my_delegate: null, can_approve: true, pending: 2, types: TYPES, categories: CATS, statuses: STATUSES,
    inbox: [it(11), it(12, { file_kind: 'pdf', file_name: 'r.pdf' })], mine: [it(13, { requester_username: 'mgr_jjw' })],
    reuse: [], urgent: [] }, over || {});
}
// 서버 ledgerFrom 정본을 그대로 돌려 응답을 만든다(화면이 받는 모양을 손으로 적지 않는다)
const RAW = [
  { id: 1, status: 'approved', amount: 500,   currency: 'PHP', created_at: Date.parse('2026-09-03T10:00:00+09:00'), title: '잉크', requester_name: 'Karl', category_ko: '사무용품' },
  { id: 2, status: 'approved', amount: 12000, currency: 'PHP', created_at: Date.parse('2026-09-10T10:00:00+09:00'), title: '프린터', requester_name: 'Mai' },
  { id: 3, status: 'approved', amount: 30000, currency: 'KRW', created_at: Date.parse('2026-09-01T10:00:00+09:00'), title: '택배', requester_name: '정우영' },
  { id: 4, status: 'approved', amount: 2800,  currency: 'PHP', created_at: Date.parse('2026-09-20T10:00:00+09:00'), title: '인터넷', requester_name: 'Karl' },
  { id: 5, status: 'pending',  amount: 999,   currency: 'PHP', created_at: Date.parse('2026-09-21T10:00:00+09:00'), title: '대기' },
];
const L = P.ledgerFrom(RAW);
const LEDGER = { ok: true, ledger: L.rows, totals: L.totals, by_category: L.by_category, pending: L.pending, no_amount: L.no_amount, truncated: false, max: 2000, steps_missing: false, from: '2026-09-01', to: '2026-09-30' };

let PASS = 0, FAIL = 0;
const check = (n, c, x) => { if (c) { PASS++; console.log('  OK   ' + n); } else { FAIL++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  async function open(h, ledgerResp, width) {
    const ctx = await browser.newContext({ viewport: { width: width || 1100, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(({ h, lg }) => {
      try { localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {}
      window.__CALLS = [];
      const rf = window.fetch;
      window.fetch = function (u, o) {
        u = String(u); window.__CALLS.push(u);
        if (u.indexOf('/api/approval/home') === 0) return Promise.resolve(new Response(JSON.stringify(h), { status: 200 }));
        if (u.indexOf('/api/push/vapid-public-key') === 0) return Promise.resolve(new Response('{"ok":true,"key":""}', { status: 200 }));
        if (u.indexOf('view=ledger') >= 0) return lg === 'net' ? Promise.reject(new Error('x')) : Promise.resolve(new Response(JSON.stringify(lg), { status: lg && lg.ok ? 200 : 404 }));
        if (u.indexOf('/api/approval/requests') === 0) return Promise.resolve(new Response('{"ok":true,"items":[],"has_more":false,"offset":0,"facets":{}}', { status: 200 }));
        return rf(u, o);
      };
    }, { h, lg: ledgerResp });
    await page.goto(FILE, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    return { ctx, page, errors };
  }
  const col = (page, i) => page.evaluate((i) => Array.from(document.querySelectorAll('#ledResult tbody tr')).map((tr) => tr.children[i].textContent.trim()), i);

  console.log('\n[1] 자동으로 펼쳐져 있고 이번 달 장부가 나온다');
  let { ctx, page, errors } = await open(home(), LEDGER);
  const vis = await page.evaluate(() => { const p = document.getElementById('ledPanel'); const r = p.getBoundingClientRect(); return !p.hidden && r.height > 50; });
  check('장부 칸이 누르지 않아도 보인다', vis);
  const calls = await page.evaluate(() => window.__CALLS.filter((u) => u.indexOf('view=ledger') >= 0));
  check('홈을 부른 뒤 장부를 한 번 부른다', calls.length === 1, JSON.stringify(calls));
  check('결재 권한자라 scope=all', /scope=all/.test(calls[0] || ''));
  // 13단계(2026-09-25): 화면은 날짜를 세지 않고 기간 «이름» 만 보낸다 — 날짜는 서버(ledgerRange)가 KST 로 정한다.
  check('이번 달은 period=month 로 부른다(화면이 from 을 만들지 않는다)', /period=month(&|$)/.test(calls[0] || '') && !/from=/.test(calls[0] || ''), calls[0]);
  check('서버가 정한 기간을 그대로 보여 준다', /2026-09-01 ~ 2026-09-30/.test(await page.evaluate(() => document.getElementById('ledResult').textContent)));
  const sum = await page.evaluate(() => (document.querySelector('#ledResult .ledsum') || {}).textContent || '');
  check('통화별 합계 — ₱ 와 ₩ 를 섞지 않는다', /15,300/.test(sum) && /30,000/.test(sum) && /3건/.test(sum), sum);
  const notes = await page.evaluate(() => document.getElementById('ledResult').textContent);
  check('대기 1건은 빠졌다고 말한다', /결재 대기 1건은 빠져/.test(notes));
  let dates = await col(page, 0);
  check('기본은 날짜 최신순', dates.join(',') === '2026-09-20,2026-09-10,2026-09-03,2026-09-01', dates.join(','));

  console.log('\n[2] 날짜·금액 오름차순·내림차순');
  await page.click('#ledResult .ledsort >> nth=0'); await page.waitForTimeout(100);
  dates = await col(page, 0);
  check('날짜를 한 번 더 누르면 오래된순(오름차순)', dates.join(',') === '2026-09-01,2026-09-03,2026-09-10,2026-09-20', dates.join(','));
  const hdr = await page.evaluate(() => document.querySelector('#ledResult .ledsort').textContent);
  check('머리글에 ▲ 가 붙는다', /▲/.test(hdr), hdr);
  await page.click('#ledResult .ledsort >> nth=1'); await page.waitForTimeout(100);
  let amts = await col(page, 3);
  check('금액을 누르면 큰 순(내림차순), 통화끼리 묶어서', /30,000.*12,000.*2,800.*500/.test(amts.join('|')), amts.join('|'));
  await page.click('#ledResult .ledsort >> nth=1'); await page.waitForTimeout(100);
  amts = await col(page, 3);
  check('한 번 더 누르면 작은 순(오름차순)', /500.*2,800.*12,000/.test(amts.join('|')), amts.join('|'));
  const ascSeq = amts.join('|');
  await page.click('#ledResult .ledsort >> nth=1'); await page.waitForTimeout(80);
  const descSeq = (await col(page, 3)).join('|');
  check('(짝) 오름·내림이 실제로 다르다 — 같은 통화 안의 순서가 뒤집힌다', ascSeq !== descSeq
        && /12,000.*2,800.*500/.test(descSeq) && /500.*2,800.*12,000/.test(ascSeq), ascSeq + ' / ' + descSeq);
  check('통화 묶음은 섞이지 않는다(₩ 줄이 ₱ 줄 사이에 끼지 않는다)', /^[^|]*30,000/.test(descSeq) && /^[^|]*30,000/.test(ascSeq), descSeq);

  console.log('\n[3] 지난달 · 최근 1년 탭');
  check('탭이 셋(이번 달·지난달·최근 1년)', (await page.evaluate(() => Array.from(document.querySelectorAll('#ledBar .ledtab')).map((b) => b.textContent).join('|'))) === '이번 달|지난달|최근 1년');
  await page.evaluate(() => (window.__CALLS.length = 0));
  await page.click('#ledBar .ledtab >> nth=1'); await page.waitForTimeout(200);
  const lc = await page.evaluate(() => window.__CALLS.filter((u) => u.indexOf('view=ledger') >= 0));
  check('지난달을 누르면 period=last_month 로 다시 부른다', lc.length === 1 && /period=last_month/.test(lc[0]), JSON.stringify(lc));
  await page.evaluate(() => (window.__CALLS.length = 0));
  await page.click('#ledBar .ledtab >> nth=2'); await page.waitForTimeout(200);
  const yc = await page.evaluate(() => window.__CALLS.filter((u) => u.indexOf('view=ledger') >= 0));
  check('최근 1년을 누르면 period=year 로 다시 부른다', yc.length === 1 && /period=year/.test(yc[0]), JSON.stringify(yc));
  await page.evaluate(() => (window.__CALLS.length = 0));
  await page.click('#ledBar .ledtab >> nth=0'); await page.waitForTimeout(150);
  check('(짝) 이번 달로 돌아가면 다시 부르지 않는다(이미 받음)', (await page.evaluate(() => window.__CALLS.filter((u) => u.indexOf('view=ledger') >= 0).length)) === 0);

  console.log('\n[3b] 분류별 소계 · 엑셀');
  const cats = await page.evaluate(() => { const d = document.querySelector('#ledResult details.ledcats'); return d ? { open: d.open, items: Array.from(d.querySelectorAll('li')).map((l) => l.textContent) } : null; });
  check('분류별 소계가 있고 처음엔 접혀 있다', !!cats && cats.open === false && cats.items.length === 3, JSON.stringify(cats));
  check('«분류 없음» 이 적혀 있고 통화가 섞이지 않는다', !!cats && cats.items.some((t) => /분류 없음/.test(t) && /₩30,000/.test(t)) && cats.items.some((t) => /사무용품/.test(t) && /₱500/.test(t)), JSON.stringify(cats));
  check('엑셀 버튼이 보인다', await page.evaluate(() => !!document.querySelector('#ledResult .findcsv')));
  // 실제로 눌러 «어디로 가는가» 를 잰다(함수를 다시 부르지 않는다 — 버튼이 그 함수를 쓰는지가 질문이다).
  const navP = page.waitForRequest((r) => /format=csv/.test(r.url()), { timeout: 3000 }).catch(() => null);
  await page.click('#ledResult .findcsv');
  const nav = await navP;
  const csvUrl = nav ? nav.url() : '';
  check('엑셀 주소 = 지금 탭(이번 달로 돌아온 뒤)의 장부 주소 + format=csv', /\/api\/approval\/requests\?view=ledger&scope=all&period=month&format=csv$/.test(csvUrl), csvUrl);
  await page.goto(FILE, { waitUntil: 'load' }).catch(() => {}); await page.waitForTimeout(700);

  console.log('\n[4] 카드 영수증 미리보기');
  const th = await page.evaluate(() => Array.from(document.querySelectorAll('#inbox .rthumb img')).map((i) => i.getAttribute('src')));
  check('결재할 사진 건에 미리보기가 있다(inline=1)', th.length === 1 && /\/requests\/11\/file\?inline=1$/.test(th[0]), JSON.stringify(th));
  check('(짝) PDF 건과 내가 올린 건에는 없다', !(await page.evaluate(() => !!document.querySelector('#mine .rthumb'))));
  check('첨부 보기 링크는 그대로 남는다', (await page.evaluate(() => document.querySelectorAll('#inbox a.lnk[href$="/file"]').length)) === 2);
  check('페이지 오류 0', errors.length === 0, errors.join(' | '));
  await ctx.close();

  console.log('\n[5] 직원 · 실패 · 폰');
  ({ ctx, page, errors } = await open(home({ can_approve: false, inbox: [] }), LEDGER));
  check('직원은 scope=mine', /scope=mine/.test((await page.evaluate(() => window.__CALLS.find((u) => u.indexOf('view=ledger') >= 0))) || ''));
  await ctx.close();
  ({ ctx, page, errors } = await open(home(), { error: 'Not Found' }));
  check('못 불러오면 «못 불러왔다» 고 말한다(ok 칸이 없는 404)', /불러오지 못했습니다/.test(await page.evaluate(() => document.getElementById('ledResult').textContent)));
  await ctx.close();
  ({ ctx, page, errors } = await open(home(), 'net'));
  check('연결이 끊기면 다시 누르라고 말한다', /연결이 좋지 않습니다/.test(await page.evaluate(() => document.getElementById('ledResult').textContent)));
  await page.evaluate(() => (window.__CALLS.length = 0));
  await page.click('#ledBar .ledtab >> nth=0'); await page.waitForTimeout(150);
  check('실패한 뒤 탭을 누르면 다시 부른다', (await page.evaluate(() => window.__CALLS.filter((u) => u.indexOf('view=ledger') >= 0).length)) === 1);
  await ctx.close();
  ({ ctx, page, errors } = await open(home(), LEDGER, 375));
  const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check('폰 375px 에서 문서가 옆으로 넘치지 않는다', !over);
  const amtVis = await page.evaluate(() => { const c = document.querySelector('#ledResult tbody td.ledamt'); const r = c.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.width > 0; });
  check('폰에서도 금액 칸이 화면 안에 보인다', amtVis);
  await ctx.close();
  await browser.close();
  console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
})();
