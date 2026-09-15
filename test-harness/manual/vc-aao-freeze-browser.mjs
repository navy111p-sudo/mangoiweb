/* vc-aao-freeze-browser.mjs — 음성전용(AAO) «화면 멈춤» 띠를 «진짜 타일 위에» 그려서 잰다 (2026-09-11)
 *
 * 왜 필요한가
 *   2026-09-10 에 「얼굴을 지우는 대신 마지막 장면에서 멈춤」을 넣으면서 타일 «위쪽» 에 띠를 붙였다.
 *   자동 하니스(aao_freeze_harness 60종)도 타입체크도 전부 초록이었는데, 실제로 그려서 픽셀을 재니
 *   ⭐ 칭찬 버튼과 개별채팅 버튼이 **띠에 통째로 덮여** 있었다 — 390px 폰에서 별버튼 중앙 픽셀이
 *   띠의 갈색 rgb(121,53,15) 이었다. 띠가 pointer-events:none 이라 «눌리기는 하는데 안 보이는» 상태였고,
 *   하필 그 버튼이 1P=1원 포인트를 주는 자리다.
 *   ⟹ 「있다」·「보인다」·「안 가려진다」는 전부 다른 값이다. 여기서는 «안 가려진다» 를 픽셀로 잰다.
 *
 * ⚠️ manual/ 규약상 자동으로 안 돕니다 — AAO 띠·타일 위쪽 버튼(별·개별채팅·화면공유 배지)을 건드리면
 *    사람이 부르세요.
 *      cd cloudflare-deploy/public && python3 -m http.server 8899 &
 *      node test-harness/manual/vc-aao-freeze-browser.mjs
 *
 * ⚠️ file:// 로 열면 <script src="/js/…"> 가 전부 404 라 아무 것도 확인되지 않는다(CLAUDE.md 함정).
 * ⚠️ 캐시를 «두 겹» 다 꺼야 한다 — HTTP 캐시만 끄면 public/sw.js 가 cache-first 로 옛 사본을 준다.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import zlib from 'node:zlib';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PORT = 9366;
const SRC = new URL('../../cloudflare-deploy/public/js/idx-vc-qlog.js', import.meta.url).pathname;
/* ⛔ 백업을 public/ «안» 에 두지 말 것 — deploy.ps1 이 그 폴더를 통째로 업로드해서
      중간에 죽으면 사본이 실서비스로 나간다. 그리고 «다음 실행이 먼저 복구» 하게 둔다. */
const BAK = join(tmpdir(), 'mangoi-aao-qlog.bak');
if (existsSync(BAK)) { copyFileSync(BAK, SRC); unlinkSync(BAK); console.log('⚠️ 지난 실행이 남긴 변이를 먼저 되돌렸습니다'); }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

if (!existsSync(CHROME)) { console.log('⏭️  크로미움이 없어 건너뜁니다: ' + CHROME); process.exit(0); }
try { const r = await fetch(BASE + '/index.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
catch (e) {
  console.log('⏭️  로컬 서버가 없어 건너뜁니다 (' + BASE + ') — ' + e.message);
  console.log('    cd cloudflare-deploy/public && python3 -m http.server 8899 &');
  process.exit(0);
}

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 2500));

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const cdp = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await cdp('Page.enable'); await cdp('Runtime.enable');

