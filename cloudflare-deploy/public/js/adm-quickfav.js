// ═══════════════════════════════════════════════════════════════
// adm-quickfav.js — 사이드바 «자주 쓰는 메뉴» (2026-08-19)
//
//   [왜 만들었나] 사용성 점검 2번. 목적지까지 늘 3번 눌러야 한다(그룹 → 자식 → 손자).
//     매일 같은 곳을 가도 매번 3번이다. 기억하는 것은 「마지막으로 본 항목」 하나뿐이고
//     즐겨찾기·최근 목록이 없었다.
//   [무엇을 한다] 검색창 아래에 «고정(★) + 최근 본» 목록을 얹는다. 매일 쓰는 대여섯 개는
//     3번 → 1번이 된다. 아래 그룹 목록은 **그대로 둔다** — 없애는 게 아니라 위에 한 칸 더하기다.
//
//   ⚠️ 이 파일이 지키는 규칙(전부 CLAUDE.md 2장에서 실제로 밟았던 함정이다)
//     ① 이동을 «새로 만들지 않는다». 원본 사이드바 항목을 찾아 .click() 한다 —
//        그래야 ph97·adm-ia6·adm-r25 가 하던 일(카드 열기·스크롤·드로어 닫기)이 그대로 일어난다.
//        여기서 location 이나 jumpToMenu 를 직접 부르면 그 셋과 어긋나기 시작한다.
//     ② 리스너는 **window 캡처**. 사이드바에 걸면 ph97 의 stopPropagation 에 막혀 안 불린다.
//     ③ 숨김은 **클래스**로 한다. style.display 로 숨기면 admin.html 의 «강제 visible»
//        복구 루프가 1.5초 뒤 되살린다(검색이 그래서 오래 고장나 있었다).
//     ④ 우리 상자에는 .ph85-group / .ph85-sub 클래스를 **쓰지 않는다**. 그 이름을 쓰면
//        그룹 갯수 배지·역할 필터·검색이 우리 줄까지 세거나 거른다.
//     ⑤ 사이드바를 다시 그리는 코드가 여럿이라(IA6·ph86·ph118) 상자가 지워질 수 있다 →
//        정착 루프로 다시 넣는다.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var FAV_KEY    = 'mangoi_menu_fav';       // ★ 로 고정한 항목 (사람이 정한 것 — 순서 유지)
  var RECENT_KEY = 'mangoi_menu_recent';    // 최근 본 항목 (자동)
  var MAX_FAV    = 6;
  var MAX_RECENT = 5;
  var KEEP       = 12;                      // 최근은 넉넉히 쌓아 두고 화면에만 5개

  function read(key){
    try { var v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function write(key, arr){
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { /* 사파리 프라이빗 등 — 무시 */ }
  }

  /* 항목의 «보이는 이름» — 자식 줄의 직속 텍스트 노드만 모은다.
     ⚠️ textContent 를 쓰면 ▸ 토글과 손자 목록 글자까지 딸려 온다. */
  function labelOf(sub){
    var t = '';
    Array.prototype.forEach.call(sub.childNodes, function(n){ if (n.nodeType === 3) t += n.nodeValue; });
    return t.replace(/\s+/g, ' ').trim();
  }

  /* 🔁 (2026-09-01) 저장된 키는 «그룹키:한글이름» 이라 **항목 이름을 바꾸면 미아**가 된다.
     그러면 사람이 고정해 둔 ⭐이 목록에서 «말없이» 빠진다(usable() 이 null 을 걸러 낸다).
     그래서 사이드바가 들고 있는 이사표(adm-ia6.js 의 RENAMED)를 거쳐서 찾는다.
     ⚠️ 그 파일이 아직 안 실렸을 수 있으므로 없으면 원래 키 그대로 — 옛 동작으로 안전하게 떨어진다. */
  function itemByKey(bar, key){
    var k = (key || '').replace(/"/g, '');
    try { if (window.mangoiIA6 && window.mangoiIA6.renameKey) k = window.mangoiIA6.renameKey(k); } catch (e) {}
    return bar.querySelector('.ph85-sub[data-ia6-item="' + k + '"]');
  }

  /* 역할에 따라 감춰진 항목은 목록에도 넣지 않는다 —
     안 그러면 «눌러도 아무 일이 없는 줄» 이 생긴다(예전 손자 메뉴가 그랬다). */
  function usable(el){
    return !!el && !el.classList.contains('ia6-role-hide') && !el.classList.contains('rbac-hide');
  }

  function box(bar){
    var b = document.getElementById('qf-box');
    if (b && b.parentNode) return b;
    b = document.createElement('div');
    b.id = 'qf-box';
    b.className = 'qf-box';
    /* 자리: 검색창 아래, «모두 펼치기» 줄이 있으면 그 아래. 그룹 목록보다 위. */
    var anchor = document.getElementById('ph86-actions') || bar.querySelector('.ph85-search-wrap');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(b, anchor.nextSibling);
    else bar.insertBefore(b, bar.firstChild);
    return b;
  }

  function render(){
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return;
    var b = box(bar);

    var favs = read(FAV_KEY).filter(function(k){ return usable(itemByKey(bar, k)); }).slice(0, MAX_FAV);
    var recents = read(RECENT_KEY)
      .filter(function(k){ return favs.indexOf(k) < 0 && usable(itemByKey(bar, k)); })
      .slice(0, MAX_RECENT);

    /* 처음 쓰는 사람에게 빈 상자는 방해다 — 아무것도 없으면 상자째 감춘다(클래스로). */
    b.classList.toggle('qf-empty', favs.length === 0 && recents.length === 0);

    var rows = [];
    favs.forEach(function(k){ rows.push({ key: k, fav: true }); });
    recents.forEach(function(k){ rows.push({ key: k, fav: false }); });

    var html = '<div class="qf-head"><span data-ko="⭐ 자주 쓰는 메뉴" data-en="⭐ Frequently used">⭐ 자주 쓰는 메뉴</span></div>';
    rows.forEach(function(r){
      var el = itemByKey(bar, r.key);
      var name = el ? labelOf(el) : r.key.split(':').pop();
      html += '<div class="qf-row' + (r.fav ? ' qf-pinned' : '') + '" data-qf="' + esc(r.key) + '">' +
                /* 고정 줄은 왼쪽 표시를 비운다 — 오른쪽 ★ 버튼과 겹쳐 «별이 두 번» 나왔다(실측). */
                '<span class="qf-mark">' + (r.fav ? '' : '🕘') + '</span>' +
                '<span class="qf-name">' + esc(name) + '</span>' +
                '<button type="button" class="qf-star" data-qf-star="' + esc(r.key) + '" ' +
                  'title="' + (r.fav ? '고정 해제' : '맨 위에 고정') + '" ' +
                  'aria-label="' + (r.fav ? '고정 해제' : '맨 위에 고정') + '">' + (r.fav ? '★' : '☆') + '</button>' +
              '</div>';
    });
    b.innerHTML = html;
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }

  function remember(key){
    if (!key) return;
    var list = read(RECENT_KEY).filter(function(k){ return k !== key; });
    list.unshift(key);
    write(RECENT_KEY, list.slice(0, KEEP));
    render();
  }

  function toggleFav(key){
    var list = read(FAV_KEY);
    var i = list.indexOf(key);
    if (i >= 0) list.splice(i, 1);
    else {
      list.unshift(key);
      list = list.slice(0, MAX_FAV);
    }
    write(FAV_KEY, list);
    render();
  }

  /* ── 클릭 처리 — 반드시 window 캡처(위 ② 참고) ─────────────────────────── */
  window.addEventListener('click', function(e){
    var t = e.target;
    if (!t || !t.closest) return;

    /* ★ 고정/해제 — 이동하지 않는다 */
    var star = t.closest('#qf-box .qf-star');
    if (star) {
      e.preventDefault(); e.stopPropagation();
      toggleFav(star.getAttribute('data-qf-star'));
      return;
    }

    /* 빠른 목록의 줄 — 원본 항목을 그대로 누른다(위 ① 참고) */
    var row = t.closest('#qf-box .qf-row');
    if (row) {
      e.preventDefault(); e.stopPropagation();
      var bar = document.getElementById('ph85-sidebar');
      var el = bar && itemByKey(bar, row.getAttribute('data-qf'));
      if (el) {
        /* 접혀 있는 그룹 안이면 먼저 펴 준다 — 안 그러면 클릭이 숨은 요소로 간다. */
        var g = el.closest('.ph85-group');
        if (g && !g.classList.contains('open')) g.classList.add('open');
        el.click();
      }
      return;
    }

    /* 사이드바에서 항목을 누르면 «최근» 에 쌓는다 */
    var sub = t.closest('#ph85-sidebar .ph85-sub[data-ia6-item]');
    if (sub) remember(sub.getAttribute('data-ia6-item'));
  }, true);

  /* 검색 중에는 감춘다 — 검색 결과와 섞이면 «어느 쪽이 결과인지» 헷갈린다. */
  function syncSearch(){
    var s = document.getElementById('ph85-search');
    var b = document.getElementById('qf-box');
    if (s && b) b.classList.toggle('qf-searching', !!s.value.trim());
  }
  document.addEventListener('input', function(e){
    if (e.target && e.target.id === 'ph85-search') syncSearch();
  }, true);

  function run(){
    var bar = document.getElementById('ph85-sidebar');
    if (!bar || !bar.querySelector('.ph85-sub[data-ia6-item]')) return false;   // IA6 가 그리기 전
    render();
    syncSearch();
    return true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  /* 사이드바를 다시 그리는 코드가 여럿이라 상자가 지워질 수 있다 → 정착 루프로 다시 넣는다(위 ⑤). */
  if (window.__admSettleRun) window.__admSettleRun(run);
  else { var t = setInterval(run, 800); setTimeout(function(){ clearInterval(t); }, 15000); }
  setInterval(function(){ if (!document.getElementById('qf-box')) run(); }, 3000);
})();
