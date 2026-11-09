/* 🔑 A.i 학습 로그인 게이트 (2026-11-09 사장님 지시)
   「학생 계정으로 로그인을 하지 않으면 A.i 컨텐츠를 이용할 수 없어야 한다」
   — 그전에는 홈 「AI와 친구하기」 카드와 각 화면 주소가 로그인 없이 그대로 열렸다.

   쓰는 법(두 가지):
   ① A.i 학습 화면:  <script src="/js/ai-login-gate.js?v=N"></script>  (defer 아님 — 화면이 그려지기 전에 막는다)
      로그인이 안 돼 있으면 화면 전체를 덮는 안내를 띄우고, 「로그인하기」는 홈의 로그인 창(/?menu=login)으로 보낸다.
   ② 홈(index.html):  <script defer src="/js/ai-login-gate.js?v=N" data-mode="home"></script>
      「AI와 친구하기」 카드를 비로그인 상태에서 누르면 화면을 옮기지 않고 로그인 창을 연다.
      그리고 /?menu=login 으로 들어오면 로그인 창을 연다.

   «로그인» 판정 — 홈 히어로(index.html loggedIn)와 같은 기준:
     · 학생: mango_token 이 있고 uid 가 있으며 만료 전
     · 교사·본사·지사(사장님 계정 포함): mangoi_admin_session 에 uid/name 이 있음
       ⛔ 이 둘을 빼지 말 것 — 사장님(jeong)은 관리자 폴백으로 들어와 학생 토큰이 없다(CLAUDE.md 2장).
   ⚠️ 화면 게이트다. 서버 API 는 따로 막지 않았다(게스트 id 로 부르는 경로가 남아 있다).
   ⚠️ 자동화 브라우저(navigator.webdriver)에서는 비켜선다 — CI 화면 검사가 비로그인으로 연다.
   ⚠️ 화상수업 «안»(부모 화면에 body.vc-in-call)에 iframe 으로 열린 경우는 막지 않는다 — 수업을 끊지 않기 위해. */
(function () {
  function tokenOk() {
    try {
      var t = localStorage.getItem('mango_token');
      if (!t) return false;
      var p = String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      var j = JSON.parse(atob(p));
      return !!j.uid && (!j.exp || j.exp > Date.now());
    } catch (e) { return false; }
  }
  function staffOk() {
    try {
      var s = JSON.parse(localStorage.getItem('mangoi_admin_session') || 'null');
      return !!(s && (s.uid || s.name));
    } catch (e) { return false; }
  }
  function loggedIn() { return tokenOk() || staffOk(); }
  window.mgAiLoggedIn = loggedIn;

  function isKo() {
    try { if (typeof window.getLang === 'function') return window.getLang() !== 'en'; } catch (e) {}
    try { return localStorage.getItem('mangoi_lang') !== 'en'; } catch (e) { return true; }
  }

  var me = document.currentScript;
  var mode = (me && me.getAttribute('data-mode')) || 'page';

  /* ── ② 홈 ─────────────────────────────────────────── */
  if (mode === 'home') {
    function openLogin() {
      if (typeof window.openLoginModal === 'function') { window.openLoginModal(); return true; }
      return false;
    }
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('#ai-friends-ov .aif-item') : null;
      if (!t || loggedIn()) return;
      try { if (navigator.webdriver && !window.__mgAiGateForce) return; } catch (e2) {}
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      var ov = document.getElementById('ai-friends-ov');
      if (ov) ov.style.display = 'none';
      if (!openLogin()) alert(isKo() ? '학생 계정으로 로그인해야 이용할 수 있어요.' : 'Please log in with your student account.');
    }, true);
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('menu') === 'login') {
        if (!loggedIn()) openLogin();
        q.delete('menu');
        var s = q.toString();
        history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
      }
    } catch (e) {}
    return;
  }

  /* ── ① A.i 학습 화면 ─────────────────────────────── */
  try {
    if (window.parent !== window && window.parent.document.body.classList.contains('vc-in-call')) return;
  } catch (e) {}
  // 자동화 브라우저(CI 화면 검사)는 비로그인으로 화면을 열어 검사한다 — 거기서는 비켜선다.
  //   이 게이트는 «화면» 게이트일 뿐 보안 경계가 아니다(서버 API 는 따로). 게이트 자체 검사는
  //   window.__mgAiGateForce = true 로 강제한다(test-harness/ai_login_gate_harness.mjs).
  try { if (navigator.webdriver && !window.__mgAiGateForce) return; } catch (e) {}
  if (loggedIn()) return;

  function show() {
    if (document.getElementById('mg-ai-login-gate')) return;
    var ko = isKo();
    var d = document.createElement('div');
    d.id = 'mg-ai-login-gate';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:18px;background:#0b1220;font-family:inherit';
    d.innerHTML =
      '<div style="width:100%;max-width:420px;background:#ffffff;color:#101828;border-radius:20px;padding:30px 24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.5)">'
      + '<img src="/img/mango-char.png" alt="" style="width:72px;height:72px;object-fit:contain;margin-bottom:8px">'
      + '<h2 style="margin:0 0 10px;font-size:22px;font-weight:900;color:#101828">'
      + (ko ? '로그인이 필요해요' : 'Please log in') + '</h2>'
      + '<p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#475467">'
      + (ko ? 'A.i 학습은 학생 계정으로 로그인한 뒤 이용할 수 있어요.' : 'A.i learning is available after logging in with your student account.') + '</p>'
      + '<a href="/?menu=login" style="display:block;padding:14px;border-radius:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;font-weight:800;font-size:16px;text-decoration:none">'
      + (ko ? '🔑 로그인하기' : '🔑 Log in') + '</a>'
      + '<a href="/" style="display:block;margin-top:12px;font-size:14px;color:#475467;text-decoration:underline">'
      + (ko ? '홈으로' : 'Home') + '</a>'
      + '</div>';
    (document.body || document.documentElement).appendChild(d);
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
  }
  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show);
  // 화면이 나중에 그리는 오버레이보다 늘 위에 남도록 한 번 더(상주 타이머 아님)
  setTimeout(function () {
    var g = document.getElementById('mg-ai-login-gate');
    if (g && g.parentNode) g.parentNode.appendChild(g);
  }, 1500);
})();
