/* ============================================================
   vc-dock.js  -  수업 중(in-call) 하단 라벨 컨트롤 독
   - 마이크 · 카메라 · 화면공유 · 채팅 · 상담 · 설정 · 나가기
   - 설정: 독 위로 자체 팝업(테마/언어/전체화면) + 투명 배경막으로 안전하게 열고 닫기
   - 추가형: 이 <script> 한 줄 빼면 즉시 원복
   ============================================================ */
(function () {
  'use strict';
  if (window.__vcDockInit) return; window.__vcDockInit = true;

  var P = {
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/>',
    micoff:'<rect x="9" y="3" width="6" height="8" rx="3"/><path d="M5 11a7 7 0 0 0 11 5"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="4" y1="4" x2="20" y2="20"/>',
    cam:'<rect x="3" y="6" width="12" height="12" rx="2.5"/><path d="M15 10.5l6-3v9l-6-3z"/>',
    camoff:'<path d="M9 6h4a2.5 2.5 0 0 1 2 1.5M15 13.5V18H5a2 2 0 0 1-2-2V8"/><path d="M15 10.5l6-3v9"/><line x1="4" y1="4" x2="20" y2="20"/>',
    share:'<rect x="3" y="4" width="18" height="13" rx="2.5"/><line x1="9" y1="21" x2="15" y2="21"/><path d="M12 8v5"/><path d="M9.5 10.5L12 8l2.5 2.5"/>',
    chat:'<path d="M21 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-4.3A8 8 0 1 1 21 11.5z"/>',
    consult:'<path d="M4 4.5h16a1.2 1.2 0 0 1 1.2 1.2v9a1.2 1.2 0 0 1-1.2 1.2h-9.2L6 20.5v-4.6H4a1.2 1.2 0 0 1-1.2-1.2v-9A1.2 1.2 0 0 1 4 4.5Z"/>',
    settings:'<line x1="4" y1="8" x2="20" y2="8"/><circle cx="9" cy="8" r="2.3"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="16" r="2.3"/>',
    leave:'<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 16l4-4-4-4"/><line x1="13" y1="12" x2="3" y2="12"/>'
  };
  function svg(p){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">'+p+'</svg>'; }
  function call(name, arg){ try { if (typeof window[name] === 'function') return window[name](arg); } catch(e){ console.warn('[vc-dock]', name, e); } }

  var STYLE = [
    '#vc-dock{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:none;z-index:99993;',
    '  align-items:center;gap:6px;padding:8px 10px;border-radius:18px;',
    '  background:rgba(18,22,30,0.62);',
    '  -webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);',
    '  border:1px solid rgba(255,255,255,.18);box-shadow:0 18px 48px rgba(0,0,0,.55);max-width:96vw;flex-wrap:nowrap;}',
    'body.vc-in-call #vc-dock{display:inline-flex;}',
    '#vc-dock button{background:rgba(255,255,255,.12);border:none;color:#eef2f8;border-radius:13px;',
    '  width:58px;height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
    '  cursor:pointer;font-family:inherit;font-size:9.5px;font-weight:600;transition:background .12s,transform .1s;flex:0 0 auto;}',
    '#vc-dock button .lbl{color:#aebacc;font-size:9px;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.5);}',
    '#vc-dock button svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));}', /* 밝은 배경에서도 아이콘 또렷(다크/라이트 공통) */
    '#vc-dock button:hover{background:rgba(255,255,255,.15);}',
    '#vc-dock button:active{transform:scale(.95);}',
    '#vc-dock button.active{background:#3b82f6;color:#fff;}#vc-dock button.active .lbl{color:#dbe7ff;}',
    '#vc-dock button.off{background:#ef4444;color:#fff;}#vc-dock button.off .lbl{color:#ffe0e0;}',
    '#vc-dock button.leave{background:rgba(239,68,68,.18);color:#ff9a9a;}#vc-dock button.leave .lbl{color:#ffb4b4;}',
    '#vc-dock button.leave:hover{background:#ef4444;color:#fff;}',
    '/* 화면공유 아이콘 강조 — 라인 아이콘이라 stroke를 굵게+밝게 */',
    '#vc-dock-share svg{stroke-width:2.5;color:#fff;}',
    '/* 이름 먼저 표시용 힌트(가로에서 라벨 숨김일 때 도크 위로 잠깐) */',
    '#vc-dock-hint{position:fixed;left:50%;transform:translateX(-50%) translateY(6px);z-index:99995;background:rgba(11,15,20,.92);color:#fff;font-size:11px;font-weight:600;padding:4px 12px;border-radius:999px;white-space:nowrap;opacity:0;visibility:hidden;transition:.16s;pointer-events:none;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 6px 18px rgba(0,0,0,.4);}',
    '#vc-dock-hint.show{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);}',
    '/* 설정 배경막 — 열려 있을 때 바깥 클릭을 가로채 닫기만 함(다른 버튼 오클릭 방지) */',
    '#vc-dock-backdrop{position:fixed;inset:0;z-index:99991;display:none;background:transparent;}',
    '#vc-dock-backdrop.open{display:block;}',
    '/* 설정 팝업 — 독 위로 떠서 열림 (장치·영상/녹화·표시 전체 패널) */',
    '#vc-dock-settings{position:fixed;z-index:99994;display:none;flex-direction:column;box-sizing:border-box;',
    '  width:330px;max-width:92vw;max-height:70vh;overflow-y:auto;padding:14px;border-radius:14px;',
    '  background:rgba(11,15,20,0.98);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);',
    '  border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 40px rgba(0,0,0,.6);}',
    '#vc-dock-settings.open{display:flex;}',
    '#vc-dock-settings .sg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}',
    '#vc-dock-settings .sg-head h3{margin:0;font-size:14px;color:#e6ebf2;font-weight:700;}',
    '#vc-dock-settings .sg-head .sg-x{background:none;border:none;color:#9aa4b2;font-size:16px;cursor:pointer;padding:2px 6px;width:auto;height:auto;}',
    '#vc-dock-settings .sg-group{margin-bottom:12px;}',
    '#vc-dock-settings .sg-gtitle{font-size:11px;color:#ffd24d;margin-bottom:6px;letter-spacing:.02em;font-weight:700;}',
    '#vc-dock-settings .sg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;font-size:13px;}',
    '#vc-dock-settings .sg-row > label{color:#9aa4b2;white-space:nowrap;}',
    '#vc-dock-settings select{background:#1c2530;color:#e6ebf2;border:1px solid #283140;border-radius:7px;font-size:12px;padding:5px 8px;max-width:170px;}',
    '#vc-dock-settings input[type=range]{width:120px;accent-color:#ffd24d;}',
    '#vc-dock-settings .sg-seg{display:inline-flex;background:#161d26;border-radius:7px;padding:2px;}',
    '#vc-dock-settings .sg-seg button{background:transparent;border:none;color:#9aa4b2;font-size:12px;padding:4px 10px;border-radius:5px;cursor:pointer;width:auto;height:auto;font-family:inherit;}',
    '#vc-dock-settings .sg-seg button.on{background:#ffd24d;color:#1a1300;font-weight:600;}',
    '#vc-dock-settings .sg-sw{position:relative;width:38px;height:21px;background:#1c2530;border-radius:999px;cursor:pointer;border:1px solid #283140;flex:0 0 auto;}',
    '#vc-dock-settings .sg-sw::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#8a94a3;transition:.18s;}',
    '#vc-dock-settings .sg-sw.on{background:#ffd24d;border-color:#ffd24d;}',
    '#vc-dock-settings .sg-sw.on::after{left:19px;background:#1a1300;}',
    '#vc-dock-settings .sg-test{background:#1c2530;border:1px solid #283140;color:#e6ebf2;font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer;width:auto;height:auto;font-family:inherit;}',
    '/* 기존 중복 컨트롤 숨김 */',
    'body.vc-in-call.vc-dock-on .toolbar-center{display:none !important;}',
    'body.vc-in-call.vc-dock-on #vc-exit-btn-v34{display:none !important;}',
    '@media (max-width:560px){#vc-dock{gap:4px;padding:6px 8px;bottom:12px;}#vc-dock button{width:48px;height:48px;font-size:9px;}}',
    '/* 갤럭시 Z 폴드 접힘(커버) 등 매우 좁은 화면: 버튼 7개가 한 줄에 들어오도록 축소 */',
    '@media (max-width:430px){#vc-dock{gap:3px;padding:5px 6px;max-width:99vw;}#vc-dock button{width:42px;height:46px;font-size:8.5px;}#vc-dock button svg{width:20px;height:20px;}}',
    '/* 버튼 7개가 아주 좁은 폰(<=400px)에서도 한 줄에 들어오도록 한 단계 더 축소 */',
    '@media (max-width:400px){#vc-dock{gap:2px;padding:4px 5px;}#vc-dock button{width:38px;height:44px;font-size:8px;}#vc-dock button svg{width:18px;height:18px;}}',
    '/* 모바일 가로(낮은 화면): 도크를 숨기지 않고 납작·아이콘 위주로. 폴드 펼침처럼 높은 화면은 제외 → 풀 도크 유지 */',
    '@media (max-width:920px) and (orientation:landscape) and (max-height:600px){',
    '  #vc-dock{bottom:max(8px,env(safe-area-inset-bottom));gap:3px;padding:5px 8px;border-radius:15px;}',
    '  #vc-dock button{width:44px;height:38px;gap:0;font-size:0;}',
    '  #vc-dock button .lbl{display:none;}',
    '  #vc-dock button svg{width:20px;height:20px;}',
    '}',
    '/* 가로 화면이 매우 낮을 때(작은 폰) 한 단계 더 축소 */',
    '@media (max-height:380px) and (orientation:landscape){',
    '  #vc-dock{bottom:6px;padding:4px 7px;}',
    '  #vc-dock button{width:40px;height:34px;}',
    '  #vc-dock button svg{width:18px;height:18px;}',
    '}',
    '/* 🥭 (2026-07-01) 휴대폰 가로: 교재 이전/다음 화살표를 엄지로 누르기 좋게 —',
    '   더 크게(52x88) + 흰 교재 위에서도 잘 보이게 대비↑. 화면 좌/우 세로중앙에 두어',
    '   하단 중앙 도크·문고리(핸들)와 절대 겹치지 않음. index.html 은 건드리지 않고 여기서 오버라이드. */',
    '@media (max-width:920px) and (orientation:landscape) and (max-height:600px){',
    '  body.vc-in-call #tab-pdf .pdf-nav-arrow{width:52px !important;height:88px !important;font-size:40px !important;',
    '    background:rgba(15,23,42,0.62) !important;box-shadow:0 4px 16px rgba(0,0,0,.45) !important;border-radius:14px !important;}',
    '  body.vc-in-call #tab-pdf .pdf-nav-prev{left:6px !important;}',
    '  body.vc-in-call #tab-pdf .pdf-nav-next{right:6px !important;}',
    '}',
    '/* 가로가 매우 낮은(작은) 폰: 화살표가 화면을 너무 먹지 않게 한 단계 축소하되 여전히 큼직하게 */',
    '@media (max-height:380px) and (orientation:landscape){',
    '  body.vc-in-call #tab-pdf .pdf-nav-arrow{height:72px !important;font-size:34px !important;}',
    '}',
    '/* 🥭 (2026-06-28) 휴대폰 가로 전용: 하단 도크가 카메라 얼굴을 가려서 문고리(핸들)로 접었다 폈다 */',
    '/* 트랜지션은 두지 않음 — bottom의 env()/calc()/max() 혼합값, svg transform:none→rotate 는 브라우저가 보간하지 못해 시작값에 멈추는 버그가 있어 즉시 토글로 처리 */',
    '#vc-dock-handle{display:none;position:fixed;left:50%;transform:translateX(-50%);z-index:99994;',
    '  align-items:center;justify-content:center;gap:6px;cursor:pointer;padding:0;width:58px;height:22px;',
    '  background:transparent;border:none;color:#eef2f8;border-radius:999px;}',
    '#vc-dock-handle .vdh-grip{width:22px;height:3px;border-radius:2px;background:rgba(255,255,255,.9);box-shadow:0 1px 3px rgba(0,0,0,.6);}',
    '#vc-dock-handle svg{width:14px;height:14px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));}',
    '#vc-dock-handle:active{transform:translateX(-50%) scale(.94);}',
    '@media (max-width:920px) and (orientation:landscape) and (max-height:600px){',
    '  body.vc-in-call.vc-dock-on #vc-dock-handle{display:inline-flex;bottom:calc(env(safe-area-inset-bottom,0px) + 56px);}',
    '  /* 🥭 (2026-06-28) 옛 가로 하단바 시스템 제거 — 새 도크+문고리가 대체. */',
    '  /* (#vc-bottom-grip = 노란 그립, #vc-bottom-actions = 옛 폴더바). _vcUpdateBottomBar 가 인라인 display:flex 를 넣으므로 !important 로 덮어씀 */',
    '  body.vc-in-call #vc-bottom-grip, body.vc-in-call #vc-bottom-actions{display:none !important;}',
    '  body.vc-in-call.vc-dock-collapsed #vc-dock{transform:translateX(-50%) translateY(180%) !important;opacity:0;pointer-events:none;}',
    '  body.vc-in-call.vc-dock-collapsed #vc-dock-handle{bottom:max(6px,env(safe-area-inset-bottom,0px));}',
    '  body.vc-in-call.vc-dock-collapsed #vc-dock-handle svg{transform:rotate(180deg);}',
    '}',
    '/* ★ (2026-07-14 사장님) 모바일(가로+세로 공통): 하단 버튼독 기본 숨김 —',
    '   화면 아래 ⋯(가로 점3개) 버튼을 누르면 나타나고 다시 누르면 닫힘. 화면 최대한 깨끗하게. */',
    '#vc-dock-more{display:none;position:fixed;left:50%;bottom:max(10px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:99994;',
    '  width:66px;height:32px;align-items:center;justify-content:center;border-radius:999px;',
    '  border:1px solid rgba(255,255,255,.28);background:rgba(18,22,30,.74);color:#fff;',
    '  font-size:21px;line-height:0;letter-spacing:3px;font-weight:800;cursor:pointer;padding:0 0 6px;',
    '  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 8px 20px rgba(0,0,0,.5);}',
    '#vc-dock-more:active{transform:translateX(-50%) scale(.94);}',
    '@media (max-width:1024px){',
    '  body.vc-in-call #vc-dock{display:none;}',
    '  body.vc-in-call.vc-dock-open #vc-dock{display:inline-flex;bottom:calc(env(safe-area-inset-bottom,0px) + 50px);}',
    '  body.vc-in-call #vc-dock-more{display:flex;}',
    '  body.vc-in-call #vc-dock-handle{display:none !important;}', /* 옛 문고리 → ⋯ 버튼으로 대체 */
    '  /* ★ (2026-07-14) 독이 열리면 좌우 플로팅 버튼(☰ 기능 / ↺ 캐시)을 독 위로 올려 겹침 방지 —',
    '     독 폭이 96vw 라 양끝 버튼(right:10/left:16, bottom 58~92px)이 열린 독(50~120px 대역)과 정확히 겹치던 문제 */',
    '  body.vc-in-call.vc-dock-open .vc-phero-ctrl{bottom:calc(env(safe-area-inset-bottom,0px) + 132px) !important;}',
    '  body.vc-in-call.vc-dock-open #ph52-cache-fab, body.vc-in-call.vc-dock-open .ph52-cache-fab{bottom:calc(env(safe-area-inset-bottom,0px) + 132px) !important;}',
    '}'
  ].join('\n');

  var dock, btnMic, btnCam, bSet, setPop, backdrop, hint, hintT;

  function fullscreenOn(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFullscreen(){
    try {
      if (!fullscreenOn()) { var el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen).call(el); }
      else { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    } catch(e){ console.warn('[vc-dock] fullscreen', e); }
  }
  function isLight(){ try { return (window.MangoTheme && MangoTheme.get()==='light'); } catch(e){ return false; } }
  function isEn(){ try { return (typeof window.getLang==='function' && window.getLang()==='en'); } catch(e){ return false; } }
  function setTheme(light){
    try {
      if (window.MangoTheme && typeof MangoTheme.set==='function') MangoTheme.set(light?'light':'dark');
      else if (window.MangoTheme && isLight()!==light) MangoTheme.toggle();
    } catch(_){ }
  }
  function setLang(en){
    if (isEn()===en) return;
    if (typeof window.setLang==='function') { try{ window.setLang(en?'en':'ko'); return; }catch(_){ } }
    call('toggleLang');
  }
  function beep(){
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ac = new AC(), o = ac.createOscillator(), g = ac.createGain();
      o.type='sine'; o.frequency.value=660; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+0.4);
      o.start(); o.stop(ac.currentTime+0.42);
    } catch(_){ }
  }
  function fillDevices(){
    if (!setPop || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function(list){
      var micSel = setPop.querySelector('#sg-mic-dev'), camSel = setPop.querySelector('#sg-cam-dev');
      if (micSel) micSel.innerHTML = ''; if (camSel) camSel.innerHTML = '';
      var mc=0, cc=0;
      list.forEach(function(d){
        if (d.kind==='audioinput' && micSel){ var o=document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||('마이크 '+(++mc)); micSel.appendChild(o); }
        if (d.kind==='videoinput' && camSel){ var o2=document.createElement('option'); o2.value=d.deviceId; o2.textContent=d.label||('카메라 '+(++cc)); camSel.appendChild(o2); }
      });
      if (micSel && !micSel.children.length){ var om=document.createElement('option'); om.textContent='기본 마이크'; micSel.appendChild(om); }
      if (camSel && !camSel.children.length){ var oc=document.createElement('option'); oc.textContent='기본 카메라'; camSel.appendChild(oc); }
    }).catch(function(){ });
  }

  function buildSettings(){
    if (setPop) return setPop;
    backdrop = document.createElement('div'); backdrop.id = 'vc-dock-backdrop';
    backdrop.addEventListener('click', closeSettings);
    document.body.appendChild(backdrop);

    setPop = document.createElement('div'); setPop.id = 'vc-dock-settings';
    setPop.innerHTML =
      '<div class="sg-head"><h3 data-ko="⚙️ 설정" data-en="⚙️ Settings">⚙️ 설정</h3><button class="sg-x" data-act="close">✕</button></div>' +
      '<div class="sg-group">' +
        '<div class="sg-gtitle" data-ko="장치" data-en="Devices">장치</div>' +
        '<div class="sg-row"><label data-ko="마이크" data-en="Microphone">마이크</label><select id="sg-mic-dev"><option data-ko="기본 마이크" data-en="Default mic">기본 마이크</option></select></div>' +
        '<div class="sg-row"><label data-ko="마이크 음량" data-en="Mic volume">마이크 음량</label><input type="range" id="sg-mic-vol" min="0" max="100" value="70"></div>' +
        '<div class="sg-row"><label data-ko="스피커" data-en="Speaker">스피커</label><button class="sg-test" data-act="spk" data-ko="테스트 ▶" data-en="Test ▶">테스트 ▶</button></div>' +
        '<div class="sg-row"><label data-ko="카메라" data-en="Camera">카메라</label><select id="sg-cam-dev"><option data-ko="기본 카메라" data-en="Default camera">기본 카메라</option></select></div>' +
        '<div class="sg-row"><label data-ko="잡음 제거" data-en="Noise removal">잡음 제거</label><div class="sg-sw on" data-act="noise"></div></div>' +
      '</div>' +
      '<div class="sg-group">' +
        '<div class="sg-gtitle" data-ko="영상 · 녹화" data-en="Video · Recording">영상 · 녹화</div>' +
        '<div class="sg-row"><label data-ko="영상 화질" data-en="Video quality">영상 화질</label><div class="sg-seg" id="sg-quality"><button data-q="auto" class="on" data-ko="자동" data-en="Auto">자동</button><button data-q="high" data-ko="고" data-en="High">고</button><button data-q="low" data-ko="저" data-en="Low">저</button></div></div>' +
        '<div class="sg-row"><label data-ko="자동 녹화" data-en="Auto record">자동 녹화</label><div class="sg-sw on" data-act="autorec"></div></div>' +
        '<div class="sg-row"><label data-ko="배경 흐림" data-en="Background blur">배경 흐림</label><div class="sg-sw" data-act="blur"></div></div>' +
      '</div>' +
      '<div class="sg-group" style="margin-bottom:2px;">' +
        '<div class="sg-gtitle" data-ko="표시" data-en="Display">표시</div>' +
        '<div class="sg-row"><label data-ko="언어" data-en="Language">언어</label><div class="sg-seg" id="sg-lang"><button data-l="ko">한국어</button><button data-l="en">EN</button></div></div>' +
        '<div class="sg-row"><label data-ko="테마" data-en="Theme">테마</label><div class="sg-seg" id="sg-theme"><button data-t="light" data-ko="라이트" data-en="Light">라이트</button><button data-t="dark" data-ko="다크" data-en="Dark">다크</button></div></div>' +
        '<div class="sg-row"><label data-ko="전체화면" data-en="Fullscreen">전체화면</label><div class="sg-sw" data-act="full"></div></div>' +
      '</div>';
    setPop.addEventListener('click', function(e){ e.stopPropagation(); });

    // 닫기
    setPop.querySelector('[data-act="close"]').onclick = closeSettings;
    // 장치
    var micDev = setPop.querySelector('#sg-mic-dev');
    micDev.onchange = function(){ call('vcSetMicDevice', micDev.value); };
    var camDev = setPop.querySelector('#sg-cam-dev');
    camDev.onchange = function(){ call('vcSetCamDevice', camDev.value); };
    var vol = setPop.querySelector('#sg-mic-vol');
    vol.oninput = function(){ call('vcSetMicVolume', +vol.value); };
    setPop.querySelector('[data-act="spk"]').onclick = beep;
    setPop.querySelector('[data-act="noise"]').onclick = function(){ this.classList.toggle('on'); call('vcSetNoiseSuppression', this.classList.contains('on')); };
    // 영상·녹화
    setPop.querySelectorAll('#sg-quality button').forEach(function(b){
      b.onclick = function(){ setPop.querySelectorAll('#sg-quality button').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); call('vcSetQuality', b.getAttribute('data-q')); };
    });
    setPop.querySelector('[data-act="autorec"]').onclick = function(){ this.classList.toggle('on'); call('vcSetAutoRecord', this.classList.contains('on')); };
    setPop.querySelector('[data-act="blur"]').onclick = function(){ this.classList.toggle('on'); call('vcSetBackgroundBlur', this.classList.contains('on')); };
    // 표시
    setPop.querySelectorAll('#sg-lang button').forEach(function(b){
      b.onclick = function(){ setLang(b.getAttribute('data-l')==='en'); setTimeout(refreshSettings, 40); };
    });
    setPop.querySelectorAll('#sg-theme button').forEach(function(b){
      b.onclick = function(){ setTheme(b.getAttribute('data-t')==='light'); setTimeout(refreshSettings, 20); };
    });
    setPop.querySelector('[data-act="full"]').onclick = function(){ toggleFullscreen(); setTimeout(refreshSettings, 80); };

    document.body.appendChild(setPop);
    // 현재 언어(EN/KO)를 즉시 반영 — MutationObserver 폴백 없이도 바로 번역
    try { if (window.applyI18n) window.applyI18n(setPop); } catch(e){}
    fillDevices();
    return setPop;
  }
  function setSeg(sel, attr, val){
    if (!setPop) return;
    setPop.querySelectorAll(sel+' button').forEach(function(b){ b.classList.toggle('on', b.getAttribute(attr)===val); });
  }
  function refreshSettings(){
    if (!setPop) return;
    setSeg('#sg-theme', 'data-t', isLight()?'light':'dark');
    setSeg('#sg-lang', 'data-l', isEn()?'en':'ko');
    var f = setPop.querySelector('[data-act="full"]'); if (f) f.classList.toggle('on', fullscreenOn());
  }
  // 설정 팝업 위치 — 도크 위, 화면 중앙 정렬 + 양옆 8px 안으로 클램프(모든 폰 폭에서 안 잘림)
  function positionSettings(){
    if (!setPop) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var pw = setPop.getBoundingClientRect().width || 330;
    var left = Math.max(8, Math.min(Math.round((vw - pw) / 2), vw - pw - 8));
    setPop.style.left = left + 'px';
    setPop.style.right = 'auto';
    var dr = dock ? dock.getBoundingClientRect() : null;
    setPop.style.bottom = (dr ? (vh - dr.top + 10) : 80) + 'px';
    setPop.style.top = 'auto';
  }
  function openSettings(){
    buildSettings();
    refreshSettings();
    backdrop.classList.add('open');
    setPop.classList.add('open');       // 먼저 표시해야 폭을 측정할 수 있음
    if (bSet) bSet.classList.add('active');
    positionSettings();                  // 화면 안으로 중앙정렬 + 클램프
  }
  function closeSettings(){
    if (setPop) setPop.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (bSet) bSet.classList.remove('active');
  }
  function toggleSettings(){
    if (setPop && setPop.classList.contains('open')) closeSettings();
    else openSettings();
  }

  // 가로(라벨 숨김) 상태인지 — CSS 압축 조건과 동일(max-height:600 포함). 이름먼저 표시는 이때만
  function isCL(){ try { return window.matchMedia('(orientation:landscape) and (max-width:920px) and (max-height:600px)').matches; } catch(e){ return false; } }
  function showHint(text){
    if (!hint){ hint = document.createElement('div'); hint.id = 'vc-dock-hint'; document.body.appendChild(hint); }
    hint.textContent = text;
    if (dock){ var r = dock.getBoundingClientRect(); hint.style.bottom = (window.innerHeight - r.top + 8) + 'px'; }
    hint.classList.add('show');
    clearTimeout(hintT); hintT = setTimeout(function(){ hint.classList.remove('show'); }, 1300);
  }
  // 가로에선 이름이 먼저 보이도록 동작을 잠깐 미룸 / 세로에선 즉시(기존 동작 유지)
  function openDelayed(fn){ if (isCL()) setTimeout(fn, 230); else fn(); }

  function build(){
    if (dock) return;
    var st = document.createElement('style'); st.id = 'vc-dock-style'; st.textContent = STYLE; document.head.appendChild(st);
    dock = document.createElement('div'); dock.id = 'vc-dock';
    function mk(id, label, icon, cls){
      var b = document.createElement('button'); b.id = 'vc-dock-' + id; if (cls) b.className = cls;
      b.innerHTML = svg(P[icon]) + '<span class="lbl">' + label + '</span>'; return b;
    }
    btnMic = mk('mic','마이크','mic');
    btnCam = mk('cam','카메라','cam');
    var bShare = mk('share','화면공유','share');
    var bChat = mk('chat','채팅','chat');
    var bConsult = mk('consult','상담','consult');
    bSet = mk('settings','설정','settings');
    var bLeave = mk('leave','나가기','leave','leave');

    btnMic.onclick = function(){ if(isCL())showHint('마이크'); closeSettings(); call('vcToggleMic'); setTimeout(sync, 60); };
    btnCam.onclick = function(){ if(isCL())showHint('카메라'); closeSettings(); call('vcToggleCam'); setTimeout(sync, 60); };
    bShare.onclick = function(){ if(isCL())showHint('화면공유'); closeSettings(); call('vcFolderOpen','screen'); };
    bChat.onclick = function(){ if(isCL())showHint('채팅'); closeSettings(); openDelayed(function(){ call('vcToggleChat'); }); };
    bConsult.onclick = function(){ if(isCL())showHint('상담'); closeSettings(); window.open('https://pf.kakao.com/_xlqnSxd/chat','_blank','noopener'); }; // 외부 링크: 지연 없이 즉시(팝업차단 방지)
    bSet.onclick = function(e){ if(e&&e.stopPropagation) e.stopPropagation(); if(isCL())showHint('설정'); openDelayed(toggleSettings); };
    bLeave.onclick = function(){ if(isCL())showHint('나가기'); closeSettings(); call('vcLeaveRoom'); };

    [btnMic, btnCam, bShare, bChat, bConsult, bSet, bLeave].forEach(function(b){ dock.appendChild(b); });
    document.body.appendChild(dock);

    // 🥭 (2026-06-28) 문고리(핸들) — 휴대폰 가로에서 도크를 아래로 접었다/폈다 (카메라 얼굴 가림 해소)
    var handle = document.createElement('button');
    handle.id = 'vc-dock-handle'; handle.type = 'button';
    handle.setAttribute('aria-label', '수업 메뉴 접기/펴기');
    handle.innerHTML = '<span class="vdh-grip"></span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    handle.onclick = function(e){ if(e&&e.stopPropagation) e.stopPropagation(); closeSettings(); document.body.classList.toggle('vc-dock-collapsed'); };
    document.body.appendChild(handle);

    // ★ (2026-07-14 사장님) 모바일 ⋯(가로 점3개) 토글 — 독 기본 숨김, 누르면 열림/다시 누르면 닫힘
    var more = document.createElement('button');
    more.id = 'vc-dock-more'; more.type = 'button';
    more.setAttribute('aria-label', '수업 버튼 열기/닫기');
    more.textContent = '•••';
    more.onclick = function(e){ if(e&&e.stopPropagation) e.stopPropagation(); closeSettings(); document.body.classList.toggle('vc-dock-open'); };
    document.body.appendChild(more);
  }

  function sync(){
    if (!btnMic) return;
    var micOn = (window.vcMicOn !== false);
    var camOn = (window.vcCamOn !== false);
    btnMic.classList.toggle('off', !micOn);
    btnMic.querySelector('svg').outerHTML = svg(micOn ? P.mic : P.micoff);
    btnCam.classList.toggle('off', !camOn);
    btnCam.querySelector('svg').outerHTML = svg(camOn ? P.cam : P.camoff);
  }

  function tick(){
    var inCall = !!(document.body && document.body.classList.contains('vc-in-call'));
    if (inCall) { build(); document.body.classList.add('vc-dock-on'); sync(); }
    else if (document.body) { document.body.classList.remove('vc-dock-on'); document.body.classList.remove('vc-dock-collapsed'); document.body.classList.remove('vc-dock-open'); closeSettings(); }
  }
  if (document.readyState !== 'loading') { tick(); } else { document.addEventListener('DOMContentLoaded', tick); }
  setInterval(tick, 1500);
  // 회전/리사이즈 시 설정 팝업이 열려 있으면 화면 안으로 재배치
  window.addEventListener('resize', function(){ if (setPop && setPop.classList.contains('open')) positionSettings(); });
})();
/* settings panel: 장치·영상/녹화·표시 (v2) */
