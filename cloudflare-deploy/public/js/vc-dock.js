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
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    leave:'<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 16l4-4-4-4"/><line x1="13" y1="12" x2="3" y2="12"/>',
    /* ☰ 기능 (2026-08-20) — 세로 휴대폰에서만 쓰는 «모든 기능·게임» 메뉴 */
    func:'<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>'
  };
  /* 아이콘 22 → 26 (2026-07-22, 강사 피드백 #7 "설정 옵션이 너무 작다") */
  function svg(p){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="26" height="26" aria-hidden="true">'+p+'</svg>'; }
  function call(name, arg){ try { if (typeof window[name] === 'function') return window[name](arg); } catch(e){ console.warn('[vc-dock]', name, e); } }

  var STYLE = [
    '#vc-dock{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:none;z-index:99993;',
    '  align-items:center;gap:7px;padding:9px 12px;border-radius:20px;',
    '  background:rgba(18,22,30,0.62);',
    '  -webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);',
    '  border:1px solid rgba(255,255,255,.18);box-shadow:0 18px 48px rgba(0,0,0,.55);max-width:96vw;flex-wrap:nowrap;}',
    'body.vc-in-call #vc-dock{display:inline-flex;}',
    '#vc-dock button{background:rgba(255,255,255,.12);border:none;color:#eef2f8;border-radius:13px;',
    /* 데스크톱 크기 확대 (2026-07-22, 강사 피드백 #7) — 58×52/9px 은 라벨을 읽기 어렵다는 지적.
       560px 이하 모바일·가로모드는 아래 미디어쿼리가 따로 잡으므로 영향 없음. */
    '  width:70px;height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;',
    '  cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;transition:background .12s,transform .1s;flex:0 0 auto;}',
    '#vc-dock button .lbl{color:#c3ccda;font-size:11px;line-height:1.05;text-shadow:0 1px 2px rgba(0,0,0,.5);}',
    '#vc-dock button svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));}', /* 밝은 배경에서도 아이콘 또렷(다크/라이트 공통) */
    '#vc-dock button:hover{background:rgba(255,255,255,.15);}',
    '#vc-dock button:active{transform:scale(.95);}',
    '#vc-dock button.active{background:#3b82f6;color:#fff;}#vc-dock button.active .lbl{color:#dbe7ff;}',
    '#vc-dock button.off{background:#ef4444;color:#fff;}#vc-dock button.off .lbl{color:#ffe0e0;}',
    '#vc-dock button.leave{background:rgba(239,68,68,.18);color:#ff9a9a;}#vc-dock button.leave .lbl{color:#ffb4b4;}',
    /* 🔔 (2026-07-24) 채팅 안읽음 배지 — 상단 툴바 배지는 모바일(≤640px)에서 숨겨져 있어
       학생이 채팅 온 것을 알 방법이 없었다. 독 버튼 위에 빨간 배지를 띄운다.
       ⚠️ 깜빡임(pulse)은 '자동으로 열지 못한 상황'에서만 켠다 — 늘 깜빡이면 금방 무시하게 된다. */
    '#vc-dock button{position:relative;}',
    '#vc-dock .dock-badge{position:absolute;top:4px;right:8px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;',
    '  background:#ef4444;color:#fff;font-size:10.5px;font-weight:800;line-height:17px;text-align:center;',
    '  box-shadow:0 0 0 2px rgba(11,15,20,.85);display:none;pointer-events:none;}',
    '#vc-dock .dock-badge.on{display:block;}',
    '#vc-dock .dock-badge.pulse{animation:vcDockBadgePulse 1.1s ease-in-out infinite;}',
    '@keyframes vcDockBadgePulse{0%,100%{transform:scale(1);}50%{transform:scale(1.28);}}',
    /* 백그라운드 탭·저전력에서 애니메이션이 멈춰도 배지 자체는 보이도록 opacity 는 건드리지 않는다 */
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
    /* 설정 팝업도 함께 확대 (2026-07-22, 강사 피드백 #7) — 강사가 항목을 하나하나 확인해야 하는 화면이다. */
    '  width:390px;max-width:94vw;max-height:76vh;overflow-y:auto;overflow-x:hidden;padding:18px;border-radius:16px;',
    '  background:rgba(11,15,20,0.98);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);',
    '  border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 40px rgba(0,0,0,.6);}',
    /* 🌐 (2026-07-25) 설정 팝업이 길 때 뜨던 기본(흰색) 스크롤바를 다크로 — 어두운 팝업과 이질감 제거 */
    '#vc-dock-settings{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.28) transparent;}',
    '#vc-dock-settings::-webkit-scrollbar{width:9px;}',
    '#vc-dock-settings::-webkit-scrollbar-track{background:transparent;}',
    '#vc-dock-settings::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:9px;border:2px solid transparent;background-clip:padding-box;}',
    '#vc-dock-settings.open{display:flex;}',
    '#vc-dock-settings .sg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}',
    '#vc-dock-settings .sg-head h3{margin:0;font-size:16.5px;color:#e6ebf2;font-weight:700;}',
    '#vc-dock-settings .sg-head .sg-x{background:none;border:none;color:#9aa4b2;font-size:20px;cursor:pointer;padding:2px 8px;width:auto;height:auto;}',
    '#vc-dock-settings .sg-group{margin-bottom:14px;}',
    '#vc-dock-settings .sg-gtitle{font-size:12.5px;color:#ffd24d;margin-bottom:7px;letter-spacing:.02em;font-weight:700;}',
    '#vc-dock-settings .sg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;font-size:14.5px;}',
    '#vc-dock-settings .sg-row > label{color:#b3bdcb;min-width:0;}',
    '#vc-dock-settings select{background:#1c2530;color:#e6ebf2;border:1px solid #283140;border-radius:8px;font-size:13.5px;padding:7px 10px;max-width:200px;}',
    '#vc-dock-settings input[type=range]{width:140px;accent-color:#ffd24d;}',
    '#vc-dock-settings .sg-seg{display:inline-flex;background:#161d26;border-radius:8px;padding:3px;}',
    '#vc-dock-settings .sg-seg button{background:transparent;border:none;color:#9aa4b2;font-size:13.5px;padding:6px 13px;border-radius:6px;cursor:pointer;width:auto;height:auto;font-family:inherit;}',
    '#vc-dock-settings .sg-seg button.on{background:#ffd24d;color:#1a1300;font-weight:600;}',
    '#vc-dock-settings .sg-sw{position:relative;width:44px;height:25px;background:#1c2530;border-radius:999px;cursor:pointer;border:1px solid #283140;flex:0 0 auto;}',
    '#vc-dock-settings .sg-sw::after{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:#8a94a3;transition:.18s;}',
    '#vc-dock-settings .sg-sw.on{background:#ffd24d;border-color:#ffd24d;}',
    '#vc-dock-settings .sg-sw.on::after{left:22px;background:#1a1300;}',
    '#vc-dock-settings .sg-test{background:#1c2530;border:1px solid #283140;color:#e6ebf2;font-size:12.5px;padding:7px 12px;border-radius:7px;cursor:pointer;width:auto;height:auto;font-family:inherit;}',
    '#vc-dock-settings .sg-test:disabled{opacity:.55;cursor:default;}',
    /* 🎤 (2026-08-06) 마이크 테스트 — 소리 크기 막대 + 상태 글. 실제로 들리는지까지 확인시킨다 */
    '#vc-dock-settings .sg-mic-test{display:flex;flex-direction:column;align-items:flex-end;gap:5px;}',
    '#vc-dock-settings .sg-bar{width:150px;height:8px;background:#161d26;border-radius:5px;overflow:hidden;border:1px solid #283140;}',
    '#vc-dock-settings .sg-bar > i{display:block;height:100%;width:0;background:linear-gradient(90deg,#22c55e,#ffd24d,#ef4444);transition:width .08s linear;}',
    '#vc-dock-settings .sg-note{font-size:11.5px;color:#8a94a3;text-align:right;max-width:190px;line-height:1.35;}',
    '#vc-dock-settings .sg-note.ok{color:#4ade80;} #vc-dock-settings .sg-note.warn{color:#fbbf24;} #vc-dock-settings .sg-note.bad{color:#f87171;}',
    '#vc-dock-settings .sg-fixed{font-size:12.5px;color:#4ade80;font-weight:700;}',
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
    /* ★ (2026-08-08 강사 피드백 — HT Ness ①) 「아래 아이콘을 없앨 수가 없다. 줄이거나 닫거나
       위로 올려 달라 — 거슬리고, 그 아래 작은 아이콘들을 누를 수가 없다」
       ─ 접는 기능은 2026-07-23 부터 있었다. 문제는 «있는 줄 모른다» 였다: 손잡이가
         가로 22px 회색 막대 하나뿐이라 화면 장식으로 보였다. 그래서 글자를 붙인다.
         (같은 자리에 마이크 미터가 겹쳐 있던 시기도 있어 더 안 보였다 — 미터는 왼쪽 아래로 옮겨졌다)
       ─ 그리고 «줄이기»·«위로»를 실제로 만들어 준다: 손잡이 오른쪽의 작은 버튼이
         기본 → 작게 → 위로 를 돌아가며 바꾼다. 선택은 기억한다. */
    '#vc-dock-handle .vdh-txt{display:none;font-size:11.5px;font-weight:700;letter-spacing:.01em;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.6);}',
    '#vc-dock-size{display:none;position:fixed;z-index:99994;align-items:center;justify-content:center;gap:4px;',
    '  cursor:pointer;height:26px;padding:0 11px;border-radius:999px;font-family:inherit;font-size:11.5px;font-weight:700;',
    '  background:rgba(18,22,30,.62);border:1px solid rgba(255,255,255,.18);color:#eef2f8;white-space:nowrap;',
    '  -webkit-backdrop-filter:blur(10px) saturate(1.2);backdrop-filter:blur(10px) saturate(1.2);box-shadow:0 8px 20px rgba(0,0,0,.45);}',
    '#vc-dock-size:hover{background:rgba(32,40,54,.86);}',
    '#vc-dock-size:active{transform:scale(.94);}',
    /* 「작게」 — 라벨을 숨기고 아이콘만. 독 높이 62 → 40, 폭 70 → 46 (교재 아래를 덜 가림) */
    'body.vc-dock-small #vc-dock{gap:4px;padding:5px 8px;border-radius:15px;}',
    'body.vc-dock-small #vc-dock button{width:46px;height:40px;gap:0;}',
    'body.vc-dock-small #vc-dock button .lbl{display:none;}',
    'body.vc-dock-small #vc-dock button svg{width:21px;height:21px;}',
    /* 「위로」 — 상단 탭바 아래로 올린다. 교재·칠판 하단(작은 아이콘들이 모여 있는 곳)이 완전히 열린다.
       bottom 을 auto 로 되돌리지 않으면 아래 규칙과 겹쳐 두 군데에 걸린 채로 남는다. */
    /* !important 인 이유 — 아래 모바일 블록(body.vc-in-call.vc-dock-open #vc-dock)이 선택자가 더 강해
       그냥 두면 bottom 이 되살아나 독이 위·아래 양쪽에 걸린 모양이 된다.
       🔴 (2026-08-08 브라우저 실측) top 을 64px 로 박았더니 상단 툴바(0~65)와 1px 겹치고,
          바로 아래 [화면 크기] 바(65~130)를 통째로 덮었다 — 아래를 비우려다 위를 가리면 같은 신고가
          방향만 바꿔 돌아온다. → 실제 상단 요소들의 «맨 아래»를 재서 --vcdock-top 에 넣는다(아래 syncTopOffset).
       🔴 위로 올릴 때는 «작게» 모양을 함께 입힌다 — 상단은 원래 바가 겹겹이라 큰 독을 놓을 자리가 없다. */
    'body.vc-dock-top #vc-dock{top:var(--vcdock-top,140px) !important;bottom:auto !important;}',
    'body.vc-dock-top #vc-dock{gap:4px;padding:5px 8px;border-radius:15px;}',
    'body.vc-dock-top #vc-dock button{width:46px;height:40px;gap:0;}',
    'body.vc-dock-top #vc-dock button .lbl{display:none;}',
    'body.vc-dock-top #vc-dock button svg{width:21px;height:21px;}',
    'body.vc-dock-top #vc-dock-handle{display:none !important;}',   /* 위에 있으면 접을 이유가 없다 */
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
    '  /* 🥭 (2026-08-20 제보 ③) ☰기능 은 «올리지» 않고 «감춘다» — 독 안에 같은 버튼이 있고,',
    '     132px 로 올린 자리가 정확히 「잠시만 기다려 주세요」 안내문 한가운데였다(실측 t=580). */',
    '  body.vc-in-call.vc-dock-open .vc-phero-ctrl{display:none !important;}',
    '  body.vc-in-call.vc-dock-open #ph52-cache-fab, body.vc-in-call.vc-dock-open .ph52-cache-fab{bottom:calc(env(safe-area-inset-bottom,0px) + 132px) !important;}',
    '}',
    '/* ★ (2026-07-23 사장님) PC: 하단 독이 내 얼굴(PIP)을 가린다 → 문고리로 접었다 폈다.',
    '   모바일(<=1024px)은 위의 ⋯ 버튼이 담당하므로 이 블록은 PC(>=1025px)에만 적용한다.',
    '   트랜지션은 두지 않음 — 가로모드와 같은 이유(혼합 단위 보간 버그). */',
    '@media (min-width:1025px){',
    /* 🏷 (2026-08-08 Ness ①) 손잡이에 «글자» 를 붙인다 — 회색 막대만으로는 누를 것인 줄 모른다.
       폭 78 → 자동. 접힘 상태에서도 「수업 메뉴 펴기」가 보여 되돌리는 길이 항상 눈에 있다. */
    '  body.vc-in-call.vc-dock-on #vc-dock-handle{display:inline-flex;bottom:102px;width:auto;height:26px;padding:0 12px;',
    '    background:rgba(18,22,30,.62);border:1px solid rgba(255,255,255,.18);',
    '    -webkit-backdrop-filter:blur(10px) saturate(1.2);backdrop-filter:blur(10px) saturate(1.2);',
    '    box-shadow:0 8px 20px rgba(0,0,0,.45);}',
    '  body.vc-in-call.vc-dock-on #vc-dock-handle .vdh-txt{display:inline;}',
    '  body.vc-in-call.vc-dock-on #vc-dock-handle .vdh-grip{display:none;}',
    '  body.vc-in-call.vc-dock-on #vc-dock-handle:hover{background:rgba(32,40,54,.86);}',
    /* 「크기·위치」 버튼은 손잡이 오른쪽에. 손잡이가 가운데 정렬이라 계산 대신 left:50% + 여백으로 붙인다. */
    '  body.vc-in-call.vc-dock-on #vc-dock-size{display:inline-flex;bottom:102px;left:50%;margin-left:96px;}',
    '  body.vc-in-call.vc-dock-collapsed #vc-dock{transform:translateX(-50%) translateY(190%) !important;opacity:0;pointer-events:none;}',
    '  body.vc-in-call.vc-dock-collapsed #vc-dock-handle{bottom:14px;}',
    '  body.vc-in-call.vc-dock-collapsed #vc-dock-size{bottom:14px;}',
    '  body.vc-in-call.vc-dock-collapsed #vc-dock-handle svg{transform:rotate(180deg);}',
    /* 위로 올렸으면 손잡이가 사라지므로 크기 버튼도 위로 따라간다(되돌릴 길이 남아 있어야 한다).
       🔴 (실측) 오른쪽 끝(right:14px)에 두었더니 [화면 크기] 바(1/4·1/2·3/4·Full)를 덮었다.
          → 독 바로 오른쪽에 붙인다. 위 모드의 독은 아이콘만이라 폭이 362px 로 고정이다. */
    '  body.vc-in-call.vc-dock-on.vc-dock-top #vc-dock-size{top:calc(var(--vcdock-top,140px) + 13px);bottom:auto;left:50%;margin-left:190px;}',
    '}',
    /* 모바일: ⋯ 로 독을 연 상태에서만 크기·위치 버튼을 보여 준다(평소엔 화면을 깨끗하게) */
    '@media (max-width:1024px){',
    '  body.vc-in-call.vc-dock-open #vc-dock-size{display:inline-flex;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);left:14px;}',
    '  body.vc-in-call.vc-dock-open.vc-dock-top #vc-dock-size{top:calc(var(--vcdock-top,140px) + 60px);bottom:auto;left:50%;transform:translateX(-50%);}',
    '}',
    /* ☰ 기능 (2026-08-20 사장님 지시 ③) — 세로 휴대폰에서만 «화면공유» 자리를 «기능» 이 대신한다.
       ・왜 — 세로에서 ☰기능 은 가장 자주 누르는 버튼인데 화면 한가운데 떠 있어 안내문을 가렸다.
              독 안으로 들여보내면 «떠 있는 버튼» 이 하나 줄고, 자리도 정해진다.
       ・화면공유는 사라지지 않는다 — ☰ 기능 메뉴 안으로 들어간다(idx-vc-screenmode.js).
       ⛔ PC·가로에는 ☰ 기능 메뉴 자체가 없다. 그쪽에서 화면공유를 감추면 쓸 방법이 없어지므로
          «세로 + 좁은 화면» 에서만 바꾼다. 버튼 개수는 양쪽 다 7개 그대로다(줄 넘침 없음). */
    /* ⚠️ 선택자를 «#vc-dock #vc-dock-func» 로 쓴다 — 위의 «#vc-dock button{display:flex}» 가
       특정성(1,0,1)이 더 높아 «#vc-dock-func»(1,0,0) 하나로는 못 이긴다.
       실제로 밟았다: PC·가로에서 화면공유와 기능이 «둘 다» 나와 버튼이 8개가 됐다(실측). */
    '#vc-dock #vc-dock-func{display:none;}',
    '@media (max-width:1024px) and (orientation:portrait){',
    '  #vc-dock #vc-dock-share{display:none !important;}',
    '  #vc-dock #vc-dock-func{display:flex !important;}',
    '}'
  ].join('\n');

  var dock, btnMic, btnCam, bSet, setPop, backdrop, hint, hintT;

  /* ★ (2026-07-23 사장님) 독 접기 상태 — PC에서만 기억한다.
     모바일(<=1024px)은 문고리가 display:none !important 라, 접힘이 남아 있으면
     ⋯ 로 열어도 독이 화면 밖에 머물러 되돌릴 방법이 없다. 그래서 PC 한정. */
  var COLLAPSE_KEY = 'mangoi_vc_dock_collapsed';
  function isPC(){ try { return window.innerWidth >= 1025; } catch(e){ return false; } }
  function syncHandleLabel(){
    var h = document.getElementById('vc-dock-handle'); if (!h) return;
    var col = document.body.classList.contains('vc-dock-collapsed');
    var en = isEn();
    var t = col ? '수업 메뉴 펴기 (Show class menu)'
                : '수업 메뉴 접기 — 내 얼굴 가림 해소 (Hide class menu)';
    h.title = t; h.setAttribute('aria-label', t);
    /* 🏷 (2026-08-08 Ness ①) 손잡이에 글자를 실제로 넣는다. 강사 다수가 필리핀이라 언어를 따른다 —
       한쪽만 적으면 «있는 줄 몰랐다» 가 언어만 바뀌어 되돌아온다. */
    var txt = h.querySelector('.vdh-txt');
    if (txt) {
      var s = col ? (en ? '▲ Show menu' : '▲ 메뉴 펴기')
                  : (en ? '▼ Hide menu' : '▼ 메뉴 숨기기');
      if (txt.textContent !== s) txt.textContent = s;
    }
  }

  /* ★ (2026-08-08 Ness ①) 「줄이거나 · 위로 올려 달라」 — 세 자리를 돌아가며 고른다.
     기본(아래·큰) → 작게(아래·아이콘만) → 위로(상단) → 기본.
     ⚠️ 버튼 하나로 도는 이유: 독 옆에 버튼을 3개 붙이면 그것이 다시 화면을 가린다.
        지금 상태가 무엇인지는 버튼 글자에 그대로 적어 둔다(다음에 무엇이 되는지도 함께). */
  var SIZE_KEY = 'mangoi_vc_dock_size';           // '' | 'small' | 'top'
  var SIZE_ORDER = ['', 'small', 'top'];
  function getDockSize(){
    try { var v = localStorage.getItem(SIZE_KEY) || ''; return SIZE_ORDER.indexOf(v) >= 0 ? v : ''; }
    catch(e){ return ''; }
  }
  /* 📏 (2026-08-08 브라우저 실측) 「위로」 자리를 **재서** 정한다.
     상단은 툴바(탭)와 [화면 크기] 바가 겹겹이라 고정값을 박으면 반드시 무언가를 덮는다.
     실제로 64px 로 박았더니 툴바와 1px 겹치고 화면크기 바(65~130)를 통째로 가렸다.
     ⚠️ 화면이 접히거나 가로/세로가 바뀌면 이 값이 달라진다 → 리사이즈와 틱에서 다시 잰다. */
  var TOP_SELECTORS = ['.toolbar', '.video-size-bar', '.tab-bar', '#vc-topbar'];
  function syncTopOffset(){
    if (!document.body || !document.body.classList.contains('vc-dock-top')) return;
    var bottom = 0;
    for (var i = 0; i < TOP_SELECTORS.length; i++) {
      var el = document.querySelector(TOP_SELECTORS[i]);
      if (!el) continue;
      try {
        var s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        var r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < 260 && r.bottom > bottom) bottom = r.bottom;   // 상단 근처 것만
      } catch(e){}
    }
    var v = Math.round(Math.max(70, Math.min(300, bottom + 6)));
    var cur = document.documentElement.style.getPropertyValue('--vcdock-top');
    if (cur !== v + 'px') document.documentElement.style.setProperty('--vcdock-top', v + 'px');
  }

  function applyDockSize(v){
    var b = document.body; if (!b) return;
    b.classList.toggle('vc-dock-small', v === 'small');
    b.classList.toggle('vc-dock-top',   v === 'top');
    if (v === 'top') syncTopOffset();
    /* 위로 올라간 상태에서 접힘이 남아 있으면 «위에도 없고 아래에도 없는» 실종이 된다.
       손잡이가 위 모드에선 숨겨지므로 되돌릴 방법도 사라진다 → 반드시 함께 푼다. */
    if (v === 'top') b.classList.remove('vc-dock-collapsed');
    try { localStorage.setItem(SIZE_KEY, v); } catch(e){}
    syncSizeLabel();
    syncHandleLabel();
  }
  function syncSizeLabel(){
    var el = document.getElementById('vc-dock-size'); if (!el) return;
    var v = getDockSize(), en = isEn();
    /* 🏷 (2026-08-11 HT Ness ①·추가) "아래 아이콘을 없앨 수 없다 / 위로 옮겨 달라"
       [실제] 위로 올리는 기능은 이 버튼에 «이미» 있었다(기본 → 작게 → 위). 그런데 라벨이
              «⇕ 기본» 처럼 «지금 상태» 만 말해서, 눌렀을 때 무엇이 되는지 아무도 몰랐다.
              그 정보는 hover 툴팁에만 있었는데 — 강사는 노트북에서 툴팁을 띄울 일이 없다.
       [해결] 상태가 아니라 «다음에 무엇이 되는지» 를 함께 적는다. 같은 함정을 이 저장소에서
              여러 번 겪었다(교재 고르기·참가자 전체 보기·칠판만 크게 — 전부 이름만 바꿔 해결). */
    var next = v === '' ? (en ? 'Small' : '작게')
             : v === 'small' ? (en ? 'Top' : '위로')
             : (en ? 'Bottom' : '아래로');
    var now = v === 'small' ? (en ? 'Small' : '작게')
            : v === 'top' ? (en ? 'Top' : '위')
            : (en ? 'Bottom' : '아래');
    var s = '⇕ ' + now + ' → ' + next;
    if (el.textContent !== s) el.textContent = s;
    var tip = en ? 'Where the class menu sits — Bottom → Small → Top. Choose Top to move it up with the other icons; your choice is remembered.'
                 : '수업 메뉴 자리 — 아래 → 작게 → 위. 「위」를 고르면 위쪽 아이콘들과 같은 줄로 올라가고, 고른 자리는 기억됩니다.';
    el.title = tip; el.setAttribute('aria-label', tip);
  }
  function cycleDockSize(){
    var i = SIZE_ORDER.indexOf(getDockSize());
    applyDockSize(SIZE_ORDER[(i + 1) % SIZE_ORDER.length]);
  }
  function setCollapsed(v){
    document.body.classList.toggle('vc-dock-collapsed', !!v);
    if (isPC()) { try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch(_){ } }
    syncHandleLabel();
  }
  function restoreCollapsed(){
    if (!isPC()) return;                       // 모바일은 항상 펴진 상태로 시작
    var v = false; try { v = (localStorage.getItem(COLLAPSE_KEY) === '1'); } catch(_){ }
    document.body.classList.toggle('vc-dock-collapsed', v);
    syncHandleLabel();
  }

  function fullscreenOn(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFullscreen(){
    try {
      if (!fullscreenOn()) {
        var el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        setFullPref(true);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        setFullPref(false);   // 사용자가 껐으면 다음 수업에서 자동 전체화면 하지 않는다
      }
    } catch(e){ console.warn('[vc-dock] fullscreen', e); }
  }
  /* 🖥 (2026-07-23) 전체화면은 기본 켜짐 — 수업에 들어가면 자동으로 들어간다(index.html vcGoFullscreen).
     여기서는 사용자가 직접 켜고 끈 선택만 기억해 둔다. */
  function setFullPref(on){
    try { if (window.vcSetFullscreenPref) window.vcSetFullscreenPref(on);
          else localStorage.setItem('mangoi_vc_fullscreen', on ? '1' : '0'); } catch(e){}
  }
  function savedQuality(){
    try { if (window.vcGetQuality) return window.vcGetQuality();
          var v = localStorage.getItem('mangoi_vc_quality');
          return (v==='auto'||v==='high'||v==='low') ? v : 'low'; } catch(e){ return 'low'; }
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
  /* 🔔 (2026-08-06) 스피커 확인음.
     예전 소리는 660Hz 사인파 0.4초 하나 = 강사들이 말한 "'띵' 하는 작은 소리 한 번".
     너무 짧고 작아서 '스피커가 되는지' 판단이 안 됐다 → 3음 차임(도·미·솔) 1.2초, 음량도 올린다.
     ⚠️ AudioContext 는 만들자마자 suspended 일 수 있다(자동재생 정책) → 반드시 resume 후 울린다. */
  function beep(){
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var ac = new AC();
      var play = function(){
        var t0 = ac.currentTime + 0.02;
        [523.25, 659.25, 783.99].forEach(function(f, i){
          var o = ac.createOscillator(), g = ac.createGain();
          o.type = 'triangle'; o.frequency.value = f;
          o.connect(g); g.connect(ac.destination);
          var s = t0 + i * 0.22;
          g.gain.setValueAtTime(0.0001, s);
          g.gain.exponentialRampToValueAtTime(0.5, s + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, s + 0.55);
          o.start(s); o.stop(s + 0.6);
        });
        setTimeout(function(){ try { ac.close(); } catch(_){} }, 1600);  // 컨텍스트 누수 방지
      };
      if (ac.state === 'suspended' && ac.resume) { ac.resume().then(play).catch(play); } else play();
    } catch(_){ }
  }

  /* 🎤 (2026-08-06) 진짜 마이크 테스트.
     ① 지금 수업에 '실제로 나가고 있는' 오디오 트랙을 그대로 검사한다(새로 잡지 않는다).
        새로 getUserMedia 하면 "테스트는 되는데 수업에선 안 들려요" 를 못 잡는다.
     ② 3초간 소리 크기를 막대로 보여주고, 그 3초를 녹음해 되들려준다.
        들리면 마이크+스피커가 둘 다 정상 — 강사가 혼자서 판단할 수 있다. */
  var micTestBusy = false;
  function micTest(){
    if (micTestBusy) return;
    var btn = setPop && setPop.querySelector('[data-act="mic"]');
    var bar = setPop && setPop.querySelector('#sg-mic-bar');
    var note = setPop && setPop.querySelector('#sg-mic-note');
    var en = isEn();
    function say(text, cls){ if (note){ note.textContent = text; note.className = 'sg-note' + (cls ? ' ' + cls : ''); note.removeAttribute('data-ko'); note.removeAttribute('data-en'); } }
    var stream = null;
    try { stream = window.vcLocalStream || null; } catch(_){ stream = null; }
    var track = null;
    try { track = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null; } catch(_){ }
    if (!track || track.readyState !== 'live'){
      say(en ? 'No microphone in this class yet. Rejoin or check permission.' : '수업에 잡힌 마이크가 없습니다. 권한을 확인하거나 다시 입장해 주세요.', 'bad');
      return;
    }
    if (track.enabled === false){
      say(en ? 'Your mic is muted. Turn it on first.' : '지금 마이크가 꺼져 있어요. 먼저 마이크를 켜 주세요.', 'warn');
      return;
    }
    micTestBusy = true;
    if (btn) btn.disabled = true;
    var AC = window.AudioContext || window.webkitAudioContext;
    var ac = null, timer = null, rec = null, chunks = [], peak = 0, url = '';
    function cleanup(){
      if (timer) { clearInterval(timer); timer = null; }
      try { if (ac) ac.close(); } catch(_){}
      ac = null;
      if (bar) bar.style.width = '0';
      if (btn) btn.disabled = false;
      micTestBusy = false;
    }
    try {
      var only = new MediaStream([track]);          // 수업 스트림은 건드리지 않고 트랙만 빌린다
      if (AC){
        ac = new AC();
        if (ac.state === 'suspended' && ac.resume) { try { ac.resume(); } catch(_){} }
        var an = ac.createAnalyser(); an.fftSize = 256;
        ac.createMediaStreamSource(only).connect(an);
        var data = new Uint8Array(an.frequencyBinCount);
        timer = setInterval(function(){
          an.getByteTimeDomainData(data);
          var sum = 0;
          for (var i = 0; i < data.length; i++){ var v = (data[i] - 128) / 128; sum += v * v; }
          var rms = Math.sqrt(sum / data.length);
          if (rms > peak) peak = rms;
          if (bar) bar.style.width = Math.min(100, Math.round(rms * 600)) + '%';
        }, 80);
      }
      say(en ? '🔴 Recording… speak now (3s)' : '🔴 지금 말해 보세요 (3초 녹음 중)', 'warn');
      if (window.MediaRecorder){
        try {
          rec = new MediaRecorder(only);
          rec.ondataavailable = function(e){ if (e.data && e.data.size) chunks.push(e.data); };
          rec.onstop = function(){
            var quiet = peak < 0.02;
            try {
              var blob = new Blob(chunks, { type: (rec.mimeType || 'audio/webm') });
              if (!quiet && blob.size > 0){
                url = URL.createObjectURL(blob);
                var a = new Audio(url); a.volume = 1;
                say(en ? '▶ Playing back what we heard…' : '▶ 방금 들린 소리를 그대로 들려드립니다…', 'ok');
                a.onended = function(){
                  try { URL.revokeObjectURL(url); } catch(_){}
                  say(en ? '✅ Heard it? Then mic and speaker are both fine.' : '✅ 방금 소리가 들렸다면 마이크·스피커 모두 정상입니다.', 'ok');
                };
                var p = a.play(); if (p && p.catch) p.catch(function(){
                  say(en ? '⚠ Mic OK, but playback was blocked by the browser.' : '⚠ 마이크는 정상인데 브라우저가 재생을 막았습니다. 화면을 한 번 클릭한 뒤 다시 눌러 주세요.', 'warn');
                });
              } else {
                say(en ? '❌ No sound came in. Check Windows mic settings or pick another mic above.'
                       : '❌ 소리가 전혀 들어오지 않았습니다. 위에서 다른 마이크를 골라 보거나 윈도우 소리 설정을 확인해 주세요.', 'bad');
              }
            } catch(e){ say(en ? '⚠ Playback failed.' : '⚠ 재생에 실패했습니다.', 'warn'); }
            cleanup();
          };
          rec.start();
          setTimeout(function(){ try { if (rec && rec.state !== 'inactive') rec.stop(); } catch(_){ cleanup(); } }, 3000);
        } catch(e){ rec = null; }
      }
      if (!rec){
        // MediaRecorder 가 없는 브라우저 — 막대만으로 판정
        setTimeout(function(){
          say(peak < 0.02
            ? (en ? '❌ No sound came in. Check your mic.' : '❌ 소리가 전혀 들어오지 않았습니다. 마이크를 확인해 주세요.')
            : (en ? '✅ Your voice is coming through.' : '✅ 목소리가 정상적으로 들어오고 있습니다.'),
            peak < 0.02 ? 'bad' : 'ok');
          cleanup();
        }, 3000);
      }
    } catch(e){
      console.warn('[vc-dock] micTest', e);
      say(en ? '⚠ Test failed.' : '⚠ 테스트에 실패했습니다.', 'bad');
      cleanup();
    }
  }

  /* 📋 장치 목록 채우기.
     🔴 (2026-08-06) 예전엔 ① 지금 쓰는 장치를 선택 상태로 표시하지 않았고 ② 팝업을 처음 만들 때
        딱 한 번만 채웠다. 그래서 수업 도중 USB 웹캠을 꽂으면 목록에 안 나타났고, 나타나도
        무엇이 지금 쓰는 카메라인지 알 수 없었다. 열 때마다 + 장치가 바뀔 때마다 다시 채운다. */
  function activeDeviceId(kind){
    try {
      var s = window.vcLocalStream; if (!s) return '';
      var t = (kind === 'video' ? s.getVideoTracks() : s.getAudioTracks())[0];
      return (t && t.getSettings && t.getSettings().deviceId) || '';
    } catch(_){ return ''; }
  }
  function savedDeviceId(kind){
    try { return localStorage.getItem(kind === 'video' ? 'mangoi_vc_cam_id' : 'mangoi_vc_mic_id') || ''; } catch(_){ return ''; }
  }
  function fillDevices(){
    if (!setPop || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function(list){
      var micSel = setPop.querySelector('#sg-mic-dev'), camSel = setPop.querySelector('#sg-cam-dev');
      var curMic = activeDeviceId('audio') || savedDeviceId('audio');
      var curCam = activeDeviceId('video') || savedDeviceId('video');
      if (micSel) micSel.innerHTML = ''; if (camSel) camSel.innerHTML = '';
      var mc=0, cc=0;
      list.forEach(function(d){
        if (!d.deviceId) return;
        // 윈도우가 만들어 내는 가짜 항목(default/communications)은 실제 장치와 중복이라 뺀다
        if (d.deviceId === 'communications') return;
        var label = (d.label || '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*/i, '').trim();
        if (d.kind==='audioinput' && micSel){
          var o=document.createElement('option'); o.value=d.deviceId;
          o.textContent = label || ('마이크 '+(++mc));
          micSel.appendChild(o);
        }
        if (d.kind==='videoinput' && camSel){
          var o2=document.createElement('option'); o2.value=d.deviceId;
          o2.textContent = label || ('카메라 '+(++cc));
          camSel.appendChild(o2);
        }
      });
      /* 🔴 (2026-08-06) 선택 표시는 «옵션을 붙이면서» 하면 안 된다.
         지금 쓰는 트랙의 deviceId 가 목록에 없는 경우가 실제로 있다
         (가상배경·화면공유처럼 캔버스에서 만든 트랙은 목록에 없는 임의 id 를 돌려준다.
          파이어폭스는 아예 빈 값이다). 그러면 아무것도 선택되지 않아 브라우저가 «첫 번째» 를
         보여주고, 사용자 눈엔 "USB 캠을 골랐는데 노트북 캠으로 되돌아갔다" 로 보인다.
         → 지금 트랙 → 저장된 선택 순서로, 목록에 «실제로 있는» 첫 후보를 골라 준다. */
      function applySel(sel, ids){
        if (!sel) return;
        for (var i = 0; i < ids.length; i++){
          if (!ids[i]) continue;
          for (var j = 0; j < sel.options.length; j++){
            if (sel.options[j].value === ids[i]) { sel.value = ids[i]; return; }
          }
        }
      }
      applySel(micSel, [curMic, savedDeviceId('audio')]);
      applySel(camSel, [curCam, savedDeviceId('video')]);
      if (micSel && !micSel.children.length){ var om=document.createElement('option'); om.textContent='기본 마이크'; micSel.appendChild(om); }
      if (camSel && !camSel.children.length){ var oc=document.createElement('option'); oc.textContent='기본 카메라'; camSel.appendChild(oc); }
    }).catch(function(){ });
  }
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener){
      navigator.mediaDevices.addEventListener('devicechange', function(){ try { fillDevices(); } catch(_){} });
    }
  } catch(_){}

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
        /* 🎤 (2026-08-06) 자리에 있던 '마이크 음량' 슬라이더는 부르는 함수(vcSetMicVolume)가 아예 없어
           아무 동작도 하지 않았다. 없는 기능을 흉내내는 슬라이더보다, 강사가 실제로 필요로 한
           '내 소리가 나가긴 하나' 를 확인시켜 주는 테스트로 바꾼다(막대 + 3초 녹음 후 되들려주기). */
        '<div class="sg-row"><label data-ko="마이크 테스트" data-en="Mic test">마이크 테스트</label>' +
          '<div class="sg-mic-test">' +
            '<button class="sg-test" data-act="mic" data-ko="🎤 말해보기" data-en="🎤 Speak">🎤 말해보기</button>' +
            '<div class="sg-bar"><i id="sg-mic-bar"></i></div>' +
            '<div class="sg-note" id="sg-mic-note" data-ko="누르고 3초간 말해 보세요" data-en="Press, then speak for 3s">누르고 3초간 말해 보세요</div>' +
          '</div></div>' +
        '<div class="sg-row"><label data-ko="스피커" data-en="Speaker">스피커</label><button class="sg-test" data-act="spk" data-ko="🔔 소리 확인" data-en="🔔 Play sound">🔔 소리 확인</button></div>' +
        /* 🔊 (2026-08-26 학생 제보) 안드로이드에서 하드웨어 볼륨키가 "통화" 스트림을 움직이는데
           실제 출력은 "미디어" 스트림을 따라가는 기기(특히 삼성)가 있어, 버튼을 눌러도 소리가 안 커졌다.
           OS 가 어느 스트림을 쓸지는 웹페이지가 정할 수 없어서(브라우저에 그 API가 없음) 스트림 자체를
           "하나로 통일"할 수는 없다 — 대신 OS 스트림과 무관하게 항상 먹는 자체 음량을 하나 둔다.
           ⛔ 상한이 100% 면 이 제보를 못 푼다 — element.volume 은 1 이 «지금 소리» 라 «작게» 만 된다.
              그래서 300% 까지 두고, 100% 를 넘는 구간은 idx-vc-outputvolume.js 가 WebAudio 로 실제 증폭한다.
           ⚠️ 값(%)을 «글자로» 함께 보여준다 — 슬라이더만 있으면 지금 몇 %인지 알 수 없고,
              «100% 가 원래 소리» 라는 것도 안 보인다. */
        '<div class="sg-row"><label data-ko="출력 음량" data-en="Output volume">출력 음량</label>' +
          '<span style="display:flex;align-items:center;gap:8px;min-width:0">' +
            '<input type="range" id="sg-out-vol" min="0" max="300" step="10" value="100" style="flex:1;min-width:96px">' +
            '<b id="sg-out-vol-num" style="color:#e6edf6;font-size:13px;min-width:44px;text-align:right">100%</b>' +
          '</span></div>' +
        '<div class="sg-row"><label data-ko="카메라" data-en="Camera">카메라</label><select id="sg-cam-dev"><option data-ko="기본 카메라" data-en="Default camera">기본 카메라</option></select></div>' +
        '<div class="sg-row"><label data-ko="잡음 제거" data-en="Noise removal">잡음 제거</label><div class="sg-sw on" data-act="noise"></div></div>' +
      '</div>' +
      '<div class="sg-group">' +
        '<div class="sg-gtitle" data-ko="영상 · 녹화" data-en="Video · Recording">영상 · 녹화</div>' +
        '<div class="sg-row"><label data-ko="영상 화질" data-en="Video quality">영상 화질</label><div class="sg-seg" id="sg-quality"><button data-q="auto" data-ko="자동" data-en="Auto">자동</button><button data-q="high" data-ko="고" data-en="High">고</button><button data-q="low" data-ko="저" data-en="Low">저</button></div></div>' +
        /* 📼 (2026-08-06) 자동 녹화 스위치도 부르는 함수(vcSetAutoRecord)가 없어 껐다 켜도 아무 일이 없었다.
           녹화는 '30일 복습' 이라는 학부모 약속이라 실제로 끌 수 있게 만들면 안 된다(한 번 끄면 그 수업은
           영영 못 되돌린다) → 가짜 스위치를 없애고 사실대로 '항상 켬' 이라고 적는다. */
        '<div class="sg-row"><label data-ko="자동 녹화" data-en="Auto record">자동 녹화</label><span class="sg-fixed" data-ko="항상 켬" data-en="Always on">항상 켬</span></div>' +
        '<div class="sg-row"><label data-ko="배경 흐림" data-en="Background blur">배경 흐림</label><div class="sg-sw" data-act="blur"></div></div>' +
      '</div>' +
      '<div class="sg-group" style="margin-bottom:2px;">' +
        '<div class="sg-gtitle" data-ko="표시" data-en="Display">표시</div>' +
        '<div class="sg-row"><label data-ko="언어" data-en="Language">언어</label><div class="sg-seg" id="sg-lang"><button data-l="ko">한국어</button><button data-l="en">EN</button></div></div>' +
        '<div class="sg-row"><label data-ko="테마" data-en="Theme">테마</label><div class="sg-seg" id="sg-theme"><button data-t="light" data-ko="라이트" data-en="Light">라이트</button><button data-t="dark" data-ko="다크" data-en="Dark">다크</button></div></div>' +
        '<div class="sg-row"><label data-ko="전체화면" data-en="Fullscreen">전체화면</label><div class="sg-sw" data-act="full"></div></div>' +
      '</div>' +
      /* 🛠 (2026-09-01) 도움받기 — 바로 위 «장치» 그룹에 마이크 테스트·소리 확인이 있다.
         스스로 확인해 봤는데도 안 되면 여기서 사람에게 넘어간다.
         ⛔ 독에 8번째 버튼으로 만들지 말 것 — 독은 폭이 꽉 차 있어 좁은 폰에서 줄이 넘친다.
         ⚠️ 수업 «중» 에 원격지원을 시작하면 프로그램을 깔고 코드를 주고받느라 수업이 더 끊긴다.
            그래서 눈에 띄는 자리가 아니라 이 조용한 뒷자리에 둔다(2026-09-01 사장님 확인). */
      '<div class="sg-group" style="margin-bottom:2px;">' +
        '<div class="sg-gtitle" data-ko="도움받기" data-en="Get help">도움받기</div>' +
        '<div class="sg-row"><label data-ko="계속 안 될 때" data-en="Still not working">계속 안 될 때</label>' +
          '<button class="sg-test" data-act="remotehelp" data-ko="🛠 원격 도움받기" data-en="🛠 Remote help">🛠 원격 도움받기</button></div>' +
      '</div>';
    setPop.addEventListener('click', function(e){ e.stopPropagation(); });

    // 닫기
    setPop.querySelector('[data-act="close"]').onclick = closeSettings;
    // 장치
    var micDev = setPop.querySelector('#sg-mic-dev');
    micDev.onchange = function(){ call('vcSetMicDevice', micDev.value); };
    var camDev = setPop.querySelector('#sg-cam-dev');
    camDev.onchange = function(){ call('vcSetCamDevice', camDev.value); };
    setPop.querySelector('[data-act="mic"]').onclick = micTest;
    setPop.querySelector('[data-act="spk"]').onclick = beep;
    var outVol = setPop.querySelector('#sg-out-vol');
    if (outVol) outVol.oninput = function(){
      /* ⚠️ 증폭은 «사용자 제스처» 안에서 켜져야 AudioContext 가 resume 된다 —
         그래서 여기서 바로 부른다(나중에 몰아서 부르면 자동재생 정책에 막힌다). */
      call('vcSetOutputVolume', outVol.value / 100);
      var n = setPop.querySelector('#sg-out-vol-num');
      if (n) n.textContent = outVol.value + '%';
    };
    setPop.querySelector('[data-act="noise"]').onclick = function(){ this.classList.toggle('on'); call('vcSetNoiseSuppression', this.classList.contains('on')); };
    // 영상·녹화
    setPop.querySelectorAll('#sg-quality button').forEach(function(b){
      b.onclick = function(){ setPop.querySelectorAll('#sg-quality button').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); call('vcSetQuality', b.getAttribute('data-q')); };
    });
    setPop.querySelector('[data-act="blur"]').onclick = function(){ this.classList.toggle('on'); call('vcSetBackgroundBlur', this.classList.contains('on')); };
    // 표시
    setPop.querySelectorAll('#sg-lang button').forEach(function(b){
      b.onclick = function(){ setLang(b.getAttribute('data-l')==='en'); setTimeout(refreshSettings, 40); };
    });
    setPop.querySelectorAll('#sg-theme button').forEach(function(b){
      b.onclick = function(){ setTheme(b.getAttribute('data-t')==='light'); setTimeout(refreshSettings, 20); };
    });
    setPop.querySelector('[data-act="full"]').onclick = function(){ toggleFullscreen(); setTimeout(refreshSettings, 80); };
    /* 🛠 도움받기 — 모달을 여는 함수가 없으면 그 줄을 아예 감춘다.
       ⚠️ «보이는데 눌러도 아무 일 없는 버튼» 이 이 저장소가 반복해서 밟은 함정이다. */
    (function(){
      var rh = setPop.querySelector('[data-act="remotehelp"]');
      if (!rh) return;
      if (typeof window.openRemoteSupportModal !== 'function') {
        var row = rh.closest ? rh.closest('.sg-group') : null;
        if (row) row.style.display = 'none';
        return;
      }
      rh.onclick = function(){ closeSettings(); window.openRemoteSupportModal(); };
    })();

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
    setSeg('#sg-quality', 'data-q', savedQuality());   // 저장된 화질을 그대로 보여준다
    var f = setPop.querySelector('[data-act="full"]'); if (f) f.classList.toggle('on', fullscreenOn());
    // 🔁 (2026-08-06) 스위치도 '지금 실제 상태' 를 보여준다 — 여태 열 때마다 기본값으로 되돌아가 있었다
    try {
      var n = setPop.querySelector('[data-act="noise"]');
      if (n) n.classList.toggle('on', (localStorage.getItem('mangoi_vc_noise') !== '0'));
    } catch(_){}
    try {
      var b = setPop.querySelector('[data-act="blur"]');
      if (b) b.classList.toggle('on', !!(window.vcBg && window.vcBg.mode === 'blur'));
    } catch(_){}
    // 🔊 저장된 출력 음량을 보여준다(idx-vc-outputvolume.js 가 아직 안 붙었으면 100%로 둔다)
    try {
      var ov = setPop.querySelector('#sg-out-vol');
      if (ov) {
        ov.value = Math.round((typeof window.vcSavedOutputVolume === 'function' ? window.vcSavedOutputVolume() : 1) * 100);
        var ovn = setPop.querySelector('#sg-out-vol-num');
        if (ovn) ovn.textContent = ov.value + '%';
      }
    } catch(_){}
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
    fillDevices();      // 🔌 (2026-08-06) 열 때마다 다시 — 수업 중 꽂은 USB 웹캠·헤드셋이 바로 목록에 뜬다
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
    // 🌐 (2026-07-25) 독 라벨을 data-ko/data-en 으로 고정 — '설정'·'화면공유'는 i18n 사전에 없어
    //   sweep 타이밍에 따라 라벨이 오락가락하던 문제를 없앤다(항상 현재 언어를 따름).
    var LBL_EN = {'마이크':'Microphone','카메라':'Camera','화면공유':'Screen sharing','채팅':'Chat','상담':'Consult','설정':'Settings','나가기':'Exit','기능':'Menu'};
    function mk(id, label, icon, cls, tip){
      var b = document.createElement('button'); b.id = 'vc-dock-' + id; if (cls) b.className = cls;
      if (tip) b.title = tip;
      var en = LBL_EN[label] || label;
      var cur = (typeof isEn==='function' && isEn()) ? en : label;
      b.innerHTML = svg(P[icon]) + '<span class="lbl" data-ko="' + label + '" data-en="' + en + '">' + cur + '</span>'; return b;
    }
    btnMic = mk('mic','마이크','mic',null,'마이크 켜기/끄기');
    btnCam = mk('cam','카메라','cam',null,'카메라 켜기/끄기');
    var bShare = mk('share','화면공유','share',null,'화면공유 — 내 화면·파일을 학생에게 보여주기');
    /* ☰ 기능 (2026-08-20 사장님 지시 ③) — 세로 휴대폰에서만 «화면공유» 자리를 대신한다.
       화면공유는 ☰ 기능 메뉴 안으로 들어간다(사장님이 그렇게 고르셨다).
       ⚠️ PC·가로에는 ☰ 기능 메뉴 자체가 없으므로 그쪽 독은 지금까지처럼 «화면공유» 를 쓴다
          — 그래서 버튼을 둘 다 만들어 두고 아래 CSS 로 화면 방향에 따라 하나만 보여 준다. */
    var bFunc = mk('func','기능','func',null,'기능·게임 메뉴 열기 (칠판·교재·화면공유·게임)');
    var bChat = mk('chat','채팅','chat',null,'채팅 창 열기/닫기');
    // 🔔 (2026-07-24) 안읽음 배지 부착 — 값 갱신은 window.vcDockChatBadge(n, pulse)
    try {
      var chatBadge = document.createElement('span');
      chatBadge.className = 'dock-badge'; chatBadge.id = 'vc-dock-chat-badge';
      bChat.appendChild(chatBadge);
    } catch(_){}
    var bConsult = mk('consult','상담','consult',null,'카카오톡 상담 연결');
    bSet = mk('settings','설정','settings',null,'설정 — 장치·화질·언어·테마');
    var bLeave = mk('leave','나가기','leave','leave','수업에서 나가기');

    btnMic.onclick = function(){ if(isCL())showHint('마이크'); closeSettings(); call('vcToggleMic'); setTimeout(sync, 60); };
    btnCam.onclick = function(){ if(isCL())showHint('카메라'); closeSettings(); call('vcToggleCam'); setTimeout(sync, 60); };
    bShare.onclick = function(){ if(isCL())showHint('화면공유'); closeSettings(); call('vcFolderOpen','screen'); };
    bFunc.onclick = function(){ closeSettings(); call('vcTogglePheroMenu'); };
    bChat.onclick = function(){ if(isCL())showHint('채팅'); closeSettings(); window.vcDockChatBadge(0); openDelayed(function(){ call('vcToggleChat'); }); };
    // 외부 링크: 지연 없이 즉시(팝업차단 방지) · 채널 «홈» — /chat 은 비로그인 PC 를 로그인 화면으로 튕긴다
    bConsult.onclick = function(){ if(isCL())showHint('상담'); closeSettings();
      if (window.openKakao) return window.openKakao();
      var u='https://pf.kakao.com/_xlqnSxd';
      if(!window.open(u,'_blank','noopener')) location.href=u; };   // 새 창이 막히면 같은 창으로
    bSet.onclick = function(e){ if(e&&e.stopPropagation) e.stopPropagation(); if(isCL())showHint('설정'); openDelayed(toggleSettings); };
    bLeave.onclick = function(){ if(isCL())showHint('나가기'); closeSettings(); call('vcLeaveRoom'); };

    [btnMic, btnCam, bShare, bFunc, bChat, bConsult, bSet, bLeave].forEach(function(b){ dock.appendChild(b); });
    document.body.appendChild(dock);

    // 🥭 (2026-06-28) 문고리(핸들) — 휴대폰 가로에서 도크를 아래로 접었다/폈다 (카메라 얼굴 가림 해소)
    var handle = document.createElement('button');
    handle.id = 'vc-dock-handle'; handle.type = 'button';
    handle.setAttribute('aria-label', '수업 메뉴 접기/펴기');
    handle.innerHTML = '<span class="vdh-grip"></span><span class="vdh-txt"></span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    handle.onclick = function(e){ if(e&&e.stopPropagation) e.stopPropagation(); closeSettings(); setCollapsed(!document.body.classList.contains('vc-dock-collapsed')); };
    document.body.appendChild(handle);
    restoreCollapsed();   // PC: 지난번에 접어뒀으면 접힌 채로 시작

    /* ★ (2026-08-08 Ness ①) 크기·위치 바꾸기 버튼 — 기본 → 작게 → 위로 */
    var sizeBtn = document.createElement('button');
    sizeBtn.id = 'vc-dock-size'; sizeBtn.type = 'button';
    sizeBtn.onclick = function(e){ if(e&&e.stopPropagation) e.stopPropagation(); closeSettings(); cycleDockSize(); };
    document.body.appendChild(sizeBtn);
    applyDockSize(getDockSize());   // 지난번 선택 복원

    // ★ (2026-07-14 사장님) 모바일 ⋯(가로 점3개) 토글 — 독 기본 숨김, 누르면 열림/다시 누르면 닫힘
    var more = document.createElement('button');
    more.id = 'vc-dock-more'; more.type = 'button';
    more.setAttribute('aria-label', '수업 버튼 열기/닫기');
    more.textContent = '•••';
    /* 모바일에서 ⋯ 로 열 때는 접힘을 반드시 풀어준다 — 접힌 채로 열리면 화면 밖에 머문다 */
    more.onclick = function(e){ if(e&&e.stopPropagation) e.stopPropagation(); closeSettings(); document.body.classList.remove('vc-dock-collapsed'); document.body.classList.toggle('vc-dock-open'); };
    document.body.appendChild(more);
  }

  /* 🔔 (2026-07-24) 채팅 안읽음 배지 제어 — index.html 의 vcReceiveChat / vcOpenChat 이 호출.
     독이 아직 만들어지기 전에 불릴 수 있으므로 값을 보관했다가 build() 이후 sync 에서 반영한다. */
  var _chatUnread = 0, _chatPulse = false;
  window.vcDockChatBadge = function(n, pulse){
    _chatUnread = Math.max(0, parseInt(n, 10) || 0);
    _chatPulse = !!pulse && _chatUnread > 0;
    syncChatBadge();
  };
  function syncChatBadge(){
    var el = document.getElementById('vc-dock-chat-badge');
    if (!el) return;
    el.textContent = _chatUnread > 99 ? '99+' : String(_chatUnread);
    el.classList.toggle('on', _chatUnread > 0);
    el.classList.toggle('pulse', _chatPulse);
  }

  function sync(){
    if (!btnMic) return;
    var micOn = (window.vcMicOn !== false);
    var camOn = (window.vcCamOn !== false);
    btnMic.classList.toggle('off', !micOn);
    btnCam.classList.toggle('off', !camOn);
    /* ⚠️ (2026-07-24) 예전엔 여기서 매번 svg.outerHTML 을 갈아끼웠다. sync() 는 1.5초마다 도는데
       outerHTML 대입은 SVG 노드를 파괴하고 다시 만드는 동작이라, 상태가 그대로여도 아이콘이
       계속 리페인트되며 깜빡였다(drop-shadow 필터까지 걸려 있어 더 눈에 띔).
       → 상태가 '실제로 바뀐 순간에만' 교체한다. */
    if (btnMic.__iconOn !== micOn) { btnMic.__iconOn = micOn; btnMic.querySelector('svg').outerHTML = svg(micOn ? P.mic : P.micoff); }
    if (btnCam.__iconOn !== camOn) { btnCam.__iconOn = camOn; btnCam.querySelector('svg').outerHTML = svg(camOn ? P.cam : P.camoff); }
    syncChatBadge();
    /* 🏷 손잡이·크기 버튼 글자는 언어(KO/EN)를 따라간다. 둘 다 «값이 실제로 바뀔 때만» 쓰므로
       1.5초 틱에서 불러도 리페인트가 생기지 않는다(2026-07-24 아이콘 깜빡임과 같은 이유로 주의). */
    syncHandleLabel();
    syncSizeLabel();
    syncTopOffset();   // 📏 상단 바 높이가 바뀌면(가로/세로·접힘) 「위로」 자리도 따라간다
  }

  var wasInCall = false;
  function tick(){
    var inCall = !!(document.body && document.body.classList.contains('vc-in-call'));
    if (inCall) { build(); if (!wasInCall) restoreCollapsed(); document.body.classList.add('vc-dock-on'); sync(); }
    else if (document.body) { document.body.classList.remove('vc-dock-on'); document.body.classList.remove('vc-dock-collapsed'); document.body.classList.remove('vc-dock-open'); closeSettings(); }
    wasInCall = inCall;
  }
  if (document.readyState !== 'loading') { tick(); } else { document.addEventListener('DOMContentLoaded', tick); }
  setInterval(tick, 1500);
  // 회전/리사이즈 시 설정 팝업이 열려 있으면 화면 안으로 재배치
  window.addEventListener('resize', function(){ if (setPop && setPop.classList.contains('open')) positionSettings(); syncTopOffset(); });
})();
/* settings panel: 장치·영상/녹화·표시 (v2) */
