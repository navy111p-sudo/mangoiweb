// ═══════════════════════════════════════════════════════════════
// adm-r25.js — 사이드바 3단계 «손자 메뉴»(ph125)
//   외부 classic script, 전역 스코프 공유. 원복=admin.html 의 이 위치에 인라인.
//
// 🔑 (2026-08-18 전면 교체) 손자 이름을 «손으로 적지 않는다».
//   예전엔 카드마다 이름 4개씩을 손으로 적어 둔 MAP 이 있었는데, 그 머리말이 스스로
//   «데모 매핑» 이라고 밝히고 있었다 — 카드에 그런 칸이 없어도 메뉴가 비어 보이지 않게
//   **이름만 지어 넣은 것**이다. 누르면 「카드 안 N번째 details」로 가는 방식이라,
//   그런 칸이 0개인 카드(63개)에서는 무엇을 눌러도 카드 전체가 한 번 반짝이고 끝났다.
//   에러가 안 나서 죽은 줄도 몰랐고, 실제로 「학생 명부 ▸ 2 학생 상세 프로필」을 누르면
//   엉뚱하게 「⏰ 만료 임박 학생」이 열렸다(사장님 지적).
//
//   → 이제 손자는 **카드 안에 진짜로 있는 접이칸(details)을 화면에서 그대로 읽어** 만든다.
//      · 이름   = 그 칸의 summary 글자 그대로 → 어긋날 수가 없다
//      · 목적지 = 그 칸 자체(DOM 참조) → id 가 없어도, 같은 id 가 두 벌 있어도 정확하다
//      · 용량   = 목록을 안 들고 다니므로 **다운로드가 늘지 않는다**(오히려 6KB 줄었다)
//   ⛔ 없는 칸을 이름으로 지어 넣지 말 것. 그러면 위 사고가 그대로 재현된다.
//      카드에 손자를 만들고 싶으면 **카드 안에 진짜 칸(details.sub-item)을 만드세요.**
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  /* 여기 남은 두 개는 «카드 안 칸이 details 가 아니라서 화면에서 읽을 수 없는» 것뿐이다.
     ⚠️ 문자열 목록으로 되돌리지 말 것 — 문자열은 곧 «위치로 찾아감» 이고,
        카드 구조가 바뀌면 아무 소리 없이 엉뚱한 데로 간다. */
  var MAP = {
    /* 👨‍🎓 학생 명부 — 카드 안 하위칸 8개를 «있는 그대로» 적은 것(2026-08-18).
       화면 스캔으로도 같은 결과가 나오지만, 정본을 눈으로 확인해 둔 곳이라 그대로 남긴다. */
    'card-students-mgmt': [
      { ko:'학생 목록',            en:'Student List',        anchor:'sm-student-list' },
      { ko:'⏰ 만료 임박 학생',     en:'⏰ Expiring Soon',     anchor:'sm-expiring' },
      { ko:'🚪 오늘 수업',          en:'🚪 Today\'s Classes',  anchor:'sm-today-classes' },
      { ko:'📅 오늘 출결',          en:'📅 Today\'s Attendance', anchor:'sm-today-attendance' },
      { ko:'📅 학원 전체 스케줄',   en:'📅 All Schedules',    anchor:'sm-all-schedules' },
      { ko:'🏆 연속 출석 랭킹',     en:'🏆 Streak Ranking',   anchor:'sm-streak-rank' },
      { ko:'📞 최근 상담 통합',     en:'📞 Recent Consults',  anchor:'sm-recent-consult' },
      { ko:'💭 단체 메시지',        en:'💭 Bulk Message',     anchor:'sm-bulk-msg' }
    ],
    /* 🎯 레벨테스트 — 이 카드엔 접이칸이 0개라 화면에서 읽을 수 없다. 목적지를 직접 적는다.
       ⚠️ 새 항목도 anchor/card/fn 중 하나를 반드시 줄 것. */
    'card-level-tests': [
      { ko:'🆕 신청 현황',      en:'🆕 Applications',  anchor:'lt-sec-apps' },
      { ko:'📊 응시 결과',      en:'📊 Test Results',  anchor:'lt-sec-results' },
      { ko:'🏅 배치 현황',      en:'🏅 Placement',     card:'card-leveltest' },
      { ko:'📅 캘린더에서 보기', en:'📅 On Calendar',   fn:'ltGotoCalendar' },
      { ko:'+ 결과 수동 등록',  en:'+ Add Result',    anchor:'lt-sec-add' }
    ],   /* ← 쉼표를 지우지 말 것: 하니스가 「'],'」 로 이 목록의 끝을 찾는다 */
  };

  /* 카드 안 «진짜 칸» 선택자 — 여기 걸리는 것만 손자가 된다.
     · details.sub-item / .sub-menu > details — 접이칸. 이름은 summary 글자 그대로.
     · [data-gc="이름"]                        — 접이칸이 아닌 구역에 사람이 붙인 «이름표».
       접이식이 아닌 화면(필터+표 한 벌 같은 것)에도 손자를 만들고 싶을 때 쓴다.
       ⚠️ 이름표는 «그 구역 자체» 에 단다. 목록을 딴 파일에 적으면 화면이 바뀔 때 또 어긋난다.
       영어 이름은 data-gc-en 에 함께 적는다(없으면 한국어가 그대로 나온다). */
  var SEL = 'details.sub-item, .sub-menu > details, [data-gc]';
  var EN  = function(){ return !!(window.adminLang && window.adminLang !== 'ko'); };

  /* summary 글자에서 메뉴 이름만 뽑는다.
     summary 안에는 ℹ️ 도움말·건수 배지가 같이 들어 있는 경우가 많아서 그대로 쓰면 한 줄이 길어진다. */
  function labelOf(sum, attr){
    var sp = sum.querySelector('[' + attr + ']');
    var t  = sp ? sp.getAttribute(attr) : '';
    if (!t) t = sum.textContent || '';
    t = String(t).split(/ℹ️|💡|\n/)[0].replace(/\s+/g, ' ').trim();
    if (t.length > 26) t = t.slice(0, 25) + '…';
    return t;
  }

  /* 카드에서 손자 목록을 읽는다. 목적지는 DOM 참조(el)라 id 가 없어도 정확하다. */
  function scan(card){
    var list = [], seen = [];
    var nodes = card.querySelectorAll(SEL);
    for (var i = 0; i < nodes.length; i++){
      var d = nodes[i];
      if (seen.indexOf(d) >= 0) continue;   // 두 선택자에 겹쳐 걸린 것 제거
      seen.push(d);
      var ko, en;
      if (d.hasAttribute('data-gc')){
        ko = (d.getAttribute('data-gc') || '').trim();
        en = (d.getAttribute('data-gc-en') || '').trim() || ko;
      } else {
        var sum = d.querySelector('summary');
        if (!sum || sum.parentElement !== d) continue;
        ko = labelOf(sum, 'data-ko');
        en = labelOf(sum, 'data-en') || ko;
      }
      if (!ko) continue;
      list.push({ ko: ko, en: en, el: d });
      if (list.length >= 20) break;         // 한 메뉴가 화면을 다 먹지 않게
    }
    return list;
  }

  function itemsFor(cardId, card){
    var m = MAP[cardId];
    if (m) return m;
    return scan(card);
  }

  var esc = function(s){
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  };

  // ── ▸ 토글 + 손자 컨테이너 만들기 ───────────────────────────────
  function ph125Build(){
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return;
    bar.querySelectorAll('.ph85-sub').forEach(function(sub){
      if (sub.__ph125) return;
      var cardId = sub.dataset.card;
      if (!cardId) return;
      var card = document.getElementById(cardId);
      if (!card){
        /* 카드가 아직 안 그려졌을 수 있다 — 몇 번만 다시 본다.
           무한 재시도는 느린 PC(필리핀 가정 회선 포함)에서 그냥 낭비다. */
        sub.__ph125try = (sub.__ph125try || 0) + 1;
        if (sub.__ph125try > 5) sub.__ph125 = true;
        return;
      }
      var items = itemsFor(cardId, card);
      if (!items.length){
        sub.__ph125try = (sub.__ph125try || 0) + 1;
        if (sub.__ph125try > 5) sub.__ph125 = true;   // 칸이 없는 카드 = «화면 하나». ▸ 를 안 붙인다
        return;
      }
      sub.__ph125 = true;

      if (!sub.querySelector('.ph125-toggle')){
        var toggle = document.createElement('span');
        toggle.className = 'ph125-toggle';
        toggle.textContent = '▸';
        sub.appendChild(toggle);
      }

      var next = sub.nextElementSibling;
      if (!next || !next.classList.contains('ph125-grandchildren')){
        var box = document.createElement('div');
        box.className = 'ph125-grandchildren';
        box.dataset.parent = cardId;
        var en = EN();
        box.innerHTML = items.map(function(it, i){
          /* 🌐 보이는 글자는 화면 언어를 따르고, 설명 사전 조회 키(data-gc-name)는 «항상» 한국어. */
          return '<div class="ph125-gc" data-gc-name="' + esc(it.ko) + '">' +
                   '<span class="ph125-num">' + (i + 1) + '</span>' +
                   '<span class="ph125-text">' + esc((en && it.en) ? it.en : it.ko) + '</span>' +
                 '</div>';
        }).join('');
        // 목적지를 DOM 참조로 직접 물려 준다 — 문자열 id 를 안 거치므로
        // 같은 id 가 문서에 두 벌 있어도(예: sub-popup-list) 엉뚱한 곳으로 안 간다.
        var gcs = box.children;
        for (var i = 0; i < gcs.length; i++){ gcs[i].__gc = items[i]; gcs[i].__card = cardId; }
        sub.parentNode.insertBefore(box, sub.nextSibling);
      }

      // 🗑️ (2026-07-27 사장님 «메뉴가 자기 멋대로 나왔다 들어갔다») 호버 자동 펼침 제거. 재추가 금지.
      var t = sub.querySelector('.ph125-toggle');
      if (t && !t.__bound){
        t.__bound = true;
        t.addEventListener('click', function(e){
          e.stopPropagation(); e.preventDefault();
          bar.querySelectorAll('.ph85-sub.ph125-open').forEach(function(s){ if (s !== sub) s.classList.remove('ph125-open'); });
          sub.classList.toggle('ph125-open');
        });
      }
    });
  }

  function flash(el){
    el.classList.remove('ph96-highlight');
    void el.offsetWidth;
    el.classList.add('ph96-highlight');
    setTimeout(function(){ el.classList.remove('ph96-highlight'); }, 1600);
  }

  /* 「눌렀는데 그 화면이 안 보인다」를 없애는 곳 —
     ① 모바일 드로어를 «스크롤보다 먼저» 닫는다. 드로어가 열린 동안 body 는 overflow:hidden 이라
        그 상태에서 scrollIntoView 를 부르면 브라우저가 통째로 무시한다(adm-s11 에서 밟은 함정).
     ② 목적지 칸을 펴고, 같은 줄의 형제 칸은 접는다 — 그래야 그 칸이 «맨 위» 로 온다.
     ③ 카드 이동은 jumpToMenu 에 맡긴다(급여 접근제어·legacy-cards 표시·공지 탭 전환이 거기 있다). */
  function closeDrawer(){
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    var sb = document.getElementById('ph85-sidebar');
    if (sb) sb.classList.remove('open');
    try { if (typeof window.mgaClose === 'function') window.mgaClose(); } catch(e){}
    document.body.classList.remove('mga-open');
  }

  function reveal(card, target){
    var p = target;
    while (p && p !== card){ if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
    if (card.tagName === 'DETAILS') card.open = true;
    if (target.tagName === 'DETAILS'){
      target.open = true;
      var par = target.parentElement;
      if (par) [].forEach.call(par.children, function(x){
        if (x !== target && x.tagName === 'DETAILS' && x.classList.contains('sub-item')) x.open = false;
      });
    }
    target.scrollIntoView({ behavior:'auto', block:'start' });
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      target.scrollIntoView({ behavior:'auto', block:'start' });   // 카드가 펴지며 높이가 변한 뒤 재보정
      flash(target);
    }); });
  }

  function go(cardId, desc){
    closeDrawer();                                   // ① 먼저 닫는다
    var hostId = desc.card || cardId;
    if (typeof window.jumpToMenu === 'function') window.jumpToMenu(hostId);
    var card = document.getElementById(hostId);
    if (!card) { alert('카드 미구현: ' + hostId); return; }
    setTimeout(function(){
      if (desc.fn && typeof window[desc.fn] === 'function'){ window[desc.fn](); return; }
      var t = desc.el || (desc.anchor ? document.getElementById(desc.anchor) : null);
      reveal(card, t || card);
    }, 120);                                          // jumpToMenu 의 rAF 재보정(≈32ms) 뒤에 온다
  }

  // 손자 클릭 — 위임 한 곳에서 받는다(항목마다 onclick 문자열을 안 만들어 그만큼 가볍다)
  document.addEventListener('click', function(e){
    var gcEl = e.target.closest && e.target.closest('#ph85-sidebar .ph125-gc');
    if (!gcEl || !gcEl.__gc) return;
    e.stopPropagation(); e.preventDefault();
    go(gcEl.__card, gcEl.__gc);
  }, true);

  /* 옛 이름 유지 — 다른 화면(퀵메뉴·안내)이 부를 수 있다. 이제 «위치로 찾아감» 은 하지 않는다. */
  window.ph125Jump = function(cardId, idx){
    var card = document.getElementById(cardId);
    if (!card) { alert('카드 미구현: ' + cardId); return; }
    var items = itemsFor(cardId, card);
    if (items[idx]) go(cardId, items[idx]);
    else { closeDrawer(); if (typeof window.jumpToMenu === 'function') window.jumpToMenu(cardId); }
  };

  /* ── 🔍 손자를 통합 검색에 색인 ─────────────────────────────────────
     「출결」이라 치면 카드가 아니라 «그 안의 출결 칸» 이 바로 뜨게 한다.
     _globalSearchIndex 는 adm-core.js 의 최상위 let — classic script 끼리는
     전역 렉시컬 스코프를 공유하므로 여기서 그대로 읽고 쓸 수 있다(window 에는 없다).
     buildMenuIndex 가 색인을 통째로 다시 만들므로(RBAC 갱신 때마다), 우리 항목은
     _gc 표식을 달아 두고 매번 «지우고 다시 넣는» 방식으로 어긋남을 막는다. */
  function indexGc(){
    try {
      if (typeof _globalSearchIndex === 'undefined' || !Array.isArray(_globalSearchIndex)) return;
      var bar = document.getElementById('ph85-sidebar');
      if (!bar) return;
      var fresh = [];
      bar.querySelectorAll('.ph125-grandchildren').forEach(function(box){
        var sub = box.previousElementSibling;
        if (!sub || !sub.classList.contains('ph85-sub')) return;
        if (sub.classList.contains('rbac-hide')) return;        // 역할로 감춘 메뉴는 검색에도 안 띄움
        var pKo = (sub.getAttribute('data-ko') || sub.textContent || '').replace(/\s+/g,' ').trim();
        var pEn = (sub.getAttribute('data-en') || pKo).replace(/\s+/g,' ').trim();
        [].forEach.call(box.children, function(gcEl){
          var d = gcEl.__gc, cid = gcEl.__card;
          if (!d) return;
          fresh.push({
            _gc: true, kind: 'menu',
            kindLabelKo: '📂 하위 메뉴', kindLabelEn: '📂 Sub-menu',
            label: d.ko, labelEn: d.en || d.ko,
            sub: pKo, subEn: pEn,
            action: (function(c, item){ return function(){ go(c, item); }; })(cid, d)
          });
        });
      });
      _globalSearchIndex = _globalSearchIndex.filter(function(x){ return !x._gc; }).concat(fresh);
    } catch(e) { /* 검색 색인은 부가 기능 — 실패해도 손자 메뉴 자체는 동작해야 한다 */ }
  }

  function buildAndIndex(){ ph125Build(); indexGc(); }

  // buildMenuIndex(RBAC 갱신·언어 전환 뒤 재실행됨)가 색인을 갈아엎은 «뒤» 우리 것을 다시 얹는다
  (function wrapBMI(){
    var tries = 0;
    var t = setInterval(function(){
      if (typeof window.buildMenuIndex === 'function'){
        clearInterval(t);
        var orig = window.buildMenuIndex;
        window.buildMenuIndex = function(){ var r = orig.apply(this, arguments); indexGc(); return r; };
      } else if (++tries > 40) clearInterval(t);
    }, 250);
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildAndIndex);
  else buildAndIndex();
  (window.__admSettleRun ? window.__admSettleRun(buildAndIndex) : setInterval(buildAndIndex, 1500));

  console.log('[ph125] 손자 메뉴 — 카드 안 실제 칸을 읽어 그림(▸ 클릭 토글)');
})();
