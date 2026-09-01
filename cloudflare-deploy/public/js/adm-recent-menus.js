// ═══════════════════════════════════════════════════════════════════════════
// adm-recent-menus.js — 🕘 최근 본 메뉴 5개 (2026-08-16 사장님 지시)
//
//   왜 —
//     「자주 쓰는 기능」 10개는 **모두에게 같은 목록**이다(많이 누른 순으로 정렬되긴 한다).
//     그런데 사람마다 그날 하는 일이 다르다. 급여 정산하는 날은 급여만, 신학기에는
//     수강신청만 하루 종일 오간다. 그런 «지금 내가 오가는 메뉴» 를 스스로 기억해 준다.
//     새로 배울 것이 없다 — 쓰다 보면 알아서 생긴다.
//
//   어디서 기록하나 — «메뉴 항목이 실제로 눌린 순간» 한 곳
//     사이드바 항목 `[data-ia6-item]` 의 클릭만 본다. 이 한 곳이면 충분한 이유는,
//     이 화면의 모든 이동 경로가 결국 여기로 모이기 때문이다 —
//       · 사이드바에서 직접 누른 경우                → 그 자체
//       · ⚡자주 쓰는 기능 타일 → window.ph161Go()   → jumpToMenu()
//       · 검색·AI·다른 카드에서 점프                → jumpToMenu()
//     그리고 adm-ia6.js 가 scrollIntoView 를 가로채서, 감춰진 카드로 가는 점프를
//     `#ph85-sidebar [data-ia6-item][data-card=…]` 의 click() 으로 바꿔 준다.
//     (그 파일 wireRevealOnJump 참조 — 그래서 여기 한 곳만 봐도 다 잡힌다.)
//
//   다시 갈 때 —
//     저장해 둔 항목의 **사이드바 원본 요소를 그대로 click()** 한다.
//     새 이동 코드를 만들지 않는다 — 드로어 닫기·카드 필터·맨 위 맞추기가 이미 그 경로에
//     다 들어 있고, 우리가 흉내 내면 그 셋 중 하나를 반드시 빠뜨린다.
//     (이 «원본을 눌러 준다» 방식은 adm-ia6.js 가 이미 쓰는, 검증된 길이다.)
//
//   가볍게 —
//     · 반복 타이머 0개. MutationObserver 0개. 부팅 시 네트워크 0건.
//     · 클릭 받는 곳은 window 캡처 1개(항목 기록) + 상자 1개(칩 클릭) 뿐이다.
//     · 화면은 «바뀔 때만» 다시 그린다(서명 비교).
//
//   ⚠️ 기록이 없으면 상자를 아예 감춘다. 처음 쓰는 사람에게 빈 상자를 보이지 않는다.
//   ⚠️ 라벨은 data-ko/data-en 을 그대로 옮겨 담는다. 화면에서 글자를 긁어오면
//      adm-s10.js 가 붙인 «설명 한 줄»(.sb-mtip-inline)까지 딸려 온다.
//   ⚠️ data-ko/data-en 은 **글자만 담은 <span>** 에 붙인다. 바깥 div 에 붙이면
//      adm-core 의 applyAdminLangDom() 이 textContent 를 통째로 갈아치우면서
//      안의 아이콘(SVG)이 지워진다(adm-quick-access.js 가 같은 함정을 적어 두었다).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__admRecent) return;
  window.__admRecent = 1;

  var LS  = 'mangoi_recent_menus';
  var MAX = 5;

  /* 🌐 언어 판정 — 정본은 window.adminLang (adm-lang-boot.js 가 정하고, adm-core.js 의
     `var adminLang` 이 같은 바인딩이라 KO/EN 토글까지 따라온다. 저장 키는 mangoi_lang).
     ⚠️ 예전엔 localStorage 'adminLang' 을 읽었는데 그 키는 **아무도 저장하지 않는 죽은 키**라
        EN 스태프에게도 늘 한국어였다(2026-08-27 수리). ⛔ 그 키에 쓰는 방식으로 되살리지 말 것. */
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
  }
  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(LS) || '[]');
      return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
    } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(LS, JSON.stringify(list)); } catch (e) { /* 사파리 시크릿 등 — 무시 */ }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 기록 ──────────────────────────────────────────────────────────────── */
  function record(el) {
    var k = el.getAttribute('data-ia6-item');
    if (!k) return;
    var ko = el.getAttribute('data-ko') || '';
    var en = el.getAttribute('data-en') || ko;
    if (!ko && !en) return;

    var list = load(), i;
    for (i = list.length - 1; i >= 0; i--) if (list[i] && list[i].k === k) list.splice(i, 1);
    list.unshift({ k: k, ko: ko, en: en });
    if (list.length > MAX) list.length = MAX;
    save(list);
    render();
  }

  window.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var it = t.closest('#ph85-sidebar [data-ia6-item]');
    if (it) record(it);
  }, true);

  /* ── 그리기 ────────────────────────────────────────────────────────────── */
  var lastSig = '';

  function render() {
    var box = document.getElementById('ph164-recent');
    if (!box) return;
    var items = document.getElementById('ph164-recent-items');
    if (!items) return;

    var list = load(), en = isEn();
    var sig = (en ? 'en|' : 'ko|') + list.map(function (r) { return r.k; }).join(',');
    if (sig === lastSig) return;
    lastSig = sig;

    // 기록이 없으면 상자를 통째로 감춘다 (처음 쓰는 사람에게 빈 상자를 안 보인다)
    if (!list.length) { box.classList.add('ph164-empty'); items.innerHTML = ''; return; }
    box.classList.remove('ph164-empty');

    var html = '', i;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<button type="button" class="ph164-chip" data-k="' + esc(r.k) + '">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"'
            + ' stroke-linecap="round" stroke-linejoin="round" width="13" height="13"'
            + ' style="flex:none" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
            + '<span data-ko="' + esc(r.ko) + '" data-en="' + esc(r.en) + '">'
            + esc(en ? r.en : r.ko) + '</span></button>';
    }
    items.innerHTML = html;
  }

  /* ── 다시 가기 — 사이드바 원본을 눌러 준다 ───────────────────────────────── */
  function go(k) {
    /* 🔁 (2026-09-01) 항목 이름을 바꾸면 저장된 키가 미아가 되어 **눌러도 아무 데도 안 가고
       칩만 지워졌다.** 사이드바의 이사표(adm-ia6.js 의 RENAMED)를 거쳐 찾는다.
       ⚠️ 아직 안 실렸으면 원래 키 그대로 — 옛 동작으로 안전하게 떨어진다. */
    try { if (window.mangoiIA6 && window.mangoiIA6.renameKey) k = window.mangoiIA6.renameKey(k); } catch (e) {}
    var el = document.querySelector('#ph85-sidebar [data-ia6-item="' + k.replace(/"/g, '\\"') + '"]');
    if (el) { el.click(); return; }
    /* 항목이 사라졌다면(권한 변경·메뉴 개편) 조용히 목록에서 지운다.
       «눌렀는데 아무 일도 안 일어남» 을 남기지 않는다. */
    var list = load().filter(function (r) { return r.k !== k; });
    save(list); lastSig = ''; render();
  }

  function boot() {
    var items = document.getElementById('ph164-recent-items');
    if (!items) { setTimeout(boot, 400); return; }
    if (items.__bound) return;
    items.__bound = 1;
    items.addEventListener('click', function (e) {
      var c = e.target && e.target.closest && e.target.closest('.ph164-chip');
      if (!c) return;
      e.preventDefault();
      go(c.getAttribute('data-k'));
    });
    render();
    /* 🌐 언어를 바꾸면 라벨을 다시 그린다. adm-core 의 applyAdminLangDom() 이
       [data-ko] 를 훑어 갈아치우므로 사실 그대로 두어도 되지만, 다른 탭에서 바꾼 경우
       (storage 이벤트)는 그 함수가 안 돌아서 여기서 직접 다시 그린다. */
    try {
      window.addEventListener('storage', function (e) {
        if (e && e.key === 'adminLang') { lastSig = ''; render(); }
      });
    } catch (e) { /* 무시 */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
