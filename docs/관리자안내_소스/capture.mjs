/* ═══════════════════════════════════════════════════════════════════════════
 * capture.mjs — 관리자 화면을 **새로 찍어** .shots/ 에 넣습니다.
 *
 *   [왜 이렇게 찍나]
 *     이 컨테이너의 프록시가 mangoi.ai 를 막아서 «배포된 진짜 화면» 은 볼 수 없습니다
 *     (CLAUDE.md 4-1-1). 그래서 배포되는 그 파일들(cloudflare-deploy/public)을
 *     로컬 서버로 그대로 띄우고, 컨테이너에 이미 있는 크로미움으로 찍습니다.
 *     서버가 없으니 /api/* 는 «모양만» 맞는 JSON 으로 대신 답합니다(STUB).
 *
 *   [먼저 할 일]
 *     cd cloudflare-deploy/public && python3 -m http.server 8899
 *
 *   [주의]
 *     · 빈 브라우저는 «첫 방문자» 라 환영 안내(#aw-overlay)가 스크롤·클릭을 막습니다
 *       → localStorage 로 «본 것» 표시를 먼저 넣습니다(CLAUDE.md 2장 함정).
 *     · 로그인 화면의 «상담직원 인사말» 영상 상자는 로컬에 영상이 없어 검은 사각형이
 *       됩니다 → 찍기 전에 감춥니다.
 *     · 스텁 응답 때문에 나는 오류를 «진짜 버그» 로 착각하지 마세요.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT  = path.join(HERE, '.shots');
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* 모양만 맞는 응답. 진짜 자료가 아니라 «화면이 깨지지 않을 만큼» 입니다. */
const GENERIC = { ok:true, success:true, items:[], rows:[], list:[], data:[], results:[], total:0, count:0 };
const SPECIFIC = {
  '/api/active-rooms': [],
  '/api/admin/me': { ok:true, user:{ username:'admin', name:'관리자', role:'admin',
      email:'help@mangoi.ai', phone:'02-000-0000', center:'본사', scope:'hq', role_label:'본사 관리자' } }
};

/* 찍을 화면 — slides.mjs 의 shot 이름과 짝입니다. card 는 jumpToMenu 로 엽니다. */
const TARGETS = [
  { name:'login',   url:'/admin/login.html' },
  { name:'home',    url:'/admin.html' },
  { name:'search',  url:'/admin.html', act:'search' },
  { name:'eval',    url:'/admin.html', card:'card-eval-mgmt' },
  { name:'notice',  url:'/admin.html', card:'card-kakao-mgmt' },
  { name:'student', url:'/admin.html', card:'card-students-mgmt' },
  { name:'parent',  url:'/admin.html', card:'card-parent-digest' },
  { name:'teacher', url:'/admin.html', card:'card-teacher-mgmt' },
  { name:'pay',     url:'/admin.html', card:'card-payments-b2c' },
  { name:'library', url:'/admin.html', card:'card-lib-admin' },
  { name:'site',    url:'/index.html' },
  { name:'logout',  url:'/admin.html', act:'account', viewport:{ width:1440, height:1400 }, clip:'#ph115-modal' }
];

const { chromium } = await import('playwright-core');
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{ width:1440, height:900 }, deviceScaleFactor:2 });
await ctx.addInitScript(() => { try {
  localStorage.setItem('mangoi_admin_welcome_v1_done','1');   // 환영 안내를 «본 것» 으로
  localStorage.setItem('mangoi_lang','ko');
} catch(e){} });
await ctx.route('**/api/**', async route => {
  const p = new URL(route.request().url()).pathname;
  await route.fulfill({ status:200, contentType:'application/json; charset=utf-8',
    body: JSON.stringify(SPECIFIC[p] || GENERIC) });
});

const only = process.argv.slice(2);
for (const t of TARGETS) {
  if (only.length && !only.includes(t.name)) continue;
  const page = await ctx.newPage();
  if (t.viewport) await page.setViewportSize(t.viewport);
  try {
    await page.goto(BASE + t.url, { waitUntil:'load', timeout:60000 });
    await page.waitForTimeout(4500);
    await page.evaluate(() => document.querySelectorAll('[id*="greet"],[class*="greet"]')
      .forEach(el => { el.style.display = 'none'; }));
    if (t.card) {
      await page.evaluate(id => { try { window.jumpToMenu && window.jumpToMenu(id); } catch(e){} }, t.card);
      await page.waitForTimeout(3000);
    }
    if (t.act === 'search') {
      await page.evaluate(() => {
        const i = document.getElementById('ph85-search') || document.querySelector('#ph85-sidebar input');
        if (i) { i.focus(); i.value = '공지'; i.dispatchEvent(new Event('input',{bubbles:true}));
                 i.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'지'})); }
      });
      await page.waitForTimeout(2000);
    }
    if (t.act === 'account') {
      await page.evaluate(() => { const el = document.getElementById('ph115-user'); if (el) el.click(); });
      await page.waitForTimeout(1800);
    }
    const dest = path.join(OUT, `raw-${t.name}.png`);
    if (t.clip) { const el = await page.$(t.clip); if (el) { await el.screenshot({ path: dest }); }
                  else { await page.screenshot({ path: dest }); } }
    else { await page.screenshot({ path: dest }); }
    console.log('  찍음', t.name);
  } catch (e) { console.error('  ✖ 실패', t.name, String(e).slice(0,140)); }
  await page.close();
}
await b.close();
console.log('✓ .shots/ 에 넣었습니다. 이어서 `node build.mjs`');
