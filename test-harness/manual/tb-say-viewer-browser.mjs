// -*- coding: utf-8 -*-
// 🔊 교재 뷰어(textbook-viewer.html) 안의 «이 쪽 문장 듣기» 브라우저 검사
//   자동으로 안 돕니다 — 사람이 부릅니다:  PW_DIR=/tmp/pw node test-harness/manual/tb-say-viewer-browser.mjs
//   진짜 textbook-viewer.html · idx-vc-tbsay.js · data/tb-say 를 그대로 싣고, 서버 API(교재 목록·TTS)만 흉내 낸다.
//   짝으로 본다: «새 BTS 문장 쪽이면 보인다» ↔ «표지·옛 교재면 안 보인다», «누르면 묻는다» ↔ «누르기 전엔 안 묻는다».
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const VIEWER = process.env.VIEWER_SRC || join(PUB, 'textbook-viewer.html');
const { chromium, exe } = requireBrowser();

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); } };
function wav() {
  const n = 800, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const d1 = JSON.parse(readFileSync(join(PUB, 'data', 'tb-say', 'bts-01.json'), 'utf8'));
const BOOK = 'BTS 1 001 (Welcome to school)';
const COVER = `[${BOOK}] New / Slide1.JPG`;          // 표지 — 문장 없음
const WITH = `[${BOOK}] New / Slide4.JPG`;           // 문장 있는 쪽
ok('전제: 표지는 데이터에 없다', !(COVER in d1));
ok('전제: Slide4 에 문장이 있다', !!(d1[WITH] && d1[WITH].length));
const ITEMS = [COVER, WITH].map((n, i) => ({ id: i + 1, name: n, kind: 'image', size_bytes: 68, url: '/img-' + (i + 1) + '.png' }));
const OLDBOOK = 'BTS 9 Old';
const OLD_ITEMS = [{ id: 9, name: `[${OLDBOOK}] 미분류 레슨 / Slide4.JPG`, kind: 'image', size_bytes: 68, url: '/img-9.png' }];

const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
async function run(book, items, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const tts = [];
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.route('http://t.local/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/textbook-viewer.html') return route.fulfill({ contentType: 'text/html', body: readFileSync(VIEWER, 'utf8') });
    if (u.pathname === '/api/textbook-files') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, items }) });
    if (u.pathname === '/api/voice/tts') { tts.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ contentType: 'audio/wav', headers: { 'X-TTS-Speaker': 'asteria' }, body: wav() }); }
    if (/^\/img-\d+\.png$/.test(u.pathname)) return route.fulfill({ contentType: 'image/png', body: PNG });
    if (u.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
    const f = join(PUB, u.pathname);
    if (existsSync(f)) return route.fulfill({ contentType: extname(f) === '.js' ? 'application/javascript' : extname(f) === '.json' ? 'application/json' : extname(f) === '.css' ? 'text/css' : 'application/octet-stream', body: readFileSync(f) });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://t.local/textbook-viewer.html?book=' + encodeURIComponent(book));
  await page.waitForTimeout(1200);
  return { ctx, page, tts, errs };
}
const vis = (page) => page.evaluate(() => { const b = document.getElementById('tbs-btn'); if (!b) return 'none'; return getComputedStyle(b).display === 'none' ? 'hidden' : 'shown'; });

for (const width of [1280, 390]) {
  console.log(`▶ 새 BTS 교재 (${width}px)`);
  const { ctx, page, tts, errs } = await run(BOOK, ITEMS, width);
  ok('표지(첫 쪽)에서는 버튼이 없다', (await vis(page)) !== 'shown', await vis(page));
  await page.click('#btn-next'); await page.waitForTimeout(700);
  ok('문장 있는 쪽으로 넘기면 버튼이 보인다', (await vis(page)) === 'shown', await vis(page));
  ok('누르기 전에는 소리를 한 번도 안 묻는다', tts.length === 0, String(tts.length));
  const hit = await page.evaluate(() => { const b = document.getElementById('tbs-btn').getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el && el.id; });
  ok('버튼이 맨 위에 있어 눌린다', hit === 'tbs-btn', hit);
  await page.click('#tbs-btn'); await page.waitForTimeout(400);
  const rows = await page.$$eval('#tbs-box .tbs-row', r => r.length);
  ok('그 쪽 문장이 목록으로 나온다', rows === d1[WITH].length, rows + ' vs ' + d1[WITH].length);
  const rowHit = await page.evaluate(() => { const r = document.querySelector('#tbs-box .tbs-row').getBoundingClientRect(); const el = document.elementFromPoint(r.x + 20, r.y + r.height / 2); return !!(el && el.closest('#tbs-box')); });
  ok('목록 줄이 다른 것에 안 가려진다', rowHit);
  await page.click('#tbs-box .tbs-row'); await page.waitForTimeout(700);
  ok('문장을 누르면 그 문장을 영어로 묻는다', tts.length >= 1 && tts[0].text === d1[WITH][0][0] && tts[0].lang === 'en', JSON.stringify(tts[0]));
  await page.click('#btn-prev'); await page.waitForTimeout(500);
  ok('표지로 돌아가면 목록이 닫히고 버튼도 사라진다', await page.evaluate(() => getComputedStyle(document.getElementById('tbs-box')).display === 'none') && (await vis(page)) !== 'shown');
  ok('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('▶ 옛 교재');
{
  const { ctx, page, tts } = await run(OLDBOOK, OLD_ITEMS, 1280);
  ok('옛 교재 쪽에서는 버튼이 없다', (await vis(page)) !== 'shown');
  ok('옛 교재에서는 소리를 안 묻는다', tts.length === 0);
  await ctx.close();
}
await browser.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
