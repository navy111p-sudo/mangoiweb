// ═══════════════════════════════════════════════════════════════
// adm-r26.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // 적용할 표 ID 목록 (tbody ID 기반)
  var TARGET_TBODIES = [
    'acc-pay-tbody',   // 학생 결제 내역
    'b2b-tbody',       // BtoB 결제관리
    'b2c-tbody',       // BtoC 결제관리
    'sa-tbody'         // 학원별 학생 수업현황 (이미 자체 필터 있지만 컬럼 필터 추가)
  ];

  function ph128AddFilters(tbody){
    if (tbody.__ph128) return;
    var table = tbody.closest('table');
    if (!table) return;
    var thead = table.querySelector('thead');
    if (!thead) return;
    var headerRow = thead.querySelector('tr');
    if (!headerRow) return;
    var headers = headerRow.querySelectorAll('th');
    if (headers.length === 0) return;

    tbody.__ph128 = true;

    // 필터 행 생성
    var filterRow = document.createElement('tr');
    filterRow.className = 'ph128-filter-row';
    headers.forEach(function(th, idx){
      var cell = document.createElement('th');
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'ph128-filter-input';
      input.placeholder = '🔍 ' + th.textContent.trim().substring(0, 8);
      input.dataset.col = idx;
      input.dataset.tbody = tbody.id;
      input.addEventListener('input', function(){ ph128Apply(tbody); });
      input.addEventListener('keydown', function(e){
        if (e.key === 'Enter') { e.preventDefault(); ph128Apply(tbody); }
        if (e.key === 'Escape') { input.value=''; ph128Apply(tbody); }
      });
      cell.appendChild(input);
      filterRow.appendChild(cell);
    });
    thead.appendChild(filterRow);

    // 통계 박스 (table 위)
    var stat = document.createElement('div');
    stat.className = 'ph128-stat';
    stat.id = 'ph128-stat-' + tbody.id;
    stat.style.display = 'none';
    stat.innerHTML =
      '<span>🔍 필터 결과: <b id="ph128-count-' + tbody.id + '">0</b>건 표시 / 전체 <span id="ph128-total-' + tbody.id + '">0</span>건' +
      '<span class="ph128-active-count" id="ph128-active-' + tbody.id + '" style="margin-left:8px">0개 활성</span></span>' +
      '<button class="ph128-stat-reset" type="button" onclick="ph128Reset(\'' + tbody.id + '\')">↩ 필터 초기화</button>';
    if (table.parentElement) {
      table.parentElement.insertBefore(stat, table);
    }
    console.log('[ph128] 다중 필터 행 추가 → ' + tbody.id + ' (' + headers.length + ' 컬럼)');
  }

  function ph128Apply(tbody){
    var filters = {};
    document.querySelectorAll('.ph128-filter-input[data-tbody="' + tbody.id + '"]').forEach(function(input){
      var v = input.value.toLowerCase().trim();
      if (v) {
        filters[input.dataset.col] = v;
        input.classList.add('has-value');
      } else {
        input.classList.remove('has-value');
      }
    });

    var rows = tbody.querySelectorAll('tr');
    var visible = 0;
    rows.forEach(function(row){
      var cells = row.querySelectorAll('td');
      // empty placeholder rows 처리
      if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
        row.style.display = '';
        return;
      }
      var match = true;
      Object.keys(filters).forEach(function(col){
        var cell = cells[col];
        if (!cell) return;
        if (cell.textContent.toLowerCase().indexOf(filters[col]) < 0) {
          match = false;
        }
      });
      row.style.display = match ? '' : 'none';
      if (match) visible++;
    });

    var stat = document.getElementById('ph128-stat-' + tbody.id);
    var countEl = document.getElementById('ph128-count-' + tbody.id);
    var totalEl = document.getElementById('ph128-total-' + tbody.id);
    var activeEl = document.getElementById('ph128-active-' + tbody.id);
    var activeFilters = Object.keys(filters).length;

    if (activeFilters === 0) {
      if (stat) stat.style.display = 'none';
    } else {
      if (stat) stat.style.display = '';
      if (countEl) countEl.textContent = visible;
      if (totalEl) totalEl.textContent = rows.length;
      if (activeEl) activeEl.textContent = activeFilters + '개 활성';
    }
  }

  window.ph128Reset = function(tbodyId){
    document.querySelectorAll('.ph128-filter-input[data-tbody="' + tbodyId + '"]').forEach(function(input){
      input.value = '';
      input.classList.remove('has-value');
    });
    var tbody = document.getElementById(tbodyId);
    if (tbody) ph128Apply(tbody);
  };

  function ph128Init(){
    TARGET_TBODIES.forEach(function(id){
      var tbody = document.getElementById(id);
      if (tbody) ph128AddFilters(tbody);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph128Init);
  else ph128Init();
  setInterval(ph128Init, 2000);

  console.log('[ph128] 결제 표 다중 컬럼 동시 필터 활성 — 4개 표 적용');
})();
