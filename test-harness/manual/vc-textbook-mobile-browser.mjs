/* vc-textbook-mobile-browser.mjs — 휴대폰 교재 화면을 «진짜 브라우저에» 그려서 잰다 (2026-08-25)
 *
 * 왜 필요한가
 *   여기서 고친 것들은 전부 «함수도 값도 다 있고, 몇 픽셀인가 / 어느 순서인가만 틀린» 종류다.
 *   글자를 찾는 회귀 하니스 207개와 타입체크는 이 버그들이 살아 있는 동안 «전부 초록불» 이었다.
 *   그래서 여기서는 캔버스의 실제 점 개수와, 두 손가락을 실제로 벌렸다 떼었을 때의 배율을 잰다.
 *
 * ⚠️ manual/ 규약상 자동으로 안 돕니다 — 교재 렌더·핀치·확대버튼을 건드리면 사람이 부르세요.
 *      cd cloudflare-deploy/public && python3 -m http.server 8899 &
 *      node test-harness/manual/vc-textbook-mobile-browser.mjs
 *
 * ⚠️ file:// 로 열면 <script src="/js/…"> 가 전부 404 라 아무 것도 확인되지 않는다(CLAUDE.md 함정).
 *    반드시 로컬 HTTP 서버로 띄운다.
 */
import { spawn } from 'node:child_process';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const PORT = 9351;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

/* ⚠️ --disable-gpu 로 띄우면 MediaPipe 가 WebGL 이 없어 죽는다(CPU 델리게이트에서도 GL 을 쓴다).
   그러면 «파일이 잘못됐다» 로 오진하게 된다 — 소프트웨어 GL(SwiftShader)로 띄운다. */
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
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};
await cdp('Page.enable');
await cdp('Runtime.enable');

/* 수업 화면을 실제로 펴고 교재 한 장을 그린다 — 입장(WS·동의모달)은 거치지 않는다.
   ⚠️ mangoConsentEnsure 가 vcJoinRoom 을 감싸 «사람이 누를 때까지» 멈추는 것이 알려진 함정이라,
      여기서는 그리기 경로(pdfLoad)만 직접 부른다. */
const OPEN_CALL = `(async () => {
  document.body.classList.add('vc-in-call');
  /* 세로 폰은 「화면을 가로로 돌려주세요」 오버레이가 수업 화면을 덮고 그 아래를 잠근다.
     사람은 「이대로 보기」를 눌러 넘기므로, 여기서도 그 버튼이 부르는 함수를 그대로 부른다. */
  try { if (typeof window.vcNukeRotationOverlays === 'function') window.vcNukeRotationOverlays(); } catch(e){}
  var v = document.getElementById('view-videocall-call');
  if (v) { v.style.display = 'block'; v.classList.add('active'); }
  document.querySelectorAll('.view, [id^="view-"]').forEach(function(e){
    if (e.id !== 'view-videocall-call') e.style.display = 'none';
  });
  if (typeof vcSwitchTab === 'function') try { vcSwitchTab('pdf'); } catch(e){}
  var w = document.getElementById('pdf-scroll-wrap');
  if (w) { w.style.minHeight = '260px'; }
  await new Promise(r => setTimeout(r, 200));
  return !!document.getElementById('pdf-canvas');
})()`;

/* ⚠️ 빈 브라우저는 «첫 방문자» 다 (CLAUDE.md 함정표).
   · 세로 폰에서는 「화면을 가로로 돌려주세요」 오버레이가 수업 화면 전체를 덮고
     그 아래를 pointer-events:none 으로 잠근다 — 사람은 「이대로 보기」를 눌러 넘긴다.
   · 그 상태로 재면 멀쩡한 버튼도 «다른 것이 덮는다» 로 나와 없는 버그를 쫓게 된다.
   실제 사용자는 한 번 넘기면 다시 안 뜨므로, 여기서도 «이미 넘긴» 상태로 연다. */
const AS_RETURNING_USER = `try{
  localStorage.setItem('mangoi_vc_orientation_dismissed','1');
  localStorage.setItem('mangoi_admin_welcome_v1_done','1');
}catch(e){}`;

async function load(w, h, dpr, lang) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: AS_RETURNING_USER });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (lang) await cdp('Emulation.setUserAgentOverride', { userAgent: (await evalJs('navigator.userAgent')) || 'Mozilla/5.0', acceptLanguage: lang });
  await cdp('Page.navigate', { url: BASE + '/index.html' });
  await new Promise(r => setTimeout(r, 3200));
}

