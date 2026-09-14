// -*- coding: utf-8 -*-
/* 🀄 웜업 «중국어 교사 메이» — 진짜 브라우저로 그려서 확인 (2026-09-14)
 *
 * 왜 이 검사가 따로 필요한가
 *   warmup_zh_lang_harness ⑯ 은 함수를 오려 내 «무슨 답이 나오는가» 를 봅니다.
 *   그것으로는 «화면에 실제로 보이는가 · 그림이 정말 받아지는가 · 캔버스에 그려지는가» 를
 *   원리상 볼 수 없습니다 — 2026-08-31 에 표만 고치고 그림 파일을 커밋에 안 담아
 *   며칠간 조용히 폴백(옛 얼굴)이 돌았던 사고가 바로 그 자리입니다.
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 은 게이트가 물어 가지 않습니다. 사람이 부릅니다:
 *      mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *      PW_DIR=/tmp/pw node test-harness/manual/warmup-zh-friend-browser.mjs
 */
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
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp',            // ⚠️ 빠뜨리면 그림이 octet-stream 으로 가 브라우저가 안 그립니다
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
let hits = [];
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":false}');
  }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    hits.push([p, 200]);
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { hits.push([p, 404]); res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  → ' + x : '')); } };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
async function open(url) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  hits = [];
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  return { ctx, page };
}
/** 「보인다」는 hidden 값이 아니라 «자리를 차지하는가» 로 잰다.
 *  📜 2026-09-14 지시 변경 — 처음에는 «중국어에서 메이 버튼 하나만 보인다» 였는데,
 *     사장님이 「중국어는 목소리와 얼굴 선택없이 무조건 메이 한 교사만」으로 정하셔서
 *     «고르는 칸 자체가 없다» 로 경계를 옮겼다. 그래서 box 도 함께 잰다. */
const btnState = () => ({
  box: (() => { const b = document.getElementById('voiceBtns');
    return b ? b.getBoundingClientRect().height > 0 : null; })(),
  shown: [...document.querySelectorAll('#voiceBtns button')]
    .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('data-v')),
  note: (() => { const n = document.getElementById('voiceZhNote'); return n ? getComputedStyle(n).display !== 'none' : null; })(),
  label: (document.getElementById('voiceVal') || {}).textContent || '',
  char: window.__avChar || null,
});

console.log('\n[ 1. 영어(기본) — 고르는 칸이 그대로 보인다 ]');
{
  const { ctx, page } = await open('/warmup.html');
  const s = await page.evaluate(btnState);
  check('영어에서는 고르는 칸이 보인다', s.box === true, String(s.box));
  check('영어에서는 네 친구와 번갈아가 보인다', s.shown.join(',') === 'emma,jake,lily,noah,mix', s.shown.join(','));
  check('영어에서는 중국어 안내가 안 뜬다 (짝)', s.note === false, String(s.note));
  await ctx.close();
}

console.log('\n[ 2. 중국어 — 고르는 칸이 «통째로» 사라지고 왜 그런지 화면이 말한다 ]');
{
  const { ctx, page } = await open('/warmup.html?lang=zh');
  const s = await page.evaluate(btnState);
  check('중국어에서는 고르는 칸이 통째로 감춰진다', s.box === false, String(s.box));
  check('중국어에서는 버튼이 한 개도 안 보인다', s.shown.length === 0, s.shown.join(',') || '없음');
  check('중국어에서는 «메이 한 분» 안내가 뜬다', s.note === true, String(s.note));
  check('지금 친구 표시가 메이다', /메이/.test(s.label), s.label);
  const noteText = await page.evaluate(() => (document.getElementById('voiceZhNote') || {}).textContent || '');
  check('그 안내가 한국어·중국어 둘 다로 적혀 있다',
    /메이 선생님/.test(noteText) && /美美老师/.test(noteText), noteText.slice(0, 80));
  await ctx.close();
}

