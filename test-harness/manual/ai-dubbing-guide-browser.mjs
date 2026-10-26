// ❓ A.i영화더빙 «사용방법» 안내창 — 브라우저 실측 (2026-10-26)
//   폰·태블릿·PC 5가지 화면 × 한/영 마다:
//     저절로 열림 · 맨 위에 있고 눌림 · 그림이 실제로 그려짐 · 화면 안에 들어옴 · 가로 스크롤 없음 · 손가락 크기
//     Tab 가두기 · 단계 넘기기/칩 · Esc · 포커스 되돌리기 · 같은 탭 새로 고침엔 안 뜸 · ‘❓ 사용방법’ 으로 다시 열림
//     ‘시작하기’(포커스만, 녹음·시트 안 열림) · 오늘은 다시 보지 않기(기기 날짜로 저장 · 새 탭에서도 안 뜸 · 버튼은 열림)
//     안내창이 마이크·영상·소리를 건드리지 않음(getUserMedia·play·AudioContext 0)
//   한 번씩: 저장소 막힘 · 날짜 바뀜(시계 조작, 서울·LA) · 주소(?ep·?resume·?library·잘못된 ep) · 빠른 연타 ·
//           열고 닫기 15회 · 폰 역할 시트와 Esc · 스크롤 자리 · 창 안 🌐 · 닫은 뒤 기존 더빙 흐름(녹음·보기)
//   자동으로 안 돈다(manual/) — 사람이 부른다(리포 루트에서):
//       node <Range 받는 정적 서버> cloudflare-deploy/public 8941
//       node test-harness/manual/ai-dubbing-guide-browser.mjs
//   ⚠️ 이것은 «헤드리스 Chromium + 폰 흉내» 다. 진짜 iPhone Safari·안드로이드 기기 확인은 따로 사람이 한다.
import { createRequire } from 'node:module';
const B = process.env.BASE || 'http://127.0.0.1:8941';
function loadChromium() {
  const roots = [process.env.PW_DIR && process.env.PW_DIR + '/node_modules/', import.meta.url, '/opt/node-tools/node_modules/'].filter(Boolean);
  for (const r of roots) for (const m of ['playwright', 'playwright-core']) { try { return createRequire(r)(m).chromium; } catch (e) {} }
  throw new Error('playwright 를 찾지 못했습니다 — PW_DIR 을 지정하세요');
}
const chromium = loadChromium();
let pass = 0, fail = 0;
const fails = [];
const ok = (n, c, x) => { if (c) pass++; else { fail++; fails.push(n + (x !== undefined ? ' — ' + JSON.stringify(x).slice(0, 200) : '')); } };

const SEEN = 'mangoi_dub_guide_seen_v1', HIDE = 'mangoi_dub_guide_hide_v1';
const TEXT = { ko: { title: '세 단계만 따라 해요', start: '시작하기 🎬', next: '다음 ▶', heading: '짧은 한 장면으로 시작해요' }, en: { title: 'Just follow three steps', start: 'Let’s start 🎬', next: 'Next ▶', heading: 'Start with one short scene' } };
const VIEWS = [
  ['폰 360', { width: 360, height: 740 }, true], ['폰 390', { width: 390, height: 844 }, true], ['태블릿 768', { width: 768, height: 1024 }, true],
  ['PC 1280', { width: 1280, height: 800 }, false], ['PC 1920', { width: 1920, height: 1080 }, false]];

