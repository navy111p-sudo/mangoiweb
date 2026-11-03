/* 🧾 «강사 스케줄 (주간 통합 캘린더)» 에 취소·연기 수업이 «지우지 않고» 남는가 — 진짜 Chromium 으로 확인 (2026-11-03)
 *
 * [왜]
 *   사장님 「주간 시간표도 똑같이 수정해줘」(매니저 제보 「취소했더니 페이지에서 통째로 사라졌다」).
 *   admin/weekly-schedule.html 은 같은 날 PR #2000 으로 고쳤고, admin.html 안의 이 캘린더(js/adm-q6.js)는
 *   같은 API(/api/admin/schedules)를 부르면서 items 만 읽어 취소·연기 회차(off_items)를 버리고 있었다.
 *
 * [무엇을 확인하나]
 *   ① 취소·연기 카드가 실제로 그려진다(.ph54-off) — 학생 이름 · «✕ 취소됨» / «⏸ 연기됨…» 글자
 *   ② 🔴 보기 전용 — draggable·data-idx·data-block 이 없다(드래그·차단 삭제가 그 둘로 돈다)
 *   ③ 🔴 취소한 자리에 새 수업을 넣은 것은 «겹침(⚠ 같은 시각 수업 둘)» 이 아니다 — 대신 자리를 나눠 포개지지 않는다
 *   ④ 진짜 수업 카드는 그대로 드래그된다
 *   ⑤ 누가·언제·사유는 서버가 준 것만(툴팁) · 범례 «취소·연기 N개»
 *   ⑥ off_complete 가 아니면 «0개» 가 아니라 «?» · 옛 서버(칸 없음)도 «?»
 *   ⑦ 강사 필터를 걸면 다른 강사의 취소 카드는 안 그린다
 *   ⑧ EN 으로 그리면 영어로 말한다 · 글자 대비 4.5:1 이상 · 페이지 오류 0
 *
 * [돌리는 법] 게이트는 이 파일을 물어 가지 않는다(사람이 부른다).
 *   node test-harness/manual/teacher-calendar-cancelled-browser.mjs    (전역 playwright 가 있으면 그대로)
 *   PW_DIR=/tmp/pw node test-harness/manual/teacher-calendar-cancelled-browser.mjs
 * ⚠️ 서버(D1)에 아무것도 쓰지 않는다 — fetch 를 가로채 가짜 응답을 물린다.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.TCAL_PORT || 8947);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why) : '')); }
};

async function serve() {
  try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error('정적 서버를 못 띄웠습니다: ' + PUBLIC);
}

/* 이번 주 화요일(KST) — 화면이 보고 있는 주와 같아야 카드가 그려진다 */
const KST = 9 * 3600 * 1000;
const k = new Date(Date.now() + KST);
const monday = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - ((k.getUTCDay() + 6) % 7) * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const TUE = iso(new Date(monday.getTime() + 86400000));

