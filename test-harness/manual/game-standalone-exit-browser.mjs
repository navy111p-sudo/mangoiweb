// -*- coding: utf-8 -*-
// game-standalone-exit-browser.mjs — 게임을 «허브 밖에서» 직접 열었을 때 나가는 문이
//   실제로 뜨고, **아무것도 가리지 않는지** 를 진짜 브라우저에 그려서 잰다.
//
//   [왜 필요한가]  학생 게임 16개는 게임 허브(student-games.html)가 <iframe> 으로 감싸 열고,
//     나가는 문은 허브 좌상단의 「← 게임 선택」이다. 그래서 «게임 주소로 직접» 열면
//     (북마크·카톡 링크·관리자 사이트 구성표) 나갈 길이 없다.
//     2026-09-01 사장님 지시로 `js/game-standalone-exit.js` 가 그때만 ← 를 띄운다.
//
//   [문자열 하니스로는 못 잡는다]  요구의 핵심이 「무엇을 가리는가」라서 좌표 문제다.
//     실제로 이 검사를 만들기 전에 놓친 것들:
//       · 좌상단 98px 알약 → space-monster 의 SCORE·LEVEL 을 덮었다
//       · 좌하단으로 옮김  → avatar·escape-voice·tank-battle 의 **누를 수 있는 버튼**을 덮었다
//       · «상자 왼쪽 한 줄» 만 찍어 판정 → escape-school 의 「성공 0」, grammar-pizza·
//         wordfighter 의 제목·점수를 **통째로 놓쳤다**(5개 게임이 그 상태였다)
//
//   🔴 판정은 요소 «상자» 가 아니라 **텍스트 노드의 Range.getClientRects()** 로 한다.
//      가운데정렬 글자는 상자가 폭 전체라도 글자는 가운데에만 있다 —
//      space-monster 문장 상자는 x=12..378 인데 실제 글자는 x=137..253 이다.
//      상자로 재면 «덮지도 않았는데 덮었다» 로 읽고 쓸데없이 내려간다.
//      누를 수 있는 것은 반대로 **상자 그대로** 센다(상자가 곧 탭 표적이다).
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   이 스크립트나 게임 화면의 상단 UI 를 건드리면 **사람이 불러야** 한다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/game-standalone-exit-browser.mjs
//
//   ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 가 전부 404 가 되고 에러도 안 뜬다
//      (CLAUDE.md 2장). 그래서 이 파일이 직접 작은 http 서버를 띄운다.

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
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":false}');
  }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('nope');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  — ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

/* 이미 «보이는» 나가는 문을 자기가 가진 게임은 이 스크립트가 손대지 않는다
   (shooter·battle-3d·p38-3d — 단독 실행이면 게임 목록으로 가도록 이미 짜여 있다). */
const HAS_OWN = ['student-game-shooter', 'student-game-p38-3d', 'battle-3d'];
const INJECTED = [
  'student-game-avatar', 'student-game-escape-school', 'student-game-escape-voice',
  'student-game-escape-zombie', 'student-game-grammar-pizza', 'student-game-language-ace',
  'student-game-rescue-voyage', 'student-game-space-monster', 'student-game-tank-battle',
  'student-game-tetris', 'student-game-wordfighter', 'speaking-quiz', 'suspect-mystery',
];

/* 페이지 안에서 도는 «무엇을 가리나» 자 — 정본(game-standalone-exit.js 의 blockedBottom)과
   같은 규칙이다. 한쪽만 고치면 검사가 헛돌므로 함께 보세요. */
const PROBE = `(() => {
  const b = document.getElementById('mangoi-game-exit');
  if (!b) return JSON.stringify({ no: true });
  const B = b.getBoundingClientRect();
  const hits = (r) => !(B.right < r.left || B.left > r.right || B.bottom < r.top || B.top > r.bottom);
  const usable = (el) => {
    if (!el || el === b || b.contains(el)) return null;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    /* 화면을 거의 다 덮는 것은 배경·시작 오버레이다 — 어느 모서리에나 있어 세지 않는다 */
    if (box.width > innerWidth * 0.7 && box.height > innerHeight * 0.5) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return null;
    return box;
  };
  const tap = [];
  document.querySelectorAll('a,button,[onclick],[role="button"]').forEach((e) => {
    const x = usable(e);
    if (x && hits(x)) tap.push((e.textContent || '').trim().slice(0, 16) || e.tagName);
  });
  const glyph = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let n;
  while ((n = w.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    if (!usable(n.parentElement)) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    for (const r of rg.getClientRects()) {
      if (hits(r)) { glyph.push(n.nodeValue.trim().slice(0, 18)); break; }
    }
  }
  return JSON.stringify({
    y: Math.round(B.y), x: Math.round(B.x),
    w: Math.round(B.width), h: Math.round(B.height),
    href: b.getAttribute('href'), title: b.title, aria: b.getAttribute('aria-label'),
    tap, glyph,
  });
})()`;

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

/* ───────────────────────────────────────────────────────────────
   ① 허브 안(iframe)에서는 «안» 나온다 — 그쪽엔 「← 게임 선택」이 이미 있다
   ─────────────────────────────────────────────────────────────── */
