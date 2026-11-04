// AI 말하기 7차(2026-11-04 사장님 «자유·균형·집중을 바꾸고 버튼 누르면 교재로 연습 안에서도 똑같이 자동으로») — 진짜 크로미움 · 진짜 연습 화면.
// 자동으로 안 돕니다(manual/). 부르는 법:  node test-harness/manual/ai-speaking-start-apply-browser.mjs
//   (PW_DIR 을 주면 그 playwright 를, 없으면 전역 playwright 를 씁니다)
// 잰 것: 입구에서 교정 정도를 바꾸고 «확인» 없이 시작 버튼(교재로 연습 · 상황 하나 · AI 친구하기)을 누르면
//   ① 묻는 창 없이 그 화면으로 가고 ② 그 화면이 «지금» 으로 칠한 교정 정도가 입구에서 고른 것과 같다.
//   ⚠️ 연습 화면을 빈 페이지로 바꾸지 않습니다 — «저장값» 이 아니라 «그 화면이 실제로 그린 것» 을 봅니다(사장님이 보는 그 칸).
// 짝: 홈(←) 링크는 여전히 묻는다 · «확인» 이 잠긴 경우(수준 없음)는 시작 버튼도 묻는다.
// 변이시험(2026-11-04): 시작 링크 분기 제거 · 교재 카드 data-start 제거 · 상황 링크 data-start 제거 · AI 친구 카드 data-start 제거 → 실제 FAIL.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = process.env.PW_DIR ? require(process.env.PW_DIR + '/node_modules/playwright') : require('playwright');
const root = path.resolve('cloudflare-deploy/public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":false}'); return; }
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  // 홈은 «도착했다» 만 알면 된다 — 빈 페이지로 대신한다(연습 화면은 진짜로 띄운다)
  if (/\/index\.html$/.test(file)) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>stub</title><p>home'); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
let n = 0; const fails = [];
const ok = (v, m) => { n++; if (!v) { fails.push(m); console.log('✗ ' + m); } };
const CORR = ['free_talk', 'balanced', 'focused'];
const seedOf = (corr, level = '5') => ({ mangoi_warmup_level: level, mangoi_aifriend_level: 'S' + level, mangoi_warmup_correction: corr, mangoi_aifriend_correction: corr });
async function open({ width, height, seed }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route('**/*', r => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  await ctx.addInitScript(seed => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear(); localStorage.setItem('mangoi_lang', 'ko');
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, seed);
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
  await page.goto(origin + '/ai-speaking.html');
  return { ctx, page, dialogs };
}
const asked = page => page.evaluate(() => !document.getElementById('leaveAsk').hidden);
// 연습 화면이 «지금» 으로 그린 교정 정도
const warmupShown = page => page.waitForSelector('#wusCModes .wus-card.on', { timeout: 8000 }).then(() => page.evaluate(() => document.querySelector('#wusCModes .wus-card.on').getAttribute('data-cmode'))).catch(() => '(없음)');
const warmupUses = page => page.waitForFunction(() => typeof window._wuCorrMode === 'string', null, { timeout: 8000 }).then(() => page.evaluate(() => window._wuCorrMode)).catch(() => '(없음)');
const friendShown = page => page.waitForSelector('.opt[data-cmode].active', { timeout: 8000 }).then(() => page.evaluate(() => document.querySelector('.opt[data-cmode].active').getAttribute('data-cmode'))).catch(() => '(없음)');

try {
  for (const [width, height] of [[390, 844], [1366, 768]]) {
    for (const from of CORR) for (const to of CORR) {
      if (from === to) continue;
      const tag = `${width}x${height} ${from}→${to}`;
      try {
        // ① 교재로 연습
        let s = await open({ width, height, seed: seedOf(from) });
        await s.page.click(`[data-corr="${to}"]`);
        await s.page.click('#textbook-mode');
        await s.page.waitForURL('**/warmup.html', { timeout: 5000 }).catch(() => {});
        ok(new URL(s.page.url()).pathname === '/warmup.html' && s.dialogs.length === 0, tag + ' ① textbook: goes straight, no ask → ' + s.page.url());
        const w = await warmupShown(s.page);
        ok(w === to, tag + ' ① textbook practice shows «지금» on the picked correction → ' + w);
        await s.ctx.close();
        // ② 상황 하나(설정 화면 없이 바로 대화 — 화면이 «쓰는» 값을 본다)
        s = await open({ width, height, seed: seedOf(from) });
        await s.page.click(`[data-corr="${to}"]`);
        await s.page.click('#situation-mode'); await s.page.click('#sitBody a.sit');
        await s.page.waitForURL('**/warmup.html?**', { timeout: 5000 }).catch(() => {});
        ok(/\/warmup\.html\?/.test(s.page.url()) && s.dialogs.length === 0, tag + ' ② situation: goes straight, no ask → ' + s.page.url());
        const u = await warmupUses(s.page);
        ok(u === to, tag + ' ② situation practice uses the picked correction → ' + u);
        await s.ctx.close();
        // ③ AI 친구하기
        s = await open({ width, height, seed: seedOf(from) });
        await s.page.click(`[data-corr="${to}"]`);
        await s.page.click('#friend-mode');
        await s.page.waitForURL('**/ai-friend.html', { timeout: 5000 }).catch(() => {});
        ok(new URL(s.page.url()).pathname === '/ai-friend.html' && s.dialogs.length === 0, tag + ' ③ AI friend: goes straight, no ask → ' + s.page.url());
        const f = await friendShown(s.page);
        ok(f === to, tag + ' ③ AI friend shows the picked correction as active → ' + f);
        await s.ctx.close();
      } catch (e) { ok(false, tag + ' threw (a step never happened): ' + String(e.message).split('\n')[0]); }
      finally { for (const c of browser.contexts()) await c.close().catch(() => {}); }
    }
  }
  // 짝 ④ 홈(←)은 «연습을 안 하고 나가는» 링크 — 여전히 묻고, 저장하지 않는다
  try {
    const s = await open({ width: 390, height: 844, seed: seedOf('free_talk') });
    await s.page.click('[data-corr="balanced"]'); await s.page.click('a.home');
    ok(await asked(s.page) && new URL(s.page.url()).pathname === '/ai-speaking.html', '④ home link with an unapplied pick -> still asked, stays');
    ok(await s.page.evaluate(() => localStorage.getItem('mangoi_warmup_correction')) === 'free_talk', '④ …and nothing saved yet');
    await s.ctx.close();
  } catch (e) { ok(false, '④ threw: ' + String(e.message).split('\n')[0]); }
  // 짝 ⑤ 수준이 아직 없어 «확인» 이 잠긴 경우 — 시작 버튼도 묻는다(무엇을 고를지 말한다)
  try {
    const s = await open({ width: 390, height: 844, seed: {} });
    await s.page.click('[data-corr="balanced"]'); await s.page.click('#textbook-mode');
    const body = await s.page.evaluate(() => document.getElementById('leaveBody').textContent);
    ok(await asked(s.page) && /수준을 골라야/.test(body), '⑤ no level yet -> the start button asks for the level → ' + body);
    await s.ctx.close();
  } catch (e) { ok(false, '⑤ threw: ' + String(e.message).split('\n')[0]); }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
console.log(JSON.stringify({ suite: 'AI speaking — start buttons carry the picked correction', checks: n, failed: fails.length }));
process.exitCode = fails.length ? 1 : 0;
