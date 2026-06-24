/**
 * mango-theme.js — 화상수업 화면 라이트/다크 테마 토글 [초안]
 *  - 토글 버튼(☀/🌙)을 상단 툴바(.toolbar-right)에 주입
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
    if (btn) return;
    btn = document.createElement('button');
    btn.id = 'mango-theme-toggle';
    btn.type = 'button';
    btn.addEventListener('click', toggle);

    // 상단 툴바 우측에 넣기 (없으면 좌측, 그것도 없으면 body 상단 고정)
    var host = document.querySelector('.toolbar-right')
            || document.querySelector('.toolbar-left')
            || document.querySelector('.toolbar');
    if (host) {
      host.insertBefore(btn, host.firstChild);
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
