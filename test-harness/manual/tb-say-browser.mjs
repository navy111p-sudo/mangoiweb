// -*- coding: utf-8 -*-
// 🔊 수업 교재 «이 쪽 문장 듣기» 브라우저 검사 (js/idx-vc-tbsay.js)
//   자동으로 안 돕니다 — 사람이 부릅니다:  PW_DIR=/tmp/pw node test-harness/manual/tb-say-browser.mjs
//   진짜 파일(js·data)을 그대로 싣고, 수업 화면 교재 칸만 작은 fixture 로 흉내 낸다.
//   짝으로 본다: «새 BTS 쪽이면 보인다» ↔ «옛 교재·문장 없는 쪽이면 안 보인다»,
//               «누르면 서버에 그 문장을 묻는다» ↔ «누르기 전에는 한 번도 안 묻는다».
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const JS_SRC = process.env.TBSAY_SRC || join(PUB, 'js', 'idx-vc-tbsay.js');
const { chromium, exe } = requireBrowser();

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); } };

// 0.1초 무음 WAV
function wav() {
  const n = 800, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
const d1 = JSON.parse(readFileSync(join(PUB, 'data', 'tb-say', 'bts-01.json'), 'utf8'));
const WITH = Object.keys(d1)[0];                              // 문장이 있는 새 BTS 쪽
const WITHOUT = '[BTS 1 001 (Welcome to school)] New / Slide1.JPG';   // 표지 — 문장 없음
const OLD = '[BTS 1 001 (Welcome to school)] 미분류 레슨 / Slide1.JPG';
ok('전제: 표지 쪽은 데이터에 없다', !(WITHOUT in d1));
ok('전제: 문장 있는 쪽이 있다', !!(WITH && d1[WITH].length));

const FIX = `<!doctype html><meta charset="utf-8"><body>
<div id="tab-pdf" style="position:relative;width:900px;height:600px">
  <div style="height:40px">toolbar</div>
  <div id="pdf-scroll-wrap" style="height:540px;background:#ddd"></div>
</div>
<script>
  window._vcShownPdfName = ''; window._vcShownPdfUrl = '';
  window.pdfRender = async function(){ return 1; };
  window.showPage = function(name){ window._vcShownPdfName = name; return window.pdfRender(); };
</script>
<script src="/js/idx-vc-tbsay.js"></script></body>`;

const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const tts = [];
await page.route('http://t.local/**', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/fix.html') return route.fulfill({ contentType: 'text/html', body: FIX });
  if (u.pathname === '/js/idx-vc-tbsay.js') return route.fulfill({ contentType: 'application/javascript', body: readFileSync(JS_SRC, 'utf8') });
  if (u.pathname.startsWith('/data/tb-say/')) return route.fulfill({ contentType: 'application/json', body: readFileSync(join(PUB, u.pathname), 'utf8') });
  if (u.pathname === '/api/voice/tts') { tts.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ contentType: 'audio/wav', headers: { 'X-TTS-Speaker': 'asteria' }, body: wav() }); }
  return route.fulfill({ status: 404, body: '' });
});
await page.goto('http://t.local/fix.html');
const vis = () => page.evaluate(() => { const b = document.getElementById('tbs-btn'); if (!b) return 'none'; return getComputedStyle(b).display === 'none' ? 'hidden' : 'shown'; });

console.log('▶ 쪽마다 보이기');
await page.evaluate(n => window.showPage(n), OLD); await page.waitForTimeout(300);
ok('옛 교재 쪽에서는 버튼이 없다', (await vis()) !== 'shown');
await page.evaluate(n => window.showPage(n), WITH); await page.waitForTimeout(500);
ok('새 BTS 문장 쪽에서는 버튼이 보인다', (await vis()) === 'shown', await vis());
await page.evaluate(n => window.showPage(n), WITHOUT); await page.waitForTimeout(400);
ok('문장 없는 새 BTS 쪽(표지)에서는 안 보인다', (await vis()) !== 'shown');
ok('누르기 전에는 소리를 한 번도 안 묻는다', tts.length === 0, String(tts.length));

console.log('▶ 누르면');
await page.evaluate(n => window.showPage(n), WITH); await page.waitForTimeout(500);
const top = await page.evaluate(() => { const b = document.getElementById('tbs-btn').getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return el && el.id; });
ok('버튼이 맨 위에 있어 눌린다', top === 'tbs-btn', top);
await page.click('#tbs-btn'); await page.waitForTimeout(300);
const rows = await page.$$eval('#tbs-box .tbs-row', r => r.map(x => x.textContent));
ok('그 쪽 문장이 목록으로 나온다', rows.length === d1[WITH].length, rows.length + ' vs ' + d1[WITH].length);
await page.click('#tbs-box .tbs-row'); await page.waitForTimeout(600);
ok('문장을 누르면 서버에 그 문장을 영어로 묻는다', tts.length === 1 && tts[0].text === d1[WITH][0][0] && tts[0].lang === 'en', JSON.stringify(tts[0]));
tts.length = 0;
await page.click('#tbs-box .tbs-all'); await page.waitForTimeout(2500);
ok('전체 듣기는 문장 수만큼 묻는다(같은 문장은 캐시)', tts.length >= d1[WITH].length - 1, String(tts.length));
await page.evaluate(n => window.showPage(n), OLD); await page.waitForTimeout(300);
ok('쪽을 넘기면 목록이 닫히고 버튼도 사라진다', await page.evaluate(() => getComputedStyle(document.getElementById('tbs-box')).display === 'none') && (await vis()) !== 'shown');

await browser.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
