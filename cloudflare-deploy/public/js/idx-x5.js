// ═══════════════════════════════════════════════════════════════
// idx-x5.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  /* ph64 카드 텍스트를 "날짜로 선택" / "교사로 선택" 으로 동적 변경 */
  function ph71RewriteCards(){
    if (!window.matchMedia('(max-width: 900px)').matches) return; // PC 는 원래 카드 그대로
    document.querySelectorAll('.ph64-mode-pick:not([data-ph71-rewritten])').forEach(function(pick){
      pick.dataset.ph71Rewritten = '1';
      var labels = pick.querySelectorAll('.ph64-label');
      var descs  = pick.querySelectorAll('.ph64-desc');
      var icons  = pick.querySelectorAll('.ph64-icon');
      // 첫 번째 카드 (파란): 날짜로 선택
      if (labels[0]) labels[0].textContent = '날짜로 선택';
      if (descs[0])  descs[0].textContent  = '원하는 날짜·시간 직접 선택';
      if (icons[0])  icons[0].textContent  = '📅';
      // 두 번째 카드 (초록): 교사로 선택
      if (labels[1]) labels[1].textContent = '교사로 선택';
      if (descs[1])  descs[1].textContent  = '교사 선택 후 가능 시간 선택';
      if (icons[1])  icons[1].textContent  = '👨‍🏫';

      // 두 번째 카드 클릭 = 교사 모드 (drag → teacher 모드 매핑)
      var dragCard = pick.querySelector('.ph64-card.ph64-drag');
      if (dragCard) {
        dragCard.dataset.mode = 'teacher';
        // 기존 click 핸들러 무효화하고 새로 바인딩
        var newCard = dragCard.cloneNode(true);
        dragCard.parentNode.replaceChild(newCard, dragCard);
        newCard.addEventListener('click', function(e){
          e.preventDefault(); e.stopPropagation();
          var modal = document.querySelector('.lc-modal[data-ph64="1"]');
          if (modal) {
            modal.classList.remove('ph64-mode-time', 'ph64-mode-drag', 'ph71-mode-teacher-time');
            modal.classList.add('ph71-mode-teacher');
            ph71BuildTeacherPicker(modal);
          }
          pick.classList.add('ph64-hidden');
        });
        newCard.addEventListener('touchend', function(e){ e.preventDefault(); newCard.click(); });
      }
    });
  }

  /* 교사 picker — 교사 리스트 + 클릭 시 시간 picker (모바일 한정) */
  function ph71BuildTeacherPicker(modal){
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    if (modal.querySelector('.ph71-teacher-picker')) return;

    var body = modal.querySelector('.lc-body') || modal;
    var picker = document.createElement('div');
    picker.className = 'ph71-teacher-picker';

    // 교사 데이터 — window.demoTeachers 우선, 없으면 fallback
    var teachers = [];
    try {
      if (window.demoTeachers && Array.isArray(window.demoTeachers)) {
        teachers = window.demoTeachers;
      }
    } catch(e){}
    if (!teachers.length) {
      // lcPicker.teachers 또는 cls 데이터에서
      try {
        if (window.lcPicker && window.lcPicker.teachers) teachers = window.lcPicker.teachers;
      } catch(e){}
    }
    if (!teachers.length) {
      teachers = [
        { id:'t12', name:'Teacher Ana',    ico:'🇵🇭' },
        { id:'t21', name:'Karl',           ico:'🇵🇭' },
        { id:'t17', name:'Mo',             ico:'🇺🇸' },
        { id:'t30', name:'중국어 강선생님', ico:'🇨🇳' },
      ];
    }

    var teacherCards = teachers.map(function(t){
      return '<button type="button" class="ph71-teacher-btn" data-tid="' + t.id + '" data-tname="' + (t.name||'') + '">' +
             '<span class="ph71-teacher-ico">' + (t.ico || '👨‍🏫') + '</span>' +
             (t.name || '강사') +
             '</button>';
    }).join('');

    picker.innerHTML =
      '<div class="ph71-teacher-title">👨‍🏫 교사를 선택해 주세요</div>' +
      '<div class="ph71-teacher-grid">' + teacherCards + '</div>';
    body.appendChild(picker);

    picker.querySelectorAll('.ph71-teacher-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var tid = btn.dataset.tid;
        var tname = btn.dataset.tname;
        try {
          if (window.lcPicker) {
            window.lcPicker.pickedTeacherId = tid;
            window.lcPicker.pickedTeacherName = tname;
            if (window.demoTeachers) {
              window.lcPicker.pickedTeacher = window.demoTeachers.find(function(t){ return t.id === tid; });
            }
          }
        } catch(e){}
        // 시간 picker 로 전환
        picker.style.display = 'none';
        modal.classList.remove('ph71-mode-teacher');
        modal.classList.add('ph71-mode-teacher-time');
        ph71EnsureTimePicker(modal, tname);
      });
    });
  }

  /* 시간 picker (날짜/시간/분 큰 버튼) */
  function ph71EnsureTimePicker(modal, teacherName){
    var existing = modal.querySelector('.ph69-time-picker');
    if (existing) {
      existing.style.display = 'block';
      // 교사 이름 업데이트
      var subtitle = existing.querySelector('.ph71-time-subtitle');
      if (subtitle && teacherName) subtitle.textContent = '👨‍🏫 ' + teacherName + ' 강사 시간 선택';
      return;
    }

    var body = modal.querySelector('.lc-body') || modal;
    var picker = document.createElement('div');
    picker.className = 'ph69-time-picker';

    // 컨텍스트 verb
    var head = modal.querySelector('.lc-head, h2');
    var verb = '변경';
    if (head && /연기/.test(head.textContent || '')) verb = '연기';

    var today = new Date();
    var ymd = today.toISOString().slice(0,10);
    var dateOpts = '';
    for (var i = 0; i < 14; i++) {
      var d = new Date(today); d.setDate(d.getDate() + i);
      var iso = d.toISOString().slice(0,10);
      var lbl = (d.getMonth()+1) + '/' + d.getDate() + ' (' + ['일','월','화','수','목','금','토'][d.getDay()] + ')';
      dateOpts += '<button type="button" class="ph69-date-btn' + (i===0?' active':'') +
                  '" data-date="' + iso + '">' + lbl + '</button>';
    }
    var hourOpts = '';
    for (var h = 9; h <= 22; h++) {
      hourOpts += '<button type="button" class="ph69-hour-btn' + (h===14?' active':'') +
                  '" data-hour="' + h + '">' + (h<10?'0':'') + h + '</button>';
    }
    var minOpts = '';
    ['00','10','20','30','40','50'].forEach(function(m){
      minOpts += '<button type="button" class="ph69-min-btn' + (m==='00'?' active':'') +
                 '" data-min="' + m + '">' + m + '</button>';
    });

    picker.innerHTML =
      '<button type="button" class="ph69-back-to-pick">◀ 다시 선택</button>' +
      (teacherName ? '<div class="ph71-time-subtitle" style="color:#93c5fd;font-size:13px;margin-bottom:12px;font-weight:700">👨‍🏫 ' + teacherName + ' 강사 시간 선택</div>' : '') +
      '<div class="ph69-section">' +
        '<div class="ph69-label">📅 날짜 선택</div>' +
        '<div class="ph69-grid ph69-grid-date">' + dateOpts + '</div>' +
      '</div>' +
      '<div class="ph69-section">' +
        '<div class="ph69-label">🕐 시간</div>' +
        '<div class="ph69-grid ph69-grid-hour">' + hourOpts + '</div>' +
      '</div>' +
      '<div class="ph69-section">' +
        '<div class="ph69-label">⏱ 분</div>' +
        '<div class="ph69-grid ph69-grid-min">' + minOpts + '</div>' +
      '</div>' +
      '<div class="ph69-summary">' +
        '<span class="ph69-summary-label">선택된 시간</span>' +
        '<span class="ph69-summary-value" id="ph69-summary-2">' + ymd + ' 14:00</span>' +
      '</div>' +
      '<button type="button" class="ph69-confirm" id="ph69-apply-2">✓ 이 시간으로 ' + verb + '</button>';

    body.appendChild(picker);

    var state = { date: ymd, hour: 14, min: '00' };
    function updateSummary(){
      var disp = state.date + ' ' + (state.hour<10?'0':'') + state.hour + ':' + state.min;
      var sum = picker.querySelector('#ph69-summary');
      if (sum) sum.textContent = disp;
    }
    function setActive(group, target){
      picker.querySelectorAll('.' + group).forEach(function(b){ b.classList.toggle('active', b === target); });
    }
    picker.querySelectorAll('.ph69-date-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ state.date = btn.dataset.date; setActive('ph69-date-btn', btn); updateSummary(); });
    });
    picker.querySelectorAll('.ph69-hour-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ state.hour = parseInt(btn.dataset.hour, 10); setActive('ph69-hour-btn', btn); updateSummary(); });
    });
    picker.querySelectorAll('.ph69-min-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ state.min = btn.dataset.min; setActive('ph69-min-btn', btn); updateSummary(); });
    });
    picker.querySelector('.ph69-back-to-pick').addEventListener('click', function(){
      // 다시 카드 선택 화면으로
      modal.classList.remove('ph64-mode-time', 'ph71-mode-teacher-time', 'ph71-mode-teacher');
      var pick = document.querySelector('.ph64-mode-pick');
      if (pick) pick.classList.remove('ph64-hidden');
      picker.style.display = 'none';
      var tp = modal.querySelector('.ph71-teacher-picker');
      if (tp) tp.style.display = 'none';
    });
    picker.querySelector('#ph69-apply').addEventListener('click', function(){
      var d = state.date;
      var t = (state.hour<10?'0':'') + state.hour + ':' + state.min;
      try {
        if (window.lcPicker) { window.lcPicker.pickedDate = d; window.lcPicker.pickedHour = t; }
        var btn = modal.querySelector('[onclick*="lcConfirm"], [onclick*="confirmChange"], .lc-confirm');
        if (btn) { btn.click(); return; }
        alert('✅ ' + verb + ': ' + d + ' ' + t);
      } catch(e) { alert('새 시간: ' + d + ' ' + t); }
    });
  }

  /* 날짜로 선택 (파란 카드) 클릭 시 시간 picker 바로 */
  function ph71HandleDateCard(){
    if (!window.matchMedia('(max-width: 900px)').matches) return; // PC 는 원래 동작
    document.querySelectorAll('.ph64-card.ph64-time:not([data-ph71-bound])').forEach(function(card){
      card.dataset.ph71Bound = '1';
      card.addEventListener('click', function(){
        var modal = document.querySelector('.lc-modal[data-ph64="1"]');
        if (modal) ph71EnsureTimePicker(modal, null);
      });
    });
  }

  function ph71Tick(){
    ph71RewriteCards();
    ph71HandleDateCard();
  }
  setInterval(ph71Tick, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph71Tick);
  else ph71Tick();
})();
