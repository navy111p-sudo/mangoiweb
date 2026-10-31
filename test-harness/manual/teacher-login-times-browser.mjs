// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🔐 강사 로그인 시각 — 진짜 브라우저 검사 (2026-10-30 신설, 매니저 제안 «add teacher's log in time»)

   [무엇] 진짜 manager.html · teacher.html 을 로컬 서버로 띄우고 /api/** 만 가로챈다.
     매니저 화면 «🔐 강사 로그인 시각»
       ① 본사면 카드·메뉴가 보이고, 첫 화면에는 목록 요청 0건(펼칠 때만)
       ② 메뉴로 열면 ?scope=teachers&date=(오늘 KST) 한 번 · 표가 영어로(이 화면 기본)
       ③ 날짜를 바꾸면 그 날짜로 다시 받는다
       ④ 🇰🇷 언어를 바꾸면 표 머리·문구가 한국어 · 줄은 그대로(지워지지 않음)
       ⑤ 🌙 어두운 화면 — 표 글자·보조 글자·경고 줄 대비 4.5 이상
       ⑥ 폰 폭(390) — 페이지가 옆으로 안 밀린다 · 강사 이름이 한 줄
       ⑦ 서버가 403 이면 «이 계정 권한으로는 볼 수 없다» 고 말한다(빈 표로 위장 안 함)
       ⑧ 지사 계정 — 카드·메뉴가 숨고 목록 요청 0건
     강사 화면 «내 로그인·접속 시각»
       ⑨ 첫 화면 요청 0건 → 펼치면 ?part=my_login 한 번 · 14일 표 · 오늘 줄
       ⑩ 🌙 어두운 화면 대비 · 폰 폭에서 페이지가 안 밀림
   ⚠️ manual/ 규약상 게이트가 물어 가지 않는다 — 이 카드들을 건드리면 사람이 직접:
        node test-harness/manual/teacher-login-times-browser.mjs
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
const PORT = Number(process.env.TLB_PORT || 8975);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why !== undefined ? ' — ' + JSON.stringify(why).slice(0, 300) : '')); }
};
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const at = (ymd, hm) => Date.parse(`${ymd}T${hm}:00+09:00`);

/* 씨앗 — 공개 저장소라 실제 계정은 안 쓴다 */
function listBody(date, extra = {}) {
  return Object.assign({ ok: true, date, is_today: date === kstToday(), now: Date.now(), first_seen_since: null, partial: [],
    counts: { total: 4, active: 3, online: 1 },
    items: [
      { username: 'test_t1', display_name: 'Teacher Alpha Longname', state: 'login', first_active_at: at(date, '08:50'), first_login_at: at(date, '08:50'), last_login_at: at(date, '13:10'), login_count: 2, failed_count: 1, last_active_at: Date.now() - 30000, online: true, carried_at: null, last_login_before: null },
      { username: 'test_t2', display_name: 'Teacher Beta', state: 'active', first_active_at: at(date, '09:05'), first_login_at: null, last_login_at: null, login_count: 0, failed_count: 0, last_active_at: at(date, '11:00'), online: false, carried_at: null, last_login_before: at('2026-10-22', '19:22') },
      { username: 'test_t3', display_name: 'Teacher Gamma', state: 'carried', first_active_at: null, first_login_at: null, last_login_at: null, login_count: 0, failed_count: 0, last_active_at: at(date, '00:30'), online: false, carried_at: at(date, '00:02'), last_login_before: null },
      { username: 'test_t4', display_name: 'Teacher Delta', state: 'none', first_active_at: null, first_login_at: null, last_login_at: null, login_count: 0, failed_count: 0, last_active_at: null, online: false, carried_at: null, last_login_before: null },
    ] }, extra);
}