/* ── PNG 한 장을 직접 푼다(8bit, 비인터레이스). 배경이 «사진·그라데이션·반투명» 이어도 안 틀린다. ── */
function decodePng(b) {
  let p = 8, w = 0, h = 0, ct = 0, bd = 0; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p); const t = b.toString('ascii', p + 4, p + 8);
    if (t === 'IHDR') { w = b.readUInt32BE(p + 8); h = b.readUInt32BE(p + 12); bd = b[p + 16]; ct = b[p + 17]; }
    else if (t === 'IDAT') idat.push(b.slice(p + 8, p + 8 + len));
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('8bit PNG 가 아닙니다');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 1, bpp = ch, stride = w * bpp;
  const out = Buffer.alloc(h * stride); let o = 0, q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++]; const line = raw.slice(q, q + stride); q += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[o + x - bpp] : 0, up = y > 0 ? out[o - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? out[o - stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c); }
      out[o + x] = v & 255;
    }
    o += stride;
  }
  return { w, h, bpp, stride, data: out };
}
async function shot() {
  const s = await cdp('Page.captureScreenshot', { format: 'png' });
  return decodePng(Buffer.from(s.result.data, 'base64'));
}
const pxAt = (img, x, y) => { const i = y * img.stride + x * img.bpp; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const near = (a, b, tol = 14) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

/* ── 수업 화면을 펴고 «진짜» 원격 타일 하나를 만든다. 입장(WS·동의모달)은 거치지 않는다. ──
   ⚠️ mangoConsentEnsure 가 vcJoinRoom 을 감싸 «사람이 누를 때까지» 멈추는 것이 알려진 함정이라,
      여기서는 타일을 만드는 코드(vcAddDmButton·vcRefreshPraiseUI)만 그대로 부른다. */
const SETUP = (opts) => `(async () => {
  const O = ${JSON.stringify(opts)};
  document.body.classList.add('vc-in-call');
  try { window.vcNukeRotationOverlays && window.vcNukeRotationOverlays(); } catch(e){}
  const v = document.getElementById('view-videocall-call');
  if (v) { v.style.display='block'; v.classList.add('active'); }
  document.querySelectorAll('.view,[id^="view-"]').forEach(e => { if (e.id!=='view-videocall-call') e.style.display='none'; });
  const grid = document.getElementById('vc-video-grid');
  if (!grid) return { err: 'no grid' };
  let box = document.getElementById('vc-video-u1');
  if (!box) {
    box = document.createElement('div');
    box.className = 'video-box'; box.id = 'vc-video-u1'; box.dataset.role = 'student';
    box.innerHTML = '<video autoplay playsinline muted></video><span class="video-label">학생 김사랑</span>';
    grid.insertBefore(box, document.getElementById('vc-local-box') || null);
  }
  window.vcPeerRoles = { u1: 'student' }; window.vcMyRole = O.role || 'teacher';
  /* ⚠️ «타일을 손으로 만들면» 실제 경로가 붙이는 조각이 빠진다 — 그러면 아래 검사가 0 of 0 으로 통과한다.
     실제로 밟았다: ⇱ 분리 버튼(vcAddDetachButton)을 안 불러 「겹침 0개」가 나왔는데 실은 덮여 있었다. */
  try { vcAddDetachButton(box); } catch(e){}
  try { vcAddDmButton(box, 'u1'); } catch(e){}
  try { vcRefreshPraiseUI(); } catch(e){}
  if (O.netlow) { try { vcNetPeerMark('u1', true); } catch(e){} }   // 📶 «이 학생 인터넷이 불안정해요» — AAO 와 같은 조건에서 뜬다
  await new Promise(r => setTimeout(r, 200));
  const vid = box.querySelector('video');
  try { Object.defineProperty(vid, 'videoWidth', { configurable: true, get: () => O.vw }); } catch(e){}
  for (let k = 2; k <= (O.tiles || 1); k++) {           // 여러 명 — 타일이 작아진다
    const id = 'u' + k;
    if (document.getElementById('vc-video-' + id)) continue;
    const b2 = document.createElement('div');
    b2.className = 'video-box'; b2.id = 'vc-video-' + id; b2.dataset.role = 'student';
    b2.innerHTML = '<video autoplay playsinline muted></video><span class="video-label">학생 ' + k + '</span>';
    grid.insertBefore(b2, document.getElementById('vc-local-box') || null);
  }
  try { vcUpdateGridCount(); } catch(e){}
  await new Promise(r => setTimeout(r, 150));
  window.vcRemoteCamOff = { u1: O.why };
  window.vcApplyRemoteCamHint('u1');
  await new Promise(r => setTimeout(r, 150));
  return { ok: true };
})()`;

/* 타일 안의 «보이는 조각» 을 전부 재서 돌려준다 — 띠와 겹치는데 z-index 가 낮은 것이 있으면 덮인 것이다. */
const MEASURE = `(() => {
  const box = document.getElementById('vc-video-u1');
  if (!box) return { err: 'no box' };
  const R = el => { const b = el.getBoundingClientRect(); return { t: b.top, l: b.left, w: b.width, h: b.height, cx: Math.round(b.left + b.width/2), cy: Math.round(b.top + b.height/2) }; };
  const z = el => { const v = parseInt(getComputedStyle(el).zIndex, 10); return isNaN(v) ? 0 : v; };
  const st = box.querySelector('.vc-aao-freeze');
  const out = { box: R(box), strip: st ? R(st) : null, stripZ: st ? z(st) : null,
                text: st ? st.textContent : null, ko: st ? st.getAttribute('data-ko') : null,
                clipped: st ? (st.scrollHeight > st.clientHeight + 1) : null,
                hasClass: box.classList.contains('vc-aao-on'),
                aaoH: box.style.getPropertyValue('--aao-h'),
                filter: (box.querySelector('video')||{}).style ? box.querySelector('video').style.filter : '',
                cover: !!box.querySelector('.vc-camoff-hint'),
                parts: [] };
  if (st) {
    const sr = st.getBoundingClientRect();
    box.querySelectorAll('*').forEach(el => {
      if (el === st || st.contains(el)) return;
      if (el.tagName === 'VIDEO') return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const hit = !(b.right <= sr.left || b.left >= sr.right || b.bottom <= sr.top || b.top >= sr.bottom);
      if (!hit) return;
      out.parts.push({ cls: el.className || el.tagName, z: z(el), cx: Math.round(b.left+b.width/2), cy: Math.round(b.top+b.height/2) });
    });
  }
  /* «누를 수 있는 조각» 끼리 서로 겹치지 않는가 — 하나를 비켜 주다 그 밑칸에 올라타는 일을 잡는다.
     (실제로 밟았다: ⭐·💬 만 내렸더니 💬 가 🎛 장치 도우미 위에 얹혔다.) */
  const hot = [];
  box.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute') return;
    if (cs.pointerEvents === 'none') return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    hot.push({ cls: el.className || el.tagName, t: b.top, l: b.left, r: b.right, b: b.bottom });
  });
  out.overlaps = [];
  for (let i = 0; i < hot.length; i++) for (let j = i + 1; j < hot.length; j++) {
    const a = hot[i], c = hot[j];
    if (!(a.r <= c.l || a.l >= c.r || a.b <= c.t || a.t >= c.b)) out.overlaps.push(a.cls + ' \u2715 ' + c.cls);
  }
  out.hotCount = hot.length;
  const g = s => { const el = box.querySelector(s); return el ? R(el) : null; };
  out.star = g('.vc-star-btn'); out.dm = g('.vc-dm-btn'); out.label = g('.video-label');
  out.devhelp = g('.vc-devhelp-btn');
  /* ⇱ 분리 버튼(z-index 5)·📶 회선 경고(z-index 9 · pointer-events:none) — 둘 다 위 두 검사에
     «원리상» 안 걸려서 한 번 새어 나갔다. 보이는 것만 싣는다. */
  const vis = s => { const el = box.querySelector(s); if (!el) return null; const cs = getComputedStyle(el);
    return (cs.display === 'none' || cs.visibility === 'hidden') ? null : R(el); };
  out.detach = vis('.video-detach-btn'); out.netlow = vis('.vc-netlow-hint');
  return out;
})()`;

const topAt = (sel) => `(() => {
  const box = document.getElementById('vc-video-u1');
  const el = box && box.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const b = el.getBoundingClientRect();
  const hit = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
  return hit ? (el === hit || el.contains(hit) ? 'SELF' : ((hit.className || hit.tagName) + ' z=' + getComputedStyle(hit).zIndex)) : null;
})()`;

async function open(w, h) {
  await cdp('Network.enable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Network.setBypassServiceWorker', { bypass: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
  /* ⚠️ 이 등록은 «누적» 된다 — 회차마다 부르면 쌓인다(CLAUDE.md 「스텁을 회차마다 쌓지 마세요」).
     지금 넣는 것이 멱등한 한 줄이라도 한 번만 건다. */
  if (!open._armed) { open._armed = 1; await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('mangoi_vc_orientation_dismissed','1')}catch(e){}` }); }
  await cdp('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
  await new Promise(r => setTimeout(r, 3400));
}

console.log('\n════════ 음성전용 «화면 멈춤» 띠 — 브라우저 실측 ════════');

/* ───────── ① 전제 — 이 검사가 실제로 «그 화면» 을 보고 있는가 ───────── */
console.log('\n① 전제 — 수업 타일이 진짜로 그려졌는가');
await open(390, 844);
let r = await evalJs(SETUP({ why: 'aao', vw: 640, netlow: true }));
ok(r && r.ok, '수업 화면이 펴지고 타일이 만들어졌다', JSON.stringify(r));
let m = await evalJs(MEASURE);
ok(!!m.star, '⭐ 칭찬 버튼이 실재한다 (없으면 아래 검사가 조용히 헛돈다)');
ok(!!m.dm, '💬 개별채팅 버튼이 실재한다');
ok(!!m.strip, '멈춤 띠가 생겼다');
ok(!!m.label, '이름표가 실재한다');

/* ───────── ② 글자 ───────── */
console.log('\n② 띠가 «무슨 말» 을 하는가');
/* ⛔ 문구를 «글자 그대로» 못 박지 말 것 — 2026-09-11 에 다른 세션이 한/영 병기를 넣으며
   「소리는 정상」을 「소리 정상」으로 줄이자 «보장은 그대로인데 검사만» 빨간불이 났다.
   물어야 할 것은 «그 말을 하는가» 이지 «그 글자인가» 가 아니다. */
ok(/영상 멈춤/.test(m.text || ''), '「영상 멈춤」이라고 말한다', m.text);
ok(/소리/.test(m.text || '') && /정상|괜찮|OK|fine/i.test(m.text || ''),
  '소리는 괜찮다고 «함께» 말한다 — 소리까지 끊긴 줄 알면 나간다', m.text);
ok(/\d+초 전/.test(m.text || ''), '「N초 전」으로 «지금이 아님» 을 말한다', m.text);
ok(/[가-힣]/.test(m.text || '') && /[A-Za-z]/.test(m.text || ''),
  '한국어와 영어가 «늘 함께» 있다 — 폰 언어가 EN 인 한국인이 영어만 받던 사고(#930)', m.text);
ok(!!m.ko && /영상 멈춤/.test(m.ko), 'data-ko 를 함께 단다 — 🌐 를 눌러도 따라오게 (CLAUDE.md 「JS 로 그린 라벨」)');
ok(m.clipped === false, '글자가 안 잘린다 (overflow:hidden 이라 잘려도 티가 안 난다)');

/* ───────── ③ 가림 — 픽셀로 잰다 ───────── */
console.log('\n③ 띠가 타일의 «누를 것» 을 덮지 않는가 — 화면 픽셀 실측');
/* ⚠️ 띠 «가운데» 는 글자가 지나간다 — 그 픽셀을 «띠 색» 으로 쓰면 회차마다 값이 흔들려
      비교가 되다 말다 한다(실제로 밟았다: rgb(111,49,14) 와 rgb(156,111,84) 가 번갈아 나왔다).
   ✅ 글자를 잠깐 투명으로 만들고 찍으면 그 자리가 «합성이 끝난 진짜 배경» 이다. 버튼 색은 그대로다. */
const stripText = (hide) => `(() => { const e=document.querySelector('#vc-video-u1 .vc-aao-freeze'); if(e) e.style.color=${hide ? "'transparent'" : "''"}; return 1; })()`;
const fgColor = await evalJs(`(() => { const e=document.querySelector('#vc-video-u1 .vc-aao-freeze'); return getComputedStyle(e).color; })()`);
await evalJs(stripText(true)); await new Promise(r => setTimeout(r, 120));
let img = await shot();
await evalJs(stripText(false));
const stripPx = pxAt(img, m.strip.cx, m.strip.cy);
console.log(`    · 띠 색 rgb(${stripPx.join(',')}) · 띠 ${Math.round(m.strip.w)}×${Math.round(m.strip.h)}px`);
const starPx = pxAt(img, m.star.cx, m.star.cy);
const dmPx = pxAt(img, m.dm.cx, m.dm.cy);
ok(!near(starPx, stripPx), `⭐ 칭찬 버튼이 띠 색으로 덮이지 않았다`, `별버튼 중앙 rgb(${starPx.join(',')}) · 띠 rgb(${stripPx.join(',')})`);
ok(!near(dmPx, stripPx), `💬 개별채팅 버튼이 띠 색으로 덮이지 않았다`, `DM 중앙 rgb(${dmPx.join(',')}) · 띠 rgb(${stripPx.join(',')})`);
const labelPx = pxAt(img, m.label.cx, m.label.cy);
ok(!near(labelPx, stripPx), '이름표가 띠 색으로 덮이지 않았다');
/* 📶 회선 경고 — AAO 와 «같은 조건»(회선이 나쁠 때) 에서 뜨는데 z-index 가 띠와 같아(9)
   «아래 깔림» 검사에도 «겹침» 검사(pointer-events:none)에도 안 걸린다. 픽셀로만 보인다. */
ok(!!m.netlow, '📶 회선 경고가 실재한다 (없으면 아래 검사가 헛돈다 — 강사 화면 전용)');
ok(!!m.netlow && !near(pxAt(img, m.netlow.cx, m.netlow.cy), stripPx),
  '📶 회선 경고가 띠 색으로 덮이지 않았다',
  m.netlow ? `경고 중앙 rgb(${pxAt(img, m.netlow.cx, m.netlow.cy).join(',')}) · 띠 rgb(${stripPx.join(',')})` : '');

/* 일반 검사 — 앞으로 타일 위쪽에 무엇이 새로 붙어도 걸린다.
   ⛔ «z-index 가 띠보다 낮은가» 로 묻지 말 것 — 같은 z(9)이면 DOM 순서로 띠가 이기고,
      pointer-events:none 인 배지는 겹침 검사에도 안 걸린다. 실제로 그 둘이 각각 새어 나갔다.
   ✅ 그래서 «겹친 조각의 가운데가 띠 색으로 칠해졌는가» 를 픽셀로 직접 본다. */
const painted = (m.parts || []).filter(p => near(pxAt(img, p.cx, p.cy), stripPx));
ok(painted.length === 0,
  `띠와 겹치는 조각 ${m.parts.length}개가 전부 «자기 색» 으로 보인다 (덮인 것 0)`,
  painted.map(p => `${p.cls} z=${p.z}`).join(' / '));

/* ───────── ④ 눌리는가 ───────── */
console.log('\n④ 「보인다」와 「눌린다」는 다른 값이다');
ok((await evalJs(topAt('.vc-star-btn'))) === 'SELF', '⭐ 버튼 중앙의 «맨 위» 가 그 버튼 자신이다');
ok((await evalJs(topAt('.vc-dm-btn'))) === 'SELF', '💬 버튼 중앙의 «맨 위» 가 그 버튼 자신이다');
ok(!!m.devhelp, '🎛 장치 도우미 버튼이 실재한다 (없으면 아래 겹침 검사가 헛돈다)');
ok((await evalJs(topAt('.vc-devhelp-btn'))) === 'SELF', '🎛 장치 도우미 중앙의 «맨 위» 가 그 버튼 자신이다');
m = await evalJs(MEASURE);
ok(m.overlaps.length === 0,
  `누를 수 있는 조각 ${m.hotCount}개가 서로 겹치지 않는다 — 비켜 주다 «밑칸» 에 올라타지 않았다`,
  m.overlaps.join(' / '));

/* ───────── ⑤ 읽히는가 ───────── */
console.log('\n⑤ 띠 글자가 읽히는가 — WCAG 대비');
const fgRgb = (fgColor.match(/\d+/g) || []).slice(0, 3).map(Number);
const ratio = contrast(fgRgb, stripPx);                  // stripPx = 글자를 지우고 찍은 «진짜 배경»
ok(ratio >= 4.5, `띠 글자 대비 ${ratio.toFixed(2)} ≥ 4.5`, `글자 rgb(${fgRgb.join(',')}) · 배경(실측) rgb(${stripPx.join(',')})`);

/* ───────── ⑥ «지금» 으로 오인되지 않는가 ───────── */
console.log('\n⑥ 멈춘 그림이 «지금» 으로 오인되지 않는가');
ok(/grayscale/.test(m.filter || ''), '멈춘 영상에 흑백을 입힌다');

/* ───────── ⑦ 좁은 폰 ───────── */
console.log('\n⑦ 좁은 폰(320px)에서도 같은가');
await open(320, 640);
await evalJs(SETUP({ why: 'aao', vw: 640, netlow: true }));
const m320 = await evalJs(MEASURE);
ok(!!m320.strip, '띠가 생긴다');
ok(m320.clipped === false, '글자가 안 잘린다');
await evalJs(stripText(true)); await new Promise(r => setTimeout(r, 120));
const img320 = await shot();
await evalJs(stripText(false));
const sp320 = pxAt(img320, m320.strip.cx, m320.strip.cy);
ok(!!m320.star && !near(pxAt(img320, m320.star.cx, m320.star.cy), sp320), '⭐ 버튼이 안 덮인다');
ok(!!m320.dm && !near(pxAt(img320, m320.dm.cx, m320.dm.cy), sp320), '💬 버튼이 안 덮인다');
const painted320 = (m320.parts || []).filter(p => near(pxAt(img320, p.cx, p.cy), sp320));
ok(painted320.length === 0, `띠와 겹친 조각 ${m320.parts.length}개가 전부 자기 색이다`, painted320.map(p => p.cls).join(' / '));
ok(m320.overlaps.length === 0, '누를 수 있는 조각끼리 겹치지 않는다', m320.overlaps.join(' / '));

/* ───────── ⑦-2 학생이 보는 화면 — ⇱ 분리 버튼이 여기서만 보인다 ───────── */
console.log('\n⑦-2 학생이 보는 선생님 타일 (칭찬 UI 가 없어 ⇱ 분리 버튼이 산다)');
await open(390, 844);
await evalJs(SETUP({ why: 'aao', vw: 640, netlow: true, role: 'student' }));
const ms = await evalJs(MEASURE);
ok(!!ms.detach, '⇱ 분리 버튼이 실재한다 (없으면 이 절이 통째로 헛돈다)');
/* ℹ️ 📶 회선 경고는 여기 없다 — vcNetPeerMark 가 vcIsTeacherRole() 게이트라 «강사 화면에만» 뜬다.
      그래서 그 검사는 위 ③(강사 화면)에 둔다. */
await evalJs(stripText(true)); await new Promise(r => setTimeout(r, 120));
const imgS = await shot();
await evalJs(stripText(false));
const spS = pxAt(imgS, ms.strip.cx, ms.strip.cy);
ok(!!ms.detach && !near(pxAt(imgS, ms.detach.cx, ms.detach.cy), spS),
  '⇱ 분리 버튼이 띠 색으로 덮이지 않았다 (z-index 5 라 «아래» 검사로만 걸린다)',
  ms.detach ? `분리 중앙 rgb(${pxAt(imgS, ms.detach.cx, ms.detach.cy).join(',')}) · 띠 rgb(${spS.join(',')})` : '');
const paintedS = (ms.parts || []).filter(p => near(pxAt(imgS, p.cx, p.cy), spS));
ok(paintedS.length === 0, `띠와 겹친 조각 ${ms.parts.length}개가 전부 자기 색이다`, paintedS.map(p => p.cls).join(' / '));

/* ───────── ⑦-3 여러 명 — 타일이 작아지면 밀린 버튼이 아래 칸과 만나는가 ───────── */
console.log('\n⑦-3 4명이 한 화면일 때 (타일이 작아진다)');
await open(390, 844);
await evalJs(SETUP({ why: 'aao', vw: 640, netlow: true, tiles: 4 }));
const m4 = await evalJs(MEASURE);
ok(!!m4.strip, '띠가 생긴다');
console.log(`    · 타일 ${Math.round(m4.box.w)}×${Math.round(m4.box.h)}px · 띠 ${Math.round(m4.strip.h)}px`);
ok(m4.overlaps.length === 0, `작은 타일에서도 누를 수 있는 조각끼리 겹치지 않는다`, m4.overlaps.join(' / '));
const inBox = (r) => r && r.t >= m4.box.t - 1 && (r.t + r.h) <= m4.box.t + m4.box.h + 1;
ok(inBox(m4.star) && inBox(m4.dm), '밀린 ⭐·💬 가 타일 «안» 에 남는다 (밖으로 나가면 안 보인다)',
  `⭐ ${m4.star && Math.round(m4.star.t - m4.box.t)}px · 💬 ${m4.dm && Math.round(m4.dm.t - m4.box.t)}px · 타일 높이 ${Math.round(m4.box.h)}px`);

/* ───────── ⑧ 되돌리기 ───────── */
console.log('\n⑧ 회복하면 «고치기 전» 으로 깨끗이 돌아가는가');
await open(390, 844);
await evalJs(SETUP({ why: 'aao', vw: 640 }));
const before = await evalJs(MEASURE);
const starTopOn = before.star.t - before.box.t;
await evalJs(`(() => { window.vcRemoteCamOff = {}; window.vcApplyRemoteCamHint('u1'); return 1; })()`);
await new Promise(r => setTimeout(r, 150));
const after = await evalJs(MEASURE);
ok(!after.strip, '띠가 사라진다');
ok(!/grayscale/.test(after.filter || ''), '흑백이 풀린다');
ok(after.hasClass === false, '타일의 vc-aao-on 클래스가 지워진다');
ok(!after.aaoH, '--aao-h 가 지워진다 (남으면 다음에 «이미 비킨» 상태로 계속 내려간다)');
const starTopOff = after.star.t - after.box.t;
ok(starTopOff < starTopOn, `⭐ 버튼이 제자리로 돌아온다 (${Math.round(starTopOn)}px → ${Math.round(starTopOff)}px)`);

/* ───────── ⑨ 짝 — «아무 때나» 멈춤으로 그리지 않는가 ───────── */
console.log('\n⑨ 짝 검사 — 멈춤으로 그리면 «안 되는» 경우');
await open(390, 844);
await evalJs(SETUP({ why: 'user', vw: 640 }));
const mu = await evalJs(MEASURE);
ok(!mu.strip, '사람이 카메라를 껐을 때(reason=user)는 멈춤 띠를 안 쓴다 — 프라이버시');
ok(mu.cover === true, '그때는 옛 전면 안내(.vc-camoff-hint)가 그대로 뜬다');

await open(390, 844);
await evalJs(SETUP({ why: 'aao', vw: 0 }));
const mz = await evalJs(MEASURE);
ok(!mz.strip, '한 프레임도 안 온 상대(videoWidth 0)에는 «멈춤» 이라 말하지 않는다 — 검은 바탕에 적으면 거짓말');
ok(mz.cover === true, '그때는 옛 전면 안내가 그대로 뜬다');


/* ───────── ⑪ 마지막 모습 — 영상이 «죽어도» 얼굴이 남는가 (2026-09-15) ─────────
   사장님 「음성만 나올 땐 화면은 교사의 얼굴이 멈춤 상태라도 나오게 해줘. 검게 하지 말고
   반드시 마지막 모습이 계속 나오게 할 수 있지??」

   [왜 브라우저가 필요한가] 자동 하니스(aao_freeze_harness Ⓕ)는 가짜 canvas 로 «배선과 답» 을
     본다. 그런데 진짜로 궁금한 것은 **toDataURL 이 실제 <video> 에서 던지지 않는가**(tainted)와
     «그림이 화면에 실제로 붙는가» 이고, 그 둘은 가짜 DOM 이 원리상 못 잰다.
   ⚠️ 진짜 MediaStream 을 쓴다 — canvas.captureStream() 이라 카메라 권한이 없어도 프레임이 흐른다. */
console.log('\n⑪ 마지막 모습 — 영상이 죽어도 얼굴이 남는가');
await open(390, 844);
await evalJs(SETUP({ why: 'aao', vw: 640 }));
/* 그 타일의 <video> 에 «진짜로 흐르는» 영상을 물린다 */
const s1 = await evalJs(`(async () => {
  const box = document.getElementById('vc-video-u1');
  const v = box.querySelector('video');
  /* 🪤 SETUP 은 videoWidth 를 «가짜 getter»(Object.defineProperty)로 고정한다 — 그대로 두면
     진짜 영상을 물려도 값이 안 바뀌고, 이 절이 통째로 헛돈다(여기서 실제로 밟았다).
     ⚠️ 그리고 SETUP 이 이미 AAO 를 걸어 둬서 «멈춤 중» 이다 — 그 상태에서는 일부러 안 뜬다.
        둘 다 걷고 «살아 있는 수업» 으로 되돌린 뒤에 재야 한다. */
  try { delete v.videoWidth; } catch (e) {}
  window.vcRemoteCamOff = {};
  try { window.vcApplyRemoteCamHint('u1'); } catch (e) {}
  const c = document.createElement('canvas'); c.width = 320; c.height = 180;
  const g = c.getContext('2d'); g.fillStyle = '#e0552b'; g.fillRect(0, 0, 320, 180);
  v.srcObject = c.captureStream(5);
  try { await v.play(); } catch (e) {}
  await new Promise(r => setTimeout(r, 800));
  const w0 = v.videoWidth;
  try { vcAaoTick(); } catch (e) { return { err: String(e) }; }
  const st = (typeof __vcAaoStill !== 'undefined') ? __vcAaoStill['u1'] : null;
  return { vw: w0, got: !!st, head: st ? st.slice(0, 22) : '', len: st ? st.length : 0 };
})()`);
ok(s1 && s1.vw > 0, '⑪-0 전제: 타일의 영상이 실제로 흐른다(videoWidth=' + (s1 && s1.vw) + ')');
ok(s1 && s1.got, '⑪-1 📷 진짜 <video> 에서 한 장을 뜬다 — toDataURL 이 tainted 로 던지지 않는다', s1 && s1.err);
ok(s1 && /^data:image\/jpeg/.test(s1.head || ''), '⑪-2 JPEG dataURL 이다 (' + (s1 && s1.len) + '자 — 타일당 이 정도만 들고 있는다)');

/* 그 뒤 영상이 «죽는다»(트랙 유실) — 예전에는 여기서 전면 덮개로 떨어져 새까매졌다 */
const s2 = await evalJs(`(async () => {
  const box = document.getElementById('vc-video-u1');
  const v = box.querySelector('video');
  /* 🔎 «어떻게 맞출지» 는 타일마다 다르다(가상배경·화면공유는 contain, 폰 세로 상대 타일은 cover).
     정본 vcSmartFitVideo 가 살아 있을 때 인라인으로 박아 두는 값을 흉내낸다. */
  v.style.setProperty('object-fit', 'contain', 'important');
  v.srcObject = null;
  await new Promise(r => setTimeout(r, 400));
  window.vcRemoteCamOff = window.vcRemoteCamOff || {};
  window.vcRemoteCamOff['u1'] = 'aao';
  window.vcApplyRemoteCamHint('u1');
  await new Promise(r => setTimeout(r, 300));
  const img = box.querySelector('.vc-aao-still');
  const r = img ? img.getBoundingClientRect() : null;
  return {
    vw: v.videoWidth,
    still: !!img,
    src: img ? /^data:image\\/jpeg/.test(img.getAttribute('src') || '') : false,
    w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
    z: img ? getComputedStyle(img).zIndex : '',
    gray: img ? /grayscale/.test(getComputedStyle(img).filter || '') : false,
    fit: img ? getComputedStyle(img).objectFit : '',
    cover: !!box.querySelector('.vc-camoff-hint'),
    strip: !!box.querySelector('.vc-aao-freeze')
  };
})()`);
ok(s2 && s2.vw === 0, '⑪-3 전제: 영상이 실제로 죽었다(videoWidth=0)');
ok(s2 && s2.still && s2.src, '⑪-4 📷 영상이 죽어도 «마지막 모습» 이 타일에 남는다');
ok(s2 && s2.w > 0 && s2.h > 0, '⑪-5 그 그림이 «실제로 그려졌다»(' + (s2 && s2.w) + '×' + (s2 && s2.h) + ') — 0 이면 붙기만 한 것');
ok(s2 && !s2.cover, '⑪-6 ⛔ 옛 전면 덮개(.vc-camoff-hint)로 떨어지지 않는다');
ok(s2 && s2.strip, '⑪-7 멈춤 띠도 함께 붙는다 — «지금» 으로 오인되지 않게');
ok(s2 && s2.gray, '⑪-8 흑백으로 깐다(띠와 같은 이유)');
ok(s2 && String(s2.z) === '2', '⑪-9 z-index 2 — 이름표(3)·띠(9) 아래라 그 둘을 가리지 않는다');
ok(s2 && s2.fit === 'contain',
   '⑪-10 🔎 «어떻게 맞출지» 를 그 영상에게서 베낀다 — contain 이던 타일은 contain (지금 ' + (s2 && s2.fit) + ')');

/* 짝 — «전부 contain» 이 아니라 «그 영상을 따라간다» 는 것을 본다.
   ⛔ 한쪽만 두면 cover 를 박아 넣은 옛 코드도, «전부 contain» 인 엉터리 수리도 통과합니다. */
const s2b = await evalJs(`(async () => {
  const box = document.getElementById('vc-video-u1');
  const v = box.querySelector('video');
  v.style.setProperty('object-fit', 'cover', 'important');
  window.vcApplyRemoteCamHint('u1');
  await new Promise(r => setTimeout(r, 200));
  const img = box.querySelector('.vc-aao-still');
  return { fit: img ? getComputedStyle(img).objectFit : '' };
})()`);
ok(s2b && s2b.fit === 'cover',
   '⑪-11 🔎 (짝) cover 이던 타일은 cover — 한쪽으로 박아 두지 않는다 (지금 ' + (s2b && s2b.fit) + ')');

/* ───────── ⑩ 변이시험 — 이 검사가 헛돌지 않는가 ───────── */
console.log('\n⑩ 변이시험 — 비켜서기를 되돌리면 실제로 빨간불이 나는가');
let mutDone = false;
try {
  copyFileSync(SRC, BAK);                       // ⚠️ git 이 아니라 «사본» 으로 되돌린다(커밋 안 한 작업이 섞인다)
  const orig = readFileSync(SRC, 'utf8');
  const mutated = orig.replace(/\n\s*vcAaoShift\(box, el\);/g, '\n    /* (변이) */');
  if (mutated === orig) { console.log('  ⚠️ 변이 지점을 못 찾았습니다 — 검사가 헛돌 수 있습니다'); fail++; }
  else {
    writeFileSync(SRC, mutated);
    await open(390, 844);
    await evalJs(SETUP({ why: 'aao', vw: 640 }));
    const mm = await evalJs(MEASURE);
    await evalJs(stripText(true)); await new Promise(r => setTimeout(r, 120));
    const im = await shot();
    await evalJs(stripText(false));
    const sp = pxAt(im, mm.strip.cx, mm.strip.cy);
    const covered = near(pxAt(im, mm.star.cx, mm.star.cy), sp) || near(pxAt(im, mm.dm.cx, mm.dm.cy), sp);
    ok(covered, '비켜서기를 빼면 버튼이 실제로 띠에 덮인다 (= ③이 헛돌지 않는다)');
    mutDone = true;
  }
} finally {
  if (existsSync(BAK)) { copyFileSync(BAK, SRC); unlinkSync(BAK); }
}
process.on('exit', () => { try { chrome.kill(); } catch (_) {} });   // ⚠️ 중간에 죽어도 브라우저를 남기지 않는다
if (!mutDone) console.log('  (변이 복원 완료)');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
chrome.kill();
process.exit(fail ? 1 : 0);
