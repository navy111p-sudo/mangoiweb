// Usage: node test-harness/manual-story-audio-browser.mjs --fixture <short-valid-mp3>
// Optional PLAYWRIGHT_MODULE points to a bundled Playwright installation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixturePath = process.argv[process.argv.indexOf('--fixture') + 1];
assert.ok(fixturePath && existsSync(fixturePath), 'Pass a short, valid MP3 fixture');
const fixture = readFileSync(fixturePath), pub = resolve('cloudflare-deploy/public');
const counts = {}, results = [], failures = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/tts-free') {
    const text = url.searchParams.get('q') || '';
    counts[text] = (counts[text] || 0) + 1;
    res.setHeader('Cache-Control', 'no-store');
    if (text.startsWith('ERROR')) { res.writeHead(503); res.end('unavailable'); return; }
    if (text.startsWith('CORRUPT')) { res.setHeader('Content-Type', 'audio/mpeg'); res.end('not an audio file'); return; }
    if (text.startsWith('SLOW') || text.startsWith('TIMEOUT')) await new Promise(r => setTimeout(r, 450));
    if (res.destroyed) return;
    res.setHeader('Content-Type', 'audio/mpeg'); res.end(fixture); return;
  }
  if (url.pathname === '/sandbox') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Story audio sandbox</title><body>
      <button id="play" style="padding:24px">Play test</button><button id="stop" style="padding:24px">Stop test</button>
      <script src="/js/story-audio.js?v=1"></script><script>
      window.__done=0; window.__text='Hello class.'; window.__rate=.88;
      document.querySelector('#play').onclick=()=>StoryAudio.speak(__text,__rate,()=>__done++);
      document.querySelector('#stop').onclick=()=>StoryAudio.stop();
      </script></body></html>`); return;
  }
  const path = resolve(pub, '.' + decodeURIComponent(url.pathname));
  if (!path.startsWith(pub + sep) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
  res.end(readFileSync(path));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const profiles = [
  { name: 'Chrome Android touch 1920x1080', channel: 'chrome', viewport: { width: 1920, height: 1080 }, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 11; SmartBoard) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36' },
  { name: 'Chrome 4K touch', channel: 'chrome', viewport: { width: 3840, height: 2160 }, hasTouch: true },
  { name: 'Edge Windows 1920x1080', channel: 'msedge', viewport: { width: 1920, height: 1080 }, hasTouch: false },
  { name: 'Edge Android touch 1366x768', channel: 'msedge', viewport: { width: 1366, height: 768 }, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 9; SmartBoard) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.0.0 Safari/537.36' },
];
try {
  for (const profile of profiles) {
    const browser = await chromium.launch({ channel: profile.channel, headless: true });
    try {
      const context = await browser.newContext({ viewport: profile.viewport, hasTouch: profile.hasTouch, userAgent: profile.userAgent });
      await context.addInitScript(() => {
        Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
        Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: undefined, configurable: true });
        window.__media = []; window.__events = []; window.__block = 0; window.__fastTimeout = false;
        const NativeAudio = window.Audio, nativePlay = HTMLMediaElement.prototype.play, nativeTimer = window.setTimeout;
        window.Audio = function (...args) {
          const audio = new NativeAudio(...args); window.__media.push(audio);
          for (const event of ['playing', 'ended', 'error']) audio.addEventListener(event, () => __events.push({ type: event, time: audio.currentTime, duration: audio.duration, src: audio.src }));
          return audio;
        };
        HTMLMediaElement.prototype.play = function () {
          if (window.__block > 0) { window.__block--; return Promise.reject(new DOMException('Test policy block', 'NotAllowedError')); }
          return nativePlay.call(this);
        };
        window.setTimeout = function (fn, ms, ...args) { return nativeTimer(fn, window.__fastTimeout && ms === 20000 ? 160 : ms, ...args); };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/sandbox');
      const click = async selector => profile.hasTouch ? page.locator(selector).tap() : page.locator(selector).click();
      for (let round = 0; round < 10; round++) {
        for (const scenario of ['normal', 'rate', 'long', 'stop', 'supersede', 'server-error', 'corrupt', 'slow-stop', 'blocked', 'timeout']) {
          const name = `${profile.name} / ${round + 1} / ${scenario}`;
          try {
            await page.evaluate(() => { StoryAudio.stop(); __events.length = 0; __done = 0; __block = 0; __fastTimeout = false; });
            let text = `Hello class round ${round}.`;
            if (scenario === 'long') text = 'We learn together. '.repeat(24).trim();
            if (scenario === 'server-error') text = 'ERROR test';
            if (scenario === 'corrupt') text = 'CORRUPT test';
            if (scenario === 'slow-stop') text = 'SLOW test';
            if (scenario === 'timeout') text = 'TIMEOUT test';
            await page.evaluate(({ text, scenario, round }) => { __text = text; __rate = scenario === 'rate' ? [.5, .8, .88, 1, 1.5][round % 5] : 1; __block = scenario === 'blocked' ? 1 : 0; __fastTimeout = scenario === 'timeout'; }, { text, scenario, round });
            await click('#play');
            if (['stop', 'slow-stop'].includes(scenario)) {
              await click('#stop'); await page.waitForTimeout(500);
              assert.equal(await page.evaluate(() => __done), 0); assert.equal(await page.evaluate(() => StoryAudio.isSpeaking()), false);
            } else if (scenario === 'supersede') {
              await page.evaluate(() => { StoryAudio.speak('Replacement sentence.', 1, () => __done += 10); });
              await page.waitForFunction(() => __done === 10); await page.waitForTimeout(30);
              assert.equal(await page.evaluate(() => __done), 10);
            } else if (['server-error', 'corrupt', 'timeout'].includes(scenario)) {
              await page.getByRole('status').filter({ hasText: 'Audio unavailable' }).waitFor();
              assert.equal(await page.evaluate(() => __done), 0); assert.equal(await page.evaluate(() => StoryAudio.isSpeaking()), false);
              await page.evaluate(() => { __fastTimeout = false; __text = 'Recovery after failure.'; });
              await click('#play'); await page.waitForFunction(() => __done === 1);
            } else {
              if (scenario === 'blocked') {
                await page.getByRole('status').filter({ hasText: 'Tap Play' }).waitFor();
                await page.getByRole('button', { name: '▶ 다시 재생 / Play' }).click();
              }
              await page.waitForFunction(() => __done === 1);
              const events = await page.evaluate(() => __events);
              assert.ok(events.some(e => e.type === 'playing'));
              assert.ok(events.some(e => e.type === 'ended' && e.time > 0 && e.duration > 0));
              assert.equal(await page.evaluate(() => StoryAudio.isSpeaking()), false);
            }
            assert.equal(await page.evaluate(() => __media.length), 1, 'reuse one audio element');
            results.push({ name, pass: true });
          } catch (error) { failures.push({ name, error: error.message }); throw error; }
        }
        console.log(`Progress ${profile.name}: ${(round + 1) * 10}/100`);
      }
      // Real book buttons: read to completion, cancel, sentence touch, and custom sentence.
      await page.goto(base + '/story-s1-01.html');
      await click('#readAll');
      await page.waitForFunction(() => document.querySelector('#readProg').textContent.includes('모든 문장을 끝까지 들었어요'), null, { timeout: 30000 });
      results.push({ name: profile.name + ' / book full reading stamp', pass: true });
      await click('#stopAll');
      await page.locator('#text .s').first().click();
      await page.waitForFunction(() => !StoryAudio.isSpeaking());
      results.push({ name: profile.name + ' / sentence button', pass: true });
      const inputs = page.locator('#wa, #wb');
      if (await inputs.count() === 2) { await inputs.nth(0).fill('jump rope'); await inputs.nth(1).fill('I practice every day'); }
      else {
        const ids = await page.locator('input').evaluateAll(nodes => nodes.map(n => n.id));
        throw new Error('Locate writing inputs: ' + ids.join(','));
      }
      const before = await page.evaluate(() => __events.filter(e => e.type === 'ended').length);
      await click('#wsay');
      await page.waitForFunction(before => __events.filter(e => e.type === 'ended').length > before, before);
      results.push({ name: profile.name + ' / Hear my sentence', pass: true });
      await page.goto(base + '/stories.html');
      await page.locator('[data-act="open"]').click();
      const prior = await page.evaluate(() => __events.filter(e => e.type === 'ended').length);
      await page.locator('[data-act="speak"]').first().click();
      await page.waitForFunction(prior => __events.filter(e => e.type === 'ended').length > prior && !StoryAudio.isSpeaking(), prior);
      results.push({ name: profile.name + ' / ladder Listen', pass: true });
      assert.deepEqual(errors, [], 'no browser JavaScript errors');
      console.log(`PASS ${profile.name}: 100 media scenarios + 4 page integrations`);
      await context.close();
    } finally { await browser.close(); }
  }
} finally {
  server.closeAllConnections(); await new Promise(r => server.close(r));
  const report = { timestamp: new Date().toISOString(), fixture: resolve(fixturePath), profiles, passed: results.length, failures, requests: Object.values(counts).reduce((a,b) => a+b, 0), results };
  if (process.env.STORY_AUDIO_REPORT) writeFileSync(process.env.STORY_AUDIO_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failures: report.failures.length, requests: report.requests }));
}
