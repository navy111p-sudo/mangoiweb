/*
 * 🏷️ 결재 「지출 항목」 — 실제 브라우저에서 고르고, 실제로 실려 나가는가 (2026-09-04)
 *
 *   [왜 브라우저로 재나]
 *     문자열 검사는 「그 줄이 있는가」까지만 본다. 여기서 알고 싶은 것은
 *       · 칸이 «보이는가»(돈이 나가는 분류에만)
 *       · 고른 값이 **정말 요청에 실려 나가는가**
 *       · 언어를 바꾸거나 폼을 다시 그려도 고른 것이 «안 날아가는가»
 *     세 가지 다 화면을 그려 봐야 알 수 있다.
 *
 *   [짝으로 본다]
 *     「지출에 칸이 뜬다」만 검사하면 **모든 분류에 뜨는 코드**도 통과한다.
 *     그래서 「휴가·긴급에는 안 뜬다」를 언제나 함께 센다.
 *     「안 고르면 안 보낸다」만 검사하면 **아무것도 안 보내는 코드**가 통과한다.
 *     그래서 「고르면 그 값이 실제로 실린다」를 짝으로 센다.
 *
 *   ⚠️ 목록·분류표를 손으로 적지 않는다 — 정본(approval-policy.ts)을 읽어서
 *      서버가 화면에 내려주는 모양으로 바꿔 쓴다. 2026-09-04 에 손으로 적었다가
 *      «소스를 되돌려도 전부 통과» 하는 검사를 만든 적이 있다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-category-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 결재 지출 항목을 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');

const P = await import(
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                     'cloudflare-deploy', 'src', 'approval-policy.ts')).href);

// 서버(api-approval.ts)가 내려주는 것과 같은 모양으로.
const TYPES = P.TYPES.map((t) => ({
  key: t.key, ko: t.ko, en: t.en,
  needs_amount: t.needsAmount, wants_file: t.wantsFile,
  requires_file: !!t.requiresFile, wants_dates: !!t.wantsDates,
  wants_category: !!t.wantsCategory, picks_period: t.key === 'hr',
}));
const CATS = P.CATEGORIES.map((c) => ({ key: c.key, ko: c.ko, en: c.en, account: c.account }));

const withCat = TYPES.filter((t) => t.wants_category);
const noCat   = TYPES.filter((t) => !t.wants_category && !t.picks_period);

const HOME = {
  ok: true,
  me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
  colleagues: [], my_delegate: null, can_approve: true, pending: 0,
  types: TYPES, categories: CATS,
  inbox: [], reuse: [], urgent: [],
  mine: [{
    id: 91, req_type: 'expense', type_ko: '지출 정산', type_en: 'Expense',
    title: '8월 인터넷 요금', body: 'PLDT',
    category: 'utility', category_ko: '공과금 · 인터넷', category_en: 'Utilities & internet',
    category_account: '공과금·통신',
    amount: 3500, currency: 'PHP', requester_username: 'admin', requester_name: '정우영',
    status: 'approved', created_at: Date.now() - 86400000,
    stage_seq: 1, stage_total: 1, flags: [], steps: [],
  }, {
    id: 92, req_type: 'doc', type_ko: '일반 문서', type_en: 'Document',
    title: '사무실 메모', body: '',
    category: null, category_ko: null, category_en: null, category_account: null,
    amount: null, currency: null, requester_username: 'admin', requester_name: '정우영',
    status: 'approved', created_at: Date.now() - 172800000,
    stage_seq: 1, stage_total: 1, flags: [], steps: [],
  }],
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

  await page.addInitScript((home) => {
    /* ⚠️ addInitScript 는 **새로고침마다** 돈다 — 여기서 초안을 지우면 ⑤절의
       「새로고침 뒤에도 남는가」가 언제나 거짓 FAIL 이 난다(2026-09-04 실측).
       그래서 «첫 로드에서 한 번만» 지운다. */
    try {
      localStorage.setItem('mangoi_lang', 'ko');
      if (!sessionStorage.getItem('__catTestReady')) {
        localStorage.removeItem('mangoi_work_draft_v1');
        sessionStorage.setItem('__catTestReady', '1');
      }
    } catch (e) {}
    window.__POSTS = [];       // 실제로 나간 요청을 담아 둔다
    window.__FINDS = [];
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        return Promise.resolve(new Response(JSON.stringify(home), { status: 200 }));
      }
      if (u.indexOf('/api/approval/requests') === 0 && o && String(o.method).toUpperCase() === 'POST') {
        const rec = {};
        try { o.body.forEach(function (v, k) { rec[k] = (typeof v === 'string') ? v : '[file]'; }); } catch (e) {}
        window.__POSTS.push(rec);
        return Promise.resolve(new Response(JSON.stringify({ ok: true, id: 1 }), { status: 200 }));
      }
      if (u.indexOf('/api/approval/requests?') === 0) {
        window.__FINDS.push(u);
        return Promise.resolve(new Response(JSON.stringify({ ok: true, items: [], has_more: false }), { status: 200 }));
      }
      if (u.indexOf('/api/push/vapid-public-key') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, HOME);

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  async function pick(ko) {
    await page.locator('#kinds button', { hasText: ko }).first().click();
    await page.waitForTimeout(250);
  }
  const catCount = () => page.locator('#f_cat').count();

  /* ── ⓪ 검사가 헛돌지 않는가 ─────────────────────────────────────────── */
  console.log('\n[0] 전제 — 정본을 실제로 읽었는가');
  check('정본에서 항목 목록을 읽었다', CATS.length >= 5, CATS.length + '개');
  check('항목을 고르는 분류가 있다', withCat.length > 0, withCat.map((t) => t.ko).join(', '));
  check('안 고르는 분류도 남아 있다 (전부 켠 것이 아니다)',
        noCat.length > 0, noCat.map((t) => t.ko).join(', '));

  /* ── ① 칸이 «어디에» 보이는가 ───────────────────────────────────────── */
  console.log('\n[1] 지출 항목 칸 — 돈이 나가는 분류에만');

  for (const t of withCat) {
    await pick(t.ko);
    check('«' + t.ko + '» 에 지출 항목 칸이 있다', (await catCount()) === 1);
  }
  for (const t of noCat) {
    await pick(t.ko);
    check('«' + t.ko + '» 에는 없다 (짝 검사 — 범위를 안 넓혔다)', (await catCount()) === 0);
  }

  /* ── ② 목록의 내용 ──────────────────────────────────────────────────── */
  console.log('\n[2] 목록 — 서버가 준 것 그대로인가');

  await pick(withCat[0].ko);
  const opts = await page.evaluate(() => {
    const s = document.getElementById('f_cat');
    return s ? Array.from(s.options).map((o) => [o.value, o.textContent]) : null;
  });
  check('첫 칸이 «안 고름» 이다 — 안 고르고도 올릴 수 있어야 한다',
        !!opts && opts[0][0] === '', JSON.stringify(opts && opts[0]));
  check('그 첫 칸이 «선택» 임을 말한다', !!opts && /선택|비워/.test(opts[0][1] + ''), JSON.stringify(opts && opts[0]));
  check('서버가 준 항목이 모두 들어 있다',
        !!opts && CATS.every((c) => opts.some((o) => o[0] === c.key)),
        JSON.stringify((opts || []).map((o) => o[0])));
  check('없는 항목이 섞여 있지 않다 (짝 검사)',
        !!opts && opts.slice(1).every((o) => CATS.some((c) => c.key === o[0])));
  check('한국어로 그린다', !!opts && opts.some((o) => o[1] === CATS[0].ko), JSON.stringify(opts && opts[1]));
  check('기본값은 비어 있다 (몰래 아무거나 고르지 않는다)',
        (await page.evaluate(() => document.getElementById('f_cat').value)) === '');

  /* ── ③ 고른 값이 실제로 실려 나가는가 ───────────────────────────────── */
  console.log('\n[3] 올리기 — 고른 값이 요청에 실리는가');

  await page.evaluate(() => {
    document.getElementById('f_title').value = '9월 인터넷 요금';
    document.getElementById('f_amount').value = '3500';
    const s = document.getElementById('f_cat'); s.value = 'utility';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#b_submit');
  await page.waitForTimeout(700);
  let posts = await page.evaluate(() => window.__POSTS);
  check('요청이 한 건 나갔다', posts.length === 1, posts.length + '건');
  check('고른 항목이 실려 나갔다 (짝 검사 — 아무것도 안 보내는 코드는 여기서 걸린다)',
        posts.length === 1 && posts[0].category === 'utility', JSON.stringify(posts[0]));
  check('key 로 보낸다 (한국어 라벨이 아니라)',
        posts.length === 1 && posts[0].category === 'utility');

  await page.evaluate(() => { window.__POSTS = []; });
  await pick(withCat[0].ko);
  await page.evaluate(() => {
    document.getElementById('f_title').value = '항목 없이';
    document.getElementById('f_amount').value = '100';
  });
  await page.click('#b_submit');
  await page.waitForTimeout(700);
  posts = await page.evaluate(() => window.__POSTS);
  check('안 골라도 올라간다 — 못 고르면 결재를 못 올리는 쪽이 더 나쁘다',
        posts.length === 1, posts.length + '건');
  check('안 골랐으면 category 를 아예 안 보낸다',
        posts.length === 1 && posts[0].category === undefined, JSON.stringify(posts[0]));

  /* ── ④ 고른 것이 «안 날아가는가» ────────────────────────────────────── */
  console.log('\n[4] 다시 그려도 고른 것이 남는가');

  await pick(withCat[0].ko);
  await page.evaluate(() => {
    document.getElementById('f_title').value = '값 지키기';
    const s = document.getElementById('f_cat'); s.value = 'meal';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  /* 🔴 «다시 그렸는지» 를 먼저 확인하고 나서 값을 본다.
     그냥 storage 이벤트만 쏘면 폼이 아예 안 다시 그려져 이 절이 «언제나 통과» 한다
     (2026-09-04 실측 — keep 복원을 지워도 초록이었다). 화면이 실제로 쓰는
     toggleLang() 을 부르고, 라벨이 영어로 바뀐 것으로 «다시 그려졌음» 을 확인한다. */
  const before = await page.evaluate(() =>
    (document.querySelector('#form label') || {}).textContent || '');
  await page.evaluate(() => window.toggleLang());
  await page.waitForTimeout(300);
  const after = await page.evaluate(() =>
    (document.querySelector('#form label') || {}).textContent || '');
  check('언어를 바꾸면 폼이 실제로 다시 그려진다 (전제 — 아니면 아래가 헛돈다)',
        !!before && !!after && before !== after, JSON.stringify([before, after]));
  const kept = await page.evaluate(() => {
    const s = document.getElementById('f_cat');
    return { v: s ? s.value : null, t: (document.getElementById('f_title') || {}).value };
  });
  check('다시 그려도 고른 항목이 그대로다', kept.v === 'meal', JSON.stringify(kept));
  check('같이 있던 제목도 그대로다 (다시 그리기가 폼을 안 비웠다)',
        kept.t === '값 지키기', JSON.stringify(kept));

  /* ── ⑤ 쓰다 만 초안 ─────────────────────────────────────────────────── */
  console.log('\n[5] 초안 — 새로고침해도 항목이 남는가');

  const draft = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('mangoi_work_draft_v1') || 'null'); } catch (e) { return null; }
  });
  check('초안에 항목이 저장돼 있다', !!draft && draft.cat === 'meal', JSON.stringify(draft && draft.cat));

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  const restored = await page.evaluate(() => {
    const s = document.getElementById('f_cat'); return s ? s.value : null;
  });
  check('새로고침 뒤에도 고른 항목이 되살아난다', restored === 'meal', JSON.stringify(restored));

  /* ── ⑥ 목록에서 «무슨 돈이었나» 가 보이는가 ────────────────────────── */
  console.log('\n[6] 내가 올린 것 — 항목이 보이는가');

  const chips = await page.evaluate(() => {
    const box = document.getElementById('req-91');
    if (!box) return null;
    return Array.from(box.querySelectorAll('.chip')).map((c) => c.textContent);
  });
  check('항목이 있는 건은 그 이름이 보인다',
        !!chips && chips.indexOf('공과금 · 인터넷') >= 0, JSON.stringify(chips));
  const chips2 = await page.evaluate(() => {
    const box = document.getElementById('req-92');
    if (!box) return null;
    return Array.from(box.querySelectorAll('.chip')).map((c) => c.textContent);
  });
  check('항목이 없는 건에는 아무 말도 안 붙인다 (짝 검사 — 「항목 없음」은 고장처럼 읽힌다)',
        !!chips2 && chips2.every((c) => !/공과금|항목/.test(c)), JSON.stringify(chips2));

  /* ── ⑦ 문서함에서 항목으로 찾기 ─────────────────────────────────────── */
  console.log('\n[7] 문서함 — 항목으로 찾을 수 있는가');

  await page.evaluate(() => { window.__FINDS = []; if (window.toggleFind) window.toggleFind(); });
  await page.waitForTimeout(500);
  const fcat = await page.evaluate(() => {
    const s = document.getElementById('fcat');
    if (!s) return null;
    return { hidden: !!s.hidden, opts: Array.from(s.options).map((o) => o.value) };
  });
  check('문서함에 항목 고르기 칸이 있다', !!fcat && !fcat.hidden, JSON.stringify(fcat));
  check('그 목록도 서버가 준 것이다',
        !!fcat && CATS.every((c) => fcat.opts.indexOf(c.key) >= 0), JSON.stringify(fcat && fcat.opts));
  check('첫 칸은 «항목 전체»', !!fcat && fcat.opts[0] === '');

  await page.evaluate(() => {
    const s = document.getElementById('fcat'); s.value = 'utility';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  let finds = await page.evaluate(() => window.__FINDS);
  check('고르면 그 값이 요청에 실린다',
        finds.some((u) => u.indexOf('category=utility') >= 0), JSON.stringify(finds.slice(-1)));

  await page.evaluate(() => {
    window.__FINDS = [];
    const s = document.getElementById('fcat'); s.value = '';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  finds = await page.evaluate(() => window.__FINDS);
  check('«항목 전체» 면 조건을 안 보낸다 (짝 검사)',
        finds.length > 0 && finds.every((u) => u.indexOf('category=') < 0), JSON.stringify(finds));

  /* ── ⑧ 좁은 화면 ────────────────────────────────────────────────────── */
  console.log('\n[8] 폰 폭 390px — 가로로 넘치지 않는가');

  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  const wide = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1);
  check('문서가 가로로 넘치지 않는다', !wide);

  /* ── ⑧-2 칸이 «쓸 만한 크기» 인가 ───────────────────────────────────── */
  /* ⚠️ 여기서 분류 버튼을 다시 누르지 않는다 — ⑤절의 새로고침으로 초안이 되살아나
     폼이 이미 열려 있고, 그때 `#kinds` 목록은 접혀 있어 클릭이 타임아웃 난다(실측).
     지금 화면에 그려져 있는 그 칸을 그대로 잰다(폭 390px = 폰 폭이라 더 낫다). */
  const box = await page.evaluate(() => {
    const s = document.getElementById('f_cat');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    const t = document.getElementById('f_title').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height),
             fs: parseFloat(cs.fontSize), tw: Math.round(t.width) };
  });
  check('제목 칸과 같은 폭이다 (혼자 쪼그라들지 않았다)',
        !!box && Math.abs(box.w - box.tw) <= 2, JSON.stringify(box));
  check('손가락으로 누를 만한 높이다 (44px 이상)', !!box && box.h >= 44, JSON.stringify(box));
  check('글자가 16px 이상이다 — iOS 는 그보다 작으면 누를 때 화면을 확대한다',
        !!box && box.fs >= 16, JSON.stringify(box));

  /* ── ⑨ 조용한 실패 ──────────────────────────────────────────────────── */
  console.log('\n[9] 실행 중 오류');
  check('자바스크립트 오류가 없다', errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건')
                   : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
