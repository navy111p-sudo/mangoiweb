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
import zlib from 'node:zlib';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PORT = 9366;
const SRC = new URL('../../cloudflare-deploy/public/js/idx-vc-qlog.js', import.meta.url).pathname;
const BAK = SRC + '.aaobak';

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
  window.vcPeerRoles = { u1: 'student' }; window.vcMyRole = 'teacher';
  try { vcAddDmButton(box, 'u1'); } catch(e){}
  try { vcRefreshPraiseUI(); } catch(e){}
  await new Promise(r => setTimeout(r, 200));
  const vid = box.querySelector('video');
  try { Object.defineProperty(vid, 'videoWidth', { configurable: true, get: () => O.vw }); } catch(e){}
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
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('mangoi_vc_orientation_dismissed','1')}catch(e){}` });
  await cdp('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
  await new Promise(r => setTimeout(r, 3400));
}

console.log('\n════════ 음성전용 «화면 멈춤» 띠 — 브라우저 실측 ════════');

/* ───────── ① 전제 — 이 검사가 실제로 «그 화면» 을 보고 있는가 ───────── */
console.log('\n① 전제 — 수업 타일이 진짜로 그려졌는가');
await open(390, 844);
let r = await evalJs(SETUP({ why: 'aao', vw: 640 }));
ok(r && r.ok, '수업 화면이 펴지고 타일이 만들어졌다', JSON.stringify(r));
let m = await evalJs(MEASURE);
ok(!!m.star, '⭐ 칭찬 버튼이 실재한다 (없으면 아래 검사가 조용히 헛돈다)');
ok(!!m.dm, '💬 개별채팅 버튼이 실재한다');
ok(!!m.strip, '멈춤 띠가 생겼다');
ok(!!m.label, '이름표가 실재한다');

/* ───────── ② 글자 ───────── */
console.log('\n② 띠가 «무슨 말» 을 하는가');
ok(/영상 멈춤/.test(m.text || ''), '「영상 멈춤」이라고 말한다', m.text);
ok(/소리는 정상/.test(m.text || ''), '「소리는 정상」이라고 함께 말한다 — 소리까지 끊긴 줄 알면 나간다', m.text);
ok(/\d+초 전/.test(m.text || ''), '「N초 전 모습」으로 «지금이 아님» 을 말한다', m.text);
ok(!!m.ko && /영상 멈춤/.test(m.ko), 'data-ko 를 함께 단다 — 🌐 를 눌러도 따라오게 (CLAUDE.md 「JS 로 그린 라벨」)');
ok(m.clipped === false, '글자가 안 잘린다 (overflow:hidden 이라 잘려도 티가 안 난다)');

/* ───────── ③ 가림 — 픽셀로 잰다 ───────── */
console.log('\n③ 띠가 타일의 «누를 것» 을 덮지 않는가 — 화면 픽셀 실측');
let img = await shot();
const stripPx = pxAt(img, m.strip.cx, m.strip.cy);
console.log(`    · 띠 색 rgb(${stripPx.join(',')}) · 띠 ${Math.round(m.strip.w)}×${Math.round(m.strip.h)}px`);
const starPx = pxAt(img, m.star.cx, m.star.cy);
const dmPx = pxAt(img, m.dm.cx, m.dm.cy);
ok(!near(starPx, stripPx), `⭐ 칭찬 버튼이 띠 색으로 덮이지 않았다`, `별버튼 중앙 rgb(${starPx.join(',')}) · 띠 rgb(${stripPx.join(',')})`);
ok(!near(dmPx, stripPx), `💬 개별채팅 버튼이 띠 색으로 덮이지 않았다`, `DM 중앙 rgb(${dmPx.join(',')}) · 띠 rgb(${stripPx.join(',')})`);
const labelPx = pxAt(img, m.label.cx, m.label.cy);
ok(!near(labelPx, stripPx), '이름표가 띠 색으로 덮이지 않았다');

/* 일반 검사 — 앞으로 타일 위쪽에 무엇이 새로 붙어도 걸린다 */
const under = (m.parts || []).filter(p => p.z < m.stripZ);
ok(under.length === 0, `띠와 겹치는데 띠보다 «아래» 에 깔린 조각이 없다 (지금 ${m.parts.length}개 겹침 · 전부 위)`,
  under.map(p => `${p.cls} z=${p.z} < ${m.stripZ}`).join(' / '));

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
const fg = await evalJs(`(() => { const e=document.querySelector('#vc-video-u1 .vc-aao-freeze'); return getComputedStyle(e).color; })()`);
await evalJs(`(() => { const e=document.querySelector('#vc-video-u1 .vc-aao-freeze'); e.style.color='transparent'; return 1; })()`);
await new Promise(r => setTimeout(r, 120));
const bgImg = await shot();
const bgPx = pxAt(bgImg, m.strip.cx, m.strip.cy);        // 글자를 지운 자리 = 진짜 배경(합성 끝난 값)
await evalJs(`(() => { const e=document.querySelector('#vc-video-u1 .vc-aao-freeze'); e.style.color=''; return 1; })()`);
const fgRgb = (fg.match(/\d+/g) || []).slice(0, 3).map(Number);
const ratio = contrast(fgRgb, bgPx);
ok(ratio >= 4.5, `띠 글자 대비 ${ratio.toFixed(2)} ≥ 4.5`, `글자 rgb(${fgRgb.join(',')}) · 배경(실측) rgb(${bgPx.join(',')})`);

/* ───────── ⑥ «지금» 으로 오인되지 않는가 ───────── */
console.log('\n⑥ 멈춘 그림이 «지금» 으로 오인되지 않는가');
ok(/grayscale/.test(m.filter || ''), '멈춘 영상에 흑백을 입힌다');

/* ───────── ⑦ 좁은 폰 ───────── */
console.log('\n⑦ 좁은 폰(320px)에서도 같은가');
await open(320, 640);
await evalJs(SETUP({ why: 'aao', vw: 640 }));
const m320 = await evalJs(MEASURE);
ok(!!m320.strip, '띠가 생긴다');
ok(m320.clipped === false, '글자가 안 잘린다');
const img320 = await shot();
const sp320 = pxAt(img320, m320.strip.cx, m320.strip.cy);
ok(!!m320.star && !near(pxAt(img320, m320.star.cx, m320.star.cy), sp320), '⭐ 버튼이 안 덮인다');
ok(!!m320.dm && !near(pxAt(img320, m320.dm.cx, m320.dm.cy), sp320), '💬 버튼이 안 덮인다');
const under320 = (m320.parts || []).filter(p => p.z < m320.stripZ);
ok(under320.length === 0, '띠 아래 깔린 조각이 없다', under320.map(p => p.cls).join(' / '));
ok(m320.overlaps.length === 0, '누를 수 있는 조각끼리 겹치지 않는다', m320.overlaps.join(' / '));

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
    const im = await shot();
    const sp = pxAt(im, mm.strip.cx, mm.strip.cy);
    const covered = near(pxAt(im, mm.star.cx, mm.star.cy), sp) || near(pxAt(im, mm.dm.cx, mm.dm.cy), sp);
    ok(covered, '비켜서기를 빼면 버튼이 실제로 띠에 덮인다 (= ③이 헛돌지 않는다)');
    mutDone = true;
  }
} finally {
  if (existsSync(BAK)) { copyFileSync(BAK, SRC); unlinkSync(BAK); }
}
if (!mutDone) console.log('  (변이 복원 완료)');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
chrome.kill();
process.exit(fail ? 1 : 0);
