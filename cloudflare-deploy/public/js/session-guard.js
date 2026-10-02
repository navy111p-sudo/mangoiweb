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

/* ═══════════════════════════════════════════════════════════════════════
 * 🆘 ENTRY-FAIL-HELP — 수업 입장이 막힌 «그 순간» 진단·상담으로 잇기 (2026-10-02, P5)
 *
 *   왜 — 파일럿 VoC 1번이 「아예 수업에 입장을 못했다」였다. 진단 화면(/precheck.html,
 *     메뉴 「🎥 수업 진단」)은 이미 있는데, 막힌 학생은 그것이 있는 줄 모른다.
 *     그래서 «실패가 확인된 순간에만» 작은 안내 카드를 띄워 두 길을 준다.
 *       ① 🎥 수업 진단 열기(/precheck.html) ② 💬 카카오 상담(채널 홈 — /chat 금지)
 *
 *   언제 뜨나 (이것뿐이다 — 정상 입장 경로에는 아무것도 안 그린다)
 *     ⓐ 카메라·마이크: idx-main.js 가 vcShowLocalPlaceholder('all-fail') 를 부를 때,
 *        또는 'camera-fail' 인데 직전 오류가 «권한 거부·장치 없음·차단·미지원» 일 때.
 *        ('사용 중(NotReadable)' 은 idx-main 이 스스로 다시 시도하므로 띄우지 않는다)
 *        그리고 「⚠️ 마이크가 감지되지 않았습니다」 alert 뒤(그 alert 는 그대로 둔다).
 *     ⓑ 수업 연결(WebSocket /ws/video-call): 연결 성공 없이 끊김이 FAIL_N 번 이어질 때,
 *        또는 만든 뒤 OPEN_WAIT_MS 동안 한 번도 안 열렸을 때. 다시 열리면 카드를 거둔다.
 *
 *   어떻게 — idx-main.js(blocking, 첫 화면 예산)와 index.html(공동 금지구역)을 한 글자도 안 고치고
 *     전역 함수(createWebSocket·vcShowLocalPlaceholder·describeMediaError·alert)를 «밖에서» 감싼다.
 *     ⚠️ 약점: 그 이름이 바뀌면 조용히 헛돈다 — test-harness/entry_fail_help_harness.mjs 가
 *        «idx-main 에 그 이름들이 아직 있는가» 를 함께 본다.
 *   이 파일을 고른 이유 — index.html 이 ?v= 없이 싣는 defer 파일이라 index.html 의 ?v= 를
 *     올릴 필요가 없다(no-cache 재검증). teacher.html 은 이 파일을 싣지 않는다(학생 화면 전용).
 *
 *   ⛔ 상주 setInterval·body class MutationObserver 없음(홈 정지 전력). 타이머는 소켓마다 한 번뿐.
 *   ⛔ 카드 z-index 2147483001 — A.i 상담사 위젯(2147483000) 바로 위, ➕ FAB(2147483200)·
 *      재연결 배너(2147483646) 아래. 더 올리지 말 것.
 *   ⛔ 버튼에 data-ko/data-en 을 달지 않는다(두 i18n 엔진이 textContent 를 갈아끼운다).
 *      언어가 바뀌면 카드를 통째로 다시 그린다.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {
    if (window.__mgEntryHelp) return;
    // index.html(수업 화면)에서만 — 다른 학생 화면은 그 전역이 없다.
    if (typeof window.createWebSocket !== 'function' && typeof window.vcShowLocalPlaceholder !== 'function') return;

    var PRECHECK_URL = '/precheck.html';
    var KAKAO_URL = 'https://pf.kakao.com/_xlqnSxd';     // ⛔ 뒤에 /chat 붙이지 말 것(비로그인 PC 가 로그인 화면으로 튕김)
    var FAIL_N = 4;                // 성공 없이 끊긴 횟수 — 재시도 1+2+4+8 ≈ 15초 뒤
    var OPEN_WAIT_MS = 25000;      // 첫 연결이 이 시간 안에 한 번도 안 열리면
    var DENY = { NotAllowedError: 1, PermissionDeniedError: 1, NotFoundError: 1, DevicesNotFoundError: 1, SecurityError: 1, TypeError: 1 };

    var state = { reason: '', dismissed: {}, lastErr: '', lastErrAt: 0 };

    function lang() {
      try { if (typeof window.getLang === 'function') { var g = String(window.getLang() || ''); if (g) return g.toLowerCase(); } } catch (_) {}
      try { return String(localStorage.getItem('mangoi_lang') || 'ko').toLowerCase(); } catch (_) { return 'ko'; }
    }
    function isZh() {
      try { return /^zh/i.test(String(navigator.language || '')); } catch (_) { return false; }
    }
    function isObserver() {
      try { return !!(document.body && document.body.classList.contains('vc-observer')); } catch (_) { return false; }
    }

    function texts(reason) {
      var en = lang() === 'en';
      var title = reason === 'net'
        ? (en ? 'Can’t connect to the class' : '수업에 연결이 안 되고 있어요')
        : (en ? 'Camera or microphone isn’t working' : '카메라·마이크가 켜지지 않았어요');
      var body = en
        ? 'Run the class check to find the cause, or ask us on KakaoTalk.'
        : '수업 진단으로 원인을 확인하거나, 카카오로 바로 물어보세요.';
      return {
        title: title, body: body,
        zh: isZh() ? '无法进入课堂？请点下面蓝色按钮做课堂检测，或点黄色按钮用 Kakao 咨询。' : '',
        diag: en ? '🎥 Open class check' : '🎥 수업 진단 열기',
        kakao: en ? '💬 Ask on KakaoTalk' : '💬 카카오 상담',
        close: en ? 'Close' : '닫기'
      };
    }

    function ensureStyle() {
      if (document.getElementById('mg-entry-help-style')) return;
      var st = document.createElement('style');
      st.id = 'mg-entry-help-style';
      st.textContent =
        '#mg-entry-help{position:fixed;left:50%;top:62px;transform:translateX(-50%);z-index:2147483001;' +
        'width:min(360px,calc(100vw - 32px));box-sizing:border-box;background:#ffffff;color:#101828;' +
        'border:1px solid #f59e0b;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.28);' +
        'padding:14px 14px 12px;font:14px/1.45 system-ui,-apple-system,sans-serif;text-align:left}' +
        '#mg-entry-help[hidden]{display:none!important}' +
        '#mg-entry-help .meh-t{display:block;font-weight:800;font-size:15px;margin:0 28px 4px 0;color:#101828}' +
        '#mg-entry-help .meh-b{display:block;margin:0 0 10px;color:#344054}' +
        '#mg-entry-help .meh-zh{display:block;margin:-6px 0 10px;color:#475467;font-size:13px}' +
        '#mg-entry-help .meh-a{display:inline-block;box-sizing:border-box;min-height:40px;padding:9px 12px;margin:0 6px 6px 0;' +
        'border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;line-height:22px;cursor:pointer}' +
        '#mg-entry-help .meh-diag{background:#1d4ed8;color:#ffffff;border:1px solid #1d4ed8}' +
        '#mg-entry-help .meh-kakao{background:#fee500;color:#191600;border:1px solid #e6cf00}' +
        '#mg-entry-help .meh-x{position:absolute;top:6px;right:6px;width:32px;height:32px;padding:0;margin:0;border:0;' +
        'background:transparent;color:#475467;font-size:20px;line-height:32px;text-align:center;cursor:pointer;overflow:hidden}';
      (document.head || document.documentElement).appendChild(st);
    }

    /* 새 창이 안 열리는 인앱 브라우저(카톡 등)는 예외 없이 null 만 돌려준다 → 같은 창으로.
       ⛔ 'noopener' 를 기능 문자열로 주지 않는다(그러면 열려도 null 이라 «언제나 막혔다» 가 된다). */
    function openOut(url) {
      var w = null;
      try { w = window.open(url, '_blank'); } catch (_) { w = null; }
      if (w) { try { w.opener = null; } catch (_) {} return 'tab'; }
      try { window.location.href = url; } catch (_) {}
      return 'same';
    }

    function render(reason) {
      var t = texts(reason);
      var box = document.getElementById('mg-entry-help');
      if (!box) {
        box = document.createElement('div');
        box.id = 'mg-entry-help';
        box.setAttribute('role', 'alertdialog');
        box.addEventListener('click', function (e) {
          var a = e.target && e.target.closest ? e.target.closest('[data-meh]') : null;
          if (!a) return;
          var k = a.getAttribute('data-meh');
          e.preventDefault();
          if (k === 'x') { hide(true); return; }
          openOut(k === 'diag' ? PRECHECK_URL : KAKAO_URL);
        });
        document.body.appendChild(box);
      }
      box.setAttribute('aria-label', t.title);
      box.innerHTML =
        '<button type="button" class="meh-x" data-meh="x" aria-label="' + t.close + '" title="' + t.close + '">×</button>' +
        '<span class="meh-t">' + t.title + '</span>' +
        '<span class="meh-b">' + t.body + '</span>' +
        (t.zh ? '<span class="meh-zh" lang="zh">' + t.zh + '</span>' : '') +
        '<a class="meh-a meh-diag" data-meh="diag" href="' + PRECHECK_URL + '">' + t.diag + '</a>' +
        '<a class="meh-a meh-kakao" data-meh="kakao" href="' + KAKAO_URL + '" rel="noopener">' + t.kakao + '</a>';
      box.hidden = false;
      return box;
    }

    function show(reason) {
      try {
        if (!document.body || isObserver()) return false;
        if (state.dismissed[reason]) return false;      // 그 사유로 사람이 닫았으면 이 페이지에선 다시 안 띄운다
        state.reason = reason;
        ensureStyle();
        render(reason);
        return true;
      } catch (_) { return false; }
    }
    function hide(byUser) {
      try {
        if (byUser && state.reason) state.dismissed[state.reason] = true;
        state.reason = '';
        var box = document.getElementById('mg-entry-help');
        if (box) box.hidden = true;
      } catch (_) {}
    }

    // 언어가 바뀌면 떠 있는 카드만 다시 그린다(관리자 엔진은 document, 공용 엔진은 window 에서 발행).
    function onLang() { if (state.reason) { try { render(state.reason); } catch (_) {} } }
    try { window.addEventListener('mangoi:lang-changed', onLang); document.addEventListener('mangoi:lang-changed', onLang); } catch (_) {}

    /* ⓐ 카메라·마이크 */
    try {
      var origDesc = window.describeMediaError;
      if (typeof origDesc === 'function' && !origDesc.__mehWrapped) {
        window.describeMediaError = function (err) {
          try { state.lastErr = String((err && err.name) || ''); state.lastErrAt = Date.now(); } catch (_) {}
          return origDesc.apply(this, arguments);
        };
        window.describeMediaError.__mehWrapped = true;
      }
    } catch (_) {}
    try {
      var origPh = window.vcShowLocalPlaceholder;
      if (typeof origPh === 'function' && !origPh.__mehWrapped) {
        window.vcShowLocalPlaceholder = function (kind) {
          var r = origPh.apply(this, arguments);
          try {
            var recentDeny = DENY[state.lastErr] === 1 && (Date.now() - state.lastErrAt) < 8000;
            if (kind === 'all-fail' || (kind === 'camera-fail' && recentDeny)) show('media');
          } catch (_) {}
          return r;
        };
        window.vcShowLocalPlaceholder.__mehWrapped = true;
      }
    } catch (_) {}
    try {
      var origAlert = window.alert;
      if (typeof origAlert === 'function' && !origAlert.__mehWrapped) {
        window.alert = function (msg) {
          var r = origAlert.apply(this, arguments);      // 원래 alert 는 그대로 뜬다
          try { if (/마이크가 감지되지 않았습니다/.test(String(msg))) show('media'); } catch (_) {}
          return r;
        };
        window.alert.__mehWrapped = true;
      }
    } catch (_) {}

    /* ⓑ 수업 연결 */
    try {
      var origWs = window.createWebSocket;
      if (typeof origWs === 'function' && !origWs.__mehWrapped) {
        window.createWebSocket = function (path, onMessage, onOpen, onClose) {
          if (!/\/ws\/video-call/.test(String(path || ''))) return origWs.apply(this, arguments);
          var fails = 0, opened = false, stopped = false, timer = null;
          var wOpen = function () {
            opened = true; fails = 0;
            if (timer) { try { clearTimeout(timer); } catch (_) {} timer = null; }
            if (state.reason === 'net') hide(false);
            if (onOpen) return onOpen.apply(this, arguments);
          };
          var wClose = function () {
            var r = onClose ? onClose.apply(this, arguments) : undefined;
            if (!stopped) { fails++; if (fails >= FAIL_N) show('net'); }
            return r;
          };
          var conn = origWs.call(this, path, onMessage, wOpen, wClose);
          try {
            timer = setTimeout(function () { timer = null; if (!opened && !stopped) show('net'); }, OPEN_WAIT_MS);
          } catch (_) {}
          try {
            if (conn && typeof conn.close === 'function') {
              var oc = conn.close;
              conn.close = function () {
                stopped = true;
                if (timer) { try { clearTimeout(timer); } catch (_) {} timer = null; }
                return oc.apply(this, arguments);
              };
            }
          } catch (_) {}
          return conn;
        };
        window.createWebSocket.__mehWrapped = true;
      }
    } catch (_) {}

    window.__mgEntryHelp = { show: show, hide: hide, state: state, texts: texts, openOut: openOut, FAIL_N: FAIL_N, OPEN_WAIT_MS: OPEN_WAIT_MS, PRECHECK_URL: PRECHECK_URL, KAKAO_URL: KAKAO_URL };
  } catch (_) { /* 이 절의 어떤 실패도 입장을 막지 않는다 */ }
})();
/* ENTRY-FAIL-HELP 끝 */
