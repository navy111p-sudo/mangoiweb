// -*- coding: utf-8 -*-
// ai-write-v2-browser.mjs — AI 영작 v2 보완(단어 수 목표 · 초안 자동 저장 · 6하원칙 확인 · 고쳐서 다시 첨삭)을
//   진짜 브라우저에 그려서 눌러 본다.
//
//   [왜 필요한가]  자동 하니스(ai_write_v2_harness.mjs)는 «무슨 값이 나오는가» 까지만 본다.
//     「새로고침하면 글이 정말 돌아오는가」·「목표 줄이 한 줄로 남는가」·「고쳐서 다시 버튼이 폰에서 눌리는가」·
//     「6하원칙 상자 글자가 읽히는가(대비)」는 좌표·저장소·렌더링의 문제라 문자열로는 볼 수 없다.
//
//   [자동으로 안 돕니다]  manual/ 규약상 게이트가 물어 가지 않는다. ai-write.html 의 글쓰기 칸·결과를 건드리면 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-v2-browser.mjs
//
//   ⚠️ file:// 로 열면 /js/… 가 전부 404 라 작은 http 서버를 띄운다. 포괄 스텁(/api/*)을 «먼저», 구체 스텁을 «뒤에».
//   ⚠️ isMobile 은 켜지 않는다(폭만 좁힌다 — 좌표가 어긋나 «멀쩡한 버튼이 안 눌린다» 가 된다).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

const stubFor = (score) => ({
  ok: true, level: 'A1', score,
  corrected: 'I went to the park with my dog. We played ball.',
  issues: [{ original: 'I go', suggested: 'I went', reason: '지난 일이니까 과거형으로 써요.' }],
  upgrades: [], tip: '잘 썼어요!', reply: 'Sounds fun!',
});

// 반투명 층을 아래에서 위로 합성해 실제로 깔린 배경을 구한다(CLAUDE.md 2장 «어두운 화면에서 글자가 읽히나»)
const CONTRAST_FN = `(el) => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const firstGrad = (img) => { const m = img && img.match(/rgba?\\([^)]+\\)/); return m ? parse(m[0]) : null; };
  const layers = []; let n = el;
  while (n && n.nodeType === 1) {
    const cs = getComputedStyle(n);
    let c = parse(cs.backgroundColor);
    if ((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') c = firstGrad(cs.backgroundImage);
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    n = n.parentElement;
  }
  let bg = { r: 10, g: 21, b: 48 };
  for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; bg = { r: L.r * L.a + bg.r * (1 - L.a), g: L.g * L.a + bg.g * (1 - L.a), b: L.b * L.a + bg.b * (1 - L.a) }; }
  const fg = parse(getComputedStyle(el).color);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}`;

/* ── 픽셀 읽기 — PNG(8bit · 비인터레이스)만 푼다. 크로미움 스크린샷이 그 형식이다(meet-room-code-browser 와 같은 방식) ── */
import { inflateSync } from 'node:zlib';
function pngPixels(buf) {
  let off = 8, w = 0, h = 0, ct = 6, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * ch), st = w * ch;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], ln = raw.subarray(y * (st + 1) + 1, y * (st + 1) + 1 + st);
    for (let x = 0; x < st; x++) {
      const A = x >= ch ? out[y * st + x - ch] : 0, B = y > 0 ? out[(y - 1) * st + x] : 0, C = (x >= ch && y > 0) ? out[(y - 1) * st + x - ch] : 0;
      let v = ln[x];
      if (f === 1) v += A; else if (f === 2) v += B; else if (f === 3) v += (A + B) >> 1;
      else if (f === 4) { const pp = A + B - C, pa = Math.abs(pp - A), pb = Math.abs(pp - B), pc = Math.abs(pp - C); v += (pa <= pb && pa <= pc) ? A : (pb <= pc ? B : C); }
      out[y * st + x] = v & 255;
    }
  }
  return { w, h, ch, px: out };
}
const lumOf = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
// 그 요소 자리의 «가장 밝은» 배경 픽셀(최악 조건)을 잰다 — 글자를 투명하게 한 뒤 찍는다. clip 은 «문서» 좌표(scroll 을 더함).
async function pixelBgMaxLum(page, sel) {
  const r = await page.evaluate((s) => {
    const e = document.querySelector(s); e.scrollIntoView({ block: 'center' });
    e.dataset.awPrevColor = e.style.color; e.style.setProperty('color', 'transparent', 'important');
    const b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height };
  }, sel);
  await page.waitForTimeout(120);
  const P = pngPixels(await page.screenshot({ clip: { x: r.x, y: r.y, width: Math.max(1, r.w), height: Math.max(1, r.h) }, fullPage: true }));
  await page.evaluate((s) => { const e = document.querySelector(s); e.style.removeProperty('color'); e.style.color = e.dataset.awPrevColor || ''; }, sel);
  let mx = 0;
  for (let i = 0; i < P.w * P.h; i++) mx = Math.max(mx, lumOf(P.px[i * P.ch], P.px[i * P.ch + 1], P.px[i * P.ch + 2]));
  return mx;
}

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

