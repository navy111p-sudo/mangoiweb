// -*- coding: utf-8 -*-
// 🔗 강사↔로그인 연결 — «퇴사 강사를 기본 목록에서 뺀다» 브라우저 검사 (2026-09-09)
//
//   🔴 이 저장소에는 «강사↔계정 연결» 화면이 **둘** 입니다. 둘 다 잽니다 —
//     ① `#card-teacher-links` · `adm-teacher-links.js` · `GET /api/admin/teachers/links`
//     ② `#card-teacher-link`  · `adm-tlink.js`(lazy) · `GET /api/admin/teacher-links`
//     둘이 **같은 표**(`teacher_account_links`)에 씁니다. 한쪽만 고치면 나머지가 그대로
//     같은 사고를 냅니다(CLAUDE.md 2장 「「이미 고친 사고」인데 한 화면만 그대로 재발」).
//
//   왜 이 검사가 있나 —
//     이 드롭다운만 `active` 를 안 걸러서, 같은 사람이 원부에 두 줄로 있으면
//     («FAR» id 22 재직 · «HT FARRAH» id 3 퇴사 — 2026-08-26 실사고의 뿌리)
//     여기서 잘못 고르기 쉬웠다. 그 연결은 출근·급여가 갈리는 자리다.
//
//   왜 브라우저인가 —
//     문자열 하니스는 「그 조건이 있는가」까지만 본다. 여기서 틀리는 것은
//     «무슨 <option> 이 실제로 그려졌는가» 뿐이라 그려 보지 않으면 안 보인다.
//
//   ⛔ 「안 보인다」만 세면 «전부 숨기기» 도 통과한다 — 반드시 짝으로 센다:
//        · 퇴사 강사는 기본에서 안 보인다            ↔ 재직 강사는 보인다
//        · 이미 이어진 퇴사 강사는 «그 줄에서» 보인다 ↔ 다른 줄에서는 안 보인다
//        · 체크박스를 켜면 나온다                    ↔ 끄면 다시 사라진다
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/teacher-links-left-hidden-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8946;                       // 다른 검사와 겹치지 않게 (서비스워커 캐시 회피)
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

/* 씨앗 — 2026-09-09 운영 D1 에서 본 «상태 조합» 을 재현한다(값 자체를 베낀 것이 아니다):
     재직 25 · 퇴사 5 · 그 퇴사 5 중 계정이 이어진 사람은 하나뿐 · active NULL 은 **0건**.
   ⚠️ 그래서 `NULLCASE`(active: null) 는 **실측에 없는 행**이다 — 일부러 넣은 «장래 방어» 다.
      지금 0건이라고 검사에서 빼면, NULL 이 하나라도 생기는 날 멀쩡한 강사가 조용히 사라진다.
   ⚠️ 사람 이름을 못 박는 것이 목적이 아니다 — 이름이 바뀌어도 상태 조합만 같으면 된다. */
