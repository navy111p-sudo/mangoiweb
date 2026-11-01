/* observe-join-visible-browser.mjs — 관찰 중 «🚪 보이게 입장» 이 실제 화면에 보이고 눌리는가 (2026-10-20)
 *
 * 자동으로 안 돕니다 — 사람이 부릅니다:
 *   PW_DIR=/tmp/pw node test-harness/manual/observe-join-visible-browser.mjs
 *
 * 자동 하니스(observe_join_visible_harness.mjs)는 «무슨 주소를 여는가» 를 함수로 돌려 본다.
 * 여기서는 그것이 «화면에 보이고(display) · 맨 위에 있고(elementFromPoint) · 누르면 확인창 뒤
 * 그 주소로 새 창이 열리는가» 를 진짜 Chromium 으로 잰다. 「있다」·「보인다」·「눌린다」는 다르다.
 *
 * ⚠️ 짝으로 묻는다 — 방이 있을 때 «보인다» 옆에 방이 없을 때(고르기 화면) «감춘다»,
 *    확인창에서 «취소» 하면 «새 창이 안 열린다».
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const pw = loadPlaywright();
const EXE = findChromium();
if (!pw || !EXE) { console.log('⏭ playwright-core 또는 Chromium 을 못 찾아 건너뜁니다.'); process.exit(0); }

let PASS = 0, FAIL = 0;
const check = (label, ok, extra = '') => {
  if (ok) { PASS++; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
  else { FAIL++; console.log('  ⚠ FAIL ' + label + (extra ? '  ' + extra : '')); }
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>joined</title>joined'); return; }
  const f = join(PUB, p);
  if (!existsSync(f) || !f.startsWith(PUB)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
const PORT = 8897;
await new Promise((r) => server.listen(PORT, r));
const BASE = 'http://127.0.0.1:' + PORT;
const ROOM = 'class-12-20261020';

const browser = await pw.chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

async function stub(page) {
  await page.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const send = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.pathname === '/api/active-rooms') return send([{ roomId: ROOM, userCount: 2, users: [{ username: 'Teacher Ana' }, { username: '김선우' }] }]);
    if (u.pathname === '/api/admin/live-classes') return send({ ok: true, rooms: { [ROOM]: { teacher_name: 'Teacher Ana', student_name: '김선우', start_time: '20:00' } } });
    if (u.pathname === '/api/admin/classes-now') return send({ ok: true, items: [] });
    if (u.pathname === '/api/admin/me') return send({ ok: true, username: 'mgr_karl', scope_type: 'hq', name: 'Karl' });
    return send({ ok: true, items: [] });
  });
}
/** 그 요소가 화면에 있고 그 중앙의 «맨 위» 가 그 요소(또는 그 안)인가 */
async function topmost(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { exists: false };
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    if (shown) el.scrollIntoView({ block: 'center' });
    const r2 = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
    return { exists: true, shown, display: cs.display, top: !!(hit && (hit === el || el.contains(hit))), w: Math.round(r2.width) };
  }, sel);
}
/** 누르고 확인창에 answer 로 답한다 → 열린 새 창 주소(없으면 '') */
async function clickJoin(ctx, page, sel, answer) {
  let msg = '';
  page.once('dialog', async (d) => { msg = d.message(); answer ? await d.accept() : await d.dismiss(); });
  const pop = ctx.waitForEvent('page', { timeout: 2500 }).catch(() => null);
  await page.click(sel, { timeout: 3000 }).catch(() => {});
  const p = await pop;
  const url = p ? p.url() : '';
  if (p) await p.close().catch(() => {});
  return { msg, url };
}

