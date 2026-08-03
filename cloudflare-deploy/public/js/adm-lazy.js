// ═══════════════════════════════════════════════════════════════
// adm-lazy.js — 카드를 «펼칠 때» 그 카드의 스크립트만 불러온다 (2026-08-04)
//
//   왜 —
//     관리자 첫 화면이 스크립트 87개를 한꺼번에 받는다. 직원이 실제로 여는 카드는 보통 3~5개인데
//     나머지 80여 개의 코드까지 전부 내려받고 해석한다. 필리핀 회선에서 특히 부담.
//
//   무엇만 미루나 (아주 보수적으로) —
//     정적 분석으로 «그 스크립트가 만드는 전역 이름이 자기 카드 밖에서 전혀 안 쓰이는» 것만 골랐다.
//     adm-core.js 처럼 어디서나 쓰이는 것, 부트 스크립트, 소유 카드가 불분명한 것은 손대지 않았다.
//
//   미루면 깨지는 두 가지를 이렇게 막는다 —
//     ① DOMContentLoaded 로 스스로 배선하는 스크립트 → 이미 지난 이벤트라 영영 안 돈다.
//        그래서 «불러오는 동안» addEventListener 를 잠깐 가로채 두었다가, 로드 직후 직접 호출해준다.
//     ② 카드의 ontoggle="if(this.open)loadX()" 가 스크립트보다 먼저 실행된다.
//        그래서 로드가 끝난 뒤 toggle 을 한 번 더 흘려보내 loadX() 가 제대로 돌게 한다.
//
//   그리고 안전망 — 사용자가 조용히 있어도 잠시 뒤(유휴 시간)에 남은 것을 알아서 다 불러온다.
//   즉 «안 받는 것» 이 아니라 «급하지 않게 받는 것» 이라, 예기치 못한 참조가 있어도 곧 메워진다.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var SEL = 'script[type="text/lazy-js"]';
  var loadedSrc = {};      // src → true
  var chain = Promise.resolve();
  var idleDone = false;

  function tagsFor(cardId) {
    return Array.prototype.filter.call(document.querySelectorAll(SEL), function (t) {
      return t.getAttribute('data-card') === cardId && !t.__done;
    });
  }

  // 스크립트 하나를 실제로 실행시킨다 (DOMContentLoaded 대역 포함)
  function inject(tag) {
    return new Promise(function (resolve) {
      var src = tag.getAttribute('data-src');
      if (!src || loadedSrc[src]) { tag.__done = true; return resolve(); }
      loadedSrc[src] = true;

      // ① 로드되는 동안 등록되는 DOMContentLoaded/load 핸들러를 모아둔다
      var docAdd = document.addEventListener;
      var winAdd = window.addEventListener;
      var pending = [];
      function trap(orig, target) {
        return function (type, fn, opts) {
          if ((type === 'DOMContentLoaded' || type === 'load') && typeof fn === 'function') {
            pending.push(fn);
            return;
          }
          return orig.call(target, type, fn, opts);
        };
      }
      document.addEventListener = trap(docAdd, document);
      window.addEventListener = trap(winAdd, window);

      function restore() {
        document.addEventListener = docAdd;
        window.addEventListener = winAdd;
      }

      var s = document.createElement('script');
      s.src = src;
      s.async = false;                 // 순서 보존
      s.onload = s.onerror = function () {
        restore();
        tag.__done = true;
        // ② 모아둔 초기화 핸들러를 지금 실행 (이미 지나간 이벤트를 대신 흘려준다)
        for (var i = 0; i < pending.length; i++) {
          try { pending[i].call(document, new Event('DOMContentLoaded')); }
          catch (e) { try { console.warn('[adm-lazy] init 실패:', src, e); } catch (_) { } }
        }
        resolve();
      };
      document.head.appendChild(s);
    });
  }

  // 카드 하나에 딸린 스크립트를 모두 불러온 뒤, 열려 있으면 toggle 을 한 번 더 흘린다
  function loadCard(cardId, replayEl) {
    var tags = tagsFor(cardId);
    if (!tags.length) return Promise.resolve(false);
    chain = chain.then(function () {
      var p = Promise.resolve();
      tags.forEach(function (t) { p = p.then(function () { return inject(t); }); });
      return p.then(function () {
        if (replayEl && replayEl.open) {
          try { replayEl.dispatchEvent(new Event('toggle')); } catch (e) { }
        }
      });
    });
    return chain.then(function () { return true; });
  }

  // 카드를 펼치면 그 카드 스크립트를 즉시 (우선순위 높게) 불러온다
  document.addEventListener('toggle', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'DETAILS' || !el.id) return;
    if (!el.classList || !el.classList.contains('menu-card')) return;
    if (!el.open) return;
    loadCard(el.id, el);
  }, true);   // details 의 toggle 은 버블링하지 않는다 → 캡처 단계

  // 사이드바·검색·AI 명령이 카드를 프로그램적으로 여는 경로도 있으므로,
  // 열려 있는 카드는 처음에 한 번 훑어준다.
  function loadAlreadyOpen() {
    Array.prototype.forEach.call(document.querySelectorAll('details.menu-card[open]'), function (el) {
      if (el.id) loadCard(el.id, el);
    });
  }

  // 안전망 — 유휴 시간에 남은 것을 조용히 마저 받는다 (예상 못 한 참조 대비)
  function loadRest() {
    if (idleDone) return;
    idleDone = true;
    var rest = Array.prototype.filter.call(document.querySelectorAll(SEL), function (t) { return !t.__done; });
    rest.forEach(function (t) { chain = chain.then(function () { return inject(t); }); });
  }

  var IDLE_AFTER = 6000;   // 안전망이 도는 최소 시각 — 이 전에는 절대 안 받는다

  function boot() {
    loadAlreadyOpen();
    // ⚠️ requestIdleCallback 을 그냥 걸면 «할 일이 없는 순간» 바로 돌아 버려서
    //    (특히 조용한 화면·헤드리스에서) 지연이 사실상 무효가 된다. 최소 대기 후에 건다.
    setTimeout(function () {
      if (window.requestIdleCallback) requestIdleCallback(loadRest, { timeout: 8000 });
      else loadRest();
    }, IDLE_AFTER);
    // 사용자가 뭔가 누르기 시작하면 조금 앞당겨 받아둔다 (단, 최소 대기는 지킨다)
    ['pointerdown', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, function once() {
        document.removeEventListener(ev, once, true);
        setTimeout(loadRest, 2500);
      }, true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 디버그·검증용
  window.__admLazy = {
    pending: function () { return document.querySelectorAll(SEL + ':not([data-loaded])').length; },
    loaded: function () { return Object.keys(loadedSrc); },
    loadCard: loadCard,
    loadRest: loadRest,
  };
})();
