// 🔊 A.i영화더빙 «사용방법» 음성 안내 — 브라우저 실측 (2026-10-26)
//   요청(사장님): 안내를 «클릭하면 바로 들리게» · «끄기» 버튼
//   폰 390 · PC 1280 × 한/영 마다 (⚠️ 자동재생 정책은 «기본값» 그대로 — 진짜로 «사람이 누른 클릭» 으로 소리가 나는가를 잰다):
//     저절로 열림=소리 0 · ‘🔊 소리로 듣기’ 버튼이 창 아래 줄에 보이고 눌림 · 누르면 실제로 재생(시간이 흐름) · 다시 누르면 멈춤
//     ✕ 로 닫으면 꺼짐 · ‘❓ 사용방법’ 클릭 = 바로 소리 · ‘시작하기’ = 이어 듣기 + 화면 아래 «끄기» 막대(화면 안·가리지 않음)
//     막대 «끄기» = 멈춤·막대 사라짐·포커스 ❓ · 창 안 🌐 = 그 장면 처음부터 다른 언어 · ‘👀 보기’(영상 재생) = 꺼짐
//     폰: 막대가 아래 고정 바(.mbar) 위 · 역할 시트가 열리면 위쪽(시트 버튼을 가리지 않음) · 가로 스크롤 0 · 페이지 오류 0
//   자동으로 안 돈다(manual/) — 사람이 부른다(리포 루트에서): node test-harness/manual/ai-dubbing-guide-voice-browser.mjs
//   정적 서버(Range 지원)를 스스로 띄운다. SHOT=<폴더> 를 주면 화면을 찍어 둔다.
//   ⚠️ 이것은 «헤드리스 Chromium + 폰 흉내» 다. 진짜 iPhone Safari·안드로이드 기기에서 «들리는지» 는 사람이 확인한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, '..', '..', 'cloudflare-deploy', 'public');
const SHOT = process.env.SHOT || '';
function loadChromium() {
  const roots = [process.env.PW_DIR && process.env.PW_DIR + '/node_modules/', import.meta.url, '/opt/node-tools/node_modules/'].filter(Boolean);
  for (const r of roots) for (const m of ['playwright', 'playwright-core']) { try { return createRequire(r)(m).chromium; } catch (e) {} }
  try { return createRequire(process.cwd() + '/')('playwright').chromium; } catch (e) {}
  throw new Error('playwright 를 찾지 못했습니다 — PW_DIR 을 지정하세요');
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const p = decodeURIComponent(u.pathname);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":false}'); }
  const f = path.join(PUB, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, type = TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 });
    return fs.createReadStream(f, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const B = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? ' — ' + JSON.stringify(x).slice(0, 240) : '')); } };
async function guard(tag, fn) { try { await fn(); } catch (e) { fail++; fails.push(tag + ' 예외: ' + String(e && e.message || e).slice(0, 300)); } }

