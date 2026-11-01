// Real Chromium + IndexedDB + MediaRecorder + local workerd/R2 integration.
// Uses generated tone/video fixtures and fake microphone only. Never calls production.
// PW_DIR=/path/to/playwright PLAYWRIGHT_BROWSERS_PATH=/path/to/browsers node test-harness/manual/ai-dubbing-library-browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, mkdtemp } from 'node:fs/promises';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { requireBrowser } from './_pw.mjs';

const { chromium, exe } = requireBrowser();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cd = join(root, 'cloudflare-deploy'), pub = join(cd, 'public');
const require = createRequire(join(cd, 'package.json'));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const temp = await mkdtemp(join(tmpdir(), 'dubbing-browser-'));
const secret = 'local-browser-fixture-not-a-production-secret';
const token = uid => {
  const p = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 3600000 })).toString('base64url');
  return p + '.' + createHmac('sha256', secret).update(p).digest('base64url');
};
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x193856:s=640x360:r=24', '-t', '4', '-c:v', 'libvpx', '-b:v', '240k', '-pix_fmt', 'yuv420p', join(temp, 'scene.webm')]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=480:sample_rate=48000', '-t', '4', '-c:a', 'libmp3lame', join(temp, 'voice.mp3')]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=380:sample_rate=48000', '-t', '8', '-c:a', 'pcm_s16le', join(temp, 'mic.wav')]);
const video = await readFile(join(temp, 'scene.webm')), voice = await readFile(join(temp, 'voice.mp3'));
const manifest = JSON.parse(await readFile(join(pub, 'data/dubbing/dub-001.json'), 'utf8'));
manifest.scenes = manifest.scenes.slice(0, 2).map((sc, i) => ({
  ...sc, no: i + 1, durationSec: 4, sfx: [], video: '/media/dubbing/fixture.webm',
  voices: { jun: '/media/dubbing/fixture.mp3', mina: '/media/dubbing/fixture.mp3', rex: '/media/dubbing/fixture.mp3' },
  lines: [
    { id: `s${i + 1}-l1`, speaker: 'jun', en: 'Hi! Who are you?', ko: '안녕! 너는 누구니?', start: 0.6, end: 1.8, scored: true },
    { id: `s${i + 1}-l2`, speaker: 'mina', en: 'Hello! Welcome to our class!', ko: '안녕! 우리 반에 온 걸 환영해!', start: 2.2, end: 3.5, scored: true },
  ],
}));
const compiled = await build({
  stdin: { resolveDir: join(cd, 'src'), loader: 'ts', contents: "import {handleDubbingApi} from './api-dubbing'; export default {fetch:handleDubbingApi};" },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  plugins: [{ name: 'no-staff-session-fixture', setup(b) {
    b.onResolve({ filter: /^\.\/auth-admin$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export async function checkAdminSession(){return {ok:false}}', loader: 'js' }));
  } }],
});
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: compiled.outputFiles[0].text,
  compatibilityDate: '2026-10-01', bindings: { ROOM_JWT_SECRET: secret, SINGLE_SESSION: 'off' },
  r2Buckets: ['RECORDINGS'], kvNamespaces: ['SESSION_STATE'] }));
