/* ════════════════════════════════════════════════════════════════════════════
   🧾 결재 대기 알림 — 관리자 사이드바 「결재함」 배지 (2026-08-16 · 2026-09-09 defer 파일로 분리)

   왜 admin.html 인라인이 아니라 «이 파일» 인가 (2026-09-09)
     first_paint_budget_harness 가 admin.html 의 blocking(인라인 script 포함)을 재는데
     여유가 2KB 뿐이었다(305KB 기준선 + 12KB slack, main 실측 315KB). 1분 주기 갱신·지연 색을
     더하는 순간 넘쳤다. 규칙(CLAUDE.md 2장 「index.html 에 한 줄 더했는데 첫 화면 예산이 FAIL」)대로
     별도 파일 + defer 로 뺐다 — 기준선을 올리는 것은 마지막 수단이다.
     ⚠️ /js 루트에 둔다(/admin/ 밑은 로그인 게이트가 자산까지 삼킨다 — 2장 「/admin/ 밑에 새 화면을
        만들면서 js·css 를 같이 넣음」). CSS(<style id="ia6-appr-css">)는 admin.html 에 그대로 있다.
     ⚠️ 이 파일을 고치면 admin.html 의 ?v= 를 함께 올려야 한다(asset_version_harness 가 잡는다).

   왜 «자체 완결» 인가 (2026-08-16)
     admin.html 은 1MB 다. 기존 레이아웃·메뉴 체계를 건드리면 사고 반경이 서비스 전체가 된다.
     그래서 **아무것도 참조하지 않는 블록 하나**로 끝냈다 —
     admin.html 의 CSS·JS·i18n·메뉴 어느 것에도 의존하지 않는다(읽는 전역은 window.adminLang 하나).

   하는 일은 딱 하나: «결재 N건(지연 N · N일째)» 을 보여 주고 누르면 /work 로 보낸다.
     ⚠️ 결재 목록·승인 버튼을 여기에 만들지 말 것. 그러면 화면이 두 벌이 되고,
        전용 경량 화면(/work)을 만든 이유가 사라진다.
     ⚠️ 첫 조회는 첫 화면과 경쟁하지 않게 3초 뒤. 그 뒤 1분마다(숨은 탭은 건너뜀) + 탭 복귀·포커스 때
        한 번 더(5초 안 중복은 합침) — 2026-09-09 사장님 「A+B로 진행해」(A 실시간 배지 · B 지연 색).
     ⚠️ hover 확대·애니메이션 없음(CLAUDE.md 1-3). 새 도착 표시(.fresh)는 outline 색 1.5초뿐.
     감시: test-harness/approval_sidebar_badge_live_harness.mjs (이 파일을 가짜 DOM 에서 실제로 돌린다)
   ════════════════════════════════════════════════════════════════════════════ */
