// ═══════════════════════════════════════════════════════════════
// adm-quickmenu.js — 📌 자주 쓰는 메뉴 / 🕘 최근 사용  (2026-08-04 신규)
//
//   왜 만들었나 —
//     본사 계정이 보는 최상위 메뉴가 88개다. 직원이 기능을 못 찾는 이유는
//     기능이 없어서가 아니라 88개 중에서 찾지 못해서였다.
//
//   왜 «카드 통합» 이 아니라 이 방식인가 —
//     겉보기에 중복인 카드들(자료실 5개, 리포트 5개 …)은 사실
//     adm-core.js 의 CARD_POLICY / PERMS 에서 **역할별 접근권한을 따로 들고 있다.**
//     (예: 강사는 관리자 자료실 ❌, 지사는 대리점 자료실 ❌)
//     즉 이 시스템에서는 «카드 하나 = 권한 단위» 다. 합치면 권한 경계가 무너진다.
//     그래서 카드는 그대로 두고, 찾는 길만 짧게 만든다.
//
//   설계 원칙 —
//     · <summary> 를 건드리지 않는다 → 사이드바 인덱스(buildMenuIndex)·i18n 을 오염시키지 않음
//     · 역할별 숨김(_applyMenuVisibility)이 끝난 뒤에 보이는 카드만 대상으로 삼는다
//     · 서버 변경 0 (localStorage 만 사용)
//     · 라벨 한/영 병기
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var PIN_KEY = 'mangoi_admin_pins';
  var REC_KEY = 'mangoi_admin_recent';
  var MAX_RECENT = 6;
  var MAX_PIN = 8;

  function isEn() {
    try {
      if (window.adminLang) return String(window.adminLang) === 'en';
      return document.documentElement.getAttribute('data-lang') === 'en';
    } catch (e) { return false; }
  }
  function load(k) {
    try { var v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  // 카드가 지금 이 계정에게 보이는가 (역할별 숨김 반영)
  function visible(el) {
    if (!el) return false;
    // 🔐 (2026-08-18) 역할 숨김 표시가 «.rbac-hide» 클래스로 바뀌었다.
    //   ⚠️ getComputedStyle 만으로는 못 잡는다 — #legacy-cards 복구 규칙(display:block !important)이
    //      이겨서 감춘 카드도 'block' 으로 나온다. 클래스를 먼저 본다.
    // ⚠️ 이 파일은 adm-core.js 보다 «먼저» 로드된다(defer 라 실행은 core 가 먼저 끝나지만,
    //    순서가 바뀌어도 죽지 않도록 없을 때의 대비를 남긴다).
    if (window.mangoiCardHidden) { if (window.mangoiCardHidden(el)) return false; }
    else if (el.classList && (el.classList.contains('rbac-hide') ||
                              el.classList.contains('ph118-card-hidden'))) return false;
    if (el.style && el.style.display === 'none') return false;
    try { if (getComputedStyle(el).display === 'none') return false; } catch (e) { }
    return true;
  }

  // 카드 라벨 — data-menu-label-* 우선, 없으면 summary 텍스트
  function labelOf(el) {
    var en = isEn();
    var a = el.getAttribute(en ? 'data-menu-label-en' : 'data-menu-label-ko');
    if (a) return a;
    var s = el.querySelector(':scope > summary');
    if (!s) return el.id;
    var sp = s.querySelector('[data-ko],[data-en]');
    if (sp) {
      var v = sp.getAttribute(en ? 'data-en' : 'data-ko');
      if (v) return v;
    }
    return (s.textContent || el.id).trim().slice(0, 28);
  }

  function cards() {
    return Array.prototype.slice.call(document.querySelectorAll('details.menu-card'))
      .filter(function (el) { return el.id && visible(el); });
  }
  function byId(id) { var e = document.getElementById(id); return (e && visible(e)) ? e : null; }

  function jump(id) {
    var el = byId(id);
    if (!el) return;
    try { el.open = true; } catch (e) { }
    setTimeout(function () {
      /* 🎯 (2026-08-08) smooth → auto. 이 저장소의 확립된 규칙이다 —
         「오른쪽이 왔다갔다 움직여 정신없다」(사장님)로 admin.html·adm-quick-access 는 이미
         auto 로 바꿨는데 이 파일만 남아 있었다. 숨은 탭에서는 smooth 가 애니메이션을 못 돌려
         «아예 안 움직이는» 결과가 되기도 한다. 되돌리지 말 것. */
      try { el.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) { }
    }, 60);
  }

  window.qmTogglePin = function (id) {
    var pins = load(PIN_KEY);
    var i = pins.indexOf(id);
    if (i >= 0) pins.splice(i, 1);
    else { pins.unshift(id); pins = pins.slice(0, MAX_PIN); }
    save(PIN_KEY, pins);
    render();
  };
  window.qmJump = function (id) { jump(id); };

  function chip(id, label, pinned) {
    var en = isEn();
    return '<span class="qm-chip' + (pinned ? ' qm-pinned' : '') + '">'
      + '<button type="button" class="qm-go" onclick="qmJump(\'' + esc(id) + '\')" title="' + esc(label) + '">'
      + esc(label) + '</button>'
      + '<button type="button" class="qm-pin" onclick="qmTogglePin(\'' + esc(id) + '\')" '
      + 'title="' + (pinned ? (en ? 'Unpin' : '고정 해제') : (en ? 'Pin to top' : '위에 고정')) + '" '
      + 'aria-label="' + (pinned ? (en ? 'Unpin' : '고정 해제') : (en ? 'Pin' : '고정')) + '">'
      + (pinned ? '✕' : '📌') + '</button>'
      + '</span>';
  }

  function render() {
    var bar = document.getElementById('quick-menu-bar');
    if (!bar) return;
    var en = isEn();

    // 숨겨진(권한 없는) 카드는 목록에서 스스로 떨어져 나간다
    var pins = load(PIN_KEY).filter(byId);
    var recent = load(REC_KEY).filter(function (id) { return byId(id) && pins.indexOf(id) < 0; }).slice(0, MAX_RECENT);

    if (!pins.length && !recent.length) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    bar.style.display = '';

    var h = '<div class="qm-inner">';
    if (pins.length) {
      h += '<span class="qm-lb">📌 ' + (en ? 'Pinned' : '자주 쓰는 메뉴') + '</span>';
      pins.forEach(function (id) { h += chip(id, labelOf(byId(id)), true); });
    }
    if (recent.length) {
      h += '<span class="qm-lb qm-lb2">🕘 ' + (en ? 'Recent' : '최근 사용') + '</span>';
      recent.forEach(function (id) { h += chip(id, labelOf(byId(id)), false); });
    }
    h += '</div>';
    bar.innerHTML = h;
  }

  // 카드를 펼치면 «최근 사용» 에 기록 (사용자가 따로 설정할 필요 없음)
  function trackOpens() {
    document.addEventListener('toggle', function (e) {
      var el = e.target;
      if (!el || el.tagName !== 'DETAILS') return;
      if (!el.classList || !el.classList.contains('menu-card')) return;
      if (!el.open || !el.id) return;
      var rec = load(REC_KEY).filter(function (x) { return x !== el.id; });
      rec.unshift(el.id);
      save(REC_KEY, rec.slice(0, MAX_RECENT * 2));
      render();
    }, true);   // details 의 toggle 은 버블링하지 않아 캡처 단계에서 받는다
  }

  function injectCss() {
    if (document.getElementById('qm-css')) return;
    var s = document.createElement('style');
    s.id = 'qm-css';
    // 아이보리·다크 두 테마에서 모두 읽히도록 반투명 파랑 계열로 통일.
    // (인라인 색을 쓰는 테마 페인터가 나중에 덮지 못하도록 !important)
    s.textContent = [
      '#quick-menu-bar{margin:0 0 14px}',
      '#quick-menu-bar .qm-inner{display:flex;flex-wrap:wrap;gap:6px;align-items:center;',
      '  padding:10px 12px;border:1px solid rgba(59,130,246,.30)!important;border-radius:12px;',
      '  background:rgba(59,130,246,.08)!important}',
      '#quick-menu-bar .qm-lb{font-size:11.5px;font-weight:800;color:#2563eb!important;',
      '  letter-spacing:.2px;margin-right:2px;white-space:nowrap}',
      '#quick-menu-bar .qm-lb2{margin-left:8px}',
      '#quick-menu-bar .qm-chip{display:inline-flex;align-items:center;border-radius:99px;overflow:hidden;',
      '  border:1px solid rgba(59,130,246,.35)!important;background:rgba(255,255,255,.72)!important}',
      '#quick-menu-bar .qm-chip.qm-pinned{background:rgba(59,130,246,.18)!important}',
      '#quick-menu-bar .qm-go{border:0;background:transparent;cursor:pointer;font-family:inherit;',
      '  font-size:12px;font-weight:700;color:#1d4ed8!important;padding:5px 4px 5px 11px;max-width:200px;',
      '  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#quick-menu-bar .qm-pin{border:0;background:transparent;cursor:pointer;font-size:10.5px;',
      '  padding:5px 9px 5px 5px;color:#64748b!important;line-height:1}',
      '#quick-menu-bar .qm-go:hover{text-decoration:underline}',
      '@media(max-width:640px){#quick-menu-bar .qm-go{max-width:118px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function boot() {
    injectCss();
    trackOpens();
    // 역할별 숨김(_applyMenuVisibility)은 DOMContentLoaded 후 약 100ms 뒤에 돈다.
    // 그보다 늦게 그려야 «권한 없는 카드» 가 칩으로 남지 않는다.
    setTimeout(render, 500);
    setTimeout(render, 1500);   // 세션 확인이 느린 경우 대비 한 번 더
    // 언어 전환 시 라벨 갱신
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('[onclick*="toggleAdminLang"],[data-lang-toggle]')) setTimeout(render, 120);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
