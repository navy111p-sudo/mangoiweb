// ═══════════════════════════════════════════════════════════════
// adm-r18.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
/* 📚 Phase HW — 숙제 관리: 학원→학생 대상 선택 + 출제/목록 (2026-06-18) */
(function(){
  var HW = { erp: [], byAcademy: {}, academies: [] };
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function acadOf(s){ return (String(s.shop_name||'').trim()) || (String(s.branch1_name||'').trim()) || (String(s.hq_name||'').trim()) || '미지정 학원'; }
  function uidOf(s){ return String(s.student_id||s.login_id||s.user_id||s.username||''); }
  function nameOf(s){ return String(s.username||s.korean_name||s.english_name||s.user_id||'(이름없음)'); }

  async function loadErp(){
    if (HW.erp.length) return HW.erp;
    try{
      var r = await fetch('/api/admin/students/erp-list?limit=2000',{credentials:'include',cache:'no-store'});
      var j = await r.json();
      HW.erp = (j && j.ok && j.items) ? j.items : (j.items||[]);
    }catch(e){ HW.erp = []; }
    HW.byAcademy = {};
    HW.erp.forEach(function(s){
      var a = acadOf(s);
      (HW.byAcademy[a] = HW.byAcademy[a] || []).push(s);
    });
    HW.academies = Object.keys(HW.byAcademy).sort();
    return HW.erp;
  }

  window.hwOpenForm = async function(){
    document.getElementById('hw-title').value='';
    document.getElementById('hw-desc').value='';
    document.getElementById('hw-due').value='';
    document.getElementById('hw-type').value='text';
    var modal = document.getElementById('hw-modal');
    modal.style.display='flex';
    var sel = document.getElementById('hw-academy');
    sel.innerHTML = '<option value="__ALL__">🏫 전체 학원 (모든 학생)</option><option disabled>불러오는 중…</option>';
    await loadErp();
    var opts = ['<option value="__ALL__">🏫 전체 학원 (모든 학생) · '+HW.erp.length+'명</option>'];
    HW.academies.forEach(function(a){
      opts.push('<option value="'+esc(a)+'">'+esc(a)+' · '+HW.byAcademy[a].length+'명</option>');
    });
    sel.innerHTML = opts.join('');
    document.getElementById('hw-student-area').style.display='none';
    document.getElementById('hw-target-summary').textContent='';
  };
  window.hwCloseForm = function(){ document.getElementById('hw-modal').style.display='none'; };

  window.hwOnAcademyChange = function(){
    var a = document.getElementById('hw-academy').value;
    var area = document.getElementById('hw-student-area');
    if (a === '__ALL__'){ area.style.display='none'; hwUpdateSummary(); return; }
    area.style.display='block';
    document.getElementById('hw-all-students').checked = true;
    var list = HW.byAcademy[a] || [];
    var html = list.map(function(s){
      var id = esc(uidOf(s)), nm = esc(nameOf(s));
      return '<label style="display:flex;align-items:center;gap:7px;padding:3px 2px;cursor:pointer;">'
        +'<input type="checkbox" class="hw-stu-cb" value="'+id+'" data-name="'+nm+'" onchange="hwOnStudentToggle()">'
        +'<span>'+nm+' <span style="color:#94a3b8">'+id+'</span></span></label>';
    }).join('') || '<div style="color:#94a3b8">이 학원에 등록된 학생이 없습니다.</div>';
    document.getElementById('hw-students').innerHTML = html;
    hwToggleAllStudents();
  };

  window.hwToggleAllStudents = function(){
    var all = document.getElementById('hw-all-students').checked;
    if (all){ document.querySelectorAll('.hw-stu-cb').forEach(function(c){ c.checked=false; }); }
    hwUpdateSummary();
  };
  window.hwOnStudentToggle = function(){
    var anyChecked = !!document.querySelector('.hw-stu-cb:checked');
    if (anyChecked) document.getElementById('hw-all-students').checked = false;
    hwUpdateSummary();
  };

  function hwTarget(){
    var a = document.getElementById('hw-academy').value;
    if (a === '__ALL__') return { target_type:'all', target_academy:null, ids:[], names:[], count:HW.erp.length, label:'전체 학생 '+HW.erp.length+'명' };
    var checked = Array.prototype.slice.call(document.querySelectorAll('.hw-stu-cb:checked'));
    var allBox = document.getElementById('hw-all-students').checked;
    var total = (HW.byAcademy[a]||[]).length;
    if (allBox || checked.length===0){
      return { target_type:'academy', target_academy:a, ids:[], names:[], count:total, label:a+' 전체 '+total+'명' };
    }
    return {
      target_type:'students', target_academy:a,
      ids: checked.map(function(c){return c.value;}),
      names: checked.map(function(c){return c.getAttribute('data-name');}),
      count: checked.length, label:a+' · 학생 '+checked.length+'명 선택'
    };
  }
  function hwUpdateSummary(){
    var el = document.getElementById('hw-target-summary');
    if (el) el.textContent = '대상: ' + hwTarget().label;
  }

  window.hwSave = async function(){
    var title = document.getElementById('hw-title').value.trim();
    if (!title){ alert('제목을 입력해 주세요.'); return; }
    var t = hwTarget();
    var btn = document.getElementById('hw-save-btn');
    btn.disabled=true; var old=btn.textContent; btn.textContent='저장 중…';
    try{
      var r = await fetch('/api/admin/homework/save',{
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          title: title,
          description: document.getElementById('hw-desc').value.trim(),
          answer_type: document.getElementById('hw-type').value,
          due_date: document.getElementById('hw-due').value || null,
          target_type: t.target_type,
          target_academy: t.target_academy,
          target_student_ids: t.ids,
          target_student_names: t.names,
          target_count: t.count
        })
      });
      var j = await r.json();
      if (j && j.ok){ alert('숙제가 출제되었습니다.\n대상: '+t.label); hwCloseForm(); hwLoadList(); }
      else { alert('출제 실패: '+((j&&j.error)||'알 수 없는 오류')); }
    }catch(e){ alert('출제 중 오류: '+e.message); }
    finally{ btn.disabled=false; btn.textContent=old; }
  };

  var TYPE_LABEL = { text:'주관식', choice:'객관식', voice:'음성', video:'영상' };
  window.hwLoadList = async function(){
    var wrap = document.getElementById('hw-list');
    wrap.innerHTML = '불러오는 중…';
    try{
      var r = await fetch('/api/admin/homework/list?limit=100',{credentials:'include',cache:'no-store'});
      var j = await r.json();
      var items = (j && j.items) || [];
      if (!items.length){ wrap.innerHTML='<span style="color:#94a3b8">아직 출제된 숙제가 없습니다.</span>'; return; }
      wrap.innerHTML = items.map(function(h){
        var tgt = h.target_type==='all' ? ('🏫 전체 학생'+(h.target_count?' '+h.target_count+'명':''))
                : h.target_type==='academy' ? ('🏫 '+esc(h.target_academy||'')+' 전체'+(h.target_count?' '+h.target_count+'명':''))
                : ('👥 '+esc(h.target_academy||'')+' · '+(h.target_count||0)+'명');
        return '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:6px;background:#fff;color:#334155;">'
          +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">'
          +'<b style="font-size:13px">'+esc(h.title)+'</b>'
          +'<button onclick="hwDelete('+h.id+')" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:12px;">삭제</button></div>'
          +'<div style="font-size:11.5px;color:#64748b;margin-top:3px;">'+tgt
          +' · '+(TYPE_LABEL[h.answer_type]||h.answer_type)
          +(h.due_date?(' · 마감 '+esc(h.due_date)):'')+'</div>'
          +(h.description?('<div style="font-size:11.5px;color:#475569;margin-top:4px;">'+esc(h.description)+'</div>'):'')
          +'</div>';
      }).join('');
    }catch(e){ wrap.innerHTML='<span style="color:#ef4444">목록 로드 오류: '+esc(e.message)+'</span>'; }
  };
  window.hwDelete = async function(id){
    if (!confirm('이 숙제를 삭제할까요?')) return;
    try{
      await fetch('/api/admin/homework/'+id,{method:'DELETE',credentials:'include'});
      hwLoadList();
    }catch(e){ alert('삭제 오류: '+e.message); }
  };

  document.addEventListener('click', function(e){
    if (e.target && e.target.id === 'hw-modal') window.hwCloseForm();
  });
})();
