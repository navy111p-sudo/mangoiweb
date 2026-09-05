/*
 * ↩️🔁 결재 회수 · 다시 올리기 · 취소 요청 — **화면에서 실제로 눌리는가** (2026-09-05)
 *
 *   [왜 브라우저로 재나]
 *     이 화면의 스크립트는 닫힌 스코프라, 인라인 onclick 이 부르는 이름이 window 에
 *     없으면 **ReferenceError 만 나고 화면은 멀쩡해 보인다.** 그리고 「버튼이 있다」·
 *     「보인다」·「눌린다」는 다 다른 사실이다 — elementFromPoint 로 «맨 위가 그 버튼인가»
 *     까지 잰다.
 *
 *   [짝으로 본다]
 *     「내 대기 건에 회수가 뜬다」만 보면 **어디에나 뜨는 코드**가 통과한다.
 *     그래서 「승인된 건·남의 건에는 안 뜬다」를 언제나 함께 센다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-withdraw-reverse-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 이 세 기능을 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

const P = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                     'cloudflare-deploy', 'src', 'approval-policy.ts')).href);

/* ⛔ 분류·상태 표를 손으로 적지 않는다 — 정본을 되돌려도 통과하는 검사가 된다. */
const TYPES = P.TYPES.map((t) => ({
  key: t.key, ko: t.ko, en: t.en, needs_amount: t.needsAmount,
  wants_file: t.wantsFile, requires_file: !!t.requiresFile,
  wants_dates: !!t.wantsDates, wants_category: !!t.wantsCategory,
  picks_period: t.key === 'hr',
}));
const CATS = P.CATEGORIES.map((c) => ({ key: c.key, ko: c.ko, en: c.en, account: c.account }));
const SKO = (k) => (P.statusSpec(k) || {}).ko;

const DAY = 86400000;
const now = Date.now();

/** 내가 올린 «대기 중» — 아무도 아직 결재를 안 눌렀다 → 회수가 떠야 한다. */
const mineOpen = {
  id: 101, req_type: 'expense', type_ko: '지출 결재', type_en: 'Expense',
  title: '9월 인터넷 요금', body: 'PLDT', category: 'utility',
  category_ko: '공과금 · 인터넷', category_en: 'Utilities & internet',
  amount: 1800, currency: 'PHP', spent_at: '2026-09-01',
  requester_username: 'admin', requester_name: '정우영',
  status: 'pending', status_ko: SKO('pending'), status_en: 'Pending',
  created_at: now - 2 * DAY, stage_seq: 1, stage_total: 1, flags: [],
  steps: [{ seq: 1, role: 'staff', status: 'active' }],
};
/** 이미 1단계가 승인된 다단계 건 — ⛔ 회수가 «뜨면 안 된다». */
const mineDecided = {
  id: 102, req_type: 'purchase', type_ko: '물품 구입', type_en: 'Purchase',
  title: '라우터 2대', body: '', amount: 9000, currency: 'PHP',
  requester_username: 'admin', requester_name: '정우영',
  status: 'pending', status_ko: SKO('pending'), status_en: 'Pending',
  created_at: now - 3 * DAY, stage_seq: 2, stage_total: 2, flags: [],
  steps: [{ seq: 1, role: 'staff', status: 'approved', decided_by: 'mgr_jjw' },
          { seq: 2, role: 'exec', status: 'active' }],
};
/** 내가 올려 «승인된» 건 — 취소 «요청» 만 떠야 한다(회수 아님). */
const mineApproved = {
  id: 103, req_type: 'purchase', type_ko: '물품 구입', type_en: 'Purchase',
  title: 'Dual Wan Router', body: '', category: 'equipment',
  category_ko: '장비 · 비품', category_en: 'Equipment',
  amount: 2800, currency: 'PHP',
  requester_username: 'admin', requester_name: '정우영',
  status: 'approved', status_ko: SKO('approved'), status_en: 'Approved',
  created_at: now - 6 * DAY, stage_seq: 1, stage_total: 1, flags: [], steps: [],
};
/** 회수된 내 건 — 「이 내용으로 다시 올리기」만 떠야 한다. */
const mineWithdrawn = {
  id: 104, req_type: 'expense', type_ko: '지출 결재', type_en: 'Expense',
  title: '8월 사무용품', body: '볼펜·A4', category: 'supplies',
  category_ko: '사무 · 소모품', category_en: 'Office supplies',
  amount: 640, currency: 'PHP', spent_at: '2026-08-20',
  requester_username: 'admin', requester_name: '정우영',
  status: 'withdrawn', status_ko: SKO('withdrawn'), status_en: 'Withdrawn',
  created_at: now - 4 * DAY, stage_seq: 1, stage_total: 1, flags: [], steps: [],
};
/** 다시 올린 건 — 「6일째」가 이어져야 한다(오늘 올렸지만 원본은 6일 전). */
const mineResub = {
  id: 105, req_type: 'expense', type_ko: '지출 결재', type_en: 'Expense',
  title: '8월 사무용품 (재작성)', body: '', amount: 640, currency: 'PHP',
  requester_username: 'admin', requester_name: '정우영',
  status: 'pending', status_ko: SKO('pending'), status_en: 'Pending',
  created_at: now - 30 * 1000, origin_id: 104, origin_created_at: now - 6 * DAY,
  stage_seq: 1, stage_total: 1, flags: [], steps: [{ seq: 1, role: 'staff', status: 'active' }],
};
/** 취소된 내 건 — 아무 버튼도 없어야 한다. */
const mineCancelled = {
  id: 106, req_type: 'expense', type_ko: '지출 결재', type_en: 'Expense',
  title: '중복 청구분', body: '', amount: 300, currency: 'PHP',
  requester_username: 'admin', requester_name: '정우영',
  status: 'cancelled', status_ko: SKO('cancelled'), status_en: 'Cancelled',
  cancelled_by_id: 110,
  created_at: now - 8 * DAY, stage_seq: 1, stage_total: 1, flags: [], steps: [],
};
/** 남이 올린 대기 건(결재함) — ⛔ 회수·취소가 떠서는 안 된다. */
const othersOpen = {
  id: 107, req_type: 'expense', type_ko: '지출 결재', type_en: 'Expense',
  title: '남의 지출', body: '', amount: 500, currency: 'PHP',
  requester_username: 'mgr_karl', requester_name: 'Karl',
  status: 'pending', status_ko: SKO('pending'), status_en: 'Pending',
  created_at: now - DAY, stage_seq: 1, stage_total: 1, flags: [],
  steps: [{ seq: 1, role: 'staff', status: 'active' }],
};

