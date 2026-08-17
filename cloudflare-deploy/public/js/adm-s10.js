// ═══════════════════════════════════════════════════════════════
// adm-s10.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  function isMobile(){ return window.matchMedia('(max-width:1023px)').matches; }
  var box=null, armed=null, timer=null;
  function ensure(){
    if(box) return box;
    box=document.createElement('div'); box.id='sb-mtip';
    document.body.appendChild(box);
    return box;
  }
  function gcDesc(name){
    name=(name||'').replace(/\s+/g,' ').trim(); if(!name) return '';
    var k=name.replace(/^[^가-힣A-Za-z0-9]+/,'').trim();
    // 🌐 EN 토글 시 영어 설명 우선(없으면 한국어 폴백)
    if(window.adminLang && window.adminLang!=='ko' && window.GC_DESC_EN){
      if(window.GC_DESC_EN[name]) return window.GC_DESC_EN[name];
      if(window.GC_DESC_EN[k]) return window.GC_DESC_EN[k];
    }
    if(window.GC_DESC){
      if(window.GC_DESC[name]) return window.GC_DESC[name];
      if(window.GC_DESC[k]) return window.GC_DESC[k];
    }
    return '';
  }
  function descFor(item){
    if(item.classList.contains('ph125-gc')){
      var t=item.querySelector('.ph125-text');
      return gcDesc(item.getAttribute('data-gc-name')||(t?t.textContent:item.textContent));
    }
    var d=item.getAttribute('data-tip');
    return d?d.replace(/\s+/g,' ').trim():'';
  }
  function place(item){
    var b=ensure();
    b.style.left='0px'; b.style.top='-9999px'; b.classList.add('on'); // 측정용 표시
    var r=item.getBoundingClientRect();
    var vw=window.innerWidth, vh=window.innerHeight, m=8, gap=8;
    var tw=b.offsetWidth, th=b.offsetHeight;
    var left=false, tx=r.right+gap;
    if(tx+tw>vw-m){ tx=r.left-gap-tw; left=true; }   // 오른쪽 공간 없으면 왼쪽
    if(tx<m) tx=m;
    var cy=r.top+r.height/2, ty=cy-th/2;
    if(ty+th>vh-m) ty=vh-m-th;                        // 아래로 넘치면 위로
    if(ty<m) ty=m;
    b.classList.toggle('left',left);
    b.style.left=tx+'px'; b.style.top=ty+'px';
    b.style.setProperty('--ty', Math.max(8, Math.min(cy-ty-7, th-14))+'px');
  }
  function disarm(){
    if(timer){ clearTimeout(timer); timer=null; }
    if(armed){ armed.classList.remove('sb-mtip-armed'); armed=null; }
    if(box) box.classList.remove('on');
  }
  function arm(item,desc){
    disarm();
    var b=ensure(); b.textContent=desc;
    armed=item; item.classList.add('sb-mtip-armed');
    place(item);
    timer=setTimeout(disarm, 5000); // 일정 시간 뒤 자동 해제(다음 탭은 다시 첫 탭)
  }
  /* ══════════════════════════════════════════════════════════════════════════
     🩹 (2026-08-16 사장님) 「메뉴를 눌러도 아무 데도 안 간다」 — 여기가 그 원인이었다
     ══════════════════════════════════════════════════════════════════════════
     [옛 동작] 모바일에서 메뉴를 «처음 탭» 하면 설명 말풍선만 띄우고 이동을 막았다
       (stopImmediatePropagation 으로 ph97 차단). «다시 탭» 해야 이동이었다.

     [왜 못 쓰나 — 실측 2026-08-16, Chromium 390×844]
       ① 화면에 «두 번 눌러야 한다»는 안내가 어디에도 없다. 쓰는 사람은
          한 번 누르고 «안 되네» 하고 만다.
       ② 그런데 안내가 있어도 소용이 없다 — 자연스럽게 톡톡 두 번 누르면
          ph97 의 __deliberate() 가 «350ms 안의 연속 클릭»으로 보고 두 번째마저 버린다.
          즉 **빠른 두 번 탭 = 아무 일도 안 일어남**. 실제로 그렇게 측정됐다.
       ③ 5초가 지나면 말풍선이 스스로 풀려서 다음 탭이 «다시 첫 탭» 이 된다.
          잠깐 딴 데 보다 다시 누르면 또 안 간다.
       숨은 모드(hidden mode)라 배울 수도, 지킬 수도 없는 규칙이었다.

     [새 동작] **한 번 탭 = 바로 이동.** 이동을 막는 길 자체를 없앴다.
       설명은 버리지 않는다 — 말풍선으로 «가로채서» 보여 주는 대신,
       메뉴 이름 밑에 **한 줄로 그냥 적어 둔다**(paintDescriptions).
       사이드바가 화면 100% 로 넓어졌으므로 자리가 충분하다.
       읽고 싶으면 그냥 보이고, 누르면 그냥 간다. 모드가 없다.

     ⚠️ 데스크톱은 원래 hover 말풍선이라 이 문제가 없었다 — 아무것도 바꾸지 않았다.
        arm()/place()/#sb-mtip 은 그대로 남아 있다(데스크톱 경로 · 되돌리기용).
     ══════════════════════════════════════════════════════════════════════════ */

  /* 메뉴 이름 아래에 설명을 한 줄로 새긴다 — 모바일에서만, «펼친 그룹만», 요소당 한 번만.
     ⚠️ 페이지 전체를 한 번에 칠하지 않는다. 실측(2026-08-16): 통째로 칠하면
        **390개**가 붙는데, 그중 보이는 것은 39개뿐이다. 나머지 351개는 adm-ia6.js 가
        감춰 둔 옛 9그룹 메뉴라 아무도 못 본다 — 1MB 짜리 화면에 죽은 노드만 늘린다.
     ⚠️ MutationObserver 로 «다시 그려지면 칠하기» 도 해 봤지만 ia6 의 재렌더와
        타이밍이 어긋나 보이는 항목에는 하나도 안 붙었다(실측 paintedVisible=0).
        그래서 «펼칠 때 그 그룹만» — 타이밍이 확실하고, 한 번에 6~9개면 끝난다. */
  function paintGroup(scope){
    if(!isMobile()||!scope) return;
    var items=scope.querySelectorAll('.ph85-sub, .ph125-gc');
    for(var i=0;i<items.length;i++){
      var it=items[i];
      if(it.__mtipPainted) continue;
      it.__mtipPainted=true;
      var desc=descFor(it);
      if(!desc) continue;
      /* ⚠️ textContent 로 갈아엎지 않는다 — data-ko/data-en 루프와 i18n-sweep 의 restore()
            가 텍스트 노드를 그대로 다시 쓰기 때문에, 통째로 바꾸면 번역이 죽는다.
            그래서 «자식 요소로 덧붙이기» 만 한다. 원래 라벨 노드는 손대지 않는다. */
      var n=document.createElement('span');
      n.className='sb-mtip-inline';
      n.textContent=desc;
      it.appendChild(n);
    }
  }

  function onSbClick(e){
    if(!isMobile()) return;                                    // 데스크톱은 hover 말풍선 그대로
    if(armed) disarm();                                        // 떠 있으면 치운다. 이동은 절대 막지 않는다.
    var t=e.target;
    if(!t||!t.closest) return;
    // 그룹을 펼치는 탭이면, 그 그룹의 설명을 지금 새긴다.
    // (ph97 이 아코디언 클래스를 붙이는 것은 이 뒤라 다음 프레임에 칠한다)
    var head=t.closest('#ph85-sidebar .ph85-head');
    if(head&&head.parentElement){
      var g=head.parentElement;
      setTimeout(function(){ paintGroup(g); },0);
    }
  }
  if(!window.__sbMtipBound){
    window.__sbMtipBound=true;
    window.addEventListener('click', onSbClick, true);
    window.addEventListener('scroll', disarm, true);
    window.addEventListener('resize', disarm);
    // 처음부터 열려 있는 그룹(마지막으로 보던 항목)만 미리 새긴다
    var start=function(){
      var open=document.querySelectorAll('#ph85-sidebar .ph85-group.open');
      for(var i=0;i<open.length;i++) paintGroup(open[i]);
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,600); });
    else setTimeout(start,600);
  }
})();
