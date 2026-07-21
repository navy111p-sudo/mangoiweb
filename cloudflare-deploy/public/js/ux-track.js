/* 📊 ux-track.js — 기능 사용률 측정 (2026-07-21, 크몽 회의 결정 "좋은 기능도 안 쓰이면 소용없다")
   목적: 어떤 메뉴·버튼이 실제로 쓰이는지 집계 → 홈 개편·기능 정리를 데이터로 결정.
   사용: <script src="/js/ux-track.js?v=1" defer></script> 한 줄만. (페이지 로직 무수정)
   동작: ① 페이지 열람 1회 기록 ② [data-ux] 클릭 자동 기록 ③ 아래 SELECTOR_MAP 클릭 자동 기록
        ④ 학습 페이지로 가는 링크(a[href]) 자동 기록 ⑤ 12초 배칭 + 이탈 시 sendBeacon
   원칙: 어떤 오류도 삼킨다 — 수업·학습 흐름에 절대 영향 금지. 개인 식별 아닌 집계 용도. */
(function () {
  'use strict';
  var API = '/api/games/ux-track';
  var queue = Object.create(null);
  var timer = null;

  function uid() {
    try {
      var u = localStorage.getItem('mangoi_uid');
      if (u) return u;
      var raw = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      if (raw && raw.uid) return String(raw.uid);
    } catch (e) {}
    return 'guest';
  }

  function pageKey() {
    try {
      var p = (location.pathname.split('/').pop() || 'index.html').replace(/\.html?$/, '');
      return p || 'index';
    } catch (e) { return 'page'; }
  }

  function hit(k, n) {
    try {
      k = String(k || '').slice(0, 80);
      if (!k) return;
      queue[k] = (queue[k] || 0) + (n || 1);
      if (!timer) timer = setTimeout(flush, 12000);
    } catch (e) {}
  }

  function flush(useBeacon) {
    try {
      if (timer) { clearTimeout(timer); timer = null; }
      var keys = Object.keys(queue);
      if (!keys.length) return;
      var events = keys.map(function (k) { return { k: k, n: queue[k] }; });
      queue = Object.create(null);
      var payload = JSON.stringify({ user_id: uid(), events: events });
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(API, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  /* 중요 요소 → 키 매핑 (index.html 등 기존 마크업 무수정 추적) */
  var SELECTOR_MAP = [
    ['.cta-enter',            'home:enter-class'],
    ['.cta-pay',              'home:ai-friends'],
    ['.gm-card',              null],  /* 홈 학습 메뉴 카드 — id 나 텍스트로 키 생성 */
    ['.ncc-join',             'home:join-next-class']
  ];
  /* 학습 페이지 링크 자동 추적 대상 */
  var PAGE_LINKS = ['ai-friend', 'student-games', 'warmup', 'vocab', 'judgment', 'speech-coach',
    'review-quiz', 'micro-quiz', 'streak', 'ai-write', 'battle-3d', 'student-game', 'english-mastery-suite', 'suspect-mystery'];

  function keyFor(el) {
    try {
      var dux = el.closest && el.closest('[data-ux]');
      if (dux) return 'ux:' + dux.getAttribute('data-ux');
      for (var i = 0; i < SELECTOR_MAP.length; i++) {
        var m = el.closest && el.closest(SELECTOR_MAP[i][0]);
        if (m) {
          if (SELECTOR_MAP[i][1]) return SELECTOR_MAP[i][1];
          var label = m.id || m.getAttribute('data-ko') || (m.textContent || '').trim().slice(0, 24);
          return 'menu:' + String(label).replace(/\s+/g, '-').slice(0, 40);
        }
      }
      var a = el.closest && el.closest('a[href]');
      if (a) {
        var href = a.getAttribute('href') || '';
        for (var j = 0; j < PAGE_LINKS.length; j++) {
          if (href.indexOf(PAGE_LINKS[j]) !== -1) {
            var base = (href.split('/').pop() || '').split('?')[0].replace(/\.html?$/, '');
            return 'nav:' + (base || PAGE_LINKS[j]);
          }
        }
      }
    } catch (e) {}
    return null;
  }

  try {
    document.addEventListener('click', function (ev) {
      try {
        var k = keyFor(ev.target);
        if (k) hit(k);
      } catch (e) {}
    }, true);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush(true);
    });
    hit('pv:' + pageKey());
    window.UXT = { hit: hit, flush: flush };
  } catch (e) {}
})();
