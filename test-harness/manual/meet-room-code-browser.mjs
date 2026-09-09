/* manual/meet-room-code-browser.mjs — 회의방 번호가 «진짜 화면에서» 맞물리는가 (2026-09-09)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다(manual/ 규약: 게이트가 물어 가지 않음).
 *
 *   준비:  cd cloudflare-deploy/public && python3 -m http.server 8921
 *          /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
 *            --remote-debugging-port=9331 --user-data-dir=/tmp/cd about:blank &
 *   실행:  node test-harness/manual/meet-room-code-browser.mjs
 *
 * [왜] 2026-09-09 사장님 제보 — 교사가 회의방 1234 를 여는데 학생은 mangoi-class 에 있었다.
 *      로비에 «1234» 를 쳐도 방 id 가 `1234` 라 `meet-1234` 와 만나지 못했다.
 *      문자열 하니스(meet_room_code_harness)는 «두 규칙이 같은 말을 하나» 까지만 본다.
 *      «그 규칙이 진짜로 이 화면에 실려서 입장 직전에 도는가» 는 여기서만 잰다.
 *
 * ⚠️ 되돌려 보면 실제로 FAIL 납니다(실측: 래퍼에서 normalizeRoomInput 을 빼면
 *    「입장 직전 방 코드 칸 → "1234"」로 사고가 그대로 재현되고 1건 FAIL).
 * ⚠️ 이름 칸을 «비워» 두는 것이 핵심입니다 — 진짜 vcJoinRoom 은 첫 줄에서 곧바로 return 하므로
 *    소켓·카메라를 건드리지 않고 «래퍼가 한 일» 만 깨끗하게 잽니다.
 *    (이름을 채우면 헤드리스 렌더러가 alert/미디어에서 멈춰 검사가 통째로 헛돕니다 — 실제로 밟음)
 */
const PORT = Number(process.env.CDP_PORT || 9331);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8921';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waits = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; waits.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
});
const evalJs = async (expr) => {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    new Promise((_, rj) => setTimeout(() => rj(new Error('EVAL-TIMEOUT')), 12000))
  ]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
/* 헤드리스에서 alert/confirm 이 뜨면 렌더러가 멈춘다 — 무조건 닫는다 */
ws.addEventListener('message', e => { const m = JSON.parse(e.data);
  if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: false }).catch(()=>{}); });
await send('Network.setCacheDisabled', { cacheDisabled: true });
try { await send('Network.setBypassServiceWorker', { bypass: true }); } catch (_) {}
await send('Page.navigate', { url: BASE + '/index.html?_nc=' + Date.now() });
await new Promise(r => setTimeout(r, 3500));

let P = 0, F = 0;
const t = (name, got, want) => { const okk = String(got) === String(want); okk ? P++ : F++;
  console.log(`  ${okk ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(got)}${okk ? '' : ' (기대 ' + JSON.stringify(want) + ')'}`); };

console.log('① 해석 정본이 화면에 실려 있는가');
t('typeof vcResolveRoomCode', await evalJs('typeof window.vcResolveRoomCode'), 'function');
for (const [i, o] of [['1234','meet-1234'],['melca','meet-melca'],['mangoi-class','mangoi-class'],
                      ['demo-1','demo-1'],['class-849-20260909','class-849-20260909'],['meet-1234','meet-1234'],['','']])
  t(`resolve(${JSON.stringify(i)})`, await evalJs(`window.vcResolveRoomCode(${JSON.stringify(i)})`), o);

console.log('② 실사고 재현 — 로비에 «1234» 를 치고 입장을 누르면 어느 방으로 가나');
// 진짜 입장(소켓·카메라)은 안 시킨다. 래퍼가 원래 함수를 부르는 그 순간 값을 가로챈다.
const got = await evalJs(`(function(){
  var box = document.getElementById('vc-roomcode-input');
  box.value = '1234';
  /* 지금 걸려 있는 래퍼를 그대로 부른다. 이름 칸이 비어 있으므로 원본 vcJoinRoom 은
     첫 줄에서 곧바로 return 하고, 그때 normalizeRoomInput() 은 «이미» 돌았다.
     → 소켓·카메라를 건드리지 않고 «래퍼가 한 일» 만 잰다. */
  try { window.vcJoinRoom.call(window); } catch(e){}
  return box.value;
})()`);
t('입장 직전 방 코드 칸', got, 'meet-1234');
const opened = await evalJs(`(function(){var i=document.getElementById('vc-roomcode-input');var d=i.closest('details');return d? !!d.open : 'no-details';})()`);
t('바뀐 값을 사람에게 «보여 주는가»(칸이 펴짐)', opened, 'true');

