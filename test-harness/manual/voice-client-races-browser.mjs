/**
 * Bounded browser coverage for already-fixed, ordinary client races only.
 * Whole shipped AI-friend/warmup pages; unchanged shared scripts on minimal DOM
 * hosts for vocabulary/TTS. Native fetch, storage events, Web Streams and silent
 * HTMLAudioElement playback; synthetic recognition callbacks, no device access.
 * No HTTP server, source rewriting, real accounts, provider calls or passing skips.
 * Run only in the existing loopback-only CI namespace with pinned Playwright.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = await realpath(resolve(ROOT, 'cloudflare-deploy/public'));
const OUT = resolve(process.env.OUTPUT_DIR || '/tmp/voice-client-races-results');
const BASE = 'http://127.0.0.1:18764'; // Synthetic routed origin; nothing listens.
const PIN = '1.63.0';
const report = {
  suite: 'voice-client-races-browser', passed: 0, failed: 0, skipped: 0,
  browserVersion: null, cases: [], assertions: [], requests: [], denied: [],
  limits: [
    'Synthetic API responses and recognition callbacks; no live services or media devices.',
    'Vocabulary/TTS exercise unchanged shipped modules on minimal DOM hosts, not whole gameplay.',
    'Whole AI-friend and warmup page wiring is exercised; no recognition accuracy or latency claim.',
    'Client account-change handling only; no server authorization or entitlement assertions.'
  ]
};
let browser, currentCase = 'isolation';
await mkdir(OUT, { recursive: true });
function check(name, condition, detail) {
  report.assertions.push({ case: currentCase, name, passed: !!condition, ...(detail === undefined ? {} : { detail }) });
  if (condition) { report.passed++; console.log('PASS ' + name); }
  else { report.failed++; throw new Error(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail))); }
}
const json = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });
function hold() { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; }
async function eventually(name, predicate, timeout = 12000) {
  const end = Date.now() + timeout;
  do { if (await predicate()) return; await new Promise(r => setTimeout(r, 30)); } while (Date.now() < end);
  throw new Error('Timed out: ' + name);
}
async function drain(page) {
  await page.evaluate(() => new Promise(done => {
    const channel = new MessageChannel(); let turns = 0;
    channel.port1.onmessage = () => {
      if (++turns === 2) { channel.port1.close(); channel.port2.close(); done(); }
      else channel.port2.postMessage(null);
    };
    channel.port2.postMessage(null);
  }));
}
function silentWav(seconds = 20) {
  const samples = 8000 * seconds, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  return bytes; // PCM silence, generated here; no recorded voice or other media.
}
const WAV = silentWav();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };

async function fixture(name, api = async () => null, { clock = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
  context.setDefaultTimeout(12000);
  const state = { context, page: null, requests: [], pageErrors: [], routeErrors: [] };
  if (clock) await context.clock.install();
  await context.addInitScript(({ base }) => {
    if (location.origin !== base) return;
    window.__mediaRequests = 0;
    const forbidMedia = () => { window.__mediaRequests++; return Promise.reject(new Error('Fixture forbids media devices')); };
    if (navigator.mediaDevices) {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: forbidMedia });
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: forbidMedia });
    }
    // Device speech services are never reached, even if a shipped page falls back.
    window.__deviceSpeech = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, pending: false, getVoices: () => [], cancel() {},
      speak(utterance) { window.__deviceSpeech.push(utterance); queueMicrotask(() => utterance.onend?.()); }
    } });
    window.__recognitions = [];
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      constructor() { this.starts = 0; this.stops = 0; window.__recognitions.push(this); }
      start() { this.starts++; this.onstart?.(); }
      stop() { this.stops++; this.onend?.(); }
      abort() { this.stops++; }
    };
    window.__storageEvents = [];
    addEventListener('storage', event => window.__storageEvents.push({ key: event.key, trusted: event.isTrusted }));
    window.__createdUrls = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { const value = create(blob); window.__createdUrls.push(value); return value; };
    localStorage.setItem('mangoi_lang', 'en');
    localStorage.setItem('mangoi_warmup_level', '3');
    // This non-credential fixture value is consumed locally. No login is tested.
    sessionStorage.setItem('mango_guest_chat', JSON.stringify({ uid: 'guest_fixture', token: 'synthetic-unused-token' }));
  }, { base: BASE });
  context.on('page', page => {
    page.on('pageerror', error => state.pageErrors.push(String(error)));
    page.on('console', message => {
      if (message.type() === 'error') console.error('BROWSER ' + name + ': ' + message.text());
    });
  });
  await context.routeWebSocket('**/*', socket => {
    report.denied.push({ case: name, kind: 'websocket' });
    socket.close({ code: 1008, reason: 'Offline fixture' });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    try {
      if (url.origin !== BASE) {
        report.denied.push({ case: name, kind: 'nonlocal', origin: url.origin });
        return await route.abort('blockedbyclient');
      }
      if (url.pathname.startsWith('/api/')) {
        const record = { case: name, method, path: url.pathname + url.search, body: request.postData() || null };
        state.requests.push(record); report.requests.push(record);
        const answer = await api({ route, request, url, method, record });
        if (answer === true) return; // Explicit fixture already aborted this request.
        if (answer) return await route.fulfill(answer);
        // Ancillary reads/writes never escape and never receive invented success.
        report.denied.push({ case: name, kind: 'unconfigured-api', method, path: url.pathname });
        return await route.fulfill(json({ ok: false, error: 'offline_fixture_not_configured' }, 503));
      }
      if (method !== 'GET' && method !== 'HEAD') return await route.abort('blockedbyclient');
      if (url.pathname === '/__fixture_peer.html') return await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage peer</title>' });
      if (url.pathname === '/__fixture_components.html') return await route.fulfill({ contentType: 'text/html', body:
        '<!doctype html><title>Unchanged shared client modules</title><script src="/js/game-vocab.js?v=2"></script><script src="/js/game-tts.js?v=7"></script>' });
      // Do not load shipped videos/audio; only the generated WAV above is used.
      if (/\.(mp3|mp4|webm|ogg|wav)$/i.test(url.pathname)) {
        report.denied.push({ case: name, kind: 'nonfixture-media', path: url.pathname });
        return await route.abort('blockedbyclient');
      }
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) return await route.abort('blockedbyclient');
      const candidate = resolve(PUBLIC, '.' + decoded);
      if (!candidate.startsWith(PUBLIC + sep)) return await route.abort('blockedbyclient');
      let file;
      try { file = await realpath(candidate); } catch { return await route.fulfill({ status: 404, body: 'Missing offline static file' }); }
      if (!file.startsWith(PUBLIC + sep)) return await route.abort('blockedbyclient');
      // Never continue/fallback: all response bytes come from checkout or fixtures.
      return await route.fulfill({ contentType: MIME[extname(file)] || 'application/octet-stream',
        body: method === 'HEAD' ? '' : await readFile(file) });
    } catch (error) {
      if (!/closed|Target page|Invalid InterceptionId|already handled|canceled/i.test(String(error))) {
        state.routeErrors.push(String(error));
        try { await route.abort('failed'); } catch {}
      }
    }
  });
  state.page = await context.newPage();
  return state;
}
async function runCase(name, fn) {
  currentCase = name;
  const item = { name, passed: false, assertions: 0 }; report.cases.push(item);
  const start = report.assertions.length;
  let state;
  try {
    await fn(async (...args) => (state = await fixture(name, ...args)));
    check(name + ': no browser script errors', state.pageErrors.length === 0, state.pageErrors);
    check(name + ': no routing errors', state.routeErrors.length === 0, state.routeErrors);
    check(name + ': no media-device requests', await state.page.evaluate(() => __mediaRequests === 0));
    item.passed = true;
  } catch (error) {
    item.error = String(error);
    if (!report.assertions.slice(start).some(a => !a.passed)) {
      report.failed++;
      report.assertions.push({ case: name, name: 'case completes', passed: false, detail: String(error) });
    }
    console.error('FAIL ' + name + ': ' + String(error));
    if (state?.page && !state.page.isClosed()) {
      try { await state.page.screenshot({ path: resolve(OUT, name + '-failure.png'), fullPage: true, timeout: 5000 }); } catch {}
      try { await writeFile(resolve(OUT, name + '-failure.html'), await state.page.content()); } catch {}
    }
  } finally {
    item.assertions = report.assertions.length - start;
    if (state) {
      item.pageErrors = state.pageErrors; item.routeErrors = state.routeErrors;
      await state.context.close();
    }
  }
}

