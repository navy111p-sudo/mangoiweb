// idx-user-session.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

// ═══════════════════════════════════════════════════════════════════
// 학생 로그인 시스템 + 본인 수업 필터링
// localStorage 키: mangoi_logged_user = { uid, name }
// ═══════════════════════════════════════════════════════════════════
(function(){
  /* 🔒 (2026-09-22) 「다른 기기에서 로그인되었습니다」 — 같은 기기인데 «자기가 자기를 밀어내던» 것.
     운영은 SINGLE_SESSION='on' 이라 로그인에 «성공할 때마다» 서버가 새 세션번호(sid)를 발급하고
     이전 토큰은 그 자리에서 401 이 된다(src/auth-token.ts). 그런데 토큰 칸이 두 벌인데 서로를
     몰랐다 — 홈·학습 화면은 mango_token, 마이 페이지(parent.html)는 mangoi_parent_token.
     ⟹ 홈에서 로그인하면 마이 페이지 토큰이 죽어 「🔒 다시 로그인해주세요」가 뜬다.
     ✅ 그래서 «이미 있던 같은 계정의» 마이 페이지 토큰을 새 토큰으로 갱신한다.
     ⛔ 없으면 «만들지» 않는다 — 마이 페이지는 「로그인 유지」를 켰을 때만 토큰을 남기는데
        (2026-07-30 제보 #3 — 자녀가 비번 없이 학부모 페이지를 여는 것을 막는 장치),
        여기서 새로 만들면 그 정책이 통째로 풀린다. 목적은 «되던 것을 안 죽이기» 다.
     ⛔ 다른 계정이면 손대지 않는다 — 대소문자까지 정확일치(Kim/kim 처럼 대소문자만 다른 계정이 실재).
     ⚠️ parent.html 에 같은 규칙이 한 벌 더 있다(그 화면은 이 파일을 싣지 않는다).
        둘이 같은 답을 내는지는 test-harness/login_token_sync_harness.mjs 가 대조한다.
     📄 docs/작업기록/260922_로그인_다른기기에서_로그인됨_한기기_자가퇴출_진단.md */
  function lmTokenUid(t){
    try {
      var p = String(t || '').split('.')[0].replace(/-/g,'+').replace(/_/g,'/');
      while (p.length % 4) p += '=';
      return String(JSON.parse(atob(p)).uid || '');
    } catch(e){ return ''; }
  }
  function lmSyncParentToken(newToken){
    try {
      var cur = localStorage.getItem('mangoi_parent_token') || '';
      if (!cur || !newToken) return false;                 // ⛔ 없으면 만들지 않는다(정책 유지)
      var a = lmTokenUid(cur), b = lmTokenUid(newToken);
      if (!a || !b || a !== b) return false;               // 다른 계정 → 손대지 않는다
      localStorage.setItem('mangoi_parent_token', newToken);
      return true;
    } catch(e){ return false; }
  }

  // 데모 학생 5명 + 각자의 수업
  // hourOffset: 0.5 = 30분 후 / dateOffset: 일 단위
  var demoStudents = {
    'hong': {
      name:'홍길동', uid:'hong',
      classes:[
        { id:'hong-1', type:'1on1',  teacher:'박지윤',       dateOffset:1, hour:14, durationMin:60 },
        { id:'hong-2', type:'group', teacher:'이서연',       dateOffset:3, hour:16, durationMin:40 },
        { id:'hong-3', type:'1on1',  teacher:'Maria Santos', hourOffset:0.4, durationMin:60 } // 24분 후 (연기·변경 모두 거부)
      ]
    },
    'kim': {
      name:'김민수', uid:'kim',
      classes:[
        { id:'kim-1', type:'1on1', teacher:'김민서', dateOffset:2, hour:10, durationMin:40 },
        { id:'kim-2', type:'1on1', teacher:'정수아', dateOffset:5, hour:18, durationMin:60 }
      ]
    },
    'lee': {
      name:'이지민', uid:'lee',
      classes:[
        { id:'lee-1', type:'group', teacher:'이서연',       dateOffset:1, hour:11, durationMin:40 },
        { id:'lee-2', type:'1on1',  teacher:'Maria Santos', dateOffset:4, hour:20, durationMin:60 }
      ]
    },
    'park': {
      name:'박서연', uid:'park',
      classes:[
        { id:'park-1', type:'1on1', teacher:'박지윤', dateOffset:6, hour:15, durationMin:60 },
        { id:'park-2', type:'temp', teacher:'강하은', dateOffset:2, hour:9,  durationMin:20 }
      ]
    },
    'navy111p': {
      name:'정우영', uid:'navy111p',
      classes:[
        { id:'navy-1', type:'1on1',  teacher:'박지윤',       dateOffset:1, hour:14, durationMin:60 },
        { id:'navy-2', type:'group', teacher:'이서연',       dateOffset:2, hour:16, durationMin:40 },
        { id:'navy-3', type:'1on1',  teacher:'Maria Santos', hourOffset:0.5, durationMin:60 }
      ]
    }
  };
  window.__demoStudents = demoStudents;

  function getCurrentUser(){
    try {
      var raw = localStorage.getItem('mangoi_logged_user');
      if (raw) {
        var u = JSON.parse(raw);
        if (u && u.uid) {
          // 🔑 호환 미러 — `mango_user` 키도 동기화 (가드 함수가 옛 키 쓰는 경우 대비)
          try {
            var prev = localStorage.getItem('mango_user');
            if (!prev || prev === 'null') localStorage.setItem('mango_user', JSON.stringify(u));
          } catch(e){}
          return u;
        }
      }
      // 🔑 폴백 — `mango_user` 만 있는 옛 사용자도 인식
      var alt = JSON.parse(localStorage.getItem('mango_user') || 'null');
      if (alt && (alt.uid || alt.id)) {
        // 신키로 끌어올림
        try { localStorage.setItem('mangoi_logged_user', JSON.stringify({uid: alt.uid || alt.id, name: alt.name || alt.uid, role: alt.role || 'student'})); } catch(e){}
        return { uid: alt.uid || alt.id, name: alt.name || alt.uid, role: alt.role || 'student' };
      }
      return null;
    } catch(e) { return null; }
  }
  window.getCurrentUser = getCurrentUser;

  function setUser(u){
    if(u) {
      // 🔑 두 키 모두에 저장 — 카드 가드(`mango_user` 체크)도 통과하게 함
      localStorage.setItem('mangoi_logged_user', JSON.stringify(u));
      try { localStorage.setItem('mango_user', JSON.stringify(u)); } catch(e){}
      try { if (u.uid) localStorage.setItem('mangoi_uid', u.uid); } catch(e){}
    } else {
      localStorage.removeItem('mangoi_logged_user');
      try { localStorage.removeItem('mango_user'); } catch(e){}
      try { localStorage.removeItem('mangoi_uid'); } catch(e){}
      // 🔐 uid 서명 토큰도 함께 폐기 — 로그아웃 후 이전 계정 대화 접근 방지
      try { localStorage.removeItem('mango_token'); } catch(e){}
    }
    updateLoginUI();
  }
  window.setUser = setUser;

  // 헤더 로그인 버튼 상태 갱신
  function updateLoginUI(){
    var btn = document.getElementById('login-btn');
    var ico = document.getElementById('login-btn-ico');
    var lbl = document.getElementById('login-btn-label');
    if(!btn) return;
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var u = getCurrentUser();
    if(u){
      ico.textContent = '👤';
      lbl.textContent = u.name;
      lbl.setAttribute('data-ko', u.name);
      lbl.setAttribute('data-en', u.name);
      btn.onclick = toggleUserMenu;
      btn.style.background = 'linear-gradient(135deg,rgba(16,185,129,.18),rgba(5,150,105,.18))';
      btn.style.borderColor = 'rgba(16,185,129,.5)';
      btn.style.color = '#a7f3d0';
    } else {
      /* 🧑‍🏫 (2026-07-30 강사 피드백 Kaye 17번) "홈을 눌렀더니 갑자기 로그아웃됐다"
         [원인] 교사·지사·대리점 로그인은 `mangoi_admin_session` 만 저장하고 학생 키
                (`mangoi_logged_user`)는 만들지 않는다. 그런데 이 홈 화면은 학생 키만 보고
                로그인 여부를 판단해서, 수업에서 홈을 누르면 '로그인' 버튼으로 되돌아갔다.
                (실제로 로그아웃된 것은 아니고, 화면이 못 알아본 것)
         [해결] 관리자·교사 세션이 있으면 이름을 보여 주고, 누르면 내 페이지로 보낸다.
                🔒 학생 신분(`mangoi_logged_user`)은 만들지 않는다 — 교사 계정으로 학생 전용
                   기능이 열리면 안 되므로, 표시와 이동만 바로잡는다. */
      var _as = null;
      try { _as = JSON.parse(localStorage.getItem('mangoi_admin_session') || 'null'); } catch(_) { _as = null; }
      if (_as && _as.name) {
        ico.textContent = '🧑‍🏫';
        lbl.textContent = _as.name;
        lbl.setAttribute('data-ko', _as.name);
        lbl.setAttribute('data-en', _as.name);
        var _r = String(_as.role || '');
        // 🇵🇭🏫 (2026-08-08) 여기만 옛 규칙이 남아 강사·매니저를 전부 /admin/mypage 로 보내고 있었다.
        //   위쪽 로그인 분기(24751)와 admin/login.html 은 이미 /teacher 로 가는데 이 메뉴만 달랐다.
        //   역할판정 로직이 세 곳에 복제돼 있다 — 하나를 고치면 나머지도 반드시 함께 볼 것(CLAUDE.md 2절).
        // 🏠 첫 화면 정본은 서버(auth-admin.ts home_path). 없을 때만 옛 규칙으로 폴백.
        var _dest = (_as && _as.home_path)
                  || ((_r.indexOf('teacher') >= 0) ? '/teacher'
                     : (_r === 'branch' || _r === 'agency') ? '/manager'
                     : '/admin.html');
        btn.title = L ? '메뉴 열기' : 'Open menu';
        btn.onclick = function(){ toggleAdminUserMenu(_as, _dest); };
        btn.style.background = 'linear-gradient(135deg,rgba(59,130,246,.18),rgba(37,99,235,.18))';
        btn.style.borderColor = 'rgba(59,130,246,.5)';
        btn.style.color = '#bfdbfe';
      } else {
        ico.textContent = '🔑';
        lbl.textContent = L?'로그인':'Login';
        lbl.setAttribute('data-ko','로그인');
        lbl.setAttribute('data-en','Login');
        btn.onclick = openLoginModal;
        // 🔑 (2026-08-25) 비로그인 로그인 버튼이 눈에 안 띈다는 지적 — 무채색 대신 골드로.
        btn.style.background = 'linear-gradient(135deg,#fde68a,#f59e0b)';
        btn.style.borderColor = 'rgba(245,158,11,0.9)';
        btn.style.color = '#1a1a1a';
      }
    }
    // 🎁 Phase P3: 포인트 칩 동기화 (로그인 시 표시 + 잔액 fetch)
    if (typeof refreshPointsChip === 'function') refreshPointsChip();
  }
  window.updateLoginUI = updateLoginUI;

  // 🎁 Phase P3 — 포인트 칩 + 상점 ───────────────────────────────────
  // fix (2026-06-01) — 단일 요청(single-flight) + 5초 캐시로 폭주 방지.
  //   여러 init 경로가 동시에 호출해도 네트워크 요청은 1번만 나감 → 503 폭주 차단.
  window._pointsChipInflight = null;
  window._pointsChipLastTs = 0;
  window.refreshPointsChip = async function(force){
    var chip = document.getElementById('points-chip');
    var lbl = document.getElementById('points-chip-label');
    if (!chip || !lbl) return;
    var u = getCurrentUser();
    if (!u) { chip.style.display='none'; return; }
    chip.style.display='inline-flex';
    var now = Date.now();
    if (!force && (now - window._pointsChipLastTs < 5000)) return;   // 5초 내 중복 호출 무시
    if (window._pointsChipInflight) return;                          // 진행 중이면 재사용
    window._pointsChipInflight = (async function(){
      try {
        var r = await fetch('/api/points/balance?uid=' + encodeURIComponent(u.uid) + '&token=' + encodeURIComponent((function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })()), { cache: 'no-store' });
        var d = await r.json();
        var bal = (d && typeof d.balance === 'number') ? d.balance : 0;
        lbl.textContent = bal.toLocaleString('ko-KR') + ' P';
        chip.setAttribute('data-balance', String(bal));
        window._pointsChipLastTs = Date.now();
      } catch(e) {
        lbl.textContent = '0 P';
      } finally {
        window._pointsChipInflight = null;
      }
    })();
  };

  // 🆕 포인트 상점 안내 음성 (중간 볼륨 자동재생 + 우상단 🔇 토글)
  var pointsAudio = null;
  function playPointsGreeting(){
    try {
      if (!pointsAudio) {
        pointsAudio = new Audio('/audio/포인트사용.wav');
        pointsAudio.preload = 'auto';
        pointsAudio.addEventListener('ended', updatePointsAudioBtn);
        pointsAudio.addEventListener('pause', updatePointsAudioBtn);
        pointsAudio.addEventListener('play', updatePointsAudioBtn);
      }
      pointsAudio.volume = 0.5;          // 중간 정도 크기
      pointsAudio.currentTime = 0;
      var p = pointsAudio.play();
      if (p && p.catch) p.catch(function(e){ console.warn('[points] 음성 자동재생 차단:', e); updatePointsAudioBtn(); });
      updatePointsAudioBtn();
    } catch(e) { console.warn('[points] audio err:', e); }
  }
  function stopPointsGreeting(){
    if (pointsAudio) { try { pointsAudio.pause(); pointsAudio.currentTime = 0; } catch(e){} }
    updatePointsAudioBtn();
  }
  function updatePointsAudioBtn(){
    var btn = document.getElementById('ps-audio-btn');
    if (!btn) return;
    var playing = pointsAudio && !pointsAudio.paused && !pointsAudio.ended;
    btn.innerHTML = playing ? '🔇' : '🔊';
    btn.style.borderColor = playing ? 'rgba(251,191,36,.7)' : 'rgba(251,191,36,.45)';
  }

  // 포인트 상점 모달 ─────────────────────────────────────────────────
  window.showPointsShop = async function(){
    var existing = document.getElementById('points-shop-overlay');
    if (existing && existing.classList.contains('show')) { closePointsShop(); return; }
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var u = getCurrentUser();
    if (!u) {
      // 로그인 필요
      if (typeof openLoginModal === 'function') { openLoginModal(); }
      else alert(L?'로그인이 필요합니다.':'Login required.');
      return;
    }
    var ov = document.getElementById('points-shop-overlay') || (function(){
      var d = document.createElement('div');
      d.id = 'points-shop-overlay';
      d.className = 'ps-overlay';
      d.onclick = function(e){ if (e.target===d) closePointsShop(); };
      document.body.appendChild(d);
      return d;
    })();
    ov.innerHTML = '<div class="ps-modal"><div class="ps-head">'+
        '<h2>🎁 '+(L?'포인트 상점':'Point Shop')+'</h2>'+
        /* 🎁 (2026-07-30) "포인트 모으는 법" — 요청 슬라이드5: "내 포인트" 왼쪽에 배치.
           DOM 순서상 ps-bal 바로 앞이면 flex 행에서 자동으로 왼쪽에 온다(ps-head h2 는 flex:1). */
        '<button type="button" class="ps-howto-btn" onclick="showPointsHowTo()" style="background:rgba(0,0,0,0.3);border:1px solid rgba(251,191,36,0.35);color:#fde68a;padding:8px 12px;border-radius:99px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap">'+
          '💡 '+(L?'포인트 모으는 법':'How to earn')+'</button>'+
        '<div class="ps-bal" id="ps-balance">'+(L?'잔액 불러오는 중…':'Loading…')+'</div>'+
        '<button id="ps-audio-btn" type="button" title="안내 음성 끄기/켜기" onclick="psToggleAudio()" style="background:rgba(20,28,48,.65);border:1px solid rgba(251,191,36,.45);color:#fde68a;width:32px;height:32px;border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-right:6px;backdrop-filter:blur(8px);padding:0;line-height:1">🔊</button>'+
        '<button class="ps-close" onclick="closePointsShop()">✕</button>'+
      '</div>'+
      '<div class="ps-body">'+
        '<div class="ps-tabs">'+
          '<button class="ps-tab active" onclick="psSwitchTab(\'catalog\',this)">'+(L?'🎁 상품 둘러보기':'🎁 Browse Gifts')+'</button>'+
          '<button class="ps-tab" onclick="psSwitchTab(\'history\',this)">'+(L?'🧾 내 교환내역':'🧾 My Redemptions')+'</button>'+
        '</div>'+
        '<div id="ps-pane-catalog" class="ps-pane active"><div class="ps-loading">'+(L?'상품 불러오는 중…':'Loading gifts…')+'</div></div>'+
        '<div id="ps-pane-history" class="ps-pane"><div class="ps-loading">'+(L?'내역 불러오는 중…':'Loading history…')+'</div></div>'+
      '</div></div>';
    ov.classList.add('show');

    // 잔액 & 카탈로그 로드
    psRefreshBalance();
    psLoadCatalog();
    // 🆕 안내 음성 자동 재생
    setTimeout(playPointsGreeting, 200);
  };

  // 🎁 다른 페이지/카테고리 그리드에서 "포인트상점"을 누르면 /?shop=1 로 홈에 온다 → 자동으로 상점 모달 열기
  //    (예전엔 /streak.html 리더보드로 잘못 이동했음. 상점=상품 교환 모달이 정본)
  (function _psAutoOpenFromQuery(){
    try {
      var _q = new URLSearchParams(location.search);
      if (_q.get('shop') === '1' || _q.get('menu') === 'points-shop' || _q.get('menu') === 'mypoints') {
        var _open = function(){ if (typeof window.showPointsShop === 'function') window.showPointsShop(); else setTimeout(_open, 300); };
        if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(_open, 400);
        else document.addEventListener('DOMContentLoaded', function(){ setTimeout(_open, 400); });
      }
    } catch(e){}
  })();
  window.psToggleAudio = function(){
    if (pointsAudio && !pointsAudio.paused) stopPointsGreeting();
    else playPointsGreeting();
  };
  window.closePointsShop = function(){
    var ov = document.getElementById('points-shop-overlay');
    if (ov) ov.classList.remove('show');
    document.body.style.overflow='';
    // 모달 닫으면 음성 즉시 정지
    stopPointsGreeting();
  };
  /* 🎁 (2026-07-30) "포인트 모으는 법" — 제보 슬라이드5 요청.
     하드코딩 금지: /api/points/rules(신설)가 DB point_rules(enabled=1) 를 그대로 읽어 보여준다.
     관리자가 규칙을 바꾸면(추가·금액변경·비활성화) 이 표도 자동으로 같이 바뀐다.
     (장지웅 부장님 Q5: 학부모·학생에게 안내한 적 없는 7개는 별도 마이그레이션으로 이미 정리 대상) */
  window.showPointsHowTo = async function(){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var bg = document.getElementById('points-howto-bg') || (function(){
      var d = document.createElement('div');
      d.id = 'points-howto-bg';
      d.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:20px';
      d.onclick = function(e){ if (e.target===d) closePointsHowTo(); };
      document.body.appendChild(d);
      return d;
    })();
    bg.innerHTML = '<div style="max-width:480px;width:100%;max-height:80vh;overflow-y:auto;background:linear-gradient(160deg,#1e293b,#0f172a);border:1px solid rgba(251,191,36,0.32);border-radius:18px;box-shadow:0 30px 80px -10px rgba(0,0,0,0.7);color:#e2e8f0;font-family:inherit">'+
      '<div style="padding:18px 22px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,0.08)">'+
        '<h3 style="margin:0;flex:1;font-size:17px;font-weight:800;color:#fff">💡 '+(L?'포인트 모으는 법':'How to earn points')+'</h3>'+
        '<button type="button" onclick="closePointsHowTo()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#cbd5e1;font-size:16px;width:30px;height:30px;border-radius:50%;cursor:pointer">✕</button>'+
      '</div>'+
      '<div id="points-howto-body" style="padding:16px 20px 22px"><div style="padding:30px 10px;text-align:center;color:#94a3b8;font-size:13px">'+(L?'불러오는 중…':'Loading…')+'</div></div>'+
    '</div>';
    bg.style.display = 'flex';
    try {
      var r = await fetch('/api/points/rules', { cache: 'no-store' });
      var d = await r.json();
      var body = document.getElementById('points-howto-body');
      if (!d || !d.ok || !d.rules || !d.rules.length) {
        body.innerHTML = '<div style="padding:20px 10px;text-align:center;color:#94a3b8;font-size:13px">'+(L?'현재 안내할 활동이 없어요. 곧 채워질 예정이에요!':'Nothing to show yet — check back soon!')+'</div>';
        return;
      }
      var rows = d.rules.map(function(rule){
        var cap = rule.daily_cap ? (L ? ('하루 '+rule.daily_cap+'회') : (rule.daily_cap+'/day')) : (L?'제한 없음':'No limit');
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="color:#fff;font-size:13.5px;font-weight:700">'+escapeHtmlPointsHowTo(rule.label)+'</div>'+
            (rule.description ? '<div style="color:#94a3b8;font-size:11.5px;margin-top:2px;line-height:1.4">'+escapeHtmlPointsHowTo(rule.description)+'</div>' : '')+
          '</div>'+
          '<div style="text-align:right;flex-shrink:0">'+
            '<div style="color:#fde68a;font-size:15px;font-weight:900">+'+Number(rule.amount).toLocaleString('ko-KR')+'P</div>'+
            '<div style="color:#64748b;font-size:10.5px;margin-top:1px">'+cap+'</div>'+
          '</div>'+
        '</div>';
      }).join('');
      body.innerHTML = '<div>'+rows+'</div>'+
        '<p style="margin:14px 0 0;color:#7c88a8;font-size:11px;line-height:1.6;text-align:center">'+
        (L?'모은 포인트는 포인트 상점에서 상품으로 교환할 수 있어요 🎁':'Redeem points for gifts in the Point Shop 🎁')+'</p>';
    } catch (e) {
      var body2 = document.getElementById('points-howto-body');
      if (body2) body2.innerHTML = '<div style="padding:20px 10px;text-align:center;color:#fca5a5;font-size:13px">'+(L?'불러오지 못했어요. 잠시 후 다시 시도해 주세요.':'Failed to load. Please try again.')+'</div>';
    }
  };
  window.closePointsHowTo = function(){
    var bg = document.getElementById('points-howto-bg');
    if (bg) bg.style.display = 'none';
  };
  function escapeHtmlPointsHowTo(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  window.psSwitchTab = function(tab, btn){
    document.querySelectorAll('.ps-tab').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.ps-pane').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('ps-pane-'+tab).classList.add('active');
    if (tab==='history') psLoadHistory();
    else psLoadCatalog();
  };
  window.psRefreshBalance = async function(){
    var u = getCurrentUser(); if (!u) return;
    var el = document.getElementById('ps-balance'); if (!el) return;
    try {
      var r = await fetch('/api/points/balance?uid='+encodeURIComponent(u.uid)+'&token='+encodeURIComponent((function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })()));
      var d = await r.json();
      var bal = (d&&d.ok)?(d.balance||0):0;
      var L = (window.getLang?window.getLang():'ko')==='ko';
      el.innerHTML = '<span class="ps-bal-label">'+(L?'내 포인트':'My Points')+'</span> '+
        '<span class="ps-bal-amt">'+bal.toLocaleString('ko-KR')+' P</span>';
      refreshPointsChip(true);
    } catch(e) {}
  };
  // 브랜드의 망고 이모지 → Mr.mango 캐릭터. 판정이 indexOf 인 이유, Text/Html 을 가른 이유는
  // docs/작업기록/260825_포인트샵_브랜드_Mr.mango.md (첫 화면 예산이 빠듯해 여기엔 안 적는다)
  var PS_MANGO_RE = /\u{1F96D}/gu;
  function psBrandText(b){ return String(b||'').replace(PS_MANGO_RE,'').replace(/\s+/g,' ').trim(); }
  function psBrandHtml(b){
    var raw = String(b||'').trim(); if (!raw) return '';
    if (raw.indexOf('\u{1F96D}') < 0) return escapeLT(raw);
    return '<img src="/img/mango-char.png" alt="Mr.mango" style="width:16px;height:16px;object-fit:contain;vertical-align:-4px;margin-right:3px">' + escapeLT(psBrandText(raw) || '\uB9DD\uACE0\uC544\uC774');
  }
  window.psLoadCatalog = async function(){
    var pane = document.getElementById('ps-pane-catalog'); if (!pane) return;
    var L = (window.getLang?window.getLang():'ko')==='ko';
    try {
      // 공개 /api/gifts/catalog 가 비어있으면 서버가 자동 시드 후 반환하므로
      // 예전처럼 관리자 시드 API 를 학생 화면에서 호출할 필요가 없다.
      var r = await fetch('/api/gifts/catalog');
      var d = await r.json();
      var rows = d.rows || [];
      if (!rows.length) { pane.innerHTML = '<div class="ps-empty">'+(L?'상품이 없습니다.':'No gifts available.')+'</div>'; return; }
      var cards = rows.map(function(g){
        var brandTag = g.brand ? '<div class="ps-brand">'+psBrandHtml(g.brand)+'</div>' : '';
        var stockTag = (g.stock != null) ? ('<div class="ps-stock">'+(L?'남은 수량':'Stock')+' '+g.stock+'</div>') : '';
        // 🥭 망고아이(수업료 전환) 카드는 3D 캐릭터 이미지로 표시
        var isMango = (g.brand && g.brand.indexOf('망고아이') >= 0) || g.category === 'tuition'
          || (g.thumbnail_url && g.thumbnail_url.indexOf('/img/gifts/mangoi.svg') >= 0);
        var thumb = isMango
          ? '<div class="ps-thumb ps-thumb-mango"><img src="/img/Mangoi_Character.png" alt="망고아이"></div>'
          : (g.thumbnail_url ? '<img class="ps-thumb" src="'+escapeLT(g.thumbnail_url)+'" alt="">' :
             '<div class="ps-thumb ps-thumb-fallback">🎁</div>');
        return '<div class="ps-card">'+
          thumb +
          '<div class="ps-card-body">'+
            brandTag +
            '<div class="ps-name">'+escapeLT(g.name)+'</div>'+
            (g.description?'<div class="ps-desc">'+escapeLT(g.description)+'</div>':'')+
            stockTag +
          '</div>'+
          '<div class="ps-card-foot">'+
            '<div class="ps-price">'+g.point_price.toLocaleString('ko-KR')+' P</div>'+
            '<button class="ps-redeem-btn" onclick="psStartRedeem('+g.id+',&quot;'+escapeLT(g.name).replace(/&quot;/g,'\\&quot;')+'&quot;,&quot;'+escapeLT(psBrandText(g.brand||'')).replace(/&quot;/g,'\\&quot;')+'&quot;,'+g.point_price+')">'+(L?'교환하기':'Redeem')+'</button>'+
          '</div>'+
        '</div>';
      }).join('');
      pane.innerHTML = '<div class="ps-grid">'+cards+'</div>';
    } catch(e) {
      pane.innerHTML = '<div class="ps-empty">'+(L?'로드 실패':'Load failed')+': '+e.message+'</div>';
    }
  };
  window.psLoadHistory = async function(){
    var pane = document.getElementById('ps-pane-history'); if (!pane) return;
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var u = getCurrentUser(); if (!u) return;
    try {
      var _grt=''; try{ _grt=localStorage.getItem('mango_token')||''; }catch(e){}  // 🔐 본인 인증
      var r = await fetch('/api/gifts/redemptions?uid='+encodeURIComponent(u.uid)+(_grt?'&token='+encodeURIComponent(_grt):''));
      var d = await r.json();
      var rows = (d&&d.rows)||[];
      if (!rows.length) { pane.innerHTML = '<div class="ps-empty">'+(L?'교환 내역이 없습니다.':'No redemptions yet.')+'</div>'; return; }
      var STATUS_LABEL = { pending:'⏳ 발송대기', sent:'📤 발송됨', delivered:'✅ 수령완료', failed:'❌ 실패', refunded:'↩️ 환불됨' };
      var STATUS_COLOR = { pending:'#fbbf24', sent:'#60a5fa', delivered:'#10b981', failed:'#ef4444', refunded:'#94a3b8' };
      var items = rows.map(function(x){
        var dt = new Date(x.requested_at).toLocaleString('ko-KR');
        return '<div class="ps-hist-item">'+
          '<div class="ps-hist-main">'+
            '<div class="ps-hist-name">'+(x.gift_brand?psBrandHtml(x.gift_brand)+' · ':'')+escapeLT(x.gift_name||'-')+'</div>'+
            '<div class="ps-hist-meta">'+dt+' · '+(x.recipient_phone||'-')+'</div>'+
          '</div>'+
          '<div class="ps-hist-side">'+
            '<div class="ps-hist-status" style="color:'+(STATUS_COLOR[x.status]||'#94a3b8')+'">'+(STATUS_LABEL[x.status]||x.status)+'</div>'+
            '<div class="ps-hist-points">-'+x.point_price.toLocaleString('ko-KR')+' P</div>'+
            (x.external_coupon_code?'<div class="ps-hist-code">🎫 '+escapeLT(x.external_coupon_code)+'</div>':'')+
          '</div>'+
        '</div>';
      }).join('');
      pane.innerHTML = items;
    } catch(e) {
      pane.innerHTML = '<div class="ps-empty">'+(L?'로드 실패':'Load failed')+'</div>';
    }
  };
  window.psStartRedeem = function(catalogId, name, brand, price){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var u = getCurrentUser(); if (!u) return;
    var phone = prompt(
      (L?'기프티콘을 받을 카카오톡 휴대폰 번호를 입력해주세요\n(' + name + ' / -' + price.toLocaleString('ko-KR') + ' P)':
       'Enter the phone number to receive the gift\n(' + name + ' / -' + price.toLocaleString('en') + ' P)'),
      ''
    );
    if (!phone) return;
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.length < 10) { alert(L?'올바른 휴대폰 번호를 입력해주세요.':'Invalid phone number.'); return; }
    var confirmMsg = L?
      '🎁 '+ (brand?brand+' · ':'') + name + '\n' +
      '받는 번호: ' + phone + '\n' +
      '차감 포인트: -' + price.toLocaleString('ko-KR') + ' P\n\n' +
      '정말 교환하시겠습니까?'
      :
      '🎁 '+ (brand?brand+' · ':'') + name + '\n' +
      'To: ' + phone + '\n' +
      'Cost: -' + price.toLocaleString('en') + ' P\n\n' +
      'Confirm redemption?';
    if (!confirm(confirmMsg)) return;
    psSubmitRedeem(catalogId, phone, u);
  };
  window.psSubmitRedeem = async function(catalogId, phone, u){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    try {
      var r = await fetch('/api/gifts/redeem', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          user_id: u.uid,
          student_name: u.name,
          catalog_id: catalogId,
          recipient_phone: phone,
          recipient_name: u.name,
          token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(),  // 🔐 소유자 인증
        })
      });
      var d = await r.json();
      if (!d.ok) {
        var emap = {
          insufficient_points: (L?'포인트가 부족합니다. (잔액 '+(d.balance||0)+' P / 필요 '+(d.need||0)+' P)':'Insufficient points'),
          out_of_stock: (L?'재고가 없습니다.':'Out of stock'),
          gift_not_found_or_disabled: (L?'상품을 찾을 수 없습니다.':'Gift unavailable'),
          invalid_phone: (L?'전화번호 형식이 잘못되었습니다.':'Invalid phone'),
        };
        alert('❌ ' + (emap[d.error] || d.error || (L?'알 수 없는 오류':'Unknown error')));
        return;
      }
      var L2 = (window.getLang?window.getLang():'ko')==='ko';
      alert('✅ '+(L2?'교환 신청 완료!\n':'Redemption submitted!\n') +
        (d.message || '') +
        '\n\n'+(L2?'잔액: ':'Balance: ') + (d.balance_after||0).toLocaleString('ko-KR') + ' P'
      );
      psRefreshBalance();
      psLoadCatalog();
    } catch(e) {
      alert('❌ ' + e.message);
    }
  };

  // escapeLT 가 없으면 간단 정의
  if (typeof window.escapeLT !== 'function') {
    window.escapeLT = function(s){ return String(s||'').replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    }); };
  }

  // 사용자 메뉴 토글
  window.toggleUserMenu = function(){
    var u = getCurrentUser(); if(!u) return;
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var menu = document.getElementById('user-menu');
    if(menu.classList.contains('show')){ menu.classList.remove('show'); return; }
    menu.innerHTML =
      '<div class="um-header">'+(L?'로그인됨':'Signed in')+'<br><b>'+u.name+'</b> <span style="color:#64748b;font-size:11px">('+u.uid+')</span></div>'+
      '<div class="um-item" onclick="openLessonChangeModal();document.getElementById(&quot;user-menu&quot;).classList.remove(&quot;show&quot;)">📅 '+(L?'내 수업 연기/변경':'My Classes')+'</div>'+
      '<div class="um-item" onclick="location.href=&quot;/parent.html&quot;">👤 '+(L?'마이페이지':'My Page')+'</div>'+
      '<div class="um-divider"></div>'+
      '<div class="um-item danger" onclick="logout()">🚪 '+(L?'로그아웃':'Logout')+'</div>';
    menu.classList.add('show');
  };

  // 메뉴 외부 클릭 시 닫기
  document.addEventListener('click', function(e){
    if(!e.target.closest('#user-menu') && !e.target.closest('#login-btn')){
      var menu = document.getElementById('user-menu');
      if(menu) menu.classList.remove('show');
    }
  });

  window.logout = function(){
    setUser(null);
    try { localStorage.removeItem('mangoi_admin_session'); } catch(e){}
    mangoiRevokeAdminCookie();   // 위 removeItem 의 «나머지 반» — 아래 함수 주석 참고
    document.getElementById('user-menu').classList.remove('show');
    showLcToast2('👋 '+(((window.getLang?window.getLang():'ko')==='ko')?'로그아웃되었습니다.':'Signed out.'));
  };

  // 🧑‍🏫 (2026-07-30 버그수정) 교사·지사·대리점 세션 칩용 메뉴 —
  //   이전엔 칩 클릭이 곧장 마이페이지로 이동해서 로그아웃할 방법이 없었다
  //   (mangoi_admin_session 을 지우는 코드가 어디에도 없어 한 번 로그인하면 영구히 남음).
  window.toggleAdminUserMenu = function(as, dest){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var menu = document.getElementById('user-menu');
    if(!menu) return;
    if(menu.classList.contains('show')){ menu.classList.remove('show'); return; }
    menu.innerHTML =
      '<div class="um-header">'+(L?'로그인됨':'Signed in')+'<br><b>'+escapeLT(as.name||'')+'</b></div>'+
      '<div class="um-item" onclick="location.href=&quot;'+dest+'&quot;">👤 '+(L?'내 페이지로 이동':'Go to my page')+'</div>'+
      '<div class="um-divider"></div>'+
      '<div class="um-item danger" onclick="logoutAdminSession()">🚪 '+(L?'로그아웃':'Logout')+'</div>';
    menu.classList.add('show');
  };

  // 🚪 관리자 세션 폐기(2026-08-21). 정본은 HttpOnly 쿠키라 JS 로 못 지운다 — 서버 POST 뿐.
  //   ⚠️ 첫 화면 예산 때문에 설명은 docs/작업기록/260821_로그아웃이_서버세션을_안끊던_네곳.md 에 둔다.
  function mangoiRevokeAdminCookie(){
    try { fetch('/api/admin/logout', { method:'POST', credentials:'include' }).catch(function(){}); } catch(e){}
  }

  window.logoutAdminSession = function(){
    try { localStorage.removeItem('mangoi_admin_session'); } catch(e){}
    mangoiRevokeAdminCookie();
    var menu = document.getElementById('user-menu');
    if(menu) menu.classList.remove('show');
    showLcToast2('👋 '+(((window.getLang?window.getLang():'ko')==='ko')?'로그아웃되었습니다.':'Signed out.'));
    updateLoginUI();
  };

  function showLcToast2(msg){
    var t = document.getElementById('lc-toast');
    if(!t) { alert(msg.replace(/<[^>]+>/g,'')); return; }
    t.innerHTML = msg;
    t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 2500);
  }

  // 로그인 모달
  window.openLoginModal = function(){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var ov = document.getElementById('login-overlay');
    var html = '<div class="login-modal" onclick="event.stopPropagation()">'+
      '<h2>🔑 '+(L?'학생/학부모 로그인':'Login')+'</h2>'+
      '<div class="lm-sub">'+(L?'학생 ID + 비밀번호 또는 소셜 계정으로 빠르게 로그인하세요.':'Login with student ID or social account.')+'</div>'+
      '<div class="lm-body">'+
        // ━━━━ 😊 패스키(얼굴/지문) 로그인 — 지원 브라우저에서만 노출 ━━━━
        (window.PublicKeyCredential ?
          '<button type="button" onclick="doPasskeyLogin()" style="width:100%;padding:14px 18px;margin-bottom:14px;background:linear-gradient(135deg,#34d399,#10b981);color:#052e1b;border:0;border-radius:12px;font-weight:800;font-size:14.5px;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,.35)">😊👆 '+(L?'얼굴/지문으로 바로 로그인':'Sign in with Face / Fingerprint')+'</button>'+
          '<div style="text-align:center;color:#94a3b8;font-size:11.5px;margin:0 0 10px;position:relative">'+
            '<span style="background:#131826;padding:0 12px;position:relative;z-index:1">'+(L?'또는 아이디로':'Or with ID')+'</span>'+
            '<span style="position:absolute;left:0;right:0;top:50%;height:1px;background:#232b40;z-index:0"></span>'+
          '</div>'
        : '')+
        // ━━━━ 학생 ID / 비밀번호 로그인 ━━━━
        '<div class="lm-label">'+(L?'👤 학생 ID / 비밀번호':'Student ID / Password')+'</div>'+
        '<div style="display:grid;gap:8px;margin-bottom:14px">'+
          '<input id="lm-uid" type="text" placeholder="'+(L?'예: hong_gd':'e.g. hong_gd')+'" style="width:100%;padding:11px 13px;background:#131826;color:#fff;border:1px solid #232b40;border-radius:9px;font-size:13px" />'+
          '<div style="position:relative">'+
            '<input id="lm-pw" type="password" placeholder="'+(L?'비밀번호 (없으면 비워두기)':'Password (optional)')+'" style="width:100%;padding:11px 40px 11px 13px;background:#131826;color:#fff;border:1px solid #232b40;border-radius:9px;font-size:13px;box-sizing:border-box" />'+
            '<button type="button" aria-label="비밀번호 보기" onclick="var p=document.getElementById(&quot;lm-pw&quot;);p.type=(p.type===&quot;password&quot;?&quot;text&quot;:&quot;password&quot;);this.textContent=(p.type===&quot;password&quot;?&quot;👁&quot;:&quot;🙈&quot;);" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:19px;padding:6px;line-height:1;min-width:40px;min-height:40px;opacity:.85;color:#e6ecff">👁</button>'+
          '</div>'+
          '<button onclick="doStudentLogin()" style="padding:11px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;border:0;border-radius:9px;font-weight:800;font-size:13px;cursor:pointer">🔑 '+(L?'로그인':'Sign In')+'</button>'+
          '<div id="lm-err" style="display:none;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;font-size:11.5px"></div>'+
          // 🔑 (2026-07-22) 비밀번호 재설정 — 학부모 컴플레인 #7: 분실 시 학원 문의뿐이던 문제
          '<button type="button" onclick="lmPwReset()" style="background:none;border:0;color:#94a3b8;font-size:11.5px;cursor:pointer;text-decoration:underline;padding:2px">'+(L?'비밀번호를 잊으셨나요? (문자 인증)':'Forgot password? (SMS verify)')+'</button>'+
        '</div>'+
        // ━━━━ OAuth 소셜 로그인 ━━━━
        '<div style="text-align:center;color:#94a3b8;font-size:11.5px;margin:10px 0;position:relative">'+
          '<span style="background:#131826;padding:0 12px;position:relative;z-index:1">'+(L?'또는 소셜 계정으로':'Or social login')+'</span>'+
          '<span style="position:absolute;left:0;right:0;top:50%;height:1px;background:#232b40;z-index:0"></span>'+
        '</div>'+
        '<div style="display:grid;gap:10px;margin-bottom:14px">'+
          // 카카오톡으로 로그인 (전체너비 큰 버튼)
          '<button type="button" onclick="lmOauth(\'kakao\')" style="position:relative;width:100%;padding:14px 18px;background:#fee500;color:#191919;border:0;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.18)">'+
            '<span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);display:flex;align-items:center"><svg width="20" height="19" viewBox="0 0 24 22" fill="#191919" aria-hidden="true"><path d="M12 1C5.92 1 1 4.86 1 9.62c0 3.06 2.04 5.74 5.1 7.26-.22.79-.82 2.96-.94 3.42-.14.57.21.56.44.41.18-.12 2.86-1.95 4.02-2.74.77.11 1.56.17 2.38.17 6.08 0 11-3.86 11-8.62S18.08 1 12 1z"/></svg></span>'+
            (L?'카카오톡으로 로그인':'Sign in with Kakao')+
          '</button>'+
          // 네이버 아이디로 로그인
          '<button type="button" onclick="lmOauth(\'naver\')" style="position:relative;width:100%;padding:14px 18px;background:#03c75a;color:#fff;border:0;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.18)">'+
            '<span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);font-weight:900;font-size:17px;line-height:1">N</span>'+
            (L?'네이버 아이디로 로그인':'Sign in with Naver')+
          '</button>'+
          // 구글 아이디로 로그인
          '<button type="button" onclick="lmOauth(\'google\')" style="position:relative;width:100%;padding:14px 18px;background:#fff;color:#3c4043;border:1px solid #dadce0;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.12)">'+
            '<span style="position:absolute;left:18px;top:50%;transform:translateY(-50%);display:flex;align-items:center"><svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>'+
            (L?'구글 아이디로 로그인':'Sign in with Google')+
          '</button>'+
        '</div>'+
      '</div>'+
      '<div class="lm-actions" style="display:flex;gap:8px">'+
        '<button class="lm-btn" onclick="closeLoginModal();(history.length>1?history.back():null)" style="background:rgba(99,102,241,0.18);border:1px solid rgba(99,102,241,0.45);color:#c7d2fe">← '+(L?'뒤로':'Back')+'</button>'+
        '<button class="lm-btn" onclick="closeLoginModal()">'+(L?'취소':'Cancel')+'</button>'+
      '</div>'+
    '</div>';
    ov.innerHTML = html;
    ov.classList.add('show');

  };
  window.closeLoginModal = function(){
    document.getElementById('login-overlay').classList.remove('show');
    document.body.style.overflow='';
  };
  window.doLogin = function(uid){
    var s = demoStudents[uid]; if(!s) return;
    setUser({ uid:s.uid, name:s.name });
    // 🔐 데모 빠른 로그인도 서버 서명 토큰(mango_token) 확보 — 녹화 다시보기 등
    //    본인인증 API가 "로그인이 필요해요"를 다시 띄우지 않게 한다 (비번 미설정 계정만 성공)
    try {
      fetch('/api/student/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: s.uid }) })
        .then(function(r){ return r.json(); })
        .then(function(d){ if (d && d.ok && d.token) { try { localStorage.setItem('mango_token', d.token); } catch(e){} lmSyncParentToken(d.token); } })
        .catch(function(){});
    } catch(e){}
    closeLoginModal();
    showLcToast2('✅ '+(((window.getLang?window.getLang():'ko')==='ko')?(s.name+'님으로 로그인되었습니다.'):'Signed in as '+s.name+'.'));
  };

  // 🔑 (2026-07-22) 비밀번호 재설정 — 등록 전화번호 SMS 인증 (컴플레인 #7)
  //   uidOverride: 로그인 모달 밖(예: 평가표 로그인 게이트)에서도 부를 수 있게 아이디를 직접 받는다.
  //   (2026-07-27) 평가표 화면에는 '카톡 문의'만 있고 이 흐름으로 오는 길이 없었다 — 직원 피드백 #10.
  window.lmPwReset = async function(uidOverride) {
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var uid = String(uidOverride || ((document.getElementById('lm-uid')||{}).value) || '').trim();
    if (!uid) { uid = (prompt(L?'아이디를 입력해 주세요':'Enter your ID') || '').trim(); }
    if (!uid) return;
    try {
      var r = await fetch('/api/student/password-reset/request', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: uid })
      });
      var d = await r.json();
      if (!d.ok) { alert('❌ ' + (d.message || d.error || (L?'요청 실패':'Request failed'))); return; }
      var code = (prompt('📱 ' + (d.message || (L?'문자로 받은 인증번호 6자리를 입력해 주세요':'Enter the 6-digit code'))) || '').trim();
      if (!code) return;
      // 🔢 (2026-08-24) 4자 — 서버(api-students.ts password-reset/confirm)가 4자를 받는데
      //   여기 안내만 6자로 남아 「4자로 줄였다는데 6자 이상 쓰래요」가 됐다(옛 LMS 기준이 4자).
      var npw = (prompt(L?'새 비밀번호를 입력해 주세요 (4자 이상)':'New password (4+ chars)') || '').trim();
      if (!npw) return;
      var r2 = await fetch('/api/student/password-reset/confirm', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, code: code, new_password: npw })
      });
      var d2 = await r2.json();
      alert((d2.ok ? '✅ ' : '❌ ') + (d2.message || d2.error || ''));
    } catch(e) { alert(L?'네트워크 오류가 발생했어요.':'Network error.'); }
  };

  // 🧑‍🏫 (2026-07-26) 교사/관리자/지사/대리점 로그인 폴백 — admin/login.html(ph239)과
  //   동일한 역할 판정 로직. 학생 홈페이지 로그인칸 하나로 모든 역할이 로그인해 자기
  //   마이페이지로 바로 이동(클릭수 최소화). 두 곳이 어긋나면 안 되니 한쪽만 고치지 말 것.
  async function tryAdminLoginFallback(uid, pw) {
    try {
      var r2 = await fetch('/api/admin/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: uid, password: pw, remember: true }),
        credentials:'include'
      });
      var data = await r2.json().catch(function(){ return {}; });
      if (data && data.need_2fa) {
        // 2단계 인증 계정은 이 간이 로그인칸에서 처리 불가 — 관리자 로그인 화면으로.
        location.href = '/admin/login.html';
        return true;
      }
      if (!(r2.ok && data && data.ok)) return false;
      // 🪪 (2026-08-09) 역할 판정을 서버 한 곳(auth-admin.ts resolveUiIdentity)으로 모았다.
      //   여기 있던 접두사 추측 8줄은 admin/login.html 의 복사본이었는데 **이미 갈라져 있었다** —
      //   그쪽엔 parent/student 분기가 있고 여기엔 없었다. 규칙을 한 번 고치려면 두 곳을
      //   다 고쳐야 했고, 한 곳을 잊으면 「어떤 사람은 되고 어떤 사람은 안 되는」 버그가 됐다.
      //   ⚠️ 접두사 규칙을 고칠 일이 생기면 auth-admin.ts 의 resolveUiIdentity() 만 고친다.
      var role = data.ui_role || 'hq_mgr';
      var branch_id = (data.branch_id != null) ? data.branch_id : null;
      var agency_id = (data.agency_id != null) ? data.agency_id : null;
      var branch = branch_id || '';
      var name = data.display_name || data.name || uid;
      var wantLang = (data.pref_lang === 'en' || data.pref_lang === 'ko') ? data.pref_lang : 'ko';
      try {
        localStorage.setItem('mangoi_lang', wantLang);
        localStorage.setItem('mangoi_lang_by', 'auto');
        localStorage.setItem('mangoi_lang_uid', uid);
        localStorage.setItem('mangoi_admin_session', JSON.stringify({
          uid: uid, name: name, role: role,
          // 🪪 (2026-08-03) 서버 판정 역할 원본을 세션에 함께 싣는다 — admin/login.html 과 동일.
          //   어휘가 화면과 달라(서버 teacher/hq/branch… vs 화면 hq_teacher/hq_mgr…) 역할 자체를
          //   대체하진 않는다. 자세한 배경은 admin/login.html 의 같은 지점 주석 참고.
          server_role: data.server_role || '', role_label: data.role_label || '',
          branch: branch, branch_id: branch_id, agency_id: agency_id,
          pref_lang: wantLang,
          nationality: (data.nationality ? String(data.nationality).toUpperCase() : ''),
          login_at: Date.now()
        }));
      } catch(e){}
      // 🧑‍🏫 (2026-07-27) 교사 판정을 아이디 접두사보다 먼저 본다. 옛 LMS 에서 넘어온 강사
      //   아이디는 형태가 제각각이라(예: capi… 로 시작하는 이름) 접두사 규칙에 걸리면
      //   엉뚱한 화면(캐피타운 정산)으로 가버린다. 서버가 준 is_teacher 가 항상 우선.
      // 🏠 첫 화면 정본은 서버(auth-admin.ts home_path). 없을 때만 아래 옛 규칙이 정한다.
      var dest = (j && j.home_path) || '/admin.html';
      /* ⚠️ 아래 옛 규칙은 **서버가 값을 안 줄 때만** 돌아야 한다. 묶지 않으면 바로 위에서
            받은 home_path 를 그대로 덮어써, 서버로 정본을 옮긴 의미가 사라진다. */
      if (!(j && j.home_path)) {
        // 🇵🇭 (2026-08-02) 강사는 초경량 강사 포털(/teacher)로.
        if (String(role).indexOf('teacher') >= 0) dest = '/teacher';
        // 🏫 (2026-08-08) 지사·대리점도 초경량 매니저 포털로.
        else if (role === 'branch' || role === 'agency') dest = '/manager';
        else if (uid === 'capitown' || uid.indexOf('capi') === 0) dest = '/admin/capitown-settlement.html';
      }
      closeLoginModal();
      var fbL = (window.getLang?window.getLang():'ko')==='ko';
      showLcToast2(fbL ? ('✅ ' + name + '님 환영합니다!') : ('✅ Welcome, ' + name + '!'));
      setTimeout(function(){ location.href = dest; }, 500);
      return true;
    } catch(e) { return false; }
  }

  // 🔑 학생 ID + 비밀번호 로그인 (실제 API)
  window.doStudentLogin = async function() {
    var uid = (document.getElementById('lm-uid')||{}).value;
    var pw = (document.getElementById('lm-pw')||{}).value;
    var err = document.getElementById('lm-err');
    if (!uid || !uid.trim()) { if (err){err.style.display='block';err.textContent='학생 ID를 입력하세요';} return; }
    var uidTrim = uid.trim(), pwTrim = (pw||'').trim();
    try {
      var r = await fetch('/api/student/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uidTrim, password: pwTrim })
      });
      var d = await r.json();
      if (!d.ok) {
        // 🧑‍🏫 학생 ID 자체가 없으면(user_not_found) 교사/관리자 계정일 수 있음 — 관리자
        //   로그인으로 폴백 시도. 학생인데 비번만 틀린 경우(invalid_password)는 시도 안 함
        //   (불필요한 관리자 로그인 부하·브루트포스 카운터 오염 방지).
        if (d.error === 'user_not_found') {
          var adminOk = await tryAdminLoginFallback(uidTrim, pwTrim);
          if (adminOk) return;
        }
        if (err) { err.style.display='block'; err.textContent='❌ ' + (d.message || d.error || '로그인 실패'); }
        return;
      }
      try {
        var _lu = {
          user_id: d.user.user_id,
          uid: d.user.user_id,
          name: d.user.user_name,
          user_name: d.user.user_name,
          role: d.user.role || 'student',
        };
        localStorage.setItem('mango_user', JSON.stringify(_lu));
        // 🔑 표시 로직이 우선 읽는 키도 함께 갱신 — 계정 전환 시 옛 이름(홍길동 등)이 남는 버그 수정
        localStorage.setItem('mangoi_logged_user', JSON.stringify(_lu));
        // 화상수업 입장 이름도 새 사용자로 갱신
        localStorage.setItem('mangoi_vc_uid', _lu.name || _lu.uid);
        // 🔐 uid 서명 토큰 — AI 친구 대화 등 uid 기반 개인 데이터 API 인증용
        if (d.token) localStorage.setItem('mango_token', d.token);
        lmSyncParentToken(d.token);   // 🔒 같은 기기의 마이 페이지 토큰이 이 로그인으로 죽지 않게(위 주석)
        // 😊 패스키 버튼이 아이디 없이도 이 계정을 찾도록 마지막 아이디 기억
        localStorage.setItem('mangoi_pk_last_uid', d.user.user_id);
      } catch(e){}
      closeLoginModal();
      var stL = (window.getLang?window.getLang():'ko')==='ko';
      showLcToast2(stL ? ('✅ ' + d.user.user_name + '님 환영합니다!') : ('✅ Welcome, ' + d.user.user_name + '!'));
      // 😊 패스키 미등록 기기면 "다음부터 얼굴/지문으로?" 1회 제안
      var canOfferPk = false;
      try {
        canOfferPk = !!window.PublicKeyCredential
          && !localStorage.getItem('mangoi_pk_reg_' + d.user.user_id)
          && !localStorage.getItem('mangoi_pk_offer_dismissed_' + d.user.user_id);
      } catch(e){}
      if (canOfferPk) { setTimeout(function(){ lmOfferPasskey(d); }, 900); }
      else setTimeout(() => location.reload(), 800);
    } catch(e) {
      if (err) { err.style.display='block'; err.textContent='❌ ' + e.message; }
    }
  };

  // ═══ 😊 패스키(WebAuthn) — 얼굴/지문 로그인 ═══
  //   생체정보는 기기 안에만 저장(웹 표준) — 서버엔 공개키만. b64url <-> ArrayBuffer 변환 필수.
  function pkB2b(s){ s=String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; var bin=atob(s),u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return u.buffer; }
  function pkB2s(buf){ var u=new Uint8Array(buf),s=''; for(var i=0;i<u.length;i++)s+=String.fromCharCode(u[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  // "A request is already pending" 방지 — 새 세리머니 시작 전 이전 요청을 반드시 중단
  function pkNewAbortSignal(){
    try { if (window.__pkAbort) window.__pkAbort.abort(); } catch(e){}
    window.__pkAbort = new AbortController();
    return window.__pkAbort.signal;
  }
  // 로그인 성공 공통 저장 — doStudentLogin 과 동일 키
  function pkStoreLogin(d){
    try {
      var _lu = { user_id:d.user.user_id, uid:d.user.user_id, name:d.user.user_name, user_name:d.user.user_name, role:d.user.role||'student' };
      localStorage.setItem('mango_user', JSON.stringify(_lu));
      localStorage.setItem('mangoi_logged_user', JSON.stringify(_lu));
      localStorage.setItem('mangoi_vc_uid', _lu.name || _lu.uid);
      if (d.token) localStorage.setItem('mango_token', d.token);
      lmSyncParentToken(d.token);   // 🔒 패스키 로그인도 같은 sid 갱신이라 똑같이 맞춘다
    } catch(e){}
  }

  window.doPasskeyLogin = async function(){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var err = document.getElementById('lm-err');
    var showErr = function(m){ if(err){ err.style.display='block'; err.style.color='#fca5a5'; err.textContent=m; } };
    // 진행 상태를 눈에 보이게 — "조용히 아무 일도 안 일어남" 방지 + 어디서 멈추는지 진단 가능
    var showStep = function(m){ if(err){ err.style.display='block'; err.style.color='#93c5fd'; err.textContent=m; } };
    if (window.__pkBusy) return;  // 더블클릭 가드
    window.__pkBusy = true;
    try {
      showStep(L?'⏳ 패스키 준비 중…':'⏳ Preparing…');
      var uid = (((document.getElementById('lm-uid')||{}).value)||'').trim();
      // 아이디를 안 쳤으면 이 기기에서 마지막으로 쓴 계정으로 자동 지정
      //   (등록된 패스키가 discoverable 이 아니면 allowCredentials 가 있어야만 브라우저가 찾음)
      if (!uid) { try { uid = localStorage.getItem('mangoi_pk_last_uid') || ''; } catch(e){} }
      // ① 챌린지 발급 — ID 있으면 그 계정 패스키만, 없으면 기기 저장(discoverable)
      var r = await fetch('/api/passkey/login/options', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ user_id: uid }) });
      var d = await r.json();
      if (!d.ok) {
        /* 🈶 (2026-08-18) 주소가 바뀌어 옛 도메인 패스키만 있는 경우.
           이건 «오류» 가 아니라 «다시 등록하시면 됩니다» 안내라 빨간 ❌ 대신 파란 안내로 띄우고,
           바로 다음 행동(비밀번호 로그인)으로 이어지게 비밀번호 칸에 커서를 옮긴다.
           ⚠️ 서버가 rp_id 로 걸러 주기 전에는 이 분기까지 오지도 못하고 세리머니가 그냥 실패해
              「인증이 취소됐거나 시간이 초과됐어요」만 떴다(진짜 이유를 알 수 없었다). */
        if (d.error === 'passkey_other_domain') {
          showStep('💡 ' + (L
            ? '주소가 바뀌면서 얼굴/지문 로그인이 해제됐어요. 아래에 비밀번호를 넣어 로그인하시면 다시 등록할 수 있어요.'
            : (d.message_en || 'Your passkey was registered on our old address. Sign in with your password to set it up again.')));
          try { var pw = document.getElementById('lm-pw'); if (pw) pw.focus(); } catch(e){}
          return;
        }
        // 그 계정에 패스키가 없거나 준비 실패 → 아이디 입력 유도(조용히 끝나지 않게)
        showErr('❌ ' + (d.message || d.error || (L?'패스키 준비 실패':'Passkey unavailable')) + (uid ? '' : (L?' 학생 ID를 입력한 뒤 눌러주세요.':' Enter your Student ID first.')));
        return;
      }
      var o = d.options;
      var pub = { challenge: pkB2b(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification };
      if (o.allowCredentials && o.allowCredentials.length) pub.allowCredentials = o.allowCredentials.map(function(c){ return { type:'public-key', id: pkB2b(c.id), transports: c.transports }; });
      // 지정할 후보도 없고(비discoverable) 아이디도 없으면 → 조용히 실패하므로 미리 안내
      else if (!uid) { showErr(L?'💡 학생 ID를 입력한 뒤 눌러주세요.':'💡 Enter your Student ID first.'); return; }
      // ② 기기 생체인증(얼굴/지문) 세리머니 — 이전 pending 요청은 자동 중단
      showStep(L?'⏳ 기기 인증창 대기 중… (지문/얼굴/PIN 창이 떠야 해요)':'⏳ Waiting for device prompt…');
      // 8초 지나도 창이 안 뜨는 사용자를 위한 안내 (완료/실패 시 자동 해제)
      var stuckTimer = setTimeout(function(){
        if (window.__pkBusy) showStep(L
          ? '⏳ 인증창이 안 보이면: ① 화면 뒤/작업표시줄에 창이 숨었는지 확인 ② 휴대폰 QR로 등록하셨다면 휴대폰 크롬에서 시도 ③ 60초 후 자동 취소되니 다시 눌러도 됩니다'
          : '⏳ No prompt? Check hidden windows, or try on the phone you registered with.');
      }, 8000);
      var cred;
      try { cred = await navigator.credentials.get({ publicKey: pub, signal: pkNewAbortSignal() }); }
      finally { clearTimeout(stuckTimer); }
      if (!cred) { showErr(L?'❌ 인증이 취소됐어요.':'❌ Cancelled.'); return; }
      showStep(L?'⏳ 서명 확인 중…':'⏳ Verifying…');
      // ③ 서명 검증 → 로그인 토큰
      var payload = { credential: { id: cred.id, response: {
        clientDataJSON: pkB2s(cred.response.clientDataJSON),
        authenticatorData: pkB2s(cred.response.authenticatorData),
        signature: pkB2s(cred.response.signature),
        userHandle: cred.response.userHandle ? pkB2s(cred.response.userHandle) : null,
      } } };
      var r2 = await fetch('/api/passkey/login/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      var d2 = await r2.json();
      if (!d2.ok) { showErr('❌ ' + (d2.message || d2.error || (L?'로그인 실패':'Login failed'))); return; }
      pkStoreLogin(d2);
      try { localStorage.setItem('mangoi_pk_reg_' + d2.user.user_id, '1'); localStorage.setItem('mangoi_pk_last_uid', d2.user.user_id); } catch(e){}
      closeLoginModal();
      showLcToast2('✅ ' + d2.user.user_name + (L?'님 환영합니다!':' welcome!'));
      setTimeout(function(){ location.reload(); }, 800);
    } catch(e) {
      if (e && e.name === 'AbortError') { /* 새 시도가 이전 요청을 중단한 것 — 조용히 무시 */ }
      else if (e && e.name === 'NotAllowedError') showErr(L?'❌ 인증이 취소됐거나 시간이 초과됐어요. 다시 시도해주세요. (NotAllowed)':'❌ Cancelled or timed out. (NotAllowed)');
      else if (e && e.name === 'NotSupportedError') showErr(L?'❌ 이 브라우저는 패스키를 지원하지 않아요. 크롬/엣지 최신 버전을 사용해주세요.':'❌ Passkeys not supported in this browser.');
      // ⚠️ 2026-08-18 — 여기 적힌 주소가 옛 주소(test.mangoi.co.kr)로 남아 있었다.
      //    도메인을 옮기면 이런 «문구 속 주소» 가 조용히 거짓말이 된다. 정본은 mangoi.ai.
      else if (e && e.name === 'SecurityError') showErr(L
        ? '❌ 보안 오류(SecurityError) — 주소창이 mangoi.ai 인지 확인해주세요.'
        : '❌ SecurityError — please check the address is mangoi.ai.');
      else showErr('❌ [' + ((e && e.name) || 'Error') + '] ' + ((e && e.message) || e));
    } finally { window.__pkBusy = false; }
  };

  // 패스키 등록 (로그인 직후 token 필요) — parent.html 등에서도 재사용 가능하게 전역 노출
  window.mangoRegisterPasskey = async function(uid, token){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var r = await fetch('/api/passkey/register/options', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:'{}' });
    var d = await r.json();
    if (!d.ok) throw new Error(d.message || d.error || 'options_failed');
    var o = d.options;
    var pub = {
      challenge: pkB2b(o.challenge), rp: o.rp,
      user: { id: pkB2b(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: o.pubKeyCredParams, timeout: o.timeout, attestation: o.attestation,
      authenticatorSelection: o.authenticatorSelection,
    };
    if (o.excludeCredentials && o.excludeCredentials.length) pub.excludeCredentials = o.excludeCredentials.map(function(c){ return { type:'public-key', id: pkB2b(c.id), transports: c.transports }; });
    var cred = await navigator.credentials.create({ publicKey: pub, signal: pkNewAbortSignal() });
    if (!cred) throw new Error(L?'등록이 취소됐어요':'Cancelled');
    var transports = null;
    try { transports = cred.response.getTransports ? cred.response.getTransports() : null; } catch(e){}
    var payload = {
      credential: { id: cred.id, rawId: pkB2s(cred.rawId), transports: transports, response: {
        clientDataJSON: pkB2s(cred.response.clientDataJSON),
        attestationObject: pkB2s(cred.response.attestationObject),
      } },
      device_label: (navigator.platform || 'device').slice(0, 40),
    };
    var r2 = await fetch('/api/passkey/register/verify', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify(payload) });
    var d2 = await r2.json();
    if (!d2.ok) throw new Error(d2.message || d2.error || 'verify_failed');
    try { localStorage.setItem('mangoi_pk_reg_' + uid, '1'); localStorage.setItem('mangoi_pk_last_uid', uid); } catch(e){}
    return d2;
  };

  // 비밀번호 로그인 직후 "다음부터 얼굴/지문으로?" 제안 카드
  window.lmOfferPasskey = function(d){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var ov = document.getElementById('login-overlay');
    if (!ov) { location.reload(); return; }
    ov.innerHTML = '<div class="login-modal" onclick="event.stopPropagation()" style="text-align:center">'+
      '<div style="font-size:52px;line-height:1;margin:6px 0 10px">😊</div>'+
      '<h2 style="margin:0 0 8px">'+(L?'다음부터 얼굴/지문으로 로그인할까요?':'Sign in with Face/Fingerprint next time?')+'</h2>'+
      '<div class="lm-sub" style="margin-bottom:16px">'+(L?'비밀번호 없이 1초 만에 로그인!<br>얼굴·지문 정보는 기기 밖으로 나가지 않아요.':'One-tap login, no password!<br>Biometrics never leave your device.')+'</div>'+
      '<div id="lm-pk-offer-err" style="display:none;margin-bottom:12px;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;font-size:11.5px"></div>'+
      '<div style="display:grid;gap:10px">'+
        '<button onclick="lmDoOfferReg()" style="padding:14px;background:linear-gradient(135deg,#34d399,#10b981);color:#052e1b;border:0;border-radius:12px;font-weight:800;font-size:14.5px;cursor:pointer">😊 '+(L?'네, 등록할게요':'Yes, register')+'</button>'+
        '<button onclick="lmSkipOfferReg()" style="padding:11px;background:rgba(148,163,184,0.12);color:#94a3b8;border:1px solid #232b40;border-radius:10px;font-weight:700;font-size:12.5px;cursor:pointer">'+(L?'나중에 할게요':'Maybe later')+'</button>'+
      '</div></div>';
    ov.classList.add('show');
    window.lmDoOfferReg = async function(){
      var eBox = document.getElementById('lm-pk-offer-err');
      if (window.__pkBusy) return;  // 더블클릭 가드
      window.__pkBusy = true;
      var btn = document.querySelector('#login-overlay button[onclick*="lmDoOfferReg"]');
      var btnLabel = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.textContent = L?'⏳ 기기 인증 대기 중…':'⏳ Waiting for device…'; }
      try {
        await mangoRegisterPasskey(d.user.user_id, d.token);
        showLcToast2('✅ ' + (L?'패스키 등록 완료! 다음부터 얼굴/지문으로 로그인하세요.':'Passkey registered!'));
        setTimeout(function(){ location.reload(); }, 900);
      } catch(e) {
        if (e && e.name === 'AbortError') { /* 이전 요청 중단 — 무시하고 버튼 복구 */ }
        else if (e && (e.name === 'NotAllowedError' || e.name === 'InvalidStateError')) {
          // 취소 또는 이미 이 기기에 등록됨 → 조용히 넘어감
          if (e.name === 'InvalidStateError') { try { localStorage.setItem('mangoi_pk_reg_' + d.user.user_id, '1'); } catch(_){} }
          location.reload(); return;
        }
        else if (eBox) { eBox.style.display='block'; eBox.textContent='❌ ' + (e.message || e); }
      } finally {
        window.__pkBusy = false;
        if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.textContent = btnLabel; }
      }
    };
    window.lmSkipOfferReg = function(){
      try { localStorage.setItem('mangoi_pk_offer_dismissed_' + d.user.user_id, '1'); } catch(e){}
      location.reload();
    };
  };

  // 🌐 OAuth 로그인 (학생 모달)
  window.lmOauth = async function(provider) {
    try {
      var r = await fetch('/api/oauth/' + provider + '/url');
      var d = await r.json();
      if (!d.configured) {
        alert('⚠️ ' + provider.toUpperCase() + ' 로그인이 아직 설정되지 않았어요.\n\n' + (d.message || '') + '\n\n관리자에게 문의해주세요.');
        return;
      }
      location.href = d.auth_url;
    } catch(e) { alert('❌ ' + e.message); }
  };

  // 페이지 로드 시 UI 갱신
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', updateLoginUI);
  else setTimeout(updateLoginUI, 0);

  // 언어 토글 시에도 라벨 갱신
  document.addEventListener('mangoi:lang-change', updateLoginUI);
})();

