/**
 * 🌐 Mangoi Shared i18n System
 *   - data-ko / data-en 속성으로 textContent 전환
 *   - data-ko-placeholder / data-en-placeholder 로 input placeholder 전환
 *   - data-ko-title / data-en-title 으로 title 속성 전환
 *   - data-ko-aria / data-en-aria 로 aria-label 전환
 *   - localStorage.mangoi_lang 으로 영속화
 *   - window.applyI18n(root) 으로 동적 컨텐츠에도 적용 가능
 *
 * 사용법: <head> 에 <script src="/js/mango-i18n.js" defer></script> 로드
 *        토글 버튼: <button onclick="toggleLang()">EN</button>
 *        동적 렌더 후: window.applyI18n(modalElement); 호출
 */
(function(){
  'use strict';
  var currentLang = 'ko';
  try {
    var saved = localStorage.getItem('mangoi_lang');
    if (saved === 'en') currentLang = 'en';
  } catch(e){}

  // ━━━━ 핵심 적용 함수 ━━━━
  function applyI18n(root) {
    root = root || document;

    // textContent 전환
    root.querySelectorAll('[data-ko]').forEach(function(el){
      var txt = el.getAttribute('data-' + currentLang);
      if (txt !== null && txt !== undefined) el.textContent = txt;
    });

    // placeholder 전환 (옛 -ph 접미사)
    root.querySelectorAll('[data-ko-ph]').forEach(function(el){
      var ph = el.getAttribute('data-' + currentLang + '-ph');
      if (ph) el.placeholder = ph;
    });

    // placeholder 전환 (-placeholder)
    root.querySelectorAll('[data-ko-placeholder]').forEach(function(el){
      var ph = el.getAttribute('data-' + currentLang + '-placeholder');
      if (ph) el.placeholder = ph;
    });

    // title 속성 전환
    root.querySelectorAll('[data-ko-title]').forEach(function(el){
      var t = el.getAttribute('data-' + currentLang + '-title');
      if (t) el.title = t;
    });

    // aria-label 속성 전환
    root.querySelectorAll('[data-ko-aria]').forEach(function(el){
      var a = el.getAttribute('data-' + currentLang + '-aria');
      if (a) el.setAttribute('aria-label', a);
    });

    // <html lang> 동기화 (접근성 + SEO)
    try { document.documentElement.lang = currentLang; } catch(e){}

    // 토글 라벨 동기화 (KO/EN 표시)
    var newLabel = (currentLang === 'ko') ? 'EN' : 'KO';
    root.querySelectorAll('.lang-label-sync, #lang-label, [data-lang-label]').forEach(function(el){
      el.textContent = newLabel;
    });
  }

  // ━━━━ 외부 노출 ━━━━
  window.applyI18n = applyI18n;
  window.getLang = function(){ return currentLang; };
  window.setLang = function(l){
    if (l !== 'ko' && l !== 'en') return;
    currentLang = l;
    try { localStorage.setItem('mangoi_lang', l); } catch(e){}
    applyI18n();
    window.dispatchEvent(new CustomEvent('mangoi:lang-changed', { detail: { lang: l } }));
  };
  window.toggleLang = function(){
    window.setLang(currentLang === 'ko' ? 'en' : 'ko');
  };

  // ━━━━ 페이지 로드 후 즉시 적용 ━━━━
  function init() {
    applyI18n();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ━━━━ MutationObserver — 동적으로 추가된 컨텐츠에 자동 적용 ━━━━
  //   (모달이나 fetch 후 render 한 카드에도 자동 번역)
  try {
    var pendingNodes = [];
    var pendingTimer = null;
    var observer = new MutationObserver(function(mutations){
      var found = false;
      for (var i = 0; i < mutations.length; i++) {
        var mut = mutations[i];
        if (mut.type === 'childList' && mut.addedNodes.length > 0) {
          for (var j = 0; j < mut.addedNodes.length; j++) {
            var node = mut.addedNodes[j];
            if (node.nodeType === 1 /* ELEMENT_NODE */) {
              // 빠른 검사: data-ko 가 있는지 자체 또는 자손 중에 있는지
              if (node.hasAttribute && (node.hasAttribute('data-ko') || node.hasAttribute('data-ko-placeholder') || node.hasAttribute('data-ko-title'))) {
                pendingNodes.push(node); found = true;
              } else if (node.querySelector && node.querySelector('[data-ko],[data-ko-placeholder],[data-ko-title]')) {
                pendingNodes.push(node); found = true;
              }
            }
          }
        }
      }
      if (found) {
        // 짧은 debounce 로 묶어 처리 (성능)
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function(){
          var nodes = pendingNodes.splice(0, pendingNodes.length);
          nodes.forEach(function(n){ applyI18n(n); });
          pendingTimer = null;
        }, 30);
      }
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch(e) {
    console.warn('[mango-i18n] MutationObserver fail:', e);
  }
})();
