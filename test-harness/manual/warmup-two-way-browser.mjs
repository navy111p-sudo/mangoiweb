// -*- coding: utf-8 -*-
// warmup-two-way-browser.mjs — 웜업 «두 갈래로 시작»(교재로 / 자유 대화로) 브라우저 검사
//
//   [왜] 2026-09-16 사장님 「BTS교재가 맨 뒤에 있어서 찾기가 어려워. 차라리 «교재로 웜업» 이란
//     부분을 화면 상단에」 → 시안 4종 중 **3안**(두 갈래로 시작)을 고르셨다.
//     재 보니 교재 칸은 PC·노트북 top 1380px · 폰 1577px 로 어느 화면에서도 첫 화면 밖이었고,
//     폰 첫 화면에는 «대화 수준» 조차 안 보이는데 🚀 시작 버튼은 sticky 라 늘 보여
//     스크롤할 이유가 없었다 ⟹ 교재가 있는 줄도 모르고 «자유 대화» 로 시작한다.
//
//   [문자열 하니스로는 못 잡는다] 함수도 값도 다 «있고» 틀린 것은 «무엇이 어디에 그려지는가 ·
//     화면이 사실을 말하는가» 뿐이다. 수리 전에도 --fast 가 전부 초록이었다.
//
//   [자동으로 안 돕니다] manual/ 규약상 게이트가 물어 가지 않는다. 웜업 설정 화면의 두 갈래·
//   교재 칸·수준 목록을 건드리면 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/warmup-two-way-browser.mjs
//
//   [변이시험 — 되돌리면 실제로 FAIL 난다 (2026-09-16 실측, 기준 0)]
//     Ⓐ btsSortLevel 의 고정 제거(_warmLevel 로)        → 실패 3
//     Ⓑ 두 갈래 클릭 처리 제거                           → 실패 3
//     Ⓒ 중국어에서 두 갈래를 감추지 않음                 → 실패 1
//     Ⓓ 「지금」 배지를 «갈래» 로 되돌림(거짓말)          → 실패 6
//     Ⓔ 목록 안 «교재 없이 자유 대화» 되살리기(중복)     → 실패 3
//     Ⓕ 하단 «고르기 ↑» 의 펼치기 제거                   → 실패 3
//
//   ⛔ 「교재로 하면 된다」만 재지 마세요 — «자유 대화는 예전 그대로다» 를 짝으로 봅니다.
//      짝이 없으면 «전부 교재 모드» 도, «전부 감추기» 도 통과합니다.
//   ⛔ 「지금」 배지와 «펼친 갈래»(on) 를 같은 것으로 재지 마세요 — 그 둘이 갈라져 있다는 것이
//      이 수리의 핵심입니다(펼치기만 하고 안 고른 상태에서 「교재로 · 지금」 은 거짓말입니다).
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
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (x === undefined ? '' : '  → ' + JSON.stringify(x))); } };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const errs = [];

/* 화면 상태를 «한 번에» 읽는다 — 「보인다」·「지금이다」·「어디에 있다」는 다른 값이다. */
const readState = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s), qa = (s) => Array.from(document.querySelectorAll(s));
  const onC = q('#wusTwoWay .wus-twoc.on');
  const nowC = qa('#wusTwoWay .wus-twoc').find((c) => c.querySelector('.wus-now'));
  const sec = document.getElementById('wusBooksSec'), two = document.getElementById('wusTwoSec');
  if (!sec || !two) return { missing: true };
  const rb = sec.getBoundingClientRect(), rt = two.getBoundingClientRect();
  return {
    onWay: onC ? onC.getAttribute('data-way') : null,
    nowWay: nowC ? nowC.getAttribute('data-way') : null,
    booksHidden: sec.hidden, booksDisp: getComputedStyle(sec).display,
    booksTop: Math.round(rb.top), twoTop: Math.round(rt.top), vh: innerHeight,
    freeInList: !!q('#wusBooks [data-bts="0"]'), items: qa('#wusBooks [data-bts]').length,
    order: qa('#wusBooks > .wus-list [data-bts]').map((x) => x.getAttribute('data-bts')).slice(0, 4),
    bookDesc: (q('#wusTwoWay [data-way="book"] .wus-two-ds') || {}).textContent || '',
    bn: (document.getElementById('wusBookNow') || {}).textContent || '',
    hscroll: document.documentElement.scrollWidth > innerWidth,
  };
});

