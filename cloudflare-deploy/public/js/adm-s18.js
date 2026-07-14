// ═══════════════════════════════════════════════════════════════
// adm-s18.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  var N=18, i=0, built=false;
  var TITLES=['시작하기','관리자 페이지란?','화면은 이렇게 생겼어요','① 로그인 (입장)','사이드바 한눈에 (9개 메뉴)',
    '메뉴1 · 평가서 통합','메뉴2 · 알림 센터','메뉴3 · 강사 통합','메뉴4 · 통계·KPI','메뉴5 · 회계·포인트',
    '메뉴6 · 학생·학부모','메뉴7 · 교육·콘텐츠','메뉴8 · 자료실','메뉴9 · 시스템',
    '자주 쓰는 기능 3가지','공지 보내보기 (따라하기)','안전하게 나가기 + 꿀팁','이제 준비 끝!'];
  var pad=function(n){return (n<10?'0':'')+n;};
  var src=function(n){return '/guide/admin-easy/'+pad(n+1)+'.jpg';};
  var ov,img,cap,cnt,prev,next,thumbs;
  function build(){
    if(built) return; built=true;
    ov=document.getElementById('ag-overlay');
    img=document.getElementById('ag-img');
    cap=document.getElementById('ag-caption');
    cnt=document.getElementById('ag-count');
    prev=document.getElementById('ag-prev');
    next=document.getElementById('ag-next');
    thumbs=document.getElementById('ag-thumbs');
    // 썸네일 생성
    var h='';
    for(var k=0;k<N;k++){
      h+='<div class="ag-thumb" data-i="'+k+'"><span class="ag-tn">'+(k+1)+'</span><img loading="lazy" src="'+src(k)+'" alt=""></div>';
    }
    thumbs.innerHTML=h;
    thumbs.querySelectorAll('.ag-thumb').forEach(function(t){
      t.addEventListener('click',function(){ agSet(parseInt(t.getAttribute('data-i'),10)); });
    });
    // 이미지 좌우 절반 탭으로 넘기기
    var stage=document.getElementById('ag-stage');
    stage.addEventListener('click',function(e){
      if(e.target.closest('.ag-nav')) return;
      var r=stage.getBoundingClientRect();
      if(e.clientX < r.left + r.width/2) agGo(-1); else agGo(1);
    });
    // 스와이프
    var sx=0, sy=0, mv=false;
    stage.addEventListener('touchstart',function(e){var t=e.touches[0];sx=t.clientX;sy=t.clientY;mv=false;},{passive:true});
    stage.addEventListener('touchmove',function(e){var t=e.touches[0];if(Math.abs(t.clientX-sx)>10||Math.abs(t.clientY-sy)>10)mv=true;},{passive:true});
    stage.addEventListener('touchend',function(e){
      var t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy;
      if(mv && Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)){ agGo(dx<0?1:-1); }
    },{passive:true});
    // 배경(빈 곳) 탭으로 닫힘 방지 — stage만 넘김. 바 바깥 클릭 무시.
    // 미리 로딩 (넘김 즉각)
    for(var p=0;p<N;p++){ var im=new Image(); im.src=src(p); }
    // 키보드
    document.addEventListener('keydown',function(e){
      if(!ov.classList.contains('ag-on')) return;
      if(e.key==='ArrowRight'||e.key==='PageDown'){ e.preventDefault(); agGo(1); }
      else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); agGo(-1); }
      else if(e.key==='Escape'){ e.preventDefault(); closeAdminGuide(); }
    });
  }
  window.agSet=function(n){
    if(n<0)n=0; if(n>N-1)n=N-1; i=n;
    img.style.opacity='0';
    var tmp=new Image();
    tmp.onload=function(){ img.src=tmp.src; img.style.opacity='1'; };
    tmp.src=src(i);
    if(tmp.complete){ img.src=tmp.src; img.style.opacity='1'; }
    cap.textContent=TITLES[i]||'';
    cnt.textContent=(i+1)+' / '+N;
    prev.disabled=(i===0); next.disabled=(i===N-1);
    thumbs.querySelectorAll('.ag-thumb').forEach(function(t){
      var on=parseInt(t.getAttribute('data-i'),10)===i;
      t.classList.toggle('ag-cur',on);
      if(on) t.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    });
  };
  window.agGo=function(d){ agSet(i+d); };
  window.openAdminGuide=function(){
    build();
    try{ document.body.appendChild(ov); }catch(e){}
    ov.classList.add('ag-on');
    document.documentElement.style.overflow='hidden';
    document.body.style.overflow='hidden';
    agSet(0);
  };
  window.closeAdminGuide=function(){
    if(!ov) return;
    ov.classList.remove('ag-on');
    document.documentElement.style.overflow='';
    document.body.style.overflow='';
  };
})();