const TEACHERS = [{ id: '24', name: 'HANNAH' }, { id: '30', name: 'BELLE' }];
/* 진짜 수업 둘 — 하나는 «취소한 자리에 새로 넣은» 14:00(같은 강사 · 같은 시각) */
const SCHED = [
  { id: 901, teacher_id: '24', date: TUE, start_time: '21:00', type: '1on1', duration_min: 20, students: [{ name: '김연숙', uid: 'stu_kys' }] },
  { id: 902, teacher_id: '30', date: TUE, start_time: '14:00', type: '1on1', duration_min: 20, students: [{ name: '새학생', uid: 'stu_new' }] },
];
const CH_CANCEL = { kind: 'cancelled', by: 'Maimai', at_kst: '11/02 14:22', reason: '학생 요청', label_ko: '✕ 취소됨', label_en: '✕ Cancelled' };
const CH_PP = { kind: 'postponed', by: null, at_kst: null, reason: null, label_ko: '⏸ 연기됨 — 새 날짜 미정', label_en: '⏸ Postponed — no new date' };
const OFF = [
  /* BELLE 14:00 취소 — 같은 자리에 진짜 수업(902)이 있다 → 겹침 아님 */
  { off: 'cancelled', teacher_id: 30, date: TUE, hour: 14, start_time: '14:00', type: '1on1', duration_min: 20,
    students: [{ name: 'lby학생', uid: 'lby01' }], change: CH_CANCEL },
  /* HANNAH 16:00 연기(새 날짜 없음) */
  { off: 'postponed', teacher_id: 24, date: TUE, hour: 16, start_time: '16:00', type: '1on1', duration_min: 20,
    students: [{ name: '연기학생', uid: 'stu_pp' }], change: CH_PP },
  /* HANNAH 18:00 그룹 취소 — 학생마다 한 행(합쳐져야 한다) */
  { off: 'cancelled', teacher_id: 24, date: TUE, hour: 18, start_time: '18:00', type: 'group', duration_min: 40,
    students: [{ name: '그룹A', uid: 'ga' }], change: CH_CANCEL },
  { off: 'cancelled', teacher_id: 24, date: TUE, hour: 18, start_time: '18:00', type: 'group', duration_min: 40,
    students: [{ name: '그룹B', uid: 'gb' }], change: CH_CANCEL },
];

async function open(browser, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/admin/reports/c24-mirror')) return j({ ok: true, rows: [] });
    if (u.includes('/api/admin/teachers')) return j({ ok: true, items: TEACHERS });
    if (u.includes('/api/admin/schedules')) {
      if (opt.oldServer) return j({ ok: true, schedules: SCHED });                         // off_items 칸이 없는 옛 서버
      return j({ ok: true, schedules: SCHED, off_items: opt.noOff ? [] : OFF, off_complete: opt.partial ? false : true });
    }
    if (u.includes('/api/admin/me')) return j({ ok: true, username: 'admin', role: 'hq', scope: { type: 'hq' } });
    return j({ ok: true, items: [], schedules: [], events: [] });
  });
  await page.addInitScript((en) => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {}
    try { localStorage.setItem('ph54_c24_overlay', '0'); } catch (e) {}
    try { localStorage.setItem('mangoi_lang', en ? 'en' : 'ko'); } catch (e) {}
  }, !!opt.en);
  await page.goto(BASE + '/admin.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('card-teacher-schedule'), { timeout: 30000 }).catch(() => {});
  return { ctx, page, errors };
}

async function renderCalendar(page) {
  await page.evaluate(() => {
    const el = document.getElementById('card-teacher-schedule');
    if (typeof window.jumpToMenu === 'function') { try { window.jumpToMenu('card-teacher-schedule'); } catch (e) {} }
    if (el && el.tagName === 'DETAILS' && !el.open) el.open = true;
  });
  await page.waitForSelector('#ph54-sched-wrap #ph54-cal', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(900);
  /* 화요일을 펼친다(전체 보기는 한 요일만 강사별 열로 펼친다) */
  await page.evaluate(() => {
    const h = document.querySelector('#ph54-sched-wrap .ph54-cal-fold-head[data-day="1"]');
    if (h) h.click();
  });
  await page.waitForTimeout(500);
}

const relLum = (rgb) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
const parseRgb = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);

