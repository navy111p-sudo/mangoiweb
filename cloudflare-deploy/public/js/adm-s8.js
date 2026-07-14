// ═══════════════════════════════════════════════════════════════
// adm-s8.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  var fly, hideT, curSub;
  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;'})[c];}); }
  function build(){
    fly=document.getElementById('mi-menu-fly');
    if(fly) return fly;
    fly=document.createElement('div'); fly.id='mi-menu-fly';
    document.documentElement.appendChild(fly);   // <html> 부착 → body zoom 영향 회피
    fly.addEventListener('mouseenter', function(){ clearTimeout(hideT); });
    fly.addEventListener('mouseleave', function(){ hide(false); });
    return fly;
  }
  function starsOf(el){ var n=el&&el.getAttribute&&el.getAttribute('data-mi-stars'); n=+n; return n>0?new Array(n+1).join('☆'):''; }
  function cardDesc(card){
    if(!card) return '';
    var nodes=card.querySelectorAll('div,p,span,li,small');
    for(var i=0;i<nodes.length && i<300;i++){
      var tx=(nodes[i].textContent||'').replace(/\s+/g,' ').trim();
      if(tx && tx.indexOf('💡')===0 && tx.length<=180) return tx.replace(/^💡\s*/,'');
    }
    return '';
  }
  function grandkids(card){
    var out=[]; if(!card) return out;
    card.querySelectorAll('summary').forEach(function(s){
      var p=s.parentElement;
      if(p&&p.classList&&p.classList.contains('menu-card')) return; // 카드 자체 헤더(자식)는 제외 → 손자만
      var name=(s.textContent||'').replace(/\s+/g,' ').trim();
      if(name) out.push({name:name, stars:starsOf(s), el:s, desc:(window.miDescribe?window.miDescribe(name,s):'')});
    });
    return out;
  }
  function openTo(el){
    var card=el.closest('.menu-card'); if(card&&card.tagName==='DETAILS') card.open=true;
    var d=el.closest('details'); if(d) d.open=true;
    el.scrollIntoView({behavior:'smooth',block:'center'});
    var o=el.style.boxShadow; el.style.boxShadow='0 0 0 3px rgba(251,191,36,.7)';
    setTimeout(function(){ el.style.boxShadow=o; },1600);
  }
  function position(sub){
    var r=sub.getBoundingClientRect();
    fly.style.left='-9999px'; fly.style.top='0px';
    var fw=fly.offsetWidth, fh=fly.offsetHeight;     // visibility:hidden 라도 레이아웃 존재 → 측정 가능
    var left=r.right+8;
    if(left+fw>window.innerWidth-8) left=Math.max(8, r.left-fw-8); // 오른쪽 공간 없으면 왼쪽
    var top=r.top;
    if(top+fh>window.innerHeight-8) top=window.innerHeight-fh-8;   // 아래로 넘치면 위로 올림(플립)
    if(top<8) top=8;
    fly.style.left=Math.round(left)+'px';
    fly.style.top=Math.round(top)+'px';
  }
  function show(sub){
    if(!window.matchMedia('(min-width:1024px)').matches) return; // 데스크톱만
    build();
    var card=document.getElementById(sub.getAttribute('data-card'));
    var name=(sub.textContent||'').replace(/\s+/g,' ').trim();
    var st=starsOf(sub), desc=cardDesc(card), gc=grandkids(card);
    var html='<div class="mf-title">'+esc(name)+(st?' <span class="mf-stars">'+st+'</span>':'')+'</div>';
    if(desc) html+='<div class="mf-desc">'+esc(desc)+'</div>';
    if(gc.length){
      html+='<div class="mf-sec">하위(손자) 메뉴 '+gc.length+'개 — 클릭 시 이동</div>';
      gc.forEach(function(g,i){ html+='<div class="mf-item" data-i="'+i+'"><div class="mf-itemrow">'+esc(g.name)+(g.stars?'<span class="mf-istar">'+g.stars+'</span>':'')+'</div>'+(g.desc?'<div class="mf-itemdesc">'+esc(g.desc)+'</div>':'')+'</div>'; });
    } else {
      html+='<div class="mf-empty">클릭하면 해당 메뉴로 바로 이동합니다.</div>';
    }
    fly.innerHTML=html;
    fly.querySelectorAll('.mf-item').forEach(function(it){
      it.addEventListener('click', function(){ var g=gc[+it.getAttribute('data-i')]; if(g&&g.el){ openTo(g.el); hide(true);} });
    });
    position(sub);
    clearTimeout(hideT);
    fly.classList.add('show');
    curSub=sub;
  }
  function hide(now){
    if(!fly) return; clearTimeout(hideT);
    if(now){ fly.classList.remove('show'); curSub=null; return; }
    hideT=setTimeout(function(){ fly.classList.remove('show'); curSub=null; }, 240);
  }
  function bind(){
    var bar=document.getElementById('ph85-sidebar'); if(!bar||bar.__miFly) return; bar.__miFly=true;
    bar.addEventListener('mouseover', function(e){
      var sub=e.target.closest&&e.target.closest('.ph85-sub'); if(!sub||!bar.contains(sub)) return;
      if(sub===curSub){ clearTimeout(hideT); return; }
      show(sub);
    });
    bar.addEventListener('mouseout', function(e){
      var sub=e.target.closest&&e.target.closest('.ph85-sub'); if(!sub) return;
      var to=e.relatedTarget;
      if(to&&to.closest&&(to.closest('.ph85-sub')||to.closest('#mi-menu-fly'))) return;
      hide(false);
    });
    window.addEventListener('scroll', function(){ hide(true); }, true);
    window.addEventListener('resize', function(){ hide(true); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind);
  else bind();
  setTimeout(bind,800);
})();
