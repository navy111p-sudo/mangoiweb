// ═══════════════════════════════════════════════════════════════
// adm-s11.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  if (window.__ph97) return;
  window.__ph97 = true;

  // [ph97-감도보정 2026-06-12] 드래그로 발생한 클릭 무시 + 연속클릭 디바운스
  var __pdX=0, __pdY=0, __lastAct=0;
  window.addEventListener('pointerdown', function(e){ __pdX=e.clientX; __pdY=e.clientY; }, true);
  function __deliberate(e){
    var dx=Math.abs(e.clientX-__pdX), dy=Math.abs(e.clientY-__pdY);
    if (dx>12 || dy>12) { console.log('[ph97] 클릭 무시: 드래그 중 ('+dx+','+dy+'px)'); return false; }
    var now=Date.now();
    if (now-__lastAct < 350) { console.log('[ph97] 클릭 무시: 너무 빠른 연속 클릭'); return false; }
    __lastAct=now; return true;
  }

  // 글로벌 capture-phase click — 어떤 stopPropagation 도 막을 수 없음
  window.addEventListener('click', function(e){
    /* 🔴 (2026-08-06) ▸ 손자 메뉴 토글만은 예외로 «그냥 지나가게» 둔다.
       이 핸들러는 window 캡처라 아래 3)번에서 «.ph85-sub 안의 모든 클릭» 을 삼켜 왔다.
       ▸ 토글은 그 .ph85-sub 의 자식이라 함께 삼켜졌고, 결과적으로
       adm-r25.js 가 토글에 달아 둔 «펼치기» 리스너가 한 번도 실행되지 않았다.
       → 사이드바 손자 메뉴(ph125)를 여는 방법이 아예 없었다. 에러도 안 났다.
          ▸ 를 눌러도 «카드로 이동 + 모든 그룹 접기» 만 일어나서, 오히려 사이드바가 닫혔다.
       ⚠️ 여기서 stopPropagation 하면 안 된다 — 이벤트가 토글까지 내려가야 펼쳐진다.
       (손자 항목 .ph125-gc 자체는 .ph85-sub 의 «형제» 컨테이너 안이라 원래 안 막혔다.) */
    if (e.target.closest && e.target.closest('#ph85-sidebar .ph125-toggle')) return;
    // 1) 모두 펼치기 / 모두 접기 / 숨기기
    var btn = e.target.closest('.ph86-action-btn');
    if (btn) {
      if (!__deliberate(e)) { e.stopPropagation(); e.preventDefault(); return; }
      var act = btn.dataset.act;
      if (act === 'expand') {
        document.querySelectorAll('#ph85-sidebar .ph85-group').forEach(function(g){ g.classList.add('open'); });
        console.log('[ph97] EXPAND ALL 8 groups');
        e.stopPropagation();
        return;
      } else if (act === 'collapse') {
        document.querySelectorAll('#ph85-sidebar .ph85-group').forEach(function(g){ g.classList.remove('open'); });
        console.log('[ph97] COLLAPSE ALL 8 groups');
        e.stopPropagation();
        return;
      }
    }
    // 2) 그룹 헤더 — 아코디언(한 번에 하나만 열림)
    var head = e.target.closest('#ph85-sidebar .ph85-head');
    if (head) {
      if (!__deliberate(e)) { e.stopPropagation(); e.preventDefault(); return; }
      var g = head.parentElement;
      if (g) {
        var wasOpen = g.classList.contains('open');
        document.querySelectorAll('#ph85-sidebar .ph85-group').forEach(function(x){ x.classList.remove('open'); });
        if (!wasOpen) g.classList.add('open');
        console.log('[ph97] accordion group:', (g.querySelector('.ph85-title') || {}).textContent || '?');
      }
      e.stopPropagation();
      return;
    }
    // 3) 하위 메뉴 → 카드 scroll
    var sub = e.target.closest('#ph85-sidebar .ph85-sub');
    if (sub) {
      if (!__deliberate(e)) { e.stopPropagation(); e.preventDefault(); return; }
      /* [2026-06-12] 클릭한 자식 메뉴 + 부모 그룹 head에 선택 색상 유지 */
      document.querySelectorAll('#ph85-sidebar .ph85-active').forEach(function(x){ x.classList.remove('ph85-active'); });
      sub.classList.add('ph85-active');
      var __grp = sub.closest('.ph85-group');
      if (__grp) { var __hd = __grp.querySelector('.ph85-head'); if (__hd) __hd.classList.add('ph85-active'); }
      var id = sub.dataset.card;
      if (id) {
        var c = document.getElementById(id);
        if (c) {
          var lc = document.getElementById('legacy-cards');
          if (lc) { lc.style.display = 'block'; lc.style.visibility = 'visible'; }
          c.style.display = '';
          c.style.visibility = 'visible';
          if (c.tagName === 'DETAILS') c.open = true;
          /* [2026-06-12] 손자 카드(부모 카드 안 중첩) 대응: 조상 details 전부 열기 */
          var __anc = c.parentElement;
          while (__anc) { if (__anc.tagName === 'DETAILS') __anc.open = true; __anc = __anc.parentElement; }
          setTimeout(function(){
            c.scrollIntoView({behavior:'smooth',block:'start'});
            /* 무거운 카드 렌더(수십초 프리즈)가 끝나고 첫 프레임이 그려진 뒤 펄스 시작
               — 프리즈 중에 시작하면 애니메이션이 화면 풀리기 전에 이미 끝나버림 (2026-06-12) */
            requestAnimationFrame(function(){ requestAnimationFrame(function(){
              /* content-visibility 추정 높이로 어긋난 스크롤 위치 재보정 */
              c.scrollIntoView({behavior:'auto',block:'start'});
              c.classList.remove('ph96-highlight');
              void c.offsetWidth; /* 애니메이션 재시작 */
              c.classList.add('ph96-highlight');
              setTimeout(function(){ c.classList.remove('ph96-highlight'); }, 3600);
            }); });
          }, 50);
          console.log('[ph97] NAV →', id);
        } else {
          console.warn('[ph97] card not found:', id);
          alert('미구현 카드: ' + id);
        }
      }
      // 하위 항목 선택 시 모든 그룹 자동 접기 (보기 편하게)
      document.querySelectorAll('#ph85-sidebar .ph85-group').forEach(function(x){ x.classList.remove('open'); });
      /* 🩹 (2026-08-16 사장님) 「눌러도 그 화면으로 안 간다」 두 번째 원인 —
         여기 «모바일 드로어 자동 닫기» 가 **지금 쓰는 드로어를 안 닫고 있었다.**
         지우는 클래스가 ph134-sidebar-open · ph150-open 인데, 그 두 세대는 이미 없어졌고
         실제로 열려 있는 것은 body.mga-open 이다(2026-06 교체 때 이 줄이 안 따라왔다).
         결과: 항목을 눌러 카드가 제자리로 가긴 갔는데 **드로어가 화면을 그대로 덮고 있어서**
         쓰는 사람에게는 «아무 일도 안 일어났다» 로 보였다.
         실측(390×844): 항목 클릭 3초 뒤에도 드로어=열림, overflow=hidden 이었다.

         ⚠️ 닫기를 «스크롤보다 먼저» 해야 한다. 드로어가 열린 동안 body 는 overflow:hidden 이라
            그 상태에서 scrollIntoView 를 부르면 브라우저가 통째로 무시한다.
            그래서 아래 스크롤은 닫은 «뒤» 로 미룬다(setTimeout 50ms 안).
         ⚠️ mgaClose 가 아직 정의되기 전일 수 있으니(defer 순서) 클래스 제거도 함께 한다. */
      if (window.matchMedia('(max-width: 1023px)').matches) {
        var sb = document.getElementById('ph85-sidebar');
        if (sb) sb.classList.remove('open');
        try { if (typeof window.mgaClose === 'function') window.mgaClose(); } catch (err) {}
        document.body.classList.remove('mga-open');
      }
      e.stopPropagation();
      return;
    }
  }, true);  // CAPTURE phase

  console.log('[ph97] global capture-phase click handler installed — bypass-proof');
})();
