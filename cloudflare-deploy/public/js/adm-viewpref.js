// ═══════════════════════════════════════════════════════════════
// adm-viewpref.js — 관리자 화면 '보기 설정' (ph168, 2026-07-23)
//
// 왜 만들었나 — 필리핀 강사 피드백:
//   "스크롤하는 데 시간이 좀 걸려요. 페이지를 위아래로 움직이려면
//    스크롤을 훨씬 더 많이 해야 돼요."
//
//   실측(1440x900, admin.html)으로 원인을 갈랐다:
//     · 프레임: zoom 1.3 → 53fps / zoom 1 → 52fps  ← 차이 없음. '느린' 게 아니다
//     · 문서 길이: zoom 1.3 → 20,204px(22.4화면) / zoom 1 → 14,652px(16.3화면)
//     → 렉이 아니라 '페이지가 38% 길어진 것'이 원인이었다.
//   추가로, 접을 수 있는 카드 208개 중 32개가 펼쳐진 채로 시작한다.
//
// 그래서 두 가지를 준다. 둘 다 '쓰는 사람이 고르는' 방식이다:
//   ① 화면 배율 100 / 115 / 130%  (기본 130 = 기존과 동일)
//   ② 카드 펼침 상태 기억 + 한 번에 접기
//
// ⚠️ zoom:1.3 은 "글자를 크게" 라는 지시로 들어간 것이라 임의로 빼지 않았다.
//    기본값은 130% 그대로다. 스크롤을 줄이고 싶은 사람만 100% 를 고르면 된다.
// ⚠️ CLAUDE.md: "관리자 PC 확대는 각 페이지에서 zoom:1.3. 공용 CSS로 묶지 말 것"
//    → 배율 '선언'은 각 페이지에 그대로 두고, 이 파일은 사용자 선택만 얹는다.
//       실제 override CSS 도 admin.html 안에 인라인으로 둔다(공용 css 파일 아님).
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var ZOOM_KEY = 'mangoi_admin_zoom';        // '100' | '115' | '130'
  var CARDS_KEY = 'mangoi_admin_cards';      // { "card-xxx": 0|1 }
  var STEPS = ['100', '115', '130'];

  function lang() {
    try {
      if (window.getLang && window.getLang() === 'en') return 'en';
      if (window.adminLang === 'en') return 'en';
      if (document.documentElement.lang === 'en') return 'en';
      if (localStorage.getItem('mangoi_lang') === 'en') return 'en';
    } catch (e) {}
    return 'ko';
  }
  var T = {
    ko: { size: '글자 크기', tip: '화면 배율 — 100%로 낮추면 스크롤이 줄어듭니다',
          collapse: '카드 모두 접기', expand: '카드 모두 펼치기',
          collapseTip: '열려 있는 카드를 모두 접어 페이지를 짧게 만듭니다' },
    en: { size: 'Text size', tip: 'Screen scale — pick 100% to scroll less',
          collapse: 'Collapse all cards', expand: 'Expand all cards',
          collapseTip: 'Collapses every open card so the page gets shorter' }
  };
  function t(k) { return (T[lang()] || T.ko)[k]; }

  function getZoom() {
    try { var v = localStorage.getItem(ZOOM_KEY); if (STEPS.indexOf(v) >= 0) return v; } catch (e) {}
    return '130';
  }
  function setZoom(v) {
    if (STEPS.indexOf(v) < 0) v = '130';
    document.documentElement.setAttribute('data-adm-zoom', v);
    try { localStorage.setItem(ZOOM_KEY, v); } catch (e) {}
    paintZoom();
  }

  // ── ① 배율 컨트롤 ───────────────────────────────────────────
  function buildZoom() {
    var host = document.querySelector('.th-controls');
    if (!host || document.getElementById('vp-zoom')) return;

    var wrap = document.createElement('div');
    wrap.id = 'vp-zoom';
    wrap.setAttribute('role', 'group');
    wrap.title = t('tip');
    wrap.innerHTML = '<span class="vp-lbl"></span>' +
      STEPS.map(function (s) {
        return '<button type="button" class="vp-btn" data-z="' + s + '">' + s + '%</button>';
      }).join('');
    // 사용자 메뉴(#topUserBtn) 앞에 넣는다 — 언어 토글 옆이라 찾기 쉽다
    var user = host.querySelector('#topUserBtn');
    if (user) host.insertBefore(wrap, user); else host.appendChild(wrap);

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('.vp-btn');
      if (b) setZoom(b.getAttribute('data-z'));
    });
    paintZoom();
  }
  function paintZoom() {
    var wrap = document.getElementById('vp-zoom');
    if (!wrap) return;
    var cur = getZoom();
    var lbl = wrap.querySelector('.vp-lbl');
    if (lbl) lbl.textContent = t('size');
    wrap.title = t('tip');
    wrap.querySelectorAll('.vp-btn').forEach(function (b) {
      var on = b.getAttribute('data-z') === cur;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // ── ② 카드 펼침 상태 ────────────────────────────────────────
  function readCards() {
    try { return JSON.parse(localStorage.getItem(CARDS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeCards(m) {
    try { localStorage.setItem(CARDS_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function cardList() {
    return [].slice.call(document.querySelectorAll('details[id]'));
  }
  // 저장된 상태를 화면에 되살린다. 저장된 적 없는 카드는 HTML 기본값 그대로 둔다.
  function restoreCards() {
    var m = readCards(), n = 0;
    cardList().forEach(function (d) {
      var v = m[d.id];
      if (v === 0 || v === 1) { d.open = (v === 1); n++; }
    });
    return n;
  }
  function watchCards() {
    document.addEventListener('toggle', function (e) {
      var d = e.target;
      if (!d || d.tagName !== 'DETAILS' || !d.id) return;
      var m = readCards();
      m[d.id] = d.open ? 1 : 0;
      writeCards(m);
    }, true);   // toggle 은 버블링하지 않는다 → capture 로 받는다
  }
  function setAll(open) {
    var m = readCards();
    cardList().forEach(function (d) { d.open = open; m[d.id] = open ? 1 : 0; });
    writeCards(m);
    paintCollapse();
  }
  function openCount() {
    return cardList().filter(function (d) { return d.open; }).length;
  }
  function buildCollapse() {
    var host = document.querySelector('.th-controls');
    if (!host || document.getElementById('vp-collapse')) return;
    var b = document.createElement('button');
    b.id = 'vp-collapse';
    b.type = 'button';
    b.className = 'th-btn th-btn-ghost';
    var user = host.querySelector('#topUserBtn');
    if (user) host.insertBefore(b, user); else host.appendChild(b);
    b.addEventListener('click', function () { setAll(openCount() === 0); });
    paintCollapse();
  }
  function paintCollapse() {
    var b = document.getElementById('vp-collapse');
    if (!b) return;
    var allClosed = openCount() === 0;
    b.textContent = (allClosed ? '▾ ' : '▴ ') + (allClosed ? t('expand') : t('collapse'));
    b.title = t('collapseTip');
  }

  function init() {
    buildZoom();
    buildCollapse();
    restoreCards();
    watchCards();
    paintCollapse();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 900);          // 헤더를 늦게 그리는 스크립트 대비
  setTimeout(function () { restoreCards(); paintCollapse(); }, 1800);
  // 언어 전환 시 라벨 갱신
  document.addEventListener('mangoi:lang-changed', function () { paintZoom(); paintCollapse(); });

  window.admSetZoom = setZoom;    // 콘솔/외부에서 쓸 수 있게
})();
