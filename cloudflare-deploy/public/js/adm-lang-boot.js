/*!
 * adm-lang-boot.js — 관리자·강사 화면 "언어 부팅" (2026-07-23)
 * ════════════════════════════════════════════════════════════════════════
 * 사장님 지시: "필리핀 쪽 선생·매니저는 아이디/비번 넣으면 **처음부터 영어**로.
 *              관리자 페이지도 매니저 페이지도 전부."
 *
 * 왜 만들었나 — 2026-07-22 에 넣은 영어 부팅 코드가 admin.html **한 장에만**
 * 인라인으로 들어가 있었다. 그래서 왼쪽 메뉴에서 하위 페이지(급여·마이페이지·
 * 강사정산·주간스케줄…)로 넘어가는 순간 100% 한국어로 돌아갔다. 강사는 로그인하면
 * /admin/mypage 로 바로 가므로 **영어를 아예 못 봤다.**
 * → 판정 로직을 이 파일 하나로 모으고, 관리자·강사 화면 전부가 이걸 읽는다.
 *   (고칠 일이 생기면 여기만 고치면 된다. 인라인 복사본을 다시 만들지 말 것.)
 *
 * ⚠️ 반드시 <head> 안, i18n-sweep.js 보다 **먼저**, **defer 없이** 넣을 것.
 *    첫 페인트 전에 <html lang> 과 window.adminLang 이 정해져야 한글이 깜빡이지 않는다.
 *
 * 판정 순서 (위에서 걸리면 아래는 안 본다)
 *   ① 사용자가 KO/EN 버튼을 직접 누른 적 있음(mangoi_lang_by==='user') → 그 선택 절대 존중
 *   ② 서버가 계정에 정해 준 언어 (admin_account.pref_lang → 로그인 응답 → 세션)
 *   ③ 계정 이름에 한글이 없다 → en   (Maimai, Melca, Karl, Teacher Len …)
 *   ④ 강사 계정(role 에 teacher)인데 이름을 모르겠다 → en
 *        └ 강사 대부분이 필리핀. 이름 칸이 비었거나 '교사' 처럼 한글로 심긴 계정
 *          (hq_t_001) 때문에 한국어로 떨어지던 것을 여기서 막는다.
 *          한국인 강사는 EN/KO 를 한 번 누르면 ①로 잡혀 계속 한국어로 뜬다.
 *   ⑤ 그 외 → ko
 *
 * 예전 admin.html 인라인 판정의 결함 2개도 여기서 같이 고쳤다.
 *   - 로그인 전에 이 코드가 돌면 이름이 없어 'ko' 를 localStorage 에 **영구 저장**해
 *     버렸다. 그 뒤로는 "저장값이 있다"는 이유로 자동판정을 영영 건너뛰었다.
 *     → 이제 by!=='user' 인 저장값은 언제든 다시 판정해서 덮어쓴다.
 *   - 세션이 없으면(=로그인 전) 아무것도 저장하지 않는다.
 */