/* 안내 음성 요소를 붙잡고, 그 밖의 재생·마이크를 센다 */
function probe() {
  window.__calls = { voice: 0, play: 0, gum: 0 };
  const P = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (/\/audio\/dubbing-guide\//.test(String(this.currentSrc || this.src || ''))) { window.__calls.voice++; window.__voiceEl = this; } else window.__calls.play++;
    return P.apply(this, arguments);
  };
  try { const md = navigator.mediaDevices; if (md && md.getUserMedia) { const g = md.getUserMedia.bind(md); md.getUserMedia = function (c) { window.__calls.gum++; return g(c); }; } } catch (e) {}
}
const vs = (p) => p.evaluate(() => {
  const v = window.__voiceEl, ov = document.getElementById('dub-guide'), vb = ov && ov.querySelector('.dg-voice'), bar = document.getElementById('dub-voice-bar');
  const r = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom, w: x.width, h: x.height }; };
  const hit = (e) => { if (!e) return false; const x = e.getBoundingClientRect(); if (!x.width) return false; const t = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2); return t === e || e.contains(t); };
  const barShown = !!bar && !bar.hidden && getComputedStyle(bar).display !== 'none';
  const offBtn = bar && bar.querySelector('button');
  return {
    open: !!ov && !ov.hidden, state: window.MangoiDubVoice && window.MangoiDubVoice.state(), calls: window.__calls,
    paused: v ? v.paused : null, t: v ? v.currentTime : null, src: v ? (v.currentSrc || v.src) : '',
    vbText: vb && vb.textContent, vbRect: r(vb), vbHit: hit(vb), boxRect: r(ov && ov.querySelector('.dg-box')),
    barShown, barText: bar && bar.textContent, barRect: barShown ? r(bar) : null, barHit: barShown && hit(offBtn),
    mbar: (() => { const m = document.querySelector('.mbar'); return m && getComputedStyle(m).display !== 'none' ? r(m) : null; })(),
    startBtn: (() => { const s = document.getElementById('dub-start'); return s && s.offsetParent ? { rect: r(s), hit: hit(s) } : null; })(),
    sheet: document.body.classList.contains('dub-sheet-open'),
    sheetHead: r(document.querySelector('#dub-side .sheet-head')),
    chrome: ['.mangoi-back-btn', '.mangoi-global-home', '.mangoi-global-lang-toggle'].map(q => { const e = document.querySelector(q); return { q, there: !!(e && e.getBoundingClientRect().width), hit: hit(e) }; }),
    active: document.activeElement && (document.activeElement.id || document.activeElement.className),
    hscroll: document.documentElement.scrollWidth > innerWidth + 1, vw: innerWidth, vh: innerHeight
  };
});
async function waitState(p, want, ms = 8000) {
  await p.waitForFunction((w) => window.MangoiDubVoice && window.MangoiDubVoice.state() === w, want, { timeout: ms }).catch(() => {});
  return vs(p);
}
async function flows(p, ms = 1500) { const a = (await vs(p)).t; await p.waitForTimeout(ms); const b = (await vs(p)).t; return { a, b, flowing: b - a > ms / 1000 * 0.4 }; }
const shot = async (p, name) => { if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await p.screenshot({ path: path.join(SHOT, name + '.png') }); } };

const chromium = loadChromium();
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });   // 자동재생 정책은 기본값
const TXT = { ko: { listen: '듣기', off: '끄기', now: '음성 안내 중' }, en: { listen: 'Listen', off: 'Sound off', now: 'Voice guide' } };

