// 🖐 A.i 선생님 수업 — «선생님 화면 크게·작게» 브라우저 하니스 (2026-10-19)
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      PW_DIR=/tmp/pw node test-harness/manual/ai-class-teacher-resize-browser.mjs
// 진짜 크로미움에 페이지를 그려 «실제로 끌고 누르고» 칸 폭·그림 크기를 잽니다.
//   ① ◀(크게)·▶(작게) · 키보드(←→ Home End Enter) · 끌기 · 두 번 누르기(원래대로)
//   ② 얼굴 보호 상한 — 끝까지 끌어도 오른쪽 칸 전체 가로÷세로가 1.25 를 안 넘는다 · 그때 ◀ 비활성
//   ③ 짝: 수업이 흘러 대답 보기가 떴다 사라져도 칸 폭이 그대로(6초 동안 1px 도 안 움직임)
//   ④ 창 크기를 바꿔도 고른 값 그대로 다시 잰다 · 폰(390)에서는 손잡이가 숨는다
//   ⑤ 화살표가 수업 단축키로 새지 않는다 · 페이지 오류 0
// 실패하면 종료코드 1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { requireBrowser } from './_pw.mjs';

const { chromium, exe } = requireBrowser();
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const PUB = process.env.PUB || path.join(HERE, '..', '..', 'cloudflare-deploy', 'public');
const PORT = 8700 + Math.floor(Math.random() * 300);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/textbook-files') { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":true,"items":[]}'); }
  if (u.pathname.startsWith('/api/')) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end('{"ok":false}'); }
  const fp = path.join(PUB, decodeURIComponent(u.pathname));
  if (!fp.startsWith(PUB) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain', 'Cache-Control': 'no-store' }); r.end(fs.readFileSync(fp));
}).listen(PORT);

