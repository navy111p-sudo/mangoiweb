// tool-dock-close-browser.mjs — 교재도구·필기도구·칠판 도구 «✕ 닫기» 실제 브라우저 반복 검사 (2026-10-08)
// ⚠️ 자동으로 안 돕니다(manual/). 사람이 부릅니다:
//    cd cloudflare-deploy/public && python3 -m http.server 8977 &   (다른 창)
//    ITER=60 node test-harness/manual/tool-dock-close-browser.mjs
// 실제 크로미움에서 진짜 마우스 좌표로 «✕ 닫기» 를 누르고, 매 조작 뒤
//   ① 열린 패널의 닫기 버튼이 «보이고» ② 그 좌표의 맨 위가 그 버튼이며(가려지지 않음)
//   ③ 누르면 닫히고 ④ 닫힌 패널의 버튼은 화면에 안 보이는지 잰다.
// 폭: 폰 세로 390×844 · 작은 폰 360×640 · 폰 가로 844×390 · PC 1280×800
import { readFileSync } from 'node:fs';
import { chromium } from '/opt/node-tools/node_modules/playwright-core/index.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8977';
const ITER = Number(process.env.ITER || 60);
const VPS = [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1280, height: 800 }];
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, i) => { if (c) pass++; else { fail++; if (fails.length < 30) fails.push(n + (i ? ' — ' + i : '')); } };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let ops = 0, hiddenTab = 0;
for (const vp of VPS) {
  const p = await b.newPage({ viewport: vp });
  await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
  // 변이시험: MUTANT_JS=<고친 사본> 이면 그 파일을 대신 내려준다(저장소 파일은 안 건드림)
  if (process.env.MUTANT_JS) await p.route('**/js/mango-tools-dock.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(process.env.MUTANT_JS, 'utf8') }));
  await p.goto(BASE + '/index.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const setup = await p.evaluate(() => {
    try { if (window.vcNukeRotationOverlays) vcNukeRotationOverlays(); } catch (e) {}
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-videocall-call').classList.add('active');
    document.body.classList.add('vc-in-call');
    return { dock: typeof window.mangoCloseToolDock, wb: !!document.querySelector('#tab-whiteboard .wb-toolbar') };
  });
  ok(`[${vp.width}] mangoCloseToolDock 로드`, setup.dock === 'function');
  ok(`[${vp.width}] 칠판 도구바 존재`, setup.wb);
  await p.waitForTimeout(1300);

  // 상태 읽기: 열린 패널·버튼 위치·맨 위 요소
  const state = () => p.evaluate(() => {
    const bars = { materials: document.querySelector('#tab-pdf .pdf-controls'), anno: document.querySelector('#tab-pdf .pdf-anno-bar'), wb: document.querySelector('#tab-whiteboard .wb-toolbar') };
    const open = (k, b) => k === 'wb' ? b.classList.contains('mango-wb-dock-open') : b.getAttribute('data-mango-dock-open') === 'true';
    const out = {};
    for (const [k, bar] of Object.entries(bars)) {
      const btns = bar.querySelectorAll(':scope > .mango-dock-close');
      const btn = btns[0];
      const br = bar.getBoundingClientRect();
      // 패널이 «다른 탭» 에 있어 탭째 숨겨진 경우는 화면에 없음(가리는 것도 없음) — 따로 센다
      const o = { open: open(k, bar), shown: br.width > 0 && br.height > 0, n: btns.length };
      if (btn) {
        const cs = getComputedStyle(btn); const r = btn.getBoundingClientRect();
        o.display = cs.display; o.rect = [r.left, r.top, r.width, r.height];
        o.visible = cs.display !== 'none' && r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
        if (o.visible) {
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          o.inView = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
          const t = document.elementFromPoint(cx, cy);
          o.onTop = !!t && (t === btn || btn.contains(t));
          o.topEl = t ? (t.id || String(t.className).slice(0, 40) || t.tagName) : null;
          o.cx = cx; o.cy = cy;
        }
      }
      out[k] = o;
    }
    return out;
  });

  let seed = vp.width * 7 + 13;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < ITER; i++) {
    const op = Math.floor(rnd() * 7);
    let name;
    if (op === 0) { name = 'toggle-materials'; await p.evaluate(() => mangoToggleToolDock('materials')); }
    else if (op === 1) { name = 'toggle-write'; await p.evaluate(() => mangoToggleToolDock('write')); }
    else if (op === 2) { name = 'to-whiteboard'; await p.evaluate(() => { try { vcSwitchTab('whiteboard'); } catch (e) {} }); }
    else if (op === 3) { name = 'to-pdf'; await p.evaluate(() => { try { vcSwitchTab('pdf'); } catch (e) {} }); }
    else if (op === 4) { name = 'lang'; await p.evaluate(() => { try { setLang(getLang() === 'en' ? 'ko' : 'en'); } catch (e) {} }); }
    else { name = 'click-close'; }
    await p.waitForTimeout(op === 4 ? 400 : 120);
    let st = await state();
    const tag = `[${vp.width}x${vp.height} #${i} ${name}]`;
    for (const [k, o] of Object.entries(st)) {
      ok(`${tag} ${k} 버튼 최대 1개`, o.n <= 1, o.n);
      if (o.open && !o.shown) { hiddenTab++; continue; }
      if (o.open) {
        ok(`${tag} 열린 ${k} 에 버튼 보임`, o.n === 1 && o.visible, JSON.stringify(o));
        if (o.visible) {
          ok(`${tag} 열린 ${k} 버튼이 화면 안`, o.inView, JSON.stringify(o.rect));
          ok(`${tag} 열린 ${k} 버튼이 맨 위(안 가려짐)`, o.onTop, o.topEl);
        }
      } else if (o.n) {
        ok(`${tag} 닫힌 ${k} 버튼은 안 보임`, !o.visible, o.display);
      }
    }
    const openOne = Object.entries(st).find(([, o]) => o.open && o.visible && o.onTop);
    if (name === 'click-close' && openOne) {
      const [k, o] = openOne;
      await p.mouse.click(o.cx, o.cy);   // 진짜 마우스 좌표 클릭
      await p.waitForTimeout(150);
      st = await state();
      ok(`${tag} 진짜 클릭으로 ${k} 닫힘`, Object.values(st).every(x => !x.open), JSON.stringify(Object.fromEntries(Object.entries(st).map(([a, b]) => [a, b.open]))));
      ok(`${tag} 닫힌 뒤 버튼 숨음`, Object.values(st).every(x => !x.visible));
    }
    ops++;
  }
  await p.close();
}
await b.close();
console.log(`tool-dock-close-browser — 화면 ${VPS.length}종 × 조작 ${ITER}회 = ${ops}회 (숨은 탭에 열린 패널 ${hiddenTab}회 — 화면에 없음)`);
fails.forEach(f => console.log('❌ FAIL ' + f));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