console.log('\n[ 3. 얼굴 — 그림 세 장이 «정말 받아지고» 캔버스에 그려지는가 ]');
{
  const { ctx, page } = await open('/warmup.html?lang=zh');
  /* ⚠️ «요청이 몇 건인가» 로 재지 마세요 — 부팅(⑤절)이 이미 받아 뒀고 브라우저가 캐시에서
     주므로 다시 받지 않습니다. 물어야 할 것은 «그 파일이 닿고 그려지는가» 입니다. */
  const loaded = await page.evaluate(() => Promise.all(['closed', 'mid', 'wide'].map((k) => new Promise((r) => {
    const im = new Image();
    im.onload = () => r({ k, w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => r({ k, w: 0, h: 0 });
    im.src = '/img/mei-' + k + '.webp';
  }))));
  for (const g of loaded) {
    check(`mei-${g.k}.webp 가 640×800 으로 열린다`, g.w === 640 && g.h === 800, JSON.stringify(g));
  }
  /* 🔴 「세 장이 서로 다른가 · 다른 곳이 입뿐인가」 — 이 저장소가 Emma 사고(v8)로 배운 성질이다.
     세 장을 각각 따로 뽑아 넣으면 얼굴째 움직이고, 그때 화면은 «입이 빠르다» 가 아니라
     «덜덜거린다» 로 보인다. 그림을 갈아 끼울 때 이 숫자가 무너지면 여기서 걸린다. */
  const band = await page.evaluate(() => {
    const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    return Promise.all(['closed', 'mid', 'wide'].map((k) => load('/img/mei-' + k + '.webp'))).then((ims) => {
      const px = ims.map((im) => {
        const c = document.createElement('canvas'); c.width = 640; c.height = 800;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        return g.getImageData(0, 0, 640, 800).data;
      });
      const diff = (a, b) => {
        const rows = new Array(10).fill(0); let n = 0;
        for (let y = 0; y < 800; y++) for (let x = 0; x < 640; x++) {
          const i = (y * 640 + x) * 4;
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 72) { rows[(y / 80) | 0]++; n++; }
        }
        return { pct: +(n / (640 * 800) * 100).toFixed(2), rows: rows.map((v) => +(v / (640 * 80) * 100).toFixed(1)) };
      };
      return { cm: diff(px[0], px[1]), cw: diff(px[0], px[2]) };
    });
  });
  check('세 장이 서로 «다른» 그림이다 (같은 파일을 세 번 넣지 않았다)',
    band.cm.pct > 0.05 && band.cw.pct > 0.2, JSON.stringify(band));
  check('달라진 곳이 «입 부근» 뿐이다 (얼굴째 움직이지 않는다)',
    band.cw.rows.slice(0, 4).every((v) => v < 0.3) && band.cw.rows.slice(7).every((v) => v < 0.3)
    && band.cw.rows.slice(4, 7).some((v) => v > 1),
    'closed↔wide 세로 10칸: ' + band.cw.rows.join(' / '));
  check('그 변화가 지나치게 크지 않다 (Emma 사고는 11~18%)',
    band.cw.pct < 6, JSON.stringify(band.cw));

  /* ⛔ 「폴백으로 조용히 되돌아가지 않았는가」 — 그림이 없으면 옛 얼굴(emma 영상)로 떨어진다.
     그때도 화면은 멀쩡해 보이므로 «옛 얼굴 파일을 안 받았다» 를 짝으로 본다. */
  check('메이로 바꾼 뒤 옛 얼굴(teacher-avatar)을 다시 받지 않았다 = 폴백이 안 돌았다',
    !hits.some((x) => /teacher-avatar/.test(x[0])), hits.filter((x) => /teacher-avatar/.test(x[0])).map((x) => x[0]).join(','));
  const px = await page.evaluate(() => {
    const c = document.getElementById('tavatar-canvas');
    if (!c) return { err: 'no canvas' };
    const g = c.getContext('2d');
    let n = 0; const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 16) n++;
    return { w: c.width, h: c.height, filled: n / (c.width * c.height), ratio: c.width / c.height };
  });
  check('캔버스에 얼굴이 실제로 그려졌다 (빈 카드가 아니다)', px.filled > 0.25, JSON.stringify(px));
  check('카드 비율이 4:5 다', Math.abs(px.ratio - 0.8) < 0.02, JSON.stringify(px));
  await ctx.close();
}

