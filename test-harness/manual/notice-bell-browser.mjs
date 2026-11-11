// 🔔 알림 종 — 실제 브라우저 검사 (사람이 부릅니다 · 자동 게이트 아님)
//   NODE_PATH=/opt/node22/lib/node_modules node test-harness/manual/notice-bell-browser.mjs
//   · public/ 을 로컬 서버로 띄우고 /api/admin/no-shows/inbox 만 가짜로 답한다(운영 D1 무접촉).
//   · admin.html·manager.html 에서 종이 뜨고 → 펼치고 → 확인을 누르면 «확인됨 · Mai» 가 되는지,
//     403(지사·대리점)이면 manager.html 이 파일조차 안 받는지 본다.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { requireBrowser } from './_pw.mjs';
import { ROOT } from '../helpers/handover-env.mjs';

const { chromium, exe } = requireBrowser();
const PUB = join(ROOT, 'cloudflare-deploy/public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, s) => {
  const p = join(PUB, decodeURIComponent(q.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isFile()) { s.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); s.end(readFileSync(p)); }
  else { s.writeHead(404); s.end(); }
}).listen(0);
const BASE = `http://127.0.0.1:${srv.address().port}`;

let PASS = 0, FAIL = 0;
const check = (n, c) => { c ? PASS++ : FAIL++; console.log(`  ${c ? '✅' : '❌'} ${n}`); };
const NOW = Date.parse('2026-11-09T11:00:00Z');
const fixture = () => ({ ok: true, unread: 2, items: [
  { id: 'class-1-20261109', at: NOW - 3600000, teacher: 'Teacher Hannah', student: '허은서', start: '19:00', unreached: true, acked_by: null,
    ko: 'Teacher Hannah 강사가 19:00(허은서) 수업에 입장하지 않았습니다.', en: 'Teacher Hannah did not join the 19:00 class (허은서).' },
  { id: 'class-55-20261109', at: NOW - 7200000, teacher: 'Teacher Win', student: '김은하', start: '17:30', unreached: false, acked_by: null,
    ko: 'Teacher Win 강사가 17:30(김은하) 수업에 입장하지 않았습니다.', en: 'Teacher Win did not join the 17:30 class (김은하).' },
] });

async function page(browser, path, { status = 200, lang = 'en' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((l) => { try { localStorage.setItem('mangoi_lang', l); } catch (e) {} }, lang);
  const pg = await ctx.newPage();
  const seen = { posts: [], bellJs: 0 };
  await pg.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/admin/no-shows/inbox') {
      if (route.request().method() === 'POST') {
        seen.posts.push(JSON.parse(route.request().postData() || '{}'));
        return route.fulfill({ json: { ok: true, ack: { room_id: 'class-1-20261109', acked_by: 'Mai', acked_at: NOW } } });
      }
      return status === 200 ? route.fulfill({ json: fixture() }) : route.fulfill({ status, json: { ok: false, error: 'forbidden_scope' } });
    }
    if (u.pathname === '/js/notice-bell.js') seen.bellJs++;
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, json: { ok: false } });
    if (u.origin !== BASE) return route.abort();
    return route.continue();
  });
  await pg.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  return { ctx, pg, seen };
}