console.log('\n════════ 휴대폰 교재 화면 — 브라우저 실측 ════════');

/* ── 1부. 교재를 화면 배율만큼 촘촘히 그리는가 ────────────────── */
console.log('\n① 교재 해상도 (390×844 · 화면배율 3)');
await load(390, 844, 3, 'ko-KR');
ok(await evalJs('typeof window._pdfDPR === "number"'), '_pdfDPR 이 정의됐다 (defer 파일이 실제로 실행됨)');
ok(await evalJs('window._pdfDPR') === 2, '화면배율 3인 기기에서 상한 2로 잘린다 (점 9배 → 4배)', '실측 ' + await evalJs('window._pdfDPR'));
await evalJs(OPEN_CALL);
const drew = await evalJs(`(async()=>{ try { await pdfLoad('/img/mango-char.png','image'); await new Promise(r=>setTimeout(r,600)); return true; } catch(e){ return String(e); } })()`);
ok(drew === true, 'pdfLoad 로 교재 한 장이 그려졌다', String(drew));
const m = await evalJs(`(()=>{ var c=document.getElementById('pdf-canvas');
  return JSON.stringify({ w:c.width, h:c.height, sw:parseFloat(c.style.width)||0, sh:parseFloat(c.style.height)||0,
    aw:(function(){var a=document.getElementById('pdf-anno');return a?a.width:0})(),
    asw:(function(){var a=document.getElementById('pdf-anno');return a?parseFloat(a.style.width)||0:0})() }); })()`);
const M = JSON.parse(m);
ok(M.sw > 0, '캔버스에 «보이는 크기»(style.width)가 정해져 있다 — 없으면 교재가 화면을 넘는다', JSON.stringify(M));
ok(Math.abs(M.w / M.sw - 2) < 0.02, '점 개수가 보이는 크기의 2배다 = 화면 배율만큼 촘촘하다',
  `w=${M.w} style=${M.sw} 비율=${(M.w / M.sw).toFixed(3)}`);
ok(Math.abs(M.h / M.sh - 2) < 0.02, '세로도 같은 배율이다', `h=${M.h} style=${M.sh}`);
ok(M.aw === M.w && Math.abs(M.asw - M.sw) < 1, '필기 겹칩 캔버스가 교재와 정확히 겹친다 (어긋나면 펜 자국이 밀린다)',
  `anno ${M.aw}/${M.asw} vs pdf ${M.w}/${M.sw}`);

/* ── 2부. 핀치로 키운 배율이 손을 떼도 남는가 ──────────────────
   ⚠️ 손가락을 «벌리는» 처리(setupPdfTouchPan)는 vcJoinRoom **안에서** 등록된다.
      여기서는 방에 실제로 들어가지 않으므로 그 처리는 없다 — 대신 그 처리가 하는 일을
      그대로 재현한다: 벌리는 동안 pdfSetZoom(큰값) → 손을 떼면 원래 코드가
      «더블탭» 으로 오인해 pdfSetZoom(1) 을 부른다. 이 파일이 고친 것이 바로 그 마지막 한 번이다.
   ✅ 터치 신호는 CDP 로 «진짜» 보낸다 — 캡처 단계 감시가 실제 손가락 수를 세는지까지 확인된다. */
console.log('\n② 핀치 확대 — 손을 떼도 배율이 남는가');
const wrapBox = await evalJs(`(()=>{var w=document.getElementById('pdf-scroll-wrap');var r=w.getBoundingClientRect();
  return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), w:Math.round(r.width), h:Math.round(r.height)});})()`);
const B = JSON.parse(wrapBox);
ok(B.w > 0 && B.h > 0, '교재 상자가 화면에 실제로 그려져 있다', JSON.stringify(B));

