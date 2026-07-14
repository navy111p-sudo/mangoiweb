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
  // ⚠️ 클릭 가드는 반드시 window 캡처에 '즉시' 등록한다.
  //   admin.html 의 ph97 글로벌 컨트롤러도 window 캡처(click)에서 stopPropagation 으로 사이드바 클릭을 처리하는데,
  //   같은 window 노드에서는 '먼저 등록된 리스너가 먼저 실행'되므로, ph97(아래 27779행)보다 위(여기)에서
  //   파싱 시점에 동기로 등록해야 우리 핸들러가 먼저 실행된다. (#ph85-sidebar 캡처는 트리상 더 아래라
  //   window 캡처인 ph97 이 stopPropagation 하면 우리 핸들러까지 내려오지 못해 동작 안 함 — 실측 확인됨.)
  function onSbClick(e){
    if(!isMobile()) return;                                    // 데스크톱은 hover 말풍선 사용
    var item=e.target.closest && e.target.closest('#ph85-sidebar .ph125-gc, #ph85-sidebar .ph85-sub');
    if(!item){ if(armed) disarm(); return; }                  // 사이드바 밖/그룹헤더 → 떠있으면 닫고, 진행은 안 막음
    var desc=descFor(item);
    if(!desc) return;                                         // 설명 없으면 기존대로 이동(ph97)
    if(item===armed){ disarm(); return; }                     // 두 번째 탭 → 안 막음 → ph97 이 이동
    // 첫 탭: ph97(같은 window 캡처, 나중 등록)보다 먼저 실행 → stopImmediatePropagation 으로 ph97 차단 + 말풍선만
    e.preventDefault(); e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    arm(item,desc);
  }
  if(!window.__sbMtipBound){
    window.__sbMtipBound=true;
    window.addEventListener('click', onSbClick, true);        // ph97 보다 먼저 등록 → 먼저 실행
    window.addEventListener('scroll', disarm, true);
    window.addEventListener('resize', disarm);
  }
})();
