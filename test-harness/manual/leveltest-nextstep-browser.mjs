// -*- coding: utf-8 -*-
// 🎯 레벨테스트 → 수강신청 «다음 걸음» 브라우저 검사 — 2026-08-25 (사람이 직접 부르는 검사)
//
//   왜 필요한가
//     결과 화면(t.html)·학부모 화면(parent.html)에 레벨·추천 교재가 다 나오는데
//     «그래서 뭘 하면 되나» 로 이어지는 길이 없었다. 그 길을 놓는 작업이라
//     확인해야 할 것이 「그 코드가 있는가」가 아니라 **«눌러서 갈 수 있는가»** 다.
//     ⚠️ 문자열 하니스로는 못 본다 — 링크가 그려졌는지, 주소에 값이 실렸는지,
//        로그인 화면으로 튕겼을 때 결과가 살아남는지는 브라우저에서만 보인다.
//
//   ⚠️ 자동으로 돌지 않는다 (manual/ 규약 — 게이트가 *_harness.mjs 만 물어 간다).
//      t.html·parent.html·enroll.html 의 이 부분을 건드리면 사람이 불러야 한다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/leveltest-nextstep-browser.mjs
//
//   ⚠️ file:// 로 열지 않는다 — 절대경로 <script src="/js/…"> 가 전부 404 라
//      「기능이 죽었다」로 오진한다(CLAUDE.md 2장). 로컬 HTTP 서버로 띄운다.
//   ⚠️ 폭만 좁히면 되는 검사에 isMobile 을 켜지 않는다(CLAUDE.md 2장 — 좌표가 어긋난다).
import { spawn } from 'node:child_process';
import { loadPlaywright, findChromium } from './_pw.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', '..', 'cloudflare-deploy', 'public');
const PORT = 8917;

const pw = loadPlaywright();
const exe = findChromium();
if (!pw || !exe) {
  console.log('⏭ playwright-core 또는 Chromium 을 못 찾아 건너뜁니다.');
  console.log('   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core');
  console.log('   PW_DIR=/tmp/pw node test-harness/manual/leveltest-nextstep-browser.mjs');
  process.exit(0);
}

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ── 가짜 서버 응답 ── */
const TICKET_DONE = {
  ok: true,
  ticket: {
    id: 18, name: '홍길동', status: 'done',
    preferred_date: '2026-08-20', preferred_time: '16:00',
    /* ⚠️ 결과는 ticket.result 안이다 — 티켓 맨 위에 두면 render() 가 못 읽는다 */
    result: { final_level: 'A2', recommended_textbook: 'BTS 3',
              ai_score: 72, next_class_guide: '주 2회로 시작하세요' },
  },
};
const TICKET_PENDING = {
  ok: true,
  ticket: { id: 19, name: '김하나', status: 'pending', preferred_date: '2026-09-01', preferred_time: '17:00' },
};
const LT_MY = {
  ok: true,
  items: [
    { id: 3, created_at: 1756100000000, status: 'done', preferred_date: '2026-08-20',
      final_level: 'A2', recommended_textbook: 'BTS 3', ai_score: 72 },
    { id: 2, created_at: 1755000000000, status: 'done', preferred_date: '2026-06-10',
      final_level: 'A1', recommended_textbook: 'BTS 1', ai_score: 55 },
  ],
};

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: PUB, stdio: 'ignore' });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const base = `http://127.0.0.1:${PORT}`;

