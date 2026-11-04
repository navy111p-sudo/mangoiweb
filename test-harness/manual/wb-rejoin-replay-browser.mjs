/**
 * 🖍 재접속한 사람의 칠판이 «텅 빈» 사고 — 진짜 index.html 입장 흐름으로 수백 번 잰다 (2026-11-05)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   자동 하니스(wb_rejoin_replay_harness)는 입장 처리 IIFE 와 DO 를 «오려 내» 돌린다.
 *   이 검사는 실제 index.html 의 vcJoinRoom(권한·TURN·소켓·메시지 처리 전부)을 그대로 돌리고,
 *   WebSocket 만 «가짜 서버» 로 바꿔 무작위 지연(0~LATMAX ms)으로 room-joined·whiteboard-replay 를
 *   돌려준다. 1.5초 뒤 칠판 기록(window.wbOps)과 칠판 캔버스의 빨간 펜 픽셀을 잰다.
 *
 *   MODE=fresh   매 시도 새 브라우저에서 로비 입장(vcJoinRoom 직접)
 *   MODE=refresh 한 번 들어간 탭을 새로고침 → 페이지가 스스로 재입장(새로고침 복귀 경로, 저장된 아이디·비번)
 *   OLD_REF=<git ref>  그 커밋의 idx-vc-textbook.js 를 끼워 «고치기 전» 과 비교(예: OLD_REF=HEAD~1)
 *
 * ⚠️ 서비스워커를 반드시 막는다(serviceWorkers:'block') — 안 막으면 새로고침 때 sw.js 캐시가
 *    파일을 내줘 page.route 가로채기가 무시되고, «옛 코드» 를 넣었는데 새 코드가 돈다(실제로 밟았다).
 * ⚠️ file:// 로 열면 안 된다 — /js/… 절대경로가 404. python3 http.server 로 띄운다.
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. 사람이 부른다:
 *   node test-harness/manual/wb-rejoin-replay-browser.mjs
 *   MODE=refresh TRIALS=200 node test-harness/manual/wb-rejoin-replay-browser.mjs
 *   OLD_REF=HEAD~1 LATMAX=250 TRIALS=60 node test-harness/manual/wb-rejoin-replay-browser.mjs
 *   결과: «칠판 복원본 사라짐 0건» 이면 통과(종료코드 0). OLD_REF 판은 비교용이라 늘 0 으로 끝난다.
 */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const OLD_REF = process.env.OLD_REF || '';
const VARIANT = OLD_REF ? 'old(' + OLD_REF + ')' : 'new', MODE = process.env.MODE || 'fresh';
const TRIALS = Number(process.env.TRIALS || 20), WORKERS = Number(process.env.WORKERS || 4);
const PORT = Number(process.env.PORT || 8948), LATMAX = Number(process.env.LATMAX || 1200);
const ROOM = 'class-9-' + new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const OLD = OLD_REF ? execFileSync('git', ['show', OLD_REF + ':cloudflare-deploy/public/js/idx-vc-textbook.js'], { cwd: ROOT, encoding: 'utf8' }) : '';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: PUB, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