const browser = await chromium.launch({ executablePath: exe });
try {
  for (const path of ['/manager.html', '/admin.html']) {
    console.log(`\n${path} — 본사(200)`);
    const { ctx, pg, seen } = await page(browser, path);
    const bell = pg.locator('#notice-bell');
    await bell.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    check('종이 붙는다', await bell.count() === 1);
    const badge = () => pg.evaluate(() => { const b = document.querySelector('#notice-bell').shadowRoot.querySelector('.badge'); return b.hidden ? '' : b.textContent; });
    check('빨간 숫자 = 미확인 2', await badge() === '2');
    const topHit = await pg.evaluate(() => { const r = document.querySelector('#notice-bell').shadowRoot.querySelector('.bell').getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id; });
    check('종이 다른 것에 덮이지 않는다(맨 위)', topHit === 'notice-bell');
    await pg.evaluate(() => document.querySelector('#notice-bell').shadowRoot.querySelector('.bell').click());
    await pg.waitForTimeout(300);
    const txt = await pg.evaluate(() => document.querySelector('#notice-bell').shadowRoot.querySelector('.panel').innerText);
    check('펼치면 두 줄 + LMS 모양 머리글', /MESSAGES \(2\)/.test(txt) && /Teacher Hannah did not join the 19:00 class/.test(txt) && /Teacher Win/.test(txt));
    check('안 닿은 건은 «직접 연락» 줄', /did not reach the teacher/.test(txt));
    await pg.screenshot({ path: `/tmp/claude-0/-home-user/cc69a52b-27af-589c-b5ef-e40ec1ac26cc/scratchpad/bell${path.replace(/\W/g, '_')}.png` });
    await pg.evaluate(() => document.querySelector('#notice-bell').shadowRoot.querySelector('.foot button').click());
    await pg.waitForTimeout(300);
    const txt2 = await pg.evaluate(() => document.querySelector('#notice-bell').shadowRoot.querySelector('.panel').innerText);
    check('확인을 누르면 그 방 id 로 POST', seen.posts.length === 1 && seen.posts[0].id === 'class-1-20261109');
    check('«Confirmed · Mai» 로 바뀌고 숫자가 1로 준다', /Confirmed · Mai/.test(txt2) && await badge() === '1');
    await pg.keyboard.press('Escape');
    check('Esc 로 닫힌다', await pg.evaluate(() => document.querySelector('#notice-bell').shadowRoot.querySelector('.panel').hidden));
    if (path === '/manager.html') check('manager: 종 파일은 한 번만 받는다', seen.bellJs === 1);
    await ctx.close();
  }
  console.log('\n/manager.html — 지사·대리점(403)');
  {
    const { ctx, pg, seen } = await page(browser, '/manager.html', { status: 403 });
    await pg.waitForTimeout(2500);
    check('종 파일을 받지 않는다', seen.bellJs === 0);
    check('종이 없다', await pg.locator('#notice-bell').count() === 0);
    await ctx.close();
  }
  console.log('\n/admin.html — 강사(403)');
  {
    const { ctx, pg } = await page(browser, '/admin.html', { status: 403 });
    await pg.waitForTimeout(3000);
    check('종이 없다(403 이면 멈춤)', await pg.locator('#notice-bell').count() === 0);
    await ctx.close();
  }
  console.log('\n/manager.html — 한국어');
  {
    const { ctx, pg } = await page(browser, '/manager.html', { lang: 'ko' });
    await pg.locator('#notice-bell').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    await pg.evaluate(() => document.querySelector('#notice-bell').shadowRoot.querySelector('.bell').click());
    await pg.waitForTimeout(300);
    const txt = await pg.evaluate(() => document.querySelector('#notice-bell').shadowRoot.querySelector('.panel').innerText);
    check('한국어 문장 + «확인» 버튼', /Teacher Hannah 강사가 19:00\(허은서\) 수업에 입장하지 않았습니다/.test(txt) && /확인/.test(txt));
    await pg.screenshot({ path: '/tmp/claude-0/-home-user/cc69a52b-27af-589c-b5ef-e40ec1ac26cc/scratchpad/bell_manager_ko.png' });
    await ctx.close();
  }
  console.log('\n휴대폰 폭(390) — 판이 화면 밖으로 안 나간다');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const pg = await ctx.newPage();
    await pg.route('**/*', (route) => { const u = new URL(route.request().url());
      if (u.pathname === '/api/admin/no-shows/inbox') return route.fulfill({ json: fixture() });
      if (u.pathname.startsWith('/api/')) return route.fulfill({ json: { ok: false } });
      return u.origin === BASE ? route.continue() : route.abort(); });
    await pg.goto(BASE + '/manager.html', { waitUntil: 'domcontentloaded' });
    await pg.locator('#notice-bell').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    await pg.evaluate(() => document.querySelector('#notice-bell').shadowRoot.querySelector('.bell').click());
    await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => { const b = document.querySelector('#notice-bell').shadowRoot.querySelector('.panel').getBoundingClientRect(); return [b.left, b.right]; });
    check('판 왼쪽·오른쪽이 화면 안', r[0] >= 0 && r[1] <= 390);
    await pg.screenshot({ path: '/tmp/claude-0/-home-user/cc69a52b-27af-589c-b5ef-e40ec1ac26cc/scratchpad/bell_mobile.png' });
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
console.log(`\n결과: PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) process.exit(1);
