// ❓ «오늘의 A.i 학습» 사용 설명서 — 브라우저 실측 (2026-10-10)
//   재는 것: ① 처음 들어오면 저절로 열린다 ② 맨 위(공용 홈/EN 칩보다 위)이고 버튼이 눌린다
//           ③ 7장을 넘기며 그림이 «실제로 그려진다»(naturalWidth>0) ④ 닫으면 다시 안 열린다(다음 방문)
//           ⑤ 「❓ 사용법 보기」 버튼으로 다시 열린다 ⑥ 🌐 영어면 영어 글·영어 그림 ⑦ 로그인 전 화면에서도 열린다
//   자동으로 안 돈다(manual/) — 사람이 부른다:
//       cd cloudflare-deploy/public && python3 -m http.server 8941
//       PW_DIR=/tmp/pw node test-harness/manual/today-guide-browser.mjs
import { createRequire } from 'node:module';
const require = createRequire((process.env.PW_DIR || '/tmp/pw') + '/node_modules/');
const { chromium } = require('playwright-core');
const B = process.env.BASE || 'http://127.0.0.1:8941';
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n, x !== undefined ? JSON.stringify(x) : ''); } };
const PLAN = { ok: true, uid: 'demo1', name: '민서', points_today: 0, ai_streak: 1, plan: {
  mode: 'home', phase: null, cls: null, band: 3, bandKo: '기초', bandEn: 'Basic', cefr: 'A2', textbook: null, totalMinutes: 12, doneCount: 0, levelKeys: {},
  steps: [{ key: 'friend', slot: 'home', icon: '🤖', ko: 'AI 친구 대화', en: 'AI friend', url: '/ai-friend.html', minutes: 7, done: false, whyKo: 'x', whyEn: 'x' }],
  week: [0,1,2,3,4,5,6].map(d => ({ dow: d, ko: '일월화수목금토'[d], en: 'SMTWTFS'[d], isClass: false, isToday: d === 5, start: null, minutes: 12 })) } };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

async function page(ctx, { logged = true, lang = 'ko' } = {}) {
  const p = await ctx.newPage();
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: /\/api\/student\/today/.test(r.request().url()) && !/goal=|fixcards=/.test(r.request().url()) ? JSON.stringify(logged ? PLAN : { ok: false }) : '{"ok":true,"items":[],"cards":[]}' }));
  return p;
}
async function state(p) {
  return p.evaluate(() => {
    const ov = document.getElementById('tg-ov');
    const open = !!ov && !ov.hidden && getComputedStyle(ov).display !== 'none';
    const nx = ov && ov.querySelector('.nx');
    let top = false;
    if (open && nx) { const r = nx.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); top = t === nx || nx.contains(t); }
    const img = ov && ov.querySelector('.pic');
    return { open, top, k: ov && ov.querySelector('#tg-head .k').textContent, tt: ov && ov.querySelector('.tt').textContent, src: img && img.src, w: img && img.naturalWidth };
  });
}

// ①~⑤ 한국어, 로그인한 학생, 390×844
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); localStorage.clear(); localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo1', name: '민서' })); localStorage.setItem('mango_token', 'x.y'); localStorage.setItem('mangoi_lang', 'ko'); } } catch (e) {} });
  const p = await page(ctx);
  await p.goto(B + '/today.html?_nc=' + Date.now(), { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  let s = await state(p);
  ok('① 처음 들어오면 저절로 열린다', s.open, s);
  ok('② 「다음」 버튼이 맨 위다(눌린다)', s.top, s);
  ok('③-1 첫 장 그림이 그려졌다', s.w > 0 && /1-top-ko\.jpg/.test(s.src), s);
  for (let i = 2; i <= 7; i++) {
    await p.click('#tg-ov .nx'); await p.waitForTimeout(500);
    s = await state(p);
    ok(`③-${i} ${i}장 — 그림이 그려지고 번호가 맞다`, s.w > 0 && s.k.indexOf(i + ' / 7') >= 0, s);
  }
  ok('③-마지막 장 버튼은 «시작하기»', (await p.textContent('#tg-ov .nx')).indexOf('시작하기') >= 0);
  await p.click('#tg-ov .nx'); await p.waitForTimeout(300);
  s = await state(p);
  ok('④-1 마지막 버튼을 누르면 닫힌다', !s.open, s);
  ok('④-2 닫으면 화면 스크롤이 돌아온다', await p.evaluate(() => document.documentElement.style.overflow !== 'hidden'));
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  s = await state(p);
  ok('④-3 다음 방문에는 저절로 안 열린다', !s.open, s);
  const bt = await p.evaluate(() => { const e = document.getElementById('td-guide-btn'); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { vis: r.width > 0 && r.height >= 40, top: t === e || e.contains(t) }; });
  ok('⑤-1 「❓ 사용법 보기」 버튼이 보이고 눌린다(높이 40 이상)', bt.vis && bt.top, bt);
  await p.click('#td-guide-btn'); await p.waitForTimeout(500);
  s = await state(p);
  ok('⑤-2 버튼으로 다시 열린다(1장부터)', s.open && s.k.indexOf('1 / 7') >= 0, s);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('⑤-3 Esc 로 닫힌다', !(await state(p)).open);
  await p.click('#td-guide-btn'); await p.waitForTimeout(300);
  await p.mouse.click(5, 5); await p.waitForTimeout(200);
  ok('⑤-4 바깥(어두운 곳)을 누르면 닫힌다', !(await state(p)).open);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  ok('⑤-5 가로로 넘치지 않는다', ov);
  await ctx.close();
}
// ⑥ 영어
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); localStorage.clear(); localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'demo1', name: '민서' })); localStorage.setItem('mango_token', 'x.y'); localStorage.setItem('mangoi_lang', 'en'); } } catch (e) {} });
  const p = await page(ctx);
  await p.goto(B + '/today.html?_nc=' + Date.now(), { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const s = await state(p);
  ok('⑥ 영어면 영어 그림·영어 글', s.open && /1-top-en\.jpg/.test(s.src) && s.w > 0 && /How to use/.test(s.k), s);
  await ctx.close();
}
// ⑦ 로그인 전(맛보기 기간 지남 → 로그인 안내)
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); localStorage.clear(); localStorage.setItem('mangoi_today_sample_from', '1'); } } catch (e) {} });
  const p = await page(ctx, { logged: false });
  await p.goto(B + '/today.html?_nc=' + Date.now(), { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const s = await state(p);
  ok('⑦ 로그인 전 화면(PC 폭)에서도 열리고 맨 위다', s.open && s.top, s);
  await ctx.close();
}
await b.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
