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
    '#vc-dock{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:none;z-index:99990;',
    '  align-items:center;gap:6px;padding:8px 10px;border-radius:18px;',
    '  background:rgba(64,68,76,0.50);',
    '  -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
    '  border:1px solid rgba(255,255,255,.12);box-shadow:0 16px 44px rgba(0,0,0,.5);max-width:96vw;flex-wrap:nowrap;}',
    'body.vc-in-call #vc-dock{display:inline-flex;}',
    '#vc-dock button{background:rgba(255,255,255,.08);border:none;color:#dbe3ee;border-radius:13px;',
    '  width:58px;height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
    '  cursor:pointer;font-family:inherit;font-size:9.5px;font-weight:600;transition:background .12s,transform .1s;flex:0 0 auto;}',
    '#vc-dock button .lbl{color:#aebacc;font-size:9px;line-height:1;}',
    '#vc-dock button:hover{background:rgba(255,255,255,.15);}',
    '#vc-dock button:active{transform:scale(.95);}',
    '#vc-dock button.active{background:#3b82f6;color:#fff;}#vc-dock button.active .lbl{color:#dbe7ff;}',
    '#vc-dock button.off{background:#ef4444;color:#fff;}#vc-dock button.off .lbl{color:#ffe0e0;}',
    '#vc-dock button.leave{background:rgba(239,68,68,.18);color:#ff9a9a;}#vc-dock button.leave .lbl{color:#ffb4b4;}',
    '#vc-dock button.leave:hover{background:#ef4444;color:#fff;}',
    '/* 설정 배경막 — 열려 있을 때 바깥 클릭을 가로채 닫기만 함(다른 버튼 오클릭 방지) */',
    '#vc-dock-backdrop{position:fixed;inset:0;z-index:99991;display:none;background:transparent;}',
    '#vc-dock-backdrop.open{display:block;}',
    '/* 설정 팝업 — 독 위로 떠서 열림 */',
    '#vc-dock-settings{position:fixed;z-index:99992;display:none;flex-direction:column;gap:2px;',
    '  min-width:200px;padding:8px;border-radius:14px;background:rgba(20,26,34,0.98);',
    '  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);',
    '  border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 40px rgba(0,0,0,.6);}',
    '#vc-dock-settings.open{display:flex;}',
    '#vc-dock-settings .sg-title{color:#8b97a8;font-size:10px;font-weight:700;padding:4px 8px 2px;}',
    '#vc-dock-settings button{display:flex;align-items:center;justify-content:space-between;width:100%;gap:10px;',
    '  background:rgba(255,255,255,.05);border:none;color:#e6ecf5;border-radius:9px;',
    '  padding:11px 12px;font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left;}',
    '#vc-dock-settings button:hover{background:rgba(251,191,36,.16);}',
    '#vc-dock-settings button .val{color:#fbbf24;font-size:11.5px;font-weight:700;}',
    '/* 기존 중복 컨트롤 숨김 */',
    'body.vc-in-call.vc-dock-on .toolbar-center{display:none !important;}',
    'body.vc-in-call.vc-dock-on #vc-exit-btn-v34{display:none !important;}',
    '@media (max-width:560px){#vc-dock{gap:4px;padding:6px 8px;bottom:12px;}#vc-dock button{width:48px;height:48px;font-size:9px;}}',
    '@media (max-width:920px) and (orientation:landscape){#vc-dock{display:none !important;}body.vc-in-call.vc-dock-on .toolbar-center{display:flex !important;}}'
  ].join('\n');

  var dock, btnMic, btnCam, bSet, setPop, backdrop;

  function fullscreenOn(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFullscreen(){
    try {
      if (!fullscreenOn()) { var el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen).call(el); }
      else { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    } catch(e){ console.warn('[vc-dock] fullscreen', e); }
  }
  function themeLabel(){ try { return (window.MangoTheme && MangoTheme.get()==='light') ? '라이트' : '다크'; } catch(e){ return '—'; } }
  function langLabel(){ try { return (typeof window.getLang==='function' && window.getLang()==='en') ? 'EN' : '한국어'; } catch(e){ return '—'; } }

  function buildSettings(){
    if (setPop) return setPop;
    backdrop = document.createElement('div'); backdrop.id = 'vc-dock-backdrop';
    backdrop.addEventListener('click', closeSettings);
    document.body.appendChild(backdrop);

    setPop = document.createElement('div'); setPop.id = 'vc-dock-settings';
    setPop.innerHTML =
      '<div class="sg-title">설정</div>' +
      '<button data-act="theme">테마 <span class="val" id="sg-theme"></span></button>' +
      '<button data-act="lang">언어 <span class="val" id="sg-lang"></span></button>' +
      '<button data-act="full">전체화면 <span class="val" id="sg-full"></span></button>';
    setPop.addEventListener('click', function(e){ e.stopPropagation(); });
    setPop.querySelector('[data-act="theme"]').onclick = function(){ try{ window.MangoTheme && MangoTheme.toggle(); }catch(_){} refreshSettings(); };
    setPop.querySelector('[data-act="lang"]').onclick  = function(){ call('toggleLang'); setTimeout(refreshSettings, 40); };
    setPop.querySelector('[data-act="full"]').onclick  = function(){ toggleFullscreen(); setTimeout(refreshSettings, 80); };
    document.body.appendChild(setPop);
    return setPop;
  }
  function refreshSettings(){
    if (!setPop) return;
    var t = setPop.querySelector('#sg-theme'); if (t) t.textContent = themeLabel();
    var l = setPop.querySelector('#sg-lang');  if (l) l.textContent = langLabel();
    var f = setPop.querySelector('#sg-full');  if (f) f.textContent = fullscreenOn() ? '켜짐' : '꺼짐';
  }
  function openSettings(){
    buildSettings();
    if (bSet) {
      var r = bSet.getBoundingClientRect();
      setPop.style.right = Math.max(8, (window.innerWidth - r.right)) + 'px';
      setPop.style.bottom = (window.innerHeight - r.top + 12) + 'px';
      setPop.style.left = 'auto'; setPop.style.top = 'auto';
    }
    refreshSettings();
    backdrop.classList.add('open');
    setPop.classList.add('open');
    if (bSet) bSet.classList.add('active');
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

    btnMic.onclick = function(){ closeSettings(); call('vcToggleMic'); setTimeout(sync, 60); };
    btnCam.onclick = function(){ closeSettings(); call('vcToggleCam'); setTimeout(sync, 60); };
    bShare.onclick = function(){ closeSettings(); call('vcFolderOpen','screen'); };
    bChat.onclick = function(){ closeSettings(); call('vcToggleChat'); };
    bConsult.onclick = function(){ closeSettings(); window.open('https://pf.kakao.com/_mangoi/chat','_blank','noopener'); };
    bSet.onclick = function(e){ if(e&&e.stopPropagation) e.stopPropagation(); toggleSettings(); };
    bLeave.onclick = function(){ closeSettings(); call('vcLeaveRoom'); };

    [btnMic, btnCam, bShare, bChat, bConsult, bSet, bLeave].forEach(function(b){ dock.appendChild(b); });
    document.body.appendChild(dock);
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
    else if (document.body) { document.body.classList.remove('vc-dock-on'); closeSettings(); }
  }
  if (document.readyState !== 'loading') { tick(); } else { document.addEventListener('DOMContentLoaded', tick); }
  setInterval(tick, 1500);
})();