let fail = 0, pass = 0;
const ok = (n, c, x = '') => { if (c) pass++; else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const b = await chromium.launch({ executablePath: exe, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await b.newContext({ viewport: { width: 1383, height: 786 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => { try { localStorage.setItem('aiClassName', '민서'); localStorage.removeItem('aiClassTeacherW'); } catch (e) {} });
  await p.goto('http://127.0.0.1:' + PORT + '/ai-class.html?_nc=' + Date.now());
  await p.waitForTimeout(1500);
  await p.click('#startBtn'); await p.waitForTimeout(1500);
  // 비활성 버튼에서 30초 기다리다 죽지 않게 — 짧게 기다리고 «그 버튼» 을 이름으로 찍는다
  const click = (sel) => p.click(sel, { timeout: 3000 }).catch(e => ok('누를 수 있어야 한다: ' + sel, false, String(e.message).split('\n')[0]));
  const st = () => p.evaluate(() => {
    const T = window.__aiClassTeacherW, t = document.getElementById('tTile');
    return { frac: T.get(), want: T.want(), capped: T.capped(), side: T.sideAspect(), tile: t.offsetWidth / t.offsetHeight,
      big: document.getElementById('tBig').disabled, small: document.getElementById('tSmall').disabled, ls: localStorage.getItem('aiClassTeacherW') };
  });
  let s = await st(); ok('시작은 원래 배치(null)', s.frac === null, JSON.stringify(s));
  // ① 버튼
  await click('#tBig'); s = await st(); ok('◀ 누르면 커진다', s.frac > 0.32, JSON.stringify(s));
  ok('고른 값을 저장한다', s.ls && Math.abs(+s.ls - s.frac) < 0.002, JSON.stringify(s));
  await click('#tSmall'); await click('#tSmall'); s = await st(); ok('▶ 두 번이면 원래보다 작다', s.frac < 0.31, JSON.stringify(s));
  // ① 키보드
  await p.focus('#tSplitBar');
  await p.keyboard.press('Home'); s = await st(); ok('Home = 최대(상한)', s.capped && s.side <= 1.26, JSON.stringify(s));
  ok('② 최대면 ◀ 비활성', s.big === true);
  await p.keyboard.press('End'); s = await st(); ok('End = 최소 · ▶ 비활성', s.small === true && s.frac <= 0.21, JSON.stringify(s));
  await p.keyboard.press('Enter'); s = await st(); ok('Enter = 원래대로 · 저장 비움', s.frac === null && s.ls === '', JSON.stringify(s));
  // ① 끌기
  const bb = await (await p.$('#tSplit')).boundingBox();
  // 손잡이 «위쪽» 을 잡는다 — 아래쪽은 수업이 흐르면 대답 고르기 상자(.sim)가 덮는다(그 상자가 이겨야 맞다: ⑤ 짝 검사)
  const sx = bb.x + bb.width / 2, sy = bb.y + bb.height * 0.1;
  await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx - 150, sy, { steps: 8 });
  s = await st(); ok('왼쪽으로 끌면 커진다', s.frac > 0.38, JSON.stringify(s));
  const tip = await p.evaluate(() => { const e = document.getElementById('tSplitTip'); return !e.hidden && e.textContent; });
  ok('끄는 동안 % 를 보여 준다', !!tip, String(tip));
  await p.mouse.up(); s = await st(); ok('놓으면 저장', s.ls && Math.abs(+s.ls - s.want) < 0.002, JSON.stringify(s));
  await p.mouse.move(sx - 150, sy); await p.mouse.down(); await p.mouse.move(150, sy, { steps: 8 }); await p.mouse.up();
  s = await st(); ok('② 끝까지 끌어도 얼굴 상한', s.capped && s.side <= 1.26, JSON.stringify(s));
  const bb2 = await (await p.$('#tSplit')).boundingBox();
  await p.mouse.dblclick(bb2.x + bb2.width / 2, bb2.y + bb2.height * 0.1); s = await st(); ok('두 번 누르면 원래대로', s.frac === null, JSON.stringify(s));
  // ④ 창 크기
  await p.evaluate(() => window.__aiClassTeacherW.set(0.4, true));
  await p.setViewportSize({ width: 1920, height: 1000 }); await p.waitForTimeout(400); s = await st();
  ok('④ 큰 창 — 고른 값(40%) 그대로', Math.abs(s.want - 0.4) < 0.002 && s.side <= 1.26, JSON.stringify(s));
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  const disp = await p.evaluate(() => getComputedStyle(document.getElementById('tSplit')).display);
  ok('④ 폰(390)에서는 손잡이가 숨는다', disp === 'none', disp);
  await p.setViewportSize({ width: 1383, height: 786 }); await p.waitForTimeout(400); s = await st();
  ok('④ PC 로 돌아오면 고른 값 그대로', Math.abs(s.frac - 0.4) < 0.003, JSON.stringify(s));
  // ③ 출렁임 없음 — 수업이 흐르는 동안(대답 보기가 떴다 사라짐) 6초간 폭을 잰다
  const w0 = await p.evaluate(() => document.querySelector('.side').offsetWidth);
  const ws = [];
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(500); ws.push(await p.evaluate(() => document.querySelector('.side').offsetWidth)); }
  ok('③ 6초 동안 칸 폭이 그대로', ws.every(w => w === w0), w0 + ' → ' + ws.join(','));
  // ⑤ 짝: 대답 고르기 상자가 떠 있으면 손잡이가 그 위를 가로채지 않는다(보기 버튼이 눌려야 한다)
  const cover = await p.evaluate(() => {
    const sim = document.getElementById('sim'), sp = document.getElementById('tSplit');
    if (!sim || sim.hidden) return 'no-sim';
    const r = sim.getBoundingClientRect(), s2 = sp.getBoundingClientRect(), x = s2.left + s2.width / 2;
    if (x < r.left || x > r.right) return 'no-overlap';
    const e = document.elementFromPoint(x, r.top + r.height / 2);
    return e && sim.contains(e) ? 'sim-wins' : 'split-wins:' + (e && (e.id || e.className));
  });
  console.log('  (대답 고르기 상자: ' + cover + ')');
  ok('⑤ 대답 고르기 상자 위에서는 보기가 이긴다(손잡이가 클릭을 안 뺏음)', cover !== 'split-wins' && !String(cover).startsWith('split-wins'), cover);
  // ⑤ 단축키 누수
  const leaked = await p.evaluate(() => { let got = 0; const h = () => got++; window.addEventListener('keydown', h); document.getElementById('tSplitBar').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); window.removeEventListener('keydown', h); return got; });
  ok('⑤ 화살표가 수업 단축키로 새지 않는다', leaked === 0, 'got=' + leaked);
  ok('⑤ 페이지 오류 0', errs.length === 0, errs.join(' | '));
} catch (e) { ok('실행 중 예외', false, String(e && e.message)); }
await b.close(); srv.close();
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