let failMovies = false, failDubbing = false;
const calls = [];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`), path = url.pathname;
    if (path.startsWith('/api/')) calls.push({ method: req.method, path });
    if (path.startsWith('/api/dubbing/')) {
      if (failDubbing || (failMovies && path === '/api/dubbing/movies' && req.method === 'POST')) {
        res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"storage_unavailable"}'); return;
      }
      const chunks = []; for await (const part of req) chunks.push(part);
      const response = await mf.dispatchFetch(url.href, { method: req.method, headers: req.headers,
        ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (path.startsWith('/api/')) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"ok":false,"error":"local_fixture_unavailable"}'); return; }
    if (path === '/data/dubbing/dub-001.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); return; }
    if (path.startsWith('/media/dubbing/') && /\.(mp4|webm|mp3)$/.test(path)) {
      const bytes = path.endsWith('.mp3') ? voice : video;
      res.writeHead(200, { 'Content-Type': path.endsWith('.mp3') ? 'audio/mpeg' : 'video/webm', 'Content-Length': bytes.length }); res.end(bytes); return;
    }
    const file = resolve(pub, '.' + decodeURIComponent(path));
    if (!file.startsWith(pub + '/')) { res.writeHead(403); res.end(); return; }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: exe, headless: true, args: [
  '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  '--use-file-for-fake-audio-capture=' + join(temp, 'mic.wav'), '--autoplay-policy=no-user-gesture-required',
] });
let passed = 0;
const check = (name, value) => { assert.ok(value, name); passed++; console.log('✓ ' + name); };
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['microphone'], acceptDownloads: true });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
await context.addInitScript(({ auth }) => {
  if (!localStorage.getItem('mango_token')) {
    localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'browser-a', name: '테스트 학생' }));
    localStorage.setItem('mango_token', auth); localStorage.setItem('mangoi_lang', 'ko');
  }
  window.__micRequests = 0;
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (...args) => { window.__micRequests++; return gum(...args); };
}, { auth: token('browser-a') });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') console.log('browser:', message.text().slice(0, 400)); });
page.on('dialog', dialog => dialog.accept());
page.setDefaultTimeout(20000);
async function snapshot(name) { await page.screenshot({ path: join(temp, name + '.png'), fullPage: true }); }
async function account(uid) {
  await page.evaluate(({ uid, auth }) => {
    localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid, name: uid }));
    localStorage.setItem('mango_token', auth); window.dispatchEvent(new Event('mangoi:auth-changed'));
    window.MangoiDubLibrary.identity();
  }, { uid, auth: token(uid) });
}
try {
  await page.goto(base + '/ai-dubbing.html');
  await page.waitForFunction(() => window.__dub?.S.ep && !document.getElementById('dub-quick-start').disabled);
  check('desktop entry has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await snapshot('desktop-entry');
  await page.locator('#dub-quick-start').click();
  check('quick start opens role setup without microphone', await page.evaluate(() => document.body.classList.contains('dub-sheet-open') && window.__micRequests === 0));
  await page.locator('#dub-mode').selectOption('presentation');
  await page.locator('#dub-make-movie').check();
  await page.locator('#dub-start').click();
  await page.waitForFunction(() => window.__dub.S.movies[0]?.saveState === 'saved', null, { timeout: 45000 });
  check('real MediaRecorder movie saves despite unavailable scoring API', await page.evaluate(() => window.__dub.S.movies[0].size > 2000));
  await page.waitForFunction(() => !window.__dub.S.run);
  await page.reload();
  await page.waitForFunction(() => window.__dub?.S.ep);
  await page.locator('#dub-quick-library').click();
  await page.locator('.dub-library-card .go').first().click();
  await page.waitForFunction(() => document.querySelector('.dub-library-card video')?.readyState >= 1);
  check('authenticated movie plays after a real page reload', await page.locator('.dub-library-card video').isVisible());
  await snapshot('desktop-library');
  await page.locator('#dub-library-close').click();

  // Stop a whole-story take at the second scene and restore the boundary after reload.
  await page.locator('#dub-quick-start').click();
  await page.locator('#dub-mode').selectOption('presentation');
  await page.locator('#dub-all').locator('..').locator('summary').click();
  await page.locator('#dub-all').click();
  await page.waitForFunction(() => window.__dub.S.run?.nextIndex === 1, { timeout: 45000 });
  await page.locator('#dub-stop').click();
  await page.waitForFunction(() => !window.__dub.S.run && window.__dub.S.movies.some(m => m.interrupted && m.saveState === 'saved'));
  await page.reload();
  await page.waitForFunction(() => window.__dub?.S.ep);
  await page.locator('#dub-quick-resume').click();
  await page.locator('.dub-library-card .go').first().click();
  await page.waitForFunction(() => window.__dub.S.resume?.sceneIdxs[0] === 1);
  check('real saved checkpoint resumes second scene without starting mic', await page.evaluate(() => window.__micRequests === 0));

  // Durable fallback and retry use the actual IndexedDB implementation.
  failMovies = true;
  await page.evaluate(async () => {
    const response = await fetch('/media/dubbing/fixture.webm');
    try { await MangoiDubLibrary.saveMovie(await response.blob(), { engine: 'main', episodeId: 'dub-001', title: '재시도 테스트', durationMs: 4000 }); }
    catch (e) { window.__fallbackSaved = e.localSaved; }
  });
  check('network failure leaves a durable device copy', await page.evaluate(() => window.__fallbackSaved === true));
  await page.goto(base + '/ai-dubbing.html?library=movies');
  await page.getByRole('heading', { name: '재시도 테스트', exact: true }).waitFor();
  failMovies = false;
  const fallbackCard = page.locator('.dub-library-card').filter({ has: page.getByRole('heading', { name: '재시도 테스트', exact: true }) });
  await fallbackCard.getByRole('button', { name: '내 계정에도 저장하기', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.dub-library-card')].some(c => c.querySelector('h3')?.textContent === '재시도 테스트' && c.querySelector('.dub-library-badge')?.textContent === '내 계정에 저장됨'));
  check('retry after reload synchronizes the original pending movie', true);
  await account('browser-b');
  await page.locator('#dub-quick-library').click();
  await page.locator('#dub-library-empty').waitFor({ state: 'visible' });
  check('account switch hides every previous account movie', await page.locator('.dub-library-card').count() === 0);
  await account('browser-a');

  await page.goto(base + '/ai-dubbing-studio.html?ep=picnic');
  await page.waitForFunction(() => !document.getElementById('btn-save-practice').disabled);
  const recordLine = async i => {
    const b = page.locator('#cues > li').nth(i).locator('.cue-rec button').first();
    await b.click();
    await page.waitForFunction(() => document.getElementById('rec-status').textContent.includes('녹음 중'));
    await page.waitForTimeout(1100);
    await b.click();
    await page.waitForFunction(() => !document.getElementById('btn-save-practice').disabled && document.getElementById('studio-save-status').textContent.includes('계정'));
    await page.waitForFunction(() => !document.getElementById('studio-save-status').textContent.includes('저장 중'));
  };
  await recordLine(1);
  await recordLine(4);
  const before = await page.evaluate(async () => (await MangoiDubLibrary.getDraft('studio-picnic')).draft.state);
  await recordLine(1);
  const after = await page.evaluate(async () => (await MangoiDubLibrary.getDraft('studio-picnic')).draft.state);
  const ref = (state, line) => state.recordings.find(r => r.line === line)?.audioId;
  check('studio retake changes one audio file and preserves the other', before.recordings.length === 2 && after.recordings.length === 2 && ref(before, 1) !== ref(after, 1) && ref(before, 4) === ref(after, 4));
  await page.goto(base + '/ai-dubbing-studio.html?ep=picnic&resume=studio-picnic');
  await page.waitForFunction(() => document.querySelectorAll('#cues .cue-rec button.has').length >= 4);
  check('studio line recordings survive reload and resume link', await page.locator('#rec-count').textContent().then(t => t.includes('2')));
  await snapshot('desktop-studio');
  await page.locator('#btn-export').click();
  await page.waitForFunction(() => document.getElementById('studio-save-status').textContent.includes('영상을 내 계정에 저장했어요'), null, { timeout: 120000 });
  const studioMovie = await page.evaluate(async () => (await MangoiDubLibrary.listMovies()).movies.find(m => m.engine === 'studio'));
  check('studio exports a real complete video into the account library', studioMovie && studioMovie.size > 2000 && !studioMovie.interrupted);
  failDubbing = true;
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('btn-save-practice').disabled);
  check('studio resumes local audio when account storage is unavailable', await page.locator('#cues .cue-rec button.has').count() >= 4);
  failDubbing = false;
  await page.locator('#btn-conversation').click();
  await page.waitForURL('**/ai-friend.html?practice=dubbing');
  await page.locator('#dub-practice-card').waitFor();
  check('AI friend receives only the two recorded lines', await page.locator('#dub-practice-card li').count() === 2);
  const requestsBeforePrepare = calls.length;
  await page.locator('#dub-practice-card button').first().click();
  check('conversation preparation fills the input without sending a request', await page.evaluate(() => [...document.querySelectorAll('input,textarea')].some(i => i.value.includes('Hooray! Can we go on a picnic?') && i.value.includes("Great! Let's play catch."))) && !calls.slice(requestsBeforePrepare).some(c => c.method === 'POST'));
  await snapshot('desktop-conversation');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/ai-dubbing.html');
  await page.waitForFunction(() => window.__dub?.S.ep);
  check('mobile entry has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#mangoi-global-lang-toggle').click();
  check('language toggle updates the actual quick-start details', await page.locator('#dub-quick-detail').textContent().then(t => t.includes('script lines')));
  await page.locator('#mangoi-global-lang-toggle').click();
  await snapshot('mobile-entry');
  await page.locator('#dub-quick-library').click();
  await page.waitForFunction(() => document.querySelectorAll('.dub-library-card').length > 0);
  check('mobile library has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await snapshot('mobile-library');
  await page.goto(base + '/ai-dubbing-studio.html?ep=picnic&resume=studio-picnic');
  await page.waitForFunction(() => !document.getElementById('btn-save-practice').disabled);
  check('mobile studio has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await snapshot('mobile-studio');

  const gallery = await context.newPage();
  gallery.on('dialog', dialog => dialog.accept());
  await gallery.goto(base + '/ai-dubbing.html?library=drafts');
  const practiceCard = gallery.locator('.dub-library-card').filter({ has: gallery.getByRole('heading', { name: '소풍 가는 날', exact: true }) });
  await practiceCard.getByRole('button', { name: '연습 기록 삭제', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('rec-count').textContent.startsWith('0'));
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('btn-save-practice').disabled);
  check('deleting studio practice in another tab removes device recordings after reload', await page.locator('#cues .cue-rec button.has').count() === 0);
  await recordLine(1);
  check('a fresh recording can be saved after deleting a practice', await page.evaluate(async () => (await MangoiDubLibrary.getDraft('studio-picnic')).draft.state.recordings.length === 1));
  await gallery.close();
  check('no uncaught page JavaScript errors', errors.length === 0);
  console.log(`${passed} browser checks passed. Fixture screenshots: ${temp}`);
} catch (error) {
  await snapshot('failure');
  console.error('State:', await page.evaluate(() => ({ micRequests: window.__micRequests, run: window.__dub?.S.run && { aborted: window.__dub.S.run.aborted, mic: !!window.__dub.S.run.mic, movie: !!window.__dub.S.run.movie, nextIndex: window.__dub.S.run.nextIndex }, movies: window.__dub?.S.movies.map(m => ({ size: m.size, state: m.saveState, message: m.saveMessage })), status: document.getElementById('dub-draft-status')?.textContent, recStatus: document.getElementById('rec-status')?.textContent, studioStatus: document.getElementById('studio-save-status')?.textContent })));
  console.error('Browser errors:', errors);
  console.error('Failure screenshot:', join(temp, 'failure.png'));
  throw error;
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve)); await mf.dispose();
}