console.log('②-2 대문자로 쳐도 같은 방인가 (폰 키보드 첫 글자 대문자)');
for (const [inp, want] of [['Meet-1234','meet-1234'], ['MEET-1234','meet-1234'], ['1234','meet-1234']]) {
  const v = await evalJs(`(function(){window.alert=function(){};var b=document.getElementById('vc-roomcode-input');b.value=${JSON.stringify(inp)};document.getElementById('vc-name-input').value='';try{window.vcJoinRoom.call(window);}catch(e){}return b.value;})()`);
  t(`«${inp}» 입장 직전 칸`, v, want);
}
console.log('②-3 칸에 대문자·자동고침 방어가 실제로 붙었는가');
for (const [a, want] of [['autocapitalize','off'], ['autocorrect','off'], ['spellcheck','false']])
  t(a, await evalJs(`document.getElementById('vc-roomcode-input').getAttribute(${JSON.stringify(a)})`), want);

console.log('③ 공용방 폴백은 예전 그대로인가 (빈칸)');
const blank = await evalJs(`(function(){var b=document.getElementById('vc-roomcode-input');b.value='';try{window.vcJoinRoom.call(window);}catch(e){}return b.value;})()`);
t('빈칸은 빈칸 그대로', blank, '');

/* ④ 로비 안내 두 줄이 «읽히는가» (2026-09-09 사장님 지시로 고친 자리)
   문자열 하니스(meet_room_code_harness ⑩)는 «무슨 글자인가» 까지만 본다.
   «그 글자가 화면에서 읽히는가»(대비)·«가려지지 않는가»·«🌐 를 눌러도 두 줄이 남는가» 는 여기서만 잰다.

   🔴 대비는 «CSS 를 읽어 합성하는» 방식으로 재지 않는다 — 그 방식으로 재 봤더니
      **이미 몇 달째 배포돼 잘 보이는 초록 줄까지 «대비 2.94, 실패»** 로 나왔다(2026-09-09 실측).
      원인 셋: ① 한 요소의 background-color 와 background-image 는 «둘 중 하나» 가 아니라
      «색 위에 이미지» 라 색이 불투명하면 그 아래는 안 보이는데 후보로 나란히 셌고
      ② 이 화면 뒤에는 **배경 «사진»**(url(...))이 깔려 있어 CSS 만으로는 색을 알 수 없으며
      ③ 그래서 최악 조합이 body 의 흰색(rgb(244,247,252))까지 비쳐 보게 만들었다.
      ⟹ «틀린 실패» 는 다음 사람이 멀쩡한 색을 고치러 가게 만든다. 그래서 **픽셀을 직접 잰다** —
        글자를 잠깐 투명으로 만들어 그 자리를 찍고(=진짜 배경), 계산된 글자색을 그 위에 합성한다.
        사진·그라데이션·반투명이 몇 겹이든 원리상 안 틀린다. */
console.log('④ 로비 안내 두 줄이 읽히는가');
/* 폰 폭으로 재운다 — 학생 대부분이 폰이고, 좁은 폭에서만 줄이 쪼개진다.
   ⛔ isMobile 은 켜지 않는다(레이아웃 뷰포트가 어긋나 좌표가 틀어진다 — CLAUDE.md 2장). */
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
await evalJs(`(function(){ try{ showView('view-videocall-lobby'); }catch(e){} })()`);
await new Promise(r => setTimeout(r, 800));

