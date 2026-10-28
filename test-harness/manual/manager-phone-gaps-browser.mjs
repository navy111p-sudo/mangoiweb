// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📵 매니저 화면(manager.html)의 「번호 없는 학생」 카드 — 진짜 브라우저 검사 (2026-10-28 신설)

   [왜] 이 화면은 «첫 화면 외부 리소스 0개» 계약이라 js/adm-phone-gaps.js 를 카드를 «처음 펼칠 때만» 받는다.
        그 «펼치기 전에는 안 받는다» · «기본 영어로 그린다» · «어두운 화면에서 읽힌다» 는 코드를 읽어서는 못 본다.
   [무엇] 진짜 manager.html + 진짜 js/adm-phone-gaps.js 를 로컬 서버로 띄우고 /api/** 만 가로챈다.
        ① 첫 화면에는 그 스크립트 요청 0건 · 본사면 카드·메뉴가 보인다
        ② 메뉴로 열면 그때 한 번 받고 목록을 «영어로»(저장된 언어 없음 = 이 화면 기본) 그린다
        ③ 저장 → PATCH 본문은 채운 칸만 · 다시 불러 빠졌나 확인 · 쓰다 만 번호는 남는다
        ④ 🇰🇷 언어를 바꾸면 목록도 한국어로 · 쓰다 만 번호는 남는다
        ⑤ 🌙 어두운 화면 — 알림·입력칸·안내·링크 글자 대비 4.5 이상
        ⑥ 지사 계정 — 카드·메뉴가 감춰지고 목록 요청 0건
        ⑦ 스크립트를 못 받으면 그 사실을 말하고, 접었다 다시 펼치면 다시 받는다
        ⑧ 폰 폭(390) — 입력칸·저장 버튼이 카드 안·화면 안 · 맨 위다(눌린다)
   ⚠️ manual/ 규약상 게이트가 물어 가지 않는다 — 이 카드·로더·adm-phone-gaps.js 를 건드리면 사람이 직접:
        node test-harness/manual/manager-phone-gaps-browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('⏭ playwright 없음 — 건너뜀(«확인 안 함» 이지 «문제없음» 이 아닙니다)'); process.exit(0); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.MPG_PORT || 8973);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why).slice(0, 300) : '')); }
};

/* 씨앗 — 공개 저장소라 실제 학생 아이디·번호는 안 쓴다 */
const G = (uid, name, date, time, extra = {}) => Object.assign({ uid, name, classes: 2, next_date: date, next_time: time, status: 'none', short_len: 0, hint_phone: '' }, extra);
function freshServer(scope = 'hq') {
  return {
    scope,
    gaps: [
      G('test_a', 'Student A', '2026-10-29', '16:00', { hint_phone: '010-9999-0001' }),
      G('test_b', 'Student B', '2026-10-29', '17:20'),
      G('test_c', 'Student C', '2026-10-30', '15:00', { status: 'short', short_len: 9 }),
    ],
    gets: [], patches: [], jsReqs: 0, failJs: false,
  };
}

