/**
 * mango-tools-dock.js — 복습퀴즈 옆 "교재도구/필기도구" 칩 동작
 *  - 기본: 접힘(드롭다운 숨김). 칩을 "클릭해야 열리고", 다시 "클릭해야 닫힘" (명시적 토글)
 *  - 하나 열면 다른 하나는 자동으로 닫힘 (상호 배타)
 *  - PDF 로드 등으로 도구바가 다시 그려져도 openState 기준으로 강제 동기화
 *    → 클릭하지 않으면 절대 열리지 않음
 *  - mango-tools-dock.css 와 짝으로 동작
 */
(function () {
  'use strict';

  // 열림 상태 기억 (클릭으로만 변경) — 기본 둘 다 닫힘
  var openState = { materials: false, write: false };

  function barOf(which) {
    return document.querySelector(
      which === 'materials' ? '#tab-pdf .pdf-controls' : '#tab-pdf .pdf-anno-bar'
    );
  }
  function chipOf(which) {
    return document.querySelector('.mango-tool-chip[data-tool="' + which + '"]');
  }

  function syncChip(which) {
    var chip = chipOf(which);
    if (!chip) return;
    var name = which === 'materials' ? '📚 교재도구' : '✍️ 필기도구';
    chip.textContent = name + (openState[which] ? ' ▴' : ' ▾');
    chip.classList.toggle('open', openState[which]);
  }

  function positionDock(which) {
    var bar = barOf(which), chip = chipOf(which);
    var pane = document.getElementById('vc-content-pane');
    if (!bar || !chip || !pane) return;
    var pr = pane.getBoundingClientRect();
    var cr = chip.getBoundingClientRect();
    bar.style.left = Math.max(8, Math.round(cr.left - pr.left)) + 'px';
    bar.style.top = Math.round(cr.bottom - pr.top + 6) + 'px';
    bar.style.right = 'auto';
  }

  // openState 기준으로 실제 DOM(접힘 클래스)을 맞춤
  function applyState(which) {
    var bar = barOf(which);
    if (bar) {
      if (openState[which]) {
        bar.classList.remove('ph49-collapsed');
        positionDock(which);
      } else {
        bar.classList.add('ph49-collapsed');
      }
    }
    syncChip(which);
  }

  // 칩 클릭 → 해당 도구 토글(열림/닫힘), 다른 하나는 닫힘
  window.mangoToggleToolDock = function (which, el) {
    try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch (_) {}
    var willOpen = !openState[which];
    openState.materials = false;
    openState.write = false;
    openState[which] = willOpen;
    applyState('materials');
    applyState('write');
  };

  // 동적 재렌더에도 클릭 없이는 열리지 않도록 상태 강제
  function enforce() {
    applyState('materials');
    applyState('write');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforce);
  } else {
    enforce();
  }
  setInterval(enforce, 1200);
  window.addEventListener('resize', function () {
    ['materials', 'write'].forEach(function (w) {
      if (openState[w]) positionDock(w);
    });
  });
})();
