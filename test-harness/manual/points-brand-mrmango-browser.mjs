// -*- coding: utf-8 -*-
// points-brand-mrmango-browser.mjs — 관리자 «정산·매출 ▸ 포인트» 상품 표의 브랜드 칸이
//   🥭 이모지가 아니라 Mr.mango 캐릭터(공식 로고, /img/mango-char.png)로 그려지는지
//   **진짜 브라우저에 그려서** 잰다.
//
//   [왜 필요한가]  2026-08-24 사장님 지적 — 그 칸만 이모지였다(CLAUDE.md 0장: 마스코트 자리는
//     🥭 가 아니라 Mr.mango). 그런데 브랜드 문자열(「🥭 망고아이」)은 **D1 gift_catalog 에 들어
//     있는 값**이라 소스 문자열 검사로는 화면에 무엇이 그려지는지 알 수 없다. 게다가
//     admin-inline-c.css 에는 인라인 style 을 이기는 전역 !important 규칙이 여럿이라
//     «22px 로 적었는데 화면은 다른 크기» 가 실제로 일어난다(CLAUDE.md 2장 「표 안의 작은
//     아이콘 버튼」·「표 안 select」). 그래서 getComputedStyle·getBoundingClientRect 로 잰다.
//
//   [기준선 대조]  좁은 폭(390px)에서 이 표가 가로로 넘치는 것은 **원래부터 그렇다**(칸 8개).
//     그래서 절대값으로 판정하지 않고, **변경 전 렌더러(git HEAD~ 가 아니라 «이미지 없는 판»)**
//     대신 «이모지 없는 다른 브랜드 행» 과 나란히 비교해 「이 변경 때문에 벌어졌는가」만 본다.
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   adm-p4.js 의 카탈로그 표나 brandHtml 을 건드리면 **사람이 불러야** 한다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/points-brand-mrmango-browser.mjs
//
//   ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 가 전부 404 가 되고 에러도 안 뜬다
//      (CLAUDE.md 2장). 그래서 이 파일이 직접 작은 http 서버를 띄운다.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();