for (const [w, h, label] of [[390, 844, '휴대폰'], [1280, 800, '노트북'], [1920, 1040, 'PC']]) {
  console.log(`\n══ ${w}×${h} (${label}) ══`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  await page.addInitScript(() => { try {
    localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo', name: '데모', role: 'student' }));
    localStorage.setItem('mangoi_warmup_level', '3');
    localStorage.removeItem('mangoi_warmup_bts');
  } catch (e) { /* 비공개 창 */ } });
  await page.goto(`${BASE}/warmup.html?_nc=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1100);
  await page.evaluate(() => { try { openSetup(false); } catch (e) { /* 아직 없음 */ } });
  await page.waitForTimeout(450);

  let d = await readState(page);
  /* ⛔ 요소가 없으면 크래시가 아니라 «깔끔한 FAIL» 이어야 한다 — 무엇이 깨졌는지 보이게. */
  if (d.missing) { ck(`[${label}] 전제: 두 갈래·교재 칸이 화면에 있다`, false, 'wusTwoSec/wusBooksSec 없음'); await ctx.close(); continue; }
  ck(`① [${label}] 두 갈래가 첫 화면 안에 있다`, d.twoTop >= 0 && d.twoTop < d.vh, [d.twoTop, d.vh]);
  ck(`① [${label}] 처음엔 교재 목록이 접혀 있다`, d.booksHidden === true && d.booksDisp === 'none', [d.booksHidden, d.booksDisp]);
  ck(`① [${label}] 처음엔 «자유 대화» 가 지금(짝)`, d.nowWay === 'free' && d.onWay === 'free', [d.onWay, d.nowWay]);
  ck(`① [${label}] 가로 넘침이 없다`, !d.hscroll);

  await page.click('#wusTwoWay [data-way="book"]');
  await page.waitForTimeout(700);
  d = await readState(page);
  ck(`② [${label}] 「교재로 웜업」 을 누르면 펼쳐진다`, !d.booksHidden && d.booksDisp !== 'none', [d.booksHidden, d.booksDisp]);
  ck(`② [${label}] 펼친 목록이 첫 화면 안에서 시작한다`, d.booksTop >= 0 && d.booksTop < d.vh, [d.booksTop, d.vh]);
  ck(`② [${label}] 갈래는 «교재로»`, d.onWay === 'book', d.onWay);
  /* 🔑 아직 안 골랐으면 실제로는 자유 대화다 — 화면이 그 사실을 말해야 한다. */
  ck(`② [${label}] 안 골랐으면 「지금」 은 여전히 자유 대화(거짓말 안 함)`, d.nowWay === 'free', d.nowWay);
  ck(`② [${label}] 카드가 «아래에서 고르라» 고 말한다`, /골라/.test(d.bookDesc), d.bookDesc);
  ck(`② [${label}] 하단 줄도 «자유 대화» 라고 말한다(짝)`, /자유 대화/.test(d.bn), d.bn.slice(0, 40));
  ck(`② [${label}] 목록 안에 «교재 없이 자유 대화» 중복이 없다`, !d.freeInList);
  ck(`② [${label}] 교재가 실제로 그려졌다(전제)`, d.items > 5, d.items);
  const order0 = d.order;

  await page.click('#wusBooks [data-bts]:not([data-bts="0"])');
  await page.waitForTimeout(600);
  d = await readState(page);
  ck(`③ [${label}] 고르면 「지금」 이 «교재로» 로 옮겨간다`, d.nowWay === 'book', d.nowWay);
  ck(`③ [${label}] 하단 줄이 교재를 말한다(짝)`, /지금 교재/.test(d.bn), d.bn.slice(0, 40));

  /* ⛔ 이 절이 이 수리의 핵심이다 — 교재가 수준 «위» 로 올라왔으므로, 고정이 없으면
     수준을 고를 때마다 위쪽 목록이 눈앞에서 재정렬된다(CLAUDE.md 가 못 박아 둔 자리). */
  await page.evaluate(() => { const b = document.querySelector('#wusLevels [data-lvl="8"]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  d = await readState(page);
  ck(`④ [${label}] ⛔ 수준을 바꿔도 위쪽 목록이 재정렬되지 않는다`,
    JSON.stringify(order0) === JSON.stringify(d.order), [order0, d.order]);
  ck(`④ [${label}] 고른 교재는 그대로 «지금»`, d.nowWay === 'book', d.nowWay);

  await page.click('#wusTwoWay [data-way="free"]');
  await page.waitForTimeout(500);
  d = await readState(page);
  ck(`⑤ [${label}] 「자유 대화」 를 누르면 접힌다`, d.booksHidden === true, d.booksHidden);
  ck(`⑤ [${label}] 「지금」 도 자유 대화로 돌아온다(짝)`, d.nowWay === 'free' && d.onWay === 'free', [d.onWay, d.nowWay]);
  ck(`⑤ [${label}] 하단 줄도 자유 대화(짝)`, /자유 대화/.test(d.bn), d.bn.slice(0, 40));

  /* 하단 «고르기 ↑» 는 접힌 자리로 데려가야 한다 — 접힌 채 스크롤만 하면 아무 일도 안 일어난다. */
  await page.click('#wusBookNow');
  await page.waitForTimeout(700);
  d = await readState(page);
  ck(`⑥ [${label}] 하단 «고르기 ↑» 를 누르면 펼쳐진다`, d.booksHidden === false, d.booksHidden);
  await ctx.close();
}

/* 🀄 중국어에는 BTS 가 없다 — 두 갈래·교재 칸·하단 줄이 «짝» 으로 함께 감춰져야 한다.
   ⛔ 한쪽만 감추면 「교재로 웜업」 이 남아 없는 곳으로 데려간다. */
console.log('\n══ 중국어 (짝으로 감추는가) ══');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`중국어: ${e.message}`));
  await page.addInitScript(() => { try {
    localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo', name: '데모', role: 'student' }));
  } catch (e) { /* 비공개 창 */ } });
  await page.goto(`${BASE}/warmup.html?_nc=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { try { openSetup(false);
    const b = document.querySelector('#wusLangs [data-lang="zh"]'); if (b) b.click(); } catch (e) { /* 아직 없음 */ } });
  await page.waitForTimeout(500);
  const z = await page.evaluate(() => ({
    two: document.getElementById('wusTwoSec').hidden,
    twoDisp: getComputedStyle(document.getElementById('wusTwoSec')).display,
    books: document.getElementById('wusBooksSec').hidden,
    bn: document.getElementById('wusBookNow').hidden,
  }));
  ck('중국어: 두 갈래가 감춰진다', z.two === true && z.twoDisp === 'none', [z.two, z.twoDisp]);
  ck('중국어: 교재 칸도 감춰진다(짝)', z.books === true, z.books);
  ck('중국어: 하단 교재 줄도 감춰진다(짝)', z.bn === true, z.bn);
  await ctx.close();
}

console.log(`\nwarmup-two-way-browser — PASS ${pass} / FAIL ${fail}`);
if (errs.length) { console.log('JS 오류:'); errs.forEach((e) => console.log('  ! ' + e)); }
await browser.close();
server.close();
process.exit(fail || errs.length ? 1 : 0);
