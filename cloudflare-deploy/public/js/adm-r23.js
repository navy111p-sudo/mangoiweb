// ═══════════════════════════════════════════════════════════════
// adm-r23.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ============================================================
  // 1) 🏠 홈 버튼 — 학생 홈(/) 대신 관리자 페이지 최상단으로
  // ============================================================
  function ph120FixHomeBtn(){
    // href="/" 인 홈 버튼 찾기 (학생 홈으로 가는 버튼)
    var homeBtns = document.querySelectorAll('a.th-btn[href="/"], a.th-btn-amber[href="/"]');
    homeBtns.forEach(function(btn){
      if (btn.__ph120) return;
      btn.__ph120 = true;
      btn.setAttribute('href', 'javascript:void(0)');
      btn.setAttribute('title', '관리자 페이지 최상단으로');
      btn.setAttribute('data-ko-title', '관리자 페이지 최상단으로');
      btn.setAttribute('data-en-title', 'Go to admin top');
      btn.setAttribute('onclick',
        "event.preventDefault();" +
        "window.scrollTo({top:0,behavior:'smooth'});" +
        "setTimeout(function(){" +
        "  var search=document.getElementById('menu-search');" +
        "  if(search){search.focus();search.scrollIntoView({behavior:'smooth',block:'center'});}" +
        "},400);" +
        "console.log('[ph120] 관리자 페이지 최상단 + 통합 검색 포커스');" +
        "return false;"
      );
      // 라벨 변경: "🏠 홈" → "🏠 상단"
      var span = btn.querySelector('[data-ko]');
      if (span) {
        span.setAttribute('data-ko', '🏠 상단');
        span.setAttribute('data-en', '🏠 Top');
        span.textContent = '🏠 상단';
      } else {
        btn.textContent = '🏠 상단';
      }
    });
  }

  // ============================================================
  // 2) 학원별 수업현황 검색 — 실제 필터링 작동
  // ============================================================
  window.saSearch = function(){
    var year = (document.getElementById('sa-year')||{}).value || '';
    var month = (document.getElementById('sa-month')||{}).value || '';
    var branch = (document.getElementById('sa-branch')||{}).value || '';
    var academy = (document.getElementById('sa-academy')||{}).value || '';
    var student = ((document.getElementById('sa-student')||{}).value || '').toLowerCase().trim();
    var result = (document.getElementById('sa-result')||{}).value || '';

    var rows = document.querySelectorAll('#sa-tbody tr');
    var visible = 0;
    var matchedExcellent = 0, matchedWarning = 0, matchedFail = 0;

    rows.forEach(function(row){
      var cells = row.querySelectorAll('td');
      if (cells.length < 11) return;

      var rowBranch  = cells[1].textContent.toLowerCase();
      var rowAcademy = cells[2].textContent.toLowerCase();
      var rowStudentName = cells[3].textContent.toLowerCase();
      var rowStudentEn   = cells[4].textContent.toLowerCase();
      var rowStudentId   = cells[5].textContent.toLowerCase();
      var rowStudentAll  = rowStudentName + ' ' + rowStudentEn + ' ' + rowStudentId;
      var rowResult = cells[9].textContent.toLowerCase();

      var match = true;
      if (academy && rowAcademy.indexOf(academy.toLowerCase()) < 0) match = false;
      if (branch && rowBranch.indexOf(branch.toLowerCase()) < 0) match = false;
      if (student && rowStudentAll.indexOf(student) < 0) match = false;
      if (result) {
        if (result === 'excellent' && rowResult.indexOf('excellent') < 0) match = false;
        if (result === 'warning' && rowResult.indexOf('warning') < 0) match = false;
        if (result === 'fail' && rowResult.indexOf('fail') < 0) match = false;
      }

      row.style.display = match ? '' : 'none';
      if (match) {
        visible++;
        if (rowResult.indexOf('excellent') >= 0) matchedExcellent++;
        else if (rowResult.indexOf('warning') >= 0) matchedWarning++;
        else if (rowResult.indexOf('fail') >= 0) matchedFail++;
      }
    });

    // 검색 결과 통계 박스
    var card = document.getElementById('card-school-attendance-stats');
    if (!card) return;
    var existing = document.getElementById('sa-search-stat');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'sa-search-stat';
      existing.style.cssText = 'padding:12px 16px;margin-top:14px;background:linear-gradient(135deg,rgba(37,99,235,0.18),rgba(96,165,250,0.10));border:1px solid rgba(96,165,250,0.5);border-radius:10px;color:#DBEAFE;font-weight:700;text-align:center;font-size:13px';
      var tableWrap = card.querySelector('.sa-table');
      if (tableWrap && tableWrap.parentElement) {
        tableWrap.parentElement.appendChild(existing);
      }
    }
    if (visible === 0) {
      existing.innerHTML = '⚠ <b style="color:#FCA5A5">검색 결과 없음</b> — 조건을 완화해서 다시 시도해주세요. ' +
        '<a href="javascript:void(0)" onclick="saReset()" style="color:#67E8F9;margin-left:8px;text-decoration:underline">↩ 검색 초기화</a>';
    } else {
      var conds = [];
      if (academy) conds.push('🏫 ' + academy);
      if (branch) conds.push('🏬 ' + branch);
      if (student) conds.push('👨‍🎓 "' + student + '"');
      if (result) conds.push('📊 ' + result);
      if (month) conds.push('📅 ' + year + '/' + month + '월');
      existing.innerHTML =
        '🔍 검색 결과: <b style="color:#86EFAC;font-size:16px">' + visible + '명</b> 표시 / 전체 ' + rows.length + '명' +
        (conds.length ? '<br><span style="color:#93C5FD;font-size:11.5px;font-weight:600">조건: ' + conds.join(' · ') + '</span>' : '') +
        '<br><span style="color:#94A3B8;font-size:11px;font-weight:600">' +
        '✅ Excellent ' + matchedExcellent + '명 · ⚠ Warning ' + matchedWarning + '명 · ❌ Fail ' + matchedFail + '명' +
        ' &nbsp; <a href="javascript:void(0)" onclick="saReset()" style="color:#67E8F9;text-decoration:underline">↩ 초기화</a></span>';
    }
    console.log('[ph120] 검색 완료 —', visible, '/', rows.length, '명 표시');
  };

  // 초기화
  window.saReset = function(){
    ['sa-year','sa-month','sa-branch','sa-academy','sa-student','sa-result'].forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    document.querySelectorAll('#sa-tbody tr').forEach(function(r){ r.style.display = ''; });
    var stat = document.getElementById('sa-search-stat');
    if (stat) stat.remove();
    console.log('[ph120] 검색 초기화');
  };

  // 검색 input 에 Enter 키로 검색 작동
  function ph120BindEnter(){
    var input = document.getElementById('sa-student');
    if (input && !input.__ph120) {
      input.__ph120 = true;
      input.addEventListener('keydown', function(e){
        if (e.key === 'Enter') { e.preventDefault(); saSearch(); }
      });
    }
    // select 변경 시 자동 검색
    ['sa-year','sa-month','sa-branch','sa-academy','sa-result'].forEach(function(id){
      var el = document.getElementById(id);
      if (el && !el.__ph120) {
        el.__ph120 = true;
        el.addEventListener('change', function(){ saSearch(); });
      }
    });
  }

  // 초기 + 주기 실행
  function ph120Init(){
    ph120FixHomeBtn();
    ph120BindEnter();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph120Init);
  else ph120Init();
  (window.__admSettleRun ? window.__admSettleRun(ph120Init) : setInterval(ph120Init, 1500));

  console.log('[ph120] 홈 버튼 → 관리자 상단 + 학원별 수업현황 검색 실제 작동');
})();
