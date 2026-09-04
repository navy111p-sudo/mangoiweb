/*
 * 📊 결재 「지출 정리」 — 실제 브라우저에서 무슨 숫자를 보여 주는가 (2026-09-04)
 *
 *   [왜 브라우저로 재나]
 *     합계는 **틀려도 에러가 안 납니다.** 문자열 검사는 「그 줄이 있는가」까지만 보고,
 *     여기서 알고 싶은 것은 «화면에 무슨 글자가 나오는가» 입니다 —
 *       · PHP 와 KRW 가 정말 «따로» 보이는가(합쳐서 하나로 그리지 않는가)
 *       · 「이 합계가 말하지 않는 것」이 실제로 뜨는가
 *       · 접혀 있는 동안 서버를 안 부르는가(첫 화면 예산)
 *
 *   [짝으로 본다]
 *     「모르는 것을 말한다」만 검사하면 **늘 그 상자를 그리는 코드**도 통과합니다.
 *     그래서 「채워진 데이터에서는 안 뜬다」를 함께 셉니다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-report-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 지출 정리를 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

/* ⚠️ 합계를 손으로 적지 않는다 — 정본 summarizeApprovals 를 그대로 돌려
   서버가 내려주는 것과 **같은 값**을 스텁으로 쓴다. 손으로 적으면 정본을 되돌려도
   검사가 통과한다(2026-09-04 approval-attach-browser 가 실제로 그랬다). */
const P = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                     'cloudflare-deploy', 'src', 'approval-policy.ts')).href);

const TYPES = P.TYPES.map((t) => ({
  key: t.key, ko: t.ko, en: t.en, needs_amount: t.needsAmount,
  wants_file: t.wantsFile, requires_file: !!t.requiresFile,
  wants_dates: !!t.wantsDates, wants_category: !!t.wantsCategory,
  picks_period: t.key === 'hr',
}));
const CATS = P.CATEGORIES.map((c) => ({ key: c.key, ko: c.ko, en: c.en, account: c.account }));

const KST = (d) => Date.parse(d + 'T00:00:00+09:00') + 12 * 3600_000;

/** 통화가 둘이고 «모르는 것» 이 여럿인 행 — 화면이 무엇을 말하는지 다 보이게. */
const RICH_ROWS = [
  { req_type: 'expense',  status: 'approved', category: 'utility',   amount: 3500, currency: 'PHP', spent_at: '2026-09-02', created_at: KST('2026-09-02'), file_key: 'a' },
  { req_type: 'expense',  status: 'approved', category: 'utility',   amount: 120000, currency: 'KRW', spent_at: '2026-09-03', created_at: KST('2026-09-03'), file_key: 'b' },
  { req_type: 'purchase', status: 'pending',  category: 'equipment', amount: 900, currency: 'PHP', spent_at: null, created_at: KST('2026-09-04'), file_key: 'c' },
  { req_type: 'expense',  status: 'rejected', category: 'meal',      amount: 99999, currency: 'PHP', spent_at: '2026-09-01', created_at: KST('2026-09-01'), file_key: 'd' },
  { req_type: 'expense',  status: 'approved', category: null,        amount: null, currency: 'PHP', spent_at: null, created_at: KST('2026-08-30'), file_key: null },
];
/* 「모르는 것」이 하나도 없는 행 — 짝 검사용(그 상자가 늘 뜨면 안 된다). */
const CLEAN_ROWS = [
  { req_type: 'expense', status: 'approved', category: 'utility', amount: 100, currency: 'PHP', spent_at: '2026-09-02', created_at: KST('2026-09-02'), file_key: 'a' },
];

const RICH = P.summarizeApprovals(RICH_ROWS);
const CLEAN = P.summarizeApprovals(CLEAN_ROWS);

