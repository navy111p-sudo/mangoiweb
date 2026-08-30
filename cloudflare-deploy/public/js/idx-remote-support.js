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
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(5,7,18,.86);backdrop-filter:blur(14px);display:none;z-index:11500;padding:24px 16px;overflow-y:auto;animation:lcFade .2s';
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
  window.closeRemoteSupportModal = function(){
    var ov = document.getElementById('rs-overlay');
    if (ov) ov.style.display = 'none';
    document.body.style.overflow = '';
    stopRsGreeting();    // 모달 닫으면 음성 즉시 정지
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
        msg.textContent = isKo ? '✅ 확인됐어요. 아래에서 방법을 고르세요.' : '✅ Confirmed. Now pick a tool below.';
        if (el) el.disabled = true;
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
})();

