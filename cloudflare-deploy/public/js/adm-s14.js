// ═══════════════════════════════════════════════════════════════
// adm-s14.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  /* 🔧 (2026-08-21) — 이 파일(ph121, 2026-07-14)이 실데이터 배선(adm-r23.js, 2026-08-19)보다
     나중에 로드되면서 window.saSearch 를 통째로 덮어쓰고 있었다. adm-r23.js 의 실제 검색은
     서버(/api/admin/attendance/school-stats)에 다시 물어 표를 갈아치우고 학당 드롭다운도
     saRefreshAcademyOptions() 로 지사에 맞게 다시 채우는데, 이 파일은 그걸 부르지 않고
     «이미 화면에 있는 100건» 을 텍스트로 다시 숨기기만 했다. 그래서 지사를 바꿔도
     ① 학당 드롭다운이 그대로(전체 대리점) ② 서버 재검색도 안 되고 처음 로드된 100건만
     클라이언트에서 숨겨졌다 — 「지사를 골라도 대리점이 전부 나온다」 제보의 원인이 이것이다.
     ⛔ 통째로 덮어쓰지 않는다 — r23 의 실제 검색을 먼저 부르고, saFetch 가 끝났다는 신호
     (mangoi:sa-search-done)를 받은 뒤에만 이 파일의 통계 박스를 다시 그린다. */
  var _saSearchReal = window.saSearch;   // adm-r23.js 가 먼저 정의해 둔 실제 검색(fetch + 드롭다운 갱신)
  window.saSearch = function(){
    if (typeof _saSearchReal === 'function') _saSearchReal();
  };

  // saSearch 통계 박스 — 서버가 이미 필터링해 그려 준 #sa-tbody 를 세어 그린다(재필터링 안 함)
  function saStatBox(){
    var year = (document.getElementById('sa-year')||{}).value || '';
    var month = (document.getElementById('sa-month')||{}).value || '';
    var branch = (document.getElementById('sa-branch')||{}).value || '';
    var academy = (document.getElementById('sa-academy')||{}).value || '';
    var student = ((document.getElementById('sa-student')||{}).value || '').trim();
    var result = (document.getElementById('sa-result')||{}).value || '';

    var rows = document.querySelectorAll('#sa-tbody tr');
    var visible = 0, exCount = 0, warnCount = 0, failCount = 0;
    rows.forEach(function(row){
      var cells = row.querySelectorAll('td');
      if (cells.length < 11) return;
      visible++;
      var rowResult = cells[9].textContent.toLowerCase();
      if (rowResult.indexOf('excellent') >= 0) exCount++;
      else if (rowResult.indexOf('warning') >= 0) warnCount++;
      else if (rowResult.indexOf('fail') >= 0) failCount++;
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
        '<div class="ph121-main">🔍 검색 결과 <b>' + visible + '명</b> 표시</div>' +
        (conds.length ? '<div class="ph121-conds">조건: ' + conds.join('  ·  ') + '</div>' : '') +
        '<div class="ph121-cards">' +
          '<div class="ph121-card excellent"><div class="ph121-card-label">✅ Excellent</div><div class="ph121-card-value">' + exCount + '명</div></div>' +
          '<div class="ph121-card warning"><div class="ph121-card-label">⚠ Warning</div><div class="ph121-card-value">' + warnCount + '명</div></div>' +
          '<div class="ph121-card fail"><div class="ph121-card-label">❌ Fail</div><div class="ph121-card-value">' + failCount + '명</div></div>' +
        '</div>' +
        '<a class="ph121-reset" href="javascript:void(0)" onclick="saReset()">↩ 검색 조건 초기화</a>';
    }
    console.log('[ph121] 검색 결과 통계 박스 새 디자인 —', visible);
  }
  document.addEventListener('mangoi:sa-search-done', saStatBox);

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
  (window.__admSettleRun ? window.__admSettleRun(ph121DemoNote) : setInterval(ph121DemoNote, 2000));

  console.log('[ph121] 검색 결과 통계 박스 가독성 강화 (큰 글자 + 3색 카드 + 큰 초기화 버튼)');
})();
