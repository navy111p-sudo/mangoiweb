// -*- coding: utf-8 -*-
// 🔵 자료실 「NEW」 배지 색 — 브라우저 검사 (2026-09-03)
//
//   왜 브라우저인가 —
//     이 사고는 문자열로 절대 안 보인다. 규칙도 값도 «다 있고» 틀린 것은
//     «누가 이기는가» 뿐이다. 실제로 수리 전에도 회귀 하니스가 전부 초록이었다.
//
//   무엇을 잡는가 —
//     `admin-inline-c.css` 5014행이 `.lib-doc-t span{color:#2563eb!important}` 로
//     파랑을 지정하는데도 화면에는 검정(#101828)으로 나왔다.
//     ⚠️ 원인은 페인터가 «아니었다» — 브라우저로 재 보니 인라인 우선순위가 비어 있었다.
//        순수 CSS 특이성 문제였다: 5014행(0,2,2) < 8843행 [id^="card-"] :is(…)(0,10,5).
//        그래서 이 검사는 «인라인 우선순위가 비어 있는가» 도 함께 잰다 —
//        나중에 페인터가 끼어들기 시작하면 원인이 달라졌다는 뜻이라 그때 알아야 한다.
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//        PW_DIR=/tmp/pw node test-harness/manual/library-badge-color-browser.mjs
//
//   ⚠️ 자료실 파일 목록은 비밀번호 잠금(`.lib-files{display:none}`)이라 그냥 열면
//      배지가 «안 보임» 으로 나온다. 직원이 잠금을 푼 상태와 같게 만들어 재야 한다.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const CSS = join(PUBLIC, 'css', 'admin-inline-c.css');
const PORT = 8947;                       // 다른 검사와 겹치지 않게
const BASE = `http://127.0.0.1:${PORT}`;
const BLUE = 'rgb(37, 99, 235)';         // #2563eb
// ②의 변이시험은 CSS 를 «잠깐 잘랐다 되돌린다». finally 로 되돌리지만
// **강제 종료(SIGKILL·컨테이너 재시작)에는 finally 가 안 돈다** — 그러면 잘린 CSS 가 남고,
// 다음 실행이 그것을 «원본» 으로 읽어 수리를 영영 잃는다(2026-09-03 이 세션에서 실제로
// 하위 작업이 두 번 강제 종료됐다). 그래서 자르기 «전»에 옆에 사본을 두고,
// 다음 실행이 그 사본을 먼저 되돌린다.
const BAK = CSS + '.harness-bak';

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

const pw = loadPlaywright(), exe = findChromium();
if (!pw || !exe) {
  console.log('⏭  건너뜀 — playwright-core 또는 Chromium 이 없습니다.');
  console.log('   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core');
  process.exit(0);
}

// 지난 실행이 중간에 죽었으면 먼저 되돌린다 (조용히 넘어가지 않고 말한다)
if (existsSync(BAK)) {
  writeFileSync(CSS, readFileSync(BAK, 'utf8'), 'utf8');
  unlinkSync(BAK);
  console.log('⚠️  지난 실행이 중간에 죽어 CSS 가 잘린 채였습니다 — 사본에서 되돌렸습니다.');
}

const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));