async function setupManager(page, S, { lang = null, dark = false } = {}) {
  await page.addInitScript(([lang, dark]) => {
    try {
      localStorage.clear();
      if (lang) localStorage.setItem('mangoi_lang', lang);
      if (dark) localStorage.setItem('mangoi_manager_theme', 'dark');
      localStorage.setItem('mangoi_admin_session', JSON.stringify({ username: 'mgr_test', role: 'hq_mgr' }));
    } catch (e) {}
  }, [lang, dark]);
  const J = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', (route) => J(route, { ok: true }));   // 포괄 먼저(나중에 등록한 것이 이긴다)
  await page.route('**/api/admin/exec/summary**', (route) => J(route, { ok: true, scope: { type: S.scope, label: S.scope === 'hq' ? '본사' : '부산' }, this_month: { period: '2026-10' }, students: {} }));
  await page.route('**/api/admin/me**', (route) => J(route, { ok: true, username: 'mgr_test', role: S.scope === 'hq' ? 'hq' : 'branch', scope: { type: S.scope } }));
  await page.route('**/api/admin/login-history**', (route) => {
    const u = new URL(route.request().url());
    S.list.push({ scope: u.searchParams.get('scope'), date: u.searchParams.get('date') });
    if (S.status403) return J(route, { ok: false, error: 'forbidden_scope' }, 403);
    return J(route, listBody(u.searchParams.get('date') || kstToday(), S.extra || {}));
  });
  if (process.env.TLB_SRC_MANAGER) {
    await page.route(/\/manager\.html(\?|$)/, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(process.env.TLB_SRC_MANAGER, 'utf8') }));
  }
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
function myLoginBody() {
  const days = [];
  const t0 = Date.parse(kstToday() + 'T00:00:00+09:00');
  for (let d = 0; d < 14; d++) {
    const ds = t0 - d * 86400000; const ymd = new Date(ds + 9 * 3600000).toISOString().slice(0, 10);
    days.push(d === 0
      ? { date: ymd, state: 'login', first_login_at: ds + 8 * 3600000 + 50 * 60000, last_login_at: ds + 8 * 3600000 + 50 * 60000, login_count: 1, failed_count: 2, first_active_at: ds + 8 * 3600000 + 50 * 60000, carried_at: null, last_active_at: Date.now() - 20000, online: true }
      : d === 1 ? { date: ymd, state: 'carried', first_login_at: null, last_login_at: null, login_count: 0, failed_count: 0, first_active_at: null, carried_at: ds + 3 * 60000, last_active_at: ds + 30 * 60000, online: false }
      : { date: ymd, state: 'none', first_login_at: null, last_login_at: null, login_count: 0, failed_count: 0, first_active_at: null, carried_at: null, last_active_at: null, online: false });
  }
  return { ok: true, username: 'test_teacher', now: Date.now(), days, partial: [], first_seen_since: null };
}
async function setupTeacher(page, S, { dark = false } = {}) {
  await page.addInitScript(([dark]) => {
    try { localStorage.clear(); if (dark) localStorage.setItem('mangoi_teacher_theme', 'dark'); } catch (e) {}
  }, [dark]);
  const J = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', (route) => J(route, { ok: true, items: [] }));
  await page.route('**/api/teacher/portal**', (route) => {
    const u = new URL(route.request().url());
    const part = u.searchParams.get('part');
    if (part === 'my_login') { S.my.push(u.search); return J(route, myLoginBody()); }
    if (part) return J(route, { ok: true, items: [] });
    return J(route, portalBase());
  });
  if (process.env.TLB_SRC_TEACHER) {
    await page.route(/\/teacher\.html(\?|$)/, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(process.env.TLB_SRC_TEACHER, 'utf8') }));
  }
}
const waitFor = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

