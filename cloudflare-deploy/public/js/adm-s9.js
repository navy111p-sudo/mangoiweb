// ═══════════════════════════════════════════════════════════════
// adm-s9.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  // 손자 details 안의 💡 안내문 추출(없으면 '')
  function innerTip(s){
    var d=s&&s.parentElement; if(!d||d.tagName!=='DETAILS') return '';
    var scope=d.querySelector(':scope > .sub-body') || d;
    var nodes=scope.querySelectorAll('div,p,span,small,li');
    for(var i=0;i<nodes.length && i<120;i++){
      if(nodes[i].closest('details')!==d) continue;           // 더 깊은(증손자) 안내는 제외
      var t=(nodes[i].textContent||'').replace(/\s+/g,' ').trim();
      if(t && t.indexOf('💡')===0 && t.length<=130) return t.replace(/^💡\s*/,'').replace(/^[^가-힣A-Za-z0-9]+/,'');
    }
    return '';
  }
  // 메뉴명 키워드 → 한 줄 설명
  window.miDescribe = function(name, el){
    name=(name||'').replace(/\s+/g,' ').trim();
    var tip=innerTip(el); if(tip) return tip;
    // (2026-06-20) 손자 메뉴별 전용 설명 사전 우선 — 별 없는 메뉴 포함 모두 의미 있는 설명
    if(window.GC_DESC){
      var _g=window.GC_DESC[name];
      if(!_g){ var _k2=name.replace(/^[^가-힣A-Za-z0-9]+/,'').trim(); _g=window.GC_DESC[_k2]; }
      if(_g) return _g;
    }
    var n=name;
    function has(){ for(var i=0;i<arguments.length;i++){ if(n.indexOf(arguments[i])>=0) return true; } return false; }
    if(has('급여','정산','수금','환전','청구','지급')) return '급여·정산 관련 기능입니다.';
    if(has('결제','수강료','매출','회계','환불','충전')) return '결제·매출/회계 내역을 다룹니다.';
    if(has('랭킹','순위')) return '순위를 보여줍니다.';
    if(has('출결','출석','지각','결석')) return '출석 현황을 확인·관리합니다.';
    if(has('평가','성적')) return '평가서/성적을 작성·관리합니다.';
    if(has('리포트','보고서')) return '리포트를 생성/조회합니다.';
    if(has('통계','차트','그래프','대시보드','KPI','분석','NPS','예측','집계')) return '데이터를 집계해 보여줍니다.';
    if(has('발송','알림','푸시','메시지','톡','공지')) return '대상에게 알림/메시지를 보냅니다.';
    if(has('등록','신청','가입')) return '신규 등록/신청을 처리합니다.';
    if(has('예약','상담')) return '예약/상담을 관리합니다.';
    if(has('목록','조회','현황','내역')) return '항목을 조회합니다.';
    if(has('관리','설정','권한','양식','편집')) return '등록·수정 등 관리 기능입니다.';
    if(has('데모','시연','가이드','안내','예시','샘플','방법')) return '참고용 안내/예시입니다.';
    var base=name.replace(/^[^가-힣A-Za-z0-9]+/,'').trim();
    return base ? (base+' 기능입니다.') : '메뉴 기능입니다.';
  };

  // ===== 본문 손자메뉴 hover 말풍선 =====
  var tip, hideT, cur;
  function build(){ tip=document.getElementById('mi-gc-tip'); if(tip) return tip;
    tip=document.createElement('div'); tip.id='mi-gc-tip'; document.documentElement.appendChild(tip); return tip; }
  function isGrandchild(s){
    var p=s.parentElement;
    if(p&&p.classList&&p.classList.contains('menu-card')) return false; // 카드 헤더(자식) 제외
    return !!s.closest('.menu-card');
  }
  function show(s){
    if(!window.matchMedia('(min-width:1024px)').matches) return;
    var name=(s.textContent||'').replace(/\s+/g,' ').trim();
    var d=window.miDescribe(name,s); if(!d) return;
    build(); tip.textContent=d; tip.classList.remove('flip-left');
    var r=s.getBoundingClientRect();
    tip.style.left='-9999px'; tip.style.top='0px';
    var tw=tip.offsetWidth, th=tip.offsetHeight;
    var left=r.right+8, flip=false;
    if(left+tw>window.innerWidth-8){ left=Math.max(8, r.left-tw-8); flip=true; }
    var cy=r.top + r.height/2, top=cy - th/2;
    if(top+th>window.innerHeight-8) top=window.innerHeight-th-8;
    if(top<8) top=8;
    if(flip) tip.classList.add('flip-left');
    tip.style.left=Math.round(left)+'px'; tip.style.top=Math.round(top)+'px';
    tip.style.setProperty('--ty', Math.max(8, Math.min(cy-top-7, th-15))+'px');
    clearTimeout(hideT); tip.classList.add('show'); cur=s;
  }
  function hide(){ if(!tip) return; clearTimeout(hideT); hideT=setTimeout(function(){ tip.classList.remove('show'); cur=null; },120); }
  function bind(){
    if(document.body.__miGcTip) return; document.body.__miGcTip=true;
    document.addEventListener('mouseover', function(e){
      var s=e.target.closest && e.target.closest('summary'); 
      if(!s || !isGrandchild(s)){ return; }
      if(s===cur){ clearTimeout(hideT); return; }
      show(s);
    });
    document.addEventListener('mouseout', function(e){
      var s=e.target.closest && e.target.closest('summary'); if(!s) return;
      var to=e.relatedTarget; if(to&&to.closest&&to.closest('summary')===s) return;
      hide();
    });
    window.addEventListener('scroll', function(){ if(tip) tip.classList.remove('show'); }, true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind); else bind();
  setTimeout(bind,800);
})();
