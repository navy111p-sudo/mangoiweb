// ═══════════════════════════════════════════════════════════════
// adm-s18.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  // 두 언어 데크: 한국어 18장 / 영어 24장. 여는 시점의 언어로 자동 선택.
  var DECKS={
    ko:{ dir:'/guide/admin-easy/', pdf:'/guide/admin-easy/admin-easy.pdf', pdfName:'망고아이_관리자페이지_쉬운사용법.pdf',
      titles:["관리자 페이지 쉬운 사용법","소개","차례","🔐 ① 들어가기 (로그인)","🖥 ② 화면이 어떻게 생겼나요?","🔎 ③ 찾고 싶은 걸 바로 찾기",
        "📋 ④ 평가서 보기","📢 ⑤ 공지 보내보기","👪 ⑥ 학생·학부모 찾기","📅 ⑦ 학부모에게 리포트 보내기","🧑‍🏫 ⑧ 강사 보기",
        "💳 ⑨ 결제·환불 보기","📚 ⑩ 자료실에서 설명서 받기","🏠 ⑪ 우리 홈페이지가 어떻게 보이나","🚪 ⑫ 안전하게 마치기","기능 요약 · 데이터",
        "한눈에 보는 데이터","자주 묻는 질문 (FAQ)","첫날 체크리스트","마무리","이제 준비 끝!"] },
    en:{ dir:'/guide/admin-easy-en/', pdf:'/guide/admin-easy-en/admin-easy-en.pdf', pdfName:'Mangoi_Admin_Page_Guide_EN.pdf',
      titles:["Easy Admin Page Guide","Introduction","Contents","🔐 ① Getting in (signing in)",
        "🖥 ② What the screen looks like","🔎 ③ Finding what you need, fast",
        "📋 ④ Viewing evaluations","📢 ⑤ Sending a notice","👪 ⑥ Finding students and parents",
        "📅 ⑦ Sending the parent report","🧑‍🏫 ⑧ Viewing teachers","💳 ⑨ Payments and refunds",
        "📚 ⑩ Getting manuals from the Library","🏠 ⑪ How our home page looks to visitors",
        "🚪 ⑫ Finishing safely","Summary · Data","Data at a Glance","Frequently Asked Questions",
        "First-Day Checklist","Conclusion","You're all set!"] }
  };
  function curLang(){ try{ return (window.adminLang==='en'||window.getLang&&window.getLang()==='en')?'en':'ko'; }catch(e){ return 'ko'; } }
  var deck=DECKS.ko, TITLES=deck.titles, N=TITLES.length, builtLang=null;
  var i=0, wired=false;
  var pad=function(n){return (n<10?'0':'')+n;};
  // 🖼 (2026-08-04) .jpg → .webp (같은 그림, 용량 1/3). 없으면 아래에서 .jpg 로 되돌린다.
  var src=function(n){return deck.dir+pad(n+1)+'.webp';};
  var toJpg=function(u){return String(u||'').replace(/\.webp$/,'.jpg');};
  var ov,img,cap,cnt,prev,next,thumbs;
  // 언어에 맞춰 데크 선택 + 썸네일/프리로드 재구성 (언어가 바뀌면 다시).
  function useLang(lang){
    deck=DECKS[lang]||DECKS.ko; TITLES=deck.titles; N=TITLES.length;
    var pdf=document.getElementById('ag-pdf');
    if(pdf){ pdf.href=deck.pdf; pdf.setAttribute('download', deck.pdfName); }
    if(builtLang===lang) return;
    builtLang=lang;
    var h='';
    for(var k=0;k<N;k++){
      h+='<div class="ag-thumb" data-i="'+k+'"><span class="ag-tn">'+(k+1)+'</span>'
        +'<img loading="lazy" src="'+src(k)+'" alt="" '
        +'onerror="if(!this.__fb){this.__fb=1;this.src=this.src.replace(/\\.webp$/,\'.jpg\');}"></div>';
    }
    thumbs.innerHTML=h;
    thumbs.querySelectorAll('.ag-thumb').forEach(function(t){
      t.addEventListener('click',function(){ agSet(parseInt(t.getAttribute('data-i'),10)); });
    });
    for(var p=0;p<N;p++){ var im=new Image(); im.src=src(p); }
  }
  function build(){
    ov=document.getElementById('ag-overlay');
    img=document.getElementById('ag-img');
    cap=document.getElementById('ag-caption');
    cnt=document.getElementById('ag-count');
    prev=document.getElementById('ag-prev');
    next=document.getElementById('ag-next');
    thumbs=document.getElementById('ag-thumbs');
    if(wired) return; wired=true;
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
    // .webp 를 못 받으면 원본 .jpg 로 (그림이 안 뜨는 것보다 낫다)
    tmp.onerror=function(){ img.src=toJpg(src(i)); img.style.opacity='1'; };
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
    useLang(curLang());
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