/** 배지를 실제로 «보이는» 상태로 만들고 색·대비·인라인우선순위를 잰다. */
async function measure(browser) {
  // ⚠️ 잴 때마다 «새 컨텍스트» 를 연다 — 같은 페이지를 재사용하면 CSS 를 고쳐도
  //    렌더러가 이미 읽어 둔 사본을 그대로 써서 ②의 변이시험이 **되돌려도 초록**이 된다
  //    (Network.setCacheDisabled 만으로는 부족했다 — 2026-09-03 실측).
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  try {
  await page.goto(`${BASE}/admin.html?_nc=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch {} });
  await page.goto(`${BASE}/admin.html?_nc=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { try { jumpToMenu('card-lib-agency'); } catch {} });
  await page.waitForTimeout(1500);
  // 잠금 해제 + 접이칸 펼치기 (직원이 비밀번호를 넣은 상태와 같게)
  await page.evaluate(() => {
    document.querySelectorAll('.lib-files').forEach(f => { f.style.display = 'block'; });
    const c = document.getElementById('card-lib-agency');
    if (c) { c.open = true; c.querySelectorAll('details').forEach(d => { d.open = true; }); }
  });
  await page.waitForTimeout(600);
  return await page.evaluate(() => {
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    // ⚠️ 반투명 층은 «합성» 해야 한다 — 첫 색에서 멈추면 멀쩡한 대비를 1.x 로 잘못 읽는다
    const bgOf = el => {
      const L = []; let n = el;
      while (n && n.nodeType === 1) {
        const cs = getComputedStyle(n); let c = parse(cs.backgroundColor);
        if ((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') { const m = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (m) c = parse(m[0]); }
        if (c && c.a > 0) { L.push(c); if (c.a === 1) break; }
        n = n.parentElement;
      }
      if (!L.length) return { r: 255, g: 255, b: 255 };
      let o = { ...L[L.length - 1] };
      for (let i = L.length - 2; i >= 0; i--) { const c = L[i]; o = { r: c.r * c.a + o.r * (1 - c.a), g: c.g * c.a + o.g * (1 - c.a), b: c.b * c.a + o.b * (1 - c.a) }; }
      return o;
    };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    return [...document.querySelectorAll('.lib-doc-t span')].map(el => {
      const cs = getComputedStyle(el), owner = el.closest('[id^="card-"]');
      return {
        card: owner ? owner.id : '', text: el.textContent.trim().slice(0, 10),
        visible: !!el.offsetParent, color: cs.color,
        inlinePriority: el.style.getPropertyPriority('color'),
        contrast: Math.round(ratio(parse(cs.color), bgOf(el)) * 100) / 100,
      };
    });
  });
  } finally { await ctx.close(); }
}

const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
try {

  console.log('\n[ ① 지금 상태 — 배지가 파랗고 읽히는가 ]');
  const now = await measure(browser);
  const vis = now.filter(b => b.visible);
  check('배지를 «보이는» 상태로 실제로 재고 있다 (잠금 해제 뒤 0개면 검사가 헛돈 것)', vis.length >= 5, `보이는 배지 ${vis.length}개`);
  check('보이는 배지가 전부 파랑(#2563eb)이다', vis.length > 0 && vis.every(b => b.color === BLUE),
    [...new Set(vis.map(b => b.color))].join(' · '));
  check('대리점 자료실(card-lib-agency)의 배지가 포함돼 있다', vis.some(b => b.card === 'card-lib-agency'));
  check('전부 WCAG 본문 기준(4.5:1) 이상으로 읽힌다', vis.length > 0 && vis.every(b => b.contrast >= 4.5),
    vis.length ? '최저 ' + Math.min(...vis.map(b => b.contrast)) : '');
  // 원인이 «CSS 특이성» 이라는 전제가 아직 유효한가 (페인터가 끼어들면 고치는 방법이 달라진다)
  check('인라인 !important 로 덮는 페인터가 없다 (있으면 원인이 바뀐 것)',
    vis.every(b => b.inlinePriority === ''), vis.map(b => b.inlinePriority).filter(Boolean).join(','));

  console.log('\n[ ② 변이시험 — 꼬리 규칙을 되돌리면 실제로 검정이 되는가 ]');
  const orig = readFileSync(CSS, 'utf8');
  const idx = orig.indexOf('/* 🔵 자료실 「NEW」 배지 색 되살리기');
  check('꼬리 규칙이 CSS 에 있다', idx > 0);
  if (idx > 0) {
    try {
      writeFileSync(BAK, orig, 'utf8');                     // ⚠️ 자르기 «전»에 사본부터
      writeFileSync(CSS, orig.slice(0, idx), 'utf8');       // 꼬리를 통째로 잘라 «고치기 전» 으로
      const before = (await measure(browser)).filter(b => b.visible);
      check('되돌리면 파랑이 아니게 된다 (= 이 검사가 진짜로 무언가를 지킨다)',
        before.length > 0 && before.every(b => b.color !== BLUE),
        [...new Set(before.map(b => b.color))].join(' · '));
    } finally {
      writeFileSync(CSS, orig, 'utf8');                      // ⚠️ 반드시 되돌린다
      if (existsSync(BAK)) unlinkSync(BAK);
    }
    check('CSS 를 원래대로 되돌렸다', readFileSync(CSS, 'utf8') === orig);
    check('되돌리기용 사본(.harness-bak)을 남기지 않았다', !existsSync(BAK));
  }
} finally {
  await browser.close();
  srv.kill();
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log(`─────────────────────────────────────────────`);
process.exit(fail ? 1 : 0);
