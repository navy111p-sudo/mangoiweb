// idx-vc-room.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  'use strict';

  var MODAL_ID = 'vc-meet-modal';
  var BTN_ID   = 'vc-meet-btn';
  var PREFIX   = 'meet-';

  /* 한/영 — 강사 다수가 필리핀이다. 라벨뿐 아니라 안내문까지 두 벌로 적는다. */
  function isKo(){
    try {
      if (typeof window.getLang === 'function') return window.getLang() !== 'en';
      return (localStorage.getItem('mangoi_lang') || 'ko') !== 'en';
    } catch(e){ return true; }
  }

  /* 지금 있는 방 id — 관찰자 모드는 '(관찰 중)' 같은 꼬리표가 붙는다 */
  function currentRoom(){
    try {
      var r = ((typeof vcRoomId !== 'undefined' && vcRoomId) || '') + '';
      if (r) return r;
    } catch(e){}
    try {
      var el = document.getElementById('vc-room-name');
      return (el && el.textContent || '')
        .replace(/^🔍\s*/, '')
        .replace(/\s*\(관찰 중\)\s*$/, '')
        .replace(/\s*수업 관찰 중\s*$/, '')
        .trim();
    } catch(e){ return ''; }
  }

  /* ★ 회의방 판정 — 바깥(수업 기록 쪽)에서 부르는 유일한 창구.
       상태를 저장하지 않고 매번 실제 방 id 를 본다. 플래그로 두면 회의 → 홈 →
       정규 수업으로 이어질 때 껍데기가 남아 진짜 수업의 적립을 막아 버린다. */
  window.__vcIsMeetingRoom = function(){
    try { return /^meet-/i.test(currentRoom()); } catch(e){ return false; }
  };

  /* 방 번호 다듬기 — 사람이 부르는 번호(공백·대문자)를 방 id 로 */
  function normalize(code){
    return (code || '').trim().toLowerCase()
      .replace(/^meet-/, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9가-힣-]/g, '');
  }
  function meetUrl(code){
    return location.origin + '/?meet=' + encodeURIComponent(normalize(code));
  }

  /* 회의방 입장 — 이미 검증된 mangoiJoinClass(30319줄)를 그대로 재사용한다.
     그 함수만이 로비 자동입장을 먼저 막고(__vcLobbyAutoJoined) 방 코드를 채운다. */
  function enter(code){
    var c = normalize(code);
    if (!c) return;
    var room = PREFIX + c;
    if (room === currentRoom()) { closeModal(); return; }
    if (document.body.classList.contains('vc-in-call')) {
      /* 수업/회의 중이면 페이지를 다시 열어 깨끗하게 옮긴다 */
      location.href = '/?meet=' + encodeURIComponent(c);
      return;
    }
    if (typeof window.mangoiJoinClass === 'function') {
      closeModal();
      window.mangoiJoinClass(room);
      armAutoEnter(room);
    } else {
      location.href = '/?meet=' + encodeURIComponent(c);
    }
  }

  function closeModal(){
    try {
      var m = document.getElementById(MODAL_ID);
      if (m && m.parentNode) m.parentNode.removeChild(m);
    } catch(e){}
  }

  function openModal(){
    if (document.getElementById(MODAL_ID)) return;
    var ko  = isKo();
    var cur = currentRoom();
    var inMeet = /^meet-/i.test(cur);

    var ov = document.createElement('div');
    ov.id = MODAL_ID;
    /* #mango-promo-video(z 100050)·#vc-basket-float 위로 올려야 가려지지 않는다 */
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,.72);' +
                       'display:flex;align-items:center;justify-content:center;padding:16px;' +
                       '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)';

    var box = document.createElement('div');
    box.style.cssText = 'width:100%;max-width:390px;background:#131826;border:1px solid #2b3450;' +
                        'border-radius:16px;padding:20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.55);' +
                        'font-family:inherit;color:#e2e8f0;text-align:left';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:800;margin:0 0 4px;color:#fbbf24';
    title.textContent = ko ? '🚪 회의방 — 방 번호로 만나기' : '🚪 Meeting room — meet by number';

    var sub = document.createElement('div');
    sub.style.cssText = 'font-size:12px;color:#94a3b8;line-height:1.6;margin:0 0 12px';
    sub.textContent = ko
      ? '예약된 수업이 아니라 갑자기 잡힌 회의·비상수업용입니다. 양쪽이 같은 번호를 넣어야 만납니다.'
      : 'For ad-hoc meetings and emergency classes, not scheduled lessons. Both sides must use the same number.';

    var now = document.createElement('div');
    now.style.cssText = 'font-size:12px;color:#cbd5e1;background:#0d1220;border:1px solid #232b40;' +
                        'border-radius:9px;padding:8px 10px;margin:0 0 10px;word-break:break-all';
    now.textContent = (ko ? '지금 방: ' : 'Current room: ') + (cur || (ko ? '(없음)' : '(none)'));

    var input = document.createElement('input');
    input.type = 'text';
    input.value = inMeet ? cur.replace(/^meet-/i, '') : '';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.placeholder = ko ? '방 번호 (예: 1234, melca)' : 'Room number (e.g. 1234, melca)';
    input.style.cssText = 'width:100%;box-sizing:border-box;padding:12px 13px;border-radius:11px;' +
                          'border:1px solid #38406080;background:#0d1220;color:#f1f5f9;font-size:15px;' +
                          'outline:none;margin:0 0 10px';
    input.addEventListener('focus', function(){ input.style.borderColor = '#fbbf24'; });
    input.addEventListener('blur',  function(){ input.style.borderColor = '#38406080'; });
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); enter(input.value); }
      if (e.key === 'Escape'){ e.preventDefault(); closeModal(); }
    });

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = ko ? '취소' : 'Cancel';
    cancel.style.cssText = 'flex:0 0 32%;padding:12px 0;border-radius:11px;border:1px solid #38406080;' +
                           'background:transparent;color:#94a3b8;font-size:14px;font-weight:700;cursor:pointer';
    cancel.addEventListener('click', closeModal);

    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = ko ? '이 방에서 만나기' : 'Meet in this room';
    go.style.cssText = 'flex:1 1 auto;padding:12px 0;border-radius:11px;border:0;' +
                       'background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;' +
                       'font-size:14px;font-weight:800;cursor:pointer';
    go.addEventListener('click', function(){ enter(input.value); });

    /* 상대에게는 번호를 부르는 것보다 링크를 보내는 편이 확실하다(오타·대소문자 사고 없음) */
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = ko ? '🔗 초대 링크 복사' : '🔗 Copy invite link';
    copy.style.cssText = 'width:100%;margin-top:10px;padding:9px 0;border-radius:9px;' +
                         'border:1px dashed #38406080;background:transparent;color:#94a3b8;' +
                         'font-size:12px;cursor:pointer';
    copy.addEventListener('click', function(){
      var c = normalize(input.value);
      if (!c){ input.focus(); return; }
      var url = meetUrl(c);
      var done = function(){
        copy.textContent = ko ? '✅ 복사했습니다 — 상대에게 붙여넣어 주세요'
                              : '✅ Copied — paste it to the other person';
        copy.style.color = '#34d399';
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(url).then(done, function(){ fallback(url, done); });
        } else fallback(url, done);
      } catch(e){ fallback(url, done); }
    });
    function fallback(url, done){
      try {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch(e){
        try { window.prompt(isKo() ? '이 주소를 복사해 상대에게 보내세요' : 'Copy this link and send it', url); } catch(_){}
      }
    }

    row.appendChild(cancel);
    row.appendChild(go);
    box.appendChild(title);
    box.appendChild(sub);
    box.appendChild(now);
    box.appendChild(input);
    box.appendChild(row);
    box.appendChild(copy);
    ov.appendChild(box);

    ov.addEventListener('click', function(e){ if (e.target === ov && (window.mgBackdropClosable ? window.mgBackdropClosable(ov) : true)) closeModal(); });   /* QA#4 */
    box.addEventListener('click', function(e){ e.stopPropagation(); });

    document.body.appendChild(ov);
    try { input.focus(); input.select(); } catch(e){}
  }
  window.vcOpenMeetRoom = openModal;

  /* ── 수업 화면 상단에 진입구 심기 ──
     평소 수업에는 방해가 되지 않게 작은 알약 버튼 하나. 방 번호 글자도 누를 수 있다. */
  function mount(){
    try {
      var info = document.getElementById('vc-room-info');
      var left = info && info.parentNode;
      if (!left) return;

      var nameEl = document.getElementById('vc-room-name');
      if (nameEl && !nameEl.__meetBound){
        nameEl.__meetBound = true;
        nameEl.style.cursor = 'pointer';
        nameEl.style.textDecoration = 'underline dotted';
        nameEl.style.textUnderlineOffset = '3px';
        nameEl.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openModal(); });
      }

      if (document.getElementById(BTN_ID)) return;
      var b = document.createElement('button');
      b.id = BTN_ID;
      b.type = 'button';
      b.textContent = '🚪 ' + (isKo() ? '회의방' : 'Meeting');
      b.title = isKo() ? '방 번호로 즉석 회의방 만들기·참가 (예약 수업과 별개)'
                       : 'Create or join an ad-hoc meeting room by number (separate from scheduled classes)';
      b.style.cssText = 'margin-left:8px;padding:3px 9px;border-radius:999px;cursor:pointer;' +
                        'background:rgba(251,191,36,0.14);border:1px solid rgba(251,191,36,0.42);' +
                        'color:#fbbf24;font-size:11.5px;font-weight:700;line-height:1.7;white-space:nowrap;' +
                        'flex:0 0 auto';
      b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openModal(); });
      left.appendChild(b);
    } catch(e){ console.warn('[meet] mount', e); }
  }

  try {
    window.addEventListener('mangoi:langchange', function(){
      try {
        var b = document.getElementById(BTN_ID);
        if (b) b.textContent = '🚪 ' + (isKo() ? '회의방' : 'Meeting');
      } catch(e){}
    });
  } catch(e){}

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  /* ── 클릭 0회 입장 ──
     mangoiJoinClass 는 mangoi_vc_uid/pw 가 저장돼 있어야 스스로 입장한다(30340줄).
     저장 안 한 사람은 로비에 코드만 채워진 채 멈춘다 → 홈 로그인 정보로 대신 채워 넣는다.
     (10574~10577줄의 기존 자동입장과 같은 방식. 다른 점은 방 코드를 지우지 않는 것뿐) */
  function armAutoEnter(room){
    var tries = 0;
    /* ⚠️ 이중 입장 주의 — 여기서 아이디/비번을 일찍 채우면, 뒤따라 도는 mangoiJoinClass 의
       +350ms 콜백이 '이미 다 채워졌네' 하고 한 번 더 입장한다(소켓 2개 = 유령 참가자).
       그래서 ① 그 콜백이 끝난 뒤(520ms)에 시작하고 ② 아래에서 그가 이미 들어갔는지 본다. */
    setTimeout(function(){
    var timer = setInterval(function(){
      if (++tries > 20) { clearInterval(timer); return; }   // 최대 약 3초
      try {
        if (document.body.classList.contains('vc-in-call')) { clearInterval(timer); return; }
        /* mangoiJoinClass 는 스스로 입장하면 __vcLobbyAutoJoined 를 true 로 남기고,
           못 들어갔을 때만 false 로 되돌린다(30343줄). false 일 때만 우리가 나선다. */
        if (window.__vcLobbyAutoJoined) { clearInterval(timer); return; }
        var lobby = document.getElementById('view-videocall-lobby');
        if (!lobby || !lobby.classList.contains('active')) return;
        var rc = document.getElementById('vc-roomcode-input');
        if (!rc || rc.value !== room) return;               // 코드가 아직 안 채워짐 → 더 기다린다
        var ni = document.getElementById('vc-name-input');
        var pi = document.getElementById('vc-room-input');
        if (ni && !ni.value){
          var raw = localStorage.getItem('mangoi_logged_user');
          if (!raw || raw === 'null' || raw === '{}') { clearInterval(timer); return; }  // 비로그인 → 로비에 그대로 둔다
          var u = null; try { u = JSON.parse(raw); } catch(_){ clearInterval(timer); return; }
          if (!(u && (u.uid || u.id) && u.name)) { clearInterval(timer); return; }
          ni.value = u.name;
        }
        if (pi && !pi.value) pi.value = '0000';
        if (ni && ni.value && typeof window.vcJoinRoom === 'function'){
          clearInterval(timer);
          window.__vcLobbyAutoJoined = true;
          window.vcJoinRoom();
        }
      } catch(e){ clearInterval(timer); console.warn('[meet] autoEnter', e); }
    }, 150);
    }, 520);
  }

  /* ── /?meet=<방번호> 로 들어오면 아무것도 누르지 않고 바로 입장 ── */
  (function fromUrl(){
    var code = '';
    try { code = new URLSearchParams(location.search).get('meet') || ''; } catch(e){ return; }
    code = normalize(code);
    if (!code) return;
    var room = PREFIX + code;
    var start = function(){
      if (typeof window.mangoiJoinClass !== 'function') return setTimeout(start, 120);
      window.mangoiJoinClass(room);
      armAutoEnter(room);
    };
    /* 기존 ?room= 자동입장이 +700ms 라 그보다 늦게 시작해 서로 밟지 않게 한다 */
    setTimeout(start, 760);
  })();
})();

