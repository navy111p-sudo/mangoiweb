// -*- coding: utf-8 -*-
// 🔎 관리자 화면의 «두 검색창» 브라우저 검사 (2026-09-09)
//
//   왜 이 검사가 있나 — 사장님 「가로 검색창에 «녹화» 를 쳤는데 녹화 페이지로 가지 않아.
//   특히 세로 검색창은 잘 검색이 되지 않아」. 파고 보니 원인이 넷이었고 **넷 다**
//   «에러도 로그도 없이» 조용했다:
//
//     ① PC(≥1024px)에서 가로 통합검색 드롭다운이 **한 번도 안 보였다**.
//        admin-inline-c.css 의 ph89(옛 검색 카드 제거) 규칙
//        `.menu-search-dropdown, .menu-search-item{display:none!important}` 가
//        같은 클래스를 쓰는 히어로 드롭다운까지 먹었다.
//        [잰 것] 「녹화」 입력 시 1600px → display none·높이 0 · 900px → block·높이 482.
//        **후보 12개를 찾아 놓고 화면에 한 줄도 안 그렸다.**
//     ② 「녹화」의 1순위가 «실시간 수업(활성 룸)» 이었다. 별칭 한 줄에 «녹화» 와 «활성방» 이
//        함께 묶여 라벨이 「녹화·활성 방」이라 정렬 1위였다(adm-core.js MENU_ALIASES).
//     ③ 세로(사이드바) 검색이 **옛 사이드바까지** 훑었다. 이 화면 사이드바는 두 벌인데
//        옛 9그룹은 CSS 로 display:none 이라, 옛 쪽에만 있는 말은 «찾았다»고 판단해
//        그룹을 열어 놓고 화면에는 0건이었다. 게다가 «없다»는 말도 안 했다.
//     ④ 세로 검색이 **영어를 안 봤다**(textContent 만) — 「recording」·「payroll」 0건.
//        EN 으로 쓰는 필리핀 매니저는 영어로 자기 메뉴를 못 찾았다.
//        그리고 결재함은 `.ph85-sub` 가 아니라 <a id="ia6-appr"> 라 루프가 아예 안 봤다 —
//        「결재」로 치면 결재함이 **화면에 보이는데도** 0건이었다.
//
//   왜 브라우저인가 —
//     넷 다 함수도 값도 «있고» 틀린 것은 «누가 이기는가 / 무엇이 그려지는가» 뿐이다.
//     수리 전에도 `run.mjs --fast` 가 전부 초록이었다. 문자열 하니스로는 원리상 못 본다.
//
//   ⛔ 「안 보인다」·「걸린다」만 세지 말 것 — 반드시 짝으로 센다:
//        · 드롭다운이 PC 에서 보인다        ↔ 검색어를 지우면 다시 감춰진다
//        · 「녹화」가 녹화 카드로 간다        ↔ 「활성방」은 여전히 실시간 수업으로 간다
//        · 영어로 걸린다                    ↔ 없는 말은 0건이고 «없다»고 말한다
//        · 결재함이 「결재」로 남는다         ↔ 다른 말에서는 결재함도 걸러진다
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/admin-search-browser.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8951;                       // 다른 검사와 겹치지 않게 (서비스워커 캐시 회피)
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

/* ⚠️ 폭은 반드시 ≥1024px — ①의 ph89 규칙이 `@media (min-width:1024px)` 안이라
      좁은 창으로 재면 «고치기 전» 코드도 통과한다(그 함정을 재는 검사가 통째로 헛돈다). */
