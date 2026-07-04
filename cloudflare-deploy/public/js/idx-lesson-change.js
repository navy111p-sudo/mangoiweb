// 메인 페이지 - 수업 연기/변경 (학생/학부모 본인 수업)
// ⚠️ window.openLessonChangeModal / window.tryLessonAction 의 최초 정의는 index.html의
//    <script id="lesson-change-unify">(2026-06-08, 겹치던 옛 모달 대신 단일 페이지로 일원화)가
//    항상 재정의하므로 여기서는 제거됨 — 아래는 그 일원화된 흐름이 실제로 호출하는
//    시간/강사 선택 위저드(openLessonPickerModal 이하)만 남긴다.
(function(){
  function pad(n){return String(n).padStart(2,'0');}
  function getClassDateTime(c){
    // 1순위: 연기 후 저장된 절대 lessonDate + lessonHour
    if(c.lessonDate && c.lessonHour!=null){
      var parts = c.lessonDate.split('-');
      var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
      d.setHours(c.lessonHour, 0, 0, 0);
      return d;
    }
    if(c.hourOffset!=null){
      var now=new Date();
      return new Date(now.getTime() + c.hourOffset*3600*1000);
    }
    var d=new Date(); d.setHours(0,0,0,0);
    d.setDate(d.getDate() + (c.dateOffset||0));
    d.setHours(c.hour);
    return d;
  }
  function fmtDateTime(d){
    var L=(window.getLang?window.getLang():'ko')==='ko';
    var dow=L?['일','월','화','수','목','금','토']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+
      ' ('+dow[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  window.closeLessonChangeModal = function(){
    var o=document.getElementById('lc-overlay');
    o.classList.remove('show');
    document.body.style.overflow = '';
  };

  // 🆕 권한 기반 시간 제한 우회 — 본사/강사는 언제든 가능, 지사/대리점/학생은 24h/30분 룰
  //    관리자 페이지 권한 매트릭스(mangoi_perm_matrix)에서 해당 권한이 '✅' 인지 확인
  //    역할은 mangoi_logged_user.role 또는 mangoi_user_role 키에서 가져옴 (기본 'student')
  window.hasUnlimitedLessonPermission = function(mode) {
    try {
      var matrixRaw = localStorage.getItem('mangoi_perm_matrix');
      if (!matrixRaw) return false;
      var matrix = JSON.parse(matrixRaw);
      var permId = mode === 'postpone' ? 'lesson_postpone_anytime' : 'lesson_change_anytime';
      var perm = matrix[permId];
      if (!perm) return false;
      // 사용자 역할 확인
      var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      var role = (u && u.role) || localStorage.getItem('mangoi_user_role') || 'student';
      // hq_exec, hq_mgr, hq_teacher 에 대해 '✅' 면 우회
      return perm[role] === '✅';
    } catch(e) { console.warn('[perm] 권한 확인 실패:', e); return false; }
  };

  // ═══ 새 시간/강사 선택 위저드 ═══
  var lcPicker = null;
  // 관리자(D1 teacher_profiles) 실제 강사 — /api/teacher-profiles 로 채움. 실패 시 아래 FALLBACK.
  var demoTeachers = [
    { id:'t12', name:'Teacher Ana',    category:'office', ico:'🇵🇭' },
    { id:'t21', name:'Karl',           category:'native', ico:'🇵🇭' },
    { id:'t4',  name:'Teacher Belle',  category:'home',   ico:'🇵🇭' },
    { id:'t17', name:'Mo',             category:'native', ico:'🇺🇸' },
    { id:'t26', name:'Teacher Janice', category:'native', ico:'🇺🇸' },
    { id:'t30', name:'중국어 강선생님', category:'native', ico:'🇨🇳' }
  ];
  (function(){
    function gl(g){ g=g||''; if(/head/i.test(g))return'native'; if(/office/i.test(g))return'office'; if(/home/i.test(g))return'home'; return'native'; }
    function fl(r){ r=r||''; if(/미국|캐나다|미주|북미|us|usa|canada/i.test(r))return'🇺🇸'; if(/중국|중화|china|cn|대만/i.test(r))return'🇨🇳'; if(/영국|호주|uk|gb|au/i.test(r))return'🇬🇧'; return'🇵🇭'; }
    fetch('/api/teacher-profiles?limit=50',{cache:'no-store'}).then(function(r){return r.json();}).then(function(j){
      var items=(j&&(j.items||j.rows))||[];
      var mapped=items.map(function(row){ return { id:'t'+row.id, name:(row.english_name||row.korean_name||'강사'), category:gl(row.group_name), ico:fl(row.origin_region) }; }).filter(function(t){return t.name&&t.name!=='강사';});
      if(mapped.length){ demoTeachers = mapped; window.demoTeachers = mapped; }
    }).catch(function(){});
  })();
  try{ window.demoTeachers = demoTeachers; }catch(e){}

  window.openLessonPickerModal = function(cls, mode){
    lcPicker = {
      cls: cls,
      mode: mode,
      step: 'method',
      method: null,
      pickedDate: null,
      pickedHour: null,
      pickedTeacher: null,
      shiftPreview: null,
      weekOffset: 0,
      zoom: 1.0  // 0.6 ~ 1.6 까지 (스텝 0.2)
    };
    renderLessonPicker();
  };
  window.lcZoom = function(dir){
    if(!lcPicker)return;
    var z = lcPicker.zoom || 1.0;
    z = Math.round((z + dir*0.15)*100)/100;
    z = Math.max(0.5, Math.min(2.0, z));
    lcPicker.zoom = z;
    renderLessonPicker();
  };
  window.lcZoomFit = function(){
    if(!lcPicker)return;
    // 전체 한 주 보기 (화면 너비에 맞춤)
    var modal = document.querySelector('.lc-modal');
    if(!modal)return;
    var modalW = modal.clientWidth - 48; // padding 고려
    // 한 주 = 7일 = 7*60 = 420px (zoom 1.0)
    // 현재 폭 / 420 = 필요한 zoom
    var fitZoom = Math.max(0.5, Math.min(2.0, modalW / 420));
    lcPicker.zoom = Math.round(fitZoom*100)/100;
    renderLessonPicker();
  };
  window.lcPickWeek = function(offset){
    if(!lcPicker)return;
    var newOff = Math.max(0, offset);
    lcPicker.weekOffset = newOff;
    // 캘린더 가로 스크롤로 해당 주로 점프
    var area = document.getElementById('cal-scroll-area');
    if(area){
      var colPx = parseInt((document.querySelector('#cal-grid-body')||{}).style.gridAutoRows) || 18;
      // 더 정확히 grid-template-columns에서 colPx 추출
      var gtcMatch = (document.querySelector('#cal-grid-body')||{}).style.gridTemplateColumns || '';
      var m = gtcMatch.match(/repeat\(\d+,\s*(\d+)px\)/);
      var actualColPx = m ? parseInt(m[1]) : 60;
      area.scrollTo({left: newOff * 7 * actualColPx, behavior:'smooth'});
    }
  };
  // 방식 선택
  window.lcPickMethod = function(method){
    if(!lcPicker)return;
    lcPicker.method = method;
    lcPicker.step = method;
    // 뒤로 밀기는 미리보기 계산
    if(method==='shift'){ lcPicker.shiftPreview = computeShiftPreview(lcPicker.cls); }
    renderLessonPicker();
  };
  window.lcBack = function(){
    if(!lcPicker)return;
    lcPicker.step = 'method';
    lcPicker.pickedDate=null; lcPicker.pickedHour=null; lcPicker.pickedTeacher=null;
    renderLessonPicker();
  };

  // 뒤로 밀기 미리보기 (현재 수업 이후 모든 레코드를 다음 세션으로 시프트)
  // 데모: cls 이후 같은 학생의 향후 수업들을 +7일씩 자동 이동
  function computeShiftPreview(cls){
    var L=(window.getLang?window.getLang():'ko')==='ko';
    // 데모 미래 수업 시뮬레이션: 현재 + 다음 4회 (주 1회로 가정)
    var current = getClassDateTime(cls);
    var sessions = [];
    for(var i=0;i<5;i++){
      var d = new Date(current);
      d.setDate(d.getDate() + i*7);
      sessions.push({ index:i, oldDate:new Date(d) });
    }
    // 뒤로 밀기: 모든 세션을 +7일
    sessions.forEach(function(s){
      s.newDate = new Date(s.oldDate); s.newDate.setDate(s.newDate.getDate()+7);
    });
    return sessions;
  }

  window.lcSwitchTab = function(tab){
    if(!lcPicker)return;
    lcPicker.tab = tab;
    renderLessonPicker();
  };
  window.lcPickTime = function(dateISO, hour){
    if(!lcPicker)return;
    lcPicker.pickedDate = dateISO;
    lcPicker.pickedHour = hour;
    // 연기 모드의 'date' 단계에서 슬롯 터치 → 즉시 격려 다이얼로그
    if(lcPicker.mode==='postpone' && lcPicker.step==='date'){
      showPostponeEncourage();
      return;
    }
    renderLessonPicker();
  };

  // 격려 다이얼로그 (연기 확정 전 호출)
  function showPostponeEncourage(){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var p = lcPicker;
    var dateISO = p.pickedDate, hour = p.pickedHour;
    var msg = L
      ? '실력 향상을 위해선 꾸준한 수업이 가장 중요합니다!<br><br>그래도 연기하시겠습니까?'
      : 'Consistent practice is the key to improvement!<br><br>Are you sure you want to postpone?';
    var html = '<div class="encourage-wrap" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;overflow-y:auto" onclick="if(event.target===this)closeEncourage()">'+
      '<div class="encourage-card" style="background:linear-gradient(180deg,#1a2032 0%,#131826 100%);border:2px solid #fbbf24;border-radius:24px;max-width:600px;width:100%;box-shadow:0 30px 80px rgba(0,0,0,.7);animation:lcSlide .25s;text-align:center" onclick="event.stopPropagation()">'+
        '<div style="padding:44px 32px 8px"><div class="encourage-emoji" style="font-size:96px;line-height:1;margin-bottom:14px;animation:pop .35s ease-out">💪</div></div>'+
        '<div class="encourage-title" style="padding:0 36px;font-size:30px;font-weight:800;color:#fff;line-height:1.35;margin-bottom:14px">'+(L?'잠깐만요!':'Wait!')+'</div>'+
        '<div class="encourage-msg" style="padding:0 36px 22px;font-size:18px;color:#cbd5e1;line-height:1.7">'+msg+'</div>'+
        '<div class="encourage-info" style="margin:0 32px 26px;padding:18px 22px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);border-radius:14px;font-size:17px;color:#fde68a">'+
          '📅 '+(L?'새 시간: ':'New time: ')+'<b style="color:#fff">'+dateISO+' '+String(hour).padStart(2,"0")+':00</b>'+
        '</div>'+
        '<div class="encourage-actions" style="display:flex;gap:14px;padding:22px 32px 28px;border-top:1px solid #232b40">'+
          '<button onclick="closeEncourage()" style="flex:1;padding:18px;border-radius:14px;background:transparent;border:1.5px solid #475569;color:#cbd5e1;font-size:18px;font-weight:800;cursor:pointer">❌ '+(L?'아니요':'No')+'</button>'+
          '<button onclick="confirmPostponeYes()" style="flex:1;padding:18px;border-radius:14px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;font-size:18px;font-weight:800;cursor:pointer;box-shadow:0 8px 20px rgba(16,185,129,.4)">✅ '+(L?'예':'Yes')+'</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<style>'+
      '@keyframes pop{0%{transform:scale(0)}70%{transform:scale(1.1)}100%{transform:scale(1)}}'+
      '@media(max-width:600px){'+
        '.encourage-wrap{padding:16px!important;align-items:flex-start!important;padding-top:40px!important}'+
        '.encourage-card{max-width:100%!important;border-radius:20px!important}'+
        '.encourage-emoji{font-size:72px!important}'+
        '.encourage-title{font-size:24px!important;padding:0 24px!important}'+
        '.encourage-msg{font-size:15.5px!important;padding:0 24px 18px!important}'+
        '.encourage-info{font-size:14.5px!important;margin:0 22px 22px!important;padding:14px 18px!important}'+
        '.encourage-actions{padding:18px 22px 22px!important;gap:10px!important}'+
        '.encourage-actions button{padding:15px!important;font-size:16px!important}'+
      '}'+
    '</style>';
    var ov = document.getElementById('lc-overlay');
    ov.innerHTML = html;
    ov.classList.add('show');

  }

  // 격려 다이얼로그 - 아니요 (취소, 스케줄로 돌아감)
  window.closeEncourage = function(){
    if(!lcPicker)return;
    lcPicker.pickedDate = null;
    lcPicker.pickedHour = null;
    renderLessonPicker(); // 다시 스케줄 표 표시
  };
  // 강사 선택 후 → 그 강사의 캘린더로 진행
  window.lcGoCalendarWithTeacher = function(){
    if(!lcPicker || !lcPicker.pickedTeacher) return;
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var newTeacher = lcPicker.pickedTeacher;
    // cls 의 teacher 를 새 강사로 변경 (학생 데이터 + lcPicker.cls 둘 다)
    try {
      var u = (typeof getCurrentUser==='function') ? getCurrentUser() : null;
      var students = window.__demoStudents || {};
      var stu = (u && students[u.uid]) ? students[u.uid] : null;
      if(stu && Array.isArray(stu.classes) && lcPicker.cls && lcPicker.cls.id){
        var c = stu.classes.find(function(x){ return x.id === lcPicker.cls.id; });
        if(c) c.teacher = newTeacher.name;
      }
    } catch(e){}
    lcPicker.cls.teacher = newTeacher.name;
    // 캘린더 단계로 이동
    lcPicker.step = 'date';
    lcPicker.pickedTeacher = null;
    renderLessonPicker();
    showLcToast('👨‍🏫 '+(L?newTeacher.name+' 강사 선택됨 — 이제 새 시간을 골라주세요':newTeacher.name+' selected — now pick a time'));
  };

    // 격려 다이얼로그 - 예 (실제 연기 실행 후 캘린더 다시 표시)
  window.confirmPostponeYes = function(){
    if(!lcPicker) return;
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var p = lcPicker;
    if(!p.pickedDate || p.pickedHour==null){ return; }
    var newDate = p.pickedDate, newHour = p.pickedHour;

    // 1) 학생 데이터 업데이트 (cls.id 매칭)
    try {
      var u = (typeof getCurrentUser==='function') ? getCurrentUser() : null;
      var students = window.__demoStudents || {};
      var stu = (u && students[u.uid]) ? students[u.uid] : null;
      if(stu && Array.isArray(stu.classes) && p.cls && p.cls.id){
        var c = stu.classes.find(function(x){ return x.id === p.cls.id; });
        if(c){
          c.lessonDate = newDate;
          c.lessonHour = newHour;
          delete c.hourOffset;
        }
      }
    } catch(e){}

    // 2) lcPicker.cls 도 업데이트 (캘린더가 이 값을 보고 그림)
    p.cls.lessonDate = newDate;
    p.cls.lessonHour = newHour;
    delete p.cls.hourOffset;

    // 3) pickedDate/Hour 초기화 (다음 드래그 준비)
    p.pickedDate = null;
    p.pickedHour = null;

    // 4) step 강제로 'date' 로 → 캘린더 다시 그림
    p.step = 'date';
    renderLessonPicker();

    // 5) 성공 토스트
    showLcToast('✅ '+(L?'수업 시간 변경 완료 — 새 시간: ':'Time changed — new: ')+
      '<b>'+newDate+' '+String(newHour).padStart(2,'0')+':00</b><br>'+
      '<span style="font-size:11px;color:#94a3b8">'+(L?'캘린더에 새 위치가 표시됩니다':'New position shown on calendar')+'</span>');
  };
  window.lcPickTeacher = function(tid){
    if(!lcPicker)return;
    lcPicker.pickedTeacher = demoTeachers.find(function(t){return t.id===tid;});
    renderLessonPicker();
  };
  window.lcCancelPicker = function(){
    document.getElementById('lc-overlay').classList.remove('show');
    document.body.style.overflow = '';
    lcPicker = null;
  };
  window.lcConfirmPicker = function(){
    if(!lcPicker)return;
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var p = lcPicker;
    var modeKr = p.mode==='postpone'?(L?'연기':'Postponed'):(L?'변경':'Changed');
    var summary;
    var didChange = false;

    // ── 학생 데이터 실제 업데이트 ──
    function applyToStudent(){
      if(!p.cls || !p.cls.id) return false;
      var students = window.__demoStudents || {};
      var u = (typeof getCurrentUser==='function') ? getCurrentUser() : null;
      var stu = u ? students[u.uid] : null;
      if(!stu || !Array.isArray(stu.classes)) return false;
      var c = stu.classes.find(function(x){ return x.id === p.cls.id; });
      if(!c) return false;
      // 시간/날짜 업데이트
      if((p.tab==='time' || p.step==='date') && p.pickedDate && p.pickedHour!=null){
        c.lessonDate = p.pickedDate;
        c.lessonHour = p.pickedHour;
        // dateOffset / hourOffset 무효화 (lessonDate가 우선되도록 그대로 둬도 됨)
        // lcPicker.cls 도 같이 업데이트 (캘린더 재렌더링에 사용)
        p.cls.lessonDate = p.pickedDate;
        p.cls.lessonHour = p.pickedHour;
        delete p.cls.hourOffset; // 더 이상 상대 오프셋 아님
      }
      // 강사 변경
      if(p.tab==='teacher' && p.pickedTeacher){
        c.teacher = p.pickedTeacher.name;
        p.cls.teacher = p.pickedTeacher.name;
      }
      return true;
    }

    if(p.tab==='time' && p.pickedDate && p.pickedHour!=null){
      summary = '📅 '+p.pickedDate+' '+String(p.pickedHour).padStart(2,'0')+':00';
      didChange = applyToStudent();
    } else if(p.step==='date' && p.pickedDate && p.pickedHour!=null){
      summary = '📅 '+p.pickedDate+' '+String(p.pickedHour).padStart(2,'0')+':00';
      didChange = applyToStudent();
    } else if(p.tab==='teacher' && p.pickedTeacher){
      summary = '👨‍🏫 '+p.pickedTeacher.name;
      didChange = applyToStudent();
    } else {
      return;
    }

    // 토스트 띄움
    showLcToast('✅ '+(L?'수업 ':'Class ')+modeKr+(L?' 완료 — ':' done — ')+summary+'<br><span style="font-size:11px;color:#94a3b8">'+(L?'담당자가 확인 후 연락드립니다':'Staff will confirm shortly')+'</span>');

    // 연기(postpone) 모드 + 캘린더 'date' 단계인 경우 → 모달 안에서 캘린더 다시 그려서 새 위치에 🟣 NOW 박스 표시
    if(didChange && p.mode==='postpone' && p.step==='date'){
      // pickedDate/Hour 는 유지하지만, 캘린더에서 cls의 lessonDate/lessonHour 가 새 위치이므로
      // 그대로 renderLessonPicker() 호출하면 새 위치가 🟣 NOW 로 보임
      p.pickedDate = null; p.pickedHour = null;
      renderLessonPicker();
      return; // 모달 유지
    }

    // 그 외 경우 (변경, 뒤로 밀기 등) → 모달 닫고 학생 수업 목록 다시 열기
    lcCancelPicker();
    setTimeout(function(){
      // 학생 수업 목록 다시 열어서 변경 반영
      if(typeof openLessonChangeModal === 'function') openLessonChangeModal();
    }, 600);
  };

  function fmtISOLocal(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }

  function renderLessonPicker(){
    if(!lcPicker)return;
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var p = lcPicker;
    var modeTitle = p.mode==='postpone' ? '📅 '+(L?'수업 연기':'Postpone Class') : '🔄 '+(L?'수업 변경':'Change Class');
    var origStr = p.cls.teacher+' · '+fmtDateTime(getClassDateTime(p.cls));

    var headerHtml = '<div class="lc-head"><h2>'+modeTitle+'</h2>'+
      '<button class="lc-close" onclick="lcCancelPicker()">✕</button></div>'+
      '<div style="padding:18px 22px;background:linear-gradient(135deg,rgba(251,191,36,.18),rgba(245,158,11,.10));border-bottom:2px solid rgba(251,191,36,.45);display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<span style="font-size:22px;line-height:1">📌</span>'+
          '<span style="font-size:13px;color:#fde68a;font-weight:700;text-transform:uppercase;letter-spacing:1px">'+(L?'변경 후 수업':'After Change')+'</span>'+
        '</div>'+
        '<div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.3px;line-height:1.3;flex:1">'+origStr+'</div>'+
      '</div>';

    var bodyHtml = '';
    var footerHtml = '';

    if(p.step==='method'){
      // ─── 연기/변경 둘 다 동일한 2개 카드: 강사 선택 / 날짜 선택 ───
      var modeKo = p.mode==='postpone' ? '연기' : '변경';
      var modeEn = p.mode==='postpone' ? 'Postpone' : 'Change';
      var methods = [
        { id:'date',    ico:'📅',   ko:'날짜 선택',  en:'Pick a Date',
          descKo:'캘린더에서 새 날짜/시간을 선택해 '+modeKo, descEn:'Pick a new date/time on the calendar' },
        { id:'teacher', ico:'👨‍🏫', ko:'강사 선택',  en:'Choose Teacher',
          descKo:'다른 강사를 선택해 '+modeKo+' (같은 시간 유지)', descEn:'Pick another teacher (same time)' }
      ];
      // 연기 전용: 뒤로 밀기 추가 옵션
      if(p.mode==='postpone'){
        methods.push({ id:'shift', ico:'⏭', ko:'뒤로 밀기', en:'Push All Back',
          descKo:'이번 수업과 이후 모든 수업을 1주씩 뒤로 이동',
          descEn:'Shift this and all future lessons by one week' });
      }
      bodyHtml = '<div style="font-size:13px;color:#94a3b8;font-weight:600;margin-bottom:14px">'+
        (L?'어떤 방식으로 진행할까요?':'How would you like to proceed?')+'</div>'+
        '<div style="display:flex;flex-direction:column;gap:12px">'+
        methods.map(function(m){
          return '<button onclick="lcPickMethod(&quot;'+m.id+'&quot;)" style="width:100%;text-align:left;padding:18px;border:2px solid #232b40;background:#131826;border-radius:14px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:14px;color:#e2e8f0" onmouseover="this.style.borderColor=\'#fbbf24\';this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 8px 24px rgba(245,158,11,.25)\'" onmouseout="this.style.borderColor=\'#232b40\';this.style.transform=\'\';this.style.boxShadow=\'\'">'+
            '<div style="font-size:36px;line-height:1;flex-shrink:0">'+m.ico+'</div>'+
            '<div style="flex:1">'+
              '<div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:4px">'+(L?m.ko:m.en)+'</div>'+
              '<div style="font-size:12.5px;color:#94a3b8;line-height:1.5">'+(L?m.descKo:m.descEn)+'</div>'+
            '</div>'+
            '<div style="font-size:22px;color:#fbbf24">→</div>'+
          '</button>';
        }).join('')+
        '</div>';
      footerHtml = '<button onclick="lcCancelPicker()" style="width:100%;padding:14px;border-radius:10px;background:transparent;border:1px solid #232b40;color:#94a3b8;font-size:14px;font-weight:700;cursor:pointer">'+(L?'취소':'Cancel')+'</button>';
    }
    else if(p.step==='date'){
      // ─── (연기) 날짜 선택: 박스를 터치하면 즉시 격려 다이얼로그 ───
      var topHint = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">'+
        '<div style="font-size:11.5px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.4px">'+(L?'담당 강사 '+p.cls.teacher+'의 가능한 시간':p.cls.teacher+'\'s open slots')+'</div>'+
        '<button onclick="lcPickMethod(&quot;shift&quot;)" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);border:1px solid #fbbf24;color:#1a1a1a;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 4px 12px -2px rgba(245,158,11,.5);transition:all .15s" onmouseover="this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 6px 18px -2px rgba(245,158,11,.7)\'" onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 4px 12px -2px rgba(245,158,11,.5)\'">⏭ '+(L?'전체 1주 뒤로 밀기':'Push all +1w')+'</button>'+
      '</div>'+
      '<div style="background:rgba(251,191,36,.08);border:1px dashed rgba(251,191,36,.35);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12.5px;color:#fde68a;text-align:center">🖐 '+(L?'<b style=\"color:#fff\">보라색 박스</b>를 끌어서 <b style=\"color:#a7f3d0\">초록색 빈 시간</b>에 놓으세요':'Drag the <b style=\"color:#fff\">purple box</b> onto a <b style=\"color:#a7f3d0\">green slot</b>')+'</div>';
      bodyHtml = topHint + buildAvailableSlotList(p.cls.teacher);
      footerHtml = '<button onclick="lcCancelPicker()" style="width:100%;padding:14px;border-radius:10px;background:transparent;border:1px solid #232b40;color:#94a3b8;font-size:14px;font-weight:700;cursor:pointer">'+(L?'취소':'Cancel')+'</button>';
    }
    else if(p.step==='shift'){
      // ─── (연기) 뒤로 밀기 미리보기 ───
      var rows = (p.shiftPreview||[]).map(function(s,i){
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#131826;border:1px solid #232b40;border-radius:10px;margin-bottom:8px">'+
          '<div style="width:28px;height:28px;border-radius:50%;background:'+(i===0?'#fbbf24':'#374151')+';color:#1a1a1a;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(i+1)+'</div>'+
          '<div style="flex:1;font-size:13px"><span style="color:#94a3b8;text-decoration:line-through">'+fmtDateTime(s.oldDate)+'</span></div>'+
          '<div style="color:#fbbf24;font-size:18px">→</div>'+
          '<div style="flex:1;font-size:13px;font-weight:700;color:#a7f3d0;text-align:right">'+fmtDateTime(s.newDate)+'</div>'+
        '</div>';
      }).join('');
      bodyHtml = '<div style="padding:14px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.35);border-radius:10px;margin-bottom:14px;font-size:13px;color:#93c5fd;line-height:1.6">⏭ <b style="color:#fff">'+(L?'뒤로 밀기 미리보기':'Shift Preview')+'</b><br>'+(L?'이번 수업을 포함한 향후 모든 수업이 한 번에 1주씩 뒤로 이동합니다.':'This and all future lessons shift +1 week.')+'</div>'+
        rows;
      footerHtml = '<div style="display:flex;gap:8px"><button onclick="lcBack()" style="flex:1;padding:12px;border-radius:10px;background:transparent;border:1px solid #232b40;color:#94a3b8;font-size:14px;font-weight:700;cursor:pointer">← '+(L?'뒤로':'Back')+'</button>'+
        '<button onclick="lcConfirmShift()" style="flex:2;padding:12px;border-radius:10px;background:linear-gradient(135deg,#3b82f6,#2563eb);border:none;color:#fff;font-size:14px;font-weight:800;cursor:pointer">⏭ '+(L?(p.shiftPreview.length+'개 수업 모두 1주씩 밀기'):'Shift '+p.shiftPreview.length+' lessons')+'</button></div>';
    }
    else if(p.step==='teacher'){
      // ─── (변경) 강사 선택 카드 ───
      var cards = demoTeachers.map(function(t){
        var sel=(p.pickedTeacher && p.pickedTeacher.id===t.id);
        var catColor={home:'#10b981',office:'#3b82f6',native:'#8b5cf6',manager:'#f97316'}[t.category]||'#64748b';
        return '<div onclick="lcPickTeacher(&quot;'+t.id+'&quot;)" style="padding:16px 12px;background:'+(sel?'rgba(251,191,36,.15)':'#131826')+';border:2.5px solid '+(sel?'#fbbf24':'#232b40')+';border-radius:14px;cursor:pointer;text-align:center;transition:all .15s;'+(sel?'box-shadow:0 8px 24px rgba(245,158,11,.4)':'')+';min-height:140px">'+
          '<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,'+catColor+',rgba(0,0,0,.3));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;margin:0 auto 8px">'+t.name.charAt(0)+'</div>'+
          '<div style="font-size:13.5px;font-weight:800;color:#fff;line-height:1.2">'+t.name+'</div>'+
          '<div style="display:inline-block;margin-top:5px;padding:2px 9px;background:'+catColor+';border-radius:99px;color:#fff;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px">'+t.ico+' '+t.category+'</div>'+
          (sel?'<div style="margin-top:8px;color:#fbbf24;font-weight:800;font-size:12px">✓ '+(L?'선택됨':'Picked')+'</div>':'')+
        '</div>';
      }).join('');
      bodyHtml = '<div style="font-size:11.5px;color:#94a3b8;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px">'+(L?'원하는 강사를 선택하세요 (큰 카드 터치)':'Tap a teacher card')+'</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px">'+cards+'</div>';
      var ready = !!p.pickedTeacher;
      var modeLbl = p.mode==='postpone' ? (L?'수업 연기':'Postpone') : (L?'수업 변경':'Change');
      footerHtml = '<div style="display:flex;gap:8px"><button onclick="lcBack()" style="flex:1;padding:12px;border-radius:10px;background:transparent;border:1px solid #232b40;color:#94a3b8;font-size:14px;font-weight:700;cursor:pointer">← '+(L?'뒤로':'Back')+'</button>'+
        '<button onclick="lcGoCalendarWithTeacher()" '+(ready?'':'disabled')+' style="flex:2;padding:12px;border-radius:10px;background:'+(ready?'linear-gradient(135deg,#10b981,#059669)':'#374151')+';border:none;color:#fff;font-size:14px;font-weight:800;cursor:'+(ready?'pointer':'not-allowed')+';opacity:'+(ready?'1':'.4')+'">✅ '+(L?'이 강사로 '+modeLbl:'Use this teacher for '+modeLbl)+' →</button></div>';
    }
    else if(p.step==='time-match'){
      // ─── (변경) 요일/시간 선택 → 매칭 강사 ───
      var picker = buildTimePicker(p);
      var match = (p.pickedDate && p.pickedHour!=null) ? buildTeacherMatch(p.pickedDate, p.pickedHour) : '';
      bodyHtml = '<div style="font-size:11.5px;color:#94a3b8;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px">'+(L?'1) 요일·시간을 먼저 선택하세요':'1) Pick day & time first')+'</div>'+picker+match;
      var ready = (p.pickedDate && p.pickedHour!=null && p.pickedTeacher);
      footerHtml = '<div style="display:flex;gap:8px"><button onclick="lcBack()" style="flex:1;padding:12px;border-radius:10px;background:transparent;border:1px solid #232b40;color:#94a3b8;font-size:14px;font-weight:700;cursor:pointer">← '+(L?'뒤로':'Back')+'</button>'+
        '<button onclick="lcConfirmPicker()" '+(ready?'':'disabled')+' style="flex:2;padding:12px;border-radius:10px;background:'+(ready?'linear-gradient(135deg,#10b981,#059669)':'#374151')+';border:none;color:#fff;font-size:14px;font-weight:800;cursor:'+(ready?'pointer':'not-allowed')+';opacity:'+(ready?'1':'.4')+'">✅ '+(L?'확인':'Confirm')+'</button></div>';
    }

    var html = '<div class="lc-modal" onclick="event.stopPropagation()">'+
      headerHtml+
      '<div class="lc-body">'+bodyHtml+'</div>'+
      '<div style="padding:14px 24px;border-top:1px solid #232b40;background:#131826;flex-shrink:0">'+footerHtml+'</div>'+
    '</div>';
    var overlay = document.getElementById('lc-overlay');
    overlay.innerHTML = html;
    overlay.classList.add('show');

  }

  // 캘린더 그리드 (10분 단위, 09-23시) - 현재 수업 박스 드래그/리사이즈
  function buildAvailableSlotList(teacherName){
    var L=(window.getLang?window.getLang():'ko')==='ko';
    var p = lcPicker;
    var dn = L?['일','월','화','수','목','금','토']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var todayMid = new Date(); todayMid.setHours(0,0,0,0);
    var weekOffset = p.weekOffset || 0;
    // 28일 (4주) 가로 스크롤
    var TOTAL_DAYS = 28;
    var dates = [];
    for(var i=0;i<TOTAL_DAYS;i++){ var d=new Date(todayMid); d.setDate(d.getDate()+1+i); dates.push(d); }
    // 강사의 점유 시간 (분 단위로 데모 생성)
    var busyMin = {}; // 'di_hhmm' -> true
    var seed = (teacherName||'').length;
    dates.forEach(function(d,di){
      for(var hh=9;hh<=22;hh++){
        var v = ((seed*31 + di*13 + hh*7)%100)/100;
        if (v < 0.18){
          // 60분 점유
          for(var off=0;off<60;off+=10){
            busyMin[di+'_'+(hh*60+off)] = true;
          }
        }
      }
    });
    // 현재 수업
    var curDt = getClassDateTime(p.cls);
    var curISO = curDt.getFullYear()+'-'+pad(curDt.getMonth()+1)+'-'+pad(curDt.getDate());
    var curHour = curDt.getHours();
    var curMin  = curDt.getMinutes();
    var durMin = p.cls.durationMin || p.cls.duration_min || 60;
    var curStartMin = curHour*60 + curMin;
    var curEndMin = curStartMin + durMin;
    // 현재 수업이 있는 요일 column
    var curDayCol = -1;
    dates.forEach(function(d,di){
      var iso=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
      if(iso===curISO) curDayCol = di;
    });

    // CSS: row 18px / col 폭 고정 (가로 스크롤 기반) — zoom 적용
    var zoomLevel = p.zoom || 1.0;
    var rowPx = Math.round(18 * zoomLevel);
    // 모달 폭에 7일이 들어가도록 colPx 기본 계산
    var modalEl = document.querySelector('.lc-modal');
    var baseColW = modalEl ? Math.max(50, Math.floor((modalEl.clientWidth - 48 - 36) / 7)) : 60;
    var colPx = Math.round(baseColW * zoomLevel);
    var fitMode = false;
    var colsTpl = '48px repeat('+TOTAL_DAYS+','+colPx+'px)';
    var totalRows = (23-9)*6 + 1; // 09:00 ~ 23:00 = 85 rows
    // ─── 주간 네비게이션 (◀/▶ + 현재 주 라벨) ───
    var ws = new Date(todayMid); ws.setDate(ws.getDate() + 1 + weekOffset*7);
    var we = new Date(ws); we.setDate(we.getDate() + 6);
    var dnShort = L?['일','월','화','수','목','금','토']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var weekLabel = ws.getFullYear()+'.'+pad(ws.getMonth()+1)+'.'+pad(ws.getDate())+' ('+dnShort[ws.getDay()]+') ~ '+pad(we.getMonth()+1)+'.'+pad(we.getDate())+' ('+dnShort[we.getDay()]+')';
    // (lblTxt label은 ws~we 한 줄)
    var prevDisabled = (weekOffset<=0);
    var weekTabsHtml = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;background:#0f172a;padding:7px 10px;border-radius:10px;border:1px solid #232b40">'+
      '<button onclick="lcPickWeek('+Math.max(0,weekOffset-1)+')" '+(prevDisabled?'disabled':'')+' style="background:'+(prevDisabled?'#1a2032':'#1e2538')+';border:1px solid #232b40;color:'+(prevDisabled?'#475569':'#fbbf24')+';width:38px;height:34px;border-radius:8px;font-weight:800;font-size:18px;cursor:'+(prevDisabled?'not-allowed':'pointer')+';line-height:1">◀</button>'+
      '<div style="flex:1;text-align:center;color:#fde68a;font-weight:800;font-size:13px;letter-spacing:.2px">'+weekLabel+'</div>'+
      '<button onclick="lcPickWeek('+(weekOffset+1)+')" style="background:#1e2538;border:1px solid #232b40;color:#fbbf24;width:38px;height:34px;border-radius:8px;font-weight:800;font-size:18px;cursor:pointer;line-height:1">▶</button>'+
    '</div>';
    // 줌 버튼 (확대/축소)
    var zoomPct = Math.round(zoomLevel*100);
    var zoomBtnsHtml = '<div style="display:flex;justify-content:flex-end;align-items:center;gap:6px;margin-bottom:8px;font-size:11.5px;color:#94a3b8;flex-wrap:wrap">'+
      '<span>🔍 '+(L?'캘린더 확대/축소':'Zoom')+':</span>'+
      '<button onclick="lcZoom(-1)" '+(zoomLevel<=0.5?'disabled':'')+' style="background:#1a2032;border:1px solid #232b40;color:'+(zoomLevel<=0.5?'#475569':'#fbbf24')+';width:32px;height:32px;border-radius:8px;font-weight:800;font-size:18px;cursor:'+(zoomLevel<=0.5?'not-allowed':'pointer')+';line-height:1">−</button>'+
      '<span style="min-width:48px;text-align:center;color:#fde68a;font-weight:800;font-size:12.5px">'+zoomPct+'%</span>'+
      '<button onclick="lcZoom(1)" '+(zoomLevel>=2.0?'disabled':'')+' style="background:#1a2032;border:1px solid #232b40;color:'+(zoomLevel>=2.0?'#475569':'#fbbf24')+';width:32px;height:32px;border-radius:8px;font-weight:800;font-size:18px;cursor:'+(zoomLevel>=2.0?'not-allowed':'pointer')+';line-height:1">+</button>'+
      '<button onclick="lcZoomFit()" style="background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.4);color:#93c5fd;padding:6px 11px;border-radius:8px;font-weight:700;font-size:11px;cursor:pointer">📐 '+(L?'한 주 맞춤':'Fit Week')+'</button>'+
    '</div>';
    // 🎨 캘린더 색상 — 더 밝고 가시성 좋게 (밤하늘 청록 → 부드러운 슬레이트 블루)
    var BG_GRID = '#1e2742';        // 본체 배경 (기존 #131826 보다 밝음)
    var BG_HEADER = '#2a3454';      // 요일 헤더 배경
    var BG_TIME_COL = '#1a2238';    // 좌측 시간 라벨 컬럼
    var BORDER_SOFT = '#3a4666';    // 부드러운 보더
    var html = weekTabsHtml + zoomBtnsHtml + '<div id="cal-grid-wrap" style="background:'+BG_GRID+';border-radius:12px;overflow:hidden;border:1px solid '+BORDER_SOFT+';position:relative">';
    // 헤더
    html += '<div style="display:grid;grid-template-columns:'+colsTpl+';background:'+BG_HEADER+';border-bottom:1px solid '+BORDER_SOFT+';position:sticky;top:0;z-index:5;min-width:'+(48+TOTAL_DAYS*colPx)+'px">';
    html += '<div style="padding:8px 0;text-align:center;color:#94a3b8;font-size:11px;font-weight:700"></div>';
    dates.forEach(function(d){
      var isToday = (d.toDateString()===new Date().toDateString());
      html += '<div style="padding:10px 0;text-align:center;color:'+(isToday?'#fbbf24':'#fff')+';font-weight:700;line-height:1.3">'+
        '<div style="font-size:11.5px;color:'+(isToday?'#fbbf24':'#e2e8f0')+';font-weight:700">'+dn[d.getDay()]+'</div>'+
        '<div style="font-size:16px;font-weight:800;margin-top:2px">'+d.getDate()+'</div>'+
      '</div>';
    });
    html += '</div>';
    // 시간 그리드 (10분 단위)
    html += '<div id="cal-scroll-area" style="position:relative;overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 280px);min-height:60vh"><div id="cal-grid-body" style="display:grid;grid-template-columns:'+colsTpl+';grid-auto-rows:'+rowPx+'px;background:'+BG_GRID+';min-width:'+(48+TOTAL_DAYS*colPx)+'px">';
    for(var hh=9;hh<=22;hh++){
      for(var mm=0;mm<60;mm+=10){
        var isHourMark = (mm===0);
        var cellMin = hh*60+mm;
        // 좌측 시간 라벨 (정시만 굵게)
        var timeLabelStyle = 'background:'+BG_TIME_COL+';color:'+(isHourMark?'#fbbf24':'#cbd5e1')+';font-size:'+(isHourMark?'13px':'10.5px')+';font-weight:'+(isHourMark?'800':'500')+';text-align:center;line-height:'+rowPx+'px;'+(isHourMark?'border-top:2px solid #fbbf24;':'border-top:1px solid rgba(255,255,255,.08);');
        html += '<div style="'+timeLabelStyle+'">'+(isHourMark?(pad(hh)+':00'):(':'+pad(mm)))+'</div>';
        for(var di=0;di<TOTAL_DAYS;di++){
          var d=dates[di];
          var iso=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
          var cellTime=new Date(d); cellTime.setHours(hh,mm,0,0);
          var diffMin=(cellTime-new Date())/60000;
          var tooSoon = diffMin < 30;
          var isCurrent = (iso===curISO && cellMin>=curStartMin && cellMin<curEndMin);
          var isCurStart = (iso===curISO && cellMin===curStartMin);
          var isCurLast = (iso===curISO && cellMin===curEndMin-10);
          var isBusy = !!busyMin[di+'_'+cellMin];
          var borderTop = isHourMark?'border-top:1px solid #232b40;':'';
          var cellStyle, cellContent='', dataAttr='';
          if(isCurrent){
            // 모든 보라셀이 드래그 소스 (cursor:grab)
            cellStyle = 'background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;'+borderTop+' '+(isCurStart?'border-top:3px solid #fbbf24;':'')+(isCurLast?'border-bottom:3px solid #fbbf24;position:relative;':'position:relative;overflow:visible;')+'cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none';
            dataAttr = ' data-cal-current="1" data-cal-iso="'+iso+'" data-cal-hour="'+hh+'" data-cal-min="'+mm+'"';
            if(isCurStart){
              // NOW 라벨: 박스 높이 + 모바일 너비에 따라 폰트 자동 조절
              var nowBoxHeight = (durMin/10)*rowPx;
              var isMobile = window.innerWidth < 640;
              var f1, f2, gap;
              if(nowBoxHeight < 40){
                // 매우 작은 박스 (20분 줌아웃 등) - 한 줄만
                f1 = isMobile ? 8.5 : 9.5; f2 = 0; gap = 0;
              } else if(nowBoxHeight < 60){
                f1 = isMobile ? 9.5 : 11; f2 = isMobile ? 8 : 9.5; gap = 0;
              } else if(nowBoxHeight < 90){
                f1 = isMobile ? 11 : 14; f2 = isMobile ? 9.5 : 12; gap = 1;
              } else if(nowBoxHeight < 130){
                f1 = isMobile ? 13 : 17; f2 = isMobile ? 11 : 13; gap = 2;
              } else {
                f1 = isMobile ? 15 : 20; f2 = isMobile ? 12 : 15; gap = 4;
              }
              var secondLine = (f2>0) ? '<div style="font-size:'+f2+'px;line-height:1;font-weight:800;color:#fde68a;white-space:nowrap">'+durMin+(L?'분':'m')+'</div>' : '';
              cellContent = '<div style="position:absolute;left:-3px;right:-3px;top:0;height:'+nowBoxHeight+'px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:'+gap+'px;padding:2px;background:rgba(0,0,0,.5);border-radius:6px;z-index:6;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.95);overflow:hidden;box-sizing:border-box">'+
                '<div style="font-size:'+f1+'px;line-height:1;font-weight:900;color:#fff;white-space:nowrap;letter-spacing:-.3px">🟣'+(L?'현재':'NOW')+'</div>'+
                secondLine+
              '</div>';
              dataAttr += ' data-cal-start="1"';
            }
            // 마지막 셀에 리사이즈 핸들
            if(isCurLast){
              cellContent += '<div data-resize-handle="1" style="position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);width:44px;height:9px;background:#fde68a;border:2px solid #fbbf24;border-radius:99px;cursor:ns-resize;z-index:11;box-shadow:0 3px 8px rgba(245,158,11,.7)" title="'+(L?'끌어서 수업 시간 조절':'Drag to resize')+'"></div>';
            }
          } else if(tooSoon){
            cellStyle = 'background:'+BG_GRID+';opacity:.35;'+borderTop;
          } else if(isBusy){
            cellStyle = 'background:rgba(239,68,68,.32);'+borderTop+'color:#fecaca;font-size:11px;font-weight:700;text-align:center;line-height:'+rowPx+'px';
            if(mm===0) cellContent = '✕';
          } else {
            cellStyle = 'background:rgba(16,185,129,.22);'+borderTop+'transition:background .12s';
            dataAttr = ' data-cal-drop="1" data-cal-iso="'+iso+'" data-cal-hour="'+hh+'" data-cal-min="'+mm+'"';
          }
          html += '<div style="'+cellStyle+'"'+dataAttr+'>'+cellContent+'</div>';
        }
      }
    }
    // 23:00 마지막 row
    html += '<div style="background:'+BG_TIME_COL+';color:#fbbf24;font-size:13px;font-weight:800;text-align:center;line-height:'+rowPx+'px;border-top:2px solid #fbbf24">23:00</div>';
    for(var di=0;di<TOTAL_DAYS;di++) html += '<div style="background:'+BG_GRID+';border-top:1px solid '+BORDER_SOFT+'"></div>';
    html += '</div></div></div>';
    // 범례 + 안내
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:#94a3b8;flex-wrap:wrap;gap:10px">'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
        '<span><span style="display:inline-block;width:12px;height:12px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border-radius:3px;vertical-align:middle"></span> '+(L?'현재 수업':'Current')+'</span>'+
        '<span><span style="display:inline-block;width:12px;height:12px;background:rgba(16,185,129,.4);border-radius:3px;vertical-align:middle"></span> '+(L?'가능':'Open')+'</span>'+
        '<span><span style="display:inline-block;width:12px;height:12px;background:rgba(239,68,68,.4);border-radius:3px;vertical-align:middle"></span> '+(L?'점유':'Taken')+'</span>'+
      '</div>'+
      '<div style="font-size:11px;color:#fde68a;font-weight:700">📏 '+(L?'노란 손잡이를 끌어 수업 시간 조절':'Drag yellow handle to resize')+'</div>'+
    '</div>';
    // 드래그 + 리사이즈 핸들러
    setTimeout(setupCalendarDrag, 50);
    setTimeout(setupResizeHandle, 50);
    return html;
  }

  // 리사이즈 핸들 (수업 길이 조절)
  function setupResizeHandle(){
    var handle = document.querySelector('[data-resize-handle="1"]');
    if(!handle) return;
    var gridBody = document.getElementById('cal-grid-body'); if(!gridBody) return;
    var rowPx = 18;
    var dragging = false, startY = 0, startDur = 0;
    var L=(window.getLang?window.getLang():'ko')==='ko';

    function onMove(clientY){
      if(!dragging) return;
      var deltaY = clientY - startY;
      var deltaSteps = Math.round(deltaY / rowPx); // 10분 단위
      var newDur = Math.max(10, Math.min(180, startDur + deltaSteps*10));
      // 임시 표시 (실제 적용은 mouseup)
      handle.dataset.previewDur = newDur;
      handle.innerHTML = '<div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:#fbbf24;color:#1a1a1a;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;white-space:nowrap">'+newDur+(L?'분':'m')+'</div>';
    }
    function onEnd(clientY){
      if(!dragging) return;
      dragging = false;
      document.body.style.userSelect='';
      var newDur = parseInt(handle.dataset.previewDur||startDur, 10);
      if(newDur !== startDur){
        // 길이 변경 적용
        lcPicker.cls.durationMin = newDur;
        lcPicker.cls.duration_min = newDur;
        showLcToast('📏 '+(L?'수업 시간 변경: ':'Duration: ')+newDur+(L?'분':' min'));
        renderLessonPicker(); // 새 길이로 다시 그림
      } else {
        handle.innerHTML = '';
      }
    }

    handle.addEventListener('mousedown', function(e){
      dragging = true;
      startY = e.clientY;
      startDur = lcPicker.cls.durationMin || lcPicker.cls.duration_min || 60;
      document.body.style.userSelect='none';
      e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener('mousemove', function(e){ if(dragging) onMove(e.clientY); });
    document.addEventListener('mouseup', function(e){ if(dragging) onEnd(e.clientY); });
    // 터치
    handle.addEventListener('touchstart', function(e){
      var t = e.touches[0];
      dragging = true; startY = t.clientY;
      startDur = lcPicker.cls.durationMin || lcPicker.cls.duration_min || 60;
      e.preventDefault();
    }, {passive:false});
    document.addEventListener('touchmove', function(e){
      if(!dragging) return; var t = e.touches[0]; onMove(t.clientY); e.preventDefault();
    }, {passive:false});
    document.addEventListener('touchend', function(e){
      if(!dragging) return; var t = e.changedTouches[0]; onEnd(t.clientY);
    });
  }

  // 캘린더 드래그 앤 드롭
  function setupCalendarDrag(){
    var wrap = document.getElementById('cal-grid-wrap'); if(!wrap) return;
    var sources = wrap.querySelectorAll('[data-cal-current="1"]');
    if(!sources || sources.length===0) return;
    var startCell = wrap.querySelector('[data-cal-start="1"]') || sources[0];
    var dragging = false, ghost = null, lastTarget = null, startX=0, startY=0;

    function findDropAt(x, y){
      var el = document.elementFromPoint(x, y);
      if(!el) return null;
      return el.closest('[data-cal-drop="1"]');
    }
    function clearTarget(){
      if(lastTarget){
        lastTarget.style.outline = '';
        lastTarget.style.boxShadow = '';
        lastTarget.style.background = 'rgba(16,185,129,.12)';
        lastTarget = null;
      }
    }
    function setTarget(td){
      if(lastTarget===td) return;
      clearTarget();
      if(!td) return;
      td.style.outline = '3px solid #10b981';
      td.style.boxShadow = 'inset 0 0 14px rgba(16,185,129,.45)';
      td.style.background = 'rgba(16,185,129,.45)';
      lastTarget = td;
    }
    function startDrag(clientX, clientY, e){
      dragging = true; startX=clientX; startY=clientY;
      ghost = document.createElement('div');
      ghost.style.cssText = 'position:fixed;left:'+clientX+'px;top:'+clientY+'px;pointer-events:none;z-index:99999;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;padding:8px 14px;border-radius:10px;font-weight:800;font-size:13px;box-shadow:0 12px 28px rgba(245,158,11,.6);transform:translate(-50%,-50%)';
      ghost.innerHTML = '📅 '+((window.getLang?window.getLang():'ko')==='ko'?'드롭하면 연기':'Drop to postpone');
      document.body.appendChild(ghost);
      // 모든 보라색 source 셀 흐리게
      sources.forEach(function(s){ s.style.opacity = '0.35'; });
      document.body.style.userSelect = 'none';
      if(e && e.preventDefault) e.preventDefault();
    }
    function moveDrag(clientX, clientY){
      if(!dragging) return;
      if(ghost){ ghost.style.left=clientX+'px'; ghost.style.top=clientY+'px'; }
      setTarget(findDropAt(clientX, clientY));
    }
    function endDrag(clientX, clientY){
      if(!dragging) return;
      dragging = false;
      var dropCell = findDropAt(clientX, clientY);
      if(ghost){ ghost.remove(); ghost = null; }
      sources.forEach(function(s){ s.style.opacity = ''; });
      document.body.style.userSelect = '';
      var captured = lastTarget;
      clearTarget();
      if(dropCell && dropCell.dataset.calIso){
        lcPicker.pickedDate = dropCell.dataset.calIso;
        lcPicker.pickedHour = parseInt(dropCell.dataset.calHour, 10);
        showPostponeEncourage();
      }
    }

    // 마우스 이벤트 - 모든 보라색 셀이 드래그 시작점 (리사이즈 핸들 제외)
    sources.forEach(function(src){
      src.addEventListener('mousedown', function(e){
        if(e.button!==0) return;
        if(e.target.dataset && e.target.dataset.resizeHandle==='1') return; // 핸들은 별도
        startDrag(e.clientX, e.clientY, e);
      });
      src.addEventListener('touchstart', function(e){
        if(e.target.dataset && e.target.dataset.resizeHandle==='1') return;
        var t = e.touches[0]; startDrag(t.clientX, t.clientY, e);
      }, {passive:false});
    });
    document.addEventListener('mousemove', function(e){ if(dragging) moveDrag(e.clientX, e.clientY); });
    document.addEventListener('mouseup', function(e){ if(dragging) endDrag(e.clientX, e.clientY); });
    // 듀얼 핸들러 호환 (옛 코드 호환)
    var source = startCell;
    if(false){source.addEventListener('touchstart', function(e){
      var t = e.touches[0]; startDrag(t.clientX, t.clientY, e);
    }, {passive:false});}
    document.addEventListener('touchmove', function(e){
      if(!dragging) return;
      var t = e.touches[0]; moveDrag(t.clientX, t.clientY);
      e.preventDefault();
    }, {passive:false});
    document.addEventListener('touchend', function(e){
      if(!dragging) return;
      var t = e.changedTouches[0]; endDrag(t.clientX, t.clientY);
    });
    // ESC 취소
    document.addEventListener('keydown', function(e){
      if(e.key==='Escape' && dragging){ dragging=false; if(ghost){ghost.remove();ghost=null;} sources.forEach(function(s){s.style.opacity='';}); clearTarget(); document.body.style.userSelect=''; }
    });
  }

  // 요일/시간 picker (변경 → time-match 모드)
  function buildTimePicker(p){
    var L=(window.getLang?window.getLang():'ko')==='ko';
    var dn=L?['일','월','화','수','목','금','토']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var todayMid=new Date(); todayMid.setHours(0,0,0,0);
    var html='<div style="display:grid;grid-template-columns:40px repeat(7,1fr);gap:1px;background:#232b40;border-radius:8px;overflow:hidden;font-size:11px;margin-bottom:14px">';
    html += '<div style="background:#131826"></div>';
    for(var i=0;i<7;i++){
      var d=new Date(todayMid); d.setDate(d.getDate()+i+1);
      html += '<div style="background:#131826;padding:5px 0;text-align:center;color:#fff;font-weight:700;line-height:1.3"><div style="font-size:10px;color:#94a3b8">'+dn[d.getDay()]+'</div><div>'+d.getDate()+'</div></div>';
    }
    for(var h=9;h<=21;h++){
      html += '<div style="background:#0f172a;padding:0;height:26px;text-align:center;color:#64748b;font-size:10px;font-weight:600;line-height:26px">'+pad(h)+'</div>';
      for(var di=0;di<7;di++){
        var d=new Date(todayMid); d.setDate(d.getDate()+di+1);
        var iso=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
        var picked=(p.pickedDate===iso && p.pickedHour===h);
        var cellTime=new Date(d); cellTime.setHours(h);
        var diffMin=(cellTime-new Date())/60000;
        var tooSoon = diffMin < 1440; // 변경은 24h 이상
        if(picked){
          html += '<div style="height:26px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;font-weight:800;text-align:center;line-height:26px;cursor:pointer">✓</div>';
        } else if(tooSoon){
          html += '<div style="height:26px;background:#131826;opacity:.35"></div>';
        } else {
          html += '<div onclick="lcPickTime(&quot;'+iso+'&quot;,'+h+');lcPicker.pickedTeacher=null;renderLessonPicker()" style="height:26px;background:rgba(16,185,129,.10);cursor:pointer"></div>';
        }
      }
    }
    html += '</div>';
    return html;
  }

  // 시간에 맞는 강사 매칭 (데모 - 무작위 일부 강사 가능)
  function buildTeacherMatch(dateISO, hour){
    var L=(window.getLang?window.getLang():'ko')==='ko';
    var p = lcPicker;
    // 데모: hash 기반으로 일부 강사만 가능
    var avail = demoTeachers.filter(function(t){
      var seed = (t.id.charCodeAt(2) + dateISO.charCodeAt(8) + hour*3)%10;
      return seed<6; // 60%
    });
    if(avail.length===0){
      return '<div style="margin-top:14px;padding:14px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);border-radius:10px;color:#fca5a5;font-size:13px;text-align:center">⚠ '+(L?'해당 시간에 가능한 강사가 없습니다. 다른 시간을 선택하세요.':'No teacher available. Try another time.')+'</div>';
    }
    var cards = avail.map(function(t){
      var sel=(p.pickedTeacher && p.pickedTeacher.id===t.id);
      var catColor={home:'#10b981',office:'#3b82f6',native:'#8b5cf6',manager:'#f97316'}[t.category]||'#64748b';
      return '<div onclick="lcPickTeacher(&quot;'+t.id+'&quot;)" style="padding:12px 8px;background:'+(sel?'rgba(251,191,36,.15)':'#131826')+';border:2px solid '+(sel?'#fbbf24':'#232b40')+';border-radius:12px;cursor:pointer;text-align:center;transition:all .15s">'+
        '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,'+catColor+',rgba(0,0,0,.3));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;margin:0 auto 6px">'+t.name.charAt(0)+'</div>'+
        '<div style="font-size:12px;font-weight:700;color:#fff">'+t.name+'</div>'+
        '<div style="display:inline-block;margin-top:3px;padding:1px 7px;background:'+catColor+';border-radius:99px;color:#fff;font-size:9px;font-weight:800;text-transform:uppercase">'+t.ico+'</div>'+
      '</div>';
    }).join('');
    return '<div style="margin-top:6px;font-size:11.5px;color:#94a3b8;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">'+(L?'2) 가능한 강사를 선택 ('+avail.length+'명)':'2) Available Teachers ('+avail.length+')')+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">'+cards+'</div>';
  }

  // 뒤로 밀기 확정
  window.lcConfirmShift = function(){
    if(!lcPicker)return;
    var L=(window.getLang?window.getLang():'ko')==='ko';
    var preview = lcPicker.shiftPreview||[];
    lcCancelPicker();
    showLcToast('✅ '+(L?preview.length+'개 수업이 1주씩 뒤로 이동되었습니다.':preview.length+' lessons shifted by 1 week.')+'<br><span style="font-size:11px;color:#94a3b8">'+(L?'담당자가 확인 후 연락드립니다':'Staff will confirm shortly')+'</span>');
  };

  function showLcToast(msg){
    var t = document.getElementById('lc-toast');
    t.innerHTML = msg;
    t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 3500);
  }
})();