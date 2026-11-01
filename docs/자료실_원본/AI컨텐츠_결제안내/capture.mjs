// 🤖 A.i 컨텐츠 결제 안내서 — 화면 캡처 (2026-10-28)
//   사용법(리포 루트):
//     1) cd cloudflare-deploy/public && python3 -m http.server 8977   (다른 창)
//     2) node "docs/자료실_원본/AI컨텐츠_결제안내/capture.mjs" <캡처폴더>      (LANGS=ko,en 기본)
//   배포되는 그 파일(public/manager.html · admin/login.html)을 그대로 띄운다.
//   대리점 화면은 «시연 계정(testagency)» 모드로 그린다 — manager.html 의 시연 블록이
//   /api/admin/me 가 testagency 라고 답할 때만 예시 학생(demo001…)·예시 금액을 쓰고, 결제창은 열지 않는다.
//   그래서 여기서는 /api/admin/me 와 /api/admin/exec/summary(학원 이름) 두 개만 대신 답한다.
//   ⛔ 실제 학생·학원 정보를 쓰지 말 것 — 이 PDF 는 /library/ 밑이라 누구나 받는다(저장소도 공개).
//   그림 이름(p1-login …)은 content.mjs 의 img 와, 관리자용 사용설명서 10장의 img 와 짝이다.
import { mkdirSync } from 'node:fs';
import { launchChromium } from '../_공용/pdf-helpers.mjs';
import { T } from './content.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8977';
const OUT = process.argv[2];
if (!OUT) { console.error('캡처폴더를 주세요'); process.exit(1); }
const LANGS = (process.env.LANGS || 'ko,en').split(',');
mkdirSync(OUT, { recursive: true });
const W = ms => new Promise(r => setTimeout(r, ms));
const SHOP = { ko: '샘플영어학원', en: 'Sample English Academy' };

// 빨간 상자 + 번호 알약. 좌표는 «스크롤 0» 기준(창을 충분히 키워 스크롤 없이 찍는다).
//   side: right(상자 오른쪽 바깥) · in(상자 안 오른쪽) · left · top · bottom
async function callouts(page, list) {
  return page.evaluate((list) => {
    const out = [];
    for (const c of list) {
      const el = document.querySelector(c.sel); if (!el) { out.push({ miss: c.sel }); continue; }
      const r = el.getBoundingClientRect(), pad = c.pad == null ? 6 : c.pad;
      const box = document.createElement('div'); box.className = '__mark';
      box.style.cssText = `position:fixed;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:3.5px solid #e11d48;border-radius:12px;z-index:2147483646;pointer-events:none;box-shadow:0 0 0 4px rgba(225,29,72,.16)`;
      document.documentElement.appendChild(box);
      const pill = document.createElement('div'); pill.className = '__mark';
      pill.style.cssText = 'position:fixed;z-index:2147483647;display:inline-flex;align-items:center;gap:7px;background:#e11d48;color:#fff;font:700 15px/1.2 system-ui,"Noto Sans KR",sans-serif;padding:5px 13px 5px 5px;border-radius:999px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.25)';
      pill.innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 4px;border-radius:999px;background:#fff;color:#e11d48;font-size:14px;font-weight:800">${c.num}</span><span></span>`;
      pill.lastChild.textContent = c.text;
      document.documentElement.appendChild(pill);
      const pw = pill.offsetWidth, ph = pill.offsetHeight, bx = r.left - pad, by = r.top - pad, bw = r.width + pad * 2, bh = r.height + pad * 2;
      let x, y;
      if (c.side === 'in') { x = bx + bw - pw - 10; y = by + bh / 2 - ph / 2; }
      else if (c.side === 'left') { x = bx - pw - 12; y = by + bh / 2 - ph / 2; }
      else if (c.side === 'top') { x = bx + bw / 2 - pw / 2; y = by - ph / 2; }
      else if (c.side === 'bottom') { x = bx + bw / 2 - pw / 2; y = by + bh - ph / 2; }
      else { x = bx + bw + 12; y = by + bh / 2 - ph / 2; }
      x += c.dx || 0; y += c.dy || 0;
      pill.style.left = x + 'px'; pill.style.top = y + 'px';
      out.push({ l: Math.min(bx, x), t: Math.min(by, y), r: Math.max(bx + bw, x + pw), b: Math.max(by + bh, y + ph) });
    }
    return out;
  }, list);
}
const unmark = page => page.evaluate(() => document.querySelectorAll('.__mark').forEach(e => e.remove()));

