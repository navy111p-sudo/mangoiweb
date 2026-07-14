// ═══════════════════════════════════════════════════════════════
// adm-scope-guard.js — 대리점(agency)·지사(branch) 계정 콘솔 403 폭주 방지 (2026-07-14)
//
//   문제: 비-본사 계정으로 admin.html 진입 시, 프런트가 본사 전용 API ~15종을
//         그대로 초기 fetch → 서버 default-deny(index.ts isAgencyAllowedApi)가
//         403 을 돌려주고 브라우저 네트워크 콘솔에 에러가 수십 개 쌓임.
//         (권한 차단 자체는 정상 — 시끄러운 게 문제)
//
//   해결: window.fetch 를 최상단에서 감싸, 비-본사 역할일 때
//         서버 허용목록(isAgencyAllowedApi 미러) 밖의 /api/admin/* 요청은
//         네트워크에 내보내지 않고 서버와 동일한 403 JSON 을 합성해 반환.
//         → 브라우저 네트워크 에러 0, 기존 로더는 d.ok=false 경로로
//           '권한 없음' 빈 상태를 그대로 렌더(조용한 처리).
//
//   ⚠️ 서버 게이트(src/index.ts + scope.ts)가 항상 권위 — 이 파일은 소음 제거용.
//      허용목록을 서버(index.ts isAgencyAllowedApi)와 반드시 동기화할 것.
//   ⚠️ 본사(exec/mgr)·교사·학부모·학생 역할에는 아무 것도 하지 않는다(가드 비활성).
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  if (window.__admScopeGuard) return;   // 중복 설치 방지

  // ── 서버 index.ts isAgencyAllowedApi 미러(prefix/exact 판정도 서버와 동일) ──
  var ALLOW = [
    '/api/admin/exec/', '/api/admin/realtime/', '/api/admin/stats/',
    '/api/admin/students/unified', '/api/admin/students/erp-list',
    '/api/admin/me', '/api/admin/profile', '/api/admin/logout',
    '/api/admin/change-password', '/api/admin/login-history', '/api/admin/sessions',
    '/api/admin/health-check', '/api/admin/omnisearch',
    '/api/admin/settlement/',
    // 게이트 밖 경로(항상 통과) — isAuthPublicPath·isAdminPublicApi 미러
    '/api/admin/login',
    '/api/admin/ai-analyze/student'
  ];
  function isAllowed(path){
    for (var i = 0; i < ALLOW.length; i++) {
      if (path === ALLOW[i] || path.indexOf(ALLOW[i]) === 0) return true;
    }
    return false;
  }

  // ── 역할 판정 — adm-q10.js getCurrentRole 과 동일 규칙의 축약판 ──
  //    (이 파일이 adm-q10 보다 먼저 로드되므로 자체 판정. 비-본사만 관심)
  function guardRole(){
    var u = null;
    try { u = JSON.parse(localStorage.getItem('mangoi_admin_session') || 'null'); } catch(e){}
    if (!u || !u.uid) { try { u = JSON.parse(localStorage.getItem('admin_session') || 'null'); } catch(e){} }
    if (!u || !u.uid) return null;
    if (String(u.uid) === 'admin') return null;          // 오너는 항상 본사
    var role = String(u.role || '').toLowerCase();
    if (role === 'agency') return 'agency';
    if (role === 'branch' || role === 'franchise') return 'branch';
    if (role) return null;                               // 명시된 다른 역할 → 본사/기타
    // role 미기재 세션 — uid 접두사 폴백(login.html ph239 와 동일 관례)
    var uid = String(u.uid);
    if (uid.indexOf('agency_') === 0) return 'agency';
    if (uid.indexOf('branch_') === 0) return 'branch';
    return null;
  }

  var role = guardRole();
  var blocked = {};   // path → 차단 횟수 (디버깅용)
  window.__admScopeGuard = { active: !!role, role: role, blocked: blocked };
  if (!role) return;  // 본사·교사 등 → 원래 fetch 그대로

  var origFetch = window.fetch;
  window.fetch = function(input, init){
    try {
      var raw = (input && typeof input === 'object' && input.url) ? input.url : String(input);
      var u = new URL(raw, location.origin);
      if (u.origin === location.origin
          && u.pathname.indexOf('/api/admin/') === 0
          && !isAllowed(u.pathname)) {
        var p = u.pathname;
        if (!blocked[p]) {
          blocked[p] = 0;
          console.info('[scope-guard] 본사 전용 API 호출 스킵(' + role + '): ' + p);
        }
        blocked[p]++;
        // 서버 403 응답과 동일 형태 + 로더들이 흔히 읽는 필드(items 등) 빈값 동봉
        var body = JSON.stringify({
          ok: false, error: '권한 없음(본사 전용)', forbidden_scope: true,
          scope: role, client_skipped: true, items: [], counts: {}
        });
        return Promise.resolve(new Response(body, {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        }));
      }
    } catch(e){ /* URL 파싱 실패 등 — 원래 fetch 로 폴백 */ }
    return origFetch.apply(this, arguments);
  };

  console.info('[scope-guard] ' + (role === 'agency' ? '대리점' : '지사') +
    ' 계정 — 본사 전용 /api/admin/* 사전 차단 활성(콘솔 403 소음 제거)');
})();
