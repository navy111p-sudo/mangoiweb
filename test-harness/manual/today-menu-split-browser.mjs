// -*- coding: utf-8 -*-
// 🚪🔴 「오늘 수업」·「지금 수업」 — 브라우저 검사                       (2026-09-01)
//
//   왜 브라우저인가 —
//     문자열 하니스(today_menu_split_harness.mjs)는 「그 배선이 있는가」까지만 본다.
//     여기서 걸리는 사고는 «열렸다 ≠ 보인다» 다 —
//       · 「오늘 수업」은 카드 «안의 칸»(sm-today-classes)을 가리키는 openSub 항목이라,
//         칸은 open=true 인데 화면은 카드 맨 위에 있는 상태가 실제로 있었다
//         (CLAUDE.md 2장 「카드는 열렸지만 그 «칸» 으로 화면이 안 감」 — ph97 의 카드 스크롤이
//          IA6 의 칸 맞추기를 죽인다). 그래서 «칸의 top 이 화면 안인가» 를 잰다.
//       · 사이드바 글자는 JS 가 그린다 — 파일에 적힌 이름과 화면 글자가 다를 수 있다.
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/today-menu-split-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8935;                       // 다른 검사와 겹치지 않게 (서비스워커 캐시 회피)
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

function requireBrowser() {
  const pw = loadPlaywright();
  const exe = findChromium();
  if (!pw || !exe) {
    console.log('  ⏭ playwright-core 또는 Chromium 없음 — 건너뜁니다.');
    console.log('     mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core');
    process.exit(0);
  }
  return { chromium: pw.chromium, exe };
}

async function serve() {
  try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error(`정적 서버를 못 띄웠습니다 (${PUBLIC})`);
}

async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  /* 🪤 빈 브라우저는 «첫 방문자» 라 환영 안내(#aw-overlay)가 html{overflow:hidden} 을 걸고
        사람이 닫아야 푼다 — 그대로 두면 스크롤을 재는 검사가 통째로 거짓 실패한다. */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.removeItem('mangoi_ia6_item');     // «마지막으로 보던 항목» 을 지우고 시작
    } catch (e) { /* 시크릿 */ }
  });
  await ctx.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ph85-sidebar [data-ia6-item]', { timeout: 30000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** 사이드바 항목을 누르고 화면이 멎을 때까지 기다린다 (IA6 는 1.8초 재보정을 돈다). */
