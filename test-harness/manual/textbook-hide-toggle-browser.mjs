// -*- coding: utf-8 -*-
// 🙈 관리자 교재 표의 «숨김» 토글 — 브라우저 검사 (2026-09-07)
//
//   왜 브라우저인가 —
//     문자열 하니스는 「그 코드가 있는가」까지만 본다. 여기서 걸리는 사고는 전부
//     «몇 px 이고 무슨 색이고 실제로 눌리는가» 뿐이라 코드만 봐서는 안 보인다:
//       · 전역 룰 `details.menu-card button{background:인디고!important; padding:9px 18px!important}`
//         이 표 안 작은 버튼을 «큰 파란 알약» 으로 뭉개 옆 칸을 밀어내는가 (CLAUDE.md 2장)
//       · 글자색 페인터 셋(adm-s12/s13/light-surfaces)이 초록·빨강을 덮어
//         «보임/숨김» 이 화면에서 구분되지 않는가 (인라인 !important 라 CSS 로는 못 이긴다)
//       · thead 칸 수 = 한 줄 td 수 = colspan 이 서로 맞는가 (하나만 어긋나면 표가 밀린다)
//       · 「보인다」와 「눌린다」는 다르다 → elementFromPoint 로 맨 위를 잰다
//       · 눌렀을 때 **서버로 요청이 실제로 나가는가**(시연 껍데기가 아닌가)
//       · 저장이 실패하면 화면을 안 바꾸는가 («된 것처럼» 보이면 안 된다)
//       · 권한이 없으면(403) 조용히 «보임» 이라 말하지 않고 «—» 로 두는가
//
//   [변이시험 — 2026-09-07 실제로 돌려 본 것]
//     ① admin-inline-c.css 의 #textbooks-table 블록 제거 → ❌ 5건
//        (실측: 24x39px 파란 그라데이션 알약 + 두 상태 색이 rgba(0,0,0,0)/흰색으로 «똑같아짐»)
//     ② 파일 없는 행에도 버튼 만들기            → ❌ 2건
//     ③ 저장 실패인데 화면을 바꾸기              → ❌ 1건
//     ⚠️ 반대로 «글자색 페인터 셋 등재 제거» 는 FAIL 이 안 납니다 — 지금 팔레트에서는
//        그 셋이 이 버튼을 원래 안 건드리기 때문입니다(밝은 바탕·어두운 글자·대비 6.9). 즉 이 검사는
//        그 등재를 지켜 주지 못합니다. 색을 어둡게 바꾸는 날에는 사람이 세 곳을 함께 봐야 합니다.
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/textbook-hide-toggle-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8937;                       // 다른 검사와 겹치지 않게 (서비스워커 캐시 회피)
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

/* 씨앗 — 운영에서 실제로 보이는 모양 그대로.
   ① D1 교재(파일 묶음과 이름이 같다) ② D1 교재(파일 없음 = 숨길 대상 없음)
   ③ 서버 파일 묶음만 있는 것 ④ 처음부터 숨겨져 있는 것 */
const SRV_ITEMS = [
  { id: 1, title: 'BTS 1 001 (Welcome to school)', level: 'Lv 1', units: 5, publisher: 'Mangoi', isbn: '' },
  { id: 2, title: '수동등록 교재(파일없음)',        level: '',     units: 3, publisher: 'Mangoi', isbn: '' },
];
const FILE_GROUPS = [
  { book: 'BTS 1 001 (Welcome to school)', files: 24, level: 'Lv 1' },
  { book: 'BTS 1 002 (Welcome to school)', files: 18, level: 'Lv 1' },
  { book: '다락원',                        files: 72, level: 'Lv 3' },
];
const HIDDEN_AT_START = new Set(['다락원']);

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

