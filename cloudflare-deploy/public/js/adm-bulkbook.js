/* adm-bulkbook.js — 📚 학생 교재 일괄 배정 (2026-07-21)
   학생관리 > 학생 목록 툴바에 [📚 일괄 교재 배정] 버튼을 주입하고, 모달에서
   교재(카탈로그 /api/admin/textbooks) 선택 → dry 미리보기(대상 인원수) → 실행.
   서버: POST /api/admin/students/bulk-assign-textbook (스코프 격리·미배정만 기본).
   배정 결과는 화상수업 입장 시 '배정 교재 자동 로드'(students_erp.textbook)가 읽는다. */
(function(){
  'use strict';
  function $(id){ return document.getElementById(id); }
  function isEn(){ try { return localStorage.getItem('adminLang') === 'en' || localStorage.getItem('mango_lang') === 'en'; } catch(e){ return false; } }
  function T(ko, en){ return isEn() ? en : ko; }

  var lastPreview = null;   // 마지막 dry 결과 { targets, ... } — 실행 전 미리보기 강제용

  function injectButton(){
    var loadBtn = $('sm-load-students');
    if (!loadBtn || $('sm-bulk-assign-textbook')) return;
    var bar = loadBtn.parentElement;
    var btn = document.createElement('button');
    btn.id = 'sm-bulk-assign-textbook'; btn.type = 'button';
    btn.setAttribute('data-ko', '📚 일괄 교재 배정'); btn.setAttribute('data-en', '📚 Bulk Assign Textbook');
    btn.textContent = T('📚 일괄 교재 배정', '📚 Bulk Assign Textbook');
    btn.style.cssText = 'padding:5px 12px;font-size:12px;border:1px solid rgba(59,130,246,.5);border-radius:8px;background:rgba(59,130,246,.12);color:#1d4ed8;font-weight:800;cursor:pointer;white-space:nowrap';
    btn.onclick = openModal;
    var csv = $('sm-export-csv');
    if (csv && csv.parentElement === bar && csv.nextSibling) bar.insertBefore(btn, csv.nextSibling);
    else bar.appendChild(btn);
  }

  function buildModal(){
    if ($('bat-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'bat-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99990;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:460px;width:100%;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#1c1917">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
          '<span style="font-size:16px;font-weight:900">📚 ' + T('교재 일괄 배정', 'Bulk Textbook Assignment') + '</span>' +
          '<button id="bat-close" type="button" style="margin-left:auto;border:none;background:none;font-size:18px;cursor:pointer;color:#6b7280">✕</button>' +
        '</div>' +
        '<label style="display:block;font-size:12px;font-weight:800;margin-bottom:4px">' + T('배정할 교재', 'Textbook') + '</label>' +
        '<select id="bat-book" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:10px"><option value="">' + T('불러오는 중…', 'Loading…') + '</option></select>' +
        '<label style="display:block;font-size:12px;font-weight:800;margin-bottom:4px">' + T('레벨 (선택 — 비우면 기존 유지)', 'Level (optional — keep existing if empty)') + '</label>' +
        '<input id="bat-level" type="text" placeholder="예: A1" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:10px" />' +
        '<label style="display:block;font-size:12px;font-weight:800;margin-bottom:4px">' + T('학생 검색어 (선택 — 이름/아이디 일부)', 'Student filter (optional — name/ID)') + '</label>' +
        '<input id="bat-q" type="text" placeholder="' + T('비우면 권한 범위 내 전체', 'Empty = all in your scope') + '" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:10px" />' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:12px;cursor:pointer">' +
          '<input id="bat-empty" type="checkbox" checked /> ' + T('교재 미배정 학생만 (권장)', 'Only students with no textbook (recommended)') +
        '</label>' +
        '<div id="bat-status" style="min-height:20px;font-size:12.5px;font-weight:700;color:#92400e;margin-bottom:12px"></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button id="bat-preview" type="button" style="padding:8px 14px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;font-weight:800;cursor:pointer">🔍 ' + T('대상 미리보기', 'Preview targets') + '</button>' +
          '<button id="bat-run" type="button" disabled style="padding:8px 14px;font-size:13px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer;opacity:.5">✅ ' + T('배정 실행', 'Assign') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if (e.target === ov) closeModal(); });
    $('bat-close').onclick = closeModal;
    $('bat-preview').onclick = doPreview;
    $('bat-run').onclick = doRun;
    // 조건이 바뀌면 미리보기 무효화 (본 것과 다른 대상에 실행되는 사고 방지)
    ['bat-book', 'bat-level', 'bat-q', 'bat-empty'].forEach(function(id){
      $(id).addEventListener('change', invalidatePreview);
      $(id).addEventListener('input', invalidatePreview);
    });
    // 교재 선택 시 카탈로그의 레벨 자동 채움
    $('bat-book').addEventListener('change', function(){
      var opt = this.options[this.selectedIndex];
      if (opt && opt.dataset && opt.dataset.level) $('bat-level').value = opt.dataset.level;
    });
  }

  function invalidatePreview(){
    lastPreview = null;
    var run = $('bat-run');
    if (run) { run.disabled = true; run.style.opacity = '.5'; }
    var st = $('bat-status');
    if (st) st.textContent = '';
  }

  function closeModal(){ var ov = $('bat-overlay'); if (ov) ov.style.display = 'none'; }

  function openModal(){
    buildModal();
    invalidatePreview();
    $('bat-overlay').style.display = 'flex';
    loadBooks();
  }

  function loadBooks(){
    var sel = $('bat-book');
    if (sel.dataset.loaded === '1') return;
    fetch('/api/admin/textbooks', { credentials: 'include' })
      .then(function(r){ return r.json(); })
      .then(function(j){
        var items = (j && j.items) || [];
        if (!items.length) { sel.innerHTML = '<option value="">' + T('등록된 교재가 없습니다 — 교재 관리에서 먼저 등록', 'No textbooks — add one first') + '</option>'; return; }
        sel.innerHTML = '<option value="">' + T('— 교재 선택 —', '— Select textbook —') + '</option>' + items.map(function(b){
          var lv = b.level ? (' (' + b.level + ')') : '';
          return '<option value="' + String(b.title).replace(/"/g, '&quot;') + '" data-level="' + String(b.level || '').replace(/"/g, '&quot;') + '">' + b.title + lv + '</option>';
        }).join('');
        sel.dataset.loaded = '1';
      })
      .catch(function(){ sel.innerHTML = '<option value="">' + T('교재 목록 로드 실패', 'Failed to load textbooks') + '</option>'; });
  }

  function payload(dry){
    return {
      textbook_title: $('bat-book').value,
      level: $('bat-level').value.trim(),
      q: $('bat-q').value.trim(),
      only_empty: $('bat-empty').checked,
      dry: !!dry
    };
  }

  function post(body){
    return fetch('/api/admin/students/bulk-assign-textbook', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r){ return r.json(); });
  }

  function doPreview(){
    var st = $('bat-status');
    if (!$('bat-book').value) { st.textContent = '⚠️ ' + T('교재를 먼저 선택하세요', 'Select a textbook first'); return; }
    st.textContent = T('대상 계산 중…', 'Counting…');
    post(payload(true)).then(function(j){
      if (!j || !j.ok) { st.textContent = '❌ ' + ((j && j.error) || T('실패', 'Failed')); return; }
      lastPreview = j;
      st.textContent = '🎯 ' + T('대상 학생: ', 'Targets: ') + j.targets + T('명', ' students') + ($('bat-empty').checked ? T(' (미배정만)', ' (unassigned only)') : '');
      var run = $('bat-run');
      run.disabled = j.targets === 0;
      run.style.opacity = j.targets === 0 ? '.5' : '1';
    }).catch(function(){ st.textContent = '❌ ' + T('요청 실패', 'Request failed'); });
  }

  function doRun(){
    if (!lastPreview) return;
    var st = $('bat-status');
    var n = lastPreview.targets;
    var title = $('bat-book').value;
    if (!confirm(T(n + '명에게 "' + title + '" 교재를 배정할까요?', 'Assign "' + title + '" to ' + n + ' students?'))) return;
    var body = payload(false);
    if (n > 2000) {
      if (!confirm(T('⚠️ 대상이 ' + n + '명으로 많습니다. 정말 전체에 실행할까요?', '⚠️ ' + n + ' targets is a lot. Really run for all?'))) return;
      body.force = true;
    }
    st.textContent = T('배정 실행 중…', 'Assigning…');
    post(body).then(function(j){
      if (!j || !j.ok) { st.textContent = '❌ ' + ((j && j.error) || T('실패', 'Failed')); return; }
      st.textContent = '✅ ' + T('배정 완료: ', 'Assigned: ') + j.updated + T('명', ' students');
      invalidatePreviewKeepMsg(st.textContent);
      try { var reload = $('sm-load-students'); if (reload) reload.click(); } catch(e){}
    }).catch(function(){ st.textContent = '❌ ' + T('요청 실패', 'Request failed'); });
  }

  function invalidatePreviewKeepMsg(msg){
    lastPreview = null;
    var run = $('bat-run');
    if (run) { run.disabled = true; run.style.opacity = '.5'; }
    var st = $('bat-status');
    if (st && msg) st.textContent = msg;
  }

  // 학생관리 카드가 lazy 렌더될 수 있어 주기적으로 버튼 주입 시도 (있으면 no-op)
  if (document.readyState !== 'loading') injectButton();
  else document.addEventListener('DOMContentLoaded', injectButton);
  setInterval(injectButton, 2000);
})();
