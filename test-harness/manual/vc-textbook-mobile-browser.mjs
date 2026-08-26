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

/* ── 8부. 교사 화면이 칸을 꽉 채우는가 (신고 2) ──────────────────
   ⚠️ 카메라 스트림으로 재면 메타데이터 타이밍 때문에 결과가 들쭉날쭉하다(실제로 밟았다).
      칸 크기와 영상 해상도를 **고정해 넣고** 판정만 읽는다 — 흔들릴 요소가 없다.
   ℹ️ «채움률» = 칸 안에서 얼굴 그림이 실제로 차지하는 비율. contain 이면 검은 띠만큼 줄어든다. */
console.log('\n⑧ 교사 화면 크기 — 칸을 꽉 채우는가');
const PROBE = `(function(bw,bh,vw,vh,opts){
  opts=opts||{};
  var host=document.getElementById('__probe')||document.createElement('div');
  host.id='__probe'; host.style.cssText='position:fixed;left:-9999px;top:0';
  if(!host.parentNode) document.body.appendChild(host);
  host.innerHTML='';
  var box=document.createElement('div'); box.className='video-box';
  if(opts.local) box.id='vc-local-box';
  box.style.cssText='width:'+bw+'px;height:'+bh+'px;position:relative';
  var vid=document.createElement('video');
  Object.defineProperty(vid,'videoWidth',{get:function(){return vw;}});
  Object.defineProperty(vid,'videoHeight',{get:function(){return vh;}});
  box.appendChild(vid);
  if(opts.share){var b=document.createElement('span');b.className='vc-ss-badge';box.appendChild(b);}
  host.appendChild(box);
  try{ vcSmartFitVideo(vid); }catch(e){ return 'ERR:'+e.message; }
  return vid.style.objectFit||'(없음)';
})`;
const fit = (bw, bh, vw, vh, opts) => evalJs(`${PROBE}(${bw},${bh},${vw},${vh},${JSON.stringify(opts || {})})`);

// PC·태블릿의 «오른쪽 세로 컬럼» — 사장님 화면이 이 모양이었다(교사 28.2% / 학생 42.3% 실측)
await load(1280, 800, 2, 'ko-KR');
ok(await fit(345, 687, 1280, 720) === 'cover',
  '교사의 가로(16:9) 웹캠이 세로로 긴 칸을 꽉 채운다 (고치기 전 contain·채움 28.2%)');
ok(await fit(132, 180, 1280, 720) === 'cover', '좁은 세로 컬럼에서도 꽉 채운다 (전 contain·41.3%)');
ok(await fit(295, 139, 1280, 720) === 'cover', '가로로 넓은 칸은 원래대로 꽉 찬다 (회귀 없음)');

/* ⛔ 화면 공유는 잘리면 «공유한 화면의 좌우가 사라진다» — 반드시 전체 보이기 */
ok(await fit(345, 687, 1920, 1080, { share: true }) === 'contain',
  '화면 공유는 잘리지 않는다 (배지 .vc-ss-badge 로 판별)');
ok(await fit(132, 180, 1920, 1080, { share: true }) === 'contain', '좁은 칸에서도 화면 공유는 전체가 보인다');

/* 건드리지 않기로 한 것 — 되돌아가면 이 줄이 FAIL 한다 */
ok(await fit(345, 687, 720, 1280) === 'cover', '교사가 폰 세로로 들어오면 원래 판정 그대로');
ok(await fit(345, 687, 1280, 720, { local: true }) === 'contain',
  '내 타일(자기 얼굴)은 건드리지 않는다 — 가상배경 켜면 턱·목이 잘린다(2026-07-13 결정)');

// 세로폰: 원래 로직이 «상대 타일은 무조건 cover» 라 화면 공유까지 잘리고 있었다(기존 버그)
await load(390, 844, 3, 'ko-KR');
ok(await fit(345, 687, 1280, 720) === 'cover', '세로폰에서 교사 얼굴은 그대로 꽉 찬다 (2026-07-14 지시 유지)');
ok(await fit(345, 687, 1920, 1080, { share: true }) === 'contain',
  '세로폰에서 화면 공유가 더는 잘리지 않는다 — 고치기 전에는 cover 로 좌우가 날아갔다');

