/* ═══════════════════════════════════════════════════════════════════════
 * 🔒 session-guard.js — 「다른 기기에서 로그인되었습니다」 안내 (2026-08-08)
 *
 *   왜 필요한가 —
 *     동시접속 1세션(SINGLE_SESSION)을 켜면, 밀려난 기기는 그냥 **401** 을 받는다.
 *     화면은 그걸 「로그인해주세요」로만 보여 주므로 학부모는 **이유를 모른 채** 튕긴다.
 *     문의 전화가 그대로 늘어난다. 그래서 «왜» 를 정확히 알려 준다.
 *
 *   어떻게 —
 *     ① window.fetch 를 감싸 같은 출처 `/api/…` 응답이 401 인지 본다.
 *     ② 401 이면 `/api/student/session-status` 에 토큰을 한 번 물어본다(이 호출은 감싸지 않는다).
 *     ③ 답이 'kicked' 일 때만 안내창을 띄우고 토큰을 지운다.
 *        'expired'·'invalid' 는 기존 동작 그대로 둔다(여기서 손대면 회귀가 난다).
 *
 *   ⚠️ 원칙 — **아무것도 막지 않는다.** 원래 응답은 손대지 않고 그대로 돌려준다.
 *      이 파일이 통째로 실패해도 페이지는 예전과 똑같이 동작해야 한다(전부 try/catch).
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {
    if (window.__mangoiSessionGuard) return;   // 중복 로드 방지
    window.__mangoiSessionGuard = true;

    var TOKEN_KEYS = ['mango_token', 'mangoi_token'];
    var CLEAR_KEYS = ['mango_token', 'mangoi_token', 'mangoi_logged_user', 'mango_user', 'mangoi_user', 'mangoi_uid'];

    var checking = false;   // 401 이 우르르 와도 조회는 한 번만
    var shown = false;      // 안내창은 한 번만

    function getToken() {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        try {
          var v = localStorage.getItem(TOKEN_KEYS[i]);
          if (v && v !== 'null' && v !== 'undefined') return v;
        } catch (_) {}
      }
      return '';
    }

    function isEnglish() {
      try { return String(localStorage.getItem('mangoi_lang') || '').toLowerCase() === 'en'; } catch (_) { return false; }
    }

    /** 저장된 로그인 흔적을 지운다 — 새로고침해도 죽은 토큰으로 다시 401 나지 않게. */
    function clearLogin() {
      for (var i = 0; i < CLEAR_KEYS.length; i++) {
        try { localStorage.removeItem(CLEAR_KEYS[i]); } catch (_) {}
        try { sessionStorage.removeItem(CLEAR_KEYS[i]); } catch (_) {}
      }
    }

    function showKickedModal() {
      if (shown) return;
      shown = true;
      var en = isEnglish();
      var t = en ? 'Signed in on another device' : '다른 기기에서 로그인되었습니다';
      var b1 = en
        ? 'Your Mangoi account was just used to sign in somewhere else, so this device has been signed out.'
        : '방금 다른 기기에서 이 계정으로 로그인했기 때문에, 이 기기는 로그아웃되었습니다.';
      var b2 = en
        ? 'One account can be used on one device at a time. If this was not you, please change your password.'
        : '하나의 아이디는 한 번에 한 기기에서만 사용할 수 있습니다. 본인이 아니라면 비밀번호를 바꿔 주세요.';
      var btn = en ? 'Sign in again' : '다시 로그인';

      var wrap = document.createElement('div');
      wrap.id = 'mangoi-session-kicked';
      wrap.setAttribute('role', 'alertdialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483600',
        'background:rgba(8,15,26,.62)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'padding:20px',
        // ⚠️ 백그라운드 탭에서 transition 이 멈춰 영영 안 보이는 사고를 피하려고
        //    opacity 애니메이션을 쓰지 않는다(CLAUDE.md 함정 목록).
        // 🈶 한자 글꼴은 반드시 맨 앞이 MangoiHanSC — 뒤로 가면 공통한자를 한글 글꼴이 먼저 그린다
        'font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",sans-serif'
      ].join(';');

      var card = document.createElement('div');
      card.style.cssText = [
        'background:#fffdf7', 'border-radius:18px', 'max-width:420px', 'width:100%',
        'padding:28px 24px 22px', 'box-shadow:0 24px 60px rgba(0,0,0,.35)',
        'text-align:center', 'color:#1a2433'
      ].join(';');

      var icon = document.createElement('div');
      icon.textContent = '🔒';
      icon.style.cssText = 'font-size:40px;line-height:1;margin-bottom:12px';

      var h = document.createElement('div');
      h.textContent = t;
      h.style.cssText = 'font-size:19px;font-weight:800;margin-bottom:12px;color:#0f1a2b';

      var p1 = document.createElement('div');
      p1.textContent = b1;
      p1.style.cssText = 'font-size:14.5px;line-height:1.65;color:#33415a;margin-bottom:8px';

      var p2 = document.createElement('div');
      p2.textContent = b2;
      p2.style.cssText = 'font-size:13px;line-height:1.6;color:#6b7a90;margin-bottom:20px';

      var go = document.createElement('button');
      go.type = 'button';
      go.textContent = btn;
      go.style.cssText = [
        'width:100%', 'padding:13px 16px', 'border:0', 'border-radius:12px',
        'background:#f59e0b', 'color:#1a1206', 'font-size:15px', 'font-weight:800',
        'cursor:pointer'
      ].join(';');
      go.onclick = function () {
        try { location.href = '/?relogin=1'; } catch (_) { try { location.reload(); } catch (__) {} }
      };

      card.appendChild(icon); card.appendChild(h); card.appendChild(p1); card.appendChild(p2); card.appendChild(go);
      wrap.appendChild(card);

      function mount() { try { (document.body || document.documentElement).appendChild(wrap); } catch (_) {} }
      if (document.body) mount();
      else document.addEventListener('DOMContentLoaded', mount, { once: true });
    }

    var rawFetch = window.fetch && window.fetch.bind(window);
    if (!rawFetch) return;

    /** 사유 조회 — 감싸지 않은 fetch 로 부른다(재귀 방지). */
    function askWhy() {
      if (checking || shown) return;
      var tok = getToken();
      if (!tok) return;          // 애초에 로그인 상태가 아니면 볼 것 없음
      checking = true;
      rawFetch('/api/student/session-status', { headers: { Authorization: 'Bearer ' + tok }, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (j && j.state === 'kicked') { clearLogin(); showKickedModal(); }
        })
        .catch(function () { /* 조회 실패는 조용히 — 기존 401 처리 그대로 */ })
        .then(function () { checking = false; });
    }

    window.fetch = function (input, init) {
      var p = rawFetch(input, init);
      try {
        p.then(function (res) {
          try {
            if (!res || res.status !== 401 || shown) return;
            var u = (typeof input === 'string') ? input : (input && input.url) || '';
            if (u.indexOf('/api/') < 0) return;
            if (u.indexOf('/api/student/session-status') >= 0) return;
            // 외부 도메인 호출은 우리 세션과 무관
            if (/^https?:\/\//i.test(u) && u.indexOf(location.origin) !== 0) return;
            askWhy();
          } catch (_) {}
        }, function () { /* 네트워크 오류는 여기 관심사가 아니다 */ });
      } catch (_) {}
      return p;   // ⚠️ 원래 promise 를 그대로 — 응답을 가로채지 않는다
    };
  } catch (_) { /* 이 파일의 어떤 실패도 페이지를 막지 않는다 */ }
})();