async function openCtx(w, h, { lang = 'ko', uid = 'kidA' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([lg, u]) => {
    try {
      if (!sessionStorage.getItem('__awv2_init')) {
        sessionStorage.setItem('__awv2_init', '1');
        localStorage.clear();
        localStorage.setItem('mangoi_aiwrite_howto_v1', '1');   // 첫 방문 «사용 방법» 창이 화면을 덮지 않게
        localStorage.setItem('mangoi_lang', lg);
        localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: u, name: u }));
      }
    } catch (e) {}
  }, [lang, uid]);
  let score = 72, calls = 0;
  await ctx.route('**/api/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":false}' }));
  await ctx.route('**/api/ai/write-correct', (r) => { calls++; const s = score; return r.fulfill({ contentType: 'application/json', body: JSON.stringify(stubFor(s)) }); });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  return { ctx, page, errs, setScore: (s) => { score = s; }, calls: () => calls };
}
async function load(page) {
  await page.goto(BASE + '/ai-write.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#goBody .go-q input', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(400);
}
const lines = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); const lh = parseFloat(getComputedStyle(e).lineHeight) || 20;
  return Math.round(e.getBoundingClientRect().height / lh);
}, sel);

/* ═══ ① 단어 수 목표 줄 — 여러 폭에서 한 줄 ═══ */
for (const [label, w, h] of [['PC 1280×900', 1280, 900], ['노트북 창 1366×640', 1366, 640], ['폰 390', 390, 844], ['폰 360', 360, 640]]) {
  console.log('\n▶ ① 목표 줄 · ' + label);
  const { ctx, page, errs } = await openCtx(w, h);
  await load(page);
  const t0 = await page.textContent('#charCount');
  check('처음: «0단어 · 목표 20~40단어»', /0단어 · 목표 20~40단어/.test(t0), t0);
  await page.fill('#text', 'I went to the park with my dog and we played ball together.');
  const t1 = await page.textContent('#charCount');
  check('입력하면 단어 수와 «N단어 더» 가 바뀐다(13단어 → 7단어 더)', /13단어 · 목표 20~40단어 \(7단어 더!\)/.test(t1), t1);
  check('목표 줄이 한 줄로 남는다(PC 높이 맞춤이 이 줄을 잰다)', (await lines(page, '#charCount')) === 1);
  await page.click('.level-btn[data-level="B1"]');
  const t2 = await page.textContent('#charCount');
  check('단계를 3단계로 바꾸면 목표가 80~150 으로', /목표 80~150단어/.test(t2), t2);
  await page.click('.level-btn[data-level="A1"]');
  // 목표 줄은 페이지 그라데이션 위에 바로 있어 CSS 합성으로는 원리상 못 잰다 — 글자를 잠깐 투명하게 하고 «픽셀» 을 찍는다
  const bgL = await pixelBgMaxLum(page, '#charCount');
  for (const [name, txt] of [['기본(모자람)', 'I went to the park.'], ['목표 달성(초록)', Array(25).fill('cat').join(' ')], ['2000자 넘음(빨강)', 'a'.repeat(2050)]]) {
    await page.fill('#text', txt);
    const fg = await page.evaluate(() => getComputedStyle(document.getElementById('charCount')).color);
    const m = fg.match(/\d+/g).map(Number);
    const ratio = (lumOf(m[0], m[1], m[2]) + 0.05) / (bgL + 0.05);
    check(`목표 줄 «${name}» 글자 대비 4.5:1 이상 (실측 ${ratio.toFixed(2)})`, ratio >= 4.5, fg);
  }
  await page.fill('#text', '');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('가로로 넘치지 않는다', sw <= 0, 'overflow=' + sw);
  check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ═══ ② 초안 자동 저장 · 되살리기 ═══ */
console.log('\n▶ ② 초안 자동 저장 · 되살리기');
{
  const { ctx, page, errs } = await openCtx(1280, 900, { uid: 'kidA' });
  await load(page);
  await page.fill('#text', 'My dog is big and brown.');
  await page.waitForTimeout(900);   // 0.6초 저장 타이머
  await load(page);                 // 새로고침
  check('새로고침해도 쓰던 글이 돌아온다', (await page.inputValue('#text')) === 'My dog is big and brown.');
  const toast = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '));
  check('«되살렸어요» 라고 알린다', /되살렸어요/.test(toast), toast);
  check('되살린 글의 단어 수가 목표 줄에 바로 보인다', /6단어/.test(await page.textContent('#charCount')));
  // 다른 계정 — 같은 기기에서 다른 학생이 로그인
  await page.evaluate(() => localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'kidB', name: 'kidB' })));
  await load(page);
  check('다른 계정으로 열면 남의 글을 되살리지 않는다', (await page.inputValue('#text')) === '');
  const keep = await page.evaluate(() => JSON.parse(localStorage.getItem('mangoi_aiwrite_draft_v1') || 'null'));
  check('그리고 남의 초안을 지우지도 않는다(공용 PC)', keep && keep.u === 'kidA', JSON.stringify(keep));
  // 원래 계정 → «🔄 새로» → 새로고침하면 빈 칸
  await page.evaluate(() => localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'kidA', name: 'kidA' })));
  await load(page);
  check('원래 계정으로 다시 열면 돌아온다', (await page.inputValue('#text')) === 'My dog is big and brown.');
  await page.click('#resetBtn');
  await load(page);
  check('«🔄 새로» 를 누르면 저장된 초안도 지워져 새로고침해도 빈 칸', (await page.inputValue('#text')) === '');
  check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ═══ ③ 첨삭 결과 — 차수 · 6하원칙 확인 · 고쳐서 다시 ═══ */