// openLessonChangeModal 을 로그인 체크 + 본인 수업만 표시하도록 재정의
(function(){
  var origOpen = window.openLessonChangeModal;
  window.openLessonChangeModal = function(){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var u = (typeof getCurrentUser==='function') ? getCurrentUser() : null;
    if(!u){
      // 로그인 필요 안내
      var ov = document.getElementById('lc-overlay');
      ov.innerHTML = '<div class="lc-modal" onclick="event.stopPropagation()">'+
        '<div class="lc-head"><h2>🔑 '+(L?'로그인이 필요합니다':'Login Required')+'</h2><button class="lc-close" onclick="closeLessonChangeModal()">✕</button></div>'+
        '<div class="lc-body" style="display:flex;align-items:center;justify-content:center">'+
          '<div style="max-width:440px;width:100%;background:#131826;border:2px solid #ef4444;border-radius:18px;padding:32px 24px;text-align:center">'+
            '<div style="font-size:64px;line-height:1;margin-bottom:14px">👤</div>'+
            '<p style="color:#cbd5e1;font-size:14.5px;line-height:1.6;margin:0 0 22px">'+(L?'내 수업을 확인하려면<br>먼저 로그인해주세요.':'Please sign in first<br>to view your classes.')+'</p>'+
            '<button onclick="closeLessonChangeModal();setTimeout(openLoginModal,150)" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;font-size:15px;font-weight:800;padding:14px 32px;border-radius:12px;border:none;cursor:pointer;box-shadow:0 6px 16px rgba(245,158,11,.4)">🔑 '+(L?'로그인 하기':'Sign In')+'</button>'+
          '</div>'+
        '</div>'+
      '</div>';
      ov.classList.add('show');

      return;
    }
    // 로그인된 학생의 수업으로 demoClasses 교체 후 원래 모달 호출
    var s = window.__demoStudents[u.uid];
    if(s && Array.isArray(s.classes)){
      // 🥭 Phase 5: AI 등록 class_schedules 도 fetch 해서 머지 (실시간 반영)
      mergeAiSchedulesAndRender(u.uid, s);
    } else {
      origOpen.call(window);
    }
  };

  // 🥭 Phase 5: D1 class_schedules 를 fetch → student.classes 와 머지 → 모달 렌더
  async function mergeAiSchedulesAndRender(uid, student){
    var merged = Object.assign({}, student, { classes: (student.classes||[]).slice() });
    try {
      var r = await fetch('/api/admin/class-schedules?user_id=' + encodeURIComponent(uid), { credentials:'include' });
      var j = await r.json();
      if (j && j.ok && Array.isArray(j.items)) {
        var dowIdx = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
        var typeNames = { level_test:'레벨테스트', trial:'체험수업', regular:'정규수업' };
        var todayMid = new Date(); todayMid.setHours(0,0,0,0);
        for (var ai of j.items) {
          if (ai.status === 'cancelled') continue;
          var tm = String(ai.start_time||'').match(/^(\d{1,2}):(\d{2})$/);
          if (!tm) continue;
          var hh = parseInt(tm[1],10), mm = parseInt(tm[2],10);
          if (ai.schedule_kind === 'recurring' && ai.day_of_week) {
            // 향후 4주의 매주 occurrences 만들어 머지
            var dows = String(ai.day_of_week).split(',').map(function(d){return dowIdx[d];}).filter(function(x){return x!==undefined;});
            for (var w = 0; w < 4; w++) {
              for (var di of dows) {
                var d = new Date(todayMid);
                var add = ((di - d.getDay() + 7) % 7) + (w * 7);
                if (add === 0 && w === 0) continue; // 오늘은 이미 지났을 가능성 → 건너뜀
                d.setDate(d.getDate() + add);
                merged.classes.push({
                  id: 'ai_' + ai.id + '_w' + w + '_d' + di,
                  type: ai.class_type === 'trial' ? 'temp' : '1on1',
                  teacher: '🤖 AI: ' + (ai.teacher_name || (typeNames[ai.class_type]||'정규')),
                  lessonDate: d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'),
                  lessonHour: hh,
                  durationMin: 30,
                  __aiSchedule: true
                });
              }
            }
          } else if (ai.scheduled_date) {
            merged.classes.push({
              id: 'ai_' + ai.id,
              type: ai.class_type === 'trial' ? 'temp' : '1on1',
              teacher: '🤖 AI: ' + (ai.teacher_name || (typeNames[ai.class_type]||'정규')),
              lessonDate: ai.scheduled_date,
              lessonHour: hh,
              durationMin: 30,
              __aiSchedule: true
            });
          }
        }
        // 시간순 정렬
        merged.classes.sort(function(a,b){
          var da = (a.lessonDate||'') + (String(a.lessonHour||0).padStart(2,'0'));
          var db = (b.lessonDate||'') + (String(b.lessonHour||0).padStart(2,'0'));
          return da.localeCompare(db);
        });
      }
    } catch(e) { console.warn('[lc] AI schedules fetch failed:', e); }
    renderMyClassList(merged);
  }

  function renderMyClassList(student){
    var L = (window.getLang?window.getLang():'ko')==='ko';
    var ov = document.getElementById('lc-overlay');
    function pad(n){return String(n).padStart(2,'0');}
    function getClsDt(c){
      if(c.lessonDate && c.lessonHour!=null){
        var parts = c.lessonDate.split('-');
        var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
        d.setHours(c.lessonHour, 0, 0, 0);
        return d;
      }
      if(c.hourOffset!=null){ var now=new Date(); return new Date(now.getTime()+c.hourOffset*3600*1000); }
      var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+(c.dateOffset||0)); d.setHours(c.hour); return d;
    }
    function fmt(d){ var dn=L?['일','월','화','수','목','금','토']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' ('+dn[d.getDay()]+') '+pad(d.getHours())+':'+pad(d.getMinutes()); }
    function diffMin(d){ return (d-new Date())/60000; }

    var items = student.classes.map(function(c){
      var dt = getClsDt(c);
      var diff = diffMin(dt);
      var typeLbl = c.type==='1on1'?(L?'1대1':'1-on-1'):(c.type==='group'?(L?'그룹':'Group'):(L?'임시':'Temp'));
      var typeCls = c.type==='1on1'?'t1on1':(c.type==='group'?'group':'t1on1');
      var left;
      if(diff<0) left = L?'이미 시작/종료':'Past';
      else if(diff<60) left = Math.round(diff)+(L?'분 남음':'min');
      else if(diff<1440) left = Math.round(diff/60)+(L?'시간 남음':'h');
      else left = Math.round(diff/1440)+(L?'일 남음':'d');
      return '<div class="lc-item">'+
        '<div class="lc-item-head">'+
          '<div class="lc-item-title">'+(c.type==='1on1'?'🟣':(c.type==='group'?'💗':'🔵'))+' '+c.teacher+'</div>'+
          '<span class="lc-item-type '+typeCls+'">'+typeLbl+'</span>'+
        '</div>'+
        '<div class="lc-item-meta">'+
          '📅 <b>'+fmt(dt)+'</b><br>'+
          '⏰ '+left+' · '+c.durationMin+(L?'분':'min')+
        '</div>'+
        '<div class="lc-actions">'+
          '<button class="lc-btn postpone" onclick="tryMyAction(&quot;'+c.id+'&quot;,&quot;postpone&quot;)">📅 '+(L?'연기':'Postpone')+'</button>'+
          '<button class="lc-btn change" onclick="tryMyAction(&quot;'+c.id+'&quot;,&quot;change&quot;)">🔄 '+(L?'변경':'Change')+'</button>'+
          '<button class="lc-btn" onclick="tryMyAction(&quot;'+c.id+'&quot;,&quot;cancel&quot;)" style="background:rgba(239,68,68,.15);color:#fca5a5;border-color:rgba(239,68,68,.4)">🗑 '+(L?'취소':'Cancel')+'</button>'+
        '</div>'+
      '</div>';
    }).join('');

    var html = '<div class="lc-modal" onclick="event.stopPropagation()">'+
      '<div class="lc-head"><h2>📅 '+(L?student.name+' 님의 수업':student.name+'\'s Classes')+'</h2>'+
      '<button class="lc-close" onclick="closeLessonChangeModal()">✕</button></div>'+
      '<div class="lc-body">'+
        '<div class="lc-info">💡 <b>'+(L?'규정 안내':'Policy')+'</b><br>'+
          '· '+(L?'<b>연기·취소</b>: 시작 30분 전 <b style="color:#86efac">무료</b> · 30분 이내 <b style="color:#fbbf24">유료</b>':'<b>Postpone/Cancel</b>: <b style="color:#86efac">free</b> if 30+ min before · <b style="color:#fbbf24">charged</b> within 30 min')+'<br>'+
          '· '+(L?'<b>변경</b>: 시작 <b>24시간 전</b>까지만 가능':'<b>Change</b>: only up to <b>24 h</b> before')+
        '</div>'+
        '<div class="lc-list">'+(items||'<div class="lc-empty">'+(L?'예정된 수업이 없습니다.':'No upcoming classes.')+'</div>')+'</div>'+
      '</div></div>';
    ov.innerHTML = html;
    ov.classList.add('show');


    // 본인 수업 액션 처리
    window.tryMyAction = function(clsId, mode){
      var c = student.classes.find(function(x){return x.id===clsId;});
      if(!c) return;
      var L=(window.getLang?window.getLang():'ko')==='ko';
      var dt = getClsDt(c);
      var diff = diffMin(dt);   // 원 수업까지 남은 분

      // ── 변경(change): 시작 24시간 이내면 차단 (정책) ──
      if(mode==='change' && diff < 1440){
        var detailC = '📅 <b>'+fmt(dt)+'</b><br>⏰ '+(diff<0?(L?'이미 시작/종료':'Past'):(Math.round(diff)+(L?'분 남음':' min')))+'<br>'+(L?'급한 경우 학원에 직접 연락 부탁드립니다.':'Please contact the center directly.');
        var rejHtml = '<div class="lc-reject" onclick="event.stopPropagation()"><div class="lc-rej-ico">😔</div><h3>'+(L?'변경할 수 없습니다':'Cannot Change')+'</h3><p>'+(L?'수업 변경은 시작 <b>24시간 전</b>까지만 가능합니다.':'Changes are only allowed up to <b>24 hours</b> before class.')+'</p><div class="lc-rej-detail">'+detailC+'</div><button onclick="closeLessonChangeModal()">'+(L?'확인':'OK')+'</button></div>';
        document.getElementById('lc-overlay').innerHTML = rejHtml;
        return;
      }

      // ── 연기·취소: 30분 이내면 '유료' 안내 후 진행 (차단하지 않음 — 정책: 30분 이내=유료) ──
      var isPaid = (mode!=='change') && (diff <= 30);
      function proceed(){
        if(mode==='cancel'){ doCancel(c, dt, isPaid); return; }
        if(typeof openLessonPickerModal==='function'){
          if(!c.students) c.students = [{name:student.name, uid:student.uid}];
          openLessonPickerModal(c, mode);   // 연기/변경 → 기존 위저드 (확정 시 서버 저장+태깅)
        }
      }
      if(isPaid){
        var feeMsg = (mode==='cancel')
          ? (L?'수업 시작 <b>30분 이내 취소</b>는 <b style="color:#fbbf24">유료</b>로 처리됩니다.':'Cancelling within <b>30 min</b> of start is <b style="color:#fbbf24">charged</b>.')
          : (L?'수업 시작 <b>30분 이내 연기</b>는 <b style="color:#fbbf24">유료</b>로 처리됩니다.':'Postponing within <b>30 min</b> of start is <b style="color:#fbbf24">charged</b>.');
        var detailP = '📅 <b>'+fmt(dt)+'</b><br>⏰ '+(diff<0?(L?'이미 시작/종료':'Past'):(Math.round(diff)+(L?'분 남음':' min')));
        var confHtml = '<div class="lc-reject" onclick="event.stopPropagation()" style="border-color:#fbbf24"><div class="lc-rej-ico">💰</div><h3 style="color:#fbbf24">'+(L?'유료 처리 안내':'Paid Notice')+'</h3><p>'+feeMsg+'<br>'+(L?'계속하시겠습니까?':'Continue?')+'</p><div class="lc-rej-detail">'+detailP+'</div><div style="display:flex;gap:8px"><button onclick="closeLessonChangeModal()" style="flex:1;background:#374151;color:#fff">'+(L?'아니요':'No')+'</button><button id="lc-paid-ok" style="flex:1">'+(L?'예, 계속':'Yes, continue')+'</button></div></div>';
        document.getElementById('lc-overlay').innerHTML = confHtml;
        var okb = document.getElementById('lc-paid-ok'); if(okb) okb.onclick = function(){ proceed(); };
        return;
      }
      proceed();
    };

    // 🆕 취소 실행 — 서버에 기록(유료/무료 태깅 + 관리자 알림) + 로컬 목록에서 제거
    function doCancel(c, dt, isPaid){
      var L=(window.getLang?window.getLang():'ko')==='ko';
      try {
        if(typeof window.lcPersistRequest==='function'){
          window.lcPersistRequest(c, 'cancel', { origStartMs: dt.getTime(), origTeacher: c.teacher });
        }
      } catch(e){}
      try { var idx = student.classes.indexOf(c); if(idx>=0) student.classes.splice(idx,1); } catch(e){}
      var t = document.getElementById('lc-toast');
      if(t){
        t.innerHTML = '✅ '+(L?'수업이 취소되었습니다':'Class cancelled')+' · '+(isPaid?(L?'💰유료':'💰paid'):(L?'🆓무료':'🆓free'))+'<br><span style="font-size:11px;color:#94a3b8">'+(L?'담당자가 확인 후 연락드립니다':'Staff will confirm shortly')+'</span>';
        t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); }, 3500);
      }
      try { renderMyClassList(student); } catch(e){ closeLessonChangeModal(); }
    }
  }
})();