function lum([r, g, b]) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/* 글자색·합성 배경(반투명 층은 아래에서 위로 합성) — opacity 도 곱한다 */
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
async function cr(page, sel) {
  const c = await colorsOf(page, sel);
  return c && c.fg ? Math.round(contrast(c.fg, c.bg) * 100) / 100 : 0;
}

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: PUBLIC, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await chromium.launch();
try {
  /* ── 매니저 — 본사·밝게·영어 ── */
  {
    console.log('\n── 매니저 화면 · 본사');
    const S = { scope: 'hq', list: [] };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e && e.message)));
    await setupManager(page, S);
    await page.goto(BASE + '/manager.html?_nc=' + Date.now(), { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const vis = await page.evaluate(() => ({ card: !document.getElementById('c-logins').hidden, side: !document.getElementById('sideLogins').hidden }));
    check('① 본사 — 카드·메뉴가 보인다', vis.card && vis.side, vis);
    check('① 첫 화면에는 목록 요청 0건(펼칠 때만)', S.list.length === 0, S.list);
    await page.evaluate(() => window.sideGo('c-logins'));
    const drew = await waitFor(page, () => document.querySelectorAll('#tlBody table.tl-tbl tbody tr').length >= 3);
    check('② 메뉴로 열면 표가 그려진다', drew);
    check('② 요청은 ?scope=teachers&date=오늘(KST) 한 번', S.list.length === 1 && S.list[0].scope === 'teachers' && S.list[0].date === kstToday(), S.list);
    const txt = await page.$eval('#tlBody', el => el.innerText);
    check('② 영어로(이 화면 기본) — 머리·접속 중·필리핀 시간', /Teacher/.test(txt) && /First on/.test(txt) && /Online now/.test(txt) && /\(PH 07:50\)/.test(txt), txt.slice(0, 300));
    check('② 기록 없는 강사는 접힌 칸 안(처음엔 안 보임)', await page.evaluate(() => { const d = document.querySelector('#tlBody details.tl-more'); return !!d && !d.open && d.innerText.includes('No record this day'); }));
    check('② 숫자 줄', /3 \/ 4/.test(await page.$eval('#tlCount', el => el.textContent)));
    // ③ 날짜 바꾸기
    await page.fill('#tlDate', '2026-10-20');
    await page.dispatchEvent('#tlDate', 'change');
    await waitFor(page, (n) => true, null, 300);
    await page.waitForTimeout(400);
    check('③ 날짜를 바꾸면 그 날짜로 다시 받는다', S.list.some(x => x.date === '2026-10-20'), S.list);
    // ④ 언어 전환
    await page.evaluate(() => window.toggleLang());
    await page.waitForTimeout(300);
    const ko = await page.$eval('#tlBody', el => el.innerText);
    check('④ 🇰🇷 언어를 바꾸면 표도 한국어 · 줄은 그대로', /첫 접속/.test(ko) && /강사/.test(ko) && (await page.$$('#tlBody table.tl-tbl tbody tr')).length >= 3, ko.slice(0, 200));
    check('④ 페이지 오류 0', errs.length === 0, errs);
    await ctx.close();
  }
  /* ── 매니저 — 어둡게 ── */
  {
    console.log('\n── 매니저 화면 · 어두운 화면');
    const S = { scope: 'hq', list: [], extra: { partial: ['logins'] } };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setupManager(page, S, { dark: true });
    await page.goto(BASE + '/manager.html?_nc=' + Date.now(), { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.sideGo('c-logins'));
    await waitFor(page, () => document.querySelectorAll('#tlBody table.tl-tbl tbody tr').length >= 3);
    const cTd = await cr(page, '#tlBody table.tl-tbl tbody tr td b');
    const cSub = await cr(page, '#tlBody table.tl-tbl tbody tr td .tl-sub');
    const cOn = await cr(page, '#tlBody .tl-on');
    const cBad = await cr(page, '#tlBody .tl-bad');
    const cWarn = await cr(page, '#tlBody .tl-warn');
    const cTh = await cr(page, '#tlBody table.tl-tbl th');
    check('⑤ 🌙 표 글자·보조·접속 중·실패·경고·머리 대비 4.5 이상', [cTd, cSub, cOn, cBad, cWarn, cTh].every(v => v >= 4.5), { cTd, cSub, cOn, cBad, cWarn, cTh });
    await ctx.close();
  }
  /* ── 매니저 — 밝게 대비 + 폰 폭 ── */
  {
    console.log('\n── 매니저 화면 · 밝은 화면 대비 · 폰 폭');
    const S = { scope: 'hq', list: [], extra: { partial: ['logins'] } };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await setupManager(page, S);
    await page.goto(BASE + '/manager.html?_nc=' + Date.now(), { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.sideGo('c-logins'));
    await waitFor(page, () => document.querySelectorAll('#tlBody table.tl-tbl tbody tr').length >= 3);
    const cs = await Promise.all(['#tlBody table.tl-tbl tbody tr td b', '#tlBody table.tl-tbl tbody tr td .tl-sub', '#tlBody .tl-on', '#tlBody .tl-bad', '#tlBody .tl-warn', '#tlBody table.tl-tbl th'].map(s => cr(page, s)));
    check('⑤ ☀️ 표 글자·보조·접속 중·실패·경고·머리 대비 4.5 이상', cs.every(v => v >= 4.5), cs);
    const g = await page.evaluate(() => {
      const b = document.querySelector('#tlBody table.tl-tbl tbody tr td b');
      const lh = parseFloat(getComputedStyle(b).lineHeight) || 20;
      const wrap = document.querySelector('#tlBody .tl-wrap');
      return { pageOver: document.documentElement.scrollWidth > window.innerWidth + 1, lines: Math.round(b.getBoundingClientRect().height / lh), wrapScroll: wrap.scrollWidth > wrap.clientWidth };
    });
    check('⑥ 폰 폭 — 페이지가 옆으로 안 밀린다(표는 자기 상자 안에서만 민다)', !g.pageOver, g);
    check('⑥ 폰 폭 — 긴 강사 이름도 한 줄(낱글자로 쪼개지지 않음)', g.lines <= 1, g);
    await ctx.close();
  }
  /* ── 매니저 — 403 · 지사 ── */
  {
    console.log('\n── 매니저 화면 · 403 · 지사 계정');
    const S = { scope: 'hq', list: [], status403: true };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setupManager(page, S);
    await page.goto(BASE + '/manager.html?_nc=' + Date.now(), { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.sideGo('c-logins'));
    const said = await waitFor(page, () => /cannot view|볼 수 없는/.test(document.getElementById('tlBody').textContent));
    check('⑦ 서버 403 → «이 계정 권한으로는 볼 수 없다» (빈 표로 위장 안 함)', said && !(await page.$('#tlBody table')));
    await ctx.close();
    const S2 = { scope: 'branch', list: [] };
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await ctx2.newPage();
    await setupManager(p2, S2);
    await p2.goto(BASE + '/manager.html?_nc=' + Date.now(), { waitUntil: 'load' });
    await p2.waitForTimeout(1500);
    const hid = await p2.evaluate(() => ({ card: document.getElementById('c-logins').hidden, side: document.getElementById('sideLogins').hidden }));
    check('⑧ 지사 계정 — 카드·메뉴가 숨는다', hid.card && hid.side, hid);
    check('⑧ 지사 계정 — 목록 요청 0건', S2.list.length === 0, S2.list);
    await ctx2.close();
  }
  /* ── 강사 화면 ── */
  for (const [dark, w] of [[false, 1280], [true, 390]]) {
    console.log(`\n── 강사 화면 · ${dark ? '어두운' : '밝은'} 화면 · 폭 ${w}`);
    const S = { my: [] };
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e && e.message)));
    await setupTeacher(page, S, { dark });
    await page.goto(BASE + '/teacher.html?_nc=' + Date.now(), { waitUntil: 'load' });
    await page.waitForTimeout(1300);
    check('⑨ 첫 화면에는 내 로그인 요청 0건', S.my.length === 0, S.my);
    check('⑨ 카드가 있다', !!(await page.$('#c-mylogin')));
    await page.evaluate(() => { const d = document.getElementById('c-mylogin'); d.open = true; });
    const drew = await waitFor(page, () => document.querySelectorAll('#myloginBody table.ml-tbl tbody tr').length === 14);
    check('⑨ 펼치면 ?part=my_login 한 번 · 14일 표', drew && S.my.length === 1, S.my);
    const t = await page.$eval('#myloginBody', el => el.innerText);
    check('⑨ 오늘 줄 — 로그인 시각·필리핀 시간·접속 중·실패 · 어제 자정 넘어 접속', /\(PH 07:50\)/.test(t) && /Now|지금 접속 중/.test(t) && /2 failed|실패 2회/.test(t) && /On since midnight|자정 넘어/.test(t), t.slice(0, 300));
    const cs = await Promise.all(['#myloginBody table.ml-tbl tbody tr td b', '#myloginBody table.ml-tbl tr.ml-today td', '#myloginBody .ml-on', '#myloginBody .ml-bad', '#myloginBody .ml-sub', '#myloginBody table.ml-tbl th'].map(s => cr(page, s)));
    check(`⑩ ${dark ? '🌙' : '☀️'} 글자 대비 4.5 이상(오늘 줄·접속 중·실패·보조·머리)`, cs.every(v => v >= 4.5), cs);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`⑩ 폭 ${w} — 페이지가 옆으로 안 밀린다`, !over);
    check('⑩ 페이지 오류 0', errs.length === 0, errs);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
