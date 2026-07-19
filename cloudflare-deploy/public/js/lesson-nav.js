/* ════════════════════════════════════════════════════════════════════════
   📚 MangoiLessonNav — 모든 학생게임 공용 '진도(레슨) 네비게이터'
   - /api/games/lessons 에서 로그인 학생 교재의 레슨별 문장을 순서대로 로드
   - ◀ 복습 / ▶ 예습 스텝퍼 렌더 + 선택 레슨의 문장을 게임에 전달(onSet)
   - 레슨 데이터 없으면 onSet(null) → 게임은 내장 기본 문장으로 폴백
   사용:
     MangoiLessonNav.mount({ glang:'en'|'zh', mount:<div>, onSet:function(sets, info){...} });
     · sets = [{w:[단어...], ko:'뜻', py:'병음'}]  (게임 SETS 형식과 호환) 또는 null(내장 사용)
   ════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if (window.MangoiLessonNav) return;

  // 공용 스타일 1회 주입
  try{
    var st=document.createElement('style');
    st.textContent =
      '.lnav{display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 0 2px;flex-wrap:wrap}'+
      '.lnav-btn{padding:8px 16px;border-radius:11px;font-size:14px;font-weight:800;cursor:pointer;'+
      'border:2px solid rgba(140,165,195,.4);background:rgba(20,32,46,.8);color:#ffe08a;transition:.12s}'+
      '.lnav-btn:active{transform:scale(.93)} .lnav-btn:disabled{opacity:.4;cursor:default}'+
      '.lnav-label{min-width:150px;text-align:center;font-size:14px;font-weight:800;color:#cfe0f0;line-height:1.25}'+
      '.lnav-label b{color:#7fd1ff} .lnav-pos{color:#8aa0b8;font-size:12px;font-weight:700}'+
      '.lnav-cur{display:block;font-size:11px;color:#a3e635;font-weight:800;margin-top:1px}'+
      '.lnav-empty{font-size:12px;color:#8aa0b8;text-align:center;margin:4px 0}';
    document.head.appendChild(st);
  }catch(_){}

  function uid(){
    var keys=['mangoi_logged_user','mango_user','mangoi_user','mangoi_admin_session'];
    for(var i=0;i<keys.length;i++){ try{ var v=JSON.parse(localStorage.getItem(keys[i])||'null');
      if(v){ var id=v.user_id||v.userId||v.id||v.uid||''; if(id) return String(id).trim(); } }catch(_){} }
    try{ var q=new URLSearchParams(location.search); if(q.get('uid')) return q.get('uid'); }catch(_){}
    return '';
  }

  var NS = window.MangoiLessonNav = {};
  NS.mount = function(opts){
    opts = opts || {};
    var glang = (opts.glang==='zh') ? 'zh' : 'en';
    var host  = opts.mount;
    var onSet = opts.onSet || function(){};
    var state = { lessons:[], idx:0, textbook:'', assigned:false, curNo:0 };
    if(host) host.innerHTML='';

    var url = '/api/games/lessons?glang='+glang + (uid()? '&user_id='+encodeURIComponent(uid()) : '');
    fetch(url).then(function(r){ return r.json(); }).then(function(d){
      if(!d || !d.ok || !d.lessons || !d.lessons.length){
        if(host) host.innerHTML='<div class="lnav-empty">📚 이 언어는 교재 레슨 데이터가 아직 없어 기본 문장으로 진행합니다</div>';
        onSet(null, {empty:true}); return;
      }
      state.lessons = d.lessons; state.textbook = d.textbook||''; state.assigned = !!d.assigned;
      // '현재 진도' = 저장된 마지막 레슨(없으면 첫 레슨)
      var savedNo = parseInt(localStorage.getItem('mangoi_lesson_no_'+glang)||'0',10)||0;
      state.curNo = savedNo || state.lessons[0].lesson_no;
      var found=-1; for(var i=0;i<state.lessons.length;i++){ if(state.lessons[i].lesson_no===savedNo){ found=i; break; } }
      state.idx = found>=0 ? found : 0;
      render(); apply(false);
    }).catch(function(){ onSet(null, {empty:true}); });

    function apply(persist){
      var L = state.lessons[state.idx]; if(!L){ onSet(null,{empty:true}); return; }
      if(persist!==false){ try{ localStorage.setItem('mangoi_lesson_no_'+glang, String(L.lesson_no)); }catch(_){} state.curNo=L.lesson_no; }
      var sets = L.sentences.map(function(s){
        var w = (s.words && s.words.length) ? s.words.slice() : String(s.en||'').split(/\s+/).filter(Boolean);
        return { w:w, ko:s.ko||'', py:s.pinyin||'' };
      });
      onSet(sets, { lesson_no:L.lesson_no, textbook:state.textbook, idx:state.idx, total:state.lessons.length, assigned:state.assigned });
      renderLabel();
    }
    function go(delta){ var n=state.idx+delta; if(n<0)n=0; if(n>=state.lessons.length)n=state.lessons.length-1; if(n===state.idx)return; state.idx=n; apply(true); }

    var labelEl, prevEl, nextEl;
    function render(){
      if(!host) return; host.innerHTML='';
      var wrap=document.createElement('div'); wrap.className='lnav';
      prevEl=document.createElement('button'); prevEl.className='lnav-btn'; prevEl.textContent='◀ 복습'; prevEl.onclick=function(){ go(-1); };
      labelEl=document.createElement('div'); labelEl.className='lnav-label';
      nextEl=document.createElement('button'); nextEl.className='lnav-btn'; nextEl.textContent='예습 ▶'; nextEl.onclick=function(){ go(1); };
      wrap.appendChild(prevEl); wrap.appendChild(labelEl); wrap.appendChild(nextEl); host.appendChild(wrap);
      renderLabel();
    }
    function renderLabel(){ if(!labelEl) return; var L=state.lessons[state.idx];
      var isCur = L && L.lesson_no===state.curNo && state.assigned;
      labelEl.innerHTML = '<b>'+(state.textbook||'교재')+'</b> · Lesson '+(L?L.lesson_no:'-')+
        ' <span class="lnav-pos">('+(state.idx+1)+'/'+state.lessons.length+')</span>'+
        (isCur ? '<span class="lnav-cur">⭐ 현재 진도</span>' : '');
      if(prevEl) prevEl.disabled = (state.idx<=0);
      if(nextEl) nextEl.disabled = (state.idx>=state.lessons.length-1);
    }
  };
})();
