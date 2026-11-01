// Local DOM check of shipping teacher/student help; no accounts or network assets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadPlaywright, findChromium } from './_pw.mjs';
const pw = loadPlaywright(), exe = findChromium();
assert(pw && exe, 'Playwright and Chromium are required; this test must not silently skip');
const { chromium } = pw;
const source = readFileSync(new URL('../../cloudflare-deploy/public/js/idx-vc-guide.js', import.meta.url), 'utf8');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/guide.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(req.url === '/guide.js' ? source : '<!doctype html><html><body><div><span id="vc-room-info"></span></div><div id="mg-unibar"><span class="uni-info"></span></div><script>window.showView=()=>{};window.vcIsStaffNow=()=>vcMyRole!=="student";</script><script src="/guide.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--disable-background-networking'] });
let passed = 0;
try {
  for (const role of ['teacher', 'admin', 'student']) for (const lang of ['ko', 'en']) for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 }, serviceWorkers: 'block' });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(({ role, lang }) => { window.vcMyRole = role; localStorage.setItem('mangoi_lang', lang); mgOpenVcGuide(); }, { role, lang });
      await page.locator(`[data-lang="${lang}"]`).click();
      assert.equal(await page.locator('.vg-steps').isVisible(), role !== 'student');
      if (role !== 'student') {
        assert.equal(await page.locator('.vg-steps li').count(), 5);
        assert.match(await page.locator('.vg-steps').innerText(), /Krisp/);
        assert.match(await page.locator('.vg-steps').innerText(), lang === 'ko' ? /새로고침/ : /refresh/);
        assert.equal(await page.locator('.vg-steps a').getAttribute('href'), '/teacher-training.html');
        assert.equal(await page.locator('.vg-steps a').getAttribute('rel'), 'noopener');
      }
      if (role === 'teacher' && lang === 'en' && !mobile && process.env.GUIDE_SCREENSHOT) await page.screenshot({ path: process.env.GUIDE_SCREENSHOT });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#vc-guide-ov').count(), 0);
      await page.evaluate(() => mgOpenVcGuide());
      assert.equal(await page.locator('#vc-guide-ov').count(), 1);
      assert.deepEqual(errors, []);
      passed++;
    } finally { await context.close(); }
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
console.log(`PASS ${passed} role/language/viewport guide scenarios`);
