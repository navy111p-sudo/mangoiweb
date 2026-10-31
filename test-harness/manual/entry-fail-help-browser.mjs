// -*- coding: utf-8 -*-
// entry-fail-help-browser.mjs — 수업 입장 실패 안내 카드(P5)를 진짜 index.html 위에 띄워 «가려지지 않는가» 를 잰다.
//
//   [자동으로 안 돕니다 — 사람이 부릅니다]
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/entry-fail-help-browser.mjs
//   재는 것: 홈·수업 화면(vc-in-call) 두 상태 × 세 폭에서 카드의 버튼 가운데 «맨 위» 가 그 버튼인가
//   (elementFromPoint), 재연결 배너와 안 겹치는가, 화면 안에 있는가, 닫기를 누르면 사라지는가,
//   그리고 실제 idx-main.js 의 전역(createWebSocket·vcShowLocalPlaceholder)이 감싸져 있는가.
//   ⚠️ 카메라·소켓 실패 자체는 여기서 일으키지 않는다(그 판정은 자동 하니스 entry_fail_help_harness 가
//      가짜 전역으로 실제로 돌린다) — 여기서는 «떴을 때 보이고 눌리는가» 만 본다.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
  try { const b = await readFile(join(PUB, p === '/' ? 'index.html' : p.replace(/^\//, ''))); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'text/html; charset=utf-8' }); res.end(b); }
  catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { if (ok) { pass++; console.log('  ✅ ' + n + (x ? '  (' + x + ')' : '')); } else { fail++; console.log('  ❌ FAIL ' + n + (x ? '  → ' + x : '')); } };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const [w, h] of [[360, 640], [390, 844], [1280, 800]]) {
  for (const inCall of [false, true]) {
    console.log(`── ${w}×${h} ${inCall ? '수업 화면' : '홈'}`);
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(() => { try { localStorage.setItem('mangoi_onboard_v1', 'skip:0'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(BASE + '/?_nc=' + Date.now(), { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const r = await page.evaluate((inCall) => {
      const H = window.__mgEntryHelp;
      const out = { installed: !!H, wrappedWs: !!(window.createWebSocket && window.createWebSocket.__mehWrapped),
        wrappedPh: !!(window.vcShowLocalPlaceholder && window.vcShowLocalPlaceholder.__mehWrapped) };
      if (!H) return out;
      if (inCall) { document.body.classList.add('vc-in-call'); try { window.vcShowReconnecting && window.vcShowReconnecting(); } catch (e) {} }
      H.show('net');
      const card = document.getElementById('mg-entry-help');
      const cr = card.getBoundingClientRect();
      out.card = { top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right };
      out.vw = innerWidth; out.vh = innerHeight;
      out.btns = [...card.querySelectorAll('[data-meh]')].map((b) => {
        const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const t = document.elementFromPoint(x, y);
        return { k: b.getAttribute('data-meh'), top: !!(t && (t === b || b.contains(t))), who: t ? (t.id || t.className || t.tagName) : null, h: r.height };
      });
      const ban = document.getElementById('vc-reconnect-banner');
      if (ban && ban.classList.contains('show')) { ban.style.transition = 'none'; const br = ban.getBoundingClientRect(); out.ban = { top: br.top, bottom: br.bottom }; out.banOverlap = !(br.bottom <= cr.top || br.top >= cr.bottom); }
      return out;
    }, inCall);
    check('설치됨(index.html 에서 session-guard 절이 돈다)', r.installed);
    check('createWebSocket·vcShowLocalPlaceholder 를 감쌌다', r.wrappedWs && r.wrappedPh);
    if (r.card) {
      check('카드가 화면 안에 있다', r.card.top >= 0 && r.card.bottom <= r.vh && r.card.left >= 0 && r.card.right <= r.vw, JSON.stringify(r.card));
      for (const b of r.btns) check(`버튼 ${b.k}: 맨 위가 그 버튼(가려지지 않음)`, b.top, 'top=' + b.who);
      check('진단·카카오 버튼 높이 ≥ 36px', r.btns.filter(b => b.k !== 'x').every(b => b.h >= 36));
      if (inCall) check('재연결 배너와 겹치지 않는다', r.banOverlap === false || r.banOverlap === undefined, JSON.stringify({ ban: r.ban, card: r.card && r.card.top }));
      await page.click('#mg-entry-help [data-meh="x"]');
      const gone = await page.evaluate(() => document.getElementById('mg-entry-help').hidden);
      check('닫기를 누르면 사라진다', gone);
    }
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log('─'.repeat(60));
console.log('결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
