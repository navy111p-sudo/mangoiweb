/* 🚪 (2026-10-16 사장님 지시) 수업 «입장» 은 mangoi.ai 에서만 — 옛 주소로 들어온 사람을 옮긴다.
   ─────────────────────────────────────────────────────────────────────────────
   [왜] 2026-10-16 class-4616-20261016: 학생은 test.mangoi.co.kr, 선생님·참관은 mangoi.ai 로
        같은 방 번호에 들어갔는데 서로 «참여자 1명» 이라 끝내 못 만났다(이 사고만 다섯 번째).
        도메인이 어느 워커에 붙어 있는지는 코드 밖(대시보드)이라 또 갈릴 수 있다 → 그래서
        «화상방에 들어가는 순간» 만은 언제나 mangoi.ai 에서 하게 한다.
   [범위] ⛔ 사이트 전체를 옮기지 않는다 — 패스키·앱 로그인·업데이트 확인이 그 주소에 걸려 있다
        (CLAUDE.md 0장, js/idx-legacy-domain-notice.js). 옮기는 것은 «수업 입장» 하나뿐이다.
   [로그인] 학생 로그인(mango_token)은 주소마다 따로라, 옛 주소에서 1회용 코드를 받아
        mangoi.ai 에서 다시 로그인한다(서버 정본 src/class-entry-handoff.ts).
        선생님·관리자의 «수업 들어가기» 링크(?vc_autojoin=1&vc_role=…)는 로그인 없이도 역할이
        URL 로 정해지므로 주소만 바꿔 그대로 넘긴다.
   [실패] ⛔ 무엇이든 실패하면 «예전처럼» 옛 주소에서 그대로 입장한다 — 수업에 못 들어가는 쪽이 더 나쁘다.
   [저쪽] mangoi.ai 에서는 ?handoff= 를 받아 로그인하고, ?mg_enter=1 이면 로비를 열어 그대로 입장한다.
   ⛔ 상주 setInterval·MutationObserver 를 두지 않는다(홈 전체가 멎은 전력).
*/
(function () {
  'use strict';
  var TARGET = 'https://mangoi.ai';
  var LEGACY_HOSTS = { 'test.mangoi.co.kr': 1 };
  var host = '';
  try { host = String(location.hostname || '').toLowerCase(); } catch (e) {}
  // defer 스크립트는 DOMContentLoaded «전» 에 돈다 — 그 뒤인지 알기 위해 표시만 해 둔다
  var dclSeen = document.readyState === 'complete';
  try { document.addEventListener('DOMContentLoaded', function () { dclSeen = true; }); } catch (e) {}
  /* 📱 옛 iOS 앱은 카메라·마이크 허용 주소 목록에 mangoi.ai 가 없을 수 있다(2026-08-17 이전 빌드).
     그 안에서 옮기면 화상수업 카메라가 막히므로 iOS 앱 안에서는 옮기지 않는다(예전 동작 그대로).
     안드로이드 앱은 주소와 무관하게 허용하므로 옮겨도 된다(MainActivity.onPermissionRequest). */
  var inIosApp = false;
  try { inIosApp = /MangoiApp\/iOS/.test(navigator.userAgent || ''); } catch (e) {}

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function el(id) { return document.getElementById(id); }
  function isEn() {
    try { if (typeof window.getLang === 'function') return String(window.getLang()).toLowerCase().indexOf('en') === 0; } catch (e) {}
    return ls('mangoi_lang').toLowerCase().indexOf('en') === 0;
  }
  function toast(ko, en) {
    try {
      var t = document.createElement('div');
      t.id = 'mg-entry-domain-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('style', 'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483001;'
        + 'max-width:min(560px,92vw);background:#0f172a;color:#f8fafc;border:1px solid #fbbf24;border-radius:12px;'
        + 'padding:12px 16px;font-size:15px;line-height:1.45;text-align:center;box-shadow:0 12px 30px rgba(0,0,0,.4)');
      t.textContent = isEn() ? en : ko;
      document.body.appendChild(t);
      setTimeout(function () { try { t.remove(); } catch (e) {} }, 4500);
    } catch (e) {}
  }

  // ═════════════════════════════════════════════════════════════════════
  // ① 옛 주소 쪽 — 입장하려는 순간 mangoi.ai 로 옮긴다
  // ═════════════════════════════════════════════════════════════════════
  /** 지금 주소의 query 에서 «선생님·관리자 자동 입장» 링크인가. */
  function isAutoJoinUrl(search) {
    try { return new URLSearchParams(search || '').get('vc_autojoin') === '1'; } catch (e) { return false; }
  }

  /** 옮겨 갈 주소를 만든다(순수 함수 — 하니스가 실제로 돌린다). */
  function buildTargetUrl(kind, p) {
    p = p || {};
    if (kind === 'autojoin') return TARGET + '/' + (p.search || '');
    var q = new URLSearchParams();
    if (kind === 'handoff') { q.set('handoff', String(p.code || '')); }
    q.set('mg_enter', '1');
    if (p.room) q.set('mg_room', String(p.room));
    if (kind === 'name' && p.name) q.set('mg_name', String(p.name));
    return TARGET + '/?' + q.toString();
  }

  /** 오늘 입장할 수 있는 예약 방(학생) — 못 찾으면 '' */
  function findTodayRoom(uid, typedName) {
    var qs = 'role=student';
    if (uid) qs += '&user_id=' + encodeURIComponent(uid);
    if (typedName) qs += '&student_name=' + encodeURIComponent(typedName);
    return fetch('/api/class/sessions/today?' + qs, { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return '';
        var ss = (d.sessions || []);
        var cur = d.current || ss.filter(function (s) { return s && s.join_open; })[0];
        return (cur && cur.join_open && cur.room_id) ? String(cur.room_id) : '';
      })
      .catch(function () { return ''; });
  }

  function createHandoffCode(token) {
    return fetch('/api/student/session-status', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: 'handoff' })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return (d && d.ok === true && d.code) ? String(d.code) : ''; })
      .catch(function () { return ''; });
  }

  function currentUser() {
    try { if (typeof window.getCurrentUser === 'function') { var u = window.getCurrentUser(); if (u) return u; } } catch (e) {}
    try { return JSON.parse(ls('mangoi_logged_user') || 'null'); } catch (e) { return null; }
  }

  /** 관리자·강사 세션(쿠키)으로 들어온 사람인가 — 학생 토큰이 없고 관리자 세션 표시가 있음 */
  function isStaffSession() {
    try { if (typeof window.vcIsStaffNow === 'function' && window.vcIsStaffNow()) return true; } catch (e) {}
    return !!ls('mangoi_admin_session') && !ls('mango_token');
  }

  var leaving = false;
  function go(url) {
    leaving = true;
    toast('🚪 수업은 mangoi.ai 에서 열려요. 잠시만요…', '🚪 Classes open on mangoi.ai. One moment…');
    try { location.replace(url); } catch (e) { location.href = url; }
  }

  function legacyBoot() {
    // (가) 선생님·관리자 «수업 들어가기» 링크 — 주소만 바꿔 그대로 넘긴다(역할이 URL 에 있다)
    if (isAutoJoinUrl(location.search)) {
      // 옛 주소에서 소켓이 먼저 열리지 않게 입장을 잠근다(자동입장은 +350ms 에 vcJoinRoom 을 부른다)
      try { var _j = window.vcJoinRoom; window.vcJoinRoom = function () { if (leaving) return; return _j && _j.apply(this, arguments); }; } catch (e) {}
      go(buildTargetUrl('autojoin', { search: location.search }));
      return;
    }

    // (나) 홈·로비에서 「수업 입장」을 누른 순간
    var orig = window.vcJoinRoom;
    if (typeof orig !== 'function' || orig.__entryDomainWrapped) return;
    var busy = false;
    var wrapped = function () {
      var self = this, args = arguments;
      if (leaving) return;
      if (busy) return;
      function stay() { busy = false; return orig.apply(self, args); }   // ⛔ 실패하면 예전처럼 여기서 입장

      var typedRoom = ''; var typedName = '';
      try { typedRoom = ((el('vc-roomcode-input') || {}).value || '').trim(); } catch (e) {}
      try { typedName = ((el('vc-name-input') || {}).value || '').trim(); } catch (e) {}
      var u = currentUser();
      var uid = (u && (u.uid || u.user_id)) ? String(u.uid || u.user_id) : '';
      var token = ls('mango_token');

      // 선생님·관리자 세션(쿠키 — 주소마다 따로)은 mangoi.ai 로 못 넘긴다 → 역할을 URL 로 실어 넘긴다
      if (isStaffSession()) {
        if (!typedRoom) return stay();   // 방을 모르면 공용방으로 보내게 되므로 옮기지 않는다
        var sp = new URLSearchParams();
        sp.set('vc_autojoin', '1'); sp.set('vc_role', 'teacher'); sp.set('vc_room', typedRoom);
        if (typedName) sp.set('vc_name', typedName);
        go(buildTargetUrl('autojoin', { search: '?' + sp.toString() }));
        return;
      }

      busy = true;
      var roomP = typedRoom ? Promise.resolve(typedRoom) : findTodayRoom(uid, typedName);
      var codeP = (uid && token) ? createHandoffCode(token) : Promise.resolve('');
      return Promise.all([roomP, codeP]).then(function (r) {
        var room = r[0], code = r[1];
        if (code) { go(buildTargetUrl('handoff', { code: code, room: room })); return; }
        // 로그인이 없는(아이디만 친) 학생 — 친 아이디를 그대로 넘긴다(로비에서 친 것과 같다)
        if (!uid && typedName) { go(buildTargetUrl('name', { name: typedName, room: room })); return; }
        return stay();   // 로그인은 있는데 코드를 못 받음 → 로그인을 잃지 않게 예전처럼
      }).catch(function () { return stay(); });
    };
    wrapped.__entryDomainWrapped = true;
    wrapped.__roomcodeWrapped = !!orig.__roomcodeWrapped;
    window.vcJoinRoom = wrapped;
  }

  // ═════════════════════════════════════════════════════════════════════
  // ② mangoi.ai 쪽 — 넘겨받은 로그인을 적고, 로비를 열어 그대로 입장한다
  // ═════════════════════════════════════════════════════════════════════
  function storeLogin(d) {
    var _lu = { user_id: d.user.user_id, uid: d.user.user_id, name: d.user.user_name, user_name: d.user.user_name, role: d.user.role || 'student' };
    try {
      localStorage.setItem('mango_user', JSON.stringify(_lu));
      localStorage.setItem('mangoi_logged_user', JSON.stringify(_lu));
      localStorage.setItem('mangoi_vc_uid', _lu.name || _lu.uid);
      if (d.token) localStorage.setItem('mango_token', d.token);
      localStorage.setItem('mangoi_pk_last_uid', d.user.user_id);
    } catch (e) {}
  }

  function cleanUrl(keepEnter) {
    try {
      var sp = new URLSearchParams(location.search);
      ['handoff', 'mg_enter', 'mg_room', 'mg_name'].forEach(function (k) { if (!keepEnter || k === 'handoff') sp.delete(k); });
      var q = sp.toString();
      history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
    } catch (e) {}
  }

  function enterNow(room, name) {
    (function tryJoin(n) {
      if (typeof window.showView !== 'function' || typeof window.vcJoinRoom !== 'function') {
        if (n < 40) return setTimeout(function () { tryJoin(n + 1); }, 150);
        return;
      }
      window.__vcLobbyAutoJoined = true;   // 로비 자동입장(+220ms)이 따로 한 번 더 들어가지 않게(이중 소켓 방지)
      try { window.showView('view-videocall-lobby'); } catch (e) {}
      setTimeout(function () {
        var ni = el('vc-name-input'), ri = el('vc-roomcode-input');
        var u = currentUser();
        var nm = (u && (u.uid || u.user_id)) || name || '';
        if (ni && nm) ni.value = nm;
        if (ri) ri.value = room || '';     // 비우면 vcJoinRoom 이 «오늘 예약 방» 으로 스스로 찾는다
        try { window.vcJoinRoom(); } catch (e) { console.warn('[entry-domain] 입장 실패(로비에서 다시 누를 수 있음):', e); }
      }, 350);
    })(0);
  }

  function siteBoot() {
    var sp;
    try { sp = new URLSearchParams(location.search); } catch (e) { return; }
    var code = sp.get('handoff');
    var enter = sp.get('mg_enter') === '1';
    var room = sp.get('mg_room') || '';
    var name = sp.get('mg_name') || '';
    if (code) {
      cleanUrl(true);   // 코드는 주소창·방문기록에 남기지 않는다(1회용이라도)
      fetch('/api/student/login', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoff: code })
      }).then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) {
          if (d && d.ok === true && d.user && d.user.user_id) {
            storeLogin(d);
            // 로그인 표시·이름이 처음부터 맞게 한 번 새로 연다(입장은 mg_enter 로 이어서)
            var q = new URLSearchParams();
            if (enter) q.set('mg_enter', '1');
            if (room) q.set('mg_room', room);
            location.replace(location.pathname + (q.toString() ? '?' + q.toString() : ''));
            return;
          }
          toast('로그인 정보를 옮기지 못했어요. 로그인한 뒤 「수업 입장」을 다시 눌러 주세요.',
                'Could not carry your login over. Please log in and press “Enter class” again.');
          cleanUrl(false);
        })
        .catch(function () { cleanUrl(false); });
      return;
    }
    if (enter) {
      cleanUrl(false);
      // 기존 자동입장(idx-main.js vcAutoJoinFromParams)과 같은 때(DOMContentLoaded 뒤)에 연다 —
      // 그보다 먼저 열면 홈 초기화가 화면을 다시 홈으로 돌릴 수 있다.
      if (dclSeen) enterNow(room, name);
      else document.addEventListener('DOMContentLoaded', function () { enterNow(room, name); });
    }
  }

  // 하니스가 순수 함수를 실제로 돌릴 수 있게 꺼내 둔다(동작에는 영향 없음)
  window.__mgEntryDomain = { buildTargetUrl: buildTargetUrl, isAutoJoinUrl: isAutoJoinUrl, LEGACY_HOSTS: LEGACY_HOSTS, TARGET: TARGET };

  function boot() {
    if (LEGACY_HOSTS[host]) { if (!inIosApp) legacyBoot(); }
    else if (host === 'mangoi.ai' || host === 'www.mangoi.ai') siteBoot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
