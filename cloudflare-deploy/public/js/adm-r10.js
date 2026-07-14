// ═══════════════════════════════════════════════════════════════
// adm-r10.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
/* 📢 팝업 관리 — 관리자 편집기 (직관형 재작성 · 이미지 드래그앤드롭 · 기본 위치 왼쪽위) */
(function(){
  if(window.__popAdminInit) return; window.__popAdminInit=true;
  var API='/api/admin/popups';
  var cache=[], editingId=null;
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function tsToLocal(ts){ if(!ts) return ''; var d=new Date(Number(ts)); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes()); }
  function localToTs(v){ if(!v) return null; var t=new Date(v).getTime(); return isNaN(t)?null:t; }
  var POSLABEL={tl:'왼쪽 위',tr:'오른쪽 위',bl:'왼쪽 아래',br:'오른쪽 아래',center:'중앙',top:'상단 중앙',bottom:'하단 중앙'};

  // ───────── 목록 ─────────
  async function loadList(){
    var box=$('pop-list-table'); if(!box) return;
    box.innerHTML='<div style="padding:18px;color:#6b7280;font-size:13px">불러오는 중…</div>';
    try{
      var r=await fetch(API,{credentials:'include'}); var d=await r.json();
      cache=(d&&d.rows)||[]; renderList();
    }catch(e){ box.innerHTML='<div style="padding:18px;color:#ef4444">목록을 불러오지 못했어요: '+esc(e&&e.message||e)+'</div>'; }
  }
  function setStats(){
    var line=$('pop-stats-line'); if(!line) return;
    var now=Date.now();
    var on=cache.filter(function(p){return p.enabled && (!p.start_at||p.start_at<=now) && (!p.end_at||p.end_at>=now);}).length;
    line.textContent='전체 '+cache.length+'개 · 노출중 '+on+'개';
  }
  function renderList(){
    var box=$('pop-list-table'); if(!box) return;
    if(!cache.length){ box.innerHTML='<div style="padding:26px;text-align:center;color:#9ca3af;font-size:13px">아직 팝업이 없어요.<br><b style="color:#10b981">＋ 새 팝업 만들기</b> 버튼으로 시작해 보세요.</div>'; setStats(); return; }
    var now=Date.now();
    var bs='padding:5px 9px;font-size:11.5px;font-weight:700;border:0;border-radius:6px;cursor:pointer;margin-right:4px';
    var h='<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:640px"><thead><tr style="background:#f3f4f6;text-align:left;color:#374151">'
      +'<th style="padding:9px 10px">상태</th><th style="padding:9px 10px">제목</th><th style="padding:9px 10px">위치/크기</th><th style="padding:9px 10px">노출 기간</th><th style="padding:9px 10px">노출/클릭</th><th style="padding:9px 10px">관리</th></tr></thead><tbody>';
    cache.forEach(function(p){
      var active = p.enabled && (!p.start_at||p.start_at<=now) && (!p.end_at||p.end_at>=now);
      var badge = p.enabled ? (active?'<span style="color:#059669;font-weight:800">● 노출중</span>':'<span style="color:#d97706;font-weight:800">● 대기/만료</span>') : '<span style="color:#9ca3af;font-weight:700">○ 꺼짐</span>';
      var period = (p.start_at?new Date(p.start_at).toLocaleDateString('ko-KR'):'지금')+' ~ '+(p.end_at?new Date(p.end_at).toLocaleDateString('ko-KR'):'무기한');
      var thumb = p.image_url ? '<img src="'+esc(p.image_url)+'" style="width:26px;height:26px;object-fit:cover;border-radius:5px;vertical-align:middle;margin-right:6px">' : (p.video_url?'🎬 ':'📝 ');
      h+='<tr style="border-top:1px solid #eee">'
        +'<td style="padding:9px 10px">'+badge+'</td>'
        +'<td style="padding:9px 10px;font-weight:600">'+thumb+esc(p.title)+'</td>'
        +'<td style="padding:9px 10px">'+(POSLABEL[p.position]||p.position||'-')+'<br><span style="color:#9ca3af">'+(p.width||'-')+'×'+(p.height||'-')+'</span></td>'
        +'<td style="padding:9px 10px;color:#6b7280">'+esc(period)+'</td>'
        +'<td style="padding:9px 10px">'+(p.view_count||0)+' / '+(p.click_count||0)+'</td>'
        +'<td style="padding:9px 10px;white-space:nowrap">'
          +'<button onclick="popOpenEditor('+p.id+')" style="'+bs+';background:#6366f1;color:#fff">수정</button>'
          +'<button onclick="popToggle('+p.id+','+(p.enabled?0:1)+')" style="'+bs+';background:'+(p.enabled?'#f59e0b':'#10b981')+';color:#fff">'+(p.enabled?'끄기':'켜기')+'</button>'
          +'<button onclick="popDelete('+p.id+')" style="'+bs+';background:#ef4444;color:#fff">삭제</button>'
        +'</td></tr>';
    });
    h+='</tbody></table>';
    box.innerHTML=h; setStats();
  }

  // ───────── 편집기 폼 ─────────
  function field(label,inner,hint){
    return '<div style="margin-bottom:14px"><label style="display:block;font-size:12.5px;font-weight:700;color:#374151;margin-bottom:5px">'+label+'</label>'+inner+(hint?'<div style="font-size:11px;color:#9ca3af;margin-top:4px">'+hint+'</div>':'')+'</div>';
  }
  var INP='width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;box-sizing:border-box';
  function formHtml(p){
    var dis=(p.dismiss_options||'today,3days,7days').split(',');
    function chk(v){ return dis.indexOf(v)>=0?' checked':''; }
    function posOpt(v){ return '<option value="'+v+'"'+(p.position===v?' selected':'')+'>'+POSLABEL[v]+'</option>'; }
    return ''
      + field('제목 <span style="color:#ef4444">*</span>', '<input id="pop-f-title" style="'+INP+'" value="'+esc(p.title||'')+'" placeholder="예: 6월 정기 휴원 안내">')
      + '<div style="background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;padding:14px;margin-bottom:14px">'
      +   '<div style="font-weight:800;font-size:12.5px;color:#1f2937;margin-bottom:10px">🖼 이미지</div>'
      +   '<div id="pop-img-drop" style="border:2px dashed #c7d2fe;border-radius:10px;padding:18px;text-align:center;cursor:pointer;background:#fff;transition:.15s">'
      +     '<div id="pop-img-preview-wrap" style="'+(p.image_url?'':'display:none;')+'margin-bottom:10px"><img id="pop-img-preview" src="'+esc(p.image_url||'')+'" style="max-width:100%;max-height:160px;border-radius:8px"></div>'
      +     '<div style="font-size:12.5px;color:#6366f1;font-weight:700">여기로 이미지를 끌어다 놓거나 클릭해서 선택</div>'
      +     '<div style="font-size:11px;color:#9ca3af;margin-top:3px">JPG·PNG·GIF·WebP (최대 30MB)</div>'
      +     '<div id="pop-img-status" style="font-size:11.5px;color:#10b981;margin-top:6px"></div>'
      +     '<input id="pop-img-file" type="file" accept="image/*" style="display:none">'
      +   '</div>'
      +   '<input id="pop-f-image" style="'+INP+';margin-top:8px" value="'+esc(p.image_url||'')+'" placeholder="또는 이미지 URL 직접 입력">'
      + '</div>'
      + field('🎬 동영상 URL (선택)', '<input id="pop-f-video" style="'+INP+'" value="'+esc(p.video_url||'')+'" placeholder="YouTube 링크 또는 mp4 주소">', 'YouTube 링크를 넣으면 자동으로 임베드됩니다.')
      + field('🔗 클릭 시 이동할 링크 (선택)', '<input id="pop-f-link" style="'+INP+'" value="'+esc(p.link_url||'')+'" placeholder="https://… (다른 페이지/브라우저로 이동)">', '학생이 팝업을 클릭하면 이 주소로 이동해요. 외부 사이트는 새 탭으로 열립니다.')
      + field('버튼 문구 (선택)', '<input id="pop-f-linktext" style="'+INP+'" value="'+esc(p.link_text||'')+'" placeholder="예: 자세히 보기">')
      + field('본문 내용 (선택, HTML 가능)', '<textarea id="pop-f-body" style="'+INP+';min-height:70px;resize:vertical" placeholder="이미지/영상 없이 글만 보여줄 때 사용">'+esc(p.body_html||'')+'</textarea>')
      + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
      +   '<div style="flex:1;min-width:150px">'+field('위치', '<select id="pop-f-pos" style="'+INP+'">'+posOpt('tl')+posOpt('tr')+posOpt('bl')+posOpt('br')+posOpt('center')+posOpt('top')+posOpt('bottom')+'</select>', '기본값은 화면 왼쪽 위예요.')+'</div>'
      +   '<div style="width:90px">'+field('가로(px)', '<input id="pop-f-w" type="number" style="'+INP+'" value="'+(p.width||320)+'">')+'</div>'
      +   '<div style="width:90px">'+field('세로(px)', '<input id="pop-f-h" type="number" style="'+INP+'" value="'+(p.height||420)+'">')+'</div>'
      + '</div>'
      + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
      +   '<div style="flex:1;min-width:160px">'+field('노출 시작 (선택)', '<input id="pop-f-start" type="datetime-local" style="'+INP+'" value="'+tsToLocal(p.start_at)+'">')+'</div>'
      +   '<div style="flex:1;min-width:160px">'+field('노출 종료 (선택)', '<input id="pop-f-end" type="datetime-local" style="'+INP+'" value="'+tsToLocal(p.end_at)+'">')+'</div>'
      +   '<div style="width:100px">'+field('우선순위', '<input id="pop-f-prio" type="number" style="'+INP+'" value="'+(p.priority||0)+'">')+'</div>'
      + '</div>'
      + field('"안 보기" 옵션', '<label style="margin-right:14px;font-size:12.5px"><input type="checkbox" class="pop-f-dismiss" value="today"'+chk('today')+'> 오늘 하루</label>'
          +'<label style="margin-right:14px;font-size:12.5px"><input type="checkbox" class="pop-f-dismiss" value="3days"'+chk('3days')+'> 3일간</label>'
          +'<label style="margin-right:14px;font-size:12.5px"><input type="checkbox" class="pop-f-dismiss" value="7days"'+chk('7days')+'> 7일간</label>'
          +'<label style="font-size:12.5px"><input type="checkbox" class="pop-f-dismiss" value="30days"'+chk('30days')+'> 30일간</label>')
      + '<div style="margin-top:6px"><label style="font-size:13.5px;font-weight:700;color:#059669"><input type="checkbox" id="pop-f-enabled"'+(p.enabled===0?'':' checked')+'> 지금 바로 노출(활성화)</label></div>';
  }

  function wireForm(){
    var drop=$('pop-img-drop'), file=$('pop-img-file'), urlInp=$('pop-f-image');
    if(!drop) return;
    drop.addEventListener('click', function(e){ if(e.target!==urlInp) file.click(); });
    drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.style.background='#eef2ff'; drop.style.borderColor='#6366f1'; });
    drop.addEventListener('dragleave', function(){ drop.style.background='#fff'; drop.style.borderColor='#c7d2fe'; });
    drop.addEventListener('drop', function(e){ e.preventDefault(); drop.style.background='#fff'; drop.style.borderColor='#c7d2fe'; if(e.dataTransfer.files&&e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]); });
    file.addEventListener('change', function(){ if(file.files&&file.files[0]) uploadFile(file.files[0]); });
    urlInp.addEventListener('input', function(){ setPreview(urlInp.value); });
  }
  function setPreview(u){
    var wrap=$('pop-img-preview-wrap'), img=$('pop-img-preview');
    if(u){ img.src=u; wrap.style.display='block'; } else { wrap.style.display='none'; }
  }
  async function uploadFile(f){
    var st=$('pop-img-status'); st.style.color='#6366f1'; st.textContent='업로드 중… '+f.name;
    try{
      var fd=new FormData(); fd.append('file', f);
      var r=await fetch(API+'/upload-media',{method:'POST',credentials:'include',body:fd});
      var d=await r.json();
      if(d&&d.ok&&d.url){ $('pop-f-image').value=d.url; setPreview(d.url); st.style.color='#10b981'; st.textContent='✓ 업로드 완료'; }
      else { st.style.color='#ef4444'; st.textContent='업로드 실패: '+esc(d&&d.error||'unknown'); }
    }catch(e){ st.style.color='#ef4444'; st.textContent='업로드 오류: '+esc(e&&e.message||e); }
  }

  function readForm(){
    var dis=[]; Array.prototype.forEach.call(document.querySelectorAll('.pop-f-dismiss'),function(c){ if(c.checked) dis.push(c.value); });
    return {
      title: ($('pop-f-title').value||'').trim(),
      content_type:'mixed',
      image_url: ($('pop-f-image').value||'').trim()||null,
      video_url: ($('pop-f-video').value||'').trim()||null,
      link_url: ($('pop-f-link').value||'').trim()||null,
      link_text: ($('pop-f-linktext').value||'').trim()||null,
      body_html: ($('pop-f-body').value||'').trim()||null,
      position: $('pop-f-pos').value||'tl',
      width: parseInt($('pop-f-w').value,10)||320,
      height: parseInt($('pop-f-h').value,10)||420,
      start_at: localToTs($('pop-f-start').value),
      end_at: localToTs($('pop-f-end').value),
      priority: parseInt($('pop-f-prio').value,10)||0,
      dismiss_options: dis.join(',')||'today,3days,7days',
      enabled: $('pop-f-enabled').checked
    };
  }

  function openEditor(id){
    editingId = id||null;
    var p = id ? (cache.filter(function(x){return x.id===id;})[0]||{}) : {position:'tl',width:320,height:420,enabled:1,dismiss_options:'today,3days,7days'};
    $('pop-editor-title').textContent = id?'📢 팝업 수정':'📢 새 팝업 만들기';
    $('pop-editor-body').innerHTML = formHtml(p);
    wireForm();
    $('pop-editor-overlay').style.display='block';
  }
  function closeEditor(){ $('pop-editor-overlay').style.display='none'; previewClose(); }

  async function save(){
    var data=readForm();
    if(!data.title){ alert('제목을 입력해 주세요.'); return; }
    var btn=$('pop-save-btn'); var old=btn.textContent; btn.disabled=true; btn.textContent='저장 중…';
    try{
      var url = editingId ? (API+'/'+editingId) : API;
      var r=await fetch(url,{method:editingId?'PUT':'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      var d=await r.json();
      if(d&&d.ok){ closeEditor(); await loadList(); }
      else alert('저장 실패: '+(d&&d.error||'알 수 없는 오류'));
    }catch(e){ alert('저장 오류: '+(e&&e.message||e)); }
    finally{ btn.disabled=false; btn.textContent=old; }
  }

  // ───────── 미리보기 ─────────
  function ytId(u){ var m=String(u).match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/); return m?m[1]:null; }
  function previewClose(){ var l=$('pop-preview-layer'); if(l) l.remove(); }
  function preview(){
    previewClose();
    var d=readForm();
    var posCss={tl:'top:16px;left:16px',tr:'top:16px;right:16px',bl:'bottom:16px;left:16px',br:'bottom:16px;right:16px',center:'top:50%;left:50%;transform:translate(-50%,-50%)',top:'top:16px;left:50%;transform:translateX(-50%)',bottom:'bottom:16px;left:50%;transform:translateX(-50%)'}[d.position]||'top:16px;left:16px';
    var media='';
    if(d.image_url) media+='<img src="'+esc(d.image_url)+'" style="display:block;width:100%;border-radius:8px;margin-bottom:8px">';
    if(d.video_url){ var yid=ytId(d.video_url); media+= yid?('<iframe width="100%" height="180" src="https://www.youtube.com/embed/'+yid+'" frameborder="0" allowfullscreen style="border-radius:8px;margin-bottom:8px"></iframe>'):('<video src="'+esc(d.video_url)+'" controls style="width:100%;border-radius:8px;margin-bottom:8px"></video>'); }
    if(d.body_html) media+='<div style="font-size:13px;line-height:1.6;color:#e5e7eb;margin-bottom:8px">'+d.body_html+'</div>';
    if(d.link_url) media+='<a href="'+esc(d.link_url)+'" target="_blank" style="display:inline-block;margin-top:4px;padding:8px 14px;background:#f59e0b;color:#1f2937;font-weight:800;border-radius:8px;text-decoration:none">'+esc(d.link_text||'자세히 보기')+'</a>';
    var lay=document.createElement('div');
    lay.id='pop-preview-layer';
    lay.style.cssText='position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,0.45)';
    lay.innerHTML='<div style="position:absolute;'+posCss+';width:'+d.width+'px;max-width:92vw;background:#0f172a;border:1.5px solid rgba(251,191,36,.5);border-radius:14px;box-shadow:0 24px 70px -10px rgba(0,0,0,.7);overflow:hidden">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:rgba(251,191,36,.14)"><b style="font-size:13px;color:#fde68a">'+esc(d.title||'(제목 없음)')+'</b><button onclick="popPreviewClose()" style="background:rgba(255,255,255,.15);border:0;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer">✕</button></div>'
      +'<div style="padding:12px;max-height:70vh;overflow:auto">'+media+'</div>'
      +'<div style="text-align:center;padding:6px;font-size:10.5px;color:#64748b">미리보기 — 실제 학생 화면과 유사하게 표시됩니다</div></div>';
    lay.addEventListener('click', function(e){ if(e.target===lay) previewClose(); });
    document.body.appendChild(lay);
  }

  // ───────── 공개 API ─────────
  window.popLoadList=loadList;
  window.popOpenEditor=openEditor;
  window.popSave=save;
  window.popPreview=preview;
  window.popPreviewClose=previewClose;
  window.popCloseEditor=closeEditor;
  window.popDelete=async function(id){ if(!confirm('이 팝업을 삭제할까요? 되돌릴 수 없어요.'))return; try{ await fetch(API+'/'+id,{method:'DELETE',credentials:'include'}); await loadList(); }catch(e){ alert('삭제 실패: '+(e&&e.message||e)); } };
  window.popToggle=async function(id,en){ try{ await fetch(API+'/'+id,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!!en})}); await loadList(); }catch(e){ alert('변경 실패: '+(e&&e.message||e)); } };

  // 카드 펼칠 때 자동 로드
  var card=document.getElementById('card-popups-mgmt');
  if(card){ card.addEventListener('toggle', function(){ if(card.open && !cache.length) loadList(); }); if(card.open) loadList(); }
})();