async function clickItem(page, key) {
  const ok = await page.evaluate(k => {
    const el = document.querySelector('[data-ia6-item="' + k + '"]');
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.click();
    return true;
  }, key);
  await page.waitForTimeout(2400);      // smooth 스크롤 + 1.8초 재보정이 끝난 뒤에 잰다
  return ok;
}

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    console.log('\n[ ① 사이드바 「오늘」 맨 위 두 칸의 «보이는 글자» ]');
    let { page } = await open(browser, 1440, 900);

    const items = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#ph85-sidebar [data-ia6-item]').forEach(el => {
        const k = el.getAttribute('data-ia6-item');
        if (k && k.indexOf('today:') === 0) out.push({ key: k, text: (el.textContent || '').trim() });
      });
      return out;
    });
    check('「오늘」 그룹 항목을 읽었다 (' + items.length + '개)', items.length >= 5);
    check('첫 칸이 「오늘 수업」이다',
      items[0] && items[0].text.indexOf('오늘 수업') === 0, items[0] && items[0].text);
    check('둘째 칸이 「지금 수업」이다',
      items[1] && items[1].text.indexOf('지금 수업') === 0, items[1] && items[1].text);
    check('⛔ 옛 이름 「오늘의 수업」이 사이드바에 없다',
      !items.some(i => i.text.indexOf('오늘의 수업') >= 0), JSON.stringify(items.map(i => i.text)));

    console.log('\n[ ② 「오늘 수업」 — 카드가 열리고 «그 칸» 이 화면 안으로 오는가 ]');
    check('항목을 눌렀다', await clickItem(page, 'today:오늘 수업'));
    const all = await page.evaluate(() => {
      const card = document.getElementById('card-students-mgmt');
      const sec = document.getElementById('sm-today-classes');
      const r = sec ? sec.getBoundingClientRect() : null;
      const z = parseFloat(document.body.style.zoom || getComputedStyle(document.body).zoom) || 1;
      return {
        cardShown: !!card && getComputedStyle(card).display !== 'none' && !!card.offsetParent,
        secOpen: !!sec && sec.open,
        top: r ? Math.round(r.top) : null,
        vh: window.innerHeight, z,
        title: sec ? (sec.querySelector('summary') || {}).textContent : null,
      };
    });
    check('학생 관리 카드가 보인다', all.cardShown, JSON.stringify(all));
    check('「오늘 수업」 칸이 펼쳐졌다 (open)', all.secOpen, JSON.stringify(all));
    /* 🪤 「열렸다」와 「보인다」는 다르다 — 칸 제목줄이 화면 «안» 에 있어야 한다. */
    check('그 칸의 제목줄이 화면 안에 있다 (카드 맨 위에 멈추지 않았다)',
      all.top !== null && all.top > -40 && all.top < all.vh, JSON.stringify(all));
    check('칸 제목이 「🚪 오늘 수업 (전체 · 바로 입장)」이다',
      String(all.title || '').indexOf('오늘 수업 (전체 · 바로 입장)') >= 0, String(all.title));

    console.log('\n[ ③ 「지금 수업」 — 실시간 카드가 열리는가 ]');
    check('항목을 눌렀다', await clickItem(page, 'today:지금 수업'));
    const live = await page.evaluate(() => {
      const card = document.getElementById('card-active-rooms');
      const r = card ? card.getBoundingClientRect() : null;
      return {
        shown: !!card && getComputedStyle(card).display !== 'none' && !!card.offsetParent,
        top: r ? Math.round(r.top) : null, vh: window.innerHeight,
        title: card ? (card.querySelector('summary') || {}).textContent : null,
        inviteShown: (() => {
          const c = document.getElementById('card-room-invite');
          return !!c && getComputedStyle(c).display !== 'none' && !!c.offsetParent;
        })(),
      };
    });
    check('실시간 카드가 보인다', live.shown, JSON.stringify(live));
    check('카드가 화면 안으로 왔다', live.top !== null && live.top > -40 && live.top < live.vh, JSON.stringify(live));
    check('제목이 「🔴 지금 수업 (실시간)」이다',
      String(live.title || '').indexOf('지금 수업 (실시간)') >= 0, String(live.title));
    check('⛔ 성격이 다른 초대 카드가 함께 딸려 나오지 않는다', live.inviteShown === false, JSON.stringify(live));

    console.log('\n[ ④ 떼어 낸 초대 카드가 «갈 곳» 을 잃지 않았는가 ]');
    check('시스템 › 화상강의실 초대 항목을 눌렀다', await clickItem(page, 'ops:화상강의실 초대'));
    const inv = await page.evaluate(() => {
      const c = document.getElementById('card-room-invite');
      const r = c ? c.getBoundingClientRect() : null;
      return { shown: !!c && getComputedStyle(c).display !== 'none' && !!c.offsetParent,
               top: r ? Math.round(r.top) : null, vh: window.innerHeight };
    });
    check('초대 카드가 보인다', inv.shown, JSON.stringify(inv));
    check('화면 안으로 왔다', inv.top !== null && inv.top > -40 && inv.top < inv.vh, JSON.stringify(inv));

    console.log('\n[ ⑤ 폰 390×844 — 좁은 화면에서도 두 칸이 보이는가 ]');
    await page.context().close();
    ({ page } = await open(browser, 390, 844));
    const mob = await page.evaluate(() => {
      const a = document.querySelector('[data-ia6-item="today:오늘 수업"]');
      const b = document.querySelector('[data-ia6-item="today:지금 수업"]');
      return { a: !!a, b: !!b,
               at: a ? (a.textContent || '').trim() : null,
               bt: b ? (b.textContent || '').trim() : null,
               over: document.documentElement.scrollWidth - window.innerWidth };
    });
    check('두 칸이 폰에서도 있다', mob.a && mob.b, JSON.stringify(mob));
    check('이름이 한 줄로 읽힌다 (설명 괄호를 안 붙인 이유)',
      String(mob.at).indexOf('오늘 수업') === 0 && String(mob.bt).indexOf('지금 수업') === 0,
      JSON.stringify(mob));
    check('문서가 가로로 안 넘친다', mob.over <= 1, String(mob.over));

  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log('\n──────────────────────────────────────────');
  console.log(`PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