// 찍을 영역 = 고른 요소들 + 표시가 차지한 자리 + 여백. 창 밖으로는 안 나간다.
async function shotRegion(page, name, sels, marks, opt = {}) {
  const rects = await page.evaluate((sels) => sels.map(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }), sels);
  if (rects.some(x => !x)) throw new Error(name + ': 영역 요소가 없습니다 ' + JSON.stringify(sels));
  const missing = marks.filter(m => m.miss); if (missing.length) throw new Error(name + ': 표시할 요소가 없습니다 ' + JSON.stringify(missing));
  const all = rects.concat(marks);
  const pad = opt.pad == null ? 14 : opt.pad, vp = page.viewportSize();
  let l = Math.min(...all.map(x => x.l)) - pad, t = Math.min(...all.map(x => x.t)) - pad;
  let r = Math.max(...all.map(x => x.r)) + pad, b = Math.max(...all.map(x => x.b)) + pad;
  if (opt.l != null) l = opt.l; if (opt.r != null) r = opt.r; if (opt.b != null) b = Math.max(b, opt.b);
  l = Math.max(0, l); t = Math.max(0, t); r = Math.min(vp.width, r); b = Math.min(vp.height, b);
  await page.screenshot({ path: `${OUT}/${LANG}-${name}.jpg`, type: 'jpeg', quality: 86, clip: { x: l, y: t, width: r - l, height: b - t } });
  console.log('shot', LANG, name, Math.round(r - l) + 'x' + Math.round(b - t));
}

const browser = await launchChromium();
let LANG = 'ko';
async function ctxFor(lang, vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
  await ctx.addInitScript((lang) => { try {
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'testagency', username: 'testagency', role: 'agency' }));
    localStorage.setItem('mangoi_lang', lang); localStorage.setItem('mangoi_lang_by', 'user');
  } catch (e) {} }, lang);
  await ctx.route('**/api/**', r => {
    const p = new URL(r.request().url()).pathname;
    const J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/admin/me') return J({ ok: true, role: 'agency', user: { username: 'testagency', name: SHOP[lang] }, scope: { type: 'agency', label: SHOP[lang] } });
    if (p === '/api/admin/exec/summary') return J({ ok: true, scope: { type: 'agency', label: SHOP[lang], value: SHOP[lang] }, fee_rate: 0.15 });
    return J({ ok: true, items: [], rows: [] });
  });
  return ctx;
}
// 「시연용 예시 데이터」 배지는 PDF 에 안 담는다(설명용 예시라는 말은 안내서 맨 아래 각주가 한다).
const NOISE = '#demoBadge,#greet-pop,#inappWarn{display:none!important}';

