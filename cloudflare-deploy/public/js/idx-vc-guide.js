/* idx-vc-guide.js — 수업 입장 시 «사용법 안내» 창 (2026-09-24 사장님 지시)
 * ─────────────────────────────────────────────────────────────────────────────
 * [지시] 수업에 들어가면 선생님은 선생님용, 학생은 학생용 사용법이 «가장 먼저» 뜨게.
 *        언제든 다시 볼 수 있게 「❓ 사용법」 버튼도.
 *
 * [무엇을 하나]
 *   ・수업 화면(view-videocall-call)으로 들어가는 순간, 역할이 정해지길 최대 약 6초 기다렸다가
 *     선생님·관리자(vcIsStaffNow) → 선생님용 / 그 밖 → 학생용 안내 창을 띄운다.
 *   ・참관(Ghost, body.vc-observer)에게는 «자동으로» 띄우지 않는다(버튼으로는 볼 수 있음).
 *   ・「다음부터 자동으로 열지 않기」를 고르면 그 기기에서는 자동으로 안 뜬다(❓ 버튼은 남음).
 *   ・❓ 버튼: PC 는 방 이름 줄(회의방 버튼 옆), 휴대폰 세로는 맨 위 통합바(#mg-unibar) 안.
 *
 * [모양] 사장님이 보내신 예시와 같은 «한 장짜리 번호 그림» (2026-09-24 두 번째 지시 —
 *   글과 아이콘으로 된 첫 판은 «원한 게 아니다»). 선생님 얼굴은 서양인(/img/lily-wide.webp),
 *   학생 얼굴은 동양인(/img/mei-closed.webp) 을 그림 안에 넣었다. 선생님용은 영어가 기본.
 *   그림은 창을 열 때만 받는다(첫 화면 무게 0).
 *
 * ⚠️ 첫 화면 예산 때문에 반드시 defer. index.html 에는 <script defer> 한 줄만 둔다.
 * ⛔ body class 를 지켜보는 MutationObserver·상주 setInterval 금지(홈이 멎은 전력 2회).
 *    수업 화면으로 «전환하는 순간»(showView)에만 짧게, 끝이 있는 확인을 한다.
 * ⛔ 버튼에 data-ko/data-en 을 달지 말 것 — i18n 엔진이 textContent 를 갈아끼운다.
 */