/* ── 9부. 1:1 수업에서 «교사» 얼굴이 더 큰가 ─────────────────────
   ⚠️ 앞의 ⑧절은 «칸 안에서 그림이 차지하는 비율» 이고, 여기는 «칸 자체의 크기» 다. 다른 값이다.
   ⚠️ 2026-07-14 「정확히 반반」 지시를 2026-08-26 사장님 지시로 바꾼 자리라,
      되돌아가면 이 절이 FAIL 해서 «누가 언제 왜 바꿨나» 를 다시 찾을 수 있어야 한다.
   ⚠️ 커지는 것은 «상대» 가 아니라 «교사» 다 — 학생 화면에서는 상대가, 교사 화면에서는
      자기 자신이 커진다(2026-08-26 사장님 추가 지시). 그래서 두 역할을 나란히 잰다.
   ⚠️ PC 는 폰과 «구조가 다르다» — 그리드가 아니라 «전체화면 + 오른아래 PIP» 라
      비중이 아니라 «누가 PIP 인가» 를 맞바꾼다. 그래서 배수가 7배쯤으로 크다(정상). */
console.log('\n⑨ 1:1 수업 — 교사 얼굴이 더 큰가 (학생 화면·교사 화면)');
const TILES = `(function(mode,count,localFirst,role,observer,remote){
  window.vcMyRole = role || 'student';   // 정본 판정 vcIsStaffNow() 가 이 값을 본다
  document.body.classList.add('vc-in-call');
  if(observer) document.body.classList.add('vc-observer');   // js/vc-observe-guard.js 가 붙이는 그 클래스
  try{ window.vcNukeRotationOverlays && window.vcNukeRotationOverlays(); }catch(e){}
  var view=document.getElementById('view-videocall-call');
  if(view){view.style.display='flex'; view.classList.add('active');}
  document.querySelectorAll('[id^="view-"]').forEach(function(e){ if(e.id!=='view-videocall-call') e.style.display='none'; });
  var row=document.getElementById('vc-main-row');
  row.className=row.className.replace(/video-[a-z]+/g,'').trim();
  if(mode) row.classList.add(mode);
  var grid=document.getElementById('vc-video-grid'); grid.innerHTML='';
  var names=['vc-video-teacher','vc-local-box'];
  if(localFirst) names=['vc-local-box','vc-video-teacher'];
  if(count>2) names=['vc-video-a','vc-video-b','vc-local-box'];
  names.forEach(function(idn){
    var b=document.createElement('div'); b.className='video-box'; b.id=idn;
    var v=document.createElement('video'); v.style.width='100%'; v.style.height='100%';
    b.appendChild(v);
    /* 상대 타일에 «누구인가» 를 실제 화면과 같은 방식으로 심는다 —
       역할은 data-role(로스터에서 옴), 이름은 .video-label(vcEnsureParticipantBox 가 그림) */
    if(remote && idn!=='vc-local-box'){
      if(remote.role) b.dataset.role=remote.role;
      if(remote.demo) b.dataset.demo='1';
      if(remote.name){ var l=document.createElement('span'); l.className='video-label';
        l.textContent=remote.name; b.appendChild(l); }
    }
    grid.appendChild(b);
  });
  grid.setAttribute('data-count',String(count));
  try{ window.mgSyncTeacherSelf && window.mgSyncTeacherSelf(); }catch(e){}
  function area(idn){ var e=document.getElementById(idn); if(!e) return 0;
    var r=e.getBoundingClientRect(); return r.width*r.height; }
  var other = count>2 ? area('vc-video-a') : area('vc-video-teacher');
  var mine  = area('vc-local-box');
  return JSON.stringify({ other:Math.round(other), mine:Math.round(mine),
    cls: document.body.classList.contains('mg-teacher-self'),
    ratio: mine>0 ? Math.round(other/mine*100)/100 : null,
    mineRatio: other>0 ? Math.round(mine/other*100)/100 : null });
})`;
const tiles = async (mode, count, localFirst, role, observer, remote) =>
  JSON.parse(await evalJs(`${TILES}(${JSON.stringify(mode)},${count},${!!localFirst},${JSON.stringify(role || 'student')},${!!observer},${JSON.stringify(remote || null)})`));

/* ── 학생 화면 = «상대(교사)» 가 크다 ───────────────────────── */
await load(390, 844, 3, 'ko-KR');
let t = await tiles('video-half', 2);
ok(t.ratio >= 1.5 && t.ratio <= 1.75, `세로폰·학생 화면 — 상대(교사)가 1.6배쯤 크다 (실측 ${t.ratio}배, 고치기 전 1배)`,
  JSON.stringify(t));
ok(t.cls === false, '학생 화면에는 mg-teacher-self 가 붙지 않는다', JSON.stringify(t));
let t2 = await tiles('video-half', 2, true);
ok(t2.ratio >= 1.5 && t2.ratio <= 1.75,
  '들어온 순서가 뒤바뀌어도 «상대» 쪽이 크다 (내 타일은 order 로 늘 맨 뒤)', JSON.stringify(t2));