async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  /* 🪤 빈 브라우저는 «첫 방문자» 라 환영 안내(#aw-overlay)가 html{overflow:hidden} 을 걸고
        사람이 닫아야 푼다 — 그대로 두면 멀쩡한 화면도 실패로 나온다. */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'admin', username: 'admin', role: 'admin' }));
    } catch (e) { /* 시크릿 */ }
  });
  /* 🪤 포괄을 «먼저», 구체적인 것을 «뒤에» — route 는 나중에 등록한 것이 이긴다.
        ⚠️ omnisearch 는 «빈 결과» 로 둔다. 결과가 있으면 _liveServerSearch 가
           _searchCurrentHits 를 학생·교사로 덮어써 ②가 재려는 것이 사라진다. */
  await ctx.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"results":[]}' }));

  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu-search', { state: 'attached', timeout: 30000 });
  /* 색인(buildMenuIndex)과 IA6 사이드바가 다 그려질 때까지 기다린다.
     ⚠️ 시간으로 때우지 말 것 — 느린 기계에서 조용히 «0건» 이 되어 검사가 헛돈다. */
  await page.waitForFunction(() => {
    const sb = document.getElementById('ph85-sidebar');
    return sb && sb.querySelectorAll('.ph85-sub').length > 10 && typeof window.searchAllFor === 'function';
  }, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

const typeInto = (page, id, v) => page.evaluate(({ id, v }) => {
  const i = document.getElementById(id);
  i.focus(); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true }));
  i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
}, { id, v });

const dropState = page => page.evaluate(() => {
  const dd = document.getElementById('menu-search-dropdown');
  const it = dd.querySelector('.menu-search-item');
  return {
    display: getComputedStyle(dd).display,
    height: Math.round(dd.getBoundingClientRect().height),
    items: dd.querySelectorAll('.menu-search-item').length,
    itemDisplay: it ? getComputedStyle(it).display : null,
    itemHeight: it ? Math.round(it.getBoundingClientRect().height) : 0,
  };
});

