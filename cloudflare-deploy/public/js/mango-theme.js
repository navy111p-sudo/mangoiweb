/**
 * mango-theme.js — 화상수업 라이트/다크 테마 [초안]
 *  - 한국시간(KST) 기준 자동 전환: 18:00 이전 = 라이트(파스텔), 18:00 이후 = 다크
 *  - 매 분 재평가하여 18시 경계에서 자동으로 바뀜
 *  - 상단 툴바의 ☀/🌙 버튼으로 수동 전환도 가능 (이번 세션 한정, 새로고침하면 자동 복귀)
 *  - mango-theme-light.css 와 짝으로 동작
 */
(function () {
  'use strict';

  var LIGHT_CLASS = 'vc-theme-light';
  var manualOverride = null; // null = 자동(시간 기준), 'light'/'dark' = 이번 세션 수동

  function isLight() { return document.body.classList.contains(LIGHT_CLASS); }

  // 현재 한국시간(KST) '시(0~23)' — 사용자 PC 시간대와 무관하게 계산
  function kstHour() {
    try {
      var s = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul', hour: '2-digit', hourCycle: 'h23'
      }).format(new Date());
      var h = parseInt(s, 10);
      return isNaN(h) ? new Date().getHours() : h;
    } catch (e) { return new Date().getHours(); }
  }

  // 18시 이전 = 라이트, 18시 이후 = 다크
  function autoTheme() { return kstHour() < 18 ? 'light' : 'dark'; }
  function target() { return manualOverride || autoTheme(); }

  var btn;

  function apply(theme) {
    document.body.classList.toggle(LIGHT_CLASS, theme === 'light');
    updateButton();
  }

  function updateButton() {
    if (!btn) return;
    var light = isLight();
    btn.innerHTML = light
      ? '<span style="font-size:15px">🌙</span><span>다크</span>'
      : '<span style="font-size:15px">☀️</span><span>라이트</span>';
    btn.title = (light ? '다크' : '라이트(파스텔)') + ' · 한국시간 18시 기준 자동 전환';
  }

  function refresh() { apply(target()); }

  function toggle() {
    // 수동 전환 → 이번 세션 동안 자동 일시중지
    manualOverride = isLight() ? 'dark' : 'light';
    apply(manualOverride);
  }

  function ensureButton() {
    if (btn && document.body.contains(btn)) return;
    btn = document.createElement('button');
    btn.id = 'mango-theme-toggle';
    btn.type = 'button';
    btn.addEventListener('click', toggle);

    var host = document.querySelector('#view-videocall-call .toolbar-right')
            || document.querySelector('.toolbar-right')
            || document.querySelector('.toolbar');
    if (host) {
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
    updateButton();
  }

  function init() {
    refresh();           // 현재 한국시간 기준 테마 적용
    ensureButton();
    setInterval(ensureButton, 2000); // 뷰 전환 대비 버튼 재확인
    // 매 분 자동 재평가 — 수동 전환 중이 아니면 18:00 경계에서 자동 전환
    setInterval(function () { if (!manualOverride) refresh(); }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 외부 제어용
  window.MangoTheme = {
    toggle: toggle,
    auto: function () { manualOverride = null; refresh(); }, // 자동으로 복귀
    set: function (t) { manualOverride = t; apply(t); },
    get: function () { return isLight() ? 'light' : 'dark'; },
    kstHour: kstHour
  };
})();
