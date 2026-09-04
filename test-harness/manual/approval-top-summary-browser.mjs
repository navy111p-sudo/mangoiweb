/*
 * 🧭 결재 맨 위 요약(D안) — 아침에 열었을 때 **무엇이 보이는가** (2026-09-04)
 *
 *   [짝으로 본다]
 *     「손봐야 할 것이 뜬다」만 검사하면 **늘 뜨는 코드**가 통과합니다.
 *     그래서 「깨끗하면 안 뜬다」를 언제나 함께 셉니다.
 *     「경영진은 전체」만 보면 **모두에게 전체를 주는 코드**가 통과합니다.
 *     그래서 「직원에게는 «내가 올린 것» 이라고 적힌다」를 짝으로 봅니다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-top-summary-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 맨 위 요약을 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

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

const DAY = 86400000;
const now = Date.now();

/** 서버가 내려주는 요약을 **정본으로 계산**한다 — 손으로 적으면 정본을 되돌려도 통과한다. */
const MONEY_ROWS = [
  { cur: 'PHP', ym: P.kstMonth(now), n: 2, total: 3500, no_amt: 1 },
  { cur: 'KRW', ym: P.kstMonth(now), n: 1, total: 120000, no_amt: 0 },
];
const MONEY = P.foldHomeMoney(MONEY_ROWS, P.kstMonth(now));

const stuckRow = {
  id: 91, req_type: 'urgent', type_ko: '긴급 소통', type_en: 'Urgent',
  title: 'we need to found the test classes', body: '',
  amount: null, currency: 'PHP', requester_username: 'admin', requester_name: '정우영',
  status: 'pending', created_at: now - 5 * DAY, stage_seq: 1, stage_total: 1,
  stage_due_at: now - 4 * DAY, flags: [], steps: [{ seq: 1, role: 'exec', status: 'open' }],
  blocked: true, approver_count: 0,
};
const okRow = {
  id: 92, req_type: 'purchase', type_ko: '물품 구입', type_en: 'Purchase',
  title: 'Dual Wan Router', body: '', category: 'equipment',
  category_ko: '장비 · 비품', category_en: 'Equipment', category_account: '소모품비',
  amount: 2800, currency: 'PHP', requester_username: 'admin', requester_name: '정우영',
  status: 'approved', created_at: now - DAY, stage_seq: 1, stage_total: 1, flags: [], steps: [],
};