function INIT() {
  window.__ev = []; const T = () => Math.round(performance.now());
  try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {}
  const lat = Number(sessionStorage.getItem('__sbLat') || 100);
  class W {
    constructor(u) {
      this.readyState = 0; this.url = u;
      if (!/video-call/.test(u)) { setTimeout(() => { this.readyState = 3; this.onclose && this.onclose({ code: 1006 }); }, 10); return; }
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 20 + Math.floor(Math.random() * 60));
    }
    send(s) {
      let m; try { m = JSON.parse(s); } catch (_) { return; }
      if (m.type !== 'join-room') return;
      window.__ev.push(['join', T()]);
      setTimeout(() => {
        window.__ev.push(['replay', T()]); window.__replayAt = T();
        const e = o => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(o) }); };
        e({ type: 'room-joined', data: { roomId: 'room', userId: 'u-karl', userCount: 2, pdfState: null } });
        e({ type: 'existing-users', data: { users: [], pdfState: null } });
        e({ type: 'whiteboard-replay', data: { ops: [
          { t: 'whiteboard-text', d: { text: 'Notes ' + lat, x: 0.2, y: 0.3, color: '#000000', fontSize: 30, rel: 0.06 } },
          { t: 'whiteboard-draw', d: { tool: 'pen', fromX: 0.1, fromY: 0.6, toX: 0.7, toY: 0.6, color: '#ff0000', size: 8 } },
        ] } });
      }, lat);
    }
    close() { this.readyState = 3; }
  }
  W.CONNECTING = 0; W.OPEN = 1; W.CLOSING = 2; W.CLOSED = 3; window.WebSocket = W;
  const arm = () => {
    new MutationObserver(() => {
      const c = document.body.classList.contains('vc-in-call');
      if (c && !window.__enterAt) { window.__enterAt = T(); window.__ev.push(['enter', T()]); }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    /* 칠판 비우기 호출을 기록(어느 판이든 전역 wbReceiveClear 를 부른다) */
    const wrap = () => {
      if (typeof window.wbReceiveClear !== 'function' || window.wbReceiveClear.__sb) return setTimeout(wrap, 50);
      const o = window.wbReceiveClear; const f = function () { window.__ev.push(['CLEAR', T(), (window.wbOps || []).length]); return o.apply(this, arguments); };
      f.__sb = 1; f.__mgInk = o.__mgInk; window.wbReceiveClear = f;
    };
    wrap();
  };
  if (document.body) arm(); else document.addEventListener('DOMContentLoaded', arm);
}

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera', 'microphone'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  if (OLD_REF) await page.route('**/js/idx-vc-textbook.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: OLD }));
  await page.route('**/api/**', r => { const u = r.request().url();
    if (/\/api\/class\/sessions\/today/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sessions: [{ room_id: ROOM, join_open: true }], current: { room_id: ROOM, join_open: true } }) });
    if (/\/api\/class\/verify-room/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authorized: true, resolved_role: 'student' }) });
    return r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }); });
  await page.addInitScript(INIT);
  return { ctx, page };
}
const ready = page => page.waitForFunction(() => typeof vcJoinRoom === 'function' && typeof window.wbRedrawAll === 'function'
  && typeof window.vcWaitCardSync === 'function', null, { timeout: 60000 });
async function collect(page) {
  await page.waitForFunction(() => !!window.__replayAt, null, { timeout: 25000 });
  await page.waitForTimeout(1500);
  return page.evaluate(async () => {
    const ops = (window.wbOps || []).slice();
    let ink = -1;
    try {
      vcSwitchTab('whiteboard'); await new Promise(r => setTimeout(r, 250));
      if (window.wbFitCanvas) window.wbFitCanvas(); window.wbRedrawAll();
      const cv = document.getElementById('wb-canvas');
      if (cv && cv.width && cv.height) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; ink = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60 && d[i + 3] > 200) ink++; }
    } catch (e) { ink = -2; }
    return { enterToReplay: window.__enterAt ? window.__replayAt - window.__enterAt : null, hasNotes: ops.some(o => o && o.d && /^Notes /.test(o.d.text || '')),
      hasOld: ops.some(o => o && o.d && o.d.text === 'OLD CLASS'), ink, ev: window.__ev.map(e => e.join(':')).join(' '),
      joins: window.__ev.filter(e => e[0] === 'join').length };
  });
}
async function freshTrial(lat, leftover) {
  const { ctx, page } = await newPage();
  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(l => sessionStorage.setItem('__sbLat', String(l)), lat);
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page); await page.waitForTimeout(300);
    await page.evaluate(a => { const lo = a.leftover;
      if (lo) (window.wbOps = window.wbOps || []).push({ k: 'text', d: { text: 'OLD CLASS', x: .5, y: .5 } });
      document.getElementById('vc-name-input').value = 'karl';
      const rc = document.getElementById('vc-roomcode-input'); if (rc) rc.value = a.room; document.getElementById('vc-room-input').value = '0000';
      vcJoinRoom(true);
    }, { leftover, room: ROOM });
    return await collect(page);
  } finally { await ctx.close(); }
}
async function refreshTrial(state, lat) {
  if (!state.page) {
    Object.assign(state, await newPage());
    await state.page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await ready(state.page); await state.page.waitForTimeout(300);
    await state.page.evaluate((room) => { document.getElementById('vc-name-input').value = 'karl';
      const rc = document.getElementById('vc-roomcode-input'); if (rc) rc.value = room; document.getElementById('vc-room-input').value = '0000'; vcJoinRoom(true); }, ROOM);
    await state.page.waitForFunction(() => !!window.__replayAt, null, { timeout: 25000 });
    await state.page.waitForTimeout(900);   // 새로고침 복귀 기록(sessionStorage)이 남을 시간
    await state.page.evaluate(() => { localStorage.setItem('mangoi_vc_uid', 'karl'); localStorage.setItem('mangoi_vc_pw', '0000'); });
  }
  await state.page.evaluate(l => sessionStorage.setItem('__sbLat', String(l)), lat);
  await state.page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });   // ← Karl 의 새로고침
  return await collect(state.page);
}

