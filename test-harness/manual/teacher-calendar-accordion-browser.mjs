// -*- coding: utf-8 -*-
/* 🗂 강사 스케줄 주간 캘린더 — «요일 접기 + 강사별 열 + 빈 시간» 브라우저 검사 (사람이 부른다)
 *
 *   발단(2026-09-02 사장님): 「수업들이 겹치지 않고 한눈에 모두 정확하고 깨끗하게 볼 수 있게」
 *   — 전체 강사 보기에서 같은 시각 카드가 한 자리에 쌓여 맨 위 한 장만 보였다.
 *
 *   여기서 재는 것 (문자열 하니스로는 못 보는 «몇 px 에 그려졌는가»):
 *     ① 전체 보기 = 접힌 요일 띠 6개 + 펼친 요일의 강사 열(그날 수업 있는 강사 수)
 *     ② 🔴 같은 열 안의 카드 두 장이 «화면에서» 서로 겹치지 않는다(getBoundingClientRect 교차 0건)
 *     ③ 같은 강사·같은 시각 둘 = 반으로 나뉘어 둘 다 보이고 빨간 테두리(.ph54-dup)
 *     ④ 수업 사이 30분 이상 = «빈 N분» 점선 칸이 그 자리에 있다
 *     ⑤ 접힌 요일 머리글을 누르면 그 요일이 펼쳐진다 (스크롤 위치 유지)
 *     ⑥ 강사 머리글을 누르면 그 강사만 7열 주간으로
 *     ⑦ 카페24 카드는 강사 열에 들어가되 여전히 끌 수 없다
 *
 *   준비: mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   실행: PW_DIR=/tmp/pw node test-harness/manual/teacher-calendar-accordion-browser.mjs
 *   ⚠️ 자동 게이트에서 안 돈다(manual/) — 캘린더 배치·CSS 를 건드리면 사람이 부른다. */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dir, '../../cloudflare-deploy/public');
const PORT = 8963;
const BASE = `http://127.0.0.1:${PORT}`;
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => { if (ok) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); } console.log(`  ${ok ? '✅' : '❌'} ${name}${!ok && extra ? ` — ${extra}` : ''}`); };

async function serve() {
  try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  throw new Error('정적 서버가 안 뜸');
}

/* 이번 주 날짜 — 화면(ph54GetWeekDays)과 같은 «로컬 시간» 기준 월요일 */
const pad = (n) => (n < 10 ? '0' + n : '' + n);
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay())); monday.setHours(0, 0, 0, 0);
const DAY = (i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return iso(d); };
const TODAY_IDX = (now.getDay() + 6) % 7;

