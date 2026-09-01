// -*- coding: utf-8 -*-
// 🌏 강사 명부 «구분»(필리핀·북미·중국) — 브라우저 검사              (2026-09-01)
//
//   왜 브라우저인가 —
//     문자열 하니스(teacher_region_harness.mjs)는 「그 코드가 있는가」까지만 본다.
//     여기서 걸리는 사고는 전부 «몇 px 이고 무엇이 맨 위이고 무슨 요청이 나갔는가» 뿐이다 —
//       · 전역 룰 `details.menu-card button{background:인디고!important; padding:9px 18px!important}`
//         이 구분 버튼을 큰 파란 알약으로 뭉개는가
//       · 글자색 페인터 셋(adm-s12·adm-s13·adm-light-surfaces)이 배지 색을 눌러
//         세 구분이 화면에서 구분되지 않는가 (예외 등재가 실제로 먹는가)
//       · `body{zoom:1.3}` 때문에 메뉴가 버튼에서 떨어져 뜨는가
//       · 상태 메뉴를 열어 둔 채 구분을 누르면 «같은 메뉴» 로 보고 닫기만 하는가
//       · 「화면만 바뀌고 서버에는 안 갔다」(시연 껍데기) 가 아닌가
//       · 필터를 골랐는데 조용히 아무 일도 안 하는가
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/teacher-region-inline-browser.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8933;                       // 다른 검사와 겹치지 않게 (서비스워커 캐시 회피)
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

/* 씨앗 — 실제 운영 D1(2026-09-01) 모양 그대로.
   ⚠️ 대부분 nationality 가 비어 있고 지역 «글자» 로 읽힌다(32/33). 그 상태를 그대로 넣는다. */
const SEED = [
  { id: 101, korean_name: 'Teacher Ana', english_name: 'Teacher Ana', status: '활동중', list_hidden: 0,
    group_name: 'Office Teacher', nationality: null, origin_region: '필리핀', active_region: '필리핀' },
  { id: 102, korean_name: 'Teacher Mo',  english_name: 'Teacher Mo',  status: '퇴사',  list_hidden: 0,
    group_name: '미국 오전반', nationality: null, origin_region: '미국캐나다', active_region: '미국캐나다' },
  { id: 103, korean_name: '중국어 강선생님', english_name: '중국어 강선생님', status: '활동중', list_hidden: 0,
    group_name: '중국어 강사', nationality: null, origin_region: '중국', active_region: '중국' },
  { id: 104, korean_name: 'JED', english_name: 'JED', status: '활동중', list_hidden: 0,
    group_name: null, nationality: null, origin_region: null, active_region: null },
];

/* 🔴 서버 판정을 그대로 흉내 낸다 — 스텁이 «아무 값이나» 주면 화면이 무엇을 그리든 통과한다.
   ⚠️ 이것은 검사용 흉내일 뿐 정본이 아니다. 정본 판정은 teacher_region_harness 가
      src/teacher-region.ts 를 **컴파일해 실제로 돌려서** 확인한다. */