/** @param {{hideStatus?: number}} opt  hideStatus 403 이면 «권한 없음» 상황을 만든다 */
async function open(browser, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  /* 🪤 빈 브라우저는 «첫 방문자» 라 환영 안내(#aw-overlay)가 html{overflow:hidden} 을 걸고
        사람이 닫아야 푼다 — 그대로 두면 멀쩡한 화면도 실패로 나온다(CLAUDE.md 2장). */
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 */ }
  });

  /* 🪤 포괄 스텁을 «먼저» 깔고 구체적인 것을 뒤에 — route 는 나중에 등록한 것이 이긴다. */
  await ctx.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));

  await ctx.route('**/api/admin/textbooks**', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, items: SRV_ITEMS }) }));

  await ctx.route('**/api/admin/textbook-files?**', route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, groups: FILE_GROUPS }) }));

  /* 🪤 «무엇을 숨기든 같은 목록» 을 돌려주면 검사가 조용히 헛돈다 —
        POST 를 실제로 반영하는 «상태 있는» 스텁으로 둔다. */
  const hidden = new Set(HIDDEN_AT_START);
  const posts = [];
  ctx.__posts = posts;
  ctx.__hidden = hidden;
  await ctx.route('**/api/admin/textbook-hidden-books', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch { /* 무시 */ }
      posts.push(b);
      if (ctx.__failPost) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"boom"}' });
      if (b.hidden === false) hidden.delete(String(b.book)); else hidden.add(String(b.book));
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, book: b.book, hidden: b.hidden !== false }) });
    }
    if (opt.hideStatus === 403) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"forbidden"}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true,
        books: FILE_GROUPS.map(g => ({ book: g.book, files: g.files, hidden: hidden.has(g.book) })),
        hidden_count: hidden.size }) });
  });

  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#textbooks-table', { state: 'attached', timeout: 30000 });
  /* 🪤 IA6 는 카드를 «한 번에 한 장» 만 보여 준다(.ia6-hide = display:none) —
        열지 않으면 글자는 읽히는데 «보인다·눌린다» 만 조용히 헛돈다(CLAUDE.md 2장). */
  await page.evaluate(() => {
    try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-textbooks'); } catch (e) {}
    let el = document.getElementById('textbooks-table');
    while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => { if (typeof window.loadTextbooks === 'function') window.loadTextbooks(); });
  await page.waitForFunction(() => document.querySelectorAll('#textbooks-table tr').length >= 3, { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page, posts, hidden };
}

/** WCAG 대비 — 반투명·그라데이션 층을 아래에서 위로 합성해 «실제로 깔린 색» 을 찾는다.
 *  (첫 조상 색에서 멈추면 얇은 층을 배경으로 읽어 멀쩡한 글자가 실패로 나온다 — CLAUDE.md 2장) */
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
    if ((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') {
      const g = String(cs.backgroundImage).match(/rgba?\([^)]+\)/);
      if (g) c = parse(g[0]);
    }
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    n = n.parentElement;
  }
  if (!layers.length || layers[layers.length - 1].a < 1) layers.push({ r: 255, g: 255, b: 255, a: 1 });
  let bg = layers[layers.length - 1];
  for (let i = layers.length - 2; i >= 0; i--) {
    const t = layers[i];
    bg = { r: t.r * t.a + bg.r * (1 - t.a), g: t.g * t.a + bg.g * (1 - t.a), b: t.b * t.a + bg.b * (1 - t.a), a: 1 };
  }
  const fg0 = parse(getComputedStyle(el).color) || { r: 0, g: 0, b: 0, a: 1 };
  const fg = { r: fg0.r * fg0.a + bg.r * (1 - fg0.a), g: fg0.g * fg0.a + bg.g * (1 - fg0.a), b: fg0.b * fg0.a + bg.b * (1 - fg0.a) };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const L1 = lum(fg), L2 = lum(bg);
  return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
}

