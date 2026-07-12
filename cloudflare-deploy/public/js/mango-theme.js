/**
 * mango-theme.js — 화상수업 라이트/다크 테마 [초안]
 *  - 한국시간(KST) 기준 자동 전환: 18:00 이전 = 라이트(파스텔), 18:00 이후 = 다크
 *  - 매 분 재평가하여 18시 경계에서 자동으로 바뀜
 *  - 상단 툴바의 ☀/🌙 버튼으로 수동 전환 가능 → localStorage 에 저장되어 다음 접속에도 유지되고,
 *    수동 선택이 있으면 시간 자동규칙보다 '항상 우선'한다. (자동으로 되돌리려면 MangoTheme.auto())
 *  - mango-theme-light.css 와 짝으로 동작
 */
(function () {
  'use strict';

  var LIGHT_CLASS = 'vc-theme-light';
  var LS_KEY = 'mango_theme_manual';   // 수동 선택 저장 키 ('light'/'dark'). 있으면 자동보다 우선
  // null = 자동(18시 기준 시간규칙). 저장된 수동 선택이 있으면 불러와 우선 적용.
  var manualOverride = null;
  try { var _saved = localStorage.getItem(LS_KEY); if (_saved === 'light' || _saved === 'dark') manualOverride = _saved; } catch (e) {}
  // 수동 선택을 localStorage 에 저장/삭제 (null 이면 삭제 = 자동으로 복귀)
  function persistManual() {
    try { if (manualOverride) localStorage.setItem(LS_KEY, manualOverride); else localStorage.removeItem(LS_KEY); } catch (e) {}
  }

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

  // 현재 언어 (mango-i18n.js 의 getLang 연동 — 없으면 ko)
  function lang() {
    try { if (typeof window.getLang === 'function' && window.getLang() === 'en') return 'en'; } catch (e) {}
    return 'ko';
  }

  function updateButton() {
    if (!btn) return;
    var light = isLight();
    var en = lang() === 'en';
    var darkLabel = en ? 'Dark' : '다크';
    var lightLabel = en ? 'Light' : '라이트';
    btn.innerHTML = light
      ? '<span style="font-size:15px">🌙</span><span>' + darkLabel + '</span>'
      : '<span style="font-size:15px">☀️</span><span>' + lightLabel + '</span>';
    btn.title = en
      ? (light ? 'Dark' : 'Light (pastel)') + ' · auto-switches at 6 PM KST'
      : (light ? '다크' : '라이트(파스텔)') + ' · 한국시간 18시 기준 자동 전환';
  }

  function refresh() { apply(target()); }

  function toggle() {
    // 수동 전환 → localStorage 에 저장(자동 시간규칙보다 우선, 다음 접속에도 유지)
    manualOverride = isLight() ? 'dark' : 'light';
    persistManual();
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
    // 🌐 언어 전환 시 버튼 라벨(다크/라이트 ↔ Dark/Light) 즉시 갱신
    window.addEventListener('mangoi:lang-changed', updateButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 외부 제어용
  window.MangoTheme = {
    toggle: toggle,
    auto: function () { manualOverride = null; persistManual(); refresh(); }, // 자동(18시 시간규칙)으로 복귀
    set: function (t) { manualOverride = t; persistManual(); apply(t); },
    get: function () { return isLight() ? 'light' : 'dark'; },
    isManual: function () { return !!manualOverride; },
    kstHour: kstHour
  };
})();
