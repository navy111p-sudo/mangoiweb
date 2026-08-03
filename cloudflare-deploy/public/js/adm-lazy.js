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

  // ── 🛟 대역 함수(stub) — «안 받고도 안 깨지게» 하는 장치 ─────────────────
  //   예전엔 «유휴 시간에 남은 걸 전부 받아두는» 안전망을 썼다. 안전하긴 한데 결국 다 받으니
  //   바이트가 줄지 않았다. 그래서 미리 받는 대신, 각 스크립트가 노출하는 함수 이름만
  //   (data-globals) 껍데기로 먼저 깔아 둔다.
  //   그 이름이 어디서든 호출되면 — 인라인 onclick 이든, 사이드바 점프든, 다른 스크립트든 —
  //   그때 진짜 파일을 받아서 «같은 인자로» 다시 부른다. 사용자는 한 박자 늦는 것 말고는 차이가 없다.
  //   진짜 파일이 window.X 를 덮어쓰므로 껍데기는 자동으로 사라진다.
  //   ⚠️ 껍데기는 값을 곧바로 돌려주지 못한다(비동기). 그래서 «함수로 대입되는 전역»만 대상으로 하고,
  //      값(문자열·객체) 전역은 애초에 목록에서 제외했다.
  var stubOf = {};   // 이름 → 껍데기 함수 (진짜가 덮었는지 판별용)

  function installStubs() {
    Array.prototype.forEach.call(document.querySelectorAll(SEL), function (tag) {
      var names = (tag.getAttribute('data-globals') || '').split(',');
      var cardId = tag.getAttribute('data-card');
      names.forEach(function (name) {
        name = name.trim();
        if (!name || typeof window[name] !== 'undefined') return;   // 이미 있으면 건드리지 않는다
        var stub = function () {
          var args = arguments, self = this;
          try { console.info('[adm-lazy] ' + name + '() 호출 → ' + tag.getAttribute('data-src') + ' 지금 불러옵니다'); } catch (e) { }
          return loadCard(cardId, document.getElementById(cardId)).then(function () {
            var real = window[name];
            if (typeof real === 'function' && real !== stubOf[name]) return real.apply(self, args);
            try { console.warn('[adm-lazy] ' + name + ' 을 불러왔는데도 찾지 못했습니다'); } catch (e) { }
          });
        };
        stubOf[name] = stub;
        window[name] = stub;
      });
    });
  }

  // (구) 전체 프리페치 — 더는 쓰지 않는다. 디버깅·긴급 복구용으로만 남긴다.
  function loadRest() {
    if (idleDone) return;
    idleDone = true;
    var rest = Array.prototype.filter.call(document.querySelectorAll(SEL), function (t) { return !t.__done; });
    rest.forEach(function (t) { chain = chain.then(function () { return inject(t); }); });
  }

  function boot() {
    installStubs();      // 먼저 껍데기를 깔아야 «로드 전 호출» 을 받아낼 수 있다
    loadAlreadyOpen();   // 처음부터 펼쳐진 카드는 바로 채운다
    // ⛔ 전체 프리페치는 하지 않는다.
    //    예전 안전망(유휴 시간에 나머지 전부 받기)은 결국 다 받아 바이트가 줄지 않았다.
    //    이제는 «카드를 펼칠 때» 또는 «그 함수가 실제로 불릴 때» 만 받는다.
    //    긴급 시에는 콘솔에서 __admLazy.loadRest() 로 한 번에 받을 수 있다.
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