console.log('\n▶ ① 허브 안(iframe)에서는 넣지 않는다');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const mode of ['tetris', 'shooter', 'speaking']) {
    await page.goto(BASE + '/student-games.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate((m) => {
      try { window._questMode = false; } catch (_) {}
      try { window.hubOpenGame(m); } catch (_) {}
    }, mode);
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const fr = document.querySelector('#hub-game iframe');
      if (!fr) return { noIframe: true };
      const doc = fr.contentDocument;
      if (!doc) return { noAccess: true };
      const hub = [...document.querySelectorAll('a,button,[onclick]')]
        .find((e) => /게임 선택/.test(e.textContent || ''));
      let hubTop = null;
      if (hub) {
        const q = hub.getBoundingClientRect();
        const st = document.elementsFromPoint(q.x + q.width / 2, q.y + q.height / 2);
        hubTop = !!(st[0] && (st[0] === hub || hub.contains(st[0])));
      }
      return {
        scriptLoaded: !!doc.querySelector('script[src*="game-standalone-exit"]'),
        guardRan: !!(doc.defaultView && doc.defaultView.__mangoiGameExit),
        injected: !!doc.getElementById('mangoi-game-exit'),
        hubTop,
      };
    });
    check(`${mode}: 스크립트는 실렸다`, r.scriptLoaded === true, JSON.stringify(r));
    check(`${mode}: 가드가 돌았다`, r.guardRan === true, JSON.stringify(r));
    check(`${mode}: 버튼은 «넣지 않았다»`, r.injected === false, JSON.stringify(r));
    check(`${mode}: 허브 「← 게임 선택」이 여전히 맨 위`, r.hubTop === true, JSON.stringify(r));
  }
  await ctx.close();
}

/* ───────────────────────────────────────────────────────────────
   ② 직접 열면 나오고, **아무것도 가리지 않는다** (폰·PC 두 폭)
   ─────────────────────────────────────────────────────────────── */
for (const [label, w, h] of [['휴대폰 390x844', 390, 844], ['PC 1280x800', 1280, 800]]) {
  console.log(`\n▶ ② ${label} — 직접 열었을 때: 나온다 · 누름/글자를 안 덮는다`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  for (const g of INJECTED) {
    await page.goto(BASE + '/' + g + '.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const o = JSON.parse(await page.evaluate(PROBE));
    if (o.no) { check(g.padEnd(28), false, '버튼이 안 나왔다'); continue; }
    const clean = o.tap.length === 0 && o.glyph.length === 0;
    check(g.padEnd(28), clean, `y=${o.y}`
      + (o.tap.length ? ` 🔴누름=${JSON.stringify(o.tap)}` : '')
      + (o.glyph.length ? ` 🔴글자=${JSON.stringify(o.glyph)}` : ''));
  }
  await ctx.close();
}

/* ───────────────────────────────────────────────────────────────
   ③ 자기 나가는 문을 가진 게임에는 «문이 둘» 이 되지 않는다
   ─────────────────────────────────────────────────────────────── */
console.log('\n▶ ③ 이미 나가는 문이 있는 게임에는 넣지 않는다(문이 둘이 되면 안 된다)');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const g of HAS_OWN) {
    await page.goto(BASE + '/' + g + '.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => {
      const own = [...document.querySelectorAll('a,button')].filter((e) => {
        const t = (e.textContent || '').trim();
        return t && (t.charAt(0) === '←' || /^(나가기|exit|back)/i.test(t)) && e.offsetParent !== null;
      }).map((e) => (e.textContent || '').trim().slice(0, 14));
      return { own, injected: !!document.getElementById('mangoi-game-exit') };
    });
    check(g.padEnd(22), r.own.length > 0 && r.injected === false,
      `자기문=${JSON.stringify(r.own)} 주입=${r.injected}`);
  }
  await ctx.close();
}

/* ───────────────────────────────────────────────────────────────
   ④ 눌러서 실제로 게임 목록으로 가는가 · EN 이면 설명이 영어인가
   ─────────────────────────────────────────────────────────────── */
console.log('\n▶ ④ 눌러서 실제로 나가는가 · EN 라벨');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/student-game-tetris.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  const o = JSON.parse(await page.evaluate(PROBE));
  /* JS 가 죽어도 동작하도록 href 를 둔다 — «#» 이면 무반응 = 「버튼이 고장났다」 */
  check('href 가 게임 목록', o.href === '/student-games.html', String(o.href));
  await page.click('#mangoi-game-exit');
  await page.waitForTimeout(1200);
  check('실제 클릭 → 게임 목록으로 이동', new URL(page.url()).pathname === '/student-games.html', page.url());
  await ctx.close();
}
{
  /* ⛔ 아이콘 버튼에 data-ko/data-en 을 달면 안 된다(두 i18n 엔진이 textContent 를
     통째로 갈아끼워 34px 상자에 문장이 들어앉는다 — CLAUDE.md 2장).
     그래서 설명은 title·aria-label 로만 준다. 여기서 그것을 확인한다. */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mangoi_lang', 'en'); } catch (_) {} });
  const page = await ctx.newPage();
  await page.goto(BASE + '/student-game-tetris.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  const o = JSON.parse(await page.evaluate(PROBE));
  check('EN: title·aria 가 영어', o.title === 'Back to games' && o.aria === 'Back to games',
    JSON.stringify({ title: o.title, aria: o.aria }));
  check('EN: 본문 글자는 «←» 하나 (문장이 들어앉지 않는다)',
    await page.evaluate(() => document.getElementById('mangoi-game-exit').textContent === '←'));
  await ctx.close();
}

await browser.close();
server.close();

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
console.log('═'.repeat(60));
process.exit(fail ? 1 : 0);
