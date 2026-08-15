// ═══════════════════════════════════════════════════════════════════════════
// adm-identity.js — 관리자 «누가 로그인했나» 단일 출처 (2026-08-15)
//
// [무슨 문제였나]
//   관리자 화면 우측(현재는 사이드바 도크)의 계정 버튼은 localStorage 의
//   admin_session 을 읽는데, 그게 비어 있으면 각 파일이 «자기가 아는 사람» 으로
//   메꾸고 있었다. 그 값이 하필 실명이었다:
//     js/adm-q9.js  · js/adm-r19.js · js/adm-r20.js · js/adm-r21.js
//     → { uid:'hq_mgr', name:'정우영', email:'navy111p@gmail.com', branch:'본사' }
//   더 나쁜 건 그 fallback 을 saveUser() 로 localStorage 에 «써 버려서», 한 번
//   그렇게 뜨면 다음부터는 진짜 세션처럼 보였다는 점이다. 결과적으로 지사·대리점·
//   강사 계정으로 로그인해도 화면에는 「정우영 관리자」가 뜰 수 있었다.
//
// [무엇을 바꾸나]
//   서버(/api/admin/me)를 유일한 출처로 삼는다. 응답이 오면 기존 읽기 코드가
//   그대로 쓰도록 localStorage.admin_session 에 «진짜» 값을 채워 준다.
//   그래서 각 파일의 fallback 은 «평소에 아예 안 쓰이는» 길이 된다.
//   그 위에 각 파일의 실명 fallback 도 중립 문구로 바꿨다(2차 방어).
//
// [모르면 모른다고 한다]
//   조회에 실패하면 아무 이름도 지어내지 않는다. window.admIdentity() 가 null 을
//   돌려주고, 화면은 «계정 확인 중…» 으로 남는다. 틀린 이름을 띄우는 것보다 낫다.
//
// [자기 자신을 덮지 않기]
//   admin_session 에는 개발용 역할 전환(ph115SwitchRole 등)이 쓴 값이 들어올 수
//   있다. 서버 응답이 오면 그쪽이 이긴다 — 서버가 권위다.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__admIdentityBooted) return;
  window.__admIdentityBooted = true;

  var KEY = 'admin_session';
  var cache = null;          // 서버가 확인해 준 신원. 확인 전이면 null.

  // 화면이 «아직 모른다» 를 표시할 때 쓰는 문구. 실명이 아니어야 한다.
  window.ADM_IDENTITY_PENDING = '계정 확인 중…';

  /** 서버가 확인해 준 신원. 아직 못 받았으면 null.
   *  ⚠️ null 일 때 실명을 지어내지 말 것 — 이 파일이 생긴 이유가 그거다. */
  window.admIdentity = function () {
    if (cache) return cache;
    // 서버 응답 전이라도 이전 방문에서 저장된 «서버 출처» 값이 있으면 쓴다.
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.__fromServer) return raw;
    } catch (e) {}
    return null;
  };

  /** 화면 표시용 — 신원을 모르면 중립 문구가 든 객체를 돌려준다(이름 조작 금지). */
  window.admIdentityOrPending = function () {
    return window.admIdentity() || { uid: '', name: window.ADM_IDENTITY_PENDING, email: '', phone: '', branch: '' };
  };

  function normalize(j) {
    var u = (j && j.user) || {};
    var uid = u.username || '';
    return {
      uid: uid,
      name: u.name || uid || '',
      email: u.email || '',
      phone: u.phone || '',
      // 스코프 라벨(본사/지사/대리점…)이 «소속» 자리에 가장 알맞다.
      branch: (j && j.scope && j.scope.label) || '',
      role: (j && j.role) || '',
      roleLabel: (j && j.roleLabel) || '',
      lastLogin: '',
      __fromServer: true          // admIdentity() 가 «지어낸 값» 과 구별하는 표식
    };
  }

  function publish(id) {
    cache = id;
    try { localStorage.setItem(KEY, JSON.stringify(id)); } catch (e) {}
    try { window.__ADM_ME = id; } catch (e) {}
    // 이미 그려진 버튼들이 다시 그리도록 알린다.
    // (ph115 등은 1.5 초마다 스스로 다시 그리기도 하지만, 그때까지 기다릴 이유가 없다)
    try { document.dispatchEvent(new CustomEvent('mangoi:identity', { detail: id })); } catch (e) {}
  }

  function load() {
    // credentials:'include' 필수 — 관리자 세션은 admin_sessions 쿠키다(토큰 아님).
    // CLAUDE.md 「로그인했는데 또 로그인하래요」 항목 참고.
    fetch('/api/admin/me', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || !j.user) return;    // 미로그인·실패 — 아무것도 지어내지 않는다
        publish(normalize(j));
      })
      .catch(function () { /* 네트워크 실패도 마찬가지 — 조용히 모른 채로 둔다 */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
