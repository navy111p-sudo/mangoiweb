// -*- coding: utf-8 -*-
// home-opening-btn-browser.mjs — 홈 «오프닝 소리» 🔊 버튼 안에 «글자» 가 들어앉지 않는가.
//
//   [왜 필요한가]  2026-08-24 사장님 제보 「이거 글자가 이상해」.
//     34px 짜리 동그란 버튼 자리에 «오프 / 닝 소 / 리 끄 / 기» 가 세 줄로 쪼개져 넘쳐 있었다.
//     원인은 i18n 엔진이다 — `[data-ko]` 가 붙은 요소는 **textContent 를 통째로 갈아끼운다.**
//     🌐 를 눌러도 설명이 따라오게 하려고 단 속성이 아이콘을 지우고 그 자리에 문장을 넣었다.
//     ✅ 설명은 «-title / -aria» 접미사로 옮겼다(그쪽은 title·aria-label 만 건드린다).
//   ⚠️ 이런 «어디에 어떻게 그려졌나» 는 문자열 하니스로 안 보인다 — 속성도 함수도 다 «있다».
//      그래서 진짜 Chromium 에 그려 놓고 textContent 와 scrollHeight 를 잰다.
//      (문자열 쪽 회귀 감시는 test-harness/home_opening_btn_harness.mjs 가 자동으로 한다)
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   js/idx-home-opening.js 의 버튼(syncBtn·injectStyle)이나 i18n 엔진을 건드리면 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/home-opening-btn-browser.mjs
//
//   ⚠️ file:// 로 열면 안 된다(외부 스크립트가 전부 404) — 그래서 작은 http 서버를 직접 띄운다.

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
  '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) {              // 로그인·서버 데이터 없이도 보이는 버튼이다
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":false}');
  }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

// «아이콘 하나» 인지, 그리고 그 내용이 동그라미를 넘지 않는지 함께 잰다.
//   ⚠️ textContent 만 보면 안 된다 — 「무엇이 들어 있나」와 「어디까지 번졌나」는 다른 질문이다.
const snap = (page) => page.evaluate(() => {
  const el = document.getElementById('mgo-sound-btn');
  if (!el) return null;
  const cs = getComputedStyle(el), rc = el.getBoundingClientRect();
  return {
    text: el.textContent, title: el.title, aria: el.getAttribute('aria-label'),
    ko: el.getAttribute('data-ko'), en: el.getAttribute('data-en'),
    koTitle: el.getAttribute('data-ko-title'),
    w: Math.round(rc.width), h: Math.round(rc.height),
    scrollH: el.scrollHeight, scrollW: el.scrollWidth,
    lines: Math.round(el.scrollHeight / (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize))),
  };
});
const isIcon = (t) => t === '🔊' || t === '🔇';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

for (const vp of [{ w: 390, h: 844, m: true, label: '휴대폰 390px' },
                  { w: 1440, h: 900, m: false, label: 'PC 1440px' }]) {
  console.log(`\n▶ ${vp.label}`);
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m });
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);          // 버튼은 boot() 에서 만들고, i18n 은 30ms 뒤 훑는다

  let s = await snap(page);
  check('① 버튼이 있다(검사 전제)', !!s, String(s));
  if (!s) { await ctx.close(); continue; }
  check('② 버튼 글자는 아이콘 하나다', isIcon(s.text), JSON.stringify(s.text));
  check('③ 내용이 동그라미를 안 넘는다', s.scrollH <= s.h && s.scrollW <= s.w + 1,
        `${s.scrollW}×${s.scrollH} vs 상자 ${s.w}×${s.h} (${s.lines}줄)`);
  check('④ data-ko/data-en 이 붙어 있지 않다', !s.ko && !s.en, JSON.stringify([s.ko, s.en]));
  check('⑤ 설명은 남아 있다(title·aria-label)', !!s.title && !!s.aria && !!s.koTitle, JSON.stringify(s.title));

  await page.evaluate(() => { try { window.setLang && window.setLang('en'); } catch (e) {} });
  await page.waitForTimeout(400);
  s = await snap(page);
  check('⑥ 🌐 EN 으로 바꿔도 아이콘 그대로다', isIcon(s.text), JSON.stringify(s.text));
  check('⑦ 🌐 EN 으로 바꾸면 설명이 영어가 된다', /opening sound/i.test(s.title || ''), JSON.stringify(s.title));

  await page.evaluate(() => document.getElementById('mgo-sound-btn').click());
  await page.waitForTimeout(600);
  s = await snap(page);
  check('⑧ 눌러 끈 뒤에도 아이콘 하나다', isIcon(s.text), JSON.stringify(s.text));
  check('⑨ 눌러 끈 뒤에도 data-ko 가 안 생긴다', !s.ko, JSON.stringify(s.ko));
  check('⑩ 눌러 끈 뒤에도 안 넘친다', s.scrollH <= s.h && s.scrollW <= s.w + 1,
        `${s.scrollW}×${s.scrollH} vs 상자 ${s.w}×${s.h}`);

  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '❌ 실패 ' + fail + '건 / ' : '✅ ') + '통과 ' + pass + '건');
process.exit(fail ? 1 : 0);
