// Real page wiring; deterministic voice/TTS/API doubles, no production data.
// PW_DIR=/path/to/pw CHROMIUM_PATH=/path/to/chrome node test-harness/manual/ai-friend-auto-talk-browser.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_DIR + '/node_modules/playwright');
const root = resolve('cloudflare-deploy/public');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://local').pathname);
    if (!path.startsWith(root + '/')) throw Error('path');
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
let count = 0;
const ok = (condition, label) => { assert.ok(condition, label); console.log('PASS ' + (++count) + ': ' + label); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const json = obj => ({ contentType: 'application/json', body: JSON.stringify(obj) });
  await page.route('**/api/**', r => r.fulfill(json({ ok: true, items: [] })));
  await page.route('**/api/ai/chat-guest-token', r => r.fulfill(json({ ok: true, uid: 'guest_probe', token: 'probe.token' })));
  let requests = 0;
  await page.route('**/api/ai/chat-friend', r => { requests++; return r.fulfill(json({ ok: true, reply: 'Great! What food do you like?', gam: null })); });
  await page.goto('http://127.0.0.1:' + server.address().port + '/ai-friend.html');
  await page.evaluate(() => {
    window.probe = { recordings: 0, ends: [], canceled: 0 };
    MangoiTTS.speak = (text, rate, done) => probe.ends.push(done);
    MangoiTTS.stop = () => { probe.ends = []; };
    MangoiVoice.supported = () => true;
    MangoiVoice.busy = () => !!probe.resolve;
    MangoiVoice.record = opts => {
      probe.recordings++; probe.opts = opts; opts.onState('waiting', {});
      return new Promise(r => { probe.resolve = r; });
    };
    MangoiVoice.cancel = () => { probe.canceled++; if (probe.resolve) { const r = probe.resolve; probe.resolve = null; r('late canceled text'); } };
    probe.finish = (text, heard = true, error = '') => {
      if (heard) probe.opts.onState('speaking', {});
      if (error) probe.opts.onState('error', { reason: error });
      const r = probe.resolve; probe.resolve = null; r(text);
    };
  });
  const recordings = () => page.evaluate(() => probe.recordings);
  const select = m => page.click('#friendTalkSwitch [data-mode="' + m + '"]');
  const settle = () => page.waitForTimeout(850);
  ok(await recordings() === 0, 'default button mode does not open the mic');
  await select('auto'); await settle();
  ok(await recordings() === 1, 'auto opens the mic after explicit selection');
  await page.evaluate(() => probe.finish('I like pizza.'));
  await page.waitForFunction(() => probe.ends.length === 1); await settle();
  ok(requests === 1 && await recordings() === 1, 'voice sends once; no listening while TTS is pending');
  await page.evaluate(() => probe.ends.shift()()); await settle();
  ok(await recordings() === 2, 'mic resumes only after TTS completion and echo delay');
  await page.evaluate(() => probe.finish('Thank you.', false)); await settle();
  ok(requests === 1 && await recordings() === 3, 'silence hallucination is discarded, with one retry');
  await page.evaluate(() => probe.finish('Thank you.', false)); await settle();
  ok(requests === 1 && await recordings() === 3, 'second silent run pauses without a loop');
  await select('auto'); await settle(); await select('button'); await settle();
  ok(requests === 1 && !(await page.evaluate(() => _whisperOn)), 'switching to button cancels recording and discards late text');
  await page.click('#micBtn');
  await page.evaluate(() => probe.finish('I like apples.'));
  await page.waitForFunction(() => probe.ends.length === 1);
  const manualCount = await recordings();
  await page.evaluate(() => probe.ends.shift()()); await settle();
  ok(requests === 2 && await recordings() === manualCount, 'button mode still sends voice but never auto-reopens');
  await select('auto'); await settle();
  await page.evaluate(() => probe.finish('', false, 'denied')); await settle();
  ok(!(await page.evaluate(() => FriendAutoTalk.on())) && (await page.textContent('#friendTalkStatus')).includes('권한'), 'permission error pauses and gives actionable guidance');
  await select('auto'); await settle(); await page.focus('#msgInput'); await settle();
  ok(!(await page.evaluate(() => _whisperOn)) && requests === 2, 'typing focus cancels automatic recording');
  // SSE sentences have gaps longer than the echo delay: never listen between them.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = function (url, opts) {
      if (String(url) !== '/api/ai/chat-friend') return original(url, opts);
      const encoder = new TextEncoder();
      return Promise.resolve(new Response(new ReadableStream({ start(c) {
        c.enqueue(encoder.encode('data: {"t":"First sentence."}\n\n'));
        setTimeout(() => {
          c.enqueue(encoder.encode('data: {"t":"Second sentence."}\n\n'));
          c.enqueue(encoder.encode('data: {"done":true,"ok":true,"reply":"First sentence. Second sentence."}\n\n'));
          c.close();
        }, 1800);
      }}), { headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
  await select('auto'); await settle();
  await page.evaluate(() => probe.finish('Tell me more.'));
  await page.waitForFunction(() => probe.ends.length === 1);
  const beforeStream = await recordings();
  await page.evaluate(() => probe.ends.shift()()); await settle();
  ok(await recordings() === beforeStream, 'stream gap does not open the mic');
  await page.waitForFunction(() => probe.ends.length === 1); await settle();
  ok(await recordings() === beforeStream, 'last streamed sentence must finish before the mic opens');
  await page.evaluate(() => probe.ends.shift()()); await settle();
  ok(await recordings() === beforeStream + 1, 'complete streamed turn resumes automatic listening');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await settle();
  ok(!(await page.evaluate(() => _whisperOn)), 'hidden page releases the mic');
  await page.evaluate(() => { delete document.hidden; });
  await select('auto'); await settle();
  await page.evaluate(() => MangoiFaceTalk.enter()); await page.waitForTimeout(50);
  ok(!(await page.evaluate(() => FriendAutoTalk.on())) && !(await page.evaluate(() => _whisperOn)), 'face chat suspends inline automatic listening');
  await page.evaluate(() => MangoiFaceTalk.exit()); await settle();
  await mkdir(process.env.AIF_SCREENSHOTS || '/tmp/aif-screenshots', { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const fit = await page.evaluate(() => {
      const sw = document.getElementById('friendTalkSwitch').getBoundingClientRect();
      const form = document.querySelector('.input-bar form').getBoundingClientRect();
      return sw.width > 0 && sw.left >= 0 && sw.right <= innerWidth && sw.bottom <= form.top && form.bottom <= innerHeight;
    });
    ok(fit, 'switch above input fits viewport ' + width);
    await page.screenshot({ path: (process.env.AIF_SCREENSHOTS || '/tmp/aif-screenshots') + '/' + width + '.png' });
  }
  await page.reload(); await settle();
  ok(await page.evaluate(() => FriendAutoTalk.mode() === 'auto' && !FriendAutoTalk.on() && !_whisperOn), 'saved preference does not start recording after reload');
  ok(errors.length === 0, 'no page JavaScript errors: ' + errors.join('; '));
  console.log('AI friend auto talk: ' + count + ' PASS');
} finally { await browser.close(); server.close(); }
