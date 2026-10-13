#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// 📖 story-pc-size-browser — 영어 동화책 4편 «PC·모바일 모두 크게» (2026-10-13)
//   진짜 Chromium 으로 4편 × 화면 폭 7가지를 열어 잰다:
//   ① 가로 스크롤 없음  ② PC(≥1400)에서 책이 화면 폭의 45~75%
//   ③ 휴대폰(≤600)은 zoom 1.15 · 태블릿(601~1399)은 zoom 1.1 — 글자가 실제로 커졌다
//   ④ 본문 글자가 실제로 커졌는가(1920 에서 24px 이상)  ⑤ 도장 판이 스크롤해도 맨 위에 붙는다
//   ⑥ 버튼 «한가운데» 를 누르면 그 버튼이 맞는다(zoom 뒤 좌표 어긋남 없음)
//   ⑦ 도장 칸을 누르면 그 단원으로 실제로 이동  ⑧ JS 오류 0
//   ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다:  node test-harness/manual/story-pc-size-browser.mjs
//   STORY_PC_SRC=<고친 public 폴더> 로 변이시험을 합니다.
// ═══════════════════════════════════════════════════════════════════════
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
for (const p of [process.env.PW_DIR && resolve(process.env.PW_DIR, 'node_modules/playwright'), '/opt/node22/lib/node_modules/playwright', 'playwright']) {
  if (!p) continue; try { pw = require(p); break; } catch {}
}
if (!pw) { console.log('playwright 없음 — 건너뜀'); process.exit(0); }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = process.env.STORY_PC_SRC || resolve(ROOT, 'cloudflare-deploy/public');
const PORT = 8800 + Math.floor(Math.random() * 150);
const ROUNDS = Number(process.env.STORY_PC_ROUNDS || 1);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: PUB, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ❌ FAIL ' + n + (x ? ' — ' + x : '')); } };
const PAGES = ['story-red-umbrella', 'story-birthday-cake', 'story-robot-dance', 'story-treasure-map'];
const WIDTHS = [360, 390, 430, 768, 1024, 1366, 1440, 1920, 2560, 2865, 3840];

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => pw.chromium.launch());
try {
  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`▶ ${round}회차`);
    for (const pg of PAGES) for (const W of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: W, height: W < 800 ? 844 : 1000 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      await page.goto(`http://127.0.0.1:${PORT}/${pg}.html?_nc=${Date.now()}`, { waitUntil: 'load' });
      await page.waitForTimeout(250);
      const tag = `${pg} @${W}`;
      const m = await page.evaluate(() => {
        const wrap = document.querySelector('.wrap');
        const r = wrap.getBoundingClientRect();
        const z = parseFloat(getComputedStyle(wrap).zoom || '1');
        const p = document.querySelector('.story p');
        const pf = p ? parseFloat(getComputedStyle(p).fontSize) : 0;
        /* 본문 한 줄의 실제 글자 높이 — Range 로 재면 zoom 이 반영된 화면 크기가 나온다 */
        let glyph = 0;
        if (p && p.firstChild) { const rg = document.createRange(); rg.setStart(p.firstChild, 0); rg.setEnd(p.firstChild, 1); glyph = rg.getBoundingClientRect().height; }
        return { sw: document.documentElement.scrollWidth, iw: innerWidth, w: r.width, z, pf, glyph };
      });
      ok(m.sw <= m.iw, `${tag} 가로 스크롤 없음`, `${m.sw} > ${m.iw}`);
      if (W >= 1400) ok(m.w / W >= 0.45 && m.w / W <= 0.75, `${tag} 책 폭이 화면의 45~75%`, (m.w / W * 100).toFixed(1) + '%');
      else {
        const want = W <= 600 ? 1.15 : 1.1;
        ok(Math.abs(m.z - want) < 1e-6, `${tag} 휴대폰·태블릿 zoom ${want}`, String(m.z));
        /* 축소 전 본문 줄 높이 25px — 모바일에서도 1.08배 이상(= 실제로 커졌다) */
        ok(m.glyph >= 25 * 1.08, `${tag} 모바일 본문 글자가 실제로 커졌다`, m.glyph.toFixed(1));
      }
      if (W === 1920) ok(m.pf * m.z >= 24 && m.glyph >= 24, `${tag} 본문 글자 24px 이상`, `${(m.pf * m.z).toFixed(1)} / 줄 ${m.glyph.toFixed(1)}`);
      if (W >= 1400) ok(m.glyph >= 25 * 1.1, `${tag} 본문 글자가 실제로 커졌다(축소 전 줄 높이 25px 의 1.1배 이상)`, m.glyph.toFixed(1));

      /* ⑤ 도장 판 — 아래로 내려도 맨 위에 붙고, 그 자리 맨 위가 도장 판이다 */
      await page.evaluate(() => window.scrollTo(0, 1600));
      await page.waitForTimeout(150);
      const sb = await page.evaluate(() => {
        const b = document.querySelector('.stampboard'); if (!b) return null;
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2));
        return { top: r.top, mine: !!(hit && b.contains(hit)) };
      });
      ok(sb && sb.top <= 2 && sb.top >= -2 && sb.mine, `${tag} 도장 판이 맨 위에 붙어 보인다`, JSON.stringify(sb));

      /* ⑥ 버튼 한가운데를 누르면 그 버튼이 맞는다 — 보이는 버튼 12개 표본 */
      const miss = await page.evaluate(async () => {
        const bs = [...document.querySelectorAll('.wrap button')].filter((b) => b.offsetParent && !b.closest('.stampboard'));
        const out = [];
        for (const b of bs.slice(0, 40).filter((_, i) => i % 3 === 0).slice(0, 12)) {
          b.scrollIntoView({ block: 'center' });
          await new Promise((r) => requestAnimationFrame(r));
          const r = b.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (!(hit && (hit === b || b.contains(hit)))) out.push((b.textContent || b.id || '?').trim().slice(0, 20) + ' → ' + (hit ? hit.tagName + '.' + hit.className : 'null'));
        }
        return { n: bs.length, out };
      });
      ok(miss.n > 5 && miss.out.length === 0, `${tag} 버튼 한가운데 = 그 버튼(가려짐·어긋남 없음)`, JSON.stringify(miss.out.slice(0, 2)));

      /* ⑦ 도장 칸을 «진짜 마우스로» 누르면 그 단원으로 간다 */
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      const stamps = await page.$$('.stampboard [data-go]');
      if (stamps.length) {
        const last = stamps[stamps.length - 1];
        const target = await last.getAttribute('data-go');
        const bb = await last.boundingBox();
        await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await page.waitForTimeout(900);
        const t = await page.evaluate((id) => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().top : null; }, target);
        ok(t !== null && t >= -5 && t < (W < 800 ? 844 : 1000) * 0.6, `${tag} 도장 칸을 누르면 «${target}» 로 이동`, String(t));
      } else ok(false, `${tag} 도장 칸이 있다`);

      ok(errs.length === 0, `${tag} JS 오류 0`, errs[0]);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
