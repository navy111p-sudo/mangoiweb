// -*- coding: utf-8 -*-
// 🔐 «역할별 사이드바 숨김» 브라우저 검사 (2026-09-09)
//
//   왜 이 검사가 있나 — 사장님 「역할별 사이드바 숨김도 고쳐줘」. 원인이 **둘**이었다.
//
//   ① **이기는 규칙** — adm-ia6.js 가 document.head 에 주입하는
//      `#ph85-sidebar .ia6-role-hide{display:none!important}`(1,1,0)와 겨루는 규칙이
//      admin-inline-c.css 에 **셋** 있다(선택자로 찾을 것 — 행 번호로 적지 말 것):
//        `#ph85-sidebar .ph85-group{display:block!important}`
//        `#ph85-sidebar .ph85-sub{display:block!important}`
//        `#ph85-sidebar .ph85-sub{display:flex!important}`
//      전부 (1,1,0) 동률인데 그 CSS 는 `<head>` 가 아니라 **`<body>` 안**에서 링크되어
//      언제나 «뒤» 라 **언제나 이긴다.** 그 블록의 자기 주석이 「권한 시스템이 어떤 역할로
//      hide 해도 ph85 사이드바는 강제 visible」이라 **역할 감춤을 이기려고 만들어진 규칙**이다.
//      [잰 것] class 는 붙었는데 computed display 가 flex ⟹ 역할 감춤이 한 번도 안 먹고 있었다.
//      ⛔ 그래서 특이성을 (1,2,0)으로 올린 그 두 줄을 «군더더기» 로 지우지 말 것 —
//         지우면 이 검사가 실제로 14건 FAIL 한다(변이시험으로 확인).
//      ⚠️ 처음에 나는 이것을 「겨루는 규칙이 저장소에 없다」고 **틀리게** 적었다.
//         `document.styleSheets` 를 훑는 코드가 `if(r.cssRules)` 로 갈라 한 개도 못 보고 있었다
//         (Chrome 112+ 는 평범한 style 규칙에도 빈 cssRules 가 있다 — CLAUDE.md 2장).
//
//   ② **판정이 그 항목을 아예 안 본다** — applyRoleFilter 는 «가리키는 카드가 전부 감춰졌나» 로
//      판정하는데, 딴 페이지로 가는 항목(href)은 카드가 아예 없어 known=0 → 언제나 «남긴다».
//      그래서 서버가 403 으로 막는 화면이 강사·지사 사이드바에 그대로 떴다.
//      그 사실은 adm-ia6.js 안에 두 곳이나 주석으로 적혀 있었다(monitor-wall · 환불) —
//      «적어 둔 것» 이 «고친 것» 이 아니라는 이 저장소의 오랜 함정 그대로다.
//
//   ⚠️ **«평소 화면» 이 이랬다고 읽지 말 것** — 강사가 /admin.html 을 열면 teacherPortalRedirect 가
//      /teacher 로, 조직 계정은 managerPortalRedirect 가 /manager 로 302 한다(둘 다 `?full=1` 로만
//      우회). 그래서 이 감춤이 실제로 걸리는 곳은 «`?full=1` 로 콘솔에 들어온 경우» 다.
//      그 빈도는 재지 않았다.
//
//   왜 브라우저인가 —
//     함수도 값도 «있고» 틀린 것은 «누가 무엇을 보는가» 뿐이다. 수리 전에도
//     `run.mjs --fast` 가 전부 초록이었다. 문자열 하니스로는 원리상 못 본다.
//
//   ⛔ 「감춰진다」만 세지 말 것 — 반드시 짝으로 센다. 한쪽만 두면
//      «전부 감추기» 도 «아무것도 안 감추기» 도 통과한다:
//        · 강사에게 환불이 사라진다     ↔ 본사에게는 그대로 보인다
//        · 지사에게 수업 길이가 사라진다 ↔ 강사에게는 그대로 보인다(서버가 강사는 안 막는다)
//        · 강사에게 관제탑이 사라진다   ↔ 지사에게는 그대로 보인다(classes-now 는 열려 있다)
//        · 역할을 모르면 아무것도 안 감춘다 ↔ 신원이 늦게 오면 그때 감춘다
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/admin-sidebar-role-hide-browser.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8953;                       // 다른 검사와 겹치지 않게 (서비스워커 캐시 회피)
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