const TEACHERS = [
  { id: 22, name: 'FAR',       active: 1 },
  { id: 24, name: 'HANNAH',    active: 1 },
  { id: 16, name: 'KRYSTEL',   active: 1 },
  { id: 3,  name: 'HT FARRAH', active: 0 },   // 이 사고의 주인공 — 연결 0건
  { id: 11, name: 'MARIANE',   active: 0 },   // 퇴사인데 이미 이어진 계정이 있다
  { id: 4,  name: 'RICA',      active: 0 },
  { id: 99, name: 'NULLCASE',  active: null }, // ⚠️ 모르면 «재직» 이어야 한다
];
const ACCOUNTS = [
  { username: 'mangoi_018', last_login_at: 1757300000000 },
  { username: 'mangoi_167', last_login_at: 1757200000000 },
  { username: 'mangoi_011', last_login_at: 1757100000000 },
];
/* ② 화면(`/api/admin/teacher-links`)의 계정 모양 — 서버가 자동매칭 결과까지 함께 준다. */
const ACCOUNTS2 = [
  { username: 'mangoi_018', name: 'Teacher - Farrah', role: 'teacher', name_is_username: false,
    linked_teacher_id: null, linked_teacher_name: null, linked_at: null,
    auto_match: null, auto_candidates: [], status: 'unlinked' },
  { username: 'mangoi_011', name: 'Mariane', role: 'teacher', name_is_username: false,
    linked_teacher_id: '11', linked_teacher_name: 'MARIANE', linked_at: 1757000000000,
    auto_match: null, auto_candidates: [], status: 'linked' },
];
const LINKS = [
  { username: 'mangoi_011', teacher_id: '11', teacher_name: 'MARIANE', linked_by: 'admin', linked_at: 1757000000000 },
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

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  /* 🪤 빈 브라우저는 «첫 방문자» 라 환영 안내(#aw-overlay)가 html{overflow:hidden} 을 걸고
        사람이 닫아야 푼다 — 그대로 두면 멀쩡한 화면도 실패로 나온다. */
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 */ }
  });
  /* 🪤 포괄을 «먼저», 구체적인 것을 «뒤에» — route 는 나중에 등록한 것이 이긴다. */
  await ctx.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  /* ② 화면(adm-tlink.js)의 API — 경로가 «teacher-links»(단수)라 위 «teachers/links» 와 다르다. */
  await ctx.route('**/api/admin/teacher-links**', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, roster: TEACHERS, accounts: ACCOUNTS2 }),
    }));
  await ctx.route('**/api/admin/teachers/links**', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, teachers: TEACHERS, accounts: ACCOUNTS, links: LINKS }),
    }));

  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tl-wrap', { state: 'attached', timeout: 30000 });
  /* 🪤 IA6 는 카드를 «한 번에 한 장» 만 보여 준다(.ia6-hide = display:none).
        열지 않으면 글자는 읽히는데 «보인다·눌린다» 만 조용히 헛돈다. */
  await page.evaluate(() => {
    try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-teacher-links'); } catch (e) {}
    let el = document.getElementById('tl-wrap');
    while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.tlLoad());
  await page.waitForFunction(() => document.querySelectorAll('#tl-wrap select[data-username]').length >= 3,
    { timeout: 20000 });
  return { ctx, page };
}

/** 그 계정 줄의 <select> 안 <option> 라벨 목록 (빈 «연결 안 됨» 은 뺀다) */
const optsOf = (page, username) => page.evaluate(u => {
  const sel = document.querySelector('#tl-wrap select[data-username="' + u + '"]');
  if (!sel) return null;
  return Array.from(sel.options).filter(o => o.value).map(o => ({ v: o.value, t: o.textContent }));
}, username);

/* 🪤 `cb.checked = v` 뒤 렌더 함수를 «직접» 부르면, 그 체크박스의 배선(oninput/위임)이
      오타여도 검사가 전부 통과한다(CLAUDE.md 2장 「인라인 onclick·onchange 가 부르는 이름」).
      그래서 **실제로 누른다** — click() 은 체크박스에 input·change 를 모두 발생시킨다. */
