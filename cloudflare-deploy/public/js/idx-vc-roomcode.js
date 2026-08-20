/* idx-vc-roomcode.js — 수업 «방 번호» 를 잃어버리지 않게 + 세로 기능메뉴 보강 (2026-08-20)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 왜 여기(별도 defer 파일)에 있나 — **첫 화면 무게 예산 때문이다.**
 *    index.html 의 blocking 합계는 실측 1549.3KB 이고 예산 상한이 1549KB 라 «여유가 0» 이다
 *    (first_paint_budget_harness). idx-main.js·idx-vc-screenmode.js 는 blocking 이라
 *    거기에 코드를 넣으면 그 즉시 예산을 넘긴다. 그 예산은 필리핀 회선을 지키려고 둔 것이므로
 *    기준선을 올리는 대신 **첫 페인트에 필요 없는 것을 defer 로 뺀다.**
 *    ⛔ 여기 있는 코드를 idx-main.js 로 «정리» 하지 마세요 — 하니스가 바로 FAIL 냅니다.
 *
 * 무엇을 하나 (사장님 제보 ② 「필리핀 매니저와 잘 만나지지 않는다」 · ③ 기능메뉴)
 *   ① 사람이 «직접 친» 방 번호를 12시간 기억했다가 로비에 다시 채워 준다.
 *      ⛔ 자동생성 코드(room-…)·날짜가 박힌 예약방(class-…)은 되살리지 않는다 —
 *         그 둘을 되살리는 것이 2026-06-01 에 «자동복원» 을 통째로 없앤 이유다.
 *      ⚠️ 채우면 반드시 «보여 준다»(접힌 칸을 펴고 지우기 버튼을 붙인다). 몰래 채우면 그게 그 사고다.
 *   ② 「이 방 링크 복사」 — 번호를 불러 주는 대신 링크를 보낸다. 오타도, 도메인이 갈려
 *      «같은 번호인데 다른 방» 이 되는 사고(워커가 두 벌이다)도 함께 사라진다.
 *   ③ 공용 연습방(mangoi-class)에 떨어지면 «지금 공용방입니다» 를 화면에 띄운다.
 *      지금까지 아무 표시가 없어서 「연결이 안 되네」 로 보였다.
 *   ④ 세로 ☰기능 메뉴에 «화면공유»·«방 링크 복사» 를 넣는다.
 *      화면공유는 세로 하단 독에서 «기능» 에 자리를 내줬다(vc-dock.js) — 없앤 게 아니라 옮긴 것.
 */
