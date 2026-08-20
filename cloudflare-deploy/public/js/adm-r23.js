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
  // 2) 학원별 수업현황 검색 — 실데이터 (2026-08-19)
  //    이전엔 admin.html 에 박힌 데모 16행(데모지사1·데모학당A~F)을 DOM에서 숨기기만
  //    했었다. 지금은 /api/admin/attendance/school-stats 를 직접 불러 그린다.
  //    지사·학당 드롭다운도 같은 API 의 ?meta=1 로 «서버가 이미 스코프로 자른» 실제
  //    (지사,학당) 조합에서 채운다 — smFillAgencyFilter() 와 같은 원칙.
  // ============================================================
  var saPairs = [];         // [{franchise, shop_name}] — meta 로 받은 실제 조합
  var saOffset = 0;
  var SA_PAGE = 100;

  function saEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }); }

  function saFillSelect(sel, values, placeholder){
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '<option value="">' + placeholder + '</option>' +
      values.map(function(v){ return '<option value="' + saEsc(v) + '">' + saEsc(v) + '</option>'; }).join('');
    if (keep && values.indexOf(keep) >= 0) sel.value = keep;
  }

  function saRefreshAcademyOptions(){
    var branchSel = document.getElementById('sa-branch');
    var academySel = document.getElementById('sa-academy');
    if (!academySel) return;
    var branch = branchSel ? branchSel.value : '';
    var shops = Array.from(new Set(
      saPairs.filter(function(p){ return !branch || p.franchise === branch; })
             .map(function(p){ return p.shop_name; }).filter(Boolean)
    )).sort(function(a,b){ return a.localeCompare(b,'ko'); });
    saFillSelect(academySel, shops, '전체 학당');
  }

  async function saLoadMeta(){
    try {
      var r = await fetch('/api/admin/attendance/school-stats?meta=1', { cache: 'no-store', credentials: 'include' });
      var d = await r.json();
      if (!d || !d.ok) return;
      saPairs = Array.isArray(d.pairs) ? d.pairs : [];
      var branches = Array.from(new Set(saPairs.map(function(p){ return p.franchise; }).filter(Boolean)))
        .sort(function(a,b){ return a.localeCompare(b,'ko'); });
      saFillSelect(document.getElementById('sa-branch'), branches, '전체 지사');
      saRefreshAcademyOptions();
    } catch (e) { console.warn('[ph120] 지사·학당 목록 로드 실패', e); }
  }

  function saResultBadge(rate){
    if (rate === null || rate === undefined) return { cls: '', label: '—' };
    if (rate >= 90) return { cls: 'excellent', label: 'Excellent' };
    if (rate >= 70) return { cls: 'warning', label: 'Warning' };
    return { cls: 'fail', label: 'Fail' };
  }

  function saRenderRows(items, total, append, startOffset){
    var tbody = document.getElementById('sa-tbody');
    if (!tbody) return;
    if (!items.length && !append) {
      tbody.innerHTML = '<tr><td colspan="11" class="sa-sub" style="text-align:center;padding:16px">⚠ 조건에 맞는 학생이 없습니다</td></tr>';
      return;
    }
    var html = items.map(function(it, i){
      var no = startOffset + i + 1;
      var absentN = Math.max(0, (it.total_n||0) - (it.attended_n||0));
      var rate = (it.rate === null || it.rate === undefined) ? null : Number(it.rate);
      var badge = saResultBadge(rate);
      var barCls = badge.cls || 'fail';
      var width = rate === null ? 0 : rate;
      var resultCell = rate === null
        ? '<span class="sa-sub">데이터없음</span>'
        : '<span class="sa-result ' + badge.cls + '">' + badge.label + '</span>';
      return '<tr>' +
        '<td>' + no + '</td>' +
        '<td>' + saEsc(it.franchise || '—') + '</td>' +
        '<td>' + saEsc(it.shop_name || '—') + '</td>' +
        '<td>' + saEsc(it.name || '') + '</td>' +
        '<td>' + saEsc(it.english_name || '') + '</td>' +
        '<td>' + saEsc(it.user_id || '') + '</td>' +
        '<td>' + absentN + '</td>' +
        '<td>' + (it.attended_n||0) + '/' + (it.total_n||0) + '</td>' +
        '<td>' + (rate === null ? '—' : rate + '%') + '</td>' +
        '<td>' + resultCell + '</td>' +
        '<td><span class="sa-rate-bar"><span class="sa-rate-fill ' + barCls + '" style="width:' + width + '%"></span></span></td>' +
        '</tr>';
    }).join('');
    if (append) tbody.insertAdjacentHTML('beforeend', html); else tbody.innerHTML = html;
  }

  function saRenderKpi(kpi){
    window.__saLastKpi = kpi || {};
    var rateEl = document.getElementById('sa-kpi-rate');
    var schoolsEl = document.getElementById('sa-kpi-schools');
    var studentsEl = document.getElementById('sa-kpi-students');
    var riskEl = document.getElementById('sa-kpi-risk');
    if (rateEl) rateEl.textContent = (kpi && kpi.rate != null) ? kpi.rate + '%' : '—';
    if (schoolsEl) schoolsEl.textContent = (kpi && kpi.schools != null) ? kpi.schools + '개' : '—';
    if (studentsEl) studentsEl.textContent = (kpi && kpi.students != null) ? kpi.students.toLocaleString('ko-KR') + '명' : '—';
    if (riskEl) riskEl.textContent = (kpi && kpi.risk != null) ? kpi.risk + '명' : '—';
  }

  function saQueryString(offset){
    var year = (document.getElementById('sa-year')||{}).value || '';
    var month = (document.getElementById('sa-month')||{}).value || '';
    var branch = (document.getElementById('sa-branch')||{}).value || '';
    var academy = (document.getElementById('sa-academy')||{}).value || '';
    var student = ((document.getElementById('sa-student')||{}).value || '').trim();
    var result = (document.getElementById('sa-result')||{}).value || '';
    var qs = 'limit=' + SA_PAGE + '&offset=' + (offset||0);
    if (year) qs += '&year=' + encodeURIComponent(year);
    if (month) qs += '&month=' + encodeURIComponent(month);
    if (branch) qs += '&franchise=' + encodeURIComponent(branch);
    if (academy) qs += '&shop_name=' + encodeURIComponent(academy);
    if (student) qs += '&q=' + encodeURIComponent(student);
    if (result) qs += '&result=' + encodeURIComponent(result);
    return qs;
  }

  async function saFetch(offset, append){
    var tbody = document.getElementById('sa-tbody');
    if (!append && tbody) tbody.innerHTML = '<tr><td colspan="11" class="sa-sub" style="text-align:center;padding:16px">불러오는 중...</td></tr>';
    var note = document.getElementById('sa-list-note');
    var moreWrap = document.getElementById('sa-loadmore-wrap');
    try {
      var r = await fetch('/api/admin/attendance/school-stats?' + saQueryString(offset), { cache: 'no-store', credentials: 'include' });
      var d = await r.json();
      if (!d || !d.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
      saRenderRows(d.items || [], d.total || 0, !!append, offset||0);
      saOffset = (offset||0) + (d.items||[]).length;
      saRenderKpi(d.kpi);
      if (note) {
        note.textContent = '📌 ' + (d.total||0).toLocaleString('ko-KR') + '명 중 ' + saOffset.toLocaleString('ko-KR') + '명 표시' +
          (d.scope && d.scope.type && d.scope.type !== 'hq' && d.scope.type !== 'none' ? ' · 범위: ' + d.scope.label : '');
      }
      if (moreWrap) {
        moreWrap.innerHTML = (saOffset < (d.total||0))
          ? '<button class="sa-btn-search" onclick="saLoadMore()">⬇ 더 보기 (' + ((d.total||0) - saOffset).toLocaleString('ko-KR') + '명 더)</button>'
          : '';
      }
    } catch (e) {
      console.warn('[ph120] 학원별 수업현황 조회 실패', e);
      if (!append && tbody) tbody.innerHTML = '<tr><td colspan="11" class="sa-sub" style="text-align:center;padding:16px;color:#FCA5A5">⚠ 불러오기 실패: ' + saEsc(e.message||e) + '</td></tr>';
    }
  }

  window.saSearch = function(){
    saRefreshAcademyOptions();
    saOffset = 0;
    saFetch(0, false);
  };

  window.saLoadMore = function(){ saFetch(saOffset, true); };

  // 초기화
  window.saReset = function(){
    ['sa-year','sa-month','sa-branch','sa-academy','sa-student','sa-result'].forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    saSearch();
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

  // 학원별 수업현황 카드 — 처음 발견될 때 한 번만 지사·학당 목록 + 첫 조회를 부른다
  function ph120InitSchoolStats(){
    var tbody = document.getElementById('sa-tbody');
    if (!tbody || tbody.__ph120) return;
    tbody.__ph120 = true;
    saLoadMeta().then(function(){ saSearch(); });
  }

  // 초기 + 주기 실행
  function ph120Init(){
    ph120FixHomeBtn();
    ph120BindEnter();
    ph120InitSchoolStats();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph120Init);
  else ph120Init();
  (window.__admSettleRun ? window.__admSettleRun(ph120Init) : setInterval(ph120Init, 1500));

  console.log('[ph120] 홈 버튼 → 관리자 상단 + 학원별 수업현황 검색 실제 작동');
})();
