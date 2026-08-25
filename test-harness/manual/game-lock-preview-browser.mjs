// -*- coding: utf-8 -*-
// game-lock-preview-browser.mjs — 게임 허브의 «미리보기 + 순차 잠금» 을 **진짜 브라우저에 그려서** 잰다.
//
//   [왜 필요한가]  이 작업의 핵심 요구는 「자물쇠·잠금 UI 가 제목/설명 글자와 겹치지 않을 것」이다.
//     그건 «좌표» 문제라 문자열 하니스로는 볼 수 없다 — 2026-08-20 경로 줄 사고 때
//     타입체크·회귀 하니스 211개·CI 게이트가 전부 초록이었는데 화면은 틀렸다(CLAUDE.md 2장).
//     그래서 getBoundingClientRect() 로 겹침을 재고, elementsFromPoint 로 «맨 위에 무엇이
//     있나» 까지 본다 — 「보인다」와 「안 가려졌다」는 다르다.
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   게임 카드·잠금·미리보기를 건드리면 **사람이 불러야** 한다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/game-lock-preview-browser.mjs
//
//   ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 의 절대경로가 파일시스템 루트를 가리켜
//      외부 스크립트가 전부 404 가 되고, 에러가 화면에 안 떠 «기능이 죽었다» 로 오진한다
//      (CLAUDE.md 2장). 그래서 이 파일이 직접 작은 http 서버를 띄운다.
//   ⚠️ 헤드리스 크로미움의 «최소 뷰포트 500px» 함정은 --window-size 를 쓸 때 이야기다.
//      여기서는 playwright 의 context viewport 를 쓰므로 390px 도 그대로 레이아웃된다.

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
  // 로그인·서버 데이터는 없어도 되는 화면이다 — /api/* 는 빈 응답으로 막아 둔다
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
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