/* 역할을 «서버가 확인해 준 것» 으로 심는다 — adm-identity.js 가 /api/admin/me 를 보고
   window.__ADM_ME 를 채운다. role 을 null 로 주면 «신원이 안 온» 상태를 만든다. */
async function open(browser, role) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  /* 🪤 빈 브라우저는 «첫 방문자» 라 환영 안내(#aw-overlay)가 html{overflow:hidden} 을 걸고
        사람이 닫아야 푼다 — 그대로 두면 멀쩡한 화면도 실패로 나온다.
     🪤 admin_session 에 «지난 방문의 서버 출처 값» 이 남아 있으면 admIdentity() 가 그걸 쓴다.
        회차마다 새 컨텍스트라 비어 있지만, 명시적으로 지워 «이번 회차의 역할» 만 남긴다. */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.removeItem('admin_session');
    } catch (e) { /* 시크릿 */ }
  });
  /* 🪤 포괄을 «먼저», 구체적인 것을 «뒤에» — route 는 나중에 등록한 것이 이긴다. */
  await ctx.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"results":[]}' }));
  await ctx.route('**/api/admin/me*', route => {
    if (!role) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, user: { username: 'probe', name: 'probe' }, role, roleLabel: role, scope: { label: role } }),
    });
  });

  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  /* 사이드바가 다 그려지고 역할 필터가 한 번은 돈 뒤에 잰다.
     ⚠️ 시간으로 때우지 말 것 — 느린 기계에서 조용히 «0건» 이 되어 검사가 헛돈다. */
  await page.waitForFunction(() => {
    const sb = document.getElementById('ph85-sidebar');
    return sb && sb.querySelectorAll('.ph85-sub').length > 10 && !!window.mangoiIA6;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/* 「보인다」 판정 — classList 가 아니라 **계산된 display** 로 본다.
   「붙었다」·「보인다」는 다르다(CLAUDE.md 2장). */
const seen = (page, ko) => page.evaluate((ko) => {
  const sb = document.getElementById('ph85-sidebar');
  const all = [].slice.call(sb.querySelectorAll('.ph85-sub'));
  const el = all.filter(e => (e.getAttribute('data-ko') || '') === ko)[0];
  if (!el) return { found: false };
  const grp = el.closest('.ph85-group');
  return {
    found: true,
    display: getComputedStyle(el).display,
    roleHide: el.classList.contains('ia6-role-hide'),
    groupHide: !!(grp && grp.classList.contains('ia6-role-hide')),
  };
}, ko);

/* ⚠️ 이것은 «화면에 보인다» 가 아니라 **«역할로 감춰지지 않았다»** 입니다 —
   `.ph85-sub` 는 접힌 아코디언 안에서도 위 경쟁 규칙 때문에 computed display 가 `flex` 입니다.
   이 버그를 재는 데는 맞는 측정이지만, 「열렸다·보인다·눌린다는 다 다릅니다」와 헷갈리지 말 것. */
const notRoleHidden = s => s.found && s.display !== 'none' && !s.roleHide;

(async () => {
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let ctx;
  try {
    /* 이 화면의 href 항목 다섯 — 서버 게이트를 실측해 정한 기대값(2026-09-09).
       ⚠️ 「수강 운영」은 **일부러 아무에게도 안 감춘다** — `/api/pay/enroll/admin/*` 이
          checkAdminSession 만 보고 강사·지사를 안 막는다. 서버가 여는 것을 화면만
          감추면 «URL 로는 되는데 메뉴만 없는» 상태가 되고, 그건 이 저장소가 금지한 모양이다.
          (서버 게이트를 더할지는 사람이 정할 일 — 작업기록 참고) */
    const CASES = [
      { role: 'hq',       show: ['수업 관제탑', '수업 길이 변경', '수강 운영', '환불 처리', '영업 실적·평가'], hide: [] },
      { role: 'staff',    show: ['수업 관제탑', '수업 길이 변경', '수강 운영', '환불 처리', '영업 실적·평가'], hide: [] },
      { role: 'teacher',  show: ['수업 길이 변경', '수강 운영'], hide: ['수업 관제탑', '환불 처리', '영업 실적·평가'] },
      { role: 'branch',   show: ['수업 관제탑', '수강 운영'],   hide: ['수업 길이 변경', '환불 처리', '영업 실적·평가'] },
      { role: 'agency',   show: ['수업 관제탑', '수강 운영'],   hide: ['수업 길이 변경', '환불 처리', '영업 실적·평가'] },
      { role: 'franchise',show: ['수업 관제탑', '수강 운영'],   hide: ['수업 길이 변경', '환불 처리', '영업 실적·평가'] },
      // 🔓 fail-open — 신원이 안 왔거나 모르는 역할이면 **아무것도 감추지 않는다**
      { role: null,       show: ['수업 관제탑', '수업 길이 변경', '수강 운영', '환불 처리', '영업 실적·평가'], hide: [] },
      { role: 'brand-new-role-2027',
                          show: ['수업 관제탑', '수업 길이 변경', '수강 운영', '환불 처리', '영업 실적·평가'], hide: [] },
    ];

    /* ⓪ 전제 — 손으로 적은 CASES 가 «지금 있는 href 항목» 을 전부 담았는가.
       ⛔ 이게 없으면 6번째 href 항목이 생겨도 검사가 **아무 말도 안 합니다**(조용히 빠집니다).
       ⚠️ GROUPS 를 오려 내 eval 하므로, 그 블록이 «순수 리터럴» 이 아니게 되면 여기서 먼저 FAIL 합니다
          (2026-09-09 에 상수 이름을 썼다가 다른 하니스 셋을 깨뜨렸습니다 — 그 계약을 여기서도 지킵니다). */
    console.log('\n⓪ 전제 — 검사 목록이 지금의 href 항목을 전부 담았는가');
    {
      const src = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'js', 'adm-ia6.js'), 'utf8');
      const i = src.indexOf('var GROUPS = [');
      const j = src.indexOf('\n  ];', i);
      let G = null;
      if (i >= 0 && j >= 0) {
        let body = src.slice(i + 'var GROUPS = '.length, j + 4)
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        try { G = eval(body); } catch { G = null; }
      }
      check('GROUPS 를 오려 내 읽었다 (순수 리터럴이다)', Array.isArray(G) && G.length > 0);
      if (Array.isArray(G)) {
        const hrefs = [];
        G.forEach(g => (g.items || []).forEach(it => { if (it.href) hrefs.push(it.ko); }));
        const covered = new Set([].concat(...CASES.map(c => c.show.concat(c.hide))));
        const missing = hrefs.filter(k => !covered.has(k));
        check('href 항목이 전부 검사 목록에 있다', missing.length === 0, '빠진 것: ' + missing.join(' · '));
        /* 짝 — 없는 이름을 적어 두고 «다 덮었다» 고 착각하지 않게 */
        const ghost = [...covered].filter(k => !hrefs.includes(k));
        check('검사 목록에 «없는 항목» 이 적혀 있지 않다', ghost.length === 0, '있지도 않은 것: ' + ghost.join(' · '));
      }
    }

    for (const c of CASES) {
      console.log(`\n■ 역할 = ${c.role === null ? '(신원 미도착)' : c.role}`);
      const opened = await open(browser, c.role); ctx = opened.ctx;
      const page = opened.page;
      for (const ko of c.show) {
        const s = await seen(page, ko);
        check(`「${ko}」 역할로 안 감춰진다`, notRoleHidden(s), JSON.stringify(s));
      }
      for (const ko of c.hide) {
        const s = await seen(page, ko);
        check(`「${ko}」 감춰진다`, s.found && s.display === 'none', JSON.stringify(s));
      }
      await ctx.close(); ctx = null;
    }

    // ─────────────────────────────────────────────────────────────────────
    console.log('\n■ 신원이 «늦게» 왔을 때 — 그때 감춰지는가');
    {
      /* 부팅 시점에는 역할이 없다(401) → 아무것도 안 감춘다.
         나중에 adm-identity 가 그러듯 document 로 mangoi:identity 를 쏘면 그때 감춰져야 한다.
         ⚠️ 그 이벤트는 window 가 아니라 **document** 에서 발행된다(CustomEvent 기본 bubbles:false). */
      const opened = await open(browser, null); ctx = opened.ctx;
      const page = opened.page;
      const before = await seen(page, '환불 처리');
      check('신원 전에는 「환불 처리」가 안 감춰진다', notRoleHidden(before), JSON.stringify(before));

      await page.evaluate(() => {
        window.__ADM_ME = { uid: 'probe', name: 'probe', role: 'teacher', __fromServer: true };
        document.dispatchEvent(new CustomEvent('mangoi:identity', { detail: window.__ADM_ME }));
      });
      await page.waitForTimeout(400);
      const after = await seen(page, '환불 처리');
      check('신원이 오면 「환불 처리」가 감춰진다', after.found && after.display === 'none', JSON.stringify(after));

      // 짝 — 같은 순간에 «감추면 안 되는 것» 은 그대로 남아야 한다
      const keep = await seen(page, '수업 길이 변경');
      check('같은 순간 「수업 길이 변경」은 강사에게 그대로 남는다', notRoleHidden(keep), JSON.stringify(keep));

      /* window 에서 듣게 되돌리는 실수를 막는 짝 검사 —
         window 로 쏜 같은 이벤트로는 «아무 일도 안 일어나야» 정상이 아니라,
         document 리스너가 살아 있으면 이미 위에서 감춰졌으므로 여기서는 상태만 확인한다. */
      await page.evaluate(() => { window.__ADM_ME = { role: 'hq', __fromServer: true };
                                  document.dispatchEvent(new CustomEvent('mangoi:identity')); });
      await page.waitForTimeout(400);
      const back = await seen(page, '환불 처리');
      check('역할이 본사로 바뀌면 감춤이 풀린다(굳지 않는다)', notRoleHidden(back), JSON.stringify(back));
      await ctx.close(); ctx = null;
    }

    // ─────────────────────────────────────────────────────────────────────
    console.log('\n■ 공용 PC — 앞사람의 «지난 방문 값» 으로 본사 메뉴가 사라지지 않는가');
    {
      /* 🪤 `admIdentity()` 는 localStorage['admin_session'] 에 __fromServer 표식이 있으면
            **지난 방문 값**을 돌려준다. myRole() 이 그것으로 떨어지면 공용 PC 에서
            앞사람이 강사였을 때 본사 사람의 메뉴가 «잠시 사라진다» — 빠지는 쪽이다.
         ⚠️ 다른 회차는 open() 이 그 키를 지우고 시작하므로 이 경로를 한 번도 안 밟는다.
            그래서 여기서만 «앞사람 값이 남아 있는» 상태를 일부러 만든다. */
      const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const page2 = await ctx2.newPage();
      await page2.addInitScript(() => {
        try {
          localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
          localStorage.setItem('admin_session', JSON.stringify({
            uid: 'prev', name: 'prev', role: 'teacher', __fromServer: true,   // ← 앞사람: 강사
          }));
        } catch (e) { /* 시크릿 */ }
      });
      await ctx2.route('**/api/**', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"results":[]}' }));
      // 서버 응답은 «오지 않는다» — 신원이 아직 안 온 순간을 재현한다
      await ctx2.route('**/api/admin/me*', route =>
        route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }));
      await page2.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
      await page2.waitForFunction(() => {
        const sb = document.getElementById('ph85-sidebar');
        return sb && sb.querySelectorAll('.ph85-sub').length > 10 && !!window.mangoiIA6;
      }, null, { timeout: 30000 });
      await page2.waitForTimeout(1500);
      const stale = await page2.evaluate(() => {
        const sb = document.getElementById('ph85-sidebar');
        const el = [].slice.call(sb.querySelectorAll('.ph85-sub'))
          .filter(e => e.getAttribute('data-ko') === '환불 처리')[0];
        return { found: !!el, display: el ? getComputedStyle(el).display : null,
                 roleHide: el ? el.classList.contains('ia6-role-hide') : null,
                 prev: (() => { try { return JSON.parse(localStorage.getItem('admin_session') || '{}').role; } catch (e) { return null; } })() };
      });
      check('전제 — 앞사람의 «강사» 값이 localStorage 에 남아 있다', stale.prev === 'teacher', JSON.stringify(stale));
      check('그래도 「환불 처리」가 감춰지지 않는다 (지난 방문 값을 안 믿는다)',
        stale.found && stale.display !== 'none' && !stale.roleHide, JSON.stringify(stale));
      await ctx2.close();
    }

    // ─────────────────────────────────────────────────────────────────────
    console.log('\n■ 그룹째 감춤 — 한 그룹의 항목이 하나도 안 남으면 그룹도 사라지는가');
    {
      /* ⚠️ 지금 실제 역할 여덟 개로는 이 경로가 한 번도 안 일어납니다 —
            그래서 `#ph85-sidebar .ph85-group.ia6-role-hide` 줄을 지워도 위 검사들은 전부 통과합니다.
            그룹 쪽에도 경쟁 규칙(`#ph85-sidebar .ph85-group{display:block!important}`)이 실재하므로
            여기서 «가짜로 한 그룹을 비워» 그 줄이 실제로 이기는지 잽니다. */
      const opened = await open(browser, 'hq'); ctx = opened.ctx;
      const page = opened.page;
      const r = await page.evaluate(() => {
        const sb = document.getElementById('ph85-sidebar');
        /* ⚠️ 첫 번째 그룹을 집으면 안 된다 — 「메뉴 지도」처럼 `.ph85-sub` 가 0개인 그룹이 있어
              전제가 «항목이 없는 그룹» 으로 실패한다(실측). **항목이 있는 그룹**을 골라야 한다. */
        const grp = [].slice.call(sb.querySelectorAll('.ph85-group[data-ia6]'))
          .filter(g => g.querySelectorAll('.ph85-sub').length > 0)[0];
        if (!grp) return { ok: false, why: '항목이 있는 그룹을 못 찾음' };
        const subs = [].slice.call(grp.querySelectorAll('.ph85-sub'));
        const before = getComputedStyle(grp).display;
        // 그 그룹의 모든 항목에 «있지도 않은 역할» 금지목록을 달고 그 역할로 판정시킨다
        subs.forEach(e => e.setAttribute('data-ia6-hide-from', 'zz-probe-role'));
        const keep = window.__ADM_ME;
        window.__ADM_ME = { role: 'zz-probe-role', __fromServer: true };
        window.mangoiIA6.applyRoleFilter();
        const after = getComputedStyle(grp).display;
        const cls = grp.classList.contains('ia6-role-hide');
        // 되돌린다
        subs.forEach(e => e.removeAttribute('data-ia6-hide-from'));
        window.__ADM_ME = keep;
        window.mangoiIA6.applyRoleFilter();
        const back = getComputedStyle(grp).display;
        return { ok: true, before, after, cls, back };
      });
      check('전제 — 항목이 있는 그룹을 찾았다', r.ok, r.why || '');
      if (r.ok) {
        check('그룹이 원래는 보인다', r.before !== 'none', JSON.stringify(r));
        check('항목이 하나도 안 남으면 그룹에 ia6-role-hide 가 붙는다', r.cls === true, JSON.stringify(r));
        check('그리고 실제로 감춰진다 (경쟁 규칙을 이긴다)', r.after === 'none', JSON.stringify(r));
        check('되돌리면 그룹이 돌아온다', r.back !== 'none', JSON.stringify(r));
      }
      await ctx.close(); ctx = null;
    }

    // ─────────────────────────────────────────────────────────────────────
    console.log('\n■ 회귀 — «카드 기반» 항목의 역할 감춤이 그대로 도는가');
    {
      const opened = await open(browser, 'hq'); ctx = opened.ctx;
      const page = opened.page;
      const r = await page.evaluate(() => {
        const sb = document.getElementById('ph85-sidebar');
        const el = [].slice.call(sb.querySelectorAll('.ph85-sub[data-cards]'))
          .filter(e => {
            const ids = (e.getAttribute('data-cards') || '').split(' ').filter(Boolean);
            return ids.length === 1 && document.getElementById(ids[0]);
          })[0];
        if (!el) return { ok: false, why: '카드 한 장짜리 항목을 못 찾음' };
        const ko = el.getAttribute('data-ko');
        const card = document.getElementById(el.getAttribute('data-cards').trim());
        const before = getComputedStyle(el).display;
        card.classList.add('rbac-hide');
        window.mangoiIA6.applyRoleFilter();
        const after = getComputedStyle(el).display;
        card.classList.remove('rbac-hide');
        window.mangoiIA6.applyRoleFilter();
        const back = getComputedStyle(el).display;
        return { ok: true, ko, before, after, back };
      });
      check('전제 — 카드 한 장짜리 항목을 찾았다', r.ok, r.why || '');
      if (r.ok) {
        check(`「${r.ko}」 카드가 열려 있을 때는 보인다`, r.before !== 'none', JSON.stringify(r));
        check(`「${r.ko}」 카드를 감추면 항목도 감춰진다`, r.after === 'none', JSON.stringify(r));
        check(`「${r.ko}」 카드를 되살리면 항목도 돌아온다`, r.back !== 'none', JSON.stringify(r));
      }
      await ctx.close(); ctx = null;
    }

    console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  } catch (e) {
    console.log('  ❌ 검사 중 예외: ' + (e && e.message));
    fail++;
  } finally {
    try { if (ctx) await ctx.close(); } catch {}
    await browser.close();
    if (srv) srv.kill();
  }
  process.exit(fail ? 1 : 0);
})();
