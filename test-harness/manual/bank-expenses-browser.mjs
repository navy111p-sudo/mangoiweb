// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🏦 「신한 계좌 입출금 (지출 분석)」 화면 — 진짜 브라우저에 그려서 재는 검사
   (2026-08-23 신설)

   [왜 필요한가] 이 저장소는 «타입체크·하니스·CI 가 전부 초록인데 화면만 틀린» 사고를
   여러 번 냈다. 문자열을 찾는 하니스로는 «어디에 그려졌나»·«글자가 어떻게 나뉘었나» 를
   볼 수 없기 때문이다(CLAUDE.md 2장 「화면 «좌표» 가 틀린 버그를 하니스가 못 잡음」).
   그래서 계정과목·KPI·표·차트가 실제로 그려지는지 좌표와 값을 재서 확인한다.

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      이 화면(또는 /api/admin/reports/bank-expenses)을 건드리면 사람이 직접 부를 것:
        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
        PW_DIR=/tmp/pw node test-harness/manual/bank-expenses-browser.mjs

   [무엇을 스텁하나] 로그인이 필요한 API 는 씨앗값을 돌려주는 스텁으로 대신한다.
   ⚠️ 스텁 응답 때문에 나는 다른 화면의 오류를 이 화면의 버그로 착각하지 말 것.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.BANKEXP_PORT || 8907);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

/* ── 씨앗 응답 — 실제 payload 모양 그대로. 「케이씨피M」 같은 입금은 넣지 않는다
      (이 화면은 출금 전용이고, 입금은 2026-08-18 지시로 회계 화면에서 뺐다). ── */
const SEED = {
  ok: true, type: 'bank-expenses', period: '2026-07', label: '2026년 7월',
  summary: {
    out_total: 12_500_000, out_count: 4,
    prev_total: 10_000_000, prev_delta_pct: 25,
    avg3m: 11_000_000, avg3m_delta_pct: 13.6,
    opex_total: 9_500_000, dup_total: 2_000_000, moved_total: 1_000_000,
    review_total: 1_500_000, review_ratio: 12,
  },
  categories: [
    { account: '지사수수료', total: 6_000_000, count: 1, role: 'opex',   share: 48 },
    { account: '카드대금',   total: 2_000_000, count: 1, role: 'dup',    share: 16 },
    { account: '기타출금',   total: 1_500_000, count: 1, role: 'review', share: 12 },
    { account: '강사급여송금', total: 1_000_000, count: 1, role: 'moved', share: 8 },
  ],
  payees: [
    /* assignable = 그 거래처에 «저장된 1차 분류가 기타출금인» 행이 있는가.
       김영진·주식회사알수없는곳은 true(지정하면 바뀐다), 신한카드·메트로은행은 false
       (은행 적요로 이미 분류돼 지정해도 안 바뀐다 — 화면이 그 사실을 적어야 한다). */
    { payee: '김영진', total: 6_000_000, count: 2, account: '지사수수료', first_at: '2026-07-05 10:00', last_at: '2026-07-18 09:00', assigned: true, assignable: true },
    { payee: '신한카드', total: 2_000_000, count: 1, account: '카드대금', first_at: '2026-07-15 09:00', last_at: '2026-07-15 09:00', assigned: false, assignable: false },
    { payee: '주식회사알수없는곳', total: 1_500_000, count: 1, account: '기타출금', first_at: '2026-07-20 14:00', last_at: '2026-07-20 14:00', assigned: false, assignable: true },
    { payee: '메트로은행', total: 1_000_000, count: 1, account: '강사급여송금', first_at: '2026-07-25 11:00', last_at: '2026-07-25 11:00', assigned: false, assignable: false },
  ],
  rows: [
    { id: 4, datetime: '2026-07-25 11:00', remark: '메트로은행 송금', payee: '메트로은행', bank_category: '강사급여송금', account: '강사급여송금', role: 'moved', amount: 1_000_000, balance: 3_000_000, memo: '' },
    { id: 3, datetime: '2026-07-20 14:00', remark: '주식회사알수없는곳', payee: '주식회사알수없는곳', bank_category: '기타출금', account: '기타출금', role: 'review', amount: 1_500_000, balance: 4_000_000, memo: '' },
    { id: 2, datetime: '2026-07-15 09:00', remark: '신한카드 결제', payee: '신한카드', bank_category: '카드대금', account: '카드대금', role: 'dup', amount: 2_000_000, balance: 5_500_000, memo: '' },
    { id: 5, datetime: '2026-07-18 09:00', remark: '김영진(지성교', payee: '김영진', bank_category: '기타출금', account: '지사수수료', role: 'opex', amount: 2_400_000, balance: 6_100_000, memo: '' },
    { id: 1, datetime: '2026-07-05 10:00', remark: '김영진(지성교', payee: '김영진', bank_category: '기타출금', account: '지사수수료', role: 'opex', amount: 3_600_000, balance: 7_500_000, memo: '' },
  ],
  history: [
    { month: '2026-02', total: 9_000_000, count: 3 }, { month: '2026-03', total: 9_500_000, count: 3 },
    { month: '2026-04', total: 10_500_000, count: 4 }, { month: '2026-05', total: 12_000_000, count: 5 },
    { month: '2026-06', total: 10_000_000, count: 4 }, { month: '2026-07', total: 12_500_000, count: 4 },
  ],
  account_options: ['지사수수료', '광고선전비', '지급수수료', '기타출금'],
  can_assign: true,
  prev_month: '2026-06',
  /* 🔁 고정비·변동비 — 김영진은 4개월 중 4개월·금액 폭 ×1.05 라 고정비,
     주식회사알수없는곳은 1개월만 나와 변동비. 화면이 «근거» 를 함께 그려야 한다. */
  recurring: {
    window: ['2026-04', '2026-05', '2026-06', '2026-07'],
    window_months: 4, min_months: 3, spread_max: 1.25,
    fixed_total: 6_000_000, recurring_total: 2_000_000, variable_total: 4_500_000,
    items: [
      { payee: '김영진', account: '지사수수료', current: 6_000_000, kind: 'fixed', months_seen: 4, avg: 5_900_000, spread: 1.05 },
      { payee: '신한카드', account: '카드대금', current: 2_000_000, kind: 'recurring', months_seen: 4, avg: 1_600_000, spread: 2.4 },
      { payee: '주식회사알수없는곳', account: '기타출금', current: 1_500_000, kind: 'variable', months_seen: 1, avg: 1_500_000, spread: 1 },
      { payee: '메트로은행', account: '강사급여송금', current: 1_000_000, kind: 'variable', months_seen: 2, avg: 1_100_000, spread: 1.3 },
    ],
  },
  /* 📈 «사라진» 거래처(status:'gone')를 반드시 포함한다 — 당월 목록만 보면 영영 안 보인다 */
  movers: [
    { payee: '주식회사알수없는곳', account: '기타출금', current: 1_500_000, prev: 0, delta: 1_500_000, delta_pct: null, status: 'new' },
    { payee: '김영진', account: '지사수수료', current: 6_000_000, prev: 5_500_000, delta: 500_000, delta_pct: 9.1, status: 'changed' },
    { payee: '메트로은행', account: '강사급여송금', current: 1_000_000, prev: 1_200_000, delta: -200_000, delta_pct: -16.7, status: 'changed' },
    { payee: '옛구독서비스', account: '기타출금', current: 0, prev: 900_000, delta: -900_000, delta_pct: -100, status: 'gone' },
  ],
  status: { state: 'ok', configured: true, message_ko: '계좌 연동 정상. 아래는 실제 입출금 내역입니다.', message_en: 'Bank sync is healthy.', last_sync_at: Date.UTC(2026, 6, 26, 0, 0), last_error: null, rows_total: 812, rows_month: 4 },
};

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

