// -*- coding: utf-8 -*-
// 🧑‍🏫 강사 명부 «상태 그 자리에서 바꾸기» — 브라우저 검사 (2026-09-01)
//
//   왜 브라우저인가 —
//     문자열 하니스(teacher_status_inline_harness.mjs)는 「그 코드가 있는가」까지만 본다.
//     여기서 걸리는 사고는 전부 «몇 px 이고 무엇이 맨 위인가» 뿐이다 —
//       · 전역 룰 `details.menu-card button{background:인디고!important; padding:9px 18px!important}`
//         이 상태 버튼을 큰 파란 알약으로 뭉개는가 (CLAUDE.md 2장 「표 안의 작은 아이콘 버튼」)
//       · `body{zoom:1.3}` 때문에 메뉴가 버튼에서 떨어져 엉뚱한 데 뜨는가
//       · 표를 감싼 `overflow-x:auto` 상자가 메뉴를 잘라 먹는가
//       · 「열렸다」와 「보인다」와 「눌린다」는 다르다 → elementsFromPoint 로 맨 위를 잰다
//       · 글자가 실제로 읽히는가 (WCAG 대비)
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/teacher-status-inline-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8931;                       // 다른 검사와 겹치지 않게 (서비스워커 캐시 회피)
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

/** 명부 씨앗 — 실제 운영 D1(2026-09-01)에서 본 모양 그대로: 대부분 활동중, 퇴사 1, 비활동 0. */
const SEED = [
  { id: 101, korean_name: 'Teacher Ana',  english_name: 'Teacher Ana',  status: '활동중', list_hidden: 0, group_name: 'Office Teacher', fee_per_10min: 35 },
  { id: 102, korean_name: 'Teacher Mo',   english_name: 'Teacher Mo',   status: '퇴사',   list_hidden: 0, group_name: 'Home-based',     fee_per_10min: 25 },
  { id: 103, korean_name: 'Teacher Kes',  english_name: 'Teacher Kes',  status: '활동중', list_hidden: 0, group_name: 'Home-based',     fee_per_10min: 25 },
];
const HIDDEN_SEED = [
  { id: 104, korean_name: '테스트강사', english_name: 'test teacher', status: '활동중', list_hidden: 1, group_name: '', fee_per_10min: null },
];

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
        사람이 닫아야 푼다 — 그대로 두면 멀쩡한 화면도 실패로 나온다. */
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 */ }
  });

  /* 🪤 포괄 스텁을 «먼저» 깔고 구체적인 것을 뒤에 — route 는 나중에 등록한 것이 이긴다.
        거꾸로 하면 포괄이 전부 삼켜 «화면이 못 채운다» 는 거짓 실패가 난다(CLAUDE.md 2장). */
  await ctx.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));

  await ctx.route('**/api/admin/teacher-profiles?**', async route => {
    const u = new URL(route.request().url());
    await page.evaluate(u2 => { (window.__tpGets = window.__tpGets || []).push(u2); }, u.search).catch(() => {});
    const hiddenOnly = u.searchParams.get('hidden') === '1';
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, items: hiddenOnly ? HIDDEN_SEED : SEED }) });
  });

  /* PATCH — «화면만 바뀌고 서버에는 안 갔다»(시연 껍데기)를 잡으려고 나간 요청을 적어 둔다. */
  await ctx.route('**/api/admin/teacher-profiles/*', async route => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.fallback();
    let body = null;
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* 무시 */ }
    await page.evaluate(rec => { (window.__tpPatches = window.__tpPatches || []).push(rec); },
      { url: req.url(), body }).catch(() => {});
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tp-list-table', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => {
    try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-teacher-mgmt'); } catch (e) {}
    let el = document.getElementById('tp-list-table');
    while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { if (typeof window.loadTeacherProfiles === 'function') window.loadTeacherProfiles(); });
  await page.waitForFunction(() => document.querySelectorAll('#tp-list-body tr[data-tid]').length >= 3,
    { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

/* 🪤 메뉴를 열 때는 «스크롤이 멎은 뒤» 눌러야 한다.
     이 화면은 jumpToMenu 의 smooth 스크롤이 아직 흐르고 있을 수 있고, 그 scroll 이
     여는 클릭 직후 도착하면 메뉴가 «열리자마자» 사라진다(버튼이 화면 밖으로 나가서).
     실사용에서는 안 생기는 검사 쪽 사정이라, 검사가 조건을 맞춰 준다. */
async function openMenu(page, id) {
  await page.evaluate(i => {
    const b = document.getElementById('tpstb-' + i);
    b.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, id);
  // 스크롤이 두 번 연속 같은 값이 될 때까지 기다린다
  await page.waitForFunction(() => {
    const y = window.scrollY;
    if (window.__lastY === y) return true;
    window.__lastY = y; return false;
  }, { timeout: 8000 });
  await page.waitForTimeout(150);
  await page.evaluate(i => document.getElementById('tpstb-' + i).click(), id);
  await page.waitForSelector('#tp-st-menu', { timeout: 5000 });
}

/** WCAG 대비 — 반투명·그라데이션 배경을 아래에서 위로 합성해서 «실제로 깔린 색» 을 찾는다.
 *  (그냥 첫 조상 색에서 멈추면 얇은 층을 배경으로 읽어 멀쩡한 글자가 실패로 나온다) */
/** WCAG 대비 — 반투명·그라데이션 배경을 아래에서 위로 합성해 «실제로 깔린 색» 을 찾는다.
 *  ⚠️ 문자열이 아니라 «진짜 함수» 로 둔다 — 문자열로 넘기면 인자와 함께 평가될 때
 *     undefined 가 돌아와 검사가 조용히 헛돈다(2026-09-01 실측). */
function contrastOf(el) {
  const parse = (c) => {
    const m = String(c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(v => parseFloat(v));
    if (p.length < 3 || p.some(isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const layers = [];
  let n = el;
  while (n && n.nodeType === 1) {
    const cs = getComputedStyle(n);
    let c = parse(cs.backgroundColor);
    /* 🪤 배경이 그라데이션이면 backgroundColor 는 transparent 라 그 층이 통째로 건너뛰어진다 —
       어두운 화면이 «흰 바탕» 으로 계산돼 멀쩡한 글자가 1.18 로 나온다(CLAUDE.md 2장). */
    if ((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') {
      const g = String(cs.backgroundImage).match(/rgba?\([^)]+\)/);
      if (g) c = parse(g[0]);
    }
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    n = n.parentElement;
  }
  if (!layers.length || layers[layers.length - 1].a < 1) layers.push({ r: 255, g: 255, b: 255, a: 1 });
  /* 🪤 반투명 층에서 멈추면 얇은 앰버를 «배경» 으로 읽어 멀쩡한 대비를 1.16 으로 잘못 잰다 —
     불투명한 층까지 모아 두었다가 아래에서 위로 합성한다. */
  let bg = layers[layers.length - 1];
  for (let i = layers.length - 2; i >= 0; i--) {
    const c = layers[i];
    bg = { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a), a: 1 };
  }
  const fg = parse(getComputedStyle(el).color) || { r: 0, g: 0, b: 0, a: 1 };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const L1 = lum(fg), L2 = lum(bg);
  return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
}

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    // ═══ PC 1440×900 ═══
    console.log('\n[ ① PC 1440×900 — 상태 버튼이 전역 인디고 알약에 안 뭉개졌는가 ]');
    let { ctx, page } = await open(browser, 1440, 900);

    /* ⚠️ getBoundingClientRect 는 body{zoom:1.3} 이 «곱해진» 화면 좌표다 —
       CSS 픽셀로 비교하려면 배율로 나눈다(CLAUDE.md 2장 「높이는 offsetHeight 로」와 같은 사정). */
    const btn = await page.evaluate(() => {
      const b = document.getElementById('tpstb-102');
      if (!b) return null;
      const z = parseFloat(document.body.style.zoom || getComputedStyle(document.body).zoom) || 1;
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      const badge = b.querySelector('.tp-st-badge');
      return { w: r.width / z, h: r.height / z, bgImage: cs.backgroundImage, bgColor: cs.backgroundColor,
               padding: cs.padding, display: cs.display, zoom: z,
               badgeH: badge ? badge.getBoundingClientRect().height / z : null,
               badgeColor: badge ? getComputedStyle(badge).color : null };
    });
    check('퇴사 강사 행의 상태 버튼이 있다', !!btn);
    check('그라데이션으로 뭉개지지 않았다 (backgroundImage: none)',
      !!btn && btn.bgImage === 'none', btn && btn.bgImage);
    check('«큰 알약» 이 아니다 (CSS 기준 폭 200px 미만 · 높이 34px 미만)',
      !!btn && btn.w < 200 && btn.h < 34, btn && `${Math.round(btn.w)}×${Math.round(btn.h)} css (zoom ${btn.zoom})`);
    check('전역 padding 9px 18px 이 안 먹었다',
      !!btn && !/9px 18px/.test(btn.padding), btn && btn.padding);
    /* 🪤 좁은 상태 칸에서 「🚪 퇴사」가 «🚪 / 퇴 / 사» 로 쪼개지던 것 — nowrap 이 그걸 막는다. */
    check('배지가 한 줄이다 (높이 28px 미만 — 쪼개지면 40px 를 넘는다)',
      !!btn && btn.badgeH !== null && btn.badgeH < 28, btn && `배지 높이 ${Math.round(btn.badgeH)}px css`);
    /* 🪤 관리자 화면에는 글자색을 인라인 !important 로 덮는 페인터가 «셋» 있다
       (adm-s12 · adm-s13 · adm-light-surfaces). 2026-09-01 실측: 퇴사 배지 글자 #991b1b 가
       adm-s12 의 darken() 으로 rgb(38,76,115) 이 된다 — 이건 이 기능 이전부터의 동작이다.
       ⛔ 그래서 «글자가 빨간가» 로 검사하지 않는다. 뜻을 지고 가는 것은
          **배경색 + 이모지 + 낱말** 이고, 검사해야 할 것은 «세 상태가 서로 구분되는가»와
          «읽히는가» 다 (CLAUDE.md 2장 「색에 기대지 말고 기호가 뜻을 지고 가게」). */
    const bgs = await page.evaluate(() => ['tpstb-101', 'tpstb-102', 'tpstb-103'].map(id => {
      const b = document.querySelector('#' + id + ' .tp-st-badge');
      return b ? getComputedStyle(b).backgroundColor : null;
    }));
    check('활동중 배지 배경이 초록 계열이다',
      !!bgs[0] && (() => { const m = bgs[0].match(/\d+/g); return m && Number(m[1]) > Number(m[0]) && Number(m[1]) > Number(m[2]); })(),
      bgs[0]);
    check('퇴사 배지 배경이 빨강 계열이다 (활동중과 눈으로 갈린다)',
      !!bgs[1] && (() => { const m = bgs[1].match(/\d+/g); return m && Number(m[0]) > Number(m[1]) && Number(m[0]) > Number(m[2]); })(),
      bgs[1]);
    check('활동중과 퇴사 배경이 서로 «다른» 색이다', bgs[0] !== bgs[1], `${bgs[0]} vs ${bgs[1]}`);

    console.log('\n[ ② 눌렀을 때 메뉴가 «버튼 바로 아래» 에 뜨는가 (body{zoom:1.3} 보정) ]');
    const zoomInfo = await page.evaluate(() => ({
      inline: document.body.style.zoom || '', computed: getComputedStyle(document.body).zoom
    }));
    console.log(`     (실측 body zoom — inline:"${zoomInfo.inline}" computed:"${zoomInfo.computed}")`);
    await openMenu(page, 102);
    const pos = await page.evaluate(() => {
      const b = document.getElementById('tpstb-102').getBoundingClientRect();
      const m = document.getElementById('tp-st-menu').getBoundingClientRect();
      return { bx: b.left, bb: b.bottom, mx: m.left, mt: m.top, mw: m.width, mh: m.height,
               vw: window.innerWidth, vh: window.innerHeight };
    });
    check('메뉴 왼쪽이 버튼 왼쪽과 거의 같다 (±14px — 안 나누면 배율만큼 밀린다)',
      Math.abs(pos.mx - pos.bx) <= 14, `버튼 ${Math.round(pos.bx)} vs 메뉴 ${Math.round(pos.mx)}`);
    check('메뉴 위쪽이 버튼 아래쪽 바로 밑이다 (0~24px)',
      pos.mt - pos.bb >= -2 && pos.mt - pos.bb <= 24, `간격 ${Math.round(pos.mt - pos.bb)}px`);
    check('메뉴가 화면 «안» 에 전부 들어온다 (overflow 상자에 안 잘렸다)',
      pos.mx >= 0 && pos.mt >= 0 && pos.mx + pos.mw <= pos.vw + 1 && pos.mt + pos.mh <= pos.vh + 1,
      `메뉴 ${Math.round(pos.mx)},${Math.round(pos.mt)} ${Math.round(pos.mw)}×${Math.round(pos.mh)} / 화면 ${pos.vw}×${pos.vh}`);

    console.log('\n[ ③ 「열렸다」가 아니라 「눌린다」인가 — elementsFromPoint ]');
    const top = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#tp-st-menu .tp-st-item')];
      return items.map(it => {
        const r = it.getBoundingClientRect();
        const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { text: it.textContent.trim().slice(0, 12),
                 topIsMine: !!stack[0] && (stack[0] === it || it.contains(stack[0])),
                 topTag: stack[0] ? (stack[0].id || stack[0].className || stack[0].tagName) : '(없음)' };
      });
    });
    check('메뉴 항목이 4개다 (활동중·비활동·퇴사 + 숨기기)', top.length === 4, `${top.length}개`);
    /* ⚠️ 빈 배열에 .every 는 늘 true 다 — «항목이 있다» 를 먼저 못 박지 않으면 헛돈다
       (CLAUDE.md 2장 「가짜 DB 로 하니스를 돌렸는데 검사가 헛돌며 통과」와 같은 뿌리). */
    check('네 항목 모두 «맨 위» 다 (아무것도 덮지 않는다)',
      top.length === 4 && top.every(t => t.topIsMine), JSON.stringify(top.filter(t => !t.topIsMine)));

    console.log('\n[ ④ 고르면 «서버에 실제로 간다» + 화면이 따라온다 ]');
    await page.evaluate(() => {
      const it = [...document.querySelectorAll('#tp-st-menu .tp-st-item')]
        .find(x => x.getAttribute('data-val') === '비활동');
      it.click();
    });
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => ({
      patches: window.__tpPatches || [],
      badge: (document.getElementById('tpstc-102') || {}).textContent || '',
      menuGone: !document.getElementById('tp-st-menu'),
      toast: !!document.getElementById('tp-st-toast'),
      undo: !!document.querySelector('#tp-st-toast .tp-st-undo'),
    }));
    check('PATCH 가 실제로 나갔다 (시연 껍데기가 아니다)', after.patches.length === 1,
      JSON.stringify(after.patches));
    check('보낸 값이 {status:"비활동"} 이다',
      after.patches[0] && after.patches[0].body && after.patches[0].body.status === '비활동',
      JSON.stringify(after.patches[0] && after.patches[0].body));
    check('배지가 «비활동» 으로 바뀌었다', /비활동/.test(after.badge), after.badge.trim());
    check('메뉴는 닫혔다', after.menuGone);
    check('되돌리기 토스트가 떴다', after.toast && after.undo);

    console.log('\n[ ⑤ 되돌리기가 «진짜로» 되돌리는가 ]');
    const toastC = await page.evaluate(contrastOf, await page.$('#tp-st-toast .tp-st-toast-msg'));
    check('토스트 글자가 읽힌다 (WCAG 4.5 이상)', toastC >= 4.5, `대비 ${toastC}`);
    await page.click('#tp-st-toast .tp-st-undo');
    await page.waitForTimeout(700);
    const undone = await page.evaluate(() => ({
      patches: window.__tpPatches || [],
      badge: (document.getElementById('tpstc-102') || {}).textContent || '',
      toast: !!document.getElementById('tp-st-toast'),
    }));
    check('되돌리기도 서버로 나간다 (화면만 되돌리지 않는다)', undone.patches.length === 2);
    check('되돌린 값이 원래 상태(퇴사)다',
      undone.patches[1] && undone.patches[1].body && undone.patches[1].body.status === '퇴사',
      JSON.stringify(undone.patches[1] && undone.patches[1].body));
    check('배지가 «퇴사» 로 돌아왔다', /퇴사/.test(undone.badge), undone.badge.trim());
    check('되돌린 뒤 토스트가 또 쌓이지 않는다', !undone.toast);

    console.log('\n[ ⑥ 배지 글자가 세 상태 모두 읽히는가 ]');
    for (const [id, want] of [['tpstb-101', '활동중'], ['tpstb-102', '퇴사'], ['tpstb-103', '활동중']]) {
      const c = await page.evaluate(contrastOf, await page.$('#' + id + ' .tp-st-badge'));
      check(`${want} 배지 글자 대비 ${c} ≥ 4.5`, c >= 4.5, `대비 ${c}`);
    }

    console.log('\n[ ⑦ 🙈 숨기기 — 지우는 것이 아니다 ]');
    await openMenu(page, 101);
    const hideLabel = await page.evaluate(() => {
      const it = document.querySelector('#tp-st-menu .tp-st-item[data-act="hidden"]');
      return it ? it.textContent.trim() : '';
    });
    check('메뉴에 «명부에서 숨기기» 가 있다', /숨기/.test(hideLabel), hideLabel);
    await page.evaluate(() => document.querySelector('#tp-st-menu .tp-st-item[data-act="hidden"]').click());
    await page.waitForTimeout(900);
    const hid = await page.evaluate(() => ({
      patches: window.__tpPatches || [],
      toastText: (document.getElementById('tp-st-toast') || {}).textContent || '',
    }));
    check('숨기기도 PATCH 로 나간다 ({list_hidden:1})',
      hid.patches.length === 3 && hid.patches[2].body && hid.patches[2].body.list_hidden === 1,
      JSON.stringify(hid.patches[2] && hid.patches[2].body));
    check('⛔ 「지웠다」고 말하지 않는다 — «지워진 것이 아닙니다» 라고 적는다',
      /지워진 것이 아닙니다/.test(hid.toastText), hid.toastText.trim());
    check('⛔ 숨기기가 DELETE 를 부르지 않는다',
      hid.patches.every(p => /teacher-profiles\/\d+$/.test(p.url)));

    console.log('\n[ ⑧ 「🙈 안보임」 필터가 status 가 아니라 hidden=1 로 나간다 ]');
    await page.evaluate(() => {
      const sel = document.getElementById('tp-filter-status');
      sel.value = '__hidden__';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof window.loadTeacherProfiles === 'function') window.loadTeacherProfiles();
    });
    await page.waitForTimeout(900);
    const gets = await page.evaluate(() => window.__tpGets || []);
    const last = gets[gets.length - 1] || '';
    check('마지막 조회가 ?hidden=1 이다', /hidden=1/.test(last), last);
    check('⛔ __hidden__ 을 status 로 보내지 않았다', !/status=__hidden__/.test(last), last);
    const hiddenRow = await page.evaluate(() => {
      const tr = document.querySelector('#tp-list-body tr[data-tid="104"]');
      if (!tr) return null;
      const td = tr.querySelector('td:nth-child(3)');
      return { hiddenAttr: tr.getAttribute('data-hidden'), text: td ? td.textContent.trim() : '' };
    });
    check('숨긴 강사가 그 필터에서는 보인다 (지워지지 않았음을 화면이 증명한다)', !!hiddenRow);
    check('그 행에 «안보임» 표시가 붙는다',
      !!hiddenRow && hiddenRow.hiddenAttr === '1' && /안보임/.test(hiddenRow.text),
      hiddenRow && hiddenRow.text);
    await ctx.close();

    // ═══ 폰 390×844 ═══
    console.log('\n[ ⑨ 폰 390×844 — 메뉴가 화면 밖으로 안 나가는가 ]');
    ({ ctx, page } = await open(browser, 390, 844));
    await openMenu(page, 102);
    const m2 = await page.evaluate(() => {
      const m = document.getElementById('tp-st-menu').getBoundingClientRect();
      const cs = getComputedStyle(document.getElementById('tp-st-menu'));
      return { x: m.left, y: m.top, w: m.width, h: m.height,
               vw: window.innerWidth, vh: window.innerHeight, z: cs.zIndex };
    });
    check('폰에서도 메뉴가 화면 안에 전부 들어온다',
      m2.x >= 0 && m2.y >= 0 && m2.x + m2.w <= m2.vw + 1 && m2.y + m2.h <= m2.vh + 1,
      `${Math.round(m2.x)},${Math.round(m2.y)} ${Math.round(m2.w)}×${Math.round(m2.h)} / ${m2.vw}×${m2.vh}`);
    check('메뉴 z-index 가 모바일 드로어(100001) 위다', Number(m2.z) > 100001, m2.z);
    const topPhone = await page.evaluate(() => {
      const it = document.querySelector('#tp-st-menu .tp-st-item');
      const r = it.getBoundingClientRect();
      const s = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!s[0] && (s[0] === it || it.contains(s[0]));
    });
    check('폰에서도 항목이 «맨 위» 다 (드로어·오버레이가 안 덮는다)', topPhone);

    console.log('\n[ ⑩ Esc 로 닫힌다 (키보드로도 빠져나올 수 있다) ]');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Esc 를 누르면 메뉴가 닫힌다',
      await page.evaluate(() => !document.getElementById('tp-st-menu')));
    await ctx.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log('\n──────────────────────────────');
  console.log(`  PASS ${pass} / FAIL ${fail}`);
  if (fail > 0) { console.log('  ❌ 실패가 있습니다.'); process.exit(1); }
  console.log('  ✅ 전부 통과');
})();
