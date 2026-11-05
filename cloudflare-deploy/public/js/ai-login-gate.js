/* ═══════════════════════════════════════════════════════════════════════
 * 🔒 A.i 콘텐츠 로그인 안내 (2026-11-05 사장님 지시)
 *   「이번 주 일요일까지만 비로그인 학생도 AI 컨텐츠를 쓸 수 있게 하고,
 *    월요일 00시부터는 비로그인 학생이 쓰려고 하면 '로그인을 해야 한다' 안내가 뜨게 미리 세팅」
 *
 * [언제] 2026-11-09(월) 00:00 KST = 2026-11-08 15:00 UTC 부터. 그 전에는 아무것도 하지 않는다.
 *   ⚠️ 시각은 «학생 기기 시계» 로 잰다(서버에 묻지 않음 — 이 파일이 실패해도 화면은 그대로 열려야 한다).
 * [누구를] 로그인 흔적이 «하나도» 없는 사람만. 다음 중 하나라도 있으면 로그인으로 본다:
 *   · mangoi_logged_user / mango_user 에 계정 uid(guest_·anon_ 로 시작하면 손님이라 제외)
 *   · mango_token / mangoi_token (엘리더잼 학원 학생은 토큰만 가진다)
 *   · mangoi_admin_session 의 uid (교사·본사·지사·대리점 — 학생 키가 없다: CLAUDE.md 「또 로그인하래요」)
 *   ⛔ 판정을 «넓히는» 쪽은 괜찮지만 «좁히지» 마세요 — 로그인한 학생이 막히는 쪽이 훨씬 나쁩니다.
 * [어디서] 이 파일을 싣는 화면만(AI 학습 화면들). 화면 목록의 정본은 하니스 ai_login_gate_harness 의 PAGES.
 *   ⛔ 홈(index.html)·레벨테스트(level-test-ai)·이용권(ai-pass)·설명서(ai-guide)에는 싣지 않는다.
 * [한계] 화면 «안내» 이다 — 서버 API 는 그대로 열려 있다(주소로 직접 부르면 쓸 수 있음).
 * ⚠️ ?v= 없이 싣는다(no-cache) — 날짜를 바꿔도 HTML 수백 개의 번호를 안 올려도 된다. ⛔ ?v= 를 붙이지 말 것.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {
    if (window.__mgAiLoginGate) return;
    var CUTOFF_MS = Date.UTC(2026, 10, 8, 15, 0, 0);   // 2026-11-09 00:00 KST

    function now() {
      var t = Number(window.__mgAiGateNow);           // 하니스·확인용 — 평소엔 비어 있다
      return isFinite(t) && t > 0 ? t : Date.now();
    }
    function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
    function realUid(v) {
      v = String(v == null ? '' : v).trim();
      if (!v || v === 'null' || v === 'undefined') return '';
      if (/^(guest|anon)[_-]/i.test(v)) return '';
      return v;
    }
    function uidOf(key, admin) {
      var raw = ls(key);
      if (!raw || raw === 'null') return '';
      try {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') return realUid(o.uid || o.user_id || o.id || (admin ? o.username : ''));
      } catch (_) {}
      return '';
    }
    function loggedIn() {
      if (uidOf('mangoi_logged_user') || uidOf('mango_user')) return true;
      if (uidOf('mangoi_admin_session', true)) return true;
      var tk = ls('mango_token') || ls('mangoi_token');
      if (tk && tk !== 'null' && tk !== 'undefined') return true;
      return false;
    }
    function isEn() {
      try { if (typeof window.getLang === 'function') return window.getLang() === 'en'; } catch (_) {}
      return String(ls('mangoi_lang') || '').toLowerCase() === 'en';
    }
    function go(url) {
      try { if (window.top && window.top !== window) { window.top.location.href = url; return; } } catch (_) {}
      try { location.href = url; } catch (_) {}
    }

    var box = null;
    function hide() {
      if (box && box.parentNode) box.parentNode.removeChild(box);
      box = null;
      try { document.documentElement.style.overflow = ''; } catch (_) {}
    }
    function show() {
      if (box || !document.body) return;
      var en = isEn();
      box = document.createElement('div');
      box.id = 'mg-ai-login-gate';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'mg-alg-t');
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.82);font-family:inherit';
      box.innerHTML =
        '<div style="background:#ffffff;color:#101828;max-width:400px;width:100%;border-radius:18px;padding:26px 22px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)">' +
          '<div style="font-size:40px;line-height:1">🔒</div>' +
          '<h2 id="mg-alg-t" style="margin:12px 0 8px;font-size:20px;font-weight:800;color:#101828">' +
            (en ? 'Please log in' : '로그인을 해야 해요') + '</h2>' +
          '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#344054">' +
            (en ? 'A.i learning is available to logged-in students only.<br>Log in and come back!'
                : 'A.i 학습은 로그인한 학생만 이용할 수 있어요.<br>로그인한 뒤 다시 들어와 주세요.') + '</p>' +
          '<button type="button" data-alg="login" style="display:block;width:100%;min-height:48px;border:0;border-radius:12px;background:#f59e0b;color:#101828;font-size:16px;font-weight:800;cursor:pointer;font-family:inherit">' +
            (en ? '🔐 Log in' : '🔐 로그인하기') + '</button>' +
          '<button type="button" data-alg="home" style="display:block;width:100%;min-height:44px;margin-top:10px;border:1px solid #d0d5dd;border-radius:12px;background:#ffffff;color:#344054;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">' +
            (en ? '🏠 Home' : '🏠 홈으로') + '</button>' +
        '</div>';
      box.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-alg]') : null;
        if (!b) return;
        go(b.getAttribute('data-alg') === 'login' ? '/?login=1' : '/');
      });
      document.body.appendChild(box);
      try { document.documentElement.style.overflow = 'hidden'; } catch (_) {}
      try { box.querySelector('[data-alg="login"]').focus({ preventScroll: true }); } catch (_) {}
    }
    function check() {
      if (now() < CUTOFF_MS) { hide(); return false; }
      if (loggedIn()) { hide(); return false; }
      show();
      return true;
    }

    window.__mgAiLoginGate = { check: check, loggedIn: loggedIn, CUTOFF_MS: CUTOFF_MS };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, { once: true });
    else check();
    window.addEventListener('pageshow', check);                    // 뒤로가기(bfcache)로 돌아온 경우
    window.addEventListener('storage', function () { if (box) check(); });   // 다른 탭에서 로그인하면 걷힘
    /* 일요일 밤에 열어 둔 화면도 자정에 막히게 — 남은 시간이 하루 안일 때만 한 번 예약(상주 타이머 아님) */
    var left = CUTOFF_MS - now();
    if (left > 0 && left < 86400000) setTimeout(check, left + 1000);
  } catch (_) { /* 이 파일의 어떤 실패도 화면을 막지 않는다 */ }
})();
