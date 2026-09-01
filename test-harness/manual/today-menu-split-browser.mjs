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
      localStorage.removeItem('mangoi_admin_ia6');    // «마지막으로 보던 항목» 을 지우고 시작 (adm-ia6.js 의 LS_KEY)
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
    check('⛔ 옛 이름 「오늘의 수업」이 사이드바에 없다',
      !items.some(i => i.text.indexOf('오늘의 수업') >= 0), JSON.stringify(items.map(i => i.text)));
    /* 📌 A안 — B안에서 잠깐 갈라 두었던 「지금 수업」은 «탭» 으로 합쳐졌다. */
    check('⛔ 「지금 수업」이 별도 항목으로 남아 있지 않다',
      !items.some(i => i.text.indexOf('지금 수업') === 0), JSON.stringify(items.map(i => i.text)));

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

    console.log('\n[ ③ A안 — 한 항목 안에서 탭으로 가르는가 ]');
    /* ⚠️ «감춘다» 가 아니라 «접는다» 로 만들었다(trap-check 지적) — 그래서 여기서 재는 것은
       display 가 아니라 details.open 이다. 카드는 어느 경우에도 화면에서 사라지지 않는다. */
    const seen = () => page.evaluate(() => {
      const bar = document.getElementById('tdt-tabs');
      const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && !!el.offsetParent;
      const list = document.getElementById('card-students-mgmt');
      const live = document.getElementById('card-active-rooms');
      const onBtn = bar && bar.querySelector('.tdt-tab.on');
      return {
        barShown: vis(bar),
        tabs: bar ? [...bar.querySelectorAll('.tdt-tab')].map(b => b.getAttribute('data-tdt')) : null,
        labels: bar ? [...bar.querySelectorAll('.tdt-tab')].map(b => b.textContent.trim()) : null,
        on: onBtn ? onBtn.getAttribute('data-tdt') : null,
        listOpen: !!(list && list.open), liveOpen: !!(live && live.open),
        listThere: vis(list), liveThere: vis(live),
        onlyLive: !!(document.getElementById('tc-only-live') || {}).checked,
      };
    });

    const t0 = await seen();
    check('탭 줄이 보인다', t0.barShown, JSON.stringify(t0));
    check('탭이 셋이다', JSON.stringify(t0.tabs) === JSON.stringify(['all', 'live', 'rooms']), JSON.stringify(t0.tabs));
    check('기본은 「전체」다', t0.on === 'all', JSON.stringify(t0));
    check('「전체」에서 오늘 목록 카드가 펴진다', t0.listOpen === true, JSON.stringify(t0));
    check('실시간 카드는 «접힐» 뿐 사라지지 않는다',
      t0.liveOpen === false && t0.liveThere === true, JSON.stringify(t0));
    console.log('     (탭 글자 — ' + JSON.stringify(t0.labels) + ')');

    await page.evaluate(() => document.querySelector('#tdt-tabs [data-tdt="live"]').click());
    await page.waitForTimeout(200);
    const t1 = await seen();
    check('「🚪 지금 입장 가능」을 누르면 그 칸의 체크박스가 켜진다 (목록을 두 벌로 안 그린다)',
      t1.onlyLive === true && t1.on === 'live', JSON.stringify(t1));

    await page.evaluate(() => document.querySelector('#tdt-tabs [data-tdt="rooms"]').click());
    await page.waitForTimeout(200);
    const t2 = await seen();
    check('「🎥 화상방 접속」을 누르면 실시간 카드가 펴진다',
      t2.liveOpen === true && t2.listOpen === false, JSON.stringify(t2));
    check('그때도 오늘 목록 카드는 화면에서 사라지지 않는다 (접혔을 뿐)',
      t2.listThere === true, JSON.stringify(t2));

    await page.evaluate(() => document.querySelector('#tdt-tabs [data-tdt="all"]').click());
    await page.waitForTimeout(200);
    const t3 = await seen();
    check('「전체」로 돌아오면 체크박스가 꺼진다', t3.onlyLive === false, JSON.stringify(t3));

    console.log('\n[ ③-2 🔴 밖에서 카드를 열면 탭이 따라오는가 ]');
    /* 딥링크(#card-active-rooms) · ⚡「수업 종료 / 연장」 · 허브 · AI 명령이 전부 이 경로다.
       예전 설계(display:none)에서는 우리가 60ms 뒤 그 카드를 다시 감춰 버렸다. */
    await page.evaluate(() => {
      const live = document.getElementById('card-active-rooms');
      if (live) live.open = true;                     // 밖에서 연 것처럼
    });
    await page.waitForTimeout(250);
    const t4 = await seen();
    check('실시간 카드를 밖에서 열면 탭이 「화상방 접속」으로 따라온다', t4.on === 'rooms', JSON.stringify(t4));
    check('⛔ 우리가 그 카드를 다시 닫지 않는다', t4.liveOpen === true, JSON.stringify(t4));

    console.log('\n[ ③-3 🔴 다른 메뉴로 가도 카드가 «사라지지» 않는가 ]');
    check('출결 항목을 눌렀다', await clickItem(page, 'today:출결'));
    const away = await page.evaluate(() => {
      const bar = document.getElementById('tdt-tabs');
      return { barShown: !!bar && getComputedStyle(bar).display !== 'none' && !!bar.offsetParent,
               anyOurHide: document.querySelectorAll('.tdt-hide').length };
    });
    check('탭 줄이 숨는다 (다른 메뉴에서는 남의 화면이다)', away.barShown === false, JSON.stringify(away));
    check('⛔ 우리 숨김 클래스가 화면 어디에도 없다', away.anyOurHide === 0, JSON.stringify(away));

    console.log('\n[ ③-4 🏠 홈(전체 보기)에서 두 카드가 다 보이는가 ]');
    await page.evaluate(() => { try { window.mangoiIA6.showAll(); } catch (e) {} });
    await page.waitForTimeout(400);
    const home = await page.evaluate(() => {
      const vis = (id) => { const el = document.getElementById(id);
        return !!el && getComputedStyle(el).display !== 'none' && !!el.offsetParent; };
      return { list: vis('card-students-mgmt'), live: vis('card-active-rooms') };
    });
    check('전체 보기에서 오늘 목록 카드가 보인다', home.list === true, JSON.stringify(home));
    check('전체 보기에서 실시간 카드도 보인다 (우리가 감춘 채로 두지 않는다)',
      home.live === true, JSON.stringify(home));
    check('「오늘 수업」으로 돌아왔다', await clickItem(page, 'today:오늘 수업'));

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

    /* 🔴 (trap-check 가 잡은 것) 「오늘 수업」이 card-students-mgmt 를 가리키게 되면서
       그 카드를 가리키는 항목이 «둘» 이 됐다. 밖에서 오는 점프는 data-card 로 항목을 찾아
       대신 눌러 주는데 querySelector 는 **첫 매치** 라, 「학생 목록」을 눌러도 «오늘 수업» 칸이
       맨 위에 오고 학생 명부가 화면 위로 밀려났다(실측 카드 top −546).
       ✅ openSub(data-ia6-sub) 항목은 «잎» 이라 뒤로 미룬다 — 그게 실제로 먹는지 여기서 잰다. */
    console.log('\n[ ⑥ 🔴 밖에서 학생 카드로 오는 점프가 «학생 명부» 로 가는가 ]');
    await page.evaluate(() => { try { localStorage.removeItem('mangoi_admin_ia6'); } catch (e) {} });
    const jump = await page.evaluate(() => {
      if (typeof window.ph161Go !== 'function') return { err: 'ph161Go 없음' };
      window.ph161Go('card-students-mgmt', null);
      return null;
    });
    check('⚡자주 쓰는 기능의 점프 함수가 있다', jump === null, JSON.stringify(jump));
    await page.waitForTimeout(2400);
    const land = await page.evaluate(() => {
      const on = document.querySelector('#ph85-sidebar .ia6-on');
      const card = document.getElementById('card-students-mgmt');
      const sec = document.getElementById('sm-today-classes');
      let key = null;
      try { key = localStorage.getItem('mangoi_admin_ia6'); } catch (e) {}
      return {
        onItem: on ? on.getAttribute('data-ia6-item') : null,
        cardTop: card ? Math.round(card.getBoundingClientRect().top) : null,
        todayOpen: !!(sec && sec.open), saved: key, vh: window.innerHeight,
      };
    });
    check('강조되는 항목이 「학생 명부」다 (「오늘 수업」에 뺏기지 않았다)',
      land.onItem === 'student:학생 명부', JSON.stringify(land));
    check('학생 관리 카드가 화면 위로 밀려나지 않았다 (top ≥ −40)',
      land.cardTop !== null && land.cardTop > -40 && land.cardTop < land.vh, JSON.stringify(land));
    /* ℹ️ `todayOpen` 은 «점프» 가 편 것이 아니라 **첫 착지**(저장값이 없으면 「오늘」 첫 항목 =
       「오늘 수업」)가 열어 둔 것이다. origin/main 은 첫 항목이 「오늘의 수업」(실시간 카드)이라
       닫혀 있었다 — 그 차이를 «점프가 망가졌다» 로 읽지 않도록 값만 적어 둔다.
       ⛔ 검사로 만들지 말 것: B안에서는 열려 있는 것이 정상이다. */
    console.log('     (참고 — sm-today-classes open=' + land.todayOpen + ' : 첫 착지가 연 것)');
    check('저장된 «마지막으로 보던 항목» 도 학생 명부다',
      land.saved === 'student:학생 명부', JSON.stringify(land));

    console.log('\n[ ⑤ 폰 390×844 — 좁은 화면에서 탭 줄이 읽히는가 ]');
    await page.context().close();
    ({ page } = await open(browser, 390, 844));
    await clickItem(page, 'today:오늘 수업');
    const mob = await page.evaluate(() => {
      const a = document.querySelector('[data-ia6-item="today:오늘 수업"]');
      const bar = document.getElementById('tdt-tabs');
      const btns = bar ? [...bar.querySelectorAll('.tdt-tab')] : [];
      /* 🪤 상자 높이 ÷ lineHeight 로 세면 **padding·border 가 섞여** 한 줄짜리가 2줄로 잡힌다
         (실측: 29px ÷ 19px = 1.5 → 2). 글자가 실제로 차지한 높이만 남기고 센다. */
      const lines = btns.map((b) => {
        const cs = getComputedStyle(b);
        const lh = parseFloat(cs.lineHeight) || 16;
        const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
                  + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        return Math.round((b.getBoundingClientRect().height - pad) / lh);
      });
      return { a: !!a, at: a ? (a.textContent || '').trim() : null,
               bar: !!bar && getComputedStyle(bar).display !== 'none' && !!bar.offsetParent,
               n: btns.length, lines,
               over: document.documentElement.scrollWidth - window.innerWidth };
    });
    check('「오늘 수업」 칸이 폰에서도 있다', mob.a, JSON.stringify(mob));
    check('이름이 한 줄로 읽힌다 (설명 괄호를 안 붙인 이유)',
      String(mob.at).indexOf('오늘 수업') === 0, JSON.stringify(mob));
    check('탭 줄이 폰에서도 보인다 (셋)', mob.bar && mob.n === 3, JSON.stringify(mob));
    /* 🪤 좁은 폭에서 탭 글자가 «낱글자로» 쪼개지지 않는가 — 이 저장소가 여러 번 밟은 자리다. */
    check('탭 글자가 전부 한 줄이다', mob.lines.every((n) => n <= 1), JSON.stringify(mob.lines));
    check('문서가 가로로 안 넘친다', mob.over <= 1, String(mob.over));

  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log('\n──────────────────────────────────────────');
  console.log(`PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
