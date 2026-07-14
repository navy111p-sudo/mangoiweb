// ═══════════════════════════════════════════════════════════════
// adm-r27.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ============================================================
  // 1) MBTI 폼 — 강사 사진 업로드 필드 추가
  // ============================================================
  function ph130AddMbtiPhoto(){
    var uidInput = document.getElementById('mbti-uid');
    if (!uidInput || document.getElementById('ph130-mbti-photo-wrap')) return;
    var formGrid = uidInput.closest('div[style*="grid-template-columns"]');
    if (!formGrid || !formGrid.parentElement) return;

    var wrap = document.createElement('div');
    wrap.id = 'ph130-mbti-photo-wrap';
    wrap.innerHTML =
      '<div id="ph130-mbti-photo-preview" onclick="document.getElementById(\'ph130-mbti-photo-input\').click()">' +
        '📷' +
      '</div>' +
      '<div id="ph130-mbti-photo-controls">' +
        '<label>📸 강사 사진 (학생 매칭 페이지에 표시)</label>' +
        '<input type="file" id="ph130-mbti-photo-input" accept="image/*" onchange="ph130HandlePhoto(this)">' +
        '<button type="button" id="ph130-mbti-photo-btn" onclick="document.getElementById(\'ph130-mbti-photo-input\').click()">📁 사진 선택</button>' +
        '<button type="button" id="ph130-mbti-photo-remove" onclick="ph130RemovePhoto()">✕ 제거</button>' +
        '<div id="ph130-mbti-photo-name">권장: 정사각형 · 200×200 이상 · JPG/PNG · 최대 2MB</div>' +
      '</div>';

    // 사진 영역을 폼 grid 위에 삽입
    formGrid.parentElement.insertBefore(wrap, formGrid);
    console.log('[ph130] MBTI 강사 사진 업로드 필드 추가');
  }

  window.ph130HandlePhoto = function(input){
    var file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('파일 크기 2MB 이하만 가능합니다.'); input.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function(e){
      var preview = document.getElementById('ph130-mbti-photo-preview');
      preview.innerHTML = '<img src="' + e.target.result + '" alt="강사 사진">';
      document.getElementById('ph130-mbti-photo-name').textContent = '✅ ' + file.name + ' (' + Math.round(file.size/1024) + 'KB)';
      document.getElementById('ph130-mbti-photo-remove').classList.add('show');
      // base64 를 window 에 저장해서 mbtiSave() 가 같이 전송 가능
      window.__ph130MbtiPhotoBase64 = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  window.ph130RemovePhoto = function(){
    document.getElementById('ph130-mbti-photo-preview').innerHTML = '📷';
    document.getElementById('ph130-mbti-photo-input').value = '';
    document.getElementById('ph130-mbti-photo-name').textContent = '권장: 정사각형 · 200×200 이상 · JPG/PNG · 최대 2MB';
    document.getElementById('ph130-mbti-photo-remove').classList.remove('show');
    delete window.__ph130MbtiPhotoBase64;
  };

  // ============================================================
  // 2) ph128 다중 필터 input 에 자동완성 드롭다운 부착
  // ============================================================
  function ph130AddAutocomplete(){
    document.querySelectorAll('.ph128-filter-input').forEach(function(input){
      if (input.__ph130) return;
      input.__ph130 = true;
      var th = input.closest('th');
      if (!th) return;
      th.classList.add('ph130-autocomplete-wrap');

      var dropdown = document.createElement('div');
      dropdown.className = 'ph130-autocomplete-dropdown';
      th.appendChild(dropdown);

      var tbodyId = input.dataset.tbody;
      var col = parseInt(input.dataset.col, 10);

      // 컬럼의 unique 값들 수집
      function collectValues(){
        var tbody = document.getElementById(tbodyId);
        if (!tbody) return [];
        var values = {};
        tbody.querySelectorAll('tr').forEach(function(row){
          var cells = row.querySelectorAll('td');
          if (cells[col]) {
            var v = cells[col].textContent.trim();
            if (v && v.length < 80) values[v] = true;
          }
        });
        return Object.keys(values).sort();
      }

      function showSuggestions(){
        var q = input.value.toLowerCase().trim();
        var values = collectValues();
        var matches = q ? values.filter(function(v){ return v.toLowerCase().indexOf(q) >= 0; }) : values;
        matches = matches.slice(0, 12);

        if (matches.length === 0) {
          dropdown.innerHTML = '<div class="ph130-autocomplete-empty">매칭 없음</div>';
        } else {
          dropdown.innerHTML = matches.map(function(v){
            var safe = v.replace(/'/g, "&#39;").replace(/"/g, '&quot;');
            var highlighted = v;
            if (q) {
              var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
              highlighted = v.replace(re, '<mark>$1</mark>');
            }
            return '<div class="ph130-autocomplete-item" data-val="' + safe + '">' + highlighted + '</div>';
          }).join('');
        }
        dropdown.classList.add('show');

        // 클릭 이벤트
        dropdown.querySelectorAll('.ph130-autocomplete-item').forEach(function(item){
          item.addEventListener('mousedown', function(e){
            e.preventDefault();
            input.value = item.dataset.val;
            input.classList.add('has-value');
            dropdown.classList.remove('show');
            // ph128 필터 트리거
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
          });
        });
      }

      input.addEventListener('focus', showSuggestions);
      input.addEventListener('input', showSuggestions);
      input.addEventListener('blur', function(){
        setTimeout(function(){ dropdown.classList.remove('show'); }, 180);
      });
      input.addEventListener('keydown', function(e){
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          var items = dropdown.querySelectorAll('.ph130-autocomplete-item');
          if (!items.length) return;
          var active = dropdown.querySelector('.ph130-autocomplete-item.active');
          var idx = active ? Array.prototype.indexOf.call(items, active) : -1;
          if (active) active.classList.remove('active');
          idx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
          items[idx].classList.add('active');
          items[idx].scrollIntoView({ block:'nearest' });
        } else if (e.key === 'Enter') {
          var active = dropdown.querySelector('.ph130-autocomplete-item.active');
          if (active) {
            e.preventDefault();
            input.value = active.dataset.val;
            input.classList.add('has-value');
            dropdown.classList.remove('show');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else if (e.key === 'Escape') {
          dropdown.classList.remove('show');
        }
      });
    });
  }

  function ph130Init(){
    ph130AddMbtiPhoto();
    ph130AddAutocomplete();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph130Init);
  else ph130Init();
  setInterval(ph130Init, 2000);

  console.log('[ph130] MBTI 강사 사진 업로드 + 다중 필터 자동완성 활성');
})();
