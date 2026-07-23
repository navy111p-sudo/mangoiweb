// ═══════════════════════════════════════════════════════════════
// adm-q6.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var ph54State = {
    weekOffset: 0,         // 0 = 이번 주, -1 = 지난 주, +1 = 다음 주
    teacherFilter: '',     // '' = 전체, 또는 강사 id
    teachers: [],          // [{id, name, korean_name, english_name}]
    records: []            // [{teacher_id, teacher_name, date, scheduled, actual, late_min}]
  };

  function ph54Pad(n){ return n < 10 ? '0'+n : ''+n; }
  function ph54FmtDate(d){ return d.getFullYear()+'-'+ph54Pad(d.getMonth()+1)+'-'+ph54Pad(d.getDate()); }
  function ph54StartOfWeek(d){
    var x = new Date(d); var dow = x.getDay();
    var diff = (dow === 0 ? -6 : 1 - dow);  // 월요일 시작
    x.setDate(x.getDate() + diff);
    x.setHours(0,0,0,0);
    return x;
  }

  function ph54GetWeekDays(){
    var base = ph54StartOfWeek(new Date());
    base.setDate(base.getDate() + ph54State.weekOffset * 7);
    return Array.from({length:7}, function(_,i){
      var d = new Date(base);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  async function ph54LoadTeachers(){
    try {
      var r = await fetch('/api/admin/teacher-profiles?status=활동중', { credentials:'include', cache:'no-store' });
      var j = await r.json();
      if (j && j.ok && Array.isArray(j.items) && j.items.length) {
        ph54State.teachers = j.items.map(function(t){
          return { id: t.id, name: t.korean_name || t.english_name || ('강사 '+t.id) };
        });
        return;
      }
    } catch(e){ console.warn('[ph54] teacher load', e); }
    // fallback — 클라이언트 시드
    ph54State.teachers = ['Karl','Melca','Mo','Penny','Chaine'].map(function(n,i){
      return { id: 't'+i, name: n };
    });
  }

  async function ph54LoadRecords(){
    // 🗓 강사 '수업 스케줄'(class_schedules)을 로드한다.
    //    - /api/admin/schedules?week=<해당 주 월요일> 가 그 주(월~일)로 펼친 슬롯 배열을 돌려줌.
    //    - 각 슬롯의 teacher_id 는 teacher_profiles.id 와 동일하므로 강사 행과 그대로 매칭된다.
    //    - 표시 중인 주(weekOffset)에 맞춰 매번 다시 불러온다.
    var monday = ph54FmtDate(ph54GetWeekDays()[0]);   // 현재 보고 있는 주의 월요일
    try {
      // no-store 제거 → adm-perf 클라이언트 캐시(주별 60초) 적용. 드래그 이동(PATCH) 시 캐시 자동 무효화됨.
      var r = await fetch('/api/admin/schedules?week=' + monday, { credentials:'include' });
      if (r.ok) {
        var j = await r.json();
        var arr = (j && (j.schedules || j.items)) || [];
        ph54State.records = Array.isArray(arr) ? arr : [];
        return;
      }
    } catch(e){ console.warn('[ph54] schedules load', e); }
    ph54State.records = [];   // 실패 시 빈 상태(가짜 데이터로 채우지 않음)
  }

  // HTML 이스케이프 (학생 이름 등 안전 출력)
  function ph54Esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  // 수업 유형별 색/라벨
  var PH54_TYPE_COLOR = { '1on1':'#7c3aed', 'group':'#2563eb', 'temp':'#f59e0b', 'blocked':'#475569' };
  var PH54_TYPE_LABEL = { '1on1':'1:1', 'group':'그룹', 'temp':'대체', 'blocked':'휴무' };

  // 한 개 수업 슬롯 → 캘린더 블록 HTML (시간 · 인원 + 학생 이름)
  function ph54ClassBlock(s){
    var c   = PH54_TYPE_COLOR[s.type] || '#7c3aed';
    var stu = (s.students || []).map(function(x){ return x && x.name; }).filter(Boolean).join(', ');
    var lbl = stu || PH54_TYPE_LABEL[s.type] || '수업';
    var time= s.start_time || (s.hour != null ? (ph54Pad(s.hour)+':00') : '');
    var dur = s.duration_min ? (' · ' + s.duration_min + '분') : '';
    return '<span class="ph54-slot ph54-class" style="background:'+c+'" title="'
        + ph54Esc(time+' '+(PH54_TYPE_LABEL[s.type]||'')+(stu?(' · '+stu):'')) + '">'
      + '<b>'+ph54Esc(time)+'</b><span class="ph54-dur">'+ph54Esc(dur)+'</span>'
      + '<span class="ph54-stu">'+ph54Esc(lbl)+'</span>'
      + '</span>';
  }

  // ───────────────────────────────────────────────────────────────
  // 🗓 구글 캘린더 스타일 '주간 타임라인' 렌더
  //   · 세로축 = 06:00~24:00 (30분 스냅), 가로축 = 월~일
  //   · 수업(이벤트) 카드는 시작시간/지속시간에 따라 절대위치(top/height)로 배치
  //   · 카드 내부 = [시간·지속] + [학생 이름(말줄임)] + [수업유형]
  //   · HTML5 Drag&Drop 으로 다른 요일/시간으로 이동 → 토스트+콘솔로 변경 알림
  // ───────────────────────────────────────────────────────────────
  var PH54_START_H = 6, PH54_END_H = 24, PH54_HOUR_PX = 50, PH54_SNAP = 30; // 1시간=50px, 30분=25px

  // 'HH:MM' → 자정 기준 분. start_time 없으면 hour 사용.
  function ph54MinOf(s){
    var m = String(s.start_time||'').match(/(\d{1,2}):(\d{2})/);
    if (m) return (+m[1])*60 + (+m[2]);
    return (s.hour!=null ? s.hour : PH54_START_H) * 60;
  }
  // 분 → 'HH:MM'
  function ph54FmtMin(mins){ return ph54Pad(Math.floor(mins/60))+':'+ph54Pad(mins%60); }

  // 우하단 토스트(드래그 이동 결과 안내)
  function ph54Toast(msg){
    var t = document.getElementById('ph54-toast');
    if (!t){ t = document.createElement('div'); t.id = 'ph54-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(ph54Toast._t); ph54Toast._t = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }

  // 수업 슬롯 1개 → 캘린더 이벤트 카드 HTML (시작시간/지속에 따른 절대위치 top/height)
  //   item 예시: { teacher_id:5, date:'2026-06-24', start_time:'15:00', duration_min:60,
  //               type:'1on1', students:[{name:'홍길동'}] }
  function ph54EventCard(idx, s){
    var c        = PH54_TYPE_COLOR[s.type] || '#7c3aed';
    var startMin = ph54MinOf(s);
    var dur      = s.duration_min || 20;   // 기본 수업 20분(영어·중국어 공통, 2026-07-23)
    var top      = Math.max(0, (startMin - PH54_START_H*60) / 60 * PH54_HOUR_PX);   // 절대 y
    var height   = Math.max(dur / 60 * PH54_HOUR_PX, 22);                            // 지속시간 높이
    var timeTxt  = ph54FmtMin(startMin) + ' · ' + dur + '분';
    // 학생 이름: students[].name 우선, 없으면 유형 라벨로 폴백
    var student  = (s.students || []).map(function(x){ return x && x.name; }).filter(Boolean).join(', ');
    var nameTxt  = student || (s.type==='blocked' ? '휴무' : (PH54_TYPE_LABEL[s.type] || '수업'));
    var typeTxt  = PH54_TYPE_LABEL[s.type] || '';
    return '<div class="ph54-ev" draggable="true" data-idx="'+idx+'" '
      + 'style="top:'+top+'px;height:'+height+'px;background:'+c+'" '
      + 'title="'+ph54Esc(timeTxt+' · '+typeTxt+(student?(' · '+student):''))+'">'
      +   '<div class="ph54-ev-time">'+ph54Esc(timeTxt)+'</div>'
      +   '<div class="ph54-ev-name">'+ph54Esc(nameTxt)+'</div>'   /* ← 학생 이름 (말줄임 처리) */
      +   '<div class="ph54-ev-type">'+ph54Esc(typeTxt)+'</div>'
      + '</div>';
  }

  function ph54Render(){
    var wrap = document.getElementById('ph54-sched-wrap');
    if (!wrap) return;
    var days = ph54GetWeekDays();
    var todayStr = ph54FmtDate(new Date());
    var dayLabel = ['월','화','수','목','금','토','일'];
    var dowKeyByIdx = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var filterId = ph54State.teacherFilter;
    var bodyH = (PH54_END_H - PH54_START_H) * PH54_HOUR_PX;
    var weekLabel = ph54FmtDate(days[0]) + ' ~ ' + ph54FmtDate(days[6]);

    // 날짜 → 요일 컬럼 인덱스
    var dateToCol = {};
    days.forEach(function(d,i){ dateToCol[ph54FmtDate(d)] = i; });

    // 표시할 이벤트(현재 필터 강사 + 이번 주). 원본 배열 인덱스를 카드에 심어 드래그 후 갱신.
    var events = [];
    ph54State.records.forEach(function(r, idx){
      if (filterId && String(r.teacher_id) !== String(filterId)) return;
      if (!(r.date in dateToCol)) return;
      events.push({ idx: idx, rec: r, col: dateToCol[r.date] });
    });

    // ── 컨트롤 바
    var html = ''
      + '<div id="ph54-sched-controls">'
      +   '<button id="ph54-prev-week">◀ 이전 주</button>'
      +   '<button id="ph54-this-week" class="primary">📅 이번 주</button>'
      +   '<button id="ph54-next-week">다음 주 ▶</button>'
      +   '<span class="ph54-week-label" id="ph54-week-label">'+weekLabel+'</span>'
      +   '<span style="flex:1"></span>'
      +   '<label>강사 필터: '
      +     '<select id="ph54-teacher-filter" style="min-width:140px;margin-left:4px">'
      +       '<option value="">전체 강사 ('+ph54State.teachers.length+'명)</option>'
      +       ph54State.teachers.map(function(t){
                return '<option value="'+t.id+'"'+(String(filterId)===String(t.id)?' selected':'')+'>'+ph54Esc(t.name)+'</option>';
              }).join('')
      +     '</select>'
      +   '</label>'
      +   '<button id="ph54-clear-filter">전체 보기</button>'
      + '</div>';

    if (!filterId) {
      html += '<div class="ph54-hint">💡 특정 강사를 선택하면 그 강사의 주간 수업만 깔끔하게 볼 수 있어요. (강사 목록의 📅 버튼으로도 열립니다)</div>';
    }

    // ── 타임라인: 헤더(요일) + 시간 거터 + 7일 컬럼
    var headCells = '<div class="ph54-cal-corner"></div>';
    days.forEach(function(d,i){
      var isToday = ph54FmtDate(d) === todayStr;
      headCells += '<div class="ph54-cal-dayhead'+(isToday?' today':'')+'">'+dayLabel[i]
        + '<br><span class="ph54-cal-date">'+ph54Pad(d.getMonth()+1)+'/'+ph54Pad(d.getDate())+'</span></div>';
    });

    var gutter = '<div class="ph54-cal-gutter" style="height:'+bodyH+'px">';
    for (var h=PH54_START_H; h<PH54_END_H; h++){
      gutter += '<div class="ph54-cal-hourlabel" style="height:'+PH54_HOUR_PX+'px">'+ph54Pad(h)+':00</div>';
    }
    gutter += '</div>';

    var cols = '';
    for (var ci=0; ci<7; ci++){
      var isToday2 = ph54FmtDate(days[ci]) === todayStr;
      var cardsHtml = events.filter(function(e){ return e.col === ci; })
                            .map(function(e){ return ph54EventCard(e.idx, e.rec); }).join('');
      cols += '<div class="ph54-cal-col'+(isToday2?' today':'')+'" data-day="'+ci+'" '
        + 'style="height:'+bodyH+'px;background-size:100% '+PH54_HOUR_PX+'px">'
        + cardsHtml + '</div>';
    }

    html += '<div id="ph54-cal"><div id="ph54-cal-body"><div id="ph54-cal-inner">'
      + '<div id="ph54-cal-head">'+headCells+'</div>'
      + '<div id="ph54-cal-track">'+gutter+cols+'</div>'
      + '</div></div></div>';

    // ── 범례 + 카운트
    html += '<div class="ph54-legend">'
      +   '<span><i style="background:#7c3aed"></i>1:1 수업</span>'
      +   '<span><i style="background:#2563eb"></i>그룹 수업</span>'
      +   '<span><i style="background:#f59e0b"></i>대체</span>'
      +   '<span><i style="background:#475569"></i>휴무</span>'
      +   '<span class="ph54-legend-count">총 '+events.filter(function(e){ return e.rec.type!=='blocked'; }).length+'개 수업 · 카드를 드래그해 이동</span>'
      + '</div>';

    wrap.innerHTML = html;

    // ── 컨트롤 바인딩
    document.getElementById('ph54-prev-week').addEventListener('click', async function(){ ph54State.weekOffset--; await ph54LoadRecords(); ph54Render(); });
    document.getElementById('ph54-this-week').addEventListener('click', async function(){ ph54State.weekOffset = 0; await ph54LoadRecords(); ph54Render(); });
    document.getElementById('ph54-next-week').addEventListener('click', async function(){ ph54State.weekOffset++; await ph54LoadRecords(); ph54Render(); });
    document.getElementById('ph54-teacher-filter').addEventListener('change', function(e){ ph54State.teacherFilter = e.target.value; ph54Render(); });
    document.getElementById('ph54-clear-filter').addEventListener('click', function(){ ph54State.teacherFilter = ''; ph54Render(); });

    // ── HTML5 Drag & Drop: 카드를 다른 요일/시간으로 이동 ──
    var track = document.getElementById('ph54-cal-track');
    if (track){
      // (1) 드래그 시작 — 어떤 레코드를 잡았는지 ph54State._drag 에 기억
      track.addEventListener('dragstart', function(ev){
        var card = ev.target.closest && ev.target.closest('.ph54-ev'); if(!card) return;
        ph54State._drag = { idx: parseInt(card.dataset.idx, 10) };
        card.classList.add('dragging');
        try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', card.dataset.idx); } catch(e){}
      });
      track.addEventListener('dragend', function(ev){
        var card = ev.target.closest && ev.target.closest('.ph54-ev'); if(card) card.classList.remove('dragging');
        Array.prototype.forEach.call(track.querySelectorAll('.ph54-col-over'), function(c){ c.classList.remove('ph54-col-over'); });
      });
      // (2) 컬럼 위로 드래그 — preventDefault 해야 drop 이 발생, 하이라이트 표시
      track.addEventListener('dragover', function(ev){
        var col = ev.target.closest && ev.target.closest('.ph54-cal-col'); if(!col) return;
        ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch(e){}
      });
      track.addEventListener('dragenter', function(ev){
        var col = ev.target.closest && ev.target.closest('.ph54-cal-col'); if(col) col.classList.add('ph54-col-over');
      });
      track.addEventListener('dragleave', function(ev){
        var col = ev.target.closest && ev.target.closest('.ph54-cal-col'); if(!col) return;
        if (!col.contains(ev.relatedTarget)) col.classList.remove('ph54-col-over');
      });
      // (3) 드롭 — 드롭한 컬럼(요일) + Y좌표(시간, 30분 스냅)로 레코드 갱신 → 재렌더 + 알림
      track.addEventListener('drop', function(ev){
        var col = ev.target.closest && ev.target.closest('.ph54-cal-col');
        if (!col || !ph54State._drag) return;
        ev.preventDefault();
        var idx = ph54State._drag.idx; ph54State._drag = null;
        var rec = ph54State.records[idx]; if(!rec) return;
        var newCol = parseInt(col.dataset.day, 10);
        // 드롭 Y → 30분 칸 인덱스 → 분
        var rect = col.getBoundingClientRect();
        var rowIdx = Math.round((ev.clientY - rect.top) / (PH54_HOUR_PX * PH54_SNAP / 60));
        var dur = rec.duration_min || 20;   // 기본 수업 20분(영어·중국어 공통, 2026-07-23)
        var newMin = PH54_START_H*60 + rowIdx*PH54_SNAP;
        newMin = Math.max(PH54_START_H*60, Math.min(newMin, PH54_END_H*60 - dur));  // 06:00~24:00 범위 클램프
        // 레코드 갱신(요일/날짜/시간/시)
        var newDate = ph54FmtDate(days[newCol]);
        var newTime = ph54FmtMin(newMin);
        rec.date = newDate; rec.start_time = newTime; rec.hour = Math.floor(newMin/60); rec.day_of_week = dowKeyByIdx[newCol];
        ph54Render();   // 즉시 다시 그리기(낙관적 업데이트)
        console.log('[ph54] 일정 이동 →', { id: rec.id, day: dowKeyByIdx[newCol], date: newDate, start_time: newTime, duration_min: dur });
        // 🔒 서버에 영구 저장(PATCH /api/admin/class-schedules/:id). id 없으면 화면 이동만.
        if (rec.id != null) {
          ph54Toast('💾 저장 중… ' + dayLabel[newCol] + '요일 ' + newTime);
          fetch('/api/admin/class-schedules/' + rec.id, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day_of_week: dowKeyByIdx[newCol], start_time: newTime })
          })
          .then(function(r){ return r.json().catch(function(){ return {}; }); })
          .then(function(res){
            if (res && res.ok) ph54Toast('✅ 저장됨: ' + dayLabel[newCol] + '요일 ' + newTime + ' (' + dur + '분)');
            else ph54Toast('⚠️ 저장 실패(화면만 이동): ' + ((res && res.error) || '서버 오류'));
          })
          .catch(function(){ ph54Toast('⚠️ 저장 실패(네트워크). 화면만 이동됨'); });
        } else {
          ph54Toast('📌 이동(임시): ' + dayLabel[newCol] + '요일 ' + newTime + ' — 저장 불가(id 없음)');
        }
      });
    }
  }

  async function ph54Init(){
    // 1) 카드 추가 — card-class-attendance 다음에
    var mgmt = document.getElementById('card-teacher-mgmt');
    if (!mgmt) return;
    if (document.getElementById('card-teacher-schedule')) return;

    var sched = document.createElement('details');
    sched.id = 'card-teacher-schedule';
    sched.innerHTML =
      '<summary>📅 <span data-ko="강사 스케줄 (주간 통합 캘린더)" data-en="Teacher Schedule (Weekly Calendar)">강사 스케줄 (주간 통합 캘린더)</span></summary>'
      + '<div id="ph54-sched-wrap"><div style="padding:14px;color:#6b7280">로딩 중…</div></div>';

    // class-attendance 카드 다음, 없으면 attendance-status 다음, 없으면 mgmt 맨 끝
    var anchor = document.getElementById('card-class-attendance')
              || document.getElementById('card-attendance-status');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(sched, anchor.nextSibling);
    } else {
      mgmt.appendChild(sched);
    }

    // 펼침 시 1회 로드
    sched.addEventListener('toggle', async function(){
      if (!sched.open) return;
      // 강사 목록(1회)+수업기록을 병렬 로드 → 첫 열람 지연 절반
      await Promise.all([
        ph54State.teachers.length ? null : ph54LoadTeachers(),
        ph54LoadRecords()
      ]);
      ph54Render();
    });
  }

  /* 강사 목록 테이블 각 행 액션 컬럼에 📅 버튼 추가 */
  function ph54AddRowButtons(){
    var rows = document.querySelectorAll('#tp-list-body tr');
    rows.forEach(function(tr){
      if (tr.dataset.ph54Bound === '1') return;
      var actionCell = tr.children[tr.children.length - 1];
      if (!actionCell) return;
      // teacherProfile id 찾기 — viewTeacherProfile(ID) 패턴에서 추출
      var viewBtn = actionCell.querySelector('button[onclick*="viewTeacherProfile"]');
      if (!viewBtn) return;
      var m = (viewBtn.getAttribute('onclick') || '').match(/viewTeacherProfile\((\d+)\)/);
      if (!m) return;
      var tid = m[1];

      // 강사 이름 (두 번째 셀의 <b>)
      var nameCell = tr.children[1];
      var nameEl = nameCell && nameCell.querySelector('b');
      var tname = nameEl ? nameEl.textContent.trim() : '';

      var btn = document.createElement('button');
      btn.className = 'ph54-row-cal-btn tp-act-btn tp-act--cal';
      btn.title = tname + ' 스케줄 캘린더';
      btn.setAttribute('aria-label', '스케줄 캘린더');
      // Win10 이모지 깨짐 방지 — adm-core 의 인라인 SVG 아이콘/버튼 스타일 재사용 (없으면 텍스트 폴백)
      if (window._TP_IC && window._TP_ACT_BTN) {
        btn.style.cssText = window._TP_ACT_BTN;
        btn.innerHTML = window._TP_IC.calendar;
      } else {
        btn.textContent = '일정';
        btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 8px;margin:0 2px;border:0;border-radius:6px;cursor:pointer;color:#fff;background:#8b5cf6;font-size:11px;font-weight:700;vertical-align:middle';
      }
      btn.onclick = function(e){
        e.preventDefault(); e.stopPropagation();
        // 1) 카드 펼치기
        var sched = document.getElementById('card-teacher-schedule');
        if (!sched) return;
        sched.open = true;
        // 2) 이번 주로 + 이 강사만 필터 + 수업 데이터 로드 후 렌더
        (async function(){
          ph54State.weekOffset = 0;                  // 이번 주
          ph54State.teacherFilter = String(tid);     // 클릭한 강사(teacher_profiles.id)만
          // 강사 목록(1회)+수업기록 병렬 로드
          await Promise.all([
            ph54State.teachers.length ? null : ph54LoadTeachers(),
            ph54LoadRecords()
          ]);
          ph54Render();
          // 3) 카드로 스크롤
          setTimeout(function(){ sched.scrollIntoView({ behavior:'smooth', block:'start' }); }, 100);
        })();
      };
      actionCell.appendChild(document.createTextNode(' '));
      actionCell.appendChild(btn);
      tr.dataset.ph54Bound = '1';
    });
  }

  // 초기화 + 동적 행 감지
  function ph54Boot(){
    ph54Init();
    ph54AddRowButtons();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ph54Boot);
  } else {
    ph54Boot();
  }
  [500, 1500, 3000, 6000].forEach(function(d){ setTimeout(ph54Boot, d); });

  if (typeof MutationObserver !== 'undefined') {
    var tbody = document.getElementById('tp-list-body');
    if (tbody) {
      new MutationObserver(ph54AddRowButtons).observe(tbody, { childList: true, subtree: true });
    } else {
      // tbody 아직 없음 — body 전체 감시
      new MutationObserver(function(){
        var tb = document.getElementById('tp-list-body');
        if (tb && !tb.dataset.ph54Mo) {
          tb.dataset.ph54Mo = '1';
          new MutationObserver(ph54AddRowButtons).observe(tb, { childList: true, subtree: true });
        }
        ph54AddRowButtons();
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
})();