for (const lang of LANGS) {
  LANG = lang; const M = T[lang].marks;
  // ── 1. 로그인 ─────────────────────────────────────────────
  { const ctx = await ctxFor(lang, { width: 1280, height: 1000 }); const pg = await ctx.newPage();
    await pg.goto(BASE + '/admin/login.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' }); await W(2500);
    await pg.addStyleTag({ content: NOISE });
    await pg.fill('#username', 'sample01');
    await pg.evaluate(() => { const l = document.querySelector('#loginForm .field label'); if (l) l.id = '__idLabel'; });
    await pg.evaluate(() => { const p = document.getElementById('password'); if (p) p.blur(); document.activeElement && document.activeElement.blur(); }); await W(300);
    const mk = await callouts(pg, [{ sel: '#username', num: 1, text: M.id, side: 'in' }, { sel: '#password', num: 2, text: M.pw, side: 'in', dx: -46 }, { sel: '#loginBtn', num: 3, text: M.login, side: 'in' }]);
    await shotRegion(pg, 'p1-login', ['#__idLabel', '#username', '#bioBtn'], mk, { pad: 22 });
    await ctx.close(); }
  // ── 2~6. 대리점 화면 ───────────────────────────────────────
  { const ctx = await ctxFor(lang, { width: 1280, height: 1700 }); const pg = await ctx.newPage();
    pg.on('dialog', d => d.accept().catch(() => {}));
    await pg.goto(BASE + '/manager.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' }); await W(3200);
    await pg.addStyleTag({ content: NOISE });
    // 2) 메뉴 — 「정산통계관리」 묶음만 잘라 찍는다
    await pg.evaluate(() => { const h = [...document.querySelectorAll('#side .sgrp-h')].find(x => /Settlement|정산통계/.test(x.textContent)); if (h) h.id = '__setHead'; });
    let mk = await callouts(pg, [{ sel: '#sideAibill', num: 4, text: M.menu, side: 'right', pad: 4 }]);
    await shotRegion(pg, 'p2-menu', ['#__setHead', '#sideAibill'], mk, { l: 0, pad: 10 });
    await unmark(pg);
    // 3) 카드 열기 → 명단 불러오기 전
    await pg.evaluate(() => window.openCard('c-aibill')); await W(1800);
    mk = await callouts(pg, [{ sel: '#aibillBody .aib-due', num: '!', text: M.due, side: 'left', pad: 4 }, { sel: '#aibillBody .aib-btn-main', num: 5, text: M.load, side: 'right', pad: 4 }]);
    await shotRegion(pg, 'p3-load', ['#c-aibill'], mk, { pad: 10 });
    await unmark(pg);
    // 4) 명단 불러오기(시연 계정은 이 화면 안에서만 바뀐다) → 결제 대상 체크
    await pg.evaluate(() => window.aiBillGenerate()); await W(1800);
    await pg.evaluate(() => {
      const g = [...document.querySelectorAll('#aibillBody .aib-grp')];
      const a = g.find(x => x.querySelector('.aib-row[data-g="a"]')), b = g.find(x => x.querySelector('.aib-row[data-g="b"]'));
      if (a) a.id = '__grpA'; if (b) b.id = '__grpB';
      const r = document.querySelector('#aibillBody .aib-row[data-g="a"]'); if (r) r.id = '__rowA';
      const pb = document.querySelector('#aibillBody .aib-paybar'); if (pb) { pb.id = '__paybar'; const btn = pb.querySelector('.aib-btn-main'); if (btn) btn.id = '__payBtn';
        let n = pb.nextElementSibling; while (n && !/muted/.test(n.className)) n = n.nextElementSibling; if (n) n.id = '__leftNote'; }
      const rows = [...document.querySelectorAll('#aibillBody > .row')];
      const hi = rows.findIndex(x => /Past payments|지난 결제/.test(x.textContent));
      if (hi >= 0) { rows[hi].id = '__histHead'; if (rows[hi + 1]) rows[hi + 1].id = '__histRow'; }
    });
    mk = await callouts(pg, [{ sel: '#__rowA', num: 6, text: M.check, side: 'in', pad: 3 }]);
    await shotRegion(pg, 'p4-check', ['#aibillBody .aib-q', '#__grpA'], mk, { pad: 12 });
    await unmark(pg);
    mk = await callouts(pg, [{ sel: '#__grpB', num: 7, text: M.notyet, side: 'top', pad: 4 }]);
    await shotRegion(pg, 'p4-notyet', ['#__grpB'], mk, { pad: 12 });
    await unmark(pg);
    // 5) 금액 확인 · 결제하기
    mk = await callouts(pg, [{ sel: '#__paybar .aib-paysum', num: 8, text: M.sum, side: 'bottom', pad: 5 }, { sel: '#__payBtn', num: 9, text: M.pay, side: 'top', pad: 4, dy: -8 }]);
    await shotRegion(pg, 'p5-pay', ['#__grpB', '#__paybar', '#__leftNote'], mk, { pad: 14 });
    await unmark(pg);
    // 6) 지난 결제 ✅
    mk = await callouts(pg, [{ sel: '#__histRow', num: 10, text: M.done, side: 'bottom', pad: 5 }]);
    await shotRegion(pg, 'p6-done', ['#__histHead', '#__histRow'], mk, { pad: 16 });
    await ctx.close(); }
  console.log('done', lang);
}
await browser.close();
