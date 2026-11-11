// -*- coding: utf-8 -*-
// 🗂 강사 명부 Active / Inactive / 전체 탭 — 브라우저 검사 (2026-11-11)
//   문자열·실행 하니스(teacher_roster_tabs_harness.mjs)가 못 보는 것 — 진짜 admin.html 에서:
//     · 탭이 전역 룰(details.menu-card button{인디고 알약 !important})에 뭉개지지 않는가
//     · 탭을 누르면 표 줄이 실제로 갈리는가 · 건수가 맞는가 · EN 토글 뒤에도 건수 칸이 사는가
//     · 드롭다운으로 상태를 고르면 탭이 «전체» 로 비켜 서는가 · 그 자리 상태 변경이 건수를 바꾸는가
//   ⚠️ 자동으로 안 돕니다(manual/ 규약) — 사람이 부릅니다:
//        PW_DIR=/tmp/pw node test-harness/manual/teacher-roster-tabs-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8937;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT = process.env.SHOT || '';

let pass = 0, fail = 0;
const check = (n, ok, extra) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); } };

const SEED = [
  { id: 201, korean_name: 'Teacher Ana',     english_name: 'Teacher Ana',     status: '활동중', list_hidden: 0, group_name: 'Office Teacher' },
  { id: 202, korean_name: 'Teacher Kes',     english_name: 'Teacher Kes',     status: '활동중', list_hidden: 0, group_name: 'Home-based' },
  { id: 203, korean_name: 'Teacher Len',     english_name: 'Teacher Len',     status: null,     list_hidden: 0, group_name: 'Home-based' },
  { id: 204, korean_name: 'Teacher Krystel', english_name: 'Teacher Krystel', status: '퇴사',   list_hidden: 0, group_name: 'Home-based' },
  { id: 205, korean_name: 'FAYE',            english_name: 'FAYE',            status: '비활동', list_hidden: 0, group_name: '' },
];

async function serve() {
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill(); throw new Error('정적 서버를 못 띄웠습니다');
}

const rowsShown = page => page.evaluate(() => [...document.querySelectorAll('#tp-list-body tr[data-tid]')].map(tr => Number(tr.getAttribute('data-tid'))).sort());
const tabState = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#tp-tabs .tp-tab')].map(b =>
  [b.getAttribute('data-tab'), { on: b.classList.contains('tp-tab-on'), n: (b.querySelector('.tp-tab-n') || {}).textContent, label: (b.querySelector('[data-ko]') || {}).textContent }])));
const waitRows = (page, n) => page.waitForFunction(k => document.querySelectorAll('#tp-list-body tr[data-tid]').length === k, n, { timeout: 8000 }).catch(() => {});

