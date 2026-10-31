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

  // ── ⓪ 회의방 번호 해석 ───────────────────────────────────────────────────
  /* 🚪 (2026-09-09 사장님 제보) 「교사가 회의방 1234 를 여는데 학생은 mangoi-class 에 있다」
     [원인] 방 이름을 만드는 규칙이 «두 곳» 이고 서로 달랐다.
        · 회의방 모달(idx-vc-room.js)  : 1234 → 실제 방 id 는 **meet-1234**
        · 로비 «⚙️ 방 코드 직접 입력» : 1234 → 그대로 **1234** (idx-main.js `vcRoomId = vcTypedRoom`)
       그래서 모달이 「양쪽이 같은 번호를 넣어야 만납니다」라고 약속해 놓고, 학생이 그
       «같은 번호» 를 넣으면 **다른 방**으로 갔다. 코드를 아예 안 넣으면 공용방으로 갔다.
       에러가 안 난다 — 양쪽 다 «참여자 1명» 인 멀쩡한 방이라 고장으로 보이지 않는다.
     [고침] 로비가 모달과 «같은 말» 을 하게 한다. 접두사가 없는 값은 회의방 번호로 본다.
     ⛔ 접두사가 있는 방(class-·demo-·room-·c24-·meet-·mangoi-class)은 한 글자도 건드리지 않는다 —
        예약 수업방·연습방·관리자 임베드가 전부 그쪽이라, 손대면 그 경로가 통째로 갈린다.
     ⚠️ 규칙이 두 파일에 있으므로 `meet_room_code_harness.mjs` 가 둘을 대조한다.
        idx-vc-room.js 는 blocking 이고 첫 화면 예산 여유가 **186바이트**(2026-09-10 실측)뿐이라 여기(defer)에 둔다. */
  var MEET_PREFIX = 'meet-';
  /* 🔴 (2026-09-09 함정 대조) 이 목록에서 `meet-` 을 «뺀다».
     넣어 두면 `MEET-1234`·`Meet-1234` 가 「접두사가 있으니 그대로」로 빠져나가는데,
     모달은 소문자로 내려 `meet-1234` 를 만든다 → **고치려던 「같은 번호인데 다른 방」이
     대문자로 그대로 재현된다**(방 이름은 idFromName 이라 대소문자를 구분한다).
     ⚠️ 하필 이 칸에는 `autocapitalize="off"` 가 없어서 폰 키보드가 첫 글자를 대문자로
        만든다 — 계정 아이디에서 이미 밟은 함정이다(CLAUDE.md 2장). 아래 armCaseGuards() 참고. */
  var MEET_RE = /^meet-/i;
  // 이미 «어느 방인지» 를 스스로 말하는 이름들 — 여기에 걸리면 그대로 둔다
  var KNOWN_ROOM = /^(?:class-|demo-|room-|c24-|mangoi-class$)/i;

  /* 모달(idx-vc-room.js)의 normalize() 와 «같은» 다듬기 */
  function meetSlug(c) {
    return c.toLowerCase()
            .replace(MEET_RE, '')
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9\uac00-\ud7a3-]/g, '');
  }

  function resolveRoomCode(raw) {
    var c = (raw == null ? '' : String(raw)).trim();
    if (!c) return '';                       // 빈칸은 빈칸 그대로 — 공용방 폴백은 예전 그대로다
    if (KNOWN_ROOM.test(c)) return c;        // 회의방이 아닌 방은 한 글자도 안 건드린다
    var n = meetSlug(c);                     // `meet-` 이 붙었든 안 붙었든 같은 자리로 모은다
    return n ? (MEET_PREFIX + n) : '';
  }
  window.vcResolveRoomCode = resolveRoomCode;

  /* 폰 키보드가 방 번호의 첫 글자를 대문자로 만드는 것은 «서버로 못 막습니다».
     index.html 은 공동 금지구역이라 그 칸에 속성을 직접 못 단다 → 밖에서 입혀 준다.
     (js/session-guard.js 가 아이디 칸에 쓰는 것과 같은 방식) */
  function armCaseGuards() {
    try {
      var i = el('vc-roomcode-input');
      if (!i || i.__caseGuarded) return;
      i.__caseGuarded = true;
      i.setAttribute('autocapitalize', 'off');
      i.setAttribute('autocorrect', 'off');
      i.setAttribute('spellcheck', 'false');
    } catch (e) {}
  }

  /* 입장 직전에 «실제로 들어갈 방» 을 칸에 적어 준다.
     ⛔ 몰래 바꾸지 않는다 — 값이 바뀌면 접힌 칸을 펴서 보여 준다(이 파일 ①과 같은 원칙).
        그래야 「이 방 링크 복사」도 그 방의 링크를 만든다. */
  function normalizeRoomInput() {
    try {
      var input = el('vc-roomcode-input');
      if (!input) return;
      var raw = input.value.trim();
      var fixed = resolveRoomCode(raw);
      if (!fixed || fixed === raw) return;
      input.value = fixed;
      try { var det = input.closest ? input.closest('details') : null; if (det) det.open = true; } catch (e) {}
    } catch (e) {}
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

  /* 입장 순간에 사람이 친 방 번호. 비어 있는데 회의방에 들어갔다 = 서버가 정해 준 방. */
  var typedAtJoin = '';

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

  /* ── ⑤ 「오늘은 선생님이 정한 방」 안내 (2026-09-10) ────────────────────────
     [왜] 서버가 예약방 대신 회의방을 돌려주면(src/class-room-override.ts) 학생은
       **아무것도 안 하고** 그 방에 들어간다 — 그게 이 기능의 전부다. 그런데 화면이
       아무 말도 안 하면 「왜 늘 가던 방이 아니지?」가 되고, 더 나쁘게는 「잘못 들어왔나」
       하고 나갔다 다시 들어온다. **바뀐 것을 화면이 말해야 한다.**
     [판정] 사람이 방 번호를 «안 쳤는데» 회의방에 있다 → 서버가 정해 준 것.
       ⛔ 「meet- 이면 무조건」으로 넓히지 말 것 — 스스로 번호를 친 사람에게는
          「선생님이 정했다」가 거짓말이 된다.
     ⚠️ 맞바꿈도 함께 말한다 — 회의방은 예약 수업방이 아니라서 **출석 포인트·복습퀴즈
        안내·강사 AI 코칭이 꺼진다**(__vcIsMeetingRoom). 감추면 「수업은 했는데 포인트가
        0이다」가 되고 아무도 이유를 모른다. */
  var assignedShown = false;
  function assignedBanner() {
    if (assignedShown) return;
    assignedShown = true;
    var en = isEn();
    var b = document.createElement('div');
    b.id = 'vc-assigned-room-banner';
    b.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);' +
      'top:calc(env(safe-area-inset-top,0px) + 46px);z-index:100002;' +
      'max-width:min(430px, calc(100% - 16px));box-sizing:border-box;' +
      'background:rgba(4,26,20,.95);color:#6ee7b7;border:1px solid rgba(16,185,129,.55);' +
      'border-radius:12px;padding:9px 12px;font-size:12.5px;line-height:1.55;font-weight:700;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.45);display:flex;gap:8px;align-items:flex-start';
    b.innerHTML =
      '<span style="flex:1 1 auto;min-width:0">' +
        (en ? 'Today your teacher moved this class to a <b>different room</b>. You are in the right place.<br>'
            + '<span style="font-weight:500;opacity:.85">Points and the review quiz are off in this room.</span>'
            : '오늘은 선생님이 <b>다른 방</b>으로 옮긴 수업이에요. 제대로 들어오셨어요.<br>'
            + '<span style="font-weight:500;opacity:.85">이 방에서는 포인트·복습퀴즈가 쉬어요.</span>') +
      '</span>' +
      '<button type="button" aria-label="닫기" style="flex:0 0 auto;background:transparent;border:0;' +
        'color:#6ee7b7;font-size:16px;line-height:1;cursor:pointer;padding:0 2px">&times;</button>';
    try { b.querySelector('button').onclick = function () { try { b.remove(); } catch (e) {} }; } catch (e) {}
    document.body.appendChild(b);
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
      else if (/^meet-/i.test(room) && !typedAtJoin) assignedBanner();   // 안 쳤는데 회의방 = 서버가 정해 준 방
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
          if (id === 'view-videocall-lobby') { armCaseGuards(); setTimeout(fillRoomCode, 150); }
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
        window.vcJoinRoom = function () {
          /* 🚪 입장 «순간» 에 사람이 방 번호를 쳤는지 기억해 둔다.
             안 쳤는데 회의방(meet-…)에 들어가 있으면 그건 **서버가 정해 준 방**이다
             (「오늘은 이 방으로」 — src/class-room-override.ts). 아래 ⑤ 안내가 그것을 쓴다.
             ⛔ 서버 응답을 다시 조회해서 판정하지 말 것 — 같은 요청이 두 번 나간다. */
          try { var _rc = el('vc-roomcode-input'); typedAtJoin = (_rc && _rc.value.trim()) || ''; } catch (e) { typedAtJoin = ''; }
          saveTypedRoom();        // 기억은 «사람이 친 대로»(다음에 그대로 보여 준다)
          normalizeRoomInput();   // 입장은 «해석한 방 id» 로 — 회의방 모달과 같은 규칙
          return origJoin.apply(this, arguments);
        };
        window.vcJoinRoom.__roomcodeWrapped = true;
      }
    } catch (e) {}

    armCaseGuards();
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