/* ═══════════════════════════════════════════════════════════════════════
 * 🔤 아이디 칸 «자동 대문자·자동 고침» 차단 (2026-08-26 사장님 지시)
 *
 *   왜 필요한가 —
 *     어린이 학생이 가장 헷갈리는 것이 대소문자다. 한국어에는 대소문자가 없어 감이 없다.
 *     게다가 폰 키보드는 `type="text"` 칸의 첫 글자를 **기본으로 대문자**로 만든다
 *     (`autocapitalize` 기본값이 `sentences`). 자동고침(autocorrect)은 더 나빠서
 *     아이디를 아예 딴 낱말로 바꿔 놓는다 — 이건 서버가 대소문자를 무시해도 못 막는다.
 *
 *   서버는 2026-08-26 부터 아이디 대소문자를 무시하므로(`api-students.ts`) 「Hong」 으로
 *   쳐도 로그인 자체는 된다. 그래도 이 파일이 필요한 이유는 둘이다 —
 *     ① 화면에 대문자가 찍히는 것 자체가 아이를 멈춰 세운다(「내가 틀렸나?」)
 *     ② 자동고침은 «다른 글자» 를 만들어 실제로 로그인을 깨뜨린다
 *
 *   ⚠️ 로그인 칸(`lm-uid`)은 **모달을 열 때 JS 가 만든다** — 로드 시점에는 없다.
 *      그래서 «누르는 순간»(pointerdown 캡처)과 «포커스»(focusin 캡처) 둘 다에서 손본다.
 *      pointerdown 은 포커스보다 먼저라 키보드가 뜨기 전에 속성이 박힌다.
 *   ⛔ MutationObserver 로 상주 감시하지 않는다 — 이 저장소에는 그것이 홈 화면을 통째로
 *      멎게 한 전력이 있다(CLAUDE.md 2장 「body 의 class 를 MutationObserver 로」).
 *   ⛔ 비밀번호 칸은 건드리지 않는다 — 브라우저가 이미 대문자화를 하지 않고,
 *      값을 손대면 «비번 그대로 두기»(2026-08-26 사장님 결정)를 어기게 된다.
 *
 *   ⚠️ index.html 은 공동 금지구역이라 그 안의 칸(`vc-name-input`·`ext-uid`)에
 *      속성을 직접 적을 수 없다. 그래서 밖에서 입혀 준다.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {
    if (window.__mangoiIdNoCaps) return;
    window.__mangoiIdNoCaps = true;

    /* 아이디를 받는 칸들. 새 화면을 만들면 `autocomplete="username"` 만 달아도 자동으로 걸린다
       — 이름 목록은 그것이 빠진 옛 칸들을 위한 보완이다(`lm-uid` 가 실제로 그렇다). */
    var ID_IDS = { 'lm-uid': 1, 'lg-uid': 1, 'ev-lg-uid': 1, 'ext-uid': 1, 'vc-name-input': 1, 'username': 1 };

    function fixIdField(el) {
      try {
        if (!el || el.tagName !== 'INPUT') return;
        // 비밀번호·체크박스 등은 대상이 아니다. 글자를 받는 칸만.
        var t = (el.getAttribute('type') || 'text').toLowerCase();
        if (t !== 'text' && t !== 'search') return;
        if (!(ID_IDS[el.id] || el.getAttribute('autocomplete') === 'username')) return;
        if (el.getAttribute('autocapitalize') === 'off') return;   // 이미 손봤다
        el.setAttribute('autocapitalize', 'off');
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('spellcheck', 'false');
      } catch (_) {}
    }

    function sweep() {
      try {
        var list = document.querySelectorAll('input');
        for (var i = 0; i < list.length; i++) fixIdField(list[i]);
      } catch (_) {}
    }

    // 나중에 만들어지는 칸(로그인 모달)은 «누를 때» 잡는다. 캡처 단계라 남이 삼켜도 우리에겐 온다.
    document.addEventListener('pointerdown', function (e) { fixIdField(e.target); }, true);
    document.addEventListener('focusin', function (e) { fixIdField(e.target); }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep);
    else sweep();
  } catch (_) { /* 이 파일의 어떤 실패도 페이지를 막지 않는다 */ }
})();
