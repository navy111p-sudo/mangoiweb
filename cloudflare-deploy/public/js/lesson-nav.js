/* ════════════════════════════════════════════════════════════════════════
   📚 MangoiLessonNav — 모든 학생게임 공용 '교재 선택 + 진도(레슨) 예습·복습'
   - /api/games/lessons 에서 전체 교재(코스) 목록 + 선택 코스의 레슨별 문장/단어 로드
   - [교재 선택 ▼] + ◀복습 / ▶예습 스텝퍼 렌더 → 선택 레슨 문장을 게임에 전달(onSet)
   - 로그인 학생 배정 교재가 있으면 기본 선택(⭐ 내 교재). 아니어도 아무 교재나 골라 플레이.
   - 데이터 없으면 onSet(null) → 게임 내장 기본 문장 폴백
   사용:
     MangoiLessonNav.mount({ glang:'en'|'zh', mount:<div>, onSet:function(sets, info){...} });
     · sets = [{w:[단어...], ko:'뜻', py:'병음'}] (게임 SETS 형식) 또는 null(내장 사용)
     · info = { course, seq, title, idx, total, myCourse, words:[{en,ko?,pinyin?}] }
   ════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if (window.MangoiLessonNav) return;

  try{
    var st=document.createElement('style');
    st.textContent =
      '.lnav-wrap{display:flex;flex-direction:column;align-items:center;gap:5px;margin:5px 0 2px}'+
      '.lnav-book{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}'+
      '.lnav-book label{font-size:12px;color:#8aa0b8;font-weight:800}'+
      '.lnav-sel{max-width:230px;padding:7px 10px;border-radius:10px;font-size:13px;font-weight:800;'+
      'border:2px solid rgba(140,165,195,.4);background:#0f1a26;color:#eaf3ff;cursor:pointer}'+
      '.lnav{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}'+
      '.lnav-btn{padding:7px 15px;border-radius:11px;font-size:14px;font-weight:800;cursor:pointer;'+
      'border:2px solid rgba(140,165,195,.4);background:rgba(20,32,46,.8);color:#ffe08a;transition:.12s}'+
      '.lnav-btn:active{transform:scale(.93)} .lnav-btn:disabled{opacity:.4;cursor:default}'+
      '.lnav-label{min-width:150px;max-width:240px;text-align:center;font-size:13px;font-weight:800;color:#cfe0f0;line-height:1.25}'+
      '.lnav-label b{color:#7fd1ff} .lnav-pos{color:#8aa0b8;font-size:12px;font-weight:700}'+
      '.lnav-mine{display:inline-block;font-size:11px;color:#a3e635;font-weight:800;margin-left:4px}'+
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
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  var NS = window.MangoiLessonNav = {};
  NS.mount = function(opts){
    opts = opts || {};
    var glang = (opts.glang==='zh') ? 'zh' : 'en';
    var host  = opts.mount;
    var onSet = opts.onSet || function(){};
    var S = { courses:[], course:'', myCourse:'', lessons:[], idx:0 };
    if(host) host.innerHTML='';

    function api(course, cb){
      var url='/api/games/lessons?glang='+glang + (uid()?'&user_id='+encodeURIComponent(uid()):'') + (course?'&course='+encodeURIComponent(course):'');
      fetch(url).then(function(r){ return r.json(); }).then(cb).catch(function(){ cb(null); });
    }
    // 시작 교재 = 저장값 → (서버가 배정/기본 반환)
    var saved=''; try{ saved=localStorage.getItem('mangoi_course_'+glang)||''; }catch(_){}
    api(saved, function(d){
      if(!d || !d.ok || !d.courses || !d.courses.length){
        if(host) host.innerHTML='<div class="lnav-empty">📚 이 언어는 교재 데이터가 아직 없어 기본 문장으로 진행합니다</div>';
        onSet(null, {empty:true}); return;
      }
      S.courses=d.courses; S.course=d.course||''; S.myCourse=d.myCourse||''; S.lessons=d.lessons||[];
      render(); restoreLessonIdx(); apply();
    });

    function loadCourse(course){
      api(course, function(d){
        if(!d || !d.ok){ return; }
        S.course=d.course||course; S.myCourse=d.myCourse||S.myCourse; S.lessons=d.lessons||[];
        try{ localStorage.setItem('mangoi_course_'+glang, S.course); }catch(_){}
        restoreLessonIdx(); syncSel(); apply();
      });
    }
    function restoreLessonIdx(){
      var savedSeq=0; try{ savedSeq=parseInt(localStorage.getItem('mangoi_lesson_seq_'+glang+'_'+S.course)||'0',10)||0; }catch(_){}
      var f=-1; for(var i=0;i<S.lessons.length;i++){ if(S.lessons[i].seq===savedSeq){ f=i; break; } }
      S.idx = f>=0 ? f : 0;
    }
    function apply(){
      var L=S.lessons[S.idx];
      if(!L){ onSet(null,{empty:true}); renderLabel(); return; }
      try{ localStorage.setItem('mangoi_lesson_seq_'+glang+'_'+S.course, String(L.seq)); }catch(_){}
      var sets=(L.sentences||[]).map(function(s){
        var w=(s.words&&s.words.length)?s.words.slice():String(s.en||'').split(/\s+/).filter(Boolean);
        return { w:w, ko:s.ko||'', py:s.pinyin||'' };
      });
      onSet(sets.length?sets:null, { course:S.course, seq:L.seq, title:L.title||'', idx:S.idx, total:S.lessons.length, myCourse:S.myCourse, words:L.words||[] });
      renderLabel();
    }
    function go(delta){ var n=S.idx+delta; if(n<0)n=0; if(n>=S.lessons.length)n=S.lessons.length-1; if(n===S.idx)return; S.idx=n; apply(); }

    var selEl, labelEl, prevEl, nextEl;
    function render(){
      if(!host) return; host.innerHTML='';
      var wrap=document.createElement('div'); wrap.className='lnav-wrap';
      // 교재 선택 드롭다운
      var bk=document.createElement('div'); bk.className='lnav-book';
      var lab=document.createElement('label'); lab.textContent='📚 교재';
      selEl=document.createElement('select'); selEl.className='lnav-sel';
      S.courses.forEach(function(c){ var o=document.createElement('option'); o.value=c.course;
        o.textContent=c.course+' ('+c.count+'과)'+(c.course===S.myCourse?' ⭐':''); selEl.appendChild(o); });
      selEl.value=S.course;
      selEl.addEventListener('change', function(){ loadCourse(selEl.value); });
      bk.appendChild(lab); bk.appendChild(selEl); wrap.appendChild(bk);
      // 과 스텝퍼
      var row=document.createElement('div'); row.className='lnav';
      prevEl=document.createElement('button'); prevEl.className='lnav-btn'; prevEl.textContent='◀ 복습'; prevEl.onclick=function(){ go(-1); };
      labelEl=document.createElement('div'); labelEl.className='lnav-label';
      nextEl=document.createElement('button'); nextEl.className='lnav-btn'; nextEl.textContent='예습 ▶'; nextEl.onclick=function(){ go(1); };
      row.appendChild(prevEl); row.appendChild(labelEl); row.appendChild(nextEl); wrap.appendChild(row);
      host.appendChild(wrap); renderLabel();
    }
    function syncSel(){ if(selEl){ selEl.innerHTML=''; S.courses.forEach(function(c){ var o=document.createElement('option'); o.value=c.course;
      o.textContent=c.course+' ('+c.count+'과)'+(c.course===S.myCourse?' ⭐':''); selEl.appendChild(o); }); selEl.value=S.course; } }
    function renderLabel(){ if(!labelEl) return; var L=S.lessons[S.idx];
      if(!L){ labelEl.innerHTML='<span class="lnav-pos">이 교재는 문장이 없어요</span>'; if(prevEl)prevEl.disabled=true; if(nextEl)nextEl.disabled=true; return; }
      var name = (glang==='zh') ? ('Lesson '+L.seq) : (L.title ? esc(L.title) : ('Lesson '+L.seq));
      labelEl.innerHTML = '<b>'+name+'</b> <span class="lnav-pos">('+(S.idx+1)+'/'+S.lessons.length+')</span>'+
        (S.course===S.myCourse ? '<span class="lnav-mine">내 교재</span>' : '');
      if(prevEl) prevEl.disabled=(S.idx<=0);
      if(nextEl) nextEl.disabled=(S.idx>=S.lessons.length-1);
    }
  };
})();