/* ── 픽셀을 읽는다: PNG(8bit, 비인터레이스)만 푼다 — 크로미움 스크린샷이 그 형식이다 ── */
import { inflateSync } from 'node:zlib';
function pngPixels(b64) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 아님');
  let off = 8, w = 0, hgt = 0, ct = 6, depth = 8, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); hgt = data.readUInt32BE(4); depth = data[8]; ct = data[9];
                           if (data[12]) throw new Error('인터레이스는 안 푼다'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error('8bit 만 푼다');
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!ch) throw new Error('RGB/RGBA 만 푼다');
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * hgt * ch);
  const stride = w * ch;
  for (let y = 0; y < hgt; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const A = x >= ch ? out[y * stride + x - ch] : 0;
      const B = y > 0 ? out[(y - 1) * stride + x] : 0;
      const C = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += A; else if (f === 2) v += B; else if (f === 3) v += (A + B) >> 1;
      else if (f === 4) { const pp = A + B - C, pa = Math.abs(pp - A), pb = Math.abs(pp - B), pc = Math.abs(pp - C);
                          v += (pa <= pb && pa <= pc) ? A : (pb <= pc ? B : C); }
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h: hgt, ch, px: out };
}
const lum = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

const meta = await evalJs(`(function(){
  var box = document.getElementById('vc-roomcode-input'), det = box && box.closest('details');
  var out = [], n = det && det.previousElementSibling;
  while (n) { if (n.tagName === 'DIV' && n.hasAttribute('data-ko')) out.unshift(n); else break; n = n.previousElementSibling; }
  window.__banner = out;
  if (out[0]) out[0].scrollIntoView({ block: 'center' });
  function opac(el){ var o=1,x=el,g=0; while(x&&x.nodeType===1&&g++<40){ var v=parseFloat(getComputedStyle(x).opacity); if(!isNaN(v)) o*=v; x=x.parentElement; } return o; }
  return out.map(function (el) {
    var cs = getComputedStyle(el), r = el.getBoundingClientRect();
    var m = /rgba?\\(([^)]+)\\)/.exec(cs.color) || [0,'0,0,0'];
    var p = m[1].split(',').map(parseFloat);
    var lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    /* ⚠️ elementFromPoint 는 «뷰포트 밖» 이면 null 을 준다 → 화면 밖 요소는 가림 검사가
       «무조건 통과» 가 된다(함정 대조가 잡았습니다). 그래서 못 쟀으면 «못 쟀다» 고 말한다. */
    var onScreen = r.top >= 0 && r.bottom <= innerHeight && r.width > 0;
    var covered = onScreen ? null : '미측정(화면 밖)';
    if (onScreen)
      for (var x = r.left + 8; x < r.right - 8 && !covered; x += Math.max(24, (r.width - 16) / 6))
        for (var y = r.top + 6; y < r.bottom - 6; y += Math.max(8, (r.height - 12) / 3)) {
          var top = document.elementFromPoint(x, y);
          if (top && top !== el && !el.contains(top) && !top.contains(el)) { covered = top.id || String(top.className) || top.tagName; break; }
        }
    return { ko: (el.getAttribute('data-ko') || '').slice(0, 14),
             fg: { r: p[0], g: p[1], b: p[2], a: (p.length > 3 ? p[3] : 1) * opac(el) },
             fontPx: parseFloat(cs.fontSize),
             lines: Math.round((r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh),
             /* 🔴 captureScreenshot 의 clip 은 «문서» 좌표이고 rect 는 «뷰포트» 좌표다.
                스크롤을 안 더하면 엉뚱한 자리(배경 사진)를 찍고 «대비 1.17» 같은 거짓 실패가 난다 — 실제로 밟음. */
             rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
             onScreen: onScreen,
             covered: covered };
  });
})()`);
/* ⛔ «정확히 2» 로 못 박지 말 것 — 나중에 안내를 한 줄 정당하게 더하면
   보장은 세지는데 검사만 빨간불이 난다(CLAUDE.md 2장 「목록·개수를 못 박은 검사」). */
t('안내 줄이 «둘 이상» 으로 나뉘어 있다 (' + meta.length + '개)', meta.length >= 2, true);