/* 강사 12명 — 오늘 8명에게 수업, FAR(id 2) 는 20:40 에 «같은 시각 둘», ZEE(id 1) 는 14:00·15:00 사이 빈 40분 */
const TEACHERS = ['Zee', 'Far', 'Belle', 'Kaye', 'Krystel', 'Ana', 'Shas', 'Hannah', 'Melca', 'Maimai', 'Ness', 'Rica'].map((n, i) => ({ id: String(i + 1), name: n }));
let nextId = 1000;
const rec = (tid, day, hm, du, name) => ({ id: nextId++, teacher_id: String(tid), date: DAY(day), start_time: hm, duration_min: du, type: '1on1', students: [{ name }] });
const SCHED = [
  rec(1, TODAY_IDX, '14:00', 20, '허윤아'), rec(1, TODAY_IDX, '15:00', 20, '김선우'), rec(1, TODAY_IDX, '15:30', 30, '최윤서'),
  rec(2, TODAY_IDX, '20:40', 20, '허윤아'), rec(2, TODAY_IDX, '20:40', 30, '한채아'), rec(2, TODAY_IDX, '22:00', 20, '이서준'),
  rec(3, TODAY_IDX, '16:00', 20, '박지호'), rec(4, TODAY_IDX, '16:00', 20, '정우영'), rec(5, TODAY_IDX, '16:00', 20, '조연희'),
  rec(6, TODAY_IDX, '16:00', 40, '이하늘'), rec(7, TODAY_IDX, '16:10', 20, '강민준'), rec(8, TODAY_IDX, '20:00', 20, '윤서아'),
  rec(3, (TODAY_IDX + 1) % 7, '17:00', 20, '오지우'), rec(4, (TODAY_IDX + 1) % 7, '17:00', 20, '임도윤'), rec(5, (TODAY_IDX + 2) % 7, '18:00', 20, '서예은'),
];
const MIRROR = { ok: true, mode: 'off', since: DAY(0), until: DAY(6), total: 1, summary: {}, by_state: { '1': 1 }, by_date: [],
  rows: [{ class_id: 'c1', date: DAY(TODAY_IDX), start_time: '19:00', duration_min: 20, class_state: 1, teacher_id: '8', teacher_name: 'Hannah', student_uid: 'kes', student_name: 'Kes', verdict: 'not_whitelisted' }] };

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();
  await page.route('**/api/**', async (route) => {
    const u = route.request().url();
    const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('/api/admin/reports/c24-mirror')) return j(MIRROR);
    if (u.includes('/api/admin/teachers')) return j({ ok: true, items: TEACHERS });
    if (u.includes('/api/admin/schedules')) return j({ ok: true, schedules: SCHED });
    if (u.includes('/api/admin/me')) return j({ ok: true, username: 'admin', role: 'hq', scope: { type: 'hq' } });
    return j({ ok: true, items: [], schedules: [], events: [] });
  });
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {}
    try { localStorage.setItem('ph54_c24_overlay', '1'); } catch (e) {}
  });
  await page.goto(BASE + '/admin.html?_=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('ph54-sched-wrap'), { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const el = document.getElementById('card-teacher-schedule');
    if (el && el.tagName === 'DETAILS') el.open = true;
    if (typeof window.jumpToMenu === 'function') { try { window.jumpToMenu('card-teacher-schedule'); } catch (e) {} }
  });
  await page.waitForSelector('#ph54-sched-wrap .ph54-ev', { timeout: 20000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/* 같은 열 안에서 카드 상자끼리 교차하는 짝 수 + 열 정보 */
const measure = () => {
  const cols = Array.from(document.querySelectorAll('#ph54-cal-track .ph54-cal-col'));
  let cross = 0; const pairs = [];
  cols.forEach((col) => {
    const evs = Array.from(col.querySelectorAll('.ph54-ev')).map((e) => ({ r: e.getBoundingClientRect(), t: e.textContent.trim().slice(0, 24) }));
    for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i].r, b = evs[j].r;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 1 && iy > 1) { cross++; pairs.push(evs[i].t + ' × ' + evs[j].t); }
    }
  });
  const dup = Array.from(document.querySelectorAll('#ph54-cal-track .ph54-ev.ph54-dup')).map((e) => ({ r: e.getBoundingClientRect(), t: e.textContent.trim().slice(0, 20), col: e.parentElement.dataset.teacher }));
  /* 빈 자리 칸의 «위» = 그 열에서 바로 앞에 끝나는 카드의 «아래» (관리자 화면은 body zoom 1.3 이라 px 상수를 못 쓴다) */
  const gaps = Array.from(document.querySelectorAll('#ph54-cal-track .ph54-gap')).map((g) => {
    const r = g.getBoundingClientRect();
    const prevBottom = Math.max(...Array.from(g.parentElement.querySelectorAll('.ph54-ev')).map((e) => e.getBoundingClientRect().bottom).filter((b) => b <= r.top + 6), -1);
    return { t: g.textContent.trim(), top: r.top, prevBottom, col: g.parentElement.dataset.teacher };
  });
  const hourLbl = document.querySelector('#ph54-cal-track .ph54-cal-hourlabel');
  const hourInfo = hourLbl ? { text: hourLbl.textContent.trim(), color: getComputedStyle(hourLbl).color, vis: getComputedStyle(hourLbl).visibility, w: hourLbl.getBoundingClientRect().width } : null;
  /* 접힌 띠의 밀도 그라데이션 — adm-light-surfaces 페인터(그라데이션 최대 휘도<0.16 이면 통째로 옅게)를 거친 «계산값» 에
     서로 다른 알파가 둘 이상 남아 있어야 «언제 몰리는지» 가 보인다 */
  const foldBg = (() => { const f = document.querySelector('#ph54-cal-track .ph54-cal-fold[data-day="' + ((new Date().getDay() + 6) % 7 + 1) % 7 + '"]'); if (!f) return null;
    const bi = getComputedStyle(f).backgroundImage; const alphas = new Set((bi.match(/rgba\(167, 139, 250, ([\d.]+)\)/g) || []).map((m) => m.match(/, ([\d.]+)\)/)[1]));
    return { n: alphas.size, alphas: Array.from(alphas).slice(0, 5), important: f.style.getPropertyPriority('background-image') }; })();
  const openHead = document.querySelector('#ph54-cal-head .ph54-cal-dayhead.ph54-open');
  return {
    folds: document.querySelectorAll('#ph54-cal-track .ph54-cal-fold').length,
    foldHeads: document.querySelectorAll('#ph54-cal-head .ph54-cal-dayhead.ph54-cal-fold-head').length,
    cols: cols.length, teacherCols: cols.filter((c) => c.dataset.teacher).length,
    teacherHeads: Array.from(document.querySelectorAll('#ph54-cal-head .ph54-cal-subhead[data-teacher]')).map((h) => h.querySelector('b').textContent.trim()),
    openHead: openHead ? openHead.textContent.trim() : '', foldBg,
    cross, pairs, dup, gaps,
    cards: document.querySelectorAll('#ph54-cal-track .ph54-ev').length,
    c24: Array.from(document.querySelectorAll('#ph54-cal-track .ph54-c24')).map((e) => ({ draggable: e.getAttribute('draggable'), col: e.parentElement.dataset.teacher })),
    scrollTop: document.getElementById('ph54-cal-body').scrollTop,
    innerW: document.getElementById('ph54-cal-inner').scrollWidth, bodyW: document.getElementById('ph54-cal-body').clientWidth, hourInfo,
    headCols: getComputedStyle(document.getElementById('ph54-cal-head')).gridTemplateColumns.split(' ').length,
    trackCols: getComputedStyle(document.getElementById('ph54-cal-track')).gridTemplateColumns.split(' ').length,
  };
};

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const { page } = await open(browser);
    let m = await page.evaluate(measure);
    console.log('\n[ ① 전체 보기 = 요일 접기 + 강사별 열 ]');
    check('접힌 요일 띠 6개 · 접힌 머리글 6개', m.folds === 6 && m.foldHeads === 6, JSON.stringify([m.folds, m.foldHeads]));
    check('펼친 요일의 강사 열 = 그날 수업 있는 강사 8명(+카페24 강사 포함)', m.teacherCols === 8 && m.cols === 8, JSON.stringify([m.cols, m.teacherCols]));
    check('강사 머리글 8개, 원부 순서', JSON.stringify(m.teacherHeads) === JSON.stringify(['Zee', 'Far ⚠', 'Belle', 'Kaye', 'Krystel', 'Ana', 'Shas', 'Hannah']), JSON.stringify(m.teacherHeads));
    check('펼친 요일 머리글이 «수업 12개 · 강사 8명» 을 말한다', /수업 12개/.test(m.openHead) && /강사 8명/.test(m.openHead), m.openHead);
    check('머리글과 본문의 grid 열 수가 같다', m.headCols === m.trackCols && m.headCols === 1 + 6 + 8, JSON.stringify([m.headCols, m.trackCols]));
    /* 가로 폭은 «검사» 가 아니라 «보고» — 이 스텁 화면의 카드 폭은 740px 뿐이라(사장님 1920px 화면은 약 1,150px) 강사 8열도 20px 넘친다.
       열 최소폭(58px)을 낮추면 카드 글자가 잘리므로 여기서는 숫자만 적어 둔다. */
    console.log(`  ℹ️ 캘린더 안쪽 폭 ${m.innerW}px / 보이는 폭 ${m.bodyW}px (강사 ${m.teacherCols}열 · 최소 58px) — 넘치면 가로 스크롤`);
    check('시간 눈금(거터) 글자가 있고 보인다', !!m.hourInfo && /\d\d:00/.test(m.hourInfo.text) && m.hourInfo.vis === 'visible' && m.hourInfo.w > 20, JSON.stringify(m.hourInfo));
    check('카드 = 수업 12 + 카페24 1', m.cards === 13, `cards=${m.cards}`);
    check('🔴 접힌 띠(내일)의 밀도 그라데이션이 페인터를 거친 뒤에도 남아 있다(알파 2종 이상 · 인라인 !important 덮임 없음)', !!m.foldBg && m.foldBg.n >= 2 && m.foldBg.important !== 'important', JSON.stringify(m.foldBg));
    console.log('\n[ ② 🔴 화면에서 겹치는 카드가 없다 ]');
    check('같은 열 안 카드 상자 교차 0건', m.cross === 0, m.pairs.join(' | '));
    console.log('\n[ ③ 같은 강사·같은 시각 둘 ]');
    check('FAR 20:40 두 장이 .ph54-dup', m.dup.length === 2 && m.dup.every((d) => d.col === '2'), JSON.stringify(m.dup.map((d) => d.t)));
    check('두 장이 나란히(폭이 반, 서로 안 겹침)', m.dup.length === 2 && Math.abs(m.dup[0].r.width - m.dup[1].r.width) < 2 && (m.dup[0].r.right <= m.dup[1].r.left + 1 || m.dup[1].r.right <= m.dup[0].r.left + 1), JSON.stringify(m.dup.map((d) => [Math.round(d.r.left), Math.round(d.r.width)])));
    console.log('\n[ ④ 빈 시간 점선 칸 ]');
    const zeeGap = m.gaps.find((g) => g.col === '1');
    check('ZEE 열에 «빈 40분» (14:20~15:00)', !!zeeGap && /빈 40분/.test(zeeGap.t), JSON.stringify(m.gaps));
    /* 20분 카드는 최소 높이 22px(=26분)로 그려져 «시간상 끝» 보다 몇 px 아래까지 내려온다 — 빈 자리는 시간상 끝(14:20)에서
       시작하므로 카드 아래보다 «조금 위» 에서 시작하는 것이 맞다(카드가 위에 덮여 보인다). zoom 1.3 까지 감안해 -10~+6px. */
    check('그 칸이 14:00 카드 «바로 아래» 에서 시작한다(카드 최소높이 22px 만큼은 겹침 허용)', !!zeeGap && zeeGap.prevBottom > 0 && zeeGap.top - zeeGap.prevBottom >= -10 && zeeGap.top - zeeGap.prevBottom < 6, zeeGap ? JSON.stringify([zeeGap.top, zeeGap.prevBottom]) : '');
    check('FAR 열에 «빈 50분»(21:10~22:00) — 겹친 뒤는 늦게 끝나는 카드 뒤부터', m.gaps.some((g) => g.col === '2' && /빈 50분/.test(g.t)), JSON.stringify(m.gaps.filter((g) => g.col === '2')));
    check('ZEE 15:20~15:30 의 10분 틈은 안 그린다', m.gaps.filter((g) => g.col === '1').length === 1);
    console.log('\n[ ⑦ 카페24 카드 ]');
    check('카페24 카드가 Hannah(8) 열에 · draggable 없음', m.c24.length === 1 && m.c24[0].col === '8' && m.c24[0].draggable === null, JSON.stringify(m.c24));

    console.log('\n[ ⑤ 접힌 요일 펼치기 ]');
    await page.evaluate(() => { document.getElementById('ph54-cal-body').scrollTop = 300; });
    const nextIdx = (TODAY_IDX + 1) % 7;
    await page.click(`#ph54-cal-head .ph54-cal-fold-head[data-day="${nextIdx}"]`);
    await page.waitForTimeout(400);
    m = await page.evaluate(measure);
    check('다음 날이 펼쳐지고 강사 열 2개', m.teacherCols === 2 && m.folds === 6, JSON.stringify([m.teacherCols, m.folds, m.openHead]));
    check('스크롤 위치가 유지된다(300)', Math.abs(m.scrollTop - 300) < 2, String(m.scrollTop));
    await page.click(`#ph54-cal-track .ph54-cal-fold[data-day="${TODAY_IDX}"]`);
    await page.waitForTimeout(400);
    m = await page.evaluate(measure);
    check('접힌 띠(본문)를 눌러도 펼쳐진다 — 오늘로 복귀, 강사 열 8개', m.teacherCols === 8, String(m.teacherCols));

    console.log('\n[ ⑥ 강사 머리글 → 그 강사만 ]');
    await page.click('#ph54-cal-head .ph54-cal-subhead[data-teacher="2"]');
    await page.waitForTimeout(400);
    m = await page.evaluate(measure);
    const sel = await page.evaluate(() => document.getElementById('ph54-teacher-filter').value);
    check('필터가 FAR(2) 로 바뀌고 7열 주간', sel === '2' && m.cols === 7 && m.folds === 0 && m.teacherCols === 0, JSON.stringify([sel, m.cols, m.folds]));
    check('필터 모드에서도 겹침 0 · dup 두 장 나란히', m.cross === 0 && m.dup.length === 2, JSON.stringify([m.cross, m.dup.length]));
    check('필터 모드에서도 빈 자리를 그린다', m.gaps.some((g) => /빈 50분/.test(g.t)), JSON.stringify(m.gaps));
    await page.click('#ph54-clear-filter'); await page.waitForTimeout(300);
    m = await page.evaluate(measure);
    check('전체 보기로 돌아오면 다시 접힘', m.folds === 6 && m.teacherCols === 8);

    if (process.env.SHOT) { await page.evaluate(() => { const c = document.getElementById('ph54-cal'); c && c.scrollIntoView(); }); await page.screenshot({ path: process.env.SHOT, fullPage: false }); console.log('  📸 ' + process.env.SHOT); }
  } finally {
    await browser.close();
    if (srv) srv.kill();
  }
  console.log('\n════════════════════════════════════════');
  console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
  if (FAIL) { FAILS.forEach((f) => console.log('   ❌ ' + f)); process.exitCode = 1; }
  console.log('════════════════════════════════════════\n');
})().catch((e) => { console.error('💥', e); process.exitCode = 1; });
