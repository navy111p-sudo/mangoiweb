/**
 * mango-tools-dock.js — 복습퀴즈 옆 "교재도구/필기도구" 칩 동작 [초안]
 *  - 칩 클릭 → 교재(pdf) 탭으로 전환 + 해당 도구바를 칩 아래로 세로 드롭다운(투명)
 *  - 다시 클릭 → 접기
 *  - mango-tools-dock.css 와 짝으로 동작
 */
(function () {
  'use strict';

  function barOf(which) {
    return document.querySelector(
      which === 'materials' ? '#tab-pdf .pdf-controls' : '#tab-pdf .pdf-anno-bar'
    );
  }
  function chipOf(which) {
    return document.querySelector('.mango-tool-chip[data-tool="' + which + '"]');
  }

  function syncChip(which) {
    var bar = barOf(which), chip = chipOf(which);
    if (!chip) return;
    var open = bar ? !bar.classList.contains('ph49-collapsed') : false;
    var name = which === 'materials' ? '📚 교재도구' : '✍️ 필기도구';
    chip.textContent = name + (open ? ' ▴' : ' ▾');
    chip.classList.toggle('open', open);
  }

  /** 드롭다운을 칩 바로 아래에 위치시킴 (콘텐츠 영역 기준 절대좌표) */
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

  window.mangoToggleToolDock = function (which, el) {
    // 도구는 교재(pdf) 탭에 있으므로 먼저 그 탭으로 전환
    try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch (_) {}
    var bar = barOf(which);
    if (!bar) return;
    var willOpen = bar.classList.contains('ph49-collapsed');
    bar.classList.toggle('ph49-collapsed');
    if (willOpen) positionDock(which);
    syncChip('materials');
    syncChip('write');
  };

  function init() {
    syncChip('materials');
    syncChip('write');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // 뷰 전환/리사이즈 대비: 열려있는 도크는 위치 재계산, 라벨 동기화
  setInterval(function () {
    ['materials', 'write'].forEach(function (w) {
      var bar = barOf(w);
      if (bar && !bar.classList.contains('ph49-collapsed')) positionDock(w);
      syncChip(w);
    });
  }, 1500);
  window.addEventListener('resize', function () {
    ['materials', 'write'].forEach(function (w) {
      var bar = barOf(w);
      if (bar && !bar.classList.contains('ph49-collapsed')) positionDock(w);
    });
  });
})();