(function(){
  "use strict";
  /* ⚠️ 대기가 0건이어도 **입구는 늘 보여 준다.**
     처음엔 «0건이면 그리지 않는다» 였는데, 그러면 한국 본사(대표·담당)가 결재를
     **올리러** 들어갈 방법이 화면에 없다 — 주소를 외워야 한다.
     이 프로젝트가 없애려던 «찾아 들어가야 한다» 가 그대로 되살아난다.
     대신 0건일 때는 조용한 회색으로 두어 «알림» 이 아니라 «메뉴» 로 읽히게 한다. */
  /* ⚠️ 오른쪽 아래에 «떠 있게» 두지 않는다 — 그 자리는 이미 「AI 운영비서」 버튼과
     상담원 아바타가 차지하고 있어서 그 뒤에 가려진다(2026-08-17 사장님 화면에서 확인).
     대신 본문 **맨 위**(자주 쓰는 기능 바로 위)에 한 줄로 끼워 넣는다.
     흐름 안에 있으므로 무엇에도 가려지지 않고, 눈이 처음 닿는 자리다. */
  /* 🧾 (2026-08-20) 초록 줄을 **없앴다.**
     [왜] 처음엔 「어디에도 안 보인다」(2026-08-17)를 급히 풀려고 「자주 쓰는 기능」 상자
          «위» 에 흐름 안 요소로 끼워 넣었다. 그때는 그것이 유일한 입구였다.
          지금은 ① 사이드바 맨 위 「결재함」 ② 이 「자주 쓰는 기능」 표 첫 칸 두 곳이 있어
          초록 줄까지 두면 같은 입구가 셋이고, 표 밖에 혼자 떠 있어 어색했다(사장님 지적).
     [대신] 표의 「결재함」 칸에 **숫자만** 붙인다. 칸 자체는 adm-quick-access.js 가 그린다.
     ⛔ 여기서 결재 목록·승인 버튼을 만들지 말 것 — 화면이 두 벌이 되고 /work 를 만든 이유가 사라진다. */
  /* 🧾 사이드바 맨 위 「결재함」 줄의 숫자. 요소는 adm-ia6.js 가 그리는데 **나중에 다시 그릴 수**
     있으므로(사이드바를 통째로 새로 그리는 스크립트가 여럿이다) 숫자를 기억해 뒀다가 다시 입힌다.
     ⚠️ 여기서 API 를 또 부르지 않는다 — 첫 화면에서 같은 요청이 두 번 나간다. */
  /* 🧾 (2026-09-09 A+B — 사장님 「결재가 뜨면 여기 결재카드에 표시가 나게」)
     [잰 것] 배지·초록 켜짐은 이미 있었고, 빠진 것은 ① 화면을 연 뒤 3초에 «한 번만» 조회해
       열어 둔 사이 도착한 건이 새로고침 전까지 안 뜨던 것 ② 지연이 «자주 쓰는 기능» 칸의 마우스
       툴팁에만 있어 폰에서 못 보던 것 ③ 결재함 <a> 에 달린 data-ko/data-en 이 EN/KO 토글 때
       배지 요소를 지우던 것(adm-ia6.js 에서 함께 고침).
     [A] 60초마다 + 탭 복귀·창 포커스 때 다시 묻는다. 숨은 탭에서는 묻지 않는다.
         새 건이 «늘어난 순간» 만 1.5초 노란 테두리(.fresh) — 색만, 반복 없음.
     [B] 단계 기한(stage_due_at)이 지난 건이 하나라도 있으면 줄이 빨강(.late) + 「지연 N · N일째」.
         「며칠째」는 화면이 센다(서버가 담으면 응답이 매초 달라져 ETag 304 가 영영 안 나온다).
     ⛔ 판정은 apprSummary 하나 — 하니스가 오려 내 실제로 돌린다(approval_sidebar_badge_live_harness). */
  var POLL_MS = 60000;                 // 관리자 1명당 시간에 60회. /api/approval/home 은 ETag 304 라 대부분 본문 없이 끝난다.
  var DAY_MS = 86400000;
  function apprSummary(inbox, now){
    var list = Array.isArray(inbox) ? inbox : [];
    var late = 0, days = 0;
    for (var i = 0; i < list.length; i++) {
      var x = list[i] || {};
      if (x.stage_due_at && now > Number(x.stage_due_at)) late++;
      /* work.html 의 daysWaiting 과 같은 기준 — 회수하고 다시 올린 건은 «원래 올린 날» 부터. */
      var base = Number(x.origin_created_at || 0) || Number(x.created_at || 0);
      if (base > 0) { var d = Math.floor((now - base) / DAY_MS); if (d > days) days = d; }
    }
    return { n: list.length, late: late, days: days };
  }
  function apprSubText(s, en){
    if (!s || s.late <= 0) return '';
    var dayTxt = s.days <= 0 ? (en ? 'today' : '오늘')
                             : (en ? (s.days + (s.days === 1 ? ' day' : ' days')) : (s.days + '일째'));
    return (en ? '· late ' : '· 지연 ') + s.late + ' · ' + dayTxt;
  }
  var apprS = null, apprPrevN = null;
  function paintSidebar(s){
    if (s && typeof s.n === 'number') apprS = s;
    if (!apprS) return;
    var row = document.getElementById('ia6-appr');
    if (!row) return;
    var apprN = apprS.n;
    var el = document.getElementById('ia6-appr-n');
    if (el) el.textContent = apprN > 0 ? String(apprN) : '';
    var sub = document.getElementById('ia6-appr-sub');
    if (sub) sub.textContent = apprSubText(apprS, window.adminLang === 'en');
    /* contains 로 먼저 확인 — 값이 그대로면 class 속성을 다시 쓰지 않는다(CLAUDE.md body-class 관찰자 함정의 형제). */
    if (row.classList.contains('on') !== (apprN > 0)) row.classList.toggle('on', apprN > 0);
    if (row.classList.contains('late') !== (apprS.late > 0)) row.classList.toggle('late', apprS.late > 0);
  }
  function noteArrival(n){
    if (apprPrevN !== null && n > apprPrevN) {
      var row = document.getElementById('ia6-appr');
      if (row && !row.classList.contains('fresh')) {
        row.classList.add('fresh');
        setTimeout(function(){ row.classList.remove('fresh'); }, 1500);
      }
    }
    apprPrevN = n;
  }
  // 사이드바가 다시 그려져도 숫자가 사라지지 않게 — 가볍게 되입힌다(요청 없음).
  setInterval(function(){ paintSidebar(); }, 4000);

  function paintQuick(n, late){
    var row = document.querySelector('#ph161-quick-items .ph161-q[data-qa="결재함"]');
    if (!row) return false;
    var b = row.querySelector('.mi-appr-n');
    if (!b) {
      b = document.createElement('span');
      b.className = 'mi-appr-n';
      /* 인라인으로 쓴다 — 이 표의 다른 칸도 전부 인라인 style 이고, 그래야 이 블록이
         admin.html 의 CSS 에 아무것도 기대지 않는다(이 파일 1MB, 사고 반경을 줄인다). */
      b.style.cssText = 'flex:none;margin-left:6px;background:#c0392b;color:#fff;'
        + 'font-size:11px;font-weight:800;min-width:18px;height:18px;border-radius:9px;'
        + 'display:flex;align-items:center;justify-content:center;padding:0 5px';
      row.appendChild(b);
    }
    b.textContent = n > 0 ? String(n) : '';
    b.style.display = n > 0 ? 'flex' : 'none';
    b.title = late ? ('지연 ' + late + '건') : '';
    return true;
  }

  var loading = false, lastLoadAt = 0;
  function load(){
    /* 숨은 탭에서는 묻지 않는다 — 돌아오는 순간(visibilitychange) 한 번 묻는다.
       5초 안의 중복 호출(포커스+복귀가 겹칠 때)은 한 번으로 합친다. */
    if (document.hidden || loading) return;
    if (Date.now() - lastLoadAt < 5000) return;
    loading = true; lastLoadAt = Date.now();
    fetch('/api/approval/home', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if (!j || !j.ok || !j.inbox) return;
        var s = apprSummary(j.inbox, Date.now());
        paintSidebar(s);
        noteArrival(s.n);
        /* 「자주 쓰는 기능」 표는 adm-quick-access.js 가 나중에 그릴 수 있다.
           아직 없으면 잠깐 뒤 다시 — 못 붙였는데 조용히 넘어가면 숫자가 영영 안 뜬다. */
        if (!paintQuick(s.n, s.late)) {
          var tries = 0;
          var iv = setInterval(function(){
            if (paintQuick(s.n, s.late) || ++tries > 20) clearInterval(iv);
          }, 500);
        }
      })
      .catch(function(){ /* 결재를 못 불러온 것이 관리자 화면을 망치지 않는다 */ })
      .then(function(){ loading = false; });
  }
  setTimeout(load, 3000);              // 첫 화면과 경쟁하지 않게 — 첫 조회는 여전히 3초 뒤
  setInterval(load, POLL_MS);          // 그 뒤로는 1분마다 (숨은 탭이면 load 가 스스로 건너뜀)
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) load(); });
  window.addEventListener('focus', function(){ load(); });
})();