const results = []; let next = 0;
async function worker() {
  const state = {};
  while (true) {
    const i = next++; if (i >= TRIALS) break;
    const lat = Math.floor(Math.random() * LATMAX), leftover = Math.random() < 0.5;
    try {
      const r = MODE === 'refresh' ? await refreshTrial(state, lat) : await freshTrial(lat, leftover);
      r.lat = lat; r.leftover = leftover; results.push(r);
    } catch (e) {
      results.push({ lat, error: String(e && e.message || e).slice(0, 140) });
      if (state.ctx) { try { await state.ctx.close(); } catch (_) {} } for (const k of Object.keys(state)) delete state[k];
    }
  }
  if (state.ctx) await state.ctx.close();
}
await Promise.all(Array.from({ length: WORKERS }, worker));
await browser.close(); srv.kill();
const good = results.filter(r => !r.error), errs = results.filter(r => r.error);
const lost = good.filter(r => !r.hasNotes), early = good.filter(r => r.enterToReplay < 350), late = good.filter(r => r.enterToReplay >= 350);
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
console.log(`VARIANT=${VARIANT} MODE=${MODE} 시도=${results.length} 정상측정=${good.length} 측정오류=${errs.length}`);
console.log(`  입장→복원본 도착 중앙값 ${med(good.map(r => r.enterToReplay))}ms · 350ms 안 도착 ${early.length}건 / 뒤 ${late.length}건`);
console.log(`  ❗칠판 복원본 사라짐: ${lost.length}건 (350ms 안 도착 중 ${lost.filter(r => r.enterToReplay < 350).length}/${early.length}, 뒤 ${lost.filter(r => r.enterToReplay >= 350).length}/${late.length})`);
console.log(`  지난 수업 잔상 남음: ${good.filter(r => r.hasOld).length}건 · 복원본 있는데 화면 잉크 0: ${good.filter(r => r.hasNotes && r.ink === 0).length}건 · join 2회 이상: ${good.filter(r => r.joins > 1).length}건`);
if (errs.length) console.log('  측정오류 예:', errs.slice(0, 2).map(e => e.error).join(' | '));
if (lost.length) console.log('  사라진 예:', lost.slice(0, 3).map(r => `lat=${r.lat} [${r.ev}]`).join(' | '));
if (process.env.DUMP) good.slice(0, 6).forEach(r => console.log('   ', r.lat, r.enterToReplay, r.hasNotes, r.ev));
process.exit(!OLD_REF && (lost.length || !good.length) ? 1 : 0);