async function setup(page, S, { lang = null, dark = false } = {}) {
  await page.addInitScript(([lang, dark]) => {
    try {
      localStorage.removeItem('mangoi_lang');
      if (lang) localStorage.setItem('mangoi_lang', lang);
      if (dark) localStorage.setItem('mangoi_manager_theme', 'dark'); else localStorage.removeItem('mangoi_manager_theme');
      localStorage.setItem('mangoi_admin_session', JSON.stringify({ username: 'mgr_test', role: 'hq_mgr' }));
    } catch (e) {}
  }, [lang, dark]);
  const J = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', (route) => J(route, { ok: true }));   // 포괄 먼저(나중에 등록한 것이 이긴다)
  await page.route('**/api/admin/exec/summary**', (route) => J(route, { ok: true, scope: { type: S.scope, label: S.scope === 'hq' ? '본사' : '부산' }, this_month: { period: '2026-10' }, students: {} }));
  await page.route('**/api/admin/me**', (route) => J(route, { ok: true, username: 'mgr_test', role: S.scope === 'hq' ? 'hq' : 'branch', scope: { type: S.scope } }));
  await page.route('**/api/admin/student/phone-gaps**', (route) => {
    const u = new URL(route.request().url());
    S.gets.push(u.searchParams.get('days'));
    const days = Number(u.searchParams.get('days')) || 7;
    return J(route, { ok: true, days, from: '2026-10-28', to: '2026-11-03', students: 12, reachable: 12 - S.gaps.length, gaps: S.gaps,
      complete: true, hint_complete: true, sms_mode: 'real', reminder_enabled: true, measured_at: Date.now() });
  });
  await page.route(/\/api\/admin\/student\/[^/]+\/contact$/, (route) => {
    const req = route.request();
    const uid = decodeURIComponent(new URL(req.url()).pathname.split('/')[4]);
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    S.patches.push({ method: req.method(), uid, body });
    S.gaps = S.gaps.filter(g => g.uid !== uid);
    return J(route, { ok: true, phone_kept: true });
  });
  /* 변이시험용 — 저장소 파일을 고치지 않고 사본을 가리킨다(MPG_SRC_MANAGER · MPG_SRC_JS) */
  await page.route('**/js/adm-phone-gaps.js*', (route) => {
    S.jsReqs++;
    if (S.failJs) return route.abort();
    if (process.env.MPG_SRC_JS) return route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(process.env.MPG_SRC_JS, 'utf8') });
    return route.continue();
  });
  if (process.env.MPG_SRC_MANAGER) {
    await page.route(/\/manager\.html(\?|$)/, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(process.env.MPG_SRC_MANAGER, 'utf8') }));
  }
}

