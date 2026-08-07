/* ============================================================
   vc-spotlight.js  -  1:3(그룹) 수업 선생님 스포트라이트 (기본 ON + 안전장치)
   - 선생님(role=teacher)이 실제로 감지될 때만 켜짐 → #vc-video-grid.vc-has-teacher
   - 선생님 감지 실패 시 자동으로 기존 그리드로 동작 (안전)
   - 끄는 법: URL ?spotlight=0  또는  localStorage 'mangoi_spotlight'='0'
   - 추가형: 문제 시 이 <script> + vc-refresh.css 링크만 빼면 즉시 원복
   ============================================================ */
(function () {
  'use strict';
  try {
    window.vcPeerRoles = window.vcPeerRoles || {};

    /* 🎭 (2026-08-08 강사 피드백 Teacher Ana ①) 「먼저 들어온 학생이 강사가 된다」의 **출발점**.
       이 파일은 페이지가 뜨자마자 `window.vcMyRole` 을 **덮어썼다.** 그것도
       주인 없는 localStorage 값으로. 공용 PC 에 강사가 한 번 들어갔다 나가면 그 값이 남고,
       다음에 들어온 학생은 로그인 확인을 하기도 전에 «강사» 가 된 채로 수업에 들어갔다
       (그 상태로 join-room 이 나가면 서버 로스터에도 강사로 박힌다).
       ① 주인(uid) 확인을 거친 값만 쓰고
       ② 이미 정해진 역할이 있으면 **덮어쓰지 않는다** — 여기는 «없을 때 채우는» 자리다. */
    function myRole() {
      try { if (typeof window.vcRoleStored === 'function') { var s = window.vcRoleStored(); if (s) return s; } }
      catch (e) {}
      try { if (window.MangoV3 && window.MangoV3.user && window.MangoV3.user.role) return window.MangoV3.user.role; } catch (e) {}
      return 'student';
    }
    if (!window.vcMyRole) window.vcMyRole = myRole();

    // 명시적 OFF 스위치 (기본은 ON)
    function disabled() {
      try { if (/[?&]spotlight=0/.test(location.search)) return true; } catch (e) {}
      try { if (localStorage.getItem('mangoi_spotlight') === '0') return true; } catch (e) {}
      return false;
    }

    // 영상 박스들에 역할 반영 + 선생님 감지 시에만 스포트라이트 활성화
    window.vcApplySpotlight = function () {
      try {
        var local = document.getElementById('vc-local-box');
        if (local) local.dataset.role = window.vcMyRole || 'student';

        var hasTeacher = (window.vcMyRole === 'teacher');
        Object.keys(window.vcPeerRoles || {}).forEach(function (uid) {
          var role = window.vcPeerRoles[uid] || 'student';
          var b = document.getElementById('vc-video-' + uid);
          if (b) b.dataset.role = role;
          if (role === 'teacher') hasTeacher = true;
        });

        var grid = document.getElementById('vc-video-grid');
        if (grid) grid.classList.toggle('vc-has-teacher', hasTeacher && !disabled());
      } catch (e) {}
    };

    // 참가자 변동 외에도 주기적으로 한 번 더 반영(역할 늦게 도착 대비)
    if (document.readyState !== 'loading') { try { window.vcApplySpotlight(); } catch (e) {} }
    else document.addEventListener('DOMContentLoaded', function () { try { window.vcApplySpotlight(); } catch (e) {} });
  } catch (e) {
    console.warn('[vc-spotlight] init fail', e);
  }
})();