(function () {
  'use strict';

  /* 안내 링크의 정본. ⚠️ location.origin 을 쓰지 않는다 — 다른 도메인에서 만든 링크를
     그대로 퍼뜨리면 「같은 방 번호인데 서로 안 보인다」가 재현된다(CLAUDE.md 2장). */
  var SITE_ORIGIN = 'https://mangoi.ai';
  var SHARED_ROOM = 'mangoi-class';
  var KEEP_MS = 12 * 60 * 60 * 1000;   // 방 번호를 기억하는 시간

  function isEn() {
    try { return (typeof window.getLang === 'function' && window.getLang() === 'en'); } catch (e) { return false; }
  }
  function el(id) { return document.getElementById(id); }
  // 되살리면 안 되는 코드: 자동생성(room-…) · 날짜가 박힌 예약방(class-{id}-{YYYYMMDD})
  function restorable(code) {
    return typeof code === 'string' && !!code &&
           !/^room-/i.test(code) && !/^class-\d+-\d{8}$/.test(code);
  }

  // ── ① 방 번호 기억 ───────────────────────────────────────────────────────
  function saveTypedRoom() {
    try {
      var i = el('vc-roomcode-input');
      var c = i && i.value ? i.value.trim() : '';
      if (c && restorable(c)) {
        localStorage.setItem('mangoi_vc_lastroom', JSON.stringify({ code: c, ts: Date.now() }));
      }
    } catch (e) {}
  }

  function fillRoomCode() {
    var input = el('vc-roomcode-input');
    if (!input || input.value.trim()) return;      // 이미 뭔가 들어 있으면 건드리지 않는다
    var lr = null;
    try { lr = JSON.parse(localStorage.getItem('mangoi_vc_lastroom') || 'null'); } catch (e) { return; }
    if (!lr || !lr.ts) return;
    if (Date.now() - lr.ts >= KEEP_MS) { try { localStorage.removeItem('mangoi_vc_lastroom'); } catch (e) {} return; }
    if (!restorable(lr.code)) return;
    input.value = lr.code;
    showRoomCodeHint(lr.code);
  }

  function showRoomCodeHint(code) {
    var input = el('vc-roomcode-input');
    if (!input || !code) return;
    // 접혀 있는 «⚙️ 방 코드 직접 입력» 칸을 편다 — 안 펴면 채워진 줄도 모른다.
    try { var det = input.closest ? input.closest('details') : null; if (det) det.open = true; } catch (e) {}

    var hint = el('vc-roomcode-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'vc-roomcode-hint';
      hint.style.cssText =
        'font-size:12px;line-height:1.5;color:#fcd34d;background:rgba(251,191,36,0.10);' +
        'border:1px solid rgba(251,191,36,0.38);border-radius:9px;padding:7px 10px;' +
        'margin:6px 0 2px;text-align:left;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      var host = input.parentNode && input.parentNode.parentNode;
      if (!host) return;
      host.appendChild(hint);
    }
    var en = isEn();
    hint.innerHTML =
      '<span style="flex:1 1 auto;min-width:0">' +
        (en ? 'Last room code filled in. Clear it if this is not the room you want.'
            : '지난번 방 번호를 채워 두었어요. 다른 방이면 지우고 입장하세요.') +
      '</span>' +
      '<button type="button" id="vc-roomcode-hint-clear" ' +
        'style="flex:0 0 auto;border:1px solid rgba(255,255,255,.3);background:transparent;color:#e2e8f0;' +
        'border-radius:7px;padding:4px 9px;font-size:11.5px;font-weight:700;cursor:pointer">' +
        (en ? 'Clear' : '지우기') + '</button>';
    var clr = el('vc-roomcode-hint-clear');
    if (clr) clr.onclick = function () {
      input.value = '';
      try { localStorage.removeItem('mangoi_vc_lastroom'); } catch (e) {}
      try { hint.remove(); } catch (e) {}
      try { input.focus(); } catch (e) {}
    };
  }
  window.vcShowRoomCodeHint = showRoomCodeHint;

  // ── ② 이 방 링크 복사 ────────────────────────────────────────────────────
  function currentRoomCode() {
    var typed = el('vc-roomcode-input');
    if (typed && typed.value.trim()) return typed.value.trim();
    var nm = el('vc-room-name');
    return (nm && nm.textContent) ? nm.textContent.trim() : '';
  }

  function toast(msg) {
    var t = el('vc-roomlink-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'vc-roomlink-toast';
      t.style.cssText =
        'position:fixed;left:50%;transform:translateX(-50%);' +
        'bottom:calc(env(safe-area-inset-bottom,0px) + 96px);z-index:100003;' +
        'background:rgba(15,23,42,.95);color:#fde68a;border:1px solid rgba(251,191,36,.5);' +
        'border-radius:999px;padding:9px 16px;font-size:13px;font-weight:700;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.45);max-width:92vw;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t.__hideT);
    t.__hideT = setTimeout(function () { t.style.display = 'none'; }, 3200);
  }

  window.vcRoomLink = function (code) {
    var c = (code || currentRoomCode() || '').trim();
    return c ? (SITE_ORIGIN + '/?vc_room=' + encodeURIComponent(c) + '&vc_autojoin=1') : '';
  };

  window.vcCopyRoomLink = function (code) {
    var en = isEn();
    var link = window.vcRoomLink(code);
    if (!link) {
      alert(en ? 'Enter a room code first, then copy the link.'
               : '먼저 방 번호를 정해서 입력한 뒤 링크를 복사하세요.');
      return;
    }
    function done() {
      toast(en ? 'Link copied — send it to the other person' : '링크를 복사했어요 — 상대에게 보내 주세요');
    }
    /* 클립보드 API 가 막힌 환경(구형 웹뷰·비보안 컨텍스트)에서도 반드시 길이 있어야 한다. */
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = link; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
        document.body.appendChild(ta);
        ta.select(); ta.setSelectionRange(0, link.length);
        var ok = document.execCommand && document.execCommand('copy');
        ta.remove();
        if (ok) { done(); return; }
      } catch (e) {}
      prompt(en ? 'Copy this link:' : '이 링크를 복사해 주세요:', link);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, fallback);
        return;
      }
    } catch (e) {}
    fallback();
  };

  // ── ③ 공용 연습방 안내 ───────────────────────────────────────────────────
  var sharedShown = false;
  function sharedBanner() {
    if (sharedShown) return;
    sharedShown = true;
    var en = isEn();
    var b = document.createElement('div');
    b.id = 'vc-shared-room-banner';
    b.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);' +
      'top:calc(env(safe-area-inset-top,0px) + 46px);z-index:100002;' +
      'max-width:min(430px, calc(100% - 16px));box-sizing:border-box;' +
      'background:rgba(120,53,15,.95);color:#fde68a;border:1px solid rgba(251,191,36,.55);' +
      'border-radius:12px;padding:9px 12px;font-size:12.5px;line-height:1.5;font-weight:700;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.45);display:flex;gap:8px;align-items:flex-start';
    b.innerHTML =
      '<span style="flex:1 1 auto;min-width:0">' +
        (en ? 'You are in the <b>shared practice room</b>. To meet one specific person, both of you must enter the <b>same room code</b>.'
            : '지금 <b>공용 연습방</b>입니다. 특정한 분과 만나려면 두 사람이 <b>같은 방 번호</b>를 넣어야 해요.') +
      '</span>' +
      '<button type="button" aria-label="닫기" style="flex:0 0 auto;background:transparent;border:0;' +
        'color:#fde68a;font-size:16px;line-height:1;cursor:pointer;padding:0 2px">&times;</button>';
    try { b.querySelector('button').onclick = function () { try { b.remove(); } catch (e) {} }; } catch (e) {}
    document.body.appendChild(b);
    // 오래 두면 화면을 가린다 — 읽을 만큼만 두고 스스로 사라진다.
    setTimeout(function () { try { b.remove(); } catch (e) {} }, 15000);
  }

  // ── ④ 세로 ☰기능 메뉴 항목 (화면공유 · 방 링크 복사) ──────────────────────
  /*  ⚠️ .vc-phero-menu-item 은 «세로 + 메뉴 열림» 일 때만 보이는 CSS 라
      가로·PC 에는 저절로 안 나온다(거기 독에는 화면공유가 그대로 있다). */
  function menuItem(id, icon, ko, en, tip, onClick) {
    if (el(id)) return;
    var tb = document.querySelector('#vc-main-row .content-pane .tab-bar');
    if (!tb) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = 'vc-phero-menu-item';
    b.setAttribute('title', tip);
    b.innerHTML = icon + ' <span data-ko="' + ko + '" data-en="' + en + '">' + (isEn() ? en : ko) + '</span>';
    b.addEventListener('click', function () {
      try { if (typeof window.closePheroMenu === 'function') window.closePheroMenu(); } catch (e) {}
      try { onClick(); } catch (e) {}
    });
    tb.appendChild(b);
  }
  function ensureMenuItems() {
    menuItem('vc-phero-share-btn', '🖥', '화면공유', 'Screen share',
      '화면공유 — 내 화면·파일을 상대에게 보여주기',
      function () { if (typeof window.vcFolderOpen === 'function') window.vcFolderOpen('screen'); });
    menuItem('vc-phero-roomlink-btn', '🔗', '방 링크 복사', 'Copy room link',
      '이 방으로 바로 들어오는 링크를 복사 — 카톡으로 보내면 상대는 누르기만 하면 됩니다',
      function () { window.vcCopyRoomLink(); });
  }

  function watchInCall() {
    try {
      if (!document.body || !document.body.classList.contains('vc-in-call')) return;
      ensureMenuItems();
      var nm = el('vc-room-name');
      var room = (nm && nm.textContent) ? nm.textContent.trim() : '';
      if (room === SHARED_ROOM) sharedBanner();
    } catch (e) {}
  }

  // ── 시작 ─────────────────────────────────────────────────────────────────
  var stopT = null;
  function startWatch() {
    if (stopT) return;
    var n = 0;
    stopT = setInterval(function () { n++; watchInCall(); if (n > 30) { clearInterval(stopT); stopT = null; } }, 1000);
  }

  function boot() {
    /* 로비를 열 때마다 idx-main.js 의 vcRestoreCredentials 가 방번호 칸을 «비운다»(+50ms).
       그 뒤에 채워야 하므로 showView 를 감싸 +150ms 에 채운다.
       ⛔ vcRestoreCredentials 쪽을 고치지 않는다 — 그 파일은 blocking 이라 예산에 걸린다. */
    try {
      var origShow = window.showView;
      if (typeof origShow === 'function' && !origShow.__roomcodeWrapped) {
        window.showView = function (id) {
          var r = origShow.apply(this, arguments);
          if (id === 'view-videocall-lobby') setTimeout(fillRoomCode, 150);
          if (id === 'view-videocall-call') startWatch();
          return r;
        };
        window.showView.__roomcodeWrapped = true;
      }
    } catch (e) {}

    /* 입장하는 순간 «사람이 친» 방 번호를 기억한다. */
    try {
      var origJoin = window.vcJoinRoom;
      if (typeof origJoin === 'function' && !origJoin.__roomcodeWrapped) {
        window.vcJoinRoom = function () { saveTypedRoom(); return origJoin.apply(this, arguments); };
        window.vcJoinRoom.__roomcodeWrapped = true;
      }
    } catch (e) {}

    fillRoomCode();                       // 이미 로비가 떠 있는 경우

    /* 수업 화면은 «들어간 뒤» 에 방 이름·탭바가 정해진다 → 그때만 잠깐 지켜본다.
       ⛔ 상주 setInterval 도, body class MutationObserver 도 두지 않는다 —
          이 저장소에는 body class 를 자주 다시 쓰는 코드가 있어서, 그걸 지켜보면
          콜백이 쉴 새 없이 돌아 메인스레드가 느려진다(2026-07-14 라이브 장애와 같은 뿌리.
          실제로 이 파일에서 한 번 밟아 헤드리스 브라우저가 응답하지 않았다).
          대신 «수업 화면으로 전환하는 그 순간»(showView) 에만 30초 확인을 시작한다. */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
