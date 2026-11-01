// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📵 강사 화면(teacher.html)의 「번호 없는 내 학생」 칸 — 진짜 브라우저 검사 (2026-10-28 신설)

   [왜] 이 화면은 «첫 화면 외부 리소스 0개 · 첫 화면 API 1회» 계약이라 js/adm-phone-gaps.js 를 칸을 «처음 펼칠 때만» 받는다.
        그리고 같은 스크립트가 강사 모드(data-pg-mode="teacher")에서는 «관리자 경로를 한 번도 안 부르고»
        «학생 상세(관리자 화면) 링크를 안 그려야» 한다. 그건 코드를 읽어서는 못 본다.
   [무엇] 진짜 teacher.html + 진짜 js/adm-phone-gaps.js 를 로컬 서버로 띄우고 /api/** 만 가로챈다.
        ① 첫 화면 — 그 스크립트·목록 요청 0건 · 칸이 있다 · 기본 영어
        ② 바로가기 단추로 열면 그때 한 번 받고 «내 수업» 목록을 영어로 · 관리자 링크 없음
        ③ 저장 — 포털 POST(아이디 + 채운 칸만) · 관리자 경로 0건 · 다시 불러 빠진다 · 쓰다 만 번호는 남는다
        ④ 서버 거절(남의 학생) — 서버 문구를 그 화면 언어로 · 목록은 그대로
        ⑤ 🇰🇷 언어를 바꾸면 줄도 한국어 · 쓰다 만 번호는 남는다
        ⑥ 🌙 어두운 화면 — 글자 대비 4.5 이상
        ⑦ 강사 명부와 안 이어진 계정 — «다 못 찾았을 수 있다» 경고
        ⑧ 스크립트를 못 받으면 말하고, 접었다 다시 펼치면 다시 받는다
        ⑨ 폰 폭(390) — 입력칸·저장 버튼이 칸 안·화면 안 · 맨 위다(눌린다)
   ⚠️ manual/ 규약상 게이트가 물어 가지 않는다 — 이 칸·로더·adm-phone-gaps.js 를 건드리면 사람이 직접:
        node test-harness/manual/teacher-phone-gaps-browser.mjs
   ⚠️ 이 화면은 localStorage 캐시(mangoi_teacher_portal_v1)를 먼저 그린다 → 회차마다 비운다.
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
const PORT = Number(process.env.TPG_PORT || 8974);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why).slice(0, 300) : '')); }
};

/* 씨앗 — 공개 저장소라 실제 학생 아이디·번호는 안 쓴다 */
const G = (uid, name, date, time, extra = {}) => Object.assign({ uid, name, classes: 2, next_date: date, next_time: time, status: 'none', short_len: 0, hint_phone: '' }, extra);
function freshServer() {
  return {
    gaps: [
      G('test_a', 'Student A', '2026-10-29', '16:00'),
      G('test_b', 'Student B', '2026-10-29', '17:20'),
      G('test_c', 'Student C', '2026-10-30', '15:00', { status: 'short', short_len: 9 }),
    ],
    unlinked: false, saveReject: null,
    gets: [], saves: [], adminCalls: [], jsReqs: 0, failJs: false,
  };
}
function portalBase() {
  const now = Date.now();
  const kst = new Date(now + 9 * 3600 * 1000);
  const today = kst.toISOString().slice(0, 10);
  return { ok: true, now, today,
    me: { username: 'test_teacher', name: 'Teacher Test', role: 'teacher', is_teacher: true, is_manager: false, lang: 'en' },
    classes: [], upcoming: [], week: { start: today, end: today, days: [{ date: today, dow: kst.getUTCDay(), is_today: true, items: [] }] },
    notices: [], resources: [], rating: null };
}

