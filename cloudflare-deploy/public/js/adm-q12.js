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

  /* 🔑 비밀번호 찾기 — 2026-08-17 정직화.
     예전에는 SMS·카카오·이메일 3갈래 입력폼을 보여 주고, 눌러도 서버로 **아무것도 보내지 않은 채**
     "✅ 임시 비밀번호가 010-… 으로 발송되었습니다" 라고 완료를 단언했다. 뒤에 «※ 시연 화면» 이
     붙어 있었지만 앞의 ✅ 가 먼저 읽힌다 — 실제로 문자를 기다리다 못 받는 사람이 생긴다.
     서버에 관리자용 비번찾기 API 가 아예 없다(`/api/admin/password-reset/*` 부재.
     학생·학부모용 `/api/student/password-reset/*` 만 있다).
     → 없는 기능을 있는 척하지 않는다. 실제로 되는 두 가지만 남긴다.
     ⚠️ 자동 재설정을 붙이려면 **서버 API 부터** 만들어야 한다. 여기에 「보낸 척」 alert 를 다시 넣지 말 것. */
  var PH132_MAIL = 'navy111p@gmail.com';

  function ph132BuildModal(){
    if (document.getElementById('ph132-forgot-modal')) return;
    var m = document.createElement('div');
    m.id = 'ph132-forgot-modal';
    m.innerHTML =
      '<div class="ph132-modal-card" onclick="event.stopPropagation()">' +
        '<div style="text-align:center;margin-bottom:14px">' +
          '<div style="font-size:32px;margin-bottom:4px">🔑</div>' +
          '<h2 style="margin:0;font-size:18px;color:#0f172a">비밀번호 찾기</h2>' +
          '<p style="margin:4px 0 0;font-size:12px;color:#64748b">등록된 연락처로 인증번호를 받아 직접 재설정할 수 있습니다.</p>' +
        '</div>' +
        /* 🔑 (2026-08-17) 셀프 재설정 추가. 로직은 /js/adm-pw-reset.js 한 곳에만 둔다 —
           여기에 복사하지 말 것(그렇게 네 벌이 됐다가 사고를 냈다, PR #173). */
        '<button type="button" class="ph132-submit" id="ph132-self-reset">📨 인증번호로 직접 재설정</button>' +
        '<p style="font-size:11px;color:#94a3b8;margin:9px 0 14px;line-height:1.5">' +
          '※ 계정에 연락처(휴대폰·이메일)가 등록돼 있어야 받을 수 있습니다.<br>' +
          '※ 연락처가 없으면 아래 운영자 문의로 요청해 주세요.</p>' +
        '<div style="padding:14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;margin-bottom:12px">' +
          '<div style="font-size:13px;color:#0c4a6e;font-weight:700;margin-bottom:4px">📧 운영자 이메일</div>' +
          '<div style="font-size:14px;color:#0369a1;font-family:MangoiHanSC,Consolas,monospace">' + PH132_MAIL + '</div>' +
        '</div>' +
        '<button type="button" class="ph132-submit" id="ph132-mail-btn">📨 메일 작성하기</button>' +
        '<p style="font-size:11px;color:#94a3b8;margin:10px 0 0;line-height:1.5">' +
          '※ 아이디·소속·연락처를 함께 적어 주시면 빠른 처리가 가능합니다.</p>' +
        '<div style="margin-top:12px;padding:11px 13px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:11.5px;color:#78350f;line-height:1.6">' +
          '💡 <b>강사·해외 스태프</b>(mangoi_… · hq_t… 계정)는 본사 관리자가 관리자 화면에서 ' +
          '바로 재설정해 줄 수 있습니다. 담당 매니저에게 요청하세요.</div>' +
        '<button type="button" id="ph132-modal-close" style="width:100%;margin-top:14px;padding:9px;background:#f3f4f6;color:#374151;border:0;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">닫기</button>' +
      '</div>';
    m.onclick = function(e){ if (e.target === m) ph132CloseForgot(); };
    document.body.appendChild(m);

    m.querySelector('#ph132-modal-close').onclick = ph132CloseForgot;
    m.querySelector('#ph132-self-reset').onclick = function(){
      if (!window.mangoiPwReset){
        alert('비밀번호 찾기 화면을 불러오지 못했습니다.\n새로고침 후 다시 시도해 주세요.');
        return;
      }
      var uidEl = document.getElementById('admin-login-uid') || document.getElementById('admin-login-id');
      ph132CloseForgot();
      window.mangoiPwReset.open((uidEl && uidEl.value || '').trim());
    };
    m.querySelector('#ph132-mail-btn').onclick = function(){
      var subject = encodeURIComponent('[망고아이 관리자] 비밀번호 재설정 문의');
      var body = encodeURIComponent('안녕하세요,\n\n관리자 페이지 비밀번호를 잊어버려 문의드립니다.\n\n· 아이디: \n· 소속: \n· 연락처: \n· 사유: \n\n감사합니다.');
      location.href = 'mailto:' + PH132_MAIL + '?subject=' + subject + '&body=' + body;
    };
  }

  function ph132OpenForgot(){
    ph132BuildModal();
    document.getElementById('ph132-forgot-modal').style.display = 'flex';
  }

  function ph132CloseForgot(){
    var m = document.getElementById('ph132-forgot-modal');
    if (m) m.style.display = 'none';
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
