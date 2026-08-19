// 관리자 화면 캡처 공용 — 로컬 정적서버(public/) + 스텁 API 로 admin.html 을 렌더한다.
//   ⚠️ 실서비스(mangoi.ai)는 이 컨테이너의 프록시가 막는다. D1 에도 닿지 않는다(전부 스텁).
import { loadPlaywright, findChromium } from '../../test-harness/manual/_pw.mjs';

export const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:8899';

/** /api/** 를 시드값으로 물린다. 목록형은 배열, 그 외는 ok:true. */
function stubBody(url){
  const u = String(url);
  if (/\/api\/admin\/session|whoami/.test(u)) return { ok:true, role:'hq_exec', name:'정우영', username:'hq_admin' };
  // 목록을 기대하는 화면이 `.slice is not a function` 으로 깨지지 않게, 흔한 키는 빈 배열로 준다.
  const body = { ok:true, success:true, total:0, count:0 };
  for (const k of ['items','list','rows','data','results','records','logs','files','history',
                   'rooms','students','teachers','parents','payments','evaluations','notices',
                   'classes','schedules','centers','franchises','staff','alerts','requests'])
    body[k] = [];
  return body;
}

export async function openAdmin(opts={}){
  const pw = loadPlaywright(); const exe = findChromium();
  if (!pw || !exe) { console.log('⏭  건너뜀 — playwright/chromium 없음'); process.exit(0); }
  const browser = await pw.chromium.launch({ executablePath: exe, args:['--no-sandbox','--font-render-hinting=none'] });
  const ctx = await browser.newContext({
    viewport: { width: opts.width||1600, height: opts.height||1000 },
    deviceScaleFactor: opts.dsr || 2,
    locale: opts.lang === 'en' ? 'en-US' : 'ko-KR',
  });
  await ctx.route('**/api/**', async (route) => {
    try { await route.fulfill({ status:200, contentType:'application/json; charset=utf-8', body: JSON.stringify(stubBody(route.request().url())) }); }
    catch { try{ await route.abort(); }catch{} }
  });
  await ctx.route(/https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', () => {});   // 스텁 응답 때문에 나는 TypeError 는 무시(진짜 버그 아님)
  await page.addInitScript(([lang]) => {
    const S = { uid:'hq_admin', username:'hq_admin', name:'정우영', role:'hq_exec', server_role:'hq_exec', ts: 1755500000000 };
    localStorage.setItem('mangoi_admin_session', JSON.stringify(S));
    localStorage.setItem('admin_session', JSON.stringify(S));
    localStorage.setItem('mangoi_lang', lang);
    localStorage.setItem('mangoi_lang_by', 'user');
    localStorage.setItem('mangoi_lang_uid', 'hq_admin');
    localStorage.setItem('mango_lang', lang);
    localStorage.setItem('aw_seen', '1');       // 환영 안내 다시 안 뜨게(있으면)
    localStorage.setItem('adm_welcome_done', '1');
  }, [opts.lang === 'en' ? 'en' : 'ko']);
  await page.goto(BASE + '/admin.html', { waitUntil:'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(opts.settle || 4500);
  // 환영 오버레이·모달이 남아 있으면 치운다(클릭을 가로막는다)
  await page.evaluate(() => {
    ['#aw-overlay','#ag-overlay','.aw-overlay','#greet-video-box','#idx-greet-wrap','[id*="greet"]']
      .forEach(s => document.querySelectorAll(s).forEach(e => e.remove()));
    document.querySelectorAll('video').forEach(v => { const b = v.closest('div'); if (b) b.remove(); });
    document.documentElement.style.overflow=''; document.body.style.overflow='';
  });
  return { browser, ctx, page };
}
