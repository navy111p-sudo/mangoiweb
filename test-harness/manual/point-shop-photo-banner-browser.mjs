// -*- coding: utf-8 -*-
// point-shop-photo-banner-browser.mjs — 포인트 상점 카드 배너가 «실사형 사진»(/img/gifts/*-photo.webp)으로
//   진짜 브라우저에 그려지는지 잰다(2026-10-09 사장님 「아직 일러스트형이다」).
//
//   [왜 필요한가]  배너 주소는 D1 gift_catalog.thumbnail_url 에 있다 — 파일만 넣고 DB 를 안 바꾸면
//     화면은 그대로 손그림 SVG 다(실제로 그 상태였다). 이 검사는 «DB 를 바꾼 뒤의 행» 을 스텁으로 넣어
//     ① 파일이 실제로 열리는가(404 아님) ② 카드 위 배너 자리에 꽉 차게 그려지는가
//     ③ 다른 것이 덮지 않는가 ④ PC·휴대폰 화면 사진 — 를 본다.
//
//   [자동으로 안 돕니다]  manual/ 규약. 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/point-shop-photo-banner-browser.mjs [화면사진저장폴더]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const SHOT_DIR = process.argv[2] || null;
const { chromium, exe } = requireBrowser();

const html = await readFile(join(PUB, 'index.html'), 'utf8');
const from = html.indexOf('.ps-overlay{');
const endTag = html.indexOf('</style>', from);
if (from < 0 || endTag < 0) { console.log('❌ index.html 에서 .ps-* 스타일 구간을 못 찾았습니다'); process.exit(1); }
const CSS = html.slice(from, endTag);
const MIME = { '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml' };
const PAGE = `<!doctype html><meta charset="utf-8"><title>ps</title>
<style>body{margin:0;background:#0b1020;font-family:system-ui,'Malgun Gothic',sans-serif}
#w{padding:16px;max-width:1000px;margin:auto}${CSS}.ps-pane{display:block!important}</style>
<div id="w"><div id="ps-pane-catalog"></div></div>
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

// 운영 D1 의 활성 상품(2026-10-09 SELECT) — 배너만 사진으로 바꾼 모양
const BRANDS = [
  ['메가커피','아이스 아메리카노','megacoffee',4500],['투썸플레이스','아이스 카페라떼','twosome',5000],
  ['GS25','3천원 모바일상품권','gs25',3000],['GS25','편의점 금액권 5,000원','gs25-5000',5000],['CU','5천원 모바일상품권','cu',5000],
  ['배스킨라빈스','싱글레귤러','baskinrobbins',3200],['교보문고','5천원 도서상품권','kyobo',5000],
  ['올리브영','1만원 금액권','oliveyoung',10000],['CGV','영화 관람권','cgv',12000],
  ['맥도날드','빅맥세트','mcdonalds',7000],['BBQ','황금올리브 치킨','bbq',23000],['스타벅스','아이스 아메리카노','starbucks',4700],
  ['교촌치킨','교촌오리지날 + 콜라1.25L','kyochon',21000],['배달의민족','e쿠폰 5,000원','baemin',5000],['컬쳐랜드','문화상품권 5,000원','cultureland',5000],
  ['쿠팡','모바일 상품권 5,000원','coupang',5000],
];
const CATALOG = { ok:true, rows:[
  { id:9, brand:'🥭 망고아이', name:'수업료 전환 (5,000원)', category:'tuition', face_value:5000, point_price:5000, stock:null, description:'모든 포인트를 다음 수업료 즉시 차감', thumbnail_url:'/img/gifts/mangoi.svg' },
  ...BRANDS.map(([b,n,f,p],i) => ({ id:10+i, brand:b, name:n, category:'x', face_value:p, point_price:p, stock:100, description:b+' '+n, thumbnail_url:'/img/gifts/'+f+'-photo.webp' })),
]};

let pass = 0, fail = 0;
const ok = (n, c, x='') => { c ? (pass++, console.log('  ✅ '+n+(x?' — '+x:''))) : (fail++, console.log('  ❌ '+n+(x?' — '+x:''))); };
const browser = await chromium.launch({ executablePath: exe });

for (const [label, width] of [['PC', 1000], ['휴대폰', 390]]) {
  const ctx = await browser.newContext({ viewport: { width, height: 1400 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/gifts/catalog', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(CATALOG) }));
  await page.goto(`http://127.0.0.1:${PORT}/__ps.html`, { waitUntil:'load' });
  await page.evaluate(() => window.psLoadCatalog());
  await page.waitForSelector('.ps-card');
  console.log(`\n── ${label} ${width}px ──`);
  const m = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img.ps-thumb')];
    const out = [];
    for (const im of imgs) {
      let decoded = false; try { await im.decode(); decoded = true; } catch {}
      im.scrollIntoView({ block:'center' });
      const r = im.getBoundingClientRect(); const card = im.closest('.ps-card').getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      out.push({ src: im.getAttribute('src'), decoded, nat: [im.naturalWidth, im.naturalHeight],
        w: Math.round(r.width), cw: Math.round(card.width), h: Math.round(r.height), topIsImg: top === im,
        fit: getComputedStyle(im).objectFit });
    }
    return { out, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  ok('사진 배너 카드 수 = '+BRANDS.length, m.out.length === BRANDS.length, String(m.out.length));
  for (const x of m.out) {
    const n = x.src.replace('/img/gifts/','');
    ok(n+' 열림·실사 webp', x.decoded && /-photo\.webp$/.test(x.src) && x.nat[0] >= 300 && x.nat[0]/x.nat[1] <= 1.95, x.nat.join('×'));
    ok(n+' 카드 폭에 꽉 참·덮는 것 없음', Math.abs(x.w - x.cw) <= 2 && x.topIsImg && x.fit === 'cover', x.w+'/'+x.cw+'×'+x.h);
  }
  ok('SVG 일러스트 배너가 남아 있지 않다', !m.out.some(x => /\.svg$/.test(x.src)));
  ok('문서 가로 넘침 없음', !m.overflow);
  ok('콘솔 에러 없음', errs.length === 0, errs.join(' | ') || '0건');
  if (SHOT_DIR) await page.screenshot({ path: join(SHOT_DIR, 'point-shop-'+(width>500?'pc':'mobile')+'.png'), fullPage: true });
  await ctx.close();
}
await browser.close(); server.close();
console.log(`\n════ PASS ${pass} · FAIL ${fail} ════`);
process.exit(fail ? 1 : 0);
