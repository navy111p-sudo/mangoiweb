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
      ico: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' }
  ];

  /* 카드로 이동 + 펼치기 + 잠깐 강조.
     ⚠ 스크롤은 'auto' — 부드러운 스크롤을 시작만 하고 끊으면 멀미가 난다는 지적이 이미 있었다. */
  window.ph161Go = function (cardId, subId) {
    var c = document.getElementById(cardId);
    if (!c) { return; }
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
