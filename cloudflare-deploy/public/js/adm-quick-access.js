/* adm-quick-access.js — ⚡ 매니저 자주 쓰는 기능 (사이드바 맨 위 고정)  2026-07-23
 *
 * 매니저 피드백 그대로:
 *   "급하게 써야 하는 기능은 목록 맨 위에 있어야 한다. 일부가 아래쪽에 있는 걸 봤다.
 *    아래는 매니저들이 매일 하는 일들이라 쉽게 접근할 수 있어야 한다."
 *     1. 학원(대리점) 목록이 포함된 학생 목록
 *     2. 수업 관찰
 *     3. 오늘의 수업 목록
 *     4. 수업 종료 / 연장
 *     5. 수강신청 / 등록
 *
 * 기존 메뉴 트리는 그대로 두고 '바로가기'만 위에 얹는다 —
 * 메뉴 순서를 실제로 바꾸면 다른 담당자들의 화면까지 흔들리기 때문.
 */
(function () {
  'use strict';

  function isEn() {
    try { return localStorage.getItem('adminLang') === 'en'; } catch (e) { return false; }
  }

  /* card = 이동할 카드 id, sub = 그 안에서 펼칠 하위 details id(있으면) */
  var ITEMS = [
    { ko: '학생 목록 (대리점·학원)', en: 'Student list (by agency)', card: 'card-students-mgmt', sub: null,
      ico: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>' },
    { ko: '수업 관찰', en: 'Class observation', card: 'card-admin-ghost', sub: null,
      ico: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' },
    { ko: '오늘 수업 (바로 입장)', en: "Today's classes (join)", card: 'card-students-mgmt', sub: 'sm-today-classes',
      ico: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
    { ko: '수업 종료 / 연장', en: 'End / extend classes', card: 'card-active-rooms', sub: null,
      ico: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
    { ko: '수강신청 / 등록', en: 'Enrollment', card: 'card-enrollments', sub: null,
      ico: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
    /* (2026-08-08 사장님) 레벨테스트는 «교육/콘텐츠» 하위에 있어 두 번 눌러야 닿았다.
       중요한 기능이라 자주 쓰는 기능 맨 마지막에 바로가기를 얹는다 — 기존 메뉴 위치는 그대로 둔다.
       ⚠️ 라벨에 이모지를 넣지 않는다. 이 목록은 왼쪽에 SVG 아이콘을 따로 그리므로
          이모지를 같이 쓰면 «아이콘이 두 개» 로 보인다(사장님 지적, 2026-08-08). */
    { ko: '레벨테스트', en: 'Level test', card: 'card-level-tests', sub: null,
      ico: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' }
  ];

  /* 🧭 (2026-08-08) 메뉴 6그룹 개편(adm-ia6.js)이 라이브로 켜지면서 이 바로가기들이 죽었다.
     ia6 는 «고른 항목의 카드만» 남기고 나머지에 .ia6-hide(display:none !important)를 건다.
     그래서 여기서 곧바로 scrollIntoView 를 하면 **감춰진 카드로 가느라 화면이 그대로**다 —
     사장님이 「눌러도 아무 반응이 없다」고 하신 것이 이것이다. 5개 항목 전부 같은 상태였다.

     고치는 방법 — 우리가 직접 감춘 걸 되돌리지 않는다. 그건 ia6 의 상태를 몰래 어긋내고,
     인라인 style 로는 !important 를 이기지도 못한다. 대신 **그 항목의 사이드바 버튼을 대신 눌러 준다.**
     그러면 ia6 자신의 로직(감춘 것 복원 + 대표 카드 펼치기 + 3단 스크롤 보정 + 선택 강조)이
     그대로 돌고, ia6 를 끄면 아래 옛 경로로 저절로 폴백한다.

     버튼은 한글 키(`student:레벨테스트`)가 아니라 **data-card 로** 찾는다.
     항목 이름이 바뀌어도 안 깨지게 하려는 것이다. */
  function ia6Btn(cardId) {
    try {
      return document.querySelector('#ph85-sidebar [data-ia6-item][data-card="' + cardId + '"]');
    } catch (e) { return null; }
  }

  /* 카드로 이동 + 펼치기 + 잠깐 강조.
     ⚠ 스크롤은 'auto' — 부드러운 스크롤을 시작만 하고 끊으면 멀미가 난다는 지적이 이미 있었다. */
  window.ph161Go = function (cardId, subId) {
    /* ① ia6(6그룹 메뉴)가 켜져 있으면 그쪽에 맡긴다 — 위 주석 참고 */
    var btn = ia6Btn(cardId);
    if (btn) {
      btn.click();                      // ia6 의 window 캡처 위임이 받는다
      if (subId) {
        /* 하위 details 가 목표면 ia6 의 스크롤 보정(0·60·260ms)이 끝난 뒤에 다시 잡는다.
           먼저 잡으면 ia6 가 곧바로 대표 카드 맨 위로 되돌려 놓는다. */
        setTimeout(function () {
          var s = document.getElementById(subId);
          if (!s) return;
          if (s.tagName === 'DETAILS') s.open = true;
          try { s.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {}
          flash(s);
        }, 320);
      }
      closeMobileNav();
      return;
    }

    /* ② ia6 가 없을 때(옛 9그룹 메뉴) — 예전 그대로 */
    var c = document.getElementById(cardId);
    if (!c) { return; }
    /* ia6 는 없는데 감춤 클래스만 남아 있는 어중간한 상태에 대한 보험 */
    try {
      var n = c;
      while (n && n !== document.body) { n.classList.remove('ia6-hide'); n = n.parentElement; }
    } catch (e) {}
    try { if (c.tagName === 'DETAILS') c.open = true; } catch (e) {}
    if (subId) {
      var s = document.getElementById(subId);
      if (s && s.tagName === 'DETAILS') {
        s.open = true;
        /* 하위 항목이 목표면 그 위치로 — 카드 맨 위로 가면 또 찾아 내려가야 한다 */
        try { s.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {}
        flash(s);
        closeMobileNav();
        return;
      }
    }
    try { c.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {}
    flash(c);
    closeMobileNav();
  };

  function flash(el) {
    try {
      var o = el.style.boxShadow;
      el.style.boxShadow = '0 0 0 3px rgba(251,191,36,0.6)';
      setTimeout(function () { el.style.boxShadow = o; }, 1100);
    } catch (e) {}
  }

  /* 모바일에선 사이드바가 화면을 덮으므로, 이동했으면 닫아준다 */
  function closeMobileNav() {
    try { if (window.mgaClose) window.mgaClose(); } catch (e) {}
  }

  function render() {
    var box = document.getElementById('ph161-quick-items');
    if (!box) return;
    var en = isEn();
    box.innerHTML = ITEMS.map(function (it, i) {
      /* 실제로 존재하는 카드만 보여준다 — 죽은 바로가기는 신뢰를 깎는다 */
      if (!document.getElementById(it.card)) return '';
      var label = en ? it.en : it.ko;
      return '<div class="ph161-q" role="button" tabindex="0"'
        + ' data-ko="' + it.ko + '" data-en="' + it.en + '"'
        + ' onclick="event.stopPropagation();ph161Go(\'' + it.card + '\',' + (it.sub ? "'" + it.sub + "'" : 'null') + ')"'
        + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click();}"'
        + ' style="display:flex;align-items:center;gap:9px;padding:9px 12px;cursor:pointer;color:#fde68a;font-size:13px;font-weight:700;border-top:' + (i ? '1px solid rgba(251,191,36,0.14)' : '0') + ';min-width:0;overflow-wrap:anywhere">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="flex:none">' + it.ico + '</svg>'
        + '<span style="flex:1">' + label + '</span>'
        + '</div>';
    }).join('');
  }

  function boot() {
    render();
    /* 언어 토글 후에도 라벨이 따라오도록 (관리자 i18n 은 data-ko/data-en 을 훑는다) */
    try {
      window.addEventListener('storage', function (e) {
        if (e && e.key === 'adminLang') render();
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 사이드바가 나중에 다시 그려지는 경우가 있어, 비어 있으면 한 번 더 채운다 */
  setTimeout(function () {
    var box = document.getElementById('ph161-quick-items');
    if (box && !box.children.length) render();
  }, 1200);
})();
