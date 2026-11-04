// AI 말하기 9차(2026-11-04 사장님 «PC 화면에 적합하게 지금보다 크게 해서 잘 보이게») — 진짜 크로미움으로 «큰 PC 화면» 을 잽니다.
// CI: .github/workflows/ai-speaking-browser.yml 이 이 파일도 돌립니다(PW_DIR). 손으로:  node test-harness/manual/ai-speaking-pc-scale-browser.mjs
//   (PW_DIR 을 주면 그 playwright 를, 없으면 전역 playwright 를 씁니다)
// 단계 숫자는 ai-speaking.html 의 CSS 에서 읽습니다(하니스에 베끼지 않음). 잰 것:
//   ① 창마다 실제로 걸린 배율(.wrap · 나가기 창)이 CSS 단계와 같은가 · 가로 넘침 없음 · JS 오류 없음
//   ② 1600px 이상: 본문 문서 높이(배율 1 기준)가 875px 이하(정적 하니스의 MEASURED_DOC_H 전제) · 카드 설명이 두 줄 이하
//      글꼴마다 줄바꿈이 다르다 — 넓은 글꼴(DejaVu Sans, CI 러너 기본)에서는 영어 설명이 두 줄이다. 그래서 영어는
//      «넓은 글꼴을 강제로 입힌 판» 도 함께 잰다(이 컨테이너 기본 Inter 로만 재면 한 줄이라 최악의 경우를 못 본다 — 첫 판이 그랬다).
//   ③ 배율이 걸리면: 세로 스크롤 없이 «확인» 까지 한 화면 · 본문이 창 폭의 80% 안
//   ④ (짝) 노트북(1366·1440·1536)·휴대폰은 예전 그대로(배율 1 · 본문 1120px 이하)
//   ⑤ 사장님 창(2400×1149 = 1920 모니터를 80% 로): 카드가 노트북보다 40% 이상 크다
//   ⑥ 나가기 창도 같은 배율 · 화면 안 · 버튼이 맨 위 · 글이 아주 길어도 화면을 넘지 않고 창 안에서 스크롤(zoom 이 vh 에도 곱해지므로)
//   ⑦ 상황 목록을 펼쳐도 가로 넘침 없음 · 3칸
//   ⑧ 8차 «사용 안내» 버튼이 확대된 안내줄 안에 보이고, 연 창이 화면 안(창은 배율을 받지 않음)
// 변이시험(2026-11-04, 이 검사 / 정적 하니스 ai_speaking_entry_harness 9차 절) — 전부 실제 FAIL:
//   (첫 판) zoom 줄 제거 · max-height 를 배율로 안 나눔 · 1.3 단계 높이를 1000 으로 · 1280px 본문 제거 · 1.1 단계를 맨 뒤로(순서 뒤집기) ·
//   1280px 본문을 1300px 부터(노트북까지). (main 의 7·8차를 병합한 뒤 다시) 1600px 세로 여백 축소 전부 되돌림 76건/FAIL(정적은 통과 —
//   높이 상수를 쓰므로 이 검사가 잡는 몫) · max-height 미보정 2건/FAIL · zoom 줄 제거 45건/FAIL.
//   «1.3 단계를 폭 1700 부터» 는 이 검사의 창 목록에 해당 창이 없어 통과하고 정적 하니스(창 크기 격자 전수)만 잡는다.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = process.env.PW_DIR ? require(process.env.PW_DIR + '/node_modules/playwright') : require('playwright');
const root = path.resolve('cloudflare-deploy/public');
const html = fs.readFileSync(path.join(root, 'ai-speaking.html'), 'utf8');
const tiers = [...html.matchAll(/@media \(min-width:(\d+)px\) and \(min-height:(\d+)px\)\{:root\{--z:([\d.]+)\}\}/g)].map(m => ({ w: +m[1], h: +m[2], z: +m[3] }));
const wide = html.match(/@media \(min-width:(\d+)px\)\{\.wrap\{max-width:(\d+)px;/);
const eff = (W, H) => { let z = 1; for (const t of tiers) if (W >= t.w && H >= t.h) z = t.z; return z; };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":false}'); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  if (/\/(index|warmup|ai-friend)\.html$/.test(file)) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>stub</title>'); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
let n = 0; const fails = [];
const ok = (v, m) => { n++; if (!v) { fails.push(m); console.log('✗ ' + m); } };
const SAVED = { mangoi_warmup_level: '5', mangoi_aifriend_level: 'S5', mangoi_warmup_correction: 'balanced', mangoi_aifriend_correction: 'balanced' };
const WIDE_FONT = "body{font-family:MangoiHanSC,'DejaVu Sans',sans-serif!important}";
async function open(width, height, lang, seed, wideFont = false) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route('**/*', r => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
  await ctx.addInitScript(({ lang, seed }) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear(); localStorage.setItem('mangoi_lang', lang);
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, { lang, seed });
  const page = await ctx.newPage(); page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/ai-speaking.html');
  if (wideFont) await page.addStyleTag({ content: WIDE_FONT });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return { ctx, page, errors };
}
const measure = page => page.evaluate(() => {
  const wrap = document.querySelector('.wrap'), r = wrap.getBoundingClientRect(), z = Number(getComputedStyle(wrap).zoom) || 1;
  const ok = document.getElementById('setOk').getBoundingClientRect();
  const lines = [...document.querySelectorAll('.mode p')].map(p => { const lh = parseFloat(getComputedStyle(p).lineHeight); return Math.round(p.getBoundingClientRect().height / (lh * z)); });
  return { z, boxZ: Number(getComputedStyle(document.querySelector('.leave-box')).zoom) || 1, wrapW: r.width, wrapH: r.height,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight,
    okBottom: ok.bottom, cardW: document.querySelector('.mode').getBoundingClientRect().width, lines };
});

try {
  ok(tiers.length >= 5 && !!wide, 'premise: read ' + tiers.length + ' tiers and the wide-body rule from ai-speaking.html');
  const W0 = wide ? +wide[1] : 1600, M = wide ? +wide[2] : 1280;
  const windows = [[390, 844], [1366, 657], [1440, 900], [1536, 730], [1600, 780], [1760, 965], [1920, 919], [1920, 1080], [2133, 1021], [2400, 1149], [2560, 1300], [3200, 1750], [3840, 2100]];
  const cardAt = {};
  for (const [W, H] of windows) for (const lang of ['ko', 'en', 'en-wide']) for (const store of ['empty', 'saved']) {
    const tag = `${W}x${H}/${lang}/${store}`;
    const s = await open(W, H, lang === 'en-wide' ? 'en' : lang, store === 'saved' ? SAVED : {}, lang === 'en-wide');
    try {
      const m = await measure(s.page), z = eff(W, H);
      ok(Math.abs(m.z - z) < 1e-6 && Math.abs(m.boxZ - z) < 1e-6, tag + ' ① zoom on page and dialog = CSS tier ' + z + ' (got ' + m.z + ' / ' + m.boxZ + ')');
      ok(m.docW <= m.iw + 1, tag + ' ① no horizontal overflow (' + m.docW + ' > ' + m.iw + ')');
      ok(s.errors.length === 0, tag + ' ① no JS errors: ' + s.errors.join(';'));
      if (W >= W0) {
        ok(m.wrapH / m.z <= 875, tag + ' ② page height at zoom 1 is ≤ 875 (tier rule premise) — ' + (m.wrapH / m.z).toFixed(1));
        ok(m.lines.every(l => l >= 1 && l <= 2), tag + ' ② every card description is at most two lines — ' + m.lines.join(','));
      }
      if (z > 1) {
        ok(m.docH <= m.ih && m.okBottom <= m.ih, tag + ' ③ no vertical scroll; «확인» is on the first screen — doc ' + m.docH + ', ok ' + m.okBottom.toFixed(0) + ', window ' + m.ih);
        ok(m.wrapW <= W * 0.8 + 1, tag + ' ③ body stays within 80% of the window — ' + m.wrapW.toFixed(0) + '/' + W);
      }
      if (W < W0) ok(m.z === 1 && m.wrapW <= 1120 + 0.5, tag + ' ④ laptop/phone unchanged — zoom ' + m.z + ', body ' + m.wrapW.toFixed(0));
      if (lang === 'ko' && store === 'empty') cardAt[W + 'x' + H] = m.cardW;
    } catch (e) { ok(false, tag + ' threw: ' + String(e.message).split('\n')[0]); }
    finally { await s.ctx.close(); }
  }
  ok(cardAt['2400x1149'] >= cardAt['1536x730'] * 1.4, '⑤ owner window: card ' + (cardAt['2400x1149'] || 0).toFixed(0) + 'px vs laptop ' + (cardAt['1536x730'] || 0).toFixed(0) + 'px (≥ ×1.4)');

  // ⑥ 나가기 창 — 사장님 창에서
  for (const lang of ['ko', 'en']) {
    const tag = '2400x1149/' + lang + ' ⑥';
    const s = await open(2400, 1149, lang, SAVED);
    try {
      const z = eff(2400, 1149);
      // 7차(시작 링크 자동 적용) 이후 연습 시작 링크는 묻지 않고 간다 — 묻는 창은 «홈(←)» 처럼 연습을 안 하고 나가는 링크에서 뜬다
      await s.page.selectOption('#setLevel', '3'); await s.page.click('[data-corr="focused"]'); await s.page.click('a.home');
      ok(await s.page.evaluate(() => !document.getElementById('leaveAsk').hidden), tag + ' dialog opens');
      const d = await s.page.evaluate(() => {
        const w = document.querySelector('.wrap'), had = w.hasAttribute('inert'); w.removeAttribute('inert');
        const box = document.querySelector('.leave-box'), b = box.getBoundingClientRect();
        const btns = ['leaveGo', 'leaveSkip', 'leaveStay'].map(id => document.getElementById(id)).filter(x => !x.hidden);
        const top = btns.every(x => { const r = x.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === x || x.contains(e); });
        if (had) w.setAttribute('inert', '');
        return { w: b.width, top: b.top, bottom: b.bottom, left: b.left, right: b.right, ih: innerHeight, iw: innerWidth, btnTop: top, z: Number(getComputedStyle(box).zoom) };
      });
      ok(d.z === z && d.w >= 420 * z - 1, tag + ' dialog is zoomed like the page — width ' + d.w.toFixed(0) + ', zoom ' + d.z);
      ok(d.top >= 0 && d.left >= 0 && d.bottom <= d.ih && d.right <= d.iw && d.btnTop, tag + ' dialog inside the screen and every button on top — ' + JSON.stringify(d));
      // 글이 아주 길면 창 높이 상한이 걸려야 한다 — zoom 이 vh 에도 곱해지므로 «배율로 나누기» 가 없으면 화면 밖으로 넘친다
      const t = await s.page.evaluate(() => {
        document.getElementById('leaveBody').textContent = 'long text '.repeat(900);
        const box = document.querySelector('.leave-box'), b = box.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, ih: innerHeight, scrolls: box.scrollHeight > box.clientHeight + 1 };
      });
      ok(t.top >= 0 && t.bottom <= t.ih + 1 && t.scrolls, tag + ' very long text: dialog stays on screen and scrolls inside — ' + JSON.stringify(t));
      ok(s.errors.length === 0, tag + ' no JS errors: ' + s.errors.join(';'));
    } catch (e) { ok(false, tag + ' threw: ' + String(e.message).split('\n')[0]); }
    finally { await s.ctx.close(); }
  }

  // ⑦ 상황 목록 펼치기 — 사장님 창에서
  {
    const s = await open(2400, 1149, 'ko', SAVED);
    try {
      await s.page.click('#situation-mode');
      const r = await s.page.evaluate(() => ({ shown: !document.getElementById('situations').hidden, items: document.querySelectorAll('.sit').length,
        cols: getComputedStyle(document.querySelector('.sit-list')).gridTemplateColumns.split(' ').length, docW: document.documentElement.scrollWidth, iw: innerWidth }));
      ok(r.shown && r.items >= 3 && r.cols === 3 && r.docW <= r.iw + 1, '2400x1149 ⑦ situation list opens, 3 columns, no horizontal overflow — ' + JSON.stringify(r));
      ok(s.errors.length === 0, '2400x1149 ⑦ no JS errors: ' + s.errors.join(';'));
    } catch (e) { ok(false, '2400x1149 ⑦ threw: ' + String(e.message).split('\n')[0]); }
    finally { await s.ctx.close(); }
  }

  // ⑧ 8차 «사용 안내» — 확대된 화면에서 버튼이 보이고(안내줄 안) 눌러 연 창이 화면 안. 창은 .wrap 밖이라 배율을 받지 않는다(안내서 자체 화면)
  for (const lang of ['ko', 'en']) {
    const tag = '2400x1149/' + lang + ' ⑧';
    const s = await open(2400, 1149, lang, SAVED);
    try {
      const b = await s.page.evaluate(() => { const r = document.getElementById('guideBtn').getBoundingClientRect(), l = document.querySelector('.lead').getBoundingClientRect();
        return { inLead: r.top >= l.top - 0.5 && r.bottom <= l.bottom + 0.5, onScreen: r.right <= innerWidth && r.bottom <= innerHeight && r.width > 0 }; });
      ok(b.inLead && b.onScreen, tag + ' guide button sits in the lead row, on screen — ' + JSON.stringify(b));
      await s.page.click('#guideBtn');
      const d = await s.page.evaluate(() => { const g = document.getElementById('guideDlg'), r = g.getBoundingClientRect();
        return { open: g.open, inside: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1, zoom: Number(getComputedStyle(g).zoom) || 1 }; });
      ok(d.open && d.inside && d.zoom === 1, tag + ' guide dialog opens inside the screen (not zoomed) — ' + JSON.stringify(d));
      ok(s.errors.length === 0, tag + ' no JS errors: ' + s.errors.join(';'));
    } catch (e) { ok(false, tag + ' threw: ' + String(e.message).split('\n')[0]); }
    finally { await s.ctx.close(); }
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }

console.log(JSON.stringify({ suite: 'AI speaking big PC screens (9차)', tiers: tiers.map(t => t.z).join(','), checks: n, failed: fails.length }, null, 2));
process.exitCode = fails.length ? 1 : 0;