const readCards = (page) => page.evaluate(() => {
  const offs = Array.from(document.querySelectorAll('#ph54-sched-wrap .ph54-off'));
  const real = Array.from(document.querySelectorAll('#ph54-sched-wrap .ph54-ev:not(.ph54-off):not(.ph54-c24)'));
  const box = (c) => { const r = c.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; };
  return {
    offs: offs.map((c) => ({ text: c.textContent.replace(/\s+/g, ' ').trim(), title: c.getAttribute('title') || '', kind: c.getAttribute('data-off'),
      drag: c.getAttribute('draggable'), idx: c.getAttribute('data-idx'), blk: c.getAttribute('data-block'), dup: c.classList.contains('ph54-dup'),
      box: box(c), color: getComputedStyle(c).color, bg: getComputedStyle(c).backgroundColor,
      strike: getComputedStyle(c.querySelector('.ph54-ev-time')).textDecorationLine, col: (c.closest('.ph54-cal-col') || {}).getAttribute && c.closest('.ph54-cal-col').getAttribute('data-teacher') })),
    real: real.map((c) => ({ text: c.textContent.replace(/\s+/g, ' ').trim(), drag: c.getAttribute('draggable'), dup: c.classList.contains('ph54-dup'), box: box(c),
      col: c.closest('.ph54-cal-col') && c.closest('.ph54-cal-col').getAttribute('data-teacher') })),
    legend: ((document.querySelector('#ph54-sched-wrap .ph54-legend') || {}).textContent || '').replace(/\s+/g, ' '),
    countTitle: (document.querySelector('#ph54-sched-wrap .ph54-off-count') || { getAttribute: () => '' }).getAttribute('title') || '',
    heads: Array.from(document.querySelectorAll('#ph54-sched-wrap .ph54-cal-subhead')).map((h) => (h.getAttribute('title') || '') + ' | ' + h.textContent.replace(/\s+/g, ' ')),
    dayhead: ((document.querySelector('#ph54-sched-wrap .ph54-cal-dayhead.ph54-open') || {}).textContent || '').replace(/\s+/g, ' '),
  };
});

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const A = await open(browser);
    await renderCalendar(A.page);
    const c = await readCards(A.page);

    console.log('\n[ ① 그려지는가 · 사실을 말하는가 ]');
    check('① 취소·연기 카드 3장(그룹 두 행은 한 장으로 합침)', c.offs.length === 3, c.offs.map((o) => o.text));
    const cx = c.offs.find((o) => /lby학생/.test(o.text)), pp = c.offs.find((o) => /연기학생/.test(o.text)), gr = c.offs.find((o) => /그룹A/.test(o.text));
    check('① 취소 카드가 «✕ 취소됨» 이라고 말한다', !!cx && /✕ 취소됨/.test(cx.text) && cx.kind === 'cancelled', cx);
    check('① 연기 카드가 서버 글자 «⏸ 연기됨 — 새 날짜 미정» 을 쓴다', !!pp && /⏸ 연기됨 — 새 날짜 미정/.test(pp.text) && pp.kind === 'postponed', pp);
    check('① 그룹은 학생이 합쳐진다(그룹A, 그룹B)', !!gr && /그룹A/.test(gr.text) && /그룹B/.test(gr.text), gr);
    check('① 카드가 실제로 크기를 가진다', c.offs.every((o) => o.box.w > 20 && o.box.h >= 20), c.offs.map((o) => o.box));
    check('① 취소는 시각에 취소선, 연기는 취소선 없음', !!cx && /line-through/.test(cx.strike) && !!pp && !/line-through/.test(pp.strike), [cx && cx.strike, pp && pp.strike]);
    check('① 강사 열이 맞다(BELLE=30, HANNAH=24)', !!cx && cx.col === '30' && !!pp && pp.col === '24', [cx && cx.col, pp && pp.col]);

    console.log('\n[ ② 보기 전용 ]');
    check('🔴 ② draggable 이 없다', c.offs.every((o) => o.drag === null), c.offs.map((o) => o.drag));
    check('🔴 ② data-idx 가 없다(진짜 수업 배열 인덱스와 안 섞인다)', c.offs.every((o) => o.idx === null), c.offs.map((o) => o.idx));
    check('② data-block 이 없다(누르면 지워지지 않는다)', c.offs.every((o) => o.blk === null), c.offs.map((o) => o.blk));
    /* 눌러도 아무 일도 안 일어난다 — confirm 이 뜨면 기록 */
    const clicked = await A.page.evaluate(() => {
      let asked = 0; const orig = window.confirm; window.confirm = () => { asked++; return false; };
      const c0 = document.querySelector('#ph54-sched-wrap .ph54-off'); if (c0) c0.click();
      window.confirm = orig; return asked;
    });
    check('② 취소 카드를 눌러도 확인창(차단 삭제)이 안 뜬다', clicked === 0, clicked);

    console.log('\n[ ③ 취소한 자리에 새 수업 = 겹침 아님 ]');
    const newCls = c.real.find((r) => /새학생/.test(r.text));
    check('🔴 ③ 새 수업 카드에 «겹침» 표시가 없다', !!newCls && !newCls.dup, newCls);
    check('🔴 ③ 취소 카드에도 «겹침» 표시가 없다', !!cx && !cx.dup, cx);
    check('③ 두 카드가 같은 자리에 포개지지 않는다(자리를 나눈다)', !!newCls && !!cx && (cx.box.x + cx.box.w <= newCls.box.x + 2 || newCls.box.x + newCls.box.w <= cx.box.x + 2),
      { cx: cx && cx.box, neu: newCls && newCls.box });
    check('③ BELLE 머리글에 ⚠(겹침) 가 없다', !c.heads.some((h) => /BELLE/.test(h) && /⚠/.test(h)), c.heads);
    check('③ BELLE 머리글이 «1회» 와 «✕1» 을 갈라 센다', c.heads.some((h) => /BELLE/.test(h) && /1회/.test(h) && /✕1/.test(h)), c.heads);

    console.log('\n[ ④ 원래 기능 ]');
    check('④ 진짜 수업 카드는 그대로 드래그된다', c.real.length >= 2 && c.real.every((r) => r.drag === 'true'), c.real);
    check('④ 펼친 요일 머리글: 수업 2개 · 취소·연기 3개', /수업 2개/.test(c.dayhead) && /취소·연기 3개/.test(c.dayhead), c.dayhead);

    console.log('\n[ ⑤ 누가·사유 · 범례 ]');
    check('⑤ 툴팁: 처리 Maimai · 11/02 14:22 · 사유 학생 요청', !!cx && /처리: Maimai · 11\/02 14:22/.test(cx.title) && /사유: 학생 요청/.test(cx.title), cx && cx.title);
    check('⑤ 누가 없는 연기 카드는 «처리:» 줄을 지어내지 않는다', !!pp && !/처리:/.test(pp.title), pp && pp.title);
    check('⑤ 툴팁이 «옮기거나 지울 수 없다 · 비어 있다» 를 말한다', !!cx && /옮기거나 지울 수 없습니다/.test(cx.title) && /비어 있습니다/.test(cx.title), cx && cx.title);
    check('⑤ 범례에 «✕ 취소 · ⏸ 연기» 와 «취소·연기 3개»', /✕ 취소 · ⏸ 연기/.test(c.legend) && /취소·연기 3개/.test(c.legend), c.legend.slice(-260));

    console.log('\n[ ⑧ 읽힘 · 오류 ]');
    for (const o of [cx, pp]) {
      if (!o) continue;
      const fg = parseRgb(o.color), bg = parseRgb(o.bg);
      const r = (Math.max(relLum(fg), relLum(bg)) + 0.05) / (Math.min(relLum(fg), relLum(bg)) + 0.05);
      check(`⑧ ${o.kind} 카드 글자 대비 4.5:1 이상`, r >= 4.5, { fg: o.color, bg: o.bg, r: Math.round(r * 100) / 100 });
    }

    console.log('\n[ ⑦ 강사 필터 ]');
    await A.page.evaluate(() => { const s = document.getElementById('ph54-teacher-filter'); if (s) { s.value = '24'; s.dispatchEvent(new Event('change')); } });
    await A.page.waitForTimeout(500);
    const f = await readCards(A.page);
    check('⑦ HANNAH 만 보면 HANNAH 취소·연기 2장만(BELLE 것은 안 그림)', f.offs.length === 2 && !f.offs.some((o) => /lby학생/.test(o.text)), f.offs.map((o) => o.text));
    check('⑦ 필터 모드 범례도 «취소·연기 2개»', /취소·연기 2개/.test(f.legend), f.legend.slice(-200));
    /* 필터 모드에서 취소 카드를 눌러도 «차단» 창이 안 뜬다(빈 칸 클릭만 차단) */
    const dlg = await A.page.evaluate(() => {
      const c0 = document.querySelector('#ph54-sched-wrap .ph54-off'); if (c0) c0.click();
      const d = document.getElementById('ph54-blk-dlg'); const had = !!d; if (d) d.remove(); return had;
    });
    check('⑦ 필터 모드에서 취소 카드를 눌러도 차단 창이 안 뜬다', dlg === false, dlg);
    check('⑧ 페이지 스크립트 오류 0', A.errors.length === 0, A.errors.slice(0, 3));
    await A.ctx.close();

    console.log('\n[ ⑥ «모름» 은 «?» ]');
    const P = await open(browser, { partial: true, noOff: true });
    await renderCalendar(P.page);
    const p = await readCards(P.page);
    check('⑥ off_complete:false + 0건 → «취소·연기 ?»', /취소·연기 \?/.test(p.legend) && !/취소·연기 0/.test(p.legend), p.legend.slice(-200));
    check('⑥ 그때 설명이 «다 불러오지 못했습니다» 라고 말한다', /다 불러오지 못했습니다/.test(p.countTitle), p.countTitle);
    await P.ctx.close();
    const O = await open(browser, { oldServer: true });
    await renderCalendar(O.page);
    const o = await readCards(O.page);
    check('⑥ 옛 서버(칸 없음)도 «0개» 가 아니라 «?»', /취소·연기 \?/.test(o.legend), o.legend.slice(-200));
    check('⑥ 옛 서버에서도 진짜 수업은 그대로 그려진다', o.real.length >= 2, o.real.length);
    await O.ctx.close();
    const P2 = await open(browser, { partial: true });
    await renderCalendar(P2.page);
    const p2 = await readCards(P2.page);
    check('⑥ off_complete:false + 3건 → «3개 이상» (정확한 건수라고 단정하지 않는다)', /취소·연기 3개 이상/.test(p2.legend), p2.legend.slice(-200));
    await P2.ctx.close();

    console.log('\n[ ⑧ EN ]');
    const E = await open(browser, { en: true });
    await renderCalendar(E.page);
    const e = await readCards(E.page);
    const ecx = e.offs.find((x) => /lby학생/.test(x.text));
    check('⑧ EN: 카드가 «✕ Cancelled» 로 말한다', !!ecx && /✕ Cancelled/.test(ecx.text), ecx && ecx.text);
    check('⑧ EN: 툴팁이 By/Reason/«cannot be moved» 로 말한다', !!ecx && /By: Maimai/.test(ecx.title) && /Reason: /.test(ecx.title) && /cannot be moved/.test(ecx.title), ecx && ecx.title);
    check('⑧ EN: 범례 «Cancelled · ⏸ Postponed» 와 «Cancelled/postponed 3»', /Cancelled · ⏸ Postponed/.test(e.legend) && /Cancelled\/postponed 3/.test(e.legend), e.legend.slice(-260));
    check('⑧ EN 페이지 오류 0', E.errors.length === 0, E.errors.slice(0, 3));
    await E.ctx.close();
  } finally {
    await browser.close().catch(() => {});
    if (srv) srv.kill();
  }
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  PASS ${PASS} / FAIL ${FAIL}`);
  console.log(`${'─'.repeat(52)}\n`);
  process.exit(FAIL ? 1 : 0);
})();