const HOME = {
  ok: true,
  me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
  colleagues: [], my_delegate: null, can_approve: true, pending: 0,
  types: TYPES, categories: CATS, inbox: [], mine: [], reuse: [], urgent: [],
};

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());

  await page.addInitScript(({ home, rich, clean }) => {
    try { localStorage.setItem('mangoi_lang', 'ko'); localStorage.removeItem('mangoi_work_draft_v1'); } catch (e) {}
    window.__REPORT_CALLS = [];
    window.__USE_CLEAN = false;
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(home), { status: 200 }));
      }
      if (u.indexOf('view=report') >= 0) {
        window.__REPORT_CALLS.push(u);
        const s = window.__USE_CLEAN ? clean : rich;
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, summary: s, truncated: false, max: 2000,
        }), { status: 200 }));
      }
      if (u.indexOf('/api/approval/requests') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, items: [], has_more: false }), { status: 200 }));
      }
      if (u.indexOf('/api/push/vapid-public-key') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, { home: HOME, rich: RICH, clean: CLEAN });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const txt = () => page.evaluate(() => {
    const e = document.getElementById('repResult'); return e ? e.innerText : '';
  });

  /* ── ⓪ 전제 ─────────────────────────────────────────────────────────── */
  console.log('\n[0] 전제 — 정본을 실제로 돌려 스텁을 만들었는가');
  check('합계를 정본으로 계산했다', RICH.counted === RICH_ROWS.length, RICH.counted + '건');
  check('통화가 둘인 데이터다 (아래 검사가 뜻을 가지려면)',
    RICH.approved_money.length === 2, JSON.stringify(RICH.approved_money.map((m) => m.currency)));
  check('짝 검사용 «깨끗한» 데이터에는 모르는 것이 없다',
    CLEAN.no_category === 0 && CLEAN.no_amount === 0 && CLEAN.no_file === 0);

  /* ── ① 첫 화면 예산 ────────────────────────────────────────────────── */
  console.log('\n[1] 첫 화면 — 접혀 있는 동안은 안 부른다');
  check('열기 전에는 서버를 안 부른다',
    (await page.evaluate(() => window.__REPORT_CALLS.length)) === 0);
  check('패널이 접혀 있다',
    (await page.evaluate(() => document.getElementById('repPanel').hidden)) === true);

  await page.click('#repBtn');
  await page.waitForTimeout(600);
  let calls = await page.evaluate(() => window.__REPORT_CALLS);
  check('누르면 한 번 부른다 (짝 검사 — 안 부르는 코드는 여기서 걸린다)',
    calls.length === 1, calls.length + '회');
  check('기간을 안 정해도 «이번 달 1일» 부터로 물어본다 (전 기간이면 「이번 달」에 답을 못 한다)',
    calls.length === 1 && /from=\d{4}-\d{2}-01/.test(calls[0]), calls[0]);

  await page.click('#repBtn'); await page.waitForTimeout(120);
  await page.click('#repBtn'); await page.waitForTimeout(400);
  calls = await page.evaluate(() => window.__REPORT_CALLS);
  check('닫았다 다시 열어도 또 안 부른다 (이미 받은 것을 다시 그린다)',
    calls.length === 1, calls.length + '회');

  /* ── ② 통화 ────────────────────────────────────────────────────────── */
  console.log('\n[2] 통화 — 화면에 «따로» 보이는가');
  const t = await txt();
  check('PHP 금액이 보인다', /3,500|₱\s?3,500|PHP/.test(t), JSON.stringify(t.slice(0, 120)));
  check('KRW 금액도 함께 보인다', /120,000/.test(t), JSON.stringify(t.slice(0, 200)));
  check('⛔ 둘을 더한 숫자가 화면에 없다 (123,500)', t.indexOf('123,500') < 0);

  /* ── ③ 상태를 갈라 말하는가 ───────────────────────────────────────── */
  console.log('\n[3] 승인 · 대기를 갈라 말하는가');
  check('«승인» 칸이 있다', /승인/.test(t));
  check('«대기» 칸이 있다', /대기/.test(t));
  /* ⛔ 「그 숫자가 안 보인다」로만 물으면 안 된다 — 반려분이 승인에 **더해지면**
     99,999 가 아니라 103,499 가 되어 그 글자가 사라지고 검사가 통과한다
     (2026-09-04 변이시험에서 실제로 그 상태로 통과했다).
     ✅ 승인 칸의 «값 자체» 를 본다. 3,500·120,000 은 위 스텁 행에서 나온 사실이다. */
  const okCard = await page.evaluate(() => {
    const c = document.querySelectorAll('#repResult .repcard');
    return c.length ? { ap: c[0].querySelector('.rv').textContent.trim(),
                        pd: c[1] ? c[1].querySelector('.rv').textContent.trim() : null } : null;
  });
  check('승인 칸이 «승인된 것만» 을 적는다 (반려가 섞이면 숫자가 달라진다)',
    !!okCard && /3,500/.test(okCard.ap) && /120,000/.test(okCard.ap)
             && okCard.ap.indexOf('103,499') < 0 && okCard.ap.indexOf('99,999') < 0,
    JSON.stringify(okCard));
  check('⛔ 반려 금액(99,999)이 화면 어디에도 없다', t.indexOf('99,999') < 0);
  check('대기 칸은 대기분만 (승인과 안 섞인다)',
    !!okCard && /900/.test(okCard.pd) && okCard.pd.indexOf('3,500') < 0,
    JSON.stringify(okCard));

  /* ── ④ 항목별 ──────────────────────────────────────────────────────── */
  console.log('\n[4] 항목별');
  check('고른 항목의 이름이 보인다', t.indexOf('공과금') >= 0, JSON.stringify(t.slice(0, 300)));
  check('회계 계정도 함께 보인다 (엑셀·회계와 대조하려고)', t.indexOf('공과금·통신') >= 0);
  check('항목을 안 고른 건은 «항목 없음» 으로 보인다', t.indexOf('항목 없음') >= 0);
  check('대기 중인 항목도 보인다 (예정된 지출)', t.indexOf('장비') >= 0);

  /* ── ⑤ 🔴 모르는 것을 말하는가 ─────────────────────────────────────── */
  console.log('\n[5] «이 합계가 말하지 않는 것»');
  check('그 상자가 뜬다', t.indexOf('말하지 않는 것') >= 0, JSON.stringify(t.slice(-400)));
  check('항목 없는 건을 말한다', /항목이 없습니다/.test(t));
  check('금액 없는 건을 말한다', /금액이 없는/.test(t));
  check('영수증 없는 건을 말한다', /영수증/.test(t));
  check('지출일이 없어 올린 날로 잡은 건을 말한다', /올린 날/.test(t));

  // 짝 검사 — 다 채워진 데이터에서는 그 상자가 «안» 떠야 한다
  await page.evaluate(() => { window.__USE_CLEAN = true; window.REP = null; });
  await page.evaluate(() => window.runRep());
  await page.waitForTimeout(500);
  const t2 = await txt();
  check('짝 검사 — 다 채워진 달에는 그 상자가 안 뜬다 (늘 뜨는 코드는 여기서 걸린다)',
    t2.indexOf('말하지 않는 것') < 0, JSON.stringify(t2.slice(-300)));
  check('그래도 합계는 보인다', /100/.test(t2), JSON.stringify(t2.slice(0, 150)));

  /* ── ⑥ 언어 ────────────────────────────────────────────────────────── */
  console.log('\n[6] 언어를 바꾸면 따라오는가');
  await page.evaluate(() => { window.__USE_CLEAN = false; });
  await page.evaluate(() => window.runRep());
  await page.waitForTimeout(400);
  await page.evaluate(() => window.toggleLang());
  await page.waitForTimeout(400);
  const en = await txt();
  check('영어로 바뀐다 (JS 로 그린 글자는 data-ko 루프가 못 건드린다)',
    /Approved|Waiting|By item/.test(en) && en.indexOf('항목 없음') < 0,
    JSON.stringify(en.slice(0, 200)));
  check('영어에서도 «모르는 것» 을 말한다', /does not include/.test(en));
  await page.evaluate(() => window.toggleLang());
  await page.waitForTimeout(400);

  /* ── ⑦ 좁은 화면 ───────────────────────────────────────────────────── */
  console.log('\n[7] 폰 폭 390px');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  check('문서가 가로로 넘치지 않는다',
    !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));

  /* 표 칸이 낱글자로 쪼개지지 않는가 — 「짧은 라벨에 flex 를 썼더니」의 표 판.
     칸 높이 ÷ lineHeight 가 3 이상이면 쪼개진 것이다(CLAUDE.md 2장). */
  const split = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#repResult .reptbl td').forEach((td) => {
      const lh = parseFloat(getComputedStyle(td).lineHeight) || 18;
      const lines = td.getBoundingClientRect().height / lh;
      if (lines >= 3) bad.push([td.textContent.trim().slice(0, 20), Math.round(lines * 10) / 10]);
    });
    return bad;
  });
  check('표 칸이 세로로 쪼개지지 않는다', split.length === 0, JSON.stringify(split));

  /* ── ⑧ 읽히는가 (대비) ─────────────────────────────────────────────── */
  console.log('\n[8] 「이 합계가 말하지 않는 것」 상자가 읽히는가');
  const contrast = await page.evaluate(() => {
    const box = document.querySelector('#repResult .repgap');
    if (!box) return null;
    const lum = (c) => {
      const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    const rgb = (s) => { const m = String(s).match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
    const alpha = (s) => { const m = String(s).match(/[\d.]+/g); return (m && m.length > 3) ? Number(m[3]) : 1; };
    // 반투명 층은 아래에서 위로 합성한다(CLAUDE.md 2장) — 안 하면 멀쩡한 대비가 실패로 나온다
    const layers = []; let el = box;
    while (el) {
      const cs = getComputedStyle(el);
      let c = rgb(cs.backgroundColor), a = alpha(cs.backgroundColor);
      if ((!c || a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') {
        const g = rgb(cs.backgroundImage); if (g) { c = g; a = 1; }
      }
      if (c && a > 0) { layers.push({ c, a }); if (a >= 1) break; }
      el = el.parentElement;
    }
    if (!layers.length) layers.push({ c: [255, 255, 255], a: 1 });
    let bg = layers[layers.length - 1].c;
    for (let i = layers.length - 2; i >= 0; i--) {
      const { c, a } = layers[i];
      bg = [0, 1, 2].map((k) => c[k] * a + bg[k] * (1 - a));
    }
    const fg = rgb(getComputedStyle(box).color);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    return { ratio: Math.round(ratio * 100) / 100, fg, bg: bg.map(Math.round) };
  });
  check('그 상자가 화면에 있다', !!contrast);
  check('글자가 읽힌다 (WCAG 본문 4.5 이상)',
    !!contrast && contrast.ratio >= 4.5, JSON.stringify(contrast));

  /* ── ⑨ 조용한 실패 ─────────────────────────────────────────────────── */
  console.log('\n[9] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                   : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
