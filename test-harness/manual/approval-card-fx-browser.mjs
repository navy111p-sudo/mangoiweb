/*
 * 💱 결재함 «목록 카드» 도 원·페소로 바꿔 보기 (2026-09-25 사장님 「여기는 왜 바뀌지 않았어?」)
 *   회계장부에만 있던 바꿔 보기를 목록 카드(결재할 것·내가 올린 것·긴급)에도 적용했는지 진짜 화면에서 잰다.
 *   [짝] ₩ 로 바꾼다 ↔ 원래 금액은 지우지 않는다 · 원화 건은 그대로 · 환율이 없으면 아무것도 안 바꾼다
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-card-fx-browser.mjs  (자동으로 안 돕니다)
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
const LEDGER0 = { ok: true, ledger: L.rows, totals: L.totals, by_category: L.by_category, pending: L.pending, no_amount: L.no_amount, truncated: false, max: 2000, steps_missing: false, from: '2026-09-01', to: '2026-09-30' };


const LEDGER = Object.assign({}, LEDGER0, { fx: { krw_per_php: 23.85, date: '2026-09-25', source: 'live' } });
const LEDGER_NOFX = Object.assign({}, LEDGER0, { fx: null });
let PASS = 0, FAIL = 0;
const check = (n, c, x) => { if (c) { PASS++; console.log('  OK   ' + n); } else { FAIL++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  async function open(h, ledgerResp, show) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(({ h, lg, show }) => {
      try { localStorage.setItem('mangoi_lang', 'ko'); localStorage.setItem('mangoi_led_show', show || ''); } catch (e) {}
      const rf = window.fetch;
      window.fetch = function (u, o) {
        u = String(u);
        if (u.indexOf('/api/approval/home') === 0) return Promise.resolve(new Response(JSON.stringify(h), { status: 200 }));
        if (u.indexOf('/api/push/vapid-public-key') === 0) return Promise.resolve(new Response('{"ok":true,"key":""}', { status: 200 }));
        if (u.indexOf('view=ledger') >= 0) return Promise.resolve(new Response(JSON.stringify(lg), { status: 200 }));
        if (u.indexOf('view=report') >= 0) return Promise.resolve(new Response(JSON.stringify({ ok: true, summary: {
          counted: 3, by_status: { approved: 2, pending: 1 }, approved_money: [{ currency: 'PHP', total: 9900 }], pending_money: [{ currency: 'KRW', total: 30000 }],
          by_category: [{ key: 'office', ko: '사무용품', en: 'Office', count: 2, money: [{ currency: 'PHP', total: 7100 }] }],
          by_month: [{ month: '2026-09', count: 2, money: [{ currency: 'PHP', total: 9900 }] }] } }), { status: 200 }));
        if (u.indexOf('/api/approval/requests') === 0) return Promise.resolve(new Response('{"ok":true,"items":[],"has_more":false,"offset":0,"facets":{}}', { status: 200 }));
        return rf(u, o);
      };
    }, { h, lg: ledgerResp, show });
    await page.goto(FILE, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    return { ctx, page, errors };
  }
  const fxEls = (page, sel) => page.evaluate((sel) => Array.from(document.querySelectorAll(sel + ' .iamtfx, ' + sel + ' .fxamt')).map((e) => ({ t: e.textContent.trim(), w: +getComputedStyle(e).fontWeight })), sel);
  const amts = (page, sel) => page.evaluate((sel) => Array.from(document.querySelectorAll(sel + ' .iamt')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel);
  const H = home({ inbox: [it(11, { amount: 2500 }), it(12, { amount: 4600, file_kind: 'pdf', file_name: 'r.pdf' }), it(14, { amount: 30000, currency: 'KRW' })],
                   mine: [it(13, { amount: 2800, requester_username: 'mgr_jjw' })] });

  console.log('\n[1] 환율이 있을 때 — 목록 위 환율 줄과 버튼');
  let { ctx, page, errors } = await open(H, LEDGER, '');
  const box = await page.evaluate(() => { const b = document.getElementById('fxBox'); return { txt: b.textContent, btns: Array.from(b.querySelectorAll('button')).map((x) => x.textContent), h: b.getBoundingClientRect().height }; });
  check('목록 위에 환율 줄이 보인다(₱1 = ₩23.85)', box.h > 10 && /₱1 = ₩23\.85/.test(box.txt), JSON.stringify(box));
  check('버튼 셋(원래 통화·₩ 원으로·₱ 페소로)', box.btns.join('|') === '원래 통화|₩ 원으로|₱ 페소로', box.btns.join('|'));
  let a = await amts(page, '#inbox');
  check('처음엔 원래 금액만(₱2,500)', a[0] === '₱2,500' && (await fxEls(page, '#inbox')).length === 0, a.join(' / '));

  console.log('\n[2] 「₩ 원으로」 — 카드가 바뀐다');
  await page.click('#fxBox button >> nth=1'); await page.waitForTimeout(200);
  a = await amts(page, '#inbox');
  check('결재할 카드: ₱2,500 옆에 ₩59,625', a[0] === '₱2,500 ₩59,625', a[0]);
  check('₱4,600 → ₩109,710', a[1] === '₱4,600 ₩109,710', a[1]);
  const fe = await fxEls(page, '#inbox');
  check('환산 금액에 물결(≈)이 없다', fe.length === 2 && fe.every((x) => !/\u2248/.test(x.t)), JSON.stringify(fe));
  check('환산 금액은 굵게(font-weight ≥ 700)', fe.length === 2 && fe.every((x) => x.w >= 700), JSON.stringify(fe));
  check('(짝) 이미 원화인 건은 그대로(≈ 없음)', a[2] === '₩30,000', a[2]);
  const m = await amts(page, '#mine');
  check('내가 올린 카드도 바뀐다(₱2,800 ₩66,780)', m[0] === '₱2,800 ₩66,780', m[0]);
  const led = await page.evaluate(() => document.getElementById('ledResult').textContent);
  check('회계장부도 같은 선택을 따른다(₩)', /₩/.test(led));
  const fxOn = await page.evaluate(() => document.querySelector('#fxBox button.on').textContent);
  check('눌린 버튼 표시가 「₩ 원으로」', fxOn === '₩ 원으로', fxOn);

  console.log('\n[3] 「₱ 페소로」·「원래 통화」');
  await page.click('#fxBox button >> nth=2'); await page.waitForTimeout(200);
  a = await amts(page, '#inbox');
  check('원화 건이 ₱ 로(₩30,000 ₱1,258)', a[2] === '₩30,000 ₱1,258', a[2]);
  check('(짝) 페소 건은 그대로', a[0] === '₱2,500', a[0]);
  await page.click('#fxBox button >> nth=0'); await page.waitForTimeout(200);
  a = await amts(page, '#inbox');
  check('원래 통화로 돌아온다', (await fxEls(page, '#inbox')).length === 0 && a[0] === '₱2,500', a.join(' / '));
  check('페이지 오류 0', errors.length === 0, errors.join(' | '));
  await ctx.close();

  console.log('\n[4] 저장된 선택(₩)으로 다시 열어도 카드가 바뀐다');
  ({ ctx, page, errors } = await open(H, LEDGER, 'KRW'));
  a = await amts(page, '#inbox');
  check('다시 열면 ₩ 가 붙어 있다', a[0] === '₱2,500 ₩59,625', a[0]);
  await ctx.close();

  console.log('\n[5] 환율을 못 받으면 — 지어내지 않는다');
  ({ ctx, page, errors } = await open(H, LEDGER_NOFX, 'KRW'));
  const b2 = await page.evaluate(() => document.getElementById('fxBox').innerHTML);
  check('목록 위 환율 줄을 안 그린다', b2 === '', b2.slice(0, 80));
  a = await amts(page, '#inbox');
  check('(짝) 카드는 원래 금액만', a[0] === '₱2,500' && (await fxEls(page, '#inbox')).length === 0, a.join(' / '));
  check('페이지 오류 0', errors.length === 0, errors.join(' | '));
  await ctx.close();

  console.log('\n[6] 맨 위 금액 카드·「얼마나 썼나」 표도 따른다 (2026-09-25 사장님 「이건 왜 아직도 안돼??」)');
  const HS = home({ summary: { money_scope: 'all', money: { month: [{ currency: 'PHP', total: 9900 }], year: [{ currency: 'PHP', total: 9901 }], month_count: 7, year_count: 8 } } });
  ({ ctx, page, errors } = await open(HS, LEDGER, ''));
  const tiles = () => page.evaluate(() => Array.from(document.querySelectorAll('#topTiles .tile')).map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
  let tl = await tiles();
  check('처음엔 금액 카드에 환산 없음', tl.length >= 4 && (await fxEls(page, '#topTiles')).length === 0, tl.join(' | '));
  await page.click('#fxBox button >> nth=1'); await page.waitForTimeout(200);
  tl = await tiles();
  const month = tl.find((x) => /이번 달 승인/.test(x)) || '', year = tl.find((x) => /올해 누적/.test(x)) || '';
  check('이번 달 승인: ₱9,900 그대로 + ₩236,115', /₱9,900/.test(month) && /₩236,115/.test(month), month);
  check('올해 누적: ₩236,139', /₩236,139/.test(year), year);
  const tfe = await fxEls(page, '#topTiles');
  check('맨 위 카드 환산도 물결 없이 굵게', tfe.length === 2 && tfe.every((x) => x.w >= 700 && !/\u2248/.test(x.t)), JSON.stringify(tfe));
  await page.evaluate(() => window.toggleRep()); await page.waitForTimeout(400);
  const rep = await page.evaluate(() => document.getElementById('repResult').textContent.replace(/\s+/g, ' '));
  check('지출 정리 — 항목별 ₱7,100 (₩169,335)', /₱7,100 \(₩169,335\)/.test(rep), rep.slice(0, 300));
  check('지출 정리 — 승인 합계 ₱9,900 (₩236,115)', /₱9,900 \(₩236,115\)/.test(rep), rep.slice(0, 300));
  check('(짝) 이미 원화인 대기 ₩30,000 은 환산 없음', /₩30,000(?! \()/.test(rep), rep.slice(0, 300));
  const rfe = await fxEls(page, '#repResult');
  check('지출 정리 환산도 물결 없이 굵게', rfe.length >= 2 && rfe.every((x) => x.w >= 700 && !/\u2248/.test(x.t)), JSON.stringify(rfe));
  await page.click('#fxBox button >> nth=0'); await page.waitForTimeout(200);
  const rep0 = await page.evaluate(() => document.getElementById('repResult').textContent);
  tl = await tiles();
  check('원래 통화로 돌리면 카드·표 모두 환산 사라짐', (await fxEls(page, '#repResult')).length === 0 && (await fxEls(page, '#topTiles')).length === 0, rep0.slice(0, 120));
  check('페이지 오류 0', errors.length === 0, errors.join(' | '));
  await ctx.close();

  ({ ctx, page, errors } = await open(HS, LEDGER_NOFX, 'KRW'));
  tl = await tiles();
  check('(짝) 환율이 없으면 금액 카드에 환산을 지어내지 않는다', (await fxEls(page, '#topTiles')).length === 0 && /₱9,900/.test(tl.join('|')), tl.join(' | '));
  await ctx.close();

  await browser.close();
  console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
})();
