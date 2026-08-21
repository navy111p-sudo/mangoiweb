/*
 * 🧭 경로 줄(#mi-crumb)이 «어느 메뉴에서든, 어디까지 내려가도» 화면 맨 위에 붙어 있는가
 *
 * [왜 만들었나 — 2026-08-20]
 *   사장님 신고: 「화면 맨 위 줄이 관리자 자료실에서는 보이는데 강사 자료실을 누르면 사라진다」
 *   원인은 sticky 의 «부모 상자» 였다. 카드 87장 중 14장이 #admin-main-scale «밖»에 있어서,
 *   그 14장으로 뛰는 메뉴에서는 부모 바닥이 화면 꼭대기 근처에 있었고 조금만 내려가면
 *   줄이 통째로 화면 밖으로 밀려났다.
 *
 *   🔴 그런데 그때 **타입체크·회귀 하니스 211개·CI 배포 게이트가 전부 초록불**이었다.
 *      문자열을 찾는 검사로는 「좌표가 어디인가」를 볼 수 없기 때문이다.
 *      CLAUDE.md 2장이 같은 말을 여러 번 하고 있다 — 「열렸다」와 「보인다」는 다르다.
 *      그래서 이 검사는 **실제로 브라우저에 그려서 getBoundingClientRect() 로 잰다.**
 *
 * [무엇을 재나]
 *   ① 사이드바 항목 전부(43개) — 누른 직후 · 맨 아래까지 굴린 뒤, 줄이 화면 맨 위(top≈0)에 있는가
 *   ② 「자료실」 손자 5개 — 신고가 들어온 바로 그 자리
 *   ③ 폭 5가지 — 줄의 왼쪽·너비가 본문 컬럼과 같은가 (PC 1920·1440 / 태블릿 1024·1023 / 폰 390)
 *   ④ 폰·태블릿에서도 굴린 뒤 붙어 있는가  ← 2026-08-20 까지 여기가 깨져 있었다
 *
 * [돌리는 법]  test-harness/manual/README.md 참고
 *     mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *     PW_DIR=/tmp/pw node test-harness/manual/crumb-sticky-browser.mjs
 *   정적 서버는 이 파일이 스스로 띄웠다 내린다(운영 DB 는 건드리지 않는다 — 파일만 서빙한다).
 *
 * ⚠️ file:// 로 열면 안 된다 — `<script src="/js/…">` 가 파일시스템 루트를 가리켜 전부 404 가 되고,
 *    스크립트가 하나도 안 돌아 «기능이 죽었다» 로 오진한다(CLAUDE.md 함정, 실제로 밟음).
 * ⚠️ body{zoom:1.3} 이라 getBoundingClientRect() 값은 이미 배율이 곱해진 «화면 px» 이다.
 *    줄과 컬럼을 **같은 자로** 재서 비교하므로 여기서는 배율을 나눌 필요가 없다.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.CRUMB_PORT || 8899);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

/* ── 정적 서버 ────────────────────────────────────────────────────────────── */
async function serve() {
  try {                                   // 이미 떠 있으면 그대로 쓴다
    const r = await fetch(BASE + '/admin.html', { method: 'HEAD' });
    if (r.ok) return null;
  } catch { /* 아직 없다 — 아래에서 띄운다 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error(`정적 서버를 못 띄웠습니다 (${PUBLIC})`);
}

/* ── 화면 하나 열기 ──────────────────────────────────────────────────────────
   ⚠️ 컨텍스트를 새로 만들어 localStorage 를 비운다. adm-ia6.js 가 «마지막으로 보던 항목» 을
      거기 적어 두기 때문에, 앞 검사의 흔적이 남으면 다음 검사가 엉뚱한 화면에서 시작한다.
   ⚠️ 사이드바는 adm-ia6.js 가 나중에 그린다. 항목이 생길 때까지 기다린다. */
async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: false });
  const page = await ctx.newPage();
  /* 🪤 «환영 안내»(#aw-overlay)를 닫힌 상태로 시작한다 — 처음 여는 사람에게만 뜨는 안내인데,
        js/adm-welcome.js 가 열릴 때 `html{overflow:hidden}` 을 걸고 사람이 닫아야만 푼다.
        빈 브라우저로 열면 그 안내가 계속 떠 있어 **멀쩡한 폭까지 실패로 나온다**
        (2026-08-20 실제로 1023px 을 거짓 실패로 읽었다). 실제 사용자는 한 번 닫으면 다시 안 뜬다. */
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 모드 */ }
  });
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ph85-sidebar [data-ia6-item]', { timeout: 30000 });
  await page.waitForTimeout(2500);        // IA6 가 카드까지 고르고 나서 재야 한다
  return { ctx, page };
}

