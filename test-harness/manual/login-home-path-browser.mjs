/*
 * 🏠 로그인 뒤 «첫 화면» 이 서버가 정한 곳으로 가는지 확인한다.
 *
 * 왜 — 이 판정이 화면 세 곳에 복제돼 있었다. 하나만 고치면 «어느 문으로 로그인했느냐에
 *      따라 다른 화면» 이 되는데, 코드만 읽어서는 그 어긋남이 안 보인다.
 *      그래서 두 문(관리자 로그인 화면 · 홈 통합로그인)을 실제로 눌러 본다.
 *
 * 서버는 띄우지 않는다 — fetch 를 가짜로 바꾼다(운영 DB 를 건드리지 않는다).
 */
import { requireBrowser } from './_pw.mjs';

/* 🪤 file:// 로 열면 안 된다 — `<script src="/js/…">` 가 파일시스템 루트를 가리켜 전부 404 가
      되고, 스크립트가 하나도 안 돌아 «기능이 죽었다» 로 오진하게 된다(CLAUDE.md 함정, 실제로 밟음).
      그래서 정적 서버로 띄운 주소를 쓴다:
        cd cloudflare-deploy/public && python3 -m http.server 8899 */
const BASE = process.env.WORK_BASE || 'http://127.0.0.1:8899';
const { chromium, exe } = requireBrowser();

let PASS = 0, FAIL = 0;
const check = (n, c, x) => { if (c) { PASS++; console.log('  OK   ' + n); }
                             else { FAIL++; console.log('  FAIL ' + n + (x ? ' — ' + x : '')); } };

/** 로그인 API 가 돌려줄 값 — 서버가 정한 첫 화면(home_path)을 함께 준다 */
const reply = (username, role, homePath, isTeacher, uiRole) => ({
  ok: true, username, expires_at: Date.now() + 36e5, redirect: '/admin.html',
  name: username, server_role: role, role_label: role, is_teacher: !!isTeacher,
  home_path: homePath, display_name: username, pref_lang: 'ko', nationality: 'PH',
  /* ⚠️ login.html:208 은 role 을 server_role 이 아니라 **ui_role** 에서 읽는다.
        여기를 'hq_mgr' 로 고정해 두면 지사·대리점 폴백 검사가 «코드 잘못» 처럼 보인다. */
  ui_role: uiRole || 'hq_mgr',
});

async function go(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript((r) => {
    window.__dest = null;
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/admin/login') === 0) return Promise.resolve(new Response(JSON.stringify(r), { status: 200 }));
      if (u.indexOf('/api/') === 0) return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      return rf(u, o);
    };
    /* 🪤 이동을 가로채 변수에 적어 두면 안 된다 — 페이지가 실제로 넘어가는 순간 그 변수도
          함께 초기화돼 «항상 null» 이 된다(만들면서 실제로 밟아, 되는 기능을 4건 실패로 읽었다).
          최종 주소(page.url())를 밖에서 읽는 것이 맞다. */
  }, who.reply);
  await page.goto(BASE + '/admin/login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.fill('#username', who.id).catch(() => {});
  await page.fill('#password', 'test1234').catch(() => {});
  await page.evaluate(() => { const f = document.querySelector('form'); if (f) f.requestSubmit ? f.requestSubmit() : f.submit(); });
  await page.waitForTimeout(1800);
  const u = new URL(page.url());
  await ctx.close();
  return u.pathname;
}

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  console.log('\n[1] 필리핀 매니저 — 가벼운 화면(/manager)으로 가야 한다');
  let d = await go(browser, { id: 'mgr_karl', reply: reply('mgr_karl', 'hq', '/manager', false) });
  check('Karl → /manager', d === '/manager', String(d));

  console.log('\n[2] 사장님 — 관리자 화면 그대로');
  d = await go(browser, { id: 'admin', reply: reply('admin', 'hq', '/admin.html', false) });
  check('admin → /admin.html', d === '/admin.html', String(d));

  console.log('\n[3] 강사 — 강사 포털');
  d = await go(browser, { id: 'hq_t_kim', reply: reply('hq_t_kim', 'teacher', '/teacher', true) });
  check('교사 → /teacher', d === '/teacher', String(d));

  console.log('\n[4] 서버가 값을 안 줄 때(구버전 응답) — 옛 규칙으로 버틴다');
  const legacy = reply('branch_busan', 'branch', undefined, false, 'branch'); delete legacy.home_path;
  d = await go(browser, { id: 'branch_busan', reply: legacy });
  check('지사 → /manager (폴백)', d === '/manager', String(d));

  await browser.close();
  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
