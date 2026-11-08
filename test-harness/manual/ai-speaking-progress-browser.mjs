// Actual shipped pages, deterministic API/audio doubles, localhost only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPlaywright, findChromium } from './_pw.mjs';

const pw = loadPlaywright(); assert.ok(pw, 'Install browser tools outside the repository and set PW_DIR');
const root = resolve('cloudflare-deploy/public');
const output = process.env.ARTIFACT_DIR || join(tmpdir(), 'mangoi-speaking-progress-browser');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
    assert.ok(file.startsWith(root + sep));
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || findChromium() || undefined, args: ['--no-sandbox'] });
let checks = 0;
function check(value, name) { assert.ok(value, name); checks++; console.log('PASS ' + name); }
try {
  for (const width of [390, 1360]) for (const app of ['friend', 'warmup']) for (const state of ['partial', 'zero', 'unavailable']) {
    const name = `${width}/${app}/${state}`, posts = [], errors = [];
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'progress-local', name: 'Local student', role: 'student' }));
      localStorage.setItem('mango_token', btoa(JSON.stringify({ uid: 'progress-local', exp: Date.now() + 3600000 })) + '.local-only');
      localStorage.setItem('mangoi_lang', 'en'); localStorage.setItem('mangoi_warmup_level', '3');
      localStorage.setItem('mangoi_aifriend_talk_mode', 'button');
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (/\/js\/mango-avatar\.js/.test(url.pathname)) return route.fulfill({ contentType: 'application/javascript', body: 'window.MangoAvatar={attach(){},plainStart(){},plainStop(){},setCharacter(){}};' });
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const body = route.request().postDataJSON();
      const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname === '/api/ai/speaking-progress') {
        posts.push(body);
        if (body.action === 'start') return send({ ok: true, sessionId: 'local-session-' + name });
        return send({ ok: true, result: {
          lessonId:body.sessionId, finishedNormally: true, score: state === 'zero' ? 0 : null,
          skills: state === 'unavailable' ? {} : state === 'zero' ? { pronunciation:0,fluency:0,grammar:0,vocabulary:0,sentence:0 } : { grammar:85,vocabulary:85,sentence:85 },

          uniqueWords: ['i', 'like', 'apples'], reviewWords: ['<img onerror="window.progressXss=1">'], recordedTurns: 1,
          evaluationStatus: state === 'unavailable' ? 'unavailable' : 'measured',
          rewards: { pointsEarned: 5, pointsBalance: 50, gemsBalance: 30, badges: ['first_class'] }
        } });
      }
      if (url.pathname === '/api/ai/chat-friend' || url.pathname === '/api/warmup/chat') {
        posts.push({ chat: true, ...body });
        return send({ ok: true, reply: 'Great! Which fruit do you like?', ai_response: 'Great! Which fruit do you like?', session_id: body.session_id, turn_count: 1, gam: null });
      }
      if (url.pathname === '/api/points/earn-by-rule') { posts.push({ award: true, ...body }); return send({ ok: true, signed: 5, newBalance: 50 }); }
      return send({ ok: true, items: [], voices: [], books: [] });
    });
    const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', error => errors.push(String(error)));
    try {
      await page.goto(origin + (app === 'friend' ? '/ai-friend.html' : '/warmup.html?setup=0'), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.AiSpeakingProgress);
      await page.evaluate(() => {
        if (window.MangoiTTS) { MangoiTTS.speak = (_, __, done) => { if (typeof done === 'function') done(); }; MangoiTTS.stop = () => {}; }
      });
      check(posts.filter(p => p.action === 'finish').length === 0, name + ': page load does not finish/evaluate');
      await page.locator(app === 'friend' ? '#msgInput' : '#inp').fill('I like apples.');
      await page.locator('#sendBtn').click();
      await page.waitForFunction(() => !document.getElementById('sendBtn').disabled);
      const chat = posts.find(p => p.chat && !p.kickoff);
      check(!!chat?.progress_session && !!chat?.progress_turn, name + ': actual send carries server session and replay key');
      check(posts.filter(p => p.action === 'start').length === 1, name + ': one session per practice');
      if(app === 'friend') {
        const box = await page.locator('.ai-progress-trigger').boundingBox();
        check(box && box.height <= 55 && box.x >= 0 && box.x + box.width <= width, name + ': results action stays horizontal and reachable');
      }
      await page.locator(app === 'friend' ? '.ai-progress-trigger' : '#wgFinish').click();
      await page.locator('.ai-progress-title').waitFor();
      const content = await page.locator('.ai-progress-card').innerText();
      check(content.includes(state === 'zero' ? '0/100' : 'Overall score unavailable'), name + ': measured/zero/missing result renders');
      check((await page.locator('.ai-progress-skill').count()) === 5, name + ': all five skill rows are visible');
      check((await page.locator('.ai-progress-skill dd').allTextContents()).filter(x => x === 'Not measured').length >= (state === 'zero' ? 0 : 2), name + ': no fabricated acoustic score');
      check(content.includes('Points earned in this practice: 5P') && content.includes('Gem balance at completion: 30'), name + ': actual wallet is separately shown');
      check((await page.locator('.ai-progress-card img').count()) === 0 && !await page.evaluate(() => window.progressXss), name + ': words cannot inject markup');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': no horizontal page overflow');
      await page.evaluate(() => { localStorage.setItem('mangoi_lang', 'ko'); window.dispatchEvent(new Event('mangoi:lang-changed')); });
      check((await page.locator('.ai-progress-card').innerText()).includes('오늘의 말하기 성장'), name + ': language changes repaint results');
      await page.screenshot({ path: join(output, `${width}-${app}-${state}.png`), fullPage: false });
      await page.locator(app === 'friend' ? '.ai-progress-close' : '#wgSummaryBack').click();
      await page.locator(app === 'friend' ? '.ai-progress-trigger' : '#wgFinish').click();
      check(posts.filter(p => p.action === 'finish').length === 1, name + ': reopening does not request evaluation again');
      check(posts.filter(p => p.award).length === (app === 'warmup' ? 1 : 0), name + ': reopening adds no award request');
      check(errors.length === 0, name + ': no browser exceptions: ' + errors.join(';'));
    } catch (error) { await page.screenshot({ path: join(output, `FAIL-${width}-${app}-${state}.png`) }); throw error; }
    finally { await context.close(); }
  }
  console.log(JSON.stringify({ checks, failures: 0, viewports: [390, 1360], scope: 'actual pages with synthetic API/audio responses; server SQL covered separately' }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