function home(over) {
  return Object.assign({
    ok: true,
    me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
    colleagues: [], my_delegate: null, can_approve: true, pending: 0,
    types: TYPES, categories: CATS,
    inbox: [], mine: [stuckRow, okRow], reuse: [], urgent: [],
    summary: {
      money: MONEY, money_scope: 'all', my_open: 1, mine_shown: 2, month: P.kstMonth(now),
    },
  }, over || {});
}

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

  await page.addInitScript((h) => {
    try { localStorage.setItem('mangoi_lang', 'ko'); localStorage.removeItem('mangoi_work_draft_v1'); } catch (e) {}
    window.__HOME = h;
    window.__CALLS = [];
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      window.__CALLS.push(u);
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(window.__HOME), { status: 200 }));
      }
      if (u.indexOf('/api/push/vapid-public-key') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      }
      if (u.indexOf('/api/approval/requests') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, items: [], has_more: false }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, home());

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const stopTxt = () => page.evaluate(() => {
    const e = document.getElementById('topStop'); return e ? e.innerText : '';
  });
  const tiles = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#topTiles .tile')).map((b) => ({
      l: b.querySelector('.tl').textContent.trim(),
      v: b.querySelector('.tv').textContent.trim(),
      n: b.querySelector('.tn') ? b.querySelector('.tn').textContent.trim() : '',
      hot: b.classList.contains('hot'),
      dis: b.disabled,
    })));

  /* ── ⓪ 전제 ─────────────────────────────────────────────────────────── */
  console.log('\n[0] 전제 — 정본으로 만든 스텁인가');
  check('요약을 정본(foldHomeMoney)으로 계산했다',
    MONEY.month.length === 2, JSON.stringify(MONEY.month.map((m) => m.currency)));
  check('통화가 둘이다 (아래 검사가 뜻을 가지려면)', MONEY.month.length === 2);

  /* ── ① 첫 화면 API 한 번 ────────────────────────────────────────────── */
  console.log('\n[1] 첫 화면 — 요약 때문에 서버를 더 부르지 않는다');
  const calls = await page.evaluate(() => window.__CALLS.filter((u) => u.indexOf('/api/approval/') === 0));
  check('결재 API 를 한 번만 부른다', calls.length === 1, JSON.stringify(calls));

  /* ── ② 손봐야 할 것 ─────────────────────────────────────────────────── */
  console.log('\n[2] 손봐야 할 것');
  const st = await stopTxt();
  check('멈춘 건이 맨 위에 뜬다', /손봐야 할 것/.test(st), JSON.stringify(st.slice(0, 120)));
  check('그 건의 제목을 적는다', st.indexOf('test classes') >= 0);
  check('왜 멈췄는지 말한다 (「대기 중」만으로는 알 수 없다)',
    /결재할 수 있는 사람이 없습니다/.test(st), JSON.stringify(st));
  check('그 건으로 가는 버튼이 있다',
    (await page.evaluate(() => !!document.querySelector('#topStop .ts-go'))) === true);

  await page.click('#topStop .ts-go');
  await page.waitForTimeout(300);
  check('누르면 그 줄이 화면 안으로 들어온다', await page.evaluate(() => {
    const el = document.getElementById('req-91');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top > -5 && r.top < window.innerHeight;
  }));

  /* ── ③ 타일 ─────────────────────────────────────────────────────────── */
  console.log('\n[3] 타일 넷');
  const tl = await tiles();
  check('타일이 넷이다', tl.length === 4, JSON.stringify(tl.map((x) => x.l)));
  check('「내가 결재할 것」 0건', tl[0] && /결재할 것/.test(tl[0].l) && /0/.test(tl[0].v),
    JSON.stringify(tl[0]));
  check('결재할 것이 없으면 강조하지 않는다', tl[0] && !tl[0].hot);
  check('「진행 중」이 정확한 수(서버 my_open)로 나온다', tl[1] && /1/.test(tl[1].v),
    JSON.stringify(tl[1]));
  check('손볼 것이 있으면 강조한다', tl[1] && tl[1].hot);
  check('그 안에서 몇 건이 손볼 것인지 적는다', tl[1] && /손볼 것 1건/.test(tl[1].n),
    JSON.stringify(tl[1]));
  check('「이번 달 승인」에 PHP·KRW 가 나란히', tl[2] && /3,500/.test(tl[2].v) && /120,000/.test(tl[2].v),
    JSON.stringify(tl[2]));
  check('⛔ 두 통화를 더한 숫자가 없다', tl[2] && tl[2].v.indexOf('123,500') < 0);
  check('금액 없는 승인을 «0원» 이 아니라 그렇게 적는다', tl[2] && /금액 없음 1건/.test(tl[2].n),
    JSON.stringify(tl[2]));

  /* 🔴 범위를 반드시 말해야 한다 — 경영진과 직원이 같은 타일에서 다른 숫자를 본다 */
  check('경영진에게는 «전체» 라고 적는다', tl[2] && /전체/.test(tl[2].n), JSON.stringify(tl[2]));

  await page.click('#topTiles .tile:nth-child(3)');
  await page.waitForTimeout(400);
  check('금액 타일을 누르면 지출 정리가 열린다',
    (await page.evaluate(() => !document.getElementById('repPanel').hidden)) === true);

  /* ── ④ 짝 검사 — 깨끗하면 안 뜬다 ───────────────────────────────────── */
  console.log('\n[4] 짝 검사 — 손봐야 할 것이 없을 때');
  await page.evaluate((row) => {
    window.__HOME = Object.assign({}, window.__HOME, {
      mine: [row], summary: Object.assign({}, window.__HOME.summary, { my_open: 0, mine_shown: 1 }),
    });
  }, okRow);
  await page.evaluate(() => window.reloadAll ? window.reloadAll() : location.reload());
  await page.waitForTimeout(700);
  const st2 = await stopTxt();
  check('경고 줄이 아예 안 뜬다 (늘 뜨는 코드는 여기서 걸린다)', st2.trim() === '',
    JSON.stringify(st2));
  const tl2 = await tiles();
  check('그래도 타일은 그대로 있다', tl2.length === 4);
  check('「진행 중」이 0이고 강조가 없다', tl2[1] && /0/.test(tl2[1].v) && !tl2[1].hot,
    JSON.stringify(tl2[1]));

  /* ── ⑤ 짝 검사 — 직원(경영진 아님) ─────────────────────────────────── */
  console.log('\n[5] 짝 검사 — 직원에게는 «내가 올린 것» 이라고 적는가');
  await page.evaluate(() => {
    window.__HOME = Object.assign({}, window.__HOME, {
      me: Object.assign({}, window.__HOME.me, { username: 'mgr_lby', is_exec: false }),
      summary: Object.assign({}, window.__HOME.summary, { money_scope: 'mine' }),
    });
  });
  await page.evaluate(() => window.reloadAll ? window.reloadAll() : location.reload());
  await page.waitForTimeout(700);
  const tl3 = await tiles();
  check('직원에게는 «내가 올린 것» 이라고 적는다',
    tl3[2] && /내가 올린 것/.test(tl3[2].n) && tl3[2].n.indexOf('전체') < 0,
    JSON.stringify(tl3[2]));

  /* ── ⑥ 「최근 N건만 살펴봤다」 ──────────────────────────────────────── */
  console.log('\n[6] 최근 15건 밖은 못 본다는 사실을 말하는가');
  await page.evaluate((row) => {
    window.__HOME = Object.assign({}, window.__HOME, {
      mine: [row],
      summary: Object.assign({}, window.__HOME.summary, { my_open: 30, mine_shown: 1 }),
    });
  }, stuckRow);
  await page.evaluate(() => window.reloadAll ? window.reloadAll() : location.reload());
  await page.waitForTimeout(700);
  const st3 = await stopTxt();
  check('「진행 중 30건 중 최근 1건만 살펴봤다」고 말한다',
    /최근 1건만 살펴본/.test(st3), JSON.stringify(st3));
  /* 🔴 여기가 «정확한 수» 를 쓰는지 가르는 자리다 — mine 은 1건뿐인데 실제 진행 중은 30건이다.
     최근 15건으로 세면 «1건» 이 되어 16번째부터 조용히 빠진다. */
  const tl4 = await tiles();
  check('「진행 중」이 서버가 준 정확한 수(30)로 나온다 — 화면에 있는 1건으로 세지 않는다',
    tl4[1] && /30/.test(tl4[1].v) && !/^1건$/.test(tl4[1].v), JSON.stringify(tl4[1]));

  /* ── ⑦ 언어 ─────────────────────────────────────────────────────────── */
  console.log('\n[7] 언어');
  await page.evaluate(() => window.toggleLang());
  await page.waitForTimeout(400);
  const tlEn = await tiles();
  check('타일이 영어로 바뀐다',
    tlEn[0] && /Waiting for me/.test(tlEn[0].l), JSON.stringify(tlEn[0]));
  check('경고 줄도 영어로', /Needs your attention/.test(await stopTxt()));
  await page.evaluate(() => window.toggleLang());
  await page.waitForTimeout(400);

  /* ── ⑧ 좁은 화면 · 읽히는가 ─────────────────────────────────────────── */
  console.log('\n[8] 폰 폭 390px');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  check('문서가 가로로 넘치지 않는다',
    !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  /* 타일 값이 낱글자로 쪼개지지 않는가(CLAUDE.md 2장 「짧은 라벨에 flex 를 썼더니」). */
  const split = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#topTiles .tv').forEach((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
      const lines = el.getBoundingClientRect().height / lh;
      if (lines >= 3) bad.push([el.textContent.trim().slice(0, 24), Math.round(lines * 10) / 10]);
    });
    return bad;
  });
  check('타일 값이 세로로 쪼개지지 않는다', split.length === 0, JSON.stringify(split));

  const contrast = await page.evaluate(() => {
    const box = document.querySelector('#topStop .topstop');
    if (!box) return null;
    const lum = (c) => {
      const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    const rgb = (s) => { const m = String(s).match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
    const alpha = (s) => { const m = String(s).match(/[\d.]+/g); return (m && m.length > 3) ? Number(m[3]) : 1; };
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
    return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
  });
  check('경고 줄이 읽힌다 (WCAG 4.5 이상)', contrast != null && contrast >= 4.5, String(contrast));

  /* ── ⑨ 조용한 실패 ─────────────────────────────────────────────────── */
  console.log('\n[9] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                   : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
