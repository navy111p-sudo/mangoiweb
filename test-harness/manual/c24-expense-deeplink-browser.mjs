// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🔗 「카페24 회계 실데이터 ▸ 지출결의」 딥링크 주소 — 진짜 브라우저로 확인
   (2026-08-24 신설)

   [왜] 사장님이 «그 화면 경로 주소» 를 물으셨다. 관리자 화면은 한 페이지(admin.html)라
   화면마다 주소가 따로 없고 **해시 딥링크**(`#칸id`)로 간다. 그런데 이 저장소에는
   «주소는 맞는데 아무 일도 안 일어나는» 함정이 여럿이다 —
     · 카드가 `ia6-hide` 로 감춰져 있어 scrollIntoView 가 통째로 무시됨
     · 감춰진 카드로 가는 점프는 `wireRevealOnJump` 가 사이드바를 대신 눌러 줘야 함
     · 「열렸다」와 「보인다」는 다르다 (CLAUDE.md 2장)
   그래서 주소를 알려 드리기 전에 **실제로 열어서 화면 안에 들어오는지** 좌표로 잰다.

   [2026-08-24 실측 결과 — 읽고 시작할 것]
     · 해시 딥링크(`/admin.html#sub-c24-finance`) 는 카드·칸을 **열어 주지만
       화면을 그 칸으로 데려가지 않는다**(PC top 1285px · 폰 1036px — 둘 다 화면 밖).
       원인: 감춰진 카드로 점프하면 `adm-ia6.js` 의 `wireRevealOnJump` 가 사이드바 항목을
       대신 눌러 주는데, 그 항목의 «3단 스크롤 보정» 이 **카드 맨 위** 로 맞추면서
       해시가 가리키던 칸 위치를 덮어쓴다.
     · 사이드바 손자 메뉴로 가면 **정확히 그 칸이 화면 안에 들어온다.**
   ⏳ 이 차이를 고칠지는 **사람이 결정할 일**이다(사이드바 이동 로직 = 관리자 화면 전체가
      사고 반경). 그래서 아래 딥링크 스크롤은 «FAIL» 이 아니라 **«알려진 한계»** 로 기록만 한다.
      고친 뒤에는 `KNOWN_LIMIT` 를 지우고 진짜 검사(check)로 바꿀 것 — 그것이 고침의 합격 기준이다.

   ⚠️ manual/ 규약상 게이트가 물어 가지 않는다. 사람이 직접 부를 것:
        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
        PW_DIR=/tmp/pw node test-harness/manual/c24-expense-deeplink-browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.C24DL_PORT || 8913);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
/* ⏳ «아직 안 고친 것» 을 기록만 한다 — 실패로 세지 않는다.
      ⛔ 새 항목을 여기에 넣어 검사를 조용히 끄지 말 것. 지금 여기 있는 것은 딥링크 스크롤 하나뿐이고,
         그것이 «고칠지 사람이 정한다» 로 열려 있기 때문이다(머리말 참고). */
let LIMITS = 0;
const knownLimit = (n, stillBroken, measured) => {
  LIMITS++;
  console.log('  ' + (stillBroken ? '⏳ 한계 ' : '🎉 고쳐짐 ') + n + (measured ? ' — ' + measured : ''));
  if (!stillBroken) console.log('       ↑ 고쳐졌습니다. 이 줄을 knownLimit → check 로 바꾸세요.');
};

/* 씨앗 — 배포된 서버가 내려주는 모양 그대로(필터가 이미 걸린 뒤의 응답). */
const SEED = {
  ok: true, source: 'neo4j', kind: 'expenses', count: 2, filtered_out: 7,
  prop_keys: ['content', 'name', 'organ', 'pay_date', 'reg_date', 'sign_users', 'state'],
  rows: [
    { reg_date: '2026-08-13', name: '1ST CUT SALARY JULY 30- AUGUST 12, 2026', organ: null, method: null, content: null, pay_date: '2026-08-13' },
    { reg_date: '2026-07-30', name: '2ND CUT SALARY JULY 14-29, 2026', organ: null, method: null, content: null, pay_date: '2026-07-30' },
  ],
};

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

