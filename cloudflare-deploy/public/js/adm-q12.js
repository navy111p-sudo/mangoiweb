// ═══════════════════════════════════════════════════════════════
// adm-q12.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  function ph132Mount(){
    var pwInput = document.getElementById('admin-login-pw');
    if (!pwInput || pwInput.__ph132mounted) return;
    pwInput.__ph132mounted = true;

    if (pwInput.parentElement && !pwInput.parentElement.classList.contains('ph132-pw-wrap')){
      var wrap = document.createElement('div');
      wrap.className = 'ph132-pw-wrap';
      pwInput.parentNode.insertBefore(wrap, pwInput);
      wrap.appendChild(pwInput);

      var eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'ph132-pw-eye';
      eye.title = '비밀번호 보기/숨기기';
      eye.setAttribute('aria-label', '비밀번호 보기');
      eye.textContent = '👁';
      eye.onclick = function(){
        if (pwInput.type === 'password'){
          pwInput.type = 'text';
          eye.textContent = '🙈';
          eye.title = '비밀번호 숨기기';
        } else {
          pwInput.type = 'password';
          eye.textContent = '👁';
          eye.title = '비밀번호 보기';
        }
      };
      wrap.appendChild(eye);
    }

    if (!document.getElementById('ph132-forgot-btn')){
      var forgot = document.createElement('button');
      forgot.type = 'button';
      forgot.id = 'ph132-forgot-btn';
      forgot.className = 'ph132-forgot';
      forgot.setAttribute('data-ko', '🔑 비밀번호를 잊으셨나요?');
      forgot.setAttribute('data-en', '🔑 Forgot password?');
      forgot.textContent = '🔑 비밀번호를 잊으셨나요?';
      forgot.onclick = ph132OpenForgot;

      var loginBtn = document.querySelector('#admin-login-overlay button[onclick*="adminLogin"]');
      if (loginBtn && loginBtn.parentNode) loginBtn.parentNode.insertBefore(forgot, loginBtn);
    }
  }

  function ph132BuildModal(){
    if (document.getElementById('ph132-forgot-modal')) return;
    var m = document.createElement('div');
    m.id = 'ph132-forgot-modal';
    m.innerHTML =
      '<div class="ph132-modal-card" onclick="event.stopPropagation()">' +
        '<div style="text-align:center;margin-bottom:14px">' +
          '<div style="font-size:32px;margin-bottom:4px">🔑</div>' +
          '<h2 style="margin:0;font-size:18px;color:#0f172a">비밀번호 찾기</h2>' +
          '<p style="margin:4px 0 0;font-size:12px;color:#64748b">아래 방법 중 하나를 선택하세요</p>' +
        '</div>' +
        '<div id="ph132-method-list">' +
          '<button type="button" class="ph132-method" data-method="phone">' +
            '<span class="ph132-method-icon">📱</span>' +
            '<div><div class="ph132-method-title">전화번호로 SMS 받기</div>' +
            '<div class="ph132-method-desc">등록된 휴대폰으로 임시 비밀번호 전송</div></div>' +
          '</button>' +
          '<button type="button" class="ph132-method" data-method="kakao">' +
            '<span class="ph132-method-icon">💬</span>' +
            '<div><div class="ph132-method-title">카카오톡으로 받기</div>' +
            '<div class="ph132-method-desc">카카오 인증 후 임시 비밀번호 알림톡 발송</div></div>' +
          '</button>' +
          '<button type="button" class="ph132-method" data-method="email">' +
            '<span class="ph132-method-icon">📧</span>' +
            '<div><div class="ph132-method-title">이메일로 재설정 링크 받기</div>' +
            '<div class="ph132-method-desc">등록된 이메일로 재설정 링크 전송</div></div>' +
          '</button>' +
          '<button type="button" class="ph132-method" data-method="contact">' +
            '<span class="ph132-method-icon">👨‍💼</span>' +
            '<div><div class="ph132-method-title">운영자에게 직접 문의</div>' +
            '<div class="ph132-method-desc">navy111p@gmail.com 으로 메일 보내기</div></div>' +
          '</button>' +
        '</div>' +
        '<div id="ph132-method-form" style="display:none"></div>' +
        '<button type="button" id="ph132-modal-close" style="width:100%;margin-top:14px;padding:9px;background:#f3f4f6;color:#374151;border:0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">취소</button>' +
      '</div>';
    m.onclick = function(e){ if (e.target === m) ph132CloseForgot(); };
    document.body.appendChild(m);

    m.querySelector('#ph132-modal-close').onclick = ph132CloseForgot;
    m.querySelectorAll('.ph132-method').forEach(function(b){
      b.onclick = function(){ ph132ShowForm(b.dataset.method); };
    });
  }

  function ph132OpenForgot(){
    ph132BuildModal();
    document.getElementById('ph132-forgot-modal').style.display = 'flex';
    document.getElementById('ph132-method-list').style.display = 'block';
    document.getElementById('ph132-method-form').style.display = 'none';
  }

  function ph132CloseForgot(){
    var m = document.getElementById('ph132-forgot-modal');
    if (m) m.style.display = 'none';
  }

  function ph132ShowForm(method){
    var list = document.getElementById('ph132-method-list');
    var form = document.getElementById('ph132-method-form');
    list.style.display = 'none';
    form.style.display = 'block';

    var html = '<button type="button" class="ph132-back">← 다른 방법 선택</button>';

    if (method === 'phone'){
      html +=
        '<div style="text-align:center;margin-bottom:10px"><span style="font-size:28px">📱</span></div>' +
        '<h3 style="margin:0 0 10px;font-size:15px;color:#0f172a">📱 SMS 비밀번호 재설정</h3>' +
        '<label style="font-size:12px;color:#374151;font-weight:600">아이디</label>' +
        '<input type="text" id="ph132-phone-uid" class="ph132-input" placeholder="가입 시 사용한 아이디" />' +
        '<label style="font-size:12px;color:#374151;font-weight:600">등록 휴대폰 번호</label>' +
        '<input type="tel" id="ph132-phone-num" class="ph132-input" placeholder="010-1234-5678" />' +
        '<button type="button" class="ph132-submit" data-action="phone-send">📨 임시 비밀번호 SMS 전송</button>' +
        '<p style="font-size:11px;color:#94a3b8;margin:10px 0 0;line-height:1.5">' +
          '※ 등록된 휴대폰 번호와 일치하는 경우에만 발송됩니다.<br>' +
          '※ 임시 비밀번호 수령 후 즉시 변경하세요.</p>';
    } else if (method === 'kakao'){
      html +=
        '<div style="text-align:center;margin-bottom:10px"><span style="font-size:28px">💬</span></div>' +
        '<h3 style="margin:0 0 10px;font-size:15px;color:#0f172a">💬 카카오톡 인증</h3>' +
        '<p style="font-size:12.5px;color:#374151;line-height:1.6;margin:0 0 14px">' +
          '카카오 계정으로 인증 후 임시 비밀번호를<br>카카오톡 알림톡으로 받아보실 수 있습니다.</p>' +
        '<button type="button" class="ph132-submit" data-action="kakao-auth" style="background:#fee500;color:#191919">💬 카카오로 인증하기</button>' +
        '<p style="font-size:11px;color:#94a3b8;margin:10px 0 0;line-height:1.5">' +
          '※ 가입 시 연동한 카카오 계정과 일치해야 합니다.</p>';
    } else if (method === 'email'){
      html +=
        '<div style="text-align:center;margin-bottom:10px"><span style="font-size:28px">📧</span></div>' +
        '<h3 style="margin:0 0 10px;font-size:15px;color:#0f172a">📧 이메일 재설정 링크</h3>' +
        '<label style="font-size:12px;color:#374151;font-weight:600">아이디</label>' +
        '<input type="text" id="ph132-email-uid" class="ph132-input" placeholder="가입 시 사용한 아이디" />' +
        '<label style="font-size:12px;color:#374151;font-weight:600">등록 이메일</label>' +
        '<input type="email" id="ph132-email-addr" class="ph132-input" placeholder="example@mangoi.kr" />' +
        '<button type="button" class="ph132-submit" data-action="email-send">📨 재설정 링크 보내기</button>' +
        '<p style="font-size:11px;color:#94a3b8;margin:10px 0 0;line-height:1.5">' +
          '※ 메일 도착까지 1~3분 소요됩니다.<br>※ 링크는 30분간 유효합니다.</p>';
    } else if (method === 'contact'){
      html +=
        '<div style="text-align:center;margin-bottom:10px"><span style="font-size:28px">👨‍💼</span></div>' +
        '<h3 style="margin:0 0 10px;font-size:15px;color:#0f172a">👨‍💼 운영자 문의</h3>' +
        '<div style="padding:14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;margin-bottom:12px">' +
          '<div style="font-size:13px;color:#0c4a6e;font-weight:700;margin-bottom:4px">📧 운영자 이메일</div>' +
          '<div style="font-size:14px;color:#0369a1;font-family:Consolas,monospace">navy111p@gmail.com</div>' +
        '</div>' +
        '<button type="button" class="ph132-submit" data-action="contact-mail">📨 메일 작성하기</button>' +
        '<p style="font-size:11px;color:#94a3b8;margin:10px 0 0;line-height:1.5">' +
          '※ 아이디·소속·연락처를 함께 적어 주시면 빠른 처리가 가능합니다.</p>';
    }

    form.innerHTML = html;

    form.querySelector('.ph132-back').onclick = function(){
      list.style.display = 'block'; form.style.display = 'none';
    };
    var sub = form.querySelector('[data-action]');
    if (sub) sub.onclick = function(){ ph132Handle(sub.dataset.action); };
  }

  function ph132Handle(action){
    if (action === 'phone-send'){
      var uid = document.getElementById('ph132-phone-uid').value.trim();
      var num = document.getElementById('ph132-phone-num').value.trim();
      if (!uid || !num){ alert('아이디와 휴대폰 번호를 모두 입력해 주세요.'); return; }
      alert('✅ 임시 비밀번호가 ' + num + ' 으로 발송되었습니다.\n\n📱 SMS 확인 후 로그인하시고, 즉시 비밀번호를 변경해 주세요.\n\n※ 시연 화면입니다 — 실 운영시 SMS 게이트웨이(알리고/뿌리오/Twilio) 연동 필요.');
      ph132CloseForgot();
    } else if (action === 'kakao-auth'){
      alert('💬 카카오 인증 페이지로 이동합니다.\n\n인증 완료 시 카카오톡 알림톡으로 임시 비밀번호가 발송됩니다.\n\n※ 시연 화면 — 실 운영시 카카오 비즈메시지 API 연동 필요.');
      try { if (typeof window.oauthLogin === 'function') window.oauthLogin('kakao'); } catch(e){}
    } else if (action === 'email-send'){
      var uid2 = document.getElementById('ph132-email-uid').value.trim();
      var em = document.getElementById('ph132-email-addr').value.trim();
      if (!uid2 || !em){ alert('아이디와 이메일을 모두 입력해 주세요.'); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ alert('올바른 이메일 형식이 아닙니다.'); return; }
      alert('✅ 비밀번호 재설정 링크가 ' + em + ' 으로 발송되었습니다.\n\n📧 메일함을 확인해 주세요. (스팸함도 확인)\n링크는 30분간 유효합니다.\n\n※ 시연 화면 — 실 운영시 SendGrid/AWS SES 연동 필요.');
      ph132CloseForgot();
    } else if (action === 'contact-mail'){
      var subject = encodeURIComponent('[망고아이 관리자] 비밀번호 재설정 문의');
      var body = encodeURIComponent('안녕하세요,\n\n관리자 페이지 비밀번호를 잊어버려 문의드립니다.\n\n· 아이디: \n· 소속: \n· 연락처: \n· 사유: \n\n감사합니다.');
      location.href = 'mailto:navy111p@gmail.com?subject=' + subject + '&body=' + body;
    }
  }

  function ph132Init(){
    ph132Mount();
    var ov = document.getElementById('admin-login-overlay');
    if (ov && !ov.__ph132obs){
      ov.__ph132obs = true;
      try {
        var obs = new MutationObserver(function(){ ph132Mount(); });
        obs.observe(ov, { attributes: true, attributeFilter: ['style'] });
      } catch(e){}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ph132Init);
  } else {
    ph132Init();
  }
  setTimeout(ph132Init, 500);
  setTimeout(ph132Init, 1500);

  console.log('[ph132] 관리자 로그인 강화 활성 — 비번보기·비밀번호찾기 모달');
})();
