// 📅 «돌아가기» 알약이 도구 화면의 조작을 덮지 않는지 — 브라우저 실측 (2026-09-03)
//   왜: 함정 대조 검사가 잡았다 — 처음 판(bottom:14px 고정)이 AI 친구 「🚀 다음 활동 고르기」와
//       웜업 첫 화면 레벨 카드의 «가운데» 를 덮었다. «맨 위·화면 안» 검사만으로는 못 본다.
//   무엇을: 계획이 가리키는 화면 전부(정본 TOOLS + 레벨테스트)를 ?from=today 로 열어
//       390×844 · 1280×800 에서 알약 상자 안 격자를 elementFromPoint 로 훑는다 —
//       알약 «밑» 의 조작 요소(button·a[href]·input·select·[role=button]) 0건이어야 한다.
//   자동으로 안 돈다(manual/) — 사람이 부른다:  PW_DIR=/tmp/pw node test-harness/manual/today-bar-cover-browser.mjs
//   전제: cd cloudflare-deploy/public && python3 -m http.server 8931
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const PW = process.env.PW_DIR || '/tmp/pw';
const require = createRequire(PW + '/node_modules/');
const { chromium } = require('playwright-core');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CF = join(ROOT, 'cloudflare-deploy');
const BASE = process.env.BASE || 'http://127.0.0.1:8931';
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n, x !== undefined ? JSON.stringify(x) : ''); } };
// 정본에서 화면 목록을 읽는다 — 손으로 적으면 어긋난다
const tmp = mkdtempSync(join(tmpdir(), 'tb-'));
execFileSync(join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), [join(CF, 'src', 'today-plan.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${join(tmp, 'p.mjs')}`, '--log-level=error']);
const mod = await import(pathToFileURL(join(tmp, 'p.mjs')).href);
const urls = new Set(['/level-test-ai.html']);
for (const t of Object.values(mod.TOOLS)) { urls.add(t.url); if (t.urlZh) urls.add(t.urlZh); }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const u of [...urls].sort()) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[],"results":[]}' }));
    await page.addInitScript(() => { try { localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo1', name: '테스트' })); localStorage.setItem('mango_token', 'tok'); } catch (e) {} });
    try { await page.goto(BASE + u + '?from=today&step=1&total=3&_nc=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch (e) { ok(`${vp.width} ${u} 열림`, false, String(e).slice(0, 80)); await ctx.close(); continue; }
    await page.waitForTimeout(3600);   // 알약의 마지막 재측정(3초) 뒤
    const s = await page.evaluate(() => {
      const a = document.getElementById('mangoi-today-bar');
      if (!a) return { has: false };
      const r = a.getBoundingClientRect();
      const INTER = 'button, a[href], input, select, textarea, label, [role="button"], [onclick]';
      const hits = [];
      a.style.visibility = 'hidden';
      for (const x of [r.left + 4, r.left + r.width / 2, r.right - 4]) for (const y of [r.top + 3, r.top + r.height / 2, r.bottom - 3]) {
        const t = document.elementFromPoint(x, y);
        if (t && t !== a && !a.contains(t)) { const c = t.matches(INTER) ? t : t.closest(INTER); if (c) hits.push((c.id ? '#' + c.id : c.tagName.toLowerCase()) + ':' + (c.textContent || '').trim().slice(0, 18)); }
      }
      a.style.visibility = '';
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { has: true, inView: r.top >= 0 && r.bottom <= innerHeight, onTop: top === a || a.contains(top), covers: [...new Set(hits)], bottom: a.style.bottom, top: a.style.top };
    });
    ok(`${vp.width}px ${u} — 알약 있음 · 화면 안 · 맨 위 · 조작 요소 0건 덮음`, s.has && s.inView && s.onTop && s.covers.length === 0, s);
    if (errs.length) console.log('     (JS 오류 — 스텁 때문일 수 있음) ' + errs[0].slice(0, 100));
    await ctx.close();
  }
}
await browser.close(); rmSync(tmp, { recursive: true, force: true });
console.log(`\n📅 today-bar cover — PASS ${pass} / FAIL ${fail}`); process.exit(fail ? 1 : 0);