for (const [label, w, h] of [['휴대폰 390', 390, 844], ['태블릿 768', 768, 1024], ['PC 1440', 1440, 900]]) {
  console.log('\n▶ ' + label);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  // 🎯 퀘스트 모드를 켠 «신규 학생» 상태로 연다 (학생이 직접 고른 것으로 표시해 서버 판정이 안 뒤집게)
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_quest_mode', 'on');
      localStorage.setItem('mangoi_quest_src', 'user');
      localStorage.removeItem('mangoi_game_clears');
      localStorage.removeItem('mangoi_leveltest_pass');
    } catch (_) {}
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/student-games.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.game-card.locked', { timeout: 15000 }).catch(() => {});

  const grid = await page.evaluate(() => {
    const all = document.querySelectorAll('.game-card');
    const locked = document.querySelectorAll('.game-card.locked');
    const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const bad = [];
    let chips = 0, notes = 0;
    locked.forEach((c) => {
      const ttl = c.querySelector('.ttl'), dsc = c.querySelector('.dsc');
      const chip = c.querySelector('.lockchip'), note = c.querySelector('.locknote');
      if (chip) chips++;
      if (note) notes++;
      [['제목', ttl], ['설명', dsc]].forEach(([n, el]) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        [['자물쇠칩', chip], ['해금안내', note]].forEach(([m, o]) => {
          if (o && hit(r, o.getBoundingClientRect())) bad.push(c.dataset.mode + ': ' + m + ' × ' + n);
        });
      });
    });
    // 「보인다」가 아니라 「안 가려졌다」 — 제목 한가운데에서 맨 위에 무엇이 있나
    let covered = [];
    locked.forEach((c) => {
      const ttl = c.querySelector('.ttl'); if (!ttl) return;
      const r = ttl.getBoundingClientRect();
      if (r.width < 2 || r.top < 0 || r.top > innerHeight) return;   // 화면 밖은 판정 불가
      const top = document.elementsFromPoint(r.left + Math.min(20, r.width / 2), r.top + r.height / 2)[0];
      if (top && !ttl.contains(top) && top !== ttl) covered.push(c.dataset.mode + ' ← ' + top.className);
    });
    // 사진이 살아 있나 (미리보기가 목적이라 회색으로 죽이면 안 된다)
    const ph = locked[0] && locked[0].querySelector('.ph');
    const filt = ph ? getComputedStyle(ph).filter : '';
    /* 🔴 해금 안내는 «한 줄 문장» 이다. flex 로 두면 글자마디와 <b> 가 각각 아이템이 되어
       좁은 폭에서 「게 1 클리어하면 열 / 임 개 려요」로 쪼개진다(2026-08-22 실측 390px).
       문자열 하니스로는 절대 안 보이는 종류의 사고라 여기서 «실제 줄 수» 로 잰다. */
    const shred = [];
    locked.forEach((c) => {
      const n = c.querySelector('.locknote'); if (!n) return;
      const cs = getComputedStyle(n);
      const lines = Math.round(n.getBoundingClientRect().height / parseFloat(cs.lineHeight || '18'));
      if (cs.display === 'flex' || lines > 2) shred.push(c.dataset.mode + ' ' + cs.display + ' ' + lines + '줄');
    });
    return {
      total: all.length, locked: locked.length, chips, notes, bad, covered, shred,
      filter: filt, docOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });

  check('잠긴 카드가 그려진다 (' + grid.locked + '/' + grid.total + ')', grid.locked > 0);
  check('잠긴 카드마다 자물쇠 칩이 있다', grid.chips === grid.locked, grid.chips + '/' + grid.locked);
  check('잠긴 카드마다 해금 안내 줄이 있다', grid.notes === grid.locked, grid.notes + '/' + grid.locked);
  /* 🔴 이 작업의 핵심 요구 — 자물쇠 UI 가 제목·설명과 «한 픽셀도» 겹치지 않는다 */
  check('자물쇠·해금안내가 제목·설명과 안 겹친다', grid.bad.length === 0, grid.bad.slice(0, 4).join(' | '));
  check('제목이 무엇에도 안 가려진다', grid.covered.length === 0, grid.covered.slice(0, 4).join(' | '));
  check('사진을 흑백으로 죽이지 않는다', !/grayscale\(\s*0?\.[5-9]/.test(grid.filter), grid.filter);
  check('해금 안내가 낱글자로 쪼개지지 않는다', grid.shred.length === 0, grid.shred.slice(0, 3).join(' | '));
  check('문서가 가로로 안 넘친다', !grid.docOverflow);

  // ── 👀 미리보기 창 ───────────────────────────────────────────
  await page.evaluate(() => {
    const c = document.querySelector('.game-card.locked');
    if (c) c.click();
  });
  await page.waitForSelector('.pv-media', { timeout: 8000 }).catch(() => {});
  const pv = await page.evaluate(() => {
    const back = document.getElementById('modal-back');
    const h2 = document.querySelector('.pv-body h2');
    const dsc = document.querySelector('.pv-body .pv-dsc');
    const lock = document.querySelector('.pv-media .pv-lock');
    const need = document.querySelector('.pv-gate .pv-need');
    const ways = document.querySelectorAll('.pv-gate .pv-way');
    const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const out = {
      open: !!(back && back.classList.contains('on')),
      hasMedia: !!document.querySelector('.pv-media img, .pv-media video'),
      title: h2 ? h2.textContent.trim().slice(0, 30) : '',
      needTxt: need ? need.textContent.trim() : '',
      ways: Array.prototype.map.call(ways, (b) => b.textContent.trim().slice(0, 26)),
      overlap: [], coveredTop: '', docOverflow: document.documentElement.scrollWidth > innerWidth,
      dots: document.querySelectorAll('.pv-dots i').length,
      shotW: (document.querySelector('.pv-media img') || {}).naturalWidth || 0,
      shotSrc: ((document.querySelector('.pv-media img') || {}).getAttribute
        ? document.querySelector('.pv-media img').getAttribute('src') : '') || '',
    };
    if (h2 && lock && hit(h2.getBoundingClientRect(), lock.getBoundingClientRect())) out.overlap.push('자물쇠 × 제목');
    if (dsc && lock && hit(dsc.getBoundingClientRect(), lock.getBoundingClientRect())) out.overlap.push('자물쇠 × 설명');
    if (h2) {
      const r = h2.getBoundingClientRect();
      const t = document.elementsFromPoint(r.left + 10, r.top + r.height / 2)[0];
      if (t && !h2.contains(t) && t !== h2) out.coveredTop = t.className || t.tagName;
    }
    return out;
  });

  check('잠긴 카드를 누르면 미리보기가 열린다', pv.open && pv.hasMedia);
  check('제목이 나온다 — ' + pv.title, !!pv.title);
  check('자물쇠 표시가 제목·설명을 안 가린다', pv.overlap.length === 0, pv.overlap.join(' | '));
  check('제목이 무엇에도 안 가려진다', !pv.coveredTop, pv.coveredTop);
  check('해금 조건이 «몇 개» 로 나온다 — ' + pv.needTxt, /\d+개/.test(pv.needTxt));
  check('여는 방법이 두 가지 나온다', pv.ways.length === 2, JSON.stringify(pv.ways));
  check('그중 하나가 레벨테스트다', pv.ways.some((t) => t.indexOf('레벨테스트') >= 0), JSON.stringify(pv.ways));
  check('미리보기 창이 가로로 안 넘친다', !pv.docOverflow);
  /* 🎞 슬라이드 — 실제 플레이 화면 2장이 뜨고, 점이 그 수만큼 나오는가.
     사진이 404 면 img 는 남지만 naturalWidth 가 0 이라 «회색 상자» 가 된다 → 그것까지 잰다. */
  check('미리보기 사진이 실제로 받아졌다 (' + pv.shotW + 'px)', pv.shotW > 100, JSON.stringify(pv.shotSrc));
  check('슬라이드 점이 사진 수만큼 있다 (' + pv.dots + ')', pv.dots >= 2, String(pv.dots));

  // ── 🎫 레벨테스트를 통과하면 잠금이 사라진다 ──────────────────
  const after = await page.evaluate(() => {
    closeModal();
    _questApplyServer({ ok: true, leveltest_passed: true, attempts: 0 });
    return {
      locked: document.querySelectorAll('.game-card.locked').length,
      chips: document.querySelectorAll('.lockchip').length,
      notes: document.querySelectorAll('.locknote').length,
    };
  });
  check('레벨테스트 통과 → 잠긴 카드 0개', after.locked === 0, String(after.locked));
  check('자물쇠·해금 안내도 함께 사라진다', after.chips === 0 && after.notes === 0,
    after.chips + '/' + after.notes);


  /* ── 📱 퀘스트 바 버튼 설명 — 「폰에서도 보이는가」 ────────────────
     title 툴팁은 마우스 전용이라 터치 기기에서는 영영 안 뜬다. 그래서 같은 글을
     .qhint 로 한 번 더 그리고 마우스가 있는 화면에서만 CSS 로 감춘다.
     그 «감춤/보임» 은 좌표·계산값 문제라 문자열 하니스로는 볼 수 없다. */
  await page.evaluate(() => {
    // 잠금이 풀린 상태로 끝났으므로 퀘스트 모드를 다시 켜서 버튼 세 개를 모두 만든다
    try { localStorage.setItem('mangoi_quest_mode', 'on'); localStorage.setItem('mangoi_quest_src', 'user'); } catch (_) {}
    _setLeveltestPass(false);
    _questMode = true;
    hubRenderMenu();
  });
  const qb = await page.evaluate(() => {
    const wraps = Array.prototype.slice.call(document.querySelectorAll('#quest-bar .qwrap'));
    const out = { n: wraps.length, btns: [], noHint: [], shred: [], hidden: [], flex: [] };
    wraps.forEach((w) => {
      const b = w.querySelector('.qbtn'), h = w.querySelector('.qhint');
      const label = b ? b.textContent.trim() : '(버튼없음)';
      out.btns.push(label);
      if (!h || !h.textContent.trim()) { out.noHint.push(label); return; }
      // 버튼의 title 과 화면 설명이 같은 글이어야 한다(한쪽만 고치는 사고 방지)
      if (b.getAttribute('title') !== h.textContent.trim()) out.noHint.push(label + '(title≠글)');
      const cs = getComputedStyle(h);
      const r = h.getBoundingClientRect();
      if (cs.display === 'none' || r.height < 1) out.hidden.push(label);
      // 낱글자 쪼개짐 — 잠긴 카드 안내와 같은 사고(CLAUDE.md 2장). display:flex 면 그 자체가 위험
      if (getComputedStyle(w).display === 'flex') out.flex.push(label);
      const lines = Math.round(r.height / parseFloat(cs.lineHeight || '16'));
      if (lines > 3) out.shred.push(label + ' ' + lines + '줄');
    });
    return out;
  });
  const touch = w <= 640;   // 이 검사에서 «폰» 으로 보는 폭
  /* 퀘스트 모드일 때 바에 서는 버튼은 «두 개» 다(레벨테스트 · 전체 열기).
     「퀘스트 모드로 하기」는 반대 상태(전체 개방)에서만 나오므로 아래에서 따로 본다. */
  check('퀘스트 바 버튼이 두 개다 (' + qb.n + ')', qb.n === 2, JSON.stringify(qb.btns));
  check('버튼마다 설명 글이 붙어 있다', qb.noHint.length === 0, qb.noHint.join(' | '));
  check('.qwrap 을 flex 로 두지 않았다', qb.flex.length === 0, qb.flex.join(' | '));
  if (touch) {
    /* 🔴 이 작업의 핵심 요구 — 폰에서 설명이 «화면에» 보여야 한다 */
    check('폰: 설명이 화면에 보인다', qb.hidden.length === 0, qb.hidden.join(' | '));
    check('폰: 설명이 낱글자로 쪼개지지 않는다', qb.shred.length === 0, qb.shred.join(' | '));
  } else {
    check('PC: 설명은 툴팁이 대신하므로 감춘다', qb.hidden.length === qb.n,
      qb.hidden.length + '/' + qb.n);
  }
  const qbOver = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check('퀘스트 바를 그려도 가로로 안 넘친다', !qbOver);

  /* 반대 상태(전체 개방)의 「퀘스트 모드로 하기」에도 같은 설명이 붙는가 —
     세 버튼 중 하나만 빠뜨리는 것이 흔한 사고라 상태를 바꿔서 확인한다. */
  const qb2 = await page.evaluate(() => {
    _questMode = false; hubRenderMenu();
    const w = document.querySelector('#quest-bar .qwrap');
    if (!w) return { n: 0 };
    const b = w.querySelector('.qbtn'), h = w.querySelector('.qhint');
    return {
      n: document.querySelectorAll('#quest-bar .qwrap').length,
      label: b ? b.textContent.trim() : '',
      same: !!(b && h && b.getAttribute('title') === h.textContent.trim()),
      shown: !!(h && getComputedStyle(h).display !== 'none' && h.getBoundingClientRect().height >= 1),
    };
  });
  check('전체 개방 상태에도 버튼 설명이 있다 — ' + qb2.label, qb2.n === 1 && qb2.same,
    JSON.stringify(qb2));
  check(touch ? '폰: 그 설명도 화면에 보인다' : 'PC: 그 설명은 툴팁이 대신한다',
    touch ? qb2.shown : !qb2.shown, String(qb2.shown));

  await ctx.close();
}

