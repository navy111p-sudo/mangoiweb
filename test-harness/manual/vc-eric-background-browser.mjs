// Native DOM/MediaStream cancellation checks; MediaPipe stages are controlled fakes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadPlaywright, findChromium } from './_pw.mjs';
const pw = loadPlaywright(), exe = findChromium();
assert(pw && exe, 'Playwright and Chromium are required; this test must not silently skip');
const { chromium } = pw;
const main = readFileSync(new URL('../../cloudflare-deploy/public/js/idx-main.js', import.meta.url), 'utf8');
const start = main.indexOf('window.vcSetBackground = async function(mode)'), end = main.indexOf('// 🥭 Phase 41', start);
assert(start >= 0 && end > start);
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body><video id="vc-local-video" muted></video><div id="vc-local-box"></div><span id="vc-bg-status"></span></body></html>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--disable-background-networking'] });
let passed = 0;
try {
  for (const stage of ['load', 'init', 'video', 'image', 'send']) for (const fail of [false, true]) {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(({ stage, fail }) => {
        const gate = name => name === stage ? new Promise((resolve, reject) => { window.finish = () => fail ? reject(new Error('fixture failure')) : resolve(); }) : Promise.resolve();
        const rawCanvas = document.createElement('canvas'); rawCanvas.width = 320; rawCanvas.height = 240;
        window.vcLocalStream = rawCanvas.captureStream(15);
        rawCanvas.getContext('2d').fillRect(0, 0, 320, 240);
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        window.vcBg = { mode: 'off', isProcessing: false, canvas, hiddenVideo: {}, segmenter: { send: () => gate('send') } };
        window.VC_BG_IMAGES = { galaxy: '/galaxy' }; window.swaps = [];
        window.vcIsMobileDevice = () => false; window.vcBgCaptureFps = () => 15;
        window.vcLoadMediaPipe = () => gate('load'); window.vcInitBgEngine = () => gate('init');
        window.vcEnsureHiddenVideo = () => gate('video'); window.vcLoadBgImage = () => gate('image');
        window.vcSmartFitVideo = window.vcInstallSmartFit = () => {};
        window.vcBgRenderLoop = () => { vcBg.rafId = requestAnimationFrame(() => {}); };
        window.vcSwapVideoTrack = track => swaps.push(track.id);
      }, { stage, fail });
      const helper = main.indexOf('async function vcBgSendFrame(image)');
      const support = helper < 0 ? '' : main.slice(helper, main.indexOf('// --- 5-b)', helper));
      await page.addScriptTag({ content: support + main.slice(start, end) });
      await page.evaluate(() => { window.pending = vcSetBackground('galaxy'); });
      await page.waitForFunction(() => typeof window.finish === 'function');
      const result = await page.evaluate(async () => {
        await vcSetBackground('off'); const offStatus = document.getElementById('vc-bg-status').textContent;
        finish(); await pending;
        return { mode: vcBg.mode, processing: vcBg.isProcessing,
          rawPreview: document.getElementById('vc-local-video').srcObject === vcLocalStream,
          swaps, rawId: vcLocalStream.getVideoTracks()[0].id,
          statusPreserved: document.getElementById('vc-bg-status').textContent === offStatus };
      });
      assert.equal(result.mode, 'off'); assert.equal(result.processing, false);
      assert.equal(result.rawPreview, true); assert.equal(result.statusPreserved, true);
      assert.deepEqual(result.swaps, [result.rawId]); assert.deepEqual(errors, []);
      passed++;
    } finally { await page.close(); }
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
console.log(`PASS ${passed} native DOM/MediaStream background cancellation scenarios (model faked)`);