function home(over) {
  return Object.assign({
    ok: true,
    me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
    colleagues: [], my_delegate: null, can_approve: true, pending: 1,
    types: TYPES, categories: CATS,
    inbox: [othersOpen],
    mine: [mineOpen, mineDecided, mineApproved, mineWithdrawn, mineResub, mineCancelled],
    reuse: [], urgent: [],
    summary: {
      money: { month: [], year: [], month_count: 0, year_count: 0,
               month_no_amount: 0, year_no_amount: 0 },
      money_scope: 'all', my_open: 3, my_open_shown: 3, mine_shown: 6,
      money_unknown: false, open_unknown: false, inbox_capped: false, month: P.kstMonth(now),
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

  /* prompt/confirm 은 기본으로 «사유를 적고 확인» 으로 답한다 — 취소를 누르는 경우는
     그때그때 바꿔 끼운다. */
  let dialogAnswer = '테스트 사유';
  page.on('dialog', (d) => (dialogAnswer === null ? d.dismiss() : d.accept(dialogAnswer)));

  await page.addInitScript((h) => {
    try {
      localStorage.setItem('mangoi_lang', 'ko');
      localStorage.removeItem('mangoi_work_draft_v1');
    } catch (e) {}
    window.__HOME = h;
    window.__CALLS = [];
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      window.__CALLS.push({ u: u, m: (o && o.method) || 'GET', b: (o && o.body) || null });
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(window.__HOME), { status: 200 }));
      }
      if (/\/api\/approval\/requests\/\d+\/withdraw/.test(u)) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 101, status: 'withdrawn' }), { status: 200 }));
      }
      if (/\/api\/approval\/requests\/\d+\/reverse/.test(u)) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 200, reverses_id: 103 }), { status: 200 }));
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

  /** 그 건 카드 안 버튼들의 글자 */
  const actsOf = (id) => page.evaluate((i) => {
    const card = document.getElementById('req-' + i);
    if (!card) return null;
    return Array.from(card.querySelectorAll('.mineacts button')).map((b) => b.textContent.trim());
  }, id);

  /* ── ⓪ 전제 ────────────────────────────────────────────────────────── */
  console.log('\n[0] 전제 — 카드가 실제로 그려졌는가');
  const drawn = await page.evaluate(() => [101, 102, 103, 104, 105, 106, 107]
    .filter((i) => !!document.getElementById('req-' + i)));
  check('여섯 가지 상태의 카드가 모두 그려졌다 (아래 검사가 뜻을 가지려면)',
    drawn.length === 7, JSON.stringify(drawn));
  check('상태 이름을 정본에서 가져왔다 (손으로 적지 않았다)',
    SKO('withdrawn') === '회수됨' && SKO('cancelled') === '취소됨');

  /* ── ① 어느 건에 무엇이 뜨는가 (짝 검사) ───────────────────────────── */
  console.log('\n[1] 버튼이 «있어야 할 곳에만» 있는가');
  const a101 = await actsOf(101);
  const a102 = await actsOf(102);
  const a103 = await actsOf(103);
  const a104 = await actsOf(104);
  const a106 = await actsOf(106);
  const a107 = await actsOf(107);

  check('내 대기 건에는 「회수」가 뜬다 (짝 검사 — 아무 데도 안 뜨는 코드는 여기서 걸린다)',
    !!a101 && a101.join('|').indexOf('회수') >= 0, JSON.stringify(a101));
  check('🔴 이미 1단계가 승인된 건에는 회수가 «안» 뜬다 (남의 결재를 지우게 된다)',
    !!a102 && a102.join('|').indexOf('회수') < 0, JSON.stringify(a102));
  check('승인된 건에는 「취소 요청」이 뜬다 (짝 검사)',
    !!a103 && a103.join('|').indexOf('취소 요청') >= 0, JSON.stringify(a103));
  check('⛔ 승인된 건에 「회수」는 안 뜬다 (그건 ③ 취소 결재로 간다)',
    !!a103 && a103.join('|').indexOf('회수') < 0, JSON.stringify(a103));
  check('회수된 건에는 「다시 올리기」가 뜬다 (= 「수정」을 대신하는 자리)',
    !!a104 && a104.join('|').indexOf('다시 올리기') >= 0, JSON.stringify(a104));
  check('⛔ 이미 취소된 건에는 아무 버튼도 안 뜬다',
    !!a106 && a106.length === 0, JSON.stringify(a106));
  check('🔴 남이 올린 건에는 아무 버튼도 안 뜬다',
    a107 === null || a107.length === 0, JSON.stringify(a107));

  /* ── ② 「며칠째」가 초기화되지 않는가 ──────────────────────────────── */
  console.log('\n[2] 다시 올려도 «며칠째»가 이어지는가');
  const metaOf = (id) => page.evaluate((i) => {
    const c = document.getElementById('req-' + i);
    const m = c && c.querySelector('.imeta');
    return m ? m.textContent : '';
  }, id);
  const m105 = await metaOf(105);
  check('🔴 30초 전에 다시 올린 건이 «6일째» 로 보인다 (지연이 감춰지지 않는다)',
    /6일째/.test(m105), m105);
  const m101 = await metaOf(101);
  check('짝 검사 — 원본이 없는 건은 그대로 «2일째» 다 (전부 원본으로 세는 코드는 여기서 걸린다)',
    /2일째/.test(m101), m101);
  const card105 = await page.evaluate(() => {
    const c = document.getElementById('req-105'); return c ? c.innerText : '';
  });
  check('카드가 「원래 언제 올렸는지」를 적는다 (오늘 올린 새 건처럼 보이지 않게)',
    /다시 올림/.test(card105) && /#104/.test(card105), card105.slice(0, 200));

  /* ── ③ 상태 배지 ──────────────────────────────────────────────────── */
  console.log('\n[3] 상태를 사실대로 말하는가');
  check('회수된 건은 «회수됨» 이라고 적는다 (「반려됨」이 아니다)',
    /회수됨/.test(await metaOf(104)) && !/반려/.test(await metaOf(104)), await metaOf(104));
  check('취소된 건은 «취소됨» 이라고 적는다',
    /취소됨/.test(await metaOf(106)), await metaOf(106));
  check('취소된 건은 «무엇 때문에» 취소됐는지도 적는다',
    /#110/.test(await page.evaluate(() => document.getElementById('req-106').innerText)));

  /* ── ④ 실제로 눌리는가 — 「있다」와 「눌린다」는 다르다 ────────────── */
  console.log('\n[4] 눌러 본다 — 회수');
  const topOf = (sel) => page.evaluate((s) => {
    const b = document.querySelector(s);
    if (!b) return 'no-button';
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return 'zero-size';
    b.scrollIntoView({ block: 'center' });
    const r2 = b.getBoundingClientRect();
    const top = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
    return (top === b || b.contains(top)) ? 'ok' : ('covered:' + (top ? top.tagName + '.' + top.className : '?'));
  }, sel);

  check('회수 버튼이 «맨 위» 에 있다 (보이는데 안 눌리는 상태가 아니다)',
    (await topOf('#req-101 .mineacts button')) === 'ok',
    await topOf('#req-101 .mineacts button'));

  await page.click('#req-101 .mineacts button');
  await page.waitForTimeout(150);
  const confirmTxt = await page.evaluate(() => {
    const e = document.getElementById('act-101'); return e ? e.innerText : '';
  });
  check('누르면 확인 상자가 뜬다 (곧바로 회수되지 않는다)',
    /회수할까요/.test(confirmTxt), confirmTxt.slice(0, 120));
  check('🔴 «되돌릴 수 있다» 를 누르기 «전» 에 말한다',
    /다시 올릴 수 있습니다/.test(confirmTxt), confirmTxt.slice(0, 200));
  check('「그대로 두기」도 함께 준다 (되돌릴 길)', /그대로 두기/.test(confirmTxt));

  // 사유 창에서 «취소» 를 누르면 아무 일도 없어야 한다
  dialogAnswer = null;
  await page.evaluate(() => (window.__CALLS.length = 0));
  await page.evaluate(() => document.querySelector('#act-101 .whybtns button').click());
  await page.waitForTimeout(200);
  const afterDismiss = await page.evaluate(() => window.__CALLS.filter((c) => /withdraw/.test(c.u)).length);
  check('🔴 사유 창에서 «취소» 를 누르면 서버로 아무것도 안 간다',
    afterDismiss === 0, String(afterDismiss));

  dialogAnswer = '잘못 올렸습니다';
  await page.evaluate(() => (window.__CALLS.length = 0));
  await page.evaluate(() => document.querySelector('#act-101 .whybtns button').click());
  await page.waitForTimeout(300);
  const wcall = await page.evaluate(() => window.__CALLS.find((c) => /withdraw/.test(c.u)) || null);
  check('확인하면 회수 요청이 나간다 (짝 검사)',
    !!wcall && wcall.m === 'POST', JSON.stringify(wcall));
  check('사유를 함께 보낸다', !!wcall && /잘못 올렸습니다/.test(String(wcall.b)), wcall ? String(wcall.b) : '');

  /* ── ⑤ 다시 올리기 ────────────────────────────────────────────────── */
  console.log('\n[5] 「이 내용으로 다시 올리기」');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const c = document.getElementById('req-104');
    const b = Array.from(c.querySelectorAll('.mineacts button'))
      .find((x) => x.textContent.indexOf('다시 올리기') >= 0);
    b.click();
  });
  await page.waitForTimeout(300);
  const form = await page.evaluate(() => ({
    title: (document.getElementById('f_title') || {}).value || '',
    body: (document.getElementById('f_body') || {}).value || '',
    amount: (document.getElementById('f_amount') || {}).value || '',
    cat: (document.getElementById('f_cat') || {}).value || '',
    note: (document.getElementById('resubNote') || {}).textContent || '',
  }));
  check('제목이 채워진다', form.title === '8월 사무용품', JSON.stringify(form));
  check('내용·금액·항목도 함께 채워진다',
    form.body === '볼펜·A4' && String(form.amount) === '640' && form.cat === 'supplies',
    JSON.stringify(form));
  check('🔴 폼이 «다시 올리는 중» 이라고 말한다 (새 결재와 구별되게)',
    /다시 올리는 중/.test(form.note), form.note);
  check('그리고 «며칠째가 초기화되지 않는다» 는 것도 말한다',
    /초기화되지 않습니다/.test(form.note), form.note);

  /* ⛔ 다른 분류를 고르면 그 표식이 사라져야 한다 — 안 그러면 다음 건에 남의 원본이 붙는다 */
  await page.evaluate(() => window.pick('urgent'));
  await page.waitForTimeout(200);
  const noteAfter = await page.evaluate(() => !!document.getElementById('resubNote'));
  check('🔴 다른 분류를 고르면 그 표식이 사라진다 (다음 건에 남의 원본이 안 붙게)',
    noteAfter === false, String(noteAfter));

  /* ── ⑥ 취소 요청 ──────────────────────────────────────────────────── */
  console.log('\n[6] 취소 요청 — «지우는 것이 아니다» 를 말하는가');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const c = document.getElementById('req-103');
    Array.from(c.querySelectorAll('.mineacts button'))
      .find((x) => x.textContent.indexOf('취소 요청') >= 0).click();
  });
  await page.waitForTimeout(200);
  const revTxt = await page.evaluate(() => (document.getElementById('act-103') || {}).innerText || '');
  check('🔴 «지우는 것이 아니다» 를 누르기 전에 말한다', /지우는 것이 아닙니다/.test(revTxt), revTxt.slice(0, 200));
  check('«새 결재가 올라가고 승인되어야 한다» 를 말한다', /승인되어야/.test(revTxt), revTxt.slice(0, 200));

  // 사유를 비우면 올라가지 않아야 한다
  dialogAnswer = '   ';
  await page.evaluate(() => (window.__CALLS.length = 0));
  await page.evaluate(() => document.querySelector('#act-103 .whybtns button').click());
  await page.waitForTimeout(250);
  const emptyReason = await page.evaluate(() => window.__CALLS.filter((c) => /reverse/.test(c.u)).length);
  check('🔴 사유가 비면 올리지 않는다 (결재자가 판단할 근거가 없다)', emptyReason === 0, String(emptyReason));

  dialogAnswer = '중복 청구였습니다';
  await page.evaluate(() => (window.__CALLS.length = 0));
  await page.evaluate(() => document.querySelector('#act-103 .whybtns button').click());
  await page.waitForTimeout(300);
  const rcall = await page.evaluate(() => window.__CALLS.find((c) => /reverse/.test(c.u)) || null);
  check('사유를 적으면 취소 결재가 올라간다 (짝 검사)',
    !!rcall && rcall.m === 'POST' && /중복 청구였습니다/.test(String(rcall.b)), JSON.stringify(rcall));

  /* ── ⑦ 글자가 읽히는가 ────────────────────────────────────────────── */
  console.log('\n[7] 대비 — 반투명·그라데이션까지 합성해서 잰다');
  const contrast = await page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) || [0, 0, 0, 1]).map(Number);
    const lum = (c) => {
      const f = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    const bgOf = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        let c = rgb(cs.backgroundColor);
        let a = c.length > 3 ? c[3] : 1;
        if (a === 0 && cs.backgroundImage && cs.backgroundImage !== 'none') {
          const m = cs.backgroundImage.match(/rgba?\([^)]+\)/);
          if (m) { c = rgb(m[0]); a = c.length > 3 ? c[3] : 1; }
        }
        if (a > 0) { layers.push([c, a]); if (a >= 1) break; }
      }
      let bg = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) {
        const [c, a] = layers[i];
        bg = [0, 1, 2].map((k) => c[k] * a + bg[k] * (1 - a));
      }
      return bg;
    };
    const out = [];
    document.querySelectorAll('.mineacts button, .whynote').forEach((el) => {
      if (!el.textContent.trim()) return;
      const fg = rgb(getComputedStyle(el).color), bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg);
      out.push({ t: el.textContent.trim().slice(0, 12),
                 r: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100 });
    });
    return out;
  });
  check('잰 것이 있다 (전제 — 0건이면 아래가 헛돈다)', contrast.length > 0, JSON.stringify(contrast));
  check('버튼·안내 글자가 모두 4.5:1 이상이다',
    contrast.filter((x) => x.r < 4.5).length === 0, JSON.stringify(contrast.filter((x) => x.r < 4.5)));

  /* ── ⑧ 좁은 폰에서 쪼개지지 않는가 ────────────────────────────────── */
  console.log('\n[8] 390px — 버튼 글자가 낱글자로 쪼개지지 않는가');
  await ctx.pages()[0].setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const lines = await page.evaluate(() => Array.from(
    document.querySelectorAll('.mineacts button')).map((b) => {
      const cs = getComputedStyle(b);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const inner = b.getBoundingClientRect().height
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
      return { t: b.textContent.trim().slice(0, 14), n: Math.round((inner / lh) * 10) / 10 };
    }));
  check('버튼 글자가 세 줄 이상으로 쪼개지지 않는다',
    lines.length > 0 && lines.every((x) => x.n < 3), JSON.stringify(lines));
  const wide = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1);
  check('가로로 넘치지 않는다', wide === false);

  /* ── ⑨ 조용한 실패 ───────────────────────────────────────────────── */
  console.log('\n[9] 실행 중 오류');
  check('🔴 자바스크립트 오류가 없다 (인라인 onclick 이 전역에서 이름을 찾는다)',
    errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                   : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
