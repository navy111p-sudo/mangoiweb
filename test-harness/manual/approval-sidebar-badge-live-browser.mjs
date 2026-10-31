// -*- coding: utf-8 -*-
/*
 * 🧾 사이드바 「결재함」 실시간 배지 + 지연 색 — 실제 브라우저로 본다 (2026-09-09 A+B)
 *
 *   서버:  cd cloudflare-deploy/public && python3 -m http.server 8899
 *   실행:  PW_DIR=/tmp/pw node test-harness/manual/approval-sidebar-badge-live-browser.mjs
 *
 * [왜 브라우저인가]
 *   자동 하니스(approval_sidebar_badge_live_harness)는 배지 JS 를 가짜 DOM 에서 돌린다. 그것으로
 *   «무엇을 그리는가» 는 확인되지만 «실제로 빨갛게 보이는가 · EN 을 눌러도 배지가 남는가 · 한 줄인가»
 *   는 진짜 CSS 캐스케이드와 진짜 i18n 엔진(adm-core.js toggleAdminLang)이 있어야 잰다.
 *   특히 ③번 함정(<a> 의 data-ko 가 배지를 지움)은 그 엔진을 실제로 돌려야만 드러난다.
 *
 * [검사]
 *   ① 지연 1건 → .late · 테두리색 #b42318 · 부제 「· 지연 1 · N일째」 · 부제가 화면에 보인다
 *   ② EN 토글 → 라벨 Approvals · 배지 3 그대로(요소가 지워지지 않음) · 부제 「· late 1 · N days」 → KO 로 되돌림
 *   ③ 포커스로 다시 물어 4건이 되면 배지 4 + .fresh 가 잠깐 붙고 1.6초 뒤 걷힌다 · transform 은 없다(색만)
 *   ④ 지연 0 → .late 없음 · 부제 비어 있고 자리를 차지하지 않는다
 *   ⑤ 결재함 줄은 한 줄(라벨·부제·배지가 같은 줄)이고 무엇에도 가려지지 않는다
 *   ⑥ 배지 JS 가 defer 파일(/js/adm-appr-badge.js)에서 실려 왔다(인라인 사본 0)
 *
 * 서버 API 는 가짜 — fetch 를 바꿔 끼운다(운영 DB 를 건드리지 않는다). 페이로드는 window.__apprInbox 를
 * 호출 «시점» 에 읽으므로 검사 도중 바꿀 수 있다.
 */
import { requireBrowser } from './_pw.mjs';

const BASE = process.env.WORK_BASE || 'http://127.0.0.1:8899';
const { chromium, exe } = requireBrowser();

let PASS = 0, FAIL = 0;
const check = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const DAY = 86400000;
const now = Date.now();
const late3 = [
  { id: 1, stage_due_at: now + DAY, created_at: now - DAY },
  { id: 2, stage_due_at: now + DAY, created_at: now - 2 * DAY },
  { id: 3, stage_due_at: now - 3600000, created_at: now - 3 * DAY },   // 지연 1건 · 3일째
];
const ok4 = [
  { id: 1, stage_due_at: now + DAY, created_at: now - DAY },
  { id: 2, stage_due_at: now + DAY, created_at: now - DAY },
  { id: 3, stage_due_at: now + DAY, created_at: now - DAY },
  { id: 4, stage_due_at: now + DAY, created_at: now },
];