/** 줄과 컬럼의 좌표를 «같은 자로» 잰다 */
const measure = (page) => page.evaluate(() => {
  const b = document.getElementById('mi-crumb');
  const m = document.getElementById('admin-main-scale');
  if (!b || !m) return null;
  const rb = b.getBoundingClientRect(), rm = m.getBoundingClientRect();
  return {
    off: b.classList.contains('mi-crumb-off'),
    display: getComputedStyle(b).display,
    top: Math.round(rb.top), left: Math.round(rb.left), width: Math.round(rb.width),
    colLeft: Math.round(rm.left), colWidth: Math.round(rm.width),
    scrollY: Math.round(window.scrollY),
  };
});

/** 「화면 맨 위에 붙어 있다」의 정의 — 감춰지지 않았고 위쪽이 화면 안(0±2px)에 있다 */
const stuck = (r) => !!r && !r.off && r.display !== 'none' && r.top >= -2 && r.top <= 2;
const say = (r) => r ? `top=${r.top} off=${r.off} scrollY=${r.scrollY}` : '측정 실패';

const clickItem = (page, key) => page.evaluate((k) => {
  const e = document.querySelector('#ph85-sidebar [data-ia6-item="' + k.replace(/"/g, '\\"') + '"]');
  if (e) e.click();
  return !!e;
}, key);

const toBottom = async (page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(350);
};

/* 이 여섯은 카드가 #admin-main-scale «밖»에 있는 메뉴다(마지막 하나는 «안»에 있는 대조군).
   2026-08-20 버그가 정확히 이 목록에서만 났다. 좁은 폭 검사는 시간을 아끼려고 이것만 본다. */
const OUTSIDE = ['ops:자료실', 'money:결제', 'teacher:시간표·근무', 'teacher:수업 일지', 'lesson:숙제'];
const INSIDE = 'money:회계';

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  try {
    /* ── ① PC 1920 — 사이드바 항목 전부 ───────────────────────────────────── */
    console.log('\n[1] PC 1920×1080 — 사이드바 항목 전부, 누른 직후와 맨 아래에서');
    {
      const { ctx, page } = await open(browser, 1920, 1080);
      const keys = await page.evaluate(() =>
        [].slice.call(document.querySelectorAll('#ph85-sidebar [data-ia6-item]'))
          .map(e => e.getAttribute('data-ia6-item')));
      let badClick = [], badBottom = [];
      for (const k of keys) {
        await clickItem(page, k);
        await page.waitForTimeout(900);
        const a = await measure(page);
        if (!stuck(a)) badClick.push(`${k}(${say(a)})`);
        await toBottom(page);
        const b = await measure(page);
        if (!stuck(b)) badBottom.push(`${k}(${say(b)})`);
      }
      check(`항목 ${keys.length}개 — 누른 직후 줄이 맨 위에`, badClick.length === 0, badClick.slice(0, 4).join(' · '));
      check(`항목 ${keys.length}개 — 맨 아래까지 굴린 뒤에도 맨 위에`, badBottom.length === 0, badBottom.slice(0, 4).join(' · '));
      await ctx.close();
    }

    /* ── ② 「자료실」 손자 5개 — 신고가 들어온 그 자리 ────────────────────── */
    console.log('\n[2] 「자료실」 손자 5개 (2026-08-20 신고 지점)');
    {
      const { ctx, page } = await open(browser, 1920, 1080);
      await clickItem(page, 'ops:자료실');
      await page.waitForTimeout(1200);
      const gcs = ['1관리자 자료실', '2강사 자료실', '3지사 자료실', '4대리점 자료실', '5학생·학부모 자료실'];
      const cards = ['card-lib-admin', 'card-lib-teacher', 'card-lib-branch', 'card-lib-agency', 'card-lib-student'];
      for (let i = 0; i < gcs.length; i++) {
        const found = await page.evaluate((n) => {
          const g = [].slice.call(document.querySelectorAll('#ph85-sidebar .ph125-gc'))
            .filter(x => (x.textContent || '').trim().indexOf(n) === 0)[0];
          if (g) g.click();
          return !!g;
        }, gcs[i]);
        await page.waitForTimeout(1600);
        const r = await measure(page);
        check(`▸ ${gcs[i]} — 줄이 맨 위에`, found && stuck(r), found ? say(r) : '손자 항목을 못 찾음');
        /* 「보인다」와 「안 가린다」는 다르다 — 목적지 카드 제목이 줄 밑에 와야 한다 */
        const gap = await page.evaluate((id) => {
          const c = document.getElementById(id), b = document.getElementById('mi-crumb');
          if (!c || !b) return null;
          return Math.round(c.getBoundingClientRect().top - b.getBoundingClientRect().bottom);
        }, cards[i]);
        check(`▸ ${gcs[i]} — 카드 제목이 줄에 안 가림`, gap !== null && gap >= -2, `카드 top − 줄 bottom = ${gap}`);
      }
      await ctx.close();
    }

    /* ── ③④ 폭별 — 자리 맞음 + 굴린 뒤에도 붙어 있음 ─────────────────────── */
    for (const [w, h, label] of [[1920, 1080, 'PC'], [1440, 900, 'PC 좁게'],
                                 [1024, 900, '태블릿 가로'], [1023, 900, '태블릿(사이드바 숨김 경계)'],
                                 [768, 1024, '태블릿 세로'], [390, 844, '휴대폰']]) {
      console.log(`\n[3] ${w}×${h} (${label})`);
      const { ctx, page } = await open(browser, w, h);
      let badFit = [], badStick = [];
      for (const k of [...OUTSIDE, INSIDE]) {
        await clickItem(page, k);
        await page.waitForTimeout(900);
        const a = await measure(page);
        if (!a || a.left !== a.colLeft || a.width !== a.colWidth) {
          badFit.push(`${k}(줄 ${a && a.left}/${a && a.width} vs 컬럼 ${a && a.colLeft}/${a && a.colWidth})`);
        }
        await toBottom(page);
        const b = await measure(page);
        if (!stuck(b)) badStick.push(`${k}(${say(b)})`);
      }
      check(`${w}px — 줄의 왼쪽·너비가 본문 컬럼과 같음`, badFit.length === 0, badFit.slice(0, 3).join(' · '));
      check(`${w}px — 맨 아래까지 굴려도 줄이 맨 위에`, badStick.length === 0, badStick.slice(0, 3).join(' · '));
      await ctx.close();
    }

    /* ── ⑤ 가로 넘침 — 줄을 옮기면서 문서를 옆으로 밀지 않았는가 ──────────── */
    console.log('\n[4] 가로 넘침 없음');
    for (const [w, h] of [[390, 844], [768, 1024], [1023, 900], [1500, 900], [1920, 1080]]) {
      const { ctx, page } = await open(browser, w, h);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${w}px — scrollWidth ≤ innerWidth`, over <= 0, `${over}px 넘침`);
      await ctx.close();
    }
  } finally {
    await browser.close().catch(() => {});
    if (server) server.kill();
  }

  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
  if (FAIL) console.log('  ⚠️ 경로 줄이 어떤 상황에서 화면 밖으로 밀려납니다 — 위 FAIL 줄의 top 값을 보세요.');
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('검사가 오류로 멈췄습니다:', e); process.exit(1); });
