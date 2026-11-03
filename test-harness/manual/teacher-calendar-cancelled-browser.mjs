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
 *   ⑨ (2026-11-04) 그날 «취소·연기만» 있는 강사는 전체 보기에서 열이 없다 — 건수는 «열 없음 N» 으로 말하고, 그 강사를 고르면 보인다
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

/* KAYE — 그날 수업은 하나도 없고 취소만 하나(⑨) */
const OFF_KAYE = { off: 'cancelled', teacher_id: 31, date: TUE, hour: 15, start_time: '15:00', type: '1on1', duration_min: 20,
  students: [{ name: '카예학생', uid: 'stu_kaye' }], change: CH_CANCEL };

async function open(browser, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/admin/reports/c24-mirror')) return j({ ok: true, rows: [] });
    if (u.includes('/api/admin/teachers')) return j({ ok: true, items: opt.offOnly ? TEACHERS.concat([{ id: '31', name: 'KAYE' }]) : TEACHERS });
    if (u.includes('/api/admin/schedules')) {
      if (opt.oldServer) return j({ ok: true, schedules: SCHED });                         // off_items 칸이 없는 옛 서버
      const off = opt.noOff ? [] : opt.offOnly ? OFF.concat([OFF_KAYE]) : OFF;
      return j({ ok: true, schedules: SCHED, off_items: off, off_complete: opt.partial ? false : true });
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
      /* 글자는 «안쪽 줄» 마다 따로 잰다 — 카드 자체 color 는 테마 규칙이 덮을 수 있고, 줄마다 opacity 가 걸릴 수 있다 */
      kids: ['.ph54-ev-time', '.ph54-ev-name', '.ph54-ev-type'].map((sel) => { const k = c.querySelector(sel); if (!k) return null;
        let a = 1; for (let n = k; n && n.nodeType === 1; n = n.parentElement) a *= Number(getComputedStyle(n).opacity || 1);
        return { sel, color: getComputedStyle(k).color, opacity: a }; }).filter(Boolean),
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
    /* 바탕은 빗금의 «가장 어두운 줄»(#e2e8f0)로 잰다 — 밝은 줄로 재면 실제보다 좋게 나온다. 연기 카드는 단색 #f8fafc. */
    const DARKEST = { cancelled: [226, 232, 240], postponed: [248, 250, 252] };
    for (const o of [cx, pp]) {
      if (!o) continue;
      const bg = DARKEST[o.kind];
      check(`⑧ ${o.kind} 카드 안 글자 줄을 재었다(시각·이름·상태)`, o.kids.length === 3, o.kids);
      for (const k of o.kids) {
        const f0 = parseRgb(k.color), fg = f0.map((v, i) => v * k.opacity + bg[i] * (1 - k.opacity));
        const r = (Math.max(relLum(fg), relLum(bg)) + 0.05) / (Math.min(relLum(fg), relLum(bg)) + 0.05);
        console.log(`     · ${o.kind} ${k.sel} ${k.color} × opacity ${k.opacity} 대 ${bg} → ${Math.round(r * 100) / 100}:1`);
        check(`⑧ ${o.kind} ${k.sel} 대비 4.5:1 이상(가장 어두운 바탕·opacity 포함)`, r >= 4.5, { fg: k.color, opacity: k.opacity, bg, r: Math.round(r * 100) / 100 });
      }
    }

    console.log('\n[ ⑦ 강사 필터 ]');
    await A.page.evaluate(() => { const s = document.getElementById('ph54-teacher-filter'); if (s) { s.value = '24'; s.dispatchEvent(new Event('change')); } });
    await A.page.waitForTimeout(500);
    const f = await readCards(A.page);
    check('⑦ HANNAH 만 보면 HANNAH 취소·연기 2장만(BELLE 것은 안 그림)', f.offs.length === 2 && !f.offs.some((o) => /lby학생/.test(o.text)), f.offs.map((o) => o.text));
    check('⑦ 필터 모드 범례도 «취소·연기 2개»', /취소·연기 2개/.test(f.legend), f.legend.slice(-200));
    /* 🔁 (2026-11-03 후속) 취소·연기 카드는 «비어 있는 시간» 이다 — 고치기 전에는 그 자리가 빈칸이라 눌러서 차단할 수 있었다.
       그래서 필터 모드에서 그 카드를 누르면 «차단» 창이 떠야 하고, 진짜 수업 카드를 누르면 여전히 안 떠야 한다(짝). */
    const clickAt = (sel) => A.page.evaluate((sel) => {
      document.querySelectorAll('#ph54-blk-dlg').forEach((d) => d.remove());
      const c0 = document.querySelector(sel); if (!c0) return 'no-card';
      const r = c0.getBoundingClientRect();
      c0.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      const d = document.getElementById('ph54-blk-dlg'); const had = !!d; const txt = d ? d.textContent.replace(/\s+/g, ' ') : ''; if (d) d.remove(); return had ? ('open ' + txt) : 'none';
    }, sel);
    const offClick = await clickAt('#ph54-sched-wrap .ph54-off');
    check('🔴 ⑦ 필터 모드에서 취소·연기 카드를 누르면 그 시간 «차단» 창이 뜬다(빈 시간이라)', /^open /.test(offClick), offClick.slice(0, 160));
    const realClick = await clickAt('#ph54-sched-wrap .ph54-ev:not(.ph54-off):not(.ph54-c24)');
    check('⑦ 진짜 수업 카드를 누르면 차단 창이 안 뜬다(짝 — 그 카드가 실제로 있어야 한다)', realClick === 'none', realClick.slice(0, 120));
    check('⑦ 취소 카드 위 마우스 모양이 «칸»(cursor:cell)', f.offs.length > 0 && (await A.page.evaluate(() => getComputedStyle(document.querySelector('#ph54-sched-wrap .ph54-off')).cursor)) === 'cell');
    check('⑧ 페이지 스크립트 오류 0', A.errors.length === 0, A.errors.slice(0, 3));
    await A.ctx.close();

    console.log('\n[ ⑥ «모름» 은 «?» ]');
    const P = await open(browser, { partial: true, noOff: true });
    await renderCalendar(P.page);
    const p = await readCards(P.page);
    check('⑥ off_complete:false + 0건 → «취소·연기 ?»', /취소·연기 \?/.test(p.legend) && !/취소·연기 0/.test(p.legend), p.legend.slice(-200));
    check('⑥ 그때 설명이 «불러오지 못했습니다 — 모릅니다» 라고 말한다', /불러오지 못했습니다/.test(p.countTitle) && /모릅니다/.test(p.countTitle), p.countTitle);
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
    /* 서버는 «줄» 조회가 실패하면 줄을 하나도 안 싣는다 — 줄이 왔으면 건수는 정확하고, 비는 것은 누가·사유뿐이다(weekly-schedule 의 «N건» 과 같은 말) */
    check('⑥ off_complete:false + 3건 → «3개»(«이상» 이라고 말하지 않는다)', /취소·연기 3개/.test(p2.legend) && !/3개 이상/.test(p2.legend), p2.legend.slice(-200));
    check('⑥ 그때 설명이 «누가·사유 일부 + 건수는 정확» 이라고 말한다', /건수는 정확합니다/.test(p2.countTitle), p2.countTitle);
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

    console.log('\n[ ⑨ 취소·연기만 있는 강사는 열 없음 ]');
    const K = await open(browser, { offOnly: true });
    await renderCalendar(K.page);
    const kc = await readCards(K.page);
    const kayeCol = await K.page.evaluate(() => document.querySelectorAll('#ph54-sched-wrap .ph54-cal-col[data-teacher="31"]').length);
    check('🔴 ⑨ 전체 보기: KAYE(취소만) 강사 열이 없다', kayeCol === 0, kayeCol);
    check('⑨ 전체 보기: 강사 머리글에 KAYE 가 없다', !kc.heads.some((h) => /KAYE/.test(h)), kc.heads);
    check('⑨ 수업 있는 두 강사(HANNAH·BELLE) 열은 그대로', kc.heads.some((h) => /HANNAH/.test(h)) && kc.heads.some((h) => /BELLE/.test(h)), kc.heads);
    check('⑨ 그려진 취소·연기 카드는 3장(KAYE 것은 열이 없어 안 그림)', kc.offs.length === 3 && !kc.offs.some((o) => /카예학생/.test(o.text)), kc.offs.map((o) => o.text));
    check('🔴 ⑨ 펼친 요일 머리글은 4개로 세고 «그중 1개는 열 없음» 이라 말한다(감추기만 하지 않는다)', /취소·연기 4개/.test(kc.dayhead) && /그중 1개는 열 없음/.test(kc.dayhead), kc.dayhead);
    const hidTitle = await K.page.evaluate(() => (document.querySelector('#ph54-sched-wrap .ph54-off-hid') || { title: '' }).title);
    check('⑨ 그 표시에 «강사를 고르면 보인다» 설명', /고르면 주간 화면에 보입니다/.test(hidTitle), hidTitle);
    check('⑨ 범례 총계도 4개', /취소·연기 4개/.test(kc.legend), kc.legend.slice(-200));
    await K.page.evaluate(() => { const s = document.getElementById('ph54-teacher-filter'); if (s) { s.value = '31'; s.dispatchEvent(new Event('change')); } });
    await K.page.waitForTimeout(500);
    const kf = await readCards(K.page);
    check('🔴 ⑨ KAYE 를 고르면 그 취소 카드가 보인다(필터에서는 빼지 않는다 — 짝)', kf.offs.length === 1 && /카예학생/.test(kf.offs[0].text), kf.offs.map((o) => o.text));
    check('⑨ 페이지 오류 0', K.errors.length === 0, K.errors.slice(0, 3));
    await K.ctx.close();
  } finally {
    await browser.close().catch(() => {});
    if (srv) srv.kill();
  }
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  PASS ${PASS} / FAIL ${FAIL}`);
  console.log(`${'─'.repeat(52)}\n`);
  process.exit(FAIL ? 1 : 0);
})();
