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
import { SAMPLE } from './sample-data.mjs';

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

/* 찍을 화면 — slides.mjs 의 shot 이름과 짝입니다. card 는 jumpToMenu 로 엽니다.
 *   marks: 화살표·번호를 붙일 곳. 'css:선택자' 또는 '글자'(그 글자를 가진 가장 작은 보이는 요소).
 *          찍은 뒤 그 자리(px)를 .shots/marks-<이름>.json 에 남기고 build.mjs 가 그 위에 그립니다.
 *          ⚠️ 못 찾으면 null 로 남기고 경고합니다 — 화면이 바뀌어 화살표가 엉뚱한 곳을 가리키는 것보다 낫습니다.
 *   wide:  관리자 표는 폭이 넓어 오른쪽(승인·지급 버튼)이 잘립니다 → 넓은 창으로 찍습니다. */
const WIDE = { width:1920, height:1080 };
const HIDE_AI = '#mi-ops-fab,#mangoi-widget,#mangoi-toggle,[id*="ai-sec"],[class*="ai-sec-fab"],#mga-fab,#aiw-fab';
const TARGETS = [
  { name:'login',   url:'/admin/login.html' },
  { name:'home',    url:'/admin.html' },
  { name:'search',  url:'/admin.html', act:'search' },
  { name:'eval',    url:'/admin.html', card:'card-eval-mgmt' },
  { name:'notice',  url:'/admin.html', card:'card-kakao-mgmt' },
  { name:'student', url:'/admin.html', card:'card-students-mgmt' },
  { name:'parent',  url:'/admin.html', card:'card-parent-digest' },
  { name:'teacher', url:'/admin.html', card:'card-teacher-mgmt' },
  { name:'library', url:'/admin.html', card:'card-lib-admin' },
  { name:'site',    url:'/index.html' },
  { name:'logout',  url:'/admin.html', act:'account', viewport:{ width:1440, height:1400 }, clip:'#ph115-modal' },

  /* ── 2026-10-09 «특히 자세히» — 수업 스케줄 · 수강신청 · 연기/변경 · 학생 결제 · 강사 급여 ── */
  { name:'week', url:'/admin/weekly-schedule.html?demo=1', viewport:WIDE,
    prep:`document.getElementById('guide-toast')&&(document.getElementById('guide-toast').style.display='none');
          var b=document.getElementById('demo-badge'); if(b) b.remove();`,
    marks:['◀ 이전','css:#search-input,input[placeholder*="검색"]','Anna Reyes','빈자리 찾기','css:.ai-suggest-btn','css:#ws-lock-btn'] },
  { name:'enroll', url:'/admin.html', card:'card-enrollments', viewport:{ width:1920, height:1500 },
    prep:`typeof loadEnrollments==='function'&&loadEnrollments()`,
    scrollTo:'css:#card-enrollments details[data-gc]',
    marks:['css:#card-enrollments details[data-gc] > summary','css:#en-status-filter','대기 3','css:#enrollments-table button[onclick^="enOpenPanel"]'] },
  { name:'srq', url:'/admin.html', card:'card-schedule-requests', viewport:WIDE,
    prep:`typeof srqLoad==='function'&&srqLoad()`, scrollTo:'css:#srq-filter',
    marks:['css:#srq-filter','css:#srq-table tbody tr','css:button[onclick*="\'approve\'"]','css:button[onclick*="\'reject\'"]'] },
  { name:'pay', url:'/admin.html', card:'card-payments-b2c', viewport:WIDE,
    marks:['css:#b2c-kpi-today','css:#b2c-f-agency','css:#b2c-f-from','css:#b2c-f-q','css:button[onclick*="b2cSearch"]','css:button[onclick*="b2cDownloadCsv"]','css:#b2c-tbody tr'] },
  { name:'payroll', url:'/admin.html', card:'card-payroll-auto', viewport:WIDE,
    prep:`typeof prCalculate==='function'&&prCalculate()`, scrollTo:'css:#pr-year',
    marks:['css:#pr-month','css:button[onclick="prCalculate()"]','css:#pr-summary','css:button[onclick^="prShowDetail"]','css:button[onclick^="prMarkPaid"]','css:#pr-save-btn'] }
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
    body: JSON.stringify(SAMPLE[p] || SPECIFIC[p] || GENERIC) });
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
    if (t.prep) { await page.evaluate(t.prep); await page.waitForTimeout(3000); }
    if (t.marks) await page.evaluate(sel => document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; }), HIDE_AI);
    if (t.scrollTo) {
      await page.evaluate(q => { const el = document.querySelector(q.slice(4)); if (el) el.scrollIntoView({ block:'start' }); window.scrollBy(0, -110); }, t.scrollTo);
      await page.waitForTimeout(900);
    }
    if (t.marks) {
      const boxes = await page.evaluate(list => {
        const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight; };
        const find = m => {
          if (m.startsWith('css:')) return [...document.querySelectorAll(m.slice(4))].find(vis) || null;
          let best = null;
          for (const el of document.querySelectorAll('button,a,select,input,th,td,span,div,summary,label,h1,h2,b')) {
            if (!vis(el) || (el.textContent || '').trim() !== m) continue;
            if (!best || el.contains(best) === false && best.contains(el)) best = el;
            if (best && best.contains(el)) best = el;
          }
          return best;
        };
        return list.map(m => { const el = find(m); if (!el) return null;
          const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
      }, t.marks);
      const dpr = 2;
      const px = boxes.map(b => b && b.map(v => Math.round(v * dpr)));
      px.forEach((b, i) => { if (!b) console.warn('  ⚠️ 화살표 자리를 못 찾음', t.name, i + 1, t.marks[i]); });
      fs.writeFileSync(path.join(OUT, `marks-${t.name}.json`), JSON.stringify(px));
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