(function () {
  'use strict';

  function hasKo(s) { return /[가-힣]/.test(String(s || '')); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var sess = {};
  try { sess = JSON.parse(get('mangoi_admin_session') || '{}') || {}; } catch (e) { sess = {}; }
  var loggedIn = !!(sess && sess.uid);

  var saved = get('mangoi_lang');
  var by = get('mangoi_lang_by');
  var L;

  // ⚠️ "사용자가 직접 고름"은 **그 계정에 한해서만** 유효하다.
  //   `mangoi_lang_uid` 는 그 선택을 한 계정. 지금 로그인한 계정이 다르면 남의 선택이므로 무시한다.
  //   (login.html 은 처음부터 이 규칙이었는데 여기서 빠뜨렸다 → 예전에 아무 계정으로든 EN/KO 를
  //    한 번 누른 브라우저에서는 그 값이 Maimai 같은 해외 계정까지 영구히 덮어썼다. 2026-07-23)
  //   uid 기록이 아예 없는 옛 브라우저도 '남의 선택'으로 본다 — 누가 골랐는지 알 수 없기 때문.
  var byUid = get('mangoi_lang_uid');
  var userPick = (by === 'user') && (!loggedIn || (byUid && byUid === sess.uid));

  if (userPick && (saved === 'en' || saved === 'ko')) {
    L = saved;                                     // ① 이 계정에서 사용자가 직접 고른 값
  } else if (sess.pref_lang === 'en' || sess.pref_lang === 'ko') {
    L = sess.pref_lang;                            // ② 서버가 계정에 정해 준 값
    if (saved !== L) set('mangoi_lang', L);
    set('mangoi_lang_by', 'auto');
    set('mangoi_lang_uid', String(sess.uid || ''));
  } else if (loggedIn) {
    var nm = String(sess.name || '');
    var isTeacher = /teacher/i.test(String(sess.role || ''));
    if (nm && nm !== sess.uid && !hasKo(nm)) L = 'en';   // ③ 영문 이름
    else if (isTeacher) L = 'en';                        // ④ 강사 = 기본 영어
    else L = 'ko';                                       // ⑤
    if (saved !== L) set('mangoi_lang', L);
    set('mangoi_lang_by', 'auto');
    set('mangoi_lang_uid', String(sess.uid || ''));
  } else {
    // 로그인 전 — 저장값이 있으면 그대로 쓰되, 아무것도 새로 저장하지 않는다.
    L = (saved === 'en') ? 'en' : 'ko';
  }

  window.__ADM_BOOT_LANG = (L === 'en') ? 'en' : 'ko';

  // 🌐 window.adminLang — 화면 곳곳(`window.adminLang === 'en'` 30여 곳)이 이 값을 본다.
  //    2026-07-22 이전에는 아무 데서도 대입되지 않아 항상 undefined 였다.
  window.adminLang = window.__ADM_BOOT_LANG;
  try {
    new MutationObserver(function () {
      var l = document.documentElement.lang;
      if (l === 'en' || l === 'ko') window.adminLang = l;
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    window.addEventListener('storage', function (ev) {
      if (ev.key === 'mangoi_lang' && (ev.newValue === 'en' || ev.newValue === 'ko')) window.adminLang = ev.newValue;
    });
  } catch (e) {}

  // ── 🌐 KO/EN 미니 토글 — 자기 토글이 없는 화면에만 붙인다 ──
  //   관리자 하위 페이지 12장(경영진·헬스·리텐션·강사정산·teacher-*)에는 언어 버튼이 아예 없다.
  //   영어로 뜨는 건 됐는데 한국어로 돌아올 방법이 없으면 한국 직원이 갇힌다.
  //   이미 버튼이 있는 화면(mypage·salary·ghost-view…)에는 붙이지 않는다 — 두 개가 되면 헷갈린다.
  function mountMiniToggle() {
    try {
      if (document.getElementById('adm-lang-mini')) return;
      if (document.getElementById('mangoi-global-bar')) return;      // mango-i18n 이 만든 바
      if (document.getElementById('admin-lang-label')) return;       // admin.html 자체 토글
      // 페이지가 자기 토글을 이미 가지고 있으면(형태가 제각각이라 후보를 넉넉히 잡는다) 붙이지 않는다
      if (document.querySelector('[data-mangoi-lang-toggle], .lang-label-sync, .lang-toggle, #lang-toggle, #langBtn, [onclick*="toggleLang"]')) return;
      if (!document.body) return;
      var cur = (document.documentElement.lang === 'en') ? 'en' : 'ko';
      var b = document.createElement('button');
      b.id = 'adm-lang-mini';
      b.type = 'button';
      b.title = '언어 전환 / Switch language';
      b.textContent = '🌐 ' + (cur === 'en' ? 'KO' : 'EN');   // 🌐 = 다음에 바뀔 언어를 표시
      b.style.cssText = 'position:fixed;top:14px;right:14px;z-index:9990;padding:7px 13px;'
        + 'border:0;border-radius:99px;cursor:pointer;font:800 12.5px/1 system-ui,sans-serif;'
        + 'background:#f59e0b;color:#1a1a1a;box-shadow:0 4px 14px -2px rgba(0,0,0,.35)';
      b.onclick = function () {
        var next = (document.documentElement.lang === 'en') ? 'ko' : 'en';
        set('mangoi_lang', next);
        set('mangoi_lang_by', 'user');          // 사람이 고른 선택 = 자동판정보다 우선
        set('mangoi_lang_uid', String(sess.uid || ''));   // 단, 이 계정에 한해서만
        location.reload();                      // 사전 복원까지 확실하게 — 화면이 섞이지 않는다
      };
      document.body.appendChild(b);
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountMiniToggle);
  else mountMiniToggle();

  if (window.__ADM_BOOT_LANG !== 'en') return;

  try { document.documentElement.lang = 'en'; } catch (e) {}

  // 첫 스윕이 끝날 때까지 본문을 감춰 한글 깜빡임 제거.
  //  ⚠️ 스타일을 못 넣으면(head 아직 없음 등) 감추지도 말 것 — 영영 안 보이는 화면이 된다.
  var gated = false;
  try {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (head && !document.getElementById('adm-en-boot-gate')) {
      var st = document.createElement('style');
      st.id = 'adm-en-boot-gate';
      st.textContent = 'html.adm-en-pending body{visibility:hidden !important}';
      head.appendChild(st);
    }
    if (head) { document.documentElement.classList.add('adm-en-pending'); gated = true; }
  } catch (e) { gated = false; }

  var done = false;
  window.__admEnReady = function () {
    if (done) return; done = true;
    try { document.documentElement.classList.remove('adm-en-pending'); } catch (e) {}
  };
  if (!gated) { window.__admEnReady(); return; }
  setTimeout(window.__admEnReady, 1200);          // 안전장치 — 스윕이 늦어도 화면은 뜬다
  window.addEventListener('load', window.__admEnReady);
})();