let t3 = await tiles('video-half', 3);
ok(Math.abs(t3.ratio - 1) < 0.15, `여러 명 수업(3명)은 그대로 고르게 나뉜다 (실측 ${t3.ratio}배)`, JSON.stringify(t3));

await load(844, 390, 3, 'ko-KR');
let t4 = await tiles('video-half', 2);
ok(t4.ratio >= 1.5 && t4.ratio <= 1.75, `가로폰·학생 화면 — 상대(교사)가 1.6배쯤 크다 (실측 ${t4.ratio}배, 고치기 전 1배)`,
  JSON.stringify(t4));
let t5 = await tiles('video-half', 3);
ok(Math.abs(t5.ratio - 1) < 0.15, `가로폰 여러 명 수업은 그대로 (실측 ${t5.ratio}배)`, JSON.stringify(t5));

/* PC 는 그리드가 아니라 «상대 전체화면 + 내 타일 PIP» 다(css/vc-refresh.css).
   여기서 1 에 가까워지면 그 구조가 깨진 것이다. */
await load(1280, 800, 2, 'ko-KR');
let t6 = await tiles('video-half', 2);
ok(t6.ratio > 2, `PC·학생 화면 — 상대(교사)가 전체화면, 내 타일은 오른아래 PIP (실측 ${t6.ratio}배)`, JSON.stringify(t6));

/* ── 교사 화면 = «자기 자신» 이 크다 (2026-08-26 사장님 추가 지시) ─────────
   ⚠️ 처음엔 «상대가 주인공» 으로 만들었다가 이 지시로 뒤집었다. 되돌아가면 여기가 FAIL 한다.
   ⚠️ 폰에서 한때 2.58배가 나온 적이 있다 — PC 용 줄에 미디어쿼리가 없어 폰까지 닿아
      상대가 «두 번» 줄어든 것이다. 그래서 상한(1.75)을 반드시 함께 본다. */
console.log('\n⑨-2 교사 화면 — 교사 자신이 더 큰가');
await load(390, 844, 3, 'ko-KR');
let s1 = await tiles('video-half', 2, false, 'teacher');
ok(s1.cls === true, '교사로 들어오면 body 에 mg-teacher-self 가 붙는다', JSON.stringify(s1));
ok(s1.mineRatio >= 1.5 && s1.mineRatio <= 1.75,
  `세로폰·교사 화면 — 교사 자신이 1.6배쯤 크다 (실측 ${s1.mineRatio}배)`, JSON.stringify(s1));
let s1b = await tiles('video-half', 3, false, 'teacher');
ok(Math.abs(s1b.ratio - 1) < 0.15,
  `세로폰·교사 화면 여러 명 수업은 그대로 고르게 (실측 ${s1b.ratio}배)`, JSON.stringify(s1b));

await load(844, 390, 3, 'ko-KR');
let s2 = await tiles('video-half', 2, false, 'teacher');
ok(s2.mineRatio >= 1.5 && s2.mineRatio <= 1.75,
  `가로폰·교사 화면 — 교사 자신이 1.6배쯤 크다 (실측 ${s2.mineRatio}배)`, JSON.stringify(s2));
let s2b = await tiles('video-half', 3, false, 'teacher');
ok(Math.abs(s2b.ratio - 1) < 0.15,
  `가로폰·교사 화면 여러 명 수업은 그대로 고르게 (실측 ${s2b.ratio}배)`, JSON.stringify(s2b));

await load(1280, 800, 2, 'ko-KR');
let s3 = await tiles('video-half', 2, false, 'teacher');
ok(s3.mineRatio > 2,
  `PC·교사 화면 — 교사 자신이 전체화면, 학생이 오른아래 PIP (실측 ${s3.mineRatio}배)`, JSON.stringify(s3));
ok(Math.abs(s3.mineRatio - t6.ratio) < 0.5,
  `PC 는 학생 화면과 «정확히 거울» 이다 (학생 ${t6.ratio}배 / 교사 ${s3.mineRatio}배)`,
  JSON.stringify({ student: t6, teacher: s3 }));
let s3b = await tiles('video-half', 3, false, 'teacher');
ok(Math.abs(s3b.ratio - 1) < 0.15,
  `PC·교사 화면 여러 명 수업은 그대로 고르게 (실측 ${s3b.ratio}배)`, JSON.stringify(s3b));

/* ── 참관(Ghost)은 제외 ─────────────────────────────────────────
   🔴 2026-08-26 실측으로 밟은 회귀. 참관자는 vcMyRole='admin' 이라 위 판정이 true 인데,
      참관자의 #vc-local-box 는 «영상이 없는 빈 타일» 이고 지워지지도 않는다.
      그래서 방에 한 명뿐일 때 «빈 내 타일이 전체화면 + 진짜 참가자가 210px PIP» 가 됐다.
   ⛔ 이 두 줄을 지우면 참관 화면이 다시 자기 빈 타일로 덮인다. */
