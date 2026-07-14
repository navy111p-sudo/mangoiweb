// ═══════════════════════════════════════════════════════════════
// adm-s7.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__posterAdminInit) return; window.__posterAdminInit=true;
  var API='/api/admin/posters';
  var cache=[], pendingLoad=null;
  function $(id){return document.getElementById(id);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function pad(n){return String(n).padStart(2,'0');}
  function fmt(ts){if(!ts)return'-';var d=new Date(Number(ts));return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());}

  async function loadList(){
    var box=$('poster-list'); if(!box)return;
    box.innerHTML='<div style="padding:18px;color:#6b7280;font-size:13px">불러오는 중…</div>';
    try{
      var r=await fetch(API,{credentials:'include'}); var d=await r.json();
      cache=(d&&d.rows)||[]; renderList();
    }catch(e){ box.innerHTML='<div style="padding:18px;color:#ef4444">목록을 불러오지 못했어요: '+esc(e&&e.message||e)+'</div>'; }
  }
  window.posterLoadList=loadList;

  function thumb(cfg){
    var bg = cfg.bgImg ? 'url('+cfg.bgImg+') center/cover' : 'linear-gradient(135deg,'+(cfg.cA||'#ec4899')+','+(cfg.cB||'#8b5cf6')+')';
    var h=Math.max(28,Math.min(72,Math.round(48*((cfg.h||1080)/(cfg.w||1080)))));
    return '<div style="width:48px;height:'+h+'px;border-radius:6px;background:'+bg+';color:'+(cfg.cT||'#fff')+';font-size:6px;line-height:1.1;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;padding:2px;box-shadow:0 1px 3px rgba(0,0,0,.2)">'+esc((cfg.title||'').slice(0,14))+'</div>';
  }
  function renderList(){
    var box=$('poster-list'); if(!box)return;
    var line=$('poster-stats-line'); if(line)line.textContent='전체 '+cache.length+'개';
    if(!cache.length){ box.innerHTML='<div style="padding:26px;text-align:center;color:#9ca3af;font-size:13px">아직 저장한 포스터가 없어요.<br><b style="color:#ec4899">＋ 새 포스터 만들기</b>로 시작해 보세요.</div>'; return; }
    var bs='padding:5px 9px;font-size:11.5px;font-weight:700;border:0;border-radius:6px;cursor:pointer;margin-right:4px';
    var h='<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:660px"><thead><tr style="background:#f3f4f6;text-align:left;color:#374151">'
      +'<th style="padding:9px 10px">미리보기</th><th style="padding:9px 10px">이름</th><th style="padding:9px 10px">크기</th><th style="padding:9px 10px">만든 날짜</th><th style="padding:9px 10px">수정 날짜</th><th style="padding:9px 10px">관리</th></tr></thead><tbody>';
    cache.forEach(function(p){
      var cfg={}; try{cfg=JSON.parse(p.config||'{}');}catch(e){}
      h+='<tr style="border-bottom:1px solid #eee">'
        +'<td style="padding:8px 10px">'+thumb(cfg)+'</td>'
        +'<td style="padding:8px 10px;font-weight:700;color:#111">'+esc(p.title)+'</td>'
        +'<td style="padding:8px 10px;color:#6b7280">'+(p.width||'?')+'×'+(p.height||'?')+'</td>'
        +'<td style="padding:8px 10px;color:#6b7280">'+fmt(p.created_at)+'</td>'
        +'<td style="padding:8px 10px;color:#6b7280">'+fmt(p.updated_at)+'</td>'
        +'<td style="padding:8px 10px;white-space:nowrap">'
          +'<button style="'+bs+'background:#6366f1;color:#fff" onclick="posterEdit('+p.id+')">✏ 불러와 편집</button>'
          +'<button style="'+bs+'background:#ef4444;color:#fff" onclick="posterDelete('+p.id+')">🗑 삭제</button>'
        +'</td></tr>';
    });
    h+='</tbody></table>';
    box.innerHTML=h;
  }

  function openEditor(id){
    var ov=$('poster-editor-overlay'), fr=$('poster-editor-frame'), tt=$('poster-editor-title');
    pendingLoad = id!=null ? (cache.filter(function(x){return x.id===id;})[0]||null) : null;
    if(tt) tt.textContent = pendingLoad ? '🎨 포스터 편집 — '+pendingLoad.title : '🎨 새 포스터 만들기';
    fr.src='/poster-maker.html?embed=1&_t='+Date.now();
    ov.style.display='block';
  }
  window.posterOpenEditor=function(){openEditor(null);};
  window.posterEdit=function(id){openEditor(id);};
  window.posterCloseEditor=function(){var ov=$('poster-editor-overlay');ov.style.display='none';$('poster-editor-frame').src='about:blank';pendingLoad=null;};
  window.posterDelete=async function(id){
    if(!confirm('이 포스터를 삭제할까요?'))return;
    try{ await fetch(API+'/'+id,{method:'DELETE',credentials:'include'}); loadList(); }catch(e){ alert('삭제 실패: '+(e&&e.message||e)); }
  };

  window.addEventListener('message', async function(e){
    var m=e.data||{}; if(!m||!m.type)return;
    var fr=$('poster-editor-frame'); if(!fr)return;
    if(m.type==='poster-ready'){
      if(pendingLoad && fr.contentWindow){
        var cfg={}; try{cfg=JSON.parse(pendingLoad.config||'{}');}catch(_){}
        fr.contentWindow.postMessage({type:'poster-load',config:cfg,title:pendingLoad.title,id:pendingLoad.id},'*');
      }
    } else if(m.type==='poster-save'){
      try{
        var editId = pendingLoad ? pendingLoad.id : null;
        var url = editId ? (API+'/'+editId) : API;
        var r=await fetch(url,{method: editId?'PUT':'POST', credentials:'include', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({title:m.title, width:m.width, height:m.height, config:JSON.stringify(m.config)})});
        var d=await r.json();
        if(!d||d.ok===false){ alert('저장 실패: '+((d&&d.error)||r.status)); return; }
        var newId = editId || d.id;
        pendingLoad = { id:newId, title:m.title, config:JSON.stringify(m.config), width:m.width, height:m.height };
        if(fr.contentWindow) fr.contentWindow.postMessage({type:'poster-saved',id:newId},'*');
        loadList();
      }catch(err){ alert('저장 실패: '+(err&&err.message||err)); }
    } else if(m.type==='poster-publish'){
      try{
        var r=await fetch('/api/admin/popups',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({title:m.title, content_type:'html', body_html:m.html, width:Math.round((m.width||360)*1.7), height:Math.round((m.height||480)*1.7), position:'tl', priority:0, enabled:true, dismiss_options:'today,3days,7days'})});
        var d=await r.json();
        var ok=!(!d||d.ok===false);
        if(fr.contentWindow) fr.contentWindow.postMessage({type:'poster-published',ok:ok},'*');
        if(ok){ try{ if(window.noticeStudioTab) window.noticeStudioTab('publish'); }catch(_){} try{ if(window.popLoadList) window.popLoadList(); }catch(_){} }
      }catch(err){ if(fr.contentWindow) fr.contentWindow.postMessage({type:'poster-published',ok:false},'*'); }
    }
  });

  var card=document.getElementById('card-poster-maker');
  if(card){ card.addEventListener('toggle',function(){ if(card.open && !cache.length) loadList(); }); }
})();