(async () => {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  const page = await ctx.newPage();
  await page.addInitScript((inbox) => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch {}
    window.__apprInbox = inbox;
    const rf = window.fetch;
    window.fetch = function (u, o) {
      u = String(u);
      if (u.indexOf('/api/approval/home') === 0) {
        const inbox = window.__apprInbox || [];
        window.__apprFetches = (window.__apprFetches || 0) + 1;
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, me: { username: 'admin', name: '정우영', is_exec: true }, can_approve: true,
          pending: inbox.length, inbox, mine: [], reuse: [], urgent: [], colleagues: [], types: [],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (u.indexOf('/api/') === 0) return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      return rf(u, o);
    };
  }, late3);
  await page.goto(BASE + '/admin.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6500);   // 첫 조회는 3초 뒤 + 외부 js 가 사이드바를 그릴 시간
  await page.evaluate(() => { const o = document.getElementById('aw-overlay'); if (o) o.remove(); });

  const probe = () => page.evaluate(() => {
    const row = document.getElementById('ia6-appr');
    if (!row) return { row: false };
    const n = document.getElementById('ia6-appr-n');
    const sub = document.getElementById('ia6-appr-sub');
    const lbl = row.querySelector('.ia6-appr-l');
    const cs = getComputedStyle(row);
    row.scrollIntoView({ block: 'center' });
    const r = row.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const lr = lbl ? lbl.getBoundingClientRect() : null;
    const sr = sub && sub.offsetParent ? sub.getBoundingClientRect() : null;
    const nr = n && n.offsetParent ? n.getBoundingClientRect() : null;
    return {
      row: true, on: row.classList.contains('on'), late: row.classList.contains('late'), fresh: row.classList.contains('fresh'),
      border: cs.borderTopColor, color: cs.color, transform: cs.transform, outline: cs.outlineStyle + ' ' + cs.outlineColor,
      n: n ? n.textContent : null, nExists: !!n, nShown: !!nr,
      sub: sub ? sub.textContent : null, subShown: !!sr, subDisplay: sub ? getComputedStyle(sub).display : null,
      label: lbl ? lbl.textContent : null,
      covered: !(top === row || row.contains(top)), by: top ? (top.id || top.className || top.tagName) : '(화면 밖)',
      h: Math.round(r.height),
      // 한 줄 판정은 «텍스트 상자가 넘치지 않았나» 로 — 줄 높이 숫자는 zoom 1.3·padding 이 섞여 근거가 못 된다
      tWrap: (() => { const t = row.querySelector('.ia6-appr-t'); return t ? (t.scrollHeight > t.clientHeight + 2) : null; })(),
      oneLine: [lr, sr, nr].filter(Boolean).every((b) => Math.abs((b.top + b.height / 2) - (r.top + r.height / 2)) < r.height / 2),
      fetches: window.__apprFetches || 0,
      lang: window.adminLang,
      inlineCopies: [...document.scripts].filter((s) => !s.src && /paintSidebar\(s\)/.test(s.textContent)).length,
      deferSrc: [...document.scripts].some((s) => /\/js\/adm-appr-badge\.js\?v=\d+/.test(s.src) && s.defer),
    };
  });

  console.log('\n[⑥ 배지 JS 는 defer 파일에서 왔다]');
  let r = await probe();
  check('사이드바 결재함 줄이 있다', r.row);
  check('/js/adm-appr-badge.js?v=N 이 defer 로 실렸다', r.deferSrc);
  check('admin.html 인라인 사본 0 (두 벌이면 조회가 두 번 나간다)', r.inlineCopies === 0, String(r.inlineCopies));
  check('첫 조회가 나갔다(3초 뒤 1회)', r.fetches >= 1, String(r.fetches));

  console.log('\n[① B 지연 1건 — 빨갛게 보이는가]');
  check('배지 3', r.n === '3', String(r.n));
  check('.on (켜짐)', r.on === true);
  check('.late 가 붙었다', r.late === true);
  check('테두리가 빨강 #b42318 = rgb(180, 35, 24)', r.border === 'rgb(180, 35, 24)', r.border);
  check('부제 「· 지연 1 · 3일째」', r.sub === '· 지연 1 · 3일째', String(r.sub));
  check('부제가 화면에 보인다(display 가 none 이 아님)', r.subShown && r.subDisplay !== 'none', r.subDisplay);
  check('첫 조회에는 .fresh 가 없다(도착이 아니다)', r.fresh === false);

  console.log('\n[⑤ 한 줄 · 가려지지 않음]');
  check('라벨·부제·배지가 같은 줄에 있다', r.oneLine);
  check('라벨+부제 상자가 두 줄로 접히지 않았다(scrollHeight ≤ clientHeight)', r.tWrap === false, 'h=' + r.h);
  check('무엇에도 가려지지 않는다', !r.covered, r.by);

  console.log('\n[② EN 토글 — i18n 이 배지를 지우지 않는가 (③번 함정)]');
  const canToggle = await page.evaluate(() => typeof window.toggleAdminLang === 'function');
  check('toggleAdminLang 이 있다(adm-core.js)', canToggle);
  if (canToggle) {
    await page.evaluate(() => { if (window.adminLang !== 'en') window.toggleAdminLang(); });
    await page.waitForTimeout(600);
    r = await probe();
    check('EN 이 켜졌다', r.lang === 'en', String(r.lang));
    check('라벨이 Approvals', r.label === 'Approvals', String(r.label));
    check('⛔ 배지 요소가 지워지지 않았다(#ia6-appr-n 존재)', r.nExists);
    check('배지 숫자 3 그대로', r.n === '3', String(r.n));
    await page.waitForTimeout(4200);   // paintSidebar 4초 주기가 부제 언어를 다시 그린다
    r = await probe();
    check('부제 「· late 1 · 3 days」', r.sub === '· late 1 · 3 days', String(r.sub));
    check('.late 도 그대로', r.late === true);
    await page.evaluate(() => { if (window.adminLang === 'en') window.toggleAdminLang(); });
    await page.waitForTimeout(600);
    r = await probe();
    check('KO 로 되돌리면 라벨 결재함 · 배지 3', r.label === '결재함' && r.n === '3', r.label + '/' + r.n);
  }

  console.log('\n[③ A 새 결재 도착 — 포커스로 다시 물어 4건]');
  await page.waitForTimeout(5200);   // 5초 throttle 이 풀리게
  const before = r.fetches;
  await page.evaluate((inbox) => { window.__apprInbox = inbox; window.dispatchEvent(new Event('focus')); }, ok4);
  await page.waitForTimeout(250);
  r = await probe();
  check('포커스에 다시 물었다', r.fetches > before, before + '→' + r.fetches);
  check('배지 4 로 바뀌었다', r.n === '4', String(r.n));
  check('늘어난 순간 .fresh 가 붙었다', r.fresh === true);
  check('.fresh 는 outline(색)만 — transform 없음', r.transform === 'none', r.transform);
  check('outline 이 그려진다(solid)', /solid/.test(r.outline), r.outline);
  await page.waitForTimeout(1600);
  r = await probe();
  check('1.6초 뒤 .fresh 가 걷혔다', r.fresh === false);

  console.log('\n[④ 지연 0 — 색·부제가 걷히는가]');
  check('지연이 없으니 .late 가 없다', r.late === false);
  check('부제가 비었다', r.sub === '', JSON.stringify(r.sub));
  check('빈 부제는 자리를 차지하지 않는다(:empty → display none)', r.subDisplay === 'none', r.subDisplay);
  check('테두리는 지연색이 아니다', r.border !== 'rgb(180, 35, 24)', r.border);
  check('여전히 .on · 배지 4', r.on === true && r.n === '4');

  await browser.close();
  console.log('\n──────────────────────────────────────');
  console.log(FAIL ? ('  ' + FAIL + '건 실패 / ' + (PASS + FAIL) + '건') : ('  전부 통과 (' + PASS + '건)'));
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