const setShowLeft = async (page, id, on) => {
  await page.evaluate(a => {
    const cb = document.getElementById(a.id);
    if (cb.checked !== a.on) cb.click();
  }, { id, on });
  await page.waitForTimeout(180);
};

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const { page } = await open(browser);

    console.log('\n[ ⓪ 전제 — 검사가 실제로 그 화면을 보고 있는가 ]');
    const wrapVisible = await page.evaluate(() => {
      const el = document.getElementById('tl-wrap');
      return !!el && !!el.offsetParent;
    });
    check('연결 카드가 실제로 보인다 (IA6 가 안 감췄다)', wrapVisible,
      '카드가 .ia6-hide 면 아래 검사가 전부 헛돈다');
    const cbExists = await page.evaluate(() => !!document.getElementById('tl-show-left'));
    check('「퇴사 강사도 보기」 체크박스가 화면에 있다', cbExists);
    const cbOff = await page.evaluate(() => document.getElementById('tl-show-left').checked === false);
    check('그 체크박스는 기본이 «꺼짐» 이다', cbOff, '기본이 켜져 있으면 아무것도 안 막는다');

    console.log('\n[ ① 기본 상태 — 퇴사 강사가 목록에서 빠졌는가 ]');
    const base = await optsOf(page, 'mangoi_018');
    check('그 줄의 <option> 목록을 읽었다', Array.isArray(base) && base.length > 0,
      String(base));
    const ids = (base || []).map(o => o.v);
    check('퇴사 «HT FARRAH»(3) 가 안 보인다 — 이 사고의 주인공', !ids.includes('3'), ids.join(','));
    check('퇴사 «RICA»(4) 도 안 보인다', !ids.includes('4'), ids.join(','));
    check('퇴사 «MARIANE»(11) 도 안 보인다 (다른 계정 줄이므로)', !ids.includes('11'), ids.join(','));
    // ↔ 짝: 전부 숨기는 코드도 위 셋을 통과한다
    check('재직 «FAR»(22) 는 보인다', ids.includes('22'), ids.join(','));
    check('재직 «HANNAH»(24) 도 보인다', ids.includes('24'), ids.join(','));
    check('재직 «KRYSTEL»(16) 도 보인다', ids.includes('16'), ids.join(','));
    check('active 가 NULL 인 행(99)은 «재직» 으로 보고 남긴다', ids.includes('99'),
      'null 을 0 으로 읽으면 멀쩡한 강사가 조용히 사라진다');

    console.log('\n[ ② 이미 이어진 퇴사 강사 — 그 줄에서는 «절대» 숨기지 않는다 ]');
    const mine = await optsOf(page, 'mangoi_011');
    const mineIds = (mine || []).map(o => o.v);
    check('MARIANE(11) 이 «그 계정 줄» 에는 남아 있다', mineIds.includes('11'), mineIds.join(','));
    const sel11 = await page.evaluate(() =>
      document.querySelector('#tl-wrap select[data-username="mangoi_011"]').value);
    check('그리고 실제로 선택돼 있다 (「연결 안 됨」으로 안 보인다)', sel11 === '11', sel11);
    check('같은 줄에서도 이어지지 않은 퇴사자(3)는 여전히 안 보인다', !mineIds.includes('3'),
      mineIds.join(','));

    console.log('\n[ ③ 라벨 — 사람이 «퇴사» 임을 읽을 수 있는가 ]');
    const mineTxt = (mine || []).find(o => o.v === '11');
    check('보이는 퇴사자 라벨에 «(퇴사)» 가 붙는다', !!mineTxt && /\(퇴사\)/.test(mineTxt.t),
      mineTxt && mineTxt.t);
    const farTxt = (base || []).find(o => o.v === '22');
    check('재직 강사 라벨에는 «(퇴사)» 가 안 붙는다', !!farTxt && !/\(퇴사\)/.test(farTxt.t),
      farTxt && farTxt.t);

    console.log('\n[ ④ 되돌릴 길 — 체크박스로 꺼낼 수 있는가 ]');
    await setShowLeft(page, 'tl-show-left', true);
    const on = (await optsOf(page, 'mangoi_018') || []).map(o => o.v);
    check('켜면 퇴사자(3·4·11)가 전부 나온다',
      ['3', '4', '11'].every(x => on.includes(x)), on.join(','));
    check('켜도 재직 강사는 그대로 있다',
      ['22', '24', '16'].every(x => on.includes(x)), on.join(','));
    const onTxt = (await optsOf(page, 'mangoi_018') || []).find(o => o.v === '3');
    check('꺼낸 퇴사자에도 «(퇴사)» 라벨이 붙는다', !!onTxt && /\(퇴사\)/.test(onTxt.t),
      onTxt && onTxt.t);
    await setShowLeft(page, 'tl-show-left', false);
    const off = (await optsOf(page, 'mangoi_018') || []).map(o => o.v);
    check('끄면 다시 사라진다 (상태가 안 굳는다)', !off.includes('3'), off.join(','));

    console.log('\n[ ⑤ EN — 🌐 를 누르면 «따라오는가» (재렌더를 직접 부르지 않는다) ]');
    /* 🪤 `window.tlRender()` 를 손수 부르면 「라벨이 영어인가」만 보게 되고
       「🌐 를 누르면 따라오는가」는 한 번도 안 묻게 된다 — 이 표의 라벨은 JS 가 그려서
       `data-ko`/`data-en` 루프가 못 고치므로 그 배선이 없으면 새로고침해야 영어가 된다.
       ⚠️ 관리자 화면의 그 이벤트는 `window` 가 아니라 **`document`** 에서 발행된다. */
    await page.evaluate(() => {
      window.adminLang = 'en';
      document.dispatchEvent(new CustomEvent('mangoi:lang-changed'));
    });
    await page.waitForTimeout(200);
    const enMine = (await optsOf(page, 'mangoi_011') || []).find(o => o.v === '11');
    check('EN 에서는 «(left)» 로 나온다', !!enMine && /\(left\)/.test(enMine.t), enMine && enMine.t);
    const enIds = (await optsOf(page, 'mangoi_018') || []).map(o => o.v);
    check('EN 에서도 퇴사자는 기본에서 안 보인다', !enIds.includes('3'), enIds.join(','));
    await page.evaluate(() => {
      window.adminLang = 'ko';
      document.dispatchEvent(new CustomEvent('mangoi:lang-changed'));
    });
    await page.waitForTimeout(200);

    console.log('\n[ ⑥ 눌린다 — 「보인다」와 「눌린다」는 다르다 ]');
    const hit = await page.evaluate(() => {
      const sel = document.querySelector('#tl-wrap select[data-username="mangoi_018"]');
      sel.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = sel.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === sel || sel.contains(top));
    });
    check('강사 드롭다운이 맨 위에 있다 (무엇도 안 덮는다)', hit);

    console.log('\n[ ⑦ 두 번째 화면 (#card-teacher-link · adm-tlink.js) — 같은 구멍이 남지 않았는가 ]');
    /* 이 카드는 lazy 라 «펼쳐야» 스크립트가 실린다 — 열고 전역이 생기기를 기다린다. */
    await page.evaluate(() => {
      try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-teacher-link'); } catch (e) {}
      let el = document.getElementById('tlk-table');
      while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
    });
    let lazyOk = true;
    try {
      await page.waitForFunction(() => typeof window.tlkLoad === 'function', { timeout: 20000 });
      await page.evaluate(() => window.tlkLoad());
      await page.waitForFunction(() => document.querySelectorAll('#tlk-table select').length >= 2,
        { timeout: 20000 });
    } catch (e) { lazyOk = false; }
    check('두 번째 화면이 실제로 그려졌다 (lazy 로드 성공)', lazyOk,
      '여기서 실패하면 아래 검사가 전부 헛돈다');

    if (lazyOk) {
      /* 🪤 줄 «순서» 로 잡지 말 것 — 이 표의 정렬 키가 `order[status] || 9` 라
         `order.unlinked === 0` 이 falsy 로 떨어져 **「연결 안 됨」이 맨 아래로 갑니다**
         (「급한 것부터 위로」라는 그 코드의 주석과 정반대. 내 변경과 무관한 기존 결함이라
         여기서는 고치지 않고, 검사만 순서에 안 기대게 둡니다).
         각 <select> 에 `tlk-sel-<아이디>` 가 있으니 그것으로 콕 집는다. */
      const opts2 = (u) => page.evaluate(n => {
        const sel = document.getElementById('tlk-sel-' + n);
        if (!sel) return null;
        return Array.from(sel.options).filter(o => o.value).map(o => ({ v: o.value, t: o.textContent }));
      }, u);
      const a0 = (await opts2('mangoi_018')) || [];
      const ids0 = a0.map(o => o.v);
      check('퇴사 «HT FARRAH»(3) 가 안 보인다', !ids0.includes('3'), ids0.join(','));
      check('퇴사 «RICA»(4) 도 안 보인다', !ids0.includes('4'), ids0.join(','));
      // ↔ 짝: 전부 숨기는 코드도 위 둘을 통과한다
      check('재직 «FAR»(22)·«HANNAH»(24) 는 보인다',
        ids0.includes('22') && ids0.includes('24'), ids0.join(','));
      check('active 가 NULL 인 행(99)은 «재직» 으로 보고 남긴다', ids0.includes('99'), ids0.join(','));

      const a1 = (await opts2('mangoi_011')) || [];
      const ids1 = a1.map(o => o.v);
      check('이미 이어진 퇴사자 MARIANE(11) 은 «그 줄» 에 남아 있다', ids1.includes('11'), ids1.join(','));
      const t11 = a1.find(o => o.v === '11');
      check('그 라벨에 «(퇴사)» 가 붙는다', !!t11 && /\(퇴사\)/.test(t11.t), t11 && t11.t);

      await setShowLeft(page, 'tlk-show-left', true);
      const on2 = ((await opts2('mangoi_018')) || []).map(o => o.v);
      check('체크박스를 «실제로 눌러» 켜면 퇴사자가 나온다 (위임 배선이 산다)',
        ['3', '4', '11'].every(x => on2.includes(x)), on2.join(','));
      await setShowLeft(page, 'tlk-show-left', false);
      const off2 = ((await opts2('mangoi_018')) || []).map(o => o.v);
      check('끄면 다시 사라진다', !off2.includes('3'), off2.join(','));

      await page.evaluate(() => {
        window.adminLang = 'en';
        document.dispatchEvent(new CustomEvent('mangoi:lang-changed'));
      });
      await page.waitForTimeout(200);
      const en1 = ((await opts2('mangoi_011')) || []).find(o => o.v === '11');
      check('🌐 를 누르면 «(left)» 로 따라온다 (재렌더를 직접 안 불렀다)',
        !!en1 && /\(left\)/.test(en1.t), en1 && en1.t);
    }

  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