async function setup(page, S, { dark = false } = {}) {
  await page.addInitScript(([dark]) => {
    try {
      localStorage.clear();
      if (dark) localStorage.setItem('mangoi_teacher_theme', 'dark');
    } catch (e) {}
  }, [dark]);
  const J = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', (route) => {   // 포괄 먼저(나중에 등록한 것이 이긴다)
    const u = route.request().url();
    if (/\/api\/admin\//.test(u)) S.adminCalls.push(route.request().method() + ' ' + new URL(u).pathname);
    return J(route, { ok: true, items: [] });
  });
  await page.route('**/api/teacher/portal**', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const part = u.searchParams.get('part');
    if (part === 'phone_gaps') {
      S.gets.push(u.searchParams.get('days'));
      const days = Number(u.searchParams.get('days')) || 7;
      return J(route, { ok: true, scope: 'teacher', days, from: '2026-10-28', to: '2026-11-03', students: 5, reachable: 5 - S.gaps.length, gaps: S.gaps,
        complete: true, hint_complete: true, sms_mode: 'real', reminder_enabled: true, measured_at: Date.now(),
        identity_unlinked: S.unlinked, identity_ambiguous: false });
    }
    if (part === 'phone_save') {
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      S.saves.push({ method: req.method(), body });
      if (S.saveReject) return J(route, S.saveReject.body, S.saveReject.status);
      S.gaps = S.gaps.filter(g => g.uid !== (body && body.student_uid));
      return J(route, { ok: true, phone_kept: true, roster_updated: null });
    }
    if (part) return J(route, { ok: true, items: [] });
    return J(route, portalBase());
  });
  /* 변이시험용 — 저장소 파일을 고치지 않고 사본을 가리킨다(TPG_SRC_TEACHER · TPG_SRC_JS) */
  await page.route('**/js/adm-phone-gaps.js*', (route) => {
    S.jsReqs++;
    if (S.failJs) return route.abort();
    if (process.env.TPG_SRC_JS) return route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(process.env.TPG_SRC_JS, 'utf8') });
    return route.continue();
  });
  if (process.env.TPG_SRC_TEACHER) {
    await page.route(/\/teacher\.html(\?|$)/, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(process.env.TPG_SRC_TEACHER, 'utf8') }));
  }
}

