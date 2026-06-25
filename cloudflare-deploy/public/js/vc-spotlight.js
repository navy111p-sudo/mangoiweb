/* ============================================================
   vc-spotlight.js  -  1:3(그룹) 수업 선생님 스포트라이트 (플래그 게이트, 기본 OFF)
   - 켜는 법: URL 에 ?spotlight=1  또는  localStorage 'mangoi_spotlight'='1'
   - 켜져 있을 때만 body.vc-spotlight 클래스를 붙여 CSS 레이아웃 적용
   - 역할(role)은 join-room 으로 교환되어 각 영상 박스의 data-role 에 들어감
   - 추가형: 꺼져 있으면 기존 동작과 100% 동일. 문제 시 이 <script> 한 줄 제거로 원복
   ============================================================ */
(function () {
  'use strict';
  try {
    window.vcPeerRoles = window.vcPeerRoles || {};

    // 내 역할: 로그인 사용자 정보 → 없으면 student
    function myRole() {
      try { var r = localStorage.getItem('mangoi_user_role'); if (r) return r; } catch (e) {}
      try { if (window.MangoV3 && window.MangoV3.user && window.MangoV3.user.role) return window.MangoV3.user.role; } catch (e) {}
      return 'student';
    }
    window.vcMyRole = myRole();

    // 스포트라이트 플래그 (기본 OFF)
    function flagOn() {
      try { if (/[?&]spotlight=1/.test(location.search)) return true; } catch (e) {}
      try { if (localStorage.getItem('mangoi_spotlight') === '1') return true; } catch (e) {}
      return false;
    }
    function applyFlag() {
      if (!document.body) return;
      document.body.classList.toggle('vc-spotlight', flagOn());
    }

    // 영상 박스들에 역할 반영 + 플래그 적용 (입장/참가자 변동 시 호출됨)
    window.vcApplySpotlight = function () {
      try {
        applyFlag();
        var local = document.getElementById('vc-local-box');
        if (local) local.dataset.role = window.vcMyRole || 'student';
        Object.keys(window.vcPeerRoles || {}).forEach(function (uid) {
          var b = document.getElementById('vc-video-' + uid);
          if (b) b.dataset.role = window.vcPeerRoles[uid] || 'student';
        });
      } catch (e) {}
    };

    if (document.readyState !== 'loading') applyFlag();
    else document.addEventListener('DOMContentLoaded', applyFlag);
  } catch (e) {
    console.warn('[vc-spotlight] init fail', e);
  }
})();