console.log('\n[ 4. 오갈 때 — 영어에서 고른 사람이 안 지워진다 ]');
{
  const { ctx, page } = await open('/warmup.html');
  await page.evaluate(() => setVoiceMode('lily', false));
  await page.evaluate(() => setWarmLang('zh', false));
  const zh = await page.evaluate(btnState);
  check('중국어로 바꾸면 메이가 되고 고르는 칸이 사라진다',
    /메이/.test(zh.label) && zh.box === false, zh.label + ' / box=' + zh.box);
  await page.evaluate(() => setWarmLang('en', false));
  const en = await page.evaluate(btnState);
  check('영어로 돌아오면 «내가 골랐던 Lily» 가 그대로다 (짝)', /Lily/.test(en.label), en.label);
  check('그때 네 친구 버튼이 다시 보인다 (짝)', en.shown.join(',') === 'emma,jake,lily,noah,mix', en.shown.join(','));
  const saved = await page.evaluate(() => [localStorage.getItem('mangoi_warmup_voice'), localStorage.getItem('mangoi_warmup_voice_zh')]);
  /* 🔒 중국어는 «고른 것» 이 없으므로 적을 것도 없다 — 적으면 나중에 중국어 친구를 늘릴 때
        옛 값이 「학생이 고른 것」으로 굳어 기본값을 되돌릴 수 없다(2026-09-14). */
  check('영어에서 고른 사람만 기억한다', saved[0] === 'lily', JSON.stringify(saved));
  check('중국어용 저장 칸은 아예 안 생긴다 (짝)', saved[1] == null, JSON.stringify(saved));
  await ctx.close();
}

console.log('\n[ 5. 부팅 — 고른 얼굴이 «처음부터» 나오는가 (그리고 942KB 를 안 받는가) ]');
{
  /* 🔴 이 파일은 defer 라 화면의 인라인 스크립트가 먼저 돕니다 — 그때 MangoAvatar 가
     아직 없어서 «고른 얼굴» 요청이 버려졌습니다(2026-09-14 실측: origin/main 에서
     lily 를 골라 둬도 lily 그림 0건 · teacher-avatar 942KB 2건). */
  const boot = async (url, init) => {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    if (init) await page.addInitScript(init);
    hits = [];
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const got = hits.map((h) => h[0]);
    await ctx.close();
    return got;
  };
  const zh = await boot('/warmup.html?lang=zh');
  check('중국어로 열면 처음부터 메이 그림을 받는다', zh.some((h) => /mei-closed\.webp/.test(h)), zh.filter((h) => /img\//.test(h)).join(','));
  check('그때 옛 얼굴 영상(942KB)을 받지 않는다', !zh.some((h) => /teacher-avatar/.test(h)),
    zh.filter((h) => /teacher-avatar/.test(h)).join(','));
  const en = await boot('/warmup.html', () => { try { localStorage.setItem('mangoi_warmup_voice', 'lily'); } catch (e) {} });
  check('영어에서 Lily 를 골라 뒀으면 처음부터 Lily 다 (짝)', en.some((h) => /lily-closed\.webp/.test(h)),
    en.filter((h) => /img\//.test(h)).join(','));
  check('그때도 옛 얼굴 영상을 받지 않는다 (짝)', !en.some((h) => /teacher-avatar/.test(h)),
    en.filter((h) => /teacher-avatar/.test(h)).join(','));
  /* 🔴 짝 — 이 전역을 세우지 않는 화면(ai-friend)은 «예전 그대로» 여야 합니다.
     여기서 Emma 가 안 나오면 제가 남의 화면 동작까지 바꾼 것입니다. */
  const af = await boot('/ai-friend.html');
  check('그 전역을 안 세우는 화면은 예전처럼 Emma 로 시작한다 (짝)',
    af.some((h) => /teacher-avatar/.test(h)), af.filter((h) => /img\//.test(h)).join(',') || '요청 없음');
}

await browser.close();
server.close();
console.log(`\n  🀄 중국어 교사 브라우저 검사: ✅ ${pass} / ❌ ${fail}`);
process.exit(fail ? 1 : 0);