async function boot(page) {
  await page.goto(BASE + '/teacher.html?_nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(1200);
}
const openViaQbar = (page) => page.evaluate(() => { const b = document.querySelector('button[onclick="openCard(\'sm-phone-gaps\')"]'); b.click(); });
const rowsOf = (page) => page.$$eval('#pg-body div.pg-row[data-uid]', trs => trs.map(t => t.getAttribute('data-uid')));
const waitFor = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
/* 없는 요소에 입력·클릭하면 30초 기다렸다 죽는다 — «깔끔한 FAIL» 로 남기고 계속한다(크래시가 «검출 0» 으로 위장하지 않게) */
const fill = (page, sel, v) => page.fill(sel, v, { timeout: 3000 }).then(() => true, (e) => { check('입력칸을 찾았다 ' + sel, false, String(e && e.message).slice(0, 120)); return false; });
const click = (page, sel) => page.click(sel, { timeout: 3000 }).then(() => true, (e) => { check('누를 곳을 찾았다 ' + sel, false, String(e && e.message).slice(0, 120)); return false; });
const textOf = (page, sel) => page.$eval(sel, el => el.textContent).catch(() => '');
const toggleCard = async (page) => {
  await page.evaluate(() => { document.getElementById('sm-phone-gaps').open = false; });
  await page.waitForTimeout(150);
  await page.evaluate(() => { document.getElementById('sm-phone-gaps').open = true; });
};

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
async function contrastChecks(page, label, list) {
  for (const [sel, name] of list) {
    const c = await colorsOf(page, sel);
    const cr = c && c.fg ? contrast(c.fg, c.bg) : 0;
    console.log(`  · ${label} ${name} 대비 ${cr.toFixed(2)}`);
    check(`${label} — ${name} 글자 대비 4.5 이상`, cr >= 4.5, c);
  }
}

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: PUBLIC, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await chromium.launch();
try {
  /* ── ①~⑤ 강사 · 서버가 정한 언어 = 영어(이 화면 기본) ── */
  {
    const S = freshServer();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e && e.message)));
    await setup(page, S);
    await boot(page);

    // 이 화면은 원래(이 칸과 무관하게) «내 연락처» 칸이 /api/admin/me 를 한 번 부른다 — 그 뒤에 «새로» 생긴 관리자 요청만 센다
    const adminBase = S.adminCalls.length;
    const newAdmin = () => S.adminCalls.slice(adminBase);
    console.log('\n[ ① 첫 화면 — 그 스크립트·목록은 안 받는다 · 칸이 있다 ]');
    check('(전제) 첫 화면의 관리자 요청은 원래 있던 /api/admin/me 뿐', S.adminCalls.every(c => c === 'GET /api/admin/me'), S.adminCalls);
    check('첫 화면에서 adm-phone-gaps.js 요청 0건(계약 1번)', S.jsReqs === 0, S.jsReqs);
    check('첫 화면에서 목록 요청 0건(펼칠 때만)', S.gets.length === 0, S.gets);
    const shown = await page.evaluate(() => {
      const card = document.getElementById('sm-phone-gaps');
      const btn = document.querySelector('button[onclick="openCard(\'sm-phone-gaps\')"]');
      return { card: card ? getComputedStyle(card).display : null, open: card && card.open, btn: btn ? btn.textContent.trim() : null,
        btnShown: btn ? getComputedStyle(btn).display !== 'none' : false, lang: document.documentElement.lang,
        sum: card ? card.querySelector('summary').textContent.trim() : null };
    });
    check('칸과 바로가기 단추가 보인다(닫힌 채로)', shown.card !== 'none' && shown.open === false && shown.btnShown, shown);
    check('(전제) 서버가 영어로 정하면 이 화면은 영어다', shown.lang === 'en' && /No phone/.test(shown.btn) && /My students without a phone/.test(shown.sum), shown);

    console.log('\n[ ② 바로가기로 열면 그때 한 번 받고 «내 수업» 을 영어로 그린다 ]');
    await openViaQbar(page);
    const ok2 = await waitFor(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 3);
    check('열면 목록 3줄이 그려진다', ok2, await rowsOf(page));
    check('그 스크립트는 한 번만 받는다', S.jsReqs === 1, S.jsReqs);
    check('목록은 강사 포털에서 한 번 불러온다(days=7)', S.gets.length === 1 && S.gets[0] === '7', S.gets);
    const en = await page.evaluate(() => ({ cnt: document.getElementById('pg-count').textContent, save: (document.querySelector('.pg-save') || {}).textContent || '',
      body: document.getElementById('pg-body').textContent, links: [...document.querySelectorAll('#pg-body a')].map(a => a.getAttribute('href')) }));
    check('목록이 이 화면 언어(영어)로 그려진다', /students/.test(en.cnt) && /Save/.test(en.save) && !/저장/.test(en.save), en.cnt);
    check('요약이 «내» 수업이라고 말한다', /classes of yours/.test(en.body), en.body.slice(0, 300));
    check('강사 화면에는 학생 상세(관리자 화면) 링크가 없다', !en.links.some(h => /\/admin\//.test(String(h))), en.links);
    check('강사 명부와 이어진 계정이면 «다 못 찾았을 수 있다» 경고가 없다', !/not clearly linked/.test(en.body), null);
    await toggleCard(page);
    await page.waitForTimeout(400);
    check('접었다 펼쳐도 다시 받거나 다시 부르지 않는다', S.jsReqs === 1 && S.gets.length === 1, { js: S.jsReqs, gets: S.gets });
    check('칸을 연 뒤 관리자 경로 요청 0건', newAdmin().length === 0, newAdmin());

    console.log('\n[ ③ 저장 — 포털 POST · 채운 칸만 · 다시 불러 확인 · 쓰다 만 번호는 남는다 ]');
    await fill(page, '#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="student"]', '010-9999-0002');
    await fill(page, '#pg-body div.pg-row[data-uid="test_a"] .pg-in[data-role="parent"]', '010-9999-0001');
    await click(page, '#pg-body div.pg-row[data-uid="test_a"] .pg-save');
    const gone = await waitFor(page, () => !document.querySelector('#pg-body div.pg-row[data-uid="test_a"]'));
    check('저장한 학생은 다시 불러온 목록에서 빠진다', gone, await rowsOf(page));
    check('저장은 포털 POST 로 «아이디 + 채운 칸만»', S.saves.length === 1 && S.saves[0].method === 'POST'
      && JSON.stringify(S.saves[0].body) === JSON.stringify({ student_uid: 'test_a', parent_phone: '010-9999-0001' }), S.saves);
    check('저장 뒤 다시 불러왔다(GET 2번)', S.gets.length === 2, S.gets);
    check('저장해도 관리자 경로(PATCH 등) 요청 0건', newAdmin().length === 0 && !S.adminCalls.some(c => /^PATCH /.test(c)), S.adminCalls);
    const kept = await page.inputValue('#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="student"]').catch(() => null);
    check('다른 줄에 쓰다 만 번호가 다시 그린 뒤에도 남는다', kept === '010-9999-0002', kept);
    const fl = await page.$eval('#pg-flash', el => ({ shown: getComputedStyle(el).display !== 'none', t: el.textContent, warn: el.getAttribute('data-warn') }));
    check('저장 성공 안내가 영어로 보인다(그 아이디와 함께)', fl.shown && fl.t.includes('test_a') && /saved/.test(fl.t) && fl.warn === '0', fl);
    await contrastChecks(page, '밝은 화면', [['#pg-flash', '저장 성공 알림'], ['.pgt-note span', '안내 문구'],
      ['#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="parent"]', '입력칸'], ['#pg-body div.pg-row[data-uid="test_b"] b', '학생 이름']]);

    console.log('\n[ ④ 서버 거절(남의 학생) — 서버 문구를 그 화면 언어로 ]');
    S.saveReject = { status: 403, body: { ok: false, error: 'not_in_your_list', message: '내 수업 학생 중 «번호가 없는» 학생에게만 넣을 수 있습니다.', message_en: 'You can only add a number for your own students who have none.' } };
    await fill(page, '#pg-body div.pg-row[data-uid="test_c"] .pg-in[data-role="parent"]', '010-9999-0003');
    await click(page, '#pg-body div.pg-row[data-uid="test_c"] .pg-save');
    const said = await waitFor(page, () => /your own students/.test(document.getElementById('pg-body').textContent + document.getElementById('pg-flash').textContent));
    check('거절 사유가 영어로 보인다(한국어 문구를 영어 화면에 그리지 않는다)', said, await page.textContent('#pg-body'));
    check('거절 뒤에도 그 줄은 그대로 있다', (await rowsOf(page)).includes('test_c'), await rowsOf(page));
    S.saveReject = null;

    console.log('\n[ ⑤ 언어를 바꾸면 줄도 따라온다 ]');
    await click(page, '#lang');
    await page.waitForTimeout(300);
    const ko = await page.evaluate(() => ({ cnt: document.getElementById('pg-count').textContent, save: (document.querySelector('.pg-save') || {}).textContent || '',
      sum: document.querySelector('#sm-phone-gaps summary').textContent, load: document.getElementById('pg-load').textContent, lang: document.documentElement.lang,
      body: document.getElementById('pg-body').textContent }));
    check('🌐 한국어로 바꾸면 목록·버튼·제목이 한국어', ko.lang === 'ko' && /명/.test(ko.cnt) && /저장/.test(ko.save) && /번호 없는 내 학생/.test(ko.sum) && /불러오기/.test(ko.load), ko);
    check('한국어 요약도 «내» 수업이라고 말한다', /«내» 수업/.test(ko.body), ko.body.slice(0, 200));
    const kept2 = await page.inputValue('#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="student"]').catch(() => null);
    check('언어를 바꿔도 쓰다 만 번호가 남는다', kept2 === '010-9999-0002', kept2);
    check('언어를 바꿔도 목록이 지워지지 않는다(그릇에 data-en 을 안 달았다)', (await rowsOf(page)).length === 2, await rowsOf(page));
    await click(page, '#lang');
    await page.waitForTimeout(250);
    check('다시 영어로 바꾸면 영어', /Save/.test(await textOf(page, '.pg-save')), null);
    check('그동안 화면 오류 0건', errs.length === 0, errs);
    await ctx.close();
  }

  /* ── ⑥ 어두운 화면 ── */
  {
    const S = freshServer();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, S, { dark: true });
    await boot(page);
    await openViaQbar(page);
    await waitFor(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 3);
    console.log('\n[ ⑥ 어두운 화면 — 글자 대비 4.5 이상 ]');
    check('(전제) 어두운 화면이다', await page.evaluate(() => document.documentElement.getAttribute('data-t') === 'dark'), null);
    await fill(page, '#pg-body div.pg-row[data-uid="test_a"] .pg-in[data-role="parent"]', '010-9999-0001');
    await click(page, '#pg-body div.pg-row[data-uid="test_a"] .pg-save');
    await waitFor(page, () => getComputedStyle(document.getElementById('pg-flash')).display !== 'none');
    await contrastChecks(page, '어두운 화면', [['#pg-flash', '저장 성공 알림'], ['.pgt-note span', '안내 문구'],
      ['#pg-body div.pg-row[data-uid="test_b"] .pg-in[data-role="parent"]', '입력칸'], ['#pg-body div.pg-row[data-uid="test_b"] b', '학생 이름'],
      ['#pg-body div.pg-row[data-uid="test_b"] .pg-save', '저장 버튼'], ['#pg-load', '불러오기 버튼'], ['#pg-count', '건수']]);
    await page.evaluate(() => { const el = document.getElementById('pg-flash'); el.style.display = ''; el.setAttribute('data-warn', '1'); el.textContent = '⚠️ test'; });
    await contrastChecks(page, '어두운 화면', [['#pg-flash', '경고 알림']]);
    await ctx.close();
  }

  /* ── ⑦ 강사 명부와 안 이어진 계정 ── */
  {
    const S = freshServer();
    S.unlinked = true; S.gaps = [];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, S);
    await boot(page);
    await openViaQbar(page);
    const ok7 = await waitFor(page, () => /not clearly linked/.test(document.getElementById('pg-body').textContent));
    console.log('\n[ ⑦ 강사 명부와 안 이어진 계정 — 0명이 «다 됐다» 가 아니다 ]');
    check('«다 못 찾았을 수 있다 — 본사에 알려 주세요» 경고가 보인다', ok7, await page.textContent('#pg-body'));
    await ctx.close();
  }

  /* ── ⑧ 스크립트를 못 받으면 ── */
  {
    const S = freshServer();
    S.failJs = true;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, S);
    await boot(page);
    console.log('\n[ ⑧ 못 받으면 말하고, 다시 펼치면 다시 받는다 ]');
    await openViaQbar(page);
    const said = await waitFor(page, () => /Could not load this panel/.test(document.getElementById('pg-body').textContent));
    check('못 받으면 그 사실을 영어로 말한다', said, await page.textContent('#pg-body'));
    S.failJs = false;
    await toggleCard(page);
    const ok8 = await waitFor(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 3);
    check('접었다 다시 펼치면 다시 받아 목록을 그린다', ok8 && S.jsReqs === 2, { rows: await rowsOf(page), js: S.jsReqs });
    await ctx.close();
  }

  /* ── ⑨ 폰 폭 ── */
  {
    const S = freshServer();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await setup(page, S);
    await boot(page);
    await openViaQbar(page);
    await waitFor(page, () => document.querySelectorAll('#pg-body div.pg-row[data-uid]').length === 3);
    console.log('\n[ ⑨ 폰 폭 390 — 칸 안·화면 안·눌린다 ]');
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
    check('입력칸·저장 버튼이 전부 칸 안·화면 안이고 맨 위다(눌린다)', fit.out.length === 9 && bad.length === 0, bad.slice(0, 3));
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