(async () => {
  const pw = loadPlaywright(), exe = findChromium();
  if (!pw || !exe) { console.log('  ⏭ playwright-core 또는 Chromium 없음 — 건너뜁니다.'); process.exit(0); }
  const server = await serve();
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e && e.message || e)));
    await page.addInitScript(() => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {} });
    await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const rows = SEED.map(r => ({ ...r }));
    await ctx.route('**/api/admin/teacher-profiles?**', r => {
      const st = new URL(r.request().url()).searchParams.get('status');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: rows.filter(x => !st || x.status === st) }) });
    });
    await ctx.route('**/api/admin/teacher-profiles/*', async r => {
      if (r.request().method() !== 'PATCH') return r.fallback();
      const id = Number((r.request().url().match(/teacher-profiles\/(\d+)/) || [])[1]);
      const b = JSON.parse(r.request().postData() || '{}'), row = rows.find(x => x.id === id);
      if (row && 'status' in b) row.status = b.status;
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#tp-tabs', { state: 'attached', timeout: 30000 });
    await page.evaluate(() => {
      try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-teacher-mgmt'); } catch (e) {}
      let el = document.getElementById('tp-list-table');
      while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
      window.loadTeacherProfiles();
    });
    await waitRows(page, 3);
    await page.waitForTimeout(400);

    console.log('\n[ ① 기본 — Active 탭 ]');
    let s = await tabState(page);
    check('Active 탭이 켜져 있다', s.active.on && !s.inactive.on && !s.all.on, JSON.stringify(s));
    check('건수 Active 3 · Inactive 2 · 전체 5', s.active.n === '3' && s.inactive.n === '2' && s.all.n === '5', JSON.stringify(s));
    check('표에는 활동 강사만(NULL 상태 포함)', JSON.stringify(await rowsShown(page)) === '[201,202,203]', JSON.stringify(await rowsShown(page)));
    check('건수 글(tp-count)도 탭 안 건수', (await page.textContent('#tp-count')).trim() === '3명');

    const look = await page.evaluate(() => {
      const b = document.querySelector('#tp-tabs .tp-tab[data-tab="inactive"]'), on = document.querySelector('#tp-tabs .tp-tab-on');
      const cs = getComputedStyle(b), r = b.getBoundingClientRect();
      return { bgImg: cs.backgroundImage, bg: cs.backgroundColor, onBg: getComputedStyle(on).backgroundColor, pad: cs.paddingLeft, h: r.height, w: r.width, vis: r.width > 0 && r.height > 0 };
    });
    check('탭이 보인다', look.vis, JSON.stringify(look));
    check('전역 인디고 그라데이션에 안 뭉개졌다', look.bgImg === 'none' && look.pad === '16px', JSON.stringify(look));
    check('켜진 탭은 밝은 앰버(fbbf24)', look.onBg === 'rgb(251, 191, 36)', look.onBg);
    /* 🪤 대비가 모자라거나(흰 글자+#f59e0b) 배경이 «너무 진하면»(#b45309) adm-light-surfaces 가
          탭·글자에 인라인 색을 덧칠한다(둘 다 실측) — 그 개입이 하나도 없어야 한다. 페인터가 늦게 돌 수 있어 잠깐 기다린다. */
    await page.waitForTimeout(2500);
    const painted = await page.evaluate(() => [...document.querySelectorAll('#tp-tabs, #tp-tabs *')]
      .filter(el => /color|background/.test(el.getAttribute('style') || '') || el.hasAttribute('data-ls-text'))   // data-lightened 는 «훑었음» 표식일 뿐
      .map(el => (el.className || el.tagName) + ' ' + (el.getAttribute('style') || 'data-ls-text')));
    check('대비 페인터가 탭을 덧칠하지 않았다', painted.length === 0, JSON.stringify(painted));

    console.log('\n[ ② 탭 누르기 ]');
    await page.click('#tp-tabs .tp-tab[data-tab="inactive"]');
    await waitRows(page, 2);
    check('Inactive — 비활동·퇴사만', JSON.stringify(await rowsShown(page)) === '[204,205]', JSON.stringify(await rowsShown(page)));
    s = await tabState(page);
    check('Inactive 탭이 켜졌다', s.inactive.on && !s.active.on);
    if (SHOT) await page.locator('#tp-tabs').screenshot({ path: SHOT.replace(/\.png$/, '-tabs.png') });
    await page.click('#tp-tabs .tp-tab[data-tab="all"]');
    await waitRows(page, 5);
    check('전체 — 다섯 줄', (await rowsShown(page)).length === 5);

    console.log('\n[ ③ 드롭다운으로 상태를 고르면 탭이 «전체» 로 비켜 선다 ]');
    await page.click('#tp-tabs .tp-tab[data-tab="active"]');
    await waitRows(page, 3);
    await page.selectOption('#tp-filter-status', '퇴사');
    await waitRows(page, 1);
    s = await tabState(page);
    check('퇴사 1명이 보인다(0명 아님)', JSON.stringify(await rowsShown(page)) === '[204]', JSON.stringify(await rowsShown(page)));
    check('탭은 «전체» 가 켜진다', s.all.on && !s.active.on, JSON.stringify(s));
    await page.click('#tp-tabs .tp-tab[data-tab="active"]');
    await waitRows(page, 3);
    check('탭을 누르면 드롭다운 상태가 비워진다', (await page.inputValue('#tp-filter-status')) === '');
    check('…그리고 Active 세 줄', JSON.stringify(await rowsShown(page)) === '[201,202,203]');

    console.log('\n[ ④ 그 자리 상태 변경 → 건수 갱신 ]');
    await page.evaluate(() => window.tpSetTeacherStatus(202, '퇴사'));
    await page.waitForTimeout(300);
    s = await tabState(page);
    check('Active 2 · Inactive 3 으로', s.active.n === '2' && s.inactive.n === '3', JSON.stringify(s));
    check('줄은 되돌리기를 위해 그 자리에 남는다', (await rowsShown(page)).includes(202));
    await page.evaluate(() => window.loadTeacherProfiles());
    await waitRows(page, 2);
    check('새로고침하면 탭대로 정리', JSON.stringify(await rowsShown(page)) === '[201,203]', JSON.stringify(await rowsShown(page)));

    console.log('\n[ ⑤ EN 토글 — 라벨은 영어로, 건수 칸은 그대로 ]');
    await page.evaluate(() => { if (typeof window.toggleAdminLang === 'function') window.toggleAdminLang(); });
    await page.waitForTimeout(500);
    s = await tabState(page);
    check('라벨 Active / Inactive / All', /Active/.test(s.active.label) && /Inactive/.test(s.inactive.label) && s.all.label === 'All', JSON.stringify(s));
    check('건수 칸이 살아 있다', s.active.n === '2' && s.inactive.n === '3' && s.all.n === '5', JSON.stringify(s));
    if (SHOT) {
      await page.evaluate(() => document.getElementById('tp-tabs').scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: SHOT });
    }
    check('페이지 오류 없음(탭 관련)', !errs.some(e => /_tpTab|tpSetTab/.test(e)), errs.join(' | '));
  } finally {
    await browser.close(); server.kill();
  }
  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  if (fail) process.exit(1);
})();
