// -*- coding: utf-8 -*-
// shop-brand-mrmango-browser.mjs — 학생 홈 «포인트샵» 의 브랜드 표기가 🥭 이모지가 아니라
//   Mr.mango 캐릭터(/img/mango-char.png)로 그려지는지 **진짜 브라우저에 그려서** 잰다.
//
//   [왜 필요한가]  브랜드 문자열(「🥭 망고아이」)은 D1 gift_catalog 에 들어 있는 값이라
//     소스를 문자열로 검사해서는 화면에 무엇이 나오는지 알 수 없다. 그리고 이 화면에는
//     브랜드가 세 자리에 나오는데 **한 곳은 HTML 이 아니다** — 교환 확인은 prompt/confirm
//     대화상자라 <img> 를 넣을 수 없어 이모지만 떼야 한다. 셋을 한꺼번에 확인한다.
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   psLoadCatalog·psStartRedeem·psLoadHistory 나 psBrandHtml/psBrandText 를 건드리면
//   **사람이 불러야** 한다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/shop-brand-mrmango-browser.mjs
//
//   ⚠️ index.html 전체(1.0MB)를 띄우지 않고 «.ps-* 스타일 + idx-user-session.js» 만 올린다.
//      홈 전체를 띄우면 우주 배경·오프닝 소리·A.i 상담사 위젯까지 딸려 와서 무엇이 원인인지
//      흐려진다. 스타일은 index.html 에서 그때그때 오려 오므로 원본과 어긋나지 않는다.
//   ⚠️ file:// 로 열면 <script src="/js/…"> 가 전부 404 다(CLAUDE.md 2장). http 로 띄운다.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();

// index.html 안의 «.ps-overlay … 미디어쿼리» 구간을 통째로 오려 온다(줄 번호를 박지 않는다)
const html = await readFile(join(PUB, 'index.html'), 'utf8');
const from = html.indexOf('.ps-overlay{');
const endTag = html.indexOf('</style>', from);
if (from < 0 || endTag < 0) { console.log('❌ index.html 에서 .ps-* 스타일 구간을 못 찾았습니다'); process.exit(1); }
const CSS = html.slice(from, endTag);