(async () => {
  console.log('════════ 🙈 관리자 교재 표 «숨김» 토글 — 브라우저 검사 ════════');
  const { chromium, exe } = requireBrowser();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  try {
    // ── ① 표 뼈대: thead 칸 수 = 한 줄 td 수 = colspan ────────────────
    {
      const { ctx, page } = await open(browser);
      const shape = await page.evaluate(() => {
        const tb = document.getElementById('textbooks-table');
        const thead = tb.closest('table').querySelector('thead tr');
        const first = tb.querySelector('tr');
        return {
          th: thead ? thead.querySelectorAll('th').length : -1,
          td: first ? first.querySelectorAll('td').length : -1,
          lastTh: thead ? (thead.lastElementChild.textContent || '').trim() : '',
          rows: tb.querySelectorAll('tr').length,
        };
      });
      check('① thead 칸 수와 한 줄 td 수가 같다 (' + shape.th + ' = ' + shape.td + ')', shape.th === shape.td && shape.th === 7,
        JSON.stringify(shape));
      check('① 마지막 칸 이름이 「숨김」이다', shape.lastTh === '숨김', shape.lastTh);
      check('① 씨앗 4묶음이 모두 그려졌다', shape.rows === 4, '행 ' + shape.rows);
      await ctx.close();
    }

    // ── ② 버튼이 «작은 알약» 인가 (전역 인디고 룰에 안 먹혔나) ─────────
    {
      const { ctx, page } = await open(browser);
      const m = await page.evaluate(() => {
        const b = document.querySelector('#textbooks-table button.tb-hide-toggle');
        if (!b) return null;
        const cs = getComputedStyle(b), r = b.getBoundingClientRect();
        /* 🪤 PC 관리자 화면은 `body{zoom:1.3}` 이라 getBoundingClientRect 값에 1.3 이 곱해져 있다 —
              그대로 px 상수와 비교하면 멀쩡한 버튼이 «큰 알약» 으로 나온다(CLAUDE.md 2장).
              CSS 픽셀로 되돌려서 잰다. */
        const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
        return { w: Math.round(r.width / zoom), h: Math.round(r.height / zoom), zoom, pad: cs.padding,
                 bg: cs.backgroundColor, bgImg: cs.backgroundImage, color: cs.color, box: cs.boxSizing };
      });
      check('② 숨김 버튼이 실제로 그려졌다', !!m, String(m));
      if (m) {
        check('② 큰 파란 알약이 아니다 (CSS 높이 ≤ 30px)', m.h <= 30, m.h + 'px (zoom ' + m.zoom + ') · padding ' + m.pad);
        check('② 폭이 옆 칸을 밀 만큼 부풀지 않았다 (CSS ≤ 110px)', m.w <= 110, m.w + 'px');
        /* 전역 룰이 이겼는지는 «높이» 보다 padding 이 더 곧은 증거다 — 그 룰은 9px 18px 를 박는다. */
        check('② 전역 룰의 padding(9px 18px)이 안 이겼다', m.pad === '3px 10px', m.pad);
        check('② 인디고 그라데이션이 안 덮였다', m.bgImg === 'none', m.bgImg);
        check('② box-sizing 이 border-box 다', m.box === 'border-box', m.box);
      }
      await ctx.close();
    }

    // ── ③ 색이 «구분 정보» 로 살아 있는가 (페인터 셋이 안 덮었나) ──────
    {
      const { ctx, page } = await open(browser);
      const colors = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll('#textbooks-table button.tb-hide-toggle').forEach(b => {
          const cs = getComputedStyle(b);
          out[b.getAttribute('data-book')] = {
            hiddenCls: b.classList.contains('tb-hide-on'),
            bg: cs.backgroundColor, color: cs.color,
            inline: b.style.getPropertyPriority('color'),   // 페인터가 인라인 !important 를 썼나
            text: (b.textContent || '').trim(),
          };
        });
        return out;
      });
      const shown = colors['BTS 1 001 (Welcome to school)'];
      const hid = colors['다락원'];
      check('③ 보이는 교재는 「👁 보임」', !!shown && shown.text.indexOf('보임') >= 0, shown && shown.text);
      check('③ 숨긴 교재는 「🙈 숨김」', !!hid && hid.text.indexOf('숨김') >= 0, hid && hid.text);
      check('③ 두 상태의 배경색이 서로 다르다', !!shown && !!hid && shown.bg !== hid.bg,
        (shown && shown.bg) + ' vs ' + (hid && hid.bg));
      check('③ 두 상태의 글자색이 서로 다르다', !!shown && !!hid && shown.color !== hid.color,
        (shown && shown.color) + ' vs ' + (hid && hid.color));
      check('③ 글자색 페인터가 인라인 !important 로 덮지 않았다',
        !!shown && shown.inline !== 'important' && !!hid && hid.inline !== 'important',
        '보임=' + (shown && shown.inline) + ' 숨김=' + (hid && hid.inline));
      const ratio = await page.evaluate(`(${contrastOf.toString()})(document.querySelector('#textbooks-table button.tb-hide-toggle'))`);
      check('③ 글자가 실제로 읽힌다 (대비 ≥ 4.5)', ratio >= 4.5, ratio + ':1');
      await ctx.close();
    }

    // ── ④ 「보인다」와 「눌린다」는 다르다 ────────────────────────────
    {
      const { ctx, page } = await open(browser);
      const top = await page.evaluate(() => {
        const b = document.querySelector('#textbooks-table button.tb-hide-toggle');
        b.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { same: !!el && (el === b || b.contains(el)), tag: el ? (el.tagName + '.' + el.className) : '없음',
                 vis: r.width > 0 && r.height > 0 };
      });
      check('④ 버튼 한가운데의 «맨 위» 가 그 버튼이다', top.same && top.vis, top.tag);
      await ctx.close();
    }

    // ── ⑤ 눌렀을 때 «서버로 요청이 실제로 나가는가» + 화면이 따라오는가 ─
    {
      const { ctx, page, posts, hidden } = await open(browser);
      await page.evaluate(() => {
        const b = document.querySelector('#textbooks-table button.tb-hide-toggle[data-book="BTS 1 001 (Welcome to school)"]');
        b.click();
      });
      await page.waitForTimeout(700);
      check('⑤ POST 가 서버로 실제로 나갔다 (시연 껍데기가 아니다)', posts.length === 1, JSON.stringify(posts));
      check('⑤ 보낸 내용이 { book, hidden:true } 다',
        posts.length === 1 && posts[0].book === 'BTS 1 001 (Welcome to school)' && posts[0].hidden === true,
        JSON.stringify(posts[0]));
      const after = await page.evaluate(() => {
        const b = document.querySelector('#textbooks-table button.tb-hide-toggle[data-book="BTS 1 001 (Welcome to school)"]');
        return { text: (b.textContent || '').trim(), on: b.classList.contains('tb-hide-on'),
                 note: (document.getElementById('tb-hide-count').textContent || '').trim() };
      });
      check('⑤ 누른 뒤 그 칸이 「숨김」으로 바뀐다', after.on && after.text.indexOf('숨김') >= 0, after.text);
      check('⑤ 개수 줄이 «숨김 2개» 로 따라온다', /숨김 2개/.test(after.note), after.note);

      // 되살리기 — 한 번 더 누르면 되돌아온다(되돌릴 길이 화면에 있다)
      await page.evaluate(() => {
        document.querySelector('#textbooks-table button.tb-hide-toggle[data-book="BTS 1 001 (Welcome to school)"]').click();
      });
      await page.waitForTimeout(700);
      const back = await page.evaluate(() => {
        const b = document.querySelector('#textbooks-table button.tb-hide-toggle[data-book="BTS 1 001 (Welcome to school)"]');
        return { text: (b.textContent || '').trim(), on: b.classList.contains('tb-hide-on') };
      });
      check('⑤ 다시 누르면 「보임」으로 되돌아온다', !back.on && back.text.indexOf('보임') >= 0, back.text);
      check('⑤ 되살리기 POST 는 hidden:false 다', posts.length === 2 && posts[1].hidden === false, JSON.stringify(posts[1]));
      check('⑤ 서버 쪽 상태도 실제로 되돌아왔다', !hidden.has('BTS 1 001 (Welcome to school)'), [...hidden].join(','));
      await ctx.close();
    }

    // ── ⑥ 저장이 실패하면 «된 것처럼» 보이지 않는다 ────────────────────
    {
      const { ctx, page } = await open(browser);
      ctx.__failPost = true;
      page.on('dialog', d => d.dismiss().catch(() => {}));
      await page.evaluate(() => {
        document.querySelector('#textbooks-table button.tb-hide-toggle[data-book="다락원"]').click();
      });
      await page.waitForTimeout(900);
      const st = await page.evaluate(() => {
        const b = document.querySelector('#textbooks-table button.tb-hide-toggle[data-book="다락원"]');
        return { text: (b.textContent || '').trim(), on: b.classList.contains('tb-hide-on'), dis: b.disabled };
      });
      check('⑥ 저장 실패 시 칸이 안 바뀐다 (숨김 그대로)', st.on && st.text.indexOf('숨김') >= 0, st.text);
      check('⑥ 실패 뒤 버튼이 다시 눌린다 (disabled 로 굳지 않는다)', st.dis === false, 'disabled=' + st.dis);
      await ctx.close();
    }

    // ── ⑦ 숨길 대상이 없는 행 / 권한이 없을 때 «모른다» 고 말하는가 ────
    {
      const { ctx, page } = await open(browser);
      const dash = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#textbooks-table tr')];
        const r = rows.find(tr => (tr.children[1] || {}).textContent && tr.children[1].textContent.indexOf('수동등록 교재') >= 0);
        if (!r) return null;
        const c = r.lastElementChild;
        return { txt: (c.textContent || '').trim(), tip: c.getAttribute('title') || '', btn: !!c.querySelector('button') };
      });
      check('⑦ 파일이 없는 교재에는 버튼을 안 만든다', !!dash && dash.btn === false && dash.txt === '—', JSON.stringify(dash));
      check('⑦ 그 자리에 «왜 없는지» 를 툴팁으로 적는다', !!dash && dash.tip.length > 5, dash && dash.tip);
      await ctx.close();
    }
    {
      const { ctx, page } = await open(browser, { hideStatus: 403 });
      const noPerm = await page.evaluate(() => {
        const btns = document.querySelectorAll('#textbooks-table button.tb-hide-toggle').length;
        const cells = [...document.querySelectorAll('#textbooks-table tr')].map(tr => (tr.lastElementChild.textContent || '').trim());
        const note = document.getElementById('tb-hide-note');
        return { btns, cells, noteShown: !!note && getComputedStyle(note).display !== 'none',
                 tip: document.querySelector('#textbooks-table tr:last-child td:last-child').getAttribute('title') || '' };
      });
      check('⑦ 권한이 없으면(403) 버튼을 안 만든다', noPerm.btns === 0, '버튼 ' + noPerm.btns + '개');
      check('⑦ 조용히 «보임» 이라 하지 않고 «—» 로 둔다', noPerm.cells.every(c => c === '—'), noPerm.cells.join('|'));
      check('⑦ 「버튼을 누르세요」 안내 줄을 감춘다', noPerm.noteShown === false, 'shown=' + noPerm.noteShown);
      check('⑦ 그 자리에 사유를 적는다 (본사·관리자 전용)', /본사|관리자/.test(noPerm.tip), noPerm.tip);
      await ctx.close();
    }

    // ── ⑧ 🌐 EN 으로 바꾸면 버튼 글자가 따라온다 (JS 로 그린 라벨) ──────
    {
      const { ctx, page } = await open(browser);
      const en = await page.evaluate(async () => {
        window.adminLang = 'en';
        document.dispatchEvent(new CustomEvent('mangoi:lang-changed', { detail: { lang: 'en' } }));
        await new Promise(r => setTimeout(r, 250));
        const b = document.querySelector('#textbooks-table button.tb-hide-toggle');
        return { text: (b.textContent || '').trim(), note: (document.getElementById('tb-hide-count').textContent || '').trim() };
      });
      check('⑧ EN 으로 바꾸면 버튼이 영어로 따라온다', /Shown|Hidden/.test(en.text), en.text);
      check('⑧ 개수 줄도 영어로 따라온다', /hidden/.test(en.note), en.note);
      await ctx.close();
    }
  } finally {
    await browser.close();
    if (srv) srv.kill();
  }
  console.log('──────────────────────────────────────────');
  console.log(`  ✅ ${pass} 통과 / ❌ ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})();
