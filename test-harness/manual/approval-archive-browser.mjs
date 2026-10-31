/*
 * 🗂 결재 보관함(시안 A) — **화면에서 실제로 열리고 눌리는가** (2026-09-08)
 *
 *   [왜 브라우저로 재나]
 *     함 트리는 서버 facets 응답으로 그려지고, 함을 누르면 오른쪽 조건이 바뀌어 다시 부른다.
 *     「그 함수가 있다」로는 «눌렀을 때 무슨 파라미터가 나갔나» 를 못 본다.
 *     그리고 A 안의 약점(폰에서 왼쪽 기둥)이 실제로 접히는지는 390px 로 그려 봐야 한다.
 *
 *   [짝으로 본다]
 *     결재 권한자에게 「전체 결재」·「결재자별」이 뜬다 ↔ 직원에게는 «안» 뜬다.
 *     건수가 왔다 ↔ 못 읽었으면 «—» 와 안내가 뜬다.
 *
 *   돌리는 법:  PW_DIR=/tmp/pw node test-harness/manual/approval-archive-browser.mjs
 *   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 보관함·문서함을 건드리면 사람이 부르세요.
 */

import { requireBrowser, fileUrl } from './_pw.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const { chromium, exe } = requireBrowser();
const FILE = fileUrl('cloudflare-deploy/public/work.html');
const P = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', '..',
                                          'cloudflare-deploy', 'src', 'approval-policy.ts')).href);

const TYPES = P.TYPES.map((t) => ({
  key: t.key, ko: t.ko, en: t.en, needs_amount: t.needsAmount, wants_file: t.wantsFile,
  requires_file: !!t.requiresFile, wants_dates: !!t.wantsDates, wants_category: !!t.wantsCategory,
  picks_period: t.key === 'hr',
}));
const CATS = P.CATEGORIES.map((c) => ({ key: c.key, ko: c.ko, en: c.en, account: c.account }));
const STATUSES = P.STATUSES.map((s) => ({ key: s.key, ko: s.ko, en: s.en }));
const now = Date.now(); const DAY = 86400000;
/* 기간 경계는 정본으로 만든다 — 손으로 적으면 오늘이 바뀔 때 검사가 거짓말한다 */
const today = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
const bounds = P.archivePeriods(today);

