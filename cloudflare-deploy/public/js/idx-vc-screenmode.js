// idx-vc-screenmode.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  'use strict';
  function row(){ return document.getElementById('vc-main-row'); }
  function isPortrait(){ return window.matchMedia && window.matchMedia('(max-width:920px) and (orientation:portrait)').matches; }
  function inCall(){ return document.body.classList.contains('vc-in-call'); }

  // 스왑 버튼 라벨 갱신 (현재 모드 기준 '다음에 크게 볼 것'을 표시)
  window.vcUpdatePheroLabels = function(){
    var r = row(); if(!r) return;
    var swap = document.getElementById('vc-phero-swap');
    if(swap){
      swap.innerHTML = r.classList.contains('video-facepip')
        ? '📖 <span>교재 크게</span>'
        : '🧑‍🎓 <span>학생 크게</span>';
    }
  };

  // ⇄ 교재 크게(pip) ↔ 학생 얼굴 크게(facepip) 원터치 스왑
  window.vcPortraitSwap = function(){
    var r = row(); if(!r || typeof window.vcScreenSet !== 'function') return;
    window.vcScreenSet(r.classList.contains('video-facepip') ? 'pip' : 'facepip');
    window.vcUpdatePheroLabels();
    try { window.closePheroMenu(); } catch(e){}  // 메뉴 안 항목이므로 누르면 닫아 결과를 바로 보이게
  };

  // 👁 내(선생님) 얼굴 작게 보기/숨기기
  window.vcTogglePheroSelf = function(){
    var on = document.body.classList.toggle('vc-phero-self');
    var b = document.getElementById('vc-phero-self-btn');
    if(b) b.innerHTML = on ? '🙈 <span>내 얼굴</span>' : '👁 <span>내 얼굴</span>';
    try { window.closePheroMenu(); } catch(e){}  // 메뉴 안 항목이므로 누르면 닫아 결과를 바로 보이게
  };

  // ☰ 기능 메뉴 열기/닫기 (모든 기능·게임 버튼을 큰 그리드로 펼침)
  window.closePheroMenu = function(){ document.body.classList.remove('vc-phero-menu-open'); syncMenuBtn(); };
  window.vcTogglePheroMenu = function(){
    try { ensurePheroMenuItems(); } catch(e){}  // 탭바가 늦게 그려져도 열기 직전 스왑·내얼굴 항목 보장
    document.body.classList.toggle('vc-phero-menu-open');
    syncMenuBtn();
  };
  function syncMenuBtn(){
    var b = document.getElementById('vc-phero-menu-btn');
    if(!b) return;
    var open = document.body.classList.contains('vc-phero-menu-open');
    b.innerHTML = open ? '✕ <span>닫기</span>' : '☰ <span>기능</span>';
  }

  // 세로 진입 시 이상적 기본(pip=교재 크게) 자동 적용.
  // 사용자가 학생 크게(facepip)·솔로·전체를 이미 골랐으면 존중하고 건드리지 않음.
  var _applied = false;
  var _userChose = false;     // 🔧 (2026-07-14) 사용자가 화면분할 시트에서 직접 모드를 고르면 true.
  var _selfApplying = false;  //     maybeDefault 가 스스로 pip 를 넣는 내부 호출을 사용자 선택으로 오인하지 않도록 구분.

  // window.vcScreenSet 은 vcJoinRoom 내부에서 늦게 정의됨 → 존재하면 한 번만 래핑해서
  // '사용자가 직접 고른 화면분할 모드'를 감지한다. (자동 기본 적용은 _selfApplying 가드로 제외)
  function hookScreenSet(){
    var orig = window.vcScreenSet;
    if(typeof orig === 'function' && !orig.__pheroChoiceTracked){
      window.vcScreenSet = function(){
        if(!_selfApplying && isPortrait() && inCall()) _userChose = true;
        return orig.apply(this, arguments);
      };
      window.vcScreenSet.__pheroChoiceTracked = true;
    }
  }

  // 교사가 지금 '내용(교재·동영상)'을 공유 중인가? → 공유 중이면 내용 크게(pip), 아니면 선생님 크게(facepip).
  function isContentShared(){
    try { return !!(window.__vcPdfShared || window.__vcVideoSharing); } catch(e){ return false; }
  }

  var _lastWant = null;   // 마지막으로 자동 적용한 목표 모드 — 공유상태 '전환' 때만 다시 적용(깜빡임 방지)
  function maybeDefault(force, fromShare){
    hookScreenSet();
    if(!inCall() || !isPortrait() || typeof window.vcScreenSet !== 'function') return;
    var r = row(); if(!r) return;
    // 🔑 (2026-07-14 밤, 사장님 재지시) 세로폰 = '항상 1/2'(half). PIP 자동 전환 완전 폐지.
    //    ("절대로 PIP 사용하지 말고 1/2로") — 교재·동영상을 공유해도 얼굴은 위 절반 유지,
    //    내용은 아래 절반에 표시(탭 전환은 그대로). 방에 남은 옛 공유기록(stale pdfState)이
    //    pip 를 발동시키던 문제도 이걸로 함께 사라짐.
    var want = 'half';
    if(fromShare){
      // 🙈 (2026-07-14) 얼굴 숨김(hidefaces)은 명시적 선택 — 공유 재평가(room-media 폴링 포함)가
      //   half 로 되돌려 얼굴을 다시 띄우던 회귀의 원인. 숨김 중엔 절대 건드리지 않는다.
      if(window.__vcFacesHidden){ window.vcUpdatePheroLabels(); return; }
      // 교사의 공유 시작/중지는 최우선 — 학생이 다른 모드를 골랐어도 교사가 보여주는 대로 따라간다.
      _userChose = false;
    } else {
      // 사용자가 직접 고른 모드(화면분할·스왑·기능 열기)는 절대 자동으로 되돌리지 않는다.
      if(_userChose || r.classList.contains('video-solo') || r.classList.contains('video-full')){
        window.vcUpdatePheroLabels(); return;
      }
      // 감시(Observer/resize) 틱에서는 '목표가 바뀌었을 때만' 적용 — 같은 목표를 반복 적용해 화면을 흔들지 않음
      if(!force && _applied && want === _lastWant){ window.vcUpdatePheroLabels(); return; }
    }
    _lastWant = want;
    if(r.classList.contains('video-' + want)){ _applied = true; window.vcUpdatePheroLabels(); return; }  // 이미 원하는 모드
    _selfApplying = true;
    try { window.vcScreenSet(want); } finally { _selfApplying = false; }
    _applied = true;
    window.vcUpdatePheroLabels();
  }
  // 교사가 내용을 공유/중지하는 순간 세로 레이아웃을 다시 판단(선생님 크게 ↔ 내용 크게).
  window.__vcPheroReeval = function(){ try { maybeDefault(true, true); } catch(e){} };

  // 세로 전용 컨트롤 FAB + ☰ 메뉴 배경 딤 주입
  function injectCtrl(){
    if(!document.getElementById('vc-phero-backdrop')){
      var bd = document.createElement('div');
      bd.className = 'vc-phero-backdrop'; bd.id = 'vc-phero-backdrop';
      bd.addEventListener('click', function(){ window.closePheroMenu(); });
      document.body.appendChild(bd);
    }
    if(!document.getElementById('vc-phero-ctrl')){
      var wrap = document.createElement('div');
      wrap.className = 'vc-phero-ctrl'; wrap.id = 'vc-phero-ctrl';
      // FAB 엔 '☰ 기능' 버튼 하나만 (교재 크게·내 얼굴은 메뉴 안으로 이동).
      wrap.innerHTML =
        '<button class="vc-phero-menu-btn" id="vc-phero-menu-btn" type="button" onclick="vcTogglePheroMenu()" title="모든 기능·게임 메뉴 열기">☰ <span>기능</span></button>';
      document.body.appendChild(wrap);
    }
    ensurePheroMenuItems();
  }

  // 교재 크게 스왑 / 내 얼굴 토글 버튼을 ☰ 기능 메뉴(=탭바 그리드) 안에 주입.
  // 평소엔 .vc-phero-menu-item CSS 로 숨고, 메뉴 열릴 때만 그리드 버튼으로 노출된다.
  function ensurePheroMenuItems(){
    var tb = document.querySelector('#vc-main-row .content-pane .tab-bar');
    if(!tb) return;
    var sw = document.getElementById('vc-phero-swap');
    if(!sw){
      sw = document.createElement('button');
      sw.type = 'button'; sw.id = 'vc-phero-swap';
      sw.className = 'vc-phero-menu-item vc-phero-swap';
      sw.setAttribute('onclick', 'vcPortraitSwap()');
      sw.setAttribute('title', '교재 크게 ↔ 학생 얼굴 크게');
      sw.innerHTML = '🧑‍🎓 <span>학생 크게</span>';
      tb.appendChild(sw);
    }
    var sf = document.getElementById('vc-phero-self-btn');
    if(!sf){
      sf = document.createElement('button');
      sf.type = 'button'; sf.id = 'vc-phero-self-btn';
      sf.className = 'vc-phero-menu-item vc-phero-self-btn';
      sf.setAttribute('onclick', 'vcTogglePheroSelf()');
      sf.setAttribute('title', '내(선생님) 얼굴 작게 보기/숨기기');
      sf.innerHTML = '👁 <span>내 얼굴</span>';
      tb.appendChild(sf);
    }
    // 🎬 동영상 공유 도구(YouTube·URL·파일 업로드 등) — '교사만' ☰ 메뉴에 노출.
    //   학생 폰은 이 버튼도 도구 줄도 안 보임(선생님이 틀어주는 것만 크게 보임).
    var isTeach = false;
    try { isTeach = (typeof vcIsTeacherRole === 'function') ? vcIsTeacherRole()
                  : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'); } catch(e){}
    var vt = document.getElementById('vc-phero-vptools-btn');
    if(isTeach && !vt){
      vt = document.createElement('button');
      vt.type = 'button'; vt.id = 'vc-phero-vptools-btn';
      vt.className = 'vc-phero-menu-item';
      vt.setAttribute('title', '동영상 공유 도구(YouTube·URL·파일) 보이기/숨기기');
      vt.innerHTML = '🎬 <span>동영상 도구</span>';
      vt.addEventListener('click', function(){
        var on = document.body.classList.toggle('vc-vp-tools-open');
        try { if (on && typeof vcSwitchTab === 'function') vcSwitchTab('video'); } catch(e){}
        try { window.closePheroMenu(); } catch(e){}
      });
      tb.appendChild(vt);
    } else if (!isTeach && vt) { try { vt.remove(); } catch(e){} }
  }

  // facepip(학생 크게)에서 기능 탭을 누르면 자동으로 pip(교재 크게)로 전환 → 내용 크게 보임.
  // 또한 ☰ 메뉴에서 어떤 기능을 고르든 메뉴를 닫아 바로 그 화면이 크게 보이게.
  function wrapContentTab(){
    try {
      var orig = window.vcToggleContentTab;
      if (typeof orig === 'function' && !orig.__pheroWrapped) {
        window.vcToggleContentTab = function(){
          var r = row();
          if (r && r.classList.contains('video-facepip') && isPortrait() && typeof window.vcScreenSet === 'function') {
            // 학생이 스스로 기능(칠판 등)을 열었음 = 사용자 선택으로 존중(_userChose).
            // 자동 기본(facepip)이 이 화면을 되돌려 닫아버리지 않게 한다.
            window.vcScreenSet('pip'); window.vcUpdatePheroLabels();
          }
          try { window.closePheroMenu(); } catch(e){}
          return orig.apply(this, arguments);
        };
        window.vcToggleContentTab.__pheroWrapped = true;
      }
    } catch(e){}
  }

  // 📚교재도구/✍️필기도구(mangoToggleToolDock)도 메뉴에서 누르면 메뉴 닫고 facepip→pip 전환
  function wrapToolDock(){
    try {
      var orig = window.mangoToggleToolDock;
      if (typeof orig === 'function' && !orig.__pheroWrapped) {
        window.mangoToggleToolDock = function(){
          var r = row();
          if (r && r.classList.contains('video-facepip') && isPortrait() && typeof window.vcScreenSet === 'function') {
            // 사용자가 직접 도구를 열었음 = 사용자 선택으로 존중(_userChose)
            window.vcScreenSet('pip'); window.vcUpdatePheroLabels();
          }
          try { window.closePheroMenu(); } catch(e){}
          return orig.apply(this, arguments);
        };
        window.mangoToggleToolDock.__pheroWrapped = true;
      }
    } catch(e){}
  }

  function boot(){
    injectCtrl();
    wrapContentTab();
    wrapToolDock();
    hookScreenSet();
    // mango-tools-dock.js / 탭바 가 늦게 로드될 수 있어 재시도
    setTimeout(wrapToolDock, 800);
    setTimeout(wrapToolDock, 2000);
    setTimeout(ensurePheroMenuItems, 800);
    setTimeout(ensurePheroMenuItems, 2000);
    setTimeout(hookScreenSet, 800);   // vcScreenSet 은 입장(vcJoinRoom) 후 정의되므로 재시도 훅
    setTimeout(hookScreenSet, 2000);
    // 통화 시작(vc-in-call) 감지 → 세로면 기본 적용, 통화 종료 시 리셋
    try {
      new MutationObserver(function(){
        if(inCall()) maybeDefault(false);
        else {  // 통화 종료 → 다음 수업은 다시 기본(선생님 크게)부터
          _applied = false; _userChose = false; _lastWant = null;
          window.__vcPdfShared = false; window.__vcVideoSharing = false;
          // ⚠️ classList.remove()는 클래스가 '없어도' class 속성을 다시 써서 mutation 을
          //   또 발생시킴 → 이 옵저버가 자기 자신을 무한 재귀(메인스레드 정지, 홈 전체 먹통).
          //   반드시 있을 때만 지운다. (2026-07-14 라이브 장애 원인)
          try { if (document.body.classList.contains('vc-vp-tools-open')) document.body.classList.remove('vc-vp-tools-open'); } catch(e){}
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch(e){}
    // 방향 전환 → 세로면 기본 재적용
    window.addEventListener('orientationchange', function(){ setTimeout(function(){ maybeDefault(true); }, 400); });
    window.addEventListener('resize', function(){ setTimeout(function(){ if(isPortrait()) maybeDefault(false); }, 400); });
    setTimeout(function(){ maybeDefault(false); }, 600);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

