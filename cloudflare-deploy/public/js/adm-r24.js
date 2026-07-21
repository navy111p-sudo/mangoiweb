// ═══════════════════════════════════════════════════════════════
// adm-r24.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var flyout = null;
  var hideTimer = null;
  var currentSub = null;

  // 카드 내 details.sub-item 추출 → 손자 메뉴 목록
  function getGrandchildren(cardId){
    var card = document.getElementById(cardId);
    if (!card) return null;
    var items = card.querySelectorAll('details.sub-item, details.menu-body details');
    var result = [];
    items.forEach(function(item, idx){
      var summary = item.querySelector(':scope > summary');
      if (!summary) return;
      var text = summary.textContent.trim().substring(0, 50);
      if (text) {
        result.push({ idx: idx, title: text, element: item });
      }
    });
    return result;
  }

  // 플라이아웃 생성 & 표시
  function showFlyout(subEl){
    // 🗑️ (2026-07-22 사장님 지시) hover 손자메뉴 플라이아웃 제거(중복 UI). 재추가 금지.
    return;
    var cardId = subEl.dataset.card;
    if (!cardId) return;
    var grandchildren = getGrandchildren(cardId);
    if (!grandchildren) return;

    if (currentSub) currentSub.classList.remove('ph123-active');
    subEl.classList.add('ph123-active');
    currentSub = subEl;

    // 기존 플라이아웃 제거
    if (flyout) { flyout.remove(); flyout = null; }

    var rect = subEl.getBoundingClientRect();
    flyout = document.createElement('div');
    flyout.id = 'ph123-flyout';

    var subTitle = subEl.textContent.trim();
    var headerHtml = '<div class="ph123-header">' +
      '🧭 ' + subTitle +
      '<div class="ph123-header-sub">' + cardId + ' · 손자 메뉴 ' + grandchildren.length + '개</div>' +
    '</div>';

    var directHtml = '<a class="ph123-direct" onclick="ph123JumpCard(\'' + cardId + '\')">📂 카드 전체 열기</a>';

    var listHtml = '';
    if (grandchildren.length === 0) {
      listHtml = '<div class="ph123-empty">하위 항목 없음 — "카드 전체 열기" 를 사용하세요</div>';
    } else {
      listHtml = grandchildren.map(function(g, i){
        var safeTitle = g.title.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        return '<a class="ph123-gc" onclick="ph123JumpGrandchild(\'' + cardId + '\',' + g.idx + ')">' +
          '<span class="ph123-num">' + (i + 1) + '</span>' +
          '<span class="ph123-text">' + safeTitle + '</span>' +
        '</a>';
      }).join('');
    }

    flyout.innerHTML = headerHtml + directHtml + listHtml;
    document.body.appendChild(flyout);

    // 위치 계산 (사이드바 우측에 표시)
    var fw = 320; // 예상 너비
    var fh = Math.min(grandchildren.length * 40 + 100, window.innerHeight * 0.7);
    var left = rect.right + 6;
    var top = rect.top;
    // 화면 밖 방지
    if (left + fw > window.innerWidth) left = rect.left - fw - 6;
    if (top + fh > window.innerHeight) top = window.innerHeight - fh - 10;
    if (top < 10) top = 10;
    flyout.style.left = left + 'px';
    flyout.style.top = top + 'px';

    // 플라이아웃 자체에 호버 → 유지
    flyout.addEventListener('mouseenter', function(){
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    });
    flyout.addEventListener('mouseleave', function(){
      hideFlyout(150);
    });
  }

  function hideFlyout(delay){
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function(){
      if (flyout) { flyout.remove(); flyout = null; }
      if (currentSub) { currentSub.classList.remove('ph123-active'); currentSub = null; }
    }, delay || 200);
  }

  // 손자 메뉴 클릭 → 해당 카드의 N번째 sub-item 펼침 + scroll
  window.ph123JumpGrandchild = function(cardId, idx){
    var card = document.getElementById(cardId);
    if (!card) return;
    if (card.tagName === 'DETAILS') card.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var items = card.querySelectorAll('details.sub-item, details.menu-body details');
    var target = items[idx];
    if (target) {
      target.open = true;
      setTimeout(function(){
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.boxShadow = '0 0 0 3px rgba(251,191,36,0.6), 0 12px 40px rgba(251,191,36,0.3)';
        setTimeout(function(){ target.style.boxShadow = ''; }, 2500);
      }, 300);
    }
    hideFlyout(0);
    console.log('[ph123] 손자 점프:', cardId, '[' + idx + ']');
  };

  window.ph123JumpCard = function(cardId){
    var card = document.getElementById(cardId);
    if (!card) return;
    if (card.tagName === 'DETAILS') card.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.style.boxShadow = '0 0 0 4px rgba(251,191,36,0.7), 0 12px 40px rgba(251,191,36,0.3)';
    setTimeout(function(){ card.style.boxShadow = ''; }, 2500);
    hideFlyout(0);
  };

  // 사이드바 sub 에 호버 이벤트 바인딩
  function ph123BindHover(){
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return;
    bar.querySelectorAll('.ph85-sub').forEach(function(sub){
      if (sub.__ph123) return;
      sub.__ph123 = true;
      sub.addEventListener('mouseenter', function(){
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        showFlyout(sub);
      });
      sub.addEventListener('mouseleave', function(){
        hideFlyout(200);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph123BindHover);
  else ph123BindHover();
  (window.__admSettleRun ? window.__admSettleRun(ph123BindHover) : setInterval(ph123BindHover, 1500));

  // ESC 키로 플라이아웃 닫기
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') hideFlyout(0); });

  console.log('[ph123] 사이드바 3단계 호버 플라이아웃 활성 — sub 호버 시 손자 메뉴 표시');
})();