/* 마이크·영상·소리 호출을 센다 — 안내창은 0 이어야 한다 */
function probe() {
  window.__calls = { gum: 0, play: 0, ac: 0 };
  try { const md = navigator.mediaDevices; if (md && md.getUserMedia) { const g = md.getUserMedia.bind(md); md.getUserMedia = function (c) { window.__calls.gum++; return g(c); }; } } catch (e) {}
  try { const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__calls.play++; return p.apply(this, arguments); }; } catch (e) {}
  try { const A = window.AudioContext; if (A) { window.AudioContext = function () { window.__calls.ac++; return new A(...arguments); }; window.AudioContext.prototype = A.prototype; } } catch (e) {}
}
async function newPage(ctx, errs) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
  return p;
}
async function go(p, q = '') { await p.goto(B + '/ai-dubbing.html' + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(350); }
const st = (p) => p.evaluate(() => {
  const ov = document.getElementById('dub-guide');
  const open = !!ov && !ov.hidden && getComputedStyle(ov).display !== 'none';
  const box = ov && ov.querySelector('.dg-box'), nx = ov && ov.querySelector('.dg-next'), img = ov && ov.querySelector('.dg-pic');
  let top = false;
  if (open && nx) { const r = nx.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); top = t === nx || nx.contains(t); }
  const a = document.activeElement;
  const cur = ov && ov.querySelector('.dg-tab[aria-current="step"]');
  return { open, top, count: document.querySelectorAll('#dub-guide').length, title: ov && ov.querySelector('.dg-title').textContent, next: nx && nx.textContent,
    step: cur ? Number(cur.getAttribute('data-step')) : -1, prevDisabled: ov && ov.querySelector('.dg-prev').disabled,
    img: img && img.src, imgW: img && img.naturalWidth, imgDone: img && img.complete,
    focusIn: !!(box && a && box.contains(a)), active: a && (a.id || a.className),
    modal: box && box.getAttribute('aria-modal') === 'true' && box.getAttribute('role') === 'dialog',
    labelled: !!(box && document.getElementById(box.getAttribute('aria-labelledby')) && document.getElementById(box.getAttribute('aria-labelledby')).textContent.trim()),
    fit: box ? (() => { const r = box.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; })() : false,
    hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    overflow: document.documentElement.style.overflow + '|' + document.body.style.overflow,
    sizes: ov ? Array.prototype.map.call(ov.querySelectorAll('button'), b => { const r = b.getBoundingClientRect(); return b.offsetParent ? Math.min(r.width, r.height) : 99; }) : [],
    calls: window.__calls, sheet: !!document.querySelector('#dub-side.open'), scrollY: Math.round(scrollY) };
});
const imgReady = (p) => p.waitForFunction(() => { const i = document.querySelector('#dub-guide .dg-pic'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).then(() => true, () => false);

/* 시나리오 하나가 던져도(눌러야 할 것이 가려져 시간 초과 등) 전체가 멈추지 않고 «그 시나리오 FAIL» 로 남긴다 */
const contexts = [];
async function guard(name, fn) {
  try { await fn(); } catch (e) { ok(name + ' 시나리오가 중간에 멈춤', false, String(e && e.message || e).split('\n')[0]); }
  while (contexts.length) { const c = contexts.pop(); await c.close().catch(() => {}); }
}
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const newContext = browser.newContext.bind(browser);
browser.newContext = async (o) => { const c = await newContext(o); c.setDefaultTimeout(8000); contexts.push(c); return c; };

/* ── 화면 5가지 × 한/영 ─────────────────────────────────────────────── */
for (const [vname, vp, mobile] of VIEWS) for (const lang of ['ko', 'en']) await guard(`[${vname}·${lang}]`, async () => {
  const tag = `[${vname}·${lang}]`, X = TEXT[lang], errs = [];
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', hasTouch: mobile, isMobile: mobile && vp.width < 700, permissions: ['microphone'] });
  await ctx.addInitScript(probe);
  await ctx.addInitScript((l) => { try { if (!localStorage.getItem('__init')) { localStorage.clear(); localStorage.setItem('__init', '1'); localStorage.setItem('mangoi_lang', l); } } catch (e) {} }, lang);
  const p = await newPage(ctx, errs);
  await go(p);
  let s = await st(p);
  ok(`${tag} 처음 들어오면 저절로 열린다`, s.open, s);
  ok(`${tag} 맨 위에 있고 버튼이 눌린다(칩·드로어에 안 가림)`, s.top);
  ok(`${tag} 대화상자 표시(role=dialog·aria-modal·제목 연결)`, s.modal && s.labelled);
  ok(`${tag} 포커스가 창 안에 있다`, s.focusIn, s.active);
  ok(`${tag} 글이 고른 언어로 나온다`, s.title === X.title, s.title);
  ok(`${tag} 1단계 그림이 그 언어 그림으로 실제 그려진다`, await imgReady(p) && /1-pick-/.test(s.img) && s.img.includes('-' + lang + '.jpg'), s.img);
  ok(`${tag} 창이 화면 안에 다 들어온다`, s.fit);
  ok(`${tag} 페이지에 가로 스크롤이 없다`, !s.hscroll);
  ok(`${tag} 버튼이 모두 44px 이상`, s.sizes.length >= 8 && s.sizes.every(v => v >= 43.5), s.sizes);
  ok(`${tag} 열려 있는 동안 뒤 화면 스크롤이 잠긴다`, s.overflow === 'hidden|hidden', s.overflow);
  ok(`${tag} 첫 장에서 ‘이전’ 은 꺼져 있다`, s.prevDisabled === true);
  for (let i = 0; i < 14; i++) await p.keyboard.press('Tab');
  ok(`${tag} Tab 을 14번 눌러도 창 안에 머문다`, (await st(p)).focusIn);
  for (let i = 0; i < 14; i++) await p.keyboard.press('Shift+Tab');
  ok(`${tag} Shift+Tab 도 창 안에 머문다`, (await st(p)).focusIn);
  await p.click('#dub-guide .dg-next'); s = await st(p);
  ok(`${tag} ‘다음’ → 2단계, 그림도 바뀐다`, s.step === 1 && /2-follow-/.test(s.img) && await imgReady(p), s);
  await p.click('#dub-guide .dg-next'); s = await st(p);
  ok(`${tag} 3단계 마지막 버튼은 ‘시작하기’`, s.step === 2 && s.next === X.start, s.next);
  ok(`${tag} 3단계 그림이 그려진다`, /3-speak-/.test(s.img) && await imgReady(p));
  await p.click('#dub-guide .dg-tab[data-step="0"]'); s = await st(p);
  ok(`${tag} 단계 칩 ①을 누르면 1단계로`, s.step === 0 && s.next === X.next);
  ok(`${tag} 여기까지 마이크·영상·소리 0`, s.calls.gum === 0 && s.calls.play === 0 && s.calls.ac === 0, s.calls);
  await p.keyboard.press('Escape'); s = await st(p);
  ok(`${tag} Esc 로 닫힌다`, !s.open);
  ok(`${tag} 닫으면 스크롤 잠금이 풀린다`, s.overflow === '|', s.overflow);
  ok(`${tag} 닫으면 포커스가 ‘❓ 사용방법’ 으로`, s.active === 'dub-guide-open', s.active);
  await go(p); s = await st(p);
  ok(`${tag} 같은 탭에서 새로 고침하면 다시 안 뜬다`, !s.open);
  await p.click('#dub-guide-open'); s = await st(p);
  ok(`${tag} ‘❓ 사용방법’ 으로 다시 열린다(1단계부터)`, s.open && s.step === 0 && s.focusIn, s);
  await p.click('#dub-guide .dg-x'); s = await st(p);
  ok(`${tag} ✕ 로 닫히고 포커스는 ‘❓ 사용방법’ 으로`, !s.open && s.active === 'dub-guide-open', s.active);
  await p.click('#dub-guide-open'); await p.click('#dub-guide .dg-tab[data-step="2"]'); await p.click('#dub-guide .dg-next'); await p.waitForTimeout(150); s = await st(p);
  ok(`${tag} ‘시작하기’ → 닫히고 ‘짧은 더빙 시작’ 에 포커스만`, !s.open && s.active === 'dub-quick-start', s.active);
  ok(`${tag} ‘시작하기’ 는 역할 시트·녹음을 열지 않는다`, !s.sheet && s.calls.gum === 0 && s.calls.play === 0, s);
  await p.click('#dub-guide-open'); await p.click('#dub-guide .dg-hide'); s = await st(p);
  const saved = await p.evaluate((k) => localStorage.getItem(k), HIDE);
  const today = await p.evaluate(() => { const d = new Date(), z = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); });
  ok(`${tag} ‘오늘은 다시 보지 않기’ → 닫히고 오늘 날짜(기기 시간대)로 저장`, !s.open && saved === today, { saved, today });
  const p2 = await newPage(ctx, errs); await go(p2); let s2 = await st(p2);
  ok(`${tag} 새 탭에서도 오늘은 안 뜬다`, !s2.open);
  await p2.click('#dub-guide-open'); s2 = await st(p2);
  ok(`${tag} 오늘 숨겨도 ‘❓ 사용방법’ 은 언제나 연다`, s2.open && s2.top);
  await p2.close();
  ok(`${tag} 페이지 오류 0`, errs.length === 0, errs);
  await ctx.close();
});

/* ── 한 번씩 ─────────────────────────────────────────────────────────── */
// 저장소가 막힌 기기(사생활 보호 모드·차단)
await guard('[저장 막힘]', async () => {
  const errs = [], ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    try { Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom; } catch (e) {}
  });
  const p = await newPage(ctx, errs); await go(p); let s = await st(p);
  ok('[저장 막힘] 그래도 저절로 열린다(보여 주는 쪽으로 실패)', s.open);
  await p.click('#dub-guide .dg-hide'); s = await st(p);
  ok('[저장 막힘] ‘오늘은 다시 보지 않기’ 가 던지지 않고 닫힌다', !s.open);
  await p.click('#dub-guide-open'); s = await st(p);
  ok('[저장 막힘] ‘❓ 사용방법’ 으로 다시 열린다', s.open);
  await p.keyboard.press('Escape');
  await go(p); s = await st(p);
  ok('[저장 막힘] 새로 들어오면 다시 보인다(기억할 곳이 없음 — 의도)', s.open);
  ok('[저장 막힘] 안내창 때문에 생긴 페이지 오류 0', !errs.some(e => /ai-dubbing-guide/.test(e)), errs);
  await ctx.close();
});
// 날짜가 바뀌면 다시 — 서울·LA 시계 조작
for (const tz of ['Asia/Seoul', 'America/Los_Angeles']) await guard('[날짜·' + tz + ']', async () => {
  const errs = [], ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', timezoneId: tz });
  const p = await newPage(ctx, errs);
  await p.clock.install({ time: localWall(tz, 2026, 10, 26, 23, 58) });   // 그 지역 밤 11시 58분
  await go(p); let s = await st(p);
  ok(`[날짜·${tz}] 밤 11:58 첫 접속에 열린다`, s.open);
  await p.click('#dub-guide .dg-hide');
  const saved = await p.evaluate((k) => localStorage.getItem(k), HIDE);
  ok(`[날짜·${tz}] 그 지역 날짜(2026-10-26)로 저장`, saved === '2026-10-26', saved);
  const p2 = await newPage(ctx, errs); await p2.clock.install({ time: localWall(tz, 2026, 10, 26, 23, 59) });
  await go(p2); s = await st(p2);
  ok(`[날짜·${tz}] 11:59 새 탭 — 아직 오늘이라 안 뜬다`, !s.open);
  await p2.close();
  const p3 = await newPage(ctx, errs); await p3.clock.install({ time: localWall(tz, 2026, 10, 27, 0, 1) });
  await go(p3); s = await st(p3);
  ok(`[날짜·${tz}] 자정 지나 00:01 새 탭 — 다시 열린다`, s.open);
  await p3.close();
  const p4 = await newPage(ctx, errs); await p4.clock.install({ time: localWall(tz, 2026, 10, 25, 9, 0) });
  await go(p4); s = await st(p4);
  ok(`[날짜·${tz}] 시계가 하루 뒤로 가도(10-25) 열린다(«오늘만» 숨김)`, s.open);
  await p4.close();
  ok(`[날짜·${tz}] 페이지 오류 0`, errs.length === 0, errs);
  await ctx.close();
});
function localWall(tz, y, mo, d, h, mi) {
  let guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess));
    const g = (t) => Number(parts.find(x => x.type === t).value);
    guess += Date.UTC(y, mo - 1, d, h, mi, 0) - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), 0);
  }
  return new Date(guess);
}
// 주소
await guard('[주소]', async () => {
  for (const [q, want, label] of [['?ep=dub-003', true, '다른 작품 주소'], ['?ep=dub-008', true, '8편 주소'], ['?ep=..%2F..%2Fx', true, '잘못된 ep'], ['?genre=kt', true, '키키와 토토 장르'], ['?resume=abc123', false, '하던 연습 이어 하기'], ['?library=movies', false, '내 영상 바로 열기'], ['?library=drafts', false, '이어할 연습 바로 열기']]) {
    const errs = [], ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(probe);
    const p = await newPage(ctx, errs); await go(p, q); let s = await st(p);
    ok(`[주소 ${q}] ${label} — ${want ? '저절로 열린다' : '저절로 안 연다(하던 일을 가리지 않게)'}`, s.open === want, s.open);
    if (s.open) ok(`[주소 ${q}] 그림이 그려진다`, await imgReady(p));
    if (s.open) await p.keyboard.press('Escape');
    await p.click('#dub-guide-open'); s = await st(p);
    ok(`[주소 ${q}] ‘❓ 사용방법’ 은 연다`, s.open && s.top);
    ok(`[주소 ${q}] 마이크·영상 0`, s.calls.gum === 0 && s.calls.play === 0, s.calls);
    ok(`[주소 ${q}] 안내창 오류 0`, !errs.some(e => /guide|dg-/.test(e)), errs);
    await ctx.close();
  }
  // 같은 탭에서 작품을 바꾸면(?ep= 새로 고침) 다시 안 뜬다
  const errs = [], ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const p = await newPage(ctx, errs); await go(p); await p.keyboard.press('Escape');
  await go(p, '?ep=dub-002'); let s = await st(p);
  ok('[주소] 같은 탭에서 작품을 바꾸면 다시 안 뜬다', !s.open);
  await go(p, '?ep=dub-005'); s = await st(p);
  ok('[주소] 또 바꿔도 안 뜬다', !s.open);
  await ctx.close();
});
// 빠른 연타 · 열고 닫기 반복
await guard('[연타·반복]', async () => {
  const errs = [], ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, isMobile: true });
  await ctx.addInitScript(probe);
  const p = await newPage(ctx, errs); await go(p);
  for (let i = 0; i < 10; i++) await p.click('#dub-guide .dg-next', { delay: 0, force: i > 2 }).catch(() => {});
  let s = await st(p);
  ok('[연타] ‘다음’ 10번 — 마지막 다음 «시작하기» 한 번에 닫혔거나 3단계에 머문다(넘치지 않음)', (!s.open) || s.step === 2, s);
  await p.click('#dub-guide-open').catch(() => {});
  await p.evaluate(() => { const b = document.getElementById('dub-guide-open'); b.click(); b.click(); window.MangoiDubGuide.open(); window.MangoiDubGuide.open(); });
  s = await st(p);
  ok('[연타] ‘❓’ 여러 번·open() 여러 번 — 창은 하나', s.open && s.count === 1, s.count);
  for (let i = 0; i < 15; i++) { await p.keyboard.press('Escape'); await p.evaluate(() => window.MangoiDubGuide.open()); }
  await p.keyboard.press('Escape'); s = await st(p);
  ok('[반복] 열고 닫기 15회 뒤 닫혀 있고 스크롤 잠금도 풀려 있다', !s.open && s.overflow === '|', s.overflow);
  await p.keyboard.press('Escape'); s = await st(p);
  ok('[반복] 닫힌 뒤 Esc 는 아무 일 없다', !s.open);
  for (let i = 0; i < 6; i++) { await p.tap('#dub-guide-open'); await p.tap('#dub-guide .dg-x'); }
  s = await st(p);
  ok('[반복] 손가락 탭으로 열고 ✕ 6회', !s.open && s.overflow === '|');
  ok('[반복] 마이크·영상·소리 0', s.calls.gum === 0 && s.calls.play === 0 && s.calls.ac === 0, s.calls);
  ok('[반복] 페이지 오류 0', errs.length === 0, errs);
  await ctx.close();
});
// 폰 역할 시트가 열려 있을 때 — Esc 는 안내창만 닫는다
await guard('[시트]', async () => {
  const errs = [], ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, SEEN);
  const p = await newPage(ctx, errs); await go(p);
  await p.click('#dub-scenes .scene:nth-child(1) [data-scene]'); await p.waitForTimeout(300);
  let s = await st(p);
  ok('[시트] 전제: ‘더빙’ 으로 역할 시트가 열렸다', s.sheet);
  await p.evaluate(() => window.MangoiDubGuide.open()); s = await st(p);
  ok('[시트] 시트 위로 안내창이 뜬다', s.open && s.top);
  await p.keyboard.press('Escape'); s = await st(p);
  ok('[시트] Esc 한 번 → 안내창만 닫히고 시트는 그대로', !s.open && s.sheet, s);
  await p.keyboard.press('Escape'); s = await st(p);
  ok('[시트] Esc 한 번 더 → 기존대로 시트가 닫힌다', !s.sheet);
  ok('[시트] 페이지 오류 0', errs.length === 0, errs);
  await ctx.close();
});
// 스크롤 자리
await guard('[스크롤]', async () => {
  const errs = [], ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await ctx.addInitScript((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, SEEN);
  const p = await newPage(ctx, errs); await go(p);
  await p.evaluate(() => scrollTo(0, 1500)); await p.waitForTimeout(100);
  const y0 = (await st(p)).scrollY;
  await p.evaluate(() => window.MangoiDubGuide.open());
  await p.mouse.move(640, 400); await p.mouse.wheel(0, 1200); await p.waitForTimeout(200);
  await p.keyboard.press('PageDown'); await p.keyboard.press('End'); await p.waitForTimeout(100);
  let s = await st(p);
  ok('[스크롤] 열려 있는 동안 뒤 화면이 안 움직인다', s.scrollY === y0, { y0, now: s.scrollY });
  await p.click('#dub-guide .dg-x'); await p.waitForTimeout(100); s = await st(p);
  ok('[스크롤] 닫으면 원래 자리 그대로', s.scrollY === y0, { y0, now: s.scrollY });
  /* 열려 있는 동안 다른 코드가 화면을 옮겨도(늦게 그려지는 칸·iOS 의 잠금 새기) 닫으면 열기 전 자리로 */
  await p.evaluate(() => window.MangoiDubGuide.open());
  await p.evaluate(() => { document.documentElement.style.overflow = ''; scrollTo(0, 3200); document.documentElement.style.overflow = 'hidden'; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(100); s = await st(p);
  ok('[스크롤] 열린 동안 화면이 옮겨져도 닫으면 열기 전 자리로 되돌린다', s.scrollY === y0, { y0, now: s.scrollY });
  ok('[스크롤] 페이지 오류 0', errs.length === 0, errs);
  await ctx.close();
});
// 창 안 🌐 언어 바꾸기
await guard('[🌐]', async () => {
  const errs = [], ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await newPage(ctx, errs); await go(p);
  await p.click('#dub-guide .dg-lang'); await p.waitForTimeout(200); let s = await st(p);
  const head = await p.evaluate(() => document.getElementById('dub-home-title').textContent);
  ok('[🌐] 창 안에서 영어로 — 글·그림이 영어', s.open && s.title === TEXT_EN_TITLE() && /-en\.jpg/.test(s.img) && await imgReady(p), s);
  ok('[🌐] 뒤 화면도 영어로 바뀐다(공용 전환)', head === 'Start with one short scene', head);
  await p.click('#dub-guide .dg-lang'); await p.waitForTimeout(200); s = await st(p);
  ok('[🌐] 다시 누르면 한국어', s.title === '세 단계만 따라 해요' && /-ko\.jpg/.test(s.img));
  ok('[🌐] 페이지 오류 0', errs.length === 0, errs);
  await ctx.close();
});
function TEXT_EN_TITLE() { return TEXT.en.title; }
// 닫은 뒤 기존 더빙 흐름이 그대로 — 안내창이 막거나 대신 켜지 않는다
for (const [vname, vp, mobile] of [['폰', { width: 390, height: 844 }, true], ['PC', { width: 1280, height: 800 }, false]]) await guard('[기존·' + vname + ']', async () => {
  const errs = [], ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', permissions: ['microphone'], hasTouch: mobile, isMobile: mobile });
  await ctx.addInitScript(probe);
  const p = await newPage(ctx, errs); await go(p);
  await p.click('#dub-guide .dg-x');
  await p.click('#dub-quick-start'); await p.waitForTimeout(300);
  let s = await st(p);
  ok(`[기존·${vname}] ‘짧은 더빙 시작’ 이 역할 고르기를 연다`, mobile ? s.sheet : await p.isVisible('#dub-start'), s.sheet);
  ok(`[기존·${vname}] 아직 마이크 0(녹음 시작 전)`, s.calls.gum === 0);
  await p.click('#dub-start');
  await p.waitForFunction(() => window.__calls.gum > 0, null, { timeout: 15000 }).catch(() => {});
  s = await st(p);
  ok(`[기존·${vname}] ‘내 목소리로 녹음 시작’ 을 눌러야 마이크를 묻는다(1회)`, s.calls.gum === 1, s.calls);
  await p.click('#dub-stop').catch(() => {}); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('#dub-scenes .scene:nth-child(2) [data-watch]').scrollIntoView({ block: 'center' }));
  const before = (await st(p)).calls.play;
  await p.click('#dub-scenes .scene:nth-child(2) [data-watch]').catch(() => {});
  await p.waitForFunction((b) => window.__calls.play > b, before, { timeout: 15000 }).catch(() => {});
  s = await st(p);
  ok(`[기존·${vname}] ‘👀 보기’ 는 눌렀을 때 영상을 튼다`, s.calls.play > before, s.calls);
  ok(`[기존·${vname}] 안내창 오류 0`, !errs.some(e => /guide|dg-/.test(e)), errs);
  await ctx.close();
});
// 키보드만으로(PC): ❓ 까지 Tab → Enter 로 열기
await guard('[키보드]', async () => {
  const errs = [], ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await ctx.addInitScript((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, SEEN);
  const p = await newPage(ctx, errs); await go(p);
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) { await p.keyboard.press('Tab'); reached = (await st(p)).active === 'dub-guide-open'; }
  ok('[키보드] Tab 으로 ‘❓ 사용방법’ 에 닿는다', reached);
  await p.keyboard.press('Enter'); let s = await st(p);
  ok('[키보드] Enter 로 열리고 포커스가 창 안', s.open && s.focusIn);
  await p.keyboard.press('Enter'); s = await st(p);
  ok('[키보드] Enter(다음) 로 2단계', s.step === 1);
  await p.keyboard.press('Escape'); s = await st(p);
  ok('[키보드] Esc 후 포커스가 ‘❓ 사용방법’ 으로 돌아온다', !s.open && s.active === 'dub-guide-open');
  await ctx.close();
});

await browser.close();
console.log('═'.repeat(66));
console.log('  ❓ ai-dubbing-guide 브라우저 실측 (헤드리스 Chromium · 폰/태블릿/PC 흉내)');
console.log('═'.repeat(66));
fails.forEach(f => console.log('  ❌ ' + f));
console.log(`  통과 ${pass} / ${pass + fail}`);
console.log(fail ? `  결과: ${fail} FAIL` : '  결과: 전부 통과');
process.exit(fail ? 1 : 0);