(function () {
  'use strict';
  if (window.__mgVcGuideReady) return;
  window.__mgVcGuideReady = true;

  var OFF_KEY = 'mangoi_vcguide_off_v1';
  var BTN_PC = 'vc-guide-btn';
  var BTN_M = 'vc-guide-btn-m';
  var OV_ID = 'vc-guide-ov';
  var shownThisEntry = false;

  function isKo() {
    try {
      if (typeof window.getLang === 'function') return window.getLang() !== 'en';
      return (localStorage.getItem('mangoi_lang') || 'ko') !== 'en';
    } catch (e) { return true; }
  }
  function autoOff() { try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; } }
  function setAutoOff(v) { try { if (v) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch (e) {} }
  function inCall() { return document.body.classList.contains('vc-in-call'); }
  function isObserver() { return window.vcMyRole === 'observer' || document.body.classList.contains('vc-observer'); }
  function isStaff() {
    try { return typeof window.vcIsStaffNow === 'function' && !!window.vcIsStaffNow(); } catch (e) { return false; }
  }
  function roleKnown() {
    var r = window.vcMyRole;
    return r === 'teacher' || r === 'admin' || r === 'student' || r === 'observer' || isStaff();
  }

  /* ── 한 장짜리 사용법 그림 ──
   * 실제 수업 화면(PC 1280×800)을 찍어 번호를 매긴 그림 네 장.
   * 만드는 곳: docs/수업화면_사용법그림_소스/build.mjs (화면이 바뀌면 그것을 다시 돌린다).
   * 기본 언어: 선생님 = 영어(필리핀·중국 선생님), 학생 = 한국어. 창 안에서 바꿀 수 있다.
   * ⛔ 그림 주소를 바꾸지 말 것 — 같은 이름으로 갈아끼우면 이 파일의 ?v= 와 IMG_V 를 함께 올린다. */
  var IMG_V = '2';
  function imgSrc(who, lang) { return '/img/vc-guide/' + who + '-' + lang + '.webp?v=' + IMG_V; }
  function defLang(who) { return who === 'teacher' ? 'en' : 'ko'; }
  /* 선생님용을 띄울지 — 역할 정본만 본다(vcIsStudentNow → vcIsStaffNow).
   * ⛔ 관리자 세션(mangoi_admin_session)으로 «선생님용» 을 띄우지 말 것 — 2026-09-24 첫 판이 그렇게 했다가
   *    사장님이 «학생으로» 입장했는데 선생님용이 떴다(사장님 제보). 학생으로 들어왔으면 학생용이 맞다.
   * ⚠️ 이 판정은 «어느 그림을 먼저 보여 주나» 에만 쓴다. 권한 판정에 쓰지 말 것. */
  function wantsTeacher() {
    try { if (typeof window.vcIsStudentNow === 'function' && window.vcIsStudentNow()) return false; } catch (e) {}
    var r = window.vcMyRole;
    if (r === 'student' || r === 'observer') return false;
    return isStaff();
  }
  function myWho() { return wantsTeacher() ? 'teacher' : 'student'; }

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.id = 'vc-guide-style';
    s.textContent = [
      /* 화면 전체를 덮는다(2026-09-25 사장님 «글자가 잘 안 보여 화면 전체 커버하게») */
      '#' + OV_ID + '{position:fixed;inset:0;z-index:2147483001;background:#0f172a;display:flex;box-sizing:border-box;}',
      '#' + OV_ID + ' .vg-card{background:#ffffff;color:#101828;width:100%;height:100%;height:100dvh;',
      '  display:flex;flex-direction:column;',
      '  font-family:inherit;line-height:1.4;overflow:hidden;}',
      '#' + OV_ID + ' .vg-head{display:flex;align-items:center;gap:8px;padding:10px 12px;flex:0 0 auto;flex-wrap:wrap;',
      '  border-bottom:1px solid #eef2f6;}',
      '#' + OV_ID + ' .vg-title{font-size:16px;font-weight:800;flex:1 1 auto;min-width:0;}',
      '#' + OV_ID + ' .vg-grp{display:flex;gap:4px;flex:0 0 auto;}',
      '#' + OV_ID + ' .vg-tab{border:1px solid #cbd5e1;background:#fff;color:#344054;border-radius:999px;',
      '  padding:5px 12px;font-size:13px;font-weight:700;cursor:pointer;}',
      '#' + OV_ID + ' .vg-tab.on{background:#b45309;border-color:#b45309;color:#fff;}',
      '#' + OV_ID + ' .vg-x{border:0;background:#f1f5f9;color:#101828;width:34px;height:34px;border-radius:999px;',
      '  font-size:17px;cursor:pointer;flex:0 0 auto;}',
      '#' + OV_ID + ' .vg-body{overflow:auto;min-height:0;flex:1 1 auto;background:#0f172a;}',
      '#' + OV_ID + ' .vg-img{display:block;width:100%;height:100%;object-fit:contain;cursor:zoom-in;}',
      '#' + OV_ID + ' .vg-body.zoom .vg-img{width:2000px;height:auto;max-width:none;cursor:zoom-out;}',
      '#' + OV_ID + ' .vg-foot{display:flex;align-items:center;gap:10px;padding:8px 12px 10px;border-top:1px solid #eef2f6;',
      '  flex:0 0 auto;flex-wrap:wrap;}',
      '#' + OV_ID + ' .vg-off{font-size:13px;color:#475467;display:flex;align-items:center;gap:6px;flex:1 1 auto;cursor:pointer;}',
      '#' + OV_ID + ' .vg-hint{font-size:12px;color:#667085;flex:0 0 auto;}',
      '#' + OV_ID + ' .vg-ok{border:0;background:#b45309;color:#fff;font-weight:800;font-size:15px;border-radius:12px;',
      '  padding:9px 22px;cursor:pointer;flex:0 0 auto;}',
      '#' + BTN_PC + '{margin-left:6px;padding:3px 9px;border-radius:999px;cursor:pointer;background:rgba(56,189,248,.14);',
      '  border:1px solid rgba(56,189,248,.45);color:#38bdf8;font-size:11.5px;font-weight:700;line-height:1.7;',
      '  white-space:nowrap;flex:0 0 auto;}',
      '#' + BTN_M + '{display:none;border:1px solid rgba(56,189,248,.5);background:rgba(56,189,248,.16);color:#38bdf8;',
      '  width:22px;height:22px;min-width:22px;border-radius:999px;font-size:12px;font-weight:800;padding:0;',
      '  line-height:20px;cursor:pointer;flex:0 0 auto;}',
      '@media (max-width:920px) and (orientation:portrait){#' + BTN_M + '{display:inline-block;}}'
    ].join('\n');
    document.body.appendChild(s);   // head 가 아니라 body — index.html body <style> 에게 지지 않게
  }

  /* 창 안의 글자는 «그림의 언어» 를 따른다(선생님은 영어 그림 = 영어 글자). */
  function render(ov, who, lang) {
    ov.__who = who; ov.__lang = lang;
    var ko = lang === 'ko';
    var im = ov.querySelector('.vg-img'), src = imgSrc(who, lang);
    if (im.getAttribute('src') !== src) im.setAttribute('src', src);
    im.alt = ko ? (who === 'teacher' ? '선생님 수업화면 사용법' : '학생 수업화면 사용법')
                : (who === 'teacher' ? 'Teacher class screen guide' : 'Student class screen guide');
    ov.querySelector('.vg-title').textContent = ko
      ? (who === 'teacher' ? '선생님 수업화면 사용법' : '학생 수업화면 사용법')
      : (who === 'teacher' ? 'Teacher class screen — how to use' : 'Student class screen — how to use');
    var tabs = ov.querySelectorAll('.vg-tab');
    for (var i = 0; i < tabs.length; i++) {
      var w = tabs[i].getAttribute('data-who'), l = tabs[i].getAttribute('data-lang');
      var on = w ? (w === who) : (l === lang);
      tabs[i].className = 'vg-tab' + (on ? ' on' : '');
      if (w) tabs[i].textContent = w === 'teacher' ? (ko ? '선생님용' : 'Teacher') : (ko ? '학생용' : 'Student');
    }
    ov.querySelector('.vg-hint').textContent = ko ? '그림을 누르면 크게 보여요' : 'Tap the picture to zoom';
    ov.querySelector('.vg-offtxt').textContent = ko ? '다음부터 자동으로 열지 않기 (❓ 버튼으로 다시 볼 수 있어요)'
                                                    : 'Don’t open automatically next time (use ❓ to see it again)';
    ov.querySelector('.vg-ok').textContent = ko ? '알겠어요' : 'Got it';
    var x = ov.querySelector('.vg-x');
    x.title = ko ? '닫기' : 'Close';
    x.setAttribute('aria-label', x.title);
  }

  function close() {
    var ov = document.getElementById(OV_ID);
    if (!ov) return;
    try { setAutoOff(!!ov.querySelector('.vg-offchk').checked); } catch (e) {}
    ov.parentNode.removeChild(ov);
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(who, lang) {
    injectStyle();
    lang = lang || defLang(who);
    var old = document.getElementById(OV_ID);
    if (old) { render(old, who, lang); return; }
    var ov = document.createElement('div');
    ov.id = OV_ID;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="vg-card">' +
        '<div class="vg-head"><div class="vg-title"></div>' +
          '<div class="vg-grp"><button type="button" class="vg-tab" data-who="teacher"></button>' +
          '<button type="button" class="vg-tab" data-who="student"></button></div>' +
          '<div class="vg-grp"><button type="button" class="vg-tab" data-lang="en">EN</button>' +
          '<button type="button" class="vg-tab" data-lang="ko">한국어</button></div>' +
          '<button type="button" class="vg-x">✕</button></div>' +
        '<div class="vg-body"><img class="vg-img" alt="" width="2000" height="1006" decoding="async"></div>' +
        '<div class="vg-foot"><label class="vg-off"><input type="checkbox" class="vg-offchk"><span class="vg-offtxt"></span></label>' +
        '<span class="vg-hint"></span><button type="button" class="vg-ok"></button></div>' +
      '</div>';
    ov.querySelector('.vg-offchk').checked = autoOff();
    ov.addEventListener('click', function (e) {
      var t = e.target;
      if (t === ov || (t.closest && (t.closest('.vg-x') || t.closest('.vg-ok')))) { close(); return; }
      if (t.classList && t.classList.contains('vg-img')) { t.parentNode.classList.toggle('zoom'); return; }
      var tab = t.closest && t.closest('.vg-tab');
      if (!tab) return;
      var w = tab.getAttribute('data-who'), l = tab.getAttribute('data-lang');
      ov.__touched = true;
      if (w) render(ov, w, ov.__lang);          // 역할을 바꿔도 지금 고른 언어는 그대로
      else if (l) render(ov, ov.__who, l);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    render(ov, who, lang);
  }
  function openForMe() { open(myWho()); }
  window.mgOpenVcGuide = openForMe;

  function btnLabel(b, mobile) {
    var ko = isKo();
    b.textContent = mobile ? '?' : ('❓ ' + (ko ? '사용법' : 'Help'));
    b.title = ko ? '수업 화면 사용법 보기' : 'How to use the class screen';
    b.setAttribute('aria-label', b.title);
  }
  function mountButtons() {
    injectStyle();
    try {
      var info = document.getElementById('vc-room-info');
      var left = info && info.parentNode;
      if (left && !document.getElementById(BTN_PC)) {
        var b = document.createElement('button');
        b.id = BTN_PC; b.type = 'button'; btnLabel(b, false);
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openForMe(); });
        var meet = document.getElementById('vc-meet-btn');
        if (meet && meet.parentNode === left) left.insertBefore(b, meet.nextSibling);
        else left.appendChild(b);
      }
      var uni = document.querySelector('#mg-unibar .uni-info');
      if (uni && !document.getElementById(BTN_M)) {
        var m = document.createElement('button');
        m.id = BTN_M; m.type = 'button'; btnLabel(m, true);
        m.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openForMe(); });
        uni.appendChild(m);
      }
    } catch (e) {}
  }
  function relabel() {
    var b = document.getElementById(BTN_PC); if (b) btnLabel(b, false);
    var m = document.getElementById(BTN_M); if (m) btnLabel(m, true);
  }

  /* 수업 화면에 들어간 순간부터 끝이 있는 확인(최대 약 8초) */
  function onEnter() {
    var n = 0;
    var t = setInterval(function () {
      n++;
      if (!inCall()) { if (n > 16) clearInterval(t); return; }
      mountButtons();
      /* 자동으로 연 뒤 역할이 늦게 바로잡히면(학생 ↔ 선생님) 사람이 탭을 누르기 전까지 따라간다 */
      var ov = document.getElementById(OV_ID);
      if (ov && ov.__auto && !ov.__touched && ov.__who !== myWho()) { var w2 = myWho(); render(ov, w2, defLang(w2)); }
      if (shownThisEntry || isObserver() || autoOff()) {
        if (document.getElementById(BTN_PC) && document.getElementById(BTN_M) && !(ov && ov.__auto && !ov.__touched)) clearInterval(t);
        if (n > 16) clearInterval(t);
        return;
      }
      if (roleKnown() || n >= 12) {           // 역할이 정해졌거나 약 6초가 지났으면
        shownThisEntry = true;
        openForMe();
        var ov2 = document.getElementById(OV_ID); if (ov2) ov2.__auto = true;
      }
      if (n > 16) clearInterval(t);
    }, 500);
  }

  function boot() {
    try {
      var orig = window.showView;
      if (typeof orig === 'function' && !orig.__vcGuideWrapped) {
        window.showView = function (id) {
          var r = orig.apply(this, arguments);
          try {
            if (id === 'view-videocall-call') onEnter();
            else { shownThisEntry = false; close(); }
          } catch (e) {}
          return r;
        };
        window.showView.__vcGuideWrapped = true;
      }
    } catch (e) {}
    ['mangoi:langchange', 'mangoi:lang-changed'].forEach(function (ev) {
      try { window.addEventListener(ev, relabel); document.addEventListener(ev, relabel); } catch (e) {}
    });
    if (inCall()) onEnter();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
