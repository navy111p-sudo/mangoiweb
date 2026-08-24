// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   ↕️ 「카페24 회계 실데이터」 다섯 탭 표 — 머리글 정렬을 진짜 브라우저에서 눌러 보는 검사
   (2026-08-24 신설 — 사장님 지시 「올림순·내림순 정렬을 달아 달라」)

   [왜 필요한가] 「무엇이 몇 번째 줄에 그려졌나」는 문자열 하니스로 볼 수 없다.
   함수도 값도 «다 있는데» 순서만 틀린 사고가 이 저장소에서 여러 번 났다
   (CLAUDE.md 2장 「화면 «좌표» 가 틀린 버그를 하니스가 못 잡음」·「버튼을 눌러도 소리가 안 멈춤」).
   그래서 실제로 머리글을 눌러 보고 `<td>` 글자를 읽어 순서를 확인한다.

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      c24FinLoad / c24FinSort(js/adm-core.js) 또는 이 카드를 건드리면 사람이 직접 부를 것:
        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
        PW_DIR=/tmp/pw node test-harness/manual/c24-finance-sort-browser.mjs

   [무엇을 스텁하나] 로그인이 필요한 /api/admin/finance-cafe24/* 를 씨앗값으로 대신한다.
   ⚠️ 스텁 때문에 나는 다른 화면의 오류를 이 표의 버그로 착각하지 말 것.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.C24SORT_PORT || 8912);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

/* ── 씨앗 — 서버가 주는 모양 그대로(날짜 내림차순). 정렬이 실제로 «바꾸는지» 보려고
      일부러 금액·거래처가 날짜순과 어긋나게 섞어 두었다.
   ⚠️ 「케이씨피M」 행은 넣지 않는다 — 서버가 목록에서 빼고 내려주기 때문이다(2026-08-18 지시). ── */
const LEDGER = [
  { date: '2026-07-20', type: 2, acc_type: '지출', subject: '광고선전비', money: 300000, store: '다판다광고', memo: '배너', month: '2026-07', excluded_from_revenue: false, counts_as_revenue: false },
  { date: '2026-07-15', type: 1, acc_type: '수입', subject: '카드매출', money: 5000000, store: '케이씨피', memo: '정산', month: '2026-07', excluded_from_revenue: false, counts_as_revenue: true },
  { date: '2026-07-02', type: 2, acc_type: '지출', subject: '지급수수료', money: 1200000, store: '가나상사', memo: '', month: '2026-07', excluded_from_revenue: false, counts_as_revenue: false },
  { date: '2026-06-28', type: 2, acc_type: '지출', subject: '소모품비', money: 45000, store: '하나문구', memo: '용지', month: '2026-06', excluded_from_revenue: false, counts_as_revenue: false },
];
const PAYROLL = [
  { user_id: 'teacher_b', month: '2026-07', base: 2000000, total: 2200000, deduction: 180000, actual: 2020000, work_day: 21 },
  { user_id: 'teacher_a', month: '2026-06', base: 3000000, total: 3300000, deduction: 260000, actual: 3040000, work_day: 9 },
];
const EXPENSES = [
  { reg_date: '2026-07-11', name: 'Office supplies', organ: 'Lazada', method: 'card', content: 'ink', pay_date: '2026-07-13', state: 1, doc_id: 'D1' },
  { reg_date: '2026-07-04', name: 'Aircon repair', organ: 'Cool Co', method: 'cash', content: 'unit 2', pay_date: '', state: 1, doc_id: 'D2' },
];
const TAX = [
  { date: '2026-07-31', supplier: '망고아이', receiver: '나다학원', supply: 900000, tax: 90000, total: 990000, tax_type: '과세' },
  { date: '2026-07-10', supplier: '망고아이', receiver: '가나학원', supply: 1500000, tax: 150000, total: 1650000, tax_type: '과세' },
];
const DEPOSITS = [
  { date: '2026-07-22', center_id: 'C-102', amount: 400000, method: 'card' },
  { date: '2026-07-09', center_id: 'C-011', amount: 1250000, method: 'bank' },
];
const SEED = { ledger: LEDGER, payroll: PAYROLL, expenses: EXPENSES, tax: TAX, deposits: DEPOSITS };

async function serve() {
  try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error(`정적 서버를 못 띄웠습니다 (${PUBLIC})`);
}