try {
  await wait(700);
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  /* ══ 1부. 결과 화면(t.html) — 결과가 나오면 신청으로 가는 길이 보이는가 ══ */
  console.log('\n[ 1부. 결과 화면 t.html ]');
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
    await page.route('**/api/leveltest/ticket*', r => r.fulfill({ json: TICKET_DONE }));

    await page.goto(`${base}/t.html?k=demo`, { waitUntil: 'domcontentloaded' });
    await wait(500);

    check('자바스크립트 오류 없이 뜬다', errors.length === 0, errors.slice(0, 2));
    const link = await page.evaluate(() => {
      const a = document.querySelector('a.nextstep');
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { href: a.getAttribute('href'), text: a.textContent, w: Math.round(r.width), h: Math.round(r.height) };
    });
    check('«다음 걸음» 버튼이 그려진다', !!link, link);
    check('신청 화면으로 간다', !!link && link.href.startsWith('/enroll.html?'), link && link.href);
    check('레벨을 주소에 싣는다', !!link && /[?&]lt_level=A2(&|$)/.test(link.href), link && link.href);
    check('«&lt» 문자참조로 깨지지 않는다', !!link && !link.href.includes('<'), link && link.href);
    check('추천 교재도 싣는다', !!link && /[?&]lt_book=BTS(%20|\+)3(&|$)/.test(link.href), link && link.href);
    check('어디서 왔는지 표시한다(from=lt)', !!link && link.href.includes('from=lt'));
    check('레벨·교재가 버튼 글자에도 보인다',
      !!link && link.text.includes('A2') && link.text.includes('BTS 3'), link && link.text);
    check('버튼이 손가락으로 누를 만큼 크다 (44px 이상)', !!link && link.h >= 44, link && link.h);
    check('420px 폭에서 문서가 옆으로 안 밀린다',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

    /* 결과가 아직 없으면 그 버튼은 없어야 한다 — 「신청하세요」가 먼저 뜨면 혼란만 준다 */
    await page.unroute('**/api/leveltest/ticket*');
    await page.route('**/api/leveltest/ticket*', r => r.fulfill({ json: TICKET_PENDING }));
    await page.goto(`${base}/t.html?k=demo2`, { waitUntil: 'domcontentloaded' });
    await wait(400);
    check('결과가 아직 없으면 그 버튼을 안 그린다',
      (await page.locator('a.nextstep').count()) === 0);
    await ctx.close();
  }

  /* ══ 2부. 학부모 화면(parent.html) ══ */
  console.log('\n[ 2부. 학부모 화면 parent.html ]');
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    /* ⚠️ playwright 는 «나중에 등록한» 규칙을 먼저 본다 — 두루뭉술한 것을 먼저 건다 */
    await page.route('**/api/**', r => r.fulfill({ json: { ok: true, items: [], list: [] } }));
    await page.route('**/api/leveltest/my*', r => r.fulfill({ json: LT_MY }));
    await page.addInitScript(() => {
      localStorage.setItem('mangoi_uid', 'stu1');
      localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'stu1', name: '홍길동' }));
      localStorage.setItem('mango_token', 'tok');
      /* 학부모 화면은 자기 키로 자동조회한다 — 이 둘이 있어야 pdLoad→pdLeveltest 까지 간다 */
      localStorage.setItem('mangoi_parent_uid', 'stu1');
      localStorage.setItem('mangoi_parent_token', 'tok');
    });
    await page.goto(`${base}/parent.html`, { waitUntil: 'domcontentloaded' });
    await wait(900);

    const p = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a[href^="/enroll.html?"]'))
        .filter(x => x.getAttribute('href').includes('lt_level='))[0];
      return a ? { href: a.getAttribute('href'), text: a.textContent } : null;
    });
    check('학부모 화면에도 «이 결과로 신청» 이 뜬다', !!p, p);
    check('가장 최근 결과(A2)를 쓴다 — 옛 A1 이 아니다',
      !!p && /lt_level=A2(&|$)/.test(p.href), p && p.href);
    check('추천 교재도 함께 넘긴다', !!p && p.href.includes('lt_book='), p && p.href);
    await ctx.close();
  }

  /* ══ 3부. 신청 화면(enroll.html) — 받은 값을 되짚어 주는가 ══ */
  console.log('\n[ 3부. 신청 화면 enroll.html — 로그인된 사람 ]');
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
    await page.route('**/api/**', r => r.fulfill({ json: { ok: true, teachers: [], items: [] } }));
    await page.addInitScript(() => {
      localStorage.setItem('mangoi_uid', 'stu1');
      localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'stu1', name: '홍길동' }));
      localStorage.setItem('mango_token', 'tok');
    });
    await page.goto(`${base}/enroll.html?from=lt&lt_level=A2&lt_book=${encodeURIComponent('BTS 3')}`,
      { waitUntil: 'domcontentloaded' });
    await wait(700);

    check('자바스크립트 오류 없이 뜬다', errors.length === 0, errors.slice(0, 2));
    const box = await page.evaluate(() => {
      const b = document.getElementById('stLtResult');
      if (!b) return null;
      const cs = getComputedStyle(b);
      return {
        shown: cs.display !== 'none',
        level: (document.getElementById('ltResLevel') || {}).textContent,
        bookRow: getComputedStyle(document.getElementById('ltResBookRow')).display !== 'none',
        book: (document.getElementById('ltResBook') || {}).textContent,
        top: Math.round(b.getBoundingClientRect().top),
      };
    });
    check('결과 상자가 열린다', !!box && box.shown, box);
    check('레벨을 그대로 되짚어 준다', !!box && box.level === 'A2', box && box.level);
    check('추천 교재 줄이 열린다', !!box && box.bookRow && box.book === 'BTS 3', box);
    check('첫 화면 안에 보인다 (스크롤 안 해도 됨)', !!box && box.top < 900, box && box.top);

    /* 글자가 읽히는가 — «무슨 색인가» 가 아니라 «대비» 를 잰다 (CLAUDE.md 2장) */
    const contrast = (box && box.shown) ? await page.evaluate(() => {
      const lum = (c) => {
        const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
      const bgOf = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (c.length >= 3 && (c[3] === undefined || c[3] > 0.6)) return c.slice(0, 3);
          n = n.parentElement;
        }
        return [0, 0, 0];
      };
      const ratio = (el) => {
        const fg = parse(getComputedStyle(el).color).slice(0, 3), bg = bgOf(el);
        const a = lum(fg), b = lum(bg);
        return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
      };
      const box = document.getElementById('stLtResult');
      return {
        h2: ratio(box.querySelector('h2')),
        level: ratio(document.getElementById('ltResLevel')),
        note: ratio(box.querySelector('.note')),
      };
    }) : { h2: 0, level: 0, note: 0 };
    check('제목이 읽힌다 (큰 글자 3:1 이상)', contrast.h2 >= 3, contrast);
    check('레벨 값이 읽힌다 (3:1 이상)', contrast.level >= 3, contrast);
    check('안내문이 읽힌다 (본문 4.5:1 이상)', contrast.note >= 4.5, contrast);

    await ctx.close();

    /* 값이 없으면 없던 화면 그대로여야 한다.
       ⚠️ 반드시 «새 문맥» 에서 잰다 — 같은 탭은 sessionStorage 에 방금 담아 둔 값이 살아 있어
          «기억하기» 가 정상 동작한 결과를 «안 지워졌다» 는 실패로 오독하게 된다. */
    const ctxN = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const pageN = await ctxN.newPage();
    await pageN.route('**/api/**', r => r.fulfill({ json: { ok: true, teachers: [], items: [] } }));
    await pageN.addInitScript(() => {
      localStorage.setItem('mangoi_uid', 'stu1');
      localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'stu1', name: '홍길동' }));
      localStorage.setItem('mango_token', 'tok');
    });
    await pageN.goto(`${base}/enroll.html`, { waitUntil: 'domcontentloaded' });
    await wait(600);
    check('레벨을 안 들고 오면 그 상자를 안 그린다',
      await pageN.evaluate(() => getComputedStyle(document.getElementById('stLtResult')).display === 'none'));
    await ctxN.close();
  }

  /* ══ 4부. 계정이 없는 체험 학생 — 로그인 왕복에서 결과가 살아남는가 ══ */
  console.log('\n[ 4부. 로그인 안 된 사람 — 결과를 잃지 않는가 ]');
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/api/**', r => r.fulfill({ json: { ok: false, error: 'auth_required' } }));
    await page.goto(`${base}/enroll.html?from=lt&lt_level=A2&lt_book=${encodeURIComponent('BTS 3')}`,
      { waitUntil: 'domcontentloaded' });
    await wait(700);

    const st = await page.evaluate(() => ({
      locked: !!document.querySelector('.login-need'),
      text: (document.querySelector('.login-need') || {}).textContent || '',
      saved: sessionStorage.getItem('mangoi_enroll_lt'),
    }));
    check('로그인 화면으로 잠긴다 (원래 동작 그대로)', st.locked);
    check('그래도 «기억해 뒀다» 고 말해 준다', st.text.includes('기억해'), st.text.slice(0, 80));
    check('레벨을 그 안내문에 적어 준다', st.text.includes('A2') && st.text.includes('BTS 3'), st.text.slice(0, 120));
    check('sessionStorage 에 담아 둔다',
      !!st.saved && JSON.parse(st.saved).level === 'A2', st.saved);

    /* 홈에서 로그인하고 «주소 없이» 돌아온 경우 — 결과가 되살아나야 한다 */
    await page.goto(`${base}/enroll.html`, { waitUntil: 'domcontentloaded' });
    await wait(600);
    check('주소 없이 돌아와도 안내문이 그대로 있다',
      await page.evaluate(() => ((document.querySelector('.login-need') || {}).textContent || '').includes('A2')));

    /* 이제 로그인이 된 상태로 «주소 없이» 열면 결과 상자가 열려야 한다 */
    await page.unroute('**/api/**');
    await page.route('**/api/**', r => r.fulfill({ json: { ok: true, teachers: [], items: [] } }));
    await page.evaluate(() => {
      localStorage.setItem('mangoi_uid', 'stu1');
      localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'stu1', name: '홍길동' }));
      localStorage.setItem('mango_token', 'tok');
    });
    await page.goto(`${base}/enroll.html`, { waitUntil: 'domcontentloaded' });
    await wait(700);
    const back = await page.evaluate(() => ({
      shown: getComputedStyle(document.getElementById('stLtResult')).display !== 'none',
      level: (document.getElementById('ltResLevel') || {}).textContent,
      book: (document.getElementById('ltResBook') || {}).textContent,
    }));
    check('로그인하고 돌아오면 결과가 그대로 이어진다', back.shown && back.level === 'A2', back);
    check('추천 교재까지 이어진다', back.book === 'BTS 3', back);

    /* 다른 탭(=다른 sessionStorage)에는 안 남아야 한다 — 남의 레벨이 뜨면 안 된다 */
    const ctx2 = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page2 = await ctx2.newPage();
    await page2.route('**/api/**', r => r.fulfill({ json: { ok: true, teachers: [], items: [] } }));
    await page2.addInitScript(() => {
      localStorage.setItem('mangoi_uid', 'stu2');
      localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'stu2', name: '김하나' }));
      localStorage.setItem('mango_token', 'tok');
    });
    await page2.goto(`${base}/enroll.html`, { waitUntil: 'domcontentloaded' });
    await wait(600);
    check('다른 브라우저 문맥에는 안 새어 나간다',
      await page2.evaluate(() => getComputedStyle(document.getElementById('stLtResult')).display === 'none'));
    await ctx2.close();
    await ctx.close();
  }

  await browser.close();
} finally {
  srv.kill();
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