async function open(browser, width, height, hash) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  // 🪤 «환영 안내»(#aw-overlay)가 html{overflow:hidden} 을 걸어 스크롤 측정을 통째로 망친다.
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 */ }
  });
  await ctx.route('**/api/admin/finance-cafe24/expenses*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEED) }));
  await ctx.route('**/api/**', route => {
    if (/finance-cafe24\/expenses/.test(route.request().url())) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto(BASE + '/admin.html' + (hash || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sub-c24-finance', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(3500);   // ia6 init 재시도(900ms) + 되살리기 + 스크롤 3단 보정
  return { ctx, page };
}

const main = async () => {
  const { chromium, exe } = requireBrowser();          // 준비가 안 됐으면 여기서 «건너뜀» 으로 끝난다
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const srv = await serve();
  try {
    for (const [w, h, label] of [[1440, 900, 'PC'], [390, 844, '휴대폰']]) {
      console.log(`\n[ ${label} ${w}×${h} — /admin.html#sub-c24-finance ]`);
      const { ctx, page } = await open(browser, w, h, '#sub-c24-finance');

      const st = await page.evaluate(() => {
        const sub = document.getElementById('sub-c24-finance');
        const card = document.getElementById('card-accounting-mgmt');
        const r = sub.getBoundingClientRect();
        const cs = getComputedStyle(sub);
        // 「맨 위에 무엇이 있나」 — 열렸다·보인다·눌린다는 다르다(CLAUDE.md 2장)
        const x = Math.round(r.left + Math.min(r.width, 300) / 2);
        const y = Math.round(r.top + 12);
        const top = (y > 0 && y < innerHeight) ? document.elementsFromPoint(x, y).map(e => e.id || e.tagName) : [];
        return {
          subOpen: sub.open, cardOpen: card.open,
          cardHidden: card.classList.contains('ia6-hide'),
          subDisplay: cs.display,
          top: Math.round(r.top), inView: r.top >= -40 && r.top < innerHeight,
          topStack: top.slice(0, 3),
          docOverflowX: document.documentElement.scrollWidth > innerWidth,
        };
      });
      check('카드가 감춰져 있지 않다 (ia6-hide 풀림)', st.cardHidden === false, 'cardHidden=' + st.cardHidden);
      check('회계 카드가 열렸다', st.cardOpen === true);
      check('「카페24 회계 실데이터」 칸이 열렸다', st.subOpen === true);
      knownLimit('딥링크가 그 칸까지 화면을 데려가지 않는다 (열리기만 함)',
        !st.inView, 'top=' + st.top + 'px / 화면높이 ' + h + ' — 카드 맨 위에 서게 된다');
      check('가로로 넘치지 않는다', st.docOverflowX === false);

      // 🧾 탭 — 딥링크는 기본이 「회계장부」다. 「지출결의」는 한 번 눌러야 한다.
      const tabs = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('.c24fin-tab')];
        return bs.map(b => ({ k: b.getAttribute('data-k'), t: b.textContent.trim(), on: b.style.background }));
      });
      check('탭 5종이 있고 「지출결의」가 세 번째다',
        tabs.length === 5 && tabs[2].k === 'expenses', tabs.map(t => t.t).join(' | '));

      await page.evaluate(() => document.querySelector('.c24fin-tab[data-k="expenses"]').click());
      await page.waitForTimeout(1200);
      const tbl = await page.evaluate(() => {
        const head = [...document.querySelectorAll('#c24fin-head th')].map(t => t.textContent.trim());
        const rows = document.querySelectorAll('#c24fin-body tr').length;
        const first = [...document.querySelectorAll('#c24fin-body tr:first-child td')].map(t => t.textContent.trim());
        return { head, rows, first, cnt: (document.getElementById('c24fin-count') || {}).textContent || '' };
      });
      check('지출결의 표 머리가 6칸(일자·제목·거래처·결제·내용·지급일)',
        tbl.head.join(',') === '일자,제목,거래처,결제,내용,지급일', tbl.head.join(','));
      check('영어(필리핀) 결재가 남아 있다',
        tbl.rows === 2 && /SALARY/.test(tbl.first.join(' ')), tbl.first.join(' | '));
      check('제외 건수를 화면이 적어 준다',
        /7건 제외/.test(tbl.cnt), tbl.cnt);

      await ctx.close();
    }

    /* 🔴 사이드바 손자 메뉴로 갔을 때는? — 해시가 «열기만 하고 안 데려다주는» 것과 비교한다.
       사장님께 «어느 길로 가시라» 고 말씀드리려면 두 길을 같은 자로 재야 한다. */
    console.log('\n[ 사이드바 — 「회계」 ▸ 손자 「🧾 카페24 회계 실데이터」 클릭 ]');
    {
      const { ctx, page } = await open(browser, 1440, 900, '');
      const acc = await page.evaluate(() => {
        const b = document.querySelector('#ph85-sidebar [data-ia6-item][data-card="card-accounting-mgmt"]');
        if (!b) return null;
        b.click(); return b.textContent.trim().slice(0, 20);
      });
      check('사이드바에 「회계」 항목이 있다', !!acc, String(acc));
      await page.waitForTimeout(1500);
      // 손자는 자식을 한 번 누르면 펼쳐진다(adm-r25). 그 안에서 이름으로 찾는다.
      const gc = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.ph125-gc .ph125-text, .ph125-gc')];
        const hit = items.find(e => /카페24 회계 실데이터/.test(e.textContent || ''));
        if (!hit) return { found: false, sample: items.slice(0, 6).map(e => e.textContent.trim().slice(0, 24)) };
        (hit.closest('[data-gc-name]') || hit).click();
        return { found: true, label: hit.textContent.trim() };
      });
      check('손자 메뉴 「🧾 카페24 회계 실데이터」 가 보인다', gc.found,
        gc.found ? gc.label : ('보인 것: ' + (gc.sample || []).join(' / ')));
      if (gc.found) {
        await page.waitForTimeout(2500);
        const pos = await page.evaluate(() => {
          const sub = document.getElementById('sub-c24-finance');
          const r = sub.getBoundingClientRect();
          return { open: sub.open, top: Math.round(r.top), h: innerHeight };
        });
        check('사이드바로 가면 그 칸이 화면 안에 들어온다',
          pos.open === true && pos.top >= -40 && pos.top < pos.h, 'top=' + pos.top + 'px / ' + pos.h);
      }
      await ctx.close();
    }

    // 🔴 해시 없이 들어가면? — 주소를 알려 드릴 때 «해시가 필요하다» 는 근거
    console.log('\n[ 대조 — 해시 없이 /admin.html 로만 들어갔을 때 ]');
    const { ctx, page } = await open(browser, 1440, 900, '');
    const plain = await page.evaluate(() => {
      const card = document.getElementById('card-accounting-mgmt');
      return { hidden: card.classList.contains('ia6-hide'), open: card.open };
    });
    check('해시가 없으면 회계 카드는 감춰져 있다 (= 해시가 실제로 일을 한다)',
      plain.hidden === true || plain.open === false,
      'hidden=' + plain.hidden + ' open=' + plain.open);
    await ctx.close();
  } finally {
    await browser.close();
    if (srv) srv.kill();
  }
  console.log(`\n${FAIL ? '⚠ FAIL ' + FAIL + ' / PASS ' + PASS : '✅ 전부 통과 (' + PASS + '건)'}`
    + (LIMITS ? `  ·  ⏳ 알려진 한계 ${LIMITS}건 (딥링크 스크롤 — 고칠지는 사람이 결정, 머리말 참고)` : ''));
  process.exit(FAIL ? 1 : 0);
};
main().catch(e => { console.error(e); process.exit(1); });
