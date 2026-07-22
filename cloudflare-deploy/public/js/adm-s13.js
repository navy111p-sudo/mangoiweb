// ═══════════════════════════════════════════════════════════════
// adm-s13.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  // 회색/네이비 계열의 "어두운" 배경인지 (채도 낮음 → 버튼/컬러칩 제외)
  function isDarkGray(str){
    var m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return false;
    var r=+m[1], g=+m[2], b=+m[3], a=(m[4]!==undefined)?+m[4]:1;
    if (a < 0.28) return false;
    var avg=(r+g+b)/3, sat=Math.max(r,g,b)-Math.min(r,g,b);
    return avg < 150 && sat < 130;   // 네이비/차콜/슬레이트 패널 (#0f172a, #1e293b, #1e3a8a 등)
  }
  var EXCLUDE = 'button,a,.badge,.ph85-head,.ph85-classroom,.ph86-action-btn,[class*="btn"],[class*="chip"],[class*="pill"],[class*="tag"],[class*="bar"],[class*="fill"],[class*="badge"],.hub-icon,.hub-card,.kpi-tile,.kpi-tile *,.kpi-icon,svg,svg *,img,input,textarea,select,option';

  /* 🎨 (2026-07-22) 페인터 팔레트를 톤별로 분리.
     data-admin-tone="slate" 면 시원한 회청색으로, 없으면 기존 아이보리(크림)로 칠한다.
     인라인 !important 라 CSS 로는 못 이기므로 여기서 색을 갈라줘야 한다. */
  var PALETTE = {
    ivory: { panel:'linear-gradient(135deg,#fbf8f1,#f4f0ff)', text:'#3a352c', border:'rgba(150,120,70,0.18)',
             inputBg:'#ffffff', inputBorder:'rgba(150,120,70,0.3)' },
    slate: { panel:'linear-gradient(135deg,#ffffff,#f2f6fc)', text:'#101828', border:'rgba(15,23,42,0.10)',
             inputBg:'#ffffff', inputBorder:'rgba(15,23,42,0.16)' }
  };
  function pal(){
    return PALETTE[document.documentElement.getAttribute('data-admin-tone')] || PALETTE.ivory;
  }

  /* ── 어두운 면 위의 진한 글자 구제 (2026-07-22) ──────────────────────────
     밝은 테마는 카드 안 글자를 일괄로 진하게 만든다. 그런데 버튼·배지·표 헤더처럼
     '색이 의도된' 면은 배경을 밝게 바꾸지 않으므로(EXCLUDE 대상), 그 위 글자만
     진해져서 남색 위 진한 글자 = 안 보임이 된다.
     배경을 못 바꾸는 면은 반대로 글자를 밝게 하는 게 맞다. */
  function rgbOf(str){
    var m = String(str).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]+([\d.]+))?\s*\)/);
    if (!m) return null;
    var a = (m[4] !== undefined) ? +m[4] : 1;
    if (a < 0.5) return null;
    return { r:+m[1], g:+m[2], b:+m[3] };
  }
  function lumOf(c){
    var f = function(v){ v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
  }
  function contrast(a, b){
    var l1 = lumOf(a), l2 = lumOf(b);
    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
  }
  function ownBgOf(el){
    var cs = window.getComputedStyle(el);
    var c = rgbOf(cs.backgroundColor);
    if (!c) {
      var bi = cs.backgroundImage;
      if (!bi || bi === 'none') return null;
      c = rgbOf(bi);
      if (!c) return null;
    }
    return c;
  }
  function fixTextOnDark(card){
    /* 카드 자신이 색면인 경우도 포함해야 한다 — querySelectorAll('*') 은 자신을 빼므로
       그 안의 글자가 통째로 구제 대상에서 빠지던 버그가 있었다(26-07-22). */
    var list = [card].concat(Array.prototype.slice.call(card.querySelectorAll('*')));
    list.forEach(function(el){
      if (el.__ivTx) return;
      var bg = ownBgOf(el);
      if (!bg) return;
      var wantLight = lumOf(bg) < 0.4;   /* 어두운 면 → 밝은 글자 / 밝은 면 → 진한 글자 */
      el.__ivTx = true;
      var targets = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
      targets.forEach(function(t){
        if (t !== el && ownBgOf(t)) return;             /* 자체 배경이 또 있으면 그쪽 차례에 처리 */
        var fg = rgbOf(window.getComputedStyle(t).color);
        if (!fg || contrast(fg, bg) >= 3) return;      /* 이미 읽히면 그대로 둔다 */
        /* ⚠️ 색을 칠한 '그 요소'에 표시를 남겨야 한다. 부모에만 남기면 다크로 되돌릴 때
           이 인라인 색이 안 지워져 다크 배경 위에 진한 글자가 박힌다(26-07-22 실측 382건). */
        t.__ivTxC = true;
        t.style.setProperty('color', wantLight ? '#f8fafc' : '#101828', 'important');
      });
    });
  }
  function ivoryLighten(root){
    if (document.documentElement.getAttribute('data-admin-theme') !== 'ivory') {
      /* 🌙 (2026-07-08) 다크로 돌아왔을 때 정리:
         ivory 페인터가 칠했던 인라인 스타일(밝은 그라데이션·글자·테두리)을 제거해
         CSS 다크 규칙이 다시 살아나게 한다. 이 정리가 없으면 ivory→dark 전환 시
         표 헤더 등이 새하얗게 '박혀' 남는다(학생 목록 표가 밝게 뜨던 원인).
         ※ applyAdminColor 가 __ivLit 플래그를 먼저 지우므로, 플래그가 아니라
           페인터가 남긴 '서명 값'(밝은 그라데이션 251,248,241 / 글자 58,53,44)으로 판별. */
      document.querySelectorAll('[id^="card-"] *').forEach(function(el){
        var st = el.style; if (!st || !st.length) return;
        var bg = ((st.getPropertyValue('background') || st.getPropertyValue('background-image')) + '').replace(/\s+/g, '');
        var col = (st.getPropertyValue('color') + '').replace(/\s+/g, '');
        var painted =
          bg.indexOf('251,248,241') >= 0 || bg.indexOf('fbf8f1') >= 0 ||          /* 아이보리 헤더/박스 페인트 */
          bg.indexOf('242,246,252') >= 0 || bg.indexOf('f2f6fc') >= 0 ||          /* 슬레이트 헤더/박스 페인트 (26-07-22) */
          ((col === 'rgb(58,53,44)' || col === 'rgb(16,24,40)') &&                /* 입력창 페인트 (아이보리/슬레이트) */
           (bg.indexOf('rgb(255,255,255)') >= 0 || bg.indexOf('#ffffff') >= 0));
        if (painted || el.__ivLit || el.__ivLitIn || el.__ivTx || el.__ivTxC) {
          st.removeProperty('background');
          st.removeProperty('color');
          st.removeProperty('border-color');
          el.__ivLit = false; el.__ivLitIn = false; el.__ivTx = false; el.__ivTxC = false;
        }
      });
      return;
    }
    /* root 를 주면 그 카드만 다시 칠한다(카드 펼침 시 부분 재칠 — 전체 재스캔 회피) */
    var cards = root ? [root] : document.querySelectorAll('[id^="card-"]');
    Array.prototype.forEach.call(cards, function(card){
      card.querySelectorAll('*').forEach(function(el){
        if (el.__ivLit) return;
        if (el.matches(EXCLUDE)) return;
        if (el.closest('#admin-theme-wrap') || el.closest('button') || el.closest('a')) return;
        var cs = window.getComputedStyle(el);
        var hit = isDarkGray(cs.backgroundColor);
        if (!hit) {
          var bi = cs.backgroundImage;
          if (bi && bi !== 'none') {
            var stops = bi.match(/rgba?\([^)]*\)/g);
            if (stops && stops.some(isDarkGray) && stops.every(function(c){ return isDarkGray(c) || /,\s*0(\.0+)?\)/.test(c); })) hit = true;
          }
        }
        if (hit) {
          el.__ivLit = true;
          var p = pal();
          el.style.setProperty('background', p.panel, 'important');
          el.style.setProperty('color', p.text, 'important');
          el.style.setProperty('border-color', p.border, 'important');
        }
      });
      // 입력창은 흰 배경 + 진한 글자
      card.querySelectorAll('input, textarea, select').forEach(function(el){
        if (el.type === 'checkbox' || el.type === 'radio' || el.__ivLitIn) return;
        el.__ivLitIn = true;
        var p = pal();
        el.style.setProperty('background', p.inputBg, 'important');
        el.style.setProperty('color', p.text, 'important');
        el.style.setProperty('border-color', p.inputBorder, 'important');
      });
      /* 배경을 못 바꾼 어두운 면(버튼·배지·표 헤더)은 반대로 글자를 밝게 */
      fixTextOnDark(card);
    });
  }
  window.__ivoryLighten = ivoryLighten;   /* 🎨 즉시 테마 전환에서 호출 (현재 '어둡게' 단일 고정이라 사실상 미사용) */
  // ⚡ (2026-07-18) 관리자 테마 '어둡게' 단일 고정 후, 이 ivory 페인터를 1.5초 인터벌 + 전역
  //   MutationObserver 로 '영원히' 돌리던 것을 제거. data-admin-theme 이 항상 'dark' 라 매번
  //   '정리 분기'만 타며 카드 전체 하위요소를 재스캔(리플로우)하던 순수 오버헤드였음(버벅임 잔여 원인).
  //   과거 ivory 잔여 인라인 정리를 위해 로드 시 1회만 실행(신규 로드엔 정리할 것도 없어 즉시 반환).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ ivoryLighten(); });
  else ivoryLighten();

  /* 🎨 (2026-07-22) 카드를 펼칠 때 그 카드만 다시 칠한다.
     이유: 카드 내용 상당수가 펼침 시점에 JS 로 그려지는데, 그 마크업엔 남색 배경이
     인라인(style=)으로 박혀 있다. 밝은 테마에선 글자만 진해져 '남색 위 진한 글자'가
     되어 안 보인다. 로드 시 1회 페인트로는 이 늦게 생긴 내용을 못 잡는다.
     ⚠️ 과거의 1.5초 인터벌 + 전역 MutationObserver 방식은 성능 문제로 제거됐다(26-07-18).
        되살리지 말 것 — 아래처럼 '사용자가 펼친 카드 하나'만, 그 순간에만 칠한다. */
  /* 로드 후 JS 로 그려지는 카드(권한 표·학생 목록 등)는 위 1회 페인트를 놓친다.
     → 1.5초 뒤 '딱 한 번' 더 훑는다. ⚠️ 과거의 1.5초 '반복' 인터벌과 다르다.
        반복으로 되돌리지 말 것(26-07-18 성능 문제의 원인이었다). */
  setTimeout(function(){
    if (document.documentElement.getAttribute('data-admin-theme') === 'ivory') ivoryLighten();
  }, 1500);

  document.addEventListener('toggle', function(e){
    var card = e.target;
    if (!card || !card.open || !card.id || card.id.indexOf('card-') !== 0) return;
    if (document.documentElement.getAttribute('data-admin-theme') !== 'ivory') return;
    setTimeout(function(){ ivoryLighten(card); }, 60);   /* 렌더 직후 */
  }, true);

  /* 🎨 즉시(새로고침 없이) 밝게↔어둡게 전환 — 페인터가 칠한 인라인 스타일을 즉시 다시 칠함 */
  window.applyAdminColor = function(theme){
    /* 'slate' = 밝은 테마(ivory CSS) + 시원한 톤. 'ivory' = 기존 크림 톤. 'dark' = 다크. */
    if (theme !== 'ivory' && theme !== 'dark' && theme !== 'slate') theme = 'slate';
    var base = (theme === 'dark') ? 'dark' : 'ivory';
    document.documentElement.setAttribute('data-admin-theme', base);
    if (theme === 'slate') document.documentElement.setAttribute('data-admin-tone', 'slate');
    else document.documentElement.removeAttribute('data-admin-tone');
    try { localStorage.setItem('mangoi_admin_theme', theme); } catch(e){}
    /* 페인트 플래그 초기화 → 페인터가 다시 처리하도록 */
    try {
      document.querySelectorAll('[id^="card-"] *').forEach(function(el){
        el.__ivLit = false; el.__ivLitIn = false; el.__ph103 = false; el.__ph105 = false;
      });
    } catch(e){}
    if (base === 'ivory') {          /* ivory·slate 공통 — 밝은 테마 페인터만 돌린다 */
      if (window.__ivoryLighten) window.__ivoryLighten();
    } else {
      /* __ivoryLighten() 을 다크에서 호출하면 즉시-정리 브랜치가 돌아
         ivory 페인터 잔여 인라인을 바로 제거(전환 즉시 표 헤더 등 다크 복귀) */
      if (window.__ivoryLighten) window.__ivoryLighten();
      if (window.__ph103Run) window.__ph103Run();
      if (window.__ph105Run) window.__ph105Run();
    }
    if (window.__refreshThemeLabel) window.__refreshThemeLabel();
  };
})();