const touch = (type, pts) => cdp('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });

/* 원래 코드에 «더블탭 → 100%» 처리가 아직 살아 있는지부터 확인한다.
   그게 사라지면 이 파일의 억제 로직은 의미가 없고, 반대로 조건이 바뀌면 여기도 같이 봐야 한다. */
const srcHasReset = await (async () => {
  const { readFileSync } = await import('node:fs');
  const t = readFileSync('cloudflare-deploy/public/js/idx-main.js', 'utf8');
  return /더블탭[\s\S]{0,400}pdfSetZoom\(1\)/.test(t);
})();
ok(srcHasReset, 'idx-main.js 에 «더블탭 → 100%» 처리가 그대로 있다 (이 파일은 그걸 지우지 않고 억제만 한다)');

// (가) 핀치를 흉내낸다 — 배율을 키운 뒤 두 손가락을 «따로» 뗀다
await evalJs('window.pdfSetZoom(1)');
await touch('touchStart', [[B.x - 40, B.y], [B.x + 40, B.y]]);
for (const d of [60, 90, 120, 150]) { await touch('touchMove', [[B.x - d, B.y], [B.x + d, B.y]]); await new Promise(r => setTimeout(r, 50)); }
await evalJs('window.pdfSetZoom(1.6)');                 // 벌리는 동안 원래 코드가 하는 일
const zPinch = await evalJs('window.pdfGetZoom()');
ok(Math.abs(zPinch - 1.6) < 0.01, '벌리는 동안의 확대는 그대로 적용된다 (억제가 확대를 막지 않는다)', '실측 ' + zPinch);
await touch('touchEnd', [[B.x + 150, B.y]]);            // 한 손가락 먼저
await new Promise(r => setTimeout(r, 30));
await touch('touchEnd', []);                            // 나머지 한 손가락
await evalJs('window.pdfSetZoom(1)');                   // ← 원래 코드가 «더블탭» 으로 오인해 부르는 그 한 번
const zAfter = await evalJs('window.pdfGetZoom()');
ok(Math.abs(zAfter - 1.6) < 0.01, '손을 뗀 직후의 «100% 되돌리기» 는 무시된다 → 확대가 남는다',
  `핀치 ${zPinch} → 뗀 뒤 ${zAfter} (고치기 전에는 1 이 됐다)`);

// (나) 진짜 더블탭(손가락 하나로 두 번)은 여전히 100% 로 되돌아가야 한다
await new Promise(r => setTimeout(r, 700));
for (let i = 0; i < 2; i++) {
  await touch('touchStart', [[B.x, B.y]]); await touch('touchEnd', []);
  await new Promise(r => setTimeout(r, 90));
}
await evalJs('window.pdfSetZoom(1)');
const zTap = await evalJs('window.pdfGetZoom()');
ok(Math.abs(zTap - 1) < 0.01, '손가락 하나로 두 번 톡톡 치면 100% 로 되돌아간다 (되돌리기는 살아 있다)', '실측 ' + zTap);

// (다) 시간이 지난 뒤의 되돌리기도 막히면 안 된다
await evalJs('window.pdfSetZoom(1.8)');
await new Promise(r => setTimeout(r, 600));
await evalJs('window.pdfSetZoom(1)');
ok(Math.abs(await evalJs('window.pdfGetZoom()') - 1) < 0.01, '핀치와 무관한 시점의 100% 되돌리기는 정상 동작한다');

/* ── 3부. 폰에 확대 버튼이 실제로 보이고 눌리는가 ──────────────── */
console.log('\n③ 확대·축소 버튼 (폰에만)');
const zb = await evalJs(`(()=>{ var w=document.getElementById('mgz-zoom'); if(!w) return JSON.stringify({exists:false});
  var r=w.getBoundingClientRect(); var cs=getComputedStyle(w);
  var mid=[Math.round(r.left+r.width/2), Math.round(r.top+20)];
  var top=document.elementsFromPoint(mid[0],mid[1])[0];
  return JSON.stringify({exists:true, display:cs.display, w:Math.round(r.width), h:Math.round(r.height),
    inView: r.right<=innerWidth+1 && r.left>=-1 && r.bottom<=innerHeight+1 && r.top>=-1,
    topTag:(top&&top.tagName)||'', topId:(top&&(top.id||top.className))||'' }); })()`);
const Z = JSON.parse(zb);
ok(Z.exists, '확대 버튼이 교재 화면에 만들어졌다', zb);
ok(Z.display === 'flex', '폰(1024px 이하)에서 실제로 보인다', zb);
ok(Z.inView, '화면 안에 있다 (밖으로 밀리지 않는다)', zb);
ok(Z.topTag === 'BUTTON', '그 자리에서 «맨 위» 다 = 다른 것이 덮지 않는다 — 보인다≠눌린다',
  `맨 위 = ${Z.topTag} ${Z.topId}`);
const zBefore = await evalJs('window.pdfGetZoom()');
await evalJs(`document.querySelector('#mgz-zoom button').click()`);
await new Promise(r => setTimeout(r, 300));
ok(await evalJs('window.pdfGetZoom()') > zBefore, '＋ 를 누르면 실제로 커진다',
  `${zBefore} → ${await evalJs('window.pdfGetZoom()')}`);
/* 아이콘 버튼에 data-ko/data-en 을 달면 i18n 엔진이 본문을 문장으로 갈아끼워 글자가 쏟아진다
   (CLAUDE.md 함정표 — 홈 오프닝 소리 버튼). 그 함정을 밟지 않았는지 확인한다. */
const iconSafe = await evalJs(`(()=>{ var bs=[].slice.call(document.querySelectorAll('#mgz-zoom button'));
  return JSON.stringify({ hasKo: bs.some(function(b){return b.hasAttribute('data-ko')||b.hasAttribute('data-en')}),
    tips: bs.every(function(b){return b.hasAttribute('data-ko-title')}),
    over: bs.some(function(b){return b.scrollHeight > b.clientHeight + 2}) }); })()`);
const I = JSON.parse(iconSafe);
ok(!I.hasKo, '아이콘 버튼에 data-ko/data-en 을 달지 않았다 (달면 동그란 버튼에 문장이 들어앉는다)');
ok(I.tips, '설명은 data-ko-title 로 달았다 (두 엔진 모두 title 만 건드린다)');
ok(!I.over, '버튼 안에서 글자가 넘치지 않는다');

/* ── 4부. 배경화면 탭을 두 번 눌러도 본문이 안 접히는가 ────────── */
console.log('\n④ 배경화면 탭 두 번 누르기');
const bg = await evalJs(`(()=>{ if(typeof vcToggleContentTab!=='function') return JSON.stringify({err:'no fn'});
  vcToggleContentTab('bg');
  var open1 = !!document.querySelector('#tab-bg.active') && !vcIsContentCollapsed();
  vcToggleContentTab('bg');
  var open2 = !!document.querySelector('#tab-bg.active') && !vcIsContentCollapsed();
  vcToggleContentTab('pdf');
  var backPdf = !!document.querySelector('#tab-pdf.active') && !vcIsContentCollapsed();
  return JSON.stringify({open1, open2, backPdf}); })()`);
const G = JSON.parse(bg);
ok(G.open1 === true, '한 번 누르면 배경화면이 열린다', bg);
ok(G.open2 === true, '두 번째로 눌러도 본문이 접히지 않는다 (교재 도구줄이 같이 사라지던 것)', bg);
ok(G.backPdf === true, '교재 탭으로 정상적으로 돌아간다', bg);

/* ── 5부. 중국어 안내가 실제로 붙는가 ────────────────────────── */
console.log('\n⑤ 중국어 안내 (강선생님)');
await load(844, 390, 3, 'zh-CN');
const zh = await evalJs(`(()=>{
  var seen = [];
  window.mangoToast = function(m){ seen.push(String(m)); };
  window.vcTextbookDenied();
  return JSON.stringify({ msgs: seen });
})()`);
const ZH = JSON.parse(zh);
ok(ZH.msgs.length === 1, '교재 권한 거절 안내가 한 번 뜬다', zh);
ok(/只有老师/.test(ZH.msgs[0] || ''), '중국어 브라우저에서는 중국어 줄이 함께 붙는다', zh);
ok(/선생님만|Only the teacher/.test(ZH.msgs[0] || ''), '기존 한국어·영어 문구는 그대로 남는다 (덮어쓰지 않는다)', zh);
const koOnly = await evalJs(`(()=>{ var seen=[]; window.mangoToast=function(m){seen.push(String(m));};
  window.__vcTbDenyAt = 0;
  var real = navigator.language;
  Object.defineProperty(navigator,'language',{get:function(){return 'ko-KR'},configurable:true});
  Object.defineProperty(navigator,'languages',{get:function(){return ['ko-KR']},configurable:true});
  window.vcTextbookDenied();
  return JSON.stringify(seen); })()`);
ok(!/只有老师/.test(koOnly), '한국어 브라우저에는 중국어를 붙이지 않는다 (한국 학생 화면은 그대로)', koOnly);

/* ── 6부. 가로에서 얼굴이 오른쪽인가 (사장님 지시 — 세로는 건드리지 않음) ── */
console.log('\n⑥ 얼굴 위치 — 가로=오른쪽 / 세로=위 (지시대로 유지)');
const land = await evalJs(`(()=>{ document.body.classList.add('vc-in-call');
  var vp=document.getElementById('vc-video-pane'), cp=document.getElementById('vc-content-pane');
  var a=vp.getBoundingClientRect(), b=cp.getBoundingClientRect();
  return JSON.stringify({videoLeft:Math.round(a.left), contentRight:Math.round(b.right), right:a.left>=b.right-2}); })()`);
ok(JSON.parse(land).right, '가로: 얼굴이 교재 오른쪽에 있다', land);
await load(390, 844, 3, 'ko-KR');
const port = await evalJs(`(()=>{ document.body.classList.add('vc-in-call');
  var vp=document.getElementById('vc-video-pane'), cp=document.getElementById('vc-content-pane');
  var a=vp.getBoundingClientRect(), b=cp.getBoundingClientRect();
  return JSON.stringify({dir:getComputedStyle(document.getElementById('vc-main-row')).flexDirection,
    videoTop:Math.round(a.top), contentTop:Math.round(b.top), above:a.top<=b.top}); })()`);
ok(JSON.parse(port).dir === 'column' && JSON.parse(port).above, '세로: 얼굴이 위에 그대로 있다 (사장님 지시 — 바꾸지 않음)', port);

/* ── 7부. 가면(얼굴 꾸미기)이 우리 서버 파일로 도는가 ──────────────
   ⚠️ 이 검사가 없으면 15MB 를 올려 두고도 «여전히 CDN 을 부르는» 상태를 못 본다.
      실제로 네트워크 요청을 지켜보며 바깥 도메인을 한 번도 안 부르는지까지 확인한다. */
console.log('\n⑦ 가면 — 우리 서버 파일로 도는가 (강선생님)');
await load(844, 390, 3, 'zh-CN');
await evalJs(OPEN_CALL);

const reqs = [];
await cdp('Network.enable');
const onReq = (m) => { if (m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.url); };
ws.addEventListener('message', (e) => { try { onReq(JSON.parse(e.data)); } catch (_) {} });

// 카메라 대신 캔버스 스트림을 물려 준다 — vcSetFace 는 영상 트랙이 없으면 앞에서 되돌아간다
await evalJs(`(()=>{ var c=document.createElement('canvas'); c.width=320; c.height=240;
  c.getContext('2d').fillRect(0,0,320,240); window.vcLocalStream = c.captureStream(10); return true; })()`);
const faceRan = await evalJs(`(async()=>{ try { await window.vcSetFace('sunglasses1'); } catch(e){}
  await new Promise(r=>setTimeout(r,1500));
  return JSON.stringify({ primed: !!(window.vcFx && window.vcFx._vision && window.vcFx._fileset),
    fl: !!(window.vcFx && window.vcFx.fl), active: !!(window.vcFx && window.vcFx.active),
    err: (window.vcFx && window.vcFx._lastErr) ? String(window.vcFx._lastErr.message||window.vcFx._lastErr) : null }); })()`);
const F = JSON.parse(faceRan);
ok(F.primed, '얼굴인식 파일이 «우리 서버 것» 으로 물려졌다', faceRan);
ok(F.fl, '얼굴인식기가 실제로 만들어졌다 (모델·wasm 이 우리 서버에서 왔다)', faceRan);
const outside = reqs.filter(u => /jsdelivr\.net|storage\.googleapis\.com/.test(u));
const local = reqs.filter(u => /\/vendor\/mediapipe-face\//.test(u));
ok(outside.length === 0, '바깥 도메인(jsdelivr·구글 스토리지)을 한 번도 부르지 않는다 — 중국에서 막히던 그 두 곳',
  outside.slice(0, 3).join(' , '));
ok(local.some(u => /face_landmarker\.task$/.test(u)), '모델을 /vendor/mediapipe-face/ 에서 받았다',
  local.slice(0, 4).join(' , '));
ok(local.some(u => /vision_wasm_internal\.wasm$/.test(u)), 'wasm 도 우리 서버에서 받았다 (nosimd 판이 아니다 — 그건 안 올렸다)',
  local.slice(0, 4).join(' , '));

console.log(`\n──────────────────────────────────────────\n  ✅ PASS ${pass}   ❌ FAIL ${fail}   (총 ${pass + fail})\n`);
ws.close(); chrome.kill();
process.exit(fail ? 1 : 0);