const MIME = { '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };

const PAGE = `<!doctype html><meta charset="utf-8"><title>ps</title>
<style>body{margin:0;background:#0b1020;font-family:system-ui,'Malgun Gothic',sans-serif}
#w{padding:16px}${CSS}.ps-pane{display:block!important}</style>
<div id="w"><div id="ps-pane-catalog"></div><div id="ps-pane-history"></div></div>
<script>try{localStorage.setItem('mangoi_logged_user',JSON.stringify({uid:'demo',name:'홍길동'}))}catch(e){}</script>
<script src="/js/idx-user-session.js"></script>`;

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/__ps.html') { res.writeHead(200, { 'content-type':'text/html; charset=utf-8' }); return res.end(PAGE); }
  const f = join(PUB, p);
  try { await stat(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// 실제 D1 에 들어 있는 모양 그대로 — 브랜드 문자열에 이모지가 붙어 있다
const CATALOG = { ok:true, rows:[
  { id:1, brand:'🥭 망고아이', name:'수업료 전환 (5,000원)', category:'tuition', face_value:5000, point_price:5000, stock:null, description:'모은 포인트로 다음 수업료 즉시 차감', thumbnail_url:'/img/Mangoi_Character.png' },
  { id:2, brand:'메가커피', name:'아메리카노 (ICE)', category:'cafe', face_value:1500, point_price:1500, stock:10, description:'가성비 1위', thumbnail_url:'/img/gifts/megacoffee.svg' },
]};
const HISTORY = { ok:true, rows:[
  { id:9, gift_brand:'🥭 망고아이', gift_name:'수업료 전환 (5,000원)', point_price:5000, status:'delivered', requested_at: 1756000000000, recipient_phone:'01000000000' },
  { id:8, gift_brand:'메가커피', gift_name:'아메리카노 (ICE)', point_price:1500, status:'sent', requested_at: 1756000000000, recipient_phone:'01000000000' },
]};

let pass = 0, fail = 0;
const ok = (n, cond, extra='') => { cond ? (pass++, console.log('  ✅ ' + n + (extra ? ' — ' + extra : '')))
                                        : (fail++, console.log('  ❌ ' + n + (extra ? ' — ' + extra : ''))); };

const browser = await chromium.launch({ executablePath: exe });

for (const [label, width] of [['PC', 1100], ['휴대폰', 390]]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/gifts/catalog', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(CATALOG) }));
  await page.route('**/api/gifts/redemptions*', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(HISTORY) }));
  await page.route('**/api/points/balance*', r => r.fulfill({ status:200, contentType:'application/json', body: '{"ok":true,"balance":12000}' }));
  await page.goto(`http://127.0.0.1:${PORT}/__ps.html`, { waitUntil:'load' });
  await page.evaluate(() => window.psLoadCatalog());
  await page.waitForSelector('.ps-card');
  await page.evaluate(() => window.psLoadHistory());
  await page.waitForSelector('.ps-hist-item');

  console.log(`\n── ${label} ${width}px ──`);
  const m = await page.evaluate(async () => {
    const card = document.querySelector('.ps-card');
    const chip = card.querySelector('.ps-brand');
    const img = chip.querySelector('img');
    let decoded = false;
    if (img) { try { await img.decode(); decoded = true; } catch {} }
    const ir = img && img.getBoundingClientRect();
    const cr = chip.getBoundingClientRect();
    const cs = img && getComputedStyle(img);
    const top = img ? document.elementsFromPoint(ir.left + ir.width/2, ir.top + ir.height/2)[0] : null;
    const cards = [...document.querySelectorAll('.ps-card')];
    const hist = [...document.querySelectorAll('.ps-hist-name')];
    // 교환 확인 대화상자에 넘어가는 brand — onclick 속성 문자열에서 읽는다(prompt 는 HTML 이 아니다)
    const onclick = card.querySelector('.ps-redeem-btn').getAttribute('onclick');
    return {
      chipText: chip.textContent.trim(),
      src: img && img.getAttribute('src'), alt: img && img.getAttribute('alt'),
      decoded, natural: img && (img.naturalWidth + '×' + img.naturalHeight),
      display: cs && cs.display, visibility: cs && cs.visibility,
      box: ir && [Math.round(ir.width), Math.round(ir.height)],
      chipBox: [Math.round(cr.width), Math.round(cr.height)],
      topSrc: top && top.getAttribute && top.getAttribute('src'),
      sameLine: ir ? (cr.top <= ir.top + 1 && ir.bottom <= cr.bottom + 1) : false,
      plainChip: cards[1].querySelector('.ps-brand').textContent.trim(),
      plainChipImg: !!cards[1].querySelector('.ps-brand img'),
      onclick,
      histText: hist[0].textContent.trim(),
      histImg: !!hist[0].querySelector('img'),
      histPlain: hist[1].textContent.trim(),
      docOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  ok('카드 브랜드 칩에 🥭 이모지가 없다', !m.chipText.includes('🥭'), JSON.stringify(m.chipText));
  ok('브랜드명 「망고아이」는 그대로', m.chipText === '망고아이', m.chipText);
  ok('Mr.mango 캐릭터(/img/mango-char.png)를 쓴다', m.src === '/img/mango-char.png', String(m.src));
  ok('alt 는 「Mr.mango」', m.alt === 'Mr.mango', String(m.alt));
  ok('이미지가 실제로 로드된다(404 아님)', m.decoded, '원본 ' + m.natural);
  ok('화면에 보인다', m.display !== 'none' && m.visibility !== 'hidden', m.display + '/' + m.visibility);
  ok('16×16 으로 그려진다', m.box && m.box[0] === 16 && m.box[1] === 16, m.box && m.box.join('×'));
  ok('칩 안에 들어간다(넘치지 않음)', m.sameLine, '칩 ' + m.chipBox.join('×'));
  ok('아이콘을 가리는 것이 없다', m.topSrc === '/img/mango-char.png', String(m.topSrc));
  ok('이모지 없는 브랜드에는 이미지가 안 붙는다', !m.plainChipImg && m.plainChip === '메가커피', m.plainChip);

  // 교환 확인 대화상자(prompt/confirm)는 HTML 이 아니다 — 이모지만 떨어져야 한다
  ok('교환 확인에 넘기는 브랜드에 🥭 가 없다', !/🥭/.test(m.onclick), '…' + m.onclick.slice(-70));
  ok('교환 확인에 「망고아이」는 남아 있다', m.onclick.includes('망고아이'), 'ok');
  ok('교환 확인에 <img> 를 넣지 않는다(글자만)', !/<img/i.test(m.onclick), 'ok');

  ok('교환 내역에도 🥭 이모지가 없다', !m.histText.includes('🥭'), JSON.stringify(m.histText));
  ok('교환 내역에 캐릭터가 붙는다', m.histImg, String(m.histImg));
  ok('교환 내역의 다른 브랜드는 그대로', m.histPlain.indexOf('메가커피') === 0, m.histPlain);

  ok('문서 가로 넘침 없음', !m.docOverflow, String(m.docOverflow));
  ok('콘솔 에러 없음', errs.length === 0, errs.join(' | ') || '0건');

  // 다시 그려도 같아야 한다 — /gu 정규식 .test() 의 lastIndex 회귀 감시
  await page.evaluate(() => window.psLoadCatalog());
  await page.waitForSelector('.ps-card');
  const again = await page.evaluate(() => {
    const chip = document.querySelector('.ps-card .ps-brand');
    return { text: chip.textContent.trim(), img: !!chip.querySelector('img') };
  });
  ok('다시 그려도 캐릭터가 그대로', again.img && again.text === '망고아이', JSON.stringify(again));
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n════ PASS ${pass} · FAIL ${fail} ════`);
process.exit(fail ? 1 : 0);