async function open(browser, width, height, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  /* 🪤 «환영 안내»(#aw-overlay)는 열릴 때 html{overflow:hidden} 을 걸고 사람이 닫아야 푼다.
        빈 브라우저는 «첫 방문자» 라 그게 계속 떠 있어 멀쩡한 화면도 실패로 나온다. */
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 모드 */ }
  });

  // 🏦 이 화면이 부르는 API 만 스텁한다. 나머지 관리자 API 는 빈 응답으로 조용히 돌려보낸다.
  await ctx.route('**/api/admin/reports/bank-expenses*', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(
        opts.empty ? { ...SEED, summary: { ...SEED.summary, out_total: 0, out_count: 0, review_total: 0, review_ratio: 0 }, categories: [], payees: [], rows: [] }
        : opts.noAssign ? { ...SEED, can_assign: false }
        : SEED) }));
  /* 🏷️ 계정과목 지정(2단계) — 실제로 어떤 요청이 나갔는지 브라우저 쪽에 적어 둔다.
     «화면만 바뀌고 서버에는 안 갔다» 는 사고를 잡기 위한 것이다(CLAUDE.md 2장 «시연 껍데기»). */
  await ctx.route('**/api/admin/reports/payees*', async route => {
    const u = route.request().url();
    await page.evaluate((rec) => { (window.__bkPosts = window.__bkPosts || []).push(rec); },
      { url: u, method: route.request().method() }).catch(() => {});
    if (opts.assignFails) {
      return route.fulfill({ status: 403, contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: '계정과목 지정은 본사 계정만 할 수 있습니다.' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await ctx.route('**/api/**', route => {
    const u = route.request().url();
    if (/bank-expenses|reports\/payees/.test(u)) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  /* 🪤 계정과목 지정은 `confirm()` 으로 한 번 확인한다(휠·방향키 오조작 방지).
        헤드리스는 기본이 «취소» 라 그대로 두면 저장 검사가 통째로 안 돈다. */
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  /* ⚠️ state:'attached' 로 기다린다 — 관리자 카드는 adm-ia6.js 가 `ia6-hide` 로
        **한 번에 한 장만** 보여 주므로, 처음에는 붙어 있어도 «보이지 않는다». */
  await page.waitForSelector('#acc-bankacct', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(2000);          // IA6 가 카드를 고르고 나서
  return { ctx, page };
}

/** 카드를 화면에 띄우고 펼친 뒤, 조회가 끝날 때까지 기다린다. */
async function openCard(page) {
  // 🧭 카드를 «보이게» 하는 정본은 jumpToMenu — 인라인으로 감추기/보이기를 흉내내지 않는다
  await page.evaluate(() => {
    try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-accounting-mgmt'); } catch (e) {}
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const d = document.getElementById('acc-bankacct');
    // 조상 details 까지 전부 펴야 화면에 들어온다
    let el = d;
    while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
    d.dispatchEvent(new Event('toggle'));
  });
  await page.waitForFunction(() => {
    const tb = document.getElementById('acc-bank-rows');
    return tb && !/조회\]를 눌러/.test(tb.textContent);
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);   // 차트(지연 로드)까지
}

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  try {
    /* ── ① PC — 값이 실제로 그려지는가 ─────────────────────────────────────── */
    console.log('\n[1] PC 1440×900 — KPI·표·차트가 실제로 그려지는가');
    {
      const { ctx, page } = await open(browser, 1440, 900);
      await openCard(page);

      const m = await page.evaluate(() => {
        const t = id => (document.getElementById(id) || {}).textContent || '';
        const rows = id => (document.getElementById(id) || {}).querySelectorAll
          ? document.getElementById(id).querySelectorAll('tr').length : 0;
        /* 🪤 `body{zoom:1.3}` 이라 getBoundingClientRect() 는 1.3 이 곱해진 값이 나온다
              (실측: 래퍼 220px → rect 286px). 레이아웃 값은 **offsetHeight** 로 재야 한다. */
        const box = id => {
          const el = document.getElementById(id); if (!el) return null;
          return { w: el.offsetWidth, h: el.offsetHeight };
        };
        return {
          total: t('bk-kpi-total'), totalSub: t('bk-kpi-total-sub'),
          prev: t('bk-kpi-prev'),
          prevColor: getComputedStyle(document.getElementById('bk-kpi-prev')).color,
          prevClass: document.getElementById('bk-kpi-prev').className,
          reviewCellColor: (() => {
            const tr = [].slice.call(document.querySelectorAll('#acc-bank-rows tr'))
              .find(r => /알수없는곳/.test(r.textContent));
            const td = tr && tr.querySelector('.bk-role-review');
            return td ? getComputedStyle(td).color : null;
          })(),
          review: t('bk-kpi-review'), reviewSub: t('bk-kpi-review-sub'),
          catRows: rows('acc-bank-cats'), payeeRows: rows('acc-bank-payees'), txRows: rows('acc-bank-rows'),
          catText: t('acc-bank-cats'), txText: t('acc-bank-rows'),
          status: t('acc-bank-status'),
          donut: box('acc-bank-donut'), line: box('acc-bank-line'),
        };
      });

      check('총 출금 KPI 에 실제 금액', /12,500,000/.test(m.total), m.total);
      check('건수 KPI', /4/.test(m.totalSub), m.totalSub);
      check('전월 대비 ▲25% (방향을 색이 아니라 기호로도 말한다)', /▲25%/.test(m.prev), m.prev);
      /* 🪤 이 화면의 색은 CSS 전역 규칙과 adm-light-surfaces 페인터가 인라인 !important 로
            갈아엎던 자리다(2026-08-23 실측: #b91c1c → rgb(55,92,129)). 클래스가 붙었는지가
            아니라 **화면에 실제로 나온 색**을 재야 그 사고를 잡는다. */
      check('지출이 늘면 위험 표시 (클래스)', /bk-sig-up/.test(m.prevClass), m.prevClass);
      /* ⚠️ KPI 타일은 테마에 따라 어두운 면이 되고, 그때 페인터(adm-s13·adm-light-surfaces)가
         빨강을 «읽히는 색» 으로 바꾸는 것이 **맞다**(어두운 면 위의 빨강은 안 읽힌다).
         그래서 색은 «흰 바탕이라 반드시 살아야 하는» 표에서 재고, KPI 는 클래스·▲▼ 로 확인한다. */
      check('「기타출금」 줄이 빨강 (실제 색)', (m.reviewCellColor || '').replace(/\s/g, '') === 'rgb(185,28,28)', String(m.reviewCellColor));
      check('미분류 금액', /1,500,000/.test(m.review), m.review);
      check('미분류 비율', /12%/.test(m.reviewSub), m.reviewSub);
      check('계정과목 표 4줄', m.catRows === 4, '실제 ' + m.catRows);
      check('거래처 표 4줄', m.payeeRows === 4, '실제 ' + m.payeeRows);
      // 씨앗은 5건 — 김영진이 «한 거래처 2건» 이라 합계/개별 구분 검사(⑪)에 쓰인다
      check('출금 내역 5줄', m.txRows === 5, '실제 ' + m.txRows);
      check('연동 상태 문구', /계좌 연동 정상/.test(m.status), m.status.slice(0, 40));
      check('적재 건수 표시', /812/.test(m.status), m.status.slice(0, 80));

      /* 🧭 핵심 — 화면이 DB 의 1차 분류(9종)가 아니라 손익계산서의 계정과목을 그리는가.
         씨앗의 「김영진(지성교」는 bank_category=기타출금 / account=지사수수료 다.
         화면에 「지사수수료」가 나와야 하고, 그 줄에 「기타출금」이 남으면 안 된다. */
      check('계정과목으로 그린다(지사수수료)', /지사수수료/.test(m.catText), '계정과목 표에 없음');
      const kimRow = await page.evaluate(() => {
        const tr = [].slice.call(document.querySelectorAll('#acc-bank-rows tr'))
          .find(r => /김영진/.test(r.textContent));
        return tr ? tr.textContent.replace(/\s+/g, ' ') : null;
      });
      check('잘린 적요의 계정과목이 지사수수료', !!kimRow && /지사수수료/.test(kimRow) && !/기타출금/.test(kimRow), kimRow);

      /* 📊 손익계산서에서 어떻게 취급되는지 화면이 말해 주는가 */
      check('「제외 — 중복」 표시(카드대금)', /제외/.test(m.catText), '중복 표시 없음');
      check('「확인 필요」 표시(기타출금)', /확인 필요/.test(m.catText), '확인 필요 표시 없음');

      /* 🪤 Chart.js — 높이를 정한 래퍼 안이라 220px 을 넘지 않아야 한다.
         부모에 높이가 없으면 리사이즈마다 누적해 카드 밖으로 한없이 길어진다. */
      check('도넛 높이 ≤ 230px', !!m.donut && m.donut.h > 0 && m.donut.h <= 230, JSON.stringify(m.donut));
      check('막대 높이 ≤ 230px', !!m.line && m.line.h > 0 && m.line.h <= 230, JSON.stringify(m.line));

      await ctx.close();
    }

    /* ── ② 창을 흔들어도 차트가 누적해서 길어지지 않는가 ────────────────────── */
    console.log('\n[2] 폭을 세 번 바꿔도 차트가 늘어나지 않는가 (Chart.js 누적 함정)');
    {
      const { ctx, page } = await open(browser, 1440, 900);
      await openCard(page);
      const h = async () => page.evaluate(() => {   // offsetHeight — body{zoom:1.3} 을 안 타는 자
        const a = document.getElementById('acc-bank-donut'), b = document.getElementById('acc-bank-line');
        return [a.offsetHeight, b.offsetHeight];
      });
      const before = await h();
      for (const w of [900, 1440, 700, 1200]) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.waitForTimeout(400);
      }
      const after = await h();
      check('도넛 높이 그대로', after[0] <= 230, `${before[0]} → ${after[0]}`);
      check('막대 높이 그대로', after[1] <= 230, `${before[1]} → ${after[1]}`);
      await ctx.close();
    }

    /* ── ③ 휴대폰 폭에서 가로로 넘치지 않는가 ──────────────────────────────── */
    console.log('\n[3] 390×844 — 표가 문서를 가로로 밀어내지 않는가');
    {
      const { ctx, page } = await open(browser, 390, 844);
      await openCard(page);
      const o = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        // 표는 자기 상자 안에서만 옆으로 굴러야 한다
        tableScrolls: [].slice.call(document.querySelectorAll('#acc-bankacct table'))
          .map(t => getComputedStyle(t.parentElement).overflowX),
      }));
      /* ⚠️ 헤드리스 크로미움의 최소 뷰포트가 500px 이라 «스크린샷 눈대중» 은 못 믿는다.
            그래서 scrollWidth 를 직접 잰다(CLAUDE.md 2장). */
      check('문서가 가로로 안 넘침', o.scrollW <= o.inner + 2, `scrollWidth=${o.scrollW} innerWidth=${o.inner}`);
      check('표는 자기 상자 안에서 굴러감', o.tableScrolls.every(v => v === 'auto' || v === 'scroll'), o.tableScrolls.join(','));
      await ctx.close();
    }

    /* ── ④ 자료가 없는 달 — 가짜 숫자를 채우지 않는가 ──────────────────────── */
    console.log('\n[4] 출금이 없는 달 — ₩0 을 «실제 0원» 으로 오인시키지 않는가');
    {
      const { ctx, page } = await open(browser, 1440, 900, { empty: true });
      await openCard(page);
      const t = await page.evaluate(() => ({
        rows: (document.getElementById('acc-bank-rows') || {}).textContent || '',
        cats: (document.getElementById('acc-bank-cats') || {}).textContent || '',
      }));
      check('내역 없음을 말로 알린다', /없습니다/.test(t.rows), t.rows.trim().slice(0, 50));
      check('계정과목 표도 비운다', /없습니다|—/.test(t.cats), t.cats.trim().slice(0, 50));
      await ctx.close();
    }

    /* ── ⑥ 🏷️ 계정과목 지정 (2단계) ────────────────────────────────────────── */
    console.log('\n[6] 거래처 표에서 그 자리에서 계정과목 지정');
    {
      const { ctx, page } = await open(browser, 1440, 900);
      await openCard(page);

      const cells = await page.evaluate(() =>
        [].slice.call(document.querySelectorAll('#acc-bank-payees tr')).map(tr => {
          const tds = tr.querySelectorAll('td');
          return {
            payee: tds[0] ? tds[0].textContent.trim() : '',
            last: tds[4] ? tds[4].textContent.trim() : '',
            hasSelect: !!tr.querySelector('select.bk-assign'),
          };
        }));
      const kim = cells.find(c => /김영진/.test(c.payee));
      const card = cells.find(c => /신한카드/.test(c.payee));

      check('지정 가능한 거래처엔 고르는 칸', !!kim && kim.hasSelect, JSON.stringify(kim));
      /* 🪤 은행 적요로 이미 분류된 거래처는 지정해도 안 바뀐다 — 칸을 내면 사장님이
            지정해 놓고 「저장이 안 된다」고 읽는다(에러가 안 나기 때문). 이유를 적어야 한다. */
      check('안 바뀌는 거래처엔 칸 대신 이유', !!card && !card.hasSelect && /안 바뀝니다/.test(card.last), JSON.stringify(card));

      const note = await page.evaluate(() => (document.getElementById('acc-bank-assign-note') || {}).textContent || '');
      check('«지난 출금까지 바뀐다» 를 알린다', /지난 출금까지/.test(note), note.slice(0, 60));

      // 실제로 고르면 서버로 나가는가 — 화면만 바뀌는 «시연 껍데기» 가 아닌지
      await page.evaluate(() => {
        const sel = [].slice.call(document.querySelectorAll('#acc-bank-payees select.bk-assign'))
          .find(s => s.getAttribute('data-payee') === '주식회사알수없는곳');
        sel.value = '지급수수료';
        sel.dispatchEvent(new Event('change'));
      });
      await page.waitForTimeout(1500);
      const posts = await page.evaluate(() => window.__bkPosts || []);
      const hit = posts.find(p => /payee=/.test(p.url));
      check('서버로 POST 가 실제로 나간다', !!hit && hit.method === 'POST', JSON.stringify(posts).slice(0, 160));
      check('거래처·계정과목이 함께 실린다',
        !!hit && decodeURIComponent(hit.url).indexOf('payee=주식회사알수없는곳') >= 0
              && decodeURIComponent(hit.url).indexOf('category=지급수수료') >= 0,
        hit ? decodeURIComponent(hit.url) : '(없음)');
      await ctx.close();
    }

    /* ── ⑦ 지정할 수 없는 계정 / 저장 실패 ────────────────────────────────── */
    console.log('\n[7] 본사가 아니면 칸을 안 낸다 · 저장이 실패하면 말로 알린다');
    {
      const { ctx, page } = await open(browser, 1440, 900, { noAssign: true });
      await openCard(page);
      const r = await page.evaluate(() => ({
        selects: document.querySelectorAll('#acc-bank-payees select.bk-assign').length,
        note: (document.getElementById('acc-bank-assign-note') || {}).textContent || '',
      }));
      /* 서버는 403 으로 막지만 화면도 함께 감춘다 — 서버만 있으면 «눌러도 안 되는 칸» 이 남는다 */
      check('본사가 아니면 고르는 칸 0개', r.selects === 0, '실제 ' + r.selects);
      check('왜 못 하는지 적는다', /본사 계정만/.test(r.note), r.note.slice(0, 50));
      await ctx.close();
    }
    {
      const { ctx, page } = await open(browser, 1440, 900, { assignFails: true });
      await openCard(page);
      await page.evaluate(() => {
        const sel = [].slice.call(document.querySelectorAll('#acc-bank-payees select.bk-assign'))
          .find(s => s.getAttribute('data-payee') === '주식회사알수없는곳');
        sel.value = '지급수수료';
        sel.dispatchEvent(new Event('change'));
      });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({
        note: (document.getElementById('acc-bank-assign-note') || {}).textContent || '',
        // 실패했으면 고른 값을 되돌려야 한다 — 안 그러면 «저장된 줄» 안다
        val: (function () {
          const s = [].slice.call(document.querySelectorAll('#acc-bank-payees select.bk-assign'))
            .find(s => s.getAttribute('data-payee') === '주식회사알수없는곳');
          return s ? s.value : '(없음)';
        })(),
      }));
      check('저장 실패를 말로 알린다', /저장하지 못했습니다/.test(r.note), r.note.slice(0, 70));
      check('실패하면 고른 값을 되돌린다', r.val !== '지급수수료', r.val);
      await ctx.close();
    }

    /* ── ⑨ 🎨 «적은 대로 화면에 나오는가» — 전역 CSS·페인터가 덮는 자리 ──────────
       2026-08-23 함정 대조가 실측으로 잡은 것이다: `<select>` 의 인라인 style 이
       `[id^="card-"] select{…!important}` 에 통째로 져서 11px→13.5px 로 부풀고,
       안내줄 갈색은 `#101828` 로 눌렸다. 코드만 보면 «있는» 값이라 이 검사가 없으면
       또 놓친다. 반드시 **getComputedStyle 로 실측**한다. */
    console.log('\n[9] 적은 대로 화면에 나오는가 (전역 CSS 가 덮는 자리)');
    {
      const { ctx, page } = await open(browser, 1440, 900);
      await openCard(page);
      const st = await page.evaluate(() => {
        const sel = document.querySelector('#acc-bank-payees select.bk-assign');
        const note = document.getElementById('acc-bank-assign-note');
        const mute = document.querySelector('#acc-bank-payees .bk-note-mute');
        const cs = e => e ? getComputedStyle(e) : null;
        const a = cs(sel), b = cs(note), c = cs(mute);
        return {
          selFont: a && a.fontSize, selPadTop: a && a.paddingTop, selPadLeft: a && a.paddingLeft,
          selBox: a && a.boxSizing, selMax: a && a.maxWidth,
          noteColor: b && b.color, muteColor: c && c.color,
        };
      });
      check('지정 칸 글자 11px', st.selFont === '11px', String(st.selFont));
      check('지정 칸 여백 3px 5px', st.selPadTop === '3px' && st.selPadLeft === '5px',
        st.selPadTop + ' / ' + st.selPadLeft);
      check('지정 칸이 테두리를 포함해 폭을 센다', st.selBox === 'border-box', String(st.selBox));
      check('지정 칸이 칸 밖으로 안 넘친다', st.selMax === '160px', String(st.selMax));
      /* 🪤 「지난 출금까지 바뀐다」는 경고로 읽혀야 한다 — 본문색으로 눌리면 안 된다 */
      check('안내줄이 경고색으로 나온다', (st.noteColor || '').replace(/\s/g, '') === 'rgb(120,53,15)',
        String(st.noteColor));
      check('설명 글자가 회색으로 나온다', (st.muteColor || '').replace(/\s/g, '') === 'rgb(107,114,128)',
        String(st.muteColor));
      await ctx.close();
    }

    /* ── ⑩ 「기타출금」 = 지정 지우기 — 지울 것이 없으면 못 고른다 ───────────── */
    console.log('\n[10] 「기타출금」은 «지정 지우기» — 아무 일도 안 일어나는 선택을 막는다');
    {
      const { ctx, page } = await open(browser, 1440, 900);
      await openCard(page);
      const o = await page.evaluate(() => {
        const pick = p => [].slice.call(document.querySelectorAll('#acc-bank-payees select.bk-assign'))
          .find(s => s.getAttribute('data-payee') === p);
        const info = s => s ? [].slice.call(s.options).map(x => ({ v: x.value, t: x.textContent, d: x.disabled })) : null;
        return { assigned: info(pick('김영진')), notAssigned: info(pick('주식회사알수없는곳')) };
      });
      const clearOf = (arr) => (arr || []).find(x => x.v === '기타출금');
      check('「기타출금」 라벨이 «지정 지우기» 로 나온다', /지정 지우기/.test((clearOf(o.assigned) || {}).t || ''),
        String((clearOf(o.assigned) || {}).t));
      check('지정된 거래처는 지울 수 있다', clearOf(o.assigned) && clearOf(o.assigned).d === false);
      /* 🪤 지정이 없던 곳에서 고르면 서버는 DELETE 를 하지만 지울 것이 없어 아무 일도
            안 일어나고 «성공» 으로 보인다 — 그 선택 자체를 막는다 */
      check('지정이 없던 거래처는 못 고른다', clearOf(o.notAssigned) && clearOf(o.notAssigned).d === true,
        JSON.stringify(clearOf(o.notAssigned)));
      /* 🪤 option 의 disabled·라벨만 보면 **닫힌 select 가 무엇을 보여 주는지**를 못 잡는다.
         「기타출금」은 계정과목 목록에도 들어 있어서, 아직 지정 안 된 거래처는 그 option 이
         selected 이면서 disabled 가 된다 — 그때 라벨까지 «지정 지우기» 면 그것이 «현재
         계정과목» 인 것처럼 보인다(2026-08-23 함정 대조가 실측으로 잡음). */
      const shown = await page.evaluate(() => {
        const pick = p => [].slice.call(document.querySelectorAll('#acc-bank-payees select.bk-assign'))
          .find(s => s.getAttribute('data-payee') === p);
        const cur = s => (s && s.selectedIndex >= 0) ? s.options[s.selectedIndex].textContent.trim() : null;
        return { notAssigned: cur(pick('주식회사알수없는곳')), assigned: cur(pick('김영진')) };
      });
      check('지정 안 된 줄은 «기타출금» 그대로 보인다 (지우기 문구가 안 붙는다)',
        shown.notAssigned === '기타출금', String(shown.notAssigned));
      check('지정된 줄은 현재 계정과목이 보인다', shown.assigned === '지사수수료', String(shown.assigned));
      await ctx.close();
    }

    /* ── ⑧ 🔁 고정비·변동비 · 📈 증감 Top · 📥 엑셀 (3단계) ─────────────────── */
    console.log('\n[8] 고정비·변동비 · 전월 대비 증감 · 엑셀 내보내기');
    {
      const { ctx, page } = await open(browser, 1440, 900);
      await openCard(page);

      const r = await page.evaluate(() => {
        const txt = id => (document.getElementById(id) || {}).textContent || '';
        const rowsOf = id => [].slice.call(document.querySelectorAll('#' + id + ' tr'))
          .map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
        return {
          sum: txt('acc-bank-recur-sum'),
          note: txt('acc-bank-recur-note'),
          recur: rowsOf('acc-bank-recur'),
          title: txt('acc-bank-movers-title'),
          up: rowsOf('acc-bank-movers-up'),
          down: rowsOf('acc-bank-movers-down'),
          hasXlsxBtn: !!document.getElementById('acc-bank-xlsx-btn'),
        };
      });

      check('고정비 합계를 그린다', /6,000,000/.test(r.sum), r.sum.replace(/\s+/g, ' ').slice(0, 70));
      check('세 묶음(고정·반복·변동) 전부', /고정비/.test(r.sum) && /반복/.test(r.sum) && /변동비/.test(r.sum),
        r.sum.replace(/\s+/g, ' ').slice(0, 70));
      check('고정비가 맨 위로 정렬', /김영진/.test(r.recur[0] || ''), r.recur[0]);
      /* 🪤 «패턴 추정» 이라 근거가 같은 줄에 있어야 한다 — 숫자만 주면 확인할 방법이 없다 */
      check('근거(몇 달 나왔는지)를 함께', /4\/4개월/.test(r.recur[0] || ''), r.recur[0]);
      check('근거(금액 폭)를 함께', /×1\.05/.test(r.recur[0] || ''), r.recur[0]);
      check('«패턴 추정» 임을 밝힌다', /패턴 추정/.test(r.note), r.note.slice(0, 60));
      check('창 기간을 밝힌다', /2026-04/.test(r.note) && /2026-07/.test(r.note), r.note.slice(0, 90));

      check('증감 제목에 비교 대상 두 달', /2026-06/.test(r.title) && /2026-07/.test(r.title), r.title);
      check('늘어난 곳 — 새로 생긴 것 포함', r.up.some(t => /주식회사알수없는곳/.test(t) && /새로 생김/.test(t)), r.up.join(' | ').slice(0, 90));
      check('늘어난 곳 — 큰 것부터', /주식회사알수없는곳/.test(r.up[0] || ''), r.up[0]);
      /* 🪤 «사라진» 거래처는 당월 목록에 없어서 안 보이기 쉽다 — 반드시 나와야 한다 */
      check('줄어든 곳 — «사라짐» 이 보인다', r.down.some(t => /옛구독서비스/.test(t) && /사라짐/.test(t)), r.down.join(' | ').slice(0, 90));
      check('줄어든 곳 — 많이 줄어든 것부터', /옛구독서비스/.test(r.down[0] || ''), r.down[0]);
      check('엑셀 버튼이 있다', r.hasXlsxBtn, '없음');

      // 📥 엑셀 — 새 창(window.open)이 아니라 같은 창으로 나가야 한다(인앱 브라우저)
      const exportUrl = await page.evaluate(() => {
        let got = null;
        const d = Object.getOwnPropertyDescriptor(window.location, 'href');
        // location 을 못 갈아끼우는 브라우저를 대비해, 함수가 무엇을 만드는지만 확인한다
        const orig = window.location.assign;
        try {
          Object.defineProperty(window, '__bkOpenCalled', { value: false, writable: true });
          const openOrig = window.open;
          window.open = function () { window.__bkOpenCalled = true; return null; };
          const src = String(window.bankExpExport);
          window.open = openOrig;
          got = { src, openUsed: /window\.open/.test(src) };
        } catch (e) { got = { src: '', openUsed: false }; }
        void d; void orig;
        return got;
      });
      check('엑셀은 window.open 을 안 쓴다', !exportUrl.openUsed, '(인앱 브라우저는 새 창을 못 엽니다)');
      check('내보내기 주소에 format 이 실린다', /format=/.test(exportUrl.src), exportUrl.src.slice(0, 120));

      await ctx.close();
    }

    /* ── ⑪ 🔎 «합계» 와 «한 건» 을 구분해서 보여 주는가 (2026-08-23) ──────────
       사장님 물음: 「이상호 두 개는 무슨 차이야?」 — 「🏪 거래처별 합계」의 2건 합계와
       「🧾 출금 내역」의 개별 한 건이 같은 이름·비슷한 금액으로 나란히 보였다. */
    console.log('\n[11] 합계 줄에 «N건 합계» + 이름을 눌러 개별 건 펼치기');
    {
      const { ctx, page } = await open(browser, 1440, 900);
      await openCard(page);

      const before = await page.evaluate(() => {
        const rows = [].slice.call(document.querySelectorAll('#acc-bank-payees tr'));
        const kim = rows.find(r => /김영진/.test(r.textContent));
        const one = rows.find(r => /메트로은행/.test(r.textContent));
        return {
          kim: kim ? kim.textContent.replace(/\s+/g, ' ').trim() : null,
          one: one ? one.textContent.replace(/\s+/g, ' ').trim() : null,
          kimClickable: !!(kim && kim.querySelector('.bk-exp')),
          oneClickable: !!(one && one.querySelector('.bk-exp')),
          detailRows: document.querySelectorAll('#acc-bank-payees tr.bk-detail').length,
          header: (document.querySelector('#acc-bank-payees')
            ? document.getElementById('acc-bank-payees').closest('table').querySelector('thead').textContent
            : '').replace(/\s+/g, ' ').trim(),
          note: [].slice.call(document.querySelectorAll('#acc-bankacct .bk-note-mute'))
            .map(e => e.textContent).join(' | '),
        };
      });

      check('합계 줄에 «2건 합계» 가 적힌다', /2건 합계/.test(before.kim || ''), before.kim);
      check('헤더가 «합계 금액» 이라고 말한다', /합계 금액/.test(before.header), before.header.slice(0, 60));
      check('표 아래에 «합계 vs 한 건» 을 설명한다', /개별 건이 펼쳐집니다/.test(before.note), before.note.slice(0, 90));
      check('2건 이상인 거래처는 이름을 누를 수 있다', before.kimClickable === true);
      /* 🪤 1건짜리는 펼칠 것이 없다 — 누를 수 있게 두면 «눌렀는데 아무 일도 안 일어남» 이 된다 */
      check('1건짜리 거래처는 누를 수 없다', before.oneClickable === false);
      check('처음에는 접혀 있다', before.detailRows === 0, String(before.detailRows));

      // 눌러서 펼친다
      await page.evaluate(() => {
        const el = document.querySelector('#acc-bank-payees .bk-exp[data-exp="김영진"]');
        el.click();
      });
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => {
        const d = document.querySelector('#acc-bank-payees tr.bk-detail');
        return {
          count: document.querySelectorAll('#acc-bank-payees tr.bk-detail').length,
          text: d ? d.textContent.replace(/\s+/g, ' ').trim() : '',
          innerRows: d ? d.querySelectorAll('table tr').length : 0,
          marker: (document.querySelector('#acc-bank-payees .bk-exp[data-exp="김영진"]') || {}).textContent || '',
        };
      });
      check('누르면 펼쳐진다', after.count === 1, String(after.count));
      /* 🪤 묶는 키가 서버와 다르면 «합계는 2건인데 펼치면 1건» 이 조용히 생긴다 */
      check('합계 건수만큼 개별 건이 나온다 (2건)', after.innerRows === 2, String(after.innerRows));
      check('개별 금액이 보인다', /3,600,000/.test(after.text) && /2,400,000/.test(after.text), after.text.slice(0, 110));
      check('펼침 표시가 ▾ 로 바뀐다', /▾/.test(after.marker), after.marker);

      // 계정과목을 지정하면 화면 전체가 다시 그려진다 — 그때도 펼침이 유지돼야 한다
      await page.evaluate(() => {
        const sel = [].slice.call(document.querySelectorAll('#acc-bank-payees select.bk-assign'))
          .find(s => s.getAttribute('data-payee') === '주식회사알수없는곳');
        sel.value = '지급수수료';
        sel.dispatchEvent(new Event('change'));
      });
      await page.waitForTimeout(1500);
      const kept = await page.evaluate(() => document.querySelectorAll('#acc-bank-payees tr.bk-detail').length);
      check('다시 조회해도 펼친 것이 유지된다', kept === 1, String(kept));

      // 다시 누르면 접힌다
      await page.evaluate(() => {
        const el = document.querySelector('#acc-bank-payees .bk-exp[data-exp="김영진"]');
        if (el) el.click();
      });
      await page.waitForTimeout(300);
      const closed = await page.evaluate(() => document.querySelectorAll('#acc-bank-payees tr.bk-detail').length);
      check('다시 누르면 접힌다', closed === 0, String(closed));

      /* 🪤 색은 전역 CSS·페인터가 덮던 자리다 — 실제로 나온 색을 잰다 */
      const color = await page.evaluate(() => {
        const el = document.querySelector('#acc-bank-payees .bk-exp');
        return el ? getComputedStyle(el).color : null;
      });
      check('누를 수 있다는 것이 색으로 보인다', (color || '').replace(/\s/g, '') === 'rgb(30,64,175)', String(color));

      await ctx.close();
    }

    /* ── ⑤ 🌐 EN 전환 — JS 로 그린 글자가 따라오는가 ───────────────────────── */
    console.log('\n[5] 언어 전환 — JS 로 그린 라벨이 EN 을 따라오는가');
    {
      const { ctx, page } = await open(browser, 1440, 900);
      await openCard(page);
      await page.evaluate(() => {
        window.adminLang = 'en';
        document.dispatchEvent(new CustomEvent('mangoi:lang-changed', { detail: { lang: 'en' } }));
      });
      await page.waitForTimeout(600);
      const t = await page.evaluate(() => ({
        sub: (document.getElementById('bk-kpi-total-sub') || {}).textContent || '',
        cats: (document.getElementById('acc-bank-cats') || {}).textContent || '',
      }));
      check('KPI 부제가 영문으로', /transactions/i.test(t.sub), t.sub);
      check('표의 취급 설명이 영문으로', /Excluded|Counted|Needs|Moved/i.test(t.cats), t.cats.slice(0, 60));
      await ctx.close();
    }

    console.log(`\n════ 결과: ✅ ${PASS}  ❌ ${FAIL} ════`);
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  process.exit(FAIL ? 1 : 0);
})();
