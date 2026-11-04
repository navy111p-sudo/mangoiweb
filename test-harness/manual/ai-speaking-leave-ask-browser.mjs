// AI 말하기 6차(2026-11-04 사장님 «확인 안 누르고 나가면 물어보게 해줘») — 진짜 크로미움으로 «묻는 창» 을 잽니다.
// 자동으로 안 돕니다(manual/). 부르는 법:  node test-harness/manual/ai-speaking-leave-ask-browser.mjs
//   (PW_DIR 을 주면 그 playwright 를, 없으면 전역 playwright 를 씁니다)
// 잰 것: 창이 실제로 맨 위인가(elementFromPoint) · 화면 밖으로 안 넘치는가 · 세 갈래가 하는 일 · 키보드(Esc·Tab) ·
//        뒤로가기·새로고침 때 브라우저 기본 창(beforeunload)이 «바꾼 것이 있을 때만» 뜨는가 · «적용 안 하고 이동» 뒤 두 번 안 묻는가 · 글자 대비.
// 짝: «묻는다» 옆에 «안 묻는다»(안 바꿈 · 되돌림 · 확인 뒤)를 같은 크기·언어에서 함께 봅니다.
// 변이시험(2026-11-04): 안 묻기 · 늘 묻기 · leaving 표시 제거 · beforeunload 제거 · 창 z-index 0 · 창 높이 상한 제거 · 스크롤하는 포커스(제목 잘림) ·
//   Tab 가두기 제거 · keydown 을 창에만 · storage 리스너 제거 · 글자 대비 낮추기 → 실제 FAIL. 등가라 못 잡는 것: «만진 칸 무시»·«쓰기 전 다시 읽기 제거»
//   (진짜 브라우저는 storage 이벤트가 먼저 맞춤 — 이벤트를 놓친 경우는 자동 하니스 G12) · «낮은 화면 조이기»(없어도 창 안 스크롤로 기준 통과).
// ▶ 7차(같은 날 사장님 «버튼 누르면 교재로 연습 안에서도 똑같이 자동으로»): 연습 시작 링크(교재·상황·AI 친구 — data-start)는 이제 묻지 않고
//    저장 후 간다. 그래서 «묻는 창» 은 홈(a.home) 링크로 잽니다(②③④⑤). 시작 링크는 ⑤-2·⑦·⑨ 가 «안 묻고 저장» 을 봅니다.
//    연습 화면이 실제로 그 교정 정도를 그리는지는 manual/ai-speaking-start-apply-browser.mjs.
// ⚠️ 정정(같은 날 함정 대조): 처음엔 «크로미움은 inert 만으로 Tab 을 가둔다» 고 적었는데 틀렸습니다 — Tab 을 4번 누른 «뒤에만» 재서
//    (버튼 3개 + 창 밖 1칸 = 한 바퀴) 우연히 통과한 것이었습니다. 이제 Tab·Shift+Tab 을 «한 번씩» 눌러 매 칸이 창 안인지 잽니다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = process.env.PW_DIR ? require(process.env.PW_DIR + '/node_modules/playwright') : require('playwright');
const root = path.resolve('cloudflare-deploy/public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":false}'); return; }
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  // 홈·연습 화면은 무거우니 «도착했다» 만 알면 된다 — 빈 페이지로 대신한다
  if (/\/(index|warmup|ai-friend)\.html$/.test(file)) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>stub</title><p>' + path.basename(file)); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