async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  /* 🪤 «환영 안내»(#aw-overlay)는 열릴 때 html{overflow:hidden} 을 걸고 사람이 닫아야 푼다.
        빈 브라우저는 «첫 방문자» 라 클릭도 스크롤도 막힌다. */
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 모드 */ }
  });
  await ctx.route('**/api/admin/finance-cafe24/**', route => {
    const u = route.request().url();
    const kind = (u.match(/finance-cafe24\/([a-z]+)/) || [])[1] || 'ledger';
    if (kind === 'summary') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, months: [], totals: { income: 0, expense: 0, net: 0 } }) });
    }
    const rows = SEED[kind] || [];
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, source: 'neo4j', kind, count: rows.length, rows }) });
  });
  await ctx.route('**/api/**', route => {
    if (/finance-cafe24/.test(route.request().url())) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  /* ⚠️ state:'attached' — 관리자 카드는 adm-ia6.js 가 한 번에 한 장만 보여 준다. */
  await page.waitForSelector('#c24fin-body', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** 탭을 열고 표가 채워질 때까지 기다린다.
    🧭 카드를 «보이게» 하는 정본은 jumpToMenu — 관리자 카드는 adm-ia6.js 가 `ia6-hide` 로
       한 번에 한 장만 보여 준다. 이걸 빼면 머리글이 «붙어 있는데 안 보여» 클릭이 안 된다. */
async function openTab(page, kind) {
  await page.evaluate((k) => {
    try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-accounting-mgmt'); } catch (e) {}
    /* 📱 휴대폰 폭에서는 드로어가 화면을 통째로 덮는다(z-index 100001). 실제 앱도 메뉴를 고르면
          닫으므로 **앱이 쓰는 그 함수**로 닫는다 — 클래스를 손으로 지워 흉내내지 않는다. */
    if (window.matchMedia('(max-width: 1023px)').matches) {
      try { if (typeof window.mgaClose === 'function') window.mgaClose(); } catch (e) {}
    }
    let el = document.getElementById('sub-c24-finance');
    while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
    window.c24FinLoad(k);
  }, kind);
  await page.waitForFunction(() => {
    const b = document.getElementById('c24fin-body');
    return b && !/불러오는 중|Loading/.test(b.textContent);
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
}

/** 지금 표에 그려진 «그 칸» 의 글자를 위에서부터 읽는다. */
const colText = (page, idx) => page.evaluate((i) => {
  return [...document.querySelectorAll('#c24fin-body tr')]
    .map(tr => (tr.children[i] || {}).textContent || '').filter(t => t !== '');
}, idx);

/** 머리글을 «실제로 눌러» 본다 — 함수를 직접 부르지 않는다(onclick 이 안 달렸어도 통과해 버린다). */
const clickHead = (page, key) => page.click(`#c24fin-head th[data-c="${key}"]`);

const headText = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#c24fin-head th')].map(th => th.textContent.trim()));

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  try {
    const { ctx, page } = await open(browser, 1440, 900);

    /* ── ① 회계장부 — 머리글이 눌리는 자리인가 ───────────────────────────── */
    console.log('\n[1] 회계장부 — 머리글이 정렬 단추 노릇을 하는가');
    await openTab(page, 'ledger');
    const ths = await page.evaluate(() => [...document.querySelectorAll('#c24fin-head th')]
      .map(th => ({ key: th.getAttribute('data-c'), cursor: getComputedStyle(th).cursor, text: th.textContent.trim() })));
    check('머리글 7칸이 그려진다', ths.length === 7, '실제 ' + ths.length);
    check('칸마다 data-c(정렬 키)가 있다', ths.every(t => !!t.key), JSON.stringify(ths.map(t => t.key)));
    check('머리글 커서가 pointer', ths.every(t => t.cursor === 'pointer'), JSON.stringify(ths.map(t => t.cursor)));
    check('정렬 전에는 ⇅ 표시', ths.every(t => t.text.includes('⇅')), ths[0] && ths[0].text);
    check('머리글 글자는 그대로 남는다(일자·금액)', ths[0].text.startsWith('일자') && ths[3].text.startsWith('금액'), ths.map(t => t.text).join('|'));

    /* ⚠️ i18n 사전은 «전체 문자열 일치» 라 라벨과 화살표가 한 덩어리면 번역이 깨진다.
          그래서 화살표는 별도 <span> 이어야 한다(CLAUDE.md 2장 「i18n 사전」). */
    const labelPure = await page.evaluate(() => {
      const th = document.querySelector('#c24fin-head th[data-c="money"]');
      return th && th.firstElementChild ? th.firstElementChild.textContent : '';
    });
    check('라벨과 화살표가 다른 span 이다', labelPure === '금액', '실제 «' + labelPure + '»');

    /* ── ② 금액 — 올림순 → 내림순 → 원래 순서 ────────────────────────────── */
    console.log('\n[2] 금액 — 올림순 ▲ → 내림순 ▼ → 원래 순서');
    const before = await colText(page, 0);          // 일자 칸(서버가 준 날짜 내림차순)
    check('처음은 서버 순서 그대로', before.join(',') === '2026-07-20,2026-07-15,2026-07-02,2026-06-28', before.join(','));

    await clickHead(page, 'money');
    const asc = await colText(page, 3);
    check('한 번 누르면 금액 올림순', asc.join(',') === '₩45,000,₩300,000,₩1,200,000,₩5,000,000', asc.join(','));
    const headA = (await headText(page))[3];
    check('금액 머리글에 ▲', headA.includes('▲'), headA);
    check('다른 칸은 ⇅ 그대로', (await headText(page))[0].includes('⇅'), (await headText(page))[0]);

    await clickHead(page, 'money');
    const desc = await colText(page, 3);
    check('두 번 누르면 금액 내림순', desc.join(',') === '₩5,000,000,₩1,200,000,₩300,000,₩45,000', desc.join(','));
    check('금액 머리글에 ▼', (await headText(page))[3].includes('▼'), (await headText(page))[3]);

    await clickHead(page, 'money');
    const back = await colText(page, 0);
    check('세 번 누르면 원래 순서로 돌아온다', back.join(',') === before.join(','), back.join(','));
    check('원래대로면 화살표도 ⇅', (await headText(page))[3].includes('⇅'), (await headText(page))[3]);

    /* ⚠️ 금액은 «글자» 로 비교하면 ₩45,000 이 ₩5,000,000 보다 커진다.
          숫자로 재는지 확인 — 위 올림순 첫 줄이 45,000 이면 숫자 비교가 맞다. */
    check('금액은 글자가 아니라 숫자로 비교한다', asc[0] === '₩45,000' && asc[3] === '₩5,000,000', asc.join(','));

    /* ── ②-2 «정렬 중» 강조가 **화면에 실제로 그려지는가** ─────────────────
       🪤 코드에 색을 적어 두는 것과 그려지는 것은 다르다 — 이 카드에서는 인라인 style 이
          admin-inline-c.css 의 !important(8770·8793행)에 진다. 그래서 «인라인 값» 이 아니라
          **getComputedStyle** 로 재고, 정렬 안 한 칸과 «다른가» 까지 본다
          (CLAUDE.md 2장 「카드 안 글자에 색을 줬는데 화면에는 흰빛으로」). */
    console.log('\n[2-2] «정렬 중» 강조가 화면에 실제로 그려지는가');
    await clickHead(page, 'money');                 // 다시 올림순으로
    const paint = await page.evaluate(() => {
      const on = document.querySelector('#c24fin-head th[data-c="money"]');
      const off = document.querySelector('#c24fin-head th[data-c="store"]');
      const note = document.getElementById('c24fin-sortnote');
      const cs = el => el ? getComputedStyle(el) : null;
      const a = cs(on), b = cs(off), n = cs(note);
      return {
        onColor: a.color, offColor: b.color,
        onLabel: on.firstElementChild ? cs(on.firstElementChild).color : '',
        onBorder: a.borderBottomColor + ' ' + a.borderBottomWidth,
        offBorder: b.borderBottomColor + ' ' + b.borderBottomWidth,
        noteColor: n.color, hasCls: on.classList.contains('c24fin-on'),
      };
    });
    check('정렬 중인 칸에 c24fin-on 클래스', paint.hasCls);
    check('정렬 중인 칸 글자색이 앰버(rgb(180,83,9))', paint.onColor === 'rgb(180, 83, 9)', paint.onColor);
    check('그 안의 라벨 span 도 앰버', paint.onLabel === 'rgb(180, 83, 9)', paint.onLabel);
    check('정렬 안 한 칸과 색이 다르다', paint.onColor !== paint.offColor, paint.onColor + ' vs ' + paint.offColor);
    /* 🪤 굵기를 «2px» 로 못 박지 말 것 — `body{zoom:1.3}` 이라 계산값이 2 ÷ 1.3 = 1.538px 로 나온다
          (실측). 색과 «다른 칸보다 굵다» 로 판정한다(CLAUDE.md 2장 zoom 함정의 계산값 판). */
    const px = s => parseFloat((String(s).match(/([\d.]+)px\s*$/) || [])[1] || '0');
    const bw = px(paint.onBorder), bwOff = px(paint.offBorder);
    check('밑줄이 앰버색으로 굵어진다', /rgb\(245, 158, 11\)/.test(paint.onBorder) && bw > bwOff,
      paint.onBorder + ' vs ' + paint.offBorder);
    check('밑줄이 다른 칸과 다르다', paint.onBorder !== paint.offBorder, paint.onBorder + ' vs ' + paint.offBorder);
    check('안내 줄도 앰버로 그려진다', paint.noteColor === 'rgb(180, 83, 9)', paint.noteColor);
    await clickHead(page, 'money'); await clickHead(page, 'money');   // 원래 순서로 되돌림
    const offAgain = await page.evaluate(() => {
      const th = document.querySelector('#c24fin-head th[data-c="money"]');
      const n = document.getElementById('c24fin-sortnote');
      return { cls: th.classList.contains('c24fin-on'), note: n.classList.contains('c24fin-note-on') };
    });
    check('원래 순서로 돌리면 강조도 벗겨진다', !offAgain.cls && !offAgain.note, JSON.stringify(offAgain));

    /* ── ③ 글자 칸 — 거래처(한글) 정렬 ──────────────────────────────────── */
    console.log('\n[3] 거래처 — 한글 가나다 정렬');
    await clickHead(page, 'store');
    const storeAsc = await colText(page, 4);
    check('거래처 올림순(가나다)', storeAsc.join(',') === '가나상사,다판다광고,케이씨피,하나문구', storeAsc.join(','));
    await clickHead(page, 'store');
    const storeDesc = await colText(page, 4);
    check('거래처 내림순', storeDesc.join(',') === '하나문구,케이씨피,다판다광고,가나상사', storeDesc.join(','));

    /* ── ④ 다른 칸을 누르면 그 칸 올림순부터 ─────────────────────────────── */
    console.log('\n[4] 다른 칸을 누르면 그 칸 올림순부터 시작');
    await clickHead(page, 'date');
    const dateAsc = await colText(page, 0);
    check('일자 올림순', dateAsc.join(',') === '2026-06-28,2026-07-02,2026-07-15,2026-07-20', dateAsc.join(','));
    const hs = await headText(page);
    check('앞서 누른 거래처 칸은 ⇅ 로 돌아간다', hs[4].includes('⇅') && hs[0].includes('▲'), hs.join('|'));

    /* ── ⑤ 빈 값은 방향과 상관없이 아래로 ─────────────────────────────────
       ⚠️ 빈 값 검사에 **지출결의 탭을 쓰지 말 것** — 그 탭은 2026-08-24(PR #465)부터
          전용 화면(`__c24ExpSetup`, 칩·검색·자체 정렬 `data-s`)이 그린다. 이 정렬이 안 걸린다.
          그래서 회계장부의 «적요»(한 행이 빈 값)로 잰다. */
    console.log('\n[5] 빈 칸(—)은 올림·내림 어느 쪽이든 맨 아래');
    await openTab(page, 'ledger');
    await clickHead(page, 'memo');               // 네 행 중 하나가 빈 값
    const memoAsc = await colText(page, 5);
    check('올림순에서 빈 칸이 아래', memoAsc[memoAsc.length - 1] === '—', memoAsc.join(','));
    await clickHead(page, 'memo');
    const memoDesc = await colText(page, 5);
    check('내림순에서도 빈 칸이 아래', memoDesc[memoDesc.length - 1] === '—', memoDesc.join(','));

    /* ── ⑤-2 지출결의 탭은 «전용 화면» 이 맡는다(경계 확인) ─────────────────
       두 작업이 같은 화면에서 만나 정렬이 두 벌이 되지 않게 갈라 둔 경계다.
       여기가 깨지면 한 탭에 정렬 UI 가 두 개 뜨거나, 전용 화면이 통째로 덮인다. */
    console.log('\n[5-2] 지출결의 탭은 전용 화면(칩·검색)이 그린다');
    await openTab(page, 'expenses');
    const exp = await page.evaluate(() => ({
      tools: !!document.querySelector('#c24fin-tools .c24x-chip'),
      ownTh: document.querySelectorAll('#c24fin-head th[data-s]').length,
      mineTh: document.querySelectorAll('#c24fin-head th[data-c]').length,
      toolsShown: (() => { const t = document.getElementById('c24fin-tools'); return !!t && t.style.display !== 'none'; })(),
    }));
    check('지출결의에 전용 도구 줄(칩)이 뜬다', exp.tools);
    check('머리글은 전용 화면 것(data-s)', exp.ownTh > 0 && exp.mineTh === 0, JSON.stringify(exp));
    await openTab(page, 'ledger');
    const backTools = await page.evaluate(() => {
      const t = document.getElementById('c24fin-tools');
      return { hidden: !t || t.style.display === 'none', mineTh: document.querySelectorAll('#c24fin-head th[data-c]').length };
    });
    check('다른 탭으로 돌아오면 도구 줄이 숨는다', backTools.hidden, JSON.stringify(backTools));
    check('머리글도 이쪽 정렬(data-c)로 돌아온다', backTools.mineTh === 7, String(backTools.mineTh));

    /* ── ⑥ 나머지 탭에도 정렬이 붙는가 ─────────────────────────────────── */
    console.log('\n[6] 급여명세·세금계산서·예치금 — 다섯 탭 모두');
    await openTab(page, 'payroll');
    await clickHead(page, 'work_day');
    const wd = await colText(page, 6);
    check('급여명세 근무일 올림순(서식 없는 숫자도 숫자로)', wd.join(',') === '9,21', wd.join(','));

    await openTab(page, 'tax');
    await clickHead(page, 'total');
    const taxAsc = await colText(page, 5);
    check('세금계산서 합계 올림순', taxAsc.join(',') === '₩990,000,₩1,650,000', taxAsc.join(','));

    await openTab(page, 'deposits');
    await clickHead(page, 'amount');
    const dep = await colText(page, 2);
    check('예치금 금액 올림순', dep.join(',') === '₩400,000,₩1,250,000', dep.join(','));
    const depHead = await page.evaluate(() => [...document.querySelectorAll('#c24fin-head th')].length);
    check('예치금 머리글 4칸', depHead === 4, String(depHead));

    /* ── ⑦ 탭을 바꾸면 정렬이 초기화된다 ───────────────────────────────── */
    console.log('\n[7] 탭을 바꾸면 정렬 상태가 남지 않는다');
    await openTab(page, 'ledger');
    const afterTab = await colText(page, 0);
    check('회계장부로 돌아오면 서버 순서', afterTab.join(',') === before.join(','), afterTab.join(','));
    check('머리글도 ⇅ 로 초기화', (await headText(page)).every(t => t.includes('⇅')), (await headText(page)).join('|'));

    /* ── ⑧ «지금 무슨 정렬인지» 말로 알려 주는 줄 ─────────────────────── */
    console.log('\n[8] 정렬 안내 줄');
    const note0 = await page.evaluate(() => (document.getElementById('c24fin-sortnote') || {}).textContent || '');
    check('정렬 전 안내 문구', /머리글을 누르면 정렬/.test(note0), note0);
    await clickHead(page, 'money');
    await clickHead(page, 'money');
    const note2 = await page.evaluate(() => (document.getElementById('c24fin-sortnote') || {}).textContent || '');
    check('내림순이면 «내림순» 이라고 적는다', /금액/.test(note2) && /내림순/.test(note2), note2);

    /* ── ⑧-2 🌐 EN — 머리글·안내 줄이 언어를 따라오는가 ────────────────────
       🪤 `toggleAdminLang()` 은 새로고침 없이 DOM 만 간다. JS 가 textContent 로 그린 글자는
          `mangoi:lang-changed` 를 직접 받지 않으면 안 따라온다(CLAUDE.md 2장 「JS 로 그린 라벨」). */
    console.log('\n[8-2] 🌐 EN 으로 바꾸면 머리글·안내 줄이 따라오는가');
    await page.evaluate(() => { if (typeof window.toggleAdminLang === 'function') window.toggleAdminLang(); });
    await page.waitForTimeout(500);
    const enState = await page.evaluate(() => ({
      lang: window.adminLang,
      head: [...document.querySelectorAll('#c24fin-head th')].map(th => th.firstElementChild.textContent),
      note: (document.getElementById('c24fin-sortnote') || {}).textContent || '',
    }));
    check('EN 으로 바뀌었다', enState.lang === 'en', enState.lang);
    check('머리글이 영어로 다시 그려진다', enState.head[0] === 'Date' && enState.head[3] === 'Amount', enState.head.join('|'));
    check('안내 줄도 영어', /Sorted by Amount|Click a header/.test(enState.note), enState.note);
    await page.evaluate(() => { if (typeof window.toggleAdminLang === 'function') window.toggleAdminLang(); });
    await page.waitForTimeout(500);
    const koBack = await page.evaluate(() => [...document.querySelectorAll('#c24fin-head th')].map(th => th.firstElementChild.textContent));
    check('KO 로 되돌아온다', koBack[3] === '금액', koBack.join('|'));

    /* ── ⑨ 합계 줄(매출·지출)은 정렬해도 안 바뀐다 ───────────────────── */
    console.log('\n[9] 건수·합계 줄은 정렬과 무관');
    const cntTxt = await page.evaluate(() => (document.getElementById('c24fin-count') || {}).textContent || '');
    check('총 4건 그대로', /총 4건/.test(cntTxt), cntTxt);
    check('매출 ₩5,000,000 (counts_as_revenue 만)', /₩5,000,000/.test(cntTxt), cntTxt);

    /* ── ⑩ 표가 화면을 옆으로 밀지 않는가(좁은 화면) ───────────────────── */
    console.log('\n[10] 휴대폰 폭 — 문서가 가로로 넘치지 않는다');
    await ctx.close();
    const m = await open(browser, 390, 844);
    await openTab(m.page, 'ledger');
    /* 🪤 «보인다»·«눌린다» 는 다르다 — 머리글 좌표에서 맨 위에 무엇이 있는지 먼저 잰다
          (CLAUDE.md 2장 「휴대폰 도크 모달이 드로어 밑에 깔림」·「보이는데 안 눌린다」). */
    await m.page.evaluate(() => {
      const th = document.querySelector('#c24fin-head th[data-c="money"]');
      if (th) th.scrollIntoView({ block: 'center' });   // 화면 밖 좌표면 elementsFromPoint 가 빈 배열을 준다
    });
    await m.page.waitForTimeout(400);
    const top = await m.page.evaluate(() => {
      const th = document.querySelector('#c24fin-head th[data-c="money"]');
      if (!th) return { ok: false, why: 'no th' };
      const r = th.getBoundingClientRect();
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { ok: stack.indexOf(th) === 0, top: stack[0] ? stack[0].tagName + '#' + (stack[0].id || '') : '' };
    });
    check('휴대폰에서도 머리글이 맨 위에 있다(가려지지 않음)', top.ok, '맨 위: ' + top.top);
    await clickHead(m.page, 'money');
    const over = await m.page.evaluate(() => ({
      docW: document.documentElement.scrollWidth, win: window.innerWidth,
      rows: document.querySelectorAll('#c24fin-body tr').length,
    }));
    /* 🪤 헤드리스 크로미움의 최소 뷰포트가 500px 이라 스크린샷 눈대중은 못 믿는다 —
          scrollWidth 로 재는 것이 정본(CLAUDE.md 2장). */
    check('정렬 후에도 가로 넘침 없음', over.docW <= over.win + 1, `doc ${over.docW} > win ${over.win}`);
    check('좁은 화면에서도 4줄이 그려진다', over.rows === 4, String(over.rows));
    await m.ctx.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(`\n${'─'.repeat(60)}\n  ${FAIL ? '❌' : '✅'}  PASS ${PASS} · FAIL ${FAIL}\n`);
  process.exit(FAIL ? 1 : 0);
})();
