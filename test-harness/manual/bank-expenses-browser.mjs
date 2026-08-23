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
    { payee: '김영진', total: 6_000_000, count: 1, account: '지사수수료', first_at: '2026-07-05 10:00', last_at: '2026-07-05 10:00', assigned: true },
    { payee: '신한카드', total: 2_000_000, count: 1, account: '카드대금', first_at: '2026-07-15 09:00', last_at: '2026-07-15 09:00', assigned: false },
    { payee: '주식회사알수없는곳', total: 1_500_000, count: 1, account: '기타출금', first_at: '2026-07-20 14:00', last_at: '2026-07-20 14:00', assigned: false },
    { payee: '메트로은행', total: 1_000_000, count: 1, account: '강사급여송금', first_at: '2026-07-25 11:00', last_at: '2026-07-25 11:00', assigned: false },
  ],
  rows: [
    { id: 4, datetime: '2026-07-25 11:00', remark: '메트로은행 송금', payee: '메트로은행', bank_category: '강사급여송금', account: '강사급여송금', role: 'moved', amount: 1_000_000, balance: 3_000_000, memo: '' },
    { id: 3, datetime: '2026-07-20 14:00', remark: '주식회사알수없는곳', payee: '주식회사알수없는곳', bank_category: '기타출금', account: '기타출금', role: 'review', amount: 1_500_000, balance: 4_000_000, memo: '' },
    { id: 2, datetime: '2026-07-15 09:00', remark: '신한카드 결제', payee: '신한카드', bank_category: '카드대금', account: '카드대금', role: 'dup', amount: 2_000_000, balance: 5_500_000, memo: '' },
    { id: 1, datetime: '2026-07-05 10:00', remark: '김영진(지성교', payee: '김영진', bank_category: '기타출금', account: '지사수수료', role: 'opex', amount: 6_000_000, balance: 7_500_000, memo: '' },
  ],
  history: [
    { month: '2026-02', total: 9_000_000, count: 3 }, { month: '2026-03', total: 9_500_000, count: 3 },
    { month: '2026-04', total: 10_500_000, count: 4 }, { month: '2026-05', total: 12_000_000, count: 5 },
    { month: '2026-06', total: 10_000_000, count: 4 }, { month: '2026-07', total: 12_500_000, count: 4 },
  ],
  account_options: ['지사수수료', '광고선전비', '지급수수료', '기타출금'],
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
      body: JSON.stringify(opts.empty ? { ...SEED, summary: { ...SEED.summary, out_total: 0, out_count: 0, review_total: 0, review_ratio: 0 }, categories: [], payees: [], rows: [] } : SEED) }));
  await ctx.route('**/api/**', route => {
    if (/bank-expenses/.test(route.request().url())) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

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
      check('출금 내역 4줄', m.txRows === 4, '실제 ' + m.txRows);
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