for (let i = 0; i < meta.length; i++) {
  const m = meta[i];
  // 글자를 잠깐 투명으로 → 그 자리를 찍는다 = «진짜 배경»(사진·그라데이션 포함)
  await evalJs(`(function(){ window.__banner[${i}].style.setProperty('color','transparent','important'); })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false,
    clip: { x: m.rect.x + 6, y: m.rect.y + 6, width: Math.max(8, m.rect.w - 12), height: Math.max(8, m.rect.h - 12), scale: 1 } });
  await evalJs(`(function(){ window.__banner[${i}].style.removeProperty('color'); })()`);
  const img = pngPixels(shot.data);
  // 글자에 가장 불리한 배경 = 대비가 가장 낮아지는 픽셀. 밝은 글자면 «가장 밝은» 배경이 최악.
  let worst = 99, wl = null;
  for (let k = 0; k < img.w * img.h; k++) {
    const o = k * img.ch, R = img.px[o], G = img.px[o + 1], B = img.px[o + 2];
    const bl = lum(R, G, B);
    const cr = m.fg.r * m.fg.a + R * (1 - m.fg.a), cg = m.fg.g * m.fg.a + G * (1 - m.fg.a), cb = m.fg.b * m.fg.a + B * (1 - m.fg.a);
    const tl = lum(cr, cg, cb);
    const ratio = (Math.max(tl, bl) + 0.05) / (Math.min(tl, bl) + 0.05);
    if (ratio < worst) { worst = ratio; wl = [R, G, B]; }
  }
  const need = (m.fontPx >= 24) ? 3 : 4.5;
  console.log(`    · ${m.ko}… 글자 rgb(${m.fg.r},${m.fg.g},${m.fg.b}) · 최악 배경 rgb(${wl}) · 대비 ${Math.round(worst * 100) / 100} (필요 ${need}) · ${m.rect.w}x${m.rect.h} · ${m.lines}줄`);
  t(`«${m.ko}» 대비 ≥ ${need}`, worst >= need, true);
  t(`«${m.ko}» 화면 안에 온전히 보인다`, m.onScreen, true);
  t(`«${m.ko}» 가리는 것이 없다`, m.covered, null);
  t(`«${m.ko}» 낱글자로 쪼개지지 않는다(≤3줄)`, m.lines <= 3, true);
}

console.log('④-2 🌐 를 눌러도 두 줄이 그대로 남는가 (i18n 이 자식을 안 먹는가)');
/* ⚠️ 언어 판정은 반드시 getLang() 으로 — index.html 은 i18n 엔진이 «둘» 이고
   나중에 로드되는 js/mango-i18n.js 가 setLang/getLang/toggleLang 을 덮어쓴다(CLAUDE.md 2장).
   toggleLang 은 인자를 안 받으므로 «누른 뒤 지금 언어» 를 물어 그 속성과 대조한다. */
/* 한 번만 누르면 그 회차의 «시작 언어» 에 따라 KO 로 돌아올 수도 있다 —
   두 번 눌러 **KO·EN 을 둘 다** 실제로 지나가게 한다. */
const seen = new Set();
for (let k = 0; k < 2; k++) {
  await evalJs(`(function(){ try { (window.toggleLang || function(){})(); } catch(e){} })()`);
  await new Promise(r => setTimeout(r, 250));   // i18n 스윕이 한 틱 뒤에 돌 수 있다 — 안 기다리면 플레이크
  const after = await evalJs(`(function(){
    var lang = (window.getLang ? window.getLang() : (document.documentElement.lang || 'ko'));
    var key = 'data-' + (String(lang).slice(0,2) === 'en' ? 'en' : 'ko');
    var els = window.__banner;
    return { n: els.length, lang: lang,
             okAll: els.map(function(e){ return e.textContent.trim() === (e.getAttribute(key)||'').trim(); }) };
  })()`);
  seen.add(String(after && after.lang).slice(0, 2));
  t(`🌐 전환 뒤 줄이 그대로 남는다 (${after && after.lang})`, (after && after.n) >= 2, true);
  t(`🌐 전환 뒤 두 줄 모두 «${after && after.lang}» 로 바뀐다`, JSON.stringify(after && after.okAll), JSON.stringify([true, true]));
}
/* ⛔ 전제 — 두 언어를 «둘 다» 지나갔는가. 안 두면 KO 만 두 번 보고도 통과한다. */
t('KO·EN 을 둘 다 지나갔다', JSON.stringify([...seen].sort()), JSON.stringify(['en', 'ko']));

try { await send('Emulation.clearDeviceMetricsOverride'); } catch (_) {}   // 같은 크롬으로 다른 검사를 이어 돌릴 때를 위해 되돌린다

console.log(`\n결과: PASS ${P} / FAIL ${F}`);
ws.close();
process.exit(F ? 1 : 0);