function stubRegion(r) {
  const code = String(r.nationality || '').toUpperCase();
  if (code) return ({ PH: 'PH', US: 'NA', CA: 'NA', CN: 'CN' })[code] || 'ETC';
  for (const v of [r.origin_region, r.active_region, r.group_name]) {
    const s = String(v || '');
    if (s.includes('필리핀')) return 'PH';
    if (s.includes('미국') || s.includes('캐나다')) return 'NA';
    if (s.includes('중국')) return 'CN';
  }
  return '';
}

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
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 */ }
  });
  /* 🪤 포괄 스텁을 «먼저» 깔고 구체적인 것을 뒤에 — route 는 나중에 등록한 것이 이긴다. */
  await ctx.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));

  const rows = SEED.map(r => ({ ...r }));
  await ctx.route('**/api/admin/teacher-profiles?**', async route => {
    const u = new URL(route.request().url());
    await page.evaluate(s => { (window.__tpGets = window.__tpGets || []).push(s); }, u.search).catch(() => {});
    const hiddenOnly = u.searchParams.get('hidden') === '1';
    const fRegion = u.searchParams.get('region') || '';
    let items = rows.filter(r => (Number(r.list_hidden || 0) === 1) === hiddenOnly)
                    .map(r => ({ ...r, region: stubRegion(r) }));
    if (fRegion) items = items.filter(r => fRegion === '__none__' ? !r.region : r.region === fRegion);
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, items }) });
  });
  await ctx.route('**/api/admin/teacher-profiles/*', async route => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.fallback();
    let body = null;
    try { body = JSON.parse(req.postData() || '{}'); } catch { /* 무시 */ }
    await page.evaluate(rec => { (window.__tpPatches = window.__tpPatches || []).push(rec); },
      { url: req.url(), body }).catch(() => {});
    const rid = Number((req.url().match(/teacher-profiles\/(\d+)/) || [])[1]);
    const row = rows.find(r => r.id === rid);
    let region;
    if (row && body) {
      if (Object.prototype.hasOwnProperty.call(body, 'nationality')) row.nationality = body.nationality;
      if (Object.prototype.hasOwnProperty.call(body, 'status')) row.status = body.status;
      region = stubRegion(row);            // 서버처럼 «다시 판정해» 돌려준다
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, id: rid, region }) });
  });

  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tp-list-table', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => {
    try { if (typeof window.jumpToMenu === 'function') window.jumpToMenu('card-teacher-mgmt'); } catch (e) {}
    let el = document.getElementById('tp-list-table');
    while (el) { if (el.tagName === 'DETAILS') el.open = true; el = el.parentElement; }
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { if (typeof window.loadTeacherProfiles === 'function') window.loadTeacherProfiles(); });
  await page.waitForFunction(() => document.querySelectorAll('#tp-list-body tr[data-tid]').length >= 4,
    { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

/* 🪤 메뉴는 «스크롤이 멎은 뒤» 눌러야 한다 — smooth 스크롤이 도착하면 열리자마자 닫힌다. */
async function openMenu(page, btnId) {
  await page.evaluate(i => { document.getElementById(i).scrollIntoView({ block: 'center', behavior: 'instant' }); }, btnId);
  await page.waitForFunction(() => {
    const y = window.scrollY;
    if (window.__lastY === y) return true;
    window.__lastY = y; return false;
  }, { timeout: 8000 });
  await page.waitForTimeout(150);
  await page.evaluate(i => document.getElementById(i).click(), btnId);
  await page.waitForSelector('#tp-st-menu', { timeout: 5000 });
}

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    console.log('\n[ ① PC 1440×900 — 구분 칸이 실제로 그려지는가 ]');
    let { page } = await open(browser, 1440, 900);

    const labels = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('#tp-list-body tr[data-tid]').forEach(tr => {
        const id = tr.getAttribute('data-tid');
        const td = document.getElementById('tprgc-' + id);
        out[id] = td ? td.textContent.replace(/▾/g, '').trim() : null;
      });
      return out;
    });
    check('필리핀 강사(101) 칸이 「필리핀」', labels['101'] === '필리핀', JSON.stringify(labels));
    check('미국캐나다 강사(102) 칸이 「북미」', labels['102'] === '북미', JSON.stringify(labels));
    check('중국 강사(103) 칸이 「중국」', labels['103'] === '중국', JSON.stringify(labels));
    check('단서 없는 강사(104) 는 빈칸이 아니라 「— 미지정」', labels['104'] === '— 미지정', JSON.stringify(labels));

    console.log('\n[ ①-2 표 머리 칸 수 = 한 줄의 칸 수 ]');
    const cols = await page.evaluate(() => ({
      th: document.querySelectorAll('#tp-list-table thead th').length,
      td: document.querySelectorAll('#tp-list-body tr[data-tid]:first-child td').length,
    }));
    check(`머리 ${cols.th} · 줄 ${cols.td} 가 같다`, cols.th === cols.td && cols.th === 16, JSON.stringify(cols));

    console.log('\n[ ② 배지가 전역 !important 와 페인터에 눌리지 않았는가 ]');
    const badge = await page.evaluate(() => {
      const el = document.querySelector('#tprgc-101 .tp-rg-badge');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const btn = document.getElementById('tprgb-101');
      const bcs = getComputedStyle(btn);
      /* ⚠️ getBoundingClientRect 는 body{zoom:1.3} 이 «곱해진» 화면 좌표다 —
         «몇 줄인가» 를 보려면 CSS 픽셀로 되돌려 lineHeight 와 견줘야 한다. */
      const z = parseFloat(document.body.style.zoom || getComputedStyle(document.body).zoom) || 1;
      return { bg: cs.backgroundColor, color: cs.color, h: r.height / z, z,
               lh: parseFloat(cs.lineHeight) || 0,
               btnBg: bcs.backgroundColor, btnPadding: bcs.padding };
    });
    check('배지 배경이 투명하지 않다 (background-color 로 줘서 옛 규칙에 안 먹힘)',
      badge.bg !== 'rgba(0, 0, 0, 0)' && badge.bg !== 'transparent', badge.bg);
    check('배지가 한 줄이다 (낱글자로 쪼개지지 않음)',
      badge.lh > 0 && badge.h <= badge.lh + 8,
      `h=${badge.h.toFixed(1)}css lineHeight=${badge.lh} zoom=${badge.z}`);
    check('트리거 버튼이 전역 인디고 알약이 아니다 (배경 투명)',
      badge.btnBg === 'rgba(0, 0, 0, 0)', badge.btnBg + ' / ' + badge.btnPadding);

    console.log('\n[ ②-2 세 구분이 화면에서 «서로 다른 색» 인가 (페인터가 눌렀으면 같아진다) ]');
    const colors = await page.evaluate(() => ['101', '102', '103', '104'].map(i => {
      const el = document.querySelector('#tprgc-' + i + ' .tp-rg-badge');
      const cs = getComputedStyle(el);
      return cs.backgroundColor + '|' + cs.color;
    }));
    check('네 칸의 색이 전부 다르다', new Set(colors).size === 4, colors.join('  '));

    console.log('\n[ ③ 눌러서 바꾸기 — 메뉴가 뜨고, 맨 위이고, 버튼 근처인가 ]');
    await openMenu(page, 'tprgb-104');
    /* ⚠️ 버튼과 메뉴 «둘 다» getBoundingClientRect 라 같은 좌표계다 — 여기서 배율로 나누면
       멀쩡한 자리가 210px 어긋난 것으로 나온다(처음에 그렇게 재서 거짓 실패를 봤다).
       배율 보정은 «놓는 쪽»(_tpStPlace) 이 하는 일이고, 재는 쪽은 그냥 견주면 된다. */
    const geo = await page.evaluate(() => {
      const b = document.getElementById('tprgb-104').getBoundingClientRect();
      const m = document.getElementById('tp-st-menu').getBoundingClientRect();
      const top = document.elementsFromPoint((m.left + m.right) / 2, m.top + 12)[0];
      return { dx: Math.round(Math.abs(m.left - b.left)), dy: Math.round(m.top - b.bottom),
               inView: m.left >= 0 && m.top >= 0 &&
                       m.right <= window.innerWidth + 1 && m.bottom <= window.innerHeight + 1,
               inside: !!document.getElementById('tp-st-menu').contains(top),
               items: [...document.querySelectorAll('#tp-st-menu .tp-st-item')].map(e => e.getAttribute('data-val')) };
    });
    check('메뉴가 버튼 «바로 아래» 에 붙는다 (zoom 보정이 먹었다)',
      geo.dx <= 14 && geo.dy >= -2 && geo.dy <= 24, JSON.stringify(geo));
    check('메뉴가 화면 안에 전부 들어온다 (overflow 상자에 안 잘렸다)', geo.inView, JSON.stringify(geo));
    check('메뉴가 무엇에도 안 가려진다 (맨 위)', geo.inside, JSON.stringify(geo));
    check('나라 목록이 PH·US·CA·CN·ZZ + 비우기(빈값) 이다',
      JSON.stringify(geo.items) === JSON.stringify(['PH', 'US', 'CA', 'CN', 'ZZ', '']), JSON.stringify(geo.items));

    console.log('\n[ ③-2 국적이 비어 있으면 «어디서 읽었는지» 를 말해 주는가 ]');
    await page.evaluate(() => document.body.click());
    await openMenu(page, 'tprgb-101');
    const note = await page.evaluate(() => {
      const n = document.querySelector('#tp-st-menu .tp-st-note');
      return n ? n.textContent.trim() : null;
    });
    check('지역 글자로 읽고 있다는 안내가 있다', !!note && note.includes('글자'), String(note));

    console.log('\n[ ④ 고르면 «서버에 실제로» 가는가 (시연 껍데기가 아닌가) ]');
    await page.evaluate(() => { window.__tpPatches = []; });
    await page.evaluate(() => document.body.click());
    await openMenu(page, 'tprgb-104');
    await page.evaluate(() => document.querySelector('#tp-st-menu .tp-st-item[data-val="US"]').click());
    await page.waitForTimeout(700);
    const sent = await page.evaluate(() => window.__tpPatches || []);
    check('PATCH 가 한 번 나갔다', sent.length === 1, JSON.stringify(sent));
    check('보낸 값이 nationality:US 다 (구분 코드 NA 를 저장하지 않는다)',
      sent[0] && sent[0].body && sent[0].body.nationality === 'US', JSON.stringify(sent[0] && sent[0].body));
    const after = await page.evaluate(() =>
      document.getElementById('tprgc-104').textContent.replace(/▾/g, '').trim());
    check('화면이 서버가 판정한 「북미」로 바뀐다', after === '북미', after);

    console.log('\n[ ⑤ 5초 되돌리기 ]');
    const undo = await page.evaluate(() => {
      const b = document.querySelector('#tp-st-toast button.tp-st-undo');
      return b ? b.textContent.trim() : null;
    });
    check('되돌리기 버튼이 떠 있다', !!undo, String(undo));
    await page.evaluate(() => { window.__tpPatches = []; });
    await page.evaluate(() => document.querySelector('#tp-st-toast button.tp-st-undo').click());
    await page.waitForTimeout(700);
    const undoSent = await page.evaluate(() => window.__tpPatches || []);
    check('되돌리기가 «조용히 아무 일도 안 하지» 않는다 (PATCH 가 나갔다)',
      undoSent.length === 1, JSON.stringify(undoSent));
    check('되돌린 값이 «원래대로»(빈 값) 다',
      undoSent[0] && undoSent[0].body && !undoSent[0].body.nationality, JSON.stringify(undoSent[0] && undoSent[0].body));
    const back = await page.evaluate(() =>
      document.getElementById('tprgc-104').textContent.replace(/▾/g, '').trim());
    check('화면도 「— 미지정」으로 돌아온다', back === '— 미지정', back);

    console.log('\n[ ⑥ 상태 메뉴 → 구분 메뉴로 옮겨 눌러도 «닫히기만» 하지 않는가 ]');
    await page.evaluate(() => document.body.click());
    await openMenu(page, 'tpstb-101');
    await page.evaluate(() => { document.getElementById('tprgb-101').click(); });
    await page.waitForTimeout(250);
    const still = await page.evaluate(() => {
      const m = document.getElementById('tp-st-menu');
      return m ? m.getAttribute('data-tid') : null;
    });
    check('구분 메뉴가 열려 있다 (열쇠가 rg:101)', still === 'rg:101', String(still));

    console.log('\n[ ⑦ 필터 — 골랐는데 조용히 아무 일도 안 하지 않는가 ]');
    await page.evaluate(() => document.body.click());
    await page.evaluate(() => { window.__tpGets = []; });
    await page.selectOption('#tp-filter-region', 'CN');
    await page.waitForTimeout(900);
    const gets = await page.evaluate(() => window.__tpGets || []);
    check('?region=CN 이 붙은 조회가 나갔다',
      gets.some(s => s.includes('region=CN')), JSON.stringify(gets));
    const shown = await page.evaluate(() => ({
      n: document.querySelectorAll('#tp-list-body tr[data-tid]').length,
      cnt: (document.getElementById('tp-count') || {}).textContent,
    }));
    check('목록이 중국 강사 한 명으로 줄었다', shown.n === 1, JSON.stringify(shown));
    check('건수 표시도 그 숫자다', String(shown.cnt).indexOf('1') === 0, String(shown.cnt));
    await page.selectOption('#tp-filter-region', '__none__');
    await page.waitForTimeout(900);
    const none = await page.evaluate(() => document.querySelectorAll('#tp-list-body tr[data-tid]').length);
    check('「미지정」 필터는 단서 없는 강사만 남긴다', none === 1, String(none));
    await page.selectOption('#tp-filter-region', '');
    await page.waitForTimeout(900);
    const all = await page.evaluate(() => document.querySelectorAll('#tp-list-body tr[data-tid]').length);
    check('「전체 구분」으로 되돌리면 네 명이 다 보인다', all === 4, String(all));

    console.log('\n[ ⑧ 폰 390×844 — 문서가 가로로 넘치지 않는가 ]');
    await page.context().close();
    ({ page } = await open(browser, 390, 844));
    const over = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
      cell: !!document.getElementById('tprgc-101'),
    }));
    check('구분 칸이 폰에서도 그려진다', over.cell);
    check('문서가 가로로 안 넘친다 (표는 자기 상자 안에서 구른다)',
      over.doc <= over.win + 1, JSON.stringify(over));

  } finally {
    await browser.close();
    if (server) server.kill();
  }
  console.log('\n──────────────────────────────────────────');
  console.log(`PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