for (const [vname, vp, mobile] of [['폰 390', { width: 390, height: 844 }, true], ['PC 1280', { width: 1280, height: 800 }, false]]) for (const lang of ['ko', 'en']) await guard(`[${vname}·${lang}]`, async () => {
  const tag = `[${vname}·${lang}]`, X = TXT[lang], errs = [];
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', hasTouch: mobile, isMobile: mobile, permissions: ['microphone'] });
  await ctx.addInitScript(probe);
  await ctx.addInitScript((l) => { try { if (!localStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('__init', '1'); localStorage.setItem('mangoi_lang', l); } } catch (e) {} }, lang);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(B + '/ai-dubbing.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  let s = await vs(p);
  ok(`${tag} 저절로 열린다(전제)`, s.open);
  ok(`${tag} 저절로 열릴 때 소리 0(play 0)`, s.calls.voice === 0 && s.state === 'idle', s.calls);
  ok(`${tag} 창 아래 줄에 ‘🔊 소리로 듣기’`, s.vbText && s.vbText.includes(X.listen) && s.vbText.includes('🔊'), s.vbText);
  ok(`${tag} 그 버튼이 창 안·맨 위에 있고 눌린다`, s.vbHit && s.vbRect.l >= s.boxRect.l && s.vbRect.r <= s.boxRect.r + 0.5 && s.vbRect.b <= s.boxRect.b + 0.5, s.vbRect);
  ok(`${tag} 손가락 칸 44px 이상`, s.vbRect && s.vbRect.h >= 43.5, s.vbRect);
  await shot(p, `${vname}-${lang}-1-auto`);
  await p.click('#dub-guide .dg-voice');
  s = await waitState(p, 'playing');
  ok(`${tag} ‘소리로 듣기’ 를 누르면 바로 재생된다`, s.state === 'playing' && s.paused === false && s.calls.voice === 1, s);
  ok(`${tag} 그 언어 음원(guide-${lang}.mp3)`, s.src.includes(`/audio/dubbing-guide/guide-${lang}.mp3?v=`), s.src);
  const fl = await flows(p);
  ok(`${tag} 실제로 시간이 흐른다(소리가 나는 중)`, fl.flowing, fl);
  s = await vs(p);
  ok(`${tag} 버튼 글이 ‘■ 소리 끄기’`, s.vbText && s.vbText.includes(X.off), s.vbText);
  ok(`${tag} 창이 열려 있으면 아래 막대는 숨는다`, !s.barShown);
  await shot(p, `${vname}-${lang}-2-playing`);
  await p.click('#dub-guide .dg-voice'); s = await vs(p);
  ok(`${tag} 다시 누르면 멈춘다`, s.state === 'idle' && s.paused === true && s.vbText.includes(X.listen), s);
  await p.click('#dub-guide .dg-voice'); s = await waitState(p, 'playing');
  await p.click('#dub-guide .dg-x'); s = await vs(p);
  ok(`${tag} ✕ 로 닫으면 소리도 꺼진다`, !s.open && s.state === 'idle' && s.paused === true && !s.barShown, s);
  await p.click('#dub-guide-open'); s = await waitState(p, 'playing');
  ok(`${tag} ‘❓ 사용방법’ 을 누르면 바로 소리가 난다`, s.open && s.state === 'playing' && s.paused === false, s);
  await p.click('#dub-guide .dg-tab[data-step="2"]'); await p.click('#dub-guide .dg-next'); await p.waitForTimeout(250); s = await vs(p);
  ok(`${tag} ‘시작하기’ 로 닫으면 소리가 이어진다`, !s.open && s.state === 'playing' && s.paused === false, s);
  ok(`${tag} 화면 아래 «끄기» 막대가 보인다`, s.barShown && s.barText.includes(X.now) && /\d+\/11/.test(s.barText), s.barText);
  ok(`${tag} 막대는 화면 안`, s.barRect && s.barRect.l >= 0 && s.barRect.r <= s.vw + 0.5 && s.barRect.b <= s.vh + 0.5 && s.barRect.t >= 0, s.barRect);
  ok(`${tag} 막대의 «끄기» 가 맨 위에 있고 눌린다`, s.barHit);
  if (s.mbar) ok(`${tag} 폰: 막대가 아래 고정 바(.mbar) 를 가리지 않는다`, s.barRect.b <= s.mbar.t + 0.5, { bar: s.barRect, mbar: s.mbar });
  ok(`${tag} 막대가 있어도 가로 스크롤 0`, !s.hscroll);
  await shot(p, `${vname}-${lang}-3-bar`);
  await p.click('#dub-voice-bar button'); s = await vs(p);
  ok(`${tag} 막대 «끄기» → 멈춤 · 막대 사라짐`, s.state === 'idle' && s.paused === true && !s.barShown, s);
  ok(`${tag} 포커스는 ‘❓ 사용방법’ 으로`, s.active === 'dub-guide-open', s.active);
  // 창 안 🌐 — 그 장면 처음부터 다른 언어
  await p.click('#dub-guide-open'); s = await waitState(p, 'playing');
  const offs = await p.evaluate(() => window.MangoiDubVoice.OFFSETS);
  const other = lang === 'ko' ? 'en' : 'ko';
  await p.evaluate((t) => { window.__voiceEl.currentTime = t; }, offs[lang][3] + 2);
  await p.waitForTimeout(400);
  await p.click('#dub-guide .dg-lang'); await p.waitForTimeout(150);
  s = await waitState(p, 'playing');
  await p.waitForTimeout(600); s = await vs(p);
  ok(`${tag} 🌐 로 바꾸면 ${other} 음원으로 이어진다`, s.state === 'playing' && s.src.includes(`guide-${other}.mp3`), s.src);
  ok(`${tag} 그 장면(4번째) 처음 자리에서`, s.t >= offs[other][3] - 0.2 && s.t <= offs[other][3] + 2.5, { t: s.t, want: offs[other][3] });
  await p.click('#dub-guide .dg-lang'); await p.waitForTimeout(500);
  // ‘👀 보기’(영상 재생) → 꺼짐
  await p.click('#dub-guide .dg-tab[data-step="2"]'); await p.click('#dub-guide .dg-next'); await p.waitForTimeout(250);
  s = await vs(p);
  ok(`${tag} (전제) 시작하기 뒤 소리가 나는 중`, s.state === 'playing' || s.state === 'loading', s.state);
  await p.evaluate(() => document.querySelector('#dub-scenes .scene:nth-child(2) [data-watch]').scrollIntoView({ block: 'center' }));
  const before = s.calls.play;
  await p.click('#dub-scenes .scene:nth-child(2) [data-watch]').catch(() => {});
  await p.waitForFunction((b) => window.__calls.play > b, before, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300); s = await vs(p);
  ok(`${tag} ‘👀 보기’ 로 영상이 재생되면 안내 소리는 꺼진다`, s.calls.play > before && s.state === 'idle' && s.paused === true, s);
  ok(`${tag} 안내 음성 때문에 마이크를 묻지 않는다`, s.calls.gum === 0, s.calls);
  ok(`${tag} 페이지 오류 0`, errs.length === 0, errs);
  await ctx.close();
});

// 폰 — 역할 고르기 시트가 열리면 막대는 «■ 끄기» 만 남겨 맨 위 머리줄 빈자리로(시트·공용 칩을 가리지 않게)
for (const [w, h] of [[320, 568], [360, 740], [390, 844], [430, 932]]) for (const lang of ['ko', 'en']) await guard(`[폰·시트 ${w}·${lang}]`, async () => {
  const tag = `[폰·시트 ${w}·${lang}]`, errs = [];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', hasTouch: true, isMobile: true, permissions: ['microphone'] });
  await ctx.addInitScript(probe);
  await ctx.addInitScript((l) => { try { if (!localStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('__init', '1'); localStorage.setItem('mangoi_lang', l); } } catch (e) {} }, lang);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(B + '/ai-dubbing.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  await p.click('#dub-guide .dg-voice'); await waitState(p, 'playing');
  await p.click('#dub-guide .dg-tab[data-step="2"]'); await p.click('#dub-guide .dg-next'); await p.waitForTimeout(250);
  await p.click('#dub-quick-start'); await p.waitForTimeout(500);
  let s = await vs(p);
  ok(`${tag} 역할 시트가 열린다(전제)`, s.sheet, s.sheet);
  ok(`${tag} 시트가 열려도 소리는 이어진다(역할 고르는 법을 듣는다)`, s.state === 'playing', s.state);
  ok(`${tag} 막대가 맨 위 머리줄 안(56px)으로`, s.barShown && s.barRect.t >= 0 && s.barRect.b <= 56.5, s.barRect);
  ok(`${tag} 시트 머리(내 역할 고르기·닫기)를 안 가린다`, s.sheetHead && s.barRect.b <= s.sheetHead.t + 0.5, { bar: s.barRect, head: s.sheetHead });
  for (const c of s.chrome) if (c.there) ok(`${tag} 공용 버튼 ${c.q} 를 안 가린다`, c.hit, c);
  ok(`${tag} 막대 «끄기» 가 눌린다`, s.barHit);
  await p.evaluate(() => { const b = document.getElementById('dub-start'); if (b) b.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(200); s = await vs(p);
  ok(`${tag} ‘내 목소리로 녹음 시작’ 이 막대에 안 가린다`, s.startBtn && s.startBtn.hit, s.startBtn);
  ok(`${tag} 가로 스크롤 0`, !s.hscroll);
  await shot(p, `폰-시트-${w}-${lang}`);
  await p.click('#dub-voice-bar button'); s = await vs(p);
  ok(`${tag} 막대 «끄기» → 멈춤`, s.state === 'idle' && s.paused === true && !s.barShown, s.state);
  ok(`${tag} 페이지 오류 0`, errs.length === 0, errs);
  await ctx.close();
});

await browser.close();
server.close();
console.log('═'.repeat(66));
console.log('  🔊 ai-dubbing-guide-voice 브라우저 실측 (헤드리스 Chromium · 자동재생 기본 정책)');
console.log('═'.repeat(66));
fails.forEach(f => console.log('  ❌ ' + f));
console.log(`  통과 ${pass} / ${pass + fail}`);
console.log(fail ? `  결과: ${fail} FAIL` : '  결과: 전부 통과');
process.exit(fail ? 1 : 0);