/* ── 📱 «진짜 터치 기기» 한 판 더 ────────────────────────────────
   위 반복문의 문맥은 폭만 다를 뿐 전부 «마우스 있는» 기기로 보고된다(hover:hover).
   폰이 실제로 보는 길은 hover:none 쪽이므로 isMobile/hasTouch 로 한 번 더 확인한다 —
   이게 통과해야 「폰에서도 보인다」를 사실로 말할 수 있다. */
{
  console.log('\n▶ 터치 기기 390 (hover:none)');
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_quest_mode', 'on');
      localStorage.setItem('mangoi_quest_src', 'user');
      localStorage.removeItem('mangoi_game_clears');
      localStorage.removeItem('mangoi_leveltest_pass');
    } catch (_) {}
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/student-games.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#quest-bar .qwrap', { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const out = { hoverNone: matchMedia('(hover:none)').matches, n: 0, hidden: [], shred: [], texts: [] };
    document.querySelectorAll('#quest-bar .qwrap').forEach((w) => {
      out.n++;
      const b = w.querySelector('.qbtn'), h = w.querySelector('.qhint');
      const label = b ? b.textContent.trim() : '?';
      if (!h) { out.hidden.push(label + '(없음)'); return; }
      const cs = getComputedStyle(h), rc = h.getBoundingClientRect();
      out.texts.push(h.textContent.trim().slice(0, 18));
      if (cs.display === 'none' || rc.height < 1) out.hidden.push(label);
      const lines = Math.round(rc.height / parseFloat(cs.lineHeight || '16'));
      if (lines > 3) out.shred.push(label + ' ' + lines + '줄');
    });
    out.overflow = document.documentElement.scrollWidth > innerWidth;
    return out;
  });
  check('이 문맥이 실제로 터치 기기로 보고된다 (hover:none)', r.hoverNone);
  check('버튼 두 개가 그려진다 (' + r.n + ')', r.n === 2);
  /* 🔴 사장님 요구 그대로 — 폰에서 «마우스 없이» 설명이 보이는가 */
  check('터치 기기: 설명이 화면에 보인다', r.n > 0 && r.hidden.length === 0, r.hidden.join(' | '));
  check('터치 기기: 설명이 낱글자로 쪼개지지 않는다', r.shred.length === 0, r.shred.join(' | '));
  check('터치 기기: 가로로 안 넘친다', !r.overflow);
  console.log('     설명: ' + JSON.stringify(r.texts));
  await ctx.close();
}

await browser.close();
server.close();

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
console.log('═'.repeat(60));
process.exit(fail ? 1 : 0);