try {
  const interfaces = (await readFile('/proc/self/net/dev', 'utf8')).trim().split('\n').slice(2)
    .map(line => line.trim().split(':')[0]).sort();
  check('namespace contains ONLY loopback', JSON.stringify(interfaces) === '["lo"]', interfaces);
  const routes = (await readFile('/proc/net/route', 'utf8')).trim().split('\n').slice(1);
  check('namespace has no IPv4 default route', !routes.some(line => line.trim().split(/\s+/)[1] === '00000000'));
  const v6routes = (await readFile('/proc/net/ipv6_route', 'utf8')).trim().split('\n').filter(Boolean);
  check('namespace has no usable IPv6 default route', !v6routes.some(line => {
    const fields = line.trim().split(/\s+/);
    return fields[0] === '0'.repeat(32) && fields[1] === '00' && !(parseInt(fields[8], 16) & 0x200);
  }));
  assert(process.env.PW_DIR, 'PW_DIR must point to the isolated pinned tool installation');
  const require = createRequire(import.meta.url);
  check('Playwright is exactly ' + PIN, require(resolve(process.env.PW_DIR, 'node_modules/playwright-core/package.json')).version === PIN);
  const { chromium } = require(resolve(process.env.PW_DIR, 'node_modules/playwright-core'));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  report.browserVersion = browser.version();

  await runCase('vocabulary-storage-races', async open => {
    const held = [];
    const state = await open(async ({ url, route }) => {
      if (url.pathname !== '/api/games/vocab') return null;
      const latch = hold(); latch.uid = url.searchParams.get('user_id'); held.push(latch);
      await latch.promise;
      if (latch.failure) { await route.abort('failed'); return true; }
      return json({ ok: true, student_name: latch.uid,
        words: [{ en: latch.uid === 'fixture_A' ? 'apple' : 'banana', ko: 'fixture fruit' }] });
    });
    const { page, context } = state;
    await page.goto(BASE + '/__fixture_components.html');
    const peer = await context.newPage(); await peer.goto(BASE + '/__fixture_peer.html');
    async function switchTo(uid) {
      await peer.evaluate(value => {
        if (value) localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: value }));
        else localStorage.removeItem('mangoi_logged_user');
      }, uid);
      await page.waitForFunction(value => MangoiGameVocab.getUserId() === value, uid);
    }
    await switchTo('fixture_A');
    check('cross-tab account change produces trusted browser storage event', await page.evaluate(() =>
      __storageEvents.some(event => event.key === 'mangoi_logged_user' && event.trusted)));
    check('same-owner pending loads share one Promise', await page.evaluate(() => {
      window.__vocabA = MangoiGameVocab.load(); return __vocabA === MangoiGameVocab.load();
    }));
    await eventually('A request', () => held.length === 1);
    await switchTo('fixture_B');
    check('new account has its own pending Promise', await page.evaluate(() => {
      window.__vocabB = MangoiGameVocab.load(); return __vocabB !== __vocabA;
    }));
    await eventually('B request', () => held.length === 2);
    check('actual fetches retain their initiating owner', held[0].uid === 'fixture_A' && held[1].uid === 'fixture_B');
    // B wins first; late A must neither deliver nor overwrite the native cache.
    held[1].release();
    check('B receives its own result', await page.evaluate(async () => (await __vocabB).student === 'fixture_B'));
    held[0].release();
    check('late A response is discarded', await page.evaluate(async () => await __vocabA === null));
    check('late A cannot replace B sessionStorage cache', await page.evaluate(() => {
      const cache = JSON.parse(sessionStorage.getItem('mangoi_game_vocab_v1'));
      return cache.uid === 'fixture_B' && cache.data.student === 'fixture_B';
    }));
    check('B reuses its cache without another request', await page.evaluate(async () => (await MangoiGameVocab.load()).student === 'fixture_B') && held.length === 2);
    // Earlier owner's failure must leave the current owner's in-flight Promise intact.
    await page.evaluate(() => sessionStorage.removeItem('mangoi_game_vocab_v1'));
    await switchTo('fixture_A'); await page.evaluate(() => { window.__vocabA = MangoiGameVocab.load(); });
    await eventually('second A request', () => held.length === 3);
    await switchTo('fixture_B'); await page.evaluate(() => { window.__vocabB = MangoiGameVocab.load(); });
    await eventually('second B request', () => held.length === 4);
    held[2].failure = true; held[2].release(); await page.evaluate(() => __vocabA);
    check('old failure cannot clear current in-flight state', await page.evaluate(() => MangoiGameVocab.load() === __vocabB) && held.length === 4);
    await switchTo(''); held[3].release();
    check('logout discards pending response', await page.evaluate(async () => await __vocabB === null));
    check('logout leaves no personal cache or load result', await page.evaluate(async () =>
      sessionStorage.getItem('mangoi_game_vocab_v1') === null && await MangoiGameVocab.load() === null));
  });

  await runCase('tts-native-playback-races', async open => {
    const old = hold(); let oldReached = false;
    const state = await open(async ({ url, request }) => {
      if (url.pathname !== '/api/voice/tts') return null;
      if (request.postDataJSON().text === 'Old delayed fixture.') { oldReached = true; await old.promise; }
      return { status: 200, contentType: 'audio/wav', body: WAV };
    });
    const { page } = state;
    await page.goto(BASE + '/__fixture_components.html');
    await page.evaluate(() => {
      window.__tts = { done: [], plays: 0 };
      MangoiTTS.getAudioEl().muted = true;
      MangoiTTS.getAudioEl().addEventListener('playing', () => __tts.plays++);
      MangoiTTS.prefetch('Cached fixture.');
    });
    await page.waitForFunction(() => __createdUrls.length === 1);
    await page.evaluate(() => MangoiTTS.speak('Old delayed fixture.', 1, () => __tts.done.push('old')));
    await eventually('held old TTS request', () => oldReached);
    await page.evaluate(() => MangoiTTS.speak('Cached fixture.', 1, () => __tts.done.push('cached')));
    await page.waitForFunction(() => __tts.plays === 1 && MangoiTTS.getAudioEl().currentTime > 0);
    const cachedSource = await page.evaluate(() => MangoiTTS.getAudioEl().src);
    check('cached speech starts real muted HTMLAudioElement', await page.evaluate(() =>
      MangoiTTS.getAudioEl() instanceof HTMLAudioElement && MangoiTTS.getAudioEl().muted && MangoiTTS.busy()));
    old.release(); await page.waitForFunction(() => __createdUrls.length === 2); await drain(page);
    check('late cloud result cannot replace cached playback source', await page.evaluate(() => MangoiTTS.getAudioEl().src) === cachedSource);
    check('late cloud result neither replays nor completes current speech', await page.evaluate(() => __tts.plays === 1 && __tts.done.length === 0 && MangoiTTS.busy()));
    await page.evaluate(() => {
      window.__staleEnded = MangoiTTS.getAudioEl().onended;
      MangoiTTS.stop();
      MangoiTTS.speak('New current fixture.', 1, () => __tts.done.push('new'));
    });
    await page.waitForFunction(() => __tts.plays === 2 && MangoiTTS.getAudioEl().currentTime > 0);
    check('queued canceled native completion cannot finish new speech', await page.evaluate(() => {
      __staleEnded(); return MangoiTTS.busy() && !MangoiTTS.getAudioEl().paused && __tts.done.length === 0;
    }));
    await page.evaluate(() => { const audio = MangoiTTS.getAudioEl(); audio.currentTime = audio.duration - 0.05; });
    await page.waitForFunction(() => __tts.done.length === 1);
    check('actual ended event completes only current speech once', await page.evaluate(() =>
      __tts.done.join(',') === 'new' && MangoiTTS.getAudioEl().ended && !MangoiTTS.busy()));
    check('shared TTS used exactly three synthetic requests', state.requests.filter(r => r.path === '/api/voice/tts').length === 3);
    check('shared TTS never invoked device speech fallback', await page.evaluate(() => __deviceSpeech.length === 0));
  });

  await runCase('ai-stream-interruption', async open => {
    const state = await open(async ({ url }) => {
      if (url.pathname === '/api/ai/chat-history') return json({ ok: true, items: [] });
      if (url.pathname === '/api/voice/tts') return { status: 200, contentType: 'audio/wav', body: WAV };
      return null;
    });
    const { page } = state;
    await page.goto(BASE + '/ai-friend.html');
    await page.waitForFunction(() => window.MangoiTTS && window.FriendAutoTalk && document.querySelector('#chat .empty-state'));
    await page.evaluate(async () => {
      await friendRatePreference.ready;
      stopSpeakingNow();
      window.__streamCalls = [];
      const original = window.fetch;
      window.fetch = function (input, options) {
        if (new URL(typeof input === 'string' ? input : input.url, location.href).pathname !== '/api/ai/chat-friend') return original.apply(this, arguments);
        const record = { signal: options.signal, canceled: 0, text: JSON.parse(options.body).msg };
        __streamCalls.push(record);
        // Intentionally ignores AbortSignal to model a delayed queued callback.
        // Native browser Response/ReadableStream execute unchanged stmRead logic.
        return Promise.resolve(new Response(new ReadableStream({
          start(controller) { record.controller = controller; },
          cancel() { record.canceled++; }
        }), { headers: { 'Content-Type': 'text/event-stream' } }));
      };
    });
    await page.locator('#msgInput').fill('Fixture interrupted question.');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => __streamCalls.length === 1 && !!_friendRequestAbort);
    check('pending stream disables duplicate send', await page.locator('#sendBtn').isDisabled());
    await page.locator('#msgInput').fill('Keep my new draft.'); // Real typing-barge event.
    check('typing interruption aborts the pending request', await page.evaluate(() => __streamCalls[0].signal.aborted));
    await page.evaluate(() => __streamCalls[0].controller.enqueue(new TextEncoder().encode('data: {"t":"LATE CANCELED FIXTURE."}\n\n')));
    await page.waitForFunction(() => __streamCalls[0].canceled === 1 && !document.getElementById('sendBtn').disabled);
    await drain(page);
    check('late stream chunk creates no preview, reply or error bubble', await page.evaluate(() =>
      !document.querySelector('#chat .stm-preview') && document.querySelectorAll('#chat .ai-row').length === 0 &&
      !document.getElementById('chat').textContent.includes('LATE CANCELED FIXTURE')));
    check('late stream chunk never starts TTS', !state.requests.some(r => r.path === '/api/voice/tts'));
    check('interruption preserves newly typed draft', await page.locator('#msgInput').inputValue() === 'Keep my new draft.');
    // Positive control: a later complete response must still render normally.
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => __streamCalls.length === 2);
    await page.evaluate(() => {
      const next = __streamCalls[1].controller;
      next.enqueue(new TextEncoder().encode('data: {"done":true,"ok":true,"reply":"Current fixture reply."}\n\n'));
      next.close();
    });
    await page.waitForFunction(() => !document.getElementById('sendBtn').disabled && document.querySelector('#chat .ai-row'));
    check('next turn renders exactly one current AI reply', await page.locator('#chat .ai-row').count() === 1 &&
      (await page.locator('#chat').innerText()).includes('Current fixture reply.'));
    check('next turn consumes preserved draft once', await page.evaluate(() => __streamCalls[1].text === 'Keep my new draft.'));
    await page.evaluate(() => stopSpeakingNow());
  });

  await runCase('warmup-recognition-interruption', async open => {
    const state = await open(async ({ url }) => {
      if (url.pathname === '/api/warmup/chat') return json({ ai_response: 'Current synthetic reply.', answer_chips: [] });
      if (url.pathname === '/api/voice/tts') return { status: 200, contentType: 'audio/wav', body: WAV };
      return null;
    }, { clock: true });
    const { page } = state;
    await page.goto(BASE + '/warmup.html?setup=0');
    await page.waitForFunction(() => document.querySelector('#log .msg.ai') && window.MangoiVoice);
    await page.evaluate(() => { _speechOn = false; _stopSpeak(); });
    const initialPosts = state.requests.filter(r => r.path === '/api/warmup/chat').length;
    await page.locator('#micBtn').click();
    await page.waitForFunction(() => __recognitions.length === 1 && _recognizing);
    check('mic button starts only synthetic recognition', await page.evaluate(() => __recognitions[0].starts === 1 && __mediaRequests === 0));
    await page.evaluate(() => {
      window.__oldRecognition = __recognitions[0];
      __oldRecognition.onresult({ results: [[{ transcript: 'I want to' }]] });
    });
    check('current synthetic recognition updates actual input', await page.locator('#inp').inputValue() === 'I want to');
    await page.evaluate(() => { _micAbortQuiet(); document.getElementById('inp').value = 'Keep this draft.'; });
    await page.evaluate(() => {
      __oldRecognition.onresult({ results: [[{ transcript: 'LATE CANCELED TRANSCRIPT' }]] });
      __oldRecognition.onerror({ error: 'network' });
      __oldRecognition.onend();
    });
    await page.clock.fastForward(6000); await drain(page);
    check('canceled recognition cannot overwrite actual draft', await page.locator('#inp').inputValue() === 'Keep this draft.');
    check('late error/end cannot restart recognition or leave listening active', await page.evaluate(() =>
      __recognitions.length === 1 && __oldRecognition.starts === 1 && !_recognizing && !_whisperOn));
    check('canceled recognition cannot submit a stale answer', state.requests.filter(r => r.path === '/api/warmup/chat').length === initialPosts);
    // A new capture must work even if callbacks from the old object arrive again.
    await page.locator('#micBtn').click();
    await page.waitForFunction(() => __recognitions.length === 2 && _recognizing);
    await page.evaluate(() => {
      __recognitions[1].onresult({ results: [[{ transcript: 'Current fixture answer.' }]] });
      __oldRecognition.onresult({ results: [[{ transcript: 'OLDER CALLBACK' }]] });
      __oldRecognition.onend();
    });
    check('old callback cannot overwrite or stop newer capture', await page.evaluate(() =>
      document.getElementById('inp').value === 'Current fixture answer.' && _recognizing));
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => !sending && document.querySelector('#log .msg.me'));
    check('manual send of current capture reaches synthetic endpoint once', state.requests.filter(r =>
      r.path === '/api/warmup/chat' && JSON.parse(r.body || '{}').student_input === 'Current fixture answer.').length === 1);
    check('manual send releases recognition and controls', await page.evaluate(() => !_recognizing && !document.getElementById('sendBtn').disabled));
  });
  currentCase = 'completion';
  check('all four distinct coverage cases executed', report.cases.length === 4);
} catch (error) {
  report.fatal = String(error);
  if (!report.failed) {
    report.failed++;
    report.assertions.push({ case: currentCase, name: 'suite completes', passed: false, detail: String(error) });
  }
  console.error(error);
} finally {
  if (browser) await browser.close();
  await writeFile(resolve(OUT, 'fixture-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  console.log(`${report.suite}: PASS ${report.passed} / FAIL ${report.failed} / SKIP ${report.skipped}`);
  process.exitCode = report.failed ? 1 : 0;
}
