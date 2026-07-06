/**
 * mango-tools-dock.js — 복습퀴즈 옆 "교재도구/필기도구" 칩 동작
 *  - 기본: 접힘(드롭다운 숨김). 칩을 "클릭해야 열리고", 다시 "클릭해야 닫힘" (명시적 토글)
 *  - 하나 열면 다른 하나는 자동으로 닫힘 (상호 배타)
 *  - PDF 로드 등으로 도구바가 다시 그려져도 openState 기준으로 강제 동기화
 *    → 클릭하지 않으면 절대 열리지 않음
 *  - mango-tools-dock.css 와 짝으로 동작
 *
 *  🔧 (2026-07-06) 필기도구를 "현재 보고 있는 화면"에 맞춤(문맥 인식):
 *    - 칠판 탭이 켜져 있으면  → 칠판 전용 도구바(.wb-toolbar)를 칩 아래로 펼침.
 *      (교재 탭으로 전환하지 않음 → 칠판이 그대로 남는다)
 *    - 그 외(교재 등)면        → 기존처럼 교재 탭으로 전환 후 PDF 주석 도구바(.pdf-anno-bar).
 *    [원인] 예전엔 필기도구 칩이 항상 vcSwitchTab('pdf') 를 호출해, 칠판에서 눌러도
 *           교재(PDF)가 튀어나왔다. 칠판 도구바는 CSS(#mg-hide-wb-toolbar)로 숨겨져 있어
 *           칠판에선 필기 도구가 아예 안 보였다.
 */
(function () {
  'use strict';

  // 열림 상태 기억 (클릭으로만 변경) — 기본 둘 다 닫힘
  var openState = { materials: false, write: false };

  // 칠판 탭이 현재 활성인가?
  function isWhiteboardActive() {
    var wb = document.getElementById('tab-whiteboard');
    return !!(wb && wb.classList.contains('active'));
  }

  function wbToolbar()  { return document.querySelector('#tab-whiteboard .wb-toolbar'); }
  function pdfControls(){ return document.querySelector('#tab-pdf .pdf-controls'); }
  function pdfAnnoBar() { return document.querySelector('#tab-pdf .pdf-anno-bar'); }

  function chipOf(which) {
    return document.querySelector('.mango-tool-chip[data-tool="' + which + '"]');
  }

  function syncChip(which) {
    var chip = chipOf(which);
    if (!chip) return;
    var name = which === 'materials' ? '📚 교재도구' : '✍️ 필기도구';
    var text = name + (openState[which] ? ' ▴' : ' ▾');
    // 🔧 깜박임 방지: 값이 실제로 바뀔 때만 DOM 갱신 (매 틱 textContent 재작성 금지)
    if (chip.textContent !== text) chip.textContent = text;
    if (chip.classList.contains('open') !== openState[which]) {
      chip.classList.toggle('open', openState[which]);
    }
  }

  // 도구바(bar)를 해당 칩(which) 바로 아래로 드롭다운 배치
  function positionDockEl(bar, which) {
    var chip = chipOf(which);
    var pane = document.getElementById('vc-content-pane');
    if (!bar || !chip || !pane) return;
    var pr = pane.getBoundingClientRect();
    var cr = chip.getBoundingClientRect();
    var left = Math.max(8, Math.round(cr.left - pr.left)) + 'px';
    var top = Math.round(cr.bottom - pr.top + 6) + 'px';
    // 🔧 깜박임 방지: 위치가 실제로 달라졌을 때만 inline 스타일 갱신 (매 틱 재설정 금지)
    if (bar.style.left !== left) bar.style.left = left;
    if (bar.style.top !== top) bar.style.top = top;
    if (bar.style.right !== 'auto') bar.style.right = 'auto';
  }

  // ── 교재도구 상태 반영 (항상 교재 탭의 pdf-controls) ──
  function applyMaterialsState() {
    var bar = pdfControls();
    if (bar) {
      var collapsed = bar.classList.contains('ph49-collapsed');
      if (openState.materials) {
        if (collapsed) bar.classList.remove('ph49-collapsed');
        positionDockEl(bar, 'materials');
      } else {
        if (!collapsed) bar.classList.add('ph49-collapsed');
      }
    }
    syncChip('materials');
  }

  // ── 필기도구 상태 반영 (문맥 인식: 칠판이면 칠판 도구바, 아니면 PDF 주석바) ──
  function applyWriteState() {
    var open = openState.write;
    var onWb = isWhiteboardActive();
    var wb = wbToolbar();
    var anno = pdfAnnoBar();

    // 칠판 도구바 — 필기도구가 열려 있고 칠판 탭일 때만 드롭다운으로 표시
    if (wb) {
      var wbShow = open && onWb;
      if (wb.classList.contains('mango-wb-dock-open') !== wbShow) {
        wb.classList.toggle('mango-wb-dock-open', wbShow);
      }
      // 칠판 도구바는 접힘(ph49) 로직을 쓰지 않는다 — 내부 버튼 항상 노출
      if (wb.classList.contains('ph49-collapsed')) wb.classList.remove('ph49-collapsed');
      if (wbShow) positionDockEl(wb, 'write');
    }

    // PDF 주석 도구바 — 필기도구가 열려 있고 '칠판이 아닌' 탭(=교재)일 때만 표시
    if (anno) {
      var annoShow = open && !onWb;
      var collapsed = anno.classList.contains('ph49-collapsed');
      if (annoShow) {
        if (collapsed) anno.classList.remove('ph49-collapsed');
        positionDockEl(anno, 'write');
      } else {
        if (!collapsed) anno.classList.add('ph49-collapsed');
      }
    }
    syncChip('write');
  }

  // 칩 클릭 → 해당 도구 토글(열림/닫힘), 다른 하나는 닫힘
  window.mangoToggleToolDock = function (which, el) {
    try { if (typeof window.vcSetContentCollapsed === 'function') window.vcSetContentCollapsed(false); } catch (_) {}

    var willOpen = !openState[which];

    if (which === 'materials') {
      // 교재도구는 교재(PDF) 탭을 대상으로 함 → 교재 탭으로 전환
      try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch (_) {}
    } else {
      // 필기도구: 칠판 탭이면 그대로 두고(칠판 유지), 교재 등 다른 탭일 때만 교재로 전환.
      if (!isWhiteboardActive()) {
        try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch (_) {}
      }
    }

    openState.materials = false;
    openState.write = false;
    openState[which] = willOpen;
    applyMaterialsState();
    applyWriteState();
  };

  // 동적 재렌더에도 클릭 없이는 열리지 않도록 상태 강제
  function enforce() {
    applyMaterialsState();
    applyWriteState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforce);
  } else {
    enforce();
  }
  setInterval(enforce, 1200);
  window.addEventListener('resize', function () {
    if (openState.materials) { var m = pdfControls(); if (m) positionDockEl(m, 'materials'); }
    if (openState.write) {
      if (isWhiteboardActive()) { var w = wbToolbar(); if (w) positionDockEl(w, 'write'); }
      else { var a = pdfAnnoBar(); if (a) positionDockEl(a, 'write'); }
    }
  });
})();
