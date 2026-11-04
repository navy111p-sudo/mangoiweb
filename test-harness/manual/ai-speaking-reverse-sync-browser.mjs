// AI 말하기 8차(2026-11-04 사장님 «반대 방향도 맞춰줘») — 진짜 크로미움 · 진짜 연습 화면.
// 자동으로 안 돕니다(manual/). 부르는 법:  node test-harness/manual/ai-speaking-reverse-sync-browser.mjs
//   (PW_DIR 을 주면 그 playwright 를, 없으면 전역 playwright 를 씁니다)
// 잰 것: 교재로 연습(웜업)·AI 친구하기 «안» 에서 교정 정도를 바꾸면, 입구(ai-speaking.html)로 돌아왔을 때
//   ① 그 값이 «지금» 으로 눌려 있고 ② «화면마다 다름» 안내가 없으며 ③ 다른 연습 화면도 같은 값을 «지금» 으로 그린다.
//   돌아오는 길은 둘 다 잰다 — 뒤로가기(보관된 화면) · 주소로 다시 열기.
// 짝: 연습 화면을 «열기만» 하면 아무 키도 안 쓴다 · 수준 키는 안 건드린다.
// 변이시험(2026-11-04): 웜업이 제 키만 쓰게 되돌리기 · AI 친구가 제 키만 쓰게 되돌리기 · 두 화면의 script 태그 빼기 → 실제 FAIL.
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
  if (/\/index\.html$/.test(file)) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>stub</title><p>home'); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
let n = 0; const fails = [];
const ok = (v, m) => { n++; if (!v) { fails.push(m); console.log('✗ ' + m); } };
const SEED = { mangoi_lang: 'ko', mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' };
async function open({ width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route('**/*', r => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  await ctx.addInitScript(seed => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, SEED);
  const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  return { ctx, page, errors };
}
const store = page => page.evaluate(() => ({ wc: localStorage.getItem('mangoi_warmup_correction'), ac: localStorage.getItem('mangoi_aifriend_correction'),
  wl: localStorage.getItem('mangoi_warmup_level'), al: localStorage.getItem('mangoi_aifriend_level') }));
// 입구가 «지금» 으로 누른 교정 · 교정 칸 안내 글자
const entryShows = page => page.waitForSelector('[data-corr][aria-pressed="true"]', { timeout: 8000 }).then(() => page.evaluate(() => ({
  on: [...document.querySelectorAll('[data-corr][aria-pressed="true"]')].map(b => b.getAttribute('data-corr')).join(','),
  state: (document.getElementById('corrState') || {}).textContent || '' }))).catch(() => ({ on: '(없음)', state: '' }));
const warmupShown = page => page.waitForSelector('#wusCModes .wus-card.on', { timeout: 8000 }).then(() => page.evaluate(() => document.querySelector('#wusCModes .wus-card.on').getAttribute('data-cmode'))).catch(() => '(없음)');
const friendShown = page => page.waitForSelector('.opt[data-cmode].active', { timeout: 8000 }).then(() => page.evaluate(() => document.querySelector('.opt[data-cmode].active').getAttribute('data-cmode'))).catch(() => '(없음)');
const moduleReady = page => page.waitForFunction(() => !!(window.AiSpeakSettings && window.AiSpeakSettings.chooseCorr), null, { timeout: 8000 }).then(() => true).catch(() => false);

try {
  for (const [width, height] of [[390, 844], [1366, 768]]) {
    const tag = `${width}x${height}`;
    try {
      // ① 입구(균형) → 교재로 연습 → 웜업 설정에서 집중교정 → 뒤로가기
      let s = await open({ width, height });
      await s.page.goto(origin + '/ai-speaking.html');
      await s.page.click('#textbook-mode');
      await s.page.waitForURL('**/warmup.html');
      ok(await moduleReady(s.page), tag + ' ① warmup loaded the settings module');
      const before = await store(s.page);
      ok(before.wc === 'balanced' && before.ac === 'balanced' && before.wl === '5' && before.al === 'S5', tag + ' ① (pair) opening warmup wrote nothing → ' + JSON.stringify(before));
      await s.page.click('#wusCModes [data-cmode="focused"]');
      ok(await warmupShown(s.page) === 'focused', tag + ' ① warmup now shows «지금» on focused');
      const after = await store(s.page);
      ok(after.wc === 'focused' && after.ac === 'focused', tag + ' ① warmup pick saved BOTH screen keys → ' + JSON.stringify(after));
      ok(after.wl === '5' && after.al === 'S5', tag + ' ① …level keys untouched');
      await s.page.goBack(); await s.page.waitForURL('**/ai-speaking.html');
      let e = await entryShows(s.page);
      ok(e.on === 'focused' && !/다름/.test(e.state), tag + ' ① back to the entry -> focused is pressed, not «화면마다 다름» → ' + JSON.stringify(e));
      ok(await s.page.evaluate(() => document.getElementById('leaveAsk').hidden), tag + ' ① …no leave dialog open');
      // 주소로 다시 열어도 같다
      await s.page.goto(origin + '/ai-speaking.html?_nc=' + Date.now());
      e = await entryShows(s.page);
      ok(e.on === 'focused', tag + ' ① reopening the entry also shows focused → ' + e.on);
      // 다른 연습 화면(AI 친구)도 같은 값
      await s.page.goto(origin + '/ai-friend.html');
      ok(await friendShown(s.page) === 'focused', tag + ' ① AI friend also shows focused (one setting)');
      ok(s.errors.length === 0, tag + ' ① no JS errors: ' + s.errors.join(';'));
      await s.ctx.close();
      // ② AI 친구하기 안에서 자유로 → 입구 · 웜업
      s = await open({ width, height });
      await s.page.goto(origin + '/ai-speaking.html');
      await s.page.click('#friend-mode');
      await s.page.waitForURL('**/ai-friend.html');
      ok(await moduleReady(s.page), tag + ' ② AI friend loaded the settings module');
      const b2 = await store(s.page);
      ok(b2.wc === 'balanced' && b2.ac === 'balanced', tag + ' ② (pair) opening AI friend wrote nothing → ' + JSON.stringify(b2));
      await s.page.evaluate(() => document.querySelector('.opt[data-cmode="free_talk"]').click());
      ok(await friendShown(s.page) === 'free_talk', tag + ' ② AI friend shows free_talk active');
      const a2 = await store(s.page);
      ok(a2.wc === 'free_talk' && a2.ac === 'free_talk' && a2.wl === '5' && a2.al === 'S5', tag + ' ② AI friend pick saved BOTH correction keys, levels untouched → ' + JSON.stringify(a2));
      await s.page.goBack(); await s.page.waitForURL('**/ai-speaking.html');
      e = await entryShows(s.page);
      ok(e.on === 'free_talk' && !/다름/.test(e.state), tag + ' ② back to the entry -> free_talk pressed → ' + JSON.stringify(e));
      await s.page.goto(origin + '/warmup.html');
      ok(await warmupShown(s.page) === 'free_talk', tag + ' ② warmup also shows «지금» on free_talk');
      ok(s.errors.length === 0, tag + ' ② no JS errors: ' + s.errors.join(';'));
      await s.ctx.close();
    } catch (err) { ok(false, tag + ' threw (a step never happened): ' + String(err.message).split('\n')[0]); }
    finally { for (const c of browser.contexts()) await c.close().catch(() => {}); }
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
console.log(JSON.stringify({ suite: 'AI speaking — practice screens sync back to the entry', checks: n, failed: fails.length }));
process.exitCode = fails.length ? 1 : 0;
