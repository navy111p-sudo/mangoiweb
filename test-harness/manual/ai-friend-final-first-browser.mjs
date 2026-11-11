// ⚡ A.i 친구하기 «최종 답 먼저» · 입모양 엔진(2026-11-09 다시 켬) — 실제 크로미움에서 진짜 ai-friend.html 로 잰다 (2026-11-06)
//    Real page, real sendMsg/stmRead, a local SSE server that sends `final` at 0.1s and `done` at 1.5s.
//    자동으로 안 돕니다 — 사람이 부릅니다:
//      PW_DIR=/opt/node22/lib node test-harness/manual/ai-friend-final-first-browser.mjs
//    (CHROMIUM_PATH 를 주면 그 브라우저로 — 없으면 Playwright 기본)
//    OLD_FINAL=1 이면 서버가 final 을 «안» 보낸다 = 고치기 전 서버(짝: 그때는 done 까지 기다린다)
//    VIS_OFF=1 이면 ?visemes=off 로 연다(끄기 스위치 검사 — 그때는 일꾼 요청 0)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require((process.env.PW_DIR || '/opt/node22/lib') + '/node_modules/playwright');
const root = resolve('cloudflare-deploy/public');
const FINAL_MS = 100, DONE_MS = 1500;
const REPLY = 'You can say... "I like pizza." I like pizza. I like pizza. Can you say it with me?';
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const workerHits = [];
const server = createServer(async (req, res) => {
  const p = new URL(req.url, 'http://local').pathname;
  if (p.includes('avatar-viseme-worker')) workerHits.push(p);
  if (p === '/api/ai/chat-friend') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' });
    const body = { ok: true, reply: REPLY, fix: { was: 'I like pizza', now: 'I like pizza.', why_ko: '마침표', tag: 'other', severity: 'minor' }, repeat: true, replaced: 0 };
    if (!process.env.OLD_FINAL) setTimeout(() => res.write('data: ' + JSON.stringify({ final: 1, ...body }) + '\n\n'), FINAL_MS);
    setTimeout(() => { res.write('data: ' + JSON.stringify({ done: 1, ...body, gam: { awarded: 2 } }) + '\n\n'); res.end(); }, DONE_MS);
    return;
  }
  if (p.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, items: [], uid: 'guest_probe', token: 'test.token' })); return; }
  try {
    const f = resolve(root, '.' + p);
    if (!f.startsWith(root + sep)) throw Error('path');
    res.setHeader('Content-Type', TYPES[extname(f)] || 'application/octet-stream');
    res.end(await readFile(f));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
let failures = 0;
try {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e && e.message || e)));
  const visOff = !!process.env.VIS_OFF;
  await p.goto('http://127.0.0.1:' + server.address().port + '/ai-friend.html' + (visOff ? '?visemes=off' : ''));
  await p.waitForFunction(() => window.MangoiTTS && window.AvatarVisemes && typeof sendMsg === 'function', null, { timeout: 15000 });
  const r = await p.evaluate(async () => {
    const t = { spoke: [], gam: null };
    localStorage.setItem('mangoi_aifriend_sound', '1');
    MangoiTTS.speak = (text, rate, done) => { t.spoke.push({ at: performance.now() - t0, text }); setTimeout(done, 30); };
    MangoiTTS.stop = () => {};
    const ag = window.applyGam; window.applyGam = function (g, v) { t.gam = performance.now() - t0; try { return ag && ag(g, v); } catch (e) {} };
    document.getElementById('msgInput').value = 'I like pizza';
    const t0 = performance.now();
    await sendMsg();
    await _stmChain;
    /* 켠 상태의 prepare('blob:none') 은 진짜 엔진을 기다리므로 부르지 않는다 — boot 만 보고 일꾼 요청으로 가른다. */
    const vis = new URLSearchParams(location.search).get('visemes') === 'off' ? await AvatarVisemes.prepare('blob:none') : 'skipped';
    AvatarVisemes.boot();
    return { spoke: t.spoke, gam: t.gam, vis, rows: document.querySelectorAll('.ai-row').length };
  });
  await new Promise(res => setTimeout(res, 400));   // boot 이 일꾼을 띄웠다면 그 요청이 들어올 시간
  const first = r.spoke[0];
  const old = !!process.env.OLD_FINAL;
  console.log(JSON.stringify({ old, firstSpeechMs: first && Math.round(first.at), spoke: r.spoke.length, gamMs: r.gam && Math.round(r.gam), rows: r.rows, vis: r.vis, workerHits, errors }));
  const ok = (name, cond) => { if (cond) console.log('PASS ' + name); else { failures++; console.log('FAIL ' + name); } };
  if (old) ok('짝(고치기 전 서버): done(' + DONE_MS + 'ms)까지 기다렸다 읽는다', first && first.at >= DONE_MS - 50);
  else ok('final(' + FINAL_MS + 'ms)을 받자마자 읽는다 — done(' + DONE_MS + 'ms)을 안 기다림', first && first.at < 700);
  ok('정본 답을 한 번만 읽는다', r.spoke.length === 1 && r.spoke[0].text.indexOf('I like pizza') >= 0);
  ok('포인트는 done 뒤', r.gam != null && r.gam >= DONE_MS - 50);
  if (visOff) {
    ok('?visemes=off: prepare 는 null (분석 없음)', r.vis === null);
    ok('?visemes=off: 입모양 분석 일꾼(28.7MB 모델)을 띄우지 않는다', workerHits.length === 0);
  } else {
    ok('기본(2026-11-09 다시 켬): 입모양 분석 일꾼을 띄운다', workerHits.length > 0);
  }
  ok('페이지 오류 0건', errors.length === 0);
} finally { await browser.close(); server.close(); }
if (failures) process.exit(1);