let n = 0; const fails = [];
const ok = (v, m) => { n++; if (!v) { fails.push(m); console.log('✗ ' + m); } };
const SAVED = { mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' };
async function open({ width, height, lang = 'ko', seed = SAVED }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route('**/*', r => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  await ctx.addInitScript(({ lang, seed }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear(); localStorage.setItem('mangoi_lang', lang);
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, { lang, seed });
  const page = await ctx.newPage(); page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
  await page.goto(origin + '/ai-speaking.html');
  return { ctx, page, errors, dialogs };
}
const ls = (page, k) => page.evaluate(k => localStorage.getItem(k), k);
// 창의 각 버튼 가운데가 «그 버튼» 인가 + 창 상자가 화면 안인가
// ⚠️ 뒤 화면(.wrap)은 inert 라 elementFromPoint 가 «건너뜁니다» — 그대로 재면 창이 뒤에 깔려도 통과한다.
//    그래서 잴 때만 inert 를 잠깐 걷고 «그려진 순서» 로 묻습니다.
const hit = page => page.evaluate(() => {
  const w = document.querySelector('.wrap'), had = w.hasAttribute('inert'); w.removeAttribute('inert');
  const box = document.querySelector('.leave-box').getBoundingClientRect();
  const btns = ['leaveGo', 'leaveSkip', 'leaveStay'].map(id => document.getElementById(id)).filter(b => !b.hidden);
  // 제목·첫 버튼은 «열린 그대로» 먼저 잰다(아래 버튼 검사가 창 안을 스크롤하기 전에).
  // 제목: 상자만 재면 568×320 에서 h2 가 위로 잘려도 통과했다(함정 대조 실측).
  const t = document.getElementById('leaveTitle').getBoundingClientRect(), g = document.getElementById('leaveGo').getBoundingClientRect();
  const title = t.top >= box.top - 0.5 && t.top >= 0 && t.bottom <= innerHeight, goVisible = g.top >= 0 && g.bottom <= innerHeight;
  const out = {
    inside: box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight + 1 && box.right <= innerWidth + 1,
    title, goVisible,
    noScroll: document.documentElement.scrollWidth <= innerWidth + 1,
    tall: btns.every(b => b.getBoundingClientRect().height >= 44),
    // 낮은 화면에서는 창 «안» 이 스크롤된다 — 버튼마다 창 안에서 보이게 한 뒤 재고, 끝나면 맨 위로 되돌린다
    top: btns.every(b => { b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); }),
    inertWas: had,
  };
  document.querySelector('.leave-box').scrollTop = 0;
  if (had) w.setAttribute('inert', '');
  return out;
});
const shown = page => page.evaluate(() => !document.getElementById('leaveAsk').hidden && getComputedStyle(document.getElementById('leaveAsk')).display !== 'none');
const pickChange = async page => { await page.selectOption('#setLevel', '3'); await page.click('[data-corr="focused"]'); };
const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

try {
  // 667×260·568×220 = 가로 폰에서 주소창·툴바가 차지하고 남은 «보이는 높이» — 창 안이 스크롤되는 경우
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [640, 360], [568, 320], [667, 260], [568, 220], [768, 1024], [1366, 768], [1920, 1080]]) {
    for (const lang of ['ko', 'en']) {
      const tag = `${width}x${height}/${lang}`;
      try {
      // ① 안 바꿈 -> 안 묻는다(짝)
      let s = await open({ width, height, lang });
      await s.page.click('#friend-mode'); await s.page.waitForURL('**/ai-friend.html');
      ok(s.dialogs.length === 0, tag + ' ① unchanged -> goes straight, no browser prompt');
      await s.ctx.close();
      // ② 바꿈 -> 묻는다 · 창이 맨 위 · 화면 안 · 버튼 44px 이상
      s = await open({ width, height, lang });
      await pickChange(s.page);
      await s.page.click('a.home');
      ok(await shown(s.page), tag + ' ② changed -> the ask dialog is shown');
      ok(new URL(s.page.url()).pathname === '/ai-speaking.html', tag + ' ② …and the page did not leave');
      const h = await hit(s.page);
      ok(h.inside && h.top && h.noScroll && h.tall && h.inertWas && h.title && h.goVisible, tag + ' ② dialog inside the screen, every button on top and ≥44px → ' + JSON.stringify(h));
      ok(await s.page.evaluate(() => document.activeElement && document.activeElement.id === 'leaveGo'), tag + ' ② focus starts on the main choice');
      const txt = await s.page.evaluate(() => ['leaveTitle', 'leaveBody', 'leavePick', 'leaveGo'].map(id => document.getElementById(id).textContent).join(' | '));
      ok(lang === 'en' ? !/[가-힣]/.test(txt) && /Level 3/.test(txt) : /수준 3단계/.test(txt) && /적용하고 이동/.test(txt), tag + ' ② texts in the screen language → ' + txt);
      // 글자 대비(창 바탕은 불투명 --card)
      const cr = await s.page.evaluate(() => { const bg = getComputedStyle(document.querySelector('.leave-box')).backgroundColor;
        const go = getComputedStyle(document.getElementById('leaveGo'));
        return ['leaveTitle', 'leaveBody', 'leavePick', 'leaveSkip', 'leaveStay'].map(id => [id, getComputedStyle(document.getElementById(id)).color, bg]).concat([['leaveGo', go.color, go.backgroundColor]]); });
      ok(cr.every(([, c, bg]) => ratio(c, bg) >= 4.5), tag + ' ② text contrast ≥ 4.5 → ' + cr.map(([id, c, bg]) => id + ':' + ratio(c, bg).toFixed(2)).join(' '));
      // ③ Tab 은 창 안에서만 돈다 · Esc = 머무르기(포커스는 누른 카드로)
      const inDlg = () => s.page.evaluate(() => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#leaveAsk')));
      let trapped = true;
      for (let i = 0; i < 5; i++) { await s.page.keyboard.press('Tab'); if (!(await inDlg())) trapped = false; }
      for (let i = 0; i < 5; i++) { await s.page.keyboard.press('Shift+Tab'); if (!(await inDlg())) trapped = false; }
      ok(trapped, tag + ' ③ every single Tab / Shift+Tab press stays inside the dialog');
      await s.page.click('#leaveBody');
      await s.page.keyboard.press('Escape');
      ok(!(await shown(s.page)), tag + ' ③ Escape works after tapping the dialog text');
      await s.page.click('a.home');
      await s.page.keyboard.press('Escape');
      ok(!(await shown(s.page)) && await s.page.evaluate(() => document.activeElement && document.activeElement.classList.contains('home')), tag + ' ③ Escape closes it and focus returns to the link');
      // ④ «적용 안 하고 이동» -> 저장 안 함 · 감 · 브라우저 창이 두 번째로 안 뜬다
      await s.page.click('a.home'); await s.page.click('#leaveSkip'); await s.page.waitForURL(origin + '/');
      ok(await ls(s.page, 'mangoi_warmup_level') === '5' && await ls(s.page, 'mangoi_aifriend_correction') === 'balanced', tag + ' ④ «go without applying» writes nothing');
      ok(s.dialogs.length === 0, tag + ' ④ …and no second (browser) prompt');
      ok(s.errors.length === 0, tag + ' no JS errors: ' + s.errors.join(';'));
      await s.ctx.close();
      // ⑤ «적용하고 이동» -> 두 화면 키 저장 · 감
      s = await open({ width, height, lang });
      await pickChange(s.page); await s.page.click('a.home'); await s.page.click('#leaveGo'); await s.page.waitForURL(origin + '/');
      ok(await ls(s.page, 'mangoi_warmup_level') === '3' && await ls(s.page, 'mangoi_aifriend_level') === 'S3' && await ls(s.page, 'mangoi_aifriend_correction') === 'focused', tag + ' ⑤ «apply and go» saves both screens and goes');
      ok(s.dialogs.length === 0, tag + ' ⑤ …no browser prompt');
      await s.ctx.close();
      // ⑤-2 7차 — 연습 시작 버튼은 묻지 않고 저장 후 간다
      s = await open({ width, height, lang });
      await pickChange(s.page); await s.page.click('#textbook-mode'); await s.page.waitForURL('**/warmup.html');
      ok(!(await s.page.evaluate(() => !!document.getElementById('leaveAsk'))) && await ls(s.page, 'mangoi_warmup_level') === '3' && await ls(s.page, 'mangoi_warmup_correction') === 'focused' && await ls(s.page, 'mangoi_aifriend_correction') === 'focused', tag + ' ⑤-2 textbook card: not asked, picks saved for both screens, goes');
      ok(s.dialogs.length === 0, tag + ' ⑤-2 …no browser prompt');
      await s.ctx.close();
      } catch (e) { ok(false, tag + ' threw (a step never happened): ' + String(e.message).split('\n')[0]); }
      finally { for (const c of browser.contexts()) await c.close().catch(() => {}); }
    }
  }
  let s;
  try {
  // ⑥ 브라우저 기본 창 — 바꿨으면 새로고침에 뜨고(취소하면 남는다), 확인 뒤엔 안 뜬다(짝)
  s = await open({ width: 390, height: 844 });
  await pickChange(s.page);
  const asked = new Promise(r => s.page.once('dialog', d => r(d.type())));
  s.page.evaluate(() => location.reload()).catch(() => {});
  ok(await Promise.race([asked, new Promise(r => setTimeout(() => r('none'), 3000))]) === 'beforeunload', '⑥ changed + reload -> the browser asks (beforeunload)');
  await s.page.waitForTimeout(300);
  ok(await s.page.evaluate(() => document.querySelector('[data-corr="focused"]').getAttribute('aria-pressed')) === 'true', '⑥ …cancel keeps the page and the pick');
  await s.page.click('#setOk'); s.dialogs.length = 0;
  await s.page.reload();
  ok(s.dialogs.length === 0, '⑥ after «확인» a reload is not asked');
  await s.ctx.close();
  } catch (e) { ok(false, '⑥ threw (a step never happened): ' + String(e.message).split('\n')[0]); }
  finally { for (const c of browser.contexts()) await c.close().catch(() => {}); }
  try {
  // ⑦ 상황 카드(#situations)는 화면 안이라 안 묻고 펼친다 · 펼친 상황 링크는 7차부터 «연습 시작» 이라 안 묻고 저장 후 간다
  s = await open({ width: 390, height: 844 });
  await pickChange(s.page);
  await s.page.click('#situation-mode');
  ok(!(await shown(s.page)) && await s.page.evaluate(() => !document.getElementById('situations').hidden), '⑦ the situations card opens in place, not asked');
  await s.page.click('#sitBody a.sit');
  await s.page.waitForURL('**/warmup.html?**');
  ok(await ls(s.page, 'mangoi_warmup_correction') === 'focused' && await ls(s.page, 'mangoi_warmup_level') === '3' && s.dialogs.length === 0, '⑦ a situation link is not asked — picks saved, goes → ' + s.page.url());
  await s.ctx.close();
  } catch (e) { ok(false, '⑦ threw (a step never happened): ' + String(e.message).split('\n')[0]); }
  finally { for (const c of browser.contexts()) await c.close().catch(() => {}); }
  try {
  // ⑧ 하나만 바꿔 «확인» 이 잠긴 경우 — «고르러 가기» 가 그 칸으로 데려간다
  s = await open({ width: 360, height: 640, seed: {} });
  await s.page.selectOption('#setLevel', '4');
  await s.page.click('a.home');
  const t8 = await s.page.evaluate(() => [document.getElementById('leaveGo').textContent, document.getElementById('leaveStay').hidden]);
  ok(await shown(s.page) && t8[0] === '고르러 가기' && t8[1] === true, '⑧ level only -> «고르러 가기», no separate stay → ' + JSON.stringify(t8));
  await s.page.click('#leaveGo');
  ok(!(await shown(s.page)) && await s.page.evaluate(() => document.activeElement.getAttribute('data-corr')) === 'free_talk', '⑧ …focuses the corrections');
  ok(await s.page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), '⑧ …and scrolls them into view');
  await s.ctx.close();
  } catch (e) { ok(false, '⑧ threw (a step never happened): ' + String(e.message).split('\n')[0]); }
  finally { for (const c of browser.contexts()) await c.close().catch(() => {}); }
  // ⑨ 탭 두 개(함정 대조 실측) — 안 만진 탭은 안 묻고 · 한 칸만 만진 탭의 «적용하고 이동» 이 다른 탭 값을 덮지 않는다
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/*', r => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
    const A = await ctx.newPage(), B = await ctx.newPage();
    await A.goto(origin + '/ai-speaking.html');
    await A.evaluate(SAVED => { localStorage.clear(); localStorage.setItem('mangoi_lang', 'ko'); for (const [k, v] of Object.entries(SAVED)) localStorage.setItem(k, v); }, SAVED);
    await A.reload(); await B.goto(origin + '/ai-speaking.html');
    await B.selectOption('#setLevel', '7'); await B.click('[data-corr="focused"]'); await B.click('#setOk');
    await A.waitForTimeout(300);
    ok(await A.evaluate(() => document.getElementById('setLevel').value) === '7', '⑨ tab A (untouched) now shows tab B\'s level (storage event)');
    await A.click('#friend-mode');
    await A.waitForURL('**/ai-friend.html', { timeout: 3000 }).catch(() => {});
    ok(/ai-friend/.test(A.url()), '⑨ tab A changed nothing -> not asked, goes → ' + A.url());
    await A.goto(origin + '/ai-speaking.html');
    await A.selectOption('#setLevel', '3');
    await B.reload(); await B.click('[data-corr="free_talk"]'); await B.click('#setOk');
    await A.click('#textbook-mode'); await A.waitForURL('**/warmup.html');
    ok(await ls(A, 'mangoi_warmup_level') === '3' && await ls(A, 'mangoi_aifriend_correction') === 'free_talk', '⑨ tab A changed the level -> the start card saved A\'s level and kept B\'s corrections (7차: not asked)');
    await ctx.close();
  } catch (e) { ok(false, '⑨ threw (a step never happened): ' + String(e.message).split('\n')[0]); }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
console.log(JSON.stringify({ suite: 'AI speaking — ask before leaving without 확인', checks: n, failed: fails.length }));
process.exitCode = fails.length ? 1 : 0;