const MIME = { '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };

// 표만 있으면 되는 검사다 — admin.html(1.3MB) 전체를 띄우면 환영 오버레이·사이드바까지
// 딸려 와서 «무엇이 원인인지» 가 흐려진다(CLAUDE.md 2장 「빈 브라우저는 첫 방문자」).
const PAGE = '<!doctype html><meta charset="utf-8"><title>pt</title>'
  + '<div id="pt-catalog-table"></div><script src="/js/adm-p4.js"></script>';

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/__pt.html') { res.writeHead(200, { 'content-type':'text/html; charset=utf-8' }); return res.end(PAGE); }
  const f = join(PUB, p);
  try { await stat(f); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// 실제 D1 에 들어 있는 모양 그대로 — 브랜드 문자열에 이모지가 붙어 있다
const ROWS = { ok: true, rows: [
  { id:1, brand:'🥭 망고아이', name:'수업료 전환 (5,000원)', category:'tuition', face_value:5000, point_price:5000, stock:null, enabled:1 },
  { id:2, brand:'메가커피', name:'아이스 아메리카노', category:'카페', face_value:4500, point_price:4500, stock:100, enabled:1 },
  { id:3, brand:'GS25', name:'3천원 모바일상품권', category:'편의점', face_value:3000, point_price:3000, stock:200, enabled:1 },
]};

let pass = 0, fail = 0;
const ok = (n, cond, extra='') => { cond ? (pass++, console.log('  ✅ ' + n + (extra ? ' — ' + extra : '')))
                                        : (fail++, console.log('  ❌ ' + n + (extra ? ' — ' + extra : ''))); };

const browser = await chromium.launch({ executablePath: exe });

// 폭마다 기대치가 다르다 — 390px 에서는 브랜드 칸이 53px 까지 눌려 이름이 접힌다.
//   그건 이 변경 «때문» 이 아니다. 실측(2026-08-24, 같은 표를 변경 전 렌더러로도 그려 비교):
//     변경 전 390px → 칸폭 53 · 이름 3줄 · 문서폭 470   (「🥭 망고아이」)
//     변경 후 390px → 칸폭 53 · 이름 2줄 · 문서폭 470   (아이콘 + 「망고아이」)
//   문서폭이 같고 줄 수는 오히려 하나 줄었다. 그래서 «한 줄» 은 넉넉한 폭에서만 요구하고,
//   좁은 폭에서는 «변경 전보다 나빠지지 않았는가»(≤2줄)로 본다.
for (const [label, width, maxLabelLines] of [['PC', 1440, 1], ['좁은 칸', 700, 1], ['휴대폰', 390, 2]]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/admin/gifts/catalog', r =>
    r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(ROWS) }));
  await page.goto(`http://127.0.0.1:${PORT}/__pt.html`, { waitUntil:'load' });
  await page.evaluate(() => window.ptLoadCatalog());
  await page.waitForSelector('#pt-catalog-table tbody tr');

  console.log(`\n── ${label} ${width}px ──`);
  const m = await page.evaluate(async () => {
    const rows = [...document.querySelectorAll('#pt-catalog-table tbody tr')];
    const cell = rows[0].cells[0];
    const img = cell.querySelector('img');
    let decoded = false;
    if (img) { try { await img.decode(); decoded = true; } catch {} }
    const cs = img && getComputedStyle(img);
    const ib = img && img.getBoundingClientRect();
    // 「보인다」와 「안 가려졌다」는 다르다 — 맨 위에 무엇이 있나까지 본다
    const top = img ? document.elementsFromPoint(ib.left + ib.width/2, ib.top + ib.height/2)[0] : null;
    return {
      text: cell.textContent.trim(),
      src: img && img.getAttribute('src'), alt: img && img.getAttribute('alt'),
      decoded, natural: img && (img.naturalWidth + '×' + img.naturalHeight),
      display: cs && cs.display, visibility: cs && cs.visibility,
      box: ib && [Math.round(ib.width), Math.round(ib.height)],
      topSrc: top && top.getAttribute && top.getAttribute('src'),
      // 「칸을 밀지 않는가」는 «행 높이» 로 재면 안 된다 — 상품명 길이가 달라 원래부터 다르다
      //   (390px 실측: 변경 전에도 1행 102 · 2행 87). 아이콘이 «라벨과 같은 줄에 있는가» 로 본다.
      labelBox: (function(){ const b = cell.querySelector('b'); if (!b) return null;
        const r = b.getBoundingClientRect(); const g = getComputedStyle(cell);
        const lh = parseFloat(g.lineHeight) || parseFloat(g.fontSize) * 1.4;
        return { lines: Math.max(1, Math.round(r.height / lh)), top: r.top, bottom: r.bottom }; })(),
      sameLine: (function(){ const b = cell.querySelector('b'); if (!b || !ib) return false;
        const r = b.getBoundingClientRect(); return r.top < ib.bottom && ib.top < r.bottom; })(),
      plainText: rows[1].cells[0].textContent.trim(),
      plainHasImg: !!rows[1].cells[0].querySelector('img'),
    };
  });

  ok('브랜드 칸에 🥭 이모지가 남아 있지 않다', !m.text.includes('🥭'), JSON.stringify(m.text));
  ok('브랜드명 「망고아이」는 그대로', m.text === '망고아이', m.text);
  ok('Mr.mango 캐릭터(/img/mango-char.png)를 쓴다', m.src === '/img/mango-char.png', String(m.src));
  ok('alt 는 「Mr.mango」 — 「망고아이!」였다면 전역 CSS 가 지운다', m.alt === 'Mr.mango', String(m.alt));
  ok('이미지가 실제로 로드된다(404 아님)', m.decoded, '원본 ' + m.natural);
  ok('화면에 보인다', m.display !== 'none' && m.visibility !== 'hidden', m.display + '/' + m.visibility);
  ok('22×22 로 그려진다(전역 !important 에 안 먹힘)', m.box && m.box[0] === 22 && m.box[1] === 22, m.box && m.box.join('×'));
  ok('아이콘 자리를 가리는 것이 없다', m.topSrc === '/img/mango-char.png', String(m.topSrc));
  ok('이모지 없는 브랜드에는 이미지가 안 붙는다', !m.plainHasImg && m.plainText === '메가커피', m.plainText);
  ok(`브랜드명이 ${maxLabelLines}줄 이하 (변경 전보다 나빠지지 않음)`,
     m.labelBox && m.labelBox.lines <= maxLabelLines, m.labelBox ? m.labelBox.lines + '줄' : 'no label');
  if (maxLabelLines === 1) ok('캐릭터와 이름이 같은 줄에 있다', m.sameLine, String(m.sameLine));
  ok('콘솔 에러 없음', errs.length === 0, errs.join(' | ') || '0건');

  // 다시 그려도 같아야 한다 — /g 정규식 .test() 의 lastIndex 회귀 감시
  await page.evaluate(() => window.ptLoadCatalog());
  await page.waitForFunction(() => !!document.querySelector('#pt-catalog-table tbody tr'));
  const again = await page.evaluate(() => {
    const c = document.querySelector('#pt-catalog-table tbody tr').cells[0];
    return { text: c.textContent.trim(), img: !!c.querySelector('img') };
  });
  ok('다시 그려도 캐릭터가 그대로', again.img && again.text === '망고아이', JSON.stringify(again));
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n════ PASS ${pass} · FAIL ${fail} ════`);
process.exit(fail ? 1 : 0);
