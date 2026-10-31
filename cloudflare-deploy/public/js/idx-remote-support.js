// idx-remote-support.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  var L = function(){ return (window.getLang ? window.getLang() : 'ko') === 'ko'; };

  // 🆕 원격지원 안내 음성 (중간 볼륨 자동재생 + 우상단 🔇 토글)
  var rsAudio = null;
  function playRsGreeting(){
    try {
      if (!rsAudio) {
        rsAudio = new Audio('/audio/원격조정.wav');
        rsAudio.preload = 'auto';
        rsAudio.addEventListener('ended', updateRsAudioBtn);
        rsAudio.addEventListener('pause', updateRsAudioBtn);
        rsAudio.addEventListener('play', updateRsAudioBtn);
      }
      rsAudio.volume = 0.5;
      rsAudio.currentTime = 0;
      var p = rsAudio.play();
      if (p && p.catch) p.catch(function(e){ console.warn('[rs] 음성 차단:', e); updateRsAudioBtn(); });
      updateRsAudioBtn();
    } catch(e) { console.warn('[rs] audio err:', e); }
  }
  function stopRsGreeting(){
    if (rsAudio) { try { rsAudio.pause(); rsAudio.currentTime = 0; } catch(e){} }
    updateRsAudioBtn();
  }
  function updateRsAudioBtn(){
    var btn = document.getElementById('rs-audio-btn');
    if (!btn) return;
    var playing = rsAudio && !rsAudio.paused && !rsAudio.ended;
    btn.innerHTML = playing ? '🔇' : '🔊';
    btn.style.borderColor = playing ? 'rgba(251,191,36,.7)' : 'rgba(251,191,36,.45)';
  }
  window.rsToggleAudio = function(){
    if (rsAudio && !rsAudio.paused) stopRsGreeting();
    else playRsGreeting();
  };

  window.openRemoteSupportModal = function(){
    var ov = document.getElementById('rs-overlay');
    if (ov && ov.style.display === 'block') { closeRemoteSupportModal(); return; }
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'rs-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(5,7,18,.86);backdrop-filter:blur(14px);display:none;z-index:2147483001;padding:24px 16px;overflow-y:auto;animation:lcFade .2s';
      ov.addEventListener('click', function(e){ if (e.target===ov && (window.mgBackdropClosable ? window.mgBackdropClosable(ov) : true)) closeRemoteSupportModal(); });   /* QA#4 */
      document.body.appendChild(ov);
    }
    var isKo = L();
    var options = [
      {
        rank: '🥇 '+(isKo?'가장 추천':'TOP PICK'),
        title: 'Microsoft Quick Assist',
        sub: isKo ? 'Windows 내장 · 설치 불필요' : 'Built into Windows · No install',
        icon: '🖥️',
        accent: '#10b981',
        secure: 5, easy: 5,
        steps: isKo
          ? ['<b>Win 키</b> 누르고 "<b>빠른 지원</b>" 또는 "<b>Quick Assist</b>" 검색','강사가 알려준 <b>6자리 코드</b> 입력','연결 → 도움 완료 후 자동 종료']
          : ['Press <b>Win key</b>, search "<b>Quick Assist</b>"','Enter the <b>6-digit code</b> from your teacher','Connect → auto-close when done'],
        note: isKo ? '✓ Windows 10/11 기본 내장 · ✓ MS 보안 인프라 · ✓ 세션 종료 시 권한 즉시 회수' : '✓ Built-in Win 10/11 · ✓ MS infra · ✓ Auto-revoke on close',
        action: function(){ window.open('ms-quick-assist:', '_self'); setTimeout(function(){ alert(isKo?'Quick Assist가 안 열리면 Win 키 → "빠른 지원" 검색해 주세요.':'If not opened, press Win → search "Quick Assist".'); }, 800); },
        actionLabel: isKo?'⚡ Quick Assist 열기':'⚡ Open Quick Assist'
      },
      {
        rank: '🥈 '+(isKo?'무료 · 브라우저':'Free · Browser'),
        title: 'Chrome Remote Desktop',
        sub: isKo ? 'Chrome 브라우저만 있으면 OK' : 'Just need Chrome browser',
        icon: '🌐',
        accent: '#60a5fa',
        secure: 5, easy: 4,
        steps: isKo
          ? ['Chrome 브라우저에서 페이지 열기 (자동으로 새 탭)','Google 계정 로그인 → "원격 지원" 탭','강사가 보낸 <b>액세스 코드</b> 입력']
          : ['Open the page in Chrome (auto new tab)','Sign in with Google → "Remote Support" tab','Enter the <b>access code</b> from teacher'],
        note: isKo ? '✓ Google 보안 인프라 · ✓ 설치 0 · ✓ 모바일 지원' : '✓ Google infra · ✓ Zero install · ✓ Mobile OK',
        action: function(){ window.open('https://remotedesktop.google.com/support', '_blank'); },
        actionLabel: isKo?'🌐 Chrome Remote 열기':'🌐 Open Chrome Remote'
      },
      {
        rank: '🥉 '+(isKo?'고급 사용자':'For Advanced'),
        title: 'AnyDesk',
        sub: isKo ? '한 번 설치 후 빠른 P2P 연결' : 'Install once, fast P2P',
        icon: '⚡',
        accent: '#f59e0b',
        secure: 3, easy: 3,
        steps: isKo
          ? ['8MB 무료 다운로드 (새 탭에서 열림)','설치 → <b>9자리 ID</b>가 화면에 표시됨','ID를 카카오톡 상담으로 전송 → 강사 연결']
          : ['Download 8MB free (new tab)','Install → <b>9-digit ID</b> appears','Send ID via KakaoTalk → teacher connects'],
        note: isKo ? '⚠ 2024년 보안사고 이력 · 빠른 속도가 장점 · 한국 학원 표준' : '⚠ 2024 security incident · Fast · Common in Korean schools',
        action: function(){ window.open('https://anydesk.com/ko/downloads', '_blank'); },
        actionLabel: isKo?'⬇ AnyDesk 다운로드':'⬇ Download AnyDesk'
      }
    ];
    var cards = options.map(function(o, i){
      var dots = function(n){ return '<span style="color:#fde68a">'+'★'.repeat(n)+'</span><span style="color:#475569">'+'★'.repeat(5-n)+'</span>'; };
      var stepsHtml = '<ol style="margin:10px 0 0;padding-left:20px;font-size:12.5px;color:#cbd5e1;line-height:1.7">'+o.steps.map(function(s){return '<li>'+s+'</li>';}).join('')+'</ol>';
      return '<div style="background:linear-gradient(180deg,#1a2032,#131826);border:1px solid '+o.accent+';border-left:5px solid '+o.accent+';border-radius:14px;padding:14px 16px;margin-bottom:12px">'+
        // 1) 상단 rank 알약 (한 줄 강제, 카드 폭 안에서 자연스럽게)
        '<div style="display:inline-block;font-size:11px;color:'+o.accent+';font-weight:800;text-transform:uppercase;letter-spacing:.5px;background:rgba(255,255,255,.05);padding:4px 10px;border-radius:99px;margin-bottom:10px;white-space:nowrap">'+o.rank+'</div>'+
        // 2) 헤더: 아이콘 + 제목 + 부제 (전폭 사용)
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">'+
          '<div style="font-size:28px;width:48px;height:48px;background:rgba(255,255,255,.06);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+o.icon+'</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:17px;font-weight:800;color:#fff;line-height:1.25;word-break:keep-all;letter-spacing:-.3px">'+o.title+'</div>'+
            '<div style="font-size:12px;color:#94a3b8;margin-top:3px;word-break:keep-all;line-height:1.4">'+o.sub+'</div>'+
          '</div>'+
        '</div>'+
        // 3) 보안 / 편의 등급 한 줄
        '<div style="font-size:11px;color:#94a3b8;display:flex;gap:16px;padding:8px 10px;background:rgba(0,0,0,.2);border-radius:8px;white-space:nowrap;flex-wrap:wrap">'+
          '<span>'+(isKo?'보안':'Security')+' '+dots(o.secure)+'</span>'+
          '<span>'+(isKo?'편의':'Ease')+' '+dots(o.easy)+'</span>'+
        '</div>'+
        stepsHtml +
        '<div style="font-size:11px;color:#94a3b8;margin-top:10px;padding:8px 10px;background:rgba(0,0,0,.25);border-radius:8px;line-height:1.6">'+o.note+'</div>'+
        '<button onclick="rsRun('+i+')" style="margin-top:12px;width:100%;padding:11px;background:linear-gradient(135deg,'+o.accent+',rgba(0,0,0,.2));color:#fff;border:0;border-radius:10px;font-size:13.5px;font-weight:800;cursor:pointer;letter-spacing:-.2px">'+o.actionLabel+'</button>'+
      '</div>';
    }).join('');
    window._rsOptions = options;
    ov.innerHTML = '<div style="max-width:640px;margin:0 auto;background:linear-gradient(180deg,#1a2032,#131826);border:1px solid rgba(251,191,36,.32);border-radius:22px;box-shadow:0 30px 80px -10px rgba(0,0,0,.7);overflow:hidden;color:#e2e8f0;font-family:MangoiHanSC,\'Noto Sans KR\',Malgun Gothic,맑은 고딕,sans-serif">'+
      '<div style="padding:18px 22px;background:linear-gradient(135deg,rgba(251,191,36,.18),rgba(245,158,11,.08));border-bottom:1px solid rgba(251,191,36,.3);display:flex;align-items:center;gap:8px">'+
        '<span style="font-size:24px">💻</span>'+
        '<h2 style="margin:0;flex:1;font-size:18px;font-weight:800;color:#fff">'+(isKo?'PC 원격지원 — 안전한 방법 선택':'Remote Support — Pick safest option')+'</h2>'+
        '<button id="rs-audio-btn" type="button" title="안내 음성 끄기/켜기" onclick="rsToggleAudio()" style="background:rgba(20,28,48,.65);border:1px solid rgba(251,191,36,.45);color:#fde68a;width:32px;height:32px;border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);padding:0;line-height:1">🔊</button>'+
        '<button onclick="closeRemoteSupportModal()" style="background:rgba(255,255,255,.08);border:0;color:#cbd5e1;width:32px;height:32px;border-radius:50%;font-size:14px;cursor:pointer">✕</button>'+
      '</div>'+
      '<div style="padding:16px 18px;max-height:75vh;overflow-y:auto">'+
        rsNavBar(isKo)+
        '<div style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.25);border-left:4px solid #60a5fa;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#bfdbfe;line-height:1.6">'+
          (isKo?'💡 <b>Windows 사용자는 Quick Assist 가장 권장</b> — 설치도 필요 없고 가장 안전합니다. AnyDesk는 한 번 써본 학생만 추천.':'💡 <b>Windows users: Quick Assist recommended</b> — no install needed, safest.')+
        '</div>'+
        /* 🔑 (2026-08-30 v4 제안서 07) 원격 지원 허용 PIN.
           관리자·강사가 만든 6자리 번호를 여기에 넣으면 «학생이 허락했다» 가 서버에 남는다.
           ⛔ 이 번호가 화면을 여는 열쇠가 아니다 — 실제 화면 제어는 아래 도구들이 한다.
              번호의 목적은 «누가 언제 허락했는가» 를 남기는 것이다.
           ⚠️ 필수가 아니다. 번호가 없어도 아래 도구는 그대로 쓸 수 있다 — 컴퓨터가 고장 나서
              부르는 자리라, 번호 하나로 도움을 막으면 안 된다. */
        '<div id="rs-pin-box" style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.28);border-radius:10px;padding:11px 14px;margin-bottom:12px">'+
          '<div style="font-size:12px;color:#fde68a;font-weight:700;margin-bottom:6px">'+
            (isKo?'🔑 선생님이 알려 준 6자리 번호가 있나요? (선택)':'🔑 Have a 6-digit code from your teacher? (optional)')+'</div>'+
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+
            '<input id="rs-pin-input" type="text" inputmode="numeric" maxlength="7" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" '+
              'placeholder="000000" style="width:132px;padding:7px 10px;border-radius:8px;border:1px solid rgba(251,191,36,.4);background:#0f1626;color:#fde68a;font-size:17px;letter-spacing:4px;text-align:center;font-family:MangoiHanSC,Consolas,monospace">'+
            '<button type="button" onclick="rsClaimPin()" style="padding:8px 14px;border-radius:8px;border:0;background:linear-gradient(135deg,#f59e0b,#d97706);color:#1a1206;font-weight:800;font-size:12.5px;cursor:pointer">'+
              (isKo?'확인':'Verify')+'</button>'+
            '<span id="rs-pin-msg" style="font-size:11.5px;color:#94a3b8"></span>'+
          '</div>'+
        '</div>'+
        /* 📥 선생님이 보낸 접속 코드가 들어올 자리 — 올 때까지는 비어 있다(빈 상자를 그리지 않는다) */
        '<div id="rs-code-box" style="display:none;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.45);border-radius:10px;padding:13px 14px;margin-bottom:12px"></div>'+
        /* ⬅️ 휴대폰용 — AnyDesk 같은 모바일 도구는 «내 기기가 번호를 갖고 직원이 접속» 하는
           반대 방향이다. 그 번호를 카톡으로 불러 주지 않아도 되게 여기서 보낸다.
           PIN 을 확인해야 열린다(보낼 곳이 있어야 하므로). */
        '<div id="rs-mycode-box" style="display:none;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.32);border-radius:10px;padding:11px 14px;margin-bottom:12px"></div>'+
        cards +
        '<div style="margin-top:14px;text-align:center;font-size:11.5px;color:#94a3b8">'+
          (isKo?'어떤 방법이든 연결 후엔 카카오상담 또는 1:1 채팅으로 강사와 연락하세요':'After connecting, message your teacher via KakaoTalk or 1:1 chat')+
        '</div>'+
      '</div>'+
    '</div>';
    ov.style.display = 'block';

    // 🆕 안내 음성 자동 재생 (모달 그려진 후 0.2초 뒤)
    setTimeout(playRsGreeting, 200);
  };
  /* ═══════════════════════════════════════════════════════════════════════
     ← 뒤로 · 🏠 홈 (2026-09-02 사장님 지시 «뒤로, 홈버튼 도 만들어줘»)
     ───────────────────────────────────────────────────────────────────────
     [왜 여기서 판정하나] 정본 window.mangoiGoBack 을 부르고 싶지만 **없습니다** —
       index.html 은 js/back-nav.js 를 아예 안 싣고, 실어도 그 파일이 홈(`/`)에서는
       맨 위에서 return 합니다(「홈 화면에서는 뒤로 갈 곳이 없으므로」). 그렇다고
       그 판정을 여기에 복제하면 이 저장소가 2026-09-01 에 한 곳으로 모은 것이
       그날로 다시 갈라집니다(CLAUDE.md 2장).
     [그래서 뜻을 바꿉니다] 이건 «페이지» 가 아니라 «오버레이» 입니다. 오버레이에서
       뒤로 = 덮은 것을 걷기, 즉 뒤에 있던 화면으로 돌아가기입니다. 이 모달이 뜨는
       자리는 셋뿐이고 전부 그 뜻이 맞습니다 — 홈(index.html) · 수업 진단
       (precheck.html) · 수업 중 ⚙️ 설정 시트. 히스토리를 볼 일이 없습니다.
     ⚠️ 그래서 [홈] 은 수업 중에 숨깁니다 — 수업 중에 «/» 로 나가면 그 자리에서
        수업이 끊깁니다(상대 화면에는 「수업이 끝났어요」까지 뜹니다).
     ═══════════════════════════════════════════════════════════════════════ */
  function rsInCall(){
    try { return document.body.classList.contains('vc-in-call'); } catch (e) { return false; }
  }

  function rsNavBar(isKo){
    var btn = 'display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;'
            + 'background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);'
            + 'color:#e2e8f0;border-radius:10px;font-size:13.5px;font-weight:700;cursor:pointer;'
            + 'font-family:inherit;letter-spacing:-.2px';
    /* ⛔ 아이콘만 두고 title 로 설명하지 않습니다 — 폰에는 hover 가 없어 아무것도 안 보입니다.
       ⛔ data-ko/data-en 도 안 답니다 — 두 i18n 엔진이 textContent 를 통째로 갈아끼웁니다.
          이 모달은 그릴 때 isKo 로 글자를 정하므로 그것으로 충분합니다. */
    return '<div style="position:sticky;top:0;z-index:2;display:flex;gap:8px;flex-wrap:wrap;'
         + 'margin:-16px -18px 12px;padding:12px 18px;background:#161c2c;'
         + 'border-bottom:1px solid rgba(255,255,255,.08)">'
         + '<button type="button" onclick="rsGoBack()" style="' + btn + '">'
         +   '<span aria-hidden="true">←</span>' + (isKo ? '뒤로' : 'Back') + '</button>'
         + (rsInCall() ? '' :
             '<button type="button" onclick="rsGoHome()" style="' + btn + '">'
           +   '<span aria-hidden="true">🏠</span>' + (isKo ? '홈' : 'Home') + '</button>')
         + '</div>';
  }

  /* ← 뒤로 = 모달을 걷어 뒤에 있던 화면으로. 주소로 열고 들어온 경우(?menu=remote)에는
     그 자리에 남으면 새로고침할 때 또 열리므로 menu 만 지웁니다.
     ⛔ 주소를 통째로 갈아치우지 마세요 — index.html 은 ?room= 으로 수업에 되돌아옵니다
        (참관에서 ?room= 이 새던 그 함정의 뒷면입니다). */
  window.rsGoBack = function(){
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('menu') === 'remote') {
        u.searchParams.delete('menu');
        history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
      }
    } catch (e) {}
    window.closeRemoteSupportModal();
  };

  window.rsGoHome = function(){
    if (rsInCall()) { window.closeRemoteSupportModal(); return; }  /* 안전망 — 수업 중엔 안 나갑니다 */
    location.href = '/';
  };

  window.closeRemoteSupportModal = function(){
    var ov = document.getElementById('rs-overlay');
    if (ov) ov.style.display = 'none';
    document.body.style.overflow = '';
    stopRsGreeting();    // 모달 닫으면 음성 즉시 정지
    if (window.rsStopWaiting) window.rsStopWaiting();   // 📥 코드 기다리기도 함께 멈춘다
  };
  /* 🔑 PIN 확인 (2026-08-30 v4 제안서 07)
     ⚠️ 실패 사유를 «사실대로» 말한다 — 만료·이미 사용됨·틀림은 다음 행동이 서로 다르다
        (다시 받아야 하나 / 새로 만들어 달라 해야 하나 / 다시 눌러야 하나).
     ⚠️ 이 화면은 로그인 없이도 열린다. 로그인돼 있으면 아이디를 함께 보내 «지정된 학생인지»
        서버가 한 번 더 볼 수 있게 한다(지정 없이 발급했으면 서버가 그 검사를 건너뛴다). */
  window.rsClaimPin = async function(){
    var isKo = L();
    var el = document.getElementById('rs-pin-input');
    var msg = document.getElementById('rs-pin-msg');
    var pin = ((el && el.value) || '').replace(/\D/g, '');
    if (!msg) return;
    if (pin.length !== 6) { msg.style.color = '#fca5a5'; msg.textContent = isKo ? '6자리 숫자를 넣어 주세요.' : 'Enter 6 digits.'; return; }
    var uid = '';
    try { var u = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null'); if (u && u.uid) uid = u.uid; } catch (e) {}
    msg.style.color = '#94a3b8';
    msg.textContent = isKo ? '확인 중…' : 'Checking…';
    try {
      var r = await fetch('/api/class/remote-support/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin, user_id: uid })
      });
      var d = await r.json().catch(function(){ return null; });
      if (d && d.ok === true) {
        msg.style.color = '#86efac';
        msg.textContent = isKo ? '✅ 확인됐어요. 선생님이 코드를 보내면 여기에 뜹니다.'
                               : '✅ Confirmed. Your teacher\'s code will appear here.';
        if (el) el.disabled = true;
        /* 📥 (2026-09-01) 직원이 보내는 접속 코드를 기다린다. 세션 토큰이 없으면 기다릴 수 없다
           (claim 기록이 실패한 경우) — 그때는 조용히 넘어가고 도구 안내만 남는다. */
        if (d.session) rsWaitForCode(String(d.session), Number(d.expires_at) || (Date.now() + 600000));
        return;
      }
      var e2 = (d && d.error) || 'failed';
      var ko = { expired:'번호가 만료됐어요. 새 번호를 받아 주세요.', already_used:'이미 사용된 번호예요. 새 번호를 받아 주세요.',
                 too_many_attempts:'시도가 너무 많았어요. 새 번호를 받아 주세요.', uid_mismatch:'다른 학생에게 발급된 번호예요.',
                 not_found:'번호가 맞지 않아요.', bad_pin:'6자리 숫자를 넣어 주세요.' }[e2] || '확인하지 못했어요.';
      var enTxt = { expired:'This code has expired — ask for a new one.', already_used:'This code was already used.',
                 too_many_attempts:'Too many attempts — ask for a new code.', uid_mismatch:'This code was issued to another student.',
                 not_found:'That code is not correct.', bad_pin:'Enter 6 digits.' }[e2] || 'Could not verify.';
      msg.style.color = '#fca5a5';
      msg.textContent = isKo ? ko : enTxt;
    } catch (e) {
      msg.style.color = '#fca5a5';
      msg.textContent = isKo ? '네트워크 오류입니다.' : 'Network error.';
    }
  };

  window.rsRun = function(idx){
    var o = (window._rsOptions||[])[idx];
    if (o && o.action) o.action();
  };

  /* ═══════════════════════════════════════════════════════════════════════
     🛠 원격 도움받기 — «가는 길» (2026-09-01 사장님 지시)
     ───────────────────────────────────────────────────────────────────────
     [왜] 이 모달은 멀쩡히 동작하는데 화면에서 찾을 길이 없었다. 2026-09-01 실측:
       · 그리드 메뉴의 💻 PC원격지원 타일 → index.html 의 fix-v19 가 #grid-menu 를
         display:none !important 로 통째로 감춘다(계산값으로 확인).
       · 카테고리 모달 카드 → 모달이 DOM 에 붙지 않아 a[href="/remote.html"] 가 0개.
       · 전체메뉴 오버레이 → 보이는 항목 71개 중 원격 0건.
       ⟹ 남은 길은 «검색창에 「원격」 을 정확히 치는 것» 하나뿐이었다.
          컴퓨터가 안 되는 학생에게 검색을 요구하는 구조라 입구를 만든다.
     [어디] 홈 ➕(#mg-fab-wrap) 세 번째 항목. 이미 «새로고침 · 카카오 상담» 이
       들어 있는 «문제 생겼을 때 누르는 묶음» 이라 자리를 새로 외울 필요가 없다.
     ⛔ index.html 은 공동 금지구역이라 여기서 밖에서 끼워 넣는다. 그래서 첫 화면
        예산에도 영향이 없다(이 파일은 defer).
     ⛔ 상주 MutationObserver·setInterval 로 지키지 말 것 — 홈을 통째로 멎게 한 전력.
     ⚠️ 아이콘 버튼에 data-ko/data-en 을 달지 말 것 — 두 i18n 엔진이 textContent 를
        통째로 갈아끼워 44px 동그라미 안에 문장이 들어앉는다. 설명은 *-title/*-aria 로.
     ═══════════════════════════════════════════════════════════════════════ */
  function rsFabItem(){
    var wrap = document.getElementById('mg-fab-wrap');
    if (!wrap || wrap.querySelector('[data-act="remotehelp"]')) return;
    var items = wrap.querySelector('.mg-fab-items');
    if (!items) return;

    var row = document.createElement('div');
    row.className = 'mg-fab-item';
    /* 앞의 두 항목은 .mg-fab-item:nth-child(1)(2) 로 등장 지연이 CSS 에 있는데
       3번째 규칙은 없다. 인라인 longhand 로 준다(class 의 transition 단축속성은
       delay 를 0 으로 되돌리지만, 인라인 longhand 가 이긴다). */
    row.style.transitionDelay = '.12s';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mg-mini';
    btn.setAttribute('data-act', 'remotehelp');   // 래퍼의 위임 핸들러가 이 클릭에 메뉴를 닫는다
    btn.style.background = '#fbbf24';
    btn.style.color = '#241804';
    btn.textContent = '🛠';
    btn.setAttribute('aria-label', '원격 도움받기');
    btn.setAttribute('data-ko-aria', '원격 도움받기');
    btn.setAttribute('data-en-aria', 'Remote help');
    btn.setAttribute('title', '원격 도움받기');
    btn.setAttribute('data-ko-title', '원격 도움받기');
    btn.setAttribute('data-en-title', 'Remote help');

    var lb = document.createElement('span');
    lb.className = 'mg-lb';
    lb.textContent = '원격 도움받기';
    lb.setAttribute('data-ko', '원격 도움받기');
    lb.setAttribute('data-en', 'Remote help');

    row.appendChild(btn); row.appendChild(lb);
    /* 맨 아래(＋ 버튼에 제일 가까운 자리)에 붙인다 — 급할 때 엄지가 먼저 닿는 칸. */
    items.appendChild(row);

    /* 래퍼 위임 핸들러는 kakao·refresh 만 알고 있어 remotehelp 는 «메뉴 닫기» 까지만
       한다. 여는 것은 여기서 직접 — 버튼에 건 리스너가 위임보다 먼저 발화한다. */
    row.addEventListener('click', function(e){
      e.preventDefault();
      window.openRemoteSupportModal();
    });
  }

  /* 🔗 주소로 바로 열기 — /?menu=remote
     [왜] 「어디에 있어요?」 를 카톡으로 물어 오는 학생에게 링크 하나로 답할 수 있어야 하고,
          전체메뉴 타일의 href 폴백(자바스크립트가 죽어도 닿는 길)도 이것이다. */
  function rsFromUrl(){
    try {
      if (new URLSearchParams(location.search).get('menu') !== 'remote') return;
    } catch (e) { return; }
    window.openRemoteSupportModal();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     📥 선생님이 보낸 접속 코드 받기 (2026-09-01 사장님 지시 «직원이 원격으로 들어가서 수리»)
     ───────────────────────────────────────────────────────────────────────
     [왜] Quick Assist 는 «직원이 코드를 만들고 학생이 입력» 하는 구조다. 그 코드를 전화로
       불러 주고 받아 적는 자리가 제일 자주 깨졌다 — 아이도, 한국어를 못 읽는 강사도 어렵다.
       여기서는 직원이 보내면 화면에 크게 뜨고 [복사] 한 번이면 끝난다.
     ⛔ 우리가 학생 화면을 조작하는 것이 아니다 — 코드를 받아 «보여 주기» 만 한다.
     ⛔ 상주 setInterval 금지(홈을 멎게 한 전력) — 이 폴링은 끝이 있다:
        PIN 이 만료되거나 코드가 오거나 모달을 닫으면 스스로 멈춘다.
     ═══════════════════════════════════════════════════════════════════════ */
  var rsPoll = null;
  window.rsStopWaiting = function(){ if (rsPoll) { clearInterval(rsPoll); rsPoll = null; } };

  /* ⬅️ 휴대폰용 — 내 접속 번호를 직원에게 보낸다.
     [왜] Quick Assist(PC)는 직원이 코드를 만들지만, AnyDesk 같은 모바일 도구는 정반대로
       «내 기기의 번호» 를 직원에게 알려 줘야 한다. 지금까지는 카톡으로 불러 주게 안내했다.
     ⛔ 세션 토큰이 있어야 보낸다 — PIN 을 확인한 사람만 보낼 수 있다. */
  function rsMyCodeBox(session){
    var isKo = L();
    var box = document.getElementById('rs-mycode-box');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML =
      '<div style="font-size:12px;color:#bfdbfe;font-weight:700;margin-bottom:6px">'
        + (isKo ? '📱 휴대폰이면 — 내 번호를 선생님께 보내기' : '📱 On a phone — send your ID to the teacher') + '</div>'
      + '<div style="font-size:11.5px;color:#94a3b8;line-height:1.6;margin-bottom:7px">'
        + (isKo ? 'AnyDesk 앱을 열면 나오는 9~10자리 숫자를 넣어 주세요.'
                : 'Open the AnyDesk app and enter the 9-10 digit number it shows.') + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
        + '<input id="rs-mycode-input" type="text" inputmode="numeric" maxlength="14" autocomplete="off" '
          + 'autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="000 000 000" '
          + 'style="flex:1 1 130px;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid rgba(96,165,250,.45);background:#0f1626;color:#dbeafe;font-size:15px;letter-spacing:2px;text-align:center;font-family:MangoiHanSC,Consolas,monospace">'
        + '<button type="button" onclick="rsSendMyCode(' + JSON.stringify(session) + ')" '
          + 'style="padding:9px 14px;border-radius:8px;border:0;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-weight:800;font-size:12.5px;cursor:pointer">'
          + (isKo ? '보내기' : 'Send') + '</button>'
      + '</div>'
      + '<div id="rs-mycode-msg" style="font-size:11.5px;color:#94a3b8;margin-top:6px"></div>';
  }

  window.rsSendMyCode = async function(session){
    var isKo = L();
    var el = document.getElementById('rs-mycode-input');
    var msg = document.getElementById('rs-mycode-msg');
    var code = ((el && el.value) || '').replace(/\D/g, '');
    if (!msg) return;
    if (code.length < 4 || code.length > 12) {
      msg.style.color = '#fca5a5';
      msg.textContent = isKo ? '숫자만 넣어 주세요 (4~12자리).' : 'Digits only (4-12).';
      return;
    }
    msg.style.color = '#94a3b8';
    msg.textContent = isKo ? '보내는 중…' : 'Sending…';
    try {
      var r = await fetch('/api/class/remote-support/student-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: session, code: code, tool: 'anydesk' })
      });
      var d = await r.json().catch(function(){ return null; });
      /* 판정은 «성공이라고 말했는가» 로 — 종단 404 본문에는 ok 칸이 없다 */
      if (r.ok && d && d.ok === true) {
        msg.style.color = '#86efac';
        msg.textContent = isKo ? '✅ 보냈어요. 선생님이 접속할 때까지 앱을 켜 두세요.'
                               : '✅ Sent. Keep the app open until your teacher connects.';
        return;
      }
      var e2 = (d && d.error) || 'failed';
      var ko = { expired: '시간이 지났어요. 새 번호를 받아 주세요.', bad_code: '숫자만 넣어 주세요 (4~12자리).',
                 not_found: '다시 «확인» 을 눌러 주세요.' }[e2] || '보내지 못했어요.';
      var enTxt = { expired: 'This session expired — ask for a new PIN.', bad_code: 'Digits only (4-12).',
                 not_found: 'Please verify the PIN again.' }[e2] || 'Could not send.';
      msg.style.color = '#fca5a5';
      msg.textContent = isKo ? ko : enTxt;
    } catch (e) {
      msg.style.color = '#fca5a5';
      msg.textContent = isKo ? '네트워크 오류입니다.' : 'Network error.';
    }
  };

  function rsWaitForCode(session, until){
    window.rsStopWaiting();
    var box = document.getElementById('rs-code-box');
    if (box) box.style.display = 'block';
    try { rsMyCodeBox(session); } catch (e) {}
    rsPoll = setInterval(async function(){
      if (Date.now() > until) { window.rsStopWaiting(); return; }
      /* 모달이 닫혔으면 멈춘다 — 화면에 없는 것을 계속 물어볼 이유가 없다 */
      var ov = document.getElementById('rs-overlay');
      if (!ov || ov.style.display !== 'block') { window.rsStopWaiting(); return; }
      try {
        var r = await fetch('/api/class/remote-support/status?session=' + encodeURIComponent(session));
        var d = await r.json().catch(function(){ return null; });
        /* 판정은 «성공이라고 말했는가» 로 — 종단 404 본문에는 ok 칸이 없다(CLAUDE.md 2장) */
        if (!r.ok || !d || d.ok !== true) return;
        if (d.code) { window.rsStopWaiting(); rsShowCode(String(d.code), String(d.tool || 'quickassist')); }
      } catch (e) { /* 통신이 흔들려도 계속 — 다음 회차에 다시 본다 */ }
    }, 3000);
  }

  function rsShowCode(code, tool){
    var isKo = L();
    var box = document.getElementById('rs-code-box');
    if (!box) return;
    var TOOL = { quickassist: 'Quick Assist', chromeremote: isKo ? 'Chrome 원격 데스크톱' : 'Chrome Remote Desktop', anydesk: 'AnyDesk' };
    box.innerHTML =
      '<div style="font-size:12.5px;color:#fde68a;font-weight:800;margin-bottom:8px">'
        + (isKo ? '📮 선생님이 보낸 코드예요 — ' : '📮 Code from your teacher — ') + (TOOL[tool] || TOOL.quickassist) + '</div>'
      /* 숫자를 «크게». 이 화면은 컴퓨터가 고장 난 학생이 보는 자리라 작으면 못 읽는다.
         세 자리씩 띄워 읽기 쉽게 — 붙여넣는 값은 띄어쓰기 없는 원본을 쓴다. */
      + '<div id="rs-code-num" style="font-family:MangoiHanSC,Consolas,monospace;font-size:38px;font-weight:800;'
        + 'letter-spacing:6px;color:#fde68a;text-align:center;line-height:1.2;word-break:break-all">'
        + code.replace(/(\d{3})(?=\d)/g, '$1 ') + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">'
        + '<button type="button" onclick="rsCopyCode(' + JSON.stringify(code) + ')" '
          + 'style="flex:1 1 120px;padding:10px;border-radius:9px;border:0;background:linear-gradient(135deg,#f59e0b,#d97706);color:#1a1206;font-weight:800;font-size:13px;cursor:pointer">'
          + (isKo ? '📋 코드 복사' : '📋 Copy code') + '</button>'
        + (tool === 'quickassist'
            ? '<button type="button" onclick="rsRun(0)" style="flex:1 1 120px;padding:10px;border-radius:9px;border:1px solid rgba(251,191,36,.5);background:transparent;color:#fde68a;font-weight:800;font-size:13px;cursor:pointer">'
              + (isKo ? '⚡ Quick Assist 열기' : '⚡ Open Quick Assist') + '</button>'
            : '')
      + '</div>'
      + '<div id="rs-code-msg" style="font-size:11.5px;color:#94a3b8;margin-top:7px">'
        + (isKo ? '이 번호를 프로그램에 넣으면 선생님이 화면을 봐 드려요.'
                : 'Enter this code in the tool and your teacher can help on your screen.') + '</div>';
  }

  window.rsCopyCode = function(code){
    var isKo = L();
    var msg = document.getElementById('rs-code-msg');
    var done = function(okay){
      if (!msg) return;
      msg.style.color = okay ? '#86efac' : '#fca5a5';
      msg.textContent = okay ? (isKo ? '✅ 복사했어요. 프로그램에 붙여넣으세요.' : '✅ Copied — paste it into the tool.')
                             : (isKo ? '복사가 안 됐어요. 위 숫자를 그대로 넣어 주세요.' : 'Copy failed — type the digits above.');
    };
    /* ⚠️ clipboard API 는 https·사용자 제스처가 있어야 하고 인앱 브라우저에서 자주 막힌다.
       실패해도 숫자는 화면에 그대로 있으니 «직접 넣어 주세요» 로 정직하게 안내한다. */
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(function(){ done(true); }).catch(function(){ done(false); });
        return;
      }
    } catch (e) {}
    done(false);
  };

  function rsBoot(){ try { rsFabItem(); } catch (e) {} try { rsFromUrl(); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rsBoot);
  else rsBoot();
})();

