/**
 * mango-theme.js — 화상수업 화면 라이트/다크 테마 토글 [초안]
 *  - 토글 버튼(☀/🌙)을 수업 상단 툴바(#view-videocall-call .toolbar-right)에 주입
 *  - 클릭 시 body 에 'vc-theme-light' 클래스 on/off
 *  - 선택값은 localStorage('mango-theme')에 저장 → 다음에도 유지
 *  - 기본값: 다크 (저장값 없으면 다크)
 *  - mango-theme-light.css 와 짝으로 동작
 */
(function () {
  'use strict';

  var KEY = 'mango-theme';           // 'light' | 'dark'
  var LIGHT_CLASS = 'vc-theme-light';

  function isLight() {
    return document.body.classList.contains(LIGHT_CLASS);
  }

  function apply(theme) {
    var light = (theme === 'light');
    document.body.classList.toggle(LIGHT_CLASS, light);
    updateButton(light);
  }

  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* 무시 */ }
  }

  function load() {
    try { return localStorage.getItem(KEY) || 'dark'; } catch (e) { return 'dark'; }
  }

  function toggle() {
    var next = isLight() ? 'dark' : 'light';
    apply(next);
    save(next);
  }

  var btn;

  function updateButton(light) {
    if (!btn) return;
    // 라이트일 때는 "다크로 전환" 안내(🌙), 다크일 때는 "라이트로 전환"(☀)
    btn.innerHTML = light
      ? '<span style="font-size:15px">🌙</span><span>다크</span>'
      : '<span style="font-size:15px">☀️</span><span>라이트</span>';
    btn.title = light ? '다크 테마로 전환' : '라이트(파스텔) 테마로 전환';
  }

  function ensureButton() {
    if (btn && document.body.contains(btn)) return;
    btn = document.createElement('button');
    btn.id = 'mango-theme-toggle';
    btn.type = 'button';
    btn.addEventListener('click', toggle);

    // 수업(다자간) 뷰의 상단 툴바 우측을 정확히 지정.
    //  - DOM 에 .toolbar-right 가 여러 개(안 쓰는 1:1 테스트 뷰 포함) 있어,
    //    반드시 #view-videocall-call 안의 것을 골라야 함.
    var host = document.querySelector('#view-videocall-call .toolbar-right')
            || document.querySelector('.toolbar-right')
            || document.querySelector('.toolbar');
    if (host) {
      // 나가기(✕, .danger) 버튼 '앞'에 삽입 → [EN][테마][✕] 순서.
      //  (first-child 로 넣으면 body.vc-in-call .toolbar-right>button:first-child{display:none} 에 걸려 숨겨짐)
      var exitBtn = host.querySelector('.danger, [id*="exit"], [onclick*="Leave"]');
      if (exitBtn) host.insertBefore(btn, exitBtn);
      else host.appendChild(btn);
    } else {
      btn.style.position = 'fixed';
      btn.style.top = '12px';
      btn.style.right = '170px';
      btn.style.zIndex = '9999';
      document.body.appendChild(btn);
    }
    updateButton(isLight());
  }

  function init() {
    apply(load());   // 저장된 테마 반영 (기본 다크)
    ensureButton();
    // 뷰 전환(SPA)으로 툴바가 늦게 그려질 수 있어, 잠시 재확인
    setInterval(ensureButton, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 외부에서 수동 제어용
  window.MangoTheme = {
    toggle: toggle,
    set: function (t) { apply(t); save(t); },
    get: function () { return isLight() ? 'light' : 'dark'; }
  };
})();
