// ═══════════════════════════════════════════════════════════════
// adm-pw-reset.js — 관리자 «비밀번호 찾기»(셀프 재설정) 공용 모달 (2026-08-17)
//
//   서버: POST /api/admin/password-reset/request  { username }
//         POST /api/admin/password-reset/confirm  { username, code, new_password, code_2fa? }
//
//   ⚠️ 왜 **파일 하나**인가 — 이 화면은 로그인 자리 두 곳(`/admin/login.html` 과 admin.html 의
//      로그인 오버레이)에서 똑같이 필요하다. 2026-08-17 에 사용자 메뉴의 «비밀번호 변경» 이
//      **네 벌 복사**돼 있다가 넷 다 서버에 안 보내던 사고를 쳤다(PR #173). 같은 실수를 반복하지
//      않으려고 로직은 여기 한 벌만 두고 두 화면이 `window.mangoiPwReset.open()` 으로 부른다.
//      새 로그인 화면이 생기면 **이 파일을 부르라.** 복사하지 말 것.
//
//   ⚠️ 서버는 아이디 존재 여부를 알려 주지 않는다(계정 열거 방지). 그래서 이 화면도
//      「보냈습니다」 대신 「등록된 연락처가 있으면 갔습니다」 라고 말한다. 없는 말을 지어내지 않는다.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  if (window.mangoiPwReset) return;   // 두 화면이 같이 불러도 한 벌만

  function EN(){
    try { return (localStorage.getItem('mangoi_lang') || 'ko') === 'en'; } catch(e){ return false; }
  }
  function T(ko, en){ return EN() ? en : ko; }
  var MAIL = 'navy111p@gmail.com';

  function el(id){ return document.getElementById(id); }

  function build(){
    if (el('mpr-modal')) return;
    var m = document.createElement('div');
    m.id = 'mpr-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,0.72);' +
      'display:none;align-items:center;justify-content:center;padding:18px;' +
      '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)';
    m.innerHTML =
      '<div id="mpr-card" style="background:#fff;color:#0f172a;width:100%;max-width:420px;border-radius:16px;' +
        'box-shadow:0 24px 60px -12px rgba(0,0,0,0.55);padding:22px 22px 18px;' +
        'font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',\'Noto Sans KR\',sans-serif">' +
        '<div style="text-align:center;margin-bottom:14px">' +
          '<div style="font-size:30px;line-height:1">🔑</div>' +
          '<h2 id="mpr-title" style="margin:6px 0 0;font-size:18px;font-weight:800"></h2>' +
          '<p id="mpr-sub" style="margin:5px 0 0;font-size:12.5px;color:#64748b;line-height:1.5"></p>' +
        '</div>' +
        '<div id="mpr-body"></div>' +
        '<div id="mpr-msg" style="display:none;margin-top:11px;padding:10px 12px;border-radius:9px;' +
          'font-size:12.5px;line-height:1.6;white-space:pre-line"></div>' +
        '<button type="button" id="mpr-close" style="width:100%;margin-top:13px;padding:9px;background:#f1f5f9;' +
          'color:#334155;border:0;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer"></button>' +
        '<p style="margin:11px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;text-align:center">' +
          '<span id="mpr-foot"></span> <a href="mailto:' + MAIL + '" style="color:#2563eb;font-weight:700">' + MAIL + '</a></p>' +
      '</div>';
    /* 🛡️ host 페이지 CSS 차단막 — 2026-08-17 실제로 밟은 사고.
       `/admin/login.html` 은 전역으로 `input[type=text],input[type=password]{color:#fff;
       background:rgba(255,255,255,.07)}` 를 건다(어두운 배경 화면이라 당연한 규칙이다).
       이 모달은 **흰 카드**인데 그 규칙이 그대로 새어 들어와, 사장님이 인증번호를 쳐도
       흰 글씨가 흰 배경에 찍혀 **아무것도 안 친 것처럼 보였다**(입력은 되고 있었다).
       inline style 로는 못 막는다 — 내가 지정하지 않은 속성(color·background)은 페이지 규칙이 이긴다.
       그래서 모달 안쪽만 범위로 잡아 되돌린다. 여기서 !important 는 정당하다:
       이 위젯은 어떤 화면에 얹힐지 모르는 채로 주입되고, 글자가 안 보이면 기능 자체가 죽는다.
       ⚠️ 새 입력칸을 추가하면 이 규칙 범위(#mpr-modal input) 안에 있는지 확인할 것. */
    if (!document.getElementById('mpr-style')) {
      var st = document.createElement('style');
      st.id = 'mpr-style';
      st.textContent =
        '#mpr-modal input{color:#0f172a !important;background:#fff !important;' +
          '-webkit-text-fill-color:#0f172a !important;caret-color:#0f172a;' +
          'font-family:inherit;opacity:1 !important}' +
        '#mpr-modal input::placeholder{color:#94a3b8 !important;-webkit-text-fill-color:#94a3b8 !important}' +
        '#mpr-modal input:focus{outline:none;border-color:#2563eb !important;box-shadow:0 0 0 3px rgba(37,99,235,.18)}';
      document.head.appendChild(st);
    }
    m.addEventListener('click', function(e){ if (e.target === m) close(); });
    document.body.appendChild(m);
    el('mpr-close').addEventListener('click', close);
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && m.style.display === 'flex') close();
    });
  }

  function say(kind, text){
    var box = el('mpr-msg');
    if (!box) return;
    var c = { ok:['#ecfdf5','#a7f3d0','#065f46'], err:['#fef2f2','#fecaca','#991b1b'], info:['#eff6ff','#bfdbfe','#1e40af'] }[kind] || ['#f8fafc','#e2e8f0','#334155'];
    box.style.display = 'block';
    box.style.background = c[0]; box.style.border = '1px solid ' + c[1]; box.style.color = c[2];
    box.textContent = text;
  }
  function clearSay(){ var b = el('mpr-msg'); if (b) b.style.display = 'none'; }

  var INPUT = 'width:100%;padding:11px 12px;margin:4px 0 12px;border:1.5px solid #cbd5e1;border-radius:10px;' +
              'font-size:15px;font-family:inherit;box-sizing:border-box';
  var LABEL = 'display:block;font-size:12px;font-weight:700;color:#334155';
  var BTN   = 'width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:0;' +
              'border-radius:11px;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit';

  // ── 1단계: 아이디 → 인증번호 발송 ──
  function stepRequest(prefillUid){
    el('mpr-title').textContent = T('비밀번호 찾기', 'Forgot password');
    el('mpr-sub').textContent = T('계정에 등록된 연락처로 인증번호를 보냅니다.',
                                  'We send a code to the contact registered on your account.');
    el('mpr-foot').textContent = T('문자·메일이 오지 않으면 운영자에게 문의하세요 —',
                                   'If nothing arrives, contact the office —');
    el('mpr-close').textContent = T('닫기', 'Close');
    el('mpr-body').innerHTML =
      '<label style="' + LABEL + '">' + T('아이디', 'Account ID') + '</label>' +
      '<input type="text" id="mpr-uid" autocomplete="username" style="' + INPUT + '" placeholder="' +
        T('로그인에 쓰는 아이디', 'The ID you sign in with') + '">' +
      '<button type="button" id="mpr-send" style="' + BTN + '">📨 ' +
        T('인증번호 받기', 'Send code') + '</button>';
    var uid = el('mpr-uid');
    if (prefillUid) uid.value = prefillUid;
    setTimeout(function(){ uid.focus(); }, 60);
    uid.addEventListener('keydown', function(e){ if (e.key === 'Enter') send(); });
    el('mpr-send').addEventListener('click', send);

    async function send(){
      var v = (uid.value || '').trim();
      if (!v) { say('err', T('아이디를 입력해 주세요.', 'Please enter your ID.')); return; }
      var btn = el('mpr-send');
      btn.disabled = true; btn.textContent = T('보내는 중…', 'Sending…');
      clearSay();
      try {
        var r = await fetch('/api/admin/password-reset/request', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ username: v })
        });
        var j = await r.json().catch(function(){ return {}; });
        if (j && j.ok) { stepConfirm(v, msgOf(j)); return; }
        say('err', msgOf(j) || T('요청에 실패했습니다.', 'Request failed.'));
      } catch(e) {
        say('err', T('네트워크 오류입니다. 다시 시도해 주세요.', 'Network error. Please try again.'));
      }
      btn.disabled = false; btn.textContent = '📨 ' + T('인증번호 받기', 'Send code');
    }
  }

  // ── 2단계: 인증번호 + 새 비밀번호 ──
  function stepConfirm(username, notice){
    el('mpr-title').textContent = T('인증번호 입력', 'Enter your code');
    el('mpr-sub').textContent = T('받은 6자리 숫자와 새 비밀번호를 입력하세요. 코드는 10분간 유효합니다.',
                                  'Enter the 6-digit code and your new password. The code is valid for 10 minutes.');
    el('mpr-body').innerHTML =
      '<label style="' + LABEL + '">' + T('인증번호 6자리', '6-digit code') + '</label>' +
      '<input type="text" id="mpr-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="' +
        INPUT + ';letter-spacing:7px;text-align:center;font-size:20px" placeholder="000000">' +
      '<div id="mpr-2fa-wrap" style="display:none">' +
        '<label style="' + LABEL + '">' + T('인증 앱 6자리 코드', 'Authenticator code') + '</label>' +
        '<input type="text" id="mpr-2fa" inputmode="numeric" maxlength="6" style="' +
          INPUT + ';letter-spacing:7px;text-align:center;font-size:20px" placeholder="000000">' +
      '</div>' +
      '<label style="' + LABEL + '">' + T('새 비밀번호 (6자 이상)', 'New password (6+ characters)') + '</label>' +
      '<input type="password" id="mpr-pw" autocomplete="new-password" style="' + INPUT + '">' +
      '<label style="' + LABEL + '">' + T('새 비밀번호 확인', 'Confirm new password') + '</label>' +
      '<input type="password" id="mpr-pw2" autocomplete="new-password" style="' + INPUT + '">' +
      '<button type="button" id="mpr-go" style="' + BTN + '">🔐 ' +
        T('비밀번호 바꾸기', 'Change password') + '</button>' +
      '<button type="button" id="mpr-back" style="width:100%;margin-top:8px;padding:9px;background:transparent;' +
        'color:#64748b;border:0;font-size:12.5px;cursor:pointer;font-family:inherit">← ' +
        T('아이디 다시 입력', 'Use a different ID') + '</button>';
    if (notice) say('info', notice);
    setTimeout(function(){ el('mpr-code').focus(); }, 60);
    el('mpr-back').addEventListener('click', function(){ clearSay(); stepRequest(username); });
    el('mpr-go').addEventListener('click', go);
    el('mpr-pw2').addEventListener('keydown', function(e){ if (e.key === 'Enter') go(); });

    async function go(){
      var code = (el('mpr-code').value || '').replace(/\D/g, '');
      var pw   = el('mpr-pw').value || '';
      var pw2  = el('mpr-pw2').value || '';
      var otp  = (el('mpr-2fa') && el('mpr-2fa').value || '').replace(/\D/g, '');
      if (code.length !== 6) { say('err', T('인증번호 6자리를 입력해 주세요.', 'Enter the 6-digit code.')); return; }
      if (pw.length < 6)     { say('err', T('새 비밀번호는 6자 이상이어야 합니다.', 'New password must be at least 6 characters.')); return; }
      if (pw !== pw2)        { say('err', T('새 비밀번호가 서로 다릅니다.', 'The new passwords do not match.')); return; }
      var btn = el('mpr-go');
      btn.disabled = true; btn.textContent = T('바꾸는 중…', 'Changing…');
      clearSay();
      try {
        var payload = { username: username, code: code, new_password: pw };
        if (otp) payload.code_2fa = otp;
        var r = await fetch('/api/admin/password-reset/confirm', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        var j = await r.json().catch(function(){ return {}; });
        // 2FA 를 켠 계정 — 인증 앱 칸을 열고 다시 받는다.
        if (j && j.need_2fa) {
          el('mpr-2fa-wrap').style.display = 'block';
          say('info', msgOf(j));
          setTimeout(function(){ el('mpr-2fa').focus(); }, 60);
          btn.disabled = false; btn.textContent = '🔐 ' + T('비밀번호 바꾸기', 'Change password');
          return;
        }
        if (j && j.ok) { stepDone(msgOf(j)); return; }
        say('err', msgOf(j) || T('변경에 실패했습니다.', 'Could not change the password.'));
      } catch(e) {
        say('err', T('네트워크 오류입니다. 다시 시도해 주세요.', 'Network error. Please try again.'));
      }
      btn.disabled = false; btn.textContent = '🔐 ' + T('비밀번호 바꾸기', 'Change password');
    }
  }

  // ── 3단계: 완료 ──
  function stepDone(msg){
    el('mpr-title').textContent = T('변경 완료', 'All set');
    el('mpr-sub').textContent = T('새 비밀번호로 로그인해 주세요. 다른 기기의 기존 로그인은 모두 해제됐습니다.',
                                  'Sign in with the new password. Existing sessions on other devices were signed out.');
    el('mpr-body').innerHTML =
      '<button type="button" id="mpr-done" style="' + BTN + '">✅ ' + T('로그인하러 가기', 'Go to sign in') + '</button>';
    say('ok', msg || T('비밀번호가 변경됐습니다.', 'Password changed.'));
    el('mpr-done').addEventListener('click', function(){
      close();
      // 로그인 화면이면 그 자리에서 비번 칸만 비우고, 아니면 로그인 화면으로 보낸다.
      var pw = document.getElementById('password') || document.getElementById('admin-login-pw');
      if (pw) { pw.value = ''; try { pw.focus(); } catch(e){} }
      else location.href = '/admin/login';
    });
  }

  function msgOf(j){
    if (!j) return '';
    return String((EN() && j.message_en) ? j.message_en : (j.message || j.message_en || j.error || ''));
  }

  function open(prefillUid){
    build();
    clearSay();
    stepRequest(prefillUid || '');
    el('mpr-modal').style.display = 'flex';
  }
  function close(){
    var m = el('mpr-modal');
    if (m) m.style.display = 'none';
  }

  window.mangoiPwReset = { open: open, close: close };
})();