async function boot(page) {
  await page.goto(BASE + '/manager.html?_nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(1200);
}
const openViaSide = (page) => page.evaluate(() => { window.sideGo('sm-phone-gaps'); });
const rowsOf = (page) => page.$$eval('#pg-body div.pg-row[data-uid]', trs => trs.map(t => t.getAttribute('data-uid')));
const waitFor = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function lum([r, g, b]) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/* 글자색·합성 배경(반투명 층은 아래에서 위로 합성 — CLAUDE.md 2장) */
const colorsOf = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const a = m[1].split(',').map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
  const fg = parse(getComputedStyle(el).color);
  const layers = []; let n = el;
  while (n && n.nodeType === 1) { const b = parse(getComputedStyle(n).backgroundColor); if (b && b[3] > 0) { layers.push(b); if (b[3] >= 1) break; } n = n.parentElement; }
  let bg = [255, 255, 255];
  for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; bg = [0, 1, 2].map(k => L[k] * L[3] + bg[k] * (1 - L[3])); }
  return { fg, bg };
}, sel);

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: PUBLIC, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await chromium.launch();
try {
  /* ── ①~⑤ 본사 매니저 · 저장된 언어 없음(= 이 화면 기본 영어) ── */
  {
    const S = freshServer('hq');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e && e.message)));
    await setup(page, S);
    await boot(page);

    console.log('\n[ ① 첫 화면 — 그 스크립트는 안 받는다 · 본사면 보인다 ]');
    check('첫 화면에서 adm-phone-gaps.js 요청 0건(계약 1번)', S.jsReqs === 0, S.jsReqs);
    check('첫 화면에서 목록 요청 0건(펼칠 때만)', S.gets.length === 0, S.gets);
    const shown = await page.evaluate(() => ({
      card: getComputedStyle(document.getElementById('sm-phone-gaps')).display,
      side: getComputedStyle(document.getElementById('sidePhoneGaps')).display,
      sideText: document.getElementById('sidePhoneGaps').textContent.trim(),
      lang: document.documentElement.lang,
    }));
    check('본사면 카드·왼쪽 메뉴가 보인다', shown.card !== 'none' && shown.side !== 'none', shown);
    check('(전제) 저장된 언어가 없으면 이 화면은 영어다', shown.lang === 'en' && /Students without a phone/.test(shown.sideText), shown);

    console.log('\n[ ② 메뉴로 열면 그때 한 번 받고 영어로 그린다 ]');
    await openViaSide(page);
    const ok2 = await waitFor(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 3);
    check('열면 목록 3줄이 그려진다', ok2, await rowsOf(page));
    check('그 스크립트는 한 번만 받는다', S.jsReqs === 1, S.jsReqs);
    check('목록은 한 번 불러온다(days=7)', S.gets.length === 1 && S.gets[0] === '7', S.gets);
    const en = await page.evaluate(() => ({ cnt: document.getElementById('pg-count').textContent, save: document.querySelector('.pg-save').textContent, row: document.querySelector('.pg-row').textContent }));
    check('목록이 이 화면 언어(영어)로 그려진다 — 저장값이 없어도', /students/.test(en.cnt) && /Save/.test(en.save) && !/저장/.test(en.save), en);
    const hintVals = await page.$$eval('#pg-body div.pg-row[data-uid="test_a"] .pg-in', ins => ins.map(i => i.value));
    check('참고 번호를 입력칸에 자동으로 넣지 않는다', hintVals.every(v => v === ''), hintVals);
    // 접었다 다시 펼쳐도 다시 받지도 다시 부르지도 않는다
    await page.evaluate(() => { const d = document.getElementById('sm-phone-gaps'); d.open = false; });
    await page.waitForTimeout(150);
    await page.evaluate(() => { const d = document.getElementById('sm-phone-gaps'); d.open = true; });
    await page.waitForTimeout(400);
    check('접었다 펼쳐도 다시 받거나 다시 부르지 않는다', S.jsReqs === 1 && S.gets.length === 1, { js: S.jsReqs, gets: S.gets });

    console.log('\n[ ③ 저장 — 채운 칸만 · 다시 불러 확인 · 쓰다 만 번호는 남는다 ]');
    await page.fill('#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="student"]', '010-5555-6666');
    await page.fill('#pg-body div.pg-row[data-uid="test_a"] .pg-in[data-role="parent"]', '010-1234-5678');
    await page.click('#pg-body div.pg-row[data-uid="test_a"] .pg-save');
    const gone = await waitFor(page, () => !document.querySelector('#pg-body div.pg-row[data-uid="test_a"]'));
    check('저장한 학생은 다시 불러온 목록에서 빠진다', gone, await rowsOf(page));
    check('PATCH 본문은 채운 칸만(학부모 번호 하나)', S.patches.length === 1 && JSON.stringify(S.patches[0].body) === JSON.stringify({ parent_phone: '010-1234-5678' }), S.patches);
    check('저장 뒤 다시 불러왔다(GET 2번)', S.gets.length === 2, S.gets);
    const kept = await page.inputValue('#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="student"]').catch(() => null);
    check('다른 줄에 쓰다 만 번호가 다시 그린 뒤에도 남는다', kept === '010-5555-6666', kept);
    const fl = await page.$eval('#pg-flash', el => ({ shown: getComputedStyle(el).display !== 'none', t: el.textContent, warn: el.getAttribute('data-warn') }));
    check('저장 성공 안내가 영어로 보인다(그 아이디와 함께)', fl.shown && fl.t.includes('test_a') && /saved/.test(fl.t) && fl.warn === '0', fl);
    for (const [sel, name] of [['#pg-flash', '저장 성공 알림'], ['.pgm-note', '안내 상자'], ['.pgm-ref', '참고 안내 상자'],
      ['#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="parent"]', '입력칸'], ['#pg-body div.pg-row[data-uid="test_b"] a', '학생 이름 링크']]) {
      const c = await colorsOf(page, sel);
      const cr = c && c.fg ? contrast(c.fg, c.bg) : 0;
      console.log(`  · 밝은 화면 ${name} 대비 ${cr.toFixed(2)}`);
      check(`밝은 화면 — ${name} 글자 대비 4.5 이상`, cr >= 4.5, c);
    }

    console.log('\n[ ④ 언어를 바꾸면 목록도 따라온다 ]');
    await page.evaluate(() => { const d = document.getElementById('sm-phone-gaps'); d.scrollIntoView({ block: 'start' }); });
    await page.click('#lang');
    await page.waitForTimeout(300);
    const ko = await page.evaluate(() => ({ cnt: document.getElementById('pg-count').textContent, save: document.querySelector('.pg-save').textContent,
      sum: document.querySelector('#sm-phone-gaps summary').textContent, load: document.getElementById('pg-load').textContent, lang: document.documentElement.lang }));
    check('🌐 한국어로 바꾸면 목록·버튼·제목이 한국어', ko.lang === 'ko' && /명/.test(ko.cnt) && /저장/.test(ko.save) && /번호 없는 학생/.test(ko.sum) && /불러오기/.test(ko.load), ko);
    const kept2 = await page.inputValue('#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="student"]').catch(() => null);
    check('언어를 바꿔도 쓰다 만 번호가 남는다', kept2 === '010-5555-6666', kept2);
    const rowsAfter = await rowsOf(page);
    check('언어를 바꿔도 목록이 지워지지 않는다(그릇에 data-en 을 안 달았다)', rowsAfter.length === 2, rowsAfter);
    await page.click('#lang');
    await page.waitForTimeout(250);
    const en2 = await page.$eval('.pg-save', el => el.textContent);
    check('다시 영어로 바꾸면 영어', /Save/.test(en2), en2);
    check('그동안 화면 오류 0건', errs.length === 0, errs);
    await ctx.close();
  }

  /* ── ⑤ 어두운 화면 — 읽히는가 ── */
  {
    const S = freshServer('hq');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, S, { lang: 'ko', dark: true });
    await boot(page);
    await openViaSide(page);
    await waitFor(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 3);
    console.log('\n[ ⑤ 어두운 화면 — 글자 대비 4.5 이상 ]');
    check('(전제) 어두운 화면이다', await page.evaluate(() => document.documentElement.classList.contains('dark')), null);
    await page.fill('#pg-body div.pg-row[data-uid="test_a"] .pg-in[data-role="parent"]', '010-1234-5678');
    await page.click('#pg-body div.pg-row[data-uid="test_a"] .pg-save');
    await waitFor(page, () => getComputedStyle(document.getElementById('pg-flash')).display !== 'none');
    for (const [sel, name] of [
      ['#pg-flash', '저장 성공 알림'],
      ['#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="parent"]', '입력칸'],
      ['.pgm-note', '안내 상자'],
      ['.pgm-ref', '참고 안내 상자'],
      ['#pg-body div.pg-row[data-uid="test_b"] a', '학생 이름 링크'],
      ['#pg-body div.pg-row[data-uid="test_b"] .pg-save', '저장 버튼'],
      ['#pg-load', '불러오기 버튼'],
    ]) {
      const c = await colorsOf(page, sel);
      const cr = c && c.fg ? contrast(c.fg, c.bg) : 0;
      console.log(`  · ${name} 대비 ${cr.toFixed(2)}`);
      check(`어두운 화면 — ${name} 글자 대비 4.5 이상`, cr >= 4.5, c);
    }
    // 경고(주황) 알림도 — 짧은 번호를 보내지 않을 때가 아니라 «저장은 됐는데 남음» 경고는 서버가 만든다. 여기선 flash(warn) 를 직접 띄워 잰다.
    await page.evaluate(() => {
      const el = document.getElementById('pg-flash');
      el.style.display = ''; el.style.color = '#92400e'; el.style.backgroundColor = 'rgba(245,158,11,0.14)'; el.setAttribute('data-warn', '1');
      el.textContent = '⚠️ test';
    });
    const cw = await colorsOf(page, '#pg-flash');
    const crw = contrast(cw.fg, cw.bg);
    console.log(`  · 경고 알림 대비 ${crw.toFixed(2)}`);
    check('어두운 화면 — 경고 알림 글자 대비 4.5 이상', crw >= 4.5, cw);
    await ctx.close();
  }

  /* ── ⑥ 지사 계정 — 감춘다 ── */
  {
    const S = freshServer('branch');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, S);
    await boot(page);
    console.log('\n[ ⑥ 지사 계정 — 카드·메뉴가 감춰진다 ]');
    const h = await page.evaluate(() => ({
      card: getComputedStyle(document.getElementById('sm-phone-gaps')).display,
      side: getComputedStyle(document.getElementById('sidePhoneGaps')).display,
    }));
    check('지사면 카드·왼쪽 메뉴가 감춰진다(서버 403 짝)', h.card === 'none' && h.side === 'none', h);
    check('지사 화면에서 그 스크립트·목록 요청 0건', S.jsReqs === 0 && S.gets.length === 0, { js: S.jsReqs, gets: S.gets });
    await ctx.close();
  }

  /* ── ⑦ 스크립트를 못 받으면 ── */
  {
    const S = freshServer('hq');
    S.failJs = true;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, S, { lang: 'ko' });
    await boot(page);
    console.log('\n[ ⑦ 못 받으면 말하고, 다시 펼치면 다시 받는다 ]');
    await openViaSide(page);
    const said = await waitFor(page, () => /이 칸을 불러오지 못했습니다/.test(document.getElementById('pg-body').textContent));
    check('못 받으면 그 사실을 말한다', said, await page.textContent('#pg-body'));
    S.failJs = false;
    await page.evaluate(() => { const d = document.getElementById('sm-phone-gaps'); d.open = false; });
    await page.waitForTimeout(150);
    await page.evaluate(() => { const d = document.getElementById('sm-phone-gaps'); d.open = true; });
    const ok7 = await waitFor(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 3);
    check('접었다 다시 펼치면 다시 받아 목록을 그린다', ok7 && S.jsReqs === 2, { rows: await rowsOf(page), js: S.jsReqs });
    await ctx.close();
  }

  /* ── ⑧ 폰 폭 ── */
  {
    const S = freshServer('hq');
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await setup(page, S, { lang: 'ko' });
    await boot(page);
    await page.evaluate(() => { const d = document.getElementById('sm-phone-gaps'); d.open = true; d.scrollIntoView({ block: 'start' }); });
    await waitFor(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 3);
    console.log('\n[ ⑧ 폰 폭 390 — 카드 안·화면 안·눌린다 ]');
    const fit = await page.evaluate(() => {
      const card = document.getElementById('sm-phone-gaps').getBoundingClientRect();
      const out = [];
      for (const tr of document.querySelectorAll('#pg-body div.pg-row[data-uid]')) {
        tr.scrollIntoView({ block: 'center' });
        for (const el of tr.querySelectorAll('.pg-in, .pg-save')) {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          out.push({ l: Math.round(r.left), r: Math.round(r.right), cl: Math.round(card.left), cr: Math.round(card.right), h: Math.round(r.height), top: top === el || el.contains(top) });
        }
      }
      return { out, sw: document.documentElement.scrollWidth, vw: innerWidth };
    });
    const bad = fit.out.filter(o => o.l < o.cl - 1 || o.r > o.cr + 1 || o.r > fit.vw || !o.top);
    check('입력칸·저장 버튼이 전부 카드 안·화면 안이고 맨 위다(눌린다)', fit.out.length === 9 && bad.length === 0, bad.slice(0, 3));
    check('누르기 쉬운 높이(36px 이상)', fit.out.every(o => o.h >= 36), fit.out.map(o => o.h));
    check('페이지가 옆으로 밀리지 않는다', fit.sw <= fit.vw, fit);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