for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const tag = '[' + vp.width + 'px]';
  console.log('\n── 관찰 화면(admin/ghost-view.html) ' + tag + ' ──');
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await stub(page);
  await page.goto(BASE + '/admin/ghost-view.html?room_id=' + ROOM + '&obs_id=3&admin_uid=mgr_karl', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const h = await topmost(page, '#ghd-join-visible');
  check('① ' + tag + ' 헤더 «보이게 입장» 이 보이고 맨 위에 있다', h.exists && h.shown && h.top, JSON.stringify(h));
  const v = await topmost(page, '#ghd-join-visible-2');
  check('② ' + tag + ' 영상칸 «학생에게 보이게 입장» 도 보이고 눌린다', v.exists && v.shown && v.top, JSON.stringify(v));

  const no = await clickJoin(ctx, page, '#ghd-join-visible', false);
  check('③ ' + tag + ' (짝) 확인창에서 취소하면 새 창이 안 열린다', /보이게 입장|participant/.test(no.msg) && !no.url, JSON.stringify(no).slice(0, 160));
  const yes = await clickJoin(ctx, page, '#ghd-join-visible', true);
  const want = BASE + '/?vc_autojoin=1&vc_cam=off&vc_role=teacher&vc_room=' + encodeURIComponent(ROOM);
  check('④ ' + tag + ' 확인하면 «실제 참가자·카메라 꺼짐» 주소로 새 창이 열린다', yes.url === want, yes.url || '(안 열림)');
  check('⑤ ' + tag + ' 확인창이 «라이브 관찰 창을 먼저 닫으라» 고 말한다', /먼저 닫아|close it first/.test(yes.msg));
  const ovf = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('⑥ ' + tag + ' 버튼을 더해도 가로로 넘치지 않는다', ovf <= 1, 'overflow=' + ovf);
  await ctx.close();

  console.log('── 관찰 화면 «수업 고르기»(방 없음) ' + tag + ' ──');
  const ctx2 = await browser.newContext({ viewport: vp });
  const p2 = await ctx2.newPage();
  await stub(p2);
  await p2.goto(BASE + '/admin/ghost-view.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => /class-12/.test((document.getElementById('ghd-pick-live') || {}).innerHTML || ''), null, { timeout: 5000 }).catch(() => {});
  const hh = await topmost(p2, '#ghd-join-visible');
  check('⑦ ' + tag + ' (짝) 방이 없는 고르기 화면에서는 헤더 버튼을 감춘다', hh.exists && !hh.shown, JSON.stringify(hh));
  const pb = await topmost(p2, '#ghd-pick-live button.btn-enter');
  check('⑧ ' + tag + ' 고르기 목록 줄의 «보이게 입장» 이 보이고 눌린다', pb.exists && pb.shown && pb.top, JSON.stringify(pb));
  const py = await clickJoin(ctx2, p2, '#ghd-pick-live button.btn-enter', true);
  check('⑨ ' + tag + ' 고르기 목록에서 누르면 그 방으로 보이게 입장한다', py.url === want, py.url || '(안 열림)');
  const ovf2 = await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('⑩ ' + tag + ' 고르기 목록이 가로로 넘치지 않는다', ovf2 <= 1, 'overflow=' + ovf2);
  await ctx2.close();

  console.log('── 매니저 화면 「지금 진행 중인 수업」 ' + tag + ' ──');
  const ctx3 = await browser.newContext({ viewport: vp });
  const p3 = await ctx3.newPage();
  await stub(p3);
  await p3.goto(BASE + '/manager.html', { waitUntil: 'networkidle' });
  await p3.evaluate(() => { const d = document.getElementById('hqCards'); if (d) d.hidden = false; const c = document.getElementById('c-live'); if (c) c.open = true; });
  await p3.waitForFunction(() => /taJoin/.test((document.getElementById('liveBody') || {}).innerHTML || ''), null, { timeout: 5000 }).catch(() => {});
  const mj = await topmost(p3, '#liveBody a[onclick*="taJoin"]');
  check('⑪ ' + tag + ' 진행 중인 방 줄에 «입장(보임)» 이 보이고 눌린다', mj.exists && mj.shown && mj.top, JSON.stringify(mj));
  const mo = await topmost(p3, '#liveBody a[href*="ghost-view.html"]');
  check('⑫ ' + tag + ' (짝) «관찰(안 보임)» 링크도 그대로 보인다', mo.exists && mo.shown, JSON.stringify(mo));
  const mt = await p3.locator('#liveBody').innerText();
  check('⑬ ' + tag + ' 두 버튼이 «보임/안 보임» 을 글자로 말한다', /보임|visible/i.test(mt) && /안 보임|hidden/i.test(mt), mt.replace(/\s+/g, ' ').slice(0, 120));
  const my = await clickJoin(ctx3, p3, '#liveBody a[onclick*="taJoin"]', true);
  check('⑭ ' + tag + ' 누르면 그 방으로 보이게 입장한다', my.url === want, my.url || '(안 열림)');
  await ctx3.close();
}

await browser.close();
server.close();
console.log('\n─────────────────────────────────────────────');
console.log('  ✅ PASS ' + PASS + '    ⚠ FAIL ' + FAIL + '   (총 ' + (PASS + FAIL) + ')');
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
