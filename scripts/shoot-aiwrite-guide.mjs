// 📖 AI 영작 «사용 방법» 사진 5장(public/img/aiwrite-guide/step1~5.webp)을 실제 화면에서 다시 찍는다.
//
//   PW_DIR=/tmp/pw node scripts/shoot-aiwrite-guide.mjs
//
// 왜 스크립트로 남기나: 2026-10-08 첫 판은 손으로 찍어 «어떻게 찍었는지» 가 사라졌고,
// 2026-10-16 단계 번호를 STEP 1·2·3 로 바꾸자 사진 속 옛 표기(① 오늘의 그림 · 내 영작 — 여기에 쓰세요)가
// 화면과 어긋났다. 화면을 바꾸면 이걸 다시 돌리고 ai-write.html 의 사진 주소 ?v= 를 올릴 것.
//
// 찍는 법: 폰 폭 390 · DPR 2 · 한국어 · 생일 파티 그림(birthday-action) · 예문 고정.
// 대상 칸에 빨간 테두리, 위에 «STEP n · …» 이름표와 화살표를 얹고 390×440(=780×880px)으로 자른 뒤
// 브라우저 캔버스로 webp 변환(이 컨테이너엔 cwebp 가 없다).
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from '../test-harness/manual/_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy/public');
const OUT = join(PUB, 'img/aiwrite-guide');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
  try { const b = await readFile(join(PUB, p.slice(1))); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const SAMPLE = 'A boy is blowing out the candles on the cake. The girl has a gift.';
// 순서·번호는 ai-write.html 의 STEPS 와 짝 — 한쪽만 바꾸지 말 것.
const SHOTS = [
  { file: 1, label: 'STEP 1 · 그림 보기', target: '#picCard', extra: '.pic-btn.shuffle', above: 70 },
  { file: 2, label: 'STEP 1 · 그림 속 단어', target: '#missionCard', above: 90 },
  { file: 3, label: 'STEP 2 · 막히면 여기', target: '#awHelp > summary', above: 90 },
  { file: 4, label: 'STEP 3 · 영어로 쓰기', target: '#text', above: 110 },
  { file: 5, label: 'STEP 3 · 누르기!', target: '#submitBtn', above: 90 },
];

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem('mangoi_aiwrite_howto_v1', '1'); localStorage.setItem('mangoi_lang', 'ko'); } catch (e) {} });
const page = await ctx.newPage();
await page.goto(BASE + '/ai-write.html', { waitUntil: 'load' });
await page.waitForTimeout(800);
const ok = await page.evaluate((s) => {
  const i = PIC_SCENES.findIndex((x) => x.img === 'birthday-action');
  if (i < 0) return false;
  choosePic(i);
  const ta = document.getElementById('text'); ta.value = s; if (window.updateCharCount) updateCharCount();
  return true;
}, SAMPLE);
if (!ok) { console.error('❌ birthday-action 그림을 못 찾음 — PIC_SCENES 가 바뀌었나?'); process.exit(1); }
await page.waitForTimeout(1500); // 그림 로드

for (const s of SHOTS) {
  const box = await page.evaluate(({ s }) => {
    document.querySelectorAll('.__shot').forEach((e) => e.remove());
    // 떠 있는 바(sticky·fixed — 말로 쓰기 줄·홈 칩 등)는 잘라 낸 사진 한가운데에 끼므로 찍는 동안 감춘다.
    document.querySelectorAll('body *').forEach((e) => { const p = getComputedStyle(e).position;
      if ((p === 'sticky' || p === 'fixed') && !e.classList.contains('__shot')) e.style.setProperty('visibility', 'hidden', 'important'); });
    const t = document.querySelector(s.target);
    if (!t) return null;
    const r = t.getBoundingClientRect(), sx = scrollX, sy = scrollY;
    const top = Math.max(0, r.top + sy - s.above);
    const ring = (rr, w) => { const d = document.createElement('div'); d.className = '__shot';
      d.style.cssText = `position:absolute;z-index:2147483600;pointer-events:none;left:${rr.left + sx - 4}px;top:${rr.top + sy - 4}px;width:${rr.width + 8}px;height:${rr.height + 8}px;border:${w}px solid #ef4444;border-radius:14px;box-shadow:0 0 0 3px #fff;`;
      document.body.appendChild(d); };
    ring(r, 4);
    if (s.extra) { const e = document.querySelector(s.extra); if (e) ring(e.getBoundingClientRect(), 3); }
    const lab = document.createElement('div'); lab.className = '__shot'; lab.textContent = s.label;
    const ly = Math.max(top + 6, r.top + sy - 56);
    lab.style.cssText = `position:absolute;z-index:2147483601;left:${r.left + sx + 26}px;top:${ly}px;padding:8px 16px;background:#ef4444;color:#fff;font:900 19px/1.2 system-ui,sans-serif;border:3px solid #fff;border-radius:14px;box-shadow:0 4px 12px rgba(0,0,0,.45);white-space:nowrap;`;
    document.body.appendChild(lab);
    const lr = lab.getBoundingClientRect();
    const x1 = lr.left + sx + lr.width * 0.62, y1 = lr.bottom + sy - 2, x2 = x1 + 34, y2 = r.top + sy - 8; // 대상 «위 테두리» 에서 멈춤 — 글자를 덮지 않게
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', '__shot');
    svg.style.cssText = `position:absolute;z-index:2147483600;left:0;top:0;width:${document.documentElement.scrollWidth}px;height:${document.documentElement.scrollHeight}px;pointer-events:none;overflow:visible`;
    svg.innerHTML = `<defs><marker id="__ah" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#ef4444" stroke="#fff" stroke-width="1"/></marker></defs>`
      + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`
      + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ef4444" stroke-width="5" stroke-linecap="round" marker-end="url(#__ah)"/>`;
    document.body.appendChild(svg);
    return { top };
  }, { s });
  if (!box) { console.error('❌ 대상 없음:', s.target); process.exit(1); }
  const png = await page.screenshot({ clip: { x: 0, y: box.top, width: 390, height: 440 }, fullPage: true });
  const webp = await page.evaluate(async (b64) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = 780; c.height = 880;
    c.getContext('2d').drawImage(im, 0, 0, 780, 880);
    return c.toDataURL('image/webp', 0.86).split(',')[1];
  }, png.toString('base64'));
  const buf = Buffer.from(webp, 'base64');
  await writeFile(join(OUT, `step${s.file}.webp`), buf);
  console.log(`✅ step${s.file}.webp  ${s.label}  ${Math.round(buf.length / 1024)}KB`);
}
await page.evaluate(() => document.querySelectorAll('.__shot').forEach((e) => e.remove()));
await browser.close(); server.close();