const SEP7 = Date.parse('2026-09-07T19:14:00+09:00');
function home(over) {
  return Object.assign({
    ok: true,
    me: { username: 'admin', name: '정우영', is_exec: true, is_ph_manager: false, is_teacher: false },
    colleagues: [], my_delegate: null, can_approve: true, pending: 0,
    types: TYPES, categories: CATS, statuses: STATUSES,
    inbox: [], mine: [], reuse: [], urgent: [],
    summary: {
      money: { month: [{ cur: 'PHP', total: 2800, n: 1 }], year: [{ cur: 'PHP', total: 2801, n: 4 }],
               month_count: 3, year_count: 4, month_no_amount: 0, year_no_amount: 0 },
      money_scope: 'all', my_open: 0, my_open_shown: 0, mine_shown: 0,
      money_unknown: false, open_unknown: false, inbox_capped: false, month: P.kstMonth(now),
      archive: { year_from: today.slice(0, 4) + '-01-01', year_count: 4,
                 last_decided_at: SEP7, last_decided_by: 'mgr_jjw', last_decided_by_name: '장지웅', unknown: false },
    },
  }, over || {});
}
const FACETS = {
  ok: true,
  facets: {
    all: 24, mine: 6, decided: 9,
    periods: {
      month:      { from: bounds.month.from,      to: bounds.month.to,      n: 3 },
      last_month: { from: bounds.last_month.from, to: bounds.last_month.to, n: 7 },
      quarter:    { from: bounds.quarter.from,    to: bounds.quarter.to,    n: 14 },
      year:       { from: bounds.year.from,       to: bounds.year.to,       n: 24 },
    },
    types: TYPES.map((t) => ({ key: t.key, ko: t.ko, en: t.en, n: t.key === 'expense' ? 11 : (t.key === 'doc' ? 7 : 0) })),
    approvers: [{ username: 'admin', name: '정우영', n: 12 }, { username: 'mgr_jjw', name: '장지웅', n: 9 },
                { username: 'mgr_lby', name: '이병엽', n: 3 }],
    approver_view: true, today, unknown: false,
  },
};
const ITEM = {
  id: 501, req_type: 'expense', type_ko: '지출 결재', type_en: 'Expense', title: '인터넷 요금 (PLDT) 8월',
  body: '', amount: 2899, currency: 'PHP', requester_username: 'mgr_karl', requester_name: 'Karl',
  status: 'approved', status_ko: '승인', status_en: 'Approved', created_at: now - 10 * DAY,
  stage_seq: 1, stage_total: 1, flags: [], steps: [{ seq: 1, role: 'staff', status: 'approved', decided_by: 'mgr_jjw' }],
};

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript(({ h, fx, item }) => {
    try { localStorage.setItem('mangoi_lang', 'ko'); localStorage.removeItem('mangoi_work_draft_v1'); } catch (e) {}
    // 화면마다 다른 홈·facets 를 쓰려면 sessionStorage 에 덮어쓰기를 둔다(addInitScript 는 reload 마다 다시 돈다)
    let ov = null, fov = null;
    try { ov = JSON.parse(sessionStorage.getItem('__home_ov') || 'null'); fov = JSON.parse(sessionStorage.getItem('__fx_ov') || 'null'); } catch (e) {}
    window.__HOME = ov || h; window.__FX = fov || fx; window.__CALLS = [];
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      window.__CALLS.push({ u: u, m: (o && o.method) || 'GET' });
      if (u.indexOf('/api/approval/home') === 0) return Promise.resolve(new Response(JSON.stringify(window.__HOME), { status: 200 }));
      if (u.indexOf('/api/push/vapid-public-key') === 0) return Promise.resolve(new Response(JSON.stringify({ ok: true, key: '' }), { status: 200 }));
      if (u.indexOf('view=facets') >= 0) return Promise.resolve(new Response(JSON.stringify(window.__FX), { status: 200 }));
      if (u.indexOf('/api/approval/requests') === 0) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, items: [item], has_more: false, offset: 0 }), { status: 200 }));
      }
      return rf(u, o);
    };
  }, { h: home(), fx: FACETS, item: ITEM });

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const lastReq = () => page.evaluate(() => {
    const c = window.__CALLS.filter((x) => x.u.indexOf('/api/approval/requests?') === 0 && x.u.indexOf('view=facets') < 0);
    return c.length ? c[c.length - 1].u : '';
  });
  const boxItems = () => page.evaluate(() => Array.from(document.querySelectorAll('#findBox .fbitem')).map((b) => ({
    t: b.querySelector('span').textContent.trim(), n: (b.querySelector('.fbn') || {}).textContent || '', on: b.classList.contains('on') })));
  const groups = () => page.evaluate(() => Array.from(document.querySelectorAll('#findBox .fbgrp')).map((g) => g.textContent.trim()));

  /* ── ① 다섯째 카드 ─────────────────────────────────────────────────── */
  console.log('\n[1] 맨 위 요약 줄 — 다섯째 카드 「결재 보관함」');
  const tiles = await page.evaluate(() => Array.from(document.querySelectorAll('#topTiles .tile')).map((t) => ({
    cls: t.className, txt: t.textContent.replace(/\s+/g, ' ').trim(), dis: t.disabled })));
  check('타일이 다섯 장이다 (넷 + 보관함)', tiles.length === 5, JSON.stringify(tiles.map((t) => t.txt.slice(0, 20))));
  const arch = tiles.find((t) => /\barch\b/.test(t.cls));
  check('보관함 타일이 있고 눌리는 버튼이다', !!arch && !arch.dis, JSON.stringify(arch));
  check('올해 건수 「4건」을 적는다', !!arch && /4건/.test(arch.txt), arch && arch.txt);
  check('어느 범위인지(전체)와 마지막 결재(9/7 장지웅)를 함께 적는다',
    !!arch && /전체/.test(arch.txt) && /마지막 결재 9\/7 장지웅/.test(arch.txt), arch && arch.txt);
  check('열기 화살표가 있다 (여는 문이라는 것을 말한다)', !!arch && /열기/.test(arch.txt));

  /* ── ② 카드를 누르면 문서함이 열리고 함 트리가 그려진다 ────────────── */
  console.log('\n[2] 카드 클릭 → 문서함 + 함 트리');
  /* 2026-09-07 사장님 지시로 문서함은 «처음부터 펼쳐져» 있다 — 카드는 그 자리로 데려가며 «전체» 로 바꾼다 */
  const before = await page.evaluate(() => document.getElementById('findPanel').hidden);
  check('전제 — 문서함은 처음부터 펼쳐져 있다 (9/7 지시 그대로)', before === false);
  const scope0 = await page.evaluate(() => document.getElementById('fscope').value);
  check('전제 — 누르기 전 범위는 «전체» 가 아니다 (아래 검사가 뜻을 가지려면)', scope0 !== 'all', scope0);
  await page.click('#topTiles .tile.arch');
  await page.waitForTimeout(500);
  check('카드를 눌러도 문서함이 접히지 않는다', (await page.evaluate(() => document.getElementById('findPanel').hidden)) === false);
  check('결재 권한자라 «전체» 로 열린다', (await page.evaluate(() => document.getElementById('fscope').value)) === 'all');
  check('facets 는 한 번만 불렀다 (펼침 때 한 번 — 카드가 또 부르지 않는다)', (await page.evaluate(() => window.__CALLS.filter((c) => c.u.indexOf('view=facets') >= 0).length)) === 1);
  check('«전체» 로 바꾼 것을 기기에 기억한다 (9/7 fscopePick 과 같은 길)', (await page.evaluate(() => localStorage.getItem('mangoi_work_find_scope'))) === 'all');
  const g1 = await groups();
  check('함 묶음 넷 — 전체 · 기간별 · 결재자별 · 종류별', g1.join('|') === '전체|기간별|결재자별|종류별', g1.join('|'));
  let items = await boxItems();
  const find = (t) => items.find((x) => x.t === t);
  check('「전체 결재 24」가 켜져 있다', !!find('전체 결재') && find('전체 결재').n === '24' && find('전체 결재').on, JSON.stringify(find('전체 결재')));
  check('「내가 결재한 것 9」 · 「내가 올린 것 6」', !!find('내가 결재한 것') && find('내가 결재한 것').n === '9' && find('내가 올린 것').n === '6');
  check('기간 함 넷과 건수', find('이번 달') && find('이번 달').n === '3' && find('이번 분기') && find('이번 분기').n === '14');
  check('결재자 셋 — 이름으로, 많이 결재한 순', items.filter((x) => ['정우영', '장지웅', '이병엽'].indexOf(x.t) >= 0).map((x) => x.t).join(',') === '정우영,장지웅,이병엽');
  check('0건인 종류는 감춘다 (빈 폴더는 눌러도 빈 표) — 지출·문서만', items.filter((x) => x.t === '지출 결재' || x.t === '일반 문서' || x.t === '문서').length >= 1
    && !items.some((x) => x.n === '0'));
  const where0 = await page.evaluate(() => document.getElementById('findWhere').textContent);
  check('「보는 중: 전체 결재」', /보는 중: 전체 결재/.test(where0), where0);

  /* ── ③ 결재자 함 → decided_by 로 나간다 ─────────────────────────────── */
  console.log('\n[3] 함을 누르면 오른쪽 조건이 바뀐다');
  await page.evaluate(() => (window.__CALLS.length = 0));
  const jjw = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#findBox .fbitem')).find((x) => x.querySelector('span').textContent.trim() === '장지웅');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { onTop: !!top && (top === b || b.contains(top)) };
  });
  check('🔴 「장지웅」 함이 실제로 눌린다 (맨 위가 그 버튼이다)', !!jjw && jjw.onTop, JSON.stringify(jjw));
  await page.evaluate(() => Array.from(document.querySelectorAll('#findBox .fbitem')).find((x) => x.querySelector('span').textContent.trim() === '장지웅').click());
  await page.waitForTimeout(300);
  let u = await lastReq();
  check('요청에 decided_by=mgr_jjw 가 실린다', /decided_by=mgr_jjw/.test(u), u);
  check('그때 scope 는 all', /scope=all/.test(u), u);
  items = await boxItems();
  check('「장지웅」이 켜지고 「전체 결재」는 꺼진다 (결재자 함은 전체 위에 얹는 축)',
    find('장지웅').on && !find('전체 결재').on);
  check('「보는 중」이 결재자를 말한다', /결재자 장지웅/.test(await page.evaluate(() => document.getElementById('findWhere').textContent)));
  // 기간
  await page.evaluate(() => Array.from(document.querySelectorAll('#findBox .fbitem')).find((x) => x.querySelector('span').textContent.trim() === '이번 달').click());
  await page.waitForTimeout(300);
  u = await lastReq();
  check('「이번 달」 → 서버가 준 경계 그대로 from·to 가 실린다',
    u.indexOf('from=' + bounds.month.from) >= 0 && u.indexOf('to=' + bounds.month.to) >= 0, u);
  check('결재자 조건은 그대로 남는다 (축은 겹친다)', /decided_by=mgr_jjw/.test(u));
  await page.evaluate(() => Array.from(document.querySelectorAll('#findBox .fbitem')).find((x) => x.querySelector('span').textContent.trim() === '이번 달').click());
  await page.waitForTimeout(300);
  u = await lastReq();
  check('「이번 달」을 한 번 더 누르면 기간이 풀린다', u.indexOf('from=') < 0 && u.indexOf('to=') < 0, u);
  // 종류
  await page.evaluate(() => Array.from(document.querySelectorAll('#findBox .fbitem')).find((x) => /지출/.test(x.querySelector('span').textContent)).click());
  await page.waitForTimeout(300);
  u = await lastReq();
  check('종류 함 → type=expense', /type=expense/.test(u), u);
  const clr = await page.evaluate(() => !!document.querySelector('#findBox .fbclear'));
  check('조건이 겹치면 「함 조건 지우기」가 뜬다', clr);
  await page.evaluate(() => document.querySelector('#findBox .fbclear').click());
  await page.waitForTimeout(300);
  u = await lastReq();
  check('지우기 → 결재자·기간·종류가 모두 빠진다', !/decided_by=|from=|to=|type=/.test(u), u);
  items = await boxItems();
  check('지운 뒤 「전체 결재」가 다시 켜진다', find('전체 결재').on);
  // 「내가 결재한 것」 함
  await page.evaluate(() => Array.from(document.querySelectorAll('#findBox .fbitem')).find((x) => x.querySelector('span').textContent.trim() === '내가 결재한 것').click());
  await page.waitForTimeout(300);
  u = await lastReq();
  check('「내가 결재한 것」 → scope=decided', /scope=decided/.test(u), u);
  check('고르기 칸(select)에도 「내가 결재한 것」이 있다', (await page.evaluate(() => Array.from(document.getElementById("fscope").options).map((o) => o.value))).indexOf('decided') >= 0);

  /* ── ④ 폰 — A 안의 약점이 접히는가 ─────────────────────────────────── */
  console.log('\n[4] 390px — 왼쪽 기둥이 가로 칩 줄로 접힌다');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const lay = document.querySelector('.findlay'), box = document.getElementById('findBox');
    const cols = getComputedStyle(lay).gridTemplateColumns.split(' ').length;
    return { cols, disp: getComputedStyle(box).display, ox: getComputedStyle(box).overflowX,
             scrolls: box.scrollWidth > box.clientWidth + 1, pageWide: document.documentElement.scrollWidth > window.innerWidth + 1,
             mainW: document.querySelector('.findmain').getBoundingClientRect().width, vw: window.innerWidth };
  });
  check('한 열이다 (함이 표 옆이 아니라 위)', m.cols === 1, JSON.stringify(m));
  check('함은 가로로 굴리는 줄 (flex + overflow-x auto)', m.disp === 'flex' && m.ox === 'auto' && m.scrolls, JSON.stringify(m));
  check('표 칸이 화면 폭을 거의 다 쓴다 (기둥에 3분의 1을 안 뺏긴다)', m.mainW > m.vw * 0.85, JSON.stringify(m));
  check('문서가 가로로 넘치지 않는다', m.pageWide === false);
  const tileW = await page.evaluate(() => Array.from(document.querySelectorAll("#topTiles .tile")).map((t) => Math.round(t.getBoundingClientRect().width)));
  check('타일 다섯이 폰에서도 전부 보인다(폭 0 없음)', tileW.length === 5 && tileW.every((w) => w > 100), JSON.stringify(tileW));

  /* ── ⑤ 직원 — 「전체」·「결재자별」이 «안» 뜬다 (짝 검사) ───────────── */
  console.log('\n[5] 결재 권한이 없는 직원에게는 전체·결재자별이 안 뜬다');
  await page.setViewportSize({ width: 1100, height: 900 });
  const staffHome = home({ me: { username: 'mgr_melca', name: 'Melca', is_exec: false, is_ph_manager: true, is_teacher: false }, can_approve: false });
  staffHome.summary.money_scope = 'mine';
  staffHome.summary.archive = { year_from: today.slice(0, 4) + '-01-01', year_count: 2, last_decided_at: SEP7, last_decided_by: 'mgr_jjw', last_decided_by_name: '장지웅', unknown: false };
  const staffFx = JSON.parse(JSON.stringify(FACETS)); staffFx.facets.all = null; staffFx.facets.approvers = []; staffFx.facets.approver_view = false;
  await page.evaluate(({ h, f }) => { sessionStorage.setItem('__home_ov', JSON.stringify(h)); localStorage.removeItem('mangoi_work_find_scope'); sessionStorage.setItem('__fx_ov', JSON.stringify(f)); }, { h: staffHome, f: staffFx });
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  const t2 = await page.evaluate(() => (document.querySelector('#topTiles .tile.arch') || {}).textContent || '');
  check('직원의 보관함 타일은 「내가 올린 것 · 2건」', /내가 올린 것/.test(t2) && /2건/.test(t2), t2);
  await page.click('#topTiles .tile.arch'); await page.waitForTimeout(500);
  check('직원은 «내가 올린 것» 그대로다 (전체로 바뀌지 않는다)', (await page.evaluate(() => document.getElementById('fscope').value)) === 'mine');
  const g2 = await groups();
  check('🔴 결재자별 묶음이 «안» 뜬다', g2.indexOf('결재자별') < 0, g2.join('|'));
  items = await boxItems();
  check('🔴 「전체 결재」 함이 «안» 뜬다', !find('전체 결재'), JSON.stringify(items.map((x) => x.t)));
  check('「내가 결재한 것」·「내가 올린 것」은 있다', !!find('내가 결재한 것') && !!find('내가 올린 것'));
  u = await lastReq();
  check('직원의 요청에 decided_by 가 없다', !/decided_by=/.test(u), u);

  /* ── ⑥ 못 읽었을 때 ────────────────────────────────────────────────── */
  console.log('\n[6] 건수를 못 읽었으면 «—» 와 안내');
  const badFx = JSON.parse(JSON.stringify(FACETS));
  badFx.facets.all = null; badFx.facets.decided = null; badFx.facets.unknown = true;
  for (const k of Object.keys(badFx.facets.periods)) badFx.facets.periods[k].n = null;
  await page.evaluate((f) => { sessionStorage.removeItem('__home_ov'); sessionStorage.setItem('__fx_ov', JSON.stringify(f)); }, badFx);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  await page.click('#topTiles .tile.arch'); await page.waitForTimeout(500);
  items = await boxItems();
  check('못 읽은 함은 «—» (0 이 아니다)', find('전체 결재') && find('전체 결재').n === '—' && find('이번 달').n === '—', JSON.stringify(items.slice(0, 5)));
  check('「일부 건수를 읽지 못했습니다」 안내가 뜬다', /일부 건수를 읽지 못했습니다/.test(await page.evaluate(() => document.getElementById('findBox').textContent)));
  const badHome = home(); badHome.summary.archive = { year_from: '2026-01-01', year_count: null, last_decided_at: null, last_decided_by: null, last_decided_by_name: null, unknown: true };
  await page.evaluate((h) => { sessionStorage.setItem('__home_ov', JSON.stringify(h)); }, badHome);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
  const t3 = await page.evaluate(() => (document.querySelector('#topTiles .tile.arch') || {}).textContent || '');
  check('카드도 못 읽었으면 「—」 + 「읽지 못했습니다」 (0건이 아니다)', /—/.test(t3) && /읽지 못했습니다/.test(t3) && !/0건/.test(t3), t3);

  /* ── ⑦ 조용한 실패 ─────────────────────────────────────────────────── */
  console.log('\n[7] 실행 중 오류');
  check('🔴 자바스크립트 오류가 없다', errors.length === 0, errors.join(' / '));

  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ⚠ ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
  await browser.close();
  process.exit(FAIL ? 1 : 0);
})();