console.log('\n⑨-3 참관(Ghost)은 «교사 자신 크게» 에서 빠지는가');
let g1 = await tiles('video-half', 2, false, 'admin', true);
ok(g1.cls === false,
  '참관 중(body.vc-observer)에는 mg-teacher-self 가 붙지 않는다 — admin 이어도', JSON.stringify(g1));
ok(g1.ratio >= 2 && g1.mineRatio < 1,
  `참관 화면은 «수업 참가자» 가 크다 — 내 빈 타일이 아니라 (실측 상대 ${g1.ratio}배)`, JSON.stringify(g1));
let g2 = await tiles('video-half', 2, false, 'admin', false);
ok(g2.cls === true,
  '참관이 아닌 관리자(직접 입장)는 «상대가 학생이면» 그대로 자기 타일이 크다 — 넓게 막지 않았다',
  JSON.stringify(g2));

/* ── ⑨-4 «이 방의 교사» 가 상대편이면 내가 무엇이든 상대가 크다 ────────────
   🔴 2026-08-26 사장님 신고 — 학생 수업 입장인데 사장님 얼굴이 전체화면, 강선생님이 210px PIP.
      원인은 CSS 가 아니라 역할이었다: jeong 은 학생 세션 없이 관리자 폴백으로 로그인해
      입장 역할이 admin 으로 잡힌다(idx-main.js «else if (_admUid)»). 그러면 ⑨-2 의
      「교사 자신이 크게」가 그대로 걸린다.
   ⚠️ 서버가 되돌려 주지 못한다 — verify-room 은 role=admin 이면 privileged 로 즉시 통과시키고
      resolved_role 을 주지 않아, 「이 예약의 학생」 교정이 admin 에서만 안 돈다(실측 10분 지속).
   ⛔ 이 절이 FAIL 하면 그 사고가 그대로 되살아난 것이다. */
console.log('\n⑨-4 상대편에 «교사» 가 있으면 내가 admin 이어도 상대가 큰가');
await load(1280, 800, 2, 'ko-KR');
let a1 = await tiles('video-half', 2, false, 'admin', false, { role: 'teacher' });
ok(a1.cls === false,
  '관리자로 잡혀 들어와도 상대가 교사(data-role)면 mg-teacher-self 가 안 붙는다', JSON.stringify(a1));
ok(a1.ratio > 2,
  `그 화면은 교사가 전체화면, 내 타일이 PIP (실측 ${a1.ratio}배 — 신고 당시엔 반대였다)`,
  JSON.stringify(a1));

/* 실사고 그림 그대로 — 로스터 역할이 아직 안 왔고 이름표만 「교사 강선생님」 인 경우.
   ⚠️ 이름 휴리스틱은 여기서 «내 타일을 내리는» 데만 쓴다 — 권한을 올리지 않는다(저장소 규칙). */
let a2 = await tiles('video-half', 2, false, 'admin', false, { name: '교사 강선생님' });
ok(a2.cls === false,
  '역할이 아직 안 와도 이름표가 「교사 …」 면 상대가 크다 (실사고 그림)', JSON.stringify(a2));

/* 강사가 «다른 강사의» 수업에 들어간 경우도 같다 — 주인공은 이 방의 교사 쪽이다 */
let a3 = await tiles('video-half', 2, false, 'teacher', false, { role: 'teacher' });
ok(a3.cls === false, '강사끼리 있어도 상대 교사가 크다 — 자기 얼굴로 덮지 않는다', JSON.stringify(a3));

/* 회귀 방어 — 시연용 선생님 타일(data-demo=1)은 사람이 아니다. 여기에 걸려
   진짜 교사 화면이 «자기 자신 크게» 를 잃으면 ⑨-2 가 무의미해진다. */
let a4 = await tiles('video-half', 2, false, 'teacher', false, { role: 'teacher', demo: 1 });
ok(a4.cls === true, '시연용 선생님 타일(data-demo=1)은 «상대 교사» 로 세지 않는다', JSON.stringify(a4));

/* 학생 화면은 아무것도 안 바뀐다 */
let a5 = await tiles('video-half', 2, false, 'student', false, { role: 'teacher' });
ok(a5.cls === false && a5.ratio > 2,
  `학생 화면은 그대로 교사가 크다 (실측 ${a5.ratio}배)`, JSON.stringify(a5));

console.log(`\n──────────────────────────────────────────\n  ✅ PASS ${pass}   ❌ FAIL ${fail}   (총 ${pass + fail})\n`);
ws.close(); chrome.kill();
process.exit(fail ? 1 : 0);
