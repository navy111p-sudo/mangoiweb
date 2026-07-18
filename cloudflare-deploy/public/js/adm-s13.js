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
  function ivoryLighten(){
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
          bg.indexOf('251,248,241') >= 0 || bg.indexOf('fbf8f1') >= 0 ||          /* 헤더/박스 페인트 */
          (col === 'rgb(58,53,44)' && (bg.indexOf('rgb(255,255,255)') >= 0 || bg.indexOf('#ffffff') >= 0)); /* 입력창 페인트 */
        if (painted || el.__ivLit || el.__ivLitIn) {
          st.removeProperty('background');
          st.removeProperty('color');
          st.removeProperty('border-color');
          el.__ivLit = false; el.__ivLitIn = false;
        }
      });
      return;
    }
    document.querySelectorAll('[id^="card-"]').forEach(function(card){
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
          el.style.setProperty('background', 'linear-gradient(135deg,#fbf8f1,#f4f0ff)', 'important');
          el.style.setProperty('color', '#3a352c', 'important');
          el.style.setProperty('border-color', 'rgba(150,120,70,0.18)', 'important');
        }
      });
      // 입력창은 흰 배경 + 진한 글자
      card.querySelectorAll('input, textarea, select').forEach(function(el){
        if (el.type === 'checkbox' || el.type === 'radio' || el.__ivLitIn) return;
        el.__ivLitIn = true;
        el.style.setProperty('background', '#ffffff', 'important');
        el.style.setProperty('color', '#3a352c', 'important');
        el.style.setProperty('border-color', 'rgba(150,120,70,0.3)', 'important');
      });
    });
  }
  window.__ivoryLighten = ivoryLighten;   /* 🎨 즉시 테마 전환에서 호출 (현재 '어둡게' 단일 고정이라 사실상 미사용) */
  // ⚡ (2026-07-18) 관리자 테마 '어둡게' 단일 고정 후, 이 ivory 페인터를 1.5초 인터벌 + 전역
  //   MutationObserver 로 '영원히' 돌리던 것을 제거. data-admin-theme 이 항상 'dark' 라 매번
  //   '정리 분기'만 타며 카드 전체 하위요소를 재스캔(리플로우)하던 순수 오버헤드였음(버벅임 잔여 원인).
  //   과거 ivory 잔여 인라인 정리를 위해 로드 시 1회만 실행(신규 로드엔 정리할 것도 없어 즉시 반환).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ivoryLighten);
  else ivoryLighten();

  /* 🎨 즉시(새로고침 없이) 밝게↔어둡게 전환 — 페인터가 칠한 인라인 스타일을 즉시 다시 칠함 */
  window.applyAdminColor = function(theme){
    if (theme !== 'ivory' && theme !== 'dark') theme = 'dark';
    document.documentElement.setAttribute('data-admin-theme', theme);
    try { localStorage.setItem('mangoi_admin_theme', theme); } catch(e){}
    /* 페인트 플래그 초기화 → 페인터가 다시 처리하도록 */
    try {
      document.querySelectorAll('[id^="card-"] *').forEach(function(el){
        el.__ivLit = false; el.__ivLitIn = false; el.__ph103 = false; el.__ph105 = false;
      });
    } catch(e){}
    if (theme === 'ivory') {
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