const sidebarState = page => page.evaluate(() => {
  const sb = document.getElementById('ph85-sidebar');
  const subs = [].filter.call(sb.querySelectorAll('.ph85-sub'), e => !!e.offsetParent);
  const appr = document.getElementById('ia6-appr');
  const em = document.getElementById('ph85-search-empty');
  return {
    n: subs.length,
    labels: subs.slice(0, 4).map(e => (e.textContent || '').trim().slice(0, 16)),
    apprVisible: appr ? !!appr.offsetParent : null,
    emptyShown: !!(em && getComputedStyle(em).display !== 'none'),
    emptyText: em ? (em.textContent || '').slice(0, 60) : '',
  };
});

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let ctx;
  try {
    const opened = await open(browser); ctx = opened.ctx;
    const page = opened.page;

    // ─────────────────────────────────────────────────────────────────────
    console.log('\n① 가로 통합검색 — PC 에서 결과 목록이 «그려지는가»');
    await typeInto(page, 'menu-search', '녹화');
    await page.waitForTimeout(700);
    const d = await dropState(page);
    check('드롭다운이 화면에 보인다 (computed display ≠ none)', d.display !== 'none', JSON.stringify(d));
    check('드롭다운 높이가 0 이 아니다', d.height > 40, '높이=' + d.height);
    check('후보가 DOM 에 있다', d.items > 0, '항목=' + d.items);
    /* ⚠️ ph89 목록에는 `.menu-search-item` 도 들어 있다 — 상자만 되살리고 항목을 빠뜨리면
          «빈 상자» 가 뜬다. 그래서 항목의 display 와 «실제 높이» 를 따로 잰다. */
    check('항목도 보인다 (display ≠ none)', d.itemDisplay && d.itemDisplay !== 'none', String(d.itemDisplay));
    check('항목 높이가 0 이 아니다', d.itemHeight > 8, '항목높이=' + d.itemHeight);

    // 짝: 검색어를 지우면 다시 감춰져야 한다(안 그러면 빈 상자가 늘 떠 있는다)
    await typeInto(page, 'menu-search', '');
    await page.waitForTimeout(400);
    const d0 = await dropState(page);
    check('검색어를 지우면 다시 감춰진다', d0.display === 'none', JSON.stringify(d0));

    // ─────────────────────────────────────────────────────────────────────
    console.log('\n② 「녹화」가 «녹화 페이지» 로 가는가');
    const hits = await page.evaluate(() => window.searchAllFor('녹화').slice(0, 3).map(h => h.label));
    check('1순위가 녹화 관리다', /녹화\s*관리/.test(hits[0] || ''), JSON.stringify(hits));
    check('1순위가 «활성 방» 이 아니다', !/활성/.test(hits[0] || ''), JSON.stringify(hits));

    await typeInto(page, 'menu-search', '녹화');
    await page.waitForTimeout(600);
    await page.click('#menu-search-go');
    await page.waitForTimeout(1200);
    const jumped = await page.evaluate(() => {
      const f = id => { const e = document.getElementById(id);
        return { open: !!e.open, display: getComputedStyle(e).display, visible: !!e.offsetParent,
                 top: Math.round(e.getBoundingClientRect().top) }; };
      return { rec: f('card-recording-storage'), live: f('card-active-rooms') };
    });
    check('➡️ 를 누르면 녹화 카드가 열리고 «보인다»', jumped.rec.open && jumped.rec.visible, JSON.stringify(jumped.rec));
    check('그 카드가 화면 위쪽에 온다', jumped.rec.top < 300, 'top=' + jumped.rec.top);
    check('실시간 수업 카드로 가지 «않는다»', !jumped.live.visible, JSON.stringify(jumped.live));

    /* 짝 — 「활성방」으로 찾던 사람은 여전히 실시간 수업으로 가야 한다.
       ⛔ 이 줄이 없으면 «활성 방 별칭을 통째로 지우기» 도 통과한다. */
    const live = await page.evaluate(() => window.searchAllFor('활성방').slice(0, 2).map(h => h.label));
    check('「활성방」은 여전히 실시간 수업을 가리킨다', /활성\s*룸|실시간/.test(live[0] || ''), JSON.stringify(live));

    // ─────────────────────────────────────────────────────────────────────
    console.log('\n③ 세로 검색 — «찾았다는데 화면엔 없는» 일이 없는가');
    for (const w of ['녹화', '급여', '회계']) {
      await typeInto(page, 'ph85-search', w);
      await page.waitForTimeout(350);
      const s = await sidebarState(page);
      check(`「${w}」 → 화면에 실제로 남는 항목이 있다`, s.n > 0, JSON.stringify(s.labels));
      check(`「${w}」 → «없다» 안내는 안 뜬다`, !s.emptyShown, s.emptyText);
    }
    /* 옛(감춰진) 사이드바는 훑지 않는다 — 훑으면 «찾았다» 고 세어 놓고 화면엔 0건이 된다. */
    const legacyTouched = await page.evaluate(() => {
      const gs = [].slice.call(document.querySelectorAll('#ph85-sidebar .ph85-group[data-ia6-legacy]'));
      return { groups: gs.length, opened: gs.filter(g => g.classList.contains('ph85-sopen')).length };
    });
    check('옛 사이드바 그룹을 검색이 건드리지 않는다', legacyTouched.opened === 0, JSON.stringify(legacyTouched));
    check('전제 — 옛 사이드바 그룹이 실재한다(없으면 위 검사가 헛돈다)', legacyTouched.groups > 0,
          JSON.stringify(legacyTouched));

    console.log('\n③-2 결과가 없으면 «없다»고 말하는가');
    await typeInto(page, 'ph85-search', 'zzq없는말');
    await page.waitForTimeout(350);
    const none = await sidebarState(page);
    check('없는 말 → 항목 0건', none.n === 0, JSON.stringify(none.labels));
    check('없는 말 → 안내가 뜬다', none.emptyShown, none.emptyText);
    check('안내에 그 검색어가 들어 있다', none.emptyText.indexOf('zzq없는말') >= 0, none.emptyText);
    /* ⚠️ 안내 상자는 `.ph85-search-wrap` **밖**이어야 한다 — 안에 넣으면 wrap 높이가 커져
          「↑ 검색에서 나가기」 버튼 위치가 어긋난다. */
    const emptyPlace = await page.evaluate(() => {
      const em = document.getElementById('ph85-search-empty');
      return em ? !em.closest('.ph85-search-wrap') : null;
    });
    check('안내가 검색창 wrap «밖» 에 있다', emptyPlace === true, String(emptyPlace));

    /* 🎨 «없다» 안내가 실제로 읽히는가.
       ⚠️ 이 화면은 밝은 테마(adm-light-theme.css)라 사이드바도 밝다. 그런데
          `js/adm-light-surfaces.js` 등 페인터가 «대비가 낮을 때만» 인라인 !important 로
          글자색을 보정한다 — 즉 **페인터가 돌기 전 몇 초 동안은 내가 준 색 그대로**다.
          실측(2026-09-09): 로드 직후 color=rgb(226,232,240)·priority='' →
          잠시 뒤 rgb(45,72,108)·priority='important'. 밝은 바탕에 밝은 회색이라
          그 몇 초는 안 읽혔다.
       ⛔ 그래서 «지금 대비» 만 재면 안 된다 — 페인터가 구제해 준 값을 재게 된다.
          **내가 «준» 색(el.style.color)만으로도 읽히는가** 를 짝으로 잰다. */
    /* 소스(`admin.html`)의 `_syncEmpty` 가 상자에 넣는 cssText 에서 color 를 읽는다.
       ⚠️ 이 정규식이 못 찾으면 «전제 실패» 로 FAIL 낸다 — 조용히 건너뛰면 그 아래
          검사가 통째로 뜻을 잃는다(CLAUDE.md 「전제 검사를 짝으로」). */
    const adminSrc = readFileSync(join(PUBLIC, 'admin.html'), 'utf8');
    const cssTextM = adminSrc.match(/box\.style\.cssText\s*=\s*([\s\S]{0,400}?);\n/);
    const srcColor = ((cssTextM && cssTextM[1].match(/color:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/)) || [])[1] || '';
    check('전제 — 안내 상자의 색을 소스에서 읽어 냈다', !!srcColor, JSON.stringify(cssTextM ? cssTextM[1].slice(0, 80) : null));

    await typeInto(page, 'ph85-search', 'zzq없는말');
    await page.waitForTimeout(500);
    const contrast = await page.evaluate((SRC_COLOR) => {
      const el = document.getElementById('ph85-search-empty');
      if (!el) return null;
      /* 🪤 `#e2e8f0` 같은 hex 를 `[\d.]+` 로 뽑으면 «2,8,0» = 거의 검정이 되어
            밝은 바탕에서 대비가 높게 «거짓 통과» 한다(실제로 그렇게 짰다가 잡혔다).
            hex 와 rgb()/rgba() 를 갈라서 읽는다. */
      const parse = c => {
        const t = String(c || '').trim();
        const hx = t.match(/^#([0-9a-fA-F]{3,8})$/);
        if (hx) { let h = hx[1];
          if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
          return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16),
                   b: parseInt(h.slice(4, 6), 16),
                   a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
        }
        const m = t.match(/[\d.]+/g) || [0, 0, 0];
        return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] };
      };
      const over = (f, bk) => ({ r: f.r * f.a + bk.r * (1 - f.a), g: f.g * f.a + bk.g * (1 - f.a),
                                 b: f.b * f.a + bk.b * (1 - f.a), a: 1 });
      /* 반투명 층을 «불투명한 층» 까지 모아 아래→위로 합성한다. 첫 색에서 멈추면
         얇은 층을 배경으로 읽어 멀쩡한 대비를 틀리게 잰다(CLAUDE.md 2장). */
      const layers = []; let n = el;
      while (n && n.nodeType === 1) { const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0) { layers.push(c); if (c.a >= 1) break; } n = n.parentElement; }
      if (!layers.length || layers[layers.length - 1].a < 1) layers.push({ r: 255, g: 255, b: 255, a: 1 });
      let bg = layers[layers.length - 1];
      for (let i = layers.length - 2; i >= 0; i--) bg = over(layers[i], bg);
      let op = 1, m2 = el;
      while (m2 && m2.nodeType === 1) { op *= parseFloat(getComputedStyle(m2).opacity || '1'); m2 = m2.parentElement; }
      const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const ratio = fgRaw => { const fg = over({ ...fgRaw, a: fgRaw.a * op }, bg);
        const l1 = L(fg), l2 = L(bg);
        return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)); };
      return {
        now: ratio(parse(getComputedStyle(el).color)),          // 지금 화면(페인터 반영 후)
        /* 🪤 `el.style.color` 를 «내가 준 색» 으로 쓰면 안 된다 — 페인터가 인라인
              !important 로 **그 자리를 덮어쓰므로** 언제나 보정된 값이 나온다
              (실제로 그렇게 짰다가 밝은 회색 그대로인데도 통과했다).
              소스에 적힌 값을 밖에서 넣어 준다. */
        own: ratio(parse(SRC_COLOR)),
        painted: el.style.getPropertyPriority('color') === 'important',
        srcColor: SRC_COLOR,
        bg: `rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0})`,
      };
    }, srcColor);
    check('안내 글자가 읽힌다 (지금 화면 대비 ≥ 4.5)', !!contrast && contrast.now >= 4.5, JSON.stringify(contrast));
    check('페인터에 기대지 않는다 (직접 준 색만으로도 ≥ 4.5)', !!contrast && contrast.own >= 4.5, JSON.stringify(contrast));

    // ─────────────────────────────────────────────────────────────────────
    console.log('\n④ 세로 검색 — 영어와 결재함');
    for (const w of ['recording', 'payroll']) {
      await typeInto(page, 'ph85-search', w);
      await page.waitForTimeout(350);
      const s = await sidebarState(page);
      check(`영어 「${w}」 로도 걸린다`, s.n > 0, JSON.stringify(s));
    }
    await typeInto(page, 'ph85-search', '결재');
    await page.waitForTimeout(350);
    const appr = await sidebarState(page);
    check('「결재」 → 결재함이 남는다', appr.apprVisible === true, JSON.stringify(appr));
    check('「결재」 → «없다» 안내는 안 뜬다', !appr.emptyShown, appr.emptyText);

    await typeInto(page, 'ph85-search', 'approvals');
    await page.waitForTimeout(350);
    const appr2 = await sidebarState(page);
    check('영어 「approvals」 로도 결재함이 남는다', appr2.apprVisible === true, JSON.stringify(appr2));

    /* 짝 — 다른 말로 검색하면 결재함도 걸러져야 한다.
       ⛔ 이 줄이 없으면 «결재함은 언제나 보이기» 도 통과한다. */
    await typeInto(page, 'ph85-search', '녹화');
    await page.waitForTimeout(350);
    const apprOff = await sidebarState(page);
    check('「녹화」 → 결재함은 걸러진다', apprOff.apprVisible === false, JSON.stringify(apprOff));

    // 짝 — 검색을 비우면 전부 되돌아온다
    await typeInto(page, 'ph85-search', '');
    await page.waitForTimeout(400);
    const back = await sidebarState(page);
    check('검색을 비우면 항목이 되돌아온다', back.n > 10, '보이는 항목=' + back.n);
    check('검색을 비우면 결재함도 되돌아온다', back.apprVisible === true, JSON.stringify(back));
    check('검색을 비우면 안내가 사라진다', !back.emptyShown, back.emptyText);

  } finally {
    try { if (ctx) await ctx.close(); } catch (e) { /* 무시 */ }
    await browser.close();
    if (srv) srv.kill();
  }

  console.log(`\n결과: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
