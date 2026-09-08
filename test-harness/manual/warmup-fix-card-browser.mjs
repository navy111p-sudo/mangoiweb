// -*- coding: utf-8 -*-
/*!
 * ✏️ 웜업 «교정 카드» 브라우저 검사 (2026-09-08) — 자동으로 안 돕니다, 사람이 부릅니다.
 *
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   PW_DIR=/tmp/pw node test-harness/manual/warmup-fix-card-browser.mjs
 *
 * 왜 필요한가: 문자열 하니스는 «무슨 글자가 어디에 그려졌나» 를 못 봅니다.
 *   이 화면의 결함은 그 축에만 있습니다 — 카드가 화면 밖으로 밀리거나, 좁은 폰에서
 *   문장이 낱글자로 쪼개지거나, 버튼이 다른 것에 덮이거나, 글자가 안 읽히는 것.
 *
 * ⚠️ file:// 로 열면 안 됩니다 — <script src="/js/…"> 가 전부 404 라 화면이 통째로 죽습니다.
 *    그래서 public/ 을 HTTP 로 띄웁니다(CLAUDE.md 2장).
 * ⚠️ 폭은 360px 로 잽니다 — 큰 폰에서는 «화면 밖으로 밀림» 이 재현되지 않습니다.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8901 + (process.pid % 90);          // 매 실행 다른 포트 = 옛 사본을 안 집는다
const { chromium, exe } = requireBrowser();

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? ' — ' + extra : '')); }
};

const FIX = { was: 'I go to school yesterday', now: 'I went to school yesterday',
              why_ko: '어제 있었던 일이라 go 가 아니라 went 를 써요', tag: 'past_tense', severity: 'major' };

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
                  { cwd: PUB, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
// ⚠️ 서비스워커를 막지 않으면 «고치기 전» 사본이 나와 변이시험이 조용히 통과합니다(CLAUDE.md 2장)
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

// ⚠️ route 는 «나중에 등록한 것» 이 이깁니다 — 포괄을 먼저, 구체적인 것을 뒤에(CLAUDE.md 2장)
let sendFix = true;
await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await ctx.route('**/api/voice/tts', (r) => r.fulfill({ status: 503, body: '' }));   // TTS 는 이 검사의 대상이 아니다
await ctx.route('**/api/warmup/chat', (r) => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ session_id: 's', turn_count: 3, ai_response: 'Oh, you went to school yesterday! What did you do there?',
                         answer_chips: [], fix: sendFix ? FIX : null, repeat: sendFix }),
}));

console.log('════════ ✏️ 웜업 교정 카드 — 브라우저 ════════\n360×640 (작은 폰)');
await page.goto(`http://127.0.0.1:${PORT}/warmup.html?setup=0&_nc=${Date.now()}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const say = async (text) => {
  await page.fill('#inp', text);
  await page.click('#sendBtn');
  await page.waitForTimeout(700);
};
await say('I go to school yesterday');

// ── ① 카드가 실제로 그려지고 «보이는가» ──
const seen = await page.evaluate(() => {
  const c = document.querySelector('.fix-card');
  if (!c) return { ok: false };
  const r = c.getBoundingClientRect();
  return { ok: true, visible: !!c.offsetParent, top: r.top, bottom: r.bottom, ih: innerHeight,
           now: (document.querySelector('.fix-now') || {}).textContent || '',
           was: (document.querySelector('.fix-was') || {}).textContent || '' };
});
check('①-1 교정 카드가 그려졌다', seen.ok && seen.visible);
check('①-2 고친 문장이 «그대로» 나온다 (코드가 문장을 지어내지 않는다)', seen.now === FIX.now, seen.now);
check('①-3 학생이 말한 문장도 함께 보인다', seen.was === FIX.was, seen.was);
check('①-4 카드가 화면 «안» 에 있다 (열렸다 ≠ 보인다)', seen.ok && seen.top < seen.ih,
      'top=' + Math.round(seen.top || 0) + ' / 화면 ' + seen.ih);

// ── ② 낱글자로 쪼개지지 않는가 (flex 함정) ──
const lines = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.fix-card .fix-line, .fix-card .fix-why, .fix-card .fix-title')) {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    out.push({ cls: el.className, rows: el.getBoundingClientRect().height / lh, display: cs.display, w: el.getBoundingClientRect().width });
  }
  return out;
});
const worst = lines.reduce((a, b) => (b.rows > a.rows ? b : a), { rows: 0, cls: '-' });
check('②-1 문장이 낱글자로 쪼개지지 않았다 (한 칸이 3줄 미만)', worst.rows < 3,
      worst.cls + ' 이 ' + worst.rows.toFixed(1) + '줄');
check('②-2 문장 줄에 display:flex 를 쓰지 않았다', lines.every((l) => !/fix-line/.test(l.cls) || l.display !== 'flex'));

// ── ③ 버튼이 «눌리는가» (보인다 ≠ 눌린다) ──
const btns = await page.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('.fix-card .fix-btn')) {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    out.push({ label: b.textContent, w: r.width, h: r.height, mine: !!(top && b.contains(top)) });
  }
  return out;
});
check('③-1 「들어보기」·「따라 말해 보기」 두 버튼이 있다', btns.length === 2, JSON.stringify(btns.map((b) => b.label)));
check('③-2 두 버튼 다 맨 위에 있다 (다른 것이 덮지 않는다)', btns.length > 0 && btns.every((b) => b.mine));
check('③-3 손가락으로 누를 만한 크기다 (높이 ≥ 32px)', btns.length > 0 && btns.every((b) => b.h >= 32),
      JSON.stringify(btns.map((b) => Math.round(b.h))));

// ── ④ 글자가 읽히는가 — 반투명 층을 «합성해서» 잰다(CLAUDE.md 2장) ──
const contrast = await page.evaluate(() => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      let c = parse(cs.backgroundColor);
      // 그라데이션이면 backgroundColor 가 투명이라 층이 통째로 건너뛰어진다 → 첫 색을 쓴다
      if ((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') {
        const m = /rgba?\([^)]+\)/.exec(cs.backgroundImage); if (m) c = parse(m[0]);
      }
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let out = { r: 255, g: 255, b: 255 };
    for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i];
      out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) }; }
    return out;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const out = [];
  for (const sel of ['.fix-now', '.fix-was', '.fix-why', '.fix-title']) {
    const el = document.querySelector(sel); if (!el) continue;
    const fg = parse(getComputedStyle(el).color); const bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg);
    out.push({ sel, ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) });
  }
  return out;
});
for (const c of contrast) check('④ ' + c.sel + ' 이 읽힌다 (대비 ≥ 4.5)', c.ratio >= 4.5, c.ratio.toFixed(2) + ':1');

// ── ⑤ 가로로 안 밀리는가 ──
const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
check('⑤ 문서가 가로로 안 밀린다', overflow.sw <= overflow.iw + 1, overflow.sw + ' > ' + overflow.iw);

// ── ⑥ 「교정 없음」이면 아무것도 안 그린다 + 앞 카드는 걷는다 ──
sendFix = false;
await say('I am happy today');
const after = await page.evaluate(() => document.querySelectorAll('.fix-card').length);
check('⑥ 서버가 «교정 없음» 이면 카드가 사라진다 (같은 카드가 두 벌 쌓이지 않는다)', after === 0, '남은 카드 ' + after + '개');

await browser.close(); srv.kill();
console.log('\n──────── 결과: PASS ' + pass + ' · FAIL ' + fail + ' ────────');
process.exit(fail ? 1 : 0);
