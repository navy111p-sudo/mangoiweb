// ═══════════════════════════════════════════════════════════════
// adm-s14.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // saSearch override — 통계 박스 새 디자인
  window.saSearch = function(){
    var year = (document.getElementById('sa-year')||{}).value || '';
    var month = (document.getElementById('sa-month')||{}).value || '';
    var branch = (document.getElementById('sa-branch')||{}).value || '';
    var academy = (document.getElementById('sa-academy')||{}).value || '';
    var student = ((document.getElementById('sa-student')||{}).value || '').toLowerCase().trim();
    var result = (document.getElementById('sa-result')||{}).value || '';

    var rows = document.querySelectorAll('#sa-tbody tr');
    var visible = 0, exCount = 0, warnCount = 0, failCount = 0;

    rows.forEach(function(row){
      var cells = row.querySelectorAll('td');
      if (cells.length < 11) return;
      var rowBranch  = cells[1].textContent.toLowerCase();
      var rowAcademy = cells[2].textContent.toLowerCase();
      var rowStudent = (cells[3].textContent + ' ' + cells[4].textContent + ' ' + cells[5].textContent).toLowerCase();
      var rowResult = cells[9].textContent.toLowerCase();
      var match = true;
      if (academy && rowAcademy.indexOf(academy.toLowerCase()) < 0) match = false;
      if (branch && rowBranch.indexOf(branch.toLowerCase()) < 0) match = false;
      if (student && rowStudent.indexOf(student) < 0) match = false;
      if (result) {
        if (result === 'excellent' && rowResult.indexOf('excellent') < 0) match = false;
        if (result === 'warning' && rowResult.indexOf('warning') < 0) match = false;
        if (result === 'fail' && rowResult.indexOf('fail') < 0) match = false;
      }
      row.style.display = match ? '' : 'none';
      if (match) {
        visible++;
        if (rowResult.indexOf('excellent') >= 0) exCount++;
        else if (rowResult.indexOf('warning') >= 0) warnCount++;
        else if (rowResult.indexOf('fail') >= 0) failCount++;
      }
    });

    var card = document.getElementById('card-school-attendance-stats');
    if (!card) return;
    var existing = document.getElementById('sa-search-stat');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'sa-search-stat';
      var tableWrap = card.querySelector('.sa-table');
      if (tableWrap && tableWrap.parentElement) {
        tableWrap.parentElement.appendChild(existing);
      }
    }

    var conds = [];
    if (academy) conds.push('🏫 ' + academy);
    if (branch) conds.push('🏬 ' + branch);
    if (student) conds.push('👨‍🎓 "' + student + '"');
    if (result) conds.push('📊 ' + result);
    if (month) conds.push('📅 ' + year + '/' + month + '월');

    if (visible === 0) {
      existing.classList.add('empty');
      existing.innerHTML =
        '<div class="ph121-main">⚠ 검색 결과 없음</div>' +
        '<div class="ph121-conds">조건을 완화해서 다시 시도해주세요</div>' +
        (conds.length ? '<div class="ph121-conds" style="background:rgba(0,0,0,0.4)">현재 조건: ' + conds.join(' · ') + '</div>' : '') +
        '<a class="ph121-reset" href="javascript:void(0)" onclick="saReset()">↩ 검색 조건 초기화</a>';
    } else {
      existing.classList.remove('empty');
      existing.innerHTML =
        '<div class="ph121-main">🔍 검색 결과 <b>' + visible + '명</b> 표시 / 전체 ' + rows.length + '명</div>' +
        (conds.length ? '<div class="ph121-conds">조건: ' + conds.join('  ·  ') + '</div>' : '') +
        '<div class="ph121-cards">' +
          '<div class="ph121-card excellent"><div class="ph121-card-label">✅ Excellent</div><div class="ph121-card-value">' + exCount + '명</div></div>' +
          '<div class="ph121-card warning"><div class="ph121-card-label">⚠ Warning</div><div class="ph121-card-value">' + warnCount + '명</div></div>' +
          '<div class="ph121-card fail"><div class="ph121-card-label">❌ Fail</div><div class="ph121-card-value">' + failCount + '명</div></div>' +
        '</div>' +
        '<a class="ph121-reset" href="javascript:void(0)" onclick="saReset()">↩ 검색 조건 초기화 (전체 ' + rows.length + '명 보기)</a>';
    }
    console.log('[ph121] 검색 결과 통계 박스 새 디자인 —', visible, '/', rows.length);
  };

  // 데모 안내문 다크 박스로 교체
  function ph121DemoNote(){
    var card = document.getElementById('card-school-attendance-stats');
    if (!card || card.__ph121demo) return;
    var existing = document.getElementById('ph121-demo-note');
    if (existing) { card.__ph121demo = true; return; }
    var note = document.createElement('div');
    note.id = 'ph121-demo-note';
    note.innerHTML = '📌 <b>데모 데이터 16건</b> 표시 — 실서비스에서는 <b>페이지네이션 + 전체 1,247명 검색 가능</b>';
    card.querySelector('.menu-body').appendChild(note);
    card.__ph121demo = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph121DemoNote);
  else ph121DemoNote();
  setInterval(ph121DemoNote, 2000);

  console.log('[ph121] 검색 결과 통계 박스 가독성 강화 (큰 글자 + 3색 카드 + 큰 초기화 버튼)');
})();