for (const [label, w, h] of [['PC 1280', 1280, 900], ['폰 390', 390, 844], ['폰 360', 360, 640]]) {
  console.log('\n▶ ③ 결과 · ' + label);
  const { ctx, page, errs, setScore, calls } = await openCtx(w, h);
  await load(page);
  // 지금 그림 주제의 질문 — where(영어) · who(한글) · what(영어지만 글에 없음)
  await page.fill('#go-where', 'at the park');
  await page.fill('#go-who', '우리 강아지');
  await page.fill('#go-what', 'a rainbow appeared');
  await page.fill('#text', 'I go to the park with my dog. We play ball.');
  setScore(72);
  await page.click('#submitBtn');
  await page.waitForSelector('#resultBox .result', { timeout: 15000 });
  const r1 = await page.evaluate(() => ({
    round: (document.getElementById('awRound') || {}).textContent || '',
    wh: (document.getElementById('awWhCheck') || {}).textContent || '',
    rows: document.querySelectorAll('#awWhCheck .aw-wh-row').length,
  }));
  check('1차: «1차 첨삭» 과 이번 글 단어 수(11단어)', /1차 첨삭/.test(r1.round) && /이번 글 11단어/.test(r1.round), r1.round);
  // ⚠️ 이모지를 정규식 글자 묶음([^…])에 넣지 말 것 — u 플래그 없이는 써로게이트 반쪽끼리 겹쳐 엉뚱하게 거른다(실제로 밟음)
  check('6하원칙: park 메모는 ✅', r1.wh.includes('✅ 📍 Where 메모 «at the park» 가 글에 들어갔어요.'), r1.wh.slice(0, 200));
  check('6하원칙: 글에 없는 rainbow 는 🔸 로 알린다', /rainbow, appeared|rainbow/.test(r1.wh) && /다른 말로 썼다면 괜찮아요/.test(r1.wh));
  check('6하원칙: 한글 메모는 «스스로 확인»', /우리 강아지/.test(r1.wh) && /스스로 확인/.test(r1.wh));
  check('6하원칙: 메모 없는 질문을 따로 알린다', /메모를 안 쓴 질문/.test(r1.wh));
  // 버튼이 «맨 위» 에 있고 눌린다
  const top = await page.evaluate(() => {
    const b = document.getElementById('awReviseBtn'); b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: b.contains(t), w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('«✏️ 내 글 고쳐서 다시 첨삭» 이 맨 위에 있다(가려지지 않음)', top.ok, JSON.stringify(top));
  check('그 버튼이 손가락으로 누를 만한 크기(높이 40px 이상)', top.h >= 40, JSON.stringify(top));
  const btnLines = await lines(page, '#awReviseBtn');
  check('버튼 글자가 낱글자로 쪼개지지 않는다(2줄 이하)', btnLines <= 2, 'lines=' + btnLines);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('결과 화면이 가로로 넘치지 않는다', sw <= 0, 'overflow=' + sw);
  // 대비 — 새 상자의 글자가 읽히는가
  const cr = await page.evaluate(`(() => { const f = ${CONTRAST_FN}; const out = {};
    for (const s of ['#awRound', '#awRound .aw-len', '#awWhCheck .aw-wh-h', '#awWhCheck .aw-wh-sub', '#awWhCheck .aw-wh-row', '#awWhCheck .aw-wh-row.miss', '#awWhCheck .aw-wh-note']) {
      const e = document.querySelector(s); out[s] = e ? Math.round(f(e) * 100) / 100 : null; }
    return out; })()`);
  const low = Object.entries(cr).filter(([, v]) => v == null || v < 4.5);
  check('새 글자들의 대비 4.5:1 이상 (' + Object.values(cr).join(' · ') + ')', low.length === 0, JSON.stringify(low));
  // 고쳐서 다시
  await page.click('#awReviseBtn');
  await page.waitForTimeout(300);
  check('누르면 글쓰기 칸으로 간다(포커스)', await page.evaluate(() => document.activeElement && document.activeElement.id === 'text'));
  await page.fill('#text', 'I went to the park with my dog. We played ball.');
  setScore(85);
  await page.click('#submitBtn');
  await page.waitForFunction(() => /2차 첨삭/.test((document.getElementById('awRound') || {}).textContent || ''), null, { timeout: 15000 });
  const r2 = await page.textContent('#awRound');
  check('2차: «지난번 72점 → 이번 85점 (+13)»', /2차 첨삭 · 지난번 72점 → 이번 85점 \(\+13\)/.test(r2), r2);
  // 똑같은 글 — 묻고, «취소» 면 안 보낸다
  const before = calls();
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await page.click('#submitBtn');
  await page.waitForTimeout(500);
  check('똑같은 글이면 보내기 전에 묻는다', /똑같은 글/.test(asked), asked);
  check('«취소» 면 서버를 부르지 않는다', calls() === before);
  check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ═══ ④ 영어로 저장된 학생이 «처음» 연 화면 ═══ */
console.log('\n▶ ④ 영어 화면(처음 열기)');
{
  const { ctx, page, errs } = await openCtx(1280, 900, { lang: 'en' });
  await load(page);
  await page.waitForTimeout(500);
  const t = await page.textContent('#charCount');
  check('목표 줄이 처음부터 영어다', /0 words · goal 20–40/.test(t), t);
  await page.fill('#go-where', 'at the park');
  await page.fill('#text', 'I go to the park.');
  await page.click('#submitBtn');
  await page.waitForSelector('#awWhCheck', { timeout: 15000 });
  const wh = await page.textContent('#awWhCheck');
  check('6하원칙 상자가 영어로 그려진다', /5W1H check/.test(wh) && /is in your writing/.test(wh), wh.slice(0, 160));
  const rv = await page.textContent('#awReviseBtn');
  check('버튼이 영어로 «Fix my writing & resubmit»', /Fix my writing & resubmit/.test(rv), rv);
  check('페이지 오류 없음', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
